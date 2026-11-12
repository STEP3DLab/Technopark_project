// Ink topology of the 11 × 8 invader. Screen-space angles are clockwise.
export const MASK = Object.freeze([
  '00100000100',
  '00010001000',
  '00111111100',
  '01101110110',
  '11111111111',
  '10111111101',
  '10100000101',
  '00011011000'
]);

const samples = [];
for (let row = 0; row < MASK.length; row++) {
  for (let col = 0; col < MASK[row].length; col++) {
    samples.push([col - 5, row - 3, MASK[row][col] === '1']);
  }
}
// The surrounding skin is part of the shape test, especially below the feet.
for (const x of [-4, -2, 0, 2, 4]) samples.push([x, -4, false], [x, 5, false]);
for (const y of [-1, 1, 3]) samples.push([-6, y, false], [6, y, false]);
const darkCount = samples.filter(point => point[2]).length;
const paleCount = samples.length - darkCount;
let buffers;

function prepare({ data, width, height }) {
  const scale = Math.min(1, 440 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  if (!buffers || buffers.w !== w || buffers.h !== h) {
    buffers = {
      w, h, gray: new Uint8Array(w * h), binary: new Uint8Array(w * h),
      integral: new Uint32Array((w + 1) * (h + 1)), flood: new Int32Array(w * h)
    };
  }
  const { gray, integral } = buffers;
  const sx = width / w;
  const sy = height / h;
  const stride = w + 1;
  for (let y = 0; y < h; y++) {
    const sourceRow = Math.floor((y + 0.5) * sy) * width;
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const i = (sourceRow + Math.floor((x + 0.5) * sx)) * 4;
      const value = (data[i] * 3 + data[i + 1] * 5 + data[i + 2] * 2) / 10 | 0;
      gray[y * w + x] = value;
      sum += value;
      integral[(y + 1) * stride + x + 1] = sum + integral[y * stride + x + 1];
    }
  }
  return { ...buffers, sx, sy };
}

function threshold(frame, radius) {
  const { w, h, integral, gray, binary } = frame;
  const stride = w + 1;
  for (let y = 1; y < h - 1; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(h, y + radius + 1);
    const upper = top * stride;
    const lower = bottom * stride;
    for (let x = 1; x < w - 1; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(w, x + radius + 1);
      const sum = integral[lower + right] - integral[upper + right] -
        integral[lower + left] + integral[upper + left];
      const i = y * w + x;
      // An eye is a small pocket of bright skin enclosed by darker ink.
      binary[i] = (gray[i] - 8) * ((right - left) * (bottom - top)) > sum ? 1 : 0;
    }
  }
}

function findEyeCandidates(frame) {
  const { w, h, binary, flood } = frame;
  const result = [];
  const maxSize = Math.min(w, h) * 0.18;
  const maxArea = maxSize * maxSize;
  for (let seed = w + 1; seed < (h - 1) * w; seed++) {
    if (!binary[seed]) continue;
    let head = 0, end = 1, sumX = 0, sumY = 0;
    let xMin = w, xMax = 0, yMin = h, yMax = 0;
    flood[0] = seed;
    binary[seed] = 0;
    while (head < end) {
      const p = flood[head++];
      const y = Math.floor(p / w);
      const x = p - y * w;
      xMin = Math.min(x, xMin); xMax = Math.max(x, xMax);
      yMin = Math.min(y, yMin); yMax = Math.max(y, yMax);
      sumX += x; sumY += y;
      if (binary[p - 1]) { binary[p - 1] = 0; flood[end++] = p - 1; }
      if (binary[p + 1]) { binary[p + 1] = 0; flood[end++] = p + 1; }
      if (binary[p - w]) { binary[p - w] = 0; flood[end++] = p - w; }
      if (binary[p + w]) { binary[p + w] = 0; flood[end++] = p + w; }
    }
    const dx = xMax - xMin + 1, dy = yMax - yMin + 1;
    if (end < 4 || end > maxArea || dx > 2.5 * dy || dy > 2.5 * dx ||
        dx > maxSize || dy > maxSize || end < dx * dy * 0.43) continue;
    result.push({ x: sumX / end, y: sumY / end, area: end });
  }
  // Bound pair matching on very noisy frames. The larger isolated pockets
  // correspond to a marker close enough for a stable pose.
  if (result.length > 180) {
    result.sort((a, b) => b.area - a.area);
    result.length = 180;
  }
  return result;
}

