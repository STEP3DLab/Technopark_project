'use strict';
// Event-level regression tests of the unmodified app bundle. This small DOM stub
// models form values, dialogs and downloads; visual/browser behavior is tested separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = require('../workspace-utils.js');
const C = require('../estimate-utils.js');

const APP_DIR = path.resolve(__dirname, '..');
const STORE_KEY = 'msk-expert-monitor-workspace-v1';
const UI_KEY = 'msk-expert-monitor-ui-v2';
const decode = value => String(value || '').replace(/&(?:amp|lt|gt|quot|#39);/g,
  entity => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"}[entity]));

async function boot(initial = W.emptyWorkspace(), options = {}) {
  const elements = new Map();
  const nodes = new Set();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const downloads = [];
  const blobs = new Map();
  const confirmations = [];
  const data = new Map([[STORE_KEY, JSON.stringify(initial)]]);
  if (options.uiPreferences) data.set(UI_KEY, JSON.stringify(options.uiPreferences));
  const storage = {
    failWrites: false,
    getItem(key) {return data.has(key) ? data.get(key) : null;},
    setItem(key, value) {if (key === STORE_KEY && this.failWrites) throw new Error('QuotaExceededError'); data.set(key, String(value));},
    removeItem(key) {data.delete(key);}
  };
  function matches(node, selector) {
    const descendant = /^(#[\w-]+)\s+(.+)$/.exec(selector);
    if (descendant) {
      if (!matches(node, descendant[2])) return false;
      for (let parent = node.formOwner || node.owner; parent; parent = parent.formOwner || parent.owner)
        if (matches(parent, descendant[1])) return true;
      return false;
    }
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    const attribute = /^(?:([\w-]+))?\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(selector);
    if (attribute) return (!attribute[1] || node.tagName === attribute[1].toUpperCase())
      && Object.hasOwn(node.attrs, attribute[2])
      && (attribute[3] === undefined || node.attrs[attribute[2]] === attribute[3]);
    return node.tagName === selector.toUpperCase();
  }
  class Node {
    constructor(tag = 'div', attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attrs = {...attrs}; this.dataset = {};
      this.id = attrs.id || ''; this.name = attrs.name || ''; this.type = attrs.type || '';
      this.value = decode(attrs.value || ''); this.textContent = ''; this.style = {};
      this.checked = Object.hasOwn(attrs, 'checked'); this.hidden = Object.hasOwn(attrs, 'hidden');
      this.disabled = Object.hasOwn(attrs, 'disabled');
      this.open = false; this.isConnected = true; this.listeners = new Map(); this._html = '';
      const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
      this.classList = {add: (...items) => items.forEach(c => classes.add(c)),
        remove: (...items) => items.forEach(c => classes.delete(c)), contains: c => classes.has(c),
        toggle: (c, force) => {const on = force === undefined ? !classes.has(c) : force; if (on) classes.add(c); else classes.delete(c); return on;}};
      for (const [name, value] of Object.entries(attrs)) if (name.startsWith('data-'))
        this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decode(value);
    }
    set innerHTML(html) {this._html = String(html); parse(this, this._html);}
    get innerHTML() {return this._html;}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    querySelectorAll(selector) {
      if (selector === '[data-icon]') return [];
      return [...nodes].filter(n => n.isConnected && (n.owner === this || n.formOwner === this) && matches(n, selector));
    }
    addEventListener(name, fn) {if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn);}
    async dispatch(name, event = {}) {for (const fn of this.listeners.get(name) || []) await fn({target: this, preventDefault() {}, ...event});}
    setAttribute(name, value) {this.attrs[name] = String(value);}
    removeAttribute(name) {delete this.attrs[name];}
    focus() {document.activeElement = this;}
    select() {}
    checkValidity() {
      if (this.tagName === 'FORM') return [...nodes].filter(n => n.formOwner === this).every(n => n.checkValidity());
      if (this.attrs.required !== undefined && !this.value) return false;
      if (this.type === 'number' && this.value !== '') {
        const number = Number(this.value);
        return Number.isFinite(number) && (this.attrs.min === undefined || number >= Number(this.attrs.min))
          && (this.attrs.max === undefined || number <= Number(this.attrs.max))
          && (this.attrs.step === undefined || this.attrs.step === 'any' || Number.isInteger(number / Number(this.attrs.step)));
      }
      return true;
    }
    reportValidity() {return this.checkValidity();}
    closest(selector) {
      for (const part of selector.split(',')) {
        if (matches(this, part.trim())) return this;
        if (this.formOwner && matches(this.formOwner, part.trim())) return this.formOwner;
      }
      return null;
    }
    appendChild(node) {node.owner = this; nodes.add(node); return node;}
    remove() {this.isConnected = false; nodes.delete(this);}
    click() {if (this.download) downloads.push({name: this.download, blob: blobs.get(this.href)});}
    showModal() {this.open = true;}
    close() {this.open = false; void this.dispatch('close');}
    insertAdjacentHTML(position, html) {this.innerHTML = position === 'afterbegin' ? html + this._html : this._html + html;}
    getBoundingClientRect() {return {left: 0, top: 0, right: 1000, bottom: 1000};}
  }
  function parse(owner, html) {
    for (const node of [...nodes]) if (node.owner === owner) {
      node.isConnected = false; nodes.delete(node);
      if (node.id && elements.get(node.id) === node) elements.delete(node.id);
    }
    const forms = [];
    const found = [];
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
      const attrs = {};
      for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
        attrs[attr[1]] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
      if (!attrs.id && !attrs.name && !Object.keys(attrs).some(k => k.startsWith('data-'))) continue;
      const node = new Node(match[1], attrs); node.owner = owner;
      node.position = match.index; nodes.add(node); found.push(node);
      if (node.id) elements.set(node.id, node);
      const after = html.slice(match.index + match[0].length);
      if (node.tagName === 'TEXTAREA') node.value = decode(after.split('</textarea>')[0]);
      if (node.tagName === 'SELECT') {
        const body = after.split('</select>')[0];
        const choices = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
        const selected = choices.find(choice => /\bselected\b/.test(choice[1])) || choices[0];
        node.value = selected ? decode(/\bvalue="([^"]*)"/.exec(selected[1])?.[1] ?? selected[2]) : '';
      }
      if (node.tagName === 'FORM') {
        node.endPosition = html.indexOf('</form>', match.index); forms.push(node);
      }
    }
    for (const node of found) node.formOwner = forms.find(f => node !== f && node.position > f.position && node.position < f.endPosition) || null;
  }
  const document = {
    hidden: false, activeElement: null,
    querySelector: selector => /^#[\w-]+$/.test(selector) ? elements.get(selector.slice(1)) || null : document.querySelectorAll(selector)[0] || null,
    querySelectorAll: selector => selector === '[data-icon]' ? [] : [...nodes].filter(n => n.isConnected && matches(n, selector)),
    createElement: tag => new Node(tag),
    addEventListener(name, fn) {if (!documentListeners.has(name)) documentListeners.set(name, []); documentListeners.get(name).push(fn);},
    execCommand() {return true;}
  };
  document.body = new Node('body');
  document.body.innerHTML = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  const location = {hostname: 'localhost', href: 'http://localhost/expert-monitor/#opportunities', hash: '#opportunities'};
  const history = {replaceState(_state, _title, url) {
    const next = new URL(url, location.href); location.href = next.href; location.hash = next.hash;
  }};
  const registry = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data/registry.json'), 'utf8'));
  if (options.records) registry.opportunities = options.records;
  const monitor = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data/monitoring.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'data/source-config.json'), 'utf8'));
  const responses = {registry: Object.hasOwn(options, 'registryPayload') ? options.registryPayload : registry, monitor, config};
  let registryParseError = false;
  class URLForTest extends URL {
    static createObjectURL(blob) {const id = 'blob:test-' + blobs.size; blobs.set(id, blob); return id;}
    static revokeObjectURL() {}
  }
  class FormDataForTest {
    constructor(form) {this.entries = [...nodes].filter(n => n.formOwner === form && n.name && !n.disabled)
      .filter(n => !['checkbox', 'radio'].includes(n.type) || n.checked).map(n => [n.name, n.value]);}
    [Symbol.iterator]() {return this.entries[Symbol.iterator]();}
  }
  const context = vm.createContext({document, location, history, localStorage: storage,
    URL: URLForTest, URLSearchParams, Blob, AbortController, FormData: FormDataForTest,
    navigator: {clipboard: {writeText: async () => {}}}, console,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    scrollTo() {}, print() {},
    confirm(message) {confirmations.push(message); return options.confirmResult ?? false;},
    prompt() {return null;},
    addEventListener(name, fn) {if (!windowListeners.has(name)) windowListeners.set(name, []); windowListeners.get(name).push(fn);},
    fetch: async url => ({ok: true, json: async () => {
      if (String(url).includes('source-config')) return responses.config;
      if (String(url).includes('monitoring')) return responses.monitor;
      if (registryParseError) throw new SyntaxError('Unexpected token in registry JSON');
      return responses.registry;
    }})
  });
  context.window = context;
  vm.runInContext('globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));', context);
  for (const filename of ['monitor-utils.js', 'estimate-utils.js', 'workspace-utils.js', 'registry-utils.js', 'workbench-utils.js', 'opportunity-utils.js',
    'export-utils.js', 'proposal-utils.js', 'selection-ui.js', 'estimate-ui.js', 'workbench-ui.js', 'experience-ui.js', 'app.js'])
    vm.runInContext(fs.readFileSync(path.join(APP_DIR, filename), 'utf8'), context, {filename});
  for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve));
  async function dispatchDocument(name, event) {
    for (const fn of documentListeners.get(name) || []) await fn({preventDefault() {}, ...event});
  }
  async function click(action, id) {
    await dispatchDocument('click', {target: new Node('button', {'data-action': action, ...(id ? {'data-id': id} : {})})});
  }
  return {document, storage, downloads, confirmations, location, registry, click,
    keydown: event => dispatchDocument('keydown',event),
    clickElement: target => target.disabled ? Promise.resolve() : dispatchDocument('click', {target}),
    inputElement: (target, value) => {target.value = value; return dispatchDocument('input', {target});},
    changeElement: target => dispatchDocument('change', {target}),
    setRegistryPayload(value) {responses.registry = value; registryParseError = false;},
    setRegistryParseError(value) {registryParseError = Boolean(value);},
    get: id => {const node = elements.get(id); assert.ok(node, 'Expected rendered element #' + id); return node;},
    stored: () => JSON.parse(data.get(STORE_KEY)),
    view: view => dispatchDocument('click', {target: new Node('button', {'data-view': view})}),
    submit: id => dispatchDocument('submit', {target: elements.get(id)}),
    input: (id, value) => {const target = elements.get(id); assert.ok(target); target.value = value;
      return dispatchDocument('input', {target});},
    async windowEvent(name, event) {for (const fn of windowListeners.get(name) || []) await fn(event);},
    async beforeUnload() {const event = {prevented: false, preventDefault() {this.prevented = true;}};
      for (const fn of windowListeners.get('beforeunload') || []) await fn(event); return event;}
  };
}

