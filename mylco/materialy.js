'use strict';

const skuCards = Array.from(document.querySelectorAll('.sku'));
const catalog = new Map(skuCards.map(card => [card.dataset.sku, {
  card, name:card.dataset.name, grams:Number(card.dataset.grams),
  price:Number(card.dataset.price), group:card.dataset.family,
  url:card.querySelector('.source-link').href
}]));
const groupButtons = Array.from(document.querySelectorAll('[data-family][aria-pressed]'));
const uiNumber = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:3});
const fmt = number => uiNumber.format(number);
const mass = grams => grams >= 1000 ? fmt(grams / 1000) + ' кг' : fmt(grams) + ' г';
const currentUrl = new URL(location.href);
const storageKey = 'mylco.quote.v1';
const sharedList = currentUrl.searchParams.has('list');
let activeGroup = currentUrl.searchParams.get('group');
if (!groupButtons.some(button => button.dataset.family === activeGroup)) activeGroup = 'all';
const queryField = byId('sku-search');
const sorting = byId('sku-sort');
const order = new Map();

function readList(encoded) {
  const list = new Map();
  for (const entry of (encoded || '').split(',')) {
    const [id, units] = entry.split(':');
    const qty = Number(units);
    if (catalog.has(id) && Number.isSafeInteger(qty) && qty > 0 && qty <= 1000000) list.set(id, qty);
  }
  return list;
}
function serialize() {
  return Array.from(order, ([id, qty]) => id + ':' + qty).join(',');
}
function shareUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('list', serialize());
  url.hash = 'order';
  return url;
}
function persist() {
  if (sharedList) history.replaceState(null, '', shareUrl());
  else {
    try { localStorage.setItem(storageKey, serialize()); } catch { /* List remains available in this tab. */ }
  }
}
function presentCatalog() {
  const query = queryField.value.trim().toLocaleLowerCase('ru');
  const filtered = skuCards.filter(card => {
    const sku = catalog.get(card.dataset.sku);
    const haystack = [sku.name, sku.card.querySelector('.pack-label').textContent, sku.grams, sku.card.querySelector('.sku-use').textContent].join(' ').toLocaleLowerCase('ru');
    return (activeGroup === 'all' || activeGroup === sku.group) && haystack.includes(query);
  });
  const score = card => {
    const sku = catalog.get(card.dataset.sku);
    if (sorting.value === 'pack') return sku.price;
    if (sorting.value === 'unit') return sku.price / sku.grams;
    return sku.grams;
  };
  if (sorting.value !== 'original') filtered.sort((a,b) => score(a) - score(b));
  const shown = new Set(filtered);
  skuCards.forEach(card => { card.hidden = !shown.has(card); });
  filtered.forEach(card => byId('sku-grid').append(card));
  groupButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.family === activeGroup)));
  byId('sku-count').textContent = 'Найдено позиций: ' + filtered.length;
  byId('no-skus').hidden = filtered.length > 0;
  const searchUrl = new URL('https://mylco.ru/index.php');
  searchUrl.search = new URLSearchParams({route:'product/search',search:queryField.value.trim()});
  byId('shop-search').href = query ? searchUrl.href : 'https://mylco.ru/';
}
groupButtons.forEach(button => button.addEventListener('click', () => {
  activeGroup = button.dataset.family;
  if (catalogLinked && activeGroup !== 'all' && recipes.get(recipeSelect.value)[0].group !== activeGroup) {
    catalogLinked = false;
    queryField.value = '';
  }
  const url = new URL(location.href);
  if (activeGroup === 'all') url.searchParams.delete('group');
  else url.searchParams.set('group', activeGroup);
  history.replaceState(null, '', url);
  presentCatalog();
}));
queryField.addEventListener('input', () => { catalogLinked = false; presentCatalog(); });
sorting.addEventListener('change', presentCatalog);
byId('reset-skus').addEventListener('click', () => {
  catalogLinked = false;
  queryField.value = '';
  sorting.value = 'original';
  groupButtons[0].click();
  queryField.focus();
});

