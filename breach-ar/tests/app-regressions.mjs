import assert from 'node:assert/strict';
import fs from 'node:fs';
import {appFixture,deferred,flush} from './app-runtime-harness.mjs';
import {fixture,firstOffer} from './engine-v2-helpers.mjs';

const results=[];
async function test(name,fn){try{results.push({name,pass:true,detail:await fn()});}catch(error){results.push({name,pass:false,error:error.stack});}}
function makeStream(label){const track={label,stops:0,readyState:'live',stop(){this.stops++;this.readyState='ended';}};return{label,track,getTracks(){return[track]},getVideoTracks(){return[track]}};}
function makeSession(label,hit){const listeners={};return{label,visibilityState:'visible',ends:0,addEventListener(name,fn){listeners[name]=fn},requestReferenceSpace:async()=>({}),requestHitTestSource:()=>hit,end:async function(){this.ends++;listeners.end?.({target:this})}};}

await test('Cancelled camera rejection cannot stop the replacement stream',async()=>{
  const a=deferred(),b=deferred();let calls=0;
  const f=appFixture({navigator:{mediaDevices:{getUserMedia:()=>++calls===1?a.promise:b.promise}}});
  const first=f.app.startCamera();await f.app.home();const second=f.app.startCamera();const stream=makeStream('second');b.resolve(stream);await second;
  assert.equal(f.app.stream,stream);a.reject(Object.assign(new Error('Old request denied'),{name:'NotAllowedError'}));await first;
  assert.equal(f.app.stream,stream);assert.equal(stream.track.stops,0);assert.equal(f.get('camera-feed').srcObject,stream);assert.equal(f.app.state.stage,'setup');assert.equal(f.get('error-dialog').hidden,true);
  return{replacementStops:stream.track.stops};
});

await test('Cancelled video playback continuation releases only its own stream',async()=>{
  const pendingPlay=deferred();let plays=0,calls=0;const oldStream=makeStream('old'),newStream=makeStream('new');
  const f=appFixture({navigator:{mediaDevices:{getUserMedia:async()=>++calls===1?oldStream:newStream}},play:()=>++plays===1?pendingPlay.promise:Promise.resolve()});
  const first=f.app.startCamera();await flush();await f.app.home();await f.app.startCamera();pendingPlay.resolve();await first;
  assert.equal(f.app.stream,newStream);assert.equal(newStream.track.stops,0);assert.ok(oldStream.track.stops>=1);assert.equal(f.get('camera-feed').srcObject,newStream);
  return{oldStreamReleased:oldStream.track.stops>0,replacementStops:newStream.track.stops};
});

await test('Late camera acquisition after cancellation is released without replacing a newer stream',async()=>{
  const oldRequest=deferred(),oldStream=makeStream('old'),newStream=makeStream('new');let calls=0;
  const f=appFixture({navigator:{mediaDevices:{getUserMedia:()=>++calls===1?oldRequest.promise:Promise.resolve(newStream)}}});
  const first=f.app.startCamera();await f.app.home();await f.app.startCamera();oldRequest.resolve(oldStream);await first;
  assert.equal(f.app.stream,newStream);assert.equal(oldStream.track.stops,1);assert.equal(newStream.track.stops,0);return{oldStreamStops:oldStream.track.stops};
});

await test('Obsolete XR hit-test resolution is cancelled and cannot overwrite the active session source',async()=>{
  const pending=deferred(),sourceA={label:'A',cancels:0,cancel(){this.cancels++}},sourceB={label:'B',cancels:0,cancel(){this.cancels++}};let calls=0;
  const sessionA=makeSession('A',pending.promise),sessionB=makeSession('B',Promise.resolve(sourceB));
  const f=appFixture({navigator:{xr:{isSessionSupported:async()=>true,requestSession:async()=>++calls===1?sessionA:sessionB}}});
  const first=f.app.startAR();await flush();await f.app.home();await f.app.startAR();pending.resolve(sourceA);await first;
  assert.equal(f.app.session,sessionB);assert.equal(f.app.hitSource,sourceB);assert.equal(sourceA.cancels,1);assert.equal(sourceB.cancels,0);assert.equal(f.app.state.stage,'setup');
  return{activeSession:f.app.session.label,activeSource:f.app.hitSource.label,cancelledOldSource:sourceA.cancels};
});