test('A failed storage write preserves unsaved detail text and its close/unload protection', async () => {
  const app = await boot();
  const id = app.registry.opportunities[0].id;
  await app.click('open-detail', id);
  app.get('detail-note').value = 'Важные несохранённые данные';
  app.get('detail-price').value = '150000';
  app.storage.failWrites = true;
  await app.click('save-note');
  assert.equal(app.stored().notes[id], undefined);
  assert.equal(app.get('detail-note').value, 'Важные несохранённые данные');
  assert.equal((await app.beforeUnload()).prevented, true, 'Failed save must remain dirty');
  await app.click('close-detail');
  assert.equal(app.confirmations.length, 1, 'Closing an unsaved detail must request confirmation');
  assert.equal(app.get('detail-dialog').open, true, 'Cancel must keep the editor open');
});

test('Preparing a proposal cannot close the detail or navigate away after failed persistence', async () => {
  const app = await boot();
  const id = app.registry.opportunities[0].id;
  await app.click('open-detail', id);
  app.get('detail-note').value = 'Сначала сохранить эту заметку';
  app.storage.failWrites = true;
  await app.click('draft-from-detail');
  assert.equal(app.get('detail-dialog').open, true);
  assert.ok(!app.location.hash.startsWith('#proposals'));
  assert.equal(app.get('detail-note').value, 'Сначала сохранить эту заметку');
  assert.equal(app.stored().notes[id], undefined);
});

test('A successful detail save clears dirty protection and persists the entered values', async () => {
  const app = await boot();
  const id = app.registry.opportunities[0].id;
  await app.click('open-detail', id);
  app.get('detail-note').value = 'Проверить материалы';
  app.get('detail-price').value = '250000';
  app.get('detail-work').value = 'review';
  await app.click('save-note');
  assert.equal(app.stored().notes[id].text, 'Проверить материалы');
  assert.equal(app.stored().notes[id].proposalRub, 250000);
  assert.equal(app.stored().work[id], 'review');
  assert.equal((await app.beforeUnload()).prevented, false);
  await app.click('close-detail');
  assert.equal(app.confirmations.length, 0);
  assert.equal(app.get('detail-dialog').open, false);
});

test('Importing an identical backup preserves all extended workspace fields', async () => {
  const initial = {...W.emptyWorkspace(), notes: {case1: {text: 'Моя заметка'}},
    favorites: ['case1'], tasks: {case1: {text: 'Уточнить', dueDate: '2026-11-02', updatedAt: '2026-10-29T08:00:00Z'}},
    checks: {case1: {stage: true}}, drafts: [{id: 'draft1', contact: 'Контакт'}],
    savedFilters: [{id: 'filter1', name: 'На проверку', filters: {status: 'needs_review'}}]};
  const app = await boot(initial);
  const payload = JSON.stringify(initial);
  const input = app.get('backup-input');
  input.files = [{size: Buffer.byteLength(payload), text: async () => payload}];
  await input.dispatch('change');
  assert.equal(app.get('confirm-dialog').open, true);
  await app.click('confirm-import');
  const saved = app.stored();
  delete saved.exportedAt; // Export metadata may be renewed while user data stays identical.
  assert.deepEqual(saved, initial);
});

test('Failed proposal save retains organization/contact edits and cancels replacement without a case number', async () => {
  const app = await boot();
  await app.view('proposals');
  app.get('organization').value = 'Новая организация';
  app.get('contact').value = 'Несохранённый контакт';
  assert.equal(app.get('caseNumber').value, '');
  app.storage.failWrites = true;
  await app.submit('proposal-form');
  assert.equal(app.stored().drafts.length, 0);
  assert.equal((await app.beforeUnload()).prevented, true);
  await app.click('new-draft');
  assert.equal(app.confirmations.length, 1);
  assert.equal(app.get('organization').value, 'Новая организация');
  assert.equal(app.get('contact').value, 'Несохранённый контакт');
  app.storage.failWrites = false;
  await app.submit('proposal-form');
  assert.equal(app.stored().drafts.length, 1);
  assert.equal(app.stored().drafts[0].contact, 'Несохранённый контакт');
  assert.equal((await app.beforeUnload()).prevented, false);
});

test('Another tab changing the workspace blocks overwrite and leaves the current detail dirty', async () => {
  const app = await boot();
  const id = app.registry.opportunities[0].id;
  await app.click('open-detail', id);
  app.get('detail-note').value = 'Несохранённая правка этой вкладки';
  const other = {...W.emptyWorkspace(), notes: {[id]: {text: 'Сохранено в другой вкладке'}}};
  const serialized = JSON.stringify(other);
  app.storage.setItem(STORE_KEY, serialized);
  await app.windowEvent('storage', {storageArea: app.storage, key: STORE_KEY, newValue: serialized});
  await app.click('save-note');
  assert.equal(app.stored().notes[id].text, 'Сохранено в другой вкладке');
  assert.equal(app.get('detail-note').value, 'Несохранённая правка этой вкладки');
  assert.equal((await app.beforeUnload()).prevented, true);
  assert.ok(app.document.querySelector('#storage-conflict-banner'));
});

test('CSV export neutralizes spreadsheet formulas even after whitespace and preserves ordinary text', async () => {
  const values = ['=1+1', ' +1+1', ' \t@SUM(1)', '\n=1+1', ' \r-1+1', '\uFEFF=1+1', 'Обычная заметка'];
  const initial = W.emptyWorkspace();
  const records = values.map((text, index) => {
    const id = 'csv-case-' + index; initial.notes[id] = {text};
    return {id, caseNumber: 'TEST-' + index, title: 'Проверка выгрузки', status: 'historical',
      sourceType: 'court_decision', publishedAt: '2026-10-01', region: 'Москва'};
  });
  const app = await boot(initial, {records});
  await app.click('export-csv');
  assert.equal(app.get('export-dialog').open, true);
  await app.click('export-work-csv');
  const file = app.downloads.find(download => download.name.endsWith('.csv'));
  assert.ok(file?.blob);
  const content = await file.blob.text();
  for (const value of values.slice(0, -1)) assert.ok(content.includes('"\'' + value + '"'), 'Unprotected CSV formula: ' + JSON.stringify(value));
  assert.ok(content.includes('"Обычная заметка"'));
});

