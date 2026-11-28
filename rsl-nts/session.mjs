// Browser-local draft and a small, video-free journal of recognition attempts.
export const DRAFT_KEY = 'rgsu-rsl-mvp:draft:v1';
export const LOG_KEY = 'rgsu-rsl-mvp:attempts:v1';
export const MAX_TEXT = 6000;

export function readStored(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
export function writeStored(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); return Boolean(storage); }
  catch { return false; }
}
export class Transcript {
  constructor(initial = '') {
    this.text = typeof initial === 'string' ? initial.slice(0, MAX_TEXT) : '';
    this.history = [];
  }
  replace(next) {
    if (typeof next !== 'string') throw new TypeError('Text must be a string');
    next = next.slice(0, MAX_TEXT);
    if (next === this.text) return false;
    this.history.push(this.text);
    if (this.history.length > 30) this.history.shift();
    this.text = next;
    return true;
  }
  append(word) {
    const next = [this.text.trimEnd(), word.trim()].filter(Boolean).join(' ');
    if (next.length > MAX_TEXT) return false;
    return this.replace(next);
  }
  undo() {
    if (!this.history.length) return false;
    this.text = this.history.pop();
    return true;
  }
}
const FIELDS = ['time', 'source', 'sample', 'method', 'word', 'score', 'visible_frames', 'model_accepted', 'decision'];
const SOURCES = new Set(['camera', 'file', 'example']);
const DECISIONS = new Set(['pending', 'confirmed', 'rejected', 'abstained']);
export function cleanLog(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row && typeof row === 'object' && SOURCES.has(row.source)
    && DECISIONS.has(row.decision) && typeof row.time === 'string')
    .slice(-100).map(row => Object.fromEntries(FIELDS.map(key => [key,
      ['string', 'number', 'boolean'].includes(typeof row[key]) ? String(row[key]).slice(0, 160) : ''])));
}
export function journalCsv(rows) {
  const escape = value => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [FIELDS, ...cleanLog(rows).map(row => FIELDS.map(key => row[key]))]
    .map(row => row.map(escape).join(';')).join('\r\n');
}
export function validateVideoFile(file) {
  if (!file) return 'Выберите видео на устройстве.';
  if (file.size > 100 * 1024 * 1024) return 'Файл больше 100 МБ. Выберите короткий фрагмент с одним жестом.';
  if (file.size === 0) return 'Этот файл пуст. Выберите другой ролик.';
  if (file.type && !file.type.startsWith('video/')) return 'Нужен видеофайл: например, MP4, MOV или WebM.';
  if (!file.type && !/\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(file.name || '')) return 'Браузер не определил видео. Попробуйте MP4 или WebM.';
  return '';
}
