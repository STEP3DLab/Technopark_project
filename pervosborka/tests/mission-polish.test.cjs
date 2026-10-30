'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../dist/engine.js');
const data=require('../dist/bank.json');
const KEY='rgsu-vector-1';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const source=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const robotics=data.labs.find(lab=>lab.track==='robotics');
const engineering=data.labs.find(lab=>lab.track==='engineering');
const program=robotics.solution.exampleCommands;

function participant(){
  const state=E.emptyState('full');
  state.sessionId='V-OLD001';state.experienceVersion='2.0-visual';state.interestTiming={};
  state.drafts.robotics={commands:program.slice()};
  state.drafts.engineering={thickness:2,ribs:3};
  state.drafts.xr={choices:{entry:'goal',action:'select',feedback:'explain'}};
  state.resumeRoute='lab:robotics';
  return state;
}

// Small DOM surface for the actual app and interaction modules. It parses their
// emitted markup and bubbles real click/change/input handlers. Only the 3D
// rendering transport is replaced; private app state and handlers stay intact.
function dom(){
  let document;
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  class Element {
    constructor(tag='div',attrs={}){this.tagName=tag.toLowerCase();this.attrs={};this.dataset={};this.children=[];this.parentNode=null;this.ownerDocument=document;this.listeners=new Map();this.value='';for(const [key,value]of Object.entries(attrs))this.setAttribute(key,value);}
    setAttribute(key,value){this.attrs[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);if(key==='value')this.value=String(value);}
    getAttribute(key){return this.attrs[key]??null;}
    get id(){return this.attrs.id||'';}set id(value){this.attrs.id=String(value);}
    get className(){return this.attrs.class||'';}set className(value){this.attrs.class=String(value);}
    get disabled(){return Object.hasOwn(this.attrs,'disabled');}set disabled(value){if(value)this.attrs.disabled='';else delete this.attrs.disabled;}
    get hidden(){return Object.hasOwn(this.attrs,'hidden');}set hidden(value){if(value)this.attrs.hidden='';else delete this.attrs.hidden;}
    get isConnected(){let current=this;while(current.parentNode)current=current.parentNode;return current===document;}
    get classList(){const self=this;return {toggle(name,force){const values=new Set(self.className.split(/\s+/).filter(Boolean)),enabled=force===undefined?!values.has(name):force;if(enabled)values.add(name);else values.delete(name);self.className=[...values].join(' ');return enabled;},contains(name){return self.className.split(/\s+/).includes(name);}};}
    get textContent(){return this.children.map(child=>typeof child==='string'?child:child.textContent).join('');}
    set textContent(value){this.replaceChildren(String(value));}
    get innerHTML(){return this.children.map(child=>typeof child==='string'?child:'<'+child.tagName+Object.entries(child.attrs).map(([key,value])=>' '+key+'="'+value+'"').join('')+'>'+child.innerHTML+'</'+child.tagName+'>').join('');}
    set innerHTML(value){
      this.replaceChildren();const stack=[this];
      for(const token of String(value).matchAll(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi)){
        const raw=token[0];if(raw.startsWith('<!--'))continue;
        if(raw.startsWith('</')){const tag=/^<\/([^\s>]+)/.exec(raw)[1].toLowerCase();for(let index=stack.length-1;index>0;index--)if(stack[index].tagName===tag){stack.length=index;break;}continue;}
        if(raw.startsWith('<')){
          const match=/^<([a-z][\w:-]*)\b([\s\S]*?)\/?\s*>$/i.exec(raw);if(!match)continue;
          const attrs={};for(const attr of match[2].matchAll(/([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[attr[1]]=attr[2]??attr[3]??attr[4]??'';
          const child=new Element(match[1],attrs);stack.at(-1).append(child);if(!voidTags.has(child.tagName)&&!raw.endsWith('/>'))stack.push(child);
        }else stack.at(-1).append(raw);
      }
    }
    append(...children){for(const child of children){if(typeof child!=='string'){child.remove();child.parentNode=this;child.ownerDocument=document;}this.children.push(child);}}
    prepend(child){if(typeof child!=='string'){child.remove();child.parentNode=this;child.ownerDocument=document;}this.children.unshift(child);}
    replaceChildren(...children){for(const child of this.children)if(typeof child!=='string')child.parentNode=null;this.children=[];this.append(...children);}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}}
    after(child){if(this.parentNode){const parent=this.parentNode,index=parent.children.indexOf(this);child.remove();child.parentNode=parent;parent.children.splice(index+1,0,child);}}
    contains(element){for(let current=element;current;current=current.parentNode)if(current===this)return true;return false;}
    matches(selector){
      if(selector.includes(':not(:disabled)')){if(this.disabled)return false;selector=selector.replace(':not(:disabled)','');}
      const tag=/^[a-z][\w-]*/i.exec(selector)?.[0];if(tag&&this.tagName!==tag.toLowerCase())return false;
      const id=/#([\w-]+)/.exec(selector)?.[1];if(id&&this.id!==id)return false;
      for(const match of selector.matchAll(/\.([\w-]+)/g))if(!this.className.split(/\s+/).includes(match[1]))return false;
      for(const match of selector.matchAll(/\[([^\]=\s]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]/g)){
        if(!Object.hasOwn(this.attrs,match[1]))return false;
        const value=match[2]??match[3]??match[4];if(value!==undefined&&this.attrs[match[1]]!==value)return false;
      }
      return true;
    }
    closest(selector){for(let current=this;current;current=current.parentNode)if(current.matches(selector))return current;return null;}
    querySelectorAll(selector){
      const parts=selector.trim().split(/\s+(?=(?:[^"']|"[^"]*"|'[^']*')*$)/),result=[];
      function visit(element){for(const child of element.children)if(typeof child!=='string'){
        if(child.matches(parts.at(-1))){let ancestor=child.parentNode,index=parts.length-2;while(index>=0&&ancestor){if(ancestor.matches(parts[index]))index--;ancestor=ancestor.parentNode;}if(index<0)result.push(child);}
        visit(child);
      }}visit(this);return result;
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
    removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    click(){}
  }
  document=new Element('document');document.ownerDocument=document;document.activeElement=null;document.hidden=false;
  document.createElement=tag=>new Element(tag);document.getElementById=id=>document.querySelector('#'+id);
  document.body=new Element('body');document.append(document.body);document.body.append(new Element('div',{id:'app'}),new Element('div',{id:'toast'}));
  document.eventPath=target=>{const nodes=[];for(let current=target;current;current=current.parentNode)nodes.push(current);return nodes;};
  document.fire=(type,target)=>{const pending=[];for(const node of document.eventPath(target))for(const fn of [...(node.listeners.get(type)||[])])pending.push(fn({target,preventDefault(){}}));return pending;};
  return document;
}

function runApp({saved=participant(),hash='#lab:robotics',faults={}}={}){
  const document=dom(),values=new Map(),windowListeners=new Map(),pendingHash=[],timers=new Map(),mounts={robot:[],engineering:[],xr:[],scenes:[]},calls={grade:[],newState:0};let currentHash=hash,timerId=0;
  if(saved!==null)values.set(KEY,JSON.stringify(saved));
  const localStorage={getItem(key){return values.get(key)??null;},setItem(key,value){faults.set?.(key,value);values.set(key,value);},removeItem(key){faults.remove?.(key);values.delete(key);}};
  const engine={...E,emptyState(...args){calls.newState++;return E.emptyState(...args);},gradeLab(...args){calls.grade.push(args[0].track);return E.gradeLab(...args);}};
  const timer=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;};
  const window={VectorEngine:engine,VECTOR_DATA:data,scrollY:0,scrollTo(){},confirm(){return true;},print(){},matchMedia(){return {matches:false,addEventListener(){},removeEventListener(){}};},setTimeout:timer,clearTimeout:id=>timers.delete(id),addEventListener(type,fn){if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(fn);}};
  const location={get hash(){return currentHash;},set hash(value){const next=value.startsWith('#')?value:'#'+value;if(next!==currentHash){currentHash=next;pendingHash.push(true);}}};
  window.TechScenes={mount(element,options){
    const record={kind:options.kind,options,updates:[],destroyed:false,camera:clone(options.camera)||{yaw:0,pitch:0,distance:7}};
    const controller={available:true,update(params){record.updates.push(clone(params));},getCamera(){return clone(record.camera);},setView(value){record.camera.view=value;},rotate(value){record.camera.yaw+=value;},zoom(value){record.camera.distance+=value;},reset(){record.camera={yaw:0,pitch:0,distance:7};},destroy(){record.destroyed=true;}};
    record.controller=controller;mounts.scenes.push(record);return controller;
  }};
  const context=vm.createContext({window,document,location,localStorage,Blob,URL:{createObjectURL(){return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:timer,clearTimeout:id=>timers.delete(id),console});
  for(const file of ['continuity-storage.js','project-trials.js','robot-debugger.js','engineering-compare.js','xr-player.js','draft-history.js'])vm.runInContext(source(file),context,{filename:file});
  for(const [name,key]of [['RobotDebugger','robot'],['EngineeringCompare','engineering'],['XRPlayer','xr']]){
    const original=window[name];window[name]={...original,mount(slot,options){
      const actual=original.mount(slot,options),record={view:clone(options.view),actual,destroyed:false};
      const controller={...actual,destroy(){record.destroyed=true;actual.destroy();}};record.controller=controller;mounts[key].push(record);return controller;
    }};
  }
  vm.runInContext(source('app.js'),context,{filename:'app.js'});
  function flushHash(){let guard=0;while(pendingHash.length){assert.ok(++guard<20,'navigation must terminate');pendingHash.shift();for(const fn of windowListeners.get('hashchange')||[])fn();}}
  function clickSelector(selector){const target=document.querySelector(selector);assert.ok(target,'Rendered control: '+selector);assert.equal(target.disabled,false,'Enabled control: '+selector);target.focus();document.fire('click',target);flushHash();}
  return {
    document,mounts,calls,timers,values,faults,
    get hash(){return location.hash;},raw:()=>values.get(KEY),saved:()=>values.has(KEY)?JSON.parse(values.get(KEY)):null,
    current:key=>mounts[key].at(-1),scene:kind=>mounts.scenes.filter(record=>record.kind===kind).at(-1),
    click(action){clickSelector('[data-action="'+action+'"]');},
    trial(prefix,action,extra=''){clickSelector('[data-'+prefix+'-action="'+action+'"]'+extra);},
    navigate(route){location.hash=route;flushHash();},
    input(id,value){const element=document.getElementById(id);assert.ok(element,'Rendered field: '+id);element.value=String(value);document.fire('input',element);flushHash();},
    tick(delay=650){const pending=[...timers.entries()].find(([,item])=>item.delay===delay);assert.ok(pending,'A playback frame must be pending');timers.delete(pending[0]);pending[1].fn();},
    async importFile(state){const element=document.getElementById('personal-file');assert.ok(element);const raw=JSON.stringify(E.createExport(data,state));element.files=[{name:'incoming.json',size:Buffer.byteLength(raw),text:async()=>raw}];await Promise.all(document.fire('change',element));flushHash();}
  };
}

test('Parameter steppers update the same live model, respect limits, and do not save a checked attempt',()=>{
  const app=runApp({hash:'#lab:engineering'});
  app.click('param-step:engineering:thickness:1');
  assert.equal(app.saved().drafts.engineering.thickness,3);
  assert.equal(app.document.getElementById('thickness').value,'3');
  assert.equal(app.document.getElementById('engineering-step-status').textContent,'Толщина: 3 мм.');
  assert.equal(app.document.getElementById('engineering-metrics').querySelectorAll('[data-passed="true"]').length,3);
  assert.deepEqual(app.scene('engineering').updates.at(-1),{thickness:3,ribs:3});
  app.click('param-step:engineering:ribs:1');
  assert.equal(app.saved().drafts.engineering.ribs,4);
  assert.equal(app.document.querySelector('[data-action="param-step:engineering:ribs:1"]').disabled,true);
  assert.equal(app.document.activeElement.id,'ribs');
  assert.deepEqual(app.saved().labs,{});
});

test('Draft status tracks changes and reverting them without changing first or last checked snapshots',()=>{
  const app=runApp({hash:'#lab:engineering'}),status=()=>app.document.getElementById('mission-draft-status');
  assert.equal(status().getAttribute('data-state'),'draft');
  app.click('check:engineering');const checked=clone(app.saved().labs.engineering);
  assert.equal(status().getAttribute('data-state'),'checked');
  app.input('thickness',4);assert.equal(status().getAttribute('data-state'),'changed');
  assert.match(status().textContent,/Есть изменения после проверки/);
  assert.match(status().querySelector('.draft-status-note').textContent,/предыдущему варианту/);
  app.input('thickness',2);assert.equal(status().getAttribute('data-state'),'checked');
  assert.match(status().querySelector('.draft-status-note').textContent,/Проверок: 1/);
  assert.deepEqual(app.saved().labs.engineering,checked);
});

test('Changing only selection order does not make a semantically identical checked solution look changed',()=>{
  const app=runApp({hash:'#lab:ai'}),lab=data.labs.find(x=>x.track==='ai'),ids=lab.config.options.slice(0,2).map(x=>x.id);
  for(const id of ids)app.click('select:ai:'+id);
  app.click('check:ai');const checked=clone(app.saved().labs.ai);
  app.click('select:ai:'+ids[0]);assert.equal(app.document.getElementById('mission-draft-status').getAttribute('data-state'),'changed');
  app.click('select:ai:'+ids[0]);assert.equal(app.document.getElementById('mission-draft-status').getAttribute('data-state'),'checked');
  assert.deepEqual(app.saved().labs.ai,checked);
});

test('Removing a middle robot command retains checked history, resets playback and restores useful focus',()=>{
  const app=runApp();app.click('check:robotics');const checked=clone(app.saved().labs.robotics);
  app.trial('rd','step');app.trial('rd','step');
  app.click('remove-command:robotics:2');
  assert.deepEqual(app.saved().drafts.robotics.commands,[...program.slice(0,2),...program.slice(3)]);
  assert.equal(app.current('robot').controller.getFrame().cursor,0);
  assert.equal(app.document.activeElement.dataset.action,'remove-command:robotics:2');
  assert.equal(app.document.getElementById('mission-draft-status').getAttribute('data-state'),'changed');
  assert.deepEqual(app.saved().labs.robotics,checked);
});

test('Capacity feedback agrees with command limits and removing the final command returns focus to the pad',()=>{
  const state=participant();state.drafts.robotics.commands=Array(13).fill('U');const app=runApp({saved:state});
  app.click('command:robotics:R');
  assert.match(app.document.querySelector('.command-capacity').textContent,/14 \/ 14.*лимит достигнут/);
  assert.equal(app.document.querySelector('[data-action="command:robotics:U"]').disabled,true);
  app.click('remove-command:robotics:4');assert.equal(app.document.querySelector('[data-action="command:robotics:U"]').disabled,false);
  app.click('reset-draft:robotics');app.click('command:robotics:L');app.click('remove-command:robotics:0');
  assert.equal(app.document.activeElement.dataset.action,'command:robotics:U');
  assert.deepEqual(app.saved().drafts.robotics.commands,[]);assert.deepEqual(app.saved().labs,{});
});

test('XR stage navigation finds the first unanswered stage and never supplies an answer',()=>{
  const state=participant();state.drafts.xr={choices:{}};const app=runApp({saved:state,hash:'#lab:xr'});
  const raw=app.raw();app.click('next-incomplete:xr');assert.equal(app.raw(),raw);assert.equal(app.document.activeElement.id,'branch-stage-entry');
  app.click('branch:xr:entry:goal');app.click('next-incomplete:xr');assert.equal(app.document.activeElement.id,'branch-stage-action');
  assert.match(app.document.querySelector('.task-completion').textContent,/1 \/ 3/);
  app.click('branch:xr:action:select');app.click('branch:xr:feedback:explain');
  assert.equal(app.document.querySelector('[data-action="next-incomplete:xr"]').disabled,true);assert.deepEqual(app.saved().labs,{});
});

test('Measurement navigation skips answered sizes, reports completion, and keeps correctness separate',()=>{
  const app=runApp({hash:'#lab:research'}),lab=data.labs.find(x=>x.track==='research');
  app.click('classify:research:m1:inside');app.click('next-incomplete:research');
  assert.equal(app.document.activeElement.id,'measurement-row-m2');assert.match(app.document.querySelector('.task-completion').textContent,/1 \/ 6/);
  for(const item of lab.config.measurements.slice(1))app.click('classify:research:'+item.id+':inside');
  assert.equal(app.document.querySelector('[data-action="next-incomplete:research"]').disabled,true);
  assert.match(app.document.querySelector('.task-completion').textContent,/6 \/ 6/);
  assert.deepEqual(app.saved().labs,{},'marking all values is not a correctness result');
});

test('Budget balance reflects the exact remaining or exceeded amount without silently constraining choices',()=>{
  const app=runApp({hash:'#lab:social'});
  assert.match(app.document.querySelector('.budget-balance').textContent,/Осталось в бюджете12/);
  for(const id of ['access','workshop','mentoring','demo'])app.click('select:social:'+id);
  const balance=app.document.querySelector('.budget-balance');
  assert.equal(balance.getAttribute('data-over'),'true');assert.match(balance.textContent,/Сверх лимита2/);
  assert.deepEqual(app.saved().drafts.social.selected,['access','workshop','mentoring','demo']);
  assert.deepEqual(app.saved().labs,{});
  app.click('select:social:access');assert.equal(app.document.querySelector('.budget-balance').getAttribute('data-over'),'false');
  assert.match(app.document.querySelector('.budget-balance').textContent,/Бюджет использован полностью/);
});

test('Mission section navigation changes focus only and breadcrumbs identify adjacent laboratories',()=>{
  const app=runApp({hash:'#lab:engineering'}),before=app.raw();
  for(const id of ['brief','work','check']){app.click('mission-jump:'+id);assert.equal(app.document.activeElement.id,'mission-'+id);assert.equal(app.raw(),before);}
  assert.match(app.document.querySelector('.mission-breadcrumbs').textContent,/Главная.*Лаборатории.*Инженерия/);
  assert.equal(app.document.querySelector('.mission-neighbors a').getAttribute('href'),'#lab:robotics');
});


test('Draft undo and redo update the live engineering model without rewriting checked snapshots',()=>{
  const app=runApp({hash:'#lab:engineering'});app.click('check:engineering');const checked=clone(app.saved().labs.engineering),scene=app.scene('engineering');
  app.click('param-step:engineering:thickness:1');assert.equal(app.saved().drafts.engineering.thickness,3);
  app.click('draft-undo:engineering');assert.equal(app.saved().drafts.engineering.thickness,2);assert.equal(app.document.activeElement.dataset.action,'draft-redo:engineering');
  assert.equal(app.scene('engineering'),scene);assert.equal(app.document.getElementById('mission-draft-status').getAttribute('data-state'),'checked');
  app.click('draft-redo:engineering');assert.equal(app.saved().drafts.engineering.thickness,3);assert.equal(app.document.activeElement.dataset.action,'draft-undo:engineering');
  assert.deepEqual(app.saved().labs.engineering,checked);
});

test('Undoing a middle-command removal restores the full program with a fresh playback cursor',()=>{
  const app=runApp();app.click('check:robotics');const checked=clone(app.saved().labs.robotics);app.trial('rd','step');
  app.click('remove-command:robotics:2');app.click('draft-undo:robotics');
  assert.deepEqual(app.saved().drafts.robotics.commands,program);assert.equal(app.current('robot').controller.getFrame().cursor,0);
  assert.deepEqual(app.saved().labs.robotics,checked);assert.equal(app.document.activeElement.dataset.action,'draft-redo:robotics');
});

test('Clearing a robot draft can be undone and a new edit discards redo',()=>{
  const app=runApp();app.click('reset-draft:robotics');assert.deepEqual(app.saved().drafts.robotics.commands,[]);
  app.click('draft-undo:robotics');assert.deepEqual(app.saved().drafts.robotics.commands,program);
  app.click('command:robotics:D');assert.equal(app.document.querySelector('[data-action="draft-redo:robotics"]').disabled,true);
  assert.deepEqual(app.saved().labs,{});
});

test('Returning to the checked variant is itself undoable and creates no additional check',()=>{
  const app=runApp({hash:'#lab:engineering'});app.click('check:engineering');const checked=clone(app.saved().labs.engineering);
  app.input('thickness',5);app.input('ribs',0);app.click('draft-checked:engineering');
  assert.deepEqual(app.saved().drafts.engineering,{thickness:2,ribs:3});assert.equal(app.document.getElementById('mission-draft-status').getAttribute('data-state'),'checked');
  app.click('draft-undo:engineering');assert.deepEqual(app.saved().drafts.engineering,{thickness:5,ribs:0});assert.deepEqual(app.saved().labs.engineering,checked);
});

test('Applying comparison A is in the same undo timeline as parameter editing',()=>{
  const app=runApp({hash:'#lab:engineering'});app.trial('ec','capture');app.input('thickness',5);app.trial('ec','apply');
  assert.equal(app.saved().drafts.engineering.thickness,2);app.click('draft-undo:engineering');assert.equal(app.saved().drafts.engineering.thickness,5);
  app.click('param-step:engineering:ribs:1');assert.deepEqual(app.saved().drafts.engineering,{thickness:5,ribs:4});assert.deepEqual(app.saved().labs,{});
});

test('Undo history survives navigation but is cleared when another session is imported',async()=>{
  const app=runApp();app.click('remove-command:robotics:0');app.navigate('lab:ai');app.navigate('lab:robotics');
  assert.equal(app.document.querySelector('[data-action="draft-undo:robotics"]').disabled,false);
  const incoming=participant();incoming.sessionId='V-IN0001';app.navigate('transfer');await app.importFile(incoming);app.click('apply-import');
  assert.equal(app.saved().sessionId,'V-IN0001');assert.equal(app.document.querySelector('[data-action="draft-undo:robotics"]').disabled,true);assert.deepEqual(app.saved().drafts.robotics.commands,program);
});

test('A failed import preserves the current draft and its available undo',async()=>{
  const app=runApp();app.click('remove-command:robotics:0');app.navigate('transfer');const incoming=participant();incoming.sessionId='V-IN0001';await app.importFile(incoming);
  app.faults.set=key=>{if(key===KEY+'-previous')throw new Error('storage blocked');};app.click('apply-import');app.navigate('lab:robotics');
  assert.equal(app.saved().sessionId,'V-OLD001');app.click('draft-undo:robotics');assert.deepEqual(app.saved().drafts.robotics.commands,program);
});

test('A new route clears all undo timelines without adding checked attempts',()=>{
  const app=runApp();app.click('remove-command:robotics:0');app.navigate('choose');app.click('start:quick');app.click('confirm-start');app.navigate('lab:robotics');
  assert.equal(app.document.querySelector('[data-action="draft-undo:robotics"]').disabled,true);assert.deepEqual(app.saved().labs,{});
});

test('A failed live slider save immediately changes the storage indicator and recovers on the next successful write',()=>{
  const app=runApp({hash:'#lab:engineering'}),overlay=app.document.createElement('div');overlay.className='fx-overlay';app.document.body.append(overlay);overlay.append(app.document.querySelector('.lab-controls'));
  const inlineNotice=overlay.querySelector('[data-storage-notice]');assert.equal(inlineNotice.hidden,true);
  app.faults.set=key=>{if(key===KEY)throw new Error('blocked');};app.input('thickness',4);
  assert.equal(app.document.querySelector('[data-save-state]').getAttribute('data-state'),'memory');assert.ok(app.document.getElementById('live-storage-warning'));
  assert.equal(inlineNotice.hidden,false);assert.match(inlineNotice.textContent,/Работа остаётся в этой вкладке/);
  assert.equal(app.document.getElementById('thickness').value,'4');assert.equal(app.saved().drafts.engineering.thickness,2);
  delete app.faults.set;app.input('ribs',4);assert.equal(app.document.querySelector('[data-save-state]').getAttribute('data-state'),'saved');assert.equal(app.document.getElementById('live-storage-warning'),null);assert.equal(app.saved().drafts.engineering.thickness,4);assert.equal(inlineNotice.hidden,true);
});

test('Experience zero is an answered profile item, while clearing it removes the count',()=>{
  const app=runApp({hash:'#profile'}),field=app.document.getElementById('exp-engineering');field.value='0';app.document.fire('change',field);
  assert.equal(app.saved().experience.engineering,0);assert.match(app.document.getElementById('profile-answer-count').textContent,/1 \/ 8/);
  field.value='';app.document.fire('change',field);assert.equal(Object.hasOwn(app.saved().experience,'engineering'),false);assert.match(app.document.getElementById('profile-answer-count').textContent,/0 \/ 8/);
});

test('Situation overview navigates without filling missing responses and selection stays on the same situation',()=>{
  const app=runApp({hash:'#situation:0'}),q=data.situations[0],choice=(q.options||q.choices)[0];
  app.click('go:situation:2');assert.equal(app.hash,'#situation:2');assert.deepEqual(app.saved().situations,{});
  app.click('go:situation:0');app.click('situation:'+q.id+':'+choice.id);assert.equal(app.hash,'#situation:0');assert.equal(app.saved().situations[q.id],choice.id);
  assert.match(app.document.querySelector('.situation-answer-state').textContent,/выбор сохранён/);assert.deepEqual(app.saved().labs,{});
});

test('Checking focuses the result, and the next-step control reaches reflection without entering an answer',()=>{
  const app=runApp({hash:'#lab:engineering'});app.click('check:engineering');assert.equal(app.document.activeElement.id,'mission-feedback');
  app.click('mission-jump:reflection');assert.equal(app.document.activeElement.id,'mission-reflection');assert.deepEqual(app.saved().reflections,{});assert.equal(app.saved().labs.engineering.attempts,1);
});
