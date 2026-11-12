/* PULSE DUEL — original, device-local procedural art and visual effects. */
const ACID = '#d5ff72';
const IRIS = '#afa6ff';
const INK = '#080a0b';
const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgba(hex, alpha) { return `rgba(${rgb(hex).join(',')},${clamp(alpha)})`; }
function seeded(index) { const n = Math.sin(index * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }

export class DuelEffects {
  constructor(canvas, { mode = 'hero', reducedMotion } = {}) {
    if (!canvas?.getContext) throw new Error('DuelEffects requires a canvas.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.mode = mode;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.target = null;
    this.particles = [];
    this.beams = [];
    this.damageAt = -10000;
    this.victoryAt = -10000;
    this.victoryWon = false;
    this.shotAt = -10000;
    this.time = 0;
    this.last = 0;
    this.raf = 0;
    this.destroyed = false;
    this.media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reduced = reducedMotion ?? this.media?.matches ?? false;
    this.onMedia = (event) => { if (reducedMotion === undefined) this.reduced = event.matches; };
    this.media?.addEventListener?.('change', this.onMedia);
    this.onResize = () => this.resize();
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onResize) : null;
    this.resizeObserver?.observe(canvas);
    if (!this.resizeObserver) globalThis.addEventListener?.('resize', this.onResize);
    this.resize();
    this.frame = (now) => {
      if (this.destroyed) return;
      const dt = this.last ? Math.min((now - this.last) / 1000, .05) : .016;
      this.last = now;
      if (!document.hidden) {
        this.time += dt;
        this.draw(now, dt);
      }
      this.raf = requestAnimationFrame(this.frame);
    };
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    this.dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setMode(mode) {
    if (!['hero', 'game', 'training'].includes(mode)) return;
    this.mode = mode;
    this.target = null;
    this.particles.length = 0;
    this.beams.length = 0;
    this.damageAt = this.victoryAt = this.shotAt = -10000;
    this.resize();
  }

  setTarget(target) {
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) { this.target = null; return; }
    this.target = { x: target.x, y: target.y, w: target.w || .2, h: target.h || .25, locked: !!target.locked };
  }

  getTrainingTarget() {
    const t = this.reduced ? 0 : this.time;
    const x = .5 + Math.sin(t * .68) * .19;
    const y = .43 + Math.sin(t * .94 + .5) * .065;
    const r = Math.min(this.width * .125, this.height * .11);
    return { x: x - r / this.width, y: y - r / this.height, w: r * 2 / this.width, h: r * 2 / this.height, visible: true, hit: false };
  }

  shot({ hit = false, x = .5, y = .46, color = ACID } = {}) {
    const now = performance.now();
    this.shotAt = now;
    this.beams.push({ at: now, x: clamp(x), y: clamp(y), hit, color });
    if (this.beams.length > 6) this.beams.shift();
    const n = this.reduced ? 6 : hit ? 36 : 11;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const speed = (hit ? 50 : 25) + Math.random() * (hit ? 190 : 75);
      this.particles.push({ x: x * this.width, y: y * this.height, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .3 + Math.random() * .45, max: .75, size: .8 + Math.random() * 2, color, gravity: hit ? 60 : 0 });
    }
    if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
  }

  damage() { this.damageAt = performance.now(); }

  victory(won = true) {
    this.victoryAt = performance.now();
    this.victoryWon = won;
    if (!won) { this.damage(); return; }
    const count = this.reduced ? 16 : 100;
    for (let i = 0; i < count; i++) {
      const side = i % 2;
      this.particles.push({ x: this.width * (side ? .9 : .1), y: this.height * .7, vx: (side ? -1 : 1) * (20 + Math.random() * 180), vy: -80 - Math.random() * 350, life: 1.3 + Math.random() * 1.3, max: 2.6, size: 1.5 + Math.random() * 2.5, color: i % 3 ? ACID : IRIS, gravity: 180 });
    }
    if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
  }

  draw(now, dt) {
    const c = this.ctx;
    if (!c || this.width < 2 || this.height < 2) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    if (this.mode === 'hero') this.drawHero();
    else if (this.mode === 'training') this.drawTraining(now);
    if (this.mode !== 'hero') {
      this.drawTarget();
      this.drawBeams(now);
      this.drawDamage(now);
    }
    this.drawParticles(dt);
  }

  glow(x, y, radius, color, alpha = .16) {
    const c = this.ctx;
    const g = c.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(.42, rgba(color, alpha * .33));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  drawHero() {
    const c = this.ctx, w = this.width, h = this.height;
    const t = this.reduced ? 1.8 : this.time;
    const r = Math.min(w * .154, h * .235);
    const ax = w * .28, ay = h * .6 + Math.sin(t * .65) * 4;
    const bx = w * .72, by = h * .36 + Math.sin(t * .65 + 2.5) * 4;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    c.save();
    this.glow(ax, ay, r * 3.2, ACID, .14);
    this.glow(bx, by, r * 3.2, IRIS, .19);
    // A tilted, sparse arena gives the energy cores a common plane.
    c.save();
    c.translate(w * .5, h * .5);
    c.rotate(-.23);
    c.scale(1, .58);
    for (let ring = 1; ring <= 4; ring++) {
      c.beginPath();
      c.ellipse(0, 0, r * (1.4 + ring * .72), r * (1.4 + ring * .72), 0, 0, TAU);
      c.strokeStyle = `rgba(225,235,235,${.055 - ring * .007})`;
      c.lineWidth = 1;
      c.stroke();
    }
    c.restore();
    // Small orbital sparks are deterministic: no frame-by-frame visual noise.
    for (let i = 0; i < 30; i++) {
      const x = (seeded(i + 2) * w + Math.sin(t * .18 + i) * 8) % w;
      const y = seeded(i + 50) * h;
      const a = .09 + .16 * (.5 + .5 * Math.sin(t * .9 + i));
      c.fillStyle = i % 3 ? rgba(ACID, a) : rgba(IRIS, a);
      c.fillRect(x, y, i % 5 === 0 ? 3 : 1.2, 1.2);
    }
    // Two streams meet at a small electric knot, never a full-screen flash.
    c.save();
    c.globalCompositeOperation = 'lighter';
    const beam = c.createLinearGradient(ax, ay, bx, by);
    beam.addColorStop(0, rgba(ACID, .12));
    beam.addColorStop(.45, rgba(ACID, .75));
    beam.addColorStop(.5, 'rgba(245,255,240,.95)');
    beam.addColorStop(.55, rgba(IRIS, .8));
    beam.addColorStop(1, rgba(IRIS, .12));
    for (const [width, alpha] of [[16, .055], [5, .14], [1.2, .8]]) {
      c.strokeStyle = beam;
      c.lineWidth = width;
      c.globalAlpha = alpha;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const progress = ((t * .18 + i * .21) % 1);
      const x = ax + (bx - ax) * progress, y = ay + (by - ay) * progress;
      c.fillStyle = progress < .5 ? ACID : IRIS;
      c.beginPath(); c.arc(x, y, 1.1, 0, TAU); c.fill();
    }
    this.glow(mx, my, r * .48, '#f0ffcf', .25);
    c.restore();
    this.drawCore(ax, ay, r, ACID, t * .12, 1);
    this.drawCore(bx, by, r * .88, IRIS, -t * .1 + .7, -1);
    // Very fine technical framing and identifiers sit outside each silhouette.
    this.coreLabel(ax, ay, r, '01', 'PULSE', ACID, -1);
    this.coreLabel(bx, by, r * .88, '02', 'ECHO', IRIS, 1);
    c.save();
    c.translate(mx, my);
    c.rotate(Math.PI / 4);
    c.strokeStyle = 'rgba(239,244,232,.38)'; c.lineWidth = 1;
    c.strokeRect(-5, -5, 10, 10);
    c.restore();
    c.restore();
  }

  coreLabel(x, y, radius, number, title, color, direction) {
    const c = this.ctx;
    const labelX = x + direction * radius * 1.12;
    const labelY = y + (direction < 0 ? radius * 1.2 : -radius * 1.32);
    c.save();
    c.strokeStyle = rgba(color, .35); c.lineWidth = .8;
    c.beginPath();
    c.moveTo(x + direction * radius * .65, y + (direction < 0 ? radius * .95 : -radius * .95));
    c.lineTo(labelX, labelY); c.lineTo(labelX + direction * 24, labelY); c.stroke();
    c.textAlign = direction < 0 ? 'left' : 'right';
    c.font = '600 9px ui-monospace, SFMono-Regular, monospace';
    c.fillStyle = rgba(color, .85);
    c.fillText(number, labelX + (direction < 0 ? 0 : 0), labelY - 6);
    c.fillStyle = 'rgba(210,218,213,.48)';
    c.font = '500 7px ui-monospace, SFMono-Regular, monospace';
    c.fillText(title, labelX, labelY + 12);
    c.restore();
  }

  drawCore(x, y, r, color, rotation = 0, direction = 1, hit = 0) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    // Outer gimbal: discrete bright arcs over a thin circular guide.
    c.strokeStyle = rgba(color, .16); c.lineWidth = .8;
    c.beginPath(); c.arc(0, 0, r * 1.24, 0, TAU); c.stroke();
    c.save(); c.rotate(rotation);
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = rgba(color, i % 2 ? .22 : .65);
      c.lineWidth = i % 2 ? 1 : 2;
      c.beginPath(); c.arc(0, 0, r * 1.25, i * Math.PI / 2 + .1, i * Math.PI / 2 + .75); c.stroke();
    }
    for (let i = 0; i < 36; i++) {
      const a = i * TAU / 36;
      const inner = r * (i % 3 ? 1.32 : 1.3), outer = r * 1.35;
      c.strokeStyle = rgba(color, i % 3 ? .13 : .5); c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); c.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); c.stroke();
    }
    c.restore();
    this.glow(0, 0, r * 1.7, color, .13 + hit * .2);
    // Obsidian polygon shell, with quiet metallic faces.
    const shell = c.createLinearGradient(-r, -r, r, r);
    shell.addColorStop(0, '#323a37'); shell.addColorStop(.28, '#121817'); shell.addColorStop(.64, '#060a09'); shell.addColorStop(1, '#252c29');
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + Math.PI / 8;
      i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fillStyle = shell; c.fill();
    c.strokeStyle = rgba(color, .55); c.lineWidth = 1; c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + Math.PI / 8;
      const b = a + TAU / 8;
      c.beginPath();
      c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      c.lineTo(Math.cos(b) * r, Math.sin(b) * r);
      c.lineTo(Math.cos(b) * r * .67, Math.sin(b) * r * .67);
      c.lineTo(Math.cos(a) * r * .67, Math.sin(a) * r * .67);
      c.closePath();
      c.fillStyle = i === 4 || i === 5 ? rgba(color, .11) : i === 0 || i === 1 ? 'rgba(0,0,0,.2)' : 'rgba(215,235,225,.035)'; c.fill();
      c.strokeStyle = 'rgba(235,255,240,.065)'; c.lineWidth = .6; c.stroke();
    }
    c.beginPath(); c.arc(0, 0, r * .65, 0, TAU);
    c.fillStyle = '#050807'; c.fill(); c.strokeStyle = rgba(color, .3); c.lineWidth = 1.5; c.stroke();
    c.save(); c.rotate(-rotation * .55);
    c.strokeStyle = rgba(color, .7); c.lineWidth = 1.3;
    c.beginPath(); c.arc(0, 0, r * .53, .15, Math.PI * .93); c.stroke();
    c.beginPath(); c.arc(0, 0, r * .53, Math.PI + .15, TAU - .24); c.stroke();
    c.restore();
    const lensX = direction * r * .06;
    const lens = c.createRadialGradient(lensX - r * .08, -r * .08, 1, lensX, 0, r * .38);
    lens.addColorStop(0, '#f6ffe8'); lens.addColorStop(.1, color); lens.addColorStop(.42, rgba(color, .75)); lens.addColorStop(.7, rgba(color, .12)); lens.addColorStop(1, rgba(color, .025));
    c.fillStyle = lens; c.beginPath(); c.arc(lensX, 0, r * .39, 0, TAU); c.fill();
    c.strokeStyle = rgba(color, .6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(-r * .3, 0); c.lineTo(-r * .13, 0); c.moveTo(r * .13, 0); c.lineTo(r * .3, 0); c.stroke();
    // Four small armature lights make the object read as a device, not a flat badge.
    for (const a of [.25, Math.PI - .25, Math.PI + .25, TAU - .25]) {
      c.fillStyle = color;
      c.save(); c.translate(Math.cos(a) * r * .78, Math.sin(a) * r * .78); c.rotate(a); c.fillRect(-r * .065, -1, r * .13, 2); c.restore();
    }
    c.restore();
  }

  drawTraining(now) {
    const c = this.ctx, w = this.width, h = this.height;
    c.fillStyle = INK; c.fillRect(0, 0, w, h);
    this.glow(w * .5, h * .42, Math.min(w, h) * .72, IRIS, .12);
    const horizon = h * .58;
    c.strokeStyle = 'rgba(175,166,255,.065)'; c.lineWidth = 1;
    for (let i = -8; i <= 8; i++) {
      c.beginPath(); c.moveTo(w * .5 + i * 16, horizon); c.lineTo(w * .5 + i * w * .24, h); c.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const y = horizon + (h - horizon) * Math.pow(i / 6, 1.8);
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }
    const box = this.getTrainingTarget();
    const x = (box.x + box.w / 2) * w, y = (box.y + box.h / 2) * h;
    const r = box.w * w * .5;
    const hitAge = (now - this.shotAt) / 1000;
    const hit = this.beams.at(-1)?.hit && hitAge < .3 ? (1 - hitAge / .3) : 0;
    this.drawCore(x, y, r * .86, IRIS, this.reduced ? 0 : this.time * .25, -1, hit);
    c.save();
    c.fillStyle = 'rgba(230,233,226,.55)'; c.textAlign = 'center';
    c.font = '500 10px ui-monospace, SFMono-Regular, monospace';
    c.fillText('ТРЕНИРОВОЧНАЯ ЦЕЛЬ', x, y + r * 1.65);
    c.restore();
  }

  drawTarget() {
    const t = this.target;
    if (!t) return;
    const c = this.ctx;
    const x = t.x * this.width, y = t.y * this.height, w = t.w * this.width, h = t.h * this.height;
    if (this.mode === 'game') {
      const color = t.locked ? ACID : IRIS;
      this.glow(x+w/2, y+h/2, w, color, .23);
      this.drawCore(x+w/2, y+h/2, w*.43, color, this.reduced ? 0 : this.time*.44, -1);
      return;
    }
    const size = Math.min(19, w * .2, h * .14);
    c.save();
    c.strokeStyle = t.locked ? rgba(ACID, .95) : 'rgba(242,246,240,.45)';
    c.lineWidth = t.locked ? 2 : 1;
    c.lineCap = 'square';
    for (const [xx, yy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      c.beginPath(); c.moveTo(xx + dx * size, yy); c.lineTo(xx, yy); c.lineTo(xx, yy + dy * size); c.stroke();
    }
    if (t.locked) {
      c.fillStyle = rgba(ACID, .045); c.fillRect(x, y, w, h);
      c.fillStyle = ACID; c.beginPath(); c.arc(x + w / 2, y - 8, 2, 0, TAU); c.fill();
    }
    c.restore();
  }

  drawBeams(now) {
    const c = this.ctx, w = this.width, h = this.height;
    this.beams = this.beams.filter((b) => now - b.at < 460);
    for (const b of this.beams) {
      const age = (now - b.at) / 1000;
      const fade = Math.pow(clamp(1 - age / .25), 2);
      const x = b.x * w, y = b.y * h;
      if (fade > 0) {
        c.save(); c.globalCompositeOperation = 'lighter';
        const beam = c.createLinearGradient(w * .5, h * .9, x, y);
        beam.addColorStop(0, rgba(b.color, 0)); beam.addColorStop(.2, rgba(b.color, fade * .8)); beam.addColorStop(1, rgba(b.color, fade));
        for (const [width, alpha] of [[14, .08], [5, .3], [1.5, 1]]) {
          c.globalAlpha = alpha; c.strokeStyle = beam; c.lineWidth = width;
          c.beginPath(); c.moveTo(w * .5, h * .91); c.lineTo(x, y); c.stroke();
        }
        c.globalAlpha = 1;
        this.glow(w * .5, h * .86, 48, b.color, fade * .3);
        this.glow(x, y, b.hit ? 60 : 24, b.color, fade * .4);
        c.restore();
      }
      if (b.hit && age < .46) {
        const progress = age / .46;
        c.save(); c.strokeStyle = rgba(b.color, .7 * (1 - progress)); c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, 8 + progress * (this.reduced ? 12 : 44), 0, TAU); c.stroke();
        // Compact hit mark remains legible even over a bright camera image.
        for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
          c.beginPath(); c.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); c.lineTo(x + Math.cos(a) * 17, y + Math.sin(a) * 17); c.stroke();
        }
        c.restore();
      }
    }
  }

  drawDamage(now) {
    const c = this.ctx, w = this.width, h = this.height;
    const age = (now - this.damageAt) / 1000;
    if (age >= 0 && age < .7) {
      const alpha = (1 - age / .7) * (this.reduced ? .22 : .42);
      const g = c.createRadialGradient(w / 2, h / 2, w * .15, w / 2, h / 2, Math.max(w, h) * .72);
      g.addColorStop(0, 'rgba(255,104,110,0)'); g.addColorStop(.6, `rgba(255,104,110,${alpha * .1})`); g.addColorStop(1, `rgba(255,104,110,${alpha})`);
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = `rgba(255,126,134,${alpha})`; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
    }
    const winAge = (now - this.victoryAt) / 1000;
    if (this.victoryWon && winAge >= 0 && winAge < 1.5) {
      this.glow(w * .5, h * .45, Math.max(w, h) * .6, ACID, .1 * (1 - winAge / 1.5));
    }
  }

  drawParticles(dt) {
    const c = this.ctx;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt;
      p.vx *= 1 - dt * .8;
      c.globalAlpha = clamp(p.life / Math.min(p.max, .45));
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.media?.removeEventListener?.('change', this.onMedia);
    if (!this.resizeObserver) globalThis.removeEventListener?.('resize', this.onResize);
    this.particles.length = this.beams.length = 0;
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }
}
