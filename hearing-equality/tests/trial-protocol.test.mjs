import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialProtocol} from '../app/trial-protocol.js';
import {SessionLedger} from '../app/session.js';
const catalog=[{id:'yes',text:'Да'},{id:'work',text:'Работать'},{id:'question',text:'Вопрос'}];
test('fixed seed produces a reproducible balanced series',()=>{
 const a=new TrialProtocol(catalog,'P01',27),b=new TrialProtocol(catalog,'P02',27);
 assert.deepEqual(a.tasks,b.tasks);assert.equal(a.tasks.length,6);
 for(const item of catalog)assert.equal(a.tasks.filter(t=>t.expectedId===item.id).length,2);
 assert.equal(a.next(),false);
});
test('a manual correction does not change the objective outcome',()=>{
 const p=new TrialProtocol(catalog,'P01',1),log=new SessionLedger(),context=p.context();
 const bad=catalog.find(c=>c.id!==context.expectedId);
 const a=log.addAttempt({source:'camera',accepted:true,predictedId:bad.id,predicted:bad.text,protocol:context});
 assert.equal(p.record(a,context),true);log.confirm(a.id,context.expectedText);
 assert.equal(a.objectiveMatch,false);assert.equal(p.summary().correct,0);assert.equal(p.summary().wrong,1);
 assert.equal(p.record(a,context),false);assert.equal(p.next(),true);assert.equal(p.record(a,context),false);
});
test('skips and an interrupted series remain visible in the exported denominator',()=>{
 const p=new TrialProtocol(catalog,'P01',2);p.skip();p.next();p.finish();
 assert.deepEqual(p.summary(),{planned:6,recorded:0,correct:0,rejected:0,wrong:0,skipped:1,remaining:5});
 assert.equal(p.context(),null);assert.equal(p.exportReport().ended,true);
});
