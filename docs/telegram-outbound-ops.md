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

## Telegram commands

- `/status` - backend, queue, campaign and rule status.
- `/campaigns` - recent campaigns with counts.
- `/template` - file format reminder.
- `/run ID` - activate a paused campaign.
- `/pause ID` - pause a campaign.
- `/calls` - last saved calls.

To upload a base, send a `.csv`, `.tsv`, or `.xlsx` document to the bot. New campaigns are created in `paused` status; start them with `/run ID`.

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

## Recording status

The webhook receives secure Voximplant recording URLs and saves them in SQLite. Local download is attempted into `backend/recordings`.

Current server check: Voximplant returns `HTTP 401` when backend tries to download the secure URL, so `local_recording_path` stays empty and `last_error` contains the download error. This is an access/permission issue for secure recordings, not a queue or webhook issue.
