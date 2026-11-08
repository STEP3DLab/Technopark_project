'use strict';

const shop = 'https://mylco.ru/';
const topics = {
  form: {
    title: 'Силикон для формы', image: 'material-selection', alt: 'Силикон, эластичная форма и отливка',
    description: 'Для подбора состава важны материал образца, глубина рельефа и число отливок. По фотографии мастер подскажет, с чего начать.',
    url: 'kupit-silikon-v-moskve', brief: 'material', request: 'Хочу снять форму с образца.'
  },
  cast: {
    title: 'Жидкий пластик для деталей', image: 'category-plastic', alt: 'Примеры цветных отливок из каталога',
    description: 'Для корпусов, макетов и малых серий сравните литьевые пластики. Укажите толщину стенок, тираж и нагрузку на деталь.',
    url: 'zhidkiy-plastik', brief: 'material', request: 'Хочу отлить жёсткую деталь.'
  },
  clear: {
    title: 'Смола для прозрачной заливки', image: 'category-epoxy', alt: 'Декоративная прозрачная отливка',
    description: 'Начните с геометрии изделия. Назовите толщину слоя, общий объём и желаемую прозрачность — по ним проще выбрать состав.',
    url: 'epoksidnaya-smola', brief: 'material', request: 'Хочу подобрать смолу для прозрачной заливки.'
  },
  vacuum: {
    title: 'Вакуумная камера с насосом', image: 'rental-kit', alt: 'Вакуумная камера и насос в комплекте',
    description: 'Для разовой работы посмотрите прокат. Для регулярных заливок укажите объём смеси и габариты ёмкости — подберём оборудование.',
    url: 'vakuumnye-kamery', brief: 'custom', request: 'Нужна камера для дегазации смеси.'
  }
};
let selectedTask = 'form';
const taskButtons = Array.from(document.querySelectorAll('[data-task]'));
taskButtons.forEach(button => button.addEventListener('click', () => {
  selectedTask = button.dataset.task;
  const topic = topics[selectedTask];
  taskButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  byId('pick-title').textContent = topic.title;
  byId('pick-description').textContent = topic.description;
  byId('pick-img').src = imageSource(topic.image);
  byId('pick-img').alt = topic.alt;
  byId('pick-category').href = shop + topic.url;
  byId('pick-help').dataset.brief = topic.brief;
  const compare = byId('pick-compare');
  const goals = {form:'gypsum', cast:'part'};
  compare.href = selectedTask === 'vacuum' ? 'kamery.html' : selectedTask === 'clear' ? shop + topic.url : 'podbor.html?task=' + goals[selectedTask] + '#guide-tasks';
  compare.textContent = selectedTask === 'vacuum' ? 'Сравнить камеры' : selectedTask === 'clear' ? 'Смолы для заливки' : 'Сравнить составы';
  compare.hidden = selectedTask === 'clear';
  record('task_selected', selectedTask);
}));

function imageSource(key) {
  return window.mylcoEmbeddedImages?.[key] || 'assets/' + key + '.webp';
}

