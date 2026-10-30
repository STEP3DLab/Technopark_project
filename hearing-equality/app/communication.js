import {readSavedDraft,writeSavedDraft} from './communication-model.js?v=0.17.0';
// A tab-local editor and explicit text-transfer actions. No network
// endpoint, clipboard read, or automatic send. Draft storage is explicit opt-in.
export const MAX_MESSAGE_LENGTH = 2000;

const textOf = value => String(value ?? '');
const nonblank = value => Boolean(textOf(value).trim());
const position = (value, length) => Math.max(0, Math.min(length, Number.isFinite(value) ? Math.trunc(value) : length));
const selectionFor = (start, end, length) => {
  const a = position(start, length), b = position(end, length);
  return { start: Math.min(a, b), end: Math.max(a, b) };
};

/** The whole insertion is accepted or rejected; text is never silently cut.
 * User edits invalidate our one-step undo. A completed attempt ID remains
 * consumed after undo/clear, so alternate confirmation paths cannot duplicate it.
 */
export function createDraftModel(initial = '', { limit = MAX_MESSAGE_LENGTH, demo = false, allowInitialOverflow = false } = {}) {
  let text = textOf(initial);
  if (text.length > limit && !allowInitialOverflow) throw new RangeError(`Сообщение длиннее ${limit} символов`);
  let selection = { start: text.length, end: text.length }, undo = null, manuallyChanged = false;
  const insertedAttempts = new Set();
  const read = () => ({ text, ...selection, length: text.length, limit, canUndo: Boolean(undo), demo });
  const result = (ok, reason, extra = {}) => ({ ok, reason, ...read(), ...extra });
  const remember = (next, nextSelection, kind) => {
    undo = { before: text, beforeSelection: { ...selection }, after: next, kind, demo };
    text = next; selection = nextSelection; manuallyChanged = false;
  };
  return {
    read,
    select(start, end = start) { selection = selectionFor(start, end, text.length); return read(); },
    edit(value, start, end = start) {
      const next = textOf(value);
      if (next.length > limit && next.length >= text.length) return result(false, 'limit');
      if (next !== text) { text = next; undo = null; manuallyChanged = true; if (!text) demo = false; }
      selection = selectionFor(start, end, text.length);
      return result(true, 'edited');
    },
    insert(value, { attemptId, demo: insertedDemo = false } = {}) {
      const phrase = textOf(value).trim();
      if (!phrase) return result(false, 'empty');
      if (attemptId != null && insertedAttempts.has(attemptId)) return result(false, 'duplicate');
      const prefix = text.slice(0, selection.start), suffix = text.slice(selection.end);
      const before = prefix && !/\s$/u.test(prefix) && !/[([{«]$/u.test(prefix) && !/^[,.;:!?…)}\]»]/u.test(phrase) ? ' ' : '';
      const after = suffix && !/^\s/u.test(suffix) && !/^[,.;:!?…)}\]»]/u.test(suffix) && !/[([{«]$/u.test(phrase) ? ' ' : '';
      const inserted = before + phrase + after, next = prefix + inserted + suffix;
      if (next.length > limit) return result(false, 'limit', { required: next.length });
      const caret = prefix.length + inserted.length;
      if (next !== text) remember(next, { start: caret, end: caret }, 'insert');
      else selection = { start: caret, end: caret };
      demo ||= Boolean(insertedDemo);
      if (attemptId != null) insertedAttempts.add(attemptId);
      return result(true, 'inserted');
    },
    clear() {
      if (!text) return result(false, 'empty');
      remember('', { start: 0, end: 0 }, 'clear'); demo = false;
      return result(true, 'cleared');
    },
    undo() {
      if (!undo || text !== undo.after) return result(false, manuallyChanged ? 'edited-after' : 'nothing-to-undo');
      text = undo.before; selection = undo.beforeSelection; demo = undo.demo; undo = null;
      return result(true, 'undone');
    },
    hasAttempt(attemptId) { return insertedAttempts.has(attemptId); },
  };
}

