'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../workspace-utils.js');
const B = require('../workbench-utils.js');
const UI = require('../workbench-ui.js');
const NOW = '2026-10-29T12:00:00Z';
const task = (text,date,done=false) => ({text,dueDate:date,updatedAt:NOW,...(done?{completedAt:NOW}:{})});
const records = [
  {id:'a',title:'Обследование здания',caseNumber:'А-1',status:'needs_review',amountRub:999999999,amountType:'contract'},
  {id:'b',title:'Проектирование',caseNumber:'А-2',status:'historical',amountRub:90000000,amountType:'claim'},
  {id:'c',title:'Экспертиза перекрытий',caseNumber:'А-3',status:'needs_review'}
];
const esc = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setup(initial=W.emptyWorkspace(),options={}) {
  let workspace = structuredClone(initial), renders = 0, preferencesSaved = 0;
  const messages=[],confirmations=[],exports=[],dates=[],editedTasks=[],elements=new Map();
  const state={search:'',workbench:{layout:'board',scope:'all',hideEmpty:false}};
  const nodes=()=>[...elements.values()];
  const doc={querySelector(selector){return elements.get(selector)||null;},
    querySelectorAll(selector){const field=({'[data-wb-select]':'wbSelect','[data-wb-stage]':'wbStage','[data-action]':'action'})[selector];return field?nodes().filter(node=>Object.hasOwn(node.dataset,field)):[];}};
  const node=(id='',data={},value='')=>{const n={id,dataset:data,value,checked:false,focus(){n.focused=true;}};if(id)elements.set('#'+id,n);else elements.set('node-'+elements.size,n);return n;};
  const api=UI.create({document:doc,workspace:()=>workspace,records:()=>records,getRecord:id=>records.find(r=>r.id===id),
    persist(next){if(options.failWrites)return false;workspace=W.normalizeWorkspace(next);return !!workspace;},
    render(){renders+=1;},notify:message=>messages.push(message),esc,icon:()=>'',option:(value,label,current)=>`<option value="${esc(value)}"${value===current?' selected':''}>${esc(label)}</option>`,
    money:value=>String(value)+' ₽',statusTag:record=>`<span>${record.status}</span>`,deadlineLabel:()=> 'Срок не указан',shortDate:value=>value,
    state,saveUI(){preferencesSaved+=1;},confirm(message){confirmations.push(message);return options.allowConfirm!==false;},
    exportRecords:(items,privateData)=>exports.push({items,privateData}),editTask:id=>editedTasks.push(id),
    onDateShortcut:(target,value)=>dates.push({target,value}),matchesSearch:options.matchesSearch});
  return {api,state,node,options,messages,confirmations,exports,dates,editedTasks,
    getWorkspace:()=>workspace,changeWorkspace:value=>{workspace=structuredClone(value);},renders:()=>renders,preferencesSaved:()=>preferencesSaved,
    action:(action,data={})=>api.handleAction({dataset:{action,...data}}),change:target=>api.handleChange({target})};
}

test('board retains orphan notes, checks, estimates and linked proposals, ordered by next task',()=>{
  const w=W.emptyWorkspace();w.favorites=['a'];w.notes.orphan={text:'Уточнить архив',proposalRub:100};
  w.tasks.orphan=task('Связаться','2026-10-28');w.checks.checkOnly={scope:true};
  w.drafts=[{id:'draft-1',recordId:'proposalOnly',subject:'Личный предмет',updatedAt:NOW}];
  const result=B.workItems(records,w);
  assert.deepEqual(result.map(item=>item.id),['orphan','checkOnly','proposalOnly','a']);
  assert.equal(result[0].orphan,true);assert.equal(result[0].note.text,'Уточнить архив');
  assert.equal(result.find(item=>item.id==='proposalOnly').title,'Личный предмет');
  assert.equal(result.find(item=>item.id==='a').record,records[0]);
});

test('workboard status scopes are personal and never infer completion from source status',()=>{
  const w=W.emptyWorkspace();w.favorites=['a','b','c'];w.work={a:'won',b:'hold',c:'lost'};
  assert.deepEqual(B.workItems(records,w,{scope:'active'}).map(x=>x.id),['b']);
  assert.deepEqual(new Set(B.workItems(records,w,{scope:'finished'}).map(x=>x.id)),new Set(['a','c']));
  assert.equal(B.workItems(records,w,{scope:'all'}).length,3);
});

