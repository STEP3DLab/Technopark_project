import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (a,b,x) => THREE.MathUtils.smoothstep(x,a,b);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewport = $('#viewport');
const slider = $('#explode-slider');
const parts = [
  {id:'covers', no:'01', kicker:'ЗАЩИТНАЯ ОБОЛОЧКА', title:'Форма следует функции.', name:'Внешние накладки', sub:'Защита и персонализация', copy:'Раздельные накладки формируют силуэт. Раскройте их, чтобы увидеть несущий каркас и внутренние узлы.'},
  {id:'socket', no:'02', kicker:'ПРИЁМНАЯ ГИЛЬЗА', title:'Начало каждого шага.', name:'Приёмная гильза', sub:'Соединение с человеком', copy:'Индивидуальная гильза соединяет протез с телом. Мягкая внутренняя поверхность и жёсткий каркас работают вместе.'},
  {id:'knee', no:'03', kicker:'КОЛЕННЫЙ УЗЕЛ', title:'Контролируемая свобода.', name:'Коленный механизм', sub:'Сгибание и сопротивление', copy:'Шарнир задаёт ось сгибания. В концепте показаны корпус, подшипники и демпфер, управляющий сопротивлением движению.'},
  {id:'pylon', no:'04', kicker:'НЕСУЩАЯ СИСТЕМА', title:'Ось всей конструкции.', name:'Несущий модуль', sub:'Каркас и адаптеры', copy:'Несущая трубка передаёт нагрузку между коленом и стопой. Соединительные адаптеры позволяют выстраивать положение модулей.'},
  {id:'foot', no:'05', kicker:'КОМПОЗИТНАЯ СТОПА', title:'Энергия следующего шага.', name:'Упругая стопа', sub:'Композитные рессоры', copy:'Изогнутые композитные пластины упруго деформируются под нагрузкой. Раздельные элементы пятки и носка формируют перекат.'}
];
let selected = 'covers';
let mode = 'explore';
let progress = 0, animatedProgress = 0, manualAngle = 0, animatedAngle = 0;
let playing = false, playDirection = 1, labels = true, xray = false, userZoom = 1;
let scene, camera, renderer, controls, model, lower, socket, foot, pylon, coverRight, coverLeft, coverFront;
let envTarget, stage, cameraTween = null, lastTime = 0, motionClock = 0, firstFrame = true;
const selectable = [], coverMaterials = [], kneeCaps = [], markers = [];
const materialBase = new Map();
let modelStats = {};

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(()=>el.classList.remove('show'),2400);
}

function updateProgressUI() {
  const value = mode==='motion' ? manualAngle/70*100 : progress*100;
  slider.value = String(value);
  slider.setAttribute('aria-label',mode==='motion'?'Угол сгибания коленного узла':'Степень раскрытия протеза');
  slider.setAttribute('aria-valuetext',mode==='motion'?`${Math.round(manualAngle)} градусов`:`${Math.round(value)} процентов`);
  slider.style.setProperty('--progress',`${value}%`);
  $('#progress-value').innerHTML = `${String(Math.round(mode==='motion'?manualAngle:value)).padStart(2,'0')}<span>${mode==='motion'?'°':'%'}</span>`;
  $('#reveal span').textContent = mode==='motion' ? (playing?'Остановить движение':'Запустить движение') : progress>.3 ? 'Собрать протез' : 'Раскрыть протез';
  $('#auto-play use').setAttribute('href',playing?'#i-pause':'#i-play');
  $('#auto-play').setAttribute('aria-label',playing?'Остановить демонстрацию':mode==='motion'?'Показать движение':'Автоматическое раскрытие');
  $('#timeline-title').textContent=mode==='motion'?'СГИБАНИЕ КОЛЕННОГО УЗЛА':'РАСКРЫТИЕ КОНСТРУКЦИИ';
  const btns=$$('.slider-labels button');
  ['В сборе','Без оболочки','По деталям'].forEach((label,i)=>btns[i].textContent=mode==='motion'?['0°','35°','70°'][i]:label);
}

function setProgress(value, stop=true) {
  if(stop) playing=false;
  if(mode==='motion') manualAngle=clamp(value,0,1)*70;
  else progress=clamp(value,0,1);
  updateProgressUI();
}

function setMode(next) {
  mode=next;playing=false;motionClock=0;
  document.body.classList.toggle('motion',mode==='motion');
  $$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
  if(mode==='motion') {progress=.48;manualAngle=0;selectPart('knee',false);playing=!reducedMotion;}
  else {manualAngle=0;selectPart('covers',false);}
  updateProgressUI();
}

