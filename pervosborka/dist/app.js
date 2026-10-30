(function(){
'use strict';
const E=window.VectorEngine,D=window.VECTOR_DATA,KEY='rgsu-vector-1',app=document.getElementById('app');
if(!E||!D){app.innerHTML='<main class="container"><h1>Не удалось загрузить задания</h1><p>Обновите страницу, когда соединение восстановится.</p></main>';return;}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const track=id=>E.tracks.find(t=>t.id===id);
const labFor=id=>D.labs.find(l=>l.track===id||l.id===id);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const fmt=n=>Number(n).toFixed(1).replace('.',',');
const experienceLabels=['Ещё не пробовал','Пробовал с помощью','Делал самостоятельно','Завершил свой проект'];
const scaleLabels=D.scales.interest_1_5.values.filter(v=>Number.isInteger(v.value)).sort((a,b)=>a.value-b.value).map(v=>v.label);
let state=null,storageOK=true,groupResults=[],groupMessage='',demoState=null,recoveryRaw=null,recoveryIssues=[],recoveryBlocked=false;
let pendingImport=null,importMessage='',importTicket=0,pendingStart=null,groupDetails=new Map(),groupTicket=0;
let sceneControllers=new Map(),sceneCameras={},missionController=null,missionViews={},missionLabId=null,flatScenes={},meterIndex=0,xrController=null,xrView=null;
let campusSelected=null,robotController=null,robotView=null,engineeringController=null,engineeringView=null;
let focusController=null,sceneExploded=0,interestMode='cards',interestCursors={},toastTimer=null;
let navigationController=null,reportController=null,reportView={},robotMotionOptions=null,uiReducedMotion=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let guideController=null,partInspectorController=null,partInspectorView={selected:null};
const draftHistory=window.DraftHistory?.create({limit:30});
let routeOverviewController=null,routeOverviewView={},missionFocusController=null,missionFocusView={active:false},passportController=null,passportView={},currentPassportModel=null,pendingViewFocus=null;
const planArtifacts={drawing:'Рисунок или эскиз',model:'Модель или прототип',program:'Программа',protocol:'Протокол проверки',scenario:'Сценарий или макет взаимодействия'};
const ageGroups=['12–13','14–15','16–18','18+ (ознакомительно)'];
const EXPERIENCE_VERSION='2.0-visual';
function preserveRecovery(raw,issues){
 recoveryRaw=raw;recoveryIssues=issues;
 try{localStorage.setItem(KEY+'-recovery',raw);}catch(e){recoveryBlocked=true;}
}
try{
 recoveryRaw=localStorage.getItem(KEY+'-recovery');
 const raw=localStorage.getItem(KEY);
 if(raw&&raw!=='null'){
  try{const restored=E.restoreState(D,JSON.parse(raw));state=restored.state;if(restored.repaired)preserveRecovery(raw,restored.issues);}
  catch(e){preserveRecovery(raw,['Формат сохранения не удалось прочитать.']);}
 }
}catch(e){storageOK=false;}
function updateStorageStatus(){
 const saved=storageOK&&!recoveryBlocked;
 for(const node of document.querySelectorAll('[data-save-state]')){node.setAttribute('data-state',saved?'saved':'memory');const text=node.querySelector('span');if(text)text.textContent=saved?'Сохранено в браузере':'Только в этой вкладке';}
 for(const node of document.querySelectorAll('[data-storage-notice]'))node.hidden=saved;
 const main=document.getElementById('main');if(!main||!state)return;
 let warning=document.getElementById('live-storage-warning');
 if(saved){warning?.remove();return;}
 if(!warning){warning=document.createElement('p');warning.id='live-storage-warning';warning.className='storage-warning';warning.setAttribute('role','status');warning.textContent='Сохранение в браузере недоступно. Скачай ответы перед закрытием вкладки.';main.prepend(warning);}
}
function save(){if(!state||recoveryBlocked){updateStorageStatus();return false;}try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;updateStorageStatus();return true;}catch(e){storageOK=false;updateStorageStatus();return false;}}
function toast(msg){const box=document.getElementById('toast');clearTimeout(toastTimer);box.textContent=msg;box.hidden=false;toastTimer=setTimeout(()=>box.hidden=true,3600);}
function go(route){if(location.hash==='#'+route){render();window.scrollTo({top:0,behavior:'instant'});}else location.hash=route;}
function currentRoute(){try{return decodeURIComponent(location.hash.slice(1)||'home');}catch(e){return 'invalid-link';}}
function button(text,action,cls='btn-secondary',attrs=''){return `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;}
function icon(id,size=22){
 const paths={
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 engineering:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
 robotics:'<rect x="4" y="6" width="16" height="13" rx="4"/><path d="M12 2v4M7 22v-3M17 22v-3"/><circle cx="8" cy="11" r="1"/><circle cx="16" cy="11" r="1"/><path d="M8 15h8"/>',
 code:'<path d="m8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18"/>',
 ai:'<path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/><rect x="7" y="7" width="10" height="10" rx="3"/>',
 design:'<path d="m3 20 3-9L16 1l7 7-10 10zM6 11l7 7M3 20l5-2"/><path d="M2 23h20"/>',
 xr:'<path d="M4 6h16l2 12h-6l-4-4-4 4H2zM7 9v5M4.5 11.5h5M17 10h.01M19 13h.01"/>',
 research:'<path d="M9 2h6M10 2v7L3 20q-1 2 2 2h14q3 0 2-2L14 9V2M7 15h10"/><path d="M9 18h.01M15 19h.01"/>',
 social:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M3 8a3 3 0 0 0 0 6M21 8a3 3 0 0 1 0 6M2 21v-3M22 21v-3"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',check:'<path d="m4 12 5 5 11-11"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'
 };
 return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]||paths.arrow}</svg>`;
}
function header(route){
 const links=[['home','О проекте'],['labs','Карта лабораторий'],['method','Методика'],['mentor','Наставнику']];
 const nav=links.map(([id,label])=>`<a class="nav-link ${route===id?'active':''}" href="#${id}" ${route===id?'aria-current="page"':''}>${label}</a>`).join('');
 return `<header class="site-header"><div class="container header-inner"><a class="brand" href="#home" aria-label="ПЕРВОСБОРКА — главная"><span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3z" fill="currentColor"/><path d="m17 12 5 5-5 5-5-5z" fill="#d5f36b"/></svg></span><span>ПЕРВОСБОРКА<span class="brand-sub">ТЕХНОПАРК РГСУ</span></span></a><nav class="nav" aria-label="Главная навигация">${nav}</nav><div class="header-actions">${window.NavigationExperience?`<button type="button" class="nav-launch" data-nav-open aria-label="Быстрый доступ: поиск, вид и управление" title="Быстрый доступ · Ctrl / ⌘ K">${icon('search',20)}<span>Найти</span><kbd>Ctrl K</kbd></button>`:''}${state?button('Мой маршрут','go:hub','btn-small btn-secondary'):button('Начать','go:choose','btn-small btn-primary')}<details class="mobile-menu"><summary aria-label="Открыть навигацию">${icon('menu')}</summary><nav class="mobile-nav" aria-label="Навигация по разделам">${nav}<a href="#${state?'hub':'choose'}">${state?'Мой маршрут':'Начать экспедицию'}</a>${state?'<a href="#report">Моя карта</a><a href="#transfer">Перенести работу</a>':''}</nav></details></div></div></header>`;
}
function footer(){return `<footer class="footer"><div class="container footer-inner"><div><strong>ПЕРВОСБОРКА</strong> · Технопарк РГСУ<br><span class="small muted">Профориентационная экспедиция · визуальная редакция 2.0</span></div><div><a href="#method">Как устроен результат</a><br><span class="small muted">Ответы сохраняются в этом браузере.</span></div></div></footer>`;}
function labArt(id,extra=''){
 const i=Math.max(0,E.KEYS.indexOf(id)),x=(i%4)*100/3,y=Math.floor(i/4)*100;
 return `<div class="lab-art ${extra}" aria-hidden="true"><div class="lab-art-image" style="background-position:${x}% ${y}%"></div><span class="lab-art-no">0${i+1}</span>${['engineering','robotics','xr'].includes(id)?'<span class="lab-art-tag">3D / ИНТЕРАКТИВ</span>':''}</div>`;
}
function sceneShell(kind,title,fallback){
 const flat=!!flatScenes[kind];
 return `<section class="scene-shell" data-scene-shell="${kind}" aria-label="${esc(title)}"><div class="scene-toolbar"><span class="scene-title"><span class="live-dot"></span>${esc(title)}</span><div class="scene-tools">${window.FocusExperience?`<button type="button" id="scene-focus-${kind}" class="scene-focus-button" data-action="scene-focus:${kind}" aria-label="Открыть сцену крупно">⛶ Крупно</button>`:''}<button type="button" id="scene-mode-${kind}" data-action="scene-mode:${kind}" aria-pressed="${flat}">${flat?'Включить 3D':'Обычный вид'}</button><button type="button" data-action="scene-view:${kind}:iso" aria-label="Объёмный ракурс" ${flat?'disabled':''}>Объём</button><button type="button" data-action="scene-view:${kind}:top" aria-label="Ракурс сверху" ${flat?'disabled':''}>Сверху</button><button type="button" data-action="scene-view:${kind}:front" aria-label="Ракурс спереди" ${flat?'disabled':''}>Спереди</button><button type="button" data-action="scene-view:${kind}:side" aria-label="Ракурс сбоку" ${flat?'disabled':''}>Сбоку</button>${window.SceneCapture?`<button type="button" data-action="scene-capture:${kind}" aria-label="Сохранить текущий 3D-вид как PNG" ${flat?'disabled':''}>↓ PNG</button>`:''}</div></div><div class="scene-mount" data-scene="${kind}" ${flat?'hidden':''}></div><div class="scene-fallback" ${flat?'':'hidden'}>${fallback}</div><div class="scene-bottom"><p>${flat?'Обычный вид. Настройки задания остаются доступны. Для поворота модели включи 3D.':'Поверни модель движением пальца или мыши. Стрелки на клавиатуре — поворот, +/− — масштаб.'}</p><div class="scene-tools"><button type="button" data-action="scene-rotate:${kind}:left" aria-label="Повернуть модель влево" ${flat?'disabled':''}>↶</button><button type="button" data-action="scene-rotate:${kind}:right" aria-label="Повернуть модель вправо" ${flat?'disabled':''}>↷</button><button type="button" data-action="scene-zoom:${kind}:in" aria-label="Приблизить модель" ${flat?'disabled':''}>＋</button><button type="button" data-action="scene-zoom:${kind}:out" aria-label="Отдалить модель" ${flat?'disabled':''}>−</button><button type="button" data-action="scene-reset:${kind}" aria-label="Сбросить ракурс модели" ${flat?'disabled':''}>Сброс ракурса</button>${kind==='engineering'?`<button type="button" data-action="scene-explode:engineering" aria-pressed="${!!sceneExploded}" ${flat?'disabled':''}>${sceneExploded?'Собрать модель':'Показать состав'}</button>`:''}</div></div>${kind==='engineering'?`<p class="scene-training" id="engineering-parts-note" ${sceneExploded?'':'hidden'}>Условное разнесение частей — параметры модели не меняются.</p>`:''}</section>`;
}
function campusStatus(id){const entry=state?.labs[id];return entry?.first?'Проба сохранена':entry?.skipped?'Пока пропущено':'Можно попробовать';}
function campusChoice(t,i){return `<button type="button" class="campus-choice ${campusSelected===t.id?'is-selected':''} ${state?.labs[t.id]?.first?'is-tried':''}" data-campus-choice="${t.id}" data-action="campus-pick:${t.id}" aria-pressed="${campusSelected===t.id}" aria-label="Выбрать лабораторию: ${esc(t.name)}"><span class="campus-choice-number">${String(i+1).padStart(2,'0')}</span><span>${esc(t.name)}<small>${esc(campusStatus(t.id))}</small></span></button>`;}
function campusPreview(){
 const t=track(campusSelected);if(!t)return `<div class="campus-prompt-mark" aria-hidden="true">↗</div><p class="eyebrow">ВЫБЕРИ СВОЮ ПЕРВУЮ ПРОБУ</p><h2>Куда ведёт <br>любопытство?</h2><p>Нажми на номер здания или выбери лабораторию под картой. Здесь появится её задача.</p><p class="small campus-note">Это учебная карта направлений Технопарка РГСУ. Начать можно с любой лаборатории.</p>`;
 const lab=labFor(t.id);
 return `<div class="campus-preview-art">${labArt(t.id)}</div><p class="eyebrow">ЛАБОРАТОРИЯ ${String(E.KEYS.indexOf(t.id)+1).padStart(2,'0')} · ${esc(campusStatus(t.id))}</p><h2>${esc(t.name)}</h2><p class="campus-preview-task">${esc(lab.title)}</p><p>${esc(t.desc)}</p><a class="btn btn-primary campus-enter" href="#lab:${t.id}">${state?.labs[t.id]?.first?'Вернуться к миссии':'Открыть миссию'} ${icon('arrow')}</a><p class="small campus-note">Начни с того, что интересно. К другим лабораториям можно вернуться в любой момент.</p>`;
}
function campusQuickEntry(){const t=track(campusSelected);return t?`<span>Выбрано: <strong>${esc(t.name)}</strong></span><a href="#lab:${t.id}" class="btn btn-primary">Открыть эту миссию ${icon('arrow')}</a>`:'';}
function selectCampus(id){
 if(!E.KEYS.includes(id))return;campusSelected=id;
 const preview=document.getElementById('campus-preview');if(preview)preview.innerHTML=campusPreview();
 const quickEntry=document.getElementById('campus-quick-entry');if(quickEntry)quickEntry.innerHTML=campusQuickEntry();
 for(const button of document.querySelectorAll('[data-campus-choice]')){const selected=button.dataset.campusChoice===id;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));}
 sceneControllers.get('campus')?.update({selectedLab:id});
}
function campus(){
 const flat=`<div class="scene-flat-campus campus-flat-choices">${E.tracks.map(campusChoice).join('')}</div>`;
 return `<div class="campus-explorer"><div class="campus-section">${sceneShell('campus','Учебный 3D кампус / восемь лабораторий',flat)}<aside class="campus-aside" id="campus-preview" aria-live="polite" aria-atomic="true">${campusPreview()}</aside></div><div class="campus-selector"><div class="campus-selector-heading"><h3>Восемь входов в практику</h3><p>Маркеры на зданиях и кнопки здесь выбирают одну и ту же лабораторию.</p></div><div class="campus-choice-grid" role="group" aria-label="Выбор лаборатории">${E.tracks.map(campusChoice).join('')}</div><div id="campus-quick-entry" class="campus-quick-entry">${campusQuickEntry()}</div></div></div>`;
}
function home(){
 return `<section class="exp-hero studio-hero container"><div class="studio-hero-copy"><div class="edition-tag"><i></i> ТЕХНОПАРК РГСУ · 12–18 ЛЕТ</div><h1>Сначала попробуй.<br><span>Потом выбирай.</span></h1><p class="hero-lead">Проводи робота, собирай конструкции, создавай цифровые миры. Восемь лабораторий, в которых ты узнаёшь себя через действие.</p><div class="hero-actions">${button((state?'Продолжить экспедицию':'Начать экспедицию')+' '+icon('arrow'),state?'go:hub':'go:choose','btn-primary')}${button('Исследовать 3D кампус','go:labs','btn-secondary')}</div><div class="hero-meta"><span>${icon('clock',16)} В своём темпе</span><span>Можно начать без подготовки</span></div><div class="studio-highlights"><div class="studio-highlight"><strong>08</strong><span>лабораторий<br>для первой пробы</span></div><div class="studio-highlight"><strong>3D</strong><span>модели, которыми<br>ты управляешь</span></div><div class="studio-highlight"><strong>01</strong><span>твоя личная<br>карта интересов</span></div></div></div><div class="hero-art"><a class="hero-art-link" href="#labs" aria-label="Исследовать интерактивный кампус восьми лабораторий"><img src="assets/campus-hero.webp" alt="Открытый технопарк: робот, инженерная мастерская, лаборатории и дорожки между ними" width="1448" height="1086" fetchpriority="high"><div class="art-note"><span class="mark">↗</span><div><strong>Каждая лаборатория — новое действие</strong><small>Открыть интерактивную карту</small></div></div></a><span class="hero-index">ПЕРВОСБОРКА / DIGITAL LAB</span></div></section>
<section class="container section"><div class="section-heading studio-page-heading"><div><p class="eyebrow">ПОПРОБОВАТЬ — ЗНАЧИТ ПОНЯТЬ БОЛЬШЕ</p><h2 class="section-title">Твой интерес<br>начинается с действия.</h2></div><p class="section-lead">Здесь можно менять решения, возвращаться к задаче и находить своё сочетание направлений.</p></div><div class="experience-cards"><article class="experience-card"><span class="card-kicker">01 / СОБЕРИ</span><h3>Создай свой вариант</h3><p>Измени конструкцию, составь программу или придумай сценарий выставки. Всё можно попробовать на экране.</p></article><article class="experience-card"><span class="card-kicker">02 / ИСПЫТАЙ</span><h3>Увидь, что получилось</h3><p>Запусти робота по шагам, сравни две модели, исследуй отклик. Заметь, какая задача увлекла.</p></article><article class="experience-card"><span class="card-kicker">03 / ВЫБЕРИ</span><h3>Продолжи в технопарке</h3><p>Собери карту интересов и выбери два небольших проекта, с которых хочется начать.</p></article></div></section>
<section class="container section"><div class="section-heading studio-page-heading"><div><p class="eyebrow">ВЫБЕРИ СВОЮ ПЕРВУЮ ЛАБОРАТОРИЮ</p><h2 class="section-title">Что хочется<br>попробовать сегодня?</h2></div><a class="text-link" href="#labs">Открыть 3D карту ${icon('arrow')}</a></div><div class="grid-4">${E.tracks.map(t=>trackCard(t)).join('')}</div></section>
<section class="container section"><div class="callout callout-blue closing-callout"><div><h2>У будущего много входов.</h2><p>Начни с короткого знакомства или пройди большую экспедицию. Твоё следующее занятие может начаться здесь.</p></div>${button('Выбрать маршрут '+icon('arrow'),'go:choose','btn-primary')}</div><p class="small muted footnote">Авторский образовательный прототип Технопарка РГСУ. Карта помогает обсудить интересы и выбрать занятия; она не определяет профессиональную пригодность. <a href="#method">Как устроен результат</a> · <a href="#example">Посмотреть пример карты</a></p></section>`;
}
function trackCard(t,action=true){
 const done=!!state?.labs[t.id]?.first;
 return `<article class="card track-card lab-card" style="--track:${t.color}" data-rx-track="${t.id}" data-rx-search="${esc(t.name+' '+t.desc+' '+labFor(t.id).title)}" data-rx-status="${done?'checked':'untried'}">${labArt(t.id)}<div class="lab-card-copy"><div class="track-top"><span class="track-icon">${icon(t.id)}</span><span class="card-kicker">${esc(t.short)}</span></div><h3>${t.name}</h3><p>${t.desc}</p>${action?`<a class="text-link" href="#lab:${t.id}">${done?'Вернуться в лабораторию':'Открыть миссию'} ↗</a>`:''}${done?'<span class="badge is-complete">✓ Проба сохранена</span>':''}</div></article>`;
}
function labs(){
 const rec=state?E.recommendations(E.interestScores(D,state)):null;
 return (state?progressHeader(3):'')+`<section class="container section"><div class="section-heading"><div><p class="eyebrow">КАРТА ЛАБОРАТОРИЙ</p><h1>Куда отправимся?</h1><p class="section-lead">${state?.mode==='quick'?'Для короткой экспедиции выбери любые две миссии. Все остальные тоже открыты.':'Восемь направлений и восемь разных способов попробовать себя.'}</p></div>${state?button('Мой маршрут '+icon('arrow'),'go:hub','btn-secondary'):button('Начать экспедицию','go:choose','btn-primary')}</div>${guideCard('labs')}${campus()}${rec?.items.length&&!rec.flat&&!rec.low?`<div class="notice">По твоим ответам интересны: <strong>${rec.items.map(s=>track(s.track).name).join(', ')}</strong>. Все лаборатории остаются открыты.</div>`:''}<div class="section-heading"><div><p class="eyebrow">ВЫБЕРИ СВОЮ ПЕРВУЮ МИССИЮ</p><h2>От любопытства — к действию</h2></div></div><div data-rx-catalog>${window.ReportExperience?window.ReportExperience.catalogTools():''}<div class="grid-4" data-rx-grid>${E.tracks.map(t=>trackCard(t)).join('')}</div></div>${state?`<div class="hero-actions">${button('Перейти к карточкам интересов','go:interests:0','btn-secondary')}${button('Открыть мою карту','go:report','btn-ghost')}</div>`:''}<p class="small muted footnote">Миссия показывает выполнение конкретной задачи. Поворачивать модель и выбирать ракурс можно свободно: это не часть оценки. Все задания доступны в обычном виде.</p></section>`;
}
function destroyExperiences(){
 if(routeOverviewController){routeOverviewView=routeOverviewController.getView();routeOverviewController.destroy();routeOverviewController=null;}
 if(missionFocusController){missionFocusView=missionFocusController.getView();missionFocusController.destroy();missionFocusController=null;}
 if(passportController){passportView=passportController.getView();passportController.destroy();passportController=null;}
 guideController?.destroy({restoreFocus:false});guideController=null;
 focusController?.destroy();focusController=null;
 if(partInspectorController){partInspectorView=partInspectorController.getView();partInspectorController.destroy();partInspectorController=null;}
 if(reportController){reportView=reportController.getView?.()||reportView;reportController.destroy();reportController=null;}
 if(robotController){robotView=robotController.getView();robotController.destroy();robotController=null;}
 if(engineeringController){engineeringView=engineeringController.getView();engineeringController.destroy();engineeringController=null;}
 if(xrController){xrView=xrController.getView();xrController.destroy();xrController=null;}
 for(const [kind,c] of sceneControllers){if(c.getCamera)sceneCameras[kind]=c.getCamera();c.destroy();}sceneControllers.clear();if(missionController&&missionLabId&&missionController.getView)missionViews[missionLabId]=missionController.getView();missionController?.destroy();missionController=null;missionLabId=null;
}
function mountExperiences(base,arg){
 if(window.FocusExperience)focusController=window.FocusExperience.mount();
 const lab=base==='lab'?labFor(arg):null,draft=lab&&state?draftFor(lab):null;
 if(window.TechScenes)for(const el of document.querySelectorAll('[data-scene]')){
  const kind=el.dataset.scene;if(flatScenes[kind])continue;
  let params={kind,camera:sceneCameras[kind],reducedMotion:uiReducedMotion};
  if(kind==='campus')Object.assign(params,{campusItems:E.tracks.map(t=>({id:t.id,label:t.name,short:t.short,completed:!!state?.labs[t.id]?.first,skipped:!!state?.labs[t.id]?.skipped&&!state?.labs[t.id]?.first})),selectedLab:campusSelected,onSelectLab:selectCampus});
  if(kind==='engineering'&&draft)Object.assign(params,{thickness:draft.thickness,ribs:draft.ribs,exploded:sceneExploded,highlightPart:partInspectorView.selected});
  if(kind==='robot'&&draft){const r=E.robotPath(lab.config,draft.commands);Object.assign(params,lab.config,window.RobotDebugger?{path:[lab.config.start],position:lab.config.start}:{path:r.path,position:r.end});}
  if(kind==='xr'&&draft)Object.assign(params,draft.choices);
  const c=window.TechScenes.mount(el,params);sceneControllers.set(kind,c);
  if(c.available===false)showSceneFallback(el);
  el.addEventListener('techscene:unavailable',()=>showSceneFallback(el));
  el.addEventListener('techscene:restored',()=>{if(flatScenes[kind])return;el.hidden=false;const shell=el.closest('.scene-shell');shell.querySelector('.scene-fallback').hidden=true;shell.querySelector('.scene-unavailable')?.remove();});
 }
 else document.querySelectorAll('[data-scene]').forEach(showSceneFallback);
 const xrSlot=document.querySelector('.xr-player-slot');if(xrSlot&&draft&&window.XRPlayer)xrController=window.XRPlayer.mount(xrSlot,{choices:draft.choices,view:xrView,onScene:params=>sceneControllers.get('xr')?.update(params)});
 const robotSlot=document.querySelector('.robot-debugger-slot');if(robotSlot&&draft&&window.RobotDebugger)robotController=window.RobotDebugger.mount(robotSlot,robotMotionOptions={reducedMotion:uiReducedMotion,config:lab.config,commands:draft.commands,view:robotView,onFrame:frame=>{
  sceneControllers.get('robot')?.update({path:frame.path,position:frame.position});
  const flat=document.querySelector('[data-scene-shell=robot] .scene-fallback');if(flat)flat.innerHTML=robotBoard(lab,draft,frame);
 }});
 const engineeringSlot=document.querySelector('.engineering-compare-slot');if(engineeringSlot&&draft&&window.EngineeringCompare)engineeringController=window.EngineeringCompare.mount(engineeringSlot,{draft,view:engineeringView,onApply:variant=>{
  if(!state||!Number.isInteger(variant.thickness)||variant.thickness<1||variant.thickness>5||!Number.isInteger(variant.ribs)||variant.ribs<0||variant.ribs>4)return;
  const before=JSON.parse(JSON.stringify(draft));Object.assign(draft,{thickness:variant.thickness,ribs:variant.ribs});rememberDraft(lab,before,draft,'Применение варианта A');save();render(true);document.querySelector('[data-ec-action="apply"]')?.focus({preventScroll:true});toast('Вариант A перенесён в текущую модель. Проверка решения выполняется отдельно.');
 }});
 const partSlot=document.querySelector('.part-inspector-slot');if(partSlot&&draft&&window.PartInspector)partInspectorController=window.PartInspector.mount(partSlot,{ribs:draft.ribs,selected:partInspectorView.selected,onSelect:selected=>{partInspectorView={selected};sceneControllers.get('engineering')?.update({highlightPart:selected});}});
 const slot=document.querySelector('.mission-visual-slot');if(slot&&lab&&draft&&window.MissionVisuals){missionLabId=lab.id;missionController=window.MissionVisuals.mount(slot,{lab,draft,view:missionViews[lab.id],onChange:()=>{}});}
}
function clearExperienceViews(){destroyExperiences();sceneCameras={};missionViews={};xrView=null;robotView=null;engineeringView=null;campusSelected=null;flatScenes={};meterIndex=0;sceneExploded=0;interestCursors={};interestMode='cards';reportView={};partInspectorView={selected:null};draftHistory?.clear();routeOverviewView={};missionFocusView={active:false};passportView={};currentPassportModel=null;pendingViewFocus=null;}
function showSceneFallback(el){
 const shell=el.closest('.scene-shell');el.hidden=true;shell.querySelector('.scene-fallback').hidden=false;
 if(!shell.querySelector('.scene-unavailable')){const p=document.createElement('p');p.className='scene-unavailable';p.textContent='3D недоступно на этом устройстве. Выполняй ту же задачу в обычном виде.';shell.querySelector('.scene-toolbar').after(p);}
}
function handleSceneAction(action,kind,extra,trigger){
 const c=sceneControllers.get(kind);
 if(action==='scene-focus'){
  const shell=document.querySelector('[data-scene-shell="'+kind+'"]');
  const companion=kind==='campus'?document.getElementById('campus-preview'):kind==='engineering'?document.querySelector('.lab-controls'):kind==='robot'?document.querySelector('.robot-debugger-slot'):kind==='xr'?document.querySelector('.xr-player-slot'):null;
  const additionalCompanion=kind==='engineering'?document.getElementById('engineering-metrics'):null;
  if(shell&&focusController)focusController.open(shell,trigger,{companion,additionalCompanion});return;
 }
 if(action==='scene-mode'){flatScenes[kind]=!flatScenes[kind];render(true);return;}
 if(!c){toast('Для управления ракурсом включи 3D.');return;}
 if(action==='scene-explode'&&kind==='engineering'){
  sceneExploded=sceneExploded?0:1;c.update({exploded:sceneExploded});
  if(trigger){trigger.setAttribute('aria-pressed',String(!!sceneExploded));trigger.textContent=sceneExploded?'Собрать модель':'Показать состав';}
  const note=document.getElementById('engineering-parts-note');if(note)note.hidden=!sceneExploded;
  return;
 }
 if(action==='scene-capture'){
  if(flatScenes[kind]||!window.SceneCapture||typeof c.capture!=='function'){toast('Для снимка включи 3D.');return;}
  const dataUrl=c.capture();if(!dataUrl){toast('Снимок пока недоступен. Попробуй после появления модели.');return;}
  const shell=document.querySelector('[data-scene-shell="'+kind+'"]'),title=shell?.getAttribute('aria-label')||'Учебная 3D-сцена';
  const d=kind==='engineering'&&state?draftFor(labFor('engineering')):null;
  const caption=d?`Текущий вариант: толщина ${d.thickness} мм · рёбра ${d.ribs}${sceneExploded?' · состав модели':''}`:'Текущий ракурс учебной сцены. Снимок не является проверкой решения.';
  if(trigger)trigger.disabled=true;
  Promise.resolve(window.SceneCapture.download({dataUrl,title,caption,filename:'pervosborka-'+kind+'.png'})).then(ok=>{if(trigger?.isConnected){trigger.disabled=false;toast(ok?'3D-вид подготовлен в PNG.':'Не удалось подготовить снимок. Попробуй ещё раз.');}},()=>{if(trigger?.isConnected){trigger.disabled=false;toast('Не удалось подготовить снимок. Попробуй ещё раз.');}});return;
 }
 if(action==='scene-view')c.setView(extra);
 if(action==='scene-reset')c.reset();
 if(action==='scene-rotate')c.rotate(extra==='left'?-.25:.25,0);
 if(action==='scene-zoom')c.zoom(extra==='in'?-.7:.7);
}
async function playRobot(buttonEl){
 if(!state)return;const lab=labFor('robotics'),draft=draftFor(lab),route=E.robotPath(lab.config,draft.commands),c=sceneControllers.get('robot'),status=document.getElementById('robot-play-status');
 if(!draft.commands.length){if(status)status.textContent='Добавь команды, чтобы запустить робота.';return;}
 const label=buttonEl.textContent;buttonEl.disabled=true;buttonEl.textContent='Робот выполняет программу…';if(status)status.textContent='Проверяем маршрут по твоим командам.';
 let playback=null;
 if(c&&c.available!==false){try{playback=await c.play(route.path);}catch(e){playback={completed:false,reason:'playback-error'};}}
 if(!buttonEl.isConnected)return;buttonEl.disabled=false;buttonEl.textContent=label;
 if(playback&&playback.completed===false){if(status)status.textContent='Показ движения прерван. Попробуй запустить ещё раз или включи обычный вид. Проверенная попытка не изменена.';return;}
 const prefix=playback?'':'Расчёт маршрута без анимации: ';
 if(status)status.textContent=prefix+(route.collision?'Маршрут остановился перед препятствием. Измени команды и запусти снова.':route.reached?'Робот достиг цели. Нажми «Проверить решение», чтобы сохранить попытку.':`Программа закончилась в клетке (${route.end[0]+1}, ${route.end[1]+1}). До цели ещё есть путь.`);
}
function engineeringFlat(draft){
 return `<svg width="100%" height="210" viewBox="0 0 380 210" role="img" aria-label="Схема держателя с ${draft.ribs} рёбрами"><path d="m50 152 210 0 62-34-210 0z" fill="#8cabff"/><path d="M50 152h210v24H50z" fill="#2355ed"/><path d="m260 152 62-34v24l-62 34z" fill="#153cc6"/><path d="m104 36 115 0v82H104z" fill="#bdd0ff"/><g id="ribs-svg">${Array.from({length:draft.ribs},(_,i)=>`<path d="m${119+i*25} 118v-47l32 47z" fill="#2355ed" stroke="#fff" stroke-width="1.5"/>`).join('')}</g><text x="190" y="199" text-anchor="middle" fill="#536b91" font-size="12">t = ${draft.thickness} · рёбер: ${draft.ribs}</text></svg>`;
}
function researchVisual(lab){
 const m=lab.config.measurements[meterIndex]||lab.config.measurements[0],pos=65+(m.value-9.7)*460;
 return `<div class="caliper-workbench"><div class="mission-minihead"><span>ПРОБА 07</span> ЦИФРОВОЙ ИЗМЕРИТЕЛЬ</div><svg viewBox="0 0 500 180" role="img" aria-label="Иллюстрация измерения ${m.label}. Учебная схема прибора."><rect x="48" y="78" width="390" height="24" rx="4" fill="#b5c4dc"/><path d="M65 65v81h28v-41h-8V65" fill="#5b7197"/><path d="M${pos} 62v84h-25v-40h10V62" fill="#6782ad"/><rect x="${pos-45}" y="44" width="130" height="48" rx="8" fill="#172b4f"/><rect x="${pos-37}" y="51" width="114" height="34" rx="4" fill="#ddf0e9"/><text x="${pos+20}" y="76" text-anchor="middle" fill="#173c38" class="caliper-reading">${m.value.toFixed(2).replace('.',',')}</text>${Array.from({length:28},(_,i)=>`<path d="M${86+i*12} 83v${i%5===0?13:7}" stroke="#526a90"/>`).join('')}<rect x="95" y="111" width="${Math.max(25,pos-121)}" height="26" rx="3" fill="#3b62e8"/><text x="438" y="58" fill="#647594" font-size="12" text-anchor="end">мм</text></svg><p class="caliper-caption">Выбери образец, рассмотри показание и отметь, проходит ли размер по условию. Прибор показан схематично.</p><div class="measurement-select">${lab.config.measurements.map((v,i)=>button(v.label,'meter:'+i,(i===meterIndex?'btn-primary':'btn-secondary')+' btn-small',`aria-pressed="${i===meterIndex}"`)).join('')}</div></div>`;
}
function communityVisual(lab,draft){
 const c=lab.config,chosen=c.items.filter(i=>draft.selected.includes(i.id)),cost=chosen.reduce((s,i)=>s+i.cost,0),labels={access:'Доступные материалы',workshop:'Мастерская',mentoring:'Наставники',demo:'Демонстрация',campaign:'Навигация'},icons={access:'design',workshop:'engineering',mentoring:'social',demo:'robotics',campaign:'arrow'};
 return `<div class="community-board"><div class="community-heading">СОБЕРИ СВОЙ ДЕНЬ ОТКРЫТЫХ МАСТЕРСКИХ</div><div class="community-map">${c.items.map(i=>`<button class="community-module ${draft.selected.includes(i.id)?'selected':''}" data-action="select:social:${i.id}" aria-pressed="${draft.selected.includes(i.id)}" aria-label="${esc(i.label)}: ${i.cost} единиц">${icon(icons[i.id])}<span>${labels[i.id]}</span><span>${draft.selected.includes(i.id)?'✓ Добавлено':'+ Добавить'} · ${i.cost} ед.</span></button>`).join('')}</div><div class="resource-tokens ${cost>c.budget?'over':''}" aria-hidden="true">${Array.from({length:c.budget},(_,i)=>`<i class="${i<cost?'used':''}"></i>`).join('')}</div><div class="community-budget"><span>Ресурс: ${cost} из ${c.budget} ед.</span><strong>${cost>c.budget?'Превышение на '+(cost-c.budget):'Осталось '+(c.budget-cost)}</strong></div></div>`;
}
function xrVisual(lab,draft){
 const script=lab.config.stages.map(s=>{const selected=s.options.find(o=>o.id===draft.choices[s.id]);return `<div class="${selected?'chosen':''}"><small>${{entry:'01 / ВХОД',action:'02 / ДЕЙСТВИЕ',feedback:'03 / ОТКЛИК'}[s.id]}</small><span>${selected?esc(selected.label):'Выбери решение ниже'}</span></div>`;}).join('');
 return sceneShell('xr','Виртуальная выставка / предпросмотр','<p>Сценарий выставки показан в трёх карточках ниже. Каждое выбранное решение применяется к соответствующему этапу.</p>')+`<div class="xr-script">${script}</div><div class="xr-player-slot"></div>`;
}

