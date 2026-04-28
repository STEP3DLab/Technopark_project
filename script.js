const API_CONFIG = {
  enabled: true,
  baseUrl: "https://script.google.com/macros/s/AKfycbwiOYwnD7aozxYFzox4JokcHIZjR-OD7FUXcn16n0YqH1gdHoWqgqYXy2CmIJaiN9o/exec",
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

const state = {
  projects: [],
  grants: [],
  connection: { projects: "demo-данные", grants: "demo-данные", feedback: API_CONFIG.enabled ? "Google Таблица" : "недоступно" },
  connectionCounts: { projects: 0, grants: 0 },
  diagnostics: { issues: [], filter: "all", mode: "short", visible: 5 },
  expandedProjectId: null,
  activeStage: null,
  expandedGrantKey: null,
  expandedRiskGroup: null,
  filters: { search: "", status: "all", readiness: "all", risk: "all", grant: "all", grantOperator: "all", grantSearch: "" }
};

const elements = {
  currentDate: document.getElementById("currentDate"),
  connectionStatus: document.getElementById("connectionStatus"),
  dataDiagnostics: document.getElementById("dataDiagnostics"),
  diagnosticFilters: document.getElementById("diagnosticFilters"),
  kpiGrid: document.getElementById("kpiGrid"),
  funnelSteps: document.getElementById("funnelSteps"),
  stageDetails: document.getElementById("stageDetails"),
  projectsTable: document.getElementById("projectsTable"),
  projectsMobile: document.getElementById("projectsMobile"),
  emptyProjects: document.getElementById("emptyProjects"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  readinessFilter: document.getElementById("readinessFilter"),
  riskFilter: document.getElementById("riskFilter"),
  grantFilter: document.getElementById("grantFilter"),
  grantOperatorFilter: document.getElementById("grantOperatorFilter"),
  grantSearchInput: document.getElementById("grantSearchInput"),
  grantCalendar: document.getElementById("grantCalendar"),
  riskList: document.getElementById("riskList"),
  ntsForm: document.getElementById("ntsForm"),
  ntsProjectSelect: document.getElementById("ntsProjectSelect"),
  wishLog: document.getElementById("wishLog"),
  toastStack: document.getElementById("toastStack")
};

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  elements.currentDate.textContent = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const [projects, grants] = await Promise.all([loadProjects(), loadGrants()]);
  state.projects = projects;
  state.grants = grants;
  state.activeStage = FUNNEL_STAGES[0];
  fillFilterOptions();
  bindEvents();
  renderAll();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", e => { state.filters.search = e.target.value.toLowerCase().trim(); renderProjectsCompact(); });
  [elements.statusFilter, elements.readinessFilter, elements.riskFilter, elements.grantFilter].forEach(select => {
    select.addEventListener("change", e => { state.filters[e.target.id.replace("Filter", "")] = e.target.value; renderProjectsCompact(); });
  });
  elements.grantOperatorFilter.addEventListener("change", e => { state.filters.grantOperator = e.target.value; renderGrantsCompact(); });
  elements.grantSearchInput.addEventListener("input", e => { state.filters.grantSearch = e.target.value.toLowerCase().trim(); renderGrantsCompact(); });
  elements.diagnosticFilters.addEventListener("click", e => {
    const btn = e.target.closest("[data-diagnostic-filter]");
    if (!btn) return;
    state.diagnostics.filter = btn.dataset.diagnosticFilter;
    state.diagnostics.visible = state.diagnostics.filter === "critical" ? 10 : 5;
    renderCompactDiagnostics();
  });
  elements.ntsForm.addEventListener("submit", handleWishSubmit);
}

function renderAll() {
  renderKpis();
  renderConnectionStatus();
  state.diagnostics.issues = buildDiagnostics(state.projects, state.grants);
  renderCompactDiagnostics();
  renderFunnel();
  renderProjectsCompact();
  renderGrantsCompact();
  renderRisks();
  renderWishLog();
}

function renderKpis() {
  const total = state.projects.length;
  const ready = state.projects.filter(p => p.status === "Готов к грантам").length;
  const risky = state.projects.filter(p => p.risk === "Высокий").length;
  const work = state.projects.filter(p => p.status === "Требует доработки").length;
  const decision = state.projects.filter(p => p.needsDecision).length;
  const data = [
    ["Всего проектов", total, "в реестре", ""],
    ["Готовы к грантам", ready, "пакет собран", "is-good"],
    ["Требуют доработки", work, "нужны шаги", "is-warning"],
    ["Высокий риск", risky, "контроль", "is-danger"],
    ["Решение руководителя", decision, "ожидают", "is-warning"]
  ];
  elements.kpiGrid.innerHTML = data.map(([label, val, hint, c]) => `<article class="kpi-card ${c}"><strong>${val}</strong><span>${label}</span><small>${hint}</small></article>`).join("");
}

function renderConnectionStatus() {
  const p = state.connection.projects === "Google Таблица" ? `Google Таблица, ${state.connectionCounts.projects} записей` : "локальный файл";
  const g = state.connection.grants === "Google Таблица" ? `Google Таблица, ${state.connectionCounts.grants} записей` : "локальный файл";
  const nts = state.connection.feedback === "Google Таблица" ? "доступно" : "локально";
  elements.connectionStatus.textContent = `Данные: проекты — ${p} · гранты — ${g} · НТС — ${nts}`;
}

function renderCompactDiagnostics() {
  const all = state.diagnostics.issues;
  const filtered = all.filter(issue => {
    const filter = state.diagnostics.filter;
    if (filter === "all") return true;
    if (["critical", "warning", "recommendation"].includes(filter)) return issue.severity === filter;
    return issue.type === filter;
  }).sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const summary = {
    total: all.length,
    critical: all.filter(i => i.severity === "critical").length,
    warning: all.filter(i => i.severity === "warning").length,
    recommendation: all.filter(i => i.severity === "recommendation").length
  };
  const statusClass = summary.critical ? "is-critical" : summary.warning ? "is-warning" : summary.recommendation ? "is-recommendation" : "is-ok";
  const statusText = summary.critical ? "Есть критические проблемы" : summary.warning ? "Есть предупреждения" : "Критичных рисков в данных не найдено";

  elements.diagnosticFilters.querySelectorAll(".chip").forEach(btn => btn.classList.toggle("is-active", btn.dataset.diagnosticFilter === state.diagnostics.filter));

  const limit = state.diagnostics.mode === "short" ? (state.diagnostics.filter === "critical" ? 10 : 5) : state.diagnostics.visible;
  const page = paginateList(filtered, limit);

  elements.dataDiagnostics.innerHTML = `
    <div class="diagnostics-headline ${statusClass}">${statusText}</div>
    <div class="diag-kpis">
      <article class="diag-kpi"><strong>${summary.total}</strong><span>Всего проблем</span></article>
      <article class="diag-kpi"><strong>${summary.critical}</strong><span>Критические</span></article>
      <article class="diag-kpi"><strong>${summary.warning}</strong><span>Предупреждения</span></article>
      <article class="diag-kpi"><strong>${summary.recommendation}</strong><span>Рекомендации</span></article>
    </div>
    <div class="diagnostic-controls">
      <button class="chip ${state.diagnostics.mode === "short" ? "is-active" : ""}" data-mode="short">Кратко</button>
      <button class="chip ${state.diagnostics.mode === "full" ? "is-active" : ""}" data-mode="full">Подробно</button>
      <button class="chip" data-action="collapse-all">Свернуть все</button>
      <button class="chip" data-action="expand-critical">Развернуть критические</button>
      <span class="meta-count">Показано ${page.items.length} из ${filtered.length}</span>
    </div>
    <div id="diagnosticContent"></div>
  `;

  const content = elements.dataDiagnostics.querySelector("#diagnosticContent");
  if (!filtered.length) {
    content.innerHTML = `<div class="risk-empty">По выбранному фильтру проблем не найдено.</div>`;
  } else if (state.diagnostics.mode === "short") {
    const frag = document.createDocumentFragment();
    page.items.forEach(issue => frag.append(renderDiagnosticIssue(issue)));
    content.append(frag);
  } else {
    renderDiagnosticsGroup(content, filtered);
  }

  elements.dataDiagnostics.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
    state.diagnostics.mode = btn.dataset.mode;
    if (state.diagnostics.mode === "full") state.diagnostics.visible = 10;
    renderCompactDiagnostics();
  }));

  const showMoreText = state.diagnostics.filter === "critical" ? "Показать еще" : `Показать еще 10`;
  if (page.hasMore && state.diagnostics.mode === "short") {
    const moreBtn = document.createElement("button");
    moreBtn.className = "chip";
    moreBtn.textContent = showMoreText;
    moreBtn.addEventListener("click", () => {
      state.diagnostics.visible += 10;
      renderCompactDiagnostics();
    });
    content.append(moreBtn);
  }

  elements.dataDiagnostics.querySelector("[data-action='collapse-all']").addEventListener("click", collapseAllAccordions);
  elements.dataDiagnostics.querySelector("[data-action='expand-critical']").addEventListener("click", () => {
    document.querySelectorAll(".accordion[data-severity='critical']").forEach(acc => acc.classList.add("is-open"));
  });
}

