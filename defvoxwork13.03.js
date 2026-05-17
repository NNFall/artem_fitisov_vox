require(Modules.Gemini);
require(Modules.ApplicationStorage);

const ANSWER_DELAY_MS = 10000;
const RINGBACK_COUNTRY = 'RU';

VoxEngine.addEventListener(AppEvents.CallAlerting, async ({ call }) => {
    let geminiLiveAPIClient;
    let isSessionTerminated = false;
    let answerTimer;
    let earlyMediaStarted = false;

    const terminateSession = () => {
        if (isSessionTerminated) return;
        isSessionTerminated = true;

        if (answerTimer) {
            clearTimeout(answerTimer);
            answerTimer = null;
        }

        try {
            if (geminiLiveAPIClient) geminiLiveAPIClient.close();
        } catch (e) {
            Logger.write('===CLOSE_ERROR===');
            Logger.write(String(e));
        }
        VoxEngine.terminate();
    };

    call.addEventListener(CallEvents.Disconnected, terminateSession);
    call.addEventListener(CallEvents.Failed, terminateSession);

    const onWebSocketClose = (event) => {
        Logger.write('===ON_WEB_SOCKET_CLOSE===');
        Logger.write(JSON.stringify(event));
        terminateSession();
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
        const apiKeyEntry = await ApplicationStorage.get('GEMINI_API_KEY');
        const GEMINI_API_KEY = apiKeyEntry && apiKeyEntry.value;
        const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

        if (!GEMINI_API_KEY) {
            Logger.write('===NO_GEMINI_API_KEY_IN_APPLICATION_STORAGE===');
            terminateSession();
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

            // Включаем транскрипцию входящей речи клиента
            inputAudioTranscription: {},

            // Если нужны текстовые логи ответа модели — раскомментируйте:
            outputAudioTranscription: {},

            systemInstruction: {
                parts: [{
                    text: `
Ты — Екатерина, приветливый, уверенный и компетентный менеджер мебельной мастерской «Just Wood» (Джаст Вуд).
Ты общаешься голосом по телефону. Твоя речь должна быть живой, естественной, без зачитывания длинных списков. Говори кратко, делай паузы, задавай уточняющие вопросы.

Твоя ГЛАВНАЯ ЦЕЛЬ: Ответить на базовые вопросы клиента, показать экспертность и обязательно пригласить его на личную встречу (в мастерскую или вызвать замерщика).

===== СТРОГИЕ ПРАВИЛА =====
1. Никогда не называй точную стоимость по телефону. Объясняй, что цена зависит от материалов и размеров, поэтому нужен проект.
2. Не обещай точных сроков. Говори: "в среднем от 1 до 2 месяцев".
3. Не говори, что ты искусственный интеллект. Ты — менеджер Алиса.
4. Если клиент просит портфолио или ссылки, скажи:
"Я обязательно передам ваш номер нашему руководителю Леониду, и он пришлет вам ссылки и примеры работ в мессенджер".

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
- Фурнитура: Boyard, Blum, Hettich
- Фасады: МДФ, пленка, эмаль, алюминиевые профили со стеклом
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

Пример призыва:
"Давайте лучше встретимся у нас на производстве или договоримся на замер. Посмотрим материалы, набросаем проект и уже точно посчитаем стоимость. Вам удобно на этой неделе?"
                    `
                }]
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

        geminiLiveAPIClient.addEventListener(Gemini.LiveAPIEvents.Unknown, (event) => {
            Logger.write('===Gemini.LiveAPIEvents.Unknown===');
            Logger.write(JSON.stringify(event));
        });

        geminiLiveAPIClient.addEventListener(Gemini.LiveAPIEvents.SetupComplete, () => {
            Logger.write('===Gemini.LiveAPIEvents.SetupComplete===');

            // Сначала соединяем медиа, потом инициируем приветствие
            VoxEngine.sendMediaBetween(call, geminiLiveAPIClient);

            const msg = {
                turns: [{
                    role: 'user',
                    parts: [{ text: 'Поздоровайся с клиентом: Здравствуйте, меня зовут Екатерина, мебельная компания Just Wood! Какая мебель Вас интересует?!?' }]
                }],
                turnComplete: true
            };

            geminiLiveAPIClient.sendClientContent(msg);
        });

        geminiLiveAPIClient.addEventListener(Gemini.LiveAPIEvents.ServerContent, (event) => {
            Logger.write('===Gemini.LiveAPIEvents.ServerContent===');

            const payload =
                event &&
                event.data &&
                event.data.payload
                    ? event.data.payload
                    : {};

            Logger.write(JSON.stringify(payload));

            // ВАЖНО: проверяем именно true
            if (payload.interrupted === true) {
                Logger.write('===AGENT_INTERRUPTED===');
                geminiLiveAPIClient.clearMediaBuffer();
            }

            if (payload.inputTranscription !== undefined) {
                Logger.write('===INPUT_TRANSCRIPTION===');
                Logger.write(JSON.stringify(payload.inputTranscription));
            }
        });

        geminiLiveAPIClient.addEventListener(Gemini.Events.WebSocketMediaStarted, (event) => {
            Logger.write('===Gemini.Events.WebSocketMediaStarted===');
            Logger.write(JSON.stringify(event));
        });

        geminiLiveAPIClient.addEventListener(Gemini.Events.WebSocketMediaEnded, (event) => {
            Logger.write('===Gemini.Events.WebSocketMediaEnded===');
            Logger.write(JSON.stringify(event));
        });

        } catch (error) {
            Logger.write('===SOMETHING_WENT_WRONG===');
            Logger.write(String(error));
            terminateSession();
        }
    };

    answerTimer = setTimeout(async () => {
        if (isSessionTerminated) return;

        Logger.write(`===ANSWER_DELAY_MS:${ANSWER_DELAY_MS}===`);
        if (!earlyMediaStarted) {
            Logger.write('===EARLY_MEDIA_NOT_STARTED===');
        }
        call.answer();
        await startGeminiSession();
    }, ANSWER_DELAY_MS);

    startPreAnswerTone();
});
