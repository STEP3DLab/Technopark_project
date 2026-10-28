const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('../monitor-utils.js');
const now=Date.parse('2026-10-28T18:00:00Z');
const item=(id,status,deadline,publishedAt='2026-10-28')=>({id,status,deadline,publishedAt});
test('Date-only deadlines end at midnight Moscow, regardless of machine timezone',()=>{
  assert.equal(u.deadlineTime({deadline:'2026-10-28'}),Date.parse('2026-10-28T20:59:59Z'));
  assert.equal(u.isActive(item('a','needs_review','2026-10-28'),Date.parse('2026-10-28T21:00:00Z')),false);
});
test('Deadline queue includes unconfirmed signals without promoting their status',()=>{
  const a=item('a','needs_review','2026-10-29');
  assert.equal(u.dueSoon(a,3,now),true);
  assert.equal(a.status,'needs_review');
  for(const s of ['closed','historical'])assert.equal(u.dueSoon(item(s,s,'2026-10-29'),3,now),false);
  for(const d of [null,'bad-date','2026-10-20','2026-11-20'])assert.equal(u.dueSoon(item('x','needs_review',d),3,now),false);
});
test('Deadline ordering puts upcoming dates ahead of expired, missing and historical entries',()=>{
  const rows=[item('old','needs_review','2026-10-20'),item('unknown','open_confirmed',null),item('later','open_confirmed','2026-10-30'),item('soon','needs_review','2026-10-28'),item('history','historical','2026-10-29')];
  const result=u.sortItems(rows,'deadline',now);
  assert.deepEqual(result.slice(0,2).map(x=>x.id),['soon','later']);
  assert.equal(rows[0].id,'old');
});
test('Work filter keeps hold separate from active work and treats absent values as new',()=>{
  const work={a:'review',b:'draft',c:'hold'};
  assert.equal(u.matchesWork({id:'a'},work,'active'),true);
  assert.equal(u.matchesWork({id:'b'},work,'active'),true);
  assert.equal(u.matchesWork({id:'c'},work,'active'),false);
  assert.equal(u.matchesWork({id:'d'},work,'new'),true);
  assert.equal(u.matchesWork({id:'c'},work,'hold'),true);
});
test('Newest and verification ordering use the intended dates',()=>{
  const rows=[{id:'a',publishedAt:'2026-10-26',checkedAt:'2026-10-28'},{id:'b',publishedAt:'2026-10-27',checkedAt:'2026-10-26'}];
  assert.equal(u.sortItems(rows,'newest',now)[0].id,'b');
  assert.equal(u.sortItems(rows,'checked',now)[0].id,'a');
});