function choose(){
 return `<section class="container section narrow"><div class="studio-page-heading"><p class="eyebrow">ТОЧКА СТАРТА</p><h1>Одна экспедиция.<br>Два способа начать.</h1><p class="section-lead">Выбери подходящий масштаб. В любом маршруте можно делать паузы, пользоваться подсказками и пропускать задания.</p></div><div class="grid-2 mode-cards"><article class="card featured"><span class="pill">Полное исследование</span><h2>Большая<br>экспедиция</h2><p class="mode-time">35–50 <small>минут</small></p><p>48 карточек интересов · 8 ситуаций · 8 лабораторий</p><p class="muted">Познакомься со всеми направлениями и собери подробную карту для выбора следующих занятий.</p>${button('Начать большой маршрут '+icon('arrow'),'start:full','btn-primary')}</article><article class="card"><span class="pill">Первое знакомство</span><h2>Короткий<br>маршрут</h2><p class="mode-time">10–15 <small>минут</small></p><p>16 карточек интересов · 2 ситуации · любые 2 лаборатории</p><p class="muted">Попробуй формат и наметь первые интересы. Карта будет предварительной: наблюдений здесь меньше.</p>${button('Начать знакомство '+icon('arrow'),'start:quick','btn-secondary')}</article></div><div class="notice"><strong>Твой темп, твои данные.</strong> Время предварительное, таймера нет. Ответы сохраняются в этом браузере. ФИО, телефон, камера и микрофон не нужны. Работу можно скачать, перенести на другое устройство или удалить.${!storageOK?'<p class="warning">Браузер не разрешает сохранение. Не закрывай вкладку до выгрузки результата.</p>':''}</div><div class="hero-actions">${button('Продолжить из файла','go:transfer','btn-secondary')}${state?button('Вернуться к своей экспедиции','go:hub','btn-ghost'):''}</div></section>`;
}
function nextReflectionStage(){return E.nextUnansweredRoute(D,state);}
function progressHeader(active){
 if(!state)return '';
 const p=E.progress(D,state);
 return `<div class="container journey-top"><div class="journey-label"><span class="small muted">${state.mode==='quick'?'КОРОТКИЙ МАРШРУТ':'БОЛЬШАЯ ЭКСПЕДИЦИЯ'} · ${state.sessionId}</span><a class="journey-save" data-save-state data-state="${storageOK&&!recoveryBlocked?'saved':'memory'}" href="#transfer" title="Открыть сохранение и перенос работы">${icon(storageOK&&!recoveryBlocked?'check':'download',14)}<span>${storageOK&&!recoveryBlocked?'Сохранено в браузере':'Только в этой вкладке'}</span></a><span class="small">Этапы отмечены: ${p.percent}%</span></div><div class="progress-track" aria-label="Отмечено ${p.percent}% этапов маршрута; пропуски тоже учитываются"><div class="progress-fill" style="width:${p.percent}%"></div></div><nav class="stepper" aria-label="Этапы маршрута">${[['profile','Старт',0],['labs','Лаборатории',3],['interests:0','Интересы',1],['situation:0','Ситуации',2],['report','Моя карта',4]].map((x,i)=>`<a href="#${x[0]}" class="step ${active===x[2]?'active':''}" ${active===x[2]?'aria-current="step"':''}><span>${i+1}</span>${x[1]}</a>`).join('')}</nav></div>`;
}
function profile(){
 const marked=E.KEYS.filter(id=>has(state.experience,id)).length;
 return progressHeader(0)+`<section class="container section narrow profile-workspace"><div class="profile-intro"><div><p class="eyebrow">ОТКУДА НАЧИНАЕМ</p><h1>У каждого<br>свой старт</h1><p class="section-lead">Вспомни, что уже пробовал. Так будет проще выбрать первый проект.</p></div><div class="profile-start-note">${icon('engineering',44)}<strong>Любопытство — уже начало</strong><p>Готовиться заранее не нужно. Поля можно оставить без ответа.</p></div></div><div class="card profile-fields"><div><label for="age">Возрастная группа</label><select id="age" data-field="age"><option value="" ${!state.age?'selected':''}>Не указан</option>${['12–13','14–15','16–18','18+ (ознакомительно)'].map(v=>`<option ${state.age===v?'selected':''}>${v}</option>`).join('')}</select></div><div><label for="goal">Что хочется понять?</label><select id="goal" data-field="goal">${[['explore','Какие направления мне интересны'],['course','Какое пробное занятие выбрать'],['project','За какой проект взяться']].map(([v,l])=>`<option value="${v}" ${state.goal===v?'selected':''}>${l}</option>`).join('')}</select></div></div><section class="card profile-experience"><div class="profile-section-heading"><div><h2>Что ты уже пробовал?</h2><p class="muted">Опыт поможет подобрать старт. На оценку интереса он не влияет.</p></div><span class="profile-answer-count" id="profile-answer-count" role="status">${marked} / 8 отмечено</span></div><div class="experience-grid">${E.tracks.map(t=>`<div class="experience-row profile-experience-card ${has(state.experience,t.id)?'is-set':''}"><label for="exp-${t.id}"><span class="profile-track-icon">${icon(t.id,23)}</span><span class="profile-track-copy"><strong>${t.name}</strong><small>${t.tag}</small></span></label><select id="exp-${t.id}" data-experience="${t.id}"><option value="" ${!has(state.experience,t.id)?'selected':''}>Пока не отвечаю</option>${experienceLabels.map((l,i)=>`<option value="${i}" ${state.experience[t.id]===i?'selected':''}>${l}</option>`).join('')}</select></div>`).join('')}</div></section><div class="callout profile-note"><strong>Можно ошибаться и менять мнение.</strong><p>В карточках интересов выбирай то, что хочется попробовать. В лабораториях изучай результат своих действий. Скорость выполнения не оценивается.</p></div><div class="panel-footer profile-actions">${button('Продолжить маршрут '+icon('arrow'),'profile-done','btn-primary')}</div></section>`;
}
function routeOverviewModel(){return state&&window.RouteOverview?window.RouteOverview.model({questions:E.getQuestions(D,state.mode),answers:state.answers,cases:D.situations.slice(0,state.mode==='quick'?2:8),caseAnswers:state.situations,tracks:E.tracks,records:state.labs,reflections:state.reflections,drafts:state.drafts,targetLabs:state.mode==='quick'?2:8}):null;}
function openInterestCard(index){
 if(!state)return;const qs=E.getQuestions(D,state.mode);if(!Number.isInteger(index)||index<0||index>=qs.length)return;
 const page=Math.floor(index/8),route='interests:'+page;interestMode='cards';interestCursors[page]=index%8;pendingViewFocus={route,id:'interest-deck-question'};go(route);
}
function overviewGo(kind,target){
 if(!state)return;
 if(kind==='interest'){openInterestCard(Number(target));return;}
 if(kind==='situation'){const i=Number(target),limit=state.mode==='quick'?2:8;if(Number.isInteger(i)&&i>=0&&i<limit)go('situation:'+i);return;}
 if(kind==='lab'||kind==='reflection'){if(!E.KEYS.includes(target))return;const route='lab:'+target;if(kind==='reflection')pendingViewFocus={route,id:'mission-reflection'};go(route);return;}
 if(kind==='labs'||kind==='projects')go(kind);
}
function hub(){
 const p=E.progress(D,state),scores=E.interestScores(D,state),rec=E.recommendations(scores),checked=E.KEYS.filter(id=>state.labs[id]?.first).length;
 const next=E.nextUnansweredRoute(D,state),resume=next==='report'?null:state.resumeRoute,target=resume||next;
 return progressHeader(-1)+`<section class="container section"><div class="studio-resume"><div><p class="eyebrow">ТВОЯ ЭКСПЕДИЦИЯ</p><h1>Продолжим<br>с твоего места.</h1><p class="section-lead">Каждая проба добавляет опыт. Выбирай порядок, меняй решения и возвращайся к тому, что интересно.</p><div class="hero-actions">${button((next==='report'?'Открыть мою карту':resume?'Вернуться к занятию':'Продолжить')+' '+icon('arrow'),'go:'+target,'btn-primary')}${resume&&resume!==next?button('К непройденному этапу','go:'+next,'btn-secondary'):''}</div></div><div class="studio-resume-progress" style="--progress:${p.percent}%" aria-label="Отмечено ${p.percent}% этапов; пропуски тоже учитываются"><strong>${p.percent}<small>%</small></strong><span>этапов отмечено</span></div></div><div class="studio-dashboard"><a class="card studio-stat" href="#interests:0"><p class="card-kicker">ИНТЕРЕСЫ</p><h2>${p.answered}<small> / ${p.questions}</small></h2><p>Карточек с ответом, включая «Пока не могу оценить».</p><span class="text-link">Продолжить карточки ${icon('arrow')}</span></a><a class="card studio-stat" href="#situation:0"><p class="card-kicker">СИТУАЦИИ</p><h2>${p.situations}<small> / ${p.caseTotal}</small></h2><p>Отмечено ситуаций о работе над проектом.</p><span class="text-link">Открыть ситуации ${icon('arrow')}</span></a><a class="card studio-stat" href="#labs"><p class="card-kicker">ЛАБОРАТОРИИ</p><h2>${checked}<small> / 8</small></h2><p>Проб проверено. ${state.mode==='quick'?'В коротком маршруте можно выбрать любые две.':'Все направления доступны в любом порядке.'}</p><span class="text-link">Исследовать кампус ${icon('arrow')}</span></a></div>${window.RouteOverview?window.RouteOverview.checkpoint(routeOverviewModel()):''}<div class="section-heading studio-page-heading"><div><p class="eyebrow">ПРОСТРАНСТВО ДЛЯ ЭКСПЕРИМЕНТОВ</p><h2>Твои лаборатории</h2></div><a class="text-link" href="#labs">Открыть 3D карту ${icon('arrow')}</a></div><div class="studio-route-list">${E.tracks.map((t,i)=>{const record=state.labs[t.id],status=record?.first?'Проба сохранена':record?.skipped?'Пока пропущено':state.drafts[t.id]?'Есть твой вариант':'Можно попробовать';return `<a class="studio-route-row ${record?.first?'is-complete':''}" href="#lab:${t.id}"><span class="studio-route-icon">${icon(t.id,25)}</span><span class="studio-route-copy"><small>ЛАБОРАТОРИЯ ${String(i+1).padStart(2,'0')}</small><strong>${t.name}</strong><span>${esc(labFor(t.id).title)}</span></span><span class="studio-route-state">${record?.first?'✓ ':''}${status}</span>${icon('arrow')}</a>`;}).join('')}</div><div class="section callout callout-blue"><div><h2>Твоя карта уже собирается</h2><p>${rec.items.length&&!rec.flat&&!rec.low?'Появились первые направления для знакомства. Вернись к карте после следующих проб и сравни впечатления.':'Карточки занятий помогут заметить интересы. Неизвестные направления можно сначала попробовать в лабораториях.'}</p></div>${button('Посмотреть мою карту','go:report','btn-secondary')}</div><div class="hero-actions">${button('Мои следующие пробы','go:projects','btn-primary')}${button('Перенести работу','go:transfer','btn-secondary')}${button('Скачать мою работу','export','btn-secondary')}${button('Удалить мои локальные данные','reset','btn-ghost')}${recoveryRaw?button('Исходник после восстановления','export-original','btn-ghost'):''}</div></section>`;
}
function interestPageInfo(pageIndex){
 const qs=E.getQuestions(D,state.mode),pages=Math.ceil(qs.length/8),page=Math.max(0,Math.min(pages-1,Math.floor(Number(pageIndex)||0))),part=qs.slice(page*8,page*8+8);
 const missing=part.findIndex(q=>!has(state.answers,q.id));
 const stored=interestCursors[page],cursor=Number.isInteger(stored)?Math.max(0,Math.min(part.length-1,stored)):missing<0?part.length-1:missing;
 return {qs,pages,page,part,cursor,all:missing<0,missing};
}
function interestScale(q){
 return `<div class="scale" role="group" aria-label="Оценка интереса">${scaleLabels.map((l,j)=>`<button id="answer-${q.id}-${j+1}" class="scale-option ${state.answers[q.id]===j+1?'selected':''}" data-action="answer:${q.id}:${j+1}" aria-pressed="${state.answers[q.id]===j+1}"><span class="scale-number">${j+1}</span><span class="scale-text">${l}</span></button>`).join('')}</div><button id="answer-${q.id}-null" class="skip-btn ${has(state.answers,q.id)&&state.answers[q.id]===null?'selected':''}" data-action="answer:${q.id}:null" aria-pressed="${has(state.answers,q.id)&&state.answers[q.id]===null}">Пока не могу оценить</button>`;
}
function interests(pageIndex){
 const {qs,pages,page,part,cursor,all}=interestPageInfo(pageIndex),q=part[cursor],answered=has(state.answers,q.id),count=part.filter(x=>has(state.answers,x.id)).length;
 interestCursors[page]=cursor;
 const modeSwitch=`<div class="interest-view-switch" role="group" aria-label="Вид карточек интересов">${button('По одной','interest-view:cards','btn-small '+(interestMode==='cards'?'btn-primary':'btn-secondary'),`aria-pressed="${interestMode==='cards'}"`)}${button('Весь блок','interest-view:list','btn-small '+(interestMode==='list'?'btn-primary':'btn-secondary'),`aria-pressed="${interestMode==='list'}"`)}</div>`;
 const list=`<div class="scale-legend"><span>1 — совсем не хочется</span><span>3 — зависит от задачи</span><span>5 — очень хочется</span></div><div class="questions-list">${part.map((item,i)=>`<fieldset class="question" id="question-${item.id}"><legend class="sr-only">${esc(item.prompt)}</legend><div class="visual-question"><div class="question-art">${labArt(item.track)}</div><div class="question-content"><div class="question-title" aria-hidden="true"><span class="question-number">${page*8+i+1}.</span> ${esc(item.prompt)}</div>${interestScale(item)}</div></div></fieldset>`).join('')}</div><div class="panel-footer">${button('← Назад','go:'+(page?'interests:'+(page-1):'labs'),'btn-secondary')}${button(page===pages-1?'К ситуациям '+icon('arrow'):'Следующий блок '+icon('arrow'),'go:'+(page===pages-1?'situation:0':'interests:'+(page+1)),'btn-primary',all?'':'disabled')}</div>`;
 const deck=`<article class="interest-deck" aria-labelledby="interest-deck-question"><div class="interest-deck-main"><div class="interest-deck-art">${labArt(q.track)}</div><div class="interest-deck-copy"><p class="interest-deck-kicker">КАРТОЧКА ${page*8+cursor+1} / ${qs.length}</p><h2 class="interest-deck-question" id="interest-deck-question" tabindex="-1">${esc(q.prompt)}</h2><p>Насколько тебе хочется этим заниматься?</p></div></div><div class="interest-deck-answer">${interestScale(q)}</div><p class="interest-answer-state" role="status">${answered?state.answers[q.id]===null?'Сохранено: пока не можешь оценить. Можно вернуться позже.':'Выбрано: '+esc(scaleLabels[state.answers[q.id]-1])+'. Ответ можно изменить.':'Выбери подходящий ответ. Уметь сейчас необязательно.'}</p><div class="interest-deck-progress" role="group" aria-label="Карточки этого блока">${part.map((item,i)=>button(String(page*8+i+1),'interest-jump:'+page+':'+i,'interest-dot '+(i===cursor?'is-current ':'')+(has(state.answers,item.id)?state.answers[item.id]===null?'is-unknown':'is-done':''),`aria-label="Карточка ${page*8+i+1}. ${has(state.answers,item.id)?state.answers[item.id]===null?'Пока не можешь оценить':'Есть ответ':'Без ответа'}" ${i===cursor?'aria-current="step"':''}`)).join('')}</div><div class="interest-deck-nav">${button(cursor||page?'← Предыдущая':'К лабораториям','interest-prev:'+page,'btn-secondary')}${button(all?(page===pages-1?'К ситуациям':'Следующий блок'):cursor===part.length-1?'К неотвеченной карточке':'Следующая карточка','interest-next:'+page,'btn-primary',answered?'':'disabled')}</div></article>`;
 return progressHeader(1)+`<section class="container section interest-workspace"><div class="section-heading studio-page-heading"><div><p class="eyebrow">ИНТЕРЕСЫ · БЛОК ${page+1} / ${pages}</p><h1>Что тебя увлекает?</h1><p class="section-lead">Представь, что рядом есть наставник и нужные инструменты. Выбирай то, что хочется попробовать.</p></div>${modeSwitch}</div>${window.RouteOverview?window.RouteOverview.atlas(routeOverviewModel()):''}${guideCard('interests')}${interestMode==='cards'?deck:list}<div class="interest-deck-help"><p>${count} из ${part.length} карточек блока отмечено. ${all?'Можно перейти дальше.':'Неизвестное можно оставить ответом «Пока не могу оценить».'}</p>${button('Пропустить неотвеченные в блоке','skip-interests:'+page,'btn-ghost btn-small')}</div></section>`;
}
function situation(index){
 const cases=D.situations.slice(0,state.mode==='quick'?2:8),i=Math.max(0,Math.min(cases.length-1,Math.floor(Number(index)||0))),q=cases[i],choices=q.options||q.choices,finish=E.progress(D,state).labCount>=E.progress(D,state).targetLabs?'report':'labs';
 const chosen=choices.find(c=>state.situations[q.id]===c.id),answered=has(state.situations,q.id);
 return progressHeader(2)+`<section class="container section narrow situation-workspace"><div class="situation-scene"><div class="situation-scene-mark">${labArt(E.KEYS[i%8])}</div><div class="situation-scene-copy"><p class="eyebrow">СИТУАЦИЯ ${i+1} / ${cases.length}</p><h1 id="situation-title">${esc(q.title||'Твой способ действовать')}</h1><p class="section-lead">${esc(q.prompt)}</p></div></div><p class="situation-instruction">Выбери способ действия, который ближе сейчас. Все варианты допустимы — здесь нет баллов и правильного ответа.</p><div class="option-list situation-options" role="group" aria-labelledby="situation-title">${choices.map((c,j)=>{const selected=state.situations[q.id]===c.id;return `<button id="case-${c.id}" class="option-card ${selected?'selected':''}" data-action="situation:${q.id}:${c.id}" aria-pressed="${selected}"><span class="option-letter" aria-hidden="true">${String(j+1).padStart(2,'0')}</span><span class="situation-option-copy"><span class="situation-option-text">${esc(c.label||c.text)}</span><small class="situation-option-state" aria-hidden="true">${selected?'Выбрано':'Можно выбрать'}</small></span><span class="option-indicator" aria-hidden="true">${selected?'✓':'○'}</span></button>`;}).join('')}</div><p class="situation-answer-state" role="status">${chosen?'Твой выбор сохранён. Можно изменить его или перейти дальше.':answered?'Ситуация пропущена. Можно вернуться к ней позже.':'Выбери один вариант или оставь ситуацию на потом.'}</p><nav class="situation-map" aria-label="Ситуации маршрута">${cases.map((item,n)=>button(String(n+1),'go:situation:'+n,'situation-map-item '+(i===n?'is-current ':'')+(has(state.situations,item.id)?state.situations[item.id]===null?'is-skipped':'is-done':''),`aria-label="Ситуация ${n+1}: ${esc(item.title||'Твой способ действовать')}. ${has(state.situations,item.id)?state.situations[item.id]===null?'Пропущена':'Есть ответ':'Без ответа'}" ${i===n?'aria-current="step"':''}`)).join('')}</nav><div class="panel-footer situation-actions">${button('← Назад','go:'+(i?'situation:'+(i-1):'interests:'+(state.mode==='quick'?1:5)),'btn-secondary')}${button(i===cases.length-1?(finish==='report'?'К моей карте ':'К лабораториям ')+icon('arrow'):'Следующая ситуация '+icon('arrow'),'go:'+(i===cases.length-1?finish:'situation:'+(i+1)),'btn-primary',answered?'':'disabled')}</div>${button('Пропустить эту ситуацию','skip-situation:'+q.id+':'+i,'btn-ghost btn-small')}</section>`;
}
function draftFor(lab){if(!state.drafts[lab.track])state.drafts[lab.track]=E.defaultDraft(lab);return state.drafts[lab.track];}
function robotBoard(lab,draft,frame=null){
 const result=frame?{end:frame.position,path:frame.path,collision:frame.status==='blocked',reached:frame.reached}:E.robotPath(lab.config,draft.commands||[]),c=lab.config;
 const message=frame&&window.RobotDebugger?window.RobotDebugger.logic.describe(frame,c):result.collision?'На пути препятствие: измени последовательность.':result.reached?'Робот у цели. Проверь решение, чтобы сохранить результат.':'Составь маршрут стрелками. Сейчас робот в клетке ('+(result.end[0]+1)+','+(result.end[1]+1)+').';
 return `<div class="robot-grid" role="img" aria-label="Поле ${c.size} на ${c.size}. Робот: столбец ${result.end[0]+1}, строка ${result.end[1]+1}. Старт внизу слева. Цель вверху справа. Препятствия обозначены крестами.">${Array.from({length:c.size*c.size},(_,i)=>{const x=i%c.size,y=Math.floor(i/c.size),obs=c.obstacles.some(p=>p[0]===x&&p[1]===y),goal=c.goal[0]===x&&c.goal[1]===y,robot=result.end[0]===x&&result.end[1]===y,path=result.path.some(p=>p[0]===x&&p[1]===y);return `<span class="robot-cell ${obs?'obstacle':''} ${goal?'goal':''} ${robot?'robot':''} ${path?'path':''}">${robot?icon('robotics',27):obs?'×':goal?'◎':path?'·':''}</span>`;}).join('')}</div><p class="small muted">Координаты: столбцы слева направо 1–5, строки сверху вниз 1–5. Старт (1,5), цель (5,1). Стены: (2,5), (2,4), (4,3), (4,2).</p><div class="lab-status ${result.collision?'warning':''}" ${frame?'':'role="status"'}>${esc(message)}</div>`;
}

