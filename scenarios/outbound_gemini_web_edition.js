require(Modules.Gemini);
require(Modules.ApplicationStorage);

/*
 * Outbound Voximplant scenario with backend finalization.
 *
 * Voximplant ApplicationStorage:
 * - GEMINI_API_KEY
 * - BACKEND_URL, for example https://obzvonai.ru
 * - BACKEND_WEBHOOK_SECRET
 */

const CALLER_ID = '79014172420';
// Keep empty for backend-driven campaigns. Phone numbers must come from
// VoxEngine.customData or /outbound/tasks/{id}/scenario-context.
const FALLBACK_CALL_TARGETS = [];

const BACKEND_URL_FALLBACK = 'https://obzvonai.ru';
const BACKEND_WEBHOOK_SECRET_FALLBACK = '';

const PROJECT_NAME = 'artem_fitisov';
const SCRIPT_NAME = 'outbound_gemini_web_edition.js';
const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_VOICE_NAME = 'Kore';
const SUMMARY_FUNCTION_NAME = 'save_call_summary';

const NEXT_CALL_DELAY_MS = 1000;
const CALL_TIMEOUT_MS = 45 * 1000;
const MAX_CALL_DURATION_MS = 5 * 60 * 1000;
const SUMMARY_REQUEST_TIMEOUT_MS = 15000;
const TASK_CONTEXT_FETCH_TIMEOUT_MS = 3500;
const WEBSOCKET_PRICE_PER_MINUTE_RUB = 0.5;
const WS_RECONNECT_DELAY_MS = 1200;
const WS_RECONNECT_MAX_ATTEMPTS = 1;
const CALL_RECORD_ENABLED = true;
const FORCE_OPENING_GREETING = true;
const OPENING_GREETING_INPUT_UNLOCK_FALLBACK_MS = 7000;
const OPENING_GREETING_ATTENDED_TEXT =
    'Добрый день! Вы были на мебельном форуме Amix в марте. Меня Екатерина зовут, я AI-помощник, и меня попросили помочь обработать участников. Можно я задам 3-4 вопроса?';
const OPENING_GREETING_NOT_ATTENDED_TEXT =
    'Добрый день! Вы регистрировались на мебельный форум Amix в марте. Меня Екатерина зовут, я AI-помощник, и меня попросили помочь обработать базу участников и регистраций. Можно я задам 3-4 вопроса?';

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

const buildLeadContextText = (leadContext) => {
    if (!leadContext) return '';
    const lines = [];
    if (leadContext.client_name) lines.push(`- имя клиента: ${leadContext.client_name}`);
    if (leadContext.attendance_status) {
        lines.push(
            `- статус участия в Amix: ${
                String(leadContext.attendance_status).toLowerCase() === 'attended' ? 'пришел' : 'не пришел'
            }`
        );
    }
    if (leadContext.company) lines.push(`- компания/ниша: ${leadContext.company}`);
    if (leadContext.city) lines.push(`- город: ${leadContext.city}`);
    if (leadContext.source) lines.push(`- источник: ${leadContext.source}`);
    if (leadContext.task) lines.push(`- предварительный интерес/задача: ${leadContext.task}`);
    if (leadContext.context) lines.push(`- дополнительный контекст по лиду: ${leadContext.context}`);
    if (leadContext.preferred_time) lines.push(`- удобное время: ${leadContext.preferred_time}`);
    if (leadContext.campaign_context) lines.push(`- общий контекст кампании: ${leadContext.campaign_context}`);
    if (!lines.length) return '';
    return `
==================================================
ДАННЫЕ ЛИДА ИЗ БАЗЫ
==================================================

${lines.join('\n')}

Используй эти данные аккуратно. Не зачитывай их списком. Если имя известно, можешь обратиться по имени. Если контекст не подтвержден клиентом, формулируй мягко: "вижу, что был интерес к..." или "по заявке указано...".
`;
};

const getLeadFirstName = (leadContext) => {
    const rawName = safeString(leadContext && (leadContext.client_name || leadContext.name)).trim();
    if (!rawName) return '';
    return rawName.split(/\s+/)[0];
};

const applyNamePrefixToGreeting = (firstName, greetingText) => {
    if (!firstName) return greetingText;
    return `${firstName}, ${greetingText.charAt(0).toLowerCase()}${greetingText.slice(1)}`;
};

const buildOpeningGreetingText = (leadContext) => {
    const firstName = getLeadFirstName(leadContext);
    const attendanceStatus = safeString(leadContext && leadContext.attendance_status).toLowerCase();
    const greetingText =
        attendanceStatus === 'not_attended' ? OPENING_GREETING_NOT_ATTENDED_TEXT : OPENING_GREETING_ATTENDED_TEXT;
    return applyNamePrefixToGreeting(firstName, greetingText);
};

