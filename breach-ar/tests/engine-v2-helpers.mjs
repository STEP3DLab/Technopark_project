import * as THREE from '../vendor/three.module.js';
import {GameEngine} from '../engine.js';

export function fixture({seed='breach-qa-2026',difficulty='normal',radius=3.8,portals}={}) {
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(64,9/16,.05,100);
  camera.position.set(0,0,0);camera.lookAt(0,0,-1);camera.updateMatrixWorld(true);
  const events=[];let clock=0;
  const engine=new GameEngine({scene,camera,renderer:{xr:{isPresenting:false}},onUpdate:()=>{},onEvent:event=>events.push(event)});
  const points=portals||[-.48,0,.48].map(a=>new THREE.Vector3(Math.sin(a)*radius,0,-Math.cos(a)*radius));
  const start=(extra={})=>engine.start({mode:'demo',difficulty,seed,portals:points,...extra});
  const step=(dt=1/60)=>{clock+=dt;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);engine.update(dt,clock);scene.updateMatrixWorld(true);};
  const advance=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)step();};
  const targetPoint=(enemy,weakpoint=true)=>{
    scene.updateMatrixWorld(true);
    const core=weakpoint&&enemy.mesh.getObjectByName('core');
    return (core||enemy.mesh).getWorldPosition(new THREE.Vector3());
  };
  const aim=(enemy,{weakpoint=true,yaw=0,pitch=0,bodyOffset=0}={})=>{
    const target=targetPoint(enemy,weakpoint);
    if(bodyOffset)target.add(new THREE.Vector3(bodyOffset,0,0).applyQuaternion(enemy.mesh.getWorldQuaternion(new THREE.Quaternion())));
    const direction=target.sub(camera.position).normalize();
    if(yaw)direction.applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
    if(pitch){const right=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();direction.applyAxisAngle(right,pitch);}
    camera.lookAt(camera.position.clone().add(direction));camera.updateMatrixWorld(true);
  };
  return{scene,camera,engine,events,start,step,advance,aim,targetPoint,get clock(){return clock;},dispose(){engine.dispose();}};
}

export function offersOf(state){return state.upgradeOffers||state.offers||[];}
export function offerId(offer){return typeof offer==='string'?offer:offer.id;}
export function firstOffer(state){return offerId(offersOf(state)[0]);}
export function snapshot(f){const s=f.engine.getState();return{score:s.score,wave:s.wave,phase:s.phase,shield:s.shield,heat:Math.round(s.heat*1000)/1000,elapsed:Math.round(s.elapsed*1000)/1000,offers:offersOf(s).map(offerId),enemies:f.engine.getEnemies().map(e=>({id:e.id,kind:e.kind,hp:e.hp,action:e.actionPhase,pos:e.mesh.position.toArray().map(v=>Math.round(v*1e5)/1e5)}))};}

/** Plays through public API only. Does not mutate health, waves, timers or enemy positions. */
export function runBot(f,{seconds=420,imperfect=false,stopOn,upgradeChoice,shoot=true,usePulse=true,focusBoss=true,rate=.19}={}){
  let targetId=null,reaction=0,nextShot=0,frames=0,cooling=false;const startClock=f.clock;
  const choices=[];const observedKinds=new Set();const shieldByWave={};
  while(f.clock-startClock<seconds){
    const s=f.engine.getState();
    if(stopOn?.(f,s))break;
    if(s.phase==='victory'||s.phase==='gameover')break;
    if(s.phase==='upgrade'){
      const offer=upgradeChoice?.(s,choices)||firstOffer(s);
      if(!offer)throw new Error('Upgrade phase has no offers');
      const accepted=f.engine.chooseUpgrade(offer);
      if(!accepted)throw new Error(`Offered upgrade rejected: ${offer}`);
      choices.push(offer);targetId=null;
    }
    const enemies=f.engine.getEnemies();
    enemies.forEach(e=>observedKinds.add(e.kind));
    let target=enemies.find(e=>e.id===targetId);
    const danger=enemies.filter(e=>e.kind==='projectile').sort((a,b)=>a.mesh.position.length()-b.mesh.position.length())[0];
    if(danger&&danger.mesh.position.distanceTo(f.camera.position)<3.4)target=danger;
    if(!target){target=enemies.slice().sort((a,b)=>a.mesh.position.distanceTo(f.camera.position)-b.mesh.position.distanceTo(f.camera.position))[0];}
    if(target&&target.id!==targetId){targetId=target.id;reaction=imperfect?.25:0;}
    reaction=Math.max(0,reaction-1/60);
    if(target&&reaction<=0){
      const t=f.clock;
      const jitter=imperfect?THREE.MathUtils.degToRad(2.2):0;
      const occasionalMiss=imperfect&&Math.floor(t*.9)%9===5?THREE.MathUtils.degToRad(7):0;
      f.aim(target,{yaw:Math.sin(t*6.7)*jitter+occasionalMiss,pitch:Math.sin(t*4.9)*jitter*.65});
      if(s.heat>=82)cooling=true;if(s.heat<=28)cooling=false;
      const focusWait=focusBoss&&target.kind==='boss'&&!imperfect&&!s.criticalReady;
      if(shoot&&!cooling&&!focusWait&&t>=nextShot){f.engine.fire();nextShot=t+(imperfect?rate:.13);}
    }
    if(usePulse&&s.pulseCharge>=100&&(s.shield<50||enemies.filter(e=>e.kind!=='boss').length>=4))f.engine.pulse();
    shieldByWave[s.wave]=s.shield;
    f.step();frames++;
  }
  const s=f.engine.getState();return{phase:s.phase,wave:s.wave,score:s.score,kills:s.kills,shield:s.shield,elapsed:s.elapsed,accuracy:s.accuracy,shots:s.shots,choices,observedKinds:[...observedKinds],shieldByWave,terminalEvents:f.events.filter(e=>e.type==='gameover').length,overheats:f.events.filter(e=>e.type==='overheat').length,frames};
}
