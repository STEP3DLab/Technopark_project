/** Progressive disclosure over the existing controllers. Nodes are moved, never
 * cloned, so confirmation, draft provenance and media lifecycle stay intact. */
import './platform.js?v=0.17.0';
const $ = id => document.getElementById(id);
const paths = {
  text:'M5 5h14M12 5v14M8 19h8', camera:'M8 6l2-3h4l2 3h4v14H4V6h4Z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  book:'M12 6C9 4 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1v14',
  more:'M5 12h.01M12 12h.01M19 12h.01', close:'m6 6 12 12M6 18 18 6',
  copy:'M8 8h12v13H8V8ZM16 8V3H3v13h5', share:'M12 16V3m-5 5 5-5 5 5M4 13v8h16v-8',
  screen:'M3 4h18v13H3V4Zm4 17h10m-5-4v4', arrow:'M5 12h14m-5-5 5 5-5 5',
  reply:'M9 5 3 11l6 6M3 11h11c4 0 6 3 6 8', undo:'M8 4 3 9l5 5M3 9h11a6 6 0 1 1 0 12',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  chat:'M4 4h16v12H9l-5 4V4ZM8 8h8m-8 4h5', settings:'M4 7h16M4 17h16M8 4v6m8 4v6',
  speaker:'M3 9h4l5-5v16l-5-5H3V9Zm13-1a6 6 0 0 1 0 8',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name] || paths.arrow}"/></svg>`;
function make(tag, className, html = '') { const el=document.createElement(tag);el.className=className;el.innerHTML=html;return el; }
function button(label, action, className='simple-link', glyph='') {
  const el=make('button',className,(glyph?icon(glyph):'')+`<span>${label}</span>`);el.type='button';el.onclick=action;return el;
}
function relabel(el, label, glyph) {el.innerHTML=(glyph?icon(glyph):'')+`<span>${label}</span>`;}