await test('An XR session ending during initialization leaves a usable lobby',async()=>{
  const pending=deferred(),session=makeSession('A',Promise.resolve({cancel(){}}));
  const f=appFixture({navigator:{xr:{isSessionSupported:async()=>true,requestSession:async()=>session}}});f.renderer.xr.setSession=()=>pending.promise;
  const launch=f.app.startAR();await flush();await session.end();pending.resolve();await launch;
  assert.equal(f.app.session,null);assert.equal(f.app.state.stage,'lobby');assert.equal(f.app.state.busy,false);assert.equal(f.get('start-demo').disabled,false);
  return{stage:f.app.state.stage,busy:f.app.state.busy};
});

await test('Pending wake lock is deduplicated and released when its run ends',async()=>{
  const pending=deferred();let calls=0;const lock={releases:0,release(){this.releases++;return Promise.resolve()},addEventListener(){}};
  const f=appFixture({navigator:{wakeLock:{request:()=>{calls++;return pending.promise;}}}});Object.assign(f.app.state,{mode:'demo',stage:'playing'});
  const a=f.app.requestWakeLock(),b=f.app.requestWakeLock();assert.equal(calls,1);await f.app.home();pending.resolve(lock);await Promise.all([a,b]);assert.equal(lock.releases,1);assert.equal(f.app.state.stage,'lobby');
  return{requests:calls,releases:lock.releases};
});

await test('Active frame histories preserve elapsed time at 20, 5, 3.125 and 2 FPS',async()=>{
  const details=[];
  for(const frameMs of [50,200,320,500]){
    const f=appFixture();Object.assign(f.app.state,{mode:'demo',stage:'playing'});f.app.setClock(1000);
    for(let i=1;i<=20;i++){f.setTime(1000+i*frameMs);f.app.frame(1000+i*frameMs);}
    const wall=frameMs*20/1000;assert.ok(Math.abs(f.engine.elapsed-wall)<1e-9);assert.equal(f.app.state.stage,'playing');details.push({frameMs,wallSeconds:wall,simulationSeconds:f.engine.elapsed});
  }
  return details;
});

await test('Intermission uses full 500 ms frames and pause/resume never catches up hidden time',async()=>{
  const f=appFixture();Object.assign(f.app.state,{mode:'demo',stage:'playing'});f.engine.phase='intermission';f.engine.intermission=3.2;
  f.engine.update=function(dt){this.elapsed+=dt;this.intermission=Math.max(0,this.intermission-dt);};
  f.app.setClock(1000);for(let i=1;i<=6;i++)f.app.frame(1000+i*500);
  assert.ok(Math.abs(f.engine.elapsed-3)<1e-9);assert.ok(Math.abs(f.engine.intermission-.2)<1e-9);
  f.app.pauseGame();const elapsed=f.engine.elapsed;f.app.frame(15000);assert.equal(f.engine.elapsed,elapsed);
  f.setTime(16000);f.app.resumeGame();f.app.frame(16020);assert.equal(f.engine.elapsed,elapsed);f.app.frame(16120);assert.ok(Math.abs(f.engine.elapsed-elapsed-.1)<1e-9);
  return{remainingAfter3Seconds:.2,resumeAdvance:f.engine.elapsed-elapsed};
});

await test('A browser suspension over two seconds pauses combat and advances no game time',async()=>{
  const f=appFixture();Object.assign(f.app.state,{mode:'demo',stage:'playing',firing:true});f.app.setClock(1000);f.app.frame(3501);
  assert.equal(f.app.state.stage,'paused');assert.equal(f.engine.phase,'paused');assert.equal(f.app.state.firing,false);assert.equal(f.engine.elapsed,0);assert.equal(f.get('pause-dialog').hidden,false);
  return{stage:f.app.state.stage,simulationSeconds:f.engine.elapsed};
});

