'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/interaction-guide.js'),'utf8');

// The real module runs against a small DOM with node identity, bubbling clicks,
// inert ancestors, focus, SVG nodes and exact inline-style priorities.
class Style{
 constructor(){this.values=new Map();}
 getPropertyValue(name){return this.values.get(name)?.value||'';}
 getPropertyPriority(name){return this.values.get(name)?.priority||'';}
 setProperty(name,value,priority=''){this.values.set(name,{value:String(value),priority});}
 removeProperty(name){this.values.delete(name);}
}
class Events{
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn,capture=false){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({fn,capture});}
 removeEventListener(type,fn,capture=false){const next=(this.listeners.get(type)||[]).filter(item=>item.fn!==fn||item.capture!==capture);if(next.length)this.listeners.set(type,next);else this.listeners.delete(type);}
 dispatchEvent(event){if(!event.target)event.target=this;for(const item of [...(this.listeners.get(event.type)||[])])item.fn(event);return !event.defaultPrevented;}
 count(){return [...this.listeners.values()].reduce((sum,list)=>sum+list.length,0);}
}
function event(type,props={}){return {type,detail:0,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...props};}
class Element extends Events{
 constructor(document,tag){super();this.ownerDocument=document;this.nodeType=1;this.tagName=tag.toUpperCase();this.parentNode=null;this.childNodes=[];this.attrs=new Map();this.style=new Style();this.className='';this.id='';this.inert=false;this.disabled=false;this._tabIndex=null;this._text='';this.value='';this.scrollTop=0;}
 get children(){return this.childNodes;}
 get isConnected(){return this===this.ownerDocument.documentElement||!!this.ownerDocument.documentElement.contains(this);}
 get textContent(){return this._text+this.childNodes.map(node=>node.textContent).join('');}
 set textContent(value){this._text=String(value);this.childNodes.forEach(node=>node.parentNode=null);this.childNodes=[];}
 get tabIndex(){return this._tabIndex!==null?this._tabIndex:['BUTTON','INPUT','SELECT','TEXTAREA'].includes(this.tagName)||(this.tagName==='A'&&this.getAttribute('href'))?0:-1;}
 set tabIndex(value){this._tabIndex=Number(value);}
 get hidden(){return this.attrs.has('hidden');}
 set hidden(value){if(value)this.setAttribute('hidden','');else this.removeAttribute('hidden');}
 setAttribute(name,value){value=String(value);if(name==='id')this.id=value;else if(name==='class')this.className=value;else if(name==='tabindex')this._tabIndex=Number(value);else if(name==='inert')this.inert=true;this.attrs.set(name,value);}
 getAttribute(name){if(name==='id')return this.id||null;if(name==='class')return this.className||null;if(name==='tabindex')return this._tabIndex===null?null:String(this._tabIndex);return this.attrs.get(name)??null;}
 removeAttribute(name){this.attrs.delete(name);if(name==='inert')this.inert=false;if(name==='tabindex')this._tabIndex=null;}
 hasAttribute(name){return this.getAttribute(name)!==null;}
 contains(node){return this===node||this.childNodes.some(child=>child.contains(node));}
 append(...nodes){nodes.forEach(node=>this.appendChild(node));}
 appendChild(node){node.remove();this.childNodes.push(node);node.parentNode=this;return node;}
 replaceChildren(...nodes){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];this._text='';this.append(...nodes);}
 remove(){if(!this.parentNode)return;const parent=this.parentNode;parent.childNodes.splice(parent.childNodes.indexOf(this),1);this.parentNode=null;if(this.contains(this.ownerDocument.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();const tag=/^[a-z][a-z0-9-]*/i.exec(part)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;for(const cls of part.matchAll(/\.([a-z0-9_-]+)/gi))if(!this.className.split(/\s+/).includes(cls[1]))return false;for(const attr of part.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g))if(attr[2]===undefined?!this.hasAttribute(attr[1]):this.getAttribute(attr[1])!==attr[2])return false;return true;});}
 closest(selector){for(let node=this;node;node=node.parentNode)if(node.matches(selector))return node;return null;}
 querySelectorAll(selector){const result=[];for(const child of this.children){if(child.matches(selector))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getClientRects(){return this.isConnected&&!this.closest('[hidden]')?[{}]:[];}
 focus(){this.ownerDocument.activeElement=this;this.ownerDocument.dispatchEvent(event('focusin',{target:this}));}
 click(){if(this.disabled)return;const e=event('click',{target:this});for(let node=this;node&&!e.stopped;node=node.parentNode)node.dispatchEvent(e);if(!e.stopped)this.ownerDocument.dispatchEvent(e);}
}
function runtime(){
 const document=new Events();document.documentElement=new Element(document,'html');document.documentElement.clientWidth=985;document.body=new Element(document,'body');document.documentElement.append(document.body);document.activeElement=document.body;
 document.createElement=tag=>new Element(document,tag);document.createElementNS=(_,tag)=>new Element(document,tag);document.querySelector=selector=>document.documentElement.querySelector(selector);document.querySelectorAll=selector=>document.documentElement.querySelectorAll(selector);
 const window=new Events();document.defaultView=window;window.document=document;window.innerWidth=1000;window.scrollX=7;window.scrollY=420;window.scrollCalls=[];
 window.scrollTo=options=>{window.scrollCalls.push({...options});if(options.behavior==='instant'){window.scrollX=options.left||0;window.scrollY=options.top||0;}};
 window.getComputedStyle=node=>({display:node.style.getPropertyValue('display')||'block',visibility:node.style.getPropertyValue('visibility')||'visible',paddingRight:node.style.getPropertyValue('padding-right')||'0px'});
 for(const name of ['VectorEngine','VECTOR_DATA','localStorage','sessionStorage','location','fetch','setTimeout','setInterval','requestAnimationFrame'])Object.defineProperty(window,name,{get(){throw new Error('Interaction guide cannot access '+name);}});
 const sandbox={window,module:{exports:{}}};vm.runInNewContext(source,sandbox,{filename:'interaction-guide.js'});
 const main=document.createElement('main'),opener=document.createElement('button'),input=document.createElement('input'),previouslyHidden=document.createElement('aside');main.id='main';opener.setAttribute('data-guide-open','engineering');opener.setAttribute('aria-expanded','false');opener.setAttribute('aria-controls','old-control');input.value='unchanged draft';main.append(opener,input);previouslyHidden.setAttribute('inert','');previouslyHidden.setAttribute('aria-hidden','true');document.body.append(main,previouslyHidden);
 return {api:sandbox.module.exports,document,window,main,opener,input,previouslyHidden,overlay:()=>document.querySelector('.ig-overlay'),mount:options=>sandbox.module.exports.mount(document,options),key(key,props={}){const e=event('keydown',{key,target:document.activeElement,...props});document.dispatchEvent(e);return e;},action(name){const node=document.querySelector('[data-guide-action="'+name+'"]');assert.ok(node);node.click();},step(index){document.querySelector('[data-guide-step="'+index+'"]').click();}};
}

test('Context helpers return independent three-step interaction guides and reject untrusted or unknown contexts',()=>{
 const env=runtime(),contexts=['labs','engineering','robotics','code','ai','design','xr','research','social','interests','situations'];
 for(const context of contexts){const list=env.api.steps(context);assert.equal(list.length,3,context);for(const step of list){assert.ok(step.title.length>5);assert.ok(step.body.length>30);assert.ok(step.visual);}}
 const first=env.api.steps('engineering');first[0].title='changed';first.pop();assert.equal(env.api.steps('engineering').length,3);assert.notEqual(env.api.steps('engineering')[0].title,'changed');
 assert.equal(env.api.steps(' CAMPUS ')[0].body,env.api.steps('labs')[0].body);assert.equal(env.api.steps('lab:robotics')[1].body,env.api.steps('robot')[1].body);
 const robot=env.api.steps('robotics').map(step=>step.body).join(' ');assert.match(robot,/Один шаг →/);assert.match(robot,/Проверить решение/);
 for(const context of ['unknown','__proto__','<img src=x onerror=alert(1)>',null]){assert.equal(env.api.steps(context).length,0);assert.equal(env.api.html(context),'');}
 const markup=env.api.html('campus');assert.match(markup,/data-guide-open="labs"/);assert.match(markup,/aria-haspopup="dialog"/);assert.match(markup,/Как здесь работать/);assert.doesNotMatch(markup,/data-action=|autofocus|<script|onerror/);
});

test('Mount is passive; an explicit trigger opens a named first step with focus, SVG and an inert background',()=>{
 const env=runtime(),guide=env.mount();assert.equal(guide.isOpen,false);assert.equal(env.overlay(),null);assert.equal(env.document.count(),1);assert.equal(env.window.count(),0);
 env.opener.focus();env.opener.click();const overlay=env.overlay();
 assert.equal(guide.isOpen,true);assert.equal(overlay.getAttribute('role'),'dialog');assert.equal(overlay.getAttribute('aria-modal'),'true');assert.ok(overlay.querySelector('svg'));
 assert.equal(env.document.activeElement,overlay.querySelector('.ig-step-title'));assert.match(env.document.activeElement.getAttribute('aria-label'),/Шаг 1 из 3/);
 assert.equal(env.main.inert,true);assert.equal(env.main.getAttribute('aria-hidden'),'true');assert.equal(env.opener.getAttribute('aria-expanded'),'true');assert.equal(env.opener.getAttribute('aria-controls'),overlay.id);
 assert.equal(env.document.querySelector('[data-guide-action="previous"]').disabled,true);assert.equal(env.document.querySelectorAll('[aria-current="step"]').length,1);guide.destroy();
});

test('Next, previous and step dots only change guide content; Done restores the opener without altering the task',()=>{
 const env=runtime(),guide=env.mount();guide.open('robotics',env.opener);const first=env.overlay().querySelector('.ig-step-title').textContent;
 env.action('next');assert.match(env.overlay().querySelector('.ig-count').textContent,/2 из 3/);assert.equal(env.document.activeElement,env.overlay().querySelector('.ig-step-title'));assert.match(env.overlay().querySelector('.ig-step-body').textContent,/Один шаг/);
 env.action('previous');assert.equal(env.overlay().querySelector('.ig-step-title').textContent,first);
 env.step(2);assert.match(env.overlay().querySelector('.ig-count').textContent,/3 из 3/);assert.equal(env.document.querySelector('[data-guide-action="next"]').textContent,'Понятно, вернуться');
 assert.equal(env.input.value,'unchanged draft');assert.equal(env.input.parentNode,env.main);
 env.action('next');assert.equal(guide.isOpen,false);assert.equal(env.overlay(),null);assert.equal(env.document.activeElement,env.opener);assert.equal(env.input.value,'unchanged draft');
 assert.equal(env.opener.getAttribute('aria-expanded'),'false');assert.equal(env.opener.getAttribute('aria-controls'),'old-control');assert.equal(env.document.count(),1);assert.equal(env.window.count(),0);guide.destroy();
});

test('Tab traps focus without disabled controls; Escape closes once and composition keeps its own key events',()=>{
 const env=runtime(),guide=env.mount();guide.open('engineering',env.opener);const close=env.overlay().querySelector('.ig-close'),next=env.document.querySelector('[data-guide-action="next"]');
 next.focus();assert.equal(env.key('Tab').defaultPrevented,true);assert.equal(env.document.activeElement,close);
 assert.equal(env.key('Tab',{shiftKey:true}).defaultPrevented,true);assert.equal(env.document.activeElement,next);
 env.input.focus();assert.equal(env.document.activeElement,close);
 assert.equal(env.key('Escape',{isComposing:true}).defaultPrevented,false);assert.equal(guide.isOpen,true);
 const escape=env.key('Escape');assert.equal(escape.defaultPrevented,true);assert.equal(escape.stopped,true);assert.equal(guide.isOpen,false);assert.equal(env.document.activeElement,env.opener);
 assert.equal(env.key('Escape').defaultPrevented,false);assert.equal(env.document.count(),1);guide.destroy();assert.equal(env.document.count(),0);
});

test('Closing restores exact body style priorities, synchronous scroll and pre-existing background states',()=>{
 const env=runtime(),guide=env.mount(),style=env.document.body.style;
 style.setProperty('position','relative','important');style.setProperty('overflow','visible');style.setProperty('padding-right','6px');env.main.setAttribute('aria-hidden','false');
 guide.open('xr',env.opener);assert.equal(style.getPropertyValue('position'),'fixed');assert.equal(style.getPropertyValue('top'),'-420px');assert.equal(style.getPropertyValue('padding-right'),'21px');
 windowScrollAtLock();style.setProperty('color','red');guide.close();
 function windowScrollAtLock(){env.window.scrollX=0;env.window.scrollY=0;}
 assert.equal(env.window.scrollX,7);assert.equal(env.window.scrollY,420);assert.deepEqual(env.window.scrollCalls,[{left:7,top:420,behavior:'instant'}]);
 assert.equal(style.getPropertyValue('position'),'relative');assert.equal(style.getPropertyPriority('position'),'important');assert.equal(style.getPropertyValue('overflow'),'visible');assert.equal(style.getPropertyValue('padding-right'),'6px');assert.equal(style.getPropertyValue('color'),'red');assert.equal(style.getPropertyValue('width'),'');
 assert.equal(env.main.inert,false);assert.equal(env.main.getAttribute('aria-hidden'),'false');assert.equal(env.previouslyHidden.inert,true);assert.equal(env.previouslyHidden.getAttribute('aria-hidden'),'true');assert.equal(guide.close(),false);guide.destroy();
});

test('A foreign modal blocks the guide, while the explicit before-open callback can close it without nesting',()=>{
 const env=runtime(),foreign=env.document.createElement('section');foreign.setAttribute('role','dialog');foreign.setAttribute('aria-modal','true');env.document.body.append(foreign);
 const blocked=env.mount();assert.equal(blocked.open('labs',env.opener),false);assert.equal(env.overlay(),null);assert.equal(env.document.body.style.getPropertyValue('position'),'');blocked.destroy();
 let calls=0;const guide=env.mount({onBeforeOpen(){calls++;foreign.remove();}});assert.equal(guide.open('labs',env.opener),true);assert.equal(calls,1);assert.equal(env.document.querySelectorAll('[aria-modal="true"]').length,1);
 env.action('next');assert.equal(guide.open('campus',env.opener),true);assert.equal(calls,1);assert.match(env.overlay().querySelector('.ig-count').textContent,/2 из 3/);
 const overlay=env.overlay();assert.equal(guide.open('unknown',env.opener),false);assert.equal(env.overlay(),overlay);assert.match(env.overlay().querySelector('.ig-count').textContent,/2 из 3/);guide.destroy();
 const veto=env.mount({onBeforeOpen:()=>false});assert.equal(veto.open('code',env.opener),false);assert.equal(env.main.inert,false);assert.equal(env.overlay(),null);veto.destroy();
});

test('Backdrop dismissal requires a backdrop press; a drag from inside and a cancelled pointer do not close',()=>{
 const env=runtime(),guide=env.mount();guide.open('interests',env.opener);const overlay=env.overlay(),visual=overlay.querySelector('svg');
 overlay.dispatchEvent(event('pointerdown',{target:visual}));env.document.dispatchEvent(event('click',{target:overlay,detail:1}));assert.equal(guide.isOpen,true);
 overlay.dispatchEvent(event('pointerdown',{target:overlay}));overlay.dispatchEvent(event('pointercancel'));env.document.dispatchEvent(event('click',{target:overlay,detail:1}));assert.equal(guide.isOpen,true);
 overlay.dispatchEvent(event('pointerdown',{target:overlay}));env.document.dispatchEvent(event('click',{target:overlay,detail:1}));assert.equal(guide.isOpen,false);assert.equal(env.document.activeElement,env.opener);assert.equal(overlay.count(),0);guide.destroy();
});

test('Destroy removes all listeners and returns body state before route replacement without stealing focus',()=>{
 const env=runtime(),guide=env.mount();guide.open('research',env.opener);const overlay=env.overlay();guide.destroy();
 assert.equal(env.overlay(),null);assert.equal(guide.isOpen,false);assert.equal(env.main.inert,false);assert.equal(env.document.body.style.getPropertyValue('position'),'');assert.notEqual(env.document.activeElement,env.opener);
 assert.equal(env.document.count(),0);assert.equal(env.window.count(),0);assert.equal(overlay.count(),0);assert.equal(guide.open('research',env.opener),false);
 env.opener.click();assert.equal(env.overlay(),null);guide.destroy();assert.equal(env.document.count(),0);
});

test('Remount replaces the old controller and printing closes without focusing a disconnected opener',()=>{
 const env=runtime(),first=env.mount();first.open('design',env.opener);const second=env.mount();assert.equal(first.isOpen,false);assert.equal(first.open('design',env.opener),false);assert.equal(env.document.count(),1);
 second.open('social',env.opener);env.main.remove();env.window.dispatchEvent(event('beforeprint'));
 assert.equal(second.isOpen,false);assert.equal(env.overlay(),null);assert.equal(env.main.isConnected,false);assert.notEqual(env.document.activeElement,env.opener);assert.equal(env.document.body.style.getPropertyValue('position'),'');assert.equal(env.window.count(),0);second.destroy();assert.equal(env.document.count(),0);
});
