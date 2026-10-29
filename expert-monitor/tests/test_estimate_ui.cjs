'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const UI=require('../estimate-ui.js');
const C=require('../estimate-utils.js');
const W=require('../workspace-utils.js');
const clone=value=>structuredClone(value);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode=value=>String(value??'').replace(/&(?:amp|lt|gt|quot|#39);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[c]));
const line=(id,values={})=>({id,type:'labor',name:'Осмотр',quantity:'1',unit:'ч',rateRub:'10',...values});
const estimate=(lines=[line('one')],values={})=>({...C.emptyEstimate(),lines,recordTitle:'Объект А',caseNumber:'А-1',...values});
function fixture(saved={}){
  let workspace={...W.emptyWorkspace(),estimates:clone(saved)};
  const nodes=new Set(),ids=new Map();
  const state={confirm:true,failWrites:false,notices:[],prompts:[],downloads:[],prints:[],rendered:0};
  function matches(node,selector){
    if(selector.startsWith('#'))return node.id===selector.slice(1);
    const attr=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    return attr?Object.hasOwn(node.attrs,attr[1])&&(attr[2]===undefined||node.attrs[attr[1]]===attr[2]):node.tagName===selector.toUpperCase();
  }
  class Node{
    constructor(tag,attrs={}){
      this.tagName=tag.toUpperCase();this.attrs={...attrs};this.id=attrs.id||'';this.dataset={};this.value=decode(attrs.value||'');this.textContent='';this.isConnected=true;this.listeners={};this.hidden=Object.hasOwn(attrs,'hidden');this.disabled=Object.hasOwn(attrs,'disabled');this.open=false;
      for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decode(value);
      const classes=new Set();this.classList={add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)};
    }
    set innerHTML(value){this._html=String(value);parse(this,this._html);}
    get innerHTML(){return this._html||'';}
    focus(){doc.activeElement=this;}
    scrollIntoView(){this.scrolled=true;}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    setAttribute(key,value){this.attrs[key]=String(value);}
    removeAttribute(key){delete this.attrs[key];}
    showModal(){this.open=true;}
    close(){this.open=false;for(const fn of this.listeners.close||[])fn({target:this});}
  }
  function parse(owner,html){
    for(const node of [...nodes])if(node.owner===owner){node.isConnected=false;nodes.delete(node);if(ids.get(node.id)===node)ids.delete(node.id);}
    for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
      const attrs={};for(const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))attrs[attr[1]]=decode(attr[2]??attr[3]??attr[4]??'');
      if(!attrs.id&&!Object.keys(attrs).some(k=>k.startsWith('data-')))continue;
      const node=new Node(match[1],attrs);node.owner=owner;nodes.add(node);if(node.id)ids.set(node.id,node);
      const after=html.slice(match.index+match[0].length);
      if(node.tagName==='TEXTAREA')node.value=decode(after.split('</textarea>')[0]);
      if(node.tagName==='SELECT'){
        const options=[...after.split('</select>')[0].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
        const selected=options.find(x=>/\bselected\b/.test(x[1]))||options[0];node.value=selected?decode(/value="([^"]*)"/.exec(selected[1])?.[1]??selected[2]):'';
      }
    }
  }
  const doc={activeElement:null,querySelector:selector=>selector.startsWith('#')?ids.get(selector.slice(1))||null:doc.querySelectorAll(selector)[0]||null,querySelectorAll:selector=>[...nodes].filter(node=>node.isConnected&&matches(node,selector))};
  doc.body=new Node('body');
  doc.body.innerHTML='<dialog id="estimate-dialog"><div id="estimate-content"></div></dialog><div id="print-document"></div><main id="main"></main><div id="saved"></div>';
  const get=id=>{const node=ids.get(id);assert.ok(node,'Expected #'+id);return node;};
  const ui=UI.create({document:doc,confirm:message=>{state.prompts.push(message);return state.confirm;},workspace:()=>workspace,
    getRecord:id=>id==='a'?{id,title:'Объект А',caseNumber:'А-1'}:id==='b'?{id,title:'Объект Б',caseNumber:'Б-2'}:null,
    persist:next=>{if(state.failWrites)return false;const valid=W.normalizeWorkspace(next);assert.ok(valid);workspace=valid;return true;},render:()=>state.rendered++,notify:message=>state.notices.push(message),esc:escape,icon:()=>'',money:value=>Number(value).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽',formatDate:value=>value,
    option:(value,label,current)=>'<option value="'+escape(value)+'"'+(value===current?' selected':'')+'>'+escape(label)+'</option>',
    csv:rows=>JSON.stringify(rows),safeFilename:value=>String(value).replace(/\W/g,'_'),download:(name,text,type)=>state.downloads.push({name,text,type}),
    print:()=>{if(state.printFails)throw Error('blocked');state.prints.push(get('print-document').innerHTML);}});
  return {state,doc,ui,get,workspace:()=>workspace,snapshot:()=>ui.applySnapshot({estimates:{}}).estimates.a,
    action:(action,attrs={})=>ui.handleAction({dataset:{action:'estimate-'+action,...attrs}}),
    input:(id,value)=>{const target=get(id);target.value=value;ui.handleInput({target});},
    mountSaved:()=>{get('saved').innerHTML=ui.savedPanel();},
    open:()=>ui.handleAction({dataset:{action:'estimate-open',id:'a'}})};
}

