/** Editorial Canvas character. Measured signing landmarks remain the motion source.
 * Presentation interpolation is isolated from recognition and never overwrites assets.
 */
import { prepareMotion, sampleMotion, armLayers } from './avatar-motion.js?v=0.6';
const OUTFITS = Object.freeze({
  indigo:{body:'#343C58',light:'#414C6C',dark:'#252D46',seam:'#8494B4',accent:'#C4B9ED'},
  teal:{body:'#295655',light:'#386D68',dark:'#1D4143',seam:'#729C94',accent:'#C0DDD0'},
  slate:{body:'#404D5B',light:'#526372',dark:'#2B3846',seam:'#8D9FAB',accent:'#D9E3E5'},
});
const SKIN={base:'#EBC2A5',light:'#F5D5B9',shade:'#D5A084',line:'#9E6F5D',lip:'#AD776C'};

export class CanvasAvatar {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    if (!this.ctx) throw new Error('Canvas 2D недоступен');
    container.style.position ||= 'relative';
    container.append(this.canvas);
    this.note=document.createElement('div');
    this.note.style.cssText='position:absolute;top:12px;right:12px;max-width:46%;padding:5px 8px;border-radius:5px;background:#fffae9ed;color:#715d32;font:10px/1.4 Arial,sans-serif;pointer-events:none;';
    this.note.hidden=true;container.append(this.note);
    this.data = null;
    this.frame = null;
    this.time = 0;
    this.width = 1;
    this.height = 1;
    this.scene = 'light';
    this.outfit = 'teal';
    this.faceMap = new Map();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  valid(p) { return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]); }
  mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  distance(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  load(data) {
    this.data = data;
    this.track = prepareMotion(data);
    this.note.hidden = !this.track.missing;
    this.note.textContent = this.track.missing ? 'Есть пропуски кисти · сравните с видео' : '';
    this.container.dataset.motionQuality = this.track.missing ? 'partial' : this.track.filled ? 'interpolated' : 'recorded';
    this.faceMap = new Map((data.face_indices || []).map((id, i) => [id, i]));
    const sw = Number(data.width) || 1, sh = Number(data.height) || 1;
    const shoulders = [], centersX = [], centersY = [], points = [], crowns = [];
    const add = p => { if (this.valid(p)) points.push([p[0] * sw, p[1] * sh]); };
    for (const frame of data.frames || []) {
      const p = frame.pose || frame.pose33;
      if (this.valid(p?.[11]) && this.valid(p?.[12])) {
        centersX.push((p[11][0] + p[12][0]) * sw / 2);
        centersY.push((p[11][1] + p[12][1]) * sh / 2);
        shoulders.push(Math.hypot((p[11][0] - p[12][0]) * sw, (p[11][1] - p[12][1]) * sh));
      }
      // Frame every recorded hand, forearm and face across the entire clip.
      // Hips do not enlarge the camera: the shirt may continue below the crop.
      for (const id of [7, 8, 11, 12, 13, 14, 15, 16]) {
        if (this.valid(p?.[id]) && (p[id][3] == null || p[id][3] > .4)) add(p[id]);
      }
      for (const key of ['left', 'right', 'face']) for (const point of frame[key] || []) add(point);
      const forehead = frame.face?.[this.faceMap.get(10)];
      if (this.valid(forehead)) crowns.push(forehead[1] * sh);
    }
    const median = (a, fallback) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : fallback;
    const shoulder = Math.max(1, median(shoulders, sw / 3));
    const cx = median(centersX, sw / 2), cy = median(centersY, sh / 2);
    let minX = cx - shoulder * .64, maxX = cx + shoulder * .64;
    let minY = cy - shoulder, maxY = cy + shoulder * .94;
    for (const p of points) {
      minX = Math.min(minX, p[0] - shoulder * .055);
      maxX = Math.max(maxX, p[0] + shoulder * .055);
      minY = Math.min(minY, p[1] - shoulder * .045);
      maxY = Math.max(maxY, p[1] + shoulder * .055);
    }
    if (crowns.length) minY = Math.min(minY, Math.min(...crowns) - shoulder * .145);
    this.bounds = { sw, sh, shoulder, centerX: (minX + maxX) / 2, minX, maxX, minY, maxY };
    this.showAt(0);
  }

  setScene(theme) {
    this.scene = /dark|night|тем/i.test(String(theme)) ? 'dark' : 'light';
    this.render();
  }

  setAppearance({ outfit } = {}) {
    if (Object.hasOwn(OUTFITS, outfit)) this.outfit = outfit;
    this.render();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.visible=rect.width>=1&&rect.height>=1;
    if (!this.visible) return;
    this.width = rect.width; this.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  showAt(time) {
    this.time=Math.max(0,Number(time)||0);
    this.frame=sampleMotion(this.track,this.time);
    this.render();
  }

  project(p) {
    if (!this.valid(p) || !this.bounds) return null;
    return [this.originX + (p[0] * this.bounds.sw - this.bounds.centerX) * this.scale,
      this.originY + (p[1] * this.bounds.sh - this.bounds.minY) * this.scale, p[2] || 0];
  }

  render() {
    const c = this.ctx;
    if(!this.visible)return;
    c.clearRect(0, 0, this.width, this.height);
    if (!this.frame?.pose || !this.bounds) return;
    const pad = Math.max(9, Math.min(18, this.width * .022));
    const bw = this.bounds.maxX - this.bounds.minX, bh = this.bounds.maxY - this.bounds.minY;
    const top=this.track?.missing?Math.max(pad,42):pad;
    this.scale = Math.min(Math.max(1, this.width - pad * 2) / bw, Math.max(1, this.height - top - pad) / bh);
    this.originX = this.width / 2;
    this.originY = top + (this.height - top - pad - bh * this.scale) * .44;
    this.shoulder = this.bounds.shoulder * this.scale;
    const p = this.frame.pose.map(v => this.project(v));
    if (!p[11] || !p[12]) return;
    const face = id => this.project(this.frame.face?.[this.faceMap.get(id)]);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    this.drawStudio(p, face);
    this.drawTorso(p, face);
    this.drawHead(p, face);
    // Whole limbs are composited back to front; a distant hand must not
    // paint over the nearer forearm. Pose depth shares one coordinate frame.
    for(const layer of armLayers(this.frame.pose)) {
      const hand=this.frame[layer.side];
      const arm={a:p[layer.shoulder],b:p[layer.elbow],d:this.project(hand?.[0])||p[layer.wrist],hand};
      if(!arm.a||!arm.b||!arm.d)continue;
      this.drawArm(arm);
      if(hand)this.drawHand(hand.map(v=>this.project(v)));
    }
    c.restore();
  }

  drawStudio() {
    const c=this.ctx,dark=this.scene==='dark';
    c.fillStyle=dark?'#1D2637':'#EDF0F6';c.fillRect(0,0,this.width,this.height);
    // Quiet editorial studio. The large neutral disk gives hands contrast.
    c.beginPath();c.ellipse(this.width*.5,this.height*.45,this.width*.38,this.height*.54,0,0,Math.PI*2);
    c.fillStyle=dark?'#252F43':'#E3E7F0';c.fill();
  }

  path(points, close = false) {
    const filtered = points.filter(Boolean), c = this.ctx;
    if (filtered.length < 2) return false;
    c.beginPath(); c.moveTo(filtered[0][0], filtered[0][1]);
    for (let i = 1; i < filtered.length; i++) c.lineTo(filtered[i][0], filtered[i][1]);
    if (close) c.closePath();
    return true;
  }

  smoothPath(points, closed = true) {
    if (points.some(p => !p) || points.length < 3) return false;
    const c = this.ctx;
    c.beginPath();
    if (closed) {
      const start = this.mix(points[points.length - 1], points[0], .5);
      c.moveTo(start[0], start[1]);
      for (let i = 0; i < points.length; i++) {
        const p = points[i], next = this.mix(p, points[(i + 1) % points.length], .5);
        c.quadraticCurveTo(p[0], p[1], next[0], next[1]);
      }
      c.closePath();
    } else {
      c.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length - 1; i++) {
        const next = this.mix(points[i], points[i + 1], .5);
        c.quadraticCurveTo(points[i][0], points[i][1], next[0], next[1]);
      }
      c.lineTo(points.at(-1)[0], points.at(-1)[1]);
    }
    return true;
  }

  capsule(a, b, r1, r2, fill, stroke = null) {
    if (!a || !b) return;
    const c = this.ctx, length = this.distance(a, b) || 1;
    const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length, nx = -uy, ny = ux;
    c.beginPath();
    c.moveTo(a[0] + nx * r1, a[1] + ny * r1);
    c.bezierCurveTo(a[0] + nx * r1 + ux * length * .4, a[1] + ny * r1 + uy * length * .4,
      b[0] + nx * r2 - ux * length * .25, b[1] + ny * r2 - uy * length * .25, b[0] + nx * r2, b[1] + ny * r2);
    c.bezierCurveTo(b[0] + nx * r2 + ux * r2, b[1] + ny * r2 + uy * r2,
      b[0] - nx * r2 + ux * r2, b[1] - ny * r2 + uy * r2, b[0] - nx * r2, b[1] - ny * r2);
    c.bezierCurveTo(b[0] - nx * r2 - ux * length * .25, b[1] - ny * r2 - uy * length * .25,
      a[0] - nx * r1 + ux * length * .4, a[1] - ny * r1 + uy * length * .4, a[0] - nx * r1, a[1] - ny * r1);
    c.bezierCurveTo(a[0] - nx * r1 - ux * r1, a[1] - ny * r1 - uy * r1,
      a[0] + nx * r1 - ux * r1, a[1] + ny * r1 - uy * r1, a[0] + nx * r1, a[1] + ny * r1);
    c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = Math.max(.45, this.shoulder * .003); c.stroke(); }
  }

  skinGradient(a,b,radius) {
    const c=this.ctx,l=this.distance(a,b)||1,nx=-(b[1]-a[1])/l,ny=(b[0]-a[0])/l,m=this.mix(a,b,.5);
    const g=c.createLinearGradient(m[0]-nx*radius,m[1]-ny*radius,m[0]+nx*radius,m[1]+ny*radius);
    g.addColorStop(0,SKIN.shade);g.addColorStop(.28,SKIN.base);g.addColorStop(1,SKIN.light);return g;
  }

  drawTorso(p,face) {
    const c=this.ctx,s=this.shoulder,palette=OUTFITS[this.outfit];
    const [l,r]=[p[11],p[12]].sort((a,b)=>a[0]-b[0]);
    const cx=(l[0]+r[0])/2,cy=(l[1]+r[1])/2,chin=face(152);
    const collarY=chin?Math.min(cy-s*.065,chin[1]+s*.085):cy-s*.15;
    const nx=chin?chin[0]*.72+cx*.28:cx;
    const neckTop=chin?[chin[0],chin[1]-s*.065]:[nx,cy-s*.29];
    this.capsule(neckTop,[nx,collarY+s*.1],s*.086,s*.105,SKIN.shade);
    this.capsule([neckTop[0]-s*.018,neckTop[1]+s*.03],[nx-s*.018,collarY+s*.08],s*.068,s*.08,SKIN.base);
    const hip=p[23]&&p[24]?(p[23][0]+p[24][0])/2:cx;
    const bottom=Math.max(p[23]?.[1]||0,p[24]?.[1]||0,cy+s*1.35);
    c.beginPath();c.moveTo(nx-s*.13,collarY);
    c.bezierCurveTo(cx-s*.23,collarY,l[0]-s*.045,l[1]-s*.04,l[0]-s*.085,l[1]+s*.08);
    c.bezierCurveTo(l[0]-s*.07,l[1]+s*.35,hip-s*.43,bottom-s*.3,hip-s*.43,bottom);
    c.lineTo(hip+s*.43,bottom);
    c.bezierCurveTo(hip+s*.43,bottom-s*.3,r[0]+s*.07,r[1]+s*.35,r[0]+s*.085,r[1]+s*.08);
    c.bezierCurveTo(r[0]+s*.045,r[1]-s*.04,cx+s*.23,collarY,nx+s*.13,collarY);
    c.quadraticCurveTo(nx,collarY+s*.1,nx-s*.13,collarY);c.closePath();
    c.fillStyle=palette.body;c.fill();
    c.save();c.clip();
    c.beginPath();c.moveTo(cx+s*.21,cy);c.bezierCurveTo(cx+s*.44,cy+s*.28,cx+s*.24,bottom,hip+s*.38,bottom);c.lineTo(hip+s*.7,bottom);c.lineTo(cx+s*.7,cy);c.fillStyle=palette.dark;c.fill();
    c.beginPath();c.moveTo(cx-s*.28,cy+s*.07);c.quadraticCurveTo(cx-s*.33,cy+s*.5,hip-s*.28,bottom);c.strokeStyle=palette.light;c.lineWidth=s*.045;c.stroke();
    c.restore();
    c.beginPath();c.moveTo(nx-s*.13,collarY);c.quadraticCurveTo(nx,collarY+s*.1,nx+s*.13,collarY);
    c.strokeStyle=palette.dark;c.lineWidth=s*.038;c.stroke();
    c.beginPath();c.moveTo(nx-s*.13,collarY-s*.008);c.quadraticCurveTo(nx,collarY+s*.087,nx+s*.13,collarY-s*.008);
    c.strokeStyle=palette.seam;c.lineWidth=Math.max(.8,s*.006);c.stroke();
    c.save();c.translate(cx+s*.235,cy+s*.23);c.rotate(Math.atan2(r[1]-l[1],r[0]-l[0]));
    c.strokeStyle=palette.accent;c.lineWidth=Math.max(1,s*.011);
    for(const y of [-.02,.02]){c.beginPath();c.moveTo(-s*.036,s*y);c.lineTo(s*.036,s*y);c.stroke();}c.restore();
  }

  drawHead(p,face) {
    const c=this.ctx,s=this.shoulder,f=face(10),chin=face(152),a=face(234)||p[7],b=face(454)||p[8];
    if(!a||!b)return;
    const cx=(a[0]+b[0])/2,cy=f&&chin?(f[1]+chin[1])/2:(a[1]+b[1])/2;
    const w=Math.max(this.distance(a,b)*.55,s*.18),h=f&&chin?this.distance(f,chin)*.52:w*1.27;
    let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);if(Math.abs(angle)>Math.PI/2)angle-=Math.sign(angle)*Math.PI;
    c.save();c.translate(cx,cy);c.rotate(angle);
    // One controlled silhouette; no glossy cheeks or artificial idle motion.
    c.beginPath();c.moveTo(-w,h*.18);c.bezierCurveTo(-w*1.21,-h*.56,-w*.8,-h*1.29,w*.08,-h*1.22);c.bezierCurveTo(w*.96,-h*1.23,w*1.16,-h*.52,w,h*.18);c.closePath();c.fillStyle='#2B303A';c.fill();
    for(const side of [-1,1]){
      c.beginPath();c.ellipse(side*w*.96,h*.04,w*.16,h*.19,side*-.16,0,Math.PI*2);c.fillStyle=SKIN.shade;c.fill();
      c.beginPath();c.ellipse(side*w*.98,h*.04,w*.055,h*.09,side*-.16,-1,1.6);c.strokeStyle=SKIN.line;c.lineWidth=Math.max(.7,s*.0035);c.stroke();
    }
    c.beginPath();c.moveTo(0,-h*1.02);c.bezierCurveTo(w*.65,-h*1.04,w*1.01,-h*.6,w*.96,-h*.04);c.bezierCurveTo(w*.93,h*.4,w*.62,h*.86,w*.23,h*.98);c.quadraticCurveTo(0,h*1.05,-w*.23,h*.98);c.bezierCurveTo(-w*.62,h*.86,-w*.96,h*.4,-w*.98,-h*.04);c.bezierCurveTo(-w*1.01,-h*.65,-w*.62,-h*1.04,0,-h*1.02);c.closePath();
    c.fillStyle=SKIN.base;c.fill();c.save();c.clip();
    c.beginPath();c.moveTo(w*.49,-h*1.1);c.bezierCurveTo(w*.85,-h*.4,w*.85,h*.51,w*.08,h*1.08);c.lineTo(w*1.2,h*1.1);c.lineTo(w*1.2,-h*1.2);c.closePath();c.fillStyle=SKIN.shade;c.fill();c.restore();
    // Swept hair leaves the captured eyebrows visible.
    c.beginPath();c.moveTo(-w*.98,-h*.13);c.bezierCurveTo(-w*1.18,-h*.79,-w*.6,-h*1.35,w*.08,-h*1.24);c.bezierCurveTo(w*.8,-h*1.29,w*1.12,-h*.75,w*.97,-h*.13);c.lineTo(w*.78,-h*.64);c.quadraticCurveTo(w*.28,-h*.77,w*.1,-h*.98);c.bezierCurveTo(-w*.08,-h*.69,-w*.5,-h*.57,-w*.77,-h*.57);c.closePath();c.fillStyle='#2B303A';c.fill();
    c.beginPath();c.moveTo(-w*.86,-h*.66);c.bezierCurveTo(-w*.6,-h*1.06,-w*.12,-h*1.19,w*.24,-h*1.09);c.strokeStyle='#515762';c.lineWidth=w*.06;c.stroke();
    c.restore();
    if(!this.frame.face)return;
    this.drawEye([33,160,158,133,153,144].map(face),w);this.drawEye([263,387,385,362,373,380].map(face),w);
    for(const ids of [[70,63,105,66,107],[300,293,334,296,336]])if(this.smoothPath(ids.map(face),false)){c.strokeStyle='#35343B';c.lineWidth=Math.max(1.1,w*.052);c.stroke();}
    const nose=face(4),bridge=face(6);if(nose&&bridge){c.beginPath();c.moveTo(bridge[0],bridge[1]);c.quadraticCurveTo(nose[0]-w*.1,nose[1],nose[0]+w*.04,nose[1]+w*.035);c.strokeStyle='#B78069';c.lineWidth=Math.max(.65,w*.022);c.stroke();}
    const mouth=[61,40,37,0,267,270,291,321,314,17,84,91].map(face);
    if(this.smoothPath(mouth)){c.fillStyle=SKIN.lip;c.fill();}
    const inner=[78,81,13,311,308,402,14,178].map(face);if(this.smoothPath(inner)){c.fillStyle='#603E3D';c.fill();}
  }

  drawEye(points, headRadius) {
    if (points.some(p => !p)) return;
    const c = this.ctx, width = this.distance(points[0], points[3]);
    if (width < .3) return;
    const center = this.mix(points[0], points[3], .5);
    const opening = (this.distance(points[1], points[5]) + this.distance(points[2], points[4])) / 2;
    const rotation = Math.atan2(points[3][1] - points[0][1], points[3][0] - points[0][0]);
    c.save(); c.translate(...center); c.rotate(rotation);
    c.beginPath(); c.ellipse(0, 0, width * .57, Math.max(.8, opening * .79), 0, 0, Math.PI * 2);
    c.fillStyle = '#9b6a5424'; c.fill(); c.restore();
    // The opening is the measured eyelid contour. Irises are a static styling
    // choice, centred in that contour; the recording has no iris/gaze data.
    if (this.path(points, true)) {
      c.fillStyle = '#f8f0df'; c.fill(); c.save(); c.clip();
      const iris = c.createRadialGradient(center[0] - width * .04, center[1] - width * .04, 0, center[0], center[1], width * .225);
      iris.addColorStop(0, '#1e3734'); iris.addColorStop(.48, '#486253'); iris.addColorStop(.86, '#5c7560'); iris.addColorStop(1, '#2e443c');
      c.beginPath(); c.arc(center[0], center[1], width * .225, 0, Math.PI * 2); c.fillStyle = iris; c.fill();
      c.beginPath(); c.arc(center[0], center[1], width * .105, 0, Math.PI * 2); c.fillStyle = '#202b2b'; c.fill();
      c.beginPath(); c.arc(center[0] - width * .065, center[1] - width * .073, Math.max(.45, width * .045), 0, Math.PI * 2); c.fillStyle = '#ffffffdc'; c.fill();
      c.restore();
    }
    if (this.smoothPath(points.slice(0, 4), false)) { c.strokeStyle = '#513e32'; c.lineWidth = Math.max(.55, headRadius * .021); c.stroke(); }
    if (this.smoothPath([points[3], points[4], points[5], points[0]], false)) { c.strokeStyle = '#b1816659'; c.lineWidth = Math.max(.4, headRadius * .014); c.stroke(); }
  }

  drawArm({a,b,d,hand}) {
    const c=this.ctx,s=this.shoulder,palette=OUTFITS[this.outfit];
    const hp=hand?.map(v=>this.project(v));
    const wristRadius=hp?.[5]&&hp?.[17]?Math.max(s*.024,Math.min(s*.04,this.distance(hp[5],hp[17])*.21)):s*.03;
    const end=this.mix(b,d,.89),u=this.distance(a,b)||1,v=this.distance(b,end)||1;
    const n1=[-(b[1]-a[1])/u,(b[0]-a[0])/u],n2=[-(end[1]-b[1])/v,(end[0]-b[0])/v];
    const joint=[n1[0]+n2[0],n1[1]+n2[1]],jl=Math.hypot(...joint)||1;
    joint[0]/=jl;joint[1]/=jl;
    const offset=(p,n,r)=>[p[0]+n[0]*r,p[1]+n[1]*r];
    const ar=s*.102,br=s*.073,dr=wristRadius*1.18;
    const dl=offset(end,n2,dr),drp=offset(end,n2,-dr);
    this.capsule(end,d,wristRadius*.97,wristRadius,SKIN.base);
    // Opaque forms share one colour; rounded elbow caps overlap without seams.
    this.capsule(a,b,ar,br,palette.body);
    this.capsule(b,end,br,dr,palette.body);
    const highlight=[offset(this.mix(a,b,.14),n1,ar*.43),offset(b,joint,br*.4),offset(this.mix(b,end,.94),n2,dr*.3)];
    if(this.smoothPath(highlight,false)){c.strokeStyle=palette.light;c.lineWidth=s*.035;c.stroke();}
    c.beginPath();c.moveTo(...dl);c.lineTo(...drp);c.strokeStyle=palette.dark;c.lineWidth=Math.max(1,s*.018);c.stroke();
    const cuff=this.mix(b,end,.96);c.beginPath();c.moveTo(...offset(cuff,n2,dr));c.lineTo(...offset(cuff,n2,-dr));c.strokeStyle=palette.seam;c.lineWidth=Math.max(.6,s*.004);c.stroke();
  }

  drawHand(points) {
    if(!points||points.length!==21||points.some(p=>!p))return;
    const c=this.ctx,s=this.shoulder,pw=this.distance(points[5],points[17]),pl=this.distance(points[0],points[9]);
    const r=Math.max(.7,Math.min(s*.025,Math.max(pw*.095,pl*.07)));
    const l=pl||1;let nx=-(points[9][1]-points[0][1])/l,ny=(points[9][0]-points[0][0])/l;
    if((points[5][0]-points[17][0])*nx+(points[5][1]-points[17][1])*ny<0){nx=-nx;ny=-ny;}
    const wr=Math.max(r*1.6,Math.min(s*.04,pw*.21));
    const wl=[points[0][0]-nx*wr,points[0][1]-ny*wr],wu=[points[0][0]+nx*wr,points[0][1]+ny*wr];
    // Convex metacarpal envelope stays valid when the palm is edge-on.
    // The thumb MCP belongs to its finger, not to the palm's outer envelope.
    const candidates=[wl,points[17],points[13],points[9],points[5],points[1],wu].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lower=[],upper=[];
    for(const p of candidates){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(const p of [...candidates].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    const palm=[...lower.slice(0,-1),...upper.slice(0,-1)];
    const fill=SKIN.base,outline=SKIN.line;
    if(this.path(palm,true)){c.fillStyle=fill;c.fill();c.lineWidth=r*1.55;c.strokeStyle=fill;c.stroke();}
    // Paint each complete digit as one connected, tapered ribbon. Joint caps
    // are internal to the same path, eliminating triangular phalanx seams.
    const fingers=[{ids:[1,2,3,4],f:1.12},{ids:[5,6,7,8],f:1},{ids:[9,10,11,12],f:1.02},{ids:[13,14,15,16],f:.94},{ids:[17,18,19,20],f:.8}].sort((a,b)=>points[b.ids[2]][2]-points[a.ids[2]][2]);
    for(const finger of fingers){
      const chain=finger.ids.map(i=>points[i]),radius=r*finger.f;
      const normals=chain.slice(0,3).map((p,i)=>{const q=chain[i+1],l=this.distance(p,q)||1;return[-(q[1]-p[1])/l,(q[0]-p[0])/l]});
      const left=[],right=[];
      for(let j=0;j<4;j++){
        let n=j===0?normals[0]:j===3?normals[2]:[normals[j-1][0]+normals[j][0],normals[j-1][1]+normals[j][1]];
        const len=Math.hypot(...n)||1;n=[n[0]/len,n[1]/len];
        const rr=radius*[1,.94,.82,.7][j];
        left.push([chain[j][0]+n[0]*rr,chain[j][1]+n[1]*rr]);right.push([chain[j][0]-n[0]*rr,chain[j][1]-n[1]*rr]);
      }
      if(this.smoothPath([...left,...right.reverse()])){
        c.fillStyle=this.skinGradient(chain[0],chain[3],radius);c.fill();
        c.strokeStyle=outline+'91';c.lineWidth=Math.max(.45,r*.13);c.stroke();
      }
      for(let j=1;j<3;j++){
        const p=chain[j],pre=chain[j-1],post=chain[j+1],len=this.distance(pre,post)||1,px=-(post[1]-pre[1])/len,py=(post[0]-pre[0])/len,rr=radius*(j===1?.6:.43);
        c.beginPath();c.moveTo(p[0]-px*rr,p[1]-py*rr);c.quadraticCurveTo(p[0]+(post[0]-p[0])*.05,p[1]+(post[1]-p[1])*.05,p[0]+px*rr,p[1]+py*rr);c.strokeStyle=outline+'75';c.lineWidth=Math.max(.45,r*.12);c.stroke();
      }
      const tip=chain[3],base=chain[2],tipLength=this.distance(base,tip);
      if(tipLength>r*1.2){const nail=this.mix(base,tip,.76);c.save();c.translate(...nail);c.rotate(Math.atan2(tip[1]-base[1],tip[0]-base[0]));c.beginPath();c.ellipse(0,0,Math.min(tipLength*.2,r*.85),r*.42,0,0,Math.PI*2);c.fillStyle='#F6D7C1';c.fill();c.restore();}
    }
    const center=this.mix(points[0],points[9],.52);c.beginPath();c.moveTo(points[1][0],points[1][1]);c.quadraticCurveTo(center[0],center[1],points[17][0],points[17][1]);c.strokeStyle=outline+'70';c.lineWidth=Math.max(.5,r*.14);c.stroke();
  }

  clear() {
    this.data = null; this.track = null; this.frame = null; this.bounds = null; this.note.hidden=true;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
  dispose() { this.resizeObserver.disconnect(); this.clear(); this.canvas.remove(); this.note.remove(); }
}
