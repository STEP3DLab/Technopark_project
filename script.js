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

const QUICK_LINKS = {
  registry: { label: "Реестр проектов", href: "#projects" },
  googleSheet: { label: "Google Таблица", href: "https://docs.google.com/spreadsheets/d/1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60/edit" },
  feedback: { label: "Пожелания НТС", href: "#nts" },
  protocols: { label: "Протоколы НТС", href: "#" },
  grantRoutes: { label: "Грантовые маршруты", href: "#grants" },
  dashboard: { label: "Сайт панели", href: "https://step3dlab.github.io/Technopark_project/" }
};

const FUNNEL_STAGES = ["Идея", "Паспорт проекта", "ТЗ", "Команда", "Бюджет", "Грантовая заявка", "Подано", "Поддержано"];

const state = {
  projects: [],
  grants: [],
  connection: { projects: "demo-данные", grants: "demo-данные", feedback: API_CONFIG.enabled ? "Google Таблица" : "недоступно" },
  connectionCounts: { projects: 0, grants: 0 },
  diagnostics: { issues: [], filter: "all", mode: "short", visible: 5, expandedGroup: null },
  expandedProjectId: null,
  activeStage: null,
  expandedGrantKey: null,
  grantsVisible: 5,
  expandedRiskGroup: null,
  filters: { search: "", status: "all", readiness: "all", risk: "all", grant: "all", grantOperator: "all", grantSearch: "" }
};

