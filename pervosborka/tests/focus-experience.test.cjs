'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/focus-experience.js'),'utf8');

// This small DOM keeps node identity, sibling order, focus, event listeners and
// inline-style priorities. No scoring or application globals are provided.
class Style{
 constructor(){this.values=new Map();}
 getPropertyValue(name){return this.values.get(name)?.value||'';}
 getPropertyPriority(name){return this.values.get(name)?.priority||'';}
 setProperty(name,value,priority=''){this.values.set(name,{value:String(value),priority});}
 removeProperty(name){const old=this.getPropertyValue(name);this.values.delete(name);return old;}
}
class EventTarget{
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn,capture=false){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({fn,capture});}
 removeEventListener(type,fn,capture=false){const list=this.listeners.get(type)||[];this.listeners.set(type,list.filter(item=>item.fn!==fn||item.capture!==capture));if(!this.listeners.get(type).length)this.listeners.delete(type);}
 dispatchEvent(event){if(!event.target)event.target=this;for(const item of [...(this.listeners.get(event.type)||[])])item.fn(event);return !event.defaultPrevented;}
 countListeners(){return [...this.listeners.values()].reduce((n,list)=>n+list.length,0);}
}
class Node extends EventTarget{
 constructor(document,type){super();this.ownerDocument=document;this.nodeType=type;this.parentNode=null;this.childNodes=[];}
 get children(){return this.childNodes.filter(node=>node.nodeType===1);}
 get nextSibling(){if(!this.parentNode)return null;return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
 get isConnected(){return this===this.ownerDocument.documentElement||!!this.ownerDocument.documentElement?.contains(this);}
 contains(node){return node===this||this.childNodes.some(child=>child.contains(node));}
 append(...nodes){nodes.forEach(node=>this.appendChild(node));}
 appendChild(node){node.parentNode?.removeChild(node);this.childNodes.push(node);node.parentNode=this;return node;}
 insertBefore(node,reference){if(!reference)return this.appendChild(node);assert.ok(this.childNodes.includes(reference));node.parentNode?.removeChild(node);this.childNodes.splice(this.childNodes.indexOf(reference),0,node);node.parentNode=this;return node;}
 replaceChild(node,old){assert.ok(this.childNodes.includes(old));node.parentNode?.removeChild(node);this.childNodes.splice(this.childNodes.indexOf(old),1,node);old.parentNode=null;node.parentNode=this;return old;}
 removeChild(node){const index=this.childNodes.indexOf(node);assert.ok(index>=0);this.childNodes.splice(index,1);node.parentNode=null;if(node.contains(this.ownerDocument.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;return node;}
 remove(){this.parentNode?.removeChild(this);}
 cloneNode(){throw new Error('Focus view must move nodes, never clone them.');}
}
class Element extends Node{
 constructor(document,tag){super(document,1);this.tagName=tag.toUpperCase();this.className='';this.attributes=new Map();this.dataset={};this.style=new Style();this.id='';this._tabIndex=null;this.disabled=false;this.hidden=false;this.inert=false;this.textContent='';}
 get tabIndex(){if(this._tabIndex!==null)return this._tabIndex;return ['BUTTON','INPUT','SELECT','TEXTAREA','IFRAME','OBJECT','EMBED'].includes(this.tagName)||(this.tagName==='A'&&this.getAttribute('href'))?0:-1;}
 set tabIndex(value){this._tabIndex=Number(value);}
 setAttribute(name,value){value=String(value);if(name==='id')this.id=value;else if(name==='class')this.className=value;else if(name==='tabindex')this._tabIndex=Number(value);else if(name==='inert')this.inert=true;else if(name==='hidden')this.hidden=true;this.attributes.set(name,value);}
 getAttribute(name){if(name==='id')return this.id||null;if(name==='class')return this.className||null;if(name==='tabindex')return this._tabIndex===null?null:String(this._tabIndex);if(name.startsWith('data-')){const key=name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase());if(Object.hasOwn(this.dataset,key))return String(this.dataset[key]);}return this.attributes.has(name)?this.attributes.get(name):null;}
 removeAttribute(name){this.attributes.delete(name);if(name==='inert')this.inert=false;if(name==='hidden')this.hidden=false;if(name==='tabindex')this._tabIndex=null;}
 hasAttribute(name){return this.getAttribute(name)!==null;}
 matches(selector){return selector.split(',').some(part=>{
  part=part.trim();const tag=/^[a-z][a-z0-9-]*/i.exec(part)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;
  for(const cls of part.matchAll(/\.([a-z0-9_-]+)/gi))if(!this.className.split(/\s+/).includes(cls[1]))return false;
  for(const attr of part.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g))if(attr[2]===undefined?!this.hasAttribute(attr[1]):this.getAttribute(attr[1])!==attr[2])return false;
  return true;
 });}
 closest(selector){for(let node=this;node?.nodeType===1;node=node.parentNode)if(node.matches(selector))return node;return null;}
 querySelectorAll(selector){const found=[];for(const child of this.children){if(child.matches(selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getClientRects(){return this.hidden||!this.isConnected?[]:[{}];}
 focus(){this.ownerDocument.activeElement=this;this.ownerDocument.dispatchEvent(event('focusin',{target:this}));}
 click(){if(this.disabled)return;const e=event('click',{target:this});for(let node=this;node;node=node.parentNode)node.dispatchEvent(e);}
}
function event(type,props={}){return {type,detail:0,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...props};}
function runtime(){
 const document=new EventTarget();document.documentElement=new Element(document,'html');document.documentElement.clientWidth=985;document.body=new Element(document,'body');document.documentElement.append(document.body);document.activeElement=document.body;
 document.createElement=tag=>new Element(document,tag);document.createComment=text=>Object.assign(new Node(document,8),{textContent:text});
 document.querySelector=selector=>document.documentElement.querySelector(selector);document.querySelectorAll=selector=>document.documentElement.querySelectorAll(selector);
 const window=new EventTarget();window.document=document;window.scrollX=13;window.scrollY=240;window.innerWidth=1000;window.scrollCalls=[];window.resizeCalls=0;
 window.scrollTo=options=>window.scrollCalls.push({...options});window.Event=class{constructor(type){Object.assign(this,event(type));}};
 const dispatch=window.dispatchEvent.bind(window);window.dispatchEvent=e=>{if(e.type==='resize')window.resizeCalls++;return dispatch(e);};
 window.getComputedStyle=node=>({display:node.dataset.action?.startsWith('scene-focus:')&&node.closest('.fx-stage')?'none':node.style.getPropertyValue('display')||'block',visibility:node.style.getPropertyValue('visibility')||'visible',paddingRight:node.style.getPropertyValue('padding-right')||'0px'});
 for(const name of ['VectorEngine','localStorage'])Object.defineProperty(window,name,{get(){throw new Error(name+' is outside the scene viewer.');}});
 const sandbox={window,module:{exports:{}}};vm.runInNewContext(source,sandbox);
 const route=document.createElement('main');route.id='main';const toast=document.createElement('div');toast.setAttribute('aria-hidden','false');const prehidden=document.createElement('aside');prehidden.setAttribute('inert','');prehidden.setAttribute('aria-hidden','true');
 document.body.append(route,toast,prehidden);
 function scene(kind='engineering'){
  const before=document.createElement('p'),shell=document.createElement('section'),after=document.createElement('p'),companion=document.createElement('div'),tail=document.createElement('p');
  shell.className='scene-shell';shell.dataset.sceneShell=kind;shell.setAttribute('aria-label','Модель и управление');
  const toolbar=document.createElement('div'),opener=document.createElement('button'),canvas=document.createElement('canvas'),rotate=document.createElement('button'),input=document.createElement('input'),action=document.createElement('button');
  opener.dataset.action='scene-focus:'+kind;opener.setAttribute('aria-expanded','false');opener.setAttribute('aria-controls','previous-control');canvas.tabIndex=0;input.value='3';action.textContent='Сделать шаг';
  toolbar.append(opener);shell.append(toolbar,canvas,rotate);companion.append(input,action);route.append(before,shell,after,companion,tail);
  const renderer={camera:{yaw:1,pitch:.4,distance:8},destroyed:false};shell.renderer=renderer;
  return {shell,opener,companion,canvas,rotate,input,action,renderer,before,after,tail};
 }
 return {api:sandbox.module.exports,window,document,route,toast,prehidden,scene,overlay:()=>document.querySelector('.fx-overlay'),keydown(props){const e=event('keydown',props);document.dispatchEvent(e);return e;}};
}

test('Enlarging moves the same scene and companion; controls, renderer and sibling order survive close',()=>{
 const env=runtime(),view=env.scene(),order=env.route.childNodes.slice(),focus=env.api.mount();let changes=0;
 view.action.addEventListener('click',()=>{changes++;view.input.value='4';});view.opener.focus();
 assert.equal(focus.open(view.shell,view.opener,{companion:view.companion}),true);assert.equal(focus.isOpen,true);assert.equal(focus.getShell(),view.shell);
 assert.equal(env.overlay().querySelector('.fx-stage').children[0],view.shell);assert.equal(env.overlay().querySelector('.fx-panel').children[0],view.companion);
 assert.equal(env.document.querySelectorAll('.scene-shell').length,1);assert.equal(view.shell.renderer,view.renderer);
 view.action.click();assert.equal(changes,1);assert.equal(view.input.value,'4');
 focus.close();assert.deepEqual(env.route.childNodes,order);assert.equal(view.input.value,'4');assert.equal(view.renderer.destroyed,false);
 assert.equal(env.document.activeElement,view.opener);assert.equal(env.window.resizeCalls,2);assert.equal(focus.getShell(),null);
});

test('Live metrics precede the companion panel and all three nodes return to their exact original positions',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount(),canvasGroup=env.document.createElement('div'),metrics=env.document.createElement('div');
 metrics.className='metrics';metrics.textContent='15';
 env.route.insertBefore(canvasGroup,view.shell);canvasGroup.append(view.shell,metrics);
 const routeOrder=env.route.childNodes.slice(),canvasOrder=canvasGroup.childNodes.slice();
 view.action.addEventListener('click',()=>{view.input.value='4';metrics.textContent='17';});
 focus.open(view.shell,view.opener,{companion:view.companion,additionalCompanion:metrics});
 assert.deepEqual(env.overlay().querySelector('.fx-panel').children,[metrics,view.companion]);
 assert.equal(env.document.querySelectorAll('.metrics').length,1);assert.equal(view.shell.renderer,view.renderer);
 view.action.click();assert.equal(metrics.textContent,'17');assert.equal(view.input.value,'4');
 focus.close();assert.deepEqual(env.route.childNodes,routeOrder);assert.deepEqual(canvasGroup.childNodes,canvasOrder);
 assert.equal(metrics.textContent,'17');assert.equal(view.input.value,'4');assert.equal(env.document.activeElement,view.opener);
 assert.equal(env.document.countListeners(),0);assert.equal(env.window.countListeners(),0);
});

test('Dialog names are safe text; background visibility, existing inert state and opener ARIA are restored exactly',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount();const title='<img src=x onerror=alert(1)> — лаборатория';view.shell.setAttribute('aria-label',title);
 focus.open(view.shell,view.opener,{companion:view.companion});const overlay=env.overlay();
 assert.equal(overlay.getAttribute('role'),'dialog');assert.equal(overlay.getAttribute('aria-modal'),'true');assert.equal(overlay.querySelector('h2').textContent,title);assert.equal(overlay.querySelectorAll('img').length,0);
 assert.equal(env.document.activeElement,overlay.querySelector('[data-fx-action="close"]'));
 assert.equal(env.route.inert,true);assert.equal(env.toast.getAttribute('aria-hidden'),'true');assert.equal(env.prehidden.inert,true);
 assert.equal(view.opener.getAttribute('aria-expanded'),'true');assert.equal(view.opener.getAttribute('aria-controls'),overlay.id);
 focus.close();assert.equal(env.route.inert,false);assert.equal(env.route.getAttribute('aria-hidden'),null);assert.equal(env.toast.getAttribute('aria-hidden'),'false');assert.equal(env.prehidden.inert,true);assert.equal(env.prehidden.getAttribute('aria-hidden'),'true');
 assert.equal(view.opener.getAttribute('aria-expanded'),'false');assert.equal(view.opener.getAttribute('aria-controls'),'previous-control');
});

test('Tab and Shift+Tab stay inside the dialog, including companion controls and excluding disabled/hidden nodes',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount();const hidden=env.document.createElement('button');hidden.hidden=true;const disabled=env.document.createElement('button');disabled.disabled=true;view.companion.append(hidden,disabled);
 focus.open(view.shell,view.opener,{companion:view.companion});const close=env.overlay().querySelector('[data-fx-action="close"]');
 view.action.focus();const forward=env.keydown({key:'Tab'});assert.equal(forward.defaultPrevented,true);assert.equal(env.document.activeElement,close);
 const backward=env.keydown({key:'Tab',shiftKey:true});assert.equal(backward.defaultPrevented,true);assert.equal(env.document.activeElement,view.action);
 view.canvas.focus();assert.equal(env.keydown({key:'ArrowRight'}).defaultPrevented,false,'scene keys retain their normal handler');
 focus.destroy();
});

test('Esc closes once, returns focus, and leaves the edited controls and camera untouched',()=>{
 const env=runtime(),view=env.scene(),events=[],focus=env.api.mount({onChange:x=>events.push(x)});focus.open(view.shell,view.opener,{companion:view.companion});
 view.renderer.camera.yaw=2;view.input.value='5';view.input.focus();const escape=env.keydown({key:'Escape'});
 assert.equal(escape.defaultPrevented,true);assert.equal(escape.stopped,true);assert.equal(focus.isOpen,false);assert.equal(env.overlay(),null);assert.equal(env.document.activeElement,view.opener);
 assert.equal(view.renderer.camera.yaw,2);assert.equal(view.input.value,'5');assert.deepEqual(events.map(x=>[x.open,x.reason]),[[true,'open'],[false,'escape']]);
 env.keydown({key:'Escape'});assert.equal(events.length,2);assert.equal(env.document.countListeners(),0);
});

test('Backdrop and close button close the view, but interacting with its scene does not',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount();focus.open(view.shell,view.opener);view.canvas.click();assert.equal(focus.isOpen,true);
 const overlay=env.overlay();overlay.dispatchEvent(event('pointerdown',{target:view.canvas}));overlay.dispatchEvent(event('click',{target:overlay,detail:1}));assert.equal(focus.isOpen,true,'a drag originating inside must not dismiss the view');
 overlay.dispatchEvent(event('pointerdown',{target:overlay}));overlay.dispatchEvent(event('click',{target:overlay,detail:1}));assert.equal(focus.isOpen,false);focus.open(view.shell,view.opener);env.overlay().querySelector('[data-fx-action="close"]').click();assert.equal(focus.isOpen,false);
 assert.equal(env.document.countListeners(),0);assert.equal(env.window.countListeners(),0);
});

test('Scroll locking preserves all owned styles and priorities, scroll position, and unrelated live style changes',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount(),style=env.document.body.style;
 style.setProperty('position','relative','important');style.setProperty('overflow','visible');style.setProperty('padding-right','6px');
 focus.open(view.shell,view.opener);assert.equal(style.getPropertyValue('position'),'fixed');assert.equal(style.getPropertyValue('top'),'-240px');assert.equal(style.getPropertyValue('left'),'-13px');assert.equal(style.getPropertyValue('padding-right'),'21px');
 style.setProperty('color','red');focus.close();assert.equal(style.getPropertyValue('position'),'relative');assert.equal(style.getPropertyPriority('position'),'important');assert.equal(style.getPropertyValue('overflow'),'visible');assert.equal(style.getPropertyValue('padding-right'),'6px');assert.equal(style.getPropertyValue('width'),'');assert.equal(style.getPropertyValue('top'),'');assert.equal(style.getPropertyValue('color'),'red');
 assert.deepEqual(env.window.scrollCalls,[{left:13,top:240,behavior:'instant'}]);
});

