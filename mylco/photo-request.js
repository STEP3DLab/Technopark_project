'use strict';

const photoForm = byId('photo-form');
const photoInput = byId('detail-photo');
const photoStatus = byId('photo-status');
const target = new URL('https://mylco.ru/mylco-photo.php');
const recipients = {cad:'order@mylco.ru', print:'mylco@inbox.ru', both:'mylco@inbox.ru'};
let direct = false;
let busy = false;
let revision = 0;
let transfer = null;
let previewURL = '';
let requestId = null;
photoForm.hidden = false;

function releaseHandoff() {
  if (transfer) URL.revokeObjectURL(transfer.url);
  transfer = null;
  byId('photo-handoff').hidden = true;
}
function clearPrepared() {
  revision++;
  releaseHandoff();
  requestId = null;
  photoStatus.textContent = '';
  byId('photo-contact').setCustomValidity('');
}
photoForm.addEventListener('input', clearPrepared);
function setBusy(on) {
  busy = on;
  byId('photo-submit').disabled = on;
  photoForm.setAttribute('aria-busy', String(on));
}
async function detectReceiver() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(target, {credentials:'omit', signal:controller.signal, cache:'no-store'});
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
    const info = await res.json();
    if (info.service !== 'mylco-photo-v1' || info.ready !== true || busy || transfer) return;
    direct = true;
    byId('photo-submit').textContent = 'Отправить в мастерскую';
    byId('photo-channel').textContent = 'Фото и контакт будут переданы мастерской МылКо для ответа на ваш запрос.';
  } catch { /* Visitors can always prepare an email with the image attached. */ }
  finally { clearTimeout(timer); }
}
detectReceiver();

function resetPreview() {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = '';
  const image = byId('photo-preview');
  image.removeAttribute('src');
  image.hidden = true;
}
photoInput.addEventListener('change', () => {
  resetPreview();
  photoInput.setCustomValidity('');
  const file = photoInput.files[0];
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    photoInput.setCustomValidity('Выберите фото JPEG, PNG или WebP до 12 МБ.');
    photoInput.reportValidity();
    return;
  }
  previewURL = URL.createObjectURL(file);
  const image = byId('photo-preview');
  image.src = previewURL;
  image.hidden = false;
});

