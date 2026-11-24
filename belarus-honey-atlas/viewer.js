import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

async function fetchModel(name) {
  const response = await fetch('./assets/'+name+'.bin');
  if (!response.ok) throw new Error('Не удалось загрузить геометрию');
  const file = await response.blob();
  let data;
  if (typeof DecompressionStream === 'function') {
    data = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  } else {
    const {gunzipSync} = await import('./vendor/fflate.module.js');
    const bytes=gunzipSync(new Uint8Array(await file.arrayBuffer()));
    data=bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength);
  }
  return (await new GLTFLoader().parseAsync(data,'')).scene;
}
function studio(renderer) {
  // Long softboxes give the polished wing veins and hexagonal rims distinct reflections.
  const w=256,h=128,data=new Uint16Array(w*h*4);
  const boxes=[
    [-1.6,.82,.55,.16,4.8,[1,.92,.77]], [1.5,.45,.26,.48,3.6,[.88,.94,1]],
    [.3,1.10,1.0,.17,3.7,[1,.98,.92]], [-2.8,.17,.28,.27,2.2,[1,.77,.47]]
  ];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const lon=(x+.5)/w*2*Math.PI-Math.PI,lat=(y+.5)/h*Math.PI-Math.PI/2;
    const sky=.2+.38*Math.max(0,Math.sin(lat));
    const color=[sky*1.03,sky,sky*.88];
    for(const [az,el,sw,sh,power,tint] of boxes){
      let da=Math.abs(lon-az);da=Math.min(da,2*Math.PI-da);
      const energy=power*Math.exp(-Math.pow(da/sw,6)-Math.pow((lat-el)/sh,6));
      for(let k=0;k<3;k++)color[k]+=energy*tint[k];
    }
    const i=4*(y*w+x);
    for(let k=0;k<3;k++)data[i+k]=THREE.DataUtils.toHalfFloat(color[k]);
    data[i+3]=THREE.DataUtils.toHalfFloat(1);
  }
  const source=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.HalfFloatType);
  source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true;
  const maker=new THREE.PMREMGenerator(renderer), target=maker.fromEquirectangular(source);
  maker.dispose();source.dispose();return target;
}
export async function createViewer(mount,onPick) {
  const surface=document.createElement('canvas');
  const context=surface.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'high-performance'});
  if (!context) {
    const {createCanvasViewer} = await import('./canvas-viewer.js');
    return createCanvasViewer(mount,onPick);
  }
  const renderer=new THREE.WebGLRenderer({canvas:surface,context,antialias:true,alpha:true});
  let map, originalBee, composition;
  try {
    [map,originalBee,composition]=await Promise.all([
      fetchModel('relief'),fetchModel('bee'),fetch('./assets/composition.json').then(r=>{if(!r.ok)throw Error('Не удалось открыть композицию');return r.json();})
    ]);
  } catch(error){renderer.dispose();throw error;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
  renderer.setClearColor(0x15281f,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  mount.replaceChildren(renderer.domElement);
  const scene=new THREE.Scene();
  scene.environment=studio(renderer).texture;
  scene.environmentIntensity=1.05;
  scene.add(new THREE.HemisphereLight(0xfff3d8,0x394b42,.86));
  const light=new THREE.DirectionalLight(0xffead0,2.45);
  light.position.set(-5,10,5); light.castShadow=true;
  Object.assign(light.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:34});
  light.shadow.mapSize.set(1536,1536);light.shadow.normalBias=.012;light.shadow.bias=-.0002;
  scene.add(light,light.target);
  const rim=new THREE.DirectionalLight(0xf4f4e4,1.15);rim.position.set(5,4,-6);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.ShadowMaterial({opacity:.39}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.035;floor.receiveShadow=true;scene.add(floor,map);
  const parts=new Map(),bees=new Map();
  for(const region of map.children){
    const bbox=new THREE.Box3().setFromObject(region);
    const center=bbox.getCenter(new THREE.Vector3());
    let outward=new THREE.Vector3(center.x,0,center.z);outward.normalize().multiplyScalar(1.25);
    if(region.name==='minsk') outward.set(-.05,.44,.04);
    const materials=new Set();
    region.traverse(node=>{
      if(!node.isMesh)return;
      node.castShadow=node.receiveShadow=true;
      node.userData.part=region.name;
      node.material=node.material.clone();
      node.material.userData.base=node.material.color.clone();
      materials.add(node.material);
    });
    parts.set(region.name,{region,bbox,center,outward,materials});
  }
  for(const entry of composition.bees) {
    const asset=originalBee.clone(true);
    const [x,y,z]=entry.position;
    asset.position.set(x,z,-y);asset.rotation.y=entry.angle;asset.scale.setScalar(entry.scale);
    asset.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.userData.part=entry.region;node.userData.bee=entry.id;}});
    parts.get(entry.region).region.add(asset);
    bees.set(entry.id,{asset,entry});
  }
  const camera=new THREE.PerspectiveCamera(32,1,.06,170);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.12;controls.rotateSpeed=.67;
  controls.minDistance=1.4;controls.maxDistance=46;
  controls.minPolarAngle=.012;controls.maxPolarAngle=Math.PI*.475;
  controls.enablePan=false;controls.zoomSpeed=.85;
  const defaultDirection=new THREE.Vector3(-3.45,18,10.8).normalize();
  const upper=new THREE.Vector3(0,1,.008).normalize();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state={mode:'whole',region:'all',bee:null,overhead:false},split=0,desiredSplit=0;
  let cameraMove=null,frame=0,previous=0,visible=true;
  const focusPoint=new THREE.Vector3(), viewPoint=new THREE.Vector3();
  const tmp=new THREE.Vector3();
  function fit(box,dir) {
    const center=box.getCenter(new THREE.Vector3());
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();
    const up=new THREE.Vector3().crossVectors(dir,right).normalize();
    const hf=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    let dist=0;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      tmp.set(x,y,z).sub(center);
      const needed=Math.max(Math.abs(tmp.dot(right))/(hf*camera.aspect),Math.abs(tmp.dot(up))/hf);
      dist=Math.max(dist,needed+tmp.dot(dir));
    }
    return {center,dist:dist*1.10};
  }
  function requestCamera(animate=true) {
    const dir=state.overhead?upper:defaultDirection;
    let box=new THREE.Box3();
    if(state.bee){
      const {asset,entry}=bees.get(state.bee);
      let center=asset.position.clone().addScaledVector(parts.get(entry.region).outward,desiredSplit);
      center.y+=.29*entry.scale;
      const half=new THREE.Vector3(1.23*entry.scale,.48*entry.scale,1.05*entry.scale);
      box.set(center.clone().sub(half),center.clone().add(half));
    }else{
      const selected=parts.get(state.region);
      for(const part of selected?[selected]:parts.values()){
        const copy=part.bbox.clone().translate(part.outward.clone().multiplyScalar(desiredSplit));
        copy.max.y+=.46;box.union(copy);
      }
    }
    const {center,dist}=fit(box,dir);
    const end=center.clone().addScaledVector(dir,dist);
    if(animate&&!reduced){
      cameraMove={time:performance.now(),fromEye:camera.position.clone(),fromTarget:controls.target.clone(),end,center};
    }else{cameraMove=null;camera.position.copy(end);controls.target.copy(center);controls.update();}
    schedule();
  }
  function update(next,animate=true){
    state={...next};desiredSplit=state.mode==='apart'?1:0;
    if(!animate||reduced)split=desiredSplit;
    for(const [id,part] of parts){
      const muted=state.region!=='all'&&id!==state.region;
      for(const mat of part.materials){
        mat.color.copy(mat.userData.base);
        if(muted)mat.color.multiplyScalar(.42).lerp(new THREE.Color(.10,.12,.085),.22);
      }
    }
    requestCamera(animate);
  }
  function schedule(){if(!frame&&visible)frame=requestAnimationFrame(paint);}
  function paint(now){
    frame=0;
    const dt=Math.min(.05,Math.max(.001,(now-previous)/1000||.016));previous=now;
    split=THREE.MathUtils.damp(split,desiredSplit,9,dt);
    if(Math.abs(split-desiredSplit)<.0005)split=desiredSplit;
    for(const part of parts.values())part.region.position.copy(part.outward).multiplyScalar(split);
    if(cameraMove){
      const t=Math.min(1,(now-cameraMove.time)/590);
      const eased=t*t*(3-2*t);
      focusPoint.lerpVectors(cameraMove.fromTarget,cameraMove.center,eased);
      viewPoint.lerpVectors(cameraMove.fromEye,cameraMove.end,eased);
      controls.target.copy(focusPoint);camera.position.copy(viewPoint);
      if(t>=1)cameraMove=null;
    }
    const changed=controls.update();
    renderer.render(scene,camera);
    if(changed||cameraMove||split!==desiredSplit)schedule();
  }
  let prevAspect=0;
  function resize(){
    const width=mount.clientWidth,height=mount.clientHeight;
    if(!width||!height)return;
    camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);
    if(Math.abs(prevAspect-camera.aspect)>.025){prevAspect=camera.aspect;requestCamera(false);}
    schedule();
  }
  controls.addEventListener('start',()=>{cameraMove=null;schedule();});
  controls.addEventListener('change',schedule);
  new ResizeObserver(resize).observe(mount);
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(visible)schedule();
    else if(frame){cancelAnimationFrame(frame);frame=0;}
  }).observe(mount);
  const ray=new THREE.Raycaster();let press=null;
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0){press=null;return;}
    press={x:e.clientX,y:e.clientY,id:e.pointerId};
  });
  renderer.domElement.addEventListener('pointercancel',()=>{press=null;});
  renderer.domElement.addEventListener('pointerup',e=>{
    const down=press;press=null;
    if(!down||down.id!==e.pointerId||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
    const rect=mount.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
    const hit=ray.intersectObject(map,true)[0]?.object;
    if(hit?.userData.part)onPick(hit.userData.part,hit.userData.bee||null);
  });
  function zoom(factor){
    cameraMove=null;
    const offset=camera.position.clone().sub(controls.target);
    const distance=THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();schedule();
  }
  function key(input){
    if(['+','=','-','_'].includes(input)){zoom((input === '+' || input === '=') ? .8 : 1.25);return true;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(input))return false;
    cameraMove=null;
    const orbit=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if(input==='ArrowLeft')orbit.theta-=.12;
    if(input==='ArrowRight')orbit.theta+=.12;
    if(input==='ArrowUp')orbit.phi=Math.max(controls.minPolarAngle,orbit.phi-.1);
    if(input==='ArrowDown')orbit.phi=Math.min(controls.maxPolarAngle,orbit.phi+.1);
    camera.position.copy(controls.target).add(tmp.setFromSpherical(orbit));controls.update();schedule();return true;
  }
  resize();return {update,zoom,key};
}