await test('Held gameplay Space cannot activate the first upgrade and release restores fresh keyboard input',async()=>{
  const f=appFixture();f.app.bindInput();Object.assign(f.app.state,{mode:'demo',stage:'playing'});
  const down=f.document.dispatch('keydown',{code:'Space',repeat:false});assert.equal(down.defaultPrevented,true);assert.equal(f.app.state.firing,true);
  f.app.showUpgrades({offers:[{id:'cooling',title:'Cooling',description:'cooling',stat:'+30%'}]});
  const repeat=f.document.dispatch('keydown',{code:'Space',repeat:true}),release=f.document.dispatch('keyup',{code:'Space'});
  assert.equal(repeat.defaultPrevented,true);assert.equal(release.defaultPrevented,true);assert.equal(f.app.state.stage,'upgrade');assert.equal(f.app.state.firing,false);
  const fresh=f.document.dispatch('keydown',{code:'Space',repeat:false});assert.equal(fresh.defaultPrevented,false,'an intentional fresh keyboard activation must remain available on the upgrade button');
  return{repeatPrevented:repeat.defaultPrevented,releasePrevented:release.defaultPrevented,freshActivationAllowed:!fresh.defaultPrevented};
});

await test('Secondary surface pointers cannot move or release the primary aim gesture',async()=>{
  const f=appFixture();f.app.bindInput();Object.assign(f.app.state,{mode:'demo',stage:'playing'});const surface=f.get('scene');
  surface.dispatch('pointerdown',{pointerId:1,pointerType:'touch',button:0,clientX:100,clientY:100});
  surface.dispatch('pointermove',{pointerId:2,pointerType:'touch',clientX:400,clientY:500});assert.equal(f.app.touchAim.targetYaw,0);assert.equal(f.app.touchAim.targetPitch,0);
  surface.dispatch('pointerup',{pointerId:2});assert.equal(f.engine.shots,0);surface.dispatch('pointerup',{pointerId:1});assert.equal(f.engine.shots,1);
  return{acceptedShots:f.engine.shots};
});

await test('All literal app DOM references have one matching element in the shipped HTML',async()=>{
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]),used=[...new Set([...app.matchAll(/\$\(\s*["']([^"']+)["']\s*\)/g)].map(m=>m[1]))];
  for(const id of used)assert.equal(ids.filter(value=>value===id).length,1,`${id} must exist exactly once`);
  return{literalReferences:used.length,htmlIds:ids.length};
});

await test('Portal HUD follows actual capture progress and switches to the allied countdown',async()=>{
  const g=fixture({seed:'portal-hud',difficulty:'easy',radius:7});g.start();g.advance(.85);const enemy=g.engine.getEnemies()[0];
  const portal=g.engine.getPortals().slice().sort((a,b)=>b.position.distanceTo(enemy.spawnPosition)-a.position.distanceTo(enemy.spawnPosition))[0];
  const f=appFixture();f.app.resources({engine:g.engine,scene:g.scene,camera:g.camera});Object.assign(f.app.state,{mode:'demo',stage:'playing'});
  g.camera.lookAt(portal.position);g.camera.updateMatrixWorld();g.step();
  for(let i=0;i<2;i++){assert.ok(g.engine.fire());g.advance(.17);}
  f.app.onStats(g.engine.getState());assert.equal(f.get('portal-status').hidden,false);assert.match(f.get('portal-status-detail').textContent,/2 \/ 6/);assert.equal(f.get('fire-button').disabled,false);assert.ok(Math.abs(parseFloat(f.get('portal-progress').style.width)-100/3)<.01);
  for(let i=0;i<4;i++){assert.ok(g.engine.fire());if(i<3)g.advance(.17);}
  f.setTime(1200);f.app.onStats(g.engine.getState());assert.equal(f.get('portal-status').hidden,false);assert.match(f.get('portal-status-title').textContent,/СОЮЗНИК/);assert.match(f.get('portal-status-detail').textContent,/10 с/);assert.equal(f.get('portal-budget').classList.contains('used'),true);
  const detail={progressLabel:'2 / 6',alliedCountdown:f.get('portal-status-detail').textContent};g.dispose();return detail;
});

