import * as T from './vendor/three.module.min.js';
import {solveArm} from './retarget-3d.js?v=0.18.1';
import {prepareMotion,sampleMotion} from './avatar-motion.js?v=0.18.1';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),cap=T.MathUtils.clamp;
const valid=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||1;};
export function stockCalibration(rig,data){
 const aspect=data.width/data.height,width=median(data.frames.flatMap(f=>valid(f.pose?.[11])&&valid(f.pose?.[12])?[Math.hypot((f.pose[11][0]-f.pose[12][0])*aspect,f.pose[11][1]-f.pose[12][1])]:[]));
 return {aspect,scale:rig.shoulderWidth/Math.max(.05,width),faceMap:new Map((data.face_indices||[]).map((id,i)=>[id,i]))};
}
// Respect the imported bone's bind orientation. Setting every local quaternion
// to identity (as the old procedural rig allowed) corrupts a real humanoid rig.
export function aimStockBone(rig,bone,child,direction){
 if(direction.lengthSq()<1e-12)return;
 const target=direction.clone().normalize().applyQuaternion(bone.parent.getWorldQuaternion(Q()).invert());
 const bind=rig.restRotations.get(bone.name),forward=child.position.clone().normalize().applyQuaternion(bind);
 bone.quaternion.copy(Q().setFromUnitVectors(forward,target).multiply(bind)).normalize();bone.updateMatrixWorld(true);
}
function palmBasis(forward,across){
 const y=forward.clone().normalize(),x=across.clone().addScaledVector(y,-across.dot(y));
 if(x.lengthSq()<1e-8)return null;x.normalize();const z=x.clone().cross(y).normalize();
 return Q().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
}
export function retargetStock(rig,frame,cal){
 rig.reset();const p=frame?.pose;if(!valid(p?.[11])||!valid(p?.[12]))return [false,false];
 const {aspect,scale,faceMap}=cal,center=[(p[11][0]+p[12][0])/2,(p[11][1]+p[12][1])/2,((p[11][2]||0)+(p[12][2]||0))/2],anchor=rig.shoulderCenter;
 const world=(point,depth=point?.[2])=>V(anchor.x+(point[0]-center[0])*aspect*scale,anchor.y-(point[1]-center[1])*scale,anchor.z+cap(-((depth||0)-center[2])*scale*.24,-.18,.48));
 const chest=rig.joints.Chest,head=rig.joints.Head;
 const roll=cap(-Math.atan2(p[11][1]-p[12][1],Math.abs(p[11][0]-p[12][0])*aspect),-.13,.13);
 chest.quaternion.premultiply(Q().setFromAxisAngle(V(0,0,1),roll));
 const le=frame.face?.[faceMap.get(33)],re=frame.face?.[faceMap.get(263)],nose=frame.face?.[faceMap.get(1)];
 if(valid(le)&&valid(re)){const roll=cap(-Math.atan2(re[1]-le[1],Math.abs(re[0]-le[0])*aspect),-.2,.2),yaw=valid(nose)?cap((nose[0]-(le[0]+re[0])/2)/Math.max(.02,Math.abs(le[0]-re[0]))*.65,-.28,.28):0;head.quaternion.premultiply(Q().setFromEuler(new T.Euler(0,yaw,roll*.6)));}
 rig.group.updateMatrixWorld(true);const observed=[];
 for(const [side,{upper,lower,wrist,sign}] of Object.entries(rig.arms)){
  const ei=sign===1?13:14,wi=sign===1?15:16,hand=frame[side.toLowerCase()],tracked=hand?.length===21&&hand.every(valid);observed.push(Boolean(tracked));
  if(!valid(p[ei])||!valid(p[wi]))continue;
  const shoulder=upper.getWorldPosition(V()),target=world(tracked?hand[0]:p[wi],p[wi][2]);
  if(Math.abs(target.x)<.25&&target.y>.94&&target.y<1.51)target.z=Math.max(target.z,.19);
  if(Math.abs(target.x)<.15&&target.y>=1.51)target.z=Math.max(target.z,.18);
  const a=rig.rest.get(upper.name).distanceTo(rig.rest.get(lower.name)),b=rig.rest.get(lower.name).distanceTo(rig.rest.get(wrist.name));
  const solved=solveArm(shoulder,target,world(p[ei]),a,b);
  aimStockBone(rig,upper,lower,solved.elbow.clone().sub(shoulder));
  aimStockBone(rig,lower,wrist,solved.wrist.clone().sub(lower.getWorldPosition(V())));
  if(!tracked)continue;
  const point=i=>V((hand[i][0]-hand[0][0])*aspect,-(hand[i][1]-hand[0][1]),-((hand[i][2]||0)-(hand[0][2]||0))*.65);
  const fs=rig.fingers[side],middle=rig.rest.get(fs[2].chain[0].name).clone().sub(rig.rest.get(wrist.name));
  const across=rig.rest.get(fs[1].chain[0].name).clone().sub(rig.rest.get(fs[4].chain[0].name));
  const bindBasis=palmBasis(middle,across),targetBasis=palmBasis(point(9),point(5).sub(point(17)));
  if(bindBasis&&targetBasis){const delta=targetBasis.multiply(bindBasis.invert());const desired=delta.multiply(rig.restWorld.get(wrist.name));wrist.quaternion.copy(wrist.parent.getWorldQuaternion(Q()).invert().multiply(desired)).normalize();wrist.updateMatrixWorld(true);}
  for(let finger=0;finger<5;finger++){
   const chain=fs[finger].chain,start=finger===0?1:5+(finger-1)*4;
   for(let j=0;j<3;j++)aimStockBone(rig,chain[j],chain[j+1],point(start+j+1).sub(point(start+j)));
  }
 }
 rig.group.updateMatrixWorld(true);rig.skeletons.forEach(s=>s.update());return observed;
}
const tracks=new WeakMap();
export function prepareStockMotion(rig,data,{smooth=true}={}){
 let cache=tracks.get(data);if(!cache){cache={};tracks.set(data,cache);}if(cache[smooth])return cache[smooth];
 const source=prepareMotion(data),cal=stockCalibration(rig,data),frames=[],observed=[];
 for(let i=0;i<data.frames.length;i++){
  observed.push(retargetStock(rig,sampleMotion(source,i/data.fps,{smooth}),cal));
  frames.push(rig.bones.map(b=>b.quaternion.clone()));
 }
 // A symmetric, low-strength rotation filter has no playback lag. It only
 // affects small fluctuations; large deliberate configurations remain intact.
 const output=smooth?frames.map((frame,i)=>frame.map((q,j)=>{
  if(i===0||i===frames.length-1)return q.clone();
  const a=frames[i-1][j],c=frames[i+1][j];
  if(q.angleTo(a)>.32||q.angleTo(c)>.32)return q.clone();
  return q.clone().slerp(a.clone().slerp(c,.5),.22).normalize();
 })):frames;
 rig.reset();return cache[smooth]={frames:output,observed,fps:data.fps,duration:data.duration,boneNames:rig.bones.map(b=>b.name)};
}
export function applyStockMotion(rig,track,time){
 const f=cap(time*track.fps,0,track.frames.length-1),i=Math.floor(f),j=Math.min(i+1,track.frames.length-1),alpha=f-i;
 rig.bones.forEach((b,k)=>b.quaternion.copy(track.frames[i][k]).slerp(track.frames[j][k],alpha));
 for(const [side,index] of [['Left',0],['Right',1]])for(const mesh of rig.handMeshes[side])mesh.visible=track.observed[i][index]&&track.observed[j][index];
 rig.group.updateMatrixWorld(true);rig.skeletons.forEach(s=>s.update());
}

export function relaxStockRig(rig){
 rig.reset();
 for(const [side,{upper,lower,wrist,sign}] of Object.entries(rig.arms)){
  aimStockBone(rig,upper,lower,V(sign*.13,-.30,0));
  aimStockBone(rig,lower,wrist,V(sign*.035,-.24,.035));
 }
 rig.group.updateMatrixWorld(true);rig.skeletons.forEach(s=>s.update());
}