function selectPart(id, focus=false) {
  selected=id; const part=parts.find(p=>p.id===id); if(!part)return;
  $('#detail-index').textContent=`${part.no} / 05`;
  $('#detail-kicker').textContent=part.kicker;
  $('#detail-title').textContent=part.title;
  $('#detail-copy').textContent=part.copy;
  $$('.part-row,.hotspot').forEach(el=>el.classList.toggle('selected',el.dataset.part===id));
  if(focus&&mode==='explore'&&['pylon','knee'].includes(id)&&progress<.4) setProgress(.48);
  if(focus) $('#parts-panel').hidden=true;
}

function carbonTexture() {
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle='#242c29';ctx.fillRect(0,0,256,256);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const alt=(Math.floor(x/2)+Math.floor(y/2))%2;
    const g=ctx.createLinearGradient(x*8,y*8,x*8+(alt?8:0),y*8+(alt?0:8));
    g.addColorStop(0,alt?'#151b18':'#242d27');g.addColorStop(.45,alt?'#39423b':'#414b42');g.addColorStop(1,'#151d18');
    ctx.fillStyle=g;ctx.fillRect(x*8,y*8,8,8);
    ctx.strokeStyle='#15201966';ctx.lineWidth=.7;
    for(let n=2;n<8;n+=2){ctx.beginPath();ctx.moveTo(x*8+(alt?0:n),y*8+(alt?n:0));ctx.lineTo(x*8+(alt?8:n),y*8+(alt?n:8));ctx.stroke();}
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,4);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}

function shellGeometry(profile,start=0,end=Math.PI*2,thickness=.045,asymmetry=0) {
  const positions=[],indices=[],uvs=[];const columns=Math.max(24,Math.round((end-start)/Math.PI*38)),rows=profile.length;
  for(let side=0;side<2;side++)for(let r=0;r<rows;r++)for(let i=0;i<=columns;i++){
    const theta=lerp(start,end,i/columns); const [y,rx,rz]=profile[r];
    positions.push(Math.sin(theta)*(rx-side*thickness),y+(r===rows-1?Math.cos(theta)*asymmetry:0),Math.cos(theta)*(rz-side*thickness));
    uvs.push(i/columns,(y-profile[0][0])/(profile.at(-1)[0]-profile[0][0]));
  }
  const layer=rows*(columns+1);
  for(let side=0;side<2;side++)for(let r=0;r<rows-1;r++)for(let i=0;i<columns;i++){
    const a=side*layer+r*(columns+1)+i,b=a+1,c=a+columns+1,d=c+1;
    if(side===0)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
  }
  for(const r of [0,rows-1])for(let i=0;i<columns;i++){
    const a=r*(columns+1)+i,b=a+1;indices.push(a,b,a+layer,b,b+layer,a+layer);
  }
  for(const i of [0,columns])for(let r=0;r<rows-1;r++){
    const a=r*(columns+1)+i,b=a+columns+1;indices.push(a,a+layer,b,b,a+layer,b+layer);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function roundedBox(w,h,d,r=.03) {
  const shape=new THREE.Shape(),x=-w/2,y=-h/2;
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:Math.min(r/3,.015),bevelThickness:Math.min(r/3,.015),curveSegments:6});g.translate(0,0,-d/2);return g;
}

