'use strict';
// Precise inspection uses the delivered 30 fps frame grid.
const clips={point1:[8,19.5],point2:[26,39],mechanism:[35.5,38.5],route:[44,48]};
let looping=false,captureBusy=false;
function framecode(t){const f=Math.round(frameTime(t)*30);return `${String(Math.floor(f/1800)).padStart(2,'0')}:${String(Math.floor(f/30)%60).padStart(2,'0')}:${String(f%30).padStart(2,'0')}`;}
function setLoop(enabled){looping=enabled;$('loopToggle').setAttribute('aria-pressed',String(enabled));$('loopToggle').textContent=enabled?'Повтор включён ↺':'Повторить ↺';}
function inspectionSync(){const t=video.currentTime||0;$('frameCode').textContent=framecode(t);const [a,b]=clips[$('loopChoice').value];if(looping&&!video.paused&&t>=b-1/60){video.currentTime=a;}}
function stepFrame(direction){const frame=Math.round((video.currentTime||0)*30)+direction;seek(Math.max(0,Math.min(1559,frame))/30);inspectionSync();}
$('frameBack').addEventListener('click',()=>stepFrame(-1));$('frameForward').addEventListener('click',()=>stepFrame(1));
$('loopToggle').addEventListener('click',()=>{setLoop(!looping);if(looping)seek(clips[$('loopChoice').value][0],true);});
$('loopChoice').addEventListener('change',()=>{if(looping)seek(clips[$('loopChoice').value][0],true);});
document.querySelectorAll('[data-chapter]').forEach(b=>b.addEventListener('click',()=>{$('loopChoice').value=b.dataset.chapter;inspectionSync();}));
document.querySelector('[data-mode="archive"]').addEventListener('click',()=>setLoop(false));
$('restart').addEventListener('click',()=>setLoop(false));
video.addEventListener('seeking',()=>{const [a,b]=clips[$('loopChoice').value];if(video.currentTime<a-.05||video.currentTime>b+.05)setLoop(false);});
video.addEventListener('timeupdate',inspectionSync);video.addEventListener('seeked',inspectionSync);
if(video.requestVideoFrameCallback){const inspectFrame=()=>{inspectionSync();video.requestVideoFrameCallback(inspectFrame);};video.requestVideoFrameCallback(inspectFrame);}
$('saveFrame').addEventListener('click',async()=>{
 if($('presentationToggle').disabled){toast('Видео загружается. Дождитесь смены версии.');return;}if(captureBusy)return;captureBusy=true;$('saveFrame').disabled=true;video.pause();
 try{
  if(video.seeking)await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
  if(mode!=='archive'&&video.readyState<2)throw Error('not ready');
  if(mode!=='film'&&(!photo.complete||!timeline))throw Error('not ready');
  const t=video.currentTime||0,w=video.videoWidth||1280,h=video.videoHeight||960,out=document.createElement('canvas');out.width=w;out.height=h+56;const g=out.getContext('2d');
  if(mode==='archive'){g.drawImage(photo,0,0,w,h);}else{g.drawImage(video,0,0,w,h);if(mode==='compare'){drawOriginal(t);const cut=w*Number($('compareRange').value)/100;g.save();g.beginPath();g.rect(0,0,cut,h);g.clip();g.drawImage(canvas,0,0,w,h);g.restore();g.strokeStyle='#e5c488';g.lineWidth=2;g.beginPath();g.moveTo(cut,0);g.lineTo(cut,h);g.stroke();}}
  g.fillStyle='#182a23';g.fillRect(0,h,w,56);g.fillStyle='#f6f3e9';g.font=`${Math.round(w/65)}px Arial`;g.fillText(`МОБОТ · ${mode==='archive'?'Исходный снимок':mode==='compare'?'Сравнение · '+framecode(t):'Рабочая реконструкция · '+framecode(t)}`,22,h+35);
  const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw Error('export');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Mobot_${mode}_${framecode(t).replaceAll(':','-')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Стоп-кадр сохранён с отметкой времени.');
 }catch{toast('Кадр ещё не готов. Дождитесь загрузки видео и повторите.');}finally{captureBusy=false;$('saveFrame').disabled=false;}
});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||document.querySelector('dialog[open]')||interactiveKeyTarget(e))return;if(e.code==='Comma'||e.code==='Period'){e.preventDefault();stepFrame(e.code==='Comma'?-1:1);}});
inspectionSync();