function navigationEntries(){
 const sections=[['home','Главная','О проекте и начале экспедиции','старт начало'],['labs','Карта лабораторий','Восемь направлений и 3D кампус','кампус каталог'],['choose','Выбрать маршрут','Большая экспедиция или короткое знакомство','начать тест'],['method','Как устроен результат','Методика, пояснения и источники','правила методика'],['mentor','Наставнику','Работа с переданными результатами','группа сводка'],['example','Пример карты','Демонстрационные учебные ответы','пример результат']];
 if(state)sections.splice(2,0,['hub','Мой маршрут','Продолжить со своего места','прогресс продолжить'],['interests:0','Карточки интересов','Что хочется попробовать','вопросы интерес'],['situation:0','Ситуации','Решения о работе над проектом','сценарии'],['report','Моя карта','Интересы, практика и следующие пробы','результат отчет отчёт'],['projects','Мои следующие пробы','Личный план и дневник','план дневник'],['transfer','Перенести работу','Скачать ответы или открыть файл','экспорт импорт файл']);
 const aliases={engineering:'конструкция 3d 3д деталь моделирование',robotics:'робот команды программа полигон',code:'код алгоритм программирование данные',ai:'ии нейросеть интеллект',design:'дизайн интерфейс медиа',xr:'xr vr ar игра виртуальная выставка',research:'метрология измерения исследование эксперимент',social:'социальный проект бюджет команда'};
 return [...E.tracks.map(t=>({id:'lab-'+t.id,route:'lab:'+t.id,label:t.name,description:labFor(t.id).title,keywords:aliases[t.id],group:'Лаборатории'})),...sections.map(([route,label,description,keywords])=>({id:route,route,label,description,keywords,group:'Разделы'}))];
}
function sameDraft(lab,a,b){
 if(!a||!b)return false;
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const normalized=value=>{const copy=JSON.parse(JSON.stringify(value));if(Array.isArray(copy.selected))copy.selected.sort();return canonical(copy);};
 return JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
}
function draftStatus(lab,draft){
 const record=state?.labs[lab.track],checked=!!record?.last,changed=checked&&record.lastDraft&&!sameDraft(lab,draft,record.lastDraft);
 const kind=!checked?'draft':changed?'changed':'checked';
 const title=!checked?'Твой черновик':changed?'Есть изменения после проверки':record.lastDraft?'Этот вариант проверен':'Проверка сохранена';
 const note=!checked?'Пробуй свободно. Проверка — отдельным действием.':changed?'Сохранённый результат относится к предыдущему варианту.':`Проверок: ${record.attempts||1}. Можно продолжить эксперимент.`;
 return `<div class="draft-status" id="mission-draft-status" data-state="${kind}" role="status"><span class="draft-status-symbol" aria-hidden="true">${kind==='checked'?'✓':kind==='changed'?'↻':'✎'}</span><div><strong>${title}</strong><span class="draft-status-note">${note}</span></div></div>`;
}
function updateDraftStatus(lab,draft){
 const node=document.getElementById('mission-draft-status');if(!node)return;
 const record=state?.labs[lab.track],kind=!record?.last?'draft':record.lastDraft&&!sameDraft(lab,draft,record.lastDraft)?'changed':'checked';
 node.setAttribute('data-state',kind);
 const title=node.querySelector('strong'),note=node.querySelector('.draft-status-note');
 if(title)title.textContent=kind==='draft'?'Твой черновик':kind==='changed'?'Есть изменения после проверки':record.lastDraft?'Этот вариант проверен':'Проверка сохранена';
 if(note)note.textContent=kind==='draft'?'Пробуй свободно. Проверка — отдельным действием.':kind==='changed'?'Сохранённый результат относится к предыдущему варианту.':`Проверок: ${record.attempts||1}. Можно продолжить эксперимент.`;
 const symbol=node.querySelector('.draft-status-symbol');if(symbol)symbol.textContent=kind==='checked'?'✓':kind==='changed'?'↻':'✎';
}
function missionNavigation(t){
 const i=E.KEYS.indexOf(t.id),prev=E.tracks[i-1],next=E.tracks[i+1];
 return `<div class="mission-location"><nav class="mission-breadcrumbs" aria-label="Путь к лаборатории"><a href="#home">Главная</a><span aria-hidden="true">/</span><a href="#labs">Лаборатории</a><span aria-hidden="true">/</span><span aria-current="page">${esc(t.name)}</span></nav><div class="mission-neighbors"><span class="mission-index">${String(i+1).padStart(2,'0')} / 08</span>${prev?`<a href="#lab:${prev.id}" aria-label="Предыдущая лаборатория: ${esc(prev.name)}">←</a>`:''}${next?`<a href="#lab:${next.id}" aria-label="Следующая лаборатория: ${esc(next.name)}">→</a>`:''}</div></div>`;
}
function taskCompletion(lab,draft){
 const items=lab.type==='branch'?lab.config.stages:lab.config.measurements,values=lab.type==='branch'?draft.choices:draft.classes;
 const done=items.filter(item=>!!values[item.id]).length,total=items.length,label=lab.type==='branch'?'этапов выбрано':'измерений отмечено';
 return `<div class="task-completion"><p role="status"><strong>${done} / ${total}</strong> ${label}</p>${button(done===total?'Всё отмечено':lab.type==='branch'?'К невыбранному этапу':'К неотмеченному размеру','next-incomplete:'+lab.track,'btn-secondary btn-small',done===total?'disabled':'')}</div>`;
}
function historyText(trackId){
 const history=draftHistory?.status(trackId);
 return history?.undo?`Можно отменить: ${history.undoLabel.toLowerCase()}.`:history?.redo?'Изменение отменено. Его можно вернуть.':'Здесь можно отменить свои следующие изменения.';
}
function historyTools(lab,draft){
 if(!draftHistory)return '';
 const history=draftHistory.status(lab.track),checked=state?.labs[lab.track]?.lastDraft;
 return `<div class="draft-history" data-history-track="${lab.track}"><div class="draft-history-copy"><strong>История варианта</strong><p class="draft-history-status" data-history-status role="status" tabindex="-1">${esc(historyText(lab.track))}</p></div><div class="draft-history-actions">${button('↶ Отменить','draft-undo:'+lab.track,'btn-secondary btn-small',`aria-label="Отменить изменение варианта" ${history.undo?'':'disabled'}`)}${button('↷ Вернуть','draft-redo:'+lab.track,'btn-secondary btn-small',`aria-label="Вернуть отменённое изменение" ${history.redo?'':'disabled'}`)}${checked?button('К проверенному варианту','draft-checked:'+lab.track,'btn-ghost btn-small',sameDraft(lab,draft,checked)?'disabled':''):''}</div><small class="draft-history-note">История доступна до перезагрузки. Проверенные попытки остаются в карте.</small><p class="draft-history-note warning" role="status" data-storage-notice ${storageOK&&!recoveryBlocked?'hidden':''}>Сохранение в браузере недоступно. Работа остаётся в этой вкладке. Скачай ответы перед её закрытием.</p></div>`;
}
function refreshDraftHistory(lab,message){
 if(!draftHistory)return;
 const box=document.querySelector('[data-history-track="'+lab.track+'"]');if(!box)return;
 const history=draftHistory.status(lab.track),draft=draftFor(lab),checked=state.labs[lab.track]?.lastDraft;
 const undo=box.querySelector('[data-action="draft-undo:'+lab.track+'"]'),redo=box.querySelector('[data-action="draft-redo:'+lab.track+'"]'),restore=box.querySelector('[data-action="draft-checked:'+lab.track+'"]');
 if(undo)undo.disabled=!history.undo;if(redo)redo.disabled=!history.redo;if(restore)restore.disabled=!checked||sameDraft(lab,draft,checked);
 const text=box.querySelector('[data-history-status]');if(text)text.textContent=message||historyText(lab.track);
}
function rememberDraft(lab,before,after,label){if(draftHistory&&!sameDraft(lab,before,after))draftHistory.record(lab.track,before,after,label);refreshDraftHistory(lab);}
function draftEditLabel(action){return {select:'Выбор пункта',command:'Добавление команды','undo-command':'Удаление последней команды','remove-command':'Удаление команды',move:'Порядок шагов',branch:'Выбор этапа',classify:'Ответ по измерению','reset-draft':'Сброс варианта'}[action]||'Изменение варианта';}
function restoreDraft(lab,value){
 const draft=draftFor(lab);for(const key of Object.keys(draft))delete draft[key];Object.assign(draft,JSON.parse(JSON.stringify(value)));save();
 if(lab.type==='parameters')updateEngineering(lab,draft);else render(true);
}
function guideCard(context){return window.InteractionGuide?window.InteractionGuide.html(context):'';}
function rangeControl(lab,param,value,min,max,label){
 return `<div class="range-control">${button('−','param-step:'+lab.track+':'+param+':-1','range-step',`aria-label="Уменьшить: ${esc(label)}" data-step-param="${param}" data-step-direction="-1" ${value===min?'disabled':''}`)}<input id="${param}" type="range" min="${min}" max="${max}" step="1" value="${value}" data-param="${param}" data-track="${lab.track}">${button('+','param-step:'+lab.track+':'+param+':1','range-step',`aria-label="Увеличить: ${esc(label)}" data-step-param="${param}" data-step-direction="1" ${value===max?'disabled':''}`)}</div>`;
}
function updateEngineering(lab,draft){
 sceneControllers.get('engineering')?.update({thickness:draft.thickness,ribs:draft.ribs});engineeringController?.update(draft);
 partInspectorController?.update({ribs:draft.ribs});
 for(const param of ['thickness','ribs']){const input=document.getElementById(param);if(input)input.value=String(draft[param]);const value=document.getElementById(param+'-value');if(value)value.textContent=String(draft[param]);for(const control of document.querySelectorAll('[data-step-param="'+param+'"]')){const direction=Number(control.dataset.stepDirection);control.disabled=direction<0?draft[param]<=(param==='thickness'?1:0):draft[param]>=(param==='thickness'?5:4);}}
 const metrics=document.getElementById('engineering-metrics');if(metrics)metrics.innerHTML=metricCards(E.gradeLab(lab,draft).extra);
 const flat=document.querySelector('[data-scene-shell=engineering] .scene-fallback');if(flat)flat.innerHTML=engineeringFlat(draft);
 updateDraftStatus(lab,draft);
 refreshDraftHistory(lab);
}