test('search includes retained private context and delegates enhanced query grammar',()=>{
  const w=W.emptyWorkspace();w.notes.missing={text:'Нужны обмеры ёлки'};
  assert.equal(B.workItems(records,w,{search:'елки обмеры'}).length,1);
  const calls=[];const result=B.workItems(records,w,{search:'"нужны обмеры"',matchesSearch:(text,query)=>{calls.push({text,query});return text.includes('Нужны обмеры');}});
  assert.equal(result.length,1);assert.equal(calls[0].query,'"нужны обмеры"');
});

test('workload money sums only own prices exactly, including orphans and cent rounding',()=>{
  const w=W.emptyWorkspace();w.favorites=['a','b','c'];w.notes={a:{proposalRub:0.1},b:{proposalRub:0.2},orphan:{proposalRub:1.005}};
  w.tasks={a:task('Просрочена','2026-10-28'),b:task('Готово','2026-10-28',true)};
  const summary=B.summarize(B.workItems(records,w),NOW);
  assert.equal(summary.ownTotalCents,'131');assert.equal(B.formatCents(summary.ownTotalCents),'1,31\u00a0₽');
  assert.equal(summary.priced,3);assert.equal(summary.unpriced,1);assert.equal(summary.orphans,1);assert.equal(summary.overdue,1);
  assert.equal(summary.counts.new,4);
});

test('large own totals keep integer-cent precision beyond Number safe integers',()=>{
  const items=Array.from({length:10000},(_,i)=>({stage:'new',note:{proposalRub:999999999999.99},orphan:false}));
  const summary=B.summarize(items,NOW);
  assert.equal(summary.ownTotalCents,'999999999999990000');
  assert.equal(B.formatCents(summary.ownTotalCents),'9\u00a0999\u00a0999\u00a0999\u00a0999\u00a0900\u00a0₽');
});

test('bulk stage planning is detached, idempotent, preserves public records and retains reset cards',()=>{
  const w=W.emptyWorkspace();w.work.a='ready';w.notes.a={text:'Личная заметка',proposalRub:500};
  const original=structuredClone(w),publicBefore=structuredClone(records);
  const plan=B.planOperation(w,['a','a','b'],{type:'stage',stage:'new'},{now:NOW,allowedIds:['a','b']});
  assert.equal(plan.ok,true);assert.deepEqual(plan.changed,['a','b']);assert.deepEqual(w,original);assert.deepEqual(records,publicBefore);
  assert.deepEqual(plan.next.work,{a:'new',b:'new'});assert.equal(B.workItems(records,plan.next).length,2);
  assert.equal(B.planOperation(plan.next,['a','b'],{type:'stage',stage:'new'},{now:NOW}).changed.length,0);
  plan.next.notes.a.text='changed';assert.equal(w.notes.a.text,'Личная заметка');
});

test('bulk favorites removal never deletes note, task, estimate, draft, or work data',()=>{
  const w=W.emptyWorkspace();w.favorites=['a','b'];w.work.a='draft';w.notes.a={text:'Важно'};w.tasks.a=task('Шаг','2026-10-30');
  w.drafts=[{id:'d',recordId:'a',subject:'КП'}];
  const plan=B.planOperation(w,['a'],{type:'favorite-remove'},{now:NOW});
  assert.deepEqual(plan.next.favorites,['b']);assert.deepEqual(plan.next.notes,w.notes);assert.deepEqual(plan.next.tasks,w.tasks);assert.deepEqual(plan.next.drafts,w.drafts);
  assert.equal(plan.next.work.a,'draft');
});

test('bulk date change preserves text, skips completed and missing tasks, does not touch source deadlines',()=>{
  const w=W.emptyWorkspace();w.tasks={a:task('Позвонить','2026-10-30'),b:task('Завершено','2026-10-30',true)};
  const plan=B.planOperation(w,['a','b','c'],{type:'date',date:'2026-11-02'},{now:'2026-10-29T13:00:00Z',allowedIds:['a','b','c']});
  assert.deepEqual(plan.changed,['a']);assert.equal(plan.skipped.length,2);
  assert.equal(plan.next.tasks.a.text,'Позвонить');assert.equal(plan.next.tasks.a.dueDate,'2026-11-02');
  assert.deepEqual(plan.next.tasks.b,w.tasks.b);assert.equal(plan.next.tasks.c,undefined);
  assert.equal(plan.next.tasks.a.updatedAt,'2026-10-29T13:00:00.000Z');
  assert.equal(w.tasks.a.dueDate,'2026-10-30');
});

