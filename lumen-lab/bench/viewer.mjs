// Orthographic, Z-up view of the same tessellated CAD shapes used for printing.
const get=id=>document.getElementById(id);
const host=get('viewport'),canvas=get('model'),cover=get('model-cover');
let opened=true,az=-1.06,el=.84,zoom=1,renderer=null,scheduled=false,drag=null;
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
function vectors(){
  const c=Math.cos(az),s=Math.sin(az),v=Math.cos(el),w=Math.sin(el);
  return [[-s,c,0],[-c*w,-s*w,v],[c*v,s*v,w]];
}
function mesh(input){
  const faces=[],data=[],spans=[];
  for(const p of input.parts){
    const start=data.length/9,lid=p.group==='lid'||p.group==='lid-fasteners';
    const rgb=[1,3,5].map(i=>parseInt(p.color.slice(i,i+2),16)/255);
    for(let i=0;i<p.indices.length;i+=3){
      const tri=p.indices.slice(i,i+3).map(j=>p.vertices.slice(3*j,3*j+3));
      const [a,b,c]=tri,ab=b.map((n,j)=>n-a[j]),ac=c.map((n,j)=>n-a[j]);
      const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      const length=Math.hypot(...n);if(length<1e-8)continue;
      const normal=n.map(k=>k/length);
      const light=.7+.35*Math.max(0,-.28*normal[0]-.48*normal[1]+.83*normal[2]);
      const color=rgb.map(k=>Math.round(255*Math.min(1,k*light+.035)));
      faces.push({tri,lid,normal,color});
      for(const v of tri)data.push(...v,...normal,...rgb);
    }
    spans.push({start,count:data.length/9-start,lid});
  }
  return {faces,data:new Float32Array(data),spans};
}
function gpu(m){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:false});if(!gl)return null;
  function shader(type,text){
    const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('shader');return s;
  }
  const prog=gl.createProgram();
  gl.attachShader(prog,shader(gl.VERTEX_SHADER,`attribute vec3 pos; attribute vec3 normal; attribute vec3 rgb;
  uniform vec3 right; uniform vec3 up; uniform vec3 nearDir; uniform vec3 target; uniform vec2 scale;
  varying vec3 color; void main(){vec3 p=pos-target;gl_Position=vec4(dot(p,right)*scale.x,dot(p,up)*scale.y,-dot(p,nearDir)/150.,1.);
  float light=.70+.35*max(0.,dot(normal,vec3(-.28,-.48,.83)));color=rgb*light+.035;}`));
  gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,'precision mediump float; varying vec3 color; void main(){gl_FragColor=vec4(color,1.0);}'));
  gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error('program');
  gl.useProgram(prog);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,m.data,gl.STATIC_DRAW);
  ['pos','normal','rgb'].forEach((name,i)=>{const a=gl.getAttribLocation(prog,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,12*i)});
  const u=Object.fromEntries(['right','up','nearDir','target','scale'].map(k=>[k,gl.getUniformLocation(prog,k)]));
  gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  return (w,h,f,axes,z)=>{
    gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform3fv(u.right,axes[0]);gl.uniform3fv(u.up,axes[1]);gl.uniform3fv(u.nearDir,axes[2]);
    gl.uniform3f(u.target,40,26,z);gl.uniform2f(u.scale,2*f/w,2*f/h);
    for(const p of m.spans)if(!opened||!p.lid)gl.drawArrays(gl.TRIANGLES,p.start,p.count);
  };
}
function cpu(m,target){
  const ctx=target.getContext('2d');if(!ctx)return null;
  let pixels,depth;
  return (w,h,f,v,z)=>{
    if(!pixels||pixels.width!==w||pixels.height!==h){pixels=ctx.createImageData(w,h);depth=new Float32Array(w*h)}
    depth.fill(-Infinity);pixels.data.fill(0);
    const project=p=>{const x=p[0]-40,y=p[1]-26,hz=p[2]-z;
      return [w/2+f*(x*v[0][0]+y*v[0][1]),h/2-f*(x*v[1][0]+y*v[1][1]+hz*v[1][2]),x*v[2][0]+y*v[2][1]+hz*v[2][2]];
    };
    for(const face of m.faces){
      if(opened&&face.lid)continue;
      const [a,b,c]=face.tri.map(project),dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=c[0]-a[0],dy2=c[1]-a[1];
      const area=dx1*dy2-dx2*dy1;if(Math.abs(area)<.006)continue;
      const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])-.5)),maxX=Math.min(w-1,Math.floor(Math.max(a[0],b[0],c[0])-.5));
      const minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])-.5)),maxY=Math.min(h-1,Math.floor(Math.max(a[1],b[1],c[1])-.5));
      const sx1=dy2/area,sx2=-dy1/area,sy1=-dx2/area,sy2=dx1/area,z1=b[2]-a[2],z2=c[2]-a[2],color=face.color;
      for(let y=minY;y<=maxY;y++){
        let u=(minX+.5-a[0])*sx1+(y+.5-a[1])*sy1, v2=(minX+.5-a[0])*sx2+(y+.5-a[1])*sy2;
        for(let x=minX;x<=maxX;x++,u+=sx1,v2+=sx2){
          if(u<0||v2<0||u+v2>1)continue;
          const i=y*w+x,d=a[2]+u*z1+v2*z2;
          if(d>depth[i]){
            depth[i]=d;
            const j=4*i;pixels.data[j]=color[0];pixels.data[j+1]=color[1];pixels.data[j+2]=color[2];pixels.data[j+3]=255;
          }
        }
      }
    }
    ctx.putImageData(pixels,0,0);
  };
}
let surface=canvas;
function update(){
  if(!renderer||scheduled)return;scheduled=true;requestAnimationFrame(()=>{
    scheduled=false;const d=Math.min(devicePixelRatio||1,2),w=Math.round(host.clientWidth*d),h=Math.round(host.clientHeight*d);
    if(w<2||h<2)return;
    if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h}
    renderer(w,h,Math.min(w/130,h/109)*zoom,vectors(),18);
    cover.hidden=true;
  });
}
function setOpen(value){
  opened=value;cover.src='mechanics/lm04b-'+(opened?'open':'closed')+'.webp';
  cover.alt=opened?'Открытый корпус с платой регистратора':'Закрытый корпус регистратора';
  get('open-lid').setAttribute('aria-pressed',String(opened));get('close-lid').setAttribute('aria-pressed',String(!opened));update();
}
function magnify(k){zoom=clip(zoom*k,.58,2.3);update()}
function reset(){az=-1.06;el=.84;zoom=1;update()}
get('open-lid').onclick=()=>setOpen(true);get('close-lid').onclick=()=>setOpen(false);
get('zoom-out').onclick=()=>magnify(.87);get('zoom-in').onclick=()=>magnify(1.15);get('reset-model').onclick=reset;
host.onpointerdown=e=>{if(!renderer||e.button!==0)return;drag=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId)};
host.onpointermove=e=>{if(!drag)return;az-=(e.clientX-drag[0])*.011;el=clip(el+(e.clientY-drag[1])*.009,-1.35,1.48);drag=[e.clientX,e.clientY];update()};
host.onpointerup=host.onpointercancel=host.onlostpointercapture=()=>{drag=null};
host.addEventListener('wheel',e=>{if(!renderer||document.activeElement!==host)return;e.preventDefault();magnify(Math.exp(-e.deltaY*.0015))},{passive:false});
host.onkeydown=e=>{
  switch(e.key){case 'ArrowLeft':az-=.12;break;case 'ArrowRight':az+=.12;break;case 'ArrowUp':el=clip(el+.12,-1.35,1.48);break;case 'ArrowDown':el=clip(el-.12,-1.35,1.48);break;case 'Home':reset();break;case '+':case '=':magnify(1.12);break;case '-':magnify(.89);break;default:return}
  e.preventDefault();update();
};
new ResizeObserver(update).observe(host);
try{
  const res=await fetch('mechanics/view.json');if(!res.ok)throw Error();
  const m=mesh(await res.json());try{renderer=gpu(m)}catch{}
  if(!renderer){surface=document.createElement('canvas');surface.setAttribute('aria-hidden','true');canvas.replaceWith(surface);renderer=cpu(m,surface)}
  if(!renderer)throw Error();get('model-hint').textContent='Вращайте модель · мышь или стрелки';update();
}catch{get('model-hint').textContent='Вид из CAD · доступны две проекции';for(const id of ['zoom-in','zoom-out','reset-model'])get(id).disabled=true}
