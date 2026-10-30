'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/mission-focus.js'),'utf8');

// Execute the actual module and its emitted markup. This DOM retains node
// identity, live control values, bubbling clicks, focus and inert/hidden state.
class Events{
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn,capture=false){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({fn,capture});}
 removeEventListener(type,fn,capture=false){const list=(this.listeners.get(type)||[]).filter(item=>item.fn!==fn||item.capture!==capture);if(list.length)this.listeners.set(type,list);else this.listeners.delete(type);}
 dispatchEvent(event){for(const item of [...(this.listeners.get(event.type)||[])])item.fn(event);}
 count(){return [...this.listeners.values()].reduce((sum,list)=>sum+list.length,0);}
}
function event(type,props={}){return {type,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...props};}
class Element extends Events{
 constructor(document,tag){super();this.ownerDocument=document;this.tagName=tag.toUpperCase();this.parentNode=null;this.childNodes=[];this.attrs=new Map();this.style={};this._text='';this.value='';this.disabled=false;}
 get children(){return this.childNodes;}
 get className(){return this.getAttribute('class')||'';}set className(value){this.setAttribute('class',value);}
 get classList(){return {contains:name=>this.className.split(/\s+/).includes(name),toggle:(name,force)=>{const list=new Set(this.className.split(/\s+/).filter(Boolean)),enabled=force===undefined?!list.has(name):force;if(enabled)list.add(name);else list.delete(name);this.className=[...list].join(' ');return enabled;}};}
 get hidden(){return this.hasAttribute('hidden');}set hidden(value){if(value)this.setAttribute('hidden','');else this.removeAttribute('hidden');}
 get isConnected(){return this===this.ownerDocument.documentElement||this.ownerDocument.documentElement.contains(this);}
 setAttribute(name,value){this.attrs.set(name,String(value));}
 getAttribute(name){return this.attrs.get(name)??null;}
 hasAttribute(name){return this.attrs.has(name);}
 removeAttribute(name){this.attrs.delete(name);}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set textContent(value){this.children.forEach(child=>child.parentNode=null);this.childNodes=[];this._text=String(value);}
 set innerHTML(markup){
  this.textContent='';const stack=[this],voids=new Set(['INPUT','BR','IMG','HR','META','LINK']);
  for(const match of String(markup).matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)){
   const token=match[0];if(token.startsWith('</')){stack.pop();continue;}
   if(token.startsWith('<')){const parts=/^<([\w-]+)([\s\S]*?)\/?\s*>$/.exec(token),node=new Element(this.ownerDocument,parts[1]);for(const attr of parts[2].matchAll(/([^\s=\/]+)(?:="([^"]*)")?/g))node.setAttribute(attr[1],attr[2]??'');stack.at(-1).append(node);if(!token.endsWith('/>')&&!voids.has(node.tagName))stack.push(node);}
   else stack.at(-1)._text+=token;
  }
 }
 append(...nodes){for(const node of nodes){node.remove();this.childNodes.push(node);node.parentNode=this;}}
 remove(){if(!this.parentNode)return;this.parentNode.childNodes=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();const tag=/^[a-z][\w-]*/i.exec(part)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;for(const cls of part.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(cls[1]))return false;for(const attr of part.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g))if(attr[2]===undefined?!this.hasAttribute(attr[1]):this.getAttribute(attr[1])!==attr[2])return false;return true;});}
 closest(selector){for(let node=this;node;node=node.parentNode)if(node.matches(selector))return node;return null;}
 querySelectorAll(selector){const found=[];for(const node of this.children){if(node.matches(selector))found.push(node);found.push(...node.querySelectorAll(selector));}return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getClientRects(){
  if(!this.isConnected||this.closest('[hidden]'))return [];
  for(let node=this;node;node=node.parentNode)if(node.style.display==='none')return [];
  if(this.closest('.is-mission-focused')&&this.closest('.side-panel,.mission-location,.ig-card'))return [];
  return [{}];
 }
 focus(options){this.ownerDocument.activeElement=this;this.lastFocusOptions=options;}
 click(target=this){if(this.disabled)return;const e=event('click',{target});for(let node=target;node&&!e.stopped;node=node.parentNode)node.dispatchEvent(e);return e;}
}
function runtime(){
 const document=new Events();document.documentElement=new Element(document,'html');document.body=new Element(document,'body');document.documentElement.append(document.body);document.activeElement=document.body;
 document.createElement=tag=>new Element(document,tag);document.querySelectorAll=selector=>document.documentElement.querySelectorAll(selector);document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
 const window={document,getComputedStyle:node=>({display:node.style.display||'block',visibility:node.style.visibility||'visible'})};document.defaultView=window;
 for(const key of ['VectorEngine','VECTOR_DATA','localStorage','sessionStorage','fetch','location','setTimeout','setInterval','requestAnimationFrame'])Object.defineProperty(window,key,{get(){throw new Error('Mission focus must not access '+key);}});
 const sandbox={window,module:{exports:{}}};vm.runInNewContext(source,sandbox,{filename:'mission-focus.js'});const api=sandbox.module.exports;
 const mission=document.createElement('section');mission.className='studio-mission';document.body.append(mission);
 mission.innerHTML='<div class="mission-location"><a href="#labs">Лаборатории</a></div><div class="workspace-header"><h1>Задание</h1></div><div class="mission-context"><div class="draft-status">Изменено</div></div>'+api.html()+'<button class="ig-card">Как здесь работать</button><div class="workspace-grid"><div class="main-panel"><div class="panel-header"><p class="lab-intro">Условие</p><details open><summary>Правила</summary><p>Формулы</p></details></div><div class="panel-body"><canvas></canvas><input type="range" value="3"><textarea></textarea><button class="selected" aria-pressed="true">Выбор</button></div><div class="mission-dock"><button data-action="check:engineering">Проверить решение</button></div><div class="feedback">Последняя проверка</div></div><aside class="side-panel"><button>Сведения о лаборатории</button></aside></div>';
 const bar=mission.querySelector('[data-mission-focus-bar]'),toggle=bar.querySelector('[data-mission-focus-toggle]'),exit=bar.querySelector('[data-mission-focus-exit]'),input=mission.querySelector('input'),canvas=mission.querySelector('canvas');input.value='3';mission.querySelector('textarea').value='Мой вариант';
 return {api,document,window,mission,bar,toggle,exit,input,canvas,mount:options=>api.mount(document,options),key(key,props={}){const e=event('keydown',{key,target:document.activeElement,...props});document.dispatchEvent(e);return e;}};
}

