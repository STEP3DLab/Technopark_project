/** Sculptural digital character. Measured signing landmarks remain the motion source.
 * Presentation interpolation is isolated from recognition and never overwrites assets.
 */
import { prepareMotion, sampleMotion, armLayers } from './avatar-motion.js?v=0.11.1';
import { handMetrics } from './hand-geometry.js?v=0.11.1';
import { paintHand, skinMaterial } from './avatar-hands.js?v=0.11.1';
import { measureAvatarFrame, fitAvatarFrame } from './avatar-framing.js?v=0.11.1';
const OUTFITS = Object.freeze({
  indigo:{body:'#304B78',light:'#4B6B9A',dark:'#1C2E4E',seam:'#8EA6CC',accent:'#FFFFFF'},
  teal:{body:'#356562',light:'#5D8880',dark:'#244B4D',seam:'#9ABBB0',accent:'#C0DDD0'},
  slate:{body:'#4F5D70',light:'#738296',dark:'#343F51',seam:'#AFBCCC',accent:'#D9E3E5'},
});
// Warm matte skin separates the signing surface from the navy garment.
const SKIN={base:'#DDA885',light:'#F4CFB1',shade:'#AE755D',line:'#845B49'};

export class CanvasAvatar {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    if (!this.ctx) throw new Error('Canvas 2D недоступен');
    if ((window.getComputedStyle?.(container)?.position || container.style.position || 'static') === 'static') container.style.position = 'relative';
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
    this.smoothing = true;
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
    this.bounds = measureAvatarFrame(data,this.faceMap);
    const widths=[],heights=[],{sw,sh,shoulder}=this.bounds;
    for(const frame of data.frames||[]){
      const point=id=>frame.face?.[this.faceMap.get(id)];
      const a=point(234),b=point(454),top=point(10),chin=point(152);
      if(this.valid(a)&&this.valid(b))widths.push(Math.hypot((a[0]-b[0])*sw,(a[1]-b[1])*sh)*.585);
      if(this.valid(top)&&this.valid(chin))heights.push(Math.hypot((top[0]-chin[0])*sw,(top[1]-chin[1])*sh)*.55);
    }
    const median=(values,fallback)=>values.length?[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]:fallback;
    this.headForm={width:Math.max(shoulder*.18,median(widths,shoulder*.22)),height:median(heights,shoulder*.29)};
    this.container.dataset.smoothing=this.smoothing?'smooth':'recorded';
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

  setSmoothing(enabled = true) {
    const value = Boolean(enabled);
    if (this.smoothing === value) return;
    this.smoothing = value;
    this.container.dataset.smoothing=value?'smooth':'recorded';
    this.sampledTime = null;
    if(this.visible){this.sampleFrame();this.render();}
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
    this.frame = sampleMotion(this.track, this.time, {smooth:this.smoothing});
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
    const top=this.track?.missing?Math.max(pad,42):pad;
    Object.assign(this,fitAvatarFrame(this.bounds,this.width,this.height,{top,pad}));
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
    const key=`${w}:${h}:${this.scene}`;
    if(this.studioKey!==key){
      this.studioKey=key;
      const glow=c.createRadialGradient(w*.43,h*.24,0,w*.5,h*.4,Math.max(w,h)*.75);
      glow.addColorStop(0,dark?'#425873':'#FFFFFF');
      glow.addColorStop(.46,dark?'#2C405B':'#F1F4F8');
      glow.addColorStop(1,dark?'#1D2D44':'#DFE7EF');
      this.studioPaint=glow;
      const floor=c.createLinearGradient(0,h*.3,0,h);
      floor.addColorStop(0,'#14253C00');floor.addColorStop(1,dark?'#101F3130':'#ABBCCF18');
      this.floorPaint=floor;
    }
    c.fillStyle=this.studioPaint;c.fillRect(0,0,w,h);
    c.fillStyle=this.floorPaint;c.fillRect(0,0,w,h);
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
    return skinMaterial(this.ctx,a,b,radius,SKIN);
  }

