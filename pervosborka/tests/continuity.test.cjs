'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../dist/engine.js');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/bank.json'),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
const checkpoint=state=>clone(E.createExport(data,state));
const lab=id=>data.labs.find(l=>l.track===id);

function solved(l){
 if(l.type==='parameters')return clone(l.solution.validParameters[0]);
 if(l.type==='robot')return {commands:clone(l.solution.exampleCommands)};
 if(l.type==='order')return {order:clone(l.solution.order)};
 if(l.type==='branch')return {choices:clone(l.solution.choices)};
 if(l.type==='classify')return {classes:clone(l.solution.classes)};
 return {selected:clone(l.solution.selected)};
}

function session(mode='full'){
 const state=E.emptyState(mode);
 Object.assign(state,{sessionId:'V-TEST01',startedAt:'2026-10-20T08:00:00.000Z',age:'14–15',goal:'project',profileDone:true,lastRoute:'hub',resumeRoute:'lab:robotics',experienceVersion:'2.0-visual',interestTiming:{}});
 E.getQuestions(data,mode).forEach((q,i)=>{
  if(i%4===0)return;
  state.answers[q.id]=i%5===0?null:1+i%5;
  state.interestTiming[q.id]=i%2?'before-mission':'after-mission';
 });
 data.situations.slice(0,mode==='quick'?2:8).forEach((q,i)=>state.situations[q.id]=i%2?null:(q.options||q.choices)[0].id);
 for(const [index,l] of data.labs.entries()){
  const firstDraft=E.defaultDraft(l),lastDraft=solved(l);
  state.labs[l.track]={first:E.gradeLab(l,firstDraft),firstDraft,firstAt:'2026-10-20T08:01:00.000Z',firstHadHint:false,last:E.gradeLab(l,lastDraft),lastDraft,lastAt:'2026-10-20T08:03:00.000Z',hintUsed:true,attempts:2,skipped:false};
  state.drafts[l.track]=E.defaultDraft(l);
  state.experience[l.track]=index%4;
  state.reflections[l.track]=index%2?null:4;
 }
 // This unfinished work must stay distinct from the last checked solution.
 state.drafts.robotics={commands:['U','R']};
 state.planned=['engineering','robotics'];
 state.nextSteps={engineering:{artifact:'model',reviewDate:'2026-11-12'},robotics:{artifact:'program',reviewDate:''}};
 state.projectTrials={engineering:{status:'started',happenedOn:'2026-10-28',note:'Собрал бумажный держатель. Хочу проверить устойчивость.',next:'continue'},research:{status:'',happenedOn:'',note:'',next:'undecided'}};
 return state;
}

test('A checkpoint round trip preserves both routes, drafts, all eight histories and the project journal',()=>{
 for(const mode of ['full','quick']){
  const state=session(mode),exported=checkpoint(state),before=clone(exported);
  const result=E.prepareImport(data,exported);
  assert.equal(exported.format,'rgsu-vector-result');assert.equal(exported.checkpointVersion,1);assert.equal(exported.experienceVersion,'2.0-visual');
  assert.equal(result.kind,'checkpoint');assert.deepEqual(result.issues,[]);assert.deepEqual(result.warnings,[]);
  assert.deepEqual(result.state,state);
  assert.deepEqual(E.progress(data,result.state),E.progress(data,state));
  assert.deepEqual(E.interestScores(data,result.state),E.interestScores(data,state));
  assert.deepEqual(exported,before,'preparing an import cannot mutate the selected file');
  result.state.drafts.robotics.commands.push('L');
  result.state.labs.robotics.lastDraft.commands.pop();
  result.state.projectTrials.engineering.note='Изменённая запись';
  assert.deepEqual(exported,before,'the preview owns independent nested data');
 }
});

test('An unfinished draft is not substituted for a checked attempt and import does not count as a new attempt',()=>{
 const state=session('quick'),result=E.prepareImport(data,checkpoint(state));
 assert.deepEqual(result.state.drafts.robotics,{commands:['U','R']});
 assert.deepEqual(result.state.labs.robotics.lastDraft,{commands:lab('robotics').solution.exampleCommands});
 assert.deepEqual(result.state.labs.robotics,state.labs.robotics);
 assert.equal(result.state.labs.robotics.attempts,2);
 assert.equal(result.state.labs.robotics.firstAt,'2026-10-20T08:01:00.000Z');
 assert.equal(result.state.labs.robotics.lastAt,'2026-10-20T08:03:00.000Z');
});

