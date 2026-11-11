// Pilot records are local research notes. They never train or call a translator.
// An answer is frozen before a review; reviews cannot rewrite its target or text.
export const PILOT_SCHEMA = 1;
export const PILOT_PROTOCOL = 'visitor-v1';
export const MAX_ROWS = 4000;
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const SPLITS = Object.freeze(['train', 'validation', 'test']);
export const OUTCOMES = Object.freeze(['answered', 'refused', 'skipped']);
export const MEANING = Object.freeze(['preserved', 'partial', 'changed', 'uncertain']);
export const FEATURES = Object.freeze(['preserved', 'changed', 'not_applicable', 'uncertain']);
const copy = value => JSON.parse(JSON.stringify(value));
const fail = text => { throw new Error(text); };
const oneOf = (value, list, label) => list.includes(value) ? value : fail(`Проверьте поле «${label}».`);
const str = (value, label, max = 2000, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`Проверьте поле «${label}».`);
  return value.trim();
};
const code = value => typeof value === 'string' && /^[A-Z][A-Z0-9_-]{1,23}$/.test(value) ? value : fail('Код участника: 2–24 латинских буквы, цифры, дефис или подчёркивание; первый символ — буква.');
const integer = (value, max, label) => Number.isSafeInteger(value) && value >= 1 && value <= max ? value : fail(`Проверьте поле «${label}».`);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fail('Некорректная дата записи.');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? value : fail('Некорректный идентификатор записи.');
const freshId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`}`;
const now = () => new Date().toISOString();

export function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length !== 20) fail('Не удалось открыть протокол из 20 сообщений.');
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const item = catalog[i];
    if (!item || item.id !== `M${String(i + 1).padStart(2, '0')}` || seen.has(item.id)) fail('Нарушен порядок сообщений протокола.');
    for (const key of ['text', 'role', 'context']) str(item[key], key, 400, true);
    seen.add(item.id);
  }
  return copy(catalog);
}

export function emptyStudy() {
  return { schemaVersion: PILOT_SCHEMA, protocolVersion: PILOT_PROTOCOL, id: freshId('study'), createdAt: now(), participants: [], materials: [], languageReviews: [], attempts: [], reviews: [] };
}

function message(catalog, expectedId, expectedText) {
  const found = catalog.find(item => item.id === expectedId);
  if (!found || (expectedText !== undefined && found.text !== expectedText)) fail('Ожидаемый смысл не совпадает с исходным протоколом.');
  return found;
}

function register(study, participantCode, split) {
  code(participantCode); oneOf(split, SPLITS, 'раздел данных');
  const existing = study.participants.find(item => item.code === participantCode);
  if (existing && existing.split !== split) fail(`${participantCode} уже относится к разделу ${existing.split}. Один участник не может попадать в разные разделы.`);
  if (!existing) study.participants.push({ code: participantCode, split });
}

function videoMetadata(value) {
  if (!value || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) fail('Не хватает контрольной суммы локального видео. Выберите файл ещё раз.');
  if (!Number.isFinite(value.duration) || value.duration <= 0 || value.duration > 600) fail('Видео должно длиться не более 10 минут.');
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 200 * 1024 * 1024) fail('Размер видео должен быть от 1 байта до 200 МБ.');
  integer(value.width, 16384, 'ширина видео'); integer(value.height, 16384, 'высота видео');
  return { sha256: value.sha256, duration: value.duration, bytes: value.bytes, width: value.width, height: value.height };
}

