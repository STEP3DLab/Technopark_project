import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DISTANCE_GRID, GAP_GRID, PRODUCTION_POLICY, auditSelection, validateFeatures,
  validateSequence, applyPolicy, rankAttempts, summarizePredictions, calibrateThresholds,
} from '../app/research-metrics.js';
import { classify } from '../app/recognizer.js';
import {
  sha256, experimentPaths, runCalibration, runEvaluation, verifyCandidateSeal,
} from '../scripts/research-evaluate-v019.mjs';

const LABELS = [
  { id: 'hello', text: 'Привет!' }, { id: 'yes', text: 'да' },
  { id: 'good', text: 'хорошо' }, { id: 'question', text: 'вопрос' },
  { id: 'friend', text: 'друг' }, { id: 'work', text: 'работать' },
];
const clone = value => JSON.parse(JSON.stringify(value));
function sequence(offset = 0) {
  return Array.from({ length: 8 }, (_, frame) => ({
    points: Array.from({ length: 46 }, (_, i) => [offset + frame * .1 + i * .003, frame * .04]),
    hands: 1,
  }));
}
function meta(clip, split = 'validation', role = 'known', id = 'hello', user = split + '-user', text) {
  return {
    clip_id: clip, user_id: user, text: text ?? LABELS.find(label => label.id === id)?.text ?? 'unknown',
    id, split, role, official_split: split === 'test' ? 'test' : 'train',
    archive_path: (split === 'test' ? 'test' : 'train') + '/' + clip + '.mp4',
  };
}
function ranking(overrides = {}) {
  return {
    ...meta('clip'), extraction_status: 'ok', nearest: 'hello', distance: .1, gap: .5, gap_infinite: false,
    rankings: [{ id: 'hello', text: 'Привет!', distance: .1 }, { id: 'yes', text: 'да', distance: .6 }],
    ranking_issue: '', ranking_refusal: null, ...overrides,
  };
}

test('research acceptance preserves the production strict threshold boundaries', () => {
  const rows = [
    ranking({ clip_id: 'distance-equal', distance: .42 }),
    ranking({ clip_id: 'gap-equal', gap: .055 }),
    ranking({ clip_id: 'inside', distance: .419999, gap: .055001 }),
  ];
  assert.deepEqual(applyPolicy(rows, PRODUCTION_POLICY).map(row => row.accepted), [false, false, true]);
  const templates = [
    { id: 'hello', text: 'Привет!', sequence: sequence(0) },
    { id: 'yes', text: 'да', sequence: sequence(.9) },
  ];
  for (const offset of [.01, .4, .45, 1.5]) {
    const entry = { ...meta('real-dtw-' + offset), sequence: sequence(offset), extraction_status: 'ok' };
    const raw = classify(entry.sequence, templates);
    const measured = applyPolicy(rankAttempts([entry], templates, classify), PRODUCTION_POLICY)[0];
    assert.equal(measured.accepted, raw.accepted, 'Acceptance drift for offset ' + offset);
  }
});

test('calibration disables the candidate when no correct known acceptance can avoid unknown false accepts', () => {
  const rows = [
    ranking({ clip_id: 'known', distance: .31, gap: .3 }),
    ranking({ ...meta('unknown', 'validation', 'unknown', '__unknown__'), distance: .01, gap: .9 }),
  ];
  const candidate = calibrateThresholds(rows, LABELS);
  assert.deepEqual(candidate.policy, { enabled: false, distance: null, gap: null });
  assert.equal(candidate.summary.known.correct, 0);
  assert.equal(candidate.summary.overall.accepted, 0);
  assert.equal(candidate.summary.overall.selective_error.denominator, 0);
  assert.equal(candidate.summary.overall.selective_error.value, null);
  assert.equal(candidate.grid.length, DISTANCE_GRID.length * GAP_GRID.length);
});

