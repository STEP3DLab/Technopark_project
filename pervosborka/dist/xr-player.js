/*
 * Visitor trial for the existing three-stage XR task. No grading or persistence.
 *
 * const player = XRPlayer.mount(slot, {
 *   choices: {entry:'goal', action:'select', feedback:'explain'},
 *   view: previousView,
 *   onScene: ({visitorChoice,visitorStage}) => scene.update(...)
 * });
 * const view = player.getView(); // fresh {signature,stage,visitorChoice}
 * player.destroy();
 *
 * A saved trial is restored only for the same sanitized choices signature.
 * Internal stages: idle, intro, autoride, selection, barrier, feedback,
 * praise, closed, finished. onScene maps these to '', entry, action, feedback.
 * XRPlayer.logic exposes pure transition helpers for verification, not scoring.
 */
(function (global) {
  'use strict';
  var ALLOWED = Object.freeze({entry:['goal','autoride','finish'], action:['select','voice','headset'], feedback:['close','praise','explain']});
  var FIELDS = ['entry','action','feedback'];
  var FIELD_NAMES = {entry:'вход',action:'действие',feedback:'отклик'};
  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function normalizeChoices(source) {
    var input = source && typeof source === 'object' ? source : {};
    return {entry:ALLOWED.entry.includes(input.entry)?input.entry:'',action:ALLOWED.action.includes(input.action)?input.action:'',feedback:ALLOWED.feedback.includes(input.feedback)?input.feedback:''};
  }
  function signature(choices) {
    var c = normalizeChoices(choices);
    return FIELDS.map(function (field) { return c[field]; }).join('|');
  }
  function complete(choices) { return FIELDS.every(function (field) { return !!choices[field]; }); }
  function freshView(choices) { return {signature:signature(choices),stage:'idle',visitorChoice:''}; }
  function validObject(value) { return value === 'satellite' || value === 'rover'; }
  function restoreView(choices,source) {
    var c=normalizeChoices(choices), initial=freshView(c);
    if (!complete(c) || !source || typeof source !== 'object' || source.signature !== initial.signature) return initial;
    var stage=source.stage, pick=validObject(source.visitorChoice)?source.visitorChoice:'';
    var valid=stage === 'idle' ||
      (stage === 'intro' && c.entry === 'goal') ||
      (stage === 'autoride' && c.entry === 'autoride') ||
      (stage === 'selection' && c.entry !== 'finish' && c.action === 'select') ||
      (stage === 'barrier' && c.entry !== 'finish' && c.action !== 'select') ||
      (stage === 'finished' && c.entry === 'finish') ||
      (c.entry !== 'finish' && c.action === 'select' && !!pick &&
        ((stage === 'feedback' && c.feedback === 'explain') || (stage === 'praise' && c.feedback === 'praise') || (stage === 'closed' && c.feedback === 'close')));
    if (!valid) return initial;
    return {signature:initial.signature,stage:stage,visitorChoice:['feedback','praise','closed'].includes(stage)?pick:''};
  }
  function transition(choices,source,event) {
    var c=normalizeChoices(choices), view=restoreView(c,source), action=event || {};
    if (!complete(c)) return freshView(c);
    if (action.type === 'editor') return freshView(c);
    if (action.type === 'launch') return {signature:signature(c),stage:{goal:'intro',autoride:'autoride',finish:'finished'}[c.entry],visitorChoice:''};
    if ((action.type === 'begin' && view.stage === 'intro') || (action.type === 'continue' && view.stage === 'autoride')) {
      return {signature:signature(c),stage:c.action === 'select'?'selection':'barrier',visitorChoice:''};
    }
    if (action.type === 'choose' && view.stage === 'selection' && c.action === 'select' && validObject(action.choice)) {
      return {signature:signature(c),stage:{explain:'feedback',praise:'praise',close:'closed'}[c.feedback],visitorChoice:action.choice};
    }
    if (action.type === 'retry' && view.stage === 'feedback' && c.feedback === 'explain') {
      return {signature:signature(c),stage:'selection',visitorChoice:''};
    }
    return view;
  }
  function outcome(choices,source) {
    var c=normalizeChoices(choices), view=restoreView(c,source);
    if (view.stage === 'feedback') {
      return view.visitorChoice === 'satellite' ?
        {title:'Это спутник',text:'Этот экспонат соответствует цели «Найди спутник». Ты можешь повторить выбор и посмотреть другой результат.',kind:'match',canRetry:true} :
        {title:'Это марсоход',text:'Этот экспонат не соответствует цели «Найди спутник». Вернись к выбору и попробуй другой объект.',kind:'mismatch',canRetry:true};
    }
    if (view.stage === 'praise') return {title:'Всё верно',text:'',kind:'praise',canRetry:false};
    if (view.stage === 'finished') return {title:'Задание выполнено',text:'',kind:'finished',canRetry:false};
    if (view.stage === 'closed') return {title:'',text:'',kind:'closed',canRetry:false};
    return null;
  }
  function sceneState(choices,source) {
    var view=restoreView(choices,source), stages={intro:'entry',autoride:'entry',selection:'action',barrier:'action',feedback:'feedback',praise:'feedback',closed:'feedback',finished:'feedback'};
    return {visitorStage:stages[view.stage] || '',visitorChoice:view.visitorChoice};
  }
  function svgIcon(name) {
    var paths={
      play:'<path d="m8 5 11 7-11 7Z"/>',
      arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
      return:'<path d="M10 5 3 12l7 7M3 12h10a7 7 0 0 1 7 7"/>',
      retry:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
      headset:'<path d="M5 7h14l3 11h-7l-3-3-3 3H2L5 7Z"/><circle cx="7" cy="12" r="1.5"/><circle cx="17" cy="12" r="1.5"/><path d="M5 7V5a7 7 0 0 1 14 0v2"/>',
      close:'<path d="m6 6 12 12M6 18 18 6"/>',
      lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/><circle cx="12" cy="16" r="1"/>'
    };
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name] || paths.arrow)+'</svg>';
  }
  function satelliteArt() {
    return '<svg class="xp-object-art" viewBox="0 0 280 190" aria-hidden="true"><ellipse cx="142" cy="161" rx="91" ry="13" fill="#15305b" opacity=".08"/>'+
      '<path d="m28 79 63-32 28 42-64 35Z" fill="#1e49c8"/><path d="m28 79 63-32v5L31 83Z" fill="#8eacff"/><path d="m55 124 64-35v6l-64 35Z" fill="#163487"/>'+
      '<path d="m38 75 28 43m-13-51 28 42m-12-50 28 42m-12-50 28 42M34 92l63-32M43 106l63-33" stroke="#88abff" stroke-width="1"/>'+
      '<path d="m164 70 65-33 29 42-65 34Z" fill="#2355ed"/><path d="m164 70 65-33v5l-62 33Z" fill="#a3bcff"/><path d="m193 113 65-34v6l-65 34Z" fill="#17368c"/>'+
      '<path d="m175 65 28 42m-12-50 28 42m-12-50 28 42m-12-50 28 42M171 83l65-33m-55 47 65-33" stroke="#a9c2ff" stroke-width="1"/>'+
      '<path d="m111 79 35-20 36 20-35 21Z" fill="#f3f5fb"/><path d="m111 79 36 21v43l-36-22Z" fill="#d4dbe7"/><path d="m147 100 35-21v42l-35 22Z" fill="#9cacc5"/>'+
      '<path d="m120 88 18 10v29l-18-11Z" fill="#e7cf78"/><path d="m154 108 19-11v11l-19 11Z" fill="#456ca4"/>'+
      '<path d="M146 61V37m0 0 12-15" stroke="#7689a6" stroke-width="3"/><circle cx="158" cy="21" r="4" fill="#d7f56c"/>'+
      '<path d="M126 57q20-20 40 0-20 10-40 0Z" fill="#e4ebf8" stroke="#a1b1c9" stroke-width="1.5"/><circle cx="146" cy="49" r="3" fill="#2355ed"/>'+
      '</svg>';
  }
  function roverArt() {
    return '<svg class="xp-object-art" viewBox="0 0 280 190" aria-hidden="true"><ellipse cx="142" cy="164" rx="88" ry="12" fill="#15305b" opacity=".08"/>'+
      '<path d="m59 112 105-29 56 33-108 31Z" fill="#9fafc8"/><path d="m59 112 53 35v14l-53-33Z" fill="#354e73"/><path d="m112 147 108-31v14l-108 31Z" fill="#1a345c"/>'+
      '<path d="m80 82 89-24 42 25-90 27Z" fill="#84a5ff"/><path d="m80 82 41 28v26l-41-27Z" fill="#2355ed"/><path d="m121 110 90-27v26l-90 27Z" fill="#173dba"/>'+
      '<path d="m94 82 74-20 27 18-74 22Z" fill="#d7f56c"/><path d="m103 79 27 20m-10-25 27 20m-10-25 27 20m-10-25 27 20" stroke="#93b13a" stroke-width="1"/>'+
      '<path d="M168 66V31m0 3-18-7" stroke="#7587a3" stroke-width="7"/><path d="m139 17 25-7 22 13-26 8Z" fill="#dce4f1"/><path d="m139 17 21 14v16l-21-13Z" fill="#2355ed"/><path d="m160 31 26-8v16l-26 8Z" fill="#183764"/>'+
      '<circle cx="146" cy="28" r="4" fill="#172b4f"/><circle cx="155" cy="33" r="4" fill="#172b4f"/>'+
      '<g fill="#1b2e4b" stroke="#647a99" stroke-width="3"><ellipse cx="73" cy="131" rx="16" ry="20"/><ellipse cx="111" cy="151" rx="16" ry="20"/><ellipse cx="155" cy="143" rx="15" ry="19"/><ellipse cx="201" cy="130" rx="15" ry="19"/></g>'+
      '<g fill="#90a3c3"><ellipse cx="73" cy="131" rx="6" ry="9"/><ellipse cx="111" cy="151" rx="6" ry="9"/><ellipse cx="155" cy="143" rx="6" ry="8"/><ellipse cx="201" cy="130" rx="6" ry="8"/></g>'+
      '</svg>';
  }
  function orbitArt() {
    return '<svg class="xp-orbit-art" viewBox="0 0 380 220" aria-hidden="true"><ellipse cx="190" cy="112" rx="142" ry="57" fill="none" stroke="#5272ac" stroke-width="1" transform="rotate(-20 190 112)"/><ellipse cx="190" cy="112" rx="112" ry="44" fill="none" stroke="#334f7c" stroke-width="1" transform="rotate(30 190 112)"/><circle cx="190" cy="112" r="49" fill="#2355ed"/><path d="M157 83q20 9 13 28t30 21q11 17-6 28a49 49 0 0 1-37-77Z" fill="#6085ef"/><path d="M210 71q-15 16 3 24t25 15a49 49 0 0 0-28-39Z" fill="#8faffa"/><circle cx="73" cy="152" r="8" fill="#d7f56c"/><circle cx="318" cy="73" r="4" fill="#e5edff"/><path d="M61 47v12m-6-6h12m250 106v10m-5-5h10" stroke="#87a6d8" stroke-width="1.5"/></svg>';
  }
  function actionButton(text,action,primary,extra) {
    return '<button type="button" class="xp-button '+(primary?'xp-button--primary':'xp-button--quiet')+'" data-xp-action="'+action+'" '+(extra||'')+'>'+text+'</button>';
  }
  function stateTitle(text) { return '<h4 data-xp-focus="state-title" tabindex="-1">'+escapeText(text)+'</h4>'; }
  function stageNumber(stage) {
    if (['intro','autoride'].includes(stage)) return 1;
    if (['selection','barrier'].includes(stage)) return 2;
    if (['feedback','praise','closed','finished'].includes(stage)) return 3;
    return 0;
  }
  function visitorScreen(c,view) {
    var stage=view.stage, result=outcome(c,view);
    if (stage === 'idle') return '<div class="xp-ready"><div class="xp-ready-art">'+orbitArt()+'</div><div><span class="xp-screen-eyebrow">ПРОЙДИ СВОЮ ВЫСТАВКУ</span>'+stateTitle('Посмотри на сценарий глазами посетителя')+'<p>Понятна ли цель? Можно ли выбрать экспонат? Что происходит после выбора? Испытай именно те решения, которые собрал.</p>'+actionButton(svgIcon('play')+'<span>Пройти как посетитель</span>','launch',true)+'</div></div>';
    if (stage === 'intro') return '<div class="xp-intro"><div class="xp-intro-art">'+orbitArt()+'</div><span class="xp-screen-eyebrow">ТВОЯ ЦЕЛЬ НА ВЫСТАВКЕ</span>'+stateTitle('Найди спутник')+'<p>Рассмотри два экспоната и выбери модель спутника.</p>'+actionButton('<span>Начать</span>'+svgIcon('arrow'),'begin',true)+'</div>';
    if (stage === 'autoride') return '<div class="xp-autoride"><div class="xp-camera-pass">'+orbitArt()+'</div><span class="xp-screen-eyebrow">ПРОЛЁТ КАМЕРЫ</span>'+stateTitle('Выставка открывается')+'<p>Короткий предпросмотр вместо минутного пролёта. Продолжить можно сразу.</p>'+actionButton('<span>Продолжить</span>'+svgIcon('arrow'),'continue',true)+'</div>';
    if (stage === 'selection') return '<div class="xp-selection"><span class="xp-screen-eyebrow">ДВА ЭКСПОНАТА</span>'+stateTitle(c.entry==='goal'?'Какой из них — спутник?':'Перед тобой два экспоната')+'<p>'+escapeText(c.entry==='goal'?'Нажми на подходящий объект.':'Можно выбрать любой объект.')+'</p><div class="xp-object-grid">'+
      '<button type="button" class="xp-object-card" data-xp-action="choose" data-xp-choice="satellite" aria-label="Выбрать спутник"><span class="xp-object-index">ЭКСПОНАТ 01</span>'+satelliteArt()+'<span class="xp-object-name">Спутник <span aria-hidden="true">↗</span></span></button>'+
      '<button type="button" class="xp-object-card" data-xp-action="choose" data-xp-choice="rover" aria-label="Выбрать марсоход"><span class="xp-object-index">ЭКСПОНАТ 02</span>'+roverArt()+'<span class="xp-object-name">Марсоход <span aria-hidden="true">↗</span></span></button></div></div>';
    if (stage === 'barrier') {
      var voice=c.action==='voice';
      return '<div class="xp-barrier"><span class="xp-large-icon">'+svgIcon(voice?'mic':'headset')+'</span><span class="xp-screen-eyebrow">ВЫБРАННЫЙ СПОСОБ УПРАВЛЕНИЯ</span>'+stateTitle(voice?'Для выбора нужен голос':'Для выбора нужна гарнитура')+'<p>'+escapeText(voice?'Сценарий предлагает выбирать экспонат только голосом. В этом испытании микрофон не запрашивается. На обычном экране выбор этим способом недоступен.':'Сценарий требует гарнитуру и поворот головы. В этом испытании гарнитура не подключается. На обычном экране выбор этим способом недоступен.')+'</p><div class="xp-barrier-note">'+svgIcon('lock')+'<span>Чтобы изменить способ управления, вернись к редактору сценария.</span></div></div>';
    }
    if (stage === 'closed') return '<div class="xp-closed" role="img" aria-label="Окно выставки закрыто. Результат выбора не показан."><span>'+svgIcon('close')+'</span><div class="xp-closed-line"></div><div class="xp-closed-line short"></div></div>';
    if (result) return '<div class="xp-outcome xp-outcome--'+result.kind+'">'+
      (stage==='feedback'?'<div class="xp-outcome-object">'+(view.visitorChoice==='satellite'?satelliteArt():roverArt())+'</div>':'<span class="xp-large-icon">'+svgIcon('check')+'</span>')+
      stateTitle(result.title)+(result.text?'<p>'+escapeText(result.text)+'</p>':'')+
      (result.canRetry?actionButton(svgIcon('retry')+'<span>Попробовать ещё</span>','retry',true):'')+'</div>';
    return '';
  }
  function observation(c,view) {
    if (view.stage==='autoride') return 'В выбранном входе цель не показана: посетитель сразу видит пролёт камеры.';
    if (view.stage==='barrier') return 'Испытание остановилось на способе управления. Внешние кнопки ниже позволяют выйти из сценария.';
    if (view.stage==='closed') return 'Окно закрылось без результата. Посетитель не получил обратной связи о своём выборе.';
    if (view.stage==='finished') return 'Сценарий завершился сразу после входа: посетитель ещё не выбирал экспонат.';
    if (view.stage==='praise') return 'Отклик сценария показан выше. В нём нет объяснения или кнопки повторной попытки.';
    return '';
  }
  function liveMessage(c,view) {
    var result=outcome(c,view);
    if (view.stage==='idle') return 'Испытание закрыто. Можно редактировать сценарий или запустить его снова.';
    if (view.stage==='intro') return 'Цель посетителя: найди спутник. Доступна кнопка «Начать».';
    if (view.stage==='autoride') return 'Показан сокращённый пролёт камеры. Кнопка «Продолжить» доступна сразу.';
    if (view.stage==='selection') return c.entry==='goal'?'Выбери спутник. Доступны две кнопки: спутник и марсоход.':'Доступны два экспоната: спутник и марсоход. Цель на входе не была показана.';
    if (view.stage==='barrier') return c.action==='voice'?'Сценарий требует голос. На обычном экране испытание остановилось; микрофон не запрашивается.':'Сценарий требует гарнитуру. На обычном экране испытание остановилось; гарнитура не подключается.';
    if (view.stage==='closed') return 'Окно выставки закрылось без результата.';
    if (result) return result.title+(result.text?'. '+result.text:'')+(view.stage==='finished'?'. Экспонат ещё не был выбран.':'');
    return '';
  }
  function markup(c,view) {
    var missing=FIELDS.filter(function (field) { return !c[field]; });
    if (missing.length) return '<div class="xp-pending"><span class="xp-pending-icon">'+svgIcon('eye')+'</span><div><h3>Испытай свой сценарий</h3><p>Сначала выбери все три этапа. Ещё нужно выбрать: <strong>'+missing.map(function (field) { return FIELD_NAMES[field]; }).join(', ')+'</strong>.</p></div></div>';
    var number=stageNumber(view.stage), note=observation(c,view), active=view.stage!=='idle';
    return '<div class="xp-header"><div><p class="xp-kicker">ПРОВЕРКА ОПЫТА ПОСЕТИТЕЛЯ</p><h3>Из редактора — внутрь выставки</h3></div><span class="xp-mode-badge">'+svgIcon('eye')+'Испытание сценария</span></div>'+
      '<p class="xp-purpose">Этот запуск показывает последствия твоих решений. Выбор экспоната не меняет ответы, баллы и сохранённые попытки основного задания.</p>'+
      '<ol class="xp-flow" aria-label="Этапы проигрываемого сценария">'+[['01','Цель'],['02','Действие'],['03','Отклик']].map(function (item,i) { return '<li class="'+(number===i+1?'is-active':'')+'"'+(number===i+1?' aria-current="step"':'')+'><span>'+item[0]+'</span>'+item[1]+'</li>'; }).join('')+'</ol>'+
      '<div class="xp-window"><div class="xp-window-bar"><span class="xp-window-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>ВИРТУАЛЬНАЯ ВЫСТАВКА</span><span class="xp-window-state">'+(active?'Режим посетителя':'Готова к испытанию')+'</span></div><div class="xp-window-body">'+visitorScreen(c,view)+'</div></div>'+
      (note?'<p class="xp-observation" data-xp-focus="observation" tabindex="-1"><strong>Что произошло.</strong> '+escapeText(note)+'</p>':'')+
      (active?'<div class="xp-outside-controls"><span>Управление испытанием</span><div>'+actionButton(svgIcon('return')+'<span>Вернуться к редактору</span>','editor',false)+actionButton(svgIcon('retry')+'<span>Запустить снова</span>','launch',false)+'</div></div>':'')+
      '<p class="xp-footnote">Чтобы сохранить решение задачи, используй «Проверить решение» в редакторе. Здесь можно свободно пробовать оба экспоната.</p>';
  }
  function mount(container,options) {
    options=options || {};
    var choices=normalizeChoices(options.choices), view=restoreView(choices,options.view), destroyed=false;
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== 'function') {
      return {getView:function(){return restoreView(choices,view);},destroy:function(){destroyed=true;}};
    }
    var doc=container.ownerDocument, root=doc.createElement('section'), content=doc.createElement('div'), live=doc.createElement('p');
    root.className='xp';root.setAttribute('aria-label','Испытание созданного сценария выставки');
    content.className='xp-content';live.className='xp-sr-only';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
    root.append(content,live);container.replaceChildren(root);
    function notifyScene() {
      if (destroyed || typeof options.onScene !== 'function') return;
      try { options.onScene(sceneState(choices,view)); } catch (_) { /* The host scene must not interrupt the visitor trial. */ }
    }
    function render(shouldFocus) {
      if (destroyed) return;
      content.innerHTML=markup(choices,view);
      if (shouldFocus) {
        var target=view.stage==='idle'?content.querySelector('[data-xp-action="launch"]'):content.querySelector('[data-xp-focus="state-title"]') || content.querySelector('[data-xp-focus="observation"]');
        if (target) { try { target.focus({preventScroll:true}); } catch (_) { target.focus(); } }
      }
    }
    function onClick(event) {
      var target=event.target && event.target.closest ? event.target.closest('[data-xp-action]') : null;
      if (destroyed || !target || !root.contains(target)) return;
      var next=transition(choices,view,{type:target.dataset.xpAction,choice:target.dataset.xpChoice});
      if (next.stage===view.stage && next.visitorChoice===view.visitorChoice && target.dataset.xpAction!=='launch') return;
      view=next;render(true);live.textContent=liveMessage(choices,view);notifyScene();
    }
    root.addEventListener('click',onClick);render(false);notifyScene();
    return {
      getView:function(){return restoreView(choices,view);},
      destroy:function(){if(destroyed)return;destroyed=true;root.removeEventListener('click',onClick);}
    };
  }
  var api=Object.freeze({mount:mount,logic:Object.freeze({normalizeChoices:normalizeChoices,signature:signature,freshView:freshView,restoreView:restoreView,transition:transition,outcome:outcome,sceneState:sceneState})});
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  global.XRPlayer=api;
})(typeof window!=='undefined'?window:globalThis);
