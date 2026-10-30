'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/route-overview.js'),E=require('../dist/engine.js'),D=require('../dist/bank.json');
function input(mode='full'){return {questions:E.getQuestions(D,mode),answers:{},cases:D.situations.slice(0,mode==='quick'?2:8),caseAnswers:{},tracks:E.tracks,records:{},reflections:{},drafts:{},targetLabs:mode==='quick'?2:8};}
test('The overview keeps missing, explicit unknown and numeric responses distinct without mutating them',()=>{
 const raw=input();raw.answers[raw.questions[0].id]=null;raw.answers[raw.questions[1].id]=1;raw.answers[raw.questions[2].id]=5;
 const before=JSON.stringify(raw),m=R.model(raw);
 assert.deepEqual(m.interest,{total:48,answered:2,unknown:1,unanswered:45});assert.equal(m.cards[1].value,1);assert.equal(m.cards[0].value,null);assert.equal(JSON.stringify(raw),before);
});
test('Global card destinations remain exact across blocks and route lengths',()=>{
 const full=R.model(input()),quick=R.model(input('quick'));
 assert.deepEqual([full.cards[47].page,full.cards[47].cursor,full.cards[47].number],[5,7,48]);
 assert.deepEqual([quick.cards[15].page,quick.cards[15].cursor,quick.cards[15].number],[1,7,16]);
 assert.equal(quick.situations.length,2);assert.equal(full.situations.length,8);
});
test('Checkpoint sends the participant to the actual missing card before explicit unknowns',()=>{
 const raw=input('quick');raw.questions.forEach(q=>raw.answers[q.id]=3);raw.answers[raw.questions[0].id]=null;delete raw.answers[raw.questions[11].id];
 let html=R.checkpoint(R.model(raw));assert.match(html,/data-ro-go="interest" data-ro-target="11"/);
 raw.answers[raw.questions[11].id]=4;html=R.checkpoint(R.model(raw));assert.match(html,/data-ro-go="interest" data-ro-target="0"/);assert.match(html,/Вернуться к сомнениям/);
});
test('Skipped laboratories do not become checked trials or create reflection requests',()=>{
 const raw=input('quick');raw.records.engineering={skipped:true};raw.records.robotics={skipped:true};
 const html=R.checkpoint(R.model(raw));assert.match(html,/0 проверено/);assert.match(html,/2 пропущено/);assert.match(html,/После первой пробы/);assert.doesNotMatch(html,/data-ro-go="reflection"/);
});
test('A short route with two checked laboratories does not demand all eight',()=>{
 const raw=input('quick');raw.records.engineering={first:{score:3,total:3}};raw.records.robotics={first:{score:1,total:3}};raw.reflections.engineering=4;raw.reflections.robotics=2;
 const html=R.checkpoint(R.model(raw));assert.match(html,/Для маршрута: 2/);assert.match(html,/data-ro-go="labs" data-ro-target="">Открыть лаборатории/);assert.match(html,/data-ro-go="projects"/);
});
test('Reflection return prioritizes a checked task without an answer and does not include unchecked drafts',()=>{
 const raw=input();raw.records.engineering={first:{score:3,total:3}};raw.records.robotics={first:{score:1,total:3}};raw.reflections.engineering=null;raw.drafts.code={};
 const html=R.checkpoint(R.model(raw));assert.match(html,/data-ro-go="reflection" data-ro-target="robotics"/);assert.match(html,/data-ro-go="lab" data-ro-target="code"/);
});
test('Invalid and inherited values do not fill missing answers; markup is escaped',()=>{
 const raw=input('quick');raw.answers=Object.create({[raw.questions[0].id]:4});raw.answers[raw.questions[1].id]=0;raw.answers[raw.questions[2].id]='5';raw.questions=raw.questions.map(q=>({...q}));raw.questions[0].prompt='<img src=x onerror="bad">';
 const m=R.model(raw);assert.equal(m.interest.answered,0);const html=R.atlas(m);assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.equal(raw.answers[raw.questions[1].id],0);
});
