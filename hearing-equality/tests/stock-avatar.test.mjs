import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../app/vendor/three.module.min.js';
import {parseStockRig} from '../app/stock-rig.js';
import {prepareStockMotion,applyStockMotion,relaxStockRig} from '../app/stock-motion.js';
import {Software3DRenderer} from '../app/software-3d.js';
const bytes=readFileSync(new URL('../app/assets/models/quaternius-communicator.glb',import.meta.url));
const makeRig=()=>parseStockRig(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const manifest=JSON.parse(readFileSync(new URL('../app/assets/sources/slovo-sources.json',import.meta.url)));
const motions=manifest.samples.map(s=>JSON.parse(readFileSync(new URL('../app/assets/motion/'+s.file.replace('.mp4','.json'),import.meta.url))));

test('downloaded GLB has a complete 65-bone skin, all ten finger chains and a valid bind pose',async()=>{
 const rig=await makeRig();assert.equal(rig.bones.length,65);assert.ok(bytes.length<1300000);
 for(const side of ['Left','Right']){assert.equal(rig.fingers[side].length,5);assert.equal(rig.handMeshes[side].length,1);for(const finger of rig.fingers[side])assert.equal(finger.chain.length,4);}
 for(const mesh of rig.meshes){const g=mesh.geometry;
  for(let i=0;i<g.attributes.position.count;i++){
   const weights=g.attributes.skinWeight.array.slice(i*4,i*4+4);assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-5);
   for(const index of g.attributes.skinIndex.array.slice(i*4,i*4+4))assert.ok(index<65);
   const bind=new T.Vector3().fromBufferAttribute(g.attributes.position,i),skinned=mesh.getVertexPosition(i,new T.Vector3());assert.ok(bind.distanceTo(skinned)<1e-5,'Original skin and bind matrices agree');
  }
 }
 relaxStockRig(rig);rig.reset();for(const b of rig.bones)assert.deepEqual(b.quaternion.toArray(),rig.restRotations.get(b.name).toArray());rig.dispose();
});

test('all six stock animation tracks preserve source data and limb lengths at 60Hz, including reverse seeking',async()=>{
 const rig=await makeRig(),rest=new Map(rig.bones.map(b=>[b.name,b.position.clone()]));
 for(const motion of motions){const before=JSON.stringify(motion),track=prepareStockMotion(rig,motion);assert.strictEqual(prepareStockMotion(rig,motion),track);
  for(let time=0;time<motion.duration;time+=1/60){applyStockMotion(rig,track,time);for(const b of rig.bones){assert.ok(b.matrixWorld.elements.every(Number.isFinite));assert.ok(Math.abs(b.quaternion.length()-1)<1e-6);assert.ok(b.position.distanceTo(rest.get(b.name))<1e-10);}}
  applyStockMotion(rig,track,.35);const pose=rig.bones.map(b=>b.quaternion.toArray());applyStockMotion(rig,track,1.2);applyStockMotion(rig,track,.35);assert.deepEqual(rig.bones.map(b=>b.quaternion.toArray()),pose);
  assert.equal(JSON.stringify(motion),before);
 }
 rig.dispose();
});

test('two avatar instances use independent meshes and cached motion without corrupting one another',async()=>{
 const a=await makeRig(),b=await makeRig(),track=prepareStockMotion(a,motions[0]);
 assert.notEqual(a.meshes[0].geometry,b.meshes[0].geometry);assert.notEqual(a.meshes[0].material,b.meshes[0].material);
 applyStockMotion(a,track,.2);applyStockMotion(b,track,.8);const pose=a.bones.map(x=>x.quaternion.toArray());b.dispose();assert.deepEqual(a.bones.map(x=>x.quaternion.toArray()),pose);a.dispose();
});

test('missing hand observations hide only that hand and recover on a tracked frame',async()=>{
 const rig=await makeRig(),clip=structuredClone(motions.find(m=>m.frames.every(f=>f.left?.length===21&&f.right?.length===21)));
 assert.ok(clip);clip.frames[0].left=null;const track=prepareStockMotion(rig,clip,{smooth:false});
 applyStockMotion(rig,track,0);assert.equal(rig.handMeshes.Left[0].visible,false);assert.equal(rig.handMeshes.Right[0].visible,true);
 applyStockMotion(rig,track,3/clip.fps);assert.equal(rig.handMeshes.Left[0].visible,true);rig.dispose();
});

test('software fallback rasterizes the real stock mesh and responds to camera rotation',async()=>{
 const rig=await makeRig(),scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.05,30);scene.background=new T.Color(0x172942);scene.add(rig.group);
 const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};
 const renderer=new Software3DRenderer({getContext:()=>context});renderer.setSize(160,160);camera.position.set(0,1.34,1.88);camera.lookAt(0,1.34,0);
 applyStockMotion(rig,prepareStockMotion(rig,motions[0]),.5);renderer.render(scene,camera);const front=renderer.pixels.data.slice();assert.ok(renderer.depth.filter(Number.isFinite).length>1500);
 camera.position.set(.7,1.34,1.8);camera.lookAt(0,1.34,0);renderer.render(scene,camera);assert.notDeepEqual(renderer.pixels.data,front);renderer.dispose();rig.dispose();
});