function mesh(geometry,material,parent,x=0,y=0,z=0,part) {
  const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);
  if(part){m.userData.part=part;selectable.push(m);}return m;
}
function cylinder(rt,rb,h,material,parent,x=0,y=0,z=0,part,radial=48) {return mesh(new THREE.CylinderGeometry(rt,rb,h,radial,1),material,parent,x,y,z,part);}
function tube(points,r,material,parent,part,segments=40) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve,segments,r,10,false),material,parent,0,0,0,part);
}
function ring(radius,thick,material,parent,x,y,z,axis='y',part) {
  const m=mesh(new THREE.TorusGeometry(radius,thick,10,64),material,parent,x,y,z,part);
  if(axis==='y')m.rotation.x=Math.PI/2;else if(axis==='x')m.rotation.y=Math.PI/2;return m;
}
function rod(a,b,r,material,parent,part) {
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
  const m=cylinder(r,r,delta.length(),material,parent,0,0,0,part);m.position.copy(av.add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;
}
function bolt(parent,x,y,z,material,axis='x',size=.06,part='knee') {
  const m=cylinder(size,size,size*.65,material,parent,x,y,z,part,6);
  if(axis==='x')m.rotation.z=Math.PI/2;else if(axis==='z')m.rotation.x=Math.PI/2;
  return m;
}
function ribbon(points,width,thickness,material,parent,xoffset=0,part='foot') {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),positions=[],indices=[],uv=[];const n=64;
  for(let i=0;i<=n;i++){
    const t=i/n,p=curve.getPoint(t),w=typeof width==='function'?width(t):width;
    positions.push(p.x+xoffset-w/2,p.y+thickness/2,p.z,p.x+xoffset+w/2,p.y+thickness/2,p.z,p.x+xoffset-w/2,p.y-thickness/2,p.z,p.x+xoffset+w/2,p.y-thickness/2,p.z);
    uv.push(0,t*3,1,t*3,0,t*3,1,t*3);
    if(i<n){const a=i*4,b=a+4;indices.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
  }
  indices.push(0,1,2,1,3,2,n*4,n*4+2,n*4+1,n*4+1,n*4+2,n*4+3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(g,material,parent,0,0,0,part);
}

function buildModel() {
  const carbon=new THREE.MeshPhysicalMaterial({map:carbonTexture(),color:0x8e9a91,metalness:.65,roughness:.36,clearcoat:.4,clearcoatRoughness:.26,side:THREE.DoubleSide});
  const metal=new THREE.MeshStandardMaterial({color:0xa9b5ae,metalness:.92,roughness:.26});
  const darkMetal=new THREE.MeshStandardMaterial({color:0x313b35,metalness:.8,roughness:.34});
  const titanium=new THREE.MeshStandardMaterial({color:0x7e8b80,metalness:.96,roughness:.18});
  const rubber=new THREE.MeshStandardMaterial({color:0x1c241f,metalness:.05,roughness:.85});
  const lining=new THREE.MeshStandardMaterial({color:0x444e46,metalness:0,roughness:.95,side:THREE.DoubleSide});
  const accent=new THREE.MeshStandardMaterial({color:0xc4eb68,metalness:.3,roughness:.35});
  const black=new THREE.MeshStandardMaterial({color:0x0c1710,metalness:.2,roughness:.54});
  const ceramic=new THREE.MeshPhysicalMaterial({color:0xd5ddcc,metalness:.13,roughness:.3,clearcoat:.6,clearcoatRoughness:.25,side:THREE.DoubleSide});
  coverMaterials.push(ceramic);
  const led=new THREE.MeshStandardMaterial({color:0xd4f698,emissive:0x9ac64a,emissiveIntensity:.7,roughness:.4});
  model=new THREE.Group();scene.add(model);model.rotation.z=-.035;

  socket=new THREE.Group();socket.position.y=2.08;model.add(socket);
  const socketProfile=[[0,.27,.26],[.15,.39,.34],[.5,.52,.44],[1,.67,.54],[1.5,.79,.63],[1.63,.8,.64]];
  mesh(shellGeometry(socketProfile,0,Math.PI*2,.075,.13),carbon,socket,0,0,0,'socket');
  mesh(shellGeometry([[1.35,.744,.58],[1.5,.743,.575],[1.64,.748,.582]],0,Math.PI*2,.035,.13),lining,socket,0,0,0,'socket');
  const rim=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;rim.push([Math.sin(a)*.793,1.64+Math.cos(a)*.13,Math.cos(a)*.633]);}
  tube(rim,.032,rubber,socket,'socket',96);
  cylinder(.28,.24,.13,titanium,socket,0,-.05,0,'socket');
  cylinder(.20,.20,.18,darkMetal,socket,0,-.18,0,'socket');
  ring(.29,.018,accent,socket,0,.12,0,'y','socket');
  for(const sign of [-1,1]){
    mesh(roundedBox(.09,.64,.14,.03),darkMetal,socket,sign*.53,.72,.18,'socket').rotation.z=sign*-.2;
    for(const y of [.46,.92]) bolt(socket,sign*.56,y,.18,metal,'x',.055,'socket');
  }
  const patch=mesh(shellGeometry([[.33,.48,.40],[.5,.55,.46],[.9,.65,.53]],-.20,.20,.012),accent,socket,0,0,.009,'socket');
  const logoCanvas=document.createElement('canvas');logoCanvas.width=256;logoCanvas.height=128;const lc=logoCanvas.getContext('2d');lc.fillStyle='#19291d';lc.font='700 46px Arial';lc.fillText('K—01',24,78);const logoTexture=new THREE.CanvasTexture(logoCanvas);logoTexture.colorSpace=THREE.SRGBColorSpace;
  mesh(new THREE.PlaneGeometry(.36,.18),new THREE.MeshBasicMaterial({map:logoTexture,transparent:true,depthWrite:false}),socket,0,.67,.52,'socket');

  const knee=new THREE.Group();knee.position.y=1.24;model.add(knee);
  cylinder(.20,.23,.34,metal,knee,0,.62,0,'knee');
  cylinder(.31,.31,.10,darkMetal,knee,0,.44,0,'knee');
  ring(.27,.023,accent,knee,0,.49,0,'y','knee');
  mesh(roundedBox(.50,.56,.48,.1),darkMetal,knee,0,.16,-.015,'knee');
  mesh(roundedBox(.39,.18,.48,.04),metal,knee,0,.42,0,'knee');
  for(const sign of [-1,1]){
    const cap=new THREE.Group();cap.position.set(sign*.34,0,0);knee.add(cap);cap.userData.base=cap.position.clone();kneeCaps.push(cap);
    mesh(roundedBox(.10,.74,.51,.09),titanium,cap,0,.03,-.015,'knee');
    const drum=cylinder(.255,.255,.11,darkMetal,cap,sign*.065,.1,.015,'knee');drum.rotation.z=Math.PI/2;
    ring(.22,.022,accent,cap,sign*.13,.1,.015,'x','knee');
    const hub=cylinder(.174,.174,.035,metal,cap,sign*.14,.1,.015,'knee');hub.rotation.z=Math.PI/2;
    const hub2=cylinder(.10,.10,.05,darkMetal,cap,sign*.16,.1,.015,'knee');hub2.rotation.z=Math.PI/2;
    bolt(cap,sign*.195,.1,.015,metal,'x',.06);
    for(let n=0;n<6;n++){const a=n/6*Math.PI*2;bolt(cap,sign*.165,.1+Math.sin(a)*.19,.015+Math.cos(a)*.19,black,'x',.022);}
    for(const y of [-.24,.34])bolt(cap,sign*.07,y,-.1,metal,'x',.045);
  }
  const axis=cylinder(.11,.11,.94,metal,knee,0,.1,.015,'knee');axis.rotation.z=Math.PI/2;

  lower=new THREE.Group();lower.position.y=1.24;model.add(lower);
  pylon=new THREE.Group();lower.add(pylon);
  const gy=(v)=>v-1.24;
  mesh(roundedBox(.36,.4,.34,.06),darkMetal,pylon,0,gy(.93),.03,'pylon');
  cylinder(.25,.20,.42,titanium,pylon,0,gy(.6),0,'pylon');
  cylinder(.185,.185,2.45,carbon,pylon,0,gy(-.84),.01,'pylon');
  for(const y of [.38,.19,-2.0,-2.13]){
    cylinder(.23,.23,.07,metal,pylon,0,gy(y),.01,'pylon');
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]) bolt(pylon,Math.sin(a)*.23,gy(y),.01+Math.cos(a)*.23,darkMetal,Math.abs(Math.sin(a))>.5?'x':'z',.028,'pylon');
  }
  ring(.191,.016,accent,pylon,0,gy(.27),.01,'y','pylon');
  ring(.191,.015,accent,pylon,0,gy(-1.92),.01,'y','pylon');
  cylinder(.16,.16,.95,metal,pylon,0,gy(.31),-.29,'knee');
  cylinder(.095,.095,.72,titanium,pylon,0,gy(-.48),-.29,'knee');
  cylinder(.18,.18,.13,darkMetal,pylon,0,gy(.83),-.29,'knee');
  cylinder(.18,.18,.09,darkMetal,pylon,0,gy(-.13),-.29,'knee');
  for(const y of [.82,-.76]){
    const b=cylinder(.10,.10,.40,titanium,pylon,0,gy(y),-.29,'knee');b.rotation.z=Math.PI/2;
    for(const sign of [-1,1]) bolt(pylon,sign*.21,gy(y),-.29,darkMetal,'x',.06,'knee');
  }
  const coil=[];for(let i=0;i<240;i++){const a=i/239*Math.PI*22;coil.push([.10+Math.cos(a)*.074,gy(.67-i/239*.62),-.29+Math.sin(a)*.074]);}tube(coil,.016,darkMetal,pylon,'knee',200);
  mesh(roundedBox(.29,.55,.07,.04),darkMetal,pylon,0,gy(.31),.25,'knee');
  const pcb=new THREE.MeshStandardMaterial({color:0x47654b,metalness:.45,roughness:.5});
  mesh(roundedBox(.24,.44,.018,.02),pcb,pylon,0,gy(.31),.299,'knee');
  for(let i=0;i<3;i++){mesh(roundedBox(.10,.065,.018,.003),black,pylon,.01,gy(.41-i*.12),.32,'knee');for(const sign of [-1,1])for(let j=0;j<4;j++)mesh(new THREE.BoxGeometry(.018,.007,.012),metal,pylon,sign*.058,gy(.41-i*.12+.026-j*.017),.325,'knee');}
  for(const x of [-.09,.09])for(const y of [.13,.49])bolt(pylon,x,gy(y),.32,metal,'z',.014,'knee');
  mesh(new THREE.SphereGeometry(.025,12,8),led,pylon,.085,gy(.41),.328,'knee');
  mesh(roundedBox(.28,.72,.15,.04),black,pylon,0,gy(-.65),.19,'pylon');
  for(let i=0;i<5;i++)mesh(roundedBox(.19,.018,.01,.005),darkMetal,pylon,0,gy(-.42-i*.10),.27,'pylon');
  tube([[.12,gy(.78),.1],[.21,gy(.5),.17],[.24,gy(-.5),.04],[.20,gy(-1.4),.02],[.09,gy(-2.1),.10]],.018,rubber,pylon,'pylon');
  tube([[-.13,gy(.64),.1],[-.23,gy(.34),.12],[-.24,gy(-.6),.09],[-.13,gy(-.92),.19]],.012,accent,pylon,'pylon');
  for(const sign of [-1,1])rod([sign*.19,gy(.43),-.05],[sign*.15,gy(-1.55),-.07],.034,titanium,pylon,'pylon');
  cylinder(.18,.13,.46,titanium,pylon,0,gy(-2.40),.02,'pylon');
  cylinder(.24,.24,.12,darkMetal,pylon,0,gy(-2.65),.02,'pylon');
  cylinder(.21,.21,.12,metal,pylon,0,gy(-2.78),.02,'pylon');
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])bolt(pylon,Math.sin(a)*.21,gy(-2.78),.02+Math.cos(a)*.21,darkMetal,Math.abs(Math.sin(a))>.5?'x':'z',.034,'pylon');

  const coverProfile=[[-3.95,.235,.25],[-3.75,.28,.28],[-3.25,.37,.34],[-2.45,.48,.40],[-1.65,.52,.40],[-.9,.44,.35],[-.57,.34,.29]];
  coverRight=new THREE.Group();coverLeft=new THREE.Group();coverFront=new THREE.Group();
  lower.add(coverRight,coverLeft,coverFront);
  mesh(shellGeometry(coverProfile,.52,2.92,.045),ceramic,coverRight,0,0,0,'covers');
  mesh(shellGeometry(coverProfile,3.36,Math.PI*2-.52,.045),ceramic,coverLeft,0,0,0,'covers');
  const frontProfile=coverProfile.map(([y,x,z])=>[y,x+.012,z+.018]);
  mesh(shellGeometry(frontProfile,-.43,.43,.04),ceramic,coverFront,0,0,0,'covers');
  mesh(shellGeometry([[-3.64,.295,.302],[-2.85,.43,.38],[-1.7,.535,.43],[-1.02,.47,.39]],-.08,.08,.012),accent,coverFront,0,0,.012,'covers');
  for(const sign of [-1,1]){
    const parent=sign>0?coverRight:coverLeft;
    for(const y of [-1.12,-1.30,-1.48,-1.66]){
      const sl=mesh(roundedBox(.024,.055,.24,.015),darkMetal,parent,sign*.46,y,.03,'covers');sl.rotation.z=sign*-.2;
    }
    for(const y of [-.9,-3.6])bolt(parent,sign*(y> -2?.41:.29),y,.02,metal,'x',.038,'covers');
    const seamPoints=[];for(let n=0;n<coverProfile.length;n++){const [y,rx,rz]=coverProfile[n];seamPoints.push([sign*rx*.52,y,rz*.855]);}tube(seamPoints,.012,darkMetal,parent,'covers',40);
    mesh(roundedBox(.018,.30,.10,.01),accent,parent,sign*.497,-1.99,.04,'covers');
  }

  foot=new THREE.Group();foot.position.set(0,gy(-3.01),.02);lower.add(foot);
  const ankle=cylinder(.19,.19,.56,titanium,foot,0,0,0,'foot');ankle.rotation.z=Math.PI/2;
  for(const sign of [-1,1]){
    ring(.146,.023,accent,foot,sign*.29,0,0,'x','foot');bolt(foot,sign*.32,0,0,darkMetal,'x',.072,'foot');
    mesh(roundedBox(.07,.32,.31,.06),darkMetal,foot,sign*.20,-.11,.03,'foot');
  }
  ribbon([[0,-.06,0],[0,-.18,.12],[0,-.48,.62],[0,-.57,1.28],[0,-.53,1.5]],t=>.37+Math.sin(t*Math.PI)*.22,.07,carbon,foot);
  for(const sign of [-1,1])ribbon([[0,-.16,.12],[0,-.30,.38],[0,-.52,.94],[0,-.55,1.47]],t=>.17+Math.sin(t*Math.PI)*.04,.037,carbon,foot,sign*.13);
  ribbon([[0,-.03,-.04],[0,-.18,-.29],[0,-.44,-.58],[0,-.57,-.54],[0,-.63,-.25],[0,-.62,.14]],t=>.37+Math.sin(t*Math.PI)*.05,.065,carbon,foot);
  ribbon([[0,-.67,-.53],[0,-.67,-.1],[0,-.65,.6],[0,-.64,1.33],[0,-.59,1.5]],t=>.38+Math.sin(t*Math.PI)*.22,.055,rubber,foot);
  tube([[-.225,-.66,-.30],[-.27,-.64,.23],[-.29,-.63,.75],[-.23,-.59,1.40]],.014,accent,foot,'foot');
  tube([[.225,-.66,-.30],[.27,-.64,.23],[.29,-.63,.75],[.23,-.59,1.40]],.014,accent,foot,'foot');
  for(let i=0;i<8;i++){const z=-.38+i*.22;mesh(roundedBox(.35+Math.sin(i/8*Math.PI)*.18,.028,.05,.01),darkMetal,foot,0,-.70,z,'foot');}
  mesh(roundedBox(.22,.12,.24,.02),metal,foot,0,-.28,.16,'foot');
  for(const x of [-.09,.09])for(const z of [.08,.23])bolt(foot,x,-.20,z,darkMetal,'y',.025,'foot');

  const anchor=(parent,pos)=>{const o=new THREE.Object3D();o.position.set(...pos);parent.add(o);return o;};
  createMarker('covers',anchor(coverRight,[.48,-2.0,.23]));
  createMarker('socket',anchor(socket,[.70,1.15,.36]));
  createMarker('knee',anchor(knee,[.48,.11,.20]));
  createMarker('pylon',anchor(pylon,[.23,gy(-1.65),.07]));
  createMarker('foot',anchor(foot,[.30,-.54,1.0]));
  model.traverse(o=>{if(o.isMesh){for(const mat of (Array.isArray(o.material)?o.material:[o.material])){if(!materialBase.has(mat))materialBase.set(mat,{emissive:mat.emissive?.clone(),intensity:mat.emissiveIntensity||0});}}});
  let meshCount=0,triangles=0;model.traverse(o=>{if(o.isMesh){meshCount++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});modelStats={meshes:meshCount,triangles:Math.round(triangles)};
}

