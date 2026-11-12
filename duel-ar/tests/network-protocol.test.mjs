/** In-memory transport test only; this does not claim a live WebRTC or phone test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {DuelNetwork} from '../network.js';

const peers = new Map();
let peerSeq = 0;
class TestConnection extends EventEmitter {
  constructor(label, metadata) { super(); this.label = label; this.metadata = metadata; this.open = false; }
  send(data) {
    if (!this.open) throw new Error('closed');
    const cloned = structuredClone(data);
    setTimeout(() => { if (this.other.open) this.other.emit('data', cloned); }, 8);
  }
  close() {
    if (!this.open) return;
    this.open = false; this.emit('close');
    if (this.other.open) { this.other.open = false; this.other.emit('close'); }
  }
}
class TestPeer extends EventEmitter {
  constructor(id) {
    super(); this.id = typeof id === 'string' ? id : `anonymous-${++peerSeq}`;
    this.destroyed = false; this.connections = [];
    setTimeout(() => {
      if (this.destroyed) return;
      if (peers.has(this.id)) this.emit('error', {type:'unavailable-id'});
      else { peers.set(this.id,this); this.emit('open',this.id); }
    }, 5);
  }
  connect(id, options) {
    const a = new TestConnection(options.label,options.metadata);
    const b = new TestConnection(options.label,options.metadata);
    a.other=b; b.other=a; this.connections.push(a);
    setTimeout(() => {
      const peer=peers.get(id);
      if (!peer) { this.emit('error',{type:'peer-unavailable'}); return; }
      peer.connections.push(b); peer.emit('connection',b);
      a.open=b.open=true; b.emit('open'); a.emit('open');
    }, 8);
    return a;
  }
  destroy() { this.destroyed=true; if(peers.get(this.id)===this)peers.delete(this.id); for(const c of this.connections)c.close(); }
  reconnect() {}
}
globalThis.Peer=TestPeer;
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn, timeout=8000) {
  const start=Date.now();
  while(!fn()) { if(Date.now()-start>timeout)throw new Error('condition timed out'); await delay(20); }
}

test('two protocol peers synchronize, reject a third, settle a win, rematch and stop on availability loss', async () => {
  const events = {host:[],guest:[]}, errors=[];
  const host = new DuelNetwork({onEvent:e=>events.host.push(e),onError:e=>errors.push(e.type)});
  const guest = new DuelNetwork({onEvent:e=>events.guest.push(e),onError:e=>errors.push(e.type)});
  const third = new DuelNetwork();
  try {
    const code=await host.create({name:'Host',mode:'quickdraw'});
    await guest.join(code,{name:'Guest'});
    await until(()=>guest._clockSynced);
    assert.equal(host.connected,true);
    assert.equal(host.state.players.guest.name,'Guest');
    await assert.rejects(third.join(code,{name:'Intruder'}),e=>e.type==='room-full');
    assert.equal(host.state.players.guest.name,'Guest');
    host.setReady(true); guest.setReady(true);
    await until(()=>host.state.phase==='active'&&guest.state.phase==='active');
    assert.equal(host.state.startAt,guest.state.startAt);
    assert.equal(guest.fire({hit:true,confidence:.95,targetAgeMs:12}).accepted,true);
    await until(()=>host.state.phase==='finished'&&guest.state.phase==='finished');
    assert.equal(host.state.winner,'guest'); assert.equal(guest.state.winner,'guest');
    assert.equal(events.host.filter(e=>e.type==='result').length,1);
    assert.equal(events.guest.filter(e=>e.type==='result').length,1);
    host.requestRematch(); guest.requestRematch();
    await until(()=>host.state.phase==='lobby'&&guest.state.phase==='lobby');
    host.setReady(true); guest.setReady(true);
    await until(()=>host.state.phase==='countdown');
    guest.setAvailable(false);
    await until(()=>host.state.phase==='interrupted'&&guest.state.phase==='interrupted');
    assert.equal(host.state.winner,null); assert.equal(guest.state.winner,null);
    assert.equal(host.fire({hit:true,confidence:.99,targetAgeMs:0}).accepted,false);
    guest.setAvailable(true);
    await until(()=>host.state.phase==='lobby'&&guest.state.phase==='lobby');
    assert.equal(host.state.players.host.ready,false);
    guest.leave(); await until(()=>!host.connected);
    assert.equal(host.state.players.guest.connected,false);
    await guest.join(code,{name:'Returned'});
    await until(()=>host.connected);
    assert.equal(host.state.players.guest.name,'Returned');
    assert.equal(host.state.players.host.ready,false);
    assert.deepEqual(errors,[]);
  } finally { host.leave(); guest.leave(); third.leave(); }
});

test('leaving while signaling opens rejects the pending call rather than hanging', async()=>{
  const network=new DuelNetwork();
  const result=network.create({name:'Cancelled'});
  await delay(1); network.leave();
  await assert.rejects(result,e=>e.type==='cancelled');
});
