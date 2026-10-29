import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftModel, MAX_MESSAGE_LENGTH, copyPlainText, sharePlainText, dialoguePlainText, downloadPlainText } from '../app/communication.js';

test('phrases replace the saved selection and preserve line breaks and sensible spacing', () => {
  const draft = createDraftModel('Мне нужна помощь.\nОтветьте здесь.');
  draft.select(4, 9);
  assert.equal(draft.insert('очень нужна').text, 'Мне очень нужна помощь.\nОтветьте здесь.');
  draft.select(0);
  assert.equal(draft.insert('Здравствуйте!').text, 'Здравствуйте! Мне очень нужна помощь.\nОтветьте здесь.');
  const quoted = createDraftModel('«»'); quoted.select(1);
  assert.equal(quoted.insert('Спасибо!').text, '«Спасибо!»');
  const punctuation = createDraftModel('Да, пожалуйста.'); punctuation.select(2);
  assert.equal(punctuation.insert('конечно').text, 'Да конечно, пожалуйста.');
});

test('over-limit insertion changes nothing and does not consume an attempt ID', () => {
  const draft = createDraftModel('я'.repeat(MAX_MESSAGE_LENGTH - 2)), before = draft.read();
  const denied = draft.insert('Да', { attemptId: 4 });
  assert.equal(denied.ok, false); assert.equal(denied.reason, 'limit');
  assert.deepEqual(draft.read(), before); assert.equal(draft.hasAttempt(4), false);
  draft.select(MAX_MESSAGE_LENGTH - 5, MAX_MESSAGE_LENGTH - 2);
  assert.equal(draft.insert('Да', { attemptId: 4 }).ok, true);
  assert.equal(draft.read().length, MAX_MESSAGE_LENGTH - 2);
  assert.equal(draft.hasAttempt(4), true);
});

test('one recognized attempt cannot be inserted twice through an alternate path or after undo', () => {
  const draft = createDraftModel();
  assert.equal(draft.insert('Вопрос', { attemptId: 7 }).ok, true);
  assert.equal(draft.insert('Вопрос', { attemptId: 7 }).reason, 'duplicate');
  assert.equal(draft.read().text, 'Вопрос');
  assert.equal(draft.undo().text, '');
  assert.equal(draft.insert('Вопрос', { attemptId: 7 }).reason, 'duplicate');
  assert.equal(draft.insert('Вопрос', { attemptId: 8 }).text, 'Вопрос');
  assert.equal(createDraftModel().insert('Вопрос', { attemptId: 7 }).ok, true, 'A different editor/tab has independent state');
});

test('undo restores the last insertion or clear, but never overwrites subsequent manual input', () => {
  const draft = createDraftModel('До\nпосле'); draft.select(2);
  draft.insert('вставка'); assert.equal(draft.undo().text, 'До\nпосле');
  draft.clear(); assert.equal(draft.undo().text, 'До\nпосле');
  draft.insert('ещё'); draft.edit('Ручной новый текст', 17);
  assert.equal(draft.read().canUndo, false); assert.equal(draft.undo().reason, 'edited-after');
  assert.equal(draft.read().text, 'Ручной новый текст');
  draft.clear(); draft.edit('Не стирать', 10);
  assert.equal(draft.undo().ok, false); assert.equal(draft.read().text, 'Не стирать');
});

test('draft limit uses the same UTF-16 length as textarea maxlength and never truncates edits', () => {
  const text = '🙂'.repeat(1000), draft = createDraftModel(text);
  assert.equal(draft.read().length, 2000);
  assert.equal(draft.edit(text + '!', 2001).reason, 'limit');
  assert.equal(draft.read().text, text);
  assert.throws(() => createDraftModel(text + '!'), RangeError);
});

test('copy reports success only after writeText resolves and writes the complete snapshot', async () => {
  let resolve, copied, finished = false;
  const pending = copyPlainText('Полный\nтекст', { clipboard: { writeText(text) { copied = text; return new Promise(r => { resolve = r; }); } } });
  pending.then(() => { finished = true; });
  assert.equal(copied, 'Полный\nтекст'); await Promise.resolve(); assert.equal(finished, false);
  resolve(); assert.deepEqual(await pending, { status: 'copied' });
});

test('clipboard absence or denial selects a manual fallback and never reports copied', async () => {
  let selected = 0;
  assert.equal((await copyPlainText('Текст', { selectFallback() { selected++; } })).status, 'unsupported');
  assert.equal((await copyPlainText('Текст', { clipboard: { writeText() { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } }, selectFallback() { selected++; } })).status, 'failed');
  assert.equal(selected, 2);
  assert.equal((await copyPlainText(' \n ', { clipboard: { writeText() { assert.fail('Empty text must not access the clipboard'); } } })).status, 'empty');
});