function createMarker(id,anchor) {
  const p=parts.find(p=>p.id===id),el=document.createElement('button');el.className='hotspot';el.dataset.part=id;el.setAttribute('aria-label',p.name);el.title=p.name;
  el.innerHTML=`<span class="hotspot-dot">${p.no}</span><span class="hotspot-label">${p.name}</span>`;
  el.addEventListener('click',()=>{selectPart(id,true);if(id==='covers'&&mode==='explore')setProgress(progress>.3?0:.48);});
  $('#hotspots').append(el);markers.push({id,anchor,el});
}

function addStage() {
  stage=new THREE.Group();scene.add(stage);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-3.78;floor.receiveShadow=true;stage.add(floor);
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(54,70,37,0.17)');grad.addColorStop(.4,'rgba(54,70,37,0.08)');grad.addColorStop(1,'rgba(54,70,37,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.8,3.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-3.77,.3);stage.add(shadow);
  for(const radius of [1.65,2.15]){
    const points=[];for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;points.push(new THREE.Vector3(Math.sin(a)*radius,-3.765,Math.cos(a)*radius));}
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0xa8b699,dashSize:.06,gapSize:.09,transparent:true,opacity:.35}));line.computeLineDistances();stage.add(line);
  }
  for(const sign of [-1,1]){
    const points=[new THREE.Vector3(sign*1.82,-3.76,0),new THREE.Vector3(sign*2.03,-3.76,0)];stage.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xa1b38e,transparent:true,opacity:.6})));
  }
}

