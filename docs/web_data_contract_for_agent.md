# Техническая спецификация данных веб-панели обзвона

Документ нужен как входные данные для агента или разработчика, который будет проектировать альтернативную веб-оболочку для текущей системы. Здесь описаны не разделы сайта, а именно данные, которые уже есть в backend, как они связаны, что можно показывать, изменять, добавлять и какие процессы должны быть визуализированы.

В документе намеренно нет паролей, токенов, ключей и других секретов. Доступ к панели считается закрытым через логин и пароль, значения берутся из окружения сервера.

## Общая модель

Система состоит из пяти главных сущностей:

```text
Кампания обзвона
  -> Контакты из загруженной базы
      -> Задачи обзвона по каждому контакту
          -> События телефонии и сценария
          -> Звонок, если Voximplant создал/вернул session_id
              -> Итоги разговора
              -> Диалог/транскрибация
              -> Запись разговора
              -> Стоимость и технические метрики
```

Главная логика:

1. Администратор загружает таблицу `XLSX`, `CSV` или `TSV`.
2. Backend разбирает строки, нормализует телефоны и создает кампанию в статусе `paused`.
3. На каждый контакт создается задача обзвона.
4. Когда кампания переводится в `active`, worker берет ближайшую задачу и запускает правило Voximplant.
5. Voximplant получает контекст контакта, звонит, отправляет статусы и финальные данные на backend.
6. Backend сохраняет звонок, итоги, диалог, запись, события, статусы отправки в Telegram и Google Sheets.
7. Веб-панель должна показывать состояние всей цепочки и давать администратору управлять кампанией и контактами.

## Дерево данных

```text
Campaign
  id
  name
  status
  source_filename
  prompt_context
  default_max_attempts
  call_delay_seconds
  next_call_after
  created_by_chat_id
  created_at
  updated_at
  started_at
  paused_at
  stats

  contacts: Contact[]
    id
    campaign_id
    phone
    name
    company
    city
    source
    task
    context
    preferred_time
    timezone
    attendance_status
    activity_type
    is_decision_maker
    average_check
    traffic_source
    bot_impression
    created_at
    updated_at
    raw_row_json

    task: OutboundTask
      id
      campaign_id
      contact_id
      phone
      status
      priority
      scheduled_at
      started_at
      finished_at
      last_attempt_at
      next_attempt_at
      attempt_count
      max_attempts
      voximplant_session_id
      last_status
      last_status_message
      last_status_at
      result_status
      result_summary
      last_error

  calls: Call[]
    id
    session_id
    outbound_task_id
    campaign_id
    project
    script_name
    model
    caller_phone
    client_phone
    client_name
    started_at
    connected_at
    finished_at
    exported_at
    updated_at
    duration
    summary
    call_goal
    manager_offer
    outcome
    next_step
    dialogue_text
    recording_status
    recording_url
    recording_download_url
    local_recording_path
    recording_error
    cost fields
    integration statuses
    raw/debug JSON fields

  events: OutboundEvent[]
    id
    campaign_id
    task_id
    session_id
    phone
    stage
    status
    message
    payload_json
    created_at
```

## Кампания

Кампания это отдельная загруженная база обзвона. Она управляет очередью звонков и общими настройками.

### Поля кампании

| Поле | Тип | Назначение для визуализации |
| --- | --- | --- |
| `id` | number | Внутренний ID кампании. Используется в действиях запуска, паузы, повторного запуска. |
| `name` | string | Название кампании. Сейчас формируется из имени файла и времени загрузки. |
| `status` | string | Текущее состояние: `paused`, `active` и возможные будущие статусы. |
| `source_filename` | string/null | Имя загруженного файла. Можно показывать как источник базы. |
| `prompt_context` | text/null | Общий контекст кампании, если он был передан через таблицу. Может идти в AI-промпт. |
| `default_max_attempts` | number/null | Сколько попыток звонка ставить новым задачам по умолчанию. Сейчас обычно `1`. |
| `call_delay_seconds` | number/null | Пауза между стартами звонков по контактам. |
| `next_call_after` | datetime/null | Время, раньше которого worker не начнет следующий звонок этой кампании. |
| `created_by_chat_id` | string/null | Источник создания: Telegram chat id или `web:<username>`. Пользователю можно не показывать. |
| `created_at` | datetime/null | Когда кампания создана. |
| `updated_at` | datetime/null | Когда кампания обновлялась. |
| `started_at` | datetime/null | Когда кампанию запускали. |
| `paused_at` | datetime/null | Когда кампанию ставили на паузу. |
| `stats` | object | Агрегированные статусы задач внутри кампании. |