function materialRecord(study, catalog, input) {
  if (input.consent !== true) fail('Для записи требуется подтверждение согласованного исследовательского использования.');
  const target = message(catalog, input.expectedId, input.expectedText);
  const media = videoMetadata(input.video);
  const status = oneOf(input.languageStatus, ['pending', 'approved', 'changes'], 'языковая проверка');
  const reviewerCode = input.reviewerCode ? code(input.reviewerCode) : '';
  if (status !== 'pending' && !reviewerCode) fail('Укажите код специалиста, выполнившего языковую проверку.');
  const result = {
    id: id(input.id), createdAt: timestamp(input.createdAt), participantCode: code(input.participantCode),
    split: oneOf(input.split, SPLITS, 'раздел данных'), expectedId: target.id, expectedText: target.text,
    take: integer(input.take, 99, 'номер дубля'), mediaType: oneOf(input.mediaType, ['human_video', 'avatar_video'], 'тип материала'),
    consent: true, video: media, languageStatus: status, reviewerCode,
    notes: str(input.notes ?? '', 'комментарий'),
  };
  register(study, result.participantCode, result.split);
  if (study.materials.some(item => item.video.sha256 === media.sha256)) fail('Этот видеофайл уже зарегистрирован. Повтор одного файла не считается новым дублем.');
  if (study.materials.some(item => item.participantCode === result.participantCode && item.expectedId === result.expectedId && item.take === result.take && item.mediaType === result.mediaType)) fail('Такой номер дубля уже есть у участника для этого сообщения и типа материала.');
  return result;
}

export function addMaterial(study, catalog, input) {
  if (study.materials.length >= MAX_ROWS) fail('Достигнут предел записей. Сохраните проект и создайте новый.');
  const result = copy(study);
  result.materials.push(materialRecord(result, catalog, { ...input, id: freshId('material'), createdAt: now() }));
  return result;
}

function languageReviewRecord(study, input) {
  if (!study.materials.some(item => item.id === input.materialId)) fail('Материал для языковой проверки не найден.');
  return { id: id(input.id), createdAt: timestamp(input.createdAt), materialId: input.materialId,
    reviewerCode: code(input.reviewerCode), status: oneOf(input.status, ['approved', 'changes'], 'языковая проверка'), notes: str(input.notes ?? '', 'замечания к переводу') };
}

export function addMaterialReview(study, input) {
  if (study.languageReviews.length >= MAX_ROWS * 3) fail('Достигнут предел языковых оценок. Сохраните проект.');
  const result = copy(study);
  result.languageReviews.push(languageReviewRecord(result, { ...input, id: freshId('language-review'), createdAt: now() }));
  return result;
}

export function materialLanguage(study, material) {
  const review = [...study.languageReviews].reverse().find(item => item.materialId === material.id);
  return review ? { status: review.status, reviewerCode: review.reviewerCode } : { status: material.languageStatus, reviewerCode: material.reviewerCode };
}

export function beginAttempt(study, catalog, input) {
  if (input.consent !== true) fail('Подтвердите согласие на участие в исследовательской проверке.');
  if (study.attempts.length >= MAX_ROWS) fail('Достигнут предел попыток. Сохраните проект и создайте новый.');
  const target = message(catalog, input.expectedId);
  const draft = {
    id: freshId('attempt'), studyId: study.id, startedAt: now(),
    participantCode: code(input.participantCode), split: oneOf(input.split, SPLITS, 'раздел данных'),
    kind: oneOf(input.kind, ['recognition', 'comprehension'], 'задача проверки'),
    mediaType: oneOf(input.mediaType, ['human_video', 'avatar_video', 'live'], 'тип показа'),
    expectedId: target.id, expectedText: target.text, take: integer(input.take, 99, 'номер попытки'),
    materialId: input.materialId || '', consent: true,
  };
  register(copy(study), draft.participantCode, draft.split);
  validateAttemptContext(study, draft);
  return Object.freeze(draft);
}

function validateAttemptContext(study, draft) {
  if (draft.materialId) {
    const source = study.materials.find(item => item.id === draft.materialId);
    if (!source || source.expectedId !== draft.expectedId || source.mediaType !== draft.mediaType) fail('Материал не соответствует выбранному сообщению и типу показа.');
    if (draft.kind === 'recognition' && (source.participantCode !== draft.participantCode || source.split !== draft.split)) fail('В проверке распознавания код исполнителя и раздел должны совпадать с исходным видео.');
    if (draft.kind === 'comprehension' && source.participantCode === draft.participantCode) fail('Для проверки понятности нужен другой участник, который не исполнял исходную запись.');
  } else if (draft.mediaType !== 'live') fail('Выберите зарегистрированный материал для видеопроверки.');
  if (study.attempts.some(item => item.participantCode === draft.participantCode && item.kind === draft.kind && item.expectedId === draft.expectedId && item.take === draft.take && item.mediaType === draft.mediaType)) fail('Этот номер попытки уже зафиксирован. Для повторения увеличьте номер.');
}

