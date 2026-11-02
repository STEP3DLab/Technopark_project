import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { StudioScene, defaultPose } from './scene.js';
import { sampleTimeline } from './motion.js';

// These are geometry and lifecycle tests, not a WebGL/browser screenshot test.
// Only text-label canvases are omitted; all meshes, transforms and projections
// below are constructed by the production scene's own methods.
globalThis.document={createElement(type){
  assert.equal(type,'canvas');return{width:0,height:0,getContext(kind){
    assert.equal(kind,'2d');return{fillText(){},fillRect(){}};
  }};
}};

function createScene() {
  const s=Object.create(StudioScene.prototype);
  Object.assign(s,{pose:{...defaultPose},autoAim:true,subjectType:'robot',contextLost:false,disposed:false,
    _mainDirty:true,_monitorDirty:true,_captureSession:null,_poseSignature:null,
    helperState:{grid:true,path:true,frustum:false},view:'perspective'});
  s.scene=new THREE.Scene();s.target=new THREE.Vector3(.92,.98,0);
  s.materials=Object.fromEntries(['blue','navy','ink','white','steel','darkSteel','pink','cyan','rubber','floor']
    .map(key=>[key,new THREE.MeshStandardMaterial()]));
  s.shotCamera=new THREE.PerspectiveCamera(35,16/9,.025,50);s.shotCamera.filmGauge=36;
  s._buildStudio();s._buildRobot();s._buildStage();s._buildLights();
  s.pathGroup=new THREE.Group();s.scene.add(s.pathGroup);
  s.frustumHelper=new THREE.CameraHelper(s.shotCamera);s.frustumHelper.visible=false;s.scene.add(s.frustumHelper);
  s.setPose(defaultPose);
  return s;
}

const d=defaultPose;
const PRESETS={
  orbit:[{...d,base:-22,subject:0},{...d,base:0,subject:50},{...d,base:22,subject:100}],
  dolly:[{...d,base:-7,shoulder:12,elbow:75,subject:0},{...d,base:-7,shoulder:25,elbow:65,subject:50},{...d,base:-7,shoulder:40,elbow:55,subject:100}],
  crane:[{...d,base:12,shoulder:50,elbow:80,subject:0},{...d,base:6,shoulder:35,elbow:60,subject:50},{...d,base:0,shoulder:15,elbow:65,subject:100}],
};

test('manual wrist inherits the forearm instead of stabilizing against the world',()=>{
  const s=createScene();s.setAutoAim(false);
  s.setPose({...d,shoulder:20,elbow:40});
  const before=s.shotCamera.getWorldQuaternion(new THREE.Quaternion());
  s.setPose({...d,shoulder:50,elbow:40});
  const after=s.shotCamera.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(Math.abs(before.angleTo(after)-Math.PI/6)<1e-8);
  assert.equal(s.cameraMount.parent,s.wristRoll);
  assert.equal(s.wristRoll.parent,s.wristPitch);
  assert.equal(s.wristPitch.parent,s.wristYaw);
  assert.deepEqual(s.assessPose().localWrist,{yaw:0,pitch:0,roll:0});
  s.dispose();
});

test('tracking preserves the existing lens position and exposes resolved local angles',()=>{
  const s=createScene();
  const p=s.getCameraPosition();
  assert.ok(Math.abs(p.x-(-.3335285076488655))<1e-9);
  assert.ok(Math.abs(p.y-1.6058655131596098)<1e-9);
  const centre=s.target.clone().project(s.shotCamera);
  assert.ok(Math.hypot(centre.x,centre.y)<.001);
  const {localWrist}=s.assessPose();
  assert.ok(Object.values(localWrist).every(Number.isFinite));
  assert.ok(Object.values(localWrist).some(value=>Math.abs(value)>.1));
  s.dispose();
});

