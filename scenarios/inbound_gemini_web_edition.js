require(Modules.Gemini);
require(Modules.ApplicationStorage);

/*
 * Inbound callback scenario draft for Amix outbound campaign.
 *
 * Do not bind this file to the production incoming rule until the current
 * inbound scenario is intentionally replaced.
 *
 * Voximplant ApplicationStorage:
 * - GEMINI_API_KEY
 * - BACKEND_URL, for example https://obzvonai.ru
 * - BACKEND_WEBHOOK_SECRET
 */

const BACKEND_URL_FALLBACK = 'https://obzvonai.ru';
const BACKEND_WEBHOOK_SECRET_FALLBACK = '';

const PROJECT_NAME = 'artem_fitisov';
const SCRIPT_NAME = 'inbound_gemini_web_edition.js';
const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_VOICE_NAME = 'Kore';
const SUMMARY_FUNCTION_NAME = 'save_call_summary';
const END_CALL_FUNCTION_NAME = 'end_current_call';

const CALL_RECORD_ENABLED = true;
const MAX_CALL_DURATION_MS = 5 * 60 * 1000;
const SUMMARY_REQUEST_TIMEOUT_MS = 15000;
const CALLER_CONTEXT_FETCH_TIMEOUT_MS = 3500;
const WEBSOCKET_PRICE_PER_MINUTE_RUB = 0.5;

const AI_PRICE_IN_TEXT = 0.5;
const AI_PRICE_IN_AUDIO = 3.0;
const AI_PRICE_OUT_TEXT = 2.0;
const AI_PRICE_OUT_AUDIO = 12.0;
const USD_TO_RUB_RATE = 80;

const safeString = (value) => (value === undefined || value === null ? '' : String(value));
const normalizePhone = (value) =>
    safeString(value)
        .replace(/[^\d+]/g, '')
        .replace(/^\+/, '')
        .replace(/^8(\d{10})$/, '7$1');
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const toFixedNumber = (value, digits) => Number(toNumber(value).toFixed(digits));
const parseJsonMaybe = (value) => {
    if (!value || typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
};
const normalizeText = (text) =>
    safeString(text)
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
const clipText = (text, maxLen) => {
    const clean = normalizeText(text);
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen).replace(/\s+\S*$/, '').trim();
};
const extractText = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value.text !== undefined) return safeString(value.text);
    if (value.transcript !== undefined) return safeString(value.transcript);
    return '';
};
const extractEventPayload = (event) =>
    event && event.data && event.data.payload ? event.data.payload : {};

const getLeadFirstName = (leadContext) => {
    const rawName = safeString(leadContext && (leadContext.client_name || leadContext.name)).trim();
    if (!rawName) return '';
    return rawName.split(/\s+/)[0];
};

const buildLeadContextText = (callerContext) => {
    if (!callerContext || !callerContext.known) {
        return 'Backend не нашел номер в базе обзвона. Сначала аккуратно уточни, по какому вопросу звонит человек.';
    }

    const text = safeString(callerContext.context_text).trim();
    if (text) return text;

    const lead = callerContext.lead_context || {};
    const lines = [];
    if (lead.client_name) lines.push(`Имя клиента: ${lead.client_name}.`);
    if (lead.company) lines.push(`Компания/ниша: ${lead.company}.`);
    if (lead.attendance_status) lines.push(`Статус участия в Amix: ${lead.attendance_status}.`);
    if (lead.context) lines.push(`Контекст: ${lead.context}.`);
    return lines.join('\n') || 'Номер найден в базе, но подробного контекста нет.';
};

const buildOpeningInstruction = (callerPhone, callerContext) => {
    const leadContext = (callerContext && callerContext.lead_context) || {};
    const firstName = getLeadFirstName(leadContext);
    const namePart = firstName ? `${firstName}, ` : '';
    const attendedText = 'вы регистрировались на мебельное мероприятие Amix в марте';

    if (callerContext && callerContext.known) {
        return `Абонент сам перезвонил с номера ${callerPhone}. Не жди его первой длинной реплики. Скажи одним сообщением: "${namePart}добрый день! Это Екатерина, AI-помощник. Мы вам звонили по базе форума Amix, возможно, вы перезваниваете. Напомню: ${attendedText}. Можно я задам 3-4 коротких вопроса?"`;
    }

    return `Абонент сам позвонил с номера ${callerPhone}, но backend не нашел его в базе обзвона. Скажи одним сообщением: "Добрый день! Екатерина, AI-помощник. Подскажите, пожалуйста, вы по какому вопросу звоните?"`;
};

