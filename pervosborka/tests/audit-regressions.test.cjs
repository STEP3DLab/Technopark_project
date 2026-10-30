'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../dist/engine.js');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/bank.json'),'utf8'));
const lab=id=>data.labs.find(l=>l.track===id);
const clone=v=>JSON.parse(JSON.stringify(v));
const restore=saved=>E.restoreState(data,clone(saved));

test('Age stays unknown until the participant chooses it, including in export',()=>{
 const state=E.emptyState('quick');
 assert.equal(state.age,'');
 assert.equal(E.createExport(data,state).age,'');
 for(const age of [null,23,'unknown','14-15']){
  const result=restore({...state,age});
  assert.equal(result.state.age,'');
  assert.ok(result.issues.includes('age'));
 }
});

test('Missing age and malformed plans no longer make an otherwise usable save unsafe for the report',()=>{
 const saved=E.emptyState('quick');delete saved.age;saved.planned={engineering:true};
 const qs=E.getQuestions(data,'quick').filter(q=>q.track==='engineering');
 saved.answers[qs[0].id]=4;saved.answers[qs[1].id]=null;
 const {state,repaired,issues}=restore(saved);
 assert.equal(repaired,true);assert.ok(issues.includes('age'));assert.ok(issues.includes('planned'));
 assert.doesNotThrow(()=>state.age.startsWith('18+'));
 assert.doesNotThrow(()=>state.planned.map(id=>E.tracks.find(t=>t.id===id)));
 const score=E.interestScores(data,state).find(s=>s.track==='engineering');
 assert.equal(score.mean,4);assert.equal(score.count,1);assert.equal(score.eligible,false);
 assert.deepEqual(state.answers,saved.answers,'valid answers and explicit unknowns survive unrelated damage');
});

test('Wrong draft types are isolated to their mission and do not crash grading',()=>{
 const saved=E.emptyState();
 Object.assign(saved.drafts,{engineering:{thickness:2,ribs:'broken'},robotics:{commands:{}},code:{order:null},ai:{selected:'sample90'},design:null,xr:{choices:[]},research:{classes:5},social:{selected:{}}});
 const {state,repaired}=restore(saved);
 assert.equal(repaired,true);assert.equal(state.drafts.engineering.thickness,2);
 for(const mission of data.labs)assert.doesNotThrow(()=>E.gradeLab(mission,state.drafts[mission.track]),mission.track);
 assert.deepEqual(state.drafts.robotics.commands,[]);
 assert.deepEqual(state.drafts.ai.selected,[]);
 assert.deepEqual(state.drafts.xr.choices,{});
});

test('Valid legacy first and last attempts, snapshots, hints and counts are preserved',()=>{
 const saved=E.emptyState('quick');saved.sessionId='V-TEST01';saved.age='14–15';
 const firstDraft={commands:['R']},lastDraft={commands:['U','U','R','R','U','U','R','R']};
 saved.labs.robotics={first:E.gradeLab(lab('robotics'),firstDraft),firstDraft,firstHadHint:false,firstAt:'2026-10-29T10:00:00.000Z',last:E.gradeLab(lab('robotics'),lastDraft),lastDraft,hintUsed:true,attempts:2,skipped:false,lastAt:'2026-10-29T10:02:00.000Z'};
 saved.drafts.robotics=clone(lastDraft);
 saved.experience.robotics=1;saved.reflections.robotics=4;saved.planned=['robotics','engineering'];
 const before=clone(saved),result=restore(saved);
 assert.equal(result.repaired,false,JSON.stringify(result.issues));
 assert.deepEqual(result.state.labs,saved.labs);
 assert.deepEqual(result.state.drafts,saved.drafts);
 assert.deepEqual(saved,before,'restoration must not mutate the source retained for recovery');
 result.state.labs.robotics.lastDraft.commands.pop();
 assert.equal(saved.labs.robotics.lastDraft.commands.length,8,'restored snapshots are independent copies');
});

test('Damaged historical grades are rebuilt only from an intact original snapshot',()=>{
 const saved=E.emptyState();
 saved.labs.engineering={first:{score:99},firstDraft:{thickness:1,ribs:0},last:{score:99},lastDraft:{thickness:3,ribs:'bad'},attempts:2,hintUsed:true};
 const {state,repaired}=restore(saved);
 assert.equal(repaired,true);
 assert.equal(state.labs.engineering.first.score,2,'recover the original failing design, not an invented solution');
 assert.equal(state.labs.engineering.last,undefined,'a damaged answer is insufficient evidence to reconstruct a grade');
 assert.equal(state.labs.engineering.lastDraft,undefined);
 assert.equal(state.labs.engineering.attempts,2);
 assert.equal(state.labs.engineering.hintUsed,true);
});

