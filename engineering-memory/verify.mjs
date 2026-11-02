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
