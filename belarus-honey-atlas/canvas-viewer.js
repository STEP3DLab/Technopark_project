// Orthographic, depth-buffered renderer of the same ten sculptural elements.
// This path supports browsers with hardware acceleration turned off.
const regions=['brest','vitebsk','gomel','grodno','minsk','mogilev'];
const persons=['boris','ada','dmitry','evgenia'];
const groupNames=[...regions,...persons];
const fixedScale=1/4096;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
async function readGeometry() {
  const response=await fetch('./assets/cpu.bin');
  if(!response.ok)throw Error('Не удалось загрузить компактную модель');
  const blob=await response.blob();
  let buffer;
  if(typeof DecompressionStream==='function') buffer=await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  else {
    const {gunzipSync}=await import('./vendor/fflate.module.js');
    const bytes=gunzipSync(new Uint8Array(await blob.arrayBuffer()));buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  }
  const view=new DataView(buffer);let offset=4;
  if(view.getUint32(0,false)!==0x484e5931)throw Error('Неверный формат геометрии');
  return groupNames.map(id=>{
    const vertices=view.getUint32(offset,true),faces=view.getUint32(offset+4,true);offset+=8;
    const xyz=new Float32Array(vertices*3),index=new Uint32Array(faces*3);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<xyz.length;i++,offset+=2){
      const value=view.getInt16(offset,true)*fixedScale;xyz[i]=value;
      min[i%3]=Math.min(min[i%3],value);max[i%3]=Math.max(max[i%3],value);
    }
    for(let i=0;i<index.length;i++,offset+=4)index[i]=view.getUint32(offset,true);
    const color=new Uint32Array(faces),muted=new Uint32Array(faces);
    for(let i=0;i<faces;i++,offset+=3){
      const r=view.getUint8(offset),g=view.getUint8(offset+1),b=view.getUint8(offset+2);
      color[i]=(255<<24)|(b<<16)|(g<<8)|r;
      muted[i]=(255<<24)|((b*.54+14)<<16)|((g*.53+17)<<8)|(r*.52+15);
    }
    return {id,xyz,index,color,muted,min,max,projected:new Float32Array(xyz.length)};
  });
}
export async function createCanvasViewer(mount,onPick) {
  const [groups,composition]=await Promise.all([readGeometry(),fetch('./assets/composition.json').then(r=>r.json())]);
  const parents=groups.map((g,i)=>i<6?i:regions.indexOf(composition.bees.find(b=>b.id===g.id).region));
  const spreads=groups.slice(0,6).map(g=>{
    if(g.id==='minsk')return [-.05,-.04,.44];
    const x=(g.min[0]+g.max[0])/2,y=(g.min[1]+g.max[1])/2,len=Math.hypot(x,y);
    return [1.25*x/len,1.25*y/len,0];
  });
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw Error('Браузер не поддерживает Canvas');
  canvas.className='software-canvas';mount.replaceChildren(canvas);
  const still=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let az=-.309,el=1.01,span=10,center=[0,0,.4],split=0,frame=0;
  let state={mode:'whole',region:'all',bee:null,overhead:false};
  let width=0,height=0,image,rgba,depth,picks,transition=null;
  function dimensions(){
    const cssW=mount.clientWidth,cssH=mount.clientHeight;
    if(!cssW||!cssH)return false;
    const ratio=Math.min(1.35,window.devicePixelRatio||1,1100/cssW,840/cssH);
    const w=Math.max(1,Math.round(cssW*ratio)),h=Math.max(1,Math.round(cssH*ratio));
    if(w===width&&h===height)return false;
    width=w;height=h;canvas.width=w;canvas.height=h;
    image=ctx.createImageData(w,h);rgba=new Uint32Array(image.data.buffer);
    depth=new Float32Array(w*h);picks=new Uint8Array(w*h);
    return true;
  }
  function fit(next){
    const a=next.overhead?0:-.309,e=next.overhead?Math.PI/2:1.01;
    const ca=Math.cos(a),sa=Math.sin(a),ce=Math.cos(e),se=Math.sin(e);
    const targetSplit=next.mode==='apart'?1:0;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let j=0;j<groups.length;j++){
      const g=groups[j];
      if(next.bee?g.id!==next.bee:(next.region!=='all'&&regions[parents[j]]!==next.region))continue;
      const off=spreads[parents[j]];
      minX=Math.min(minX,g.min[0]+off[0]*targetSplit);maxX=Math.max(maxX,g.max[0]+off[0]*targetSplit);
      minY=Math.min(minY,g.min[1]+off[1]*targetSplit);maxY=Math.max(maxY,g.max[1]+off[1]*targetSplit);
      minZ=Math.min(minZ,g.min[2]+off[2]*targetSplit);maxZ=Math.max(maxZ,g.max[2]+off[2]*targetSplit);
    }
    const dx=maxX-minX,dy=maxY-minY,dz=maxZ-minZ;
    let viewH=Math.abs(sa*se)*dx+Math.abs(ca*se)*dy+ce*dz;
    let viewW=Math.abs(ca)*dx+Math.abs(sa)*dy;
    // The country's outline does not occupy the corners of its bounding rectangle.
    const padding=next.bee?1.45:next.region==='all'?.97:1.17;
    return {az:a,el:e,split:targetSplit,span:Math.max(1.4,viewH,viewW*height/width)*padding,
      center:[(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2]};
  }
  function setView(v){az=v.az;el=v.el;span=v.span;split=v.split;center=v.center.slice();}
  function queue(){if(!frame)frame=requestAnimationFrame(draw);}
  function update(next,animate=true){
    state={...next};const end=fit(state);
    if(animate&&!still)transition={from:{az,el,span,split,center:center.slice()},end,time:performance.now()};
    else {transition=null;setView(end);}
    queue();
  }
  function draw(now){
    frame=0;if(!width||!height)return;
    if(transition){
      const t=clamp((now-transition.time)/460,0,1),k=t*t*(3-2*t),a=transition.from,b=transition.end;
      const mix=(x,y)=>x+(y-x)*k;
      az=mix(a.az,b.az);el=mix(a.el,b.el);span=mix(a.span,b.span);split=mix(a.split,b.split);
      center=b.center.map((v,i)=>mix(a.center[i],v));
      if(t===1)transition=null;
    }
    rgba.fill(0);depth.fill(-1e10);picks.fill(0);
    const ca=Math.cos(az),sa=Math.sin(az),ce=Math.cos(el),se=Math.sin(el),scale=height/span;
    for(let gi=0;gi<groups.length;gi++){
      const g=groups[gi],p=g.projected,src=g.xyz,spread=spreads[parents[gi]];
      const tx=spread[0]*split-center[0],ty=spread[1]*split-center[1],tz=spread[2]*split-center[2];
      for(let v=0;v<src.length;v+=3){
        const x=src[v]+tx,y=src[v+1]+ty,z=src[v+2]+tz;
        p[v]=width*.5+(ca*x+sa*y)*scale;
        p[v+1]=height*.5-(-sa*se*x+ca*se*y+ce*z)*scale;
        p[v+2]=sa*ce*x-ca*ce*y+se*z;
      }
      const idx=g.index,cols=(state.region==='all'||regions[parents[gi]]===state.region)?g.color:g.muted;
      for(let t=0;t<idx.length;t+=3){
        const i=idx[t]*3,j=idx[t+1]*3,k=idx[t+2]*3;
        const ax=p[i],ay=p[i+1],bx=p[j],by=p[j+1],cx=p[k],cy=p[k+1];
        const e1x=bx-ax,e1y=by-ay,e2x=cx-ax,e2y=cy-ay,area=e1x*e2y-e2x*e1y;
        if(Math.abs(area)<.012)continue;
        const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(width-1,Math.floor(Math.max(ax,bx,cx)-.5));
        const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(height-1,Math.floor(Math.max(ay,by,cy)-.5));
        if(x0>x1||y0>y1)continue;
        const inv=1/area,dudx=e2y*inv,dudy=-e2x*inv,dvdx=-e1y*inv,dvdy=e1x*inv;
        const px=x0+.5-ax,py=y0+.5-ay;
        let rowU=dudx*px+dudy*py,rowV=dvdx*px+dvdy*py;
        const za=p[i+2],dz1=p[j+2]-za,dz2=p[k+2]-za,color=cols[t/3];
        for(let y=y0;y<=y1;y++,rowU+=dudy,rowV+=dvdy){
          let u=rowU,v=rowV,offset=y*width+x0;
          for(let x=x0;x<=x1;x++,offset++,u+=dudx,v+=dvdx){
            if(u<-.0001||v<-.0001||u+v>1.0001)continue;
            const z=za+u*dz1+v*dz2;
            if(z>depth[offset]){depth[offset]=z;rgba[offset]=color;picks[offset]=gi+1;}
          }
        }
      }
    }
    ctx.putImageData(image,0,0);if(transition)queue();
  }
  function zoom(factor){transition=null;span=clamp(span*factor,.85,32);queue();}
  function rotate(x,y){transition=null;az+=x;el=clamp(el+y,.09,Math.PI/2);queue();}
  function key(k){
    if(['+','=','-','_'].includes(k)){zoom(k==='-'||k==='_'?1.25:.8);return true;}
    const moves={ArrowLeft:[-.13,0],ArrowRight:[.13,0],ArrowUp:[0,.10],ArrowDown:[0,-.10]};
    if(!moves[k])return false;rotate(...moves[k]);return true;
  }
  let fingers=new Map(),gesture=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    canvas.setPointerCapture(e.pointerId);fingers.set(e.pointerId,[e.clientX,e.clientY]);
    if(fingers.size===1)gesture={x:e.clientX,y:e.clientY,moved:false};
    else if(gesture)gesture.moved=true;
  });
  canvas.addEventListener('pointermove',e=>{
    if(!fingers.has(e.pointerId))return;
    const old=fingers.get(e.pointerId);
    if(fingers.size===2){
      const other=[...fingers.entries()].find(([id])=>id!==e.pointerId)[1];
      const last=Math.hypot(old[0]-other[0],old[1]-other[1]),now=Math.hypot(e.clientX-other[0],e.clientY-other[1]);
      if(last>4&&now>4)zoom(last/now);
    }else if(fingers.size===1){
      if(gesture&&(gesture.moved||Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4)){
        gesture.moved=true;rotate((old[0]-e.clientX)*.008,(e.clientY-old[1])*.007);
      }
    }
    fingers.set(e.pointerId,[e.clientX,e.clientY]);
  });
  canvas.addEventListener('pointerup',e=>{
    if(!fingers.has(e.pointerId))return;
    if(fingers.size===1&&gesture&&!gesture.moved){
      const r=canvas.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)*width/r.width),y=Math.floor((e.clientY-r.top)*height/r.height);
      const g=picks[y*width+x]-1;if(g>=0)onPick(regions[parents[g]],g>5?groups[g].id:null);
    }
    fingers.delete(e.pointerId);if(!fingers.size)gesture=null;
  });
  canvas.addEventListener('pointercancel',e=>{fingers.delete(e.pointerId);gesture=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-150,150)*.0016));},{passive:false});
  new ResizeObserver(()=>{if(dimensions())update(state,false);}).observe(mount);
  dimensions();update(state,false);return {update,key,zoom};
}
