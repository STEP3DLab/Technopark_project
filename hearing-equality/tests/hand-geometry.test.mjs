import test from 'node:test';
import assert from 'node:assert/strict';
import {handMetrics,traceDigit,tracePhalanx} from '../app/hand-geometry.js';
import {paintHand,skinMaterial,handSurfacePlan} from '../app/avatar-hands.js';
import {readFileSync,readdirSync} from 'node:fs';

// Sample the emitted contours independently of Canvas. This checks the filled
// geometry, rather than only checking that drawing commands receive numbers.
class PathRecorder {
  paths=[];
  current=null;
  moveTo(x,y){this.current=[[x,y]];this.paths.push(this.current);}
  lineTo(x,y){this.current.push([x,y]);}
  arc(x,y,r,start,end,ccw){
    assert.ok([x,y,r,start,end].every(Number.isFinite));assert.ok(r>0);
    let sweep=end-start;
    if(Math.abs(sweep)>=Math.PI*2-1e-12)sweep=ccw?-Math.PI*2:Math.PI*2;
    else if(ccw){while(sweep>0)sweep-=Math.PI*2;}
    else {while(sweep<0)sweep+=Math.PI*2;}
    const steps=Math.max(8,Math.ceil(Math.abs(sweep)*12));
    for(let i=0;i<=steps;i++)this.current.push([x+r*Math.cos(start+sweep*i/steps),y+r*Math.sin(start+sweep*i/steps)]);
  }
  closePath(){this.current.push([...this.current[0]]);this.current=null;}
  beginPath(){assert.fail('Caller owns the path');}
  fill(){assert.fail('Caller owns the one fill');}
  stroke(){assert.fail('No internal strokes');}
}
const draw=chain=>{const ctx=new PathRecorder();assert.equal(traceDigit(ctx,chain,3),true);return ctx.paths;};
const signedArea=p=>p.slice(1).reduce((s,q,i)=>s+p[i][0]*q[1]-q[0]*p[i][1],0)/2;
const inside=(p,polygon)=>{
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
};
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const intersects=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9;

test('U-bent fingers form finite, consistently wound, non-self-crossing filled parts',()=>{
  for(const chain of [[[0,0],[20,0],[0,0],[15,0]],[[0,0],[20,0],[.01,.0001],[12,-.02]],[[0,0],[20,10],[10,10],[25,15]]]){
    const original=structuredClone(chain),paths=draw(chain);
    assert.deepEqual(chain,original);assert.equal(paths.length,5);
    for(const p of paths){
      assert.ok(p.flat().every(Number.isFinite));assert.ok(signedArea(p)<0,'same winding avoids accidental holes');
      for(let i=0;i<p.length-1;i++)for(let j=i+2;j<p.length-1;j++)assert.equal(intersects(p[i],p[i+1],p[j],p[j+1]),false,'each part is convex and does not cross itself');
    }
    for(const joint of chain)assert.ok(paths.some(p=>inside(joint,p)),'every measured joint remains covered');
  }
});

test('zero-length and contained segments retain bounded round geometry',()=>{
  for(const chain of [[[12,30],[12,30],[12,30],[12,30]],[[0,0],[.01,0],[20,0],[20,0]]]){
    const paths=draw(chain),xs=chain.map(p=>p[0]),ys=chain.map(p=>p[1]);
    for(const [x,y] of paths.flat()){
      assert.ok(x>=Math.min(...xs)-3-1e-8&&x<=Math.max(...xs)+3+1e-8);
      assert.ok(y>=Math.min(...ys)-3-1e-8&&y<=Math.max(...ys)+3+1e-8);
    }
    for(const joint of chain)assert.ok(paths.some(p=>inside(joint,p)));
  }
});

test('crossing an exact 180-degree fold does not flip or collapse the contour',()=>{
  const a=draw([[0,0],[20,0],[0,-1e-6],[12,0]]),b=draw([[0,0],[20,0],[0,1e-6],[12,0]]);
  assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++){
    assert.equal(a[i].length,b[i].length);
    for(let j=0;j<a[i].length;j++)assert.ok(Math.hypot(a[i][j][0]-b[i][j][0],a[i][j][1]-b[i][j][1])<1e-4);
  }
});