export function installSimpleUI() {
  const api=window.hearingEquality;
  if (!api || document.body.classList.contains('simple-ui')) return;
  const root=$('view-dialogue'), main=$('workspace'), card=$('message-composer');
  const retired=make('div','simple-retired');
  retired.append(...card.childNodes);card.append(retired);card.classList.add('simple-composer');
  function insert(text){
    const search=$('phrase-search'),previous=search.value;
    search.value=text;search.dispatchEvent(new Event('input',{bubbles:true}));
    const choice=[...$('phrase-results').children].find(el=>el.textContent===text);
    choice?.click();search.value=previous;search.dispatchEvent(new Event('input',{bubbles:true}));
  }
  const stopVoice=()=>api.stop(),stopSpeech=()=>window.speechSynthesis?.cancel();
  document.body.classList.add('simple-ui');
  // One compact header instead of a dashboard rail and demonstration toolbar.
  const header=make('header','simple-header',`<a class="simple-brand" href="#dialogue" aria-label="Равенство по слуху — сообщение"><span class="simple-mark" aria-hidden="true">≈</span><span>Равенство<span class="simple-brand-second">по слуху</span></span></a><div class="simple-header-end"><span class="simple-university">РГСУ <span>· Технопарк</span></span></div>`);
  const nav=make('nav','simple-nav');nav.setAttribute('aria-label','Режимы общения');
  for (const [mode,label,glyph] of [['dialogue','Сообщение','chat'],['camera','Жесты → текст','camera'],['text','Словарь','book']]) {
    const b=button(label,()=>api.mode(mode),'simple-tab',glyph);b.dataset.simpleMode=mode;nav.append(b);
  }
  const heading=make('div','simple-heading','<h1 id="simple-title">Что хотите сказать?</h1><p id="simple-subtitle">Напишите сообщение или выберите фразу.</p>');
  const menuButton=button('Ещё',()=>openPanel('menu'),'simple-more','more');menuButton.id='simple-more';menuButton.setAttribute('aria-haspopup','dialog');
  header.lastElementChild.append(menuButton);main.prepend(header,nav,heading);
  header.querySelector('a').onclick=e=>{e.preventDefault();api.mode('dialogue');};

  const sheet=make('dialog','simple-sheet',`<div class="simple-sheet-head"><h2 id="simple-sheet-title" tabindex="-1"></h2><button class="simple-icon" id="simple-sheet-close" type="button" aria-label="Закрыть окно">${icon('close')}</button></div><p id="simple-sheet-status" class="simple-sheet-status" role="status" hidden></p>`);
  sheet.id='simple-sheet';sheet.setAttribute('aria-labelledby','simple-sheet-title');document.body.append(sheet);
  const panels=new Map();let returnFocus=null,currentPanel='';
  function panel(name,title) {const el=make('section','simple-panel');el.hidden=true;el.dataset.panel=name;sheet.append(el);panels.set(name,{el,title});return el;}
  function openPanel(name) {
    const entry=panels.get(name);if(!entry)return;
    api.stop();stopVoice();stopSpeech();
    if(!sheet.open)returnFocus=document.activeElement;
    for(const item of panels.values())item.el.hidden=true;
    currentPanel=name;entry.el.hidden=false;$('simple-sheet-title').textContent=entry.title;
    $('simple-sheet-status').hidden=true;
    if(!sheet.open)sheet.showModal();sheet.scrollTop=0;
    const focus=entry.el.querySelector('input:not([type=checkbox]),textarea')||$('simple-sheet-title');focus.focus({preventScroll:true});
  }
  function closePanel() {if(sheet.open)sheet.close();}
  sheet.addEventListener('close',()=>{stopVoice();stopSpeech();currentPanel='';if(returnFocus?.isConnected && returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});});
  $('simple-sheet-close').onclick=closePanel;
  sheet.addEventListener('click',e=>{if(e.target!==sheet)return;const r=sheet.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();});
  const menu=panel('menu','Ещё'), settings=panel('settings','Настройки'), phrasePanel=panel('phrases','Готовые фразы'), replyPanel=panel('reply','Ответ собеседника'), historyPanel=panel('history','История разговора');

  settings.append(document.querySelector('.readability-controls'),document.querySelector('.remember-draft'),$('draft-storage-status'));
  settings.querySelector('.remember-draft').lastChild.textContent='Сохранять черновик на этом устройстве';
  settings.append(make('p','simple-small','Не включайте сохранение на общем устройстве.'));
  const phraseDetails=make('div','comm-phrase-details');phrasePanel.append(phraseDetails);
  for(const id of ['phrase-search','phrase-categories','phrase-results','phrase-count'])phraseDetails.append($(id));
  $('phrase-search').classList.add('comm-search');$('phrase-categories').classList.add('comm-filters');$('phrase-results').classList.add('comm-phrases');
  phrasePanel.addEventListener('click',e=>{if(e.target.closest('#phrase-results button')){returnFocus=$('conversation');closePanel();$('conversation').focus({preventScroll:true});}});
  replyPanel.append(document.querySelector('.reply-helper'));
  $('employee-text').placeholder='Напишите ответ…';$('send-reply').textContent='Готово';
  $('reply-status').textContent='Передайте устройство собеседнику.';
  $('send-reply').addEventListener('click',()=>{if(!$('employee-text').value && $('history-messages').children.length)openPanel('history');});
  const historySection=document.querySelector('.dialogue-history');historyPanel.append(historySection);
  historySection.querySelector('.card-top').querySelector('div').hidden=true;
  historySection.querySelector('p.hint:last-child').textContent='История исчезнет при перезагрузке. Скопируйте её, чтобы сохранить.';
  const clear=$('clear-dialogue'),originalClear=clear.onclick;let clearArmed=false;
  clear.onclick=()=>{if(!clearArmed){clearArmed=true;clear.textContent='Удалить историю?';return;}originalClear();clearArmed=false;clear.textContent='Очистить диалог';};
  sheet.addEventListener('close',()=>{clearArmed=false;clear.textContent='Очистить диалог';});
  const menuRows=[
    ['Настройки','settings',()=>openPanel('settings')],['История разговора','chat',()=>openPanel('history')],
    ['Озвучить сообщение','speaker',()=>{closePanel();$('speak-message').click();}],
    ['Загрузить видео с жестом','camera',()=>{closePanel();api.mode('video');}],
  ];
  for(const [label,glyph,action] of menuRows)menu.append(button(label,action,'simple-menu-row',glyph));
  const advanced=make('details','simple-advanced','<summary>Для показа и разработки</summary>');menu.append(advanced);
  for(const [label,action] of [
    ['Подготовить показ без интернета',()=>$('prepare-show').click()],['Презентация проекта',()=>$('present').click()],
    ['Памятка выступающего',()=>$('open-guide').click()],['Проверка распознавания',()=>api.mode('research')],['О проекте',()=>api.mode('about')],
  ])advanced.append(button(label,()=>{closePanel();action();},'simple-menu-row'));
  advanced.append(make('a','simple-menu-row','Студия аватара ↗'));advanced.lastElementChild.href='studio.html?outfit=indigo';
  menu.append(make('p','simple-version','Равенство по слуху · 0.16'));

  // A single message card with three primary actions. Auxiliary actions are
  // reachable without exposing the entire settings/history workflow at once.
  card.setAttribute('aria-labelledby','composer-title');
  const top=make('div','simple-composer-top');$('composer-title').textContent='Моё сообщение';top.append($('composer-title'));
  const tools=make('div','simple-editor-tools');tools.append($('draft-count'));
  for(const [id,label,glyph] of [['undo-message','Отменить вставку','undo'],['clear-message','Очистить текст','trash']]){
    const el=$(id);el.className='simple-icon';el.innerHTML=icon(glyph);el.setAttribute('aria-label',label);el.title=label;tools.append(el);
  }
  top.append(tools);card.append(top);
  const field=make('div','simple-field');card.append(field);
  const label=card.querySelector('label[for="conversation"]');label.classList.add('sr-only');field.append(label,$('conversation'),$('draft-demo'));
  $('conversation').rows=4;$('conversation').placeholder='Например: напишите, пожалуйста, ваш ответ.';
  const quick=make('div','simple-quick');quick.setAttribute('aria-label','Быстрые фразы');
  for(const [label,text] of [['Напишите ответ','Пожалуйста, напишите ответ здесь.'],['Нужна помощь','Мне нужна помощь.'],['Спасибо!','Спасибо!']])quick.append(button(label,()=>insert(text),'simple-phrase'));
  const all=button('Все фразы',()=>openPanel('phrases'),'simple-all-phrases','arrow');all.id='simple-all-phrases';quick.append(all);card.append(quick);
  const actions=make('div','simple-main-actions');
  for(const [id,label,glyph] of [['show-message','Показать','screen'],['copy-message','Скопировать','copy'],['share-message','Поделиться','share']]){
    const el=$(id);relabel(el,label,glyph);el.className=id==='show-message'?'simple-primary':'simple-secondary';actions.append(el);
  }
  card.append(actions);
  const below=make('div','simple-below');const answer=button('Ответ собеседника',()=>{if(!$('save-message').disabled)$('save-message').click();openPanel('reply');},'simple-reply-link','reply');answer.id='simple-reply';
  const historyButton=button('История',()=>openPanel('history'),'simple-link','chat');historyButton.id='simple-history';below.append(answer,historyButton);
  root.append(below,make('p','simple-privacy','Текст не отправляется без вашего действия.'));
  document.body.append($('draft-status'));$('draft-status').textContent='';
  // Large text remains one step. Reply, rotation and text size are disclosed
  // only when selected; the native two-way controller and its context survive.
  const messageModal=$('message-display'),displayReply=make('details','simple-display-reply','<summary>Ответить</summary>');
  displayReply.append(document.querySelector('.display-response'));document.querySelector('.face-to-face').append(displayReply);
  const displaySettings=make('details','simple-display-settings','<summary>Вид текста</summary>');
  displaySettings.append(document.querySelector('label[for="display-font"]'),$('display-font'),$('display-rotate'));
  messageModal.querySelector('.message-display-toolbar').append(displaySettings);$('display-close').textContent='Закрыть';$('display-title').textContent='Моё сообщение';
  messageModal.addEventListener('close',()=>{displayReply.open=false;displaySettings.open=false;});
  const fallback=$('share-fallback');new MutationObserver(()=>{if(fallback.open&&sheet.open)closePanel();}).observe(fallback,{attributes:true,attributeFilter:['open']});
  // Camera: one stage; the result appears only after an actual attempt.
  const capture=$('view-capture'), result=capture.querySelector('.result-card');
  const capHead=make('div','simple-capture-heading','<span class="simple-badge">Эксперимент · 6 слов</span>');
  capHead.append(button('Какие жесты?',()=>api.mode('text'),'simple-link','arrow'));capture.querySelector('.capture-workspace').before(capHead);
  result.setAttribute('aria-label','Проверка распознанного слова');
  const details=make('details','simple-result-details','<summary>Подробности распознавания</summary>');details.append($('rankings'));result.append(details);
  $('capture-confirm-text').placeholder='Проверьте слово';$('capture-reject').textContent='Не то слово';
  const confirmAdd=button('Добавить в сообщение',()=>{
    if(!$('capture-confirm').disabled)$('capture-confirm').click();
    if($('add-word').disabled)return;
    const outcome=$('add-word').onclick();
    if(outcome?.ok){api.mode('dialogue');$('conversation').focus({preventScroll:true});}
  },'simple-primary');confirmAdd.id='simple-confirm-add';
  $('capture-confirm').parentElement.after(confirmAdd);
  $('capture-confirm').classList.add('simple-retired');$('add-word').classList.add('simple-retired');$('speak').classList.add('simple-retired');
  $('capture-reject').addEventListener('click',()=>{result.hidden=true;const next=api.state().mode==='video'?$('analyze-video'):$('record');if(!next.disabled)next.focus({preventScroll:true});});
  const captureOptions=make('details','simple-capture-options','<summary>Настройки камеры</summary>');
  const oldOptions=capture.querySelector('.capture-options');captureOptions.append(oldOptions);$('camera-controls').append(captureOptions);
  // Personal samples are a research feature, not the first step for a visitor.
  $('enroll-panel').classList.add('simple-enroll');captureOptions.append($('enroll-panel'));
  const capFallback=button('Написать текст вместо жеста',()=>{api.mode('dialogue');$('conversation').focus();},'simple-link');capFallback.id='simple-camera-fallback';capture.querySelector('.capture-workspace').after(capFallback);
  function captureState() {
    const idle=$('result-label').textContent==='СЛОВО ПОЯВИТСЯ ЗДЕСЬ';result.hidden=idle;
    confirmAdd.disabled=($('capture-confirm').disabled && $('add-word').disabled) || !$('capture-confirm-text').value.trim();

    $('record').hidden=$('stop-camera').hidden;
  }
  new MutationObserver(captureState).observe($('result-label'),{childList:true});
  new MutationObserver(captureState).observe($('capture-confirm'),{attributes:true,attributeFilter:['disabled']});
  new MutationObserver(captureState).observe($('add-word'),{attributes:true,attributeFilter:['disabled']});
  new MutationObserver(captureState).observe($('stop-camera'),{attributes:true,attributeFilter:['hidden']});
  $('capture-confirm-text').addEventListener('input',captureState);captureState();
  // Known-sample controls remain explicitly labelled and collapsed.
  const demos=make('details','simple-video-demos','<summary>Демонстрационные записи · не проверка точности</summary>');
  demos.append($('video-examples'),$('replay-analysis'));
  const vc=$('video-controls');vc.querySelector('.small-heading').hidden=true;vc.querySelector('p.hint').textContent='Демозаписи уже входят в набор образцов.';demos.append(vc.querySelector('p.hint'));vc.append(demos);

  // Vocabulary: one scene and one row of words. Advanced playback is optional.
  const avatarCard=document.querySelector('.avatar-card');
  const words=avatarCard.querySelector('.avatar-words');$('view-text').querySelector('.text-workspace').before(words);
  const playback=make('details','simple-playback-options','<summary>Настройки просмотра</summary>');
  playback.append(avatarCard.querySelector('.playback-tools'),$('motion-smoothing'),$('showcase-controls'));
  avatarCard.append(playback);
  const textNotice=$('text-notice');avatarCard.after(textNotice);

  let seenMode='';
  function syncMode() {
    const mode=api.state().mode;document.body.dataset.simpleMode=mode;
    const meta={dialogue:['Что хотите сказать?','Напишите сообщение или выберите фразу.'],camera:['Из жеста — в текст.','Покажите одно слово и проверьте результат.'],video:['Жест на видео.','Выберите короткую запись с одним жестом.'],text:['Посмотрите, как сказать.','Выберите слово. Аватар покажет движение.'],research:['Проверка распознавания.','Результаты и инструменты исследования.'],about:['Равенство по слуху.','Технологии для общения и взаимопонимания.']}[mode];
    if(meta){$('simple-title').textContent=meta[0];$('simple-subtitle').textContent=meta[1];}
    for(const el of nav.children){const selected=el.dataset.simpleMode===mode || mode==='video'&&el.dataset.simpleMode==='camera';if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}
    if(mode==='camera'){$('placeholder-title').textContent='Лицо и обе руки — в кадре';$('placeholder-copy').textContent='Включите камеру, когда будете готовы.';}
    if(seenMode!==mode){seenMode=mode;$('draft-status').textContent='';if(sheet.open)closePanel();window.scrollTo({top:0,behavior:'instant'});}
    if($('capture-notice').textContent.startsWith('Для первого запуска модели нужен интернет.'))$('capture-notice').textContent='Для первого запуска нужен интернет.';
    captureState();
  }
  new MutationObserver(syncMode).observe($('mode-crumb'),{childList:true,subtree:true});syncMode();
  let statusTimer;
  new MutationObserver(()=>{clearTimeout(statusTimer);const text=$('draft-status').textContent;$('draft-status').dataset.quiet=String(/^(Черновик сохранён в этой вкладке\.|Текст изменён вручную\.|Текст добавлен в сообщение\.)/.test(text));if(text && !/не помещается|не удалось|недоступно|максимум|сократите/i.test(text))statusTimer=setTimeout(()=>{$('draft-status').textContent='';},6500);if(sheet.open){$('simple-sheet-status').textContent=text;$('simple-sheet-status').hidden=!text;}}).observe($('draft-status'),{childList:true});
  // Native message dialog may be triggered by a denied clipboard permission.
  new MutationObserver(()=>{if(messageModal.open && sheet.open)closePanel();}).observe(messageModal,{attributes:true,attributeFilter:['open']});
  const footer=document.querySelector('.footer');footer.innerHTML='<span>РГСУ · Технопарк</span><span>Равенство по слуху</span>';
  // A small footnote keeps the scope honest without an essay on every screen.
  const limit=make('p','simple-scope','Экспериментальный набор из 6 слов. Перевод предложений пока не поддерживается.');capture.append(limit);
  const orbit=make('details','simple-3d-options','<summary>Поворот и вид 3D</summary>');
  const attachToolbar=()=>{const toolbar=$('platform-avatar').querySelector('.human-3d-toolbar');if(toolbar){orbit.append(toolbar);playback.append(orbit);}};attachToolbar();$('platform-avatar').addEventListener('avatarready',attachToolbar,{once:true});
  const moreViews=make('details','simple-3d-options','<summary>Дополнительные возможности</summary>');
  moreViews.append($('partner-avatar-detail'),document.querySelector('.communication-checks'));advanced.append(moreViews);
  window.dispatchEvent(new Event('resize'));
}

installSimpleUI();
