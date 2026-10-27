const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];

const header = $('.header');
$('.menu-toggle').addEventListener('click', event => {
  const expanded = header.classList.toggle('menu-open');
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
  event.currentTarget.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
});
$$('.nav a').forEach(link => link.addEventListener('click', () => {
  header.classList.remove('menu-open');
  $('.menu-toggle').setAttribute('aria-expanded', 'false');
  $('.menu-toggle').setAttribute('aria-label', 'Открыть меню');
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

// The brief stays in memory. No analytics, network submission, storage, or fake success response.
let currentStep=1, briefText='', selectedPackage='Не выбран';
function setStep(step){currentStep=step;$$('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==step);$$('[data-progress]').forEach(el=>el.classList.toggle('active',Number(el.dataset.progress)===step));$('#form-status').textContent='';const heading=$(`[data-step="${step}"] h3`);heading.tabIndex=-1;heading.focus({preventScroll:true});}
function validateObject(){for(const el of [$('#object-type'),$('#area'),$('#city')])if(!el.reportValidity())return false;return true;}
$('#next-step').addEventListener('click',()=>{if(validateObject())setStep(2);});
$('#prev-step').addEventListener('click',()=>setStep(1));
$('#edit-brief').addEventListener('click',()=>setStep(1));
$$('[data-service]').forEach(link=>link.addEventListener('click',()=>{$$('input[name="task"]').forEach(input=>input.checked=input.value===link.dataset.service);if(currentStep===3)setStep(1);}));
$$('[data-package]').forEach(link=>link.addEventListener('click',()=>{selectedPackage=link.dataset.package;const mapping={'Геометрия':['3D-сканирование','Обмеры и документация'],'Аналитика':['3D-сканирование','Проект и факт'],'Экспертиза':['Строительная экспертиза']};$$('input[name="task"]').forEach(input=>input.checked=mapping[selectedPackage].includes(input.value));if(currentStep===3)setStep(1);}));
$('#brief-form').addEventListener('submit',event=>{
  event.preventDefault();if(currentStep===1){if(validateObject())setStep(2);return;}
  const tasks=$$('input[name="task"]:checked').map(el=>el.value);
  if(!tasks.length&&!$('#comment').value.trim()){$('#form-status').textContent='Выберите хотя бы одну задачу или опишите ваш вопрос.';return;}
  briefText=['СЛОЙ — бриф объекта','Концепция лаборатории МСК Эксперт × Технопарк РГСУ','',`Дата: ${new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow'}).format(new Date())}`,`Объект: ${$('#object-type').value}`,`Город: ${$('#city').value.trim()}`,`Площадь: ${$('#area').value?$('#area').value+' м²':'требует уточнения'}`,`Формат: ${selectedPackage}`,`Задачи: ${tasks.length?tasks.join('; '):'по описанию'}`,'','Вопрос / вводные:',$('#comment').value.trim()||'Требуют обсуждения.','','Для уточнения с командой:','— документы и доступ к объекту;','— требуемая точность и программа работ;','— сроки, форматы и состав выдачи;','— стоимость и ответственные специалисты.','','Бриф сформирован локально. Не отправлен и не является договором или заявкой, принятой в работу.'].join('\n');
  $('#brief-preview').textContent=briefText;setStep(3);
});
$('#download-brief').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['\uFEFF'+briefText],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='sloy-object-brief.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#form-status').textContent='Файл брифа подготовлен для скачивания.';});
$('#copy-brief').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(briefText);$('#form-status').textContent='Текст брифа скопирован.';}catch{const range=document.createRange();range.selectNodeContents($('#brief-preview'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('#form-status').textContent='Текст выделен. Используйте команду «Копировать» вашего браузера.';}});

let scene=null;
const modeText={points:['Измерить. Сопоставить. Обосновать.','Цифровая фиксация видимой геометрии'],model:['От облака точек — к структуре.','Условная модель существующего здания'],deviation:['Увидеть разницу. Понять масштаб.','Цветовая иллюстрация, не реальные измерения'],section:['Заглянуть внутрь геометрии.','Перемещайте плоскость сечения ползунком']};
function syncMode(mode){$$('.viewer-modes [data-mode]').forEach(button=>{const active=button.dataset.mode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});$('#deviation-legend').hidden=mode!=='deviation';$('#section-control').hidden=mode!=='section';$('#scene-note-title').textContent=modeText[mode][0];$('#scene-note-sub').textContent=modeText[mode][1];}
function sceneUnavailable(){document.querySelector('.viewer-main').classList.add('scene-unavailable');$('#scene-status').textContent='Схематичная модель · WebGL недоступен';$$('.viewer-modes [data-mode],#rotate-btn,#reset-view').forEach(button=>button.disabled=true);}
let sceneReady=false;
function onSceneReady(state){
  if(!state)return;
  sceneReady=true;
  document.querySelector('.viewer-main').classList.remove('scene-unavailable');
  $('#scene-status').textContent=`${new Intl.NumberFormat('ru-RU').format(state.points)} точек · вращайте модель`;
}
try{
  const {initScene}=await import('./scene.js');
  scene=initScene({canvas:$('#building-canvas'),onReady:onSceneReady,onModeChange:syncMode});
}catch(error){console.info('Переход на резервный 3D-режим:',error.message);}
if(!sceneReady){
  try{
    scene?.destroy();
    const original=$('#building-canvas');
    const replacement=original.cloneNode(false);
    replacement.removeAttribute('style');replacement.removeAttribute('data-webgl');
    original.replaceWith(replacement);
    const {initFallbackScene}=await import('./scene-fallback.js');
    scene=initFallbackScene({canvas:replacement,onReady:onSceneReady,onModeChange:syncMode});
  }catch(error){console.warn('Резервная сцена недоступна:',error.message);}
}
if(sceneReady)scene.setSection(55);else sceneUnavailable();
$$('.viewer-modes [data-mode]').forEach(button=>button.addEventListener('click',()=>scene?.setMode(button.dataset.mode)));
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function syncRotation(active){$('#rotate-btn').setAttribute('aria-pressed',String(active));$('#rotate-btn').setAttribute('aria-label',active?'Приостановить вращение':'Включить вращение');$('#rotate-btn').textContent=active?'Ⅱ':'▷';}
syncRotation(!reduceMotion);
$('#rotate-btn').addEventListener('click',()=>syncRotation(scene?.toggleRotation()??false));
$('#reset-view').addEventListener('click',()=>{scene?.reset();scene?.setSection(55);$('#section-range').value=55;$('#section-value').value='55%';});
$('#section-range').addEventListener('input',event=>{scene?.setSection(event.target.value);$('#section-value').value=event.target.value+'%';});
function expandViewer(force){const viewer=$('#viewer');const expanded=typeof force==='boolean'?force:!viewer.classList.contains('expanded');viewer.classList.toggle('expanded',expanded);$('#expand-view').setAttribute('aria-pressed',String(expanded));$('#expand-view').setAttribute('aria-label',expanded?'Свернуть 3D-сцену':'Развернуть 3D-сцену');document.body.style.overflow=expanded?'hidden':'';requestAnimationFrame(()=>scene?.resize());if(!expanded)$('#expand-view').focus({preventScroll:true});}
$('#expand-view').addEventListener('click',()=>expandViewer());
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if($('#viewer').classList.contains('expanded'))expandViewer(false);if(header.classList.contains('menu-open'))$('.menu-toggle').click();}if(event.key==='Tab'&&$('#viewer').classList.contains('expanded')){const focusable=$$('button:not(:disabled),canvas,input:not([hidden])',$('#viewer')).filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