test('The optional bar mounts passively with an accessible toggle and an explicit exit',()=>{
 const env=runtime(),changes=[],controller=env.mount({onChange:active=>changes.push(active)});
 assert.match(env.api.html(),/Только задание/);assert.match(env.api.html(),/Полный вид/);assert.doesNotMatch(env.api.html(),/data-action=|autofocus|aria-modal/);
 assert.equal(controller.getView().active,false);assert.equal(env.toggle.getAttribute('aria-pressed'),'false');assert.equal(env.exit.hidden,true);assert.equal(env.document.documentElement.hasAttribute('data-mission-focus'),false);
 assert.equal(env.document.activeElement,env.document.body);assert.equal(env.mission.classList.contains('is-mission-focused'),false);assert.deepEqual(changes,[]);assert.equal(env.document.count(),1);controller.destroy();
});

test('Toggling retains the exact canvas, live controls, selections, rules and checked result',()=>{
 const env=runtime(),changes=[],controller=env.mount({onChange:active=>changes.push(active)}),body=env.canvas.parentNode,details=env.mission.querySelector('details'),selected=env.mission.querySelector('.selected'),feedback=env.mission.querySelector('.feedback');
 let sceneEvents=0;env.canvas.addEventListener('scene-test',()=>sceneEvents++);env.canvas.sceneController={camera:'existing camera'};
 env.toggle.focus();env.toggle.click(env.toggle.querySelector('svg'));
 assert.equal(controller.getView().active,true);assert.equal(env.mission.classList.contains('is-mission-focused'),true);assert.equal(env.document.documentElement.getAttribute('data-mission-focus'),'active');assert.equal(env.toggle.getAttribute('aria-pressed'),'true');assert.equal(env.exit.hidden,false);
 const external=controller.getView();external.active=false;assert.equal(controller.getView().active,true);
 assert.equal(env.document.querySelector('canvas'),env.canvas);assert.equal(env.canvas.parentNode,body);assert.equal(env.canvas.sceneController.camera,'existing camera');env.canvas.dispatchEvent(event('scene-test'));assert.equal(sceneEvents,1);
 assert.equal(env.input.value,'3');assert.equal(env.mission.querySelector('textarea').value,'Мой вариант');assert.equal(selected.getAttribute('aria-pressed'),'true');assert.equal(details.hasAttribute('open'),true);assert.equal(env.mission.querySelector('.feedback'),feedback);assert.equal(env.document.activeElement,env.toggle);
 env.exit.focus();env.exit.click();assert.equal(controller.getView().active,false);assert.equal(env.exit.hidden,true);assert.equal(env.document.activeElement,env.toggle);assert.equal(env.toggle.lastFocusOptions.preventScroll,true);assert.deepEqual(changes,[true,false]);assert.equal(env.canvas.parentNode,body);controller.destroy();
});

