/*
  Панель руководителя Технопарка РГСУ
  Версия v3: устойчивое чтение обновленного листа проектов gid=341683209.
  Код специально оставлен на чистом JavaScript, чтобы сайт работал на GitHub Pages без сборки.
*/

const CONFIG = {
  sheetId: "1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60",
  sheets: {
    // Лист реестра проектов.
    projects: "341683209",
    // Лист с грантовыми окнами оставлен прежним.
    grants: "1500721586",
    // Лист пожеланий НТС.
    nts: "202604270",
  },
  sheetUrl: "https://docs.google.com/spreadsheets/d/1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60/edit",
  scriptUrl: "https://script.google.com/macros/s/AKfycbwzbWEjEpb1ySylb--7VhqEHvaC05WB5jhcw-8xpAj811bIJurVB3CW-ElDsoeKnWOA/exec",
  formKey: "NTS_TECHNOPARK_2026",
  confirmCode: "11111111",
  juneStart: "2026-06-01",
};

const state = {
  projects: [],
  grants: [],
  feedback: [],
  filters: {
    query: "",
    status: "all",
    owner: "all",
    readiness: "all",
    risk: "all",
  },
  grantFilters: {
    query: "",
    status: "all",
    sort: "deadline_asc",
  },
  ui: {
    isLoading: false,
    lastLoadedAt: null,
    requestId: 0,
  },
};

const els = {
  syncDot: document.querySelector("#syncDot"),
  syncStatus: document.querySelector("#syncStatus"),
  refreshData: document.querySelector("#refreshData"),
  menuToggle: document.querySelector("#menuToggle"),
  mainNav: document.querySelector("#mainNav"),
  navLinks: document.querySelectorAll(".main-nav a"),
  kpiTotal: document.querySelector("#kpiTotal"),
  kpiActive: document.querySelector("#kpiActive"),
  kpiReady: document.querySelector("#kpiReady"),
  kpiRisks: document.querySelector("#kpiRisks"),
  leaderAttention: document.querySelector("#leaderAttention"),
  ntsAgenda: document.querySelector("#ntsAgenda"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  ownerFilter: document.querySelector("#ownerFilter"),
  readinessFilter: document.querySelector("#readinessFilter"),
  riskFilter: document.querySelector("#riskFilter"),
  grantsQuickKpi: document.querySelector("#grantsQuickKpi"),
  grantSearchInput: document.querySelector("#grantSearchInput"),
  grantStatusFilter: document.querySelector("#grantStatusFilter"),
  grantSortSelect: document.querySelector("#grantSortSelect"),
  projectGrid: document.querySelector("#projectGrid"),
  projectTable: document.querySelector("#projectTable"),
  grantGrid: document.querySelector("#grantGrid"),
  funnelBoard: document.querySelector("#funnelBoard"),
  ntsForm: document.querySelector("#ntsForm"),
  formNote: document.querySelector("#formNote"),
  feedbackProject: document.querySelector("#feedbackProject"),
  feedbackFeed: document.querySelector("#feedbackFeed"),
  toast: document.querySelector("#toast"),
  projectEditForm: document.querySelector("#projectEditForm"),
  projectEditTitle: document.querySelector("#projectEditTitle"),
  editProjectId: document.querySelector("#editProjectId"),
  editProjectName: document.querySelector("#editProjectName"),
  editProjectOwner: document.querySelector("#editProjectOwner"),
  editProjectStatus: document.querySelector("#editProjectStatus"),
  editProjectGrant: document.querySelector("#editProjectGrant"),
  editProjectDeadline: document.querySelector("#editProjectDeadline"),
  editProjectReadiness: document.querySelector("#editProjectReadiness"),
  editProjectNextStep: document.querySelector("#editProjectNextStep"),
  editProjectNote: document.querySelector("#editProjectNote"),
  editProjectSubmit: document.querySelector("#editProjectSubmit"),
  editProjectCancel: document.querySelector("#editProjectCancel"),
  editProjectHint: document.querySelector("#editProjectHint"),
};



const FILTERS_STORAGE_KEY = "technopark_dashboard_filters_v1";

function persistFilters() {
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state.filters));
  } catch (_) {
    // ignore storage errors
  }
}

function hydrateFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.filters = { ...state.filters, ...saved };
  } catch (_) {
    // ignore parse/storage errors
  }
}

function applyFilterControls() {
  els.searchInput.value = state.filters.query;
  els.statusFilter.value = state.filters.status;
  els.ownerFilter.value = state.filters.owner;
  els.readinessFilter.value = state.filters.readiness;
  els.riskFilter.value = state.filters.risk;
}

function setLoadingState(isLoading) {
  state.ui.isLoading = isLoading;
  if (els.refreshData) {
    els.refreshData.disabled = isLoading;
    els.refreshData.textContent = isLoading ? "Обновляю..." : "Обновить";
  }
  document.body.setAttribute("aria-busy", String(isLoading));
}

