'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const trials=require('../dist/project-trials.js');
const tracks=[
 {id:'engineering',name:'Инженерия и 3D',project:'Держатель для телефона',color:'#2355ed'},
 {id:'robotics',name:'Робототехника',project:'Сигнализатор движения',color:'#256b75'},
 {id:'code',name:'Код и данные',project:'Трекер',color:'#6450a8'}
];

test('Old states and empty project selection do not invent a completed trial',()=>{
 const old={planned:['engineering']};
 const html=trials.html({state:old,tracks});
 assert.match(html,/pt-state--unknown/);
 assert.match(html,/<option value="" selected>Пока не отмечено<\/option>/);
 assert.doesNotMatch(html,/<option value="completed" selected>/);
 assert.equal(old.projectTrials,undefined,'rendering does not mutate a legacy state');
 const empty=trials.html({state:{planned:[],projectTrials:{engineering:{status:'completed'}}},tracks});
 assert.match(empty,/Сначала выбери будущие проекты/);
 assert.doesNotMatch(empty,/data-trial-track/);
});

test('A note, real date or next preference never creates a completion status',()=>{
 const html=trials.html({state:{planned:['engineering'],projectTrials:{engineering:{happenedOn:'2026-11-12',note:'Сделал макет.',next:'continue'}}},tracks});
 assert.match(html,/pt-state--unknown/);
 assert.match(html,/value="2026-11-12"/);
 assert.match(html,/12\.11\.2026/);
 assert.match(html,/Какое действие хочется повторить/);
 assert.doesNotMatch(html,/<option value="completed" selected>/);
});

test('Two selected projects have unique controls, labels and help relationships',()=>{
 const html=trials.html({state:{planned:['engineering','robotics']},tracks});
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const track of ['engineering','robotics'])for(const field of ['status','happenedOn','note','next']){
  assert.ok(html.includes(`for="trial-${field}-${track}"`));
  assert.ok(html.includes(`id="trial-${field}-${track}" data-trial-track="${track}" data-trial-field="${field}"`));
 }
 for(const match of html.matchAll(/aria-describedby="([^"]+)"/g))for(const id of match[1].split(' '))assert.ok(ids.includes(id),id);
 assert.equal((html.match(/maxlength="280"/g)||[]).length,2);
});

test('Imported notes are escaped and the read-only view does not expose editing controls',()=>{
 const note='</textarea><script>alert("x")</script> & <input autofocus>';
 const source={planned:['engineering'],projectTrials:{engineering:{status:'completed',happenedOn:'2026-02-29',note,next:'another'}}};
 const before=JSON.stringify(source),html=trials.html({state:source,tracks,demo:true});
 assert.doesNotMatch(html,/<(?:textarea|select|input|script)\b/);
 assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
 assert.match(html,/Дата пока не отмечена/,'an impossible day is not displayed as a real event');
 assert.match(html,/Проба завершена/);
 assert.match(html,/Хочу попробовать другое/);
 assert.match(html,/Что хочется изменить/);
 assert.equal(JSON.stringify(source),before);
});

test('Print summaries preserve unknown vs undecided, status and a valid leap date',()=>{
 const html=trials.html({state:{planned:['engineering','robotics'],projectTrials:{engineering:{status:'started',happenedOn:'2028-02-29',next:'undecided'},robotics:{status:'',next:''}}},tracks});
 assert.equal((html.match(/class="pt-summary pt-print-only"/g)||[]).length,2);
 assert.match(html,/29\.02\.2028/);
 assert.match(html,/<dd>Пока не могу решить<\/dd>/);
 assert.match(html,/<dd>Пока не отвечаю<\/dd>/);
 assert.match(html,/Какого опыта ещё не хватает/);
 assert.match(html,/С какого небольшого действия начнём/);
});

test('Archived trials remain visible and escaped without duplicating the current plan or editable controls',()=>{
 const state={planned:['engineering'],projectTrials:{engineering:{status:'completed'},robotics:{status:'completed',note:'<img src=x onerror=alert(1)>'},code:{next:'undecided'}}};
 const before=JSON.stringify(state),archive=trials.html({state,tracks,archived:true});
 assert.match(archive,/project-trials-archived-heading/);
 assert.match(archive,/trial-archived-title-robotics/);
 assert.match(archive,/trial-archived-title-code/);
 assert.doesNotMatch(archive,/Держатель для телефона/);
 assert.match(archive,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(archive,/<(?:input|select|textarea|img)\b/);
 const together=trials.html({state,tracks})+archive;
 const ids=[...together.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length,'the current and archived sections may appear on the same page');
 assert.equal(JSON.stringify(state),before,'displaying old records does not add them back to the plan');
});

test('An empty archive emits nothing, including records with empty or unusable fields',()=>{
 for(const state of [{},{planned:[]},{planned:['engineering'],projectTrials:{engineering:{status:'completed'}}},{planned:[],projectTrials:{engineering:{},robotics:{status:'',happenedOn:'',note:' \n ',next:''},code:{status:'invalid',happenedOn:'2026-02-29',next:'invalid'}}}]){
  assert.equal(trials.html({state,tracks,archived:true}),'');
 }
});
