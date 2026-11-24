import {cpuReliefModifiers} from './relief.js';
/* Portable software renderer for this panel's embedded glTF geometry.
   It uses a real depth buffer, Gouraud lighting, image textures and the same
   assembly transforms as the WebGL path. No canvas 3D context is required. */

const BYTE = {5123:Uint16Array, 5125:Uint32Array, 5126:Float32Array};
const DIM = {SCALAR:1, VEC2:2, VEC3:3};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toSrgb = f => 255 * (f <= .0031308 ? 12.92*f : 1.055*f**(1/2.4)-.055);

async function decodeTexture(bytes, mimeType) {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([bytes], {type:mimeType}));
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(image,0,0);
    const levels=[];
    let surface=canvas, ctx=context;
    while (true) {
      levels.push({width:surface.width,height:surface.height,rgba:ctx.getImageData(0,0,surface.width,surface.height).data});
      if (surface.width<2 && surface.height<2) break;
      const next=document.createElement('canvas');
      next.width=Math.max(1,surface.width>>1); next.height=Math.max(1,surface.height>>1);
      ctx=next.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(surface,0,0,next.width,next.height);
      surface=next;
    }
    return {...levels[0],levels};
  } finally { URL.revokeObjectURL(url); }
}

async function readAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить модель для режима 2D Canvas');
  const buffer = await response.arrayBuffer();
  const header = new DataView(buffer);
  if (header.getUint32(0,true)!==0x46546c67) throw new Error('Некорректный GLB');
  const length = header.getUint32(12,true);
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  const start = 28 + length;
  function accessor(index) {
    const a=doc.accessors[index], view=doc.bufferViews[a.bufferView];
    return new BYTE[a.componentType](buffer,start+(view.byteOffset||0)+(a.byteOffset||0),a.count*DIM[a.type]);
  }
  const images = await Promise.all(doc.images.map(im => {
    const v=doc.bufferViews[im.bufferView];
    return decodeTexture(new Uint8Array(buffer,start+(v.byteOffset||0),v.byteLength), im.mimeType);
  }));
  const materials = doc.materials.map(m => {
    const p=m.pbrMetallicRoughness, color=p.baseColorFactor.slice(0,3).map(toSrgb);
    return {color, metal:p.metallicFactor, texture:p.baseColorTexture ? images[doc.textures[p.baseColorTexture.index].source] : null,
            doubleside:Boolean(m.doubleSided), transparent:m.alphaMode==='MASK'};
  });
  const parts = [];
  function collect(nodeId, parentTranslation=[0,0,0], parentExplode=[0,0,0], insideRegion=false) {
    const node=doc.nodes[nodeId];
    const regional = insideRegion || Boolean(node.extras?.part);
    const role = node.name.startsWith('Рельеф ·') ? 'terrain' : regional ? 'fitting' : 'fixed';
    const offset=parentTranslation.map((v,i)=>v+(node.translation?.[i]||0));
    const explode=parentExplode.map((v,i)=>v+(node.extras?.explode?.[i]||0));
    if (node.mesh!==undefined) {
      for (const prim of doc.meshes[node.mesh].primitives) {
        const positions=accessor(prim.attributes.POSITION);
        const total=positions.length/3;
        parts.push({role,positions,normals:accessor(prim.attributes.NORMAL),indices:accessor(prim.indices),
          uv:prim.attributes.TEXCOORD_0!==undefined ? accessor(prim.attributes.TEXCOORD_0) : null,
          mat:materials[prim.material], offset, explode, sx:new Float32Array(total),sy:new Float32Array(total),
          sz:new Float32Array(total),light:new Float32Array(total)});
      }
    }
    for (const child of node.children||[]) collect(child,offset,explode,regional);
  }
  for (const i of doc.scenes[doc.scene].nodes) collect(i);
  return parts;
}

