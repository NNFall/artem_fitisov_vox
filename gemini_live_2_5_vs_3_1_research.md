# Gemini Live: сравнение 2.5 Flash Native Audio и 3.1 Flash Live

Дата ресерча: 23 апреля 2026.

Короткий вывод: Gemini 3.1 Flash Live выглядит как более новая и более качественная модель для realtime-диалогов, но "аудиотеги" вида `[whispers]`, `[excited]`, `[very slow]` официально относятся к Gemini 3.1 Flash TTS, а не к Gemini 3.1 Flash Live. Для телефонного бота на Live API мы можем управлять стилем в промпте естественным языком и выбирать голос, но точного SSML-подобного управления темпом/интонацией в Live API официально не заявлено.

## Что сейчас используется

В текущем файле `crystalstone_2_5_flash.js` используется:

`gemini-2.5-flash-native-audio-preview-12-2025`

Это Live API native audio модель: она принимает аудио и отдает аудио напрямую, без отдельной связки STT -> LLM -> TTS.

## Новая модель 3.1

Модель:

`gemini-3.1-flash-live-preview`

Google описывает ее как low-latency audio-to-audio модель для realtime-диалогов с acoustic nuance detection, numeric precision и multimodal awareness. В официальном блоге Google пишет, что 3.1 Flash Live должна быть быстрее, естественнее, лучше понимать тон, темп, раздражение/замешательство пользователя и лучше вести длинный разговор.

Для разработчиков модель доступна в preview через Gemini Live API.

## Сравнение для нашего голосового агента

| Пункт | 2.5 Flash Native Audio | 3.1 Flash Live |
|---|---|---|
| Model ID в нашем коде / для теста | `gemini-2.5-flash-native-audio-preview-12-2025` | `gemini-3.1-flash-live-preview` |
| Статус | Preview в Gemini API; есть отдельная GA-линейка на Vertex AI | Preview |
| Назначение | Native audio для Live API | Новая realtime audio-to-audio модель |
| Качество речи | Google описывает как улучшенную naturalness, pacing, verbosity, mood для 2.5 native audio | Google заявляет более естественный ритм, более низкую задержку и лучшее понимание acoustic nuances |
| Задержка | Работает, но на длинном промпте и сложном диалоге может давать заметные паузы | Официально заявлена lower latency / faster responses, но точных миллисекунд для API Google не дает |
| Thinking | Для 2.5 используется `thinkingBudget`; чтобы выключить: `thinkingBudget: 0` | Для 3.1 используется `thinkingLevel`: `minimal`, `low`, `medium`, `high`; default `minimal` для минимальной задержки |
| Runtime text update | 2.5 допускает `sendClientContent` в течение разговора | 3.1 требует `sendRealtimeInput` для текстовых обновлений в процессе разговора; `sendClientContent` только для initial history |
| Ответы сервера | Обычно одна часть в одном событии | Одно событие может содержать несколько частей сразу; код должен обработать все части |
| VAD | Настраивается: sensitivities, prefix padding, silence duration | То же самое |
| Function calling | Обычный sequential flow | Официально async function calling для 3.1 Live не поддержан; sequential function calling остается рабочей схемой |
| Proactive audio | Поддерживается для 2.5 Live API native audio через `proactivity`/`proactive_audio` | В официальной таблице для 3.1 Live указано "not supported" |
| Affective dialog | Поддерживается для 2.5 Live API native audio через `enableAffectiveDialog` | В официальной таблице для 3.1 Live указано "not supported"; при этом сама модель, по блогу Google, лучше понимает тон и акустические нюансы |
| Голоса | Можно выбирать voiceName через `speechConfig.voiceConfig.prebuiltVoiceConfig` | То же самое: Live native audio поддерживает голоса из TTS voice library |
| Управление темпом/интонацией | В Live API в основном промптом и выбором голоса | В Live API тоже в основном промптом и выбором голоса; точного поля `speakingRate` для Live API в официальной документации не нашел |

## Стоимость

Цены ниже по официальной странице Gemini API pricing, paid tier, USD.

| Цена | 2.5 Flash Native Audio | 3.1 Flash Live |
|---|---:|---:|
| Text input | $0.50 / 1M tokens | $0.75 / 1M tokens |
| Audio input | $3.00 / 1M tokens | $3.00 / 1M tokens или $0.005 / min |
| Image/video input | В текущей 2.5 native audio строке: audio/video $3.00 / 1M tokens | $1.00 / 1M tokens или $0.002 / min |
| Text output | $2.00 / 1M tokens | $4.50 / 1M tokens |
| Audio output | $12.00 / 1M tokens | $12.00 / 1M tokens или $0.018 / min |

