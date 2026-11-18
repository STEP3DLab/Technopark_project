import * as T from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { Reflector } from './vendor/objects/Reflector.js';
import { SoftwareRenderer } from './cpu.js';
import { showPanorama, hidePanorama } from './panorama.js';

const $ = selector => document.querySelector(selector);
const rooms = [
  { id: 'all', name: 'Вся квартира', sub: 'Аксонометрия' },
  { id: 'living', name: 'Гостиная', sub: 'Вид на столовую', eye: [654, 669, 1.53], target: [611, 312, 1.27] },
  { id: 'kitchen', name: 'Кухня', sub: 'Вид от окна', eye: [626, 353, 1.55], target: [619, 740, 1.15] },
  { id: 'bedroom', name: 'Спальня', sub: 'Рабочее место у окна', eye: [1012, 593, 1.54], target: [1320, 359, 1.10] },
  { id: 'bath', name: 'Ванная', sub: 'Вид от входа', eye: [1065, 827, 1.50], target: [1385, 838, 1.20] }
];
const canvas = $('#viewport > canvas'), viewport = $('#viewport'), still = $('#still'), status = $('#status');
const shell = [], ceilings = [], daylight = [], roomLights = [], blockers = [];
const cut = new T.Plane(new T.Vector3(0, -1, 0), .88);
const point = a => new T.Vector3((a[0] - 900) / 110, a[2], (a[1] - 650) / 110);
let current = 1, mode = 'render', previousMode, previousRoom;
let renderer, camera, scene, orbit, sun, hemisphere, studioEnv, ready = false, loading = false, failed = false, dirty = false;
let vanityReflection;
let yaw = 0, pitch = 0, pointer = null;
const fallback = '3D недоступно в этом браузере. Выберите панораму или скачайте модель.';

for (const [i, room] of rooms.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'room';
  button.dataset.room = room.id;
  const img = new Image();
  img.src = 'media/' + ('photo-' + room.id) + '.webp';
  img.alt = '';
  const label = document.createElement('span');
  const title = document.createElement('b'), note = document.createElement('small');
  title.textContent = room.name;
  note.textContent = room.sub;
  label.append(title, note);
  button.append(img, label);
  button.onclick = () => {
    current = i;
    if ((i === 0 && mode !== 'render') || mode === 'plan') mode = 'model';
    update(true);
  };
  $('#views').append(button);
}
document.querySelectorAll('[data-mode]').forEach(button => {
  button.onclick = () => {
    mode = button.dataset.mode;
    if (current === 0 && ['sketch','panorama'].includes(mode)) current = 1;
    update(true);
  };
});
const hints = {
  plan: 'План расстановки мебели, лист 7.',
  sketch: 'Эскиз отделки и мебели с выбранного ракурса.',
  render: 'Фотореалистичная визуализация выбранного ракурса.',
  panorama: 'Потяните изображение, чтобы осмотреться на 360°.'
};
function update(reset = false) {
  const room = rooms[current], modelView = mode === 'model';
  $('#title').textContent = mode === 'plan' ? 'План расстановки мебели' : room.name;
  document.querySelectorAll('.room').forEach((b, i) => b.setAttribute('aria-pressed', String(i === current)));
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  canvas.hidden = !modelView;
  still.hidden = modelView || mode === 'panorama';
  if (mode === 'panorama') {
    if (mode !== previousMode || current !== previousRoom) showPanorama(room.id);
  } else if (previousMode === 'panorama') hidePanorama();
  const panel = $('#pano');
  if (panel) panel.hidden = mode !== 'panorama';
  if (!still.hidden) {
    const asset = mode === 'plan' ? 'plan' : (mode === 'render' ? 'photo-' : '') + room.id;
    still.src = 'media/' + asset + '.webp';
    still.alt = mode === 'plan' ? 'План квартиры' : (mode === 'render' ? 'Визуализация — ' : 'Эскиз — ') + room.name;
  }
  viewport.dataset.mode = mode;
  document.documentElement.dataset.room = room.id;
  document.documentElement.dataset.mode = mode;
  $('#tools').hidden = !modelView || !ready;
  status.hidden = !modelView || ready;
  if (!ready) status.textContent = failed ? fallback : 'Загружается 3D-модель…';
  $('#hint').textContent = hints[mode] || (current ? 'Потяните, чтобы осмотреться. Стрелки или WASD — движение, колёсико — масштаб.' : 'Вращайте модель пальцем или мышью. Масштаб — двумя пальцами или колёсиком.');
  previousMode = mode;
  previousRoom = current;
  if (modelView && !loading && !failed) openModel();
  if (ready) {
    orbit.enabled = modelView && current === 0;
    if (modelView && reset) resetView();
    walks.forEach(b=>b.hidden=!current);
    dirty = true;
  }
  window.dispatchEvent(new CustomEvent('apartment:view', { detail: { id: room.id, mode, name: room.name } }));
}

