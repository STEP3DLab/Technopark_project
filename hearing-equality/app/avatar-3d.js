import {Software3DRenderer} from './software-3d.js?v=0.18.0';
import * as T from './vendor/three.module.min.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {loadStockRig} from './stock-rig.js?v=0.18.0';
import {prepareStockMotion,applyStockMotion,relaxStockRig} from './stock-motion.js?v=0.18.0';

// Fixed envelope for the six recorded signs, including finger tips and depth.
// Do not clamp portrait aspect ratios: that crops hands in a tall scene.
export function avatarFraming(aspect=1,fullBody=false){
  const safeAspect=Number.isFinite(aspect)&&aspect>0?aspect:1;
  return {target:fullBody?.96:1.30,distance:Math.max(fullBody?3.65:2.55,.60/(Math.tan(16*Math.PI/180)*safeAspect)+.56)};
}

export class HumanAvatar3D {
  constructor(container){
    this.container=container;this.time=0;this.smoothing=true;this.outfit='indigo';this.scene='dark';this.visible=false;this.disposed=false;this.ready=false;
    container.classList.add('human-3d');container.setAttribute('role','region');container.dataset.renderer='three-webgl';
    if(getComputedStyle(container).position==='static')container.style.position='relative';
    this.note=document.createElement('div');this.note.className='human-3d-note';this.note.hidden=true;container.append(this.note);
    this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label','Объёмная модель человека: перетащите для поворота, используйте колёсико для приближения');this.canvas.tabIndex=0;container.prepend(this.canvas);
    this.world=new T.Scene();this.camera=new T.PerspectiveCamera(32,1,.05,30);
    try{this.renderer=new T.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}
    catch(error){
      this.software=true;this.container.dataset.renderer='software-3d';
      try{this.renderer=new Software3DRenderer(this.canvas);}catch{this.note.hidden=false;this.note.classList.add('error');this.note.textContent='Браузер не смог открыть 3D. Доступны текст и исходное видео.';return;}
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.14;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.note.hidden=false;this.note.textContent='Загружаем 3D-модель…';
    const hemi=new T.HemisphereLight(0xc9dfff,0x5c5b69,2.0);this.world.add(hemi);
    const key=new T.DirectionalLight(0xffe7d4,3.1);key.position.set(2.5,4,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=3;key.shadow.camera.bottom=-2;key.shadow.bias=-.0006;key.shadow.normalBias=.015;this.world.add(key);
    const fill=new T.DirectionalLight(0xb5d2ff,1.6);fill.position.set(-3,2,3);this.world.add(fill);
    const rim=new T.DirectionalLight(0x8bc3ff,2.3);rim.position.set(0,3,-3);this.world.add(rim);
    const floor=new T.Mesh(new T.CircleGeometry(3,64),new T.MeshStandardMaterial({color:0x263b5b,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=.008;floor.receiveShadow=true;this.floor=floor;this.world.add(floor);
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=false;this.controls.enablePan=false;this.controls.minDistance=.9;this.controls.maxDistance=12;this.controls.minPolarAngle=.45;this.controls.maxPolarAngle=2.35;this.controls.addEventListener('change',()=>this.render());
    this.canvas.style.touchAction='none';this.resetView();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.onResize=()=>this.resize();window.addEventListener('resize',this.onResize);
    this.onContextLost=event=>{event.preventDefault();this.ready=false;this.note.hidden=false;this.note.textContent='Восстанавливаем 3D. Если модель не вернулась, обновите страницу.';};this.canvas.addEventListener('webglcontextlost',this.onContextLost);this.onContextRestored=()=>{this.ready=Boolean(this.rig);this.note.hidden=true;this.sampledTime=null;this.resize();};this.canvas.addEventListener('webglcontextrestored',this.onContextRestored);
    this.setScene('dark');this.resize();this.assetReady=this.initialize();
  }
  async initialize(){
    try{
      const rig=await loadStockRig();if(this.disposed){rig.dispose();return;}
      this.rig=rig;this.world.add(rig.group,rig.helper);this.ready=true;
      this.buildToolbar();this.setAppearance({outfit:this.outfit});this.note.classList.remove('error');this.note.hidden=true;
      if(this.data)this.load(this.data);else relaxStockRig(rig);
      this.resize();this.render();
    }catch(error){if(this.disposed)return;this.ready=false;this.note.hidden=false;this.note.classList.add('error');this.note.textContent='Модель не загрузилась. ';const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить';retry.onclick=()=>{retry.disabled=true;this.note.textContent='Загружаем модель…';this.assetReady=this.initialize();};this.note.append(retry);this.container.dataset.modelStatus='error';}
  }
  buildToolbar(){
    const toolbar=document.createElement('div');toolbar.className='human-3d-toolbar';toolbar.setAttribute('aria-label','Управление 3D-моделью');
    const make=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;toolbar.append(b);return b;};
    make('Спереди',()=>this.resetView());
    make('↶',()=>this.orbit(-.25)).setAttribute('aria-label','Повернуть 3D-модель влево');
    make('↷',()=>this.orbit(.25)).setAttribute('aria-label','Повернуть 3D-модель вправо');
    this.skeletonButton=make('Скелет',()=>{this.rig.helper.visible=!this.rig.helper.visible;this.skeletonButton.setAttribute('aria-pressed',String(this.rig.helper.visible));this.render();});this.skeletonButton.setAttribute('aria-pressed','false');
    this.fullButton=make('Весь рост',()=>{this.fullBody=!this.fullBody;this.fullButton.setAttribute('aria-pressed',String(this.fullBody));this.resetView();});this.fullButton.setAttribute('aria-pressed','false');
    this.container.append(toolbar);
    const label=document.createElement('span');label.className='human-3d-badge';label.textContent='Quaternius · 3D';label.title=`65 костей · ${this.software?'программный':'WebGL'} рендеринг`;this.container.dataset.modelStatus='ready';this.container.append(label);this.container.dispatchEvent(new CustomEvent('avatarready'));
    this.canvas.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.orbit(event.key==='ArrowLeft'?-.15:.15);}else if(event.key==='Home'){event.preventDefault();this.resetView();}});
  }
  orbit(angle){const offset=this.camera.position.clone().sub(this.controls.target);offset.applyAxisAngle(new T.Vector3(0,1,0),angle);this.camera.position.copy(this.controls.target).add(offset);this.controls.update();this.render();}
  resetView(){
    if(!this.controls)return;
    const aspect=this.width&&this.height?this.width/this.height:1;
    const {target,distance}=avatarFraming(aspect,this.fullBody);this.controls.target.set(0,target,0);
    this.camera.position.set(0,target,distance);this.controls.update();this.render();
  }
  load(data){this.data=data;this.time=0;this.sampledTime=null;if(!this.rig)return;this.track=prepareStockMotion(this.rig,data,{smooth:this.smoothing});const missing=this.track.observed.some(a=>a.some(v=>!v));this.container.dataset.motionQuality=missing?'partial':'recorded';this.note.hidden=!missing;this.note.textContent=missing?'Есть пропуск кисти · сравните с исходным видео':'';this.showAt(0);}
  clear(){this.data=null;this.track=null;this.sampledTime=null;if(this.rig)relaxStockRig(this.rig);this.note.hidden=true;this.render();}
  setScene(theme){this.scene=/dark|night|тем/i.test(String(theme))?'dark':'light';if(!this.world)return;this.world.background=new T.Color(this.scene==='dark'?0x172942:0xe7eef6);if(this.floor)this.floor.material.color.set(this.scene==='dark'?0x263b5b:0xcbd7e5);this.render();}
  setAppearance({outfit}={}){this.outfit=outfit||this.outfit;this.rig?.setOutfit(this.outfit);this.render();}
  setSmoothing(value=true){this.smoothing=Boolean(value);this.sampledTime=null;if(this.rig&&this.data)this.track=prepareStockMotion(this.rig,this.data,{smooth:this.smoothing});this.showAt(this.time);}
  showAt(time){this.time=Math.max(0,Number(time)||0);if(!this.ready||!this.visible||!this.track)return;if(this.sampledTime===this.time)return;applyStockMotion(this.rig,this.track,this.time);this.sampledTime=this.time;this.render();}
  resize(){if(!this.renderer||this.disposed)return;const r=this.container.getBoundingClientRect(),wasVisible=this.visible;this.visible=r.width>0&&r.height>0;if(!this.visible)return;const changed=this.width!==r.width||this.height!==r.height;this.width=r.width;this.height=r.height;if(changed){this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();this.resetView();}this.sampledTime=null;this.showAt(this.time);this.render();}
  render(){if(!this.ready||!this.visible||this.disposed||this.renderPending)return;this.renderPending=requestAnimationFrame(()=>{this.renderPending=0;if(this.ready&&this.visible&&!this.disposed)this.renderer.render(this.world,this.camera);});}
  dispose(){if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.renderPending);this.resizeObserver?.disconnect();window.removeEventListener('resize',this.onResize);this.controls?.dispose();this.rig?.dispose();this.floor?.geometry.dispose();this.floor?.material.dispose();this.renderer?.dispose();this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.canvas.removeEventListener('webglcontextrestored',this.onContextRestored);}
}