const volume = byId('volume'), density = byId('density'), reserve = byId('reserve');
function decimal(input) {
  const value = input.value.trim().replace(',', '.');
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : NaN;
}
const number = value => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 3}).format(value);
const recipeField = byId('calc-material');
const volumeMode = byId('volume-mode');
const piecesField = byId('batch-pieces'), castsField = byId('end-pieces');
const targetNoun = {mold:'форму', coat:'покрываемое изделие', cast:'отливку'};
let calculation = '', onePour = 0;
function calculate() {
  const profile = recipeField.selectedOptions[0], kind = profile.dataset.kind || 'cast';
  const weighed = volumeMode.value === 'mass';
  const ml = decimal(volume), rho = decimal(density), extra = decimal(reserve);
  const pieces = piecesField.valueAsNumber;
  const baseMass = weighed ? decimal(byId('unit-mass')) : ml * rho;
  const unitGrams = baseMass * (1 + extra / 100);
  const grams = unitGrams * pieces;
  const castsEntered = kind === 'mold' && (castsField.value !== '' || castsField.validity.badInput);
  const valid = baseMass > 0 && extra >= 0 && extra <= 100 && Number.isInteger(pieces) && pieces >= 1 && pieces <= 1000000 &&
    (!castsEntered || castsField.validity.valid) && grams > 0 && Number.isSafeInteger(Math.ceil(grams));
  calculation = '';
  onePour = valid ? unitGrams : 0;
  byId('use-unit-mass').hidden = !valid;
  byId('calc-ask').hidden = !valid;
  byId('calc-packs').hidden = !valid;
  if (!valid) {
    const missing = weighed ? !byId('unit-mass').value : !volume.value || !density.value;
    byId('estimate').textContent = missing ? (weighed ? 'Введите массу одной заливки до добавления запаса.' : 'Для расчёта нужны объём и плотность смеси.') :
      'Проверьте исходные значения. Запас — от 0 до 100%, количество — целое число от 1 до 1 000 000.';
    return;
  }
  const packs = new URLSearchParams({grams:String(Math.ceil(Number(grams.toPrecision(14))))});
  if (recipeField.value) packs.set('material', recipeField.value);
  if (recipeField.value === 'caspol-one' && ['caspol-one-s','caspol-one-l'].includes(calcParams.get('version'))) packs.set('version',calcParams.get('version'));
  if (kind !== 'mold' || castsEntered) packs.set('pieces',String(castsEntered ? castsField.valueAsNumber : pieces));
  if (kind === 'mold' && !castsEntered) packs.set('basis','unset');
  byId('calc-packs').href = 'materialy.html?' + packs + '#pack-calculator';
  const weight = grams >= 1000 ? number(grams / 1000) + ' кг' : number(grams) + ' г';
  const basis = weighed ? number(baseMass) + ' г без запаса' : number(ml) + ' мл, плотность ' + number(rho) + ' г/см³';
  let geometry = '';
  if (volumeMode.value === 'coating') geometry = 'Площадь ' + number(decimal(byId('coat-area'))) + ' м², суммарная толщина ' + number(decimal(byId('coat-depth'))) + ' мм.';
  if (volumeMode.value === 'box' || volumeMode.value === 'cylinder') {
    const sides = volumeMode.value === 'box' ? [byId('geo-a'),byId('geo-b'),byId('geo-h')] : [byId('geo-a'),byId('geo-h')];
    geometry = (sides.length === 2 ? 'Цилиндр Ø ' : 'Прямоугольная заливка ') + sides.map(field => number(decimal(field))).join(' × ') + ' мм.';
    const displaced = decimal(byId('displaced'));
    if (displaced > 0) geometry += ' Объём вложенной модели ' + number(displaced) + ' мл.';
  }
  const version = recipeField.value === 'caspol-one' ? new Map([['caspol-one-s','2–3 мин, 2 кг'],['caspol-one-l','4 мин, 6 кг']]).get(calcParams.get('version')) : '';
  const series = (kind === 'mold' ? 'Форм к изготовлению' : kind === 'coat' ? 'Изделий для покрытия' : 'Отливок') + ' — ' + number(pieces) + '.';
  calculation = [recipeField.value ? 'Материал — ' + profile.textContent + '.' : '', 'Расход на одну ' + (kind === 'coat' ? 'операцию покрытия' : kind === 'mold' ? 'форму' : 'отливку') + ' — ' + basis + '. Запас ' + number(extra) + '%.',
    version ? 'Версия Caspol ONE — ' + version + '.' : '', geometry, series, castsEntered ? 'Плановый тираж отливок — ' + number(castsField.valueAsNumber) + '.' : '', 'Всего около ' + weight + ' смеси.'].filter(Boolean).join(' ');
  byId('estimate').textContent = 'Всего ' + weight + ' смеси с запасом. На ' + targetNoun[kind] + ' — ' + number(unitGrams) + ' г.';
}
[volume, density, reserve, piecesField, castsField, byId('unit-mass')].forEach(field => field.addEventListener('input', calculate));

document.querySelectorAll('[data-brief]').forEach(link => link.addEventListener('click', () => {
  const message = link.id === 'pick-help' ? topics[selectedTask].request : link.id === 'calc-ask' ? calculation : '';
  chooseService(link.dataset.brief);
  if (message) setRequestContext(message);
  record('brief_started', link.dataset.brief);
}));

document.querySelector('.catalog-search').addEventListener('submit', event => {
  const field = byId('catalog-query');
  field.value = field.value.trim();
  if (!field.value) {
    event.preventDefault();
    field.reportValidity();
    return;
  }
  record('catalog_search', 'shop');
});


