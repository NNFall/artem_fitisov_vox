require(Modules.Gemini);
require(Modules.ApplicationStorage);

/*
 * Outbound Voximplant scenario with backend finalization.
 *
 * Voximplant ApplicationStorage:
 * - GEMINI_API_KEY
 * - BACKEND_URL, for example https://example.com or http://1.2.3.4:8000
 * - BACKEND_WEBHOOK_SECRET
 */

const CALLER_ID = '79014172420';
const CALL_TARGETS = [
    '79958407752'
];

const BACKEND_URL_FALLBACK = 'http://186.246.18.100:8001';
const BACKEND_WEBHOOK_SECRET_FALLBACK = '';

const LEAD_SOURCE = 'мероприятии по внедрению AI в бизнес';
const PRODUCT_NAME = 'голосового AI-помощника для бизнеса';

const PROJECT_NAME = 'artem_fitisov';
const SCRIPT_NAME = 'outbound_gemini_server_edition.js';
const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_VOICE_NAME = 'Kore';
const SUMMARY_FUNCTION_NAME = 'save_call_summary';

const NEXT_CALL_DELAY_MS = 1000;
const CALL_TIMEOUT_MS = 60 * 1000;
const MAX_CALL_DURATION_MS = 5 * 60 * 1000;
const SUMMARY_REQUEST_TIMEOUT_MS = 15000;
const WEBSOCKET_PRICE_PER_MINUTE_RUB = 0.5;
const WS_RECONNECT_DELAY_MS = 1200;
const WS_RECONNECT_MAX_ATTEMPTS = 1;
const CALL_RECORD_ENABLED = true;

const AI_PRICE_IN_TEXT = 0.5;
const AI_PRICE_IN_AUDIO = 3.0;
const AI_PRICE_OUT_TEXT = 2.0;
const AI_PRICE_OUT_AUDIO = 12.0;
const USD_TO_RUB_RATE = 80;

const normalizePhone = (value) =>
    String(value || '')
        .replace(/[^\d+]/g, '')
        .replace(/^\+/, '');