test('Labor and expense subtotals retain per-row kopeck rounding and never infer missing values',()=>{
  const value=estimate([line('a',{quantity:'.5',rateRub:'.01'}),line('b',{quantity:'.5',rateRub:'.01'}),line('c',{type:'expense',quantity:'2,5',rateRub:'1000,25'})]);
  assert.deepEqual(UI.breakdown(value),{labor:{valid:true,value:.02},expense:{valid:true,value:2500.63},complete:3,total:3});
  value.lines[0].quantity='';const partial=UI.breakdown(value);assert.equal(partial.complete,2);assert.equal(partial.labor.valid,false);assert.equal(partial.labor.value,null);assert.equal(partial.expense.value,2500.63);
});

test('Duplicating a line copies current edits under a new unique ID without saving or changing source amounts',()=>{
  const original=estimate();const app=fixture({a:original});app.open();app.input('estimate-rateRub-0','23,45');app.action('duplicate',{lineId:'one'});
  const current=app.snapshot();assert.equal(current.lines.length,2);assert.notEqual(current.lines[0].id,current.lines[1].id);assert.equal(current.lines[1].rateRub,'23,45');assert.deepEqual(app.workspace().estimates.a,original);assert.equal(app.ui.dirty(),true);
  assert.equal(app.doc.activeElement.id,'estimate-name-1');
});

test('Moving rows changes order with accessible buttons, retains edits and respects boundaries',()=>{
  const app=fixture({a:estimate([line('a'),line('b'),line('c')])});app.open();app.input('estimate-name-1','Новое название');app.action('up',{lineId:'b'});
  assert.deepEqual(app.snapshot().lines.map(x=>x.id),['b','a','c']);assert.equal(app.snapshot().lines[0].name,'Новое название');assert.equal(app.doc.activeElement.id,'estimate-name-0');
  app.action('up',{lineId:'b'});assert.deepEqual(app.snapshot().lines.map(x=>x.id),['b','a','c']);app.action('down',{lineId:'b'});assert.deepEqual(app.snapshot().lines.map(x=>x.id),['a','b','c']);
});

test('Undo restores removed rows but preserves field edits made to surviving rows',()=>{
  const app=fixture({a:estimate([line('a'),line('b')])});app.open();app.action('remove',{lineId:'b'});app.input('estimate-rateRub-0','77');app.action('undo');
  const rows=app.snapshot().lines;assert.deepEqual(rows.map(x=>x.id),['a','b']);assert.equal(rows[0].rateRub,'77');assert.equal(rows[1].rateRub,'10');assert.equal(app.ui.dirty(),true);
  assert.ok(app.doc.querySelectorAll('[data-action="estimate-undo"]')[0].disabled);
});

