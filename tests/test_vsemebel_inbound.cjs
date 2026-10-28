const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scenarioPath = path.join(__dirname, '..', 'scenarios', 'inbound_vsemebel_community.js');
const source = fs.readFileSync(scenarioPath, 'utf8');
const DEFAULT_NOW = Date.parse('2026-10-28T12:00:00Z');
const CALLER_PHONE = '+79991234567';

function eventTarget() {
    const listeners = new Map();
    return {
        listeners,
        addEventListener(name, listener) {
            assert.equal(typeof name, 'string', 'The event must be a declared SDK event');
            const handlers = listeners.get(name) || [];
            handlers.push(listener);
            listeners.set(name, handlers);
        },
        removeEventListener(name, listener) {
            listeners.set(name, (listeners.get(name) || []).filter(value => value !== listener));
        },
        async emit(name, event = {}) {
            for (const listener of [...(listeners.get(name) || [])]) await listener(event);
        }
    };
}

function fixture(nowMs = DEFAULT_NOW, storageOverrides = {}, getSecretValue) {
    const app = eventTarget();
    const call = eventTarget();
    const client = eventTarget();
    const configs = [];
    const prompts = [];
    const toolResponses = [];
    const requests = [];
    const logs = [];
    const loadedModules = [];
    const storageKeys = [];
    const secretKeys = [];
    const timers = new Map();
    let timerId = 0;
    let answered = 0;
    let outboundAttempts = 0;
    let closed = 0;
    let terminated = 0;

    const AppEvents = { CallAlerting: 'app.CallAlerting', Started: 'app.Started' };
    const CallEvents = Object.fromEntries([
        'Connected', 'Disconnected', 'Failed', 'RecordStarted', 'RecordStopped',
        'RecordError', 'PlaybackStarted', 'PlaybackFinished'
    ].map(name => [name, `call.${name}`]));
    const LiveAPIEvents = Object.fromEntries([
        'SetupComplete', 'ServerContent', 'ToolCall', 'ToolCallCancellation',
        'GoAway', 'Error', 'Closed', 'Unknown'
    ].map(name => [name, `gemini.${name}`]));
    const schedule = (callback, delay) => {
        timers.set(++timerId, { callback, delay });
        return timerId;
    };
    const forbidDial = () => {
        outboundAttempts += 1;
        throw new Error('An inbound scenario must not place an outgoing call');
    };

    Object.assign(call, {
        answer() { answered += 1; },
        callerid: () => CALLER_PHONE,
        number: () => CALLER_PHONE,
        id: () => 'inbound-test-call',
        displayName: () => '',
        startEarlyMedia() {},
        playProgressTone() {},
        sendMediaTo() {},
        stopMediaTo() {},
        record() {},
        hangup() {},
        duration: () => 0
    });
    Object.assign(client, {
        sendClientContent(content) { prompts.push(content); },
        sendToolResponse(content) { toolResponses.push(content); },
        sendMediaTo() {},
        stopMediaTo() {},
        clearMediaBuffer() {},
        close() { closed += 1; }
    });

    const ApplicationStorage = {
        async get(key) {
            storageKeys.push(key);
            const values = {
                GEMINI_API_KEY: 'test-gemini-key',
                TELEGRAM_BOT_TOKEN: 'test-telegram-token',
                TELEGRAM_CHAT_ID_ADMIN: 'test-admin-id',
                TELEGRAM_CHAT_ID_USER: 'test-user-id',
                TELEGRAM_CHAT_ID: 'test-legacy-id',
                ...storageOverrides
            };
            return { value: values[key] || '' };
        }
    };
    const Gemini = {
        LiveAPIEvents,
        Events: {
            WebSocketMediaStarted: 'gemini.WebSocketMediaStarted',
            WebSocketMediaEnded: 'gemini.WebSocketMediaEnded'
        },
        Backend: { GEMINI_API: 'GEMINI_API' },
        async createLiveAPIClient(config) {
            configs.push(config);
            return client;
        }
    };
    const Modules = { Gemini: 'Gemini', ApplicationStorage: 'ApplicationStorage' };
    const loadModule = module => {
        loadedModules.push(module);
        assert.ok(Object.values(Modules).includes(module), `Unexpected module: ${module}`);
        return module === Modules.Gemini ? Gemini : ApplicationStorage;
    };
    class FixedDate extends Date {
        constructor(...args) { super(...(args.length ? args : [nowMs])); }
        static now() { return nowMs; }
    }

    const context = vm.createContext({
        Modules,
        requireModule: loadModule,
        require: loadModule,
        AppEvents,
        CallEvents,
        ApplicationStorage,
        Gemini,
        VoxEngine: Object.assign(app, {
            ...(getSecretValue === undefined ? {} : {
                getSecretValue(name) {
                    secretKeys.push(name);
                    return getSecretValue(name);
                }
            }),
            callPSTN: forbidDial,
            callSIP: forbidDial,
            callUser: forbidDial,
            sendMediaBetween() {},
            terminate() { terminated += 1; }
        }),
        Net: {
            httpRequest(url, callback, options) {
                requests.push({ url, options });
                if (callback) callback({ code: 200, text: '{"ok":true}' });
            }
        },
        Logger: { write(message) { logs.push(String(message)); } },
        Date: FixedDate,
        setTimeout: schedule,
        setInterval: schedule,
        clearTimeout(id) { timers.delete(id); },
        clearInterval(id) { timers.delete(id); }
    });
    vm.runInContext(source, context, { filename: scenarioPath, timeout: 1000 });

    return {
        context, app, call, client, configs, prompts, requests, logs, loadedModules, storageKeys, secretKeys, toolResponses,
        outboundAttempts: () => outboundAttempts,
        closed: () => closed,
        terminated: () => terminated,
        async runTimer(delay) {
            const [id, timer] = [...timers].find(([, value]) => value.delay === delay) || [];
            assert.ok(timer, `Expected a pending ${delay} ms timer`);
            timers.delete(id);
            await timer.callback();
        },
        async setup() {
            assert.equal(app.listeners.get(AppEvents.CallAlerting)?.length, 1);
            await app.emit(AppEvents.CallAlerting, { call });
            // The production script answers after a ringback timer; do not wait in real time.
            if (!answered) {
                const [id, timer] = [...timers].sort((a, b) => a[1].delay - b[1].delay)[0] || [];
                assert.ok(timer, 'An incoming call must answer or schedule its answer');
                timers.delete(id);
                await timer.callback();
            }
            await call.emit(CallEvents.Connected, { call });
            assert.equal(answered, 1, 'The incoming call must be answered once');
            assert.equal(configs.length, 1, `Gemini must be created: ${logs.join('\n')}`);
            assert.ok(client.listeners.has(LiveAPIEvents.SetupComplete));
            await client.emit(LiveAPIEvents.SetupComplete);
            assert.ok(prompts.length, `SetupComplete must send a prompt: ${logs.join('\n')}`);
            assert.equal(outboundAttempts, 0, 'No outgoing dialing is permitted');
            return configs[0];
        }
    };
}