test('fixed grid maximizes correct known then prefers lower distance and higher gap', () => {
  const rows = [
    ranking({ clip_id: 'a', distance: .22, gap: .19 }),
    ranking({ clip_id: 'b', distance: .239, gap: .19 }),
    ranking({ ...meta('u', 'validation', 'unknown', '__unknown__'), distance: .9, gap: .7 }),
  ];
  const candidate = calibrateThresholds(rows, LABELS);
  assert.deepEqual(candidate.policy, { enabled: true, distance: .24, gap: .16 });
  assert.equal(candidate.summary.known.correct, 2);
  assert.equal(candidate.summary.unknown.false_accept, 0);
  assert.equal(candidate.grid.length, 147);
  assert.throws(() => calibrateThresholds([ranking({ split: 'test' })], LABELS), /Calibration must not see/);
});

test('known/unknown denominators, confusion and unrepresented classes remain separate', () => {
  const rows = [
    ranking({ clip_id: 'correct' }),
    ranking({ clip_id: 'wrong', id: 'yes', nearest: 'hello' }),
    ranking({ clip_id: 'reject', distance: .8 }),
    ranking({ ...meta('false-accept', 'test', 'unknown', '__unknown__') }),
    ranking({ ...meta('unknown-reject', 'test', 'unknown', '__unknown__'), distance: .9 }),
  ];
  const summary = summarizePredictions(applyPolicy(rows, PRODUCTION_POLICY), LABELS);
  assert.deepEqual([summary.known.correct, summary.known.wrong, summary.known.rejected], [1, 1, 1]);
  assert.deepEqual(summary.known.selective_error, { numerator: 1, denominator: 2, value: .5 });
  assert.deepEqual(summary.unknown.false_accept_rate, { numerator: 1, denominator: 2, value: .5 });
  assert.deepEqual(summary.overall.selective_error, { numerator: 2, denominator: 3, value: 2 / 3 });
  assert.equal(summary.confusion.counts.flat().reduce((a, b) => a + b, 0), 5);
  const friend = summary.by_known_class.find(row => row.id === 'friend');
  assert.equal(friend.evaluation_status, 'not_evaluated');
  assert.equal(friend.correct_of_all.value, null);
});

test('participant corrections and review flags never change objective benchmark scores', () => {
  const clean = ranking({ id: 'yes', nearest: 'hello' });
  const edited = { ...clean, corrected: true, review: 'correct', reviewed_expected: 'hello', participant_confirmed: true, corrected_text: 'да', correct: true, outcome: 'correct' };
  const a = applyPolicy([clean], PRODUCTION_POLICY), b = applyPolicy([edited], PRODUCTION_POLICY);
  assert.deepEqual(a, b);
  assert.equal(b[0].outcome, 'wrong');
  assert.equal('review' in b[0], false);
});

test('extraction and tracking failures remain rejected attempts and never receive fabricated top-1 labels', () => {
  let calls = 0;
  const rows = rankAttempts([
    { ...meta('failed'), extraction_status: 'failed', sequence: [], error: 'Video decode failed' },
    { ...meta('no-tracking'), extraction_status: 'ok', sequence: [] },
  ], [], () => { calls++; return { rankings: [], accepted: false, issue: 'Missing tracking' }; });
  const summary = summarizePredictions(applyPolicy(rows, PRODUCTION_POLICY), LABELS);
  assert.equal(calls, 1);
  assert.equal(summary.known.total, 2);
  assert.equal(summary.known.rejected, 2);
  assert.equal(summary.known.top1_correct, 0);
  assert.deepEqual(summary.rejection_reasons, { extraction_failed: 1, sequence_quality: 1 });
});