function resize() {
  if(!renderer)return;
  const width=viewport.clientWidth,height=viewport.clientHeight,aspect=width/height;
  const half=innerWidth<600?4.95:4.55;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
  camera.updateProjectionMatrix();renderer.setSize(width,height);
}

function moveCamera(view) {
  const positions={three:[8,2.5,11],front:[0,1.7,14],side:[14,1.7,.01],back:[.01,1.7,-14]};
  const target=new THREE.Vector3(...positions[view]);
  cameraTween={from:camera.position.clone(),to:target,start:performance.now(),duration:reducedMotion?1:850};
  $$('.view-presets button').forEach(el=>el.classList.toggle('selected',el.dataset.view===view));
}

function animate(time) {
  const dt=Math.min((time-lastTime)/1000||.016,.05);lastTime=time;
  if(playing){
    if(mode==='motion'){motionClock+=dt*.9;manualAngle=(1-Math.cos(motionClock))*33;}
    else {progress+=dt*.105*playDirection;if(progress>=1){progress=1;playDirection=-1;}if(progress<=0){progress=0;playing=false;playDirection=1;}}
    updateProgressUI();
  }
  const speed=reducedMotion?1:1-Math.exp(-dt*7);
  animatedProgress=lerp(animatedProgress,progress,speed);animatedAngle=lerp(animatedAngle,mode==='motion'?manualAngle:0,speed);
  const opening=smooth(0,.55,animatedProgress),spread=smooth(.48,1,animatedProgress);
  coverRight.position.set(opening*1.03+spread*.28,spread*-.12,opening*.05);
  coverRight.rotation.set(0,opening*.48,-opening*.14);
  coverLeft.position.set(-opening*1.03-spread*.28,spread*-.12,-opening*.03);
  coverLeft.rotation.set(0,-opening*.48,opening*.14);
  coverFront.position.set(0,spread*-.18,opening*1.05+spread*.25);coverFront.rotation.x=opening*-.08;
  socket.position.y=2.08+spread*.7;foot.position.y=(-3.01-1.24)-spread*.55;pylon.position.y=-spread*.12;
  stage.position.y=-spread*.6;
  kneeCaps.forEach(cap=>{cap.position.x=cap.userData.base.x+Math.sign(cap.userData.base.x)*spread*.4;});
  lower.rotation.x=THREE.MathUtils.degToRad(animatedAngle);
  const fit=innerWidth<600?1-spread*.19:1-spread*.10;
  camera.zoom=lerp(camera.zoom,userZoom*fit,speed);camera.updateProjectionMatrix();
  if(cameraTween){const t=clamp((time-cameraTween.start)/cameraTween.duration,0,1),e=1-Math.pow(1-t,3);camera.position.lerpVectors(cameraTween.from,cameraTween.to,e);if(t>=1)cameraTween=null;}
  controls.update();
  renderer.render(scene,camera);
  model.updateMatrixWorld();
  const bounds=viewport.getBoundingClientRect(),mainBounds=$('.studio').getBoundingClientRect();
  const screenVector=new THREE.Vector3();
  markers.forEach(marker=>{
    marker.anchor.getWorldPosition(screenVector);screenVector.project(camera);
    const x=(screenVector.x+1)/2*bounds.width+bounds.left-mainBounds.left;
    const y=(-screenVector.y+1)/2*bounds.height+bounds.top-mainBounds.top;
    const hidden=!labels||screenVector.z>1||(marker.id==='pylon'&&animatedProgress<.2&&!xray)||x<0||x>innerWidth-30||y<0||y>mainBounds.height-115;
    marker.el.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;
    marker.el.style.opacity=hidden?'0':'1';marker.el.style.pointerEvents=hidden?'none':'auto';marker.el.setAttribute('aria-hidden',String(hidden));marker.el.tabIndex=hidden?-1:0;
  });
  if(firstFrame){viewport.classList.add('ready');firstFrame=false;}
  requestAnimationFrame(animate);
}