const buildSystemInstruction = (phone, leadContext) => `
Ты — Екатерина, голосовой AI-помощник. Ты звонишь участникам мебельного форума Amix, который проходил в марте.
Цель звонка — не продавать и не презентовать AI, а коротко и вежливо обработать базу участников: понять профиль бизнеса, роль собеседника, средний чек, основной канал клиентов и оценку твоей работы по 10-балльной шкале.

Главная логика:
1. Поздоровайся и напомни контекст: человек был на мебельном форуме Amix в марте.
2. Представься: Екатерина, AI-помощник, тебя попросили помочь обработать участников.
3. Спроси разрешение задать 3-4 вопроса.
4. Если человек согласился, коротко подтверди и сразу переходи к бизнес-вопросам.
5. Дальше задавай бизнес-вопросы по одному, не списком.
6. Перед завершением попроси оценить разговор с тобой по 10-балльной шкале.
7. В конце поблагодари и тепло попрощайся.

Не уходи в продажу внедрения AI. Не рассказывай длинно про технологии, CRM, интеграции, стоимость и внедрение, если собеседник сам об этом не спросил.
Если в данных лида статус not_attended, не говори «вы были на форуме»; говори «вы регистрировались на форум» или «были в базе регистраций».

Кто звонит и что за компания:
— Ты Екатерина, AI-помощник проекта «Цифровые Решения».
— Проект занимается внедрением AI-инструментов в бизнес: голосовые помощники для входящих и исходящих звонков, обработка заявок, первичная квалификация клиентов, фиксация ответов, транскрибация разговоров, summary, отчеты и передача данных менеджерам.
— Руководитель проекта: Артём Фетисов.
— Компания работает как IT-consulting и помогает бизнесу аккуратно встроить AI в реальные процессы продаж и сервиса.
— Основной пример прямо сейчас — такой голосовой помощник, как ты: он может обзванивать базу, задавать вопросы, записывать ответы, сохранять итоги в таблицу/CRM/базу данных и передавать менеджеру.
— География работы: удаленно по России и с международными проектами; в подписи компании указаны Санкт-Петербург и Таллинн.
— Сайт: www.cifresh.ru.
— Контакты для связи с Артёмом: ar.fetisov@gmail.com, info@cifresh.ru, телефон +7 911 188-14-66, WhatsApp/Telegram +7 965 034-88-52.

Как отвечать, если спрашивают про компанию или AI:
— отвечай коротко, 1-2 фразами, без длинной презентации;
— не называй точную стоимость, сроки и условия внедрения, если их нет в данных;
— если человеку интересно внедрение, зафиксируй интерес и скажи, что передашь это Артёму или менеджеру;
— если спрашивают «а что именно вы делаете?», можно сказать: «Мы внедряем AI-помощников для звонков и обработки заявок: они общаются с клиентами, фиксируют ответы, делают summary и передают данные менеджеру»;
— если спрашивают «это вы сейчас пример такого помощника?», скажи: «Да, всё верно. Я как раз пример такого AI-помощника в звонке».

Стартовая реплика:
«${buildOpeningGreetingText(leadContext)}»

Если собеседник говорит, что ему неудобно:
«Понимаю. Тогда не буду отвлекать. Подскажите, пожалуйста, когда лучше коротко перезвонить?»

Если собеседник не помнит форум:
«Да, понимаю, такое бывает. Речь про мебельный форум Amix в марте. Я просто коротко уточню пару моментов по участникам, это займет совсем немного времени.»

Основные вопросы. Задавай их по одному и слушай ответ:
После стартовой реплики НЕ задавай сразу второй вопрос. Сначала дождись ответа на «можно я задам 3-4 вопроса?».
Если человек согласился, коротко подтверди и сразу переходи к бизнес-вопросам:
«Ага, спасибо, поняла вас. Тогда буквально пару вопросов задам.»

Потом задавай бизнес-вопросы:
1. «У вас мебельное производство или вы дизайном занимаетесь?»
2. «Вы руководитель компании, как я понимаю?»
3. «Подскажите, а какой у вас средний чек?»
4. «А у вас в основном по рекламе клиенты обращаются или по сарафану?»
5. В конце спроси коротко: «И последний короткий вопрос: оцените, пожалуйста, мою работу по 10-балльной шкале.»

Если имя известно, можно обращаться по имени, но не в каждой фразе.
Если человек уже ответил по смыслу, не переспрашивай дословно. Лучше коротко подтверди и иди дальше.
Если человек отвечает коротко, не дави. Можно мягко уточнить один раз.

Если человек начинает обсуждать AI подробнее, можно коротко ответить, но не уходи в продажу: «Да, я как раз пример такого помощника: могу задавать вопросы, фиксировать ответы и передавать итог менеджеру. Но сейчас я вас долго грузить этим не буду.»
Если человек оценил твою работу по 10-балльной шкале, поблагодари и не спорь с оценкой. Если оценка низкая, скажи: «Спасибо, честно зафиксировала, значит есть куда улучшаться.»

Если плохо расслышала, не поняла ответ по смыслу или ответ не подходит к вопросу:
— не додумывай и не записывай предположение как факт;
— в начале разговора при первой же нечеткой реплике обязательно попроси говорить громче короткой фразой;
— используй короткие строгие реплики: «Повторите громче, пожалуйста», «Говорите громче, пожалуйста», «Я вас плохо слышу, говорите громче, пожалуйста», «Не поняла, повторите громче, пожалуйста»;
— не объясняй долго причину, не извиняйся длинно, не задавай новый вопрос, пока не получила понятный ответ.

Живой стиль:
Говори как живой, спокойный менеджер: коротко, разговорно, без длинных монологов. После ответа собеседника можно вставлять короткие естественные фразы-связки:
— «Угу»
— «Ага»
— «Так-так»
— «Хорошо»
— «Ага, поняла вас»
— «Поняла вас»
— «Хорошо, спасибо»
— «Да, логично»
— «Так, зафиксировала»
— «Спасибо, записала»
— «Тогда уточню еще один момент»

Используй такие фразы не в каждом предложении, а там, где это звучит естественно: после ответа, перед уточнением или когда человек диктует данные. Не превращай речь в набор междометий. Не говори театрально. Не задавай несколько вопросов подряд. Не перебивай.

Завершение:
«Спасибо вам за уделенное время. Желаем вам много щедрых клиентов и интересных проектов!»

Если человек отказался говорить:
«Поняла вас, не буду отвлекать. Хорошего дня!»

Если попросил перезвонить:
«Хорошо, зафиксировала. Спасибо, тогда передам, что лучше связаться позже.»

Что нельзя:
— не продавай AI-внедрение первым сообщением;
— не рассказывай длинно про функции AI-помощника, если не спросили;
— не обещай, что с человеком обязательно свяжется менеджер, если он этого не просил;
— не выдумывай данные о компании, среднем чеке, роли собеседника или источниках клиентов;
— не говори, что ты человек. Если спросили — честно скажи, что ты AI-помощник.

Когда разговор завершен или собраны основные ответы, обязательно вызови функцию ${SUMMARY_FUNCTION_NAME}.

Передавай:
— client_name: имя собеседника, если оно известно или названо;
— client_phone: номер, обычно ${phone};
— call_goal: коротко, что это был опрос участника форума Amix;
— manager_offer: не оффер продажи, а собранные ответы: производство/дизайн, роль, средний чек, канал клиентов и оценка твоей работы;
— activity_type: мебельное производство, дизайн или другой профиль, если выяснили;
— is_decision_maker: да/нет/неизвестно, руководитель ли собеседник;
— average_check: средний чек словами или числом, если назвали;
— traffic_source: реклама, сарафан, входящие, смешанный канал или неизвестно;
— bot_impression: оценка разговора по 10-балльной шкале и реакция на AI только если человек сам это сказал;
— outcome: итог: ответил, отказался, попросил перезвонить, разговор сорвался;
— next_step: что делать дальше, например «данные собраны», «перезвонить», «не беспокоить»;
— summary: 2-4 предложения с главным результатом разговора.

Пример summary:
«Участник форума Amix ответил на короткий опрос. Занимается мебельным производством, руководитель компании, средний чек около 250 тысяч рублей, клиенты приходят в основном по рекомендациям. Разговор с AI воспринял нормально, оценил работу на 8 из 10, следующий шаг — сохранить данные в базе.»

Если данных нет, не выдумывай. Честно укажи, какие ответы не получены.

${buildLeadContextText(leadContext)}
`;

