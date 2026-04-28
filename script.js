const API_CONFIG = {
  enabled: true,
  baseUrl: "https://script.google.com/macros/s/AKfycbwzbWEjEpb1ySylb--7VhqEHvaC05WB5jhcw-8xpAj811bIJurVB3CW-ElDsoeKnWOA/exec",
  endpoints: {
    projects: "?action=projects",
    grants: "?action=grants",
    feedback: "?action=feedback"
  }
};

const DATA_SOURCES = {
  projects: "data/projects.json",
  grants: "data/grants.csv"
};

const FUNNEL_STAGES = ["Идея", "Паспорт проекта", "ТЗ", "Команда", "Бюджет", "Грантовая заявка", "Подано", "Поддержано"];

const DEMO_PROJECTS = [
  {
    id: "TP-001",
    title: "Цифровой наставник студента",
    manager: "А. В. Смирнова",
    stage: "Грантовая заявка",
    status: "Готов к грантам",
    readiness: 88,
    nextAction: "Финализировать смету и письмо поддержки",
    nextActionDate: "2026-05-03",
    risk: "Низкий",
    grants: ["Фонд содействия инновациям", "Старт-1"],
    hasPassport: true,
    hasTZ: true,
    hasBudget: false,
    needsDecision: false
  },
  {
    id: "TP-002",
    title: "VR-тренажер социальной работы",
    manager: "М. П. Крылов",
    stage: "ТЗ",
    status: "Требует доработки",
    readiness: 54,
    nextAction: "Уточнить сценарии симуляций с кафедрой",
    nextActionDate: "2026-05-06",
    risk: "Средний",
    grants: ["Президентский фонд культурных инициатив"],
    hasPassport: true,
    hasTZ: false,
    hasBudget: true,
    needsDecision: false
  },
  {
    id: "TP-003",
    title: "Платформа мониторинга благополучия семей",
    manager: "Е. С. Орлова",
    stage: "Паспорт проекта",
    status: "В зоне риска",
    readiness: 37,
    nextAction: "Назначить владельца бюджета и описать метрики",
    nextActionDate: "2026-04-30",
    risk: "Высокий",
    grants: ["Фонд президентских грантов"],
    hasPassport: true,
    hasTZ: false,
    hasBudget: false,
    needsDecision: true
  },
  {
    id: "TP-004",
    title: "Лаборатория инклюзивных ассистивных технологий",
    manager: "Д. Н. Павлов",
    stage: "Подано",
    status: "Готов к грантам",
    readiness: 96,
    nextAction: "Подготовить ответы на возможные вопросы экспертов",
    nextActionDate: "2026-05-08",
    risk: "Низкий",
    grants: ["Приоритет-2030", "Фонд содействия инновациям"],
    hasPassport: true,
    hasTZ: true,
    hasBudget: true,
    needsDecision: false
  },
  {
    id: "TP-005",
    title: "Аналитика трудоустройства выпускников",
    manager: "Не назначен",
    stage: "Идея",
    status: "Требует решения руководителя",
    readiness: 22,
    nextAction: "Назначить руководителя и подтвердить заказчика",
    nextActionDate: "2026-05-01",
    risk: "Высокий",
    grants: ["Росмолодежь.Гранты"],
    hasPassport: false,
    hasTZ: false,
    hasBudget: false,
    needsDecision: true
  },
  {
    id: "TP-006",
    title: "Социальный навигатор НКО",
    manager: "Н. И. Беляева",
    stage: "Команда",
    status: "В работе",
    readiness: 64,
    nextAction: "Закрепить технического архитектора",
    nextActionDate: "2026-05-10",
    risk: "Средний",
    grants: ["Фонд президентских грантов"],
    hasPassport: true,
    hasTZ: true,
    hasBudget: true,
    needsDecision: false
  },
  {
    id: "TP-007",
    title: "Модуль оценки грантовой готовности",
    manager: "С. Р. Гайнутдинов",
    stage: "Поддержано",
    status: "Готов к грантам",
    readiness: 100,
    nextAction: "Запустить пилот внутри проектного офиса",
    nextActionDate: "2026-05-12",
    risk: "Низкий",
    grants: ["Внутренний конкурс РГСУ"],
    hasPassport: true,
    hasTZ: true,
    hasBudget: true,
    needsDecision: false
  },
  {
    id: "TP-008",
    title: "Маркетплейс практик для студентов",
    manager: "О. А. Данилова",
    stage: "Бюджет",
    status: "Требует доработки",
    readiness: 71,
    nextAction: "Согласовать модель сопровождения партнеров",
    nextActionDate: "2026-05-04",
    risk: "Средний",
    grants: ["Росмолодежь.Гранты", "Приоритет-2030"],
    hasPassport: true,
    hasTZ: true,
    hasBudget: false,
    needsDecision: false
  }
];

const DEMO_GRANTS = [
  {
    title: "ФСИ Старт-1",
    operator: "Фонд содействия инновациям",
    purpose: "Технологический MVP, НИОКР, ранняя коммерциализация",
    applicant: "Физлицо или малое предприятие по условиям конкурса",
    funding: "до 5 млн ₽; 12 месяцев; без софинансирования на первом этапе",
    window: "Актуально: прием заявок по Старт-1 до 01.06.2026",
    projects: ["TP-001", "TP-002"],
    firstStep: "Паспорт проекта, новизна, MVP, рынок, команда, смета, письма пилотов",
    source: "https://www.fasie.ru/programs/programma-start/",
    checkedAt: "27.04.2026",
    planFromJune: "Подавать только готовые пакеты к 01.06",
    confidence: "Высокая"
  }
];

const state = {
  projects: [],
  grants: [],
  dataStatus: {
    projects: { ok: false, message: "" },
    grants: { ok: false, message: "" }
  },
  connection: {
    projects: "demo-данные",
    grants: "demo-данные",
    feedback: API_CONFIG.enabled ? "отправка в таблицу доступна" : "недоступна"
  },
  connectionCounts: {
    projects: 0,
    grants: 0
  },
  notifications: [],
  diagnostics: {
    issues: [],
    filter: "all",
    summary: { total: 0, critical: 0, warnings: 0, recommendations: 0 }
  },
  activeStage: FUNNEL_STAGES[0],
  expandedProjectId: null,
  filters: {
    search: "",
    status: "all",
    readiness: "all",
    risk: "all",
    grant: "all",
    grantOperator: "all"
  }
};

const riskClasses = {
  "Высокий": "tag--red",
  "Средний": "tag--yellow",
  "Низкий": "tag--green"
};

