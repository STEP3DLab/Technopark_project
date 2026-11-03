'use strict';
const kinds={question:'Вопрос',change:'Исправление',decision:'Решение'},journalKey='mobot-timed-review-v1';
const filmVersions={annotated:{src:'assets/mobot-route.mp4?v=20261103-review6',name:'Mobot_two_point_route_52s.mp4'},presentation:{src:'assets/mobot-presentation.mp4?v=20261103-review6',name:'Mobot_presentation_52s.mp4'}};
let moments=[],editingId=null,noteTime=0,deletedMoment=null,undoTimer=null,presenting=false,switchingFilm=false,confirmedFilm='annotated';
function validMoment(v){return v&&typeof v.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v.id)&&Number.isFinite(v.time)&&v.time>=0&&v.time<52&&Object.hasOwn(kinds,v.kind)&&typeof v.text==='string'&&v.text.trim().length>0&&v.text.length<=3000;}
try{const stored=JSON.parse(localStorage.getItem(journalKey)||'[]');if(Array.isArray(stored))moments=stored.filter(validMoment).slice(0,200);}catch{}
function persistMoments(){try{localStorage.setItem(journalKey,JSON.stringify(moments));}catch{toast('Сохранение недоступно. Скачайте резервную копию.');}}
function makeButton(text,action,className='text-button'){const b=document.createElement('button');b.type='button';b.className=className;b.textContent=text;b.addEventListener('click',action);return b;}
function renderJournal(){const root=$('momentList');root.replaceChildren();$('journalEmpty').hidden=moments.length>0;for(const m of [...moments].sort((a,b)=>a.time-b.time)){const card=document.createElement('article');card.className='moment-entry';const head=document.createElement('div');head.className='moment-entry-head';head.append(makeButton(framecode(m.time),()=>{seek(m.time);$('viewer').scrollIntoView({behavior:'smooth'});},'moment-timestamp'));const type=document.createElement('span');type.className='moment-kind';type.textContent=kinds[m.kind];head.append(type,makeButton('Изменить',()=>openMoment(m)),makeButton('Удалить',()=>deleteMoment(m.id)));const text=document.createElement('p');text.textContent=m.text;card.append(head,text);root.append(card);}updateNotesCount();}
function openMoment(m=null){if($('presentationToggle').disabled){toast('Видео загружается. Дождитесь смены версии.');return;}video.pause();editingId=m?.id||null;noteTime=m?.time??frameTime(video.currentTime||0);$('momentTime').textContent=framecode(noteTime);$('momentTitle').textContent=m?'Изменить замечание':'Что нужно уточнить?';$('momentKind').value=m?.kind||'question';$('momentText').value=m?.text||'';$('momentDialog').showModal();$('momentText').focus();}
$('addMoment').addEventListener('click',()=>openMoment());$('addMomentBelow').addEventListener('click',()=>openMoment());$('closeMoment').addEventListener('click',()=>$('momentDialog').close());
$('momentForm').addEventListener('submit',e=>{e.preventDefault();const text=$('momentText').value.trim();if(!text){$('momentText').focus();return;}if(!editingId&&moments.length>=200){toast('Достигнут предел 200 записей. Сохраните резервную копию.');return;}const index=moments.findIndex(m=>m.id===editingId);const record={...(index>=0?moments[index]:{}),id:editingId||newMomentId(),time:noteTime,kind:$('momentKind').value,text,updatedAt:new Date().toISOString()};if(index>=0)moments[index]=record;else moments.push(record);persistMoments();renderJournal();$('momentDialog').close();toast('Замечание сохранено: '+framecode(noteTime));});
function deleteMoment(id){const index=moments.findIndex(m=>m.id===id);if(index<0)return;deletedMoment=moments[index];moments.splice(index,1);persistMoments();renderJournal();$('undoBar').hidden=false;clearTimeout(undoTimer);undoTimer=setTimeout(()=>{$('undoBar').hidden=true;deletedMoment=null;},12000);}
$('undoDelete').addEventListener('click',()=>{if(deletedMoment){if(!moments.some(m=>m.id===deletedMoment.id)&&moments.length<200)moments.push(deletedMoment);deletedMoment=null;persistMoments();renderJournal();}clearTimeout(undoTimer);$('undoBar').hidden=true;});
function downloadFile(contents,type,name){const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function downloadReviewNotes(){const lines=['МОБОТ — замечания к рабочей реконструкции','Видео: 52 с, 30 кадров/с. Время записано как минуты:секунды:кадры.','',...Object.entries(reviewData).flatMap(([k,d])=>[d.title,d.question,notes[k]||'Замечание не заполнено.','']),'ЗАМЕЧАНИЯ К КАДРАМ','',...([...moments].sort((a,b)=>a.time-b.time).flatMap(m=>[`${framecode(m.time)} · ${kinds[m.kind]}`,m.text,'']))];if(!moments.length)lines.push('Замечаний к кадрам пока нет.');downloadFile('\uFEFF'+lines.join('\n'),'text/plain;charset=utf-8','Mobot_review_notes.txt');toast('Скачан общий файл замечаний.');}
$('exportBackup').addEventListener('click',()=>{downloadFile(JSON.stringify({format:'mobot-review',version:1,createdAt:new Date().toISOString(),general:notes,moments},null,2),'application/json','Mobot_review_backup.json');});
$('importBackup').addEventListener('click',()=>$('backupFile').click());
function newMomentId(){let id;do{id=crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}while(moments.some(m=>m.id===id));return id;}
function copyImportedMoment(m){const record={id:m.id,time:m.time,kind:m.kind,text:m.text};if(typeof m.updatedAt==='string'&&m.updatedAt.length<=40&&Number.isFinite(Date.parse(m.updatedAt)))record.updatedAt=m.updatedAt;if(typeof m.importedFrom==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(m.importedFrom))record.importedFrom=m.importedFrom;return record;}
function sameMomentContent(a,b){return a.time===b.time&&a.kind===b.kind&&a.text===b.text;}
function mergeImportedMoments(incoming){const result={added:0,variants:0,duplicates:0,skipped:0};for(const original of incoming){const m=copyImportedMoment(original),sourceId=m.importedFrom||m.id;const duplicate=moments.some(existing=>(existing.id===m.id||(existing.importedFrom||existing.id)===sourceId)&&sameMomentContent(existing,m));if(duplicate){result.duplicates++;continue;}if(moments.length>=200){result.skipped++;continue;}if(moments.some(existing=>existing.id===m.id)){m.id=newMomentId();m.importedFrom=sourceId;}if(m.importedFrom)result.variants++;moments.push(m);result.added++;}return result;}
function showImportStatus(message){$('importStatus').textContent=message;toast(message);}
$('backupFile').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>2*1024*1024)throw Error('size');const data=JSON.parse(await file.text());
  if(data.format!=='mobot-review'||data.version!==1||!Array.isArray(data.moments)||data.moments.length>200||!data.moments.every(validMoment))throw Error('format');
  const result=mergeImportedMoments(data.moments);let generalAdded=0,generalConflicts=0,generalSkipped=0;
  if(data.general&&typeof data.general==='object')for(const key of Object.keys(reviewData)){
   const incoming=data.general[key];if(typeof incoming!=='string'||!incoming.trim())continue;
   const current=typeof notes[key]==='string'?notes[key]:'';
   if(current===incoming)continue;
   if(current.trim()){generalConflicts++;continue;}
   if(incoming.length>10000){generalSkipped++;continue;}
   notes[key]=incoming;generalAdded++;
  }
  let storageFailed=false;try{localStorage.setItem(storageKey,JSON.stringify(notes));localStorage.setItem(journalKey,JSON.stringify(moments));}catch{storageFailed=true;}
  renderJournal();updateNotesCount();
  showImportStatus(`Добавлено записей: ${result.added}, из них отдельных вариантов: ${result.variants}. Точных дублей пропущено: ${result.duplicates}. Общих замечаний добавлено: ${generalAdded}; конфликтов оставлено без переноса: ${generalConflicts}. Не перенесено из-за ограничений: ${result.skipped+generalSkipped}.`+(storageFailed?' Сохранение в браузере недоступно — скачайте резервную копию.':''));
 }catch{showImportStatus('Не удалось прочитать резервную копию МОБОТ. Проверьте JSON-файл.');}
 finally{e.target.value='';}
});

