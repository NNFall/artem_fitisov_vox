require(Modules.OpenAI);
require(Modules.ApplicationStorage);

const ANSWER_DELAY_MS = 3000;
const RINGBACK_COUNTRY = 'RU';
const SUMMARY_REQUEST_TIMEOUT_MS = 15000;
const CLIENT_SILENCE_PROMPT_MS = 5000;
const CLIENT_SILENCE_HANGUP_MS = 40000;
const CLIENT_SILENCE_HANGUP_GRACE_MS = 5500;
const FINALIZE_FORCE_TIMEOUT_MS = 10000;

const SUMMARY_FUNCTION_NAME = 'save_call_summary';

const OPENAI_MODEL = 'gpt-realtime-1.5';
const OPENAI_VOICE = 'marin';
const OPENAI_SPEED = 1.15;
const OPENAI_REASONING_EFFORT = 'medium';
const OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

// gpt-realtime-1.5 public API pricing, USD per 1M tokens.
const AI_PRICE_IN_TEXT = 4.00;
const AI_PRICE_IN_AUDIO = 32.00;
const AI_PRICE_IN_CACHED = 0.40;
const AI_PRICE_OUT_TEXT = 16.00;
const AI_PRICE_OUT_AUDIO = 64.00;
const USD_TO_RUB_RATE = 80;
const WEBSOCKET_PRICE_PER_MINUTE_RUB = 0.50;
const WS_RECONNECT_DELAY_MS = 1200;
const WS_RECONNECT_MAX_ATTEMPTS = 1;
const CALL_RECORD_ENABLED = true;
const BACKEND_URL_FALLBACK = '';

