const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
class Element{
  constructor(){this.listeners={};this.attributes={};this.hidden=true;this.dataset={};this.children={};this.classes=new Set();this.classList={toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c),contains:c=>this.classes.has(c)};}
  addEventListener(n,fn){(this.listeners[n]??=[]).push(fn)}
  emit(n,e={}){return Promise.all((this.listeners[n]||[]).map(f=>f(e)))}
  setAttribute(k,v){this.attributes[k]=v}
  getAttribute(k){return this.attributes[k]}
  querySelector(s){return this.children[s]||null}
  querySelectorAll(){return []}
  focus(){this.focused=true}
  select(){this.selected=true}
}
async function main(){
  const selectors={};const e=s=>selectors[s]??=(new Element());
  ['.menu-button','#primary-navigation','.gallery-dialog','#brief-form','#brief-result','#brief-status','#brief-preview','#email-link','#copy-brief','#download-brief','.lab-mobile-cta','#request','#filter-count'].forEach(e);
  const menu=e('.menu-button');menu.setAttribute('aria-expanded','false');
  const nav=e('#primary-navigation'),link=new Element();nav.querySelectorAll=()=>[link];
  const filters=['Все','Скульптуры','Награды'].map(s=>Object.assign(new Element(),{dataset:{filter:s}}));
  const cards=['Награды','Скульптуры','Награды'].map(s=>Object.assign(new Element(),{dataset:{category:s}}));
  const gallery=new Element();gallery.dataset={image:'../photo.webp',caption:'Готовая деталь'};gallery.children.img={alt:'Деталь'};
  const dialog=e('.gallery-dialog');dialog.children={img:{},p:{},'.gallery-close':new Element()};dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;dialog.emit('close')};
  const form=e('#brief-form');form.elements={topic:{value:'Другое',options:[{value:'Другое'},{value:'Студенческий проект / практика'}]}};form.reportValidity=()=>true;
  const data={name:'Инженер <тест>',email:'engineer@example.org',topic:'Студенческий проект / практика',deadline:'Ноябрь',details:'Нужен корпус с посадкой 20 мм & проверкой сборки.'};
  const doc=new Element();doc.querySelector=s=>selectors[s]||null;doc.querySelectorAll=s=>s==='[data-filter]'?filters:s==='[data-category]'?cards:s==='.gallery-open'?[gallery]:[];
  doc.createElement=()=>({click(){this.clicked=true}});
  const clipboard={};
  const sandbox={document:doc,location:{search:'?topic='+encodeURIComponent('Студенческий проект / практика')},URLSearchParams,FormData:class{get(k){return data[k]}},navigator:{clipboard:{async writeText(t){clipboard.text=t}}},window:{matchMedia:()=>({addEventListener(){}})},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,setTimeout:fn=>fn()};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/lab.js'),'utf8'),sandbox);
  await menu.emit('click');assert.equal(menu.getAttribute('aria-expanded'),'true');assert(nav.classList.contains('open'));
  await link.emit('click');assert.equal(menu.getAttribute('aria-expanded'),'false');
  await menu.emit('click');await doc.emit('keydown',{key:'Escape'});assert.equal(menu.getAttribute('aria-expanded'),'false');assert(menu.focused);
  await filters[2].emit('click');assert.equal(cards.filter(c=>!c.hidden).length,2);assert.equal(e('#filter-count').textContent,'Показано: 2');
  await filters[0].emit('click');assert(cards.every(c=>!c.hidden));
  await gallery.emit('click');assert(dialog.open);assert.equal(dialog.children.img.src,'../photo.webp');assert.equal(dialog.children.img.alt,'Деталь');await dialog.children['.gallery-close'].emit('click');assert(!dialog.open);assert(gallery.focused);
  assert.equal(form.elements.topic.value,'Студенческий проект / практика');
  let prevented=false;await form.emit('submit',{preventDefault(){prevented=true}});assert(prevented);assert(!e('#brief-result').hidden);assert(e('#brief-result').focused);
  const href=e('#email-link').href;assert(href.startsWith('mailto:ganshinvk@rgsu.net?'));const params=new URLSearchParams(href.split('?')[1]);assert(params.get('body').includes(data.details));assert(params.get('body').includes(data.name));assert.equal(params.get('subject'),'Лаборатория РГСУ — '+data.topic);assert(e('#brief-status').textContent.includes('ещё не отправлено'));
  await e('#copy-brief').emit('click');assert.equal(clipboard.text,params.get('body'));
  sandbox.navigator.clipboard.writeText=async()=>{throw Error('denied')};await e('#copy-brief').emit('click');assert(e('#brief-preview').selected);
  await form.emit('input');assert(e('#brief-result').hidden);
  console.log('Passed: menu open/close/Escape, project filters, gallery focus, query selection, encoded email, truthful status, clipboard fallback, stale draft reset.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