await test('Temporal HUD keeps laser usable, blocks EMP, and clears correctly across pause, home and restart',async()=>{
  const g=fixture({seed:'rift-hud',difficulty:'hard'});g.start();
  for(let i=0;i<180*60&&g.engine.getState().phase!=='lastchance';i++){const s=g.engine.getState();if(s.phase==='upgrade')g.engine.chooseUpgrade(firstOffer(s));g.step();}
  assert.equal(g.engine.getState().phase,'lastchance');
  const f=appFixture();f.app.resources({engine:g.engine,scene:g.scene,camera:g.camera});Object.assign(f.app.state,{mode:'demo',stage:'playing'});f.app.bindInput();
  g.engine.onUpdate=stats=>f.app.onStats(stats);f.app.onStats(g.engine.getState());
  assert.equal(f.get('fire-button').disabled,false);assert.equal(f.get('pulse-button').disabled,true);assert.equal(f.get('rift-hud').hidden,false);assert.equal(f.document.body.classList.contains('rift-active'),true);assert.equal(f.get('rift-count').textContent,'0 / 3');
  const shard=g.engine.getEnemies().find(e=>e.kind==='shard');g.aim(shard);g.step();f.get('fire-button').dispatch('pointerdown',{pointerId:1,button:0});f.get('fire-button').dispatch('pointerup',{pointerId:1});assert.equal(g.engine.getState().lastChance.collected,1);
  f.app.pauseGame();assert.equal(g.engine.getState().phase,'paused');assert.equal(f.get('rift-hud').hidden,true);assert.equal(f.get('fire-button').disabled,true);
  f.app.resumeGame();assert.equal(g.engine.getState().phase,'lastchance');assert.equal(f.get('rift-hud').hidden,false);assert.equal(f.get('fire-button').disabled,false);
  await f.app.home();assert.equal(f.get('rift-hud').hidden,true);assert.equal(f.document.body.classList.contains('rift-active'),false);await f.app.startDemo();
  assert.equal(g.engine.getState().lastChance.used,false);assert.equal(f.get('rift-hud').hidden,true);assert.equal(f.document.body.classList.contains('rift-active'),false);assert.equal(f.get('fire-button').disabled,false);
  g.dispose();return{laserCollectedShard:true,empBlocked:true,resetClean:true};
});

await test('Graphics context loss cannot resume behind its error and restoration permits manual resume',async()=>{
  const f=appFixture();f.app.bindInput();Object.assign(f.app.state,{mode:'demo',stage:'playing'});f.app.setClock(1000);
  f.get('scene').dispatch('webglcontextlost');assert.equal(f.app.state.stage,'paused');assert.equal(f.get('error-dialog').hidden,false);
  f.document.dispatch('keydown',{code:'Escape',repeat:false});assert.equal(f.app.state.stage,'paused');f.get('error-close').dispatch('click');f.app.resumeGame();
  assert.equal(f.app.state.stage,'paused');f.app.frame(1200);assert.equal(f.engine.elapsed,0);
  f.get('scene').dispatch('webglcontextrestored');f.app.resumeGame();assert.equal(f.app.state.stage,'playing');f.app.frame(1400);f.app.frame(1500);assert.ok(Math.abs(f.engine.elapsed-.1)<1e-9);
  return{pausedUntilRestore:true,resumeAdvance:f.engine.elapsed};
});

const report={scope:'actual app functions with controlled browser services',results,passed:results.filter(x=>x.pass).length,total:results.length};
if(process.env.BREACH_QA_REPORT)fs.writeFileSync(process.env.BREACH_QA_REPORT,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(results.some(x=>!x.pass))process.exitCode=1;
