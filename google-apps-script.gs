const CONFIG = {
  SHEET_ID: '1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60',
  CONFIRM_CODE: '11111111',
  FORM_KEY: 'NTS_TECHNOPARK_2026',
  HEADER_ROW: 4,
  NTS_HEADER_ROW: 4,
  NTS_FIRST_DATA_ROW: 5,
  SHEETS: {
    projects: 'Реестр проектов',
    grants: 'Актуальные гранты',
    packages: 'Пакет подачи',
    actions: 'Журнал действий',
    ntsFeedback: 'Пожелания НТС'
  }
};

function doGet(e) {
  const action = getParam_(e, 'action') || 'health';
  try {
    if (action === 'health') return json_({ ok: true, service: 'Technopark RGSU Project Registry', time: new Date().toISOString() });
    if (action === 'bootstrap') return json_(getBootstrap_());
    if (action === 'projects') return json_({ ok: true, projects: getProjects_() });
    if (action === 'grants') return json_({ ok: true, grants: getGrants_() });
    if (action === 'packages') return json_({ ok: true, packages: getPackages_() });
    if (action === 'list_nts_feedback') return json_({ ok: true, feedback: listNtsFeedback_(e.parameter || {}) });
    return json_({ ok: false, error: 'Unknown action: ' + action });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    const isLegacyNtsAction = payload.action === 'addWish';
    if (isLegacyNtsAction) {
      logDeprecatedPath_('addWish', 'add_nts_feedback', payload);
    }
    const isProjectAction = ['add_project', 'update_project', 'add_package_row', 'update_package', 'update_nts_feedback_status'].indexOf(payload.action) >= 0;
    const isNtsForm = payload.action === 'add_nts_feedback' || isLegacyNtsAction || payload.formKey === CONFIG.FORM_KEY;

    if (isProjectAction && String(payload.confirmCode || '') !== CONFIG.CONFIRM_CODE) {
      return json_({ ok: false, error: 'Неверный код подтверждения' });
    }

    if (isNtsForm && String(payload.confirmCode || '') !== CONFIG.CONFIRM_CODE && String(payload.formKey || '') !== CONFIG.FORM_KEY) {
      return json_({ ok: false, error: 'Неверный ключ формы НТС' });
    }

    const action = (payload.action === 'addWish' ? 'add_nts_feedback' : payload.action) || (isNtsForm ? 'add_nts_feedback' : '');
    if (action === 'add_project') return json_(addProject_(payload));
    if (action === 'update_project') return json_(updateProject_(payload));
    if (action === 'add_package_row') return json_(addPackageRow_(payload));
    if (action === 'update_package') return json_(updatePackage_(payload));
    if (action === 'add_nts_feedback') return json_(addNtsFeedback_(payload));
    if (action === 'update_nts_feedback_status') return json_(updateNtsFeedbackStatus_(payload));
    return json_({ ok: false, error: 'Unknown action: ' + action });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function logDeprecatedPath_(oldAction, nextAction, payload) {
  console.warn('Deprecated action used: ' + oldAction + '. Use `' + nextAction + '` instead. Source=' + (payload.source || 'unknown'));
}

function setupSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let actions = ss.getSheetByName(CONFIG.SHEETS.actions);
  if (!actions) actions = ss.insertSheet(CONFIG.SHEETS.actions);
  if (actions.getLastRow() === 0) {
    actions.appendRow(['Дата', 'Действие', 'ID', 'Проект', 'Статус', 'Следующее действие', 'Пользователь']);
    actions.setFrozenRows(1);
  }
  ensureNtsFeedbackSheet_();
  return 'Готово';
}

function getBootstrap_() {
  const projects = getProjects_();
  const grants = getGrants_();
  const packages = getPackages_();
  return {
    ok: true,
    projects,
    grants,
    packages,
    summary: {
      total: projects.length,
      high: projects.filter(p => p.priority === 'Высокий').length,
      ready: projects.filter(p => String(p.status || '').toLowerCase().indexOf('упаков') >= 0).length,
      grants: grants.length
    }
  };
}

function getProjects_() {
  const rows = readTable_(CONFIG.SHEETS.projects, CONFIG.HEADER_ROW);
  return rows.filter(row => row['ID'] || row['Проект']).map(row => ({
    id: row['ID'] || '',
    project: row['Проект'] || '',
    direction: row['Направление'] || '',
    contour: row['Контур'] || '',
    priority: row['Приоритет'] || '',
    trl: row['УТГ'] || '',
    stage: row['Стадия'] || '',
    owner: row['Ответственный'] || '',
    funding: row['Маршрут финансирования'] || '',
    window: row['Ближайшее окно'] || '',
    limit: row['Лимит / ориентир'] || '',
    nextAction: row['Следующее действие'] || '',
    deadline: toIso_(row['Срок'] || ''),
    readiness: row['Готовность пакета'] || '',
    status: row['Статус'] || '',
    note: row['Блокер / примечание'] || ''
  }));
}

function getGrants_() {
  const rows = readTable_(CONFIG.SHEETS.grants, CONFIG.HEADER_ROW);
  return rows.filter(row => row['Маршрут']).map(row => ({
    route: row['Маршрут'] || '',
    operator: row['Оператор'] || '',
    purpose: row['Для чего подходит'] || '',
    applicant: row['Кто подает'] || '',
    funding: row['Финансирование'] || '',
    window: row['Окно / статус на 27.04.2026'] || row['Окно / статус'] || '',
    projects: row['Проекты из реестра'] || '',
    firstStep: row['Что подготовить первым'] || '',
    source: row['Источник'] || '',
    checked: row['Дата проверки'] || ''
  }));
}

function getPackages_() {
  const rows = readTable_(CONFIG.SHEETS.packages, CONFIG.HEADER_ROW);
  return rows.filter(row => row['ID'] || row['Проект']).map(row => ({
    id: row['ID'] || '',
    project: row['Проект'] || '',
    route: row['Маршрут'] || '',
    owner: row['Ответственный'] || '',
    passport: row['Паспорт'] || '',
    problem: row['Проблема и эффект'] || '',
    mvp: row['MVP / прототип'] || '',
    pilot: row['Пилот / письма'] || '',
    estimate: row['Смета'] || '',
    presentation: row['Презентация'] || '',
    legal: row['Юрконтур'] || '',
    readiness: row['Готовность'] || '',
    deadline: toIso_(row['Срок'] || ''),
    nextAction: row['Следующий шаг'] || ''
  }));
}

function addProject_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEETS.projects);
    if (!sheet) throw new Error('Не найден лист: ' + CONFIG.SHEETS.projects);
    const row = nextProjectRow_(sheet);
    const id = payload.id || makeId_();
    setProjectCells_(sheet, row, {
      'ID': id,
      'Проект': payload.project || payload.name || '',
      'Направление': payload.direction || '',
      'Контур': payload.contour || 'Основной',
      'Приоритет': payload.priority || 'Средний',
      'УТГ': payload.trl || '',
      'Стадия': payload.stage || 'Новый',
      'Ответственный': payload.owner || '',
      'Маршрут финансирования': payload.funding || payload.grant || '',
      'Ближайшее окно': payload.window || '',
      'Лимит / ориентир': payload.limit || payload.budget || '',
      'Следующее действие': payload.nextAction || '',
      'Срок': payload.deadline ? new Date(payload.deadline) : '',
      'Готовность пакета': payload.readiness || '0%',
      'Статус': payload.status || 'Новый',
      'Блокер / примечание': payload.note || ''
    });
    logAction_('Добавлен проект', id, payload.project || payload.name || '', payload.status || 'Новый', payload.nextAction || '');
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