function renderDiagnosticIssue(issue) {
  const wrap = document.createElement("article");
  wrap.className = `issue-row is-${issue.severity}`;
  wrap.innerHTML = `
    <div class="issue-row__line">
      <p class="issue-title">${escapeHtml(issue.target)}: ${escapeHtml(issue.description)}</p>
      <span class="tag ${issue.severity === "critical" ? "tag--red" : issue.severity === "warning" ? "tag--yellow" : "tag--blue"}">${issue.severity}</span>
    </div>
    <div class="issue-actions"><button class="chip" data-show-rec>Подробнее</button></div>
    <div class="issue-extra" hidden>${escapeHtml(issue.recommendation)}</div>
  `;
  wrap.querySelector("[data-show-rec]").addEventListener("click", () => {
    const extra = wrap.querySelector(".issue-extra");
    extra.hidden = !extra.hidden;
  });
  return wrap;
}

function renderDiagnosticsGroup(container, issues) {
  const groups = {
    critical: { project: [], grant: [], relation: [] },
    warning: { project: [], grant: [], relation: [] },
    recommendation: { project: [], grant: [], relation: [] }
  };
  issues.forEach(i => groups[i.severity][i.type].push(i));

  ["critical", "warning", "recommendation"].forEach(sev => {
    const total = Object.values(groups[sev]).reduce((sum, arr) => sum + arr.length, 0);
    if (!total) return;
    const sevAcc = createAccordion(`${sev.toUpperCase()} — ${total}`, { severity: sev, open: false });
    const body = sevAcc.querySelector(".accordion__body");
    ["project", "grant", "relation"].forEach(type => {
      const rows = groups[sev][type];
      if (!rows.length) return;
      const typeAcc = createAccordion(`${diagnosticTypeLabel(type)} — ${rows.length}`, { severity: sev });
      const typeBody = typeAcc.querySelector(".accordion__body");
      rows.forEach(issue => typeBody.append(renderDiagnosticIssue(issue)));
      body.append(typeAcc);
    });
    container.append(sevAcc);
  });
}