test('hand and forearm share bounded wrist dimensions; depth units cannot change them',()=>{
  const points=Array.from({length:21},(_,i)=>[i%4*9,Math.floor(i/4)*11,i]);
  const original=structuredClone(points),metrics=handMetrics(points,180);
  assert.deepEqual(points,original);
  assert.deepEqual(handMetrics(points.map(p=>[p[0],p[1],p[2]*1e8]),180),metrics);
  assert.ok(metrics.fingerRadius>=180*.020&&metrics.fingerRadius<=180*.065);
  assert.ok(metrics.wristRadius>=metrics.fingerRadius*1.2);
  assert.ok(metrics.wristRadius<=180*.08);
  assert.ok(Math.abs(Math.hypot(...metrics.wristNormal)-1)<1e-12);
  const dx=points[9][0]-points[0][0],dy=points[9][1]-points[0][1];
  assert.ok(Math.abs(dx*metrics.wristNormal[0]+dy*metrics.wristNormal[1])<1e-12);
  const bigger=handMetrics(points.map(p=>[p[0]*2,p[1]*2,p[2]]),360);
  assert.ok(Math.abs(bigger.fingerRadius-metrics.fingerRadius*2)<1e-12);
  assert.ok(Math.abs(bigger.wristRadius-metrics.wristRadius*2)<1e-12);
});

test('degenerate hands have finite defaults and invalid digits do not alter the path',()=>{
  for(const points of [null,[],Array.from({length:21},()=>[5,5,0])])for(const shoulder of [0,NaN,1,150]){
    const m=handMetrics(points,shoulder);
    assert.ok([m.fingerRadius,m.wristRadius,...m.wristNormal].every(Number.isFinite));
    assert.ok(m.fingerRadius>0&&m.wristRadius>0);
    assert.ok(Math.abs(Math.hypot(...m.wristNormal)-1)<1e-12);
  }
  for(const chain of [null,[],[[0,0],[1,1],[2,2],[NaN,3]]]){
    const ctx=new PathRecorder();assert.equal(traceDigit(ctx,chain,3),false);assert.deepEqual(ctx.paths,[]);
  }
  const ctx=new PathRecorder();assert.equal(traceDigit(ctx,[[0,0],[1,1],[2,2],[3,3]],-1),false);assert.deepEqual(ctx.paths,[]);
});

// Observed regression: a closed hand must not become thin separated loops.
test('fist material thickness follows adjacent knuckles rather than shortened curled phalanges',()=>{
 const p=Array.from({length:21},()=>[0,0,0]);
 p[0]=[0,80,0];p[1]=[-15,45,0];p[2]=[-15,20,0];p[3]=[-15,0,0];p[4]=[-15,-20,0];
 for(let f=0;f<4;f++){const i=5+f*4,y=f*38;p[i]=[0,y,0];p[i+1]=[75,y,-.1];p[i+2]=[62,y+2,-.12];p[i+3]=[40,y+3,-.13];}
 const m=handMetrics(p,320);
 assert.ok(m.fingerRadius*2>=38*.85);assert.ok(m.fingerRadius*2<=38);
 assert.ok(m.wristRadius>=m.fingerRadius*1.2);
});