async function photoAttachment(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 1500 / Math.max(image.width,image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width*scale));
  canvas.height = Math.max(1, Math.round(image.height*scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const jpeg = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',0.8));
  if (!jpeg || jpeg.size > 2 * 1024 * 1024) throw new Error('photo');
  return new File([jpeg], 'detal.jpg', {type:'image/jpeg'});
}
function base64(data) {
  let binary = '';
  for (let i=0; i<data.length; i+=8192) binary += String.fromCharCode(...data.subarray(i,i+8192));
  return btoa(binary);
}
function wrapped(encoded) { return encoded.match(/.{1,76}/g)?.join('\r\n') || ''; }
async function prepareEmail(data, file) {
  const recipient = recipients[data.goal];
  const subject = 'МылКо — оценка детали по фото';
  const goal = byId('photo-goal').selectedOptions[0].textContent;
  const body = ['Здравствуйте! Прошу оценить работу по фотографии.', 'Результат: ' + goal,
    'Размер: ' + data.size, 'Контакт для ответа: ' + data.contact, data.note, 'Источник: витрина МылКо.'].filter(Boolean).join('\n');
  const enc = new TextEncoder();
  const boundary = 'MylcoPhotoPart';
  const eml = [
    'X-Unsent: 1', 'To: ' + recipient, 'Subject: =?UTF-8?B?' + base64(enc.encode(subject)) + '?=',
    'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' + boundary + '"', '',
    '--'+boundary, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64','',wrapped(base64(enc.encode(body))),
    '--'+boundary,'Content-Type: image/jpeg; name="detal.jpg"','Content-Disposition: attachment; filename="detal.jpg"',
    'Content-Transfer-Encoding: base64','',wrapped(base64(new Uint8Array(await file.arrayBuffer()))),'--'+boundary+'--',''
  ].join('\r\n');
  return {recipient, subject, body, file, url:URL.createObjectURL(new Blob([eml],{type:'application/octet-stream'}))};
}
function showHandoff(next) {
  releaseHandoff();
  transfer = next;
  byId('handoff-address').textContent = next.recipient;
  byId('plain-photo-email').href = 'mailto:' + next.recipient + '?subject=' + encodeURIComponent(next.subject) + '&body=' + encodeURIComponent(next.body);
  byId('save-photo-email').href = next.url;
  byId('share-photo').hidden = !navigator.canShare?.({files:[next.file]});
  byId('photo-handoff').hidden = false;
  byId('photo-handoff').scrollIntoView({block:'nearest'});
}
async function register(data, file, id) {
  const payload = new FormData();
  Object.entries(data).forEach(([key,value]) => payload.append(key, value));
  payload.append('request_id',id);
  payload.append('photo',file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),20000);
  try {
    const res = await fetch(target, {method:'POST', body:payload, credentials:'omit',signal:controller.signal});
    if (!res.ok) throw Error('server');
    const reply = await res.json();
    if (reply.service !== 'mylco-photo-v1' || reply.registered !== true || reply.request_id !== id ||
        !/^MK-[A-F0-9]{12}$/.test(reply.number)) throw Error('receipt');
    return reply.number;
  } finally { clearTimeout(timeout); }
}
photoForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const contact = byId('photo-contact').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) && !(/^\+?[\d() .-]+$/.test(contact) && /^\d{7,15}$/.test(contact.replace(/\D/g,'')))) {
    byId('photo-contact').setCustomValidity('Укажите телефон с кодом города или e-mail.');
    byId('photo-contact').reportValidity();
    return;
  }
  const size = byId('photo-size').value.trim();
  if (size.length < 2 || !/\d/.test(size)) {
    photoStatus.textContent = 'Укажите размер числом и добавьте единицы, например «диаметр 12 мм».';
    byId('photo-size').focus(); return;
  }
  const data = {goal:byId('photo-goal').value, size, contact, note:byId('photo-note').value.trim()};
  const rev = revision;
  releaseHandoff();
  setBusy(true);
  photoStatus.textContent = 'Готовим фотографию…';
  try {
    const file = await photoAttachment(previewURL);
    if (rev !== revision) return;
    if (direct) {
      photoStatus.textContent = 'Передаём заявку в мастерскую…';
      try {
        requestId ||= crypto.randomUUID();
        const number = await register(data,file,requestId);
        if (rev !== revision) return;
        photoStatus.textContent = 'Заявка ' + number + ' зарегистрирована в МылКо. Мастерская ответит по указанному контакту.';
        record('photo_registered', data.goal);
        return;
      } catch {
        if (rev !== revision) return;
        photoStatus.textContent = 'Сервер не подтвердил приём. Можно повторить отправку или отправить письмо со снимком.';
      }
    } else photoStatus.textContent = 'Остался один шаг — отправьте письмо в мастерскую.';
    const next = await prepareEmail(data,file);
    if (rev !== revision) { URL.revokeObjectURL(next.url); return; }
    showHandoff(next);
    record('photo_draft_prepared',data.goal);
  } catch {
    if (rev === revision) photoStatus.textContent = 'Не удалось обработать снимок. Выберите другой JPEG или PNG.';
  } finally { setBusy(false); }
});
byId('copy-photo-text').addEventListener('click', () => {
  if (transfer) copyText(transfer.body, photoStatus, 'Текст скопирован. Приложите фотографию к письму.');
});
byId('share-photo').addEventListener('click', async () => {
  if (!transfer) return;
  try {
    await navigator.share({files:[transfer.file],title:transfer.subject,text:'Кому: '+transfer.recipient+'\n'+transfer.body});
    photoStatus.textContent = 'Фото передано выбранному приложению. Отправку подтвердите в нём.';
  } catch (e) {
    if (e.name !== 'AbortError') photoStatus.textContent = 'Можно скачать письмо с вложением или приложить фото в своей почте.';
  }
});