test('Destroy restores nodes before route teardown, removes listeners, and cannot reopen or steal focus',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount();focus.open(view.shell,view.opener,{companion:view.companion});
 focus.destroy();assert.equal(focus.isOpen,false);assert.equal(env.overlay(),null);assert.equal(view.shell.parentNode,env.route);assert.equal(view.companion.parentNode,env.route);assert.notEqual(env.document.activeElement,view.opener);
 assert.equal(env.document.countListeners(),0);assert.equal(env.window.countListeners(),0);assert.equal(focus.open(view.shell,view.opener),false);assert.equal(focus.close(),false);
 focus.destroy();assert.equal(env.document.body.style.getPropertyValue('position'),'');
});

test('Opening another controller replaces the existing overlay without nested scroll locks or orphaned nodes',()=>{
 const env=runtime(),first=env.scene('engineering'),second=env.scene('robot'),one=env.api.mount(),two=env.api.mount();
 one.open(first.shell,first.opener,{companion:first.companion});two.open(second.shell,second.opener,{companion:second.companion});
 assert.equal(one.isOpen,false);assert.equal(two.isOpen,true);assert.equal(env.document.querySelectorAll('.fx-overlay').length,1);assert.equal(first.shell.parentNode,env.route);assert.equal(first.companion.parentNode,env.route);
 one.destroy();assert.equal(two.isOpen,true);two.close();assert.equal(env.document.body.style.getPropertyValue('position'),'');assert.equal(env.route.inert,false);assert.equal(env.document.countListeners(),0);
});

