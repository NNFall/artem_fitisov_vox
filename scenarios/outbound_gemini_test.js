require(Modules.Gemini);
require(Modules.ApplicationStorage);

/*
 * Test scenario for outbound calls from Voximplant to PSTN numbers.
 *
 * How to use:
 * 1. Put your verified Voximplant caller ID into CALLER_ID.
 * 2. Put one or more test phone numbers into CALL_TARGETS.
 * 3. Store GEMINI_API_KEY in Voximplant ApplicationStorage.
 * 4. Run the scenario manually from Voximplant or start it through Management API.
 */

const CALLER_ID = '79014172420';
const CALL_TARGETS = [
    '79958407752',
];

const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_VOICE_NAME = 'Kore';
const LEAD_SOURCE = 'мероприятии по внедрению AI в бизнес';
const CALL_RECORD_ENABLED = true;

const NEXT_CALL_DELAY_MS = 1000;
const MAX_CALL_DURATION_MS = 5 * 60 * 1000;
const CALL_TIMEOUT_MS = 60 * 1000;

const normalizePhone = (value) =>
    String(value || '')
        .replace(/[^\d+]/g, '')
        .replace(/^\+/, '');

const safeJson = (value) => {
    try {
        return JSON.stringify(value || {});
    } catch (e) {
        return String(value);
    }
};

const buildSystemInstruction = (phone) => `
Ты — Екатерина, голосовой AI-помощник и менеджер по первичной квалификации заявок.
Ты звонишь по теплой базе: человек был на ${LEAD_SOURCE}, видел демонстрацию AI-решения или оставлял контакт/заявку на консультацию.

Цель тестового звонка:
- вежливо напомнить, что клиент оставлял заявку после мероприятия по AI для бизнеса;
- уточнить, актуален ли интерес к внедрению голосового AI-помощника;
- если интересно, кратко объяснить пользу: входящие звонки, исходящие обзвоны, фиксация ответов, записи, отчеты, передача данных в CRM/таблицы/Telegram;
- понять бизнес клиента и задачу, где AI может помочь;
- собрать имя, нишу, задачу, удобный способ связи и удобное время для консультации;
- в конце кратко проговорить итог и следующий шаг.

Старт:
«Здравствуйте! Меня зовут Екатерина. Вы оставляли заявку после мероприятия по внедрению AI в бизнес. Я как раз голосовой AI-помощник, то есть сейчас вы слышите пример такой технологии в работе. Вам удобно пару минут поговорить?»

Стиль:
- говори коротко и естественно;
- задавай только один вопрос за раз;
- сначала реагируй на ответ клиента, потом уточняй;
- не дави и не спорь;
- не уходи в технические подробности, если клиент сам не спросил;
- если клиент спрашивает, AI ли ты, честно скажи, что ты голосовой AI-помощник.

Если клиенту интересно:
«Отлично. Тогда буквально пару вопросов, чтобы понять, чем вы занимаетесь и где помощник мог бы быть полезен.»

Если клиенту неудобно:
«Понимаю. Тогда подскажите, пожалуйста, когда лучше коротко перезвонить?»

Если клиент не помнит заявку:
«Да, понимаю, такое бывает. Контакт был после мероприятия или демонстрации по AI для бизнеса. Я просто уточню: тема внедрения голосового помощника или AI-автоматизации для вашей компании в принципе актуальна?»

Что можно объяснять:
«Такой помощник может принимать входящие звонки, делать исходящие обзвоны по базе, задавать вопросы, фиксировать ответы, сохранять записи и передавать менеджеру уже структурированный итог.»

Если спрашивают цену:
«Стоимость зависит от задачи, объема звонков и интеграций. Чтобы не называть цифры вслепую, лучше сначала понять ваш сценарий, а потом специалист предложит вариант внедрения.»

Если не интересно:
«Поняла вас. Тогда не буду отвлекать. Хорошего дня.»

Контекст:
- номер, на который звонит система: ${phone};
- это исходящий звонок по теплой базе;
- результат нужно сформулировать так, чтобы менеджер понял: интерес есть или нет, какая задача, какой следующий шаг.
`;

const createGeminiClient = async (call, phone, closeSession) => {
    const apiKeyEntry = await ApplicationStorage.get('GEMINI_API_KEY');
    const apiKey = apiKeyEntry && apiKeyEntry.value;

    if (!apiKey) {
        Logger.write('===NO_GEMINI_API_KEY_IN_APPLICATION_STORAGE===');
        call.hangup();
        return null;
    }

    const client = await Gemini.createLiveAPIClient({
        apiKey,
        model: GEMINI_MODEL,
        backend: Gemini.Backend.GEMINI_API,
        onWebSocketClose: (event) => {
            Logger.write('===GEMINI_WEBSOCKET_CLOSED===');
            Logger.write(safeJson(event));
            closeSession('gemini_websocket_closed');
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
            systemInstruction: {
                parts: [{ text: buildSystemInstruction(phone) }]
            }
        }
    });

    client.addEventListener(Gemini.LiveAPIEvents.SetupComplete, () => {
        Logger.write('===GEMINI_SETUP_COMPLETE===');
        VoxEngine.sendMediaBetween(call, client);
        client.sendClientContent({
            turns: [
                {
                    role: 'user',
                    parts: [
                        {
                            text:
                                'Начни исходящий звонок. Скажи: "Здравствуйте! Меня зовут Екатерина. Вы оставляли заявку после мероприятия по внедрению AI в бизнес. Я как раз голосовой AI-помощник, то есть сейчас вы слышите пример такой технологии в работе. Вам удобно пару минут поговорить?" ' +
                                'После ответа продолжай по инструкции.'
                        }
                    ]
                }
            ],
            turnComplete: true
        });
        Logger.write('===START_PROMPT_SENT===');
    });

    client.addEventListener(Gemini.LiveAPIEvents.ServerContent, (event) => {
        const payload = event && event.data && event.data.payload ? event.data.payload : {};
        Logger.write('===GEMINI_SERVER_CONTENT===');
        Logger.write(safeJson(payload));

        if (payload.interrupted === true) {
            Logger.write('===AGENT_INTERRUPTED===');
            client.clearMediaBuffer();
        }

        if (payload.inputTranscription !== undefined) {
            Logger.write('===INPUT_TRANSCRIPTION===');
            Logger.write(safeJson(payload.inputTranscription));
        }

        if (payload.outputTranscription !== undefined) {
            Logger.write('===OUTPUT_TRANSCRIPTION===');
            Logger.write(safeJson(payload.outputTranscription));
        }
    });

    client.addEventListener(Gemini.LiveAPIEvents.Unknown, (event) => {
        Logger.write('===GEMINI_UNKNOWN_EVENT===');
        Logger.write(safeJson(event));
    });

    client.addEventListener(Gemini.Events.WebSocketMediaStarted, (event) => {
        Logger.write('===GEMINI_MEDIA_STARTED===');
        Logger.write(safeJson(event));
    });

    client.addEventListener(Gemini.Events.WebSocketMediaEnded, (event) => {
        Logger.write('===GEMINI_MEDIA_ENDED===');
        Logger.write(safeJson(event));
    });

    return client;
};