### Статистика кампании

`stats` это словарь вида:

```json
{
  "total": 4,
  "pending": 2,
  "scheduled": 0,
  "starting": 0,
  "started": 0,
  "in_progress": 1,
  "completed": 1,
  "failed": 0
}
```

Минимально полезные группы для интерфейса:

| Группа | Из каких статусов считать |
| --- | --- |
| Всего | `total` |
| Ожидают звонка | `pending + scheduled` |
| Сейчас в работе | `starting + started + in_progress` |
| Завершены | `completed` |
| Ошибки/не дозвонились | `failed` |

### Действия над кампанией

Кампанию можно:

- загрузить через файл, при этом она создается на паузе;
- запустить;
- поставить на паузу;
- полностью подготовить к повторному запуску;
- изменить паузу между контактами.

Повторный запуск не создает новую кампанию. Он сбрасывает задачи этой кампании:

```text
status -> pending
attempt_count -> 0
session_id -> null
last_status -> null
last_error -> null
result_status/result_summary -> null
started_at/finished_at -> null
```

Сами контакты при этом остаются.

## Контакт

Контакт создается из одной строки загруженной таблицы.

### Поля контакта

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | number | Внутренний ID контакта. |
| `campaign_id` | number | К какой кампании относится контакт. |
| `phone` | string | Нормализованный телефон, например `79650348852`. |
| `name` | string/null | Имя или ФИО. Берется из колонок имени/фамилии. |
| `company` | string/null | Компания клиента. |
| `city` | string/null | Город, если есть в таблице. |
| `source` | string/null | Источник контакта. Для Amix обычно `Форум Amix`. |
| `task` | text/null | Потребность, задача, интерес клиента. |
| `context` | text/null | Дополнительный контекст для AI. Сюда собираются важные поля из таблицы. |
| `preferred_time` | string/null | Удобное время звонка, если задано. |
| `timezone` | string/null | Часовой пояс контакта, если задан. |
| `raw_row_json` | JSON text/null | Исходная строка таблицы и нормализованные поля. Нужна для расширенного просмотра/отладки. |
| `created_at` | datetime/null | Когда контакт создан. |
| `updated_at` | datetime/null | Когда контакт редактировался. |

### Нормализованные поля Amix

Эти поля физически достаются из `raw_row_json.normalized`, а в web payload отдаются рядом с контактом:

| Поле | Откуда берется | Как использовать |
| --- | --- | --- |
| `attendance_status` | Колонка `G: Пришёл` | Влияет на начало скрипта: человек был или не был на форуме. |
| `activity_type` | `Вид деятельности` | Например производство мебели, дизайн, студия интерьера. |
| `is_decision_maker` | `Руководитель компании, Да/Нет` | Помогает понять, ЛПР ли клиент. |
| `average_check` | `Средний чек` | Бизнес-метрика для AI и отчета. |
| `traffic_source` | `Трафик Сарафан/Входящий` | Как приходят клиенты у собеседника. |
| `bot_impression` | `Приятно/неприятно говорить с ботом` | Ответ клиента на вопрос про робота. |

### Что можно редактировать у контакта

Через текущий web API можно менять:

- `phone`;
- `name`;
- `company`;
- `city`;
- `source`;
- `task`;
- `context`;
- `preferred_time`;
- `timezone`.

Если меняется `phone`, backend нормализует номер и одновременно обновляет телефон связанной задачи обзвона.

