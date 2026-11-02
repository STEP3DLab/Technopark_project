'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const U=require('../monitor-utils.js'),W=require('../workspace-utils.js');
test('object subject never uses the customer address',()=>{
 assert.equal(U.objectSubject({region:'Москва — заказчик; Карелия — объект',objectSubject:'Республика Карелия'}),'Республика Карелия');
 assert.equal(U.districtOf({objectSubject:'Республика Карелия',region:'Москва'}),'northwest');
 assert.equal(U.objectSubject({region:'Москва — заказчик; фактический объект указан в ТЗ, местоположение не подтверждено'}),'Не уточнён');
 assert.equal(U.objectSubject({region:'Москва — заказчик; Хабаровский край — объект'}),'Хабаровский край');
});
test('national filters compose and unknown remains explicit',()=>{
 const r={objectSubject:'Республика Татарстан'};
 assert(U.matchesNational(r,{district:'volga',subject:'Республика Татарстан'}));
 assert(!U.matchesNational(r,{district:'ural'}));
 assert(!U.matchesNational(r,{subject:'Москва'}));
 assert(U.matchesNational({objectSubject:'Иной регион'},{district:'unknown'}));
 assert(U.matchesNational(r,{}));
});
test('saved views and backups retain national choices',()=>{
 const w=W.emptyWorkspace();w.savedFilters=[{id:'russia',name:'Поволжье',filters:{district:'volga',subject:'Республика Татарстан'}}];
 const n=W.normalizeWorkspace(w);assert.equal(n.savedFilters[0].filters.district,'volga');assert.equal(n.savedFilters[0].filters.subject,'Республика Татарстан');
});
test('every configured region belongs to exactly one search group',()=>{
 const names=U.DISTRICTS.flatMap(g=>g.regions);assert.equal(new Set(names).size,names.length);
 assert.equal(U.DISTRICTS.length,8);
 for(const g of U.DISTRICTS)for(const subject of g.regions)assert.equal(U.districtOf({objectSubject:subject}),g.id);
});