VoxEngine.addEventListener(AppEvents.Started, async () => {
    let targets = FALLBACK_CALL_TARGETS.map(normalizePhone).filter((phone) => phone.length > 0);
    const callerId = normalizePhone(CALLER_ID);
    let scenarioCustomData = {};
    let leadContext = {};

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

    try {
        const rawCustomData =
            typeof VoxEngine.customData === 'function'
                ? safeString(VoxEngine.customData())
                : '';
        scenarioCustomData = parseJsonMaybe(rawCustomData) || {};
        Logger.write(`===CUSTOM_DATA:${safeJson(scenarioCustomData)}===`);
    } catch (e) {
        Logger.write('===CUSTOM_DATA_READ_ERROR===');
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

    const getStatusTaskId = () =>
        scenarioCustomData.task_id ||
        scenarioCustomData.outbound_task_id ||
        (leadContext && leadContext.task_id);

    const getStatusCampaignId = () =>
        scenarioCustomData.campaign_id ||
        (leadContext && leadContext.campaign_id);

    const sendStatus = (stage, message, data, session) => {
        const taskId = getStatusTaskId();
        const campaignId = getStatusCampaignId();
        const statusPhone =
            (session && session.targetPhone) ||
            (leadContext && leadContext.phone) ||
            scenarioCustomData.phone ||
            '';
        sendToBackend(
            '/webhook/voximplant/status',
            {
                stage,
                status: 'ok',
                message: safeString(message),
                session_id: session && session.sessionId ? session.sessionId : undefined,
                outbound_task_id: taskId ? Number(taskId) : undefined,
                campaign_id: campaignId ? Number(campaignId) : undefined,
                phone: normalizePhone(statusPhone),
                timestamp_utc: new Date().toISOString(),
                data: data || {}
            },
            `STATUS:${stage}`
        );
    };

    const fetchTaskContext = (taskId) =>
        new Promise((resolve) => {
            if (!backendUrl || !taskId) {
                resolve(null);
                return;
            }
            if (typeof Net === 'undefined' || typeof Net.httpRequest !== 'function') {
                Logger.write('===TASK_CONTEXT_SKIP_NET_UNAVAILABLE===');
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
                Logger.write('===TASK_CONTEXT_FETCH_TIMEOUT===');
                sendStatus('context_fetch_timeout', 'Backend не успел отдать контекст, использую custom_data', {
                    task_id: taskId,
                    timeout_ms: TASK_CONTEXT_FETCH_TIMEOUT_MS
                });
                finish(null);
            }, TASK_CONTEXT_FETCH_TIMEOUT_MS);

            const options = {
                method: 'GET',
                headers: {}
            };
            if (backendWebhookSecret) {
                options.headers['X-Webhook-Secret'] = backendWebhookSecret;
            }

            sendStatus('context_fetch_start', 'Запрашиваю контекст задачи у backend', { task_id: taskId });
            Net.httpRequest(
                `${backendUrl}/outbound/tasks/${encodeURIComponent(taskId)}/scenario-context`,
                (res) => {
                    Logger.write(`===TASK_CONTEXT_FETCH_DONE code=${res.code}===`);
                    if (!res || res.code < 200 || res.code >= 300) {
                        Logger.write(safeString(res && res.text));
                        finish(null);
                        return;
                    }
                    const parsed = parseJsonMaybe(safeString(res.text));
                    sendStatus('context_fetch_done', 'Контекст задачи получен от backend', { task_id: taskId });
                    finish(parsed);
                },
                options
            );
        });

    const mergeLeadContext = (...items) => {
        const merged = {};
        items.forEach((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return;
            Object.keys(item).forEach((key) => {
                const value = item[key];
                if (value !== undefined && value !== null && value !== '') merged[key] = value;
            });
        });
        return merged;
    };

    const loadLeadContextFromCustomData = async () => {
        const custom = scenarioCustomData && typeof scenarioCustomData === 'object' ? scenarioCustomData : {};
        const directContext = mergeLeadContext(
            custom.lead_context,
            custom.context && typeof custom.context === 'object' ? custom.context : null,
            {
                task_id: custom.task_id || custom.outbound_task_id,
                campaign_id: custom.campaign_id,
                phone: custom.phone,
                client_name: custom.client_name || custom.name,
                last_name: custom.last_name,
                email: custom.email,
                company: custom.company,
                city: custom.city,
                source: custom.source,
                attendance_status: custom.attendance_status,
                activity_type: custom.activity_type,
                is_decision_maker: custom.is_decision_maker,
                average_check: custom.average_check,
                traffic_source: custom.traffic_source,
                bot_impression: custom.bot_impression,
                task: custom.task,
                row_context: typeof custom.context === 'string' ? custom.context : custom.row_context,
                campaign_context: custom.campaign_context,
                preferred_time: custom.preferred_time,
                timezone: custom.timezone
            }
        );

        const taskId = custom.task_id || custom.outbound_task_id || directContext.task_id;
        const directPhone = normalizePhone(directContext.phone || custom.phone || '');
        if (directPhone) {
            leadContext = directContext;
            sendStatus('context_skipped_custom_data', 'Контекст и номер взяты из script_custom_data', {
                task_id: taskId,
                phone: directPhone
            });
        } else if (taskId) {
            const fetchedContext = await fetchTaskContext(taskId);
            leadContext = mergeLeadContext(directContext, fetchedContext);
        } else {
            leadContext = directContext;
        }

        const customPhone = normalizePhone(leadContext.phone || custom.phone || '');
        if (customPhone) targets = [customPhone];
        Logger.write(`===LEAD_CONTEXT:${safeJson(leadContext)}===`);
        sendStatus('lead_context_ready', 'Контекст лида готов', {
            has_phone: Boolean(customPhone),
            phone: customPhone,
            client_name: leadContext.client_name || ''
        });
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
            outboundTaskId: leadContext && leadContext.task_id ? Number(leadContext.task_id) : 0,
            campaignId: leadContext && leadContext.campaign_id ? Number(leadContext.campaign_id) : 0,
            leadContext,
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
            geminiWarmupStarted: false,
            geminiReady: false,
            geminiOutputConnected: false,
            callerInputConnected: false,
            openingGreetingDone: false,
            openingUnlockTimer: null,
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
                client_name: safeString(leadContext && (leadContext.client_name || leadContext.name)),
                client_phone: targetPhone,
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

        const formatRecentDialogueText = (limit) => {
            ensureDialogueFinalized();
            return session.dialogue
                .slice(-limit)
                .map((item) => `${item.role === 'user' ? 'Клиент' : 'AI'}: ${item.text}`)
                .join('\n');
        };

        const buildReconnectPrompt = () => {
            const recentDialogue = formatRecentDialogueText(12);
            return `Связь с AI только что временно оборвалась и восстановилась. НЕ начинай разговор заново. НЕ здоровайся заново. НЕ повторяй стартовую реплику про форум Amix.

Клиент сейчас слышал обрыв, поэтому сначала коротко скажи: «Да, простите, кажется связь на секунду прервалась».

Дальше продолжи строго с последнего незавершенного места. Если последний незавершенный вопрос был про оценку, повтори только его одной короткой фразой:
«И последний короткий вопрос: оцените, пожалуйста, мою работу по 10-балльной шкале.»

Последние реплики до обрыва:
${recentDialogue || 'Истории реплик нет. Просто извинись за обрыв и спроси последний незавершенный вопрос.'}`;
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

            const noAnswerReasons = {
                call_timeout: 'Абонент не ответил за 45 секунд.',
                call_failed: 'Звонок не состоялся: абонент не ответил, сбросил звонок или линия была недоступна.',
                dial_error: 'Ошибка при попытке набора номера.'
            };
            if (!session.callConnected) {
                const outcomeText = noAnswerReasons[session.finalizationReason] || 'Звонок не был соединен с абонентом.';
                return {
                    client_name: safeString(leadContext && (leadContext.client_name || leadContext.name)),
                    client_phone: session.targetPhone,
                    call_goal: 'Исходящий дозвон по базе участников мебельного форума Amix.',
                    manager_offer: 'Разговор не состоялся, вопросы клиенту не задавались.',
                    activity_type: '',
                    is_decision_maker: '',
                    average_check: '',
                    traffic_source: '',
                    bot_impression: '',
                    outcome: outcomeText,
                    next_step: 'Если клиент перезвонит на номер, входящий сценарий должен подтянуть историю по номеру и продолжить опрос.',
                    summary: `Не удалось дозвониться до участника Amix на номер ${session.targetPhone}. ${outcomeText}`
                };
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
                client_name: safeString(leadContext && (leadContext.client_name || leadContext.name)),
                client_phone: session.targetPhone,
                call_goal: userText || 'Исходящий звонок-опрос участника мебельного форума Amix.',
                manager_offer: assistantText || 'AI-помощник собрал ответы по профилю бизнеса, роли собеседника, среднему чеку, источникам клиентов и оценке работы бота.',
                outcome: session.finalizationReason || 'Звонок завершен.',
                next_step: 'Проверить запись и сохранить ответы участника Amix в базе.',
                summary: `Исходящий звонок по базе участников форума Amix на номер ${session.targetPhone}. Итог: ${session.finalizationReason || 'завершен'}.`
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
                outbound_task_id: session.outboundTaskId || undefined,
                campaign_id: session.campaignId || undefined,
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
            sendStatus('recording_ready', 'Запись разговора готова', { tag, recording_status: getRecordingStatus() }, session);
            sendToBackend(
                '/webhook/voximplant/recording_ready',
                {
                    session_id: session.sessionId,
                    outbound_task_id: session.outboundTaskId || undefined,
                    campaign_id: session.campaignId || undefined,
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
            sendStatus('finalize_start', `Финализирую звонок: ${reason}`, { reason, should_hangup: shouldHangup }, session);

            activeCallTimer = clearTimer(activeCallTimer);
            callTimeoutTimer = clearTimer(callTimeoutTimer);
            summaryWaitTimer = clearTimer(summaryWaitTimer);
            session.reconnectTimer = clearTimer(session.reconnectTimer);
            session.openingUnlockTimer = clearTimer(session.openingUnlockTimer);

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
                    sendStatus('finalize_sent', 'Итоги звонка отправлены на backend', { reason }, session);
                    session.done = true;
                    closeGeminiClient();
                    activeCall = null;
                    setTimeout(() => {
                        finishingCurrentCall = false;
                        dialNext();
                    }, NEXT_CALL_DELAY_MS);
                });
            };

            if (!session.callConnected || !activeGeminiClient || session.summaryReceived || session.summaryRequestSent) {
                finalizeNow();
                return;
            }

            session.summaryRequestSent = true;
            sendStatus('summary_request', 'Запрашиваю summary у AI', {}, session);
            try {
                sendUserTextToModel(
                    activeGeminiClient,
                    `Разговор завершен. Обязательно вызови функцию ${SUMMARY_FUNCTION_NAME}.
Заполни поля:
- client_name
- client_phone
- call_goal
- manager_offer
- activity_type
- is_decision_maker
- average_check
- traffic_source
- bot_impression
- outcome
- next_step
- summary

Требования:
- Пиши значения на русском языке.
- summary: 2-4 предложения, без длинных цитат из расшифровки.
- call_goal / manager_offer / outcome / next_step: кратко и предметно, по 1-2 предложения.
- bot_impression: укажи оценку по 10-балльной шкале; реакцию на AI-разговор добавляй только если клиент сам ее назвал.
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

        const enableCallerInputToGemini = (reason) => {
            if (session.done || finishingCurrentCall || !activeCall || !activeGeminiClient) return;
            if (session.callerInputConnected) return;

            try {
                activeCall.sendMediaTo(activeGeminiClient);
                session.callerInputConnected = true;
                session.openingGreetingDone = true;
                session.openingUnlockTimer = clearTimer(session.openingUnlockTimer);
                Logger.write(`===CALLER_INPUT_CONNECTED:${reason}===`);
                sendStatus('caller_input_enabled', 'Микрофон абонента подключен к AI', { reason }, session);
            } catch (e) {
                Logger.write('===CALLER_INPUT_CONNECT_ERROR===');
                Logger.write(String(e));
                try {
                    VoxEngine.sendMediaBetween(activeCall, activeGeminiClient);
                    session.geminiOutputConnected = true;
                    session.callerInputConnected = true;
                    session.openingGreetingDone = true;
                    session.openingUnlockTimer = clearTimer(session.openingUnlockTimer);
                    Logger.write(`===FULL_MEDIA_BRIDGE_FALLBACK:${reason}===`);
                    sendStatus('caller_input_enabled', 'Медиа между абонентом и AI подключено fallback-методом', { reason }, session);
                } catch (fallbackError) {
                    Logger.write('===FULL_MEDIA_BRIDGE_FALLBACK_ERROR===');
                    Logger.write(String(fallbackError));
                }
            }
        };

        const connectGeminiOutputToCall = (client, reason) => {
            if (session.done || finishingCurrentCall || !activeCall || !client) return false;
            if (session.geminiOutputConnected) return true;

            try {
                client.sendMediaTo(activeCall);
                session.geminiOutputConnected = true;
                Logger.write(`===GEMINI_OUTPUT_CONNECTED:${reason}===`);
                return true;
            } catch (e) {
                Logger.write('===GEMINI_OUTPUT_CONNECT_ERROR===');
                Logger.write(String(e));
                try {
                    VoxEngine.sendMediaBetween(activeCall, client);
                    session.geminiOutputConnected = true;
                    session.callerInputConnected = true;
                    Logger.write(`===FULL_MEDIA_BRIDGE_FALLBACK:${reason}===`);
                    return true;
                } catch (fallbackError) {
                    Logger.write('===FULL_MEDIA_BRIDGE_FALLBACK_ERROR===');
                    Logger.write(String(fallbackError));
                    return false;
                }
            }
        };

        const sendOpeningGreeting = (client, reason) => {
            if (session.done || finishingCurrentCall || !session.callConnected || !client) return;
            if (session.startPromptSent) return;

            connectGeminiOutputToCall(client, reason);

            const openingGreeting = buildOpeningGreetingText(session.leadContext);
            const promptText = FORCE_OPENING_GREETING
                ? `Сейчас абонент только что поднял трубку. Не жди его реплики и не реагируй на возможные первые "алло". Сразу, дословно и одним сообщением произнеси приветствие: "${openingGreeting}"`
                : 'Начни исходящий звонок коротким приветствием и вопросом, удобно ли сейчас говорить.';

            sendUserTextToModel(client, promptText, 'opening_greeting');
            session.startPromptSent = true;
            Logger.write(`===OPENING_GREETING_SENT:${reason}===`);
            sendStatus('opening_greeting_sent', 'Приветствие отправлено в AI', { reason }, session);

            session.openingUnlockTimer = setTimeout(() => {
                Logger.write('===OPENING_GREETING_UNLOCK_FALLBACK===');
                enableCallerInputToGemini('opening_fallback_timeout');
            }, OPENING_GREETING_INPUT_UNLOCK_FALLBACK_MS);
        };

        const maybeStartOpeningGreeting = (reason) => {
            if (!session.callConnected || !session.geminiReady || !activeGeminiClient) return;
            if (session.startPromptSent) return;
            sendOpeningGreeting(activeGeminiClient, reason);
        };

        const connectFullMediaAfterReconnect = (client) => {
            if (!session.callConnected || !client || !activeCall) return;
            try {
                VoxEngine.sendMediaBetween(activeCall, client);
                session.geminiOutputConnected = true;
                session.callerInputConnected = true;
                Logger.write('===FULL_MEDIA_BRIDGE_CONNECTED:reconnect===');
            } catch (e) {
                Logger.write('===FULL_MEDIA_BRIDGE_RECONNECT_ERROR===');
                Logger.write(String(e));
            }
        };

        const startGeminiWarmup = async (reason) => {
            if (session.geminiWarmupStarted || activeGeminiClient) return;
            session.geminiWarmupStarted = true;
            Logger.write(`===GEMINI_WARMUP_START:${reason}===`);
            sendStatus('gemini_warmup_start', 'Подключаю AI', { reason }, session);
            try {
                activeGeminiClient = await createGeminiClient();
                Logger.write(`===GEMINI_WARMUP_DONE:${reason}===`);
                sendStatus('gemini_ready', 'AI подключен', { reason }, session);
                maybeStartOpeningGreeting(`${reason}_warmup_done`);
            } catch (e) {
                Logger.write('===GEMINI_CREATE_ERROR===');
                Logger.write(String(e));
                sendStatus('gemini_error', safeString(e), { reason }, session);
                if (session.callConnected) finishAndContinue('gemini_create_error', true);
            }
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
                                }
                            ]
                        }
                    ],
                    systemInstruction: {
                        parts: [{ text: buildSystemInstruction(targetPhone, session.leadContext) }]
                    }
                }
            });

            session.websocketOpenedAtMs = Date.now();

            client.addEventListener(Gemini.LiveAPIEvents.SetupComplete, () => {
                Logger.write('===GEMINI_SETUP_COMPLETE===');
                session.geminiReady = true;
                if (session.startPromptSent) {
                    connectFullMediaAfterReconnect(client);
                    sendUserTextToModel(client, buildReconnectPrompt(), 'reconnect_prompt');
                    Logger.write('===RECONNECT_PROMPT_SENT===');
                    return;
                }
                maybeStartOpeningGreeting('setup_complete');
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
                    session.summaryData.activity_type = clipText(args.activity_type, 200);
                    session.summaryData.is_decision_maker = clipText(args.is_decision_maker, 100);
                    session.summaryData.average_check = clipText(args.average_check, 120);
                    session.summaryData.traffic_source = clipText(args.traffic_source, 160);
                    session.summaryData.bot_impression = clipText(args.bot_impression, 200);
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

                if (payload.turnComplete === true && session.startPromptSent && !session.callerInputConnected) {
                    enableCallerInputToGemini('opening_turn_complete');
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
        sendStatus('dial_start', 'Начинаю набор номера', { target_phone: targetPhone, caller_id: callerId }, session);
        try {
            activeCall = VoxEngine.callPSTN(targetPhone, callerId);
        } catch (e) {
            Logger.write('===CALL_PSTN_ERROR===');
            Logger.write(String(e));
            sendStatus('dial_error', safeString(e), { target_phone: targetPhone, caller_id: callerId }, session);
            finishAndContinue('dial_error', false);
            return;
        }
        startGeminiWarmup('after_dial');
        try {
            if (activeCall && activeCall.id) session.sessionId = safeString(activeCall.id());
        } catch (e) {
            Logger.write('===CALL_ID_READ_ERROR===');
            Logger.write(String(e));
        }

        callTimeoutTimer = setTimeout(() => {
            Logger.write(`===CALL_TIMEOUT:${targetPhone}===`);
            sendStatus('call_timeout', 'Абонент не ответил за таймаут', { target_phone: targetPhone }, session);
            finishAndContinue('call_timeout', true);
        }, CALL_TIMEOUT_MS);

        activeCall.addEventListener(CallEvents.Connected, async (event) => {
            Logger.write(`===CALL_CONNECTED:${targetPhone}===`);
            Logger.write(safeJson(event));
            sendStatus('call_connected', 'Абонент взял трубку', { target_phone: targetPhone }, session);
            session.callConnected = true;
            session.connectedAtUtc = new Date().toISOString();
            callTimeoutTimer = clearTimer(callTimeoutTimer);

            sendToBackend(
                '/webhook/voximplant/call_started',
                {
                    session_id: session.sessionId,
                    outbound_task_id: session.outboundTaskId || undefined,
                    campaign_id: session.campaignId || undefined,
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
                    sendStatus('recording_requested', 'Запрошена запись разговора', {}, session);
                } catch (e) {
                    session.recordingFailed = true;
                    session.recordingErrorText = safeString(e);
                    Logger.write('===CALL_RECORD_START_ERROR===');
                    Logger.write(String(e));
                    sendStatus('recording_failed', safeString(e), {}, session);
                }
            }

            maybeStartOpeningGreeting('call_connected');
            startGeminiWarmup('call_connected');
        });

        activeCall.addEventListener(CallEvents.RecordStarted, (event) => {
            Logger.write('===CALL_RECORD_STARTED===');
            Logger.write(safeJson(event));
            session.recordingStarted = true;
            session.recordingUrl = safeString(event && event.url);
            sendStatus('recording_ready', 'Запись разговора началась', { record_event: 'started' }, session);
            sendRecordingReady('record_started');
        });

        if (CallEvents.RecordStopped) {
            activeCall.addEventListener(CallEvents.RecordStopped, (event) => {
                Logger.write('===CALL_RECORD_STOPPED===');
                Logger.write(safeJson(event));
                const url = safeString(event && event.url);
                if (url) {
                    session.recordingUrl = url;
                    sendStatus('recording_ready', 'Запись разговора остановлена и готова', { record_event: 'stopped' }, session);
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
                sendStatus('recording_failed', session.recordingErrorText, {}, session);
            });
        }

        activeCall.addEventListener(CallEvents.Disconnected, (event) => {
            Logger.write(`===CALL_DISCONNECTED:${targetPhone}===`);
            Logger.write(safeJson(event));
            sendStatus('call_disconnected', 'Звонок завершен', { target_phone: targetPhone }, session);
            if (event && event.duration !== undefined) session.callDurationSec = toNumber(event.duration);
            if (event && event.cost !== undefined) session.telephonyCostRub = toNumber(event.cost);
            finishAndContinue('call_disconnected', false);
        });

        activeCall.addEventListener(CallEvents.Failed, (event) => {
            Logger.write(`===CALL_FAILED:${targetPhone}===`);
            Logger.write(safeJson(event));
            sendStatus('call_failed', 'Звонок не состоялся', { target_phone: targetPhone, event }, session);
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

    sendStatus('scenario_started', 'Сценарий стартовал в Voximplant', {
        has_custom_data: Object.keys(scenarioCustomData || {}).length > 0
    });
    sendStatus('custom_data_loaded', 'Данные задачи прочитаны из custom_data', {
        task_id: scenarioCustomData.task_id || scenarioCustomData.outbound_task_id || '',
        phone: normalizePhone(scenarioCustomData.phone || '')
    });

    await loadLeadContextFromCustomData();

    if (!targets.length) {
        Logger.write('===EMPTY_CALL_TARGETS===');
        const taskId =
            scenarioCustomData.task_id ||
            scenarioCustomData.outbound_task_id ||
            (leadContext && leadContext.task_id);
        const campaignId = scenarioCustomData.campaign_id || (leadContext && leadContext.campaign_id);
        if (taskId) {
            sendStatus('empty_call_target', 'Номер клиента не передан в сценарий', { task_id: taskId });
            let terminated = false;
            const terminateOnce = () => {
                if (terminated) return;
                terminated = true;
                VoxEngine.terminate();
            };
            sendToBackend(
                '/webhook/voximplant/finalize',
                {
                    session_id: `empty-target-${Date.now()}`,
                    project: PROJECT_NAME,
                    script_name: SCRIPT_NAME,
                    outbound_task_id: Number(taskId),
                    campaign_id: campaignId ? Number(campaignId) : undefined,
                    exported_at_utc: new Date().toISOString(),
                    finalization_reason: 'empty_call_target',
                    model: GEMINI_MODEL,
                    caller_phone: callerId,
                    client_phone: safeString(leadContext && leadContext.phone),
                    client_name: safeString(leadContext && (leadContext.client_name || leadContext.name)),
                    summary: 'Сценарий завершился без звонка: номер клиента не был передан в сценарий.',
                    outcome: 'Ошибка запуска: номер клиента не передан в сценарий.',
                    next_step: 'Проверить script_custom_data и /scenario-context перед повторным запуском.',
                    recording_status: 'not_started'
                },
                'EMPTY_CALL_TARGETS',
                terminateOnce
            );
            setTimeout(terminateOnce, 3000);
            return;
        }
        VoxEngine.terminate();
        return;
    }

    Logger.write('===OUTBOUND_SERVER_TEST_STARTED===');
    Logger.write(safeJson({ callerId, targets, backendUrlConfigured: Boolean(backendUrl) }));
    dialNext();
});
