#!/usr/bin/env node
/**
 * Two-stage, preregistered Slovo experiment.
 *
 *   node scripts/research-evaluate-v019.mjs --calibrate
 *   node scripts/research-evaluate-v019.mjs --evaluate
 *
 * Calibration hashes and schema-checks the complete feature file, but passes
 * only train and validation records to the classifier. No test prediction or
 * test quality statistic is computed until a frozen candidate is verified.
 * Candidate/report files never replace the production model.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { classify } from '../app/recognizer.js';
import {
  EXPERIMENT_ID, DISTANCE_GRID, GAP_GRID, PRODUCTION_POLICY, SELECTION_FIELDS,
  auditSelection, validateFeatures, validateSequence, rankAttempts, applyPolicy,
  summarizePredictions, calibrateThresholds,
} from '../app/research-metrics.js';

const HERE = fileURLToPath(import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nonfinite JSON value');
  if (value === undefined) throw new Error('Undefined JSON value');
  return JSON.stringify(value);
}
export function experimentPaths(root = fileURLToPath(new URL('../', import.meta.url))) {
  const base = resolve(root);
  return {
    selection: join(base, 'research/v019/selection.json'),
    features: join(base, 'research/v019/features.json'),
    protocol: join(base, 'research/v019/PROTOCOL.md'),
    recognizer: join(base, 'app/recognizer.js'),
    production_library: join(base, 'app/assets/recognition-library.json'),
    historical_fixture: join(base, 'tests/fixtures/heldout-v07.json'),
    evaluator_script: HERE,
    metrics_module: fileURLToPath(new URL('../app/research-metrics.js', import.meta.url)),
    candidate: join(base, 'research/v019/candidate.json'),
    report: join(base, 'research/v019/report.json'),
  };
}
const INPUT_KEYS = ['selection', 'features', 'protocol', 'recognizer', 'production_library', 'historical_fixture', 'evaluator_script', 'metrics_module'];
function readInputs(paths) {
  const bytes = Object.fromEntries(INPUT_KEYS.map(key => [key, readFileSync(paths[key])]));
  const hashes = Object.fromEntries(INPUT_KEYS.map(key => [key, sha256(bytes[key])]));
  return { bytes, hashes };
}
function parseJSON(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (error) { throw new Error('Invalid JSON in ' + label + ': ' + error.message); }
}
export function loadExperiment(paths, frozenHashes = null) {
  const { bytes, hashes } = readInputs(paths);
  // Verify bytes first. An altered test file must fail before classification.
  if (frozenHashes) assert.deepEqual(hashes, frozenHashes, 'Frozen input hash changed; do not retune or replace the test');
  const selection = parseJSON(bytes.selection, 'selection');
  const features = parseJSON(bytes.features, 'features');
  const production = parseJSON(bytes.production_library, 'production library');
  const historical = parseJSON(bytes.historical_fixture, 'historical fixture');
  assert.ok(Array.isArray(production.entries) && Array.isArray(historical.entries), 'Library/fixture entries missing');
  const audit = auditSelection(selection, { historical: historical.entries, production: production.entries });
  const bySplit = validateFeatures(features, selection, hashes.selection);
  for (const entry of production.entries) validateSequence(entry.sequence, 'production ' + entry.clip_id);
  const templates = bySplit.train.map(entry => ({
    id: entry.id, text: entry.text, origin: 'slovo-v019-train', clip_id: entry.clip_id,
    user_id: entry.user_id, sha256: entry.sha256, extraction_status: entry.extraction_status, feature_origin: entry.feature_origin ?? 'extracted-v019', sequence: entry.sequence,
  }));
  // The fixed-threshold comparison must isolate added templates. Re-extracting
  // a previously published clip must not silently change its original features.
  const templateByClip = new Map(templates.map(entry => [entry.clip_id, entry]));
  for (const original of production.entries) {
    const retained = templateByClip.get(original.clip_id);
    assert.ok(retained, 'Expanded library must retain production clip: ' + original.clip_id);
    for (const key of ['id', 'user_id', 'sha256']) {
      assert.equal(retained[key], original[key], 'Retained production metadata changed: ' + original.clip_id + ' / ' + key);
    }
    // The UI title-cases Russian labels; the annotation retains source casing.
    const normalizeLabel = text => text.normalize('NFC').trim().toLocaleLowerCase('ru');
    assert.equal(normalizeLabel(retained.text), normalizeLabel(original.text), 'Retained production label changed: ' + original.clip_id);
    assert.equal(retained.extraction_status, 'ok', 'Retained production clip must remain usable: ' + original.clip_id);
    assert.equal(canonical(retained.sequence), canonical(original.sequence), 'Retained production sequence changed: ' + original.clip_id);
  }
  return {
    selection, features, production, historical, audit, bySplit, templates, hashes,
    template_library_sha256: sha256(canonical(templates)),
  };
}
function seal(payload) {
  return { ...payload, record_sha256: sha256(canonical(payload)) };
}
export function verifyCandidateSeal(candidate) {
  assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate), 'Missing candidate');
  const { record_sha256, ...payload } = candidate;
  assert.equal(record_sha256, sha256(canonical(payload)), 'Candidate was altered after calibration');
  assert.equal(candidate.schema_version, 1, 'Candidate schema mismatch');
  assert.equal(candidate.protocol, EXPERIMENT_ID, 'Candidate protocol mismatch');
  assert.equal(candidate.stage, 'calibration-frozen', 'Candidate has not been frozen');
  assert.equal(candidate.test_predictions_opened, false, 'Candidate contains test-informed calibration');
  assert.deepEqual(candidate.calibration_splits, ['train', 'validation'], 'Only train/validation may calibrate');
  assert.deepEqual(candidate.grid_definition, { distance: DISTANCE_GRID, gap: GAP_GRID }, 'Preregistered threshold grid changed');
}
function trainingSummary(data) {
  return {
    selected: data.templates.length,
    signers: new Set(data.templates.map(entry => entry.user_id)).size,
    extraction_failed: data.templates.filter(entry => entry.extraction_status === 'failed').length,
    nonempty_sequences: data.templates.filter(entry => entry.sequence.length > 0).length,
    library_sha256: data.template_library_sha256,
    empty_sequences_retained: true,
  };
}
export function makeCandidate(data, classifier = classify, frozenAt = new Date().toISOString()) {
  const rankings = rankAttempts(data.bySplit.validation, data.templates, classifier);
  const calibration = calibrateThresholds(rankings, data.selection.known_labels);
  assert.equal(calibration.summary.overall.total, 43);
  return seal({
    schema_version: 1, protocol: EXPERIMENT_ID, stage: 'calibration-frozen', frozen_at: frozenAt,
    calibration_splits: ['train', 'validation'], test_predictions_opened: false,
    scope: 'Exploratory six-word offline experiment; no live production model update.',
    selection_sha256: data.hashes.selection, features_sha256: data.hashes.features,
    hashes: data.hashes, audit: data.audit, training: trainingSummary(data),
    grid_definition: { distance: DISTANCE_GRID, gap: GAP_GRID },
    selection_rule: 'Zero wrong known accepts and zero unknown false accepts; maximize correct known; lower distance; higher gap. Strict distance < threshold and gap > threshold.',
    policy: calibration.policy, disabled_reason: calibration.disabled_reason,
    grid_results: calibration.grid,
    validation: { summary: calibration.summary, predictions: calibration.predictions },
    limitations: data.selection.limitations,
  });
}
export function verifyCandidate(candidate, data) {
  verifyCandidateSeal(candidate);
  assert.deepEqual(candidate.hashes, data.hashes, 'Frozen input hashes differ');
  assert.equal(candidate.selection_sha256, data.hashes.selection, 'Selection digest mismatch');
  assert.equal(candidate.features_sha256, data.hashes.features, 'Feature digest mismatch');
  assert.deepEqual(candidate.audit, data.audit, 'Selection audit differs');
  assert.deepEqual(candidate.training, trainingSummary(data), 'Training library differs');
  const rows = candidate.validation?.predictions;
  assert.ok(Array.isArray(rows) && rows.length === data.bySplit.validation.length, 'Candidate validation rows missing');
  const expected = new Map(data.bySplit.validation.map(entry => [entry.clip_id, entry]));
  const seen = new Set();
  for (const row of rows) {
    const entry = expected.get(row.clip_id);
    assert.ok(entry && !seen.has(row.clip_id), 'Candidate includes test or duplicate prediction');
    seen.add(row.clip_id);
    for (const key of SELECTION_FIELDS) assert.equal(row[key], entry[key], 'Candidate validation metadata changed: ' + key);
    assert.ok(row.extraction_status === entry.extraction_status, 'Candidate extraction state changed');
    assert.ok(row.nearest === null || data.selection.known_labels.some(label => label.id === row.nearest), 'Candidate nearest class invalid');
    assert.ok(row.distance === null || (Number.isFinite(row.distance) && row.distance >= 0), 'Candidate distance invalid');
    assert.ok(row.gap === null || (Number.isFinite(row.gap) && row.gap >= 0), 'Candidate gap invalid');
    assert.equal(typeof row.gap_infinite, 'boolean', 'Candidate gap state invalid');
  }
  // Recompute the policy from frozen validation rankings, not test performance.
  // DTW is not repeated for each grid pair.
  const again = calibrateThresholds(rows, data.selection.known_labels);
  assert.deepEqual(candidate.policy, again.policy, 'Candidate policy is not the preregistered optimum');
  assert.deepEqual(candidate.disabled_reason, again.disabled_reason, 'Disabled-policy reason changed');
  assert.deepEqual(candidate.grid_results, again.grid, 'Candidate grid results changed');
  assert.deepEqual(candidate.validation.summary, again.summary, 'Candidate validation metrics changed');
  assert.deepEqual(candidate.validation.predictions, again.predictions, 'Candidate objective decisions changed');
}
function writeNewJSON(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
}
export function runCalibration(paths = experimentPaths(), { classifier = classify, frozenAt } = {}) {
  assert.ok(!existsSync(paths.candidate), 'candidate.json already exists: frozen calibration cannot be overwritten');
  assert.ok(!existsSync(paths.report), 'Test report already exists: calibration after evaluation is prohibited');
  const data = loadExperiment(paths);
  const candidate = makeCandidate(data, classifier, frozenAt);
  writeNewJSON(paths.candidate, candidate);
  return candidate;
}
export function makeReport(candidate, data, candidateFileHash, classifier = classify) {
  verifyCandidate(candidate, data);
  const test = data.bySplit.test;
  assert.equal(test.length, 73);
  const productionRankings = rankAttempts(test, data.production.entries, classifier);
  const expandedRankings = rankAttempts(test, data.templates, classifier);
  const methods = {};
  for (const [name, templates, policy, rankings] of [
    ['production21', data.production.entries, PRODUCTION_POLICY, productionRankings],
    ['expanded_fixed', data.templates, PRODUCTION_POLICY, expandedRankings],
    ['experimental76', data.templates, candidate.policy, expandedRankings],
  ]) {
    const predictions = applyPolicy(rankings, policy);
    methods[name] = {
      policy, template_count: templates.length,
      template_signers: new Set(templates.map(entry => entry.user_id)).size,
      candidate_automatically_deployed: false,
      summary: summarizePredictions(predictions, data.selection.known_labels), predictions,
    };
  }
  return {
    schema_version: 1, protocol: EXPERIMENT_ID, stage: 'new-test-evaluated',
    protocol_date: data.selection.date, calibration_frozen_at: candidate.frozen_at,
    candidate_record_sha256: candidate.record_sha256, candidate_file_sha256: candidateFileHash,
    freeze_verified: true, hashes: data.hashes, audit: data.audit,
    new_test: {
      total: 73, known: 13, unknown: 60,
      signers: data.audit.summary.test.signers,
      selected_attempts_preserved: true,
      extraction_failed: test.filter(entry => entry.extraction_status === 'failed').length,
      features_are_compact_coordinates: true,
    },
    methods,
    historical_evidence: {
      clips: data.historical.entries.length, counted_as_new_evidence: false, combined_with_new_test: false,
      purpose: 'Previously observed 12 clips remain a separate regression check; run scripts/evaluate.mjs for historical reproduction.',
    },
    interpretation: {
      zero_denominator_value: null,
      no_test_result_used_for_threshold_selection: true,
      unknowns: 'Thirty selected Slovo labels; no arbitrary movements or continuous-signing claim.',
      unrepresented_known_class: 'friend',
      participant_reviews_used_for_objective_scores: false,
      errors_are_relative_to_slovo_labels: true,
      linguistic_correctness_not_assessed: true,
      possible_synonymy_and_polysemy: 'A different or unknown Slovo label is a benchmark mismatch; this does not establish a linguistically wrong translation.',
      candidate_is_live_model: false,
    },
    limitations: data.selection.limitations,
  };
}
export function runEvaluation(paths = experimentPaths(), { classifier = classify } = {}) {
  assert.ok(existsSync(paths.candidate), 'Run --calibrate and freeze candidate.json before --evaluate');
  const candidateBytes = readFileSync(paths.candidate);
  const candidate = parseJSON(candidateBytes, 'candidate');
  verifyCandidateSeal(candidate);
  const data = loadExperiment(paths, candidate.hashes);
  const report = makeReport(candidate, data, sha256(candidateBytes), classifier);
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (existsSync(paths.report)) assert.equal(readFileSync(paths.report, 'utf8'), serialized, 'Existing report differs; it will not be overwritten');
  else writeNewJSON(paths.report, report);
  return report;
}
export function main(argv = process.argv.slice(2)) {
  const modes = argv.filter(arg => arg === '--calibrate' || arg === '--evaluate');
  assert.equal(modes.length, 1, 'Choose exactly one: --calibrate or --evaluate');
  let root;
  const allowed = new Set(['--calibrate', '--evaluate', '--root']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    assert.ok(allowed.has(arg), 'Unknown argument: ' + arg);
    if (arg === '--root') { root = argv[++i]; assert.ok(root && !root.startsWith('--'), '--root needs a directory'); }
  }
  const paths = experimentPaths(root);
  if (modes[0] === '--calibrate') {
    const candidate = runCalibration(paths);
    console.log(JSON.stringify({ stage: candidate.stage, candidate: paths.candidate, policy: candidate.policy, validation: candidate.validation.summary, test_predictions_opened: false }, null, 2));
  } else {
    const report = runEvaluation(paths);
    console.log(JSON.stringify({ stage: report.stage, report: paths.report, freeze_verified: report.freeze_verified, new_test: report.new_test, production21: report.methods.production21.summary, expanded_fixed: report.methods.expanded_fixed.summary, experimental76: report.methods.experimental76.summary }, null, 2));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === HERE) {
  try { main(); }
  catch (error) { console.error('Experiment rejected: ' + error.message); process.exitCode = 1; }
}