const elements = {
  currentDate: document.getElementById("currentDate"),
  connectionStatus: document.getElementById("connectionStatus"),
  dataDiagnostics: document.getElementById("dataDiagnostics"),
  diagnosticFilters: document.getElementById("diagnosticFilters"),
  kpiGrid: document.getElementById("kpiGrid"),
  kpiWarning: document.getElementById("kpiWarning"),
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
  toastStack: document.getElementById("toastStack"),
  quickLinks: document.getElementById("quickLinks")
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
  elements.searchInput.addEventListener("input", e => {
    state.filters.search = e.target.value.toLowerCase().trim();
    renderProjectsCompact();
  });

  elements.statusFilter.addEventListener("change", e => {
    state.filters.status = e.target.value;
    renderProjectsCompact();
  });

  elements.readinessFilter.addEventListener("change", e => {
    state.filters.readiness = e.target.value;
    renderProjectsCompact();
  });

  elements.riskFilter.addEventListener("change", e => {
    state.filters.risk = e.target.value;
    renderProjectsCompact();
  });

  elements.grantFilter.addEventListener("change", e => {
    state.filters.grant = e.target.value;
    renderProjectsCompact();
  });

  elements.grantOperatorFilter.addEventListener("change", e => {
    state.filters.grantOperator = e.target.value;
    state.grantsVisible = 5;
    renderGrantsCompact();
  });

  elements.grantSearchInput.addEventListener("input", e => {
    state.filters.grantSearch = e.target.value.toLowerCase().trim();
    state.grantsVisible = 5;
    renderGrantsCompact();
  });

  elements.diagnosticFilters.addEventListener("click", e => {
    const btn = e.target.closest("[data-diagnostic-filter]");
    if (!btn) return;
    state.diagnostics.filter = btn.dataset.diagnosticFilter;
    state.diagnostics.visible = 5;
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
  renderQuickLinks();
}

function renderKpis() {
  const total = state.projects.length;
  const ready = state.projects.filter(p => p.status === "Готов к грантам").length;
  const needsWork = state.projects.filter(p => p.status === "Требует доработки").length;
  const risky = state.projects.filter(p => p.risk === "Высокий").length;
  const decision = state.projects.filter(p => p.needsDecision).length;
  const kpis = [
    { label: "Всего проектов", value: total, hint: "в работе", className: "is-neutral" },
    { label: "Готовы к грантам", value: ready, hint: "готовность", className: "is-good" },
    { label: "Требуют доработки", value: needsWork, hint: "нужен план", className: "is-warning" },
    { label: "Высокий риск", value: risky, hint: "контроль", className: "is-danger" },
    { label: "Требуют решений", value: decision, hint: "на НТС", className: "is-warning" }
  ];

  elements.kpiGrid.innerHTML = kpis
    .map(item => `<article class="kpi-card ${item.className}"><strong>${item.value}</strong><span>${item.label}</span><small>${item.hint}</small></article>`)
    .join("");

  const isDataLost = !state.projects.length && state.connection.projects === "demo-данные";
  elements.kpiWarning.hidden = !isDataLost;
  elements.kpiWarning.textContent = "KPI рассчитаны по demo-режиму. Проверьте подключение к Google Таблице.";
}

function renderConnectionStatus() {
  const isDemoProjects = state.connection.projects === "demo-данные";
  const isDemoGrants = state.connection.grants === "demo-данные";

  if (isDemoProjects && isDemoGrants) {
    elements.connectionStatus.textContent = "Данные: demo-режим. Проверьте подключение к таблице";
    return;
  }

  const projectText = state.connection.projects === "Google Таблица"
    ? `Google Таблица, ${state.connectionCounts.projects} записей`
    : "локальный файл";

  const grantText = state.connection.grants === "Google Таблица"
    ? `Google Таблица, ${state.connectionCounts.grants} записей`
    : "локальный файл";

  const ntsText = state.connection.feedback === "Google Таблица" ? "доступно" : "локально";
  elements.connectionStatus.textContent = `Данные: проекты - ${projectText} · гранты - ${grantText} · НТС - ${ntsText}`;
}

function renderCompactDiagnostics() {
  const all = state.diagnostics.issues;
  const filtered = all
    .filter(issue => {
      const filter = state.diagnostics.filter;
      if (filter === "all") return true;
      if (["critical", "warning", "recommendation"].includes(filter)) return issue.severity === filter;
      return issue.type === filter;
    })
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const summary = {
    total: all.length,
    critical: all.filter(i => i.severity === "critical").length,
    warning: all.filter(i => i.severity === "warning").length,
    recommendation: all.filter(i => i.severity === "recommendation").length
  };

  const statusClass = summary.critical
    ? "is-critical"
    : summary.warning
      ? "is-warning"
      : summary.recommendation
        ? "is-recommendation"
        : "is-ok";

  const statusText = summary.critical
    ? "Есть критические ошибки"
    : summary.warning
      ? "Есть предупреждения"
      : summary.recommendation
        ? "Есть рекомендации"
        : "Данные заполнены корректно";

  elements.diagnosticFilters.querySelectorAll(".chip").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.diagnosticFilter === state.diagnostics.filter);
  });

  elements.dataDiagnostics.innerHTML = `
    <div class="diagnostics-headline ${statusClass}">${statusText}</div>
    <div class="diag-kpis">
      <article class="diag-kpi"><strong>${summary.total}</strong><span>Всего проблем</span></article>
      <article class="diag-kpi"><strong>${summary.critical}</strong><span>Критические</span></article>
      <article class="diag-kpi"><strong>${summary.warning}</strong><span>Предупреждения</span></article>
      <article class="diag-kpi"><strong>${summary.recommendation}</strong><span>Рекомендации</span></article>
    </div>
    <div class="diagnostic-controls">
      <button type="button" class="chip ${state.diagnostics.mode === "short" ? "is-active" : ""}" data-mode="short">Кратко</button>
      <button type="button" class="chip ${state.diagnostics.mode === "full" ? "is-active" : ""}" data-mode="full">Подробно</button>
      <span class="meta-count" id="diagCounter"></span>
    </div>
    <div id="diagnosticContent"></div>
  `;

  const content = elements.dataDiagnostics.querySelector("#diagnosticContent");
  const counter = elements.dataDiagnostics.querySelector("#diagCounter");

  if (!filtered.length) {
    counter.textContent = "Показано 0 из 0";
    content.innerHTML = `<div class="risk-empty">По выбранному фильтру проблем не найдено.</div>`;
  } else if (state.diagnostics.mode === "short") {
    const page = paginateList(filtered, state.diagnostics.visible);
    counter.textContent = `Показано ${page.items.length} из ${filtered.length}`;
    const frag = document.createDocumentFragment();
    const list = document.createElement("div");
    list.className = "diag-list";
    page.items.forEach(issue => list.append(renderDiagnosticIssue(issue)));
    frag.append(list);

    if (page.hasMore) {
      const moreBtn = document.createElement("button");
      moreBtn.className = "chip";
      moreBtn.type = "button";
      moreBtn.textContent = "Показать еще";
      moreBtn.addEventListener("click", () => {
        state.diagnostics.visible += 5;
        renderCompactDiagnostics();
      });
      frag.append(moreBtn);
    }
    content.replaceChildren(frag);
  } else {
    counter.textContent = `Показано ${filtered.length} из ${filtered.length}`;
    renderDiagnosticsDetailed(content, filtered);
  }

  elements.dataDiagnostics.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
    state.diagnostics.mode = btn.dataset.mode;
    state.diagnostics.visible = 5;
    renderCompactDiagnostics();
  }));
}

