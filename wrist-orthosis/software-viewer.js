/* Canvas renderer for the SAME CAD geometry when WebGL is unavailable. */
const groups = {
  shells: ['upper', 'lower'], cassette: ['plate', 'motorwall', 'supportwall'],
  servo: ['servo_body', 'servo_flange', 'pinion', 'motorwall'],
  gears: ['driven', 'pinion'], spool: ['shaft', 'spool', 'bush_', 'spacer_', 'collar_'],
  guide: ['upper', 'cable_'],
};
function color(n) {
  if (n === 'upper') return [227,234,245];
  if (n === 'lower') return [185,204,232];
  if (['plate','motorwall','supportwall'].includes(n)) return [8,37,103];
  if (['driven','pinion'].includes(n)) return [62,115,200];
  if (n === 'spool') return [153,183,226];
  if (n.startsWith('servo')) return [35,45,65];
  if (n.startsWith('cable')) return [18,67,150];
  return [161,177,202];
}
export async function createSoftwareViewer(host) {
  const response = await fetch(new URL('./files/assembly-view.json', import.meta.url));
  if (!response.ok) throw Error('CAD geometry unavailable');
  const data = await response.json();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label','Вращаемая CAD-сборка ортеза');
  host.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const meshes = Object.entries(data).map(([name,m]) => {
    const verts = new Float32Array(m.vertices.flat());
    const faces = new Uint32Array(m.faces.flat());
    const normals = new Float32Array(faces.length);
    const rgb = color(name);
    const shades = [];
    for(let f=0;f<faces.length;f+=3){
      const a=faces[f]*3,b=faces[f+1]*3,c=faces[f+2]*3;
      const u=[verts[b]-verts[a],verts[b+1]-verts[a+1],verts[b+2]-verts[a+2]];
      const v=[verts[c]-verts[a],verts[c+1]-verts[a+1],verts[c+2]-verts[a+2]];
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const len=Math.hypot(...n)||1; for(let i=0;i<3;i++)normals[f+i]=n[i]/len;
      const lambert=Math.max(0,n[0]/len*.2-n[1]/len*.45+n[2]/len*.87);
      const fill=.63+.4*lambert;
      shades.push(rgb.map(v=>Math.min(255,Math.round(v*fill))));
    }
    return {name,verts,faces,normals,shades};
  });
  let azimuth=-.95,elevation=.58,zoom=1,group=null,hiddenShell=false,amount=0,running=true,scheduled=false;
  let width=500,height=420;
  function offset(n){
    if(n==='lower')return [0,0,-45*amount];
    if(n==='upper')return [0,0,0];
    if(n==='plate')return [0,0,15*amount];
    if(n==='motorwall'||n.startsWith('servo'))return [-43*amount,0,28*amount];
    if(n==='supportwall')return [43*amount,0,28*amount];
    return [0,0,50*amount];
  }
  function visible(n){return (!group||groups[group].some(p=>n===p||n.startsWith(p)))&&!(hiddenShell&&['upper','lower'].includes(n));}
  function render(){
    scheduled=false;if(!running)return;
    const dpr=Math.min(devicePixelRatio,2);
    width=host.clientWidth||host.parentElement.clientWidth||500;
    height=host.clientHeight||host.parentElement.clientHeight||420;
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const ca=Math.cos(azimuth),sa=Math.sin(azimuth),ce=Math.cos(elevation),se=Math.sin(elevation);
    const right=[-sa,ca,0],up=[-ca*se,-sa*se,ce],toward=[ca*ce,sa*ce,se];
    const batch=[];let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    for(const mesh of meshes){
      if(!visible(mesh.name))continue;
      const {verts,faces,normals,shades}=mesh;
      const o=offset(mesh.name),xy=new Float32Array(verts.length),depth=new Float32Array(verts.length/3);
      for(let i=0;i<verts.length;i+=3){
        const x=verts[i]+o[0],y=verts[i+1]+o[1],z=verts[i+2]+o[2];
        const px=x*right[0]+y*right[1],py=x*up[0]+y*up[1]+z*up[2];
        xy[i]=px;xy[i+1]=py;depth[i/3]=x*toward[0]+y*toward[1]+z*toward[2];
        minx=Math.min(minx,px);maxx=Math.max(maxx,px);miny=Math.min(miny,py);maxy=Math.max(maxy,py);
      }
      for(let f=0;f<faces.length;f+=3){
        if(normals[f]*toward[0]+normals[f+1]*toward[1]+normals[f+2]*toward[2]<=0)continue;
        const a=faces[f],b=faces[f+1],c=faces[f+2];
        batch.push([depth[a]+depth[b]+depth[c],xy[a*3],xy[a*3+1],xy[b*3],xy[b*3+1],xy[c*3],xy[c*3+1],shades[f/3],depth[a],depth[b],depth[c]]);
      }
    }
    if(!Number.isFinite(minx))return;
    const scale=Math.min(width*.85/(maxx-minx||1),height*.83/(maxy-miny||1))*zoom;
    const cx=(minx+maxx)/2,cy=(miny+maxy)/2;
    // Per-pixel depth prevents the long CAD triangles from drawing through
    // one another, and avoids the seams of antialiased Canvas triangle fills.
    const pw=canvas.width,ph=canvas.height;
    const pixels=ctx.createImageData(pw,ph),rgba=pixels.data;
    const zbuffer=new Float32Array(pw*ph);zbuffer.fill(-Infinity);
    for(const t of batch){
      const x0=pw/2+(t[1]-cx)*scale*dpr,y0=ph/2-(t[2]-cy)*scale*dpr;
      const x1=pw/2+(t[3]-cx)*scale*dpr,y1=ph/2-(t[4]-cy)*scale*dpr;
      const x2=pw/2+(t[5]-cx)*scale*dpr,y2=ph/2-(t[6]-cy)*scale*dpr;
      const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
      if(Math.abs(den)<1e-7)continue;
      const inv=1/den;
      const left=Math.max(0,Math.floor(Math.min(x0,x1,x2))),right=Math.min(pw-1,Math.ceil(Math.max(x0,x1,x2)));
      const top=Math.max(0,Math.floor(Math.min(y0,y1,y2))),bottom=Math.min(ph-1,Math.ceil(Math.max(y0,y1,y2)));
      const da=(y1-y2)*inv,db=(y2-y0)*inv;
      for(let y=top;y<=bottom;y++){
        let a=((y1-y2)*(left+.5-x2)+(x2-x1)*(y+.5-y2))*inv;
        let b=((y2-y0)*(left+.5-x2)+(x0-x2)*(y+.5-y2))*inv;
        for(let x=left;x<=right;x++,a+=da,b+=db){
          const c=1-a-b;if(a<-.00001||b<-.00001||c<-.00001)continue;
          const z=a*t[8]+b*t[9]+c*t[10],index=y*pw+x;
          if(z<=zbuffer[index])continue;
          zbuffer[index]=z;const p=index*4;
          rgba[p]=t[7][0];rgba[p+1]=t[7][1];rgba[p+2]=t[7][2];rgba[p+3]=255;
        }
      }
    }
    ctx.putImageData(pixels,0,0);
  }
  function request(){if(!scheduled){scheduled=true;requestAnimationFrame(render);}}
  const pointers=new Map();let previous=null,pinchDistance=null;
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);previous=[e.clientX,e.clientY];});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinchDistance)zoom=Math.max(.6,Math.min(3,zoom*d/pinchDistance));pinchDistance=d;}
    else if(previous){azimuth-=(e.clientX-previous[0])*.009;elevation=Math.max(-1.25,Math.min(1.55,elevation+(e.clientY-previous[1])*.009));}
    previous=[e.clientX,e.clientY];request();
  });
  function release(e){pointers.delete(e.pointerId);previous=null;pinchDistance=null;}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.6,Math.min(3,zoom*Math.exp(-e.deltaY*.001)));request();},{passive:false});
  new ResizeObserver(request).observe(host);request();
  return {
    focus(g){group=groups[g]?g:null;amount=0;hiddenShell=false;azimuth=group==='gears'?-2.9:-.95;elevation=.58;zoom=1;request();},
    explode(v){amount=v;request();},hideShell(v){hiddenShell=v;request();},
    top(){elevation=1.55;request();},pause(){running=false;},resume(){running=true;request();},
  };
}
