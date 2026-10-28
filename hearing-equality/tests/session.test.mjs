import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionLedger, frameReadiness } from '../app/session.js';
test('known demos do not inflate field metrics or manual accuracy',()=>{
  const log=new SessionLedger();const a=log.addAttempt({source:'reference',accepted:true,predicted:'Да'});log.confirm(a.id,'Да');
  log.addAttempt({source:'known-video',accepted:true,predicted:'Да'});
  assert.deepEqual(log.summary(),{total:0,suggested:0,rejected:0,reviewed:0,correct:0,corrected:0,medianMs:null,demo:2,personal:0});
});
test('reviews are explicit, corrections count and cannot be counted twice',()=>{
  const log=new SessionLedger();const a=log.addAttempt({source:'camera',accepted:true,predicted:'Вопрос',elapsedMs:3100});
  const b=log.addAttempt({source:'video',accepted:false,elapsedMs:800,personalSamples:true});
  assert.equal(log.summary().reviewed,0);assert.equal(log.confirm(a.id,'Да'),true);assert.equal(log.confirm(a.id,'Вопрос'),false);
  assert.equal(log.markIncorrect(b.id),true);assert.equal(log.summary().corrected,1);assert.equal(log.summary().correct,0);assert.equal(log.summary().medianMs,1950);
});
test('blank confirmation has no side effects, punctuation-equivalent confirmation is accepted',()=>{
  const log=new SessionLedger(),a=log.addAttempt({source:'camera',accepted:true,predicted:'Привет!'});
  assert.equal(log.confirm(a.id,' '),false);assert.equal(log.confirm(a.id,'привет'),true);assert.equal(log.summary().correct,1);
});
test('reports omit full dialogue text and clearing starts a fresh session',()=>{
  const log=new SessionLedger();log.addMessage('visitor','Private conversation');log.addAttempt({source:'camera',accepted:false});
  assert.equal(JSON.stringify(log.exportReport()).includes('Private conversation'),false);
  log.clear();assert.equal(log.messages.length,0);assert.equal(log.summary().total,0);
});
test('frame guidance distinguishes body, clipped hands and complete hands',()=>{
  const pose=Array.from({length:33},()=>[.5,.5,0,1]),hand=Array.from({length:21},()=>[.5,.5,0]);
  assert.deepEqual(frameReadiness({pose,left:hand,right:hand}),{body:true,hands:2,ready:true});
  assert.equal(frameReadiness({pose,left:hand,right:hand.map((p,i)=>i===3?[1,.5,0]:p)}).hands,1);
  assert.equal(frameReadiness(null).ready,false);
});
