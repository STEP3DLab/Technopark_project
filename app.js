/*
  Управленческая панель Технопарка РГСУ.
  Важное ограничение: сохраняем текущие URL Google Таблицы и Apps Script.
*/

const CONFIG = {
  sheetId: "1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60",
  sheetUrl: "https://docs.google.com/spreadsheets/d/1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60/edit",
  scriptUrl: "https://script.google.com/macros/s/AKfycbwzbWEjEpb1ySylb--7VhqEHvaC05WB5jhcw-8xpAj811bIJurVB3CW-ElDsoeKnWOA/exec",
  sheets: {
    projects: "341683209",
    grants: "1500721586",
    wishes: "202604270",
  },
  futureMarkDate: "2026-06-01",
};

const state = {
  projects: [],
  grants: [],
  wishes: [],
  filters: {
    q: "",
    status: "all",
    deadline: "all",
    riskOnly: false,
    readyOnly: false,
  },
  wishFilters: { project: "all", type: "all", priority: "all", status: "all", query: "", sort: "new" },
};

const FUNNEL_STAGES = ["Идея", "Прототип", "Пилот", "Готов к гранту", "Подан", "Получено решение"];

const els = {
  syncStatus: document.getElementById("syncStatus"),
  refreshData: document.getElementById("refreshData"),
  menuToggle: document.getElementById("menuToggle"),
  mainNav: document.getElementById("mainNav"),
  kpiGrid: document.getElementById("kpiGrid"),
  attentionList: document.getElementById("attentionList"),
  projectCount: document.getElementById("projectCount"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  deadlineFilter: document.getElementById("deadlineFilter"),
  riskOnly: document.getElementById("riskOnly"),
  readyOnly: document.getElementById("readyOnly"),
  resetFilters: document.getElementById("resetFilters"),
  projectsTable: document.getElementById("projectsTable"),
  projectsMobile: document.getElementById("projectsMobile"),
  funnelBoard: document.getElementById("funnelBoard"),
  funnelDetails: document.getElementById("funnelDetails"),
  timelineBoard: document.getElementById("timelineBoard"),
  wishForm: document.getElementById("wishForm"),
  wishSubmit: document.getElementById("wishSubmit"),
  wishProject: document.getElementById("wishProject"),
  wishFeed: document.getElementById("wishFeed"),
  wishStatus: document.getElementById("wishStatus"),
  ntsKpiGrid: document.getElementById("ntsKpiGrid"),
  wishProjectFilter: document.getElementById("wishProjectFilter"),
  wishTypeFilter: document.getElementById("wishTypeFilter"),
  wishPriorityFilter: document.getElementById("wishPriorityFilter"),
  wishStatusFilter: document.getElementById("wishStatusFilter"),
  wishSearch: document.getElementById("wishSearch"),
  wishSort: document.getElementById("wishSort"),
  jumpCritical: document.getElementById("jumpCritical"),
  jumpNew: document.getElementById("jumpNew"),
  jumpDecision: document.getElementById("jumpDecision"),
  sheetLink: document.getElementById("sheetLink"),
  scriptLink: document.getElementById("scriptLink"),
  footerSheet: document.getElementById("footerSheet"),
  footerScript: document.getElementById("footerScript"),
};

function normalize(v) {
  return String(v || "").trim().toLowerCase().replaceAll("ё", "е");
}

function getValue(row, names) {
  const map = Object.fromEntries(Object.entries(row).map(([k, v]) => [normalize(k), v]));
  for (const n of names) if (map[normalize(n)] !== undefined && map[normalize(n)] !== "") return map[normalize(n)];
  return "";
}

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const g = raw.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (g) return `${g[1]}-${String(Number(g[2]) + 1).padStart(2, "0")}-${String(g[3]).padStart(2, "0")}`;
  const m = raw.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!m) return "";
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU");
}

