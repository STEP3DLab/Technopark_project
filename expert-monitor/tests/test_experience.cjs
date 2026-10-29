'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const X=require('../experience-ui.js');

test('palette prioritizes exact case number and never searches private notes',()=>{
  const records=[{id:'b',caseNumber:'A40-100/2026',title:'Осмотр здания',notes:'Секретный клиент'},
    {id:'a',caseNumber:'A40-10/2026',title:'Осмотр оборудования'}];
  assert.equal(X.paletteResults('A40-10/2026',records).items[0].id,'a');
  assert.equal(X.paletteResults('Секретный',records).total,0);
  assert.equal(X.paletteResults('Осмотр',records).total,2);
});
test('palette uses all words in any order and normalizes е/ё',()=>{
  const records=[{id:'one',caseNumber:'22',title:'Обмёры фасада корпуса'},{id:'two',title:'Обмеры помещения'}];
  assert.deepEqual(X.paletteResults('корпуса ОБМЕРЫ',records).items.map(x=>x.id),['one']);
  assert.equal(X.paletteResults('  22  ',records).items[0].id,'one');
  assert.equal(X.paletteResults('календарь').items[0].id,'planner');
});
test('empty palette is navigation only and limit is truthful',()=>{
  const records=Array.from({length:30},(_,i)=>({id:'r'+i,title:'Обследование '+i}));
  assert.equal(X.paletteResults('',records).items.length,9);
  assert.ok(X.paletteResults('',records).items.every(x=>x.kind==='view'));
  const found=X.paletteResults('Обследование',records,8);
  assert.equal(found.total,30);assert.equal(found.items.length,8);
  assert.equal(X.paletteResults('несуществующий термин',records).total,0);
});
test('palette does not expose raw markup as navigation targets or accept missing IDs',()=>{
  const result=X.paletteResults('Найти',[{title:'Найти без ID'},{id:'safe',title:'Найти <script>alert(1)</script>'}]);
  assert.equal(result.total,1);assert.equal(result.items[0].id,'safe');
  assert.equal(result.items[0].kind,'record');
  assert.ok(!Object.hasOwn(result.items[0],'search'));
});
test('arrow traversal wraps and empty results cannot be activated',()=>{
  assert.equal(X.nextIndex(-1,'ArrowDown',4),0);
  assert.equal(X.nextIndex(3,'ArrowDown',4),0);
  assert.equal(X.nextIndex(0,'ArrowUp',4),3);
  assert.equal(X.nextIndex(2,'Home',4),0);
  assert.equal(X.nextIndex(1,'End',4),3);
  assert.equal(X.nextIndex(0,'ArrowDown',0),-1);
});
test('preferences accept only known keys and cannot disable OS motion preference',()=>{
  assert.deepEqual(X.cleanPreferences({density:'compact',text:'large',motion:'reduce',notes:'private'}),{density:'compact',text:'large',motion:'reduce'});
  assert.deepEqual(X.cleanPreferences({density:'tiny',text:2,motion:'force-animation'}),X.DEFAULTS);
  assert.deepEqual(X.cleanPreferences(null),X.DEFAULTS);
  assert.deepEqual(X.cleanPreferences('bad'),X.DEFAULTS);
});
test('counter reports limits using DOM length without trimming or changing content',()=>{
  assert.deepEqual(X.counterState('  abc  ',10),{used:7,max:10,remaining:3,band:'normal'});
  assert.equal(X.counterState('a'.repeat(9),10).band,'near');
  assert.equal(X.counterState('a'.repeat(10),10).band,'full');
  assert.equal(X.counterState('a'.repeat(11),10).band,'over');
  assert.equal(X.counterState('a'.repeat(11),10).remaining,0);
  assert.equal(X.counterState('😀',10).used,2);
});
test('document titles follow view, detail and orphan fallback',()=>{
  assert.equal(X.titleFor({view:'planner'},null),'Планировщик · МСК Эксперт');
  assert.equal(X.titleFor({view:'opportunities',detailId:'a'},{caseNumber:'А40-12/2026'}),'№ А40-12/2026 · МСК Эксперт');
  assert.equal(X.titleFor({view:'workspace',detailId:'orphan'},null),'Моя работа · МСК Эксперт');
  assert.equal(X.titleFor({view:'invalid'},null),'Судебный мониторинг · МСК Эксперт');
});