Сейчас через API нельзя напрямую редактировать нормализованные Amix-поля (`attendance_status`, `activity_type`, `average_check` и так далее), потому что они лежат в `raw_row_json`. Для будущей панели это можно доработать отдельным endpoint или расширить текущий `PATCH /web/contacts/{id}`.

## Задача обзвона

Задача это конкретная попытка дозвониться до конкретного контакта в рамках кампании.

### Поля задачи

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | number | ID задачи. Его удобно показывать в логах и статусах. |
| `campaign_id` | number | Кампания. |
| `contact_id` | number | Контакт. |
| `phone` | string | Телефон, по которому будет звонить Voximplant. |
| `status` | string | Текущий статус задачи. |
| `priority` | number/null | Порядок в очереди. Чем меньше/раньше, тем раньше попадет в обработку. |
| `scheduled_at` | datetime/null | Когда задача становится доступной worker. |
| `started_at` | datetime/null | Когда начался запуск. |
| `finished_at` | datetime/null | Когда задача завершилась. |
| `last_attempt_at` | datetime/null | Время последней попытки. |
| `next_attempt_at` | datetime/null | Время следующей попытки, если будет retry. |
| `attempt_count` | number/null | Сколько попыток уже сделано. |
| `max_attempts` | number/null | Максимум попыток. |
| `voximplant_session_id` | string/null | Session ID Voximplant, если запуск состоялся. |
| `last_status` | string/null | Последний stage/status от сценария Voximplant. |
| `last_status_message` | text/null | Последнее человекочитаемое сообщение от сценария. |
| `last_status_at` | datetime/null | Когда пришел последний статус. |
| `result_status` | string/null | Итоговый статус из финализации. |
| `result_summary` | text/null | Краткий итог задачи/звонка. |
| `last_error` | text/null | Последняя ошибка запуска или звонка. |

### Статусы задач

| Статус | Русское значение | Что значит для интерфейса |
| --- | --- | --- |
| `pending` | Ожидает | Задача в очереди и может быть взята worker. |
| `scheduled` | Запланирована | Задача ждет своего времени. |
| `starting` | Запускается | Backend уже пытается стартовать сценарий Voximplant. |
| `started` | Сценарий запущен | Voximplant вернул запуск, но трубка еще не обязательно поднята. |
| `in_progress` | Разговор идет | Клиент поднял трубку, звонок соединен. |
| `completed` | Завершено | Финальные данные получены, задача успешно закрыта. |
| `failed` | Не состоялось/ошибка | Не дозвонились, таймаут, ошибка сценария или нет попыток. |

Для интерфейса важно не смешивать `started` и `in_progress`: `started` означает, что сценарий стартовал, а `in_progress` означает, что звонок реально соединен.

## Звонок

Звонок появляется по `voximplant_session_id`. Это центральная сущность для просмотра результата.

### Поля звонка

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | number | Внутренний ID записи звонка. |
| `session_id` | string | Voximplant session id. Главный публичный идентификатор звонка. |
| `outbound_task_id` | number/null | Связанная задача обзвона. |
| `campaign_id` | number/null | Связанная кампания. |
| `project` | string/null | Код проекта. |
| `script_name` | string/null | Название сценария Voximplant. |
| `model` | string/null | Модель AI, например Gemini. |
| `caller_phone` | string/null | Номер звонящего или caller id. |
| `client_phone` | string/null | Телефон клиента. |
| `client_name` | string/null | Имя клиента. |
| `started_at` | datetime/null | Когда backend создал запись звонка. |
| `connected_at` | datetime/null | Когда клиент поднял трубку. |
| `finished_at` | datetime/null | Когда звонок закончился. |
| `exported_at` | datetime/null | Когда сценарий экспортировал финальные данные. |
| `updated_at` | datetime/null | Последнее обновление записи. |
| `duration` | number/null | Длительность звонка в секундах. |
| `status` | string/null | Статус/причина финализации. |

### Бизнес-итоги звонка

