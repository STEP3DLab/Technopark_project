import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCatalog, emptyStudy, addMaterial, addMaterialReview, materialLanguage, beginAttempt, finishAttempt, addReview, studySummary, exportStudy, importStudy, attemptsCSV, materialsCSV, csvCell, MAX_IMPORT_BYTES } from '../app/pilot-model.js';

const catalog = validateCatalog(JSON.parse(fs.readFileSync(new URL('../app/assets/pilot-messages.json', import.meta.url))).messages);
const video = { sha256: 'a'.repeat(64), duration: 3.2, bytes: 1024, width: 720, height: 1280 };
const material = (extra = {}) => ({ participantCode: 'P01', split: 'train', expectedId: 'M01', take: 1, mediaType: 'human_video', video, consent: true, languageStatus: 'pending', reviewerCode: '', notes: '', ...extra });
const setup = (extra = {}) => ({ participantCode: 'P20', split: 'test', expectedId: 'M01', take: 1, mediaType: 'live', kind: 'comprehension', materialId: '', consent: true, ...extra });
const completed = (study = emptyStudy(), overrides = {}, response = 'Чем помочь?') => {
  const draft = beginAttempt(study, catalog, setup(overrides));
  return finishAttempt(study, catalog, draft, { outcome: 'answered', response, notes: '', elapsedMs: 1300 });
};
const review = (attemptId, extra = {}) => ({ attemptId, reviewerCode: 'R01', independent: true, meaning: 'partial', polarity: 'not_applicable', question: 'preserved', correctedText: 'Здравствуйте. Чем я могу помочь?', notes: '', ...extra });

