// All coordinates belong to the game's virtual shield. The camera only supplies the backdrop.
const rad = Math.PI / 180;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const mix = (a, b, weightA, weightB) => a.map((value, i) => value * weightA + b[i] * weightB);
const neutral = {right: [1, 0, 0], up: [0, 0, 1], forward: [0, 1, 0]};

export function phoneAxes(alpha, beta, gamma, screenAngle = 0) {
  const [a, b, g, s] = [alpha, beta, gamma, screenAngle].map(value => value * rad);
  const [ca, cb, cg, cs] = [a, b, g, s].map(Math.cos);
  const [sa, sb, sg, ss] = [a, b, g, s].map(Math.sin);
  const right = [ca*cg-sa*sb*sg, sa*cg+ca*sb*sg, -cb*sg];
  const up = [-sa*cb, ca*cb, sb];
  return {right: mix(right, up, cs, -ss), up: mix(right, up, ss, cs),
    forward: [-ca*sg-sa*sb*cg, -sa*sg+ca*sb*cg, -cb*cg]};
}

export class ShieldView {
  constructor() {
    this.readEvent = event => {
      if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;
      const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
      this.axes = phoneAxes(event.alpha, event.beta, event.gamma, angle);
      this.anchor ??= this.axes;
    };
    this.stop();
  }

  enable() {
    this.stop();
    const motion = window.DeviceOrientationEvent;
    if (!motion) return;
    const token = this.token;
    const listen = () => {
      if (token === this.token) window.addEventListener('deviceorientation', this.readEvent);
    };
    if (typeof motion.requestPermission === 'function') {
      // Ask inside the same camera-button gesture on iOS. Touch aiming is always available.
      try { motion.requestPermission().then(result => { if (result === 'granted') listen(); }).catch(() => {}); } catch {}
    } else listen();
  }

  stop() {
    this.token = Symbol();
    globalThis.window?.removeEventListener('deviceorientation', this.readEvent);
    this.axes = this.anchor = null;
  }

  center() { this.anchor = this.axes; }

  target({width, height, aim, seconds, role, dodgeAge, dodgeSide}) {
    const anchor = this.anchor || neutral;
    const camera = this.axes || neutral;
    const phase = role === 'guest' ? 1.6 : -.8;
    const dodge = dodgeAge >= 0 && dodgeAge < 1250 ? Math.sin(Math.PI * dodgeAge / 1250) * dodgeSide : 0;
    const horizontal = .15 * Math.sin(seconds * .92 + phase) + .19 * dodge;
    const vertical = .075 * Math.sin(seconds * 1.35 - phase);
    const direction = anchor.forward.map((v, i) => v + horizontal * anchor.right[i] + vertical * anchor.up[i]);
    const depth = dot(direction, camera.forward);
    if (depth < .12) return {visible: false, hit: false};
    const focal = Math.max(width, height) * .79;
    const x = width * .5 + dot(direction, camera.right) * focal / depth;
    const y = height * .46 - dot(direction, camera.up) * focal / depth;
    const radius = Math.max(24, Math.min(width * .12, height * .068, 62));
    const visible = x + radius > 0 && y + radius > 0 && x - radius < width && y - radius < height;
    const hit = visible && Math.hypot(aim.x * width - x, aim.y * height - y) <= radius;
    return {visible, hit, confidence: 1, ageMs: 0, box: {x: (x-radius)/width, y: (y-radius)/height,
      w: 2*radius/width, h: 2*radius/height}};
  }
}
