'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/scenes.js'),'utf8');
const IDS=['engineering','robotics','code','ai','design','xr','research','social'];
const copy=value=>JSON.parse(JSON.stringify(value));

function environment({width=640,height=380,software=false,unavailable=false,dpr=1}={}){
  let size={width,height},frameId=0,now=1000;
  const frames=new Map(),observers=[],elements=[],draws=[],uploads=[];
  class EventTarget {
    constructor(){this.listeners=new Map();}
    addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
    removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
    dispatchEvent(event){
      if(!event.target)event.target=this;event.currentTarget=this;
      if(!event.preventDefault)event.preventDefault=function(){this.defaultPrevented=true;};
      if(!event.stopPropagation)event.stopPropagation=function(){this.propagationStopped=true;};
      for(const handler of this.listeners.get(event.type)||[])handler(event);
      if(event.bubbles&&!event.propagationStopped&&this.parentNode)this.parentNode.dispatchEvent(event);
      return !event.defaultPrevented;
    }
    emit(type,properties={}){const event={type,bubbles:true,cancelable:true,...properties};this.dispatchEvent(event);return event;}
    listenerCount(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
  }
  const gl={uploads,draws};
  for(const key of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','DEPTH_TEST','LEQUAL','CULL_FACE','BACK','ARRAY_BUFFER','DYNAMIC_DRAW','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT','FLOAT','TRIANGLES'])gl[key]=key;
  for(const name of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram','enable','depthFunc','cullFace','clearColor','bindBuffer','viewport','clear','useProgram','enableVertexAttribArray','vertexAttribPointer','uniform3fv'])gl[name]=()=>{};
  for(const name of ['createShader','createProgram','createBuffer'])gl[name]=()=>({});
  gl.getShaderParameter=gl.getProgramParameter=()=>true;
  gl.getAttribLocation=(_program,name)=>name;gl.getUniformLocation=(_program,name)=>name;
  gl.bufferData=(_target,data)=>uploads.push(data.slice());
  gl.uniformMatrix4fv=(_location,_transpose,data)=>{gl.matrix=Array.from(data);};
  gl.drawArrays=(_mode,_first,count)=>draws.push(count);
  gl.deleteBuffer=()=>{gl.deletedBuffers=(gl.deletedBuffers||0)+1;};
  gl.deleteProgram=()=>{gl.deletedPrograms=(gl.deletedPrograms||0)+1;};
  const context2d={fills:0};
  for(const name of ['setTransform','fillRect','beginPath','moveTo','lineTo','closePath','stroke'])context2d[name]=()=>{};
  context2d.fill=()=>{context2d.fills++;};
  const document=new EventTarget();document.hidden=false;document.activeElement=null;
  class Element extends EventTarget {
    constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.style={};this.hidden=false;this.className='';this.tabIndex=-1;this.textContent='';this.width=0;this.height=0;this.captures=new Set();elements.push(this);this.classList={add:name=>{this.className=[...new Set(this.className.split(/\s+/).filter(Boolean).concat(name))].join(' ');},remove:name=>{this.className=this.className.split(/\s+/).filter(value=>value!==name).join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
    appendChild(child){if(child.parentNode)child.remove();child.parentNode=this;this.children.push(child);return child;}
    append(...children){children.forEach(child=>this.appendChild(child));}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}}
    setAttribute(name,value){this.attributes.set(name,String(value));}
    getAttribute(name){return this.attributes.get(name)??null;}
    removeAttribute(name){this.attributes.delete(name);}
    getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:size.width,bottom:size.height,...size};}
    get clientWidth(){return size.width;}
    get clientHeight(){return size.height;}
    focus(){document.activeElement=this;}
    getContext(kind){return unavailable?null:kind==='webgl'?(software?null:gl):kind==='2d'?context2d:null;}
    setPointerCapture(id){this.captures.add(id);}
    hasPointerCapture(id){return this.captures.has(id);}
    releasePointerCapture(id){this.captures.delete(id);}
  }
  document.createElement=tag=>new Element(tag);
  const window=new EventTarget(),motion=new EventTarget();motion.matches=false;
  window.devicePixelRatio=dpr;window.matchMedia=()=>motion;
  class ResizeObserver {
    constructor(callback){this.callback=callback;observers.push(this);}
    observe(target){this.target=target;}
    disconnect(){this.disconnected=true;}
  }
  window.ResizeObserver=ResizeObserver;
  class CustomEvent {constructor(type,options){this.type=type;Object.assign(this,options);}}
  const context={window,document,ResizeObserver,CustomEvent,Float32Array,performance:{now:()=>now},setTimeout,clearTimeout,requestAnimationFrame:callback=>{const id=++frameId;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  vm.runInNewContext(source,context,{filename:'scenes.js'});
  const host=document.createElement('div');
  function flush(){const work=[...frames.values()];frames.clear();now+=40;work.forEach(callback=>callback(now));}
  function resize(w,h){size={width:w,height:h};observers.filter(observer=>!observer.disconnected).forEach(observer=>observer.callback());flush();}
  const buttons=()=>elements.filter(element=>element.tagName==='BUTTON'&&element.parentNode);
  return {host,window,document,motion,frames,observers,elements,gl,context2d,flush,resize,buttons,mount:options=>window.TechScenes.mount(host,options),canvas:()=>host.children.find(element=>element.tagName==='CANVAS')};
}

function assertLayout(markers,width,height,{all=true}={}){
  const visible=markers.filter(marker=>marker.visible);
  if(all)assert.equal(visible.length,8,JSON.stringify(markers.map(marker=>[marker.id,marker.visible])));
  for(const marker of visible){
    assert.ok(marker.anchor&&marker.position);
    assert.ok(marker.anchor.depth>=-1&&marker.anchor.depth<=1);
    assert.ok(marker.position.x>=24&&marker.position.x<=width-24,marker.id+' horizontal bound');
    assert.ok(marker.position.y>=22&&marker.position.y<=height-22,marker.id+' vertical bound');
    assert.ok(Math.hypot(marker.position.x-marker.anchor.x,marker.position.y-marker.anchor.y)<=120,marker.id+' remains connected to its roof');
  }
  for(let a=0;a<visible.length;a++)for(let b=a+1;b<visible.length;b++){
    const p=visible[a].position,q=visible[b].position;
    assert.ok(Math.abs(p.x-q.x)>=49-1e-6||Math.abs(p.y-q.y)>=49-1e-6,visible[a].id+' overlaps '+visible[b].id);
  }
}

// Independent camera-space calculation; it does not use the renderer's matrix helpers.
function roofProjection(index,camera,width,height){
  const angle=index*Math.PI/4,point=[Math.sin(angle)*2.58,.73+(index%3)*.18,Math.cos(angle)*2.58];
  const distance=camera.distance*Math.max(1,height/width),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),sy=Math.sin(camera.yaw),cy=Math.cos(camera.yaw);
  const right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],back=[sy*cp,sp,cy*cp];
  const relative=point.map((value,k)=>value-camera.target[k]);
  const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),depth=distance-dot(relative,back),f=1/Math.tan(.67/2);
  return {x:width/2+dot(relative,right)*f*height/(2*depth),y:height/2-dot(relative,up)*f*height/(2*depth)};
}

