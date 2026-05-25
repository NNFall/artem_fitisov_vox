# Отчет по проверке референсного веб-интерфейса

Дата проверки: 25.05.2026, 16:39-16:41 по Самаре.  
URL: `https://ais-dev-ckkh7dr2njxrhabc5dnstc-61475272538.us-east5.run.app/`

## Короткий вывод

Референсный интерфейс по этой ссылке в чистом браузере не открылся. Страница сразу уводит на авторизацию Google через `aistudio.google.com/applet-auth-bridge`, затем на `accounts.google.com`.

Поэтому полноценный разбор дизайна самого приложения, сценариев, кнопок, карточек, таблиц, деталей звонка и мобильной версии сделать нельзя: доступен только экран входа Google.

Все видимые интерактивные элементы на доступной странице были нажаты и зафиксированы скриншотами. Это элементы Google-авторизации, не элементы целевого интерфейса.

## Среда проверки

- Браузер: Playwright Chromium.
- Десктопный viewport: `1440x1000`.
- Мобильная проверка: запускалась отдельно; после редиректа получена страница `chrome-error://chromewebdata/`, целевой интерфейс не загрузился.
- Ошибки консоли на доступной desktop-странице: не зафиксированы.
- Ошибки страницы на доступной desktop-странице: не зафиксированы.
- Сырые данные проверки сохранены в [inspection-data.json](inspection-data.json).

## Начальные скриншоты

| Контекст | Что видно | Скриншот |
|---|---|---|
| Desktop | Google Sign in вместо приложения | [00_desktop_initial.png](screenshots/00_desktop_initial.png) |
| Mobile | Целевой интерфейс не загрузился после редиректа | [01_mobile_initial.png](screenshots/01_mobile_initial.png) |

## Что произошло при открытии ссылки

Итоговый URL в desktop-сессии:

```text
https://accounts.google.com/v3/signin/identifier?...return_url=https://ais-dev-ckkh7dr2njxrhabc5dnstc-61475272538.us-east5.run.app/
```

Заголовок страницы:

```text
Sign in - Google Accounts
```

На странице видны только:

- поле `Email or phone`;
- ссылка `Forgot email?`;
- ссылка `Learn more about using Guest mode`;
- кнопка `Next`;
- ссылка `Create account`;
- выбор языка;
- ссылки `Help`, `Privacy`, `Terms`.

## Проверка кликов

Нажаты все 8 интерактивных элементов, которые были доступны в чистой desktop-сессии.

| # | Элемент | Результат | Скриншот |
|---:|---|---|---|
| 1 | `Forgot email?` | Открылась страница восстановления email/телефона Google. | [01_click_0_forgot_email.png](screenshots/01_click_0_forgot_email.png) |
| 2 | `Learn more about using Guest mode` | Остается контекст Google-страницы/справки; целевой интерфейс не открывается. | [02_click_1_learn_more_about_using_guest_mode.png](screenshots/02_click_1_learn_more_about_using_guest_mode.png) |
| 3 | `Next` | На пустом поле появляется ошибка Google: нужно ввести email или телефон. | [03_click_2_next.png](screenshots/03_click_2_next.png) |
| 4 | `Create account` | Открывается поток создания Google-аккаунта. | [04_click_3_create_account.png](screenshots/04_click_3_create_account.png) |
| 5 | Language selector | Открывается/фокусируется выбор языка Google. | [05_click_4_afrikaans_az_rbaycan_bosanski_catal_e_tina_cymraeg.png](screenshots/05_click_4_afrikaans_az_rbaycan_bosanski_catal_e_tina_cymraeg.png) |
| 6 | `Help` | Открывается справочный раздел Google. | [06_click_5_help.png](screenshots/06_click_5_help.png) |
| 7 | `Privacy` | Открывается/инициируется переход на страницу политики Google. | [07_click_6_privacy.png](screenshots/07_click_6_privacy.png) |
| 8 | `Terms` | Открывается/инициируется переход на условия Google. | [08_click_7_terms.png](screenshots/08_click_7_terms.png) |

## Что не удалось проверить

Из-за авторизационного редиректа не удалось проверить:

- первую страницу приложения;
- навигацию;
- кампании и список кампаний;
- загрузку базы;
- предпросмотр базы;
- карточки контактов;
- статусы звонков;
- страницу результата звонка;
- запись разговора и аудио-плеер;
- summary и детали разговора;
- кликабельность пустых/заполненных карточек;
- анимации;
- адаптивность целевого интерфейса;
- любые реальные кнопки приложения.

## Что нужно для следующей проверки

Подойдет один из вариантов:

1. Репозиторий фронтенда, чтобы поднять приложение локально и проверить без Google AI Studio-обертки.
2. Публичный preview/deploy без обязательного Google-входа.
3. Тестовый логин/доступ, если приложение обязательно должно открываться через авторизацию.

После этого можно пройти уже целевой интерфейс: снять desktop/mobile скриншоты, прокликать все реальные кнопки, проверить карточки, модалки, таблицы, загрузку файла, просмотр результата звонка и сделать нормальный UI/UX-аудит.
