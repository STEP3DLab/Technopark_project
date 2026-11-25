'use strict';
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#canvas');
const hint = document.querySelector('#hint');
const expand = document.querySelector('#expand');
function showFallback() {
  stage.classList.remove('ready');
  stage.classList.add('fallback');
  document.querySelector('#mode').textContent='Изображение модели';
  hint.textContent='Интерактивный просмотр недоступен. Вы можете скачать STL ниже.';
}
function syncFullscreen() {
  const active = !!document.fullscreenElement || stage.classList.contains('full');
  expand.title = active ? 'Свернуть' : 'Развернуть';
  expand.setAttribute('aria-label', expand.title);
  expand.setAttribute('aria-pressed',String(active));
  document.body.classList.toggle('expanded',active);
}
expand.addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if(stage.classList.contains('full')) stage.classList.remove('full');
  else {
    try { await stage.requestFullscreen(); }
    catch { stage.classList.add('full'); }
  }
  syncFullscreen();
});
document.addEventListener('fullscreenchange',syncFullscreen);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && stage.classList.contains('full')) {
    stage.classList.remove('full');syncFullscreen();expand.focus();
  }
});
async function startViewer() {
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});

  const response=await fetch('./assets/plume.mesh');
  if(!response.ok) throw new Error('Mesh unavailable');
  const file=await response.arrayBuffer(),head=new DataView(file);
  const count=head.getUint32(0,true),elements=head.getUint32(4,true);
  if(file.byteLength!==8+count*16+elements*2)throw new Error('Incomplete mesh');
  const positions=new Float32Array(file,8,count*3);
  const normals=new Int8Array(file,8+count*12,count*3);
  const occlusion=new Uint8Array(file,8+count*15,count);
  const faces=new Uint16Array(file,8+count*16,elements);
  const soft=gl?null:softwareRenderer(canvas,positions,normals,occlusion,faces);
  let U;
  if(gl){
  const program=gl.createProgram();
  function shader(type,source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(program,s);
  }
  shader(gl.VERTEX_SHADER,`
    attribute vec3 position,normal;attribute float ao;
    uniform vec3 right,up,eye;uniform vec4 frame;
    varying vec3 N;varying float occ;
    void main(){
      vec2 p=vec2(dot(position,right),dot(position,up));
      gl_Position=vec4((p-frame.xy)*frame.zw,-dot(position,eye)/180.,1.);
      N=vec3(dot(normal,right),dot(normal,up),dot(normal,eye));occ=ao;
    }`);
  shader(gl.FRAGMENT_SHADER,`
    precision mediump float;
    varying vec3 N;varying float occ;
    void main(){
      vec3 n=normalize(N);
      vec3 key=normalize(vec3(-.62,.85,.58)),fill=normalize(vec3(.75,.04,.68));
      float diffuse=max(dot(n,key),0.);
      float sheen=pow(max(dot(n,normalize(key+vec3(0,0,1))),0.),33.)*.09;
      float rim=pow(1.-max(n.z,0.),2.9)*(.035+.11*max(n.y,0.));
      vec3 col=vec3(.76,.704,.625)*(.30+.72*diffuse+.14*max(dot(n,fill),0.))*
          (.48+.52*occ)+vec3(sheen+rim);
      gl_FragColor=vec4(pow(col,vec3(.60)),1.);
    }`);
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  function attribute(name,data,length,type,normalize) {
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    const i=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i,length,type,normalize,0,0);
  }
  attribute('position',positions,3,gl.FLOAT,false);
  attribute('normal',normals,3,gl.BYTE,true);
  attribute('ao',occlusion,1,gl.UNSIGNED_BYTE,true);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,faces,gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  U=Object.fromEntries(['right','up','eye','frame'].map(key=>[key,gl.getUniformLocation(program,key)]));
  }
  const initial={az:-.57,el:.23,zoom:1},view={...initial};
  let pending=false;
  function draw() {
    pending=false;
    const w=stage.clientWidth,h=stage.clientHeight,dpr=gl?Math.min(devicePixelRatio||1,2):Math.min(devicePixelRatio||1,1.6,950/Math.max(w,h));
    if(!w||!h)return;
    const width=Math.round(w*dpr),height=Math.round(h*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    if(gl)gl.viewport(0,0,width,height);
    const a=Math.cos(view.az),b=Math.sin(view.az),c=Math.cos(view.el),d=Math.sin(view.el);
    const right=[a,b,0],up=[-b*d,a*d,c],eye=[b*c,-a*c,d];
    let left=Infinity,low=Infinity,r=-Infinity,high=-Infinity;
    for(let i=0;i<positions.length;i+=39){
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      const px=x*a+y*b,py=x*up[0]+y*up[1]+z*c;
      left=Math.min(left,px);r=Math.max(r,px);low=Math.min(low,py);high=Math.max(high,py);
    }
    const scale=Math.min(w*.88/Math.max(r-left,1),h*.77/Math.max(high-low,1))*view.zoom;
    if(soft){soft(right,up,eye,(left+r)/2,(low+high)/2+.008*h/scale,scale*dpr);return;}
    gl.uniform3fv(U.right,right);gl.uniform3fv(U.up,up);gl.uniform3fv(U.eye,eye);
    gl.uniform4f(U.frame,(left+r)/2,(low+high)/2+.008*h/scale,2*scale/w,2*scale/h);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,elements,gl.UNSIGNED_SHORT,0);
  }
  function schedule(){if(!pending){pending=true;requestAnimationFrame(draw);}}
  function zoom(factor){view.zoom=Math.min(3.5,Math.max(.55,view.zoom*factor));schedule();}
  function rotate(dx,dy){view.az-=dx*.009;view.el=Math.max(-1.49,Math.min(1.49,view.el+dy*.009));schedule();}
  function reset(){Object.assign(view,initial);schedule();}
  document.querySelector('#in').onclick=()=>zoom(1.2);
  document.querySelector('#out').onclick=()=>zoom(1/1.2);
  document.querySelector('#reset').onclick=reset;
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-Math.sign(e.deltaY)*.105));},{passive:false});
  const points=new Map();
  const span=()=>{const [a,b]=[...points.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',e=>{
    const last=points.get(e.pointerId);if(!last)return;
    const previous=points.size===2?span():0;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size===1)rotate(e.clientX-last.x,e.clientY-last.y);
    else if(points.size===2 && previous>1)zoom(span()/previous);
  });
  function end(e){points.delete(e.pointerId);if(points.size===0)canvas.classList.remove('dragging');}
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,end));
  canvas.addEventListener('keydown',e=>{
    const actions={ArrowLeft:()=>rotate(-12,0),ArrowRight:()=>rotate(12,0),ArrowUp:()=>rotate(0,12),ArrowDown:()=>rotate(0,-12),'+':()=>zoom(1.2),'=':()=>zoom(1.2),'-':()=>zoom(1/1.2),Home:reset};
    if(actions[e.key]){e.preventDefault();actions[e.key]();}
  });
  new ResizeObserver(schedule).observe(stage);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showFallback();});
  draw();stage.classList.add('ready');
  if(matchMedia('(pointer:coarse)').matches)hint.textContent='Вращайте одним пальцем · Меняйте масштаб двумя';
}
startViewer().catch(error=>{console.warn(error.message);showFallback();});