function textParts(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(textParts).join('\n');
    if (!content || typeof content !== 'object') return '';
    if (typeof content.text === 'string') return content.text;
    return textParts(content.parts || content.turns || []);
}

function evaluate(f, expression) {
    return vm.runInContext(expression, f.context, { timeout: 1000 });
}

test('registers an inbound handler and uses storage credentials without outbound dialing', async () => {
    const f = fixture();
    const config = await f.setup();

    assert.ok(f.loadedModules.includes('Gemini'));
    assert.ok(f.loadedModules.includes('ApplicationStorage'));
    assert.deepEqual([...f.app.listeners.keys()], ['app.CallAlerting']);
    for (const key of [
        'GEMINI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID_ADMIN',
        'TELEGRAM_CHAT_ID_USER', 'TELEGRAM_CHAT_ID'
    ]) assert.ok(f.storageKeys.includes(key), `ApplicationStorage must read ${key}`);
    assert.equal(config.apiKey, 'test-gemini-key');
    assert.equal(config.backend, 'GEMINI_API');
    assert.equal(config.model, 'gemini-3.8-live', 'Preserve the verified JustWood model');
    assert.equal(evaluate(f, 'ANSWER_DELAY_MS'), 5000, 'Preserve the pre-answer delay');
    assert.equal(f.outboundAttempts(), 0);
    assert.doesNotMatch(source, /\bVoxEngine\s*\.\s*(?:callPSTN|callSIP|callUser)\s*\(/);
    assert.doesNotMatch(source, /[0-9]{7,12}:[A-Za-z0-9_-]{25,}/, 'Telegram tokens must not be embedded');
    assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/, 'Google API keys must not be embedded');
});

