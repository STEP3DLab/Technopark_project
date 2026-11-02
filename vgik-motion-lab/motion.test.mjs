import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, DEFAULT_POSE, DEFAULT_SETTINGS, POSE_LIMITS, sanitizePose,
  validateProject, sampleTimeline, upsertKeyframe, removeKeyframe, toProgram,
} from './motion.js';

const frame = (id, time, base, subject = 0) => ({ id, time, pose: { ...DEFAULT_POSE, base, subject } });
const project = () => createProject();

test('default orbit has finite bounded poses and exact demonstration endpoints', () => {
  const p = project();
  assert.equal(p.duration, 8);
  assert.equal(p.fps, 12);
  assert.deepEqual(p.keyframes.map((k) => [k.time, k.pose.base, k.pose.subject]), [[0, -22, 0], [4, 0, 50], [8, 22, 100]]);
  for (let time = 0; time <= 8; time += 0.03125) {
    const pose = sampleTimeline(p.keyframes, time);
    for (const [key, [min, max]] of Object.entries(POSE_LIMITS)) {
      assert.ok(Number.isFinite(pose[key]) && pose[key] >= min && pose[key] <= max);
    }
  }
});

test('sampling does not mutate source and clamps before/after the sequence', () => {
  const frames = [frame('end', 8, 30, 100), frame('start', 0, -30)];
  const snapshot = JSON.stringify(frames);
  assert.equal(sampleTimeline(frames, -9).base, -30);
  assert.equal(sampleTimeline(frames, 99).base, 30);
  assert.equal(sampleTimeline(frames, 4, { easing: 'linear' }).subject, 50);
  assert.equal(JSON.stringify(frames), snapshot);
});

test('hold jumps only at a key, including exact endpoint', () => {
  const frames = [frame('a', 0, -20), frame('b', 2, 15), frame('c', 4, 40)];
  assert.equal(sampleTimeline(frames, 1.999, { easing: 'hold' }).base, -20);
  assert.equal(sampleTimeline(frames, 2, { easing: 'hold' }).base, 15);
  assert.equal(sampleTimeline(frames, 3.999, { easing: 'hold' }).base, 15);
  assert.equal(sampleTimeline(frames, 4, { easing: 'hold' }).base, 40);
});

test('smooth interpolation has eased starts; equal timestamps have a deterministic winner', () => {
  const frames = [frame('a', 0, 0), frame('old', 4, 20), frame('new', 4, 40)];
  assert.equal(sampleTimeline(frames, 4).base, 40);
  assert.equal(sampleTimeline(frames, 1, { easing: 'linear' }).base, 10);
  assert.equal(sampleTimeline(frames, 1, { easing: 'smooth' }).base, 6.25);
});

test('single/empty tracks and invalid interactive numbers have a usable finite pose', () => {
  assert.deepEqual(sampleTimeline([], 3), DEFAULT_POSE);
  assert.equal(sampleTimeline([frame('only', 4, 12)], 0).base, 12);
  const safe = sanitizePose({ base: Infinity, shoulder: -1000, focal: '85', subject: NaN, unsafe: true });
  assert.equal(safe.base, DEFAULT_POSE.base);
  assert.equal(safe.shoulder, POSE_LIMITS.shoulder[0]);
  assert.equal(safe.focal, DEFAULT_POSE.focal);
  assert.equal(safe.subject, DEFAULT_POSE.subject);
  assert.ok(!('unsafe' in safe));
});