function setMapState(){const t=video.currentTime||0;for(const b of document.querySelectorAll('[data-map-point]')){const active=b.dataset.mapPoint==='point1'?t>=8&&t<21:t>=26&&t<40;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}}
document.querySelectorAll('[data-map-point]').forEach(b=>{const activate=()=>{const id=b.dataset.mapPoint;$('loopChoice').value=id;seek(id==='point1'?14.5:32.5);};b.addEventListener('click',activate);b.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();activate();}});});video.addEventListener('timeupdate',setMapState);video.addEventListener('seeked',setMapState);

function syncFilmControls(){const version=filmVersions[confirmedFilm];$('labelsToggle').checked=confirmedFilm==='annotated';document.querySelectorAll('[data-current-download]').forEach(a=>{a.href=version.src;a.download=version.name;});}
function loadFilmSource(version){return new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail);};const done=()=>{cleanup();resolve();};const fail=()=>{cleanup();reject(Error('load'));};video.addEventListener('loadedmetadata',done);video.addEventListener('error',fail);timer=setTimeout(fail,20000);video.src=filmVersions[version].src;video.load();});}
async function switchFilm(withLabels){
 if(switchingFilm)return;
 switchingFilm=true;$('labelsToggle').disabled=true;$('presentationToggle').disabled=true;
 const previous=confirmedFilm,next=withLabels?'annotated':'presentation',t=video.currentTime||0,playing=!video.paused,rate=video.playbackRate;
 const restorePosition=()=>{video.playbackRate=rate;video.currentTime=frameTime(t);sync(video.currentTime);};
 setLoop(false);video.pause();let loaded=false;
 try{await loadFilmSource(next);confirmedFilm=next;restorePosition();loaded=true;}
 catch{
  try{await loadFilmSource(previous);confirmedFilm=previous;restorePosition();loaded=true;toast('Выбранная версия не загрузилась. Восстановлена предыдущая.');}
  catch{toast('Видео не загрузилось. Скачайте предыдущую версию по ссылке.');}
 }
 finally{syncFilmControls();switchingFilm=false;$('labelsToggle').disabled=false;$('presentationToggle').disabled=false;updatePlay();}
 if(loaded&&playing){try{await video.play();}catch{toast('Версия загружена. Нажмите кнопку воспроизведения.');}}
}
$('labelsToggle').addEventListener('change',e=>switchFilm(e.target.checked));
function fitPresentationCanvas(){if(presenting&&!document.fullscreenElement){const w=Math.min(media.clientWidth,media.clientHeight*4/3);Object.assign(canvas.style,{width:w+'px',height:w*.75+'px',left:'50%',top:'50%',transform:'translate(-50%,-50%)'});}else{for(const p of ['width','height','left','top','transform'])canvas.style.removeProperty(p);}alignSplit();}
function setPresentation(enabled){if(switchingFilm)return;presenting=enabled;document.body.classList.toggle('presentation',enabled);$('presentationToggle').setAttribute('aria-pressed',String(enabled));$('presentationToggle').textContent=enabled?'Вернуться к разбору':'Режим показа';if(enabled){setMode('film');if(confirmedFilm==='annotated')switchFilm(false);}fitPresentationCanvas();}
$('presentationToggle').addEventListener('click',()=>setPresentation(!presenting));new ResizeObserver(fitPresentationCanvas).observe(media);document.addEventListener('fullscreenchange',fitPresentationCanvas);document.addEventListener('keydown',e=>{if(e.code==='Escape'&&presenting&&!document.querySelector('dialog[open]'))setPresentation(false);});
renderJournal();setMapState();syncFilmControls();