function roofColours(mesh,index){
  const angle=index*Math.PI/4,c=Math.cos(angle),s=Math.sin(angle),roofY=.72+(index%3)*.18,colours=[];
  for(let i=0;i<mesh.length;i+=9){
    const x=mesh[i]*c-mesh[i+2]*s,z=mesh[i]*s+mesh[i+2]*c;
    if(Math.abs(x)<.51&&Math.abs(z-2.58)<.47&&Math.abs(mesh[i+1]-roofY)<1e-5&&mesh[i+4]>.999)colours.push([...mesh.slice(i+6,i+9)].map(v=>Math.round(v*255)).join(','));
  }
  assert.ok(colours.length>=6,'a top face exists on roof '+index);return new Set(colours);
}

test('Eight campus buttons follow real roof coordinates, with full accessible metadata and one demand frame',()=>{
  const env=environment({dpr:2}),scene=env.mount({selectedLab:'engineering',campusItems:[{id:'engineering',label:'Инженерная лаборатория',short:'Инженерия',completed:true},{id:'xr',label:'Лаборатория XR',skipped:true}]});
  assert.equal(env.frames.size,1);env.flush();assert.equal(env.frames.size,0);
  assert.deepEqual(env.buttons().map(button=>button.getAttribute('data-campus-id')),IDS);
  const debug=copy(scene.getDebug());assertLayout(debug.campusMarkers,640,380);
  assert.equal(debug.width,1280);assert.equal(debug.height,760);
  for(const [index,button] of env.buttons().entries()){
    assert.equal(button.type,'button');assert.equal(button.tabIndex,0);assert.equal(button.textContent,String(index+1).padStart(2,'0'));
    assert.match(button.getAttribute('aria-label'),new RegExp('^'+(index+1)+'\\. '));
    assert.equal(button.getAttribute('aria-pressed'),String(index===0));
    const expected=roofProjection(index,debug.camera,640,380),marker=debug.campusMarkers[index];
    assert.equal(marker.world.length,3);assert.ok(Math.abs(Math.hypot(marker.world[0],marker.world[2])-2.58)<1e-9);
    assert.ok(Math.abs(marker.anchor.x-expected.x)<.001);assert.ok(Math.abs(marker.anchor.y-expected.y)<.001);
    assert.ok(Math.abs(Number(button.getAttribute('data-campus-x'))-expected.x)<.006);
  }
  assert.match(env.buttons()[0].getAttribute('aria-label'),/Инженерная лаборатория\. Проба проверена/);
  assert.match(env.host.children.find(element=>element.className==='tech-scene-caption').textContent,/Выбрана лаборатория: Инженерия/);
  assert.equal(env.buttons()[5].getAttribute('data-status'),'skipped');
  scene.destroy();
});