function initScene() {
  scene=new THREE.Scene();
  camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,80);camera.position.set(8,2.5,11);camera.lookAt(0,0,0);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x000000,0);viewport.append(renderer.domElement);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();envTarget=pmrem.fromScene(room,.04);scene.environment=envTarget.texture;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff,0xb8c2aa,2.0));
  const key=new THREE.DirectionalLight(0xffffff,4.3);key.position.set(4,7,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.normalBias=.025;key.shadow.bias=-.0001;scene.add(key);
  const rim=new THREE.DirectionalLight(0xe8f5dc,3);rim.position.set(-5,3,-4);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xffffff,.8);fill.position.set(0,0,7);scene.add(fill);
  buildModel();addStage();
  viewport.addEventListener('wheel',event=>{
    event.preventDefault();event.stopImmediatePropagation();
    const d=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?300:1);
    if(event.shiftKey||event.ctrlKey){userZoom=clamp(userZoom-d*.001,.62,2);}
    else setProgress((mode==='motion'?manualAngle/70:progress)+d*.0007);
  },{passive:false,capture:true});
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI-.18;controls.minZoom=.62;controls.maxZoom=2.0;controls.rotateSpeed=.65;controls.target.set(0,0,0);
  controls.addEventListener('start',()=>{cameraTween=null;});
  let previousDistance=null;
  renderer.domElement.addEventListener('touchstart',e=>{if(e.touches.length===2)previousDistance=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);},{passive:true});
  renderer.domElement.addEventListener('touchmove',e=>{if(e.touches.length===2&&previousDistance){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);userZoom=clamp(userZoom*d/previousDistance,.62,2);previousDistance=d;}},{passive:true});
  controls.enableZoom=false;
  renderer.domElement.addEventListener('touchend',()=>{previousDistance=null;},{passive:true});
  let pointerStart=null;
  renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
    const r=renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);
    const hits=ray.intersectObjects(selectable,false);if(hits.length){const id=hits[0].object.userData.part;selectPart(id,true);if(id==='covers'&&mode==='explore')setProgress(progress>.3?0:.48);}
  });
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();playing=false;toast('Графический контекст потерян. Перезагрузите страницу.');});
  resize();new ResizeObserver(resize).observe(viewport);selectPart('covers');requestAnimationFrame(animate);
}