function renderFunnel() {
  const total = state.projects.length || 1;
  const frag = document.createDocumentFragment();
  FUNNEL_STAGES.forEach(stage => {
    const count = state.projects.filter(p => p.stage === stage).length;
    const pct = Math.round((count / total) * 100);
    const button = document.createElement("button");
    button.className = `funnel-step ${state.activeStage === stage ? "is-active" : ""}`;
    button.innerHTML = `<h3>${escapeHtml(stage)}</h3><p>${count} · ${pct}%</p>`;
    button.addEventListener("click", () => {
      state.activeStage = state.activeStage === stage ? null : stage;
      renderFunnel();
    });
    frag.append(button);
  });
  elements.funnelSteps.replaceChildren(frag);

  if (!state.activeStage) {
    elements.stageDetails.innerHTML = "";
    return;
  }
  const current = state.projects.filter(p => p.stage === state.activeStage);
  const acc = createAccordion(`${state.activeStage}: ${current.length} проектов`, { open: true });
  const body = acc.querySelector(".accordion__body");
  if (!current.length) body.textContent = "На этапе пока нет проектов.";
  current.forEach(p => {
    const row = document.createElement("div");
    row.className = "issue-row";
    row.innerHTML = `<strong>${escapeHtml(p.id)}</strong> — ${escapeHtml(p.title)} <button class="chip" data-collapse>Свернуть этап</button>`;
    row.querySelector("[data-collapse]").addEventListener("click", () => { state.activeStage = null; renderFunnel(); });
    body.append(row);
  });
  elements.stageDetails.replaceChildren(acc);
}

