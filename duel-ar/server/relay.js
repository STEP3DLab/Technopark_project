import {DuelEngine} from '../duel-engine.js';
const allowed = new Set(['https://step3dlab.github.io','http://127.0.0.1:4173','http://localhost:4173']);
const hour = 3600000;
const ttl = hour;
const lobbyLease = 5*60*1000;
const roundLease = 20000;
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const keyFor = (slot, code) => 'pulse/'+slot+'/'+code+'.json';
const put = (bucket,k,data,etag) => bucket.put(k,JSON.stringify(data),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});

function reply(room,role,at,slot) {
  return {role, slot, serverTime:at, state:room.engine.state, sequence:room.engine.lastSeq[role], events:room.events};
}
async function purge(bucket, slot) {
  const {objects}=await bucket.list({prefix:'pulse/',limit:24});
  const expired=objects.filter(o=>Number(o.key.split('/')[1])<slot-1);
  if(expired.length)await bucket.delete(expired.map(o=>o.key));
}
function saveEngine(engine) {
  const {state,pending,lastSeq,lastReloadEnd,eventSeq,lagAllowanceMs}=engine;
  return {state,pending,lastSeq,lastReloadEnd,eventSeq,lagAllowanceMs};
}
async function handle(bucket, input, ctx) {
  const {action,token,code} = input;
  if(!/^[a-f0-9]{32}$/.test(token)||! /^(R[A-Z2-9]{5}|[2-8][0-9]{5})$/.test(code))fail(400,'Некорректная комната.');
  const secret = await hash(token), slot=Math.floor(Date.now()/hour);
  let roomSlot=Number.isInteger(input.slot)?input.slot:slot;
  if(roomSlot<slot-1||roomSlot>slot)fail(404,'Срок действия комнаты истёк.');
  if(action==='create') {
    const now=Date.now(), e=new DuelEngine({name:input.name,mode:input.mode});
    e.setAvailable('host',false);
    const r={host:secret,guest:null,expires:now+ttl,seen:{host:now,guest:0},engine:saveEngine(e),events:[]};
    if(await bucket.head(keyFor(slot-1,code)))fail(409,'Код уже занят.');
    if(!await put(bucket,keyFor(slot,code),r)){
      const existing=await bucket.get(keyFor(slot,code));
      const room=existing&&await existing.json();
      if(room?.host===secret&&!room.hostLeft)return reply(room,'host',now,slot);
      fail(409,'Код уже занят.');
    }
    ctx.waitUntil(purge(bucket,slot).catch(()=>{}));
    return reply(r,'host',now,slot);
  }
  const actions=['join','poll','ready','available','mode','shot','dodge','rematch','leave'];
  if(!actions.includes(action))fail(400,'Неизвестное действие.');
  for(let attempt=0;attempt<10;attempt++) {
    let key=keyFor(roomSlot,code), object=await bucket.get(key);
    if(!object&&action==='join'&&!Number.isInteger(input.slot)&&roomSlot===slot){
      roomSlot=slot-1;key=keyFor(roomSlot,code);object=await bucket.get(key);
    }
    if(!object)fail(404,'Комната не найдена. Проверьте код.');
    const r=await object.json(), now=Date.now();
    if(now>=r.expires)fail(404,'Время комнаты истекло. Создайте новую.');
    const e=Object.assign(new DuelEngine(),r.engine);
    let dirty=false;
    const playing=['countdown','active','settling'].includes(e.state.phase);
    const lease=playing?roundLease:lobbyLease;
    if(now-r.seen.host>lease&&e.state.players.host.connected){e.setPlayer('host',{connected:false});dirty=true;}
    if(r.guest&&e.state.players.guest.connected&&now-r.seen.guest>lease){e.setPlayer('guest',{connected:false});dirty=true;}
    let role=secret===r.host?'host':secret===r.guest?'guest':null;
    if(r.hostLeft&&action!=='leave'&&(!role||role==='host'))fail(410,'Создатель закрыл комнату. Создайте новую.');
    if(action==='join'&&!role) {
      if(!e.state.players.host.connected)fail(404,'Создатель вышел. Создайте новую комнату.');
      if(r.guest&&now-r.seen.guest<=lobbyLease)fail(409,'В комнате уже два игрока.');
      r.guest=secret;role='guest';e.setPlayer('guest',{name:input.name,connected:true});e.setAvailable('guest',false);dirty=true;
    }
    if(!role)fail(403,'Вы вышли из комнаты. Войдите снова.');
    const before=e.state.revision;
    if(!e.state.players[role].connected&&action!=='leave'){e.setPlayer(role,{connected:true});e.setAvailable(role,false);dirty=true;}
    if(now-r.seen[role]>2500||action!=='poll'){r.seen[role]=now;dirty=true;}
    // Late shots enter the queue before simultaneous hits are resolved.
    let accepted;
    if(action==='shot'){
      const latency=Number.isFinite(input.rtt)?Math.min(2400,Math.max(0,input.rtt)):600;
      e.lagAllowanceMs=Math.max(e.lagAllowanceMs,Math.min(1500,latency*.5+230));
      accepted=e.shoot(role,input.shot,now);
    }
    e.tick(now);
    switch(action){
      case 'ready': e.setReady(role,input.value===true,now);break;
      case 'available': e.setAvailable(role,input.value===true);break;
      case 'mode': if(role==='host')e.changeMode(input.value);break;
      case 'rematch':e.requestRematch(role);break;
      case 'dodge':e.dodge(role,input.round,now);break;
      case 'leave':
        e.setPlayer(role,{connected:false});if(role==='guest')r.guest=null;
        if(role==='host'){r.hostLeft=true;r.expires=Math.min(r.expires,now+20000);}
        break;
    }
    if(dirty||e.state.revision!==before){
      r.events=[...r.events,...e.drainEvents()].slice(-48);r.engine=saveEngine(e);
      if(!await put(bucket,key,r,object.etag))continue;
    }
    const out=reply(r,role,now,roomSlot);
    out.events=r.events.filter(ev=>ev.id>(Number(input.after)||0));out.accepted=accepted;
    return out;
  }
  fail(503,'Сеть занята. Повторите действие.');
}
export default {async fetch(request,env,ctx) {
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const res=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(request.method==='GET')return res({service:'PULSE DUEL',version:1,ready:Boolean(env.BUCKET)});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
  if(request.method!=='POST'||!allowed.has(origin)||new URL(request.url).pathname!=='/v1')return res({error:'Недоступно.'},403);
  try {
    const body=await request.text();if(body.length>2500)return res({error:'Слишком большой запрос.'},400);
    let input;try{input=JSON.parse(body);}catch{return res({error:'Неверный запрос.'},400);}
    if(!input||typeof input!=='object')return res({error:'Неверный запрос.'},400);
    return res(await handle(env.BUCKET,input,ctx));
  } catch(e){return res({error:e.status?e.message:'Сервис временно недоступен.'},e.status||503);}
}};
