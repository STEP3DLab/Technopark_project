/** Display-only hand surfaces. Measured joint centres are never moved.
 * All dimensions come from the same metrics used by the forearm endpoint.
 * Depth is used only for compositing, never as a pixel/material dimension.
 */
import { handMetrics, traceDigit, tracePhalanx } from './hand-geometry.js?v=0.15.0';

const DIGITS = [
  { ids: [1,2,3,4], width: 1.10 },
  { ids: [5,6,7,8], width: 1 },
  { ids: [9,10,11,12], width: 1.035 },
  { ids: [13,14,15,16], width: .96 },
  { ids: [17,18,19,20], width: .82 },
];
const FALLBACK_SKIN = {base:'#DEC0A8',light:'#F0D8C2',shade:'#B89178',line:'#795744'};
const valid = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const length = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
const mix = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const depth = p => Number.isFinite(p[2]) ? p[2] : 0;
const colorCache = new Map();

function rgb(color,fallback) {
  const key=typeof color==='string'?color:fallback;
  if(colorCache.has(key))return colorCache.get(key);
  let value;
  const hex=key.match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
  if(hex){const raw=hex[1].length===3?[...hex[1]].map(v=>v+v).join(''):hex[1].slice(0,6);value=[0,2,4].map(i=>parseInt(raw.slice(i,i+2),16));}
  else {
    const functional=key.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    value=functional?functional.slice(1,4).map(n=>clamp(Number(n),0,255)):rgb(fallback,fallback);
  }
  colorCache.set(key,value);return value;
}

/** Continuous matte-cylinder lighting shared with the forearms.
 * The geometric normal never changes sign to chase the light: each fixed
 * point on the cylinder receives a smooth diffuse value as the limb turns.
 * Palette colors may use hexadecimal or numeric rgb()/rgba() notation.
 */
export function skinMaterial(ctx,a,b,radius,skin=FALLBACK_SKIN) {
  const start=valid(a)?a:[0,0],end=valid(b)?b:start;
  const l=length(start,end),m=mix(start,end,.5);
  const nx=l>1e-8?-(end[1]-start[1])/l:1,ny=l>1e-8?(end[0]-start[0])/l:0;
  const lightDot=nx*-.65+ny*-.76;
  const r=Number.isFinite(radius)?Math.max(.25,radius):.25;
  const gradient=ctx.createLinearGradient(m[0]-nx*r,m[1]-ny*r,m[0]+nx*r,m[1]+ny*r);
  for(const position of [0,.16,.34,.5,.66,.84,1]){
    gradient.addColorStop(position,`rgb(${skinTone(position,lightDot,skin).join(',')})`);
  }
  return gradient;
}

function skinTone(position,lightDot,skin) {
  const base=rgb(skin?.base,FALLBACK_SKIN.base),light=rgb(skin?.light,FALLBACK_SKIN.light),shade=rgb(skin?.shade,FALLBACK_SKIN.shade);
  const across=position*2-1,facing=Math.sqrt(Math.max(0,1-across*across));
  const diffuse=.62*facing+.38*across*lightDot;
  // Broad low-contrast diffuse shading; no narrow specular stripe.
  const lightWeight=Math.max(0,diffuse)*.40;
  const shadeWeight=(.12+.26*Math.max(0,-diffuse))*(1-facing*.35);
  return base.map((value,i)=>Math.round(value*(1-lightWeight-shadeWeight)+light[i]*lightWeight+shade[i]*shadeWeight));
}

function palmToneAt(a,b,radius,p,skin) {
  const l=length(a,b),m=mix(a,b,.5),nx=l>1e-8?-(b[1]-a[1])/l:1,ny=l>1e-8?(b[0]-a[0])/l:0;
  const position=clamp(.5+((p[0]-m[0])*nx+(p[1]-m[1])*ny)/(2*radius),0,1);
  return skinTone(position,nx*-.65+ny*-.76,skin);
}

