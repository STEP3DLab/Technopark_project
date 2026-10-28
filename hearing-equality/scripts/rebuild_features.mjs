// Rebuild/check compact benchmark features from extracted motion JSONs.
// node scripts/rebuild_features.mjs /path/to/motion [another/motion/dir] [--write]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {makeSequence} from '../app/recognizer.js';
const dirs=process.argv.slice(2).filter(x=>x!=='--write');
if(!dirs.length)throw new Error('Provide directories containing <clip_id>.json from extract_motion.py');
for(const file of ['../tests/fixtures/baseline-v06.json','../app/assets/recognition-library.json','../tests/fixtures/heldout-v07.json']){
 const url=new URL(file,import.meta.url),data=JSON.parse(fs.readFileSync(url));
 const entries=data.entries.map(item=>{
  const location=dirs.map(dir=>path.join(dir,item.clip_id+'.json')).find(p=>fs.existsSync(p));
  if(!location)throw new Error('Missing motion: '+item.clip_id);
  const motion=JSON.parse(fs.readFileSync(location));assert.equal(motion.source_sha256,item.sha256);
  const frames=makeSequence(motion.frames,motion.width/motion.height);
  const sampled=frames.length<=40?frames:Array.from({length:40},(_,i)=>frames[Math.round(i*(frames.length-1)/39)]);
  const sequence=sampled.map(f=>({...f,points:f.points.map(p=>p?.map(x=>+x.toFixed(6))??null)}));
  return{...item,frame_count:motion.frame_count,tracking_counts:motion.tracking_counts,sequence};
 });
 if(process.argv.includes('--write'))fs.writeFileSync(url,JSON.stringify({...data,entries}));
 else assert.deepEqual(entries,data.entries);
 console.log(file,entries.length,process.argv.includes('--write')?'rebuilt':'verified');
}
