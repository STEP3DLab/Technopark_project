import './platform.js?v=0.12.0';
import { matchText } from './catalog.js';
import { MessageDraft, MESSAGE_LIMIT, textLength, isSendable, readSavedDraft, writeSavedDraft, addMessage, transcript } from './communication-model.js?v=0.13.0';

/** A communication workspace over the existing, separately labelled research engine. */
const api = window.hearingEquality;
const $ = id => document.getElementById(id);
const phrases = [
  ['Общение', 'Здравствуйте!'], ['Общение', 'Мне удобнее общаться текстом.'],
  ['Общение', 'Я пользуюсь русским жестовым языком.'], ['Общение', 'Напишите, пожалуйста, ваш ответ.'],
  ['Общение', 'Повторите, пожалуйста.'], ['Общение', 'Спасибо!'],
  ['Вопросы', 'Где находится нужный кабинет?'], ['Вопросы', 'К кому можно обратиться?'],
  ['Вопросы', 'Во сколько начинается встреча?'], ['Вопросы', 'Сколько это стоит?'],
  ['Вопросы', 'Можно уточнить адрес?'], ['Вопросы', 'Какие документы нужны?'],
  ['Помощь', 'Мне нужна помощь.'], ['Помощь', 'Пожалуйста, позовите сотрудника.'],
  ['Помощь', 'Объясните, пожалуйста, по шагам.'], ['Помощь', 'Можно пригласить переводчика РЖЯ?'],
  ['Помощь', 'Я не понял сообщение.'], ['Помощь', 'Дайте мне немного времени, чтобы ответить.'],
  ['Встреча', 'Я пришёл на встречу.'], ['Встреча', 'Я записан на приём.'],
  ['Встреча', 'Сообщите мне, когда подойдёт моя очередь.'], ['Встреча', 'Можно перенести встречу?'],
  ['Встреча', 'Пришлите, пожалуйста, информацию сообщением.'], ['Встреча', 'Я уточню и отвечу позже.'],
];

if (api && $('view-dialogue') && !$('communication')) install();