Практический вывод по стоимости:

3.1 Flash Live дороже по текстовым токенам, но аудио input/output по токенам совпадает с 2.5: $3 вход и $12 выход за 1M audio tokens. Для 3.1 Google прямо дает минутные эквиваленты: примерно $0.005 за минуту входного аудио и $0.018 за минуту выходного аудио. Если считать грубо по курсу 80 руб/USD, это около 0.40 руб/мин за входное аудио и 1.44 руб/мин за выходное аудио модели. Реальная минута звонка будет зависеть от того, сколько говорит клиент, сколько говорит агент и сколько текстовых токенов уходит на промпт/историю.

## Важное про аудиотеги

Официальные аудиотеги описаны для Gemini TTS, например:

`[whispers]`, `[laughs]`, `[sighs]`, `[excitedly]`, `[bored]`, `[very fast]`, `[very slow]`, `[shouting]`

По документации TTS эти теги можно вставлять прямо в текст, чтобы менять эмоцию, темп, громкость, паузы и подачу конкретного фрагмента. Google прямо пишет, что TTS лучше подходит, когда нужно точное озвучивание текста с тонким контролем стиля и звучания.

Но для нашего телефонного сценария используется Gemini Live API, а не TTS. Live API предназначен для интерактивного неструктурированного диалога, где модель сама решает, что сказать и как ответить. Поэтому:

- аудиотеги в строгом смысле - это функция TTS, а не Live;
- в Live можно пробовать естественные инструкции в промпте: "говори ровно, средним темпом, без резких ускорений, с мягкой деловой интонацией";
- вставлять теги вроде `[very slow]` в Live-промпт можно только экспериментально, но это не гарантированная официальная механика для Live API;
- если нужен жесткий контроль произношения/интонации, архитектура должна быть другой: Live/LLM генерирует текст, а отдельный Gemini 3.1 Flash TTS озвучивает его с аудиотегами. Но это добавит задержку и усложнит телефонию.

## Что это значит для Crystal Stone

Для текущего бота на Voximplant самый реалистичный путь:

1. Оставить 2.5 Flash Native Audio как стабильный рабочий вариант.
2. Отдельно тестировать `gemini-3.1-flash-live-preview` на тех же звонках и сравнивать:
   - задержку после коротких ответов клиента;
   - стабильность темпа;
   - произношение проблемных слов;
   - качество завершения разговора;
   - насколько хорошо работает function calling на финальной суммаризации.
3. Для 3.1 в коде важно использовать `sendRealtimeInput` для runtime text updates и корректно разбирать события, где в одном сообщении может быть несколько частей.
4. Не закладываться на аудиотеги как на надежный инструмент Live API. Для Live лучше использовать короткие голосовые инструкции в системном промпте.

## Рекомендация

Для телефонного агента я бы рассматривал 3.1 Flash Live как перспективный A/B-тест, но не как мгновенную замену. Причины:

- качество и естественность должны быть лучше по заявлению Google;
- цена по аудио примерно сопоставима с 2.5, а текстовые токены дороже;
- модель в preview, могут быть изменения и более строгие лимиты;
- часть привычных функций 2.5 Live, например proactive audio и affective dialog как отдельные флаги, для 3.1 Live официально не поддерживаются;
- аудиотеги относятся к TTS, а не к Live, поэтому проблему темпа/интонации в realtime-звонке они не решают напрямую.

Практически: нужно сделать копию сценария под 3.1, не трогая рабочий 2.5, и гонять одинаковые тестовые звонки. Сравнивать не "на слух один раз", а по 10-20 звонкам: средняя задержка, количество перебиваний, ошибки произношения, успешность финальной функции, качество summary.

## Источники

- Google Blog: Gemini 3.1 Flash Live announcement: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-live/
- Gemini Live API capabilities guide: https://ai.google.dev/gemini-api/docs/live-api/capabilities
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini Text-to-Speech generation guide: https://ai.google.dev/gemini-api/docs/speech-generation
- Gemini 3.1 Flash Audio model card: https://deepmind.google/models/model-cards/gemini-3-1-flash-audio/
- Vertex AI docs for Gemini 2.5 Flash Live API native audio: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-live-api