test('Malformed registry and JSON parse failure leave refresh usable, and a later valid response recovers', async () => {
  const app = await boot(W.emptyWorkspace(), {registryPayload: null});
  assert.equal(app.get('refresh-button').disabled, false, 'Malformed data must release the loading lock');
  assert.ok(!app.get('refresh-button').classList.contains('spinning'));
  assert.match(app.get('main').innerHTML, /База пока недоступна/);
  assert.equal(app.document.querySelector('#lead-results'), null);

  app.setRegistryParseError(true);
  await app.click('refresh');
  assert.equal(app.get('refresh-button').disabled, false, 'A parse error must also release the loading lock');
  assert.match(app.get('main').innerHTML, /База пока недоступна/);

  app.setRegistryPayload(app.registry);
  await app.click('refresh');
  assert.equal(app.get('refresh-button').disabled, false);
  assert.ok(app.document.querySelector('#lead-results'), 'A subsequent refresh must render recovered records');
  assert.doesNotMatch(app.get('main').innerHTML, /База пока недоступна/);
  assert.deepEqual(app.stored(), W.emptyWorkspace(), 'Public-data errors must not alter local work');
});

test('A decimal own price survives detail and draft saves and stays exact in proposal preview and TXT', async () => {
  const app = await boot();
  const id = app.registry.opportunities[0].id;
  await app.click('open-detail', id);
  app.get('detail-price').value = '125000.50';
  await app.click('save-note');
  assert.equal(app.stored().notes[id].proposalRub, 125000.5);

  await app.click('draft-from-detail');
  assert.equal(Number(app.get('price').value), 125000.5);
  assert.equal(app.get('price').attrs.step, 'any', 'The proposal price must accept kopecks');
  assert.equal(app.get('price').checkValidity(), true);
  await app.input('price', app.get('price').value);
  const readable = value => value.replace(/[\u00a0\u202f]/g, ' ');
  assert.match(readable(app.get('proposal-preview').innerHTML), /125 000,50 ₽/);
  assert.doesNotMatch(readable(app.get('proposal-preview').innerHTML), /125 001 ₽/);

  await app.submit('proposal-form');
  assert.equal(app.stored().drafts.length, 1);
  assert.equal(Number(app.stored().drafts[0].price), 125000.5);
  assert.equal(app.stored().notes[id].proposalRub, 125000.5);
  await app.click('download-proposal');
  const file = app.downloads.find(download => download.name.endsWith('.txt'));
  assert.ok(file?.blob);
  const text = readable(await file.blob.text());
  assert.match(text, /Стоимость: 125 000,50 ₽/);
  assert.doesNotMatch(text, /125 001 ₽/);
});

const futureRecord = (id = 'workflow-record') => ({id, caseNumber: 'TEST-2099', title: 'PUBLIC_DEADLINE_RECORD',
  status: 'needs_review', sourceType: 'court_decision', region: 'Москва',
  deadline: '2099-12-31T10:00:00+03:00', publishedAt: '2026-10-29',
  sourceUrl: 'https://court.example/case/2099', amountType: 'not_published', amountRub: null});
const plannedTask = text => ({text, dueDate: '2099-11-30', updatedAt: '2026-10-29T09:00:00Z'});

test('Completing and restoring a task preserves its text and date and updates the next-action overview', async () => {
  const row = futureRecord();
  const text = 'TASK_TO_COMPLETE_UNIQUE';
  const app = await boot({...W.emptyWorkspace(), tasks: {[row.id]: plannedTask(text)}}, {records: [row]});
  await app.view('overview');
  assert.ok(app.get('main').innerHTML.includes(text));
  await app.view('planner');
  await app.click('toggle-task', row.id);
  const completed = app.stored().tasks[row.id];
  assert.equal(completed.text, text);
  assert.equal(completed.dueDate, '2099-11-30');
  assert.ok(Number.isFinite(Date.parse(completed.completedAt)));
  assert.equal(app.get('nav-planner').textContent, '0');
  await app.view('overview');
  assert.ok(!app.get('main').innerHTML.includes(text), 'Completed tasks must leave next actions');

  await app.view('planner');
  await app.click('toggle-task', row.id);
  assert.equal(app.stored().tasks[row.id].completedAt, undefined);
  assert.equal(app.stored().tasks[row.id].text, text);
  assert.equal(app.get('nav-planner').textContent, '1');
  await app.view('overview');
  assert.ok(app.get('main').innerHTML.includes(text));
});

test('A failed task completion write leaves the task pending in storage and next actions', async () => {
  const row = futureRecord();
  const text = 'TASK_WRITE_FAILURE_UNIQUE';
  const app = await boot({...W.emptyWorkspace(), tasks: {[row.id]: plannedTask(text)}}, {records: [row]});
  await app.view('planner');
  app.storage.failWrites = true;
  await app.click('toggle-task', row.id);
  assert.equal(app.stored().tasks[row.id].completedAt, undefined);
  assert.equal(app.stored().tasks[row.id].text, text);
  assert.equal(app.get('nav-planner').textContent, '1');
  await app.view('overview');
  assert.ok(app.get('main').innerHTML.includes(text));
});

test('A task whose record left the registry remains visible and editable through the planner form', async () => {
  const id = 'orphaned-record';
  const app = await boot({...W.emptyWorkspace(), tasks: {[id]: plannedTask('ORPHAN_TASK_ORIGINAL')}}, {records: []});
  await app.view('planner');
  assert.ok(app.get('main').innerHTML.includes('ORPHAN_TASK_ORIGINAL'));
  assert.ok(app.get('main').innerHTML.includes(id));
  await app.click('edit-task', id);
  assert.equal(app.get('task-dialog').open, true);
  assert.equal(app.get('task-text').value, 'ORPHAN_TASK_ORIGINAL');
  app.get('task-text').value = 'ORPHAN_TASK_REVISED';
  app.get('task-date').value = '2099-12-01';
  await app.submit('task-form');
  assert.equal(app.stored().tasks[id].text, 'ORPHAN_TASK_REVISED');
  assert.equal(app.stored().tasks[id].dueDate, '2099-12-01');
  assert.equal(app.get('task-dialog').open, false);
  assert.ok(app.get('main').innerHTML.includes('ORPHAN_TASK_REVISED'));
});

test('A failed orphan-task save exposes an in-dialog backup that preserves unsaved edits without changing storage', async () => {
  const id = 'orphaned-emergency-task';
  const initial = {...W.emptyWorkspace(),
    tasks: {[id]: plannedTask('ORPHAN_TASK_SAVED'), kept: plannedTask('ANOTHER_SAVED_TASK')},
    notes: {kept: {text: 'PRESERVED_NOTE', proposalRub: 125000.5}},
    work: {kept: 'review'}, favorites: ['kept'], checks: {kept: {stage: true}},
    company: {organization: 'PRESERVED_ORGANIZATION', contact: 'backup@example.org', signatory: 'PRESERVED_SIGNATORY'},
    drafts: [{id: 'saved-draft', subject: 'PRESERVED_DRAFT', documentKind: 'procurement', documentMode: 'draft'}],
    savedFilters: [{id: 'kept-filter', name: 'PRESERVED_FILTER', filters: {status: 'needs_review'}}]};
  const app = await boot(initial, {records: []});
  await app.view('planner');
  await app.click('edit-task', id);
  await app.input('task-text', 'ORPHAN_TASK_UNSAVED_RECOVERY');
  await app.input('task-date', '2099-12-02');
  app.storage.failWrites = true;
  await app.submit('task-form');

  assert.equal(app.get('task-dialog').open, true, 'The failed save must leave the task editor open');
  assert.equal(app.get('task-text').value, 'ORPHAN_TASK_UNSAVED_RECOVERY');
  assert.equal(app.get('task-date').value, '2099-12-02');
  const feedback = app.get('task-content').querySelector('#task-save-state');
  assert.ok(feedback && !feedback.hidden, 'The failure must be shown inside the open modal');
  assert.equal(feedback.attrs.role, 'status');
  assert.match(feedback.textContent, /не сохранил данные/);
  assert.match(feedback.textContent, /резервную копию JSON/);
  assert.deepEqual(app.stored(), initial, 'A failed write must preserve every stored field');

  const backupButton = app.get('task-content').querySelector('[data-action="backup"]');
  assert.ok(backupButton && !backupButton.hidden && !backupButton.disabled,
    'Emergency recovery must be reachable inside the open modal');
  assert.equal(backupButton.type, 'button', 'Backup must not submit the failing form again');
  await app.clickElement(backupButton);
  assert.equal(app.downloads.length, 1);
  assert.ok(app.downloads[0].name.endsWith('.json'));
  const backup = JSON.parse(await app.downloads[0].blob.text());
  assert.equal(W.validBackup(backup), true, 'The emergency file must remain restorable');
  assert.equal(backup.tasks[id].text, 'ORPHAN_TASK_UNSAVED_RECOVERY');
  assert.equal(backup.tasks[id].dueDate, '2099-12-02');
  assert.deepEqual(backup.tasks.kept, initial.tasks.kept);
  for (const key of ['notes', 'work', 'favorites', 'checks', 'company', 'drafts', 'savedFilters'])
    assert.deepEqual(backup[key], initial[key], 'Backup must retain the existing ' + key);
  assert.deepEqual(app.stored(), initial, 'Downloading recovery data must not mutate storage');
  assert.equal(app.get('task-dialog').open, true);
  assert.equal((await app.beforeUnload()).prevented, true, 'A backup download must not mark the unsaved edit as saved');
});

