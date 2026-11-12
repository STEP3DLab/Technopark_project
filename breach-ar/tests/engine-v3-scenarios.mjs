import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {fixture, runBot, firstOffer} from './engine-v2-helpers.mjs';

const results = [];
function test(name, fn) {
  try { results.push({name, pass:true, detail:fn()}); }
  catch (error) { results.push({name, pass:false, error:error.stack}); }
}
function aimPoint(f, point) {f.camera.lookAt(point); f.camera.updateMatrixWorld(true);}
function until(f, predicate, seconds = 180) {
  for (let i=0; i<Math.ceil(seconds*60); i++) {
    const s=f.engine.getState();
    if(predicate(s)) return s;
    if(s.phase==='upgrade') assert.ok(f.engine.chooseUpgrade(firstOffer(s)));
    f.step();
  }
  assert.fail(`Condition not reached after ${seconds} simulated seconds (phase ${f.engine.getState().phase})`);
}
function openPortal(f) {
  f.advance(.85);
  const enemy=f.engine.getEnemies().find(e=>e.kind!=='projectile'&&e.kind!=='shard');
  assert.ok(enemy);
  const portals=f.engine.getPortals();
  const portal=portals.slice().sort((a,b)=>b.position.distanceTo(enemy.spawnPosition)-a.position.distanceTo(enemy.spawnPosition))[0];
  assert.ok(portal.position.distanceTo(enemy.spawnPosition)>1);
  aimPoint(f,portal.position);f.step();
  assert.ok(f.engine.getState().portalTarget?.capturable,'empty portal must be a capturable aim target');
  return portal;
}
function portalBurst(f, portal, count = 6) {
  for(let i=0;i<count;i++) {
    aimPoint(f,portal.position);
    assert.equal(f.engine.fire(),true,`portal shot ${i+1} accepted`);
    if(i<count-1) f.advance(.17);
  }
}
function triggerLastChance(f) {
  const s=until(f,s=>s.phase==='lastchance'||s.phase==='gameover');
  assert.equal(s.phase,'lastchance','first natural lethal hit must open the rescue phase');
  return s;
}
function collectShards(f) {
  for(let i=0;i<3;i++) {
    const shard=f.engine.getEnemies().find(e=>e.kind==='shard');
    assert.ok(shard,`shard ${i+1} available`);
    f.aim(shard);f.step();
    assert.equal(f.engine.fire(),true,`shard ${i+1} shot accepted`);
    if(i<2)f.advance(.17);
  }
}

test('Six unobstructed portal shots capture once and do not inflate combat accuracy',()=>{
  const f=fixture({seed:'portal-six',difficulty:'normal',radius:7});f.start();const portal=openPortal(f);const before=f.engine.getState();
  portalBurst(f,portal,5);
  let s=f.engine.getState();assert.equal(s.portalCaptures,0);assert.ok(s.portalTarget.progress>0&&s.portalTarget.progress<1);
  f.advance(.17);aimPoint(f,portal.position);assert.ok(f.engine.fire());s=f.engine.getState();
  assert.equal(s.portalCaptures,1);assert.equal(s.portalShots-before.portalShots,6);assert.equal(s.shots,before.shots);assert.equal(s.hits,before.hits);assert.equal(s.accuracy,before.accuracy);
  assert.equal(s.portalCaptureReady,false);assert.ok(s.capturedPortal);assert.ok(s.capturedPortal.remaining>9.9&&s.capturedPortal.remaining<=10);assert.equal(s.capturedPortal.duration,10);
  assert.equal(f.events.filter(e=>e.type==='portalcaptured').length,1);
  const detail={portalShots:s.portalShots,combatShots:s.shots,duration:s.capturedPortal.duration};f.dispose();return detail;
});

test('An enemy in front of a portal receives the laser before portal capture can progress',()=>{
  const f=fixture({seed:'portal-occlusion',difficulty:'normal',radius:7});f.start();f.advance(.9);
  const enemy=f.engine.getEnemies()[0];assert.ok(enemy);const before=enemy.hp;
  const portal=f.engine.getPortals().slice().sort((a,b)=>a.position.distanceTo(enemy.spawnPosition)-b.position.distanceTo(enemy.spawnPosition))[0];
  aimPoint(f,portal.position);f.step();assert.ok(f.engine.fire());const s=f.engine.getState();
  assert.ok(enemy.hp<before);assert.equal(s.portalShots,0);assert.equal(s.portalCaptures,0);assert.equal(s.shots,1);assert.equal(s.hits,1);
  f.dispose();return{enemyHPBefore:before,enemyHPAfter:enemy.hp,portalShots:s.portalShots};
});