const elements = {
  currentDate: document.getElementById("currentDate"),
  dataStatus: document.getElementById("dataStatus"),
  connectionStatus: document.getElementById("connectionStatus"),
  notifications: document.getElementById("notifications"),
  dataDiagnostics: document.getElementById("dataDiagnostics"),
  diagnosticFilters: document.getElementById("diagnosticFilters"),
  kpiGrid: document.getElementById("kpiGrid"),
  funnelSteps: document.getElementById("funnelSteps"),
  stageDetails: document.getElementById("stageDetails"),
  projectsTable: document.getElementById("projectsTable"),
  emptyProjects: document.getElementById("emptyProjects"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  readinessFilter: document.getElementById("readinessFilter"),
  riskFilter: document.getElementById("riskFilter"),
  grantFilter: document.getElementById("grantFilter"),
  grantOperatorFilter: document.getElementById("grantOperatorFilter"),
  grantCalendar: document.getElementById("grantCalendar"),
  riskList: document.getElementById("riskList"),
  ntsForm: document.getElementById("ntsForm"),
  ntsProjectSelect: document.getElementById("ntsProjectSelect"),
  wishLog: document.getElementById("wishLog")
};

document.addEventListener("DOMContentLoaded", initApp);

// initApp загружает внешние источники данных, настраивает события и запускает первый рендер панели.
async function initApp() {
  elements.currentDate.textContent = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const [projects, grants] = await Promise.all([loadProjects(), loadGrants()]);
  state.projects = projects;
  state.grants = grants;
  fillFilterOptions();
  bindEvents();
  renderAll();
}

// loadProjects получает data/projects.json; если файл недоступен, возвращает резервные demo-проекты.
async function unusedLegacyLoadProjects() {
  try {
    const response = await fetch(DATA_SOURCES.projects, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const projects = await response.json();
    if (!Array.isArray(projects)) throw new Error("projects.json должен содержать массив");
    state.dataStatus.projects = { ok: true, message: "Проекты загружены из data/projects.json" };
    return projects;
  } catch (error) {
    state.dataStatus.projects = { ok: false, message: "Используются demo-проекты: data/projects.json не загрузился" };
    console.warn("Не удалось загрузить проекты:", error);
    return DEMO_PROJECTS;
  }
}

// loadGrants получает data/grants.csv, парсит русские заголовки и нормализует строки в объекты grants.
async function unusedLegacyLoadGrants() {
  try {
    const response = await fetch(DATA_SOURCES.grants, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    const rows = parseCSV(csvText).filter(row => row["Маршрут"]);
    const grants = rows.map(normalizeGrantRow);
    state.dataStatus.grants = { ok: true, message: "Гранты загружены из data/grants.csv" };
    return grants;
  } catch (error) {
    state.dataStatus.grants = { ok: false, message: "Используются demo-гранты: data/grants.csv не загрузился" };
    console.warn("Не удалось загрузить гранты:", error);
    return DEMO_GRANTS;
  }
}

// parseCSV разбирает CSV с кавычками, переносами строк, запятыми, точками с запятой и пустыми ячейками.
function parseCSV(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(normalized);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);

  const headers = rows.shift() || [];
  return rows.map(values => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] || "";
    });
    return entry;
  });
}