function daysUntil(iso) {
  if (!iso) return Infinity;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${iso}T00:00:00`) - now) / 86400000);
}

function percent(value) {
  const m = String(value || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? Math.max(0, Math.min(100, Math.round(Number(m[0])))) : null;
}

function gvizCell(cell) { return cell ? (cell.f || cell.v || "") : ""; }

function loadSheet(gid, requiredWords = ["проект"]) {
  return new Promise((resolve, reject) => {
    const cb = `cb_${gid}_${Date.now()}`;
    const script = document.createElement("script");

    window[cb] = (payload) => {
      delete window[cb];
      script.remove();
      if (!payload || payload.status === "error") return reject(new Error("Ошибка загрузки листа"));

      const rows = (payload.table.rows || []).map((r) => (r.c || []).map(gvizCell));
      let headerIndex = 0;
      let best = -1;
      rows.forEach((r, i) => {
        const txt = normalize(r.join(" "));
        const score = requiredWords.reduce((s, w) => s + (txt.includes(normalize(w)) ? 1 : 0), 0);
        if (score > best) { best = score; headerIndex = i; }
      });

      const headers = (rows[headerIndex] || []).map((h, i) => String(h || `col${i}`).trim());
      const data = rows.slice(headerIndex + 1)
        .filter((r) => r.some(Boolean))
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
      resolve(data);
    };

    script.onerror = () => {
      delete window[cb];
      script.remove();
      reject(new Error("Не удалось подключиться к Google Таблице"));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?gid=${gid}&headers=0&tqx=responseHandler:${cb}`;
    document.head.append(script);
  });
}

function normalizeProject(row) {
  const status = getValue(row, ["Статус", "Состояние", "stage", "Этап"]) || "Идея";
  return {
    id: getValue(row, ["ID", "№", "Номер"]),
    name: getValue(row, ["Проект", "Название", "Наименование проекта"]) || "Без названия",
    status,
    owner: getValue(row, ["Ответственный", "Команда", "Руководитель"]),
    grant: getValue(row, ["Грант", "Конкурс", "Маршрут финансирования"]),
    nextStep: getValue(row, ["Следующее действие", "Следующий шаг"]),
    budget: getValue(row, ["Бюджет", "Сумма", "Лимит / ориентир"]),
    docs: getValue(row, ["Ссылка на ТЗ", "Документы", "ТЗ"]),
    ntsComment: getValue(row, ["Комментарий НТС", "Комментарий", "Примечание"]),
    deadline: toIsoDate(getValue(row, ["Дедлайн", "Срок", "Дата подачи"])),
    readiness: percent(getValue(row, ["Готовность", "Готовность %", "Процент готовности"])),
  };
}

function normalizeGrant(row) {
  const submitDate = toIsoDate(getValue(row, ["Дата подачи", "Окно / статус", "Срок"]));
  return {
    name: getValue(row, ["Маршрут", "Грант", "Конкурс"]),
    prepStart: toIsoDate(getValue(row, ["Подготовка старт", "Период подготовки", "Старт"])) || (submitDate ? shiftDays(submitDate, -30) : ""),
    submitDate,
    reviewEnd: toIsoDate(getValue(row, ["Рассмотрение до", "Период рассмотрения"])) || (submitDate ? shiftDays(submitDate, 60) : ""),
    resultDate: toIsoDate(getValue(row, ["Дата результата", "Результат"])) || (submitDate ? shiftDays(submitDate, 90) : ""),
    projects: getValue(row, ["Проекты из реестра", "Проекты"]),
    owner: getValue(row, ["Ответственный", "Кто подает"]),
    link: getValue(row, ["Ссылка", "Источник"]),
  };
}

