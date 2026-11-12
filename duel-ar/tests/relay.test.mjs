import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/relay.js';

function memoryBucket(){
  const objects=new Map();let serial=0;
  return {async head(k){return this.get(k);},async list(){return {objects:[]};},async delete(){},
    async get(k){const item=objects.get(k);return item&&{etag:item.etag,json:async()=>JSON.parse(item.value)};},
    async put(k,value,{onlyIf}){const prev=objects.get(k);if(onlyIf.etagMatches&&prev?.etag!==onlyIf.etagMatches||onlyIf.etagDoesNotMatch==='*'&&prev)return null;
      const item={etag:String(++serial),value};objects.set(k,item);return item;}};
}

test('sharing an invite for 80 seconds, repeated create, a third player, resuming roles and closing the room',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1780000000000});
  const env={BUCKET:memoryBucket()},ctx={waitUntil(){}};
  const host='b'.repeat(32),guest='d'.repeat(32),third='e'.repeat(32),code='234107';
  async function send(action,token,extra={}){
    const r=await worker.fetch(new Request('https://example.test/v1',{method:'POST',headers:{origin:'https://step3dlab.github.io'},body:JSON.stringify({action,token,code,...extra})}),env,ctx);
    return {status:r.status,...await r.json()};
  }
  assert.equal((await send('create',host)).status,200);
  assert.equal((await send('create',host)).status,200);
  t.mock.timers.tick(80000);
  assert.equal((await send('join',guest)).role,'guest');
  assert.equal((await send('join',third)).status,409);
  assert.equal((await send('poll',host)).role,'host');
  await send('available',host,{value:true});await send('available',guest,{value:true});
  await send('ready',host,{value:true});
  assert.equal((await send('ready',guest,{value:true})).state.phase,'countdown');
  t.mock.timers.tick(25000);
  const restored=await send('poll',guest);
  assert.equal(restored.role,'guest');
  assert.notEqual(restored.state.phase,'active');
  await send('poll',host);
  await send('available',host,{value:true});await send('available',guest,{value:true});
  assert.equal((await send('poll',guest)).state.phase,'lobby');
  await send('leave',guest);
  assert.equal((await send('join',third)).role,'guest');
  await send('leave',host);
  assert.equal((await send('join',guest)).status,410);
});