function updateProject_(payload) {
  if (!payload.id) throw new Error('Не указан ID проекта');
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.projects);
  if (!sheet) throw new Error('Не найден лист: ' + CONFIG.SHEETS.projects);
  const headers = getHeaders_(sheet, CONFIG.HEADER_ROW);
  const idCol = headers.indexOf('ID') + 1;
  if (!idCol) throw new Error('Не найдена колонка ID');
  const values = sheet.getRange(CONFIG.HEADER_ROW + 1, idCol, Math.max(sheet.getLastRow() - CONFIG.HEADER_ROW, 1), 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(payload.id)) {
      targetRow = CONFIG.HEADER_ROW + 1 + i;
      break;
    }
  }
  if (targetRow < 0) throw new Error('Проект не найден: ' + payload.id);
  const patch = {};
  if (payload.project !== undefined || payload.name !== undefined) patch['Проект'] = payload.project || payload.name || '';
  if (payload.direction !== undefined) patch['Направление'] = payload.direction;
  if (payload.contour !== undefined) patch['Контур'] = payload.contour;
  if (payload.priority !== undefined) patch['Приоритет'] = payload.priority;
  if (payload.trl !== undefined) patch['УТГ'] = payload.trl;
  if (payload.stage !== undefined) patch['Стадия'] = payload.stage;
  if (payload.owner !== undefined) patch['Ответственный'] = payload.owner;
  if (payload.funding !== undefined || payload.grant !== undefined) patch['Маршрут финансирования'] = payload.funding || payload.grant || '';
  if (payload.budget !== undefined || payload.limit !== undefined) patch['Лимит / ориентир'] = payload.budget || payload.limit || '';
  if (payload.status !== undefined) patch['Статус'] = payload.status;
  if (payload.nextAction !== undefined) patch['Следующее действие'] = payload.nextAction;
  if (payload.deadline !== undefined) patch['Срок'] = payload.deadline ? new Date(payload.deadline) : '';
  if (payload.readiness !== undefined) patch['Готовность пакета'] = payload.readiness;
  if (payload.note !== undefined) patch['Блокер / примечание'] = payload.note;
  setProjectCells_(sheet, targetRow, patch);
  logAction_('Обновлен проект', payload.id, payload.project || '', payload.status || '', payload.nextAction || '');
  return { ok: true, id: payload.id };
}

