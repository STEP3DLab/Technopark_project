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
  const valid = ml > 0 && rho > 0 && extra >= 0 && extra <= 100;
  calculation = '';
  byId('calc-ask').hidden = !valid;
  byId('calc-packs').hidden = !valid;
  if (!valid) {
    byId('estimate').textContent = (!volume.value || !density.value) ? 'Введите объём и плотность для расчёта массы смеси.' : 'Проверьте значения. Объём и плотность должны быть больше нуля, запас — от 0 до 100%.';
    return;
  }
  const grams = ml * rho * (1 + extra / 100);
  const packs = new URLSearchParams({grams:String(Math.ceil(Number(grams.toPrecision(12))))});
  byId('calc-packs').href = 'materialy.html?' + packs + '#pack-calculator';
  const weight = grams >= 1000 ? number(grams / 1000) + ' кг' : number(grams) + ' г';
  calculation = 'Оценка расхода: ' + number(ml) + ' мл, плотность ' + number(rho) + ' г/см³, запас ' + number(extra) + '%. Всего около ' + weight + ' смеси.';
  byId('estimate').textContent = 'Понадобится около ' + weight + ' готовой смеси с учётом запаса.';
}
[volume, density, reserve].forEach(field => field.addEventListener('input', calculate));

const service = byId('service'), detail = byId('extra'), project = byId('project');
const savedDetails = new Map();
let currentService = service.value;
let contextLine = '';
function chooseService(key) {
  savedDetails.set(currentService, detail.value);
  currentService = key;
  service.value = key;
  const info = serviceInfo[key];
  byId('extra-label').textContent = info.label + ' · необязательно';
  detail.placeholder = info.example;
  detail.value = savedDetails.get(key) || '';
  project.placeholder = info.placeholder;
  byId('service-hint').textContent = info.hint;
  contextLine = '';
  project.required = true;
  project.setCustomValidity('');
  byId('request-context').textContent = '';
}
chooseService(currentService);
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
  const lines = ['Здравствуйте!', '', subject, contextLine, description, detail.value.trim() ? serviceInfo[service.value].label + ': ' + detail.value.trim() : ''].filter((line, index) => index === 1 || line);
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
