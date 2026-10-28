import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {report} from '../scripts/evaluate.mjs';
test('published evaluation is reproducible and includes every fixed holdout clip',()=>{
 const saved=JSON.parse(readFileSync(new URL('../app/assets/evaluation-v07.json',import.meta.url)));
 assert.deepEqual(report,saved);
 assert.equal(report.holdout.signerOverlap,0);
 for(const variant of ['baseline','current']){
  const {correct,rejected,wrong,total}=report[variant].summary;
  assert.equal(correct+rejected+wrong,total);
 }
});