function labWidget(lab,draft){
 const c=lab.config;
 if(lab.type==='parameters'){
  const metrics=E.gradeLab(lab,draft).extra;
  return `<div class="lab-layout"><div class="lab-canvas engineering-canvas">${sceneShell('engineering','Параметрическая конструкция / 3D',engineeringFlat(draft))}<div class="metrics" id="engineering-metrics">${metricCards(metrics)}</div></div><div class="lab-controls">${historyTools(lab,draft)}<div class="range-row"><label for="thickness">Толщина t, мм <strong id="thickness-value">${draft.thickness}</strong></label>${rangeControl(lab,'thickness',draft.thickness,1,5,'толщина стенки')}<div class="range-ends"><span>1</span><span>5</span></div></div><div class="range-row"><label for="ribs">Количество рёбер r <strong id="ribs-value">${draft.ribs}</strong></label>${rangeControl(lab,'ribs',draft.ribs,0,4,'количество рёбер')}<div class="range-ends"><span>0</span><span>4</span></div></div><p class="small muted">Толщина — в мм; прочность, стоимость и масса — в условных единицах. Формулы: прочность = 2t + 3r; стоимость = 3t + 2r; масса = 4t + r. Это учебная модель, для расчёта реальной детали она не применяется.</p>${window.PartInspector?`<div class="part-inspector-slot">${window.PartInspector.html({ribs:draft.ribs})}</div>`:''}<p class="sr-only" id="engineering-step-status" role="status" aria-live="polite" aria-atomic="true"></p></div></div>${window.EngineeringCompare?'<div class="engineering-compare-slot"></div>':''}`;
 }
 if(lab.type==='robot')return `<div class="lab-layout"><div class="lab-canvas">${sceneShell('robot','Робот / испытательный полигон',robotBoard(lab,draft,window.RobotDebugger?window.RobotDebugger.logic.trace(c,draft.commands).frames[0]:null))}${window.RobotDebugger?`<div class="robot-debugger-slot">${window.RobotDebugger.html(lab,draft,esc)}</div>`:`<div class="robot-run">${button('▶ Запустить программу','robot-play','btn-primary',draft.commands.length?'':'disabled')}</div><p id="robot-play-status" class="robot-play-status" role="status">${draft.commands.length?'Маршрут готов к запуску. Проверка результата — отдельной кнопкой.':'Сначала добавь команды стрелками.'}</p>`}</div><div class="lab-controls"><h3>Твоя программа</h3><div class="command-capacity"><p role="status"><strong>${draft.commands.length} / ${c.maxCommands}</strong> команд${draft.commands.length===c.maxCommands?' · лимит достигнут':''}</p><div class="capacity-track" aria-hidden="true"><span style="width:${draft.commands.length/c.maxCommands*100}%"></span></div></div><p class="small muted">Одна команда перемещает робота на одну клетку. До ${c.maxCommands} команд. Стрелки относятся к виду «Сверху»; поворот камеры не меняет их направление.</p><div class="command-pad">${[['U','↑','Вверх'],['L','←','Влево'],['D','↓','Вниз'],['R','→','Вправо']].map(([id,sign,label])=>button(sign,'command:'+lab.track+':'+id,'btn-secondary',`aria-label="${label}" ${draft.commands.length>=c.maxCommands?'disabled':''}`)).join('')}</div><div class="command-list" aria-label="Последовательность команд">${draft.commands.length?draft.commands.map((v,i)=>`<button type="button" class="command-chip" data-action="remove-command:${lab.track}:${i}" aria-label="Удалить команду ${i+1}: ${{U:'вверх',D:'вниз',L:'влево',R:'вправо'}[v]}" title="Удалить эту команду"><small>${i+1}</small><span>${{U:'↑',D:'↓',L:'←',R:'→'}[v]}</span><small aria-hidden="true">×</small></button>`).join(''):'<span class="muted">Здесь появятся команды</span>'}</div><div class="hero-actions">${button('Убрать последнюю','undo-command:'+lab.track,'btn-secondary btn-small',draft.commands.length?'':'disabled')}${button('Очистить','reset-draft:'+lab.track,'btn-ghost btn-small')}</div></div></div>`;
 if(lab.type==='order')return `<div class="pipeline">${draft.order.map((id,i)=>{const item=c.items.find(x=>x.id===id);return `<div class="pipeline-row"><span class="route-number">${i+1}</span><span class="pipeline-label">${esc(item.label)}</span><div class="move-controls">${button('↑','move:'+lab.track+':'+i+':-1','btn-ghost btn-small',`id="move-${id}-up" aria-label="Поднять: ${esc(item.label)}" ${i===0?'disabled':''}`)}${button('↓','move:'+lab.track+':'+i+':1','btn-ghost btn-small',`id="move-${id}-down" aria-label="Опустить: ${esc(item.label)}" ${i===draft.order.length-1?'disabled':''}`)}</div></div>`;}).join('')}</div><p class="small muted">Переставляй шаги кнопками. Это работает и с клавиатуры.</p>`;
 if(lab.type==='multi')return `<div class="option-list">${c.options.map(o=>`<button id="pick-${lab.track}-${o.id}" class="option-card ${draft.selected.includes(o.id)?'selected':''}" aria-pressed="${draft.selected.includes(o.id)}" data-action="select:${lab.track}:${o.id}"><span class="checkbox-mark">${draft.selected.includes(o.id)?'✓':''}</span><span>${esc(o.label)}${o.detail?`<small class="muted">${esc(o.detail)}</small>`:''}</span></button>`).join('')}</div>`;
 if(lab.type==='branch')return `${xrVisual(lab,draft)}${taskCompletion(lab,draft)}<div class="branch-stages">${c.stages.map((s,i)=>`<fieldset class="question" id="branch-stage-${s.id}" tabindex="-1"><legend class="question-title"><span class="route-number">${i+1}</span> ${esc(s.prompt)}</legend><div class="option-list">${s.options.map(o=>`<button id="branch-${s.id}-${o.id}" class="option-card ${draft.choices[s.id]===o.id?'selected':''}" aria-pressed="${draft.choices[s.id]===o.id}" data-action="branch:${lab.track}:${s.id}:${o.id}">${esc(o.label)}</button>`).join('')}</div></fieldset>`).join('')}</div>`;
 if(lab.type==='classify')return `${researchVisual(lab)}${taskCompletion(lab,draft)}<div class="tolerance-visual"><span>Ниже допуска</span><strong>${c.lower.toFixed(2).replace('.',',')} ≤ размер ≤ ${c.upper.toFixed(2).replace('.',',')} мм</strong><span>Выше допуска</span></div><div class="measurement-list">${c.measurements.map(m=>`<div class="measurement-row" id="measurement-row-${m.id}" tabindex="-1"><strong>${Number(m.value).toFixed(2).replace('.',',')} <span class="small muted">мм</span></strong><div class="segmented">${[['inside','В допуске'],['outside','Вне допуска']].map(([id,label])=>`<button id="measurement-${m.id}-${id}" class="btn btn-small ${draft.classes[m.id]===id?'btn-primary':'btn-secondary'}" aria-pressed="${draft.classes[m.id]===id}" aria-label="${Number(m.value).toFixed(2).replace('.',',')} мм — ${label.toLowerCase()}" data-action="classify:${lab.track}:${m.id}:${id}">${label}</button>`).join('')}</div></div>`).join('')}</div><p class="small muted">Для этой задачи считаем измерения точными. В реальной метрологии учитывают также неопределённость и правило принятия решения.</p>`;
 if(lab.type==='budget'){
  const chosen=c.items.filter(i=>draft.selected.includes(i.id)),cost=chosen.reduce((a,x)=>a+x.cost,0),impact=chosen.reduce((a,x)=>a+x.impact,0);
  return `${communityVisual(lab,draft)}<div class="budget-balance" data-over="${cost>c.budget}"><div><span>${cost>c.budget?'Сверх лимита':'Осталось в бюджете'}</span><strong>${Math.abs(c.budget-cost)} <small>из ${c.budget} ед.</small></strong></div><div class="capacity-track" aria-hidden="true"><span style="width:${Math.min(100,cost/c.budget*100)}%"></span></div><p role="status">${cost>c.budget?'Убери часть пунктов, чтобы вернуться в лимит.':cost===c.budget?'Бюджет использован полностью.':'Можно сравнить разные сочетания.'}</p></div><div class="metrics"><div class="metric"><span>Израсходовано</span><strong class="${cost>c.budget?'error':''}">${cost} / ${c.budget}</strong></div><div class="metric"><span>Условная польза</span><strong>${impact}</strong></div></div><div class="budget-items">${c.items.map(i=>`<button id="budget-${i.id}" class="budget-card ${draft.selected.includes(i.id)?'selected':''}" aria-pressed="${draft.selected.includes(i.id)}" data-action="select:${lab.track}:${i.id}"><span class="checkbox-mark">${draft.selected.includes(i.id)?'✓':''}</span><span><strong>${esc(i.label)}${i.required?' <span class="badge">Обязательно</span>':''}</strong><small>Стоимость: ${i.cost} ед. · Проектные баллы: ${i.impact}</small></span></button>`).join('')}</div><p class="small muted">Стоимость и польза заданы только для этой учебной модели. Каждый пункт выбирается один раз.</p>`;
 }
 return '<p>Задание недоступно.</p>';
}
function metricCards(m){return [['Прочность',m.strength,'≥ 15',m.strength>=15,15],['Стоимость',m.cost,'≤ 16',m.cost<=16,16],['Масса',m.weight,'≤ 16',m.weight<=16,16]].map(([l,v,c,passed,target])=>`<div class="metric" data-passed="${passed}"><span>${l}</span><strong>${v}</strong><small>${c}</small><div class="metric-meter" aria-hidden="true"><span style="width:${Math.max(0,Math.min(100,v/target*100))}%"></span></div><span class="metric-state">${passed?'✓ Выполнено':'○ Пока нет'}</span></div>`).join('');}
function attemptReview(lab,record){
 const snapshot=record.lastDraft||{},explanations=lab.solution?.explanations||{};
 const selected=Array.isArray(snapshot.selected)?snapshot.selected:[];
 const chosen=(lab.config.options||[]).filter(o=>selected.includes(o.id)&&explanations[o.id]);
 const partial=lab.feedback?.partial||'Сопоставь каждый результат с условиями задачи.';
 const full=lab.feedback?.explanation||lab.feedback?.success||'';
 return `<details class="mission-details attempt-review"><summary>Разбор моей проверенной попытки</summary><div><p>${esc(partial)}</p>${chosen.length?'<ul>'+chosen.map(o=>'<li><strong>'+esc(o.label)+'</strong><br>'+esc(explanations[o.id])+'</li>').join('')+'</ul>':''}<p class="small muted">Разбор относится к последней проверенной попытке. Первая проверка остаётся в карте.</p></div></details>${full?`<details class="mission-details"><summary>Показать полный разбор задачи</summary><div><p>${esc(full)}</p><p class="small muted">Следующая проверка после разбора — обучающая попытка.</p></div></details>`:''}`;
}
function labPage(id){
 const lab=labFor(id);if(!lab)return notFound();
 const t=track(lab.track);
 if(!state)return `<section class="container section"><div class="lab-entry">${labArt(t.id)}<div><p class="eyebrow">ПРАКТИЧЕСКАЯ ПРОБА · ${t.name}</p><h1>${esc(lab.title)}</h1><p class="section-lead">${esc(lab.prompt||lab.description)}</p><div class="callout"><p>Для сохранения проб начни маршрут. Можно сразу попробовать эту лабораторию, а вопросы пройти позже. Ответы останутся в этом браузере.</p>${button('Начать с этой пробы','start-lab:'+t.id,'btn-primary')}</div><a href="#labs">← Все лаборатории</a></div></div></section>`;
 const draft=draftFor(lab),result=state.labs[t.id],hint=result?.hintUsed,graded=result?.last,reflection=state.reflections[t.id];
 const enoughLabs=E.progress(D,state).labCount>=E.progress(D,state).targetLabs;
 let hintText=lab.hint||lab.feedback?.partial||(lab.hints&&lab.hints[0])||'Сравни каждый элемент решения с условиями задачи. Меняй один параметр за раз.';
 if(typeof hintText==='object')hintText=hintText.text||JSON.stringify(hintText);
 const feedbackText=typeof lab.feedback==='string'?lab.feedback:lab.feedback?.explanation||lab.feedback?.success||lab.feedback?.correct||'Сопоставь результат с условиями. Можно изменить решение и проверить снова.';
 return progressHeader(3)+`<section class="container section studio-mission" style="--mission-accent:${t.color}">${missionNavigation(t)}<div class="workspace-header"><div><p class="eyebrow">${t.name} / ПРАКТИЧЕСКАЯ ПРОБА</p><h1>${esc(lab.title)}</h1></div><span class="track-icon large" style="--track:${t.color}">${icon(t.id,34)}</span></div><div class="mission-context">${draftStatus(lab,draft)}<nav class="mission-jump-nav" aria-label="Разделы задания">${button('Задание','mission-jump:brief','btn-ghost btn-small')}${button('Рабочая область','mission-jump:work','btn-ghost btn-small')}${button('К проверке','mission-jump:check','btn-secondary btn-small')}</nav></div>${guideCard(t.id)}${window.MissionFocus?window.MissionFocus.html():''}<div class="workspace-grid"><div class="main-panel"><div class="panel"><div class="panel-header" id="mission-brief" tabindex="-1"><p class="lab-intro">${esc(lab.prompt||lab.description)}</p>${(lab.instructions||lab.brief)?`<details class="mission-details"><summary>Правила, формулы и пояснения</summary><div class="small muted">${Array.isArray(lab.instructions||lab.brief)?(lab.instructions||lab.brief).map(x=>'<p>'+esc(x)+'</p>').join(''):esc(lab.instructions||lab.brief)}</div></details>`:''}</div><div class="panel-body" id="mission-work" tabindex="-1">${lab.type!=='parameters'?historyTools(lab,draft):''}<div class="mission-visual-slot">${window.MissionVisuals?window.MissionVisuals.html(lab,draft,esc):''}</div>${labWidget(lab,draft)}</div></div><div class="mission-dock"><div class="mission-dock-copy"><strong>Проверка варианта</strong><small>Сохрани результат, когда будешь готов.</small></div><div class="mission-dock-actions">${button('Проверить решение '+icon('check'),'check:'+t.id,'btn-primary','id="mission-check"')}${button('Подсказка','hint:'+t.id,'btn-secondary',`aria-controls="lab-hint" aria-expanded="${!!hint}"`)}${button('Пропустить','skip-lab:'+t.id,'btn-ghost btn-small','aria-label="Пропустить эту пробу"')}</div></div>${hint?`<div class="callout callout-blue" id="lab-hint" tabindex="-1" role="region" aria-label="Подсказка"><h2>Подсказка</h2><p>${esc(hintText)}</p></div>`:''}${graded?`<div class="feedback ${graded.all?'success':'warning'}" id="mission-feedback" tabindex="-1" aria-live="polite"><p class="card-kicker">ПОСЛЕДНЯЯ ПРОВЕРЕННАЯ ПОПЫТКА</p><h2>${graded.all?'Все условия выполнены':'Есть что проверить'}</h2><p>Выполнено ${graded.score} из ${graded.total} условий. Это результат этой задачи.</p><p class="small muted">Изменения текущего варианта попадут в результат после следующего нажатия «Проверить решение».</p><div class="criteria">${graded.criteria.map(c=>`<div class="criterion"><span>${c.passed?'✓':'○'}</span>${esc(c.label)}</div>`).join('')}</div>${graded.all?`<p>${esc(feedbackText)}</p>`:attemptReview(lab,result)}<div class="mission-next-card"><div class="mission-next-copy"><p class="eyebrow">СЛЕДУЮЩИЙ ШАГ</p><h3>${graded.all?'Что захотелось продолжить?':'Ещё один эксперимент?'}</h3><p>${graded.all?'Можно исследовать другой вариант или отметить впечатление от задачи.':'Вернись к рабочей области, измени решение и сравни результат. Можно также сохранить своё впечатление.'}</p></div><div class="mission-next-actions">${button('Изменить вариант','mission-jump:work','btn-secondary btn-small')}${button('Отметить впечатление','mission-jump:reflection','btn-primary btn-small')}</div></div></div><div class="card reflection" id="mission-reflection" tabindex="-1"><h2>После знакомства</h2><p>Хочется ли продолжить похожую задачу?</p><div class="scale">${scaleLabels.map((l,i)=>`<button id="reflect-${t.id}-${i+1}" class="scale-option ${reflection===i+1?'selected':''}" aria-pressed="${reflection===i+1}" data-action="reflect:${t.id}:${i+1}"><span class="scale-number">${i+1}</span><span class="scale-text">${l}</span></button>`).join('')}</div><button id="reflect-${t.id}-null" class="skip-btn ${has(state.reflections,t.id)&&reflection===null?'selected':''}" aria-pressed="${has(state.reflections,t.id)&&reflection===null}" data-action="reflect:${t.id}:null">Пока не могу оценить</button><div class="panel-footer">${button((enoughLabs?'Продолжить маршрут':'Следующая лаборатория')+' '+icon('arrow'),'next-lab:'+t.id,'btn-primary')}${button('Открыть карту','go:report','btn-secondary')}</div></div>`:''}</div><aside class="side-panel"><div class="side-art">${labArt(t.id)}</div><div class="card"><p class="card-kicker">СМЫСЛ ПРОБЫ</p><h3>${t.tag}</h3><p>${t.desc}</p><div class="divider"></div><p class="small"><strong>Можно пробовать несколько раз.</strong> В карте будут отдельно первое и последнее проверенные решения.</p><p class="small muted">Подсказки отмечаются. Скорость не влияет на результат.</p>${result?.first?`<p class="small">Проверок: ${result.attempts}. Первая: ${result.first.score}/${result.first.total}.${result.firstHadHint?' С подсказкой.':''}</p>`:''}</div></aside></div></section>`;
}
function notFound(){return '<section class="container section"><h1>Такой страницы нет</h1><a href="#home">Вернуться к началу</a></section>';}