test('Selection updates only the chosen building and preserves the participant camera',()=>{
  const env=environment(),selected=[],scene=env.mount({selectedLab:'engineering',onSelectLab:id=>selected.push(id)});env.flush();
  const initialMesh=env.gl.uploads.at(-1);
  for(let i=0;i<8;i++)assert.deepEqual(roofColours(initialMesh,i),new Set([i===0?'199,237,82':'20,35,63']));
  scene.rotate(.4,.1);scene.zoom(-1);env.flush();const before=copy(scene.getCamera());
  env.buttons()[5].emit('click',{detail:1});env.flush();
  assert.deepEqual(selected,['xr']);assert.deepEqual(copy(scene.getCamera()),before);
  assert.equal(scene.getDebug().selectedLab,'xr');
  assert.deepEqual(env.buttons().map(button=>button.getAttribute('aria-pressed')),IDS.map(id=>String(id==='xr')));
  for(let i=0;i<8;i++)assert.deepEqual(roofColours(env.gl.uploads.at(-1),i),new Set([i===5?'199,237,82':'20,35,63']));
  scene.update({selectedLab:'research'});env.flush();
  assert.deepEqual(copy(scene.getCamera()),before);assert.deepEqual(selected,['xr'],'programmatic selection does not send a second participant action');
  assert.deepEqual(roofColours(env.gl.uploads.at(-1),6),new Set(['199,237,82']));
  const count=env.gl.uploads.length;scene.update({selectedLab:'research',campusItems:[{id:'research',completed:true}]});env.flush();assert.equal(env.gl.uploads.length,count,'metadata-only updates reuse the mesh');
  scene.destroy();
});

test('Marker pointer gestures never orbit the camera or select on drag, and native keyboard clicks remain usable',()=>{
  const env=environment(),calls=[],scene=env.mount({onSelectLab:id=>calls.push(id)});env.flush();
  const button=env.buttons()[2],before=copy(scene.getCamera());
  button.emit('pointerdown',{pointerId:1,clientX:180,clientY:160,pointerType:'mouse'});
  button.emit('pointermove',{pointerId:1,clientX:205,clientY:168,pointerType:'mouse'});
  button.emit('pointerup',{pointerId:1,clientX:205,clientY:168,pointerType:'mouse'});
  assert.equal(button.emit('click',{detail:1}).defaultPrevented,true);assert.deepEqual(calls,[]);
  assert.deepEqual(copy(scene.getCamera()),before);
  // Native buttons dispatch detail=0 for keyboard/assistive activation; no custom key emulation.
  button.emit('click',{detail:0});env.flush();assert.deepEqual(calls,['code']);
  const canvas=env.canvas();canvas.emit('pointerdown',{pointerId:2,clientX:0,clientY:0,pointerType:'mouse',button:0});canvas.emit('pointermove',{pointerId:2,clientX:30,clientY:0,pointerType:'mouse'});canvas.emit('pointerup',{pointerId:2,clientX:30,clientY:0});canvas.emit('click',{detail:1});env.flush();
  assert.notDeepEqual(copy(scene.getCamera()),before);assert.deepEqual(calls,['code']);scene.destroy();
});

test('Projection responds to camera and aspect changes; mobile markers stay separate and selected roof remains selectable',()=>{
  const env=environment(),scene=env.mount({selectedLab:'social'});env.flush();const initial=copy(scene.getDebug().campusMarkers);
  scene.rotate(Math.PI/2,0);env.flush();const rotated=copy(scene.getDebug());
  assert.notEqual(rotated.campusMarkers[0].anchor.x,initial[0].anchor.x);
  for(let i=0;i<8;i++){const expected=roofProjection(i,rotated.camera,640,380);assert.ok(Math.abs(rotated.campusMarkers[i].anchor.x-expected.x)<.001);}
  scene.reset();env.flush();env.resize(345,310);let debug=copy(scene.getDebug());assertLayout(debug.campusMarkers,345,310);
  for(let i=0;i<8;i++){const expected=roofProjection(i,debug.camera,345,310);assert.ok(Math.abs(debug.campusMarkers[i].anchor.x-expected.x)<.001);}
  scene.setView('top');env.flush();debug=copy(scene.getDebug());assertLayout(debug.campusMarkers,345,310);
  assert.ok(debug.campusMarkers.find(marker=>marker.id==='social').visible);
  scene.destroy();
});

