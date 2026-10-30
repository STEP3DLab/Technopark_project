'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../dist/engine.js');
const data=require('../dist/bank.json');
const KEY='rgsu-vector-1';
const source=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

function currentWork(){
 const state=E.emptyState('full');
 state.sessionId='V-OLD001';state.experienceVersion='2.0-visual';state.interestTiming={};
 state.age='16–18';state.experience.design=2;
 state.drafts.robotics={commands:['U','U','R']};state.resumeRoute='lab:robotics';
 return state;
}

function incomingWork(){
 const state=E.emptyState('quick');
 state.sessionId='V-IN0001';state.experienceVersion='2.0-visual';state.profileDone=true;
 state.age='12–13';state.answers[E.getQuestions(data,'quick')[0].id]=5;
 state.interestTiming={[E.getQuestions(data,'quick')[0].id]:'before-mission'};
 state.drafts.robotics={commands:['U','R','U']};state.resumeRoute='lab:robotics';
 state.planned=['engineering'];state.nextSteps={engineering:{artifact:'model',reviewDate:'2026-11-12'}};
 state.projectTrials={engineering:{status:'completed',happenedOn:'2026-11-10',note:'Сделал бумажную модель и проверил устойчивость.',next:'continue'}};
 return state;
}

function fileOf(object,name='work.json'){
 const raw=typeof object==='string'?object:JSON.stringify(object);
 return {name,size:Buffer.byteLength(raw),text:async()=>raw};
}

// This harness executes the complete browser app and its real event handlers.
// It supplies only DOM/storage surfaces used by these workflows; it does not
// expose or rewrite the app's private state or replace its domain functions.
function runApp({saved=currentWork(),hash='#transfer',initial={},faults={}}={}){
 const values=new Map(Object.entries(initial));
 if(saved!==null)values.set(KEY,JSON.stringify(saved));
 const documentListeners=new Map(),windowListeners=new Map(),pendingHash=[];
 let html='',nodes=new Map(),buttons=[],currentHash=hash;
 const toast={id:'toast',textContent:'',hidden:true};
 const document={activeElement:null,hidden:false};
 function node(attributes={}){
  const element={dataset:{},disabled:false,...attributes,focus(){document.activeElement=element;},prepend(){},scrollIntoView(){},remove(){},click(){},closest(selector){return selector==='[data-action]'&&element.dataset.action?element:null;}};
  return element;
 }
 const app={get innerHTML(){return html;},set innerHTML(value){
  html=value;nodes=new Map();buttons=[];
  // Parse emitted markup only, never implementation source. This is enough
  // to dispatch actions that the actual page makes available to the user.
  for(const match of html.matchAll(/<[a-z][a-z0-9-]*\b([^>]*)>/gi)){
   const attrs=match[1],id=/\bid="([^"]+)"/.exec(attrs)?.[1],action=/\bdata-action="([^"]+)"/.exec(attrs)?.[1],field=/\bdata-field="([^"]+)"/.exec(attrs)?.[1];
   if(!id&&!action)continue;
   const element=node({id,disabled:/(?:^|\s)disabled(?:\s|=|$)/.test(attrs),dataset:{...(action?{action}:{}),...(field?{field}:{})}});
   if(id)nodes.set(id,element);if(action)buttons.push(element);
  }
 }};
 Object.assign(document,{
  getElementById(id){return id==='app'?app:id==='toast'?toast:nodes.get(id)||null;},
  querySelectorAll(selector){return selector==='[data-action]'?buttons:[];},
  querySelector(){return null;},
  createElement(){return node({innerHTML:'',textContent:''});},
  body:{append(){}},
  addEventListener(type,listener){if(!documentListeners.has(type))documentListeners.set(type,[]);documentListeners.get(type).push(listener);}
 });
 const localStorage={
  getItem(key){if(faults.get)faults.get(key,values);return values.has(key)?values.get(key):null;},
  setItem(key,raw){if(faults.set)faults.set(key,raw,values);values.set(key,raw);},
  removeItem(key){if(faults.remove)faults.remove(key,values);values.delete(key);}
 };
 const location={get hash(){return currentHash;},set hash(value){const next=value.startsWith('#')?value:'#'+value;if(next!==currentHash){currentHash=next;pendingHash.push(true);}}};
 const window={VectorEngine:E,VECTOR_DATA:data,scrollY:0,scrollTo(){},confirm(){return true;},matchMedia(){return {matches:true};},print(){},addEventListener(type,listener){if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(listener);}};
 const context=vm.createContext({window,document,location,localStorage,Blob,URL:{createObjectURL(){return 'blob:synthetic';},revokeObjectURL(){}},setTimeout(){return 0;},clearTimeout(){},console});
 for(const file of ['continuity-storage.js','project-trials.js','app.js'])vm.runInContext(source(file),context,{filename:file});
 function flushHash(){
  let guard=0;
  while(pendingHash.length){if(++guard>20)throw new Error('Unexpected navigation loop');pendingHash.shift();for(const listener of windowListeners.get('hashchange')||[])listener();}
 }
 return {
  values,faults,
  get html(){return html;},get hash(){return location.hash;},get message(){return toast.textContent;},
  raw(){return values.get(KEY);},saved(){const raw=values.get(KEY);return raw===undefined?null:JSON.parse(raw);},
  actions(){return buttons.map(button=>button.dataset.action);},
  click(action){
   const button=buttons.find(item=>item.dataset.action===action);
   assert.ok(button,`Action must be rendered: ${action}`);assert.equal(button.disabled,false,`Action must be enabled: ${action}`);
   document.activeElement=button;
   for(const listener of documentListeners.get('click')||[])listener({target:button,preventDefault(){}});
   flushHash();
  },
  navigate(route){location.hash=route;flushHash();},
  async field(id,value){
   const target=nodes.get(id);assert.ok(target,`Field must be rendered: ${id}`);
   target.value=value;document.activeElement=target;
   for(const listener of documentListeners.get('change')||[])await listener({target});
   flushHash();
  },
  async files(id,files){
   assert.ok(nodes.has(id),`File input must be rendered: ${id}`);
   const target=node({id,files,dataset:{}});document.activeElement=target;
   for(const listener of documentListeners.get('change')||[])await listener({target});
   flushHash();
  }
 };
}

