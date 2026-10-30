'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../dist/engine.js');

const data = {
  interests: E.KEYS.flatMap(track => Array.from({length:6},(_,i)=>({id:`${track}-${i}`,track}))),
  situations: Array.from({length:8},(_,i)=>({id:`case-${i}`}))
};

test('Unanswered and explicit unknown answers do not become zero interest',()=>{
  const state=E.emptyState();
  state.answers['engineering-0']=null;
  const scores=E.interestScores(data,state);
  assert.ok(scores.every(s=>s.mean===null&&s.count===0&&!s.eligible));
  assert.equal(E.progress(data,state).answered,1,'an explicit unknown is a completed answer, not an interest score');
  assert.deepEqual(E.recommendations(scores).items,[]);
});

test('Only valid 1–5 responses count and full mode requires four',()=>{
  const state=E.emptyState();
  Object.assign(state.answers,{'engineering-0':1,'engineering-1':3,'engineering-2':5,'engineering-3':3,'engineering-4':null,'engineering-5':0});
  let score=E.interestScores(data,state)[0];
  assert.deepEqual({mean:score.mean,count:score.count,total:score.total,eligible:score.eligible},{mean:3,count:4,total:6,eligible:true});
  state.answers['engineering-3']=null;
  score=E.interestScores(data,state)[0];
  assert.equal(score.count,3);
  assert.equal(score.eligible,false);
});

test('Quick and full modes use balanced, distinct 16/48 question sets',()=>{
  const quick=E.getQuestions(data,'quick'),full=E.getQuestions(data,'full');
  assert.equal(quick.length,16); assert.equal(full.length,48);
  assert.deepEqual(quick.slice(0,8).map(q=>q.track),E.KEYS);
  for(const k of E.KEYS){
    assert.equal(quick.filter(q=>q.track===k).length,2);
    assert.equal(full.filter(q=>q.track===k).length,6);
  }
  const state=E.emptyState('quick');
  for(const q of full)state.answers[q.id]=q.id.endsWith('-0')||q.id.endsWith('-1')?1:5;
  assert.ok(E.interestScores(data,state).every(s=>s.mean===1&&s.count===2&&s.eligible));
  state.mode='full';
  assert.ok(E.interestScores(data,state).every(s=>Math.abs(s.mean-22/6)<1e-12&&s.count===6));
});

test('Ties at recommendation cutoff are preserved, including a fully flat profile',()=>{
  const scores=E.KEYS.map((track,i)=>({track,mean:i<4?5:2,eligible:true,count:6,total:6}));
  const result=E.recommendations(scores);
  assert.equal(result.items.length,4);
  assert.equal(result.flat,false);
  const flat=E.recommendations(scores.map(s=>({...s,mean:4})));
  assert.equal(flat.items.length,8);
  assert.equal(flat.flat,true);
  assert.equal(E.recommendations(scores.map(s=>({...s,mean:2}))).low,true);
});

test('Ineligible interest scales are not invented as recommendations',()=>{
  const result=E.recommendations([{track:'ai',mean:null,eligible:false},{track:'code',mean:5,eligible:false},{track:'design',mean:3,eligible:true}]);
  assert.deepEqual(result.items.map(x=>x.track),['design']);
});

test('Engineering mission accepts both feasible integer designs and enforces boundaries',()=>{
  const lab={type:'parameters',config:{},solution:{}};
  const feasible=[];
  for(let thickness=1;thickness<=5;thickness++)for(let ribs=0;ribs<=4;ribs++){
    if(E.gradeLab(lab,{thickness,ribs}).all)feasible.push([thickness,ribs]);
  }
  assert.deepEqual(feasible,[[2,4],[3,3]]);
  for(const draft of [{thickness:0,ribs:4},{thickness:6,ribs:1},{thickness:2,ribs:5},{thickness:2.5,ribs:3},{thickness:2,ribs:-1}])assert.equal(E.gradeLab(lab,draft).score,0);
});

const robot={type:'robot',config:{size:4,start:[0,3],goal:[3,0],obstacles:[[1,2],[2,2]],maxCommands:6},solution:{}};
test('Robot detects successful route, obstacles, field bounds and invalid commands',()=>{
  assert.equal(E.gradeLab(robot,{commands:['U','U','R','R','R','U']}).all,true);
  assert.equal(E.robotPath(robot.config,['R','U']).collision,true);
  assert.equal(E.robotPath(robot.config,['L']).collision,true);
  assert.equal(E.robotPath(robot.config,['?']).invalid,true);
  assert.equal(E.gradeLab(robot,{commands:[]}).all,false);
});

