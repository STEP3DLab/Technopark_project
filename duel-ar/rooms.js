import {DuelNetwork} from './network.js?v=2';
import {RULES} from './duel-engine.js';

const endpoint='https://pulse-duel-room-step3d.step3d.chatgpt.site/v1';
const cloudCode=code=>/^(?:[2-8][0-9]{5}|R[A-Z2-9]{5})$/.test(code);
const random=length=>crypto.getRandomValues(new Uint8Array(length));
const roomCode=()=>String(2+random(1)[0]%7)+[...random(5)].map(n=>n%10).join('');
const idle=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cancelled=()=>Object.assign(new Error('Соединение закрыто.'),{type:'cancelled'});

class CloudRoom {
  constructor(callbacks) {
    this.callbacks=callbacks;
    this.token=[...random(16)].map(n=>n.toString(16).padStart(2,'0')).join('');
    this.offset=0;this.pingMs=null;this.state=null;this.role=null;this.roomCode='';
    this.seenEvent=0;this.sequence=0;this.currentRound=0;this.queue=Promise.resolve();
    this.closed=false;this.connected=false;this.active=false;this.samples=[];this.available=true;this.failures=0;
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
      this.lastResponse=received;this.failures=0;
      this.pingMs=rtt;
      this.samples.push({rtt,offset:data.serverTime-(sent+received)/2});
      if(this.samples.length>10)this.samples.shift();
      this.offset=this.samples.reduce((a,b)=>a.rtt<b.rtt?a:b).offset;
      this.slot=data.slot;
      if(this.restoring){this.sequence=data.sequence||0;this.currentRound=data.state.round;this.seenEvent=data.events.at(-1)?.id||0;this.restoring=false;}
      this.accept(data);
      return data;
    }catch(error){
      if(error.name==='AbortError')throw new Error('Сервис комнаты долго не отвечает. Проверьте подключение.');
      if(error instanceof TypeError)throw new Error('Сервис комнат недоступен из этой сети. Попробуйте мобильный интернет или локальный Wi-Fi.');
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
  async open(role,name,mode,code,saved){
    this.role=role;this.roomCode=code||roomCode();this.status('loading','Соединяемся…');
    if(saved){this.token=saved.token;this.slot=saved.slot;this.restoring=true;}
    for(let attempt=0; ;attempt++){
      try{await this.request(saved?'poll':role==='host'?'create':'join',{name,mode},8000);break;}
      catch(error){
        if(this.closed||attempt>=2)throw error;
        if(!saved&&role==='host'&&error.status===409){this.roomCode=roomCode();continue;}
        if(error.status&&error.status<500||attempt>0)throw error;
        await idle(450);
        if(this.closed)throw cancelled();
      }
    }
    this.active=true;this.poll();return this.roomCode;
  }
  async poll(){
    while(!this.closed){
      const playing=['active','countdown','settling'].includes(this.state?.phase);
      await idle(this.failures?Math.min(3500,this.failures*650):playing?180:this.connected?450:750);
      if(this.closed)return;
      try{await this.request('poll');}
      catch(e){
        if(this.closed)return;
        this.failures++;
        if([403,404,410].includes(e.status)){
          this.closed=true;this.connected=false;
          if(this.state&&this.state.phase!=='finished'){
            this.state={...this.state,phase:'interrupted',winner:null,reason:'connection'};
            this.callbacks.onState(this.state);
          }
          this.status('closed',e.message);this.callbacks.onError(e);return;
        }
        this.status('recovering','Восстанавливаем связь. Оставьте комнату открытой.');
      }
    }
  }
  command(action,extra){
    if(this.closed||!this.active)return false;
    this.queue=this.queue.then(async()=>{
      if(this.closed)return;
      try { return await this.request(action,extra); }
      catch(error) {
        if(this.closed||error.status&&error.status<500||!['available','ready'].includes(action))throw error;
        await idle(400);
        if(!this.closed)return this.request(action,extra);
      }
    }).catch(e=>{if(!this.closed)this.callbacks.onError(e);});
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
  leave(notify=true){
    if(this.closed)return;
    this.closed=true;
    if(notify&&this.role&&this.active){
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
  leave(){if(this.link instanceof CloudRoom)this.link.leave();else this.link?.leave({silent:true});this.link=null;}
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
  ticket(){
    const l=this.link;
    return l instanceof CloudRoom&&l.active ? {role:l.role,code:l.roomCode,slot:l.slot,token:l.token} : null;
  }
  suspend(){
    if(this.link instanceof CloudRoom)this.link.leave(false);
    else this.link?.leave({silent:true});
    this.link=null;
  }
  async join(code,{name,saved}){
    this.leave();
    if(cloudCode(code)){
      const cloud=new CloudRoom(this.callbacks);this.link=cloud;
      try{return await cloud.open(saved?.role||'guest',name,null,code,saved);}
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