test('Undo requires consent before discarding later edits to a newly added row',()=>{
  const app=fixture({a:estimate()});app.open();app.action('add-work');app.input('estimate-name-1','Важная новая строка');app.state.confirm=false;app.action('undo');
  assert.equal(app.snapshot().lines.length,2);assert.match(app.state.prompts.at(-1),/изменили добавленные строки/);app.state.confirm=true;app.action('undo');assert.equal(app.snapshot().lines.length,1);
});

test('Clearing empty rows retains zero-valued rates and units, offers undo, and leaves a placeholder if all were blank',()=>{
  const blank=id=>line(id,{name:' ',quantity:'',unit:'',rateRub:''});
  const app=fixture({a:estimate([blank('a'),line('b',{name:'',quantity:'',unit:'',rateRub:'0'}),line('c',{name:'',quantity:'',unit:'выезд',rateRub:''}),blank('d')])});app.open();app.action('clear-empty');
  assert.deepEqual(app.snapshot().lines.map(x=>x.id),['b','c']);app.action('undo');assert.equal(app.snapshot().lines.length,4);
  const all=fixture({a:estimate([blank('a'),blank('b')])});all.open();all.action('clear-empty');assert.equal(all.snapshot().lines.length,1);assert.equal(UI.emptyLine(all.snapshot().lines[0]),true);
});

test('Malformed numeric fields get linked errors, and first-error navigation focuses the offending control',()=>{
  const app=fixture({a:estimate()});app.open();app.input('estimate-quantity-0','1e3');assert.equal(app.get('estimate-quantity-0').attrs['aria-invalid'],'true');
  assert.equal(app.get('estimate-quantity-0').attrs['aria-describedby'],'estimate-error-0-quantity');assert.ok(app.get('estimate-error-0-quantity').textContent);assert.equal(app.get('estimate-error-0-quantity').hidden,false);
  app.action('first-error');assert.equal(app.doc.activeElement.id,'estimate-quantity-0');assert.equal(app.doc.activeElement.scrolled,true);
  app.input('estimate-quantity-0','2,5');assert.equal(app.get('estimate-quantity-0').attrs['aria-invalid'],undefined);assert.equal(app.get('estimate-error-0-quantity').hidden,true);
});

test('Completion progress is live, and required-field highlighting is explicitly requested',()=>{
  const app=fixture();app.open();assert.equal(app.get('estimate-name-0').attrs['aria-invalid'],undefined);app.action('first-error');assert.equal(app.doc.activeElement.id,'estimate-name-0');
  app.input('estimate-name-0','Осмотр');app.input('estimate-quantity-0','1');app.input('estimate-rateRub-0','0');assert.match(app.get('estimate-progress').innerHTML,/Заполнено 1 из 1/);assert.equal(app.get('estimate-first-error').hidden,true);
  assert.match(app.get('estimate-totals').innerHTML,/Работы отдельно/);assert.equal(app.doc.querySelectorAll('[data-action="estimate-apply"]')[0].disabled,true,'A zero total must not be transferred as a positive own price');
});

test('Copying a saved estimate requires explicit choice and consent, keeps target identity, and does not save',()=>{
  const source=estimate([line('source',{rateRub:'250'})],{recordTitle:'Источник Б',caseNumber:'Б-2',notes:'Исходные допущения',overheadPct:'5'});
  const original=estimate();const app=fixture({a:original,b:source});app.open();app.get('estimate-source').value='b';app.state.confirm=false;app.action('copy-saved');assert.deepEqual(app.snapshot().lines,original.lines);
  app.state.confirm=true;app.action('copy-saved');const current=app.snapshot();assert.equal(current.recordTitle,'Объект А');assert.equal(current.caseNumber,'А-1');assert.equal(current.notes,source.notes);assert.equal(current.overheadPct,'5');assert.notEqual(current.lines[0].id,'source');assert.equal(current.lines[0].rateRub,'250');assert.equal(app.ui.dirty(),true);assert.deepEqual(app.workspace().estimates,{a:original,b:source});
});

