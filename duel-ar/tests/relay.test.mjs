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


test('a shot arriving during play survives slow storage and client clock drift',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1780000000000});
  const bucket=memoryBucket(),ctx={waitUntil(){}};
  const host='a'.repeat(32),guest='c'.repeat(32),code='750321';
  async function send(action,token,extra={}){
    const request=new Request('https://example.test/v1',{method:'POST',
      headers:{origin:'https://step3dlab.github.io'},body:JSON.stringify({action,token,code,...extra})});
    const response=await worker.fetch(request,{BUCKET:bucket},ctx);
    assert.equal(response.status,200);
    return response.json();
  }
  await send('create',host,{mode:'quickdraw'});await send('join',guest);
  for(const role of [host,guest])await send('available',role,{value:true});
  await send('ready',host,{value:true});const {state}=await send('ready',guest,{value:true});
  t.mock.timers.tick(state.startAt-Date.now()+300);
  const at=Date.now(),get=bucket.get.bind(bucket);
  bucket.get=async key=>{t.mock.timers.tick(2200);return get(key);};
  const response=await send('shot',guest,{rtt:95,shot:{round:state.round,at:at+400,seq:1,hit:true,confidence:1,targetAgeMs:0}});
  assert.equal(response.accepted.accepted,true);
  assert.equal(response.state.winner,'guest');
});
