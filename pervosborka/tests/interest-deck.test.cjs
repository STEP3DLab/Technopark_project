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

function work(mode='full'){
 const state=E.emptyState(mode);
 state.sessionId='V-DECK01';state.experienceVersion='2.0-visual';state.interestTiming={};state.profileDone=true;
 return state;
}

// Execute the unmodified application and its real document/hash handlers.
// Only the emitted DOM and browser storage are adapted; private state and
// deck navigation functions are neither exposed nor replaced by the tests.
function runApp({saved=work(),hash='#interests:0'}={}){
 const values=new Map([[KEY,JSON.stringify(saved)]]),documentListeners=new Map(),windowListeners=new Map(),pendingHash=[];
 let html='',nodes=new Map(),buttons=[],currentHash=hash;
 const toast={id:'toast',textContent:'',hidden:true},document={activeElement:null,hidden:false};
 function node(attributes={}){
  const element={dataset:{},disabled:false,attributes:{},...attributes,focus(){document.activeElement=element;},prepend(){},scrollIntoView(){},remove(){},click(){},getAttribute(name){return element.attributes[name]??null;},closest(selector){return selector==='[data-action]'&&element.dataset.action?element:null;}};
  return element;
 }
 const app={get innerHTML(){return html;},set innerHTML(value){
  html=value;nodes=new Map();buttons=[];
  for(const match of html.matchAll(/<[a-z][a-z0-9-]*\b([^>]*)>/gi)){
   const raw=match[1],attributes=Object.fromEntries([...raw.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gi)].map(pair=>[pair[1],pair[2]]));
   const id=attributes.id,action=attributes['data-action'];
   if(!id&&!action)continue;
   const element=node({id,attributes,disabled:/(?:^|\s)disabled(?:\s|=|$)/.test(raw),dataset:{...(action?{action}:{}),...(attributes['data-field']?{field:attributes['data-field']}:{})}});
   if(id)nodes.set(id,element);if(action)buttons.push(element);
  }
 }};
 Object.assign(document,{
  getElementById(id){return id==='app'?app:id==='toast'?toast:nodes.get(id)||null;},
  querySelectorAll(selector){return selector==='[data-action]'?buttons:[];},querySelector(){return null;},
  createElement(){return node({innerHTML:'',textContent:''});},body:{append(){}},
  addEventListener(type,listener){if(!documentListeners.has(type))documentListeners.set(type,[]);documentListeners.get(type).push(listener);}
 });
 const localStorage={getItem(key){return values.get(key)??null;},setItem(key,raw){values.set(key,raw);},removeItem(key){values.delete(key);}};
 const location={get hash(){return currentHash;},set hash(value){const next=value.startsWith('#')?value:'#'+value;if(next!==currentHash){currentHash=next;pendingHash.push(true);}}};
 const window={VectorEngine:E,VECTOR_DATA:data,scrollY:0,scrollTo(){},confirm(){return true;},matchMedia(){return {matches:true};},print(){},addEventListener(type,listener){if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(listener);}};
 const context=vm.createContext({window,document,location,localStorage,Blob,URL:{createObjectURL(){return 'blob:synthetic';},revokeObjectURL(){}},setTimeout(){return 0;},clearTimeout(){},console});
 for(const file of ['continuity-storage.js','project-trials.js','app.js'])vm.runInContext(source(file),context,{filename:file});
 function flushHash(){let guard=0;while(pendingHash.length){if(++guard>20)throw new Error('Unexpected navigation loop');pendingHash.shift();for(const listener of windowListeners.get('hashchange')||[])listener();}}
 function button(action){const result=buttons.find(item=>item.dataset.action===action);assert.ok(result,'Rendered action: '+action);return result;}
 return {
  get html(){return html;},get hash(){return location.hash;},get focus(){return document.activeElement?.id;},
  saved(){return JSON.parse(values.get(KEY));},button,
  currentCard(){const ids=[...new Set(buttons.filter(item=>item.dataset.action.startsWith('answer:')).map(item=>item.dataset.action.split(':')[1]))];return ids.length===1?ids[0]:null;},
  currentDot(){return buttons.find(item=>item.dataset.action.startsWith('interest-jump:')&&item.getAttribute('aria-current')==='step')?.dataset.action;},
  click(action,{allowDisabled=false}={}){
   const target=button(action);if(!allowDisabled)assert.equal(target.disabled,false,'Enabled action: '+action);
   document.activeElement=target;for(const listener of documentListeners.get('click')||[])listener({target,preventDefault(){}});flushHash();
  },
  navigate(route){location.hash=route;flushHash();},
  async importFile(state){
   assert.ok(nodes.has('personal-file'),'The personal file picker must be visible');
   const raw=JSON.stringify(E.createExport(data,state)),target=node({id:'personal-file',files:[{name:'participant.json',size:Buffer.byteLength(raw),text:async()=>raw}]});
   for(const listener of documentListeners.get('change')||[])await listener({target});flushHash();
  }
 };
}

