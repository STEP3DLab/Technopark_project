// Display-only interpolation. Source frames and recognition templates stay intact.
export const validPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const completeHand = points => points?.length === 21 && points.every(validPoint);
const lerp = (a,b,t) => a.map((p,i)=>p.map((v,j)=>Number.isFinite(v)&&Number.isFinite(b[i]?.[j])?v+(b[i][j]-v)*t:v));
const distance = (a,b,w,h) => Math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h);

export function prepareMotion(data) {
  const frames=(data.frames||[]).map(f=>({...f,pose:f.pose||f.pose33}));
  const width=Number(data.width)||1,height=Number(data.height)||1;
  const observedHands=Object.fromEntries(['left','right'].map(key=>[key,frames.map(frame=>completeHand(frame[key]))]));
  let filled=0,missing=0;
  for(const key of ['left','right']) {
    for(let i=0;i<frames.length;) {
      if(completeHand(frames[i][key])){i++;continue;}
      const start=i;while(i<frames.length&&!completeHand(frames[i][key]))i++;
      const count=i-start,a=frames[start-1]?.[key],b=frames[i]?.[key];
      const pose=frames[start]?.pose;
      const shoulder=validPoint(pose?.[11])&&validPoint(pose?.[12])?distance(pose[11],pose[12],width,height):width/3;
      // Never bridge a clip boundary, a long gap, or a large tracking jump.
      const stable=completeHand(a)&&completeHand(b)&&distance(a[0],b[0],width,height)<shoulder*.45;
      if(count<=2&&stable) {
        for(let k=0;k<count;k++){frames[start+k][key]=lerp(a,b,(k+1)/(count+1));filled++;}
      } else {for(let k=start;k<i;k++)frames[k][key]=null;missing+=count;}
    }
  }
  return{frames,filled,missing,fps:Number(data.fps)||30,width,height,observedHands,faceIndices:data.face_indices||[]};
}

// Offline symmetric filtering has no causal lag or accumulated playback state.
// Only small XY translations are denoised. A hand's 21 points always receive
// the SAME correction: finger shape, hand orientation and all Z/confidence
// coordinates at recorded instants remain unchanged. No limb is synthesized.
export const SMOOTHING_LIMITS=Object.freeze({body:.004,hand:.008,elbow:.005,head:.003,slow:.5,fast:2.0});
const smoothedTracks=new WeakMap();
const clamp01=value=>Math.max(0,Math.min(1,value));
const smoothstep=(lo,hi,value)=>{const t=clamp01((value-lo)/(hi-lo));return t*t*(3-2*t);};
const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]||1;};
const zero=()=>[0,0];

