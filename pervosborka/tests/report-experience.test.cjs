'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RX = require('../dist/report-experience.js');

// Small DOM surface: the real controller filters and reorders these live nodes.
// It deliberately has no innerHTML setter, so a test cannot pass by rebuilding
// cards and losing their expanded details or stateful descendants.
class Node {
  constructor(tag = 'div', attrs = {}, children = []) {
    this.tagName = tag.toUpperCase(); this.attributes = {}; this.dataset = {};
    this.children = []; this.parentNode = null; this.listeners = new Map();
    this.hidden = false; this.disabled = false; this.open = false; this.value = ''; this.textContent = '';
    for (const [key, value] of Object.entries(attrs)) this.setAttribute(key, value);
    children.forEach(child => this.appendChild(child));
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
  removeAttribute(key) { delete this.attributes[key]; }
  matches(selector) {
    return selector.split(',').some(part => {
      const pieces = part.trim().split(/\s+/);
      const matchSimple = (node, rule) => {
        const tag = rule.match(/^[a-z][\w-]*/i);
        if (tag && node.tagName !== tag[0].toUpperCase()) return false;
        for (const match of rule.matchAll(/\.([\w-]+)/g)) if (!(node.attributes.class || '').split(/\s+/).includes(match[1])) return false;
        for (const match of rule.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)) {
          if (!node.hasAttribute(match[1]) || (match[2] !== undefined && node.getAttribute(match[1]) !== match[2])) return false;
        }
        return true;
      };
      if (!matchSimple(this, pieces.pop())) return false;
      let ancestor = this.parentNode;
      while (pieces.length) {
        const rule = pieces.pop();
        while (ancestor && !matchSimple(ancestor, rule)) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => (child.matches(selector) ? [child] : []).concat(child.querySelectorAll(selector)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode && this.parentNode.closest(selector); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  appendChild(node) {
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    this.children.push(node); node.parentNode = this;
    if (this.ownerDocument) node.assignDocument(this.ownerDocument);
    return node;
  }
  assignDocument(doc) { this.ownerDocument = doc; this.children.forEach(node => node.assignDocument(doc)); }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(handler); }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, target = this) {
    const event = {target, prevented: false, preventDefault() { this.prevented = true; }};
    this.listeners.get(type)?.forEach(handler => handler(event));
    return event;
  }
  focus(options) { this.ownerDocument.activeElement = this; this.focusOptions = options; }
  scrollIntoView(options) { this.scrollOptions = options; }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
const n = (tag, attrs, children) => new Node(tag, attrs, children);
const b = (attr, value, active = false) => n('button', {[attr]: value, 'aria-pressed': String(active)});

function fixture({catalog = true, projects = true, chart = true, reduced = false} = {}) {
  const root = n('main'), win = new Node();
  win.matchMedia = () => ({matches: reduced}); win.location = {hash: '#report'};
  const doc = {defaultView: win, activeElement: null, getElementById: id => root.querySelector(`[id="${id}"]`)};
  root.assignDocument(doc);
  const env = {root, win, doc, click: target => root.emit('click', target), input: target => root.emit('input', target)};
  if (catalog) {
    env.search = n('input', {'data-rx-search-input': ''});
    env.reset = n('button', {'data-rx-reset': ''});
    env.filters = ['all', 'untried', 'checked'].map(value => b('data-rx-filter', value, value === 'all'));
    env.count = n('p', {'data-rx-count': ''}); env.empty = n('div', {'data-rx-empty': ''}); env.empty.hidden = true;
    env.cards = [
      n('article', {'data-rx-track': 'robot', 'data-rx-search': 'Робот Ёлка маршрут', 'data-rx-status': 'checked'}),
      n('article', {'data-rx-track': 'model', 'data-rx-search': 'Робот модель ЛЁГКИЙ корпус', 'data-rx-status': 'untried'}),
      n('article', {'data-rx-track': 'design', 'data-rx-search': 'Цифровой дизайн', 'data-rx-status': 'untried'})
    ];
    env.grid = n('div', {'data-rx-grid': ''}, env.cards);
    env.catalog = n('section', {'data-rx-catalog': ''}, [env.search, env.reset, ...env.filters, env.count, env.empty, env.grid]);
    root.appendChild(env.catalog);
  }
  if (projects) {
    env.projectFilters = ['all', 'chosen'].map(value => b('data-rx-project-filter', value, value === 'all'));
    env.projectCount = n('p', {'data-rx-project-count': ''}); env.projectEmpty = n('div', {'data-rx-project-empty': ''}); env.projectEmpty.hidden = true;
    env.projectCards = [n('article', {'data-rx-project': 'a', 'data-rx-chosen': 'false'}), n('article', {'data-rx-project': 'b', 'data-rx-chosen': 'true'})];
    env.projects = n('section', {'data-rx-projects': ''}, [...env.projectFilters, env.projectCount, env.projectEmpty, ...env.projectCards]);
    root.appendChild(env.projects);
  }
  if (chart) {
    env.sorts = ['order', 'interest'].map(value => b('data-rx-sort', value, value === 'order'));
    env.sortState = n('p', {'data-rx-sort-state': ''});
    env.rows = [
      n('div', {class: 'bar-row', 'data-rx-order': '0', 'data-rx-mean': '4', 'data-rx-eligible': 'true'}),
      n('div', {class: 'bar-row', 'data-rx-order': '1', 'data-rx-mean': '2', 'data-rx-eligible': 'true'}),
      n('div', {class: 'bar-row', 'data-rx-order': '2', 'data-rx-mean': '5', 'data-rx-eligible': 'false'}),
      n('div', {class: 'bar-row', 'data-rx-order': '3', 'data-rx-mean': '4', 'data-rx-eligible': 'true'})
    ];
    env.details = n('details', {class: 'rx-track-details'}); env.rows[0].appendChild(env.details);
    env.chart = n('div', {class: 'bar-chart'}, env.rows);
    [...env.sorts, env.sortState, env.chart].forEach(node => root.appendChild(node));
  }
  return env;
}
const visible = cards => cards.filter(card => !card.hidden);

test('Catalog search normalizes case, ё and whitespace and requires every word', () => {
  const env = fixture(), controller = RX.mount(env.root);
  env.search.value = '  ЕЛКА   РОБОТ  '; env.input(env.search);
  assert.deepEqual(visible(env.cards), [env.cards[0]]);
  assert.equal(env.count.textContent, 'Показано: 1 из 3');
  env.search.value = 'легкий робот'; env.input(env.search);
  assert.deepEqual(visible(env.cards), [env.cards[1]]);
  assert.equal(env.empty.hidden, true);
  controller.destroy();
});

test('Search and status filters intersect; empty results and reset preserve the live cards', () => {
  const env = fixture(), controller = RX.mount(env.root), original = env.grid.children.slice();
  env.search.value = 'робот'; env.input(env.search); env.click(env.filters[1]);
  assert.deepEqual(visible(env.cards), [env.cards[1]]);
  env.search.value = 'ничего такого'; env.input(env.search);
  assert.equal(env.empty.hidden, false); assert.equal(env.reset.disabled, false);
  env.click(env.reset);
  assert.equal(env.search.value, ''); assert.equal(env.doc.activeElement, env.search);
  assert.deepEqual(visible(env.cards), env.cards); assert.deepEqual(env.grid.children, original);
  assert.equal(env.filters[0].getAttribute('aria-pressed'), 'true'); assert.equal(env.reset.disabled, true);
  controller.destroy();
});

test('Project filter never edits chosen state or intercepts an app plan action', () => {
  const env = fixture(), controller = RX.mount(env.root);
  env.click(env.projectFilters[1]);
  assert.deepEqual(visible(env.projectCards), [env.projectCards[1]]);
  const remove = n('button', {'data-action': 'plan:b'}); env.projectCards[1].appendChild(remove);
  assert.equal(env.click(remove).prevented, false);
  assert.equal(env.projectCards[1].dataset.rxChosen, 'true');
  env.click(env.projectFilters[0]); assert.deepEqual(visible(env.projectCards), env.projectCards);
  env.projectCards[1].dataset.rxChosen = 'false'; env.click(env.projectFilters[1]);
  assert.equal(env.projectEmpty.hidden, false); assert.equal(env.projectCount.textContent, 'Показано: 0 из 2');
  controller.destroy();
});

test('Interest sorting is stable, keeps unknown data last and moves the original nodes', () => {
  const env = fixture(), controller = RX.mount(env.root);
  env.details.open = true; env.click(env.sorts[1]);
  assert.deepEqual(env.chart.children, [env.rows[0], env.rows[3], env.rows[1], env.rows[2]]);
  assert.equal(env.rows[0].children[0], env.details); assert.equal(env.details.open, true);
  env.click(env.sorts[0]); assert.deepEqual(env.chart.children, env.rows);
  assert.equal(env.sorts[0].getAttribute('aria-pressed'), 'true');
  controller.destroy();
});

test('An invalid mean cannot displace a valid eligible row', () => {
  const env = fixture(); env.rows[0].dataset.rxMean = ''; env.rows[3].dataset.rxMean = 'NaN';
  const controller = RX.mount(env.root, {view: {reportSort: 'interest'}});
  assert.deepEqual(env.chart.children, [env.rows[1], env.rows[0], env.rows[2], env.rows[3]]);
  controller.destroy();
});

test('View survives destroy and a rerender, including unmounted page controls', () => {
  const first = fixture(), a = RX.mount(first.root);
  first.search.value = 'РоБоТ'; first.input(first.search); first.click(first.filters[1]); first.click(first.sorts[1]); first.click(first.projectFilters[1]);
  const saved = a.getView();
  assert.deepEqual(saved, {catalogQuery: 'РоБоТ', catalogFilter: 'untried', reportSort: 'interest', projectFilter: 'chosen'});
  a.destroy();
  const second = fixture(), bController = RX.mount(second.root, {view: saved});
  assert.deepEqual(visible(second.cards), [second.cards[1]]); assert.equal(second.search.value, 'РоБоТ');
  assert.deepEqual(visible(second.projectCards), [second.projectCards[1]]);
  assert.deepEqual(second.chart.children, [second.rows[0], second.rows[3], second.rows[1], second.rows[2]]);
  bController.destroy();
  const empty = fixture({catalog: false, chart: false, projects: false}), c = RX.mount(empty.root, {view: saved});
  assert.deepEqual(c.getView(), saved);
  const copy = c.getView(); copy.catalogFilter = 'checked'; assert.equal(c.getView().catalogFilter, 'untried'); c.destroy();
});

test('View validates filter values and limits search length without storage', () => {
  const env = fixture(), controller = RX.mount(env.root, {view: {catalogQuery: 'я'.repeat(200), catalogFilter: 'bad', reportSort: 'score', projectFilter: 'selected'}});
  assert.equal(controller.getView().catalogQuery.length, 120);
  assert.deepEqual({...controller.getView(), catalogQuery: ''}, {catalogQuery: '', catalogFilter: 'all', reportSort: 'order', projectFilter: 'all'});
  controller.destroy();
});

test('Report navigation focuses its heading without changing the SPA hash; reduced motion is respected', () => {
  const env = fixture({reduced: true}), jump = b('data-rx-jump', 'report-plan'), heading = n('h2'), target = n('section', {id: 'report-plan'}, [heading]);
  env.root.appendChild(jump); env.root.appendChild(target);
  const controller = RX.mount(env.root);
  assert.equal(env.click(jump).prevented, true); assert.equal(env.doc.activeElement, heading);
  assert.deepEqual(heading.focusOptions, {preventScroll: true}); assert.deepEqual(target.scrollOptions, {behavior: 'auto', block: 'start'});
  assert.equal(env.win.location.hash, '#report'); assert.equal(heading.getAttribute('tabindex'), '-1');
  controller.destroy(); assert.equal(heading.hasAttribute('tabindex'), false);
});

test('Foreign controls and destinations remain outside this controller', () => {
  const env = fixture(), foreign = b('data-rx-filter', 'checked'), controller = RX.mount(env.root);
  assert.equal(env.click(foreign).prevented, false); assert.deepEqual(visible(env.cards), env.cards);
  const jump = b('data-rx-jump', 'report-plan'); env.root.appendChild(jump);
  env.doc.getElementById = () => n('section', {id: 'report-plan'});
  assert.equal(env.click(jump).prevented, false);
  controller.destroy();
});

test('Print temporarily reveals every card and detail, then restores screen filters and disclosure states', () => {
  const env = fixture(), controller = RX.mount(env.root);
  env.click(env.filters[2]); env.click(env.projectFilters[1]);
  const beforeCards = env.cards.map(card => card.hidden), beforeProjects = env.projectCards.map(card => card.hidden), saved = controller.getView();
  env.win.emit('beforeprint'); env.win.emit('beforeprint');
  assert.deepEqual(visible(env.cards), env.cards); assert.deepEqual(visible(env.projectCards), env.projectCards); assert.equal(env.details.open, true);
  env.win.emit('afterprint');
  assert.deepEqual(env.cards.map(card => card.hidden), beforeCards); assert.deepEqual(env.projectCards.map(card => card.hidden), beforeProjects); assert.equal(env.details.open, false);
  assert.deepEqual(controller.getView(), saved); controller.destroy();
});

test('Destroy removes handlers idempotently and restores filtered cards even during print', () => {
  const env = fixture(), controller = RX.mount(env.root);
  env.click(env.filters[2]); env.win.emit('beforeprint'); controller.destroy(); controller.destroy();
  assert.equal(env.root.listenerCount, 0); assert.equal(env.win.listenerCount, 0);
  assert.deepEqual(visible(env.cards), env.cards); assert.deepEqual(visible(env.projectCards), env.projectCards); assert.equal(env.details.open, false);
});

test('Plan tray shows only actual selected tracks, exactly two slots and readonly controls are absent', () => {
  const tracks = [{id: 'a', name: 'Инженерия', project: 'Мост'}, {id: 'b', name: 'Дизайн', project: 'Мир'}];
  const empty = RX.planTray(tracks, []), one = RX.planTray(tracks, ['b', 'b', 'missing']);
  assert.match(empty, /<strong>0 \/ 2<\/strong>/); assert.equal((empty.match(/rx-plan-slot /g) || []).length, 2); assert.doesNotMatch(empty, /data-action/);
  assert.match(one, /<strong>1 \/ 2<\/strong>/); assert.match(one, /data-action="plan:b"/); assert.doesNotMatch(one, /data-action="plan:a"/);
  assert.match(one, />Мир<\/strong>/); assert.doesNotMatch(one, />Мост<\/strong>/);
  const readonly = RX.planTray(tracks, ['a', 'b'], true); assert.match(readonly, /2 \/ 2/); assert.doesNotMatch(readonly, /data-action|rx-plan-remove/);
});

test('Track details distinguish numerical answers, unknown reflection and first/last task checks', () => {
  const html = RX.trackDetails({track: {id: 'robot', name: 'Робот'}, score: {count: 3, total: 6, eligible: false}, record: {first: {score: 1, total: 3}, last: {score: 3, total: 3}, attempts: 4, hintUsed: true, firstHadHint: false}, reflection: null, hasReflection: true});
  assert.match(html, /3 из 6 ответов по шкале 1–5/); assert.match(html, /1 из 3 условий/); assert.match(html, /3 из 3 условий/);
  assert.match(html, /Всего проверок: 4/); assert.match(html, /Пока не могу оценить/); assert.match(html, /после первой проверки/);
  assert.match(html, /href="#lab:robot"/); assert.doesNotMatch(html, /0 из 5/);
  assert.doesNotMatch(RX.trackDetails({track: {id: 'robot'}, readOnly: true}), /href="#lab:/);
});

test('Rendered labels escape user text and readonly output contains no plan mutations', () => {
  const hostile = {id: 'x" onclick="bad', name: '<img src=x onerror=bad>', project: '<script>bad()</script>'};
  for (const html of [RX.planTray([hostile], [hostile.id]), RX.trackDetails({track: hostile})]) {
    assert.doesNotMatch(html, /<script>|<img | onclick="bad/); assert.match(html, /&lt;/);
  }
  assert.doesNotMatch(RX.planTray([hostile], [hostile.id], true), /data-action=/);
  const tools = RX.catalogTools(); assert.match(tools, /type="search"/); assert.match(tools, /role="status"/); assert.match(tools, /data-rx-empty hidden/);
  assert.match(RX.projectTools(), /data-rx-project-filter="chosen"/);
  assert.equal((RX.reportNav().match(/data-rx-jump=/g) || []).length, 3);
});