// normalizeGrantRow переводит строку CSV с русскими заголовками в стабильную структуру объекта гранта.
function unusedLegacyNormalizeGrantRow(row) {
  return {
    title: row["Маршрут"] || "",
    operator: row["Оператор"] || "",
    purpose: row["Для чего подходит"] || "",
    applicant: row["Кто подает"] || "",
    funding: row["Финансирование"] || "",
    window: row["Окно / статус на 27.04.2026"] || "",
    projects: splitProjects(row["Проекты из реестра"]),
    firstStep: row["Что подготовить первым"] || "",
    source: row["Источник"] || "",
    checkedAt: row["Дата проверки"] || "",
    planFromJune: row["План подачи с 1 июня 2026"] || "",
    confidence: row["Уверенность / что перепроверить"] || ""
  };
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

function splitProjects(value) {
  return (value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

// fetchFromApi выполняет безопасный запрос к Google Apps Script, добавляя _ts для cache-busting.
async function fetchFromApi(endpoint, options = {}) {
  if (!API_CONFIG.enabled) throw new Error("API disabled");
  const method = (options.method || "GET").toUpperCase();
  const url = method === "GET" ? appendTsParam(`${API_CONFIG.baseUrl}${endpoint}`) : `${API_CONFIG.baseUrl}${endpoint}`;
  const response = await fetch(url, {
    cache: "no-store",
    ...options
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// loadProjects сначала пробует Google Таблицу через Apps Script, потом data/projects.json, потом DEMO_PROJECTS.
async function loadProjects() {
  try {
    const apiData = await fetchFromApi(API_CONFIG.endpoints.projects);
    const projects = getApiItems(apiData, "projects").map(normalizeProject);
    if (!projects.length) throw new Error("API returned empty projects");
    state.connection.projects = "Google Таблица";
    state.connectionCounts.projects = projects.length;
    state.dataStatus.projects = { ok: true, message: "Проекты загружены из Google Таблицы" };
    addNotification("success", "Проекты загружены из Google Таблицы");
    return projects;
  } catch (apiError) {
    console.warn("API projects unavailable:", apiError);
    addNotification("warning", "Ошибка API проектов. Переход на локальный файл");
  }

  try {
    const response = await fetch(DATA_SOURCES.projects, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawProjects = await response.json();
    if (!Array.isArray(rawProjects)) throw new Error("projects.json must contain array");
    const projects = rawProjects.map(normalizeProject);
    state.connection.projects = "локальный файл";
    state.connectionCounts.projects = projects.length;
    state.dataStatus.projects = { ok: true, message: "Проекты загружены из data/projects.json" };
    addNotification("success", "Проекты загружены из локального файла");
    return projects;
  } catch (localError) {
    console.warn("Local projects unavailable:", localError);
    state.connection.projects = "demo-данные";
    state.dataStatus.projects = { ok: false, message: "Используются demo-проекты" };
    addNotification("warning", "Локальный файл проектов недоступен. Используются demo-данные");
    const demoProjects = DEMO_PROJECTS.map(normalizeProject);
    state.connectionCounts.projects = demoProjects.length;
    return demoProjects;
  }
}

// loadGrants сначала пробует Google Таблицу через Apps Script, потом data/grants.csv, потом DEMO_GRANTS.
async function loadGrants() {
  try {
    const apiData = await fetchFromApi(API_CONFIG.endpoints.grants);
    const grants = getApiItems(apiData, "grants").map(normalizeGrant);
    if (!grants.length) throw new Error("API returned empty grants");
    state.connection.grants = "Google Таблица";
    state.connectionCounts.grants = grants.length;
    state.dataStatus.grants = { ok: true, message: "Гранты загружены из Google Таблицы" };
    addNotification("success", "Гранты загружены из Google Таблицы");
    return grants;
  } catch (apiError) {
    console.warn("API grants unavailable:", apiError);
    addNotification("warning", "Ошибка API грантов. Переход на локальный файл");
  }

  try {
    const response = await fetch(DATA_SOURCES.grants, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    const rows = parseCSV(csvText).filter(row => row["Маршрут"] || row["РњР°СЂС€СЂСѓС‚"]);
    const grants = rows.map(normalizeGrantRow);
    state.connection.grants = "локальный файл";
    state.connectionCounts.grants = grants.length;
    state.dataStatus.grants = { ok: true, message: "Гранты загружены из data/grants.csv" };
    addNotification("success", "Гранты загружены из локального файла");
    return grants;
  } catch (localError) {
    console.warn("Local grants unavailable:", localError);
    state.connection.grants = "demo-данные";
    state.dataStatus.grants = { ok: false, message: "Используются demo-гранты" };
    addNotification("warning", "Локальный файл грантов недоступен. Используются demo-данные");
    const demoGrants = DEMO_GRANTS.map(normalizeGrant);
    state.connectionCounts.grants = demoGrants.length;
    return demoGrants;
  }
}


function appendTsParam(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_ts=${Date.now()}`;
}

function extractArray(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload[key])) return payload[key];
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return extractArray(parsed, key);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeProject(project) {
  return {
    id: project.id || project.ID || "",
    title: project.title || project.name || project["Проект"] || project["Название проекта"] || "",
    manager: project.manager || project.leader || project["Ответственный"] || project["Руководитель"] || project["ФИО руководителя"] || "Не назначен",
    stage: project.stage || project["Стадия"] || project["Этап"] || "Идея",
    status: project.status || project["Статус"] || "В работе",
    readiness: Number(project.readiness ?? project["Готовность пакета"] ?? project["Готовность"] ?? project["Готовность, %"] ?? 0),
    nextAction: project.nextAction || project["Следующее действие"] || project["Ближайшее действие"] || "",
    nextActionDate: project.nextActionDate || project["Срок"] || project["Дата ближайшего действия"] || "",
    risk: normalizeRisk(project.risk || project["Риск"] || project["Приоритет"]),
    grants: Array.isArray(project.grants) ? project.grants : splitProjects(project.grants || project["Маршрут финансирования"] || project["Подходящие гранты"]),
    blocker: project.blocker || project["Блокер / примечание"] || project["Блокер"] || project["Примечание"] || "",
    direction: project.direction || project["Направление"] || "",
    contour: project.contour || project["Контур"] || "",
    priority: project.priority || project["Приоритет"] || "",
    utg: project.utg || project["УТГ"] || "",
    nearestGrantWindow: project.nearestGrantWindow || project["Ближайшее окно"] || "",
    fundingLimit: project.fundingLimit || project["Лимит / ориентир"] || "",
    hasPassport: normalizeBoolean(project.hasPassport ?? project["Паспорт проекта"]),
    hasTZ: normalizeBoolean(project.hasTZ ?? project["ТЗ"]),
    hasBudget: normalizeBoolean(project.hasBudget ?? project["Бюджет"]),
    needsDecision: normalizeBoolean(project.needsDecision ?? project["Требует решения руководителя"])
  };
}

function getApiItems(payload, key) {
  if (Array.isArray(payload)) return payload;

  if (typeof payload === "string") {
    try {
      return getApiItems(JSON.parse(payload), key);
    } catch {
      return [];
    }
  }

  if (!payload || typeof payload !== "object") return [];

  if (payload.ok === false) {
    throw new Error(payload.error || `API ${key} error`);
  }

  if (payload.ok === true && Array.isArray(payload.items)) return payload.items;

  return extractArray(payload, key);
}

function normalizeGrant(grant) {
  if (grant["Маршрут"] || grant["РњР°СЂС€СЂСѓС‚"]) return normalizeGrantRow(grant);
  return {
    title: grant.title || grant.name || "",
    operator: grant.operator || "",
    purpose: grant.purpose || "",
    applicant: grant.applicant || "",
    funding: grant.funding || "",
    window: grant.window || "",
    projects: Array.isArray(grant.projects) ? grant.projects : splitProjects(grant.projects),
    firstStep: grant.firstStep || "",
    source: grant.source || "",
    checkedAt: grant.checkedAt || "",
    planFromJune: grant.planFromJune || "",
    confidence: grant.confidence || ""
  };
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "да", "есть", "yes", "y"].includes(normalized);
}

function normalizeRisk(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["high", "высокий"].includes(normalized)) return "Высокий";
  if (["medium", "средний"].includes(normalized)) return "Средний";
  if (["low", "низкий"].includes(normalized)) return "Низкий";
  return value || "";
}

function normalizeGrantRow(row) {
  return {
    title: row["Маршрут"] || row["РњР°СЂС€СЂСѓС‚"] || "",
    operator: row["Оператор"] || row["РћРїРµСЂР°С‚РѕСЂ"] || "",
    purpose: row["Для чего подходит"] || row["Р”Р»СЏ С‡РµРіРѕ РїРѕРґС…РѕРґРёС‚"] || "",
    applicant: row["Кто подает"] || row["РљС‚Рѕ РїРѕРґР°РµС‚"] || "",
    funding: row["Финансирование"] || row["Р¤РёРЅР°РЅСЃРёСЂРѕРІР°РЅРёРµ"] || "",
    window: row["Окно / статус на 27.04.2026"] || row["РћРєРЅРѕ / СЃС‚Р°С‚СѓСЃ РЅР° 27.04.2026"] || "",
    projects: splitProjects(row["Проекты из реестра"] || row["РџСЂРѕРµРєС‚С‹ РёР· СЂРµРµСЃС‚СЂР°"]),
    firstStep: row["Что подготовить первым"] || row["Р§С‚Рѕ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ РїРµСЂРІС‹Рј"] || "",
    source: row["Источник"] || row["РСЃС‚РѕС‡РЅРёРє"] || "",
    checkedAt: row["Дата проверки"] || row["Р”Р°С‚Р° РїСЂРѕРІРµСЂРєРё"] || "",
    planFromJune: row["План подачи с 1 июня 2026"] || row["РџР»Р°РЅ РїРѕРґР°С‡Рё СЃ 1 РёСЋРЅСЏ 2026"] || "",
    confidence: row["Уверенность / что перепроверить"] || row["РЈРІРµСЂРµРЅРЅРѕСЃС‚СЊ / С‡С‚Рѕ РїРµСЂРµРїСЂРѕРІРµСЂРёС‚СЊ"] || ""
  };
}

function bindEvents() {
  elements.searchInput.addEventListener("input", event => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderProjects();
  });

  [elements.statusFilter, elements.readinessFilter, elements.riskFilter, elements.grantFilter].forEach(select => {
    select.addEventListener("change", event => {
      const key = event.target.id.replace("Filter", "");
      state.filters[key] = event.target.value;
      renderProjects();
    });
  });

  elements.grantOperatorFilter.addEventListener("change", event => {
    state.filters.grantOperator = event.target.value;
    renderGrants();
  });

  elements.ntsForm.addEventListener("submit", handleWishSubmit);

  elements.diagnosticFilters.addEventListener("click", event => {
    const button = event.target.closest("[data-diagnostic-filter]");
    if (!button) return;
    filterDiagnostics(button.dataset.diagnosticFilter);
  });
}

function fillFilterOptions() {
  resetSelect(elements.statusFilter, "all", "Все статусы");
  resetSelect(elements.grantFilter, "all", "Все гранты");
  resetSelect(elements.grantOperatorFilter, "all", "Все операторы");

  unique(state.projects.map(project => project.status)).forEach(status => elements.statusFilter.append(new Option(status, status)));
  unique(state.projects.flatMap(project => project.grants)).forEach(grant => elements.grantFilter.append(new Option(grant, grant)));
  unique(state.grants.map(grant => grant.operator)).forEach(operator => elements.grantOperatorFilter.append(new Option(operator, operator)));

  elements.ntsProjectSelect.innerHTML = state.projects
    .map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.id)} · ${escapeHtml(project.title)}</option>`)
    .join("");
}

function resetSelect(select, value, label) {
  select.innerHTML = "";
  select.append(new Option(label, value));
}

function renderAll() {
  renderDataStatus();
  renderConnectionStatus();
  renderNotifications();
  state.diagnostics = buildDiagnostics(state.projects, state.grants);
  renderDiagnostics(state.diagnostics);
  renderKpis();
  renderFunnel();
  renderProjects();
  renderGrants();
  renderRisks();
  renderWishLog();
}

// renderDataStatus показывает, откуда сейчас пришли проекты и гранты, либо мягкое предупреждение о fallback.
function renderDataStatus() {
  const items = [state.dataStatus.projects, state.dataStatus.grants];
  elements.dataStatus.innerHTML = items
    .map(item => `<span class="data-status__item ${item.ok ? "is-ok" : "is-warning"}">${escapeHtml(item.message)}</span>`)
    .join("");
}

// renderConnectionStatus показывает человеку понятный источник данных и доступность отправки формы.
function renderConnectionStatus() {
  const feedbackOk = state.connection.feedback === "отправка в таблицу доступна";
  const cards = [
    { label: "Проекты", source: state.connection.projects, value: formatConnectionValue(state.connection.projects, state.connectionCounts.projects) },
    { label: "Гранты", source: state.connection.grants, value: formatConnectionValue(state.connection.grants, state.connectionCounts.grants) },
    { label: "Пожелания НТС", source: feedbackOk ? "доступно" : "недоступно", value: feedbackOk ? "доступно" : "недоступно" }
  ];

  elements.connectionStatus.innerHTML = `
    <div class="connection-card connection-card--title"><strong>Статус подключения</strong></div>
    ${cards.map(({ label, value, source }) => {
      const className = source === "Google Таблица" || (label === "Пожелания НТС" && value === "доступно")
        ? "is-ok"
        : source === "локальный файл"
          ? "is-warning"
          : "is-danger";
      return `<div class="connection-card ${className}">${label}: ${escapeHtml(value)}</div>`;
    }).join("")}
  `;
}

function compactSourceName(value) {
  if (value === "demo-данные") return "demo";
  return value;
}

function formatConnectionValue(source, count) {
  const name = compactSourceName(source);
  if (source === "Google Таблица") return `${name}, ${count} записей`;
  return name;
}

function renderNotifications() {
  elements.notifications.innerHTML = state.notifications
    .slice(-4)
    .map(item => `<div class="notification is-${item.type}">${escapeHtml(item.message)}</div>`)
    .join("");
}

function addNotification(type, message) {
  state.notifications.push({ type, message, createdAt: new Date().toISOString() });
}

// validateProjects проверяет полноту, корректность и управленческие риски в каждом проекте.
function legacyValidateProjects(projects) {
  const issues = [];

  projects.forEach(project => {
    const addIssue = (severity, message, recommendation) => {
      issues.push({
        scope: "project",
        projectId: project.id || "без ID",
        projectTitle: project.title || "Без названия",
        severity,
        message,
        recommendation
      });
    };

    if (!project.manager || project.manager === "Не назначен") {
      addIssue("critical", "Нет руководителя.", "Назначить руководителя проекта.");
    }

    if (!project.hasPassport) {
      addIssue("warning", "Нет паспорта проекта.", "Подготовить и согласовать паспорт проекта.");
    }

    if (!project.hasTZ) {
      addIssue("warning", "Нет ТЗ.", "Описать техническое задание и критерии результата.");
    }

    if (!project.hasBudget) {
      addIssue("warning", "Нет бюджета.", "Собрать смету и подтвердить источники расходов.");
    }

    if (typeof project.readiness !== "number" || project.readiness < 0 || project.readiness > 100) {
      addIssue("critical", "Готовность должна быть числом от 0 до 100.", "Исправить поле readiness в projects.json.");
    }

    if (!project.nextAction) {
      addIssue("warning", "Нет ближайшего действия.", "Добавить следующий конкретный шаг.");
    }

    if (!project.nextActionDate || !isValidDate(project.nextActionDate)) {
      addIssue("warning", "Нет даты ближайшего действия.", "Добавить дату в формате YYYY-MM-DD.");
    } else if (daysUntil(project.nextActionDate) < 14) {
      addIssue("warning", "Дедлайн ближайшего действия меньше 14 дней.", "Проверить готовность исполнителя и приоритет действия.");
    }

    if (!project.grants || project.grants.length === 0) {
      addIssue("warning", "Нет подходящего гранта.", "Выбрать минимум одно релевантное грантовое окно.");
    }

    if (project.needsDecision) {
      addIssue("warning", "Проект требует решения руководителя.", "Вынести вопрос на управленческое решение.");
    }
  });

  return issues;
}

// validateGrants проверяет базовую полноту грантов после нормализации CSV.
function legacyValidateGrants(grants) {
  const issues = [];

  grants.forEach(grant => {
    const addIssue = (severity, message, recommendation) => {
      issues.push({
        scope: "grant",
        grantTitle: grant.title || "Без названия",
        severity,
        message,
        recommendation
      });
    };

    if (!grant.title) addIssue("critical", "В гранте не заполнен маршрут.", "Заполнить колонку «Маршрут» в grants.csv.");
    if (!grant.operator) addIssue("warning", "В гранте не заполнен оператор.", "Заполнить колонку «Оператор».");
    if (!grant.window) addIssue("warning", "В гранте не заполнено окно подачи.", "Уточнить колонку «Окно / статус на 27.04.2026».");
    if (!grant.source) addIssue("warning", "В гранте не указан источник.", "Добавить ссылку или источник проверки.");
  });

  return issues;
}

// validateRelations сверяет связи проектов и грантов, а также ловит противоречия в готовности.
function legacyValidateRelations(projects, grants) {
  const issues = [];
  const projectIds = new Set(projects.map(project => project.id));

  projects.forEach(project => {
    (project.grants || []).forEach(grantName => {
      if (!hasMatchingGrant(grantName, grants)) {
        issues.push({
          scope: "project",
          projectId: project.id,
          projectTitle: project.title,
          severity: "warning",
          message: `В проекте указан грант «${grantName}», которого нет в grants.csv.`,
          recommendation: "Добавить грант в grants.csv или уточнить название в projects.json."
        });
      }
    });

    if (project.readiness > 80 && (!project.hasBudget || !project.hasTZ)) {
      issues.push({
        scope: "project",
        projectId: project.id,
        projectTitle: project.title,
        severity: "warning",
        message: "Готовность выше 80%, но нет бюджета или ТЗ.",
        recommendation: "Снизить готовность или закрыть недостающие документы."
      });
    }

    if (project.status === "Готов к грантам" && (!project.hasPassport || !project.hasTZ || !project.hasBudget)) {
      issues.push({
        scope: "project",
        projectId: project.id,
        projectTitle: project.title,
        severity: "critical",
        message: "Проект отмечен как «Готов к грантам», но нет паспорта, ТЗ или бюджета.",
        recommendation: "Исправить статус или завершить пакет документов."
      });
    }
  });

  grants.forEach(grant => {
    grant.projects.forEach(projectId => {
      if (!projectIds.has(projectId)) {
        issues.push({
          scope: "relation",
          grantTitle: grant.title,
          severity: "warning",
          message: `В grants.csv указан проект «${projectId}», которого нет в projects.json.`,
          recommendation: "Добавить проект в projects.json или удалить ID из grants.csv."
        });
      }
    });
  });

  return issues;
}

// renderDataDiagnostics собирает результаты проверок, показывает счетчики и список проблем.
function legacyRenderDataDiagnostics() {
  const issues = [
    ...validateProjects(state.projects),
    ...validateGrants(state.grants),
    ...validateRelations(state.projects, state.grants)
  ];
  const critical = issues.filter(issue => issue.severity === "critical").length;
  const warnings = issues.filter(issue => issue.severity === "warning").length;
  const recommendations = issues.filter(issue => issue.recommendation).length;

  state.diagnostics = {
    issues,
    summary: {
      total: issues.length,
      critical,
      warnings,
      recommendations
    }
  };

  const statusClass = critical ? "is-critical" : warnings ? "is-warning" : "is-ok";
  const groupedIssues = groupDiagnosticsByTarget(issues);
  const listHtml = groupedIssues.length
    ? groupedIssues.map(group => diagnosticGroupTemplate(group)).join("")
    : `
      <article class="diagnostic-group is-ok">
        <h3>Данные выглядят хорошо</h3>
        <p class="section-note">Критичных ошибок и предупреждений не найдено.</p>
      </article>
    `;

  elements.dataDiagnostics.innerHTML = `
    <div class="diagnostics-grid">
      <article class="diagnostic-card ${statusClass}">
        <strong>${issues.length}</strong>
        <span>Всего ошибок</span>
      </article>
      <article class="diagnostic-card ${critical ? "is-critical" : "is-ok"}">
        <strong>${critical}</strong>
        <span>Критические ошибки</span>
      </article>
      <article class="diagnostic-card ${warnings ? "is-warning" : "is-ok"}">
        <strong>${warnings}</strong>
        <span>Предупреждения</span>
      </article>
      <article class="diagnostic-card ${recommendations ? "is-warning" : "is-ok"}">
        <strong>${recommendations}</strong>
        <span>Рекомендации</span>
      </article>
    </div>
    <div class="diagnostic-list">${listHtml}</div>
  `;
}

function renderKpis() {
  const total = state.projects.length;
  const ready = state.projects.filter(project => project.status === "Готов к грантам").length;
  const needsWork = state.projects.filter(project => project.status === "Требует доработки").length;
  const risky = state.projects.filter(project => project.risk === "Высокий").length;
  const decisions = state.projects.filter(project => project.needsDecision).length;

  const kpis = [
    ["Всего проектов", total, "в активном реестре", ""],
    ["Готовы к грантам", ready, "можно упаковывать", "is-good"],
    ["Требуют доработки", needsWork, "нужны документы", "is-warning"],
    ["В зоне риска", risky, "требуют контроля", "is-danger"],
    ["Требуют решения руководителя", decisions, "нужна развилка", "is-warning"]
  ];

  elements.kpiGrid.innerHTML = kpis
    .map(([label, value, hint, className]) => `
      <article class="kpi-card ${className}">
        <strong>${value}</strong>
        <span>${label}</span>
        <small>${hint}</small>
      </article>
    `)
    .join("");
}

function renderFunnel() {
  const total = state.projects.length || 1;
  elements.funnelSteps.innerHTML = FUNNEL_STAGES
    .map((stage, index) => {
      const count = state.projects.filter(project => project.stage === stage).length;
      const percent = Math.round((count / total) * 100);
      const width = Math.max(58, 100 - index * 5);
      const activeClass = state.activeStage === stage ? "is-active" : "";
      return `
        <button class="funnel-step ${activeClass}" type="button" data-stage="${escapeHtml(stage)}" style="--funnel-width: ${width}%">
          <span class="funnel-step__name">${escapeHtml(stage)}</span>
          <strong>${count}</strong>
          <span>${percent}% проектов</span>
        </button>
      `;
    })
    .join("");

  elements.funnelSteps.querySelectorAll(".funnel-step").forEach(button => {
    button.addEventListener("click", () => {
      state.activeStage = button.dataset.stage;
      renderFunnel();
    });
  });

  renderStageDetails();
}

function renderStageDetails() {
  const projects = state.projects.filter(project => project.stage === state.activeStage);
  const list = projects.length
    ? projects.map(project => `<li><strong>${escapeHtml(project.id)}</strong><br>${escapeHtml(project.title)}<br><span class="tag ${riskClass(project.risk)}">${escapeHtml(project.risk)}</span></li>`).join("")
    : "<li>На этом этапе пока нет проектов</li>";

  elements.stageDetails.innerHTML = `
    <strong>${escapeHtml(state.activeStage)}</strong>
    <ul>${list}</ul>
  `;
}

function renderProjects() {
  const projects = getFilteredProjects();
  elements.emptyProjects.hidden = projects.length > 0;

  elements.projectsTable.innerHTML = projects
    .map(project => {
      const isExpanded = state.expandedProjectId === project.id;
      const grants = project.grants.map(grant => `<span class="tag tag--blue">${escapeHtml(grant)}</span>`).join(" ");

      return `
        <tr>
          <td>${escapeHtml(project.id)}</td>
          <td><span class="project-title">${escapeHtml(project.title)}</span><br><span class="tag tag--blue">${escapeHtml(project.stage)}</span></td>
          <td>${escapeHtml(project.manager)}</td>
          <td>${statusTag(project.status)}</td>
          <td>${progressBar(project.readiness)}</td>
          <td>${deadlineTag(project.nextActionDate)}<br>${escapeHtml(project.nextAction)}</td>
          <td><span class="tag ${riskClass(project.risk)}">${escapeHtml(project.risk)}</span></td>
          <td>${grants}</td>
          <td><button class="button button--ghost" type="button" data-project-id="${escapeHtml(project.id)}">${isExpanded ? "Скрыть" : "Подробнее"}</button></td>
        </tr>
        ${isExpanded ? projectDetailsRow(project) : ""}
      `;
    })
    .join("");

  elements.projectsTable.querySelectorAll("[data-project-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.expandedProjectId = state.expandedProjectId === button.dataset.projectId ? null : button.dataset.projectId;
      renderProjects();
    });
  });
}

function getFilteredProjects() {
  return state.projects.filter(project => {
    const query = `${project.id} ${project.title} ${project.manager}`.toLowerCase();
    const riskValue = riskToFilterValue(project.risk);
    const matchesSearch = !state.filters.search || query.includes(state.filters.search);
    const matchesStatus = state.filters.status === "all" || project.status === state.filters.status;
    const matchesRisk = state.filters.risk === "all" || riskValue === state.filters.risk;
    const matchesGrant = state.filters.grant === "all" || project.grants.includes(state.filters.grant);
    const matchesReadiness = state.filters.readiness === "all"
      || (state.filters.readiness === "high" && project.readiness >= 80)
      || (state.filters.readiness === "medium" && project.readiness >= 50 && project.readiness < 80)
      || (state.filters.readiness === "low" && project.readiness < 50);

    return matchesSearch && matchesStatus && matchesRisk && matchesGrant && matchesReadiness;
  });
}

function statusTag(status) {
  if (status === "Готов к грантам") return `<span class="tag tag--green">${escapeHtml(status)}</span>`;
  if (status === "В зоне риска") return `<span class="tag tag--red">${escapeHtml(status)}</span>`;
  if (status === "Требует решения руководителя") return `<span class="tag tag--yellow">${escapeHtml(status)}</span>`;
  return `<span class="tag tag--blue">${escapeHtml(status)}</span>`;
}

function progressBar(value) {
  return `
    <div class="progress" aria-label="Готовность ${value}%">
      <span>${value}%</span>
      <div class="timeline"><span style="left: 0; width: ${value}%"></span></div>
    </div>
  `;
}

function deadlineTag(dateString) {
  const days = daysUntil(dateString);
  const className = days <= 3 ? "tag--red" : days <= 7 ? "tag--yellow" : "tag--blue";
  return `<span class="tag ${className}">${formatDate(dateString)}</span>`;
}

function projectDetailsRow(project) {
  const gaps = projectGaps(project);
  return `
    <tr class="details-row">
      <td colspan="9">
        <div class="details-grid">
          <div><strong>Этап</strong><br>${escapeHtml(project.stage)}</div>
          <div><strong>Документы</strong><br>${documentStatus(project)}</div>
          <div><strong>Пробелы</strong><br>${escapeHtml(gaps.length ? gaps.join(", ") : "Критичных пробелов нет")}</div>
          <div><strong>Решение руководителя</strong><br>${project.needsDecision ? "Требуется" : "Не требуется"}</div>
        </div>
      </td>
    </tr>
  `;
}

function renderGrants() {
  const grants = state.grants.filter(grant => state.filters.grantOperator === "all" || grant.operator === state.filters.grantOperator);
  elements.grantCalendar.innerHTML = grants.length ? grants
    .map(grant => {
      const projectBadges = grant.projects.length
        ? grant.projects.map(projectId => `<span class="tag tag--blue">${escapeHtml(projectId)}</span>`).join(" ")
        : `<span class="section-note">Не указаны</span>`;
      const source = grant.source.startsWith("http")
        ? `<a class="source-button" href="${escapeHtml(grant.source)}" target="_blank" rel="noopener">Источник</a>`
        : escapeHtml(grant.source || "Не указан");
      const deadlineClass = grant.window && grant.window.match(/0[1-9]\.0[5-6]\.2026/) ? "is-near" : "";

      return `
        <article class="grant-card ${deadlineClass}">
          <div>
            <h3>${escapeHtml(grant.title)}</h3>
            <p class="section-note">${escapeHtml(grant.operator)}</p>
            <div class="timeline"><span style="left: 0; width: ${grantWidth(grant.window)}%"></span></div>
            <p><strong>Окно:</strong> ${escapeHtml(grant.window || "Требует проверки")}</p>
            <p><strong>Финансирование:</strong> ${escapeHtml(grant.funding || "Не указано")}</p>
          </div>
          <div>
            <p><strong>Для чего подходит:</strong> ${escapeHtml(grant.purpose || "Не указано")}</p>
            <p><strong>Кто подает:</strong> ${escapeHtml(grant.applicant || "Не указано")}</p>
            <p><strong>Подходящие проекты:</strong><br>${projectBadges}</p>
          </div>
          <div>
            <p><strong>Что подготовить первым:</strong> ${escapeHtml(grant.firstStep || "Не указано")}</p>
            <p><strong>План с 1 июня:</strong> ${escapeHtml(grant.planFromJune || "Не указан")}</p>
            <p><strong>Источник:</strong> ${source}</p>
            <p><strong>Проверено:</strong> ${escapeHtml(grant.checkedAt || "Не указано")} · ${escapeHtml(grant.confidence || "Без оценки")}</p>
          </div>
        </article>
      `;
    })
    .join("") : `<p class="empty-state">Гранты по выбранному оператору не найдены.</p>`;
}

function renderRisks() {
  const riskRules = [
    ["нет паспорта проекта", project => !project.hasPassport],
    ["нет ТЗ", project => !project.hasTZ],
    ["нет бюджета", project => !project.hasBudget],
    ["не назначен руководитель", project => !project.manager || project.manager === "Не назначен"],
    ["не выбран грант", project => !project.grants || project.grants.length === 0],
    ["дедлайн ближе 14 дней", project => daysUntil(project.nextActionDate) < 14]
  ];

  elements.riskList.innerHTML = riskRules
    .map(([label, predicate]) => {
      const projects = state.projects.filter(predicate);
      const isDeadline = label.includes("дедлайн");
      const className = projects.length && !isDeadline ? "is-critical" : projects.length && isDeadline ? "is-deadline" : "";
      const names = projects.length ? projects.map(project => project.id).join(", ") : "нет";
      return `
        <article class="risk-item ${className}">
          <div>
            <strong>${label}</strong>
            <p class="section-note">Проекты: ${escapeHtml(names)}</p>
          </div>
          <span class="tag ${projects.length ? (isDeadline ? "tag--yellow" : "tag--red") : "tag--green"}">${projects.length}</span>
        </article>
      `;
    })
    .join("");
}

function handleWishSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const wish = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    project: formData.get("project"),
    wish: formData.get("wish"),
    priority: formData.get("priority")
  };

  const wishes = getSavedWishes();
  wishes.unshift(wish);
  localStorage.setItem("ntsWishes", JSON.stringify(wishes));
  console.log("Пожелание НТС:", wish);

  // Позже здесь можно добавить fetch(GOOGLE_APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(wish) }).
  event.target.reset();
  renderWishLog();
}

function renderWishLog() {
  const wishes = getSavedWishes().slice(0, 4);
  elements.wishLog.innerHTML = wishes.length
    ? wishes.map(wish => `
      <div class="wish-log__item">
        <strong>${escapeHtml(wish.fullName)}</strong> · ${escapeHtml(wish.priority)}<br>
        ${escapeHtml(wish.wish)}
      </div>
    `).join("")
    : `<p class="section-note">Пока пожеланий нет. Новые записи сохранятся в браузере.</p>`;
}

function projectGaps(project) {
  const gaps = [];
  if (!project.hasPassport) gaps.push("нет паспорта проекта");
  if (!project.hasTZ) gaps.push("нет ТЗ");
  if (!project.hasBudget) gaps.push("нет бюджета");
  if (!project.manager || project.manager === "Не назначен") gaps.push("не назначен руководитель");
  if (!project.grants || project.grants.length === 0) gaps.push("не выбран грант");
  if (daysUntil(project.nextActionDate) < 14) gaps.push("дедлайн ближе 14 дней");
  return gaps;
}

function documentStatus(project) {
  const passport = project.hasPassport ? "паспорт есть" : "нет паспорта";
  const tz = project.hasTZ ? "ТЗ есть" : "нет ТЗ";
  const budget = project.hasBudget ? "бюджет есть" : "нет бюджета";
  return `${passport}; ${tz}; ${budget}`;
}

function riskClass(risk) {
  return riskClasses[risk] || "tag--blue";
}

function riskToFilterValue(risk) {
  if (risk === "Высокий") return "high";
  if (risk === "Средний") return "medium";
  if (risk === "Низкий") return "low";
  return "all";
}

function grantWidth(windowText) {
  const dates = (windowText.match(/\d{2}\.\d{2}\.\d{4}/g) || []).length;
  if (dates >= 2) return 72;
  if (dates === 1) return 46;
  return 30;
}

function groupDiagnosticsByTarget(issues) {
  const groups = new Map();

  issues.forEach(issue => {
    const key = issue.scope === "project"
      ? `project:${issue.projectId}`
      : issue.scope === "grant"
        ? `grant:${issue.grantTitle}`
        : `relation:${issue.grantTitle || issue.message}`;

    if (!groups.has(key)) {
      groups.set(key, {
        title: diagnosticGroupTitle(issue),
        severity: issue.severity,
        issues: []
      });
    }

    const group = groups.get(key);
    if (issue.severity === "critical") group.severity = "critical";
    group.issues.push(issue);
  });

  return [...groups.values()];
}

function diagnosticGroupTitle(issue) {
  if (issue.scope === "project") return `${issue.projectId} · ${issue.projectTitle}`;
  if (issue.scope === "grant") return `Грант · ${issue.grantTitle}`;
  return `Связи · ${issue.grantTitle || "проверка реестра"}`;
}

function diagnosticGroupTemplate(group) {
  const className = group.severity === "critical" ? "is-critical" : "is-warning";
  const items = group.issues
    .map(issue => `
      <li>
        <span class="tag ${issue.severity === "critical" ? "tag--red" : "tag--yellow"}">${issue.severity === "critical" ? "Критично" : "Внимание"}</span>
        ${escapeHtml(issue.message)}
        <br><span class="section-note">${escapeHtml(issue.recommendation)}</span>
      </li>
    `)
    .join("");

  return `
    <article class="diagnostic-group ${className}">
      <h3>${escapeHtml(group.title)}</h3>
      <ul>${items}</ul>
    </article>
  `;
}

function hasMatchingGrant(projectGrantName, grants) {
  const target = normalizeForMatch(projectGrantName);
  return grants.some(grant => {
    const title = normalizeForMatch(grant.title);
    const operator = normalizeForMatch(grant.operator);
    return title === target || operator === target || title.includes(target) || target.includes(title);
  });
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSavedWishes() {
  try {
    return JSON.parse(localStorage.getItem("ntsWishes")) || [];
  } catch {
    return [];
  }
}

function unique(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(dateString));
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date - today) / 86400000);
}