| Поле | Назначение |
| --- | --- |
| `summary` | Общая краткая сводка разговора. |
| `call_goal` | Что хотел/обсуждал клиент. |
| `manager_offer` | Что предложила Екатерина/AI-ассистент. |
| `outcome` | Итог разговора: заинтересован, отказ, перезвон, нецелевой и так далее. |
| `next_step` | Следующий шаг: связаться менеджеру, отправить материалы, перезвонить. |
| `dialogue_text` | Полный или почти полный текст диалога. |
| `summary_fields_json` | Расширенные структурированные поля саммари, если сценарий их прислал. |
| `dialogue_items_json` | Диалог в виде массива реплик, если сценарий его прислал. |
| `admin_report_html` | HTML-отчет для админа/Telegram, если сформирован. |
| `summary_report_html` | HTML-отчет с кратким итогом, если сформирован. |
| `raw_payload_json` | Сырой финальный payload от сценария. Нужен для отладки. |

В текущем web API часть JSON-полей не отдается наружу в `web_call_payload`, но они уже есть в базе. Если другой агент делает более глубокий просмотр звонка, стоит добавить их в endpoint `/web/calls/{session_id}`.

### Стоимость и технические метрики звонка

| Поле | Что показывает |
| --- | --- |
| `telephony_cost_rub` | Стоимость телефонии. |
| `websocket_duration_sec` | Длительность websocket-сессии. |
| `websocket_cost_rub` | Стоимость websocket. |
| `voximplant_total_rub` | Общая стоимость Voximplant. |
| `ai_cost_usd` | Стоимость AI в долларах. |
| `ai_cost_rub` | Стоимость AI в рублях. |
| `total_cost_rub` | Общая стоимость звонка в рублях. |
| `usage_json` | Сырые usage-метрики модели: текст, аудио, события и т.д. |

Эти данные можно визуализировать как блок "стоимость и ресурсы" в карточке звонка или в аналитике кампании.

### Интеграционные статусы звонка

| Поле | Назначение |
| --- | --- |
| `telegram_admin_status` | Статус отправки служебного сообщения админам. |
| `telegram_summary_status` | Статус отправки summary/аудио в Telegram. |
| `google_sheets_status` | Статус отправки строки в Google Sheets. |
| `google_sheets_response` | Ответ Google Apps Script. |
| `last_error` | Последняя ошибка обработки звонка. |

Эти поля нужны для диагностики: например, звонок завершился, но аудио не ушло в Telegram или запись не попала в Google Sheets.

## Запись разговора

У звонка есть два уровня хранения записи:

1. `recording_url` - внешний URL записи, который вернул Voximplant.
2. `local_recording_path` - путь к файлу, скачанному backend на сервер.

В web payload также добавляется:

```text
recording_download_url = /web/recordings/{session_id}
```

Он появляется только если файл уже скачан локально.

### Поля записи

| Поле | Значение |
| --- | --- |
| `recording_status` | Статус подготовки или скачивания записи. |
| `recording_url` | Внешняя ссылка Voximplant. Может быть временной или недоступной сразу после звонка. |
| `recording_download_url` | Внутренняя ссылка web API на локальный файл записи. |
| `local_recording_path` | Серверный путь к файлу. Пользователю не показывать напрямую. |
| `recording_error` | Ошибка записи или скачивания. |

### Особенности скачивания

После завершения разговора запись часто нельзя скачать сразу. Поэтому backend делает повторные попытки:

```text
0 секунд -> 30 секунд -> 60 секунд -> 180 секунд
```

Для интерфейса это означает:

- звонок может быть завершен, но аудио еще не готово;
- нужно показывать состояние "запись готовится" или "скачиваем запись";
- если `recording_download_url` появился, можно показывать аудиоплеер;
- если есть `recording_error`, нужно показывать ошибку и не прятать сам звонок.

Старые локальные записи удаляются планировщиком по TTL. Сам факт звонка в базе остается, но `recording_download_url` может исчезнуть, если локальный файл удален.

## События сценария и телефонии

События хранят техническую хронологию: что делал сценарий, где он завис, когда клиент поднял трубку, когда включилась AI-модель, когда отправилась финализация.

### Поля события