function attemptRecord(study, catalog, input) {
  if (input.studyId !== study.id || input.consent !== true) fail('Попытка относится к другому проекту или не подтверждена.');
  const target = message(catalog, input.expectedId, input.expectedText);
  const outcome = oneOf(input.outcome, OUTCOMES, 'исход попытки');
  const response = str(input.response, 'исходный ответ', 4000, outcome === 'answered');
  if (outcome !== 'answered' && response) fail('Для отказа или пропуска оставьте ответ пустым, пояснение запишите отдельно.');
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0 || input.elapsedMs > 24 * 3600 * 1000) fail('Некорректная длительность попытки.');
  const result = {
    id: id(input.id), studyId: study.id, startedAt: timestamp(input.startedAt), completedAt: timestamp(input.completedAt),
    participantCode: code(input.participantCode), split: oneOf(input.split, SPLITS, 'раздел данных'),
    kind: oneOf(input.kind, ['recognition', 'comprehension'], 'задача проверки'),
    mediaType: oneOf(input.mediaType, ['human_video', 'avatar_video', 'live'], 'тип показа'),
    expectedId: target.id, expectedText: target.text, take: integer(input.take, 99, 'номер попытки'),
    materialId: input.materialId ? id(input.materialId) : '', consent: true, outcome, response,
    elapsedMs: Math.round(input.elapsedMs), notes: str(input.notes ?? '', 'комментарий'),
  };
  if (Date.parse(result.completedAt) < Date.parse(result.startedAt)) fail('Окончание попытки не может предшествовать началу.');
  register(study, result.participantCode, result.split);
  validateAttemptContext(study, result);
  return result;
}

export function finishAttempt(study, catalog, draft, input) {
  if (!draft || study.attempts.some(item => item.id === draft.id)) fail('Эта попытка уже завершена. Начните новую.');
  const result = copy(study);
  // Only outcome fields can be supplied here. The fixed task is read from draft.
  const record = attemptRecord(result, catalog, { ...draft, completedAt: now(), outcome: input.outcome, response: input.response, notes: input.notes, elapsedMs: input.elapsedMs });
  result.attempts.push(record);
  return result;
}

function reviewRecord(study, input) {
  const attempt = study.attempts.find(item => item.id === input.attemptId);
  if (!attempt || attempt.outcome !== 'answered') fail('Оценить смысл можно только у зафиксированного ответа.');
  const reviewerCode = code(input.reviewerCode);
  if (typeof input.independent !== 'boolean') fail('Укажите, выполняется ли независимая оценка.');
  if (input.independent && reviewerCode === attempt.participantCode) fail('Независимую оценку не может выполнять тот же участник.');
  if (study.reviews.some(item => item.attemptId === input.attemptId && item.reviewerCode === reviewerCode)) fail('Оценка этого проверяющего уже сохранена. Исходные оценки не перезаписываются.');
  return {
    id: id(input.id), createdAt: timestamp(input.createdAt), attemptId: attempt.id, reviewerCode, independent: input.independent,
    meaning: oneOf(input.meaning, MEANING, 'смысл'), polarity: oneOf(input.polarity, FEATURES, 'отрицание / утверждение'),
    question: oneOf(input.question, FEATURES, 'вопрос / сообщение'),
    correctedText: str(input.correctedText ?? '', 'уточнённый текст', 4000), notes: str(input.notes ?? '', 'комментарий'),
  };
}

export function addReview(study, input) {
  if (study.reviews.length >= MAX_ROWS * 3) fail('Достигнут предел оценок. Сохраните проект.');
  const result = copy(study);
  result.reviews.push(reviewRecord(result, { ...input, id: freshId('review'), createdAt: now() }));
  return result;
}

