import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measureAvatarFrame, fitAvatarFrame } from '../app/avatar-framing.js';
import { prepareMotion, sampleMotion } from '../app/avatar-motion.js';
import { handMetrics } from '../app/hand-geometry.js';

const root = new URL('../app/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('assets/sources/slovo-sources.json', root)));
const clips = catalog.samples.map(item => ({ id: item.id, data: JSON.parse(readFileSync(new URL(`assets/motion/${item.file.replace('.mp4', '.json')}`, root))) }));

test('only the two distant resting hands leave the fixed frame; other hands remain protected', () => {
  const actual = clips.map(({ id, data }) => [id, measureAvatarFrame(data).restingHands]);
  assert.deepEqual(actual, [['hello', ['left']], ['yes', []], ['good', []], ['question', []], ['friend', ['left']], ['work', []]]);
});

test('all active fingers and facial landmarks stay inside portrait, comparison and desktop viewports for every frame', () => {
  for (const { id, data } of clips) {
    const bounds = measureAvatarFrame(data, new Map(data.face_indices.map((value, i) => [value, i])));
    for (const [width, height] of [[600, 390], [300, 390], [350, 310], [180, 310], [900, 620]]) {
      const fit = fitAvatarFrame(bounds, width, height, { top: 42 });
      const initial = JSON.stringify(fit);
      for (const frame of data.frames) {
        for (const part of ['left', 'right', 'face']) {
          if (bounds.restingHands.includes(part)) continue;
          for (const point of frame[part] || []) {
            const x = fit.originX + (point[0] * bounds.sw - bounds.centerX) * fit.scale;
            const y = fit.originY + (point[1] * bounds.sh - bounds.minY) * fit.scale;
            assert.ok(x >= 0 && x <= width && y >= 42 && y <= height, `${id}/${part} clipped in ${width}×${height}`);
          }
        }
      }
      assert.equal(JSON.stringify(fit), initial);
      assert.ok(fit.shoulder <= height * .40);
    }
  }
});

test('smoothed subframes and the visible width of every active finger fit the fixed frame', () => {
  for (const { id, data } of clips) {
    const track = prepareMotion(data), bounds = measureAvatarFrame(data);
    for (const [width, height] of [[600, 390], [300, 390], [350, 310], [180, 310], [900, 620]]) {
      const fit = fitAvatarFrame(bounds, width, height, { top: 42 });
      const project = point => [
        fit.originX + (point[0] * bounds.sw - bounds.centerX) * fit.scale,
        fit.originY + (point[1] * bounds.sh - bounds.minY) * fit.scale,
        point[2],
      ];
      for (let step = 0; step <= (track.frames.length - 1) * 4; step++) {
        const frame = sampleMotion(track, step / (track.fps * 4), { smooth: true });
        for (const side of ['left', 'right']) {
          if (bounds.restingHands.includes(side) || !frame[side]) continue;
          const points = frame[side].map(project), { fingerRadius, wristRadius } = handMetrics(points, fit.shoulder);
          for (let i = 0; i < points.length; i++) {
            const [x, y] = points[i], radius = i === 0 ? wristRadius : fingerRadius * 1.10;
            assert.ok(x - radius >= 0 && x + radius <= width && y - radius >= 42 && y + radius <= height,
              `${id}/${side}/${i}: visible hand edge clipped at ${step / 4} in ${width}×${height}`);
          }
        }
        for (const point of frame.face || []) {
          const [x, y] = project(point);
          assert.ok(x >= 0 && x <= width && y >= 42 && y <= height, `${id}: smoothed face leaves the fixed frame`);
        }
      }
    }
  }
});

test('finger articulation, an upward excursion or missing tracking prevent the resting-hand crop', () => {
  const original = clips.find(clip => clip.id === 'friend').data;
  const changed = () => structuredClone(original);
  const raising = changed(); raising.frames[10].left[0][1] = raising.frames[10].pose[11][1];
  assert.deepEqual(measureAvatarFrame(raising).restingHands, []);
  const signing = changed(); signing.frames[10].left[8][0] += .2;
  assert.deepEqual(measureAvatarFrame(signing).restingHands, []);
  const missing = changed(); missing.frames[10].left = null;
  assert.deepEqual(measureAvatarFrame(missing).restingHands, []);
});

test('measurement never mutates recorded data and empty or invalid inputs return finite geometry', () => {
  for (const { data } of clips) {
    const before = JSON.stringify(data), first = measureAvatarFrame(data);
    fitAvatarFrame(first, 600, 390); fitAvatarFrame(first, 350, 310);
    assert.equal(JSON.stringify(data), before); assert.deepEqual(measureAvatarFrame(data), first);
  }
  for (const data of [undefined, {}, { width: NaN, height: Infinity, frames: [null, {}, { pose: [] }] }]) {
    const bounds = measureAvatarFrame(data), fit = fitAvatarFrame(bounds, NaN, -5, { top: Infinity, pad: -10 });
    for (const [key, value] of Object.entries(bounds)) if (key !== 'restingHands') assert.ok(Number.isFinite(value), key);
    for (const value of Object.values(fit)) assert.ok(Number.isFinite(value));
    assert.ok(fit.scale > 0); assert.deepEqual(bounds.restingHands, []);
  }
});
