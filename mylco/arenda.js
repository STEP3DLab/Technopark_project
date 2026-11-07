'use strict';

const rentalForm = byId('rental');
const cameraOptions = Array.from(document.querySelectorAll('input[name="kit"]'));
const startField = byId('rent-start');
const daysField = byId('rent-days');
const requestPanel = byId('rent-request');
const rubles = amount => new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
const dateLabel = date => new Intl.DateTimeFormat('ru-RU', {
  timeZone:'UTC', day:'numeric', month:'long', year:'numeric'
}).format(date);

function localToday() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Moscow', day:'2-digit', month:'2-digit', year:'numeric'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [values.year, values.month, values.day].join('-');
}

function updateQuote() {
  requestPanel.hidden = true;
  startField.min = localToday();
  const camera = cameraOptions.find(option => option.checked);
  const rate = Number(camera.dataset.rate);
  const deposit = Number(camera.dataset.deposit);
  const days = daysField.valueAsNumber;
  const cost = rate * days;
  const valid = Number.isSafeInteger(days) && days >= 1 && Number.isSafeInteger(cost + deposit);
  daysField.setCustomValidity(daysField.value && !valid ? 'Введите целое количество суток от одного.' : '');
  const start = startField.valueAsDate;
  let end = null;
  if (valid && start && startField.validity.valid) {
    end = new Date(start.valueOf());
    end.setUTCDate(end.getUTCDate() + days);
    if (!Number.isFinite(end.valueOf()) || end.getUTCFullYear() > 9999) {
      end = null;
      daysField.setCustomValidity('Укажите меньший срок аренды.');
    }
  }
  byId('selection-line').textContent = 'Комплект ' + camera.value + ' · ' + rubles(rate) + ' / сутки';
  byId('rent-sum').textContent = valid ? rubles(cost) : '—';
  byId('rent-deposit').textContent = rubles(deposit);
  byId('rent-total').textContent = valid ? rubles(cost + deposit) : '—';
  byId('return-date').textContent = end ? 'Ориентир по возврату — ' + dateLabel(end) : '';
  return {kit:camera.value, start, end, days, cost, deposit};
}

[...cameraOptions, startField, daysField].forEach(field => field.addEventListener('input', updateQuote));
updateQuote();
rentalForm.addEventListener('submit', event => {
  event.preventDefault();
  const quote = updateQuote();
  if (!rentalForm.reportValidity() || !quote.end) return;
  const range = dateLabel(quote.start) + ' — ' + dateLabel(quote.end);
  const summary = 'Комплект ' + quote.kit + ', ' + range + ' Аренда за ' + quote.days + ' сут. — ' + rubles(quote.cost) + ', залог — ' + rubles(quote.deposit) + '.';
  const body = 'Здравствуйте! Подскажите, свободна ли вакуумная камера на эти даты?\n\n' + summary + '\n\nПрошу подтвердить стоимость и согласовать время получения.';
  byId('rent-summary').textContent = summary;
  byId('rent-mail').href = 'mailto:order@mylco.ru?subject=' + encodeURIComponent('Аренда камеры ' + quote.kit + ' — ' + startField.value) + '&body=' + encodeURIComponent(body);
  requestPanel.hidden = false;
  byId('rent-mail').focus();
  record('rental_quote_prepared', quote.kit);
});
byId('rent-mail').addEventListener('click', () => record('rental_mail_opened', cameraOptions.find(option => option.checked).value));