test('A removed route receives its own nodes back without being resurrected or focusing disconnected controls',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount();focus.open(view.shell,view.opener,{companion:view.companion});env.route.remove();
 focus.close();assert.equal(view.shell.parentNode,env.route);assert.equal(view.companion.parentNode,env.route);assert.equal(env.route.isConnected,false);assert.equal(env.overlay(),null);assert.notEqual(env.document.activeElement,view.opener);assert.equal(env.document.body.style.getPropertyValue('position'),'');
});

test('Invalid targets and companions cannot produce cycles; reopening the same view is idempotent',()=>{
 const env=runtime(),view=env.scene(),focus=env.api.mount();assert.equal(focus.open(null,null),false);assert.equal(focus.open(env.route,null),false);assert.equal(env.overlay(),null);
 assert.equal(focus.open(view.shell,view.opener,{companion:env.route}),true);assert.equal(env.overlay().querySelector('.fx-panel'),null);const overlay=env.overlay();focus.open(view.shell,view.opener);assert.equal(env.overlay(),overlay);assert.equal(env.window.resizeCalls,1);focus.close();
 assert.equal(view.shell.parentNode,env.route);assert.equal(env.document.countListeners(),0);
});

test('Unexpected background focus is contained and printing returns the view to its route',()=>{
 const env=runtime(),view=env.scene(),events=[],focus=env.api.mount({onChange:x=>events.push(x.reason)});focus.open(view.shell,view.opener,{companion:view.companion});
 env.toast.focus();assert.equal(env.document.activeElement,env.overlay().querySelector('[data-fx-action="close"]'));
 env.window.dispatchEvent(event('beforeprint'));assert.equal(focus.isOpen,false);assert.equal(view.shell.parentNode,env.route);assert.equal(view.companion.parentNode,env.route);assert.deepEqual(events,['open','print']);assert.equal(env.document.countListeners(),0);assert.equal(env.window.countListeners(),0);
});