function normalizeWish(row) {
  // Поддержка разных заголовков без изменения структуры листа.
  const typeRaw = getValue(row, ["Тип обращения", "Тип сообщения", "category"]);
  return {
    author: getValue(row, ["ФИО / автор", "Автор", "ФИО"]),
    role: getValue(row, ["Роль / статус", "Роль", "Подразделение", "Статус автора"]),
    project: getValue(row, ["Проект", "Связанный проект"]),
    type: typeRaw || "пожелание",
    priority: getValue(row, ["Приоритет"]) || "средний",
    status: getValue(row, ["Статус обработки", "Статус", "Обработка"]) || "новое",
    date: getValue(row, ["Дата и время", "Дата"]) || new Date().toISOString(),
    message: getValue(row, ["Текст пожелания", "Сообщение"]),
    requiresLeader: normalize(getValue(row, ["Требует реакции руководителя", "Реакция руководителя"])) === "да" || normalize(typeRaw) === "риск" || normalize(getValue(row, ["Приоритет"])) === "критический",
  };
}

function shiftDays(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function hasRisk(project) {
  return !project.deadline || !project.nextStep || !project.grant || (project.readiness !== null && project.readiness < 50);
}

function isGrantReady(project) {
  return project.readiness !== null && project.readiness >= 75;
}

function loadProjects() {
  return loadSheet(CONFIG.sheets.projects, ["проект", "статус"]).then((rows) => rows.map(normalizeProject));
}

function renderKpi() {
  const total = state.projects.length;
  const ready = state.projects.filter(isGrantReady).length;
  const urgent = state.projects.filter((p) => Number.isFinite(daysUntil(p.deadline)) && daysUntil(p.deadline) <= 14 && daysUntil(p.deadline) >= 0).length;
  const risks = state.projects.filter(hasRisk).length;
  const wishes = state.wishes.length;

  const cards = [
    ["Всего проектов", total, "Текущий портфель", ""],
    ["Готовы к гранту", ready, "Можно подавать", "green"],
    ["Срочные дедлайны", urgent, "Риск потери срока", "orange"],
    ["Проекты с рисками", risks, "Требуют решения", "red"],
    ["Пожелания НТС", wishes, "Новые сигналы", ""],
  ];

  els.kpiGrid.innerHTML = cards.map(([t, v, m, cls]) => `
    <article class="kpi ${cls}">
      <div>${t}</div>
      <div class="value">${v}</div>
      <div class="meta">${m}</div>
    </article>`).join("");
}

function matchDeadlineFilter(project) {
  if (state.filters.deadline === "all") return true;
  if (state.filters.deadline === "none") return !project.deadline;
  const d = Number(state.filters.deadline);
  const days = daysUntil(project.deadline);
  return Number.isFinite(days) && days >= 0 && days <= d;
}

function filteredProjects() {
  return state.projects.filter((p) => {
    const byQ = !state.filters.q || normalize(p.name).includes(normalize(state.filters.q));
    const byStatus = state.filters.status === "all" || p.status === state.filters.status;
    const byDeadline = matchDeadlineFilter(p);
    const byRisk = !state.filters.riskOnly || hasRisk(p);
    const byReady = !state.filters.readyOnly || isGrantReady(p);
    return byQ && byStatus && byDeadline && byRisk && byReady;
  });
}

function renderProjects() {
  const list = filteredProjects();
  els.projectCount.textContent = `${list.length} из ${state.projects.length}`;

  if (!state.projects.length) {
    const msg = `<tr><td colspan="5">Проекты появятся здесь после заполнения таблицы.</td></tr>`;
    els.projectsTable.innerHTML = msg;
    els.projectsMobile.innerHTML = `<div class="empty">Проекты появятся здесь после заполнения таблицы.</div>`;
    return;
  }

  if (!list.length) {
    const msg = `<tr><td colspan="5">Нет проектов по выбранным фильтрам.</td></tr>`;
    els.projectsTable.innerHTML = msg;
    els.projectsMobile.innerHTML = `<div class="empty">Нет проектов по выбранным фильтрам.</div>`;
    return;
  }

  els.projectsTable.innerHTML = list.map((p, idx) => {
    const rid = `d_${idx}`;
    const riskLabel = hasRisk(p) ? "Есть" : "Низкий";
    return `
      <tr class="${hasRisk(p) ? "risk" : ""}" data-open="${rid}">
        <td>${p.name}</td>
        <td><span class="badge">${p.status}</span></td>
        <td>
          <div>${p.readiness ?? "—"}%</div>
          <div class="progress"><span style="width:${p.readiness ?? 0}%"></span></div>
        </td>
        <td>${fmtDate(p.deadline)}</td>
        <td>${riskLabel}</td>
      </tr>
      <tr id="${rid}" class="details-row" hidden>
        <td colspan="5">
          <strong>Команда / ответственный:</strong> ${p.owner || "—"}<br>
          <strong>Грант / конкурс:</strong> ${p.grant || "—"}<br>
          <strong>Следующее действие:</strong> ${p.nextStep || "—"}<br>
          <strong>Бюджет:</strong> ${p.budget || "—"}<br>
          <strong>Ссылка на ТЗ / документы:</strong> ${p.docs || "—"}<br>
          <strong>Комментарий НТС:</strong> ${p.ntsComment || "—"}
        </td>
      </tr>`;
  }).join("");

  els.projectsMobile.innerHTML = list.map((p) => `
    <article class="project-card ${hasRisk(p) ? "risk" : ""}">
      <details>
        <summary>
          <strong>${p.name}</strong><br>
          <span class="badge">${p.status}</span> · ${p.readiness ?? "—"}% · ${fmtDate(p.deadline)} · Риск: ${hasRisk(p) ? "Есть" : "Низкий"}
        </summary>
        <p><strong>Команда:</strong> ${p.owner || "—"}</p>
        <p><strong>Грант:</strong> ${p.grant || "—"}</p>
        <p><strong>Следующее действие:</strong> ${p.nextStep || "—"}</p>
        <p><strong>Бюджет:</strong> ${p.budget || "—"}</p>
        <p><strong>ТЗ/документы:</strong> ${p.docs || "—"}</p>
        <p><strong>Комментарий НТС:</strong> ${p.ntsComment || "—"}</p>
      </details>
    </article>`).join("");
}

function renderFunnel() {
  const map = new Map(FUNNEL_STAGES.map((s) => [s, []]));
  state.projects.forEach((p) => {
    const txt = normalize(`${p.status} ${p.nextStep}`);
    let stage = "Идея";
    if (txt.includes("прототип")) stage = "Прототип";
    if (txt.includes("пилот")) stage = "Пилот";
    if (txt.includes("готов")) stage = "Готов к гранту";
    if (txt.includes("подан")) stage = "Подан";
    if (txt.includes("решен") || txt.includes("получено")) stage = "Получено решение";
    map.get(stage).push(p);
  });

  const total = Math.max(state.projects.length, 1);
  els.funnelBoard.innerHTML = FUNNEL_STAGES.map((stage) => {
    const count = map.get(stage).length;
    const percent = Math.round((count / total) * 100);
    const insight = count === 0 ? "Этап пустой" : count < 3 ? "Этап узкий" : "Этап рабочий";
    return `<button class="funnel-item" data-stage="${stage}" type="button">
      <strong>${stage}</strong>
      <span>${count} проектов</span>
      <span>${percent}%</span>
      <small>${insight}</small>
      <div class="funnel-bar"><span style="width:${percent}%"></span></div>
    </button>`;
  }).join("");

  els.funnelBoard.querySelectorAll(".funnel-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stage = btn.dataset.stage;
      const projects = map.get(stage).map((p) => p.name);
      els.funnelDetails.classList.remove("empty");
      els.funnelDetails.innerHTML = `<strong>${stage}</strong><br>${projects.length ? projects.join("<br>") : "Нет проектов на этом этапе."}`;
    });
  });
}