  drawTorso(p,face) {
    const c=this.ctx,s=this.shoulder,palette=OUTFITS[this.outfit];
    const [l,r]=[p[11],p[12]].sort((a,b)=>a[0]-b[0]);
    const cx=(l[0]+r[0])/2,cy=(l[1]+r[1])/2,chin=face(152);
    const nx=chin?chin[0]*.73+cx*.27:cx;
    const collarY=chin?Math.min(cy-s*.085,chin[1]+s*.10):cy-s*.15;
    const neckTop=chin?[chin[0],chin[1]-s*.08]:[nx,cy-s*.3];
    const neckEnd=[nx,collarY+s*.065];
    this.capsule(neckTop,neckEnd,s*.089,s*.105,this.skinGradient(neckTop,neckEnd,s*.105));
    // The shirt and sleeves share a single lighting field, so the shoulders
    // form one continuous garment instead of separate joint covers.
    const fabric=c.createLinearGradient(cx-s*.67,cy-s*.48,cx+s*.75,cy+s*1.55);
    fabric.addColorStop(0,palette.light);fabric.addColorStop(.42,palette.body);fabric.addColorStop(1,palette.dark);
    this.bodyPaint=fabric;
    const measuredHip=p[23]&&p[24]?(p[23][0]+p[24][0])/2:cx;
    const hip=cx+Math.max(-s*.18,Math.min(s*.18,measuredHip-cx));
    const bottom=Math.max(cy+s*1.5,this.height+s*.2);
    c.beginPath();c.moveTo(nx-s*.137,collarY);
    c.bezierCurveTo(cx-s*.29,collarY-s*.025,l[0]-s*.035,l[1]-s*.08,l[0]-s*.108,l[1]+s*.045);
    c.bezierCurveTo(l[0]-s*.10,l[1]+s*.3,hip-s*.41,bottom-s*.56,hip-s*.43,bottom);
    c.lineTo(hip+s*.43,bottom);
    c.bezierCurveTo(hip+s*.41,bottom-s*.56,r[0]+s*.10,r[1]+s*.3,r[0]+s*.108,r[1]+s*.045);
    c.bezierCurveTo(r[0]+s*.035,r[1]-s*.08,cx+s*.29,collarY-s*.025,nx+s*.137,collarY);
    c.quadraticCurveTo(nx,collarY+s*.093,nx-s*.137,collarY);c.closePath();
    c.fillStyle=fabric;c.fill();
    // Gentle folds follow the torso rather than adding decorative armour.
    c.save();c.clip();
    c.beginPath();c.moveTo(l[0]+s*.04,l[1]+s*.28);
    c.bezierCurveTo(cx-s*.4,cy+s*.55,hip-s*.37,cy+s*.9,hip-s*.36,bottom);
    c.strokeStyle=palette.dark+'2B';c.lineWidth=s*.02;c.stroke();
    c.beginPath();c.moveTo(r[0]-s*.055,r[1]+s*.3);
    c.bezierCurveTo(cx+s*.39,cy+s*.57,hip+s*.35,cy+s*.91,hip+s*.37,bottom);
    c.strokeStyle=palette.seam+'0F';c.lineWidth=s*.012;c.stroke();
    c.restore();
    c.beginPath();c.moveTo(nx-s*.137,collarY);
    c.quadraticCurveTo(nx,collarY+s*.105,nx+s*.137,collarY);
    c.strokeStyle=palette.dark;c.lineWidth=s*.027;c.stroke();
    c.beginPath();c.moveTo(nx-s*.132,collarY+s*.014);
    c.quadraticCurveTo(nx,collarY+s*.109,nx+s*.132,collarY+s*.014);
    c.strokeStyle=palette.seam+'65';c.lineWidth=Math.max(.45,s*.006);c.stroke();
  }

