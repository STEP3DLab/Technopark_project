'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/part-inspector.js'),'utf8');
const window={};
for(const name of ['VectorEngine','TechScenes','localStorage','sessionStorage','fetch'])Object.defineProperty(window,name,{get(){throw new Error(name+' must remain outside PartInspector.');}});
const context={window,module:{exports:{}}};vm.runInNewContext(source,context,{filename:'part-inspector.js'});const inspector=context.module.exports;

// DOM surface for the actual emitted controls. Nodes remain stable during
// updates; events run the module's real delegated handler without app state.
function surface(initial=''){
 const document={activeElement:null},listeners=new Map();let markup='',writes=0,panel=null,nodes=new Map();
 function element(attributes={}){
  const attrs=new Map(Object.entries(attributes)),node={ownerDocument:document,disabled:attrs.has('disabled'),textContent:'',getAttribute(name){return attrs.get(name)??null;},setAttribute(name,value){attrs.set(name,String(value));},hasAttribute(name){return attrs.has(name);},focus(options){document.activeElement=node;node.focusOptions=options;},closest(selector){if(selector==='[data-pi-root]')return panel;if(selector==='[data-pi-part],[data-pi-clear]')return attrs.has('data-pi-part')||attrs.has('data-pi-clear')?node:null;return null;}};
  return node;
 }
 const root={ownerDocument:document,matches(){return false;},get innerHTML(){return markup;},set innerHTML(value){
  writes++;markup=value;nodes=new Map();panel=element({'data-pi-root':''});panel.contains=node=>node===panel||[...nodes.values()].includes(node);panel.querySelector=selector=>nodes.get(selector)||null;
  for(const match of value.matchAll(/<button\b([^>]*)>/g)){
   const attrs=Object.fromEntries([...match[1].matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gi)].map(pair=>[pair[1],pair[2]]));
   if(/\bdisabled(?:\s|$)/.test(match[1]))attrs.disabled='';if(/\bdata-pi-clear(?:\s|$)/.test(match[1]))attrs['data-pi-clear']='';
   const button=element(attrs),key=Object.hasOwn(attrs,'data-pi-part')?'[data-pi-part="'+attrs['data-pi-part']+'"]':'[data-pi-clear]';nodes.set(key,button);
  }
  for(const name of ['data-pi-title','data-pi-description','data-pi-ribs-count'])nodes.set('['+name+']',element({[name]:''}));
 },querySelector(selector){return selector==='[data-pi-root]'?panel:nodes.get(selector)||null;},addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);}};
 if(initial)root.innerHTML=initial;
 function button(part){const node=root.querySelector(part==='clear'?'[data-pi-clear]':'[data-pi-part="'+part+'"]');assert.ok(node,'Rendered part '+part);return node;}
 return {root,document,button,get writes(){return writes;},get listenerCount(){return listeners.size;},get description(){return root.querySelector('[data-pi-description]').textContent;},get title(){return root.querySelector('[data-pi-title]').textContent;},get count(){return root.querySelector('[data-pi-ribs-count]').textContent;},click(part){const target=button(part);assert.equal(target.disabled,false);target.focus();let prevented=false;listeners.get('click')?.({target,preventDefault(){prevented=true;}});return prevented;},foreign(target){listeners.get('click')?.({target,preventDefault(){throw new Error('Foreign controls must be ignored.');}});}};
}

