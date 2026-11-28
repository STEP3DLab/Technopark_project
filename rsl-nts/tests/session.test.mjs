import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_KEY, LOG_KEY, MAX_TEXT, Transcript,
  readStored, writeStored, cleanLog, journalCsv, validateVideoFile
} from '../session.mjs';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

const attempt = overrides => ({
  time: '2026-11-28T10:00:00.000Z', source: 'camera', sample: '', method: 'hands',
  word: 'вопрос', score: 0.95, visible_frames: 16, model_accepted: true,
  decision: 'pending', ...overrides
});

// A reader independent of the exporter: quoted fields may contain delimiters,
// doubled quotation marks, and line breaks, so splitting on lines is unsafe.
function parseCsv(csv) {
  const text = csv.replace(/^\uFEFF/, '');
  const records = [];
  let record = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      record.push(field); field = '';
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(field); records.push(record); record = []; field = '';
    } else field += char;
  }
  assert.equal(quoted, false, 'CSV must end outside a quoted field');
  if (record.length || field.length) { record.push(field); records.push(record); }
  return records;
}

function exportedObjects(csv) {
  const [headers, ...rows] = parseCsv(csv);
  assert.ok(rows.every(row => row.length === headers.length), 'CSV rows must keep their column alignment');
  return rows.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
}

test('a restored draft survives append, manual edit, clear, and the complete undo chain', () => {
  const storage = memoryStorage({[DRAFT_KEY]: JSON.stringify('Моё имя')});
  const transcript = new Transcript(readStored(storage, DRAFT_KEY, ''));
  assert.equal(transcript.text, 'Моё имя');
  assert.equal(transcript.undo(), false, 'restoring a draft must not invent undo history');

  assert.equal(transcript.append('  вопрос  '), true);
  assert.equal(transcript.text, 'Моё имя вопрос');
  assert.equal(transcript.replace('Моё имя?\nПожалуйста, помогите.'), true);
  assert.equal(transcript.replace(''), true);
  assert.equal(transcript.text, '');
  assert.equal(writeStored(storage, DRAFT_KEY, transcript.text), true);
  assert.equal(readStored(storage, DRAFT_KEY, 'missing'), '');

  assert.equal(transcript.undo(), true);
  assert.equal(transcript.text, 'Моё имя?\nПожалуйста, помогите.');
  assert.equal(transcript.undo(), true);
  assert.equal(transcript.text, 'Моё имя вопрос');
  assert.equal(transcript.undo(), true);
  assert.equal(transcript.text, 'Моё имя');
  assert.equal(transcript.undo(), false);
  writeStored(storage, DRAFT_KEY, transcript.text);
  assert.equal(new Transcript(readStored(storage, DRAFT_KEY, '')).text, 'Моё имя');
});

test('appending words handles empty text and trailing whitespace without altering earlier lines', () => {
  const transcript = new Transcript();
  assert.equal(transcript.append(' вода '), true);
  assert.equal(transcript.text, 'вода');
  transcript.replace('Первое сообщение.\nМне нужна  \n');
  transcript.append(' помощь ');
  assert.equal(transcript.text, 'Первое сообщение.\nМне нужна помощь');
  transcript.undo();
  assert.equal(transcript.text, 'Первое сообщение.\nМне нужна  \n');
});

test('unchanged edits do not consume undo and a new edit follows an undo normally', () => {
  const transcript = new Transcript('имя');
  assert.equal(transcript.replace('имя'), false);
  assert.equal(transcript.undo(), false);
  transcript.append('время');
  transcript.undo();
  transcript.append('вопрос');
  assert.equal(transcript.text, 'имя вопрос');
  transcript.undo();
  assert.equal(transcript.text, 'имя');
  assert.equal(transcript.undo(), false);
});

test('the 6000-character boundary admits a complete word and refuses partial appends', () => {
  assert.equal(MAX_TEXT, 6000);
  const transcript = new Transcript('я'.repeat(5995));
  assert.equal(transcript.append('вода'), true);
  assert.equal(transcript.text.length, 6000);
  assert.equal(transcript.text.slice(-5), ' вода');
  assert.equal(transcript.append('вопрос'), false);
  assert.equal(transcript.text.length, 6000);
  transcript.undo();
  assert.equal(transcript.text, 'я'.repeat(5995), 'a refused append must not add an undo entry');
});

