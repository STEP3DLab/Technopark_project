import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {appendFrame,canonicalTemperature,decodeFrame,readTemperature,romValid,thermalSession,thermalSummary,LineReader,SAMPLE_LIMIT} from '../protocol.mjs';
import {receive} from '../stream.mjs';
import {analysePower} from '../analysis.mjs';
import {observedOverlap} from '../overlap.mjs';
const file=await readFile(new URL('../data/temperature-example.jsonl',import.meta.url),'utf8');
const fixtures=readTemperature(file).rows;
test('Термометр — кадры, пропуски и покрытие каждого датчика',()=>{
  const s=readTemperature(file),m=thermalSummary(s);assert.equal(s.synthetic,true);
  assert.deepEqual([m.nRows,m.missed,m.elapsedS],[6,1,6]);
  assert.deepEqual([m.channels.a.n,m.channels.b.n,m.channels.a.coveredS,m.channels.b.coveredS],[6,4,4,2]);
  assert.equal(m.channels.b.faults.no_sensor,2);
  assert.deepEqual(readTemperature(canonicalTemperature(s)),s);
});
test('Проверка CRC, недостоверного показания и кванта',()=>{
  const f=fixtures[0];assert.ok(romValid(f.t1.id));assert.equal(romValid('2800000000000000'),false);
  for(const patch of [{c:20.04},{c:85},{c:null},{c:130},{id:null},{s:'no_sensor'},{s:[]}])assert.throws(()=>decodeFrame({...f,t1:{...f.t1,...patch}}));
  assert.equal(decodeFrame({...f,t1:{id:f.t1.id,s:'parasite_power',c:null}}).t1.c,null);
});
test('Смена запуска, предел записи и регресс счётчика',()=>{
  const f=fixtures[0],s=thermalSession();
  assert.equal(appendFrame(s,f),'ok');assert.equal(appendFrame(s,f),'order');
  assert.equal(appendFrame(s,{...fixtures[1],boot:'1111111111111111'}),'reboot');
  s.rows=Array(SAMPLE_LIMIT).fill(f);assert.equal(appendFrame(s,fixtures[1]),'limit');
  assert.throws(()=>readTemperature(JSON.stringify(f)+'\n'+JSON.stringify({...fixtures[1],board:'0000000000000000'})),/несколько плат/);
});
test('Строки USB, произвольные границы фрагментов и восстановление',async()=>{
  const resetFrame={...fixtures.at(-1),boot:'8000000000000000'};
  const data='previous frame tail\n'+'x'.repeat(2050)+'\n'+fixtures.map(JSON.stringify).join('\r\n')+'\n'+JSON.stringify(fixtures.at(-1))+'\n'+JSON.stringify(resetFrame)+'\n';
  const bytes=new TextEncoder().encode(data);let n=0;const reader={async read(){if(n===bytes.length)return {done:true};const e=Math.min(n+1+n%37,bytes.length),v=bytes.slice(n,e);n=e;return {done:false,value:v}}};
  const s=thermalSession();let received=0;assert.equal(await receive(reader,s,()=>received++,()=>false),'reboot');assert.equal(s.rows.length,6);assert.equal(received,6);assert.equal(s.rejected,3);assert.equal(s.missed,1);
});
test('Обрыв последней строки не создаёт ложного кадра',()=>{
  let lines=0,bad=0;const r=new LineReader(()=>lines++,()=>bad++);r.feed('ok\r\npartial');assert.equal(lines,1);assert.equal(bad,0);
});
test('Смена ROM прерывает покрытие даже при корректных числах',()=>{
  const f=fixtures[0],g={...fixtures[1],t1:{...fixtures[1].t1,id:f.t2.id}};
  const s=readTemperature([f,g].map(JSON.stringify).join('\n'));assert.equal(thermalSummary(s).channels.a.coveredS,0);
});
test('Порог различимости и пропуски обеих мощностей считаются раздельно',()=>{
  const rows=[[.6,1,1],[.7,2,1],[.8,2,1],[.9,2,0],[1,2,1],[2,2,1],[2.1,null,1],[2.2,2,1],[2.3,2,1]].map(([t,a,b])=>({t,a,b}));
  const steps=new Uint8Array(rows.length);analysePower(rows,.1,(i,ok)=>steps[i]=ok);
  const r=observedOverlap(rows,steps,1,0);assert.equal(r.intervals,2);assert.equal(r.windows,2);assert.ok(Math.abs(r.coveredS-.2)<1e-14);assert.ok(Math.abs(r.longestS-.1)<1e-14);assert.throws(()=>observedOverlap(rows,steps,-1,0));
});