test('invalid dates, unknown stages, dangerous IDs and unavailable IDs cannot alter data',()=>{
  const w=W.emptyWorkspace();
  assert.equal(B.planOperation(w,['a'],{type:'date',date:'2026-02-30'}).ok,false);
  assert.equal(B.planOperation(w,['a'],{type:'stage',stage:'__proto__'}).ok,false);
  const p=B.planOperation(w,['__proto__','constructor','unknown','a'],{type:'favorite-add'},{allowedIds:['a'],now:NOW});
  assert.equal(p.ok,true);assert.deepEqual(p.changed,['a']);assert.equal(p.skipped.length,3);
  assert.deepEqual(p.next.favorites,['a']);assert.equal({}.polluted,undefined);
});

test('undo requires unchanged full workspace, so later note or other-tab edits are never overwritten',()=>{
  const w=W.emptyWorkspace();const plan=B.planOperation(w,['a'],{type:'favorite-add'},{now:NOW});const token=B.undoToken(plan);
  assert.equal(B.canUndo(plan.next,token),true);
  const edited=structuredClone(plan.next);edited.notes.a={text:'Newer input'};
  assert.equal(B.canUndo(edited,token),false);assert.equal(B.canUndo(plan.next,null),false);
  assert.equal(B.canUndo(w,token),false);assert.deepEqual(token.before,w);
});

test('quick-date arithmetic uses Moscow date across UTC midnight, month and year boundaries',()=>{
  assert.equal(B.moscowDate('2026-10-29T21:01:00Z'),'2026-10-30');
  assert.equal(B.shiftedDate(1,'2026-10-31T20:00:00Z'),'2026-11-01');
  assert.equal(B.shiftedDate(7,'2026-12-28T21:01:00Z'),'2027-01-05');
  assert.equal(B.shiftedDate(2,NOW),null);assert.equal(B.shiftedDate(0,'invalid'),null);
});

test('workbench UI preferences are strictly bounded and detached',()=>{
  const input={layout:'table',scope:'done',hideEmpty:'yes',attack:true};
  assert.deepEqual(B.cleanPreferences(input),{layout:'board',scope:'all',hideEmpty:false});
  assert.deepEqual(B.cleanPreferences({layout:'list',scope:'finished',hideEmpty:true}),{layout:'list',scope:'finished',hideEmpty:true});
});

test('registry selection stays across filters and all-select operates on the full supplied filtered set',()=>{
  const ui=setup();ui.api.selectionBar([records[0],records[1]]);ui.action('wb-select-all');
  assert.deepEqual(ui.api.selectedIds(),['a','b']);
  ui.api.selectionBar([records[2]]);ui.action('wb-select-all');
  assert.deepEqual(ui.api.selectedIds(),['a','b','c']);
  assert.equal(ui.api.selectionBar([records[2]]).includes('В текущем отборе: 1 из 1'),true);
  ui.action('wb-clear-selection');assert.deepEqual(ui.api.selectedIds(),[]);assert.deepEqual(ui.getWorkspace().favorites,[]);
});

test('bulk stage cancellation and storage failure preserve data and do not create successful undo state',()=>{
  const ui=setup(W.emptyWorkspace(),{allowConfirm:false});ui.api.selectionBar(records);ui.action('wb-select-all');
  ui.node('wb-bulk-stage',{},'draft');ui.action('wb-apply-stage');assert.deepEqual(ui.getWorkspace().work,{});
  assert.match(ui.confirmations[0],/Изменятся записи: 3/);assert.match(ui.confirmations[0],/А-1/);
  ui.options.allowConfirm=true;ui.options.failWrites=true;ui.action('wb-apply-stage');
  assert.deepEqual(ui.getWorkspace().work,{});assert.equal(ui.api.selectionBar(records).includes('data-action="wb-undo"'),false);
});

