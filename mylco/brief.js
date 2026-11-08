'use strict';

const serviceInfo = {
  material: { placeholder:'Что хотите отлить, какого размера образец и сколько копий нужно?', label:'Размеры и тираж', example:'Например, 12 × 8 см, 20 шт.', hint:'Если есть фото образца, приложите его к готовому письму.' },
  rental: { placeholder:'Что будете дегазировать? Каковы размеры рабочей ёмкости?', label:'Даты аренды', example:'Например, с 12 по 14 ноября', hint:'В письме можно указать удобное время получения камеры.' },
  custom: { placeholder:'Опишите материал, рабочую ёмкость и как часто планируете пользоваться камерой.', label:'Объём или внутренние размеры', example:'Например, 30 л или Ø 300 × 400 мм', hint:'Чертёж или фото ёмкости можно приложить к письму.' },
  model: { placeholder:'Например, восстановить крепёжное ушко корпуса и сохранить расстояние между отверстиями.', label:'Габариты и важные размеры', example:'Например, корпус 80 × 45 × 20 мм, между отверстиями 60 мм', hint:'Для оценки достаточно описания, размеров или ссылки на исходный файл. Фото можно приложить в почте.' },
  b2b: { placeholder:'Перечислите нужные позиции и количества. На кого подготовить предложение?', label:'Город и желаемый срок', example:'Например, Москва, до 25 ноября', hint:'Спецификацию и реквизиты можно приложить к письму.' },
  weld: { placeholder:'Что нужно сварить? Укажите материал и размеры заготовки.', label:'Размеры и срок', example:'Например, рама 60 × 40 см, к концу месяца', hint:'Фото или чертёж удобно приложить к готовому письму.' }
};

const service = byId('service'), detail = byId('extra'), project = byId('project');
const serviceDrafts = new Map();
let currentService = service.value;
let contextLine = '';
const modelSource = byId('model-source');
const modelResult = byId('model-result'), modelQty = byId('model-qty');
const physicalResult = () => ['print','both'].includes(modelResult.value);
const modelJobs = {
  restore:{source:'sample', result:'both'},
  cad:{source:'sample', result:'cad'},
  print:{source:'file', result:'print'},
  drawing:{source:'drawing', result:'cad'}
};
const modelHints = {
  sample: 'Для оценки приложите к письму фото с линейкой. Отметьте утраченные элементы и размеры, которые важно сохранить.',
  file: 'Укажите формат файла, габариты, тираж и назначение детали. Файл или ссылку можно приложить к письму.',
  drawing: 'Укажите габариты и количество. К готовому письму приложите эскиз или чертёж с основными размерами.'
};
function showModelTip() {
  byId('model-tip').textContent = modelHints[modelSource.value];
  byId('model-qty-field').hidden = !physicalResult();
  modelQty.disabled = !physicalResult();
  modelQty.required = physicalResult();
}
modelSource.addEventListener('change', showModelTip);
modelResult.addEventListener('change', showModelTip);
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
  project.required = key !== 'model' && !contextLine;
  project.minLength = key === 'model' ? 0 : 3;
  const headings = {model:['Расчёт', '3D-заказа'], b2b:['Запросить', 'КП']};
  const [lead, accent] = headings[key] || ['Обсудим', 'вашу задачу?'];
  byId('brief-lead').textContent = lead;
  byId('brief-accent').textContent = accent;
  const photo = byId('brief-photo');
  if (photo) photo.hidden = key !== 'model';
  byId('brief-intro').textContent = key === 'model'
    ? 'Укажите, что уже есть и какой результат нужен. По размерам и количеству мастерская сможет оценить работу.'
    : key === 'b2b' ? 'Укажите позиции и количества. Если спецификация уже готова, приложите её к письму.'
    : 'Опишите изделие или оборудование. К подготовленному письму можно приложить фото, чертёж или список закупки.';
  project.setCustomValidity('');
  byId('request-context').textContent = contextLine;
}
function setRequestContext(message) {
  contextLine = message;
  project.required = service.value !== 'model' && !message;
  project.setCustomValidity('');
  byId('request-context').textContent = message;
}
const selectedService = new URL(location.href).searchParams.get('service');
chooseService([...service.options].some(option => option.value === selectedService) ? selectedService : currentService);
const consultation = new Map([
  ['alcorsil-20', 'Alcorsil 20 для гибкой формы'],
  ['mold-star-15', 'Mold Star 15 Slow для формы со сложным рельефом'],
  ['vytaflex-60', 'VytaFlex 60 для формы под бетон'],
  ['caspol-one', 'Caspol ONE для жёсткой отливки'],
  ['tarbender', 'Tarbender для прозрачного покрытия'],
  ['epoxacoat-ht', 'EpoxAcoat HT для покрытия оснастки']
]).get(new URL(location.href).searchParams.get('consult'));
if (consultation && [...service.options].some(option => option.value === 'material')) {
  chooseService('material');
  contextLine = 'Прошу помочь с подбором материала. Рассматриваю ' + consultation + '.';
  project.required = false;
  byId('request-context').textContent = contextLine;
}
const machine = new Map([['mt9','MT 9 без насоса'], ['mt9m','MT9M/2S с насосом ZenSen 2S']]).get(new URL(location.href).searchParams.get('equipment'));
if (machine && [...service.options].some(option => option.value === 'b2b')) {
  chooseService('b2b');
  contextLine = 'Прошу подтвердить наличие и стоимость камеры ' + machine + ' и сообщить условия получения.';
  project.required = false;
  byId('request-context').textContent = contextLine;
}
service.addEventListener('change', () => chooseService(service.value));
const caseLinks = new Map(Array.from(document.querySelectorAll('[data-example]'), link => [link.dataset.example, link]));
const routeDrafts = new Map();
let currentRoute = null;
let selectedExample = '';
function applyModelRoute(url) {
  if (service.value !== 'model') return;
  const job = url.searchParams.get('job');
  const preset = Object.hasOwn(modelJobs, job) ? modelJobs[job] : null;
  const candidate = caseLinks.get(url.searchParams.get('example'));
  const example = candidate && candidate.dataset.job === job ? candidate : null;
  const route = example?.dataset.example || (preset ? job : 'general');
  if (route === currentRoute) return;

  const fields = [modelSource, modelResult, modelQty, byId('model-link'), project, detail];
  if (currentRoute !== null) routeDrafts.set(currentRoute, fields.map(field => field.value));
  const saved = routeDrafts.get(route);
  const defaults = [preset?.source || 'sample', preset?.result || 'cad', '1', '', '', ''];
  fields.forEach((field, i) => { field.value = (saved || defaults)[i]; });
  currentRoute = route;
  selectedExample = example?.dataset.title || '';
  byId('request-context').textContent = selectedExample ? 'Пример из портфолио: ' + selectedExample : contextLine;
  project.setCustomValidity('');
  showModelTip();
}
applyModelRoute(new URL(location.href));
document.querySelectorAll('[data-job]').forEach(link => link.addEventListener('click', event => {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const target = new URL(link.href);
  if (target.href !== location.href) history.pushState(null, '', target);
  applyModelRoute(target);
  byId('brief-title').focus({preventScroll:true});
  byId('brief').scrollIntoView();
  record('model_task_selected', link.dataset.example || link.dataset.job);
}));
window.addEventListener('popstate', () => applyModelRoute(new URL(location.href)));