function renderGrantTimeline() {
  const grants = state.grants.filter((g) => g.name);
  if (!grants.length) {
    els.timelineBoard.innerHTML = `<div class="empty">Нет данных по грантам. Проверьте лист с грантами.</div>`;
    return;
  }

  const starts = grants.map((g) => [g.prepStart, g.submitDate, g.reviewEnd, g.resultDate].filter(Boolean)).flat().sort();
  const min = starts[0];
  const max = starts[starts.length - 1];
  const total = Math.max(1, daysBetween(min, max));

  els.timelineBoard.innerHTML = grants.map((g) => {
    const planned = g.submitDate && g.submitDate >= CONFIG.futureMarkDate;
    const past = g.submitDate && daysUntil(g.submitDate) < 0;
    const deadlineRisk = g.submitDate && daysUntil(g.submitDate) <= 14 && daysUntil(g.submitDate) >= 0;
    const link = g.link ? `<a href="${g.link}" target="_blank" rel="noreferrer">ссылка</a>` : "—";

    return `<article class="timeline-row ${past ? "past" : ""}">
      <div class="timeline-head">
        <strong>${g.name}</strong>
        <span>${planned ? "Планируется после 1 июня" : ""} ${deadlineRisk ? "⚠️ близкий дедлайн" : ""}</span>
      </div>
      <div class="hint">Подготовка: ${fmtDate(g.prepStart)} · Подача: ${fmtDate(g.submitDate)} · Рассмотрение: ${fmtDate(g.reviewEnd)} · Результат: ${fmtDate(g.resultDate)}</div>
      <div class="hint">Ответственный/проекты: ${g.owner || "—"} ${g.projects ? `· ${g.projects}` : ""} · ${link}</div>
      ${renderGanttBar(g, min, total)}
    </article>`;
  }).join("");
}