function isValidDate(dateString) {
  return Boolean(dateString) && !Number.isNaN(new Date(dateString).getTime());
}

// validateProjects проверяет проектные записи. Критичность повышается до critical, если ошибка блокирует управленческое решение или грантовую подачу.
function validateProjects(projects) {
  const issues = [];

  projects.forEach(project => {
    const target = project.id ? `Проект ${project.id}` : "Проект без ID";
    const addIssue = (severity, description, recommendation) => {
      issues.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${target}-${description}`,
        type: "project",
        severity,
        target,
        description,
        recommendation
      });
    };

    if (!project.id) {
      addIssue("critical", "нет ID проекта.", "Добавить уникальный id в data/projects.json.");
    }

    if (!project.title) {
      addIssue("critical", "нет названия проекта.", "Заполнить поле title.");
    }

    if (!project.manager || project.manager === "Не назначен") {
      addIssue("critical", "нет руководителя.", "Назначить руководителя проекта.");
    }

    // Готовность используется в KPI, фильтрах и диагностике, поэтому нечисловое значение считаем критичным.
    if (typeof project.readiness !== "number" || Number.isNaN(project.readiness)) {
      addIssue("critical", "готовность не является числом.", "Указать readiness числом от 0 до 100.");
    } else if (project.readiness < 0 || project.readiness > 100) {
      addIssue("critical", "готовность меньше 0 или больше 100.", "Исправить readiness: допустимый диапазон 0-100.");
    }

    // Статус «Готов к грантам» обещает полный пакет документов, поэтому отсутствие любого базового документа критично.
    if (project.status === "Готов к грантам" && !project.hasPassport) {
      addIssue("critical", "статус «Готов к грантам», но нет паспорта проекта.", "Добавить паспорт проекта или изменить статус.");
    }

    if (project.status === "Готов к грантам" && !project.hasTZ) {
      addIssue("critical", "статус «Готов к грантам», но нет ТЗ.", "Добавить ссылку на техническое задание или изменить статус готовности.");
    }

    if (project.status === "Готов к грантам" && !project.hasBudget) {
      addIssue("critical", "статус «Готов к грантам», но нет бюджета.", "Добавить бюджет или снять статус готовности к грантам.");
    }

    // Высокая готовность без ТЗ или бюджета противоречит логике грантовой упаковки, поэтому это блокирующая ошибка качества данных.
    if (typeof project.readiness === "number" && project.readiness > 80 && (!project.hasTZ || !project.hasBudget)) {
      addIssue("critical", "проект готов больше чем на 80%, но нет ТЗ или бюджета.", "Закрыть ТЗ и бюджет либо снизить процент готовности.");
    }

    if (!project.nextAction) {
      addIssue("warning", "нет ближайшего действия.", "Добавить конкретный следующий шаг.");
    }

    if (!project.nextActionDate || !isValidDate(project.nextActionDate)) {
      addIssue("warning", "нет даты ближайшего действия.", "Добавить дату в формате YYYY-MM-DD.");
    } else if (daysUntil(project.nextActionDate) < 14) {
      addIssue("warning", "ближайшее действие ближе 14 дней.", "Проверить, назначен ли исполнитель и достаточно ли времени на действие.");
    }

    if (!project.risk) {
      addIssue("warning", "не указан риск.", "Заполнить риск: Высокий, Средний или Низкий.");
    }

    if (!project.grants || project.grants.length === 0) {
      addIssue("warning", "не указаны подходящие гранты.", "Выбрать минимум один релевантный грант.");
    }

    if (project.needsDecision) {
      addIssue("warning", "проект требует решения руководителя.", "Вынести вопрос в повестку руководителя.");
    }
  });

  return issues;
}

// validateGrants проверяет строки grants.csv. Поля, без которых нельзя понять окно и источник гранта, считаются critical.
function validateGrants(grants) {
  const issues = [];

  grants.forEach(grant => {
    const target = grant.title ? `Грант ${grant.title}` : "Грант без названия";
    const addIssue = (severity, description, recommendation) => {
      issues.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${target}-${description}`,
        type: "grant",
        severity,
        target,
        description,
        recommendation
      });
    };

    if (!grant.title) {
      addIssue("critical", "нет названия гранта.", "Заполнить колонку «Маршрут».");
    }

    if (!grant.operator) {
      addIssue("critical", "нет оператора.", "Заполнить колонку «Оператор».");
    }

    if (!grant.window) {
      addIssue("critical", "нет окна подачи.", "Заполнить колонку «Окно / статус на 27.04.2026».");
    }

    if (!grant.source) {
      addIssue("critical", "нет источника.", "Добавить ссылку на официальный источник или страницу конкурса.");
    }

    if (!grant.projects || grant.projects.length === 0) {
      addIssue("warning", "нет подходящих проектов.", "Указать ID проектов в колонке «Проекты из реестра».");
    }

    if (!grant.firstStep) {
      addIssue("warning", "нет информации «что подготовить первым».", "Заполнить первый практический шаг подготовки.");
    }

    if (!grant.checkedAt) {
      addIssue("warning", "нет даты проверки.", "Заполнить дату проверки актуальности.");
    }

    if (!grant.confidence || normalizeForMatch(grant.confidence).includes("низк")) {
      addIssue("warning", "низкая уверенность или поле уверенности пустое.", "Перепроверить условия конкурса и обновить поле уверенности.");
    }
  });

  return issues;
}