test('Robot enforces command budget even when the route is valid',()=>{
  const commands=['U','D','U','U','R','R','R','U'];
  const result=E.gradeLab(robot,{commands});
  assert.equal(result.extra.reached,true);
  assert.equal(result.extra.collision,false);
  assert.equal(result.criteria[2].passed,false);
  assert.equal(result.all,false);
});

test('Ordering mission detects wrong sequence and missing cards',()=>{
  const lab={type:'order',config:{items:[{id:'check'},{id:'make'},{id:'measure'}]},solution:{order:['measure','make','check']}};
  assert.equal(E.gradeLab(lab,{order:['measure','make','check']}).all,true);
  assert.equal(E.gradeLab(lab,{order:['make','measure','check']}).all,false);
  assert.equal(E.gradeLab(lab,{order:['measure','check']}).all,false);
});

test('Multiple selection needs all correct selections and no extras',()=>{
  const lab={type:'multi',config:{},solution:{selected:['a','c']}};
  assert.equal(E.gradeLab(lab,{selected:['a','c']}).all,true);
  assert.equal(E.gradeLab(lab,{selected:['a']}).all,false);
  assert.equal(E.gradeLab(lab,{selected:['a','b','c']}).all,false);
  assert.equal(E.gradeLab(lab,{selected:[]}).all,false);
});

test('Branch and measurement missions distinguish missing decisions',()=>{
  const branch={type:'branch',config:{stages:[{id:'s1',prompt:'One'},{id:'s2',prompt:'Two'}]},solution:{choices:{s1:'b',s2:'a'}}};
  assert.equal(E.gradeLab(branch,{choices:{s1:'b',s2:'a'}}).all,true);
  assert.equal(E.gradeLab(branch,{choices:{s1:'b'}}).all,false);
  const classify={type:'classify',config:{measurements:[{id:'m1',value:9.8},{id:'m2',value:10.2},{id:'m3',value:10.21}]},solution:{classes:{m1:'pass',m2:'pass',m3:'fail'}}};
  assert.equal(E.gradeLab(classify,{classes:{m1:'pass',m2:'pass',m3:'fail'}}).all,true);
  assert.equal(E.gradeLab(classify,{classes:{m1:'pass',m2:'fail',m3:'fail'}}).all,false);
});

test('Budget maximization respects mandatory items and recognizes equivalent optima',()=>{
  const lab={type:'budget',config:{budget:6,requiredIds:['a'],items:[{id:'a',cost:4,impact:3},{id:'b',cost:4,impact:5},{id:'c',cost:2,impact:2},{id:'d',cost:2,impact:2}]},solution:{selected:['a','c']}};
  assert.equal(E.gradeLab(lab,{selected:['a','c']}).all,true);
  assert.equal(E.gradeLab(lab,{selected:['a','d']}).all,true);
  const forbidden=E.gradeLab(lab,{selected:['b','c']});
  assert.equal(forbidden.extra.impact,7);
  assert.equal(forbidden.criteria[0].passed,true);
  assert.equal(forbidden.criteria[1].passed,false);
  assert.equal(forbidden.criteria[2].passed,false);
  assert.equal(E.gradeLab(lab,{selected:['a','c','d']}).all,false);
  assert.equal(E.gradeLab(lab,{selected:[]}).all,false);
});

test('Progress completion is separate from scored interests and supports quick/full',()=>{
  for(const mode of ['quick','full']){
    const state=E.emptyState(mode);
    for(const q of E.getQuestions(data,mode))state.answers[q.id]=null;
    for(const s of data.situations.slice(0,mode==='quick'?2:8))state.situations[s.id]=null;
    for(const k of E.KEYS.slice(0,mode==='quick'?2:8))state.labs[k]={skipped:true};
    state.profileDone=true;
    const p=E.progress(data,state);
    assert.equal(p.percent,100);
    assert.equal(p.completed,p.total);
    assert.ok(E.interestScores(data,state).every(s=>s.mean===null&&!s.eligible));
  }
});