test('Out-of-frustum roofs have no fake coordinate, cannot receive focus, and restore after camera reset',()=>{
  const env=environment(),scene=env.mount({selectedLab:'engineering'});env.flush();env.buttons()[0].focus();
  scene.update({camera:{target:[1000,0,0]}});env.flush();
  assert.ok(scene.getDebug().campusMarkers.every(marker=>!marker.visible&&marker.anchor===null&&marker.position===null));
  for(const button of env.buttons()){assert.equal(button.hidden,true);assert.equal(button.tabIndex,-1);assert.equal(button.getAttribute('data-campus-x'),null);}
  assert.equal(env.document.activeElement,env.canvas());
  scene.update({camera:{target:[-50,-60,-60]}});env.flush();assert.ok(scene.getDebug().campusMarkers.every(marker=>marker.anchor===null),'roofs behind the camera are clipped, too');
  scene.reset();env.flush();assertLayout(copy(scene.getDebug().campusMarkers),640,380);
  const debug=scene.getDebug();debug.campusMarkers[0].anchor.x=-100;debug.campusMarkers[0].world[0]=-100;debug.camera.target[0]=-100;
  assert.notEqual(scene.getDebug().campusMarkers[0].anchor.x,-100);assert.equal(scene.getDebug().campusMarkers[0].world[0],0);assert.equal(scene.getCamera().target[0],0);
  scene.destroy();
});

test('CPU fallback uses the same projected markers, preserves reduced motion and releases its lifecycle',()=>{
  const env=environment({software:true,width:345,height:310,dpr:2}),scene=env.mount({selectedLab:'ai',reducedMotion:true});env.flush();
  assert.equal(scene.getDebug().renderer,'software-3d');assert.ok(env.context2d.fills>0);assertLayout(copy(scene.getDebug().campusMarkers),345,310);assert.equal(env.frames.size,0);
  const oldButtons=env.buttons();scene.update({kind:'engineering'});env.flush();
  assert.equal(env.host.children.find(element=>element.className==='tech-campus-markers').hidden,true);assert.equal(scene.getDebug().campusMarkers.length,0);
  assert.ok(oldButtons.every(button=>button.hidden&&button.tabIndex===-1));
  scene.update({kind:'campus',selectedLab:'design',campusItems:[{id:'design',label:'Новая подпись',completed:true}]});env.flush();
  assert.match(env.buttons()[4].getAttribute('aria-label'),/Новая подпись\. Проба проверена/);
  assert.equal(env.buttons().length,8,'switching scene types does not duplicate DOM listeners or buttons');
  scene.rotate(.1,0);env.document.hidden=true;env.document.emit('visibilitychange');assert.equal(env.frames.size,0);env.document.hidden=false;env.document.emit('visibilitychange');assert.equal(env.frames.size,1);env.flush();assert.equal(env.frames.size,0);
  scene.rotate(.1,0);assert.equal(env.frames.size,1);scene.destroy();
  assert.equal(env.frames.size,0);assert.equal(env.host.children.length,0);assert.equal(env.observers[0].disconnected,true);assert.equal(env.document.listenerCount(),0);assert.equal(env.motion.listenerCount(),0);assert.equal(env.host.__techScene,undefined);
  assert.ok(oldButtons.every(button=>button.listenerCount()===0));
  scene.update({selectedLab:'xr'});scene.rotate(1,1);env.flush();assert.equal(env.frames.size,0);assert.equal(scene.getDebug().disposed,true);
});

test('WebGL loss hides projected controls, restoration reprojects them and remount disposes the old controller',()=>{
  const env=environment(),scene=env.mount({selectedLab:'robotics'});env.flush();
  const canvas=env.canvas(),buttons=env.buttons(),overlay=env.host.children.find(element=>element.className==='tech-campus-markers');
  canvas.emit('webglcontextlost');assert.equal(overlay.hidden,true);assert.equal(env.frames.size,0);assert.equal(scene.available,false);
  assert.ok(buttons.every(button=>button.hidden&&button.tabIndex===-1));assert.equal(scene.getDebug().campusMarkers.length,0);
  canvas.emit('webglcontextrestored');env.flush();assert.equal(overlay.hidden,false);assertLayout(copy(scene.getDebug().campusMarkers),640,380);assert.equal(scene.available,true);
  const replacement=env.mount({selectedLab:'ai'});env.flush();assert.equal(scene.getDebug().disposed,true);assert.equal(env.host.__techScene,replacement);assert.ok(buttons.every(button=>button.listenerCount()===0));assert.equal(canvas.listenerCount(),0);assert.equal(env.observers[0].disconnected,true);
  replacement.destroy();assert.equal(env.gl.deletedBuffers,2);assert.equal(env.gl.deletedPrograms,2);
});
