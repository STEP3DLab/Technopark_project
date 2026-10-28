import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {prepareMotion,sampleMotion,interpolateCoordinate,armLayers} from '../app/avatar-motion.js';
const root=new URL('../app/assets/motion/',import.meta.url);
const clips=readdirSync(root).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(new URL(f,root))));
const pose=()=>Array.from({length:33},(_,i)=>[i===11?.3:i===12?.7:.5,.5,0,1]);
const hand=(x=.4)=>Array.from({length:21},(_,i)=>[x+i*.001,.5,0]);
const data=frames=>({width:720,height:1280,fps:30,frames});

test('display preparation preserves every original measured frame and never mutates source data',()=>{
 for(const clip of clips){const before=JSON.stringify(clip),track=prepareMotion(clip);
  for(let i=0;i<clip.frames.length;i++)for(const key of ['pose','left','right','face'])if(clip.frames[i][key])assert.deepEqual(sampleMotion(track,i/clip.fps)[key],clip.frames[i][key]);
  assert.equal(JSON.stringify(clip),before);
 }
});
test('bridges at most two interior frames, never boundaries, long gaps or large tracking jumps',()=>{
 const frame=h=>({pose:pose(),left:h});
 const track=prepareMotion(data([frame(null),frame(hand(.4)),frame(null),frame(null),frame(hand(.42)),frame(null),frame(null),frame(null),frame(hand(.44)),frame(null)]));
 assert.equal(track.filled,2);assert.equal(track.missing,5+10); // 5 left gaps + all 10 absent right hands
 assert.equal(track.frames[0].left,null);assert.ok(track.frames[2].left);assert.equal(track.frames[6].left,null);assert.equal(track.frames[9].left,null);
 const jump=prepareMotion(data([frame(hand(.1)),frame(null),frame(hand(.9))]));assert.equal(jump.frames[1].left,null);
});
test('cubic display interpolation never overshoots neighbours, including reversals',()=>{
 for(const values of [[0,1,2,3],[0,1,1.1,10],[4,3,2,1],[0,2,1,0],[2,1,1,2]])for(let i=0;i<=100;i++){
  const v=interpolateCoordinate(...values,i/100);assert.ok(v>=Math.min(values[1],values[2])-1e-12&&v<=Math.max(values[1],values[2])+1e-12);
 }
});
test('seeking is deterministic and a long hand gap cannot acquire invented fingers',()=>{
 const clip=clips.find(c=>c.clip_id==='b98ab14d-6d5e-4567-8815-9f8146aba461')||clips[0],track=prepareMotion(clip);
 const expected=sampleMotion(track,.45);sampleMotion(track,1.1);assert.deepEqual(sampleMotion(track,.45),expected);
 const missing=prepareMotion(data([{pose:pose(),left:hand()},{pose:pose(),left:null},{pose:pose(),left:null},{pose:pose(),left:null},{pose:pose(),left:hand()}]));
 assert.equal(sampleMotion(missing,1.5/30).left,null);
});
test('the entire farther limb is painted before the nearer one',()=>{
 const p=pose();p[13][2]=p[15][2]=-.2;p[14][2]=p[16][2]=.1;
 assert.deepEqual(armLayers(p).map(x=>x.side),['right','left']);
 p[13][2]=p[15][2]=.3;assert.deepEqual(armLayers(p).map(x=>x.side),['left','right']);
});
