import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSequence, classify, dtwDistance, sequenceQuality } from '../app/recognizer.js';
const samples=JSON.parse(readFileSync(new URL('../app/assets/sources/slovo-sources.json',import.meta.url))).samples;
const data=samples.map(item=>({item,motion:JSON.parse(readFileSync(new URL(`../app/assets/motion/${item.file.replace('.mp4','.json')}`,import.meta.url)))}));
const templates=data.map(({item,motion})=>({id:item.id,text:item.label,sequence:makeSequence(motion.frames,motion.width/motion.height)}));
test('each reference maps to itself; regression only, not accuracy validation',()=>{
  for(const t of templates){const result=classify(t.sequence,templates);assert.equal(result.rankings[0]?.id,t.id);assert.equal(result.accepted,true,t.id);assert.equal(result.rankings[0].distance,0);}
});
test('rejects empty, insufficient, invisible-hand, and static inputs',()=>{
  assert.equal(classify([],templates).accepted,false);
  assert.equal(classify(templates[0].sequence.slice(0,3),templates).accepted,false);
  assert.equal(classify(Array(20).fill(templates[0].sequence[0]),templates).accepted,false);
  const noHands=data[0].motion.frames.map(f=>({...f,left:null,right:null}));
  assert.equal(classify(makeSequence(noHands),templates).accepted,false);
  assert.match(sequenceQuality(makeSequence(noHands)),/Кисти/);
});
test('temporal stretch and image-coordinate scaling preserve reference identity',()=>{
  for(const {item,motion} of data){
    const sparse=motion.frames.filter((_,i)=>i%2===0).flatMap(f=>[f,f]);
    const resized=sparse.map(f=>Object.fromEntries(Object.entries(f).map(([key,points])=>[key,points?.map(p=>[p[0]*.7+.1,p[1]*.7+.05,...p.slice(2)])??null])));
    const result=classify(makeSequence(resized,motion.width/motion.height),templates);
    assert.equal(result.rankings[0]?.id,item.id);
  }
});
test('indistinguishable labels produce rejection instead of arbitrary speech',()=>{
  const t=templates[0];const result=classify(t.sequence,[t,{...t,id:'ambiguous',text:'other'}]);
  assert.equal(result.accepted,false);assert.equal(result.rankings.length,2);
});
test('examples of the same label do not create artificial ambiguity',()=>{
  const t=templates[0];assert.equal(classify(t.sequence,[t,t,...templates.slice(1)]).accepted,true);
});
test('absent body is unusable and empty distances are infinite',()=>{
  assert.equal(makeSequence([{pose:null,left:null,right:null}]).length,0);
  assert.equal(dtwDistance([],templates[0].sequence),Infinity);
});
