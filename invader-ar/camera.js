import {detect} from './tracker.js';
import {detectBeacons} from './beacons.js';
import {renderer,fit,compose,scale,translate,rx,ry,rz,perspective,clamp} from './graphics.js';

const $=id=>document.getElementById(id);
const feed=$('feed'),overlay=$('overlay'),aura=$('aura'),surface=$('live'),sample=document.createElement('canvas');
const read=sample.getContext('2d',{willReadFrequently:true});
let graphics,frame=0,stream,still,serial=0,mode=null,targets=new Map(),sampleTime=-Infinity,pulseAt=-10,lastStatus='',snapshot=false;
let options;
const now=()=>performance.now()/1000;
const beaconColors=['violet','cyan','amber','violet'];
function status(message){
  if(message!==lastStatus){lastStatus=message;$('liveState').textContent=message;}
}
export function stopCamera(){
  serial++;cancelAnimationFrame(frame);
  if(stream)stream.getTracks().forEach(t=>{t.onended=null;t.stop();});
  stream=null;feed.pause();feed.srcObject=null;feed.style.visibility='';surface.style.backgroundImage='';
  still=null;mode=null;surface.hidden=true;targets.clear();document.body.classList.remove('no-scroll');
  snapshot=false;lastStatus='';sampleTime=-Infinity;
}
export function live(){return mode!==null;}
export async function startCamera(kind,handlers,photo){
  stopCamera();const ticket=serial;options=handlers;mode=kind;
  surface.hidden=false;document.body.classList.add('no-scroll');$('liveTitle').textContent=photo?'АНАЛИЗ ФОТО':kind==='tattoo'?'СКАНЕР ТАТУ':'СТАНЦИИ С МЕТКАМИ';
  $('reticle').hidden=false;$('snap').disabled=true;$('livePulse').disabled=true;
  status(photo?'Открываем фото…':'Подключаем камеру…');
  try{
    graphics??=renderer(overlay);
    if(photo){
      still=photo.image;feed.style.visibility='hidden';
      surface.style.backgroundImage='url("'+photo.url+'")';surface.style.backgroundSize='cover';surface.style.backgroundPosition='center';
    }else{
      if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error(),{name:'NotSupportedError'});
      const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}}});
      if(ticket!==serial){next.getTracks().forEach(t=>t.stop());return;}
      stream=next;stream.getVideoTracks()[0].onended=()=>{if(ticket===serial){stopCamera();handlers.error('NotReadableError',kind);}};
      feed.srcObject=stream;await feed.play();
    }
    if(ticket!==serial)return;
    status(kind==='tattoo'?'Помести весь рисунок в рамку':'Наведи камеру на одну или несколько меток');
    frame=requestAnimationFrame(render);
  }catch(err){
    if(ticket!==serial)return;
    stopCamera();handlers.error(err.name,kind);
  }
}
function updateTargets(hits,t){
  for(const hit of hits){
    let item=targets.get(hit.id);
    if(!item){item={...hit,born:t,seen:t};targets.set(hit.id,item);options.chime('lock');}
    else{
      const k=still?1:.66;
      if(hit.corners)item.corners=hit.corners.map((p,i)=>({x:item.corners[i].x+(p.x-item.corners[i].x)*k,y:item.corners[i].y+(p.y-item.corners[i].y)*k}));
      else{
        for(const key of ['x','y','width'])item[key]+=(hit[key]-item[key])*k;
        item.score=hit.score;
        item.angle+=Math.atan2(Math.sin(hit.angle-item.angle),Math.cos(hit.angle-item.angle))*k;
      }
      item.seen=t;
    }
  }
}
function readFrame(source,sw,sh,t){
  const factor=Math.min(1,(mode==='tattoo'?440:710)/Math.max(sw,sh));
  const w=Math.round(sw*factor),h=Math.round(sh*factor);
  if(sample.width!==w||sample.height!==h){sample.width=w;sample.height=h;}
  read.drawImage(source,0,0,w,h);const pixels=read.getImageData(0,0,w,h);
  if(mode==='tattoo'){
    const hit=detect(pixels);updateTargets(hit?[{...hit,id:0}]:[],t);
  }else updateTargets(detectBeacons(pixels),t);
  sampleTime=t;
}
// Recover the camera-relative orientation of a square from its four projected corners.
// The model's +Z axis points out of the printed surface.
export function squarePose(corners,w,h,f){
  const local=[[-.5,.5],[.5,.5],[.5,-.5],[-.5,-.5]],a=[];
  for(let i=0;i<4;i++){
    const [x,y]=local[i],u=(corners[i].x-w/2)/f,v=(h/2-corners[i].y)/f;
    a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  for(let i=0;i<8;i++){
    let p=i;for(let j=i+1;j<8;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;
    if(Math.abs(a[p][i])<1e-9)return null;
    [a[i],a[p]]=[a[p],a[i]];const pivot=a[i][i];
    for(let k=i;k<9;k++)a[i][k]/=pivot;
    for(let j=0;j<8;j++){if(j===i)continue;const c=a[j][i];for(let k=i;k<9;k++)a[j][k]-=c*a[i][k];}
  }
  const v=a.map(r=>r[8]),x=[v[0],v[3],-v[6]],y=[v[1],v[4],-v[7]];
  const norm=p=>Math.hypot(...p),unit=p=>p.map(n=>n/norm(p)),depth=2/(norm(x)+norm(y)),a1=unit(x);
  const dot=a1.reduce((s,n,i)=>s+n*y[i],0),a2=unit(y.map((n,i)=>n-dot*a1[i]));
  const a3=[a1[1]*a2[2]-a1[2]*a2[1],a1[2]*a2[0]-a1[0]*a2[2],a1[0]*a2[1]-a1[1]*a2[0]];
  return new Float32Array([...a1,0,...a2,0,...a3,0,v[2]*depth,v[5]*depth,-depth,1]);
}
function rings(ctx,x,y,size,angle,t,colour,pulse){
  const tint=colour==='cyan'?'100,248,229':colour==='amber'?'255,184,96':'198,153,255';
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size*.48);
  for(const [r,o] of [[.48,.7],[.55,.3],[.63,.23]]){
    ctx.strokeStyle='rgba('+tint+','+o+')';ctx.lineWidth=.009;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
  }
  ctx.lineWidth=.022;ctx.strokeStyle='rgba('+tint+',.9)';
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,.54,t*.5+i*2.1,t*.5+i*2.1+.6);ctx.stroke();}
  if(pulse>0){ctx.globalAlpha=pulse;ctx.lineWidth=.03;ctx.beginPath();ctx.arc(0,0,.65+(1-pulse)*1.3,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}
function render(ms){
  if(!mode)return;
  const t=ms/1000,source=still||feed,sw=still?.naturalWidth||feed.videoWidth,sh=still?.naturalHeight||feed.videoHeight;
  const {w,h}=fit(overlay,1.7);
  if(aura.width!==w||aura.height!==h){aura.width=w;aura.height=h;}
  const ctx=aura.getContext('2d');ctx.clearRect(0,0,w,h);graphics.begin();
  if(sw&&sh&&(still||feed.readyState>=2)){
    if((!still&&t-sampleTime>.09)||sampleTime===-Infinity)readFrame(source,sw,sh,t);
    const cover=Math.max(w/sample.width,h/sample.height),ox=(w-sample.width*cover)/2,oy=(h-sample.height*cover)/2;
    const screen=p=>({x:p.x*cover+ox,y:p.y*cover+oy});
    const focal=Math.max(sample.width,sample.height)*cover*.93,projection=perspective(w,h,focal);
    const energy=clamp(1-(t-pulseAt)/1.3,0,1);
    for(const [id,item] of targets){
      if(!still&&t-item.seen>.42){targets.delete(id);continue;}
      const age=t-item.born,reveal=clamp(age/.7,0,1),color=mode==='tattoo'?options.color():beaconColors[(id-1)%4];
      let matrix;
      if(item.corners){
        const pts=item.corners.map(screen),pose=squarePose(pts,w,h,focal);
        if(!pose)continue;
        const midpoint=pts.reduce((p,a)=>({x:p.x+a.x/4,y:p.y+a.y/4}),{x:0,y:0}),side=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
        rings(ctx,midpoint.x,midpoint.y,side,Math.atan2(pts[1].y-pts[0].y,pts[1].x-pts[0].x),t,color,energy);
        matrix=compose(projection,pose,translate(0,.07,.29+.04*Math.sin(t*1.8+id)),ry(.20*Math.sin(t+id)),scale(.88));
      }else{
        const p=screen(item),size=item.width*cover;
        const rise=(.83+.035*Math.sin(t*2))*size*Math.min(age*1.65,1);
        const depth=focal/size,x=(p.x-w/2)/size,y=(h/2-p.y+rise)/size;
        rings(ctx,p.x,p.y,size,item.angle,t,color,energy);
        if(rise>0){
          const light=color==='cyan'?'108,242,224':color==='amber'?'255,184,104':'199,158,255';
          const cone=ctx.createLinearGradient(0,p.y-rise,0,p.y);
          cone.addColorStop(0,'rgba('+light+',0)');cone.addColorStop(.7,'rgba('+light+',.12)');cone.addColorStop(1,'rgba('+light+',.26)');
          ctx.fillStyle=cone;ctx.beginPath();ctx.moveTo(p.x-size*.34,p.y-rise);ctx.lineTo(p.x+size*.34,p.y-rise);ctx.lineTo(p.x+size*.07,p.y);ctx.lineTo(p.x-size*.07,p.y);ctx.closePath();ctx.fill();
        }
        const ux=p.x,uy=p.y-rise;
        // Telemetry follows the acquired drawing, in the same camera coordinate system.
        const pixel=w/Math.max(1,overlay.clientWidth);
        const side=ux<w*.59?1:-1;
        const labelX=clamp(ux+side*size*.68,68*pixel,w-68*pixel);
        const labelY=clamp(uy-size*.26,83*pixel,h-96*pixel);
        ctx.save();ctx.globalAlpha=.82*reveal;ctx.strokeStyle='rgba(235,221,255,.78)';ctx.lineWidth=pixel;
        ctx.beginPath();ctx.moveTo(ux+side*size*.39,uy-size*.12);ctx.lineTo(labelX-side*7*pixel,labelY);ctx.lineTo(labelX+side*36*pixel,labelY);ctx.stroke();
        ctx.font='600 '+10*pixel+'px monospace';ctx.textBaseline='bottom';ctx.textAlign=side>0?'left':'right';ctx.shadowColor='#080410';ctx.shadowBlur=3*pixel;
        ctx.fillStyle='#fff5ff';ctx.fillText('INV·01',labelX,labelY-2*pixel);
        ctx.font=9*pixel+'px monospace';ctx.textBaseline='top';ctx.fillStyle='#dcffed';ctx.fillText(Math.round(item.score*100)+'%',labelX,labelY+3*pixel);
        ctx.restore();
        if(energy>0){
          ctx.save();const u=1-energy;
          ctx.strokeStyle='rgba(210,176,255,'+energy*.84+')';ctx.lineWidth=Math.max(1,size*.013*energy);
          ctx.beginPath();ctx.ellipse(ux,uy,size*(.21+u*.90),size*(.12+u*.67),-.16,0,Math.PI*2);ctx.stroke();
          ctx.fillStyle='rgba(235,212,255,'+energy+')';
          for(let i=0;i<26;i++){const a=i*2.4,rad=size*(.25+u*(.48+(i%5)*.11));const d=(3-i%3)*pixel;ctx.fillRect(ux+Math.cos(a)*rad,uy+Math.sin(a)*rad*.80,d,d);}
          ctx.restore();
        }
        matrix=compose(projection,translate(x,y,-depth),rz(-item.angle*(1-.78*reveal)),rx(.16),ry(-.24+.27*Math.sin(t*1.15)),scale(1.04));
      }
      graphics.draw(matrix,t,{reveal,color,pulse:energy});
    }
    const count=targets.size;$('reticle').hidden=count>0;
    $('snap').disabled=!count;$('livePulse').disabled=!count;
    if(count)status(mode==='tattoo'?'Контакт установлен · Захватчик активен':'В поле зрения · '+[...targets.keys()].map(i=>'Маяк 0'+i).join(' · '));
    else status(still?'Рисунок не найден. Попробуй более чёткое фото целиком.':mode==='tattoo'?'Наведи на тату целиком и задержи камеру':'Покажи чёрный квадрат целиком, вместе с белым полем');
    if(snapshot){snapshot=false;saveShot(source,sw,sh,w,h);}
  }
  frame=requestAnimationFrame(render);
}
function saveShot(source,sw,sh,w,h){
  const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d'),c=Math.max(w/sw,h/sh);
  ctx.drawImage(source,(w-sw*c)/2,(h-sh*c)/2,sw*c,sh*c);ctx.drawImage(aura,0,0);ctx.drawImage(overlay,0,0);
  ctx.font='600 '+Math.max(12,Math.round(w*.019))+'px monospace';ctx.fillStyle='white';ctx.shadowColor='black';ctx.shadowBlur=3;ctx.fillText('INVADER LAB',w*.035,h*.96);
  out.toBlob(blob=>{if(!blob)return;const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='invader-lab-'+Date.now()+'.jpg';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/jpeg',.93);
}
$('snap').onclick=()=>{snapshot=true;options.chime('snap');};
function triggerPulse(){if(!targets.size)return;pulseAt=now();options.chime('pulse');}
$('livePulse').onclick=triggerPulse;overlay.onclick=triggerPulse;
