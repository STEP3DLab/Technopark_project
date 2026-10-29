'use strict';

(() => {
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a23 23 0 0 0 18 0M10 12h4v3h-4z"/>',
    court: '<path d="m3 9 9-6 9 6H3zM5 10v8M10 10v8M14 10v8M19 10v8M3 21h18M4 18h16"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7M12 3v2M3 12h2M12 19v2M19 12h2"/><circle cx="12" cy="12" r="1"/>',
    document: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8.5 11.5l2.5 2.5 5-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a3 3 0 1 1 4.8 2.4c-1.2.8-2 1.1-2 2.6M12 17h.01"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M5.2 8a8 8 0 0 1 13.5-3L20 7M4 17l1.3 2a8 8 0 0 0 13.5-3"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    external: '<path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    down: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2zM7 3v6h10V3M7 21v-8h10v8"/>',
    edit: '<path d="m16 3 5 5L8 21H3v-5zM13 6l5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2.5"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    print: '<path d="M6 9V3h12v6M6 18H3v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7h-3M6 14h12v7H6zM17 12h.01"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    inbox: '<path d="M4 4h16l2 12v4H2v-4zM2 15h6l2 3h4l2-3h6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    link: '<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M14 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0) scale(.92)"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  };
  const VIEW_NAMES = {overview:'Обзор',opportunities:'Возможности',courts:'Справочник судов',sources:'Источники и обновления',workspace:'Моя работа',proposals:'Мои предложения',guide:'Как это работает'};
  const STATUS = {open_confirmed:'Приём подтверждён',needs_review:'Проверить актуальность',historical:'Архивный пример',closed:'Завершено'};
  const WORK_STATUS = {new:'Не начата',review:'Проверяю',draft:'Готовлю КП',ready:'Готово к подаче',sent:'Подано вручную',won:'Работа получена',lost:'Не подходит',hold:'Отложено'};
  const U = window.ExpertMonitorUtils;
  const W = window.ExpertWorkspaceUtils;
  const FILTER_DEFAULTS = {...U.defaults,favorite:'all',category:'all',minAmount:'',maxAmount:''};
  const UI_KEY = 'msk-expert-monitor-ui-v2';
  const CHECKS = {stage:'Проверены актуальная стадия и приём',scope:'Понятны предмет и объём работ',eligibility:'Проверены квалификация и условия допуска',materials:'Уточнены материалы и доступ к объекту',deadline:'Подтверждены дата и время подачи',channel:'Определён канал подачи документов'};
  const STORE_KEY = 'msk-expert-monitor-workspace-v1';
  const DATA_BASE = location.hostname.toLowerCase()==='step3dlab.github.io' ? 'https://raw.githubusercontent.com/STEP3DLab/Technopark_project/main/expert-monitor/data/' : './data/';
  const state = {db:null,monitor:null,view:'overview',search:'',status:'all',region:'all',court:'all',courtType:'all',sourceType:'all',loading:false,loadError:null,monitorError:null,fetchedAt:null,dataFallback:false,form:null,detailId:null,returnFocus:null,importData:null,workStatus:'all',due:'all',sort:'priority',filterViews:{},favorite:'all',category:'all',minAmount:'',maxAmount:'',layout:'list',formBaseline:null,sourceConfig:null,pendingRecord:null};
  let storageSnapshot=null;
  let storageConflict=false;
  let storageLoadError=false;
  let local = readLocal();
  let toastTimer;
  let debounceTimer;
  const $ = (selector, root=document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<span aria-hidden="true" data-icon="${esc(name)}">${iconSvg(name)}</span>`;
  function iconSvg(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.document}</svg>`; }
  function hydrateIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>{if(!el.firstElementChild) el.innerHTML=iconSvg(el.dataset.icon);}); }
  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try { const u=new URL(url); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
  }
  function external(url,label,classes='',withIcon=true) { const u=safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="${esc(classes)}">${esc(label)}${withIcon?icon('external'):''}</a>` : `<span class="unavailable-link">${esc(label)}: нет ссылки</span>`; }
  function parsedDate(value) { if(!value)return null; const d=new Date(value); return Number.isNaN(d.getTime())?null:d; }
  function formatDate(value,withTime=false) { const d=parsedDate(value); if(!d)return 'Не опубликовано'; return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Moscow',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(d).replace(' г.','')+(withTime?' МСК':''); }
  function shortDate(value) { const d=parsedDate(value); return d?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',timeZone:'Europe/Moscow'}).format(d):'Нет даты'; }
  function moscowDateKey(value=new Date()) { return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Moscow'}).format(value); }
  function number(value) { return new Intl.NumberFormat('ru-RU').format(Number(value)||0); }
  function money(value) { return Number.isFinite(Number(value))&&value!==null&&value!==''?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:Number.isInteger(Number(value))?0:2}).format(Number(value))+' ₽':'Не опубликовано'; }
  function positiveMoney(value) { return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0; }
  function plain(value) { return Array.isArray(value)?value.join('; '):value && typeof value==='object'?Object.values(value).filter(v=>typeof v==='string').join('; '):String(value??''); }
  function verificationText(value) {
    const labels={secondary_crosschecked_primary_unavailable:'Сведения сопоставлены по нескольким вторичным источникам. Прямой доступ к первоисточнику при проверке не получен.',secondary_crosschecked:'Сведения сопоставлены по вторичным источникам. Перед участием требуется сверка с официальным извещением.',secondary_document:'Документ изучен через вторичный источник. Актуальность требуется проверить в официальной системе.',secondary_document_partial:'Документ частично проверен через вторичный источник. Полный актуальный статус не подтверждён.',official:'Проверено по официальному источнику.',verified:'Источник проверен.'};
    return labels[value]||plain(value)||'Проверка по открытым источникам; актуальность требует уточнения по материалам дела.';
  }
  function shorten(value,length=180) { const v=plain(value); return v.length>length?v.slice(0,length-1)+'…':v; }
  function deadlineDate(item) { const time=U.deadlineTime(item);return time===null?null:new Date(time); }
  function expired(item) { const d=deadlineDate(item); return ['open_confirmed','needs_review'].includes(item.status)&&d&&d<Date.now(); }
  function statusKey(item) { return expired(item)?'closed':Object.hasOwn(STATUS,item.status)?item.status:'needs_review'; }
  function statusLabel(item) { return expired(item)?(item.status==='needs_review'?'Срок по данным истёк':'Срок приёма истёк'):STATUS[statusKey(item)]; }
  function urgent(item) { const d=deadlineDate(item); return statusKey(item)==='open_confirmed'&&d&&d>=Date.now()&&(d-Date.now())<=7*86400000; }
  function statusTag(item) { return `<span class="tag ${statusKey(item)}"><span class="tag-dot"></span>${esc(statusLabel(item))}</span>`; }
  function readLocal() {
    try {
      storageSnapshot=localStorage.getItem(STORE_KEY);
      if(!storageSnapshot)return W.emptyWorkspace();
      const parsed=W.normalizeWorkspace(JSON.parse(storageSnapshot));
      if(!parsed){storageLoadError=true;return W.emptyWorkspace();}
      storageLoadError=false;return parsed;
    } catch {storageLoadError=true;return W.emptyWorkspace();}
  }
  function validBackup(raw) { return W.validBackup(raw); }
  function persist(next=local) {
    try {
      if(storageLoadError){notify('Сохранённые данные не удалось прочитать. Скачайте исходную копию в разделе «Как это работает», прежде чем восстанавливать данные.');return false;}
      if(storageConflict||localStorage.getItem(STORE_KEY)!==storageSnapshot){storageConflict=true;showStorageConflict();notify('Данные изменились в другой вкладке. Скачайте свои правки и перечитайте сохранённые данные.');return false;}
      const checked=W.normalizeWorkspace(next);
      if(!checked){notify('Данные не сохранены: проверьте длину полей, цену и даты.');return false;}
      const serialized=JSON.stringify(checked);localStorage.setItem(STORE_KEY,serialized);
      storageSnapshot=serialized;local=checked;updateNav();return true;
    } catch {notify('Браузер не сохранил данные. Скачайте резервную копию JSON.');return false;}
  }
  function readUI() {
    try {
      const prefs=JSON.parse(localStorage.getItem(UI_KEY)||'{}');
      if(['list','table'].includes(prefs.layout))state.layout=prefs.layout;
      if(prefs.views&&typeof prefs.views==='object')for(const [view,filters] of Object.entries(prefs.views))if(Object.hasOwn(VIEW_NAMES,view))state.filterViews[view]=cleanFilters(filters);
    } catch {}
  }
  function cleanFilters(filters) {
    const safe={...FILTER_DEFAULTS,courtType:'all'};
    if(filters&&typeof filters==='object')for(const key of Object.keys(safe))if(typeof filters[key]==='string'&&filters[key].length<=1000)safe[key]=filters[key];
    return safe;
  }
  function saveUI() {
    state.filterViews[state.view]={...filterSnapshot(),courtType:state.courtType};
    try{localStorage.setItem(UI_KEY,JSON.stringify({layout:state.layout,views:state.filterViews}));}catch{}
  }
  function draftDirty() {return !!state.form&&W.isDraftDirty(captureForm(),state.formBaseline||newForm());}
  function replaceDraft(form) {state.form={...form};state.formBaseline={...form};}
  function allowDraftReplacement() {return !draftDirty()||window.confirm('Текущий текст предложения ещё не сохранён. Заменить его? Нажмите «Отмена», чтобы сначала сохранить черновик.');}
  function recordUrl(id) {const url=new URL(location.href);url.search='';url.hash='opportunities?record='+encodeURIComponent(id);return url.href;}
  function routeHash(view=state.view,id=state.detailId) {return '#'+view+(id?'?record='+encodeURIComponent(id):'');}
  function readRoute() {
    const [view,query='']=location.hash.slice(1).split('?');
    return {view:Object.hasOwn(VIEW_NAMES,view)?view:'overview',id:new URLSearchParams(query).get('record')};
  }
  async function copyText(text,success) {
    try{await navigator.clipboard.writeText(text);notify(success);}
    catch{const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();let ok=false;try{ok=document.execCommand('copy');}catch{}input.remove();notify(ok?success:'Копирование недоступно в этом браузере.');}
  }
  function publicSummary(o) {
    return [o.title,'№ '+(o.caseNumber||'не указан'),courtName(o),'Объект: '+(o.region||'не уточнён'),'Статус: '+statusLabel(o),o.deadline?'Срок по источнику: '+formatDate(deadlineDate(o),true):'Срок не опубликован',positiveMoney(o.amountRub)?money(o.amountRub)+' — '+(o.amountLabel||o.amountType):'Цена не опубликована','Проверено: '+formatDate(o.checkedAt),'Источник: '+(safeUrl(o.sourceUrl)||'не указан'),'Карточка: '+recordUrl(o.id)].join('\n');
  }

  function storageConflictMarkup() {
    return `<div class="source-info-strip freshness-warning" id="storage-conflict-banner">${icon('shield')}<div><h3>Рабочие данные изменились в другой вкладке</h3><p>Сохранение здесь приостановлено, чтобы не удалить чужие изменения. Ваш открытый редактор сохранён в памяти этой вкладки. Скачайте резервную копию с текущими правками, затем перечитайте сохранённые данные.</p><div class="button-row" style="margin-top:11px"><button class="button secondary small" data-action="backup">${icon('down')}Скачать мои правки</button><button class="button secondary small" data-action="reload-workspace">${icon('refresh')}Перечитать сохранённые данные</button></div></div></div>`;
  }
  function showStorageConflict() {
    if(storageConflict&&!$('#storage-conflict-banner'))$('#main').insertAdjacentHTML('afterbegin',storageConflictMarkup());
  }
  function exportWorkspaceSnapshot() {
    const snapshot=structuredClone(local);const f=captureForm();
    if(f&&(f.id||draftDirty())){
      const draft={...f,id:f.id||'draft-unsaved-'+Date.now().toString(36),updatedAt:new Date().toISOString()};
      const i=snapshot.drafts.findIndex(d=>d.id===draft.id);if(i>=0)snapshot.drafts[i]=draft;else snapshot.drafts.push(draft);
    }
    if(state.detailId&&$('#detail-note'))applyDetail(snapshot);
    snapshot.exportedAt=new Date().toISOString();return snapshot;
  }

  function notify(message) { const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},5000); }
  function download(name,content,type='text/plain;charset=utf-8') {
    const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function safeFilename(value) { return String(value||'предложение').replace(/[^a-zа-яё0-9._-]/gi,'_').slice(0,100); }
  function sourceRows() {
    const rows=(state.sourceConfig||state.db?.sources||[]).map(s=>({...s}));
    (state.db?.sources||[]).forEach(s=>{const i=rows.findIndex(x=>x.id===s.id);if(i<0)rows.push({...s});});
    (state.monitor?.sources||[]).forEach(s=>{const i=rows.findIndex(x=>(s.id&&x.id===s.id)||(s.url&&x.url===s.url));if(i>=0)rows[i]={...rows[i],...s};else rows.push({...s});});
    return rows;
  }
  function isAutomaticSource(source) {
    if(typeof source.automatic==='boolean')return source.automatic;
    if(typeof source.autoFetch==='boolean')return source.autoFetch;
    return !!source.checkedAt&&!String(source.status).includes('manual');
  }

  function sourceHealth(source) {
    const s=String(source.status||'').toLowerCase();
    if(s==='changed')return {text:'Доступен · изменения',className:'healthy'};
    if(s==='not_checked')return {text:'Не проверено',className:'closed'};
    if(/block|captcha|challenge|forbid|denied|403|429/.test(s)) return {text:'Доступ ограничен',className:'warning'};
    if(/error|fail|timeout|unavailable/.test(s)||Number(source.httpStatus)>=400) return {text:'Ошибка проверки',className:'error'};
    if(/manual|browser|review|restricted/.test(s))return {text:'Ручная проверка',className:'warning'};
    if(['ok','healthy','success','accessible','available','checked','fetched','online'].includes(s))return {text:'Источник доступен',className:'healthy'};
    if(/pending|unchecked|not_run|unknown|seed|idle|planned/.test(s)||!s)return {text:'Не проверено',className:'closed'};
    return {text:'Проверить статус',className:'warning'};
  }
  function sourceTag(s) { const h=sourceHealth(s);return `<span class="tag ${h.className}">${esc(h.text)}</span>`; }
  function monitoringTimeLabel(prefix='Проверка источников') {
    if(state.monitor?.mode==='offline')return 'Сетевой запуск ещё не подтверждён';
    return state.monitor?.lastRunAt?prefix+': '+formatDate(state.monitor.lastRunAt,true):'Время сетевой проверки не подтверждено';
  }
  function freshnessReasons() {
    const reasons=[];const now=Date.now();const asOf=parsedDate(state.db?.meta?.asOf);const run=parsedDate(state.monitor?.lastRunAt);
    if(asOf&&now-asOf.getTime()>2*86400000)reasons.push('Исследовательскому срезу больше двух дней. Актуальность дел и сроков требует повторной сверки.');
    if(state.monitor?.mode!=='offline'&&run&&now-run.getTime()>3*3600000)reasons.push('Последнему сетевому запуску больше трёх часов. Доступность источников может измениться.');
    return reasons;
  }
  function freshnessBanner() {
    const reasons=freshnessReasons();if(!reasons.length)return '';
    return `<div class="source-info-strip freshness-warning">${icon('clock')}<div><h3>Устаревающий срез</h3><p>${esc(reasons.join(' '))} Успешная загрузка JSON подтверждает доступность файла, а не свежесть судебных материалов.</p></div></div>`;
  }
  function automationPanel() {
    const a=state.db?.meta?.automation||{};const rows=sourceRows(),auto=rows.filter(isAutomaticSource);
    const configured=a.researchTaskStatus==='enabled';
    return `<div class="source-info-strip">${icon('radar')}<div><h3>${configured?'Регулярная сверка настроена':'Исследовательская сверка требует настройки'}</h3><p>${esc(a.researchCadence||'Периодичность содержательного исследования не указана.')} Последний результат: ${esc(researchLabel())}. Сетевой сборщик проверяет ${auto.length} источника из ${rows.length}; остальные требуют ручной работы. Дата результата показывает фактическую свежесть проверки.</p></div></div>`;
  }

  function records() { return state.db?.opportunities||[]; }
  function getRecord(id) { return records().find(o=>o.id===id); }
  function courtName(record) { return record.court||state.db?.courts?.find(c=>c.id===record.courtId)?.name||'Суд не указан'; }
  function sortedRecords() { return U.sortItems(records(),state.sort); }
  function filterRecords() {
    const terms=state.search.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').split(/\s+/).filter(Boolean);
    return sortedRecords().filter(o=>{
      const text=[o.title,o.caseNumber,courtName(o),o.category,o.summary,o.region,local.notes[o.id]?.text,local.tasks[o.id]?.text].map(plain).join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
      const deadline=U.deadlineTime(o);
      const dueMatch=state.due==='all'||(state.due==='none'?deadline===null:state.due==='expired'?deadline!==null&&deadline<Date.now():U.dueSoon(o,Number(state.due)));
      return (state.status==='all'||statusKey(o)===state.status)&&(state.region==='all'||U.normalizeRegion(o)===state.region)&&(state.court==='all'||courtName(o)===state.court)&&(state.sourceType==='all'||o.sourceType===state.sourceType)&&U.matchesWork(o,local.work,state.workStatus)&&dueMatch&&(state.favorite==='all'||local.favorites.includes(o.id))&&(state.category==='all'||categoryKey(o)===state.category)&&U.matchesAmount(o,{min:state.minAmount,max:state.maxAmount})&&terms.every(t=>text.includes(t));
    });
  }
  function categoryKey(o) {
    const text=(o.category||o.title||'').toLocaleLowerCase('ru-RU');
    if(/землеуст|границ|участк/.test(text))return 'land';
    if(/проектир|документац/.test(text))return 'design';
    if(/обследован|технического состояния/.test(text))return 'survey';
    return 'expertise';
  }
  function favoriteButton(o) {const active=local.favorites.includes(o.id);return `<button class="favorite-button ${active?'is-favorite':''}" data-action="favorite" data-id="${esc(o.id)}" aria-pressed="${active}" aria-label="${active?'Убрать из избранного':'В избранное'}: ${esc(o.caseNumber||o.title)}" title="${active?'Убрать из избранного':'В избранное'}">${icon('star')}</button>`;}
  function deadlineLabel(o) {
    const d=deadlineDate(o);if(!d)return 'Срок не указан';
    const key=moscowDateKey(d),today=moscowDateKey(),tomorrow=moscowDateKey(new Date(Date.now()+86400000));
    const prefix=key===today?'Сегодня':key===tomorrow?'Завтра':shortDate(d);
    const time=typeof o.deadline==='string'&&o.deadline.includes('T')?new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(d):'до конца дня';
    return prefix+' · '+time+' МСК';
  }
  function localTaskTag(o) {const task=local.tasks[o.id];if(!task?.text&&!task?.dueDate)return '';const late=task.dueDate&&task.dueDate<moscowDateKey();return `<span class="tag ${late?'urgent':'blue'}">${icon('clock')}${esc(task.dueDate?shortDate(task.dueDate):'Следующий шаг')}${late?' · просрочено':''}</span>`;}
  function currentFilters() {return Object.entries(filterSnapshot()).filter(([k,v])=>v!==FILTER_DEFAULTS[k]);}
  function filterSummary() {
    const labels={search:'Поиск',status:'Статус',region:'Объект',court:'Получатель',sourceType:'Тип',workStatus:'Моя работа',due:'Срок',sort:'Порядок',favorite:'Избранное',category:'Профиль',minAmount:'Сумма от',maxAmount:'Сумма до'};
    const values={...STATUS,...WORK_STATUS,moscow:'Москва',oblast:'Московская область',other:'Другой регион',unknown:'Место не уточнено',court_decision:'Судебные дела',procurement_adjacent:'Смежные закупки','3':'72 часа','7':'7 дней',none:'Без срока',expired:'Срок истёк',deadline:'Ближайший срок',newest:'Новые публикации',checked:'Недавно проверенные','amount-desc':'Сумма по убыванию','amount-asc':'Сумма по возрастанию',yes:'Да',active:'В работе',survey:'Обследование',design:'Проектирование',land:'Землеустройство',expertise:'Экспертиза'};
    const active=currentFilters();
    return active.length?`<div class="filter-summary" aria-label="Применённые фильтры">${active.map(([key,value])=>`<button class="filter-summary-chip" data-action="clear-filter" data-filter="${esc(key)}" aria-label="Убрать фильтр ${esc(labels[key])}">${esc(labels[key])}: ${esc(shorten(values[value]||value,60))}${icon('close')}</button>`).join('')}<button class="link-button" data-action="reset-filters">Сбросить всё</button></div>`:'';
  }

  function filterSnapshot(){return Object.fromEntries(Object.keys(FILTER_DEFAULTS).map(k=>[k,state[k]]));}
  function focusQueue() {
    const soon=records().filter(o=>U.dueSoon(o)).length;
    const working=records().filter(o=>U.matchesWork(o,local.work,'active')).length;
    const review=records().filter(o=>statusKey(o)==='needs_review').length;
    return `<section class="focus-queue" aria-label="Приоритеты на сегодня"><div class="focus-intro"><p class="eyebrow">БЫСТРЫЙ СТАРТ</p><h2>На что обратить внимание</h2><p>Сроки — по опубликованному срезу, время московское.</p></div><button class="focus-item" data-action="quick-filter" data-preset="soon"><span class="focus-count">${soon}</span><span><b>Срок до 72 часов</b><small>Включая неподтверждённые сигналы</small></span>${icon('arrow')}</button><button class="focus-item" data-action="quick-filter" data-preset="review"><span class="focus-count">${review}</span><span><b>Проверить актуальность</b><small>Открыть материал и уточнить стадию</small></span>${icon('arrow')}</button><button class="focus-item" data-action="quick-filter" data-preset="work"><span class="focus-count">${working}</span><span><b>Моя работа</b><small>Проверка и подготовка предложения</small></span>${icon('arrow')}</button></section>`;
  }
  function workFilters(){
    return `<div class="work-filters"><label>Моя работа<select class="select-field" id="work-status-filter">${[['all','Все рабочие статусы'],['active','В работе'],...Object.entries(WORK_STATUS)].map(([v,t])=>option(v,t,state.workStatus)).join('')}</select></label><label>Срок по источнику<select class="select-field" id="due-filter">${[['all','Любой срок'],['3','В ближайшие 72 часа'],['7','В ближайшие 7 дней'],['none','Срок не опубликован'],['expired','Срок по данным истёк']].map(([v,t])=>option(v,t,state.due)).join('')}</select></label><label>Порядок записей<select class="select-field" id="sort-filter">${[['priority','Сначала актуальные'],['deadline','Ближайший срок'],['newest','Новые публикации'],['checked','Недавно проверенные'],['amount-desc','Сумма по убыванию'],['amount-asc','Сумма по возрастанию']].map(([v,t])=>option(v,t,state.sort)).join('')}</select></label><label>Сумма от, ₽<input class="select-field" id="amount-min" type="number" min="0" inputmode="numeric" placeholder="Любая" value="${esc(state.minAmount)}"></label><label>до, ₽<input class="select-field" id="amount-max" type="number" min="0" inputmode="numeric" placeholder="Любая" value="${esc(state.maxAmount)}"></label></div><p class="amount-filter-hint">Отбор по сумме учитывает только цену закупки или стоимость экспертизы. Сумма иска исключена.</p>`;
  }

  function updateNav() {
    $('#nav-opportunities').textContent=state.db?number(records().filter(o=>statusKey(o)==='open_confirmed'||statusKey(o)==='needs_review').length):'—';
    $('#nav-drafts').textContent=number(local.drafts.length);
    if($('#nav-work'))$('#nav-work').textContent=number(records().filter(o=>U.matchesWork(o,local.work,'active')).length);
    document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===state.view;if(el.classList.contains('nav-item')){el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}});
    $('#breadcrumb-view').textContent=VIEW_NAMES[state.view];
  }
  function updateMeta() {
    if(!state.db)return;
    const meta=state.db.meta||{};
    const stale=freshnessReasons().length>0;
    const tag=$('#snapshot-tag');tag.innerHTML=`<span class="status-dot ${state.monitorError||stale?'warning':'neutral'}"></span>Срез ${esc(shortDate(meta.asOf||meta.generatedAt))}${stale?' · устаревает':''}`;
    const sheet=$('#sheet-link'),url=safeUrl(meta.sheetUrl);sheet.hidden=!url;if(url)sheet.href=url;
    $('#footer-sync').textContent=monitoringTimeLabel();
    updateNav();
  }
  async function fetchJson(path) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),22000);
    try{const res=await fetch(path,{cache:'no-store',signal:controller.signal});if(!res.ok)throw new Error('HTTP '+res.status);return await res.json();}finally{clearTimeout(timer);}
  }
  function validPublished(name,data) {
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    if(!object(data))return false;
    if(name==='registry.json')return object(data.meta)&&Array.isArray(data.courts)&&Array.isArray(data.opportunities)&&data.courts.every(c=>object(c)&&typeof c.id==='string'&&typeof c.name==='string')&&data.opportunities.every(o=>object(o)&&typeof o.id==='string'&&typeof o.status==='string')&&(!data.sources||Array.isArray(data.sources)&&data.sources.every(object));
    return Array.isArray(data.sources)&&data.sources.every(object)&&(!data.newCandidates||Array.isArray(data.newCandidates)&&data.newCandidates.every(object));
  }
  async function fetchPublished(name) {
    async function read(base){const data=await fetchJson(base+name);if(!validPublished(name,data))throw new Error('Неверный формат '+name);return data;}
    try{return await read(DATA_BASE);}
    catch(error){if(DATA_BASE==='./data/')throw error;const data=await read('./data/');state.dataFallback=true;return data;}
  }
  async function loadData(userInitiated=false) {
    if(state.loading)return;
    state.loading=true;state.dataFallback=false;$('#refresh-button').classList.add('spinning');$('#refresh-button').disabled=true;
    try {
      const [dbResult,monitorResult,configResult]=await Promise.allSettled([fetchPublished('registry.json'),fetchPublished('monitoring.json'),fetchJson('./data/source-config.json')]);
      if(configResult.status==='fulfilled'&&Array.isArray(configResult.value)&&configResult.value.every(x=>x&&typeof x==='object'))state.sourceConfig=configResult.value;
      if(dbResult.status==='fulfilled'){
        state.db=dbResult.value;state.loadError=null;state.fetchedAt=new Date().toISOString();
      }else state.loadError=String(dbResult.reason?.message||dbResult.reason);
      if(monitorResult.status==='fulfilled'){
        state.monitor=monitorResult.value;state.monitorError=null;
      }else state.monitorError='Не удалось загрузить журнал автоматических проверок.';
      updateMeta();
      const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||$('#detail-dialog').open;
      if((!editing&&state.view!=='proposals')||!$('#main').querySelector('[data-page]'))render();
      if(state.pendingRecord&&state.db){const id=state.pendingRecord;state.pendingRecord=null;if(getRecord(id))openDetail(id);else notify('Запись по этой ссылке не найдена в текущем реестре.');}
      if(userInitiated)notify(state.loadError?'Новый срез не загружен. '+(state.db?'На экране предыдущие данные.':'Проверьте доступ к файлам данных.'):'Опубликованный срез перечитан. Дата исследования указана отдельно.');
    } catch(error) {
      state.loadError=String(error?.message||error);notify('Обновление не завершено. Предыдущие данные и ваши правки сохранены.');
    } finally {
      state.loading=false;$('#refresh-button').classList.remove('spinning');$('#refresh-button').disabled=false;
    }
  }
  function setView(view,{reset=true}={}) {
    if(!Object.hasOwn(VIEW_NAMES,view))view='overview';
    if(state.view==='proposals')captureForm();
    state.filterViews[state.view]={...filterSnapshot(),courtType:state.courtType};
    state.view=view;
    if(reset)Object.assign(state,FILTER_DEFAULTS,{courtType:'all'},state.filterViews[view]||{});
    saveUI();if(location.hash!==routeHash(view,null))history.replaceState(null,'',routeHash(view,null));
    closeMenu();render();window.scrollTo({top:0,behavior:'instant'});
  }
  function heading(eyebrow,title,description,actions='') {
    return `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="page-description">${esc(description)}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;
  }
  function emptyState(title,description,action='') { return `<div class="empty-state"><div class="empty-icon">${icon('inbox')}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`; }
  function metrics() {
    const items=[
      ['Открытых судебных запросов',records().filter(o=>o.sourceType==='court_decision'&&statusKey(o)==='open_confirmed').length,'court','Подтверждённых первоисточником','court'],
      ['Сигналов для проверки',records().filter(o=>statusKey(o)==='needs_review').length,'search','Проверить актуальный приём','review'],
      ['Срок до 72 часов',records().filter(o=>U.dueSoon(o)).length,'clock','По датам найденных источников','soon'],
      ['В моей работе',records().filter(o=>U.matchesWork(o,local.work,'active')).length,'board','Проверка, подготовка и подача','work']
    ];
    return `<div class="metrics">${items.map(([label,n,i,foot,preset])=>`<button class="metric-card metric-action" data-action="quick-filter" data-preset="${preset}"><span class="metric-top"><span>${esc(label)}</span><span class="metric-icon">${icon(i)}</span></span><span class="metric-number">${number(n)}</span><span class="metric-foot">${esc(foot)}</span></button>`).join('')}</div>`;
  }

  function amountBlock(o,compact=false) {
    if(!positiveMoney(o.amountRub))return `<div class="amount">Цена не указана</div><div class="amount-label">Стоимость экспертизы не опубликована</div>`;
    const labels={expert_fee:'Опубликованная стоимость экспертизы',claim:'Сумма иска · не бюджет экспертизы',contract:'Цена контракта / закупки',not_published:'Назначение суммы требует проверки'};
    return `<div class="amount">${esc(money(o.amountRub))}</div><div class="amount-label">${esc(compact?(labels[o.amountType]||'Тип суммы уточняется'):(o.amountLabel||labels[o.amountType]||'Тип суммы уточняется'))}</div>`;
  }
  function leadRows(items) {
    if(!items.length)return emptyState('По этому отбору записей нет','Измените фильтры или откройте всю базу. Данные о приёме нужно сверять с первоисточником.',state.view==='opportunities'?'<button class="button secondary" data-action="reset-filters">Сбросить фильтры</button>':'');
    return `<ul class="lead-list">${items.map(o=>`<li class="lead-row" data-open-id="${esc(o.id)}">${favoriteButton(o)}<div class="lead-main"><div class="lead-top"><span class="case-number">${esc(o.caseNumber||'Публичный запрос')}</span>${statusTag(o)}<span class="tag ${o.sourceType==='procurement_adjacent'?'blue':''}">${o.sourceType==='procurement_adjacent'?'Смежная закупка':'Судебное дело'}</span></div><h3 class="lead-title"><button class="lead-open" type="button" data-action="open-detail" data-id="${esc(o.id)}">${esc(o.title||o.category||'Судебно-строительная экспертиза')}</button></h3><div class="lead-court">${icon(o.sourceType==='procurement_adjacent'?'briefcase':'court')}<span>${esc(courtName(o))}</span></div><p class="lead-summary">${esc(shorten(o.summary,150))}</p><div class="lead-aux"><span>${icon('pin')}${esc(U.geographyLabel(U.normalizeRegion(o)))}</span>${local.work[o.id]?`<span class="tag blue">${esc(WORK_STATUS[local.work[o.id]])}</span>`:''}${localTaskTag(o)}${local.notes[o.id]?.text?`<span title="Есть личная заметка">${icon('edit')}Есть заметка</span>`:''}</div></div><div class="lead-meta">${amountBlock(o)}<div class="lead-date">${esc(deadlineLabel(o))}</div>${U.dueSoon(o)?`<span class="tag urgent">Срок до 72 ч · проверить</span>`:''}${positiveMoney(local.notes[o.id]?.proposalRub)?`<div class="own-price">Моя цена: ${esc(money(local.notes[o.id].proposalRub))}</div>`:''}</div></li>`).join('')}</ul>`;
  }
  function tableRows(items) {
    if(!items.length)return leadRows(items);
    return `<div class="records-table-wrap" tabindex="0" role="region" aria-label="Реестр, таблица с горизонтальной прокруткой"><table class="records-table"><caption class="sr-only">Найденные дела и закупки</caption><thead><tr><th scope="col"><span class="sr-only">Избранное</span></th><th scope="col">Дело / предмет</th><th scope="col">Объект</th><th scope="col">Статус источника</th><th scope="col">Срок, МСК</th><th scope="col">Опубликованная сумма</th><th scope="col">Моя работа</th></tr></thead><tbody>${items.map(o=>`<tr data-open-id="${esc(o.id)}"><td>${favoriteButton(o)}</td><td><span class="case-number">${esc(o.caseNumber||'Запрос')}</span><button class="lead-open" data-action="open-detail" data-id="${esc(o.id)}">${esc(o.title)}</button><small>${o.sourceType==='procurement_adjacent'?'Смежная закупка':'Судебное дело'}</small></td><td>${esc(U.geographyLabel(U.normalizeRegion(o)))}</td><td>${statusTag(o)}</td><td><span class="${U.dueSoon(o)?'deadline-urgent':''}">${esc(deadlineLabel(o))}</span></td><td>${amountBlock(o,true)}</td><td><span class="tag ${local.work[o.id]?'blue':''}">${esc(WORK_STATUS[local.work[o.id]||'new'])}</span>${positiveMoney(local.notes[o.id]?.proposalRub)?`<small>Моя цена: ${esc(money(local.notes[o.id].proposalRub))}</small>`:''}${localTaskTag(o)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function resultsMarkup(items) {return state.layout==='table'?tableRows(items):leadRows(items);}
  function researchTime() {const value=state.db.meta?.reviewState?.lastResearchAt;return parsedDate(value)?value:null;}
  function researchLabel() {const value=researchTime();return value?formatDate(value,String(value).includes('T')):'Не подтверждена';}
  function reviewHealth() {
    return `<div class="review-health"><div class="review-health-item">${icon('search')}<span><b>Содержательная проверка</b><span>${esc(researchLabel())}</span></span></div><div class="review-health-item">${icon('radar')}<span><b>Техническая проверка сайтов</b><span>${state.monitor?.mode==='offline'?'Нет сетевого результата':esc(formatDate(state.monitor?.lastRunAt,true))}</span></span></div>${state.view!=='sources'?`<button class="link-button" data-view="sources">Что удалось проверить${icon('arrow')}</button>`:''}</div>`;
  }
  function followupList(limit=6) {
    const list=records().filter(o=>local.tasks[o.id]?.text||local.tasks[o.id]?.dueDate).sort((a,b)=>(local.tasks[a.id].dueDate||'9999').localeCompare(local.tasks[b.id].dueDate||'9999')).slice(0,limit);
    if(!list.length)return `<div class="followup-empty"><p>Назначьте следующий шаг и дату в карточке. Задачи появятся здесь.</p><button class="link-button" data-view="opportunities">Выбрать запись${icon('arrow')}</button></div>`;
    return `<div class="followup-list">${list.map(o=>{const t=local.tasks[o.id],late=t.dueDate&&t.dueDate<moscowDateKey();return `<button class="followup-item" data-action="open-detail" data-id="${esc(o.id)}"><span class="followup-date ${late?'overdue':''}">${t.dueDate?esc(shortDate(t.dueDate)):'Без даты'}${late?'<small>просрочено</small>':''}</span><span><b>${esc(t.text||'Проверить запись')}</b><small>№ ${esc(o.caseNumber||'не указан')}</small></span>${icon('arrow')}</button>`;}).join('')}</div>`;
  }

  function overview() {
    const active=records().filter(o=>['open_confirmed','needs_review'].includes(statusKey(o)));
    const soon=U.sortItems(active,'deadline').filter(o=>U.dueSoon(o,7)).slice(0,3);
    const items=U.sortItems(active,'deadline').slice(0,5);
    const rows=sourceRows(),auto=rows.filter(isAutomaticSource);
    const sourceHealthy=auto.filter(s=>sourceHealth(s).className==='healthy').length;
    return `<section class="overview-intro"><div><p class="overview-date">${esc(new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(new Date()))} · Москва</p><h1 class="overview-title">Дела, сроки и следующие действия</h1><p class="overview-description">Рабочая панель судебных экспертиз и смежных обследований. От проверки источника до собственного предложения.</p><div class="overview-meta"><span>${records().length} записей в базе</span><span>${state.db.courts.length} судов в справочнике</span><span>Рабочие данные в вашем браузере</span></div></div><div class="heading-actions"><button class="button primary" data-view="opportunities">Открыть реестр${icon('arrow')}</button><button class="button secondary" data-view="workspace">${icon('board')}Моя работа</button></div></section>${reviewHealth()}${metrics()}
    ${soon.length?`<section class="deadline-section"><div class="panel-heading"><div><h2>Ближайшие сроки</h2><p>Сроки из источников. Приём и возможное продление нужно подтвердить.</p></div><button class="link-button" data-action="quick-filter" data-preset="soon">До 72 часов${icon('arrow')}</button></div><div class="deadline-strip">${soon.map(o=>`<article class="deadline-card"><div class="deadline-card-top"><span class="tag urgent">${esc(deadlineLabel(o))}</span>${favoriteButton(o)}</div><button class="lead-open" data-action="open-detail" data-id="${esc(o.id)}">${esc(o.title)}</button><span class="case-number">№ ${esc(o.caseNumber)}</span><div class="deadline-card-bottom"><span>${esc(U.geographyLabel(U.normalizeRegion(o)))}</span><span>${U.publishedBudget(o)!==null?esc(money(o.amountRub))+' · по источнику':'Цена не указана'}</span></div></article>`).join('')}</div></section>`:''}
    <div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h2>Очередь проверки<span class="panel-count">${active.length}</span></h2><p>Сначала ближайший срок. Архивные и завершённые записи доступны в реестре.</p></div><button class="link-button" data-action="quick-filter" data-preset="review">Весь отбор${icon('arrow')}</button></div>${leadRows(items)}<div class="panel-bottom"><span>Исследовательский срез: ${esc(formatDate(state.db.meta?.asOf))}</span><span>${items.length} из ${active.length} актуальных сигналов</span></div></section><aside class="side-stack"><section class="panel"><div class="compact-heading"><h2>Следующие действия</h2>${icon('clock')}</div>${followupList(4)}</section><section class="panel"><div class="compact-heading"><h2>Контроль источников</h2>${icon('radar')}</div><div class="source-summary"><div class="source-coverage"><b>${sourceHealthy} / ${auto.length}</b><span>автоматических источников доступны</span></div><p class="source-time">${rows.length-auto.length} источников требуют отдельной ручной проверки. Успешное открытие сайта не подтверждает проверку его дел.</p><button class="link-button" data-view="sources">Открыть журнал${icon('arrow')}</button></div></section><section class="task-card">${icon('star')}<h3>${local.favorites.length?'В избранном: '+local.favorites.length:'Соберите свой список'}</h3><p>Отмечайте интересные записи звездой. Они останутся под рукой в разделе «Моя работа».</p><button class="button" data-action="quick-filter" data-preset="favorites">Открыть избранное${icon('arrow')}</button></section></aside></div>`;
  }

  function option(value,label,selected){return `<option value="${esc(value)}"${selected===value?' selected':''}>${esc(label)}</option>`;}
  function searchField(placeholder) { return `<label class="search-field">${icon('search')}<span class="sr-only">Поиск</span><input id="search-input" type="search" value="${esc(state.search)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`; }
  function opportunities() {
    const courts=[...new Set(records().map(courtName))].sort((a,b)=>a.localeCompare(b,'ru'));
    const list=filterRecords();
    return heading('Реестр / поиск и отбор','Дела и запросы','Отберите записи по месту объекта, сроку и профилю. Отметьте интересное и продолжите проверку в карточке.',`<button class="button secondary" data-action="export-csv">${icon('down')}CSV текущего отбора</button>`)+
    `<section class="panel"><div class="registry-toolbar"><div class="saved-filters"><button class="filter-chip ${state.favorite==='yes'?'active':''}" data-action="toggle-favorites" aria-pressed="${state.favorite==='yes'}">${icon('star')}Избранное<span>${local.favorites.length}</span></button><label class="sr-only" for="saved-filter-select">Сохранённые подборки</label><select class="select-field" id="saved-filter-select"><option value="">Мои подборки</option>${local.savedFilters.map(f=>option(f.id,f.name,'')).join('')}</select><button class="link-button" data-action="save-filter">${icon('save')}Сохранить отбор</button>${local.savedFilters.length?'<button class="icon-button" data-action="manage-filters" aria-label="Управление подборками" title="Управление подборками">'+icon('edit')+'</button>':''}</div><div class="view-switch" role="group" aria-label="Вид реестра"><button class="${state.layout==='list'?'active':''}" data-action="layout" data-layout="list" aria-pressed="${state.layout==='list'}">${icon('menu')}Список</button><button class="${state.layout==='table'?'active':''}" data-action="layout" data-layout="table" aria-pressed="${state.layout==='table'}">${icon('table')}Таблица</button></div></div><div class="filter-bar">${searchField('Номер, предмет, получатель или моя заметка')}<label class="sr-only" for="region-filter">Место объекта</label><select class="select-field" id="region-filter">${option('all','Все регионы объекта',state.region)}${['moscow','oblast','other','unknown'].map(v=>option(v,U.geographyLabel(v),state.region)).join('')}</select><label class="sr-only" for="source-type-filter">Тип записи</label><select class="select-field" id="source-type-filter">${option('all','Все типы записей',state.sourceType)}${option('court_decision','Судебные дела',state.sourceType)}${option('procurement_adjacent','Смежные закупки',state.sourceType)}</select><label class="sr-only" for="category-filter">Профиль работ</label><select class="select-field" id="category-filter">${[['all','Все профили'],['survey','Обследование'],['design','Проектирование'],['land','Землеустройство'],['expertise','Экспертиза']].map(([v,t])=>option(v,t,state.category)).join('')}</select></div><details class="advanced-filters"${state.court!=='all'||state.workStatus!=='all'||state.due!=='all'||state.sort!=='priority'||state.minAmount||state.maxAmount?' open':''}><summary>${icon('filter')}Дополнительные фильтры и сортировка</summary><div class="advanced-filter-body"><label>Суд или заказчик<select class="select-field" id="court-filter">${option('all','Все получатели',state.court)}${courts.map(v=>option(v,v,state.court)).join('')}</select></label>${workFilters()}</div></details><div class="filter-chips" aria-label="Фильтр статуса">${[['all','Все записи'],...Object.entries(STATUS)].map(([key,label])=>`<button class="filter-chip ${state.status===key?'active':''}" type="button" data-action="filter-status" data-status="${esc(key)}" aria-pressed="${state.status===key}">${esc(label)}<span>${key==='all'?records().length:records().filter(o=>statusKey(o)===key).length}</span></button>`).join('')}</div><div id="filter-summary">${filterSummary()}</div><div id="lead-results">${resultsMarkup(list)}</div><div class="panel-bottom"><span id="lead-result-count" role="status" aria-live="polite">Найдено ${number(list.length)} из ${number(records().length)}</span><span>Звезда — избранное · карточка — источники и работа</span></div></section><p class="result-caption">Поиск поддерживает несколько слов в любом порядке и ваши личные заметки. Подборки и выбранный вид сохраняются в этом браузере.</p>`;
  }
  function workspace() {
    const all=records().filter(o=>local.favorites.includes(o.id)||local.work[o.id]||local.tasks[o.id]?.text||local.tasks[o.id]?.dueDate);
    const terms=state.search.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').split(/\s+/).filter(Boolean);
    const list=all.filter(o=>terms.every(t=>[o.title,o.caseNumber,local.tasks[o.id]?.text,local.notes[o.id]?.text].join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').includes(t)));
    const ownTotal=all.filter(o=>U.matchesWork(o,local.work,'active')).reduce((sum,o)=>sum+(Number(local.notes[o.id]?.proposalRub)||0),0);
    const groups=[['review','Отбор и проверка',['new','review']],['draft','Подготовка КП',['draft','ready']],['sent','Предложение подано',['sent']],['result','Результат и пауза',['won','lost','hold']]];
    return heading('Личная рабочая область','Моя работа','Выбранные записи, этапы и следующие действия. Статус «Подано вручную» — ваша отметка о подаче вне панели.',`<button class="button secondary" data-action="backup">${icon('down')}Резервная копия</button><button class="button primary" data-view="opportunities">Добавить из реестра${icon('plus')}</button>`)+
    `<div class="pipeline-stats"><div><b>${all.length}</b><span>записей в работе и избранном</span></div><div><b>${all.filter(o=>U.matchesWork(o,local.work,'active')).length}</b><span>на активных этапах</span></div><div><b>${local.drafts.length}</b><span>сохранённых предложений</span></div><div><b>${ownTotal?esc(money(ownTotal)):'—'}</b><span>мои оценки активных работ · не выручка</span></div></div><section class="panel workspace-tasks"><div class="panel-heading"><div><h2>Следующие действия</h2><p>Личные даты планирования. Сроки источника проверяйте отдельно.</p></div></div>${followupList(8)}</section><div class="workspace-search">${searchField('Поиск по моей работе и заметкам')}</div><div id="workspace-results">${pipelineMarkup(list,groups)}</div><p class="result-caption">Заметки, этапы, задачи и избранное доступны только в этом браузере. Резервная копия переносит их на другое устройство.</p>`;
  }
  function pipelineMarkup(list,groups=[['review','Отбор и проверка',['new','review']],['draft','Подготовка КП',['draft','ready']],['sent','Предложение подано',['sent']],['result','Результат и пауза',['won','lost','hold']]]) {
    if(!list.length)return emptyState('Добавьте первую запись в работу','В реестре нажмите звезду или откройте карточку и измените рабочий статус.','<button class="button primary" data-view="opportunities">Открыть реестр</button>');
    return `<div class="pipeline-board">${groups.map(([key,label,steps])=>{const column=list.filter(o=>steps.includes(local.work[o.id]||'new'));return `<section class="pipeline-column" data-stage="${key}"><div class="pipeline-column-header"><h2>${label}</h2><span>${column.length}</span></div><div class="pipeline-column-body">${column.map(o=>`<article class="pipeline-card"><div class="lead-top"><span class="case-number">${esc(o.caseNumber||'Запрос')}</span>${favoriteButton(o)}</div><button class="lead-open" data-action="open-detail" data-id="${esc(o.id)}">${esc(o.title)}</button>${statusTag(o)}<p class="pipeline-deadline">${icon('clock')}${esc(deadlineLabel(o))}</p>${local.tasks[o.id]?.text?`<p class="pipeline-next">${esc(shorten(local.tasks[o.id].text,150))}</p>`:''}${localTaskTag(o)}${positiveMoney(local.notes[o.id]?.proposalRub)?`<p class="own-price">Моя цена: ${esc(money(local.notes[o.id].proposalRub))}</p>`:''}<div class="pipeline-card-actions"><label class="sr-only" for="stage-${esc(o.id)}">Этап записи ${esc(o.caseNumber)}</label><select class="select-field" id="stage-${esc(o.id)}" data-work-id="${esc(o.id)}">${Object.entries(WORK_STATUS).map(([v,t])=>option(v,t,local.work[o.id]||'new')).join('')}</select></div></article>`).join('')||'<p class="pipeline-empty">На этом этапе записей пока нет</p>'}</div></section>`;}).join('')}</div>`;
  }

  function filteredCourts() {
    const q=state.search.trim().toLocaleLowerCase('ru-RU');
    return state.db.courts.filter(c=>(state.region==='all'||c.region===state.region)&&(state.courtType==='all'||c.kind===state.courtType)&&(!q||[c.name,c.region,c.address,c.note].some(t=>plain(t).toLocaleLowerCase('ru-RU').includes(q))));
  }
  function courtCards(courts) {
    if(!courts.length)return emptyState('Суды не найдены','Попробуйте другое название, регион или тип суда.');
    return `<div class="court-grid">${courts.map(c=>`<article class="court-card"><div class="court-card-head"><span class="court-icon">${icon('court')}</span><span class="tag">${esc(c.kind||'Суд')}</span></div><h3>${esc(c.name)}</h3><div class="court-region">${esc(c.region||'Москва')}</div><p class="court-note">${esc(shorten(c.note||'Откройте официальный сайт и проверьте публикации по назначению экспертиз и поиску экспертной организации.',200))}</p>${c.address?`<div class="court-contact">${esc(c.address)}</div>`:''}${c.email?`<div class="court-contact">${esc(c.email)}</div>`:''}${c.emailUsage?`<p class="field-hint">${esc(c.emailUsage)}</p>`:''}${c.phone?`<div class="court-contact">${esc(c.phone)}</div>`:''}<div class="court-links">${external(c.website,'Сайт суда')}${c.caseSearchUrl?external(c.caseSearchUrl,'Поиск дел'):''}${c.contactUrl?external(c.contactUrl,'Контакты'):''}</div></article>`).join('')}</div>`;
  }
  function courts() {
    const regions=[...new Set(state.db.courts.map(c=>c.region).filter(Boolean))].sort();
    const kinds=[...new Set(state.db.courts.map(c=>c.kind).filter(Boolean))].sort();
    const filtered=filteredCourts();
    return heading('Контур наблюдения','Справочник судов','Официальные сайты и точки входа для проверки дел. Наличие суда в справочнике не означает, что все его дела просмотрены.',`<button class="button secondary" data-action="export-courts">${icon('down')}Скачать справочник</button>`)+
    `<section class="panel"><div class="filter-bar" style="border-bottom:0">${searchField('Найти суд по названию или адресу')}<label class="sr-only" for="region-filter">Регион</label><select class="select-field" id="region-filter">${option('all','Все регионы',state.region)}${regions.map(v=>option(v,v,state.region)).join('')}</select><label class="sr-only" for="court-type-filter">Тип суда</label><select class="select-field" id="court-type-filter">${option('all','Все типы судов',state.courtType)}${kinds.map(v=>option(v,v,state.courtType)).join('')}</select></div></section><p class="result-caption" id="court-result-count">В справочнике ${filtered.length} из ${state.db.courts.length} судов</p><div id="court-results">${courtCards(filtered)}</div>`;
  }
  function sources() {
    const rows=sourceRows(),auto=rows.filter(isAutomaticSource),healthy=auto.filter(s=>sourceHealth(s).className==='healthy');
    const candidates=Array.isArray(state.monitor?.newCandidates)?state.monitor.newCandidates:[];
    const review=state.db.meta?.reviewState||{},batch=review.lastCourtBatch||{};
    const attempts=Array.isArray(batch.attemptedIds)?batch.attemptedIds.length:null;
    const confirmed=typeof batch.officialCourtCardsVerified==='number'?batch.officialCourtCardsVerified:null;
    const typeLabels={court_search:'Поиск дел',court_official:'Официальный сайт суда',procurement_official:'Официальные закупки',open_data:'Открытые данные',directory:'Справочник',secondary_procurement:'Вторичный источник закупок',secondary_decisions:'Копии судебных актов'};
    return heading('Качество и свежесть данных','Источники и обновления','Здесь отдельно показаны техническая доступность сайтов и результат содержательного изучения дел.',`<button class="button secondary" data-action="refresh">${icon('refresh')}Перечитать данные</button>`)+
    reviewHealth()+`<div class="source-health-grid"><div class="source-health-card"><span>Автоматические источники</span><b>${healthy.length} / ${auto.length}</b><p>доступны по последней сетевой проверке</p></div><div class="source-health-card"><span>Ручная проверка</span><b>${rows.length-auto.length}</b><p>источников требуют отдельного исследования</p></div><div class="source-health-card"><span>Последняя группа судов</span><b>${attempts===null?'—':attempts}</b><p>попыток открыть поисковые страницы</p></div><div class="source-health-card"><span>Актуальные карточки дел</span><b>${confirmed===null?'—':confirmed}</b><p>подтверждено в последней группе</p></div></div>${automationPanel()}${state.monitorError?`<div class="detail-warning">${esc(state.monitorError)} Показан последний доступный результат.</div>`:''}
    <section class="panel research-panel"><div class="panel-heading"><div><h2>Последний содержательный результат</h2><p>${esc(researchLabel())}</p></div></div><div class="research-result"><p>${esc(batch.result||review.lastArbitrationCheck?.result||'Подробный результат проверки не опубликован.')}</p>${Array.isArray(batch.attemptedIds)?`<details><summary>Какие суды пытались проверить</summary><ul>${batch.attemptedIds.map(id=>{const court=state.db.courts.find(c=>c.id===id);return `<li>${court?external(court.caseSearchUrl||court.website,court.name):esc(id)}</li>`;}).join('')}</ul></details>`:''}${review.lastProcurementCheck?.result?`<details><summary>Результат проверки закупок</summary><p>${esc(plain(review.lastProcurementCheck.result))}</p></details>`:''}</div></section>
    <div class="source-grid">${rows.map(source=>{const health=sourceHealth(source),automatic=isAutomaticSource(source);const result=source.resultMessage||(health.className==='healthy'?source.error:'');const err=health.className==='healthy'?'':source.error;return `<article class="source-card"><div class="source-card-top"><h3>${esc(source.name||source.id)}</h3>${sourceTag(source)}</div><p>${esc(typeLabels[source.type]||'Источник публичных данных')} · ${automatic?'автоматическая проверка доступности':'ручное исследование'}</p>${external(source.url,'Открыть источник','button secondary small')}<div class="source-card-details"><div><span class="small-label">Последняя попытка</span><span class="small-value">${source.checkedAt?esc(formatDate(source.checkedAt,true)):automatic?'Ещё не проверено':'Автопроверка не выполняется'}</span></div><div><span class="small-label">Последний успех</span><span class="small-value">${source.lastSuccessAt?esc(formatDate(source.lastSuccessAt,true)):'Не зафиксирован'}</span></div></div>${source.httpStatus?`<span class="tag">HTTP ${esc(source.httpStatus)}</span>`:''}${result?`<p class="source-result">${esc(shorten(result,300))}</p>`:''}${err?`<div class="${automatic?'source-error':'source-manual-note'}">${esc(shorten(err,400))}</div>`:''}${source.notes?`<details class="source-history"><summary>Контекст источника</summary><p>${esc(source.notes)}</p><small>Исходное описание; текущая доступность указана выше.</small></details>`:''}</article>`;}).join('')}</div>
    <section class="panel section-gap"><div class="panel-heading"><div><h2>Кандидаты сборщика<span class="panel-count">${candidates.length}</span></h2><p>Найденные ссылки ещё не подтверждают действующий запрос.</p></div></div>${candidates.length?`<div class="candidate-list">${candidates.map(c=>`<article class="candidate-row">${external(c.url||c.sourceUrl,c.title||c.name||'Найденный документ')}<p>${esc(c.sourceName||rows.find(r=>r.id===c.sourceId)?.name||c.source||c.sourceId||'Источник не указан')}${c.detectedAt||c.discoveredAt?' · '+esc(formatDate(c.detectedAt||c.discoveredAt,true)):''}</p>${c.excerpt?`<p>${esc(shorten(c.excerpt,240))}</p>`:''}</article>`).join('')}</div>`:`<div class="followup-empty"><p>Новых ссылок в последнем доступном журнале нет. Это не означает отсутствия подходящих дел: проверка содержания выполняется отдельно.</p></div>`}</section>${limitations()}`;
  }

  function limitations() {
    const list=Array.isArray(state.db.meta?.limitations)?state.db.meta.limitations:[];
    if(!list.length)return '';
    return `<details class="limitations"><summary>Границы исследования и история ограничений (${list.length})</summary><ul>${list.map(t=>`<li>${esc(plain(t))}</li>`).join('')}</ul></details>`;
  }

  function newForm(record=null) {
    return {id:'',recordId:record?.id||'',court:record?courtName(record):'',caseNumber:record?.caseNumber||'',subject:record?.title||'Судебная строительно-техническая экспертиза',organization:local.company.organization||'АНО «МСК-Эксперт»',requisites:local.company.requisites||'',contact:local.company.contact||'info@sud-mskexpert.ru · +7 (495) 648-50-91',expert:local.company.expert||'',qualification:local.company.qualification||'',price:record&&positiveMoney(local.notes[record.id]?.proposalRub)?String(local.notes[record.id].proposalRub):'',days:'',conditions:'',attachments:'Сведения об эксперте и квалификации; документы об образовании; подтверждение опыта по предмету исследования.',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  }
  function field(id,label,value,placeholder='',type='text',wide=false,hint='') {
    return `<div class="field ${wide?'wide':''}"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" name="${esc(id)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${type==='number'?' min="1" max="1000000000000" step="'+(id==='price'?'any':'1')+'"':''}>${hint?`<p class="field-hint">${esc(hint)}</p>`:''}</div>`;
  }
  function area(id,label,value,placeholder='',hint='') {
    return `<div class="field wide"><label for="${esc(id)}">${esc(label)}</label><textarea id="${esc(id)}" name="${esc(id)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>${hint?`<p class="field-hint">${esc(hint)}</p>`:''}</div>`;
  }
  function missingForm(f) {
    const misses=[];if(!f.court?.trim())misses.push('суд');if(!f.caseNumber?.trim())misses.push('номер дела');if(!f.expert?.trim())misses.push('ФИО эксперта');if(!f.qualification?.trim())misses.push('квалификация');if(!f.requisites?.trim())misses.push('реквизиты');if(!positiveMoney(f.price))misses.push('цена');if(!Number.isFinite(Number(f.days))||Number(f.days)<=0)misses.push('срок');return misses;
  }
  function proposalText(f) {
    const placeholder=(v,p)=>String(v||'').trim()||`[${p}]`;
    const price=positiveMoney(f.price)?money(f.price):'[УКАЗАТЬ СТОИМОСТЬ]';
    const days=Number(f.days)>0?`${f.days} календарных дней`:'[УКАЗАТЬ СРОК]';
    const procurement=getRecord(f.recordId)?.sourceType==='procurement_adjacent';
    const miss=missingForm(f);
    return `ПРОЕКТ ДЛЯ ПРОВЕРКИ. НЕ ОТПРАВЛЕН.\n${miss.length?'Не заполнено: '+miss.join(', ')+'.\n':''}\n${procurement?'Заказчик: ':'В '}${placeholder(f.court,procurement?'НАИМЕНОВАНИЕ ЗАКАЗЧИКА':'НАИМЕНОВАНИЕ СУДА')}\n${procurement?'По закупке':'По делу'} № ${placeholder(f.caseNumber,procurement?'НОМЕР ЗАКУПКИ':'НОМЕР ДЕЛА')}\n\nИНФОРМАЦИЯ О ВОЗМОЖНОСТИ ПРОВЕДЕНИЯ ${procurement?'ИССЛЕДОВАНИЯ':'ЭКСПЕРТИЗЫ'}\n\n${placeholder(f.organization,'ПОЛНОЕ НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ')} предлагает рассмотреть возможность проведения исследования по вопросу: ${placeholder(f.subject,'ПРЕДМЕТ ИССЛЕДОВАНИЯ')}.\n\nПредлагаемый ${procurement?'специалист':'эксперт'}: ${placeholder(f.expert,'ФИО СПЕЦИАЛИСТА')}.\nКвалификация и профильный опыт: ${placeholder(f.qualification,'ПОДТВЕРЖДЁННЫЕ СВЕДЕНИЯ О КВАЛИФИКАЦИИ')}.\n\nПредварительная стоимость: ${price}.\nПредлагаемый срок: ${days} после получения полного комплекта материалов и обеспечения доступа к объекту, если осмотр необходим.\n\nСтоимость, состав работ и срок подлежат уточнению после ознакомления с вопросами и доступными материалами. Налоговый режим и состав включённых расходов указываются в окончательном предложении.\n\n${f.conditions?.trim()?'Условия и состав работ:\n'+f.conditions.trim()+'\n\n':''}Приложения к окончательному предложению:\n${placeholder(f.attachments,'ПЕРЕЧЕНЬ ПОДТВЕРЖДАЮЩИХ ДОКУМЕНТОВ').replace(/[.]+$/,'')}.\n\nРеквизиты: ${placeholder(f.requisites,'ИНН / ОГРН / ЮРИДИЧЕСКИЙ АДРЕС')}.\nКонтакт для связи: ${placeholder(f.contact,'EMAIL И ТЕЛЕФОН')}.\n\n[ДОЛЖНОСТЬ, ФИО И ПОДПИСЬ УПОЛНОМОЧЕННОГО ЛИЦА]\n[ДАТА]\n\n${procurement?'Перед участием: проверить извещение, требования к участникам и предмету закупки, сроки, обеспечения и порядок подачи через ЭТП. Этот проект не заменяет заявку по установленной форме.':'Перед подачей: проверить актуальность дела, адресата, процессуальный канал и отсутствие конфликта интересов. Этот проект не подтверждает назначение эксперта судом.'}`;
  }
  function draftsPanel() {
    return `<section class="panel"><div class="compact-heading"><h2>Сохранённые черновики</h2><span class="panel-count">${local.drafts.length}</span></div>${local.drafts.length?`<ul class="drafts-list">${[...local.drafts].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(d=>`<li class="draft-row">${icon('document')}<div><button class="draft-title" data-action="load-draft" data-id="${esc(d.id)}">${esc(d.caseNumber||'Без номера дела')}</button><p>${esc(shorten(d.court||'Суд не указан',60))}<br>${positiveMoney(d.price)?esc(money(d.price)):'Цена не задана'} · ${esc(shortDate(d.updatedAt))}</p></div><button class="icon-button" data-action="delete-draft" data-id="${esc(d.id)}" aria-label="Удалить черновик ${esc(d.caseNumber||'без номера')}">${icon('trash')}</button></li>`).join('')}</ul>`:`<div class="empty-state" style="padding:26px 20px"><p style="margin-bottom:0">После сохранения предложения появятся здесь.</p></div>`}</section>`;
  }
  function proposals() {
    if(!state.form)replaceDraft(newForm());const f=state.form;
    return heading('Локальная рабочая область','Мои предложения','Подготовьте документ на основе проверенного дела. Черновики сохраняются в этом браузере и не отправляются получателям.',`<button class="button secondary" data-action="new-draft">${icon('plus')}Новый черновик</button>`)+
    `<div class="proposal-layout"><section class="panel"><div class="panel-heading"><div><h2>Параметры предложения</h2><p>Ваша цена хранится отдельно от опубликованных сумм</p></div><span class="tag blue">Черновик</span></div><form class="proposal-form" id="proposal-form"><div class="proposal-status">${icon('info')}<span id="proposal-completeness">${missingForm(f).length?'Заполните: '+esc(missingForm(f).join(', '))+'.':'Основные поля заполнены. Проверьте документы и допустимый способ подачи.'}</span></div><div class="field-grid"><div class="field wide"><label for="recordId">Привязать к записи в базе</label><select name="recordId" id="recordId">${option('','Самостоятельное предложение',f.recordId)}${records().map(o=>option(o.id,(o.caseNumber||'Запрос')+' — '+shorten(o.title,78),f.recordId)).join('')}</select><p class="field-hint">Проверьте текущий приём предложений. Исторические и закрытые записи можно использовать как примеры для подготовки.</p></div>${field('court','Суд / получатель',f.court,'Полное наименование суда','text',true)}${field('caseNumber','Номер дела / закупки',f.caseNumber,'Например, А40-…/2026')}${field('subject','Предмет исследования',f.subject,'Вопросы, которые требует исследовать суд')}${field('price','Предлагаемая стоимость, ₽',f.price,'Ваша оценка','number',false,'Это собственный расчёт, а не сумма из акта.')}${field('days','Предлагаемый срок, дней',f.days,'Календарных дней','number')}</div><h3 class="form-section-title">Организация и эксперт</h3><div class="field-grid">${field('organization','Наименование организации',f.organization,'Юридическое наименование','text',true)}${field('expert','ФИО эксперта',f.expert,'Кандидатуру подтверждает организация','text',true)}${area('qualification','Квалификация и профильный опыт',f.qualification,'Образование, специальность, стаж и релевантные исследования','Укажите только сведения, которые подтверждаются документами.')}${area('requisites','Реквизиты организации',f.requisites,'ИНН, ОГРН, юридический адрес')}${field('contact','Контакт для связи',f.contact,'Email и телефон','text',true)}</div><h3 class="form-section-title">Объём и условия</h3><div class="field-grid">${area('conditions','Условия проведения исследования',f.conditions,'Материалы, вопросы, доступ к объекту, расходы, налоговый режим')}${area('attachments','Приложения',f.attachments,'Перечень документов к предложению')}</div><div class="form-actions"><button class="button primary" type="submit">${icon('save')}Сохранить черновик</button><button class="button secondary" type="button" data-action="copy-proposal">${icon('copy')}Скопировать</button><button class="button secondary" type="button" data-action="download-proposal">${icon('down')}Скачать TXT</button><button class="button secondary" type="button" data-action="print-proposal">${icon('print')}Печать / PDF</button></div></form></section><aside class="proposal-side">${draftsPanel()}<div class="local-note"><strong>Данные остаются у вас.</strong><br>Заметки, цены и реквизиты хранятся локально в браузере. Они не попадают в публичный репозиторий или Google-таблицу. Очистка данных браузера удалит черновики.<div class="button-row" style="margin-top:12px"><button class="button secondary small" data-action="backup">${icon('down')}Резервная копия</button><button class="button ghost small" data-action="import-backup">Восстановить</button></div></div><div class="preview-area section-gap"><div class="preview-toolbar"><h2>Предпросмотр документа</h2><span class="tag">Не отправлен</span></div><pre class="proposal-preview" id="proposal-preview">${esc(proposalText(f))}</pre></div></aside></div>`;
  }
  function guide() {
    return heading('Методика и порядок работы','Как работает мониторинг','Одна последовательность: обнаружить сигнал, подтвердить статус, оценить работу и подготовить предложение.')+
    `${automationPanel()}<div class="guide-grid"><section class="guide-card full"><h2>От источника до предложения</h2><div class="guide-steps"><div class="guide-step"><span class="step-counter">01</span><b>Найти сигнал</b><p>Открыть реестр, новый документ или судебное дело с вопросом об экспертизе.</p></div><div class="guide-step"><span class="step-counter">02</span><b>Проверить акт</b><p>Уточнить статус, вопросы, сроки и фактический порядок представления кандидатуры.</p></div><div class="guide-step"><span class="step-counter">03</span><b>Рассчитать работу</b><p>Определить эксперта, объём, стоимость, срок и необходимые материалы.</p></div><div class="guide-step"><span class="step-counter">04</span><b>Подготовить КП</b><p>Сохранить проект, приложить подтверждения и проверить способ подачи.</p></div></div></section><section class="guide-card"><span class="guide-number">АВТОМАТИЧЕСКИ</span><h2>Что обновляет система</h2><ul><li>Панель перечитывает опубликованные JSON-файлы каждую минуту, пока открыта.</li><li>Сетевой сборщик проверяет ${sourceRows().filter(isAutomaticSource).length} настроенных источника и сохраняет статусы. Остальные источники требуют ручной проверки; весь справочник судов автоматически не обходится.</li><li>Новые найденные ссылки становятся кандидатами для проверки. Они не получают статус подтверждённого заказа автоматически.</li><li>При ошибке источника показывается ограничение; последняя дата не заменяется временем открытия страницы.</li></ul></section><section class="guide-card"><span class="guide-number">ПРОВЕРЯЕТ СПЕЦИАЛИСТ</span><h2>Что требует решения человека</h2><ul><li>Полный текст актуального определения и дальнейшее движение дела.</li><li>Есть ли запрос к экспертам и можно ли ещё представить предложение.</li><li>Подходят ли квалификация, оборудование и сроки организации.</li><li>Кому и каким процессуальным способом представить документы.</li><li>Состав работ, цена, налоговый режим, конфликт интересов и приложения.</li></ul></section><section class="guide-card"><span class="guide-number">СТАТУСЫ</span><h2>Как читать базу</h2><ul><li><b>Приём подтверждён</b> — есть проверенный источник, подтверждающий актуальную возможность подачи.</li><li><b>Проверить актуальность</b> — найден релевантный сигнал, но возможность участия не подтверждена.</li><li><b>Архивный пример</b> — свидетельство спроса и пример формулировок; не действующий заказ.</li><li><b>Завершено</b> — публикация больше не рассматривается как открытая возможность.</li></ul></section><section class="guide-card"><span class="guide-number">СУММЫ И ДОКАЗАТЕЛЬСТВА</span><h2>Что означает цена</h2><ul><li>Стоимость экспертизы, сумма иска и цена закупки отмечаются разными подписями.</li><li>Если стоимость не опубликована, поле остаётся пустым.</li><li>Собственная цена вводится только в локальной заметке или проекте КП.</li><li>Дата решения не равна дате окончания подачи предложений.</li><li>Наличие ссылки на суд не означает проверку каждого дела этого суда.</li></ul></section><section class="guide-card full"><h2>Рабочие данные и резервная копия</h2><p>Публичный реестр доступен всем посетителям сайта. Ваши заметки, черновики, цены и введённые реквизиты хранятся только в localStorage этого браузера. На другом устройстве они не появятся автоматически. Скачайте резервную копию и перенесите её через кнопку восстановления. Не размещайте копию с рабочими данными в публичном репозитории.</p><div class="button-row"><button class="button secondary" data-action="backup">${icon('down')}Скачать резервную копию</button><button class="button secondary" data-action="import-backup">${icon('upload')}Восстановить</button>${state.db.meta?.repoUrl?external(state.db.meta.repoUrl,'Код и инструкция','button secondary'):''}${state.db.meta?.sheetUrl?external(state.db.meta.sheetUrl,'Google-таблица','button secondary'):''}</div></section></div>${limitations()}`;
  }
  function render() {
    const main=$('#main');updateNav();
    if(!state.db){
      if(state.loadError)main.innerHTML=`<section class="error-box"><h1>База пока недоступна</h1><p>Не удалось загрузить опубликованные данные: ${esc(state.loadError)}.</p><p>Проверьте, что файлы <code>data/registry.json</code> и <code>data/monitoring.json</code> опубликованы рядом с панелью. Открывайте приложение через веб-сервер или GitHub Pages.</p><button class="button primary" data-action="refresh">${icon('refresh')}Повторить загрузку</button></section>`;
      return;
    }
    const views={overview,opportunities,workspace,courts,sources,proposals,guide};
    main.innerHTML=`<div data-page="${esc(state.view)}">${state.loadError?`<div class="source-info-strip">${icon('info')}<div><h3>Показан предыдущий срез</h3><p>Последнее обновление не удалось. Проверьте первоисточники перед использованием данных.</p></div></div>`:''}${state.dataFallback?'<div class="source-info-strip freshness-warning"><div><h3>Резервная опубликованная копия</h3><p>Основной адрес данных недоступен. Показаны файлы последней публикации сайта; проверьте даты исследования и источников.</p></div></div>':''}${freshnessBanner()}${views[state.view]()}</div>`;
    hydrateIcons(main);updateMeta();showStorageConflict();
    if(storageLoadError)main.insertAdjacentHTML('afterbegin',`<div class="source-info-strip freshness-warning">${icon('shield')}<div><h3>Рабочие данные требуют восстановления</h3><p>Сохранённая копия не прочитана. Она остаётся в браузере и не перезаписывается.</p><button class="button secondary small" data-action="raw-backup">Скачать исходную копию</button></div></div>`);
  }
  function updateFilterResults() {
    saveUI();
    if(state.view==='opportunities'){
      const list=filterRecords();$('#lead-results').innerHTML=resultsMarkup(list);if($('#filter-summary'))$('#filter-summary').innerHTML=filterSummary();$('#lead-result-count').textContent=`Найдено ${number(list.length)} из ${number(records().length)}`;
    }else if(state.view==='workspace'){
      const terms=state.search.trim().toLowerCase().replace(/ё/g,'е').split(/\s+/).filter(Boolean);const list=records().filter(o=>(local.favorites.includes(o.id)||local.work[o.id]||local.tasks[o.id]?.text||local.tasks[o.id]?.dueDate)&&terms.every(t=>[o.title,o.caseNumber,local.tasks[o.id]?.text,local.notes[o.id]?.text].join(' ').toLowerCase().replace(/ё/g,'е').includes(t)));$('#workspace-results').innerHTML=pipelineMarkup(list);
    }else if(state.view==='courts'){
      const list=filteredCourts();$('#court-results').innerHTML=courtCards(list);$('#court-result-count').textContent=`В справочнике ${list.length} из ${state.db.courts.length} судов`;
    }
  }
  function openDetail(id,opener) {
    const o=getRecord(id);if(!o)return;
    state.detailId=id;state.returnFocus=opener||document.activeElement;
    const note=local.notes[id]||{},task=local.tasks[id]||{},checks=local.checks[id]||{};
    const isOpen=statusKey(o)==='open_confirmed',court=state.db.courts.find(c=>c.id===o.courtId);
    const warning=expired(o)&&o.status==='needs_review'?'Срок по найденным данным истёк. Проверьте возможное продление в официальном извещении.':statusKey(o)==='historical'?'Архивный пример: не подтверждает действующий запрос и возможность подачи.':statusKey(o)==='closed'?'Запись завершена или срок истёк. Её можно использовать для исследования практики.':'Актуальный приём не подтверждён. Сначала проверьте первоисточник и дальнейшее движение дела или закупки.';
    $('#detail-content').innerHTML=`<header class="detail-header"><span>${o.sourceType==='procurement_adjacent'?'Смежная закупка':'Судебное дело'}</span><div class="button-row">${favoriteButton(o)}<button class="icon-button" data-action="copy-record-link" aria-label="Скопировать ссылку на карточку" title="Ссылка без личных данных">${icon('link')}</button><button class="icon-button" data-action="close-detail" aria-label="Закрыть карточку">${icon('close')}</button></div></header><div class="detail-body"><div class="lead-top"><span class="case-number">${esc(o.caseNumber||'Публичный запрос')}</span>${statusTag(o)}</div><h2 id="detail-title">${esc(o.title||'Судебно-строительная экспертиза')}</h2><p class="detail-court">${esc(courtName(o))}</p><p class="detail-region">${icon('pin')}${esc(o.region||'Место объекта не уточнено')}</p>${!isOpen?`<div class="detail-warning">${esc(warning)}</div>`:''}
    <div class="detail-data-grid"><div><span class="small-label">Срок по источнику</span><span class="small-value">${esc(o.deadline?formatDate(deadlineDate(o),true):'Не опубликован')}</span></div><div><span class="small-label">Дата проверки записи</span><span class="small-value">${esc(formatDate(o.checkedAt))}</span></div><div><span class="small-label">Дата акта / извещения</span><span class="small-value">${esc(formatDate(o.publishedAt))}</span></div><div><span class="small-label">Заседание</span><span class="small-value">${esc(formatDate(o.hearingAt))}</span></div><div class="detail-amount">${amountBlock(o)}</div></div>
    <div class="detail-actions">${external(o.sourceUrl,'Открыть источник','button primary')}${o.documentUrl&&o.documentUrl!==o.sourceUrl?external(o.documentUrl,'Документ','button secondary'):''}${court?external(court.caseSearchUrl||court.website,'Карточка / поиск суда','button secondary'):''}<button class="button secondary" data-action="copy-record-summary">${icon('copy')}Скопировать справку</button></div>
    <section class="detail-section"><h3>Суть записи</h3><p>${esc(plain(o.summary))}</p><h3>Следующий шаг по исследованию</h3><p>${esc(plain(o.nextAction)||'Уточнить актуальный статус, наличие запроса и допустимый способ подачи.')}</p></section>
    ${o.eligibilityNote?`<section class="detail-section"><h3>Условия допуска и предмет работ</h3><p>${esc(o.eligibilityNote)}</p></section>`:''}
    <details class="detail-section detail-evidence"><summary>Материал и основание проверки</summary><p>${esc(plain(o.decisionSummary)||'Полное содержание уточните по первоисточнику.')}</p>${o.sourceExcerpt?`<blockquote>${esc(shorten(o.sourceExcerpt,650))}</blockquote>`:''}<p>${esc(verificationText(o.verification))}</p>${o.primaryAccess?`<p>${esc(o.primaryAccess)}</p>`:''}${o.dateBasis?`<p>Основание даты: ${esc(o.dateBasis)}</p>`:''}${Array.isArray(o.additionalSources)?`<div class="detail-actions">${o.additionalSources.map((url,i)=>external(url,'Дополнительный источник '+(i+1),'button secondary small')).join('')}</div>`:''}</details>
    <section class="detail-local"><div class="local-section-heading"><h3>Моя работа с записью</h3><span class="tag blue">Только в этом браузере</span></div><div class="record-local-meta"><div class="field"><label for="detail-work">Рабочий этап</label><select id="detail-work">${Object.entries(WORK_STATUS).map(([v,t])=>option(v,t,local.work[id]||'new')).join('')}</select></div><div class="field"><label for="detail-price">Моя цена, ₽</label><input id="detail-price" type="number" min="1" max="1000000000000" step="any" value="${esc(note.proposalRub||'')}" placeholder="Собственный расчёт"></div><div class="field wide"><label for="detail-task">Мой следующий шаг</label><input id="detail-task" maxlength="2000" value="${esc(task.text||'')}" placeholder="Например: проверить требования и связаться с заказчиком"></div><div class="field"><label for="detail-followup">Дата следующего действия</label><input id="detail-followup" type="date" value="${esc(task.dueDate||'')}"><p class="field-hint">Личная задача, отдельно от срока подачи. Отображается в обзоре; push-уведомления не отправляются.</p></div><div class="field wide"><label for="detail-note">Рабочая заметка</label><textarea id="detail-note" maxlength="20000" placeholder="Что выяснили, какие материалы запросить, решение по участию…">${esc(note.text||'')}</textarea></div></div><fieldset class="detail-checklist"><legend>Мой чек-лист проверки</legend><p class="field-hint">Личные отметки не изменяют статус публичного источника.</p>${Object.entries(CHECKS).map(([key,label])=>`<label class="check-row"><input type="checkbox" data-check="${key}"${checks[key]?' checked':''}><span>${esc(label)}</span></label>`).join('')}</fieldset></section></div><footer class="detail-footer"><span id="detail-save-state" role="status">${note.updatedAt?'Сохранено '+esc(formatDate(note.updatedAt,true)):'Изменения нужно сохранить'}</span><div class="button-row"><button class="button secondary" data-action="save-note">${icon('save')}Сохранить</button><button class="button primary" data-action="draft-from-detail">Подготовить КП${icon('arrow')}</button></div></footer>`;
    history.replaceState(null,'',routeHash(state.view,id));
    const dialog=$('#detail-dialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
  }
  function detailValues() {
    const value=$('#detail-price')?.value||'';
    return {text:$('#detail-note')?.value||'',price:value,work:$('#detail-work')?.value||'new',task:$('#detail-task')?.value||'',dueDate:$('#detail-followup')?.value||'',checks:Object.fromEntries([...document.querySelectorAll('#detail-content [data-check]')].map(el=>[el.dataset.check,el.checked]))};
  }
  function detailDirty() {
    if(!state.detailId||!$('#detail-note'))return false;
    const id=state.detailId,n=local.notes[id]||{},t=local.tasks[id]||{},v=detailValues();
    return v.text!==(n.text||'')||v.price!==String(n.proposalRub||'')||v.work!==(local.work[id]||'new')||v.task!==(t.text||'')||v.dueDate!==(t.dueDate||'')||Object.keys(CHECKS).some(k=>!!v.checks[k]!==!!local.checks[id]?.[k]);
  }
  function closeDetail() {
    if(detailDirty()&&!window.confirm('Закрыть карточку без сохранения заметки, цены, задачи и отметок проверки?'))return false;
    $('#detail-dialog').close();return true;
  }
  function applyDetail(snapshot) {
    const id=state.detailId,v=detailValues(),updatedAt=new Date().toISOString();
    snapshot.notes[id]={text:v.text,proposalRub:positiveMoney(v.price)?Number(v.price):null,updatedAt};
    if(v.work==='new')delete snapshot.work[id];else snapshot.work[id]=v.work;
    if(v.task||v.dueDate)snapshot.tasks[id]={text:v.task,dueDate:v.dueDate,updatedAt};else delete snapshot.tasks[id];
    if(Object.values(v.checks).some(Boolean))snapshot.checks[id]=v.checks;else delete snapshot.checks[id];
    return snapshot;
  }
  function saveNote(showToast=true) {
    if(!state.detailId||!$('#detail-note'))return false;
    const price=$('#detail-price');
    if(price.value&&(!positiveMoney(price.value)||Number(price.value)>1e12||!price.checkValidity())){notify('Проверьте свою цену: введите положительное число до 1 трлн ₽.');price.focus();return false;}
    const next=applyDetail(structuredClone(local));
    if(!persist(next))return false;
    if($('#detail-save-state'))$('#detail-save-state').textContent='Сохранено в '+new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date())+' МСК';
    if(showToast)notify('Заметка, этап, задача и чек-лист сохранены.');return true;
  }

  function captureForm() {
    const form=$('#proposal-form');if(!form)return state.form;
    state.form={...(state.form||newForm()),...Object.fromEntries(new FormData(form)),updatedAt:new Date().toISOString()};
    return state.form;
  }
  function refreshPreview() {
    const f=captureForm();if(!f)return;const pre=$('#proposal-preview');if(pre)pre.textContent=proposalText(f);
    const comp=$('#proposal-completeness');const missing=missingForm(f);if(comp)comp.textContent=missing.length?'Заполните: '+missing.join(', ')+'.':'Основные поля заполнены. Проверьте документы и допустимый способ подачи.';
  }
  function saveDraft() {
    const captured=captureForm();if(!captured)return false;
    const f={...captured,id:captured.id||'draft-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),updatedAt:new Date().toISOString()};
    const next=structuredClone(local),i=next.drafts.findIndex(d=>d.id===f.id);
    if(i>=0)next.drafts[i]=f;else next.drafts.push(f);
    next.company={organization:f.organization,requisites:f.requisites,contact:f.contact,expert:f.expert,qualification:f.qualification};
    if(f.recordId){if(['new','review','draft'].includes(next.work[f.recordId]||'new'))next.work[f.recordId]='draft';if(positiveMoney(f.price))next.notes[f.recordId]={...(next.notes[f.recordId]||{}),proposalRub:Number(f.price),updatedAt:f.updatedAt};}
    if(!persist(next))return false;
    replaceDraft(f);notify('Черновик сохранён. Документ не отправлялся.');render();return true;
  }

  async function copyProposal() {
    const f=captureForm();if(!f)return;const text=proposalText(f);
    try{await navigator.clipboard.writeText(text);notify('Проект предложения скопирован.');}
    catch{
      const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.top='-1000px';document.body.appendChild(area);area.select();let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();notify(ok?'Проект предложения скопирован.':'Копирование недоступно. Скачайте документ в TXT.');
    }
  }
  function csvCell(v) { let s=plain(v);if(/^[\s\uFEFF]*[=+\-@]|^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'; }
  function csv(rows) { return '\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'); }
  function exportRegistry() {
    const list=state.view==='opportunities'?filterRecords():records();
    const rows=[['ID','Статус источника','Суд','Номер дела','Предмет','Регион','Дата акта / извещения','Срок предложения','Заседание','Опубликованная сумма, ₽','Назначение суммы','Моя цена, ₽','Содержание акта','Следующий шаг','Ссылка на материал','Ссылка на документ','Проверено','Основание проверки','Рабочий статус','Моя заметка','Избранное','Мой следующий шаг','Дата следующего действия'],...list.map(o=>[o.id,statusLabel(o),courtName(o),o.caseNumber,o.title,o.region,o.publishedAt,o.deadline,o.hearingAt,o.amountRub,({expert_fee:'Стоимость экспертизы',claim:'Сумма иска',contract:'Цена закупки / контракта',not_published:'Не опубликовано'})[o.amountType]||o.amountType,local.notes[o.id]?.proposalRub||'',o.decisionSummary,o.nextAction,o.sourceUrl,o.documentUrl,o.checkedAt,o.verification,WORK_STATUS[local.work[o.id]||'new'],local.notes[o.id]?.text||'',local.favorites.includes(o.id)?'Да':'',local.tasks[o.id]?.text||'',local.tasks[o.id]?.dueDate||''])];
    download('msk-expert-cases-'+(state.db.meta?.asOf||'export')+'.csv',csv(rows),'text/csv;charset=utf-8');notify('Реестр выгружен в CSV. Он включает локальные цены и заметки.');
  }
  function exportCourts() {const rows=[['Суд','Тип','Регион','Официальный сайт','Поиск дел','Контакты','Email','Телефон','Адрес','Источник','Дата проверки','Примечание'],...filteredCourts().map(c=>[c.name,c.kind,c.region,c.website,c.caseSearchUrl,c.contactUrl,c.email,c.phone,c.address,c.sourceUrl,c.checkedAt,c.note])];download('msk-expert-courts.csv',csv(rows),'text/csv;charset=utf-8');}
  function closeMenu() {const wasOpen=$('#sidebar').classList.contains('open');$('#sidebar').classList.remove('open');$('#sidebar-scrim').hidden=true;$('#mobile-menu').setAttribute('aria-expanded','false');$('#app-shell').inert=false;document.body.classList.remove('menu-open');if(wasOpen&&state.menuReturnFocus?.isConnected)state.menuReturnFocus.focus({preventScroll:true});state.menuReturnFocus=null;}
  function openMenu() {state.menuReturnFocus=document.activeElement;$('#sidebar').classList.add('open');$('#sidebar-scrim').hidden=false;$('#mobile-menu').setAttribute('aria-expanded','true');$('#app-shell').inert=true;document.body.classList.add('menu-open');$('#close-menu').focus();}
  function manageFilters() {
    $('#filters-content').innerHTML=`<h2 id="filters-title">Сохранённые подборки</h2>${local.savedFilters.length?`<ul class="saved-filter-list">${local.savedFilters.map(f=>`<li><button class="link-button" data-action="load-filter" data-id="${esc(f.id)}">${esc(f.name)}</button><button class="icon-button" data-action="delete-filter" data-id="${esc(f.id)}" aria-label="Удалить подборку ${esc(f.name)}">${icon('trash')}</button></li>`).join('')}</ul>`:'<p>Подборок пока нет.</p>'}<div class="dialog-actions"><button class="button secondary" data-action="close-filters">Закрыть</button></div>`;
    if(!$('#filters-dialog').open)$('#filters-dialog').showModal();
  }
  function applySavedFilter(id) {
    const filter=local.savedFilters.find(f=>f.id===id);if(!filter)return;
    Object.assign(state,cleanFilters(filter.filters));saveUI();render();notify('Открыта подборка «'+filter.name+'».');
  }
  async function handleClick(event) {
    const view=event.target.closest('[data-view]');if(view){event.preventDefault();setView(view.dataset.view);return;}
    const action=event.target.closest('[data-action]');
    if(action){
      event.preventDefault();const id=action.dataset.id;
      switch(action.dataset.action){
        case 'close-menu':closeMenu();break;
        case 'refresh':await loadData(true);break;
        case 'quick-filter':{
          const preset=action.dataset.preset;setView('opportunities');Object.assign(state,FILTER_DEFAULTS);
          if(preset==='soon'){state.due='3';state.sort='deadline';}
          if(preset==='review')state.status='needs_review';
          if(preset==='work')state.workStatus='active';
          if(preset==='favorites')state.favorite='yes';
          if(preset==='court'){state.sourceType='court_decision';state.status='open_confirmed';}
          saveUI();render();break;
        }
        case 'reset-filters':Object.assign(state,FILTER_DEFAULTS);saveUI();render();break;
        case 'clear-filter':if(Object.hasOwn(FILTER_DEFAULTS,action.dataset.filter)){state[action.dataset.filter]=FILTER_DEFAULTS[action.dataset.filter];saveUI();render();}break;
        case 'filter-status':state.status=action.dataset.status;saveUI();render();break;
        case 'toggle-favorites':state.favorite=state.favorite==='yes'?'all':'yes';saveUI();render();break;
        case 'layout':if(['list','table'].includes(action.dataset.layout)){state.layout=action.dataset.layout;saveUI();render();}break;
        case 'favorite':{
          const next=structuredClone(local),was=next.favorites.includes(id);
          next.favorites=was?next.favorites.filter(v=>v!==id):[...next.favorites,id];
          if(persist(next)){
            if($('#detail-dialog').open){action.classList.toggle('is-favorite',!was);action.setAttribute('aria-pressed',String(!was));action.setAttribute('aria-label',(was?'В избранное: ':'Убрать из избранного: ')+(getRecord(id)?.caseNumber||''));action.title=was?'В избранное':'Убрать из избранного';}
            else{render();document.querySelector(`[data-action="favorite"][data-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
            notify(was?'Запись убрана из избранного.':'Запись добавлена в избранное и в «Мою работу».');
          }
          break;
        }
        case 'save-filter':{
          if(local.savedFilters.length>=30){notify('Можно сохранить до 30 подборок. Удалите ненужную в управлении подборками.');break;}
          $('#filters-content').innerHTML=`<h2 id="filters-title">Сохранить подборку</h2><p>Текущие фильтры будут доступны в меню «Мои подборки».</p><form id="save-filter-form"><div class="field"><label for="filter-name">Название</label><input id="filter-name" maxlength="80" required placeholder="Например: Москва · обследования" autocomplete="off"></div><div class="dialog-actions"><button type="button" class="button secondary" data-action="close-filters">Отмена</button><button type="submit" class="button primary">Сохранить подборку</button></div></form>`;
          $('#filters-dialog').showModal();$('#filter-name').focus();break;
        }
        case 'manage-filters':manageFilters();break;
        case 'close-filters':$('#filters-dialog').close();break;
        case 'load-filter':$('#filters-dialog').close();applySavedFilter(id);break;
        case 'delete-filter':{
          const f=local.savedFilters.find(x=>x.id===id);if(!f||!window.confirm('Удалить подборку «'+f.name+'»? Сами записи сохранятся.'))break;
          const next=structuredClone(local);next.savedFilters=next.savedFilters.filter(x=>x.id!==id);if(persist(next)){render();manageFilters();}break;
        }
        case 'open-detail':openDetail(id,action);break;
        case 'close-detail':closeDetail();break;
        case 'save-note':saveNote();break;
        case 'copy-record-link':await copyText(recordUrl(state.detailId),'Ссылка на карточку скопирована. Личные данные в неё не включены.');break;
        case 'copy-record-summary':{const record=getRecord(state.detailId);if(record)await copyText(publicSummary(record),'Публичная справка скопирована без ваших заметок и собственной цены.');break;}
        case 'draft-from-detail':{
          if(!allowDraftReplacement())break;
          if(!saveNote(false))break;
          const record=getRecord(state.detailId);replaceDraft(newForm(record));$('#detail-dialog').close();setView('proposals');break;
        }
        case 'new-draft':if(allowDraftReplacement()){replaceDraft(newForm());render();}break;
        case 'load-draft':{const d=local.drafts.find(x=>x.id===id);if(d&&allowDraftReplacement()){replaceDraft(d);render();}break;}
        case 'delete-draft':{
          const d=local.drafts.find(x=>x.id===id);if(d&&window.confirm('Удалить локальный черновик '+(d.caseNumber||'без номера дела')+'?')){
            const next=structuredClone(local);next.drafts=next.drafts.filter(x=>x.id!==id);
            if(persist(next)){if(state.form?.id===id)replaceDraft(newForm());notify('Черновик удалён из этого браузера.');render();}
          }break;
        }
        case 'copy-proposal':await copyProposal();break;
        case 'download-proposal':{const f=captureForm();if(f)download('КП_'+safeFilename(f.caseNumber||'черновик')+'.txt',proposalText(f));break;}
        case 'print-proposal':refreshPreview();window.print();break;
        case 'export-csv':exportRegistry();break;
        case 'export-courts':exportCourts();break;
        case 'backup':download('msk-expert-private-backup-'+moscowDateKey()+'.json',JSON.stringify(exportWorkspaceSnapshot(),null,2),'application/json');notify('Копия включает заметки, задачи, избранное и черновики. Храните её приватно.');break;
        case 'raw-backup':if(storageSnapshot!==null)download('msk-expert-original-backup-'+moscowDateKey()+'.json',storageSnapshot,'application/json');else notify('Исходная копия в браузере недоступна.');break;
        case 'reload-workspace':if(window.confirm('Перечитать сохранённые данные? Сначала скачайте резервную копию своих несохранённых правок.')){local=readLocal();storageConflict=false;state.form=null;state.formBaseline=null;if($('#detail-dialog').open)$('#detail-dialog').close();render();notify('Загружены последние сохранённые данные.');}break;
        case 'import-backup':$('#backup-input').click();break;
        case 'cancel-import':state.importData=null;$('#confirm-dialog').close();break;
        case 'confirm-import':{
          if(!state.importData)break;
          const replace=$('#import-replace').checked;
          if(replace&&!window.confirm('Заменить все заметки, задачи, избранное и черновики в этом браузере выбранной копией?'))break;
          const next=replace?W.normalizeWorkspace(state.importData):W.mergeWorkspaces(exportWorkspaceSnapshot(),state.importData);
          if(!next){notify('Объединение превышает допустимый размер или содержит неверные данные. Текущие данные не изменены.');break;}
          const oldError=storageLoadError;storageLoadError=false;
          if(persist(next)){state.importData=null;state.form=null;state.formBaseline=null;$('#confirm-dialog').close();render();notify(replace?'Рабочие данные восстановлены.':'Резервная копия объединена с текущими данными.');}
          else storageLoadError=oldError;
          break;
        }
      }
      return;
    }
    const row=event.target.closest('[data-open-id]');if(row&&!event.target.closest('a,button,input,select,textarea'))openDetail(row.dataset.openId,$('.lead-open',row));
  }
  document.addEventListener('click',handleClick);
  document.addEventListener('input',event=>{
    if(event.target.id==='search-input'){state.search=event.target.value;clearTimeout(debounceTimer);debounceTimer=setTimeout(updateFilterResults,120);}
    if(['amount-min','amount-max'].includes(event.target.id)){state[event.target.id==='amount-min'?'minAmount':'maxAmount']=event.target.value;clearTimeout(debounceTimer);debounceTimer=setTimeout(updateFilterResults,120);}
    if(event.target.closest('#proposal-form')&&event.target.id!=='recordId')refreshPreview();
    if(event.target.closest('#detail-content')&&$('#detail-save-state'))$('#detail-save-state').textContent=detailDirty()?'Есть несохранённые изменения':'Изменений нет';
  });
  document.addEventListener('change',event=>{
    const maps={'work-status-filter':'workStatus','due-filter':'due','sort-filter':'sort','region-filter':'region','court-filter':'court','court-type-filter':'courtType','source-type-filter':'sourceType','category-filter':'category'};
    if(maps[event.target.id]){state[maps[event.target.id]]=event.target.value;updateFilterResults();}
    if(event.target.id==='saved-filter-select')applySavedFilter(event.target.value);
    if(event.target.dataset.workId){
      const id=event.target.dataset.workId,next=structuredClone(local),value=event.target.value;
      if(!Object.hasOwn(WORK_STATUS,value))return;
      if(value==='new')delete next.work[id];else next.work[id]=value;
      if(persist(next)){render();notify('Рабочий этап обновлён.');}else event.target.value=local.work[id]||'new';
    }
    if(event.target.id==='recordId'){
      const previous=state.form?.recordId||'',value=event.target.value;
      const previousForm={...(state.form||newForm())};
      const o=getRecord(value);
      if(value!==previous&&o&&!window.confirm('Подставить получателя, номер и предмет выбранной записи? Остальной текст и ваша цена сохранятся.')){event.target.value=previous;return;}
      captureForm();state.form.recordId=value;
      if(o){state.form.court=courtName(o);state.form.caseNumber=o.caseNumber||'';state.form.subject=o.title||'';if(!previousForm.price&&positiveMoney(local.notes[o.id]?.proposalRub))state.form.price=String(local.notes[o.id].proposalRub);}
      render();
    }
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='proposal-form'){event.preventDefault();saveDraft();}
    if(event.target.id==='save-filter-form'){
      event.preventDefault();const name=$('#filter-name').value.trim();if(!name||name.length>80)return;
      const next=structuredClone(local);next.savedFilters.push({id:'filter-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)),name,filters:filterSnapshot()});
      if(persist(next)){$('#filters-dialog').close();notify('Подборка сохранена в этом браузере.');render();}
    }
  });
  $('#backup-input').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>5*1024*1024){notify('Файл слишком большой. Ожидается резервная копия до 5 МБ.');return;}
    try{
      const parsed=W.normalizeWorkspace(JSON.parse(await file.text()));if(!parsed)throw new Error('format');
      state.importData=parsed;$('#import-replace').checked=false;
      $('#import-summary').textContent=`В копии: ${Object.keys(parsed.notes).length} заметок, ${parsed.drafts.length} предложений, ${Object.keys(parsed.tasks).length} задач и ${parsed.favorites.length} избранных записей.`;
      $('#confirm-dialog').showModal();
    }catch{notify('Файл не похож на корректную резервную копию этой панели. Данные не изменены.');}
  });
  $('#confirm-dialog').addEventListener('close',()=>{state.importData=null;});
  $('#refresh-button').addEventListener('click',()=>loadData(true));
  $('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.contains('open')?closeMenu():openMenu());
  $('#sidebar-scrim').addEventListener('click',closeMenu);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeMenu();
    if(event.key==='Tab'&&$('#sidebar').classList.contains('open')){const items=[...$('#sidebar').querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.offsetParent!==null);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!$('#detail-dialog').open){const field=$('#search-input');if(field){event.preventDefault();field.focus();}}
  });
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog')){const r=$('#detail-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDetail();}});
  $('#detail-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
  $('#detail-dialog').addEventListener('close',()=>{
    if($('#detail-dialog').open)return;
    const returnFocus=state.returnFocus,previousId=state.detailId;state.detailId=null;state.returnFocus=null;
    history.replaceState(null,'',routeHash(state.view,null));if(state.view!=='proposals')render();
    const replacement=[...document.querySelectorAll('[data-action="open-detail"]')].find(el=>el.dataset.id===previousId);
    if(returnFocus?.isConnected)returnFocus.focus();else if(replacement)replacement.focus({preventScroll:true});else $('#main').focus({preventScroll:true});
  });
  window.addEventListener('resize',()=>{if(window.innerWidth>820&&$('#sidebar').classList.contains('open'))closeMenu();});
  window.addEventListener('storage',event=>{if(event.storageArea===localStorage&&(event.key===STORE_KEY||event.key===null)&&event.newValue!==storageSnapshot){storageConflict=true;showStorageConflict();}});
  window.addEventListener('hashchange',()=>{
    const route=readRoute();
    if($('#detail-dialog').open&&!closeDetail()){history.replaceState(null,'',routeHash());return;}
    if(route.view!==state.view)setView(route.view);
    if(route.id){if(state.db){if(getRecord(route.id))openDetail(route.id);else notify('Запись не найдена в текущем реестре.');}else state.pendingRecord=route.id;}
  });
  window.addEventListener('beforeunload',event=>{if(detailDirty()||draftDirty()){event.preventDefault();event.returnValue='';}});
  hydrateIcons();readUI();
  const initial=readRoute();state.view=initial.view;state.pendingRecord=initial.id;
  Object.assign(state,FILTER_DEFAULTS,{courtType:'all'},state.filterViews[state.view]||{});
  updateNav();loadData();setInterval(()=>{if(!document.hidden)loadData();},60000);
})();
