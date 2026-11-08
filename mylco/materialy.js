'use strict';

const skuCards = Array.from(document.querySelectorAll('.sku'));
const catalog = new Map(skuCards.map(card => [card.dataset.sku, {
  card, name:card.dataset.name, grams:Number(card.dataset.grams),
  price:Number(card.dataset.price), group:card.dataset.family,
  url:card.querySelector('.buy-sku').href
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
const invalidQuantities = new Map();

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
  syncCatalogUrl();
  presentCatalog();
}));
queryField.addEventListener('input', () => {
  if (catalogLinked) { catalogLinked = false; syncCatalogUrl(); }
  presentCatalog();
});
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
  const isOffer = byId('quote-type').value === 'offer';
  const method = byId('quote-method').value;
  const city = byId('quote-city').value.trim();
  const company = byId('quote-company').value.trim();
  const deadline = byId('quote-deadline').value.trim();
  const requirements = [
    method === 'pickup' ? 'Получение: самовывоз в Москве.' : '',
    method === 'delivery' ? 'Получение: доставка' + (city ? ' в город ' + city : '') + '.' : '',
    company ? 'Организация: ' + company : '',
    deadline ? 'Желаемый срок: ' + deadline : ''
  ].filter(Boolean);
  const body = [isOffer ? 'Здравствуйте! Прошу подготовить коммерческое предложение и подтвердить наличие.' : 'Здравствуйте! Прошу подтвердить наличие и выставить счёт.', '', ...lines,
    '', 'Общая масса материалов: ' + mass(grams) + '.', 'Ориентир по каталогу: ' + fmt(price) + ' ₽ без доставки.', ...requirements].join('\n');
  return {price, grams, count, body, isOffer, requirements};
}
const targetMass = byId('target-mass');
const planGoal = byId('plan-goal'), planPieces = byId('plan-pieces');
if (currentUrl.searchParams.get('goal') === 'surplus') planGoal.value = 'surplus';
const incomingPieces = Number(currentUrl.searchParams.get('pieces'));
if (Number.isInteger(incomingPieces) && incomingPieces >= 1 && incomingPieces <= 1000000) planPieces.value = String(incomingPieces);
if (!currentUrl.searchParams.has('pieces') && currentUrl.searchParams.get('basis') === 'unset') planPieces.value = '';
let removedItem = null;
function clearUndo() {
  removedItem = null;
  byId('undo-order').hidden = true;
}
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
  byId('pack-calculator').open = currentUrl.hash !== '#sku-grid';
  if (activeGroup !== 'all' && recipes.get(linkedRecipe)[0].group !== activeGroup) {
    catalogLinked = false;
    queryField.value = '';
    syncCatalogUrl();
  }
} else if (recipes.has(currentUrl.searchParams.get('plan'))) {
  recipeSelect.value = currentUrl.searchParams.get('plan');
}
function syncCatalogUrl() {
  const url = new URL(location.href);
  if (activeGroup === 'all') url.searchParams.delete('group');
  else url.searchParams.set('group', activeGroup);
  if (catalogLinked) {
    url.searchParams.set('material', recipeSelect.value);
    url.searchParams.delete('plan');
  } else {
    url.searchParams.delete('material');
    url.searchParams.set('plan', recipeSelect.value);
  }
  history.replaceState(null, '', url);
}
function requestedGrams() {
  const raw = targetMass.value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return 0;
  // Round upwards to whole grams so a displayed combination always covers the request.
  const grams = Math.ceil(Number((Number(raw) * 1000).toPrecision(14)));
  return Number.isSafeInteger(grams) && grams > 0 ? grams : 0;
}
const versionField = byId('plan-version');
if ([...versionField.options].some(opt => opt.value === currentUrl.searchParams.get('version'))) versionField.value = currentUrl.searchParams.get('version');
versionField.addEventListener('change', renderPlan);
function currentPlan() {
  const items = recipes.get(recipeSelect.value) || [], desired = requestedGrams(), goal = planGoal.value;
  if (recipeSelect.value !== 'caspol-one') return leastCostPacks(items,desired,1000000,goal);
  // The two packs have different working times. Quote one formulation for the entire run.
  const plans = items.filter(item => !versionField.value || item.id === versionField.value)
    .map(item => leastCostPacks([item],desired,1000000,goal)).filter(Boolean);
  plans.sort((a,b) => goal === 'surplus' ? a.grams-b.grams || a.cost-b.cost : a.cost-b.cost || a.grams-b.grams);
  return plans[0] || null;
}
function renderPlan() {
  byId('plan-share-status').replaceChildren();
  const desired = requestedGrams();
  const options = recipes.get(recipeSelect.value);
  const plan = currentPlan();
  const caspol = recipeSelect.value === 'caspol-one';
  byId('version-field').hidden = !caspol;
  const measureParams = new URLSearchParams({material:recipeSelect.value});
  if (caspol && versionField.value) measureParams.set('version', versionField.value);
  if (planPieces.value && planPieces.validity.valid) measureParams.set('pieces',planPieces.value);
  byId('plan-measure').href = './?' + measureParams + '#rashod';
  const output = byId('plan-result');
  output.hidden = !plan;
  byId('plan-hint').textContent = plan || !targetMass.value.trim() ? '' :
    desired ? 'Такой объём превышает лимит списка. Уточните условия оптовой закупки у мастерской.' :
    'Введите положительную массу, например 6,03.';
  if (!plan) return;
  byId('plan-price').textContent = fmt(plan.cost) + ' ₽';
  byId('plan-combination').textContent = plan.lines.map(([item, qty]) => mass(item.grams) + ' × ' + fmt(qty) + ' уп.').join(' + ');
  if (caspol) {
    const version = [...versionField.options].find(opt => opt.value === plan.lines[0][0].id);
    byId('plan-combination').textContent += ' · ' + version.textContent.split(' · ')[0];
  }
  byId('plan-weight').textContent = mass(plan.grams) + (plan.grams === desired ? ' · точно по расчёту' : ' · остаток ' + mass(plan.grams - desired));
  const pieces = planPieces.valueAsNumber;
  byId('batch-budget').textContent = Number.isInteger(pieces) && pieces >= 1 && pieces <= 1000000
    ? 'Закупка в пересчёте на одно изделие — ' + fmt(Math.round(plan.cost / pieces * 100) / 100) + ' ₽ при тираже ' + fmt(pieces) + ' шт. Учтены целые упаковки, включая остаток. Доставка и работа оплачиваются отдельно.'
    : 'Введите целый тираж от 1 до 1 000 000 шт. для расчёта на одну отливку.';
  const singleCosts = options.filter(item => Math.ceil(desired / item.grams) <= 1000000)
    .map(item => Math.ceil(desired / item.grams) * item.price);
  const saving = singleCosts.length ? Math.min(...singleCosts) - plan.cost : 0;
  byId('plan-saving').textContent = saving > 0 ? 'На ' + fmt(saving) + ' ₽ дешевле самого выгодного варианта из упаковок одного размера.' : '';
  const desiredCounts = new Map(plan.lines.map(([item, qty]) => [item.id, qty]));
  const applied = options.every(item => !invalidQuantities.has(item.id) && (order.get(item.id) || 0) === (desiredCounts.get(item.id) || 0));
  const alreadyInOrder = options.some(item => order.has(item.id));
  const button = byId('apply-plan');
  button.disabled = applied;
  button.textContent = applied ? 'Набор уже в списке' : alreadyInOrder ? 'Обновить фасовки ' + options[0].name + ' в списке' : 'Добавить набор в список';
}
byId('apply-plan').addEventListener('click', () => {
  const plan = currentPlan();
  if (!plan) return;
  if (removedItem && recipes.get(recipeSelect.value).some(item => item.id === removedItem.id)) clearUndo();
  for (const item of recipes.get(recipeSelect.value)) { order.delete(item.id); invalidQuantities.delete(item.id); }
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
  syncCatalogUrl();
  renderPlan();
});
byId('share-plan').addEventListener('click', () => {
  if (!currentPlan()) return;
  const url = new URL(location.href);
  url.search = new URLSearchParams({material:recipeSelect.value, grams:String(requestedGrams()), goal:planGoal.value});
  if (planPieces.validity.valid && planPieces.value) url.searchParams.set('pieces',planPieces.value);
  if (recipeSelect.value === 'caspol-one' && versionField.value) url.searchParams.set('version',versionField.value);
  if (!planPieces.value) url.searchParams.set('basis','unset');
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
  const valid = invalidQuantities.size === 0;
  byId('order-cost').textContent = valid ? fmt(stats.price) + ' ₽' : '—';
  byId('order-weight').textContent = valid ? mass(stats.grams) : '—';
  byId('mobile-sum').textContent = valid ? fmt(stats.price) + ' ₽' : 'Проверить';
  byId('qty-status').textContent = valid ? '' : 'Проверьте количество упаковок, чтобы подготовить запрос.';
  showMobileOrder();
  renderPlan();
  const mail = byId('order-mail');
  mail.firstChild.textContent = stats.isOffer ? 'Запросить КП ' : 'Запросить счёт ';
  if (valid) {
    mail.href = emailDraft(stats.isOffer ? 'Запрос КП на материалы МылКо' : 'Запрос счёта на материалы МылКо', stats.body);
    mail.removeAttribute('aria-disabled');
  } else {
    mail.removeAttribute('href');
    mail.setAttribute('aria-disabled', 'true');
  }
  for (const id of ['copy-order','download-order','share-order','csv-order','print-order']) byId(id).disabled = !valid;
  skuCards.forEach(card => {
    const count = order.get(card.dataset.sku) || 0;
    card.classList.toggle('in-order', count > 0);
    const button = card.querySelector('.add-sku');
    const item = catalog.get(card.dataset.sku), packs = requiredPacks(item);
    const plan = card.querySelector('.pack-plan');
    plan.hidden = !targetMass.value.trim();
    plan.textContent = packs ? 'На заданную массу: ' + packs + ' уп. · ' + fmt(packs * item.price) + ' ₽' : 'Введите положительную массу в килограммах.';
    button.disabled = invalidQuantities.has(item.id) || !packs || count + packs > 1000000;
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
    const subtotal = document.createElement('span');
    subtotal.className = 'row-subtotal';
    subtotal.textContent = invalidQuantities.has(id) ? '—' : fmt(item.price * qty) + ' ₽';
    const line = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = 'Упаковок ';
    const field = document.createElement('input');
    field.type = 'number'; field.min = '1'; field.max = '1000000'; field.step = '1';
    field.required = true;
    field.value = invalidQuantities.has(id) ? invalidQuantities.get(id) : qty;
    field.inputMode = 'numeric';
    const error = document.createElement('p');
    error.className = 'qty-error';
    error.id = 'qty-error-' + id;
    error.textContent = 'Введите целое число упаковок от 1 до 1 000 000.';
    error.hidden = !invalidQuantities.has(id);
    field.setAttribute('aria-describedby', error.id);
    field.setAttribute('aria-invalid', String(!error.hidden));
    field.setAttribute('aria-label','Количество '+title.textContent);
    field.addEventListener('input', () => {
      const number = field.valueAsNumber;
      const valid = Number.isInteger(number) && number >= 1 && number <= 1000000;
      field.setAttribute('aria-invalid', String(!valid));
      error.hidden = valid;
      subtotal.textContent = valid ? fmt(item.price * number) + ' ₽' : '—';
      if (valid) {
        invalidQuantities.delete(id);
        order.set(id, number);
        persist();
      } else {
        invalidQuantities.set(id, field.value);
      }
      byId('basket-status').replaceChildren();
      updateTotals();
    });
    label.append(field);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Убрать';
    remove.setAttribute('aria-label', 'Убрать '+title.textContent);
    remove.addEventListener('click', () => {
      const rowIndex = Array.from(order.keys()).indexOf(id);
      removedItem = {id, qty:order.get(id), index:rowIndex};
      byId('undo-order').hidden = false;
      invalidQuantities.delete(id);
      order.delete(id); persist(); renderOrder();
      byId('basket-status').textContent = item.name + ' удалён из списка.';
      const buttons = container.querySelectorAll('button');
      const next = buttons[Math.min(rowIndex, buttons.length - 1)] || byId('undo-order');
      next.focus();
    });
    line.append(label, remove); row.append(title,subtotal,line,error); container.append(row);
  }
  updateTotals();
}
skuCards.forEach(card => card.querySelector('.add-sku').addEventListener('click', () => {
  const id = card.dataset.sku;
  const count = order.get(id) || 0;
  const packs = requiredPacks(catalog.get(id));
  if (!packs || count + packs > 1000000) return;
  if (removedItem?.id === id) clearUndo();
  order.set(id, count + packs); persist(); renderOrder();
  byId('basket-status').textContent = 'Добавлено: ' + catalog.get(id).name + ', ' + mass(catalog.get(id).grams) + '.';
  record('sku_added', id);
}));
byId('copy-order').addEventListener('click', () => copyText(orderStats().body, byId('basket-status'), 'Список скопирован. Адрес для заказов — order@mylco.ru.'));
byId('share-order').addEventListener('click', () => copyText(shareUrl().href, byId('basket-status'), 'Ссылка на выбранные позиции и количества скопирована.'));
byId('download-order').addEventListener('click', () => downloadText('Mylco-zakupka.txt', orderStats().body));
byId('order-mail').addEventListener('click', () => record('order_email_open', 'materials'));

for (const id of ['quote-type','quote-method','quote-city','quote-company','quote-deadline']) {
  byId(id).addEventListener('input', () => {
    const method = byId('quote-method').value;
    byId('quote-city-field').hidden = method !== 'delivery';
    byId('pickup-note').hidden = method !== 'pickup';
    byId('basket-status').replaceChildren();
    updateTotals();
  });
}
function restore(encoded) {
  clearUndo();
  invalidQuantities.clear();
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
planGoal.addEventListener('change', renderPlan);
planPieces.addEventListener('input', renderPlan);
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

byId('undo-order').addEventListener('click', () => {
  if (!removedItem || order.has(removedItem.id)) return;
  const {id,qty,index} = removedItem;
  const entries = Array.from(order);
  entries.splice(Math.min(index,entries.length),0,[id,qty]);
  order.clear();
  entries.forEach(([key,value]) => order.set(key,value));
  clearUndo();
  persist();
  renderOrder();
  byId('basket-status').textContent = catalog.get(id).name + ' возвращён в список.';
  document.querySelectorAll('#order-items input')[Array.from(order.keys()).indexOf(id)]?.focus();
});
const tableHead = ['Материал','Масса упаковки, г','Цена упаковки, ₽','Количество, уп.','Сумма, ₽'];
function purchaseRows() {
  return Array.from(order, ([id, qty]) => {
    const item = catalog.get(id);
    return [item.name,item.grams,item.price,qty,item.price*qty];
  });
}
byId('csv-order').addEventListener('click', () => {
  if (!order.size || invalidQuantities.size) return;
  const rows = [tableHead,...purchaseRows(),['Итого','','',orderStats().count,orderStats().price]];
  const csv = rows.map(row => row.map(value => '"' + String(value).replace(/"/g,'""') + '"').join(';')).join('\r\n');
  downloadText('Mylco-zakupka.csv',csv,'text/csv;charset=utf-8');
});
function printSpec() {
  if (!order.size || invalidQuantities.size) return;
  const sheet = byId('print-sheet'), stats = orderStats();
  const element = (tag,value) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  const table = document.createElement('table');
  const tr = table.createTHead().insertRow();
  tableHead.forEach(value => tr.append(element('th',value)));
  const tbody = table.createTBody();
  for (const data of purchaseRows()) {
    const row = tbody.insertRow();
    data.forEach(value => row.append(element('td',value)));
  }
  sheet.replaceChildren(element('h1','МылКо · Спецификация материалов'),element('p',new Date().toLocaleDateString('ru-RU') + ' · ' + (stats.isOffer ? 'Запрос КП' : 'Запрос счёта')),table,
    element('p','Итого: ' + fmt(stats.count) + ' уп., ' + mass(stats.grams) + ', ' + fmt(stats.price) + ' ₽ без доставки.'),
    ...stats.requirements.map(line => element('p',line)),element('p','Ориентир по каталогу. Наличие и стоимость подтвердит мастерская. Заказы: order@mylco.ru.'));
  sheet.hidden = false;
  document.body.classList.add('printing-spec');
  window.print();
}
byId('print-order').addEventListener('click', printSpec);
window.addEventListener('afterprint', () => { document.body.classList.remove('printing-spec'); byId('print-sheet').hidden = true; });
