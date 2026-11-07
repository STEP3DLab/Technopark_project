'use strict';
const specForm = byId('spec-form');
const sizeA = byId('size-a'), sizeB = byId('size-b'), height = byId('size-h');
const cylinder = () => specForm.elements.shape.value === 'cylinder';
const numberRu = value => new Intl.NumberFormat('ru-RU', {maximumSignificantDigits:5}).format(value);

const specUnit = byId('spec-unit'), specMode = byId('spec-mode'), targetLitres = byId('spec-litres');
const specParams = new URL(location.href).searchParams;
const factor = () => specUnit.value === 'cm' ? 10 : 1;
const positive = n => Number.isFinite(n) && n > 0;
function restoreGeometry() {
  if (specParams.get('shape') === 'box') specForm.elements.shape.value = 'box';
  if (specParams.get('unit') === 'cm') specUnit.value = 'cm';
  if (specParams.get('mode') === 'height') specMode.value = 'height';
  for (const [key, field] of [['a',sizeA],['b',sizeB],['h',height],['litres',targetLitres]]) {
    const value = Number(specParams.get(key));
    if (positive(value)) field.value = String(value);
  }
  const d = Number(specParams.get('potD')), h = Number(specParams.get('potH'));
  if (positive(d) && positive(h)) {
    byId('pot-context').hidden = false;
    byId('pot-context').textContent = 'Рабочая ёмкость из подбора аренды: Ø ' + numberRu(d) + ' × ' + numberRu(h) + ' мм. Внутренние размеры камеры выбираются с зазором.';
  }
}
restoreGeometry();
let previousFactor = factor();
function recalculateSpec() {
  byId('spec-out').hidden = true;
  byId('spec-feedback').replaceChildren();
  byId('spec-share-status').replaceChildren();
  byId('spec-share').disabled = true;
  const scale = factor(), unit = scale === 10 ? 'см' : 'мм';
  for (const field of [sizeA,sizeB,height]) {
    if (scale !== previousFactor && positive(field.valueAsNumber)) field.value = String(Number((field.valueAsNumber * previousFactor / scale).toPrecision(14)));
    field.min = String(0.1 / scale);
  }
  previousFactor = scale;
  const reverse = specMode.value === 'height';
  sizeB.disabled = cylinder();
  sizeB.required = !cylinder();
  height.disabled = reverse;
  height.required = !reverse;
  targetLitres.disabled = !reverse;
  targetLitres.required = reverse;
  byId('height-field').hidden = reverse;
  byId('litres-field').hidden = !reverse;
  byId('width-label').hidden = cylinder();
  byId('first-label').textContent = (cylinder() ? 'Внутренний диаметр, ' : 'Внутренняя длина, ') + unit;
  byId('size-b-label').textContent = 'Ширина, ' + unit;
  byId('size-h-label').textContent = 'Внутренняя высота, ' + unit;
  byId('pump-model-label').hidden = byId('spec-pump').selectedIndex !== 1;
  byId('pump-model').disabled = byId('pump-model-label').hidden;
  const a = sizeA.valueAsNumber * scale, b = sizeB.valueAsNumber * scale;
  const area = cylinder() ? Math.PI * a * a / 4 : a * b;
  const h = reverse ? targetLitres.valueAsNumber * 1e6 / area : height.valueAsNumber * scale;
  const litres = area * h / 1e6;
  const cols = [sizeA, ...(cylinder() ? [] : [sizeB]), reverse ? targetLitres : height];
  const output = byId('spec-volume');
  if (cols.some(field => !field.validity.valid) || !positive(litres) || !positive(h)) {
    output.textContent = 'Введите положительные размеры' + (reverse ? ' и требуемый объём.' : '.');
    return null;
  }
  const outside = litres < 9 || litres > 200;
  output.textContent = (reverse ? 'Внутренняя высота ≈ ' + numberRu(h / scale) + ' ' + unit + '. ' : '') +
    'Геометрический объём ≈ ' + numberRu(litres) + ' л.' + (outside ? ' Размер выходит за опубликованный диапазон 9–200 л. Возможность изготовления уточнит мастер.' : '');
  byId('spec-share').disabled = false;
  return {litres, dims:cylinder() ? 'Ø ' + numberRu(a) + ' × ' + numberRu(h) : [a,b,h].map(numberRu).join(' × ')};
}
byId('spec-share').addEventListener('click', () => {
  if (!recalculateSpec()) return;
  const url = new URL(location.href);
  url.search = new URLSearchParams({shape:specForm.elements.shape.value, unit:specUnit.value, mode:specMode.value, a:sizeA.value});
  if (!cylinder()) url.searchParams.set('b', sizeB.value);
  if (specMode.value === 'height') url.searchParams.set('litres', targetLitres.value);
  else url.searchParams.set('h',height.value);
  url.hash = 'spec';
  copyText(url.href, byId('spec-share-status'), 'Ссылка на геометрию камеры скопирована.');
});
specForm.addEventListener('input', recalculateSpec);
specForm.addEventListener('submit', event => {
  event.preventDefault();
  const calc = recalculateSpec();
  if (!calc || !specForm.reportValidity()) return;
  const lines = ['Здравствуйте! Прошу рассчитать изготовление вакуумной камеры.',
    'Форма: ' + (cylinder() ? 'цилиндрическая' : 'прямоугольная') + '.',
    'Внутренние размеры: ' + calc.dims + ' мм.', 'Геометрический объём: около ' + numberRu(calc.litres) + ' л.',
    byId('spec-pump').value + (byId('pump-model').disabled || !byId('pump-model').value.trim() ? '.' : ': '+ byId('pump-model').value.trim() + '.'),
    byId('pot-context').textContent, byId('spec-work').value.trim(), 'Пожалуйста, уточните подходящую конструкцию, стоимость и срок изготовления.'];
  const body = lines.filter(Boolean).join('\n');
  byId('spec-body').value = body;
  byId('spec-mail').href = emailDraft('Расчёт вакуумной камеры под заказ', body);
  byId('spec-out').hidden = false;
  byId('spec-mail').focus();
  record('chamber_spec_prepared', specForm.elements.shape.value);
});
byId('spec-copy').addEventListener('click', () => copyText(byId('spec-body').value, byId('spec-feedback'), 'Техзадание скопировано.'));
byId('spec-save').addEventListener('click', () => downloadText('Mylco-kamera-TZ.txt', byId('spec-body').value));
recalculateSpec();
