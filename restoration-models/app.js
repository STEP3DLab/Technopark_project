import * as THREE from './vendor/three.module.min.js';
import {CanvasRenderer} from './canvas-renderer.js';
import {OrbitControls} from './vendor/OrbitControls.js';

const $ = id => document.getElementById(id);
const models = {
  cup: {title:'Стаканчик с медальоном', desc:'Овальная розетка с двенадцатью лепестками повторяет изгиб стенки. Корпус и медальон печатаются одной деталью.', stl:'01_Cup_medallion.stl', sheet:'Cup_review.png', size:'21,5 МиБ', h:30, specs:[['Высота','30 мм'],['Венчик / основание','Ø40 / Ø25 мм'],['Медальон','15 × 22 мм'],['Поля сверху и снизу','по 4 мм']], print:'Масштаб 100%, основанием вниз. Для FDM добавьте локальную поддержку под нижней дугой медальона.', angle:[-17,11]},
  bowl: {title:'Чаша с лепестками', desc:'Восемь вогнутых лепестков с округлыми краями сходятся к центральному сквозному отверстию.', stl:'02_Bowl_fluted.stl', sheet:'Bowl_review.png', size:'18,1 МиБ', h:25, specs:[['Наружный диаметр','Ø46 мм'],['Высота','25 мм'],['Сквозное отверстие','Ø10 мм'],['От венчика до кромки отверстия','15 мм']], print:'Масштаб 100%, кольцевым основанием вниз. Сквозное отверстие проходит через всю ножку чаши.', angle:[10,48]}
};
let current, currentMesh, renderer, scene, camera, controls, selected, pending, frame, token=0;
const cache=new Map();
const deg=THREE.MathUtils.degToRad;
function stateFromURL(){
  const [part,query='']=location.hash.slice(1).split('?');
  return {key:part==='bowl'?'bowl':'cup',params:new URLSearchParams(query)};
}
function cameraState(){
  if(!controls) return '';
  const rel=camera.position.clone().sub(controls.target);
  const ang=new THREE.Spherical().setFromVector3(rel);
  const a=[THREE.MathUtils.radToDeg(ang.theta),90-THREE.MathUtils.radToDeg(ang.phi),ang.radius,...controls.target.toArray()];
  return a.map(x=>x.toFixed(2)).join(',');
}
function shareURL(){
  const url=new URL(location.href);const s=cameraState();
  url.hash=current+(s?'?v='+s:'');return url.href;
}
function paint(){
  if(frame || !renderer)return;
  frame=requestAnimationFrame(()=>{frame=undefined;renderer.render(scene,camera);});
}
function highlight(name){
  for(const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed',String(b.dataset.view===name));
}
function setView(name='default',parameters){
  if(!controls)return;
  const data=models[current], center=data.h/2;
  const radius=(data.h===30?60:65)*Math.max(1,1/camera.aspect);
  const [az,el]=name==='top'?[0,89.8]:name==='front'?[0,0]:data.angle;
  let v=[az,el,radius,0,center,0];
  if(parameters){const values=parameters.split(',').map(Number);
    if(values.length===6&&values.every(Number.isFinite)&&values[2]>=12&&values[2]<=200&&values.slice(3).every(x=>Math.abs(x)<100)){
      v=values;name=null;
    }
  }
  controls.target.set(v[3],v[4],v[5]);
  const sph=new THREE.Spherical(v[2],deg(90-THREE.MathUtils.clamp(v[1],-89.85,89.85)),deg(v[0]));
  camera.position.setFromSpherical(sph).add(controls.target);controls.update();highlight(name);paint();
}
function init3D(){
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}
  catch{renderer=new CanvasRenderer();}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Вращение модели стрелками. Масштаб клавишами плюс и минус.');$('canvasMount').append(canvas);
  scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0x8e918c,1.32));
  for(const [x,y,z,color,intensity] of [[-45,65,55,0xfffdf8,2.15],[45,12,35,0xf3f6ff,.49],[15,40,-45,0xffffff,1.1]]){
    const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
  }
  camera=new THREE.PerspectiveCamera(39,1,.3,600);
  controls=new OrbitControls(camera,canvas);controls.minDistance=12;controls.maxDistance=200;controls.enableDamping=false;controls.zoomSpeed=.93;
  controls.addEventListener('change',paint);controls.addEventListener('start',()=>highlight(null));
  const resize=()=>{const box=$('stage');camera.aspect=box.clientWidth/box.clientHeight;camera.updateProjectionMatrix();
    renderer.setSize(box.clientWidth,box.clientHeight,false);paint();};
  new ResizeObserver(resize).observe($('stage'));resize();
  canvas.addEventListener('keydown',e=>{
    const change={ArrowLeft:[-.13,0],ArrowRight:[.13,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]}[e.key];
    if(change){const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));s.theta+=change[0];s.phi+=change[1];s.makeSafe();camera.position.setFromSpherical(s).add(controls.target);controls.update();highlight(null);e.preventDefault();}
    if(['+','=','-','_'].includes(e.key)){zoomBy(e.key==='-'||e.key==='_'?1.18:1/1.18);e.preventDefault();}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('stage').classList.remove('ready');$('load').hidden=false;$('load').textContent='3D-показ приостановлен. Обновите страницу или откройте лист с размерами.';});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
}
function zoomBy(factor){
  if(!controls)return;
  const offset=camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();paint();
}
async function get(url,signal){const r=await fetch(url,{signal});if(!r.ok)throw Error('HTTP '+r.status);return r;}
function decodeMesh(buffer){
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x31305652)throw Error('Неверный формат модели');
  const vertices=view.getUint32(4,true),triangles=view.getUint32(8,true);
  if(buffer.byteLength!==12+(vertices+triangles)*12)throw Error('Неполные данные');
  let offset=12;
  function read(n){
    const out=new Uint32Array(n*3);
    for(let c=0;c<3;c++){
      const bytes=new Uint8Array(buffer,offset,n*4);offset+=n*4;let value=0;
      for(let i=0;i<n;i++){const d=bytes[i]|(bytes[n+i]<<8)|(bytes[2*n+i]<<16)|(bytes[3*n+i]<<24);value=(value+d)>>>0;out[3*i+c]=value;}
    }
    return out;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(read(vertices).buffer),3));
  geo.setIndex(new THREE.BufferAttribute(read(triangles),1));geo.computeVertexNormals();return geo;
}
async function loadGeometry(key,signal){
  if(cache.has(key))return cache.get(key);
  let geo;
  if('DecompressionStream' in window){
    const info=await (await get('./assets/'+key+'.json',signal)).json();
    const chunks=await Promise.all(info.parts.map(async file=>(await get('./assets/'+file,signal)).arrayBuffer()));
    const stream=new Blob(chunks).stream().pipeThrough(new DecompressionStream('gzip'));
    geo=decodeMesh(await new Response(stream).arrayBuffer());
  }else{
    const buffer=await (await get('./files/'+models[key].stl,signal)).arrayBuffer(),v=new DataView(buffer);
    const n=v.getUint32(80,true),position=new Float32Array(n*9),normal=new Float32Array(n*9);
    for(let i=0;i<n;i++)for(let j=0;j<9;j++){position[9*i+j]=v.getFloat32(96+50*i+4*j,true);normal[9*i+j]=v.getFloat32(84+50*i+4*(j%3),true);}
    geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(position,3));geo.setAttribute('normal',new THREE.BufferAttribute(normal,3));
  }
  geo.rotateX(-Math.PI/2);geo.computeBoundingSphere();cache.set(key,geo);return geo;
}
async function showModel(){
  const {key,params}=stateFromURL(), data=models[key];
  current=key;const id=++token;pending?.abort();pending=new AbortController();
  $('name').textContent=data.title;$('desc').textContent=data.desc;$('print').textContent=data.print;$('size').textContent=data.size;
  $('spec').replaceChildren(...data.specs.map(([term,val])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=term;dd.textContent=val;row.append(dt,dd);return row;}));
  $('poster').src='./assets/'+key+'.webp';$('poster').alt=data.title;
  $('stl').href='./files/'+data.stl;$('sheet').href='./assets/'+data.sheet;
  for(const kind of Object.keys(models)){const tab=$('choose-'+kind);if(kind===key)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
  $('stage').classList.remove('ready');$('load').hidden=false;$('load').textContent='Загружаем 3D-модель…';$('notice').textContent='';
  if(currentMesh)currentMesh.visible=false;
  if(!renderer){$('load').textContent='Доступны изображение, разрез и STL. Для вращения нужен WebGL.';return;}
  setView('default',params.get('v'));
  try{
    const geometry=await loadGeometry(key,pending.signal);if(id!==token)return;
    if(!currentMesh){currentMesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x939591,roughness:.91,metalness:0}));scene.add(currentMesh);}
    currentMesh.geometry=geometry;currentMesh.visible=true;renderer.render(scene,camera);$('stage').classList.add('ready');$('load').hidden=true;
  }catch(error){if(id!==token)return;$('load').textContent='Не удалось загрузить 3D. Обновите страницу или откройте лист с размерами.';}
}
async function copyText(text,node){
  try{
    if(navigator.clipboard && window.isSecureContext)await navigator.clipboard.writeText(text);
    else{const t=document.createElement('textarea');(node.closest('dialog')||document.body).append(t);t.value=text;t.select();const ok=document.execCommand('copy');t.remove();if(!ok)throw Error();}
    node.textContent='Скопировано.';
  }catch{window.prompt('Скопируйте текст',text);}
}
try{init3D();}catch{renderer=null;controls=null;}
window.addEventListener('hashchange',showModel);
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('plus').onclick=()=>zoomBy(1/1.22);$('minus').onclick=()=>zoomBy(1.22);$('reset').onclick=()=>setView('default');
$('share').onclick=()=>copyText(shareURL(),$('notice'));
$('comment').onclick=()=>{selected={name:models[current].title,link:shareURL()};$('remark').value='';$('note-status').textContent='';$('subject').textContent=selected.name;$('dialog').showModal();$('remark').focus();};
function note(){const t=$('remark').value.trim();if(!t){$('note-status').textContent='Добавьте текст замечания.';$('remark').focus();return '';}return selected.name+'\n'+t+'\n\nРакурс: '+selected.link;}
$('copy-note').onclick=()=>{const msg=note();if(msg)copyText(msg,$('note-status'));};
$('issue').onclick=()=>{const msg=note();if(msg){const u=new URL('https://github.com/STEP3DLab/Technopark_project/issues/new');u.searchParams.set('title',selected.name+' — замечание');u.searchParams.set('body',msg);window.open(u.href,'_blank','noopener,noreferrer');}};
showModel();