test('uses synchronous application Secrets with empty KVS and prefers them over populated KVS', async () => {
    const secrets = {
        GEMINI_API_KEY: 'secret-test-gemini-key',
        TELEGRAM_BOT_TOKEN: 'secret-test-telegram-token',
        TELEGRAM_CHAT_ID_ADMIN: 'secret-test-admin-id',
        TELEGRAM_CHAT_ID_USER: 'secret-test-user-id',
        TELEGRAM_CHAT_ID: 'secret-test-legacy-id'
    };
    const emptyStorage = Object.fromEntries(Object.keys(secrets).map(key => [key, '']));
    for (const storage of [emptyStorage, {}]) {
        const f = fixture(DEFAULT_NOW, storage, name => secrets[name]);
        const config = await f.setup();
        assert.equal(config.apiKey, secrets.GEMINI_API_KEY);
        assert.deepEqual(f.secretKeys.filter(name => !name.startsWith('VSEMEBEL_')), Object.keys(secrets));
        assert.deepEqual(f.storageKeys, [], 'Present Secrets must not read KVS');
        for (const value of Object.values(secrets)) {
            assert.ok(!f.logs.join('\n').includes(value), 'Config loading must not log values');
        }
        await submitSummary(f);
        await f.call.emit('call.Disconnected', { duration: 42 });
        assert.equal(f.requests.length, 3);
        for (const request of f.requests) {
            assert.equal(request.url, `https://api.telegram.org/bot${secrets.TELEGRAM_BOT_TOKEN}/sendMessage`);
        }
        const recipients = f.requests.map(request => JSON.parse(request.options.postData).chat_id);
        assert.deepEqual([...new Set(recipients)].sort(), [secrets.TELEGRAM_CHAT_ID_ADMIN, secrets.TELEGRAM_CHAT_ID_USER]);
        assert.equal(f.terminated(), 1);
    }
});

test('falls back per key to KVS for undefined, empty or whitespace-only Secrets', async () => {
    for (const missingValue of [undefined, '', ' \t ']) {
        const f = fixture(DEFAULT_NOW, {}, name => name === 'GEMINI_API_KEY' ? 'secret-test-gemini-key' : missingValue);
        const config = await f.setup();
        assert.equal(config.apiKey, 'secret-test-gemini-key');
        assert.deepEqual(f.storageKeys, [
            'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID_ADMIN', 'TELEGRAM_CHAT_ID_USER', 'TELEGRAM_CHAT_ID'
        ]);
        assert.match(textParts(config.connectConfig.systemInstruction), /УВЕДОМЛЕНИЯ ОРГАНИЗАТОРАМ:\s*настроены/iu);
    }
});

test('falls back to KVS if the Secrets API throws without logging the error', async () => {
    const errorText = 'Secret lookup failed with secret-test-credential';
    const f = fixture(DEFAULT_NOW, {}, () => { throw new Error(errorText); });
    const config = await f.setup();
    assert.equal(config.apiKey, 'test-gemini-key');
    assert.deepEqual(f.storageKeys, f.secretKeys.filter(name => !name.startsWith('VSEMEBEL_')));
    assert.equal(f.storageKeys.length, 5);
    assert.ok(!f.logs.join('\n').includes(errorText));
    assert.ok(!f.logs.join('\n').includes('test-gemini-key'));
    assert.ok(!f.logs.join('\n').includes('test-telegram-token'));
});

test('config loader preserves the value entry shape and suppresses KVS lookup errors', async () => {
    const f = fixture(DEFAULT_NOW, {}, () => undefined);
    assert.deepEqual({ ...await evaluate(f, "loadConfigEntry('GEMINI_API_KEY')") }, { value: 'test-gemini-key' });
    const errorText = 'KVS lookup failed with storage-test-credential';
    f.context.ApplicationStorage.get = async () => { throw new Error(errorText); };
    assert.deepEqual({ ...await evaluate(f, "loadConfigEntry('GEMINI_API_KEY')") }, { value: undefined });
    assert.ok(!f.logs.join('\n').includes(errorText));
    assert.match(source, /let telegramBotToken = '';/);
    assert.doesNotMatch(source, /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/);
});