parts.forEach(p=>{
  const b=document.createElement('button');b.className='part-row';b.dataset.part=p.id;b.innerHTML=`<span>${p.no}</span><div><b>${p.name}</b><small>${p.sub}</small></div><svg><use href="#i-arrow"/></svg>`;b.addEventListener('click',()=>selectPart(p.id,true));$('#parts-list').append(b);
});
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
slider.addEventListener('input',()=>setProgress(Number(slider.value)/100));
$('#reveal').addEventListener('click',()=>{if(mode==='motion'){playing=!playing;if(playing)motionClock=0;}else setProgress(progress>.3?0:1);updateProgressUI();});
$('#assemble').addEventListener('click',()=>{setProgress(0);if(mode==='explore')selectPart('covers');});
$('#auto-play').addEventListener('click',()=>{playing=!playing;if(mode==='explore')playDirection=progress>.98?-1:1;else motionClock=Math.acos(clamp(1-manualAngle/33,-1,1));updateProgressUI();});
$$('[data-progress]').forEach(b=>b.addEventListener('click',()=>setProgress(mode==='motion'?(b.dataset.progress==='0.48'?.5:Number(b.dataset.progress)):Number(b.dataset.progress))));
$$('[data-color]').forEach(b=>b.addEventListener('click',()=>{
  const colors={ceramic:0xd5ddcc,graphite:0x303c34,lime:0xb3d95e},names={ceramic:'Керамика',graphite:'Графит',lime:'Лайм'};
  coverMaterials.forEach(m=>m.color.setHex(colors[b.dataset.color]));
  $$('[data-color]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});$('#finish-name').textContent=names[b.dataset.color];
}));
$('#xray-button').addEventListener('click',()=>{xray=!xray;coverMaterials.forEach(m=>{m.transparent=xray;m.opacity=xray?.17:1;m.depthWrite=!xray;m.needsUpdate=true;});$('#xray-button').classList.toggle('active',xray);$('#xray-button').setAttribute('aria-pressed',String(xray));});
$('#labels-button').addEventListener('click',()=>{labels=!labels;$('#labels-button').classList.toggle('active',labels);$('#labels-button').setAttribute('aria-pressed',String(labels));});
const toggleParts=()=>{$('#parts-panel').hidden=!$('#parts-panel').hidden;};
$('#parts-button').addEventListener('click',toggleParts);$('#all-parts').addEventListener('click',toggleParts);$('#close-parts').addEventListener('click',()=>$('#parts-panel').hidden=true);
$('#zoom-in').addEventListener('click',()=>{userZoom=clamp(userZoom+.18,.62,2);});$('#zoom-out').addEventListener('click',()=>{userZoom=clamp(userZoom-.18,.62,2);});
function reset(){setMode('explore');setProgress(0);userZoom=1;xray=false;coverMaterials.forEach(m=>{m.transparent=false;m.opacity=1;m.depthWrite=true;m.needsUpdate=true;});$('#xray-button').classList.remove('active');$('#xray-button').setAttribute('aria-pressed','false');moveCamera('three');$('#parts-panel').hidden=true;toast('Исходный вид');}
$('#reset').addEventListener('click',reset);
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>moveCamera(b.dataset.view)));
$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());$('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
$$('dialog').forEach(d=>{d.querySelector('.dialog-close').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Полный экран недоступен в этом окне');}});
document.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||$$('dialog').some(d=>d.open))return;
  if(e.code==='Space'){e.preventDefault();$('#auto-play').click();}
  if(e.code==='KeyR')reset();
  if(e.key==='Escape')$('#parts-panel').hidden=true;
  if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();setProgress((mode==='motion'?manualAngle/70:progress)+.05);}
  if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();setProgress((mode==='motion'?manualAngle/70:progress)-.05);}
});
updateProgressUI();
try {initScene();} catch(error) {
  console.error('KINETIC initialization failed',error);
  $('#loading').innerHTML='<div class="error-state">Для интерактивной модели нужен WebGL. Включите аппаратное ускорение в браузере и обновите страницу.<button onclick="location.reload()">Попробовать снова</button></div>';
}

window.kinetic={getState:()=>({mode,progress,animatedProgress,angle:manualAngle,animatedAngle,playing,selected,xray,labels,zoom:userZoom,stats:modelStats,webgl:!!renderer?.getContext(),camera:camera?.position.toArray()}),setProgress,setMode,reset};
