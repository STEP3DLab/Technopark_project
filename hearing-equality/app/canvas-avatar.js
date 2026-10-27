/**
 * A softly lit, illustrated 2.5D human built around measured landmarks.
 * All signing joint centres and facial contours follow the source recording.
 * Skin, clothing, hair, irises and lighting are decorative appearance; there
 * is no gesture synthesis, automatic blink, inferred gaze or gap filling.
 */
export class CanvasAvatar {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    if (!this.ctx) throw new Error('Canvas 2D недоступен');
    container.append(this.canvas);
    this.data = null;
    this.frame = null;
    this.time = 0;
    this.width = 1;
    this.height = 1;
    this.scene = 'light';
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

  resize() {
    const rect = this.container.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.width = rect.width; this.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  showAt(time) {
    this.time = Math.max(0, Number(time) || 0);
    const frames = this.data?.frames;
    if (!frames?.length) { this.frame = null; this.render(); return; }
    const at = Math.min(frames.length - 1, this.time * (Number(this.data.fps) || 30));
    const lower = Math.floor(at), upper = Math.min(frames.length - 1, lower + 1), t = at - lower;
    const a = frames[lower], b = frames[upper];
    const blend = (left, right) => {
      // An exact recorded instant stays available even if the next frame is
      // missing. Between frames, both measurements are required.
      if (t < 1e-8) return left || null;
      if (!left || !right) return null;
      return left.map((p, i) => {
        const q = right[i];
        if (!this.valid(p) || !this.valid(q)) return null;
        return p.map((v, j) => Number.isFinite(v) && Number.isFinite(q[j]) ? v + (q[j] - v) * t : v);
      });
    };
    this.frame = {
      pose: blend(a.pose || a.pose33, b.pose || b.pose33),
      left: blend(a.left, b.left), right: blend(a.right, b.right), face: blend(a.face, b.face),
    };
    this.render();
  }

  project(p) {
    if (!this.valid(p) || !this.bounds) return null;
    return [this.originX + (p[0] * this.bounds.sw - this.bounds.centerX) * this.scale,
      this.originY + (p[1] * this.bounds.sh - this.bounds.minY) * this.scale, p[2] || 0];
  }

  render() {
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    if (!this.frame?.pose || !this.bounds) return;
    const pad = Math.max(9, Math.min(18, this.width * .022));
    const bw = this.bounds.maxX - this.bounds.minX, bh = this.bounds.maxY - this.bounds.minY;
    this.scale = Math.min(Math.max(1, this.width - pad * 2) / bw, Math.max(1, this.height - pad * 2) / bh);
    this.originX = this.width / 2;
    this.originY = pad + (this.height - pad * 2 - bh * this.scale) * .44;
    this.shoulder = this.bounds.shoulder * this.scale;
    const p = this.frame.pose.map(v => this.project(v));
    if (!p[11] || !p[12]) return;
    const face = id => this.project(this.frame.face?.[this.faceMap.get(id)]);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    this.drawStudio(p, face);
    this.drawTorso(p, face);
    this.drawHead(p, face);
    const arms = [
      { a: p[11], b: p[13], d: this.project(this.frame.left?.[0]) || p[15], depth: (p[13]?.[2] || 0) + (p[15]?.[2] || 0), hand: this.frame.left },
      { a: p[12], b: p[14], d: this.project(this.frame.right?.[0]) || p[16], depth: (p[14]?.[2] || 0) + (p[16]?.[2] || 0), hand: this.frame.right },
    ].filter(arm => arm.a && arm.b && arm.d).sort((a, b) => b.depth - a.depth);
    for (const arm of arms) this.drawArm(arm);
    for (const arm of arms) if (arm.hand) this.drawHand(arm.hand.map(v => this.project(v)));
    c.restore();
  }

  drawStudio(p, face) {
    const c = this.ctx, s = this.shoulder;
    const cx = (p[11][0] + p[12][0]) / 2, cy = (p[11][1] + p[12][1]) / 2;
    const dark = this.scene === 'dark';
    const light = c.createRadialGradient(cx - s * .22, cy - s * .18, s * .1, cx, cy + s * .28, s * 1.7);
    light.addColorStop(0, dark ? '#8ed9c316' : '#fcf9efb8');
    light.addColorStop(.5, dark ? '#53a99e0d' : '#dcece655');
    light.addColorStop(1, dark ? '#53a99e00' : '#dcece600');
    c.fillStyle = light; c.fillRect(0, 0, this.width, this.height);
    const ground = c.createRadialGradient(cx, this.height - 2, 0, cx, this.height - 2, s * .69);
    ground.addColorStop(0, dark ? '#00000031' : '#234b3d15'); ground.addColorStop(1, '#234b3d00');
    c.save(); c.translate(0, this.height - 2); c.scale(1, .15); c.translate(0, -(this.height - 2));
    c.fillStyle = ground; c.beginPath(); c.arc(cx, this.height - 2, s * .69, 0, Math.PI * 2); c.fill(); c.restore();
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

  skinGradient(a, b, radius) {
    const c = this.ctx, length = this.distance(a, b) || 1;
    const nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length;
    const sign = nx < 0 ? -1 : 1;
    const middle = this.mix(a, b, .48);
    const g = c.createLinearGradient(middle[0] - nx * radius * sign, middle[1] - ny * radius * sign,
      middle[0] + nx * radius * sign, middle[1] + ny * radius * sign);
    g.addColorStop(0, '#ba8066'); g.addColorStop(.22, '#dfaa87');
    g.addColorStop(.48, '#f0c5a4'); g.addColorStop(.78, '#e5b08e'); g.addColorStop(1, '#cc9375');
    return g;
  }

  drawTorso(p, face) {
    const c = this.ctx, s = this.shoulder;
    const [left, right] = [p[11], p[12]].sort((a, b) => a[0] - b[0]);
    const cx = (left[0] + right[0]) / 2, cy = (left[1] + right[1]) / 2;
    const chin = face(152);
    const collarY = chin ? Math.min(cy - s * .075, chin[1] + s * .09) : cy - s * .15;
    const hipA = p[23], hipB = p[24];
    const waistX = hipA && hipB ? (hipA[0] + hipB[0]) / 2 : cx;
    const lower = Math.max(hipA?.[1] || 0, hipB?.[1] || 0, cy + s * 1.2);
    const neckX = chin ? chin[0] * .72 + cx * .28 : cx;
    const neckTop = chin ? [chin[0], chin[1] - s * .055] : [cx, cy - s * .29];
    const neckBase = [neckX, collarY + s * .065];
    this.capsule(neckTop, neckBase, s * .087, s * .112, this.skinGradient(neckTop, neckBase, s * .12));
    const shadow = c.createLinearGradient(0, neckTop[1], 0, neckBase[1]);
    shadow.addColorStop(0, '#76503e5b'); shadow.addColorStop(.6, '#76503e00');
    this.capsule(neckTop, neckBase, s * .084, s * .107, shadow);
    const cloth = c.createLinearGradient(left[0] - s * .12, cy, right[0] + s * .14, cy + s * .2);
    cloth.addColorStop(0, '#154c50'); cloth.addColorStop(.22, '#267d78');
    cloth.addColorStop(.48, '#358e85'); cloth.addColorStop(.77, '#287a75'); cloth.addColorStop(1, '#174f57');
    const neckL = [neckX - s * .13, collarY], neckR = [neckX + s * .13, collarY];
    c.beginPath(); c.moveTo(...neckL);
    c.bezierCurveTo(cx - s * .24, collarY + s * .018, left[0] - s * .035, left[1] - s * .055, left[0] - s * .083, left[1] + s * .055);
    c.bezierCurveTo(left[0] - s * .09, left[1] + s * .24, cx - s * .49, cy + s * .35, cx - s * .445, cy + s * .67);
    c.bezierCurveTo(cx - s * .405, cy + s * .93, waistX - s * .405, lower - s * .22, waistX - s * .39, lower);
    c.quadraticCurveTo(waistX, lower + s * .055, waistX + s * .39, lower);
    c.bezierCurveTo(waistX + s * .405, lower - s * .22, cx + s * .405, cy + s * .93, cx + s * .445, cy + s * .67);
    c.bezierCurveTo(cx + s * .49, cy + s * .35, right[0] + s * .09, right[1] + s * .24, right[0] + s * .083, right[1] + s * .055);
    c.bezierCurveTo(right[0] + s * .015, right[1] - s * .04, cx + s * .23, collarY + s * .025, ...neckR);
    c.quadraticCurveTo(neckX, collarY + s * .105, ...neckL);
    c.closePath(); c.fillStyle = cloth; c.fill();
    c.save(); c.clip();
    const sheen = c.createRadialGradient(cx - s * .17, cy + s * .06, 0, cx, cy + s * .22, s * 1.06);
    sheen.addColorStop(0, '#a4dfc42a'); sheen.addColorStop(.65, '#9ad6c400'); sheen.addColorStop(1, '#092e3b35');
    c.fillStyle = sheen; c.fillRect(cx - s, collarY - s * .1, s * 2, lower - collarY + s);
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(cx + side * s * .46, cy + s * .26);
      c.quadraticCurveTo(cx + side * s * .34, cy + s * .36, cx + side * s * .32, cy + s * .46);
      c.strokeStyle = '#103e421c'; c.lineWidth = Math.max(1, s * .018); c.stroke();
      c.beginPath(); c.moveTo(cx + side * s * .38, cy + s * .3);
      c.bezierCurveTo(cx + side * s * .25, cy + s * .62, waistX + side * s * .34, lower - s * .13, waistX + side * s * .29, lower + s * .05);
      c.strokeStyle = '#092e3b18'; c.lineWidth = s * .025; c.stroke();
      c.beginPath(); c.moveTo(cx + side * s * .27, cy + s * .76);
      c.quadraticCurveTo(waistX + side * s * .2, cy + s * .87, waistX + side * s * .21, lower);
      c.strokeStyle = '#a0d9c416'; c.lineWidth = Math.max(1, s * .009); c.stroke();
    }
    c.restore();
    c.beginPath(); c.moveTo(...neckL); c.quadraticCurveTo(neckX, collarY + s * .105, ...neckR);
    c.strokeStyle = '#124b50'; c.lineWidth = s * .036; c.stroke();
    c.beginPath(); c.moveTo(neckL[0], neckL[1] + s * .012); c.quadraticCurveTo(neckX, collarY + s * .11, neckR[0], neckR[1] + s * .012);
    c.strokeStyle = '#69afa093'; c.lineWidth = Math.max(.65, s * .009); c.stroke();
  }

  drawHead(p, face) {
    const c = this.ctx, s = this.shoulder;
    const forehead = face(10), chin = face(152), sideA = face(234) || p[7], sideB = face(454) || p[8];
    if (!sideA || !sideB) return;
    const cx = (sideA[0] + sideB[0]) / 2;
    const cy = forehead && chin ? (forehead[1] + chin[1]) / 2 : (sideA[1] + sideB[1]) / 2;
    const w = Math.max(this.distance(sideA, sideB) * .55, s * .18);
    const h = forehead && chin ? this.distance(forehead, chin) * .52 : w * 1.27;
    let angle = Math.atan2(sideB[1] - sideA[1], sideB[0] - sideA[0]);
    if (Math.abs(angle) > Math.PI / 2) angle -= Math.sign(angle) * Math.PI;
    c.save(); c.translate(cx, cy); c.rotate(angle);
    // Short sculpted hair, behind the ears and face.
    const hair = c.createLinearGradient(-w, -h * 1.25, w, h * .35);
    hair.addColorStop(0, '#665047'); hair.addColorStop(.38, '#433a36'); hair.addColorStop(1, '#252b2b');
    c.beginPath(); c.moveTo(-w * .98, h * .1);
    c.bezierCurveTo(-w * 1.18, -h * .55, -w * .9, -h * 1.28, -w * .03, -h * 1.22);
    c.bezierCurveTo(w * .68, -h * 1.32, w * 1.17, -h * .9, w * 1.04, h * .16);
    c.quadraticCurveTo(0, h * .02, -w * .98, h * .1); c.fillStyle = hair; c.fill();
    for (const side of [-1, 1]) {
      const eg = c.createRadialGradient(side * w * .98, -h * .01, 0, side * w * .98, 0, w * .25);
      eg.addColorStop(0, '#efc2a2'); eg.addColorStop(1, '#bf856c');
      c.beginPath(); c.ellipse(side * w * .96, h * .035, w * .155, h * .2, side * -.15, 0, Math.PI * 2); c.fillStyle = eg; c.fill();
      c.beginPath(); c.ellipse(side * w * .99, h * .03, w * .066, h * .115, side * -.15, -.9, 2.1);
      c.strokeStyle = '#9c66594b'; c.lineWidth = Math.max(.6, w * .022); c.stroke();
    }
    const skin = c.createRadialGradient(-w * .42, -h * .5, w * .02, -w * .06, -h * .1, h * 1.35);
    skin.addColorStop(0, '#f7d9bd'); skin.addColorStop(.4, '#edc3a2'); skin.addColorStop(.78, '#dba685'); skin.addColorStop(1, '#b77c65');
    c.beginPath(); c.moveTo(0, -h * 1.025);
    c.bezierCurveTo(w * .65, -h * 1.05, w * 1.02, -h * .64, w * .96, -h * .05);
    c.bezierCurveTo(w * .94, h * .42, w * .59, h * .89, w * .22, h * .98);
    c.quadraticCurveTo(0, h * 1.05, -w * .24, h * .98);
    c.bezierCurveTo(-w * .63, h * .89, -w * .98, h * .42, -w * .98, -h * .05);
    c.bezierCurveTo(-w * 1.02, -h * .67, -w * .62, -h * 1.04, 0, -h * 1.025);
    c.closePath(); c.fillStyle = skin; c.fill();
    c.strokeStyle = '#8e5c4530'; c.lineWidth = Math.max(.6, s * .003); c.stroke();
    c.save(); c.clip();
    for (const side of [-1, 1]) {
      const cheek = c.createRadialGradient(side * w * .56, h * .24, 0, side * w * .56, h * .24, w * .48);
      cheek.addColorStop(0, '#d7826b23'); cheek.addColorStop(1, '#d7826b00');
      c.fillStyle = cheek; c.fillRect(-w, -h, w * 2, h * 2.2);
    }
    c.restore();
    // Swept fringe stops above the measured brow region.
    c.beginPath(); c.moveTo(-w * .98, -h * .19);
    c.bezierCurveTo(-w * 1.06, -h * .65, -w * .85, -h * 1.21, -w * .09, -h * 1.22);
    c.bezierCurveTo(w * .59, -h * 1.32, w * 1.14, -h * .92, w * .96, -h * .18);
    c.quadraticCurveTo(w * .77, -h * .35, w * .77, -h * .68);
    c.bezierCurveTo(w * .35, -h * .77, w * .3, -h * 1.02, w * .09, -h * .98);
    c.bezierCurveTo(-w * .13, -h * .76, -w * .37, -h * .66, -w * .74, -h * .6);
    c.quadraticCurveTo(-w * .82, -h * .35, -w * .98, -h * .19);
    c.closePath(); c.fillStyle = hair; c.fill();
    c.beginPath(); c.moveTo(-w * .85, -h * .64);
    c.bezierCurveTo(-w * .65, -h * .98, -w * .16, -h * 1.12, w * .11, -h * 1.08);
    c.strokeStyle = '#b6967d38'; c.lineWidth = Math.max(.8, w * .058); c.stroke();
    c.beginPath(); c.moveTo(w * .2, -h * 1.1); c.quadraticCurveTo(w * .75, -h * 1.08, w * .89, -h * .63);
    c.strokeStyle = '#a68c7729'; c.lineWidth = Math.max(.6, w * .035); c.stroke();
    c.restore();
    if (!this.frame.face) return;
    this.drawEye([33, 160, 158, 133, 153, 144].map(face), w);
    this.drawEye([263, 387, 385, 362, 373, 380].map(face), w);
    for (const ids of [[70, 63, 105, 66, 107], [300, 293, 334, 296, 336]]) {
      const pts = ids.map(face);
      if (pts.every(Boolean) && this.smoothPath(pts, false)) {
        c.strokeStyle = '#4c3e34'; c.lineWidth = Math.max(1.1, w * .047); c.stroke();
        c.strokeStyle = '#8c705446'; c.lineWidth = Math.max(.5, w * .012); c.stroke();
      }
    }
    const nose = face(4), bridge = face(6);
    if (nose && bridge) {
      const n = w * .12, length = this.distance(bridge, nose) || 1;
      const ux = (nose[0] - bridge[0]) / length, uy = (nose[1] - bridge[1]) / length, nx = -uy, ny = ux;
      c.beginPath(); c.moveTo(bridge[0] - nx * n * .18, bridge[1] - ny * n * .18);
      c.quadraticCurveTo(nose[0] - nx * n * .9, nose[1] - ny * n * .9, nose[0], nose[1] + n * .27);
      c.quadraticCurveTo(nose[0] + nx * n * .75, nose[1] + ny * n * .75, nose[0] + nx * n, nose[1] + ny * n);
      c.strokeStyle = '#a66c513b'; c.lineWidth = Math.max(.6, w * .025); c.stroke();
      c.beginPath(); c.moveTo(bridge[0] + nx * n * .12, bridge[1] + ny * n * .12);
      c.quadraticCurveTo(nose[0] + nx * n * .1, nose[1] - n * .4, nose[0] + nx * n * .4, nose[1] - n * .08);
      c.strokeStyle = '#fff1d554'; c.lineWidth = Math.max(.75, w * .055); c.stroke();
    }
    const mouth = [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91].map(face);
    if (mouth.every(Boolean) && this.smoothPath(mouth)) {
      const ys = mouth.map(v => v[1]);
      const lip = c.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys) + .1);
      lip.addColorStop(0, '#a46661'); lip.addColorStop(.5, '#b8786c'); lip.addColorStop(1, '#dba18c');
      c.fillStyle = lip; c.fill();
      c.strokeStyle = '#9d66523d'; c.lineWidth = Math.max(.45, w * .01); c.stroke();
    }
    const inner = [78, 81, 13, 311, 308, 402, 14, 178].map(face);
    if (inner.every(Boolean) && this.smoothPath(inner)) { c.fillStyle = '#553837'; c.fill(); }
    const lowerLip = [91, 84, 17, 314, 321].map(face);
    if (lowerLip.every(Boolean) && this.smoothPath(lowerLip, false)) {
      c.strokeStyle = '#f9d2b751'; c.lineWidth = Math.max(.4, w * .015); c.stroke();
    }
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