// validateRelations проверяет связи между реестром и CSV. Несовпадения помечаются warning, а невозможность подачи готового проекта без привязки к гранту - critical.
function validateRelations(projects, grants) {
  const issues = [];
  const projectById = new Map(projects.map(project => [project.id, project]));
  const grantProjectIds = new Set(grants.flatMap(grant => grant.projects || []));

  projects.forEach(project => {
    (project.grants || []).forEach(grantName => {
      if (!hasMatchingGrant(grantName, grants)) {
        issues.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `${project.id}-${grantName}`,
          type: "relation",
          severity: "warning",
          target: `Проект ${project.id}`,
          description: `указан грант «${grantName}», которого нет в grants.csv.`,
          recommendation: "Добавить грант в data/grants.csv или привести название к существующему маршруту."
        });
      }
    });

    const hasCatalogGrant = (project.grants || []).some(grantName => hasMatchingGrant(grantName, grants));
    const hasCsvGrantLink = grantProjectIds.has(project.id);
    if (project.status === "Готов к грантам" && !hasCatalogGrant && !hasCsvGrantLink) {
      issues.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${project.id}-no-grant-link`,
        type: "relation",
        severity: "critical",
        target: `Проект ${project.id}`,
        description: "проект готов к грантам, но ни один грант к нему не привязан.",
        recommendation: "Добавить подходящий грант в projects.json или указать ID проекта в grants.csv."
      });
    }
  });

  grants.forEach(grant => {
    (grant.projects || []).forEach(projectId => {
      const project = projectById.get(projectId);
      if (!project) {
        issues.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `${grant.title}-${projectId}`,
          type: "relation",
          severity: "warning",
          target: `Грант ${grant.title}`,
          description: `указан проект «${projectId}», которого нет в projects.json.`,
          recommendation: "Добавить проект в data/projects.json или удалить ID из grants.csv."
        });
        return;
      }

      if (typeof project.readiness === "number" && project.readiness < 50) {
        issues.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `${grant.title}-${projectId}-low-readiness`,
          type: "relation",
          severity: "recommendation",
          target: `Грант ${grant.title}`,
          description: `содержит проект ${projectId} с готовностью ниже 50%.`,
          recommendation: "Проверить реалистичность подачи или перенести проект в более позднее окно."
        });
      }
    });
  });

  return issues;
}

function buildDiagnostics(projects, grants) {
  const issues = [
    ...validateProjects(projects),
    ...validateGrants(grants),
    ...validateRelations(projects, grants)
  ];

  return {
    issues,
    filter: state.diagnostics.filter || "all",
    summary: {
      total: issues.length,
      critical: issues.filter(issue => issue.severity === "critical").length,
      warnings: issues.filter(issue => issue.severity === "warning").length,
      recommendations: issues.filter(issue => issue.severity === "recommendation").length
    }
  };
}

function renderDiagnostics(diagnostics) {
  const sortedIssues = [...diagnostics.issues].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const filteredIssues = sortedIssues.filter(issue => {
    if (diagnostics.filter === "all") return true;
    if (["critical", "warning", "recommendation"].includes(diagnostics.filter)) return issue.severity === diagnostics.filter;
    return issue.type === diagnostics.filter;
  });

  const statusText = diagnostics.summary.critical
    ? "Есть критические ошибки"
    : diagnostics.summary.warnings
      ? "Есть предупреждения"
      : "Данные заполнены корректно";
  const statusClass = diagnostics.summary.critical ? "is-critical" : diagnostics.summary.warnings ? "is-warning" : diagnostics.summary.recommendations ? "is-recommendation" : "is-ok";
  const listHtml = filteredIssues.length
    ? filteredIssues.map(diagnosticIssueTemplate).join("")
    : `
      <article class="diagnostic-group is-ok">
        <h3>Данные заполнены корректно</h3>
        <p class="section-note">По выбранному фильтру проблем не найдено.</p>
      </article>
    `;

  elements.dataDiagnostics.innerHTML = `
    <div class="diagnostic-status ${statusClass}">${statusText}</div>
    <div class="diagnostics-grid">
      <article class="diagnostic-card ${statusClass}">
        <strong>${diagnostics.summary.total}</strong>
        <span>Всего проблем</span>
      </article>
      <article class="diagnostic-card ${diagnostics.summary.critical ? "is-critical" : "is-ok"}">
        <strong>${diagnostics.summary.critical}</strong>
        <span>Критические ошибки</span>
      </article>
      <article class="diagnostic-card ${diagnostics.summary.warnings ? "is-warning" : "is-ok"}">
        <strong>${diagnostics.summary.warnings}</strong>
        <span>Предупреждения</span>
      </article>
      <article class="diagnostic-card ${diagnostics.summary.recommendations ? "is-recommendation" : "is-ok"}">
        <strong>${diagnostics.summary.recommendations}</strong>
        <span>Рекомендации</span>
      </article>
    </div>
    <div class="diagnostic-list">${listHtml}</div>
  `;

  elements.diagnosticFilters.querySelectorAll("[data-diagnostic-filter]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.diagnosticFilter === diagnostics.filter);
  });
}

function severityRank(severity) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function filterDiagnostics(type) {
  state.diagnostics.filter = type;
  renderDiagnostics(state.diagnostics);
}

function diagnosticIssueTemplate(issue) {
  const label = issue.severity === "critical"
    ? "Критично"
    : issue.severity === "warning"
      ? "Предупреждение"
      : "Рекомендация";
  const tagClass = issue.severity === "critical"
    ? "tag--red"
    : issue.severity === "warning"
      ? "tag--yellow"
      : "tag--blue";

  return `
    <article class="diagnostic-issue is-${issue.severity}">
      <div class="diagnostic-issue__meta">
        <span class="tag ${tagClass}">${label}</span>
        <span class="tag tag--blue">${diagnosticTypeLabel(issue.type)}</span>
      </div>
      <strong>${escapeHtml(issue.target)} - ${escapeHtml(issue.description)}</strong>
      <p class="section-note"><strong>Рекомендация:</strong> ${escapeHtml(issue.recommendation)}</p>
    </article>
  `;
}

function diagnosticTypeLabel(type) {
  if (type === "project") return "Проект";
  if (type === "grant") return "Грант";
  return "Связь";
}

async function handleWishSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const feedback = {
    action: "feedback",
    fio: formData.get("fullName"),
    role: formData.get("role"),
    project: formData.get("project"),
    message: formData.get("wish"),
    priority: formData.get("priority"),
    createdAt: new Date().toISOString()
  };

  try {
    await submitFeedback(feedback);
    state.connection.feedback = "отправка в таблицу доступна";
    addNotification("success", "Пожелание отправлено в таблицу");
    event.target.reset();
  } catch (error) {
    console.warn("Feedback API unavailable:", error);
    saveFeedbackLocally(feedback);
    state.connection.feedback = "недоступна";
    addNotification("warning", "Нет связи с таблицей. Пожелание сохранено в браузере");
  }

  renderConnectionStatus();
  renderNotifications();
  renderWishLog();
}

// submitFeedback отправляет пожелание НТС в Google Apps Script POST-запросом.
async function submitFeedback(feedback) {
  if (!API_CONFIG.enabled) throw new Error("API disabled");
  const response = await fetch(API_CONFIG.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(feedback)
  });
  if (!response.ok) throw new Error(`Feedback HTTP ${response.status}`);

  try {
    return await response.text();
  } catch (readError) {
    addNotification("warning", "Пожелание отправлено, но ответ сервера не удалось прочитать");
    return "sent-without-readable-response";
  }
}

// saveFeedbackLocally сохраняет пожелание в localStorage, если Google Таблица временно недоступна.
function saveFeedbackLocally(feedback) {
  const wishes = getSavedWishes();
  wishes.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: feedback.createdAt,
    fullName: feedback.fio,
    role: feedback.role,
    project: feedback.project,
    wish: feedback.message,
    priority: feedback.priority
  });
  localStorage.setItem("ntsWishes", JSON.stringify(wishes));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
