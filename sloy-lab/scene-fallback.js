/** Local CPU 3D renderer for browsers without WebGL. Geometry is illustrative. */
export function initFallbackScene({ canvas, onReady = () => {}, onModeChange = () => {}, onStateChange = () => {} } = {}) {
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!ctx) { onReady(false); return { setMode(){}, setSection(){}, reset(){}, resize(){}, toggleRotation(){return false;}, setPlaying(){}, zoomBy(){}, getState(){return {mode:'points',section:55,playing:false,zoom:1};}, destroy(){} }; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const home = { yaw:0.67, pitch:0.51, zoom:1 };
  const current = {...home}, wanted = {...home};
  let mode='points', section=55, auto=!reduced.matches, width=600, height=580, ratio=1, scale=25;
  let pointer=null, lastX=0,lastY=0, visible=true, destroyed=false, frame=0,lastTime=0, time=0;
  let ready=false;
  let syaw=0,cyaw=1,spitch=0,cpitch=1;
  const surfaces=[], lines=[], cloud=[], patches=[];
  const palette = ['#3b695c','#507d64','#6d8d60','#8da565','#afb86a'];
  let randomSeed=12399;
  const random=()=>{randomSeed=(randomSeed*1664525+1013904223)>>>0;return randomSeed/4294967296;};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const mul=(v,n)=>[v[0]*n,v[1]*n,v[2]*n];
  function box(x,y,z,w,h,d,kind='concrete',sample=true) {
    const x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
    const vertices=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
    const faces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
    const normals=[[0,0,-1],[0,0,1],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0]];
    faces.forEach((ids,i)=>{
      const vs=ids.map(n=>vertices[n]);
      surfaces.push({v:vs,normal:normals[i],kind});
      if(!sample || (i===5&&h<0.4))return;
      const start=vs[0],u=vs[1].map((q,j)=>q-start[j]),v=vs[3].map((q,j)=>q-start[j]);
      const du=Math.hypot(...u),dv=Math.hypot(...v);
      const spacing=kind==='glass'?0.22:0.25;
      const nu=Math.max(1,Math.ceil(du/spacing)),nv=Math.max(1,Math.ceil(dv/spacing));
      for(let a=0;a<=nu;a++)for(let b=0;b<=nv;b++){
        if(random()<0.1)continue;
        const p=add(start,add(mul(u,a/nu),mul(v,b/nv)));
        p[0]+=(random()-.5)*.018;p[1]+=(random()-.5)*.018;p[2]+=(random()-.5)*.018;
        cloud.push({p,c:clamp(Math.floor((p[1]/13*.45+random()*.5)*5),0,4),normal:normals[i]});
      }
    });
    [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b])=>lines.push([vertices[a],vertices[b]]));
  }
  const slabs=[.28,3.06,5.84,8.62,11.4];
  for(const y of slabs){box(0,y,-3,14.2,.22,4.3,'white');box(-4.5,y,2,5.2,.22,6,'white');}
  for(let n=0;n<4;n++){
    const y=slabs[n]+1.38;
    box(0,y,-.93,13.8,2.46,.08,'glass');box(0,y,-5.07,13.8,2.46,.08,'glass');
    box(7.03,y,-3,.08,2.46,4,'glass');box(-7.03,y,-3,.08,2.46,4,'glass');
    box(-1.93,y,2,.08,2.46,5.9,'glass');box(-7.07,y,2,.08,2.46,5.9,'glass');
    box(-4.5,y,5.03,5,2.46,.08,'glass');
    box(-4.45,y,-2.9,2.05,2.54,1.45,'core');
    box(2.8,y,-3,.1,2.5,3.8,'core',false);box(-4.5,y,1.7,4.8,2.5,.1,'core',false);
    for(let x=-6.6;x<=6.8;x+=1.34){box(x,y,-.84,.075,2.56,.13,'dark',false);box(x,y,-5.15,.075,2.56,.13,'dark',false);}
    for(let z=-4.5;z<-1;z+=1.18)box(7.12,y,z,.13,2.56,.07,'dark',false);
    for(let z=-.4;z<=4.8;z+=1.26){box(-1.82,y,z,.16,2.56,.08,'dark',false);box(-7.15,y,z,.13,2.56,.08,'dark',false);}
    for(let x=-6.5;x<-2;x+=1.35)box(x,y,5.12,.08,2.56,.13,'dark',false);
  }
  for(const x of[-6.85,-2.05,2.55,6.85]){box(x,5.84,-.74,.2,11.25,.35,'white');box(x,5.84,-5.2,.2,11.25,.27,'white');}
  for(const z of[.2,2.6,4.8]){box(-1.7,5.84,z,.33,11.25,.18,'white');box(-7.2,5.84,z,.25,11.25,.18,'white');}
  box(1.7,3,.2,4.8,.18,2.05,'white');box(-.45,1.5,1,.14,2.85,.14,'dark');box(3.9,1.5,1,.14,2.85,.14,'dark');
  for(let i=0;i<5;i++)box(1.7,.02+i*.055,2.1-i*.21,5.4,.1+i*.11,.34,'concrete');
  box(-3.8,11.97,-3.1,3.8,.95,2.1,'concrete');box(-3.8,12.48,-3.1,3.95,.08,2.25,'white');
  box(0,11.66,-5.08,14.2,.4,.12,'white');box(7.05,11.66,-3,.12,.4,4.25,'white');
  box(-7.05,11.66,0,.12,.4,10.2,'white');box(-4.5,11.66,5.02,5.2,.4,.12,'white');

  // Keep the CPU renderer smooth on phones while preserving samples on every surface.
  if (cloud.length > 20000) {
    const stride = cloud.length / 20000;
    const selected = Array.from({length:20000}, (_, i) => cloud[Math.floor(i*stride)]);
    cloud.splice(0, cloud.length, ...selected);
  }

  // Heat-map samples lie on the actual facade planes rather than in screen coordinates.
  const heatStops=[[48,73,119],[76,156,161],[185,213,129],[243,206,88],[223,103,71]];
  function heatColor(t){const q=clamp(t,0,.999)*4,i=Math.floor(q),f=q-i;return `rgb(${heatStops[i].map((v,j)=>Math.round(v+(heatStops[i+1][j]-v)*f)).join(',')})`;}
  function heatFace(origin,u,v,normal,phase){
    const nu=28,nv=28;
    for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
      const a=i/nu,b=j/nv;
      const warm=Math.exp(-((a-.73)**2/.06+(b-.28)**2/.09));
      const cool=Math.exp(-((a-.2)**2/.1+(b-.78)**2/.08));
      const signal=.48+.48*warm-.43*cool+Math.sin(a*7+b*6+phase)*.08;
      const p=(s,t)=>add(origin,add(mul(u,s),mul(v,t)));
      patches.push({v:[p(a,b),p((i+1)/nu,b),p((i+1)/nu,(j+1)/nv),p(a,(j+1)/nv)],normal,kind:'heat',color:heatColor(signal)});
    }
  }
  heatFace([-6.9,.37,-.78],[13.8,0,0],[0,10.95,0],[0,0,1],0);
  heatFace([7.11,.37,-4.97],[0,0,3.95],[0,10.95,0],[1,0,0],1);
  heatFace([-1.77,.37,-.95],[0,0,5.9],[0,10.95,0],[1,0,0],2);
  heatFace([-6.97,.37,5.13],[4.95,0,0],[0,10.95,0],[0,0,1],3);
  heatFace([-6.9,.37,-5.12],[13.8,0,0],[0,10.95,0],[0,0,-1],1);
  heatFace([-7.16,.37,-4.95],[0,0,9.9],[0,10.95,0],[-1,0,0],2);

  function project(p){
    const x=p[0]*cyaw-p[2]*syaw;
    const forward=p[0]*syaw+p[2]*cyaw;
    const y=(p[1]-5.45)*cpitch-forward*spitch;
    return [width*.51+x*scale,height*.57-y*scale,forward*cpitch+(p[1]-5.45)*spitch];
  }
  function isFacing(n){return n[0]*syaw*cpitch+n[1]*spitch+n[2]*cyaw*cpitch>0;}
  function clip(vs,limit){
    if(mode!=='section')return vs;
    const result=[];
    for(let i=0;i<vs.length;i++){
      const a=vs[i],b=vs[(i+1)%vs.length],ina=a[1]<=limit,inb=b[1]<=limit;
      if(ina)result.push(a);
      if(ina!==inb){const t=(limit-a[1])/(b[1]-a[1]);result.push([a[0]+(b[0]-a[0])*t,limit,a[2]+(b[2]-a[2])*t]);}
    }
    return result;
  }
  function path(vs){ctx.beginPath();vs.forEach((v,i)=>{const p=project(v);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.closePath();}
  const faceColors={white:['#c8d5c8','#e1e8db','#edf0e6'],concrete:['#aebfb2','#c3d0c1','#d4dfce'],glass:['#5e8179','#81a69b','#a4beb1'],core:['#b0c3ad','#c7d4ba','#dce4cc'],dark:['#3a574e','#4e6e61','#658376']};
  function colorOf(face){
    if(face.kind==='heat')return face.color;
    const n=face.normal;
    const side=n[1]>.5?2:n[0]>.5||n[2]<-.5?0:1;
    return (faceColors[face.kind]||faceColors.concrete)[side];
  }
  function segment(a,b,color,lineWidth=1){const pa=project(a),pb=project(b);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();ctx.moveTo(pa[0],pa[1]);ctx.lineTo(pb[0],pb[1]);ctx.stroke();}
  function render(){
    if(destroyed)return;
    syaw=Math.sin(current.yaw);cyaw=Math.cos(current.yaw);spitch=Math.sin(current.pitch);cpitch=Math.cos(current.pitch);
    scale=Math.min(width/24,height/23.5)*current.zoom;
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    // Ground and registered survey grid.
    for(let i=-15;i<=15;i++){
      segment([i,-.18,-15],[i,-.18,15],i%5===0?'rgba(97,121,99,.16)':'rgba(97,121,99,.075)',.65);
      segment([-15,-.18,i],[15,-.18,i],i%5===0?'rgba(97,121,99,.16)':'rgba(97,121,99,.075)',.65);
    }
    const base=[[-9,-.1,-7],[9,-.1,-7],[9,-.1,7],[-9,-.1,7]];
    path(base);ctx.fillStyle=mode==='points'?'rgba(215,225,205,.25)':'rgba(211,222,204,.65)';ctx.fill();ctx.strokeStyle='rgba(113,142,105,.24)';ctx.lineWidth=.7;ctx.stroke();
    for(const x of[-9,9])for(const z of[-7,7]){segment([x-.35,-.08,z],[x+.35,-.08,z],'#869b6b',1);segment([x,-.08,z-.35],[x,-.08,z+.35],'#869b6b',1);}
    const limit=.5+section/100*12.15;
    if(mode==='points'){
      // Subtle ghost faces establish the form without hiding the scan samples behind them.
      const ghost=surfaces.filter(f=>f.kind!=='dark'&&isFacing(f.normal)).map(f=>({f,d:f.v.reduce((s,v)=>s+project(v)[2],0)/4})).sort((a,b)=>a.d-b.d);
      ctx.fillStyle='rgba(75,105,85,.024)';
      for(const {f} of ghost){path(f.v);ctx.fill();}
      const pointBuckets=palette.map(()=>[]);
      for(const p of cloud){const q=project(p.p);pointBuckets[p.c].push(q);}
      for(let i=0;i<pointBuckets.length;i++){
        ctx.fillStyle=palette[i];ctx.globalAlpha=.78;
        const size=clamp(scale*.044,.8,1.55);
        ctx.beginPath();for(const p of pointBuckets[i])ctx.rect(p[0],p[1],size,size);ctx.fill();
      }
      ctx.globalAlpha=1;
      ctx.strokeStyle='rgba(45,79,61,.13)';ctx.lineWidth=.48;ctx.beginPath();
      for(const[a,b]of lines){const pa=project(a),pb=project(b);ctx.moveTo(pa[0],pa[1]);ctx.lineTo(pb[0],pb[1]);}ctx.stroke();
      const y=.4+(time*.55)%11.7;
      const ring=[[-7.45,y,-5.5],[7.45,y,-5.5],[7.45,y,-.5],[-1.45,y,-.5],[-1.45,y,5.5],[-7.45,y,5.5]];
      path(ring);ctx.strokeStyle='rgba(142,166,44,.7)';ctx.lineWidth=1.1;ctx.stroke();
    }else{
      const candidates=mode==='deviation'?surfaces.concat(patches):surfaces;
      const ordered=[];
      for(const f of candidates){
        if(!isFacing(f.normal))continue;
        const v=clip(f.v,limit);if(v.length<3)continue;
        ordered.push({f,v,d:v.reduce((s,q)=>s+project(q)[2],0)/v.length});
      }
      ordered.sort((a,b)=>a.d-b.d);
      for(const {f,v}of ordered){
        path(v);ctx.fillStyle=colorOf(f);ctx.fill();
        if(f.kind==='heat'){
          // A same-color hairline prevents antialiasing gaps between adjacent measurement cells.
          ctx.strokeStyle=f.color;ctx.lineWidth=.4;ctx.stroke();
        }else{ctx.strokeStyle=f.kind==='dark'?'rgba(50,76,62,.15)':'rgba(51,78,62,.22)';ctx.lineWidth=.55;ctx.stroke();}
      }
      if(mode==='section'){
        // Highlight the clipping plane and cut structural columns.
        const ring=[[-7.2,limit,-5.3],[7.2,limit,-5.3],[7.2,limit,-.7],[-1.7,limit,-.7],[-1.7,limit,5.2],[-7.2,limit,5.2]];
        path(ring);ctx.strokeStyle='rgba(111,142,38,.75)';ctx.lineWidth=1.6;ctx.setLineDash([5,3]);ctx.stroke();ctx.setLineDash([]);
      }
    }
    // Small coordinate triad stays legible while the object is rotated.
    const corner={x:width-52,y:height-42};
    const axes=[{p:[1,0,0],c:'#748b57',t:'X'},{p:[0,1,0],c:'#6f8580',t:'Z'},{p:[0,0,1],c:'#9caa7e',t:'Y'}];
    const zero=project([0,0,0]);ctx.font='9px monospace';ctx.textAlign='center';
    for(const axis of axes){const end=project(axis.p),dx=(end[0]-zero[0])*.75,dy=(end[1]-zero[1])*.75;ctx.strokeStyle=axis.c;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(corner.x,corner.y);ctx.lineTo(corner.x+dx,corner.y+dy);ctx.stroke();ctx.fillStyle=axis.c;ctx.fillText(axis.t,corner.x+dx*1.25,corner.y+dy*1.25+3);}
  }
  function getState(){return {mode,section,playing:auto,zoom:wanted.zoom};}
  function notifyState(){if(ready&&!destroyed)onStateChange(getState());}
  function resize(){if(destroyed)return;const b=canvas.getBoundingClientRect();width=Math.max(1,b.width);height=Math.max(1,b.height);ratio=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);render();}
  function setMode(next){if(destroyed||!['points','model','deviation','section'].includes(next)||(ready&&mode===next))return;mode=next;canvas.dataset.mode=next;if(ready)onModeChange(next);notifyState();render();}
  function setSection(value){if(destroyed)return;section=clamp(Number(value)||0,0,100);notifyState();render();}
  function reset(){if(destroyed)return;Object.assign(current,home);Object.assign(wanted,home);section=55;notifyState();render();}
  function setPlaying(value){if(destroyed)return auto;if(auto&&!value&&pointer===null)wanted.yaw=current.yaw;auto=Boolean(value);notifyState();return auto;}
  function toggleRotation(){return setPlaying(!auto);}
  function zoomBy(factor){if(destroyed||!Number.isFinite(factor)||factor<=0)return wanted.zoom;wanted.zoom=clamp(wanted.zoom*factor,.72,1.65);notifyState();return wanted.zoom;}
  function motionChanged(){setPlaying(false);}
  function down(e){if(e.pointerType==='mouse'&&e.button!==0)return;pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);canvas.style.cursor='grabbing';}
  function move(e){if(pointer!==e.pointerId)return;wanted.yaw-=(e.clientX-lastX)*.006;wanted.pitch=clamp(wanted.pitch+(e.clientY-lastY)*.004,.15,1.05);lastX=e.clientX;lastY=e.clientY;}
  function up(e){if(pointer!==e.pointerId)return;pointer=null;canvas.style.cursor='grab';}
  function wheel(e){if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();zoomBy(Math.exp(-e.deltaY*.002));}
  function key(e){let valid=true;if(e.key==='ArrowLeft')wanted.yaw-=.12;else if(e.key==='ArrowRight')wanted.yaw+=.12;else if(e.key==='ArrowUp')wanted.pitch=clamp(wanted.pitch+.1,.15,1.05);else if(e.key==='ArrowDown')wanted.pitch=clamp(wanted.pitch-.1,.15,1.05);else if(e.key==='+'||e.key==='=')zoomBy(1.1);else if(e.key==='-')zoomBy(1/1.1);else if(e.key==='Home')reset();else valid=false;if(valid)e.preventDefault();}
  const events=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['lostpointercapture',up],['wheel',wheel],['keydown',key]];
  events.forEach(([name,fn])=>canvas.addEventListener(name,fn,name==='wheel'?{passive:false}:undefined));
  reduced.addEventListener('change',motionChanged);
  canvas.style.cursor='grab';canvas.style.touchAction='pan-y';canvas.style.display='block';
  canvas.dataset.webgl='canvas';canvas.dataset.renderer='canvas';canvas.parentElement?.classList.remove('scene-unavailable');
  const ro=new ResizeObserver(resize);ro.observe(canvas);
  const io=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;},{rootMargin:'150px'});io.observe(canvas);
  function animate(now){
    if(destroyed)return;
    frame=requestAnimationFrame(animate);
    if(document.hidden||!visible){lastTime=now;return;}
    if(now-lastTime<40)return;
    const dt=Math.min((now-lastTime)/1000,.1);lastTime=now;
    let changed=false;
    if(auto){time+=dt;if(pointer===null)wanted.yaw+=dt*.018;if(mode==='points')changed=true;}
    // Stop drawing after manual movement settles; paused scenes do not consume Canvas work.
    for(const axis of ['yaw','pitch','zoom']){
      const difference=wanted[axis]-current[axis];
      if(difference!==0){current[axis]=Math.abs(difference)<.0001?wanted[axis]:current[axis]+difference*.22;changed=true;}
    }
    if(changed)render();
  }
  function destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();events.forEach(([name,fn])=>canvas.removeEventListener(name,fn));reduced.removeEventListener('change',motionChanged);}
  resize();setMode('points');frame=requestAnimationFrame(animate);ready=true;onModeChange(mode);notifyState();onReady({points:cloud.length,renderer:'canvas'});
  return{setMode,setSection,reset,toggleRotation,setPlaying,zoomBy,getState,resize,destroy};
}
