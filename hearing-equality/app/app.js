import { initUI,setItems,setSelection,setPlayback,setMessage,setReady,setMode } from './ui.js';
import { createCatalog,matchText,validateMotion } from './catalog.js';
import { CanvasAvatar } from './canvas-avatar.js';

const video=document.getElementById('reference-video');
const cache=new Map();
const state={catalog:[],item:null,data:null,time:0,playing:false,speed:1,mode:'avatar',last:0,loadId:0,playId:0,raf:0,failedVideo:false};
let avatar;
try{avatar=new CanvasAvatar(document.getElementById('avatar-stage'));}
catch(error){console.warn('Canvas unavailable',error);state.mode='reference';setMode('reference');document.getElementById('mode-avatar').disabled=true;}

function update(){
  if(!state.data)return;
  avatar?.showAt(state.time);
  setPlayback({playing:state.playing,time:state.time,duration:state.data.duration,progress:state.time/state.data.duration});
}
function tick(now){
  state.raf=0;
  if(!state.playing||!state.data)return;
  if(state.mode==='reference'&&!video.paused&&!video.seeking)state.time=Math.min(state.data.duration,video.currentTime);
  else if(state.mode==='avatar')state.time+=Math.min((now-state.last)/1000,.1)*state.speed;
  state.last=now;
  if(state.time>=state.data.duration){state.time=state.data.duration;pause();}
  update();
  if(state.playing)state.raf=requestAnimationFrame(tick);
}
function pause(){++state.playId;state.playing=false;video.pause();if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;update();}
async function play(){
  if(!state.data)return;
  if(state.time>=state.data.duration-.025)state.time=0;
  state.playing=true;state.last=performance.now();
  const playId=++state.playId,loadId=state.loadId,mode=state.mode;
  const current=()=>playId===state.playId&&loadId===state.loadId&&mode===state.mode&&state.playing&&state.data;
  update();
  if(state.mode==='reference'){
    video.currentTime=Math.min(state.time,video.duration||state.data.duration);video.playbackRate=state.speed;
    try{await video.play();}catch{if(!current())return;pause();setMessage('Исходное видео не удалось запустить. Попробуйте повторить или включите аватар.','error');return;}
  }
  if(!current())return;
  if(!state.raf)state.raf=requestAnimationFrame(tick);
  update();
}
function seek(ratio){
  if(!state.data)return;
  state.time=Math.max(0,Math.min(1,ratio))*state.data.duration;
  if(video.readyState>=1)video.currentTime=Math.min(state.time,video.duration||state.data.duration);
  state.last=performance.now();update();
}
async function select(id,autoplay=true){
  const item=state.catalog.find(x=>x.id===id);if(!item)return;
  const token=++state.loadId;pause();state.item=null;state.data=null;state.failedVideo=false;
  setReady(false,'Загружаем запись и движение');
  setSelection({...item,sourceUrl:new URL(item.video,document.baseURI).href});
  setMessage('');
  try{
    let data=cache.get(id);
    if(!data){const response=await fetch(item.motion);if(!response.ok)throw new Error('Файл движения недоступен');data=validateMotion(await response.json());cache.set(id,data);}
    if(token!==state.loadId)return;
    state.item=item;state.data=data;state.time=0;
    video.src=item.video;video.muted=true;video.load();
    avatar?.load(data);setReady(true);update();
    if(!avatar)setMessage('На этом устройстве визуализация недоступна. Показываем исходную запись.','info');
    else setMessage('Движение взято из записи Slovo. Аватар 2D; понятность ещё предстоит проверить с носителями РЖЯ.','info');
    if(autoplay)await play();
  }catch(error){
    if(token!==state.loadId)return;
    setReady(false,'Не удалось загрузить движение');
    setMessage('Файл движения недоступен. Проверьте соединение и выберите слово ещё раз.','error');
    console.error(error);
  }
}
function submit(text){
  const item=matchText(text,state.catalog);
  if(item){select(item.id);return;}
  ++state.loadId;pause();state.item=null;state.data=null;
  setPlayback({playing:false,time:0,duration:0,progress:0});
  video.removeAttribute('src');video.load();
  avatar?.clear();
  setSelection({text:'Запись не найдена',status:'Для этого текста нет подготовленного движения'});
  setReady(false,'Нет подготовленного движения');
  setMessage(text?'В словаре нет точного соответствия этому тексту. Выберите одно из шести слов. Предложения и отрицания автоматически не сокращаются.':'Введите слово или выберите пример ниже.','warning');
}
initUI({
  onSubmit:submit,onSelect:id=>select(id),
  onPlayPause:()=>state.playing?pause():play(),
  onReplay:()=>{pause();seek(0);play();},
  onSpeed:speed=>{if([.5,.75,1].includes(speed)){state.speed=speed;video.playbackRate=speed;state.last=performance.now();}},
  onScrub:seek,
  onMode:mode=>{
    const wasPlaying=state.playing;pause();state.mode=mode;setMode(mode);
    if(video.readyState>=1)video.currentTime=Math.min(state.time,video.duration||state.time);
    avatar?.resize();update();if(wasPlaying)play();
  },
});
video.addEventListener('ended',()=>{if(state.mode==='reference'&&state.data){state.time=state.data.duration;pause();}});
video.addEventListener('error',()=>{
  if(!state.item||!video.getAttribute('src'))return;
  state.failedVideo=true;
  if(state.mode==='reference'){pause();setMessage('Исходное видео не загрузилось. Данные аватара доступны отдельно; попробуйте переключить режим.','error');}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('resize',()=>avatar?.resize());

try{
  const response=await fetch('./assets/sources/slovo-sources.json');
  if(!response.ok)throw new Error('Словарь недоступен');
  const manifest=await response.json();state.catalog=createCatalog(manifest.samples);setItems(state.catalog);
  // Initial state is still: no unsolicited motion and no invisible autoplay.
  await select(state.catalog[0].id,false);
}catch(error){setReady(false,'Не удалось открыть демонстратор');setMessage('Не удалось загрузить словарь. Откройте сайт через HTTP(S) и обновите страницу.','error');console.error(error);}