test('community Telegram settings override generic settings and use the authenticated relay', async () => {
    const relayUrl = 'https://obzvonai.ru/integrations/vsemebel-telegram/send-message';
    const secrets = {
        VSEMEBEL_TELEGRAM_BOT_TOKEN: 'scoped-test-token',
        VSEMEBEL_TELEGRAM_CHAT_ID_ADMIN: 'scoped-admin',
        VSEMEBEL_TELEGRAM_RELAY_URL: relayUrl,
        VSEMEBEL_TELEGRAM_RELAY_SECRET: 'relay-test-secret'
    };
    const f = fixture(DEFAULT_NOW, {}, name => secrets[name]);
    await f.setup();
    await submitSummary(f);
    await f.call.emit('call.Disconnected', { duration: 12 });
    assert.equal(f.requests.length, 3);
    const keys = new Set();
    for (const request of f.requests) {
        assert.equal(request.url, relayUrl);
        assert.equal(request.options.headers.Authorization, 'Bearer relay-test-secret');
        const body = JSON.parse(request.options.postData);
        assert.match(body.message_key, /^vsemebel-/u);
        assert.ok(!keys.has(body.message_key));
        keys.add(body.message_key);
    }
    assert.ok(f.requests.some(request => JSON.parse(request.options.postData).chat_id === 'scoped-admin'));
    assert.ok(!f.logs.join('\n').includes('relay-test-secret'));
    assert.ok(!f.logs.join('\n').includes('scoped-test-token'));
});

test('incomplete or non-HTTPS relay settings do not send credentials to a fallback URL', async () => {
    for (const settings of [
        { VSEMEBEL_TELEGRAM_RELAY_URL: 'http://example.invalid/send-message', VSEMEBEL_TELEGRAM_RELAY_SECRET: 'relay-test-secret' },
        { VSEMEBEL_TELEGRAM_RELAY_URL: 'https://example.invalid/send-message' }
    ]) {
        const f = fixture(DEFAULT_NOW, {}, name => settings[name]);
        await f.setup();
        await submitSummary(f);
        await f.call.emit('call.Disconnected');
        assert.equal(f.requests.length, 0);
        assert.equal(f.terminated(), 1);
    }
});

test('configured relay delivery does not depend on the generic outgoing bot token', async () => {
    const settings = {
        VSEMEBEL_TELEGRAM_RELAY_URL: 'https://obzvonai.ru/integrations/vsemebel-telegram/send-message',
        VSEMEBEL_TELEGRAM_RELAY_SECRET: 'relay-test-secret'
    };
    const f = fixture(DEFAULT_NOW, { TELEGRAM_BOT_TOKEN: '' }, name => settings[name]);
    const config = await f.setup();
    assert.match(textParts(config.connectConfig.systemInstruction), /УВЕДОМЛЕНИЯ ОРГАНИЗАТОРАМ:\s*настроены/u);
    await submitSummary(f);
    await f.call.emit('call.Disconnected');
    assert.equal(f.requests.length, 3);
    assert.ok(f.requests.every(request => request.url === settings.VSEMEBEL_TELEGRAM_RELAY_URL));
});

