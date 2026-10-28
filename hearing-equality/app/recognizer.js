// An experimental nearest-template matcher, not a trained RSL translator.
// Coordinates retain an explicit missing-data mask. No guessed hand points.
const BODY = [13, 14, 15, 16];
const finitePoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
export function featureFrame(frame, aspect = 1) {
  const p = frame?.pose;
  if (!finitePoint(p?.[11]) || !finitePoint(p?.[12]) ||
      (p[11][3] ?? 1) < .45 || (p[12][3] ?? 1) < .45) return null;
  const cx = (p[11][0] + p[12][0]) / 2, cy = (p[11][1] + p[12][1]) / 2;
  const scale = Math.hypot((p[11][0] - p[12][0]) * aspect, p[11][1] - p[12][1]);
  if (scale < .025) return null;
  const points = BODY.map(i => finitePoint(p[i]) && (p[i][3] ?? 1) > .4
    ? [(p[i][0] - cx) * aspect / scale, (p[i][1] - cy) / scale] : null);
  for (const side of ['left', 'right']) {
    const hand = frame[side], wrist = hand?.[0];
    const palm = finitePoint(wrist) && finitePoint(hand?.[9])
      ? Math.hypot((hand[9][0] - wrist[0]) * aspect, hand[9][1] - wrist[1]) : 0;
    for (let i = 0; i < 21; i++) points.push(palm > .005 && finitePoint(hand[i])
      ? [(hand[i][0] - wrist[0]) * aspect / palm, (hand[i][1] - wrist[1]) / palm] : null);
  }
  return { points, hands: Number(Boolean(frame.left?.length)) + Number(Boolean(frame.right?.length)) };
}
export function makeSequence(frames, aspect = 1) {
  return frames.map(f => featureFrame(f, aspect)).filter(Boolean);
}
function sample(seq, count = 40) {
  if (seq.length <= count) return seq;
  return Array.from({ length: count }, (_, i) => seq[Math.round(i * (seq.length - 1) / (count - 1))]);
}
export function frameDistance(a, b) {
  let total = 0, weight = 0;
  for (let i = 0; i < a.points.length; i++) {
    const x = a.points[i], y = b.points[i], w = i < 4 ? 6 : .35;
    if (!x && !y) continue;
    weight += w;
    total += w * (!x || !y ? .8 : Math.min(2, Math.hypot(x[0] - y[0], x[1] - y[1])));
  }
  return weight ? total / weight : 2;
}
export function dtwDistance(first, second) {
  const a = sample(first), b = sample(second);
  if (!a.length || !b.length) return Infinity;
  let row = new Float64Array(b.length + 1).fill(Infinity); row[0] = 0;
  for (let i = 1; i <= a.length; i++) {
    const next = new Float64Array(b.length + 1).fill(Infinity);
    for (let j = 1; j <= b.length; j++) next[j] = frameDistance(a[i - 1], b[j - 1]) +
      Math.min(row[j], next[j - 1], row[j - 1]);
    row = next;
  }
  return row[b.length] / Math.max(a.length, b.length);
}
export function sequenceQuality(sequence) {
  if (sequence.length < 6) return 'Мало кадров с видимым корпусом. Повторите жест перед камерой.';
  if (sequence.filter(f => f.hands > 0).length / sequence.length < .3)
    return 'Кисти плохо видны. Покажите руки целиком и добавьте света.';
  const motion = Math.max(...sequence.map(f => frameDistance(f, sequence[0])));
  if (motion < .035) return 'Движение не обнаружено. Покажите один жест целиком.';
  return '';
}
export function classify(sequence, templates) {
  const issue = sequenceQuality(sequence);
  if (issue) return { accepted: false, issue, rankings: [] };
  const groups = new Map();
  for (const t of templates) {
    const distance = dtwDistance(sequence, t.sequence);
    if (!groups.has(t.id) || distance < groups.get(t.id).distance)
      groups.set(t.id, { id: t.id, text: t.text, origin: t.origin, distance });
  }
  const rankings = [...groups.values()].sort((a,b) => a.distance - b.distance);
  const best = rankings[0], gap = rankings[1] ? rankings[1].distance - best.distance : Infinity;
  const accepted = Boolean(best && best.distance < .42 && gap > .055);
  return { accepted, rankings, issue: accepted ? '' : 'Нет уверенного совпадения. Повторите жест или запишите свой образец.' };
}