test('Restoring a temporary preference is silent; Escape exits without moving focus away from a task control',()=>{
 const env=runtime(),changes=[];env.input.focus();const controller=env.mount({active:true,onChange:active=>changes.push(active)});
 assert.equal(controller.getView().active,true);assert.deepEqual(changes,[]);assert.equal(env.document.activeElement,env.input);
 assert.equal(env.key('Escape',{isComposing:true}).defaultPrevented,false);assert.equal(controller.getView().active,true);
 env.key('Escape',{defaultPrevented:true});assert.equal(controller.getView().active,true);
 const key=env.key('Escape');assert.equal(key.defaultPrevented,true);assert.equal(key.stopped,true);assert.equal(controller.getView().active,false);assert.equal(env.document.activeElement,env.input);assert.deepEqual(changes,[false]);assert.equal(env.key('Escape').defaultPrevented,false);controller.destroy();
});

test('Visible ARIA or native dialogs own Escape, including nested and hidden modal combinations',()=>{
 const env=runtime(),controller=env.mount({active:true}),outer=env.document.createElement('div'),inner=env.document.createElement('dialog');outer.setAttribute('aria-modal','true');inner.setAttribute('open','');outer.append(inner);env.document.body.append(outer);
 assert.equal(env.key('Escape').defaultPrevented,false);assert.equal(controller.getView().active,true);
 inner.remove();assert.equal(env.key('Escape').defaultPrevented,false);assert.equal(controller.getView().active,true);
 outer.hidden=true;env.document.body.append(inner);assert.equal(env.key('Escape').defaultPrevented,false);assert.equal(controller.getView().active,true);
 inner.removeAttribute('open');const key=env.key('Escape');assert.equal(key.defaultPrevented,true);assert.equal(controller.getView().active,false);
 controller.destroy();
});

test('Programmatic background clicks cannot change the layout under a modal or invoke assessment actions',()=>{
 const env=runtime(),changes=[],controller=env.mount({active:true,onChange:active=>changes.push(active)}),modal=env.document.createElement('div');modal.setAttribute('aria-modal','true');env.document.body.append(modal);
 env.exit.click();assert.equal(controller.getView().active,true);assert.deepEqual(changes,[]);
 modal.remove();const check=env.mission.querySelector('[data-action]');check.click();assert.equal(controller.getView().active,true);assert.deepEqual(changes,[]);
 env.exit.click();assert.equal(controller.getView().active,false);env.exit.click();assert.deepEqual(changes,[false]);controller.destroy();
});

test('Focus returns to the toggle if activation hides its previous location',()=>{
 const env=runtime(),controller=env.mount();env.mission.querySelector('.ig-card').focus();env.toggle.click();
 assert.equal(controller.getView().active,true);assert.equal(env.document.activeElement,env.toggle);assert.equal(env.toggle.lastFocusOptions.preventScroll,true);controller.destroy();
});

test('Destroy restores owned attributes and listeners without callbacks, focus theft or resurrecting a route',()=>{
 const env=runtime(),changes=[];env.document.documentElement.setAttribute('data-mission-focus','previous');env.bar.setAttribute('data-active','original');env.toggle.setAttribute('aria-pressed','mixed');
 const originalNote=env.bar.querySelector('[data-mission-focus-note]').textContent,controller=env.mount({active:true,onChange:value=>changes.push(value)});env.input.focus();env.mission.remove();controller.destroy();controller.destroy();
 assert.equal(env.document.documentElement.getAttribute('data-mission-focus'),'previous');assert.equal(env.bar.getAttribute('data-active'),'original');assert.equal(env.toggle.getAttribute('aria-pressed'),'mixed');assert.equal(env.exit.hidden,true);assert.equal(env.bar.querySelector('[data-mission-focus-note]').textContent,originalNote);
 assert.equal(env.mission.isConnected,false);assert.equal(env.mission.classList.contains('is-mission-focused'),false);assert.equal(env.document.activeElement,env.input);assert.equal(controller.getView().active,false);assert.equal(env.document.count(),0);assert.equal(env.bar.count(),0);assert.deepEqual(changes,[]);
 env.toggle.click();assert.equal(env.document.documentElement.getAttribute('data-mission-focus'),'previous');assert.equal(env.key('Escape').defaultPrevented,false);
});

test('Remount replaces the owner; missing task or exit controls cannot enable an inescapable mode',()=>{
 const env=runtime(),first=env.mount({active:true}),second=env.api.mount(env.mission,{active:true});
 assert.equal(first.getView().active,false);assert.equal(second.getView().active,true);assert.equal(env.document.count(),1);assert.equal(env.bar.count(),1);second.destroy();assert.equal(env.document.count(),0);
 env.exit.remove();const incomplete=env.mount({active:true});assert.equal(incomplete.getView().active,false);assert.equal(env.document.documentElement.hasAttribute('data-mission-focus'),false);assert.equal(env.document.count(),0);incomplete.destroy();
 env.mission.remove();const absent=env.mount({active:true});assert.equal(absent.getView().active,false);assert.equal(env.document.count(),0);absent.destroy();
});
