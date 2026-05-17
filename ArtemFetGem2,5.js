require(Modules.Gemini);
require(Modules.ApplicationStorage);

const ANSWER_DELAY_MS = 5000;
const RINGBACK_COUNTRY = 'RU';
const TELEGRAM_MAX_TEXT_LEN = 3900;
const SUMMARY_REQUEST_TIMEOUT_MS = 12000;

const SUMMARY_FUNCTION_NAME = 'save_call_summary';

const AI_PRICE_IN_TEXT = 0.50;
const AI_PRICE_IN_AUDIO = 3.00;
const AI_PRICE_OUT_TEXT = 2.00;
const AI_PRICE_OUT_AUDIO = 12.00;
const USD_TO_RUB_RATE = 80;
const WEBSOCKET_PRICE_PER_MINUTE_RUB = 0.50;

VoxEngine.addEventListener(AppEvents.CallAlerting, async ({ call }) => {
    let geminiLiveAPIClient;
    let isSessionTerminated = false;
    let isFinalizing = false;
    let answerTimer = null;
    let summaryWaitTimer = null;
    let summaryWaitDone = null;
    let earlyMediaStarted = false;

    let telegramBotToken = '';
    let telegramAdminChatIds = [];
    let telegramUserChatIds = [];

    let callDurationSec = 0;
    let telephonyCostRub = 0;
    let websocketDurationSec = 0;
    let websocketOpenedAtMs = null;

    let callerPhone = '';
    try {
        callerPhone = call.callerid ? String(call.callerid() || '') : '';
    } catch (e) {
        callerPhone = '';
    }

    const usageStats = {
        in_text: 0,
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

    const safeString = (v) => (v === undefined || v === null ? '' : String(v));
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

    const parseChatIdList = (raw) =>
        safeString(raw)
            .split(/[\n,;]+/)
            .map((x) => x.trim())
            .filter((x) => x.length > 0);

    const dedupeList = (arr) => {
        const out = [];
        const seen = {};
        arr.forEach((x) => {
            if (!seen[x]) {
                seen[x] = true;
                out.push(x);
            }
        });
        return out;
    };

    const normalizeText = (text) =>
        safeString(text)
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;:!?])/g, '$1')
            .trim();

    const sanitizeForSummary = (text) =>
        normalizeText(text)
            .replace(/[^\u0400-\u04FFA-Za-z0-9\s.,!?;:()"%+\-]/g, ' ')
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

    const extractClientNameFromDialogue = () => {
        let askedNameRecently = false;

        for (let i = 0; i < dialogue.length; i += 1) {
            const item = dialogue[i];
            const text = sanitizeForSummary(item.text);
            if (!text) continue;

            if (item.role === 'assistant') {
                if (/как\s+вас\s+зовут|ваше\s+имя|представьт/i.test(text)) {
                    askedNameRecently = true;
                }
                continue;
            }

            const direct = text.match(/\bменя\s+зовут\s+([A-Za-zА-Яа-яЁё\-]{2,30})\b/i);
            if (direct && direct[1]) return normalizeName(direct[1]);

            if (askedNameRecently) {
                const candidate = text.match(/\b([A-Za-zА-Яа-яЁё\-]{2,30})\b/);
                if (candidate && candidate[1] && !/^(да|угу|ок|хорошо|нет|da|yes|no)$/i.test(candidate[1])) {
                    return normalizeName(candidate[1]);
                }
                askedNameRecently = false;
            }
        }

        return '';
    };

    const escapeHtml = (text) =>
        safeString(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

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
                    obj.responseTokensDetails !== undefined)
        );

    const applyUsageFromRecord = (record, sourceTag, fingerprintRegistry) => {
        if (!record) return false;

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
        const costInTextUsd = (usageStats.in_text / 1_000_000) * AI_PRICE_IN_TEXT;
        const costInAudioUsd = (usageStats.in_audio / 1_000_000) * AI_PRICE_IN_AUDIO;
        const costOutTextUsd = (usageStats.out_text / 1_000_000) * AI_PRICE_OUT_TEXT;
        const costOutAudioUsd = (usageStats.out_audio / 1_000_000) * AI_PRICE_OUT_AUDIO;

        const totalAiUsd = costInTextUsd + costInAudioUsd + costOutTextUsd + costOutAudioUsd;
        const totalAiRub = totalAiUsd * USD_TO_RUB_RATE;
        const effectiveWebSocketSec = websocketDurationSec > 0 ? websocketDurationSec : callDurationSec;
        const websocketRub = (effectiveWebSocketSec / 60) * WEBSOCKET_PRICE_PER_MINUTE_RUB;
        const totalVoximplantRub = telephonyCostRub + websocketRub;
        const totalRub = totalAiRub + totalVoximplantRub;

        return {
            costInTextUsd,
            costInAudioUsd,
            costOutTextUsd,
            costOutAudioUsd,
            totalAiUsd,
            totalAiRub,
            websocketRub,
            effectiveWebSocketSec,
            totalVoximplantRub,
            totalRub
        };
    };

    const getSummaryOrFallback = () => {
        if (summaryReceived && normalizeText(summaryData.summary)) {
            return {
                client_name: sanitizeForSummary(summaryData.client_name),
                client_phone: sanitizeForSummary(summaryData.client_phone || callerPhone),
                call_goal: clipText(summaryData.call_goal, 350),
                manager_offer: clipText(summaryData.manager_offer, 350),
                outcome: clipText(summaryData.outcome, 200),
                next_step: clipText(summaryData.next_step, 200),
                summary: clipText(summaryData.summary, 350)
            };
        }

        ensureDialogueFinalized();

        const userTexts = dialogue
            .filter((x) => x.role === 'user')
            .map((x) => sanitizeForSummary(x.text))
            .filter((x) => /[A-Za-zА-Яа-яЁё]{3,}/.test(x))
            .join(' ')
            .trim();

        const assistantTexts = dialogue
            .filter((x) => x.role === 'assistant')
            .map((x) => sanitizeForSummary(x.text))
            .filter((x) => /[A-Za-zА-Яа-яЁё]{3,}/.test(x))
            .join(' ')
            .trim();

        const inferredName = extractClientNameFromDialogue();
        const callGoal = clipText(summaryData.call_goal || userTexts, 350);
        const managerOffer = clipText(summaryData.manager_offer || assistantTexts, 350);
        const outcome = clipText(summaryData.outcome || 'Разговор завершен.', 200);
        const nextStep = clipText(summaryData.next_step || 'Требуется обработка менеджером.', 200);
        const compactSummary = clipText(
            summaryData.summary ||
                `Клиент обратился по вопросу: ${callGoal || 'не определено'}. Менеджер провел первичную консультацию. Требуется дальнейшая обработка менеджером.`,
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

    const trimMessage = (text) => {
        const t = safeString(text);
        if (t.length <= TELEGRAM_MAX_TEXT_LEN) return t;
        return `${t.slice(0, TELEGRAM_MAX_TEXT_LEN - 16)}\n... (truncated)`;
    };

    const sendTelegramMessage = (chatId, htmlText, tag, done) => {
        if (!telegramBotToken) {
            Logger.write(`===TG_SKIP_NO_BOT_TOKEN:${tag}===`);
            done();
            return;
        }

        if (!chatId) {
            Logger.write(`===TG_SKIP_EMPTY_CHAT_ID:${tag}===`);
            done();
            return;
        }

        if (typeof Net === 'undefined' || typeof Net.httpRequest !== 'function') {
            Logger.write(`===TG_SKIP_NET_UNAVAILABLE:${tag}===`);
            done();
            return;
        }

        const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            postData: JSON.stringify({
                chat_id: chatId,
                text: trimMessage(htmlText),
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        };

        Logger.write(`===TG_SEND_START:${tag} chat=${chatId}===`);

        Net.httpRequest(
            telegramUrl,
            (res) => {
                Logger.write(`===TG_SEND_DONE:${tag} chat=${chatId} code=${res.code}===`);
                Logger.write(safeString(res.text));
                done();
            },
            options
        );
    };

    const sendTelegramToMany = (chatIds, htmlText, tag, done) => {
        const ids = dedupeList(chatIds || []);
        if (!ids.length) {
            Logger.write(`===TG_NO_RECIPIENTS:${tag}===`);
            done();
            return;
        }

        let idx = 0;
        const sendNext = () => {
            if (idx >= ids.length) {
                done();
                return;
            }
            const chatId = ids[idx++];
            sendTelegramMessage(chatId, htmlText, `${tag}#${idx}`, sendNext);
        };

        sendNext();
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

        lines.push('<b>Новый звонок (суммаризация)</b>');
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

    const closeGeminiClient = () => {
        try {
            if (geminiLiveAPIClient) {
                stopWebSocketTimer('close_client');
                Logger.write('===GEMINI_CLIENT_CLOSE_START===');
                geminiLiveAPIClient.close();
                Logger.write('===GEMINI_CLIENT_CLOSE_DONE===');
            }
        } catch (e) {
            Logger.write('===GEMINI_CLIENT_CLOSE_ERROR===');
            Logger.write(String(e));
        }
        geminiLiveAPIClient = null;
    };

    const sendAllReportsAndTerminate = () => {
        const adminIds = dedupeList(telegramAdminChatIds);
        const summaryRecipients = dedupeList([].concat(telegramAdminChatIds, telegramUserChatIds));

        Logger.write('===REPORT_RECIPIENTS===');
        Logger.write(JSON.stringify({ adminIds, summaryRecipients }));

        const adminText = buildAdminReportHtml();
        const summaryText = buildSummaryReportHtml();

        sendTelegramToMany(adminIds, adminText, 'ADMIN_REPORT', () => {
            sendTelegramToMany(summaryRecipients, summaryText, 'SUMMARY_REPORT', () => {
                if (!isSessionTerminated) {
                    isSessionTerminated = true;
                    Logger.write('===VOX_TERMINATE===');
                    VoxEngine.terminate();
                }
            });
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

        if (!geminiLiveAPIClient) {
            Logger.write('===SUMMARY_REQUEST_SKIP:no_gemini_client===');
            done('no_client');
            return;
        }

        if (!summaryRequestSent) {
            summaryRequestSent = true;

            const requestText = `
Разговор завершен. Теперь обязательно вызови функцию ${SUMMARY_FUNCTION_NAME}.
Заполни поля:
- client_name
- client_phone
- call_goal
- manager_offer
- outcome
- next_step
- summary

Требования:
- summary: 2-4 предложения, суть звонка и результат.
- call_goal / manager_offer / outcome / next_step: кратко и предметно.
- Никакого дополнительного текста в ответ, только function call.
            `;

            Logger.write('===SUMMARY_REQUEST_SEND_START===');
            try {
                geminiLiveAPIClient.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: requestText }] }],
                    turnComplete: true
                });
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

        Logger.write(`===FINALIZE_START:${reason}===`);

        if (answerTimer) {
            clearTimeout(answerTimer);
            answerTimer = null;
        }

        requestSummaryViaFunction((summaryReason) => {
            Logger.write(`===FINALIZE_AFTER_SUMMARY:${summaryReason}===`);
            closeGeminiClient();
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

    call.addEventListener(CallEvents.Disconnected, (event) => {
        Logger.write('===CALL_DISCONNECTED===');
        Logger.write(JSON.stringify(event || {}));
        setCallMetaFromEvent(event);
        finalizeSession('call_disconnected');
    });

    call.addEventListener(CallEvents.Failed, (event) => {
        Logger.write('===CALL_FAILED===');
        Logger.write(JSON.stringify(event || {}));
        setCallMetaFromEvent(event);
        finalizeSession('call_failed');
    });

    const onWebSocketClose = (event) => {
        Logger.write('===ON_WEB_SOCKET_CLOSE===');
        Logger.write(JSON.stringify(event || {}));
        stopWebSocketTimer('ws_close_event');
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
    const startGeminiSession = async () => {
        try {
            const [apiKeyEntry, tgBotEntry, tgAdminEntry, tgUserEntry, tgLegacyChatEntry] = await Promise.all([
                ApplicationStorage.get('GEMINI_API_KEY'),
                ApplicationStorage.get('TELEGRAM_BOT_TOKEN'),
                ApplicationStorage.get('TELEGRAM_CHAT_ID_ADMIN'),
                ApplicationStorage.get('TELEGRAM_CHAT_ID_USER'),
                ApplicationStorage.get('TELEGRAM_CHAT_ID')
            ]);

            const GEMINI_API_KEY = apiKeyEntry && apiKeyEntry.value;
            const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

            telegramBotToken = safeString(tgBotEntry && tgBotEntry.value).trim();

            const adminRaw = safeString((tgAdminEntry && tgAdminEntry.value) || (tgLegacyChatEntry && tgLegacyChatEntry.value));
            const userRaw = safeString(tgUserEntry && tgUserEntry.value);

            telegramAdminChatIds = parseChatIdList(adminRaw);
            telegramUserChatIds = parseChatIdList(userRaw);

            Logger.write('===CONFIG_LOADED===');
            Logger.write(
                JSON.stringify({
                    hasGeminiKey: Boolean(GEMINI_API_KEY),
                    hasTelegramToken: Boolean(telegramBotToken),
                    adminChats: telegramAdminChatIds,
                    userChats: telegramUserChatIds,
                    callerPhone
                })
            );

            if (!GEMINI_API_KEY) {
                Logger.write('===NO_GEMINI_API_KEY_IN_APPLICATION_STORAGE===');
                finalizeSession('no_gemini_key');
                return;
            }

            const GEMINI_CONNECT_CONFIG = {
                responseModalities: ['AUDIO'],

                thinkingConfig: {
                    thinkingBudget: 0,
                    includeThoughts: false
                },

                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }
                    }
                },

                realtimeInputConfig: {
                    automaticActivityDetection: {
                        prefixPaddingMs: 20,
                        silenceDurationMs: 100,
                        endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH'
                    },
                    activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
                },

                inputAudioTranscription: {},
                outputAudioTranscription: {},

                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: SUMMARY_FUNCTION_NAME,
                                description:
                                    'Сохранить итоговую суммаризацию звонка для CRM и уведомлений в Telegram.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        client_name: { type: 'string', description: 'Имя клиента' },
                                        client_phone: { type: 'string', description: 'Подтвержденный номер телефона клиента' },
                                        call_goal: { type: 'string', description: 'Что хотел клиент' },
                                        manager_offer: { type: 'string', description: 'Что предложил менеджер' },
                                        outcome: { type: 'string', description: 'Итог разговора' },
                                        next_step: { type: 'string', description: 'Следующее действие после звонка' },
                                        summary: { type: 'string', description: 'Короткая итоговая суммаризация (2-4 предложения)' }
                                    },
                                    required: ['summary', 'call_goal', 'outcome']
                                }
                            }
                        ]
                    }
                ],

                systemInstruction: {
                    parts: [
                        {
                            text: `
Ты — Екатерина, приветливый, уверенный и компетентный менеджер мебельной мастерской «Just Wood» (Джаст Вуд).
Ты общаешься голосом по телефону. Твоя речь должна быть живой, естественной, без зачитывания длинных списков. Говори кратко, делай паузы, задавай уточняющие вопросы.

Твоя ГЛАВНАЯ ЦЕЛЬ: Ответить на базовые вопросы клиента, показать экспертность и обязательно пригласить его на личную встречу (в мастерскую или вызвать замерщика).

===== СТРОГИЕ ПРАВИЛА =====
1. Никогда не называй точную стоимость по телефону. Объясняй, что цена зависит от материалов и размеров, поэтому нужен проект.
2. Не обещай точных сроков. Говори: "в среднем от 1 до 2 месяцев".
3. Не говори, что ты искусственный интеллект. Ты — менеджер Екатерина.
4. Если клиент просит портфолио или ссылки, скажи:
"Я обязательно передам ваш номер нашему руководителю Леониду, и он пришлет вам ссылки и примеры работ в мессенджер".
5. Имя клиента и номер телефона не спрашивай в самой первой реплике. Сначала коротко выясни запрос, затем в первых 2-4 репликах узнай имя.
6. Номер телефона уточняй после выявления запроса или перед завершением разговора. Если номер уже известен, аккуратно подтверди его.
7. Если клиент спрашивает цену замера, отвечай: "Замер стоит 2500 рублей, и при заключении договора эта сумма вычитается из стоимости мебели".

===== БАЗА ЗНАНИЙ =====
О компании:
- Мастерская мебели «Just Wood»
- Руководитель: Леонид
- Адрес производства: Санкт-Петербург, ул. Александра Матросова 4, корпус 2Н
- Работаем по будням, на замеры выезжаем и в выходные

Что делаем:
- Основная специализация — кухни на заказ
- Также делаем корпусную мебель, шкафы, гостиные, меблировку квартир по дизайн-проектам
- Стили: современный, лофт, классика
- Не делаем мягкую мебель и фасады из массива дерева под лаком

Материалы:
- Корпуса: ЛДСП Egger
- Фурнитура: Amix, Boyard, Blum, Hettich
- Фасады: МДФ, пленка, эмаль, алюминиевые профили со стеклом (алюминиевые фасады заказываем в компании «Омега-Дизайн»)
- Столешницы: постформинг, акриловый камень, массив дерева

Сроки и условия:
- Срок изготовления: 1–2 месяца
- Кухни обычно от 300 000 до 1 000 000 рублей
- 3D-проект бесплатно, без фотореалистичной визуализации
- Оплата: наличные, безнал, карта
- Предоплата: 70%
- Гарантия: 1 год
- Замер: 2500 рублей, при договоре сумма вычитается из стоимости мебели

===== СТИЛЬ ОБЩЕНИЯ =====
- Говори коротко и естественно
- Выявляй потребность
- Задавай 1 уточняющий вопрос за раз
- Не перечисляй слишком много пунктов подряд
- Мягко веди к встрече / замеру

===== ФУНКЦИЯ СУММАРИЗАЦИИ =====
Когда разговор завершается и ты собрала ключевые данные, ОБЯЗАТЕЛЬНО вызови функцию save_call_summary.
Передай в функцию имя клиента, номер, цель звонка, что предложено, итог, следующий шаг и краткую суммаризацию.
                            `
                        }
                    ]
                }
            };

            const geminiLiveAPIClientParameters = {
                apiKey: GEMINI_API_KEY,
                model: GEMINI_MODEL,
                connectConfig: GEMINI_CONNECT_CONFIG,
                backend: Gemini.Backend.GEMINI_API,
                onWebSocketClose
            };

            geminiLiveAPIClient = await Gemini.createLiveAPIClient(geminiLiveAPIClientParameters);
            startWebSocketTimer();
            Logger.write('===GEMINI_CLIENT_CREATED===');

            geminiLiveAPIClient.addEventListener(Gemini.LiveAPIEvents.Unknown, (event) => {
                Logger.write('===Gemini.LiveAPIEvents.Unknown===');
                Logger.write(JSON.stringify(event));

                const { payload, customEvent } = extractEventData(event);
                if (customEvent) {
                    Logger.write(`===UNKNOWN_CUSTOM_EVENT:${customEvent}===`);
                }
                if (customEvent === 'UsageMetadata') {
                    Logger.write('===USAGE_METADATA_CUSTOM_EVENT_SEEN===');
                }
                applyUsageMetadata(event, 'Unknown');
            });

            geminiLiveAPIClient.addEventListener(Gemini.LiveAPIEvents.ToolCall, (event) => {
                Logger.write('===Gemini.LiveAPIEvents.ToolCall===');
                Logger.write(JSON.stringify(event));
                applyUsageMetadata(event, 'ToolCall');

                const { payload } = extractEventData(event);
                const functionCalls = payload.functionCalls || [];

                functionCalls.forEach((fc) => {
                    const fname = safeString(fc && fc.name);
                    const fid = safeString(fc && fc.id);
                    let fargs = (fc && fc.args) || {};

                    if (typeof fargs === 'string') {
                        try {
                            fargs = JSON.parse(fargs);
                        } catch (e) {
                            Logger.write('===TOOL_ARGS_PARSE_ERROR===');
                            Logger.write(String(e));
                            fargs = {};
                        }
                    }

                    Logger.write(`===TOOL_CALL_NAME:${fname}===`);
                    Logger.write(`===TOOL_CALL_ID:${fid}===`);
                    Logger.write(`===TOOL_CALL_ARGS:${JSON.stringify(fargs)}===`);

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

                    if (fid) {
                        try {
                            geminiLiveAPIClient.sendToolResponse({
                                functionResponses: [
                                    {
                                        id: fid,
                                        name: fname || SUMMARY_FUNCTION_NAME,
                                        response: {
                                            result: 'ok'
                                        }
                                    }
                                ]
                            });
                            Logger.write(`===TOOL_RESPONSE_SENT:${fname}===`);
                        } catch (e) {
                            Logger.write('===TOOL_RESPONSE_ERROR===');
                            Logger.write(String(e));
                        }
                    }
                });
            });

            geminiLiveAPIClient.addEventListener(Gemini.LiveAPIEvents.SetupComplete, () => {
                Logger.write('===Gemini.LiveAPIEvents.SetupComplete===');

                VoxEngine.sendMediaBetween(call, geminiLiveAPIClient);

                const startPrompt =
                    'Поздоровайся с клиентом на русском как Екатерина из Just Wood и кратко уточни, какая мебель нужна. ' +
                    'В первой реплике не спрашивай имя и номер телефона. ' +
                    `Номер из системы для последующего уточнения: ${callerPhone || 'неизвестен'}.`;

                geminiLiveAPIClient.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: startPrompt }] }],
                    turnComplete: true
                });

                Logger.write('===START_PROMPT_SENT===');
            });

            geminiLiveAPIClient.addEventListener(Gemini.LiveAPIEvents.ServerContent, (event) => {
                Logger.write('===Gemini.LiveAPIEvents.ServerContent===');

                const { payload, customEvent } = extractEventData(event);
                if (customEvent) {
                    Logger.write(`===SERVER_CONTENT_CUSTOM_EVENT:${customEvent}===`);
                }

                applyUsageMetadata(event, 'ServerContent');

                Logger.write(JSON.stringify(payload));

                const inputText =
                    payload.inputTranscription && payload.inputTranscription.text
                        ? safeString(payload.inputTranscription.text)
                        : '';
                const outputText =
                    payload.outputTranscription && payload.outputTranscription.text
                        ? safeString(payload.outputTranscription.text)
                        : '';

                if (inputText) {
                    if (currentAssistantParts.length) {
                        finalizePhrase('assistant', currentAssistantParts, 'interrupted');
                    }
                    currentUserParts.push(inputText);
                }

                if (outputText) {
                    if (currentUserParts.length) {
                        finalizePhrase('user', currentUserParts, 'complete');
                    }
                    currentAssistantParts.push(outputText);
                }

                if (payload.interrupted === true) {
                    Logger.write('===AGENT_INTERRUPTED===');
                    if (currentAssistantParts.length) {
                        finalizePhrase('assistant', currentAssistantParts, 'interrupted');
                    }
                    geminiLiveAPIClient.clearMediaBuffer();
                }

                if (payload.turnComplete === true && currentAssistantParts.length) {
                    finalizePhrase('assistant', currentAssistantParts, 'complete');
                }
            });

            geminiLiveAPIClient.addEventListener(Gemini.Events.WebSocketMediaStarted, (event) => {
                Logger.write('===Gemini.Events.WebSocketMediaStarted===');
                Logger.write(JSON.stringify(event));
            });

            geminiLiveAPIClient.addEventListener(Gemini.Events.WebSocketMediaEnded, (event) => {
                Logger.write('===Gemini.Events.WebSocketMediaEnded===');
                Logger.write(JSON.stringify(event));
                applyUsageMetadata(event, 'WebSocketMediaEnded');
            });
        } catch (error) {
            Logger.write('===SOMETHING_WENT_WRONG===');
            Logger.write(String(error));
            finalizeSession('start_session_error');
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

        await startGeminiSession();
    }, ANSWER_DELAY_MS);

    startPreAnswerTone();
});