function workSummary(s){
 const scores=E.interestScores(D,s),numeric=scores.reduce((n,x)=>n+x.count,0),checked=Object.values(s.labs||{}).filter(x=>x.first).length;
 return `<div class="work-stats"><div><strong>${numeric}</strong><span>${numeric%10===1&&numeric%100!==11?'ответ об интересах':numeric%10>=2&&numeric%10<=4&&(numeric%100<12||numeric%100>14)?'ответа об интересах':'ответов об интересах'}</span></div><div><strong>${checked}</strong><span>проверенных миссий</span></div><div><strong>${Object.keys(s.drafts||{}).length}</strong><span>черновиков лабораторий</span></div></div>`;
}
function importIssueLabels(issues){
 const labels={answers:'ответы об интересах',drafts:'черновики лабораторий',labs:'история проверок',planned:'выбор проектов',nextSteps:'план следующих проб',projectTrials:'записи после реальных проб',situations:'ситуации',reflections:'рефлексия',experience:'предыдущий опыт',age:'возрастная группа',goal:'цель',profileDone:'отметка стартового профиля',startedAt:'дата начала',lastRoute:'место остановки',resumeRoute:'место возвращения',interestTiming:'порядок ответов',experienceVersion:'редакция'};
 return [...new Set(issues.map(x=>labels[x.split('.')[0]]||'сведения о маршруте'))].join(', ');
}
function previousWork(){try{return localStorage.getItem(KEY+'-previous');}catch(e){return null;}}
function transferPage(){
 const candidate=pendingImport?.state;
 return `<section class="container section narrow continuity-page"><a class="text-link no-print" href="#${state?'hub':'choose'}">← ${state?'Мой маршрут':'К началу'}</a><p class="eyebrow">ТВОЯ РАБОТА С ТОБОЙ</p><h1>Продолжи там,<br>где удобно.</h1><p class="section-lead">Начни в технопарке, продолжи дома. Файл переносит ответы, черновики, проверки и план следующих проб.</p><div class="transfer-steps" aria-label="Как перенести работу"><span><b>1</b> Скачай здесь</span><span><b>2</b> Перенеси файл</span><span><b>3</b> Открой на другом устройстве</span></div>${state?`<article class="card work-current"><div class="transfer-card-head"><div><p class="card-kicker">СЕЙЧАС В ЭТОМ БРАУЗЕРЕ</p><h2>${esc(state.sessionId)}</h2></div><span class="badge">${state.mode==='full'?'Большая экспедиция':'Короткий маршрут'}</span></div>${workSummary(state)}${button(icon('download')+' Скачать мою работу','export','btn-primary')}<p class="small muted">JSON содержит твою работу. Передавай его наставнику, когда хочешь обсудить результат.</p></article>`:''}<article class="card transfer-input"><p class="card-kicker">ОТКРЫТЬ СОХРАНЁННОЕ</p><h2>Есть файл ПЕРВОСБОРКИ?</h2><label for="personal-file">Выбери файл своей работы (.json, до 1 МБ)</label><input id="personal-file" type="file" accept=".json,application/json" aria-describedby="transfer-file-help"><p id="transfer-file-help" class="small muted">Сначала покажем, что в файле. Выбор файла сам по себе не заменяет текущую работу. Обработка происходит в этой вкладке.</p><p id="import-status" role="status" class="transfer-status">${esc(importMessage)}</p></article>${candidate?`<article class="card import-preview" id="import-preview" tabindex="-1" aria-label="Проверка работы перед открытием"><p class="card-kicker">ПРОВЕРЬ ПЕРЕД ОТКРЫТИЕМ</p><h2>${esc(candidate.sessionId)}</h2><p>${candidate.mode==='full'?'Большая экспедиция':'Короткий маршрут'} · ${pendingImport.kind==='checkpoint'?'Файл для продолжения':'Прежний файл результатов'}</p><p class="small muted">Файл: ${esc(pendingImport.fileName)}</p>${workSummary(candidate)}${pendingImport.warnings.length?`<div class="notice">${pendingImport.warnings.map(x=>`<p>${esc(x)}</p>`).join('')}</div>`:''}${pendingImport.issues.length?`<p class="notice">Восстановление затронуло: ${esc(importIssueLabels(pendingImport.issues))}. Будут открыты корректные данные; исходный файл остаётся у тебя.</p>`:''}<p>${state?`Маршрут <strong>${esc(state.sessionId)}</strong> в этом браузере будет заменён. Его последняя сохранённая копия останется в разделе ниже. При необходимости скачай его перед заменой.`:'После открытия можно вернуться к своим заданиям и плану.'}</p><div class="hero-actions">${button(state?'Открыть и заменить текущую работу':'Продолжить из файла','apply-import','btn-primary')}${button('Отменить','cancel-import','btn-secondary')}</div></article>`:''}${previousWork()?`<aside class="callout"><h2>Предыдущая работа сохранена</h2><p>При последней замене мы оставили одну локальную копию. Скачай её, если понадобится вернуться.</p>${button('Скачать предыдущую работу','export-previous','btn-secondary')}</aside>`:''}<p class="small muted">Файл не синхронизируется автоматически. После новых ответов скачай обновлённую копию. Изображения и 3D-сцены уже входят в приложение.</p></section>`;
}
function newRoutePage(){
 if(!pendingStart)return choose();
 return `<section class="container section narrow continuity-page"><p class="eyebrow">НОВЫЙ МАРШРУТ</p><h1>Сначала сохраним<br>твою работу.</h1><p class="section-lead">Сейчас открыт маршрут ${esc(state?.sessionId||'')}. В нём могут быть ещё не проверенные решения — они тоже важны.</p>${state?`<div class="card">${workSummary(state)}${button('Скачать текущую работу','export','btn-secondary')}</div>`:''}<div class="callout"><h2>${pendingStart.mode==='full'?'Начать большую экспедицию':'Начать короткое знакомство'}?</h2><p>Ответы начнутся с чистого листа. Предыдущая сохранённая работа останется одной локальной копией в разделе «Перенести работу».</p><div class="hero-actions">${button('Сохранить копию и начать новую','confirm-start','btn-primary')}${button('Продолжить текущую','cancel-start','btn-secondary')}</div></div><p class="transfer-status" role="status">${esc(importMessage)}</p></section>`;
}
function adoptWork(next){
 if(state&&(!storageOK||recoveryBlocked)){importMessage='Не удалось сохранить предыдущую работу. Скачай её; текущий маршрут остаётся открытым.';return false;}
 let result;try{result=window.ContinuityStorage.replace(localStorage,KEY,JSON.stringify(next));}catch(e){result={ok:false};}
 if(!result.ok){importMessage='Не удалось записать работу в этом браузере. Текущий маршрут не заменён. Скачай его и проверь, разрешено ли браузеру сохранять данные.';return false;}
 state=next;storageOK=true;recoveryBlocked=false;pendingImport=null;pendingStart=null;importMessage='';importTicket++;recoveryIssues=[];
 clearExperienceViews();
 return true;
}
function exportPrevious(){
 const raw=previousWork();if(!raw){toast('Предыдущей копии пока нет.');return;}
 try{const restored=E.restoreState(D,JSON.parse(raw));if(restored.state&&!restored.repaired){download('pervosborka-previous-'+restored.state.sessionId+'.json',JSON.stringify(E.createExport(D,restored.state),null,2),'application/json;charset=utf-8');return;}}catch(e){}
 download('pervosborka-previous-original.json',raw,'application/json;charset=utf-8');toast('Скачан исходник предыдущего сохранения. Для продолжения этот файл может потребовать восстановления.');
}
function trialBlock(s,readOnly=false){return window.ProjectTrials?window.ProjectTrials.html({state:s,tracks:E.tracks,demo:readOnly,esc,icon})+window.ProjectTrials.html({state:s,tracks:E.tracks,demo:true,archived:true,esc,icon}):'';}
function projectsPage(s=state,readOnly=false){
 const selected=(s.planned||[]).map(track).filter(Boolean);
 return `<section class="container section project-workspace"><div class="section-heading"><div><p class="eyebrow">ОТ ВЫБОРА К ПЕРВОМУ ПРОЕКТУ · ${esc(s.sessionId)}</p><h1>Мои следующие пробы</h1><p class="section-lead">Два небольших проекта. Понятный результат. Разговор после настоящего опыта.</p></div><div class="hero-actions no-print">${button('Печать / сохранить PDF','print','btn-secondary')}${button(readOnly?'К полученной карте':'К моей карте',readOnly?'go:received:'+s.sessionId:'go:report','btn-ghost')}</div></div>${selected.length?`<div class="grid-2 project-briefs">${selected.map((t,i)=>`<article class="card"><div class="project-brief-art">${labArt(t.id)}</div><p class="card-kicker">ПРОБА ${i+1} · ${esc(t.name)}</p><h2>${esc(t.project)}</h2><ol class="project-steps">${t.plan.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></article>`).join('')}</div>${nextStepCards(selected,s,readOnly)}${trialBlock(s,readOnly)}`:`<div class="callout"><h2>Начни с выбора двух направлений</h2><p>В персональной карте есть восемь идей. Выбери те, которые хочется попробовать, — здесь появятся их шаги и записи после занятия.</p>${!readOnly?button('Выбрать пробы','go:report','btn-primary'):''}</div>${window.ProjectTrials?window.ProjectTrials.html({state:s,tracks:E.tracks,demo:true,archived:true,esc,icon}):''}`}<p class="small muted">Это твой учебный план. Дата обсуждения не является записью на занятие. Отметки после реальной пробы не меняют ответы об интересах и результаты цифровых миссий.</p></section>`;
}
function receivedCard(id,plan=false){
 const record=groupResults.find(x=>x.sessionId===id);if(!record)return `<section class="container section narrow"><h1>Карта из файла пока не открыта</h1><p>Загрузи её на странице наставника. Полученные файлы хранятся в памяти этой вкладки до её перезагрузки или закрытия.</p><a class="btn btn-primary" href="#mentor">Открыть раздел наставника</a></section>`;
 const details=groupDetails.get(id);
 return `<section class="container received-banner no-print"><div><p class="card-kicker">КАРТА ИЗ ФАЙЛА · ТОЛЬКО ПРОСМОТР</p><strong>${esc(id)}</strong><p>Текущий маршрут в этом браузере не изменён.</p>${details?.kind==='legacy'?'<p>Прежний формат: черновики, место остановки и отметка завершения стартового профиля в файле не сохранялись. Общий процент прохождения не показываем.</p>':''}${details?.issues.length?`<p>Восстановление затронуло: ${esc(importIssueLabels(details.issues))}.</p>`:''}</div><div class="hero-actions">${button('К сводке группы','go:mentor','btn-secondary')}${button(plan?'Полная карта':'План выбранных проб',plan?'go:received:'+id:'go:received-plan:'+id,'btn-ghost')}</div></section>${plan?projectsPage(record,true):report(record,false,true)}`;
}

