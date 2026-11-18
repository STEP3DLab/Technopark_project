/* Rectilinear view of a full equirectangular image. Works without a GPU. */
const host=document.querySelector('#pano');
const canvas=document.createElement('canvas');
canvas.tabIndex=0; canvas.setAttribute('aria-label','Панорама комнаты. Поворачивайте вид пальцем, мышью или стрелками.');
const context=canvas.getContext('2d',{alpha:false});
const message=document.createElement('span');message.className='pano-message';
host.append(canvas,message);
let room='',active=false,sequence=0,yaw=0,pitch=0,fov=71,source,frame=0,quietTimer;
const tracked=new Map(),cache=new Map();let pinchDistance=0;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function queue(interacting=false){
 if(!active||!source)return;
 cancelAnimationFrame(frame);
 frame=requestAnimationFrame(()=>paint(interacting));
 clearTimeout(quietTimer);
 if(interacting)quietTimer=setTimeout(()=>queue(false),130)
}
function paint(interacting){
 const rect=host.getBoundingClientRect();
 if(!active||!source||rect.width<1||rect.height<1)return;
 const scale=Math.min(window.devicePixelRatio||1,(interacting?650:1480)/rect.width,(interacting?520:950)/rect.height);
 const w=Math.max(1,Math.round(rect.width*scale)),h=Math.max(1,Math.round(rect.height*scale));
 if(w!==canvas.width||h!==canvas.height){canvas.width=w;canvas.height=h}
 const dest=context.createImageData(w,h),out=new Uint32Array(dest.data.buffer),tex=source.pixels,tw=source.w,th=source.h;
 const tangent=Math.tan(fov*Math.PI/360),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const dx=2*tangent/h;
 for(let row=0;row<h;row++){
   const yy=(1-2*(row+.5)/h)*tangent,front=cp-yy*sp,up=sp+yy*cp;
   let xx=(.5-w*.5)*dx;
   for(let column=0;column<w;column++,xx+=dx){
     const x=front*sy+xx*cy,z=front*cy-xx*sy;
     const lon=Math.atan2(x,z),lat=Math.atan2(up,Math.sqrt(x*x+z*z));
     const xf=(.5+lon/(2*Math.PI))*tw, yf=clamp((.5-lat/Math.PI)*th,0,th-1);
     const x0=Math.floor(xf)%tw, y0=Math.floor(yf), idx=y0*tw+x0;
     if(interacting){out[row*w+column]=tex[idx];continue}
     const x1=(x0+1)%tw, y1=Math.min(th-1,y0+1);
     const fx=xf-Math.floor(xf), fy=yf-y0;
     const a=tex[idx],b=tex[y0*tw+x1],c=tex[y1*tw+x0],d=tex[y1*tw+x1];
     const wa=(1-fx)*(1-fy),wb=fx*(1-fy),wc=(1-fx)*fy,wd=fx*fy;
     const r=(a&255)*wa+(b&255)*wb+(c&255)*wc+(d&255)*wd;
     const g=(a>>8&255)*wa+(b>>8&255)*wb+(c>>8&255)*wc+(d>>8&255)*wd;
     const blue=(a>>16&255)*wa+(b>>16&255)*wb+(c>>16&255)*wc+(d>>16&255)*wd;
     out[row*w+column]=0xff000000|(blue<<16)|(g<<8)|r
   }
 }
 context.putImageData(dest,0,0)
}
async function texture(id){
 if(cache.has(id))return cache.get(id);
 const im=new Image();im.src='media/pano-'+id+'.jpg';await im.decode();
 const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);
 const surface={w:c.width,h:c.height,pixels:new Uint32Array(ctx.getImageData(0,0,c.width,c.height).data.buffer)};
 if(cache.size>=2)cache.delete(cache.keys().next().value);cache.set(id,surface);return surface
}
export async function showPanorama(id){
 host.hidden=false;active=true;
 if(id===room&&source){queue();return}
 room=id;source=null;canvas.hidden=true;message.textContent='Открывается панорама…';message.hidden=false;
 yaw=0;pitch=-.10;fov=71;const turn=++sequence;
 try{const loaded=await texture(id);if(!active||sequence!==turn)return;source=loaded;canvas.hidden=false;message.hidden=true;queue()}
 catch{if(turn===sequence){message.hidden=false;message.textContent='Панорама не загрузилась. Выберите другой ракурс и вернитесь сюда.'}}
}
export function hidePanorama(){active=false;host.hidden=true;tracked.clear();cancelAnimationFrame(frame);clearTimeout(quietTimer)}
new ResizeObserver(()=>queue()).observe(host);
canvas.addEventListener('pointerdown',e=>{
 canvas.setPointerCapture(e.pointerId);tracked.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(tracked.size===2){const [a,b]=[...tracked.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y)}
});
canvas.addEventListener('pointermove',e=>{
 const old=tracked.get(e.pointerId);if(!old)return;
 const dx=e.clientX-old.x,dy=e.clientY-old.y;tracked.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(tracked.size===2){const [a,b]=[...tracked.values()],distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));if(pinchDistance)fov=clamp(fov*pinchDistance/distance,42,93);pinchDistance=distance}
 else{const speed=fov*Math.PI/(180*Math.max(180,host.clientHeight));yaw-=dx*speed;pitch=clamp(pitch+dy*speed,-Math.PI*.485,Math.PI*.485)}
 queue(true)
});
function release(e){tracked.delete(e.pointerId);pinchDistance=0;queue()}
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
canvas.addEventListener('wheel',e=>{e.preventDefault();fov=clamp(fov*Math.exp(Math.sign(e.deltaY)*.055),42,93);queue(true)},{passive:false});
canvas.addEventListener('dblclick',()=>{yaw=0;pitch=-.10;fov=71;queue()});
canvas.addEventListener('keydown',e=>{switch(e.key){case 'ArrowLeft':yaw-=.09;break;case 'ArrowRight':yaw+=.09;break;case 'ArrowUp':pitch=clamp(pitch+.075,-1.52,1.52);break;case 'ArrowDown':pitch=clamp(pitch-.075,-1.52,1.52);break;case 'Home':yaw=0;pitch=-.10;fov=71;break;default:return}e.preventDefault();queue()});
