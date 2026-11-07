'use strict';

const shop = 'https://mylco.ru/';
const email = 'order@mylco.ru';
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
const serviceInfo = {
  material: { placeholder:'Что хотите отлить, какого размера образец и сколько копий нужно?', label:'Размеры и тираж', example:'Например, 12 × 8 см, 20 шт.', hint:'Если есть фото образца, приложите его к готовому письму.' },
  rental: { placeholder:'Что будете дегазировать? Каковы размеры рабочей ёмкости?', label:'Даты аренды', example:'Например, с 12 по 14 ноября', hint:'В письме можно указать удобное время получения камеры.' },
  custom: { placeholder:'Опишите материал, рабочую ёмкость и как часто планируете пользоваться камерой.', label:'Объём или внутренние размеры', example:'Например, 30 л или Ø 300 × 400 мм', hint:'Чертёж или фото ёмкости можно приложить к письму.' },
  model: { placeholder:'Что нужно сделать по файлу, образцу или эскизу?', label:'Размеры и количество', example:'Например, 160 × 80 × 40 мм, 2 модели', hint:'К готовому письму можно приложить эскиз или ссылку на 3D-файл.' },
  b2b: { placeholder:'Перечислите нужные позиции и количества. На кого подготовить предложение?', label:'Город и желаемый срок', example:'Например, Москва, до 25 ноября', hint:'Спецификацию и реквизиты можно приложить к письму.' },
  weld: { placeholder:'Что нужно сварить? Укажите материал и размеры заготовки.', label:'Размеры и срок', example:'Например, рама 60 × 40 см, к концу месяца', hint:'Фото или чертёж удобно приложить к готовому письму.' }
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
let calculation = '';
function calculate() {
  const ml = decimal(volume), rho = decimal(density), extra = decimal(reserve);
  const pieces = byId('batch-pieces').valueAsNumber;
  const grams = ml * rho * (1 + extra / 100) * pieces;
  const valid = ml > 0 && rho > 0 && extra >= 0 && extra <= 100 && Number.isInteger(pieces) && pieces > 0 && pieces <= 1000000 && Number.isSafeInteger(Math.ceil(grams));
  calculation = '';
  byId('calc-ask').hidden = !valid;
  byId('calc-packs').hidden = !valid;
  if (!valid) {
    byId('estimate').textContent = (!volume.value || !density.value) ? 'Введите объём и плотность для расчёта массы смеси.' : 'Проверьте объём, плотность, запас (0–100%) и тираж (от 1 до 1 000 000 шт.).';
    return;
  }
  const packs = new URLSearchParams({grams:String(Math.ceil(Number(grams.toPrecision(14)))), pieces:String(pieces)});
  byId('calc-packs').href = 'materialy.html?' + packs + '#pack-calculator';
  const weight = grams >= 1000 ? number(grams / 1000) + ' кг' : number(grams) + ' г';
  calculation = 'Оценка расхода: ' + number(ml) + ' мл, плотность ' + number(rho) + ' г/см³, запас ' + number(extra) + '%. Тираж ' + number(pieces) + ' шт. Всего около ' + weight + ' смеси.';
  byId('estimate').textContent = 'На ' + number(pieces) + ' шт. понадобится около ' + weight + ' смеси с запасом. На отливку — ' + number(grams / pieces) + ' г.';
}
[volume, density, reserve, byId('batch-pieces')].forEach(field => field.addEventListener('input', calculate));

const service = byId('service'), detail = byId('extra'), project = byId('project');
const serviceDrafts = new Map();
let currentService = service.value;
let contextLine = '';
const modelSource = byId('model-source');
const modelHints = {
  sample: 'Для оценки приложите к письму фото с линейкой. Отметьте утраченные элементы и размеры, которые важно сохранить.',
  file: 'Укажите формат файла, габариты, тираж и назначение детали. Файл или ссылку можно приложить к письму.',
  drawing: 'Укажите габариты и количество. К готовому письму приложите эскиз или чертёж с основными размерами.'
};
function showModelTip() {
  byId('model-tip').textContent = modelHints[modelSource.value];
}
modelSource.addEventListener('change', showModelTip);
showModelTip();
function chooseService(key) {
  serviceDrafts.set(currentService, {description:project.value, extra:detail.value, context:contextLine});
  const previous = serviceDrafts.get(key);
  currentService = key;
  service.value = key;
  byId('model-fields').hidden = key !== 'model';
  byId('model-fields').disabled = key !== 'model';
  const info = serviceInfo[key];
  byId('extra-label').textContent = info.label + ' · необязательно';
  detail.placeholder = info.example;
  detail.value = previous?.extra || '';
  project.value = previous?.description || '';
  project.placeholder = info.placeholder;
  byId('service-hint').textContent = info.hint;
  contextLine = previous?.context || '';
  project.required = !contextLine;
  const headings = {model:['Расчёт', '3D-заказа'], b2b:['Запросить', 'КП']};
  const [lead, accent] = headings[key] || ['Обсудим', 'вашу задачу?'];
  byId('brief-lead').textContent = lead;
  byId('brief-accent').textContent = accent;
  byId('brief-photo').hidden = key !== 'model';
  byId('brief-intro').textContent = key === 'model'
    ? 'Укажите, что уже есть и какой результат нужен. По размерам и количеству мастерская сможет оценить работу.'
    : key === 'b2b' ? 'Укажите позиции и количества. Если спецификация уже готова, приложите её к письму.'
    : 'Опишите изделие или оборудование. К подготовленному письму можно приложить фото, чертёж или список закупки.';
  project.setCustomValidity('');
  byId('request-context').textContent = contextLine;
}
const selectedService = new URL(location.href).searchParams.get('service');
chooseService(Object.hasOwn(serviceInfo, selectedService) ? selectedService : currentService);
const consultation = new Map([
  ['alcorsil-20', 'Alcorsil 20 для гибкой формы'],
  ['mold-star-15', 'Mold Star 15 Slow для формы со сложным рельефом'],
  ['vytaflex-60', 'VytaFlex 60 для формы под бетон'],
  ['caspol-one', 'Caspol ONE для жёсткой отливки'],
  ['tarbender', 'Tarbender для прозрачного покрытия'],
  ['epoxacoat-ht', 'EpoxAcoat HT для покрытия оснастки']
]).get(new URL(location.href).searchParams.get('consult'));
if (consultation) {
  chooseService('material');
  contextLine = 'Прошу помочь с подбором материала. Рассматриваю ' + consultation + '.';
  project.required = false;
  byId('request-context').textContent = contextLine;
}
const machine = new Map([['mt9','MT 9 без насоса'], ['mt9m','MT9M/2S с насосом ZenSen 2S']]).get(new URL(location.href).searchParams.get('equipment'));
if (machine) {
  chooseService('b2b');
  contextLine = 'Прошу подтвердить наличие и стоимость камеры ' + machine + ' и сообщить условия получения.';
  project.required = false;
  byId('request-context').textContent = contextLine;
}
service.addEventListener('change', () => chooseService(service.value));
document.querySelectorAll('[data-brief]').forEach(link => link.addEventListener('click', () => {
  chooseService(link.dataset.brief);
  if (link.id === 'pick-help') contextLine = topics[selectedTask].request;
  if (link.id === 'calc-ask') contextLine = calculation;
  project.required = !contextLine;
  byId('request-context').textContent = contextLine;
  record('brief_started', service.value);
}));

const dialog = byId('draft');
let lastSubmit = null;
byId('enquiry-form').addEventListener('submit', event => {
  event.preventDefault();
  const description = project.value.trim();
  if (!contextLine && description.length < 3) {
    project.setCustomValidity('Напишите несколько слов о задаче.');
    project.reportValidity();
    return;
  }
  const subject = 'МылКо — ' + service.options[service.selectedIndex].text;
  const modelLines = service.value === 'model' ? [
    'Исходный материал: ' + modelSource.selectedOptions[0].text,
    'Нужный результат: ' + byId('model-result').value
  ] : [];
  const lines = ['Здравствуйте!', '', subject, contextLine, ...modelLines, description, detail.value.trim() ? serviceInfo[service.value].label + ': ' + detail.value.trim() : ''].filter((line, index) => index === 1 || line);
  const body = lines.join('\n');
  byId('draft-text').value = body;
  byId('send-mail').href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  byId('copy-status').textContent = '';
  lastSubmit = event.submitter;
  dialog.showModal();
  record('brief_prepared', service.value);
});
project.addEventListener('input', () => project.setCustomValidity(''));
byId('close-draft').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener('close', () => lastSubmit?.focus({preventScroll:true}));
byId('send-mail').addEventListener('click', () => record('mail_opened', service.value));
byId('copy-draft').addEventListener('click', async () => {
  const field = byId('draft-text');
  let copied = false;
  try {
    await navigator.clipboard.writeText(field.value);
    copied = true;
  } catch {
    field.focus();
    field.select();
    try { copied = document.execCommand('copy'); } catch { /* The text is selected for manual copying. */ }
  }
  byId('copy-status').textContent = copied ? 'Текст скопирован. Адрес для отправки — ' + email : 'Текст выделен. Используйте команду «Копировать».';
  if (copied) record('brief_copied', service.value);
});

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


const volumeMode = byId('volume-mode');
let manualVolume = '';
function geometryVolume() {
  const mode = volumeMode.value;
  const geometric = mode !== 'known';
  byId('geo-fields').hidden = !geometric;
  volume.readOnly = geometric;
  if (geometric) {
    const isBox = mode === 'box';
    byId('geo-a-label').textContent = isBox ? 'Длина, мм' : 'Диаметр, мм';
    byId('geo-b-label').hidden = !isBox;
    const a = decimal(byId('geo-a')), b = decimal(byId('geo-b')), h = decimal(byId('geo-h'));
    const displaced = byId('displaced');
    const model = displaced.value.trim() ? decimal(displaced) : 0;
    const measured = (isBox ? a * b : Math.PI * a * a / 4) * h / 1000;
    const net = measured - model;
    const valid = a > 0 && h > 0 && (!isBox || b > 0) && model >= 0 && Number.isFinite(net) && net > 0;
    volume.value = valid ? String(Number(net.toPrecision(9))) : '';
    calculate();
    if (!valid && Number.isFinite(measured) && model >= measured)
      byId('estimate').textContent = 'Объём мастер-модели должен быть меньше объёма заливки.';
  } else {
    volume.value = manualVolume;
    calculate();
  }
}
volume.addEventListener('input', () => { if (!volume.readOnly) manualVolume = volume.value; });
volumeMode.addEventListener('change', geometryVolume);
byId('geo-fields').addEventListener('input', geometryVolume);

function splitMix() {
  const [weight, a, b] = ['mix-mass','mix-a','mix-b'].map(id => byId(id).valueAsNumber);
  const massA = weight * (a / (a + b));
  byId('mix-result').textContent = [weight,a,b].every(n => Number.isFinite(n) && n > 0) && Number.isFinite(a + b)
    ? 'Компонент A — ' + number(massA) + ' г. Компонент B — ' + number(weight - massA) + ' г.'
    : 'Укажите массу и обе части пропорции.';
}
for (const id of ['mix-mass','mix-a','mix-b']) byId(id).addEventListener('input', splitMix);
byId('draft-save').addEventListener('click', () => downloadText('Mylco-zapros.txt', byId('draft-text').value));
function openCalculator() { if (location.hash === '#rashod') byId('rashod').open = true; }
openCalculator();
window.addEventListener('hashchange', openCalculator);
