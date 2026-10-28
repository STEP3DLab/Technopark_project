// Fixed, small offline experiment. No threshold search or holdout-dependent tuning.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {classify} from '../app/recognizer.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const baseline=read('../tests/fixtures/baseline-v06.json');
const current=read('../app/assets/recognition-library.json');
const heldout=read('../tests/fixtures/heldout-v07.json');
const trainUsers=new Set([...baseline.entries,...current.entries].map(x=>x.user_id));
assert.equal(heldout.entries.length,12);
assert.ok(heldout.entries.every(x=>x.split==='test'&&!trainUsers.has(x.user_id)));
assert.ok(current.entries.every(x=>x.split==='train'));
assert.equal(new Set(heldout.entries.map(x=>x.clip_id)).size,12);
for(const id of new Set(current.entries.map(x=>x.id)))assert.equal(heldout.entries.filter(x=>x.id===id).length,2);
function evaluate(templates){
 const rows=heldout.entries.map(sample=>{
  const result=classify(sample.sequence,templates),best=result.rankings[0];
  return{clip_id:sample.clip_id,user_id:sample.user_id,expected:sample.id,expectedText:sample.text,
   nearest:best?.id||null,nearestText:best?.text||null,accepted:result.accepted,
   correct:Boolean(result.accepted&&best?.id===sample.id),issue:result.issue,
   distance:best?+best.distance.toFixed(6):null,
   gap:result.rankings[1]?+(result.rankings[1].distance-best.distance).toFixed(6):null};
 });
 const correct=rows.filter(x=>x.correct).length,rejected=rows.filter(x=>!x.accepted).length;
 return{templates:templates.length,signers:new Set(templates.map(x=>x.user_id)).size,
  summary:{total:rows.length,correct,rejected,wrong:rows.length-correct-rejected,top1:rows.filter(x=>x.nearest===x.expected).length},rows};
}
export const report={version:'0.7',date:'2026-10-28',method:'Nearest-template DTW; distance < 0.42 and runner-up gap > 0.055; no tuning on these 12 clips.',
 limits:'Small fixed closed-set offline test; Python MediaPipe extraction, not phone/live-browser evaluation. No unknown words, no linguistic review, no population accuracy estimate.',
 holdout:{clips:heldout.entries.length,signers:new Set(heldout.entries.map(x=>x.user_id)).size,split:'test',signerOverlap:0},
 hashes:Object.fromEntries(['../app/recognizer.js','../app/assets/recognition-library.json','../tests/fixtures/heldout-v07.json'].map(p=>[p,createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex')])),
 baseline:evaluate(baseline.entries),current:evaluate(current.entries)};
if(process.argv.includes('--write'))writeFileSync(new URL('../app/assets/evaluation-v07.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({holdout:report.holdout,baseline:report.baseline.summary,current:report.current.summary},null,2));