VoxEngine.addEventListener(AppEvents.CallAlerting, async ({ call }) => {
    let openAIRealtimeClient;
    let isSessionTerminated = false;
    let isFinalizing = false;
    let answerTimer = null;
    let summaryWaitTimer = null;
    let summaryWaitDone = null;
    let clientSilencePromptTimer = null;
    let clientSilenceHangupTimer = null;
    let clientSilenceHangupGraceTimer = null;
    let clientSilencePromptAttemptedForCurrentTurn = false;
    let clientSilenceHangupAnnounced = false;
    let earlyMediaStarted = false;

    let backendUrl = '';
    let backendWebhookSecret = '';
    let backendConfigLoaded = false;
    let backendCallStartedSent = false;
    let backendRecordingUrlSent = '';
    let callConnected = false;
    let callConnectedAtUtc = '';
    let sessionIdCache = '';
    let finalizationReason = '';
    let finalizeForceTimer = null;

    let callDurationSec = 0;
    let telephonyCostRub = 0;
    let websocketDurationSec = 0;
    let websocketOpenedAtMs = null;
    let recordingRequested = false;
    let recordingStarted = false;
    let recordingFailed = false;
    let recordingUrl = '';
    let recordingErrorText = '';

    let callerPhone = '';
    try {
        callerPhone = call.callerid ? String(call.callerid() || '') : '';
    } catch (e) {
        callerPhone = '';
    }

    const usageStats = {
        in_text: 0,
        in_cached: 0,
        in_audio: 0,
        in_video: 0,
        in_unknown: 0,
        out_text: 0,
        out_audio: 0,
        out_video: 0,
        out_unknown: 0,
        usage_events: 0
    };

    const dialogue = [];
    let currentUserParts = [];
    let currentAssistantParts = [];

    const summaryData = {
        client_name: '',
        client_phone: '',
        call_goal: '',
        manager_offer: '',
        outcome: '',
        next_step: '',
        summary: ''
    };
    let summaryReceived = false;
    let summaryRequestSent = false;
    let activeOpenAIModel = '';
    let openAISocketAlive = false;
    let callEnded = false;
    let isStartingOpenAI = false;
    let reconnectAttempts = 0;
    let assistantMediaActive = false;
    let assistantTurnCompleteQueued = false;
    let reconnectTimer = null;

    const safeString = (v) => (v === undefined || v === null ? '' : String(v));
    const getCallSessionId = (event) => {
        if (sessionIdCache) return sessionIdCache;

        try {
            if (call) {
                if (typeof call.id === 'function') {
                    sessionIdCache = safeString(call.id());
                } else if (call.id) {
                    sessionIdCache = safeString(call.id);
                }
            }
        } catch (e) {}

        if (!sessionIdCache && event) {
            sessionIdCache = safeString(event.id || event.callId || event.sessionId || '');
        }

        if (!sessionIdCache) {
            sessionIdCache = `vox-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        }

        return sessionIdCache;
    };
    const parseJsonMaybe = (v) => {
        if (typeof v !== 'string') return null;
        try {
            return JSON.parse(v);
        } catch (e) {
            return null;
        }
    };
    const toNumber = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const sendUserTextToModel = (text, tag) => {
        if (!openAIRealtimeClient) {
            throw new Error('openAIRealtimeClient is not initialized');
        }

        const payloadText = safeString(text);
        openAIRealtimeClient.responseCreate({ instructions: payloadText });
        Logger.write(`===OPENAI_RESPONSE_CREATE_SENT:${tag}===`);
        return 'response_create';
    };

    const clearClientSilencePromptTimer = () => {
        if (clientSilencePromptTimer) {
            clearTimeout(clientSilencePromptTimer);
            clientSilencePromptTimer = null;
        }
    };

    const clearClientSilenceHangupTimer = () => {
        if (clientSilenceHangupTimer) {
            clearTimeout(clientSilenceHangupTimer);
            clientSilenceHangupTimer = null;
        }
    };

    const clearClientSilenceHangupGraceTimer = () => {
        if (clientSilenceHangupGraceTimer) {
            clearTimeout(clientSilenceHangupGraceTimer);
            clientSilenceHangupGraceTimer = null;
        }
    };

    const clearClientSilenceWaitTimers = () => {
        clearClientSilencePromptTimer();
        clearClientSilenceHangupTimer();
    };

    const clearClientSilenceTimers = () => {
        clearClientSilenceWaitTimers();
        clearClientSilenceHangupGraceTimer();
    };

    const armClientSilenceAfterTurn = () => {
        if (assistantMediaActive) {
            assistantTurnCompleteQueued = true;
            return;
        }

        scheduleClientSilenceTimers('assistant_turn_complete');
    };

    const scheduleClientSilenceReprompt = (reason) => {
        clearClientSilencePromptTimer();

        if (
            isFinalizing ||
            isSessionTerminated ||
            summaryRequestSent ||
            summaryReceived ||
            !openAIRealtimeClient ||
            !openAISocketAlive ||
            clientSilenceHangupGraceTimer ||
            clientSilenceHangupAnnounced ||
            clientSilencePromptAttemptedForCurrentTurn
        ) {
            return;
        }

        Logger.write(`===CLIENT_SILENCE_REPROMPT_TIMER_SCHEDULED:${reason}===`);
        clientSilencePromptTimer = setTimeout(() => {
            clientSilencePromptTimer = null;

            if (
                isFinalizing ||
                isSessionTerminated ||
                summaryRequestSent ||
                summaryReceived ||
                !openAIRealtimeClient ||
                !openAISocketAlive ||
                clientSilenceHangupGraceTimer ||
                clientSilenceHangupAnnounced
            ) {
                return;
            }

            clientSilencePromptAttemptedForCurrentTurn = true;
            const requestText =
                'Клиент не отвечает или его плохо слышно уже около 5 секунд. Скажи ровно одну короткую фразу: "Повторите громче, пожалуйста." Не добавляй объяснений и не переходи к следующему вопросу.';

            Logger.write('===CLIENT_SILENCE_REPROMPT===');
            try {
                sendUserTextToModel(requestText, 'client_silence_reprompt');
            } catch (e) {
                Logger.write('===CLIENT_SILENCE_REPROMPT_ERROR===');
                Logger.write(String(e));
            }
        }, CLIENT_SILENCE_PROMPT_MS);
    };

    const scheduleClientSilenceHangup = (reason) => {
        if (
            isFinalizing ||
            isSessionTerminated ||
            summaryRequestSent ||
            summaryReceived ||
            !openAIRealtimeClient ||
            !openAISocketAlive ||
            clientSilenceHangupTimer ||
            clientSilenceHangupGraceTimer ||
            clientSilenceHangupAnnounced
        ) {
            return;
        }

        Logger.write(`===CLIENT_SILENCE_HANGUP_TIMER_SCHEDULED:${reason}===`);
        clientSilenceHangupTimer = setTimeout(() => {
            clientSilenceHangupTimer = null;

            if (
                isFinalizing ||
                isSessionTerminated ||
                summaryRequestSent ||
                summaryReceived ||
                !openAIRealtimeClient ||
                !openAISocketAlive
            ) {
                return;
            }

            Logger.write('===CLIENT_SILENCE_HANGUP_PROMPT===');
            try {
                sendUserTextToModel(
                    'Клиент молчит или его не слышно уже около 40 секунд. Скажи ровно одну короткую фразу: "Извините, вас не было слышно. Завершу звонок." Не добавляй объяснений.',
                    'client_silence_hangup'
                );
            } catch (e) {
                Logger.write('===CLIENT_SILENCE_HANGUP_PROMPT_ERROR===');
                Logger.write(String(e));
            }
            clientSilenceHangupAnnounced = true;

            clientSilenceHangupGraceTimer = setTimeout(() => {
                clientSilenceHangupGraceTimer = null;
                if (isFinalizing || isSessionTerminated) return;

                Logger.write('===CLIENT_SILENCE_HANGUP_CALL===');
                try {
                    if (call && typeof call.hangup === 'function') {
                        call.hangup();
                    }
                } catch (e) {
                    Logger.write('===CLIENT_SILENCE_CALL_HANGUP_ERROR===');
                    Logger.write(String(e));
                }

                finalizeSession('client_silence_hangup');
            }, CLIENT_SILENCE_HANGUP_GRACE_MS);
        }, CLIENT_SILENCE_HANGUP_MS);
    };

    const scheduleClientSilenceTimers = (reason) => {
        scheduleClientSilenceReprompt(reason);
        scheduleClientSilenceHangup(reason);
    };


    const normalizeText = (text) =>
        safeString(text)
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;:!?])/g, '$1')
            .trim();

    const sanitizeForSummary = (text) =>
        normalizeText(text)
            .replace(/[^А-Яа-яЁёA-Za-z0-9\s.,!?;:()"%+\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const clipText = (text, maxLen) => {
        const clean = sanitizeForSummary(text);
        if (clean.length <= maxLen) return clean;
        const cut = clean.slice(0, maxLen);
        return cut.replace(/\s+\S*$/, '').trim();
    };

    const normalizeName = (name) => {
        const clean = sanitizeForSummary(name).replace(/[^A-Za-zА-Яа-яЁё\-]/g, '').trim();
        if (!clean) return '';
        return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    };
    const hasReadableWords = (text) => /[A-Za-zА-Яа-яЁё]{3,}/.test(safeString(text));
    const isFillerPhrase = (text) =>
        /^(?:да|угу|ок|окей|хорошо|понял(?:а)?|ладно|ясно|спасибо|da|yes|no|si|ciao|alo|allo)\.?$/i.test(
            safeString(text).trim()
        );
    const extractClientNameFromDialogue = () => {
        let askedNameRecently = false;
        for (let i = 0; i < dialogue.length; i += 1) {
            const item = dialogue[i];
            const text = sanitizeForSummary(item.text);
            if (!text) continue;
            if (item.role === 'assistant') {
                if (/(?:как\s+вас\s+зовут|ваше\s+имя|представьт)/i.test(text)) {
                    askedNameRecently = true;
                }
                continue;
            }
            const direct = text.match(/\bменя\s+зовут\s+([A-Za-zА-Яа-яЁё\-]{2,30})\b/i);
            if (direct && direct[1]) return normalizeName(direct[1]);
            if (askedNameRecently) {
                const candidate = text.match(/\b([A-Za-zА-Яа-яЁё\-]{2,30})\b/);
                if (
                    candidate &&
                    candidate[1] &&
                    !/^(?:да|угу|ок|хорошо|нет|da|yes|no)$/i.test(candidate[1])
                ) {
                    return normalizeName(candidate[1]);
                }
                askedNameRecently = false;
            }
        }
        return '';
    };
    const collectRolePhrases = (role, maxItems, maxItemLen) => {
        const result = [];
        for (let i = 0; i < dialogue.length; i += 1) {
            const item = dialogue[i];
            if (!item || item.role !== role) continue;
            const clean = clipText(sanitizeForSummary(item.text), maxItemLen);
            if (!clean || !hasReadableWords(clean) || isFillerPhrase(clean)) continue;
            result.push(clean);
            if (result.length >= maxItems) break;
        }
        return result;
    };
    const hasMeaningfulClientRequest = () => {
        const requestKeywords =
            /(?:камень|камен|столешниц|подоконник|мойк|остров|стол|камин|лестниц|полиров|реставрац|облицов|панно|полы|стен|санузел|кухн|ванн|хаммам|бассейн|фасад|крыльц|слэб|плит|материал|агломерат|керамик|мрамор|гранит|кварцит|оникс|расч[её]т|рассчит|стоимост|цена|налич|заказ|изготов|замер|шоу-рум|офис|график|работа[ею]те|приехать|партнер|сотруднич|дизайн|архитектор|мебель)/i;
        const purposeQuestion =
            /(?:по\s+какому\s+вопросу|что\s+именно\s+(?:вас\s+)?интересует|что\s+именно\s+хотите|для\s+чего\s+вам|какой\s+запрос)/i;
        const nonRequestShortAnswer =
            /^(?:[А-Яа-яЁёA-Za-z.-]{2,30})(?:\s+[А-Яа-яЁёA-Za-z.-]{2,30})?\.?$/i;

        let purposeAsked = false;
        for (let i = 0; i < dialogue.length; i += 1) {
            const item = dialogue[i];
            if (!item) continue;
            const text = sanitizeForSummary(item.text);
            if (!text) continue;

            if (item.role === 'assistant') {
                if (purposeQuestion.test(text)) purposeAsked = true;
                continue;
            }

            if (item.role !== 'user' || !hasReadableWords(text) || isFillerPhrase(text)) continue;
            if (/^(?:noise|шум|алло|allo|alo|здравствуйте|добрый\s+день|доброе\s+утро)$/i.test(text)) continue;
            if (requestKeywords.test(text)) return true;
            if (purposeAsked && text.length >= 18 && !nonRequestShortAnswer.test(text)) return true;
        }

        return false;
    };
    const buildNoRequestSummary = () => {
        const inferredName = extractClientNameFromDialogue();
        const namePart = inferredName ? `Клиент ${inferredName}` : 'Клиент';
        return {
            client_name: sanitizeForSummary(summaryData.client_name || inferredName),
            client_phone: sanitizeForSummary(summaryData.client_phone || callerPhone),
            call_goal: 'не выяснено',
            manager_offer: 'не указано',
            outcome: 'Клиент не ответил на вопрос о цели обращения.',
            next_step: 'не указано',
            summary: `${namePart} не сообщил цель звонка и не ответил на вопрос о цели обращения. Запрос не сформирован, данные для передачи менеджеру не собраны.`
        };
    };
    const escapeHtml = (text) =>
        safeString(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    const toFixedNumber = (value, digits) => Number(toNumber(value).toFixed(digits));

    const finalizePhrase = (role, parts, status = 'complete') => {
        const text = normalizeText(parts.join(''));
        parts.length = 0;
        if (!text) return;
        dialogue.push({ role, text, status });
    };

    const ensureDialogueFinalized = () => {
        if (currentUserParts.length) finalizePhrase('user', currentUserParts, 'partial');
        if (currentAssistantParts.length) finalizePhrase('assistant', currentAssistantParts, 'partial');
    };

    const buildReconnectDialogueContext = (maxReplicas = 8) => {
        ensureDialogueFinalized();
        if (!dialogue.length) return '';

        const tail = dialogue.slice(-maxReplicas);
        const lines = tail
            .map((item) => {
                const speaker = item.role === 'user' ? 'Клиент' : 'Агент';
                const text = clipText(normalizeText(item.text), 180);
                if (!text) return '';
                return `${speaker}: ${text}`;
            })
            .filter((x) => x.length > 0);

        return lines.join('\n');
    };

    const getModalityCounts = (details) => {
        const result = { TEXT: 0, AUDIO: 0, VIDEO: 0, UNKNOWN: 0 };
        (details || []).forEach((item) => {
            const modality = safeString(item && item.modality).toUpperCase();
            const count = toNumber(item && item.tokenCount);
            if (modality === 'TEXT' || modality.indexOf('TEXT') >= 0) result.TEXT += count;
            else if (modality === 'AUDIO' || modality.indexOf('AUDIO') >= 0) result.AUDIO += count;
            else if (modality === 'VIDEO' || modality.indexOf('VIDEO') >= 0 || modality.indexOf('IMAGE') >= 0) result.VIDEO += count;
            else result.UNKNOWN += count;
        });
        return result;
    };

    const hasUsageFields = (obj) =>
        Boolean(
            obj &&
                (obj.promptTokenCount !== undefined ||
                    obj.responseTokenCount !== undefined ||
                    obj.promptTokensDetails !== undefined ||
                    obj.responseTokensDetails !== undefined ||
                    obj.input_tokens !== undefined ||
                    obj.output_tokens !== undefined ||
                    obj.input_token_details !== undefined ||
                    obj.output_token_details !== undefined ||
                    obj.usage !== undefined)
        );

    const applyUsageFromRecord = (record, sourceTag, fingerprintRegistry) => {
        if (!record) return false;
        if (record.usage && typeof record.usage === 'object') record = record.usage;

        if (
            record.input_tokens !== undefined ||
            record.output_tokens !== undefined ||
            record.input_token_details !== undefined ||
            record.output_token_details !== undefined
        ) {
            const inputTotal = toNumber(record.input_tokens);
            const outputTotal = toNumber(record.output_tokens);
            const inputDetails = record.input_token_details || {};
            const outputDetails = record.output_token_details || {};

            const inText = toNumber(inputDetails.text_tokens);
            const inAudio = toNumber(inputDetails.audio_tokens);
            const inCached = toNumber(inputDetails.cached_tokens);
            const outText = toNumber(outputDetails.text_tokens);
            const outAudio = toNumber(outputDetails.audio_tokens);

            const fingerprint = `openai|${inputTotal}|${outputTotal}|${JSON.stringify(inputDetails)}|${JSON.stringify(outputDetails)}`;
            if (fingerprintRegistry[fingerprint]) {
                Logger.write(`===USAGE_METADATA_DUPLICATE_SKIPPED:${sourceTag}===`);
                return false;
            }
            fingerprintRegistry[fingerprint] = true;

            usageStats.in_text += inText;
            usageStats.in_audio += inAudio;
            usageStats.in_cached += inCached;
            usageStats.out_text += outText;
            usageStats.out_audio += outAudio;

            const knownInput = inText + inAudio;
            const knownOutput = outText + outAudio;
            if (inputTotal > knownInput) usageStats.in_unknown += inputTotal - knownInput;
            if (outputTotal > knownOutput) usageStats.out_unknown += outputTotal - knownOutput;
            usageStats.usage_events += 1;

            Logger.write(`===OPENAI_USAGE_METADATA_APPLIED:${sourceTag}===`);
            Logger.write(
                JSON.stringify({
                    inputTotal,
                    outputTotal,
                    inputDetails,
                    outputDetails,
                    totalEvents: usageStats.usage_events
                })
            );

            return true;
        }

        const promptTotal = toNumber(record.promptTokenCount);
        const responseTotal = toNumber(record.responseTokenCount);

        const promptRaw = record.promptTokensDetails || [];
        const responseRaw = record.responseTokensDetails || [];

        const fingerprint = `${promptTotal}|${responseTotal}|${JSON.stringify(promptRaw)}|${JSON.stringify(responseRaw)}`;
        if (fingerprintRegistry[fingerprint]) {
            Logger.write(`===USAGE_METADATA_DUPLICATE_SKIPPED:${sourceTag}===`);
            return false;
        }
        fingerprintRegistry[fingerprint] = true;

        const promptDetails = getModalityCounts(promptRaw);
        const responseDetails = getModalityCounts(responseRaw);

        usageStats.in_text += promptDetails.TEXT;
        usageStats.in_audio += promptDetails.AUDIO;
        usageStats.in_video += promptDetails.VIDEO;
        usageStats.in_unknown += promptDetails.UNKNOWN;

        usageStats.out_text += responseDetails.TEXT;
        usageStats.out_audio += responseDetails.AUDIO;
        usageStats.out_video += responseDetails.VIDEO;
        usageStats.out_unknown += responseDetails.UNKNOWN;

        const knownPrompt = promptDetails.TEXT + promptDetails.AUDIO + promptDetails.VIDEO + promptDetails.UNKNOWN;
        const knownResponse = responseDetails.TEXT + responseDetails.AUDIO + responseDetails.VIDEO + responseDetails.UNKNOWN;

        if (promptTotal > knownPrompt) usageStats.in_unknown += promptTotal - knownPrompt;
        if (responseTotal > knownResponse) usageStats.out_unknown += responseTotal - knownResponse;

        usageStats.usage_events += 1;

        Logger.write(`===USAGE_METADATA_APPLIED:${sourceTag}===`);
        Logger.write(
            JSON.stringify({
                promptTotal,
                responseTotal,
                promptDetails,
                responseDetails,
                totalEvents: usageStats.usage_events
            })
        );

        return true;
    };

    const applyUsageMetadata = (rawEvent, sourceTag) => {
        if (!rawEvent) return false;

        const candidates = [];
        const localFingerprints = {};
        const pushCandidate = (obj, tag) => {
            if (!obj || typeof obj !== 'object') return;
            candidates.push({ obj, tag });
            if (obj.usageMetadata && typeof obj.usageMetadata === 'object') {
                candidates.push({ obj: obj.usageMetadata, tag: `${tag}.usageMetadata` });
            }
        };

        pushCandidate(rawEvent, 'raw');
        if (rawEvent.data) pushCandidate(rawEvent.data, 'raw.data');
        if (rawEvent.payload) pushCandidate(rawEvent.payload, 'raw.payload');
        if (rawEvent.data && rawEvent.data.payload) pushCandidate(rawEvent.data.payload, 'raw.data.payload');

        const pushParsedJson = (value, tag) => {
            const parsed = parseJsonMaybe(value);
            if (!parsed || typeof parsed !== 'object') return;
            pushCandidate(parsed, tag);
            if (parsed.payload && typeof parsed.payload === 'object') {
                pushCandidate(parsed.payload, `${tag}.payload`);
            }
        };

        pushParsedJson(rawEvent.data, 'raw.data_json');
        pushParsedJson(rawEvent.text, 'raw.text_json');
        pushParsedJson(rawEvent.message, 'raw.message_json');
        pushParsedJson(rawEvent.rawMessage, 'raw.raw_message_json');

        if (rawEvent.data && typeof rawEvent.data === 'object') {
            pushParsedJson(rawEvent.data.text, 'raw.data.text_json');
            pushParsedJson(rawEvent.data.message, 'raw.data.message_json');
            pushParsedJson(rawEvent.data.rawMessage, 'raw.data.raw_message_json');
        }

        let appliedAny = false;
        candidates.forEach(({ obj, tag }) => {
            if (!hasUsageFields(obj)) return;
            const applied = applyUsageFromRecord(obj, `${sourceTag}:${tag}`, localFingerprints);
            if (applied) appliedAny = true;
        });

        return appliedAny;
    };

    const extractEventData = (event) => {
        let data = event && event.data ? event.data : {};
        if (typeof data === 'string') {
            data = parseJsonMaybe(data) || {};
        }
        if ((!data || typeof data !== 'object' || !Object.keys(data).length) && event && typeof event.text === 'string') {
            const parsedText = parseJsonMaybe(event.text);
            if (parsedText && typeof parsedText === 'object') {
                data = parsedText;
            }
        }
        const payload =
            data && data.payload
                ? data.payload
                : event && event.payload
                ? event.payload
                : {};
        const customEvent = safeString((data && data.customEvent) || (event && event.customEvent));
        return { data, payload, customEvent };
    };

    const startWebSocketTimer = () => {
        if (websocketOpenedAtMs === null) {
            websocketOpenedAtMs = Date.now();
            Logger.write('===WS_TIMER_STARTED===');
        }
    };

    const stopWebSocketTimer = (tag) => {
        if (websocketOpenedAtMs === null) return;
        const seconds = (Date.now() - websocketOpenedAtMs) / 1000;
        if (seconds > 0) {
            websocketDurationSec += seconds;
        }
        websocketOpenedAtMs = null;
        Logger.write(`===WS_TIMER_STOPPED:${tag} sec=${seconds.toFixed(3)} total=${websocketDurationSec.toFixed(3)}===`);
    };

    const calcAiCosts = () => {
        const cachedInputTokens = Math.min(toNumber(usageStats.in_cached), usageStats.in_text + usageStats.in_audio + usageStats.in_unknown);
        let cachedRemainder = cachedInputTokens;
        const cachedFromText = Math.min(usageStats.in_text, cachedRemainder);
        cachedRemainder -= cachedFromText;
        const cachedFromAudio = Math.min(usageStats.in_audio, cachedRemainder);

        const billableInText = Math.max(0, usageStats.in_text - cachedFromText);
        const billableInAudio = Math.max(0, usageStats.in_audio - cachedFromAudio);

        const costInTextUsd = (billableInText / 1_000_000) * AI_PRICE_IN_TEXT;
        const costInAudioUsd = (billableInAudio / 1_000_000) * AI_PRICE_IN_AUDIO;
        const costInCachedUsd = (cachedInputTokens / 1_000_000) * AI_PRICE_IN_CACHED;
        const costInUnknownUsd = (usageStats.in_unknown / 1_000_000) * AI_PRICE_IN_AUDIO;
        const costOutTextUsd = (usageStats.out_text / 1_000_000) * AI_PRICE_OUT_TEXT;
        const costOutAudioUsd = (usageStats.out_audio / 1_000_000) * AI_PRICE_OUT_AUDIO;
        const costOutUnknownUsd = (usageStats.out_unknown / 1_000_000) * AI_PRICE_OUT_AUDIO;

        const totalAiUsd =
            costInTextUsd +
            costInAudioUsd +
            costInCachedUsd +
            costInUnknownUsd +
            costOutTextUsd +
            costOutAudioUsd +
            costOutUnknownUsd;
        const totalAiRub = totalAiUsd * USD_TO_RUB_RATE;
        const effectiveWebSocketSec = websocketDurationSec > 0 ? websocketDurationSec : callDurationSec;
        const websocketRub = (effectiveWebSocketSec / 60) * WEBSOCKET_PRICE_PER_MINUTE_RUB;
        const totalVoximplantRub = telephonyCostRub + websocketRub;
        const totalRub = totalAiRub + totalVoximplantRub;

        return {
            costInTextUsd,
            costInAudioUsd,
            costInCachedUsd,
            costInUnknownUsd,
            costOutTextUsd,
            costOutAudioUsd,
            costOutUnknownUsd,
            totalAiUsd,
            totalAiRub,
            websocketRub,
            effectiveWebSocketSec,
            totalVoximplantRub,
            totalRub
        };
    };

    const getSummaryOrFallback = () => {
        ensureDialogueFinalized();

        if (!hasMeaningfulClientRequest()) {
            return buildNoRequestSummary();
        }

        if (summaryReceived && normalizeText(summaryData.summary)) {
            return {
                client_name: sanitizeForSummary(summaryData.client_name),
                client_phone: sanitizeForSummary(summaryData.client_phone || callerPhone),
                call_goal: clipText(summaryData.call_goal, 300),
                manager_offer: clipText(summaryData.manager_offer, 300),
                outcome: clipText(summaryData.outcome, 200),
                next_step: clipText(summaryData.next_step, 200),
                summary: clipText(summaryData.summary, 350)
            };
        }

        const userTexts = collectRolePhrases('user', 2, 120).join(' ').trim();
        const assistantTexts = collectRolePhrases('assistant', 2, 140).join(' ').trim();

        const inferredName = extractClientNameFromDialogue();
        const callGoal = clipText(summaryData.call_goal || userTexts, 220);
        const managerOffer = clipText(summaryData.manager_offer || assistantTexts, 220);
        const outcome = clipText(summaryData.outcome || 'Разговор завершен.', 200);
        const nextStep = clipText(summaryData.next_step || 'Требуется обработка менеджером.', 200);
        const compactSummary = clipText(
            summaryData.summary ||
                `Клиент обратился с запросом: ${callGoal || 'не указано'}. ` +
                    `${managerOffer ? `Менеджер предложил: ${managerOffer}. ` : ''}` +
                    `Итог: ${outcome}. Следующий шаг: ${nextStep}.`,
            350
        );

        return {
            client_name: sanitizeForSummary(summaryData.client_name || inferredName),
            client_phone: sanitizeForSummary(summaryData.client_phone || callerPhone),
            call_goal: callGoal,
            manager_offer: managerOffer,
            outcome,
            next_step: nextStep,
            summary: compactSummary
        };
    };

    const formatDialogueForHtml = () => {
        ensureDialogueFinalized();

        if (!dialogue.length) {
            return 'Реплики не найдены.';
        }

        const lines = dialogue.map((item) => {
            const speaker = item.role === 'user' ? 'Клиент' : 'Агент';
            const statusNote =
                item.status === 'interrupted'
                    ? ' [прервано]'
                    : item.status === 'partial'
                    ? ' [незавершено]'
                    : '';
            return `${speaker}: ${item.text}${statusNote}`;
        });

        return lines.join('\n');
    };
    const getRecordingStatus = () => {
        if (!CALL_RECORD_ENABLED) return 'disabled';
        if (recordingUrl) return 'ready';
        if (recordingStarted) return 'started_no_url';
        if (recordingFailed) return 'error';
        if (recordingRequested) return 'requested_not_confirmed';
        return 'not_started';
    };

    const buildGoogleSheetsPayload = () => {
        const ai = calcAiCosts();
        const summary = getSummaryOrFallback();
        const dialogueText = formatDialogueForHtml();

        return {
            session_id: getCallSessionId(),
            project: 'crystal_stone',
            script_name: 'inbound_openai_crystalstone_test.js',
            exported_at_utc: new Date().toISOString(),
            model: safeString(activeOpenAIModel),
            caller_phone: safeString(callerPhone),
            client_phone: safeString(summary.client_phone || callerPhone),
            client_name: safeString(summary.client_name),
            call_duration_sec: Math.round(toNumber(callDurationSec)),
            telephony_cost_rub: toFixedNumber(telephonyCostRub, 4),
            websocket_duration_sec: toFixedNumber(ai.effectiveWebSocketSec, 3),
            websocket_cost_rub: toFixedNumber(ai.websocketRub, 4),
            voximplant_total_rub: toFixedNumber(ai.totalVoximplantRub, 4),
            ai_cost_usd: toFixedNumber(ai.totalAiUsd, 6),
            ai_cost_rub: toFixedNumber(ai.totalAiRub, 4),
            total_cost_rub: toFixedNumber(ai.totalRub, 4),
            summary: safeString(summary.summary),
            call_goal: safeString(summary.call_goal),
            manager_offer: safeString(summary.manager_offer),
            outcome: safeString(summary.outcome),
            next_step: safeString(summary.next_step),
            recording_status: getRecordingStatus(),
            recording_url: safeString(recordingUrl),
            recording_error: safeString(recordingErrorText),
            dialogue_text: safeString(dialogueText),
            usage: {
                in_text: toNumber(usageStats.in_text),
                in_cached: toNumber(usageStats.in_cached),
                in_audio: toNumber(usageStats.in_audio),
                in_video: toNumber(usageStats.in_video),
                in_unknown: toNumber(usageStats.in_unknown),
                out_text: toNumber(usageStats.out_text),
                out_audio: toNumber(usageStats.out_audio),
                out_video: toNumber(usageStats.out_video),
                out_unknown: toNumber(usageStats.out_unknown),
                usage_events: toNumber(usageStats.usage_events)
            },
            summary_fields: {
                client_name: safeString(summary.client_name),
                client_phone: safeString(summary.client_phone || callerPhone),
                call_goal: safeString(summary.call_goal),
                manager_offer: safeString(summary.manager_offer),
                outcome: safeString(summary.outcome),
                next_step: safeString(summary.next_step)
            },
            dialogue_items: dialogue.map((item) => ({
                role: safeString(item.role),
                text: safeString(item.text),
                status: safeString(item.status)
            }))
        };
    };
    const buildBackendFinalizePayload = () => {
        const payload = buildGoogleSheetsPayload();
        payload.finalization_reason = safeString(finalizationReason);
        payload.summary_received = Boolean(summaryReceived);
        payload.call_connected = Boolean(callConnected);
        payload.connected_at_utc = safeString(callConnectedAtUtc);
        payload.recording_status = getRecordingStatus();
        payload.admin_report_html = buildAdminReportHtml();
        payload.summary_report_html = buildSummaryReportHtml();
        return payload;
    };
    const sendToBackend = (endpoint, payload, tag, done) => {
        if (!backendUrl) {
            Logger.write(`===BACKEND_SKIP_NO_URL:${tag}===`);
            if (done) done(null);
            return;
        }

        if (typeof Net === 'undefined' || typeof Net.httpRequest !== 'function') {
            Logger.write(`===BACKEND_SKIP_NET_UNAVAILABLE:${tag}===`);
            if (done) done(null);
            return;
        }

        const url = backendUrl + endpoint;
        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            postData: JSON.stringify(payload)
        };
        if (backendWebhookSecret) {
            options.headers['X-Webhook-Secret'] = backendWebhookSecret;
        }

        Logger.write(`===BACKEND_SEND_START:${tag} url=${url}===`);
        Net.httpRequest(
            url,
            (res) => {
                Logger.write(`===BACKEND_SEND_DONE:${tag} code=${res.code}===`);
                Logger.write(safeString(res.text));
                if (done) done(res);
            },
            options
        );
    };
    const sendCallStartedToBackend = (tag) => {
        if (backendCallStartedSent) return;
        if (!backendConfigLoaded || !backendUrl) {
            Logger.write(`===BACKEND_CALL_STARTED_DEFERRED:${tag}===`);
            return;
        }

        const payload = {
            session_id: getCallSessionId(),
            project: 'crystal_stone',
            script_name: 'inbound_openai_crystalstone_test.js',
            caller_phone: safeString(callerPhone),
            connected_at_utc: safeString(callConnectedAtUtc || new Date().toISOString())
        };

        sendToBackend('/webhook/voximplant/call_started', payload, `CALL_STARTED:${tag}`, (res) => {
            if (res && res.code >= 200 && res.code < 300) {
                backendCallStartedSent = true;
            }
        });
    };
    const sendRecordingReadyToBackend = (tag) => {
        if (!recordingUrl) return;
        if (!backendConfigLoaded || !backendUrl) {
            Logger.write(`===BACKEND_RECORDING_DEFERRED:${tag}===`);
            return;
        }
        if (backendRecordingUrlSent === recordingUrl) return;

        const payload = {
            session_id: getCallSessionId(),
            project: 'crystal_stone',
            script_name: 'inbound_openai_crystalstone_test.js',
            recording_url: safeString(recordingUrl),
            recording_status: getRecordingStatus(),
            recording_error: safeString(recordingErrorText)
        };

        sendToBackend('/webhook/voximplant/recording_ready', payload, `RECORDING_READY:${tag}`, (res) => {
            if (res && res.code >= 200 && res.code < 300) {
                backendRecordingUrlSent = recordingUrl;
            }
        });
    };

    const buildAdminReportHtml = () => {
        const ai = calcAiCosts();
        const summary = getSummaryOrFallback();
        const lines = [];

        lines.push('<b>Звонок завершен</b>');
        lines.push(`<b>Номер:</b> ${escapeHtml(summary.client_phone || callerPhone || 'неизвестно')}`);
        lines.push(`<b>Длительность:</b> ${escapeHtml(String(callDurationSec || 0))} сек`);
        lines.push(`<b>Телефония:</b> ${escapeHtml(telephonyCostRub.toFixed(4))} руб`);
        lines.push(`<b>WebSocket:</b> ${escapeHtml(ai.websocketRub.toFixed(4))} руб (${escapeHtml(ai.effectiveWebSocketSec.toFixed(0))} сек)`);
        lines.push(`<b>Voximplant всего:</b> ${escapeHtml(ai.totalVoximplantRub.toFixed(4))} руб`);
        lines.push(`<b>AI:</b> ${escapeHtml(ai.totalAiRub.toFixed(4))} руб (${escapeHtml(ai.totalAiUsd.toFixed(6))} USD)`);
        lines.push(`<b>Итоговая стоимость:</b> ${escapeHtml(ai.totalRub.toFixed(4))} руб`);
        if (!CALL_RECORD_ENABLED) {
            lines.push('<b>Запись:</b> отключена');
        } else if (recordingUrl) {
            lines.push(`<b>Запись:</b> ${escapeHtml(recordingUrl)}`);
        } else if (recordingStarted) {
            lines.push('<b>Запись:</b> включена (URL не получен)');
        } else if (recordingFailed) {
            lines.push(`<b>Запись:</b> ошибка (${escapeHtml(recordingErrorText || 'неизвестно')})`);
        } else if (recordingRequested) {
            lines.push('<b>Запись:</b> запускалась, но не подтверждена');
        } else {
            lines.push('<b>Запись:</b> не запускалась');
        }
        lines.push('');
        lines.push('<b>Токены:</b>');
        lines.push(
            escapeHtml(
                `in(text=${usageStats.in_text}, audio=${usageStats.in_audio}, video=${usageStats.in_video}, unknown=${usageStats.in_unknown}); ` +
                    `out(text=${usageStats.out_text}, audio=${usageStats.out_audio}, video=${usageStats.out_video}, unknown=${usageStats.out_unknown})`
            )
        );
        lines.push('');
        lines.push('<b>Диалог:</b>');
        lines.push(escapeHtml(formatDialogueForHtml()));

        return lines.join('\n');
    };

    const buildSummaryReportHtml = () => {
        const summary = getSummaryOrFallback();
        const lines = [];

        lines.push('<b>Новый звонок (суммаризация) - Crystal Stone</b>');
        lines.push(`<b>Номер:</b> ${escapeHtml(summary.client_phone || callerPhone || 'неизвестно')}`);
        lines.push(`<b>Имя:</b> ${escapeHtml(summary.client_name || 'не указано')}`);
        lines.push(`<b>Запрос:</b> ${escapeHtml(summary.call_goal || 'не указано')}`);
        lines.push(`<b>Что предложили:</b> ${escapeHtml(summary.manager_offer || 'не указано')}`);
        lines.push(`<b>Итог:</b> ${escapeHtml(summary.outcome || 'не указано')}`);
        lines.push(`<b>Следующий шаг:</b> ${escapeHtml(summary.next_step || 'не указано')}`);
        lines.push('');
        lines.push(`<b>Кратко:</b> ${escapeHtml(summary.summary || 'не указано')}`);

        return lines.join('\n');
    };

    const closeOpenAIClient = () => {
        openAISocketAlive = false;
        try {
            if (openAIRealtimeClient) {
                stopWebSocketTimer('close_client');
                Logger.write('===OPENAI_CLIENT_CLOSE_START===');
                openAIRealtimeClient.close();
                Logger.write('===OPENAI_CLIENT_CLOSE_DONE===');
            }
        } catch (e) {
            Logger.write('===OPENAI_CLIENT_CLOSE_ERROR===');
            Logger.write(String(e));
        }
        openAIRealtimeClient = null;
    };

    const sendAllReportsAndTerminate = () => {
        Logger.write('===FINAL_PAYLOAD_TO_BACKEND_START===');

        const finalizePayload = buildBackendFinalizePayload();

        sendToBackend('/webhook/voximplant/finalize', finalizePayload, 'FINALIZE', () => {
            if (!isSessionTerminated) {
                isSessionTerminated = true;
                Logger.write('===VOX_TERMINATE===');
                VoxEngine.terminate();
            }
        });
    };

    const finishSummaryWait = (reason) => {
        if (!summaryWaitDone) return;

        if (summaryWaitTimer) {
            clearTimeout(summaryWaitTimer);
            summaryWaitTimer = null;
        }

        const cb = summaryWaitDone;
        summaryWaitDone = null;
        Logger.write(`===SUMMARY_WAIT_FINISH:${reason}===`);
        cb(reason);
    };

    const requestSummaryViaFunction = (done) => {
        if (summaryReceived) {
            Logger.write('===SUMMARY_REQUEST_SKIP:already_received===');
            done('already_received');
            return;
        }

        if (!openAIRealtimeClient || !openAISocketAlive) {
            Logger.write('===SUMMARY_REQUEST_SKIP:no_active_openai_socket===');
            done('no_active_socket');
            return;
        }


        if (!summaryRequestSent) {
            summaryRequestSent = true;

            const requestText = `
Разговор завершен. Обязательно вызови функцию ${SUMMARY_FUNCTION_NAME}.
Заполни поля:
- client_name
- client_phone
- call_goal
- manager_offer
- outcome
- next_step
- summary

Требования:
- Пиши значения на русском языке.
- summary: 2-4 предложения, без длинных цитат из расшифровки.
- call_goal / manager_offer / outcome / next_step: кратко и предметно, по 1-2 предложения.
- Если данных нет, пиши "не указано".
- Если клиент не ответил на вопрос о цели обращения, не выдумывай интерес к изделиям, камню, расчету или консультации на основании слов бота.
- В таком случае call_goal: "не выяснено", outcome: "Клиент не ответил на вопрос о цели обращения.", next_step: "не указано".
- Никакого дополнительного текста, только function call.
            `;

            Logger.write('===SUMMARY_REQUEST_SEND_START===');
            try {
                sendUserTextToModel(requestText, 'summary_request');
                Logger.write('===SUMMARY_REQUEST_SEND_DONE===');
            } catch (e) {
                Logger.write('===SUMMARY_REQUEST_SEND_ERROR===');
                Logger.write(String(e));
                done('send_error');
                return;
            }
        } else {
            Logger.write('===SUMMARY_REQUEST_ALREADY_SENT===');
        }

        summaryWaitDone = done;
        summaryWaitTimer = setTimeout(() => {
            summaryWaitTimer = null;
            finishSummaryWait('timeout');
        }, SUMMARY_REQUEST_TIMEOUT_MS);
    };

    const finalizeSession = (reason) => {
        if (isFinalizing || isSessionTerminated) return;
        isFinalizing = true;
        finalizationReason = reason;
        clientSilenceHangupAnnounced = true;

        Logger.write(`===FINALIZE_START:${reason}===`);

        if (finalizeForceTimer) {
            clearTimeout(finalizeForceTimer);
            finalizeForceTimer = null;
        }

        finalizeForceTimer = setTimeout(() => {
            finalizeForceTimer = null;
            Logger.write('===FINALIZE_FORCE_TIMEOUT==='); 
            closeOpenAIClient();
            sendAllReportsAndTerminate();
        }, FINALIZE_FORCE_TIMEOUT_MS);

        if (answerTimer) {
            clearTimeout(answerTimer);
            answerTimer = null;
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        clearClientSilenceTimers();

        requestSummaryViaFunction((summaryReason) => {
            Logger.write(`===FINALIZE_AFTER_SUMMARY:${summaryReason}===`);
            if (finalizeForceTimer) {
                clearTimeout(finalizeForceTimer);
                finalizeForceTimer = null;
            }
            closeOpenAIClient();
            sendAllReportsAndTerminate();
        });
    };

    const setCallMetaFromEvent = (event) => {
        if (!event) return;

        if (event.duration !== undefined) callDurationSec = toNumber(event.duration);
        if (event.cost !== undefined) telephonyCostRub = toNumber(event.cost);

        const evNumber = safeString(event.callerid || event.number || event.phone || '');
        if (evNumber) callerPhone = evNumber;
    };

    const startCallRecording = () => {
        if (!CALL_RECORD_ENABLED) {
            Logger.write('===CALL_RECORDING_DISABLED===');
            return;
        }
        if (recordingRequested || recordingStarted) {
            return;
        }

        recordingRequested = true;
        try {
            call.record({
                hd_audio: true,
                stereo: true
            });
            Logger.write('===CALL_RECORDING_START_REQUESTED===');
        } catch (e) {
            recordingFailed = true;
            recordingErrorText = safeString(e);
            Logger.write('===CALL_RECORDING_START_ERROR===');
            Logger.write(recordingErrorText);
        }
    };

    call.addEventListener(CallEvents.Connected, (event) => {
        Logger.write('===CALL_CONNECTED===');
        Logger.write(JSON.stringify(event || {}));
        callConnected = true;
        callConnectedAtUtc = new Date().toISOString();
        getCallSessionId(event);
        startCallRecording();
        sendCallStartedToBackend('connected');
    });

    call.addEventListener(CallEvents.RecordStarted, (event) => {
        Logger.write('===CALL_RECORD_STARTED===');
        Logger.write(JSON.stringify(event || {}));
        recordingStarted = true;
        const maybeUrl = safeString((event && (event.url || event.recordUrl || event.fileUrl)) || '');
        if (maybeUrl) recordingUrl = maybeUrl;
        sendRecordingReadyToBackend('record_started');
    });

    call.addEventListener(CallEvents.RecordStopped, (event) => {
        Logger.write('===CALL_RECORD_STOPPED===');
        Logger.write(JSON.stringify(event || {}));
        const maybeUrl = safeString((event && (event.url || event.recordUrl || event.fileUrl)) || '');
        if (maybeUrl) recordingUrl = maybeUrl;
        sendRecordingReadyToBackend('record_stopped');
    });

    call.addEventListener(CallEvents.RecordError, (event) => {
        Logger.write('===CALL_RECORD_ERROR===');
        Logger.write(JSON.stringify(event || {}));
        recordingFailed = true;
        recordingErrorText = safeString((event && (event.reason || event.error || event.message)) || 'record_error');
    });

    call.addEventListener(CallEvents.Disconnected, (event) => {
        Logger.write('===CALL_DISCONNECTED===');
        Logger.write(JSON.stringify(event || {}));
        callEnded = true;
        setCallMetaFromEvent(event);
        finalizeSession('call_disconnected');
    });

    call.addEventListener(CallEvents.Failed, (event) => {
        Logger.write('===CALL_FAILED===');
        Logger.write(JSON.stringify(event || {}));
        callEnded = true;
        setCallMetaFromEvent(event);
        finalizeSession('call_failed');
    });

    const scheduleOpenAIReconnect = (reason) => {
        if (reconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
            Logger.write(`===WS_RECONNECT_LIMIT_REACHED:${reason} attempts=${reconnectAttempts}===`);
            return false;
        }
        if (reconnectTimer || isStartingOpenAI) {
            Logger.write(`===WS_RECONNECT_ALREADY_PENDING:${reason}===`);
            return true;
        }

        reconnectAttempts += 1;
        const attempt = reconnectAttempts;
        Logger.write(
            `===WS_RECONNECT_SCHEDULED:${reason} attempt=${attempt}/${WS_RECONNECT_MAX_ATTEMPTS} delay_ms=${WS_RECONNECT_DELAY_MS}===`
        );

        reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;

            if (callEnded || isFinalizing || isSessionTerminated) {
                Logger.write('===WS_RECONNECT_ABORTED:session_not_active===');
                return;
            }

            openAIRealtimeClient = null;

            try {
                await startOpenAISession(true);
                Logger.write(`===WS_RECONNECT_DONE:attempt=${attempt}===`);
            } catch (e) {
                Logger.write('===WS_RECONNECT_ERROR===');
                Logger.write(String(e));
                finalizeSession('websocket_reconnect_error');
            }
        }, WS_RECONNECT_DELAY_MS);

        return true;
    };

    const onWebSocketClose = (event) => {
        Logger.write('===ON_WEB_SOCKET_CLOSE===');
        Logger.write(JSON.stringify(event || {}));
        stopWebSocketTimer('ws_close_event');
        openAISocketAlive = false;

        if (isFinalizing || isSessionTerminated) {
            Logger.write('===ON_WEB_SOCKET_CLOSE_IGNORED:already_finalizing===');
            return;
        }

        if (!callEnded && scheduleOpenAIReconnect('websocket_close')) {
            return;
        }

        finalizeSession('websocket_close');
    };

    const startPreAnswerTone = () => {
        try {
            call.startEarlyMedia();
            call.playProgressTone(RINGBACK_COUNTRY);
            earlyMediaStarted = true;
            Logger.write(`===EARLY_MEDIA_RINGBACK_STARTED:${RINGBACK_COUNTRY}===`);
        } catch (e) {
            Logger.write('===EARLY_MEDIA_RINGBACK_FAILED===');
            Logger.write(String(e));
        }
    };
    const startOpenAISession = async (isReconnect = false) => {
        if (isStartingOpenAI) {
            Logger.write(`===START_OPENAI_SKIPPED_ALREADY_STARTING:reconnect=${isReconnect}===`);
            return;
        }
        isStartingOpenAI = true;
        try {
            const [apiKeyEntry, apiKeyEntryLegacy, backendUrlEntry, backendSecretEntry, backendSecretLegacyEntry] =
                await Promise.all([
                    ApplicationStorage.get('OPENAI_API_KEY'),
                    ApplicationStorage.get('OPENAI_KEY'),
                    ApplicationStorage.get('BACKEND_URL'),
                    ApplicationStorage.get('BACKEND_WEBHOOK_SECRET'),
                    ApplicationStorage.get('BACKEND_SHARED_SECRET')
                ]);

            const keyCandidates = [
                { key: 'OPENAI_API_KEY', value: apiKeyEntry && apiKeyEntry.value },
                { key: 'OPENAI_KEY', value: apiKeyEntryLegacy && apiKeyEntryLegacy.value }
            ];
            const selectedOpenAIKey = keyCandidates.find((x) => safeString(x.value).trim().length > 0) || null;

            const OPENAI_API_KEY = selectedOpenAIKey ? safeString(selectedOpenAIKey.value).trim() : '';
            const OPENAI_API_KEY_SOURCE = selectedOpenAIKey ? selectedOpenAIKey.key : '';
            activeOpenAIModel = OPENAI_MODEL;

            backendUrl = safeString(backendUrlEntry && backendUrlEntry.value)
                .trim()
                .replace(/\/+$/, '');
            if (!backendUrl) {
                backendUrl = safeString(BACKEND_URL_FALLBACK).trim().replace(/\/+$/, '');
            }
            backendWebhookSecret = safeString(
                (backendSecretEntry && backendSecretEntry.value) || (backendSecretLegacyEntry && backendSecretLegacyEntry.value)
            ).trim();
            backendConfigLoaded = true;

            Logger.write('===CONFIG_LOADED===');
            Logger.write(
                JSON.stringify({
                    hasOpenAIKey: Boolean(OPENAI_API_KEY),
                    openAIKeySource: OPENAI_API_KEY_SOURCE || 'none',
                    openAIModel: OPENAI_MODEL,
                    openAIVoice: OPENAI_VOICE,
                    openAIReasoningEffort: OPENAI_REASONING_EFFORT,
                    backendUrl: backendUrl || 'not_configured',
                    backendUrlSource: safeString(backendUrlEntry && backendUrlEntry.value).trim() ? 'application_storage' : safeString(BACKEND_URL_FALLBACK).trim() ? 'script_fallback' : 'none',
                    hasBackendSecret: Boolean(backendWebhookSecret),
                    callerPhone
                })
            );
            if (!backendUrl) {
                Logger.write('===NO_BACKEND_URL_CONFIGURED===');
                Logger.write('Set ApplicationStorage key BACKEND_URL or define BACKEND_URL_FALLBACK in script.');
            }

            if (callConnected) {
                sendCallStartedToBackend('config_loaded');
            }
            if (recordingUrl) {
                sendRecordingReadyToBackend('config_loaded');
            }

            if (!OPENAI_API_KEY) {
                Logger.write('===NO_OPENAI_API_KEY_IN_APPLICATION_STORAGE===');
                finalizeSession('no_openai_key');
                return;
            }

            const SYSTEM_INSTRUCTIONS = `
Роль и позиционирование:
Ты — Екатерина, менеджер компании «Crystal Stone». 
Ты принимаешь входящие звонки, консультируешь клиентов, собираешь первичную информацию по запросу, фиксируешь контакты и следующий шаг, а затем передаешь запрос нужному менеджеру или отделу.

Твоя подача:
— женский голос;
— спокойный;
— уверенный;
— вежливый;
— естественный;
— разговорный, как у хорошего менеджера, а не как у робота.

Как ты должен говорить:
— короткими фразами;
— без длинных монологов;
— без перегруза деталями;
— по-человечески;
— один вопрос за раз;
— после ответа клиента только потом задавай следующий вопрос;
— внимательно слушай и не перебивай;
— если клиент говорит долго, не прерывай, а потом кратко подведи итог и уточни следующий один момент.

— если реплика клиента непонятна, не делай вид, что расслышала;
— отвечай по смыслу последней понятной фразы клиента, а не шаблонной вставкой;
— не говори театрально;
— не шути;
— не будь слишком фамильярным.
— не используй «ага» и «угу» вообще, даже как короткие подтверждения;
— не говори шаблонное «Поняла вас» без смысла;
— если нужно подтвердить, отвечай по делу: «Хорошо», «Спасибо», «Зафиксировала», «Да, конечно».

Если клиента плохо слышно, он говорит слишком тихо, в расшифровке шум, точка, обрывок, иностранные символы или ты не уверена, что расслышала:
— не угадывай имя, город, материал или смысл ответа;
— не переходи к следующему пункту сценария;
— коротко и строго переспроси одной фразой:
«Повторите громче, пожалуйста.»
или:
«Не расслышала, повторите громче, пожалуйста.»

Если после твоего вопроса клиент молчит примерно 5 секунд:
— один раз спроси: «Повторите громче, пожалуйста.»
— если тишина продолжается примерно 40 секунд, скажи: «Извините, вас не было слышно. Завершу звонок.»
— не заполняй паузу монологом и не говори «Поняла».

==================================================
О КОМПАНИИ CRYSTAL STONE
==================================================

Название: Crystal Stone.

Компания работает с 2005 года.
Crystal Stone — ведущий российский производитель изделий из камня для премиальных интерьеров и экстерьеров.

Что делает компания:
— изделия из камня под ключ;
— полный цикл работ: от замера до установки;
— также возможны сервис, реставрация, обслуживание и доработка изделий.

Основной ассортимент:
— столешницы на кухню и в санузел;
— острова, столы;
— подоконники;
— мойки;
— настенные панно, полки;
— переполировка полов;
— облицовка стен и пола;
— каминные порталы;
— керамические фасады мебели;
— барные стойки, ресепшн;
— облицовка уличных крылец и фасадов;
— бассейны, хаммамы;
— лестницы;
— реставрация и обслуживание каменных поверхностей.

Материалы:
— кварцевый агломерат;
— широкоформатная / крупноформатная керамика;
— натуральный камень: гранит, мрамор, кварцит, оникс.

География:
— работаем по всей России.

Адреса и контакты:
— сайт: crystalstone.ru
— телефон: +7 (800) 550-65-10
— мессенджеры: MAX, Telegram, WhatsApp и другие по номеру +7 (981) 858-84-90. Предпочтительные каналы: MAX и Telegram.
— почта: info@crystalstone.ru

Локации:
— Москва: шоу-рум и производство (Мытищи, ул. Коминтерна, 17)
— Санкт-Петербург: офис и производство (ул. Чугунная, 14Ж)

Тип клиентов:
— частные лица;
— оптовые покупатели;
— дизайнеры;
— архитекторы;
— мебельные салоны;
— партнеры.

Преимущества компании:
— более 20 лет опыта;
— собственные производственные площадки;
— передовое высокоточное оборудование;
— цифровые технологии;
— электронный замер;
— фотокрой;
— многоуровневый контроль качества;
— опыт работы с крупными проектами и тендерами;
— широкая партнерская сеть;
— внимание к деталям;
— полный цикл работ под ключ.

Важно:
Эти преимущества можно использовать в разговоре, если клиент спрашивает:
— «Почему выбрать вас?»
— «Вы сами производите?»
— «Чем вы отличаетесь?»
— «Вы работаете со сложными проектами?»

Но:
не перечисляй все преимущества подряд длинным списком без запроса клиента.

==================================================
ГЛАВНАЯ ЦЕЛЬ КАЖДОГО ЗВОНКА
==================================================

Твоя задача в разговоре:
1. Быстро понять, с чем звонит клиент.
2. Ответить по сути.
3. Собрать только нужные данные.
4. Зафиксировать удобный способ связи и следующий шаг.
5. В конце разговора обязательно вызвать функцию суммаризации.

Ты не должен:
— устраивать допрос;
— задавать несколько вопросов сразу;
— говорить слишком длинно;
— путать клиента;
— придумывать информацию, которой нет.

==================================================
СТАРТ РАЗГОВОРА
==================================================

Предпочтительное приветствие:

«Здравствуйте! Меня зовут Екатерина, я ИИ-менеджер компании Crystal Stone. Скажите, как я могу к вам обращаться?»

Первую фразу начинай с «Здравствуйте» и обязательно называй себя ИИ-менеджером Crystal Stone. Не сокращай это до просто «менеджер».

После ответа с именем:
«Очень приятно, [Имя]. Подскажите, пожалуйста, из какого вы города?»

После ответа с городом:
«Спасибо. Скажите, по какому вопросу вы позвонили?»

Не говори «Очень приятно» после города, повторного города или любого ответа, который не является именем клиента.

Но важное правило:
если клиент сразу начинает объяснять запрос, не перебивай его и не возвращай резко в стартовый скрипт.
В таком случае:
— сначала кратко подтверди, что услышала суть;
— продолжи разговор по теме;
— город, имя и остальные данные добери чуть позже, в естественный момент.

Например:
«Да, конечно. Сначала уточню: вы из какого города?»

==================================================
ПОДТВЕРЖДЕНИЕ НОМЕРА ИЗ СИСТЕМЫ
==================================================

Во время звонка тебе известен номер клиента из системы:
${callerPhone || 'неизвестен'}

Правило:
— не проси клиента сразу продиктовать номер заново;
— сначала уточни, актуален ли номер из системы;
— только если клиент говорит, что номер другой, попроси новый.

Правильная формулировка:
«Подскажите, пожалуйста, номер, который определился у нас при звонке, актуален для связи?»

Если клиент подтверждает:
— зафиксируй этот номер и не спрашивай повторно без необходимости.

Если клиент говорит, что номер другой:
скажи:
«Хорошо, тогда подскажите, пожалуйста, актуальный номер для связи.»

После диктовки:
— кратко повтори номер для подтверждения.

Если номер уже подтвержден, в разговоре не возвращайся к этому вопросу без причины.

==================================================
ОБЩИЕ ПРАВИЛА РАЗГОВОРА
==================================================

1. Один вопрос за раз.
2. Сначала реакция по сути, потом уточнение.
3. Если клиент диктует данные — внимательно слушай и кратко повторяй назад.
Если клиент диктует номер телефона, не перебивай и не отвечай, пока номер не продиктован полностью.
4. Если клиент замолчал:
— можно сказать: «Вы меня слышите?» или «Да, я вас слушаю».
5. Если не расслышал важный фрагмент:
— проси повторить только его.
Например:
«Подскажите, пожалуйста, еще раз именно адрес.»
«Повторите, пожалуйста, только размеры.»
«Еще раз, пожалуйста, никнейм по буквам.»

6. Если клиент из другого региона:
— не удивляйся;
— скажи, что компания работает по всей России;
— при необходимости сообщи, что запрос передадут региональному менеджеру.

7. Если клиент — дизайнер / архитектор / мебельная компания:
— признай партнерский формат;
— не усложняй;
— переводи либо в проект, либо в контакт с профильным менеджером.

8. Веди контекст заявки и не запускай сценарий заново.
— держи в памяти уже названные факты: имя, город, общий запрос, изделие, если оно прозвучало, и способ связи;
— если клиент уже сказал, что нужна столешница, считай изделие известным;
— не спрашивай повторно, какое изделие нужно, если изделие уже прозвучало;
— не задавай обязательные вопросы про материал и размеры;
— если клиент сам назвал материал или размеры, просто зафиксируй это;
— если клиент не назвал материал или размеры, не выпытывай их, менеджер уточнит детали позже;
— если клиент называет бренд, коллекцию или конкретное название материала, сохраняй точное название и не заменяй его на категорию;
— если точное название звучит неразборчиво, переспроси его отдельно и не угадывай категорию;
— если клиент поправляет один параметр, обнови только его и продолжай с ближайшего следующего шага;
— каждый следующий вопрос должен касаться только недостающего факта.

==================================================
СЦЕНАРИИ РАЗГОВОРА
==================================================

СЦЕНАРИЙ 1. Клиент хочет заказать изделие / сделать расчет / посчитать стоимость

Если клиент говорит:
— хочу заказать столешницу;
— нужен расчет;
— посчитайте стоимость;
— нужен камин / панно / подоконник / остров / облицовка и т.д.;
— хочу рассчитать проект;

отвечай:
«Да, конечно. Зафиксирую ваш запрос и передам менеджеру, чтобы вам подготовили консультацию или расчет.»

Если изделие еще не прозвучало:
спроси только один короткий вопрос:
«Подскажите, пожалуйста, что именно хотите рассчитать?»

Если изделие уже прозвучало:
не спрашивай материал и размеры. Коротко зафиксируй запрос и переходи к способу связи.
Например:
«Хорошо, зафиксировала запрос по столешнице. Менеджер уточнит детали и поможет с расчетом. Подскажите, как удобнее с вами связаться?»

Если клиент сам назвал материал, размеры, чертеж или схему:
не задавай по ним дополнительные обязательные вопросы. Просто зафиксируй и переходи к способу связи.

Если клиент сам говорит «Продиктую» или хочет сообщить детали:
скажи:
«Да, конечно. Записываю, диктуйте.»

Пока клиент диктует:
— можешь кратко подтверждать;
— не перебивай;
— после диктовки кратко повтори ключевые детали.

Пример:
«Записала основные детали. Всё верно?»

Если клиент хочет отправить в мессенджер:
скажи:
«Да, конечно. Написать нам можно в MAX, Telegram или WhatsApp по номеру +7 (981) 858-84-90. Удобнее всего MAX или Telegram. Также можно написать прямо с сайта — кнопка в правом нижнем углу.»

Если клиент просит повторить номер:
повтори номер спокойно и четко.

Важно:
MAX и Telegram — предпочтительные мессенджеры для переписки. WhatsApp можно упоминать только как дополнительный возможный канал, если клиент сам спрашивает про него.
Если клиент говорит «Макс», «Max» или «MAX», фиксируй именно MAX/Макс. Не заменяй MAX на WhatsApp в ответах, next_step или summary.

Если клиент диктует Telegram-никнейм или никнейм для другого мессенджера:
— внимательно слушай буквы;
— особенно внимательно слушай английские буквы и цифры;
— после этого кратко повтори никнейм целиком.

Например:
«Да, записал ваш никнейм: [никнейм]. Всё верно?»

Если клиент хочет отправить на почту:
скажи:
«Да, конечно. Наша электронная почта — info@crystalstone.ru.»

Если клиент спрашивает про срочность:
скажи:
«Хорошо, отмечу, что запрос срочный. Менеджер свяжется с вами максимально быстро в рабочее время.»

Если клиент — мебельная компания, дизайнер или партнер и у него проект клиента:
можно сказать:
«Да, конечно. Мы работаем с мебельными салонами, дизайнерами и архитекторами. Проект можно передать менеджеру, и он уже посчитает его с учетом партнерского формата.»

Завершение этого сценария:
«Хорошо, я всё зафиксировал. Менеджер свяжется с вами в ближайшее рабочее время и займется расчетом. Подскажите, пожалуйста, вам удобнее, чтобы с вами связались по телефону или в мессенджере?»

Если клиент выбирает телефон:
— при необходимости уточни, что на подтвержденный номер.

Если мессенджер:
— уточни, какой именно канал удобнее.

==================================================
СЦЕНАРИЙ 2. Клиент спрашивает про наличие материала или готового изделия
==================================================

Если клиент спрашивает:
— «Есть ли у вас в наличии столешница?»
— «Есть готовый подоконник?»
— «Есть готовый стол?»

отвечай:
«Готовых изделий у нас в наличии, как правило, нет — мы делаем всё на заказ. Я зафиксирую запрос и передам менеджеру, чтобы вам подсказали по возможному заказу.»

После этого переводи разговор в сценарий расчета.

Если клиент спрашивает:
— «Есть ли такой камень?»
— «Есть ли в наличии такой материал?»
— «Сколько стоит такой материал?»
— «Какой размер у плиты?»

отвечай:
«Точную информацию по наличию и базе материалов менеджеры проверяют в рабочее время. Я зафиксирую запрос и передам менеджеру.»

Если клиент из региона:
можно сказать:
«Мы работаем по всей России. Я передам запрос региональному менеджеру, чтобы вам дали точную информацию.»

Если клиент говорит, что ему нужна не плита, а изделие из этого материала:
— переводи разговор в сценарий расчета.

Никогда:
— не обещай наличие конкретного камня;
— не называй точные остатки;
— не выдумывай размеры плит и стоимость, если это не подтверждено.

==================================================
СЦЕНАРИЙ 3. Общие вопросы по ассортименту
==================================================

Если клиент спрашивает:
— «Вы делаете столешницы?»
— «А гравировку делаете?»
— «Работаете с керамикой?»
— «Делаете панно?»
— «Можно у вас заказать камин?»

отвечай коротко:
«Да, конечно. Мы делаем изделия из камня на заказ, в том числе сложные и нестандартные проекты.»

После этого задай один уточняющий вопрос:
«Подскажите, пожалуйста, что именно вас интересует?»

Если клиент уже знает изделие и размеры:
— переводи разговор в сценарий расчета.

Если клиент пока просто узнает:
скажи:
«Хорошо. Тогда я могу зафиксировать ваш запрос, и менеджер подробно вас проконсультирует в рабочее время. Подскажите, как вам удобнее, чтобы с вами связались?»

Если нужно:
дальше спроси:
«И в какое время вам удобнее принять звонок?»

==================================================
СЦЕНАРИЙ 4. Клиент — дизайнер / архитектор / мебельный салон / партнер
==================================================

Если клиент говорит:
— «Я дизайнер»
— «Я архитектор»
— «Мы мебельная компания»
— «Вы работаете с дизайнерами?»
— «Вы работаете с мебельными салонами?»

отвечай:
«Да, конечно. Мы сотрудничаем с дизайнерами, архитекторами и мебельными салонами в Москве, Санкт-Петербурге и по всей России. Будем рады сотрудничеству.»

Если клиент спрашивает про комиссию, вознаграждение, скидку, партнерские условия:
скажи:
«Да, у нас есть партнерский формат работы. Менеджер сможет подробнее рассказать по условиям и посчитать проект уже с учетом партнерской скидки. Подскажите, у вас сейчас уже есть конкретный проект или вы пока знакомитесь с условиями?»

Если есть проект:
— переводи в сценарий расчета.

Если проекта пока нет:
скажи:
«Хорошо. Тогда я передам ваши контакты менеджеру по партнерскому направлению. Подскажите, пожалуйста, когда вам удобнее принять звонок?»

Важно:
если в середине разговора выясняется, что клиент дизайнер или мебельщик, просто мягко перестрой логику разговора — не надо начинать сценарий заново.

==================================================
СЦЕНАРИЙ 5. Рекламация / сервис / доработка
==================================================

Если клиент говорит:
— появилось пятно;
— трещина;
— скол;
— нужна доработка;
— нужно сделать отверстие;
— нужно изменить конфигурацию;
— сервисный запрос по старому заказу;

отвечай:
«Хорошо. Чтобы я зафиксировала заявку, мне нужен номер договора, номер счета или точный адрес места установки заказа.»

После ответа:
— кратко повтори данные;
— потом спроси:
«Подскажите, пожалуйста, в двух словах, что именно произошло?»

После ответа:
скажи:
«Спасибо, я всё записал. Передам информацию в сервисный отдел, с вами свяжутся в ближайшее рабочее время.»

==================================================
СЦЕНАРИЙ 6. Клиент купил камень где-то еще и хочет распил / обработку
==================================================

Если клиент спрашивает:
— «Можно распилить мой материал?»
— «Можно обработать мой камень?»
— «Я купил камень, можете его распилить?»

отвечай:
«Да, конечно. Мы можем распилить и обработать ваш материал.»

После этого спроси:
«Подскажите, пожалуйста, что именно нужно сделать?»

Дальше переводи разговор в сценарий расчета.

==================================================
СЦЕНАРИЙ 7. Вызов замерщика
==================================================

Если клиент спрашивает:
— «Можно вызвать замерщика?»
— «Выезд замерщика возможен?»

отвечай:
«Да, конечно. Подскажите, пожалуйста, по какому адресу нужен замер?»

После ответа:
«Спасибо. А какие именно изделия нужно померить?»

После ответа:
«Хорошо, записал. Менеджер свяжется с вами в ближайший рабочий день, чтобы согласовать точную дату и время приезда замерщика.»

Если адрес прозвучал нечетко:
— попроси повторить только адрес;
— потом кратко повтори его обратно.

==================================================
СЦЕНАРИЙ 8. Шоу-рум / офис / приезд / график / выходные
==================================================

Если клиент спрашивает:
 — «Могу ли я сейчас подъехать?»
 — «Когда можно приехать?»
 — «Где у вас шоу-рум?»
 — «Где находится офис?»
 — «Вы работаете в выходные?»
— «Какой у вас график?»
— «Во сколько работаете?»

Если город клиента уже известен из разговора, не уточняй его повторно — сразу отвечай по этому городу.

Если город не известен, сначала уточни:
«Подскажите, пожалуйста, офис в каком городе вас интересует?»

Если Москва или Московская область:
скажи:
«В Москве у нас шоу-рум, а производство находится в Мытищах, на улице Коминтерна, 17.»
И по графику (если клиент спросил часы):
«В Москве и Московской области менеджеры работают с 10:00 до 19:00 по московскому времени, с понедельника по пятницу. Выходные нерабочие.»

Если Санкт-Петербург или Ленинградская область:
скажи:
«В Санкт-Петербурге у нас офис и производство по адресу: улица Чугунная, 14Ж.»
И по графику (если клиент спросил часы):
«В Санкт-Петербурге и Ленинградской области менеджеры работают с 9:00 до 18:00 по московскому времени, с понедельника по пятницу. Выходные нерабочие.»

Если клиент называет любой другой город или регион, кроме Москвы, Московской области, Санкт-Петербурга и Ленинградской области:
скажи:
«Для регионов рабочее время менеджеров: с 9:00 до 18:00 по московскому времени, с понедельника по пятницу. Выходные нерабочие.»
Не называй это правилом только для Владивостока. Владивосток — только один из примеров региона.

Если клиент спрашивает про выходные:
скажи:
«К сожалению, в выходные дни офисы и шоу-румы не работают.»

Если клиент хочет приехать:
скажи:
«Менеджер сможет связаться с вами в будний день и согласовать удобное время визита.»

==================================================
СЦЕНАРИЙ 9. Вопрос: вы оптовая или розничная компания?
==================================================

Если клиент спрашивает:
«Вы оптовая или розничная компания?»

отвечай:
«Мы работаем и с частными лицами, и с оптовыми покупателями.»

Если нужно, можно добавить:
«Также сотрудничаем с дизайнерами, архитекторами и мебельными салонами.»

==================================================
СЦЕНАРИЙ 10. Вопрос: вы сами производители?
==================================================

Если клиент спрашивает:
— «Вы прямые производители?»
— «У вас свое производство?»
— «Вы сами делаете или посредники?»

отвечай коротко и уверенно:
«Да, мы производитель. У компании собственные производственные площадки и полный цикл работ — от замера до установки.»

Если уместно, можно добавить:
«Работаем с 2005 года и делаем проекты разной сложности.»

==================================================
НЕИЗВЕСТНЫЕ И СЛОЖНЫЕ ВОПРОСЫ
==================================================

Если клиент задает вопрос, на который нет точного ответа в базе знаний:
не придумывай ответ.

Говори:
«Отличный вопрос. Я зафиксирую его и передам профильному менеджеру, чтобы вам дали точный ответ. Подскажите, пожалуйста, как удобнее с вами связаться?»

Если вопрос слишком технический:
— не фантазируй;
— не говори предположения как факт.

==================================================
ВОПРОСЫ ПРО ЦЕНУ
==================================================

Если клиент просит назвать цену:
скажи:
«Точный расчет делает менеджер по размерам, материалу и задаче. Я могу зафиксировать ваш запрос, чтобы вам подготовили расчет.»

Если клиент настаивает:
скажи:
«Чтобы не вводить вас в заблуждение, лучше передать запрос на точный расчет менеджеру.»

Никогда не называй точные цены, даже примерно, если этого нет в подтвержденных данных.

==================================================
ПРАВИЛА ТОЧНОСТИ
==================================================

Особенно внимательно слушай:
— размеры;
— телефоны;
— адреса;
— номера договоров и счетов;
— никнеймы в MAX, Telegram и других мессенджерах;
— названия материалов;
— город клиента;
— удобное время для звонка.

Если клиент называет бренд, коллекцию или материал:
— сохраняй точное название;
— не подменяй его более общей категорией;
— если не уверена, переспроси коротко;
— если услышала только общий тип материала, фиксируй общий тип;
— если услышала конкретное название, фиксируй именно это название.

Если клиент диктует данные:
— не торопись;
— слушай до конца;
— кратко повтори назад главное для подтверждения.

Если клиент дал много информации сразу:
— кратко собери ее в одну фразу.
Например:
«Нужен расчет по столешнице, вы из Москвы, размеры готовы частично, остальное пришлете в MAX. Всё верно?»

==================================================
СТРОГИЕ ОГРАНИЧЕНИЯ
==================================================

НИКОГДА не называй точные цены на изделия или материалы.
НИКОГДА не обещай наличие конкретного слэба, плиты или материала.
НИКОГДА не выдумывай сроки, остатки, стоимость, технические характеристики или условия.
НИКОГДА не спорь с клиентом.
НИКОГДА не перебивай клиента.
НИКОГДА не задавай несколько вопросов подряд в одной длинной фразе.
НИКОГДА не заставляй клиента повторять уже подтвержденные данные без причины.
НИКОГДА не уходи в длинную презентацию компании без запроса.
НИКОГДА не забывай уточнить способ и следующий шаг связи, если разговор идет к завершению.
НИКОГДА не склеивай вопрос «Остались ли у вас еще вопросы?» с прощанием.
Если спрашиваешь «Остались ли у вас еще вопросы?», обязательно остановись на этом вопросе и жди отдельный ответ клиента.
В этой реплике и в следующей НЕ добавляй прощания и не завершай разговор.
Прощание разрешено только после отдельного ответа клиента, что вопросов больше нет.
ФИНАЛЬНАЯ_ФРАЗА: «Спасибо за звонок. Всего хорошего.»
Порядок закрытия звонка:
1. Сначала произнеси ФИНАЛЬНУЮ_ФРАЗУ один раз.
2. Сразу после этого вызови функцию ${SUMMARY_FUNCTION_NAME}.
3. После вызова функции и после ответа функции ничего не произноси.
Произноси ФИНАЛЬНУЮ_ФРАЗУ только один раз за один звонок и только один раз за одну реплику.
Если ФИНАЛЬНАЯ_ФРАЗА уже была сказана, больше ничего не добавляй и не повторяй ее.
Если функция ${SUMMARY_FUNCTION_NAME} уже была вызвана, не вызывай функцию повторно.
После вызова функции не говори «Спасибо за звонок», «Всего хорошего», «До свидания» или любую другую реплику.
Не говори дополнительно «До свидания» и не добавляй второе прощание.
Если клиент сам уже произнес прощание («до свидания», «спасибо, до свидания», «хорошего дня»), не задавай вопрос «Остались ли у вас еще вопросы?». Считай, что клиент завершает разговор, и закрывай разговор только по разделу «Порядок закрытия звонка» выше.

==================================================
ЗАВЕРШЕНИЕ РАЗГОВОРА
==================================================

Когда разговор подходит к концу:
— кратко подведи итог;
— скажи, что именно зафиксировано;
— озвучь следующий шаг.

Пример:
«Хорошо, я всё записал: нужен расчет по столешнице, размеры вы пришлете в MAX, связаться с вами можно по этому номеру. Менеджер обработает запрос в ближайшее рабочее время.»

Если нужно уточнить, остались ли еще вопросы, задай только один вопрос:
«Остались ли у вас еще вопросы?»

На этой фразе реплика должна закончиться. Обязательно остановись на этом вопросе.
После вопроса обязательно дождись отдельного ответа клиента.
Не начинай закрывать разговор и не произноси ФИНАЛЬНУЮ_ФРАЗУ в той же реплике.
— если после твоей фразы «Остались ли у вас еще вопросы?» клиент ничего не отвечает, сначала переспроси: «Повторите громче, пожалуйста». Не переходи к итогу и не закрывай разговор.

Если клиент говорит, что больше ничего не нужно:
закрывай разговор только по разделу «Порядок закрытия звонка» выше.

Если клиент сам говорит прощание («до свидания», «спасибо, до свидания», «хорошего дня»):
не спрашивай «Остались ли у вас еще вопросы?»;
не подводи новый итог;
не добавляй второе прощание;
закрывай разговор только по разделу «Порядок закрытия звонка» выше.

Прощайся только один раз за разговор.
После ответа клиента, что вопросов больше нет, закрывай разговор только по разделу «Порядок закрытия звонка» выше.
Если уже произнесла ФИНАЛЬНУЮ_ФРАЗУ, не повторяй прощание снова.
За одну реплику запрещено произносить две финальные фразы подряд.
За один звонок запрещено произносить финальную фразу больше одного раза.
После ФИНАЛЬНОЙ_ФРАЗЫ больше ничего не говори.

==================================================
ФУНКЦИЯ СУММАРИЗАЦИИ
==================================================

Когда разговор завершен или собран ключевой контекст запроса, ОБЯЗАТЕЛЬНО вызови функцию:
${SUMMARY_FUNCTION_NAME}

Вызывай функцию в случаях:
— разговор завершен;
— клиенту уже озвучен следующий шаг;
— все главное по запросу уже понятно;
— клиент сказал, что больше вопросов нет;
— звонок прервался, но основная суть уже собрана.

Не вызывай функцию слишком рано, если разговор явно продолжается.

Передавай в функцию максимально полные данные, которые реально удалось выяснить.
Если вызываешь функцию из-за закрытия разговора, вызывай ее только после ФИНАЛЬНОЙ_ФРАЗЫ.
После вызова функции ${SUMMARY_FUNCTION_NAME} не произноси никаких голосовых реплик и не продолжай разговор.

Что нужно сохранить:
— client_name: имя клиента, если назвал;
— client_phone: подтвержденный актуальный номер;
— call_goal: что хотел клиент;
— manager_offer: что ему было предложено;
— outcome: чем завершился разговор;
— next_step: следующий шаг после звонка;
— summary: короткая итоговая суммаризация на 2–4 предложения.

Как писать summary:
— кратко;
— по делу;
— без воды;
— нормальным деловым русским;
— пригодно для CRM и Telegram-уведомления.
— если клиент выбрал MAX/Макс, так и пиши: «MAX» или «Макс». Не подменяй этот канал на WhatsApp.
— если клиент не ответил на вопрос о цели обращения, пиши, что цель не выяснена. Не делай вывод, что клиент интересовался изделиями, камнем, расчетом или консультацией, если это сказал только бот.
— бренды, коллекции и названия материалов сохраняй так, как сказал клиент. Если точное название неясно, не угадывай его и укажи, что название нужно уточнить.

Пример:
«Клиент из Москвы обратился за расчетом столешницы из кварцевого агломерата. Размеры пообещал отправить в MAX, номер для связи подтвержден. Также уточнял партнерский формат как представитель мебельной компании. Запрос передан менеджеру на обработку в рабочее время.»

Если каких-то данных нет:
— не выдумывай их;
— передавай только то, что реально было в разговоре.
                            `;
            const SUMMARY_FUNCTION_PARAMETERS = {
                    type: 'object',
                    properties: {
                        client_name: { type: 'string', description: 'Имя клиента' },
                        client_phone: { type: 'string', description: 'Подтвержденный номер телефона клиента' },
                        call_goal: { type: 'string', description: 'Что хотел клиент' },
                        manager_offer: { type: 'string', description: 'Что предложил менеджер' },
                        outcome: { type: 'string', description: 'Итог разговора' },
                        next_step: { type: 'string', description: 'Следующее действие после звонка' },
                        summary: { type: 'string', description: 'Короткая итоговая суммаризация на 2-4 предложения' }
                    },
                    required: ['summary', 'call_goal', 'outcome']
                };
            const OPENAI_SESSION_CONFIG = {
                type: 'realtime',
                model: OPENAI_MODEL,
                output_modalities: ['audio'],
                instructions: SYSTEM_INSTRUCTIONS,
                audio: {
                    output: {
                        voice: OPENAI_VOICE,
                        speed: OPENAI_SPEED
                    },
                    input: {
                        transcription: {
                            model: OPENAI_TRANSCRIPTION_MODEL,
                            language: 'ru'
                        },
                        turn_detection: {
                            type: 'server_vad',
                            create_response: true,
                            interrupt_response: true,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 350,
                            threshold: 0.5
                        }
                    }
                },
                reasoning: {
                    effort: OPENAI_REASONING_EFFORT
                },
                tools: [
                    {
                        type: 'function',
                        name: SUMMARY_FUNCTION_NAME,
                        description: 'Сохранить итоговую суммаризацию звонка для CRM и уведомлений в Telegram.',
                        parameters: SUMMARY_FUNCTION_PARAMETERS
                    }
                ],
                tool_choice: 'auto'
            };

            const openAIRealtimeClientParameters = {
                apiKey: OPENAI_API_KEY,
                model: OPENAI_MODEL,
                type: OpenAI.RealtimeAPIClientType.REALTIME,
                onWebSocketClose
            };

            openAISocketAlive = false;
            openAIRealtimeClient = await OpenAI.createRealtimeAPIClient(openAIRealtimeClientParameters);
            startWebSocketTimer();
            Logger.write('===OPENAI_CLIENT_CREATED===');

            const handleAssistantTranscript = (text, status) => {
                const outputText = normalizeText(text);
                if (!outputText) return;
                clearClientSilenceWaitTimers();
                assistantTurnCompleteQueued = false;
                if (currentUserParts.length) {
                    finalizePhrase('user', currentUserParts, 'complete');
                }
                currentAssistantParts.push(outputText);
                if (status === 'complete') {
                    finalizePhrase('assistant', currentAssistantParts, 'complete');
                    armClientSilenceAfterTurn();
                }
            };

            const handleUserTranscript = (text) => {
                const inputText = normalizeText(text);
                if (!inputText) return;
                clearClientSilenceWaitTimers();
                assistantTurnCompleteQueued = false;
                clientSilencePromptAttemptedForCurrentTurn = false;
                if (currentAssistantParts.length) {
                    finalizePhrase('assistant', currentAssistantParts, 'interrupted');
                }
                currentUserParts.push(inputText);
                finalizePhrase('user', currentUserParts, 'complete');
            };

            const extractOpenAIText = (event, keys) => {
                const { data, payload } = extractEventData(event);
                const sources = [payload, data, event || {}];
                for (let i = 0; i < sources.length; i += 1) {
                    const source = sources[i];
                    if (!source || typeof source !== 'object') continue;
                    for (let j = 0; j < keys.length; j += 1) {
                        const value = source[keys[j]];
                        if (value !== undefined && value !== null && value !== '') return safeString(value);
                    }
                }
                return '';
            };

            let openAIMediaStarted = false;
            const startOpenAIMediaAndPrompt = (tag) => {
                if (openAIMediaStarted || isFinalizing || isSessionTerminated) return;
                openAIMediaStarted = true;
                openAISocketAlive = true;
                VoxEngine.sendMediaBetween(call, openAIRealtimeClient);
                Logger.write(`===OPENAI_MEDIA_STARTED:${tag}===`);

                if (isReconnect) {
                    const reconnectContext = buildReconnectDialogueContext(8);
                    const reconnectPrompt =
                        'Соединение было прервано и восстановлено. Коротко извинись за техническую паузу и продолжи разговор с текущего места. ' +
                        'Не начинай сценарий заново, не дублируй приветствие. ' +
                        (reconnectContext
                            ? `\nПоследние реплики по ролям:\n${reconnectContext}\n`
                            : '\n') +
                        `При закрытии звонка сначала произнеси финальную фразу один раз, затем вызови функцию ${SUMMARY_FUNCTION_NAME}, после функции ничего не говори.`;
                    sendUserTextToModel(reconnectPrompt, 'reconnect_prompt');
                    Logger.write('===RECONNECT_PROMPT_SENT===');
                    return;
                }

                const startPrompt =
                    'Начни разговор с фразы: "Здравствуйте! Меня зовут Екатерина, я ИИ-менеджер компании Crystal Stone. Скажите, как я могу к вам обращаться?" ' +
                    'Говори естественно и коротко, задавай только один вопрос за раз. ' +
                    'Если клиент сразу объясняет запрос, не перебивай и не возвращайся резко в стартовый скрипт. ' +
                    'Если ответ клиента непонятен, слишком тихий или похож на шум, не угадывай имя и скажи: "Повторите громче, пожалуйста." ' +
                    'Если клиент диктует номер телефона, не перебивай и дослушивай номер до конца. ' +
                    `Номер из системы: ${callerPhone || 'неизвестен'}. Уточни его актуальность по ходу разговора. ` +
                    `При закрытии звонка сначала произнеси финальную фразу один раз, затем вызови функцию ${SUMMARY_FUNCTION_NAME}, после функции ничего не говори.`;

                sendUserTextToModel(startPrompt, 'start_prompt');
                Logger.write('===START_PROMPT_SENT===');
            };

            openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.Error, (event) => {
                Logger.write('===OpenAI.RealtimeAPIEvents.Error===');
                Logger.write(JSON.stringify(event || {}));
                applyUsageMetadata(event, 'OpenAIError');
            });

            openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.SessionCreated, (event) => {
                Logger.write('===OpenAI.RealtimeAPIEvents.SessionCreated===');
                Logger.write(JSON.stringify(event || {}));
                openAIRealtimeClient.sessionUpdate({ session: OPENAI_SESSION_CONFIG });
                setTimeout(() => startOpenAIMediaAndPrompt('session_created_delayed'), 350);
            });

            if (OpenAI.RealtimeAPIEvents.SessionUpdated) {
                openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.SessionUpdated, (event) => {
                    Logger.write('===OpenAI.RealtimeAPIEvents.SessionUpdated===');
                    Logger.write(JSON.stringify(event || {}));
                    startOpenAIMediaAndPrompt('session_updated');
                });
            }

            const inputTranscriptDoneEvent = OpenAI.RealtimeAPIEvents.ConversationItemInputAudioTranscriptionCompleted || OpenAI.RealtimeAPIEvents.InputAudioTranscriptionCompleted;
            if (inputTranscriptDoneEvent) {
                openAIRealtimeClient.addEventListener(inputTranscriptDoneEvent, (event) => {
                    Logger.write('===OpenAI.InputAudioTranscriptionCompleted===');
                    Logger.write(JSON.stringify(event || {}));
                    applyUsageMetadata(event, 'InputAudioTranscriptionCompleted');
                    handleUserTranscript(extractOpenAIText(event, ['transcript', 'text']));
                });
            }

            if (OpenAI.RealtimeAPIEvents.ResponseAudioTranscriptDone) {
                openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.ResponseAudioTranscriptDone, (event) => {
                    Logger.write('===OpenAI.RealtimeAPIEvents.ResponseAudioTranscriptDone===');
                    Logger.write(JSON.stringify(event || {}));
                    applyUsageMetadata(event, 'ResponseAudioTranscriptDone');
                    handleAssistantTranscript(extractOpenAIText(event, ['transcript', 'text']), 'complete');
                });
            }

            if (OpenAI.RealtimeAPIEvents.ResponseOutputTextDone) {
                openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.ResponseOutputTextDone, (event) => {
                    Logger.write('===OpenAI.RealtimeAPIEvents.ResponseOutputTextDone===');
                    Logger.write(JSON.stringify(event || {}));
                    applyUsageMetadata(event, 'ResponseOutputTextDone');
                    handleAssistantTranscript(extractOpenAIText(event, ['text', 'transcript']), 'complete');
                });
            }

            if (OpenAI.RealtimeAPIEvents.ResponseDone) {
                openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.ResponseDone, (event) => {
                    Logger.write('===OpenAI.RealtimeAPIEvents.ResponseDone===');
                    Logger.write(JSON.stringify(event || {}));
                    applyUsageMetadata(event, 'ResponseDone');
                    if (!currentAssistantParts.length) armClientSilenceAfterTurn();
                });
            }

            if (OpenAI.RealtimeAPIEvents.InputAudioBufferSpeechStarted) {
                openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.InputAudioBufferSpeechStarted, (event) => {
                    Logger.write('===OpenAI.RealtimeAPIEvents.InputAudioBufferSpeechStarted===');
                    Logger.write(JSON.stringify(event || {}));
                    clearClientSilenceWaitTimers();
                    assistantTurnCompleteQueued = false;
                    if (currentAssistantParts.length) {
                        finalizePhrase('assistant', currentAssistantParts, 'interrupted');
                    }
                    try {
                        if (openAIRealtimeClient && typeof openAIRealtimeClient.clearMediaBuffer === 'function') {
                            openAIRealtimeClient.clearMediaBuffer();
                        }
                    } catch (e) {
                        Logger.write('===OPENAI_CLEAR_MEDIA_BUFFER_ERROR===');
                        Logger.write(String(e));
                    }
                });
            }

            openAIRealtimeClient.addEventListener(OpenAI.RealtimeAPIEvents.ResponseFunctionCallArgumentsDone, (event) => {
                Logger.write('===OpenAI.RealtimeAPIEvents.ResponseFunctionCallArgumentsDone===');
                Logger.write(JSON.stringify(event || {}));
                applyUsageMetadata(event, 'ResponseFunctionCallArgumentsDone');

                const { data, payload } = extractEventData(event);
                const source = payload && Object.keys(payload).length ? payload : data || {};
                const fname = safeString(source.name || source.function_name || source.tool_name);
                const fid = safeString(source.call_id || source.callId || source.id);
                let fargs = source.arguments || source.args || {};
                if (typeof fargs === 'string') {
                    try {
                        fargs = JSON.parse(fargs);
                    } catch (e) {
                        Logger.write('===OPENAI_TOOL_ARGS_PARSE_ERROR===');
                        Logger.write(String(e));
                        fargs = {};
                    }
                }

                Logger.write(`===OPENAI_TOOL_CALL_NAME:${fname}===`);
                Logger.write(`===OPENAI_TOOL_CALL_ID:${fid}===`);
                Logger.write(`===OPENAI_TOOL_CALL_ARGS:${JSON.stringify(fargs)}===`);

                if (fname === SUMMARY_FUNCTION_NAME) {
                    summaryData.client_name = normalizeText(fargs.client_name);
                    summaryData.client_phone = normalizeText(fargs.client_phone || callerPhone);
                    summaryData.call_goal = normalizeText(fargs.call_goal);
                    summaryData.manager_offer = normalizeText(fargs.manager_offer);
                    summaryData.outcome = normalizeText(fargs.outcome);
                    summaryData.next_step = normalizeText(fargs.next_step);
                    summaryData.summary = normalizeText(fargs.summary);
                    summaryReceived = Boolean(summaryData.summary);

                    Logger.write('===SUMMARY_FUNCTION_CAPTURED===');
                    Logger.write(JSON.stringify(summaryData));
                    finishSummaryWait('tool_call_received');
                }
            });

            if (OpenAI.Events && OpenAI.Events.WebSocketMediaStarted) {
                openAIRealtimeClient.addEventListener(OpenAI.Events.WebSocketMediaStarted, (event) => {
                    Logger.write('===OpenAI.Events.WebSocketMediaStarted===');
                    assistantMediaActive = true;
                    assistantTurnCompleteQueued = false;
                    clearClientSilenceWaitTimers();
                    Logger.write(JSON.stringify(event || {}));
                });
            }

            if (OpenAI.Events && OpenAI.Events.WebSocketMediaEnded) {
                openAIRealtimeClient.addEventListener(OpenAI.Events.WebSocketMediaEnded, (event) => {
                    Logger.write('===OpenAI.Events.WebSocketMediaEnded===');
                    assistantMediaActive = false;
                    if (assistantTurnCompleteQueued) {
                        assistantTurnCompleteQueued = false;
                        armClientSilenceAfterTurn();
                    }
                    Logger.write(JSON.stringify(event || {}));
                    applyUsageMetadata(event, 'WebSocketMediaEnded');
                });
            }
        } catch (error) {
            Logger.write('===OPENAI_SESSION_START_ERROR===');
            Logger.write(String(error));
            finalizeSession('start_session_error');
        } finally {
            isStartingOpenAI = false;
        }
    };

    answerTimer = setTimeout(async () => {
        if (isSessionTerminated || isFinalizing) return;

        Logger.write(`===ANSWER_DELAY_MS:${ANSWER_DELAY_MS}===`);
        if (!earlyMediaStarted) {
            Logger.write('===EARLY_MEDIA_NOT_STARTED===');
        }

        call.answer();
        Logger.write('===CALL_ANSWERED===');

        await startOpenAISession();
    }, ANSWER_DELAY_MS);

    startPreAnswerTone();
});