function syntheticFixture() {
  const entries = [];
  for (let i = 0; i < 76; i++) entries.push(meta('train-' + i, 'train', 'known', LABELS[i % 6].id, 'train-user-' + i % 7));
  for (let i = 0; i < 13; i++) entries.push(meta('val-known-' + i, 'validation', 'known', LABELS[i % 6].id, 'validation-user'));
  for (let i = 0; i < 30; i++) entries.push(meta('val-unknown-' + i, 'validation', 'unknown', '__unknown__', 'validation-user', 'validation-only-label-' + i));
  let index = 0;
  for (const [id, count] of [['hello', 3], ['good', 2], ['question', 3], ['work', 3], ['yes', 2]]) {
    for (let i = 0; i < count; i++) entries.push(meta('test-known-' + index, 'test', 'known', id, 'test-user-' + index++));
  }
  for (let i = 0; i < 60; i++) entries.push(meta('test-unknown-' + i, 'test', 'unknown', '__unknown__', 'test-user-' + ((13 + i) % 46), 'test-only-label-' + Math.floor(i / 2)));
  const historical = Array.from({ length: 12 }, (_, i) => ({ ...meta('history-' + i, 'test', 'known', LABELS[i % 6].id, 'history-user-' + i), sequence: sequence() }));
  const selection = {
    schema_version: 1, protocol: 'hearing-equality-v019', date: '2026-11-11', seed: 'synthetic-test-only',
    source: { sha256: sha256('synthetic'), rows: 20400 }, known_labels: LABELS,
    validation_signer: 'validation-user',
    historical_holdout: { clips: 12, signers_excluded: historical.map(row => row.user_id) },
    split_summary: { train: { clips: 76, signers: 7, known: 76, unknown: 0 }, validation: { clips: 43, signers: 1, known: 13, unknown: 30 }, test: { clips: 73, signers: 46, known: 13, unknown: 60 } },
    known_test_class_counts: { 'Привет!': 3, 'хорошо': 2, 'вопрос': 3, 'работать': 3, 'да': 2 },
    limitations: ['Synthetic fixtures for pipeline tests, not research evidence.'], entries,
  };
  const selectionBytes = JSON.stringify(selection, null, 2) + '\n';
  const features = {
    schema_version: 1, selection_sha256: sha256(selectionBytes), extractor: { name: 'synthetic-test-only' },
    entries: entries.map((entry, i) => {
      const frames = sequence(); frames[0].points[0][0] = i;
      return { ...entry, sha256: sha256('synthetic-video-' + i), frame_count: 8, tracking_counts: { pose: 8, left: 8, right: 0, face: 8 }, extraction_status: 'ok', sequence: frames };
    }),
  };
  const production = features.entries.filter(entry => entry.split === 'train' && ['train-user-0', 'train-user-1', 'train-user-2'].includes(entry.user_id)).slice(0, 21).map(clone);
  return { selection, selectionBytes, features, historical, production };
}

test('selection auditor rejects signer, historical, duplicate-clip and unknown-label leakage', () => {
  const f = syntheticFixture();
  const audit = auditSelection(f.selection, { historical: f.historical, production: f.production });
  assert.equal(audit.production_test_signer_overlap, 0);
  let changed = clone(f.selection);
  changed.entries.find(row => row.split === 'test').user_id = changed.entries[0].user_id;
  assert.throws(() => auditSelection(changed, { historical: f.historical, production: f.production, strictCounts: false }), /Signer leakage/);
  changed = clone(f.selection); changed.entries[0].user_id = f.historical[0].user_id;
  assert.throws(() => auditSelection(changed, { historical: f.historical, production: f.production, strictCounts: false }), /Historical signer leakage/);
  changed = clone(f.selection); changed.entries[1] = clone(changed.entries[0]);
  assert.throws(() => auditSelection(changed, { historical: f.historical, production: f.production, strictCounts: false }), /Duplicate clip/);
  changed = clone(f.selection);
  for (const row of changed.entries.filter(row => row.split === 'test' && row.text === 'test-only-label-0')) row.text = 'validation-only-label-0';
  assert.throws(() => auditSelection(changed, { historical: f.historical, production: f.production }), /Unknown-label leakage/);
});