test('Public deadlines and personal task calendar actions export separate datasets', async () => {
  const row = futureRecord();
  const privateText = 'PRIVATE_CALENDAR_TASK';
  const initial = {...W.emptyWorkspace(), notes: {[row.id]: {text: 'PRIVATE_CALENDAR_NOTE', proposalRub: 987654.5}},
    tasks: {[row.id]: plannedTask(privateText), orphan: plannedTask('PRIVATE_ORPHAN_TASK'),
      completed: {...plannedTask('PRIVATE_COMPLETED_TASK'), completedAt: '2026-10-29T10:00:00Z'}}};
  const app = await boot(initial, {records: [row]});
  await app.view('planner');
  await app.click('calendar-deadlines');
  assert.equal(app.downloads.length, 1);
  assert.ok(app.downloads[0].name.endsWith('.ics'));
  const publicIcs = (await app.downloads[0].blob.text()).replace(/\r\n[ \t]/g, '');
  assert.match(publicIcs, /PUBLIC_DEADLINE_RECORD/);
  assert.match(publicIcs, /STATUS:TENTATIVE/);
  assert.doesNotMatch(publicIcs, /PRIVATE_|987654|CLASS:PRIVATE/);

  await app.click('calendar-tasks');
  assert.equal(app.downloads.length, 2);
  const privateIcs = (await app.downloads[1].blob.text()).replace(/\r\n[ \t]/g, '');
  assert.match(privateIcs, /PRIVATE_CALENDAR_TASK/);
  assert.match(privateIcs, /PRIVATE_ORPHAN_TASK/);
  assert.match(privateIcs, /CLASS:PRIVATE/);
  assert.doesNotMatch(privateIcs, /PRIVATE_COMPLETED_TASK|PRIVATE_CALENDAR_NOTE|987654/);
  assert.doesNotMatch(privateIcs, /SUMMARY:Проверить срок:/);
  assert.equal((privateIcs.match(/BEGIN:VEVENT/g) || []).length, 2);
});

test('CSV requires an explicit public or working export choice and public export omits local data', async () => {
  const row = futureRecord();
  const initial = {...W.emptyWorkspace(), notes: {[row.id]: {text: 'PRIVATE_CSV_NOTE', proposalRub: 987654.5}},
    tasks: {[row.id]: plannedTask('PRIVATE_CSV_TASK')}, work: {[row.id]: 'review'}, favorites: [row.id]};
  const app = await boot(initial, {records: [row]});
  await app.click('export-csv');
  assert.equal(app.get('export-dialog').open, true);
  assert.equal(app.downloads.length, 0, 'Choosing export must not immediately download private data');
  await app.click('export-public-csv');
  assert.equal(app.downloads.length, 1);
  const publicCsv = await app.downloads[0].blob.text();
  assert.match(publicCsv, /PUBLIC_DEADLINE_RECORD/);
  assert.doesNotMatch(publicCsv, /PRIVATE_CSV_|987654|Моя цена|Моя заметка/);

  await app.click('export-csv');
  await app.click('export-work-csv');
  assert.equal(app.downloads.length, 2);
  const workingCsv = await app.downloads[1].blob.text();
  assert.match(workingCsv, /PRIVATE_CSV_NOTE/);
  assert.match(workingCsv, /PRIVATE_CSV_TASK/);
  assert.match(workingCsv, /987654\.5/);
});