VoxEngine.addEventListener(AppEvents.Started, () => {
    const targets = CALL_TARGETS.map(normalizePhone).filter((phone) => phone.length > 0);
    const callerId = normalizePhone(CALLER_ID);

    let index = 0;
    let activeCall = null;
    let activeGeminiClient = null;
    let activeCallTimer = null;
    let callTimeoutTimer = null;
    let finishingCurrentCall = false;

    const clearTimers = () => {
        if (activeCallTimer) {
            clearTimeout(activeCallTimer);
            activeCallTimer = null;
        }
        if (callTimeoutTimer) {
            clearTimeout(callTimeoutTimer);
            callTimeoutTimer = null;
        }
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

    const finishCurrentCall = (reason) => {
        if (finishingCurrentCall) return;
        finishingCurrentCall = true;

        Logger.write(`===FINISH_CURRENT_CALL:${reason}===`);
        clearTimers();
        closeGeminiClient();

        try {
            if (activeCall) activeCall.hangup();
        } catch (e) {
            Logger.write('===CALL_HANGUP_ERROR===');
            Logger.write(String(e));
        }

        activeCall = null;

        setTimeout(() => {
            finishingCurrentCall = false;
            dialNext();
        }, NEXT_CALL_DELAY_MS);
    };

    const terminateAll = (reason) => {
        Logger.write(`===TERMINATE:${reason}===`);
        clearTimers();
        closeGeminiClient();
        VoxEngine.terminate();
    };

    const dialNext = () => {
        if (index >= targets.length) {
            terminateAll('all_targets_processed');
            return;
        }

        const phone = targets[index++];
        Logger.write(`===OUTBOUND_DIAL_START:${phone}===`);

        activeCall = VoxEngine.callPSTN(phone, callerId);

        callTimeoutTimer = setTimeout(() => {
            Logger.write(`===CALL_TIMEOUT:${phone}===`);
            finishCurrentCall('call_timeout');
        }, CALL_TIMEOUT_MS);

        activeCall.addEventListener(CallEvents.Connected, async (event) => {
            Logger.write(`===CALL_CONNECTED:${phone}===`);
            Logger.write(safeJson(event));
            clearTimeout(callTimeoutTimer);
            callTimeoutTimer = null;

            activeCallTimer = setTimeout(() => {
                Logger.write(`===MAX_CALL_DURATION_REACHED:${phone}===`);
                finishCurrentCall('max_call_duration');
            }, MAX_CALL_DURATION_MS);

            if (!CALL_RECORD_ENABLED) {
                Logger.write('===CALL_RECORDING_DISABLED===');
            } else {
                try {
                    activeCall.record({
                        hd_audio: true,
                        stereo: true
                    });
                    Logger.write('===CALL_RECORD_START_REQUESTED===');
                } catch (e) {
                    Logger.write('===CALL_RECORD_START_ERROR===');
                    Logger.write(String(e));
                }
            }

            try {
                activeGeminiClient = await createGeminiClient(activeCall, phone, finishCurrentCall);
            } catch (e) {
                Logger.write('===GEMINI_CREATE_ERROR===');
                Logger.write(String(e));
                finishCurrentCall('gemini_create_error');
            }
        });

        activeCall.addEventListener(CallEvents.RecordStarted, (event) => {
            Logger.write('===CALL_RECORD_STARTED===');
            Logger.write(safeJson(event));
        });

        activeCall.addEventListener(CallEvents.Disconnected, (event) => {
            Logger.write(`===CALL_DISCONNECTED:${phone}===`);
            Logger.write(safeJson(event));
            finishCurrentCall('call_disconnected');
        });

        activeCall.addEventListener(CallEvents.Failed, (event) => {
            Logger.write(`===CALL_FAILED:${phone}===`);
            Logger.write(safeJson(event));
            finishCurrentCall('call_failed');
        });
    };

    if (!callerId) {
        Logger.write('===EMPTY_CALLER_ID===');
        terminateAll('empty_caller_id');
        return;
    }

    if (!targets.length) {
        Logger.write('===EMPTY_CALL_TARGETS===');
        terminateAll('empty_call_targets');
        return;
    }

    Logger.write('===OUTBOUND_TEST_STARTED===');
    Logger.write(safeJson({ callerId, targets }));
    dialNext();
});
