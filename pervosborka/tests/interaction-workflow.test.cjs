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
  for(const file of ['continuity-storage.js','project-trials.js','robot-debugger.js','engineering-compare.js','xr-player.js'])vm.runInContext(source(file),context,{filename:file});
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

test('Campus choices and 3D marker selection do not create a participant or a checked attempt',()=>{
  const app=runApp({saved:null,hash:'#labs'});
  app.click('campus-pick:robotics');
  assert.equal(app.raw(),undefined);assert.equal(app.calls.newState,0);assert.equal(app.calls.grade.length,0);
  assert.equal(app.scene('campus').updates.at(-1).selectedLab,'robotics');
  assert.equal(app.document.querySelectorAll('[data-campus-choice="robotics"]').filter(element=>element.getAttribute('aria-pressed')==='true').length,2);
  app.scene('campus').options.onSelectLab('engineering');
  assert.equal(app.raw(),undefined);assert.equal(app.calls.newState,0);
  assert.match(app.document.getElementById('campus-preview').innerHTML,/#lab:engineering/);
  app.click('scene-mode:campus');assert.equal(app.raw(),undefined);
  assert.match(app.document.getElementById('campus-preview').innerHTML,/#lab:engineering/);
  const existing=runApp({hash:'#labs'}),before=existing.raw();existing.click('campus-pick:xr');
  assert.equal(existing.raw(),before,'choosing a building does not write an existing session either');
});

test('Robot trial clicks never save a result; the real Check handler grades the whole draft and retains the trial cursor',()=>{
  const app=runApp(),before=app.raw();
  app.trial('rd','step');app.trial('rd','step');app.trial('rd','back');app.trial('rd','reset');app.trial('rd','step');app.trial('rd','step');
  assert.equal(app.raw(),before);assert.deepEqual(app.saved().labs,{});assert.equal(app.calls.grade.length,0);
  assert.equal(app.current('robot').controller.getFrame().cursor,2);
  app.click('check:robotics');
  assert.equal(app.saved().labs.robotics.attempts,1);assert.equal(app.saved().labs.robotics.first.all,true,'the entire selected solution is checked, independent of preview cursor');
  assert.deepEqual(app.saved().labs.robotics.firstDraft.commands,program);
  assert.equal(app.current('robot').controller.getFrame().cursor,2);assert.equal(app.calls.grade.length,1);
  const checked=clone(app.saved().labs.robotics),after=app.raw();app.trial('rd','step');
  assert.equal(app.raw(),after);assert.deepEqual(app.saved().labs.robotics,checked);
  app.click('check:robotics');assert.equal(app.saved().labs.robotics.attempts,2);assert.deepEqual(app.saved().labs.robotics.first,checked.first);
});

test('Editing, undoing, and clearing commands reset the debugger while keeping checked snapshots intact',()=>{
  const app=runApp();app.click('check:robotics');const checked=clone(app.saved().labs.robotics);
  app.trial('rd','step');app.trial('rd','step');const previous=app.current('robot');
  app.click('command:robotics:D');
  assert.equal(previous.destroyed,true);assert.equal(app.current('robot').view.cursor,2);
  assert.equal(app.current('robot').controller.getFrame().cursor,0);assert.deepEqual(app.saved().drafts.robotics.commands,[...program,'D']);
  app.trial('rd','step');app.click('undo-command:robotics');
  assert.equal(app.current('robot').controller.getFrame().cursor,0);assert.deepEqual(app.saved().drafts.robotics.commands,program);
  app.click('reset-draft:robotics');assert.equal(app.current('robot').controller.getFrame().status,'empty');
  assert.deepEqual(app.saved().labs.robotics,checked);
});

test('Changing scene mode cancels an active robot run and restores the same frame in 2D and 3D',async()=>{
  const app=runApp();app.trial('rd','step');app.trial('rd','step');
  const original=app.current('robot'),pending=original.controller.play();app.tick();
  assert.equal(original.controller.getFrame().cursor,3);app.click('scene-mode:robot');
  assert.equal((await pending).reason,'destroyed');assert.equal(original.destroyed,true);
  assert.equal(app.current('robot').controller.getFrame().cursor,3);assert.equal(app.current('robot').controller.getFrame().playing,false);
  const flat=app.document.querySelector('[data-scene-shell=robot] .scene-fallback');
  assert.equal(flat.hidden,false);assert.match(flat.innerHTML,/Робот: столбец 2, строка 3/);
  assert.equal([...app.timers.values()].filter(item=>item.delay===650).length,0);
  app.click('scene-mode:robot');const frame=app.current('robot').controller.getFrame();
  assert.equal(frame.cursor,3);assert.deepEqual(app.scene('robot').updates.at(-1),{path:clone(frame.path),position:clone(frame.position)});
  assert.deepEqual(app.saved().labs,{});assert.equal(app.calls.grade.length,0);
});

test('Applying engineering variant A changes the editable model and preserves first and last checked attempts',()=>{
  const app=runApp({hash:'#lab:engineering'});app.click('check:engineering');app.input('thickness',3);app.click('check:engineering');
  const checked=clone(app.saved().labs.engineering);app.trial('ec','capture');const reference=clone(app.current('engineering').controller.getView().reference);
  app.input('thickness',5);app.input('ribs',0);assert.deepEqual(app.saved().labs.engineering,checked);
  const old=app.current('engineering');app.trial('ec','apply');
  assert.equal(old.destroyed,true);assert.deepEqual(app.saved().drafts.engineering,reference);
  assert.deepEqual(app.saved().labs.engineering,checked);assert.deepEqual(clone(app.current('engineering').controller.getView().reference),reference);
  assert.equal(app.document.getElementById('thickness').value,String(reference.thickness));
  assert.equal(app.scene('engineering').options.thickness,reference.thickness);
  app.click('check:engineering');assert.equal(app.saved().labs.engineering.attempts,checked.attempts+1);
  assert.deepEqual(app.saved().labs.engineering.first,checked.first);assert.deepEqual(app.saved().labs.engineering.firstDraft,checked.firstDraft);
  assert.deepEqual(app.saved().labs.engineering.last,E.gradeLab(engineering,reference));
});

test('The real XR visitor trial preserves responses and attempts through choosing, rerendering, and returning to the editor',()=>{
  const app=runApp({hash:'#lab:xr'}),before=app.raw();
  app.trial('xp','launch');app.trial('xp','begin');app.trial('xp','choose','[data-xp-choice="satellite"]');
  assert.equal(app.current('xr').controller.getView().stage,'feedback');assert.equal(app.raw(),before);assert.equal(app.calls.grade.length,0);
  assert.equal(app.scene('xr').updates.at(-1).visitorChoice,'satellite');
  app.click('scene-mode:xr');assert.equal(app.current('xr').controller.getView().stage,'feedback');
  app.trial('xp','editor');assert.equal(app.current('xr').controller.getView().stage,'idle');assert.deepEqual(app.saved().labs,{});
  app.trial('xp','launch');app.trial('xp','begin');app.trial('xp','choose','[data-xp-choice="rover"]');
  app.click('branch:xr:feedback:praise');assert.equal(app.current('xr').controller.getView().stage,'idle');assert.deepEqual(app.saved().labs,{});
  app.click('check:xr');assert.equal(app.saved().labs.xr.attempts,1);assert.equal(app.calls.grade.length,1);
});

function populateViews(app){
  app.trial('rd','step');app.trial('rd','step');app.click('scene-view:robot:top');app.click('scene-mode:robot');
  app.navigate('lab:engineering');app.trial('ec','capture');
  app.navigate('lab:xr');app.trial('xp','launch');app.trial('xp','begin');app.trial('xp','choose','[data-xp-choice="rover"]');app.click('scene-mode:xr');
  app.navigate('labs');app.click('campus-pick:research');app.click('scene-mode:campus');
}
function assertClearedViews(app){
  app.navigate('lab:robotics');assert.equal(app.current('robot').view,null);assert.equal(app.current('robot').controller.getFrame().cursor,0);
  assert.equal(app.scene('robot').options.camera,undefined);assert.equal(app.document.querySelector('[data-scene=robot]').hidden,false);
  app.navigate('lab:engineering');assert.equal(app.current('engineering').view,null);assert.equal(app.current('engineering').controller.getView().reference,null);
  app.navigate('lab:xr');assert.equal(app.current('xr').view,null);assert.equal(app.current('xr').controller.getView().stage,'idle');
  assert.equal(app.document.querySelector('[data-scene=xr]').hidden,false);
  app.navigate('labs');assert.equal(app.scene('campus').options.selectedLab,null);assert.equal(app.scene('campus').options.camera,undefined);
  assert.equal(app.document.querySelector('[data-scene=campus]').hidden,false);
  assert.equal(app.document.querySelectorAll('[data-campus-choice]').some(element=>element.getAttribute('aria-pressed')==='true'),false);
}

test('Importing a different session clears every trial view even when its commands and XR choices are identical',async()=>{
  const app=runApp();populateViews(app);const incoming=participant();incoming.sessionId='V-IN0001';
  app.navigate('transfer');await app.importFile(incoming);app.click('apply-import');
  assert.equal(app.saved().sessionId,incoming.sessionId);assert.equal(app.hash,'#lab:robotics');
  assert.equal(app.current('robot').view,null);assert.equal(app.current('robot').controller.getFrame().cursor,0);
  // Import already mounted the robot once. Check the remaining views before a
  // normal same-session rerender legitimately supplies the new cursor again.
  assert.equal(app.scene('robot').options.camera,undefined);assert.equal(app.document.querySelector('[data-scene=robot]').hidden,false);
  app.navigate('lab:engineering');assert.equal(app.current('engineering').view,null);assert.equal(app.current('engineering').controller.getView().reference,null);
  app.navigate('lab:xr');assert.equal(app.current('xr').view,null);assert.equal(app.current('xr').controller.getView().stage,'idle');assert.equal(app.document.querySelector('[data-scene=xr]').hidden,false);
  app.navigate('labs');assert.equal(app.scene('campus').options.selectedLab,null);assert.equal(app.scene('campus').options.camera,undefined);assert.equal(app.document.querySelector('[data-scene=campus]').hidden,false);
  assert.deepEqual(app.saved().labs,{});
});

test('Confirming a new route clears previous interactive views without converting them into saved attempts',()=>{
  const app=runApp();populateViews(app);app.navigate('choose');app.click('start:quick');app.click('confirm-start');
  assert.equal(app.hash,'#profile');assert.notEqual(app.saved().sessionId,'V-OLD001');assert.deepEqual(app.saved().labs,{});
  assertClearedViews(app);
});

test('Deleting a session clears campus choice and all trial views before another participant begins',()=>{
  const app=runApp();populateViews(app);app.navigate('hub');app.click('reset');
  assert.equal(app.raw(),undefined);app.navigate('labs');assert.equal(app.raw(),undefined);assert.equal(app.scene('campus').options.selectedLab,null);
  app.navigate('lab:robotics');app.click('start-lab:robotics');assert.equal(app.current('robot').view,null);assert.equal(app.current('robot').controller.getFrame().cursor,0);
  app.navigate('lab:engineering');assert.equal(app.current('engineering').view,null);assert.equal(app.current('engineering').controller.getView().reference,null);
  app.navigate('lab:xr');assert.equal(app.current('xr').view,null);assert.equal(app.current('xr').controller.getView().stage,'idle');
  assert.deepEqual(app.saved().labs,{});
});

test('A failed import preserves the active session and its interactive views for later continuation',async()=>{
  const app=runApp();populateViews(app);app.navigate('transfer');
  const incoming=participant();incoming.sessionId='V-IN0001';await app.importFile(incoming);
  app.faults.set=key=>{if(key===KEY+'-previous')throw new Error('storage blocked');};app.click('apply-import');
  assert.equal(app.saved().sessionId,'V-OLD001');assert.equal(app.hash,'#transfer');
  app.navigate('lab:robotics');assert.equal(app.current('robot').controller.getFrame().cursor,2);assert.equal(app.document.querySelector('[data-scene=robot]').hidden,true);
  app.navigate('lab:engineering');assert.deepEqual(clone(app.current('engineering').controller.getView().reference),{thickness:2,ribs:3});
  app.navigate('lab:xr');assert.equal(app.current('xr').controller.getView().stage,'feedback');assert.equal(app.current('xr').controller.getView().visitorChoice,'rover');
  app.navigate('labs');assert.equal(app.document.querySelector('[data-campus-choice="research"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(app.saved().labs,{});
});
