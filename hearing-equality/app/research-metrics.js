/**
 * Objective metrics for the preregistered v019 experiment.
 * Human review and edited transcripts are deliberately not inputs.
 */
export const EXPERIMENT_ID = 'hearing-equality-v019';
export const DISTANCE_GRID = Object.freeze(Array.from({ length: 21 }, (_, i) => (20 + 2 * i) / 100));
export const GAP_GRID = Object.freeze([.025, .04, .055, .08, .12, .16, .20]);
export const PRODUCTION_POLICY = Object.freeze({ enabled: true, distance: .42, gap: .055 });

function invariant(condition, message) { if (!condition) throw new Error(message); }
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const splitNames = ['train', 'validation', 'test'];
export const SELECTION_FIELDS = Object.freeze(['clip_id', 'user_id', 'text', 'id', 'split', 'role', 'official_split', 'archive_path']);
const intersect = (a, b) => [...a].filter(value => b.has(value));
const users = entries => new Set(entries.map(entry => entry.user_id));

export function fraction(numerator, denominator) {
  return { numerator, denominator, value: denominator ? numerator / denominator : null };
}

export function validateSequence(sequence, name = 'sequence') {
  invariant(Array.isArray(sequence) && sequence.length <= 40, name + ': expected at most 40 compact frames');
  for (const [i, frame] of sequence.entries()) {
    invariant(isRecord(frame) && Array.isArray(frame.points) && frame.points.length === 46, name + ': frame ' + i + ' must contain 46 points');
    invariant(Number.isInteger(frame.hands) && frame.hands >= 0 && frame.hands <= 2, name + ': invalid hand count');
    for (const point of frame.points) invariant(point === null || (Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)), name + ': nonfinite or malformed coordinate');
  }
}

