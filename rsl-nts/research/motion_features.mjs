import fs from 'node:fs';
import {motionFeatures} from '../motion.mjs';
const data=fs.readFileSync(process.argv[2]), stride=16*64*64, rows=[];
for(let base=0;base<data.length;base+=stride){
  const frames=Array.from({length:16},(_,i)=>data.subarray(base+i*4096,base+(i+1)*4096));
  rows.push(motionFeatures(frames));
}
process.stdout.write(JSON.stringify(rows));