// Validate the exact bank distributed with this application, not the content
// writer's intermediate files or unrelated JSON documents.
const bankDir=path.resolve(__dirname,'../dist');
const jsonFiles=['bank.json'];
for(const file of jsonFiles){
  const raw=JSON.parse(fs.readFileSync(path.join(bankDir,file),'utf8'));
  const bank=Array.isArray(raw)?{labs:raw}:raw;
  if(Array.isArray(bank.interests))test(`Content bank ${file}: unique IDs and six interests per track`,()=>{
    assert.equal(new Set(bank.interests.map(q=>q.id)).size,bank.interests.length);
    for(const k of E.KEYS)assert.equal(bank.interests.filter(q=>q.track===k).length,6,k);
  });
  const labs=bank.labs||bank.missions;
  if(Array.isArray(labs))for(const lab of labs){
    if(!lab.type||!lab.config||!lab.solution)continue;
    test(`Content bank ${file}: solution satisfies ${lab.id||lab.type}`,()=>{
      const examples=lab.type==='parameters'?lab.solution.validParameters:lab.type==='robot'?[{commands:lab.solution.exampleCommands}]:[lab.solution];
      assert.ok(Array.isArray(examples)&&examples.length>0);
      for(const example of examples){
        const result=E.gradeLab(lab,example);
        assert.equal(result.all,true,JSON.stringify(result));
      }
    });
    if(lab.validation&&Number.isInteger(lab.validation.maxScore))test(`Content bank ${file}: published scoring contract agrees for ${lab.id||lab.type}`,()=>{
      assert.equal(E.gradeLab(lab,E.defaultDraft(lab)).total,lab.validation.maxScore);
    });
    if(lab.type==='classify')test(`Content bank ${file}: tolerance endpoints and near-outside values match the stated inclusive range`,()=>{
      const c=lab.config,lower=Math.round(c.lower*100),upper=Math.round(c.upper*100);
      assert.ok(c.measurements.some(m=>Math.round(m.value*100)===lower),'lower boundary is represented');
      assert.ok(c.measurements.some(m=>Math.round(m.value*100)===upper),'upper boundary is represented');
      for(const m of c.measurements){
        const n=Math.round(m.value*100),inside=c.inclusive?n>=lower&&n<=upper:n>lower&&n<upper;
        assert.equal(lab.solution.classes[m.id],inside?'inside':'outside',m.id);
      }
    });
    if(lab.type==='budget')test(`Content bank ${file}: budget solution is globally optimal under mandatory constraints`,()=>{
      const c=lab.config, required=[...new Set([...(c.requiredIds||[]),...(c.required||[]),...(c.mandatory||[]),...c.items.filter(i=>i.required).map(i=>i.id)])];
      assert.ok(Array.isArray(required));
      const options=[];
      for(let mask=0;mask<(1<<c.items.length);mask++){
        const chosen=c.items.filter((_,i)=>mask&(1<<i));
        if(!required.every(id=>chosen.some(i=>i.id===id)))continue;
        const cost=chosen.reduce((a,i)=>a+i.cost,0),impact=chosen.reduce((a,i)=>a+i.impact,0);
        if(cost<=c.budget)options.push({chosen,cost,impact});
      }
      assert.ok(options.length>0,'at least one feasible budget');
      const optimum=Math.max(...options.map(o=>o.impact));
      const stated=c.items.filter(i=>lab.solution.selected.includes(i.id)).reduce((a,i)=>a+i.impact,0);
      assert.equal(stated,optimum);
      for(const option of options)assert.equal(E.gradeLab(lab,{selected:option.chosen.map(i=>i.id)}).all,option.impact===optimum);
    });
    if(lab.type==='budget')test(`Content bank ${file}: omitting each mandatory selection cannot receive full credit`,()=>{
      const required=[...new Set([...(lab.config.requiredIds||[]),...(lab.config.required||[]),...(lab.config.mandatory||[]),...lab.config.items.filter(i=>i.required).map(i=>i.id)])];
      for(const id of required){
        const selected=lab.solution.selected.filter(x=>x!==id);
        assert.equal(E.gradeLab(lab,{selected}).all,false,`omitted ${id}: ${selected.join(',')}`);
      }
    });
  }
}
