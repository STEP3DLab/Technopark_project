const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../atlas-ui.js');
const now=Date.parse('2026-11-02T12:00:00+03:00');
const rows=[
 {id:'ural',objectSubject:'Свердловская область',status:'needs_review',deadline:'2026-11-12T10:00:00+03:00'},
 {id:'past',objectSubject:'Москва',status:'needs_review',deadline:'2026-11-01T10:00:00+03:00'},
 {id:'archive',objectSubject:'Республика Карелия',status:'historical'},
 {id:'unknown',region:'Регион не указан',status:'needs_review'},
 {id:'future',objectSubject:'Хабаровский край',status:'open_confirmed',deadline:'2026-11-10T10:00:00+03:00'}
];
test('map active totals exclude expired and historical records, retain unknown locations',()=>{
 const s=A.snapshot(rows,'active','all',now);
 assert.equal(s.total,3);assert.equal(s.unknown,1);assert.equal(s.groups.reduce((n,g)=>n+g.count,0)+s.unknown,s.total);
 assert.deepEqual(s.selected.map(x=>x.id),['future','ural','unknown']);
});
test('map selected directions cannot accidentally include customer locations or another region',()=>{
 assert.deepEqual(A.snapshot(rows,'active','ural',now).selected.map(x=>x.id),['ural']);
 assert.equal(A.snapshot(rows,'active','south',now).selected.length,0);
 assert.deepEqual(A.snapshot(rows,'active','unknown',now).selected.map(x=>x.id),['unknown']);
});
test('all-record scope includes historical and expired records without inflating active totals',()=>{
 const all=A.snapshot(rows,'all','central',now);assert.equal(all.total,5);assert.deepEqual(all.selected.map(x=>x.id),['past']);
 assert.equal(A.snapshot(rows,'active','central',now).selected.length,0);
});