const FUNNEL_STAGES = [
  { name: "Идея", hint: "Зафиксировать проблему, целевую аудиторию и ожидаемый эффект." },
  { name: "Предварительная проработка", hint: "Проверить аналоги, ограничения, партнеров и базовую реализуемость." },
  { name: "ТЗ", hint: "Подготовить техническое задание, паспорт проекта и критерии результата." },
  { name: "Команда", hint: "Назначить ответственного, исполнителей, экспертов и роли." },
  { name: "Партнер", hint: "Получить письмо, пилотную площадку или внешнего заказчика." },
  { name: "Финансовая модель", hint: "Собрать смету, календарный план, источники софинансирования." },
  { name: "Грант / конкурс", hint: "Выбрать подходящее окно и проверить требования оператора." },
  { name: "Подача", hint: "Собрать комплект документов и назначить дату отправки." },
  { name: "Реализация", hint: "Вести сроки, бюджет, показатели и отчетные материалы." },
  { name: "Отчетность / результат", hint: "Оформить результаты, акты, публикации, медиа и внедрение." },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

function getValue(row, names) {
  const map = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]));
  for (const name of names) {
    const value = map[normalize(name)];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function clampPercent(value) {
  const match = String(value || "").replace(",", ".").match(/\d+(\.\d+)?/);
  if (!match) return null;
  return Math.max(0, Math.min(100, Math.round(Number(match[0]))));
}

function toIsoDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (gviz) return `${gviz[1]}-${String(Number(gviz[2]) + 1).padStart(2, "0")}-${String(gviz[3]).padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function formatDate(iso) {
  if (!iso) return "требует уточнения";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
}

function daysUntil(iso) {
  if (!iso) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${iso}T00:00:00`) - today) / 86400000);
}

function parseAmount(value) {
  const cleaned = String(value || "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .match(/\d+(\.\d+)?/g);
  if (!cleaned || !cleaned.length) return null;
  return Math.max(...cleaned.map(Number));
}

function setSync(message, type = "loading") {
  if (!els.syncStatus || !els.syncDot) return;
  els.syncStatus.textContent = message;
  els.syncDot.classList.toggle("ok", type === "ok");
  els.syncDot.classList.toggle("error", type === "error");
}

function showToast(message, type = "") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.toggle("error", type === "error");
  els.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 3500);
}

function gvizCell(cell) {
  return cell ? cell.f || cell.v || "" : "";
}