function daysBetween(a, b) { return Math.ceil((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000); }

function segment(from, to, cls, min, total) {
  if (!from || !to) return "";
  const start = Math.max(0, daysBetween(min, from));
  const width = Math.max(1, daysBetween(from, to));
  return `<div class="seg ${cls}" style="grid-column:${Math.round((start / total) * 100) + 1} / span ${Math.max(1, Math.round((width / total) * 100))}"></div>`;
}

function renderGanttBar(g, min, total) {
  const prepEnd = g.submitDate || g.prepStart;
  return `<div class="gantt">
    ${segment(g.prepStart, prepEnd, "prep", min, total)}
    ${segment(g.submitDate, shiftDays(g.submitDate, 1), "submit", min, total)}
    ${segment(g.submitDate, g.reviewEnd, "review", min, total)}
    ${segment(g.reviewEnd, g.resultDate, "result", min, total)}
  </div>`;
}

function renderAttentionList() {
  const items = [];
  state.projects.forEach((p) => {
    if (!p.deadline) items.push([p.name, "Нет дедлайна", "Назначить дату и контрольную точку"]);
    if (!p.grant) items.push([p.name, "Нет выбранного гранта", "Сопоставить с грантовой воронкой"]);
    if (!p.nextStep) items.push([p.name, "Нет следующего действия", "Назначить шаг на 7 дней"]);
    if ((p.readiness || 0) > 75 && !p.grant) items.push([p.name, "Высокая готовность без гранта", "Вынести на решение руководителя"]);
    if (daysUntil(p.deadline) <= 30) items.push([p.name, "Дедлайн в ближайшие 30 дней", "Проверить документы и ответственного"]);
    if (p.ntsComment) items.push([p.name, "Есть замечания НТС", "Подготовить ответ и статус исполнения"]);
  });

  const top = items.slice(0, 12);
  els.attentionList.innerHTML = top.length
    ? top.map(([name, issue, action]) => `<div class="attention-item"><strong>${name}</strong><br>${issue}<br><span class="hint">Рекомендуемое действие: ${action}</span></div>`).join("")
    : `<div class="hint">Критичных задач не найдено.</div>`;
}

function renderWishes() {
  const list = filteredWishes();
  if (!state.wishes.length) {
    els.wishFeed.innerHTML = `<div class="empty-state">Пока нет сообщений НТС. Добавьте первое пожелание или замечание.</div>`;
    return;
  }
  if (!list.length) {
    els.wishFeed.innerHTML = `<div class="empty-state">По выбранным фильтрам сообщений нет.</div>`;
    return;
  }
  els.wishFeed.innerHTML = list.map((w, idx) => {
    const priorityClass = getPriorityClass(w.priority);
    const typeClass = normalize(w.type) === "риск" ? "type-risk" : normalize(w.type) === "решение нтс" ? "type-decision" : "";
    return `<article class="wish-item" id="wish_${idx}">
      <div class="wish-head"><strong>${w.author || "Автор не указан"}</strong><small>${formatWishDate(w.date)}</small></div>
      <div class="wish-meta">${w.role || "Роль не указана"} · ${w.project || "Ко всему портфелю"}</div>
      <div class="wish-badges">
        <span class="badge ${typeClass}">${w.type || "пожелание"}</span>
        <span class="badge ${priorityClass}">Приоритет: ${w.priority || "средний"}</span>
        <span class="badge status-pill">Статус: ${w.status || "новое"}</span>
      </div>
      <p>${w.message || "Текст не указан."}</p>
    </article>`;
  }).join("");
}

function formatWishDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (value || "дата не указана") : d.toLocaleString("ru-RU");
}

