'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const History=require('../dist/draft-history.js');

test('undo and redo recover the exact draft without modifying callers',()=>{
 const h=History.create(),a={thickness:2,ribs:3},b={thickness:3,ribs:3};
 h.record('engineering',a,b,'Толщина');
 const back=h.undo('engineering',b);assert.deepEqual(back,{draft:a,label:'Толщина'});
 back.draft.ribs=0;
 assert.deepEqual(h.redo('engineering',a).draft,b);
 assert.deepEqual(a,{thickness:2,ribs:3});assert.deepEqual(b,{thickness:3,ribs:3});
});
test('a new edit after undo discards only the redo branch',()=>{
 const h=History.create(),a={order:['a','b','c']},b={order:['b','a','c']},c={order:['b','c','a']},d={order:['c','b','a']};
 h.record('code',a,b);h.record('code',b,c);h.undo('code',c);h.record('code',b,d);
 assert.equal(h.status('code').redo,0);assert.deepEqual(h.undo('code',d).draft,b);assert.deepEqual(h.undo('code',b).draft,a);
});
test('records are isolated by laboratory and clear removes the whole session',()=>{
 const h=History.create();h.record('robotics',{commands:[]},{commands:['U']});h.record('xr',{choices:{}},{choices:{entry:'goal'}});
 assert.equal(h.status('robotics').undo,1);assert.equal(h.status('xr').undo,1);
 h.clear();assert.equal(h.status('robotics').undo,0);assert.equal(h.status('xr').undo,0);
});
test('a stale timeline cannot overwrite a newly imported or externally changed draft',()=>{
 const h=History.create();h.record('social',{selected:[]},{selected:['access']});
 assert.equal(h.undo('social',{selected:['demo']}),null);assert.equal(h.status('social').undo,0);
});
test('a stale redo also fails closed',()=>{
 const h=History.create();h.record('research',{classes:{}},{classes:{m1:'inside'}});h.undo('research',{classes:{m1:'inside'}});
 assert.equal(h.redo('research',{classes:{m2:'outside'}}),null);assert.equal(h.status('research').redo,0);
});
test('history is bounded and cannot return past the retained checkpoint',()=>{
 const h=History.create({limit:2});for(let i=0;i<4;i++)h.record('engineering',{ribs:i},{ribs:i+1});
 assert.equal(h.status('engineering').undo,2);assert.deepEqual(h.undo('engineering',{ribs:4}).draft,{ribs:3});assert.deepEqual(h.undo('engineering',{ribs:3}).draft,{ribs:2});assert.equal(h.undo('engineering',{ribs:2}),null);
});
test('no-op records leave a valid redo available and key order does not create an edit',()=>{
 const h=History.create(),a={thickness:2,ribs:3},b={thickness:3,ribs:3};h.record('engineering',a,b);h.undo('engineering',b);
 assert.equal(h.record('engineering',a,{ribs:3,thickness:2}),false);assert.equal(h.status('engineering').redo,1);
});
test('snapshot arrays and nested objects are detached from subsequent edits',()=>{
 const h=History.create(),a={choices:{},selected:[]},b={choices:{entry:'goal'},selected:['access']};h.record('test',a,b);
 a.choices.entry='changed';b.selected.push('campaign');
 assert.deepEqual(h.undo('test',{choices:{entry:'goal'},selected:['access']}).draft,{choices:{},selected:[]});
});
