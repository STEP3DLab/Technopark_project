const d=id=>document.getElementById(id);
const rad=Math.PI/180, cos20=Math.cos(20*rad),sin20=Math.sin(20*rad);
const face=(u,v,t)=>[u,v*cos20-t*sin20,55+v*sin20+t*cos20];
const dot=(u,v)=>u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n)};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const groupNames={base:['Основание','LM04-01 · Опорная плита с четырьмя винтами.'],housing:['Корпус','LM04-02 · Печатный корпус с наклонной поверхностью.'],panel:['Лицевая панель','LM04-03 · Основа для экрана и четырёх меток.'],screen:['Макет экрана','LM04-04 · Глухая печатная вставка с наклейкой.'],markers:['Метка канала','LM04-05 · Глухая тактильная вставка.'],fasteners:['Потайной винт','ST2,9 × 16 · Крепление основания снизу.']};
const lift={base:-20,housing:0,panel:29,screen:54,markers:64,fasteners:-46};
const defaultCamera={yaw:.56,pitch:.55,zoom:1};
function shifted(part,amount){
  const z=lift[part.group]*amount;
  return [0,(['panel','screen','markers'].includes(part.group)?-.24*z:0),z];
}
function prepare(part){
  const pos=new Float32Array(part.vertices),index=new Uint16Array(part.indices),normals=new Float32Array(pos.length);
  for(let i=0;i<index.length;i+=3){
    const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
    const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2];
    const vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    for(const k of [a,b,c]){normals[k]+=nx;normals[k+1]+=ny;normals[k+2]+=nz}
  }
  for(let i=0;i<normals.length;i+=3){const n=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=n;normals[i+1]/=n;normals[i+2]/=n}
  return {id:part.id,group:part.group,color:rgb(part.color),pos,index,normals};
}
function makeDecal(plate,u,v,w,h,t,tex){
  const points=[face(u-w/2,v+h/2,t),face(u+w/2,v+h/2,t),face(u+w/2,v-h/2,t),face(u-w/2,v-h/2,t)];
  return {id:'decal',group:plate,points,tex,pos:new Float32Array(points.flat()),index:new Uint16Array([0,1,2,0,2,3]),uv:new Float32Array([0,0,1,0,1,1,0,1])};
}
function texture(w,h){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;
}
function paintScreen(img,s){
  const c=img.getContext('2d'),w=img.width,h=img.height;
  const gradient=c.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#1b3537');gradient.addColorStop(.7,'#0e2727');gradient.addColorStop(1,'#183937');c.fillStyle=gradient;c.fillRect(0,0,w,h);
  c.fillStyle='#b0f2c7';c.font='600 40px Arial, sans-serif';c.fillText('MONITOR',30,55);c.fillStyle='#80a5a0';c.font='24px monospace';c.fillText('/ LM–04',237,53);
  c.fillStyle=s.state==='running'?'#b4f3aa':'#75b6a6';c.beginPath();c.arc(w-36,38,7,0,Math.PI*2);c.fill();
  c.strokeStyle='#538077';c.lineWidth=2;c.beginPath();c.moveTo(28,79);c.lineTo(w-28,79);c.stroke();
  c.fillStyle='#a4cab7';c.font='21px monospace';c.fillText('КАНАЛЫ',30,122);c.fillText('ТАЙМЕР',w*.54,122);
  c.fillStyle='#e0fae6';c.font='500 73px Arial, sans-serif';c.fillText(String(s.enabled.slice(0,s.count).filter(Boolean).length).padStart(2,'0'),27,195);
  c.fillStyle='#a0e9c3';c.font='48px monospace';c.fillText(s.elapsed,w*.54,187);
  const baseline=275;
  c.strokeStyle='#345751';c.lineWidth=1;
  for(let x=30;x<w-26;x+=32){c.beginPath();c.moveTo(x,221);c.lineTo(x,331);c.stroke()}
  for(let y=221;y<335;y+=27){c.beginPath();c.moveTo(30,y);c.lineTo(w-28,y);c.stroke()}
  c.lineWidth=3;c.strokeStyle='#83e8bb';c.beginPath();
  const shift=s.state==='running'?Number(s.elapsed.slice(-2))*.25:0;
  for(let x=30;x<w-24;x+=2){const a=(x-30)/w;const y=baseline-23*Math.sin(7*a+shift)-13*Math.sin(a*24+shift)-10*Math.sin(a*38);if(x===30)c.moveTo(x,y);else c.lineTo(x,y)}c.stroke();
  c.fillStyle='#94bca9';c.font='18px monospace';c.fillText('ДЕМОНСТРАЦИЯ',30,h-23);
  c.fillStyle='#60b6a7';c.fillRect(w-104,h-34,68,4);
}
function paintPlate(img){
  const c=img.getContext('2d'),w=img.width,h=img.height;c.clearRect(0,0,w,h);
  c.fillStyle='#c4d4cb';c.font='600 54px Arial, sans-serif';c.fillText('LUMEN',5,57);
  c.fillStyle='#9bc9bb';c.font='33px monospace';c.fillText('LM–04',w-130,55);c.fillStyle='#6a8a80';c.fillRect(215,47,w-395,2);
}
function paintLegends(img){
  const c=img.getContext('2d');c.clearRect(0,0,img.width,img.height);
  const x=u=>(u-29)*15,y=v=>(32-v)*15;
  c.fillStyle='#b0c5bd';c.font='bold 36px monospace';c.textAlign='center';
  for(const [name,u,v] of [['01',40,23],['02',62,23],['03',40,-3],['04',62,-3]])c.fillText(name,x(u),y(v));
  c.fillStyle='#8cad9e';c.font='34px monospace';c.fillText('КАНАЛЫ',x(51),y(-24));
}
function makeTechCanvas(){const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');Object.assign(canvas.style,{pointerEvents:'none'});d('viewport').prepend(canvas);return canvas}
const vs=`attribute vec3 p;attribute vec3 n;attribute vec2 uv;uniform vec3 rightV,upV,eyeV,center,offset;uniform vec2 scale;uniform float centerY;varying vec3 vn;varying vec2 vt;varying vec3 vp;void main(){vec3 q=p+offset-center;gl_Position=vec4(dot(q,rightV)*scale.x,dot(q,upV)*scale.y+centerY,-dot(q,eyeV)/480.,1.);vn=n;vt=uv;vp=p;}`;
const fs=`precision mediump float;varying vec3 vn;varying vec2 vt;varying vec3 vp;uniform vec3 albedo,eyeV;uniform float useTex,selected;uniform sampler2D graph;void main(){if(useTex>.5){vec4 s=texture2D(graph,vt);if(s.a<.12)discard;gl_FragColor=s;return;}vec3 n=normalize(vn);vec3 key=normalize(vec3(-.53,-.68,.88));vec3 side=normalize(vec3(.8,.25,.62));float light=.59+.36*max(0.,dot(n,key))+.17*max(0.,dot(n,side))+.07*max(0.,n.z);float fres=pow(1.-max(0.,dot(n,eyeV)),3.);float spec=pow(max(0.,dot(n,normalize(key+eyeV))),23.);vec3 color=albedo*light+vec3(.11,.125,.115)*spec+vec3(.060,.076,.065)*fres; color=mix(color,vec3(.69,.94,.73),selected*.18);gl_FragColor=vec4(color,1.);}`;
function newGL(canvas,parts,decals){
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:true,depth:true,powerPreference:'low-power'});if(!gl)return null;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
  const uniforms={};for(const k of ['rightV','upV','eyeV','center','offset','scale','centerY','albedo','useTex','selected','graph'])uniforms[k]=gl.getUniformLocation(prog,k);
  const pa=gl.getAttribLocation(prog,'p'),na=gl.getAttribLocation(prog,'n'),ua=gl.getAttribLocation(prog,'uv');
  function buffer(data,elem=false){const b=gl.createBuffer(),type=elem?gl.ELEMENT_ARRAY_BUFFER:gl.ARRAY_BUFFER;gl.bindBuffer(type,b);gl.bufferData(type,data,gl.STATIC_DRAW);return b}
  for(const p of [...parts,...decals]){p.positionBuffer=buffer(p.pos);p.indexBuffer=buffer(p.index,true);if(p.normals)p.normalBuffer=buffer(p.normals);if(p.uv){p.uvBuffer=buffer(p.uv);p.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,p.texture);for(const t of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,t,gl.LINEAR);for(const t of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,t,gl.CLAMP_TO_EDGE);p.dirty=true}}
  const attr=(at,b,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,0,0)};
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
  return (c,x,sel)=>{
    gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(prog);
    gl.uniform3fv(uniforms.rightV,c.right);gl.uniform3fv(uniforms.upV,c.up);gl.uniform3fv(uniforms.eyeV,c.eye);gl.uniform3fv(uniforms.center,c.center);gl.uniform2f(uniforms.scale,2*c.scale/c.w,2*c.scale/c.h);gl.uniform1f(uniforms.centerY,1-2*c.cy/c.h);gl.uniform1i(uniforms.graph,0);
    for(const p of [...parts,...decals]){
      attr(pa,p.positionBuffer,3);gl.uniform3fv(uniforms.offset,shifted(p,x));gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,p.indexBuffer);
      if(p.texture){gl.disableVertexAttribArray(na);gl.vertexAttrib3f(na,0,0,1);attr(ua,p.uvBuffer,2);gl.uniform1f(uniforms.useTex,1);gl.bindTexture(gl.TEXTURE_2D,p.texture);if(p.dirty){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,p.tex);p.dirty=false}}
      else{attr(na,p.normalBuffer,3);gl.disableVertexAttribArray(ua);gl.vertexAttrib2f(ua,0,0);gl.uniform1f(uniforms.useTex,0);gl.uniform3fv(uniforms.albedo,p.color);gl.uniform1f(uniforms.selected,sel===p.id?1:0)}
      gl.drawElements(gl.TRIANGLES,p.index.length,gl.UNSIGNED_SHORT,0);
    }
  };
}
function project(c,p,o=[0,0,0]){const q=[p[0]+o[0]-c.center[0],p[1]+o[1]-c.center[1],p[2]+o[2]-c.center[2]];return [c.w/2+dot(q,c.right)*c.scale,c.cy-dot(q,c.up)*c.scale,dot(q,c.eye)]}
function vertices2d(p,c,x){
  const out=new Float32Array(p.pos.length),o=shifted(p,x),off=[o[0]-c.center[0],o[1]-c.center[1],o[2]-c.center[2]];
  for(let i=0;i<p.pos.length;i+=3){const xx=p.pos[i]+off[0],yy=p.pos[i+1]+off[1],zz=p.pos[i+2]+off[2];
    out[i]=c.w/2+(xx*c.right[0]+yy*c.right[1])*c.scale;out[i+1]=c.cy-(xx*c.up[0]+yy*c.up[1]+zz*c.up[2])*c.scale;out[i+2]=xx*c.eye[0]+yy*c.eye[1]+zz*c.eye[2];}
  return out;
}
// A depth buffer also keeps the model interactive on devices with WebGL disabled.
function softwareRenderer(canvas,parts,decals){
  const ctx=canvas.getContext('2d'),work=document.createElement('canvas'),wc=work.getContext('2d');let img,depth;
  return (c,x,sel)=>{
    const ratio=Math.min(c.dpr,1.2,880/c.w);const w=Math.max(1,Math.round(c.w*ratio)),h=Math.max(1,Math.round(c.h*ratio));
    if(work.width!==w||work.height!==h||!img){work.width=w;work.height=h;img=wc.createImageData(w,h);depth=new Float32Array(w*h)}
    img.data.fill(0);depth.fill(-1e6);const data=img.data;
    for(const p of parts){
      const a=vertices2d(p,c,x),color=p.color,idx=p.index,n=p.normals;
      for(let k=0;k<idx.length;k+=3){
        const i=3*idx[k],j=3*idx[k+1],l=3*idx[k+2],X=a[i]*ratio,Y=a[i+1]*ratio,bx=a[j]*ratio,by=a[j+1]*ratio,cx=a[l]*ratio,cy=a[l+1]*ratio;
        const area=(bx-X)*(cy-Y)-(by-Y)*(cx-X);if(area>=-.015)continue;
        const minX=Math.max(0,Math.floor(Math.min(X,bx,cx))),maxX=Math.min(w-1,Math.ceil(Math.max(X,bx,cx))),minY=Math.max(0,Math.floor(Math.min(Y,by,cy))),maxY=Math.min(h-1,Math.ceil(Math.max(Y,by,cy)));
        const normal=unit([n[i]+n[j]+n[l],n[i+1]+n[j+1]+n[l+1],n[i+2]+n[j+2]+n[l+2]]);
        const light=.59+.36*Math.max(0,dot(normal,[-.43,-.55,.71]))+.17*Math.max(0,dot(normal,[.77,.24,.59]))+.07*Math.max(0,normal[2]);
        const rgba=color.map((v,t)=>clamp(Math.round(255*((sel === p.id ? .88 : 1)*v*light+(sel===p.id?[.08,.11,.085][t]:0))),0,255));
        for(let py=minY;py<=maxY;py++)for(let px=minX;px<=maxX;px++){
          const dx=px+.5-X,dy=py+.5-Y,wa=(dx*(cy-Y)-dy*(cx-X))/area,wb=((bx-X)*dy-(by-Y)*dx)/area;if(wa<0||wb<0||wa+wb>1)continue;
          const z=a[i+2]+wa*(a[j+2]-a[i+2])+wb*(a[l+2]-a[i+2]),at=py*w+px;if(z<=depth[at])continue;depth[at]=z;const bit=at*4;data[bit]=rgba[0];data[bit+1]=rgba[1];data[bit+2]=rgba[2];data[bit+3]=255;
        }
      }
    }
    // Rasterize labels into the same depth buffer so parts conceal them in every view.
    if(dot([0,-sin20,cos20],c.eye)>.01)for(const de of decals){
      const pp=de.points.map(p=>project(c,p,shifted(de,x)).map((v,j)=>j===2?v:v*ratio));const [o,t,,b]=pp;
      const ax=t[0]-o[0],ay=t[1]-o[1],bx=b[0]-o[0],by=b[1]-o[1],det=ax*by-ay*bx;if(Math.abs(det)<1)continue;
      if(!de.cache||de.dirty){de.cache=de.tex.getContext('2d').getImageData(0,0,de.tex.width,de.tex.height).data;de.dirty=false}
      const sx=de.tex.width,sy=de.tex.height;
      for(let py=Math.max(0,Math.floor(Math.min(...pp.map(p=>p[1]))));py<=Math.min(h-1,Math.ceil(Math.max(...pp.map(p=>p[1]))));py++)for(let px=Math.max(0,Math.floor(Math.min(...pp.map(p=>p[0]))));px<=Math.min(w-1,Math.ceil(Math.max(...pp.map(p=>p[0]))));px++){
        const xx=px+.5-o[0],yy=py+.5-o[1],u=(xx*by-yy*bx)/det,v=(ax*yy-ay*xx)/det;if(u<0||v<0||u>=1||v>=1)continue;const at=py*w+px,z=o[2]+u*(t[2]-o[2])+v*(b[2]-o[2]);if(z<depth[at]-.12)continue;
        const bit=at*4,tex=(Math.floor(v*sy)*sx+Math.floor(u*sx))*4,alpha=de.cache[tex+3]/255;if(alpha<.12)continue;for(let k=0;k<3;k++)data[bit+k]=alpha*de.cache[tex+k]+(1-alpha)*data[bit+k];data[bit+3]=255;
      }
    }
    wc.putImageData(img,0,0);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(work,0,0,canvas.width,canvas.height);
  };
}
function drawUnderlay(context,c,expl){
  const g=context;g.setTransform(c.dpr,0,0,c.dpr,0,0);g.clearRect(0,0,c.w,c.h);
  const h=-4-expl*44;const proj=(x,y,z=h)=>project(c,[x,y,z]);
  // Light drafting grid stays on the ground plane during orbit.
  g.save();g.lineWidth=.65;for(let k=-200;k<=200;k+=20){const alpha=.13*(1-Math.min(1,Math.abs(k)/230));g.strokeStyle='rgba(168,203,172,'+alpha+')';for(const pair of [[proj(k,-145),proj(k,145)],[proj(-200,k),proj(200,k)]]){g.beginPath();g.moveTo(pair[0][0],pair[0][1]);g.lineTo(pair[1][0],pair[1][1]);g.stroke()}}g.restore();
  const o=proj(3,2),X=proj(4,2),Y=proj(3,3);g.save();g.translate(o[0],o[1]);g.transform(X[0]-o[0],X[1]-o[1],Y[0]-o[0],Y[1]-o[1],0,0);g.scale(112,84);
  const shadow=g.createRadialGradient(0,0,.12,0,0,1.12);shadow.addColorStop(0,'rgba(2,11,6,.60)');shadow.addColorStop(.56,'rgba(2,11,6,.51)');shadow.addColorStop(.86,'rgba(2,11,6,.21)');shadow.addColorStop(1,'rgba(2,11,6,0)');g.fillStyle=shadow;g.fillRect(-1.16,-1.16,2.32,2.32);g.restore();
}
function dimensions(ctx,c,x){
  ctx.setTransform(c.dpr,0,0,c.dpr,0,0);ctx.clearRect(0,0,c.w,c.h);if(!x)return;
  const g=ctx;g.save();g.lineWidth=1;g.font=(c.w<400?'11':'12')+'px "IBM Plex Mono", monospace';g.textAlign='center';g.textBaseline='middle';
  const lines=[{a:[-90,-76,0],b:[90,-76,0],s:'180 мм'},{a:[101,-67,0],b:[101,67,0],s:'134 мм'},{a:[-96,66,0],b:[-96,66,77.8],s:'77,8 мм'}];
  for(const l of lines){
    const a=project(c,l.a),b=project(c,l.b),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<19)continue;const nx=-dy/len*4,ny=dx/len*4;
    g.strokeStyle='#cdf8cc';g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);for(const t of [a,b]){g.moveTo(t[0]-nx,t[1]-ny);g.lineTo(t[0]+nx,t[1]+ny)}g.stroke();
    const w=g.measureText(l.s).width+10,cx=clamp((a[0]+b[0])/2,w/2+3,c.w-w/2-3),cy=clamp((a[1]+b[1])/2,51,c.h-44);g.fillStyle='#1a2d21';g.fillRect(cx-w/2,cy-8,w,16);g.fillStyle='#d2f7d3';g.fillText(l.s,cx,cy+1);
  }g.restore();
}
export function mountViewer(){
  const vp=d('viewport'),stage=d('stage'),baseCanvas=d('scene'),ol=d('overlay'),under=makeTechCanvas();let scene=baseCanvas;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let yaw=defaultCamera.yaw,pitch=defaultCamera.pitch,zoom=1,spread=0,goal=0,measure=false,auto=false,selected=null,parts=[],decals=[],drawScene=null,latest=null,lastCamera=null,visible=true,drag=null,pinch=null,renderLoop=0,lastT=0,screenVersion='';
  const points=new Map(),scrTex=texture(640,370),plateTex=texture(750,72),legendTex=texture(660,900);
  latest={state:'idle',count:2,enabled:[true,true,true,true],elapsed:'00:00'};
  const ctxUnder=under.getContext('2d'),ctxOver=ol.getContext('2d');
  function camera(){
    const w=vp.clientWidth,h=vp.clientHeight;if(!w||!h)return null;const dpr=Math.min(window.devicePixelRatio||1,2);
    for(const el of [scene,under,ol]){const nx=Math.round(w*dpr),ny=Math.round(h*dpr);if(el.width!==nx||el.height!==ny){el.width=nx;el.height=ny}}
    const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),extra=measure?1.1:1;
    return {w,h,dpr,right:[cy,sy,0],up:[-sy*sp,cy*sp,cp],eye:[sy*cp,-cy*cp,sp],center:[0,-1,36+3*spread],scale:Math.min(w/(277+18*spread),h/(206+102*spread))*zoom/extra,cy:h*.524};
  }
  function draw(t){
    renderLoop=0;const delta=lastT?Math.min(.06,(t-lastT)/1000):.016;lastT=t;
    if(auto&&visible&&!points.size)yaw+=delta*.25;
    if(reduced)spread=goal;else if(Math.abs(spread-goal)>.001)spread+=(goal-spread)*(1-Math.exp(-delta*10));else spread=goal;
    const c=camera();if(!c)return;lastCamera=c;
    drawUnderlay(ctxUnder,c,spread);drawScene?.(c,spread,selected);dimensions(ctxOver,c,measure);
    if(visible&&((auto&&!points.size)||Math.abs(spread-goal)>.001))queue();
  }
  function queue(){if(!renderLoop)renderLoop=requestAnimationFrame(draw)}
  function select(id){
    selected=id;const p=parts.find(v=>v.id===id);d('part-readout').hidden=!p;
    if(p){const [title,desc]=groupNames[p.group];d('part-title').textContent=title+(p.group==='markers'?' '+p.id.slice(-1):'');d('part-desc').textContent=desc}
    queue();
  }
  function pick(px,py){if(!lastCamera)return;let best=-Infinity,found=null;
    for(const p of parts){const a=vertices2d(p,lastCamera,spread),ix=p.index;for(let i=0;i<ix.length;i+=3){
      const k=3*ix[i],j=3*ix[i+1],l=3*ix[i+2],dx=a[j]-a[k],dy=a[j+1]-a[k+1],ex=a[l]-a[k],ey=a[l+1]-a[k+1],det=dx*ey-dy*ex;if(Math.abs(det)<1e-6)continue;const u=((px-a[k])*ey-(py-a[k+1])*ex)/det,v=(dx*(py-a[k+1])-dy*(px-a[k]))/det;if(u<0||v<0||u+v>1)continue;const z=a[k+2]+u*(a[j+2]-a[k+2])+v*(a[l+2]-a[k+2]);if(z>best){best=z;found=p.id}
    }}select(found);
  }
  function spreading(v){goal=v;d('assembled').setAttribute('aria-pressed',v===0);d('exploded').setAttribute('aria-pressed',v===1);stage.dataset.view=v?'exploded':'assembly';if(v&&measure){measure=false;d('dims').setAttribute('aria-pressed',false)}select(null);queue()}
  function spinning(v){auto=v;d('auto').setAttribute('aria-pressed',v);queue()}
  function reset(){yaw=defaultCamera.yaw;pitch=defaultCamera.pitch;zoom=1;spinning(false);measure=false;d('dims').setAttribute('aria-pressed',false);spreading(0)}
  d('assembled').onclick=()=>spreading(0);d('exploded').onclick=()=>spreading(1);d('auto').onclick=()=>spinning(!auto);d('reset-view').onclick=reset;d('clear-part').onclick=()=>select(null);
  d('dims').onclick=()=>{measure=!measure;if(measure&&goal)spreading(0);d('dims').setAttribute('aria-pressed',measure);queue()};
  const fullBtn=d('full');function syncFull(){const f=Boolean(document.fullscreenElement)||stage.classList.contains('fullscreen-fallback');fullBtn.setAttribute('aria-label',f?'Свернуть модель':'Развернуть модель');fullBtn.dataset.tip=f?'Свернуть':'Полный экран';queue()}
  fullBtn.onclick=async()=>{if(stage.classList.contains('fullscreen-fallback')){stage.classList.remove('fullscreen-fallback');syncFull();return}try{if(document.fullscreenElement)await document.exitFullscreen();else if(stage.requestFullscreen)await stage.requestFullscreen();else stage.classList.add('fullscreen-fallback')}catch{stage.classList.toggle('fullscreen-fallback')}syncFull()};document.addEventListener('fullscreenchange',syncFull);
  const pos=e=>[e.clientX,e.clientY];vp.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;vp.focus({preventScroll:true});points.set(e.pointerId,pos(e));vp.setPointerCapture(e.pointerId);spinning(false);if(points.size===1){drag={start:pos(e),last:pos(e),moved:false};vp.classList.add('dragging')}else if(points.size===2){const [a,b]=points.values();pinch={dist:Math.hypot(a[0]-b[0],a[1]-b[1]),zoom};if(drag)drag.moved=true}});
  vp.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;const next=pos(e);points.set(e.pointerId,next);if(points.size===2&&pinch){const [a,b]=points.values();zoom=clamp(pinch.zoom*Math.hypot(a[0]-b[0],a[1]-b[1])/Math.max(pinch.dist,1),.64,1.9)}else if(drag){const dx=next[0]-drag.last[0],dy=next[1]-drag.last[1];yaw-=dx*.009;pitch=clamp(pitch+dy*.008,-1.12,1.45);if(Math.hypot(next[0]-drag.start[0],next[1]-drag.start[1])>4)drag.moved=true;drag.last=next}queue()});
  function release(e){if(!points.has(e.pointerId))return;points.delete(e.pointerId);if(!points.size){if(drag&&!drag.moved&&e.type==='pointerup'){const rect=vp.getBoundingClientRect();pick(e.clientX-rect.left,e.clientY-rect.top)}drag=null;pinch=null;vp.classList.remove('dragging')}else{const left=[...points.values()][0];drag={start:left,last:left,moved:true};pinch=null}}
  vp.addEventListener('pointerup',release);vp.addEventListener('pointercancel',release);vp.addEventListener('lostpointercapture',release);
  vp.addEventListener('wheel',e=>{if(!vp.matches(':focus')&&!e.ctrlKey)return;e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.0016),.64,1.9);queue()},{passive:false});
  vp.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','Enter','Escape'].includes(e.key))return;e.preventDefault();spinning(false);
    if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')pitch=clamp(pitch+.1,-1.12,1.45);if(e.key==='ArrowDown')pitch=clamp(pitch-.1,-1.12,1.45);
    if(e.key==='+'||e.key==='=')zoom=clamp(zoom+.1,.64,1.9);if(e.key==='-')zoom=clamp(zoom-.1,.64,1.9);
    if(e.key==='Home')reset();if(e.key==='Enter'&&parts.length)select(parts[(parts.findIndex(p=>p.id===selected)+1)%parts.length].id);if(e.key==='Escape'){select(null);stage.classList.remove('fullscreen-fallback');syncFull()}queue()});
  function update(s){latest=s;const v=[s.state,s.count,s.enabled.join(''),s.elapsed].join('/');if(v!==screenVersion){screenVersion=v;paintScreen(scrTex,s);if(decals[0])decals[0].dirty=true;if(visible)queue()}}
  new ResizeObserver(queue).observe(vp);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)queue()}).observe(stage);
  function soft(){const repl=document.createElement('canvas');repl.id='scene';repl.setAttribute('aria-hidden','true');scene.replaceWith(repl);scene=repl;drawScene=softwareRenderer(scene,parts,decals);stage.dataset.engine='canvas';queue()}
  (async()=>{try{
    const res=await fetch('./model/assembly.json');if(!res.ok)throw Error('mesh');const data=await res.json();parts=data.parts.map(prepare);
    paintScreen(scrTex,latest);paintPlate(plateTex);paintLegends(legendTex);decals=[makeDecal('screen',-24,6,90,50,1.47,scrTex),makeDecal('panel',0,42,137,9.5,1.29,plateTex),makeDecal('panel',51,2,44,60,1.30,legendTex)];
    let renderer=null;try{renderer=newGL(scene,parts,decals)}catch{/* Built-in software path uses the same CAD mesh. */}
    if(renderer){drawScene=renderer;stage.dataset.engine='webgl';scene.addEventListener('webglcontextlost',e=>{e.preventDefault();soft()},{once:true})}else soft();
    d('load-state').hidden=true;stage.dataset.ready='true';queue();
  }catch{const p=d('viewer-poster');p.hidden=false;d('load-state').textContent='Модель недоступна. Можно открыть файлы в разделе сборки.';d('load-state').style.top='80%';stage.querySelectorAll('button:not(#full)').forEach(b=>b.disabled=true)}})();
  return {update,show(id){spinning(false);spreading(1);select(id)}};
}
