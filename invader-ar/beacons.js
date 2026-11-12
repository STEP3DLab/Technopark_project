// Each interior is a 5 × 5 binary code, surrounded by a one-cell black border.
const patterns = [
  ['11100','00101','01101','11010','01011'],
  ['10000','01000','11011','10111','11000'],
  ['11000','10001','11000','00110','11110'],
  ['11101','01000','10010','11010','01010'],
];
const dictionary = [];
for (let i = 0; i < patterns.length; i++) {
  let grid = patterns[i].map(row => [...row].map(Number));
  for (let turn = 0; turn < 4; turn++) {
    dictionary.push({id:i + 1, turn, bits:grid.flat().reduce((word, bit) => (word << 1) | bit, 0)});
    grid = grid.map((row, y) => row.map((_, x) => grid[4 - x][y]));
  }
}

let cache;
function buffers(w, h) {
  if (!cache || cache.w !== w || cache.h !== h) {
    const size = w * h;
    cache = {w, h, gray:new Uint8Array(size), dark:new Uint8Array(size),
      queue:new Int32Array(size), sums:new Int32Array((w + 1) * (h + 1)),
      left:new Int16Array(h), right:new Int16Array(h), hist:new Int32Array(256)};
  }
  return cache;
}

function globalCut(hist, count, sum) {
  let darkCount = 0, darkSum = 0, best = -1, cut = 100;
  for (let i = 0; i < 255; i++) {
    darkCount += hist[i]; darkSum += i * hist[i];
    const lightCount = count - darkCount;
    if (!darkCount || !lightCount) continue;
    const difference = darkSum / darkCount - (sum - darkSum) / lightCount;
    const score = darkCount * lightCount * difference * difference;
    if (score > best) { best = score; cut = i; }
  }
  return cut;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function quadFromComponent(b, count, ymin, ymax) {
  const {w, left, right, queue} = b;
  left.fill(w, ymin, ymax + 1);
  right.fill(-1, ymin, ymax + 1);
  for (let i = 0; i < count; i++) {
    const p = queue[i], y = (p / w) | 0, x = p - y * w;
    if (x < left[y]) left[y] = x;
    if (x > right[y]) right[y] = x;
  }
  const points = [];
  for (let y = ymin; y <= ymax; y++) {
    if (right[y] < 0) continue;
    points.push({x:left[y], y});
    if (right[y] > left[y]) points.push({x:right[y], y});
  }
  function append(chain, point) {
    while (chain.length > 1 && cross(chain[chain.length-2], chain[chain.length-1], point) <= 0) chain.pop();
    chain.push(point);
  }
  const lower = [], upper = [];
  for (let i = 0; i < points.length; i++) append(lower, points[i]);
  for (let i = points.length - 1; i >= 0; i--) append(upper, points[i]);
  lower.pop(); upper.pop();
  const hull = lower.concat(upper);
  while (hull.length > 4) {
    let least = Infinity, remove = 0;
    for (let i = 0, n = hull.length; i < n; i++) {
      const area = Math.abs(cross(hull[(i+n-1)%n], hull[i], hull[(i+1)%n]));
      if (area < least) { least = area; remove = i; }
    }
    hull.splice(remove, 1);
  }
  if (hull.length !== 4) return null;
  const lengths = hull.map((p, i) => Math.hypot(p.x - hull[(i+1)%4].x, p.y - hull[(i+1)%4].y));
  if (Math.min(...lengths) < 15 || Math.max(...lengths) > 5 * Math.min(...lengths)) return null;
  return hull;
}

function refineCorners(quad, b) {
  function gray(x,y) {
    const ix=Math.floor(x), iy=Math.floor(y);
    if (ix<0 || iy<0 || ix+1>=b.w || iy+1>=b.h) return NaN;
    const dx=x-ix, dy=y-iy, k=iy*b.w+ix;
    return (1-dy)*((1-dx)*b.gray[k]+dx*b.gray[k+1])+dy*((1-dx)*b.gray[k+b.w]+dx*b.gray[k+b.w+1]);
  }
  // Sample the physical ink-to-paper transition along each side. Fitting its
  // line also recovers corners rounded off by defocus and the pixel grid.
  const lines=quad.map((p,i)=>{
    const q=quad[(i+1)%4], ex=q.x-p.x, ey=q.y-p.y, length=Math.hypot(ex,ey);
    const nx=-ey/length, ny=ex/length, radius=Math.max(2,Math.min(13,Math.ceil(length*0.10)));
    const samples=[];
    for(let j=2;j<=14;j++) {
      const t=j/16, cx=p.x+t*ex, cy=p.y+t*ey;
      let best=12, offset=0;
      for(let k=-radius;k<=radius;k+=0.5) {
        const drop=gray(cx+nx*(k-.9),cy+ny*(k-.9))-gray(cx+nx*(k+.9),cy+ny*(k+.9));
        if(drop>best){best=drop;offset=k;}
      }
      if(best>12) samples.push({t,z:offset});
    }
    if(samples.length<6) return {p,dx:ex,dy:ey};
    function fit(values){
      let n=values.length,st=0,sz=0,stt=0,stz=0;
      for(const {t,z} of values){st+=t;sz+=z;stt+=t*t;stz+=t*z;}
      const slope=(n*stz-st*sz)/(n*stt-st*st);
      return {slope, start:(sz-slope*st)/n};
    }
    let line=fit(samples);
    const good=samples.filter(({t,z})=>Math.abs(z-line.start-line.slope*t)<2.5);
    if(good.length>=6) line=fit(good);
    return {p:{x:p.x+nx*line.start,y:p.y+ny*line.start},dx:ex+nx*line.slope,dy:ey+ny*line.slope};
  });
  return quad.map((p,i)=>{
    const a=lines[(i+3)%4], c=lines[i], den=a.dx*c.dy-a.dy*c.dx;
    if(Math.abs(den)<1) return p;
    const t=((c.p.x-a.p.x)*c.dy-(c.p.y-a.p.y)*c.dx)/den;
    const x=a.p.x+a.dx*t, y=a.p.y+a.dy*t;
    return Math.hypot(x-p.x,y-p.y)<Math.min(Math.hypot(a.dx,a.dy),Math.hypot(c.dx,c.dy))*0.20 ? {x,y} : p;
  });
}

function decode(quad, b) {
  const [a,c,d,e] = quad;
  const dx = a.x - c.x + d.x - e.x, dy = a.y - c.y + d.y - e.y;
  const ux = c.x - d.x, uy = c.y - d.y, vx = e.x - d.x, vy = e.y - d.y;
  const det = ux * vy - vx * uy;
  if (Math.abs(det) < 1) return null;
  const g = (dx * vy - vx * dy) / det, h = (ux * dy - dx * uy) / det;
  const ax = c.x - a.x + g * c.x, ay = c.y - a.y + g * c.y;
  const bx = e.x - a.x + h * e.x, by = e.y - a.y + h * e.y;
  function sample(col, row) {
    const u = (col + 0.5)/7, v = (row + 0.5)/7, denom = g*u + h*v + 1;
    const x = Math.round((a.x + ax*u + bx*v) / denom);
    const y = Math.round((a.y + ay*u + by*v) / denom);
    return x >= 0 && y >= 0 && x < b.w && y < b.h ? b.gray[y*b.w+x] : NaN;
  }
  const frame = [], quiet = [];
  for (let i = 1; i < 6; i++) {
    frame.push(sample(i,0),sample(6,i),sample(i,6),sample(0,i));
    quiet.push(sample(i,-1),sample(7,i),sample(i,7),sample(-1,i));
  }
  const finite = quiet.filter(Number.isFinite).sort((x,y)=>x-y);
  if (finite.length < 12) return null;
  frame.sort((x,y)=>x-y);
  const light = finite[finite.length >> 1], ink = frame[10];
  if (light - ink < 32) return null;
  const threshold = (light + ink) * 0.5;
  if (frame[17] >= threshold || finite[Math.floor(finite.length*0.20)] <= threshold) return null;
  let observed = 0;
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) {
    observed = (observed << 1) | Number(sample(x,y) < threshold);
  }
  for (const entry of dictionary) {
    let mismatch = observed ^ entry.bits, errors = 0;
    while (mismatch && errors < 3) { mismatch &= mismatch-1; errors++; }
    if (errors <= 2) {
      return {id:entry.id, errors, contrast:light-ink,
        corners:refineCorners(quad,b).map((_, i, corners) => corners[(entry.turn + i)%4])};
    }
  }
  return null;
}