const buildSystemInstruction = (callerPhone, callerContext) => `
Ты — Екатерина, голосовой AI-помощник проекта «Цифровые Решения».
Это входящий звонок. Человек мог перезвонить после исходящего обзвона базы участников мебельного форума Amix.

Главная логика:
1. Если backend нашел номер в базе или истории обзвона, объясни, что мы могли звонить по базе форума Amix.
2. Если человек перезванивает по пропущенному, не говори "мы не дозвонились" обвинительно. Говори мягко: "мы вам звонили по базе форума Amix, возможно, вы перезваниваете".
3. Дальше веди тот же короткий опрос, что и в исходящем сценарии.
4. Не продавай AI первым сообщением. Цель — собрать ответы по базе участников.
5. Если человек спрашивает про AI или компанию, отвечай коротко и возвращайся к опросу.
6. Если backend не нашел номер, сначала уточни, по какому вопросу звонят, и только потом при релевантности расскажи, что ты AI-помощник проекта «Цифровые Решения».

Контекст из backend:
${buildLeadContextText(callerContext)}

Кто звонит и что за компания:
— Ты Екатерина, AI-помощник проекта «Цифровые Решения».
— Проект занимается внедрением AI-инструментов в бизнес: голосовые помощники для входящих и исходящих звонков, обработка заявок, фиксация ответов, транскрибация разговоров, summary, отчеты и передача данных менеджерам.
— Руководитель проекта: Артём Фетисов.
— Сайт: www.cifresh.ru.
— Контакты для связи с Артёмом: ar.fetisov@gmail.com, info@cifresh.ru, телефон +7 911 188-14-66, WhatsApp/Telegram +7 965 034-88-52.

Основной сценарий, если звонящий из базы Amix:
1. После стартовой реплики НЕ задавай сразу второй вопрос. Сначала дождись ответа на «можно я задам 3-4 коротких вопроса?».
2. Если человек согласился, коротко подтверди и сразу переходи к бизнес-вопросам: «Ага, спасибо, поняла вас. Тогда буквально пару вопросов задам.»
3. «У вас мебельное производство или вы дизайном занимаетесь?»
4. «Вы руководитель компании, как я понимаю?»
5. «Подскажите, а какой у вас средний чек?»
6. «А у вас в основном по рекламе клиенты обращаются или по сарафану?»
7. В конце спроси коротко: «И последний короткий вопрос: оцените, пожалуйста, мою работу по 10-балльной шкале.»
8. Заверши: «Спасибо вам за уделенное время. Желаем вам много щедрых клиентов и интересных проектов!»

Живой стиль:
Говори спокойно и разговорно. Можно использовать короткие связки: «Угу», «Ага», «Поняла вас», «Хорошо, спасибо», «Тогда уточню еще один момент».
Не вставляй междометия в каждую фразу. Не задавай несколько вопросов подряд. Не перебивай.
Если плохо расслышала, не поняла ответ по смыслу или ответ не подходит к вопросу:
— не додумывай и не записывай предположение как факт;
— в начале разговора при первой же нечеткой реплике обязательно попроси говорить громче короткой фразой;
— используй короткие строгие реплики: «Повторите громче, пожалуйста», «Говорите громче, пожалуйста», «Я вас плохо слышу, говорите громче, пожалуйста», «Не поняла, повторите громче, пожалуйста»;
— не объясняй долго причину, не извиняйся длинно, не задавай новый вопрос, пока не получила понятный ответ.

Если ты понимаешь, что разговариваешь не с живым человеком, а с автоответчиком, голосовой почтой, умной защитой МТС/Т-Банка, виртуальным секретарем оператора, роботом, IVR-меню или слышишь фразы вроде «абонент не может ответить», «телефон выключен», «нажмите 1», «оставьте сообщение», не продолжай сценарий и не задавай вопросы. Коротко зафиксируй итог: «Поняла, абонент сейчас недоступен. Завершаю звонок.» Затем обязательно вызови функцию ${END_CALL_FUNCTION_NAME} с причиной `non_human_or_unavailable`.

Когда разговор завершен или собраны основные ответы, обязательно вызови функцию ${SUMMARY_FUNCTION_NAME}.

Передавай:
— client_name: имя собеседника, если известно или названо;
— client_phone: номер звонящего, обычно ${callerPhone};
— call_goal: что это был входящий перезвон/входящий звонок по базе Amix;
— manager_offer: собранные ответы: производство/дизайн, роль, средний чек, канал клиентов и оценка;
— activity_type: мебельное производство, дизайн или другой профиль;
— is_decision_maker: да/нет/неизвестно;
— average_check: средний чек, если назвали;
— traffic_source: реклама, сарафан, входящие, смешанный канал или неизвестно;
— bot_impression: оценка разговора по 10-балльной шкале и реакция на AI только если человек сам это сказал;
— outcome: итог разговора;
— next_step: что делать дальше;
— summary: 2-4 предложения с главным результатом.
`;