function method(){
 const sources=[
 ['O*NET Interest Profiler Manual','https://www.onetcenter.org/reports/IP_Manual.html','Различение интересов и проверка качества инструмента. Наша восьмитраекторная модель не является тестом O*NET или адаптацией его шкал.'],
 ['ITC / ATP: Technology-Based Assessment, v1.1 (2025)','https://www.intestcom.org/upload/media-library/tba-guidelines-ver-11-july-2025-1754044782Z3vV9.pdf','Рекомендации по качеству цифровой оценки, доступности и обоснованию интерпретаций.'],
 ['UNESCO: AI Competency Framework for Students','https://www.unesco.org/en/articles/ai-competency-framework-students','Человекоцентричный подход, этика, применение и проектирование ИИ. Основание для содержания ИИ-пробы.'],
 ['W3C: WCAG 2.2','https://www.w3.org/TR/WCAG22/','Ориентир для управления клавиатурой, видимого фокуса и альтернатив перетаскиванию. Полное соответствие стандарту ещё не подтверждалось.'],
 ['Направления Технопарка РГСУ','https://technopark-rgsu.ru/','Инженерия, прототипирование, компьютерные науки, ИИ, робототехника и цифровые проекты. Названия восьми траекторий — структура этого прототипа.']
 ];
 return `<section class="container section narrow"><p class="eyebrow">ПРОЗРАЧНАЯ МЕТОДИКА · ${E.VERSION}</p><h1>Что показывает ПЕРВОСБОРКА</h1><p class="section-lead">Авторский инструмент знакомства с направлениями Технопарка РГСУ. Разработан для пилота; психометрическая проверка ещё не проведена.</p><div class="callout callout-blue"><strong>Главный вопрос: что попробовать дальше?</strong><p>Карта помогает выбрать практическую пробу и обсудить её с наставником. Она не определяет интеллект, психотип, диагноз или профессиональную пригодность и не используется для отсева.</p></div><div class="method-section"><h2>1. Три независимых слоя</h2><table class="data-table"><thead><tr><th>Слой</th><th>Основание</th><th>Вывод</th></tr></thead><tbody><tr><td>Интерес</td><td>48 авторских вопросов, по 6 на направление</td><td>Какими занятиями хочется заниматься сейчас</td></tr><tr><td>Практическая проба</td><td>8 заданий с явными условиями</td><td>Какие условия выполнены в этой задаче</td></tr><tr><td>Предыдущий опыт</td><td>8 необязательных самоотчётов</td><td>Какой старт проекта предложить</td></tr></tbody></table><p>Ситуации показываются как выбранные способы действия. Рефлексия после лабораторий — отдельное желание продолжить. Эти показатели не суммируются с интересом.</p></div>
<div class="method-section"><h2>2. Как считается интерес</h2><p>Ответы: 1 — совсем не хочется; 2 — скорее не хочется; 3 — зависит от задачи; 4 — скорее хочется; 5 — очень хочется; отдельный вариант — «не могу оценить».</p><div class="formula">Интерес направления = сумма числовых ответов / число числовых ответов</div><p>Пропуск и «не могу оценить» не входят ни в сумму, ни в знаменатель. Без числовых ответов значения нет. Для сравнения в большой форме нужно минимум 4 из 6 ответов по направлению; в короткой — 2 из 2. Это технический порог полноты пилота, а не доказанная граница достоверности.</p><p>Направления сортируются только по среднему интересу. Если третье и четвёртое имеют равные значения, показываются оба. При полностью ровной карте или максимальном среднем ниже 3 предлагаются разные ознакомительные пробы без искусственного ведущего профиля. Небольшие различия не трактуются как надёжное превосходство.</p><p>Короткая форма включает первые два вопроса каждого направления: всего 16, две ситуации и любые две лаборатории. Она обозначается как предварительная. Её нельзя напрямую сравнивать с большой формой или считать равноценной по качеству измерения.</p></div>
<div class="method-section"><h2>3. Что оценивается в миссиях</h2><p>В визуальной редакции 2.0 стандартный вход ведёт сначала в практические миссии; участник может открыть этапы в другом порядке. Оценки интереса описывают момент ответа и могут учитывать знакомство с лабораториями. В выгрузке отмечается, был ли каждый ответ дан до или после первой проверенной миссии. Не сравнивайте эти режимы как одинаковые исходные замеры.</p><p>Вращение, приближение и переключение ракурса не оцениваются. 3D можно заменить обычным видом; содержательные критерии остаются теми же. Визуальные модели служат учебным объяснением, а не физическим симулятором.</p><p>В каждой миссии считаются выполненные проверяемые условия. Первое проверенное решение сохраняется отдельно от последнего; число проверок и использование подсказки также видны в отчёте. Изменение черновика без нажатия «Проверить» не заменяет проверенное решение. Скорость не оценивается. Пропущенная миссия не считается ошибкой.</p><table class="data-table"><thead><tr><th>Проба</th><th>Наблюдаемые условия</th></tr></thead><tbody><tr><td>Конструкция</td><td>Прочность, стоимость, масса</td></tr><tr><td>Робот</td><td>Цель, отсутствие столкновений, допустимое число команд</td></tr><tr><td>Алгоритм</td><td>Четыре правильных отношения порядка соседних шагов</td></tr><tr><td>ИИ и дизайн</td><td>Все необходимые пункты выбраны; лишних пунктов нет</td></tr><tr><td>XR</td><td>Три решения по заданным требованиям</td></tr><tr><td>Метрология</td><td>Шесть классификаций, включая границы допуска</td></tr><tr><td>Бюджет</td><td>Лимит ресурса, обязательный пункт, максимум при ограничениях</td></tr></tbody></table><p>Число условий и сложность различаются. Значения N/M нельзя превращать в единый рейтинг способностей или сравнивать между лабораториями. Инженерные формулы, бюджет и данные ИИ — учебные модели.</p></div>
<div class="method-section"><h2>4. Для кого и в каких условиях</h2><p>Основной пилот — участники 12–18 лет. Для 12–13 лет акцент на знакомстве и изменчивости интересов. Взрослым доступно ознакомительное прохождение; отдельная методика ДПО и профессиональной переориентации требует иных заданий и проверки.</p><p>Участнику можно читать условие вслух, увеличивать текст, пользоваться клавиатурой и делать паузы. Любое содержательное объяснение наставника нужно учитывать при обсуждении результата. В интерфейсе нет ограниченного времени, обязательного звука, камеры или оценки эмоций.</p><p>Приложение не запрашивает ФИО, телефон или название школы. Ответы сохраняются в локальном хранилище браузера. Участник сам выгружает JSON или печатный отчёт. Сводка наставника обрабатывает выбранные файлы в браузере. Серверной базы участников, онлайн-кабинета класса и автоматической отправки результатов в этой версии нет.</p></div>
<div class="method-section"><h2>5. Что уже реализовано</h2><p>Две длины маршрута; интерактивный 3D кампус, изменяемая 3D конструкция, анимируемый робот, виртуальная выставка, визуальные данные ИИ, работающий конвейер данных и живой макет интерфейса; восемь проб; подсказки; первая и последняя проверки; восстановление после перезагрузки; персональная карта; план двух следующих проб; печать в PDF через браузер; JSON-экспорт; локальная сводка группы и CSV.</p><p>Рекомендации вычисляются по фиксированным правилам. В этой версии нет подключённой генеративной модели. ИИ-помощник для объяснения результата, многопользовательский кабинет, интеграция с набором на занятия и адаптивная психометрическая оценка относятся к следующим этапам разработки.</p></div>
<div class="method-section"><h2>6. Как проверить качество</h2><ol class="project-steps"><li><strong>Экспертная редактура.</strong> Наставники восьми направлений, специалист по профориентации и специалист по доступности проверяют содержание и границы выводов.</li><li><strong>20–30 когнитивных интервью.</strong> Участники разного возраста объясняют, как поняли вопросы. Проверяем различие «хочу» и «умею».</li><li><strong>Проверка интерфейса.</strong> Разные телефоны, компьютеры, увеличение текста, клавиатура и восстановление после паузы.</li><li><strong>Полевой пилот.</strong> Рабочий ориентир 300–500 участников; окончательное число обосновывается планом анализа. Изучаются пропуски, распределения, согласованность и структура шкал.</li><li><strong>Повтор и полезность.</strong> На подвыборке — повтор через 2–4 недели с учётом знакомства с заданиями. Отдельно проверяем, помогла ли карта выбрать и реально пройти следующую пробу.</li></ol><p>Эти размеры и сроки — проектное предложение. Восемь траекторий пока являются направлениями продукта, а не эмпирически подтверждёнными психологическими факторами.</p></div>
<div class="method-section"><h2>7. Основания и источники</h2><p>Источники использованы как ориентиры проектирования. Они не подтверждают валидность этого авторского теста и не означают одобрения со стороны организаций.</p><div class="source-list">${sources.map(([title,url,note])=>`<div class="evidence"><a href="${url}" target="_blank" rel="noopener">${title} ↗</a><p>${note}</p></div>`).join('')}</div><div class="hero-actions no-print">${button('Скачать банк заданий JSON','export-bank','btn-secondary')}${button('Печать методики','print','btn-secondary')}</div></div></section>`;
}
function protocolLabel(record){
 const edition=record.experienceVersion==='2.0-visual'?'Редакция 2.0':'Предыдущая редакция';
 const answered=E.getQuestions(D,record.mode).filter(q=>Number.isInteger(record.answers[q.id]));
 const moments=answered.map(q=>(record.interestTiming||{})[q.id]);
 let phase='порядок не зафиксирован';
 if(moments.length&&moments.every(x=>x==='before-mission'))phase='интересы до проверки миссий';
 else if(moments.length&&moments.every(x=>x==='after-mission'))phase='интересы после проверки миссий';
 else if(moments.some(x=>x==='before-mission'||x==='after-mission'))phase='смешанный или неполный порядок';
 return edition+' · '+phase;
}
function groupBuckets(){
 const map=new Map();for(const r of groupResults){const protocol=protocolLabel(r),key=r.mode+'|'+protocol;if(!map.has(key))map.set(key,{mode:r.mode,protocol,records:[]});map.get(key).records.push(r);}return [...map.values()].sort((a,b)=>a.mode.localeCompare(b.mode)||a.protocol.localeCompare(b.protocol));
}
function dateForPlan(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4):'Дата пока не выбрана';}
function nextStepCards(selected,s,demo){
 if(!selected.length)return '';
 return `<section class="next-steps"><h3>Карточки следующих проб</h3><p>Обсуди с наставником, какой результат покажешь и когда вернёшься к карте. Это личный план, а не запись на занятие.</p><div class="grid-2">${selected.map(t=>{const plan=s.nextSteps?.[t.id]||{};return `<article class="next-step-card"><p class="card-kicker">${esc(t.name)}</p><h4>${esc(t.project)}</h4>${!demo?`<div class="next-step-fields no-print"><div><label for="plan-artifact-${t.id}">Что покажешь наставнику?</label><select id="plan-artifact-${t.id}" data-plan-track="${t.id}" data-plan-field="artifact"><option value="">Пока не выбрано</option>${Object.entries(planArtifacts).map(([id,label])=>`<option value="${id}" ${plan.artifact===id?'selected':''}>${esc(label)}</option>`).join('')}</select></div><div><label for="plan-date-${t.id}">Дата обсуждения результата</label><input type="date" id="plan-date-${t.id}" data-plan-track="${t.id}" data-plan-field="reviewDate" value="${esc(plan.reviewDate||'')}"></div></div>`:''}<p class="${demo?'':'plan-print'}">Результат: ${esc(planArtifacts[plan.artifact]||'пока не выбран')}<br>Обсуждение: ${esc(dateForPlan(plan.reviewDate))}</p></article>`;}).join('')}</div><p class="small muted no-print">${demo?'Показан план из этой карты.':'Сохраняется в этом браузере и входит в JSON и печатную карту.'} Дата не создаёт уведомление или бронирование.</p></section>`;
}
function ageSummary(records){return [...ageGroups,''].map(age=>{const count=records.filter(r=>r.age===age).length;return count?(age||'Не указан')+': '+count:null;}).filter(Boolean).join(' · ');}
function mentor(){
 const byMode=groupBuckets();
 return `<section class="container section"><div class="section-heading"><div><p class="eyebrow">ДЛЯ НАСТАВНИКА</p><h1>От карты интересов —<br>к реальному занятию</h1><p class="section-lead">Проведите маршрут, обсудите опыт и помогите участнику выбрать следующий небольшой проект.</p></div><a class="btn btn-secondary" href="#method">Читать методику</a></div><div class="grid-3"><article class="card"><p class="card-kicker">ДО ПРОХОЖДЕНИЯ</p><h3>Объясните цель</h3><p>Покажите, что здесь можно пробовать, ошибаться и пропускать. Участник оценивает желание заниматься, а не школьную успеваемость.</p></article><article class="card"><p class="card-kicker">ВО ВРЕМЯ</p><h3>Наблюдайте за действием</h3><p>Помогайте с управлением. При содержательной помощи отметьте это при обсуждении. Оставьте время на перерыв.</p></article><article class="card"><p class="card-kicker">ПОСЛЕ</p><h3>Назначьте следующую пробу</h3><p>Выберите два занятия, результат и дату возвращения к карте. Не прикрепляйте к участнику постоянный профессиональный ярлык.</p></article></div><section class="section"><div class="section-heading"><div><p class="eyebrow">ЛОКАЛЬНАЯ СВОДКА ГРУППЫ</p><h2>Какие пробы интересны участникам</h2><p class="section-lead">Загрузите JSON-файлы, которые участники решили передать вам. Файлы обрабатываются в этой вкладке и не отправляются на сервер.</p></div></div><div class="card"><label for="group-files" class="file-label">Выбрать результаты ПЕРВОСБОРКА (.json)</label><input id="group-files" type="file" accept=".json,application/json" multiple><p class="small muted">До 100 файлов, каждый до 1 МБ. Дубликаты одного кода заменяются последним загруженным. Файлы с неподдерживаемой версией исключаются. Идентификатор сессии не устанавливает личность участника.</p><p role="status">${esc(groupMessage)}</p>${groupResults.length?`<div class="hero-actions">${button('Скачать сводку CSV','export-group','btn-primary')}${button('Очистить сводку','clear-group','btn-ghost')}</div>`:''}</div>${groupResults.length?`<details class="received-list"><summary>Открыть персональные карты · ${groupResults.length}</summary><p class="small muted">Просмотр из файла не заменяет ваш текущий маршрут. Карты доступны до перезагрузки или закрытия этой вкладки.</p><ul class="received-rows">${groupResults.map(r=>`<li><div><strong>${esc(r.sessionId)}</strong><p>${r.mode==='full'?'Большая экспедиция':'Короткий маршрут'} · ${esc(r.age||'Возраст не указан')}${groupDetails.get(r.sessionId)?.issues.length?' · часть данных не прочитана':''}</p></div>${button('Открыть карту '+esc(r.sessionId),'go:received:'+r.sessionId,'btn-secondary btn-small')}</li>`).join('')}</ul></details>`:''}${byMode.filter(x=>x.records.length).map(({mode,records,protocol})=>`<div class="section"><h3>${mode==='full'?'Большой маршрут':'Короткое знакомство'} · файлов: ${records.length}</h3><p class="small muted">${esc(protocol)}</p><p class="age-summary"><strong>Возрастные группы из файлов:</strong> ${esc(ageSummary(records))}</p>${records.some(r=>r.experienceVersion!=='2.0-visual')?'<p class="small muted">В прежней редакции явный выбор возраста отдельно не фиксировался. Уточните состав группы перед планированием занятия.</p>':''}<div class="table-scroll"><table class="data-table"><thead><tr><th>Направление</th><th>С достаточным числом ответов</th><th>Средний интерес 1–5</th><th>Выбрано для следующей пробы</th><th>Отметили завершение реальной пробы</th></tr></thead><tbody>${E.tracks.map(t=>{const vals=records.map(r=>E.interestScores(D,r).find(x=>x.track===t.id)).filter(x=>x.eligible),planned=records.filter(r=>(r.planned||[]).includes(t.id)).length;return `<tr><th>${t.name}</th><td>${vals.length} / ${records.length}</td><td>${vals.length?fmt(vals.reduce((a,x)=>a+x.mean,0)/vals.length):'Нет данных'}</td><td>${planned}</td><td>${records.filter(r=>r.projectTrials?.[t.id]?.status==='completed').length}</td></tr>`;}).join('')}</tbody></table></div><p class="small muted">Сводка описывает загруженные ответы. Завершение реальной пробы — отдельная отметка участника, даже если направление позже убрано из плана. Это не норма и не рейтинг участников. Длина маршрута, редакция и порядок знакомства с миссиями показаны отдельно. Неполные данные не заполняются нулями.</p></div>`).join('')}</section><section class="section grid-2"><div class="card"><h2>Практический сценарий</h2><ol class="project-steps"><li>5 минут — знакомство с задачей и управлением.</li><li>35–50 минут — большой маршрут с возможностью паузы.</li><li>10–15 минут — разговор по карте в небольшой группе.</li><li>В течение двух недель — две реальные пробы.</li><li>После проб — обсуждение того, что хочется продолжить.</li></ol><p class="small muted">Время предварительное; уточняется на пилоте. Полный формат удобно разделить на два занятия.</p></div><div class="card"><h2>Что считать успехом пилота</h2><ul><li>Участник понял формулировки и смог управлять заданиями.</li><li>Он назвал причины своего выбора.</li><li>Выбрал и реально прошёл следующую пробу.</li><li>Наставник смог назначить подходящий старт.</li><li>Технопарк получил основания планировать мастер-классы.</li></ul><p>Не используйте карту для отказа в обучении или ранжирования детей.</p></div></section></section>`;
}
function render(keep=false){
 const route=currentRoute(),[base,arg]=route.split(':'),active=document.activeElement?.id,activeAction=document.activeElement?.dataset.action;
 destroyExperiences();
 const scroll=window.scrollY;
 let page;currentPassportModel=null;
 if(['profile','hub','interests','situation','report','projects'].includes(base)&&!state){page=choose();}
 else{
  switch(base){
   case 'home':page=home();break;case 'choose':page=choose();break;case 'profile':page=profile();break;case 'hub':page=hub();break;
   case 'interests':page=interests(arg);break;case 'situation':page=situation(arg);break;case 'labs':page=labs();break;case 'lab':page=labPage(arg);break;
   case 'transfer':page=transferPage();break;case 'new-route':page=newRoutePage();break;case 'projects':page=projectsPage();break;case 'received':page=receivedCard(arg);break;case 'received-plan':page=receivedCard(arg,true);break;case 'report':page=report(state);break;case 'example':page=report(makeDemo(),true);break;case 'method':page=method();break;case 'mentor':page=mentor();break;default:page=notFound();
  }
 }
 app.innerHTML=header(base)+`<main id="main" class="page ${keep?'':'page-enter'}" data-page="${esc(base)}" tabindex="-1">${page}</main>`+footer();
 mountExperiences(base,arg);
 if(window.RouteOverview)routeOverviewController=window.RouteOverview.mount(document.getElementById('main'),{view:routeOverviewView,onCard:openInterestCard,onGo:overviewGo});
 if(window.MissionFocus&&base==='lab'&&document.querySelector('.studio-mission'))missionFocusController=window.MissionFocus.mount(document.getElementById('main'),{active:missionFocusView.active,onChange:active=>{missionFocusView={active};}});
 const passportRoot=document.querySelector('[data-passport-root]');if(passportRoot&&window.ResultPassport&&currentPassportModel)passportController=window.ResultPassport.mount(passportRoot,{model:currentPassportModel,view:passportView,onDownload:(name,body,type)=>download(name,body,type)});
 if(window.ReportExperience)reportController=window.ReportExperience.mount(document.getElementById('main'),{view:reportView});
 if(window.InteractionGuide)guideController=window.InteractionGuide.mount(document,{onBeforeOpen:()=>{focusController?.close({restoreFocus:false});navigationController?.close({restoreFocus:false});}});
 navigationController?.reportRoute(route);
 if(state&&['profile','interests','situation','lab','labs','report','hub'].includes(base)){state.lastRoute=route;if(['profile','interests','situation','lab'].includes(base))state.resumeRoute=route;save();}
 if(keep){
  let target=active?document.getElementById(active):Array.from(document.querySelectorAll('[data-action]')).find(el=>el.dataset.action===activeAction);
  if(target?.disabled){
   const action=activeAction||'';
   if(action.startsWith('draft-')){const box=target.closest('.draft-history');target=box?.querySelector('button:not(:disabled)')||box?.querySelector('[data-history-status]');}
   else target=action.startsWith('command:')?document.querySelector('[data-action="undo-command:robotics"]'):action.startsWith('undo-command:')?document.querySelector('[data-action="command:robotics:U"]'):target.closest('.move-controls')?.querySelector('button:not(:disabled)');
  }
  if(!target||target.disabled)target=document.getElementById('main');
  target.focus({preventScroll:true});window.scrollTo({top:scroll,behavior:'instant'});
 }
 else document.getElementById('main').focus({preventScroll:true});
 if(recoveryIssues.length){const box=document.createElement('div');box.className='notice';box.innerHTML='<strong>Сохранение проверено и восстановлено настолько, насколько возможно.</strong><p>Повреждённые поля не использованы. Исходный файл можно сохранить для разбора.</p>'+button('Скачать исходное сохранение','export-original','btn-secondary btn-small');document.getElementById('main').prepend(box);}
 updateStorageStatus();
 if(pendingViewFocus){const requested=pendingViewFocus;pendingViewFocus=null;if(requested.route===route){const target=document.getElementById(requested.id);if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});}}}
}
function start(mode,lab){
 if(state){pendingStart={mode,lab};importMessage='';go('new-route');return;}
 clearExperienceViews();
 state=E.emptyState(mode);state.experienceVersion=EXPERIENCE_VERSION;state.interestTiming={};save();go(lab?'lab:'+lab:'profile');
}
function download(name,body,type){
 const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportResult(){if(state){download('pervosborka-'+state.sessionId+'.json',JSON.stringify(E.createExport(D,state),null,2),'application/json;charset=utf-8');toast('Файл работы подготовлен: ответы, черновики и планы.');}}
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
function exportGroup(){
 const rows=[['Версия','Маршрут','Редакция и порядок','Файлов','Направление','Достаточно ответов','Средний интерес 1–5','Выбрано для пробы','Возрастные группы из файлов','Отметили завершение реальной пробы']];
 for(const {mode,protocol,records} of groupBuckets()){
  for(const t of E.tracks){
   const vals=records.map(r=>E.interestScores(D,r).find(x=>x.track===t.id)).filter(x=>x.eligible);
   rows.push([E.VERSION,mode,protocol,records.length,t.name,vals.length,vals.length?fmt(vals.reduce((a,x)=>a+x.mean,0)/vals.length):'',records.filter(r=>(r.planned||[]).includes(t.id)).length,ageSummary(records),records.filter(r=>r.projectTrials?.[t.id]?.status==='completed').length]);
  }
 }
 download('pervosborka-group-summary.csv','\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
}
function onClick(event){
 const menu=document.querySelector('.mobile-menu[open]');if(menu&&!event.target.closest('.mobile-menu'))menu.open=false;
 if(event.target.closest('.skip-link')){event.preventDefault();document.getElementById('main').focus();return;}
 const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
 const [action,a,bv,cv]=b.dataset.action.split(':');
 if(action==='mission-jump'){const target=document.getElementById('mission-'+a);if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:uiReducedMotion?'instant':'smooth'});}return;}
 if(action==='campus-pick'){selectCampus(a);return;}
 if(action.startsWith('scene-')){handleSceneAction(action,a,bv,b);return;}
 if(action==='meter'){meterIndex=Number(a);render(true);return;}
 if(action==='robot-play'){playRobot(b);return;}
 if(action==='go'){go([a,bv].filter(x=>x!==undefined).join(':'));return;}
 if(action==='start'){start(a);return;}
 if(action==='start-lab'){start('full',a);return;}
 if(action==='apply-import'){
  if(!pendingImport)return;
  if(adoptWork(pendingImport.state)){go(state.resumeRoute||E.nextUnansweredRoute(D,state));toast('Работа открыта. Можно продолжать.');}else render(true);
  return;
 }
 if(action==='cancel-import'){pendingImport=null;importMessage='Открытие отменено. Текущая работа не изменена.';importTicket++;render(true);return;}
 if(action==='export-previous'){exportPrevious();return;}
 if(action==='confirm-start'){
  if(!pendingStart)return;
  const {mode,lab}=pendingStart,next=E.emptyState(mode);next.experienceVersion=EXPERIENCE_VERSION;next.interestTiming={};
  if(adoptWork(next))go(lab?'lab:'+lab:'profile');else render(true);return;
 }
 if(action==='cancel-start'){pendingStart=null;importMessage='';go('hub');return;}
 if(action==='print'){window.print();return;}
 if(action==='export-bank'){download('pervosborka-bank-v1.json',JSON.stringify(D,null,2),'application/json;charset=utf-8');return;}
 if(action==='reset'){
  if(window.confirm('Удалить мою текущую работу и обе локальные резервные копии ПЕРВОСБОРКИ из этого браузера? Скачанные файлы останутся у тебя.')){
   let result;try{result=window.ContinuityStorage.clear(localStorage,KEY);}catch(e){result={ok:false};}
   if(!result.ok){storageOK=false;render(true);toast('Удаление не завершено. Сохрани открытые ответы в файл и проверь настройки хранения браузера.');return;}
   clearExperienceViews();state=null;recoveryRaw=null;recoveryIssues=[];recoveryBlocked=false;storageOK=true;pendingImport=null;pendingStart=null;importMessage='';importTicket++;
   go('home');toast('Текущая работа и локальные резервные копии удалены.');
  }return;
 }
 if(action==='export-original'){if(recoveryRaw)download('pervosborka-original-save.json',recoveryRaw,'application/json;charset=utf-8');return;}
 if(action==='export'){exportResult();return;}
 if(action==='export-group'){exportGroup();return;}
 if(action==='clear-group'){groupTicket++;groupResults=[];groupDetails=new Map();groupMessage='Сводка очищена.';render(true);return;}
 if(!state)return;
 if(action==='interest-view'){
  if(a==='cards'||a==='list'){interestMode=a;render(true);}return;
 }
 if(['interest-jump','interest-next','interest-prev'].includes(action)){
  const info=interestPageInfo(a),{page,pages,cursor,part,all,missing}=info;
  if(action==='interest-jump'){
   const next=Number(bv);if(!Number.isInteger(next)||next<0||next>=part.length)return;interestCursors[page]=next;
  }else if(action==='interest-next'){
   if(!has(state.answers,part[cursor].id))return;
   if(all){go(page===pages-1?'situation:0':'interests:'+(page+1));return;}
   interestCursors[page]=cursor<part.length-1?cursor+1:missing;
  }else{
   if(cursor>0)interestCursors[page]=cursor-1;
   else if(page>0){interestCursors[page-1]=7;go('interests:'+(page-1));return;}
   else{go('labs');return;}
  }
  render(true);document.getElementById('interest-deck-question')?.focus({preventScroll:true});document.querySelector('.interest-deck')?.scrollIntoView({block:'start',behavior:'auto'});return;
 }
 if(action==='profile-done'){state.profileDone=true;save();go(E.nextUnansweredRoute(D,state));return;}
 if(action==='answer'){if(!E.getQuestions(D,state.mode).some(q=>q.id===a)||!(bv==='null'||/^[1-5]$/.test(bv)))return;state.interestTiming=state.interestTiming||{};state.interestTiming[a]=Object.values(state.labs).some(x=>x.first)?'after-mission':'before-mission';state.answers[a]=bv==='null'?null:Number(bv);save();render(true);return;}
 if(action==='skip-interests'){
  const qs=E.getQuestions(D,state.mode).slice(Number(a)*8,Number(a)*8+8);qs.forEach(q=>{if(!has(state.answers,q.id))state.answers[q.id]=null;});save();render(true);return;
 }
 if(action==='situation'){state.situations[a]=bv;save();render(true);return;}
 if(action==='skip-situation'){state.situations[a]=null;save();go(Number(bv)+1>=(state.mode==='quick'?2:8)?(E.progress(D,state).labCount>=E.progress(D,state).targetLabs?'report':'labs'):'situation:'+(Number(bv)+1));return;}
 if(action==='plan'){
  if(state.planned.includes(a))state.planned=state.planned.filter(x=>x!==a);
  else if(state.planned.length<2)state.planned.push(a);
  else{toast('В плане уже две пробы. Сначала убери одну, чтобы выбрать другую.');return;}
  save();render(true);return;
 }
 if(action==='reflect'){state.reflections[a]=bv==='null'?null:Number(bv);save();render(true);return;}
 if(action==='next-lab'){
  const next=E.tracks.find(t=>t.id!==a&&!state.labs[t.id]?.first&&!state.labs[t.id]?.skipped);
  if(state.mode==='quick'&&E.progress(D,state).labCount>=2){go(nextReflectionStage());return;}
  go(next?'lab:'+next.id:nextReflectionStage());return;
 }
 const lab=labFor(a);if(!lab)return;const draft=draftFor(lab);
 if(['draft-undo','draft-redo','draft-checked'].includes(action)){
  if(!draftHistory)return;
  let result;
  if(action==='draft-checked'){
   const checked=state.labs[lab.track]?.lastDraft;if(!checked||sameDraft(lab,draft,checked))return;
   const before=JSON.parse(JSON.stringify(draft));rememberDraft(lab,before,checked,'Возврат проверенного варианта');result={draft:checked,label:'Проверенный вариант восстановлен. Это действие можно отменить.'};
  }else{result=draftHistory[action==='draft-undo'?'undo':'redo'](lab.track,draft);if(result)result.label=(action==='draft-undo'?'Отменено: ':'Возвращено: ')+result.label.toLowerCase()+'.';}
  if(!result){refreshDraftHistory(lab,'История этого варианта недоступна. Продолжай со своей текущей работы.');return;}
  restoreDraft(lab,result.draft);refreshDraftHistory(lab,result.label);
  if(lab.type==='parameters'&&b.disabled){const box=b.closest('.draft-history');(box?.querySelector('button:not(:disabled)')||box?.querySelector('[data-history-status]'))?.focus({preventScroll:true});}
  return;
 }
 if(action==='next-incomplete'){const items=lab.type==='branch'?lab.config.stages:lab.type==='classify'?lab.config.measurements:null;if(!items)return;const values=lab.type==='branch'?draft.choices:draft.classes,item=items.find(x=>!values[x.id]);const target=item?document.getElementById((lab.type==='branch'?'branch-stage-':'measurement-row-')+item.id):null;if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:uiReducedMotion?'instant':'smooth'});}return;}
 if(action==='param-step'){if(lab.type!=='parameters'||!['thickness','ribs'].includes(bv)||![-1,1].includes(Number(cv)))return;const before=JSON.parse(JSON.stringify(draft)),lo=bv==='thickness'?1:0,hi=bv==='thickness'?5:4;draft[bv]=Math.max(lo,Math.min(hi,draft[bv]+Number(cv)));rememberDraft(lab,before,draft,bv==='thickness'?'Толщина стенки':'Количество рёбер');save();updateEngineering(lab,draft);const stepStatus=document.getElementById('engineering-step-status');if(stepStatus)stepStatus.textContent=bv==='thickness'?'Толщина: '+draft.thickness+' мм.':'Количество рёбер: '+draft.ribs+'.';if(b.disabled)document.getElementById(bv)?.focus({preventScroll:true});return;}
 const beforeEdit=JSON.parse(JSON.stringify(draft));
 if(action==='select'){draft.selected=draft.selected.includes(bv)?draft.selected.filter(x=>x!==bv):[...draft.selected,bv];}
 else if(action==='command'){if(draft.commands.length<lab.config.maxCommands)draft.commands.push(bv);}
 else if(action==='undo-command'){draft.commands.pop();}
 else if(action==='remove-command'){const index=Number(bv);if(lab.type!=='robot'||!Number.isInteger(index)||index<0||index>=draft.commands.length)return;draft.commands.splice(index,1);}
 else if(action==='move'){
  const i=Number(bv),j=i+Number(cv);if(j>=0&&j<draft.order.length)[draft.order[i],draft.order[j]]=[draft.order[j],draft.order[i]];
 }
 else if(action==='branch'){draft.choices[bv]=cv;}
 else if(action==='classify'){draft.classes[bv]=cv;}
 else if(action==='reset-draft'){state.drafts[a]=E.defaultDraft(lab);}
 else if(action==='hint'){
  state.labs[a]=state.labs[a]||{};state.labs[a].hintUsed=true;
 }
 else if(action==='check'){
  const result=E.gradeLab(lab,draft),record=state.labs[a]||{},snapshot=JSON.parse(JSON.stringify(draft));
  if(!record.first){record.first=result;record.firstDraft=snapshot;record.firstHadHint=!!record.hintUsed;record.firstAt=new Date().toISOString();}
  record.last=result;record.lastDraft=snapshot;record.attempts=(record.attempts||0)+1;record.skipped=false;record.lastAt=new Date().toISOString();state.labs[a]=record;
 }
 else if(action==='skip-lab'){
  state.labs[a]=state.labs[a]||{};if(!state.labs[a].first)state.labs[a].skipped=true;save();go('labs');return;
 }else return;
 if(['select','command','undo-command','remove-command','move','branch','classify','reset-draft'].includes(action))rememberDraft(lab,beforeEdit,state.drafts[lab.track],draftEditLabel(action));
 save();render(true);
 if(action==='hint'){const hintBox=document.getElementById('lab-hint');hintBox?.focus({preventScroll:true});hintBox?.scrollIntoView({block:'nearest'});}
 if(action==='remove-command'){const target=document.querySelector('[data-action="remove-command:'+a+':'+Math.min(Number(bv),draft.commands.length-1)+'"]')||document.querySelector('[data-action="command:'+a+':U"]');target?.focus({preventScroll:true});}
 if(action==='check'){const feedback=document.getElementById('mission-feedback');feedback?.focus({preventScroll:true});feedback?.scrollIntoView({behavior:uiReducedMotion?'instant':'smooth',block:'start'});}
}
document.addEventListener('click',onClick);
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.defaultPrevented)return;const menu=document.querySelector('.mobile-menu[open]');if(menu&&menu.contains(event.target)){menu.open=false;menu.querySelector('summary')?.focus();}});
document.addEventListener('input',event=>{
 const el=event.target;if(!state)return;
 if(el.dataset.trialField==='note'&&E.KEYS.includes(el.dataset.trialTrack)){
  state.projectTrials=state.projectTrials||{};state.projectTrials[el.dataset.trialTrack]=state.projectTrials[el.dataset.trialTrack]||{};
  state.projectTrials[el.dataset.trialTrack].note=el.value.slice(0,280);save();
  const summary=document.getElementById('trial-title-'+el.dataset.trialTrack)?.closest('.pt-card')?.querySelector('.pt-note-text');if(summary)summary.textContent=el.value||'Пока нет записи';
  return;
 }
 if(!el.dataset.param)return;
 const lab=labFor(el.dataset.track);if(!lab||lab.type!=='parameters'||!['thickness','ribs'].includes(el.dataset.param))return;
 const draft=draftFor(lab),before=JSON.parse(JSON.stringify(draft)),param=el.dataset.param,lo=param==='thickness'?1:0,hi=param==='thickness'?5:4,value=Number(el.value);
 if(!Number.isInteger(value)||value<lo||value>hi)return;
 draft[param]=value;rememberDraft(lab,before,draft,param==='thickness'?'Толщина стенки':'Количество рёбер');save();
 updateEngineering(lab,draft);
});
document.addEventListener('change',async event=>{
 const el=event.target;
 if(el.id==='personal-file'){
  const file=el.files?.[0],ticket=++importTicket;pendingImport=null;importMessage='';
  if(!file){render(true);return;}
  importMessage='Проверяем файл…';const status=document.getElementById('import-status');if(status)status.textContent=importMessage;
  try{
   if(file.size>1024*1024)throw new Error('Файл больше 1 МБ. Выбери JSON, скачанный из ПЕРВОСБОРКИ.');
   const prepared=E.prepareImport(D,JSON.parse(await file.text()));if(ticket!==importTicket)return;
   pendingImport={...prepared,fileName:file.name};importMessage='Файл проверен. Посмотри данные перед открытием.';
  }catch(e){if(ticket!==importTicket)return;importMessage=e instanceof SyntaxError?'Файл не удалось прочитать как JSON. Выбери сохранённую работу ПЕРВОСБОРКИ.':e.message||'Не удалось открыть файл.';}
  render(true);document.getElementById('import-preview')?.focus();return;
 }
 if(el.id==='group-files'){
  const files=Array.from(el.files),overLimit=Math.max(0,files.length-100),ticket=++groupTicket;let accepted=0,rejected=0;
  for(const file of files.slice(0,100)){
   try{
    if(file.size>1024*1024)throw new Error('size');
    const raw=await file.text();if(ticket!==groupTicket)return;
    const obj=JSON.parse(raw);
    const prepared=E.prepareImport(D,obj),safe=prepared.state;
    const index=groupResults.findIndex(r=>r.sessionId===safe.sessionId);
    if(index<0&&groupResults.length>=100)throw new Error('limit');
    if(index<0)groupResults.push(safe);else groupResults[index]=safe;
    groupDetails.set(safe.sessionId,{kind:prepared.kind,issues:prepared.issues,warnings:prepared.warnings});accepted++;
   }catch(e){rejected++;}
  }
  if(ticket!==groupTicket)return;
  groupMessage=`Выбрано файлов: ${files.length}. Загружено: ${accepted}. Не принято: ${rejected}. Сверх лимита: ${overLimit}. Всего уникальных сессий в сводке: ${groupResults.length}. После перезагрузки или закрытия страницы сводку нужно загрузить снова.`;
  render(true);return;
 }
 if(!state)return;
 if(el.dataset.trialTrack&&E.KEYS.includes(el.dataset.trialTrack)){
  const id=el.dataset.trialTrack,field=el.dataset.trialField,value=el.value;
  if(!['status','happenedOn','note','next'].includes(field))return;
  const records=JSON.parse(JSON.stringify(state.projectTrials||{}));records[id]=records[id]||{};records[id][field]=field==='note'?value.slice(0,280):value;
  const checked=E.restoreState(D,{...state,projectTrials:records});
  if(checked.issues.includes('projectTrials.'+id+'.'+field)){toast('Проверь значение: дата должна существовать в календаре.');return;}
  state.projectTrials=checked.state.projectTrials;save();render(true);return;
 }
 if(el.dataset.planTrack&&E.KEYS.includes(el.dataset.planTrack)){
  const field=el.dataset.planField,value=el.value;
  if(field==='artifact'&&(value===''||has(planArtifacts,value))||field==='reviewDate'&&el.validity.valid){
   state.nextSteps=state.nextSteps||{};state.nextSteps[el.dataset.planTrack]=state.nextSteps[el.dataset.planTrack]||{};state.nextSteps[el.dataset.planTrack][field]=value;save();render(true);
  }return;
 }
 if(el.dataset.field)state[el.dataset.field]=el.value;
 if(el.dataset.experience){if(el.value==='')delete state.experience[el.dataset.experience];else state.experience[el.dataset.experience]=Number(el.value);el.closest('.profile-experience-card')?.classList.toggle('is-set',el.value!=='');const counter=document.getElementById('profile-answer-count');if(counter)counter.textContent=E.KEYS.filter(id=>has(state.experience,id)).length+' / 8 отмечено';}
 save();
});
window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'});});
if(window.NavigationExperience)navigationController=window.NavigationExperience.mount({getEntries:navigationEntries,getCurrentRoute:currentRoute,onNavigate:go,onPreferences:(prefs,details)=>{uiReducedMotion=!!details.effectiveReducedMotion;if(robotMotionOptions)robotMotionOptions.reducedMotion=uiReducedMotion;if(uiReducedMotion)robotController?.pause();for(const controller of sceneControllers.values())controller.update({reducedMotion:uiReducedMotion});}});
render();

