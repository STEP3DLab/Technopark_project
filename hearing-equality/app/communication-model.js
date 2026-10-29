/** Communication state is independent of recognition. Never infer user intent. */
export const MESSAGE_LIMIT = 2000;
export const HISTORY_LIMIT = 100;
export const STORAGE_SCHEMA = 1;
export const textLength = value => Array.from(String(value ?? '')).length;
export const isSendable = value => Boolean(String(value ?? '').trim()) && textLength(value) <= MESSAGE_LIMIT;
export const isDemo = sources => sources.some(source => source === 'demo');

export function insertText(text, addition, start = text.length, end = start) {
  text = String(text ?? ''); addition = String(addition ?? '').trim();
  if (!addition) return { text, cursor: start };
  start = Math.max(0, Math.min(text.length, Number(start) || 0));
  end = Math.max(start, Math.min(text.length, Number(end) || 0));
  const before = text.slice(0, start), after = text.slice(end);
  const left = before && !/\s$/.test(before) ? ' ' : '';
  const right = after && !/^\s|^[.,!?;:)]/.test(after) ? ' ' : '';
  const result = before + left + addition + right + after;
  if (textLength(result) > MESSAGE_LIMIT) throw new RangeError(`Сообщение длиннее ${MESSAGE_LIMIT} знаков. Сократите его: текст не был обрезан.`);
  return { text: result, cursor: before.length + left.length + addition.length + right.length };
}

export class MessageDraft {
  constructor(text = '', sources = []) {
    this.text = String(text); this.sources = [...new Set(sources)]; this.revision = 0; this.undoStack = [];
  }
  set(text, source = 'typed') {
    text = String(text);
    if (text === this.text) return false;
    this.undoStack.push({ text: this.text, sources: [...this.sources] });
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.text = text; this.sources = text ? [...new Set([...this.sources, source])] : [];
    this.revision++; return true;
  }
  insert(text, source, start, end) {
    const result = insertText(this.text, text, start, end);
    this.set(result.text, source); return result;
  }
  undo() {
    const previous = this.undoStack.pop(); if (!previous) return false;
    this.text = previous.text; this.sources = previous.sources; this.revision++; return true;
  }
  forget() { this.text = ''; this.sources = []; this.undoStack = []; this.revision++; }
  snapshot() { return Object.freeze({ text: this.text.trim(), revision: this.revision, demo: isDemo(this.sources) }); }
}

export function readSavedDraft(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return { text: '', sources: [], enabled: false, error: '' };
    const value = JSON.parse(raw);
    if (value.schema !== STORAGE_SCHEMA || value.enabled !== true || typeof value.text !== 'string' || textLength(value.text) > MESSAGE_LIMIT || !Array.isArray(value.sources)) throw new Error('invalid');
    return { text: value.text, sources: value.sources.filter(x => ['typed', 'phrase', 'gesture', 'demo'].includes(x)), enabled: true, error: '' };
  } catch { return { text: '', sources: [], enabled: false, error: 'Сохранённый черновик недоступен. Новое сообщение можно набрать без сохранения.' }; }
}

export function writeSavedDraft(storage, key, draft, enabled) {
  try {
    if (!storage) throw new Error('storage');
    if (!enabled || !draft.text) storage.removeItem(key);
    else {
      if (textLength(draft.text) > MESSAGE_LIMIT) throw new Error('too-long');
      storage.setItem(key, JSON.stringify({ schema: STORAGE_SCHEMA, enabled: true, text: draft.text, sources: draft.sources }));
    }
    return true;
  } catch { return false; }
}

export function transcript(messages) {
  return messages.map(m => `${m.role === 'self' ? 'Вы' : 'Собеседник'}${m.demo ? ' [демопример]' : ''}: ${m.text}`).join('\n\n');
}
export function addMessage(messages, role, text, demo = false) {
  if (!['self', 'partner'].includes(role) || !isSendable(text)) throw new Error('Проверьте текст сообщения.');
  if (messages.length >= HISTORY_LIMIT) throw new Error('В диалоге уже 100 реплик. Скопируйте его и начните новый; прежние реплики не удалены.');
  return [...messages, { role, text: String(text).trim(), demo: Boolean(demo) }];
}