export async function copyPlainText(text, { clipboard, selectFallback } = {}) {
  const value = textOf(text);
  if (!nonblank(value)) return { status: 'empty' };
  if (typeof clipboard?.writeText !== 'function') {
    selectFallback?.(); return { status: 'unsupported' };
  }
  try {
    await clipboard.writeText(value);
    return { status: 'copied' };
  } catch (error) {
    selectFallback?.(); return { status: 'failed', error: error?.name || 'Error' };
  }
}

// share() is called before the first await, preserving the user's click gesture.
// A resolved promise means completion of the system action, not delivery.
export async function sharePlainText(text, { navigator: nav } = {}) {
  const value = textOf(text), payload = { text: value };
  if (!nonblank(value)) return { status: 'empty' };
  if (typeof nav?.share !== 'function') return { status: 'unsupported' };
  try {
    if (typeof nav.canShare === 'function' && !nav.canShare(payload)) return { status: 'unsupported' };
    await nav.share(payload);
    return { status: 'completed' };
  } catch (error) {
    return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error: error?.name || 'Error' };
  }
}

export function dialoguePlainText(messages = []) {
  const roles = { visitor: 'Вы', employee: 'Собеседник' };
  return messages.filter(message => Object.hasOwn(roles, message?.role) && nonblank(message.text))
    .map(message => `${roles[message.role]}${message.kind === 'demo' ? ' [демопример]' : ''}:\n${textOf(message.text)}`).join('\n\n');
}

export function downloadPlainText(text, { document: doc, URL: urls, Blob: BlobType, filename = 'soobshchenie.txt', defer = fn => setTimeout(fn, 1000) } = {}) {
  const value = textOf(text);
  if (!nonblank(value)) return { status: 'empty' };
  if (!doc?.createElement || !urls?.createObjectURL || !BlobType) return { status: 'unsupported' };
  let url, link;
  try {
    url = urls.createObjectURL(new BlobType([value], { type: 'text/plain;charset=utf-8' }));
    link = doc.createElement('a'); link.href = url; link.download = filename; link.hidden = true;
    doc.body?.append(link); link.click();
    return { status: 'download-started' };
  } catch (error) {
    return { status: 'failed', error: error?.name || 'Error' };
  } finally {
    link?.remove();
    if (url) defer(() => urls.revokeObjectURL(url));
  }
}

