# Исходящий тестовый обзвон Voximplant + Gemini

Файл сценария: `scenarios/outbound_gemini_test.js`.

## Что делает сценарий

- запускается от `AppEvents.Started`, то есть без входящего звонка;
- берет номера из массива `CALL_TARGETS` в начале файла;
- звонит на номера последовательно через `VoxEngine.callPSTN`;
- после ответа подключает Gemini Live к телефонному звонку;
- включает запись разговора и пишет URL записи в логи Voximplant;
- завершает звонок по событию отбоя, ошибке, таймауту дозвона или лимиту длительности;
- после завершения одного номера переходит к следующему.

## Что надо поменять перед запуском

В `scenarios/outbound_gemini_test.js`:

```js
const CALLER_ID = '79990000000';
const CALL_TARGETS = [
    '79990000001',
    // '79990000002'
];
```

`CALLER_ID` должен быть подтвержденным Caller ID в Voximplant. Номера лучше указывать в формате `79...` или `+79...`; сценарий сам убирает лишние пробелы, скобки и дефисы.

В Voximplant ApplicationStorage должен быть ключ:

```text
GEMINI_API_KEY
```

## Как тестировать

1. Создать новый сценарий в Voximplant.
2. Вставить код из `scenarios/outbound_gemini_test.js`.
3. Указать свой `CALLER_ID` и тестовый номер в `CALL_TARGETS`.
4. Создать отдельное routing rule, например `outbound_manual_test`, с любым pattern, например `.*`.
5. Прикрепить к этому rule исходящий сценарий.
6. Скопировать `rule_id` созданного правила.
7. Запустить сценарий через Management API `StartScenarios`.
8. Смотреть в логах маркеры:

```text
===OUTBOUND_DIAL_START:<phone>===
===CALL_CONNECTED:<phone>===
===GEMINI_SETUP_COMPLETE===
===START_PROMPT_SENT===
===CALL_RECORD_STARTED===
===CALL_DISCONNECTED:<phone>===
```

Пример ручного запуска через браузер или Postman:

```text
https://api.voximplant.com/platform_api/StartScenarios/?account_id=YOUR_ACCOUNT_ID&api_key=YOUR_API_KEY&rule_id=YOUR_RULE_ID
```

В этом тестовом варианте `script_custom_data` не нужен, потому что номер для звонка уже задан в `CALL_TARGETS`.
Если запуск успешный, API вернет JSON с `result: 1`, а сценарий начнет выполняться и позвонит на первый номер из массива.

## Ограничения тестового сценария

Это именно тестовая версия. В ней нет базы данных, Telegram-управления, очереди задач, повторных попыток, отчетов на сервер и нормальной CRM-логики. Эти части лучше вынести из VoxEngine на свой backend, а в Voximplant оставить только короткий сценарий звонка.

Для следующего этапа логика может быть такой:

```text
Telegram -> backend API -> база задач -> Voximplant StartScenarios -> исходящий звонок
Voximplant -> backend webhook -> запись, транскрипт, итог, стоимость, статус
backend -> Telegram -> отчет оператору/админу
```

Так VoxEngine не будет превращаться в тяжелый сервер, а вся управляемая бизнес-логика останется в Docker-проекте.
