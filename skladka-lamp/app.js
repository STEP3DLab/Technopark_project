/* СКЛАДКА / 001 — автономный WebGL2-конфигуратор без библиотек и сетевых зависимостей.
   Масштаб сцены: метры. Экспорт GLB: glTF 2.0, бинарный контейнер. */
'use strict';

const $ = (id) => document.getElementById(id);
const viewer = $('viewer'), canvas = $('scene');
const state = {finish:'milk', shadeHeight:150, pleats:28, light:true, exploded:false};
const FINISHES = {
  milk:     {label:'Молочная', shade:'#e7dfd1', base:'#aaa69e', stem:'#a99a87', trim:'#c2b5a2'},
  terra:    {label:'Терракота', shade:'#be7156', base:'#88685b', stem:'#8e8073', trim:'#a18b79'},
  graphite: {label:'Графитовая',shade:'#45494a', base:'#525657', stem:'#8f928f', trim:'#848b8a'}
};
const GROUPS = ['base','stem','diffuser','led','shade'];
const groups = Object.fromEntries(GROUPS.map(name=>[name,{y:0,target:0}]));
const separateY = {base:-.041,stem:-.019,diffuser:.082,led:.113,shade:.216};
let meshes=[], gl, meshProgram, shadowProgram, bgProgram, quad, floorMesh, lightPoolMesh, glowMesh;
let width=1,height=1, pixelRatio=1, touched=false, lastTime=performance.now(), toastTimer=null;
let viewProjection=new Float32Array(16), cameraPosition=[0,0,0];
const camera={yaw:.61,pitch:.24,dist:.77,targetY:.162,targetX:0};
const goal={...camera};
const defaults={...camera};
const anchorPoints={shade:[.052,.274,0],led:[.036,.214,0],diffuser:[.077,.170,0],stem:[.007,.11,0],base:[.057,.009,0]};

