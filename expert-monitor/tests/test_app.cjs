'use strict';
// Event-level regression tests of the unmodified app bundle. This small DOM stub
// models form values, dialogs and downloads; visual/browser behavior is tested separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = require('../workspace-utils.js');

const APP_DIR = path.resolve(__dirname, '..');
const STORE_KEY = 'msk-expert-monitor-workspace-v1';
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
  const storage = {
    failWrites: false,
    getItem(key) {return data.has(key) ? data.get(key) : null;},
    setItem(key, value) {if (key === STORE_KEY && this.failWrites) throw new Error('QuotaExceededError'); data.set(key, String(value));},
    removeItem(key) {data.delete(key);}
  };
  function matches(node, selector) {
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
    querySelector: selector => selector.startsWith('#') ? elements.get(selector.slice(1)) || null : document.querySelectorAll(selector)[0] || null,
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
  for (const filename of ['monitor-utils.js', 'workspace-utils.js', 'export-utils.js', 'proposal-utils.js', 'app.js'])
    vm.runInContext(fs.readFileSync(path.join(APP_DIR, filename), 'utf8'), context, {filename});
  for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve));
  async function dispatchDocument(name, event) {
    for (const fn of documentListeners.get(name) || []) await fn({preventDefault() {}, ...event});
  }
  async function click(action, id) {
    await dispatchDocument('click', {target: new Node('button', {'data-action': action, ...(id ? {'data-id': id} : {})})});
  }
  return {document, storage, downloads, confirmations, location, registry, click,
    clickElement: target => dispatchDocument('click', {target}),
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
