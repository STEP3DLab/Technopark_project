// Expected words are fixed before recording. Neither predictions nor reviews
// can change the target or turn a corrected prediction into an objective hit.
export class TrialProtocol {
  constructor(catalog,participantCode,seed=Date.now()) {
    this.id=`trial-${seed}`;this.participantCode=String(participantCode||'P01').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)||'P01';
    this.seed=seed>>>0;let state=this.seed||1;
    this.tasks=[...catalog,...catalog].map(x=>({expectedId:x.id,expectedText:x.text,status:'pending'}));
    for(let i=this.tasks.length-1;i>0;i--){state^=state<<13;state^=state>>>17;state^=state<<5;const j=(state>>>0)%(i+1);[this.tasks[i],this.tasks[j]]=[this.tasks[j],this.tasks[i]];}
    this.index=0;this.ended=false;this.startedAt=new Date().toISOString();
  }
  get current(){return this.ended?null:this.tasks[this.index]||null;}
  context(){const t=this.current;return t?.status==='pending'?{protocolId:this.id,participantCode:this.participantCode,expectedId:t.expectedId,expectedText:t.expectedText,taskIndex:this.index}:null;}
  record(attempt,context){
    const t=this.current;if(!t||t.status!=='pending'||context?.protocolId!==this.id||context?.taskIndex!==this.index)return false;
    Object.assign(t,{status:'recorded',attemptId:attempt.id,accepted:attempt.accepted,predictedId:attempt.predictedId,correct:attempt.accepted&&attempt.predictedId===t.expectedId,personalSamples:attempt.personalSamples});return true;
  }
  skip(){if(this.current?.status!=='pending')return false;this.current.status='skipped';return true;}
  next(){if(!this.current||this.current.status==='pending')return false;this.index++;if(this.index>=this.tasks.length)this.ended=true;return true;}
  finish(){this.ended=true;}
  summary(){const recorded=this.tasks.filter(t=>t.status==='recorded');return{planned:this.tasks.length,recorded:recorded.length,correct:recorded.filter(t=>t.correct).length,rejected:recorded.filter(t=>!t.accepted).length,wrong:recorded.filter(t=>t.accepted&&!t.correct).length,skipped:this.tasks.filter(t=>t.status==='skipped').length,remaining:this.tasks.filter(t=>t.status==='pending').length};}
  exportReport(){return{id:this.id,participantCode:this.participantCode,seed:this.seed,startedAt:this.startedAt,ended:this.ended,summary:this.summary(),tasks:this.tasks.map(t=>({...t}))};}
}