test('preserves Kore, audio transcription and high-sensitivity 20/100 VAD', async () => {
    const config = (await fixture().setup()).connectConfig;

    assert.deepEqual(Array.from(config.responseModalities), ['AUDIO']);
    assert.equal(config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
    const input = config.realtimeInputConfig;
    assert.equal(input.automaticActivityDetection.prefixPaddingMs, 20);
    assert.equal(input.automaticActivityDetection.silenceDurationMs, 100);
    assert.equal(input.automaticActivityDetection.startOfSpeechSensitivity, 'START_SENSITIVITY_HIGH');
    assert.equal(input.automaticActivityDetection.endOfSpeechSensitivity, 'END_SENSITIVITY_HIGH');
    assert.equal(input.activityHandling, 'START_OF_ACTIVITY_INTERRUPTS');
    assert.ok(config.inputAudioTranscription);
    assert.ok(config.outputAudioTranscription);
});

test('SetupComplete sends the community greeting, not the furniture survey or caller phone', async () => {
    const f = fixture();
    await f.setup();
    const greeting = evaluate(f, 'COMMUNITY_GREETING');
    const prompt = textParts(f.prompts[0]);

    assert.equal(typeof greeting, 'string');
    assert.match(greeting, /Екатерина/iu);
    assert.match(greeting, /голосов[\p{L}\s-]*ИИ[\s-]*помощник/iu);
    assert.match(greeting, /сообществ[\p{L}\s«"-]*Все\s+Мебель/iu);
    assert.ok(prompt.includes(greeting), 'The actual setup prompt must contain COMMUNITY_GREETING');
    assert.equal(f.prompts.length, 1, 'Initial setup must send one opening turn');
    assert.equal(f.prompts[0].turnComplete, true);
    assert.equal(f.prompts[0].turns[0].role, 'user');
    assert.doesNotMatch(prompt, /just\s*wood|джаст\s*вуд|(?<!\p{L})опроса(?!\p{L})|приятно\s+ли|какая\s+мебель\s+нужна/iu);
    assert.ok(!prompt.includes(CALLER_PHONE));
    assert.ok(!prompt.includes(CALLER_PHONE.replace(/\D/g, '')));
    assert.ok(!greeting.includes(CALLER_PHONE));
    assert.ok((greeting.match(/\?/g) || []).length <= 1, 'The greeting must not bundle questions');
});

test('runtime system instruction combines the static policy with the current Moscow date context', async () => {
    for (const instant of ['2026-10-28T12:00:00Z', '2026-10-29T12:00:00Z', '2026-10-30T12:00:00Z']) {
        const f = fixture(Date.parse(instant));
        const config = await f.setup();
        const instruction = textParts(config.connectConfig.systemInstruction);
        const policy = evaluate(f, 'COMMUNITY_SYSTEM_INSTRUCTION');
        const dateContext = evaluate(f, 'buildCommunityDateContext(Date.now())');

        assert.equal(typeof policy, 'string');
        assert.equal(typeof dateContext, 'string');
        assert.ok(policy.trim());
        assert.ok(dateContext.trim());
        assert.ok(instruction.includes(policy), `Static policy missing at ${instant}`);
        assert.ok(instruction.includes(dateContext), `Dynamic date context missing at ${instant}`);
        assert.doesNotMatch(instruction, /just\s*wood|джаст\s*вуд/iu);
    }
});

// Moscow midnight falls on the previous UTC day; check both sides of the boundary.
for (const [name, instant, day, timing] of [
    ['before the conference', '2026-10-28T12:00:00Z', 28, /предстоит|состоится|ещ[её]\s+не\s+(?:прош|состоя)|будущ/iu],
    ['on the conference day', '2026-10-29T12:00:00Z', 29, /сегодня|день\s+конференции/iu],
    ['after the conference', '2026-10-30T12:00:00Z', 30, /прошл|заверш|уже\s+состоя/iu],
    ['one millisecond before Moscow midnight', '2026-10-28T20:59:59.999Z', 28, /предстоит|состоится|ещ[её]\s+не\s+(?:прош|состоя)|будущ/iu],
    ['at Moscow midnight on October 29', '2026-10-28T21:00:00.000Z', 29, /сегодня|день\s+конференции/iu],
    ['at Moscow midnight on October 30', '2026-10-29T21:00:00.000Z', 30, /прошл|заверш|уже\s+состоя/iu]
]) {
    test(`date context: ${name}`, () => {
        const f = fixture();
        const context = evaluate(f, `buildCommunityDateContext(${Date.parse(instant)})`);
        assert.equal(typeof context, 'string');
        assert.match(context, new RegExp(`2026-10-${day}|${day}[./]10[./]2026|${day}\\s+октября\\s+2026`, 'iu'));
        assert.match(context, /Москв|МСК|UTC\+0?3|Europe\/Moscow/iu);
        assert.match(context, timing);
        assert.match(context, /конференц/iu);
    });
}

test('voice policy permits brief replies and one question without invented actions', () => {
    const policy = evaluate(fixture(), 'COMMUNITY_SYSTEM_INSTRUCTION');
    assert.match(policy, /1\s*[–-]\s*2\s+коротких\s+предложен/iu);
    assert.match(policy, /[Вв]опросы\s+задавай\s+по\s+одному/iu);
    assert.match(policy, /[Нн]е\s+обещай\s+отправить\s+ссылк/iu);
    assert.match(policy, /[Нн]е\s+говори[^.]{0,100}зарегистрировала/iu);
    assert.match(policy, /[Нн]е\s+гарантируй\s+обратный\s+звонок/iu);
});

test('asks name then company after helping, with separate optional questions and no repetition', async () => {
    const f = fixture();
    const config = await f.setup();
    const policy = textParts(config.connectConfig.systemInstruction);
    const greeting = evaluate(f, 'COMMUNITY_GREETING');

    assert.match(policy, /В содержательном разговоре[^.]*поняла запрос[^.]*дала первый полезный ответ/iu);
    assert.match(policy, /Подскажите, пожалуйста, как Вас зовут\?/u);
    assert.match(policy, /Дождись ответа или отказа[^.]*затем отдельно[^.]*компани/iu);
    assert.match(policy, /Какую компанию Вы представляете\?/u);
    assert.match(policy, /Не объединяй вопросы об имени и компании в одной реплике/u);
    assert.match(policy, /Если имя или компания уже названы, повторно их не спрашивай/u);
    assert.match(policy, /отказ[^.]*частное лицо[^.]*нет компании[^.]*принимай без уточнений/iu);
    assert.match(policy, /Каждый из этих вопросов задай не более одного раза/u);
    assert.match(policy, /Не задерживай консультацию ради этих данных/u);
    assert.match(policy, /Не спрашивай имя и номер в приветствии/u);
    assert.doesNotMatch(greeting, /как Вас зовут|имя|компани|телефон|номер/iu);
    assert.match(policy, /client_company[^\n]*если звонящий назвал/iu);
    assert.match(policy, /Не выдумывай имя или компанию/u);
    assert.match(policy, /client_company[^.]*пустую строку/iu);
    assert.match(policy, /По упомянутым брендам[^.]*не делай выводов о компании звонящего/iu);
});

test('summary tool keeps company optional and preserves the existing required fields', async () => {
    const config = await fixture().setup();
    const fn = config.connectConfig.tools.flatMap(tool => tool.functionDeclarations || [])
        .find(tool => tool.name === 'save_call_summary');

    assert.ok(fn);
    assert.equal(fn.parameters.properties.client_company.type, 'string');
    assert.match(fn.parameters.properties.client_company.description, /компани/iu);
    assert.match(fn.parameters.properties.client_company.description, /со слов/iu);
    assert.deepEqual(Array.from(fn.parameters.required), ['summary', 'call_goal', 'outcome']);
});

test('uses a short opening and strictly Russian speech and summary instructions', async () => {
    const f = fixture();
    const config = await f.setup();
    const greeting = evaluate(f, 'COMMUNITY_GREETING');
    const policy = textParts(config.connectConfig.systemInstruction);

    assert.ok(greeting.trim().split(/\s+/u).length <= 20, 'Keep the opening brief');
    assert.equal((greeting.match(/\?/gu) || []).length, 1);
    assert.match(greeting, /Чем могу помочь\?/u);
    assert.match(policy, /Говори только на русском языке/u);
    assert.match(policy, /текстовых полей итогов заполняй только на русском/u);
    assert.doesNotMatch(policy, /можешь ответить на его языке/u);
    assert.match(policy, /быстрее обычного разговорного темпа/u);
    assert.match(policy, /чёткую дикцию/u);
    assert.equal(config.connectConfig.speechConfig.speakingRate, undefined);
    assert.equal(config.connectConfig.speechConfig.speed, undefined);
    assert.equal(config.connectConfig.speechConfig.languageCode, undefined);
});

test('does not turn a foreign-looking ASR fragment into an input language gate', async () => {
    const config = await fixture().setup();
    const policy = textParts(config.connectConfig.systemInstruction);

    assert.match(policy, /Говори только на русском языке/u);
    assert.match(policy, /Ограничение языка относится только к твоим ответам/u);
    assert.match(policy, /учитывай смысл и историю разговора/iu);
    assert.match(policy, /не требуй от собеседника менять язык/iu);
    assert.match(policy, /Повторите громче, пожалуйста/u);
    assert.doesNotMatch(policy, /(?:задайте|повторите)[^.\n]{0,50}вопрос по-русски/iu);
});

test('knowledge retains free participation and matching without making every tool free', () => {
    const policy = evaluate(fixture(), 'COMMUNITY_SYSTEM_INSTRUCTION');
    assert.match(policy, /[Уу]частие\s+бесплатное/iu);
    assert.match(policy, /[Бб]есплатно\s+для\s+заказчика/iu);
    assert.match(policy, /[Бб]есплатная\s+карточка\s+в\s+каталоге/iu);
    assert.match(policy, /[Кк]онсультации[^.]{0,120}бесплатные\s+для\s+зарегистрированных\s+участников/iu);
    assert.match(policy, /не\s+означает\s+бесплатные\s+CRM/iu);
});

const summaryArgs = {
    client_name: 'Иван',
    client_company: 'Мебельная мастерская',
    call_goal: 'Участие в сообществе',
    manager_offer: 'Объяснила регистрацию на портале',
    outcome: 'Консультация завершена',
    next_step: 'Клиент зарегистрируется самостоятельно',
    summary: 'Клиент спросил об участии. Условия участия объяснены.'
};

async function submitSummary(f, args = summaryArgs) {
    await f.client.emit('gemini.ToolCall', {
        data: { payload: { functionCalls: [{
            id: 'summary-test-1', name: 'save_call_summary',
            args: typeof args === 'string' ? args : { ...args }
        }] } }
    });
    assert.equal(f.toolResponses.length, 1, 'The summary function must be acknowledged');
    const response = f.toolResponses[0].functionResponses[0];
    assert.equal(response.id, 'summary-test-1');
    assert.equal(response.name, 'save_call_summary');
    assert.equal(response.response.result, 'ok');
}

test('acknowledges summary and sends mocked admin/summary reports on disconnect', async () => {
    const f = fixture();
    const config = await f.setup();
    const functions = config.connectConfig.tools.flatMap(tool => tool.functionDeclarations || []);
    assert.ok(functions.some(fn => fn.name === 'save_call_summary'));
    assert.equal(functions.find(fn => fn.name === 'save_call_summary').behavior, 'BLOCKING');
    assert.equal(typeof config.onWebSocketClose, 'function');
    assert.match(textParts(config.connectConfig.systemInstruction), /УВЕДОМЛЕНИЯ ОРГАНИЗАТОРАМ:\s*настроены/iu);
    await submitSummary(f);
    assert.equal(f.requests.length, 0, 'Saving a summary must not send a report before finalization');
    await f.call.emit('call.Disconnected', { duration: 42, cost: 1.25 });

    assert.equal(f.requests.length, 3, 'One admin report and two summary reports are expected');
    const reports = f.requests.map(request => {
        assert.equal(request.url, 'https://api.telegram.org/bottest-telegram-token/sendMessage');
        assert.equal(request.options.method, 'POST');
        const body = JSON.parse(request.options.postData);
        assert.equal(body.parse_mode, 'HTML');
        assert.ok(body.text.includes(CALLER_PHONE), 'Reports must retain the private caller phone');
        assert.doesNotMatch(body.text, /just\s*wood/iu);
        return body;
    });
    const summaries = reports.filter(report => report.text.includes(summaryArgs.summary));
    assert.deepEqual(summaries.map(report => report.chat_id).sort(), ['test-admin-id', 'test-user-id']);
    for (const report of summaries) {
        for (const value of Object.values(summaryArgs)) assert.ok(report.text.includes(value));
    }
    const admin = reports.find(report => !report.text.includes(summaryArgs.summary));
    assert.equal(admin.chat_id, 'test-admin-id');
    for (const report of reports) {
        assert.ok(report.text.includes(`<b>Имя:</b> ${summaryArgs.client_name}`));
        assert.ok(report.text.includes(`<b>Компания:</b> ${summaryArgs.client_company}`));
    }
    assert.match(admin.text, /42\s*сек/iu);
    assert.match(admin.text, /1\.2500\s*руб/iu);
    assert.equal(f.closed(), 1);
    assert.equal(f.terminated(), 1);
    await f.call.emit('call.Disconnected');
    assert.equal(f.requests.length, 3, 'Duplicate disconnect must not resend reports');
    assert.equal(f.terminated(), 1);
});

test('captures company from object and JSON tool arguments and HTML-escapes both report formats', async () => {
    const company = 'ООО "Мебель & <Стиль>"';
    for (const useJson of [false, true]) {
        const f = fixture();
        await f.setup();
        const args = { ...summaryArgs, client_company: `  ${company}\n ` };
        await submitSummary(f, useJson ? JSON.stringify(args) : args);
        const capturedIndex = f.logs.indexOf('===SUMMARY_FUNCTION_CAPTURED===');
        const captured = JSON.parse(f.logs[capturedIndex + 1]);
        assert.equal(captured.client_company, company);
        assert.equal(captured.client_name, summaryArgs.client_name);

        await f.call.emit('call.Disconnected');
        assert.equal(f.requests.length, 3);
        for (const request of f.requests) {
            const { text, parse_mode } = JSON.parse(request.options.postData);
            assert.equal(parse_mode, 'HTML');
            assert.ok(text.includes('<b>Компания:</b> ООО "Мебель &amp; &lt;Стиль&gt;"'));
            assert.ok(!text.includes(company));
            assert.ok(text.includes(`<b>Имя:</b> ${summaryArgs.client_name}`));
        }
    }
});

test('missing, empty or whitespace company remains optional and reports as unknown', async () => {
    for (const company of [undefined, null, '', ' \t\n ']) {
        const f = fixture();
        await f.setup();
        const args = { ...summaryArgs };
        if (company === undefined) delete args.client_company;
        else args.client_company = company;
        await submitSummary(f, args);
        const capturedIndex = f.logs.indexOf('===SUMMARY_FUNCTION_CAPTURED===');
        assert.equal(JSON.parse(f.logs[capturedIndex + 1]).client_company, '');
        await f.call.emit('call.Disconnected');
        assert.equal(f.requests.length, 3);
        for (const request of f.requests) {
            const { text } = JSON.parse(request.options.postData);
            assert.ok(text.includes('<b>Компания:</b> не указана'));
            assert.ok(!text.includes(summaryArgs.client_company));
        }
        assert.equal(f.terminated(), 1);
    }
});

test('explicit summary request asks for optional company without inventing it', async () => {
    const f = fixture();
    await f.setup();
    await f.call.emit('call.Disconnected');
    const prompt = textParts(f.prompts[1]);
    assert.match(prompt, /- client_company/u);
    assert.match(prompt, /client_name и client_company[^.]*со слов[^.]*пустую строку/iu);
    assert.match(prompt, /Не выдумывай имя или компанию/u);
    assert.equal(f.requests.length, 0, 'Finalization must still wait for the summary tool');

    await f.client.emit('gemini.ToolCall', {
        data: { payload: { functionCalls: [{
            id: 'requested-summary', name: 'save_call_summary', args: { ...summaryArgs }
        }] } }
    });
    assert.equal(f.requests.length, 3);
    for (const request of f.requests) {
        assert.ok(JSON.parse(request.options.postData).text.includes(`<b>Компания:</b> ${summaryArgs.client_company}`));
    }
    assert.equal(f.closed(), 1);
    assert.equal(f.terminated(), 1);
});

test('fallback preserves a structured company even when the summary text is empty', async () => {
    const f = fixture();
    await f.setup();
    await submitSummary(f, { ...summaryArgs, client_company: ' Мебель & <Сервис> ', summary: '' });
    await f.call.emit('call.Disconnected');
    assert.equal(f.requests.length, 0);
    await f.runTimer(evaluate(f, 'SUMMARY_REQUEST_TIMEOUT_MS'));
    assert.equal(f.requests.length, 3);
    for (const request of f.requests) {
        const { text } = JSON.parse(request.options.postData);
        assert.ok(text.includes('<b>Компания:</b> Мебель &amp; &lt;Сервис&gt;'));
        assert.ok(text.includes(`<b>Имя:</b> ${summaryArgs.client_name}`));
    }
    assert.equal(f.closed(), 1);
    assert.equal(f.terminated(), 1);
});

test('fallback leaves company unknown rather than guessing from names or company-like dialogue', async () => {
    const f = fixture();
    await f.setup();
    await f.client.emit('gemini.ServerContent', {
        data: { payload: {
            inputTranscription: { text: 'Компания «Мебельная мастерская» есть в каталоге? Я частное лицо, у меня нет компании.' },
            outputTranscription: { text: 'Откройте каталог участников на сайте Все Мебель.' },
            turnComplete: true
        } }
    });
    await f.call.emit('call.Disconnected');
    await f.runTimer(evaluate(f, 'SUMMARY_REQUEST_TIMEOUT_MS'));
    assert.equal(f.requests.length, 3);
    for (const request of f.requests) {
        const { text } = JSON.parse(request.options.postData);
        assert.ok(text.includes('<b>Компания:</b> не указана'));
        assert.ok(!text.includes('<b>Компания:</b> Мебельная мастерская'));
    }
    assert.equal(f.terminated(), 1);
});

test('missing Telegram token or recipients disables notifications and safely finalizes', async () => {
    for (const storage of [
        { TELEGRAM_BOT_TOKEN: '' },
        { TELEGRAM_CHAT_ID_ADMIN: '', TELEGRAM_CHAT_ID_USER: '', TELEGRAM_CHAT_ID: '' }
    ]) {
        const f = fixture(DEFAULT_NOW, storage);
        const config = await f.setup();
        const instruction = textParts(config.connectConfig.systemInstruction);
        assert.match(instruction, /УВЕДОМЛЕНИЯ ОРГАНИЗАТОРАМ:\s*не\s+настроены/iu);
        assert.match(instruction, /не\s+настроены;[^.]*прямые\s+контакты/iu);
        await submitSummary(f);
        await f.call.emit('call.Disconnected', { duration: 7 });
        assert.equal(f.requests.length, 0, 'Missing Telegram settings must not attempt HTTP');
        assert.equal(f.closed(), 1);
        assert.equal(f.terminated(), 1);
        assert.equal(f.outboundAttempts(), 0);
    }
});
