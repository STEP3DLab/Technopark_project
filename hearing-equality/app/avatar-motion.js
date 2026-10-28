// Display-only interpolation. Source frames and recognition templates stay intact.
export const validPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const completeHand = points => points?.length === 21 && points.every(validPoint);
const lerp = (a,b,t) => a.map((p,i)=>p.map((v,j)=>Number.isFinite(v)&&Number.isFinite(b[i]?.[j])?v+(b[i][j]-v)*t:v));
const distance = (a,b,w,h) => Math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h);

export function prepareMotion(data) {
  const frames=(data.frames||[]).map(f=>({...f,pose:f.pose||f.pose33}));
  const width=Number(data.width)||1,height=Number(data.height)||1;
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
  return{frames,filled,missing,fps:Number(data.fps)||30};
}

// Shape-preserving cubic: continuous velocity without inventing overshoot.
// A reversal has zero tangent; every recorded instant remains exact.
function tangent(a,b){return a*b<=0?0:2*a*b/(a+b);}
export function interpolateCoordinate(prev,a,b,next,t){
  if(t===0)return a;if(t===1)return b;
  if(![prev,a,b,next].every(Number.isFinite))return a+(b-a)*t;
  const delta=b-a,m0=tangent(a-prev,delta),m1=tangent(delta,next-b),t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*a+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b+(t3-t2)*m1;
}

export function sampleMotion(track,time) {
  const frames=track?.frames;if(!frames?.length)return null;
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