test('Incomplete letter output is blocked without losing edits, while draft RTF remains downloadable', async () => {
  const app = await boot();
  await app.view('proposals');
  await app.input('organization', 'UNSAVED_ORGANIZATION_FOR_LETTER');
  await app.input('documentMode', 'letter');
  await app.click('download-rtf');
  await app.click('download-proposal');
  assert.equal(app.downloads.length, 0, 'Incomplete letters must not be exported as finished documents');
  assert.equal(app.get('organization').value, 'UNSAVED_ORGANIZATION_FOR_LETTER');
  assert.equal((await app.beforeUnload()).prevented, true);

  await app.input('documentMode', 'draft');
  await app.click('download-rtf');
  assert.equal(app.downloads.length, 1);
  assert.ok(app.downloads[0].name.endsWith('.rtf'));
  assert.match(app.downloads[0].blob.type, /^application\/rtf/);
  assert.match(await app.downloads[0].blob.text(), /^\{\\rtf1/);
  assert.equal((await app.beforeUnload()).prevented, true, 'Downloading a draft does not claim it was saved');
});

function estimateInput(app, field) {
  const input = [...app.document.querySelectorAll('[data-estimate-line]')]
    .find(node => node.dataset.estimateField === field);
  assert.ok(input, 'Expected an estimate line field: ' + field);
  return input;
}
async function editEstimateLine(app, values) {
  for (const [field, value] of Object.entries(values)) await app.inputElement(estimateInput(app, field), value);
}
const completeEstimate = (changes = {}) => ({...C.emptyEstimate(),
  lines: [{id: 'labor-1', type: 'labor', name: 'Исследование', quantity: '2', unit: 'ч', rateRub: '1000.25'}],
  recordTitle: 'Сохранённое исследование', caseNumber: 'EST-2099', updatedAt: '2026-10-29T10:00:00Z', ...changes});

test('Imported numeric estimate fields open and close cleanly, while a real edit activates unsaved-change protection', async () => {
  const row = futureRecord('estimate-numeric-import');
  const saved = completeEstimate({
    lines: [{id: 'numeric-line', type: 'labor', name: 'Импортированная работа', quantity: 2.5, unit: 'ч', rateRub: 1000.25}],
    overheadPct: 10, reservePct: 5, markupPct: 12.5, vatPct: 0
  });
  const initial = {...W.emptyWorkspace(), estimates: {[row.id]: saved}};
  assert.equal(W.validBackup(initial), true, 'Numeric values are valid imported estimate data');
  const app = await boot(initial, {records: [row]});
  await app.click('estimate-open', row.id);
  assert.equal(estimateInput(app, 'quantity').value, '2.5');
  assert.equal(estimateInput(app, 'rateRub').value, '1000.25');
  assert.equal(app.get('estimate-markupPct').value, '12.5');
  assert.equal((await app.beforeUnload()).prevented, false, 'DOM string conversion alone must not make an imported estimate dirty');
  await app.click('estimate-close');
  assert.equal(app.get('estimate-dialog').open, false);
  assert.equal(app.confirmations.length, 0);
  assert.deepEqual(app.stored(), initial);

  await app.click('estimate-open', row.id);
  await editEstimateLine(app, {rateRub: '1000.50'});
  assert.equal((await app.beforeUnload()).prevented, true);
  await app.click('estimate-close');
  assert.equal(app.confirmations.length, 1);
  assert.equal(app.get('estimate-dialog').open, true, 'Declining discard must retain the actual edit');
  assert.equal(estimateInput(app, 'rateRub').value, '1000.50');
  assert.deepEqual(app.stored(), initial);
});

test('An incomplete estimate saves its user-entered work without inferring rates or transferring a price', async () => {
  const row = {...futureRecord('estimate-incomplete'), amountRub: 9876543, amountType: 'contract'};
  const initial = {...W.emptyWorkspace(), notes: {[row.id]: {text: 'Существующая заметка', proposalRub: 333.33}}};
  const app = await boot(initial, {records: [row]});
  await app.click('estimate-open', row.id);
  assert.equal(app.get('estimate-dialog').open, true);
  assert.equal(estimateInput(app, 'quantity').value, '');
  assert.equal(estimateInput(app, 'rateRub').value, '', 'The published budget must not become an own rate');
  await editEstimateLine(app, {name: 'НЕПОЛНАЯ_РАБОТА', unit: 'ч'});
  await app.input('estimate-notes', 'Сначала уточнить объём');
  assert.equal((await app.beforeUnload()).prevented, true);
  await app.click('estimate-save');
  assert.equal(app.stored().estimates[row.id].lines[0].name, 'НЕПОЛНАЯ_РАБОТА');
  assert.equal(app.stored().estimates[row.id].lines[0].quantity, '');
  assert.equal(app.stored().estimates[row.id].lines[0].rateRub, '');
  assert.equal(app.stored().estimates[row.id].notes, 'Сначала уточнить объём');
  assert.deepEqual(app.stored().notes, initial.notes);
  assert.equal((await app.beforeUnload()).prevented, false);
  assert.equal(app.get('estimate-content').querySelector('[data-action="estimate-apply"]').disabled, true);
  const saved = app.stored();
  await app.click('estimate-apply'); // The handler must also reject a dispatched action on an incomplete form.
  assert.deepEqual(app.stored(), saved);
  assert.match(app.get('estimate-save-state').textContent, /заполните все строки/);
});

test('Applying a complete estimate updates the own price and open detail without overwriting saved proposals or public money', async () => {
  const row = {...futureRecord('estimate-apply'), amountRub: 9876543, amountType: 'contract'};
  const initial = {...W.emptyWorkspace(), notes: {[row.id]: {text: 'Сохранённая заметка', proposalRub: 1500}},
    work: {[row.id]: 'ready'}, tasks: {[row.id]: plannedTask('Сохранённая задача')},
    checks: {[row.id]: {stage: true}}, company: {organization: 'Сохранённая организация'},
    drafts: [{id: 'ready-proposal', recordId: row.id, subject: 'Версия для получателя', price: '765432.10', documentMode: 'letter'}]};
  const app = await boot(initial, {records: [row], confirmResult: true});
  await app.click('open-detail', row.id);
  await app.click('estimate-open', row.id);
  await editEstimateLine(app, {name: 'Полная работа', quantity: '2', unit: 'ч', rateRub: '1000.25'});
  await app.input('estimate-overheadPct', '10');
  assert.equal(app.get('estimate-content').querySelector('[data-action="estimate-apply"]').disabled, false);
  assert.equal(app.stored().notes[row.id].proposalRub, 1500);
  await app.click('estimate-apply');
  assert.equal(app.confirmations.length, 1, 'Replacing an existing own price needs the explicit confirmation');
  assert.equal(app.stored().notes[row.id].proposalRub, 2200.55);
  assert.equal(Number(app.get('detail-price').value), 2200.55);
  assert.equal(app.get('detail-note').value, 'Сохранённая заметка');
  assert.deepEqual(app.stored().drafts, initial.drafts);
  assert.deepEqual(app.stored().tasks, initial.tasks);
  assert.deepEqual(app.stored().work, initial.work);
  assert.deepEqual(app.stored().checks, initial.checks);
  assert.deepEqual(app.stored().company, initial.company);
  assert.equal(app.registry.opportunities[0].amountRub, 9876543);
  assert.equal((await app.beforeUnload()).prevented, false, 'The synchronized detail value must not become a stale dirty price');
  await app.click('estimate-close');
  await app.click('save-note');
  assert.equal(app.stored().notes[row.id].proposalRub, 2200.55, 'Saving the still-open detail must not restore the old price');
  assert.deepEqual(app.stored().drafts, initial.drafts);
});

test('A failed estimate save keeps its prior dirty baseline and a successful retry clears it', async () => {
  const row = futureRecord('estimate-retry');
  const initial = {...W.emptyWorkspace(), estimates: {[row.id]: completeEstimate()}};
  const app = await boot(initial, {records: [row]});
  await app.click('estimate-open', row.id);
  await editEstimateLine(app, {rateRub: '2000.50'});
  app.storage.failWrites = true;
  await app.submit('estimate-form');
  assert.deepEqual(app.stored(), initial);
  assert.equal(app.get('estimate-dialog').open, true);
  assert.equal(estimateInput(app, 'rateRub').value, '2000.50');
  assert.match(app.get('estimate-save-state').textContent, /не сохранил данные/);
  assert.equal((await app.beforeUnload()).prevented, true);
  await editEstimateLine(app, {rateRub: '1000.25'});
  assert.equal((await app.beforeUnload()).prevented, false, 'Failed persistence must not replace the old baseline with the rejected edit');
  await editEstimateLine(app, {rateRub: '2000.50'});
  app.storage.failWrites = false;
  await app.click('estimate-save');
  assert.equal(app.stored().estimates[row.id].lines[0].rateRub, '2000.50');
  assert.equal((await app.beforeUnload()).prevented, false);
});

test('The estimate modal backup includes unsaved rates and notes while preserving the stored workspace', async () => {
  const row = futureRecord('estimate-backup');
  const initial = {...W.emptyWorkspace(), notes: {[row.id]: {text: 'Другая заметка', proposalRub: 250}},
    drafts: [{id: 'kept-draft', price: '123.45'}], tasks: {[row.id]: plannedTask('Сохранённая задача')},
    profile: {...W.emptyProfile(), regions: ['moscow']}, compareIds: [row.id]};
  const app = await boot(initial, {records: [row]});
  await app.click('estimate-open', row.id);
  await editEstimateLine(app, {name: 'НЕСОХРАНЁННАЯ_РАБОТА', quantity: '1.5', rateRub: '2345.67'});
  await app.input('estimate-notes', 'НЕСОХРАНЁННЫЕ_ДОПУЩЕНИЯ');
  const backupButton = app.get('estimate-content').querySelector('[data-action="backup"]');
  assert.ok(backupButton && !backupButton.disabled, 'Recovery must be reachable inside the estimate modal');
  await app.clickElement(backupButton);
  assert.equal(app.downloads.length, 1);
  const snapshot = JSON.parse(await app.downloads[0].blob.text());
  assert.equal(W.validBackup(snapshot), true);
  assert.equal(snapshot.estimates[row.id].lines[0].rateRub, '2345.67');
  assert.equal(snapshot.estimates[row.id].lines[0].quantity, '1.5');
  assert.equal(snapshot.estimates[row.id].notes, 'НЕСОХРАНЁННЫЕ_ДОПУЩЕНИЯ');
  assert.equal(snapshot.estimates[row.id].recordTitle, row.title);
  for (const key of ['notes', 'drafts', 'tasks', 'profile', 'compareIds']) assert.deepEqual(snapshot[key], initial[key]);
  assert.deepEqual(app.stored(), initial);
  assert.equal(app.get('estimate-dialog').open, true);
  assert.equal((await app.beforeUnload()).prevented, true);
});

test('Canceling a dirty estimate asks before discarding edits and leaves the saved estimate intact', async () => {
  const row = futureRecord('estimate-cancel');
  const initial = {...W.emptyWorkspace(), estimates: {[row.id]: completeEstimate()}};
  const options = {records: [row], confirmResult: false};
  const app = await boot(initial, options);
  await app.click('estimate-open', row.id);
  await app.input('estimate-notes', 'Не потерять без подтверждения');
  await app.get('estimate-dialog').dispatch('cancel');
  assert.equal(app.confirmations.length, 1);
  assert.equal(app.get('estimate-dialog').open, true);
  assert.equal(app.get('estimate-notes').value, 'Не потерять без подтверждения');
  assert.equal((await app.beforeUnload()).prevented, true);
  options.confirmResult = true;
  await app.click('estimate-close');
  assert.equal(app.get('estimate-dialog').open, false);
  assert.deepEqual(app.stored(), initial);
  assert.equal((await app.beforeUnload()).prevented, false);
  await app.click('estimate-open', row.id);
  assert.equal(app.get('estimate-notes').value, initial.estimates[row.id].notes);
});

test('The separate proposal estimate action changes only the current price after confirmation and keeps all other edits', async () => {
  const row = futureRecord('estimate-proposal');
  const saved = completeEstimate({lines: [{id: 'kopeck', type: 'expense', name: 'Явно введённый расход', quantity: '1', unit: 'шт.', rateRub: '0.01'}]});
  const initial = {...W.emptyWorkspace(), estimates: {[row.id]: saved}, notes: {[row.id]: {proposalRub: 500.5}},
    drafts: [{id: 'proposal-to-edit', recordId: row.id, documentKind: 'procurement', documentMode: 'draft',
      price: '500.50', days: '14', subject: 'Сохранённый предмет', organization: 'Организация', contact: 'Контакт',
      taxNote: 'Исходная налоговая формулировка', conditions: 'Исходные условия', caseNumber: 'PURCHASE-1'}]};
  const options = {records: [row], confirmResult: false};
  const app = await boot(initial, options);
  await app.view('proposals');
  await app.click('load-draft', 'proposal-to-edit');
  const edits = {subject: 'НЕСОХРАНЁННЫЙ_ПРЕДМЕТ', contact: 'НЕСОХРАНЁННЫЙ_КОНТАКТ',
    taxNote: 'НЕСОХРАНЁННАЯ_НАЛОГОВАЯ_ФОРМУЛИРОВКА', conditions: 'НЕСОХРАНЁННЫЕ_УСЛОВИЯ', days: '21'};
  for (const [id, value] of Object.entries(edits)) await app.input(id, value);
  await app.click('proposal-estimate');
  assert.equal(Number(app.get('price').value), 500.5);
  options.confirmResult = true;
  await app.click('proposal-estimate');
  assert.equal(Number(app.get('price').value), 0.01);
  assert.equal(app.get('price').checkValidity(), true, 'A positive kopeck amount must remain usable in the proposal form');
  for (const [id, value] of Object.entries(edits)) assert.equal(app.get(id).value, value);
  assert.equal(app.get('documentKind').value, 'procurement');
  assert.deepEqual(app.stored(), initial, 'Explicit transfer edits the form, not the saved proposal or own-price record');
  assert.equal((await app.beforeUnload()).prevented, true);
});

test('Deleting an orphan estimate requires confirmation and successful persistence while keeping own prices and proposals', async () => {
  const id = 'orphan-estimate-delete';
  const initial = {...W.emptyWorkspace(), estimates: {[id]: completeEstimate(), kept: completeEstimate({recordTitle: 'Другой расчёт'})},
    notes: {[id]: {text: 'Сохранённая заметка', proposalRub: 2000.5}},
    drafts: [{id: 'kept-proposal', recordId: id, price: '2000.50', subject: 'Сохранённое предложение'}],
    tasks: {[id]: plannedTask('Сохранённая задача')}};
  const options = {records: [], confirmResult: false};
  const app = await boot(initial, options);
  await app.view('workspace');
  const button = [...app.document.querySelectorAll('[data-action="estimate-delete"]')].find(node => node.dataset.id === id);
  assert.ok(button, 'An orphan estimate must remain manageable in saved estimates');
  await app.clickElement(button);
  assert.equal(app.confirmations.length, 1);
  assert.deepEqual(app.stored(), initial);
  options.confirmResult = true;
  app.storage.failWrites = true;
  await app.clickElement(button);
  assert.deepEqual(app.stored(), initial, 'A rejected deletion must retain the complete estimate');
  app.storage.failWrites = false;
  await app.clickElement(button);
  assert.deepEqual(app.stored(), {...initial, estimates: {kept: initial.estimates.kept}});
});

function profileChoice(app, field, value) {
  const input = app.document.querySelector('[data-profile-' + field + '="' + value + '"]');
  assert.ok(input, 'Expected profile choice ' + field + '=' + value);
  return input;
}

test('Failed profile save retains edits and dirty protection, valid backup recovers them, and an invalid range blocks backup', async () => {
  const initial = {...W.emptyWorkspace(), notes: {kept: {text: 'Не терять'}}, drafts: [{id: 'kept-draft', price: '123'}]};
  const app = await boot(initial, {records: [futureRecord()]});
  await app.click('profile-open');
  const region = profileChoice(app, 'region', 'moscow'); region.checked = true; await app.changeElement(region);
  await app.input('profile-include', 'кровля; фасад');
  await app.input('profile-min-budget', '100.50');
  await app.input('profile-max-budget', '500,50');
  app.storage.failWrites = true;
  await app.submit('profile-form');
  assert.equal(app.get('profile-dialog').open, true);
  assert.equal(app.get('profile-include').value, 'кровля; фасад');
  assert.equal(profileChoice(app, 'region', 'moscow').checked, true);
  assert.match(app.get('profile-save-state').textContent, /не сохранил данные/);
  assert.equal((await app.beforeUnload()).prevented, true);
  assert.deepEqual(app.stored(), initial);
  const backup = app.get('profile-content').querySelector('[data-action="backup"]');
  await app.clickElement(backup);
  assert.equal(app.downloads.length, 1);
  const snapshot = JSON.parse(await app.downloads[0].blob.text());
  assert.equal(W.validBackup(snapshot), true);
  assert.deepEqual(snapshot.profile, {...W.emptyProfile(), regions: ['moscow'], includeWords: 'кровля; фасад', minBudget: '100.50', maxBudget: '500,50'});
  assert.deepEqual(snapshot.notes, initial.notes);
  assert.deepEqual(snapshot.drafts, initial.drafts);
  await app.input('profile-min-budget', '1000');
  await app.clickElement(backup);
  assert.equal(app.downloads.length, 1, 'An unrestorable profile must not be exported as a valid recovery file');
  assert.match(app.get('profile-save-state').textContent, /Минимум не должен превышать максимум/);
  assert.deepEqual(app.stored(), initial);
});

test('Profile array ordering does not create false dirty state and canceling real edits keeps the modal open', async () => {
  const profile = {...W.emptyProfile(), regions: ['oblast', 'moscow'], categories: ['expertise', 'survey']};
  const app = await boot({...W.emptyWorkspace(), profile}, {records: [futureRecord()]});
  await app.click('profile-open');
  assert.equal((await app.beforeUnload()).prevented, false);
  await app.click('profile-close');
  assert.equal(app.confirmations.length, 0);
  assert.equal(app.get('profile-dialog').open, false);
  await app.click('profile-open');
  await app.input('profile-exclude', 'НЕСОХРАНЁННОЕ_ИСКЛЮЧЕНИЕ');
  await app.get('profile-dialog').dispatch('cancel');
  assert.equal(app.confirmations.length, 1);
  assert.equal(app.get('profile-dialog').open, true);
  assert.equal(app.get('profile-exclude').value, 'НЕСОХРАНЁННОЕ_ИСКЛЮЧЕНИЕ');
  assert.equal((await app.beforeUnload()).prevented, true);
  assert.deepEqual(app.stored().profile, profile);
});

test('Profile reset preserves the profile and active filter on storage failure, then clears both after successful persistence', async () => {
  const profile = {...W.emptyProfile(), includeWords: 'PUBLIC_DEADLINE_RECORD'};
  const app = await boot({...W.emptyWorkspace(), profile}, {records: [futureRecord()], confirmResult: true});
  app.get('fit-filter').value = 'match'; await app.changeElement(app.get('fit-filter'));
  await app.click('profile-open');
  await app.input('profile-exclude', 'НЕСОХРАНЁННОЕ_ИСКЛЮЧЕНИЕ');
  app.storage.failWrites = true;
  await app.click('profile-reset');
  assert.deepEqual(app.stored().profile, profile);
  assert.equal(app.get('profile-dialog').open, true);
  assert.equal(app.get('profile-exclude').value, 'НЕСОХРАНЁННОЕ_ИСКЛЮЧЕНИЕ');
  assert.equal(app.get('fit-filter').value, 'match');
  assert.equal(JSON.parse(app.storage.getItem(UI_KEY)).views.opportunities.fit, 'match');
  assert.equal((await app.beforeUnload()).prevented, true);
  app.storage.failWrites = false;
  await app.click('profile-reset');
  assert.deepEqual(app.stored().profile, W.emptyProfile());
  assert.equal(app.get('profile-dialog').open, false);
  assert.equal(app.get('fit-filter').value, 'all');
  assert.equal(app.get('fit-filter').disabled, true);
  assert.equal((await app.beforeUnload()).prevented, false);
  const uiPreferences = JSON.parse(app.storage.getItem(UI_KEY));
  assert.equal(uiPreferences.views.opportunities.fit, 'all');
  const reopened = await boot(app.stored(), {records: [futureRecord()], uiPreferences});
  assert.equal(reopened.get('fit-filter').value, 'all', 'Reloading must not restore the stale profile filter');
  assert.equal(reopened.get('fit-filter').disabled, true);
});

test('An orphan comparison entry consumes one of four slots and removing it preserves its private work', async () => {
  const rows = ['compare-1', 'compare-2', 'compare-3', 'compare-4'].map(futureRecord);
  const initial = {...W.emptyWorkspace(), compareIds: ['compare-1', 'compare-2', 'compare-3', 'orphan'],
    notes: {orphan: {text: 'ORPHAN_PRIVATE_NOTE', proposalRub: 1234.5}}, tasks: {orphan: plannedTask('ORPHAN_PRIVATE_TASK')}};
  const app = await boot(initial, {records: rows});
  await app.click('toggle-compare', 'compare-4');
  assert.deepEqual(app.stored().compareIds, initial.compareIds);
  assert.match(app.get('toast').textContent, /до четырёх записей/);
  await app.view('compare');
  assert.match(app.get('main').innerHTML, /Запись вне текущего реестра/);
  assert.match(app.get('main').innerHTML, /ORPHAN_PRIVATE_TASK/);
  await app.click('remove-compare', 'orphan');
  assert.deepEqual(app.stored().compareIds, ['compare-1', 'compare-2', 'compare-3']);
  assert.deepEqual(app.stored().notes, initial.notes);
  assert.deepEqual(app.stored().tasks, initial.tasks);
  await app.view('opportunities');
  await app.click('toggle-compare', 'compare-4');
  assert.deepEqual(app.stored().compareIds, rows.map(row => row.id));
});

test('Toggling comparison in an open detail updates its button without replacing typed notes, prices or tasks', async () => {
  const row = futureRecord('compare-detail');
  const initial = {...W.emptyWorkspace(), notes: {[row.id]: {text: 'Сохранённая заметка', proposalRub: 500}},
    tasks: {[row.id]: plannedTask('Сохранённая задача')}};
  const app = await boot(initial, {records: [row]});
  await app.click('open-detail', row.id);
  await app.input('detail-note', 'UNSAVED_COMPARE_NOTE');
  await app.input('detail-task', 'UNSAVED_COMPARE_TASK');
  await app.input('detail-price', '765.43');
  const button = app.get('detail-content').querySelector('[data-action="toggle-compare"]');
  assert.ok(button);
  assert.equal(button.attrs['aria-pressed'], 'false');
  await app.clickElement(button);
  assert.equal(app.get('detail-dialog').open, true);
  assert.equal(button.attrs['aria-pressed'], 'true');
  assert.deepEqual(app.stored().compareIds, [row.id]);
  assert.equal(app.get('detail-note').value, 'UNSAVED_COMPARE_NOTE');
  assert.equal(app.get('detail-task').value, 'UNSAVED_COMPARE_TASK');
  assert.equal(app.get('detail-price').value, '765.43');
  assert.deepEqual(app.stored().notes, initial.notes);
  assert.deepEqual(app.stored().tasks, initial.tasks);
  assert.equal((await app.beforeUnload()).prevented, true);
  await app.clickElement(button);
  assert.equal(button.attrs['aria-pressed'], 'false');
  assert.deepEqual(app.stored().compareIds, []);
  assert.equal(app.get('detail-note').value, 'UNSAVED_COMPARE_NOTE');
  assert.equal(app.get('detail-task').value, 'UNSAVED_COMPARE_TASK');
});

test('Registry applies exact phrases and exclusions without exposing matched personal notes', async()=>{
  const a={...futureRecord('search-a'),title:'Обследование несущих конструкций'},b={...futureRecord('search-b'),title:'Обследование несущих конструкций фасада'};
  const app=await boot({...W.emptyWorkspace(),notes:{'search-a':{text:'PRIVATE_TAG'}}},{records:[a,b]});
  await app.input('search-input','"несущих конструкций" -фасада PRIVATE_TAG');
  await app.changeElement(app.get('source-type-filter'));
  assert.match(app.get('lead-results').innerHTML,/data-open-id="search-a"/);
  assert.doesNotMatch(app.get('lead-results').innerHTML,/data-open-id="search-b"|PRIVATE_TAG/);
  assert.match(app.get('lead-results').innerHTML,/<mark class="search-match">несущих конструкций<\/mark>/);
});

test('An inverted budget range produces an actionable error and accessible invalid states',async()=>{
  const app=await boot();await app.input('amount-min','900');await app.input('amount-max','100');
  await app.changeElement(app.get('source-type-filter'));
  assert.match(app.get('lead-results').innerHTML,/больше суммы/);
  assert.equal(app.get('amount-min').attrs['aria-invalid'],'true');
  await app.click('focus-budget');assert.equal(app.document.activeElement.id,'amount-min');
  await app.input('amount-max','1000,25');await app.changeElement(app.get('source-type-filter'));
  assert.equal(app.get('amount-min').attrs['aria-invalid'],'false');
});

test('Pagination shows 25 rows at a time while CSV and select-all cover the complete filtered registry',async()=>{
  const rows=Array.from({length:53},(_,i)=>({...futureRecord('page-'+String(i).padStart(2,'0')),caseNumber:'CASE-'+i}));
  const app=await boot(W.emptyWorkspace(),{records:rows});
  assert.equal((app.get('main').innerHTML.match(/data-open-id=/g)||[]).length,25);
  await app.click('registry-next');assert.match(app.get('lead-results').innerHTML,/Показаны 26–50 из 53/);
  await app.click('registry-next');assert.equal((app.get('lead-results').innerHTML.match(/data-open-id=/g)||[]).length,3);
  await app.click('wb-select-all');assert.match(app.get('main').innerHTML,/Выбрано: 53/);
  await app.click('export-public-csv');const text=await app.downloads.at(-1).blob.text();
  for(const row of rows)assert.ok(text.includes(row.id));
});

test('Saved filters can be renamed and duplicated without changing conditions, and failure preserves the editor',async()=>{
  const base={...W.emptyWorkspace(),savedFilters:[{id:'one',name:'Первый',filters:{search:'обследование'}}]};
  const app=await boot(base);await app.click('manage-filters');await app.click('rename-filter','one');
  app.get('filter-edit-name').value='Новое имя';app.storage.failWrites=true;await app.submit('edit-filter-form');
  assert.equal(app.stored().savedFilters[0].name,'Первый');assert.equal(app.get('filter-edit-name').value,'Новое имя');
  app.storage.failWrites=false;await app.submit('edit-filter-form');
  assert.equal(app.stored().savedFilters[0].name,'Новое имя');assert.deepEqual(app.stored().savedFilters[0].filters,base.savedFilters[0].filters);
  await app.click('duplicate-filter','one');await app.submit('edit-filter-form');
  assert.equal(app.stored().savedFilters.length,2);assert.notEqual(app.stored().savedFilters[1].id,'one');
  assert.deepEqual(app.stored().savedFilters[1].filters,base.savedFilters[0].filters);
});

test('Updating saved filter conditions is explicit and its result counts reflect current matching records',async()=>{
  const rows=[{...futureRecord('filter-a'),title:'Обмеры'},{...futureRecord('filter-b'),title:'Проектирование'}];
  const base={...W.emptyWorkspace(),savedFilters:[{id:'one',name:'Отбор',filters:{search:'Обмеры'}}]};
  const app=await boot(base,{records:rows,confirmResult:true});await app.input('search-input','Проектирование');
  await app.changeElement(app.get('source-type-filter'));await app.click('manage-filters');
  assert.match(app.get('filters-content').innerHTML,/1 записей/);await app.click('update-filter','one');
  assert.equal(app.stored().savedFilters[0].filters.search,'Проектирование');
  assert.ok(app.confirmations.some(text=>text.includes('Заменить условия')));
});

test('Next-card navigation protects dirty changes and uses the existing filtered order after saving',async()=>{
  const app=await boot(W.emptyWorkspace(),{records:[futureRecord('nav-a'),futureRecord('nav-b')]});
  await app.click('open-detail','nav-a');await app.input('detail-note','Keep this');await app.click('detail-next');
  assert.equal(app.get('detail-note').value,'Keep this');assert.match(app.location.hash,/nav-a/);
  await app.click('save-note');await app.click('detail-next');assert.match(app.location.hash,/nav-b/);
  assert.equal(app.stored().notes['nav-a'].text,'Keep this');assert.equal(app.get('detail-note').value,'');
});

test('Checklist progress reflects unsaved checkbox changes without changing public status or storage',async()=>{
  const row=futureRecord('check-a'),app=await boot(W.emptyWorkspace(),{records:[row]});await app.click('open-detail',row.id);
  const box=app.get('detail-content').querySelector('[data-check="stage"]');box.checked=true;await app.changeElement(box);
  assert.match(app.get('detail-check-progress').innerHTML,/Мои отметки: 1 из 6/);
  assert.deepEqual(app.stored().checks,{});assert.equal(app.registry.opportunities[0].status,row.status);
  assert.equal((await app.beforeUnload()).prevented,true);
});

test('Backups refuse an invalid open price and a successful copy records its creation time separately from work data',async()=>{
  const row=futureRecord('backup-price'),app=await boot(W.emptyWorkspace(),{records:[row]});await app.click('open-detail',row.id);
  await app.input('detail-price','-2');await app.click('backup');assert.equal(app.downloads.length,0);
  assert.match(app.get('toast').textContent,/исправьте собственную цену/);
  await app.input('detail-price','2.50');await app.click('backup');assert.equal(app.downloads.length,1);
  assert.equal(app.stored().notes[row.id],undefined);
  assert.ok(Number.isFinite(Date.parse(JSON.parse(app.storage.getItem(UI_KEY)).lastBackupAt)));
  const backup=JSON.parse(await app.downloads[0].blob.text());assert.equal(backup.notes[row.id].proposalRub,2.5);
});

test('Bulk stage actions require confirmation, preserve data on failed writes and support safe undo',async()=>{
  const rows=[futureRecord('bulk-a'),futureRecord('bulk-b')];
  const denied=await boot(W.emptyWorkspace(),{records:rows});await denied.click('wb-select-all');await denied.click('wb-apply-stage');assert.deepEqual(denied.stored().work,{});
  const app=await boot(W.emptyWorkspace(),{records:rows,confirmResult:true});await app.click('wb-select-all');
  app.storage.failWrites=true;await app.click('wb-apply-stage');assert.deepEqual(app.stored().work,{});
  app.storage.failWrites=false;await app.click('wb-apply-stage');assert.deepEqual(app.stored().work,{'bulk-a':'review','bulk-b':'review'});
  await app.click('wb-undo');assert.deepEqual(app.stored().work,{});
  await app.click('wb-apply-stage');await app.click('favorite','bulk-a');await app.click('wb-undo');
  assert.equal(app.stored().work['bulk-a'],'review');assert.deepEqual(app.stored().favorites,['bulk-a']);
  assert.match(app.get('toast').textContent,/уже изменились/);
});

test('Selected CSV exports only selected records and includes private values only after explicit private choice',async()=>{
  const rows=[futureRecord('selected-a'),futureRecord('selected-b')];
  const app=await boot({...W.emptyWorkspace(),notes:{'selected-a':{text:'PRIVATE_SELECTED',proposalRub:321}}},{records:rows});
  const checkbox=app.document.querySelector('[data-wb-select="selected-a"]');checkbox.checked=true;await app.changeElement(checkbox);
  await app.click('wb-export-public');let text=await app.downloads.at(-1).blob.text();
  assert.ok(text.includes('selected-a'));assert.ok(!text.includes('selected-b'));assert.ok(!text.includes('PRIVATE_SELECTED'));
  await app.click('wb-export-private');text=await app.downloads.at(-1).blob.text();assert.ok(text.includes('PRIVATE_SELECTED'));assert.ok(!text.includes('selected-b'));
});

test('Workspace retains note-only orphan records, includes them in stage editing and does not invent public facts',async()=>{
  const app=await boot({...W.emptyWorkspace(),notes:{orphan:{text:'ORPHAN_NOTE',proposalRub:123}}},{records:[]});await app.view('workspace');
  assert.match(app.get('main').innerHTML,/ORPHAN_NOTE/);assert.match(app.get('main').innerHTML,/Текущий публичный статус неизвестен/);
  const field=app.document.querySelector('[data-wb-stage="orphan"]');field.value='hold';await app.changeElement(field);
  assert.equal(app.stored().work.orphan,'hold');assert.equal(app.stored().notes.orphan.text,'ORPHAN_NOTE');
});

test('Quick personal dates change only the editor until explicitly saved',async()=>{
  const row=futureRecord('date-a'),app=await boot(W.emptyWorkspace(),{records:[row]});await app.click('open-detail',row.id);
  const shortcut=app.document.querySelectorAll('[data-action="wb-date-shortcut"]').find(node=>node.dataset.target==='detail'&&node.dataset.offset==='1');
  await app.clickElement(shortcut);assert.match(app.get('detail-followup').value,/^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(app.stored().tasks,{});assert.equal((await app.beforeUnload()).prevented,true);
  await app.click('save-note');assert.equal(app.stored().tasks[row.id].dueDate,app.get('detail-followup').value);
});

test('Visible quick-search and settings controls work through root routing and cannot replace an open editor',async()=>{
  const row=futureRecord('palette-a'),app=await boot(W.emptyWorkspace(),{records:[row]});
  await app.click('experience-palette');assert.equal(app.get('experience-palette-dialog').open,true);
  await app.click('experience-close');await app.click('open-detail',row.id);await app.input('detail-note','UNSAVED_PALETTE');
  await app.click('experience-palette');assert.equal(app.get('experience-palette-dialog').open,false);
  assert.equal(app.get('detail-note').value,'UNSAVED_PALETTE');assert.match(app.document.title,/TEST-2099/);
});

test('Native numeric badInput with empty value cannot clear a stored price via save or backup',async()=>{
  const row=futureRecord('native-price'),initial={...W.emptyWorkspace(),notes:{'native-price':{text:'Keep',proposalRub:125000}}};
  const app=await boot(initial,{records:[row]});await app.click('open-detail',row.id);
  const input=app.get('detail-price');input.value='';input.checkValidity=()=>false;
  await app.click('backup');await app.click('save-note');assert.equal(app.downloads.length,0);
  assert.equal(app.stored().notes[row.id].proposalRub,125000);assert.equal(app.get('detail-dialog').open,true);
});

test('Invalid budget filters cannot be saved, and next-card focus lands on the new title',async()=>{
  const app=await boot(W.emptyWorkspace(),{records:[futureRecord('focus-a'),futureRecord('focus-b')]});
  await app.input('amount-min','100');await app.input('amount-max','1');await app.click('save-filter');
  assert.equal(app.get('filters-dialog').open,false);assert.deepEqual(app.stored().savedFilters,[]);
  await app.click('reset-filters');await app.click('open-detail','focus-a');await app.click('detail-next');
  assert.equal(app.document.activeElement.id,'detail-title');assert.match(app.location.hash,/focus-b/);
});

test('Import preview changes with replacement mode and pre-import backup does not apply the incoming file',async()=>{
  const initial={...W.emptyWorkspace(),notes:{old:{text:'CURRENT_NOTE'}}},incoming={...W.emptyWorkspace(),favorites:['new']};
  const app=await boot(initial),payload=JSON.stringify(incoming),input=app.get('backup-input');
  input.files=[{size:Buffer.byteLength(payload),text:async()=>payload}];await input.dispatch('change');
  assert.match(app.get('import-preview').innerHTML,/Предварительный результат/);
  assert.match(app.get('import-preview').innerHTML,/объединение, текущие значения/);
  app.get('import-replace').checked=true;await app.changeElement(app.get('import-replace'));
  assert.match(app.get('import-preview').innerHTML,/полная замена/);
  await app.click('backup-before-import');assert.match(app.downloads[0].name,/before-restore/);
  const copied=JSON.parse(await app.downloads[0].blob.text());assert.equal(copied.notes.old.text,'CURRENT_NOTE');
  assert.deepEqual(copied.favorites,[]);assert.deepEqual(app.stored(),initial);
  assert.equal(app.get('confirm-dialog').open,true);await app.click('cancel-import');assert.deepEqual(app.stored(),initial);
});
test('Escape closes the active modal without also hiding its mobile-menu focus origin',async()=>{
  const app=await boot();await app.get('mobile-menu').dispatch('click');
  assert.equal(app.get('sidebar').classList.contains('open'),true);
  await app.click('experience-help');assert.equal(app.get('experience-help-dialog').open,true);
  await app.keydown({key:'Escape',target:app.get('experience-help-dialog')});
  assert.equal(app.get('sidebar').classList.contains('open'),true);
  await app.get('experience-help-dialog').dispatch('cancel');assert.equal(app.get('experience-help-dialog').open,false);
  await app.keydown({key:'Escape',target:app.get('mobile-menu')});assert.equal(app.get('sidebar').classList.contains('open'),false);
});