// ---- Vector, matrix and mesh builders -------------------------------------
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const v3=(x=0,y=0,z=0)=>[x,y,z];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const normalize=(a)=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d);};
function lookAt(eye,target){
  const z=normalize(sub(eye,target)), x=normalize(cross([0,1,0],z)), y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function perspective(fovy,aspect,near,far){
  const f=1/Math.tan(fovy/2), d=1/(near-far);
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*d,-1,0,0,2*far*near*d,0]);
}
function mult(a,b){
  const r=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)
    for(let k=0;k<4;k++)r[col*4+row]+=a[k*4+row]*b[col*4+k];return r;
}
function geometry(positions,indices,normalOverride){
  const pos=new Float32Array(positions),ind=new Uint32Array(indices),norm=new Float32Array(pos.length);
  for(let k=0;k<ind.length;k+=3){
    const i=ind[k]*3,j=ind[k+1]*3,l=ind[k+2]*3;
    const ax=pos[j]-pos[i],ay=pos[j+1]-pos[i+1],az=pos[j+2]-pos[i+2];
    const bx=pos[l]-pos[i],by=pos[l+1]-pos[i+1],bz=pos[l+2]-pos[i+2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    for(const n of [i,j,l]){norm[n]+=nx;norm[n+1]+=ny;norm[n+2]+=nz;}
  }
  for(let i=0;i<norm.length;i+=3){const d=Math.hypot(norm[i],norm[i+1],norm[i+2])||1;norm[i]/=d;norm[i+1]/=d;norm[i+2]/=d;}
  if(normalOverride)normalOverride(pos,norm);
  return {positions:pos,normals:norm,indices:ind};
}
function lathe(profile,segments=96){
  let p=[],ix=[];
  for(let j=0;j<profile.length;j++)for(let i=0;i<=segments;i++){
    const a=2*Math.PI*i/segments;p.push(Math.cos(a)*profile[j][0],profile[j][1],Math.sin(a)*profile[j][0]);
  }
  for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){
    const a=j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;
    ix.push(a,c,b,b,c,d);
  }
  return geometry(p,ix);
}
function cylinder(radius,y0,y1,segments=72){
  return lathe([[0,y0],[radius,y0],[radius,y1],[0,y1]],segments);
}
function torus(radius,tube,y,segments=96,ringSegments=8){
  let p=[],ix=[];
  for(let j=0;j<=ringSegments;j++){
    const a=2*Math.PI*j/ringSegments,rr=radius+tube*Math.cos(a),yy=y+tube*Math.sin(a);
    for(let i=0;i<=segments;i++){let t=i*2*Math.PI/segments;p.push(rr*Math.cos(t),yy,rr*Math.sin(t));}
  }
  for(let j=0;j<ringSegments;j++)for(let i=0;i<segments;i++){
    const a=j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;ix.push(a,c,b,b,c,d);
  }
  return geometry(p,ix);
}
function translate(g,x,y,z){
  const p=Float32Array.from(g.positions);
  for(let i=0;i<p.length;i+=3){p[i]+=x;p[i+1]+=y;p[i+2]+=z;}
  return {positions:p,normals:g.normals,indices:g.indices};
}
function makeDiffuser(){
  const nr=12,nA=96,positions=[],indices=[];
  for(let j=0;j<=nr;j++){
    const f=j/nr,r=.082*f;
    const y=.172+.0052*(1-f*f);
    for(let k=0;k<=nA;k++){
      const a=k/nA*Math.PI*2;positions.push(Math.cos(a)*r,y,Math.sin(a)*r);
    }
  }
  for(let j=0;j<nr;j++)for(let i=0;i<nA;i++){
    const a=j*(nA+1)+i,b=a+1,c=a+nA+1,d=c+1;indices.push(a,c,b,b,c,d);
  }
  return geometry(positions,indices);
}
function shadeRadius(t){
  // Тактильная, слегка выпуклая трапеция. Верх образует собранную «шею».
  return .089-.044*t+.006*Math.sin(Math.PI*t)-.0018*Math.sin(2*Math.PI*t);
}
function foldAmplitude(t){return .0028+.0072*(1-t)*(1-t*.18);}
function makeShade(heightMM,pleats){
  const H=heightMM*.001,y0=.170,nY=36,positions=[],indices=[];
  // У каждой грани свои вершины: расчёт нормалей не скругляет острые сгибы.
  // Две плоскости на складку, внешняя и внутренняя стенки толщиной 1,5 мм.
  function v(x,y,z){positions.push(x,y,z);return positions.length/3-1;}
  for(let segment=0;segment<pleats*2;segment++){
    const a0=2*Math.PI*segment/(pleats*2),a1=2*Math.PI*(segment+1)/(pleats*2);
    const sign0=segment%2===0?1:-1,sign1=-sign0;
    const outer0=[],outer1=[],inner0=[],inner1=[];
    for(let j=0;j<=nY;j++){
      const t=j/nY,y=y0+t*H,twist=(t-.5)*.025;
      const r0=shadeRadius(t)+foldAmplitude(t)*sign0;
      const r1=shadeRadius(t)+foldAmplitude(t)*sign1;
      outer0.push(v(r0*Math.cos(a0+twist),y,r0*Math.sin(a0+twist)));
      outer1.push(v(r1*Math.cos(a1+twist),y,r1*Math.sin(a1+twist)));
      const ir0=r0-.00155,ir1=r1-.00155;
      inner0.push(v(ir0*Math.cos(a0+twist),y,ir0*Math.sin(a0+twist)));
      inner1.push(v(ir1*Math.cos(a1+twist),y,ir1*Math.sin(a1+twist)));
    }
    for(let j=0;j<nY;j++){
      const a=outer0[j],b=outer1[j],c=outer0[j+1],d=outer1[j+1];
      indices.push(a,c,b,b,c,d);
      const e=inner0[j],f=inner1[j],g=inner0[j+1],h=inner1[j+1];
      indices.push(e,f,g,f,h,g);
    }
    const o0=outer0[0],o1=outer1[0],i0=inner0[0],i1=inner1[0];
    indices.push(o0,o1,i0,o1,i1,i0);
    const last=nY,po0=outer0[last],po1=outer1[last],pi0=inner0[last],pi1=inner1[last];
    indices.push(po0,pi0,po1,po1,pi0,pi1);
  }
  return geometry(positions,indices);
}
function makeTopCollar(){
  const outer=shadeRadius(1)+foldAmplitude(1),inner=shadeRadius(1)-foldAmplitude(1);
  return lathe([[inner-.003,.170+state.shadeHeight*.001-.002],[inner-.003,.170+state.shadeHeight*.001+.003],[outer+.0005,.170+state.shadeHeight*.001+.003],[outer+.0005,.170+state.shadeHeight*.001-.002]],96);
}
function material(key){
  const f=FINISHES[state.finish];
  switch(key){
    case 'shade': return {color:f.shade,metal:.045,rough:.82,kind:1,emissive:.09};
    case 'base': return {color:f.base,metal:.82,rough:.37,kind:0,emissive:0};
    case 'stem': return {color:f.stem,metal:.86,rough:.32,kind:0,emissive:0};
    case 'trim': return {color:f.trim,metal:.72,rough:.42,kind:0,emissive:0};
    case 'dark': return {color:'#363b39',metal:.05,rough:.93,kind:0,emissive:0};
    case 'diffuser': return {color:'#fcf2dc',metal:0,rough:.94,kind:2,emissive:.53};
    case 'led': return {color:'#ffe1b4',metal:0,rough:.55,kind:3,emissive:1.05};
    case 'ledmetal': return {color:'#b4aba0',metal:.77,rough:.48,kind:0,emissive:0};
    default: throw Error('Неизвестный материал: '+key);
  }
}
function add(name,geom,materialName,part){
  meshes.push({name,geom,materialName,part,gpu:null});
}
function buildScene(){
  for(const m of meshes)destroyGPU(m);meshes=[];
  // Устойчивое основание Ø 124 мм: литой/точёный алюминий, утяжелитель и эластомерная опора.
  add('01 | Утяжелённый корпус основания Ø124 мм',lathe([[0,.006],[.041,.006],[.055,.0065],[.061,.008],[.062,.010],[.062,.012],[.060,.0145],[.056,.016],[.009,.016],[0,.016]],112),'base','base');
  add('01a | Противоскользящая опора',cylinder(.046,.0005,.0058,96),'dark','base');
  add('01b | Ободок основания',torus(.059,.0011,.0128,104),'trim','base');
  add('02 | Опорный узел',cylinder(.0115,.016,.026),'stem','stem');
  add('02a | Полая металлическая стойка Ø9 мм',cylinder(.00455,.026,.207,80),'stem','stem');
  add('02b | Верхняя втулка',cylinder(.009,.205,.222),'trim','stem');
  add('02c | Кольцо фиксации',torus(.009,.0016,.211,80),'base','stem');
  // Размыкаемый нижний рассеиватель: съёмное опаловое стекло/полимер (концепт).
  add('03 | Опаловый рассеиватель Ø164 мм',makeDiffuser(),'diffuser','diffuser');
  add('03a | Внутренний прижимной обод',torus(.082,.0017,.1718,112),'trim','diffuser');
  // LED-модуль и теплоотвод визуализированы отдельными реальными объёмами.
  add('04 | Металлический радиатор LED',cylinder(.034,.218,.231,96),'ledmetal','led');
  add('04a | Плата LED / тёплый свет 2700 K',cylinder(.030,.213,.218,96),'led','led');
  for(let n=0;n<12;n++){
    const a=n*2*Math.PI/12,r=.022;
    add('04b | Светодиод '+(n+1),translate(cylinder(.0025,.209,.213,16),r*Math.cos(a),0,r*Math.sin(a)),'led','led');
  }
  // Однослойный складчатый абажур с реальной внутренней поверхностью и торцевыми гранями.
  add('05 | Плиссированный абажур / '+state.pleats+' складок',makeShade(state.shadeHeight,state.pleats),'shade','shade');
  add('05a | Верхняя соединительная обечайка',makeTopCollar(),'trim','shade');
  anchorPoints.shade[1]=.170+state.shadeHeight*.001*.64;
  if(gl)for(const m of meshes)uploadGPU(m);
}
function hexToRGB(hex){
  const h=hex.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
}
function hexToLinear(hex){return hexToRGB(hex).map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));}