let manualVolume = '';
function geometryVolume() {
  const mode = volumeMode.value;
  const solid = mode === 'box' || mode === 'cylinder';
  byId('geo-fields').hidden = !solid;
  byId('coat-fields').hidden = mode !== 'coating';
  byId('volume-field').hidden = mode === 'mass';
  byId('density-field').hidden = mode === 'mass';
  byId('mass-field').hidden = mode !== 'mass';
  volume.readOnly = mode !== 'known';
  let hint = '';
  if (solid) {
    const isBox = mode === 'box';
    byId('geo-a-label').textContent = isBox ? 'Длина, мм' : 'Диаметр, мм';
    byId('geo-b-label').hidden = !isBox;
    const a = decimal(byId('geo-a')), b = decimal(byId('geo-b')), h = decimal(byId('geo-h'));
    const displaced = byId('displaced');
    const model = displaced.value.trim() ? decimal(displaced) : 0;
    const measured = (isBox ? a * b : Math.PI * a * a / 4) * h / 1000;
    const net = measured - model;
    const valid = a > 0 && h > 0 && (!isBox || b > 0) && model >= 0 && Number.isFinite(net) && net > 0;
    volume.value = valid ? String(Number(net.toPrecision(12))) : '';
    if (!valid && Number.isFinite(measured) && model >= measured) hint = 'Объём мастер-модели должен быть меньше объёма заливки.';
  } else if (mode === 'coating') {
    const ml = decimal(byId('coat-area')) * decimal(byId('coat-depth')) * 1000;
    volume.value = Number.isFinite(ml) && ml > 0 ? String(Number(ml.toPrecision(12))) : '';
  } else if (mode === 'known') volume.value = manualVolume;
  calculate();
  if (hint) byId('estimate').textContent = hint;
}
volume.addEventListener('input', () => { if (!volume.readOnly) manualVolume = volume.value; });
volumeMode.addEventListener('change', geometryVolume);
byId('geo-fields').addEventListener('input', geometryVolume);
byId('coat-fields').addEventListener('input', geometryVolume);

let lastKind = '', moldQuantity = '1';
function applyRecipe() {
  const opt = recipeField.selectedOptions[0], data = opt.dataset;
  const kind = data.kind || 'cast', mold = kind === 'mold';
  if (lastKind && lastKind !== kind) {
    if (lastKind === 'mold') {
      moldQuantity = piecesField.value;
      piecesField.value = castsField.value || '1';
    } else if (mold) {
      castsField.value = piecesField.value === '1' ? '' : piecesField.value;
      piecesField.value = moldQuantity;
    }
  }
  lastKind = kind;
  byId('batch-label').textContent = mold ? 'Изготавливаемых форм, шт.' : data.kind === 'coat' ? 'Изделий для покрытия, шт.' : 'Количество отливок, шт.';
  byId('end-pieces-field').hidden = !mold;
  byId('mold-note').hidden = !mold;
  density.value = data.density || '';
  const note = byId('profile-note');
  note.hidden = !opt.value;
  const source = byId('profile-source');
  if (opt.value) {
    const densityNote = data.density ? 'Для оценки расхода взята плотность ' + number(Number(data.density)) + ' г/см³.' : 'Если известна масса одной заливки, плотность вводить не нужно.';
    note.querySelector('span').textContent = 'A и B по массе — ' + data.a + ' к ' + data.b + '. ' + densityNote;
    source.href = data.source;
  } else source.removeAttribute('href');
  byId('mix-a').value = data.a || '';
  byId('mix-b').value = data.b || '';
  byId('mix-a').readOnly = byId('mix-b').readOnly = Boolean(opt.value);
  byId('mix-mass').value = '';
  splitMix();
  geometryVolume();
}
recipeField.addEventListener('change', applyRecipe);
const calcParams = new URL(location.href).searchParams;
const initialRecipe = [...recipeField.options].find(opt => opt.value && opt.value === calcParams.get('material'));
if (initialRecipe) {
  recipeField.value = initialRecipe.value;
  if (initialRecipe.dataset.kind === 'coat') volumeMode.value = 'coating';
  const initialCount = Number(calcParams.get('pieces'));
  if (Number.isInteger(initialCount) && initialCount > 0 && initialCount <= 1000000) {
    (initialRecipe.dataset.kind === 'mold' ? castsField : piecesField).value = String(initialCount);
  }
}
applyRecipe();
byId('use-unit-mass').addEventListener('click', () => {
  if (!onePour) return;
  byId('mix-mass').value = String(Number(onePour.toPrecision(12)));
  splitMix();
});
function splitMix() {
  const [weight, a, b] = ['mix-mass','mix-a','mix-b'].map(id => byId(id).valueAsNumber);
  const massA = weight * (a / (a + b));
  byId('mix-result').textContent = [weight,a,b].every(n => Number.isFinite(n) && n > 0) && Number.isFinite(a + b)
    ? 'Компонент A — ' + number(massA) + ' г. Компонент B — ' + number(weight - massA) + ' г.'
    : 'Укажите массу и обе части пропорции.';
}
for (const id of ['mix-mass','mix-a','mix-b']) byId(id).addEventListener('input', splitMix);

function openCalculator() { if (location.hash === '#rashod') byId('rashod').open = true; }
openCalculator();
window.addEventListener('hashchange', openCalculator);
