const SPREADSHEET_ID = '1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60';

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';

    if (action === 'projects') {
      return jsonResponse({ ok: true, source: 'google-sheets', items: getProjects() });
    }

    if (action === 'grants') {
      return jsonResponse({ ok: true, source: 'google-sheets', items: getGrants() });
    }

    return jsonResponse({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const payload = parseJsonBody_(e);
    if (payload.action !== 'feedback') {
      return jsonResponse({ ok: false, error: 'Unsupported action' });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateFeedbackSheet_(ss);
    sheet.appendRow([
      new Date(),
      payload.fio || '',
      payload.role || '',
      payload.project || '',
      payload.priority || '',
      payload.message || '',
      payload.createdAt || ''
    ]);

    return jsonResponse({ ok: true, source: 'google-sheets' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function getProjects() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = findSheetByNamesOrHeaders_(
    ss,
    ['Проекты', 'Реестр проектов', 'Реестр'],
    ['ID', 'Проект']
  );

  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  return rows
    .filter(function (row) {
      return getByAliases_(headers, row, ['ID']) || getByAliases_(headers, row, ['Проект', 'Название проекта']);
    })
    .map(function (row) {
      return {
        id: getByAliases_(headers, row, ['ID']),
        title: getByAliases_(headers, row, ['Проект', 'Название проекта']),
        manager: getByAliases_(headers, row, ['Ответственный', 'Руководитель']),
        stage: getByAliases_(headers, row, ['Стадия', 'Этап']),
        status: getByAliases_(headers, row, ['Статус']),
        readiness: getByAliases_(headers, row, ['Готовность пакета', 'Готовность', 'Готовность, %']),
        nextAction: getByAliases_(headers, row, ['Следующее действие', 'Ближайшее действие']),
        nextActionDate: getByAliases_(headers, row, ['Срок', 'Дата ближайшего действия']),
        risk: getByAliases_(headers, row, ['Риск', 'Приоритет']),
        grants: getByAliases_(headers, row, ['Маршрут финансирования', 'Подходящие гранты', 'Гранты']),
        blocker: getByAliases_(headers, row, ['Блокер / примечание', 'Блокер', 'Примечание']),

        direction: getByAliases_(headers, row, ['Направление']),
        contour: getByAliases_(headers, row, ['Контур']),
        priority: getByAliases_(headers, row, ['Приоритет']),
        utg: getByAliases_(headers, row, ['УТГ']),
        nearestGrantWindow: getByAliases_(headers, row, ['Ближайшее окно']),
        fundingLimit: getByAliases_(headers, row, ['Лимит / ориентир']),

        hasPassport: toBooleanOrDefault_(getByAliases_(headers, row, ['Паспорт проекта']), false),
        hasTZ: toBooleanOrDefault_(getByAliases_(headers, row, ['ТЗ']), false),
        hasBudget: toBooleanOrDefault_(getByAliases_(headers, row, ['Бюджет']), false),
        needsDecision: toBooleanOrDefault_(getByAliases_(headers, row, ['Требует решения руководителя']), false)
      };
    });
}

function getGrants() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = findSheetByNamesOrHeaders_(
    ss,
    ['Гранты', 'Грантовые маршруты', 'database'],
    ['Маршрут', 'Оператор']
  );

  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  return rows
    .filter(function (row) {
      return getByAliases_(headers, row, ['Маршрут']);
    })
    .map(function (row) {
      return {
        title: getByAliases_(headers, row, ['Маршрут']),
        operator: getByAliases_(headers, row, ['Оператор']),
        purpose: getByAliases_(headers, row, ['Для чего подходит']),
        applicant: getByAliases_(headers, row, ['Кто подает']),
        funding: getByAliases_(headers, row, ['Финансирование']),
        window: getByAliases_(headers, row, ['Окно / статус на 27.04.2026', 'Окно', 'Статус окна']),
        projects: getByAliases_(headers, row, ['Проекты из реестра']),
        firstStep: getByAliases_(headers, row, ['Что подготовить первым']),
        source: getByAliases_(headers, row, ['Источник']),
        checkedAt: getByAliases_(headers, row, ['Дата проверки']),
        planFromJune: getByAliases_(headers, row, ['План подачи с 1 июня 2026']),
        confidence: getByAliases_(headers, row, ['Уверенность / что перепроверить'])
      };
    });
}

function testProjects() {
  const projects = getProjects();
  Logger.log('projects count: %s', projects.length);
  Logger.log('first project: %s', JSON.stringify(projects[0] || {}));
}

function testGrants() {
  const grants = getGrants();
  Logger.log('grants count: %s', grants.length);
  Logger.log('first grant: %s', JSON.stringify(grants[0] || {}));
}

function findSheetByNamesOrHeaders_(ss, preferredNames, requiredHeaders) {
  for (var i = 0; i < preferredNames.length; i++) {
    var byName = ss.getSheetByName(preferredNames[i]);
    if (byName) return byName;
  }

  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var sheet = sheets[j];
    var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
    if (lastCol === 0) continue;
    var headerRow = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    if (hasHeaders_(headerRow, requiredHeaders)) return sheet;
  }

  return null;
}

function hasHeaders_(headerRow, requiredHeaders) {
  var normalized = headerRow.map(normalizeHeader_);
  return requiredHeaders.every(function (required) {
    return normalized.indexOf(normalizeHeader_(required)) !== -1;
  });
}

function getByAliases_(headers, row, aliases) {
  var normalizedHeaders = headers.map(normalizeHeader_);
  for (var i = 0; i < aliases.length; i++) {
    var target = normalizeHeader_(aliases[i]);
    var index = normalizedHeaders.indexOf(target);
    if (index !== -1) {
      return (row[index] || '').toString().trim();
    }
  }
  return '';
}

function normalizeHeader_(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toBooleanOrDefault_(value, fallback) {
  var normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'да', 'yes', 'y', 'есть'].indexOf(normalized) !== -1;
}

function parseJsonBody_(e) {
  var body = (e && e.postData && e.postData.contents) || '{}';
  return JSON.parse(body);
}

function getOrCreateFeedbackSheet_(ss) {
  var sheet = ss.getSheetByName('Пожелания НТС');
  if (sheet) return sheet;

  sheet = ss.insertSheet('Пожелания НТС');
  sheet.appendRow(['Timestamp', 'ФИО', 'Роль', 'Проект', 'Приоритет', 'Пожелание', 'createdAt']);
  return sheet;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