export function auditSelection(selection, { historical = [], production = [], strictCounts = true } = {}) {
  invariant(isRecord(selection) && selection.schema_version === 1 && selection.protocol === EXPERIMENT_ID, 'Invalid selection schema/protocol');
  invariant(digest(selection.source?.sha256), 'Selection must identify the annotation source SHA-256');
  invariant(Array.isArray(selection.entries) && Array.isArray(selection.known_labels), 'Selection entries/known_labels missing');
  const labels = selection.known_labels.map(label => label.id);
  invariant(labels.length > 1 && new Set(labels).size === labels.length && selection.known_labels.every(label => nonempty(label.id) && nonempty(label.text)), 'Invalid known labels');
  if (strictCounts) invariant(labels.length === 6, 'Protocol requires six known labels');
  const labelSet = new Set(labels), clips = new Set(), paths = new Set();
  const bySplit = Object.fromEntries(splitNames.map(split => [split, []]));
  for (const entry of selection.entries) {
    invariant(isRecord(entry) && SELECTION_FIELDS.every(field => nonempty(entry[field])), 'Malformed selection entry');
    invariant(splitNames.includes(entry.split) && ['known', 'unknown'].includes(entry.role), 'Invalid split or role');
    invariant(['train', 'test'].includes(entry.official_split), 'Invalid original split');
    invariant(entry.archive_path === entry.official_split + '/' + entry.clip_id + '.mp4', 'Archive path does not match selected clip');
    invariant(entry.role === 'known' ? labelSet.has(entry.id) : entry.id === '__unknown__', 'Known/unknown label mismatch');
    invariant(entry.split !== 'train' || entry.role === 'known', 'Unknown samples cannot become templates');
    invariant(!clips.has(entry.clip_id) && !paths.has(entry.archive_path), 'Duplicate clip or archive path in selection');
    clips.add(entry.clip_id); paths.add(entry.archive_path); bySplit[entry.split].push(entry);
  }
  const summary = Object.fromEntries(splitNames.map(split => [split, {
    clips: bySplit[split].length, signers: users(bySplit[split]).size,
    known: bySplit[split].filter(entry => entry.role === 'known').length,
    unknown: bySplit[split].filter(entry => entry.role === 'unknown').length,
  }]));
  if (strictCounts) {
    const expected = { train: [76, 7, 76, 0], validation: [43, 1, 13, 30], test: [73, null, 13, 60] };
    for (const split of splitNames) {
      const actual = summary[split];
      invariant(Object.values(actual).every((value, i) => expected[split][i] === null || value === expected[split][i]), 'Protocol count mismatch: ' + split);
      invariant(isRecord(selection.split_summary?.[split]) && Object.entries(actual).every(([key, value]) => selection.split_summary[split][key] === value), 'Recorded split summary mismatch: ' + split);
    }
    invariant(bySplit.validation.every(entry => entry.user_id === selection.validation_signer), 'Validation signer mismatch');
    invariant(bySplit.train.every(entry => entry.official_split === 'train') && bySplit.validation.every(entry => entry.official_split === 'train') && bySplit.test.every(entry => entry.official_split === 'test'), 'Original train/test membership changed');
    for (const [split, repeats] of [['validation', 1], ['test', 2]]) {
      const counts = new Map(), seen = new Map();
      for (const entry of bySplit[split].filter(entry => entry.role === 'unknown')) {
        counts.set(entry.text, (counts.get(entry.text) ?? 0) + 1);
        if (!seen.has(entry.text)) seen.set(entry.text, new Set());
        seen.get(entry.text).add(entry.user_id);
      }
      invariant(counts.size === 30 && [...counts.values()].every(n => n === repeats), 'Unknown-class count mismatch: ' + split);
      invariant([...seen.values()].every(s => s.size === repeats), 'Unknown clips require distinct signers: ' + split);
    }
    const validationUnknownLabels = new Set(bySplit.validation.filter(entry => entry.role === 'unknown').map(entry => entry.text));
    invariant(bySplit.test.filter(entry => entry.role === 'unknown').every(entry => !validationUnknownLabels.has(entry.text)), 'Unknown-label leakage between validation and test');
    const knownTestCounts = {};
    for (const entry of bySplit.test.filter(entry => entry.role === 'known')) knownTestCounts[entry.text] = (knownTestCounts[entry.text] ?? 0) + 1;
    invariant(Object.keys(knownTestCounts).length === 5 && !bySplit.test.some(entry => entry.id === 'friend'), 'Protocol requires five test classes, with friend unrepresented');
    invariant(isRecord(selection.known_test_class_counts) && Object.keys(knownTestCounts).length === Object.keys(selection.known_test_class_counts).length && Object.entries(knownTestCounts).every(([key, value]) => selection.known_test_class_counts[key] === value), 'Known test-class counts changed');
    invariant(historical.length === 12 && production.length === 21, 'Historical or production library count changed');
  }
  const pairOverlap = {};
  for (const [a, b] of [['train', 'validation'], ['train', 'test'], ['validation', 'test']]) {
    const overlap = intersect(users(bySplit[a]), users(bySplit[b]));
    invariant(overlap.length === 0, 'Signer leakage: ' + a + '/' + b);
    pairOverlap[a + '_' + b] = 0;
  }
  const historicalUsers = users(historical), historicalClips = new Set(historical.map(entry => entry.clip_id));
  const declared = selection.historical_holdout?.signers_excluded ?? [];
  invariant(Array.isArray(declared), 'Missing historical exclusion list');
  if (historical.length) invariant(declared.length === historicalUsers.size && declared.every(user => historicalUsers.has(user)), 'Historical exclusion list differs from frozen fixture');
  const historicalOverlaps = {};
  for (const split of splitNames) {
    invariant(intersect(users(bySplit[split]), historicalUsers).length === 0, 'Historical signer leakage: ' + split);
    invariant(bySplit[split].every(entry => !historicalClips.has(entry.clip_id)), 'Historical clip reused as new evidence');
    historicalOverlaps[split] = 0;
  }
  const productionUsers = users(production), productionClips = new Set(production.map(entry => entry.clip_id));
  invariant(intersect(users(bySplit.test), productionUsers).length === 0, 'Production/test signer leakage');
  invariant(bySplit.test.every(entry => !productionClips.has(entry.clip_id)), 'Production clip reused in new test');
  invariant(new Set(production.map(entry => entry.clip_id)).size === production.length, 'Duplicate production clips');
  invariant(production.every(entry => entry.split === 'train' && labelSet.has(entry.id)), 'Invalid production template metadata');
  const unknownLabelOverlap = intersect(new Set(bySplit.validation.filter(entry => entry.role === 'unknown').map(entry => entry.text)), new Set(bySplit.test.filter(entry => entry.role === 'unknown').map(entry => entry.text))).length;
  return { summary, signer_overlap: pairOverlap, historical_signer_overlap: historicalOverlaps, production_test_signer_overlap: 0, unknown_validation_test_label_overlap: unknownLabelOverlap, duplicate_clips: 0, historical_clips_used_as_new_evidence: 0 };
}

