import {MASK} from './tracker.js';
import {fit,compose,perspective,translate,rx,ry,rz,renderer,projector,clamp} from './graphics.js';
import {live,startCamera,stopCamera} from './camera.js';
import {roomIsOpen,startRoom,supportsRoom} from './room.js';

const $=id=>document.getElementById(id);
const dialog=$('info'),model=$('model'),env=matchMedia('(prefers-reduced-motion: reduce)');
const hooks={color:()=>color,chime};
let color='violet',audio=null,sound=false,roomSupported=null,photoUrl=null,knownPhotos=new Set(),toastTimer;
try{const stored=localStorage.getItem('invader-color');if(['violet','cyan','amber'].includes(stored))color=stored;}catch{}
function syncColor(){
  document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function chime(type){
  if(!sound||!audio)return;
  try{
    audio.resume().catch(()=>{});
    const tones={lock:[294,440,660],pulse:[220,440,880,660],snap:[610,480],on:[330,495],color:[420]};
    (tones[type]||tones.color).forEach((f,i)=>{
      const osc=audio.createOscillator(),gain=audio.createGain(),s=audio.currentTime+i*.066;
      osc.type='sine';osc.frequency.setValueAtTime(f,s);gain.gain.setValueAtTime(.0001,s);gain.gain.exponentialRampToValueAtTime(.065,s+.012);gain.gain.exponentialRampToValueAtTime(.0001,s+.16);
      osc.connect(gain);gain.connect(audio.destination);osc.start(s);osc.stop(s+.18);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    });
  }catch{}
}
$('soundButton').onclick=()=>{
  if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){toast('Браузер не поддерживает звук');return;}audio=new Audio();}
  sound=!sound;const b=$('soundButton');
  b.querySelector('use').setAttribute('href',sound?'#sound':'#mute');b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',sound?'Выключить звук':'Включить звук');
  chime('on');
};
function showDialog(kicker,title,body){
  $('dialogKicker').textContent=kicker;$('dialogBody').innerHTML='<h2>'+title+'</h2>'+body;
  if(!dialog.open)dialog.showModal();$('dialogClose').focus({preventScroll:true});
}
const button=(id,label,secondary=false)=>'<button id="'+id+'" class="'+(secondary?'secondary':'primary')+'">'+label+'</button>';
const linkCards='<a class="secondary" href="./cards.html" target="_blank" rel="noopener">Открыть лист для печати ↗</a>';
$('dialogClose').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}};
function explain(){
  showDialog('Руководство','Первый контакт','<ol><li>Открой сканер и разреши доступ к задней камере.</li><li>Наведи её на татуировку при ровном свете. Оба глаза и весь силуэт должны попасть в кадр.</li><li>Когда захватчик появится, включи импульс, сделай снимок или нажми «В комнату».</li></ol>'+button('guideScan','Запустить сканер')+button('guideMask','Показать рисунок-триггер',true)+button('guidePhoto','Проверить своё фото',true));
  $('guideScan').onclick=()=>openCamera('tattoo');$('guideMask').onclick=showMask;$('guidePhoto').onclick=pickPhoto;
}
function showMask(){
  showDialog('Триггер сканера','Пиксельный оригинал','<p>Открой этот рисунок на втором экране и наведи на него сканер с телефона.</p><canvas style="display:block;width:min(100%,310px);height:auto;margin:14px auto;image-rendering:pixelated;border-radius:5px" id="original"></canvas>'+button('guideBack','К инструкции',true));
  const canvas=$('original');canvas.width=150;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,150,120);ctx.fillStyle='#18151d';MASK.forEach((r,y)=>[...r].forEach((p,x)=>{if(p==='1')ctx.fillRect((x+2)*10,(y+2)*10,10,10);}));
  $('guideBack').onclick=explain;
}
function stations(){
  showDialog('Привязка к меткам','Станции с метками','<p>Положи четыре карточки в разных местах. На каждой появится свой захватчик. Оставь карточки на месте, и при следующем запуске найдёшь их снова.</p><p class="dialog-note">Карточки можно распечатать на А4 или открыть на втором экране. Наводи камеру так, чтобы было видно белое поле вокруг квадрата.</p>'+button('stationsScan','Сканировать метки')+linkCards);
  $('stationsScan').onclick=()=>openCamera('beacons');
}
function roomDialog(){
  const available=roomSupported;
  const text=available===false?'<p>Этот браузер не открыл пространственный режим WebXR. Чтобы закрепить захватчиков в комнате здесь, положи карточки на разные поверхности и открой сканер меток.</p><p class="dialog-note">Свободная расстановка по касанию доступна в Chrome на совместимом Android-устройстве с ARCore.</p>':'<p>Медленно проведи камерой над освещённым полом или столом. Когда появится кольцо, коснись экрана, чтобы установить захватчика. Обойди его и добавь следующего.</p><p class="dialog-note">До 18 фигур за один сеанс. Для повторного визита используй станции с метками.</p>';
  showDialog('Пространственный режим','AR-комната',text+(available===false?'':button('enterXR','Открыть AR-комнату'))+button('xrCards','Станции с метками',available!==false));
  if($('enterXR'))$('enterXR').onclick=()=>{dialog.close();startRoom({...hooks,error:xrError,ended:()=>{}});};
  $('xrCards').onclick=stations;
}
function xrError(error){
  const message=error==='NotAllowedError'?'Для расстановки нужен доступ к камере и пространственному отслеживанию. Разреши их в настройках браузера и открой комнату ещё раз.':'Телефон не смог запустить поиск поверхности. Попробуй Chrome на Android с ARCore или используй станции с метками.';
  showDialog('AR-комната','Сеанс не начался','<p>'+message+'</p>'+button('xrRetry','Вернуться к запуску')+button('xrFallback','Станции с метками',true));$('xrRetry').onclick=roomDialog;$('xrFallback').onclick=stations;
}
function cameraError(error,kind){
  const messages={NotAllowedError:'Разреши доступ к камере в настройках сайта и попробуй ещё раз. Если ссылка открыта внутри мессенджера, открой её в обычном браузере.',NotReadableError:'Закрой приложение, которое использует камеру, и попробуй снова.',NotFoundError:'Камера не найдена. Открой сайт на телефоне или выбери фотографию татуировки.',NotSupportedError:'Для камеры нужен современный браузер и HTTPS. Открой ссылку в Chrome или Safari.'};
  showDialog('Доступ к камере','Камера недоступна','<p>'+(messages[error]||'Не удалось получить изображение. Проверь разрешения и попробуй ещё раз.')+'</p>'+button('retryCamera','Повторить')+button('importInstead','Открыть фото татуировки',true));
  $('retryCamera').onclick=()=>openCamera(kind);$('importInstead').onclick=pickPhoto;
}
function releasePhoto(){if(photoUrl){URL.revokeObjectURL(photoUrl);knownPhotos.delete(photoUrl);photoUrl=null;}}
function closeLive(){stopCamera();releasePhoto();}
function openCamera(kind){
  if(dialog.open)dialog.close();closeLive();startCamera(kind,{...hooks,error:cameraError});
}
function pickPhoto(){$('choosePhoto').value='';$('choosePhoto').click();}
$('choosePhoto').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  closeLive();const url=URL.createObjectURL(file);knownPhotos.add(url);
  const img=new Image();img.src=url;
  try{await img.decode();if(!knownPhotos.has(url))return;photoUrl=url;if(dialog.open)dialog.close();await startCamera('tattoo',{...hooks,error:cameraError},{image:img,url});}
  catch{URL.revokeObjectURL(url);knownPhotos.delete(url);toast('Не удалось прочитать файл. Выбери фотографию JPEG или PNG.');}
};
$('startScan').onclick=()=>openCamera('tattoo');$('helpButton').onclick=explain;$('beaconButton').onclick=stations;
$('roomButton').onclick=roomDialog;$('liveClose').onclick=closeLive;$('transfer').onclick=()=>{closeLive();roomDialog();};
supportsRoom().then(ok=>{roomSupported=ok;});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&live())closeLive();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&live())closeLive();});
window.addEventListener('pagehide',()=>{if(live())closeLive();});
let yaw=-.46,pitch=.14,zRotation=-.055,drag=null,action=0,born=performance.now()/1000-.15;
function interact(){action=performance.now()/1000;}
model.onpointerdown=e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};model.setPointerCapture(e.pointerId);interact();};
model.onpointermove=e=>{if(drag?.id===e.pointerId){yaw+=(e.clientX-drag.x)*.014;pitch=clamp(pitch+(e.clientY-drag.y)*.009,-1.05,1.05);drag.x=e.clientX;drag.y=e.clientY;interact();}};
model.onpointerup=model.onpointercancel=()=>{drag=null;};
model.onkeydown=e=>{const d={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]}[e.key];if(!d)return;e.preventDefault();yaw+=d[0];pitch=clamp(pitch+d[1],-1.05,1.05);interact();};
$('resetView').onclick=()=>{yaw=-.46;pitch=.14;zRotation=-.055;born=performance.now()/1000;interact();chime('pulse');};
syncColor();document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color;try{localStorage.setItem('invader-color',color);}catch{}syncColor();chime('color');});
const scene=renderer(model);let last=0,visible=true;
if(window.IntersectionObserver)new IntersectionObserver(entries=>visible=entries[0].isIntersecting).observe(model);
function animate(ms){
  requestAnimationFrame(animate);
  if(document.hidden||!visible||live()||roomIsOpen()||ms-last<32)return;last=ms;
  const now=ms/1000,t=env.matches?0:now;
  const {w,h}=fit(model,1.8),f=h*1.65,size=Math.min(w*.54,h*.80),depth=f/size;
  const wobble=env.matches?0:.094*Math.sin(t*.48)*clamp((now-action-1)*.5,0,1);
  const m=compose(perspective(w,h,f),translate(0,(.048+.012*Math.sin(t*1.45))*h/size,-depth),rz(zRotation),rx(pitch),ry(yaw+wobble));
  projector($('sky'),t,color);scene.begin();scene.draw(m,t,{reveal:env.matches?1:clamp((now-born)/.75,0,1),color});
}
requestAnimationFrame(animate);
