# Artem Fitisov / Just Wood

Папка проекта для голосового AI-агента Just Wood.

## Основные файлы

- `ArtemFetGem2,5.js` — основной рабочий сценарий Just Wood
- `defvoxwork13.03.js` — ранняя рабочая версия сценария
- `scenarios/outbound_gemini_test.js` — тестовый сценарий исходящего обзвона через Voximplant + Gemini
- `scenarios/outbound_gemini_server_edition.js` — исходящий сценарий с отправкой итогов на backend
- `backend/` — FastAPI + SQLite backend для хранения звонков, записей, отчетов и статистики
- `calc.py` — локальный разбор логов, стоимости и токенов

## Дополнительные материалы

- `gemini_live_2_5_vs_3_1_research.md` — сравнение моделей Gemini Live
- `Описание_проекта_и_стоимость.txt` — краткое описание проекта и затрат
- текстовые файлы с тестами и заметками по голосовым моделям

## Что сейчас в проекте

- Voximplant + Gemini Live API
- summary через function calling
- Telegram-отчеты по завершению звонка
- расчет стоимости разговора

## Следующий шаг

Проверить исходящий server-edition сценарий end-to-end: звонок, финальный webhook, запись строки в SQLite, скачивание записи и Telegram-отчет.

## Исходящий обзвон

Тестовый исходящий сценарий и инструкция лежат в `docs/outbound-test.md`.
Общий план проекта с backend, Docker, базой и Telegram-управлением: `docs/project-roadmap.md`.
Текущая логика prompt для обзвона по AI-внедрению: `docs/ai-implementation-outbound-prompt.md`.
