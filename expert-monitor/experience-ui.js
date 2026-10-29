'use strict';

// Navigation and reading preferences are local UI state, never research data.
(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports=factory();
  else root.ExpertExperienceUI=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  const PREF_KEY='msk-expert-monitor-reading-v1';
  const DEFAULTS=Object.freeze({density:'comfortable',text:'regular',motion:'system'});
  const VIEWS=Object.freeze([
    ['overview','Обзор','dashboard','начало сводка приоритеты'],
    ['opportunities','Возможности','briefcase','реестр поиск дела закупки'],
    ['compare','Сравнение','table','сравнить варианты'],
    ['workspace','Моя работа','board','этапы доска избранное'],
    ['planner','Планировщик','clock','задачи календарь сроки'],
    ['courts','Справочник судов','court','суд контакты'],
    ['sources','Источники и обновления','radar','сборщик проверка журнал'],
    ['proposals','Мои предложения','document','кп коммерческое предложение черновики'],
    ['guide','Как это работает','help','инструкция справка копия восстановление']
  ]);
  const TEXT_LIMITS=Object.freeze({
    'detail-note':20000,'detail-task':2000,'task-text':2000,'estimate-notes':20000,
    subject:5000,requisites:10000,qualification:20000,conditions:20000,attachments:20000
  });
  const normalize=value=>String(value??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  function cleanPreferences(value){
    const raw=value&&typeof value==='object'?value:{};
    return {
      density:['comfortable','compact'].includes(raw.density)?raw.density:DEFAULTS.density,
      text:['regular','large'].includes(raw.text)?raw.text:DEFAULTS.text,
      motion:['system','reduce'].includes(raw.motion)?raw.motion:DEFAULTS.motion
    };
  }
  function paletteResults(query,records=[],limit=12){
    const q=normalize(query).slice(0,300),tokens=q.split(' ').filter(Boolean);
    const candidates=VIEWS.map(([id,label,icon,aliases])=>({kind:'view',id,label,icon,detail:'Раздел',search:normalize(label+' '+aliases)}));
    if(q)for(const record of records){
      if(!record||typeof record.id!=='string')continue;
      const label=String(record.title||record.caseNumber||'Запись без названия');
      const number=String(record.caseNumber||'');
      candidates.push({kind:'record',id:record.id,label,icon:'briefcase',detail:number?'№ '+number:'Карточка записи',search:normalize(label+' '+number),number:normalize(number)});
    }
    const matches=candidates.filter(item=>tokens.every(token=>item.search.includes(token))).map((item,index)=>({...item,index,score:!q?0:item.number===q?100:normalize(item.label)===q?90:normalize(item.label).startsWith(q)?70:item.number?.startsWith(q)?60:item.kind==='view'?40:20}));
    matches.sort((a,b)=>b.score-a.score||a.index-b.index);
    return {total:matches.length,items:matches.slice(0,Math.max(1,Math.min(40,Number(limit)||12))).map(({search,score,index,number,...item})=>item)};
  }
  function nextIndex(index,key,length){
    if(!length)return -1;
    if(key==='Home')return 0;
    if(key==='End')return length-1;
    if(key==='ArrowUp')return index<=0?length-1:index-1;
    if(key==='ArrowDown')return index<0||index>=length-1?0:index+1;
    return Math.min(Math.max(index,0),length-1);
  }
  function counterState(value,limit){
    const used=String(value??'').length,max=Number(limit),remaining=Math.max(0,max-used);
    const band=used>max?'over':used===max?'full':used>=max*.9?'near':'normal';
    return {used,max,remaining,band};
  }
  function titleFor(state,record){
    if(state?.detailId&&record)return (record.caseNumber?'№ '+record.caseNumber:String(record.title||'Карточка').slice(0,100))+' · МСК Эксперт';
    return (VIEWS.find(([id])=>id===state?.view)?.[1]||'Судебный мониторинг')+' · МСК Эксперт';
  }
  function create(A){
    const doc=A.document||document,win=A.window||(typeof window!=='undefined'?window:{});
    const $=selector=>doc.querySelector(selector);
    const esc=A.esc||((value)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])));
    const icon=A.icon||(()=>''),root=doc.documentElement||doc.body;
    let storage;
    try{storage=A.storage||win.localStorage;}catch{}
    let preferences={...DEFAULTS};
    try{preferences=cleanPreferences(JSON.parse(storage?.getItem(PREF_KEY)||'{}'));}catch{}
    let entries=[],active=-1,opener=null,queued=false,destroyed=false,lastOffline=false,networkDismissed=false;
    const ownDialogs=new Set(['experience-palette-dialog','experience-help-dialog','experience-settings-dialog']);
    const events=[];
    const mount=doc.createElement('div');mount.id='experience-tools';
    mount.innerHTML=`<dialog id="experience-palette-dialog" class="experience-dialog experience-palette" aria-labelledby="experience-palette-title"><div class="experience-dialog-head"><div><p class="eyebrow">БЫСТРЫЙ ПЕРЕХОД</p><h2 id="experience-palette-title">Найти раздел или запись</h2></div><button type="button" class="icon-button" data-action="experience-close" aria-label="Закрыть быстрый переход">${icon('close')}</button></div><label class="experience-search" for="experience-query">${icon('search')}<span class="sr-only">Название раздела, номер или предмет записи</span><input id="experience-query" type="search" maxlength="300" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="experience-results" aria-describedby="experience-results-status" placeholder="Например: планировщик, обмеры, номер дела"></label><p id="experience-results-status" class="field-hint" role="status"></p><div id="experience-results" class="experience-results" role="listbox" aria-label="Результаты быстрого перехода"></div><p class="experience-key-hint"><kbd>↑</kbd> <kbd>↓</kbd> — выбор · <kbd>Enter</kbd> — открыть · <kbd>Esc</kbd> — закрыть</p></dialog><dialog id="experience-help-dialog" class="experience-dialog" aria-labelledby="experience-help-title"><div class="experience-dialog-head"><h2 id="experience-help-title">Клавиатура и быстрые действия</h2><button type="button" class="icon-button" data-action="experience-close" aria-label="Закрыть помощь">${icon('close')}</button></div><dl class="experience-shortcuts"><div><dt><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd></dt><dd>Найти раздел или запись</dd></div><div><dt><kbd>/</kbd></dt><dd>Перейти в поиск текущего раздела</dd></div><div><dt><kbd>?</kbd></dt><dd>Открыть эту подсказку</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Закрыть окно или меню. Редакторы уточнят, что делать с несохранёнными правками.</dd></div><div><dt><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd></dt><dd>Перейти к следующему или предыдущему элементу</dd></div></dl><p class="field-hint">«/» и «?» работают вне полей ввода и открытых окон. Быстрый переход не открывается поверх редактора.</p><div class="dialog-actions"><button type="button" class="button primary" data-action="experience-close">Понятно</button></div></dialog><dialog id="experience-settings-dialog" class="experience-dialog" aria-labelledby="experience-settings-title"><div class="experience-dialog-head"><h2 id="experience-settings-title">Удобство чтения</h2><button type="button" class="icon-button" data-action="experience-close" aria-label="Закрыть настройки">${icon('close')}</button></div><p>Настройки применяются сразу и сохраняются в этом браузере.</p><div class="experience-setting"><label for="experience-density"><b>Плотность списков</b><span>Количество свободного места между записями</span></label><select id="experience-density"><option value="comfortable">Обычная</option><option value="compact">Компактная</option></select></div><div class="experience-setting"><label for="experience-text"><b>Размер рабочего текста</b><span>Подписи, описания и поля ввода</span></label><select id="experience-text"><option value="regular">Обычный</option><option value="large">Увеличенный</option></select></div><div class="experience-setting"><label for="experience-motion"><b>Движение интерфейса</b><span>Настройка системы учитывается автоматически</span></label><select id="experience-motion"><option value="system">Как в системе</option><option value="reduce">Минимум движения</option></select></div><p class="field-hint" id="experience-settings-status" role="status">Рабочие заметки и документы эти настройки не меняют.</p><div class="dialog-actions"><button type="button" class="button secondary" data-action="experience-reset-settings">Стандартный вид</button><button type="button" class="button primary" data-action="experience-close">Готово</button></div></dialog><div id="experience-network" class="experience-network" role="status" hidden><div><strong id="experience-network-title"></strong><p id="experience-network-text"></p></div><div class="button-row"><button type="button" class="button secondary small" data-action="experience-retry">${icon('refresh')}Повторить загрузку</button><button type="button" class="icon-button" data-action="experience-dismiss-network" aria-label="Скрыть сообщение о подключении">${icon('close')}</button></div></div><button type="button" id="experience-top" class="experience-top" data-action="experience-top" aria-label="Вернуться к началу страницы" hidden>${icon('arrow')}<span>Наверх</span></button><div id="experience-counter-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>`;
    doc.body.appendChild(mount);
    const network=$('#experience-network'),main=$('#main');
    if(main?.parentNode?.insertBefore)main.parentNode.insertBefore(network,main);
    function on(target,name,fn,options){if(target?.addEventListener){target.addEventListener(name,fn,options);events.push([target,name,fn,options]);}}
    function applyPreferences(){
      root?.setAttribute?.('data-experience-density',preferences.density);
      root?.setAttribute?.('data-experience-text',preferences.text);
      root?.setAttribute?.('data-experience-motion',preferences.motion);
      for(const key of ['density','text','motion'])if($('#experience-'+key))$('#experience-'+key).value=preferences[key];
    }
    function savePreferences(next){
      preferences=cleanPreferences(next);applyPreferences();let saved=false;
      try{if(storage){storage.setItem(PREF_KEY,JSON.stringify(preferences));saved=true;}}catch{}
      const text=saved?'Вид сохранён в этом браузере.':'Вид применён для этой вкладки. Браузер не разрешил сохранить настройки.';
      if($('#experience-settings-status'))$('#experience-settings-status').textContent=text;
      if(!saved)A.notify?.(text);
    }
    function otherDialogOpen(){return [...doc.querySelectorAll('dialog')].some(dialog=>dialog.open&&!ownDialogs.has(dialog.id));}
    function openDialog(id){
      if(otherDialogOpen()||A.beforeNavigate?.()===false)return false;
      const current=[...ownDialogs].map(value=>$('#'+value)).find(dialog=>dialog?.open);
      if(current){if(current.id===id)return true;current.experienceRestore=false;current.close();}
      opener=doc.activeElement;
      const dialog=$('#'+id);if(!dialog)return false;
      if(id==='experience-palette-dialog'){$('#experience-query').value='';renderResults();}
      if(id==='experience-settings-dialog')applyPreferences();
      dialog.experienceRestore=true;dialog.showModal();if(id==='experience-palette-dialog')$('#experience-query').focus();
      updateTop();return true;
    }
    function closeDialogs(restore=true){
      const opened=[...ownDialogs].map(id=>$('#'+id)).filter(dialog=>dialog?.open);
      for(const dialog of opened){dialog.experienceRestore=restore;dialog.close();}
      return opened.length>0;
    }
    function restoreFocus(){
      const target=opener?.isConnected?opener:$('#main');target?.focus?.({preventScroll:true});opener=null;updateTop();
    }
    function renderResults(){
      const found=paletteResults($('#experience-query')?.value,A.records?.()||[]);
      entries=found.items;active=entries.length?0:-1;
      $('#experience-results').innerHTML=entries.length?entries.map((item,index)=>`<button type="button" class="experience-result" id="experience-option-${index}" role="option" aria-selected="${index===active}" tabindex="-1" data-action="experience-pick" data-index="${index}">${icon(item.icon)}<span><b>${esc(item.label)}</b><small>${esc(item.detail)}</small></span>${icon('arrow')}</button>`).join(''):'<p class="experience-empty">Ничего не найдено. Попробуйте часть номера или другое слово из названия.</p>';
      $('#experience-results-status').textContent=found.total?'Найдено: '+found.total+(found.total>entries.length?'. Показаны первые '+entries.length+'. Уточните запрос.':'.'):'Поиск по разделам и названиям опубликованных записей.';
      reflectActive(false);
    }
    function reflectActive(scroll=true){
      for(let i=0;i<entries.length;i++)$('#experience-option-'+i)?.setAttribute('aria-selected',String(i===active));
      const input=$('#experience-query');
      if(active>=0){input?.setAttribute('aria-activedescendant','experience-option-'+active);if(scroll)$('#experience-option-'+active)?.scrollIntoView?.({block:'nearest'});}
      else input?.removeAttribute('aria-activedescendant');
    }
    function pick(index){
      const item=entries[index];if(!item)return;
      closeDialogs(false);opener=null;
      if(item.kind==='view'){A.setView?.(item.id);$('#main')?.focus?.({preventScroll:true});}
      else if(A.getRecord?.(item.id))A.openDetail?.(item.id);
      else A.notify?.('Запись уже отсутствует в текущем срезе. Обновите поиск.');
      updateTitle();
    }
    function keydown(event){
      if(event.isComposing||event.defaultPrevented)return;
      if($('#experience-palette-dialog')?.open){
        if(['ArrowDown','ArrowUp'].includes(event.key)||(event.ctrlKey&&['Home','End'].includes(event.key))){event.preventDefault();active=nextIndex(active,event.key,entries.length);reflectActive();return;}
        if(event.key==='Enter'&&doc.activeElement?.id==='experience-query'){event.preventDefault();pick(active);return;}
      }
      if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key?.toLowerCase()==='k'){
        if(otherDialogOpen())return;
        event.preventDefault();if($('#experience-palette-dialog')?.open)closeDialogs();else openDialog('experience-palette-dialog');return;
      }
      const target=doc.activeElement||event.target;
      if(event.key==='?'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(target?.tagName)&&!target?.isContentEditable&&!doc.querySelector('dialog[open]')){event.preventDefault();openDialog('experience-help-dialog');}
    }
    function updateNetwork(){
      const offline=win.navigator?.onLine===false;
      if(offline!==lastOffline)networkDismissed=false;
      const returning=lastOffline&&!offline;lastOffline=offline;
      if(offline){
        $('#experience-network-title').textContent='Браузер сообщает: нет подключения';
        $('#experience-network-text').textContent=A.state?.db?'Доступен уже загруженный срез и локальная работа. Новые сведения и внешние источники могут быть недоступны.':'Для загрузки опубликованного реестра нужно восстановить подключение.';
        network.hidden=networkDismissed;
      }else if(returning){
        $('#experience-network-title').textContent='Подключение восстановлено';
        $('#experience-network-text').textContent='Можно перечитать опубликованный срез. Возврат подключения не меняет дату исследования источников.';
        network.hidden=networkDismissed;
      }
    }
    function reducedMotion(){return preferences.motion==='reduce'||!!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
    function updateTop(){
      const top=$('#experience-top');if(!top)return;
      top.hidden=(Number(win.scrollY)||0)<650||[...doc.querySelectorAll('dialog')].some(dialog=>dialog.open);
    }
    function updateTitle(){doc.title=titleFor(A.state,A.getRecord?.(A.state?.detailId));}
    function updateCounter(field,announce=false){
      const known=TEXT_LIMITS[field.id],attr=Number(field.getAttribute?.('maxlength'));
      const limit=Number.isFinite(attr)&&attr>0?attr:known;if(!limit)return;
      let counter=$('#experience-count-'+field.id);
      if(!counter){
        if(!field.id)return;counter=doc.createElement('p');counter.id='experience-count-'+field.id;counter.className='experience-counter';
        if(field.insertAdjacentElement)field.insertAdjacentElement('afterend',counter);else return;
        const existing=(field.getAttribute?.('aria-describedby')||'').split(/\s+/).filter(Boolean);
        if(!existing.includes(counter.id))field.setAttribute('aria-describedby',[...existing,counter.id].join(' '));
      }
      const result=counterState(field.value,limit),format=value=>value.toLocaleString('ru-RU');
      const value=format(result.used)+' / '+format(result.max)+' символов'+(result.band==='over'?' · превышен допустимый объём':result.band==='full'?' · достигнут предел':result.band==='near'?' · осталось '+format(result.remaining):'');
      const previous=counter.dataset?.band;
      if(counter.textContent!==value)counter.textContent=value;
      counter.setAttribute('data-band',result.band);
      if(announce&&previous!==result.band&&result.band!=='normal'){
        const label=doc.querySelector('label[for="'+field.id+'"]')?.textContent||'Поле';
        $('#experience-counter-live').textContent=label+': '+(result.band==='over'?'объём превышен. Уменьшите текст перед сохранением.':result.band==='full'?'достигнут предел объёма.':'осталось '+result.remaining+' символов.');
      }
    }
    function attachCounters(){
      for(const id of Object.keys(TEXT_LIMITS)){const field=$('#'+id);if(field)updateCounter(field);}
    }
    function afterRender(){if(destroyed)return;applyPreferences();attachCounters();updateTitle();updateTop();updateNetwork();}
    function schedule(){if(queued||destroyed)return;queued=true;Promise.resolve().then(()=>{queued=false;if(!destroyed){attachCounters();updateTop();updateTitle();}});}
    function handleInput(event){
      if(event.target.id==='experience-query'){renderResults();return true;}
      if(Object.hasOwn(TEXT_LIMITS,event.target.id))updateCounter(event.target,true);
      return false;
    }
    function handleChange(event){
      const key=event.target.id?.replace('experience-','');
      if(!['density','text','motion'].includes(key))return false;
      savePreferences({...preferences,[key]:event.target.value});return true;
    }
    function handleAction(action){
      const key=action.dataset?.action;if(!key?.startsWith('experience-'))return false;
      if(key==='experience-palette')openDialog('experience-palette-dialog');
      if(key==='experience-help')openDialog('experience-help-dialog');
      if(key==='experience-settings')openDialog('experience-settings-dialog');
      if(key==='experience-close')closeDialogs();
      if(key==='experience-pick')pick(Number(action.dataset.index));
      if(key==='experience-reset-settings')savePreferences(DEFAULTS);
      if(key==='experience-dismiss-network'){networkDismissed=true;network.hidden=true;}
      if(key==='experience-retry')A.refresh?.();
      if(key==='experience-top'){$('#main')?.focus?.({preventScroll:true});win.scrollTo?.({top:0,behavior:reducedMotion()?'instant':'smooth'});}
      return true;
    }
    for(const id of ownDialogs){const dialog=$('#'+id);on(dialog,'close',()=>{if(dialog.experienceRestore)restoreFocus();else updateTop();});on(dialog,'cancel',event=>{event.preventDefault();dialog.experienceRestore=true;dialog.close();});}
    on(doc,'keydown',keydown);on(win,'scroll',updateTop,{passive:true});on(win,'online',updateNetwork);on(win,'offline',updateNetwork);
    on(win,'storage',event=>{if(event.key===PREF_KEY){try{preferences=cleanPreferences(JSON.parse(event.newValue||'{}'));applyPreferences();}catch{}}});
    const Observer=A.MutationObserver||win.MutationObserver;
    const observer=typeof Observer==='function'?new Observer(schedule):null;
    observer?.observe(doc.body,{childList:true,subtree:true});
    afterRender();
    function destroy(){destroyed=true;observer?.disconnect();for(const [target,name,fn,options] of events)target.removeEventListener?.(name,fn,options);network?.remove();mount.remove();}
    return {handleAction,handleInput,handleChange,afterRender,updateTitle,destroy};
  }
  return {create,cleanPreferences,paletteResults,nextIndex,counterState,titleFor,DEFAULTS,PREF_KEY};
});
