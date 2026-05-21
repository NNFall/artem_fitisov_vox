# Telegram outbound operations

Backend now supports a basic admin-only Telegram flow for loading and running outbound call campaigns.

## Environment

Required for the bot:

- `TELEGRAM_BOT_TOKEN` - token from BotFather.
- `TELEGRAM_ADMIN_CHAT_ID` - one admin chat/user ID.
- `TELEGRAM_ADMIN_IDS` - optional comma-separated extra admin IDs.

Required for automatic Voximplant launch:

- `VOXIMPLANT_CREDENTIALS_FILE_PATH` - service account JSON inside the container.
- `VOXIMPLANT_RULE_ID` - routing rule to start, currently `8896222`.
- `PUBLIC_BACKEND_URL` - public backend URL, currently `http://186.246.18.100:8001`.
- `OUTBOUND_WORKER_ENABLED=true`.

Queue tuning:

- `OUTBOUND_WORKER_INTERVAL_SECONDS=15` - how often the worker checks the queue.
- `OUTBOUND_MAX_CONCURRENT_CALLS=1` - simultaneous calls limit.
- `OUTBOUND_RETRY_DELAY_MINUTES=30` - retry delay setting for failed attempts.
- `OUTBOUND_DEFAULT_CALL_DELAY_SECONDS=60` - default pause between contacts in a new campaign.
- Voximplant outbound scenario no-answer timeout is currently `45` seconds (`CALL_TIMEOUT_MS` in `scenarios/outbound_gemini_server_edition.js`).

## Telegram commands

- `/status` - backend, queue, campaign and rule status.
- `/campaigns` - recent campaigns with counts.
- `/template` or `/upload` - send the empty Amix XLSX template and import instructions.
- `/run ID` - activate a paused campaign.
- `/rerun ID` - reset all tasks in a campaign back to pending and leave the campaign paused for a deliberate repeat run.
- `/pause ID` or `/stop ID` - pause a campaign.
- `/delay ID 30s` - set pause between contacts. Examples: `30s`, `45 сек`, `2m`, `2 мин`.
- `/calls` - last saved calls.

To upload a base, send a `.csv`, `.tsv`, or `.xlsx` document to the bot. New campaigns are created in `paused` status; start them with `/run ID`.
For each outbound task the bot sends one status message, then edits that same message during the call lifecycle. After finalization it replies to that message with the downloaded audio recording when the file is available locally.

## Import columns

Required:

- `phone` - phone number. Russian `8...` numbers are normalized to `7...`.

Optional:

- `name` - client name.
- `company` - company or niche.
- `city` - city.
- `source` - source/event name.
- `task` - what the client was interested in.
- `context` - per-client prompt context.
- `campaign_context` - shared prompt context for the whole campaign. First non-empty value is used.
- `preferred_time` - human-readable convenient time note for the prompt.
- `timezone` - client timezone note.
- `call_after` - earliest call time. Supported examples: `2026-05-17 15:30`, `17.05.2026 15:30`, `2026-05-17`, `17.05.2026`.
- `max_attempts` - attempts count for this row.

## Amix forum format

The customer workbook format is supported directly:

- `Имя` + `Фамилия` -> client name.
- `Контактныйтелефон` -> phone.
- `Компания` -> company.
- `Пришёл` -> attendance category.

For `Пришёл`, value `ДА` is treated as `attended`; an empty cell is treated as `not_attended`. The scenario uses this to choose the opening line:

- `attended`: "Вы были на мебельном форуме Amix..."
- `not_attended`: "Вы регистрировались на мебельный форум Amix..."

Manager/bot columns are also imported into lead context when filled: `Вид деятельности`, `Руководитель компании, Да/Нет`, `Средний чек`, `Трафик Сарафан/Входящий`, `Комментарий`, and bot result columns.

Example CSV:

```csv
phone;name;company;source;task;context;preferred_time;campaign_context;call_after;max_attempts
79990000000;Иван;Ромашка;AI event;AI для входящих звонков;Есть заявки с сайта;после 16:00;Лиды после мероприятия;2026-05-17 16:00;1
```

## Runtime flow

1. Admin uploads a file in Telegram.
2. Backend saves the file under `backend/imports`, creates `campaigns`, `outbound_contacts`, and `outbound_tasks`.
3. `/run ID` switches the campaign to `active`.
4. Worker scans active campaigns and pending tasks.
5. Backend starts Voximplant `StartScenarios` with `custom_data={"task_id": ...}`.
6. Voximplant scenario fetches `/outbound/tasks/{task_id}/scenario-context`, dials the contact phone, and injects lead context into the Gemini prompt.
7. Scenario posts call start, recording status and final call payload back to backend.
8. Backend stores transcript, summary, costs, statuses and recording metadata in SQLite.
9. Backend downloads the recording into `backend/recordings` and sends it to Telegram as an audio reply to the task status message.
10. If `GOOGLE_APPS_SCRIPT_WEBHOOK_URL` is set, backend posts the final payload to Google Apps Script for table updates.

If the contact does not answer within 45 seconds, the scenario hangs up, finalizes the task as `call_timeout`, and skips Gemini summary generation because there was no conversation.

## Incoming callback draft

`scenarios/inbound_gemini_callback_server_edition.js` is a prepared but not bound Voximplant scenario for incoming callbacks. It is intended for the later separate incoming rule.

The draft scenario:

- accepts an incoming call;
- reads the caller phone from `call.callerid()` or `call.number()`;
- requests `GET /inbound/caller-context?phone=...` from backend;
- injects the latest campaign/contact/task/call context into Gemini;
- continues the Amix questionnaire if the caller is known;
- stores the incoming call through the same `/webhook/voximplant/finalize` flow.

The backend endpoint returns:

- `lead_context` - contact/campaign context;
- `last_task` - latest outbound task for the phone;
- `last_call` - latest saved call for the phone;
- `recent_tasks` and `recent_calls`;
- `context_text` - ready-to-inject Russian context for the prompt.

## Google Sheets update

Use `integrations/google_apps_script_amix_webhook.js` as the Apps Script web app for the Amix table. It finds a row by column E (`Контактныйтелефон`) and writes the call result into columns H-P:

- H: reached yes/no.
- I: activity type.
- J: decision maker yes/no/unknown.
- K: average check.
- L: traffic source.
- M: outcome, next step and collected answers.
- N: bot impression.
- O: transcript.
- P: summary.

After deploying the script as a web app, set the web app URL in `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`.

## Recording status

The webhook receives secure Voximplant recording URLs and saves them in SQLite. Local download is attempted into `backend/recordings`.

Secure Voximplant recordings are downloaded with the service account bearer token when the URL contains `voximplant-records-secure`.