test('An unchecked draft with zero completed stages requires an explicit new-route decision; cancellation keeps the work',()=>{
 const original=currentWork();assert.equal(E.progress(data,original).completed,0);
 const app=runApp({saved:original,hash:'#choose'}),before=app.raw();
 app.click('start:quick');
 assert.equal(app.hash,'#new-route');assert.equal(app.raw(),before);
 assert.ok(app.actions().includes('confirm-start'));assert.ok(app.actions().includes('cancel-start'));
 assert.equal(app.values.has(KEY+'-previous'),false);
 app.click('cancel-start');
 assert.equal(app.hash,'#hub');
 const kept=app.saved();
 assert.equal(kept.sessionId,original.sessionId);assert.equal(kept.mode,'full');
 assert.deepEqual(kept.drafts,original.drafts);assert.deepEqual(kept.experience,original.experience);
 assert.equal(kept.age,original.age);assert.equal(kept.resumeRoute,original.resumeRoute);
 assert.equal(app.values.has(KEY+'-previous'),false);
});

test('Confirming a new route backs up the complete old work and starts a genuinely fresh session',()=>{
 const app=runApp({hash:'#choose'}),before=app.raw();
 app.click('start:quick');app.click('confirm-start');
 assert.equal(app.hash,'#profile');assert.equal(app.values.get(KEY+'-previous'),before);
 const fresh=app.saved();
 assert.notEqual(fresh.sessionId,'V-OLD001');assert.equal(fresh.mode,'quick');assert.equal(fresh.profileDone,false);
 assert.equal(fresh.age,'');assert.deepEqual(fresh.drafts,{});assert.deepEqual(fresh.answers,{});assert.deepEqual(fresh.projectTrials,{});
});

