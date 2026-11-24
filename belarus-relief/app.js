'use strict';

const palette = [
  ['Брестская', '#74763d'], ['Гродненская', '#315b44'], ['Витебская', '#69844f'],
  ['Минская', '#83904f'], ['Могилёвская', '#727848'], ['Гомельская', '#536c3c']
];
const id = key => document.getElementById(key);
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const money = value => number.format(value) + ' ₽';
const elem = (tag, str, cls) => {
  const node = document.createElement(tag);
  if (str !== undefined) node.textContent = str;
  if (cls) node.className = cls;
  return node;
};
function saved(key) {
  try {return JSON.parse(localStorage.getItem(key)) || {};} catch {return {};}
}
function remember(key, value) {
  try {localStorage.setItem(key, JSON.stringify(value));} catch { /* Private mode keeps the current state in memory. */ }
}
async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw Error(path);
  return response.json();
}
function showError(target, link, title) {
  const msg = elem('p', 'Не удалось загрузить этот раздел. ', 'error');
  const a = elem('a', title); a.href = link; msg.append(a);
  id(target).replaceChildren(msg);
}
for (const [region, color] of palette) {
  const item = elem('div', undefined, 'chip'); const swatch = elem('i');
  swatch.style.backgroundColor = color; item.append(swatch, elem('span', region));
  id('swatches').append(item);
}
async function setWorkshop() {
 const {steps} = await json('data/workshop.json');
 const state = saved('belarus-relief:process:v1');
 function progress() {
   const count = steps.filter(step => state[step.id]).length;
   id('progress-bar').style.width = (count * 100 / steps.length) + '%';
   id('progress-label').textContent = 'Выполнено ' + count + ' из ' + steps.length + ' операций';
 }
 for (const [i, step] of steps.entries()) {
   const box = elem('details'); box.open = i === 0; box.classList.toggle('is-done', !!state[step.id]);
   const title = elem('summary'); title.append(elem('span',String(i+1).padStart(2,'0'),'step-number'),elem('span',step.title,'step-title'));
   const body = elem('div',undefined,'step-body');
   body.append(elem('p', step.time + ' · ' + step.tool));
   const actions = elem('ul'); for (const action of step.actions) actions.append(elem('li', action));
   const acceptance = elem('div',undefined,'checkline'); acceptance.append(elem('strong','Контроль. '),document.createTextNode(step.check));
   const related = {
     prepare: ['templates/assembly-a4.pdf','Монтажный шаблон A4'],
     slice: ['downloads/regions-stl.zip','Скачать шесть регионов'],
     make: ['models/decor-plate.3mf','Открыть раскладку 13 элементов'],
     frame: ['print/frame.pdf','Чертёж рамы и четверти'],
     finish: ['models/bison/bison-preview.webp','Посмотреть рельеф зубра'],
     sash: ['print/sash-1to1.pdf','Открыть макет ленты А3'],
     assemble: ['print/decor-placement.pdf','Открыть шаблон декора'],
     release: ['assets/approved.webp','Открыть эталон отделки']
   };
   const attachment = related[step.id], links=elem('div',undefined,'step-files');
   if(attachment){const link=elem('a',attachment[1],'inline-link');link.href=attachment[0];link.target='_blank';links.append(link);}
   const label = elem('label'), done = elem('input'); done.type = 'checkbox'; done.checked = !!state[step.id];
   done.addEventListener('change', () => {state[step.id] = done.checked; remember('belarus-relief:process:v1',state); box.classList.toggle('is-done',done.checked); progress();});
   label.append(done,document.createTextNode('Операция выполнена')); body.append(actions,acceptance,links,label); box.append(title,body); id('steps').append(box);
 }
 progress();
}
async function setBudget() {
 const budget = await json('data/budget.json');
 const key = 'belarus-relief:prices:v1';
 let edits = saved(key);
 const rows = [];
 const totals = ['Расход материалов и услуг','Закупка с нуля','Себестоимость с работой'].map(title => {
   const block=elem('div',undefined,'total');const val=elem('strong');block.append(elem('span',title),val);id('totals').append(block);return val;
 });
 function recompute() {
   let material=0, purchase=0, labor=0;
   for (const row of rows) {
     const qty = row.qty.value===''?0:(edits[row.item.id]?.quantity ?? row.item.quantity);
     const price = row.price.value===''?0:(edits[row.item.id]?.unitPrice ?? row.item.unitPrice);
     const use = qty*price;
     row.amount.textContent = money(use);
     if (row.purchase) {
       const buy = Math.ceil(qty/row.item.packQty-1e-9)*row.item.packQty*price;
       row.purchase.textContent = money(buy); material+=use; purchase+=buy;
     } else {labor+=use;}
   }
   [material,purchase,material+labor].forEach((val,i)=>totals[i].textContent=money(val));
 }
 const displayNumber = value => Number(value.toFixed(4));
 function field(item, prop, title) {
   const input=elem('input');input.type='number';input.min='0';input.step='any';input.inputMode='decimal';
   input.setAttribute('aria-label',title+' · '+item.name);
   const n=edits[item.id]?.[prop];
   input.value=Number.isFinite(n)&&n>=0?n:displayNumber(item[prop]);
   input.addEventListener('input',()=>{
     if(input.value!=='' && input.validity.valid) {
       (edits[item.id] ||= {})[prop]=Number(input.value);
       remember(key, edits);
     }
     recompute();
   });
   return input;
 }
 function fillTable(items,isMaterial) {
   const body=id(isMaterial?'budget-table':'labor-table').tBodies[0];
   for (const item of items) {
     const row=elem('tr'), name=elem('td');name.append(elem('strong',item.name));
     const sub=elem('span',undefined,'sub');
     if(item.sourceUrl){const source=elem('a',item.sourceName);source.href=item.sourceUrl;source.target='_blank';source.rel='noopener';sub.append(source);}
     else {sub.textContent=isMaterial?(item.sourceName||'Расчётная цена'):'Плановая ставка';}
     if(isMaterial){sub.append(document.createTextNode(' · упаковка '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:4}).format(item.packQty)+' '+item.unit));}
     name.append(sub);
     const qty=field(item,'quantity','Количество'), price=field(item,'unitPrice','Цена');
     const qtyCell=elem('td'),priceCell=elem('td');qtyCell.append(qty, elem('small',item.unit));priceCell.append(price);
     const amount=elem('td',undefined,'amount'),purchase=isMaterial?elem('td',undefined,'amount'):null;
     row.append(name,qtyCell,priceCell,amount);if(purchase)row.append(purchase);
     body.append(row);rows.push({item,qty,price,amount,purchase});
   }
 }
 fillTable(budget.items,true);fillTable(budget.labor,false);recompute();
 id('cost-date').textContent='Цены и допущения на '+budget.asOf.split('-').reverse().join('.')+' · Москва · доставка отдельно.';
 id('cost-notes').textContent='Цены поставщиков и расчётные оценки отмечены в таблице. Для полной себестоимости к расходу прибавлены ручной труд и машино-часы. Электричество включено в ставку оборудования.';
 id('cost-reset').addEventListener('click',()=>{edits={};remember(key,edits);for(const row of rows){row.qty.value=displayNumber(row.item.quantity);row.price.value=displayNumber(row.item.unitPrice);}recompute();});
}
async function setFiles() {
 const files=await json('data/files.json');
 const groups=['Все',...new Set(files.map(f=>f.group))];
 function select(group){
  const list=id('file-list');list.replaceChildren();
  for (const f of files.filter(f=>group==='Все'||f.group===group)) {
   const a=elem('a',undefined,'file-link');a.href=f.path;a.download='';
   const t=elem('span');t.append(elem('b',f.title),elem('small',f.detail));
   const symbol=elem('i','↓');symbol.setAttribute('aria-hidden','true');
   a.append(elem('span',f.type,'format'),t,symbol);list.append(a);
  }
  for(const b of id('file-filter').children)b.setAttribute('aria-pressed',String(b.textContent===group));
 }
 for(const group of groups){const b=elem('button',group);b.type='button';b.addEventListener('click',()=>select(group));id('file-filter').append(b);}
 select('Все');
}
setWorkshop().catch(()=>showError('steps','print/workbook.pdf','Открыть инструкцию PDF'));
setBudget().catch(()=>showError('totals','downloads/specification.xlsx','Скачать смету XLSX'));
setFiles().catch(()=>showError('file-list','downloads/belarus-production.zip','Скачать весь комплект'));
