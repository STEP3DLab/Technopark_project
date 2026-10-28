// Session-only evidence. Demonstration samples are excluded from field metrics.
export const DEMO_SOURCES = new Set(['reference', 'known-video']);
const clean = value => String(value ?? '').trim();
const equivalent = (a,b) => clean(a).normalize('NFKC').toLocaleLowerCase('ru').replace(/[.!]+$/,'') === clean(b).normalize('NFKC').toLocaleLowerCase('ru').replace(/[.!]+$/,'');
export class SessionLedger {
  constructor(){ this.attempts=[]; this.messages=[]; this.nextId=1; this.startedAt=new Date().toISOString(); }
  addAttempt({source,accepted,predicted='',predictedId='',distance=null,elapsedMs=0,frames=0,personalSamples=false,protocol=null}){
    const entry={id:this.nextId++,source,accepted:Boolean(accepted),predicted:clean(predicted),predictedId,protocol:protocol?{...protocol}:null,objectiveMatch:protocol?Boolean(accepted&&predictedId===protocol.expectedId):null,distance:Number.isFinite(distance)?distance:null,elapsedMs:Math.max(0,Number(elapsedMs)||0),frames:Math.max(0,Number(frames)||0),personalSamples:Boolean(personalSamples),review:'unreviewed',confirmedText:'',timestamp:new Date().toISOString()};
    this.attempts.push(entry);return entry;
  }
  confirm(id,text){
    const entry=this.attempts.find(a=>a.id===id);const value=clean(text);
    if(!entry||!value||entry.review!=='unreviewed')return false;
    entry.confirmedText=value;
    entry.review=entry.accepted&&equivalent(entry.predicted,value)?'correct':'corrected';
    return true;
  }
  markIncorrect(id){const e=this.attempts.find(a=>a.id===id);if(!e||e.review!=='unreviewed')return false;e.review='incorrect';return true;}
  addMessage(role,text,kind='manual'){
    const value=clean(text).slice(0,500);if(!value)return null;
    const message={id:this.nextId++,role,text:value,kind,timestamp:new Date().toISOString()};this.messages.push(message);return message;
  }
  summary(){
    const field=this.attempts.filter(a=>!DEMO_SOURCES.has(a.source));
    const reviewed=field.filter(a=>a.review!=='unreviewed');
    const times=field.map(a=>a.elapsedMs).sort((a,b)=>a-b);
    const median=times.length?(times[Math.floor((times.length-1)/2)]+times[Math.ceil((times.length-1)/2)])/2:null;
    return{total:field.length,suggested:field.filter(a=>a.accepted).length,rejected:field.filter(a=>!a.accepted).length,reviewed:reviewed.length,correct:reviewed.filter(a=>a.review==='correct').length,corrected:reviewed.filter(a=>a.review==='corrected').length,medianMs:median,demo:this.attempts.length-field.length,personal:field.filter(a=>a.personalSamples).length};
  }
  exportReport(){return{schemaVersion:1,startedAt:this.startedAt,exportedAt:new Date().toISOString(),notice:'Результаты текущей сессии. Демопримеры исключены из сводки. Оценки пользователя не являются независимой валидацией РЖЯ. Реплики диалога не включены.',summary:this.summary(),attempts:this.attempts.map(a=>({...a}))};}
  clear(){this.attempts=[];this.messages=[];this.startedAt=new Date().toISOString();}
}
export function frameReadiness(frame){
  const pose=frame?.pose;const body=Boolean(pose?.[11]&&pose?.[12]&&(pose[11][3]??1)>.5&&(pose[12][3]??1)>.5);
  const hands=['left','right'].filter(side=>frame?.[side]?.length===21&&frame[side].every(p=>p&&p[0]>.025&&p[0]<.975&&p[1]>.025&&p[1]<.975)).length;
  return{body,hands,ready:body&&hands===2};
}