function install() {
  const section = document.createElement('div'); section.id = 'communication';
  // All HTML here is static. User text is assigned exclusively through value/textContent.
  section.innerHTML = `
    <div class="comm-hero"><div><span class="comm-tag">РГСУ / ТЕХНОПАРК · ОБЩЕНИЕ</span>
      <h2>Ваше сообщение.<br><span>Удобным вам способом.</span></h2>
      <p>Наберите текст, выберите готовую фразу или добавьте подтверждённое слово жестом. Покажите собеседнику или поделитесь.</p></div>
      <div class="comm-settings" role="group" aria-label="Удобство чтения"><button id="comm-large" aria-pressed="false" type="button">Крупнее текст</button><button id="comm-contrast" aria-pressed="false" type="button">Контраст</button></div></div>
    <div id="comm-status" class="comm-status" role="status" aria-live="polite" aria-atomic="true"></div>
    <div class="comm-grid"><section class="comm-editor" aria-labelledby="comm-title">
      <div class="comm-card-head"><h3 id="comm-title">Моё сообщение</h3><span id="comm-count" class="comm-counter"></span></div>
      <div class="comm-sources" role="group" aria-label="Способ ввода"><button type="button" id="comm-keyboard">Написать</button><button type="button" id="comm-camera">Добавить слово жестом</button><button type="button" id="comm-video">Из видео</button></div>
      <label class="sr-only" for="comm-draft">Текст моего сообщения</label><textarea id="comm-draft" rows="5" placeholder="Что вы хотите сказать?" aria-describedby="comm-input-hint comm-count" spellcheck="true"></textarea>
      <p class="comm-help" id="comm-input-hint">Текст можно исправить в любой момент. Ничего не отправляется автоматически.</p>
      <p id="comm-demo-note" hidden>В черновике есть слово из демопримера. Это не распознавание новой записи.</p>
      <div class="comm-actions"><button class="comm-primary" id="comm-show" type="button">Показать крупно</button><button class="comm-secondary" id="comm-copy" type="button">Скопировать</button><button class="comm-secondary" id="comm-share" type="button">Поделиться</button></div>
      <div class="comm-actions"><button class="comm-secondary" id="comm-to-dialogue" type="button">Добавить в диалог</button><button class="comm-text" id="comm-speak" type="button">Озвучить</button><button class="comm-text" id="comm-stop-speech" type="button" hidden>Остановить голос</button><button class="comm-text" id="comm-undo" type="button">Отменить правку</button><button class="comm-text" id="comm-clear" type="button">Очистить текст</button></div>
      <label class="comm-save"><input type="checkbox" id="comm-save"><span>Сохранять черновик на этом устройстве.<br>Не включайте на общем компьютере. История и видео не сохраняются.</span></label><p class="comm-help" id="comm-storage-note"></p>
      <div class="comm-subhead"><h3>Быстрые фразы</h3><span class="comm-counter">24 фразы · только текст</span></div>
      <label class="sr-only" for="comm-search">Найти быструю фразу</label><input id="comm-search" class="comm-search" type="search" placeholder="Найти фразу…" autocomplete="off">
      <div id="comm-filters" class="comm-filters" role="group" aria-label="Темы быстрых фраз"></div><div id="comm-phrases" class="comm-phrases"></div><p class="comm-help" id="comm-phrase-count"></p>
    </section><aside class="comm-aside" aria-labelledby="comm-how"><h3 id="comm-how">Из жеста — в сообщение</h3>
      <ol class="comm-flow"><li>Откройте камеру и покажите один жест из доступного набора.</li><li>Проверьте предложенное слово. Исправьте или отклоните его.</li><li>Нажмите «Добавить в сообщение». Дополните текст и выберите, как его передать.</li></ol>
      <div class="comm-limit"><b>РЖЯ → текст: эксперимент</b>Сейчас сопоставляются движения шести отдельных слов. Свободная речь на РЖЯ и перевод предложений не поддерживаются. Сомнительный результат можно не принимать.</div>
      <a class="comm-lab-link" href="#text" id="comm-vocabulary">Посмотреть доступные жесты →</a>
      <div><h3>Ответ собеседника</h3><p class="comm-help">Передайте устройство или предложите собеседнику написать ответ.</p>
        <label class="sr-only" for="comm-partner">Текст ответа собеседника</label><textarea id="comm-partner" rows="3" placeholder="Ответьте здесь…" aria-describedby="comm-voice-note" spellcheck="true"></textarea>
        <div class="comm-actions"><button class="comm-primary" id="comm-reply" type="button">Добавить ответ</button><button class="comm-secondary" id="comm-dictate" type="button" aria-pressed="false">Ввести ответ голосом</button></div>
        <p class="comm-help" id="comm-voice-note">Голосовой ввод запускается только по нажатию. Звук может обрабатываться службой браузера; результат нужно проверить.</p>
      </div></aside></div>
    <section class="comm-history" aria-labelledby="comm-history-title"><div class="comm-card-head"><h3 id="comm-history-title">Наш диалог</h3><div class="comm-actions"><button class="comm-text" id="comm-copy-dialogue" type="button">Копировать диалог</button><button class="comm-text" id="comm-export" type="button">Скачать текст</button></div></div>
      <div id="comm-log" class="comm-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Подтверждённые реплики"></div>
      <p class="comm-help">История находится только в памяти этой страницы и исчезает при перезагрузке. Перед закрытием её можно скопировать. Текст не включается в ссылку.</p>
      <button id="comm-new" class="comm-text" type="button">Начать новый разговор</button>
    </section>`;
  $('view-dialogue').append(section); document.body.classList.add('communication-enabled');
  const modal = document.createElement('dialog'); modal.id = 'comm-modal'; modal.setAttribute('aria-labelledby', 'comm-modal-title');
  modal.innerHTML = `<h2 id="comm-modal-title"></h2><div id="comm-modal-text"></div><label for="comm-modal-copy" class="sr-only">Текст для ручного копирования</label><textarea id="comm-modal-copy" readonly hidden></textarea><p id="comm-modal-note"></p><div class="comm-modal-actions"><button type="button" id="comm-modal-confirm" hidden></button><button type="button" id="comm-modal-close">Закрыть</button></div>`;
  document.body.append(modal);
  const hint = document.createElement('div'); hint.className = 'comm-capture-guide';
  hint.innerHTML = `<b>РЖЯ → текст · эксперимент.</b> Один жест → проверка слова → добавление в ваш черновик. Предложения не переводятся.<button type="button" id="comm-back">Вернуться к сообщению</button>`;
  $('view-capture').prepend(hint);
  $('add-word').textContent = 'Добавить в сообщение →';
  // Keep one message editor. The earlier capture textarea remains in the DOM
  // for legacy controller compatibility, but is no longer a second workflow.
  const oldConversation = $('conversation');
  document.querySelector('label[for="conversation"]').hidden = true;
  oldConversation.hidden = true;
  oldConversation.nextElementSibling.hidden = true;
  oldConversation.nextElementSibling.nextElementSibling.hidden = true;
  const preview = document.createElement('div'); preview.className = 'comm-draft-preview';
  preview.innerHTML = '<b>Ваш черновик</b><p id="comm-capture-draft"></p><button type="button" id="comm-capture-return" class="button ghost wide">Открыть сообщение</button>';
  $('add-word').after(preview);
  const phraseDetails = document.createElement('details'); phraseDetails.className = 'comm-phrase-details';
  phraseDetails.open = !matchMedia('(max-width: 700px)').matches;
  const phraseSummary = document.createElement('summary'); phraseSummary.textContent = 'Быстрые фразы · 24'; phraseDetails.append(phraseSummary);
  const phraseHeading = section.querySelector('.comm-subhead'); phraseHeading.replaceWith(phraseDetails);
  for (const id of ['comm-search', 'comm-filters', 'comm-phrases', 'comm-phrase-count']) {
    const element = $(id); if (id === 'comm-search') phraseDetails.append(section.querySelector('label[for="comm-search"]'));
    phraseDetails.append(element);
  }
  const partnerJump = document.createElement('button'); partnerJump.type = 'button'; partnerJump.id = 'comm-answer-jump'; partnerJump.className = 'comm-text'; partnerJump.textContent = 'К ответу собеседника ↓';
  $('comm-to-dialogue').parentElement.after(partnerJump);
  const navLabels = { dialogue: ['Общение', 'Сообщение и ответ'], text: ['Словарь жестов', 'Аватар и исходная запись'], camera: ['РЖЯ → текст', 'Камера · эксперимент'] };
  for (const [mode, [label, detail]] of Object.entries(navLabels)) {
    const button = document.querySelector(`.nav [data-mode="${mode}"]`); if (!button) continue;
    button.setAttribute('aria-label', label); button.dataset.short = mode === 'dialogue' ? 'Общение' : mode === 'text' ? 'Жесты' : 'Камера';
    const span = button.querySelector('span'); span.replaceChildren(document.createTextNode(label)); const small = document.createElement('small'); small.textContent = detail; span.append(small);
  }
  const brand = document.querySelector('.brand'); brand.href = '#dialogue'; brand.addEventListener('click', event => { event.preventDefault(); api.mode('dialogue'); });
  const version = document.querySelector('.rail-bottom > span'); if (version) version.textContent = 'Общение 0.13 · аватар 0.12';
  const draftKey = `hearing-communication:draft:v1:${location.pathname}`;
  let storage; try { storage = window.localStorage; } catch { storage = null; }
  const restored = readSavedDraft(storage, draftKey), draft = new MessageDraft(restored.text, restored.sources);
  let messages = [], category = 'Общение', cursor = { start: draft.text.length, end: draft.text.length }, addedRevision = -1;
  let generation = 0, transferBusy = false, recording = null, voiceTimer = 0, spoken = null, modalAction = null, returnFocus = null;
  let saved = false;
  const input = $('comm-draft'), partner = $('comm-partner');
  input.value = draft.text; $('comm-save').checked = restored.enabled;
  function status(text, error = false) { $('comm-status').textContent = text; $('comm-status').dataset.error = String(error); }
  function persist() {
    const enabled = $('comm-save').checked;
    saved = writeSavedDraft(storage, draftKey, draft, enabled);
    $('comm-storage-note').textContent = !saved ? 'Не удалось обновить хранилище. Черновик остаётся на экране; скопируйте его. Сохранённая версия могла остаться прежней. На общем устройстве очистите данные сайта.' : enabled && draft.text ? 'Черновик сохранён в этом браузере. Другой пользователь устройства сможет его открыть.' : 'Черновик только на экране. После закрытия или обновления страницы он может быть потерян.';
    return saved;
  }
  function render() {
    const length = textLength(draft.text), valid = isSendable(draft.text);
    $('comm-count').textContent = `${length} / ${MESSAGE_LIMIT}`;
    $('comm-capture-draft').textContent = draft.text || 'Пока пуст. Слово появится здесь только после вашей проверки и добавления.';
    input.setAttribute('aria-invalid', String(length > MESSAGE_LIMIT));
    $('comm-input-hint').textContent = length > MESSAGE_LIMIT ? `Превышен лимит на ${length - MESSAGE_LIMIT} знаков. Сократите сообщение: текст сохранён на экране без обрезки.` : 'Текст можно исправить в любой момент. Ничего не отправляется автоматически.';
    for (const id of ['comm-show', 'comm-speak', 'comm-copy', 'comm-share']) $(id).disabled = !valid || (transferBusy && ['comm-copy', 'comm-share'].includes(id));
    $('comm-to-dialogue').disabled = !valid || addedRevision === draft.revision;
    $('comm-to-dialogue').textContent = addedRevision === draft.revision ? 'Добавлено в диалог' : 'Добавить в диалог';
    $('comm-undo').disabled = !draft.undoStack.length; $('comm-clear').disabled = !draft.text;
    $('comm-demo-note').hidden = !draft.snapshot().demo;
    $('comm-reply').disabled = !isSendable(partner.value);
    partner.setAttribute('aria-invalid', String(textLength(partner.value) > MESSAGE_LIMIT));
    $('comm-copy-dialogue').disabled = !messages.length || transferBusy; $('comm-export').disabled = !messages.length;
  }
  function focusDraft(position = input.value.length) { input.focus({ preventScroll: true }); input.setSelectionRange(position, position); cursor = { start: position, end: position }; input.scrollIntoView({ block: 'center', behavior: 'instant' }); }
  function updateDraft(value, source = 'typed', position) {
    draft.set(value, source); input.value = draft.text; persist(); render(); if (position !== undefined) focusDraft(position);
  }
  function insert(addition, source, end = false) {
    try {
      const result = draft.insert(addition, source, end ? draft.text.length : cursor.start, end ? draft.text.length : cursor.end);
      input.value = draft.text; persist(); render(); focusDraft(result.cursor); return true;
    } catch (error) { status(error.message, true); return false; }
  }
  input.addEventListener('input', () => { draft.set(input.value); cursor = { start: input.selectionStart, end: input.selectionEnd }; persist(); render(); });
  for (const event of ['select', 'click', 'keyup']) input.addEventListener(event, () => { cursor = { start: input.selectionStart, end: input.selectionEnd }; });
  $('comm-save').onchange = () => { persist(); render(); };
  $('comm-keyboard').onclick = () => focusDraft(cursor.end);
  $('comm-camera').onclick = () => { api.mode('camera'); $('start-camera').focus(); };
  $('comm-video').onclick = () => { api.mode('video'); $('video-file').focus(); };
  $('comm-back').onclick = () => { api.mode('dialogue'); focusDraft(cursor.end); };
  $('comm-capture-return').onclick = $('comm-back').onclick;
  $('comm-answer-jump').onclick = () => { partner.focus({ preventScroll: true }); partner.scrollIntoView({ block: 'center', behavior: 'instant' }); };
  $('comm-vocabulary').onclick = event => { event.preventDefault(); api.mode('text'); };
  $('add-word').onclick = () => {
    // Only the legacy engine's accepted-and-reviewed state enables this action.
    if ($('add-word').disabled || $('result-label').textContent !== 'ПОДТВЕРЖДЕНО ПОЛЬЗОВАТЕЛЕМ') return;
    const value = $('result-word').textContent.trim();
    const demo = /Демопример|известная запись/.test($('visitor-origin').textContent);
    // Insertion is transactional: a full editor keeps the result for another try.
    try {
      draft.insert(value, demo ? 'demo' : 'gesture', draft.text.length, draft.text.length);
      $('add-word').disabled = true; input.value = draft.text; persist(); render(); api.mode('dialogue'); focusDraft();
      status(demo ? 'Слово из демопримера добавлено. Это проверка сценария, не точности распознавания.' : 'Подтверждённое слово добавлено. Проверьте всё сообщение перед передачей.');
    } catch (error) { api.notify(error.message); }
  };
  $('comm-undo').onclick = () => { if (draft.undo()) { input.value = draft.text; persist(); render(); focusDraft(); status('Последняя правка отменена.'); } };
  $('comm-clear').onclick = () => { stopSpeech(); updateDraft(''); focusDraft(); status('Текст очищен. «Отменить правку» вернёт его.'); };
  for (const [id, attr] of [['comm-large', 'commLarge'], ['comm-contrast', 'commContrast']]) $(id).onclick = () => {
    const enabled = $(id).getAttribute('aria-pressed') !== 'true'; $(id).setAttribute('aria-pressed', String(enabled)); document.body.dataset[attr] = String(enabled);
  };
  function showModal(title, text, note = '', { copy = false, action = null, confirm = '', danger = false, focusBack = null } = {}) {
    stopVoice(); api.stop(); returnFocus = focusBack || document.activeElement; modalAction = action;
    $('comm-modal-title').textContent = title; $('comm-modal-text').textContent = copy ? '' : text; $('comm-modal-text').hidden = copy;
    $('comm-modal-copy').hidden = !copy; $('comm-modal-copy').value = copy ? text : ''; $('comm-modal-note').textContent = note;
    $('comm-modal-confirm').hidden = !action; $('comm-modal-confirm').textContent = confirm; $('comm-modal-confirm').classList.toggle('comm-danger', danger);
    if (!modal.open) modal.showModal();
    if (copy) { $('comm-modal-copy').focus(); $('comm-modal-copy').select(); } else $('comm-modal-close').focus();
  }
  $('comm-modal-close').onclick = () => modal.close();
  $('comm-modal-confirm').onclick = () => { const action = modalAction; modalAction = null; modal.close(); action?.(); };
  modal.addEventListener('close', () => { modalAction = null; $('comm-modal-text').textContent = ''; $('comm-modal-copy').value = ''; returnFocus?.isConnected && returnFocus.focus({ preventScroll: true }); });
  $('comm-show').onclick = () => { if (isSendable(draft.text)) showModal('Сообщение собеседнику', draft.text.trim(), draft.snapshot().demo ? 'Содержит слово из демонстрационной записи.' : 'Текст вашего сообщения. Закройте это окно, чтобы ответить.'); };
  async function copyText(text, message = 'Текст скопирован. Вставьте его в нужный чат или документ.') {
    const current = generation, initiator = document.activeElement; transferBusy = true; render();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      if (current === generation) status(message);
    } catch {
      if (current === generation) showModal('Скопируйте текст вручную', text, 'Браузер не разрешил автоматическое копирование. Выделите текст и используйте «Копировать» или Ctrl/Cmd + C.', { copy: true, focusBack: initiator });
    } finally { if (current === generation) { transferBusy = false; render(); if (!modal.open && document.activeElement === document.body) initiator?.focus({ preventScroll: true }); } }
  }
  $('comm-copy').onclick = () => { if (isSendable(draft.text)) copyText(draft.snapshot().text); };
  $('comm-share').onclick = async () => {
    if (!isSendable(draft.text) || transferBusy) return;
    const snapshot = draft.snapshot(), current = generation, initiator = document.activeElement;
    if (!navigator.share) { showModal('Передайте сообщение', snapshot.text, 'Системная отправка недоступна. Скопируйте текст и вставьте его в мессенджер; приложение само ничего не отправит.', { copy: true }); return; }
    transferBusy = true; render();
    try { await navigator.share({ title: 'Сообщение', text: snapshot.text }); if (current === generation) status('Текст передан системному меню. Доставку проверяйте в выбранном приложении.'); }
    catch (error) { if (current !== generation) return; if (error.name === 'AbortError') status('Отправка отменена. Сообщение осталось в черновике.'); else showModal('Не удалось открыть отправку', snapshot.text, 'Скопируйте текст и передайте его через нужное приложение. Черновик сохранён на экране.', { copy: true, focusBack: initiator }); }
    finally { if (current === generation) { transferBusy = false; render(); if (!modal.open && document.activeElement === document.body) initiator?.focus({ preventScroll: true }); } }
  };
  function renderHistory() {
    const log = $('comm-log'); log.replaceChildren();
    if (!messages.length) { const empty = document.createElement('p'); empty.className = 'comm-empty'; empty.textContent = 'Ваши реплики и ответы собеседника появятся здесь после добавления.'; log.append(empty); }
    for (const message of messages) {
      const row = document.createElement('article'); row.dataset.role = message.role;
      const label = document.createElement('small'); label.textContent = (message.role === 'self' ? 'Вы' : 'Собеседник') + (message.demo ? ' · демопример' : ' · текст');
      const text = document.createElement('p'); text.textContent = message.text; row.append(label, text);
      const item = matchText(message.text, api.catalog());
      if (item) { const button = document.createElement('button'); button.className = 'comm-text'; button.type = 'button'; button.textContent = 'Посмотреть слово у аватара'; button.onclick = () => { api.mode('text'); api.select(item.id, false); }; row.append(button); }
      log.append(row);
    }
    log.scrollTop = log.scrollHeight; render();
  }
  $('comm-to-dialogue').onclick = () => {
    if (addedRevision === draft.revision) return;
    try { messages = addMessage(messages, 'self', draft.text, draft.snapshot().demo); addedRevision = draft.revision; renderHistory(); status('Реплика добавлена только в этот диалог. Черновик сохранён; отправки в мессенджер не было.'); }
    catch (error) { status(error.message, true); }
  };
  $('comm-reply').onclick = () => {
    try { messages = addMessage(messages, 'partner', partner.value); stopVoice(); partner.value = ''; renderHistory(); status('Ответ добавлен в диалог.'); }
    catch (error) { status(error.message, true); }
  };
  partner.addEventListener('input', () => { stopVoice(); render(); });
  $('comm-copy-dialogue').onclick = () => { if (messages.length) copyText(transcript(messages), 'Диалог скопирован. В нём отмечены авторы реплик и демопримеры.'); };
  $('comm-export').onclick = () => {
    if (!messages.length) return;
    const blob = new Blob([transcript(messages)], { type: 'text/plain;charset=utf-8' }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'dialogue.txt'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('Текст подготовлен для скачивания. Файл содержит ваши реплики и ответы собеседника.');
  };
  function stopSpeech() { spoken = null; window.speechSynthesis?.cancel(); $('comm-stop-speech').hidden = true; }
  $('comm-stop-speech').onclick = stopSpeech;
  $('comm-speak').onclick = () => {
    if (!isSendable(draft.text)) return; stopVoice(); api.stop(); stopSpeech();
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { status('Озвучивание недоступно. Покажите сообщение крупно или скопируйте его.'); return; }
    const utterance = new SpeechSynthesisUtterance(draft.snapshot().text); utterance.lang = 'ru-RU'; utterance.rate = .9;
    const voices = speechSynthesis.getVoices(), voice = voices.find(v => /^ru/i.test(v.lang) && v.localService);
    if (voice) utterance.voice = voice;
    utterance.onend = () => { if (spoken === utterance) { spoken = null; $('comm-stop-speech').hidden = true; } };
    utterance.onerror = event => { if (spoken === utterance) { stopSpeech(); if (!['interrupted', 'canceled'].includes(event.error)) status('Не удалось озвучить. Текст остаётся доступен на экране.', true); } };
    spoken = utterance; $('comm-stop-speech').hidden = false;
    try { speechSynthesis.speak(utterance); status('Озвучивание запрошено. Громкость и слышимость проверьте на устройстве.'); } catch { stopSpeech(); status('Озвучивание недоступно. Покажите текст собеседнику.', true); }
  };
  function stopVoice() {
    const rec = recording; recording = null; clearTimeout(voiceTimer); voiceTimer = 0;
    try { rec?.abort(); } catch {}
    $('comm-dictate').textContent = 'Ввести ответ голосом'; $('comm-dictate').setAttribute('aria-pressed', 'false');
  }
  $('comm-dictate').onclick = () => {
    if (recording) { stopVoice(); status('Голосовой ввод остановлен. Текст ответа не изменён.'); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { status('Голосовой ввод недоступен в этом браузере. Ответ можно напечатать.'); return; }
    api.stop(); stopSpeech();
    const before = partner.value; let rec;
    try { rec = new Recognition(); } catch { status('Не удалось запустить голосовой ввод. Используйте клавиатуру.', true); return; }
    recording = rec; rec.lang = 'ru-RU'; rec.interimResults = false; rec.continuous = false;
    $('comm-dictate').textContent = 'Остановить запись'; $('comm-dictate').setAttribute('aria-pressed', 'true');
    status('Слушаю ответ. Звук может обрабатываться службой браузера. После записи проверьте текст.');
    rec.onresult = event => {
      if (recording !== rec || partner.value !== before || api.state().mode !== 'dialogue') return;
      const heard = Array.from(event.results || []).map(result => result[0]?.transcript || '').join(' ').trim();
      if (!heard) return;
      try { partner.value = (before.trim() ? before.trim() + ' ' : '') + heard; stopVoice(); render(); status(textLength(partner.value) > MESSAGE_LIMIT ? 'Ответ длиннее лимита. Сократите его: распознанный текст не обрезан.' : 'Ответ распознан. Проверьте его и нажмите «Добавить ответ».'); } catch { stopVoice(); }
    };
    rec.onerror = event => { if (recording !== rec) return; stopVoice(); status(event.error === 'not-allowed' ? 'Микрофон не разрешён. Ответ можно напечатать.' : 'Не удалось распознать речь. Ответ можно напечатать или повторить запись.', true); };
    rec.onend = () => { if (recording === rec) { stopVoice(); status('Запись завершена без текста. Напечатайте ответ или повторите.'); } };
    voiceTimer = setTimeout(() => { if (recording === rec) { stopVoice(); status('Голосовой ввод остановлен по времени. Напечатайте ответ или повторите.'); } }, 25000);
    try { rec.start(); } catch { stopVoice(); status('Не удалось включить голосовой ввод. Ответ можно напечатать.', true); }
  };
  function drawPhrases() {
    const query = $('comm-search').value.toLocaleLowerCase('ru').trim(), visible = phrases.filter(([group, text]) => (query || group === category) && (!query || text.toLocaleLowerCase('ru').includes(query)));
    $('comm-phrases').replaceChildren();
    for (const [, text] of visible) { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = () => { if (insert(text, 'phrase')) status('Готовая фраза добавлена как текст. Это не перевод жеста.'); }; $('comm-phrases').append(button); }
    $('comm-phrase-count').textContent = visible.length ? `Найдено: ${visible.length}. Нажатие вставит фразу в сообщение; ничего не отправит.` : 'Таких фраз нет. Измените запрос или напишите своё сообщение.';
    for (const button of $('comm-filters').children) button.setAttribute('aria-pressed', String(!query && button.textContent === category));
  }
  for (const group of ['Общение', 'Вопросы', 'Помощь', 'Встреча']) { const button = document.createElement('button'); button.type = 'button'; button.textContent = group; button.onclick = () => { category = group; $('comm-search').value = ''; drawPhrases(); }; $('comm-filters').append(button); }
  $('comm-search').addEventListener('input', drawPhrases);
  $('comm-new').onclick = () => showModal('Начать новый разговор?', '', 'Черновик, ответ, история этого экрана и отмена правок будут очищены. Сохранённый черновик будет удалён. Буфер обмена и скачанные копии останутся. Результаты испытаний очищаются отдельно во вкладке «Испытание».', {
    confirm: 'Очистить и начать', danger: true, action: () => {
      generation++; transferBusy = false; stopVoice(); stopSpeech(); api.stop(); draft.forget(); input.value = ''; partner.value = ''; messages = []; addedRevision = -1; $('comm-save').checked = false; cursor = { start: 0, end: 0 };
      const removed = persist(); renderHistory(); status(removed ? 'Новый разговор. Черновик и история этого экрана очищены.' : 'Экран очищен, но хранилище недоступно. Удалите данные сайта в настройках браузера на общем устройстве.', !removed); focusDraft();
    }
  });
  // The presentation must demonstrate the shipped workflow, not hidden legacy editors.
  const steps = document.querySelectorAll('#showcase-guide .guide-steps li');
  if (steps[2]) {
    steps[2].querySelector('b').textContent = 'Покажите практическое общение';
    steps[2].querySelector('span').textContent = '«Общение»: наберите сообщение или выберите фразу → «Показать крупно» → «Скопировать». Добавьте ответ собеседника в общий диалог.';
  }
  if (steps[3]) steps[3].querySelector('span').textContent = '«Видео → текст»: пример Slovo → разбор готовых координат → проверка слова → «Добавить в сообщение». Пометка демопримера сохранится. Камера проверяется отдельно.';
  const originalSlideAction = $('slide-action').onclick;
  function updateCommunicationSlide() {
    const number = Number($('slide-count').textContent.split('/')[0]);
    if (![1, 2].includes(number)) return;
    $('slide-title').textContent = number === 1 ? 'Помочь человеку составить и передать сообщение' : 'От жеста к сообщению — с проверкой человеком';
    $('slide-copy').textContent = number === 1 ? 'Текст, готовые фразы и подтверждённые слова из экспериментального распознавания сходятся в одном черновике. Пользователь решает, что показать, скопировать или передать.' : 'Сейчас доступны шесть отдельных слов. После проверки результат можно добавить в черновик. Свободную речь на РЖЯ этот прототип пока не переводит.';
    const cards = number === 1 ? [['Составить', 'Клавиатура, 24 текстовые фразы или слово жестом.'], ['Проверить', 'Исправить текст и показать крупно.'], ['Передать', 'Копирование, системное меню, диалог на одном устройстве.']] : [['Камера / видео', 'Экспериментальное сопоставление с образцами.'], ['Подтверждение', 'Ничего не добавляется и не отправляется автоматически.'], ['Контроль смысла', 'Демопримеры помечены; полный текст остаётся редактируемым.']];
    $('slide-cards').replaceChildren();
    for (const [title, copy] of cards) { const card = document.createElement('div'), b = document.createElement('b'), p = document.createElement('p'); b.textContent = title; p.textContent = copy; card.append(b, p); $('slide-cards').append(card); }
    $('slide-action').textContent = 'Открыть общение';
  }
  new MutationObserver(updateCommunicationSlide).observe($('slide-count'), { childList: true, characterData: true, subtree: true });
  $('slide-action').onclick = () => { const number = Number($('slide-count').textContent.split('/')[0]); if ([1, 2].includes(number)) { $('presentation').close(); api.mode('dialogue'); focusDraft(); } else originalSlideAction(); };
  let currentMode = null;
  function onMode() {
    const mode = api.state().mode;
    if (mode !== currentMode) { stopVoice(); stopSpeech(); currentMode = mode; }
    const names = { dialogue: 'Общение', camera: 'РЖЯ → текст · эксперимент', text: 'Словарь жестов' };
    if (names[mode] && $('mode-crumb').textContent !== names[mode]) $('mode-crumb').textContent = names[mode];
    if (mode === 'camera' && $('capture-title').textContent !== 'Из жеста — в текст') $('capture-title').textContent = 'Из жеста — в текст';
  }
  new MutationObserver(onMode).observe($('mode-crumb'), { childList: true, characterData: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopVoice(); stopSpeech(); } });
  window.addEventListener('pagehide', () => { generation++; stopVoice(); stopSpeech(); });
  window.addEventListener('beforeunload', event => { if ((!$('comm-save').checked || !saved) && draft.text.trim() || messages.length || partner.value.trim()) { event.preventDefault(); event.returnValue = ''; } });
  drawPhrases(); renderHistory(); onMode(); persist(); render();
  if (restored.error) status(restored.error, true); else if (restored.text) status('Восстановлен черновик, ранее сохранённый на этом устройстве. Проверьте его перед передачей.');
}
