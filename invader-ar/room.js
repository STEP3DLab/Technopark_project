import {MASK} from './tracker.js';
import {createHologram} from './hologram.js';
import {compose,mul,translate,ry,scale,clamp} from './graphics.js';

const $=id=>document.getElementById(id);
let active=null,starting=false;
export const roomIsOpen=()=>starting||!!active;
export async function supportsRoom(){
  try{return !!(await navigator.xr?.isSessionSupported('immersive-ar'));}catch{return false;}
}
function makeReticle(gl){
  const shader=(kind,src)=>{
    const item=gl.createShader(kind);gl.shaderSource(item,src);gl.compileShader(item);
    if(!gl.getShaderParameter(item,gl.COMPILE_STATUS))throw Error('Reticle shader');
    return item;
  };
  const program=gl.createProgram();
  for(const sh of [shader(gl.VERTEX_SHADER,'attribute vec3 p;uniform mat4 m;void main(){gl_Position=m*vec4(p,1.);}'),shader(gl.FRAGMENT_SHADER,'precision mediump float;void main(){gl_FragColor=vec4(.70,1.,.85,1.);}')]){
    gl.attachShader(program,sh);gl.deleteShader(sh);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Reticle program');
  const points=[];
  for(let i=0;i<64;i++){
    const a=i*Math.PI/32,b=(i+1)*Math.PI/32;
    for(const [angle,r] of [[a,.075],[a,.079],[b,.079],[a,.075],[b,.079],[b,.075]])points.push(r*Math.cos(angle),.004,r*Math.sin(angle));
  }
  const buf=gl.createBuffer(),pos=gl.getAttribLocation(program,'p'),matrix=gl.getUniformLocation(program,'m');
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
  return {draw(m){gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(matrix,false,m);gl.drawArrays(gl.TRIANGLES,0,points.length/3);gl.disableVertexAttribArray(pos);},dispose(){gl.deleteBuffer(buf);gl.deleteProgram(program);}};
}
export async function startRoom(handlers){
  if(roomIsOpen())return;
  starting=true;
  let session,state;
  const hud=$('xrHud');
  try{
    // Call requestSession on the gesture before any asynchronous camera/graphics setup.
    session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['hit-test'],optionalFeatures:['dom-overlay','anchors'],domOverlay:{root:hud}});
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,xrCompatible:true});
    if(!gl)throw Error('WebGL');
    state={session,gl,items:[],hit:null,source:null,hologram:null,ring:null,requested:false,ended:false,cameraX:0,cameraZ:0,nextId:0};
    active=state;
    session.addEventListener('end',()=>{
      state.ended=true;state.source?.cancel();state.items.forEach(item=>item.anchor?.delete());state.hologram?.dispose();state.ring?.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();active=null;hud.hidden=true;document.body.classList.remove('no-scroll');handlers.ended();
    },{once:true});
    if(gl.makeXRCompatible)await gl.makeXRCompatible();
    const layer=new XRWebGLLayer(session,gl,{alpha:true,antialias:true});
    session.updateRenderState({baseLayer:layer});
    const [space,viewer]=await Promise.all([session.requestReferenceSpace('local'),session.requestReferenceSpace('viewer')]);
    state.source=await session.requestHitTestSource({space:viewer});
    state.hologram=createHologram(gl,MASK);state.ring=makeReticle(gl);
    if(state.ended)return;
    hud.hidden=false;document.body.classList.add('no-scroll');
    const requestPlace=()=>{if(state.hit&&state.items.length<18)state.requested=true;};
    session.addEventListener('select',requestPlace);
    hud.onbeforexrselect=e=>{if(e.target.closest('button'))e.preventDefault();};
    $('xrPlace').onclick=requestPlace;
    $('xrUndo').onclick=()=>{state.items.pop()?.anchor?.delete();handlers.chime('snap');};
    $('xrExit').onclick=()=>session.end();
    let lastMessage='';
    function frame(ms,xrFrame){
      if(state.ended)return;
      session.requestAnimationFrame(frame);
      const t=ms/1000,pose=xrFrame.getViewerPose(space);
      const result=xrFrame.getHitTestResults(state.source)[0],hit=result?.getPose(space);
      state.hit=hit&&hit.transform.matrix[5]>.72?hit:null;
      if(state.requested){
        state.requested=false;
        if(state.hit&&pose&&state.items.length<18){
          const p=state.hit.transform.position,eye=pose.transform.position;
          const item={matrix:Float32Array.from(state.hit.transform.matrix),born:t, yaw:Math.atan2(eye.x-p.x,eye.z-p.z),color:handlers.color(),id:state.nextId++};
          state.items.push(item);handlers.chime('lock');
          if(result.createAnchor)try{
            result.createAnchor().then(anchor=>{if(!state.ended&&state.items.includes(item))item.anchor=anchor;else anchor.delete();}).catch(()=>{});
          }catch{}
        }
      }
      $('xrPlace').disabled=!state.hit||state.items.length>=18;$('xrUndo').disabled=!state.items.length;
      let message=state.hit?'Коснись экрана или нажми «Разместить»':'Медленно проведи телефоном над полом или столом';
      if(state.items.length)message='В комнате: '+state.items.length+' / 18 · '+(state.hit?'Поверхность найдена':'Найди следующую поверхность');
      if(message!==lastMessage){$('xrState').textContent=message;lastMessage=message;}
      if(!pose)return;
      gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const draws=[];
      for(const item of state.items){
        const anchorPose=item.anchor&&xrFrame.getPose(item.anchor.anchorSpace,space);
        if(anchorPose)item.matrix=anchorPose.transform.matrix;
        const m=item.matrix,age=t-item.born,up=.14+Math.sin(t*1.7+item.id)*.009;
        draws.push({item,model:compose(translate(m[12],m[13]+up,m[14]),ry(item.yaw+.20*Math.sin(t*.8+item.id)),scale(.29)),reveal:clamp(age/.7,0,1)});
      }
      for(const view of pose.views){
        const vp=layer.getViewport(view);gl.viewport(vp.x,vp.y,vp.width,vp.height);
        const pv=mul(view.projectionMatrix,view.transform.inverse.matrix);
        if(state.hit)state.ring.draw(mul(pv,state.hit.transform.matrix));
        for(const d of draws)state.hologram.draw(mul(pv,d.model),t,{color:d.item.color,reveal:d.reveal});
      }
    }
    session.requestAnimationFrame(frame);
  }catch(error){
    if(session&&!state?.ended)try{await session.end();}catch{}
    active=null;hud.hidden=true;handlers.error(error.name);
  }finally{starting=false;}
}
