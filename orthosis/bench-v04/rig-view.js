/* The same, animated GLB that is offered as a CAD-derived download.
   Its two named groups are the fixed frame and the manual spindle.
   Mesh vertices are already in the spindle's neutral frame (CAD millimetres). */
(() => {
  'use strict';
  const host = document.querySelector('#rig-view');
  if (!host) return;
  const canvas = host.querySelector('canvas'), sprite = host.querySelector('#rig-pose');
  const label = host.querySelector('#rig-view-status'), angleField = document.querySelector('#drum-angle');
  let angle = Number(angleField?.value) || 0, gl = null, drawGL = null, pendingFrame = 0;
  let yaw = -.39, pitch = .65, zoom = 1;
  const buttons = Array.from(host.querySelectorAll('[data-cam]'));
  function draw() {
    pendingFrame = 0;
    const i = Math.round((Math.max(-120, Math.min(120, angle))+120)/5);
    sprite.setAttribute('x', -(i%7)*448);
    sprite.setAttribute('y', -Math.floor(i/7)*320);
    if (drawGL && canvas.clientWidth && canvas.clientHeight) drawGL();
  }
  function invalidate() { if (!pendingFrame) pendingFrame=requestAnimationFrame(draw); }
  document.addEventListener('v04:angle', e => {if (Number.isFinite(e.detail)){angle=e.detail;invalidate();}});
  const secondary = document.getElementById('rig-angle'), mainPlay = document.getElementById('play'), secondaryPlay = document.getElementById('rig-play');
  function syncControls(){
    secondary.value=String(angle);
    document.getElementById('rig-angle-value').textContent=(angle>0?'+':'')+angle+'°';
    secondaryPlay.textContent=mainPlay.textContent;
    secondaryPlay.setAttribute('aria-pressed',mainPlay.getAttribute('aria-pressed')||'false');
  }
  document.addEventListener('v04:angle',syncControls);
  secondary.addEventListener('input',()=>{angleField.value=secondary.value;angleField.dispatchEvent(new Event('input',{bubbles:true}));});
  secondaryPlay.addEventListener('click',()=>{mainPlay.click();syncControls();});
  new MutationObserver(syncControls).observe(mainPlay,{attributes:true,attributeFilter:['aria-pressed']});
  syncControls();
  // Also read the main slider on manual input, independent of animation updates.
  angleField?.addEventListener('input', () => {angle=Number(angleField.value);invalidate();});
  function fallback(text) {
    host.classList.remove('free-camera');
    buttons.forEach(b=>b.disabled=true);
    label.textContent=text;
    drawGL=null;
    invalidate();
  }
  const shader = (type, source) => {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error('shader');
    return s;
  };
  async function loadGeometry() {
    const r=await fetch('files/Orthosis_V04_manual_rig.glb');
    if (!r.ok) throw Error('glb');
    const raw=await r.arrayBuffer(), d=new DataView(raw), jsonLength=d.getUint32(12,true);
    if (d.getUint32(0,true)!==0x46546c67 || d.getUint32(4,true)!==2 || d.getUint32(8,true)!==raw.byteLength) throw Error('header');
    const g=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,20,jsonLength))), base=28+jsonLength;
    function attr(id) {
      const a=g.accessors[id], b=g.bufferViews[a.bufferView], n=a.type==='VEC3'?3:1;
      const Type=({5123:Uint16Array,5125:Uint32Array,5126:Float32Array})[a.componentType];
      return new Type(raw,base+(b.byteOffset||0)+(a.byteOffset||0),n*a.count);
    }
    const program=gl.createProgram();
    const vs=shader(gl.VERTEX_SHADER,`attribute vec3 p,n; uniform mat3 cam; uniform vec3 center; uniform vec2 scale,spin; uniform float radius; varying vec3 normal;
      vec3 rot(vec3 a){return vec3(spin.x*a.x-spin.y*a.y,spin.y*a.x+spin.x*a.y,a.z);}
      void main(){vec3 v=cam*(rot(p)-center)/radius;gl_Position=vec4(v.xy*scale,-v.z*.92,1.);normal=cam*rot(n);}`);
    const fs=shader(gl.FRAGMENT_SHADER,`precision mediump float; varying vec3 normal; uniform vec3 color;
      void main(){vec3 n=normalize(normal);float d=max(0.,dot(n,normalize(vec3(-.45,.65,.8))));
      gl_FragColor=vec4(pow(color,vec3(.4545))*(.60+.48*d),1.);}`);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error('program');
    gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.clearColor(.055,.15,.185,1);
    const p=gl.getAttribLocation(program,'p'),n=gl.getAttribLocation(program,'n');gl.enableVertexAttribArray(p);gl.enableVertexAttribArray(n);
    const U=Object.fromEntries(['cam','center','scale','spin','radius','color'].map(k=>[k,gl.getUniformLocation(program,k)]));
    function buffer(data,target) { const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b; }
    const moving=new Set(g.nodes.find(node=>node.name==='manual_spindle').children.map(i=>g.nodes[i].mesh));
    let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    const meshes=g.meshes.map((m,index)=>{
      const prim=m.primitives[0], c=g.materials[prim.material].pbrMetallicRoughness.baseColorFactor, positions=attr(prim.attributes.POSITION),normals=attr(prim.attributes.NORMAL),indices=attr(prim.indices);
      if (indices instanceof Uint32Array && !gl.getExtension('OES_element_index_uint')) throw Error('index');
      const move=moving.has(index);
      for(let k=0;k<positions.length;k+=3){const x=positions[k],y=positions[k+1],z=positions[k+2],r=Math.hypot(x,y);
        const low=move?[-r,-r,z]:[x,y,z],high=move?[r,r,z]:[x,y,z];
        for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],low[j]);hi[j]=Math.max(hi[j],high[j]);}}
      const morph=prim.targets?.map(t=>[attr(t.POSITION),attr(t.NORMAL)]);
      // Include both free-end extremes in the fit when switching to a top view.
      for (const targetAngle of [-90,90]) {
        const target=m.extras?.sampleAngles?.indexOf(targetAngle);
        if (!morph || target==null || target<0) continue;
        const delta=morph[target][0];
        for (let k=0;k<positions.length;k++) {
          const axis=k%3, v=positions[k]+delta[k];
          lo[axis]=Math.min(lo[axis],v);hi[axis]=Math.max(hi[axis],v);
        }
      }
      return {morph,positions,normals,angles:m.extras?.sampleAngles,previous:null,v:buffer(positions,gl.ARRAY_BUFFER),n:buffer(normals,gl.ARRAY_BUFFER),i:buffer(indices,gl.ELEMENT_ARRAY_BUFFER),count:indices.length,type:indices instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,move,color:c.slice(0,3)};
    });
    const center=lo.map((v,i)=>(v+hi[i])/2),radius=Math.hypot(...hi.map((v,i)=>(v-lo[i])/2))*.94;
    gl.uniform3fv(U.center,center); gl.uniform1f(U.radius,radius);
    drawGL=()=>{
      const density=Math.min(window.devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*density),h=Math.round(canvas.clientHeight*density);
      if (canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const c=Math.cos(yaw),s=Math.sin(yaw),ce=Math.cos(pitch),se=Math.sin(pitch);
      gl.uniformMatrix3fv(U.cam,false,new Float32Array([c,s*se,-s*ce,-s,c*se,-c*ce,0,ce,se]));
      const scale=.99*zoom*Math.min(w,h);gl.uniform2f(U.scale,scale/w,scale/h);
      const a=angle*Math.PI/180;
      for(const m of meshes){
        if(m.morph && m.previous!==angle){
          const lo=Math.max(0,Math.min(m.angles.length-1,(angle-m.angles[0])/(m.angles[1]-m.angles[0])));
          const i=Math.floor(lo),j=Math.min(i+1,m.angles.length-1),t=lo-i;
          for(const [k,base,b] of [[0,m.positions,m.v],[1,m.normals,m.n]]){
            const v=new Float32Array(base.length),a=m.morph[i][k],c=m.morph[j][k];
            for(let l=0;l<v.length;l++)v[l]=base[l]+a[l]*(1-t)+c[l]*t;
            gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,v,gl.DYNAMIC_DRAW);
          }
          m.previous=angle;
        }
        gl.uniform2f(U.spin,m.move?Math.cos(a):1,m.move?Math.sin(a):0);gl.uniform3fv(U.color,m.color);
        gl.bindBuffer(gl.ARRAY_BUFFER,m.v);gl.vertexAttribPointer(p,3,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.i);gl.drawElements(gl.TRIANGLES,m.count,m.type,0);}
    };
    host.classList.add('free-camera');buttons.forEach(b=>b.disabled=false);label.textContent='Свободный ракурс · потяните модель, чтобы повернуть';
    invalidate();
  }
  buttons.forEach(b=>b.addEventListener('click',()=>{
    const a=b.dataset.cam;
    if (a==='home') {yaw=-.39;pitch=.65;zoom=1;}
    else if(a==='top'){yaw=0;pitch=Math.PI/2;zoom=1;}
    else zoom=Math.max(.6,Math.min(2.7,zoom*(a==='in'?1.2:1/1.2)));
    invalidate();
  }));
  const clampPitch=()=>{pitch=Math.max(-1.56,Math.min(1.57,pitch));};
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(!drawGL||drag)return;drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;yaw+=(e.clientX-drag.x)*.009;pitch+=(e.clientY-drag.y)*.009;clampPitch();drag.x=e.clientX;drag.y=e.clientY;invalidate();});
  for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,()=>{drag=null;});
  canvas.addEventListener('keydown',e=>{if(!drawGL)return;const d=.14;switch(e.key){
    case 'ArrowLeft':yaw-=d;break;case 'ArrowRight':yaw+=d;break;case 'ArrowUp':pitch+=d;break;case 'ArrowDown':pitch-=d;break;
    case 'Home':yaw=-.39;pitch=.65;zoom=1;break;default:return;}clampPitch();e.preventDefault();invalidate();});
  if(window.ResizeObserver)new ResizeObserver(invalidate).observe(host);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback('Фиксированный ракурс · кадры CAD через 5°');});
  canvas.addEventListener('webglcontextrestored',()=>loadGeometry().catch(()=>fallback('Фиксированный ракурс · кадры CAD через 5°')));
  fallback('Фиксированный ракурс · кадры CAD через 5°');
  try {gl=canvas.getContext('webgl',{alpha:false,antialias:true});} catch {}
  if(gl)loadGeometry().catch(()=>fallback('Фиксированный ракурс · кадры CAD через 5°'));
})();
