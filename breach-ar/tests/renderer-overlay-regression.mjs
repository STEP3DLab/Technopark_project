// Optional native pixel-test dependency: @napi-rs/canvas.
// The engine and application suites remain dependency-free apart from vendored Three.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as THREE from '../vendor/three.module.js';
import {CanvasRenderer} from '../canvas-renderer.js';
import {fixture,firstOffer} from './engine-v2-helpers.mjs';

const require=createRequire(import.meta.url);
globalThis.cancelAnimationFrame??=()=>{}; // No animation loop is started by this pixel-only Node test.
let createCanvas;
try {({createCanvas}=require('@napi-rs/canvas'));}
catch {console.error('Pixel regression requires @napi-rs/canvas. Install that optional test dependency before running this file.');process.exit(2);}

const results=[];
const name='Actual temporal shard and contrast backplate render above a nearer opaque enemy while ordinary depth ordering stays intact';
let game,renderer;
try {
  game=fixture({seed:'rift-overlay-pixels',difficulty:'hard'});game.start();
  for(let i=0;i<180*60&&game.engine.getState().phase!=='lastchance';i++){
    const state=game.engine.getState();if(state.phase==='upgrade')game.engine.chooseUpgrade(firstOffer(state));game.step();
  }
  assert.equal(game.engine.getState().phase,'lastchance');
  const shard=game.engine.getEnemies().find(enemy=>enemy.kind==='shard'&&enemy.index===0);assert.ok(shard);
  game.aim(shard);
  const canvas=createCanvas(256,256);canvas.style={};renderer=new CanvasRenderer({canvas});renderer.setSize(256,256);renderer.setClearColor(0x000000,1);
  const scene=new THREE.Scene();scene.add(shard.mesh); // Use the engine's real geometry/materials, without changing gameplay state.
  const camera=game.camera;camera.aspect=1;camera.updateProjectionMatrix();
  const occluder=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0x00ffff}));
  occluder.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()),.7);occluder.quaternion.copy(camera.quaternion);scene.add(occluder);
  assert.ok(occluder.position.distanceTo(camera.position)<shard.mesh.position.distanceTo(camera.position));
  const pixel=(x=128,y=128)=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data);
  const isCyan=p=>p[0]<5&&p[1]>250&&p[2]>250&&p[3]===255;
  const layers=shard.mesh.children.map(object=>({object,order:object.renderOrder}));
  for(const layer of layers)layer.object.renderOrder=0;
  renderer.render(scene,camera);const normalDepth=pixel();assert.ok(isCyan(normalDepth),'ordinary order-zero rendering must still show the nearest opaque occluder');
  for(const layer of layers)layer.object.renderOrder=layer.order;
  renderer.render(scene,camera);const holographicShard=pixel();assert.ok(holographicShard[0]>180&&holographicShard[2]>200&&holographicShard[3]===255,'the farther lavender shard must visibly replace the cyan center pixel');assert.ok(!isCyan(holographicShard));
  if(process.env.BREACH_QA_IMAGE)fs.writeFileSync(process.env.BREACH_QA_IMAGE,canvas.toBuffer('image/png'));
  for(const child of shard.mesh.children)if(child.name!=='rift-backplate')child.visible=false;
  renderer.render(scene,camera);const backplateCenter=pixel(),backplate=pixel(146,133),outside=pixel(8,8);
  // The disk center is the antialiased meeting point of its triangle fan.
  // Inspect an interior point for opacity, while the actual shard center above
  // remains the primary visibility gate and never permits the cyan occluder.
  assert.ok(backplate[0]<50&&backplate[1]<60&&backplate[2]<80&&backplate[3]===255,`the actual dark backplate interior must cover the foreground cyan enemy: ${JSON.stringify(backplate)}`);assert.ok(isCyan(outside),'the foreground enemy must remain visible outside the shard backplate');
  results.push({name,pass:true,detail:{ordinaryDepthCenterRGBA:normalDepth,holographicShardCenterRGBA:holographicShard,backplateInteriorRGBA:backplate,backplateCenterRGBA:backplateCenter,outsideBackplateRGBA:outside}});
  occluder.geometry.dispose();occluder.material.dispose();
} catch(error) {results.push({name,pass:false,error:error.stack});}
finally {game?.dispose();renderer?.dispose();}
const report={scope:'CanvasRenderer actual native pixel output',results,passed:results.filter(x=>x.pass).length,total:results.length};
if(process.env.BREACH_QA_REPORT)fs.writeFileSync(process.env.BREACH_QA_REPORT,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(results.some(x=>!x.pass))process.exitCode=1;
