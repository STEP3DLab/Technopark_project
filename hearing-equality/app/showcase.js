import './platform.js?v=0.10.0';
import { prepareDemoAssets, readDemoCacheStatus } from './demo-cache.js?v=0.10.0';

const api=window.hearingEquality;
const $=id=>document.getElementById(id);
let sequenceGeneration=0,sequenceActive=false,preparing=false,prepareController=null;
const guide=$('showcase-guide');
let guideReturn=null;
const catalog=api?.catalog()||[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function syncWords(){
  const state=api.state();
  for(const button of $('composer-words').children)button.setAttribute('aria-pressed',String(button.dataset.id===state.selected&&state.ready));
}
function sequenceUI(active,message){
  sequenceActive=active;
  $('showcase-start').disabled=active||!catalog.length;
  $('showcase-start').setAttribute('aria-pressed',String(active));
  $('showcase-start').querySelector('span').textContent=active?'Идёт автопоказ':'Автопоказ';
  $('showcase-stop').hidden=!active;
  if(message)$('showcase-status').textContent=message;
}
function stopSequence({pause=true,message='Автопоказ остановлен. Можно выбрать любой жест.'}={}){
  ++sequenceGeneration;
  if(pause)api?.pause();
  if(sequenceActive)sequenceUI(false,message);
}
async function runSequence(){
  if(!catalog.length||sequenceActive)return;
  const generation=++sequenceGeneration;
  api.mode('text');api.view('avatar');
  sequenceUI(true,'Загружаем первое движение…');
  try{
    for(let i=0;i<catalog.length;i++){
      if(generation!==sequenceGeneration)return;
      const item=catalog[i];
      const selected=await api.select(item.id,false);
      if(generation!==sequenceGeneration)return;
      if(!selected)throw new Error('Не удалось загрузить движение. Нажмите «Подготовить показ» и повторите.');
      syncWords();
      $('showcase-status').textContent=String(i+1).padStart(2,'0')+' / '+String(catalog.length).padStart(2,'0')+' · '+item.text;
      await wait(350);
      if(generation!==sequenceGeneration)return;
      await api.play();
      if(generation!==sequenceGeneration)return;
      if(!api.state().playing)throw new Error('Движение не запустилось. Выберите слово и нажмите воспроизведение.');
      const started=performance.now();
      while(api.state().playing){
        await wait(80);
        if(generation!==sequenceGeneration)return;
        if(performance.now()-started>25000)throw new Error('Показ остановлен: движение не завершилось вовремя.');
      }
      await wait(900);
    }
    if(generation===sequenceGeneration)sequenceUI(false,'Показ завершён: шесть отдельных слов. Можно повторить или сравнить с видео.');
  }catch(error){
    if(generation===sequenceGeneration){api.pause();sequenceUI(false,error.message);api.notify(error.message);}
  }
}

function showReadiness({cached=0,total=0,failed=[],offlineReady=false,needsReload=false,retained=false},loading=false){
  const panel=$('showcase-readiness');
  panel.hidden=false;panel.dataset.state=loading?'loading':offlineReady&&!retained?'ready':'partial';
  $('readiness-progress').hidden=!loading;
  $('readiness-progress').value=total?cached/total:0;
  if(loading)$('readiness-copy').textContent='Подготовка материалов · '+cached+' из '+total+'. Оставьте страницу открытой.';
  else if(offlineReady&&retained)$('readiness-copy').textContent='Ранее подготовленные материалы сохранены и доступны без сети. Обновление не завершилось: повторите при стабильном интернете.';
  else if(offlineReady)$('readiness-copy').textContent='Материалы показа готовы. Аватар, исходные видео и готовые координаты доступны без сети. Камера и голос проверяются отдельно.';
  else if(needsReload)$('readiness-copy').textContent='Материалы сохранены. Обновите страницу, чтобы включить автономный показ. Текущая история диалога при этом очистится.';
  else $('readiness-copy').textContent='Загружено '+cached+' из '+total+' материалов. '+(failed.length?'Часть загрузок не завершилась. ':'')+'Повторите подготовку при доступном интернете.';
  $('readiness-reload').hidden=!needsReload;
}
async function prepare(){
  if(preparing)return;
  if(!catalog.length){api?.notify('Словарь ещё не загружен. Обновите страницу при доступном интернете.');return;}
  stopSequence();api.stop();preparing=true;
  $('prepare-show').disabled=true;$('guide-prepare').disabled=true;
  $('prepare-show').querySelector('span').textContent='Подготовка…';
  prepareController=new AbortController();
  try{
    const result=await prepareDemoAssets(catalog,{signal:prepareController.signal,onProgress:progress=>showReadiness(progress,true)});
    showReadiness(result);
    $('guide-feedback').textContent=result.retained?'Ранее подготовленный показ сохранён. Обновление не завершилось; его можно повторить.':result.offlineReady?'Материалы готовы. Перед выступлением проверьте звук и камеру на устройстве.':result.needsReload?'Материалы загружены. Для автономного показа обновите страницу.':'Подготовка выполнена частично. Проверьте сообщение над рабочей областью и повторите.';
    $('prepare-show').querySelector('span').textContent=result.retained?'Обновить материалы':result.offlineReady?'Материалы готовы':'Повторить подготовку';
  }catch(error){
    if(error.name!=='AbortError'){
      showReadiness({cached:0,total:0,failed:[{reason:error.message}]});
      $('readiness-copy').textContent='Не удалось подготовить материалы. Проверьте интернет и повторите. Основные режимы приложения остаются доступны.';
      $('prepare-show').querySelector('span').textContent='Повторить подготовку';
    }
  }finally{preparing=false;prepareController=null;$('prepare-show').disabled=false;$('guide-prepare').disabled=false;}
}
function openGuide(){
  stopSequence();api.stop();guideReturn=document.activeElement;
  if(!guide.open)guide.showModal();
  $('close-guide').focus();
}
if(api){
  for(const item of catalog){
    const button=document.createElement('button');
    button.type='button';button.textContent=item.text;button.dataset.id=item.id;button.setAttribute('aria-pressed','false');
    button.onclick=()=>{stopSequence({pause:false});api.select(item.id,!matchMedia('(prefers-reduced-motion: reduce)').matches);};
    $('composer-words').append(button);
  }
  syncWords();sequenceUI(false);
  new MutationObserver(syncWords).observe($('active-word'),{childList:true,characterData:true,subtree:true});
  $('showcase-start').onclick=runSequence;
  $('showcase-stop').onclick=()=>stopSequence();
  $('prepare-show').onclick=prepare;
  $('guide-prepare').onclick=()=>{guide.close();prepare();};
  $('open-guide').onclick=openGuide;
  $('close-guide').onclick=()=>guide.close();
  guide.addEventListener('close',()=>guideReturn?.focus({preventScroll:true}));
  $('guide-start').onclick=()=>{guide.close();api.mode('text');api.select('question',false);$('workspace').scrollIntoView({block:'start'});};
  $('readiness-dismiss').onclick=()=>$('showcase-readiness').hidden=true;
  $('readiness-reload').onclick=()=>location.reload();
  $('copy-demo-link').onclick=async()=>{
    const link=new URL('./',location.href);
    link.hash='text';
    const selected=api.state().selected;
    if(selected)link.searchParams.set('word',selected);
    try{
      await navigator.clipboard.writeText(link.href);
      $('guide-feedback').textContent='Ссылка на выбранный жест скопирована.';
    }catch{
      $('guide-feedback').textContent='Ссылка для копирования: '+link.href;
    }
  };
  document.addEventListener('click',event=>{
    if(!sequenceActive)return;
    if(event.target.closest('[data-mode],#word-chips button,#text-form,#play,#replay,#timeline,#frame-prev,#frame-next,#show-avatar,#show-reference,#show-compare,#present,#avatar-focus,#open-guide')){
      stopSequence({pause:false,message:'Автопоказ остановлен: включено ручное управление.'});
    }
  },true);
  $('timeline').addEventListener('input',()=>stopSequence({pause:false}));
  document.addEventListener('keydown',event=>{
    if(event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.target.closest('input,textarea,select,button,summary,a,[contenteditable=true]'))return;
    const activeDialog=document.querySelector('dialog[open]');
    if(activeDialog&&activeDialog.id!=='avatar-focus-dialog')return;
    if(api.state().mode!=='text')return;
    const key=event.key.toLowerCase();
    if([' ','arrowleft','arrowright','f','а'].includes(key)){
      event.preventDefault();stopSequence({pause:false});
      if(key===' ')api.state().playing?api.pause():api.play();
      else if(key==='arrowleft')api.step(-1);
      else if(key==='arrowright')api.step(1);
      else api.focus();
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSequence({message:'Автопоказ остановлен: вкладка была скрыта.'});});
  window.addEventListener('hashchange',()=>stopSequence({pause:false}));
  window.addEventListener('pagehide',()=>{stopSequence();prepareController?.abort();});
  window.addEventListener('offline',()=>{
    if(!preparing)readDemoCacheStatus().then(status=>{if(status.offlineReady)showReadiness(status);else{showReadiness(status);$('readiness-copy').textContent='Сеть недоступна. Уже открытые движения можно просматривать; полный автономный показ ещё не подготовлен.';}}).catch(()=>{});
  });
  readDemoCacheStatus().then(status=>{if(status.offlineReady)showReadiness(status);}).catch(()=>{});
}