export function validateFeatures(features, selection, selectionHash) {
  invariant(isRecord(features) && features.schema_version === 1 && features.selection_sha256 === selectionHash, 'Feature/selection hash mismatch');
  invariant((isRecord(features.extractor) && Object.keys(features.extractor).length > 0) || nonempty(features.extractor), 'Missing extractor identity');
  invariant(Array.isArray(features.entries) && features.entries.length === selection.entries.length, 'Feature rows must preserve every selected attempt');
  const selected = new Map(selection.entries.map(entry => [entry.clip_id, entry]));
  const seen = new Set(), sourceHashes = new Map();
  for (const entry of features.entries) {
    const original = selected.get(entry.clip_id);
    invariant(original && !seen.has(entry.clip_id), 'Unselected or duplicate feature clip');
    seen.add(entry.clip_id);
    invariant(SELECTION_FIELDS.every(field => entry[field] === original[field]), 'Feature metadata changed: ' + entry.clip_id);
    invariant(['ok', 'failed'].includes(entry.extraction_status), 'Invalid extraction status');
    invariant(Number.isInteger(entry.frame_count) && entry.frame_count >= 0, 'Invalid frame_count');
    invariant(isRecord(entry.tracking_counts), 'Invalid tracking_counts');
    const keys = Object.keys(entry.tracking_counts);
    invariant(keys.every(key => ['pose', 'left', 'right', 'face'].includes(key)), 'Unknown tracking counter');
    invariant(Object.values(entry.tracking_counts).every(n => Number.isInteger(n) && n >= 0 && n <= entry.frame_count), 'Tracking count exceeds frame_count');
    if (entry.extraction_status === 'ok') {
      invariant(digest(entry.sha256), 'Successful extraction requires source SHA-256');
      invariant(entry.frame_count > 0 && keys.length === 4, 'Successful extraction requires frame count and all tracking counters');
    } else {
      invariant(entry.sha256 === null || digest(entry.sha256), 'Failed extraction requires null or valid source SHA-256');
      invariant(entry.frame_count === 0 && keys.length === 0 && Array.isArray(entry.sequence) && entry.sequence.length === 0, 'Failed extraction must preserve an empty rejected attempt');
      invariant(nonempty(entry.error), 'Failed extraction requires an error reason');
    }
    validateSequence(entry.sequence, entry.clip_id);
    if (digest(entry.sha256)) {
      invariant(!sourceHashes.has(entry.sha256), 'Duplicate source video bytes: ' + entry.clip_id + ' / ' + sourceHashes.get(entry.sha256));
      sourceHashes.set(entry.sha256, entry.clip_id);
    }
  }
  return Object.fromEntries(splitNames.map(split => [split, features.entries.filter(entry => entry.split === split)]));
}

export function rankAttempts(entries, templates, classify) {
  invariant(typeof classify === 'function', 'Classifier is required');
  return entries.map(entry => {
    const identity = Object.fromEntries(SELECTION_FIELDS.map(field => [field, entry[field]]));
    if (entry.extraction_status === 'failed') return {
      ...identity, extraction_status: 'failed', nearest: null, distance: null, gap: null, gap_infinite: false,
      rankings: [], ranking_issue: entry.error, ranking_refusal: 'extraction_failed',
    };
    const raw = classify(entry.sequence, templates);
    invariant(Array.isArray(raw.rankings), 'Classifier returned no rankings');
    const best = raw.rankings[0], next = raw.rankings[1];
    const hasBest = Boolean(best && Number.isFinite(best.distance));
    const gap = hasBest ? (next ? next.distance - best.distance : Infinity) : null;
    return {
      ...identity, extraction_status: 'ok', nearest: hasBest ? best.id : null,
      distance: hasBest ? best.distance : null,
      gap: Number.isFinite(gap) ? gap : null, gap_infinite: gap === Infinity,
      rankings: raw.rankings.map(item => ({ id: item.id, text: item.text, distance: Number.isFinite(item.distance) ? item.distance : null })),
      ranking_issue: hasBest ? '' : (raw.issue || 'No usable template'),
      ranking_refusal: hasBest ? null : raw.rankings.length ? 'no_usable_template' : 'sequence_quality',
    };
  });
}

export function applyPolicy(rankings, policy) {
  invariant(isRecord(policy) && typeof policy.enabled === 'boolean', 'Invalid policy');
  if (policy.enabled) invariant(Number.isFinite(policy.distance) && Number.isFinite(policy.gap), 'Enabled policy requires finite thresholds');
  return rankings.map(row => {
    invariant(['known', 'unknown'].includes(row.role), 'Ranking role missing');
    const eligible = row.extraction_status === 'ok' && row.nearest !== null && Number.isFinite(row.distance);
    const distancePass = eligible && row.distance < policy.distance;
    const gapPass = eligible && (row.gap_infinite === true || (Number.isFinite(row.gap) && row.gap > policy.gap));
    const accepted = Boolean(policy.enabled && distancePass && gapPass);
    const correct = accepted && row.role === 'known' && row.nearest === row.id;
    let refusal = null;
    if (!accepted) refusal = row.ranking_refusal || (!policy.enabled ? 'policy_disabled' : !distancePass ? 'distance' : 'gap');
    // Copy only objective fields. Review/edit fields never affect the decision or score.
    const clean = Object.fromEntries([...SELECTION_FIELDS, 'extraction_status', 'nearest', 'distance', 'gap', 'gap_infinite', 'rankings', 'ranking_issue', 'ranking_refusal'].map(key => [key, row[key]]));
    return {
      ...clean, accepted, correct,
      outcome: accepted ? row.role === 'unknown' ? 'false_accept' : correct ? 'correct' : 'wrong' : 'rejected',
      rejection_reason: refusal,
      top1_correct: row.role === 'known' && row.nearest === row.id,
    };
  });
}