function components(b, found) {
  const {w,h,dark,queue} = b, n = dark.length;
  for (let seed = 0; seed < n; seed++) {
    if (!dark[seed]) continue;
    queue[0] = seed; dark[seed] = 0;
    let count = 1, xmin = w, xmax = 0, ymin = h, ymax = 0;
    for (let read = 0; read < count; read++) {
      const p = queue[read], y = (p / w) | 0, x = p - y*w;
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      if (x && dark[p-1]) { dark[p-1]=0; queue[count++]=p-1; }
      if (x+1 < w && dark[p+1]) { dark[p+1]=0; queue[count++]=p+1; }
      if (y && dark[p-w]) { dark[p-w]=0; queue[count++]=p-w; }
      if (y+1 < h && dark[p+w]) { dark[p+w]=0; queue[count++]=p+w; }
    }
    const bw = xmax-xmin+1, bh = ymax-ymin+1;
    if (count < 70 || bw < 20 || bh < 20 || xmin===0 || ymin===0 || xmax===w-1 || ymax===h-1 ||
        Math.max(bw,bh) > 4*Math.min(bw,bh) || count > 0.96*bw*bh || count < 0.065*bw*bh) continue;
    const quad = quadFromComponent(b,count,ymin,ymax);
    const match = quad && decode(quad,b);
    if (match) {
      const old = found.get(match.id);
      if (!old || match.errors < old.errors || (match.errors === old.errors && match.contrast > old.contrast)) {
        found.set(match.id,match);
      }
    }
  }
}

