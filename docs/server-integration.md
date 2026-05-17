# Связка исходящего сценария с backend

## Что добавлено

- `backend/` — FastAPI + SQLite backend на базе архитектуры Crystal Stone.
- `scenarios/outbound_gemini_server_edition.js` — исходящий сценарий, который звонит по `CALL_TARGETS`, ведет разговор через Gemini и отправляет финальный payload на backend.

## Что хранит backend

- `session_id`;
- проект и имя сценария;
- Caller ID и номер клиента;
- имя клиента;
- запрос клиента;
- что предложил AI-менеджер;
- итог разговора;
- следующий шаг;
- summary;
- текст диалога;
- structured dialogue items;
- токены Gemini;
- стоимость телефонии, WebSocket, AI и общая стоимость;
- статус записи, URL записи, локальный путь к скачанному файлу;
- статусы Telegram и Google Sheets доставки.

## Что указать в Voximplant ApplicationStorage

```text
GEMINI_API_KEY
BACKEND_URL
BACKEND_WEBHOOK_SECRET
```

`BACKEND_URL` должен быть доступен из Voximplant, например:

```text
http://186.246.18.100:8001
```

## Что указать в backend/.env

Создай файл `backend/.env` по `backend/.env.example`.

Минимум:

```text
BACKEND_WEBHOOK_SECRET=тот_же_секрет_что_в_voximplant
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ADMIN_CHAT_ID=...
```

## Проверка

```bash
docker compose up -d --build
curl http://127.0.0.1:8000/healthz
```

После тестового звонка:

```bash
curl "http://127.0.0.1:8000/calls?secret=<BACKEND_WEBHOOK_SECRET>&limit=10"
```