function smoothTrack(track) {
  if(smoothedTracks.has(track))return smoothedTracks.get(track);
  const frames=track.frames,n=frames.length,w=track.width||1,h=track.height||1;
  const point=p=>validPoint(p)?[p[0]*w,p[1]*h]:null;
  const body=frames.map(frame=>{
    const a=frame.pose?.[11],b=frame.pose?.[12];
    return validPoint(a)&&validPoint(b)&&(a[3]??1)>.45&&(b[3]??1)>.45?[(a[0]+b[0])*w/2,(a[1]+b[1])*h/2]:null;
  });
  const scale=median(frames.flatMap(frame=>validPoint(frame.pose?.[11])&&validPoint(frame.pose?.[12])?[distance(frame.pose[11],frame.pose[12],w,h)]:[]));
  const relative=anchors=>anchors.map((p,i)=>p&&body[i]?[p[0]-body[i][0],p[1]-body[i][1]]:null);
  const wrists=Object.fromEntries(['left','right'].map(key=>[key,frames.map(frame=>completeHand(frame[key])?point(frame[key][0]):null)]));
  const elbows={left:frames.map(frame=>point(frame.pose?.[13])),right:frames.map(frame=>point(frame.pose?.[14]))};
  const headIndices=[10,152,234,454].map(id=>track.faceIndices?.indexOf(id)).filter(id=>id>=0);
  const heads=frames.map((frame,i)=>{
    if(!body[i]||headIndices.length<2||headIndices.some(id=>!validPoint(frame.face?.[id])))return null;
    const center=headIndices.reduce((sum,id)=>[sum[0]+frame.face[id][0],sum[1]+frame.face[id][1]],[0,0]).map(value=>value/headIndices.length);
    return point(center);
  });
  const relativeWrists={left:relative(wrists.left),right:relative(wrists.right)};
  const relativeElbows={left:relative(elbows.left),right:relative(elbows.right)},relativeHeads=relative(heads);
  const hasWindow=(anchors,i,observed)=>i>=2&&i<n-2&&anchors.slice(i-2,i+3).every(Boolean)&&(!observed||observed.slice(i-2,i+3).every(Boolean));
  const windowSpeed=(anchors,i)=>Math.max(...Array.from({length:4},(_,k)=>length(anchors[i+k-2],anchors[i+k-1])))*track.fps/scale;
  const shift=(anchors,i,limit,observed,relativeAnchors)=>{
    if(!hasWindow(anchors,i,observed)||(relativeAnchors&&!hasWindow(relativeAnchors,i)))return zero();
    const center=anchors[i];
    // An exact hold/contact plateau must stay exact, including its first frame.
    if(length(center,anchors[i-1])<scale*1e-9||length(center,anchors[i+1])<scale*1e-9)return zero();
    // Guard both screen-space speed and speed relative to the torso. A body
    // movement must neither introduce hand/head jitter nor hide a fast sign.
    const speed=Math.max(windowSpeed(anchors,i),relativeAnchors?windowSpeed(relativeAnchors,i):0);
    const strength=.9*(1-smoothstep(SMOOTHING_LIMITS.slow,SMOOTHING_LIMITS.fast,speed));
    if(strength===0)return zero();
    const kernel=[1,4,6,4,1];
    const correction=[0,1].map(axis=>strength*(kernel.reduce((sum,weight,k)=>sum+weight*anchors[i+k-2][axis],0)/16-center[axis]));
    const magnitude=Math.hypot(...correction),bound=limit*scale;
    return magnitude>bound?correction.map(value=>value*bound/magnitude):correction;
  };
  // A conservative projected-proximity guard, not a claim of 3-D contact
  // detection. Protect hand-to-hand, hand-to-face and opposite-arm approaches.
  const inner2=(.05*scale)**2,outer2=(.10*scale)**2;
  const proximity=(hand,targets)=>{
    let nearest2=outer2;
    for(const a of hand)for(const b of targets){
      const squared=(a[0]-b[0])**2+(a[1]-b[1])**2;
      if(squared<=inner2)return 0;
      nearest2=Math.min(nearest2,squared);
    }
    return nearest2===outer2?1:smoothstep(.05,.10,Math.sqrt(nearest2)/scale);
  };
  const contacts=Object.fromEntries(['left','right'].map(side=>[side,frames.map(frame=>{
    if(!completeHand(frame[side]))return{hand:0,head:0,torso:0,oppositeArm:0};
    const hand=frame[side].map(point),opposite=side==='left'?'right':'left';
    const projected=points=>points.filter(validPoint).map(point);
    const head=proximity(hand,projected(frame.face||[]));
    const torso=proximity(hand,projected([frame.pose?.[11],frame.pose?.[12]]));
    const oppositeArm=proximity(hand,projected([frame.pose?.[side==='left'?14:13]]));
    const otherHand=proximity(hand,projected(frame[opposite]||[]));
    return{hand:Math.min(head,torso,oppositeArm,otherHand),head,torso,oppositeArm};
  })]));
  const contactWeight=(side,i,part='hand')=>Math.min(...contacts[side].slice(Math.max(0,i-1),Math.min(n,i+2)).map(sample=>sample[part]));
  const shifts=frames.map((_,i)=>{
    const hands={},arms={};
    const torsoWeight=Math.min(contactWeight('left',i,'torso'),contactWeight('right',i,'torso'));
    const headWeight=Math.min(contactWeight('left',i,'head'),contactWeight('right',i,'head'));
    const torso=shift(body,i,SMOOTHING_LIMITS.body).map(value=>value*torsoWeight);
    for(const side of ['left','right']){
      const observed=track.observedHands?.[side],weight=contactWeight(side,i);
      hands[side]=shift(wrists[side],i,SMOOTHING_LIMITS.hand,observed,relativeWrists[side]).map(value=>value*weight);
      // Guard the contacted part too, without passing its detector noise to
      // unrelated parts. In particular a hand/forearm contact need not move
      // the head, and a hand/face contact must not move either participant.
      const armWeight=contactWeight(side==='left'?'right':'left',i,'oppositeArm');
      arms[side]=shift(elbows[side],i,SMOOTHING_LIMITS.elbow,observed,relativeElbows[side]).map(value=>value*armWeight);
    }
    const head=shift(heads,i,SMOOTHING_LIMITS.head,undefined,relativeHeads).map(value=>value*headWeight);
    return{torso,hands,arms,head};
  });
  const move=(p,delta)=>validPoint(p)&&(delta[0]!==0||delta[1]!==0)?p.map((value,axis)=>axis===0?value+delta[0]/w:axis===1?value+delta[1]/h:value):p;
  const output=frames.map((frame,i)=>{
    const delta=shifts[i],result={...frame};
    // Each observed part is filtered in its own image-space coordinates.
    // Applying a shoulder correction to all parts injected shoulder-detector
    // noise into a quiet face, especially when a contact guard was active.
    for(const side of ['left','right'])if(frame[side])result[side]=frame[side].map(p=>move(p,delta.hands[side]));
    if(frame.face)result.face=frame.face.map(p=>move(p,delta.head));
    if(frame.pose)result.pose=frame.pose.map((p,index)=>{
      const local=index<11?delta.head:index===13?delta.arms.left:index===14?delta.arms.right:index>=15&&index<=22?delta.hands[index%2?'left':'right']:delta.torso;
      return move(p,local);
    });
    return result;
  });
  let before2=0,after2=0,count=0,lowBefore2=0,lowAfter2=0,lowCount=0,offset2=0,maxOffset=0,points=0,contactFrames=0,fastFrames=0;
  for(const side of ['left','right'])for(let i=0;i<n;i++){
    if(contactWeight(side,i)<1)contactFrames++;
    if(hasWindow(wrists[side],i,track.observedHands?.[side])&&hasWindow(relativeWrists[side],i)&&Math.max(windowSpeed(wrists[side],i),windowSpeed(relativeWrists[side],i))>=SMOOTHING_LIMITS.fast)fastFrames++;
    if(!completeHand(frames[i][side])||!completeHand(output[i][side]))continue;
    const offset=distance(frames[i][side][0],output[i][side][0],w,h)/scale;
    offset2+=offset*offset;maxOffset=Math.max(maxOffset,offset);points++;
    if(i<1||i>=n-1||![frames[i-1],frames[i+1]].every(frame=>completeHand(frame[side])))continue;
    const residual=source=>{
      const a=point(source[i-1][side][0]),b=point(source[i][side][0]),c=point(source[i+1][side][0]);
      return length(b,[(a[0]+c[0])/2,(a[1]+c[1])/2])/scale;
    };
    const before=residual(frames),after=residual(output);before2+=before*before;after2+=after*after;count++;
    if(hasWindow(relativeWrists[side],i,track.observedHands?.[side])&&windowSpeed(relativeWrists[side],i)<SMOOTHING_LIMITS.slow){lowBefore2+=before*before;lowAfter2+=after*after;lowCount++;}
  }
  const rms=(sum,num)=>num?Math.sqrt(sum/num):0;
  const anchorMetrics=(anchors,deltas)=>{
    const filtered=anchors.map((p,i)=>p?[p[0]+deltas[i][0],p[1]+deltas[i][1]]:null);
    let before=0,after=0,count=0,maxCorrection=0;
    for(let i=0;i<n;i++){
      maxCorrection=Math.max(maxCorrection,Math.hypot(...deltas[i])/scale);
      if(i<1||i>=n-1||!anchors[i-1]||!anchors[i]||!anchors[i+1])continue;
      const curvature=points=>length(points[i],[(points[i-1][0]+points[i+1][0])/2,(points[i-1][1]+points[i+1][1])/2])/scale;
      before+=curvature(anchors)**2;after+=curvature(filtered)**2;count++;
    }
    return{before:rms(before,count),after:rms(after,count),count,maxCorrection};
  };
  const torsoMetrics=anchorMetrics(body,shifts.map(delta=>delta.torso));
  const headMetrics=anchorMetrics(heads,shifts.map(delta=>delta.head));
  const metrics={method:'symmetric-adaptive-translation',radius:2,shoulderPixels:scale,frames:n,wristSamples:count,
    wristCurvatureBefore:rms(before2,count),wristCurvatureAfter:rms(after2,count),
    slowWristCurvatureBefore:rms(lowBefore2,lowCount),slowWristCurvatureAfter:rms(lowAfter2,lowCount),slowWristSamples:lowCount,
    rmsWristCorrection:rms(offset2,points),maxWristCorrection:maxOffset,contactProtectedHandFrames:contactFrames,fastProtectedHandFrames:fastFrames,
    bodyCurvatureBefore:torsoMetrics.before,bodyCurvatureAfter:torsoMetrics.after,bodySamples:torsoMetrics.count,maxBodyCorrection:torsoMetrics.maxCorrection,
    headCurvatureBefore:headMetrics.before,headCurvatureAfter:headMetrics.after,headSamples:headMetrics.count,maxHeadCorrection:headMetrics.maxCorrection};
  const result={frames:output,metrics};smoothedTracks.set(track,result);return result;
}

