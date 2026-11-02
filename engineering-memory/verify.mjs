import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const D=JSON.parse(fs.readFileSync(new URL('./data.json',import.meta.url),'utf8'));
const code=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('./data.js',import.meta.url),'utf8'),ctx);assert.equal(JSON.stringify(D),JSON.stringify(ctx.window.MEMORY_DATA));
const ids=new Set(D.nodes.map(n=>n.id)), ss=new Set(D.sources.map(s=>s.id));
assert.equal(ids.size,D.nodes.length);
for(const n of D.nodes){assert.ok(n.summary);assert.ok(n.locator);assert.ok(n.sources.length||n.status==='project');for(const s of n.sources)assert.ok(ss.has(s));}
for(const e of D.edges){assert.ok(ids.has(e.a)&&ids.has(e.b));assert.ok(e.sources.length||e.status==='project');for(const s of e.sources)assert.ok(ss.has(s));}
for(const c of D.conflicts){assert.ok(ss.has(c.sa)&&ss.has(c.sb)&&ids.has(c.node));}
for(const s of D.sources)assert.equal(new URL(s.url).protocol,'https:');
const byId=id=>D.nodes.find(n=>n.id===id),incident=id=>D.edges.filter(e=>e.a===id||e.b===id);
const func=code.slice(code.indexOf('function shortestPath('),code.indexOf('function pathDialog('));
const testctx={D,byId,incident};vm.createContext(testctx);vm.runInContext(func,testctx);
assert.equal(testctx.shortestPath('batanov','rtc').edges.length,4);
assert.equal(testctx.shortestPath('heritage','batanov'),null);
assert.equal(testctx.shortestPath('heritage','batanov',true).edges.length,1);
assert.equal(testctx.shortestPath('batanov','batanov').edges.length,0);
assert.equal(testctx.shortestPath('invalid','batanov'),null);
const searchctx={};vm.createContext(searchctx);vm.runInContext(code.slice(code.indexOf('const norm='),code.indexOf('function toast('))+';this.testMatch=match;',searchctx);
assert.ok(searchctx.testMatch('Александр Фёдорович Батанов','Федорович Батанов'));assert.ok(searchctx.testMatch('Кабельная система','кабель'));assert.ok(!searchctx.testMatch('Кабель','нет данных'));
for(const file of ['index.html','app.js','style.css','data.js','workshop.html','assets/batanov.jpg','assets/mobot.jpg'])assert.ok(fs.statSync(new URL(file,import.meta.url)).size>0);
console.log('PASS: schema, provenance, exports, search, shortest paths, assets');
const corectx={window:{},URL};vm.createContext(corectx);vm.runInContext(fs.readFileSync(new URL('./memory-core.js',import.meta.url),'utf8'),corectx);const C=corectx.window.MemoryCore;
assert.equal(C.safeURL('javascript:alert(1)'),'');assert.equal(C.safeURL('https://user:secret@example.com'),'');assert.equal(C.safeURL('https://example.com'),'https://example.com/');
const mentions=C.detectMentions('Батанова пригласили. Мобот-Ч-ХВ-2. МРК-250 — другой код.',D.nodes);
assert.ok(mentions.some(m=>m.id==='batanov'));assert.ok(mentions.some(m=>m.id==='mobot2'));assert.ok(!mentions.some(m=>m.id==='mobot'));assert.ok(!mentions.some(m=>m.id==='mrk25'));
assert.ok(C.detectMentions('МРК 25',D.nodes).some(m=>m.id==='mrk25'));
const m={id:'local-12345678-abcd',title:'Проверка',text:'Батанов и МРК-25',url:'https://example.com/',year:'1997',links:['batanov','mrk25'],createdAt:'2026-11-02T00:00:00Z'};
const archive={format:'engineering-memory-personal',version:1,materials:[m]};
assert.equal(C.validateArchive(archive,D.nodes).materials.length,1);
assert.equal(C.mergeArchives(archive,archive,D.nodes).added,0);
assert.equal(C.mergeArchives(archive,{...archive,materials:[{...m,id:'local-98765432-abcd'}]},D.nodes).skipped,1);
for(const bad of [{...m,url:'javascript:alert(1)'},{...m,links:['unknown']},{...m,title:''},{...m,id:'"><script>'},{...m,year:'<bad>'},{...m,text:'x'.repeat(40001)}])assert.throws(()=>C.validateArchive({...archive,materials:[bad]},D.nodes));
assert.throws(()=>C.mergeArchives(archive,{...archive,materials:[{...m,text:'Изменённая запись'}]},D.nodes));
assert.throws(()=>C.validateArchive(D,D.nodes));
const local=C.materialNode(m,0);D.nodes.push(local);D.edges.push({id:'test-local',a:m.id,b:'batanov',sources:[],status:'local'});
assert.equal(testctx.shortestPath(m.id,'batanov'),null);assert.equal(testctx.shortestPath(m.id,'batanov',true).edges.length,1);
for(const c of D.decisions){assert.ok(ids.has(c.node));for(const id of c.sources)assert.ok(ss.has(id));}
console.log('PASS: mention boundaries and longest match, archive validation, merge idempotence, URL safety, local edges excluded from documented paths, decision references');
