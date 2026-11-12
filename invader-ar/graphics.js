import {MASK} from './tracker.js';
import {createHologram} from './hologram.js';

export const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export function mul(a,b){
  const out=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
export const compose=(...matrices)=>matrices.reduce(mul);
export function translate(x,y,z){const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;}
export function scale(x,y=x,z=x){const m=identity();m[0]=x;m[5]=y;m[10]=z;return m;}
export function rx(a){const m=identity();m[5]=m[10]=Math.cos(a);m[6]=Math.sin(a);m[9]=-m[6];return m;}
export function ry(a){const m=identity();m[0]=m[10]=Math.cos(a);m[8]=Math.sin(a);m[2]=-m[8];return m;}
export function rz(a){const m=identity();m[0]=m[5]=Math.cos(a);m[1]=Math.sin(a);m[4]=-m[1];return m;}
export function perspective(w,h,focal,near=.025,far=100){
  const m=new Float32Array(16);m[0]=2*focal/w;m[5]=2*focal/h;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);return m;
}
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function fit(canvas,cap=2){
  const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,cap);
  const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  return {w,h};
}

// The canvas renderer also supports devices that disable hardware WebGL.
function softwareRenderer(canvas){
  const ctx=canvas.getContext('2d'),palette={violet:[267,74],cyan:[177,70],amber:[33,90]};
  const cubes=[];
  MASK.forEach((line,r)=>[...line].forEach((v,c)=>{
    if(v==='1'||(r===3&&(c===3||c===7)))cubes.push({x:(c-5)/11,y:(3.5-r)/11,s:((c*67+r*43)%97)/97,eye:v==='0'});
  }));
  const corners=[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
  const faces=[[[0,1,2,3],56],[[1,5,6,2],30],[[3,2,6,7],71],[[4,0,3,7],39],[[4,5,1,0],25],[[5,4,7,6],35]];
  return {begin(){ctx.clearRect(0,0,canvas.width,canvas.height)},draw(m,t,opt={}){
    const polygons=[],[h,sat]=palette[opt.color]||palette.violet;
    for(const cube of cubes){
      const ready=clamp(((opt.reveal??1)-cube.s*.34)/.58,0,1),q=1-ready;
      if(!ready)continue;
      const x=cube.x*(1+.55*q)+Math.sin(cube.s*30)*q*.2,y=cube.y*(1+.55*q)+Math.cos(cube.s*30)*q*.2;
      const points=corners.map(([i,j,k])=>{
        const px=x+i*.045*ready,py=y+j*.045*ready,pz=(cube.eye?-.016:k*.076)*ready+q*.2;
        const w=m[3]*px+m[7]*py+m[11]*pz+m[15];
        return [(1+(m[0]*px+m[4]*py+m[8]*pz+m[12])/w)*canvas.width/2,(1-(m[1]*px+m[5]*py+m[9]*pz+m[13])/w)*canvas.height/2,(m[2]*px+m[6]*py+m[10]*pz+m[14])/w];
      });
      for(const [indices,light] of faces){
        const p=indices.map(i=>points[i]);
        if((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1])>=0)continue;
        const l=light+cube.s*9+5*Math.sin(x*7+y*5-t*.2);
        polygons.push({p,z:p.reduce((v,a)=>v+a[2],0),l,eye:cube.eye,h,sat});
      }
    }
    polygons.sort((a,b)=>b.z-a.z);
    for(const {p,l,eye,h,sat} of polygons){
      ctx.beginPath();p.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
      const g=ctx.createLinearGradient(p[0][0],p[0][1],p[2][0]+.01,p[2][1]+.01);
      g.addColorStop(0,eye?'#c9fff1':`hsl(${h},${sat}%,${Math.min(92,l+14)}%)`);
      g.addColorStop(.42,eye?'#7ef6f2':`hsl(${h},${sat}%,${l}%)`);
      g.addColorStop(1,eye?'#1f626c':`hsl(${h-8},${sat}%,${Math.max(12,l-12)}%)`);
      ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=eye?'#273d50':`hsla(${h},88%,82%,.64)`;ctx.lineWidth=.7;ctx.stroke();
    }
  }};
}
export function renderer(canvas){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,preserveDrawingBuffer:false});
  if(!gl)return softwareRenderer(canvas);
  const hologram=createHologram(gl,MASK);
  return {begin(){gl.viewport(0,0,canvas.width,canvas.height);gl.depthMask(true);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);},draw:hologram.draw};
}