| Поле | Назначение |
| --- | --- |
| `id` | ID события. |
| `campaign_id` | Кампания. |
| `task_id` | Задача. |
| `session_id` | Session ID звонка, если уже известен. |
| `phone` | Телефон контакта. |
| `stage` | Машинная стадия события. |
| `status` | Машинный статус: `ok`, `error`, `started`, `connected` и т.п. |
| `message` | Текстовое описание. |
| `payload_json` | Сырой payload от сценария. |
| `created_at` | Время события. |

### Важные stages

| Stage | Что означает |
| --- | --- |
| `scenario_started` | Сценарий Voximplant стартовал. |
| `custom_data_loaded` | Сценарий получил `script_custom_data`. |
| `context_fetch_start` | Сценарий запросил контекст задачи у backend. |
| `context_fetch_done` | Backend вернул контекст задачи. |
| `context_fetch_timeout` | Контекст не успел загрузиться. |
| `context_skipped_custom_data` | Сценарий взял контекст из custom data без отдельного запроса. |
| `lead_context_ready` | Контекст лида собран и готов для промпта. |
| `empty_call_target` | Нет телефона для звонка. |
| `dial_start` | Начинается дозвон. |
| `dial_error` | Ошибка дозвона. |
| `call_timeout` | Клиент не взял трубку за заданное время. |
| `call_connected` | Клиент поднял трубку, звонок соединен. |
| `recording_requested` | Сценарий запросил запись. |
| `recording_ready` | Voximplant дал ссылку на запись. |
| `recording_failed` | Ошибка записи. |
| `gemini_warmup_start` | Началась подготовка AI-соединения. |
| `gemini_ready` | AI-модель готова. |
| `gemini_error` | Ошибка AI-модели. |
| `opening_greeting_sent` | Отправлено стартовое приветствие. |
| `caller_input_enabled` | Голос клиента разрешен в AI-поток. |
| `summary_request` | Сценарий запросил итоговое summary. |
| `finalize_start` | Началась финализация звонка. |
| `finalize_sent` | Итоги отправлены на backend. |
| `call_disconnected` | Звонок завершен/разорван. |
| `call_failed` | Звонок не состоялся или завершился ошибкой. |

Для интерфейса желательно переводить эти stages на русский и показывать их в виде таймлайна задачи или звонка.

## Импорт базы

Поддерживаемые форматы:

- `.xlsx`;
- `.csv`;
- `.tsv`.

Файл сохраняется на сервер в папку `backend/imports`. После парсинга создается кампания и задачи.

### Основные правила парсинга

1. Для `XLSX` backend ищет строку заголовков в первых 10 строках.
2. Если заголовки не найдены, но в колонке `E` есть телефон, используется позиционный шаблон Amix.
3. Для `CSV/TSV` читается `utf-8-sig`, delimiter для CSV определяется автоматически.
4. Строки без телефона пропускаются.
5. Телефон нормализуется:
   - убираются пробелы, скобки, дефисы;
   - `+` убирается;
   - российские номера с `8` приводятся к `7`.

### Шаблон Amix

Колонки, которые важны для текущего проекта:

| Колонка | Название | Поле backend |
| --- | --- | --- |
| `B` | Имя | `name` |
| `C` | Фамилия | добавляется к `name` |
| `D` | E-mail | `email` в normalized raw data |
| `E` | Контактныйтелефон | `phone` |
| `F` | Компания | `company` |
| `G` | Пришёл | `attendance_status` |
| `H` | Дозвон Да/Нет | `dial_status` в normalized raw data |
| `I` | Вид деятельности | `activity_type` |
| `J` | Руководитель компании, Да/Нет | `is_decision_maker` |
| `K` | Средний чек | `average_check` |
| `L` | Трафик Сарафан/Входящий | `traffic_source` |
| `M` | Комментарий | `context` |
| `N` | Приятно/неприятно говорить с ботом | `bot_impression` |
| `O` | Транскрибация диалога | `dialogue_transcript` в raw data |
| `P` | Саммари разговора | `call_summary` в raw data |

Поле `G: Пришёл` особенно важное:

```text
Да / пришел / пришёл / посетил -> attendance_status = attended
Нет / не пришел / не пришёл / пусто -> attendance_status = not_attended
```

