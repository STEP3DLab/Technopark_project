/* FAUNA — a dependency-free, CPU-rendered 3D viewer.
 * Physical meshes come from the same CAD solids as the downloadable STL/STEP.
 * Canvas 2D deliberately avoids a WebGL requirement and CDN requests.
 */
(function () {
  'use strict';
  const modelData = window.FAUNA_MODELS;
  const canvas = document.getElementById('scene');
  const message = document.getElementById('model-message');
  const context = canvas && canvas.getContext('2d');
  if (!context || !modelData) {
    if (message) message.textContent = 'Просмотр недоступен. Модели и инструкция доступны в разделе «Файлы».';
    return;
  }
  const names = { all: 'Вся композиция', fox: 'Лиса', hare: 'Заяц', owl: 'Сова' };
  const materials = {
    ivory: { rgb: [233, 228, 209], ambient: .62, diffuse: .41 },
    brass: { rgb: [192, 155, 96], ambient: .43, diffuse: .64, shine: .3 },
    dark: { rgb: [63, 67, 54], ambient: .5, diffuse: .4 },
    cable: { rgb: [175, 169, 140], ambient: .66, diffuse: .35 }
  };
  const state = { view: 'all', yaw: -.13, elevation: .30, zoom: 1, light: true, brightness: .8, spin: false, exploded: false, dimensions: false };
  let width = 1, height = 1, frame = 0, lastFrame = 0, dirty = true;
  const meshes = [];
  let lamps = [];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const normal = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const lightDirection = normal([-.45, -.7, 1]);
  function prepare(vertices, faces, material = 'ivory') {
    const normals = [], centres = [];
    for (let i=0; i<faces.length; i+=3) {
      const a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;
      const u=[vertices[b]-vertices[a],vertices[b+1]-vertices[a+1],vertices[b+2]-vertices[a+2]];
      const v=[vertices[c]-vertices[a],vertices[c+1]-vertices[a+1],vertices[c+2]-vertices[a+2]];
      normals.push(...normal(cross(u,v)));
      centres.push((vertices[a]+vertices[b]+vertices[c])/3,(vertices[a+1]+vertices[b+1]+vertices[c+1])/3,(vertices[a+2]+vertices[b+2]+vertices[c+2])/3);
    }
    return {vertices,faces,normals,centres,material};
  }
  const animalMeshes = {};
  Object.keys(modelData).forEach(key => {animalMeshes[key]=prepare(modelData[key].vertices,modelData[key].faces);});
  function transformed(mesh, tx=0,ty=0,tz=0,rz=0) {
    const v=[],cs=Math.cos(rz),sn=Math.sin(rz);
    for(let i=0;i<mesh.vertices.length;i+=3){const x=mesh.vertices[i],y=mesh.vertices[i+1];v.push(cs*x-sn*y+tx,sn*x+cs*y+ty,mesh.vertices[i+2]+tz);}
    return prepare(v,mesh.faces,mesh.material);
  }
  function cylinder(a,b,radius,material='brass',segments=12) {
    const d=normal(b.map((x,i)=>x-a[i]));
    const u=normal(cross(d,Math.abs(d[2])<.9?[0,0,1]:[1,0,0]));
    const v=cross(d,u),vs=[],fs=[];
    for(const p of [a,b]) for(let j=0;j<segments;j++){const q=2*Math.PI*j/segments;vs.push(...p.map((x,i)=>x+radius*(Math.cos(q)*u[i]+Math.sin(q)*v[i])));}
    for(let j=0;j<segments;j++){const k=(j+1)%segments;fs.push(j,k,segments+k,j,segments+k,segments+j);}
    for(let j=1;j<segments-1;j++){fs.push(0,j+1,j,segments,segments+j,segments+j+1);}
    return prepare(vs,fs,material);
  }
  function box(x,y,z,w,d,h,angle=0,material='brass') {
    const vs=[-w/2,-d/2,-h/2,w/2,-d/2,-h/2,w/2,d/2,-h/2,-w/2,d/2,-h/2,-w/2,-d/2,h/2,w/2,-d/2,h/2,w/2,d/2,h/2,-w/2,d/2,h/2];
    const fs=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    return transformed(prepare(vs,fs,material),x,y,z,angle);
  }
  function ring() {
    const vs=[],fs=[],n=96,m=8;
    for(let i=0;i<n;i++)for(let j=0;j<m;j++){const a=i*2*Math.PI/n,b=j*2*Math.PI/m;vs.push((295+5*Math.cos(b))*Math.cos(a),(295+5*Math.cos(b))*Math.sin(a),5*Math.sin(b));}
    for(let i=0;i<n;i++)for(let j=0;j<m;j++){const a=i*m+j,b=((i+1)%n)*m+j,c=((i+1)%n)*m+(j+1)%m,d=i*m+(j+1)%m;fs.push(a,b,c,a,c,d);}
    return prepare(vs,fs,'brass');
  }
  function buildScene() {
    meshes.length=0;lamps=[];
    if(state.view!=='all'){meshes.push(animalMeshes[state.view]);dirty=true;return;}
    meshes.push(ring());
    meshes.push(cylinder([0,0,408],[0,0,432],70,'brass',48));
    meshes.push(cylinder([0,0,403],[0,0,409],23,'dark',24));
    const angles=[-Math.PI*5/6,-Math.PI/6,Math.PI/2];
    const keys=['fox','hare','owl'];
    angles.forEach((angle,i)=>{
      const cx=Math.cos(angle),sy=Math.sin(angle),x=235*cx,y=235*sy;
      const cableAngle=angle+Math.PI/6,ux=Math.cos(cableAngle),uy=Math.sin(cableAngle);
      meshes.push(cylinder([46*ux,46*uy,408],[295*ux,295*uy,7],1.4,'cable',8));
      meshes.push(cylinder([295*ux,295*uy,-8],[295*ux,295*uy,11],5,'brass',12));
      meshes.push(box(265*cx,265*sy,0,60,12,8,angle));
      meshes.push(box(x,y,2,94,72,4,0));
      meshes.push(cylinder([x,y,-8],[x,y,-3],9,'brass',16));
      const dz=state.exploded?-60:0,az=state.exploded?105:0;
      meshes.push(transformed(animalMeshes[keys[i]],x,y,4+az,0));
      meshes.push(cylinder([x,y,-8+dz],[x,y,-106+dz],2.5,'brass',12));
      meshes.push(cylinder([x,y,-111+dz],[x,y,-99+dz],16,'brass',24));
      lamps.push({x,y,z:-155+dz,radius:50});
      if(state.exploded){
        // Dashed registration lines are projected separately, never mistaken for structural parts.
      }
    });
    dirty=true;
  }
  function getCamera(view,yaw,elevation,zoom,w,h) {
    const all=view==='all';
    let centre=[0,0,100],span=700;
    if(!all){const bounds=modelData[view].bounds||modelData[view].bounds_mm;centre=bounds?bounds[0].map((x,i)=>(x+bounds[1][i])/2):[0,0,80];span=Math.max(...(bounds?bounds[0].map((x,i)=>bounds[1][i]-x):[180]))*1.18;}
    const scale=Math.min(w/(all?765:span*1.13),h/(all?770:span*1.12))*zoom;
    const distance=all?1900:720;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),ce=Math.cos(elevation),se=Math.sin(elevation);
    function point(x,y,z){x-=centre[0];y-=centre[1];z-=centre[2];const X=cy*x-sy*y,Y=sy*x+cy*y,Z=z;const depth=Y*ce-Z*se,k=distance/(distance+depth);return [w/2+X*scale*k,h*.52-(Z*ce+Y*se)*scale*k,depth,k*scale];}
    function direction(x,y,z){const X=cy*x-sy*y,Y=sy*x+cy*y;return [X,Y*ce-z*se,z*ce+Y*se];}
    return {point,direction,centre,scale};
  }
  function render(target,w,h,scene,light=true,brightness=.8,view='all',yaw=state.yaw,elevation=state.elevation,zoom=state.zoom,showDimensions=false) {
    target.clearRect(0,0,w,h);
    const camera=getCamera(view,yaw,elevation,zoom,w,h);
    if(view==='all'){
      // Soft ambient pool beneath the composition, not a fabricated physical shadow calculation.
      const p=camera.point(0,0,-250),rad=190*camera.scale;
      target.save();target.translate(p[0],p[1]);target.scale(1,.25);
      const g=target.createRadialGradient(0,0,5,0,0,rad);g.addColorStop(0,'rgba(7,16,10,.27)');g.addColorStop(1,'rgba(7,16,10,0)');target.fillStyle=g;target.fillRect(-rad,-rad,rad*2,rad*2);target.restore();
      if(light)for(const lamp of lamps){const q=camera.point(lamp.x,lamp.y,lamp.z),r=lamp.radius*q[3]*3.8;const g=target.createRadialGradient(q[0],q[1],r*.03,q[0],q[1],r);g.addColorStop(0,`rgba(255,201,105,${.18*brightness})`);g.addColorStop(.4,`rgba(245,192,100,${.07*brightness})`);g.addColorStop(1,'rgba(245,192,100,0)');target.fillStyle=g;target.fillRect(q[0]-r,q[1]-r,r*2,r*2);}
    }else{
      const bounds=modelData[view].bounds||modelData[view].bounds_mm;
      const p=camera.point(0,0,-2),rad=61*camera.scale;
      target.save();target.translate(p[0],p[1]);target.scale(1,.25);const g=target.createRadialGradient(0,0,0,0,0,rad);g.addColorStop(0,'rgba(30,35,26,.24)');g.addColorStop(1,'rgba(30,35,26,0)');target.fillStyle=g;target.fillRect(-rad,-rad,rad*2,rad*2);target.restore();
    }
    const triangles=[];
    for(const mesh of scene){
      const verts=mesh.vertices,fs=mesh.faces,ns=mesh.normals,ct=mesh.centres,pts=[];
      for(let i=0;i<verts.length;i+=3)pts.push(camera.point(verts[i],verts[i+1],verts[i+2]));
      const mat=materials[mesh.material];
      for(let i=0;i<fs.length;i+=3){
        const n=camera.direction(ns[i],ns[i+1],ns[i+2]);
        if(n[1]>.10)continue;
        const a=pts[fs[i]],b=pts[fs[i+1]],c=pts[fs[i+2]];
        const lit=Math.max(0,dot([ns[i],ns[i+1],ns[i+2]],lightDirection));
        let intensity=mat.ambient+lit*mat.diffuse;
        if(mesh.material==='ivory'){
          intensity*=.94+.06*Math.min(1,Math.max(0,ct[i+2])/180);
          if(view==='all'&&light)intensity+=Math.max(0,-ns[i+2])*.13*brightness;
        }
        if(mat.shine)intensity+=Math.pow(Math.max(0,-n[1]),15)*mat.shine;
        const color=mat.rgb.map(v=>Math.min(255,Math.max(0,Math.round(v*intensity))));
        triangles.push({depth:(a[2]+b[2]+c[2])/3,a,b,c,color:`rgb(${color[0]},${color[1]},${color[2]})`});
      }
    }
    if(view==='all')for(const lamp of lamps){const p=camera.point(lamp.x,lamp.y,lamp.z);triangles.push({depth:p[2],lamp,p});}
    triangles.sort((a,b)=>b.depth-a.depth);
    target.lineJoin='round';target.lineWidth=.45;
    for(const item of triangles){
      if(item.lamp){
        const [x,y,,s]=item.p,r=item.lamp.radius*s;
        const g=target.createRadialGradient(x-r*.32,y-r*.38,r*.03,x+r*.15,y+r*.1,r*1.1);
        if(light){g.addColorStop(0,'#fffdf0');g.addColorStop(.48,`rgb(255,${Math.round(242+8*brightness)},${Math.round(216+23*brightness)})`);g.addColorStop(1,'#d0ad72');}
        else{g.addColorStop(0,'#efeddf');g.addColorStop(.6,'#c9cabb');g.addColorStop(1,'#8d9784');}
        target.beginPath();target.arc(x,y,r,0,Math.PI*2);target.fillStyle=g;target.fill();continue;
      }
      target.beginPath();target.moveTo(item.a[0],item.a[1]);target.lineTo(item.b[0],item.b[1]);target.lineTo(item.c[0],item.c[1]);target.closePath();target.fillStyle=item.color;target.strokeStyle=item.color;target.fill();target.stroke();
    }
    if(view==='all'&&state.exploded){
      target.save();target.strokeStyle='#bdc0a278';target.lineWidth=1;target.setLineDash([3,5]);
      for(const a of [-Math.PI*5/6,-Math.PI/6,Math.PI/2]){const x=235*Math.cos(a),y=235*Math.sin(a),p=camera.point(x,y,5),q=camera.point(x,y,107);target.beginPath();target.moveTo(...p.slice(0,2));target.lineTo(...q.slice(0,2));target.stroke();}target.restore();
    }
    if(showDimensions) drawDimensions(target,camera,view,w,h);
  }
  function drawDimensions(ctx,camera,view,w,h){
    let lineA,lineB,label;
    if(view==='all'){lineA=[-300,-337,-210];lineB=[300,-337,-210];label='Ø 600 мм';}
    else{const b=modelData[view].bounds||modelData[view].bounds_mm;lineA=[b[0][0],b[0][1]-15,-8];lineB=[b[1][0],b[0][1]-15,-8];label=(b[1][0]-b[0][0]).toFixed(1)+' мм';}
    const a=camera.point(...lineA),b=camera.point(...lineB);
    ctx.save();ctx.strokeStyle='#d8bd8c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);for(const p of [a,b]){ctx.moveTo(p[0],p[1]-5);ctx.lineTo(p[0],p[1]+5);}ctx.stroke();
    ctx.font='12px Arial, sans-serif';ctx.textAlign='center';ctx.fillStyle='#e7cea3';const tx=(a[0]+b[0])/2,ty=Math.min(h-12,(a[1]+b[1])/2+20);ctx.fillText(label,tx,ty);ctx.restore();
  }
  function schedule(){dirty=true;if(!frame)frame=requestAnimationFrame(tick);}
  function tick(time){frame=0;if(state.spin&&document.visibilityState==='visible') {const delta=lastFrame?Math.min(50,time-lastFrame):16;state.yaw+=delta*.00012;dirty=true;}lastFrame=time;
    if(dirty){render(context,width,height,meshes,state.light,state.brightness,state.view,state.yaw,state.elevation,state.zoom,state.dimensions);dirty=false;}
    if(state.spin&&document.visibilityState==='visible')frame=requestAnimationFrame(tick);
  }
  function fit(target,w,h){const dpr=Math.min(window.devicePixelRatio||1,1.7);target.width=Math.round(w*dpr);target.height=Math.round(h*dpr);target.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}
  function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;width=rect.width;height=rect.height;fit(canvas,width,height);schedule();}
  function renderThumbnails(){document.querySelectorAll('.animal-preview').forEach(el=>{const r=el.getBoundingClientRect(),ctx=el.getContext('2d');if(!r.width||!r.height||!ctx)return;fit(el,r.width,r.height);render(ctx,r.width,r.height,[animalMeshes[el.dataset.animal]],false,.8,el.dataset.animal,.38,.19,.98,false);});}
  function refreshControls(){
    document.querySelectorAll('[data-view]').forEach(el=>{const selected=el.dataset.view===state.view;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});
    document.getElementById('view-title').textContent=names[state.view];
    ['light','rotate','explode','dimensions'].forEach(key=>{const k={light:'light',rotate:'spin',explode:'exploded',dimensions:'dimensions'}[key];document.getElementById(key+'-toggle').setAttribute('aria-pressed',String(state[k]));});
    document.getElementById('light-label').textContent=state.light?'Свет включён':'Свет выключен';
    const isAll=state.view==='all';
    document.getElementById('explode-toggle').disabled=!isAll;
    document.getElementById('light-toggle').disabled=!isAll;
    document.getElementById('brightness').disabled=!isAll||!state.light;
    const badge=document.getElementById('dimension-badge');badge.hidden=!state.dimensions;
    if(isAll)badge.textContent='Кольцо Ø600 мм · сферы Ø100 мм · высота ≈640 мм';
    else {const b=modelData[state.view].bounds||modelData[state.view].bounds_mm;badge.textContent=(modelData[state.view].size||b[0].map((x,i)=>b[1][i]-x)).map(x=>x.toFixed(1)).join(' × ')+' мм · ширина × глубина × высота';}
  }
  function selectView(view){state.view=view;state.yaw=view==='all'?-.13:.38;state.elevation=view==='all'?.30:.20;state.zoom=1;state.exploded=false;buildScene();refreshControls();schedule();}
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>selectView(el.dataset.view)));
  document.querySelectorAll('[data-inspect]').forEach(el=>el.addEventListener('click',()=>{selectView(el.dataset.inspect);document.getElementById('model').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}));
  document.getElementById('light-toggle').addEventListener('click',()=>{state.light=!state.light;refreshControls();schedule();});
  document.getElementById('brightness').addEventListener('input',e=>{state.brightness=Number(e.target.value)/100;document.getElementById('brightness-value').textContent=e.target.value+'%';schedule();});
  document.getElementById('rotate-toggle').addEventListener('click',()=>{state.spin=!state.spin;lastFrame=0;refreshControls();schedule();});
  document.getElementById('explode-toggle').addEventListener('click',()=>{state.exploded=!state.exploded;state.zoom=state.exploded?.9:1;buildScene();refreshControls();schedule();});
  document.getElementById('dimensions-toggle').addEventListener('click',()=>{state.dimensions=!state.dimensions;refreshControls();schedule();});
  document.getElementById('reset-view').addEventListener('click',()=>{state.spin=false;state.dimensions=false;selectView('all');});
  const pointers=new Map();let previous=null,pinch=0;
  canvas.addEventListener('pointerdown',e=>{canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);previous=[e.clientX,e.clientY];state.spin=false;refreshControls();if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);}});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pointers.size===2){const p=[...pointers.values()],dist=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(pinch)state.zoom=Math.max(.55,Math.min(2.4,state.zoom*dist/pinch));pinch=dist;}
    else if(previous){state.yaw+=(e.clientX-previous[0])*.008;state.elevation=Math.max(-.22,Math.min(1.18,state.elevation+(e.clientY-previous[1])*.005));}
    previous=[e.clientX,e.clientY];schedule();
  });
  function release(e){pointers.delete(e.pointerId);previous=null;pinch=0;}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(.55,Math.min(2.4,state.zoom*Math.exp(-e.deltaY*.001)));schedule();},{passive:false});
  canvas.addEventListener('keydown',e=>{let used=true;switch(e.key){case'ArrowLeft':state.yaw-=.12;break;case'ArrowRight':state.yaw+=.12;break;case'ArrowUp':state.elevation=Math.min(1.18,state.elevation+.08);break;case'ArrowDown':state.elevation=Math.max(-.22,state.elevation-.08);break;case'+':case'=':state.zoom=Math.min(2.4,state.zoom*1.1);break;case'-':state.zoom=Math.max(.55,state.zoom/1.1);break;case'Home':selectView(state.view);break;default:used=false;}if(used){e.preventDefault();state.spin=false;refreshControls();schedule();}});
  document.addEventListener('visibilitychange',()=>{lastFrame=0;if(document.visibilityState==='visible')schedule();});
  Object.keys(modelData).forEach(key=>{const b=modelData[key].bounds||modelData[key].bounds_mm;const text=(modelData[key].size||b[0].map((x,i)=>b[1][i]-x)).map(x=>Math.round(x)).join(' × ')+' мм';const el=document.querySelector('[data-size="'+key+'"]');if(el)el.textContent=text;});
  if('ResizeObserver' in window){new ResizeObserver(()=>{resize();renderThumbnails();}).observe(document.body);}else window.addEventListener('resize',()=>{resize();renderThumbnails();});
  buildScene();refreshControls();resize();renderThumbnails();message.hidden=true;
  canvas.dataset.ready='true';
})();