function surfaceRecorder(){
 const fills=[],paths=[],state={depth:0,strokes:0,clips:0},stack=[];let path=[];
 const point=(...values)=>{assert.ok(values.every(Number.isFinite));path.push(values);};
 const gradient=(...values)=>{assert.ok(values.every(Number.isFinite));return {addColorStop(position,color){assert.ok(position>=0&&position<=1);assert.equal(typeof color,'string');}}};
 const ctx=new Proxy({
  globalAlpha:1,shadowColor:'transparent',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,
  save(){state.depth++;stack.push({alpha:ctx.globalAlpha,clips:state.clips,shadowColor:ctx.shadowColor,shadowBlur:ctx.shadowBlur,shadowOffsetX:ctx.shadowOffsetX,shadowOffsetY:ctx.shadowOffsetY});},restore(){assert.ok(state.depth>0);const saved=stack.pop();ctx.globalAlpha=saved.alpha;state.clips=saved.clips;for(const key of ['shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY'])ctx[key]=saved[key];state.depth--;},
  beginPath(){path=[];paths.push(path);},moveTo:point,lineTo:point,
  quadraticCurveTo:point,closePath(){},
  clip(){state.clips++;},
  arc(...values){assert.ok(values[2]>0);point(...values.slice(0,5));},
  fill(){assert.ok(ctx.globalAlpha>=0&&ctx.globalAlpha<=1);if(ctx.shadowColor!=='transparent')assert.ok(state.clips>0,'contact shadows stay clipped inside the hand');fills.push([...path]);},stroke(){state.strokes++;},
  fillRect(...values){assert.ok(values.every(Number.isFinite));},
  createLinearGradient:gradient,createRadialGradient:gradient,
 },{get:(o,key)=>{if(key in o)return o[key];throw new Error(`Unexpected canvas method: ${String(key)}`);}});
 return {ctx,state,fills,paths};
}

test('hand surfaces reject incomplete inputs without drawing or changing canvas state',()=>{
 for(const points of [null,[],Array.from({length:20},()=>[0,0]),Array.from({length:21},(_,i)=>[i===10?NaN:0,0])]){
  const {ctx,state,fills,paths}=surfaceRecorder();assert.equal(paintHand(ctx,points,200),false);
  assert.equal(state.depth,0);assert.deepEqual(fills,[]);assert.deepEqual(paths,[]);
 }
});

test('extended fingers use continuous fills without knuckle rings, and palm does not inflate the wrist',()=>{
 const points=Array.from({length:21},()=>[0,0,0]);points[0]=[0,80,0];
 for(let finger=0;finger<5;finger++){
  const base=1+finger*4,x=(finger-2)*15;
  for(let joint=0;joint<4;joint++)points[base+joint]=[x,25-joint*18,0];
 }
 const metrics=handMetrics(points,200),{ctx,state,fills}=surfaceRecorder();
 assert.equal(paintHand(ctx,points,200),true);assert.equal(state.depth,0);
 assert.ok(fills.length>0);assert.equal(state.strokes,0,'straight fingers do not acquire decorative rings');
 const vertices=handSurfacePlan(points,200).palm;
 assert.ok(vertices.every(p=>p[1]<=80),'palm surface never extends behind this wrist');
 const wristPoints=vertices.filter(p=>p[1]===80);
 assert.ok(wristPoints.length>=2);
 assert.ok(wristPoints.every(p=>Math.abs(p[0])<=metrics.wristRadius+1e-8),'wrist remains within the shared forearm width');
});

test('hand painter preserves recorded joints and restores canvas state across the real motion corpus',()=>{
 const root=new URL('../app/assets/motion/',import.meta.url),skin={base:'#D6B49A',light:'#EBD1B9',shade:'#AF866C',line:'#76513C'};
 for(const file of readdirSync(root).filter(name=>name.endsWith('.json'))){
  const clip=JSON.parse(readFileSync(new URL(file,root)));
  for(const frame of clip.frames)for(const side of ['left','right']){
   if(frame[side]?.length!==21)continue;
   const points=Object.freeze(frame[side].map(p=>Object.freeze([p[0]*clip.width,p[1]*clip.height,p[2]])));
   const pose=frame.pose||frame.pose33,shoulder=Math.hypot((pose[11][0]-pose[12][0])*clip.width,(pose[11][1]-pose[12][1])*clip.height);
   const {ctx,state,fills}=surfaceRecorder();assert.equal(paintHand(ctx,points,shoulder,skin),true);
   assert.equal(state.depth,0);assert.equal(state.clips,0);assert.equal(ctx.globalAlpha,1);assert.ok(fills.length>0);
  }
 }
 for(const shoulder of [0,NaN,1,150]){
  const {ctx,state}=surfaceRecorder();assert.equal(paintHand(ctx,Array.from({length:21},()=>[5,5,0]),shoulder,skin),true);assert.equal(state.depth,0);
 }
});