Это поле влияет на начало разговора: AI должна понимать, был человек на форуме или только оставлял заявку/интерес.

### Что возвращает импорт

После загрузки endpoint возвращает:

```json
{
  "campaign": {
    "id": 1,
    "name": "forum_amix_template 2026-05-24 10:30",
    "status": "paused",
    "source_filename": "forum_amix_template.xlsx",
    "call_delay_seconds": 60
  },
  "stats": {
    "total": 4,
    "pending": 4
  },
  "preview": [
    {
      "phone": "79650348852",
      "name": "Артем",
      "company": "..."
    }
  ]
}
```

`preview` содержит первые 20 нормализованных строк. Его можно использовать для предпросмотра загруженной базы до перехода в карточку кампании.

## Контекст, который передается AI и Voximplant

При старте задачи backend формирует объект контекста и передает его в Voximplant через `script_custom_data`. Сценарий телефонии использует эти данные для промпта.

```json
{
  "task_id": 1,
  "campaign_id": 1,
  "phone": "79650348852",
  "client_name": "Артем",
  "last_name": "",
  "email": "client@example.com",
  "company": "Название компании",
  "city": "Москва",
  "source": "Форум Amix",
  "attendance_status": "attended",
  "activity_type": "мебельное производство",
  "is_decision_maker": "Да",
  "average_check": "150 000 руб.",
  "traffic_source": "реклама и сарафан",
  "bot_impression": "",
  "task": "",
  "context": "Статус участия: пришел на мебельный форум Amix.\nВид деятельности: мебельное производство.",
  "preferred_time": "",
  "timezone": "",
  "campaign_context": "Общий контекст кампании"
}
```

Эти данные стоит показывать в интерфейсе как "что уйдет в AI", особенно перед запуском кампании.

## Очередь и worker

Worker запускается на backend по расписанию.

Для панели важны такие значения:

| Поле | Где приходит | Что значит |
| --- | --- | --- |
| `worker.enabled` | `/web/dashboard` | Включен ли обработчик очереди. |
| `worker.rule_id` | `/web/dashboard` | ID правила Voximplant, которое запускается. |
| `worker.public_backend_url` | `/web/dashboard` | Публичный URL backend для webhook/контекста. |
| `worker.queue_interval_seconds` | `/web/dashboard` | Как часто worker проверяет очередь. |
| `worker.max_concurrent_calls` | `/web/dashboard` | Сколько звонков можно держать одновременно. |
| `campaign.next_call_after` | campaign | Когда разрешен следующий старт внутри кампании. |
| `campaign.call_delay_seconds` | campaign | Пауза между контактами. |

Worker берет задачи только из активных кампаний и только если задача в статусе `pending` или `scheduled`.

## API веб-панели

Все `/web/...` endpoints требуют авторизованную web-сессию через cookie.

### Авторизация

```text
POST /web/auth/login
body: { "username": "...", "password": "..." }
result: { "ok": true, "username": "..." }

POST /web/auth/logout
result: { "ok": true }

GET /web/auth/me
result: { "username": "..." }
```

### Сводные данные

```text
GET /web/dashboard
```

Возвращает:

```json
{
  "campaigns": {
    "total": 1,
    "active": 0,
    "paused": 1,
    "recent": []
  },
  "contacts": {
    "total": 4
  },
  "tasks": {
    "total": 4,
    "pending": 4,
    "active": 0,
    "completed": 0,
    "failed": 0
  },
  "calls": {
    "total": 10,
    "recent": []
  },
  "worker": {
    "enabled": true,
    "rule_id": "8896222",
    "public_backend_url": "https://...",
    "queue_interval_seconds": 10,
    "max_concurrent_calls": 1
  }
}
```

### Кампании

```text
GET /web/campaigns
GET /web/campaigns/{campaign_id}
POST /web/campaigns/{campaign_id}/run
POST /web/campaigns/{campaign_id}/pause
POST /web/campaigns/{campaign_id}/rerun
POST /web/campaigns/{campaign_id}/delay
body: { "delay_seconds": 30 }
```

