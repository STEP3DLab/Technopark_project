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
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  };
  const VIEW_NAMES = {overview:'Обзор',opportunities:'Возможности',courts:'Справочник судов',sources:'Источники и обновления',proposals:'Мои предложения',guide:'Как это работает'};
  const STATUS = {open_confirmed:'Приём подтверждён',needs_review:'Проверить актуальность',historical:'Архивный пример',closed:'Завершено'};
  const WORK_STATUS = {'new':'Не начата','review':'Проверяю','draft':'Готовлю предложение','hold':'Отложено'};
  const STORE_KEY = 'msk-expert-monitor-workspace-v1';
  const DATA_BASE = location.hostname.toLowerCase()==='step3dlab.github.io' ? 'https://raw.githubusercontent.com/STEP3DLab/Technopark_project/main/expert-monitor/data/' : './data/';
  const state = {db:null,monitor:null,view:'overview',search:'',status:'all',region:'all',court:'all',courtType:'all',sourceType:'all',loading:false,loadError:null,monitorError:null,fetchedAt:null,form:null,detailId:null,returnFocus:null,importData:null};
  let storageSnapshot=null;
  let storageConflict=false;
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
  function formatDate(value,withTime=false) { const d=parsedDate(value); if(!d)return 'Не опубликовано'; return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}:{})}).format(d).replace(' г.','')+(withTime?' МСК':''); }
  function shortDate(value) { const d=parsedDate(value); return d?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short'}).format(d):'Нет даты'; }
  function number(value) { return new Intl.NumberFormat('ru-RU').format(Number(value)||0); }
  function money(value) { return Number.isFinite(Number(value))&&value!==null&&value!==''?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(value))+' ₽':'Не опубликовано'; }
  function positiveMoney(value) { return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0; }
  function plain(value) { return Array.isArray(value)?value.join('; '):value && typeof value==='object'?Object.values(value).filter(v=>typeof v==='string').join('; '):String(value??''); }
  function verificationText(value) {
    const labels={secondary_crosschecked_primary_unavailable:'Сведения сопоставлены по нескольким вторичным источникам. Прямой доступ к первоисточнику при проверке не получен.',secondary_crosschecked:'Сведения сопоставлены по вторичным источникам. Перед участием требуется сверка с официальным извещением.',secondary_document:'Документ изучен через вторичный источник. Актуальность требуется проверить в официальной системе.',secondary_document_partial:'Документ частично проверен через вторичный источник. Полный актуальный статус не подтверждён.',official:'Проверено по официальному источнику.',verified:'Источник проверен.'};
    return labels[value]||plain(value)||'Проверка по открытым источникам; актуальность требует уточнения по материалам дела.';
  }
  function shorten(value,length=180) { const v=plain(value); return v.length>length?v.slice(0,length-1)+'…':v; }
  function deadlineDate(item) { const value=item.deadline; if(!value)return null; return parsedDate(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T23:59:59+03:00':value); }
  function expired(item) { const d=deadlineDate(item); return ['open_confirmed','needs_review'].includes(item.status)&&d&&d<Date.now(); }
  function statusKey(item) { return expired(item)?'closed':Object.hasOwn(STATUS,item.status)?item.status:'needs_review'; }
  function statusLabel(item) { return expired(item)?(item.status==='needs_review'?'Срок по данным истёк':'Срок приёма истёк'):STATUS[statusKey(item)]; }
  function urgent(item) { const d=deadlineDate(item); return statusKey(item)==='open_confirmed'&&d&&d>=Date.now()&&(d-Date.now())<=7*86400000; }
  function statusTag(item) { return `<span class="tag ${statusKey(item)}"><span class="tag-dot"></span>${esc(statusLabel(item))}</span>`; }
  function readLocal() {
    const empty={version:1,notes:{},work:{},drafts:[],company:{}};
    try { storageSnapshot=localStorage.getItem(STORE_KEY);const raw=JSON.parse(storageSnapshot||'null');return validBackup(raw)?{...empty,...raw}:empty; } catch{return empty;}
  }
  function safeObject(value) {return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>!['__proto__','constructor','prototype'].includes(k));}
  function validString(value,max=10000) {return typeof value==='string'&&value.length<=max;}
  function validDraft(d) {
    const limits={id:200,recordId:200,court:1000,caseNumber:300,subject:5000,organization:1000,requisites:10000,contact:2000,expert:1000,qualification:20000,conditions:20000,attachments:20000,createdAt:100,updatedAt:100,price:100,days:100};
    return safeObject(d)&&validString(d.id,200)&&d.id.length>0&&Object.entries(d).every(([k,v])=>Object.hasOwn(limits,k)&&(['price','days'].includes(k)?validString(v,100)||(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12):validString(v,limits[k])));
  }
  function validBackup(raw) {
    if(!safeObject(raw)||raw.version!==1||!safeObject(raw.notes)||!safeObject(raw.work)||!Array.isArray(raw.drafts)||raw.drafts.length>5000||!raw.drafts.every(validDraft)||new Set(raw.drafts.map(d=>d.id)).size!==raw.drafts.length)return false;
    if(Object.keys(raw.notes).length>10000||Object.keys(raw.work).length>10000)return false;
    if(!Object.entries(raw.notes).every(([k,v])=>k.length<=200&&safeObject(v)&&Object.entries(v).every(([field,value])=>field==='text'?validString(value,20000):field==='updatedAt'?validString(value,100):field==='proposalRub'?(value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12):false)))return false;
    if(!Object.entries(raw.work).every(([k,v])=>k.length<=200&&typeof v==='string'&&Object.hasOwn(WORK_STATUS,v)))return false;
    if(raw.company!==undefined&&(!safeObject(raw.company)||!Object.entries(raw.company).every(([k,v])=>['organization','requisites','contact','expert','qualification'].includes(k)&&validString(v,20000))))return false;
    return Object.keys(raw).every(k=>['version','notes','work','drafts','company','exportedAt'].includes(k))&&(raw.exportedAt===undefined||validString(raw.exportedAt,100));
  }
  function persist() {
    try{
      if(storageConflict||localStorage.getItem(STORE_KEY)!==storageSnapshot){storageConflict=true;showStorageConflict();notify('Данные изменились в другой вкладке. Перезапись заблокирована; экспортируйте свои правки и перечитайте сохранённые данные.');return false;}
      const serialized=JSON.stringify(local);localStorage.setItem(STORE_KEY,serialized);storageSnapshot=serialized;updateNav();return true;
    }
    catch{notify('Браузер не сохранил данные. Скачайте резервную копию JSON.');return false;}
  }
  function storageConflictMarkup() {
    return `<div class="source-info-strip freshness-warning" id="storage-conflict-banner">${icon('shield')}<div><h3>Рабочие данные изменились в другой вкладке</h3><p>Сохранение здесь приостановлено, чтобы не удалить чужие изменения. Ваш открытый редактор сохранён в памяти этой вкладки. Скачайте резервную копию с текущими правками, затем перечитайте сохранённые данные.</p><div class="button-row" style="margin-top:11px"><button class="button secondary small" data-action="backup">${icon('down')}Скачать мои правки</button><button class="button secondary small" data-action="reload-workspace">${icon('refresh')}Перечитать сохранённые данные</button></div></div></div>`;
  }
  function showStorageConflict() {
    if(storageConflict&&!$('#storage-conflict-banner'))$('#main').insertAdjacentHTML('afterbegin',storageConflictMarkup());
  }
  function exportWorkspaceSnapshot() {
    const snapshot=JSON.parse(JSON.stringify(local));const f=captureForm();
    if(f&&(f.id||f.caseNumber||f.expert||f.requisites)){
      const draft={...f,id:f.id||'draft-unsaved-'+Date.now().toString(36),updatedAt:new Date().toISOString()};const i=snapshot.drafts.findIndex(d=>d.id===draft.id);if(i>=0)snapshot.drafts[i]=draft;else snapshot.drafts.push(draft);
    }
    if(state.detailId&&$('#detail-note')){
      const value=$('#detail-price').value;const id=state.detailId;
      snapshot.notes[id]={text:$('#detail-note').value,proposalRub:positiveMoney(value)?Number(value):null,updatedAt:new Date().toISOString()};
      const work=$('#detail-work').value;if(work==='new')delete snapshot.work[id];else snapshot.work[id]=work;
    }
    snapshot.exportedAt=new Date().toISOString();return snapshot;
  }
  function notify(message) { const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},5000); }
  function download(name,content,type='text/plain;charset=utf-8') {
    const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function safeFilename(value) { return String(value||'предложение').replace(/[^a-zа-яё0-9._-]/gi,'_').slice(0,100); }
  function sourceRows() {
    const rows=(state.db?.sources||[]).map(s=>({...s}));
    (state.monitor?.sources||[]).forEach(s=>{const i=rows.findIndex(x=>(s.id&&x.id===s.id)||(s.url&&x.url===s.url));if(i>=0)rows[i]={...rows[i],...s};else rows.push({...s});});
    return rows;
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
    const a=state.db?.meta?.automation||{};const status=a.researchTaskStatus||'not_configured';
    const titles={enabled:'Регулярная исследовательская сверка подключена',not_configured:'Регулярная исследовательская сверка не подключена',blocked:'Регулярная исследовательская сверка заблокирована'};
    const cadence=a.researchCadence||a.researchTaskCadence||a.cadence;
    const sourceCadence=({hourly:'ежечасно',daily:'ежедневно',disabled:'не подключено'})[a.sourceCheck]||plain(a.sourceCheck)||'периодичность не указана';
    const researchText=status==='enabled'?(cadence?'Периодичность сверки: '+plain(cadence)+'.':'Периодичность сверки не указана в метаданных.'):(status==='blocked'?'Запуски исследовательской сверки заблокированы; новые дела необходимо проверять вручную.':'Автоматическая содержательная сверка новых дел пока не настроена; актуальность проверяется вручную.');
    return `<div class="source-info-strip ${status==='enabled'?'':'freshness-warning'}">${icon('radar')}<div><h3>${esc(titles[status]||titles.not_configured)}</h3><p>${esc(researchText)} Сетевой сборщик: ${esc(sourceCadence)}. Текущая конфигурация проверяет 4 страницы из ${sourceRows().length||10} источников; остальные источники требуют ручной проверки. Справочник ${state.db.courts.length} судов не означает автоматическую проверку всех их дел.</p></div></div>`;
  }
  function records() { return state.db?.opportunities||[]; }
  function getRecord(id) { return records().find(o=>o.id===id); }
  function courtName(record) { return record.court||state.db?.courts?.find(c=>c.id===record.courtId)?.name||'Суд не указан'; }
  function sortedRecords() {
    const order={open_confirmed:0,needs_review:1,historical:2,closed:3};
    return [...records()].sort((a,b)=>order[statusKey(a)]-order[statusKey(b)]||(parsedDate(b.publishedAt)?.getTime()||0)-(parsedDate(a.publishedAt)?.getTime()||0));
  }
  function filterRecords() {
    const q=state.search.trim().toLocaleLowerCase('ru-RU');
    return sortedRecords().filter(o=>(state.status==='all'||statusKey(o)===state.status)&&(state.region==='all'||o.region===state.region)&&(state.court==='all'||courtName(o)===state.court)&&(state.sourceType==='all'||o.sourceType===state.sourceType)&&(!q||[o.title,o.caseNumber,courtName(o),o.category,o.summary].some(t=>plain(t).toLocaleLowerCase('ru-RU').includes(q))));
  }
  function updateNav() {
    $('#nav-opportunities').textContent=state.db?number(records().filter(o=>statusKey(o)==='open_confirmed'||statusKey(o)==='needs_review').length):'—';
    $('#nav-drafts').textContent=number(local.drafts.length);
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
  async function loadData(userInitiated=false) {
    if(state.loading)return;state.loading=true;$('#refresh-button').classList.add('spinning');$('#refresh-button').disabled=true;
    const [dbResult,monitorResult]=await Promise.allSettled([fetchJson(DATA_BASE+'registry.json'),fetchJson(DATA_BASE+'monitoring.json')]);
    if(dbResult.status==='fulfilled'&&Array.isArray(dbResult.value.courts)&&Array.isArray(dbResult.value.opportunities)){
      state.db=dbResult.value;state.loadError=null;state.fetchedAt=new Date().toISOString();
    }else state.loadError=dbResult.status==='rejected'?String(dbResult.reason?.message||dbResult.reason):'Неверный формат registry.json';
    if(monitorResult.status==='fulfilled'&&monitorResult.value&&typeof monitorResult.value==='object'){
      state.monitor=monitorResult.value;state.monitorError=null;
    }else state.monitorError='Не удалось загрузить журнал автоматических проверок.';
    state.loading=false;$('#refresh-button').classList.remove('spinning');$('#refresh-button').disabled=false;
    updateMeta();
    const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||$('#detail-dialog').open;
    if(!editing&&state.view!=='proposals'||!$('#main').querySelector('[data-page]'))render();
    if(userInitiated)notify(state.loadError?'Новый срез не загружен. '+(state.db?'На экране предыдущие данные.':'Проверьте доступ к файлам данных.'):'Опубликованные данные обновлены. Дата первоисточников указана в карточках.');
  }
  function setView(view,{reset=true}={}) {
    if(!Object.hasOwn(VIEW_NAMES,view))view='overview';
    if(state.view==='proposals')captureForm();
    state.view=view;
    if(reset){state.search='';state.status='all';state.region='all';state.court='all';state.courtType='all';state.sourceType='all';}
    if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);
    closeMenu();render();window.scrollTo({top:0,behavior:'instant'});
  }
  function heading(eyebrow,title,description,actions='') {
    return `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="page-description">${esc(description)}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;
  }
  function emptyState(title,description,action='') { return `<div class="empty-state"><div class="empty-icon">${icon('inbox')}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`; }
  function metrics() {
    const open=records().filter(o=>statusKey(o)==='open_confirmed').length;
    const review=records().filter(o=>statusKey(o)==='needs_review').length;
    const items=[
      ['Подтверждённый приём',open,'check','Открытые запросы с проверенным статусом'],
      ['Проверить актуальность',review,'search','Сигналы, требующие чтения материалов'],
      ['Суды в справочнике',state.db.courts.length,'court','Контур наблюдения по официальным сайтам'],
      ['Мои предложения',local.drafts.length,'document','Черновики сохранены в этом браузере']
    ];
    return `<div class="metrics">${items.map(([label,n,i,foot])=>`<div class="metric-card"><div class="metric-top"><span>${esc(label)}</span><span class="metric-icon">${icon(i)}</span></div><div class="metric-number">${number(n)}</div><div class="metric-foot">${esc(foot)}</div></div>`).join('')}</div>`;
  }
  function amountBlock(o) {
    if(!positiveMoney(o.amountRub))return `<div class="amount">Цена не указана</div><div class="amount-label">Стоимость экспертизы не опубликована</div>`;
    const labels={expert_fee:'Опубликованная стоимость экспертизы',claim:'Сумма иска · не бюджет экспертизы',contract:'Цена контракта / закупки',not_published:'Назначение суммы требует проверки'};
    return `<div class="amount">${esc(money(o.amountRub))}</div><div class="amount-label">${esc(o.amountLabel||labels[o.amountType]||'Тип суммы уточняется')}</div>`;
  }
  function leadRows(items) {
    if(!items.length)return emptyState('Подходящих записей пока нет','Измените фильтр или проверьте первоисточники. Отсутствие записи в этом срезе не означает отсутствия дел в суде.');
    return `<ul class="lead-list">${items.map(o=>`<li class="lead-row" data-open-id="${esc(o.id)}"><span class="lead-glyph">${icon('document')}</span><div class="lead-main"><div class="lead-top"><span class="case-number">${esc(o.caseNumber||'Публичный запрос')}</span>${statusTag(o)}${o.sourceType==='procurement_adjacent'?'<span class="tag blue">Смежная закупка</span>':''}${local.work[o.id]?`<span class="tag blue">${esc(WORK_STATUS[local.work[o.id]]||'В работе')}</span>`:''}</div><h3 class="lead-title"><button class="lead-open" type="button" data-action="open-detail" data-id="${esc(o.id)}">${esc(o.title||o.category||'Судебно-строительная экспертиза')}</button></h3><div class="lead-court">${icon('court')}<span>${esc(courtName(o))}</span></div><p class="lead-summary">${esc(shorten(o.summary,145))}</p></div><div class="lead-meta">${amountBlock(o)}<div class="lead-date">${o.deadline?'Срок: '+esc(shortDate(o.deadline)):'Акт / извещение: '+esc(shortDate(o.publishedAt))}</div>${urgent(o)?`<span class="tag urgent">До 7 дней</span>`:''}</div></li>`).join('')}</ul>`;
  }
  function overview() {
    const open=records().filter(o=>statusKey(o)==='open_confirmed').length;
    const items=sortedRecords().slice(0,6);
    const sources=sourceRows().slice(0,4);
    return heading('Рабочая панель / судебно-строительная экспертиза','Судебный мониторинг','Проверяйте дела, оценивайте возможность участия и готовьте предложения на основе открытых источников.',`<button class="button secondary" data-action="export-csv">${icon('down')}Экспорт реестра</button><button class="button primary" data-view="opportunities">Открыть базу${icon('arrow')}</button>`)+
    `<section class="insight-banner"><div class="banner-copy"><div class="banner-chip">${icon('radar')}Москва · открытые судебные источники</div><h2>От судебного акта<br>к обоснованному предложению</h2><p>${open?'Подтверждённые запросы и сигналы для проверки собраны в одном рабочем пространстве.':'Собрана база для поиска заказов. Открытый приём предложений пока не подтверждён — начните с проверки сигналов.'}</p></div><div class="banner-art" aria-hidden="true"><i class="radar-ring r1"></i><i class="radar-ring r2"></i><i class="radar-ring r3"></i><i class="radar-ring r4"></i><i class="radar-axis"></i><i class="radar-axis a2"></i><i class="radar-sweep"></i><i class="radar-point"></i><i class="radar-point p2"></i><span class="radar-center">${icon('court')}</span><span class="radar-label">ПОИСК · ПРОВЕРКА · ПРЕДЛОЖЕНИЕ</span></div></section>`+metrics()+
    `<div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h2>Дела и опубликованные запросы<span class="panel-count">${number(records().length)}</span></h2><p>Сначала — подтверждённые возможности, затем сигналы для проверки</p></div><button class="link-button" data-view="opportunities">Вся база${icon('arrow')}</button></div><div class="subtle-note">${icon('info')}<span>Архивное определение показывает спрос на экспертизу. Оно не подтверждает, что суд сейчас принимает предложения.</span></div>${leadRows(items)}<div class="panel-bottom"><span>Срез: ${esc(formatDate(state.db.meta?.asOf))}</span><span>${items.length} из ${records().length} записей</span></div></section><aside class="side-stack"><section class="panel"><div class="compact-heading"><h2>Состояние источников</h2>${icon('radar')}</div><div class="source-summary">${sources.length?sources.map(s=>`<div class="source-line"><span class="status-dot ${sourceHealth(s).className==='healthy'?'':'warning'}"></span><span class="source-name">${esc(shorten(s.name||s.id,35))}</span>${sourceTag(s)}</div>`).join(''):'<p class="source-time">Журнал проверок ещё не опубликован.</p>'}<p class="source-time">${esc(monitoringTimeLabel('Последняя сетевая проверка'))}</p><button class="link-button" data-view="sources" style="margin-top:13px">Журнал и ограничения${icon('arrow')}</button></div></section><section class="task-card">${icon('document')}<h3>Предложение с привязкой к делу</h3><p>Добавьте свою цену, срок и квалификацию эксперта. Сохраните черновик для проверки перед отправкой.</p><button class="button" data-view="proposals">Подготовить предложение${icon('arrow')}</button></section><p class="legend-mini"><b>Обновление панели — каждую минуту.</b> Панель перечитывает опубликованный срез. Доступность и свежесть каждого первоисточника проверяются отдельно.</p></aside></div>`;
  }
  function option(value,label,selected){return `<option value="${esc(value)}"${selected===value?' selected':''}>${esc(label)}</option>`;}
  function searchField(placeholder) { return `<label class="search-field">${icon('search')}<span class="sr-only">Поиск</span><input id="search-input" type="search" value="${esc(state.search)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`; }
  function opportunities() {
    const regions=[...new Set(records().map(o=>o.region).filter(Boolean))].sort();
    const courts=[...new Set(records().map(courtName))].sort((a,b)=>a.localeCompare(b,'ru'));
    const list=filterRecords();
    return heading('Реестр возможностей','Дела и запросы','Публичные материалы, связанные со строительными экспертизами. Откройте карточку, чтобы проверить акт и определить следующий шаг.',`<button class="button secondary" data-action="export-csv">${icon('down')}Скачать CSV</button>`)+
    `<section class="panel"><div class="filter-bar">${searchField('Поиск по делу, суду или предмету экспертизы')}<label class="sr-only" for="region-filter">Регион</label><select class="select-field" id="region-filter">${option('all','Все регионы',state.region)}${regions.map(v=>option(v,v,state.region)).join('')}</select><label class="sr-only" for="court-filter">Суд</label><select class="select-field" id="court-filter">${option('all','Все суды',state.court)}${courts.map(v=>option(v,v,state.court)).join('')}</select><label class="sr-only" for="source-type-filter">Тип записи</label><select class="select-field" id="source-type-filter">${option('all','Все типы записей',state.sourceType)}${option('court_decision','Судебные дела',state.sourceType)}${option('procurement_adjacent','Смежные закупки',state.sourceType)}</select></div><div class="filter-chips" aria-label="Фильтр статуса">${[['all','Все записи'],...Object.entries(STATUS)].map(([key,label])=>`<button class="filter-chip ${state.status===key?'active':''}" type="button" data-action="filter-status" data-status="${esc(key)}" aria-pressed="${state.status===key}">${esc(label)}<span>${key==='all'?records().length:records().filter(o=>statusKey(o)===key).length}</span></button>`).join('')}</div><div id="lead-results">${leadRows(list)}</div><div class="panel-bottom"><span id="lead-result-count">Найдено ${number(list.length)} из ${number(records().length)}</span><span>Суммы — только с указанием их назначения</span></div></section><p class="result-caption">Клик по записи открывает первоисточники, содержание определения, ограничения проверки и локальные заметки.</p>`;
  }
  function filteredCourts() {
    const q=state.search.trim().toLocaleLowerCase('ru-RU');
    return state.db.courts.filter(c=>(state.region==='all'||c.region===state.region)&&(state.courtType==='all'||c.kind===state.courtType)&&(!q||[c.name,c.region,c.address,c.note].some(t=>plain(t).toLocaleLowerCase('ru-RU').includes(q))));
  }
  function courtCards(courts) {
    if(!courts.length)return emptyState('Суды не найдены','Попробуйте другое название, регион или тип суда.');
    return `<div class="court-grid">${courts.map(c=>`<article class="court-card"><div class="court-card-head"><span class="court-icon">${icon('court')}</span><span class="tag">${esc(c.kind||'Суд')}</span></div><h3>${esc(c.name)}</h3><div class="court-region">${esc(c.region||'Москва')}</div><p class="court-note">${esc(shorten(c.note||'Откройте официальный сайт и проверьте публикации по назначению экспертиз и поиску экспертной организации.',200))}</p>${c.address?`<div class="court-contact">${esc(c.address)}</div>`:''}${c.email?`<div class="court-contact">${esc(c.email)}</div>`:''}${c.phone?`<div class="court-contact">${esc(c.phone)}</div>`:''}<div class="court-links">${external(c.website,'Сайт суда')}${c.caseSearchUrl?external(c.caseSearchUrl,'Поиск дел'):''}${c.contactUrl?external(c.contactUrl,'Контакты'):''}</div></article>`).join('')}</div>`;
  }
  function courts() {
    const regions=[...new Set(state.db.courts.map(c=>c.region).filter(Boolean))].sort();
    const kinds=[...new Set(state.db.courts.map(c=>c.kind).filter(Boolean))].sort();
    const filtered=filteredCourts();
    return heading('Контур наблюдения','Справочник судов','Официальные сайты и точки входа для проверки дел. Наличие суда в справочнике не означает, что все его дела просмотрены.',`<button class="button secondary" data-action="export-courts">${icon('down')}Скачать справочник</button>`)+
    `<section class="panel"><div class="filter-bar" style="border-bottom:0">${searchField('Найти суд по названию или адресу')}<label class="sr-only" for="region-filter">Регион</label><select class="select-field" id="region-filter">${option('all','Все регионы',state.region)}${regions.map(v=>option(v,v,state.region)).join('')}</select><label class="sr-only" for="court-type-filter">Тип суда</label><select class="select-field" id="court-type-filter">${option('all','Все типы судов',state.courtType)}${kinds.map(v=>option(v,v,state.courtType)).join('')}</select></div></section><p class="result-caption" id="court-result-count">В справочнике ${filtered.length} из ${state.db.courts.length} судов</p><div id="court-results">${courtCards(filtered)}</div>`;
  }
  function sources() {
    const rows=sourceRows();const candidates=Array.isArray(state.monitor?.newCandidates)?state.monitor.newCandidates:[];
    return heading('Наблюдаемость и качество данных','Источники и обновления','Проверка доступности источника и подтверждение нового заказа — разные этапы. Здесь видно, что удалось проверить автоматически.',`<button class="button secondary" data-action="refresh">${icon('refresh')}Обновить срез</button>`)+
    `<div class="source-info-strip">${icon('clock')}<div><h3>${esc(monitoringTimeLabel('Последний сетевой запуск'))}</h3><p>Панель загружает файлы данных каждую минуту. Это не повторная проверка дел. CAPTCHA, ограничения доступа и задержки публикации могут требовать ручной проверки.</p></div></div>${automationPanel()}${state.monitorError?`<div class="detail-warning" style="margin:0 0 20px">${esc(state.monitorError)} Последние известные сведения не подтверждают успешность текущей проверки.</div>`:''}<div class="source-grid">${rows.length?rows.map(s=>`<article class="source-card"><div class="source-card-top"><h3>${esc(s.name||s.id||'Источник')}</h3>${sourceTag(s)}</div><p>${esc(plain(s.notes||s.note||s.description)||'Для оценки актуальности откройте официальный источник и материалы конкретного дела.')}</p>${external(s.url,'Открыть источник','button secondary small')}<div class="source-card-details"><div><span class="small-label">Проверено</span><span class="small-value">${s.checkedAt?esc(formatDate(s.checkedAt,true)):'Нет подтверждённой даты'}</span></div><div><span class="small-label">HTTP / способ</span><span class="small-value">${s.httpStatus?esc(s.httpStatus):'—'}${s.type?' · '+esc(s.type):''}</span></div></div>${s.error?`<div class="source-error">${esc(shorten(s.error,400))}</div>`:''}</article>`).join(''):emptyState('Журнал ещё не опубликован','Данные проверки появятся после успешного запуска сборщика.')}</div>${candidates.length?`<section class="panel section-gap"><div class="panel-heading"><div><h2>Новые кандидаты из сборщика<span class="panel-count">${candidates.length}</span></h2><p>Автоматически найденные ссылки. Статус открытого запроса не подтверждён.</p></div></div><div class="candidate-list">${candidates.map(c=>`<article class="candidate-row">${external(c.url||c.sourceUrl,c.title||c.name||'Найденный документ')}<p>${esc(c.sourceName||c.source||'')}${c.discoveredAt?' · '+esc(formatDate(c.discoveredAt,true)):''}</p>${c.excerpt?`<p>${esc(shorten(c.excerpt,240))}</p>`:''}</article>`).join('')}</div></section>`:''}${limitations()}`;
  }
  function limitations() {
    const list=Array.isArray(state.db.meta?.limitations)?state.db.meta.limitations:[];
    if(!list.length)return '';
    return `<section class="limitations"><h3>Границы текущего исследования</h3><ul>${list.map(t=>`<li>${esc(plain(t))}</li>`).join('')}</ul></section>`;
  }
  function newForm(record=null) {
    return {id:'',recordId:record?.id||'',court:record?courtName(record):'',caseNumber:record?.caseNumber||'',subject:record?.title||'Судебная строительно-техническая экспертиза',organization:local.company.organization||'АНО «МСК-Эксперт»',requisites:local.company.requisites||'',contact:local.company.contact||'info@sud-mskexpert.ru · +7 (495) 648-50-91',expert:local.company.expert||'',qualification:local.company.qualification||'',price:record&&positiveMoney(local.notes[record.id]?.proposalRub)?String(local.notes[record.id].proposalRub):'',days:'',conditions:'',attachments:'Сведения об эксперте и квалификации; документы об образовании; подтверждение опыта по предмету исследования.',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  }
  function field(id,label,value,placeholder='',type='text',wide=false,hint='') {
    return `<div class="field ${wide?'wide':''}"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" name="${esc(id)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${type==='number'?' min="1" step="1"':''}>${hint?`<p class="field-hint">${esc(hint)}</p>`:''}</div>`;
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
    return `ПРОЕКТ ДЛЯ ПРОВЕРКИ. НЕ ОТПРАВЛЕН.\n${miss.length?'Не заполнено: '+miss.join(', ')+'.\n':''}\n${procurement?'Заказчик: ':'В '}${placeholder(f.court,procurement?'НАИМЕНОВАНИЕ ЗАКАЗЧИКА':'НАИМЕНОВАНИЕ СУДА')}\n${procurement?'По закупке':'По делу'} № ${placeholder(f.caseNumber,procurement?'НОМЕР ЗАКУПКИ':'НОМЕР ДЕЛА')}\n\nИНФОРМАЦИЯ О ВОЗМОЖНОСТИ ПРОВЕДЕНИЯ ${procurement?'ИССЛЕДОВАНИЯ':'ЭКСПЕРТИЗЫ'}\n\n${placeholder(f.organization,'ПОЛНОЕ НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ')} предлагает рассмотреть возможность проведения исследования по вопросу: ${placeholder(f.subject,'ПРЕДМЕТ ИССЛЕДОВАНИЯ')}.\n\nПредлагаемый ${procurement?'специалист':'эксперт'}: ${placeholder(f.expert,'ФИО СПЕЦИАЛИСТА')}.\nКвалификация и профильный опыт: ${placeholder(f.qualification,'ПОДТВЕРЖДЁННЫЕ СВЕДЕНИЯ О КВАЛИФИКАЦИИ')}.\n\nПредварительная стоимость: ${price}.\nПредлагаемый срок: ${days} после получения полного комплекта материалов и обеспечения доступа к объекту, если осмотр необходим.\n\nСтоимость, состав работ и срок подлежат уточнению после ознакомления с вопросами и доступными материалами. Налоговый режим и состав включённых расходов указываются в окончательном предложении.\n\n${f.conditions?.trim()?'Условия и состав работ:\n'+f.conditions.trim()+'\n\n':''}Приложения к окончательному предложению:\n${placeholder(f.attachments,'ПЕРЕЧЕНЬ ПОДТВЕРЖДАЮЩИХ ДОКУМЕНТОВ')}.\n\nРеквизиты: ${placeholder(f.requisites,'ИНН / ОГРН / ЮРИДИЧЕСКИЙ АДРЕС')}.\nКонтакт для связи: ${placeholder(f.contact,'EMAIL И ТЕЛЕФОН')}.\n\n[ДОЛЖНОСТЬ, ФИО И ПОДПИСЬ УПОЛНОМОЧЕННОГО ЛИЦА]\n[ДАТА]\n\n${procurement?'Перед участием: проверить извещение, требования к участникам и предмету закупки, сроки, обеспечения и порядок подачи через ЭТП. Этот проект не заменяет заявку по установленной форме.':'Перед подачей: проверить актуальность дела, адресата, процессуальный канал и отсутствие конфликта интересов. Этот проект не подтверждает назначение эксперта судом.'}`;
  }
  function draftsPanel() {
    return `<section class="panel"><div class="compact-heading"><h2>Сохранённые черновики</h2><span class="panel-count">${local.drafts.length}</span></div>${local.drafts.length?`<ul class="drafts-list">${[...local.drafts].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(d=>`<li class="draft-row">${icon('document')}<div><button class="draft-title" data-action="load-draft" data-id="${esc(d.id)}">${esc(d.caseNumber||'Без номера дела')}</button><p>${esc(shorten(d.court||'Суд не указан',60))}<br>${positiveMoney(d.price)?esc(money(d.price)):'Цена не задана'} · ${esc(shortDate(d.updatedAt))}</p></div><button class="icon-button" data-action="delete-draft" data-id="${esc(d.id)}" aria-label="Удалить черновик ${esc(d.caseNumber||'без номера')}">${icon('trash')}</button></li>`).join('')}</ul>`:`<div class="empty-state" style="padding:26px 20px"><p style="margin-bottom:0">После сохранения предложения появятся здесь.</p></div>`}</section>`;
  }
  function proposals() {
    if(!state.form)state.form=newForm();const f=state.form;
    return heading('Локальная рабочая область','Мои предложения','Подготовьте документ на основе проверенного дела. Черновики сохраняются в этом браузере и не отправляются получателям.',`<button class="button secondary" data-action="new-draft">${icon('plus')}Новый черновик</button>`)+
    `<div class="proposal-layout"><section class="panel"><div class="panel-heading"><div><h2>Параметры предложения</h2><p>Ваша цена хранится отдельно от опубликованных сумм</p></div><span class="tag blue">Черновик</span></div><form class="proposal-form" id="proposal-form"><div class="proposal-status">${icon('info')}<span id="proposal-completeness">${missingForm(f).length?'Заполните: '+esc(missingForm(f).join(', '))+'.':'Основные поля заполнены. Проверьте документы и допустимый способ подачи.'}</span></div><div class="field-grid"><div class="field wide"><label for="recordId">Привязать к записи в базе</label><select name="recordId" id="recordId">${option('','Самостоятельное предложение',f.recordId)}${records().map(o=>option(o.id,(o.caseNumber||'Запрос')+' — '+shorten(o.title,78),f.recordId)).join('')}</select><p class="field-hint">Архивная запись используется только как пример. Проверьте возможность участия по актуальному делу.</p></div>${field('court','Суд / получатель',f.court,'Полное наименование суда','text',true)}${field('caseNumber','Номер дела',f.caseNumber,'Например, А40-…/2026')}${field('subject','Предмет исследования',f.subject,'Вопросы, которые требует исследовать суд')}${field('price','Предлагаемая стоимость, ₽',f.price,'Ваша оценка','number',false,'Это собственный расчёт, а не сумма из акта.')}${field('days','Предлагаемый срок, дней',f.days,'Календарных дней','number')}</div><h3 class="form-section-title">Организация и эксперт</h3><div class="field-grid">${field('organization','Наименование организации',f.organization,'Юридическое наименование','text',true)}${field('expert','ФИО эксперта',f.expert,'Кандидатуру подтверждает организация','text',true)}${area('qualification','Квалификация и профильный опыт',f.qualification,'Образование, специальность, стаж и релевантные исследования','Укажите только сведения, которые подтверждаются документами.')}${area('requisites','Реквизиты организации',f.requisites,'ИНН, ОГРН, юридический адрес')}${field('contact','Контакт для связи',f.contact,'Email и телефон','text',true)}</div><h3 class="form-section-title">Объём и условия</h3><div class="field-grid">${area('conditions','Условия проведения исследования',f.conditions,'Материалы, вопросы, доступ к объекту, расходы, налоговый режим')}${area('attachments','Приложения',f.attachments,'Перечень документов к предложению')}</div><div class="form-actions"><button class="button primary" type="submit">${icon('save')}Сохранить черновик</button><button class="button secondary" type="button" data-action="copy-proposal">${icon('copy')}Скопировать</button><button class="button secondary" type="button" data-action="download-proposal">${icon('down')}Скачать TXT</button><button class="button secondary" type="button" data-action="print-proposal">${icon('print')}Печать / PDF</button></div></form></section><aside class="proposal-side">${draftsPanel()}<div class="local-note"><strong>Данные остаются у вас.</strong><br>Заметки, цены и реквизиты хранятся локально в браузере. Они не попадают в публичный репозиторий или Google-таблицу. Очистка данных браузера удалит черновики.<div class="button-row" style="margin-top:12px"><button class="button secondary small" data-action="backup">${icon('down')}Резервная копия</button><button class="button ghost small" data-action="import-backup">Восстановить</button></div></div><div class="preview-area section-gap"><div class="preview-toolbar"><h2>Предпросмотр документа</h2><span class="tag">Не отправлен</span></div><pre class="proposal-preview" id="proposal-preview">${esc(proposalText(f))}</pre></div></aside></div>`;
  }
  function guide() {
    return heading('Методика и порядок работы','Как работает мониторинг','Одна последовательность: обнаружить сигнал, подтвердить статус, оценить работу и подготовить предложение.')+
    `${automationPanel()}<div class="guide-grid"><section class="guide-card full"><h2>От источника до предложения</h2><div class="guide-steps"><div class="guide-step"><span class="step-counter">01</span><b>Найти сигнал</b><p>Открыть реестр, новый документ или судебное дело с вопросом об экспертизе.</p></div><div class="guide-step"><span class="step-counter">02</span><b>Проверить акт</b><p>Уточнить статус, вопросы, сроки и фактический порядок представления кандидатуры.</p></div><div class="guide-step"><span class="step-counter">03</span><b>Рассчитать работу</b><p>Определить эксперта, объём, стоимость, срок и необходимые материалы.</p></div><div class="guide-step"><span class="step-counter">04</span><b>Подготовить КП</b><p>Сохранить проект, приложить подтверждения и проверить способ подачи.</p></div></div></section><section class="guide-card"><span class="guide-number">АВТОМАТИЧЕСКИ</span><h2>Что обновляет система</h2><ul><li>Панель перечитывает опубликованные JSON-файлы каждую минуту, пока открыта.</li><li>Сетевой сборщик проверяет 4 настроенные страницы и сохраняет статусы. Остальные источники требуют ручной проверки; весь справочник судов автоматически не обходится.</li><li>Новые найденные ссылки становятся кандидатами для проверки. Они не получают статус подтверждённого заказа автоматически.</li><li>При ошибке источника показывается ограничение; последняя дата не заменяется временем открытия страницы.</li></ul></section><section class="guide-card"><span class="guide-number">ПРОВЕРЯЕТ СПЕЦИАЛИСТ</span><h2>Что требует решения человека</h2><ul><li>Полный текст актуального определения и дальнейшее движение дела.</li><li>Есть ли запрос к экспертам и можно ли ещё представить предложение.</li><li>Подходят ли квалификация, оборудование и сроки организации.</li><li>Кому и каким процессуальным способом представить документы.</li><li>Состав работ, цена, налоговый режим, конфликт интересов и приложения.</li></ul></section><section class="guide-card"><span class="guide-number">СТАТУСЫ</span><h2>Как читать базу</h2><ul><li><b>Приём подтверждён</b> — есть проверенный источник, подтверждающий актуальную возможность подачи.</li><li><b>Проверить актуальность</b> — найден релевантный сигнал, но возможность участия не подтверждена.</li><li><b>Архивный пример</b> — свидетельство спроса и пример формулировок; не действующий заказ.</li><li><b>Завершено</b> — публикация больше не рассматривается как открытая возможность.</li></ul></section><section class="guide-card"><span class="guide-number">СУММЫ И ДОКАЗАТЕЛЬСТВА</span><h2>Что означает цена</h2><ul><li>Стоимость экспертизы, сумма иска и цена закупки отмечаются разными подписями.</li><li>Если стоимость не опубликована, поле остаётся пустым.</li><li>Собственная цена вводится только в локальной заметке или проекте КП.</li><li>Дата решения не равна дате окончания подачи предложений.</li><li>Наличие ссылки на суд не означает проверку каждого дела этого суда.</li></ul></section><section class="guide-card full"><h2>Рабочие данные и резервная копия</h2><p>Публичный реестр доступен всем посетителям сайта. Ваши заметки, черновики, цены и введённые реквизиты хранятся только в localStorage этого браузера. На другом устройстве они не появятся автоматически. Скачайте резервную копию и перенесите её через кнопку восстановления. Не размещайте копию с рабочими данными в публичном репозитории.</p><div class="button-row"><button class="button secondary" data-action="backup">${icon('down')}Скачать резервную копию</button><button class="button secondary" data-action="import-backup">${icon('upload')}Восстановить</button>${state.db.meta?.repoUrl?external(state.db.meta.repoUrl,'Код и инструкция','button secondary'):''}${state.db.meta?.sheetUrl?external(state.db.meta.sheetUrl,'Google-таблица','button secondary'):''}</div></section></div>${limitations()}`;
  }
  function render() {
    const main=$('#main');updateNav();
    if(!state.db){
      if(state.loadError)main.innerHTML=`<section class="error-box"><h1>База пока недоступна</h1><p>Не удалось загрузить опубликованные данные: ${esc(state.loadError)}.</p><p>Проверьте, что файлы <code>data/registry.json</code> и <code>data/monitoring.json</code> опубликованы рядом с панелью. Открывайте приложение через веб-сервер или GitHub Pages.</p><button class="button primary" data-action="refresh">${icon('refresh')}Повторить загрузку</button></section>`;
      return;
    }
    const views={overview,opportunities,courts,sources,proposals,guide};
    main.innerHTML=`<div data-page="${esc(state.view)}">${state.loadError?`<div class="source-info-strip">${icon('info')}<div><h3>Показан предыдущий срез</h3><p>Последнее обновление не удалось. Проверьте первоисточники перед использованием данных.</p></div></div>`:''}${freshnessBanner()}${views[state.view]()}</div>`;
    hydrateIcons(main);updateMeta();showStorageConflict();
  }
  function updateFilterResults() {
    if(state.view==='opportunities'){
      const list=filterRecords();$('#lead-results').innerHTML=leadRows(list);$('#lead-result-count').textContent=`Найдено ${number(list.length)} из ${number(records().length)}`;
    }else if(state.view==='courts'){
      const list=filteredCourts();$('#court-results').innerHTML=courtCards(list);$('#court-result-count').textContent=`В справочнике ${list.length} из ${state.db.courts.length} судов`;
    }
  }
  function openDetail(id,opener) {
    const o=getRecord(id);if(!o)return;
    state.detailId=id;state.returnFocus=opener||document.activeElement;
    const note=local.notes[id]||{};const isOpen=statusKey(o)==='open_confirmed';
    $('#detail-content').innerHTML=`<header class="detail-header"><span>Карточка исследования</span><button class="icon-button" data-action="close-detail" aria-label="Закрыть карточку">${icon('close')}</button></header><div class="detail-body"><div class="lead-top"><span class="case-number">${esc(o.caseNumber||'Публичный запрос')}</span>${statusTag(o)}</div><h2 id="detail-title">${esc(o.title||'Судебно-строительная экспертиза')}</h2><p class="detail-court">${esc(courtName(o))} · ${esc(o.region||'Москва')}</p><p class="detail-description">${esc(plain(o.summary))}</p>${!isOpen?`<div class="detail-warning">${expired(o)&&o.status==='needs_review'?'Срок по найденным данным истёк. Запись исключена из актуальных сигналов. Проверьте в официальном извещении, было ли продление; исходный исследовательский статус сохранён в базе.':statusKey(o)==='historical'?'Это архивный пример. Он не подтверждает действующий запрос и возможность подачи предложения.':statusKey(o)==='closed'?'Эта запись завершена или срок приёма истёк. Используйте её для исследования спроса.':'Актуальный приём предложений не подтверждён. Сначала откройте материалы дела и проверьте дальнейшее движение.'}</div>`:''}<div class="detail-data-grid"><div><span class="small-label">Дата акта / извещения</span><span class="small-value">${esc(formatDate(o.publishedAt))}</span></div><div><span class="small-label">Проверено</span><span class="small-value">${esc(formatDate(o.checkedAt))}</span></div><div><span class="small-label">Срок подачи</span><span class="small-value">${esc(formatDate(o.deadline,typeof o.deadline==='string'&&/T\d{2}:\d{2}/.test(o.deadline)))}</span></div><div><span class="small-label">Заседание</span><span class="small-value">${esc(formatDate(o.hearingAt,typeof o.hearingAt==='string'&&/T\d{2}:\d{2}/.test(o.hearingAt)))}</span></div><div style="grid-column:1/-1">${amountBlock(o)}</div></div><section class="detail-section"><h3>Что следует из опубликованного материала</h3><p>${esc(plain(o.decisionSummary)||'Краткое содержание решения не заполнено. Изучите первоисточник.')}</p>${o.sourceExcerpt?`<blockquote>${esc(shorten(o.sourceExcerpt,650))}</blockquote>`:''}<div class="detail-actions">${external(o.sourceUrl,'Открыть источник','button secondary')}${o.documentUrl&&o.documentUrl!==o.sourceUrl?external(o.documentUrl,'Документ / определение','button secondary'):''}</div></section><section class="detail-section"><h3>Следующий шаг</h3><p>${esc(plain(o.nextAction)||'Проверить актуальный статус дела, наличие запроса и допустимый способ представления информации.')}</p></section><section class="detail-section"><h3>Основание и ограничения проверки</h3><p>${esc(verificationText(o.verification))}${o.primaryAccess?'<br>'+esc(o.primaryAccess):''}${o.dateBasis?'<br>Дата: '+esc(o.dateBasis):''}</p></section>${o.eligibilityNote?`<section class="detail-section"><h3>Условия допуска и предмет</h3><p>${esc(o.eligibilityNote)}</p></section>`:''}${Array.isArray(o.additionalSources)&&o.additionalSources.length?`<section class="detail-section"><h3>Дополнительная сверка</h3><div class="detail-actions">${o.additionalSources.map((url,i)=>external(url,'Источник '+(i+2),'button secondary small')).join('')}</div></section>`:''}<section class="detail-local"><h3>Моя работа с записью</h3><div class="field-grid"><div class="field"><label for="detail-work">Рабочий статус</label><select id="detail-work">${Object.entries(WORK_STATUS).map(([v,t])=>option(v,t,local.work[id]||'new')).join('')}</select></div><div class="field"><label for="detail-price">Моя цена, ₽</label><input id="detail-price" type="number" min="1" step="1" value="${esc(note.proposalRub||'')}" placeholder="Собственная оценка"></div><div class="field wide"><label for="detail-note">Заметка</label><textarea id="detail-note" placeholder="Что проверить, какие материалы запросить, что уточнить…">${esc(note.text||'')}</textarea><p class="field-hint">Сохраняется только в этом браузере, отдельно от публичной базы.</p></div></div></section></div><footer class="detail-footer"><button class="button secondary" data-action="save-note">${icon('save')}Сохранить заметку</button><button class="button primary" data-action="draft-from-detail">Подготовить КП${icon('arrow')}</button></footer>`;
    const dialog=$('#detail-dialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
  }
  function saveNote(showToast=true) {
    const id=state.detailId;if(!id||!$('#detail-note'))return;
    const value=$('#detail-price').value;
    local.notes[id]={text:$('#detail-note').value,proposalRub:positiveMoney(value)?Number(value):null,updatedAt:new Date().toISOString()};
    const work=$('#detail-work').value;if(work==='new')delete local.work[id];else local.work[id]=work;
    if(persist()&&showToast)notify('Заметка и ваша цена сохранены в этом браузере.');
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
    const f=captureForm();if(!f)return;
    if(!f.id)f.id='draft-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
    const i=local.drafts.findIndex(d=>d.id===f.id);if(i>=0)local.drafts[i]={...f};else local.drafts.push({...f});
    local.company={organization:f.organization,requisites:f.requisites,contact:f.contact,expert:f.expert,qualification:f.qualification};
    if(f.recordId)local.work[f.recordId]='draft';
    if(persist()){notify('Черновик сохранён. Документ не отправлялся.');render();}
  }
  async function copyProposal() {
    const f=captureForm();if(!f)return;const text=proposalText(f);
    try{await navigator.clipboard.writeText(text);notify('Проект предложения скопирован.');}
    catch{
      const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.top='-1000px';document.body.appendChild(area);area.select();let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();notify(ok?'Проект предложения скопирован.':'Копирование недоступно. Скачайте документ в TXT.');
    }
  }
  function csvCell(v) { let s=plain(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'; }
  function csv(rows) { return '\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'); }
  function exportRegistry() {
    const list=state.view==='opportunities'?filterRecords():records();
    const rows=[['ID','Статус источника','Суд','Номер дела','Предмет','Регион','Дата акта / извещения','Срок предложения','Заседание','Опубликованная сумма, ₽','Назначение суммы','Моя цена, ₽','Содержание акта','Следующий шаг','Ссылка на материал','Ссылка на документ','Проверено','Основание проверки','Рабочий статус','Моя заметка'],...list.map(o=>[o.id,statusLabel(o),courtName(o),o.caseNumber,o.title,o.region,o.publishedAt,o.deadline,o.hearingAt,o.amountRub,({expert_fee:'Стоимость экспертизы',claim:'Сумма иска',contract:'Цена закупки / контракта',not_published:'Не опубликовано'})[o.amountType]||o.amountType,local.notes[o.id]?.proposalRub||'',o.decisionSummary,o.nextAction,o.sourceUrl,o.documentUrl,o.checkedAt,o.verification,WORK_STATUS[local.work[o.id]||'new'],local.notes[o.id]?.text||''])];
    download('msk-expert-cases-'+(state.db.meta?.asOf||'export')+'.csv',csv(rows),'text/csv;charset=utf-8');notify('Реестр выгружен в CSV. Он включает локальные цены и заметки.');
  }
  function exportCourts() {const rows=[['Суд','Тип','Регион','Официальный сайт','Поиск дел','Контакты','Email','Телефон','Адрес','Источник','Дата проверки','Примечание'],...filteredCourts().map(c=>[c.name,c.kind,c.region,c.website,c.caseSearchUrl,c.contactUrl,c.email,c.phone,c.address,c.sourceUrl,c.checkedAt,c.note])];download('msk-expert-courts.csv',csv(rows),'text/csv;charset=utf-8');}
  function closeMenu() {$('#sidebar').classList.remove('open');$('#sidebar-scrim').hidden=true;$('#mobile-menu').setAttribute('aria-expanded','false');}
  function openMenu() {$('#sidebar').classList.add('open');$('#sidebar-scrim').hidden=false;$('#mobile-menu').setAttribute('aria-expanded','true');}
  document.addEventListener('click',async event=>{
    const view=event.target.closest('[data-view]');if(view){event.preventDefault();setView(view.dataset.view);return;}
    const action=event.target.closest('[data-action]');
    if(action){
      event.preventDefault();const id=action.dataset.id;
      switch(action.dataset.action){
        case 'refresh':await loadData(true);break;
        case 'filter-status':state.status=action.dataset.status;render();break;
        case 'open-detail':openDetail(id,action);break;
        case 'close-detail':$('#detail-dialog').close();break;
        case 'save-note':saveNote();break;
        case 'draft-from-detail':{saveNote(false);state.form=newForm(getRecord(state.detailId));$('#detail-dialog').close();setView('proposals');break;}
        case 'new-draft':state.form=newForm();render();break;
        case 'load-draft':{const d=local.drafts.find(x=>x.id===id);if(d){state.form={...d};render();}break;}
        case 'delete-draft':{const d=local.drafts.find(x=>x.id===id);if(d&&window.confirm('Удалить локальный черновик '+(d.caseNumber||'без номера дела')+'?')){local.drafts=local.drafts.filter(x=>x.id!==id);if(state.form?.id===id)state.form=newForm();if(persist()){notify('Черновик удалён из этого браузера.');render();}}break;}
        case 'copy-proposal':await copyProposal();break;
        case 'download-proposal':{const f=captureForm();if(f)download('КП_'+safeFilename(f.caseNumber||'черновик')+'.txt',proposalText(f));break;}
        case 'print-proposal':refreshPreview();window.print();break;
        case 'export-csv':exportRegistry();break;
        case 'export-courts':exportCourts();break;
        case 'backup':download('msk-expert-private-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(exportWorkspaceSnapshot(),null,2),'application/json');notify('Резервная копия содержит ваши рабочие данные. Храните её приватно.');break;
        case 'reload-workspace':if(window.confirm('Перечитать сохранённые данные? Несохранённые правки этой вкладки будут заменены. Сначала скачайте их резервную копию.')){local=readLocal();storageConflict=false;state.form=null;if($('#detail-dialog').open)$('#detail-dialog').close();render();notify('Загружены последние сохранённые данные.');}break;
        case 'import-backup':$('#backup-input').click();break;
        case 'cancel-import':state.importData=null;$('#confirm-dialog').close();break;
        case 'confirm-import':if(state.importData){local=state.importData;state.importData=null;state.form=null;if(persist()){notify('Локальные данные восстановлены.');render();}}$('#confirm-dialog').close();break;
      }
      return;
    }
    const row=event.target.closest('[data-open-id]');if(row&&!event.target.closest('a,input,select,textarea'))openDetail(row.dataset.openId,$('.lead-open',row));
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='search-input'){state.search=event.target.value;clearTimeout(debounceTimer);debounceTimer=setTimeout(updateFilterResults,100);}
    if(event.target.closest('#proposal-form'))refreshPreview();
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='region-filter'){state.region=event.target.value;updateFilterResults();}
    if(event.target.id==='court-filter'){state.court=event.target.value;updateFilterResults();}
    if(event.target.id==='court-type-filter'){state.courtType=event.target.value;updateFilterResults();}
    if(event.target.id==='source-type-filter'){state.sourceType=event.target.value;updateFilterResults();}
    if(event.target.id==='recordId'){
      const o=getRecord(event.target.value);captureForm();if(o){state.form.recordId=o.id;state.form.court=courtName(o);state.form.caseNumber=o.caseNumber||'';state.form.subject=o.title||'';if(positiveMoney(local.notes[o.id]?.proposalRub))state.form.price=String(local.notes[o.id].proposalRub);}render();
    }
  });
  document.addEventListener('submit',event=>{if(event.target.id==='proposal-form'){event.preventDefault();saveDraft();}});
  $('#backup-input').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>5*1024*1024){notify('Файл слишком большой. Ожидается резервная копия до 5 МБ.');return;}
    try{const parsed=JSON.parse(await file.text());if(!validBackup(parsed))throw new Error('format');state.importData={version:1,notes:parsed.notes,work:parsed.work,drafts:parsed.drafts,company:parsed.company||{}};$('#confirm-dialog').showModal();}catch{notify('Файл не похож на резервную копию этой панели. Данные не изменены.');}
  });
  $('#refresh-button').addEventListener('click',()=>loadData(true));
  $('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.contains('open')?closeMenu():openMenu());
  $('#sidebar-scrim').addEventListener('click',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog')){const r=$('#detail-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('#detail-dialog').close();}});
  $('#detail-dialog').addEventListener('close',()=>{const returnFocus=state.returnFocus;const previousId=state.detailId;state.detailId=null;state.returnFocus=null;if(state.view!=='proposals')render();const replacement=[...document.querySelectorAll('[data-action="open-detail"]')].find(el=>el.dataset.id===previousId);if(returnFocus?.isConnected)returnFocus.focus();else if(replacement)replacement.focus({preventScroll:true});else $('#main').focus({preventScroll:true});});
  window.addEventListener('storage',event=>{if(event.storageArea===localStorage&&(event.key===STORE_KEY||event.key===null)&&event.newValue!==storageSnapshot){storageConflict=true;showStorageConflict();}});
  window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(Object.hasOwn(VIEW_NAMES,v)&&v!==state.view)setView(v);});
  window.addEventListener('beforeunload',event=>{if(state.view==='proposals'&&state.form){const f=captureForm();const saved=local.drafts.find(d=>d.id===f.id);if(f.caseNumber&&(!saved||['court','caseNumber','subject','price','days','expert','qualification','requisites','conditions','attachments'].some(k=>saved[k]!==f[k]))){event.preventDefault();event.returnValue='';}}});
  hydrateIcons();
  const initial=location.hash.slice(1);if(Object.hasOwn(VIEW_NAMES,initial))state.view=initial;
  updateNav();loadData();setInterval(()=>{if(!document.hidden)loadData();},60000);
})();
