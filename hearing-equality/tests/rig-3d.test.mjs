import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../app/vendor/three.module.min.js';
import {createHumanRig} from '../app/human-rig.js';
import {calibrate3D,retarget3D,solveArm} from '../app/retarget-3d.js';
import {prepareMotion,sampleMotion} from '../app/avatar-motion.js';
const manifest=JSON.parse(readFileSync(new URL('../app/assets/sources/slovo-sources.json',import.meta.url)));
const motions=manifest.samples.map(item=>JSON.parse(readFileSync(new URL(`../app/assets/motion/${item.file.replace('.mp4','.json')}`,import.meta.url))));
test('the human is a skinned volumetric model with 62 bones and three independently driven phalanges per finger',()=>{
 const rig=createHumanRig();assert.equal(rig.bones.length,62);assert.ok(rig.meshes.every(m=>m.isSkinnedMesh));
 for(const side of ['Left','Right']){assert.equal(rig.fingers[side].length,5);for(const finger of rig.fingers[side])assert.equal(finger.chain.length,4);}
 for(const mesh of rig.meshes){const g=mesh.geometry;assert.ok(g.attributes.position.count>20);for(let i=0;i<g.attributes.skinWeight.count;i++){const weights=Array.from(g.attributes.skinWeight.array.slice(i*4,i*4+4));assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-6);for(const index of g.attributes.skinIndex.array.slice(i*4,i*4+4))assert.ok(index<62);}}
 rig.dispose();
});
test('all recorded poses preserve bone lengths and have finite transforms; input coordinates never change',()=>{
 const rig=createHumanRig(),lengths=new Map(rig.bones.map(b=>[b.name,b.position.length()]));
 for(const motion of motions){const before=JSON.stringify(motion),track=prepareMotion(motion),calibration=calibrate3D(motion);
  for(let i=0;i<motion.frames.length;i++){
   retarget3D(rig,sampleMotion(track,i/motion.fps,{smooth:true}),calibration);
   for(const bone of rig.bones){assert.ok(bone.matrixWorld.elements.every(Number.isFinite));assert.ok(Math.abs(bone.quaternion.length()-1)<1e-5);assert.ok(Math.abs(bone.position.length()-lengths.get(bone.name))<1e-8);}
  }
  assert.equal(JSON.stringify(motion),before);
 }
 rig.dispose();
});
test('unreachable targets clamp without stretching, and degenerate elbow hints remain finite',()=>{
 for(const target of [new T.Vector3(20,10,8),new T.Vector3(),new T.Vector3(0,-.4,0)]){
  const solution=solveArm(new T.Vector3(),target,new T.Vector3(),.3,.27);
  assert.ok(Math.abs(solution.elbow.length()-.3)<1e-6);
  assert.ok(Math.abs(solution.wrist.distanceTo(solution.elbow)-.27)<1e-6);
 }
});
test('missing hands hide those meshes and a tracked hand is restored without inventing coordinates',()=>{
 const rig=createHumanRig(),motion=motions.find(m=>m.frames.some(f=>f.left?.length===21&&f.right?.length===21)),frame=motion.frames.find(f=>f.left?.length===21&&f.right?.length===21),calibration=calibrate3D(motion);
 retarget3D(rig,{...frame,left:null},calibration);assert.ok(rig.handMeshes.Left.every(m=>!m.visible));assert.ok(rig.handMeshes.Right.every(m=>m.visible));
 retarget3D(rig,frame,calibration);assert.ok(rig.handMeshes.Left.every(m=>m.visible));rig.dispose();
});
test('skeleton changes deform actual mesh vertices and perspective rotation changes the same 3D point',()=>{
 const rig=createHumanRig(),mesh=rig.meshes.find(m=>m.name==='LeftIndexSurface0'),a=new T.Vector3(),b=new T.Vector3();rig.group.updateMatrixWorld(true);rig.skeleton.update();mesh.getVertexPosition(0,a);
 rig.joints.LeftHand.rotation.x=.8;rig.group.updateMatrixWorld(true);rig.skeleton.update();mesh.getVertexPosition(0,b);assert.ok(a.distanceTo(b)>.01);
 const camera=new T.PerspectiveCamera(35,1,.1,10);camera.position.set(0,1.4,3);camera.lookAt(0,1.4,0);camera.updateMatrixWorld(true);const front=b.clone().project(camera);camera.position.set(2,1.4,2);camera.lookAt(0,1.4,0);camera.updateMatrixWorld(true);assert.ok(front.distanceTo(b.clone().project(camera))>.01);rig.dispose();
});
