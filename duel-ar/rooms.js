import {DuelNetwork} from './network.js';
import {RULES} from './duel-engine.js';

const endpoint='https://pulse-duel-room-step3d.step3d.chatgpt.site/v1';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const random=length=>crypto.getRandomValues(new Uint8Array(length));
const roomCode=()=> 'R'+[...random(5)].map(n=>alphabet[n%alphabet.length]).join('');
const idle=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cancelled=()=>Object.assign(new Error('Соединение закрыто.'),{type:'cancelled'});

class CloudRoom {
  constructor(callbacks) {
    this.callbacks=callbacks;
    this.token=[...random(16)].map(n=>n.toString(16).padStart(2,'0')).join('');
    this.offset=0;this.pingMs=null;this.state=null;this.role=null;this.roomCode='';
    this.seenEvent=0;this.sequence=0;this.currentRound=0;this.queue=Promise.resolve();
    this.closed=false;this.connected=false;this.active=false;this.samples=[];
  }
  now(){return Date.now()+this.offset;}
  status(kind,message){this.callbacks.onStatus({kind,message,pingMs:this.pingMs,connected:this.connected,roomCode:this.roomCode});}
  async request(action,extra={},timeout=5500){
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeout);
    const sent=Date.now();
    try{
      const response=await fetch(endpoint,{method:'POST',body:JSON.stringify({action,token:this.token,code:this.roomCode,slot:this.slot,after:this.seenEvent,...extra}),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
      if(this.closed)throw cancelled();
      const data=await response.json();
      if(!response.ok)throw Object.assign(new Error(data.error||'Сервис комнаты недоступен.'),{status:response.status});
      if(this.closed)throw cancelled();
      const received=Date.now(),rtt=received-sent;
      this.lastResponse=received;
      this.pingMs=rtt;
      this.samples.push({rtt,offset:data.serverTime-(sent+received)/2});
      if(this.samples.length>10)this.samples.shift();
      this.offset=this.samples.reduce((a,b)=>a.rtt<b.rtt?a:b).offset;
      this.slot=data.slot;
      this.accept(data);
      return data;
    }catch(error){
      if(error.name==='AbortError')throw new Error('Сервис комнаты долго не отвечает. Проверьте подключение.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  accept(data){
    if(!data.state)return;
    // Polls and button actions can finish out of order. Ignore stale snapshots.
    const s=data.state;
    if(!this.state||s.revision>this.state.revision){
      const prev=this.connected;
      this.connected=s.players.host.connected&&s.players.guest.connected;
      this.state=s;
      if(this.currentRound!==s.round){this.currentRound=s.round;this.sequence=0;}
      this.callbacks.onState(s);
      if(!this.connected&&prev)this.status('disconnected','Соперник вышел из комнаты.');
    }
    for(const event of data.events||[]){
      if(event.id<=this.seenEvent)continue;
      this.seenEvent=event.id;this.callbacks.onEvent(event);
    }
    this.status(this.connected?'connected':'waiting',this.connected?'Игроки на связи.':'Ждём второго игрока.');
    if(data.accepted&&!data.accepted.accepted)this.callbacks.onEvent({type:'shot-rejected',reason:data.accepted.reason});
  }
  async open(role,name,mode,code){
    this.role=role;this.roomCode=code||roomCode();this.status('loading','Соединяемся…');
    for(let attempt=0; ;attempt++){
      try{await this.request(role==='host'?'create':'join',{name,mode},role==='host'?5200:8000);break;}
      catch(e){if(role!=='host'||e.status!==409||attempt===2)throw e;this.roomCode=roomCode();}
    }
    this.active=true;this.poll();return this.roomCode;
  }
  async poll(){
    while(!this.closed){
      const playing=['active','countdown','settling'].includes(this.state?.phase);
      await idle(playing?120:this.connected?420:650);
      if(this.closed)return;
      try{await this.request('poll');}
      catch(e){
        if(this.closed)return;
        if([403,404].includes(e.status)||Date.now()-this.lastResponse>13000){
          this.closed=true;this.connected=false;
          if(this.state&&this.state.phase!=='finished'){
            this.state={...this.state,phase:'interrupted',winner:null,reason:'connection'};
            this.callbacks.onState(this.state);
          }
          this.status('disconnected',e.message);this.callbacks.onError(e);return;
        }
      }
    }
  }
  command(action,extra){
    if(this.closed||!this.active)return false;
    this.queue=this.queue.then(()=>{if(!this.closed)return this.request(action,extra);}).catch(e=>{if(!this.closed)this.callbacks.onError(e);});
    return true;
  }
  changeMode(value){return this.command('mode',{value});}
  setAvailable(value){this.available=value;return this.command('available',{value});}
  setReady(value){return this.command('ready',{value});}
  requestRematch(){return this.command('rematch');}
  dodge(){return this.command('dodge',{round:this.state?.round});}
  fire({hit,confidence,targetAgeMs}){
    const at=this.now(),s=this.state,p=s?.players[this.role];
    if(!this.connected||!this.available||!p||s.phase!=='active'||p.hp<=0||at<s.startAt||at>=s.endAt)return {accepted:false,reason:'not-active'};
    if(at-(this.lastShot??-Infinity)<RULES.cooldownMs-5||p.reloadUntil>at)return {accepted:false,reason:'cooldown'};
    const shot={hit,confidence,targetAgeMs:Number.isFinite(targetAgeMs)?targetAgeMs:99999,at,seq:++this.sequence,round:s.round};
    this.lastShot=at;
    return {accepted:this.command('shot',{shot,rtt:this.pingMs}),pending:true};
  }
  leave(){
    if(this.closed)return;
    this.closed=true;
    if(this.role&&this.active){
      fetch(endpoint,{method:'POST',body:JSON.stringify({action:'leave',token:this.token,code:this.roomCode,slot:this.slot}),credentials:'omit',referrerPolicy:'no-referrer',keepalive:true}).catch(()=>{});
    }
    this.active=false;this.connected=false;this.role=null;this.state=null;
  }
}

export class GameRooms {
  constructor(callbacks){this.callbacks=callbacks;this.link=null;}
  get role(){return this.link?.role;}
  get roomCode(){return this.link?.roomCode||'';}
  get state(){return this.link?.state;}
  get connected(){return !!this.link?.connected;}
  get pingMs(){return this.link?.pingMs??null;}
  now(){return this.link?.now()??Date.now();}
  leave(){this.link?.leave({silent:true});this.link=null;}
  async create({name,mode}){
    this.leave();
    const cloud=new CloudRoom(this.callbacks);this.link=cloud;
    try{return await cloud.open('host',name,mode);}
    catch(e){
      if(this.link!==cloud)throw cancelled();
      cloud.leave();
      this.link=new DuelNetwork(this.callbacks);
      return this.link.create({name,mode});
    }
  }
  async join(code,{name}){
    this.leave();
    if(code.startsWith('R')){
      const cloud=new CloudRoom(this.callbacks);this.link=cloud;
      try{return await cloud.open('guest',name,null,code);}
      catch(e){cloud.leave();throw e;}
    }
    this.link=new DuelNetwork(this.callbacks);return this.link.join(code,{name});
  }
  setAvailable(value){return this.link?.setAvailable(value);}
  setReady(value){return this.link?.setReady(value);}
  changeMode(value){return this.link?.changeMode(value);}
  dodge(){return this.link?.dodge();}
  requestRematch(){return this.link?.requestRematch();}
  fire(shot){return this.link?.fire(shot)||{accepted:false,reason:'connection'};}
}