VoxEngine.addEventListener(AppEvents.CallAlerting, async ({ call }) => {
    let backendUrl = '';
    let backendWebhookSecret = '';
    let apiKey = '';
    let callerContext = null;
    let activeGeminiClient = null;
    let callConnected = false;
    let callAnswered = false;
    let callDone = false;
    let finalizeSent = false;
    let summaryReceived = false;
    let summaryRequestSent = false;
    let summaryWaitTimer = null;
    let maxCallTimer = null;
    let recordingRequested = false;
    let recordingStarted = false;
    let recordingFailed = false;
    let recordingUrl = '';
    let recordingErrorText = '';
    let callDurationSec = 0;
    let telephonyCostRub = 0;
    let websocketOpenedAtMs = null;
    let websocketDurationSec = 0;
    let finalizationReason = '';
    let openingPromptSent = false;

    const dialogue = [];
    let currentUserParts = [];
    let currentAssistantParts = [];

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

    const summaryData = {
        client_name: '',
        client_phone: '',
        call_goal: '',
        manager_offer: '',
        activity_type: '',
        is_decision_maker: '',
        average_check: '',
        traffic_source: '',
        bot_impression: '',
        outcome: '',
        next_step: '',
        summary: ''
    };

    const getCallSessionId = () => {
        try {
            if (call && typeof call.id === 'function') return safeString(call.id());
        } catch (e) {}
        return `inbound-${Date.now()}`;
    };

    const getCallerPhone = () => {
        try {
            if (call && typeof call.callerid === 'function' && call.callerid()) {
                return normalizePhone(call.callerid());
            }
        } catch (e) {}
        try {
            if (call && typeof call.number === 'function' && call.number()) {
                return normalizePhone(call.number());
            }
        } catch (e) {}
        return '';
    };

    const callerPhone = getCallerPhone();
    const sessionId = getCallSessionId();

    const sendToBackend = (endpoint, payload, tag, done) => {
        if (!backendUrl || typeof Net === 'undefined' || typeof Net.httpRequest !== 'function') {
            Logger.write(`===BACKEND_SKIP:${tag}===`);
            if (done) done(null);
            return;
        }
        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            postData: JSON.stringify(payload)
        };
        if (backendWebhookSecret) options.headers['X-Webhook-Secret'] = backendWebhookSecret;

        Net.httpRequest(
            backendUrl + endpoint,
            (res) => {
                Logger.write(`===BACKEND_DONE:${tag} code=${res && res.code}===`);
                Logger.write(safeString(res && res.text));
                if (done) done(res);
            },
            options
        );
    };

    const sendStatus = (stage, message, data) => {
        sendToBackend(
            '/webhook/voximplant/status',
            {
                stage,
                status: 'ok',
                message: safeString(message),
                session_id: sessionId,
                phone: callerPhone,
                timestamp_utc: new Date().toISOString(),
                data: data || {}
            },
            `STATUS:${stage}`
        );
    };

    const fetchCallerContext = () =>
        new Promise((resolve) => {
            if (!backendUrl || !callerPhone || typeof Net === 'undefined' || typeof Net.httpRequest !== 'function') {
                resolve(null);
                return;
            }

            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                resolve(value);
            };
            const timeoutTimer = setTimeout(() => {
                Logger.write('===CALLER_CONTEXT_FETCH_TIMEOUT===');
                finish(null);
            }, CALLER_CONTEXT_FETCH_TIMEOUT_MS);

            const options = { method: 'GET', headers: {} };
            if (backendWebhookSecret) options.headers['X-Webhook-Secret'] = backendWebhookSecret;

            Net.httpRequest(
                `${backendUrl}/inbound/caller-context?phone=${encodeURIComponent(callerPhone)}`,
                (res) => {
                    Logger.write(`===CALLER_CONTEXT_FETCH_DONE code=${res && res.code}===`);
                    if (!res || res.code < 200 || res.code >= 300) {
                        Logger.write(safeString(res && res.text));
                        finish(null);
                        return;
                    }
                    finish(parseJsonMaybe(safeString(res.text)));
                },
                options
            );
        });

    const sendUserTextToModel = (client, text, tag) => {
        if (!client) return;
        const payloadText = safeString(text);
        if (typeof client.sendRealtimeInput === 'function') {
            try {
                client.sendRealtimeInput({ text: payloadText });
                Logger.write(`===MODEL_TEXT_SENT_REALTIME_INPUT:${tag}===`);
                return;
            } catch (e) {
                Logger.write(`===MODEL_TEXT_REALTIME_INPUT_ERROR:${tag}===`);
                Logger.write(String(e));
            }
        }
        client.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: payloadText }] }],
            turnComplete: true
        });
        Logger.write(`===MODEL_TEXT_SENT_CLIENT_CONTENT:${tag}===`);
    };

    const finalizePhrase = (role, parts, status) => {
        const text = normalizeText(parts.join(''));
        parts.length = 0;
        if (text) dialogue.push({ role, text, status: status || 'complete' });
    };
    const ensureDialogueFinalized = () => {
        if (currentUserParts.length) finalizePhrase('user', currentUserParts, 'partial');
        if (currentAssistantParts.length) finalizePhrase('assistant', currentAssistantParts, 'partial');
    };
    const formatDialogueText = () => {
        ensureDialogueFinalized();
        return dialogue.map((item) => `${item.role === 'user' ? 'Клиент' : 'AI'}: ${item.text}`).join('\n');
    };

    const applyUsageMetadata = (payload) => {
        const usage = payload && payload.usageMetadata;
        if (!usage) return;
        const applyItems = (items, direction) => {
            (items || []).forEach((item) => {
                const modality = safeString(item && item.modality).toUpperCase();
                const count = toNumber(item && item.tokenCount);
                const key = `${direction}_${modality === 'TEXT' || modality === 'AUDIO' || modality === 'VIDEO' ? modality.toLowerCase() : 'unknown'}`;
                usageStats[key] += count;
            });
        };
        applyItems(usage.promptTokensDetails || [], 'in');
        applyItems(usage.responseTokensDetails || [], 'out');
        usageStats.usage_events += 1;
    };

    const getRecordingStatus = () => {
        if (!CALL_RECORD_ENABLED) return 'disabled';
        if (recordingUrl) return 'ready';
        if (recordingStarted) return 'started_no_url';
        if (recordingFailed) return 'error';
        if (recordingRequested) return 'requested_not_confirmed';
        return 'not_started';
    };

    const calcCosts = () => {
        const websocketSec = websocketDurationSec || (websocketOpenedAtMs ? (Date.now() - websocketOpenedAtMs) / 1000 : 0);
        const websocketRub = (websocketSec / 60) * WEBSOCKET_PRICE_PER_MINUTE_RUB;
        const aiUsd =
            (usageStats.in_text / 1000000) * AI_PRICE_IN_TEXT +
            (usageStats.in_audio / 1000000) * AI_PRICE_IN_AUDIO +
            (usageStats.out_text / 1000000) * AI_PRICE_OUT_TEXT +
            (usageStats.out_audio / 1000000) * AI_PRICE_OUT_AUDIO;
        const aiRub = aiUsd * USD_TO_RUB_RATE;
        const voximplantRub = toNumber(telephonyCostRub) + websocketRub;
        return { websocketSec, websocketRub, aiUsd, aiRub, voximplantRub, totalRub: voximplantRub + aiRub };
    };

    const getSummaryOrFallback = () => {
        if (summaryReceived && normalizeText(summaryData.summary)) return summaryData;
        const lead = (callerContext && callerContext.lead_context) || {};
        return {
            client_name: safeString(lead.client_name),
            client_phone: callerPhone,
            call_goal: 'Входящий звонок или перезвон после исходящего обзвона базы Amix.',
            manager_offer: 'AI-помощник обработал входящий звонок и попытался продолжить опрос по базе Amix.',
            activity_type: '',
            is_decision_maker: '',
            average_check: '',
            traffic_source: '',
            bot_impression: '',
            outcome: finalizationReason || 'Входящий звонок завершен.',
            next_step: 'Проверить запись и summary входящего звонка.',
            summary: `Входящий звонок с номера ${callerPhone}. Итог: ${finalizationReason || 'завершен'}.`
        };
    };

    const sendRecordingReady = (tag) => {
        if (!recordingUrl) return;
        sendStatus('recording_ready', 'Запись разговора готова', { tag, recording_status: getRecordingStatus() });
        sendToBackend(
            '/webhook/voximplant/recording_ready',
            {
                session_id: sessionId,
                project: PROJECT_NAME,
                script_name: SCRIPT_NAME,
                recording_url: recordingUrl,
                recording_status: getRecordingStatus(),
                recording_error: recordingErrorText
            },
            `RECORDING_READY:${tag}`
        );
    };

    const buildFinalizePayload = () => {
        const c = calcCosts();
        const summary = getSummaryOrFallback();
        return {
            session_id: sessionId,
            project: PROJECT_NAME,
            script_name: SCRIPT_NAME,
            exported_at_utc: new Date().toISOString(),
            finalization_reason: finalizationReason,
            model: GEMINI_MODEL,
            caller_phone: callerPhone,
            client_phone: summary.client_phone || callerPhone,
            client_name: summary.client_name,
            call_duration_sec: Math.round(toNumber(callDurationSec)),
            telephony_cost_rub: toFixedNumber(telephonyCostRub, 4),
            websocket_duration_sec: toFixedNumber(c.websocketSec, 3),
            websocket_cost_rub: toFixedNumber(c.websocketRub, 4),
            voximplant_total_rub: toFixedNumber(c.voximplantRub, 4),
            ai_cost_usd: toFixedNumber(c.aiUsd, 6),
            ai_cost_rub: toFixedNumber(c.aiRub, 4),
            total_cost_rub: toFixedNumber(c.totalRub, 4),
            summary: summary.summary,
            call_goal: summary.call_goal,
            manager_offer: summary.manager_offer,
            outcome: summary.outcome,
            next_step: summary.next_step,
            dialogue_text: formatDialogueText(),
            recording_status: getRecordingStatus(),
            recording_url: recordingUrl,
            recording_error: recordingErrorText,
            usage: usageStats,
            summary_fields: summary,
            dialogue_items: dialogue
        };
    };

    const closeGeminiClient = () => {
        try {
            if (activeGeminiClient) activeGeminiClient.close();
        } catch (e) {}
        activeGeminiClient = null;
    };

    const finalizeSession = (reason) => {
        if (callDone) return;
        callDone = true;
        finalizationReason = reason;
        sendStatus('finalize_start', `Финализирую входящий звонок: ${reason}`, { reason });
        if (maxCallTimer) clearTimeout(maxCallTimer);
        if (summaryWaitTimer) clearTimeout(summaryWaitTimer);
        if (websocketOpenedAtMs && !websocketDurationSec) websocketDurationSec = (Date.now() - websocketOpenedAtMs) / 1000;

        const sendFinalize = () => {
            if (finalizeSent) return;
            finalizeSent = true;
            const payload = buildFinalizePayload();
            sendToBackend('/webhook/voximplant/finalize', payload, 'FINALIZE', () => {
                sendStatus('finalize_sent', 'Итоги входящего звонка отправлены на backend', { reason });
                closeGeminiClient();
                setTimeout(() => VoxEngine.terminate(), 1000);
            });
        };

        if (!activeGeminiClient || summaryReceived || summaryRequestSent) {
            sendFinalize();
            return;
        }

        summaryRequestSent = true;
        sendUserTextToModel(
            activeGeminiClient,
            `Разговор завершен. Обязательно вызови функцию ${SUMMARY_FUNCTION_NAME}. Заполни поля на русском: client_name, client_phone, call_goal, manager_offer, activity_type, is_decision_maker, average_check, traffic_source, bot_impression, outcome, next_step, summary. Если данных нет, пиши "не указано". Никакого дополнительного текста, только function call.`,
            'summary_request'
        );

        summaryWaitTimer = setTimeout(sendFinalize, SUMMARY_REQUEST_TIMEOUT_MS);
    };

    const connectMediaAndPrompt = () => {
        if (!callConnected || !activeGeminiClient) return;
        try {
            VoxEngine.sendMediaBetween(call, activeGeminiClient);
            Logger.write('===MEDIA_CONNECTED_BETWEEN_CALL_AND_GEMINI===');
        } catch (e) {
            Logger.write('===MEDIA_CONNECT_ERROR===');
            Logger.write(String(e));
        }
        if (!openingPromptSent) {
            openingPromptSent = true;
            sendUserTextToModel(activeGeminiClient, buildOpeningInstruction(callerPhone, callerContext), 'opening_instruction');
        }
    };

    const createGeminiClient = async () => {
        activeGeminiClient = await Gemini.createLiveAPIClient({
            apiKey,
            model: GEMINI_MODEL,
            backend: Gemini.Backend.GEMINI_API,
            connectConfig: {
                responseModalities: ['AUDIO'],
                thinkingConfig: { thinkingBudget: 0 },
                historyConfig: { initialHistoryInClientContent: true },
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: GEMINI_VOICE_NAME }
                    }
                },
                realtimeInputConfig: {
                    automaticActivityDetection: {
                        prefixPaddingMs: 100,
                        silenceDurationMs: 300,
                        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
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
                                description: 'Сохранить итоговую суммаризацию входящего звонка.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        client_name: { type: 'string' },
                                        client_phone: { type: 'string' },
                                        call_goal: { type: 'string' },
                                        manager_offer: { type: 'string' },
                                        activity_type: { type: 'string' },
                                        is_decision_maker: { type: 'string' },
                                        average_check: { type: 'string' },
                                        traffic_source: { type: 'string' },
                                        bot_impression: { type: 'string' },
                                        outcome: { type: 'string' },
                                        next_step: { type: 'string' },
                                        summary: { type: 'string' }
                                    },
                                    required: ['summary', 'call_goal', 'outcome']
                                }
                            },
                            {
                                name: END_CALL_FUNCTION_NAME,
                                description: 'Завершить текущий звонок, если отвечает автоответчик, умная защита, робот, IVR или разговор больше не имеет смысла.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        reason: { type: 'string' },
                                        note: { type: 'string' }
                                    },
                                    required: ['reason']
                                }
                            }
                        ]
                    }
                ],
                systemInstruction: {
                    parts: [{ text: buildSystemInstruction(callerPhone, callerContext) }]
                }
            }
        });

        activeGeminiClient.addEventListener(Gemini.LiveAPIEvents.SetupComplete, () => {
            Logger.write('===GEMINI_SETUP_COMPLETE===');
            websocketOpenedAtMs = Date.now();
            connectMediaAndPrompt();
        });

        activeGeminiClient.addEventListener(Gemini.LiveAPIEvents.ToolCall, (event) => {
            const payload = extractEventPayload(event);
            const calls = payload.functionCalls || payload.function_calls || [];
            calls.forEach((fc) => {
                const functionName = safeString(fc && fc.name);
                let args = (fc && fc.args) || {};
                if (typeof args === 'string') args = parseJsonMaybe(args) || {};

                if (functionName === END_CALL_FUNCTION_NAME) {
                    if (fc && fc.id && activeGeminiClient && typeof activeGeminiClient.sendToolResponse === 'function') {
                        try {
                            activeGeminiClient.sendToolResponse({
                                functionResponses: [
                                    {
                                        id: fc.id,
                                        name: END_CALL_FUNCTION_NAME,
                                        response: { result: 'ok' }
                                    }
                                ]
                            });
                        } catch (e) {
                            Logger.write('===END_CALL_TOOL_RESPONSE_ERROR===');
                            Logger.write(String(e));
                        }
                    }
                    sendStatus('ai_requested_hangup', 'AI распознал автоответчик или бессмысленный разговор и завершает звонок', {
                        reason: normalizeText(args.reason),
                        note: clipText(args.note, 300)
                    });
                    try {
                        call.hangup();
                    } catch (e) {
                        Logger.write('===CALL_HANGUP_ERROR===');
                        Logger.write(String(e));
                    }
                    finalizeSession('ai_requested_hangup');
                    return;
                }

                if (functionName !== SUMMARY_FUNCTION_NAME) return;
                summaryData.client_name = normalizeText(args.client_name);
                summaryData.client_phone = normalizeText(args.client_phone || callerPhone);
                summaryData.call_goal = clipText(args.call_goal, 300);
                summaryData.manager_offer = clipText(args.manager_offer, 300);
                summaryData.activity_type = clipText(args.activity_type, 200);
                summaryData.is_decision_maker = clipText(args.is_decision_maker, 100);
                summaryData.average_check = clipText(args.average_check, 120);
                summaryData.traffic_source = clipText(args.traffic_source, 160);
                summaryData.bot_impression = clipText(args.bot_impression, 200);
                summaryData.outcome = clipText(args.outcome, 200);
                summaryData.next_step = clipText(args.next_step, 200);
                summaryData.summary = clipText(args.summary, 500);
                summaryReceived = Boolean(summaryData.summary);
                if (summaryWaitTimer) {
                    clearTimeout(summaryWaitTimer);
                    summaryWaitTimer = null;
                    if (finalizeSent) return;
                    finalizeSent = true;
                    const payloadToSend = buildFinalizePayload();
                    sendToBackend('/webhook/voximplant/finalize', payloadToSend, 'FINALIZE_AFTER_TOOL', () => {
                        sendStatus('finalize_sent', 'Итоги входящего звонка отправлены на backend', {});
                        closeGeminiClient();
                        setTimeout(() => VoxEngine.terminate(), 1000);
                    });
                }
            });
        });

        activeGeminiClient.addEventListener(Gemini.LiveAPIEvents.ServerContent, (event) => {
            const payload = extractEventPayload(event);
            const inputText = extractText(payload.inputTranscription);
            const outputText = extractText(payload.outputTranscription);
            if (inputText) currentUserParts.push(inputText);
            if (outputText) currentAssistantParts.push(outputText);
            if (payload.turnComplete === true) {
                if (currentUserParts.length) finalizePhrase('user', currentUserParts, 'complete');
                if (currentAssistantParts.length) finalizePhrase('assistant', currentAssistantParts, 'complete');
            }
            applyUsageMetadata(payload);
        });

        activeGeminiClient.addEventListener(Gemini.LiveAPIEvents.Unknown, (event) => {
            Logger.write('===GEMINI_UNKNOWN===');
            Logger.write(JSON.stringify(event || {}));
            applyUsageMetadata(extractEventPayload(event));
        });
    };

    try {
        const [backendUrlEntry, backendSecretEntry, apiKeyEntry] = await Promise.all([
            ApplicationStorage.get('BACKEND_URL'),
            ApplicationStorage.get('BACKEND_WEBHOOK_SECRET'),
            ApplicationStorage.get('GEMINI_API_KEY')
        ]);
        backendUrl =
            safeString((backendUrlEntry && backendUrlEntry.value) || BACKEND_URL_FALLBACK)
                .trim()
                .replace(/\/+$/, '');
        backendWebhookSecret = safeString((backendSecretEntry && backendSecretEntry.value) || BACKEND_WEBHOOK_SECRET_FALLBACK).trim();
        apiKey = safeString(apiKeyEntry && apiKeyEntry.value).trim();
    } catch (e) {
        Logger.write('===CONFIG_LOAD_ERROR===');
        Logger.write(String(e));
    }

    sendStatus('inbound_call_alerting', 'Входящий звонок поступил в сценарий', { caller_phone: callerPhone });
    callerContext = await fetchCallerContext();
    sendStatus('inbound_context_ready', 'Контекст входящего номера получен', {
        known: Boolean(callerContext && callerContext.known)
    });

    if (!apiKey) {
        Logger.write('===NO_GEMINI_API_KEY===');
        finalizeSession('no_gemini_key');
        return;
    }

    call.addEventListener(CallEvents.Connected, (event) => {
        Logger.write('===CALL_CONNECTED===');
        Logger.write(JSON.stringify(event || {}));
        callConnected = true;
        sendStatus('call_connected', 'Входящий звонок соединен', { caller_phone: callerPhone });
        sendToBackend(
            '/webhook/voximplant/call_started',
            {
                session_id: sessionId,
                project: PROJECT_NAME,
                script_name: SCRIPT_NAME,
                caller_phone: callerPhone,
                connected_at_utc: new Date().toISOString()
            },
            'CALL_STARTED'
        );

        if (CALL_RECORD_ENABLED && !recordingRequested) {
            recordingRequested = true;
            try {
                call.record({ hd_audio: true, stereo: true });
                sendStatus('recording_requested', 'Запрошена запись входящего разговора', {});
            } catch (e) {
                recordingFailed = true;
                recordingErrorText = safeString(e);
                sendStatus('recording_failed', recordingErrorText, {});
            }
        }

        maxCallTimer = setTimeout(() => {
            try {
                call.hangup();
            } catch (e) {}
            finalizeSession('max_call_duration');
        }, MAX_CALL_DURATION_MS);

        connectMediaAndPrompt();
    });

    call.addEventListener(CallEvents.RecordStarted, (event) => {
        recordingStarted = true;
        recordingUrl = safeString(event && event.url);
        sendRecordingReady('record_started');
    });

    if (CallEvents.RecordStopped) {
        call.addEventListener(CallEvents.RecordStopped, (event) => {
            const url = safeString(event && event.url);
            if (url) {
                recordingUrl = url;
                sendRecordingReady('record_stopped');
            }
        });
    }

    if (CallEvents.RecordFailed) {
        call.addEventListener(CallEvents.RecordFailed, (event) => {
            recordingFailed = true;
            recordingErrorText = safeString((event && (event.reason || event.error || event.message)) || 'record_error');
            sendStatus('recording_failed', recordingErrorText, {});
        });
    }

    call.addEventListener(CallEvents.Disconnected, (event) => {
        Logger.write('===CALL_DISCONNECTED===');
        Logger.write(JSON.stringify(event || {}));
        if (event && event.duration !== undefined) callDurationSec = toNumber(event.duration);
        if (event && event.cost !== undefined) telephonyCostRub = toNumber(event.cost);
        finalizeSession(callAnswered ? 'call_disconnected' : 'call_not_answered');
    });

    call.addEventListener(CallEvents.Failed, (event) => {
        Logger.write('===CALL_FAILED===');
        Logger.write(JSON.stringify(event || {}));
        if (event && event.duration !== undefined) callDurationSec = toNumber(event.duration);
        if (event && event.cost !== undefined) telephonyCostRub = toNumber(event.cost);
        finalizeSession('call_failed');
    });

    try {
        call.answer();
        callAnswered = true;
        Logger.write('===INBOUND_CALL_ANSWERED===');
    } catch (e) {
        Logger.write('===CALL_ANSWER_ERROR===');
        Logger.write(String(e));
        finalizeSession('answer_error');
        return;
    }

    try {
        await createGeminiClient();
    } catch (e) {
        Logger.write('===GEMINI_CREATE_ERROR===');
        Logger.write(String(e));
        finalizeSession('gemini_create_error');
    }
});