`GET /web/campaigns/{id}` возвращает:

```json
{
  "campaign": {},
  "contacts": [],
  "tasks": [],
  "calls": [],
  "events": []
}
```

Это главный endpoint для детального экрана кампании.

### Импорт

```text
POST /web/imports
Content-Type: multipart/form-data
field: file
```

Возвращает кампанию, статистику и предпросмотр строк.

```text
GET /web/template
```

Возвращает актуальный шаблон таблицы.

### Контакты

```text
PATCH /web/contacts/{contact_id}
body:
{
  "phone": "79650348852",
  "name": "Артем",
  "company": "Компания",
  "city": "Москва",
  "source": "Форум Amix",
  "task": "интерес к AI-обзвону",
  "context": "дополнительная информация",
  "preferred_time": "после 15:00",
  "timezone": "Europe/Moscow"
}
```

Возвращает обновленный контакт и связанную задачу.

### Звонки и записи

```text
GET /web/calls?limit=50
GET /web/calls/{session_id}
GET /web/recordings/{session_id}
```

`/web/recordings/{session_id}` возвращает файл записи, если он уже скачан на сервер. Если файла нет, вернется `404`.

## Inbound-контекст

Для будущего входящего сценария есть endpoint:

```text
GET /inbound/caller-context?phone=...
```

Он защищается webhook-secret и предназначен не для обычной web-панели, а для сценария Voximplant.

Возвращаемая структура:

```json
{
  "phone": "79650348852",
  "known": true,
  "lead_context": {
    "phone": "79650348852",
    "client_name": "Артем",
    "company": "Компания",
    "source": "Форум Amix",
    "attendance_status": "attended",
    "activity_type": "мебельное производство",
    "is_decision_maker": "Да",
    "average_check": "150 000 руб.",
    "traffic_source": "реклама",
    "context": "..."
  },
  "last_task": {},
  "last_call": {},
  "recent_tasks": [],
  "recent_calls": [],
  "context_text": "Готовый текстовый контекст для промпта"
}
```

В веб-панели эти данные можно использовать как будущую карточку "история клиента по номеру": последние попытки, звонки, итоги, запись, контекст.

## Что должно быть хорошо видно в интерфейсе

Это не структура страниц, а список данных, которые важно визуализировать:

- список кампаний с количеством контактов, очередью, завершенными и ошибочными задачами;
- статус каждой кампании: активна или на паузе;
- пауза между звонками и время следующего возможного старта;
- источник базы и дата загрузки;
- предпросмотр загруженных контактов;
- контакты с именем, телефоном, компанией, пришел/не пришел, видом деятельности и контекстом;
- отдельный статус задачи по каждому контакту;
- попытки дозвона: сколько было и сколько максимум;
- последний технический статус сценария;
- ошибка, если звонок не состоялся;
- список звонков с session id, именем, телефоном, статусом, длительностью и итогом;
- карточка звонка с summary, outcome, next_step, dialogue_text;
- аудиоплеер, если `recording_download_url` уже есть;
- состояние записи, если аудио еще готовится или скачивание упало;
- таймлайн событий по кампании/задаче/звонку;
- диагностические статусы отправки в Telegram и Google Sheets;
- стоимость звонка и AI, если поля заполнены.

## Что можно добавлять через интерфейс

Сейчас через backend можно добавлять только новую кампанию через импорт файла. Прямого создания одиночного контакта через web API нет.

Для полноценной панели логично добавить в будущем:

- создание пустой кампании вручную;
- добавление одного контакта в кампанию;
- массовое редактирование контактов перед запуском;
- изменение `max_attempts`;
- изменение `scheduled_at`;
- изменение `priority`;
- редактирование Amix-полей из `raw_row_json.normalized`;
- ручной перезапуск одной задачи;
- ручное скачивание/повтор скачивания записи;
- ручную повторную отправку в Telegram или Google Sheets.

## Что можно изменять уже сейчас

Уже поддержано backend:

```text
Кампания:
  - запустить
  - поставить на паузу
  - сбросить задачи для повторного запуска
  - изменить паузу между контактами

Контакт:
  - phone
  - name
  - company
  - city
  - source
  - task
  - context
  - preferred_time
  - timezone
```