test('Imported scores and progress are never authoritative',()=>{
 const state=session('quick'),file=checkpoint(state);
 file.scores=[{track:'engineering',mean:500,count:99,eligible:true}];
 file.progress={percent:100,labCount:100,completed:100};
 const result=E.prepareImport(data,file);
 assert.equal(result.state.scores,undefined);assert.equal(result.state.progress,undefined);
 assert.deepEqual(E.interestScores(data,result.state),E.interestScores(data,state));
 assert.deepEqual(E.progress(data,result.state),E.progress(data,state));
 const nextFile=checkpoint(result.state);
 assert.notDeepEqual(nextFile.scores,file.scores);assert.notDeepEqual(nextFile.progress,file.progress);
});

test('An old result file keeps evidence but cannot invent the profile checkpoint, drafts or start date',()=>{
 const state=session('quick'),file=checkpoint(state);
 for(const key of ['checkpointVersion','startedAt','profileDone','drafts','lastRoute','resumeRoute','projectTrials'])delete file[key];
 file.progress={percent:100,completed:21,total:21};
 const before=clone(file),result=E.prepareImport(data,file);
 assert.equal(result.kind,'legacy');assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/профиль/);assert.match(result.warnings[0],/Дата начала/);
 assert.deepEqual(result.issues,[]);
 assert.equal(result.state.startedAt,null);assert.equal(result.state.profileDone,false);
 assert.equal(result.state.lastRoute,'profile');assert.equal(result.state.resumeRoute,undefined);assert.deepEqual(result.state.drafts,{});
 for(const key of ['sessionId','mode','age','goal','answers','situations','labs','reflections','planned','nextSteps','experience','experienceVersion','interestTiming'])assert.deepEqual(result.state[key],state[key],key);
 assert.deepEqual(file,before);
 const reloaded=E.restoreState(data,clone(result.state));
 assert.equal(reloaded.repaired,false);assert.equal(reloaded.state.startedAt,null);
 const movedAgain=E.prepareImport(data,checkpoint(reloaded.state));
 assert.equal(movedAgain.kind,'checkpoint');assert.equal(movedAgain.state.startedAt,null);assert.deepEqual(movedAgain.issues,[]);
});

test('Legacy metadata cannot assert an unsupported original start or an unrecorded completed profile',()=>{
 const file=checkpoint(session());delete file.checkpointVersion;
 const result=E.prepareImport(data,file);
 assert.equal(result.state.startedAt,null);assert.equal(result.state.profileDone,false);
 assert.deepEqual(result.state.drafts,{});assert.equal(result.state.resumeRoute,undefined);
 delete file.experienceVersion;
 assert.equal(E.prepareImport(data,file).state.experienceVersion,'1.0-original');
});

test('Unsupported envelopes and future versions fail explicitly without accepting raw local saves',()=>{
 const valid=checkpoint(session()),bad=[
  [null,'format'],[[],'format'],[session(),'format'],[{...valid,format:'another-product'},'format'],
  [{...valid,version:'2.0-future'},'version'],[{...valid,mode:'extended'},'mode'],[{...valid,sessionId:'ПРИМЕР'},'sessionId'],
  [{...valid,answers:[]},'answers'],[{...valid,checkpointVersion:2},'checkpointVersion'],[{...valid,checkpointVersion:'1'},'checkpointVersion'],
  [{...valid,checkpointVersion:null},'checkpointVersion'],[{...valid,experienceVersion:'3.0-future'},'experienceVersion'],[{...valid,experienceVersion:null},'experienceVersion']
 ];
 const noEdition={...valid};delete noEdition.experienceVersion;bad.push([noEdition,'experienceVersion']);
 for(const [file,code] of bad)assert.throws(()=>E.prepareImport(data,file),error=>error instanceof Error&&error.code===code&&error.message.length>10,code);
 const futureLegacy={...valid,experienceVersion:'3.0-future'};delete futureLegacy.checkpointVersion;
 assert.throws(()=>E.prepareImport(data,futureLegacy),error=>error.code==='experienceVersion');
});

test('Explicit unknown answers and reflection remain different from missing responses',()=>{
 const state=E.emptyState('quick'),[a,b]=E.getQuestions(data,'quick');state.experienceVersion='2.0-visual';state.answers[a.id]=null;state.reflections.engineering=null;
 const result=E.prepareImport(data,checkpoint(state));
 assert.equal(result.state.age,'');assert.equal(result.state.answers[a.id],null);assert.equal(Object.hasOwn(result.state.answers,b.id),false);
 assert.equal(result.state.reflections.engineering,null);assert.equal(Object.hasOwn(result.state.reflections,'robotics'),false);
 assert.equal(E.progress(data,result.state).answered,1);assert.ok(E.interestScores(data,result.state).every(s=>s.mean===null&&s.count===0));
 assert.equal(result.state.resumeRoute,undefined);assert.deepEqual(result.issues,[]);
});