  drawHead(p,face) {
    const c=this.ctx,s=this.shoulder,f=face(10),chin=face(152),a=face(234)||p[7],b=face(454)||p[8];
    if(!a||!b)return;
    const cx=(a[0]+b[0])/2,cy=f&&chin?(f[1]+chin[1])/2:(a[1]+b[1])/2;
    const measuredW=Math.max(this.distance(a,b)*.585,s*.18),measuredH=f&&chin?this.distance(f,chin)*.55:measuredW*1.28;
    const baseW=(this.headForm?.width||this.bounds.shoulder*.22)*this.scale;
    const baseH=(this.headForm?.height||this.bounds.shoulder*.29)*this.scale;
    // Keep the character's cranial volume stable while retaining measured head
    // translation/tilt and every facial feature. This is silhouette styling,
    // not smoothing of lip or eyebrow expression.
    const w=baseW+(measuredW-baseW)*.28,h=baseH+(measuredH-baseH)*.28;
    let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
    if(Math.abs(angle)>Math.PI/2)angle-=Math.sign(angle)*Math.PI;
    c.save();c.translate(cx,cy);c.rotate(angle);
    // Soft ears, a defined jaw and a matte complexion give the avatar a calm,
    // human silhouette. Face and hand positions remain in the recorded space.
    for(const side of [-1,1]){
      const ear=c.createLinearGradient(side*w*.82,0,side*w*1.08,0);
      ear.addColorStop(0,SKIN.shade);ear.addColorStop(.52,SKIN.base);ear.addColorStop(1,'#CA9475');
      c.beginPath();c.ellipse(side*w*.96,h*.025,w*.12,h*.175,side*-.1,0,Math.PI*2);c.fillStyle=ear;c.fill();
      c.beginPath();c.moveTo(side*w*.997,-h*.047);
      c.quadraticCurveTo(side*w*1.045,h*.035,side*w*.99,h*.12);
      c.strokeStyle='#9B65465E';c.lineWidth=Math.max(.5,w*.028);c.stroke();
    }
    c.beginPath();c.moveTo(0,-h*1.055);
    c.bezierCurveTo(w*.73,-h*1.055,w*.985,-h*.64,w*.975,-h*.035);
    c.bezierCurveTo(w*.97,h*.30,w*.75,h*.69,w*.43,h*.89);
    c.quadraticCurveTo(w*.20,h*1.015,0,h*1.015);
    c.quadraticCurveTo(-w*.20,h*1.015,-w*.43,h*.89);
    c.bezierCurveTo(-w*.75,h*.69,-w*.97,h*.30,-w*.975,-h*.035);
    c.bezierCurveTo(-w*.985,-h*.64,-w*.73,-h*1.055,0,-h*1.055);c.closePath();
    const skin=c.createRadialGradient(-w*.4,-h*.5,w*.03,w*.15,h*.07,h*1.5);
    skin.addColorStop(0,SKIN.light);skin.addColorStop(.47,SKIN.base);skin.addColorStop(.86,'#C58B6C');skin.addColorStop(1,SKIN.shade);
    c.fillStyle=skin;c.fill();
    c.save();c.clip();
    // Low-contrast cheek planes avoid the porcelain mask and angular glare.
    for(const side of [-1,1]){
      const cheek=c.createRadialGradient(side*w*.55,h*.28,0,side*w*.57,h*.26,w*.49);
      cheek.addColorStop(0,side<0?'#CC80601A':'#985C4323');cheek.addColorStop(1,'#CC806000');
      c.fillStyle=cheek;c.fillRect(-w,-h,w*2,h*2.1);
    }
    const jaw=c.createLinearGradient(0,h*.70,0,h*1.02);
    jaw.addColorStop(0,'#7D4D3700');jaw.addColorStop(1,'#7D4D3730');
    c.fillStyle=jaw;c.fillRect(-w,h*.7,w*2,h*.4);
    c.restore();
    // A simple side-parted silhouette stays clear of the eyebrows and ears.
    c.beginPath();c.moveTo(-w*.97,h*.015);
    c.bezierCurveTo(-w*1.12,-h*.42,-w*1.02,-h*.87,-w*.62,-h*1.07);
    c.bezierCurveTo(-w*.27,-h*1.25,w*.28,-h*1.23,w*.68,-h*.98);
    c.bezierCurveTo(w*.97,-h*.84,w*1.03,-h*.51,w*.96,-h*.06);
    c.lineTo(w*.85,h*.035);c.lineTo(w*.8,-h*.48);
    c.bezierCurveTo(w*.61,-h*.58,w*.30,-h*.69,w*.20,-h*.80);
    c.bezierCurveTo(-w*.11,-h*.59,-w*.49,-h*.52,-w*.81,-h*.48);
    c.lineTo(-w*.86,h*.02);c.closePath();
    const hair=c.createLinearGradient(-w,-h*1.2,w,h*.05);
    hair.addColorStop(0,'#4C4947');hair.addColorStop(.42,'#303638');hair.addColorStop(1,'#222A30');
    c.fillStyle=hair;c.fill();
    c.beginPath();c.moveTo(-w*.78,-h*.71);
    c.bezierCurveTo(-w*.43,-h*1.03,-w*.02,-h*1.07,w*.31,-h*.94);
    c.strokeStyle='#A5A39A32';c.lineWidth=Math.max(.6,w*.048);c.stroke();
    c.beginPath();c.moveTo(w*.31,-h*.94);
    c.bezierCurveTo(w*.56,-h*.86,w*.73,-h*.63,w*.80,-h*.42);
    c.strokeStyle='#0C182A35';c.lineWidth=Math.max(.6,w*.05);c.stroke();
    c.restore();
    if(!this.frame.face)return;
    this.drawEye([33,160,158,133,153,144].map(face),w);
    this.drawEye([263,387,385,362,373,380].map(face),w);
    for(const ids of [[70,63,105,66,107],[300,293,334,296,336]]){
      if(this.smoothPath(ids.map(face),false)){
        c.strokeStyle='#50433C';c.lineWidth=Math.max(.8,w*.045);c.stroke();
      }
    }
    const nose=face(4),bridge=face(6);
    if(nose&&bridge){
      c.beginPath();c.moveTo(bridge[0],bridge[1]);
      c.bezierCurveTo(nose[0]-w*.025,nose[1]-w*.13,nose[0]-w*.11,nose[1]-w*.035,nose[0]-w*.105,nose[1]);
      c.quadraticCurveTo(nose[0]+w*.01,nose[1]+w*.083,nose[0]+w*.13,nose[1]-w*.005);
      c.quadraticCurveTo(nose[0]+w*.048,nose[1]-w*.10,bridge[0],bridge[1]);c.closePath();
      const shade=c.createLinearGradient(nose[0]-w*.13,0,nose[0]+w*.16,0);
      shade.addColorStop(0,'#CA9374');shade.addColorStop(.4,'#EFC4A2');shade.addColorStop(1,'#B87E61');
      c.fillStyle=shade;c.fill();
      c.beginPath();c.moveTo(nose[0]-w*.10,nose[1]);
      c.quadraticCurveTo(nose[0],nose[1]+w*.06,nose[0]+w*.11,nose[1]);
      c.strokeStyle='#96664D88';c.lineWidth=Math.max(.4,w*.016);c.stroke();
    }
    // Eyelid, eyebrow and mouth shape follows the recording continuously.
    const outer=[61,40,37,0,267,270,291,321,314,17,84,91].map(face);
    if(this.smoothPath(outer)){
      const lipY=outer.reduce((sum,p)=>sum+p[1],0)/outer.length;
      const lips=c.createLinearGradient(0,lipY-w*.09,0,lipY+w*.12);
      lips.addColorStop(0,'#A57261');lips.addColorStop(1,'#C08B75');
      c.fillStyle=lips;c.fill();
    }
    const inner=[78,81,13,311,308,402,14,178].map(face);
    if(this.smoothPath(inner)){c.fillStyle='#67483F';c.fill();}
    const lower=[91,84,17,314,321].map(face);
    if(this.smoothPath(lower,false)){c.strokeStyle='#EBC1A844';c.lineWidth=Math.max(.35,w*.018);c.stroke();}
  }