function renderProjectsCompact() {
  const projects = getFilteredProjects();
  elements.emptyProjects.hidden = Boolean(projects.length);

  const tableFrag = document.createDocumentFragment();
  projects.forEach(project => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(project.id)}</td>
      <td><div class="project-title">${escapeHtml(project.title)}</div></td>
      <td><span class="tag tag--blue">${escapeHtml(project.stage)}</span></td>
      <td>${progressBar(project.readiness)}</td>
      <td>${statusTag(project.status)}</td>
      <td><span class="tag ${riskClass(project.risk)}">${escapeHtml(project.risk || "—")}</span></td>
      <td><button class="chip" data-project="${escapeHtml(project.id)}">${state.expandedProjectId === project.id ? "Свернуть" : "Подробнее"}</button></td>
    `;
    tableFrag.append(tr);
    if (state.expandedProjectId === project.id) {
      const details = document.createElement("tr");
      details.className = "details-row";
      details.innerHTML = `<td colspan="7">${renderProjectDetails(project)}</td>`;
      tableFrag.append(details);
    }
  });
  elements.projectsTable.replaceChildren(tableFrag);

  elements.projectsTable.querySelectorAll("[data-project]").forEach(btn => btn.addEventListener("click", () => {
    state.expandedProjectId = state.expandedProjectId === btn.dataset.project ? null : btn.dataset.project;
    renderProjectsCompact();
  }));

  const mobileFrag = document.createDocumentFragment();
  projects.forEach(project => {
    const card = document.createElement("article");
    card.className = "mobile-card";
    card.innerHTML = `
      <div><strong>${escapeHtml(project.id)}</strong></div>
      <div class="project-title">${escapeHtml(project.title)}</div>
      <div><span class="tag tag--blue">${escapeHtml(project.stage)}</span> ${statusTag(project.status)}</div>
      <div>${progressBar(project.readiness)}</div>
      <div><span class="tag ${riskClass(project.risk)}">${escapeHtml(project.risk || "—")}</span></div>
      <button class="chip" data-project="${escapeHtml(project.id)}">${state.expandedProjectId === project.id ? "Свернуть" : "Подробнее"}</button>
      <div class="mobile-details" ${state.expandedProjectId === project.id ? "" : "hidden"}>${renderProjectDetails(project)}</div>
    `;
    mobileFrag.append(card);
  });
  elements.projectsMobile.replaceChildren(mobileFrag);
  elements.projectsMobile.querySelectorAll("[data-project]").forEach(btn => btn.addEventListener("click", () => {
    state.expandedProjectId = state.expandedProjectId === btn.dataset.project ? null : btn.dataset.project;
    renderProjectsCompact();
  }));
}

function renderProjectDetails(project) {
  return `
    <div class="details-grid">
      <div><strong>Полное название:</strong><br>${escapeHtml(project.title)}</div>
      <div><strong>Направление / контур:</strong><br>${escapeHtml(project.direction || "—")} / ${escapeHtml(project.contour || "—")}</div>
      <div><strong>Ответственный:</strong><br>${escapeHtml(project.manager || "—")}</div>
      <div><strong>Маршрут финансирования:</strong><br>${escapeHtml((project.grants || []).join(", ") || "—")}</div>
      <div><strong>Ближайшее окно / лимит:</strong><br>${escapeHtml(project.nearestGrantWindow || "—")} / ${escapeHtml(project.fundingLimit || "—")}</div>
      <div><strong>Блокер / примечание:</strong><br>${escapeHtml(project.blocker || "—")}</div>
    </div>
  `;
}

function renderGrantsCompact() {
  const grants = state.grants.filter(g => {
    const byOperator = state.filters.grantOperator === "all" || g.operator === state.filters.grantOperator;
    const bySearch = !state.filters.grantSearch || `${g.title} ${g.operator}`.toLowerCase().includes(state.filters.grantSearch);
    return byOperator && bySearch;
  });
  const limit = 5;
  const page = paginateList(grants, limit);

  const frag = document.createDocumentFragment();
  page.items.forEach(grant => {
    const key = `${grant.title}-${grant.operator}`;
    const acc = createAccordion(`
      <div class="grant-head">
        <strong>${escapeHtml(grant.title)}</strong>
        <span class="grant-summary">${escapeHtml(grant.operator || "—")}</span>
        <span class="grant-summary">${escapeHtml(grant.window || "Окно не указано")}</span>
        <span class="grant-summary">Проектов: ${(grant.projects || []).length}</span>
        <span class="grant-summary">Уверенность: ${escapeHtml(grant.confidence || "—")}</span>
      </div>
    `, { rawTitle: true, open: state.expandedGrantKey === key });
    const body = acc.querySelector(".accordion__body");
    body.innerHTML = renderGrantDetails(grant);
    acc.querySelector(".accordion__trigger").addEventListener("click", () => {
      state.expandedGrantKey = state.expandedGrantKey === key ? null : key;
      renderGrantsCompact();
    });
    frag.append(acc);
  });

  if (!grants.length) {
    elements.grantCalendar.innerHTML = `<p class="empty-state">Гранты не найдены.</p>`;
    return;
  }

  elements.grantCalendar.replaceChildren(frag);
  if (page.hasMore) {
    const more = document.createElement("button");
    more.className = "chip";
    more.textContent = `Показать еще`;
    more.addEventListener("click", () => {
      elements.grantCalendar.append(...grants.slice(limit, limit + 5).map(g => {
        const row = document.createElement("div");
        row.className = "issue-row";
        row.textContent = `${g.title} · ${g.operator}`;
        return row;
      }));
      more.remove();
    });
    elements.grantCalendar.append(more);
  }
}

function renderGrantDetails(grant) {
  const source = String(grant.source || "").startsWith("http")
    ? `<a href="${escapeHtml(grant.source)}" target="_blank" rel="noopener">${escapeHtml(grant.source)}</a>`
    : escapeHtml(grant.source || "—");
  return `
    <div class="details-grid">
      <div><strong>Для чего подходит:</strong><br>${escapeHtml(grant.purpose || "—")}</div>
      <div><strong>Кто подает:</strong><br>${escapeHtml(grant.applicant || "—")}</div>
      <div><strong>Финансирование:</strong><br>${escapeHtml(grant.funding || "—")}</div>
      <div><strong>Проекты:</strong><br>${escapeHtml((grant.projects || []).join(", ") || "—")}</div>
      <div><strong>Что подготовить первым:</strong><br>${escapeHtml(grant.firstStep || "—")}</div>
      <div><strong>Источник:</strong><br>${source}</div>
    </div>
  `;
}

function renderRisks() {
  const groups = {
    "Документы": state.projects.filter(p => !p.hasPassport || !p.hasTZ || !p.hasBudget),
    "Сроки": state.projects.filter(p => daysUntil(p.nextActionDate) <= 14),
    "Руководители": state.projects.filter(p => !p.manager || p.manager === "Не назначен"),
    "Гранты": state.projects.filter(p => !(p.grants || []).length),
    "Решения руководителя": state.projects.filter(p => p.needsDecision)
  };

  const total = Object.values(groups).reduce((sum, arr) => sum + arr.length, 0);
  if (!total) {
    elements.riskList.innerHTML = `<div class="risk-empty">Критических рисков не найдено</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  Object.entries(groups).forEach(([name, list]) => {
    if (!list.length) return;
    const acc = createAccordion(`${name} — ${list.length}`, { open: state.expandedRiskGroup === name });
    const body = acc.querySelector(".accordion__body");
    list.forEach(project => {
      const item = document.createElement("div");
      item.className = "issue-row";
      item.textContent = `${project.id} · ${project.title}`;
      body.append(item);
    });
    acc.querySelector(".accordion__trigger").addEventListener("click", () => {
      state.expandedRiskGroup = state.expandedRiskGroup === name ? null : name;
      renderRisks();
    });
    frag.append(acc);
  });
  elements.riskList.replaceChildren(frag);
}