function knownStats(rows) {
  const correct = rows.filter(row => row.outcome === 'correct').length;
  const wrong = rows.filter(row => row.outcome === 'wrong').length;
  const rejected = rows.length - correct - wrong;
  const top1 = rows.filter(row => row.top1_correct).length;
  const ranked = rows.filter(row => row.nearest !== null).length;
  return {
    total: rows.length, correct, wrong, rejected, accepted: correct + wrong,
    correct_of_all: fraction(correct, rows.length), coverage: fraction(correct + wrong, rows.length),
    selective_error: fraction(wrong, correct + wrong),
    top1_correct: top1, top1_of_all: fraction(top1, rows.length), top1_of_ranked: fraction(top1, ranked),
  };
}
function unknownStats(rows) {
  const falseAccept = rows.filter(row => row.outcome === 'false_accept').length;
  return {
    total: rows.length, false_accept: falseAccept, rejected: rows.length - falseAccept,
    false_accept_rate: fraction(falseAccept, rows.length), rejection_rate: fraction(rows.length - falseAccept, rows.length),
  };
}

export function summarizePredictions(rows, knownLabels) {
  const ids = knownLabels.map(label => label.id), known = rows.filter(row => row.role === 'known'), unknown = rows.filter(row => row.role === 'unknown');
  invariant(known.length + unknown.length === rows.length, 'Unknown metric role');
  const k = knownStats(known), u = unknownStats(unknown);
  const accepted = k.accepted + u.false_accept, errors = k.wrong + u.false_accept;
  const expected = [...ids, '__unknown__'], predicted = [...ids, '__reject__'];
  const matrix = expected.map(() => predicted.map(() => 0));
  for (const row of rows) {
    const actual = row.role === 'unknown' ? '__unknown__' : row.id;
    const output = row.accepted ? row.nearest : '__reject__';
    invariant(expected.includes(actual) && predicted.includes(output), 'Prediction label outside experiment');
    matrix[expected.indexOf(actual)][predicted.indexOf(output)]++;
  }
  const reasons = {};
  for (const row of rows.filter(row => !row.accepted)) reasons[row.rejection_reason] = (reasons[row.rejection_reason] ?? 0) + 1;
  return {
    known: k, unknown: u,
    overall: { total: rows.length, accepted, rejected: rows.length - accepted, incorrect_accepted: errors, coverage: fraction(accepted, rows.length), selective_error: fraction(errors, accepted) },
    by_known_class: knownLabels.map(label => ({ ...label, evaluation_status: known.some(row => row.id === label.id) ? 'evaluated' : 'not_evaluated', ...knownStats(known.filter(row => row.id === label.id)) })),
    by_unknown_class: [...new Set(unknown.map(row => row.text))].sort().map(text => ({ text, ...unknownStats(unknown.filter(row => row.text === text)) })),
    confusion: { expected_rows: expected, predicted_columns: predicted, counts: matrix },
    rejection_reasons: reasons,
  };
}

export function calibrateThresholds(rankings, knownLabels) {
  invariant(rankings.every(row => row.split === 'validation'), 'Calibration must not see test/train predictions');
  const grid = [];
  let best = null;
  for (const distance of DISTANCE_GRID) for (const gap of GAP_GRID) {
    const policy = { enabled: true, distance, gap };
    const summary = summarizePredictions(applyPolicy(rankings, policy), knownLabels);
    const point = { distance, gap, correct_known: summary.known.correct, wrong_known: summary.known.wrong, unknown_false_accept: summary.unknown.false_accept };
    point.eligible = point.wrong_known === 0 && point.unknown_false_accept === 0;
    grid.push(point);
    if (point.eligible && (!best || point.correct_known > best.correct_known ||
      (point.correct_known === best.correct_known && (distance < best.distance || (distance === best.distance && gap > best.gap))))) best = point;
  }
  const policy = best?.correct_known > 0
    ? { enabled: true, distance: best.distance, gap: best.gap }
    : { enabled: false, distance: null, gap: null };
  const predictions = applyPolicy(rankings, policy);
  return { policy, disabled_reason: policy.enabled ? null : 'No grid point accepted a known validation sign without wrong known or unknown accepts.', grid, predictions, summary: summarizePredictions(predictions, knownLabels) };
}

