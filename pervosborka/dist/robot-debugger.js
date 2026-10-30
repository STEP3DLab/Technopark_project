/*
 * RobotDebugger — a bounded, step-by-step trial of the participant's program.
 * It never edits commands, writes storage, or submits a graded attempt.
 *
 * RobotDebugger.html(lab, draft, escapeHtml?) returns an accessible control panel.
 * mount(slot, {config, commands, view?, onFrame?, reducedMotion?, stepDelay?})
 * returns {getView, getFrame, step, back, reset, play, pause, update, destroy}.
 * update({config?, commands?}) retains cursor only for an identical signature.
 * play() resolves on completion, pause, reset, program change or destroy.
 * getView() is {signature, cursor}; an in-flight animation is never resumed.
 *
 * onFrame receives a fresh object. reached is true only when the entire program
 * finishes safely at the goal. atGoal merely describes the current cell.
 * Frame fields: cursor, attempted, executed, position, path, status, reason,
 * reached, atGoal, currentCommand, nextCommand, attemptedCell, total, playing.
 * logic exposes pure helpers for tests; it is not a scoring API.
 */
(function (global) {
  'use strict';
  const DIRECTIONS = Object.freeze({U:[0,-1],R:[1,0],D:[0,1],L:[-1,0]});
  const SIGNS = Object.freeze({U:'↑',R:'→',D:'↓',L:'←'});
  const NAMES = Object.freeze({U:'вверх',R:'вправо',D:'вниз',L:'влево'});
  const DEFAULTS = {size:5,start:[0,4],goal:[4,0],obstacles:[[1,4],[1,3],[3,2],[3,1]],maxCommands:14};
  const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  const commandName=command=>own(NAMES,command)?NAMES[command]:'неизвестная';
  const commandSign=command=>own(SIGNS,command)?SIGNS[command]:'?';
  const sameCell = (a,b) => a[0]===b[0]&&a[1]===b[1];
  const safe = value => String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalizedConfig(source) {
    const input=source&&typeof source==='object'?source:{};
    const size=Number.isInteger(input.size)&&input.size>=2&&input.size<=16?input.size:DEFAULTS.size;
    const validCell=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isInteger(n)&&n>=0&&n<size);
    const start=validCell(input.start)?input.start.slice():[0,size-1];
    const goal=validCell(input.goal)?input.goal.slice():[size-1,0];
    const obstacles=(Array.isArray(input.obstacles)?input.obstacles:DEFAULTS.obstacles).filter(validCell).map(p=>p.slice());
    const unique=[...new Map(obstacles.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
    const maxCommands=Number.isInteger(input.maxCommands)&&input.maxCommands>=1&&input.maxCommands<=100?input.maxCommands:DEFAULTS.maxCommands;
    return {size,start,goal,obstacles:unique,maxCommands};
  }
  function normalizedCommands(source) {
    // The editor accepts at most 14 commands. A finite defensive limit prevents
    // a malformed external caller from creating an unbounded DOM or trace.
    if(!Array.isArray(source))return [];
    return source.slice(0,101).map(value=>typeof value==='string'?value:'?');
  }
  function trace(source,program) {
    const config=normalizedConfig(source),commands=normalizedCommands(program);
    const signature=JSON.stringify({config,commands});
    let position=config.start.slice(),path=[position.slice()],executed=0;
    const frames=[{cursor:0,attempted:0,executed:0,position:position.slice(),path:path.map(p=>p.slice()),status:commands.length?'ready':'empty',reason:'',reached:false,atGoal:sameCell(position,config.goal),currentCommand:null,nextCommand:commands[0]||null,attemptedCell:null,total:commands.length}];
    for(let index=0;index<commands.length;index++){
      const command=commands[index],direction=own(DIRECTIONS,command)?DIRECTIONS[command]:null;
      let reason='',attemptedCell=null;
      if(index>=config.maxCommands)reason='limit';
      else if(!direction)reason='command';
      else{
        attemptedCell=[position[0]+direction[0],position[1]+direction[1]];
        if(attemptedCell.some(n=>n<0||n>=config.size))reason='boundary';
        else if(config.obstacles.some(p=>sameCell(p,attemptedCell)))reason='wall';
      }
      if(!reason){position=attemptedCell.slice();path.push(position.slice());executed++;}
      const atGoal=sameCell(position,config.goal),last=index===commands.length-1,status=reason?'blocked':last?'finished':'ready';
      frames.push({cursor:index+1,attempted:index+1,executed,position:position.slice(),path:path.map(p=>p.slice()),status,reason:reason||(last?(atGoal?'goal':'end'):''),reached:status==='finished'&&atGoal,atGoal,currentCommand:command,nextCommand:status==='ready'?commands[index+1]:null,attemptedCell:attemptedCell?attemptedCell.slice():null,total:commands.length});
      if(reason)break;
    }
    return {config,commands,signature,frames};
  }
  function restoreView(model,source) {
    const cursor=source&&source.signature===model.signature&&Number.isInteger(source.cursor)?Math.max(0,Math.min(model.frames.length-1,source.cursor)):0;
    return {signature:model.signature,cursor};
  }
  function copyFrame(frame,playing=false) {
    return {...frame,position:frame.position.slice(),path:frame.path.map(p=>p.slice()),attemptedCell:frame.attemptedCell?frame.attemptedCell.slice():null,playing:!!playing};
  }
  function describe(frame,config) {
    const cell='('+[frame.position[0]+1,frame.position[1]+1].join(', ')+')';
    if(frame.status==='empty')return 'Добавь команды стрелками. Затем пройди программу по одному шагу или запусти её целиком.';
    if(frame.status==='blocked'){
      const prefix='Команда '+frame.attempted+': ';
      if(frame.reason==='wall')return prefix+'впереди стена. Робот остался в клетке '+cell+'. Измени эту команду или путь перед ней.';
      if(frame.reason==='boundary')return prefix+'шаг выходит за границу поля. Робот остался в клетке '+cell+'.';
      if(frame.reason==='limit')return 'Превышен лимит '+config.maxCommands+' команд. Испытание остановлено перед командой '+frame.attempted+'.';
      return prefix+'направление не распознано. Используй стрелки вверх, вправо, вниз или влево.';
    }
    if(frame.status==='finished')return frame.reached?'Вся программа выполнена: робот у цели. Нажми «Проверить решение», чтобы сохранить попытку.':'Команды закончились в клетке '+cell+'. До цели ещё есть путь. Можно изменить программу и испытать её снова.';
    if(!frame.cursor)return 'Робот на старте '+cell+'. Первый шаг покажет, куда ведёт первая команда.';
    return 'Выполнена команда '+frame.attempted+' — '+commandName(frame.currentCommand)+'. Робот в клетке '+cell+'. '+(frame.atGoal?'Он на цели, но в программе ещё есть команды.':'Следующая команда: '+commandName(frame.nextCommand)+'.');
  }
  function commandMarkup(model,frame,esc=safe) {
    if(!model.commands.length)return '<li class="rd-empty-command">Программа пока пустая</li>';
    return model.commands.map((command,index)=>{
      const blocked=frame.status==='blocked'&&index===frame.attempted-1;
      const done=index<frame.executed;
      const current=index===frame.attempted-1&&frame.attempted>0;
      const next=frame.status==='ready'&&index===frame.cursor;
      const status=blocked?'остановка':current?'текущий шаг':done?'выполнено':next?'следующий шаг':'ещё не выполнялось';
      return '<li class="rd-command'+(done?' is-done':'')+(current?' is-current':'')+(next?' is-next':'')+(blocked?' is-blocked':'')+'" aria-label="Команда '+(index+1)+': '+esc(commandName(command))+', '+status+'"'+(current?' aria-current="step"':'')+'><small>'+(index+1)+'</small><span aria-hidden="true">'+esc(commandSign(command))+'</span>'+(blocked?'<b aria-hidden="true">!</b>':'')+'</li>';
    }).join('');
  }
  function html(lab,draft,escapeHtml) {
    const esc=typeof escapeHtml==='function'?escapeHtml:safe,model=trace(lab?.config,draft?.commands),frame=model.frames[0];
    return '<section class="rd" data-robot-debugger aria-label="Пошаговое испытание программы робота">'+
      '<div class="rd-heading"><div><p class="rd-kicker">ИСПЫТАНИЕ ПРОГРАММЫ</p><h3>Разберись с каждым шагом</h3></div><span class="rd-mode">Без новой оценки</span></div>'+
      '<p class="rd-intro">Наблюдай, как команды меняют положение робота. Испытание не сохраняет проверенную попытку — для этого есть «Проверить решение».</p>'+
      '<div class="rd-dashboard"><div><span>Положение робота</span><strong data-rd-position>'+esc('Столбец '+(frame.position[0]+1)+' · строка '+(frame.position[1]+1))+'</strong></div><div><span>Испытано команд</span><strong data-rd-count>0 / '+model.commands.length+'</strong></div></div>'+
      '<ol class="rd-commands" data-rd-commands aria-label="Ход испытания по командам">'+commandMarkup(model,frame,esc)+'</ol>'+
      '<div class="rd-controls"><button type="button" data-rd-action="reset" disabled>Сначала</button><button type="button" data-rd-action="back" disabled>← Назад</button><button type="button" data-rd-action="step"'+(model.commands.length?'':' disabled')+'>Один шаг →</button><button type="button" data-rd-action="play" class="rd-play"'+(model.commands.length?'':' disabled')+'>Пройти</button></div>'+
      '<p class="rd-status" data-rd-status role="status" aria-live="polite" aria-atomic="true">'+esc(describe(frame,model.config))+'</p>'+
      '<p class="rd-footnote">Столбцы — слева направо, строки — сверху вниз. Стрелки относятся к виду поля сверху.</p></section>';
  }
  function mount(container,options={}) {
    if(!container||typeof container.querySelector!=='function')throw new Error('RobotDebugger needs a DOM container.');
    const root=container.matches?.('[data-robot-debugger]')?container:container.querySelector('[data-robot-debugger]');
    if(!root)throw new Error('Insert RobotDebugger.html before mounting.');
    const elements={position:root.querySelector('[data-rd-position]'),count:root.querySelector('[data-rd-count]'),commands:root.querySelector('[data-rd-commands]'),status:root.querySelector('[data-rd-status]')};
    const buttons=Object.fromEntries(['reset','back','step','play'].map(name=>[name,root.querySelector('[data-rd-action="'+name+'"]')]));
    let config=options.config,commands=options.commands,model=trace(config,commands),cursor=restoreView(model,options.view).cursor;
    let destroyed=false,playing=false,timer=null,runResolve=null;
    const media=typeof global.matchMedia==='function'?global.matchMedia('(prefers-reduced-motion: reduce)'):null;
    const reduced=()=>typeof options.reducedMotion==='boolean'?options.reducedMotion:!!media?.matches;
    const delay=Number.isFinite(options.stepDelay)?Math.max(150,Math.min(1500,options.stepDelay)):650;
    const setTimer=typeof global.setTimeout==='function'?global.setTimeout.bind(global):setTimeout;
    const clearTimer=typeof global.clearTimeout==='function'?global.clearTimeout.bind(global):clearTimeout;
    const current=()=>model.frames[cursor];
    function emit(){if(typeof options.onFrame==='function')options.onFrame(copyFrame(current(),playing));}
    function paint(notify=true){
      if(destroyed)return;
      const frame=current(),terminal=cursor>=model.frames.length-1;
      const focused=root.ownerDocument?.activeElement;
      root.dataset.robotStatus=frame.status;
      if(elements.position)elements.position.textContent='Столбец '+(frame.position[0]+1)+' · строка '+(frame.position[1]+1);
      if(elements.count)elements.count.textContent=frame.attempted+' / '+model.commands.length;
      if(elements.commands)elements.commands.innerHTML=commandMarkup(model,frame);
      if(elements.status)elements.status.textContent=describe(frame,model.config);
      if(buttons.reset)buttons.reset.disabled=cursor===0&&!playing;
      if(buttons.back)buttons.back.disabled=cursor===0||playing;
      if(buttons.step)buttons.step.disabled=terminal||playing;
      if(buttons.play){buttons.play.disabled=!playing&&terminal;buttons.play.textContent=playing?'Пауза':'Пройти';buttons.play.setAttribute('aria-label',playing?'Приостановить испытание':'Пройти оставшиеся команды');buttons.play.setAttribute('aria-pressed',String(playing));}
      // Keep a keyboard user within the controls when the just-used button
      // becomes unavailable after reaching a terminal frame or resetting.
      if(focused&&Object.values(buttons).includes(focused)&&focused.disabled){
        const target=playing?buttons.play:cursor===0?buttons.step:buttons.reset;
        if(target&&!target.disabled&&typeof target.focus==='function')target.focus({preventScroll:true});
      }
      if(notify)emit();
    }
    function settle(reason,completed=false){
      if(timer!==null){clearTimer(timer);timer=null;}
      playing=false;
      const resolve=runResolve;runResolve=null;
      if(resolve)resolve({completed,reason,cursor,frame:copyFrame(current())});
    }
    function stop(reason){settle(reason,false);}
    function advance(){
      if(destroyed||!playing)return;
      if(cursor<model.frames.length-1)cursor++;
      const finished=cursor>=model.frames.length-1;
      if(finished)settle(current().status==='blocked'?current().reason:'complete',true);
      paint();
      if(!finished&&playing)timer=setTimer(advance,delay);
    }
    function play(){
      if(destroyed)return Promise.resolve({completed:false,reason:'destroyed',cursor,frame:copyFrame(current())});
      if(playing)return Promise.resolve({completed:false,reason:'already-playing',cursor,frame:copyFrame(current(),true)});
      if(cursor>=model.frames.length-1)return Promise.resolve({completed:true,reason:'already-ended',cursor,frame:copyFrame(current())});
      if(reduced()){
        cursor=model.frames.length-1;paint();
        return Promise.resolve({completed:true,reason:current().status==='blocked'?current().reason:'complete',cursor,frame:copyFrame(current())});
      }
      playing=true;
      const promise=new Promise(resolve=>{runResolve=resolve;});
      paint();if(playing&&!destroyed)timer=setTimer(advance,delay);
      return promise;
    }
    function pause(){if(destroyed)return;stop('paused');paint();}
    function step(){if(destroyed)return;stop('manual-step');cursor=Math.min(model.frames.length-1,cursor+1);paint();}
    function back(){if(destroyed)return;stop('back');cursor=Math.max(0,cursor-1);paint();}
    function reset(){if(destroyed)return;stop('reset');cursor=0;paint();}
    function update(next={}){
      if(destroyed)return;
      const previous={signature:model.signature,cursor};
      if(own(next,'config'))config=next.config;
      if(own(next,'commands'))commands=next.commands;
      const incoming=trace(config,commands);
      if(incoming.signature!==model.signature)stop('program-changed');
      model=incoming;cursor=restoreView(model,previous).cursor;paint();
    }
    function onClick(event){
      const button=event.target.closest?.('[data-rd-action]');
      if(!button||!root.contains(button)||button.disabled)return;
      const action=button.dataset.rdAction;
      if(action==='reset')reset();else if(action==='back')back();else if(action==='step')step();else if(action==='play'){if(playing)pause();else void play();}
    }
    function onMotionChange(){if(playing&&reduced()){cursor=model.frames.length-1;settle(current().status==='blocked'?current().reason:'complete',true);paint();}}
    root.addEventListener('click',onClick);
    if(media?.addEventListener)media.addEventListener('change',onMotionChange);
    paint();
    return {
      getView:()=>({signature:model.signature,cursor}),
      getFrame:()=>copyFrame(current(),playing),
      step,back,reset,play,pause,update,
      destroy(){if(destroyed)return;stop('destroyed');destroyed=true;root.removeEventListener('click',onClick);if(media?.removeEventListener)media.removeEventListener('change',onMotionChange);}
    };
  }
  const api={html,mount,logic:{trace,restoreView,describe}};
  global.RobotDebugger=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
