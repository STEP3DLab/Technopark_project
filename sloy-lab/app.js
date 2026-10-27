const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const header = $('.header');
const preferredScrollBehavior=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
function setMenu(open, returnFocus=false){
  header.classList.toggle('menu-open',open);
  $('.menu-toggle').setAttribute('aria-expanded',String(open));
  $('.menu-toggle').setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');
  if(open) $('.nav a')?.focus({preventScroll:true});
  else if(returnFocus) $('.menu-toggle').focus();
}
$('.menu-toggle').addEventListener('click',()=>setMenu(!header.classList.contains('menu-open')));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&header.classList.contains('menu-open'))setMenu(false,true);});
function focusTarget(target){
  if(target.matches('details'))target.open=true;
  const heading=target.matches('details')?$('summary',target):$('h1,h2,h3',target)||target;
  if(!heading.matches('summary'))heading.tabIndex=-1;
  heading.focus({preventScroll:true});
  target.scrollIntoView({behavior:preferredScrollBehavior(),block:'start'});
}
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');if(!link)return;
  const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;
  event.preventDefault();setMenu(false);history.replaceState(null,'',link.getAttribute('href'));focusTarget(target);
});
let navScheduled=false;
function updateSectionNav(){
  navScheduled=false;
  const nav=$('.section-nav');if(!nav)return;
  const links=$$('.section-nav a').filter(link=>document.getElementById(link.dataset.section));if(!links.length)return;
  const threshold=header.offsetHeight+nav.offsetHeight+40;
  let active=links[0];
  links.forEach(link=>{if(document.getElementById(link.dataset.section).getBoundingClientRect().top<=threshold)active=link;});
  links.forEach(link=>{if(link===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
  const left=active.offsetLeft,right=left+active.offsetWidth;
  if(left<nav.scrollLeft)nav.scrollLeft=left-16;else if(right>nav.scrollLeft+nav.clientWidth)nav.scrollLeft=right-nav.clientWidth+16;
}
window.addEventListener('scroll',()=>{if(!navScheduled){navScheduled=true;requestAnimationFrame(updateSectionNav);}},{passive:true});
window.addEventListener('resize',updateSectionNav);updateSectionNav();
const intentData={
  all:{ids:[],text:'Выберите ситуацию — подсветим подходящие услуги. Состав работ уточняется с командой.'},
  measure:{ids:['measure','scan'],text:'Для обмеров: цифровая съёмка и комплект планов, фасадов или разрезов. Конкретную выдачу согласуем по вашей задаче.'},
  compare:{ids:['compare','scan'],text:'Для сравнения с проектом: съёмка и карта геометрических расхождений. Понадобится проектная документация.'},
  renovate:{ids:['bim','measure'],text:'Для реконструкции: обмеры и модель существующего состояния. Подберите состав вместе с проектировщиком.'},
  expert:{ids:['expert','scan'],text:'Для строительного спора: начните с вопросов эксперту. Он определит программу исследования и необходимость сканирования.'}
};
$$('[data-intent]').forEach(button=>button.addEventListener('click',()=>{
  const selected=button.dataset.intent,data=intentData[selected];
  $$('[data-intent]').forEach(item=>{const active=item===button;item.setAttribute('aria-pressed',String(active));item.classList.toggle('active',active);});
  $$('.service').forEach(item=>item.classList.toggle('recommended',data.ids.some(id=>item.id===`service-${id}`)));
  if(data.ids.length)$(`#service-${data.ids[0]}`).open=true;
  $('#intent-message').textContent=data.text;
}));

// Synthetic drawings explain service outputs; no client data or measured results are used.
const svgStart = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 260" aria-hidden="true"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#bac8aa" stroke-width=".4"/></pattern></defs><rect width="520" height="260" fill="url(#grid)"/>';
const cases = [
  {title:'Где фактическая геометрия отличается от проекта?', description:'Сопоставляем облако точек с проектной поверхностью и показываем участки расхождений. Их значимость оценивается с учётом точности и требований задания.', result:'Карта геометрических отклонений + контрольные сечения + ведомость расхождений.', visual:svgStart+'<g transform="translate(65 37)"><path d="M10 130V40L200 0l175 65v130l-190 40Z" fill="#d2dcc7" stroke="#8ea77a"/><path d="m10 40 175 60 190-35M185 100v135M10 85l175 60 190-35M10 130l175 60 190-35" stroke="#8ea77a" fill="none"/><g fill="#719d86" opacity=".75"><path d="m20 49 49 17v31L20 80Z"/><path d="m79 70 49 17v31l-49-17Z"/><path d="m138 90 37 13v31l-37-13Z"/></g><g fill="#a4b969"><path d="m20 94 49 17v31l-49-17Z"/><path d="m79 115 49 17v31l-49-17Z"/></g><path d="m138 135 37 13v31l-37-13Z" fill="#cf7e56"/><path d="m197 106 50-9v32l-50 9Z" fill="#b6c77e"/><path d="m257 95 50-9v32l-50 9Z" fill="#7eaa93"/><path d="m317 84 47-9v32l-47 9Z" fill="#9dbd77"/><path d="m197 151 50-9v32l-50 9Z" fill="#d99e5d"/><path d="m257 140 50-9v32l-50 9Z" fill="#c78856"/><path d="m317 129 47-9v32l-47 9Z" fill="#a7bb76"/><circle cx="157" cy="155" r="5" fill="#f4f8ed" stroke="#b86c46"/><path d="M157 155 110 195H30" fill="none" stroke="#546d47" stroke-width=".7"/><rect x="-20" y="181" width="89" height="23" rx="2" fill="#f7faef"/><text x="-8" y="197" fill="#566b46" font-family="Arial" font-size="9">Δ = +18 мм*</text></g><text x="22" y="24" fill="#70845f" font-family="Arial" font-size="8" letter-spacing="1.2">ПРОЕКТ ↔ ФАКТ</text><text x="380" y="244" fill="#70845f" font-family="Arial" font-size="7">* Условный пример</text></svg>'},
  {title:'Как спроектировать новое внутри существующего?', description:'Восстанавливаем видимую геометрию и расположение конструкций. Проектировщик получает согласованную основу вместо разрозненных замеров.', result:'Обмерные планы и разрезы + модель существующего состояния + перечень ограничений.', visual:svgStart+'<g transform="translate(85 36) skewY(-9)"><path d="M0 15h325v170H0Z" fill="#eef3e6" stroke="#7d936c" stroke-width="3"/><path d="M115 15v55m0 30v85M220 15v100m0 30v40M0 100h55m28 0h137M220 85h105" fill="none" stroke="#809671" stroke-width="4"/><path d="M55 100v-28a28 28 0 0 1 28 28M115 70h30a30 30 0 0 1-30 30M220 115h30a30 30 0 0 1-30 30" fill="none" stroke="#adbb9f"/><g fill="#c6d4b6"><rect x="17" y="31" width="67" height="24"/><rect x="138" y="31" width="54" height="55"/><rect x="245" y="34" width="54" height="25"/><rect x="26" y="123" width="38" height="38"/><rect x="143" y="123" width="49" height="38"/></g><path d="M0 205h325M0 198v14m325-14v14" stroke="#a1b68a" fill="none"/><text x="124" y="200" font-size="9" fill="#657d51" font-family="Arial">12 000 мм*</text><text x="25" y="78" font-size="9" fill="#6d825c" font-family="Arial">01 / ОФИС</text><text x="245" y="151" font-size="9" fill="#6d825c" font-family="Arial">02 / ХОЛЛ</text></g><text x="22" y="24" fill="#70845f" font-family="Arial" font-size="8" letter-spacing="1.2">ОБМЕРНЫЙ ПЛАН</text><text x="375" y="244" fill="#70845f" font-family="Arial" font-size="7">* Условный пример</text></svg>'},
  {title:'Как объяснить сложный объект участникам спора?', description:'Связываем вопрос эксперта с конкретным участком, сечением и исходными данными. Визуализация помогает понять исследование и проверить его логику.', result:'Сечения и иллюстрации к исследованию + ссылки на исходные данные + пояснения эксперта.', visual:svgStart+'<g transform="translate(90 25)"><rect x="70" y="10" width="210" height="220" rx="2" fill="#f8faef" stroke="#bccbab" transform="rotate(6 175 120)"/><rect x="40" y="0" width="210" height="220" rx="2" fill="#f8faef" stroke="#a5b992"/><text x="58" y="25" font-size="9" fill="#526d3f" font-family="Arial" letter-spacing="1">СЛОЙ / ИССЛЕДОВАНИЕ</text><path d="M58 37h172M58 167h120M58 179h172M58 191h154M58 203h90" stroke="#b7c8a6"/><path d="M77 140V81l56-25 78 25v59Z M77 81l78 25 56-25M155 106v34M77 111l78 25 56-25" fill="#e1e9d7" stroke="#8a9f78"/><path d="m72 120 147-24" stroke="#b79461" stroke-dasharray="3 3"/><circle cx="155" cy="107" r="5" fill="#d7e89f" stroke="#758f5a"/><path d="M155 107 276 79h32" stroke="#849b70" fill="none"/><rect x="269" y="67" width="82" height="22" rx="2" fill="#cbe38c"/><text x="280" y="81" font-size="8" fill="#526d3f" font-family="Arial">СЕЧЕНИЕ А–А</text></g><text x="22" y="24" fill="#70845f" font-family="Arial" font-size="8" letter-spacing="1.2">МАТЕРИАЛЫ ДЛЯ ЭКСПЕРТА</text></svg>'}
];
function selectCase(index, focus=false){
  const data=cases[index];
  $('#case-title').textContent=data.title;$('#case-description').textContent=data.description;$('#case-result').textContent=data.result;
  $('#case-label').textContent=`СЦЕНАРИЙ / 0${index+1}`;$('#case-visual').innerHTML=data.visual;
  $('#case-panel').setAttribute('aria-labelledby',`case-tab-${index}`);
  $$('[data-case]').forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
  const destinations=[['#service-compare','Состав работ по сравнению ↗'],['#service-measure','Что входит в обмеры ↗'],['sample-report.html','Посмотреть структуру отчёта ↗']];
  $('#case-link').href=destinations[index][0];$('#case-link').textContent=destinations[index][1];
  if(focus) $(`#case-tab-${index}`).focus();
}
$$('[data-case]').forEach(button=>{
  button.addEventListener('click',()=>selectCase(Number(button.dataset.case)));
  button.addEventListener('keydown',event=>{let next=Number(button.dataset.case);if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(next+1)%3;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(next+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();selectCase(next,true);});
});selectCase(0);

const artHead='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 250" aria-hidden="true"><defs><linearGradient id="body" x1="0" x2="1"><stop stop-color="#c4cec1"/><stop offset=".4" stop-color="#f8faf5"/><stop offset="1" stop-color="#9eaf9b"/></linearGradient><linearGradient id="metal" x1="0" x2="1"><stop stop-color="#52624f"/><stop offset=".5" stop-color="#758b70"/><stop offset="1" stop-color="#364932"/></linearGradient></defs><ellipse cx="150" cy="225" rx="70" ry="9" fill="#c1ccb7" opacity=".35"/>';
$('#scanner-leica').innerHTML=artHead+'<path d="m148 155-49 68m53-68 50 68m-51-68v78" stroke="#a7b29e" stroke-width="6"/><path d="m148 155-49 68m53-68 50 68m-51-68v78" stroke="#e2e8dc" stroke-width="2"/><ellipse cx="150" cy="146" rx="25" ry="8" fill="#899e7b"/><rect x="126" y="67" width="48" height="81" rx="13" fill="url(#body)" stroke="#adbaa4"/><path d="M126 88h48v31h-48" fill="#688d51"/><ellipse cx="150" cy="67" rx="24" ry="8" fill="#c9d5bf"/><circle cx="150" cy="87" r="18" fill="#66785e" stroke="#e6ebdf" stroke-width="4"/><circle cx="150" cy="87" r="10" fill="#1d3026"/><circle cx="150" cy="87" r="5" fill="#608577"/><circle cx="146" cy="83" r="2" fill="#b3d2c1"/><path d="M130 128h40" stroke="#b9c7af"/><rect x="135" y="130" width="30" height="8" rx="2" fill="#7d9270"/><path d="M120 82C80 74 80 109 120 105M181 82c38-8 38 27 0 23" stroke="#b8cba7" fill="none" stroke-dasharray="2 5"/></svg>';
$('#scanner-chc').innerHTML=artHead+'<path d="M139 141v61q0 16 18 16h29" stroke="#465e3c" stroke-width="17" fill="none"/><path d="M139 156v45q0 8 13 8" stroke="#8caa72" stroke-width="3" fill="none"/><rect x="112" y="82" width="76" height="72" rx="13" fill="url(#body)" stroke="#b1c1a6"/><path d="M112 99h76v23h-76" fill="#8db849"/><rect x="129" y="122" width="42" height="21" rx="3" fill="#364c37"/><path d="M134 127h32v11h-32" fill="#6f9d8b"/><ellipse cx="150" cy="82" rx="39" ry="11" fill="#7e9c61"/><path d="M125 80V50h50v30" fill="url(#metal)"/><ellipse cx="150" cy="50" rx="25" ry="8" fill="#c5d2b8"/><ellipse cx="150" cy="49" rx="18" ry="5" fill="#5a744b"/><path d="M111 62C59 51 59 93 111 82m79-20c49-11 49 31 0 20" stroke="#a6bd91" fill="none" stroke-dasharray="2 5"/></svg>';
$('#scanner-xgrids').innerHTML=artHead+'<path d="M135 149v62q0 12 14 12h29" stroke="#3a4a3b" stroke-width="16" fill="none"/><path d="m116 151 4-68 34-20 40 23-7 67-35 15Z" fill="url(#metal)" stroke="#82957a"/><path d="m120 83 34 21 40-18M154 104l-2 64" stroke="#90a384" fill="none"/><path d="M135 69V48q20-17 39 1v21" fill="#455a46" stroke="#91a186"/><ellipse cx="154" cy="48" rx="20" ry="7" fill="#71916a"/><circle cx="137" cy="117" r="12" fill="#263d31" stroke="#8b9f7f"/><circle cx="137" cy="117" r="6" fill="#537c6d"/><circle cx="134" cy="114" r="2" fill="#bad6bc"/><rect x="163" y="112" width="15" height="26" rx="3" fill="#1f3429"/><path d="M104 66C60 60 60 101 103 92m99-26c42-6 42 35 0 26" stroke="#a6bd91" fill="none" stroke-dasharray="2 5"/></svg>';

// This concept assembles a document locally. User input is never interpreted as markup.
let currentStep=1, briefText='', selectedPackage='Индивидуальный состав', downloadURL='';
function tasksSelected(){return $$('input[name="task"]:checked').map(el=>el.value);}
function updateScope(){
  const tasks=tasksSelected();
  $('#scope-summary').textContent=tasks.length?`${selectedPackage}: ${tasks.join(' · ')}`:'Состав работ пока не выбран';
}
function setStep(step){
  currentStep=step;
  $$('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==step);
  $$('[data-progress]').forEach(el=>{const active=Number(el.dataset.progress)===step;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  $('#form-status').textContent='';
  const heading=$(`#step-${step}-title`);heading.focus({preventScroll:true});
  const rect=heading.getBoundingClientRect();
  if(rect.top<header.offsetHeight+($('.section-nav')?.offsetHeight||0)+24||rect.bottom>innerHeight-48)heading.scrollIntoView({block:'start',behavior:preferredScrollBehavior()});
}
function fieldError(id,message){
  const el=$(`#${id}`),error=$(`#${id}-error`);error.textContent=message;error.hidden=!message;
  if(message)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid');
}
function validateObject(){
  const errors={
    'object-type':$('#object-type').value?'':'Выберите тип объекта.',
    area:!$('#area').value||Number.isFinite(Number($('#area').value))&&Number($('#area').value)>=1&&Number($('#area').value)<=10000000?'':'Укажите площадь от 1 до 10 000 000 м² или оставьте поле пустым.',
    city:$('#city').value.trim()?'':'Укажите город или населённый пункт.'
  };
  if($('#area').validity.badInput)errors.area='Укажите площадь числом или оставьте поле пустым.';
  Object.entries(errors).forEach(([id,message])=>fieldError(id,message));
  const first=Object.keys(errors).find(id=>errors[id]);
  if(first){if(currentStep!==1)setStep(1);$(`#${first}`).focus();return false;}return true;
}
['object-type','area','city'].forEach(id=>$(`#${id}`).addEventListener('input',()=>fieldError(id,'')));
function clearTaskError(){
  $('#task-error').hidden=true;$('#task-error').textContent='';$('#task-group').removeAttribute('aria-invalid');
  $$('input[name="task"],#comment').forEach(el=>el.removeAttribute('aria-invalid'));
}
$('#next-step').addEventListener('click',()=>{if(validateObject())setStep(2);});
$('#prev-step').addEventListener('click',()=>setStep(1));
$('#edit-brief').addEventListener('click',()=>setStep(1));
$('#change-scope').addEventListener('click',()=>setStep(2));
$$('input[name="task"]').forEach(input=>input.addEventListener('change',()=>{selectedPackage='Индивидуальный состав';updateScope();clearTaskError();}));
$('#comment').addEventListener('input',clearTaskError);
$$('[data-service]').forEach(link=>link.addEventListener('click',()=>{
  selectedPackage='Индивидуальный состав';
  $$('input[name="task"]').forEach(input=>input.checked=input.value===link.dataset.service);
  clearTaskError();updateScope();setStep(1);
}));
const packageTasks={'Геометрия':['3D-сканирование','Обмеры и документация'],'Аналитика':['3D-сканирование','Проект и факт'],'Экспертиза':['Строительная экспертиза']};
$$('[data-package]').forEach(link=>link.addEventListener('click',()=>{
  selectedPackage=link.dataset.package;
  $$('input[name="task"]').forEach(input=>input.checked=packageTasks[selectedPackage].includes(input.value));
  clearTaskError();updateScope();setStep(1);
}));
function createBriefList(rows){
  const dl=document.createElement('dl');
  rows.forEach(([label,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);});return dl;
}
$('#brief-form').addEventListener('submit',event=>{
  event.preventDefault();if(!validateObject())return;if(currentStep===1){setStep(2);return;}
  const tasks=tasksSelected(),comment=$('#comment').value.trim();
  if(!tasks.length&&!comment){
    $('#task-error').textContent='Выберите хотя бы одну задачу или опишите ваш вопрос ниже.';$('#task-error').hidden=false;
    $('#task-group').setAttribute('aria-invalid','true');$('input[name="task"]').setAttribute('aria-invalid','true');$('#comment').setAttribute('aria-invalid','true');$('input[name="task"]').focus();return;
  }
  clearTaskError();
  const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow'}).format(new Date());
  const rows=[['Дата',date],['Объект',$('#object-type').value],['Город',$('#city').value.trim()],['Площадь',$('#area').value?new Intl.NumberFormat('ru-RU').format(Number($('#area').value))+' м²':'Требует уточнения'],['Формат',selectedPackage],['Задачи',tasks.length?tasks.join('; '):'По описанию'],['Желаемый срок',$('#deadline').value],['Исходные документы',$('#documents').value],['Вопрос / вводные',comment||'Требуют обсуждения.']];
  const next='Направьте запрос экспертному партнёру МСК-Эксперт: info@sud-mskexpert.ru. Затем согласуйте возможность выполнения работ, исходные документы, программу, стоимость, сроки, состав выдачи и ответственного исполнителя.';
  const note='Бриф сформирован локально. Не отправлен и не является договором или заявкой, принятой в работу.';
  briefText=['СЛОЙ — бриф объекта','Концепция лаборатории МСК Эксперт × Технопарк РГСУ','',...rows.map(([label,value])=>`${label}: ${value}`),'',next,'',note].join('\n');
  $('#brief-result').replaceChildren(createBriefList(rows));$('#brief-preview').textContent=briefText;
  const title=document.createElement('h1');title.textContent='СЛОЙ — бриф объекта';
  const sub=document.createElement('p');sub.textContent='Концепция лаборатории МСК Эксперт × Технопарк РГСУ';
  const nextP=document.createElement('p');nextP.textContent=next;
  const noteP=document.createElement('p');noteP.textContent=note;
  $('#brief-print-area').replaceChildren(title,sub,createBriefList(rows),nextP,noteP);
  if(downloadURL)URL.revokeObjectURL(downloadURL);
  downloadURL=URL.createObjectURL(new Blob(['\uFEFF'+briefText],{type:'text/plain;charset=utf-8'}));$('#download-brief').href=downloadURL;
  setStep(3);
});
$('#download-brief').addEventListener('click',()=>{$('#form-status').textContent='Файл брифа подготовлен для скачивания.';});
$('#copy-brief').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(briefText);$('#form-status').textContent='Текст брифа скопирован.';}
  catch{$('#brief-raw').open=true;const range=document.createRange();range.selectNodeContents($('#brief-preview'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('#form-status').textContent='Текст выделен. Используйте команду «Копировать» вашего браузера.';}
});
$('#print-brief').addEventListener('click',()=>{document.body.classList.add('printing-brief');window.print();});
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-brief'));

let scene=null, sceneReady=false, transitioning=false;
let sceneState={mode:'points',section:55,playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,zoom:1};
const modeText={
  points:['Измерить. Сопоставить. Обосновать.','Цифровая фиксация видимой геометрии','Облако точек: цифровой слепок видимых поверхностей.'],
  model:['От облака точек — к структуре.','Условная модель существующего здания','Модель: структура и поверхности существующего здания.'],
  deviation:['Увидеть разницу. Понять масштаб.','Цветовая иллюстрация, не реальные измерения','Отклонения: условная цветовая карта различий с проектом.'],
  section:['Заглянуть внутрь геометрии.','Перемещайте плоскость сечения ползунком','Разрез: регулируйте высоту, чтобы увидеть внутреннюю геометрию.']
};
function syncMode(mode){
  $$('.viewer-modes [data-mode]').forEach(button=>{const active=button.dataset.mode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('#deviation-legend').hidden=mode!=='deviation';$('#section-control').hidden=mode!=='section';
  $('#scene-note-title').textContent=modeText[mode][0];$('#scene-note-sub').textContent=modeText[mode][1];$('#viewer-mode-description').textContent=modeText[mode][2];
}
function syncState(state){
  sceneState={...state};syncMode(state.mode);
  $('#section-range').value=state.section;$('#section-value').value=`${Math.round(state.section)}%`;
  $('#zoom-value').value=`${Math.round(state.zoom*100)}%`;
  $('#zoom-in').disabled=!sceneReady||state.zoom>=1.65;$('#zoom-out').disabled=!sceneReady||state.zoom<=.72;
  const button=$('#rotate-btn');button.setAttribute('aria-pressed',String(state.playing));button.setAttribute('aria-label',state.playing?'Приостановить анимацию':'Включить анимацию');button.title=state.playing?'Пауза анимации':'Включить анимацию';button.textContent=state.playing?'Ⅱ':'▷';
}
function setSceneControls(enabled){$$('.viewer-modes [data-mode],#rotate-btn,#reset-view,#zoom-in,#zoom-out,#section-range').forEach(el=>el.disabled=!enabled);}
function freshCanvas(){
  const original=$('#building-canvas'),replacement=original.cloneNode(false);
  replacement.removeAttribute('style');replacement.removeAttribute('data-webgl');replacement.removeAttribute('data-renderer');original.replaceWith(replacement);return replacement;
}
async function startScene(forceCanvas=false){
  if(transitioning)return;transitioning=true;
  const restore=scene?.getState?.()||{...sceneState};sceneReady=false;setSceneControls(false);
  $('#retry-scene').hidden=true;$('#scene-status').textContent=forceCanvas?'Восстанавливаем модель…':'Подготовка модели…';
  scene?.destroy();scene=null;
  const onReady=state=>{
    if(!state){if(sceneReady&&!transitioning){sceneReady=false;void startScene(true);}return;}
    sceneReady=true;
    $('.viewer-main').classList.remove('scene-unavailable');
    $('#scene-status').textContent=`${new Intl.NumberFormat('ru-RU').format(state.points)} точек · вращайте модель`;
  };
  const callbacks={onReady,onModeChange:syncMode,onStateChange:syncState};
  if(!forceCanvas){
    try{const {initScene}=await import('./scene.js?v=2');scene=initScene({canvas:freshCanvas(),...callbacks});}
    catch(error){console.info('Переход на совместимую 3D-сцену:',error.message);}
  }
  if(!sceneReady){
    scene?.destroy();scene=null;
    try{const {initFallbackScene}=await import('./scene-fallback.js?v=2');scene=initFallbackScene({canvas:freshCanvas(),...callbacks});}
    catch(error){console.warn('Не удалось открыть 3D-сцену:',error.message);}
  }
  if(sceneReady&&scene){
    scene.setMode(restore.mode);scene.setSection(restore.section);scene.setPlaying(restore.playing);scene.zoomBy(restore.zoom/scene.getState().zoom);
    setSceneControls(true);syncState(scene.getState());
  }else{
    scene?.destroy();scene=null;syncState(restore);
    $('.viewer-main').classList.add('scene-unavailable');$('#scene-status').textContent='Не удалось загрузить интерактивную модель.';$('#retry-scene').hidden=false;setSceneControls(false);
  }
  transitioning=false;
}
$$('.viewer-modes [data-mode]').forEach(button=>button.addEventListener('click',()=>scene?.setMode(button.dataset.mode)));
$('#rotate-btn').addEventListener('click',()=>scene?.toggleRotation());
$('#reset-view').addEventListener('click',()=>scene?.reset());
$('#zoom-in').addEventListener('click',()=>scene?.zoomBy(1.15));$('#zoom-out').addEventListener('click',()=>scene?.zoomBy(1/1.15));
$('#section-range').addEventListener('input',event=>scene?.setSection(event.target.value));
$('#retry-scene').addEventListener('click',()=>void startScene());
function setHelp(open){$('#viewer-help').setAttribute('aria-expanded',String(open));$('#viewer-help-panel').hidden=!open;if(open){$('#viewer-help-panel').tabIndex=-1;$('#viewer-help-panel').focus({preventScroll:true});$('#viewer-help-panel').scrollIntoView({block:'nearest',behavior:preferredScrollBehavior()});}}
$('#viewer-help').addEventListener('click',()=>setHelp($('#viewer-help-panel').hidden));
$('#close-help').addEventListener('click',()=>{setHelp(false);$('#viewer-help').focus();});
const viewer=$('#viewer'),dialog=$('#scene-dialog'),placeholder=document.createComment('3D viewer home');viewer.before(placeholder);
let savedOverflow='';
function closeViewer(){
  if(!dialog.open)return;
  dialog.close();viewer.classList.remove('expanded');placeholder.after(viewer);document.body.style.overflow=savedOverflow;
  $('#expand-view').setAttribute('aria-pressed','false');$('#expand-view').setAttribute('aria-label','Развернуть 3D-сцену');$('#expand-view').focus({preventScroll:true});requestAnimationFrame(()=>scene?.resize());
}
$('#expand-view').addEventListener('click',()=>{
  if(dialog.open){closeViewer();return;}
  savedOverflow=document.body.style.overflow;dialog.append(viewer);viewer.classList.add('expanded');dialog.showModal();document.body.style.overflow='hidden';
  $('#expand-view').setAttribute('aria-pressed','true');$('#expand-view').setAttribute('aria-label','Свернуть 3D-сцену');$('#building-canvas').focus({preventScroll:true});requestAnimationFrame(()=>scene?.resize());
});
dialog.addEventListener('cancel',event=>{event.preventDefault();closeViewer();});
dialog.addEventListener('click',event=>{if(event.target===dialog)closeViewer();});
syncState(sceneState);setSceneControls(false);

// Keep the brief responsive before loading the optional 3D engine. An explicit
// interaction starts immediately; merely approaching the viewer waits for idle.
let initialSceneStarted=false, sceneIdleHandle=null, sceneIdleUsesTimeout=false, sceneObserver=null;
function beginInitialScene(){
  if(initialSceneStarted)return;
  initialSceneStarted=true;
  sceneObserver?.disconnect();
  if(sceneIdleHandle!==null){
    if(sceneIdleUsesTimeout)clearTimeout(sceneIdleHandle);
    else window.cancelIdleCallback?.(sceneIdleHandle);
    sceneIdleHandle=null;
  }
  viewer.removeEventListener('pointerdown',beginInitialScene);
  viewer.removeEventListener('focusin',beginInitialScene);
  void startScene();
}
function queueInitialScene(){
  if(initialSceneStarted||sceneIdleHandle!==null)return;
  const run=()=>{sceneIdleHandle=null;beginInitialScene();};
  sceneIdleUsesTimeout=typeof window.requestIdleCallback!=='function';
  sceneIdleHandle=sceneIdleUsesTimeout?setTimeout(run,100):window.requestIdleCallback(run,{timeout:700});
}
viewer.addEventListener('pointerdown',beginInitialScene,{passive:true});
viewer.addEventListener('focusin',beginInitialScene);
if('IntersectionObserver' in window){
  sceneObserver=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting))queueInitialScene();
  },{rootMargin:'160px'});
  sceneObserver.observe(viewer);
}else queueInitialScene();