export function renderScene(parts, frame, state) {
  const {width,height,rgba,depth}=frame;
  const decoration=frame.decoration ||= new Uint8Array(width*height);
  decoration.fill(0);
  rgba.fill(0);
  depth.fill(-Infinity);
  const {yaw,pitch,zoom,split}=state;
  const size=Math.min(width/.501,height/.463)*zoom;
  const cx=Math.cos(yaw), sx=Math.sin(yaw), cy=Math.cos(pitch), sy=Math.sin(pitch);
  const lx=-.74, ly=.48, lz=.47; // fixed studio lighting in camera space
  for (const part of parts) {
    const {positions:v,normals:n,indices,uv,mat,offset,explode,sx:X,sy:Y,sz:Z,light:L}=part;
    const dx=offset[0]+explode[0]*split, dy=offset[1]+explode[1]*split, dz=offset[2]+explode[2]*split;
    const [red,green,blue]=mat.color, texture=mat.texture;
    const isMetal=mat.metal>.15 ? 1 : 0;
    for (let i=0,j=0;j<v.length;j+=3,i++) {
      const a=v[j]+dx,b=v[j+1]+dy,c=v[j+2]+dz;
      const zz=-sx*a+cx*c;
      X[i]=width*.5+size*(cx*a+sx*c);
      Y[i]=height*.5-size*(cy*b-sy*zz);
      Z[i]=sy*b+cy*zz;
      const nz0=-sx*n[j]+cx*n[j+2], nx=cx*n[j]+sx*n[j+2], ny=cy*n[j+1]-sy*nz0, nz=sy*n[j+1]+cy*nz0;
      const facing=Math.max(0,nx*lx+ny*ly+nz*lz);
      L[i]=.60+.75*facing+mat.metal*.45*Math.pow(Math.max(0,-.43*nx+.28*ny+.85*nz),17);
    }
    for (let k=0;k<indices.length;k+=3) {
      const a=indices[k], b=indices[k+1], c=indices[k+2];
      const x0=X[a], y0=Y[a], x1=X[b], y1=Y[b], x2=X[c], y2=Y[c];
      const denominator=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
      if (Math.abs(denominator)<.025 || (denominator>0 && !mat.doubleside)) continue;
      const xMin=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5));
      const xMax=Math.min(width-1,Math.floor(Math.max(x0,x1,x2)-.5));
      const yMin=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5));
      const yMax=Math.min(height-1,Math.floor(Math.max(y0,y1,y2)-.5));
      if (xMin>xMax || yMin>yMax) continue;
      const adx=(y1-y2)/denominator, ady=(x2-x1)/denominator;
      const bdx=(y2-y0)/denominator, bdy=(x0-x2)/denominator;
      const zA=Z[a]-Z[c], zB=Z[b]-Z[c], zC=Z[c];
      const la=L[a]-L[c], lb=L[b]-L[c], lc=L[c];
      const ua=uv ? uv[a*2]-uv[c*2]:0, ub=uv ? uv[b*2]-uv[c*2]:0, uc=uv ? uv[c*2]:0;
      const va=uv ? uv[a*2+1]-uv[c*2+1]:0, vb=uv ? uv[b*2+1]-uv[c*2+1]:0, vc=uv ? uv[c*2+1]:0;
      let tex=texture;
      if(texture?.levels) {
        const widthU=texture.width, heightV=texture.height;
        const tx=Math.hypot((ua*adx+ub*bdx)*widthU,(va*adx+vb*bdx)*heightV);
        const ty=Math.hypot((ua*ady+ub*bdy)*widthU,(va*ady+vb*bdy)*heightV);
        const level=clamp(Math.floor(Math.log2(Math.max(1,tx,ty))),0,texture.levels.length-1);
        tex=texture.levels[level];
      }
      let rowA=adx*(xMin+.5-x2)+ady*(yMin+.5-y2);
      let rowB=bdx*(xMin+.5-x2)+bdy*(yMin+.5-y2);
      for (let y=yMin; y<=yMax; y++,rowA+=ady,rowB+=bdy) {
        let aa=rowA,bb=rowB,pixel=y*width+xMin;
        for (let x=xMin;x<=xMax;x++,aa+=adx,bb+=bdx,pixel++) {
          if (aa<-.000001||bb<-.000001||aa+bb>1.000001) continue;
          const z=aa*zA+bb*zB+zC;
          if(z<depth[pixel]) continue;
          let r=red,g=green,bl=blue;
          if(tex) {
            const u=aa*ua+bb*ub+uc, v=aa*va+bb*vb+vc;
            const ix=Math.min(tex.width-1,((u-Math.floor(u))*tex.width)|0);
            const iy=Math.min(tex.height-1,((v-Math.floor(v))*tex.height)|0);
            const ti=(iy*tex.width+ix)*4;
            if(mat.transparent && tex.rgba[ti+3]<52) continue;
            r=tex.rgba[ti]; g=tex.rgba[ti+1]; bl=tex.rgba[ti+2];
          }
          depth[pixel]=z; decoration[pixel]=isMetal;
          const intensity=aa*la+bb*lb+lc, o=pixel*4;
          rgba[o]=r*intensity; rgba[o+1]=g*intensity; rgba[o+2]=bl*intensity; rgba[o+3]=255;
        }
      }
    }
  }
  // A short image-space contact shadow separates the relief from the cloth ground.
  if (!state.moving) {
    const step=Math.max(1,Math.round(size*.0016));
    for (let y=step*3; y<height; y++) for (let x=step*3;x<width;x++) {
      const i=y*width+x, near=depth[i];
      if (near===-Infinity) continue;
      let dark=1;
      const delta=step*(width+1);
      if(!decoration[i] && ((decoration[i-delta] && depth[i-delta]>near+.00030) ||
        (decoration[i-step*width] && depth[i-step*width]>near+.00030))) dark-=.28;
      if(depth[i-delta]>near+.0019) dark-=.15;
      if(depth[i-2*delta]>near+.0038) dark-=.09;
      if(depth[i-3*delta]>near+.0058) dark-=.04;
      if(dark===1) continue;
      const j=i*4; rgba[j]*=dark; rgba[j+1]*=dark; rgba[j+2]*=dark;
    }
  }
}

