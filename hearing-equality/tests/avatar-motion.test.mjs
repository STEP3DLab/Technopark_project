import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {prepareMotion,sampleMotion,interpolateCoordinate,armLayers,getSmoothingMetrics,SMOOTHING_LIMITS} from '../app/avatar-motion.js';
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

const syntheticHand=(x,y=.8)=>Array.from({length:21},(_,i)=>[x+i*.001,y+Math.sin(i)*.003,i*.002]);
const syntheticClip=positions=>({width:1000,height:1000,fps:30,frames:positions.map(x=>({pose:pose(),left:x===null?null:syntheticHand(x),right:null,face:null}))});
const at=(track,index,smooth=true)=>sampleMotion(track,index/track.fps,{smooth});
const curvature=points=>Math.sqrt(points.slice(1,-1).reduce((sum,p,i)=>sum+(p-(points[i]+points[i+2])/2)**2,0)/(points.length-2));

test('optional symmetric denoising suppresses small static jitter without a playback-state dependency',()=>{
 const values=Array.from({length:25},(_,i)=>.22+(i%2?1:-1)*.0012),clip=syntheticClip(values),track=prepareMotion(clip);
 const before=values.slice(3,-3),after=values.map((_,i)=>at(track,i).left[0][0]).slice(3,-3);
 assert.ok(curvature(after)<curvature(before)*.25,'A quiet alternating tracking perturbation should be reduced by at least 75%');
 const expected=sampleMotion(track,.313,{smooth:true});sampleMotion(track,.7,{smooth:true});sampleMotion(track,.08,{smooth:true});
 assert.deepEqual(sampleMotion(track,.313,{smooth:true}),expected);
 const reversed=prepareMotion(syntheticClip([...values].reverse()));
 for(let i=0;i<values.length;i++)assert.ok(Math.abs(at(track,i).left[0][0]-at(reversed,values.length-1-i).left[0][0])<1e-12,'Symmetry must not introduce forward/backward lag');
});

test('fast translations, exact pauses and clip endpoints retain their recorded positions',()=>{
 const values=Array.from({length:25},(_,i)=>.2+Math.max(0,Math.min(4,i-9))*.1),track=prepareMotion(syntheticClip(values));
 for(let i=0;i<values.length;i++)assert.deepEqual(at(track,i).left,track.frames[i].left,'Fast transitions and exact plateau frames must not be rounded off');
 const jitter=prepareMotion(syntheticClip(Array.from({length:25},(_,i)=>.22+(i%2?1:-1)*.0012)));
 for(const i of [0,1,23,24])assert.deepEqual(at(jitter,i).left,jitter.frames[i].left);
});

test('hand contact protection takes precedence over denoising and preserves contact geometry',()=>{
 const clip=syntheticClip(Array.from({length:25},(_,i)=>.42+(i%2?1:-1)*.001));
 clip.frames.forEach(frame=>{frame.right=syntheticHand(.44);});
 const track=prepareMotion(clip);
 for(let i=0;i<clip.frames.length;i++){
  assert.deepEqual(at(track,i).left,clip.frames[i].left,'A hand approaching/contacting the other hand must not be independently displaced');
  assert.deepEqual(at(track,i).right,clip.frames[i].right);
 }
 assert.ok(getSmoothingMetrics(track).contactProtectedHandFrames>0);
});

test('contact with the opposite forearm also protects that elbow from independent smoothing',()=>{
 const clip=syntheticClip(Array.from({length:25},(_,i)=>.22+(i%2?1:-1)*.001));
 clip.frames.forEach((frame,i)=>{frame.right=syntheticHand(.7);frame.pose[14]=[.235+(i%2?1:-1)*.0012,.8,0,1];});
 const track=prepareMotion(clip);
 for(let i=0;i<clip.frames.length;i++){
  assert.deepEqual(at(track,i).left,clip.frames[i].left);
  assert.deepEqual(at(track,i).pose[14],clip.frames[i].pose[14],'The target forearm must stay aligned with the contacting hand');
 }
});

test('whole-hand corrections preserve every finger vector, Z coordinate and confidence at recorded instants',()=>{
 for(const clip of clips){const before=JSON.stringify(clip),track=prepareMotion(clip);
  for(let i=0;i<clip.frames.length;i++)for(const side of ['left','right']){
   const source=track.frames[i][side],filtered=at(track,i)[side];if(!source||!filtered)continue;
   for(let p=0;p<21;p++){
    for(let axis=0;axis<2;axis++)assert.ok(Math.abs((filtered[p][axis]-filtered[0][axis])-(source[p][axis]-source[0][axis]))<1e-12);
    assert.deepEqual(filtered[p].slice(2),source[p].slice(2));
   }
  }
  assert.equal(JSON.stringify(clip),before,'Smoothing must not change the source measurements');
  for(let i=0;i<clip.frames.length;i++)for(const key of ['pose','left','right','face'])if(clip.frames[i][key])assert.deepEqual(at(track,i,false)[key],clip.frames[i][key],'Default playback remains exact after smooth playback');
 }
});

test('denoising does not fill long hand gaps or use short reconstructed gaps as smoothing evidence',()=>{
 const values=Array.from({length:25},(_,i)=>.22+(i%2?1:-1)*.0012);
 values[7]=values[8]=null;values[16]=values[17]=values[18]=null;
 const track=prepareMotion(syntheticClip(values));
 assert.equal(track.filled,2);
 for(let i=5;i<=10;i++)assert.deepEqual(at(track,i).left,track.frames[i].left,'The observed-data mask must prevent filtering across a reconstructed gap');
 for(const i of [15.5,16,16.5,17,17.5,18,18.5])assert.equal(at(track,i).left,null,'A long gap must never acquire invented hand points');
});

test('curated smoothing stays within the translation bound and its cubic stays inside each neighbouring pair',()=>{
 for(const clip of clips){const track=prepareMotion(clip),metrics=getSmoothingMetrics(track);
  assert.ok(metrics.maxWristCorrection<=SMOOTHING_LIMITS.body+SMOOTHING_LIMITS.hand+1e-12);
  assert.deepEqual(getSmoothingMetrics(track),metrics);
  for(let i=0;i<track.frames.length-1;i++){
   const a=at(track,i),b=at(track,i+1),middle=at(track,i+.5);
   for(const key of ['pose','left','right','face']){
    if(!a[key]||!b[key]){assert.equal(middle[key],null);continue;}
    for(let p=0;p<a[key].length;p++)for(let axis=0;axis<3;axis++){
     const x=a[key][p]?.[axis],y=b[key][p]?.[axis],value=middle[key]?.[p]?.[axis];if(![x,y,value].every(Number.isFinite))continue;
     assert.ok(value>=Math.min(x,y)-1e-12&&value<=Math.max(x,y)+1e-12,'Optional filtering must retain the shape-preserving cubic interpolation');
    }
   }
  }
 }
});