test('Choosing or changing an answer keeps the current card; explicit next requires a numeric answer or null',()=>{
 const questions=E.getQuestions(data,'full'),app=runApp();
 assert.equal(app.currentCard(),questions[0].id);assert.equal(app.button('interest-next:0').disabled,true);
 app.click('interest-next:0',{allowDisabled:true});
 assert.equal(app.currentCard(),questions[0].id);assert.deepEqual(app.saved().answers,{});
 app.click('answer:'+questions[0].id+':3');
 assert.equal(app.currentCard(),questions[0].id);assert.equal(app.currentDot(),'interest-jump:0:0');
 assert.equal(app.button('interest-next:0').disabled,false);assert.equal(app.saved().answers[questions[0].id],3);
 assert.equal(app.saved().interestTiming[questions[0].id],'before-mission');
 app.click('answer:'+questions[0].id+':null');
 assert.equal(app.currentCard(),questions[0].id);assert.equal(app.saved().answers[questions[0].id],null);
 assert.equal(app.button('answer:'+questions[0].id+':null').getAttribute('aria-pressed'),'true');
 assert.equal(app.button('interest-next:0').disabled,false);
 app.click('interest-next:0');
 assert.equal(app.currentCard(),questions[1].id);assert.equal(app.button('interest-next:0').disabled,true);
 assert.equal(app.focus,'interest-deck-question');assert.deepEqual(app.saved().answers,{[questions[0].id]:null});
});

test('Previous and numbered card navigation never create answers, including crossing a block boundary',()=>{
 const questions=E.getQuestions(data,'full'),app=runApp();
 app.click('interest-jump:0:7');assert.equal(app.currentCard(),questions[7].id);
 app.click('interest-prev:0');assert.equal(app.currentCard(),questions[6].id);
 app.click('interest-jump:0:0');assert.equal(app.currentCard(),questions[0].id);
 app.navigate('interests:1');assert.equal(app.currentCard(),questions[8].id);
 app.click('interest-prev:1');
 assert.equal(app.hash,'#interests:0');assert.equal(app.currentCard(),questions[7].id);
 assert.deepEqual(app.saved().answers,{});assert.deepEqual(app.saved().interestTiming,{});
 app.click('interest-jump:0:0');app.click('interest-prev:0');
 assert.equal(app.hash,'#labs');assert.deepEqual(app.saved().answers,{});
});

test('Cards and whole-block views preserve answers and the chosen card independently',()=>{
 const questions=E.getQuestions(data,'full'),app=runApp();
 app.click('answer:'+questions[0].id+':4');app.click('interest-jump:0:3');app.click('answer:'+questions[3].id+':null');
 app.click('interest-view:list');
 assert.equal(app.currentCard(),null);assert.equal(app.button('interest-view:list').getAttribute('aria-pressed'),'true');
 for(const q of questions.slice(0,8))app.button('answer:'+q.id+':5');
 app.click('answer:'+questions[5].id+':2');
 const answers={[questions[0].id]:4,[questions[3].id]:null,[questions[5].id]:2};
 assert.deepEqual(app.saved().answers,answers);
 app.click('interest-view:cards');
 assert.equal(app.currentCard(),questions[3].id);assert.equal(app.currentDot(),'interest-jump:0:3');
 assert.equal(app.button('interest-view:cards').getAttribute('aria-pressed'),'true');
 assert.equal(app.button('answer:'+questions[3].id+':null').getAttribute('aria-pressed'),'true');
 assert.deepEqual(app.saved().answers,answers);
 app.click('interest-next:0');assert.equal(app.currentCard(),questions[4].id);
 assert.deepEqual(app.saved().answers,answers);
});

test('Skipping a block fills only unanswered cards and preserves numeric answers, nulls and recorded answer timing',()=>{
 const state=work(),questions=E.getQuestions(data,'full');
 state.answers={[questions[0].id]:5,[questions[1].id]:null,[questions[2].id]:1};
 state.interestTiming={[questions[0].id]:'before-mission',[questions[2].id]:'after-mission'};
 const app=runApp({saved:state}),before=app.saved(),cursor=app.currentCard();
 app.click('skip-interests:0');
 assert.equal(app.currentCard(),cursor);
 for(const [id,value]of Object.entries(before.answers))assert.equal(app.saved().answers[id],value);
 for(const q of questions.slice(3,8))assert.equal(app.saved().answers[q.id],null);
 assert.equal(Object.keys(app.saved().answers).length,8);assert.deepEqual(app.saved().interestTiming,before.interestTiming);
 assert.equal(app.button('interest-next:0').disabled,false);
 app.click('interest-next:0');
 assert.equal(app.hash,'#interests:1');assert.equal(app.currentCard(),questions[8].id);assert.equal(app.button('interest-next:1').disabled,true);
 assert.equal(Object.keys(app.saved().answers).length,8);
});