export function studySummary(study) {
  const reviewedIds = new Set(study.reviews.map(item => item.attemptId));
  return {
    participants: study.participants.length, materials: study.materials.length,
    approvedMaterials: study.materials.filter(item => materialLanguage(study, item).status === 'approved').length,
    coveredMessages: new Set(study.materials.map(item => item.expectedId)).size,
    attempts: study.attempts.length, firstAttempts: study.attempts.filter(item => item.take === 1).length,
    answered: study.attempts.filter(item => item.outcome === 'answered').length,
    refused: study.attempts.filter(item => item.outcome === 'refused').length,
    skipped: study.attempts.filter(item => item.outcome === 'skipped').length,
    reviewed: reviewedIds.size, independentReviews: study.reviews.filter(item => item.independent).length,
  };
}

export function exportStudy(study) {
  return JSON.stringify({ ...study, exportedAt: now(), notice: 'Локальный журнал пилота полных сообщений. Записи и оценки внесены исследователем. Видео и результаты автоматического перевода не включены. Исправленный текст не заменяет исходный ответ.' }, null, 2);
}

export function importStudy(text, catalog) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) fail('JSON превышает допустимый размер 8 МБ.');
  let source; try { source = JSON.parse(text); } catch { fail('Не удалось прочитать JSON. Выберите экспорт этого рабочего кабинета.'); }
  if (!source || source.schemaVersion !== PILOT_SCHEMA || source.protocolVersion !== PILOT_PROTOCOL) fail('Неподдерживаемая версия протокола.');
  const study = { schemaVersion: PILOT_SCHEMA, protocolVersion: PILOT_PROTOCOL, id: id(source.id), createdAt: timestamp(source.createdAt), participants: [], materials: [], languageReviews: [], attempts: [], reviews: [] };
  for (const key of ['participants', 'materials', 'languageReviews', 'attempts', 'reviews']) {
    if (!Array.isArray(source[key]) || source[key].length > (key === 'reviews' || key === 'languageReviews' ? MAX_ROWS * 3 : MAX_ROWS)) fail(`Некорректный раздел ${key}.`);
  }
  const seenIds = new Set([study.id]);
  for (const participant of source.participants) {
    if (!participant || study.participants.some(item => item.code === participant.code)) fail('Повтор кода участника в реестре.');
    register(study, participant.code, participant.split);
  }
  const declared = new Map(study.participants.map(item => [item.code, item.split]));
  for (const key of ['materials', 'languageReviews', 'attempts', 'reviews']) {
    for (const item of source[key]) {
      if (!item || seenIds.has(item.id)) fail('Повтор идентификатора в журнале.');
      if ((key === 'materials' || key === 'attempts') && declared.get(item.participantCode) !== item.split) fail('Участник не соответствует исходному реестру разделов.');
      const validated = key === 'materials' ? materialRecord(study, catalog, item) : key === 'languageReviews' ? languageReviewRecord(study, item) : key === 'attempts' ? attemptRecord(study, catalog, item) : reviewRecord(study, item);
      seenIds.add(validated.id); study[key].push(validated);
    }
  }
  return study;
}

export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet programs execute formulas even in quoted cells. Prefix unsafe text.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(headers, rows) { return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n'; }

export function attemptsCSV(study) {
  const headers = ['attempt_id','participant_code','split','kind','media_type','message_id','expected_meaning','take','material_id','outcome','original_response','elapsed_ms','started_at','notes','review_count','reviews_json'];
  return csv(headers, study.attempts.map(a => [a.id,a.participantCode,a.split,a.kind,a.mediaType,a.expectedId,a.expectedText,a.take,a.materialId,a.outcome,a.response,a.elapsedMs,a.startedAt,a.notes,study.reviews.filter(r => r.attemptId === a.id).length,JSON.stringify(study.reviews.filter(r => r.attemptId === a.id))]));
}

export function materialsCSV(study) {
  return csv(['material_id','signer_code','split','message_id','expected_meaning','take','media_type','sha256','duration_seconds','width','height','bytes','language_status','reviewer_code','consent_research','notes','language_review_history_json'], study.materials.map(m => [m.id,m.participantCode,m.split,m.expectedId,m.expectedText,m.take,m.mediaType,m.video.sha256,m.video.duration,m.video.width,m.video.height,m.video.bytes,materialLanguage(study,m).status,materialLanguage(study,m).reviewerCode,m.consent,m.notes,JSON.stringify(study.languageReviews.filter(r => r.materialId === m.id))]));
}