function createAccordion(title, options = {}) {
  const root = document.createElement("article");
  root.className = `accordion ${options.open ? "is-open" : ""}`;
  if (options.severity) root.dataset.severity = options.severity;
  root.innerHTML = `
    <button class="accordion__trigger" type="button">${options.rawTitle ? title : escapeHtml(title)}<span>${options.open ? "−" : "+"}</span></button>
    <div class="accordion__body"></div>
  `;
  root.querySelector(".accordion__trigger").addEventListener("click", () => toggleAccordion(root));
  return root;
}

function toggleAccordion(accordion, force = null) {
  const shouldOpen = force === null ? !accordion.classList.contains("is-open") : force;
  accordion.classList.toggle("is-open", shouldOpen);
  const marker = accordion.querySelector(".accordion__trigger span");
  if (marker) marker.textContent = shouldOpen ? "−" : "+";
}

function collapseAllAccordions() {
  document.querySelectorAll(".accordion.is-open").forEach(acc => toggleAccordion(acc, false));
}

function paginateList(list, visibleCount) {
  return { items: list.slice(0, visibleCount), hasMore: list.length > visibleCount, total: list.length };
}

function getFilteredProjects() {
  return state.projects.filter(project => {
    const query = `${project.id} ${project.title} ${project.manager}`.toLowerCase();
    const matchesSearch = !state.filters.search || query.includes(state.filters.search);
    const matchesStatus = state.filters.status === "all" || project.status === state.filters.status;
    const matchesRisk = state.filters.risk === "all" || riskToFilterValue(project.risk) === state.filters.risk;
    const matchesGrant = state.filters.grant === "all" || (project.grants || []).includes(state.filters.grant);
    const r = project.readiness || 0;
    const matchesReadiness = state.filters.readiness === "all"
      || (state.filters.readiness === "high" && r >= 80)
      || (state.filters.readiness === "medium" && r >= 50 && r < 80)
      || (state.filters.readiness === "low" && r < 50);
    return matchesSearch && matchesStatus && matchesRisk && matchesGrant && matchesReadiness;
  });
}