function boxSampler(frame, pitch) {
  const { w, integral } = frame;
  const stride = w + 1;
  const r = Math.max(0, Math.floor(pitch * 0.13));
  return (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (!r) return frame.gray[y * w + x];
    const lower = (y + r + 1) * stride, upper = (y - r) * stride;
    return (integral[lower + x + r + 1] - integral[upper + x + r + 1] -
      integral[lower + x - r] + integral[upper + x - r]) / ((2 * r + 1) ** 2);
  };
}

function verify(frame, mx, my, ux, uy, vx, vy, sample) {
  const { w, h } = frame;
  const margin = Math.floor(Math.hypot(ux, uy) * 0.13) + 1;
  // All samples and their averaging kernels must lie in the camera frame.
  const spanX = 6 * Math.abs(ux) + 4.5 * Math.abs(vx) + margin;
  const spanY = 6 * Math.abs(uy) + 4.5 * Math.abs(vy) + margin;
  const cx = mx + 0.5 * vx, cy = my + 0.5 * vy;
  if (cx < spanX || cx + spanX >= w || cy < spanY || cy + spanY >= h) return 0;

  const eye = (sample(mx - 2 * ux, my - 2 * uy) + sample(mx + 2 * ux, my + 2 * uy)) / 2;
  const face = (sample(mx, my) + sample(mx + vx, my + vy) + sample(mx - vx, my - vy)) / 3;
  if (eye - face < 11) return 0;
  const gap = sample(mx + 3 * vx, my + 3 * vy);
  if (gap < face + 4) return 0;
  let ink = 0, skin = 0, squares = 0;
  for (const [x, y, dark] of samples) {
    const value = sample(mx + x * ux + y * vx, my + x * uy + y * vy);
    if (dark) ink += value;
    else skin += value;
    squares += value * value;
  }
  const delta = skin / paleCount - ink / darkCount;
  if (delta < 16) return 0;
  const n = samples.length;
  const variance = n * squares - (ink + skin) ** 2;
  return variance > 0 ? delta * Math.sqrt(darkCount * paleCount / variance) : 0;
}

function selectMatch(frame, eyes, best) {
  for (let i = 0; i < eyes.length; i++) {
    const a = eyes[i];
    for (let j = i + 1; j < eyes.length; j++) {
      const b = eyes[j];
      if (a.area > 3.7 * b.area || b.area > 3.7 * a.area) continue;
      const dx = (b.x - a.x) / 4, dy = (b.y - a.y) / 4;
      const pitch2 = dx * dx + dy * dy;
      const area = (a.area + b.area) / 2;
      if (pitch2 < 8 || pitch2 < area * 0.53 || pitch2 > 4.1 * area ||
          pitch2 * 64 > frame.w * frame.w + frame.h * frame.h) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const pitch = Math.sqrt(pitch2);
      const sample = boxSampler(frame, pitch);
      if ((sample(a.x, a.y) + sample(b.x, b.y)) / 2 < sample(mx, my) + 9) continue;
      for (const dir of [1, -1]) {
        const ux = dir * dx, uy = dir * dy;
        for (const ratio of [1, 0.78, 1.23]) {
          for (const shear of [0, -0.18, 0.18]) {
            const vx = -uy * ratio + ux * shear, vy = ux * ratio + uy * shear;
            const score = verify(frame, mx, my, ux, uy, vx, vy, sample);
            if (score >= 0.77 && score > (best?.score ?? 0)) {
              best = {
                x: (mx + 0.5 * vx + 0.5) * frame.sx, y: (my + 0.5 * vy + 0.5) * frame.sy,
                width: 11 * Math.hypot(ux * frame.sx, uy * frame.sy),
                angle: Math.atan2(uy * frame.sy, ux * frame.sx), score
              };
            }
          }
        }
      }
    }
  }
  return best;
}

/** Locate the tattoo in an unmirrored camera frame; return null when uncertain. */
export function detect(imageData) {
  if (!imageData?.data || imageData.width < 32 || imageData.height < 32) return null;
  const frame = prepare(imageData);
  let best = null;
  for (const radius of [13, 28, 6]) {
    threshold(frame, radius);
    best = selectMatch(frame, findEyeCandidates(frame), best);
    if (best && best.score > 0.90) break;
  }
  return best;
}
