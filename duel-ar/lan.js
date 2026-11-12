import {DuelNetwork} from './network.js?v=2';
import {DuelEngine, cleanName} from './duel-engine.js';

async function pack(description, id) {
  const bytes=new TextEncoder().encode(JSON.stringify({id,sdp:description.sdp,type:description.type}));
  let result=bytes, prefix='u';
  if(typeof CompressionStream==='function'){
    const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    result=new Uint8Array(await new Response(stream).arrayBuffer());prefix='z';
  }
  return prefix+btoa(String.fromCharCode(...result)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
async function unpack(value,type){
  if(!/^[zu][A-Za-z0-9_-]{20,16000}$/.test(value))throw new Error('Скопируйте ответ или приглашение целиком.');
  const bytes=Uint8Array.from(atob(value.slice(1).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  let stream=new Blob([bytes]).stream();
  if(value[0]==='z'){
    if(typeof DecompressionStream!=='function')throw new Error('Для этого приглашения нужен обновлённый браузер.');
    stream=stream.pipeThrough(new DecompressionStream('deflate'));
  }
  const data=await new Response(stream).text();
  if(data.length>35000)throw new Error('Неверное приглашение.');
  const obj=JSON.parse(data);
  if(obj.type!==type||typeof obj.sdp!=='string'||!obj.sdp.includes('m=application')||!/^\w{16}$/.test(obj.id))throw new Error('Не удалось прочитать данные соединения.');
  return obj;
}
async function gather(pc){
  if(pc.iceGatheringState!=='complete')await new Promise(resolve=>{
    const finish=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();};
    const check=()=>{if(pc.iceGatheringState==='complete'||pc.signalingState==='closed')finish();};
    const timer=setTimeout(finish,4200);pc.addEventListener('icegatheringstatechange',check);
  });
  if(!pc.localDescription?.sdp.includes('a=candidate:'))throw new Error('Браузер не дал локальный адрес. Разрешите доступ к локальной сети или откройте игру в Safari / Chrome.');
}
function adaptChannel(channel){
  return {
    get open(){return channel.readyState==='open';},
    on(type,handler){
      if(type==='data')channel.addEventListener('message',e=>{try{if(typeof e.data==='string'&&e.data.length<=20000)handler(JSON.parse(e.data));}catch{}});
      else channel.addEventListener(type,handler);
    },
    send(data){channel.send(JSON.stringify(data));},
    close(){channel.close();}
  };
}

export class LocalRoom extends DuelNetwork{
  constructor(callbacks){
    super(callbacks);
    if(!window.RTCPeerConnection)throw new Error('Встроенный браузер не поддерживает Wi-Fi-дуэль. Откройте игру в Safari или Chrome.');
    this.pc=new RTCPeerConnection({iceServers:[]});
    this.roomCode='Wi-Fi';this.local=true;
  }
  attach(channel){
    // The other phone may still be copying the answer. Start the protocol timeout only after RTC opens.
    const conn=adaptChannel(channel),gen=this._generation;
    let attached=false;
    const begin=()=>{
      if(attached)return;attached=true;
      if(gen!==this._generation){channel.close();return;}
      this._attachConnection(conn,gen);
      this._lastSeen=Date.now();
      if(this.role==='guest')this._send({kind:'hello',name:this._name,available:true});
      this._startLoop();
    };
    if(channel.readyState==='open')begin();else channel.addEventListener('open',begin,{once:true});
  }
  async offer(name){
    this.role='host';this._name=cleanName(name);this._clockSynced=true;
    this._session=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>x.toString(16).padStart(2,'0')).join('');
    this.pairId=this._session;
    this.engine=new DuelEngine({name:this._name});
    this.attach(this.pc.createDataChannel('pulse-duel',{ordered:true}));
    await this.pc.setLocalDescription(await this.pc.createOffer());await gather(this.pc);
    return pack(this.pc.localDescription,this.pairId);
  }
  async answer(value,name){
    const offer=await unpack(value,'offer');this.role='guest';this._name=cleanName(name);this.pairId=offer.id;
    this.pc.addEventListener('datachannel',e=>this.attach(e.channel));
    await this.pc.setRemoteDescription({type:'offer',sdp:offer.sdp});
    await this.pc.setLocalDescription(await this.pc.createAnswer());await gather(this.pc);
    return pack(this.pc.localDescription,this.pairId);
  }
  async complete(value){
    const answer=await unpack(value.trim(),'answer');
    if(answer.id!==this.pairId)throw new Error('Это ответ на другое приглашение. Другу нужно открыть новый QR-код.');
    if(this.pc.remoteDescription)return;
    await this.pc.setRemoteDescription({type:'answer',sdp:answer.sdp});
  }
  leave(){super.leave({silent:true});this.pc?.close();}
}