function makeDemo(){
 if(demoState)return demoState;
 const s=E.emptyState('full');s.sessionId='ПРИМЕР';s.profileDone=true;s.age='14–15';
 const means={engineering:5,robotics:4,code:3,ai:3,design:4,xr:2,research:5,social:3};
 E.getQuestions(D,'full').forEach((q,i)=>s.answers[q.id]=Math.max(1,means[q.track]-(i%7===0?1:0)));
 E.tracks.forEach((t,i)=>s.experience[t.id]=i%3);
 D.situations.forEach((q,i)=>s.situations[q.id]=(q.options||q.choices)[i%4].id);
 D.labs.slice(0,4).forEach(l=>{const g=E.gradeLab(l,E.defaultDraft(l));s.labs[l.track]={first:g,last:g,attempts:1,hintUsed:false,firstHadHint:false};s.reflections[l.track]=4;});
 s.planned=['engineering','research'];demoState=s;return s;
}
function report(s,demo=false,received=false){
 const readOnly=demo||received,legacyReceived=received&&groupDetails.get(s.sessionId)?.kind==='legacy';
 const scores=E.interestScores(D,s),rec=E.recommendations(scores),p=E.progress(D,s);
 const answered=scores.reduce((a,x)=>a+x.count,0),completed=Object.values(s.labs).filter(x=>x.first).length,eligibleCount=scores.filter(x=>x.eligible).length;
 const ranked=rec.flat||rec.low?[]:rec.items;
 const recommendedIds=ranked.map(x=>x.track);
 const candidates=[...ranked.map(x=>track(x.track)),...E.tracks.filter(t=>!recommendedIds.includes(t.id))];
 const selected=(s.planned||[]).map(track).filter(Boolean);
 const date=new Date().toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
 const intro=eligibleCount===0?'Пока мало ответов для сравнения интересов. Можно вернуться к карточкам или начать с любой практической пробы.':eligibleCount===1?'Ответов пока достаточно только по одному направлению. Остальные ещё предстоит исследовать; сравнивать их сейчас рано.':rec.flat?(eligibleCount===8?'Интерес распределился ровно по всем восьми направлениям.':'Среди '+eligibleCount+' оценённых направлений интерес одинаков; по остальным пока недостаточно ответов.')+' Выбери две разные пробы и сравни впечатления.':rec.low?'Среди направлений с достаточными ответами пока нет высокой оценки интереса. Начни с короткого знакомства; новые впечатления помогут уточнить выбор.':'По твоим ответам эти занятия хочется попробовать в первую очередь. '+(eligibleCount<8?'Сравнение касается только направлений с достаточными ответами. ':'')+'Практика поможет уточнить выбор.';
 const fullReport=`<section class="container section report-page">${demo?'<div class="notice demo-notice"><strong>Демонстрационный пример.</strong> Ниже — специально созданные учебные ответы. Это не ваш результат.</div>':''}${received?'<p class="source-print">Карта участника из переданного файла · только просмотр</p>':''}<div class="report-hero"><div><p class="eyebrow">ПЕРСОНАЛЬНАЯ КАРТА · ${esc(s.sessionId)}</p><h1>Твоя сборка начинается<br>с любопытства.</h1><p class="section-lead">${intro}</p></div><div class="report-stats"><div><strong>${answered}</strong><span>${answered%10===1&&answered%100!==11?'ответ об интересах':answered%10>=2&&answered%10<=4&&(answered%100<12||answered%100>14)?'ответа об интересах':'ответов об интересах'}</span></div><div><strong>${completed}</strong><span>${completed%10===1&&completed%100!==11?'практическая проба':completed%10>=2&&completed%10<=4&&(completed%100<12||completed%100>14)?'практические пробы':'практических проб'}</span></div></div></div><div class="hero-actions no-print">${demo?button('Пройти свой маршрут','go:choose','btn-primary'):received?'':button(icon('download')+' Скачать мою работу','export','btn-primary')}${button('Печать / сохранить PDF','print','btn-secondary')}${!readOnly?button('Мои следующие пробы','go:projects','btn-secondary')+button('Продолжить прохождение','go:hub','btn-ghost'):''}</div><p class="small muted">Редакция 2.0 · методика ${E.VERSION} · ${date} · ${s.mode==='quick'?'Короткий маршрут: предварительная карта':'Большая экспедиция'} · ${legacyReceived?'В прежнем файле нет всех отметок этапов; общий процент прохождения не рассчитан.':'Этапы маршрута отмечены на '+p.percent+'%.'}</p><div class="callout data-coverage"><strong>Для сравнения достаточно ответов по ${eligibleCount} из 8 направлений.</strong><p>Числовых ответов: ${answered}. Проверенных проб: ${completed}. Пропуски засчитываются в прохождение, но не создают результат.</p><p class="small muted">${esc(protocolLabel(s))}. Порядок относится к моменту ответа относительно первой проверки миссии; само знакомство с заданием отдельно не фиксируется.</p></div>${s.age==='12–13'?'<div class="callout">В 12–13 лет интересы ещё активно меняются. Используй карту как приглашение познакомиться с разными занятиями и вернись к ней после реальных проб.</div>':''}${String(s.age||'').startsWith('18+')?'<div class="callout">Для взрослых этот прототип предназначен только для знакомства с форматом. Отдельная взрослая версия ещё не разработана и не проверена.</div>':''}
${window.ReportExperience?window.ReportExperience.reportNav():''}<div class="report-grid section"><div class="card"><h2 id="report-interests" tabindex="-1">Карта интересов</h2><p class="small muted">Среднее по шкале 1–5. Это оценка желания заниматься, а не процент пригодности.</p>${window.ReportExperience?window.ReportExperience.sortControls():''}<div class="bar-chart">${scores.map((x,index)=>{const t=track(x.track);return `<div class="bar-row" data-rx-mean="${x.mean??''}" data-rx-order="${index}" data-rx-eligible="${x.eligible}"><div class="bar-label"><strong>${t.name}</strong><span>${x.count} из ${x.total} ответов</span></div><div class="bar-track"><div class="bar-fill" style="width:${x.eligible?(x.mean-1)/4*100:0}%;background:${t.color}"></div></div><div class="bar-value">${x.eligible?fmt(x.mean):'—'}</div>${!x.eligible?'<span class="bar-note small muted">Недостаточно ответов для сравнения</span>':''}${window.ReportExperience?window.ReportExperience.trackDetails({track:t,score:x,record:s.labs[t.id],reflection:s.reflections[t.id],hasReflection:has(s.reflections,t.id),readOnly}):''}</div>`;}).join('')}</div><p class="small muted">«Не могу оценить» не снижает среднее. Для сравнения нужны минимум ${s.mode==='quick'?'2 из 2':'4 из 6'} ответа по направлению. Это рабочее правило пилота.</p></div><div class="card report-summary"><p class="eyebrow">ЧТО ПОПРОБОВАТЬ ПЕРВЫМ</p><h2>${ranked.length?'Направления для знакомства':'Расширь поле поиска'}</h2>${ranked.length?ranked.map(x=>`<div class="recommendation"><span class="track-icon" style="--track:${track(x.track).color}">${icon(x.track)}</span><div><h3>${track(x.track).name}</h3><p>${fmt(x.mean)} из 5 · Ответов: ${x.count}. ${track(x.track).tag}.</p></div></div>`).join(''):'<p>Выбери ниже любые два разных направления. После первого проекта обсуди с наставником, что увлекло и что захотелось изменить.</p>'}<p class="small muted">Близкие значения не позволяют уверенно отличить направления. Равные оценки сохраняются; если на границе три направления делят место, карта показывает их все.</p></div></div>
<section class="section" data-rx-projects><div class="section-heading"><div><p class="eyebrow">ОТ ИНТЕРЕСА К ДЕЙСТВИЮ</p><h2 id="report-plan" tabindex="-1">${received?'Выбранные следующие пробы':'Выбери две следующие пробы'}</h2></div><p class="small muted">${demo?'В примере выбраны инженерия и метрология.':received?'Выбор участника из переданного файла.':'Нажми на карточку проекта, чтобы включить её в свой план.'}</p></div>${window.ReportExperience?window.ReportExperience.planTray(E.tracks,s.planned||[],readOnly):''}${window.ReportExperience&&!received?window.ReportExperience.projectTools():''}<div class="grid-3">${(received?selected:candidates).map(t=>{const exp=s.experience[t.id],chosen=(s.planned||[]).includes(t.id);return `<article class="card route-card ${chosen?'selected':''}" data-rx-project="${t.id}" data-rx-chosen="${chosen}"><div class="track-top"><span class="track-icon" style="--track:${t.color}">${icon(t.id)}</span><span class="badge">${exp>=2?'Самостоятельный старт':'С наставником / вводный старт'}</span></div><p class="small muted">${t.name}</p><h3>${t.project}</h3><ol class="project-steps">${t.plan.map(v=>'<li>'+v+'</li>').join('')}</ol>${exp>=2?'<p class="small"><strong>Следующий уровень:</strong> '+t.advanced+'</p>':''}${!readOnly?button(chosen?'✓ В моём плане':'Добавить в план','plan:'+t.id,chosen?'btn-primary btn-small':'btn-secondary btn-small','aria-pressed="'+chosen+'"'):''}</article>`;}).join('')}</div>${nextStepCards(selected,s,readOnly)}${received?trialBlock(s,true):!readOnly&&selected.length?`<div class="project-jump no-print"><div><h3>После настоящего занятия вернись сюда</h3><p>В плане можно отметить, что удалось сделать и что хочется попробовать дальше.</p></div>${button('Открыть план и дневник проб','go:projects','btn-primary')}</div>`:''}${selected.length?`<div class="callout callout-blue"><h3>План на ближайшие две недели</h3><div class="timeline"><div class="timeline-item"><strong>День 1–2</strong><p>Обсуди с наставником выбранные пробы: ${selected.map(t=>t.project).join('; ')}. Уточни доступные материалы и время.</p></div><div class="timeline-item"><strong>День 3–10</strong><p>Сделай маленький прототип по каждому направлению. Сохрани рисунок, модель, программу или протокол как результат.</p></div><div class="timeline-item"><strong>День 11–14</strong><p>Покажи результат, назови самое интересное действие и выбери, что продолжить. Повторно оцени интерес после реального опыта.</p></div></div></div>`:''}</section>
<section class="section"><p class="eyebrow">ФАКТЫ О ПРАКТИКЕ</p><h2 id="report-practice" tabindex="-1">Что произошло в лабораториях</h2><div class="table-scroll"><table class="data-table rx-practice-table" role="table"><thead><tr><th>Направление</th><th>Первая проверка</th><th>Последняя проверка</th><th>Помощь и опыт</th><th>Хочется продолжить</th></tr></thead><tbody>${E.tracks.map(t=>{const l=s.labs[t.id];return `<tr role="row"><th scope="row" role="rowheader">${t.name}</th><td role="cell" data-label="Первая проверка">${l?.first?l.first.score+' / '+l.first.total+' условий':l?.skipped?'Пропущено':'Не проверялось'}</td><td role="cell" data-label="Последняя проверка">${l?.last?l.last.score+' / '+l.last.total+' · проверок: '+l.attempts:'—'}</td><td role="cell" data-label="Помощь и опыт">${l?.hintUsed?'Подсказка использована'+(!l.first?' (проверки ещё не было)':l.firstHadHint?' до первой проверки':' после первой проверки'):'Подсказка не отмечена'}<br><span class="muted">${has(s.experience,t.id)?experienceLabels[s.experience[t.id]]:'Опыт не указан'}</span></td><td role="cell" data-label="Хочется продолжить">${has(s.reflections,t.id)?s.reflections[t.id]===null?'Пока не могу оценить':s.reflections[t.id]+' / 5':'Нет ответа'}</td></tr>`;}).join('')}</tbody></table></div><p class="small muted">Результаты разных лабораторий не складываются и не сравниваются между собой: задания и число условий различаются. Повтор после обратной связи — обучающая попытка.</p></section>
<section class="section grid-2"><div class="card"><h2>Твои решения в ситуациях</h2>${D.situations.filter(q=>s.situations[q.id]).map(q=>{const c=(q.options||q.choices).find(c=>c.id===s.situations[q.id]);return c?`<div class="evidence"><strong>${esc(q.title||q.prompt)}</strong><p>${esc(c.label||c.text)}</p></div>`:'';}).join('')||'<p>Ситуации пока не пройдены.</p>'}<p class="small muted">Это выбранные способы действия, без оценки личности и без баллов.</p></div><div class="card"><h2>Разговор с наставником</h2><ol class="project-steps"><li>Какая задача увлекла сильнее, чем ты ожидал?</li><li>Что хочется повторить даже после ошибки?</li><li>Какой реальный результат хочется сделать за две недели?</li><li>Какая помощь или адаптация задания будет полезна?</li></ol><div class="divider"></div><h3>Как продолжить в Технопарке</h3><p>Покажи эту карту наставнику и уточни ближайшую доступную пробу, мастер-класс или проект СКБ.</p><a href="https://technopark-rgsu.ru/" target="_blank" rel="noopener">Сайт Технопарка РГСУ ↗</a><p class="small muted">Предложенные проекты — учебные идеи прототипа. Они не являются расписанием или подтверждением набора на курс.</p></div></section><div class="callout"><strong>Как читать эту карту</strong><p>Она отражает твои ответы сегодня и выполнение конкретных задач. Это пилотная авторская методика без возрастных норм. По ней нельзя принимать решения об отборе, диагнозе или профессиональной пригодности. Сравнивай впечатления с реальной практикой.</p><a href="#method">Методика и источники →</a></div></section>`;
 currentPassportModel={sessionId:s.sessionId,mode:s.mode,date,demo,received,tracks:scores.map(x=>({id:x.track,name:track(x.track).name,color:track(x.track).color,mean:x.mean,count:x.count,total:x.total,eligible:x.eligible,checked:!!s.labs[x.track]?.first,reflection:s.reflections[x.track],hasReflection:has(s.reflections,x.track)})),planned:selected.map(t=>({id:t.id,name:t.name,project:t.project})),answered,checked:completed,markedPercent:legacyReceived?null:p.percent};
 return (readOnly?'':progressHeader(4))+(window.ResultPassport?`<div data-passport-root>${window.ResultPassport.html(currentPassportModel)}<div data-passport-full hidden>${fullReport}</div></div>`:fullReport);
}
})();