const dialog = byId('draft');
let lastSubmit = null;
byId('enquiry-form').addEventListener('submit', event => {
  event.preventDefault();
  const description = project.value.trim();
  const isModel = service.value === 'model';
  const modelLink = byId('model-link').value.trim();
  const hasModelDetails = isModel && (modelLink || detail.value.trim().length >= 2);
  if (!contextLine && description.length < 3 && !hasModelDetails) {
    project.setCustomValidity(isModel
      ? 'Опишите деталь, укажите размеры или добавьте ссылку на файл.'
      : 'Напишите несколько слов о задаче.');
    project.reportValidity();
    return;
  }
  const modelSubjects = {cad:'Расчёт CAD-модели', print:'Расчёт 3D-печати', both:'Расчёт модели и 3D-печати', scan:'Расчёт 3D-сканирования', plan:'Расчёт чертежа'};
  const subject = 'МылКо — ' + (isModel ? modelSubjects[modelResult.value] : service.options[service.selectedIndex].text);
  const recipient = isModel && physicalResult() ? 'mylco@inbox.ru' : 'order@mylco.ru';
  const modelLines = isModel ? [
    selectedExample ? 'Ориентир из портфолио STEP 3D: ' + selectedExample : '',
    'Исходный материал: ' + modelSource.selectedOptions[0].text,
    'Нужный результат: ' + modelResult.selectedOptions[0].text,
    physicalResult() ? 'Количество экземпляров: ' + modelQty.value + ' шт.' : '',
    modelLink ? 'Исходные материалы: ' + modelLink : ''
  ] : [];
  const lines = ['Здравствуйте!', '', subject, contextLine, ...modelLines, description, detail.value.trim() ? serviceInfo[service.value].label + ': ' + detail.value.trim() : ''].filter((line, index) => index === 1 || line);
  const body = lines.join('\n');
  byId('draft-text').value = body;
  byId('draft-recipient').textContent = recipient;
  byId('send-mail').href = 'mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  byId('copy-status').textContent = '';
  lastSubmit = event.submitter;
  dialog.showModal();
  record('brief_prepared', service.value);
});
[project, detail, byId('model-link')].forEach(field => field.addEventListener('input', () => project.setCustomValidity('')));
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
  byId('copy-status').textContent = copied ? 'Текст скопирован. Адрес для отправки — ' + byId('draft-recipient').textContent : 'Текст выделен. Используйте команду «Копировать».';
  if (copied) record('brief_copied', service.value);
});

byId('draft-save').addEventListener('click', () => downloadText('Mylco-zapros.txt', byId('draft-text').value));