test('Unknown and malformed nested values do not become scored answers or fabricated history',()=>{
 const saved=E.emptyState('quick'),q=E.getQuestions(data,'quick')[0],situation=data.situations[0];
 saved.answers={[q.id]:0,unknown:5};saved.situations={[situation.id]:'not-an-option'};
 saved.experience={engineering:99};saved.reflections={engineering:null,robotics:0};
 saved.labs={engineering:null,unknown:{first:{score:100}}};saved.planned=['engineering','engineering','unknown','robotics','ai'];
 const result=restore(saved);
 assert.deepEqual(result.state.answers,{});assert.deepEqual(result.state.situations,{});
 assert.deepEqual(result.state.experience,{});assert.deepEqual(result.state.reflections,{engineering:null});
 assert.deepEqual(result.state.labs,{});assert.deepEqual(result.state.planned,['engineering','robotics']);
 assert.equal(E.progress(data,result.state).labCount,0);
 assert.ok(E.interestScores(data,result.state).every(score=>score.mean===null));
});

test('Visual edition, answer timing and a valid interrupted page survive restoration',()=>{
 const saved=E.emptyState('quick'),q=E.getQuestions(data,'quick')[0];
 saved.experienceVersion='2.0-visual';saved.resumeRoute='interests:1';saved.lastRoute='hub';
 saved.answers[q.id]=4;saved.interestTiming={[q.id]:'after-mission'};saved.reflections.robotics=null;
 const result=restore(saved);
 assert.equal(result.repaired,false,JSON.stringify(result.issues));
 assert.equal(result.state.resumeRoute,'interests:1');
 assert.equal(result.state.experienceVersion,'2.0-visual');
 assert.deepEqual(E.createExport(data,result.state).interestTiming,saved.interestTiming);
 assert.equal(result.state.reflections.robotics,null);
});

test('Unsupported saves are explicitly rejected instead of silently treated as compatible',()=>{
 for(const saved of [null,[],{}, {...E.emptyState(),version:'future'}]){
  const result=restore(saved);assert.equal(result.state,null);assert.equal(result.repaired,true);assert.ok(result.issues.length>0);
 }
});

function runApp(saved,hash){
 const app={innerHTML:''},main={focus(){},prepend(){}};
 const storage=new Map(saved===null?[]:[['rgsu-vector-1',JSON.stringify(saved)]]);
 const listeners=new Map();
 const document={activeElement:null,hidden:false,getElementById(id){return id==='app'?app:main;},querySelectorAll(){return [];},querySelector(){return null;},createElement(){return {innerHTML:''};},addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);}};
 const window={VectorEngine:E,VECTOR_DATA:data,addEventListener(){},scrollTo(){}};
 const context={window,document,location:{hash},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout,clearTimeout,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8'),context);
 return {html:app.innerHTML,storage,location:context.location,click(action){
  const button={disabled:false,dataset:{action}};
  const event={target:{closest:selector=>selector==='[data-action]'?button:null}};
  for(const listener of listeners.get('click')||[])listener(event);
 }};
}

test('Malformed or unknown URL fragments show a recoverable page instead of aborting the app',()=>{
 for(const fragment of ['#%','#%E0%A4','#unknown-route']){
  const rendered=runApp(null,fragment);
  assert.match(rendered.html,/Такой страницы нет/);
  assert.match(rendered.html,/Вернуться к началу/);
 }
});

test('The app renders a repaired report while retaining the exact damaged source for recovery',()=>{
 const saved=E.emptyState('quick');delete saved.age;saved.planned={};
 const original=JSON.stringify(saved),result=runApp(saved,'#report');
 assert.match(result.html,/ПЕРСОНАЛЬНАЯ КАРТА/);
 assert.equal(result.storage.get('rgsu-vector-1-recovery'),original);
 const repaired=JSON.parse(result.storage.get('rgsu-vector-1'));
 assert.equal(repaired.age,'');assert.deepEqual(repaired.planned,[]);
});

test('Interrupted robot playback cannot announce visual success; completed playback still can',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 const start=source.indexOf('async function playRobot('),end=source.indexOf('\nfunction engineeringFlat',start);
 assert.ok(start>=0&&end>start);
 for(const completed of [false,true]){
  const status={textContent:''},button={textContent:'Запустить',disabled:false,isConnected:true};
  const context=vm.createContext({state:{},labFor:()=>lab('robotics'),draftFor:()=>({commands:['U','U','R','R','U','U','R','R']}),E,sceneControllers:new Map([['robot',{available:true,play:async()=>({completed,reason:completed?'complete':'context-lost',position:completed?[4,0]:[0,3]})}]]),document:{getElementById:()=>status},button});
  vm.runInContext(source.slice(start,end),context);await vm.runInContext('playRobot(button)',context);
  assert.equal(button.disabled,false);
  if(completed)assert.match(status.textContent,/достиг цели/);
  else{assert.match(status.textContent,/прерван/);assert.doesNotMatch(status.textContent,/достиг цели/);}
 }
});

