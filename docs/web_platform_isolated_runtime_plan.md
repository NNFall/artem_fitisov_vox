# План отдельного runtime-контура для веб-доработки

## Решение

Для ветки `codex/platform-web-transcription` делаем отдельную серверную папку и отдельный runtime-контур на том же сервере.

Рабочий продакшен-контур остается без изменений:

- серверная папка: `/root/artem_fitisov`
- backend: порт `8001`
- текущий Telegram-бот
- текущие Voximplant-сценарии и правила
- текущая SQLite-база, записи, импорты и Google Sheets-интеграция

Контур веб-доработки:

- серверная папка: `/root/artem_fitisov_web`
- GitHub-ветка: `codex/platform-web-transcription`
- отдельные Docker container names
- отдельный backend-порт, рекомендовано `8002`
- отдельный frontend-порт, рекомендовано `3002` или `8082`
- отдельный Telegram-бот для тестов
- отдельная SQLite-база, скопированная снимком из текущей рабочей базы на момент создания контура

## Что копируем из рабочего контура

Копируем как стартовый снимок:

- код проекта;
- `backend/voximplant.db`;
- `backend/recordings`;
- `backend/imports`;
- `backend/keys`;
- текущие `.env`-значения, которые безопасно использовать в отдельном контуре;
- сценарии Voximplant как исходные файлы.

После копирования данные расходятся. Изменения в `/root/artem_fitisov_web` не должны писать в рабочую базу `/root/artem_fitisov`.

## Что нельзя оставлять одинаковым

Нельзя запускать web-контур с теми же runtime-идентификаторами, что и рабочий контур.

Обязательно развести:

- `TELEGRAM_BOT_TOKEN`: нужен новый бот через BotFather;
- Docker `container_name`;
- Docker compose project name;
- backend port;
- frontend port;
- `DATABASE_URL`, если будет вынесен из SQLite-файла по умолчанию;
- Voximplant rule id для web-контура, если web-контур будет сам запускать исходящие звонки;
- backend URL в web-версии Vox-сценариев.

Можно временно оставить одинаковыми:

- Voximplant service account key;
- Gemini API key;
- AssemblyAI API key, когда появится;
- Google Sheets webhook, если сознательно тестируем запись в ту же таблицу.

Для Google Sheets лучше позже сделать отдельный тестовый webhook/таблицу, чтобы web-контур не засорял рабочий отчет.

## Voximplant

Рабочие сценарии и правила в Voximplant не трогаем.

Для web-контура позже создаем копии сценариев:

- `outbound_gemini_web_edition.js`
- `inbound_gemini_web_edition.js`

На старте код может быть идентичен текущим сценариям, но web-версии должны ходить в backend web-контура:

- `http://186.246.18.100:8002`

Важное ограничение: если сценарий читает `BACKEND_URL` из общего `ApplicationStorage`, web-версия не должна случайно взять рабочий `8001`. Для web-сценариев нужно либо использовать отдельный ключ вроде `BACKEND_URL_WEB`, либо явно передавать backend URL из rule/customData, либо зафиксировать web fallback и не читать рабочий ключ.

Для входящих звонков нужен отдельный номер или временное переключение правила. Один и тот же купленный номер не должен одновременно обслуживать два разных входящих сценария.

## Telegram

Рабочий Telegram-бот остается в `/root/artem_fitisov`.

Для web-контура:

- создаем нового Telegram-бота;
- прописываем новый `TELEGRAM_BOT_TOKEN` в `/root/artem_fitisov_web/backend/.env`;
- admin ids можно оставить теми же;
- если новый токен еще не создан, Telegram polling в web-контуре должен быть выключен или токен пустой.

Нельзя запускать два процесса polling с одним и тем же Telegram token.

## Docker

Рабочий compose остается без изменений.

Для web-контура нужен отдельный compose, например:

- backend container: `artem-fitisov-web-backend`;
- frontend container: `artem-fitisov-web-frontend`;
- backend port: `8002:8000`;
- frontend port: `3002:80` или `8082:80`.

Критерий: `docker compose ps` должен показывать рабочий и web-контур как разные контейнеры, без конфликтов портов и имен.

## База данных

На момент создания web-контура копируем текущую SQLite-базу как снимок.

Дальше:

- рабочая база живет в `/root/artem_fitisov/backend/voximplant.db`;
- web-база живет в `/root/artem_fitisov_web/backend/voximplant.db`;
- миграции/новые поля сначала проверяются на web-базе;
- перед переносом в рабочий контур нужен backup рабочей SQLite-базы.

Git не откатывает базу данных, поэтому любые изменения схемы требуют отдельного backup.

## Веб-панель MVP

Формат продукта: self-hosted single-tenant.

Стек:

- frontend: React + TypeScript + Vite + Tailwind + shadcn/ui;
- backend: текущий FastAPI как API;
- auth: login/password из `.env`, HTTP-only cookie session.

MVP:

- login/logout;
- dashboard;
- список кампаний;
- загрузка XLSX/CSV/TSV одним шагом;
- страница кампании;
- таблица контактов с inline-редактированием ключевых полей;
- запуск/пауза/rerun кампании;
- настройка задержки между звонками;
- список звонков;
- карточка звонка с записью, summary, диалогом и техническими статусами.

AssemblyAI и post-call summary подключаются вторым этапом после базовой web-панели.

## Критерии готовности отдельного web-контура

Контур считается готовым к разработке, когда:

1. На сервере есть `/root/artem_fitisov_web`.
2. Внутри лежит код из ветки `codex/platform-web-transcription`.
3. Скопированы стартовые данные: SQLite, recordings, imports, keys.
4. `.env` web-контура не содержит рабочий Telegram token.
5. Docker compose web-контура использует отдельные container names и порты.
6. Backend web-контура отвечает на `/healthz` на порту `8002`.
7. Рабочий backend на `8001` продолжает отвечать на `/healthz`.
8. Рабочий Telegram-бот продолжает работать.
9. Web-контур не запускает звонки через рабочий Vox rule без явного решения.
10. В README или deploy log указано, чем web-контур отличается от рабочего.

## Критерии готовности первой web-итерации

Первая web-итерация считается готовой, когда:

1. Можно открыть web frontend.
2. Можно войти по login/password из `.env`.
3. Dashboard показывает реальные счетчики из web-базы.
4. Можно загрузить XLSX и получить новую paused-кампанию.
5. На странице кампании видны контакты и статусы задач.
6. Ключевые поля контакта можно отредактировать.
7. Кампанию можно запустить, поставить на паузу и подготовить к rerun.
8. В списке звонков видны реальные звонки из web-базы.
9. Карточка звонка показывает запись, summary и dialogue text, если они есть.
10. `npm run build` для frontend и `python -m py_compile backend/main.py` проходят без ошибок.

## Откат

Если web-контур ломается:

- рабочий контур не трогаем;
- останавливаем только web-контейнеры;
- удаление `/root/artem_fitisov_web` не влияет на `/root/artem_fitisov`;
- GitHub `main` не меняется, пока изменения из ветки не будут явно влиты.

Если изменения нужно перенести в рабочий контур:

1. Проверить web-контур.
2. Сделать backup `/root/artem_fitisov/backend/voximplant.db`.
3. Смержить ветку в `main`.
4. Выкатить `main` в `/root/artem_fitisov`.
5. Перезапустить рабочий backend.
6. Отдельно обновить рабочие Vox-сценарии, если они менялись.

