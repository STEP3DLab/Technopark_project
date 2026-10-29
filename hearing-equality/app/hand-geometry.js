// Display geometry only. XY coordinates are already projected to canvas pixels;
// landmark Z values use a different scale and must not set material thickness.
const DIGITS = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
const TAPER = [1,.94,.82,.7];
const TAU = Math.PI * 2;
const valid = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const length = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const median = values => {
  const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
};

/** One metric set shared by the forearm end and the palm base.
 * The finger radius uses adjacent MCP spacing and all 15 projected phalanges,
 * so curling fingers or an edge-on palm do not collapse surface thickness. Pixel minima keep tiny previews legible.
 * wristNormal is perpendicular to wrist -> middle MCP; its sign is immaterial.
 * Neither the source points nor their ordering are changed.
 */
export function handMetrics(points,shoulder) {
  const scale=Number.isFinite(shoulder)&&shoulder>0 ? shoulder : 1;
  const complete=points?.length===21&&points.every(valid);
  const bones=complete ? DIGITS.flatMap(ids=>ids.slice(1).map((id,i)=>length(points[ids[i]],points[id]))) : [];
  const characteristic=bones.length ? median(bones) : scale*.075;
  // MCP spacing describes the hand surface even when fingers curl back.
  // Phalanx length alone makes a fist look like separated thin wires.
  const gaps=complete?[5,9,13].map(i=>length(points[i],points[i+4])):[];
  const knuckleSpacing=gaps.length?median(gaps):0;
  const fingerRadius=clamp(Math.max(knuckleSpacing*.46,characteristic*.30),Math.max(.65,scale*.020),Math.max(.65,scale*.065));
  const palmWidth=complete ? length(points[5],points[17]) : scale*.16;
  const wristRadius=clamp(Math.max(fingerRadius*1.2,palmWidth*.2),Math.max(1.05,scale*.025),Math.max(1.05,scale*.08));
  let wristNormal=[1,0];
  if(complete) {
    let dx=points[9][0]-points[0][0],dy=points[9][1]-points[0][1];
    if(Math.hypot(dx,dy)<1e-8) {
      dx=(points[5][0]+points[9][0]+points[13][0]+points[17][0])/4-points[0][0];
      dy=(points[5][1]+points[9][1]+points[13][1]+points[17][1])/4-points[0][1];
    }
    const palmLength=Math.hypot(dx,dy);
    if(palmLength>=1e-8)wristNormal=[-dy/palmLength,dx/palmLength];
  }
  return {fingerRadius,wristRadius,wristNormal};
}

function circle(ctx,p,radius) {
  ctx.moveTo(p[0]+radius,p[1]);
  ctx.arc(p[0],p[1],radius,0,-TAU,true);
  ctx.closePath();
}

// Convex hull of two discs, with exact external tangents. Unlike a ribbon
// miter, this construction does not divide by the sum of opposing normals.
function capsule(ctx,a,b,ra,rb) {
  const distance=length(a,b);
  if(distance<=Math.abs(ra-rb)+1e-8) {
    circle(ctx,ra>=rb?a:b,Math.max(ra,rb));
    return;
  }
  const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const tangent=Math.acos(clamp((ra-rb)/distance,-1,1));
  const lower=angle+tangent,upper=angle-tangent;
  ctx.moveTo(a[0]+Math.cos(lower)*ra,a[1]+Math.sin(lower)*ra);
  ctx.lineTo(b[0]+Math.cos(lower)*rb,b[1]+Math.sin(lower)*rb);
  ctx.arc(b[0],b[1],rb,lower,upper,true);
  ctx.lineTo(a[0]+Math.cos(upper)*ra,a[1]+Math.sin(upper)*ra);
  ctx.arc(a[0],a[1],ra,upper,lower,true);
  ctx.closePath();
}

/** A single measured phalanx for depth-aware surface shading. Reuses the same
 * exact tangent construction as traceDigit and never moves the joint centres.
 */
export function tracePhalanx(ctx,a,b,startRadius,endRadius) {
  if(!valid(a)||!valid(b)||!Number.isFinite(startRadius)||!Number.isFinite(endRadius)||startRadius<=0||endRadius<=0)return false;
  capsule(ctx,a,b,startRadius,endRadius);return true;
}

/** Append the three rounded phalanges and two stable joint discs to an
 * existing path. All subpaths have the same winding, including U-bends and
 * coincident joints. Use ONE normal/nonzero fill; do not stroke the individual
 * subpaths, otherwise internal seams would become visible.
 * Does not call beginPath/fill/stroke or mutate the four recorded centres.
 * The terminal cap is centred on the recorded fingertip, just like the joints.
 */
export function traceDigit(ctx,chain,radius) {
  if(chain?.length!==4||!chain.every(valid)||!Number.isFinite(radius)||radius<=0)return false;
  const radii=TAPER.map(t=>t*radius);
  for(let i=0;i<3;i++)capsule(ctx,chain[i],chain[i+1],radii[i],radii[i+1]);
  for(let i=1;i<3;i++)circle(ctx,chain[i],radii[i]);
  return true;
}
