# Server Deploy Log

## 2026-05-17

### Server

- Host: `186.246.18.100`
- Folder: `/root/artem_fitisov`
- Container: `artem-fitisov-backend`
- Public backend URL: `http://186.246.18.100:8001`

Port `8000` was already occupied on the server, so this project is published on host port `8001`.

### Deployed

- `backend/` FastAPI + SQLite
- `Dockerfile`
- `docker-compose.yml`
- `scenarios/outbound_gemini_test.js`
- `scenarios/outbound_gemini_server_edition.js`
- `docs/`

### Verified

- `docker compose up -d --build` succeeded.
- Container is running.
- `GET /healthz` works locally and from outside.
- Webhook without `X-Webhook-Secret` returns `403`.
- Webhook with the configured secret accepts finalize payload.
- SQLite test row was removed after verification.

### Current Runtime Notes

- Telegram delivery is disabled until `TELEGRAM_BOT_TOKEN` and chat IDs are set in `/root/artem_fitisov/backend/.env`.
- Google Sheets sync is disabled until `GOOGLE_APPS_SCRIPT_WEBHOOK_URL` is set.
- Secure Voximplant recording download requires `VOXIMPLANT_CREDENTIALS_FILE_PATH`; without it, only directly downloadable recording URLs will be saved.

### Next Stage

Backend-driven outbound calls:

1. Add contacts/campaign tables.
2. Add backend endpoint like `POST /outbound/calls`.
3. Backend stores target phone and client context.
4. Backend starts Voximplant scenario through Management API.
5. Scenario receives phone/context through custom data instead of hardcoded `CALL_TARGETS`.
6. Scenario passes client context into Gemini system/start prompt.
7. Finalize webhook stores result, recording and report.