test('import rejects malformed, nonfinite and excessive data with readable errors', () => {
  assert.throws(() => validateProject('{'), /JSON/);
  assert.throws(() => validateProject(' '.repeat(500001)), /слишком большой/);
  assert.throws(() => validateProject({ ...project(), duration: 1e12 }), /Длительность/);
  assert.throws(() => validateProject({ ...project(), fps: 1.2 }), /целым числом/);
  assert.throws(() => validateProject({ ...project(), version: 2 }), /версия/);
  assert.throws(() => validateProject({ ...project(), keyframes: Array.from({ length: 129 }, (_, i) => frame(`f${i}`, i / 20, 0)) }), /128/);
  assert.throws(() => validateProject({ ...project(), keyframes: [frame('f', NaN, 1)] }), /конечным числом/);
  assert.throws(() => validateProject({ ...project(), keyframes: [frame('f', 0, Infinity)] }), /конечным числом/);
  assert.throws(() => validateProject({ ...project(), keyframes: [frame('f', 9, 0)] }), /пределами/);
});

test('JSON round trip is deterministic and unsafe or unknown fields do not propagate', () => {
  const p = project();
  const payload = JSON.parse(JSON.stringify(p));
  payload.secret = 'ignored';
  payload.keyframes[0].pose.script = 'ignored';
  payload.keyframes[0].pose.base = 999;
  const imported = validateProject(JSON.stringify(payload));
  assert.equal(imported.keyframes[0].pose.base, 65);
  assert.ok(!('secret' in imported));
  assert.ok(!('script' in imported.keyframes[0].pose));
  assert.deepEqual(validateProject(JSON.stringify(imported)), imported);
  const withProto = JSON.stringify(p).replace('"version":1', '"__proto__":{"polluted":true},"version":1');
  assert.ok(!Object.hasOwn(validateProject(withProto), '__proto__'));
  assert.equal({}.polluted, undefined);
});

test('duplicate identities fail while equal timestamps resolve to the last key', () => {
  assert.throws(() => validateProject({ ...project(), keyframes: [frame('a', 0, 0), frame('a', 1, 10)] }), /повторяется/);
  const p = validateProject({ ...project(), keyframes: [frame('a', 0, 0), frame('b', 0, 20), frame('c', 8, 40)] });
  assert.equal(p.keyframes.length, 2);
  assert.equal(p.keyframes[0].id, 'b');
});

test('scene settings persist and imported controls remain typed and whitelisted', () => {
  assert.deepEqual(project().settings, DEFAULT_SETTINGS);
  const p = validateProject({ ...project(), settings: { subjectType: 'rocket', grid: false, path: false, injected: 'ignored' } });
  assert.equal(p.settings.subjectType, 'rocket');
  assert.equal(p.settings.grid, false);
  assert.equal(p.settings.path, false);
  assert.equal(p.settings.autoAim, true);
  assert.ok(!('injected' in p.settings));
  assert.throws(() => validateProject({ ...project(), settings: { autoAim: 'false' } }), /true или false/);
  assert.throws(() => validateProject({ ...project(), settings: { subjectType: 'arbitrary' } }), /объект съёмки/);
});

test('editing keys replaces ID or time, sorts and preserves caller-owned state', () => {
  const original = [frame('a', 0, 0), frame('b', 4, 10), frame('c', 8, 20)];
  const moved = upsertKeyframe(original, frame('b', 6, 30));
  assert.deepEqual(moved.map((k) => k.time), [0, 6, 8]);
  const replaced = upsertKeyframe(moved, frame('new', 6, 40));
  assert.equal(replaced.length, 3);
  assert.equal(replaced[1].id, 'new');
  assert.deepEqual(removeKeyframe(replaced, 'new').map((k) => k.id), ['a', 'c']);
  assert.equal(original[1].time, 4);
});

test('program explicitly identifies simulator format and exports each interval plus final still', () => {
  const code = toProgram(project());
  assert.match(code, /Не является программой для физического робота/);
  assert.match(code, /FRAMES 97/);
  assert.equal((code.match(/^CAPTURE /gm) ?? []).length, 97);
  assert.match(code, /AT 8s\nMOVE J1=22 .*SUBJECT=100/);
  assert.ok(!code.includes('NaN') && !code.includes('Infinity'));
  assert.match(code, /WAIT UNTIL_POSE_READY/);
});