// Corners always follow the *printed* top-left, top-right, bottom-right, bottom-left.
// Input/output coordinates are relative to the unmirrored source ImageData.
export function detectBeacons(imageData) {
  const srcW=imageData.width, srcH=imageData.height, src=imageData.data;
  if (Math.min(srcW,srcH)<20) return [];
  const scale = Math.min(1, 500/Math.max(srcW,srcH));
  const w=Math.round(srcW*scale), h=Math.round(srcH*scale);
  const b=buffers(w,h), {gray,dark,hist,sums}=b, stride=w+1, sx=srcW/w, sy=srcH/h;
  hist.fill(0);
  let total=0;
  for(let y=0; y<h; y++) {
    const row=Math.min(srcH-1,Math.floor((y+.5)*sy))*srcW;
    let running=0;
    for(let x=0; x<w; x++) {
      const p=(row+Math.min(srcW-1,Math.floor((x+.5)*sx)))*4;
      const luminance=(src[p]*77+src[p+1]*150+src[p+2]*29)>>8;
      gray[y*w+x]=luminance; hist[luminance]++; total+=luminance; running+=luminance;
      sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+running;
    }
  }
  const cut=globalCut(hist,w*h,total);
  for(let i=0;i<gray.length;i++) dark[i]=gray[i]<=cut ? 1:0;
  const found=new Map();
  components(b,found);
  if (found.size<4) {
    // A second, local threshold handles cards in separate pools of light.
    const r=Math.max(9,Math.round(Math.min(w,h)*0.075));
    for(let y=0;y<h;y++) {
      const y0=Math.max(0,y-r), y1=Math.min(h,y+r+1);
      for(let x=0;x<w;x++) {
        const x0=Math.max(0,x-r), x1=Math.min(w,x+r+1);
        const sum=sums[y1*stride+x1]-sums[y1*stride+x0]-sums[y0*stride+x1]+sums[y0*stride+x0];
        dark[y*w+x]=(gray[y*w+x]+9)*(y1-y0)*(x1-x0)<sum ? 1:0;
      }
    }
    components(b,found);
  }
  return [...found.values()].sort((a,b)=>a.id-b.id).map(m=>({
    id:m.id, corners:m.corners.map(p=>({x:(p.x+.5)*sx-.5,y:(p.y+.5)*sy-.5}))
  }));
}
