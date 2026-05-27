# Artem Fitisov / Just Wood Backend

FastAPI backend для исходящего AI-обзвона через Voximplant.

## Роль backend

- принимает финальные события звонка от Voximplant;
- хранит историю звонков в SQLite;
- сохраняет summary, диалог, токены, стоимость и ссылку на запись;
- скачивает аудиозапись разговора в `backend/recordings`;
- отправляет Telegram-отчеты;
- при необходимости прокидывает payload в Google Apps Script / Google Sheets;
- чистит старые записи по TTL.

## Основные endpoints

- `POST /webhook/voximplant/call_started`
- `POST /webhook/voximplant/call_finished`
- `POST /webhook/voximplant/recording_ready`
- `POST /webhook/voximplant/finalize`
- `GET /healthz`
- `GET /calls?secret=...&limit=...`
- `GET /calls/{session_id}?secret=...`
- `GET /outbound/campaigns?secret=...`
- `POST /outbound/campaigns/{campaign_id}/run`
- `POST /outbound/campaigns/{campaign_id}/pause`
- `GET /outbound/tasks/{task_id}/scenario-context`

Webhook-роуты защищены заголовком `X-Webhook-Secret`, значение берется из `BACKEND_WEBHOOK_SECRET`.

## Переменные окружения

Создай `backend/.env` по примеру `backend/.env.example`.

Ключевые:

- `BACKEND_WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_CHAT_ID`
- `TELEGRAM_ADMIN_IDS`
- `TELEGRAM_USER_CHAT_IDS`
- `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`
- `VOXIMPLANT_CREDENTIALS_FILE_PATH` для secure-записей Voximplant
- `VOXIMPLANT_RULE_ID` для автоматического `StartScenarios`
- `OUTBOUND_WORKER_ENABLED`, `OUTBOUND_WORKER_INTERVAL_SECONDS`, `OUTBOUND_MAX_CONCURRENT_CALLS`
- `OUTBOUND_DEFAULT_CALL_DELAY_SECONDS` - пауза между контактами в новой кампании
- `POST_CALL_ANALYSIS_ENABLED` - включает фоновую постобработку записи после звонка
- `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_SPEECH_MODEL=universal-2` - точная расшифровка скачанной записи
- `ASSEMBLYAI_MULTICHANNEL=true`, `ASSEMBLYAI_CLIENT_CHANNEL=1`, `ASSEMBLYAI_AI_CHANNEL=2` - разделение стереозаписи на клиента и AI
- `GEMINI_API_KEY`, `GEMINI_SUMMARY_MODEL` - сборка точного summary и полей для таблицы по расшифровке

## Telegram обзвон

Подробно: `docs/telegram-outbound-ops.md`.

Бот доступен только ID из `TELEGRAM_ADMIN_CHAT_ID`/`TELEGRAM_ADMIN_IDS`. Админ получает шаблон через `/template` или `/upload`, отправляет XLSX/CSV/TSV, backend создает кампанию в статусе `paused`. Запуск: `/run ID`, остановка: `/pause ID` или `/stop ID`, настройка паузы между контактами: `/delay ID 30s`. По исходящим задачам bot редактирует одно статусное сообщение и отправляет запись звонка ответом на него.

## Docker

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8000/healthz
```

## Проверка финального webhook

```bash
curl -X POST http://127.0.0.1:8000/webhook/voximplant/finalize \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <SECRET>" \
  -d '{"session_id":"manual-test-1","project":"artem_fitisov","script_name":"manual"}'
```

## Что хранится в SQLite

- номер клиента и Caller ID;
- имя клиента;
- запрос, предложение, итог, следующий шаг;
- summary;
- текст диалога и structured dialogue items;
- токены Gemini;
- стоимость телефонии, WebSocket, AI и общий расчет;
- recording URL и локальный путь к скачанной записи;
- статусы доставки Telegram и Google Sheets.
