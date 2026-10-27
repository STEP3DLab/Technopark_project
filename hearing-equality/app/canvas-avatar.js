/**
 * Front-facing, measured-landmark avatar for browsers without WebGL.
 * Geometry follows Slovo / MediaPipe samples; no missing hand configurations
 * are synthesized. Clothing and facial appearance are illustrative styling.
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
    this.faceMap = new Map();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  load(data) {
    this.data = data;
    this.faceMap = new Map((data.face_indices || []).map((id, i) => [id, i]));
    const sw = Number(data.width) || 1;
    const sh = Number(data.height) || 1;
    const cx = [], cy = [], shoulderWidths = [], points = [];
    for (const frame of data.frames || []) {
      const p = frame.pose || frame.pose33;
      if (p?.[11] && p?.[12]) {
        cx.push((p[11][0] + p[12][0]) * sw / 2);
        cy.push((p[11][1] + p[12][1]) * sh / 2);
        shoulderWidths.push(Math.hypot((p[11][0] - p[12][0]) * sw, (p[11][1] - p[12][1]) * sh));
      }
      for (const point of (p || []).slice(0, 25)) {
        if (this.valid(point) && (point[3] == null || point[3] > .4)) points.push([point[0] * sw, point[1] * sh]);
      }
      for (const key of ['left', 'right', 'face']) {
        for (const point of frame[key] || []) if (this.valid(point)) points.push([point[0] * sw, point[1] * sh]);
      }
    }
    const median = (a, fallback) => a.length ? [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)] : fallback;
    const centerX = median(cx, sw / 2);
    const centerY = median(cy, sh / 2);
    const shoulder = median(shoulderWidths, sw / 3);
    const xValues = points.map(p => p[0]);
    const yValues = points.map(p => p[1]);
    const minX = xValues.length ? Math.min(...xValues) : centerX - shoulder;
    const maxX = xValues.length ? Math.max(...xValues) : centerX + shoulder;
    const minY = yValues.length ? Math.min(...yValues) : centerY - shoulder;
    const maxY = yValues.length ? Math.max(...yValues) : centerY + shoulder;
    this.bounds = {
      centerX, centerY, shoulder, sw, sh,
      halfWidth: Math.max(centerX - minX, maxX - centerX, shoulder * .78) + shoulder * .12,
      minY: minY - shoulder * .18,
      maxY: Math.max(maxY + shoulder * .12, centerY + shoulder * .9),
    };
    this.showAt(0);
  }

  valid(p) { return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]); }

  resize() {
    const rect = this.container.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.width = rect.width;
    this.height = rect.height;
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
    const lower = Math.floor(at);
    const upper = Math.min(frames.length - 1, lower + 1);
    const t = at - lower;
    const a = frames[lower], b = frames[upper];
    const blend = (left, right) => {
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
    const top = 24;
    const bottom = Math.min(83, this.height * .17);
    const availableHeight = Math.max(30, this.height - top - bottom);
    this.scale = Math.min((this.width - 42) / (this.bounds.halfWidth * 2), availableHeight / (this.bounds.maxY - this.bounds.minY));
    this.originX = this.width / 2;
    this.originY = top + (availableHeight - (this.bounds.maxY - this.bounds.minY) * this.scale) / 2;
    const p = this.frame.pose.map(v => this.project(v));
    if (!p[11] || !p[12]) return;
    const shoulder = this.bounds.shoulder * this.scale;
    this.shoulder = shoulder;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const face = (id) => this.project(this.frame.face?.[this.faceMap.get(id)]);
    this.drawTorso(p, face);
    this.drawHead(p, face);
    const arms = [
      { a: p[11], b: p[13], d: this.project(this.frame.left?.[0]) || p[15], hand: this.frame.left },
      { a: p[12], b: p[14], d: this.project(this.frame.right?.[0]) || p[16], hand: this.frame.right },
    ].filter(arm => arm.a && arm.b && arm.d).sort((a, b) => (b.b[2] + b.d[2]) - (a.b[2] + a.d[2]));
    for (const arm of arms) this.drawArm(arm);
    // Hands are drawn from their measured 21 landmarks, or omitted when absent.
    for (const arm of arms) if (arm.hand) this.drawHand(arm.hand.map(v => this.project(v)));
    c.restore();
  }

  path(points, close = false) {
    const c = this.ctx;
    const filtered = points.filter(Boolean);
    if (filtered.length < 2) return false;
    c.beginPath(); c.moveTo(filtered[0][0], filtered[0][1]);
    for (let i = 1; i < filtered.length; i++) c.lineTo(filtered[i][0], filtered[i][1]);
    if (close) c.closePath();
    return true;
  }

  capsule(a, b, r1, r2, fill, stroke = null) {
    if (!a || !b) return;
    const c = this.ctx;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = length ? -(b[1] - a[1]) / length : 0;
    const ny = length ? (b[0] - a[0]) / length : 1;
    c.beginPath();
    c.moveTo(a[0] + nx * r1, a[1] + ny * r1);
    c.lineTo(b[0] + nx * r2, b[1] + ny * r2);
    c.quadraticCurveTo(b[0] + (b[0] - a[0]) / (length || 1) * r2, b[1] + (b[1] - a[1]) / (length || 1) * r2, b[0] - nx * r2, b[1] - ny * r2);
    c.lineTo(a[0] - nx * r1, a[1] - ny * r1);
    c.quadraticCurveTo(a[0] - (b[0] - a[0]) / (length || 1) * r1, a[1] - (b[1] - a[1]) / (length || 1) * r1, a[0] + nx * r1, a[1] + ny * r1);
    c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = .7; c.stroke(); }
  }

  drawTorso(p, face) {
    const c = this.ctx, s = this.shoulder;
    const left = p[11], right = p[12];
    const cx = (left[0] + right[0]) / 2, cy = (left[1] + right[1]) / 2;
    const hipA = p[23] || [left[0], cy + s * .95];
    const hipB = p[24] || [right[0], cy + s * .95];
    const lower = Math.max(hipA[1], hipB[1], cy + s * .75);
    const minX = Math.min(left[0], right[0]), maxX = Math.max(left[0], right[0]);
    const cloth = c.createLinearGradient(minX, cy, maxX, lower);
    cloth.addColorStop(0, '#268b91'); cloth.addColorStop(.45, '#1e777e'); cloth.addColorStop(1, '#115762');
    c.beginPath();
    c.moveTo(minX + s * .08, cy - s * .025);
    c.quadraticCurveTo(cx, cy - s * .36, maxX - s * .08, cy - s * .025);
    c.quadraticCurveTo(maxX + s * .06, cy + s * .12, maxX - s * .02, cy + s * .43);
    c.lineTo(cx + s * .39, lower);
    c.quadraticCurveTo(cx, lower + s * .04, cx - s * .39, lower);
    c.lineTo(minX + s * .02, cy + s * .43);
    c.quadraticCurveTo(minX - s * .06, cy + s * .12, minX + s * .08, cy - s * .025);
    c.closePath(); c.fillStyle = cloth; c.fill();
    c.strokeStyle = '#63a6a53a'; c.lineWidth = 1; c.stroke();
    // Neck tracks the face and shoulder centre; this geometry is decorative.
    const chin = face(152) || [(p[9]?.[0] + p[10]?.[0]) / 2 || cx, cy - s * .27];
    const neckTop = [chin[0], chin[1] - s * .04];
    const neckBase = [cx, cy - s * .16];
    this.capsule(neckTop, neckBase, s * .09, s * .115, '#d7a68a');
    c.beginPath(); c.ellipse(cx, cy - s * .16, s * .13, s * .045, 0, 0, Math.PI);
    c.strokeStyle = '#124a57'; c.lineWidth = Math.max(2, s * .025); c.stroke();
    c.beginPath(); c.moveTo(cx - s * .22, cy + s * .28); c.lineTo(cx - s * .22, lower - s * .08);
    c.strokeStyle = '#69b4b015'; c.lineWidth = s * .025; c.stroke();
  }

  drawHead(p, face) {
    const c = this.ctx, s = this.shoulder;
    const forehead = face(10), chin = face(152);
    const sideA = face(234) || p[7], sideB = face(454) || p[8];
    if (!sideA || !sideB) return;
    const cx = (sideA[0] + sideB[0]) / 2;
    const cy = forehead && chin ? (forehead[1] + chin[1]) / 2 : (sideA[1] + sideB[1]) / 2;
    const headW = Math.max(Math.hypot(sideB[0] - sideA[0], sideB[1] - sideA[1]) * .53, s * .18);
    const headH = forehead && chin ? Math.hypot(chin[0] - forehead[0], chin[1] - forehead[1]) * .55 : headW * 1.28;
    const angle = Math.atan2(sideB[1] - sideA[1], sideB[0] - sideA[0]);
    const rotation = Math.abs(angle) > Math.PI / 2 ? angle - Math.sign(angle) * Math.PI : angle;
    const skin = c.createLinearGradient(cx - headW, cy - headH, cx + headW, cy + headH);
    skin.addColorStop(0, '#f3d1b6'); skin.addColorStop(.55, '#e5b99b'); skin.addColorStop(1, '#c68e75');
    c.save(); c.translate(cx, cy); c.rotate(rotation);
    for (const x of [-headW, headW]) { c.beginPath(); c.ellipse(x, 0, headW * .14, headH * .19, 0, 0, Math.PI * 2); c.fillStyle = '#d4a084'; c.fill(); }
    c.beginPath(); c.ellipse(0, 0, headW, headH, 0, 0, Math.PI * 2); c.fillStyle = skin; c.fill();
    c.strokeStyle = '#663e2e28'; c.lineWidth = .8; c.stroke();
    c.beginPath();
    c.moveTo(-headW * .96, -headH * .2);
    c.bezierCurveTo(-headW * 1.05, -headH * .96, -headW * .3, -headH * 1.17, headW * .35, -headH * 1.03);
    c.bezierCurveTo(headW * .95, -headH * .98, headW * 1.03, -headH * .43, headW * .94, -headH * .25);
    c.lineTo(headW * .75, -headH * .62);
    c.bezierCurveTo(headW * .34, -headH * .55, -headW * .22, -headH * .92, -headW * .74, -headH * .59);
    c.closePath(); c.fillStyle = '#34383b'; c.fill();
    c.restore();
    // Facial curves use measured corners, eyelids, brows and lip contour.
    const stroke = (ids, color, width, close = false) => {
      const points = ids.map(face);
      if (points.every(Boolean) && this.path(points, close)) { c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
    };
    const faceWidth = Math.max(1, headW * 2);
    stroke([33, 160, 158, 133], '#544742', Math.max(1.1, faceWidth * .014));
    stroke([263, 387, 385, 362], '#544742', Math.max(1.1, faceWidth * .014));
    stroke([70, 63, 105, 66, 107], '#56504a', Math.max(1.4, faceWidth * .023));
    stroke([300, 293, 334, 296, 336], '#56504a', Math.max(1.4, faceWidth * .023));
    const nose = face(4), top = face(6);
    if (nose && top) { c.beginPath(); c.moveTo(top[0], top[1]); c.quadraticCurveTo(nose[0] + headW * .055, nose[1], nose[0] - headW * .055, nose[1]); c.strokeStyle = '#b681685d'; c.lineWidth = Math.max(1, headW * .025); c.stroke(); }
    const mouth = [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91].map(face);
    if (mouth.every(Boolean) && this.path(mouth, true)) { c.fillStyle = '#a86d64'; c.fill(); c.strokeStyle = '#9d645d'; c.lineWidth = .6; c.stroke(); }
    const lipTop = face(13), lipBottom = face(14), mouthL = face(61), mouthR = face(291);
    if (lipTop && lipBottom && mouthL && mouthR) {
      const opening = Math.hypot(lipBottom[0] - lipTop[0], lipBottom[1] - lipTop[1]);
      c.beginPath(); c.moveTo(mouthL[0], mouthL[1]); c.quadraticCurveTo(lipTop[0], lipTop[1], mouthR[0], mouthR[1]); c.quadraticCurveTo(lipBottom[0], lipBottom[1], mouthL[0], mouthL[1]); c.fillStyle = '#593d3d'; c.fill();
      if (opening < 1.2) { c.strokeStyle = '#774e4a'; c.lineWidth = .8; c.stroke(); }
    }
  }

  drawArm({ a, b, d }) {
    const c = this.ctx, s = this.shoulder;
    const sleeveEnd = [a[0] + (b[0] - a[0]) * .65, a[1] + (b[1] - a[1]) * .65];
    const cloth = c.createLinearGradient(a[0] - s * .1, a[1], b[0] + s * .1, b[1]);
    cloth.addColorStop(0, '#269098'); cloth.addColorStop(1, '#1b6772');
    this.capsule(a, b, s * .104, s * .068, '#d4a58b');
    this.capsule(a, sleeveEnd, s * .12, s * .095, cloth, '#2f9a9840');
    const skin = c.createLinearGradient(b[0], b[1], d[0] + s * .06, d[1]);
    skin.addColorStop(0, '#d9aa8f'); skin.addColorStop(.5, '#edc3a6'); skin.addColorStop(1, '#dbab8e');
    this.capsule(b, d, s * .07, s * .044, skin, '#74534235');
  }

  drawHand(points) {
    if (!points || points.length < 21 || points.some(p => !p)) return;
    const c = this.ctx;
    const width = Math.hypot(points[5][0] - points[17][0], points[5][1] - points[17][1]);
    const length = Math.hypot(points[0][0] - points[9][0], points[0][1] - points[9][1]);
    const radius = Math.max(1.3, Math.min(this.shoulder * .024, Math.max(width * .108, length * .06)));
    const skin = c.createLinearGradient(points[0][0], points[0][1], points[9][0], points[9][1]);
    skin.addColorStop(0, '#e3b799'); skin.addColorStop(.65, '#f2ceb0'); skin.addColorStop(1, '#e3b699');
    // Palm silhouette, built from real wrist and MCP positions.
    if (this.path([points[0], points[1], points[2], points[5], points[9], points[13], points[17]], true)) {
      c.fillStyle = skin; c.fill(); c.lineWidth = Math.max(.65, radius * .26); c.strokeStyle = '#865d4b6b'; c.stroke();
    }
    const fingers = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
    fingers.sort((a, b) => points[b[2]][2] - points[a[2]][2]);
    for (const ids of fingers) {
      for (let i = 0; i < 3; i++) {
        const r1 = radius * (1 - i * .13), r2 = radius * (1 - (i + 1) * .13);
        this.capsule(points[ids[i]], points[ids[i + 1]], r1, r2, '#f0c9ab', '#82574380');
      }
      const tip = points[ids[3]];
      c.beginPath(); c.arc(tip[0], tip[1], Math.max(.6, radius * .48), 0, Math.PI * 2); c.fillStyle = '#f4d8be'; c.fill();
    }
    // Subtle palm creases convey shape without inventing additional fingers.
    const mid = [(points[5][0] + points[17][0]) / 2, (points[5][1] + points[17][1]) / 2];
    c.beginPath(); c.moveTo(points[1][0], points[1][1]); c.quadraticCurveTo(mid[0], mid[1], points[17][0], points[17][1]);
    c.strokeStyle = '#b4876c55'; c.lineWidth = Math.max(.6, radius * .2); c.stroke();
  }

  clear() { this.data = null; this.frame = null; this.bounds = null; this.ctx.clearRect(0, 0, this.width, this.height); }
  dispose() { this.resizeObserver.disconnect(); this.clear(); this.canvas.remove(); }
}
