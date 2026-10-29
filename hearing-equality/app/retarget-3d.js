import * as T from './vendor/three.module.min.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const valid=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||1;};
const cap=T.MathUtils.clamp;
export function calibrate3D(data){
  const aspect=data.width/data.height;
  const width=median(data.frames.flatMap(f=>valid(f.pose?.[11])&&valid(f.pose?.[12])?[Math.hypot((f.pose[11][0]-f.pose[12][0])*aspect,f.pose[11][1]-f.pose[12][1])]:[]));
  return {aspect,scale:.47/Math.max(.05,width),faceMap:new Map((data.face_indices||[]).map((id,i)=>[id,i]))};
}
// Two-bone IK preserves bone lengths. The elbow hint chooses the bending plane;
// unreachable noisy targets are clamped, never implemented by stretching a mesh.
export function solveArm(shoulder,target,hint,upperLength,lowerLength){
  const axis=target.clone().sub(shoulder),raw=axis.length();
  if(raw<1e-8)axis.set(0,-1,0);else axis.divideScalar(raw);
  const distance=cap(raw,Math.abs(upperLength-lowerLength)+.008,upperLength+lowerLength-.003);
  const end=shoulder.clone().addScaledVector(axis,distance);
  let bend=hint.clone().sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-8){bend.set(0,-1,0);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<1e-8)bend.set(0,0,-1);}
  bend.normalize();const along=(upperLength**2-lowerLength**2+distance**2)/(2*distance),height=Math.sqrt(Math.max(0,upperLength**2-along**2));
  return {elbow:shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height),wrist:end};
}
export function aimBone(bone,restDirection,worldDirection){
  if(worldDirection.lengthSq()<1e-10)return;
  const parentRotation=bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
  const local=worldDirection.clone().normalize().applyQuaternion(parentRotation);
  bone.quaternion.setFromUnitVectors(restDirection.clone().normalize(),local);bone.updateMatrixWorld(true);
}
export function retarget3D(rig,frame,calibration){
  if(!frame?.pose)return {hands:0};
  const p=frame.pose,{aspect,scale,faceMap}=calibration;
  if(!valid(p[11])||!valid(p[12]))return {hands:0};
  const center=[(p[11][0]+p[12][0])/2,(p[11][1]+p[12][1])/2,((p[11][2]||0)+(p[12][2]||0))/2];
  const world=(point,depth=point?.[2])=>V((point[0]-center[0])*aspect*scale,1.43-(point[1]-center[1])*scale,cap(-((depth||0)-center[2])*scale*.23,-.25,.55));
  rig.joints.Chest.rotation.set(0,0,cap(-Math.atan2(p[11][1]-p[12][1],(p[11][0]-p[12][0])*aspect),-.16,.16));
  const face=id=>frame.face?.[faceMap.get(id)],leftEye=face(33),rightEye=face(263),nose=face(1);
  let roll=0,yaw=0;
  if(valid(leftEye)&&valid(rightEye)){
    roll=cap(-Math.atan2(rightEye[1]-leftEye[1],Math.abs(rightEye[0]-leftEye[0])*aspect),-.23,.23);
    if(valid(nose)){const middle=(leftEye[0]+rightEye[0])/2;yaw=cap((nose[0]-middle)/Math.max(.02,Math.abs(leftEye[0]-rightEye[0]))*.8,-.38,.38);}
  }
  rig.joints.Head.rotation.set(0,yaw,roll*.7);rig.group.updateMatrixWorld(true);
  let hands=0;
  for(const [side,info] of Object.entries(rig.arms)){
    const key=side.toLowerCase(),{upper,lower,wrist,sign}=info,elbowIndex=sign===1?13:14,wristIndex=sign===1?15:16;
    const hand=frame[key],tracked=Array.isArray(hand)&&hand.length===21&&hand.every(valid);
    rig.handMeshes[side].forEach(mesh=>{mesh.visible=tracked;});
    if(!valid(p[elbowIndex])||!valid(p[wristIndex]))continue;
    const shoulder=upper.getWorldPosition(V()),target=world(tracked?hand[0]:p[wristIndex],p[wristIndex][2]);
    // A conservative body clearance for monocular depth. This is display-only.
    if(Math.abs(target.x)<.26&&target.y>1.02&&target.y<1.55)target.z=Math.max(target.z,.18);
    if(Math.abs(target.x)<.16&&target.y>=1.55)target.z=Math.max(target.z,.17);
    const upperDir=rig.rest.get(lower.name).clone().sub(rig.rest.get(upper.name));
    const lowerDir=rig.rest.get(wrist.name).clone().sub(rig.rest.get(lower.name));
    const solved=solveArm(shoulder,target,world(p[elbowIndex]),upperDir.length(),lowerDir.length());
    aimBone(upper,upperDir,solved.elbow.clone().sub(shoulder));
    aimBone(lower,lowerDir,solved.wrist.clone().sub(lower.getWorldPosition(V())));
    if(!tracked){wrist.quaternion.identity();continue;}
    hands++;
    // Hand-relative depth is independent of pose depth; do not mix the two origins.
    const point=i=>V((hand[i][0]-hand[0][0])*aspect*scale,-(hand[i][1]-hand[0][1])*scale,-((hand[i][2]||0)-(hand[0][2]||0))*scale*.65);
    const forward=point(9).normalize(),across=point(5).sub(point(17)).multiplyScalar(sign).normalize();
    const y=forward.clone().negate(),z=across.clone().cross(y).normalize(),x=y.clone().cross(z).normalize();
    if(z.lengthSq()>.1){const basis=new T.Matrix4().makeBasis(x,y,z),q=new T.Quaternion().setFromRotationMatrix(basis);wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));wrist.updateMatrixWorld(true);}
    for(let finger=0;finger<5;finger++){
      const chain=rig.fingers[side][finger].chain,startIndex=finger===0?1:5+(finger-1)*4;
      for(let j=0;j<3;j++){
        const restDir=rig.rest.get(chain[j+1].name).clone().sub(rig.rest.get(chain[j].name));
        aimBone(chain[j],restDir,point(startIndex+j+1).sub(point(startIndex+j)));
      }
    }
  }
  rig.group.updateMatrixWorld(true);rig.skeleton.update();return {hands};
}
