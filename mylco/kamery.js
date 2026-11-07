'use strict';
const specForm = byId('spec-form');
const sizeA = byId('size-a'), sizeB = byId('size-b'), height = byId('size-h');
const cylinder = () => specForm.elements.shape.value === 'cylinder';
const numberRu = value => new Intl.NumberFormat('ru-RU', {maximumSignificantDigits:5}).format(value);

function recalculateSpec() {
  byId('spec-out').hidden = true;
  byId('spec-feedback').replaceChildren();
  sizeB.disabled = cylinder();
  sizeB.required = !cylinder();
  byId('width-label').hidden = cylinder();
  byId('first-label').textContent = cylinder() ? 'Внутренний диаметр, мм' : 'Внутренняя длина, мм';
  byId('pump-model-label').hidden = byId('spec-pump').selectedIndex !== 1;
  byId('pump-model').disabled = byId('pump-model-label').hidden;
  const cols = cylinder() ? [sizeA, height] : [sizeA, sizeB, height];
  const output = byId('spec-volume');
  if (cols.some(input => !input.validity.valid || !Number.isFinite(input.valueAsNumber))) {
    output.textContent = 'Введите положительные размеры в миллиметрах.';
    return null;
  }
  const a = sizeA.valueAsNumber, b = sizeB.valueAsNumber, h = height.valueAsNumber;
  const litres = (cylinder() ? Math.PI * a * a / 4 : a * b) * h / 1e6;
  if (!Number.isFinite(litres) || litres <= 0) {
    output.textContent = 'Проверьте размеры камеры.';
    return null;
  }
  const outside = litres < 9 || litres > 200;
  output.textContent = 'Геометрический объём ≈ ' + numberRu(litres) + ' л.' + (outside ? ' Размер выходит за опубликованный диапазон 9–200 л. Возможность изготовления уточнит мастер.' : '');
  return {litres, dims:cylinder() ? 'Ø ' + numberRu(a) + ' × ' + numberRu(h) : [a,b,h].map(numberRu).join(' × ')};
}
specForm.addEventListener('input', recalculateSpec);
specForm.addEventListener('submit', event => {
  event.preventDefault();
  const calc = recalculateSpec();
  if (!calc || !specForm.reportValidity()) return;
  const lines = ['Здравствуйте! Прошу рассчитать изготовление вакуумной камеры.',
    'Форма: ' + (cylinder() ? 'цилиндрическая' : 'прямоугольная') + '.',
    'Внутренние размеры: ' + calc.dims + ' мм.', 'Геометрический объём: около ' + numberRu(calc.litres) + ' л.',
    byId('spec-pump').value + (byId('pump-model').disabled || !byId('pump-model').value.trim() ? '.' : ': '+ byId('pump-model').value.trim() + '.'),
    byId('spec-work').value.trim(), 'Пожалуйста, уточните подходящую конструкцию, стоимость и срок изготовления.'];
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