  drawEye(points,headRadius) {
    if(points.some(p=>!p))return;
    const c=this.ctx,[outer,,,inner]=points;
    const width=this.distance(outer,inner);
    const dx=(inner[0]-outer[0])/Math.max(width,1e-8),dy=(inner[1]-outer[1])/Math.max(width,1e-8);
    const aperture=Math.max(...points.map(p=>(p[0]-outer[0])*-dy+(p[1]-outer[1])*dx))-
      Math.min(...points.map(p=>(p[0]-outer[0])*-dy+(p[1]-outer[1])*dx));
    if(this.path(points,true)){
      c.fillStyle='#EEE7DB';c.fill();
      // Neutral irises are a material/style detail, clipped to the recorded
      // eyelid aperture. We do not add blink, smile or gaze animations.
      if(aperture>.25&&width>1){
        c.save();c.clip();
        const center=this.mix(outer,inner,.5),radius=width*.19;
        c.beginPath();c.ellipse(center[0],center[1],radius,radius*1.07,0,0,Math.PI*2);
        c.fillStyle='#4D4B40';c.fill();
        c.beginPath();c.arc(center[0],center[1],radius*.52,0,Math.PI*2);c.fillStyle='#263237';c.fill();
        c.beginPath();c.arc(center[0]-radius*.27,center[1]-radius*.30,Math.max(.2,radius*.17),0,Math.PI*2);
        c.fillStyle='#FFFFFFA0';c.fill();c.restore();
      }
    }
    if(this.smoothPath(points.slice(0,4),false)){c.strokeStyle='#5D493D';c.lineWidth=Math.max(.5,headRadius*.022);c.stroke();}
    if(this.smoothPath([points[0],points[5],points[4],points[3]],false)){
      c.strokeStyle='#A4765C70';c.lineWidth=Math.max(.35,headRadius*.012);c.stroke();
    }
  }