function addPackageRow_(payload) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.packages);
  if (!sheet) throw new Error('Не найден лист: ' + CONFIG.SHEETS.packages);
  sheet.appendRow([
    payload.id || '',
    payload.project || '',
    payload.route || '',
    payload.owner || '',
    payload.passport || 'Нет',
    payload.problem || 'Нет',
    payload.mvp || 'Нет',
    payload.pilot || 'Нет',
    payload.estimate || 'Нет',
    payload.presentation || 'Нет',
    payload.legal || 'Нет',
    payload.readiness || '0%',
    payload.deadline ? new Date(payload.deadline) : '',
    payload.nextAction || ''
  ]);
  return { ok: true };
}

function updatePackage_(payload) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.packages);
  if (!sheet) throw new Error('Не найден лист: ' + CONFIG.SHEETS.packages);
  const headers = getHeaders_(sheet, CONFIG.HEADER_ROW);
  const idCol = headers.indexOf('ID') + 1;
  const projectCol = headers.indexOf('Проект') + 1;
  if (!idCol && !projectCol) throw new Error('Не найдены колонки ID или Проект');

  const rowCount = Math.max(sheet.getLastRow() - CONFIG.HEADER_ROW, 1);
  const values = sheet.getRange(CONFIG.HEADER_ROW + 1, 1, rowCount, Math.max(sheet.getLastColumn(), 1)).getValues();
  let targetRow = -1;
  for (let i = 0; i < values.length; i++) {
    const idValue = idCol ? values[i][idCol - 1] : '';
    const projectValue = projectCol ? values[i][projectCol - 1] : '';
    if ((payload.id && String(idValue) === String(payload.id)) || (payload.project && String(projectValue) === String(payload.project))) {
      targetRow = CONFIG.HEADER_ROW + 1 + i;
      break;
    }
  }

  if (targetRow < 0) return addPackageRow_(payload);

  const patch = {};
  if (payload.id !== undefined) patch['ID'] = payload.id;
  if (payload.project !== undefined) patch['Проект'] = payload.project;
  if (payload.route !== undefined) patch['Маршрут'] = payload.route;
  if (payload.owner !== undefined) patch['Ответственный'] = payload.owner;
  if (payload.passport !== undefined) patch['Паспорт'] = payload.passport;
  if (payload.problem !== undefined) patch['Проблема и эффект'] = payload.problem;
  if (payload.mvp !== undefined) patch['MVP / прототип'] = payload.mvp;
  if (payload.pilot !== undefined) patch['Пилот / письма'] = payload.pilot;
  if (payload.estimate !== undefined) patch['Смета'] = payload.estimate;
  if (payload.presentation !== undefined) patch['Презентация'] = payload.presentation;
  if (payload.legal !== undefined) patch['Юрконтур'] = payload.legal;
  if (payload.readiness !== undefined) patch['Готовность'] = payload.readiness;
  if (payload.nextStep !== undefined) patch['Следующий шаг'] = payload.nextStep;
  setProjectCells_(sheet, targetRow, patch);
  logAction_('Обновлен пакет подачи', payload.id || '', payload.project || '', payload.readiness || '', payload.nextStep || '');
  return { ok: true, id: payload.id || '' };
}

function ensureNtsFeedbackSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEETS.ntsFeedback);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.ntsFeedback);

  const headers = getNtsHeaders_();
  sheet.getRange(1, 1).setValue('Пожелания НТС');
  sheet.getRange(2, 1).setValue('Лист для автоматического сбора предложений, замечаний и решений членов Научно-технического совета через сайт Технопарка РГСУ.');
  sheet.getRange(CONFIG.NTS_HEADER_ROW, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(CONFIG.NTS_HEADER_ROW);
  sheet.getRange(CONFIG.NTS_HEADER_ROW, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8eefc');
  return sheet;
}

function getNtsHeaders_() {
  return [
    'ID',
    'Дата и время',
    'ФИО / автор',
    'Роль / организация',
    'Контакт',
    'Тип обращения',
    'Связанный проект',
    'Раздел сайта',
    'Приоритет',
    'Текст пожелания',
    'Предложенное решение',
    'Статус',
    'Ответственный',
    'Комментарий руководителя',
    'Источник',
    'UserAgent',
    'IP/тех.метка',
    'Служебный ключ'
  ];
}

function addNtsFeedback_(payload) {
  if (!payload.author) throw new Error('Укажите автора пожелания');
  if (!payload.message) throw new Error('Укажите текст пожелания');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureNtsFeedbackSheet_();
    const row = nextNtsFeedbackRow_(sheet);
    const id = payload.id || makeNtsId_();
    const values = [
      id,
      new Date(),
      payload.author || '',
      payload.role || '',
      payload.contact || '',
      payload.type || payload.category || 'Идея',
      payload.project || payload.projectName || '',
      payload.section || 'Пожелания НТС',
      payload.priority || 'Средний',
      payload.message || '',
      payload.solution || '',
      payload.status || 'Новое',
      payload.responsible || payload.responseOwner || '',
      payload.comment || payload.response || '',
      payload.source || 'site',
      payload.userAgent || '',
      payload.clientMark || payload.ip || '',
      payload.formKey || ''
    ];
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    logAction_('Добавлено пожелание НТС', id, payload.project || payload.projectName || '', payload.status || 'Новое', payload.message || '');
    return { ok: true, success: true, id, row };
  } finally {
    lock.releaseLock();
  }
}

function nextNtsFeedbackRow_(sheet) {
  const first = CONFIG.NTS_FIRST_DATA_ROW;
  const maxRows = Math.max(sheet.getMaxRows(), first);
  const rowCount = maxRows - first + 1;
  const values = sheet.getRange(first, 1, rowCount, 10).getValues();
  for (let i = 0; i < values.length; i++) {
    const id = values[i][0];
    const author = values[i][2];
    const message = values[i][9];
    if (!id && !author && !message) return first + i;
  }
  sheet.insertRowsAfter(maxRows, 100);
  return maxRows + 1;
}

