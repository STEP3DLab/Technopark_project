// Presentation camera only. Measurements and hand geometry remain unchanged.
// Classify a resting hand once over the whole clip, never while playing it.
const SIDES = [['left', 15], ['right', 16]];
const valid = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const median = (values, fallback) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b), i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};
const spread = points => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return points.length ? Math.hypot(maxX - minX, maxY - minY) : Infinity;
};

function restingHand(frames, poses, side, sw, sh, shoulder) {
  // A single still image cannot establish that a hand stays at rest.
  if (frames.length < 12 || poses.some(p => !valid(p?.[11]) || !valid(p?.[12]))) return false;
  const hands = frames.map(frame => frame[side]);
  if (hands.some(hand => hand?.length !== 21 || !hand.every(valid))) return false;
  let minimumWristY = Infinity, minimumPointY = Infinity;
  for (let i = 0; i < hands.length; i++) {
    const shoulderY = (poses[i][11][1] + poses[i][12][1]) / 2;
    minimumWristY = Math.min(minimumWristY, (hands[i][0][1] - shoulderY) * sh / shoulder);
    for (const point of hands[i]) minimumPointY = Math.min(minimumPointY, (point[1] - shoulderY) * sh / shoulder);
  }
  if (minimumWristY <= 1.50 || minimumPointY <= 1.35) return false;
  if (spread(hands.map(hand => [hand[0][0] * sw / shoulder, hand[0][1] * sh / shoulder])) > .20) return false;
  for (let i = 1; i < 21; i++) {
    const local = hands.map(hand => [(hand[i][0] - hand[0][0]) * sw / shoulder, (hand[i][1] - hand[0][1]) * sh / shoulder]);
    if (spread(local) > .18) return false;
  }
  return true;
}

/** A fixed envelope for this entire clip. Only a complete, distant, low hand
 * with little wrist motion AND little finger articulation may leave the frame.
 * Its pose wrist is excluded too; shoulder/elbow and all other hands are kept.
 * No pose or hand coordinates are edited, and no decision changes mid-clip.
 */
export function measureAvatarFrame(data, faceMap) {
  const sw = positive(data?.width, 1), sh = positive(data?.height, 1);
  const frames = Array.isArray(data?.frames) ? data.frames.filter(frame => frame && typeof frame === 'object') : [];
  const poses = frames.map(frame => frame.pose || frame.pose33);
  const shoulders = [], centersX = [], centersY = [];
  for (const pose of poses) {
    if (!valid(pose?.[11]) || !valid(pose?.[12])) continue;
    const width = Math.hypot((pose[11][0] - pose[12][0]) * sw, (pose[11][1] - pose[12][1]) * sh);
    if (width > 0) shoulders.push(width);
    centersX.push((pose[11][0] + pose[12][0]) * sw / 2);
    centersY.push((pose[11][1] + pose[12][1]) * sh / 2);
  }
  const shoulder = Math.max(1, median(shoulders, sw / 3));
  const cx = median(centersX, sw / 2), cy = median(centersY, sh / 2);
  const restingHands = SIDES.filter(([side]) => restingHand(frames, poses, side, sw, sh, shoulder)).map(([side]) => side);
  const excludedWrists = new Set(SIDES.filter(([side]) => restingHands.includes(side)).map(([, wrist]) => wrist));
  const foreheadIndex = faceMap?.get?.(10) ?? data?.face_indices?.indexOf?.(10);
  let minX = cx - shoulder * .64, maxX = cx + shoulder * .64;
  let minY = cy - shoulder, maxY = cy + shoulder * .94;
  const include = point => {
    if (!valid(point)) return;
    const x = point[0] * sw, y = point[1] * sh;
    minX = Math.min(minX, x - shoulder * .055); maxX = Math.max(maxX, x + shoulder * .055);
    minY = Math.min(minY, y - shoulder * .045); maxY = Math.max(maxY, y + shoulder * .055);
  };
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i], pose = poses[i];
    for (const id of [7, 8, 11, 12, 13, 14, 15, 16]) {
      const point = pose?.[id];
      if (!excludedWrists.has(id) && valid(point) && (point[3] == null || point[3] > .4)) include(point);
    }
    for (const side of ['left', 'right', 'face']) {
      if (restingHands.includes(side)) continue;
      for (const point of frame[side] || []) include(point);
    }
    const forehead = foreheadIndex >= 0 ? frame.face?.[foreheadIndex] : null;
    if (valid(forehead)) minY = Math.min(minY, forehead[1] * sh - shoulder * .145);
  }
  return { sw, sh, shoulder, centerX: (minX + maxX) / 2, minX, maxX, minY, maxY, restingHands };
}

/** Fit at the current viewport size. The 0.40-height shoulder cap reduces
 * extreme close-ups between words; it only reduces the full-envelope fit.
 * Recompute on resize, not per motion frame. top may reserve a warning label.
 */
export function fitAvatarFrame(bounds, width, height, { top, pad } = {}) {
  const w = positive(width, 1), h = positive(height, 1);
  const requestedPad = Number.isFinite(pad) ? Math.max(0, pad) : Math.max(9, Math.min(18, w * .022));
  const inset = Math.min(requestedPad, Math.max(0, Math.min(w, h) / 2 - .5));
  const upper = Math.min(Math.max(inset, Number.isFinite(top) ? top : inset), Math.max(0, h - inset - 1));
  const availableWidth = Math.max(1, w - inset * 2), availableHeight = Math.max(1, h - upper - inset);
  const bw = positive(bounds?.maxX - bounds?.minX, 1), bh = positive(bounds?.maxY - bounds?.minY, 1);
  const sourceShoulder = positive(bounds?.shoulder, 1);
  const scale = Math.min(availableWidth / bw, availableHeight / bh, availableHeight * .40 / sourceShoulder);
  return { scale, originX: w / 2, originY: upper + (availableHeight - bh * scale) * .44, shoulder: sourceShoulder * scale };
}