function renderDiagnosticsDetailed(container, issues) {
  const groups = {
    "Документы": issues.filter(item => item.category === "Документы"),
    "Бюджет": issues.filter(item => item.category === "Бюджет"),
    "ТЗ": issues.filter(item => item.category === "ТЗ"),
    "Руководители": issues.filter(item => item.category === "Руководители"),
    "Сроки": issues.filter(item => item.category === "Сроки"),
    "Гранты": issues.filter(item => item.category === "Гранты"),
    "Связи": issues.filter(item => item.category === "Связи")
  };

  const firstCriticalCategory = Object.entries(groups).find(([, items]) => items.some(item => item.severity === "critical"))?.[0] || "Документы";
  const fragment = document.createDocumentFragment();

  Object.entries(groups).forEach(([name, items]) => {
    if (!items.length) return;
    const open = state.diagnostics.expandedGroup ? state.diagnostics.expandedGroup === name : name === firstCriticalCategory;
    const accordion = createAccordion(`${name} — ${items.length}`, { open });
    const body = accordion.querySelector(".accordion__body");
    const list = document.createElement("div");
    list.className = "diag-list";
    items.forEach(issue => list.append(renderDiagnosticIssue(issue)));
    body.append(list);
    accordion.querySelector(".accordion__trigger").addEventListener("click", () => {
      state.diagnostics.expandedGroup = state.diagnostics.expandedGroup === name ? null : name;
      renderCompactDiagnostics();
    });
    fragment.append(accordion);
  });

  if (!fragment.childNodes.length) {
    container.innerHTML = `<div class="risk-empty">Проблемы для подробной сводки не найдены.</div>`;
    return;
  }
  container.replaceChildren(fragment);
}

function renderDiagnosticIssue(issue) {
  const wrap = document.createElement("article");
  wrap.className = `issue-row is-${issue.severity}`;
  wrap.innerHTML = `
    <div class="issue-row__line">
      <p class="issue-title">${escapeHtml(issue.target)}: ${escapeHtml(issue.description)}</p>
      <span class="tag ${issue.severity === "critical" ? "tag--red" : issue.severity === "warning" ? "tag--yellow" : "tag--blue"}">${severityLabel(issue.severity)}</span>
    </div>
    <div class="issue-actions">
      <button type="button" class="chip" data-show-rec>Подробнее</button>
      <span class="meta-count">${escapeHtml(issue.category)}</span>
    </div>
    <div class="issue-extra" hidden>${escapeHtml(issue.recommendation)}</div>
  `;
  wrap.querySelector("[data-show-rec]").addEventListener("click", () => {
    const extra = wrap.querySelector(".issue-extra");
    extra.hidden = !extra.hidden;
  });
  return wrap;
}

