// Progressive enhancement for a static site. No backend, cookies, storage or tracking requests.
const $ = selector => document.querySelector(selector);
const form = $('#brief-form');
const emailLink = $('#email-brief');
const hint = $('#email-brief-hint');
const recipient = 'info@sud-mskexpert.ru';
const services = {
  '3d-scanning': '3D-сканирование', measurements: 'Обмеры и документация',
  'scan-to-bim': 'Scan-to-BIM', 'project-fact': 'Проект и факт',
  'expert-support': 'Строительная экспертиза', 'change-monitoring': 'Контроль изменений'
};

// A future consent-aware analytics adapter can listen to this event.
// Values are allowlisted identifiers; user input, URL parameters and document text are excluded.
const eventNames = new Set(['brief_start','brief_ready','service_select','contact_phone','contact_email','partner_form','brief_email_open','brief_copy','brief_download']);
function signal(name, placement = 'page', service = '') {
  if (!eventNames.has(name)) return;
  const safePlacement = ['page','hero','pricing','contact','brief','service','mobile'].includes(placement) ? placement : 'page';
  const detail = {event:name,placement:safePlacement};
  if (Object.hasOwn(services,service)) detail.service=service;
  document.dispatchEvent(new CustomEvent('sloy:conversion',{detail}));
}
document.addEventListener('click',event=>{
  const target=event.target.closest?.('[data-track]');
  if(target)signal(target.dataset.track,target.dataset.placement,target.dataset.serviceSlug);
});

function updateEmail(){
  if(!emailLink||!hint||$('[data-step="3"]')?.hidden)return;
  const text=$('#brief-preview')?.textContent||'';
  if(!text.trim())return;
  const subject='СЛОЙ LAB — запрос по объекту';
  const body='Здравствуйте! Прошу обсудить возможность и состав работ по объекту.\n\n'+text+'\n\nПожалуйста, уточните необходимые исходные данные и дальнейшие шаги.';
  const complete=`mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // Some mail clients impose short URI limits. Never silently discard part of the visitor's brief.
  if(complete.length>1800){
    emailLink.href=`mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('Здравствуйте! Прошу обсудить объект в рамках проекта СЛОЙ LAB.\n\n[Вставьте скопированный бриф или приложите скачанный TXT.]')}`;
    hint.textContent='Сначала скопируйте запрос кнопкой ниже или скачайте TXT. Затем откройте письмо и вставьте текст либо приложите файл. Адресат: '+recipient+'.';
  }else{
    emailLink.href=complete;
    hint.textContent='Текст запроса будет добавлен в письмо. Адресат: '+recipient+'. Проверьте письмо и завершите отправку в своей почте.';
  }
  signal('brief_ready','brief');
}
form?.addEventListener('submit',()=>queueMicrotask(updateEmail));
emailLink?.addEventListener('click',()=>{
  $('#form-status').textContent='Открываем почтовое приложение. Отправьте письмо самостоятельно. Если почта не открылась — скопируйте текст и адрес '+recipient+'.';
});
$('#copy-brief')?.addEventListener('click',()=>signal('brief_copy','brief'));
$('#download-brief')?.addEventListener('click',()=>signal('brief_download','brief'));

// A service landing page can carry a non-personal, allowlisted choice into the form.
const requested=new URLSearchParams(location.search).get('service');
const selected=services[requested]||(Object.values(services).includes(requested)?requested:null);
if(selected&&form){
  const input=[...form.querySelectorAll('input[name="task"]')].find(el=>el.value===selected);
  if(input){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}
}