  drawArm({ a, b, d, hand }) {
    const c = this.ctx, s = this.shoulder;
    const sleeveEnd = this.mix(a, b, .53);
    let wristRadius = s * .03;
    if (hand?.length === 21 && hand.every(v => this.valid(v))) {
      const hp = hand.map(v => this.project(v));
      const pw = this.distance(hp[5], hp[17]), pl = this.distance(hp[0], hp[9]);
      const fingerRadius = Math.max(.9, Math.min(s * .028, Math.max(pw * .09, pl * .055)));
      wristRadius = Math.max(fingerRadius * 1.55, Math.min(s * .038, pw * .2));
    }
    // Skin begins underneath the sleeve hem, not at the covered shoulder:
    // painting it through the shirt left a visible skin strip at the armhole.
    this.capsule(this.mix(a, b, .38), b, s * .075, s * .062, this.skinGradient(a, b, s * .09), '#92624b30');
    this.capsule(b, d, s * .065, wristRadius, this.skinGradient(b, d, s * .075), '#92624b30');
    const length = this.distance(a, sleeveEnd) || 1;
    const ux = (sleeveEnd[0] - a[0]) / length, uy = (sleeveEnd[1] - a[1]) / length;
    let nx = -uy, ny = ux;
    // Cloth wraps around the shoulder, with a fuller outer deltoid and an
    // underarm fold. The measured shoulder/elbow/wrist centres never move.
    const bodyX = (this.project(this.frame.pose[11])[0] + this.project(this.frame.pose[12])[0]) / 2;
    if (nx * (a[0] - bodyX) < 0) { nx = -nx; ny = -ny; }
    const at = (along, across) => [a[0] + ux * along + nx * across, a[1] + uy * along + ny * across];
    const outerTop = at(-s * .025, s * .113), innerTop = at(-s * .045, -s * .11);
    const outerCuff = at(length + s * .006, s * .096), innerCuff = at(length - s * .006, -s * .092);
    const cloth = c.createLinearGradient(a[0] - nx * s * .12, a[1] - ny * s * .12, a[0] + nx * s * .13, a[1] + ny * s * .13);
    cloth.addColorStop(0, '#174e54'); cloth.addColorStop(.27, '#2c7e78'); cloth.addColorStop(.68, '#40998c'); cloth.addColorStop(1, '#2d7c77');
    c.beginPath(); c.moveTo(...outerTop);
    c.bezierCurveTo(...at(length * .22, s * .142), ...at(length * .82, s * .111), ...outerCuff);
    c.quadraticCurveTo(...at(length + s * .024, s * .013), ...innerCuff);
    c.bezierCurveTo(...at(length * .72, -s * .102), ...at(length * .29, -s * .108), ...innerTop);
    c.bezierCurveTo(...at(-s * .125, -s * .038), ...at(-s * .117, s * .075), ...outerTop);
    c.closePath(); c.fillStyle = cloth; c.fill();
    c.beginPath(); c.moveTo(...outerCuff); c.quadraticCurveTo(...at(length + s * .024, s * .013), ...innerCuff);
    c.strokeStyle = '#0d414d50'; c.lineWidth = Math.max(.65, s * .008); c.stroke();
    c.beginPath(); c.moveTo(...at(length - s * .016, s * .096));
    c.quadraticCurveTo(...at(length + s * .004, s * .013), ...at(length - s * .025, -s * .089));
    c.strokeStyle = '#9ad6bd48'; c.lineWidth = Math.max(.5, s * .005); c.stroke();
    c.beginPath(); c.moveTo(...at(length * .2, -s * .035));
    c.quadraticCurveTo(...at(length * .51, -s * .036), ...at(length * .79, -s * .057));
    c.strokeStyle = '#103e4623'; c.lineWidth = Math.max(.7, s * .013); c.stroke();
  }