export async function mountSoftwareViewer({stage,status,mode,minus,plus,reset,hint,file,relief}) {
  const canvas=document.createElement('canvas');
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','Трёхмерная сборка. Перетащите для вращения. Клавиши + и − меняют масштаб.');
  stage.replaceChildren(canvas,status);
  status.hidden=false; status.textContent='Загрузка облегчённой 3D-сборки…';
  const context=canvas.getContext('2d',{alpha:true});
  if(!context) throw new Error('Canvas 2D unavailable');
  const compact=file.replace(/\.glb(?=([?#]|$))/,'-cpu.glb');
  let parts;
  try { parts=await readAsset(compact); }
  catch(error) { if(compact===file) throw error; parts=await readAsset(file); }
  const changeRelief=cpuReliefModifiers(parts);
  const state={yaw:.028,pitch:.043,zoom:1,split:0,moving:false};
  let requested=0, frame, redrawForIdle=0;
  function draw() {
    requested=0;
    const rect=stage.getBoundingClientRect();
    if(rect.width<1||rect.height<1) return;
    const scale=Math.min(window.devicePixelRatio||1,1.55,(state.moving?550:1100)/Math.max(rect.width,rect.height));
    const width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
    if(!frame||frame.width!==width||frame.height!==height) {
      canvas.width=width; canvas.height=height;
      const image=context.createImageData(width,height);
      frame={width,height,image,rgba:image.data,depth:new Float32Array(width*height)};
    }
    renderScene(parts,frame,state);
    context.putImageData(frame.image,0,0);
  }
  function update(moving=false) {
    state.moving=moving;
    if(!requested) requested=requestAnimationFrame(draw);
    clearTimeout(redrawForIdle);
    if(moving) redrawForIdle=setTimeout(()=>update(false),140);
  }
  function changeZoom(scale){state.zoom=clamp(state.zoom*scale,.55,3.8);update(true);}
  function setMode(split) {
    state.split=split;
    mode.textContent=split?'Собрать панно':'Разнести детали';
    mode.setAttribute('aria-pressed',String(Boolean(split)));
    mode.setAttribute('aria-label',mode.textContent);
    update();
  }
  mode.onclick=()=>setMode(state.split?0:1);
  plus.onclick=()=>changeZoom(1.2); minus.onclick=()=>changeZoom(1/1.2);
  reset.onclick=()=>{relief.reset();Object.assign(state,{yaw:.028,pitch:.043,zoom:1});setMode(0);};
  const points=new Map();
  const distance=()=>{const p=[...points.values()];return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);};
  canvas.onpointerdown=e=>{
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    const prev=points.get(e.pointerId);
    if(!prev) return;
    const old=points.size===2?distance():0;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(old>0) changeZoom(distance()/old);
    else if(points.size===1) {
      state.yaw+=(e.clientX-prev.x)*.009;
      state.pitch=clamp(state.pitch+(e.clientY-prev.y)*.009,-1.46,1.46);
      update(true);
    }
  };
  const release=e=>{points.delete(e.pointerId);update();};
  canvas.onpointerup=release;canvas.onpointercancel=release;canvas.onlostpointercapture=release;
  canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(Math.exp(-clamp(e.deltaY,-150,150)*.002));},{passive:false});
  canvas.onkeydown=e=>{
    if(e.key==='+'||e.key==='=')changeZoom(1.2);
    else if(e.key==='-')changeZoom(1/1.2);
    else if(e.key==='0'||e.key==='Home')reset.click();
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){state.yaw+=e.key==='ArrowLeft'?-.12:.12;update();}
    else if(e.key==='ArrowUp'||e.key==='ArrowDown'){state.pitch=clamp(state.pitch+(e.key==='ArrowUp'?-.12:.12),-1.46,1.46);update();}
    else return;
    e.preventDefault();
  };
  relief.bind(value=>{changeRelief(value);update(true);});
  status.hidden=true;
  stage.dataset.renderer='canvas2d';
  hint.textContent='Облегчённый 3D-просмотр. Перетащите модель для вращения, используйте колесо или два пальца для масштаба.';
  [mode,minus,plus,reset].forEach(b=>b.disabled=false);
  new ResizeObserver(()=>update()).observe(stage);
  draw();
}