// Procedural high-dynamic-range window, sky and floor for coherent metal/glass reflections.
function environment() {
  const w = 192, h = 96, data = new Float32Array(w*h*4);
  for (let y = 0; y<h; y++) for (let x = 0; x<w; x++) {
    const theta = (y+.5)/h*Math.PI, phi = ((x+.5)/w-.5)*Math.PI*2;
    const up = -Math.cos(theta), east = Math.sin(theta)*Math.cos(phi), north = Math.sin(theta)*Math.sin(phi);
    const sky = Math.max(up,0), lower = Math.max(-up,0);
    const glass = north < -.59 && Math.abs(east)<.59 && up>-.12 && up<.68 ? 1.7 : 0;
    const i = 4*(y*w+x);
    data.set([.24+.33*sky+.19*lower+glass,.22+.40*sky+.13*lower+glass*.96,.18+.56*sky+.07*lower+glass*.89,1],i);
  }
  const source = new T.DataTexture(data,w,h,T.RGBAFormat,T.FloatType);
  source.mapping = T.EquirectangularReflectionMapping;
  source.needsUpdate = true;
  const generator = new T.PMREMGenerator(renderer);
  studioEnv = generator.fromEquirectangular(source);
  generator.dispose();
  source.dispose();
  return studioEnv.texture;
}
function addLights() {
  hemisphere = new T.HemisphereLight(0xf1f4ff, 0xb99a79, .85);
  scene.add(hemisphere);
  sun = new T.DirectionalLight(0xffedcd, 3.4);
  sun.position.set(-5,7,-8);
  sun.castShadow = true;
  const mapSize = Math.min(2048, renderer.capabilities?.maxTextureSize || 2048);
  sun.shadow.mapSize.set(mapSize,mapSize);
  Object.assign(sun.shadow.camera,{left:-7.8,right:7.8,top:7.8,bottom:-7.8,near:.2,far:32});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00025;
  sun.shadow.normalBias = .013;
  sun.shadow.radius = 3;
  scene.add(sun,sun.target);
  for (const [position,color,intensity,reach] of [
    [[620,216,1.9],0xe4efff,23,7], [[1254,217,1.94],0xecf5ff,20,7],
    [[618,283,1.68],0xffd39e,5,3.8], [[669,695,1.54],0xffe1b2,5,3.4],
    [[1193,815,2.48],0xffe2bc,24,7], [[1371,856,2.51],0xffe6c8,13,5],
    [[1376,412,1.47],0xffd5a1,3.2,2.7]
  ]) {
    const light = new T.PointLight(color,intensity,reach,2);
    light.position.copy(point(position));
    scene.add(light); roomLights.push(light);
  }
}
function resetView() {
  const inside = current > 0;
  if (vanityReflection) vanityReflection.visible = rooms[current].id === 'bath';
  ceilings.forEach(o => o.visible = inside);
  daylight.forEach(o => o.visible = inside);
  shell.forEach(o => o.material.clippingPlanes = inside ? [] : [cut]);
  roomLights.forEach(o => o.visible = inside);
  sun.position.set(...(inside ? [-5,4.8,-9.5] : [-5,9,-7]));
  sun.intensity = inside ? 3.8 : 3.0;
  hemisphere.intensity = inside ? .93 : .8;
  if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
  camera.fov = inside ? (camera.aspect < 1 ? 78 : 64) : 38;
  camera.updateProjectionMatrix();
  if (inside) {
    const r = rooms[current];
    camera.position.copy(point(r.eye));
    const dir = point(r.target).sub(camera.position).normalize();
    yaw = Math.atan2(-dir.x,-dir.z);
    pitch = Math.asin(dir.y);
    aim();
  } else {
    orbit.target.set(.12,.35,-.51);
    const aspectFactor = Math.max(1,1.27/camera.aspect);
    camera.position.set(8.0*aspectFactor,12.1*aspectFactor,9.0*aspectFactor);
    orbit.update();
  }
  dirty = true;
}
function aim() { camera.rotation.set(pitch,yaw,0,'YXZ'); dirty = true }
function zoom(multiplier) {
  if (!ready) return;
  if (current) {
    camera.fov = T.MathUtils.clamp(camera.fov*multiplier,32,94);
    camera.updateProjectionMatrix();
  } else {
    const d = camera.position.clone().sub(orbit.target);
    const distance = T.MathUtils.clamp(d.length()*multiplier,orbit.minDistance,orbit.maxDistance);
    camera.position.copy(orbit.target).add(d.setLength(distance));
    orbit.update();
  }
  dirty = true;
}
// Building footprint in coordinates of the source furniture plan. Open doors share
// walkable floor with the corridor; solid objects come from the exported meshes.
const floors = [
 [429,720,174,760],[720,970,295,760],[807,975,715,1030],
 [966,982,537,627],[975,1095,296,713],[1095,1423,187,713],[973,1423,722,840],
 [1047,1423,839,955],[1047,1217,955,1028],[496,809,765,1030],
 [847,922,252,298],[780,1067,157,256]
];
function withinBuilding(x,z) {
  const u=x*110+900,v=z*110+650;
  return floors.some(([x1,x2,y1,y2])=>u>=x1&&u<=x2&&v>=y1&&v<=y2);
}
function walkable(x,z) {
  const radius=.135;
  if (![[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dz])=>withinBuilding(x+dx,z+dz))) return false;
  return !blockers.some(b=>{
    const dx=x-T.MathUtils.clamp(x,b.min.x,b.max.x), dz=z-T.MathUtils.clamp(z,b.min.z,b.max.z);
    return dx*dx + dz*dz < radius*radius;
  });
}
function walk(forward,side) {
  if (!ready || mode!=='model' || !current) return;
  const deltaX=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)/6;
  const deltaZ=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)/6;
  for(let i=0;i<6;i++){
    const p=camera.position;
    if(walkable(p.x+deltaX,p.z)) p.x+=deltaX;
    if(walkable(p.x,p.z+deltaZ)) p.z+=deltaZ;
  }
  dirty = true;
}
const walks=[];
for(const [label,symbol,direction] of [['Шаг вперёд','↑',1],['Шаг назад','↓',-1]]) {
  const button=document.createElement('button');
  button.type='button'; button.title=label;button.setAttribute('aria-label',label);
  button.textContent=symbol;button.onclick=()=>walk(.28*direction,0);
  $('#tools').insertBefore(button,$('#minus'));walks.push(button);
}
const directions={KeyW:[1,0],ArrowUp:[1,0],KeyS:[-1,0],ArrowDown:[-1,0],KeyA:[0,-1],ArrowLeft:[0,-1],KeyD:[0,1],ArrowRight:[0,1]};
document.addEventListener('keydown',e=>{
  if(e.metaKey||e.altKey||e.ctrlKey||!current||mode!=='model'||!ready||!directions[e.code])return;
  if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;
  e.preventDefault();const [f,s]=directions[e.code];walk(f*.12,s*.12);
});
$('#minus').onclick = () => zoom(1.17);
$('#plus').onclick = () => zoom(.85);
$('#reset').onclick = () => { if (ready) resetView() };
canvas.addEventListener('pointerdown',e => {
  if (current && ready) { pointer = {id:e.pointerId,x:e.clientX,y:e.clientY}; canvas.setPointerCapture(e.pointerId) }
});
canvas.addEventListener('pointermove',e => {
  if (!current || pointer?.id !== e.pointerId) return;
  yaw += (e.clientX-pointer.x)*.0045;
  pitch = T.MathUtils.clamp(pitch+(e.clientY-pointer.y)*.004,-1.32,1.32);
  pointer.x=e.clientX; pointer.y=e.clientY; aim();
});
for (const event of ['pointerup','pointercancel']) canvas.addEventListener(event,()=>pointer=null);
canvas.addEventListener('wheel',e => {
  if (current) { e.preventDefault(); zoom(Math.exp(Math.sign(e.deltaY)*.075)) }
},{passive:false});
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w,h,false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  dirty = true;
}
function failure(error) { console.warn('Apartment viewer',error); failed=true; update() }
function openModel() {
  loading = true;
  try {
    try { renderer = new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'}) }
    catch { renderer = new SoftwareRenderer(canvas) }
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.85));
    renderer.localClippingEnabled = true;
    scene = new T.Scene();
    scene.background = new T.Color(0xe6e3d8);
    if (renderer.isWebGLRenderer) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace = T.SRGBColorSpace;
      scene.environment = environment();
      scene.environmentIntensity = .72;
    }
    camera = new T.PerspectiveCamera(38,1,.035,100);
    orbit = new OrbitControls(camera,canvas);
    orbit.minDistance = 3; orbit.maxDistance = 38; orbit.maxPolarAngle = Math.PI*.47;
    orbit.addEventListener('change',()=>dirty=true);
    addLights();
    const ground = new T.Mesh(new T.PlaneGeometry(180,180),new T.MeshStandardMaterial({color:0xd8d3c4,roughness:1}));
    ground.rotation.x = -Math.PI/2; ground.position.y = -.09; ground.receiveShadow = true;
    scene.add(ground);
    resize();
    new ResizeObserver(resize).observe(viewport);
    new GLTFLoader().load('./apartment.glb',g => {
      scene.add(g.scene);
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const name = o.name.replace(/_/g,' ').toLowerCase();
        if (renderer.isWebGLRenderer && name === 'mirror') {
          const bounds = new T.Box3().setFromObject(o), extent = bounds.getSize(new T.Vector3());
          const plane = new T.PlaneGeometry(Math.max(.01,extent.x-.035), Math.max(.01,extent.y-.035));
          vanityReflection = new Reflector(plane, {textureWidth:640,textureHeight:640,clipBias:.003,color:0xbdbcb9,multisample:0});
          bounds.getCenter(vanityReflection.position);
          vanityReflection.position.z = bounds.max.z + .001;
          scene.add(vanityReflection);
        }
        const bounds=new T.Box3().setFromObject(o);
        if (bounds.min.y<1.62 && bounds.max.y>.20 && !/curtain|folded towel|sky|courtyard/.test(name)) blockers.push(bounds);
        const pane = /sky glass|balcony glazing|glass screen|glass left|sky panorama|window view/.test(name);
        const textile = /curtain/.test(name);
        o.castShadow = !pane && !textile && !o.material.transparent;
        o.receiveShadow = !pane;
        if (/dressing shelf|timber clothes rail|cupboard shelf|clothes rail|ceiling$|ceiling stem|light cord|lamp arm|opal glass globe|track|enamel shade|recessed light|small opal pendant|^spot|^drop|warm ceiling/.test(name)) ceilings.push(o);
        else if (pane || textile) daylight.push(o);
        else if (/mirror|microwave|upper door|upper cabinet|tall fridge|integrated refrigerator|laundry tower|oven trim|wall|partition|entry side|entry door|lintel|window frame|balcony return|north recess|balcony door frame|closet$|dressing partition|wardrobe|tall cabinet|kitchen backing|return by desk|loggia outer|loggia end|vanity wall|bath back wall/.test(name)) {
          o.material = o.material.clone();
          o.material.clipShadows = true;
          shell.push(o);
        }
        if (o.material.map && renderer.capabilities) o.material.map.anisotropy = Math.min(4,renderer.capabilities.getMaxAnisotropy());
      });
      ready=true;
      update(true);
    },undefined,failure);
    renderer.setAnimationLoop(()=>{
      if (dirty && ready && mode==='model') { renderer.render(scene,camera); dirty=false }
    });
  } catch(error) { failure(error) }
}
update();