test('Markup supplies three named pressed-state buttons, a clear action and neutral part descriptions without scoring hints',()=>{
 const html=inspector.html({ribs:0});
 assert.equal([...html.matchAll(/data-pi-part="/g)].length,3);assert.equal([...html.matchAll(/aria-pressed="false"/g)].length,3);
 assert.match(html,/<button[^>]*data-pi-part="ribs"[^>]* disabled/);assert.match(html,/<button[^>]*data-pi-clear disabled/);
 assert.match(html,/role="group" aria-label="Выделить часть модели"/);assert.match(html,/role="status" aria-live="polite" aria-atomic="true"/);assert.match(html,/В текущем варианте рёбер нет/);
 assert.doesNotMatch(html,/2t|3r|прочност|правильн|15 из|успешн/);assert.doesNotMatch(inspector.html({ribs:'<img src=x>',selected:'<script>'}),/<img|<script>/);
});

test('Selecting and clearing parts emits exact presentation choices, preserves button nodes and keeps keyboard focus useful',()=>{
 const env=surface(),selected=[],controller=inspector.mount(env.root,{ribs:3,onSelect:value=>selected.push(value)}),base=env.button('base'),wall=env.button('wall'),ribs=env.button('ribs');
 assert.equal(env.writes,1);assert.equal(controller.getView().selected,null);assert.equal(env.button('clear').disabled,true);
 env.click('base');assert.equal(controller.getView().selected,'base');assert.equal(base.getAttribute('aria-pressed'),'true');assert.equal(env.title,'Основание');assert.equal(env.document.activeElement,base);
 env.click('wall');assert.equal(base.getAttribute('aria-pressed'),'false');assert.equal(wall.getAttribute('aria-pressed'),'true');assert.match(env.description,/Вертикальная пластина/);
 env.click('ribs');assert.equal(ribs.getAttribute('aria-pressed'),'true');assert.match(env.description,/Треугольные перемычки/);
 env.click('ribs');assert.equal(controller.getView().selected,null);assert.equal(env.document.activeElement,ribs);
 env.click('base');env.click('clear');assert.equal(controller.getView().selected,null);assert.equal(env.document.activeElement,base);assert.equal(env.button('clear').disabled,true);
 assert.deepEqual(selected,['base','wall','ribs',null,'base',null]);assert.equal(env.button('base'),base);assert.equal(env.button('wall'),wall);assert.equal(env.button('ribs'),ribs);assert.equal(env.writes,1);controller.destroy();
});

test('Live rib changes clear a disappearing selection once, keep range focus outside the panel, and do not revive selection on undo',()=>{
 const env=surface(),events=[],controller=inspector.mount(env.root,{ribs:4,selected:'ribs',onSelect:value=>events.push(value)}),ribs=env.button('ribs'),range={name:'ribs-range'};
 env.document.activeElement=range;controller.update({ribs:2});assert.equal(controller.getView().selected,'ribs');assert.equal(env.count,'2 шт.');assert.equal(env.button('ribs'),ribs);assert.deepEqual(events,[]);
 controller.update({ribs:0});assert.equal(controller.getView().selected,null);assert.equal(ribs.disabled,true);assert.equal(env.document.activeElement,range);assert.deepEqual(events,[null]);assert.match(env.description,/рёбер нет/);
 controller.update({ribs:0});controller.update({ribs:4});assert.equal(controller.getView().selected,null);assert.equal(ribs.disabled,false);assert.deepEqual(events,[null]);
 env.click('ribs');ribs.focus();controller.update({ribs:0});assert.equal(env.document.activeElement,env.button('base'),'a now-disabled focused part yields focus to a real available part');assert.deepEqual(events,[null,'ribs',null]);controller.destroy();
});

test('Explicit synchronization is silent, snapshots are independent, and invalid inputs cannot create an unavailable part',()=>{
 const options={ribs:3,selected:'wall',onSelect(){throw new Error('Synchronization must stay silent.');}},env=surface(inspector.html({ribs:3})),controller=inspector.mount(env.root,options);
 assert.equal(env.writes,1,'already supplied markup is reused');assert.equal(controller.getView().selected,'wall');
 const snapshot=controller.getView();snapshot.selected='base';assert.equal(controller.getView().selected,'wall');
 controller.update({selected:'base'});assert.equal(controller.getView().selected,'base');controller.update({ribs:0,selected:'ribs'});assert.equal(controller.getView().selected,null);
 for(const selected of ['fastener','<script>',{},false]){controller.update({selected});assert.equal(controller.getView().selected,null);}
 controller.update({ribs:'4'});assert.equal(env.count,'0 шт.');assert.equal(env.button('ribs').disabled,true);assert.equal(options.selected,'wall');assert.equal(options.ribs,3);controller.destroy();
});

test('Independent inspectors, foreign controls, remounts and destruction have no shared view or stale callbacks',()=>{
 const first=surface(),second=surface(),events=[],one=inspector.mount(first.root,{selected:'base',onSelect:value=>events.push(value)}),two=inspector.mount(second.root,{ribs:1,selected:'wall'});
 first.foreign(second.button('ribs'));assert.equal(one.getView().selected,'base');assert.equal(two.getView().selected,'wall');assert.deepEqual(events,[]);
 const replacement=inspector.mount(first.root,{ribs:2,selected:null,onSelect:value=>events.push(value)});assert.equal(first.listenerCount,1);assert.equal(replacement.getView().selected,null);
 one.update({selected:'ribs'});assert.equal(replacement.getView().selected,null);first.click('wall');assert.deepEqual(events,['wall']);
 replacement.destroy();replacement.destroy();assert.equal(first.listenerCount,0);replacement.update({selected:'base'});assert.equal(replacement.getView().selected,'wall');assert.equal(second.listenerCount,1);two.destroy();assert.equal(second.listenerCount,0);
});
