'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../registry-utils.js');
const W=require('../workspace-utils.js');

test('Quoted phrases remain contiguous in one field while ordinary words may span fields',()=>{
  assert.equal(R.matchesSearch(['Обследование несущих конструкций','Москва'], 'москва "несущих конструкций"'),true);
  assert.equal(R.matchesSearch(['Обследование несущих','конструкций Москва'], 'москва "несущих конструкций"'),false);
  assert.equal(R.matchesSearch(['Обследование несущих','конструкций Москва'], 'несущих москва конструкций'),true);
});
test('Exclusions take precedence, support quoted phrases and do not split a hyphenated case number',()=>{
  assert.equal(R.matchesSearch('А40-123 обследование кровли', 'А40-123 -фасад'),true);
  assert.equal(R.matchesSearch('Обследование фасада и кровли', 'обследование -фасада'),false);
  assert.equal(R.matchesSearch('обследование, капитальный ремонт', '-"капитальный ремонт"'),false);
  assert.equal(R.matchesSearch('обследование, текущий ремонт', '-"капитальный ремонт"'),true);
});
test('Search folds Russian case and е/ё, supports Russian quotation marks and literal regex characters',()=>{
  assert.equal(R.matchesSearch('Расчёт А+Б [объект]', '«РАСЧЕТ» "А+Б" "[объект]"'),true);
  assert.deepEqual(R.parseSearch('Москва москва -фасад -ФАСАД'),{include:['москва'],exclude:['фасад']});
});
test('Highlight preserves original text and escapes source HTML and query payloads',()=>{
  assert.equal(R.highlight('Расчёт <img onerror="x">','расчет img'),'<mark class="search-match">Расчёт</mark> &lt;<mark class="search-match">img</mark> onerror=&quot;x&quot;&gt;');
  assert.equal(R.highlight('<script>alert(1)</script>','<script>'),'<mark class="search-match">&lt;script&gt;</mark>alert(1)&lt;/script&gt;');
  assert.equal(R.highlight('Москва, Москва','-москва'),'Москва, Москва');
});
test('Highlight merges overlapping matches and respects original offsets after Unicode lowercase expansion',()=>{
  assert.equal(R.highlight('Экспертиза','эксперт экспертиза'),'<mark class="search-match">Экспертиза</mark>');
  assert.equal(R.highlight('İ Москва','москва'),'İ <mark class="search-match">Москва</mark>');
});
test('Budget range supports zero and commas, rejecting reversed, negative, exponential or too precise values',()=>{
  assert.deepEqual(R.validateRange('0','1000,25'),{valid:true,min:0,max:1000.25,message:''});
  assert.equal(R.validateRange('','').valid,true);
  for(const [a,b] of [['20','10'],['-1',''],['1e3',''],['0.001',''],['1000000000001',''],['NaN','']])assert.equal(R.validateRange(a,b).valid,false);
});
test('Pagination clamps page after filtering and never truncates the caller dataset',()=>{
  const rows=Array.from({length:53},(_,id)=>({id}));
  const page=R.paginate(rows,3,25);
  assert.equal(page.start,51);assert.equal(page.end,53);assert.equal(page.items.length,3);assert.equal(rows.length,53);
  assert.equal(R.paginate(rows.slice(0,4),3,25).page,1);
  assert.deepEqual(R.paginate([],99,25),{items:[],page:1,size:25,pages:1,total:0,start:0,end:0});
});
test('Import preview shows current-value precedence and the exact merged quantities without mutating input',()=>{
  const current=W.emptyWorkspace(),incoming=W.emptyWorkspace();
  current.notes.a={text:'текущая'};incoming.notes.a={text:'входящая'};incoming.notes.b={text:'новая'};
  current.favorites=['a'];incoming.favorites=['a','b'];
  const before=JSON.stringify([current,incoming]),preview=R.importPreview(current,incoming);
  assert.deepEqual(preview.find(row=>row.key==='notes'),{key:'notes',label:'Заметки',before:1,incoming:2,after:2,retained:1});
  assert.equal(preview.find(row=>row.key==='favorites').after,2);assert.equal(JSON.stringify([current,incoming]),before);
});
test('Replacement preview reports incoming counts and zero retained values',()=>{
  const current=W.emptyWorkspace(),incoming=W.emptyWorkspace();current.tasks.a={text:'не терять',dueDate:'',updatedAt:'2026-10-29T12:00:00Z'};
  incoming.favorites=['b'];const preview=R.importPreview(current,incoming,true);
  assert.equal(preview.find(row=>row.key==='tasks').after,0);assert.equal(preview.find(row=>row.key==='tasks').retained,0);
  assert.equal(preview.find(row=>row.key==='favorites').after,1);
});
test('Profile and comparison previews follow atomic merge rules even when selected IDs differ',()=>{
  const current=W.emptyWorkspace(),incoming=W.emptyWorkspace();current.profile.regions=['moscow'];incoming.profile.regions=['oblast'];
  current.compareIds=['a'];incoming.compareIds=['b','c'];
  const preview=R.importPreview(current,incoming);
  assert.equal(preview.find(row=>row.key==='profile').retained,1);
  assert.equal(preview.find(row=>row.key==='compareIds').after,1);assert.equal(preview.find(row=>row.key==='compareIds').retained,2);
});
test('Oversized merged saved filter lists reject preview while replacing remains valid',()=>{
  const current=W.emptyWorkspace(),incoming=W.emptyWorkspace();
  current.savedFilters=Array.from({length:30},(_,i)=>({id:'c'+i,name:'Отбор '+i,filters:{search:''}}));
  incoming.savedFilters=[{id:'new',name:'Новый',filters:{search:''}}];
  assert.equal(R.importPreview(current,incoming),null);assert.notEqual(R.importPreview(current,incoming,true),null);
});
test('Workspace health counts all supported legacy-normalized groups without exposing values',()=>{
  const workspace=W.normalizeWorkspace({version:1,notes:{a:{text:'Секрет'}},work:{},drafts:[],company:{organization:'Частная организация'}});
  const counts=R.workspaceCounts(workspace);
  assert.equal(counts.length,11);assert.equal(counts.find(row=>row.key==='notes').count,1);
  assert.equal(counts.find(row=>row.key==='company').count,1);assert.equal(JSON.stringify(counts).includes('Секрет'),false);
});
test('Separator-only profile is empty both in preview and actual merge',()=>{
  const current=W.emptyWorkspace(),incoming=W.emptyWorkspace();current.profile.includeWords=', ;\n';incoming.profile.regions=['moscow'];
  const profile=R.importPreview(current,incoming).find(row=>row.key==='profile');
  assert.equal(profile.before,0);assert.equal(profile.retained,0);assert.equal(profile.after,1);
  assert.deepEqual(W.mergeWorkspaces(current,incoming).profile.regions,['moscow']);
});