function convexHull(points) {
  const sorted=points.map(p=>[p[0],p[1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lower=[],upper=[];
  for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}

function palmOutline(points,r,wr,normal) {
  const [nx,ny]=normal,axis=[ny,-nx],wrist=points[0];
  // The wrist is exactly the forearm width. Only the knuckles and thenar pad
  // receive a surface envelope; an outline stroke must not inflate the wrist.
  const envelope=[[wrist[0]-nx*wr,wrist[1]-ny*wr],[wrist[0]+nx*wr,wrist[1]+ny*wr]];
  for(const [id,width] of [[1,1.04],[5,.87],[9,.90],[13,.84],[17,.72]]){
    const p=points[id],radius=r*width;
    envelope.push([p[0]+nx*radius,p[1]+ny*radius],[p[0]-nx*radius,p[1]-ny*radius],
      [p[0]+axis[0]*radius*.55,p[1]+axis[1]*radius*.55],
      [p[0]-axis[0]*radius*.55,p[1]-axis[1]*radius*.55]);
  }
  return convexHull(envelope);
}

function roundedContour(ctx,vertices,radius) {
  if(vertices.length<3)return false;
  const corners=vertices.map((p,i)=>{
    const before=vertices[(i+vertices.length-1)%vertices.length],after=vertices[(i+1)%vertices.length];
    const incoming=length(p,before),outgoing=length(p,after);
    const cut=Math.min(radius,incoming*.27,outgoing*.27);
    return {p,entry:mix(p,before,incoming>1e-8?cut/incoming:0),exit:mix(p,after,outgoing>1e-8?cut/outgoing:0)};
  });
  ctx.moveTo(...corners[0].entry);
  for(let i=0;i<corners.length;i++){
    const corner=corners[i];
    if(i)ctx.lineTo(...corner.entry);
    ctx.quadraticCurveTo(...corner.p,...corner.exit);
  }
  ctx.lineTo(...corners[0].entry);ctx.closePath();
  return true;
}

function jointCreases(ctx,chain,radius,skin) {
  if(radius<1.25)return;
  for(let i=1;i<3;i++){
    const a=chain[i-1],p=chain[i],b=chain[i+1],la=length(a,p),lb=length(p,b);
    if(la<radius*.35||lb<radius*.35)continue;
    const ax=(p[0]-a[0])/la,ay=(p[1]-a[1])/la,bx=(b[0]-p[0])/lb,by=(b[1]-p[1])/lb;
    const bend=(1-clamp(ax*bx+ay*by,-1,1))/2;
    if(bend<.09)continue;
    const nx=-by,ny=bx,span=radius*(i===1?.47:.35),offset=radius*.075;
    const parentAlpha=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
    ctx.save();ctx.globalAlpha=parentAlpha*(.10+bend*.12);
    ctx.beginPath();ctx.moveTo(p[0]-nx*span,p[1]-ny*span);
    ctx.quadraticCurveTo(p[0]+bx*offset,p[1]+by*offset,p[0]+nx*span*.8,p[1]+ny*span*.8);
    ctx.strokeStyle=skin.line;ctx.lineWidth=Math.max(.28,radius*.075);ctx.stroke();ctx.restore();
  }
}

function paintDigit(ctx,digit,skin) {
  const {chain,radius,rootTone}=digit;
  const material=skinMaterial(ctx,chain[0],chain[1],radius,skin);
  fillRootBlend(ctx,chain,radius,()=>traceDigit(ctx,chain,radius),material,rootTone);
  paintPhalanxSurfaces(ctx,chain,radius,skin,rootTone);
  jointCreases(ctx,chain,radius,skin);
}

function fillRootBlend(ctx,chain,radius,trace,fill,rootTone) {
  const a=chain[0],b=chain[1],l=length(a,b);
  ctx.beginPath();trace();ctx.fillStyle=fill;ctx.fill();
  if(l<1e-8)return;
  const ux=(b[0]-a[0])/l,uy=(b[1]-a[1])/l;
  const fade=Math.min(radius*1.85,Math.max(radius*.7,l*.26));
  // Blend the joint back into its local palm tone with one alpha gradient.
  // Filling the existing path avoids repeated clipped strips at every MCP.
  const blend=ctx.createLinearGradient(a[0],a[1],a[0]+ux*fade,a[1]+uy*fade),color=rootTone.join(',');
  for(const [position,opacity] of [[0,1],[.25,.84375],[.5,.5],[.75,.15625],[1,0]])blend.addColorStop(position,`rgba(${color},${opacity})`);
  ctx.fillStyle=blend;ctx.fill();
}

function paintPhalanxSurfaces(ctx,chain,radius,skin,rootTone) {
  const total=length(chain[0],chain[1])+length(chain[1],chain[2])+length(chain[2],chain[3]);
  const curl=total>1e-8?1-length(chain[0],chain[3])/total:0;
  if(curl<.18||radius<1.2)return;
  const taper=[1,.94,.82,.7],line=rgb(skin.line,FALLBACK_SKIN.line);
  const parts=[0,1,2].map(i=>({i,z:(depth(chain[i])+depth(chain[i+1]))/2})).sort((a,b)=>b.z-a.z||a.i-b.i);
  ctx.save();
  ctx.beginPath();traceDigit(ctx,chain,radius);ctx.clip();
  for(const {i} of parts){
    // The initial material already covers the nearest-to-palm phalanx when
    // it is the back layer. Avoid repainting it or adding a collar at the MCP.
    if(i===0&&parts[0].i===0)continue;
    const a=chain[i],b=chain[i+1],ra=radius*taper[i],rb=radius*taper[i+1];
    ctx.save();
    // A low-opacity contact layer stays inside the original digit union.
    // Their excess can therefore shade only an overlapping phalanx. Avoid
    // Canvas shadowBlur: it costs several milliseconds on small folded hands.
    const parentAlpha=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
    for(const [spread,opacity] of i===0?[]:[[.11,.08]]){
      ctx.globalAlpha=parentAlpha*opacity*curl;
      ctx.beginPath();tracePhalanx(ctx,a,b,ra+radius*spread,rb+radius*spread);
      ctx.fillStyle=`rgb(${line.join(',')})`;ctx.fill();
    }
    ctx.globalAlpha=parentAlpha;
    const fill=skinMaterial(ctx,a,b,Math.max(ra,rb),skin);
    if(i===0)fillRootBlend(ctx,chain,radius,()=>tracePhalanx(ctx,a,b,ra,rb),fill,rootTone);
    else {ctx.beginPath();tracePhalanx(ctx,a,b,ra,rb);ctx.fillStyle=fill;ctx.fill();}
    ctx.restore();
  }
  ctx.restore();
}

function palmVolume(ctx,points,palm,r,skin) {
  ctx.save();ctx.beginPath();roundedContour(ctx,palm,r*1.15);ctx.clip();
  const light=rgb(skin.light,FALLBACK_SKIN.light),shade=rgb(skin.shade,FALLBACK_SKIN.shade);
  const thenar=mix(points[0],points[1],.73),outer=mix(points[0],points[17],.62);
  const radius=Math.max(r*2.15,length(points[0],points[1])*.66);
  const lift=ctx.createRadialGradient(thenar[0]-radius*.22,thenar[1]-radius*.24,radius*.04,thenar[0],thenar[1],radius);
  lift.addColorStop(0,`rgba(${light.join(',')},.28)`);lift.addColorStop(.62,`rgba(${light.join(',')},.10)`);lift.addColorStop(1,`rgba(${light.join(',')},0)`);
  ctx.fillStyle=lift;ctx.fillRect(thenar[0]-radius,thenar[1]-radius,radius*2,radius*2);
  const fall=ctx.createRadialGradient(outer[0],outer[1],0,outer[0],outer[1],radius*1.08);
  fall.addColorStop(0,`rgba(${shade.join(',')},.13)`);fall.addColorStop(1,`rgba(${shade.join(',')},0)`);
  ctx.fillStyle=fall;ctx.fillRect(outer[0]-radius*1.08,outer[1]-radius*1.08,radius*2.16,radius*2.16);
  ctx.restore();
}

function digitLayers(points) {
  const palmDepth=median([0,5,9,13,17].map(id=>depth(points[id])));
  const allDepths=points.map(depth),span=Math.max(...allDepths)-Math.min(...allDepths);
  const tolerance=Math.max(1e-7,span*.055);
  // Three distal joints are more stable than one noisy DIP measurement.
  const digits=DIGITS.map((digit,index)=>({...digit,index,depth:median(digit.ids.slice(1).map(id=>depth(points[id])))}));
  digits.sort((a,b)=>b.depth-a.depth||a.index-b.index);
  // Near-equal depths share a stable anatomical order. This avoids a visible
  // repaint jump on every tiny z change while allowing genuine crossings.
  const sorted=[];
  for(let i=0;i<digits.length;){
    const group=[digits[i]],start=digits[i].depth;i++;
    while(i<digits.length&&start-digits[i].depth<=tolerance)group.push(digits[i++]);
    group.sort((a,b)=>a.index-b.index);sorted.push(...group);
  }
  return sorted.map(digit=>{
    const t=clamp((digit.depth-palmDepth+tolerance)/(tolerance*2),0,1);
    // Depth close to the palm is uncertain. A narrow continuous transition
    // changes occlusion only, not the position or thickness of any finger.
    const reliability=clamp(span/1e-4,0,1),depthTrust=reliability*reliability*(3-2*reliability);
    const frontWeight=1-t*t*(3-2*t)*depthTrust;
    return {...digit,frontWeight};
  });
}

/** Geometry/compositing description, separate from Canvas state. This makes
 * the wrist contract and depth transitions inspectable without moving joints.
 */
export function handSurfacePlan(points,shoulder) {
  if(points?.length!==21||!points.every(valid))return null;
  const metrics=handMetrics(points,shoulder);
  return {...metrics,palm:palmOutline(points,metrics.fingerRadius,metrics.wristRadius,metrics.wristNormal),layers:digitLayers(points)};
}

/** Paint one hand on an already projected canvas.
 * Returns false without drawing for a missing/incomplete hand. The canvas
 * state and all input landmarks are preserved, including degenerate poses.
 */
export function paintHand(ctx,points,shoulder,skin=FALLBACK_SKIN) {
  if(!ctx||points?.length!==21||!points.every(valid))return false;
  const palette={...FALLBACK_SKIN,...skin};
  const {fingerRadius:r,palm,layers:plan}=handSurfacePlan(points,shoulder);
  const breadth=Math.max(r*2,length(points[5],points[17])*.58);
  const layers=plan.map(digit=>({...digit,chain:digit.ids.map(id=>points[id]),radius:r*digit.width,
    rootTone:palmToneAt(points[0],points[9],breadth,points[digit.ids[0]],palette)}));
  const palmFill=skinMaterial(ctx,points[0],points[9],breadth,palette);
  ctx.save();
  try {
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    // One nonzero foundation joins all five digits to the palm material.
    // Only genuinely uncertain depths require surfaces on both palm sides.
    ctx.beginPath();
    for(const digit of layers)traceDigit(ctx,digit.chain,digit.radius);
    ctx.fillStyle=palmFill;ctx.fill();
    for(const digit of layers)if(digit.frontWeight<1)paintDigit(ctx,digit,palette);
    ctx.beginPath();
    if(roundedContour(ctx,palm,r*1.15)){
      ctx.fillStyle=palmFill;ctx.fill();
      palmVolume(ctx,points,palm,r,palette);
    }
    const parentAlpha=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
    for(const digit of layers){
      if(digit.frontWeight<=0)continue;
      ctx.save();ctx.globalAlpha=parentAlpha*digit.frontWeight;
      paintDigit(ctx,digit,palette);ctx.restore();
    }
  } finally {ctx.restore();}
  return true;
}