  drawArm({a,b,d,hand}) {
    const c=this.ctx,s=this.shoulder,palette=OUTFITS[this.outfit];
    const hp=hand?.map(v=>this.project(v));
    const wristRadius=hp?handMetrics(hp,s).wristRadius:s*.035;
    const upperRadius=s*.106,elbowRadius=s*.067;
    this.capsule(a,b,upperRadius,elbowRadius,this.skinGradient(a,b,upperRadius));
    const sleeveEnd=this.mix(a,b,.65);
    this.capsule(a,sleeveEnd,upperRadius*1.035,upperRadius*.83,this.bodyPaint||palette.body);
    const length=this.distance(a,b)||1,ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length;
    const nx=-uy,ny=ux,rr=upperRadius*.79;
    c.beginPath();c.moveTo(sleeveEnd[0]-nx*rr,sleeveEnd[1]-ny*rr);
    c.quadraticCurveTo(sleeveEnd[0]+ux*s*.016,sleeveEnd[1]+uy*s*.016,sleeveEnd[0]+nx*rr,sleeveEnd[1]+ny*rr);
    c.strokeStyle=palette.dark+'72';c.lineWidth=Math.max(.6,s*.009);c.stroke();
    // The folded forearm is in front of its sleeve, including a raised thumb.
    c.beginPath();c.arc(b[0],b[1],elbowRadius,0,Math.PI*2);
    c.fillStyle=this.skinGradient(b,d,elbowRadius);c.fill();
    this.capsule(b,d,elbowRadius,wristRadius,this.skinGradient(b,d,elbowRadius));
    // The endpoint is shared with the palm, not an independently enlarged joint.
    c.beginPath();c.arc(d[0],d[1],wristRadius,0,Math.PI*2);
    c.fillStyle=this.skinGradient(b,d,elbowRadius);c.fill();

  }

  drawHand(points) {
    paintHand(this.ctx,points,this.shoulder,SKIN);
  }

  clear() {
    this.data = null; this.track = null; this.frame = null; this.sampledTime = null; this.bounds = null; this.note.hidden=true;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
  dispose() { this.resizeObserver.disconnect(); window.removeEventListener?.('resize', this.onWindowResize); this.dprQuery?.removeEventListener?.('change', this.onDprChange); this.clear(); this.canvas.remove(); this.note.remove(); }
}