function orderStats() {
  let price = 0, grams = 0, count = 0;
  const lines = [];
  for (const [id, qty] of order) {
    const item = catalog.get(id);
    price += item.price * qty;
    grams += item.grams * qty;
    count += qty;
    lines.push(item.name + ' · ' + mass(item.grams) + ' × ' + qty + ' уп. — ' + fmt(item.price * qty) + ' ₽');
  }
  const body = ['Здравствуйте! Прошу подтвердить наличие и выставить счёт.', '', ...lines,
    '', 'Общая масса материалов: ' + mass(grams) + '.', 'Ориентир по каталогу: ' + fmt(price) + ' ₽ без доставки.'].join('\n');
  return {price, grams, count, body};
}
const targetMass = byId('target-mass');
const recipeSelect = byId('plan-material');
const recipes = new Map();
for (const [id, item] of catalog) {
  item.id = id;
  const recipe = item.card.dataset.recipe;
  if (!recipes.has(recipe)) recipes.set(recipe, []);
  recipes.get(recipe).push(item);
}
for (const [id, items] of recipes) recipeSelect.add(new Option(items[0].name, id));
const linkedRecipe = currentUrl.searchParams.get('material');
let catalogLinked = recipes.has(linkedRecipe);
if (catalogLinked) {
  recipeSelect.value = linkedRecipe;
  queryField.value = recipes.get(linkedRecipe)[0].name;
  byId('pack-calculator').open = true;
}
function requestedGrams() {
  const raw = targetMass.value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return 0;
  // Round upwards to whole grams so a displayed combination always covers the request.
  const grams = Math.ceil(Number((Number(raw) * 1000).toPrecision(14)));
  return Number.isSafeInteger(grams) && grams > 0 ? grams : 0;
}
function currentPlan() {
  return leastCostPacks(recipes.get(recipeSelect.value) || [], requestedGrams());
}
function renderPlan() {
  byId('plan-share-status').replaceChildren();
  const desired = requestedGrams();
  const options = recipes.get(recipeSelect.value);
  const plan = currentPlan();
  const output = byId('plan-result');
  output.hidden = !plan;
  byId('plan-hint').textContent = plan || !targetMass.value.trim() ? '' :
    desired ? 'Такой объём превышает лимит списка. Уточните условия оптовой закупки у мастерской.' :
    'Введите положительную массу, например 6,03.';
  if (!plan) return;
  byId('plan-price').textContent = fmt(plan.cost) + ' ₽';
  byId('plan-combination').textContent = plan.lines.map(([item, qty]) => mass(item.grams) + ' × ' + fmt(qty) + ' уп.').join(' + ');
  byId('plan-weight').textContent = mass(plan.grams) + (plan.grams === desired ? ' · точно по расчёту' : ' · остаток ' + mass(plan.grams - desired));
  const singleCosts = options.filter(item => Math.ceil(desired / item.grams) <= 1000000)
    .map(item => Math.ceil(desired / item.grams) * item.price);
  const saving = singleCosts.length ? Math.min(...singleCosts) - plan.cost : 0;
  byId('plan-saving').textContent = saving > 0 ? 'На ' + fmt(saving) + ' ₽ дешевле самого выгодного варианта из упаковок одного размера.' : '';
  const desiredCounts = new Map(plan.lines.map(([item, qty]) => [item.id, qty]));
  const applied = options.every(item => (order.get(item.id) || 0) === (desiredCounts.get(item.id) || 0));
  const alreadyInOrder = options.some(item => order.has(item.id));
  const button = byId('apply-plan');
  button.disabled = applied;
  button.textContent = applied ? 'Набор уже в списке' : alreadyInOrder ? 'Обновить фасовки ' + options[0].name + ' в списке' : 'Добавить набор в список';
}
byId('apply-plan').addEventListener('click', () => {
  const plan = currentPlan();
  if (!plan) return;
  for (const item of recipes.get(recipeSelect.value)) order.delete(item.id);
  for (const [item, qty] of plan.lines) order.set(item.id, qty);
  persist();
  renderOrder();
  byId('basket-status').textContent = 'Список обновлён. ' + recipes.get(recipeSelect.value)[0].name + ' — ' + mass(plan.grams) + '.';
  record('pack_plan_added', recipeSelect.value);
});
recipeSelect.addEventListener('change', () => {
  if (catalogLinked) {
    queryField.value = recipes.get(recipeSelect.value)[0].name;
    activeGroup = 'all';
    presentCatalog();
  }
  renderPlan();
});
byId('share-plan').addEventListener('click', () => {
  if (!currentPlan()) return;
  const url = new URL(location.href);
  url.search = new URLSearchParams({material:recipeSelect.value, grams:String(requestedGrams())});
  url.hash = 'pack-calculator';
  copyText(url.href, byId('plan-share-status'), 'Ссылка на расчёт скопирована.');
});
function requiredPacks(item) {
  if (!targetMass.value.trim()) return 1;
  const n = Math.ceil(requestedGrams() / item.grams);
  return n > 0 && n <= 1000000 ? n : 0;
}
let basketVisible = false;
function showMobileOrder() {
  byId('mobile-order').hidden = basketVisible || order.size === 0;
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    basketVisible = entries[0].isIntersecting;
    showMobileOrder();
  }).observe(byId('order'));
}
function updateTotals() {
  const stats = orderStats();
  document.querySelectorAll('[data-basket-count]').forEach(el => { el.textContent = fmt(stats.count); });
  byId('empty-basket').hidden = order.size > 0;
  byId('order-summary').hidden = order.size === 0;
  byId('order-cost').textContent = fmt(stats.price) + ' ₽';
  byId('order-weight').textContent = mass(stats.grams);
  byId('mobile-sum').textContent = fmt(stats.price) + ' ₽';
  showMobileOrder();
  renderPlan();
  byId('order-mail').href = emailDraft('Запрос счёта на материалы МылКо', stats.body);
  skuCards.forEach(card => {
    const count = order.get(card.dataset.sku) || 0;
    card.classList.toggle('in-order', count > 0);
    const button = card.querySelector('.add-sku');
    const item = catalog.get(card.dataset.sku), packs = requiredPacks(item);
    const plan = card.querySelector('.pack-plan');
    plan.hidden = !targetMass.value.trim();
    plan.textContent = packs ? 'На заданную массу: ' + packs + ' уп. · ' + fmt(packs * item.price) + ' ₽' : 'Введите положительную массу в килограммах.';
    button.disabled = !packs || count + packs > 1000000;
    button.firstChild.textContent = !plan.hidden && packs ? 'Добавить ' + packs + ' уп. ' : count ? 'Ещё одну · ' + count + ' ' : 'В список ';
    button.setAttribute('aria-label','Добавить ' + item.name + ', ' + mass(item.grams) + ', упаковок: ' + packs);
  });
}
function renderOrder() {
  const container = byId('order-items');
  container.replaceChildren();
  for (const [id, qty] of order) {
    const item = catalog.get(id);
    const row = document.createElement('div');
    row.className = 'order-row';
    const title = document.createElement('strong');
    title.textContent = item.name + ' · ' + mass(item.grams);
    const line = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = 'Упаковок ';
    const field = document.createElement('input');
    field.type = 'number'; field.min = '1'; field.max = '1000000'; field.step = '1';
    field.value = qty; field.inputMode = 'numeric';
    field.setAttribute('aria-label','Количество '+title.textContent);
    field.addEventListener('input', () => {
      const number = field.valueAsNumber;
      if (Number.isInteger(number) && number >= 1 && number <= 1000000) {
        order.set(id, number);
        byId('basket-status').replaceChildren();
        updateTotals(); persist();
      }
    });
    field.addEventListener('change', () => { field.value = order.get(id); });
    label.append(field);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Убрать';
    remove.setAttribute('aria-label', 'Убрать '+title.textContent);
    remove.addEventListener('click', () => {
      order.delete(id); persist(); renderOrder();
      byId('basket-status').textContent = item.name + ' удалён из списка.';
      const next = container.querySelector('button') || item.card.querySelector('.add-sku');
      if (next?.offsetParent) next.focus({preventScroll:true});
    });
    line.append(label, remove); row.append(title,line); container.append(row);
  }
  updateTotals();
}
skuCards.forEach(card => card.querySelector('.add-sku').addEventListener('click', () => {
  const id = card.dataset.sku;
  const count = order.get(id) || 0;
  const packs = requiredPacks(catalog.get(id));
  if (!packs || count + packs > 1000000) return;
  order.set(id, count + packs); persist(); renderOrder();
  byId('basket-status').textContent = 'Добавлено: ' + catalog.get(id).name + ', ' + mass(catalog.get(id).grams) + '.';
  record('sku_added', id);
}));
byId('copy-order').addEventListener('click', () => copyText(orderStats().body, byId('basket-status'), 'Список скопирован. Адрес для заказов — order@mylco.ru.'));
byId('share-order').addEventListener('click', () => copyText(shareUrl().href, byId('basket-status'), 'Ссылка на выбранные позиции и количества скопирована.'));
byId('download-order').addEventListener('click', () => downloadText('Mylco-zakupka.txt', orderStats().body));
byId('order-mail').addEventListener('click', () => record('order_email_open', 'materials'));

function restore(encoded) {
  order.clear();
  readList(encoded).forEach((qty, id) => order.set(id, qty));
  renderOrder();
}
const gramsFromCalculator = Number(currentUrl.searchParams.get('grams'));
if (gramsFromCalculator > 0 && Number.isSafeInteger(gramsFromCalculator)) {
  targetMass.value = String(gramsFromCalculator / 1000).replace('.', ',');
  byId('pack-calculator').open = true;
}
targetMass.addEventListener('input', updateTotals);
if (sharedList) restore(currentUrl.searchParams.get('list'));
else {
  let stored = '';
  try { stored = localStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
  restore(stored);
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { byId('basket-status').replaceChildren(); restore(event.newValue); }
  });
}
presentCatalog();
