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

const rentMode = byId('rent-mode'), endField = byId('rent-end');
const dateKey = date => date.toISOString().slice(0,10);
const dayMs = 86400000;
function updateQuote() {
  const byReturn = rentMode.value === 'end';
  daysField.parentElement.hidden = byReturn;
  daysField.disabled = byReturn;
  byId('end-field').hidden = !byReturn;
  endField.disabled = !byReturn;
  endField.required = byReturn;
  const pickup = startField.valueAsDate;
  if (pickup) {
    const nextDay = new Date(pickup.valueOf() + dayMs);
    endField.min = nextDay.getUTCFullYear() < 10000 ? dateKey(nextDay) : startField.value;
  } else endField.removeAttribute('min');
  if (byReturn) daysField.value = pickup && endField.valueAsDate ? String((endField.valueAsDate - pickup) / dayMs) : '';
  requestPanel.hidden = true;
  byId('rent-copy-status').replaceChildren();
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
  if (!byReturn && end) endField.value = dateKey(end);
  const comparison = byId('rent-comparison');
  comparison.replaceChildren();
  for (const option of cameraOptions) {
    const row = document.createElement('p');
    const amount = days * Number(option.dataset.rate);
    row.textContent = valid && Number.isSafeInteger(amount + Number(option.dataset.deposit))
      ? option.value + ' · ' + days + ' сут. — ' + rubles(amount) + ' аренда, ' + rubles(amount + Number(option.dataset.deposit)) + ' с залогом.'
      : option.value + ' — укажите срок аренды.';
    comparison.append(row);
  }
  return {kit:camera.value, start, end, days, cost, deposit};
}

const rentalParams = new URL(location.href).searchParams;
const linkedKit = cameraOptions.find(option => option.value === rentalParams.get('kit'));
if (linkedKit) linkedKit.checked = true;
if (/^\d{4}-\d{2}-\d{2}$/.test(rentalParams.get('start') || '')) startField.value = rentalParams.get('start');
if (/^[1-9]\d{0,6}$/.test(rentalParams.get('days') || '')) daysField.value = rentalParams.get('days');
[...cameraOptions, startField, daysField, rentMode, endField].forEach(field => field.addEventListener('input', updateQuote));
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
  prepareRentalLinks(quote);
  requestPanel.hidden = false;
  byId('rent-mail').focus();
  record('rental_quote_prepared', quote.kit);
});
byId('rent-mail').addEventListener('click', () => record('rental_mail_opened', cameraOptions.find(option => option.checked).value));

byId('rent-copy').addEventListener('click', () => {
  const body = new URL(byId('rent-mail').href).searchParams.get('body');
  copyText(body, byId('rent-copy-status'), 'Запрос скопирован. Адрес мастерской — order@mylco.ru.');
});

function checkVessel() {
  const d = byId('pot-d').valueAsNumber, h = byId('pot-h').valueAsNumber;
  const valid = [d,h].every(v => Number.isFinite(v) && v > 0);
  const link = byId('pot-custom');
  link.hidden = !valid;
  const matches = cameraOptions.filter(option => d < Number(option.dataset.diameter) && h < Number(option.dataset.height));
  byId('pot-result').textContent = !valid ? 'Введите диаметр и высоту ёмкости.' : matches.length
    ? 'По опубликованным габаритам можно рассмотреть ' + matches.map(option => option.value).join(' и ') + '.'
    : 'Среди двух комплектов нет варианта с запасом по обоим размерам.';
  if (valid) link.href = 'kamery.html?' + new URLSearchParams({potD:String(d),potH:String(h)}) + '#spec';
}
for (const id of ['pot-d','pot-h']) byId(id).addEventListener('input', checkVessel);
let calendarObjectUrl = '';
function prepareRentalLinks(quote) {
  const url = new URL(location.href);
  url.search = new URLSearchParams({kit:quote.kit,start:dateKey(quote.start),days:String(quote.days)});
  url.hash = 'rental';
  byId('rent-share').dataset.url = url.href;
  const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const compact = date => dateKey(date).replace(/-/g,'');
  const first = compact(quote.start), last = compact(quote.end);
  const next = new Date(quote.end.valueOf()+dayMs);
  const range = first + '/' + last;
  const google = new URL('https://calendar.google.com/calendar/render');
  google.search = new URLSearchParams({action:'TEMPLATE',text:'МылКо — аренда ' + quote.kit,dates:range,details:'Предварительный расчёт. Возврат ' + dateKey(quote.end) + '. Согласуйте даты с мастерской.'});
  byId('rent-gcal').href = google.href;
  const event = (kind, summary, start, end) => ['BEGIN:VEVENT','UID:'+kind+'-'+quote.kit+'-'+first+'-'+last+'@mylco.ru','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+start,...(end ? ['DTEND;VALUE=DATE:'+end] : []),'SUMMARY:'+summary,'STATUS:TENTATIVE','END:VEVENT'];
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Mylco//Rental//RU','CALSCALE:GREGORIAN',...event('rent','МылКо — аренда '+quote.kit,first,last),...event('return','МылКо — возврат '+quote.kit,last,next.getUTCFullYear() < 10000 ? compact(next) : ''),'END:VCALENDAR',''];
  if (calendarObjectUrl) URL.revokeObjectURL(calendarObjectUrl);
  calendarObjectUrl = URL.createObjectURL(new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'}));
  byId('rent-ics').href = calendarObjectUrl;
}
byId('rent-share').addEventListener('click', () => copyText(byId('rent-share').dataset.url, byId('rent-copy-status'), 'Ссылка на расчёт аренды скопирована.'));