const rgb={violet:'175,125,253',cyan:'103,230,218',amber:'255,182,106'};
export function projector(canvas,t,color){
  const ctx=canvas.getContext('2d'),{w,h}=fit(canvas,1.6),cx=w*.5,base=h*.775;
  ctx.clearRect(0,0,w,h);
  const alpha=a=>'rgba('+rgb[color]+','+a+')';
  // A calibrated orbital grid and a light cone give the object a visible projection plane.
  const mist=ctx.createRadialGradient(cx,h*.49,1,cx,h*.51,w*.51);
  mist.addColorStop(0,alpha(.12));mist.addColorStop(.64,alpha(.035));mist.addColorStop(1,alpha(0));
  ctx.fillStyle=mist;ctx.fillRect(0,0,w,h);
  for(let i=0;i<84;i++){
    const x=((i*271+11)%997)/997*w,y=((i*i*41+i*29+29)%991)/991*h;
    ctx.fillStyle=alpha(.12+(1+Math.sin(t*.6+i*5))*.11);const d=i%9===0?1.5:1;ctx.fillRect(x,y,d,d);
  }
  const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  ctx.lineWidth=Math.max(.65,w/1200);
  ctx.strokeStyle=alpha(.065);
  const step=w/15;
  for(let i=1;i<15;i++)line(i*step,h*.15,i*step,h*.86);
  for(let y=h*.18;y<h*.88;y+=step)line(w*.08,y,w*.92,y);
  ctx.strokeStyle=alpha(.35);
  for(const [x,y] of [[.13,.27],[.84,.22],[.17,.72],[.88,.68],[.75,.39],[.28,.18]]){const r=w*.006;line(w*x-r,h*y,w*x+r,h*y);line(w*x,h*y-r,w*x,h*y+r);}
  const cone=ctx.createLinearGradient(0,h*.38,0,base);
  cone.addColorStop(0,alpha(.0));cone.addColorStop(.72,alpha(.045));cone.addColorStop(1,alpha(.18));ctx.fillStyle=cone;
  ctx.beginPath();ctx.moveTo(cx-w*.235,h*.42);ctx.lineTo(cx+w*.235,h*.42);ctx.lineTo(cx+w*.115,base);ctx.lineTo(cx-w*.115,base);ctx.closePath();ctx.fill();
  const glow=ctx.createRadialGradient(0,0,0,0,0,1);glow.addColorStop(0,alpha(.36));glow.addColorStop(.48,alpha(.13));glow.addColorStop(1,alpha(0));
  ctx.save();ctx.translate(cx,base);ctx.scale(w*.35,h*.10);ctx.fillStyle=glow;ctx.fillRect(-1,-1,2,2);ctx.restore();
  for(const [r,a,l] of [[.318,.23,1],[.302,.14,1],[.254,.53,1],[.234,.24,1],[.174,.78,1.5],[.151,.38,1],[.112,.75,1]]){
    ctx.strokeStyle=alpha(a);ctx.lineWidth=l*Math.max(1,w/800);ctx.beginPath();ctx.ellipse(cx,base,w*r,h*r*.32,0,0,Math.PI*2);ctx.stroke();
  }
  for(let i=0;i<72;i++){
    const a=i*Math.PI/36,x=Math.cos(a),y=Math.sin(a),long=i%6===0;
    ctx.strokeStyle=alpha(long?.60:.25);line(cx+x*w*.318,base+y*h*.1018,cx+x*w*(long?.333:.323),base+y*h*(long?.107:.104));
  }
  for(const o of [0,2.75,4.4]){
    let a=t*.16+o;ctx.strokeStyle=alpha(.85);ctx.lineWidth=Math.max(1,w/500);ctx.beginPath();ctx.ellipse(cx,base,w*.253,h*.081,0,a,a+.44);ctx.stroke();
  }
  for(let i=0;i<22;i++){
    const speed=.048+(i%4)*.009,p=(t*speed+i*.637)%1,y=base-h*.47*p;
    const x=cx+Math.sin(i*64.17)*w*(.20-.055*p)+Math.sin(t*.5+i)*w*.006;
    ctx.fillStyle=alpha(Math.sin(Math.PI*p)*.62);const d=(i%6===0?2.3:1.4)*w/650;ctx.fillRect(x,y,d,d);
  }
}