function renderFunnel() {
  const total = state.projects.length || 1;
  const frag = document.createDocumentFragment();

  FUNNEL_STAGES.forEach(stage => {
    const stageProjects = state.projects.filter(project => project.stage === stage);
    const count = stageProjects.length;
    const pct = Math.round((count / total) * 100);
    const button = document.createElement("button");
    button.type = "button";
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

  const current = state.projects.filter(project => project.stage === state.activeStage);
  const acc = createAccordion(`${state.activeStage} — ${current.length} проектов`, { open: true });
  const body = acc.querySelector(".accordion__body");

  if (!current.length) {
    body.innerHTML = `<div class="risk-empty">На этапе пока нет проектов.</div>`;
  } else {
    const list = document.createElement("div");
    list.className = "diag-list";
    current.forEach(project => {
      const row = document.createElement("div");
      row.className = "issue-row";
      row.innerHTML = `<strong>${escapeHtml(project.id)}</strong> — ${escapeHtml(project.title)}`;
      list.append(row);
    });
    body.append(list);
  }

  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "chip";
  collapse.textContent = "Свернуть";
  collapse.addEventListener("click", () => {
    state.activeStage = null;
    renderFunnel();
  });
  body.append(collapse);

  elements.stageDetails.replaceChildren(acc);
}

function renderProjectsCompact() {
  const projects = getFilteredProjects();
  elements.emptyProjects.hidden = Boolean(projects.length);

  const tableFrag = document.createDocumentFragment();
  projects.forEach(project => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(project.id)}</td>
      <td><div class="project-title">${escapeHtml(project.title)}</div></td>
      <td><span class="tag tag--blue">${escapeHtml(project.stage)}</span></td>
      <td>${progressBar(project.readiness)}</td>
      <td>${statusTag(project.status)}</td>
      <td><span class="tag ${riskClass(project.risk)}">${escapeHtml(project.risk || "—")}</span></td>
      <td>${escapeHtml(project.nextAction || "—")}</td>
      <td><button type="button" class="chip" data-project="${escapeHtml(project.id)}">${state.expandedProjectId === project.id ? "Свернуть" : "Подробнее"}</button></td>
    `;
    tableFrag.append(row);

    if (state.expandedProjectId === project.id) {
      const details = document.createElement("tr");
      details.className = "details-row";
      details.innerHTML = `<td colspan="8">${renderProjectDetails(project)}</td>`;
      tableFrag.append(details);
    }
  });
  elements.projectsTable.replaceChildren(tableFrag);

  elements.projectsTable.querySelectorAll("[data-project]").forEach(button => {
    button.addEventListener("click", () => {
      state.expandedProjectId = state.expandedProjectId === button.dataset.project ? null : button.dataset.project;
      renderProjectsCompact();
    });
  });

  const mobileFrag = document.createDocumentFragment();
  projects.forEach(project => {
    const card = document.createElement("article");
    card.className = "mobile-card";
    card.innerHTML = `
      <div class="mobile-line"><strong>${escapeHtml(project.id)}</strong><span class="tag ${riskClass(project.risk)}">${escapeHtml(project.risk || "—")}</span></div>
      <div class="project-title">${escapeHtml(project.title)}</div>
      <div class="mobile-line"><span class="tag tag--blue">${escapeHtml(project.stage)}</span>${statusTag(project.status)}</div>
      <div>${progressBar(project.readiness)}</div>
      <button type="button" class="chip" data-project="${escapeHtml(project.id)}">${state.expandedProjectId === project.id ? "Свернуть" : "Подробнее"}</button>
      <div class="mobile-details" ${state.expandedProjectId === project.id ? "" : "hidden"}>${renderProjectDetails(project)}</div>
    `;
    mobileFrag.append(card);
  });
  elements.projectsMobile.replaceChildren(mobileFrag);

  elements.projectsMobile.querySelectorAll("[data-project]").forEach(button => {
    button.addEventListener("click", () => {
      state.expandedProjectId = state.expandedProjectId === button.dataset.project ? null : button.dataset.project;
      renderProjectsCompact();
    });
  });
}

function renderProjectDetails(project) {
  return `
    <div class="details-grid">
      <div><strong>Полное название:</strong><br>${escapeHtml(project.title)}</div>
      <div><strong>Направление:</strong><br>${escapeHtml(project.direction || "—")}</div>
      <div><strong>Контур:</strong><br>${escapeHtml(project.contour || "—")}</div>
      <div><strong>Приоритет:</strong><br>${escapeHtml(project.priority || "—")}</div>
      <div><strong>УТГ:</strong><br>${escapeHtml(project.utg || "—")}</div>
      <div><strong>Ответственный:</strong><br>${escapeHtml(project.manager || "—")}</div>
      <div><strong>Маршрут финансирования:</strong><br>${escapeHtml((project.grants || []).join(", ") || "—")}</div>
      <div><strong>Ближайшее окно:</strong><br>${escapeHtml(project.nearestGrantWindow || "—")}</div>
      <div><strong>Лимит / ориентир:</strong><br>${escapeHtml(project.fundingLimit || "—")}</div>
      <div><strong>Срок:</strong><br>${escapeHtml(project.nextActionDate || "—")}</div>
      <div><strong>Блокер / примечание:</strong><br>${escapeHtml(project.blocker || "—")}</div>
      <div><strong>Связанные гранты:</strong><br>${escapeHtml((project.grants || []).join(", ") || "—")}</div>
    </div>
  `;
}

function renderGrantsCompact() {
  const filtered = state.grants.filter(grant => {
    const byOperator = state.filters.grantOperator === "all" || grant.operator === state.filters.grantOperator;
    const bySearch = !state.filters.grantSearch || `${grant.title} ${grant.operator}`.toLowerCase().includes(state.filters.grantSearch);
    return byOperator && bySearch;
  });

  const page = paginateList(filtered, state.grantsVisible);
  if (!filtered.length) {
    elements.grantCalendar.innerHTML = `<p class="empty-state">Гранты не найдены.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  page.items.forEach(grant => {
    const key = `${grant.title}-${grant.operator}`;
    const acc = createAccordion(`
      <div class="grant-head">
        <strong>${escapeHtml(grant.title || "Без названия")}</strong>
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
    fragment.append(acc);
  });

  elements.grantCalendar.replaceChildren(fragment);

  if (page.hasMore) {
    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "chip";
    moreButton.textContent = "Показать еще";
    moreButton.addEventListener("click", () => {
      state.grantsVisible += 5;
      renderGrantsCompact();
    });
    elements.grantCalendar.append(moreButton);
  }
}

function renderGrantDetails(grant) {
  const source = String(grant.source || "").startsWith("http")
    ? `<a class="source-link" href="${escapeHtml(grant.source)}" target="_blank" rel="noopener">${escapeHtml(grant.source)}</a>`
    : escapeHtml(grant.source || "—");

  return `
    <div class="details-grid">
      <div><strong>Для чего подходит:</strong><br>${escapeHtml(grant.purpose || "—")}</div>
      <div><strong>Кто подает:</strong><br>${escapeHtml(grant.applicant || "—")}</div>
      <div><strong>Финансирование:</strong><br>${escapeHtml(grant.funding || "—")}</div>
      <div><strong>Связанные проекты:</strong><br>${escapeHtml((grant.projects || []).join(", ") || "—")}</div>
      <div><strong>Что подготовить первым:</strong><br>${escapeHtml(grant.firstStep || "—")}</div>
      <div><strong>Источник:</strong><br>${source}</div>
      <div><strong>Дата проверки:</strong><br>${escapeHtml(grant.checkedAt || "—")}</div>
      <div><strong>План подачи с 1 июня:</strong><br>${escapeHtml(grant.planFromJune || "—")}</div>
      <div><strong>Уверенность:</strong><br>${escapeHtml(grant.confidence || "—")}</div>
    </div>
  `;
}

function renderRisks() {
  const groups = {
    "Документы": state.projects.filter(project => !project.hasPassport),
    "Сроки": state.projects.filter(project => daysUntil(project.nextActionDate) <= 14),
    "Руководители": state.projects.filter(project => !project.manager || project.manager === "Не назначен"),
    "Гранты": state.projects.filter(project => !(project.grants || []).length),
    "Решения руководителя": state.projects.filter(project => project.needsDecision)
  };

  const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
  if (!total) {
    elements.riskList.innerHTML = `<div class="risk-empty">Критических рисков не найдено</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  Object.entries(groups).forEach(([group, list]) => {
    if (!list.length) return;
    const acc = createAccordion(`${group} — ${list.length}`, { open: state.expandedRiskGroup === group });
    const body = acc.querySelector(".accordion__body");
    const listWrap = document.createElement("div");
    listWrap.className = "diag-list";
    list.forEach(project => {
      const item = document.createElement("div");
      item.className = "issue-row";
      item.textContent = `${project.id} · ${project.title}`;
      listWrap.append(item);
    });
    body.append(listWrap);
    acc.querySelector(".accordion__trigger").addEventListener("click", () => {
      state.expandedRiskGroup = state.expandedRiskGroup === group ? null : group;
      renderRisks();
    });
    fragment.append(acc);
  });

  elements.riskList.replaceChildren(fragment);
}

function renderQuickLinks() {
  const links = Object.values(QUICK_LINKS);
  const cards = links
    .map(link => `<a class="quick-link" href="${escapeHtml(link.href)}" ${String(link.href).startsWith("http") ? "target='_blank' rel='noopener'" : ""}>${escapeHtml(link.label)}</a>`)
    .join("");

  elements.quickLinks.innerHTML = `
    <div class="section-head"><h2>Быстрые ссылки</h2></div>
    <div class="quick-links__grid">${cards}</div>
  `;
}

function createAccordion(title, options = {}) {
  const root = document.createElement("article");
  root.className = `accordion ${options.open ? "is-open" : ""}`;
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

function paginateList(list, visibleCount) {
  return { items: list.slice(0, visibleCount), hasMore: list.length > visibleCount, total: list.length };
}

function getFilteredProjects() {
  return state.projects.filter(project => {
    const query = `${project.id} ${project.title} ${project.manager} ${(project.grants || []).join(" ")}`.toLowerCase();
    const matchesSearch = !state.filters.search || query.includes(state.filters.search);
    const matchesStatus = state.filters.status === "all" || project.status === state.filters.status;
    const matchesRisk = state.filters.risk === "all" || riskToFilterValue(project.risk) === state.filters.risk;
    const matchesGrant = state.filters.grant === "all" || (project.grants || []).includes(state.filters.grant);
    const readiness = project.readiness || 0;
    const matchesReadiness = state.filters.readiness === "all"
      || (state.filters.readiness === "high" && readiness >= 80)
      || (state.filters.readiness === "medium" && readiness >= 50 && readiness < 80)
      || (state.filters.readiness === "low" && readiness < 50);
    return matchesSearch && matchesStatus && matchesRisk && matchesGrant && matchesReadiness;
  });
}

function fillFilterOptions() {
  fillSelect(elements.statusFilter, ["all", ...unique(state.projects.map(project => project.status))], "Все");
  fillSelect(elements.grantFilter, ["all", ...unique(state.projects.flatMap(project => project.grants || []))], "Все");
  fillSelect(elements.grantOperatorFilter, ["all", ...unique(state.grants.map(grant => grant.operator))], "Все");
  const options = state.projects.length
    ? state.projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.id)} · ${escapeHtml(project.title)}</option>`).join("")
    : `<option value="">Нет проектов</option>`;
  elements.ntsProjectSelect.innerHTML = options;
}

function fillSelect(select, options, allLabel) {
  select.innerHTML = "";
  options.forEach(value => select.append(new Option(value === "all" ? allLabel : value, value)));
}

async function handleWishSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = {
    action: "feedback",
    fio: formData.get("fullName"),
    role: formData.get("role"),
    project: formData.get("project"),
    message: formData.get("wish"),
    priority: formData.get("priority"),
    createdAt: new Date().toISOString()
  };

  try {
    await submitFeedback(payload);
    state.connection.feedback = "Google Таблица";
    showToast("success", "Пожелание отправлено в Google Таблицу");
  } catch {
    saveFeedbackLocally(payload);
    state.connection.feedback = "недоступно";
    showToast("warning", "Отправка недоступна: пожелание сохранено локально в браузере");
  }

  event.target.reset();
  renderConnectionStatus();
  renderWishLog();
}

function renderWishLog() {
  const wishes = getSavedWishes().slice(0, 4);
  elements.wishLog.innerHTML = wishes.length
    ? wishes.map(wish => `<div class="wish-log__item"><strong>${escapeHtml(wish.fullName)}</strong> · ${escapeHtml(wish.priority)}<br>${escapeHtml(wish.wish)}</div>`).join("")
    : `<p class="section-note">Локальных пожеланий пока нет.</p>`;
}

function showToast(type, text) {
  const node = document.createElement("div");
  node.className = `toast is-${type}`;
  node.textContent = text;
  elements.toastStack.append(node);
  setTimeout(() => node.remove(), 2800);
}

function buildDiagnostics(projects, grants) {
  return [...validateProjects(projects), ...validateGrants(grants), ...validateRelations(projects, grants)];
}

function validateProjects(projects) {
  const issues = [];
  projects.forEach(project => {
    const add = (severity, category, description, recommendation) => issues.push({
      type: "project",
      severity,
      category,
      target: project.id || "Проект без ID",
      description,
      recommendation
    });

    if (!project.id) add("critical", "Документы", "нет ID", "Заполнить уникальный ID проекта.");
    if (!project.title) add("critical", "Документы", "нет названия", "Заполнить название проекта.");
    if (!project.manager || project.manager === "Не назначен") add("critical", "Руководители", "не назначен руководитель", "Назначить ответственного.");
    if (Number.isNaN(Number(project.readiness)) || Number(project.readiness) < 0 || Number(project.readiness) > 100) add("critical", "Документы", "некорректная готовность", "Указать готовность числом от 0 до 100.");
    if (!project.hasPassport) add("warning", "Документы", "не заполнен паспорт проекта", "Заполнить и согласовать паспорт.");
    if (!project.hasTZ) add("warning", "ТЗ", "отсутствует ТЗ", "Подготовить техническое задание.");
    if (!project.hasBudget) add("warning", "Бюджет", "не заполнен бюджет", "Добавить бюджетный контур.");
    if (!project.nextActionDate || !isValidDate(project.nextActionDate)) add("warning", "Сроки", "нет корректной даты ближайшего действия", "Указать дату в формате YYYY-MM-DD.");
    if (!(project.grants || []).length) add("warning", "Гранты", "не указан грантовый маршрут", "Выбрать подходящий маршрут.");
    if (project.needsDecision) add("recommendation", "Сроки", "требуется решение руководителя", "Вынести проект на ближайшее совещание НТС.");
  });
  return issues;
}

function validateGrants(grants) {
  const issues = [];
  grants.forEach(grant => {
    const add = (severity, category, description, recommendation) => issues.push({
      type: "grant",
      severity,
      category,
      target: grant.title || "Грант без названия",
      description,
      recommendation
    });

    if (!grant.title) add("critical", "Гранты", "нет названия маршрута", "Заполнить название маршрута.");
    if (!grant.operator) add("warning", "Гранты", "не указан оператор", "Заполнить поле оператора.");
    if (!grant.window) add("warning", "Сроки", "не указано окно подачи", "Заполнить окно подачи.");
    if (!grant.source) add("recommendation", "Гранты", "нет ссылки на источник", "Добавить актуальный источник.");
  });
  return issues;
}

function validateRelations(projects, grants) {
  const issues = [];
  const projectIds = new Set(projects.map(project => project.id));

  projects.forEach(project => {
    (project.grants || []).forEach(grantName => {
      if (!hasMatchingGrant(grantName, grants)) {
        issues.push({
          type: "relation",
          severity: "warning",
          category: "Связи",
          target: project.id,
          description: `нет гранта «${grantName}» в реестре грантов`,
          recommendation: "Привести названия маршрутов к единому виду."
        });
      }
    });
  });

  grants.forEach(grant => {
    (grant.projects || []).forEach(projectId => {
      if (!projectIds.has(projectId)) {
        issues.push({
          type: "relation",
          severity: "warning",
          category: "Связи",
          target: grant.title,
          description: `указан несуществующий проект ${projectId}`,
          recommendation: "Проверить ID в связке грант-проект."
        });
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
  } catch {
    // continue fallback
  }

  try {
    const response = await fetch(DATA_SOURCES.projects, { cache: "no-store" });
    if (!response.ok) throw new Error("Local projects HTTP error");
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
  } catch {
    // continue fallback
  }

  try {
    const response = await fetch(DATA_SOURCES.grants, { cache: "no-store" });
    if (!response.ok) throw new Error("Local grants HTTP error");
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function submitFeedback(feedback) {
  if (!API_CONFIG.enabled) throw new Error("API disabled");
  const response = await fetch(API_CONFIG.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(feedback)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

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

function getSavedWishes() {
  try {
    return JSON.parse(localStorage.getItem("ntsWishes")) || [];
  } catch {
    return [];
  }
}

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
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
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

function normalizeGrant(grant) {
  return grant["Маршрут"] || grant["РњР°СЂС€СЂСѓС‚"]
    ? normalizeGrantRow(grant)
    : {
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
  if (typeof payload === "string") {
    try {
      return getApiItems(JSON.parse(payload), key);
    } catch {
      return [];
    }
  }
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
function hasMatchingGrant(projectGrantName, grants) { const target = normalizeForMatch(projectGrantName); return grants.some(grant => normalizeForMatch(grant.title).includes(target) || normalizeForMatch(grant.operator).includes(target) || target.includes(normalizeForMatch(grant.title))); }
function normalizeForMatch(value) { return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[«»"']/g, "").replace(/\s+/g, " ").trim(); }
function unique(items) { return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")); }
function severityRank(severity) { return severity === "critical" ? 0 : severity === "warning" ? 1 : 2; }
function severityLabel(severity) { if (severity === "critical") return "Критично"; if (severity === "warning") return "Предупреждение"; return "Рекомендация"; }
function statusTag(status) { if (status === "Готов к грантам") return `<span class="tag tag--green">${escapeHtml(status)}</span>`; if (status === "В зоне риска") return `<span class="tag tag--red">${escapeHtml(status)}</span>`; if (status === "Требует решения руководителя") return `<span class="tag tag--yellow">${escapeHtml(status)}</span>`; return `<span class="tag tag--blue">${escapeHtml(status)}</span>`; }
function riskClass(risk) { if (risk === "Высокий") return "tag--red"; if (risk === "Средний") return "tag--yellow"; if (risk === "Низкий") return "tag--green"; return "tag--blue"; }
function riskToFilterValue(risk) { if (risk === "Высокий") return "high"; if (risk === "Средний") return "medium"; if (risk === "Низкий") return "low"; return "all"; }
function progressBar(value) { const val = Math.max(0, Math.min(100, Number(value) || 0)); return `<div><strong>${val}%</strong><div class="progress-line"><span style="width:${val}%"></span></div></div>`; }
function daysUntil(dateString) { if (!isValidDate(dateString)) return Infinity; const now = new Date(); now.setHours(0, 0, 0, 0); const date = new Date(dateString); date.setHours(0, 0, 0, 0); return Math.ceil((date - now) / 86400000); }
function isValidDate(dateString) { return Boolean(dateString) && !Number.isNaN(new Date(dateString).getTime()); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