test('oversized stored drafts and manual edits are bounded, with the original draft recoverable', () => {
  const oversized = 'Ж'.repeat(6500);
  assert.equal(new Transcript(oversized).text.length, 6000);
  const transcript = new Transcript('сохранённое сообщение');
  transcript.replace(oversized);
  assert.equal(transcript.text, 'Ж'.repeat(6000));
  transcript.undo();
  assert.equal(transcript.text, 'сохранённое сообщение');
  for (const value of [null, undefined, 42, {}, []]) {
    assert.equal(new Transcript(value).text, '');
  }
  assert.throws(() => transcript.replace(null), TypeError);
  assert.equal(transcript.text, 'сохранённое сообщение');
});

test('the undo buffer remains bounded during long editing sessions', () => {
  const transcript = new Transcript('редакция 0');
  for (let i = 1; i <= 35; i++) transcript.replace(`редакция ${i}`);
  let undos = 0;
  while (transcript.undo()) undos++;
  assert.equal(undos, 30);
  assert.equal(transcript.text, 'редакция 5');
});

test('missing, unavailable, and corrupt storage leave a usable in-memory session', () => {
  const broken = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); }
  };
  for (const storage of [null, undefined, broken, memoryStorage({[DRAFT_KEY]: '{broken json'})]) {
    const transcript = new Transcript(readStored(storage, DRAFT_KEY, ''));
    assert.equal(transcript.text, '');
    transcript.append('помочь');
    assert.equal(transcript.text, 'помочь');
    assert.deepEqual(cleanLog(readStored(storage, LOG_KEY, [])), []);
  }
  assert.equal(writeStored(null, DRAFT_KEY, 'текст'), false);
  assert.equal(writeStored(undefined, DRAFT_KEY, 'текст'), false);
  assert.equal(writeStored(broken, DRAFT_KEY, 'текст'), false);
  assert.equal(readStored(memoryStorage(), DRAFT_KEY, 'запасной текст'), 'запасной текст');
});

test('storage round-trips draft and journal independently and survives serialization failure', () => {
  const storage = memoryStorage();
  const draft = 'Вода; «школа»\nСегодня?';
  const journal = [attempt({decision: 'confirmed'})];
  assert.equal(writeStored(storage, DRAFT_KEY, draft), true);
  assert.equal(writeStored(storage, LOG_KEY, journal), true);
  assert.equal(readStored(storage, DRAFT_KEY, ''), draft);
  assert.deepEqual(readStored(storage, LOG_KEY, []), journal);
  const circular = {}; circular.self = circular;
  assert.equal(writeStored(storage, DRAFT_KEY, circular), false);
  assert.equal(readStored(storage, DRAFT_KEY, ''), draft, 'failed serialization must preserve the previous draft');
  assert.equal(new Transcript(readStored(memoryStorage({[DRAFT_KEY]: 'null'}), DRAFT_KEY, '')).text, '');
});

test('the journal keeps only the newest 100 valid attempts, in chronological order', () => {
  const rows = Array.from({length: 125}, (_, i) => attempt({word: `слово ${i}`}));
  const original = structuredClone(rows);
  const cleaned = cleanLog(rows);
  assert.equal(cleaned.length, 100);
  assert.equal(cleaned[0].word, 'слово 25');
  assert.equal(cleaned.at(-1).word, 'слово 124');
  assert.deepEqual(rows, original, 'sanitizing a journal must not mutate active attempt objects');
});

test('malformed journal records are rejected and unsupported stored shapes do not crash', () => {
  for (const value of [undefined, null, {}, '[]', 7]) assert.deepEqual(cleanLog(value), []);
  const valid = attempt();
  const invalid = [
    null, undefined, false, 7, 'camera', [], {},
    attempt({source: 'server'}), attempt({source: null}),
    attempt({decision: 'automatic-success'}), attempt({decision: undefined}),
    attempt({time: null}), attempt({time: 0}), attempt({time: {}})
  ];
  const cleaned = cleanLog([...invalid, valid]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].word, 'вопрос');
  assert.deepEqual(cleanLog(cleaned), cleaned, 'saved sanitized entries must remain readable after reload');
});