function getPriorityScore(priority) {
  const p = normalize(priority);
  if (p === "критический") return 4;
  if (p === "высокий") return 3;
  if (p === "средний") return 2;
  return 1;
}

function getPriorityClass(priority) {
  const p = normalize(priority);
  if (p === "критический") return "priority-critical";
  if (p === "высокий") return "priority-high";
  if (p === "средний") return "priority-mid";
  return "priority-low";
}

function filteredWishes() {
  const list = [...state.wishes].filter((w) => {
    const byProject = state.wishFilters.project === "all" || (w.project || "") === state.wishFilters.project;
    const byType = state.wishFilters.type === "all" || normalize(w.type) === normalize(state.wishFilters.type);
    const byPriority = state.wishFilters.priority === "all" || normalize(w.priority) === normalize(state.wishFilters.priority);
    const byStatus = state.wishFilters.status === "all" || normalize(w.status) === normalize(state.wishFilters.status);
    const byQuery = !state.wishFilters.query || normalize(`${w.message} ${w.author} ${w.project}`).includes(normalize(state.wishFilters.query));
    return byProject && byType && byPriority && byStatus && byQuery;
  });
  if (state.wishFilters.sort === "critical") list.sort((a, b) => getPriorityScore(b.priority) - getPriorityScore(a.priority));
  else if (state.wishFilters.sort === "unprocessed") list.sort((a, b) => Number(normalize(a.status) !== "новое") - Number(normalize(b.status) !== "новое"));
  else list.sort((a, b) => new Date(b.date) - new Date(a.date));
  return list;
}

function renderWishesKpi() {
  const all = state.wishes;
  const cards = [
    ["Всего сообщений", all.length],
    ["Новых", all.filter((w) => normalize(w.status) === "новое").length],
    ["Критических", all.filter((w) => normalize(w.priority) === "критический").length],
    ["Рисков", all.filter((w) => normalize(w.type) === "риск").length],
    ["Решений НТС", all.filter((w) => normalize(w.type) === "решение нтс").length],
    ["Без проекта", all.filter((w) => !w.project).length],
    ["Требуют реакции руководителя", all.filter((w) => w.requiresLeader || normalize(w.priority) === "критический" || normalize(w.type) === "риск").length],
  ];
  els.ntsKpiGrid.innerHTML = cards.map(([t, v]) => `<article class="nts-kpi"><div class="value">${v}</div><div class="hint">${t}</div></article>`).join("");
}