// Tiny DOM model for the controller's actions; geometry is checked in a browser.
function boot(options={}){
  const nodes=new Map(),events=new Map(),notices=[],navigation=[],opened=[],stored=new Map(),state={view:'overview',db:{meta:{asOf:'2026-10-28'}}};
  let doc;
  class Node{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.attrs={};this.dataset={};this.children=[];this.listeners={};this.value='';this.hidden=false;this.open=false;this.isConnected=true;this._text='';this.writes=0;}
    set textContent(value){this._text=String(value);this.writes++;}get textContent(){return this._text;}
    set innerHTML(html){this._html=html;for(const match of html.matchAll(/<([\w-]+)\b([^>]*)>/g)){const attrs={};for(const a of match[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';if(!attrs.id)continue;const node=new Node(match[1]);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);this.appendChild(node);}}
    get innerHTML(){return this._html;}
    setAttribute(key,value){this.attrs[key]=String(value);if(key==='id'){this.id=String(value);nodes.set(this.id,this);}if(key.startsWith('data-'))this.dataset[key.slice(5)]=String(value);if(key==='hidden')this.hidden=true;}
    getAttribute(key){return this.attrs[key]??null;}removeAttribute(key){delete this.attrs[key];}
    appendChild(node){node.parentNode=this;this.children.push(node);if(node.id)nodes.set(node.id,node);return node;}
    insertBefore(node){return this.appendChild(node);}
    insertAdjacentElement(position,node){this.parentNode.appendChild(node);}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(value=>value!==fn);}
    dispatch(name,event={}){for(const fn of this.listeners[name]||[])fn({preventDefault(){},...event});}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatch('close');}
    focus(){doc.activeElement=this;}
    scrollIntoView(){}
    remove(){this.isConnected=false;if(this.id)nodes.delete(this.id);}
  }
  const body=new Node('body'),documentElement=new Node('html');
  doc={body,documentElement,activeElement:null,title:'',createElement:tag=>new Node(tag),
    querySelector(selector){if(selector.startsWith('#'))return nodes.get(selector.slice(1))||null;if(selector==='dialog[open]')return [...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null;return null;},
    querySelectorAll(selector){return selector==='dialog'?[...nodes.values()].filter(n=>n.tagName==='DIALOG'):[];},
    addEventListener(name,fn){(events.get('doc:'+name)||events.set('doc:'+name,[]).get('doc:'+name)).push(fn);},removeEventListener(){}};
  const main=new Node('main');main.id='main';body.appendChild(main);const opener=new Node('button');opener.id='launch';body.appendChild(opener);opener.focus();
  const win={navigator:{onLine:options.online??true},scrollY:0,localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>{if(win.failWrites)throw new Error('storage');stored.set(key,value);}},
    addEventListener(name,fn){(events.get(name)||events.set(name,[]).get(name)).push(fn);},removeEventListener(){},scrollTo(value){win.scrolled=value;}};
  const records=[{id:'record1',caseNumber:'100/26',title:'Обмеры здания'}];
  const controller=X.create({document:doc,window:win,state,records:()=>records,getRecord:id=>records.find(r=>r.id===id),notify:message=>notices.push(message),setView:view=>{state.view=view;navigation.push(view);},openDetail:id=>opened.push(id),icon:()=>'',refresh:()=>{win.refreshed=true;}});
  const action=(name,more={})=>controller.handleAction({dataset:{action:name,...more}});
  const fire=(name,event={})=>{const eventValue={preventDefault(){eventValue.prevented=true;},...event};for(const fn of events.get(name)||[])fn(eventValue);return eventValue;};
  return {controller,doc,win,state,nodes,notices,navigation,opened,stored,Node,action,fire};
}
test('palette action and keyboard selection navigate without rewriting records; Escape restores focus',()=>{
  const b=boot(),query=()=>b.nodes.get('experience-query');
  b.action('experience-palette');assert.equal(b.nodes.get('experience-palette-dialog').open,true);assert.equal(b.doc.activeElement,query());
  query().value='планировщик';b.controller.handleInput({target:query()});
  b.fire('doc:keydown',{key:'Enter'});assert.deepEqual(b.navigation,['planner']);assert.equal(b.doc.activeElement.id,'main');
  b.nodes.get('launch').focus();b.action('experience-palette');
  b.nodes.get('experience-palette-dialog').dispatch('cancel');assert.equal(b.doc.activeElement.id,'launch');
  b.action('experience-palette');query().value='100/26';b.controller.handleInput({target:query()});
  b.fire('doc:keydown',{key:'Enter'});assert.deepEqual(b.opened,['record1']);
});
test('palette shortcuts do not open over editor or activate empty results',()=>{
  const b=boot(),editor=new b.Node('dialog');editor.id='detail-dialog';editor.open=true;b.doc.body.appendChild(editor);
  b.fire('doc:keydown',{key:'k',ctrlKey:true});assert.equal(b.nodes.get('experience-palette-dialog').open,false);
  b.action('experience-palette');assert.equal(b.nodes.get('experience-palette-dialog').open,false);
  editor.open=false;b.fire('doc:keydown',{key:'k',metaKey:true});assert.equal(b.nodes.get('experience-palette-dialog').open,true);
  const query=b.nodes.get('experience-query');query.value='Не существующий предмет';b.controller.handleInput({target:query});
  b.fire('doc:keydown',{key:'ArrowDown'});b.fire('doc:keydown',{key:'Enter'});assert.deepEqual(b.navigation,[]);assert.deepEqual(b.opened,[]);
});
test('reading preferences persist, failed writes report tab-only state, cross-tab changes are validated',()=>{
  const b=boot();b.action('experience-settings');const field=b.nodes.get('experience-density');field.value='compact';b.controller.handleChange({target:field});
  assert.equal(JSON.parse(b.stored.get(X.PREF_KEY)).density,'compact');assert.equal(b.doc.documentElement.attrs['data-experience-density'],'compact');
  b.win.failWrites=true;field.value='comfortable';b.controller.handleChange({target:field});
  assert.equal(b.doc.documentElement.attrs['data-experience-density'],'comfortable');assert.equal(b.notices.length,1);assert.match(b.notices[0],/для этой вкладки/);
  b.fire('storage',{key:X.PREF_KEY,newValue:'{"text":"large","motion":"invalid"}'});assert.equal(b.doc.documentElement.attrs['data-experience-text'],'large');assert.equal(b.doc.documentElement.attrs['data-experience-motion'],'system');
});
test('offline and restored connection never relabel research freshness and retry is explicit',()=>{
  const b=boot({online:false});assert.equal(b.nodes.get('experience-network').hidden,false);assert.match(b.nodes.get('experience-network-text').textContent,/уже загруженный срез/);
  b.win.navigator.onLine=true;b.fire('online');assert.match(b.nodes.get('experience-network-text').textContent,/не меняет дату/);assert.equal(b.state.db.meta.asOf,'2026-10-28');assert.equal(b.win.refreshed,undefined);
  b.action('experience-retry');assert.equal(b.win.refreshed,true);b.action('experience-dismiss-network');assert.equal(b.nodes.get('experience-network').hidden,true);
});
test('character limits preserve form text and announce only threshold transitions',()=>{
  const b=boot(),field=new b.Node('textarea');field.id='task-text';field.value='x'.repeat(1799);b.doc.body.appendChild(field);b.controller.afterRender();
  const live=b.nodes.get('experience-counter-live'),before=live.writes;
  field.value='x'.repeat(1800);b.controller.handleInput({target:field});assert.equal(live.writes,before+1);
  field.value='x'.repeat(1801);b.controller.handleInput({target:field});assert.equal(live.writes,before+1);assert.equal(field.value.length,1801);
  field.value='x'.repeat(2001);b.controller.handleInput({target:field});assert.equal(live.writes,before+2);assert.equal(field.value.length,2001);
  assert.match(b.nodes.get('experience-count-task-text').textContent,/превышен/);
});
test('back-to-top uses focus and reduced-motion preferences, hidden while a modal is open',()=>{
  const b=boot();b.win.scrollY=900;b.fire('scroll');assert.equal(b.nodes.get('experience-top').hidden,false);
  b.fire('storage',{key:X.PREF_KEY,newValue:'{"motion":"reduce"}'});b.action('experience-top');assert.deepEqual(b.win.scrolled,{top:0,behavior:'instant'});assert.equal(b.doc.activeElement.id,'main');
  b.action('experience-help');assert.equal(b.nodes.get('experience-top').hidden,true);
});
