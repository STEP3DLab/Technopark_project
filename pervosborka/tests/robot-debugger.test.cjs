'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const debuggerModule=require('../dist/robot-debugger.js');
const E=require('../dist/engine.js');
const bank=require('../dist/bank.json');
const lab=bank.labs.find(item=>item.type==='robot');
const config=lab.config;
const solution=lab.solution.exampleCommands;
const {trace,restoreView,describe}=debuggerModule.logic;
const plain=value=>JSON.parse(JSON.stringify(value));
const final=model=>model.frames.at(-1);

function fakePanel(){
  const document={activeElement:null},listeners=new Map(),elements=new Map();
  const make=()=>({dataset:{},disabled:false,textContent:'',innerHTML:'',attributes:{},ownerDocument:document,setAttribute(name,value){this.attributes[name]=value;},focus(){document.activeElement=this;}});
  for(const name of ['position','count','commands','status'])elements.set('[data-rd-'+name+']',make());
  const buttons={};
  for(const name of ['reset','back','step','play']){
    const button=make();button.dataset.rdAction=name;button.closest=selector=>selector==='[data-rd-action]'?button:null;
    buttons[name]=button;elements.set('[data-rd-action="'+name+'"]',button);
  }
  const root={dataset:{},ownerDocument:document,matches:selector=>selector==='[data-robot-debugger]',querySelector:selector=>elements.get(selector)||null,contains:element=>[...elements.values()].includes(element),addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);}};
  return {root,document,buttons,listeners,elements,click(action){listeners.get('click')?.({target:buttons[action]});},read(name){return elements.get('[data-rd-'+name+']');}};
}
function runtime({reducedMotion=false}={}){
  const timers=new Map(),motionListeners=new Set(),delays=[];let timerId=0;
  const motion={matches:reducedMotion,addEventListener(type,fn){if(type==='change')motionListeners.add(fn);},removeEventListener(type,fn){if(type==='change')motionListeners.delete(fn);}};
  const environment={matchMedia:()=>motion,setTimeout(fn,delay){const id=++timerId;timers.set(id,fn);delays.push(delay);return id;},clearTimeout(id){timers.delete(id);}};
  Object.defineProperty(environment,'localStorage',{get(){throw new Error('The robot trial must not access persistent state.');}});
  const context={window:environment,module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/robot-debugger.js'),'utf8'),context);
  return {
    api:context.module.exports,timers,delays,motionListeners,
    tick(){const pending=timers.entries().next().value;if(!pending)return false;timers.delete(pending[0]);pending[1]();return true;},
    drain(){let count=0;while(this.tick()){count++;assert.ok(count<=110,'playback must be finite');}return count;},
    setMotion(value){motion.matches=value;for(const listener of [...motionListeners])listener();}
  };
}

test('An empty program has exactly one start frame and cannot invent success',()=>{
  const model=trace(config,[]),frame=final(model);
  assert.equal(model.frames.length,1);
  assert.deepEqual(frame.position,config.start);
  assert.deepEqual(frame.path,[config.start]);
  assert.equal(frame.status,'empty');
  assert.equal(frame.cursor,0);
  assert.equal(frame.attempted,0);
  assert.equal(frame.executed,0);
  assert.equal(frame.reached,false);
  assert.match(describe(frame,model.config),/Добавь команды/);
});

test('Every frame executes only its prefix, and complete paths agree with the grading engine',()=>{
  for(const commands of [solution,['U'],['R','U'],['L'],['U','U','R','R','D','L'],['U','D','U','D'],[...solution,'R'],[...solution,'L']]){
    const model=trace(config,commands),engine=E.robotPath(config,commands),frame=final(model);
    assert.deepEqual(frame.path,engine.path,commands.join(''));
    assert.deepEqual(frame.position,engine.end,commands.join(''));
    assert.equal(frame.atGoal,engine.reached);
    assert.equal(frame.status==='blocked',engine.collision||engine.invalid);
    assert.equal(frame.reached,engine.reached&&!engine.collision&&!engine.invalid);
    for(const step of model.frames){
      assert.equal(step.cursor,step.attempted);
      assert.equal(step.path.length,step.executed+1);
      assert.deepEqual(step.path,E.robotPath(config,commands.slice(0,step.attempted)).path);
    }
  }
  const model=trace(config,solution);
  assert.equal(model.frames.length,solution.length+1);
  assert.ok(model.frames.slice(0,-1).every(frame=>frame.reached===false));
  assert.equal(final(model).reached,true);
  assert.equal(final(model).reason,'goal');
});

test('Wall and boundary collisions preserve the previous position and identify the blocked command',()=>{
  const wall=final(trace(config,['U','R','U']));
  assert.equal(wall.status,'blocked');assert.equal(wall.reason,'wall');
  assert.equal(wall.attempted,2);assert.equal(wall.executed,1);
  assert.deepEqual(wall.position,[0,3]);assert.deepEqual(wall.attemptedCell,[1,3]);
  assert.deepEqual(wall.path,[[0,4],[0,3]]);
  assert.equal(wall.currentCommand,'R');assert.equal(wall.nextCommand,null);
  assert.match(describe(wall,config),/Команда 2: впереди стена/);
  const boundary=final(trace(config,['L','U']));
  assert.equal(boundary.reason,'boundary');assert.equal(boundary.executed,0);
  assert.deepEqual(boundary.position,config.start);assert.deepEqual(boundary.attemptedCell,[-1,4]);
  assert.match(describe(boundary,config),/за границу поля/);
});

test('Revisiting cells preserves the entire ordered route and never shortcuts the program',()=>{
  const commands=['U','D','U','D','U'],model=trace(config,commands);
  assert.deepEqual(final(model).path,[[0,4],[0,3],[0,4],[0,3],[0,4],[0,3]]);
  assert.equal(final(model).executed,5);
  assert.equal(final(model).status,'finished');assert.equal(final(model).reached,false);
});

test('Visiting the goal before the final command is not a completed safe program',()=>{
  const model=trace(config,[...solution,'R']),atGoal=model.frames[solution.length],collision=final(model);
  assert.equal(atGoal.atGoal,true);assert.equal(atGoal.reached,false);
  assert.match(describe(atGoal,config),/ещё есть команды/);
  assert.equal(collision.atGoal,true);assert.equal(collision.reached,false);
  assert.equal(collision.reason,'boundary');assert.equal(collision.executed,solution.length);
  assert.doesNotMatch(describe(collision,config),/Вся программа выполнена|робот у цели|достиг/);
  assert.equal(final(trace(config,[...solution,'L'])).reached,false);
});

test('Invalid or oversized programs stop explicitly without changing their commands',()=>{
  for(const command of ['?','__proto__','constructor','<img src=x onerror=alert(1)>']){
    const model=trace(config,['U',command,'U']),frame=final(model);
    assert.equal(frame.reason,'command');assert.equal(frame.attempted,2);assert.equal(frame.executed,1);
    assert.equal(model.commands[1],command);
  }
  const program=Array.from({length:15},(_,index)=>index%2?'D':'U'),before=program.slice();
  const model=trace(config,program);
  assert.equal(final(model).reason,'limit');assert.equal(final(model).attempted,15);assert.equal(final(model).executed,14);
  assert.deepEqual(program,before);
  assert.equal(trace(config,Array(10000).fill('U')).commands.length,101,'malformed callers cannot create an unbounded panel');
});

test('View restoration is serializable, exact-program dependent, bounded, and immune to obstacle ordering',()=>{
  const model=trace(config,solution),view=JSON.parse(JSON.stringify({signature:model.signature,cursor:3}));
  assert.equal(restoreView(model,view).cursor,3);
  assert.equal(restoreView(trace(config,solution.slice(0,-1)),view).cursor,0);
  assert.equal(restoreView(trace({...config,obstacles:[]},solution),view).cursor,0);
  assert.equal(restoreView(trace({...config,obstacles:[...config.obstacles].reverse()},solution),view).cursor,3);
  assert.equal(restoreView(model,{...view,cursor:999}).cursor,solution.length);
  assert.equal(restoreView(model,{...view,cursor:-7}).cursor,0);
  assert.equal(restoreView(model,{...view,cursor:1.5}).cursor,0);
});

test('Rendering keeps commands immutable, uses semantic controls, and safely rejects markup as a command',()=>{
  const draft=Object.freeze({commands:Object.freeze(['U','<script>alert(1)</script>','constructor'])});
  const before=JSON.stringify(draft),html=debuggerModule.html(lab,draft);
  assert.equal(JSON.stringify(draft),before);
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html,/aria-label="Ход испытания по командам"/);
  assert.equal((html.match(/<button type="button"/g)||[]).length,4);
  for(const action of ['reset','back','step','play'])assert.ok(html.includes('data-rd-action="'+action+'"'));
  assert.doesNotMatch(html,/<script|alert\(1\)|function Object|data-action="grade/);
});

test('Mounted stepping, back and reset update the same scene frame without mutating a draft',()=>{
  const env=runtime(),panel=fakePanel(),frames=[],program=Object.freeze(solution.slice());
  const controller=env.api.mount(panel.root,{config,commands:program,onFrame:frame=>frames.push(plain(frame))});
  assert.equal(frames.length,1);assert.equal(frames[0].cursor,0);
  panel.click('step');panel.click('step');
  assert.deepEqual(plain(controller.getFrame().position),[0,2]);
  assert.equal(controller.getFrame().cursor,2);
  assert.match(panel.read('commands').innerHTML,/is-done/);
  assert.match(panel.read('commands').innerHTML,/aria-current="step"/);
  panel.click('back');assert.deepEqual(plain(controller.getFrame().path),[[0,4],[0,3]]);
  panel.click('reset');assert.deepEqual(plain(controller.getFrame().position),config.start);
  assert.equal(controller.getFrame().cursor,0);assert.equal(env.timers.size,0);
  const copy=controller.getFrame();copy.path[0][0]=99;copy.position[0]=99;
  assert.deepEqual(plain(controller.getFrame().position),config.start,'callbacks and consumers cannot modify the trace');
  assert.deepEqual(program,solution);
  controller.destroy();
});

test('Playback starts at the current cursor, is finite, and requires an explicit reset to replay',async()=>{
  const env=runtime(),panel=fakePanel(),frames=[];
  const controller=env.api.mount(panel.root,{config,commands:solution,onFrame:frame=>frames.push(plain(frame))});
  controller.step();controller.step();const start=frames.length;
  const run=controller.play();assert.equal(env.timers.size,1);assert.equal(panel.buttons.play.textContent,'Пауза');
  assert.equal(env.drain(),solution.length-2);
  const result=await run;
  assert.equal(result.completed,true);assert.equal(result.frame.reached,true);assert.equal(env.timers.size,0);
  assert.deepEqual(frames.slice(start).map(frame=>frame.cursor),[2,3,4,5,6,7,8]);
  assert.equal((await controller.play()).reason,'already-ended');assert.equal(controller.getFrame().cursor,8);assert.equal(env.timers.size,0);
  controller.reset();assert.equal(controller.getFrame().cursor,0);assert.equal(panel.buttons.play.disabled,false);
  controller.destroy();
});

test('Collision playback stops at the first failure and restores focus to an available control',async()=>{
  const env=runtime(),panel=fakePanel();
  const controller=env.api.mount(panel.root,{config,commands:['U','R','U']});
  panel.buttons.play.focus();const run=controller.play();
  assert.equal(env.drain(),2);const result=await run;
  assert.equal(result.reason,'wall');assert.equal(result.frame.reached,false);
  assert.equal(controller.getFrame().cursor,2);assert.equal(env.timers.size,0);
  assert.equal(panel.buttons.step.disabled,true);assert.equal(panel.buttons.play.disabled,true);
  assert.equal(panel.document.activeElement,panel.buttons.reset);
  assert.match(panel.read('commands').innerHTML,/is-blocked/);assert.match(panel.read('status').textContent,/впереди стена/);
  controller.destroy();
});

test('Pause, changed programs and destroy resolve pending playback and leave no callbacks behind',async()=>{
  for(const action of ['pause','update','destroy']){
    const env=runtime(),panel=fakePanel(),frames=[];
    const controller=env.api.mount(panel.root,{config,commands:solution,onFrame:frame=>frames.push(plain(frame))});
    const pending=controller.play();env.tick();
    if(action==='update')controller.update({commands:['U','D']});else controller[action]();
    const result=await pending;
    assert.equal(result.completed,false);
    assert.equal(result.reason,{pause:'paused',update:'program-changed',destroy:'destroyed'}[action]);
    assert.equal(env.timers.size,0);const count=frames.length;env.drain();assert.equal(frames.length,count);
    if(action==='update')assert.equal(controller.getFrame().cursor,0);
    if(action==='destroy'){
      controller.step();controller.back();controller.reset();controller.update({commands:['U']});
      assert.equal((await controller.play()).reason,'destroyed');assert.equal(frames.length,count);
      assert.equal(panel.listeners.size,0);assert.equal(env.motionListeners.size,0);
    }else controller.destroy();
  }
});

test('Reduced motion completes the exact remaining program instantly with no background timer',async()=>{
  const env=runtime({reducedMotion:true}),panel=fakePanel();
  const controller=env.api.mount(panel.root,{config,commands:[...solution,'R']});
  controller.step();const result=await controller.play();
  assert.equal(result.frame.cursor,9);assert.equal(result.frame.reason,'boundary');assert.equal(result.frame.reached,false);
  assert.equal(env.timers.size,0);assert.equal(env.delays.length,0);
  controller.destroy();
  const animated=runtime(),second=fakePanel(),other=animated.api.mount(second.root,{config,commands:solution});
  const pending=other.play();animated.tick();animated.setMotion(true);const complete=await pending;
  assert.equal(complete.frame.reached,true);assert.equal(animated.timers.size,0);
  other.destroy();
});

test('A rerender restores the same cursor but never resumes autoplay or accepts a changed program',async()=>{
  const env=runtime(),panel=fakePanel(),controller=env.api.mount(panel.root,{config,commands:solution});
  controller.step();controller.step();const pending=controller.play();env.tick();
  const view=plain(controller.getView());controller.destroy();await pending;
  const restored=env.api.mount(fakePanel().root,{config,commands:solution,view});
  assert.equal(restored.getFrame().cursor,3);assert.equal(restored.getFrame().playing,false);assert.equal(env.timers.size,0);
  restored.update({config,commands:solution.slice()});assert.equal(restored.getFrame().cursor,3);
  restored.update({commands:solution.slice(1)});assert.equal(restored.getFrame().cursor,0);
  const different=env.api.mount(fakePanel().root,{config,commands:['U'],view});assert.equal(different.getFrame().cursor,0);
  restored.destroy();different.destroy();
});
