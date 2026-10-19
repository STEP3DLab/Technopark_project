const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
class Element {
  constructor() {
    this.listeners = {}; this.attributes = {}; this.hidden = true; this.dataset = {}; this.children = {}; this.classes = new Set(); this.value = ''; this.validationMessage = '';
    this.classList = { add: c => this.classes.add(c), toggle: (c, on) => on ? this.classes.add(c) : this.classes.delete(c), contains: c => this.classes.has(c) };
  }
  addEventListener(n, fn) { (this.listeners[n] ??= []).push(fn); }
  emit(n, e = {}) { return Promise.all((this.listeners[n] || []).map(f => f(e))); }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  querySelector(s) { return this.children[s] || null; }
  querySelectorAll() { return []; }
  contains(node) { return Object.values(this.children).includes(node); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  setCustomValidity(message) { this.validationMessage = message; }
  scrollIntoView() { this.scrolled = true; }
}
async function main() {
  const selectors = {}; const e = s => selectors[s] ??= new Element();
  ['.menu-button', '#primary-navigation', '.gallery-dialog', '#brief-form', '#brief-result', '#brief-status', '#brief-preview', '#email-link', '#copy-brief', '#download-brief', '.lab-mobile-cta', '#request', '#filter-count', '#brief-fields', '#brief-offline', '.hero-actions', '.lab-footer'].forEach(e);
  const menu = e('.menu-button'); menu.setAttribute('aria-expanded', 'false');
  const nav = e('#primary-navigation'), navLink = new Element(); nav.querySelectorAll = () => [navLink]; nav.children.link = navLink;
  const filters = ['Все', 'Скульптуры', 'Награды'].map(s => Object.assign(new Element(), { dataset: { filter: s } }));
  const cards = ['Награды', 'Скульптуры', 'Награды'].map(s => Object.assign(new Element(), { dataset: { category: s } }));
  const gallery = new Element(); gallery.dataset = { image: '../photo.webp', caption: 'Готовая деталь' }; gallery.children.img = { alt: 'Деталь' };
  const dialog = e('.gallery-dialog'); let modalOpens = 0;
  dialog.children = { img: {}, p: {}, '.gallery-close': new Element() };
  dialog.showModal = () => { dialog.open = true; modalOpens++; }; dialog.close = () => { dialog.open = false; dialog.emit('close'); };
  dialog.getBoundingClientRect = () => ({ left: 10, top: 10, right: 200, bottom: 200 });
  const form = e('#brief-form'); const data = { name: 'Инженер <тест>', email: 'engineer@example.org', topic: 'Студенческий проект / практика', deadline: 'Ноябрь', details: 'Нужен корпус с посадкой 20 мм & проверкой сборки.' };
  form.elements = {};
  for (const [key, value] of Object.entries(data)) form.elements[key] = Object.assign(new Element(), { value });
  form.elements.topic.options = [{ value: 'Другое' }, { value: data.topic }];
  form.reportValidity = () => !Object.values(form.elements).some(el => el.validationMessage);
  const topicLink = new Element(); topicLink.href = 'https://example.org/lab/?topic=' + encodeURIComponent('Другое') + '#request';
  const doc = new Element(); doc.documentElement = new Element();
  doc.querySelector = s => selectors[s] || null;
  doc.querySelectorAll = s => s === '[data-filter]' ? filters : s === '[data-category]' ? cards : s === '.gallery-open' ? [gallery] : s === 'a[href*="topic="]' ? [topicLink] : [];
  let downloads = 0; doc.createElement = () => ({ click() { downloads++; } });
  const clipboard = {}, observers = [];
  const location = new URL('https://example.org/lab/?topic=' + encodeURIComponent(data.topic) + '&category=' + encodeURIComponent('Скульптуры'));
  const win = new Element(); win.matchMedia = () => ({ matches: false, addEventListener() {} }); win.IntersectionObserver = true;
  class TestURL extends URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} }
  const sandbox = { document: doc, location, URLSearchParams, FormData: class { get(k) { return form.elements[k].value; } }, navigator: { clipboard: { async writeText(t) { clipboard.text = t; } } }, window: win, URL: TestURL, Blob, setTimeout: fn => fn(), history: { replaceState(_, __, u) { location.href = u.href; } }, IntersectionObserver: class { constructor(cb) { this.callback = cb; observers.push(this); } observe() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/lab.js'), 'utf8'), sandbox);
  assert(doc.documentElement.classList.contains('js')); assert.equal(e('#brief-fields').disabled, false); assert(e('#brief-offline').hidden);
  assert.equal(cards.filter(c => !c.hidden).length, 1); assert.equal(filters[1].getAttribute('aria-pressed'), 'true');
  await menu.emit('click'); assert.equal(menu.getAttribute('aria-expanded'), 'true'); assert(nav.classList.contains('open')); assert(e('.lab-mobile-cta').classList.contains('is-hidden'));
  await navLink.emit('click'); assert.equal(menu.getAttribute('aria-expanded'), 'false');
  await menu.emit('click'); await doc.emit('keydown', { key: 'Escape' }); assert.equal(menu.getAttribute('aria-expanded'), 'false'); assert(menu.focused);
  await menu.emit('click'); await nav.emit('focusout', { relatedTarget: new Element() }); assert.equal(menu.getAttribute('aria-expanded'), 'false');
  await filters[2].emit('click'); assert.equal(cards.filter(c => !c.hidden).length, 2); assert.equal(e('#filter-count').textContent, 'Показано: 2 из 3'); assert.equal(location.searchParams.get('category'), 'Награды');
  await filters[0].emit('click'); assert(cards.every(c => !c.hidden)); assert(!location.searchParams.has('category'));
  await gallery.emit('click'); assert(dialog.open); await gallery.emit('click'); assert.equal(modalOpens, 1); assert.equal(dialog.children.img.src, '../photo.webp'); assert.equal(dialog.children.img.alt, 'Деталь');
  await dialog.children['.gallery-close'].emit('click'); assert(!dialog.open); assert(gallery.focused);
  await gallery.emit('click'); await dialog.emit('click', { target: dialog, clientX: 0, clientY: 0 }); assert(!dialog.open);
  let prevented = false; await form.emit('submit', { preventDefault() { prevented = true; } }); assert(prevented); assert(!e('#brief-result').hidden); assert(e('#brief-result').focused);
  const href = e('#email-link').href; assert(href.startsWith('mailto:ganshinvk@rgsu.net?')); const params = new URLSearchParams(href.split('?')[1]); assert(params.get('body').includes(data.details)); assert(params.get('body').includes(data.name)); assert.equal(params.get('subject'), 'Лаборатория РГСУ — ' + data.topic); assert(e('#brief-status').textContent.includes('ещё не отправлено'));
  await e('#copy-brief').emit('click'); assert.equal(clipboard.text, params.get('body'));
  sandbox.navigator.clipboard.writeText = async () => { throw Error('denied'); }; await e('#copy-brief').emit('click'); assert(e('#brief-preview').selected);
  await e('#download-brief').emit('click'); assert.equal(downloads, 1);
  await form.emit('input'); assert(e('#brief-result').hidden);
  form.elements.name.value = '   '; form.elements.details.value = '               ';
  await form.emit('submit', { preventDefault() {} }); assert(e('#brief-result').hidden); assert(form.elements.name.validationMessage); assert(form.elements.details.validationMessage);
  form.elements.name.value = data.name; form.elements.details.value = data.details; await form.emit('input');
  let selected = false; await topicLink.emit('click', { preventDefault() { selected = true; } }); assert(selected); assert.equal(form.elements.topic.value, 'Другое'); assert.equal(form.elements.details.value, data.details); assert.equal(form.elements.name.value, data.name); assert(e('#request').scrolled); assert(form.elements.topic.focused); assert.equal(location.hash, '#request');
  let intercepted = false; await topicLink.emit('click', { ctrlKey: true, preventDefault() { intercepted = true; } }); assert(!intercepted);
  observers[0].callback([{ target: e('#request'), isIntersecting: true }]); assert(e('.lab-mobile-cta').classList.contains('is-hidden'));
  observers[0].callback([{ target: e('#request'), isIntersecting: false }]); assert(!e('.lab-mobile-cta').classList.contains('is-hidden'));
  await form.emit('submit', { preventDefault() {} }); assert(!e('#brief-result').hidden); await form.emit('change'); assert(e('#brief-result').hidden);
  console.log('Passed: menu open/close/Escape/focus exit, URL filters and counts, repeat gallery and backdrop close/focus return, safe form enablement, encoded email, truthful status, copy and fallback, download, trimmed validation, draft invalidation, preserved inputs on topic change, modifier-click and hidden mobile CTA.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