test('TXT and print export current private edits as a marked draft; print safely escapes text and does not save',()=>{
  const app=fixture({a:estimate()});app.open();app.input('estimate-notes','Личная заметка <script>alert(1)</script>');app.input('estimate-rateRub-0','999');app.action('txt');app.action('print');
  assert.equal(app.state.downloads.length,1);assert.match(app.state.downloads[0].name,/\.txt$/);assert.match(app.state.downloads[0].text,/ПРОЕКТ РАСЧЁТА. НЕ ОТПРАВЛЕН/);assert.match(app.state.downloads[0].text,/Личные данные/);assert.match(app.state.downloads[0].text,/999/);
  assert.equal(app.state.prints.length,1);assert.ok(app.doc.body.classList.contains('print-proposal'));assert.match(app.state.prints[0],/&lt;script&gt;/);assert.doesNotMatch(app.state.prints[0],/<script>/);assert.equal(app.workspace().estimates.a.notes,'');assert.equal(app.ui.dirty(),true);
});

test('Incomplete estimates can be printed as incomplete drafts, while malformed values block TXT and printing',()=>{
  const app=fixture();app.open();app.action('txt');app.action('print');assert.match(app.state.downloads[0].text,/НЕПОЛНЫЙ ПРОЕКТ/);assert.match(app.state.downloads[0].text,/Расчётная цена: Не рассчитано/);
  app.input('estimate-rateRub-0','-10');app.action('txt');app.action('print');assert.equal(app.state.downloads.length,1);assert.equal(app.state.prints.length,1);assert.match(app.state.notices.at(-1),/исправьте неверные значения/);
});

test('Failed print initialization cleans the private print surface without changing unsaved editor fields',()=>{
  const app=fixture({a:estimate()});app.open();app.input('estimate-notes','Не терять');app.state.printFails=true;app.action('print');assert.equal(app.get('print-document').innerHTML,'');assert.equal(app.doc.body.classList.contains('print-proposal'),false);assert.equal(app.get('estimate-notes').value,'Не терять');assert.equal(app.ui.dirty(),true);
});

test('Saved estimate search matches normalized words in any order and amount sorting leaves incomplete versions last',()=>{
  const values={a:estimate([line('a',{rateRub:'200'})],{recordTitle:'Обмеры дома',notes:'Нужен расчёт балки'}),b:estimate([line('b',{rateRub:'10'})],{recordTitle:'Обследование склада'}),c:estimate([line('c',{quantity:''})],{recordTitle:'Неполный расчёт'})};
  assert.deepEqual(UI.savedEntries(values,'балки расчет').map(([id])=>id),['a']);assert.deepEqual(UI.savedEntries(values,'','amount-asc').map(([id])=>id),['b','a','c']);assert.deepEqual(UI.savedEntries(values,'','amount-desc').map(([id])=>id),['a','b','c']);
  const app=fixture(values);app.mountSaved();const field=app.get('estimate-saved-search');field.focus();app.input('estimate-saved-search','балки расчет');assert.equal(app.doc.activeElement,field);assert.match(app.get('estimate-saved-results').innerHTML,/Обмеры дома/);assert.doesNotMatch(app.get('estimate-saved-results').innerHTML,/Обследование склада/);assert.equal(app.get('estimate-saved-count').textContent,'1 / 3');
});

test('Added-row operations respect the 100-line limit and failed persistence preserves the edited draft',()=>{
  const original=estimate(Array.from({length:100},(_,i)=>line('line-'+i)));const app=fixture({a:original});app.open();app.action('duplicate',{lineId:'line-0'});app.action('add-work');assert.equal(app.snapshot().lines.length,100);
  app.input('estimate-name-0','Изменено');app.state.failWrites=true;app.action('save');assert.equal(app.workspace().estimates.a.lines[0].name,'Осмотр');assert.equal(app.ui.dirty(),true);app.state.failWrites=false;app.action('save');assert.equal(app.workspace().estimates.a.lines[0].name,'Изменено');assert.equal(app.ui.dirty(),false);
});
