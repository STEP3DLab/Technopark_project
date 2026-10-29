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
test('Deadline timestamps without a zone use Moscow; impossible dates and loose strings are rejected',()=>{
  assert.equal(u.deadlineTime({deadline:'2026-10-29T09:30'}),Date.parse('2026-10-29T06:30:00Z'));
  assert.equal(u.deadlineTime({deadline:'2026-10-29T09:30:00+05:00'}),Date.parse('2026-10-29T04:30:00Z'));
  assert.equal(u.deadlineTime({deadline:'2028-02-29'}),Date.parse('2028-02-29T20:59:59Z'));
  for(const deadline of ['2026-02-29','2026-02-30','2026-13-01','2026-10-29T24:00','29.10.2026',1720000000000,{}])assert.equal(u.deadlineTime({deadline}),null);
});
test('Object geography is separate from the customer address',()=>{
  const samples=[
    ['Москва','moscow'],
    ['Московская область — Егорьевск','oblast'],
    ['Москва — заказчик; Карелия — объект','other'],
    ['Москва — заказчик; Можайск, Московская область — объект','oblast'],
    ['Московская область — заказчик (Красногорск); Москва — объект','moscow'],
    ['Москва — заказчик; фактический объект указан в ТЗ, местоположение не подтверждено','unknown'],
    ['Московская область — объект, адрес в документации не подтверждён','oblast'],
    ['Москва — регистрация заказчика; Республика Карелия — объект (Петрозаводск)','other'],
    ['Московская область — Богородский городской округ; объект в районе Ногинска, точное место по приложению к ТЗ требует проверки','oblast'],
    ['Москва — заказчик и объект, производственная площадка','moscow'],
    ['', 'unknown'],
  ];
  for(const [region,expected] of samples)assert.equal(u.normalizeRegion({region}),expected,region);
  assert.equal(u.normalizeRegion({region:'Москва',objectRegion:'Московская область'}),'oblast');
  assert.equal(u.normalizeRegion({region:'Москва — заказчик',objectRegion:'Республика Карелия — Петрозаводск (вне Москвы и Московской области)'}),'other');
  assert.equal(u.geographyLabel('oblast'),'Московская область');
});
test('Budget filters exclude claim values and unknown sums from monetary ranges',()=>{
  const contract={amountRub:275000,amountType:'contract'};
  const fee={amountRub:100000,amountType:'expert_fee'};
  const claim={amountRub:9000000,amountType:'claim'};
  assert.equal(u.publishedBudget(contract),275000);
  assert.equal(u.publishedBudget(fee),100000);
  assert.equal(u.publishedBudget(claim),null);
  for(const record of [claim,{amountRub:NaN,amountType:'contract'},{amountRub:0,amountType:'contract'},{}]){
    assert.equal(u.matchesAmount(record),true);
    assert.equal(u.matchesAmount(record,{onlyKnown:true}),false);
    assert.equal(u.matchesAmount(record,{min:0}),false);
  }
  assert.equal(u.matchesAmount(contract,{min:200000,max:300000}),true);
  assert.equal(u.matchesAmount(contract,{max:200000}),false);
  assert.equal(u.matchesAmount(contract,{min:'oops'}),false);
});
test('Monetary sort puts unknown and claim amounts last and never mutates input',()=>{
  const rows=[{id:'claim',amountType:'claim',amountRub:9000000},{id:'small',amountType:'expert_fee',amountRub:100000},{id:'large',amountType:'contract',amountRub:200000},{id:'unknown'}];
  assert.deepEqual(u.sortItems(rows,'amount-desc',now).slice(0,2).map(x=>x.id),['large','small']);
  assert.deepEqual(u.sortItems(rows,'amount-asc',now).slice(0,2).map(x=>x.id),['small','large']);
  assert.equal(rows[0].id,'claim');
});
test('Ready and sent items stay in active work while completed outcomes do not',()=>{
  for(const status of ['review','draft','ready','sent'])assert.equal(u.matchesWork({id:'a'},{a:status},'active'),true);
  for(const status of ['new','hold','won','lost'])assert.equal(u.matchesWork({id:'a'},{a:status},'active'),false);
});