// Curvature is a high-frequency-motion proxy, not a linguistic accuracy score.
// Metrics are normalized to the clip's median projected shoulder width.
export function getSmoothingMetrics(track){return track?.frames?.length?{...smoothTrack(track).metrics}:null;}

// Shape-preserving cubic: continuous velocity without inventing overshoot.
// A reversal has zero tangent; every recorded instant remains exact.
function tangent(a,b){return a*b<=0?0:2*a*b/(a+b);}
export function interpolateCoordinate(prev,a,b,next,t){
  if(t===0)return a;if(t===1)return b;
  if(![prev,a,b,next].every(Number.isFinite))return a+(b-a)*t;
  const delta=b-a,m0=tangent(a-prev,delta),m1=tangent(delta,next-b),t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*a+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b+(t3-t2)*m1;
}

export function sampleMotion(track,time,{smooth=false}={}) {
  if(!track?.frames?.length)return null;
  const frames=smooth?smoothTrack(track).frames:track.frames;
  const at=Math.max(0,Math.min(frames.length-1,(Number(time)||0)*track.fps));
  const lo=Math.floor(at),hi=Math.min(frames.length-1,lo+1),t=at-lo;
  const a=frames[lo],b=frames[hi],prev=frames[Math.max(0,lo-1)],next=frames[Math.min(frames.length-1,hi+1)];
  const result={};
  for(const key of ['pose','left','right','face']) {
    if(t<1e-8){result[key]=a[key]||null;continue;}
    if(!a[key]||!b[key]){result[key]=null;continue;}
    result[key]=a[key].map((p,i)=>{
      const q=b[key][i];if(!validPoint(p)||!validPoint(q))return null;
      return p.map((v,j)=>{
        if(!Number.isFinite(v)||!Number.isFinite(q[j]))return v;
        // Visibility is confidence, not a spatial coordinate.
        if(j>2)return v+(q[j]-v)*t;
        return interpolateCoordinate(prev[key]?.[i]?.[j],v,q[j],next[key]?.[i]?.[j],t);
      });
    });
  }
  return result;
}

export function armLayers(pose) {
  const depth=(elbow,wrist)=>((pose?.[elbow]?.[2]||0)+(pose?.[wrist]?.[2]||0))/2;
  return[{side:'left',shoulder:11,elbow:13,wrist:15,depth:depth(13,15)},
    {side:'right',shoulder:12,elbow:14,wrist:16,depth:depth(14,16)}].sort((a,b)=>b.depth-a.depth);
}