async function submitWish(event) {
  event.preventDefault();
  if (!els.wishForm.reportValidity()) return;
  const formData = new FormData(els.wishForm);
  const message = String(formData.get("message") || "").trim();
  if (!message) {
    els.wishStatus.className = "hint wish-error";
    els.wishStatus.textContent = "Добавьте текст сообщения перед отправкой.";
    return;
  }
  const payload = {
    action: "add_nts_feedback",
    formKey: "NTS_TECHNOPARK_2026",
    author: formData.get("author"),
    role: formData.get("role"),
    project: formData.get("project"),
    category: formData.get("type"),
    priority: formData.get("priority"),
    message: formData.get("message"),
    source: "site",
    userAgent: navigator.userAgent || "",
    createdAt: new Date().toISOString(),
  };

  els.wishSubmit.disabled = true;
  els.wishStatus.className = "hint";
  els.wishStatus.textContent = "Сообщение отправляется...";
  try {
    const response = await fetch(CONFIG.scriptUrl, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ ok: response.ok }));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Ошибка отправки");

    els.wishForm.reset();
    els.wishStatus.className = "hint wish-success";
    els.wishStatus.textContent = "Сообщение успешно отправлено в НТС.";
    state.wishes.unshift({
      ...payload,
      role: payload.role,
      type: payload.category,
      status: "новое",
      date: new Date().toISOString(),
      requiresLeader: normalize(payload.priority) === "критический" || normalize(payload.category) === "риск",
    });
    renderWishes();
    renderWishesKpi();
    renderKpi();
  } catch (e) {
    els.wishStatus.className = "hint wish-error";
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    els.wishStatus.textContent = isOffline
      ? "Нет подключения к таблице. Проверьте интернет и повторите отправку."
      : `Сообщение не отправилось: ${e.message}. Проверьте Apps Script URL.`;
  } finally {
    els.wishSubmit.disabled = false;
  }
}

function renderAll() {
  renderKpi();
  renderProjects();
  renderFunnel();
  renderGrantTimeline();
  renderAttentionList();
  renderWishes();
  renderWishesKpi();
}

function applyWishFiltersFromUI() {
  state.wishFilters.project = els.wishProjectFilter.value;
  state.wishFilters.type = els.wishTypeFilter.value;
  state.wishFilters.priority = els.wishPriorityFilter.value;
  state.wishFilters.status = els.wishStatusFilter.value;
  state.wishFilters.query = els.wishSearch.value.trim();
  state.wishFilters.sort = els.wishSort.value;
  renderWishes();
}

function applyFiltersFromUI() {
  state.filters.q = els.searchInput.value.trim();
  state.filters.status = els.statusFilter.value;
  state.filters.deadline = els.deadlineFilter.value;
  state.filters.riskOnly = els.riskOnly.checked;
  state.filters.readyOnly = els.readyOnly.checked;
  renderProjects();
}

function fillFilterOptions() {
  const statuses = [...new Set(state.projects.map((p) => p.status).filter(Boolean))];
  els.statusFilter.innerHTML = `<option value="all">Все статусы</option>${statuses.map((s) => `<option value="${s}">${s}</option>`).join("")}`;
  const projects = [...new Set(state.projects.map((p) => p.name).filter(Boolean))];
  els.wishProject.innerHTML = `<option value="">Ко всему портфелю (без проекта)</option>${projects.map((name) => `<option>${name}</option>`).join("")}`;
  els.wishProjectFilter.innerHTML = `<option value="all">Все проекты</option><option value="">Ко всему портфелю</option>${projects.map((name) => `<option>${name}</option>`).join("")}`;
}