  drawHand(points) {
    if (!points || points.length < 21 || points.some(p => !p)) return;
    const c = this.ctx, s = this.shoulder;
    const palmWidth = this.distance(points[5], points[17]), palmLength = this.distance(points[0], points[9]);
    const radius = Math.max(.9, Math.min(s * .028, Math.max(palmWidth * .09, palmLength * .055)));
    const axisLength = palmLength || 1;
    let nx = -(points[9][1] - points[0][1]) / axisLength, ny = (points[9][0] - points[0][0]) / axisLength;
    if ((points[5][0] - points[17][0]) * nx + (points[5][1] - points[17][1]) * ny < 0) { nx = -nx; ny = -ny; }
    const wristRadius = Math.max(radius * 1.55, Math.min(s * .038, palmWidth * .2));
    const wristRadial = [points[0][0] + nx * wristRadius, points[0][1] + ny * wristRadius];
    const wristUlnar = [points[0][0] - nx * wristRadius, points[0][1] - ny * wristRadius];
    const palmCenter = [(points[0][0] + points[5][0] + points[9][0] + points[17][0]) / 4,
      (points[0][1] + points[5][1] + points[9][1] + points[17][1]) / 4];
    const skin = c.createRadialGradient(palmCenter[0] - radius, palmCenter[1] - radius, 0,
      palmCenter[0], palmCenter[1], Math.max(radius * 3, palmWidth * .73, palmLength * .73));
    skin.addColorStop(0, '#f3cdab'); skin.addColorStop(.5, '#e8b794'); skin.addColorStop(1, '#cd9676');
    // The projected palm can be strongly foreshortened. A rounded skin
    // envelope around wrist, thumb base and MCP landmarks preserves its
    // volume without moving any joint centre or fingertip. An inward-smoothed
    // polygon would collapse this already shallow palm into a thin ribbon.
    const candidates = [wristUlnar, points[17], points[13], points[9], points[5], points[2], points[1], wristRadial]
      .slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of candidates) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
    for (const q of [...candidates].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
    const palm = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    if (this.path(palm, true)) {
      c.fillStyle = skin; c.fill(); c.strokeStyle = skin; c.lineWidth = radius * 1.45; c.stroke();
    }
    const fingers = [
      { ids: [1, 2, 3, 4], factor: 1.15 }, { ids: [5, 6, 7, 8], factor: 1 },
      { ids: [9, 10, 11, 12], factor: 1.03 }, { ids: [13, 14, 15, 16], factor: .94 },
      { ids: [17, 18, 19, 20], factor: .77 },
    ].sort((a, b) => points[b.ids[2]][2] - points[a.ids[2]][2]);
    for (const finger of fingers) {
      const chain = finger.ids.map(id => points[id]);
      const r = radius * finger.factor;
      // Continuous shading and no outlines around individual phalanges avoid
      // the segmented-pipe appearance while retaining all joint centres.
      const grad = this.skinGradient(chain[0], chain[3], r * 1.15);
      for (let i = 0; i < 3; i++) this.capsule(chain[i], chain[i + 1], r * [1, .95, .84][i], r * [.95, .84, .72][i], grad);
      for (let j = 1; j < 3; j++) {
        const before = chain[j - 1], joint = chain[j], after = chain[j + 1];
        const l = this.distance(before, after) || 1, px = -(after[1] - before[1]) / l, py = (after[0] - before[0]) / l;
        const rr = r * (j === 1 ? .64 : .49);
        c.beginPath(); c.moveTo(joint[0] - px * rr, joint[1] - py * rr);
        c.quadraticCurveTo(joint[0] + (after[0] - joint[0]) * .045, joint[1] + (after[1] - joint[1]) * .045, joint[0] + px * rr, joint[1] + py * rr);
        c.strokeStyle = '#9a665225'; c.lineWidth = Math.max(.35, r * .16); c.stroke();
      }
    }
    // Fine creases are surface styling tied to the measured palm geometry.
    const center = this.mix(points[0], points[9], .55);
    c.beginPath(); c.moveTo(points[1][0], points[1][1]);
    c.quadraticCurveTo(center[0], center[1], points[17][0], points[17][1]);
    c.strokeStyle = '#a7775e2c'; c.lineWidth = Math.max(.4, radius * .18); c.stroke();
  }

  clear() {
    this.data = null; this.frame = null; this.bounds = null;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
  dispose() { this.resizeObserver.disconnect(); this.clear(); this.canvas.remove(); }
}