test('Next from the final card returns to the first unanswered card instead of skipping earlier gaps',()=>{
 for(const mode of ['full','quick']){
  const state=work(mode),questions=E.getQuestions(data,mode);
  state.answers={[questions[0].id]:4,[questions[2].id]:null,[questions[7].id]:3};
  const app=runApp({saved:state});app.click('interest-jump:0:7');
  assert.equal(app.currentCard(),questions[7].id);assert.equal(app.button('interest-next:0').disabled,false);
  app.click('interest-next:0');
  assert.equal(app.hash,'#interests:0');assert.equal(app.currentCard(),questions[1].id);
  assert.equal(app.button('interest-next:0').disabled,true);assert.deepEqual(app.saved().answers,state.answers);
 }
});

test('The completed final block opens situations in full and quick routes, from both viewing modes',()=>{
 for(const mode of ['full','quick'])for(const view of ['cards','list']){
  const state=work(mode),questions=E.getQuestions(data,mode),lastPage=Math.ceil(questions.length/8)-1;
  questions.forEach((q,i)=>state.answers[q.id]=i%3===0?null:4);
  const app=runApp({saved:state,hash:'#interests:'+lastPage});
  if(view==='list')app.click('interest-view:list');
  app.click(view==='cards'?'interest-next:'+lastPage:'go:situation:0');
  assert.equal(app.hash,'#situation:0',mode+' / '+view);assert.deepEqual(app.saved().answers,state.answers);
 }
});

test('Reload selects the first unanswered card and restores answers even after viewing a later card in whole-block mode',()=>{
 const state=work(),questions=E.getQuestions(data,'full');
 state.answers={[questions[0].id]:2,[questions[1].id]:null,[questions[3].id]:4};
 const app=runApp({saved:state});assert.equal(app.currentCard(),questions[2].id);
 app.click('interest-jump:0:6');app.click('answer:'+questions[6].id+':5');app.click('interest-view:list');
 const saved=app.saved(),reloaded=runApp({saved,hash:app.hash});
 assert.equal(reloaded.currentCard(),questions[2].id);assert.equal(reloaded.currentDot(),'interest-jump:0:2');
 assert.equal(reloaded.button('interest-view:cards').getAttribute('aria-pressed'),'true');
 assert.deepEqual(reloaded.saved().answers,saved.answers);assert.deepEqual(reloaded.saved().interestTiming,saved.interestTiming);
});

test('Starting a confirmed new session resets the view and cursor without reusing the previous answers',()=>{
 const app=runApp(),questions=E.getQuestions(data,'full');
 app.click('interest-jump:0:7');app.click('answer:'+questions[7].id+':4');app.click('interest-view:list');
 app.navigate('choose');app.click('start:quick');app.click('confirm-start');
 assert.equal(app.hash,'#profile');assert.equal(app.saved().mode,'quick');assert.deepEqual(app.saved().answers,{});
 app.navigate('interests:0');
 assert.equal(app.currentCard(),E.getQuestions(data,'quick')[0].id);assert.equal(app.currentDot(),'interest-jump:0:0');
 assert.equal(app.button('interest-view:cards').getAttribute('aria-pressed'),'true');assert.deepEqual(app.saved().answers,{});
});

test('Applying an imported session resets its view and cursor to its own first unanswered card',async()=>{
 const app=runApp();app.click('interest-jump:0:7');app.click('interest-view:list');
 const incoming=work('quick'),questions=E.getQuestions(data,'quick');incoming.sessionId='V-NEW001';
 incoming.answers={[questions[0].id]:4,[questions[1].id]:null};incoming.interestTiming={[questions[0].id]:'before-mission'};incoming.resumeRoute='interests:0';
 app.navigate('transfer');await app.importFile(incoming);app.click('apply-import');
 assert.equal(app.hash,'#interests:0');assert.equal(app.saved().sessionId,incoming.sessionId);
 assert.equal(app.currentCard(),questions[2].id);assert.equal(app.currentDot(),'interest-jump:0:2');
 assert.equal(app.button('interest-view:cards').getAttribute('aria-pressed'),'true');
 assert.deepEqual(app.saved().answers,incoming.answers);assert.deepEqual(app.saved().interestTiming,incoming.interestTiming);
});

test('Invalid persisted answer values cannot unlock next after restoration',()=>{
 for(const value of ['5',0,6,false,{},[]]){
  const state=work(),question=E.getQuestions(data,'full')[0];state.answers[question.id]=value;
  const app=runApp({saved:state});
  assert.equal(app.currentCard(),question.id);assert.equal(app.button('interest-next:0').disabled,true);
  assert.equal(Object.hasOwn(app.saved().answers,question.id),false);
 }
});