test('all 20 messages match the existing recording brief exactly', () => {
  const brief = fs.readFileSync(new URL('../docs/PILOT_RECORDING_BRIEF.md', import.meta.url), 'utf8');
  for (const item of catalog) assert.ok(brief.includes(`| ${item.id.slice(1)} | ${item.role} | ${item.text} | ${item.context} |`));
});
test('a fresh project contains no collected recordings or claims of observed translation', () => {
  assert.deepEqual(studySummary(emptyStudy()), { participants: 0, materials: 0, approvedMaterials: 0, coveredMessages: 0, attempts: 0, firstAttempts: 0, answered: 0, refused: 0, skipped: 0, reviewed: 0, independentReviews: 0 });
});
test('the original project is not mutated by successful or failed material registration', () => {
  const initial = emptyStudy(); const next = addMaterial(initial, catalog, material());
  assert.equal(initial.materials.length, 0); assert.equal(next.materials.length, 1);
  assert.throws(() => addMaterial(next, catalog, material({ split: 'test', video: { ...video, sha256: 'b'.repeat(64) }, take: 2 })), /разные разделы/);
  assert.equal(next.materials.length, 1); assert.equal(next.participants.length, 1);
});
test('the same signer cannot leak from training materials into test attempts', () => {
  const study = addMaterial(emptyStudy(), catalog, material());
  assert.throws(() => beginAttempt(study, catalog, setup({ participantCode: 'P01' })), /разные разделы/);
});
test('duplicate source bytes do not become new recordings by changing their label or take number', () => {
  const study = addMaterial(emptyStudy(), catalog, material());
  assert.throws(() => addMaterial(study, catalog, material({ expectedId: 'M02', take: 2 })), /видеофайл уже зарегистрирован/);
});
test('linguistic approval requires an identified reviewer and explicit research use', () => {
  assert.throws(() => addMaterial(emptyStudy(), catalog, material({ consent: false })), /подтверждение/);
  assert.throws(() => addMaterial(emptyStudy(), catalog, material({ languageStatus: 'approved' })), /код специалиста/);
  const study = addMaterial(emptyStudy(), catalog, material({ languageStatus: 'approved', reviewerCode: 'R01' }));
  assert.equal(studySummary(study).approvedMaterials, 1); assert.equal(studySummary(study).attempts, 0);
});
test('a comprehension participant is different from the source signer', () => {
  const study = addMaterial(emptyStudy(), catalog, material());
  assert.throws(() => beginAttempt(study, catalog, setup({ participantCode: 'P01', split: 'train', materialId: study.materials[0].id, mediaType: 'human_video' })), /другой участник/);
  assert.doesNotThrow(() => beginAttempt(study, catalog, setup({ materialId: study.materials[0].id, mediaType: 'human_video' })));
});
test('later linguistic checks append a history without overwriting the original material', () => {
  const original = addMaterial(emptyStudy(), catalog, material()), originalText = JSON.stringify(original.materials);
  let study = addMaterialReview(original, { materialId: original.materials[0].id, reviewerCode: 'R01', status: 'approved', notes: 'Проверено' });
  assert.equal(studySummary(study).approvedMaterials, 1);
  study = addMaterialReview(study, { materialId: original.materials[0].id, reviewerCode: 'R02', status: 'changes', notes: 'Нужна мимика вопроса' });
  assert.equal(studySummary(study).approvedMaterials, 0); assert.equal(study.languageReviews.length, 2);
  assert.equal(JSON.stringify(study.materials), originalText);
  assert.deepEqual(materialLanguage(study, study.materials[0]), { status: 'changes', reviewerCode: 'R02' });
  assert.deepEqual(importStudy(exportStudy(study), catalog), study);
});
test('recognition trials retain the original signer and split of the evaluated video', () => {
  const study = addMaterial(emptyStudy(), catalog, material());
  assert.throws(() => beginAttempt(study, catalog, setup({ kind: 'recognition', materialId: study.materials[0].id, mediaType: 'human_video' })), /код исполнителя и раздел/);
  assert.doesNotThrow(() => beginAttempt(study, catalog, setup({ kind: 'recognition', participantCode: 'P01', split: 'train', materialId: study.materials[0].id, mediaType: 'human_video' })));
});
test('fixed targets cannot be supplied again or changed through the finish payload', () => {
  const initial = emptyStudy(), draft = beginAttempt(initial, catalog, setup());
  assert.ok(Object.isFrozen(draft));
  assert.throws(() => { draft.expectedId = 'M02'; }, TypeError);
  const study = finishAttempt(initial, catalog, draft, { outcome: 'answered', response: 'Помогите', elapsedMs: 1500, expectedId: 'M02', expectedText: 'Мне нужна помощь.' });
  assert.equal(study.attempts[0].expectedId, 'M01'); assert.equal(study.attempts[0].expectedText, catalog[0].text);
});
test('the same finished attempt cannot be counted twice', () => {
  const initial = emptyStudy(), draft = beginAttempt(initial, catalog, setup());
  const study = finishAttempt(initial, catalog, draft, { outcome: 'refused', response: '', notes: '', elapsedMs: 1000 });
  assert.throws(() => finishAttempt(study, catalog, draft, { outcome: 'answered', response: 'Ответ', elapsedMs: 1000 }), /уже завершена/);
});
test('repeated attempts remain separate and cannot reuse the first attempt number', () => {
  const study = completed();
  assert.throws(() => beginAttempt(study, catalog, setup()), /номер попытки уже зафиксирован/);
  const repeated = completed(study, { take: 2 });
  assert.equal(studySummary(repeated).attempts, 2); assert.equal(studySummary(repeated).firstAttempts, 1);
});
test('refusals and skips remain in the denominator and are never reviewed as answers', () => {
  let study = emptyStudy();
  for (const [index, outcome] of ['refused', 'skipped'].entries()) {
    const draft = beginAttempt(study, catalog, setup({ take: index + 1 }));
    study = finishAttempt(study, catalog, draft, { outcome, response: '', elapsedMs: 900, notes: 'Плохое освещение' });
  }
  const summary = studySummary(study);
  assert.equal(summary.attempts, 2); assert.equal(summary.answered, 0); assert.equal(summary.refused, 1); assert.equal(summary.skipped, 1);
  assert.throws(() => addReview(study, review(study.attempts[0].id)), /зафиксированного ответа/);
});
test('reviews and corrected wording never overwrite the frozen original response', () => {
  const original = completed(), before = JSON.stringify(original.attempts);
  const assessed = addReview(original, review(original.attempts[0].id));
  assert.equal(JSON.stringify(assessed.attempts), before); assert.equal(original.reviews.length, 0);
  assert.equal(assessed.reviews[0].correctedText, 'Здравствуйте. Чем я могу помочь?');
  assert.equal(studySummary(assessed).independentReviews, 1);
});
test('a participant cannot mark their own assessment as independent', () => {
  const study = completed();
  assert.throws(() => addReview(study, review(study.attempts[0].id, { reviewerCode: 'P20' })), /тот же участник/);
});
test('each reviewer writes a separate non-overwriting assessment', () => {
  let study = completed(); const attemptId = study.attempts[0].id;
  study = addReview(study, review(attemptId));
  assert.throws(() => addReview(study, review(attemptId, { meaning: 'preserved' })), /уже сохранена/);
  study = addReview(study, review(attemptId, { reviewerCode: 'R02', meaning: 'changed' }));
  assert.equal(study.reviews.length, 2); assert.equal(studySummary(study).reviewed, 1);
});
test('JSON round-trip retains metadata, raw responses, refusals, and separate reviews', () => {
  let study = addMaterial(emptyStudy(), catalog, material());
  study = completed(study, { materialId: study.materials[0].id, mediaType: 'human_video' });
  study = addReview(study, review(study.attempts[0].id));
  assert.deepEqual(importStudy(exportStudy(study), catalog), study);
});
test('import rejects changed targets, undeclared participants, split leakage, and duplicate records', () => {
  const study = completed();
  for (const change of [
    data => { data.attempts[0].expectedText = 'Другая фраза'; },
    data => { data.participants = []; },
    data => { data.attempts[0].split = 'train'; },
    data => { data.attempts.push(data.attempts[0]); },
    data => { data.participants.push({ code: 'P20', split: 'train' }); },
  ]) { const data = JSON.parse(exportStudy(study)); change(data); assert.throws(() => importStudy(JSON.stringify(data), catalog)); }
});
test('import rejects oversized files, invalid numeric media, and unsupported protocols', () => {
  assert.throws(() => importStudy(' '.repeat(MAX_IMPORT_BYTES + 1), catalog), /8 МБ/);
  assert.throws(() => importStudy('{', catalog), /прочитать JSON/);
  const data = JSON.parse(exportStudy(addMaterial(emptyStudy(), catalog, material())));
  data.materials[0].video.duration = -1; assert.throws(() => importStudy(JSON.stringify(data), catalog), /длиться/);
  data.protocolVersion = 'other'; assert.throws(() => importStudy(JSON.stringify(data), catalog), /версия/);
});
test('non-string identifiers cannot evade signer separation or duplicate-media checks', () => {
  assert.throws(() => addMaterial(emptyStudy(), catalog, material({ participantCode: ['P01'] })), /Код участника/);
  assert.throws(() => addMaterial(emptyStudy(), catalog, material({ video: { ...video, sha256: [video.sha256] } })), /контрольной суммы/);
});
test('CSV escapes delimiters, quotes, linebreaks and spreadsheet formula prefixes', () => {
  assert.equal(csvCell('A;B"C'), '"A;B""C"');
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@cmd', '  =1+1', '\tHYPERLINK', '\rhidden']) assert.ok(csvCell(value).startsWith('"\''));
  const study = completed(emptyStudy(), {}, '=HYPERLINK("https://invalid.example")');
  assert.match(attemptsCSV(study), /original_response/); assert.ok(attemptsCSV(study).includes('"\'=HYPERLINK'));
  assert.ok(materialsCSV(addMaterial(emptyStudy(), catalog, material())).startsWith('\uFEFF'));
});