const safeString = (value) => (value === undefined || value === null ? '' : String(value));
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const toFixedNumber = (value, digits) => Number(toNumber(value).toFixed(digits));
const safeJson = (value) => {
    try {
        return JSON.stringify(value || {});
    } catch (e) {
        return safeString(value);
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

const buildSystemInstruction = (phone) => `
Ты — Екатерина, голосовой AI-помощник и менеджер по первичной квалификации заявок.
Ты звонишь по теплой базе: человек был на ${LEAD_SOURCE}, видел демонстрацию AI-решения или оставлял контакт/заявку на консультацию.

==================================================
ГЛАВНАЯ ЦЕЛЬ ЗВОНКА
==================================================

Твоя задача:
1. Вежливо напомнить контекст: человек оставлял контакт после мероприятия или демонстрации по AI для бизнеса.
2. Узнать, актуален ли интерес к внедрению AI в бизнес.
3. Если интересно, коротко объяснить, что можно внедрить: голосового помощника на входящие и исходящие звонки, обработку заявок, запись и аналитику разговоров, интеграцию с CRM, таблицами, Telegram или backend.
4. Понять бизнес клиента и задачу, где AI может принести пользу.
5. Собрать данные для следующего контакта с экспертом.
6. Зафиксировать итог и обязательно вызвать функцию ${SUMMARY_FUNCTION_NAME}.

Главный результат звонка — не закрыть продажу сразу, а квалифицировать интерес и передать хорошую заявку специалисту.

==================================================
СТАРТ РАЗГОВОРА
==================================================

Начинай коротко и по-человечески:

«Здравствуйте! Меня зовут Екатерина. Вы оставляли заявку после мероприятия по внедрению AI в бизнес. Я как раз голосовой AI-помощник, то есть сейчас вы слышите пример такой технологии в работе. Вам удобно пару минут поговорить?»

Если человеку неудобно:
«Понимаю. Тогда подскажите, пожалуйста, когда лучше коротко перезвонить?»

Если человек не помнит заявку:
«Да, понимаю, такое бывает. Контакт был после мероприятия или демонстрации по AI для бизнеса. Я просто уточню: тема внедрения голосового помощника или AI-автоматизации для вашей компании в принципе актуальна?»

Если человеку интересно:
«Отлично. Тогда буквально пару вопросов, чтобы понять, чем вы занимаетесь и где помощник мог бы быть полезен.»

Если человек сразу рассказывает про бизнес или задачу:
— не перебивай;
— не возвращайся резко к стартовому скрипту;
— сначала кратко подтверди суть;
— потом задай один следующий вопрос.

Пример:
«Поняла вас. То есть основная нагрузка сейчас в звонках и обработке заявок, верно? Тогда уточню один момент.»

==================================================
ЧТО МЫ ПРЕДЛАГАЕМ
==================================================

Объясняй простыми словами, без технической лекции.

Можно говорить:
«Суть в том, что в бизнес можно внедрить голосового AI-помощника, который принимает входящие звонки, сам делает исходящие обзвоны по базе, задает вопросы, фиксирует ответы, сохраняет записи, делает краткий итог разговора и передает данные менеджеру или в CRM.»

Если нужно короче:
«Проще говоря, часть первичных звонков и повторяющихся разговоров можно передать AI, а менеджерам оставлять уже теплые и понятные заявки.»

Возможности:
— входящие звонки: консультации, первичная квалификация, сбор заявки;
— исходящие звонки: обзвон базы, подтверждение интереса, запись на встречу, напоминания;
— отчеты: итог разговора, статус лида, следующий шаг;
— записи разговоров и история контактов;
— передача данных в CRM, таблицы, Telegram или на backend;
— индивидуальный сценарий под нишу клиента;
— возможность говорить естественно, задавать уточняющие вопросы и не просто читать скрипт.

Не перечисляй все возможности длинным списком без запроса. Выбирай 1-3 пункта под ситуацию клиента.

==================================================
КВАЛИФИКАЦИЯ ИНТЕРЕСА
==================================================

Задавай по одному вопросу за раз.

Базовая цепочка:
1. «Подскажите, пожалуйста, чем занимается ваша компания?»
2. «Где у вас сейчас больше всего ручной коммуникации: входящие звонки, исходящие обзвоны, обработка заявок, запись клиентов или что-то другое?»
3. «Если представить такого помощника у вас, какую задачу хотелось бы автоматизировать в первую очередь?»
4. «У вас уже есть CRM или база, куда сейчас попадают заявки?»
5. «Кто у вас обычно принимает решение по таким внедрениям — вы или нужно подключить кого-то еще?»

Не обязательно задавать все вопросы. Если клиент уже дал ответ, не спрашивай повторно.

Если клиенту интересно, собери:
— имя;
— компания или ниша;
— город, если уместно;
— какая задача интересует;
— входящие, исходящие или оба направления;
— есть ли CRM, таблица или база;
— примерный объем звонков или заявок;
— удобный способ связи;
— удобное время для следующего контакта;
— кто принимает решение.

==================================================
ЖИВОЙ СТИЛЬ РАЗГОВОРА
==================================================

Говори естественно, как спокойный менеджер на первичном созвоне.

Допустимые живые фразы:
— «Поняла вас.»
— «Да, хороший кейс.»
— «Смотрите, здесь как раз может быть полезно...»
— «Тогда уточню один момент.»
— «Чтобы не гадать, лучше я зафиксирую задачу и передам специалисту.»
— «Да, логично.»
— «Хорошо, записала.»
— «Давайте коротко зафиксирую, чтобы ничего не потерять.»

Не злоупотребляй междометиями. Не говори слишком много «угу», «ага», «супер».

Тон:
— уверенный;
— дружелюбный;
— без давления;
— без заискивания;
— без длинных презентаций.

==================================================
ЕСЛИ КЛИЕНТ СПРАШИВАЕТ, AI ЛИ ТЫ
==================================================

Не скрывай.

Отвечай:
«Да, верно, я голосовой AI-помощник. Как раз на этом звонке можно услышать пример, как такая технология работает в реальном диалоге.»

Если клиент удивляется:
«Да, понимаю. Сейчас такие помощники уже могут вести первичный разговор, задавать уточняющие вопросы и передавать менеджеру структурированный итог.»

==================================================
ВОЗРАЖЕНИЯ И СОМНЕНИЯ
==================================================

Если клиент говорит «не интересно»:
«Поняла вас. Тогда не буду отвлекать. Если тема AI-автоматизации станет актуальна позже, можно будет вернуться к разговору. Хорошего дня.»

Если клиент говорит «у нас уже есть менеджеры»:
«Да, конечно. AI обычно не заменяет сильных менеджеров, а снимает с них первичную рутину: дозвоны, уточнения, повторяющиеся вопросы и фиксацию заявок.»

Если клиент говорит «это сложно внедрять»:
«Понимаю. Обычно начинают с одного понятного сценария: например, обработка входящих заявок или обзвон небольшой базы. Потом уже смотрят результат.»

Если клиент спрашивает цену:
«Стоимость зависит от задачи, объема звонков и интеграций. Чтобы не называть цифры вслепую, лучше сначала понять ваш сценарий, а потом специалист предложит вариант внедрения.»

Если клиент спрашивает сроки:
«Срок зависит от сложности сценария и интеграций. Простую тестовую версию обычно можно обсуждать отдельно после короткого разбора задачи.»

Если клиент просит примеры:
«Да, примеры можно показать на отдельной консультации. Плюс этот звонок уже демонстрирует базовый принцип голосового помощника.»

Если клиент сомневается в качестве:
«Это нормальный вопрос. Поэтому обычно и начинают с тестового сценария на понятной задаче, чтобы оценить качество диалога, отчеты и пользу для бизнеса.»

==================================================
ЧТО НЕЛЬЗЯ ДЕЛАТЬ
==================================================

Никогда не дави на клиента.
Никогда не обещай точную стоимость без разбора задачи.
Никогда не обещай конкретные сроки внедрения без понимания интеграций.
Никогда не говори, что AI полностью заменит отдел продаж.
Никогда не выдумывай кейсы, названия компаний, гарантии, проценты роста или экономию.
Никогда не спорь, если клиенту не актуально.
Никогда не задавай несколько вопросов подряд.
Никогда не уходи в технические подробности про модели, API, токены и серверы, если клиент сам об этом не спросил.

==================================================
ЗАВЕРШЕНИЕ РАЗГОВОРА
==================================================

Если интерес есть:
«Хорошо, я зафиксировала: вам интересно внедрение AI-помощника для [задача клиента]. Передам информацию специалисту, и с вами свяжутся для короткой консультации. Подскажите, пожалуйста, как удобнее связаться — по этому номеру или в мессенджере?»

Если нужно уточнить время:
«И в какое время вам удобнее принять звонок?»

Если клиент согласился:
«Отлично, записала. Спасибо, тогда передаю заявку специалисту. Хорошего дня!»

Если интереса нет:
«Поняла вас, спасибо за ответ. Не буду отвлекать. Хорошего дня!»

Если клиент просит перезвонить:
«Хорошо, зафиксировала. Передам, что лучше связаться с вами [время/день].»

==================================================
ФУНКЦИЯ СУММАРИЗАЦИИ
==================================================

Когда разговор завершен или собран ключевой контекст, обязательно вызови функцию:
${SUMMARY_FUNCTION_NAME}

Передавай:
— client_name: имя клиента, если назвал;
— client_phone: подтвержденный актуальный номер, обычно ${phone};
— call_goal: интерес клиента к AI-внедрению и конкретная задача;
— manager_offer: что было предложено: консультация, разбор сценария, внедрение ${PRODUCT_NAME}, тестовый пилот;
— outcome: итог разговора: интересно, не интересно, перезвонить, нужна консультация, ЛПР другой человек;
— next_step: что делать дальше: связаться, перезвонить, отправить информацию, передать специалисту;
— summary: короткая суммаризация на 2-4 предложения для CRM и Telegram.

Пример summary:
«Клиент подтвердил интерес к внедрению голосового AI-помощника. Основная задача — автоматизировать первичную обработку заявок и часть исходящих звонков. CRM пока не уточнена, клиент готов к короткой консультации со специалистом. Следующий шаг — связаться по текущему номеру и обсудить пилотный сценарий.»

Если данных нет, не выдумывай. Лучше честно укажи, что клиент не дал подробностей.
`;

VoxEngine.addEventListener(AppEvents.Started, async () => {
    const targets = CALL_TARGETS.map(normalizePhone).filter((phone) => phone.length > 0);
    const callerId = normalizePhone(CALLER_ID);

    let backendUrl = '';
    let backendWebhookSecret = '';

    try {
        const [backendUrlEntry, backendSecretEntry] = await Promise.all([
            ApplicationStorage.get('BACKEND_URL'),
            ApplicationStorage.get('BACKEND_WEBHOOK_SECRET')
        ]);
        backendUrl =
            safeString((backendUrlEntry && backendUrlEntry.value) || BACKEND_URL_FALLBACK)
                .trim()
                .replace(/\/+$/, '');
        backendWebhookSecret = safeString((backendSecretEntry && backendSecretEntry.value) || BACKEND_WEBHOOK_SECRET_FALLBACK).trim();
    } catch (e) {
        Logger.write('===BACKEND_CONFIG_LOAD_ERROR===');
        Logger.write(String(e));
    }

    let index = 0;
    let activeCall = null;
    let activeGeminiClient = null;
    let activeCallTimer = null;
    let callTimeoutTimer = null;
    let summaryWaitTimer = null;
    let finishingCurrentCall = false;

    const clearTimer = (timer) => {
        if (timer) clearTimeout(timer);
        return null;
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

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            postData: JSON.stringify(payload)
        };
        if (backendWebhookSecret) {
            options.headers['X-Webhook-Secret'] = backendWebhookSecret;
        }

        Logger.write(`===BACKEND_SEND_START:${tag}===`);
        Net.httpRequest(
            backendUrl + endpoint,
            (res) => {
                Logger.write(`===BACKEND_SEND_DONE:${tag} code=${res.code}===`);
                Logger.write(safeString(res.text));
                if (done) done(res);
            },
            options
        );
    };

    const closeGeminiClient = () => {
        try {
            if (activeGeminiClient) activeGeminiClient.close();
        } catch (e) {
            Logger.write('===GEMINI_CLOSE_ERROR===');
            Logger.write(String(e));
        }
        activeGeminiClient = null;
    };

    const sendUserTextToModel = (client, text, tag) => {
        if (!client) {
            throw new Error('gemini client is not initialized');
        }

        const payloadText = safeString(text);

        if (typeof client.sendRealtimeInput === 'function') {
            try {
                client.sendRealtimeInput({ text: payloadText });
                Logger.write(`===MODEL_TEXT_SENT_REALTIME_INPUT:${tag}===`);
                return 'realtime_input';
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
        return 'client_content';
    };

    const dialNext = () => {
        if (index >= targets.length) {
            Logger.write('===ALL_TARGETS_PROCESSED===');
            VoxEngine.terminate();
            return;
        }

        const targetPhone = targets[index++];
        const session = {
            targetPhone,
            sessionId: `outbound-${Date.now()}-${index}`,
            connectedAtUtc: '',
            finalizationReason: '',
            callConnected: false,
            callDurationSec: 0,
            telephonyCostRub: 0,
            websocketOpenedAtMs: null,
            websocketDurationSec: 0,
            recordingRequested: false,
            recordingStarted: false,
            recordingFailed: false,
            recordingUrl: '',
            recordingErrorText: '',
            summaryReceived: false,
            summaryRequestSent: false,
            done: false,
            reconnectAttempts: 0,
            reconnectTimer: null,
            startPromptSent: false,
            usageStats: {
                in_text: 0,
                in_audio: 0,
                in_video: 0,
                in_unknown: 0,
                out_text: 0,
                out_audio: 0,
                out_video: 0,
                out_unknown: 0,
                usage_events: 0
            },
            summaryData: {
                client_name: '',
                client_phone: '',
                call_goal: '',
                manager_offer: '',
                outcome: '',
                next_step: '',
                summary: ''
            },
            dialogue: [],
            currentUserParts: [],
            currentAssistantParts: []
        };

        const finalizePhrase = (role, parts, status) => {
            const text = normalizeText(parts.join(''));
            parts.length = 0;
            if (text) session.dialogue.push({ role, text, status });
        };

        const ensureDialogueFinalized = () => {
            if (session.currentUserParts.length) finalizePhrase('user', session.currentUserParts, 'partial');
            if (session.currentAssistantParts.length) finalizePhrase('assistant', session.currentAssistantParts, 'partial');
        };

        const formatDialogueText = () => {
            ensureDialogueFinalized();
            if (!session.dialogue.length) return '';
            return session.dialogue
                .map((item) => `${item.role === 'user' ? 'Клиент' : 'AI'}: ${item.text}`)
                .join('\n');
        };

        const getRecordingStatus = () => {
            if (!CALL_RECORD_ENABLED) return 'disabled';
            if (session.recordingUrl) return 'ready';
            if (session.recordingStarted) return 'started_no_url';
            if (session.recordingFailed) return 'error';
            if (session.recordingRequested) return 'requested_not_confirmed';
            return 'not_started';
        };

        const calcCosts = () => {
            const stats = session.usageStats;
            const websocketSec =
                session.websocketDurationSec ||
                (session.websocketOpenedAtMs ? (Date.now() - session.websocketOpenedAtMs) / 1000 : 0);
            const websocketRub = (websocketSec / 60) * WEBSOCKET_PRICE_PER_MINUTE_RUB;
            const aiUsd =
                (stats.in_text / 1000000) * AI_PRICE_IN_TEXT +
                (stats.in_audio / 1000000) * AI_PRICE_IN_AUDIO +
                (stats.out_text / 1000000) * AI_PRICE_OUT_TEXT +
                (stats.out_audio / 1000000) * AI_PRICE_OUT_AUDIO;
            const aiRub = aiUsd * USD_TO_RUB_RATE;
            const voximplantRub = toNumber(session.telephonyCostRub) + websocketRub;
            return {
                websocketSec,
                websocketRub,
                aiUsd,
                aiRub,
                voximplantRub,
                totalRub: voximplantRub + aiRub
            };
        };

        const getSummaryOrFallback = () => {
            if (session.summaryReceived && normalizeText(session.summaryData.summary)) {
                return session.summaryData;
            }
            const userText = clipText(
                session.dialogue
                    .filter((item) => item.role === 'user')
                    .map((item) => item.text)
                    .join(' '),
                300
            );
            const assistantText = clipText(
                session.dialogue
                    .filter((item) => item.role === 'assistant')
                    .map((item) => item.text)
                    .join(' '),
                300
            );
            return {
                client_name: '',
                client_phone: session.targetPhone,
                call_goal: userText || 'Исходящий звонок по заявке на внедрение AI в бизнес.',
                manager_offer: assistantText || 'AI-помощник предложил обсудить голосового помощника, автоматизацию звонков и передачу заявки специалисту.',
                outcome: session.finalizationReason || 'Звонок завершен.',
                next_step: 'Проверить запись и передать заинтересованного клиента специалисту.',
                summary: `Исходящий звонок по AI-внедрению на номер ${session.targetPhone}. Итог: ${session.finalizationReason || 'завершен'}.`
            };
        };

        const buildAdminReportHtml = () => {
            const c = calcCosts();
            const summary = getSummaryOrFallback();
            return [
                '<b>Исходящий звонок завершен</b>',
                `<b>Номер:</b> ${summary.client_phone || session.targetPhone}`,
                `<b>Длительность:</b> ${Math.round(toNumber(session.callDurationSec))} сек`,
                `<b>Voximplant:</b> ${c.voximplantRub.toFixed(4)} руб`,
                `<b>AI:</b> ${c.aiRub.toFixed(4)} руб (${c.aiUsd.toFixed(6)} USD)`,
                `<b>Итого:</b> ${c.totalRub.toFixed(4)} руб`,
                session.recordingUrl ? `<b>Запись:</b> ${session.recordingUrl}` : `<b>Запись:</b> ${getRecordingStatus()}`,
                '',
                '<b>Диалог:</b>',
                formatDialogueText() || 'Реплики не найдены.'
            ].join('\n');
        };

        const buildSummaryReportHtml = () => {
            const summary = getSummaryOrFallback();
            return [
                '<b>Новый исходящий звонок</b>',
                `<b>Номер:</b> ${summary.client_phone || session.targetPhone}`,
                `<b>Имя:</b> ${summary.client_name || 'не указано'}`,
                `<b>Запрос:</b> ${summary.call_goal || 'не указано'}`,
                `<b>Что предложили:</b> ${summary.manager_offer || 'не указано'}`,
                `<b>Итог:</b> ${summary.outcome || 'не указано'}`,
                `<b>Следующий шаг:</b> ${summary.next_step || 'не указано'}`,
                session.recordingUrl ? `<b>Запись:</b> ${session.recordingUrl}` : '',
                '',
                `<b>Кратко:</b> ${summary.summary || 'не указано'}`
            ]
                .filter((line) => line !== '')
                .join('\n');
        };

        const buildFinalizePayload = () => {
            const c = calcCosts();
            const summary = getSummaryOrFallback();
            return {
                session_id: session.sessionId,
                project: PROJECT_NAME,
                script_name: SCRIPT_NAME,
                exported_at_utc: new Date().toISOString(),
                finalization_reason: session.finalizationReason,
                model: GEMINI_MODEL,
                caller_phone: callerId,
                client_phone: summary.client_phone || session.targetPhone,
                client_name: summary.client_name,
                call_duration_sec: Math.round(toNumber(session.callDurationSec)),
                telephony_cost_rub: toFixedNumber(session.telephonyCostRub, 4),
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
                recording_url: session.recordingUrl,
                recording_error: session.recordingErrorText,
                usage: session.usageStats,
                summary_fields: summary,
                dialogue_items: session.dialogue,
                admin_report_html: buildAdminReportHtml(),
                summary_report_html: buildSummaryReportHtml()
            };
        };

        const sendRecordingReady = (tag) => {
            if (!session.recordingUrl) return;
            sendToBackend(
                '/webhook/voximplant/recording_ready',
                {
                    session_id: session.sessionId,
                    project: PROJECT_NAME,
                    script_name: SCRIPT_NAME,
                    recording_url: session.recordingUrl,
                    recording_status: getRecordingStatus(),
                    recording_error: session.recordingErrorText
                },
                `RECORDING_READY:${tag}`
            );
        };

        const finishAndContinue = (reason, shouldHangup) => {
            if (finishingCurrentCall) return;
            finishingCurrentCall = true;
            session.finalizationReason = reason;

            activeCallTimer = clearTimer(activeCallTimer);
            callTimeoutTimer = clearTimer(callTimeoutTimer);
            summaryWaitTimer = clearTimer(summaryWaitTimer);
            session.reconnectTimer = clearTimer(session.reconnectTimer);

            if (session.websocketOpenedAtMs && !session.websocketDurationSec) {
                session.websocketDurationSec = (Date.now() - session.websocketOpenedAtMs) / 1000;
            }

            try {
                if (shouldHangup && activeCall) activeCall.hangup();
            } catch (e) {
                Logger.write('===CALL_HANGUP_ERROR===');
                Logger.write(String(e));
            }

            const finalizeNow = () => {
                ensureDialogueFinalized();
                const payload = buildFinalizePayload();
                sendToBackend('/webhook/voximplant/finalize', payload, 'FINALIZE', () => {
                    session.done = true;
                    closeGeminiClient();
                    activeCall = null;
                    setTimeout(() => {
                        finishingCurrentCall = false;
                        dialNext();
                    }, NEXT_CALL_DELAY_MS);
                });
            };

            if (!activeGeminiClient || session.summaryReceived || session.summaryRequestSent) {
                finalizeNow();
                return;
            }

            session.summaryRequestSent = true;
            try {
                sendUserTextToModel(
                    activeGeminiClient,
                    `Разговор завершен. Обязательно вызови функцию ${SUMMARY_FUNCTION_NAME}.
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
- Никакого дополнительного текста, только function call.`,
                    'summary_request'
                );
                Logger.write('===SUMMARY_REQUEST_SENT===');
            } catch (e) {
                Logger.write('===SUMMARY_REQUEST_ERROR===');
                Logger.write(String(e));
                finalizeNow();
                return;
            }

            summaryWaitTimer = setTimeout(finalizeNow, SUMMARY_REQUEST_TIMEOUT_MS);
        };

        const applyUsageMetadata = (payload) => {
            const usage = payload && (payload.usageMetadata || payload.usage_metadata);
            if (!usage) return;
            const prompt = usage.promptTokensDetails || [];
            const response = usage.responseTokensDetails || [];
            const applyItems = (items, prefix) => {
                (items || []).forEach((item) => {
                    const modality = safeString(item && item.modality).toUpperCase();
                    const count = toNumber(item && item.tokenCount);
                    if (modality.indexOf('TEXT') >= 0) session.usageStats[`${prefix}_text`] += count;
                    else if (modality.indexOf('AUDIO') >= 0) session.usageStats[`${prefix}_audio`] += count;
                    else if (modality.indexOf('VIDEO') >= 0 || modality.indexOf('IMAGE') >= 0) session.usageStats[`${prefix}_video`] += count;
                    else session.usageStats[`${prefix}_unknown`] += count;
                });
            };
            applyItems(prompt, 'in');
            applyItems(response, 'out');
            session.usageStats.usage_events += 1;
        };

        const scheduleGeminiReconnect = (reason) => {
            if (session.done || finishingCurrentCall || !session.callConnected) return;

            if (session.reconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
                Logger.write(`===WS_RECONNECT_LIMIT_REACHED:${reason} attempts=${session.reconnectAttempts}===`);
                finishAndContinue('websocket_close', true);
                return;
            }

            if (session.reconnectTimer) {
                Logger.write(`===WS_RECONNECT_ALREADY_PENDING:${reason}===`);
                return;
            }

            session.reconnectAttempts += 1;
            const attempt = session.reconnectAttempts;
            Logger.write(
                `===WS_RECONNECT_SCHEDULED:${reason} attempt=${attempt}/${WS_RECONNECT_MAX_ATTEMPTS} delay_ms=${WS_RECONNECT_DELAY_MS}===`
            );

            session.reconnectTimer = setTimeout(async () => {
                session.reconnectTimer = null;
                if (session.done || finishingCurrentCall || !session.callConnected) {
                    Logger.write('===WS_RECONNECT_ABORTED:session_not_active===');
                    return;
                }

                try {
                    activeGeminiClient = await createGeminiClient();
                    Logger.write(`===WS_RECONNECT_DONE:attempt=${attempt}===`);
                } catch (e) {
                    Logger.write('===WS_RECONNECT_ERROR===');
                    Logger.write(String(e));
                    finishAndContinue('websocket_reconnect_error', true);
                }
            }, WS_RECONNECT_DELAY_MS);
        };

        const createGeminiClient = async () => {
            const apiKeyEntry = await ApplicationStorage.get('GEMINI_API_KEY');
            const apiKey = apiKeyEntry && apiKeyEntry.value;
            if (!apiKey) {
                Logger.write('===NO_GEMINI_API_KEY_IN_APPLICATION_STORAGE===');
                finishAndContinue('no_gemini_key', true);
                return null;
            }

            const client = await Gemini.createLiveAPIClient({
                apiKey,
                model: GEMINI_MODEL,
                backend: Gemini.Backend.GEMINI_API,
                onWebSocketClose: (event) => {
                    Logger.write('===GEMINI_WEBSOCKET_CLOSED===');
                    Logger.write(safeJson(event));
                    if (!session.done && !finishingCurrentCall) {
                        scheduleGeminiReconnect('websocket_close');
                    }
                },
                connectConfig: {
                    responseModalities: ['AUDIO'],
                    thinkingConfig: {
                        thinkingBudget: 0
                    },
                    historyConfig: {
                        initialHistoryInClientContent: true
                    },
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: GEMINI_VOICE_NAME }
                        }
                    },
                    realtimeInputConfig: {
                        automaticActivityDetection: {
                            prefixPaddingMs: 50,
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
                                    description: 'Сохранить итоговую суммаризацию исходящего звонка.',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            client_name: { type: 'string' },
                                            client_phone: { type: 'string' },
                                            call_goal: { type: 'string' },
                                            manager_offer: { type: 'string' },
                                            outcome: { type: 'string' },
                                            next_step: { type: 'string' },
                                            summary: { type: 'string' }
                                        },
                                        required: ['summary', 'call_goal', 'outcome']
                                    }
                                }
                            ]
                        }
                    ],
                    systemInstruction: {
                        parts: [{ text: buildSystemInstruction(targetPhone) }]
                    }
                }
            });

            session.websocketOpenedAtMs = Date.now();

            client.addEventListener(Gemini.LiveAPIEvents.SetupComplete, () => {
                Logger.write('===GEMINI_SETUP_COMPLETE===');
                VoxEngine.sendMediaBetween(activeCall, client);
                const promptText = session.startPromptSent
                    ? 'Соединение восстановлено. Продолжай разговор естественно с того места, где остановились. Не здоровайся заново.'
                    : 'Начни исходящий звонок. Скажи: "Здравствуйте! Меня зовут Екатерина. Вы оставляли заявку после мероприятия по внедрению AI в бизнес. Я как раз голосовой AI-помощник, то есть сейчас вы слышите пример такой технологии в работе. Вам удобно пару минут поговорить?"';
                sendUserTextToModel(
                    client,
                    promptText,
                    'start_prompt'
                );
                session.startPromptSent = true;
                Logger.write('===START_PROMPT_SENT===');
            });

            client.addEventListener(Gemini.LiveAPIEvents.ToolCall, (event) => {
                Logger.write('===GEMINI_TOOL_CALL===');
                Logger.write(safeJson(event));
                const payload = extractEventPayload(event);
                const calls = payload.functionCalls || [];
                calls.forEach((fc) => {
                    if (safeString(fc && fc.name) !== SUMMARY_FUNCTION_NAME) return;
                    let args = (fc && fc.args) || {};
                    if (typeof args === 'string') {
                        try {
                            args = JSON.parse(args);
                        } catch (e) {
                            args = {};
                        }
                    }
                    session.summaryData.client_name = normalizeText(args.client_name);
                    session.summaryData.client_phone = normalizeText(args.client_phone || targetPhone);
                    session.summaryData.call_goal = clipText(args.call_goal, 300);
                    session.summaryData.manager_offer = clipText(args.manager_offer, 300);
                    session.summaryData.outcome = clipText(args.outcome, 200);
                    session.summaryData.next_step = clipText(args.next_step, 200);
                    session.summaryData.summary = clipText(args.summary, 500);
                    session.summaryReceived = Boolean(session.summaryData.summary);

                    if (fc && fc.id) {
                        try {
                            client.sendToolResponse({
                                functionResponses: [
                                    {
                                        id: fc.id,
                                        name: SUMMARY_FUNCTION_NAME,
                                        response: { result: 'ok' }
                                    }
                                ]
                            });
                        } catch (e) {
                            Logger.write('===TOOL_RESPONSE_ERROR===');
                            Logger.write(String(e));
                        }
                    }
                });
            });

            client.addEventListener(Gemini.LiveAPIEvents.ServerContent, (event) => {
                const payload = extractEventPayload(event);
                Logger.write('===GEMINI_SERVER_CONTENT===');
                Logger.write(safeJson(payload));
                applyUsageMetadata(payload);

                const inputText = extractText(payload.inputTranscription);
                const outputText = extractText(payload.outputTranscription);

                if (inputText) {
                    if (session.currentAssistantParts.length) {
                        finalizePhrase('assistant', session.currentAssistantParts, 'complete');
                    }
                    session.currentUserParts.push(inputText);
                }

                if (outputText) {
                    if (session.currentUserParts.length) {
                        finalizePhrase('user', session.currentUserParts, 'complete');
                    }
                    session.currentAssistantParts.push(outputText);
                }

                if (payload.interrupted === true) {
                    Logger.write('===AGENT_INTERRUPTED===');
                    if (session.currentAssistantParts.length) {
                        finalizePhrase('assistant', session.currentAssistantParts, 'interrupted');
                    }
                    client.clearMediaBuffer();
                }

                if (payload.turnComplete === true && session.currentAssistantParts.length) {
                    finalizePhrase('assistant', session.currentAssistantParts, 'complete');
                }
            });

            client.addEventListener(Gemini.LiveAPIEvents.Unknown, (event) => {
                Logger.write('===GEMINI_UNKNOWN_EVENT===');
                Logger.write(safeJson(event));
                applyUsageMetadata(extractEventPayload(event));
            });

            return client;
        };

        Logger.write(`===OUTBOUND_DIAL_START:${targetPhone}===`);
        activeCall = VoxEngine.callPSTN(targetPhone, callerId);
        try {
            if (activeCall && activeCall.id) session.sessionId = safeString(activeCall.id());
        } catch (e) {
            Logger.write('===CALL_ID_READ_ERROR===');
            Logger.write(String(e));
        }

        callTimeoutTimer = setTimeout(() => {
            Logger.write(`===CALL_TIMEOUT:${targetPhone}===`);
            finishAndContinue('call_timeout', true);
        }, CALL_TIMEOUT_MS);

        activeCall.addEventListener(CallEvents.Connected, async (event) => {
            Logger.write(`===CALL_CONNECTED:${targetPhone}===`);
            Logger.write(safeJson(event));
            session.callConnected = true;
            session.connectedAtUtc = new Date().toISOString();
            callTimeoutTimer = clearTimer(callTimeoutTimer);

            sendToBackend(
                '/webhook/voximplant/call_started',
                {
                    session_id: session.sessionId,
                    project: PROJECT_NAME,
                    script_name: SCRIPT_NAME,
                    caller_phone: callerId,
                    connected_at_utc: session.connectedAtUtc
                },
                'CALL_STARTED'
            );

            activeCallTimer = setTimeout(() => {
                Logger.write(`===MAX_CALL_DURATION_REACHED:${targetPhone}===`);
                finishAndContinue('max_call_duration', true);
            }, MAX_CALL_DURATION_MS);

            if (!CALL_RECORD_ENABLED) {
                Logger.write('===CALL_RECORDING_DISABLED===');
            } else {
                try {
                    session.recordingRequested = true;
                    activeCall.record({ hd_audio: true, stereo: true });
                    Logger.write('===CALL_RECORD_START_REQUESTED===');
                } catch (e) {
                    session.recordingFailed = true;
                    session.recordingErrorText = safeString(e);
                    Logger.write('===CALL_RECORD_START_ERROR===');
                    Logger.write(String(e));
                }
            }

            try {
                activeGeminiClient = await createGeminiClient();
            } catch (e) {
                Logger.write('===GEMINI_CREATE_ERROR===');
                Logger.write(String(e));
                finishAndContinue('gemini_create_error', true);
            }
        });

        activeCall.addEventListener(CallEvents.RecordStarted, (event) => {
            Logger.write('===CALL_RECORD_STARTED===');
            Logger.write(safeJson(event));
            session.recordingStarted = true;
            session.recordingUrl = safeString(event && event.url);
            sendRecordingReady('record_started');
        });

        if (CallEvents.RecordStopped) {
            activeCall.addEventListener(CallEvents.RecordStopped, (event) => {
                Logger.write('===CALL_RECORD_STOPPED===');
                Logger.write(safeJson(event));
                const url = safeString(event && event.url);
                if (url) {
                    session.recordingUrl = url;
                    sendRecordingReady('record_stopped');
                }
            });
        }

        if (CallEvents.RecordFailed) {
            activeCall.addEventListener(CallEvents.RecordFailed, (event) => {
                Logger.write('===CALL_RECORD_FAILED===');
                Logger.write(safeJson(event));
                session.recordingFailed = true;
                session.recordingErrorText = safeString((event && (event.reason || event.error || event.message)) || 'record_error');
            });
        }

        activeCall.addEventListener(CallEvents.Disconnected, (event) => {
            Logger.write(`===CALL_DISCONNECTED:${targetPhone}===`);
            Logger.write(safeJson(event));
            if (event && event.duration !== undefined) session.callDurationSec = toNumber(event.duration);
            if (event && event.cost !== undefined) session.telephonyCostRub = toNumber(event.cost);
            finishAndContinue('call_disconnected', false);
        });

        activeCall.addEventListener(CallEvents.Failed, (event) => {
            Logger.write(`===CALL_FAILED:${targetPhone}===`);
            Logger.write(safeJson(event));
            if (event && event.duration !== undefined) session.callDurationSec = toNumber(event.duration);
            if (event && event.cost !== undefined) session.telephonyCostRub = toNumber(event.cost);
            finishAndContinue('call_failed', false);
        });
    };

    if (!callerId) {
        Logger.write('===EMPTY_CALLER_ID===');
        VoxEngine.terminate();
        return;
    }

    if (!targets.length) {
        Logger.write('===EMPTY_CALL_TARGETS===');
        VoxEngine.terminate();
        return;
    }

    Logger.write('===OUTBOUND_SERVER_TEST_STARTED===');
    Logger.write(safeJson({ callerId, targets, backendUrlConfigured: Boolean(backendUrl) }));
    dialNext();
});