test('phalanx surface patches preserve exact endpoints and remain bounded for folded or coincident joints',()=>{
 for(const [a,b,ra,rb] of [[[0,0],[20,0],3,2.1],[[0,0],[0,0],3,2.1],[[0,0],[.01,.02],3,2.1]]){
  const ctx=new PathRecorder(),before=structuredClone([a,b]);assert.equal(tracePhalanx(ctx,a,b,ra,rb),true);assert.deepEqual([a,b],before);
  assert.equal(ctx.paths.length,1);assert.ok(signedArea(ctx.paths[0])<0);
  assert.ok(inside(a,ctx.paths[0]));assert.ok(inside(b,ctx.paths[0]));
  for(const [x,y] of ctx.paths[0]){assert.ok(x>=Math.min(a[0],b[0])-3-1e-8&&x<=Math.max(a[0],b[0])+3+1e-8);assert.ok(y>=Math.min(a[1],b[1])-3-1e-8&&y<=Math.max(a[1],b[1])+3+1e-8);}
 }
 const ctx=new PathRecorder();assert.equal(tracePhalanx(ctx,[0,0],[1,1],NaN,2),false);assert.deepEqual(ctx.paths,[]);
});

test('palm occlusion is continuous near the depth boundary without moving geometry',()=>{
 const points=Array.from({length:21},(_,i)=>[i%4*9,Math.floor(i/4)*11,0]);
 points[2][2]=points[3][2]=points[4][2]=1;
 const at=value=>{const p=structuredClone(points);for(const id of [6,7,8])p[id][2]=value;return handSurfacePlan(p,180);};
 for(const boundary of [-.055,0,.055]){
  const before=at(boundary-1e-7),after=at(boundary+1e-7);
  assert.deepEqual(before.palm,after.palm);assert.equal(before.wristRadius,after.wristRadius);
  const first=before.layers.find(d=>d.index===1),second=after.layers.find(d=>d.index===1);
  assert.ok(Math.abs(first.frontWeight-second.frontWeight)<1e-4,'no hard whole-finger switch');
 }
 assert.equal(at(-.2).layers.find(d=>d.index===1).frontWeight,1);
 assert.equal(at(.2).layers.find(d=>d.index===1).frontWeight,0);
 assert.equal(handSurfacePlan(null,180),null);
});

test('matte skin illumination remains continuous as a limb crosses the previous normal-flip angle',()=>{
 const palette={base:'#D6B49A',light:'#EBD1B9',shade:'#AF866C',line:'#76513C'};
 const sample=angle=>{
  const record={coordinates:null,stops:[]};
  const ctx={createLinearGradient(...coordinates){record.coordinates=coordinates;return {addColorStop(position,color){record.stops.push({position,rgb:color.match(/[\d.]+/g).map(Number)});}};}};
  const direction=[Math.cos(angle),Math.sin(angle)];
  skinMaterial(ctx,[-direction[0]*50,-direction[1]*50],[direction[0]*50,direction[1]*50],8,palette);
  return record;
 };
 const oldBoundary=Math.atan2(.76,.65),epsilon=1e-6;
 for(const boundary of [oldBoundary,oldBoundary+Math.PI]){
  const before=sample(boundary-epsilon),after=sample(boundary+epsilon);
  for(let i=0;i<4;i++)assert.ok(Math.abs(before.coordinates[i]-after.coordinates[i])<.001,'gradient direction never jumps to the opposite side');
  for(let i=0;i<before.stops.length;i++)for(let channel=0;channel<3;channel++)assert.ok(Math.abs(before.stops[i].rgb[channel]-after.stops[i].rgb[channel])<=1,'matte color changes continuously');
 }
 // Reversing a segment is the same physical cylinder, with gradient stops
 // traversed in reverse. Its light must not depend on landmark ordering.
 const forward=sample(.4),reverse=sample(.4+Math.PI);
 for(let i=0;i<forward.stops.length;i++)assert.deepEqual(forward.stops[i].rgb,reverse.stops.at(-1-i).rgb);
});