/** DOM integration is deliberately independent of the avatar/catalog/model. */
export function createCommunicationController({ document: doc, navigator: nav, window: win,
  stopActivities = () => {}, speak = () => {}, onSaveMessage = () => false, getDialogue = () => [], onPresent = () => {} } = {}) {
  const $ = id => doc.getElementById(id), editor = $('conversation');
  let storage; try { storage = win.localStorage; } catch {}
  const draftKey = `hearing-communication:draft:v1:${win.location?.pathname || '/'}`;
  const saved = readSavedDraft(storage, draftKey);
  const model = createDraftModel(saved.text || editor.value, {demo: saved.sources.includes('demo'),allowInitialOverflow:true});
  editor.value = model.read().text;
  if ($('remember-draft')) $('remember-draft').checked = saved.enabled;
  let lastSavedSnapshot = null;
  const persist = () => {
    const state = model.read();
    if (!writeSavedDraft(storage, draftKey, {text:state.text,sources:state.demo?['demo']:['typed']}, Boolean($('remember-draft')?.checked))) {
      status('Не удалось обновить хранилище. Текущий текст остаётся на экране; прежняя сохранённая копия могла остаться.', 'draft-storage-status');
    } else status($('remember-draft')?.checked ? 'Черновик сохранён в этом браузере. Другой пользователь устройства сможет его открыть.' : 'Черновик только в этой вкладке; сохранённая копия удалена.', 'draft-storage-status');
  };
  let displayReturn = null, shareReturn = null, fallbackFilename = 'soobshchenie.txt', transferId = 0;
  const listeners = [];
  const on = (el, type, handler) => { el?.addEventListener(type, handler); listeners.push([el, type, handler]); };
  const status = (message, target = 'draft-status') => { const el = $(target); if (el && el.textContent !== message) el.textContent = message; };
  const limitMessage = `Не помещается: максимум ${MAX_MESSAGE_LENGTH} символов. Сократите текст или выделите заменяемую часть. Ничего не обрезано.`;
  const manualCopyMessage = 'Автоматическое копирование недоступно. Текст выделен: нажмите Ctrl+C / ⌘C или выберите «Копировать» в меню устройства.';
  const textActions = ['show-message', 'copy-message', 'share-message', 'speak-message', 'download-message', 'save-message'];
  const setSelection = (start, end) => { editor.setSelectionRange?.(start, end); model.select(start, end); };
  const refresh = () => {
    const state = model.read(); $('draft-count').textContent = `${state.length} / ${state.limit}`;
    for (const id of textActions) $(id).disabled = !nonblank(state.text) || state.length > state.limit;
    if ($('draft-demo')) $('draft-demo').hidden = !state.demo;
    $('clear-message').disabled = !state.text; $('undo-message').disabled = !state.canUndo;
  };
  const write = () => {
    const state = model.read(); editor.value = state.text; setSelection(state.start, state.end); refresh(); persist();
  };
  const readEditor = () => {
    const previous = model.read();
    const outcome = model.edit(editor.value, editor.selectionStart, editor.selectionEnd);
    if (!outcome.ok) { editor.value = previous.text; setSelection(previous.start, previous.end); status(limitMessage); }
    refresh(); persist(); return outcome;
  };
  const preserveSelection = () => {
    if (editor.value !== model.read().text) readEditor();
    else model.select(editor.selectionStart, editor.selectionEnd);
  };
  const selectEditor = () => { editor.focus({ preventScroll: true }); editor.select?.(); setSelection(0, editor.value.length); };
  const closeDialog = id => { const dialog = $(id); if (dialog?.open) dialog.close(); };
  const returnFocus = element => { if (element?.isConnected !== false) element?.focus?.({ preventScroll: true }); };
  const openFallback = (text, { filename = 'soobshchenie.txt', message = 'Выберите, как сохранить или передать текст.' } = {}) => {
    const dialog = $('share-fallback');
    if (!dialog.open) shareReturn = doc.activeElement;
    $('share-text').value = text; $('share-text').readOnly = true; fallbackFilename = filename;
    status(message, 'share-status');
    if (!dialog.open) dialog.showModal();
    $('share-text').focus({ preventScroll: true });
  };
  const selectShareText = () => { const field = $('share-text'); field.focus({ preventScroll: true }); field.select?.(); field.setSelectionRange?.(0, field.value.length); };
  const saveFile = (text, filename, target = 'draft-status') => {
    const outcome = downloadPlainText(text, { document: doc, URL: win.URL, Blob: win.Blob, filename });
    status(outcome.status === 'download-started' ? 'Файл .txt подготовлен к скачиванию.' : 'Не удалось подготовить файл. Можно скопировать текст вручную.', target);
    return outcome;
  };
  const copy = async (text, { target = 'draft-status', fallback = selectEditor } = {}) => {
    const token = ++transferId;
    status('Копируем текст…', target);
    const outcome = await copyPlainText(text, { clipboard: nav.clipboard, selectFallback: () => { if (token === transferId) fallback(); } });
    if (token !== transferId) return outcome;
    status(outcome.status === 'copied' ? 'Текст скопирован.' : outcome.status === 'empty' ? 'Сначала добавьте текст.' : manualCopyMessage, target);
    return outcome;
  };
  const share = async (text, { filename = 'soobshchenie.txt', target = 'draft-status' } = {}) => {
    const token = ++transferId;
    // Do not await UI, storage, or preparation before this call.
    const pending = sharePlainText(text, { navigator: nav });
    status('Открываем системное меню…', target);
    const outcome = await pending;
    if (token !== transferId) return outcome;
    if (outcome.status === 'completed') status('Действие «Поделиться» завершено. Текст сохранён в этой вкладке.', target);
    else if (outcome.status === 'cancelled') status('Действие отменено. Текст сохранён в этой вкладке.', target);
    else if (outcome.status === 'empty') status('Сначала добавьте текст.', target);
    else {
      const message = outcome.status === 'unsupported' ? 'В этом браузере нет подходящего системного меню. Можно скопировать текст или скачать файл.' : 'Не удалось открыть системное меню. Можно скопировать текст или скачать файл.';
      status(message, target); openFallback(text, { filename, message });
    }
    return outcome;
  };
  const insert = (text, options) => {
    ++transferId;
    readEditor();
    const outcome = model.insert(text, options);
    if (outcome.ok) { write(); status('Текст добавлен в сообщение. Его можно отредактировать.'); }
    else status(outcome.reason === 'limit' ? limitMessage : outcome.reason === 'duplicate' ? 'Это слово уже добавлено из данной попытки.' : 'Укажите слово или сообщение.');
    return outcome;
  };
  const historyText = () => dialoguePlainText(getDialogue());
  const updateHistory = () => {
    ++transferId;
    const available = nonblank(historyText());
    for (const id of ['copy-dialogue', 'share-dialogue', 'download-dialogue']) $(id).disabled = !available;
  };

  on(editor, 'input', () => {
    const hadUndo = model.read().canUndo, changed = editor.value !== model.read().text;
    if (changed) ++transferId;
    const outcome = readEditor();
    if (outcome.ok && changed) status(hadUndo ? 'Текст изменён вручную. Отмена прежней вставки отключена, чтобы сохранить ваши правки.' : 'Черновик сохранён в этой вкладке.');
  });
  for (const type of ['select', 'keyup', 'mouseup', 'click', 'blur']) on(editor, type, preserveSelection);
  on(editor, 'beforeinput', event => {
    if (!event.inputType?.startsWith('insert') || event.isComposing || typeof event.data !== 'string') return;
    preserveSelection(); const state = model.read();
    if (state.length - (state.end - state.start) + event.data.length > state.limit) { event.preventDefault(); status(limitMessage); }
  });
  on(editor, 'paste', event => {
    // Only the payload supplied by this explicit paste action. Never call
    // navigator.clipboard.read/readText or inspect the clipboard in advance.
    const pasted = event.clipboardData?.getData('text/plain');
    if (typeof pasted !== 'string') return;
    preserveSelection(); const state = model.read();
    if (state.length - (state.end - state.start) + pasted.length > state.limit) { event.preventDefault(); status(limitMessage); }
  });
  for (const button of doc.querySelectorAll('[data-compose-phrase]')) on(button, 'click', () => insert(button.dataset.composePhrase));
  on($('remember-draft'), 'change', () => { persist(); status($('remember-draft').checked ? 'Сохраняется только ваш черновик. На общем устройстве отключите сохранение.' : 'Сохранение черновика отключено. При доступном хранилище копия удалена.'); });
  for (const [id, attribute] of [['large-text','largeText'],['high-contrast','highContrast']]) on($(id),'click',()=>{const active=$(id).getAttribute('aria-pressed')!=='true';$(id).setAttribute('aria-pressed',String(active));doc.body.dataset[attribute]=String(active);});
  on($('jump-to-reply'),'click',()=>{$('employee-text').focus();$('employee-text').scrollIntoView({block:'center'});});
  on($('clear-message'), 'click', () => {
    ++transferId;
    readEditor(); const outcome = model.clear();
    if (outcome.ok) { win.speechSynthesis?.cancel(); write(); status('Черновик очищен. Можно отменить очистку.'); }
  });
  on($('undo-message'), 'click', () => {
    ++transferId;
    readEditor(); const outcome = model.undo();
    if (outcome.ok) { write(); status('Последнее действие отменено.'); }
    else status('После ручного изменения прежнее действие не отменяется: ваш текст сохранён.');
  });
  on($('copy-message'), 'click', () => { readEditor(); return copy(model.read().text); });
  on($('share-message'), 'click', () => { readEditor(); return share(model.read().text); });
  on($('download-message'), 'click', () => { readEditor(); return saveFile(model.read().text, 'soobshchenie.txt'); });
  on($('speak-message'), 'click', () => { readEditor(); if (nonblank(model.read().text)) speak(model.read().text); });
  on($('save-message'), 'click', () => {
    readEditor(); const text = model.read().text;
    if (!nonblank(text)) return;
    try {
      const snapshot = JSON.stringify([text,model.read().demo]);
      if (snapshot === lastSavedSnapshot) { status('Эта версия сообщения уже добавлена в диалог.'); return; }
      if (onSaveMessage(text, {demo:model.read().demo}) === false) { status('Не удалось добавить сообщение в диалог. Черновик сохранён.'); return; }
      lastSavedSnapshot = snapshot; updateHistory(); status('Сообщение добавлено в диалог от «Вы». Черновик сохранён.');
    } catch { status('Не удалось добавить сообщение в диалог. Черновик сохранён.'); }
  });
  const setFont = () => { const size = Number($('display-font').value); $('display-text').style.fontSize = `${[32, 48, 64].includes(size) ? size : 48}px`; };
  on($('show-message'), 'click', () => {
    ++transferId;
    readEditor(); const text = model.read().text;
    if (!nonblank(text)) return;
    stopActivities(); displayReturn = doc.activeElement || $('show-message');
    $('display-text').textContent = text; setFont(); onPresent(text, {demo:model.read().demo});
    if (!$('message-display').open) $('message-display').showModal();
    $('display-text').focus({ preventScroll: true });
  });
  on($('display-font'), 'change', setFont);
  on($('display-close'), 'click', () => closeDialog('message-display'));
  on($('message-display'), 'cancel', event => { event.preventDefault(); closeDialog('message-display'); });
  on($('message-display'), 'close', () => { const focus = displayReturn; displayReturn = null; returnFocus(focus); });
  on($('share-close'), 'click', () => closeDialog('share-fallback'));
  on($('share-fallback'), 'cancel', event => { event.preventDefault(); closeDialog('share-fallback'); });
  on($('share-fallback'), 'close', () => { ++transferId; const focus = shareReturn; shareReturn = null; returnFocus(focus); });
  on($('share-copy'), 'click', () => copy($('share-text').value, { target: 'share-status', fallback: selectShareText }));
  on($('share-download'), 'click', () => saveFile($('share-text').value, fallbackFilename, 'share-status'));
  on($('copy-dialogue'), 'click', () => {
    const text=historyText();
    return copy(text, { target: 'dialogue-status', fallback: () => { openFallback(text, { filename: 'dialog.txt', message: manualCopyMessage }); selectShareText(); } });
  });
  on($('share-dialogue'), 'click', () => share(historyText(), { filename: 'dialog.txt', target: 'dialogue-status' }));
  on($('download-dialogue'), 'click', () => saveFile(historyText(), 'dialog.txt', 'dialogue-status'));

  refresh(); updateHistory(); setFont(); if(saved.error) status(saved.error,'draft-storage-status'); if(model.read().length > MAX_MESSAGE_LENGTH) status('Сохранённый текст полностью восстановлен. Сократите его до 2000 символов перед передачей.');
  return {
    read: () => model.read(),
    insertText: text => insert(text),
    insertRecognized: ({ text, attemptId, demo = false }) => insert(text, { attemptId, demo }),
    resetHistory: () => { lastSavedSnapshot = null; },
    setMode(mode) {
      ++transferId;
      preserveSelection();
      const destination = $(mode === 'camera' || mode === 'video' ? 'capture-composer-slot' : 'communication-home');
      if ($('message-composer').parentNode !== destination) destination.append($('message-composer'));
      closeDialog('message-display'); closeDialog('share-fallback');
    },
    updateHistory,
    dispose() { ++transferId; for (const [el, type, handler] of listeners) el?.removeEventListener(type, handler); },
  };
}
