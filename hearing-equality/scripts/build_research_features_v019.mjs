// Preserve every selected record. Failed extraction remains an explicit rejection.
// node scripts/build_research_features_v019.mjs /path/to/experiment
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeSequence} from '../app/recognizer.js';

const directory=process.argv[2];
if(!directory)throw new Error('Provide the experiment directory');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const selectionBytes=fs.readFileSync(new URL('../research/v019/selection.json',import.meta.url));
const selection=JSON.parse(selectionBytes);
const extracted=JSON.parse(fs.readFileSync(path.join(directory,'extraction.json')));
const productionBytes=fs.readFileSync(new URL('../app/assets/recognition-library.json',import.meta.url));
const production=new Map(JSON.parse(productionBytes).entries.map(row=>[row.clip_id,row]));
assert.equal(extracted.selection_sha256,sha(selectionBytes));
assert.equal(extracted.entries.length,selection.entries.length);
const entries=selection.entries.map(expected=>{
  const rows=extracted.entries.filter(r=>r.clip_id===expected.clip_id);
  assert.equal(rows.length,1);
  const record=rows[0];
  for(const [key,value] of Object.entries(expected))assert.deepEqual(record[key],value);
  if(record.extraction_status!=='ok')return{...record,sequence:[]};
  const motion=JSON.parse(fs.readFileSync(path.join(directory,'motion',record.clip_id+'.json')));
  assert.equal(motion.source_sha256,record.sha256);
  assert.equal(motion.extractor,extracted.extractor);
  const frames=makeSequence(motion.frames,motion.width/motion.height);
  const sampled=frames.length<=40?frames:Array.from({length:40},(_,i)=>frames[Math.round(i*(frames.length-1)/39)]);
  const sequence=sampled.map(f=>({...f,points:f.points.map(p=>p?.map(x=>+x.toFixed(6))??null)}));
  const previous=production.get(record.clip_id);
  if(previous){
    assert.equal(record.split,'train');
    assert.equal(previous.sha256,record.sha256);
    return{...record,sequence:previous.sequence,feature_origin:'production-v0.7',
      reextraction_matches_production:JSON.stringify(sequence)===JSON.stringify(previous.sequence)};
  }
  return{...record,sequence,feature_origin:'extracted-v0.19'};
});
const output={schema_version:1,selection_sha256:sha(selectionBytes),extractor:extracted.extractor,
  production_library_sha256:sha(productionBytes),
  license_id:'LicenseRef-Slovo-Public-License',
  source:'https://github.com/hukenovs/slovo',
  changes:'Measured pose and hand landmarks; normalized shoulders and palms; at most 40 frames; six decimal places; missing points preserved. No interpolation. The 21 overlapping production sequences are reused unchanged to isolate expansion and threshold effects.',
  entries};
const target=new URL('../research/v019/features.json',import.meta.url);
if(fs.existsSync(new URL('../research/v019/candidate.json',import.meta.url)))throw new Error('Calibration already frozen. Create a new protocol version to change features.');
fs.writeFileSync(target,JSON.stringify(output)+'\n');
console.log(JSON.stringify({entries:entries.length,known:entries.filter(x=>x.role==='known').length,unknown:entries.filter(x=>x.role==='unknown').length,
 failed:entries.filter(x=>x.extraction_status!=='ok').length,sha256:sha(fs.readFileSync(target)),bytes:fs.statSync(target).size},null,2));