test('combined slider limits detect both arm and camera below the working plane',()=>{
  const s=createScene(),before={...s.pose},camera=s.getCameraPosition();
  const result=s.assessPose({...d,shoulder:80,elbow:110});
  assert.equal(result.valid,false);
  assert.ok(result.issues.some(i=>i.code==='camera_below_table'&&i.severity==='error'));
  assert.ok(result.issues.some(i=>i.code==='arm_below_table'&&i.severity==='error'));
  assert.ok(result.minCameraY<0&&result.minArmY<0);
  assert.deepEqual(s.pose,before);assert.deepEqual(s.getCameraPosition(),camera);
  s.dispose();
});

test('assessments reject non-finite inputs and restore a pose after an exception',()=>{
  const s=createScene(),before={...s.pose},camera=s.getCameraPosition();
  assert.equal(s.assessPose({...d,elbow:NaN}).valid,false);
  assert.equal(s.analyzeProgram([d,{...d,base:Infinity}]).valid,false);
  const original=s._assessCurrent;s._assessCurrent=()=>{throw new Error('assessment failure');};
  assert.throws(()=>s.assessPose({...d,shoulder:65}),/assessment failure/);
  assert.deepEqual(s.pose,before);assert.deepEqual(s.getCameraPosition(),camera);
  s._assessCurrent=original;s.dispose();
});

test('program analysis reports an invalid interior sample and restores the current pose',()=>{
  const s=createScene(),before={...s.pose};
  const result=s.analyzeProgram([d,{...d,shoulder:80,elbow:110},d]);
  assert.equal(result.valid,false);assert.equal(result.firstInvalidIndex,1);assert.equal(result.sampleCount,3);
  assert.ok(result.issues.some(i=>i.sampleIndex===1&&i.severity==='error'));
  assert.deepEqual(s.pose,before);
  assert.equal(s.analyzeProgram([]).valid,false);s.dispose();
});

test('all preset frames clear the table and contain actual subject vertices in the monitor',()=>{
  const s=createScene(),point=new THREE.Vector3();let checked=0;
  for(const [name,poses]of Object.entries(PRESETS)){
    const keys=poses.map((pose,i)=>({time:i*4,pose}));
    const sampled=Array.from({length:97},(_,i)=>sampleTimeline(keys,i/12));
    for(const type of ['robot','rocket','abstract']){
      s.setSubjectType(type);const program=s.analyzeProgram(sampled);
      assert.equal(program.valid,true,`${name}/${type}: ${JSON.stringify(program.issues)}`);
      for(const pose of sampled){
        s.setPose(pose);checked++;
        s.subjects[type].traverseVisible(object=>{
          if(!object.isMesh)return;const vertices=object.geometry.attributes.position;
          for(let i=0;i<vertices.count;i++){
            point.fromBufferAttribute(vertices,i).applyMatrix4(object.matrixWorld).project(s.shotCamera);
            assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z));
            assert.ok(Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&point.z>=-1&&point.z<=1,
              `${name}/${type} leaves the shot: ${point.toArray()}`);
          }
        });
      }
    }
  }
  assert.equal(checked,873);s.dispose();
});

// Fault-injection adapter for renderer state contracts only. It never pretends
// to produce pixels or validate GPU output.
class RendererProbe {
  constructor(){
    this.ratio=1.5;this.size=new THREE.Vector2(480,270);this.viewport=new THREE.Vector4(2,3,470,260);
    this.scissor=new THREE.Vector4(4,5,450,250);this.scissorTest=false;this.clearColor=new THREE.Color(0x334455);
    this.clearAlpha=.7;this.shadowMap={needsUpdate:true};this.renders=0;this.resizes=0;this.failure=null;
    this.domElement={toDataURL:()=>{if(this.failure==='encode')throw new Error('encode failure');return'data:image/png;base64,fixture';},
      removeEventListener(){},remove(){}};
  }
  getPixelRatio(){return this.ratio;}setPixelRatio(r){this.ratio=r;}
  getSize(out){return out.copy(this.size);}setSize(w,h){this.size.set(w,h);this.resizes++;}
  getViewport(out){return out.copy(this.viewport);}setViewport(...args){this.viewport.copy(args[0]?.isVector4?args[0]:new THREE.Vector4(...args));}
  getScissor(out){return out.copy(this.scissor);}setScissor(...args){this.scissor.copy(args[0]?.isVector4?args[0]:new THREE.Vector4(...args));}
  getScissorTest(){return this.scissorTest;}setScissorTest(value){this.scissorTest=value;}
  getClearColor(out){return out.copy(this.clearColor);}getClearAlpha(){return this.clearAlpha;}
  setClearColor(color,alpha){this.clearColor.set(color);if(alpha!==undefined)this.clearAlpha=alpha;}
  clear(){}render(){if(this.failure==='render')throw new Error('render failure');this.renders++;}
  dispose(){}
}
function withProbes(s){
  s.renderer=new RendererProbe();s.monitorRenderer=new RendererProbe();
  s.camera=new THREE.PerspectiveCamera();s.viewport={clientWidth:754,clientHeight:580};
  s.controls={update(){},dispose(){},removeEventListener(){}};return s;
}

