'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/scenes.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));

// A deterministic DOM/render transport. The actual renderer, mesh generation,
// easing and lifecycle execute unmodified; no application state is supplied.
function sceneEnvironment({software=false,unavailable=false}={}){
  const frames=new Map(),uploads=[],observers=[],drawLog=[],contextRequests=[];let now=1000,id=0;
  class Target{
    constructor(){this.listeners=new Map();}
    addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
    removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
    emit(type,props={}){const e={type,target:this,preventDefault(){},stopPropagation(){},...props};for(const fn of this.listeners.get(type)||[])fn(e);}
    dispatchEvent(e){this.emit(e.type,e);}
  }
  const context2d={fills:0,colors:[],paths:[]};let currentPath=[];
  for(const name of ['setTransform','closePath','stroke'])context2d[name]=()=>{};
  context2d.fillRect=()=>{context2d.colors=[];context2d.paths=[];drawLog.push('software-draw');};
  context2d.beginPath=()=>{currentPath=[];};
  context2d.moveTo=context2d.lineTo=(x,y)=>currentPath.push([x,y]);
  context2d.fill=()=>{context2d.fills++;context2d.colors.push(context2d.fillStyle);context2d.paths.push(currentPath.map(point=>point.slice()));};
  const gl={};
  for(const key of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','DEPTH_TEST','LEQUAL','CULL_FACE','BACK','ARRAY_BUFFER','DYNAMIC_DRAW','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT','FLOAT','TRIANGLES'])gl[key]=key;
  for(const name of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram','enable','depthFunc','cullFace','clearColor','bindBuffer','viewport','clear','useProgram','enableVertexAttribArray','vertexAttribPointer','uniform3fv','uniformMatrix4fv','drawArrays','deleteBuffer','deleteProgram'])gl[name]=()=>{};
  for(const name of ['createShader','createProgram','createBuffer'])gl[name]=()=>({});
  gl.getShaderParameter=gl.getProgramParameter=()=>true;
  gl.getAttribLocation=gl.getUniformLocation=(_object,key)=>key;
  gl.bufferData=(_target,data)=>uploads.push(data.slice());
  gl.drawArrays=()=>drawLog.push('webgl-draw');
  const document=new Target();document.hidden=false;document.activeElement=null;
  class Element extends Target{
    constructor(tag){super();this.tagName=tag;this.attributes=new Map();this.children=[];this.style={};this.hidden=false;this.className='';this.width=0;this.height=0;this.classList={add(){},remove(){}};}
    appendChild(child){child.parentNode=this;this.children.push(child);return child;}
    append(...items){items.forEach(item=>this.appendChild(item));}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(item=>item!==this);this.parentNode=null;}
    setAttribute(key,value){this.attributes.set(key,String(value));}
    getAttribute(key){return this.attributes.get(key)??null;}
    removeAttribute(key){this.attributes.delete(key);}
    getBoundingClientRect(){return{width:640,height:380};}
    get clientWidth(){return 640;}
    get clientHeight(){return 380;}
    getContext(kind,options){contextRequests.push({kind,options});return kind==='webgl'?(software||unavailable?null:gl):unavailable?null:context2d;}
    toDataURL(type){drawLog.push('capture:'+type);return 'data:image/png;base64,iVBORw0KGgo=';}
    focus(){document.activeElement=this;}
  }
  document.createElement=tag=>new Element(tag);
  const window=new Target(),motion=new Target();motion.matches=false;window.matchMedia=()=>motion;window.devicePixelRatio=1;
  class ResizeObserver{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  window.ResizeObserver=ResizeObserver;
  class CustomEvent{constructor(type,options){this.type=type;Object.assign(this,options);}}
  const context={window,document,ResizeObserver,CustomEvent,Float32Array,setTimeout,clearTimeout,performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  vm.runInNewContext(source,context,{filename:'scenes.js'});
  const host=document.createElement('div');
  function step(ms=40){now+=ms;const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(now));}
  function finish(){let count=0;while(frames.size){assert.ok(++count<=30,'render loop must finish');step();}return count;}
  return {host,window,document,motion,frames,uploads,observers,context2d,gl,drawLog,contextRequests,step,finish,advance:ms=>{now+=ms;},mount:options=>window.TechScenes.mount(host,{kind:'engineering',...options}),canvas:()=>host.children.find(el=>el.tagName==='canvas')};
}

test('Exploded engineering view preserves every part dimension, keeps the base and camera fixed, and returns independent snapshots',()=>{
  const env=sceneEnvironment(),options={thickness:3,ribs:3,reducedMotion:true},scene=env.mount(options);env.finish();
  scene.rotate(.2,.1);scene.zoom(-.4);env.finish();
  const before=copy(scene.getDebug()),input=copy(options);scene.update({exploded:1});env.finish();const after=copy(scene.getDebug());
  assert.deepEqual(options,input);assert.deepEqual(after.camera,before.camera);
  assert.equal(after.exploded,1);assert.equal(after.displayedExploded,1);assert.equal(after.transitioning,false);
  assert.equal(after.engineeringParts.length,2+3+4);
  for(const part of after.engineeringParts){
    const old=before.engineeringParts.find(item=>item.id===part.id);assert.deepEqual(part.size,old.size);assert.deepEqual(part.origin,old.origin);
    if(part.id==='base')assert.deepEqual(part.position,old.position);else assert.notDeepEqual(part.position,old.position);
  }
  assert.match(env.canvas().getAttribute('aria-label'),/параметры и размеры не меняются/);
  const external=scene.getDebug();external.engineeringParts[0].position[0]=100;external.engineeringParts[0].size[0]=100;
  assert.equal(scene.getDebug().engineeringParts[0].position[0],0);assert.equal(scene.getDebug().engineeringParts[0].size[0],3.45);
  scene.update({exploded:0});env.finish();assert.deepEqual(copy(scene.getDebug().engineeringParts),before.engineeringParts);scene.destroy();
});

test('All 25 valid constructions keep the same rib count, finite geometry and bounded extents at each separation',()=>{
  const env=sceneEnvironment(),scene=env.mount({reducedMotion:true});env.finish();
  for(let thickness=1;thickness<=5;thickness++)for(let ribs=0;ribs<=4;ribs++)for(const exploded of[0,.5,1]){
    scene.update({thickness,ribs,exploded});env.finish();const debug=scene.getDebug(),mesh=env.uploads.at(-1);
    assert.equal(debug.engineeringParts.filter(part=>part.kind==='gusset').length,ribs);
    assert.equal(debug.engineeringParts.filter(part=>part.kind==='fastener').length,4);
    assert.equal(debug.engineeringParts[0].size[1],.09+thickness*.055);
    assert.ok(mesh.every(Number.isFinite));assert.ok(debug.vertices<30000,'illustration remains bounded');
    for(let i=0;i<mesh.length;i+=9){assert.ok(mesh[i+1]>=-.61&&mesh[i+1]<2.76);assert.ok(Math.abs(mesh[i])<=13.01&&Math.abs(mesh[i+2])<=13.01);}
  }
  scene.update({exploded:20});env.finish();assert.equal(scene.getDebug().exploded,1);
  scene.update({exploded:-2});env.finish();assert.equal(scene.getDebug().exploded,0);
  scene.update({exploded:NaN});env.finish();assert.equal(scene.getDebug().exploded,0);scene.destroy();
});

test('A 360ms transition has intermediate geometry, can reverse smoothly and stops scheduling when finished',()=>{
  const env=sceneEnvironment(),scene=env.mount({thickness:3,ribs:2});env.finish();const camera=copy(scene.getCamera());
  scene.update({exploded:1});assert.equal(scene.getDebug().transitioning,true);assert.equal(env.frames.size,1);
  env.step(120);const partial=scene.getDebug().displayedExploded;assert.ok(partial>0&&partial<1);
  scene.update({exploded:0});assert.equal(scene.getDebug().displayedExploded,partial,'reverse begins at the visible value');
  env.step(120);assert.ok(scene.getDebug().displayedExploded<partial);assert.ok(scene.getDebug().displayedExploded>0);
  assert.ok(env.finish()<=6);assert.equal(scene.getDebug().displayedExploded,0);assert.equal(scene.getDebug().transitioning,false);assert.equal(env.frames.size,0);assert.deepEqual(copy(scene.getCamera()),camera);
  scene.update({exploded:1});assert.ok(env.finish()<=10);assert.equal(scene.getDebug().displayedExploded,1);scene.destroy();assert.equal(env.frames.size,0);
});

test('Software rendering shares separated geometry and finishes without a permanent loop; reduced motion settles immediately',()=>{
  const env=sceneEnvironment({software:true}),scene=env.mount({thickness:2,ribs:4});env.finish();
  assert.equal(scene.getDebug().renderer,'software-3d');const fills=env.context2d.fills;
  scene.update({exploded:1});env.step(120);assert.ok(scene.getDebug().displayedExploded>0&&scene.getDebug().displayedExploded<1);assert.ok(env.context2d.fills>fills);
  env.motion.matches=true;env.motion.emit('change');env.finish();assert.equal(scene.getDebug().displayedExploded,1);assert.equal(scene.getDebug().transitioning,false);assert.equal(env.frames.size,0);
  scene.update({exploded:0});assert.equal(scene.getDebug().displayedExploded,0);assert.equal(scene.getDebug().transitioning,false);env.finish();scene.destroy();
});

test('Hidden tabs pause separation and kind changes, context loss and destroy release pending animation',()=>{
  const env=sceneEnvironment(),scene=env.mount({ribs:1});env.finish();scene.update({exploded:1});env.step(120);
  const partial=scene.getDebug().displayedExploded;env.document.hidden=true;env.document.emit('visibilitychange');assert.equal(env.frames.size,0);env.advance(5000);
  env.document.hidden=false;env.document.emit('visibilitychange');env.step(40);assert.ok(scene.getDebug().displayedExploded>partial&&scene.getDebug().displayedExploded<1,'hidden time is not counted');
  env.canvas().emit('webglcontextlost');assert.equal(scene.getDebug().transitioning,false);assert.equal(env.frames.size,0);
  env.canvas().emit('webglcontextrestored');env.finish();assert.equal(scene.getDebug().displayedExploded,1);
  scene.update({exploded:0});env.step(40);scene.update({kind:'robot'});env.finish();assert.equal(scene.getDebug().transitioning,false);assert.equal(scene.getDebug().engineeringParts.length,0);assert.equal(scene.getDebug().displayedExploded,0);
  scene.update({kind:'engineering',exploded:0});env.finish();scene.update({exploded:1});assert.equal(env.frames.size,1);scene.destroy();assert.equal(env.frames.size,0);assert.equal(scene.getDebug().transitioning,false);assert.equal(env.host.children.length,0);assert.ok(env.observers.every(o=>o.disconnected));
});

test('Part highlighting changes only the selected actual mesh colors, preserving positions, normals, dimensions and camera in assembled and separated views',()=>{
  const env=sceneEnvironment(),scene=env.mount({thickness:3,reducedMotion:true});scene.rotate(.24,.08);scene.zoom(-.2);env.finish();
  const camera=copy(scene.getCamera()),lime=[199/255,237/255,82/255];
  for(const ribs of [0,1,4])for(const exploded of [0,1]){
    scene.update({ribs,exploded,highlightPart:null});env.finish();const baseline=env.uploads.at(-1).slice(),parts=copy(scene.getDebug().engineeringParts);
    for(const part of ['base','wall','ribs']){
      const patch={highlightPart:part};scene.update(patch);env.finish();const mesh=env.uploads.at(-1),debug=scene.getDebug(),changed=[];
      assert.deepEqual(patch,{highlightPart:part});assert.equal(mesh.length,baseline.length);assert.deepEqual(copy(debug.camera),camera);assert.deepEqual(copy(debug.engineeringParts),parts);
      assert.equal(debug.highlightPart,part==='ribs'&&!ribs?null:part);assert.equal(env.frames.size,0);
      for(let offset=0;offset<mesh.length;offset+=9){
        for(let c=0;c<6;c++)assert.equal(mesh[offset+c],baseline[offset+c],'vertex position and normal stay exact');
        if([6,7,8].some(c=>mesh[offset+c]!==baseline[offset+c])){
          changed.push([mesh[offset],mesh[offset+1],mesh[offset+2]]);
          for(let c=0;c<3;c++)assert.ok(Math.abs(mesh[offset+6+c]-lime[c])<1e-6,'highlight uses the shared lime material');
        }
      }
      assert.equal(changed.length,part==='ribs'?24*ribs:132,'only the selected bevel-box or gussets are recolored');
      const chosen=parts.filter(item=>part==='ribs'?item.kind==='gusset':item.id===part);
      for(const point of changed)assert.ok(chosen.some(item=>{
        const [x,y,z]=item.position,[w,h,d]=item.size,min=[x-w/2,item.kind==='gusset'?y:y-h/2,item.kind==='gusset'?z:z-d/2],max=[x+w/2,item.kind==='gusset'?y+h:y+h/2,item.kind==='gusset'?z+d:z+d/2];
        return point.every((v,i)=>v>=min[i]-1e-6&&v<=max[i]+1e-6);
      }),'recolored vertices belong to the selected real part');
      scene.update({highlightPart:null});env.finish();assert.deepEqual(env.uploads.at(-1),baseline);
    }
  }
  scene.destroy();
});

test('CPU and WebGL expose the same selected parts; software painting changes color without changing projected faces or running idle frames',()=>{
  const gpu=sceneEnvironment(),cpu=sceneEnvironment({software:true}),options={thickness:2,ribs:3,exploded:1,reducedMotion:true},webgl=gpu.mount(options),software=cpu.mount(options);gpu.finish();cpu.finish();
  const paths=copy(cpu.context2d.paths),colors=cpu.context2d.colors.slice();
  for(const highlightPart of ['base','wall','ribs']){
    webgl.update({highlightPart});software.update({highlightPart});gpu.finish();cpu.finish();
    assert.deepEqual(copy(webgl.getDebug().engineeringParts),copy(software.getDebug().engineeringParts));assert.equal(webgl.getDebug().highlightPart,highlightPart);assert.equal(software.getDebug().highlightPart,highlightPart);
    assert.deepEqual(cpu.context2d.paths,paths);assert.equal(cpu.context2d.colors.length,colors.length);
    const changed=cpu.context2d.colors.filter((color,index)=>color!==colors[index]);assert.ok(changed.length>0,'the chosen visible mesh is recolored in CPU output');
    for(const color of changed){const [r,g,b]=color.match(/\d+/g).map(Number);assert.ok(r>b&&g>r,'software highlight keeps the shared lime hue');}
    assert.match(cpu.canvas().getAttribute('aria-label'),/Выделено:/);assert.equal(cpu.host.getAttribute('data-scene-part'),highlightPart);assert.equal(cpu.frames.size,0);assert.equal(gpu.frames.size,0);
    webgl.update({highlightPart:null});software.update({highlightPart:null});gpu.finish();cpu.finish();assert.deepEqual(cpu.context2d.colors,colors);
  }
  webgl.destroy();software.destroy();
});

test('Missing ribs and invalid selections clear safely; inspection survives separation and context restoration without affecting the camera',()=>{
  const env=sceneEnvironment(),scene=env.mount({ribs:2,highlightPart:'ribs'});env.finish();assert.equal(scene.getDebug().highlightPart,'ribs');
  const camera=copy(scene.getCamera());scene.update({ribs:0});env.finish();assert.equal(scene.getDebug().highlightPart,null);scene.update({ribs:2});env.finish();assert.equal(scene.getDebug().highlightPart,null,'restoring ribs does not revive an obsolete selection');
  for(const highlightPart of ['fastener-0','<script>',{},false]){scene.update({highlightPart});env.finish();assert.equal(scene.getDebug().highlightPart,null);}
  scene.update({highlightPart:'wall',exploded:1});env.step(120);const partial=scene.getDebug().displayedExploded;assert.ok(partial>0&&partial<1);
  scene.update({highlightPart:'base'});assert.equal(scene.getDebug().displayedExploded,partial);env.finish();assert.equal(scene.getDebug().displayedExploded,1);assert.equal(scene.getDebug().highlightPart,'base');assert.deepEqual(copy(scene.getCamera()),camera);assert.equal(env.frames.size,0);
  env.canvas().emit('webglcontextlost');env.canvas().emit('webglcontextrestored');env.finish();assert.equal(scene.getDebug().highlightPart,'base');
  scene.update({kind:'robot'});env.finish();assert.equal(scene.getDebug().highlightPart,null);scene.update({kind:'engineering'});env.finish();assert.equal(scene.getDebug().highlightPart,null);
  scene.destroy();scene.update({highlightPart:'wall'});assert.equal(env.frames.size,0);assert.equal(env.host.children.length,0);
});

test('Front and side are exact axial views, retain zoom, target and model state, and restore without a pitch jump',()=>{
  const env=sceneEnvironment({software:true}),options={thickness:3,ribs:4,exploded:1,highlightPart:'ribs',reducedMotion:true},scene=env.mount(options);env.finish();
  scene.zoom(-.6);env.finish();const before=copy(scene.getDebug());
  scene.setView('front');env.finish();const front=copy(scene.getCamera()),frontPaths=copy(env.context2d.paths);
  assert.equal(front.yaw,0);assert.equal(front.pitch,0);assert.equal(front.distance,before.camera.distance);assert.deepEqual(front.target,before.camera.target);
  assert.equal(env.host.getAttribute('data-scene-view'),'front');assert.match(env.canvas().getAttribute('aria-label'),/Спереди/);
  scene.setView('side');env.finish();const side=copy(scene.getCamera());
  assert.equal(side.yaw,Math.PI/2);assert.equal(side.pitch,0);assert.equal(side.distance,front.distance);assert.deepEqual(side.target,front.target);
  assert.notDeepEqual(env.context2d.paths,frontPaths,'the projection changes with the selected axis');
  assert.ok(env.context2d.paths.flat(2).every(Number.isFinite));
  assert.equal(env.host.getAttribute('data-scene-view'),'side');assert.match(env.canvas().getAttribute('aria-label'),/Сбоку справа/);
  assert.deepEqual(copy(scene.getDebug().engineeringParts),before.engineeringParts);assert.equal(scene.getDebug().highlightPart,'ribs');assert.equal(scene.getDebug().displayedExploded,1);
  scene.setView('constructor');assert.deepEqual(copy(scene.getCamera()),side);assert.equal(env.frames.size,0);
  scene.rotate(.1,0);env.finish();assert.equal(scene.getCamera().pitch,0);assert.equal(env.host.getAttribute('data-scene-view'),'custom');
  scene.setView('front');env.finish();const saved=copy(scene.getCamera());scene.destroy();
  const next=env.mount({...options,camera:saved});env.finish();assert.deepEqual(copy(next.getCamera()),saved);
  next.setView('top');env.finish();assert.equal(next.getCamera().pitch,Math.PI/2-.008);
  next.setView('iso');env.finish();assert.equal(next.getCamera().pitch,.65);assert.equal(next.getCamera().yaw,.65);next.destroy();
});

test('PNG capture synchronously paints WebGL and CPU before reading, keeps current pixels and does not request a new frame',()=>{
  for(const software of [false,true]){
    const env=sceneEnvironment({software}),scene=env.mount({thickness:2,ribs:3,exploded:1,highlightPart:'wall',reducedMotion:true});scene.setView('side');
    const before=copy(scene.getDebug()),pending=env.frames.size;
    assert.equal(scene.capture(),'data:image/png;base64,iVBORw0KGgo=');
    assert.deepEqual(env.drawLog.slice(-2),[software?'software-draw':'webgl-draw','capture:image/png']);
    assert.deepEqual(copy(scene.getDebug()),before);assert.equal(env.frames.size,pending);
    assert.equal(env.contextRequests.find(request=>request.kind==='webgl').options.preserveDrawingBuffer,false);
    env.finish();const draws=env.drawLog.length;scene.capture();assert.equal(env.drawLog.length,draws+2);assert.equal(env.frames.size,0);
    scene.update({ribs:1,thickness:4,highlightPart:'ribs'});const changed=copy(scene.getDebug());scene.capture();
    assert.deepEqual(copy(scene.getDebug()),changed);assert.equal(changed.engineeringParts.filter(part=>part.kind==='gusset').length,1);
    assert.deepEqual(env.drawLog.slice(-2),[software?'software-draw':'webgl-draw','capture:image/png']);scene.destroy();
  }
});

test('Capture keeps the displayed separation and robot animation position instead of advancing, settling or replaying them',async()=>{
  for(const software of [false,true]){
    const env=sceneEnvironment({software}),scene=env.mount({ribs:3});env.finish();scene.update({exploded:1});env.step(120);
    const before=copy(scene.getDebug()),pending=env.frames.size;assert.ok(before.displayedExploded>0&&before.displayedExploded<1);
    env.advance(5000);assert.ok(scene.capture());assert.deepEqual(copy(scene.getDebug()),before);assert.equal(env.frames.size,pending);
    scene.destroy();
    const robot=env.mount({kind:'robot'});env.finish();const playback=robot.play([[0,4],[0,3],[0,2]]);env.step(120);
    const frame=copy(robot.getDebug()),queued=env.frames.size;assert.equal(frame.playing,true);assert.ok(frame.position[1]<4&&frame.position[1]>3);
    env.advance(5000);assert.ok(robot.capture());assert.deepEqual(copy(robot.getDebug()),frame);assert.equal(env.frames.size,queued);
    robot.destroy();assert.equal((await playback).reason,'destroyed');
  }
});

test('Hidden, unavailable, lost, destroyed or unreadable canvases yield no fabricated PNG and leave scene state intact',()=>{
  const unavailable=sceneEnvironment({unavailable:true}),missing=unavailable.mount();assert.equal(missing.capture(),null);assert.equal(unavailable.drawLog.length,0);missing.destroy();
  const env=sceneEnvironment(),scene=env.mount();env.finish();const canvas=env.canvas(),toDataURL=canvas.toDataURL;
  env.host.hidden=true;assert.equal(scene.capture(),null);env.host.hidden=false;
  env.host.getClientRects=()=>[];assert.equal(scene.capture(),null);delete env.host.getClientRects;
  env.document.hidden=true;assert.equal(scene.capture(),null);env.document.hidden=false;
  canvas.hidden=true;assert.equal(scene.capture(),null);canvas.hidden=false;
  const before=copy(scene.getDebug());canvas.toDataURL=()=>{throw new Error('read denied');};assert.equal(scene.capture(),null);assert.deepEqual(copy(scene.getDebug()),before);
  canvas.toDataURL=()=> 'data:,';assert.equal(scene.capture(),null);canvas.toDataURL=toDataURL;
  env.gl.isContextLost=()=>true;assert.equal(scene.capture(),null);delete env.gl.isContextLost;
  canvas.emit('webglcontextlost');assert.equal(scene.capture(),null);canvas.emit('webglcontextrestored');env.finish();assert.ok(scene.capture());
  scene.destroy();const count=env.drawLog.length;assert.equal(scene.capture(),null);assert.equal(env.drawLog.length,count);
});
