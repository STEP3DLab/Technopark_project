# Технопарк РГСУ: проекты и гранты (версия v3)

Статический dashboard для проектного центра: чтение Google Таблицы, фильтрация реестра проектов, визуализация грантовой воронки, календарь грантов и отправка пожеланий НТС.

> Важно: README ниже фиксирует **текущее состояние UI/кода (факт)**. Идеи и улучшения вынесены в отдельный раздел **Roadmap**.

## Запуск

Откройте `index.html` в браузере. Сайт уже подключен к таблице:

`https://docs.google.com/spreadsheets/d/1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60/edit?gid=341683209`

## Текущий функционал (факт)

- Верхняя навигация по разделам: обзор, проекты, воронка, календарь, пожелания НТС, связь с таблицей.
- Кнопка `Обновить данные` для перезагрузки данных из Google Sheets.
- KPI-блок: всего проектов, готовы к гранту, срочные дедлайны, проекты с рисками, пожелания НТС.
- Блок внимания руководителя (приоритетные задачи на основе дедлайнов, пустых полей и комментариев НТС).
- Реестр проектов:
  - поиск по названию,
  - фильтры по статусу/дедлайну,
  - чекбоксы `Только риски` и `Готовы к гранту`,
  - раскрытие деталей проекта в таблице,
  - мобильные карточки.
- Грантовая воронка с кликабельными этапами и списком проектов на этапе.
- Календарь грантов (подготовка → подача → рассмотрение → результат) с подсветкой рисков по срокам.
- Форма «Пожелания НТС» и лента последних пожеланий.
- Блок «Связь с таблицей» и ссылки в footer на Google Sheet и Apps Script URL.

## Ограничения / что пока не реализовано в UI

- **Нет режима доклада** (кнопка/режим отсутствуют в текущем `index.html` и `app.js`).
- **Нет кнопки «Редактировать» проект в UI** (в интерфейсе есть просмотр и фильтры, но не форма редактирования проекта).
- **Нет UI-блока «Пакет подачи»** (есть только логика в Apps Script, но не отдельный раздел в текущем фронтенде).
- Нет отдельного UI для «решений руководства» как самостоятельного модуля (частично покрывается блоком «Что требует внимания руководителя»).

## Roadmap

1. Режим доклада (скрытие рабочих контролов, презентерский first screen).
2. UI-редактирование карточки проекта (`update_project`) и/или отдельная форма добавления (`add_project`).
3. Раздел «Пакет подачи» во фронтенде (визуальные статусы документов, слабые места пакета).
4. Выравнивание frontend/backend action для формы НТС (единый контракт `addWish` vs `add_nts_feedback`).
5. Дополнительные аналитические виджеты для руководства (решения, приоритизация, итог по маршрутам).

## Соответствие функционала коду (Feature → файл/функция)

| Feature | Где реализовано |
|---|---|
| Инициализация приложения и загрузка данных | `app.js: initData`, `loadProjects`, `loadSheet` |
| Нормализация строк проектов/грантов/пожеланий | `app.js: normalizeProject`, `normalizeGrant`, `normalizeWish` |
| KPI-карточки | `app.js: renderKpi` |
| Реестр + фильтрация | `app.js: filteredProjects`, `renderProjects`, `applyFiltersFromUI`, `fillFilterOptions` |
| Блок «Что требует внимания руководителя» | `app.js: renderAttentionList` |
| Грантовая воронка | `app.js: renderFunnel` |
| Календарь грантов / timeline | `app.js: renderGrantTimeline`, `renderGanttBar`, `segment` |
| Форма и лента пожеланий НТС | `app.js: submitWish`, `renderWishes` |
| Привязка UI-событий | `app.js: bindUi` |
| Ссылки на Sheet/Script в UI | `app.js: initLinks` |
| GET API endpoint’ы Apps Script | `google-apps-script.gs: doGet` (`health`, `bootstrap`, `projects`, `grants`, `packages`, `list_nts_feedback`) |
| POST API endpoint’ы Apps Script | `google-apps-script.gs: doPost` (`add_project`, `update_project`, `add_package_row`, `update_package`, `add_nts_feedback`, `update_nts_feedback_status`) |

## Запись в таблицу

URL Apps Script уже добавлен в `app.js` как стандартный адрес:

`https://script.google.com/macros/s/AKfycbwzbWEjEpb1ySylb--7VhqEHvaC05WB5jhcw-8xpAj811bIJurVB3CW-ElDsoeKnWOA/exec`

### Актуальная интеграция с Apps Script (action/fields)

#### 1) Что сейчас отправляет frontend (факт)

Форма НТС в `app.js: submitWish` отправляет `POST` со следующими полями:

```json
{
  "action": "addWish",
  "author": "ФИО",
  "role": "Роль / подразделение",
  "project": "Название проекта",
  "type": "идея|риск|замечание|предложение|вопрос",
  "priority": "низкий|средний|высокий",
  "message": "Текст пожелания",
  "createdAt": "ISO datetime"
}
```

#### 2) Что сейчас принимает Apps Script (`google-apps-script.gs`)

Поддерживаемые `POST action`:

- `add_project`
- `update_project`
- `add_package_row`
- `update_package`
- `add_nts_feedback`
- `update_nts_feedback_status`

Для проектных операций нужен `confirmCode = 11111111`.
Для формы НТС допускается либо `confirmCode = 11111111`, либо `formKey = NTS_TECHNOPARK_2026`.

Базовые поля для `add_nts_feedback` (по текущему скрипту): автор/роль/проект/тип/приоритет/сообщение + служебные поля времени.

#### 3) Важно про совместимость

Сейчас action формы в UI (`addWish`) и action в Apps Script (`add_nts_feedback`) различаются. Для корректной записи в таблицу нужно привести контракт к одному формату (см. Roadmap).

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
- `app.js` - загрузка данных из нескольких листов, фильтры, реестр, воронка, календарь грантов и отправка пожеланий НТС.
- `google-apps-script.gs` - backend Apps Script с `doGet/doPost`, операциями по проектам/пакету/НТС и журналом действий.
- `.nojekyll` - отключает обработку Jekyll на GitHub Pages.
- `robots.txt` - разрешает индексацию опубликованного сайта.

## Accessibility checklist

Перед релизом UI-правок проверьте:

- У всех `input`, `select`, `textarea` есть явный `<label for="...">`.
- Для динамических статусных сообщений используется `role="status"` и `aria-live="polite"` (при необходимости `aria-atomic="true"`).
- Для кнопок раскрытия/меню синхронизируются `aria-controls` и `aria-expanded`.
- Интерактивные элементы (`a`, `button`, поля форм) имеют заметный `:focus-visible`.
- Навигация по форме и основным сценариям работает с клавиатуры без мыши.