test('Unfinished portal capture decays after looking away and remains frozen on pause',()=>{
  const f=fixture({seed:'portal-decay',radius:7});f.start();const portal=openPortal(f);portalBurst(f,portal,2);
  const initial=f.engine.getState().portalTarget.progress;assert.ok(initial>0);
  f.engine.pause();const heldProgress=portal.captureProgress;f.advance(2);assert.equal(portal.captureProgress,heldProgress);assert.equal(f.engine.fire(),false);f.engine.resume();
  aimPoint(f,new THREE.Vector3(0,3,3));f.advance(1.5);aimPoint(f,portal.position);f.step();
  const after=f.engine.getState().portalTarget;assert.ok(after);assert.ok(after.progress<initial,'aim loss must reduce partial capture');
  const detail={before:initial,after:after.progress};f.dispose();return detail;
});

test('Allied portal damages enemies, redirects spawning, expires and renews capture allowance next wave',()=>{
  const f=fixture({seed:'portal-turret',difficulty:'easy',radius:7});f.start();const portal=openPortal(f);portalBurst(f,portal);
  const spawnCount=f.events.filter(e=>e.type==='spawn').length;
  f.engine.pause();const held=f.engine.getState().capturedPortal.remaining;f.advance(2);assert.equal(f.engine.getState().capturedPortal.remaining,held);f.engine.resume();
  f.advance(9.8);let s=f.engine.getState();assert.ok(s.capturedPortal&&s.capturedPortal.remaining>0);
  assert.ok(s.portalKills>0,'the turret must inflict real lethal damage');assert.ok(f.events.some(e=>e.type==='portalshot'));
  const redirected=f.events.filter(e=>e.type==='spawn').slice(spawnCount);assert.ok(redirected.length>0);assert.ok(redirected.every(e=>e.position.distanceTo(portal.position)>1),'captured portal cannot spawn enemies while an alternative exists');
  f.advance(.3);s=f.engine.getState();assert.equal(s.capturedPortal,null);assert.equal(s.portalCaptureReady,false);assert.equal(s.portalCaptures,1);assert.equal(f.events.filter(e=>e.type==='portalexpired').length,1);
  runBot(f,{stopOn:(_g,s)=>s.phase==='upgrade'});assert.equal(f.engine.getState().phase,'upgrade');assert.ok(f.engine.chooseUpgrade(firstOffer(f.engine.getState())));
  until(f,s=>s.wave===2,5);assert.equal(f.engine.getState().portalCaptureReady,true);assert.equal(f.engine.getState().portalCaptures,1);
  const detail={portalKills:s.portalKills,redirectedSpawns:redirected.length,captureLifetime:10};f.dispose();return detail;
});

test('A single captured portal still spawns delayed threats instead of deadlocking the wave',()=>{
  const f=fixture({seed:'one-portal',difficulty:'easy',portals:[new THREE.Vector3(0,0,-7)]});f.start();f.advance(.85);const enemy=f.engine.getEnemies()[0];
  for(let i=0;i<45;i++){f.aim(enemy);f.step();}assert.ok(f.engine.getState().criticalReady);assert.ok(f.engine.fire());assert.ok(!f.engine.getEnemies().includes(enemy));
  f.advance(.17);const portal=f.engine.getPortals()[0];portalBurst(f,portal);assert.equal(f.engine.getState().portalCaptures,1);
  const s=until(f,s=>f.engine.getEnemies().some(e=>e.kind==='scout'),5);const next=f.engine.getEnemies().find(e=>e.kind==='scout');
  assert.ok(next.stun>0,'single-portal fallback emergence must be stunned');assert.equal(s.phase,'playing');
  const detail={newEnemy:next.id,stun:next.stun};f.dispose();return detail;
});

test('First lethal impact starts one last chance with three portrait-visible shards and no terminal event',()=>{
  const f=fixture({seed:'rift-geometry',difficulty:'hard'});f.start();f.camera.rotation.set(.21,.7,.13,'YXZ');f.camera.updateMatrixWorld();
  const s=triggerLastChance(f);assert.equal(s.shield,0);assert.equal(s.lastChance.active,true);assert.equal(s.lastChance.used,true);assert.equal(s.lastChance.total,3);assert.equal(s.lastChance.collected,0);assert.equal(s.lastChance.duration,5);assert.equal(s.timeScale,.12);
  assert.equal(f.engine.pulse(),false);assert.equal(f.events.filter(e=>e.type==='gameover').length,0);
  const shards=f.engine.getEnemies().filter(e=>e.kind==='shard');assert.equal(shards.length,3);
  const projected=shards.map(e=>e.mesh.position.clone().project(f.camera));
  assert.ok(shards.every(e=>e.hp===1));assert.ok(projected.every(p=>p.z>=-1&&p.z<=1&&Math.abs(p.x)<.92&&Math.abs(p.y)<.92),'all shards must fit a portrait camera, including rolled aim');
  for(const shard of shards){
    const layers=['rift-backplate','rift-body','rift-ring','rift-glow'].map(name=>shard.mesh.getObjectByName(name));
    assert.ok(layers.every(Boolean),'each shard needs a contrast backplate and complete holographic layers');
    for(const layer of layers){assert.ok(layer.renderOrder>=100);assert.equal(layer.material.transparent,true);assert.equal(layer.material.depthTest,false);assert.equal(layer.material.depthWrite,false);assert.equal(layer.material.fog,false);}
    assert.ok(layers[0].renderOrder<layers[1].renderOrder,'the body must draw above its dark backplate');
    assert.ok(layers[0].material.opacity>=.9,'the backplate must provide contrast against close enemies');
  }
  f.dispose();return{shards:shards.length,projected:projected.map(p=>p.toArray()),remaining:s.lastChance.remaining,holographicLayersPerShard:4};
});

