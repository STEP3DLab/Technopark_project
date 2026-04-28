# Технопарк РГСУ: проекты и гранты (версия v3)

Готовый статический dashboard для управления проектами технопарка: чтение Google Таблицы, добавление проектов через Apps Script, фильтры, реестр, грантовая воронка, пакет подачи и список ближайших действий.

Версия v3 включает обновленный лист проектов (gid=341683209) для устойчивого чтения и редактирования данных.

## Запуск

Откройте `index.html` в браузере. Сайт уже подключен к таблице:

`https://docs.google.com/spreadsheets/d/1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60/edit?gid=341683209`

## Показ руководству

Для встречи откройте сайт и нажмите `Режим доклада`. В этом режиме скрываются фильтры и рабочие кнопки, а первый экран показывает:

- сводку для проректора;
- ближайшие дедлайны;
- карту портфеля;
- решения руководства;
- проекты, которые нужно доупаковать к грантам.

## MVP: 7 блоков по 3 улучшения

1. Навигация и шапка: режим доклада, быстрое обновление данных, единый CTA добавления проекта.
2. Управленческий обзор: сводка для проректора, карта портфеля, список решений руководства.
3. Фильтры: поиск по смысловым полям, фильтр направлений, активные chips с текущей выборкой.
4. Реестр проектов: инсайты раздела, подсветка рисков, адаптивная таблица/карточки.
5. Грантовая воронка: инсайты по маршрутам, карточки грантов с первым шагом, связь с проектами.
6. Пакет подачи: средняя готовность, слабые пакеты, визуальные статусы документов.
7. Запись и интеграция: код подтверждения, Apps Script endpoint, локальный fallback при сбое.

## Запись в таблицу

URL Apps Script уже добавлен в `app.js` как стандартный адрес:

`https://script.google.com/macros/s/AKfycbwzbWEjEpb1ySylb--7VhqEHvaC05WB5jhcw-8xpAj811bIJurVB3CW-ElDsoeKnWOA/exec`

Для защиты от случайных изменений форма требует код подтверждения `11111111`. Этот же код проверяется в `google-apps-script.gs`, поэтому после обновления скрипта нужно заново развернуть Apps Script.

Сайт читает и редактирует актуальную структуру проекта из репозитория `STEP3DLab/Technopark_project`: листы `Реестр проектов` (gid=341683209), `Актуальные гранты`, `Пожелания НТС`. В разделе «Проекты» появилась кнопка «Редактировать»: изменения отправляются в Apps Script с действием `update_project`.

## API contract

Единый endpoint (POST/GET):  
`https://script.google.com/macros/s/AKfycbwzbWEjEpb1ySylb--7VhqEHvaC05WB5jhcw-8xpAj811bIJurVB3CW-ElDsoeKnWOA/exec`

### POST actions

- `add_nts_feedback` — добавить пожелание НТС.
  - Обязательные поля: `action`, `formKey` (или `confirmCode`), `author`, `role`, `project`, `priority`, `message`, `source`, `userAgent`.
  - Тип пожелания передается как `category` (допустим также `type` для совместимости).
  - Успешный ответ: `{ "ok": true, ... }`.
- `add_project`, `update_project`, `add_package_row`, `update_package`, `update_nts_feedback_status` — служебные действия управления проектами (требуют `confirmCode`).

### GET actions

- `health`
- `bootstrap`
- `projects`
- `grants`
- `packages`
- `list_nts_feedback`

### Обратная совместимость (deprecated)

В `google-apps-script.gs` `doPost` временно принимает старый action `addWish`, автоматически маршрутизирует его в `add_nts_feedback` и пишет warning в лог как deprecated-путь.

## Публикация на GitHub Pages

1. Создайте репозиторий на GitHub.
2. Загрузите в корень репозитория все файлы проекта: `index.html`, `styles.css`, `app.js`, `.nojekyll`, `robots.txt`, `README.md`.
3. Сделайте commit и push в ветку `main`.
4. Откройте `Settings` -> `Pages`.
5. В блоке `Build and deployment` выберите `Deploy from a branch`.
6. Выберите ветку `main` и папку `/ (root)`, затем нажмите `Save`.
7. Через 1-5 минут сайт будет доступен по адресу вида `https://USERNAME.github.io/REPOSITORY/`.

Официальная инструкция GitHub: https://docs.github.com/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Файлы

- `index.html` - структура приложения и публичные метатеги.
- `styles.css` - адаптивный UI.
- `app.js` - загрузка данных из нескольких листов, фильтры, воронка, пакет подачи, код подтверждения и отправка в Apps Script.
- `google-apps-script.gs` - расширенный код веб-приложения Apps Script с чтением, добавлением, обновлением проектов и журналом действий.
- `.nojekyll` - отключает обработку Jekyll на GitHub Pages.
- `robots.txt` - разрешает индексацию опубликованного сайта.