// Автоматически ищем строку заголовков, чтобы сайт переживал переносы и добавление служебных строк сверху.
function findHeaderIndex(rows, requiredWords) {
  const fallback = 0;
  let bestIndex = fallback;
  let bestScore = -1;
  rows.forEach((row, index) => {
    const text = normalize(row.join(" "));
    const score = requiredWords.reduce((sum, word) => sum + (text.includes(normalize(word)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function loadSheet(gid, requiredWords = ["проект"]) {
  return new Promise((resolve, reject) => {
    const callback = `callback_${gid}_${Date.now()}`;
    const script = document.createElement("script");

    window[callback] = (payload) => {
      delete window[callback];
      script.remove();
      if (!payload || payload.status === "error") {
        reject(new Error("Google Таблица временно недоступна"));
        return;
      }

      const rawRows = (payload.table.rows || []).map((row) => (row.c || []).map(gvizCell));
      const headerIndex = findHeaderIndex(rawRows, requiredWords);
      const headers = (rawRows[headerIndex] || []).map((h, i) => String(h || `col${i}`).trim());
      const data = rawRows
        .slice(headerIndex + 1)
        .filter((row) => row.some(Boolean))
        .map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] || ""])));

      resolve(data);
    };

    script.onerror = () => {
      delete window[callback];
      script.remove();
      reject(new Error("Не удалось загрузить данные Google Таблицы"));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?gid=${gid}&headers=0&tqx=responseHandler:${callback}&cacheBust=${Date.now()}`;
    document.head.append(script);
  });
}

function normalizeStatus(value) {
  const key = normalize(value);
  if (!key) return "требует уточнения";
  if (key.includes("готов") || key.includes("упаков")) return "готов к гранту";
  if (key.includes("подан")) return "подан на грант";
  if (key.includes("реализ")) return "в реализации";
  if (key.includes("приостан")) return "приостановлен";
  if (key.includes("нтс") || key.includes("решен")) return "требует решения НТС";
  if (key.includes("заверш")) return "завершен";
  if (key.includes("тз")) return "есть ТЗ";
  if (key.includes("проработ") || key.includes("работ")) return "на проработке";
  if (key.includes("иде")) return "идея";
  return String(value || "требует уточнения").trim().toLowerCase();
}

function normalizeProject(row) {
  const readiness = clampPercent(getValue(row, ["Готовность пакета", "Готовность", "Готовность %", "readiness", "Процент готовности"]));
  return {
    id: getValue(row, ["ID", "id", "№", "Номер"]),
    name: getValue(row, ["Проект", "Название", "Наименование", "Наименование проекта", "project"]) || "без названия",
    direction: getValue(row, ["Направление", "direction", "Тип", "Сфера"]),
    contour: getValue(row, ["Контур", "contour"]),
    priority: getValue(row, ["Приоритет", "priority"]),
    trl: getValue(row, ["УТГ", "TRL", "trl"]),
    stage: getValue(row, ["Стадия", "Этап", "stage"]),
    owner: getValue(row, ["Ответственный", "Команда", "Руководитель", "Инициатор", "owner"]),
    grant: getValue(row, ["Маршрут финансирования", "Ближайшее окно", "Грант", "Конкурс", "grant"]),
    window: getValue(row, ["Ближайшее окно", "Окно", "window"]),
    budget: getValue(row, ["Лимит / ориентир", "Бюджет", "Сумма", "budget"]),
    nextStep: getValue(row, ["Следующее действие", "Следующий шаг", "Действие", "Задача", "nextStep"]),
    deadline: toIsoDate(getValue(row, ["Срок", "Дедлайн", "Дата подачи", "Срок подачи", "deadline"])),
    readiness,
    status: normalizeStatus(getValue(row, ["Статус", "status", "Состояние"])),
    note: getValue(row, ["Блокер / примечание", "Примечание", "Комментарий", "Риск", "note"]),
  };
}

function normalizeGrant(row) {
  const windowText = getValue(row, ["Окно / статус на 27.04.2026", "Окно / статус", "Окно", "window", "Срок"]);
  return {
    route: getValue(row, ["Маршрут", "Грант", "Конкурс", "route"]),
    operator: getValue(row, ["Оператор", "operator"]),
    purpose: getValue(row, ["Для чего подходит", "purpose"]),
    applicant: getValue(row, ["Кто подает", "applicant"]),
    funding: getValue(row, ["Финансирование", "Сумма", "funding"]),
    window: windowText,
    deadline: toIsoDate(windowText),
    projects: getValue(row, ["Проекты из реестра", "projects"]),
    firstStep: getValue(row, ["Что подготовить первым", "Первый шаг", "firstStep"]),
    source: getValue(row, ["Источник", "Ссылка", "source"]),
  };
}

function normalizeFeedback(row) {
  return {
    id: getValue(row, ["ID"]),
    date: getValue(row, ["Дата и время", "Дата"]),
    author: getValue(row, ["ФИО / автор", "Автор", "ФИО"]),
    role: getValue(row, ["Роль / организация", "Роль"]),
    type: getValue(row, ["Тип обращения", "Тип сообщения", "Категория"]),
    project: getValue(row, ["Связанный проект", "Проект"]),
    priority: getValue(row, ["Приоритет"]),
    message: getValue(row, ["Текст пожелания", "Текст сообщения", "Сообщение"]),
    status: getValue(row, ["Статус", "Статус обработки", "Статус рассмотрения"]),
  };
}

function projectHasUnknown(project) {
  return !project.owner || !project.grant || !project.deadline || project.readiness === null || !project.nextStep;
}

function projectHasRisk(project) {
  return projectHasUnknown(project) || normalize(project.note).includes("нуж") || normalize(project.status).includes("нтс");
}

function statusBadge(status) {
  const key = normalize(status);
  if (key.includes("готов") || key.includes("реализ") || key.includes("подан")) return "green";
  if (key.includes("работ") || key.includes("тз") || key.includes("проработ")) return "blue";
  if (key.includes("уточ") || key.includes("нтс") || key.includes("иде")) return "yellow";
  if (key.includes("риск") || key.includes("приостан")) return "red";
  return "gray";
}

function deadlineBadge(project) {
  const d = daysUntil(project.deadline);
  if (!project.deadline) return { label: "нет точных данных", color: "yellow" };
  if (d < 0) return { label: "прошел срок", color: "red" };
  if (d <= 14) return { label: `${d} дн.`, color: "red" };
  if (d <= 45) return { label: `${d} дн.`, color: "yellow" };
  return { label: `${d} дн.`, color: "blue" };
}

function filteredProjects() {
  return state.projects.filter((project) => {
    const q = normalize(state.filters.query);
    const haystack = normalize([project.name, project.owner, project.status, project.grant, project.nextStep, project.note].join(" "));
    if (q && !haystack.includes(q)) return false;
    if (state.filters.status !== "all" && project.status !== state.filters.status) return false;
    if (state.filters.owner !== "all" && (project.owner || "требует уточнения") !== state.filters.owner) return false;
    if (state.filters.readiness === "ready" && (project.readiness ?? 0) < 70) return false;
    if (state.filters.readiness === "middle" && !((project.readiness ?? 0) >= 40 && (project.readiness ?? 0) < 70)) return false;
    if (state.filters.readiness === "low" && !((project.readiness ?? 0) < 40)) return false;
    if (state.filters.readiness === "unknown" && project.readiness !== null) return false;
    if (state.filters.risk === "risk" && !projectHasRisk(project)) return false;
    if (state.filters.risk === "unknown" && !projectHasUnknown(project)) return false;
    return true;
  });
}

function renderFilters() {
  const statuses = Array.from(new Set(state.projects.map((p) => p.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
  const owners = Array.from(new Set(state.projects.map((p) => p.owner || "требует уточнения"))).sort((a, b) => a.localeCompare(b, "ru"));
  els.statusFilter.innerHTML = `<option value="all">Все статусы</option>${statuses.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}`;
  els.ownerFilter.innerHTML = `<option value="all">Все ответственные</option>${owners.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}`;
  els.feedbackProject.innerHTML = `<option value="">Ко всему портфелю</option>${state.projects.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("")}`;
}

function renderKpi() {
  els.kpiTotal.textContent = state.projects.length;
  els.kpiActive.textContent = state.projects.filter((p) => !["завершен", "приостановлен"].includes(p.status)).length;
  els.kpiReady.textContent = state.projects.filter((p) => (p.readiness ?? 0) >= 70 || p.status.includes("готов")).length;
  els.kpiRisks.textContent = state.projects.filter(projectHasRisk).length;
}

function renderAttention() {
  const blocks = [
    ["Проекты без ответственного", state.projects.filter((p) => !p.owner).slice(0, 3)],
    ["Проекты без ТЗ / стадии ТЗ", state.projects.filter((p) => !normalize(p.stage).includes("тз") && !normalize(p.status).includes("тз")).slice(0, 3)],
    ["Проекты без грантовой траектории", state.projects.filter((p) => !p.grant).slice(0, 3)],
    ["Ближайшие дедлайны", state.projects.filter((p) => daysUntil(p.deadline) <= 45).sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline)).slice(0, 3)],
    ["Проекты с высоким риском", state.projects.filter(projectHasRisk).slice(0, 3)],
    ["Новые пожелания НТС", state.feedback.filter((f) => normalize(f.status).includes("нов") || !f.status).slice(0, 3)],
  ];

  els.leaderAttention.innerHTML = blocks.map(([title, items]) => {
    const names = items.map((item) => item.name || item.project || item.message).filter(Boolean).slice(0, 2).join("; ");
    return `<div class="attention-item"><strong>${escapeHtml(title)}</strong><small>${names ? escapeHtml(names) : "нет данных / ожидает заполнения"}</small></div>`;
  }).join("");

  const ntsItems = [
    ["Проекты на рассмотрение", state.projects.filter((p) => normalize(p.status).includes("нтс") || projectHasRisk(p)).slice(0, 4)],
    ["Вопросы для обсуждения", state.feedback.filter((f) => normalize(f.type).includes("вопрос")).slice(0, 4)],
    ["Риски", state.feedback.filter((f) => normalize(f.type).includes("риск")).slice(0, 4)],
    ["Решения, которые нужно принять", state.feedback.filter((f) => normalize(f.type).includes("решение")).slice(0, 4)],
  ];

  els.ntsAgenda.innerHTML = ntsItems.map(([title, items]) => {
    const names = items.map((item) => item.name || item.project || item.message).filter(Boolean).slice(0, 2).join("; ");
    return `<div class="attention-item"><strong>${escapeHtml(title)}</strong><small>${names ? escapeHtml(names) : "ожидает заполнения"}</small></div>`;
  }).join("");
}

function renderProjects() {
  const list = filteredProjects().sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
  if (!list.length) {
    els.projectGrid.innerHTML = `<div class="empty-state">Нет проектов под выбранные фильтры.</div>`;
    els.projectTable.innerHTML = "";
    return;
  }

  els.projectGrid.innerHTML = list.map((project) => {
    const deadline = deadlineBadge(project);
    const readiness = project.readiness === null ? "требует уточнения" : `${project.readiness}%`;
    const progress = project.readiness ?? 0;
    return `<article class="project-card">
      <div class="card-top"><h3>${escapeHtml(project.name)}</h3><span class="badge ${statusBadge(project.status)}">${escapeHtml(project.status)}</span></div>
      <div class="card-meta"><span class="badge blue">${escapeHtml(project.owner || "нет точных данных")}</span><span class="badge ${deadline.color}">${escapeHtml(formatDate(project.deadline))}</span>${projectHasUnknown(project) ? `<span class="badge yellow">нет точных данных</span>` : ""}</div>
      <div class="progress-track" title="Готовность пакета"><span style="width:${progress}%"></span></div>
      <p class="card-text"><strong>Грант:</strong> ${escapeHtml(project.grant || "требует уточнения")}</p>
      <p class="card-text"><strong>Следующее действие:</strong> ${escapeHtml(project.nextStep || "ожидает заполнения")}</p>
      <small class="card-text">Готовность: ${escapeHtml(readiness)} · ${escapeHtml(deadline.label)}</small>
    </article>`;
  }).join("");

  els.projectTable.innerHTML = list.map((project) => `<tr class="${projectHasRisk(project) ? "is-risk" : ""} ${deadlineBadge(project).color === "red" ? "is-critical" : ""}">
    <td><strong>${escapeHtml(project.name)}</strong><br><small>${escapeHtml(project.direction || "нет данных")}</small></td>
    <td>${escapeHtml(project.owner || "требует уточнения")}</td>
    <td><span class="badge ${statusBadge(project.status)}">${escapeHtml(project.status)}</span></td>
    <td>${escapeHtml(project.grant || "требует уточнения")}</td>
    <td>${escapeHtml(formatDate(project.deadline))}</td>
    <td>${project.readiness === null ? `<span class="badge yellow">нет точных данных</span>` : `${project.readiness}%`}</td>
    <td>${escapeHtml(project.nextStep || "ожидает заполнения")}</td>
    <td><button class="button ghost table-action" type="button" data-action="edit-project" data-id="${escapeHtml(project.id)}" data-name="${escapeHtml(project.name)}">Редактировать</button></td>
  </tr>`).join("");
}

function openProjectEditor(projectId) {
  const project = state.projects.find((item) => String(item.id) === String(projectId));
  if (!project) {
    showToast("Проект для редактирования не найден", "error");
    return;
  }
  if (!els.projectEditForm) return;

  els.projectEditForm.hidden = false;
  els.projectEditTitle.textContent = `Редактирование: ${project.name}`;
  els.editProjectId.value = project.id || "";
  els.editProjectName.value = project.name || "";
  els.editProjectOwner.value = project.owner || "";
  els.editProjectStatus.value = project.status || "";
  els.editProjectGrant.value = project.grant || "";
  els.editProjectDeadline.value = project.deadline || "";
  els.editProjectReadiness.value = project.readiness ?? "";
  els.editProjectNextStep.value = project.nextStep || "";
  els.editProjectNote.value = project.note || "";
  els.editProjectHint.textContent = "Измените поля и сохраните — запись уйдет в Google Таблицу через Apps Script.";
  els.editProjectHint.classList.remove("error");
}

function closeProjectEditor() {
  if (!els.projectEditForm) return;
  els.projectEditForm.hidden = true;
  els.projectEditForm.reset();
}

async function submitProjectEdit(event) {
  event.preventDefault();
  const projectId = els.editProjectId.value.trim();
  if (!projectId) {
    showToast("Не указан ID проекта для сохранения", "error");
    return;
  }

  const payload = {
    action: "update_project",
    confirmCode: CONFIG.confirmCode,
    id: projectId,
    project: els.editProjectName.value.trim(),
    owner: els.editProjectOwner.value.trim(),
    status: els.editProjectStatus.value.trim(),
    funding: els.editProjectGrant.value.trim(),
    deadline: els.editProjectDeadline.value,
    readiness: els.editProjectReadiness.value ? `${els.editProjectReadiness.value}%` : "",
    nextAction: els.editProjectNextStep.value.trim(),
    note: els.editProjectNote.value.trim(),
  };

  els.editProjectSubmit.disabled = true;
  els.editProjectHint.textContent = "Сохраняю изменения в Google Таблицу...";
  els.editProjectHint.classList.remove("error");

  try {
    const response = await fetch(CONFIG.scriptUrl, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ ok: response.ok }));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Не удалось обновить проект");

    const project = state.projects.find((item) => String(item.id) === String(projectId));
    if (project) {
      project.name = payload.project || project.name;
      project.owner = payload.owner;
      project.status = normalizeStatus(payload.status || project.status);
      project.grant = payload.funding;
      project.deadline = payload.deadline;
      project.readiness = payload.readiness ? clampPercent(payload.readiness) : null;
      project.nextStep = payload.nextAction;
      project.note = payload.note;
    }

    renderAll();
    closeProjectEditor();
    showToast("Проект обновлен в таблице");
  } catch (error) {
    els.editProjectHint.textContent = `Ошибка сохранения: ${error.message}`;
    els.editProjectHint.classList.add("error");
    showToast("Не удалось сохранить изменения", "error");
  } finally {
    els.editProjectSubmit.disabled = false;
  }
}

function grantStatus(grant) {
  const text = normalize(grant.window);
  const d = daysUntil(grant.deadline);
  if (grant.deadline && grant.deadline < CONFIG.juneStart) return { key: "early", label: "раннее окно / не приоритет с июня", color: "yellow", className: "is-low-priority" };
  if (grant.deadline && d < 0) return { key: "archive", label: "прошедший дедлайн", color: "gray", className: "is-archive" };
  if (grant.deadline && d <= 21) return { key: "urgent", label: "скоро завершится", color: "red", className: "is-low-priority" };
  if (grant.deadline && d > 45) return { key: "future", label: "позднее окно", color: "blue", className: "" };
  if (text.includes("монитор") || text.includes("провер")) return { key: "review", label: "требует перепроверки", color: "yellow", className: "is-low-priority" };
  return { key: "actual", label: "актуально", color: "green", className: "" };
}

function renderGrantsKpi(grants) {
  if (!els.grantsQuickKpi) return;
  if (!grants.length) {
    els.grantsQuickKpi.innerHTML = `<div class="empty-state">Нет данных для сводки</div>`;
    return;
  }
  const urgent = grants.filter((item) => item.status.key === "urgent").length;
  const actual = grants.filter((item) => item.status.key === "actual").length;
  const archived = grants.filter((item) => item.status.key === "archive").length;
  els.grantsQuickKpi.innerHTML = `
    <div><span>Актуальные</span><strong>${actual}</strong></div>
    <div><span>Срочные</span><strong>${urgent}</strong></div>
    <div><span>Архив</span><strong>${archived}</strong></div>
  `;
}

function renderGrants() {
  const prepared = state.grants
    .filter((g) => g.route)
    .map((grant) => ({
      ...grant,
      status: grantStatus(grant),
      amount: parseAmount(grant.funding),
      days: daysUntil(grant.deadline),
    }));

  if (!prepared.length) {
    if (els.grantsQuickKpi) els.grantsQuickKpi.innerHTML = "";
    els.grantGrid.innerHTML = `<div class="empty-state">Нет данных по грантам. Проверьте лист «Актуальные гранты».</div>`;
    return;
  }

  const query = normalize(state.grantFilters.query);
  const statusFilter = state.grantFilters.status;
  const filtered = prepared.filter((grant) => {
    const haystack = normalize([grant.route, grant.operator, grant.projects, grant.funding, grant.purpose].join(" "));
    const byQuery = !query || haystack.includes(query);
    const byStatus = statusFilter === "all"
      || grant.status.key === statusFilter
      || (statusFilter === "actual" && grant.status.key === "future");
    return byQuery && byStatus;
  });

  const sorted = filtered.sort((a, b) => {
    switch (state.grantFilters.sort) {
      case "priority_desc": {
        const aScore = a.status.key === "urgent" ? 3 : a.status.key === "actual" ? 2 : a.status.key === "future" ? 1 : 0;
        const bScore = b.status.key === "urgent" ? 3 : b.status.key === "actual" ? 2 : b.status.key === "future" ? 1 : 0;
        return bScore - aScore || a.days - b.days;
      }
      case "amount_desc":
        return (b.amount ?? -1) - (a.amount ?? -1);
      case "name_asc":
        return a.route.localeCompare(b.route, "ru");
      case "deadline_asc":
      default:
        return a.days - b.days;
    }
  });

  renderGrantsKpi(prepared);

  if (!sorted.length) {
    els.grantGrid.innerHTML = `<div class="empty-state"><strong>По текущим фильтрам грантов не найдено</strong>Попробуйте снять фильтр статуса или расширить поисковый запрос.</div>`;
    return;
  }

  els.grantGrid.innerHTML = sorted.map((grant) => {
    const source = grant.source ? `<a href="${escapeHtml(grant.source)}" target="_blank" rel="noreferrer">Источник</a>` : `<span class="badge yellow">ссылка не указана</span>`;
    const countdown = Number.isFinite(grant.days)
      ? (grant.days < 0 ? `дедлайн прошел ${Math.abs(grant.days)} дн. назад` : `до дедлайна ${grant.days} дн.`)
      : "дата требует уточнения";
    return `<article class="grant-card ${grant.status.className}">
      <div class="card-top"><h3>${escapeHtml(grant.route)}</h3><span class="badge ${grant.status.color}">${escapeHtml(grant.status.label)}</span></div>
      <p class="card-text"><strong>Оператор:</strong> ${escapeHtml(grant.operator || "нет данных")}</p>
      <p class="card-text"><strong>Сумма:</strong> ${escapeHtml(grant.funding || "требует уточнения")}</p>
      <p class="card-text"><strong>Кому подходит:</strong> ${escapeHtml(grant.purpose || "ожидает заполнения")}</p>
      <p class="card-text"><strong>Проекты:</strong> ${escapeHtml(grant.projects || "требует сопоставления")}</p>
      <p class="card-text"><strong>Первый шаг:</strong> ${escapeHtml(grant.firstStep || "ожидает заполнения")}</p>
      <div class="card-meta"><span class="badge blue">${escapeHtml(grant.window || "нет точных данных")}</span><span class="badge gray">${escapeHtml(countdown)}</span>${source}</div>
    </article>`;
  }).join("");
}

function resolveFunnelStage(project) {
  const text = normalize([project.stage, project.status, project.grant, project.owner, project.nextStep].join(" "));
  if (text.includes("отчет") || text.includes("результ")) return 9;
  if (text.includes("реализ")) return 8;
  if (text.includes("подан")) return 7;
  if (project.grant) return 6;
  if (text.includes("смет") || text.includes("финанс")) return 5;
  if (text.includes("партнер") || text.includes("пилот") || text.includes("письм")) return 4;
  if (project.owner) return 3;
  if (text.includes("тз") || text.includes("паспорт")) return 2;
  if (text.includes("проработ") || text.includes("прототип") || text.includes("mvp")) return 1;
  return 0;
}

function renderFunnel() {
  const buckets = FUNNEL_STAGES.map((stage) => ({ ...stage, projects: [] }));
  state.projects.forEach((project) => buckets[resolveFunnelStage(project)].projects.push(project));
  els.funnelBoard.innerHTML = buckets.map((stage, index) => {
    const bottleneck = stage.projects.filter(projectHasRisk).length;
    const next = bottleneck ? "Снять неопределенность и назначить ответственного" : "Поддерживать движение к следующему этапу";
    return `<article class="funnel-stage">
      <span class="funnel-number">${index + 1}</span>
      <h3>${escapeHtml(stage.name)}</h3>
      <div class="card-meta"><span class="badge blue">${stage.projects.length} проектов</span><span class="badge ${bottleneck ? "yellow" : "green"}">${bottleneck ? `${bottleneck} узких мест` : "без явных рисков"}</span></div>
      <p class="stage-hint"><strong>Что дальше:</strong> ${escapeHtml(next)}</p>
      <p class="stage-hint"><strong>Рекомендация:</strong> ${escapeHtml(stage.hint)}</p>
      <div class="funnel-projects">${stage.projects.slice(0, 5).map((p) => `<div class="funnel-project">${escapeHtml(p.name)}</div>`).join("") || `<div class="empty-state">пока нет проектов</div>`}</div>
    </article>`;
  }).join("");
}

function renderFeedback() {
  const items = state.feedback.filter((item) => item.message || item.author).slice(0, 8);
  if (!items.length) {
    els.feedbackFeed.innerHTML = `<div class="empty-state">Пока нет загруженных пожеланий. Новые записи будут сохранены в лист «Пожелания НТС».</div>`;
    return;
  }
  els.feedbackFeed.innerHTML = items.map((item) => `<article class="feedback-item">
    <div class="card-meta"><span class="badge blue">${escapeHtml(item.type || "пожелание")}</span><span class="badge ${normalize(item.priority).includes("крит") || normalize(item.priority).includes("выс") ? "red" : "yellow"}">${escapeHtml(item.priority || "средний")}</span><span class="badge gray">${escapeHtml(item.status || "новое")}</span></div>
    <strong>${escapeHtml(item.author || "Автор не указан")}</strong>
    <p class="message">${escapeHtml(item.message)}</p>
    <small>${escapeHtml(item.project || "ко всему портфелю")} · ${escapeHtml(item.date || "дата не указана")}</small>
  </article>`).join("");
}

function renderAll() {
  renderKpi();
  renderAttention();
  renderProjects();
  renderGrants();
  renderFunnel();
  renderFeedback();
}

async function loadAllData() {
  const requestId = ++state.ui.requestId;
  setLoadingState(true);
  setSync("Загружаю проекты, гранты и пожелания НТС из Google Таблицы...");
  try {
    const [projectRows, grantRows, feedbackRows] = await Promise.all([
      loadSheet(CONFIG.sheets.projects, ["проект", "статус"]),
      loadSheet(CONFIG.sheets.grants, ["маршрут", "оператор"]),
      loadSheet(CONFIG.sheets.nts, ["фио", "текст"]).catch(() => []),
    ]);

    if (requestId !== state.ui.requestId) return;

    state.projects = projectRows.map(normalizeProject).filter((p) => p.name && p.name !== "без названия");
    state.grants = grantRows.map(normalizeGrant).filter((g) => g.route);
    state.feedback = feedbackRows.map(normalizeFeedback).filter((f) => f.message || f.author).reverse();
    state.ui.lastLoadedAt = new Date().toISOString();

    renderFilters();
    applyFilterControls();
    if (els.grantSearchInput) els.grantSearchInput.value = state.grantFilters.query;
    if (els.grantStatusFilter) els.grantStatusFilter.value = state.grantFilters.status;
    if (els.grantSortSelect) els.grantSortSelect.value = state.grantFilters.sort;
    renderAll();
    setSync(`Данные загружены: ${state.projects.length} проектов, ${state.grants.length} грантов, ${state.feedback.length} пожеланий НТС. Источник проектов: gid ${CONFIG.sheets.projects}.`, "ok");
  } catch (error) {
    if (requestId !== state.ui.requestId) return;
    setSync("Не удалось загрузить данные. Проверьте доступ к Google Таблице или структуру листа.", "error");
    showToast(error.message || "Ошибка загрузки данных", "error");
  } finally {
    if (requestId === state.ui.requestId) setLoadingState(false);
  }
}

function handleFilters() {
  state.filters.query = els.searchInput.value;
  state.filters.status = els.statusFilter.value;
  state.filters.owner = els.ownerFilter.value;
  state.filters.readiness = els.readinessFilter.value;
  state.filters.risk = els.riskFilter.value;
  persistFilters();
  renderProjects();
}

async function submitFeedback(event) {
  event.preventDefault();
  const button = els.ntsForm.querySelector("button[type='submit']");
  const formData = new FormData(els.ntsForm);
  const payload = {
    action: "add_nts_feedback",
    formKey: CONFIG.formKey,
    author: formData.get("author"),
    role: formData.get("role"),
    project: formData.get("project"),
    type: formData.get("type"),
    category: formData.get("type"),
    priority: formData.get("priority"),
    message: formData.get("message"),
    status: "новое",
    section: "Пожелания НТС",
    source: "site-v3",
    userAgent: navigator.userAgent,
    createdAt: new Date().toISOString(),
  };

  els.formNote.textContent = "Отправляю пожелание в Google Таблицу...";
  els.formNote.classList.remove("error");
  button.disabled = true;

  try {
    const response = await fetch(CONFIG.scriptUrl, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ ok: response.ok }));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Ошибка записи в таблицу");
    els.ntsForm.reset();
    els.formNote.textContent = "Пожелание отправлено. Статус обработки: новое.";
    showToast("Пожелание отправлено");
    state.feedback.unshift({ ...payload, date: new Date().toLocaleString("ru-RU") });
    renderFeedback();
    renderAttention();
  } catch (error) {
    els.formNote.textContent = `Не удалось отправить пожелание: ${error.message}. Проверьте публикацию Apps Script как Web App.`;
    els.formNote.classList.add("error");
    showToast("Ошибка отправки пожелания", "error");
  } finally {
    button.disabled = false;
  }
}

function setupNavigation() {
  els.menuToggle.addEventListener("click", () => {
    const open = !els.mainNav.classList.contains("is-open");
    els.mainNav.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    els.menuToggle.setAttribute("aria-expanded", String(open));
  });
  els.navLinks.forEach((link) => link.addEventListener("click", () => {
    els.mainNav.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    els.menuToggle.setAttribute("aria-expanded", "false");
  }));

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    els.navLinks.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { threshold: 0.28 });
  ["overview", "projects", "grants", "funnel", "nts"].forEach((id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

function setupEvents() {
  els.refreshData.addEventListener("click", loadAllData);
  const debouncedSearch = debounce(handleFilters, 220);
  els.searchInput.addEventListener("input", debouncedSearch);
  [els.statusFilter, els.ownerFilter, els.readinessFilter, els.riskFilter].forEach((el) => el.addEventListener("input", handleFilters));
  if (els.grantSearchInput) {
    const debouncedGrantSearch = debounce(() => {
      state.grantFilters.query = els.grantSearchInput.value;
      renderGrants();
    }, 180);
    els.grantSearchInput.addEventListener("input", debouncedGrantSearch);
  }
  if (els.grantStatusFilter) {
    els.grantStatusFilter.addEventListener("input", () => {
      state.grantFilters.status = els.grantStatusFilter.value;
      renderGrants();
    });
  }
  if (els.grantSortSelect) {
    els.grantSortSelect.addEventListener("input", () => {
      state.grantFilters.sort = els.grantSortSelect.value;
      renderGrants();
    });
  }
  els.ntsForm.addEventListener("submit", submitFeedback);
  els.projectTable.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='edit-project']");
    if (!button) return;
    openProjectEditor(button.dataset.id);
  });
  if (els.projectEditForm) {
    els.projectEditForm.addEventListener("submit", submitProjectEdit);
  }
  if (els.editProjectCancel) {
    els.editProjectCancel.addEventListener("click", closeProjectEditor);
  }
}

/* UX улучшение 3: Добавляем эффект тени шапки при прокрутке */
function setupScrollShadow() {
  const topShell = document.querySelector(".top-shell");
  if (!topShell) return;
  
  let lastScrollY = 0;
  window.addEventListener("scroll", () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > 10 && lastScrollY <= 10) {
      topShell.classList.add("scrolled");
    } else if (currentScrollY <= 10 && lastScrollY > 10) {
      topShell.classList.remove("scrolled");
    }
    lastScrollY = currentScrollY;
  }, { passive: true });
}

/* НОВЫЕ УЛУЧШЕНИЯ: Сохранение прокрутки, клавиатурная навигация, фокус управление */
function enhanceKeyboardNavigation() {
  // 35. УЛУЧШЕНИЕ: ESC для закрытия меню
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const nav = document.querySelector(".main-nav");
      if (nav && nav.classList.contains("is-open")) {
        document.querySelector(".menu-button").click();
      }
    }
  });

}

/* 37. УЛУЧШЕНИЕ: Сохранение позиции скролла при возврате */
function enhanceScrollRestoration() {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  sessionStorage.getItem("scrollPos") && window.scrollTo(0, parseInt(sessionStorage.getItem("scrollPos")));
  window.addEventListener("beforeunload", () => {
    sessionStorage.setItem("scrollPos", window.scrollY);
  });
}

/* 38. УЛУЧШЕНИЕ: Фокус ловушка в модалях */
function enhanceFocusManagement() {
  const modals = document.querySelectorAll(".modal-overlay");
  modals.forEach((modal) => {
    const focusableElements = modal.querySelectorAll("button, [href], input, select, textarea");
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    });
    firstElement && firstElement.focus();
  });
}

/* 39. УЛУЧШЕНИЕ: Поддержка prefers-reduced-motion */
function respectReducedMotion() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    document.documentElement.style.setProperty("--transition-duration", "0.01s");
  }
}

/* 40. УЛУЧШЕНИЕ: Обработка сетевых ошибок с retry логикой */
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/* 41. УЛУЧШЕНИЕ: Automatic data refresh с интервалом */
let autoRefreshTimer;
function setupAutoRefresh(interval = 300000) {
  // 5 минут по умолчанию
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      loadAllData().catch((err) => console.error("Auto-refresh failed:", err));
    }
  }, interval);
}

/* 42. УЛУЧШЕНИЕ: Pause при неактивной вкладке */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInterval(autoRefreshTimer);
  } else {
    setupAutoRefresh();
  }
});

/* 43. УЛУЧШЕНИЕ: Live region announcements для скрин-ридеров */
function announceToScreenReader(message) {
  const announcement = document.createElement("div");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "sr-only";
  announcement.textContent = message;
  document.body.appendChild(announcement);
  setTimeout(() => announcement.remove(), 1000);
}

/* 44. УЛУЧШЕНИЕ: Дебаунс для поиска */
function debounce(func, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/* 45. УЛУЧШЕНИЕ: Throttle для скролла */
function throttle(func, limit = 100) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/* 46-55. НОВЫЕ УЛУЧШЕНИЯ: JS функции для поддержки новых CSS стилей */

/* 46. УЛУЧШЕНИЕ: Show save indicator */
function showSaveIndicator(element, duration = 2000) {
  const indicator = document.createElement("div");
  indicator.className = "save-indicator";
  indicator.textContent = "Сохранено";
  element.appendChild(indicator);
  setTimeout(() => indicator.remove(), duration);
}

/* 47. УЛУЧШЕНИЕ: Toggle chip selection */
function setupChipSelection() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      if (e.target.textContent === "×") {
        chip.remove();
      } else {
        chip.classList.toggle("is-selected");
      }
    });
  });
}

/* 48. УЛУЧШЕНИЕ: Setup progress steps */
function updateProgressStep(stepNumber) {
  document.querySelectorAll(".progress-step").forEach((step, index) => {
    step.classList.remove("is-active", "is-completed");
    if (index + 1 <= stepNumber) {
      if (index + 1 === stepNumber) {
        step.classList.add("is-active");
      } else {
        step.classList.add("is-completed");
      }
    }
  });
}

/* 49. УЛУЧШЕНИЕ: Setup tabs navigation */
function setupTabs() {
  document.querySelectorAll(".tabs").forEach((tabsContainer) => {
    const tabs = tabsContainer.querySelectorAll(".tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        const contentId = tab.getAttribute("data-tab");
        if (contentId) {
          document.querySelectorAll(`[data-tab-content]`).forEach((content) => {
            content.style.display = content.getAttribute("data-tab-content") === contentId ? "block" : "none";
          });
        }
      });
    });
  });
}

/* 50. УЛУЧШЕНИЕ: Setup pagination */
function setupPagination() {
  const paginationButtons = document.querySelectorAll(".pagination button, .pagination a");
  paginationButtons.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      paginationButtons.forEach((b) => b.classList.remove("is-active"));
      this.classList.add("is-active");
    });
  });
}

/* 51. УЛУЧШЕНИЕ: Show loading spinner */
function showLoadingSpinner(container) {
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  spinner.style.cssText = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);";
  const parent = container.parentElement;
  parent.style.position = "relative";
  parent.appendChild(spinner);
  return spinner;
}

/* 52. УЛУЧШЕНИЕ: Setup form validation with feedback */
function setupFormValidation() {
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", function (e) {
      const inputs = this.querySelectorAll("input[required], textarea[required]");
      let isValid = true;
      inputs.forEach((input) => {
        if (!input.value.trim()) {
          input.classList.add("is-invalid");
          isValid = false;
        } else {
          input.classList.remove("is-invalid");
        }
      });
      if (!isValid) e.preventDefault();
    });
  });
}

/* 53. УЛУЧШЕНИЕ: Enhanced search with glow */
function enhanceSearchInput() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;
  searchInput.addEventListener("focus", () => {
    searchInput.style.animation = "searchGlow 1.5s ease-out";
  });
}

/* 55. УЛУЧШЕНИЕ: Keyboard shortcuts registration */
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (!isMod) return;

    if (key === "k") {
      e.preventDefault();
      els.searchInput.focus();
      announceToScreenReader("Фокус на поле поиска");
    }

    if (key === "r" && !e.shiftKey && document.visibilityState === "visible") {
      e.preventDefault();
      loadAllData();
      announceToScreenReader("Запущено обновление данных");
    }
  });
}

hydrateFilters();
setupNavigation();
setupScrollShadow();
setupEvents();

// Инициализация новых улучшений
enhanceKeyboardNavigation();
enhanceFocusManagement();
respectReducedMotion();
setupChipSelection();
setupTabs();
setupPagination();
setupFormValidation();
enhanceSearchInput();
setupKeyboardShortcuts();
setupAutoRefresh();

applyFilterControls();
loadAllData();