test('share invokes the native API synchronously from the action with only text', async () => {
  let called = false, payload, resolve;
  const pending = sharePlainText('Личный\nтекст', { navigator: {
    canShare(value) { assert.deepEqual(value, { text: 'Личный\nтекст' }); return true; },
    share(value) { called = true; payload = value; return new Promise(r => { resolve = r; }); },
  } });
  assert.equal(called, true); assert.deepEqual(payload, { text: 'Личный\nтекст' });
  resolve(); assert.deepEqual(await pending, { status: 'completed' });
});

test('unsupported native share and canShare rejection do not send or copy anything', async () => {
  assert.equal((await sharePlainText('Текст', { navigator: {} })).status, 'unsupported');
  assert.equal((await sharePlainText('Текст', { navigator: { canShare: () => false, share() { assert.fail('Unsupported data must not be shared'); } } })).status, 'unsupported');
  assert.equal((await sharePlainText('Текст', { navigator: { canShare() { throw new TypeError('Unsupported'); }, share() { assert.fail('Failed preflight must not share'); } } })).status, 'failed');
});

test('share cancellation and errors remain distinct from completion or delivery', async () => {
  for (const [name, expected] of [['AbortError', 'cancelled'], ['NotAllowedError', 'failed'], ['DataError', 'failed']]) {
    const result = await sharePlainText('Не терять', { navigator: { share: () => Promise.reject(Object.assign(new Error(), { name })) } });
    assert.equal(result.status, expected); assert.equal(result.error, name);
    assert.equal(Object.hasOwn(result, 'delivered'), false);
  }
});

test('dialogue export includes full saved text and role labels, never recognition data or unsaved candidates', () => {
  const long = 'Д'.repeat(1990) + '\nКонец';
  const exported = dialoguePlainText([
    { role: 'visitor', text: long, kind: 'manual', timestamp: 'PRIVATE-TIME', coordinates: 'PRIVATE-COORDINATES', candidate: 'UNCONFIRMED' },
    { role: 'employee', text: 'Ответ\nна второй строке', distance: 'PRIVATE-METRIC' },
    { role: 'attempt', text: 'UNCONFIRMED' },
  ]);
  assert.equal(exported, `Вы:\n${long}\n\nСобеседник:\nОтвет\nна второй строке`);
  assert.doesNotMatch(exported, /PRIVATE|UNCONFIRMED/);
});

test('text download uses complete UTF-8 plain text and cleans its temporary object URL', async () => {
  let blob, deferred, clicked = 0, removed = 0, revoked;
  const anchor = { click() { clicked++; }, remove() { removed++; } };
  const value = 'Кириллица 🙂\nВторая строка';
  const result = downloadPlainText(value, {
    document: { createElement(tag) { assert.equal(tag, 'a'); return anchor; }, body: { append(node) { assert.equal(node, anchor); } } },
    URL: { createObjectURL(value) { blob = value; return 'blob:local'; }, revokeObjectURL(value) { revoked = value; } },
    Blob, filename: 'dialog.txt', defer(fn) { deferred = fn; },
  });
  assert.equal(result.status, 'download-started'); assert.equal(clicked, 1); assert.equal(removed, 1);
  assert.equal(anchor.download, 'dialog.txt'); assert.equal(blob.type, 'text/plain;charset=utf-8');
  assert.equal(await blob.text(), value); assert.equal(revoked, undefined); deferred(); assert.equal(revoked, 'blob:local');
});


test('demo provenance survives edits and export, but clear/undo restores the right provenance', () => {
  const draft=createDraftModel();draft.insert('Да',{attemptId:1,demo:true});
  draft.edit('Да, пожалуйста.',14);assert.equal(draft.read().demo,true);
  draft.clear();assert.equal(draft.read().demo,false);draft.undo();assert.equal(draft.read().demo,true);
  assert.match(dialoguePlainText([{role:'visitor',text:'Да',kind:'demo'}]),/демопример/);
});
test('an older saved draft over the UTF-16 limit can be shortened without losing its original text', () => {
  const text='🙂'.repeat(1100),draft=createDraftModel(text,{allowInitialOverflow:true});
  assert.equal(draft.read().text,text);assert.equal(draft.edit(text.slice(0,-2),2198).ok,true);
  assert.equal(draft.insert('Ещё').ok,false);assert.equal(draft.edit('Сокращено',9).ok,true);
});