test('feature schema rejects dropped attempts, source duplicates, malformed points and excessive tracking counts', () => {
  const f = syntheticFixture(), hash = sha256(f.selectionBytes);
  assert.equal(validateFeatures(f.features, f.selection, hash).test.length, 73);
  let changed = clone(f.features); changed.entries.pop();
  assert.throws(() => validateFeatures(changed, f.selection, hash), /preserve every selected attempt/);
  changed = clone(f.features); changed.entries[1].sha256 = changed.entries[0].sha256;
  assert.throws(() => validateFeatures(changed, f.selection, hash), /Duplicate source video bytes/);
  changed = clone(f.features); changed.entries[0].sequence[0].points.pop();
  assert.throws(() => validateFeatures(changed, f.selection, hash), /46 points/);
  changed = clone(f.features); changed.entries[0].tracking_counts.face = 9;
  assert.throws(() => validateFeatures(changed, f.selection, hash), /exceeds frame_count/);
  changed = clone(f.features); changed.entries[0].id = 'work';
  assert.throws(() => validateFeatures(changed, f.selection, hash), /metadata changed/);
  const malformed = sequence(); malformed[0].points[0][0] = Infinity;
  assert.throws(() => validateSequence(malformed), /nonfinite/);
  assert.throws(() => validateFeatures(f.features, f.selection, sha256('wrong')), /hash mismatch/);
});

function onDiskFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hearing-v019-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['research/v019', 'app/assets', 'tests/fixtures']) mkdirSync(join(root, path), { recursive: true });
  const f = syntheticFixture(), paths = experimentPaths(root);
  writeFileSync(paths.selection, f.selectionBytes);
  writeFileSync(paths.features, JSON.stringify(f.features));
  writeFileSync(paths.protocol, 'Synthetic preregistered protocol fixture.\n');
  writeFileSync(paths.recognizer, readFileSync(new URL('../app/recognizer.js', import.meta.url)));
  writeFileSync(paths.production_library, JSON.stringify({ entries: f.production }));
  writeFileSync(paths.historical_fixture, JSON.stringify({ entries: f.historical }));
  const called = [];
  const classifier = (frames, templates) => {
    const entry = f.selection.entries[frames[0].points[0][0]];
    assert.ok(entry, 'Synthetic marker must identify an input');
    called.push({ split: entry.split, templates: templates.length });
    const nearest = entry.role === 'known' ? entry.id : 'hello';
    const distance = entry.role === 'known' ? .1 : .9;
    return { accepted: distance < .42, issue: '', rankings: [
      { id: nearest, text: 'synthetic', distance },
      { id: nearest === 'yes' ? 'hello' : 'yes', text: 'synthetic', distance: distance + .5 },
    ] };
  };
  return { ...f, root, paths, called, classifier };
}

test('changed retained production coordinates fail before any calibration prediction', t => {
  const f = onDiskFixture(t);
  const retained = f.features.entries.find(row => row.clip_id === f.production[0].clip_id);
  retained.sequence[0].points[0][0] += .001;
  writeFileSync(f.paths.features, JSON.stringify(f.features));
  assert.throws(() => runCalibration(f.paths, { classifier: f.classifier }), /Retained production sequence changed/);
  assert.equal(f.called.length, 0, 'Feature drift must fail before calibrating any thresholds');
});

test('missing or relabelled production templates cannot masquerade as a pure library expansion', t => {
  const cases = [
    ['missing clip', entry => { entry.clip_id = 'absent-production-clip'; }, /must retain production clip/],
    ['source bytes', entry => { entry.sha256 = sha256('changed-source'); }, /Retained production metadata changed.*sha256/],
    ['signer', entry => { entry.user_id = 'train-user-6'; }, /Retained production metadata changed.*user_id/],
    ['class', entry => { entry.id = 'yes'; }, /Retained production metadata changed.*id/],
  ];
  for (const [name, mutate, expected] of cases) {
    const f = onDiskFixture(t);
    mutate(f.production[0]);
    writeFileSync(f.paths.production_library, JSON.stringify({ entries: f.production }));
    assert.throws(() => runCalibration(f.paths, { classifier: f.classifier }), expected, name);
    assert.equal(f.called.length, 0, name + ' must fail before classification');
  }
});