test('Last chance advances real countdown, slows the world, freezes on pause, and rescues with three full-speed shots',()=>{
  const f=fixture({seed:'rift-save',difficulty:'normal'});f.start();const initial=triggerLastChance(f);
  const enemy=f.engine.getEnemies().find(e=>!['shard','projectile'].includes(e.kind));assert.ok(enemy);const age=enemy.age,spawnCount=f.events.filter(e=>e.type==='spawn').length;
  f.advance(1);let s=f.engine.getState();const worldAgeDelta=enemy.age-age;assert.ok(Math.abs((initial.lastChance.remaining-s.lastChance.remaining)-1)<.03);assert.ok(Math.abs(worldAgeDelta-.12)<.02);assert.equal(f.events.filter(e=>e.type==='spawn').length,spawnCount);
  f.engine.pause();const paused=structuredClone(f.engine.getState());f.advance(3);assert.equal(f.engine.getState().phase,'paused');assert.equal(f.engine.getState().lastChance.remaining,paused.lastChance.remaining);assert.equal(f.engine.getState().elapsed,paused.elapsed);assert.equal(f.engine.fire(),false);assert.equal(f.engine.pulse(),false);f.engine.resume();assert.equal(f.engine.getState().phase,'lastchance');
  const start=f.clock;collectShards(f);s=f.engine.getState();assert.equal(s.phase,'playing');assert.equal(s.shield,35);assert.equal(s.heat,0);assert.equal(s.lastChance.active,false);assert.equal(s.lastChance.used,true);assert.equal(s.riftSaves,1);assert.equal(s.timeScale,1);assert.equal(s.projectiles,0);assert.ok(!f.engine.getEnemies().some(e=>e.kind==='shard'));
  const shotWindow=f.clock-start;assert.ok(f.engine.getEnemies().filter(e=>e.kind!=='projectile').every(e=>e.stun>=1.9));assert.ok(shotWindow<.6,'weapon cooldown must stay full speed during the slowdown');
  f.advance(1.8);assert.equal(f.engine.getState().shield,35);until(f,s=>s.phase==='gameover',240);assert.equal(f.engine.getState().riftSaves,1);assert.equal(f.events.filter(e=>e.type==='gameover').length,1);
  f.dispose();return{worldAgeDelta,shotWindow,saves:s.riftSaves,shieldAfterRescue:s.shield};
});

test('Ignoring the temporal shards expires after five combat seconds and emits defeat once',()=>{
  const f=fixture({seed:'rift-expiry',difficulty:'normal'});f.start();triggerLastChance(f);const start=f.clock;
  f.advance(4.8);assert.equal(f.engine.getState().phase,'lastchance');f.advance(.3);assert.equal(f.engine.getState().phase,'gameover');
  const elapsed=f.engine.getState().elapsed;f.advance(5);assert.equal(f.engine.getState().elapsed,elapsed);assert.equal(f.engine.fire(),false);assert.equal(f.engine.pulse(),false);assert.equal(f.events.filter(e=>e.type==='gameover').length,1);
  const detail={observedExpiryWindow:5.1,elapsedFromTrigger:f.clock-start-5};f.dispose();return detail;
});

test('Restart clears captured portals, temporal state and new score counters without scene leaks',()=>{
  const f=fixture({seed:'v3-reset',difficulty:'normal',radius:7});f.start();const portal=openPortal(f);portalBurst(f,portal);triggerLastChance(f);collectShards(f);
  assert.equal(f.engine.getState().riftSaves,1);assert.ok(f.engine.getState().portalCaptures>=1);f.start({seed:'fresh-v3'});const s=f.engine.getState();
  for(const key of ['portalCaptures','portalKills','portalShots','riftSaves'])assert.equal(s[key],0,`${key} resets`);
  assert.equal(s.capturedPortal,null);assert.equal(s.portalCaptureReady,true);assert.equal(s.lastChance.active,false);assert.equal(s.lastChance.used,false);assert.equal(s.lastChance.collected,0);assert.equal(s.timeScale,1);assert.equal(s.shield,100);
  for(let n=0;n<8;n++){f.start();f.advance(.85);f.engine.stop();assert.equal(f.engine.getEnemies().length,0);assert.equal(f.engine.getPortals().length,0);}
  assert.equal(f.scene.children.length,1);f.dispose();assert.equal(f.scene.children.length,0);return{restartCycles:8};
});

const report={engineVersion:'v3',results,passed:results.filter(x=>x.pass).length,total:results.length};
if(process.env.BREACH_QA_REPORT)fs.writeFileSync(process.env.BREACH_QA_REPORT,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(results.some(x=>!x.pass))process.exitCode=1;