test('The real reset handler deletes current work and both backups while preserving unrelated data',()=>{
 const app=runApp({hash:'#hub',initial:{[KEY+'-recovery']:'damaged source',[KEY+'-previous']:'older source','another-app':'keep'}});
 app.click('reset');
 assert.equal(app.hash,'#home');
 for(const key of [KEY,KEY+'-recovery',KEY+'-previous'])assert.equal(app.values.has(key),false,key);
 assert.equal(app.values.get('another-app'),'keep');assert.match(app.message,/резервные копии удалены/);
 app.navigate('transfer');
 assert.equal(app.actions().includes('export-original'),false);assert.equal(app.actions().includes('export-previous'),false);
 assert.equal(app.actions().includes('export'),false,'the cleared in-memory session must not remain exportable');
});

test('A failed reset keeps the open work and cannot announce successful deletion',()=>{
 const app=runApp({hash:'#hub',initial:{[KEY+'-recovery']:'damaged source',[KEY+'-previous']:'older source'},faults:{remove(key){if(key===KEY+'-recovery')throw new Error('blocked');}}});
 const before=app.raw();app.click('reset');
 assert.equal(app.hash,'#hub');assert.equal(app.raw(),before);
 assert.equal(app.values.get(KEY+'-recovery'),'damaged source');assert.equal(app.values.get(KEY+'-previous'),'older source');
 assert.match(app.message,/Удаление не завершено/);assert.doesNotMatch(app.message,/копии удалены/);
 app.navigate('transfer');assert.match(app.html,/V-OLD001/);assert.ok(app.actions().includes('export'));
});

test('Selecting a personal file opens a reviewable preview; cancelling leaves the current work untouched',async()=>{
 const app=runApp(),before=app.raw(),incoming=incomingWork();
 await app.files('personal-file',[fileOf(E.createExport(data,incoming))]);
 assert.equal(app.hash,'#transfer');assert.equal(app.raw(),before);assert.equal(app.values.has(KEY+'-previous'),false);
 assert.match(app.html,/id="import-preview"/);assert.match(app.html,/V-IN0001/);assert.match(app.html,/V-OLD001/);
 assert.ok(app.actions().includes('apply-import'));app.click('cancel-import');
 assert.equal(app.raw(),before);assert.equal(app.actions().includes('apply-import'),false);
 assert.doesNotMatch(app.html,/id="import-preview"/);assert.match(app.html,/Открытие отменено/);
});

test('Applying a checked personal file preserves the previous work and resumes the incoming draft and plan',async()=>{
 const app=runApp(),before=app.raw(),incoming=incomingWork();
 await app.files('personal-file',[fileOf(E.createExport(data,incoming))]);app.click('apply-import');
 assert.equal(app.values.get(KEY+'-previous'),before);assert.equal(app.hash,'#lab:robotics');
 const restored=app.saved();
 assert.equal(restored.sessionId,incoming.sessionId);assert.equal(restored.mode,incoming.mode);
 assert.deepEqual(restored.drafts,incoming.drafts);assert.deepEqual(restored.answers,incoming.answers);
 assert.deepEqual(restored.nextSteps,incoming.nextSteps);assert.deepEqual(restored.projectTrials,incoming.projectTrials);
 assert.equal(restored.resumeRoute,incoming.resumeRoute);assert.match(app.message,/Работа открыта/);
});

test('Invalid, unsupported, and oversized files cannot replace the current work or create an apply action',async()=>{
 const valid=E.createExport(data,incomingWork());
 const samples=[fileOf('{'),fileOf({...valid,version:'unsupported'}),{...fileOf(valid),size:1024*1024+1}];
 for(const file of samples){
  const app=runApp(),before=app.raw();await app.files('personal-file',[file]);
  assert.equal(app.raw(),before);assert.equal(app.values.has(KEY+'-previous'),false);
  assert.equal(app.actions().includes('apply-import'),false);assert.doesNotMatch(app.html,/id="import-preview"/);
  assert.match(app.html,/<p id="import-status"[^>]*>[^<]+<\/p>/,'an error message must explain why no preview was opened');
 }
});