test('two-stage CLI functions freeze before any test prediction, compare three arms and never merge history', t => {
  const f = onDiskFixture(t);
  assert.throws(() => runEvaluation(f.paths, { classifier: f.classifier }), /before --evaluate/);
  const candidate = runCalibration(f.paths, { classifier: f.classifier, frozenAt: '2026-11-11T12:00:00.000Z' });
  assert.equal(candidate.test_predictions_opened, false);
  assert.equal(f.called.length, 43);
  assert.ok(f.called.every(call => call.split === 'validation' && call.templates === 76));
  assert.throws(() => runCalibration(f.paths, { classifier: f.classifier }), /cannot be overwritten/);
  f.called.length = 0;
  const report = runEvaluation(f.paths, { classifier: f.classifier });
  assert.equal(f.called.length, 73 * 2, 'Expanded DTW rankings are reused by fixed/calibrated arms');
  assert.ok(f.called.every(call => call.split === 'test'));
  assert.deepEqual(Object.keys(report.methods), ['production21', 'expanded_fixed', 'experimental76']);
  for (const method of Object.values(report.methods)) {
    assert.equal(method.summary.overall.total, 73);
    assert.equal(method.summary.known.total, 13);
    assert.equal(method.summary.unknown.total, 60);
    assert.equal(method.summary.by_known_class.find(row => row.id === 'friend').evaluation_status, 'not_evaluated');
  }
  assert.equal(report.historical_evidence.combined_with_new_test, false);
  assert.equal(report.interpretation.candidate_is_live_model, false);
  const repeated = runEvaluation(f.paths, { classifier: f.classifier });
  assert.deepEqual(repeated, report, 'Reproduction must match the existing report byte-for-byte');
});

test('frozen test bytes and candidate policy cannot be changed before evaluation', t => {
  const f = onDiskFixture(t);
  const candidate = runCalibration(f.paths, { classifier: f.classifier, frozenAt: '2026-11-11T12:00:00.000Z' });
  const modifiedCandidate = clone(candidate); modifiedCandidate.policy.distance = .6;
  assert.throws(() => verifyCandidateSeal(modifiedCandidate), /altered after calibration/);
  const originalBytes = readFileSync(f.paths.features);
  writeFileSync(f.paths.features, Buffer.concat([originalBytes, Buffer.from('\n')]));
  f.called.length = 0;
  assert.throws(() => runEvaluation(f.paths, { classifier: f.classifier }), /Frozen input hash changed/);
  assert.equal(f.called.length, 0, 'Tamper must fail before evaluating any test input');
});

test('failed extraction remains in full-stage denominators', t => {
  const f = onDiskFixture(t);
  const failed = f.features.entries.find(row => row.split === 'test' && row.role === 'unknown');
  failed.extraction_status = 'failed'; failed.frame_count = 0; failed.tracking_counts = {};
  failed.sequence = []; failed.sha256 = null; failed.error = 'Synthetic download failure';
  writeFileSync(f.paths.features, JSON.stringify(f.features));
  runCalibration(f.paths, { classifier: f.classifier, frozenAt: '2026-11-11T12:00:00.000Z' });
  const report = runEvaluation(f.paths, { classifier: f.classifier });
  assert.equal(report.new_test.total, 73);
  assert.equal(report.new_test.extraction_failed, 1);
  for (const method of Object.values(report.methods)) {
    assert.equal(method.summary.unknown.total, 60);
    assert.equal(method.summary.rejection_reasons.extraction_failed, 1);
  }
});