test('journal sanitization excludes video and transcript data and bounds text fields', () => {
  const cleaned = cleanLog([attempt({
    word: 'Я'.repeat(200), sample: {video: 'private'}, method: ['hands'],
    video: 'private recording', transcript: 'private message', extra: 'not part of journal'
  })])[0];
  assert.equal(cleaned.word.length, 160);
  assert.equal(cleaned.sample, '');
  assert.equal(cleaned.method, '');
  assert.equal(cleaned.score, '0.95');
  assert.equal(cleaned.visible_frames, '16');
  assert.equal(cleaned.model_accepted, 'true');
  for (const key of ['video', 'transcript', 'extra']) assert.equal(Object.hasOwn(cleaned, key), false);
});

test('CSV round-trips Russian text, quoted strings, delimiters, and embedded line breaks', () => {
  const word = 'Имя; "вопрос"\r\nвторая строка\nтретья строка';
  const csv = journalCsv([attempt({source: 'file', word, model_accepted: false, decision: 'rejected'})]);
  assert.ok(csv.startsWith('\uFEFF'), 'UTF-8 BOM keeps Russian text readable in spreadsheet applications');
  const [row] = exportedObjects(csv);
  assert.equal(row.word, word);
  assert.equal(row.source, 'file');
  assert.equal(row.model_accepted, 'false');
  assert.equal(row.decision, 'rejected');
  assert.equal(parseCsv(csv).length, 2, 'embedded newlines must not become extra records');
  assert.equal(parseCsv(journalCsv([])).length, 1, 'an empty export still has its header');
});

test('CSV formula-like cells are exported as text, never executable formulas', () => {
  const dangerous = ['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1:A2)', '\t=1+1', '\r=1+1'];
  const csv = journalCsv(dangerous.map(word => attempt({word})));
  const rows = exportedObjects(csv);
  assert.equal(rows.length, dangerous.length);
  rows.forEach((row, i) => assert.equal(row.word, "'" + dangerous[i]));
  assert.equal(exportedObjects(journalCsv([attempt({word: 'обычный текст'})]))[0].word, 'обычный текст');
});

test('video validation accepts normal supported file selections including absent MIME metadata', () => {
  const allowed = [
    {name: 'жест.mp4', type: 'video/mp4', size: 1024},
    {name: 'clip.mov', type: 'video/quicktime', size: 1024},
    {name: 'clip.webm', type: 'video/webm', size: 1024},
    {name: 'ЖЕСТ.MP4', type: '', size: 1024},
    {name: 'жест.m4v', type: '', size: 1024},
    {name: 'жест.ogv', type: '', size: 1024},
    {name: 'жест.ogg', type: '', size: 1024},
    {name: 'camera-capture', type: 'video/mp4', size: 1024},
    {name: 'boundary.mp4', type: 'video/mp4', size: 100 * 1024 * 1024}
  ];
  for (const file of allowed) assert.equal(validateVideoFile(file), '', file.name);
});

test('invalid, empty, oversize, and disguised non-video files get actionable rejection', () => {
  const rejected = [
    [null, /Выберите видео/],
    [undefined, /Выберите видео/],
    [{name: 'empty.mp4', type: 'video/mp4', size: 0}, /пуст/],
    [{name: 'large.mp4', type: 'video/mp4', size: 100 * 1024 * 1024 + 1}, /100 МБ/],
    [{name: 'audio.mp4', type: 'audio/mp4', size: 1024}, /видеофайл/],
    [{name: 'picture.mp4', type: 'image/jpeg', size: 1024}, /видеофайл/],
    [{name: 'clip.mp4.exe', type: '', size: 1024}, /не определил видео/],
    [{name: 'unknown', type: '', size: 1024}, /не определил видео/]
  ];
  for (const [file, message] of rejected) assert.match(validateVideoFile(file), message);
});