function bindUi() {
  els.menuToggle.addEventListener("click", () => {
    const isOpen = els.mainNav.classList.toggle("open");
    els.menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
  els.mainNav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      els.mainNav.classList.remove("open");
      els.menuToggle.setAttribute("aria-expanded", "false");
    })
  );

  [els.searchInput, els.statusFilter, els.deadlineFilter, els.riskOnly, els.readyOnly].forEach((el) => el.addEventListener("input", applyFiltersFromUI));
  els.resetFilters.addEventListener("click", () => {
    els.searchInput.value = "";
    els.statusFilter.value = "all";
    els.deadlineFilter.value = "all";
    els.riskOnly.checked = false;
    els.readyOnly.checked = false;
    applyFiltersFromUI();
  });

  els.refreshData.addEventListener("click", initData);
  els.wishForm.addEventListener("submit", submitWish);
  [els.wishProjectFilter, els.wishTypeFilter, els.wishPriorityFilter, els.wishStatusFilter, els.wishSearch, els.wishSort]
    .forEach((el) => el.addEventListener("input", applyWishFiltersFromUI));
  // Быстрые кнопки переключают фильтры, чтобы за 1 клик увидеть нужный блок.
  els.jumpCritical.addEventListener("click", () => {
    els.wishPriorityFilter.value = "критический";
    els.wishSort.value = "critical";
    applyWishFiltersFromUI();
  });
  els.jumpNew.addEventListener("click", () => {
    els.wishStatusFilter.value = "новое";
    els.wishSort.value = "new";
    applyWishFiltersFromUI();
  });
  els.jumpDecision.addEventListener("click", () => {
    els.wishTypeFilter.value = "решение НТС";
    applyWishFiltersFromUI();
  });

  els.projectsTable.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-open]");
    if (!row) return;
    const id = row.dataset.open;
    const detail = document.getElementById(id);
    if (detail) detail.hidden = !detail.hidden;
  });
}

async function initData() {
  els.syncStatus.textContent = "Данные загружаются";
  els.kpiGrid.innerHTML = new Array(5).fill(0).map(() => '<div class="skeleton"></div>').join("");
  els.wishFeed.innerHTML = '<div class="empty-state">Загрузка сообщений НТС…</div>';

  try {
    const [projectsRows, grantsRows, wishesRows] = await Promise.all([
      loadProjects(),
      loadSheet(CONFIG.sheets.grants, ["маршрут", "грант"]).then((rows) => rows.map(normalizeGrant)),
      loadSheet(CONFIG.sheets.wishes, ["фио", "пожел"]).then((rows) => rows.map(normalizeWish)).catch(() => []),
    ]);

    state.projects = projectsRows;
    state.grants = grantsRows;
    state.wishes = wishesRows.reverse();

    fillFilterOptions();
    renderAll();
    els.syncStatus.textContent = `Данные обновлены: ${state.projects.length} проектов.`;
  } catch (error) {
    els.syncStatus.textContent = "Не удалось загрузить данные из таблицы. Проверьте Apps Script URL.";
    if (!state.projects.length) {
      els.kpiGrid.innerHTML = '<article class="kpi"><div>Проверьте подключение к таблице</div><div class="meta">Нет данных</div></article>';
      els.projectsTable.innerHTML = '<tr><td colspan="5">Не удалось загрузить данные из таблицы.</td></tr>';
      els.timelineBoard.innerHTML = '<div class="empty">Проверьте URL таблицы и Apps Script.</div>';
    }
    els.wishFeed.innerHTML = '<div class="empty-state">Данные НТС не загрузились. Проверьте подключение к таблице и Apps Script.</div>';
  }
}

function initLinks() {
  [els.sheetLink, els.footerSheet].forEach((el) => { el.href = CONFIG.sheetUrl; });
  [els.scriptLink, els.footerScript].forEach((el) => { el.href = CONFIG.scriptUrl; });
}

bindUi();
initLinks();
initData();