test('Checkpoint repairs remain visible and isolate a damaged field from valid neighbouring work',()=>{
 const state=session('quick'),file=checkpoint(state);delete file.profileDone;delete file.startedAt;delete file.lastRoute;
 file.drafts.robotics={commands:['U','?',3,'R']};file.resumeRoute='interests:99';file.projectTrials.engineering.note='x'.repeat(281);
 const before=clone(file),result=E.prepareImport(data,file);
 assert.equal(result.kind,'checkpoint');assert.equal(result.state.startedAt,null);assert.equal(result.state.profileDone,false);
 assert.deepEqual(result.state.drafts.robotics,{commands:['U','R']});assert.equal(result.state.resumeRoute,undefined);
 for(const key of ['profileDone','startedAt','lastRoute','drafts.robotics','resumeRoute','projectTrials.engineering.note'])assert.ok(result.issues.includes(key),key);
 assert.equal(result.warnings.length,1);assert.deepEqual(result.state.labs,state.labs);assert.deepEqual(result.state.answers,state.answers);
 assert.equal(result.state.projectTrials.engineering.status,'started');assert.equal(result.state.projectTrials.engineering.note,undefined);
 assert.deepEqual(file,before);
});

test('Project trials preserve optional fields, empty values and an unselected direction without affecting scoring',()=>{
 const state=session(),originalScores=E.interestScores(data,state),originalProgress=E.progress(data,state);
 state.projectTrials={
  engineering:{status:'completed',happenedOn:'2024-02-29',note:'я'.repeat(280),next:'continue'},
  robotics:{status:'started',happenedOn:'2000-02-29',note:'Проверить после исправления',next:'another'},
  code:{status:'',happenedOn:'',note:'',next:''},ai:{next:'undecided'},social:{}
 };
 state.planned=[];
 const result=E.prepareImport(data,checkpoint(state));
 assert.deepEqual(result.state.projectTrials,state.projectTrials);assert.deepEqual(result.issues,[]);
 assert.deepEqual(E.interestScores(data,result.state),originalScores);assert.deepEqual(E.progress(data,result.state),originalProgress);
 assert.deepEqual(result.state.labs,state.labs);assert.deepEqual(result.state.planned,[]);
 const local=E.restoreState(data,clone(result.state));assert.equal(local.repaired,false);assert.deepEqual(local.state.projectTrials,state.projectTrials);
});

test('Project trial validation rejects impossible dates, oversized notes and unknown fields independently',()=>{
 const state=session();state.projectTrials={
  engineering:{status:'completed',happenedOn:'2025-02-29',note:'Сохранить эту заметку',next:'continue',score:100},
  robotics:{status:'done',happenedOn:'1900-02-29',note:'x'.repeat(281),next:'repeat'},
  code:{happenedOn:'2026-04-31',note:23},ai:{happenedOn:'2026-2-02'},design:{happenedOn:'0000-01-01'},
  research:{happenedOn:'2026-01-00'},xr:[],unknown:{status:'completed'}
 };
 const result=E.prepareImport(data,checkpoint(state));
 assert.deepEqual(result.state.projectTrials.engineering,{status:'completed',note:'Сохранить эту заметку',next:'continue'});
 for(const key of ['robotics','code','ai','design','research'])assert.deepEqual(result.state.projectTrials[key],{});
 assert.equal(result.state.projectTrials.xr,undefined);assert.equal(result.state.projectTrials.unknown,undefined);
 for(const key of ['engineering.happenedOn','engineering.score','robotics.status','robotics.happenedOn','robotics.note','robotics.next','code.happenedOn','code.note','ai.happenedOn','design.happenedOn','research.happenedOn','xr','unknown'])assert.ok(result.issues.includes('projectTrials.'+key),key);
 assert.deepEqual(result.state.labs,state.labs);assert.deepEqual(result.state.nextSteps,state.nextSteps);
});

test('Absent journals stay empty, malformed journal containers are reported, and exports remain compatible with old states',()=>{
 const state=session();delete state.projectTrials;
 assert.deepEqual(E.createExport(data,state).projectTrials,{});
 assert.deepEqual(E.prepareImport(data,checkpoint(state)).state.projectTrials,{});
 for(const value of [null,[],5,'notes']){
  const file=checkpoint(state);file.projectTrials=value;
  const result=E.prepareImport(data,file);
  assert.deepEqual(result.state.projectTrials,{});assert.ok(result.issues.includes('projectTrials'));
  assert.deepEqual(result.state.answers,state.answers);
 }
});
