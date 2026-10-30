'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/navigation-experience.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

// Exercise the real module with DOM identity, bubbling actions, mutation
// observation, focus, style priorities and a deterministic demand-frame queue.
class Style{
 constructor(){this.values=new Map();}
 getPropertyValue(name){return this.values.get(name)?.value||'';}
 getPropertyPriority(name){return this.values.get(name)?.priority||'';}
 setProperty(name,value,priority=''){this.values.set(name,{value:String(value),priority});}
 removeProperty(name){this.values.delete(name);}
}
class Events{
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn,settings=false){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({fn,settings});}
 removeEventListener(type,fn,settings=false){const list=(this.listeners.get(type)||[]).filter(item=>item.fn!==fn||item.settings!==settings);if(list.length)this.listeners.set(type,list);else this.listeners.delete(type);}
 dispatchEvent(event){if(!event.target)event.target=this;for(const {fn}of [...(this.listeners.get(event.type)||[])])fn(event);return !event.defaultPrevented;}
 count(){return [...this.listeners.values()].reduce((n,list)=>n+list.length,0);}
}
function event(type,props={}){return {type,detail:0,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...props};}
class Element extends Events{
 constructor(document,tag){super();this.ownerDocument=document;this.nodeType=1;this.tagName=tag.toUpperCase();this.parentNode=null;this.childNodes=[];this.attributes=new Map();this.className='';this.id='';this.style=new Style();this.inert=false;this.disabled=false;this._tabIndex=null;this._text='';this.checked=false;this.value='';}
 get children(){return this.childNodes;}
 get isConnected(){return this===this.ownerDocument.documentElement||!!this.ownerDocument.documentElement?.contains(this);}
 get textContent(){return this._text+this.childNodes.map(node=>node.textContent).join('');}
 set textContent(value){this._text=String(value);this.childNodes?.forEach(node=>node.parentNode=null);this.childNodes=[];}
 get hidden(){return this.attributes.has('hidden');}
 set hidden(value){if(value)this.setAttribute('hidden','');else this.removeAttribute('hidden');}
 get tabIndex(){return this._tabIndex!==null?this._tabIndex:['BUTTON','INPUT','SELECT','TEXTAREA'].includes(this.tagName)||(this.tagName==='A'&&this.getAttribute('href'))?0:-1;}
 set tabIndex(value){this._tabIndex=Number(value);}
 setAttribute(name,value){value=String(value);if(this.getAttribute(name)===value)return;if(name==='id')this.id=value;else if(name==='class')this.className=value;else if(name==='tabindex')this._tabIndex=Number(value);else if(name==='inert')this.inert=true;this.attributes.set(name,value);this.ownerDocument.notify?.({target:this,type:'attributes',attributeName:name});}
 getAttribute(name){if(name==='id')return this.id||null;if(name==='class')return this.className||null;if(name==='tabindex')return this._tabIndex===null?null:String(this._tabIndex);return this.attributes.get(name)??null;}
 removeAttribute(name){if(!this.attributes.has(name))return;this.attributes.delete(name);if(name==='inert')this.inert=false;this.ownerDocument.notify?.({target:this,type:'attributes',attributeName:name});}
 hasAttribute(name){return this.getAttribute(name)!==null;}
 contains(node){return this===node||this.childNodes.some(child=>child.contains(node));}
 append(...nodes){nodes.forEach(node=>this.appendChild(node));}
 appendChild(node){node.remove();this.childNodes.push(node);node.parentNode=this;this.ownerDocument.notify?.({target:this,type:'childList'});return node;}
 replaceChildren(...nodes){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];this._text='';this.append(...nodes);this.ownerDocument.notify?.({target:this,type:'childList'});}
 remove(){if(!this.parentNode)return;const parent=this.parentNode;parent.childNodes.splice(parent.childNodes.indexOf(this),1);this.parentNode=null;if(this.contains(this.ownerDocument.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;this.ownerDocument.notify?.({target:parent,type:'childList'});}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();const tag=/^[a-z][a-z0-9-]*/i.exec(part)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;for(const cls of part.matchAll(/\.([a-z0-9_-]+)/gi))if(!this.className.split(/\s+/).includes(cls[1]))return false;for(const attr of part.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g))if(attr[2]===undefined?!this.hasAttribute(attr[1]):this.getAttribute(attr[1])!==attr[2])return false;return true;});}
 closest(selector){for(let node=this;node;node=node.parentNode)if(node.matches(selector))return node;return null;}
 querySelectorAll(selector){const found=[];for(const child of this.children){if(child.matches(selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getClientRects(){return !this.isConnected||this.closest('[hidden]')?[]:[{}];}
 getBoundingClientRect(){return this.rect||(this.className==='nx-back-top'?{left:246,right:346,top:738,bottom:784,width:100,height:46}:{left:10,right:120,top:10,bottom:40,width:110,height:30});}
 scrollIntoView(options){this.scrollRequest=options;}
 focus(){this.ownerDocument.activeElement=this;this.ownerDocument.dispatchEvent(event('focusin',{target:this}));}
 click(){if(this.disabled)return;const e=event('click',{target:this});for(let node=this;node&&!e.stopped;node=node.parentNode)node.dispatchEvent(e);if(!e.stopped)this.ownerDocument.dispatchEvent(e);}
}
const catalog=[
 {id:'home',label:'Главная',description:'Начало экспедиции',route:'home',group:'Разделы'},
 ...[['engineering','Инженерия и 3D'],['robotics','Робототехника'],['code','Код и данные'],['ai','Искусственный интеллект'],['design','Дизайн и медиа'],['xr','XR и игры'],['research','Исследования и метрология'],['social','Социальные технологии']].map(([id,label])=>({id,label,description:'Практическая лаборатория',route:'lab:'+id,group:'Лаборатории',keywords:id==='social'?['ёлка','общественный проект']:[]})),
 {id:'interests',label:'Карточки интересов',description:'Выбрать занятия',route:'interests:0',group:'Разделы',keywords:'хочется интерес анкета'},
 {id:'report',label:'Моя карта',description:'Результаты маршрута',route:'report',group:'Разделы',keywords:'итоги результат'},
 {id:'hub',label:'Мой маршрут',description:'Продолжить прохождение',route:'hub',group:'Разделы',keywords:'прогресс'}
];
function runtime(){
 const document=new Events();document.observers=[];document.documentElement=new Element(document,'html');document.documentElement.clientWidth=360;document.documentElement.clientHeight=800;document.documentElement.scrollHeight=3400;document.body=new Element(document,'body');document.body.scrollHeight=3400;document.documentElement.append(document.body);document.activeElement=document.body;
 document.createElement=tag=>new Element(document,tag);document.querySelector=selector=>document.documentElement.querySelector(selector);document.querySelectorAll=selector=>document.documentElement.querySelectorAll(selector);document.getElementById=id=>[document.documentElement,...document.querySelectorAll('[id]')].find(node=>node.id===id)||null;
 document.notify=record=>{for(const observer of document.observers){if(!observer.target||!observer.target.contains(record.target))continue;if(record.type==='attributes'&&(!observer.settings.attributes||!observer.settings.attributeFilter.includes(record.attributeName)))continue;observer.callback([record]);}};
 const window=new Events(),motion=new Events(),frames=new Map();motion.matches=false;let frameId=0,route='home',entries=catalog.map(entry=>({...entry}));
 Object.assign(window,{document,scrollX:0,scrollY:240,innerWidth:360,innerHeight:800,scrollCalls:[],matchMedia(){return motion;},getComputedStyle(node){return {display:node.hidden?'none':node.style.getPropertyValue('display')||'block',visibility:node.style.getPropertyValue('visibility')||'visible',paddingRight:node.style.getPropertyValue('padding-right')||'0px'};},scrollTo(options){this.scrollCalls.push({...options});if(options.top!==undefined)this.scrollY=options.top;if(options.left!==undefined)this.scrollX=options.left;},requestAnimationFrame(fn){const id=++frameId;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}});
 window.MutationObserver=class{constructor(callback){this.callback=callback;this.target=null;document.observers.push(this);}observe(target,settings){this.target=target;this.settings=settings;}disconnect(){this.target=null;}};
 for(const key of ['localStorage','sessionStorage','fetch','VectorEngine'])Object.defineProperty(window,key,{get(){throw new Error(key+' is outside navigation.');}});
 const sandbox={window,module:{exports:{}}};vm.runInNewContext(source,sandbox,{filename:'navigation-experience.js'});
 const main=document.createElement('main');main.id='main';main.tabIndex=-1;const opener=document.createElement('button');opener.setAttribute('data-nav-open','');opener.setAttribute('aria-expanded','false');opener.setAttribute('aria-controls','previous');main.append(opener);const hidden=document.createElement('aside');hidden.setAttribute('inert','');hidden.setAttribute('aria-hidden','true');document.body.append(main,hidden);
 const routes=[],preferences=[];
 const options={getEntries:()=>entries,getCurrentRoute:()=>route,onNavigate(value){routes.push(value);route=value;main.focus();},onPreferences(value,detail){preferences.push({value:clone(value),detail:clone(detail)});}};
 function query(value){const input=document.querySelector('.nx-search');assert.ok(input);input.value=value;document.dispatchEvent(event('input',{target:input}));return document.querySelectorAll('[data-nav-entry]');}
 return {api:sandbox.module.exports,window,document,motion,main,opener,hidden,routes,preferences,options,frames,
  setEntries(value){entries=value;},setRoute(value){route=value;},
  mount(extra={}){return sandbox.module.exports.mount({...options,...extra});},
  modal(){return document.querySelector('.nx-overlay');},top(){return document.querySelector('.nx-back-top');},query,
  rows(){return document.querySelectorAll('[data-nav-entry]');},
  key(key,props={}){const e=event('keydown',{target:document.activeElement,key,...props});document.dispatchEvent(e);return e;},
  change(key,value){const input=document.querySelector('[data-nav-preference="'+key+'"]');assert.ok(input);input.checked=value;document.dispatchEvent(event('change',{target:input}));},
  flush(){let iterations=0;while(frames.size){assert.ok(++iterations<10,'Navigation must finish its demand frames');const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}return iterations;},
  scroll(y){window.scrollY=y;window.dispatchEvent(event('scroll'));this.flush();}
 };
}

test('Russian search handles case, ё/е, multiple words and real laboratory synonyms, with an honest count and empty state',()=>{
 const env=runtime(),nav=env.mount();nav.open();
 for(const [query,label]of[[' РОБОТ ','Робототехника'],['ИИ','Искусственный интеллект'],['нейрос','Искусственный интеллект'],['vr','XR и игры'],['3д','Инженерия и 3D'],['эксперимент измерение','Исследования и метрология'],['ЕЛКА','Социальные технологии']]){
  const rows=env.query(query);assert.equal(rows.length,1,query);assert.ok(rows[0].textContent.includes(label));assert.equal(env.document.querySelector('.nx-result-count').textContent,'Найдено: 1');
 }
 assert.equal(env.query('несуществующий раздел').length,0);assert.equal(env.document.querySelector('.nx-search').getAttribute('aria-activedescendant'),null);
 env.key('Enter');assert.deepEqual(env.routes,[]);assert.match(env.document.querySelector('.nx-empty').textContent,/ничего не найдено/);
 env.document.querySelector('[data-nav-clear]').click();assert.equal(env.rows().length,catalog.length);assert.equal(env.document.activeElement,env.document.querySelector('.nx-search'));
 nav.destroy();env.flush();
});

test('Empty search keeps the last three distinct sections, retains a paged destination, and never duplicates result entries',()=>{
 const env=runtime(),nav=env.mount();
 for(const route of ['lab:engineering','lab:code','lab:robotics','lab:engineering']){env.setRoute(route);nav.reportRoute(route);}
 nav.open();const recent=env.document.querySelector('.nx-result-group');
 assert.equal(recent.getAttribute('aria-label'),'Недавно открывали');
 assert.deepEqual(recent.querySelectorAll('.nx-option-label').map(node=>node.textContent),['Инженерия и 3D','Робототехника','Код и данные']);assert.equal(env.rows().length,catalog.length);
 nav.close();env.setRoute('interests:2');nav.reportRoute('interests:2');nav.open();
 assert.equal(env.rows()[0].querySelector('.nx-option-label').textContent,'Карточки интересов');env.rows()[0].click();assert.deepEqual(env.routes,['interests:2']);
 nav.destroy();const remounted=env.mount();remounted.open();assert.equal(env.rows()[0].querySelector('.nx-option-label').textContent,'Карточки интересов');remounted.destroy();
 const fresh=runtime(),freshNav=fresh.mount();freshNav.open();assert.deepEqual(fresh.document.querySelector('.nx-result-group').querySelectorAll('.nx-option-label').map(node=>node.textContent),['Главная']);freshNav.destroy();
});

test('Keyboard shortcuts, arrows and Enter navigate once; typing and a foreign modal keep their own keys',()=>{
 const env=runtime(),nav=env.mount(),input=env.document.createElement('input');env.main.append(input);input.focus();
 assert.equal(env.key('?').defaultPrevented,false);assert.equal(nav.isOpen,false);
 assert.equal(env.key('k',{ctrlKey:true}).defaultPrevented,true);assert.equal(nav.isOpen,true);
 const search=env.document.querySelector('.nx-search'),initial=search.getAttribute('aria-activedescendant');
 env.key('ArrowDown');assert.notEqual(search.getAttribute('aria-activedescendant'),initial);env.key('ArrowUp');assert.equal(search.getAttribute('aria-activedescendant'),initial);
 env.query('код');env.key('Enter');assert.deepEqual(env.routes,['lab:code']);assert.equal(nav.isOpen,false);assert.equal(env.document.activeElement,env.main);
 env.key('?');assert.equal(env.document.querySelector('[data-nav-tab="help"]').getAttribute('aria-selected'),'true');
 env.key('ArrowLeft');assert.equal(env.document.querySelector('[data-nav-tab="view"]').getAttribute('aria-selected'),'true');
 env.key('Escape');assert.equal(env.document.activeElement,env.main);assert.equal(nav.isOpen,false);
 const foreign=env.document.createElement('section');foreign.setAttribute('aria-modal','true');env.document.body.append(foreign);
 assert.equal(env.key('k',{metaKey:true}).defaultPrevented,false);assert.equal(env.key('?').defaultPrevented,false);env.opener.click();assert.equal(nav.isOpen,false);
 foreign.remove();env.opener.click();assert.equal(nav.isOpen,true);env.key('Escape');assert.equal(env.document.activeElement,env.opener);nav.destroy();
});

test('The dialog traps only visible controls and restores focus, background state, ARIA and scroll styles exactly',()=>{
 const env=runtime();env.document.body.style.setProperty('padding-right','9px','important');env.main.setAttribute('aria-hidden','false');
 const nav=env.mount();env.opener.focus();env.opener.click();
 const modal=env.modal(),search=env.document.querySelector('.nx-search'),close=env.document.querySelector('[data-nav-close]');
 assert.equal(modal.getAttribute('role'),'dialog');assert.equal(modal.getAttribute('aria-modal'),'true');assert.equal(env.main.inert,true);assert.equal(env.hidden.inert,true);assert.equal(env.document.activeElement,search);
 assert.equal(env.opener.getAttribute('aria-expanded'),'true');assert.equal(env.document.body.style.getPropertyValue('position'),'fixed');
 env.key('Tab');assert.equal(env.document.activeElement,close);env.key('Tab',{shiftKey:true});assert.equal(env.document.activeElement,search);
 env.opener.focus();assert.equal(env.document.activeElement,close,'background focus is contained');
 env.key('Escape');assert.equal(nav.isOpen,false);assert.equal(env.main.inert,false);assert.equal(env.main.getAttribute('aria-hidden'),'false');assert.equal(env.hidden.inert,true);assert.equal(env.hidden.getAttribute('aria-hidden'),'true');
 assert.equal(env.opener.getAttribute('aria-expanded'),'false');assert.equal(env.opener.getAttribute('aria-controls'),'previous');assert.equal(env.document.activeElement,env.opener);
 assert.equal(env.document.body.style.getPropertyValue('position'),'');assert.equal(env.document.body.style.getPropertyValue('padding-right'),'9px');assert.equal(env.document.body.style.getPropertyPriority('padding-right'),'important');assert.equal(env.window.scrollY,240);
 nav.open('view');env.window.dispatchEvent(event('beforeprint'));assert.equal(nav.isOpen,false);nav.destroy();
});

test('Appearance switches update owned attributes, preserve caller data, combine OS motion and survive only the document session',()=>{
 const env=runtime(),initial={largeText:false,highContrast:false,reducedMotion:false},nav=env.mount({getPreferences:()=>initial});nav.open('view');
 env.change('largeText',true);env.change('highContrast',true);
 assert.equal(env.document.documentElement.getAttribute('data-ui-text'),'large');assert.equal(env.document.documentElement.getAttribute('data-ui-contrast'),'high');assert.deepEqual(initial,{largeText:false,highContrast:false,reducedMotion:false});
 env.motion.matches=true;env.motion.dispatchEvent(event('change'));
 assert.equal(env.document.documentElement.getAttribute('data-ui-motion'),'reduced');assert.equal(env.preferences.at(-1).detail.effectiveReducedMotion,true);assert.equal(env.preferences.at(-1).detail.reason,'system-motion');assert.equal(env.document.querySelector('[data-nav-preference="reducedMotion"]').checked,false);
 env.change('reducedMotion',true);env.motion.matches=false;env.motion.dispatchEvent(event('change'));assert.equal(env.document.documentElement.getAttribute('data-ui-motion'),'reduced');
 env.change('reducedMotion',false);assert.equal(env.document.documentElement.getAttribute('data-ui-motion'),null);
 const copy=nav.getPreferences();copy.largeText=false;assert.equal(nav.getPreferences().largeText,true);
 nav.destroy();assert.equal(env.document.documentElement.getAttribute('data-ui-text'),null);assert.equal(env.document.documentElement.getAttribute('data-ui-contrast'),null);
 const remounted=env.mount();assert.deepEqual(clone(remounted.getPreferences()),{largeText:true,highContrast:true,reducedMotion:false,effectiveReducedMotion:false});remounted.destroy();
 const fresh=runtime(),freshNav=fresh.mount();assert.equal(freshNav.getPreferences().largeText,false);freshNav.destroy();
});

test('Back to top appears only after long scrolling, leaves actions unobscured, hides for dialogs and does not run a frame loop',()=>{
 const env=runtime(),nav=env.mount();env.flush();assert.equal(env.top().hidden,true);env.scroll(1000);assert.equal(env.top().hidden,false);
 const action=env.document.createElement('button');action.rect={left:230,right:350,top:720,bottom:788};env.main.append(action);env.flush();assert.equal(env.top().hidden,true);assert.equal(env.frames.size,0,'collision checks must settle');
 action.remove();env.flush();assert.equal(env.top().hidden,false);
 const foreign=env.document.createElement('section');foreign.setAttribute('aria-modal','true');env.document.body.append(foreign);env.flush();assert.equal(env.top().hidden,true);foreign.remove();env.flush();assert.equal(env.top().hidden,false);
 nav.open('help');env.flush();assert.equal(env.top().hidden,true);nav.close();env.flush();assert.equal(env.top().hidden,false);
 env.motion.matches=true;env.motion.dispatchEvent(event('change'));env.flush();env.top().click();assert.equal(env.window.scrollCalls.at(-1).top,0);assert.equal(env.window.scrollCalls.at(-1).behavior,'instant');assert.equal(env.document.activeElement,env.main);assert.equal(env.top().hidden,true);env.flush();assert.equal(env.frames.size,0);nav.destroy();
});

test('Remount and destroy leave no duplicate launcher, modal, listeners, active observers or pending frames',()=>{
 const env=runtime(),nav=env.mount();nav.open('view');env.change('highContrast',true);env.flush();const documentListeners=env.document.count(),windowListeners=env.window.count();
 const next=env.mount();assert.equal(nav.isOpen,false);assert.equal(env.document.querySelectorAll('.nx-back-top').length,1);assert.equal(env.document.querySelectorAll('.nx-overlay').length,0);assert.equal(env.document.count(),documentListeners);assert.equal(env.window.count(),windowListeners);
 next.open();assert.equal(env.main.inert,true);next.destroy();next.destroy();assert.equal(env.main.inert,false);assert.equal(env.document.querySelectorAll('.nx-back-top').length,0);assert.equal(env.document.querySelectorAll('.nx-overlay').length,0);assert.equal(env.document.count(),0);assert.equal(env.window.count(),0);assert.equal(env.motion.count(),0);assert.equal(env.frames.size,0);assert.ok(env.document.observers.every(observer=>observer.target===null));
 const updates=env.preferences.length;env.motion.dispatchEvent(event('change'));assert.equal(env.preferences.length,updates);assert.equal(env.key('k',{ctrlKey:true}).defaultPrevented,false);assert.equal(next.open(),false);env.flush();
});

test('Catalog text is literal; duplicate or nonlocal destinations are excluded and route changes close stale dialogs',()=>{
 const env=runtime();env.setEntries([{id:'literal',label:'<img src=x onerror=alert(1)>',description:'<script>text</script>',group:'<b>Раздел</b>',route:'method'},{id:'literal',label:'Duplicate',route:'hub'},{id:'external',label:'Unsafe',route:'javascript:alert(1)'},{id:'url',label:'Remote',route:'https://example.org'},{id:'route-copy',label:'Same route',route:'method'},null]);
 const nav=env.mount();nav.open();assert.equal(env.rows().length,1);assert.equal(env.rows()[0].querySelector('.nx-option-label').textContent,'<img src=x onerror=alert(1)>');assert.equal(env.document.querySelectorAll('img,script').length,0);
 env.setRoute('method');nav.reportRoute('method');assert.equal(nav.isOpen,false);assert.equal(env.main.inert,false);assert.deepEqual(env.routes,[]);nav.destroy();
});