function fillFilterOptions() {
  fillSelect(elements.statusFilter, ["all", ...unique(state.projects.map(p => p.status))], "Все");
  fillSelect(elements.grantFilter, ["all", ...unique(state.projects.flatMap(p => p.grants || []))], "Все");
  fillSelect(elements.grantOperatorFilter, ["all", ...unique(state.grants.map(g => g.operator))], "Все");
  elements.ntsProjectSelect.innerHTML = state.projects.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.id)} · ${escapeHtml(p.title)}</option>`).join("");
}

function fillSelect(select, options, allLabel) {
  select.innerHTML = "";
  options.forEach(value => select.append(new Option(value === "all" ? allLabel : value, value)));
}

async function handleWishSubmit(event) {
  event.preventDefault();
  const fd = new FormData(event.target);
  const payload = {
    action: "feedback",
    fio: fd.get("fullName"),
    role: fd.get("role"),
    project: fd.get("project"),
    message: fd.get("wish"),
    priority: fd.get("priority"),
    createdAt: new Date().toISOString()
  };

  try {
    await submitFeedback(payload);
    state.connection.feedback = "Google Таблица";
    showToast("success", "Пожелание отправлено в Google Таблицу");
  } catch {
    saveFeedbackLocally(payload);
    state.connection.feedback = "недоступно";
    showToast("warning", "Связь недоступна: пожелание сохранено локально");
  }

  event.target.reset();
  renderConnectionStatus();
  renderWishLog();
}

function renderWishLog() {
  const wishes = getSavedWishes().slice(0, 4);
  elements.wishLog.innerHTML = wishes.length
    ? wishes.map(w => `<div class="wish-log__item"><strong>${escapeHtml(w.fullName)}</strong> · ${escapeHtml(w.priority)}<br>${escapeHtml(w.wish)}</div>`).join("")
    : `<p class="section-note">Пока пожеланий нет.</p>`;
}

function showToast(type, text) {
  const node = document.createElement("div");
  node.className = `toast is-${type}`;
  node.textContent = text;
  elements.toastStack.append(node);
  setTimeout(() => node.remove(), 3200);
}

function buildDiagnostics(projects, grants) {
  return [...validateProjects(projects), ...validateGrants(grants), ...validateRelations(projects, grants)];
}

function validateProjects(projects) {
  const issues = [];
  projects.forEach(p => {
    const add = (severity, description, recommendation) => issues.push({ type: "project", severity, target: p.id || "Проект без ID", description, recommendation });
    if (!p.id) add("critical", "нет ID", "Заполнить ID.");
    if (!p.title) add("critical", "нет названия", "Заполнить название.");
    if (!p.manager || p.manager === "Не назначен") add("critical", "нет руководителя", "Назначить ответственного.");
    if (Number.isNaN(Number(p.readiness)) || Number(p.readiness) < 0 || Number(p.readiness) > 100) add("critical", "некорректная готовность", "Указать число 0-100.");
    if (!p.nextAction) add("warning", "нет ближайшего действия", "Добавить следующий шаг.");
    if (!p.nextActionDate || !isValidDate(p.nextActionDate)) add("warning", "нет даты ближайшего действия", "Указать дату YYYY-MM-DD.");
    if (!(p.grants || []).length) add("warning", "не выбран грант", "Указать минимум один грант.");
    if (p.needsDecision) add("recommendation", "нужно решение руководителя", "Вынести на управленческую встречу.");
  });
  return issues;
}

function validateGrants(grants) {
  const issues = [];
  grants.forEach(g => {
    const add = (severity, description, recommendation) => issues.push({ type: "grant", severity, target: g.title || "Грант без названия", description, recommendation });
    if (!g.title) add("critical", "нет названия", "Заполнить маршрут.");
    if (!g.operator) add("warning", "нет оператора", "Заполнить оператора.");
    if (!g.window) add("warning", "нет окна подачи", "Заполнить окно.");
    if (!g.source) add("recommendation", "нет источника", "Добавить источник.");
  });
  return issues;
}

function validateRelations(projects, grants) {
  const issues = [];
  const projectIds = new Set(projects.map(p => p.id));
  projects.forEach(project => {
    (project.grants || []).forEach(name => {
      if (!hasMatchingGrant(name, grants)) {
        issues.push({ type: "relation", severity: "warning", target: project.id, description: `нет гранта «${name}» в реестре грантов`, recommendation: "Привести названия к единому виду." });
      }
    });
  });
  grants.forEach(grant => {
    (grant.projects || []).forEach(id => {
      if (!projectIds.has(id)) {
        issues.push({ type: "relation", severity: "warning", target: grant.title, description: `указан несуществующий проект ${id}`, recommendation: "Проверить ID проекта." });
      }
    });
  });
  return issues;
}

async function loadProjects() {
  try {
    const apiData = await fetchFromApi(API_CONFIG.endpoints.projects);
    const projects = getApiItems(apiData, "projects").map(normalizeProject);
    if (!projects.length) throw new Error("API empty");
    state.connection.projects = "Google Таблица";
    state.connectionCounts.projects = projects.length;
    return projects;
  } catch {}

  try {
    const response = await fetch(DATA_SOURCES.projects, { cache: "no-store" });
    if (!response.ok) throw new Error("local projects error");
    const projects = (await response.json()).map(normalizeProject);
    state.connection.projects = "локальный файл";
    state.connectionCounts.projects = projects.length;
    return projects;
  } catch {
    state.connection.projects = "demo-данные";
    return [];
  }
}

async function loadGrants() {
  try {
    const apiData = await fetchFromApi(API_CONFIG.endpoints.grants);
    const grants = getApiItems(apiData, "grants").map(normalizeGrant);
    if (!grants.length) throw new Error("API empty");
    state.connection.grants = "Google Таблица";
    state.connectionCounts.grants = grants.length;
    return grants;
  } catch {}

  try {
    const response = await fetch(DATA_SOURCES.grants, { cache: "no-store" });
    if (!response.ok) throw new Error("local grants error");
    const rows = parseCSV(await response.text()).filter(row => row["Маршрут"] || row["РњР°СЂС€СЂСѓС‚"]);
    const grants = rows.map(normalizeGrantRow);
    state.connection.grants = "локальный файл";
    state.connectionCounts.grants = grants.length;
    return grants;
  } catch {
    state.connection.grants = "demo-данные";
    return [];
  }
}

async function fetchFromApi(endpoint, options = {}) {
  if (!API_CONFIG.enabled) throw new Error("API disabled");
  const method = (options.method || "GET").toUpperCase();
  const url = method === "GET" ? appendTsParam(`${API_CONFIG.baseUrl}${endpoint}`) : `${API_CONFIG.baseUrl}${endpoint}`;
  const response = await fetch(url, { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return text; }
}

async function submitFeedback(feedback) {
  if (!API_CONFIG.enabled) throw new Error("API disabled");
  const response = await fetch(API_CONFIG.baseUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(feedback) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function saveFeedbackLocally(feedback) {
  const wishes = getSavedWishes();
  wishes.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), createdAt: feedback.createdAt, fullName: feedback.fio, role: feedback.role, project: feedback.project, wish: feedback.message, priority: feedback.priority });
  localStorage.setItem("ntsWishes", JSON.stringify(wishes));
}

function getSavedWishes() { try { return JSON.parse(localStorage.getItem("ntsWishes")) || []; } catch { return []; } }

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
    if (char === '"' && inQuotes && nextChar === '"') { cell += '"'; i += 1; }
    else if (char === '"') inQuotes = !inQuotes;
    else if (char === delimiter && !inQuotes) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !inQuotes) { if (char === "\r" && nextChar === "\n") i += 1; row.push(cell.trim()); if (row.some(v => v !== "")) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell.trim());
  if (row.some(v => v !== "")) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])));
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
    nearestGrantWindow: project.nearestGrantWindow || project["Ближайшее окно"] || "",
    fundingLimit: project.fundingLimit || project["Лимит / ориентир"] || "",
    hasPassport: normalizeBoolean(project.hasPassport ?? project["Паспорт проекта"]),
    hasTZ: normalizeBoolean(project.hasTZ ?? project["ТЗ"]),
    hasBudget: normalizeBoolean(project.hasBudget ?? project["Бюджет"]),
    needsDecision: normalizeBoolean(project.needsDecision ?? project["Требует решения руководителя"])
  };
}

function normalizeGrant(grant) { return grant["Маршрут"] || grant["РњР°СЂС€СЂСѓС‚"] ? normalizeGrantRow(grant) : { title: grant.title || grant.name || "", operator: grant.operator || "", purpose: grant.purpose || "", applicant: grant.applicant || "", funding: grant.funding || "", window: grant.window || "", projects: Array.isArray(grant.projects) ? grant.projects : splitProjects(grant.projects), firstStep: grant.firstStep || "", source: grant.source || "", checkedAt: grant.checkedAt || "", planFromJune: grant.planFromJune || "", confidence: grant.confidence || "" }; }

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

function getApiItems(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "string") { try { return getApiItems(JSON.parse(payload), key); } catch { return []; } }
  if (!payload || typeof payload !== "object") return [];
  if (payload.ok === false) throw new Error(payload.error || `API ${key} error`);
  if (Array.isArray(payload[key])) return payload[key];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function appendTsParam(url) { return `${url}${url.includes("?") ? "&" : "?"}_ts=${Date.now()}`; }
function splitProjects(value) { return String(value || "").split(/[;,\n]/).map(v => v.trim()).filter(Boolean); }
function detectDelimiter(text) { const line = text.split(/\r?\n/)[0] || ""; return (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length ? ";" : ","; }
function normalizeRisk(value) { const v = String(value || "").toLowerCase().trim(); if (["high", "высокий"].includes(v)) return "Высокий"; if (["medium", "средний"].includes(v)) return "Средний"; if (["low", "низкий"].includes(v)) return "Низкий"; return value || ""; }
function normalizeBoolean(value) { if (typeof value === "boolean") return value; if (typeof value === "number") return value > 0; return ["true", "1", "да", "есть", "yes", "y"].includes(String(value || "").toLowerCase().trim()); }
function hasMatchingGrant(projectGrantName, grants) { const target = normalizeForMatch(projectGrantName); return grants.some(g => normalizeForMatch(g.title).includes(target) || normalizeForMatch(g.operator).includes(target) || target.includes(normalizeForMatch(g.title))); }
function normalizeForMatch(value) { return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[«»"']/g, "").replace(/\s+/g, " ").trim(); }
function unique(items) { return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")); }
function severityRank(s) { return s === "critical" ? 0 : s === "warning" ? 1 : 2; }
function diagnosticTypeLabel(type) { if (type === "project") return "Проекты"; if (type === "grant") return "Гранты"; return "Связи"; }
function statusTag(status) { if (status === "Готов к грантам") return `<span class="tag tag--green">${escapeHtml(status)}</span>`; if (status === "В зоне риска") return `<span class="tag tag--red">${escapeHtml(status)}</span>`; if (status === "Требует решения руководителя") return `<span class="tag tag--yellow">${escapeHtml(status)}</span>`; return `<span class="tag tag--blue">${escapeHtml(status)}</span>`; }
function riskClass(risk) { if (risk === "Высокий") return "tag--red"; if (risk === "Средний") return "tag--yellow"; if (risk === "Низкий") return "tag--green"; return "tag--blue"; }
function riskToFilterValue(risk) { if (risk === "Высокий") return "high"; if (risk === "Средний") return "medium"; if (risk === "Низкий") return "low"; return "all"; }
function progressBar(value) { const val = Number(value) || 0; return `<div><strong>${val}%</strong><div class="progress-line"><span style="width:${val}%"></span></div></div>`; }
function daysUntil(dateString) { if (!isValidDate(dateString)) return Infinity; const now = new Date(); now.setHours(0,0,0,0); const d = new Date(dateString); d.setHours(0,0,0,0); return Math.ceil((d - now) / 86400000); }
function isValidDate(dateString) { return Boolean(dateString) && !Number.isNaN(new Date(dateString).getTime()); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