test('Continue finds actual gaps in interests after out-of-order answers in both route lengths',()=>{
 for(const mode of ['quick','full']){
  const state=E.emptyState(mode),questions=E.getQuestions(data,mode);
  assert.equal(E.nextUnansweredRoute(data,state),'profile');
  state.profileDone=true;assert.equal(E.nextUnansweredRoute(data,state),'labs');
  for(const key of E.KEYS.slice(0,mode==='quick'?2:8))state.labs[key]={skipped:true};
  for(const q of questions)state.answers[q.id]=null;
  delete state.answers[questions[1].id];delete state.answers[questions.at(-2).id];
  assert.equal(E.nextUnansweredRoute(data,state),'interests:0','later answers cannot hide an early gap');
  state.answers[questions[1].id]=null;
  assert.equal(E.nextUnansweredRoute(data,state),mode==='quick'?'interests:1':'interests:5');
 }
});

test('Completing a late profile through the actual click handler continues to unanswered interests after all labs',()=>{
 const saved=E.emptyState('full');saved.profileDone=false;
 for(const key of E.KEYS)saved.labs[key]={skipped:true};
 const draft=E.defaultDraft(lab('engineering')),grade=E.gradeLab(lab('engineering'),draft);
 saved.labs.engineering={first:grade,last:grade,firstDraft:clone(draft),lastDraft:clone(draft),attempts:1,firstHadHint:false,hintUsed:false,skipped:false};
 const result=runApp(saved,'#profile');
 result.click('profile-done');
 assert.equal(result.location.hash.replace(/^#/,''),'interests:0','a late profile must not send the participant back to already completed/skipped labs');
 const persisted=JSON.parse(result.storage.get('rgsu-vector-1'));
 assert.equal(persisted.profileDone,true);
 assert.deepEqual(persisted.answers,{},'continuation must not fill unanswered interests');
 assert.equal(E.progress(data,persisted).labCount,8);
});

test('Continue finds an early situation gap and treats explicit unknowns as complete',()=>{
 const state=E.emptyState('full');state.profileDone=true;
 for(const key of E.KEYS)state.labs[key]={skipped:true};
 for(const q of E.getQuestions(data,state.mode))state.answers[q.id]=null;
 for(const q of data.situations)state.situations[q.id]=null;
 delete state.situations[data.situations[1].id];delete state.situations[data.situations[6].id];
 state.resumeRoute='lab:ai';
 assert.equal(E.nextUnansweredRoute(data,state),'situation:1');
 state.situations[data.situations[1].id]=null;
 assert.equal(E.nextUnansweredRoute(data,state),'situation:6');
 state.situations[data.situations[6].id]=null;
 assert.equal(E.nextUnansweredRoute(data,state),'report','resumeRoute does not override the completion helper');
});

test('Calendar plans survive restore and export, including deselected drafts and empty fields',()=>{
 const saved=E.emptyState('quick');saved.planned=['engineering','research'];
 saved.nextSteps={engineering:{artifact:'model',reviewDate:'2026-11-12'},research:{artifact:'protocol',reviewDate:'2024-02-29'},ai:{artifact:'program',reviewDate:''},design:{artifact:'drawing'},xr:{artifact:'scenario',reviewDate:'2000-02-29'},social:{artifact:'',reviewDate:''},robotics:{}};
 const result=restore(saved),exported=E.createExport(data,result.state);
 assert.equal(result.repaired,false,JSON.stringify(result.issues));
 assert.deepEqual(result.state.nextSteps,saved.nextSteps);
 assert.deepEqual(exported.nextSteps,saved.nextSteps);
 assert.equal(exported.nextSteps.ai.artifact,'program','removing a selection does not erase its draft plan');
});

test('Impossible calendar dates and unsupported plan values are isolated without deleting valid neighboring fields',()=>{
 const saved=E.emptyState();
 saved.nextSteps={engineering:{artifact:'model',reviewDate:'2025-02-29'},robotics:{artifact:'program',reviewDate:'1900-02-29'},code:{artifact:'unknown',reviewDate:'2020-01-01'},ai:{artifact:'program',reviewDate:'2026-04-31'},research:{reviewDate:'2026-2-02'},social:{artifact:'scenario',reviewDate:'0000-01-01'},design:[],unknown:{artifact:'drawing'}};
 const result=restore(saved);
 assert.equal(result.repaired,true);
 assert.deepEqual(result.state.nextSteps.engineering,{artifact:'model'});
 assert.deepEqual(result.state.nextSteps.robotics,{artifact:'program'});
 assert.deepEqual(result.state.nextSteps.code,{reviewDate:'2020-01-01'});
 assert.deepEqual(result.state.nextSteps.ai,{artifact:'program'});
 assert.deepEqual(result.state.nextSteps.research,{});
 assert.deepEqual(result.state.nextSteps.social,{artifact:'scenario'});
 assert.equal(result.state.nextSteps.design,undefined);assert.equal(result.state.nextSteps.unknown,undefined);
 assert.ok(result.issues.includes('nextSteps.engineering.reviewDate'));
 assert.equal(restore(result.state).repaired,false,'a repaired plan remains stable on the next reload');
});