function listNtsFeedback_(params) {
  const sheet = ensureNtsFeedbackSheet_();
  const lastRow = sheet.getLastRow();
  const first = CONFIG.NTS_FIRST_DATA_ROW;
  if (lastRow < first) return [];
  const headers = getNtsHeaders_();
  const rowCount = lastRow - first + 1;
  const rows = sheet.getRange(first, 1, rowCount, headers.length).getValues();
  const projectFilter = String(params.projectName || params.project || '').trim().toLowerCase();

  return rows.map((row, index) => {
    const item = {};
    headers.forEach((header, col) => item[header] = row[col]);
    return {
      id: String(item['ID'] || first + index),
      rowId: String(first + index),
      createdAt: item['Дата и время'] instanceof Date ? item['Дата и время'].toISOString() : String(item['Дата и время'] || ''),
      author: item['ФИО / автор'] || '',
      role: item['Роль / организация'] || '',
      contact: item['Контакт'] || '',
      project: item['Связанный проект'] || '',
      category: item['Тип обращения'] || '',
      priority: item['Приоритет'] || '',
      message: item['Текст пожелания'] || '',
      solution: item['Предложенное решение'] || '',
      status: item['Статус'] || 'Новое',
      responsible: item['Ответственный'] || '',
      response: item['Комментарий руководителя'] || '',
      source: item['Источник'] || ''
    };
  }).filter(item => item.author || item.message)
    .filter(item => !projectFilter || String(item.project || '').toLowerCase() === projectFilter)
    .reverse()
    .slice(0, Number(params.limit || 100));
}

function updateNtsFeedbackStatus_(payload) {
  if (!payload.rowId) throw new Error('Не указан rowId');
  const sheet = ensureNtsFeedbackSheet_();
  const row = Number(payload.rowId);
  if (!row || row < CONFIG.NTS_FIRST_DATA_ROW) throw new Error('Некорректный rowId');
  const headers = getNtsHeaders_();
  const statusCol = headers.indexOf('Статус') + 1;
  const responseCol = headers.indexOf('Комментарий руководителя') + 1;
  const responsibleCol = headers.indexOf('Ответственный') + 1;
  if (statusCol && payload.status !== undefined) sheet.getRange(row, statusCol).setValue(payload.status);
  if (responseCol && payload.response !== undefined) sheet.getRange(row, responseCol).setValue(payload.response);
  if (responsibleCol && payload.responsible !== undefined) sheet.getRange(row, responsibleCol).setValue(payload.responsible);
  return { ok: true, rowId: row };
}

function nextProjectRow_(sheet) {
  const last = sheet.getLastRow();
  return Math.max(last + 1, CONFIG.HEADER_ROW + 1);
}

function setProjectCells_(sheet, row, data) {
  const headers = getHeaders_(sheet, CONFIG.HEADER_ROW);
  Object.keys(data).forEach(key => {
    const col = headers.indexOf(key) + 1;
    if (col > 0) sheet.getRange(row, col).setValue(data[key]);
  });
}

function readTable_(sheetName, headerRow) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= headerRow) return [];
  const headers = getHeaders_(sheet, headerRow);
  const values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) obj[header] = normalizeCell_(row[index]);
      });
      return obj;
    });
}

function getHeaders_(sheet, headerRow) {
  return sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

function normalizeCell_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value === null || value === undefined ? '' : String(value);
}

function toIso_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  return raw;
}

function makeId_() {
  return 'ТП-2026-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss');
}

function makeNtsId_() {
  return 'NTS-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 9000 + 1000);
}

function logAction_(action, id, project, status, nextAction) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEETS.actions);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.actions);
    sheet.appendRow(['Дата', 'Действие', 'ID', 'Проект', 'Статус', 'Следующее действие', 'Пользователь']);
  }
  sheet.appendRow([new Date(), action, id, project, status, nextAction, Session.getActiveUser().getEmail() || 'web']);
}

function getParam_(e, name) {
  return e && e.parameter && e.parameter[name] ? e.parameter[name] : '';
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