for(const failure of ['render','encode'])test(`capture restores helpers, DPR, size and renderer state after ${failure} failure`,()=>{
  const s=withProbes(createScene());s.frustumHelper.visible=true;
  const r=s.monitorRenderer,viewport=r.viewport.clone(),scissor=r.scissor.clone(),clear=r.clearColor.clone();
  r.failure=failure;
  assert.throws(()=>s.captureFrame(),new RegExp(`${failure} failure`));
  assert.equal(s._captureSession,null);assert.equal(r.ratio,1.5);assert.deepEqual(r.size.toArray(),[480,270]);
  assert.equal(s.grid.visible,true);assert.equal(s.pathGroup.visible,true);assert.equal(s.frustumHelper.visible,true);
  assert.deepEqual(r.viewport.toArray(),viewport.toArray());assert.deepEqual(r.scissor.toArray(),scissor.toArray());
  assert.equal(r.scissorTest,false);assert.equal(r.clearColor.getHex(),clear.getHex());assert.equal(r.clearAlpha,.7);
  s.dispose();
});

test('capture batch allocates the export dimensions once and restores them at the end',()=>{
  const s=withProbes(createScene()),r=s.monitorRenderer;
  s.beginCapture();const initialResizes=r.resizes;
  for(let i=0;i<3;i++){s.setPose({...d,subject:i*25});assert.match(s.captureFrame(),/^data:image\/png/);}
  assert.equal(r.resizes,initialResizes);assert.deepEqual(r.size.toArray(),[1280,720]);
  s.endCapture();assert.deepEqual(r.size.toArray(),[480,270]);assert.equal(r.ratio,1.5);s.dispose();
});

test('idle scenes skip both renderers and orbit-only updates keep the monitor cached',()=>{
  const s=withProbes(createScene());assert.equal(s.render(),true);
  assert.equal(s.renderer.renders,1);assert.equal(s.monitorRenderer.renders,1);
  assert.equal(s.render(),false);assert.equal(s.renderer.renders,1);assert.equal(s.monitorRenderer.renders,1);
  s._mainDirty=true;s.render();assert.equal(s.renderer.renders,2);assert.equal(s.monitorRenderer.renders,1);
  s.setPose({...d,subject:25});s.render();assert.equal(s.renderer.renders,3);assert.equal(s.monitorRenderer.renders,2);
  s.contextLost=true;assert.equal(s.render(),false);assert.throws(()=>s.captureFrame(),/недоступна/);
  s.dispose();
});

test('invalid poses cannot be captured and partial construction can be disposed safely',()=>{
  const s=withProbes(createScene());s.setPose({...d,shoulder:80,elbow:110});
  assert.throws(()=>s.captureFrame(),/рабочую плоскость/);assert.equal(s.monitorRenderer.resizes,0);s.dispose();
  const partial=Object.create(StudioScene.prototype);partial.scene=new THREE.Scene();partial.materials={};
  partial.renderer=new RendererProbe();assert.doesNotThrow(()=>partial.dispose());assert.doesNotThrow(()=>partial.dispose());
});
