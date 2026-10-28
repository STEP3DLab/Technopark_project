/** Sculptural digital character. Measured signing landmarks remain the motion source.
 * Presentation interpolation is isolated from recognition and never overwrites assets.
 */
import { prepareMotion, sampleMotion, armLayers } from './avatar-motion.js?v=0.6';
import { handMetrics, traceDigit } from './hand-geometry.js?v=0.9';
const OUTFITS = Object.freeze({
  indigo:{body:'#243B71',light:'#5879B0',dark:'#0E1C3E',seam:'#94B3E5',accent:'#FFFFFF'},
  teal:{body:'#295655',light:'#386D68',dark:'#1D4143',seam:'#729C94',accent:'#C0DDD0'},
  slate:{body:'#404D5B',light:'#526372',dark:'#2B3846',seam:'#8D9FAB',accent:'#D9E3E5'},
});
const SKIN={base:'#E5EBF2',light:'#F7F9FC',shade:'#B1C1D4',line:'#607793'};

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
    this.sampledTime = null;
    this.onWindowResize = () => this.resize();
    window.addEventListener?.('resize', this.onWindowResize);
    this.onDprChange = () => { this.resize(); this.watchDpr(); };
    this.watchDpr();
    this.resize();
  }

  valid(p) { return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]); }
  mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  distance(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  load(data) {
    this.data = data;
    this.frame = null; this.sampledTime = null;
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

  watchDpr() {
    this.dprQuery?.removeEventListener?.('change', this.onDprChange);
    this.dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery?.addEventListener?.('change', this.onDprChange, {once:true});
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const wasVisible = this.visible;
    this.visible = rect.width >= 1 && rect.height >= 1;
    if (!this.visible) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(rect.width * dpr), bh = Math.round(rect.height * dpr);
    const changed = this.width !== rect.width || this.height !== rect.height || this.dpr !== dpr;
    if (!changed && wasVisible) return;
    this.width = rect.width; this.height = rect.height; this.dpr = dpr;
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sampleFrame(); this.render();
  }

  sampleFrame() {
    if (this.sampledTime === this.time && this.frame) return;
    this.frame = sampleMotion(this.track, this.time);
    this.sampledTime = this.time;
  }

  showAt(time) {
    this.time = Math.max(0, Number(time) || 0);
    if (!this.visible || (this.sampledTime === this.time && this.frame)) return;
    this.sampleFrame(); this.render();
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
    const c=this.ctx,dark=this.scene==='dark',w=this.width,h=this.height;
    const g=c.createRadialGradient(w*.43,h*.2,0,w*.5,h*.35,Math.max(w,h)*.8);
    g.addColorStop(0,dark?'#405A88':'#FFFFFF');
    g.addColorStop(.5,dark?'#283F68':'#E8EFF7');
    g.addColorStop(1,dark?'#132440':'#CFDCEB');
    c.fillStyle=g;c.fillRect(0,0,w,h);
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
    const c=this.ctx,l=this.distance(a,b)||1,m=this.mix(a,b,.5);
    let nx=-(b[1]-a[1])/l,ny=(b[0]-a[0])/l;
    // The lit side always faces the same upper-left studio light.
    if(nx*.65+ny*.76<0){nx=-nx;ny=-ny;}
    const g=c.createLinearGradient(m[0]-nx*radius,m[1]-ny*radius,m[0]+nx*radius,m[1]+ny*radius);
    g.addColorStop(0,SKIN.base);g.addColorStop(.3,SKIN.light);g.addColorStop(.68,SKIN.base);g.addColorStop(1,SKIN.shade);
    return g;
  }

  drawTorso(p,face) {
    const c=this.ctx,s=this.shoulder,palette=OUTFITS[this.outfit];
    const [l,r]=[p[11],p[12]].sort((a,b)=>a[0]-b[0]);
    const cx=(l[0]+r[0])/2,cy=(l[1]+r[1])/2,chin=face(152);
    const collarY=chin?Math.min(cy-s*.065,chin[1]+s*.085):cy-s*.15;
    const nx=chin?chin[0]*.72+cx*.28:cx;
    const neckTop=chin?[chin[0],chin[1]-s*.065]:[nx,cy-s*.29];
    this.capsule(neckTop,[nx,collarY+s*.12],s*.086,s*.1,this.skinGradient(neckTop,[nx,collarY],s*.09));
    const hip=p[23]&&p[24]?(p[23][0]+p[24][0])/2:cx;
    const bottom=Math.max(p[23]?.[1]||0,p[24]?.[1]||0,cy+s*1.35,this.height+s*.2);
    c.beginPath();c.moveTo(nx-s*.14,collarY);
    c.bezierCurveTo(cx-s*.3,collarY-s*.005,l[0]-s*.09,l[1]-s*.065,l[0]-s*.12,l[1]+s*.1);
    c.bezierCurveTo(l[0]-s*.1,l[1]+s*.36,hip-s*.4,bottom-s*.4,hip-s*.42,bottom);
    c.lineTo(hip+s*.42,bottom);
    c.bezierCurveTo(hip+s*.4,bottom-s*.4,r[0]+s*.1,r[1]+s*.36,r[0]+s*.12,r[1]+s*.1);
    c.bezierCurveTo(r[0]+s*.09,r[1]-s*.065,cx+s*.3,collarY-s*.005,nx+s*.14,collarY);
    c.quadraticCurveTo(nx,collarY+s*.09,nx-s*.14,collarY);c.closePath();
    const suit=c.createRadialGradient(cx-s*.32,cy-s*.05,s*.08,cx,cy+s*.25,s*1.4);
    suit.addColorStop(0,palette.light);suit.addColorStop(.5,palette.body);suit.addColorStop(1,palette.dark);
    c.fillStyle=suit;c.fill();
    c.save();c.clip();
    const side=c.createLinearGradient(cx-s*.6,cy,cx+s*.6,cy);
    side.addColorStop(0,'#FFFFFF00');side.addColorStop(.6,'#08182B00');side.addColorStop(1,'#08182B52');
    c.fillStyle=side;c.fillRect(cx-s*.7,cy-s*.4,s*1.4,bottom-cy+s*.5);
    c.restore();
    c.beginPath();c.moveTo(nx-s*.14,collarY);c.quadraticCurveTo(nx,collarY+s*.09,nx+s*.14,collarY);
    c.strokeStyle=palette.dark;c.lineWidth=s*.025;c.stroke();
    c.beginPath();c.moveTo(nx-s*.14,collarY-s*.006);c.quadraticCurveTo(nx,collarY+s*.075,nx+s*.14,collarY-s*.006);
    c.strokeStyle=palette.seam+'A0';c.lineWidth=Math.max(.6,s*.005);c.stroke();
  }

  drawHead(p,face) {
    const c=this.ctx,s=this.shoulder,f=face(10),chin=face(152),a=face(234)||p[7],b=face(454)||p[8];
    if(!a||!b)return;
    const cx=(a[0]+b[0])/2,cy=f&&chin?(f[1]+chin[1])/2:(a[1]+b[1])/2;
    const w=Math.max(this.distance(a,b)*.57,s*.18),h=f&&chin?this.distance(f,chin)*.55:w*1.28;
    let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);if(Math.abs(angle)>Math.PI/2)angle-=Math.sign(angle)*Math.PI;
    c.save();c.translate(cx,cy);c.rotate(angle);
    // A deliberately non-photoreal ceramic shell. No pasted portrait or hair.
    for(const side of [-1,1]){
      const ear=c.createLinearGradient(side*w*.86,0,side*w*1.14,0);ear.addColorStop(0,'#829BB8');ear.addColorStop(.5,'#DCE8F2');ear.addColorStop(1,'#627C9E');
      c.beginPath();c.ellipse(side*w*.99,h*.02,w*.14,h*.22,side*-.05,0,Math.PI*2);c.fillStyle=ear;c.fill();
      c.beginPath();c.ellipse(side*w*1.02,h*.02,w*.035,h*.11,0,0,Math.PI*2);c.fillStyle='#34527D';c.fill();
    }
    c.beginPath();c.moveTo(0,-h*1.09);c.bezierCurveTo(w*.79,-h*1.09,w*1.05,-h*.68,w,-h*.06);c.bezierCurveTo(w*.97,h*.45,w*.64,h*.94,w*.23,h*1.02);c.quadraticCurveTo(0,h*1.08,-w*.23,h*1.02);c.bezierCurveTo(-w*.64,h*.94,-w*.97,h*.45,-w,-h*.06);c.bezierCurveTo(-w*1.05,-h*.68,-w*.79,-h*1.09,0,-h*1.09);c.closePath();
    const shell=c.createRadialGradient(-w*.35,-h*.48,w*.06,0,-h*.08,h*1.35);
    shell.addColorStop(0,'#F8FAFC');shell.addColorStop(.46,'#E9EFF5');shell.addColorStop(.72,'#D2DEEA');shell.addColorStop(1,'#9AAFC5');c.fillStyle=shell;c.fill();
    c.save();c.clip();
    c.beginPath();c.moveTo(-w*.85,-h*.71);c.bezierCurveTo(-w*.56,-h*.98,w*.1,-h*1.05,w*.57,-h*.79);c.strokeStyle='#FFFFFFA0';c.lineWidth=w*.04;c.stroke();
    c.beginPath();c.moveTo(w*.79,-h*.52);c.bezierCurveTo(w*.95,h*.13,w*.52,h*.82,w*.1,h*.95);c.strokeStyle='#7C98B12A';c.lineWidth=w*.16;c.stroke();
    c.restore();
    // A thin matte shell leaves the measured facial features unobstructed.
    c.beginPath();c.moveTo(-w*.79,-h*.61);
    c.bezierCurveTo(-w*.63,-h*.88,w*.61,-h*.88,w*.79,-h*.59);
    c.bezierCurveTo(w*.95,-h*.04,w*.72,h*.67,w*.3,h*.86);
    c.quadraticCurveTo(0,h*.96,-w*.3,h*.86);
    c.bezierCurveTo(-w*.73,h*.67,-w*.95,-h*.04,-w*.79,-h*.61);c.closePath();
    const visor=c.createLinearGradient(-w,-h,w,h);
    visor.addColorStop(0,'#3F5879');visor.addColorStop(.45,'#223B5C');visor.addColorStop(1,'#142944');
    c.fillStyle=visor;c.fill();c.strokeStyle='#E3F2FF40';c.lineWidth=Math.max(.6,w*.012);c.stroke();
    c.restore();
    if(!this.frame.face)return;
    this.drawEye([33,160,158,133,153,144].map(face),w);
    this.drawEye([263,387,385,362,373,380].map(face),w);
    for(const ids of [[70,63,105,66,107],[300,293,334,296,336]]){
      if(this.smoothPath(ids.map(face),false)){c.strokeStyle='#B6CADF';c.lineWidth=Math.max(.8,w*.052);c.stroke();}
    }
    const nose=face(4),bridge=face(6);
    if(nose&&bridge){
      c.beginPath();c.moveTo(bridge[0],bridge[1]);
      c.quadraticCurveTo(nose[0]-w*.045,nose[1]-w*.08,nose[0]-w*.105,nose[1]);
      c.quadraticCurveTo(nose[0],nose[1]+w*.055,nose[0]+w*.09,nose[1]);c.closePath();
      const shade=c.createLinearGradient(nose[0]-w*.12,0,nose[0]+w*.1,0);
      shade.addColorStop(0,'#294460');shade.addColorStop(.48,'#7890A9');shade.addColorStop(1,'#3B5573');
      c.fillStyle=shade;c.fill();
    }
    // Continuous outer and inner mouth contours: no threshold, invented smile,
    // gaze or blinking. Only recorded landmarks drive the expression.
    const outer=[61,40,37,0,267,270,291,321,314,17,84,91].map(face);
    if(this.smoothPath(outer)){c.fillStyle='#617B98';c.fill();c.strokeStyle='#91A8C0';c.lineWidth=Math.max(.45,w*.016);c.stroke();}
    const inner=[78,81,13,311,308,402,14,178].map(face);
    if(this.smoothPath(inner)){c.fillStyle='#10243C';c.fill();}
  }

  drawEye(points,headRadius) {
    if(points.some(p=>!p))return;
    const c=this.ctx;
    if(this.path(points,true)){c.fillStyle='#CBDCEB';c.fill();}
    // The contour can close completely; no minimum opening or fabricated iris.
    if(this.smoothPath(points.slice(0,4),false)){c.strokeStyle='#B9CFE3';c.lineWidth=Math.max(.4,headRadius*.017);c.stroke();}
  }

  drawArm({a,b,d,hand}) {
    const c=this.ctx,s=this.shoulder,palette=OUTFITS[this.outfit];
    const hp=hand?.map(v=>this.project(v));
    const wristRadius=hp?handMetrics(hp,s).wristRadius:s*.035;
    const upperRadius=s*.118,elbowRadius=s*.073;
    // Round connections share the measured elbow and wrist centres.
    this.capsule(a,b,upperRadius,elbowRadius,this.skinGradient(a,b,upperRadius));
    c.beginPath();c.arc(b[0],b[1],elbowRadius,0,Math.PI*2);
    c.fillStyle=this.skinGradient(b,d,elbowRadius);c.fill();
    this.capsule(b,d,elbowRadius,wristRadius,this.skinGradient(b,d,elbowRadius));
    c.beginPath();c.arc(d[0],d[1],wristRadius,0,Math.PI*2);
    c.fillStyle=this.skinGradient(b,d,elbowRadius);c.fill();
    const sleeveEnd=this.mix(a,b,.34);
    const sleeve=c.createLinearGradient(a[0]-upperRadius,a[1]-upperRadius,a[0]+upperRadius,a[1]+upperRadius);
    sleeve.addColorStop(0,palette.light);sleeve.addColorStop(.45,palette.body);sleeve.addColorStop(1,palette.dark);
    this.capsule(a,sleeveEnd,upperRadius*1.045,upperRadius*.8,sleeve);
  }

  drawHand(points) {
    if(!points||points.length!==21||points.some(p=>!p))return;
    const c=this.ctx,s=this.shoulder,pw=this.distance(points[5],points[17]);
    const {fingerRadius:r,wristRadius:wr,wristNormal:[nx,ny]}=handMetrics(points,s);
    const wl=[points[0][0]-nx*wr,points[0][1]-ny*wr],wu=[points[0][0]+nx*wr,points[0][1]+ny*wr];
    const candidates=[wl,points[17],points[13],points[9],points[5],points[1],wu].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lower=[],upper=[];
    for(const p of candidates){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(const p of [...candidates].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    const palm=[...lower.slice(0,-1),...upper.slice(0,-1)];
    const fill=this.skinGradient(points[0],points[9],Math.max(pw*.5,s*.035));
    // Rounded envelope and shared wrist width keep the hand attached in every turn.
    if(this.path(palm,true)){
      c.fillStyle=fill;c.fill();c.lineWidth=r*1.4;c.strokeStyle=fill;c.stroke();
    }
    // Pad at the thumb base is a surface detail, never a displaced landmark.
    this.capsule(this.mix(points[0],points[1],.4),points[1],r*1.45,r*1.12,fill);
    const fingers=[{ids:[1,2,3,4],f:1.12},{ids:[5,6,7,8],f:1},{ids:[9,10,11,12],f:1.02},{ids:[13,14,15,16],f:.94},{ids:[17,18,19,20],f:.8}].sort((a,b)=>points[b.ids[2]][2]-points[a.ids[2]][2]);
    for(const finger of fingers){
      const chain=finger.ids.map(i=>points[i]),radius=r*finger.f;
      c.save();c.beginPath();traceDigit(c,chain,radius);
      c.shadowColor='#172D4C38';c.shadowBlur=Math.max(.5,r*.35);c.shadowOffsetX=r*.13;c.shadowOffsetY=r*.18;
      c.fillStyle=this.skinGradient(chain[0],chain[3],radius);c.fill();c.restore();
      // One quiet crease per knuckle communicates bending without slicing the digit.
      for(let j=1;j<3;j++){
        const at=chain[j],next=chain[j+1],len=this.distance(at,next);
        if(len<radius*.2)continue;
        const px=-(next[1]-at[1])/len,py=(next[0]-at[0])/len,rr=radius*(j===1?.55:.4);
        c.beginPath();c.moveTo(at[0]-px*rr,at[1]-py*rr);c.lineTo(at[0]+px*rr,at[1]+py*rr);
        c.strokeStyle=SKIN.line+'45';c.lineWidth=Math.max(.35,r*.1);c.stroke();
      }
    }
  }

  clear() {
    this.data = null; this.track = null; this.frame = null; this.sampledTime = null; this.bounds = null; this.note.hidden=true;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
  dispose() { this.resizeObserver.disconnect(); window.removeEventListener?.('resize', this.onWindowResize); this.dprQuery?.removeEventListener?.('change', this.onDprChange); this.clear(); this.canvas.remove(); this.note.remove(); }
}
