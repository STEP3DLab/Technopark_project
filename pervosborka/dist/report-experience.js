/* ПЕРВОСБОРКА · Local catalog and report interactions. No scoring or storage. */
(function () {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const count = value => finite(value) && value >= 0 ? Math.floor(value) : 0;
  const button = (label, attr, value, active = false, extra = '') => `<button type="button" ${attr}="${esc(value)}"${active === null ? '' : ` aria-pressed="${active}"`} ${extra}>${label}</button>`;
  const arrow = '<svg class="rx-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg>';

  function catalogTools() {
    return `<div class="rx-tools rx-catalog-tools"><div class="rx-search-row"><label class="rx-search"><span>Найти лабораторию</span><input type="search" data-rx-search-input placeholder="Название или действие: робот, модель…" autocomplete="off" maxlength="120" enterkeyhint="search"></label><button type="button" class="rx-reset" data-rx-reset disabled>Сбросить</button></div><div class="rx-filter-group" role="group" aria-label="Статус лабораторной пробы">${button('Все лаборатории','data-rx-filter','all',true)}${button('Ещё не проверены','data-rx-filter','untried')}${button('Проверенные','data-rx-filter','checked')}</div><p class="rx-results-count" data-rx-count role="status" aria-live="polite" aria-atomic="true"></p></div><div class="rx-empty" data-rx-empty hidden><strong>Подходящих лабораторий не нашлось</strong><p>Попробуй другое слово или сбрось поиск и фильтр.</p><button type="button" data-rx-reset>Показать все лаборатории</button></div>`;
  }

  function sortControls() {
    return `<div class="rx-tools rx-sort-tools"><div class="rx-filter-group" role="group" aria-label="Порядок направлений на карте интересов">${button('Порядок направлений','data-rx-sort','order',true)}${button('По интересу','data-rx-sort','interest')}</div><p class="rx-sort-state" data-rx-sort-state role="status" aria-live="polite" aria-atomic="true">Направления в порядке каталога.</p></div>`;
  }

  function reportNav() {
    return `<nav class="rx-report-nav" aria-label="Разделы моей карты"><span>На этой странице</span>${button('Интересы','data-rx-jump','report-interests',null)}${button('Следующие пробы','data-rx-jump','report-plan',null)}${button('Практика','data-rx-jump','report-practice',null)}</nav>`;
  }

  function planTray(tracks = [], selectedIds = [], readOnly = false) {
    const byId = new Map(tracks.filter(Boolean).map(track => [track.id, track]));
    const selected = [...new Set(selectedIds)].map(id => byId.get(id)).filter(Boolean).slice(0, 2);
    const slots = [0, 1].map(index => {
      const track = selected[index];
      return track ? `<article class="rx-plan-slot is-filled"><span class="rx-plan-number">${index + 1}</span><div><small>${esc(track.name)}</small><strong>${esc(track.project || track.name)}</strong></div>${readOnly ? '' : `<button type="button" class="rx-plan-remove" data-action="plan:${esc(track.id)}" aria-label="Убрать из плана: ${esc(track.project || track.name)}">Убрать</button>`}</article>` : `<article class="rx-plan-slot is-empty"><span class="rx-plan-number">${index + 1}</span><div><strong>${index ? 'Вторая проба' : 'Первая проба'}</strong><span>${readOnly ? 'Не выбрана' : 'Выбери проект ниже'}</span></div></article>`;
    }).join('');
    return `<section class="rx-plan-tray" aria-label="Две выбранные следующие пробы"><div class="rx-plan-heading"><div><p class="rx-kicker">ТВОИ СЛЕДУЮЩИЕ ДЕЙСТВИЯ</p><h3>Две пробы для знакомства</h3></div><p class="rx-plan-count" role="status" aria-live="polite"><strong>${selected.length} / 2</strong><span>выбрано</span></p></div><div class="rx-plan-slots">${slots}</div><p class="rx-plan-hint">${readOnly ? 'Здесь показан выбор из этой карты.' : 'Выбор можно менять. Карточки, скрытые фильтром, остаются в твоём плане.'}</p></section>`;
  }

  function projectTools() {
    return `<div class="rx-tools rx-project-tools"><div class="rx-filter-group" role="group" aria-label="Показать проекты">${button('Все проекты','data-rx-project-filter','all',true)}${button('Мой план','data-rx-project-filter','chosen')}</div><p class="rx-results-count" data-rx-project-count role="status" aria-live="polite" aria-atomic="true"></p></div><div class="rx-empty" data-rx-project-empty hidden><strong>В плане пока нет выбранных проб</strong><p>Открой все проекты и добавь те, с которых хочется начать.</p>${button('Показать все проекты','data-rx-project-filter','all',null)}</div>`;
  }

  function gradeLabel(grade, missing) {
    return grade && finite(grade.score) && finite(grade.total) && grade.total > 0 && grade.score >= 0 && grade.score <= grade.total ? `${esc(grade.score)} из ${esc(grade.total)} условий` : missing;
  }

  function trackDetails({track = {}, score = {}, record, reflection, hasReflection = false, readOnly = false} = {}) {
    const interest = count(score.total) ? `${count(score.count)} из ${count(score.total)} ответов по шкале 1–5` : 'Числовых ответов пока нет';
    const first = gradeLabel(record && record.first, record && record.skipped ? 'Проба пропущена' : 'Проверки ещё не было');
    const last = gradeLabel(record && record.last, 'Проверки ещё не было');
    const reflectionText = !hasReflection ? 'Ответ пока не дан' : reflection === null ? 'Пока не могу оценить' : finite(reflection) && reflection >= 1 && reflection <= 5 ? `${reflection} из 5` : 'Ответ пока не дан';
    const hint = record && record.hintUsed ? `Подсказка отмечена${record.first ? record.firstHadHint ? ' до первой проверки' : ' после первой проверки' : ', проверки ещё не было'}.` : 'Подсказка не отмечена.';
    return `<details class="rx-track-details"><summary aria-label="Подробнее о направлении: ${esc(track.name)}"><span>Подробнее</span><small>Ответы, проба и впечатление</small></summary><div class="rx-detail-body"><div class="rx-detail-grid"><div><span>Ответы об интересе</span><strong>${interest}</strong><small>${score.eligible ? 'Ответов достаточно для сравнения направлений.' : 'Для сравнения пока недостаточно ответов.'}</small></div><div><span>Первая проверка пробы</span><strong>${first}</strong></div><div><span>Последняя проверка пробы</span><strong>${last}</strong>${record && record.last ? `<small>Всего проверок: ${count(record.attempts)}</small>` : ''}</div><div><span>Хочется продолжить</span><strong>${reflectionText}</strong></div></div><p class="rx-detail-note">${hint} Это результаты конкретной задачи. Они не оценивают способности в целом.</p>${!readOnly && track.id ? `<a class="rx-detail-link" href="#lab:${encodeURIComponent(String(track.id))}">Вернуться к пробе ${arrow}</a>` : ''}</div></details>`;
  }

  function mount(root, {view: savedView} = {}) {
    const initialView = {
      catalogQuery: savedView && typeof savedView.catalogQuery === 'string' ? savedView.catalogQuery.slice(0, 120) : '',
      catalogFilter: savedView && ['all', 'untried', 'checked'].includes(savedView.catalogFilter) ? savedView.catalogFilter : 'all',
      reportSort: savedView && savedView.reportSort === 'interest' ? 'interest' : 'order',
      projectFilter: savedView && savedView.projectFilter === 'chosen' ? 'chosen' : 'all'
    };
    if (!root || !root.querySelectorAll || !root.addEventListener) return {getView() { return {...initialView}; }, destroy() {}};
    const all = (scope, selector) => Array.from(scope.querySelectorAll(selector));
    const groups = selector => (root.matches && root.matches(selector) ? [root] : []).concat(all(root, selector));
    const catalogs = new Map(), projects = new Map(), charts = new Map(), hiddenBefore = new Map(), addedTabIndexes = new Set();
    const doc = root.ownerDocument || root, view = doc.defaultView;
    let destroyed = false, printSnapshot = null, reportSort = initialView.reportSort;
    const remember = nodes => nodes.forEach(node => { if (!hiddenBefore.has(node)) hiddenBefore.set(node, !!node.hidden); });
    const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
    const pressed = (scope, selector, key, value) => all(scope, selector).forEach(node => {
      if (node.hasAttribute('aria-pressed')) node.setAttribute('aria-pressed', String(node.dataset[key] === value));
    });
    const owned = node => node && (node === root || root.contains(node));
    const control = (event, selector) => {
      const node = event.target && event.target.closest && event.target.closest(selector);
      return owned(node) ? node : null;
    };

    function updateCatalog(wrapper) {
      const state = catalogs.get(wrapper), words = normalize(state.input && state.input.value).split(' ').filter(Boolean);
      let visible = 0;
      state.cards.forEach(card => {
        const searchable = normalize(card.dataset.rxSearch), status = card.dataset.rxStatus;
        const match = words.every(word => searchable.includes(word)) && (state.filter === 'all' || state.filter === status);
        card.hidden = !match;
        if (match) visible++;
      });
      pressed(wrapper, '[data-rx-filter]', 'rxFilter', state.filter);
      setText(wrapper.querySelector('[data-rx-count]'), `Показано: ${visible} из ${state.cards.length}`);
      const empty = wrapper.querySelector('[data-rx-empty]');
      if (empty) empty.hidden = visible !== 0;
      all(wrapper, '[data-rx-reset]').forEach(node => { node.disabled = !words.length && state.filter === 'all'; });
    }

    function updateProjects(wrapper) {
      const state = projects.get(wrapper);
      let visible = 0;
      state.cards.forEach(card => {
        card.hidden = state.filter === 'chosen' && card.dataset.rxChosen !== 'true';
        if (!card.hidden) visible++;
      });
      pressed(wrapper, '[data-rx-project-filter]', 'rxProjectFilter', state.filter);
      setText(wrapper.querySelector('[data-rx-project-count]'), `Показано: ${visible} из ${state.cards.length}`);
      const empty = wrapper.querySelector('[data-rx-project-empty]');
      if (empty) empty.hidden = visible !== 0;
    }

    function sortCharts(mode) {
      reportSort = mode;
      charts.forEach((rows, chart) => {
        const sorted = rows.slice().sort((a, b) => {
          if (mode === 'interest') {
            if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
            if (a.eligible && a.mean !== b.mean) return b.mean - a.mean;
          }
          return a.order - b.order || a.index - b.index;
        });
        sorted.forEach(row => chart.appendChild(row.node));
      });
      pressed(root, '[data-rx-sort]', 'rxSort', mode);
      all(root, '[data-rx-sort-state]').forEach(node => setText(node, mode === 'interest' ? 'Сначала более высокий интерес. Направления с недостаточными данными — в конце.' : 'Направления в порядке каталога.'));
    }

    groups('[data-rx-catalog]').forEach(wrapper => {
      const cards = all(wrapper, '[data-rx-grid] [data-rx-track]'), input = wrapper.querySelector('[data-rx-search-input]');
      remember(cards);
      if (input) input.value = initialView.catalogQuery;
      catalogs.set(wrapper, {cards, input, filter: initialView.catalogFilter});
      updateCatalog(wrapper);
    });
    groups('[data-rx-projects]').forEach(wrapper => {
      const cards = all(wrapper, '[data-rx-project]');
      remember(cards);
      projects.set(wrapper, {cards, filter: initialView.projectFilter});
      updateProjects(wrapper);
    });
    groups('.bar-chart').forEach(chart => {
      const rows = all(chart, '.bar-row[data-rx-order]').map((node, index) => {
        const mean = Number(node.dataset.rxMean), order = Number(node.dataset.rxOrder);
        return {node, index, order: Number.isFinite(order) ? order : index, mean, eligible: node.dataset.rxEligible === 'true' && Number.isFinite(mean) && mean >= 1 && mean <= 5};
      });
      charts.set(chart, rows);
    });
    sortCharts(reportSort);

    function input(event) {
      const node = control(event, '[data-rx-search-input]');
      if (!node) return;
      const wrapper = node.closest('[data-rx-catalog]');
      if (catalogs.has(wrapper)) updateCatalog(wrapper);
    }

    function click(event) {
      const node = control(event, '[data-rx-filter], [data-rx-reset], [data-rx-sort], [data-rx-jump], [data-rx-project-filter]');
      if (!node || node.disabled) return;
      if (node.hasAttribute('data-rx-filter') || node.hasAttribute('data-rx-reset')) {
        const wrapper = node.closest('[data-rx-catalog]'), state = catalogs.get(wrapper);
        if (!state) return;
        event.preventDefault();
        if (node.hasAttribute('data-rx-reset')) {
          state.filter = 'all';
          if (state.input) state.input.value = '';
          updateCatalog(wrapper);
          if (state.input) state.input.focus();
        } else if (['all', 'untried', 'checked'].includes(node.dataset.rxFilter)) {
          state.filter = node.dataset.rxFilter;
          updateCatalog(wrapper);
        }
      } else if (node.hasAttribute('data-rx-project-filter')) {
        const wrapper = node.closest('[data-rx-projects]'), state = projects.get(wrapper);
        if (!state || !['all', 'chosen'].includes(node.dataset.rxProjectFilter)) return;
        event.preventDefault();
        state.filter = node.dataset.rxProjectFilter;
        updateProjects(wrapper);
      } else if (['order', 'interest'].includes(node.dataset.rxSort)) {
        event.preventDefault();
        sortCharts(node.dataset.rxSort);
      } else if (['report-interests', 'report-plan', 'report-practice'].includes(node.dataset.rxJump)) {
        const target = doc.getElementById && doc.getElementById(node.dataset.rxJump);
        if (!owned(target)) return;
        event.preventDefault();
        const heading = target.querySelector('h2, h1, h3') || target;
        if (!heading.hasAttribute('tabindex')) { heading.setAttribute('tabindex', '-1'); addedTabIndexes.add(heading); }
        heading.focus({preventScroll: true});
        const reduced = view && view.matchMedia && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'start'});
      }
    }

    function beforePrint() {
      if (printSnapshot) return;
      printSnapshot = {hidden: Array.from(hiddenBefore.keys(), node => [node, !!node.hidden]), details: all(root, '.rx-track-details').map(node => [node, !!node.open])};
      printSnapshot.hidden.forEach(([node]) => { node.hidden = false; });
      printSnapshot.details.forEach(([node]) => { node.open = true; });
    }
    function afterPrint() {
      if (!printSnapshot) return;
      printSnapshot.hidden.forEach(([node, value]) => { node.hidden = value; });
      printSnapshot.details.forEach(([node, value]) => { node.open = value; });
      printSnapshot = null;
    }

    root.addEventListener('input', input);
    root.addEventListener('click', click);
    if (view && view.addEventListener) { view.addEventListener('beforeprint', beforePrint); view.addEventListener('afterprint', afterPrint); }
    return {getView() {
      const catalog = catalogs.values().next().value, project = projects.values().next().value;
      return {
        catalogQuery: catalog && catalog.input ? catalog.input.value : initialView.catalogQuery,
        catalogFilter: catalog ? catalog.filter : initialView.catalogFilter,
        reportSort,
        projectFilter: project ? project.filter : initialView.projectFilter
      };
    }, destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('input', input);
      root.removeEventListener('click', click);
      if (view && view.removeEventListener) { view.removeEventListener('beforeprint', beforePrint); view.removeEventListener('afterprint', afterPrint); }
      afterPrint();
      hiddenBefore.forEach((value, node) => { node.hidden = value; });
      addedTabIndexes.forEach(node => node.removeAttribute('tabindex'));
    }};
  }

  const api = Object.freeze({catalogTools, sortControls, reportNav, planTray, projectTools, trackDetails, mount});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ReportExperience = api;
})();