// ---- WebGL2 programs ------------------------------------------------------
const vertexShader=`#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uVP;
uniform vec3 uOffset;
out vec3 vPosition;
out vec3 vNormal;
void main(){vPosition=aPosition+uOffset;vNormal=aNormal;gl_Position=uVP*vec4(vPosition,1.);}`;
const fragmentShader=`#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
uniform vec3 uColor;
uniform vec3 uEye;
uniform float uMetal;
uniform float uRough;
uniform float uKind;
uniform float uEmissive;
uniform float uOn;
out vec4 fragColor;
vec3 toSRGB(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){
  vec3 N=normalize(vNormal);
  if(!gl_FrontFacing)N=-N;
  vec3 V=normalize(uEye-vPosition);
  vec3 L=normalize(vec3(-.52,.96,.82));
  vec3 Lfill=normalize(vec3(.75,.42,-.42));
  vec3 Lrim=normalize(vec3(.08,.71,-.94));
  float key=max(dot(N,L),0.);
  float fill=max(dot(N,Lfill),0.);
  float rim=max(dot(N,Lrim),0.);
  float ambient=.40+.12*clamp(N.y,-1.,1.);
  float light=ambient+.63*key+.18*fill+.21*rim;
  vec3 lit=uColor*light;
  vec3 H=normalize(V+L),H2=normalize(V+Lfill);
  float sheen=pow(max(dot(N,H),0.),mix(86.,18.,uRough)) * (.16+.45*uMetal);
  float sheen2=pow(max(dot(N,H2),0.),mix(115.,24.,uRough)) * (.11+.20*uMetal);
  float edge=pow(1.-max(dot(N,V),0.),3.);
  lit+=mix(vec3(.96,.91,.83),uColor,uMetal)*((sheen*.94+sheen2*.47)+edge*(.055+.035*uMetal));
  if(uMetal>.5){
    float band=pow(max(dot(reflect(-V,N),normalize(vec3(.45,.42,.88))),0.),9.);
    lit+=uColor*band*.22;
  }
  if(uKind>.5&&uKind<1.5){
    float lower=1.-clamp((vPosition.y-.170)/.19,0.,1.);
    float radiance=.47*lower*lower*exp(-abs(vPosition.x)*1.7);
    lit+=uOn*vec3(.98,.40,.15)*radiance*mix(.9,.12,clamp(uMetal*4.,0.,1.));
    float grain=.992+.008*sin(vPosition.y*2040.+vPosition.x*770.);
    lit*=grain;
  }
  if(uKind>1.5&&uKind<2.5){
    lit=mix(lit,vec3(1.0,.80,.52),uOn*.25);
    lit+=uOn*vec3(1.,.56,.21)*uEmissive*.55;
  }
  if(uKind>2.5){lit+=uOn*vec3(1.,.61,.29)*uEmissive*.70;}
  // Искусственный источник внутри абажура слегка освещает реальную внутреннюю сторону.
  vec3 lp=vec3(0.,.231,0.), toLight=lp-vPosition;
  float reach=length(toLight);
  float ndl=max(dot(N,normalize(toLight)),0.);
  lit+=uOn*uColor*(.055*ndl/(1.+reach*reach*140.));
  lit=lit/(vec3(1.)+lit*.13); // мягкая плёночная компрессия света
  fragColor=vec4(toSRGB(max(lit,vec3(0.))),1.);
}`;
const bgVertex=`#version 300 es
layout(location=0) in vec2 p;
out vec2 uv;
void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const bgFragment=`#version 300 es
precision highp float;
in vec2 uv;
out vec4 fragColor;
void main(){
  vec2 q=(uv-vec2(.50,.49))*vec2(1.18,1.0);
  float halo=exp(-dot(q,q)*5.6);
  vec3 base=vec3(.965,.956,.936);
  base=mix(base,vec3(.997,.994,.989),halo*.74);
  float vignette=smoothstep(.05,.95,length(q));
  base-=vignette*.012;
  fragColor=vec4(base,1.);
}`;
const floorVertex=`#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uVP;
uniform vec3 uOffset;
out vec3 vUV;
void main(){vUV=aNormal;gl_Position=uVP*vec4(aPosition+uOffset,1.);}`;
const floorFragment=`#version 300 es
precision highp float;
in vec3 vUV;
uniform vec3 uTint;
uniform float uStrength;
out vec4 fragColor;
void main(){float r=length(vUV.xy);float a=pow(max(1.-r*r,0.),2.5)*uStrength;fragColor=vec4(uTint,a);}`;
function compile(type,source){
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;
}
function program(v,f){
  const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,v));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
}
function uploadGPU(m){
  if(!gl)return;
  const g=m.geom,vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const vertex=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertex);gl.bufferData(gl.ARRAY_BUFFER,g.positions,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
  const normal=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,normal);gl.bufferData(gl.ARRAY_BUFFER,g.normals,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
  const index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,g.indices,gl.STATIC_DRAW);
  gl.bindVertexArray(null);m.gpu={vao,vertex,normal,index,count:g.indices.length};
}
function destroyGPU(m){
  if(!gl||!m.gpu)return;const g=m.gpu;
  gl.deleteVertexArray(g.vao);gl.deleteBuffer(g.vertex);gl.deleteBuffer(g.normal);gl.deleteBuffer(g.index);m.gpu=null;
}
function makeShadowPlane(rx,rz,y){
  const p=[-rx,y,-rz,rx,y,-rz,rx,y,rz,-rx,y,rz];
  const uv=[-1,-1,0,1,-1,0,1,1,0,-1,1,0];
  return {positions:new Float32Array(p),normals:new Float32Array(uv),indices:new Uint32Array([0,1,2,0,2,3])};
}
function initGL(){
  gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  if(!gl)throw Error('Браузер не поддерживает WebGL 2.0');
  meshProgram=program(vertexShader,fragmentShader);bgProgram=program(bgVertex,bgFragment);shadowProgram=program(floorVertex,floorFragment);
  quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  floorMesh={geom:makeShadowPlane(.182,.142,.001),gpu:null};uploadGPU(floorMesh);
  lightPoolMesh={geom:makeShadowPlane(.360,.285,.0011),gpu:null};uploadGPU(lightPoolMesh);
  glowMesh={geom:makeShadowPlane(.124,.124,.1695),gpu:null};uploadGPU(glowMesh);
  for(const m of meshes)uploadGPU(m);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const resizer=new ResizeObserver(resize);resizer.observe(viewer);resize();
  requestAnimationFrame(render);
  $('sceneLoading').classList.add('hidden');
}
function resize(){
  if(!gl)return;
  width=Math.max(1,viewer.clientWidth);height=Math.max(1,viewer.clientHeight);
  pixelRatio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.round(width*pixelRatio));canvas.height=Math.max(1,Math.round(height*pixelRatio));
  gl.viewport(0,0,canvas.width,canvas.height);
  const mobile=window.matchMedia('(max-width:780px)').matches;
  defaults.targetX=mobile?0:.016;
  if(!touched)goal.targetX=defaults.targetX;
}
function uniform(program,name){return gl.getUniformLocation(program,name);}
function bindProgram(p,vp,eye){gl.useProgram(p);gl.uniformMatrix4fv(uniform(p,'uVP'),false,vp);if(eye)gl.uniform3fv(uniform(p,'uEye'),eye);}
function drawMesh(m){
  const mat=material(m.materialName),partY=groups[m.part].y;
  gl.uniform3fv(uniform(meshProgram,'uOffset'),[0,partY,0]);
  gl.uniform3fv(uniform(meshProgram,'uColor'),hexToLinear(mat.color));
  gl.uniform1f(uniform(meshProgram,'uMetal'),mat.metal);
  gl.uniform1f(uniform(meshProgram,'uRough'),mat.rough);
  gl.uniform1f(uniform(meshProgram,'uKind'),mat.kind);
  gl.uniform1f(uniform(meshProgram,'uEmissive'),mat.emissive);
  gl.uniform1f(uniform(meshProgram,'uOn'),state.light?1:0);
  gl.bindVertexArray(m.gpu.vao);gl.drawElements(gl.TRIANGLES,m.gpu.count,gl.UNSIGNED_INT,0);
}
function drawShadow(m,color,strength){
  gl.uniform3fv(uniform(shadowProgram,'uTint'),color);gl.uniform1f(uniform(shadowProgram,'uStrength'),strength);
  gl.uniform3fv(uniform(shadowProgram,'uOffset'),[0,0,0]);
  gl.bindVertexArray(m.gpu.vao);gl.drawElements(gl.TRIANGLES,m.gpu.count,gl.UNSIGNED_INT,0);
}
function frame(dt){
  const speed=1-Math.exp(-dt*7.2),camSpeed=1-Math.exp(-dt*6);
  for(const g of GROUPS){const p=groups[g];p.target=state.exploded?separateY[g]:0;p.y=lerp(p.y,p.target,speed);}
  camera.yaw=lerp(camera.yaw,goal.yaw,camSpeed);
  camera.pitch=lerp(camera.pitch,goal.pitch,camSpeed);
  camera.dist=lerp(camera.dist,goal.dist,camSpeed);
  camera.targetY=lerp(camera.targetY,goal.targetY,camSpeed);
  camera.targetX=lerp(camera.targetX,goal.targetX,camSpeed);
  const p=camera.pitch,a=camera.yaw,d=camera.dist;
  const target=[camera.targetX,camera.targetY,0];
  cameraPosition=[target[0]+d*Math.sin(a)*Math.cos(p),target[1]+d*Math.sin(p),target[2]+d*Math.cos(a)*Math.cos(p)];
  viewProjection=mult(perspective(Math.PI/5.7,width/height,.025,8),lookAt(cameraPosition,target));
}
function project(v){
  const m=viewProjection,x=v[0],y=v[1],z=v[2],w=m[3]*x+m[7]*y+m[11]*z+m[15];
  if(w<=0)return [width/2,height/2];
  return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5*width+width*.5,
         height-(m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5*height-height*.5];
}
function updateAnnotations(){
  if(!state.exploded)return;
  for(let i=0;i<GROUPS.length;i++){
    const name=GROUPS[i],el=document.querySelector('.annotation[data-part="'+name+'"]');
    const anchor=anchorPoints[name],p=project([anchor[0],anchor[1]+groups[name].y,anchor[2]]);
    const mirrored=(name==='shade'||name==='led'||name==='base');
    el.classList.toggle('mirror',mirrored);
    let x=p[0]+(mirrored?-17:16),y=p[1]+(i-2)*2;
    // В разнесённом виде подписи фиксируются в пределах видимой сцены.
    x=clamp(x,mirrored?125:10,mirrored?width-12:width-190);
    y=clamp(y,18,height-24);
    el.style.left=x+'px';el.style.top=y+'px';
    el.style.transform=mirrored?'translate(-100%,-50%)':'translate(0,-50%)';
  }
}
function render(now){
  const dt=Math.min(.06,(now-lastTime)/1000||.016);lastTime=now;
  frame(dt);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  gl.useProgram(bgProgram);gl.bindBuffer(gl.ARRAY_BUFFER,quad);
  const loc=gl.getAttribLocation(bgProgram,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);
  gl.depthMask(false);bindProgram(shadowProgram,viewProjection);
  drawShadow(lightPoolMesh,[.98,.71,.40],state.light&&!state.exploded?.32:0);
  drawShadow(glowMesh,[1.,.72,.37],state.light&&!state.exploded?.11:0);
  drawShadow(floorMesh,[.28,.26,.21],state.exploded?.055:.17);
  gl.depthMask(true);
  bindProgram(meshProgram,viewProjection,cameraPosition);
  for(const m of meshes)drawMesh(m);
  gl.bindVertexArray(null);updateAnnotations();
  requestAnimationFrame(render);
}

// ---- Интерфейс и управление ------------------------------------------------
function updateRange(el){const value=Number(el.value),min=Number(el.min),max=Number(el.max);el.style.setProperty('--progress',((value-min)/(max-min)*100)+'%');}
function updateUI(){
  $('finishValue').textContent=FINISHES[state.finish].label;
  $('heightValue').textContent=state.shadeHeight;
  $('pleatsValue').textContent=state.pleats;
  $('heightRange').value=state.shadeHeight;$('pleatRange').value=state.pleats;
  updateRange($('heightRange'));updateRange($('pleatRange'));
  const d=170+state.shadeHeight;
  $('dimensionLabel').textContent=`${d} × 200 × 200 мм`;
  document.querySelectorAll('.finish-option').forEach(btn=>{
    const selected=btn.dataset.finish===state.finish;
    btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
  });
  $('lightStatus').textContent=state.light?'Включено':'Выключено';
  $('lightSwitch').classList.toggle('on',state.light);
  $('lightSwitch').setAttribute('aria-checked',String(state.light));
  $('lightCaption').classList.toggle('off',!state.light);
  $('lightCaption').lastElementChild.textContent=state.light?'ТЁПЛЫЙ СВЕТ / 2700 K':'СВЕТ ВЫКЛЮЧЕН';
  $('explodeButton').classList.toggle('active',state.exploded);
  $('explodeLabel').textContent=state.exploded?'Собрать светильник':'Разнести детали';
  $('explodeIcon').textContent=state.exploded?'⤡':'⤢';
  $('annotations').classList.toggle('show',state.exploded);
  $('annotations').setAttribute('aria-hidden',String(!state.exploded));
}
function notify(message){const t=$('toast');t.textContent=message;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),3000);}
function setExploded(v){
  state.exploded=v;
  goal.dist=v?1.37:.77;
  goal.targetY=v?.252:defaults.targetY;
  goal.targetX=v?0:defaults.targetX;
  updateUI();
}
function resetView(){
  state.exploded=false;
  Object.assign(goal,defaults);
  touched=false;updateUI();notify('Презентационный ракурс восстановлен');
}
function setupControls(){
  document.querySelectorAll('.finish-option').forEach(btn=>btn.addEventListener('click',()=>{
    state.finish=btn.dataset.finish;updateUI();
  }));
  $('heightRange').addEventListener('input',e=>{state.shadeHeight=Number(e.target.value);buildScene();updateUI();});
  $('pleatRange').addEventListener('input',e=>{state.pleats=Number(e.target.value);buildScene();updateUI();});
  $('lightSwitch').addEventListener('click',()=>{state.light=!state.light;updateUI();});
  $('explodeButton').addEventListener('click',()=>setExploded(!state.exploded));
  $('resetButton').addEventListener('click',resetView);
  $('glbButton').addEventListener('click',exportGLB);
  $('pngButton').addEventListener('click',exportPNG);
  const pointers=new Map();let previousPinch=null;
  viewer.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;
    viewer.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});previousPinch=null;
  });
  viewer.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    const last=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){
      const dx=e.clientX-last.x,dy=e.clientY-last.y;
      if(Math.abs(dx)+Math.abs(dy)<.25)return;
      goal.yaw-=dx*.007;goal.pitch=clamp(goal.pitch+dy*.0055,-.20,1.24);touched=true;
    }else if(pointers.size===2){
      const [p,q]=Array.from(pointers.values()),dist=Math.hypot(p.x-q.x,p.y-q.y);
      if(previousPinch)goal.dist=clamp(goal.dist*previousPinch/dist,.45,1.65);
      previousPinch=dist;touched=true;
    }
    if(touched)$('interactionHint').classList.add('faded');
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])viewer.addEventListener(name,e=>{pointers.delete(e.pointerId);previousPinch=null;});
  viewer.addEventListener('wheel',e=>{e.preventDefault();goal.dist=clamp(goal.dist*Math.exp(e.deltaY*.0007),.45,1.65);touched=true;$('interactionHint').classList.add('faded');},{passive:false});
  viewer.addEventListener('dblclick',resetView);
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function exportPNG(){
  if(!gl){notify('Не удалось получить снимок: WebGL недоступен');return;}
  try{
    // preserveDrawingBuffer позволяет снимать именно текущий ракурс, без панели управления.
    canvas.toBlob(blob=>{
      if(!blob){notify('Не удалось создать PNG');return;}
      download(blob,`skladka-${state.finish}-${state.pleats}folds.png`);
      notify('PNG текущего ракурса сохранён');
    },'image/png');
  }catch(e){console.error(e);notify('Ошибка экспорта PNG');}
}

// ---- Настоящий экспорт бинарного glTF 2.0 без сторонних библиотек ----------
function exportGLB(){
  const button=$('glbButton');button.disabled=true;
  try{
    const gltf={asset:{version:'2.0',generator:'СКЛАДКА / parametric WebGL design concept'},
      scene:0,scenes:[{name:'СКЛАДКА — собранный светильник',nodes:[]}],
      nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[],extras:{
        designConcept:true,units:'metres',nominalHeightMM:170+state.shadeHeight,
        shadeHeightMM:state.shadeHeight,pleatCount:state.pleats,finish:state.finish,
        assembly:'Центральный стержень, съёмный рассеиватель, фиксирующее кольцо. Узлы предварительные.'
      }};
    const chunks=[];let binaryLength=0;
    function append(array,target){
      const raw=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
      const pad=(4-raw.byteLength%4)%4;const padded=new Uint8Array(raw.byteLength+pad);padded.set(raw);
      const view=gltf.bufferViews.length;
      gltf.bufferViews.push({buffer:0,byteOffset:binaryLength,byteLength:raw.byteLength,target});
      chunks.push(padded);binaryLength+=padded.length;return view;
    }
    function accessor(array,itemType,target,minmax){
      const view=append(array,target),access={bufferView:view,componentType:array instanceof Float32Array?5126:array instanceof Uint16Array?5123:5125,
        count:array.length/itemType,type:itemType===3?'VEC3':'SCALAR'};
      if(minmax){access.min=minmax[0];access.max=minmax[1];}
      const id=gltf.accessors.length;gltf.accessors.push(access);return id;
    }
    const matMap={};
    function materialIndex(key){
      if(matMap[key]!==undefined)return matMap[key];
      const m=material(key),col=hexToRGB(m.color);
      const mat={name:key,pbrMetallicRoughness:{baseColorFactor:[...col,1],metallicFactor:m.metal,roughnessFactor:m.rough},doubleSided:key==='shade'||key==='diffuser'};
      if(m.kind===2||m.kind===3){mat.emissiveFactor=state.light?[1,.65,.38]:[0,0,0];}
      const id=gltf.materials.length;gltf.materials.push(mat);matMap[key]=id;return id;
    }
    for(const m of meshes){
      const g=m.geom;
      let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<g.positions.length;i+=3)for(let j=0;j<3;j++){
        const x=g.positions[i+j];mn[j]=Math.min(mn[j],x);mx[j]=Math.max(mx[j],x);
      }
      const pos=accessor(g.positions,3,34962,[mn,mx]);
      const normal=accessor(g.normals,3,34962);
      const ind=g.positions.length/3<65536?new Uint16Array(g.indices):g.indices;
      const indices=accessor(ind,1,34963);
      const id=gltf.meshes.length;
      gltf.meshes.push({name:m.name,primitives:[{attributes:{POSITION:pos,NORMAL:normal},indices,material:materialIndex(m.materialName),mode:4}]});
      gltf.nodes.push({name:m.name,mesh:id,extras:{component:m.part}});
      gltf.scenes[0].nodes.push(gltf.nodes.length-1);
    }
    gltf.buffers.push({byteLength:binaryLength});
    const encoder=new TextEncoder(),json=encoder.encode(JSON.stringify(gltf));
    const pad=(4-json.length%4)%4,jsonChunk=new Uint8Array(json.length+pad);jsonChunk.fill(32);jsonChunk.set(json);
    const total=12+8+jsonChunk.length+8+binaryLength;
    const result=new ArrayBuffer(total),dv=new DataView(result),bytes=new Uint8Array(result);
    dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);
    dv.setUint32(12,jsonChunk.length,true);dv.setUint32(16,0x4e4f534a,true);bytes.set(jsonChunk,20);
    const offset=20+jsonChunk.length;dv.setUint32(offset,binaryLength,true);dv.setUint32(offset+4,0x004e4942,true);
    let cursor=offset+8;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}
    download(new Blob([result],{type:'model/gltf-binary'}),`skladka-${state.finish}-${state.pleats}folds.glb`);
    notify('GLB собранной модели сохранён');
  }catch(e){console.error('GLB export failed',e);notify('Не удалось подготовить GLB');}
  finally{button.disabled=false;}
}

// Доступно тестам и дизайнеру в DevTools: только сведения о состоянии, без внутренних WebGL-объектов.
window.__skladka={getState:()=>({...state,heightMM:170+state.shadeHeight,parts:GROUPS.length,meshCount:meshes.length,triangles:meshes.reduce((n,m)=>n+m.geom.indices.length/3,0)}),resetView,exportGLB,exportPNG};

try{buildScene();setupControls();updateUI();initGL();}
catch(error){console.error('СКЛАДКА: ошибка инициализации',error);$('sceneLoading').classList.add('hidden');$('canvasFallback').hidden=false;}