test('bulk actions can be undone, failed undo retains token, later changes block undo',()=>{
  const ui=setup();ui.api.selectionBar(records);ui.action('wb-select-all');ui.action('wb-favorite-add');
  assert.deepEqual(ui.getWorkspace().favorites,['a','b','c']);
  ui.options.failWrites=true;ui.action('wb-undo');assert.equal(ui.getWorkspace().favorites.length,3);
  ui.options.failWrites=false;ui.action('wb-undo');assert.deepEqual(ui.getWorkspace().favorites,[]);
  ui.action('wb-favorite-add');const later=structuredClone(ui.getWorkspace());later.notes.a={text:'Не потерять'};ui.changeWorkspace(later);
  ui.action('wb-undo');assert.equal(ui.getWorkspace().notes.a.text,'Не потерять');assert.equal(ui.getWorkspace().favorites.length,3);
  assert.match(ui.messages.at(-1),/Отмена недоступна/);
});

test('selected export passes only selected public records and requires explicit private button',()=>{
  const ui=setup();const target=ui.node('',{wbSelect:'b'});target.checked=true;ui.change(target);
  ui.action('wb-export-public');ui.action('wb-export-private');
  assert.equal(ui.exports.length,2);assert.deepEqual(ui.exports[0].items,[records[1]]);assert.equal(ui.exports[0].privateData,false);
  assert.equal(ui.exports[1].privateData,true);assert.deepEqual(ui.exports[1].items,[records[1]]);
});

test('bulk date confirmation identifies skipped tasks and leaves finished tasks intact',()=>{
  const w=W.emptyWorkspace();w.tasks={a:task('Связаться','2026-10-30'),b:task('Выполнено','2026-10-30',true)};
  const ui=setup(w);ui.api.selectionBar(records);ui.action('wb-select-all');ui.node('wb-bulk-date',{},'2026-11-02');ui.action('wb-apply-date');
  assert.equal(ui.getWorkspace().tasks.a.dueDate,'2026-11-02');assert.deepEqual(ui.getWorkspace().tasks.b,w.tasks.b);
  assert.match(ui.confirmations[0],/Пропущено: 2/);assert.match(ui.messages.at(-1),/Пропущено: 2/);
});

test('single-stage change resets select on failure and can move retained orphan record safely',()=>{
  const w=W.emptyWorkspace();w.notes.orphan={text:'Сохранённая заметка'};w.work.orphan='review';
  const ui=setup(w,{failWrites:true});const input=ui.node('',{wbStage:'orphan'},'ready');
  ui.change(input);assert.equal(input.value,'review');assert.equal(ui.getWorkspace().work.orphan,'review');
  ui.options.failWrites=false;input.value='ready';ui.change(input);assert.equal(ui.getWorkspace().work.orphan,'ready');
  assert.equal(ui.getWorkspace().notes.orphan.text,'Сохранённая заметка');ui.action('wb-undo');assert.equal(ui.getWorkspace().work.orphan,'review');
});

test('eight-stage board, list preferences, orphan context, and note escaping render correctly',()=>{
  const w=W.emptyWorkspace();w.notes.orphan={text:'<script>private</script>',proposalRub:123};w.tasks.orphan=task('Позвонить','');
  const ui=setup(w);let html=ui.api.workspacePanel();
  assert.equal((html.match(/data-wb-column=/g)||[]).length,8);assert.match(html,/Вне текущего среза/);
  assert.match(html,/&lt;script&gt;private&lt;\/script&gt;/);assert.equal(html.includes('<script>'),false);
  ui.action('wb-layout',{layout:'list'});assert.equal(ui.state.workbench.layout,'list');assert.equal(ui.preferencesSaved(),1);
  const hide=ui.node('wb-hide-empty');hide.checked=true;ui.change(hide);html=ui.api.workspacePanel();
  assert.equal((html.match(/data-wb-column=/g)||[]).length,1);assert.match(html,/wb-list/);
  ui.action('wb-edit-task',{id:'orphan'});assert.deepEqual(ui.editedTasks,['orphan']);
});

test('quick-date buttons update only editor through bridge, never save workspace automatically',()=>{
  const ui=setup();const before=structuredClone(ui.getWorkspace());
  ui.action('wb-date-shortcut',{target:'detail',offset:'clear'});ui.action('wb-date-shortcut',{target:'task',offset:'1'});
  assert.deepEqual(ui.dates[0],{target:'detail',value:''});assert.equal(B.validDate(ui.dates[1].value),true);
  ui.action('wb-date-shortcut',{target:'unknown',offset:'0'});ui.action('wb-date-shortcut',{target:'task',offset:'99'});
  assert.equal(ui.dates.length,2);assert.deepEqual(ui.getWorkspace(),before);
});