test('A failed import backup does not replace either the persisted or the open participant work',async()=>{
 const app=runApp({faults:{set(key){if(key===KEY+'-previous')throw new Error('quota');}}}),before=app.raw();
 await app.files('personal-file',[fileOf(E.createExport(data,incomingWork()))]);app.click('apply-import');
 assert.equal(app.hash,'#transfer');assert.equal(app.raw(),before);assert.equal(app.saved().sessionId,'V-OLD001');
 assert.match(app.html,/Не удалось записать работу/);assert.ok(app.actions().includes('apply-import'),'the candidate remains reviewable after a failed replacement');
 app.click('cancel-import');assert.match(app.html,/V-OLD001/);assert.doesNotMatch(app.html,/V-IN0001/);
});

test('A mentor can open a received personal card and project plan without replacing or editing the current route',async()=>{
 const incoming=incomingWork(),app=runApp({hash:'#mentor'}),before=app.raw();
 await app.files('group-files',[fileOf(E.createExport(data,incoming))]);
 assert.equal(app.raw(),before);assert.ok(app.actions().includes('go:received:'+incoming.sessionId));
 app.click('go:received:'+incoming.sessionId);
 assert.equal(app.hash,'#received:'+incoming.sessionId);assert.equal(app.raw(),before);
 assert.match(app.html,/КАРТА ИЗ ФАЙЛА · ТОЛЬКО ПРОСМОТР/);assert.match(app.html,/Сделал бумажную модель/);
 assert.equal(app.actions().some(action=>/^(plan|reflect|check):/.test(action)),false);
 assert.doesNotMatch(app.html,/data-plan-track=|data-trial-track=/);
 app.click('go:received-plan:'+incoming.sessionId);
 assert.equal(app.raw(),before);assert.match(app.html,/Мои следующие пробы/);assert.match(app.html,/Сделал бумажную модель/);
 assert.doesNotMatch(app.html,/data-plan-track=|data-trial-track=/);
 app.click('go:hub');
 assert.equal(app.saved().sessionId,'V-OLD001');assert.deepEqual(app.saved().drafts,currentWork().drafts);
 assert.equal(app.values.has(KEY+'-previous'),false,'viewing someone else’s file is not a personal replacement');
});

test('Clearing a group cancels an in-flight file read so its late result cannot repopulate the cleared list',async()=>{
 const app=runApp({hash:'#mentor'}),before=app.raw(),incoming=incomingWork();
 await app.files('group-files',[fileOf(E.createExport(data,incoming))]);
 assert.ok(app.actions().includes('clear-group'));
 const late=clone(incoming);late.sessionId='V-LATE01';
 const raw=JSON.stringify(E.createExport(data,late));
 let resolveRead;
 const reading=app.files('group-files',[{name:'slow-work.json',size:Buffer.byteLength(raw),text:()=>new Promise(resolve=>{resolveRead=resolve;})}]);
 assert.equal(typeof resolveRead,'function','the second upload must be awaiting its file content');
 app.click('clear-group');assert.match(app.html,/Сводка очищена/);
 resolveRead(raw);await reading;
 assert.match(app.html,/Сводка очищена/);
 assert.equal(app.actions().some(action=>action.startsWith('go:received:')),false);
 assert.equal(app.actions().includes('export-group'),false);
 assert.equal(app.raw(),before,'group cancellation never changes the participant save');
});

test('A valid import after failed startup recovery unlocks later saving when storage becomes available',async()=>{
 const corrupt='{"broken":';let blocked=true,recoveryAttempts=0;
 const app=runApp({saved:null,hash:'#transfer',initial:{[KEY]:corrupt},faults:{set(key){if(blocked&&key===KEY+'-recovery'){recoveryAttempts++;throw new Error('storage disabled');}}}});
 assert.equal(recoveryAttempts,1);assert.equal(app.raw(),corrupt);
 assert.equal(app.actions().includes('export'),false,'unreadable primary data must not invent an active participant session');
 blocked=false;
 await app.files('personal-file',[fileOf(E.createExport(data,incomingWork()))]);app.click('apply-import');
 assert.equal(app.saved().sessionId,'V-IN0001');assert.equal(app.values.get(KEY+'-previous'),corrupt);
 app.navigate('profile');await app.field('goal','project');
 assert.equal(app.saved().goal,'project','subsequent edits must persist instead of being blocked by the earlier recovery failure');
 assert.equal(app.saved().sessionId,'V-IN0001');assert.equal(app.values.get(KEY+'-previous'),corrupt);
});