## Что нужно учитывать другому агенту

1. Не строить интерфейс только вокруг звонков. Главная рабочая сущность это цепочка `кампания -> контакт -> задача -> звонок`.
2. У одного контакта может не быть звонка, если до него не дозвонились или сценарий не получил session id.
3. У задачи может быть `voximplant_session_id`, но звонок еще не финализирован.
4. У звонка может быть summary, но еще не быть локальной записи.
5. Запись может появиться через несколько минут после завершения разговора.
6. `recording_url` и `recording_download_url` не одно и то же. Для плеера лучше использовать `recording_download_url`.
7. `dialogue_text` может быть длинным, поэтому нужен нормальный просмотр с прокруткой/сворачиванием.
8. Технические events нужно показывать в человекочитаемом виде, иначе администратору будет сложно понять, где проблема.
9. Визуальные статусы должны быть русскими, но машинные значения сохраняются как есть.
10. Любые секреты, токены, пароли, webhook-secret и ключи нельзя показывать в интерфейсе.

## Минимальный набор экранных данных для MVP

Чтобы другой агент мог быстро собрать MVP, достаточно выводить:

```text
Dashboard:
  - campaigns.total / active / paused
  - contacts.total
  - tasks.pending / active / completed / failed
  - calls.total
  - worker.enabled / rule_id / max_concurrent_calls

Campaign list:
  - id
  - name
  - status
  - source_filename
  - stats
  - call_delay_seconds
  - updated_at

Campaign detail:
  - campaign settings
  - contacts with task status
  - calls by this campaign
  - latest events

Contact editor:
  - phone
  - name
  - company
  - context
  - optional fields

Call detail:
  - session_id
  - client_name / phone
  - status
  - duration
  - summary
  - outcome
  - next_step
  - dialogue_text
  - recording player
  - recording_status / recording_error
```

## Желательный расширенный набор

Для более сильной версии панели стоит дополнительно использовать:

- сравнение `connected_at`, `finished_at`, `duration`;
- стоимость телефонии, AI и итоговую стоимость;
- `call_goal` и `manager_offer`;
- `usage_json`;
- `summary_fields_json`;
- `dialogue_items_json`;
- `admin_report_html`;
- `telegram_admin_status`;
- `telegram_summary_status`;
- `google_sheets_status`;
- `google_sheets_response`;
- историю входящих обращений по номеру через inbound-context;
- timeline событий по `stage`.

## Пример связи данных одного контакта

```json
{
  "campaign": {
    "id": 1,
    "name": "forum_amix_test_4_contacts",
    "status": "active",
    "call_delay_seconds": 30
  },
  "contact": {
    "id": 10,
    "phone": "79650348852",
    "name": "Артем",
    "company": "Студия мебели",
    "attendance_status": "attended",
    "activity_type": "мебельное производство",
    "average_check": "150 000 руб.",
    "context": "Статус участия: пришел на мебельный форум Amix."
  },
  "task": {
    "id": 25,
    "status": "completed",
    "attempt_count": 1,
    "max_attempts": 1,
    "voximplant_session_id": "4698197390",
    "result_status": "interested",
    "result_summary": "Клиент заинтересовался, просит связаться позже."
  },
  "call": {
    "session_id": "4698197390",
    "status": "finalized",
    "duration": 185,
    "summary": "Обсудили внедрение AI-ассистента для обработки заявок.",
    "outcome": "Есть интерес",
    "next_step": "Передать менеджеру и договориться о демонстрации.",
    "recording_download_url": "/web/recordings/4698197390"
  }
}
```

## Итоговый принцип для визуализации

Панель должна отвечать администратору на четыре вопроса:

1. Что загружено и кого надо обзвонить?
2. Что сейчас происходит с очередью?
3. Что произошло по каждому контакту?
4. Где результат разговора: запись, текст, итог, следующий шаг и ошибки интеграций?

Если эти четыре вопроса закрыты, интерфейс будет полезен даже без сложной аналитики.
