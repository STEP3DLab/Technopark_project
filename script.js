/*
  Универсальный рабочий скрипт панели Технопарка РГСУ.
  Восстанавливает кнопки, вкладки, фильтры, загрузку Google Sheets и форму НТС.
  Структуру Google Sheets не меняет.
*/
(function () {
  const CONFIG = {
    sheetId: "1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60",
    sheets: {
      projects: "150570752",
      grants: "1500721586",
      nts: "202604270",
      package: "341683209",
    },
    sheetUrl: "https://docs.google.com/spreadsheets/d/1cNN4cPE1F1dlewJCelJPGUR5EkYUmQyJGb_BOKN4n60/edit",
    scriptUrl: "https://script.google.com/macros/s/AKfycbwiOYwnD7aozxYFzox4JokcHIZjR-OD7FUXcn16n0YqH1gdHoWqgqYXy2CmIJaiN9o/exec",
    formKey: "NTS_TECHNOPARK_2026",
  };

  const state = {
    projects: [],
    grants: [],
    packageRows: [],
    feedback: [],
    filters: { query: "", status: "all", direction: "all", deadline: "all", preset: "all" },
    activeView: "dashboard",
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const text = (value) => String(value ?? "").trim();
  const norm = (value) => text(value).toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");
  const esc = (value) => text(value).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

  function setHtml(selector, html) {
    const node = $(selector);
    if (node) node.innerHTML = html;
  }

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
  }

  function toast(message, isError = false) {
    let stack = $("#toastStack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toastStack";
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    const item = document.createElement("div");
    item.className = `toast ${isError ? "is-error" : ""}`;
    item.textContent = message;
    stack.appendChild(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    setTimeout(() => {
      item.classList.remove("is-visible");
      setTimeout(() => item.remove(), 220);
    }, 3400);
  }

  function setSync(message, type = "loading") {
    setText("#syncStatus", message);
    setText("#feedbackStatus", message);
    const strip = $("#connectionStatus");
    if (strip) strip.innerHTML = `<strong>${esc(message)}</strong><small>${type === "ok" ? "Данные загружены" : type === "error" ? "Проверьте публикацию таблицы" : "Идет синхронизация"}</small>`;
    $$("#syncDot, .sync-dot").forEach((dot) => {
      dot.classList.remove("is-ok", "is-error", "ok", "error");
      if (type === "ok") dot.classList.add("is-ok", "ok");
      if (type === "error") dot.classList.add("is-error", "error");
    });
  }

  function gvizCell(cell) {
    return cell ? cell.f || cell.v || "" : "";
  }

  function findHeaderIndex(rows, words) {
    let best = 0;
    let score = -1;
    rows.forEach((row, index) => {
      const line = norm(row.join(" "));
      const current = words.reduce((sum, word) => sum + (line.includes(norm(word)) ? 1 : 0), 0);
      if (current > score) {
        score = current;
        best = index;
      }
    });
    return best;
  }

  function loadSheet(gid, words) {
    return new Promise((resolve, reject) => {
      const callback = `tp_callback_${gid}_${Date.now()}_${Math.round(Math.random() * 100000)}`;
      const script = document.createElement("script");
      window[callback] = (payload) => {
        delete window[callback];
        script.remove();
        if (!payload || payload.status === "error") {
          reject(new Error("Google Sheets недоступен"));
          return;
        }
        const rows = (payload.table.rows || []).map((row) => (row.c || []).map(gvizCell));
        const headerIndex = findHeaderIndex(rows, words);
        const headers = (rows[headerIndex] || []).map((header, i) => text(header) || `col${i}`);
        const data = rows.slice(headerIndex + 1)
          .filter((row) => row.some((cell) => text(cell)))
          .map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] || ""])));
        resolve(data);
      };
      script.onerror = () => {
        delete window[callback];
        script.remove();
        reject(new Error("Не удалось загрузить лист"));
      };
      script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?gid=${gid}&headers=0&tqx=responseHandler:${callback}&cacheBust=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  function value(row, names) {
    const map = Object.fromEntries(Object.entries(row).map(([key, val]) => [norm(key), val]));
    for (const name of names) {
      const v = map[norm(name)];
      if (text(v)) return v;
    }
    return "";
  }

  function percent(value) {
    const match = text(value).replace(",", ".").match(/\d+(\.\d+)?/);
    if (!match) return 0;
    return Math.max(0, Math.min(100, Math.round(Number(match[0]))));
  }

  function isoDate(value) {
    const raw = text(value);
    if (!raw) return "";
    const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)\)$/);
    if (gviz) return `${gviz[1]}-${String(Number(gviz[2]) + 1).padStart(2, "0")}-${String(gviz[3]).padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = raw.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (!date) return "";
    const year = date[3].length === 2 ? `20${date[3]}` : date[3];
    return `${year}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}`;
  }

  function daysUntil(iso) {
    if (!iso) return Infinity;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((new Date(`${iso}T00:00:00`) - today) / 86400000);
  }

  function dateRu(iso) {
    if (!iso) return "нет срока";
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
  }

  function normalizeProject(row, index) {
    const explicitReadiness = percent(value(row, ["Готовность пакета", "Готовность", "Готовность %", "Процент готовности"]));
    const project = {
      uid: `p-${index}`,
      id: value(row, ["ID", "№", "Номер"]) || String(index + 1),
      name: value(row, ["Проект", "Название", "Наименование проекта", "Наименование"]) || "Без названия",
      direction: value(row, ["Направление", "Сфера", "Тип"]),
      stage: value(row, ["Стадия", "Этап"]),
      owner: value(row, ["Ответственный", "Руководитель", "Команда", "Инициатор"]),
      status: value(row, ["Статус", "Состояние"]) || "требует уточнения",
      grant: value(row, ["Маршрут финансирования", "Ближайшее окно", "Грант", "Конкурс"]),
      window: value(row, ["Ближайшее окно", "Окно"]),
      deadline: isoDate(value(row, ["Срок", "Дедлайн", "Дата подачи", "Срок подачи"])),
      readiness: explicitReadiness,
      priority: value(row, ["Приоритет"]),
      nextStep: value(row, ["Следующее действие", "Следующий шаг", "Действие", "Задача"]),
      note: value(row, ["Блокер / примечание", "Примечание", "Комментарий", "Риск"]),
      description: value(row, ["Описание", "Краткое описание", "Суть проекта", "Аннотация"]),
      raw: row,
    };
    if (!project.readiness) project.readiness = estimateReadiness(project);
    return project;
  }

  function estimateReadiness(project) {
    let score = 10;
    if (project.owner) score += 15;
    if (project.grant) score += 20;
    if (project.deadline) score += 10;
    if (project.nextStep) score += 15;
    if (project.description) score += 10;
    if (norm(project.status).includes("готов") || norm(project.status).includes("упаков")) score += 20;
    return Math.max(0, Math.min(100, score));
  }

  function normalizeGrant(row, index) {
    const windowText = value(row, ["Окно / статус на 27.04.2026", "Окно / статус", "Окно", "Срок", "Дедлайн"]);
    return {
      uid: `g-${index}`,
      route: value(row, ["Маршрут", "Грант", "Конкурс", "Название"]),
      operator: value(row, ["Оператор"]),
      purpose: value(row, ["Для чего подходит", "Назначение"]),
      applicant: value(row, ["Кто подает"]),
      funding: value(row, ["Финансирование", "Сумма"]),
      window: windowText,
      deadline: isoDate(windowText),
      projects: value(row, ["Проекты из реестра", "Проекты"]),
      firstStep: value(row, ["Что подготовить первым", "Первый шаг"]),
      source: value(row, ["Источник", "Ссылка"]),
    };
  }

  function normalizeFeedback(row, index) {
    return {
      uid: `f-${index}`,
      date: value(row, ["Дата и время", "Дата"]),
      author: value(row, ["ФИО / автор", "Автор", "ФИО"]),
      role: value(row, ["Роль / организация", "Роль"]),
      type: value(row, ["Тип обращения", "Тип сообщения", "Категория"]),
      project: value(row, ["Связанный проект", "Проект"]),
      priority: value(row, ["Приоритет"]),
      message: value(row, ["Текст пожелания", "Текст сообщения", "Сообщение", "Пожелание"]),
      status: value(row, ["Статус", "Статус обработки", "Статус рассмотрения"]),
    };
  }

  function risk(project) {
    const issues = [];
    if (!project.owner) issues.push("нет ответственного");
    if (!project.grant) issues.push("нет грантового маршрута");
    if (!project.deadline) issues.push("нет срока");
    if (!project.nextStep) issues.push("нет следующего действия");
    const days = daysUntil(project.deadline);
    if (project.deadline && days < 0) issues.push("срок прошел");
    if (project.deadline && days >= 0 && days <= 14) issues.push(`дедлайн через ${days} дн.`);
    if (project.note) issues.push(project.note);
    return issues;
  }

  function riskLevel(project) {
    const issues = risk(project);
    const days = daysUntil(project.deadline);
    if (days < 0 || days <= 14 || issues.some((i) => norm(i).includes("блок") || norm(i).includes("срок прошел"))) return "red";
    if (issues.length >= 2 || days <= 30) return "yellow";
    if (issues.length === 1) return "gray";
    return "green";
  }

  function statusClass(status) {
    const s = norm(status);
    if (s.includes("готов") || s.includes("подан") || s.includes("реализ")) return "status-ready";
    if (s.includes("иде") || s.includes("уточ")) return "status-idea";
    if (s.includes("подан")) return "status-submitted";
    return "";
  }

  function deadlineBadge(project) {
    const days = daysUntil(project.deadline);
    if (!project.deadline) return `<span class="deadline-badge is-missing">нет срока</span>`;
    if (days < 0) return `<span class="deadline-badge is-urgent">просрочено</span>`;
    if (days <= 30) return `<span class="deadline-badge is-urgent">${days} дн.</span>`;
    return `<span class="deadline-badge">${days} дн.</span>`;
  }

  function filteredProjects() {
    const query = norm(state.filters.query);
    return state.projects.filter((project) => {
      const haystack = norm([project.id, project.name, project.direction, project.owner, project.status, project.grant, project.nextStep, project.note].join(" "));
      if (query && !haystack.includes(query)) return false;
      if (state.filters.status !== "all" && norm(project.status) !== norm(state.filters.status)) return false;
      if (state.filters.direction !== "all" && norm(project.direction) !== norm(state.filters.direction)) return false;
      if (state.filters.deadline === "14" && daysUntil(project.deadline) > 14) return false;
      if (state.filters.deadline === "30" && daysUntil(project.deadline) > 30) return false;
      if (state.filters.deadline === "60" && daysUntil(project.deadline) > 60) return false;
      if (state.filters.deadline === "90" && daysUntil(project.deadline) > 90) return false;
      if (state.filters.deadline === "missing" && project.deadline) return false;
      if (state.filters.preset === "urgent" && daysUntil(project.deadline) > 30) return false;
      if (state.filters.preset === "ready" && project.readiness < 70 && !norm(project.status).includes("готов")) return false;
      if (state.filters.preset === "risks" && risk(project).length === 0) return false;
      if (state.filters.preset === "high" && norm(project.priority) !== "высокий") return false;
      return true;
    }).sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
  }

  function renderKpi(projects) {
    const total = state.projects.length;
    const urgent = state.projects.filter((p) => daysUntil(p.deadline) <= 30).length;
    const ready = state.projects.filter((p) => p.readiness >= 70 || norm(p.status).includes("готов")).length;
    const risks = state.projects.filter((p) => risk(p).length).length;
    setText("#totalProjects", total);
    setText("#filteredCount", `${projects.length} с учетом фильтров`);
    setText("#urgentGrants", urgent);
    setText("#readyCount", ready);
    setText("#riskCount", risks);
    const health = total ? Math.round(state.projects.reduce((sum, p) => sum + p.readiness, 0) / total) : 0;
    setText("#portfolioHealth", `${health}%`);
    setText("#portfolioHealthText", health >= 70 ? "Портфель выглядит готовым к упаковке." : "Нужно закрыть ответственных, сроки, гранты и следующие действия.");
    const healthBar = $("#portfolioHealthBar");
    if (healthBar) healthBar.style.width = `${health}%`;
  }

  function renderFilters() {
    const statuses = [...new Set(state.projects.map((p) => p.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const directions = [...new Set(state.projects.map((p) => p.direction).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const grants = [...new Set(state.projects.map((p) => p.grant).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const status = $("#statusFilter");
    if (status) status.innerHTML = `<option value="all">Все статусы</option>${statuses.map((s) => `<option>${esc(s)}</option>`).join("")}`;
    const direction = $("#directionFilter");
    if (direction) direction.innerHTML = `<option value="all">Все направления</option>${directions.map((d) => `<option>${esc(d)}</option>`).join("")}`;
    const grant = $("#grantFilter");
    if (grant) grant.innerHTML = `<option value="all">Все</option>${grants.map((g) => `<option>${esc(g)}</option>`).join("")}`;
    ["#feedbackProjectSelect", "#ntsProjectSelect", "#feedbackProject"].forEach((selector) => {
      const node = $(selector);
      if (node) node.innerHTML = `<option value="">Ко всему портфелю</option>${state.projects.map((p) => `<option>${esc(p.name)}</option>`).join("")}`;
    });
  }

  function renderProjects(projects) {
    const rows = projects.map((p) => {
      const level = riskLevel(p);
      const issues = risk(p);
      return `<tr class="is-clickable risk-${level}" data-project-id="${esc(p.uid)}">
        <td>${esc(p.id)}</td>
        <td><div class="project-name"><strong>${esc(p.name)}</strong><small class="muted">${esc(p.owner || "ответственный не указан")}</small></div></td>
        <td>${esc(p.stage || p.direction || "не указано")}</td>
        <td class="readiness-cell"><div class="progress"><span style="width:${p.readiness}%"></span></div><small>${p.readiness}%</small></td>
        <td><span class="status-pill ${statusClass(p.status)}">${esc(p.status)}</span></td>
        <td><span class="risk-badge risk-${level}">${esc(issues[0] || "норма")}</span></td>
        <td>${esc(p.nextStep || "следующий шаг не указан")}</td>
        <td>${deadlineBadge(p)}</td>
      </tr>`;
    }).join("");
    setHtml("#projectRows", rows);
    setHtml("#projectsTable", rows);

    const cards = projects.map((p) => `<article class="project-card package-card is-clickable risk-${riskLevel(p)}" data-project-id="${esc(p.uid)}">
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(p.direction || p.stage || "направление не указано")} · ${esc(p.owner || "ответственный не указан")}</p>
      <div class="progress"><span style="width:${p.readiness}%"></span></div>
      <div class="package-checks"><span class="check-pill is-ready">${p.readiness}%</span><span class="check-pill">${esc(p.status)}</span>${deadlineBadge(p)}</div>
      <p>${esc(p.nextStep || risk(p)[0] || "Следующее действие не указано")}</p>
    </article>`).join("");
    setHtml("#projectList", cards);
    setHtml("#projectsMobile", cards);

    const empty = $("#emptyProjects");
    if (empty) empty.hidden = projects.length > 0;
  }

  function renderTimeline(projects) {
    const urgent = projects.filter((p) => p.deadline).slice(0, 8);
    const html = urgent.map((p) => `<article class="timeline-item is-clickable risk-${riskLevel(p)}" data-project-id="${esc(p.uid)}">
      <time class="timeline-date">${dateRu(p.deadline)}</time>
      <div class="timeline-title"><strong>${esc(p.name)}</strong><small>${esc(p.grant || p.window || "грант не выбран")}</small></div>
      ${deadlineBadge(p)}
    </article>`).join("") || `<div class="empty-state">Дедлайны не указаны.</div>`;
    setHtml("#timeline", html);
  }

  function renderActions(projects) {
    const actions = projects.filter((p) => risk(p).length).slice(0, 10);
    const html = actions.map((p) => `<article class="action-item is-clickable risk-${riskLevel(p)}" data-project-id="${esc(p.uid)}">
      <div><strong>${esc(p.name)}</strong><small>${esc(risk(p).join(", "))}</small></div>
      ${deadlineBadge(p)}
    </article>`).join("") || `<div class="empty-state">Критичных блокеров нет.</div>`;
    setHtml("#actionList", html);
    setHtml("#leadershipActions", html);
    setHtml("#riskList", html);
  }

  function renderCharts() {
    const byStatus = groupBy(state.projects, (p) => p.status || "без статуса");
    setHtml("#statusChart", chartRows(byStatus));
    const byDirection = groupBy(state.projects, (p) => p.direction || "без направления");
    setHtml("#directionChart", chartRows(byDirection));
    const heat = [
      ["До 14 дней", state.projects.filter((p) => daysUntil(p.deadline) <= 14).length, "is-hot"],
      ["До 30 дней", state.projects.filter((p) => daysUntil(p.deadline) <= 30).length, "is-warm"],
      ["Готовы 70%+", state.projects.filter((p) => p.readiness >= 70).length, ""],
      ["Без срока", state.projects.filter((p) => !p.deadline).length, "is-warm"],
    ];
    setHtml("#deadlineHeatmap", heat.map(([label, count, cls]) => `<div class="heat-cell ${cls}"><span>${label}</span><strong>${count}</strong><small>проектов</small></div>`).join(""));
  }

  function groupBy(items, getter) {
    return items.reduce((acc, item) => {
      const key = getter(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function chartRows(data) {
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...entries.map((entry) => entry[1]));
    return entries.map(([label, count]) => `<div class="chart-row"><div><span>${esc(label)}</span><strong>${count}</strong></div><div class="chart-track"><span style="width:${Math.round(count / max * 100)}%"></span></div></div>`).join("") || `<div class="empty-state">Нет данных.</div>`;
  }

  function renderGrants() {
    const html = state.grants.map((g) => `<article class="grant-window">
      <strong>${esc(g.route || "Грант")}</strong>
      <p>${esc(g.operator || "оператор не указан")}</p>
      <p class="muted">${esc(g.purpose || "описание не заполнено")}</p>
      <span class="deadline-badge ${daysUntil(g.deadline) <= 30 ? "is-urgent" : ""}">${esc(g.window || dateRu(g.deadline))}</span>
      <small>${esc(g.firstStep || "первый шаг не указан")}</small>
      ${g.source ? `<a class="text-action" href="${esc(g.source)}" target="_blank" rel="noopener noreferrer">Источник</a>` : ""}
    </article>`).join("") || `<div class="empty-state">Грантовые маршруты не загружены.</div>`;
    setHtml("#grantWindows", html);
    setHtml("#grantBoard", html);
    setHtml("#grantCalendar", html);
  }

  function renderPackage() {
    const rows = state.packageRows.length ? state.packageRows : state.projects.map((p) => ({ Проект: p.name, Маршрут: p.grant, Готовность: `${p.readiness}%`, "Следующий шаг": p.nextStep }));
    const html = rows.map((row) => `<tr>
      <td>${esc(value(row, ["Проект", "Название"]))}</td>
      <td>${esc(value(row, ["Маршрут", "Грант"]))}</td>
      <td>${esc(value(row, ["Паспорт"]) || "уточнить")}</td>
      <td>${esc(value(row, ["MVP / прототип", "MVP"]) || "уточнить")}</td>
      <td>${esc(value(row, ["Пилот / письма", "Пилот"]) || "уточнить")}</td>
      <td>${esc(value(row, ["Смета"]) || "уточнить")}</td>
      <td>${esc(value(row, ["Презентация"]) || "уточнить")}</td>
      <td>${esc(value(row, ["Готовность"]) || "0%")}</td>
      <td>${esc(value(row, ["Следующий шаг", "Следующее действие"]) || "не указано")}</td>
    </tr>`).join("");
    setHtml("#packageRows", html);
    setHtml("#packageList", rows.map((row) => `<article class="package-card"><h3>${esc(value(row, ["Проект", "Название"]))}</h3><p>${esc(value(row, ["Следующий шаг", "Следующее действие"]) || "следующий шаг не указан")}</p></article>`).join(""));
  }

  function renderFeedback() {
    const html = state.feedback.slice(0, 12).map((f) => `<article class="feedback-item">
      <strong>${esc(f.author || "Автор не указан")}</strong>
      <small>${esc([f.role, f.project, f.priority].filter(Boolean).join(" · "))}</small>
      <p>${esc(f.message || "Текст не указан")}</p>
    </article>`).join("") || `<div class="empty-state">Пожелания пока не загружены.</div>`;
    setHtml("#ntsFeedbackList", html);
    setHtml("#latestFeedback", html);
    setHtml("#wishLog", html);
  }

  function renderExecutive() {
    const ready = state.projects.filter((p) => p.readiness >= 70).length;
    const urgent = state.projects.filter((p) => daysUntil(p.deadline) <= 30).length;
    const risks = state.projects.filter((p) => risk(p).length).length;
    const html = [
      ["Фокус", urgent ? `${urgent} срочных дедлайнов` : "срочных дедлайнов нет", "Проверить ближайшие окна подачи."],
      ["Готовность", `${ready} проектов 70%+`, "Их можно первыми упаковывать в заявки."],
      ["Риски", `${risks} проектов с пробелами`, "Нужны ответственные, сроки и следующие действия."],
      ["НТС", `${state.feedback.length} сообщений`, "Учесть пожелания в повестке."],
    ].map(([label, title, desc]) => `<article class="executive-item"><span>${label}</span><strong>${title}</strong><p>${desc}</p></article>`).join("");
    setHtml("#executiveSummary", html);
  }

  function render() {
    const projects = filteredProjects();
    renderKpi(projects);
    renderProjects(projects);
    renderTimeline(projects);
    renderActions(projects);
    renderCharts();
    renderGrants();
    renderPackage();
    renderFeedback();
    renderExecutive();
  }

  async function loadData() {
    setSync("Загрузка данных из Google Таблицы...");
    try {
      const [projects, grants, feedback, packageRows] = await Promise.allSettled([
        loadSheet(CONFIG.sheets.projects, ["проект", "статус"]),
        loadSheet(CONFIG.sheets.grants, ["маршрут", "оператор"]),
        loadSheet(CONFIG.sheets.nts, ["фио", "пожелание"]),
        loadSheet(CONFIG.sheets.package, ["проект", "паспорт"]),
      ]);
      state.projects = projects.status === "fulfilled" ? projects.value.map(normalizeProject).filter((p) => p.name && p.name !== "Без названия") : [];
      state.grants = grants.status === "fulfilled" ? grants.value.map(normalizeGrant).filter((g) => g.route || g.operator) : [];
      state.feedback = feedback.status === "fulfilled" ? feedback.value.map(normalizeFeedback).filter((f) => f.message || f.author) : [];
      state.packageRows = packageRows.status === "fulfilled" ? packageRows.value : [];
      renderFilters();
      render();
      setSync(`Данные загружены: ${state.projects.length} проектов, ${state.grants.length} грантов, ${state.feedback.length} пожеланий НТС`, "ok");
    } catch (error) {
      console.error(error);
      setSync("Не удалось загрузить данные из Google Таблицы", "error");
      toast("Проверьте публикацию Google Таблицы и доступ к листам", true);
      render();
    }
  }

  function setView(view) {
    state.activeView = view;
    $$("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
    $$(".view").forEach((section) => {
      const active = section.id === view;
      section.classList.toggle("active-section", active);
      section.classList.toggle("active", active);
    });
    const title = $("#currentSectionTitle");
    const activeButton = $(`[data-view="${CSS.escape(view)}"]`);
    if (title && activeButton) title.textContent = activeButton.textContent.trim();
  }

  function copyBrief() {
    const ready = state.projects.filter((p) => p.readiness >= 70).length;
    const urgent = state.projects.filter((p) => daysUntil(p.deadline) <= 30).length;
    const risks = state.projects.filter((p) => risk(p).length).length;
    const brief = `Технопарк РГСУ: ${state.projects.length} проектов, ${ready} готовы к упаковке, ${urgent} срочных дедлайнов, ${risks} требуют действий.`;
    navigator.clipboard?.writeText(brief).then(() => toast("Сводка скопирована")).catch(() => toast(brief));
  }

  function exportCsv() {
    const rows = filteredProjects();
    const header = ["ID", "Проект", "Ответственный", "Статус", "Грант", "Срок", "Готовность", "Следующее действие"];
    const csv = [header, ...rows.map((p) => [p.id, p.name, p.owner, p.status, p.grant, p.deadline, `${p.readiness}%`, p.nextStep])]
      .map((row) => row.map((cell) => `"${text(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Реестр проектов Технопарк РГСУ.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function submitFeedback(form) {
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = "Отправляем...";
    }
    const formData = new FormData(form);
    formData.set("formKey", CONFIG.formKey);
    formData.set("status", "новое");
    formData.set("createdAt", new Date().toISOString());
    try {
      await fetch(CONFIG.scriptUrl, { method: "POST", body: formData, mode: "no-cors" });
      form.reset();
      toast("Пожелание НТС отправлено в таблицу");
      setTimeout(loadData, 1200);
    } catch (error) {
      console.error(error);
      toast("Не удалось отправить пожелание НТС", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Отправить";
      }
    }
  }

  function openDialog() {
    const dialog = $("#projectDialog");
    if (dialog?.showModal) dialog.showModal();
    else toast("Добавление проекта доступно через Google Таблицу");
  }

  function attachEvents() {
    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view]");
      if (viewButton) setView(viewButton.dataset.view);

      const proxy = event.target.closest("[data-proxy-click]");
      if (proxy) document.getElementById(proxy.dataset.proxyClick)?.click();

      if (event.target.closest("#refreshSheet, #refreshData, #reloadFeedback")) loadData();
      if (event.target.closest("#presentationMode")) document.body.classList.toggle("presentation");
      if (event.target.closest("#copyBrief")) copyBrief();
      if (event.target.closest("#openAddProject")) openDialog();
      if (event.target.closest("#closeDialog")) $("#projectDialog")?.close();
      if (event.target.closest("#exportCsv")) exportCsv();
      if (event.target.closest("#clearFilters, #resetFilters")) {
        state.filters = { query: "", status: "all", direction: "all", deadline: "all", preset: "all" };
        ["#searchInput", "#topSearchInput"].forEach((selector) => { const node = $(selector); if (node) node.value = ""; });
        ["#statusFilter", "#directionFilter", "#deadlineFilter"].forEach((selector) => { const node = $(selector); if (node) node.value = "all"; });
        $$("[data-preset]").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.preset === "all"));
        render();
      }
      const preset = event.target.closest("[data-preset]");
      if (preset) {
        state.filters.preset = preset.dataset.preset || "all";
        $$("[data-preset]").forEach((chip) => chip.classList.toggle("is-active", chip === preset));
        render();
      }
      const jump = event.target.closest("[data-jump]");
      if (jump) setView(jump.dataset.jump);
    });

    ["#searchInput", "#topSearchInput"].forEach((selector) => {
      const node = $(selector);
      if (node) node.addEventListener("input", () => {
        state.filters.query = node.value;
        const other = selector === "#searchInput" ? $("#topSearchInput") : $("#searchInput");
        if (other && other.value !== node.value) other.value = node.value;
        render();
      });
    });
    const status = $("#statusFilter");
    if (status) status.addEventListener("change", () => { state.filters.status = status.value; render(); });
    const direction = $("#directionFilter");
    if (direction) direction.addEventListener("change", () => { state.filters.direction = direction.value; render(); });
    const deadline = $("#deadlineFilter");
    if (deadline) deadline.addEventListener("change", () => { state.filters.deadline = deadline.value; render(); });

    ["#ntsFeedbackForm", "#ntsForm"].forEach((selector) => {
      const form = $(selector);
      if (form) form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitFeedback(form);
      });
    });
  }

  function init() {
    setText("#currentDate", new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()));
    attachEvents();
    loadData();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
