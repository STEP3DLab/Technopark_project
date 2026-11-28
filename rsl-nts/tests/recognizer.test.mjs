import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classify, describe} from '../recognizer.mjs';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const model = readJson('../assets/model.json');
const samples = Object.fromEntries(['question', 'help', 'outside'].map(name => [
  name, readJson(`../samples/${name}.json`)
]));
const clone = value => structuredClone(value);
const emptyClip = () => ({aspect: 4 / 3, frames: Array.from({length: 16}, () => [])});
const visibleHand = samples.help.frames.find(frame => frame.length)[0];

test('saved Slovo fixtures retain their original model outputs', async t => {
  const expected = [
    {sample: 'question', word: 'вопрос', score: 0.9990727591852431, valid: 15},
    {sample: 'help', word: 'помочь', score: 0.9997028911804519, valid: 16},
    // The annotated sign is «дом». This remains an honest, known false positive.
    {sample: 'outside', word: 'вода', score: 0.9509278416043476, valid: 15}
  ];
  for (const item of expected) {
    await t.test(item.sample, () => {
      const clip = samples[item.sample];
      const original = clone(clip);
      const result = classify(clip, model);
      assert.equal(result.word, item.word);
      assert.equal(result.accepted, true);
      assert.equal(result.valid, item.valid);
      assert.ok(Math.abs(result.score - item.score) < 1e-12);
      assert.equal(result.alternatives.length, 3);
      assert.equal(result.alternatives[0].word, result.word);
      assert.equal(describe(clip).features.length, 416);
      assert.deepEqual(clip, original, 'classification must not mutate captured data');
    });
  }
});

test('a clip with no detected hands is rejected even at a zero score threshold', () => {
  const result = classify(emptyClip(), {...model, threshold: 0});
  assert.equal(result.valid, 0);
  assert.equal(result.accepted, false);
  assert.ok(Number.isFinite(result.score));
  assert.deepEqual(describe(emptyClip()).features, Array(416).fill(0));
});

test('the configured minimum visible-frame count is enforced at its boundary', () => {
  const clip = emptyClip();
  for (let i = 0; i < 4; i++) clip.frames[i] = [clone(visibleHand)];
  const openThreshold = {...model, threshold: 0, minFrames: 5};
  assert.equal(classify(clip, openThreshold).accepted, false);
  clip.frames[4] = [clone(visibleHand)];
  const result = classify(clip, openThreshold);
  assert.equal(result.valid, 5);
  assert.equal(result.accepted, true);
});

test('the score threshold is inclusive and cannot be bypassed', () => {
  const clip = samples.question;
  const {score} = classify(clip, model);
  assert.equal(classify(clip, {...model, threshold: score}).accepted, true);
  assert.equal(classify(clip, {...model, threshold: score + 1e-8}).accepted, false);
});

test('malformed clips fail closed before returning a candidate', async t => {
  const cases = [
    ['null input', () => null],
    ['missing frames', () => ({aspect: 1})],
    ['wrong frame count', () => ({aspect: 1, frames: Array.from({length: 15}, () => [])})],
    ['non-array frames', () => ({aspect: 1, frames: {length: 16}})],
    ['sparse frames', () => ({aspect: 1, frames: Array(16)})],
    ['invalid frame', clip => { clip.frames[0] = null; return clip; }],
    ['too many hands', clip => { clip.frames[0] = [visibleHand, visibleHand, visibleHand]; return clip; }],
    ['unknown hand side', clip => { clip.frames[0] = [{...clone(visibleHand), side: 'unknown'}]; return clip; }],
    ['wrong landmark count', clip => { clip.frames[0] = [{...clone(visibleHand), landmarks: []}]; return clip; }],
    ['wrong point dimensions', clip => { clip.frames[0] = [clone(visibleHand)]; clip.frames[0][0].landmarks[0] = [0, 0]; return clip; }],
    ['sparse point', clip => { clip.frames[0] = [clone(visibleHand)]; clip.frames[0][0].landmarks[0] = Array(3); return clip; }]
  ];
  for (const aspect of [0, -1, NaN, Infinity, '1']) {
    cases.push([`invalid aspect ${String(aspect)}`, clip => ({...clip, aspect})]);
  }
  for (const coordinate of [NaN, Infinity, -Infinity, '0', null]) {
    cases.push([`invalid coordinate ${String(coordinate)}`, clip => {
      clip.frames[0] = [clone(visibleHand)];
      clip.frames[0][0].landmarks[3][2] = coordinate;
      return clip;
    }]);
  }
  for (const [name, make] of cases) {
    await t.test(name, () => {
      const clip = make(emptyClip());
      assert.throws(() => describe(clip), TypeError);
      assert.throws(() => classify(clip, model), TypeError);
    });
  }
});

test('malformed models cannot produce accepted results', async t => {
  const cases = [
    ['null model', () => null],
    ['missing model', () => ({})],
    ['weight row count', value => { value.weights.pop(); return value; }],
    ['feature count', value => { value.weights[0].pop(); return value; }],
    ['non-array weight row', value => { value.weights[0] = {length: 416}; return value; }],
    ['sparse weights', value => { value.weights[0] = Array(416); return value; }],
    ['bias count', value => { value.bias.pop(); return value; }],
    ['empty vocabulary', value => ({...value, words: []})],
    ['duplicate label', value => { value.words[0] = value.words[1]; return value; }],
    ['empty label', value => { value.words[0] = ' '; return value; }],
    ['non-string label', value => { value.words[0] = 42; return value; }]
  ];
  for (const threshold of [NaN, Infinity, -0.1, 1.1, '0.5']) {
    cases.push([`invalid threshold ${String(threshold)}`, value => ({...value, threshold})]);
  }
  for (const minFrames of [NaN, 0, -1, 17, 4.5, '5']) {
    cases.push([`invalid minFrames ${String(minFrames)}`, value => ({...value, minFrames})]);
  }
  for (const invalid of [NaN, Infinity, -Infinity, '0', null]) {
    cases.push([`invalid weight ${String(invalid)}`, value => { value.weights[0][0] = invalid; return value; }]);
    cases.push([`invalid bias ${String(invalid)}`, value => { value.bias[0] = invalid; return value; }]);
  }
  for (const [name, make] of cases) {
    await t.test(name, () => {
      assert.throws(() => classify(samples.help, make(clone(model))), TypeError);
    });
  }
});

test('numeric overflow fails closed even when input numbers are finite', () => {
  const clip = clone(samples.help);
  clip.aspect = Number.MAX_VALUE;
  const hand = clip.frames.find(frame => frame.length)[0];
  hand.landmarks[0][0] = Number.MAX_VALUE;
  assert.throws(() => describe(clip), TypeError);

  const invalidModel = clone(model);
  invalidModel.weights = invalidModel.weights.map(row => row.map(() => Number.MAX_VALUE));
  invalidModel.bias = invalidModel.bias.map(() => Number.MAX_VALUE);
  assert.throws(() => classify(samples.help, invalidModel), TypeError);
});
