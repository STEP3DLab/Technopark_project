/*
 * NavigationExperience — local navigation, appearance and keyboard help.
 * mount({getEntries, getCurrentRoute, onNavigate, getPreferences?, onPreferences?})
 * Entries: {id,label,description?,keywords?:string|string[],group?,route}.
 * Preferences: {largeText,highContrast,reducedMotion}; no storage or network.
 * onPreferences(copy,{reason,effectiveReducedMotion}) includes the OS preference.
 * open('find'|'view'|'help'), close(), reportRoute(route), getPreferences(), destroy().
 * Mount once for the page; reportRoute after route changes. Search and preferences
 * never access participant answers. Destroy restores owned attributes and styles;
 * preferences and the last three sections survive a remount in this document only.
 */
(function(global){
 'use strict';
 const sessions=new WeakMap(),controllers=new WeakMap();let sequence=0;
 const KEYS=['largeText','highContrast','reducedMotion'];
 const ATTRS=['data-ui-text','data-ui-contrast','data-ui-motion'];
 const BODY_STYLES=['position','top','left','width','overflow','padding-right'];
 const FOCUSABLE='a[href],button,input,select,textarea,[tabindex]';
 const ALIASES={engineering:'инженерия инженер конструктор конструкция 3д 3d модель печать производство',robotics:'робот робототехника роботы программа команды автоматизация',code:'код программирование программист данные алгоритм питон python',ai:'ии ai искусственный интеллект нейросеть нейросети машинное обучение',design:'дизайн дизайнер медиа графика интерфейс творчество',xr:'xr vr ar виртуальная дополненная реальность игры геймдев выставка',research:'исследования исследователь наука метрология измерение эксперимент',social:'социальные технологии общество люди мероприятие помощь волонтер'};
 function normalize(value){return String(value??'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim().replace(/\s+/g,' ');}
 function routeOf(value){const route=String(value??'').replace(/^#/,'');return /^[a-z][a-z0-9-]*(?::[a-zA-Z0-9_-]+)*$/.test(route)?route:'';}
 function safePreferences(source,fallback={largeText:false,highContrast:false,reducedMotion:false}){return Object.fromEntries(KEYS.map(key=>[key,typeof source?.[key]==='boolean'?source[key]:!!fallback[key]]));}
 function catalogOf(source){
  const usedIds=new Set(),usedRoutes=new Set(),out=[];
  for(const raw of Array.isArray(source)?source.slice(0,100):[]){
   if(!raw||typeof raw.id!=='string'||typeof raw.label!=='string')continue;
   const id=raw.id.slice(0,100),label=raw.label.trim().slice(0,120),route=routeOf(raw.route);
   if(!id||!label||!route||usedIds.has(id)||usedRoutes.has(route))continue;
   usedIds.add(id);usedRoutes.add(route);
   const description=String(raw.description??'').slice(0,240),group=String(raw.group||'Разделы').slice(0,60),keywords=Array.isArray(raw.keywords)?raw.keywords.slice(0,40).join(' '):String(raw.keywords??''),alias=ALIASES[route.startsWith('lab:')?route.slice(4):id]||'';
   out.push({id,label,route,description,group,labelSearch:normalize(label),keywordSearch:normalize(keywords+' '+alias),search:normalize([label,description,keywords,alias,group].join(' '))});
  }
  return out;
 }
 function findRoute(entries,route){return entries.find(entry=>entry.route===route)||(route.split(':')[0]!=='lab'?entries.find(entry=>entry.route.split(':')[0]===route.split(':')[0]):null);}
 function search(entries,query){
  const q=normalize(query);if(!q)return entries.slice();const words=q.split(' ');
  // Short abbreviations such as «ИИ» must not match the ending of «лаборатории».
  return entries.filter(entry=>words.every(word=>word.length<=2?entry.search.split(' ').some(token=>token.startsWith(word)):entry.search.includes(word))).map((entry,index)=>({entry,index,rank:entry.labelSearch===q?200:entry.labelSearch.startsWith(q)?120:entry.labelSearch.includes(q)?90:words.every(word=>entry.labelSearch.includes(word))?70:entry.keywordSearch.includes(q)?45:20})).sort((a,b)=>b.rank-a.rank||a.index-b.index).map(item=>item.entry);
 }
 function connected(node){return !!node&&(typeof node.isConnected==='boolean'?node.isConnected:!!node.ownerDocument?.documentElement?.contains(node));}
 function visible(node){if(!connected(node)||node.hidden||node.closest?.('[hidden],[inert],[aria-hidden="true"]'))return false;if(node.getClientRects&&!node.getClientRects().length)return false;const style=global.getComputedStyle?.(node);return !style||(style.display!=='none'&&style.visibility!=='hidden');}
 function restoreAttribute(node,key,value){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value);}
 function snapshotStyles(node){return BODY_STYLES.map(name=>({name,value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)}));}
 function restoreStyles(node,snapshot){for(const {name,value,priority}of snapshot){if(value)node.style.setProperty(name,value,priority);else node.style.removeProperty(name);}}
 function mount(options={}){
  const document=global.document;
  if(!document?.body||typeof options.getEntries!=='function'||typeof options.onNavigate!=='function')throw new TypeError('NavigationExperience.mount needs a document, getEntries and onNavigate');
  controllers.get(document)?.destroy();
  let memory=sessions.get(document);
  if(!memory){memory={recent:[],preferences:{largeText:document.documentElement.getAttribute(ATTRS[0])==='large',highContrast:document.documentElement.getAttribute(ATTRS[1])==='high',reducedMotion:document.documentElement.getAttribute(ATTRS[2])==='reduced'}};sessions.set(document,memory);}
  if(typeof options.getPreferences==='function')memory.preferences=safePreferences(options.getPreferences(),memory.preferences);
  const root=document.documentElement,originalAttrs=ATTRS.map(name=>({name,value:root.getAttribute(name)})),listeners=[],motion=global.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false};
  let destroyed=false,current=null,frame=0,lastRoute='',observer=null,appliedAttrs=[];
  function element(tag,className,text){const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function listen(target,type,fn,settings=false){target.addEventListener(type,fn,settings);listeners.push(()=>target.removeEventListener(type,fn,settings));}
  function entries(){return catalogOf(options.getEntries());}
  function effectiveMotion(){return memory.preferences.reducedMotion||!!motion.matches;}
  function notifyPreferences(reason){if(typeof options.onPreferences==='function')options.onPreferences({...memory.preferences},{reason,effectiveReducedMotion:effectiveMotion()});}
  function applyPreferences(reason){
   appliedAttrs=[memory.preferences.largeText?'large':null,memory.preferences.highContrast?'high':null,effectiveMotion()?'reduced':null];
   ATTRS.forEach((name,index)=>restoreAttribute(root,name,appliedAttrs[index]));
   if(current){for(const [key,input]of current.preferences)input.checked=memory.preferences[key];current.systemMotion.textContent=motion.matches?'На устройстве уже включено уменьшение движения. Оно действует независимо от переключателя.':'Настройки действуют в этой вкладке и не меняют ответы.';}
   notifyPreferences(reason);queueTop();
  }
  function foreignModal(){return [...document.querySelectorAll('[aria-modal="true"]')].some(node=>node!==current?.overlay&&visible(node));}
  const topButton=element('button','nx-back-top');topButton.type='button';topButton.hidden=true;topButton.setAttribute('aria-label','Вернуться в начало страницы');topButton.setAttribute('title','Наверх');
  const topIcon=element('span','nx-top-icon','↑');topIcon.setAttribute('aria-hidden','true');topButton.append(topIcon,element('span','nx-top-label','Наверх'));document.body.append(topButton);
  function hideTop(){if(!topButton.hidden){if(document.activeElement===topButton)document.getElementById?.('main')?.focus?.({preventScroll:true});topButton.hidden=true;}}
  function updateTop(){
   frame=0;if(destroyed)return;
   const height=global.innerHeight||root.clientHeight||800,y=global.scrollY||0,total=Math.max(root.scrollHeight||0,document.body.scrollHeight||0);
   if(current||foreignModal()||y<=Math.max(600,height*.9)||total<height*1.7){hideTop();return;}
   topButton.hidden=false;
   // Leave an action unobscured even when a page puts it in the floating corner.
   const rect=topButton.getBoundingClientRect(),intersects=other=>rect.left<other.right+8&&rect.right>other.left-8&&rect.top<other.bottom+8&&rect.bottom>other.top-8;
   for(const action of document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[data-nav-top-avoid]')){
    if(action===topButton||topButton.contains(action)||!visible(action))continue;
    if(intersects(action.getBoundingClientRect())){hideTop();break;}
   }
  }
  function queueTop(){if(!destroyed&&!frame)frame=global.requestAnimationFrame?global.requestAnimationFrame(updateTop):global.setTimeout(updateTop,16);}
  function cancelTop(){if(!frame)return;if(global.cancelAnimationFrame)global.cancelAnimationFrame(frame);else global.clearTimeout(frame);frame=0;}
  function close({restoreFocus=true}={}){
   const session=current;if(!session)return false;current=null;
   for(const item of session.background){restoreAttribute(item.node,'aria-hidden',item.ariaHidden);restoreAttribute(item.node,'inert',item.inertAttribute);if(typeof item.inert==='boolean')item.node.inert=item.inert;}
   session.overlay.remove();restoreStyles(document.body,session.bodyStyles);
   if(session.opener){restoreAttribute(session.opener,'aria-expanded',session.openerAttrs.expanded);restoreAttribute(session.opener,'aria-controls',session.openerAttrs.controls);}
   global.scrollTo?.({left:session.scroll.x,top:session.scroll.y,behavior:'instant'});
   if(restoreFocus&&visible(session.opener)&&!session.opener.disabled)session.opener.focus({preventScroll:true});
   queueTop();return true;
  }
  function reportRoute(value){
   if(destroyed)return;
   const route=routeOf(value??options.getCurrentRoute?.());
   if(route&&lastRoute&&lastRoute!==route&&current)close({restoreFocus:false});
   lastRoute=route;
   const entry=findRoute(entries(),route);
   if(entry){memory.recent=[{id:entry.id,route},...memory.recent.filter(item=>item.id!==entry.id)].slice(0,3);}
   queueTop();
  }
  function activate(index){
   if(!current||!current.rows[index])return;
   const route=current.rows[index].route;close({restoreFocus:false});options.onNavigate(route);reportRoute(route);
  }
  function select(index,scroll=false){
   if(!current)return;const count=current.rows.length;current.selected=count?((index%count)+count)%count:-1;
   current.optionNodes.forEach((node,i)=>{const selected=i===current.selected;node.setAttribute('aria-selected',String(selected));node.className='nx-option'+(selected?' is-active':'');});
   const active=current.optionNodes[current.selected];
   if(active){current.input.setAttribute('aria-activedescendant',active.id);if(scroll)active.scrollIntoView?.({block:'nearest',behavior:'auto'});}else current.input.removeAttribute('aria-activedescendant');
  }
  function renderResults(){
   if(!current)return;const session=current,all=entries(),q=normalize(session.input.value),matched=search(all,q),recent=!q?memory.recent.map(item=>{const entry=all.find(value=>value.id===item.id);return entry?{...entry,route:item.route,displayGroup:'Недавно открывали'}:null;}).filter(Boolean):[];
   session.rows=q?matched:[...recent,...matched.filter(entry=>!recent.some(item=>item.id===entry.id))];session.optionNodes=[];session.list.replaceChildren();
   session.clear.hidden=!session.input.value;session.count.textContent=q?'Найдено: '+session.rows.length:session.rows.length+' разделов · выбери направление';
   const currentRoute=routeOf(options.getCurrentRoute?.()||lastRoute);let groupNode=null,previousGroup='';
   session.rows.forEach((entry,index)=>{
    const group=entry.displayGroup||entry.group;
    if(group!==previousGroup){groupNode=element('div','nx-result-group');groupNode.setAttribute('role','group');groupNode.setAttribute('aria-label',group);const heading=element('p','nx-result-group-title',group);heading.setAttribute('aria-hidden','true');groupNode.append(heading);session.list.append(groupNode);previousGroup=group;}
    const row=element('button','nx-option');row.type='button';row.tabIndex=-1;row.id=session.id+'-result-'+index;row.setAttribute('role','option');row.setAttribute('data-nav-entry',String(index));
    const symbol=element('span','nx-option-symbol',entry.route.startsWith('lab:')?'◈':'↗');symbol.setAttribute('aria-hidden','true');
    const copy=element('span','nx-option-copy');copy.append(element('strong','nx-option-label',entry.label));if(entry.description)copy.append(element('span','nx-option-description',entry.description));
    row.append(symbol,copy);
    if(findRoute([entry],currentRoute)){row.append(element('span','nx-current','Открыто'));row.setAttribute('aria-label',entry.label+'. Сейчас открыт'+(entry.description?'. '+entry.description:''));}
    else {const arrow=element('span','nx-option-arrow','↗');arrow.setAttribute('aria-hidden','true');row.append(arrow);}
    groupNode.append(row);session.optionNodes.push(row);
   });
   if(!session.rows.length){const empty=element('div','nx-empty');empty.append(element('strong','',q?'Пока ничего не найдено':'Разделы пока недоступны'),element('p','',q?'Попробуй другое слово: «робот», «дизайн» или «данные».':'Закрой панель и вернись к маршруту.'));session.list.append(empty);}
   select(0);
  }
  function switchTab(tab,{focus=true}={}){
   if(!current)return;const key=['find','view','help'].includes(tab)?tab:'find';current.tab=key;
   for(const [id,button]of current.tabs){button.setAttribute('aria-selected',String(id===key));button.tabIndex=id===key?0:-1;current.panels.get(id).hidden=id!==key;}
   if(focus)(key==='find'?current.input:current.tabs.get(key)).focus({preventScroll:true});
  }
  function open(tab='find',trigger){
   if(destroyed||foreignModal())return false;
   if(current){switchTab(tab);return true;}
   const id='navigation-'+(++sequence),overlay=element('div','nx-overlay');overlay.id=id;overlay.tabIndex=-1;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby',id+'-title');
   const dialog=element('section','nx-dialog'),header=element('header','nx-header'),heading=element('div','nx-heading'),title=element('h2','nx-title','Твоя экспедиция');title.id=id+'-title';heading.append(element('p','nx-kicker','ПЕРВОСБОРКА · БЫСТРЫЙ ДОСТУП'),title);
   const closeButton=element('button','nx-close','×');closeButton.type='button';closeButton.setAttribute('data-nav-close','');closeButton.setAttribute('aria-label','Закрыть панель');closeButton.setAttribute('title','Закрыть · Escape');header.append(heading,closeButton);
   const tabs=element('div','nx-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Поиск, вид и управление');
   const content=element('div','nx-content'),tabMap=new Map(),panels=new Map();
   for(const [key,label]of[['find','Найти'],['view','Вид'],['help','Управление']]){const button=element('button','nx-tab',label);button.type='button';button.id=id+'-tab-'+key;button.setAttribute('role','tab');button.setAttribute('data-nav-tab',key);button.setAttribute('aria-controls',id+'-panel-'+key);tabs.append(button);tabMap.set(key,button);const panel=element('section','nx-panel nx-panel-'+key);panel.id=id+'-panel-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.hidden=true;panels.set(key,panel);content.append(panel);}
   const field=element('div','nx-search-field'),label=element('label','nx-sr-only','Лаборатория или раздел');label.setAttribute('for',id+'-query');
   const input=element('input','nx-search');input.id=id+'-query';input.type='search';input.placeholder='Робот, 3D, интересы…';input.autocomplete='off';input.spellcheck=false;input.value='';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls',id+'-results');input.setAttribute('aria-describedby',id+'-count');
   const searchIcon=element('span','nx-search-icon','⌕');searchIcon.setAttribute('aria-hidden','true');const clear=element('button','nx-clear','×');clear.type='button';clear.hidden=true;clear.setAttribute('data-nav-clear','');clear.setAttribute('aria-label','Очистить поиск');field.append(label,searchIcon,input,clear);
   const count=element('p','nx-result-count');count.id=id+'-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
   const list=element('div','nx-results');list.id=id+'-results';list.setAttribute('role','listbox');list.setAttribute('aria-label','Лаборатории и разделы');panels.get('find').append(field,count,list);
   const preferenceInputs=new Map();panels.get('view').append(element('h3','nx-panel-title','Удобный вид'),element('p','nx-panel-intro','Настрой интерфейс под себя. Данные прохождения останутся прежними.'));
   for(const [key,name,description]of[['largeText','Крупнее текст','Увеличить текст заданий, пояснений и кнопок.'],['highContrast','Выше контраст','Чётче текст, границы и состояния элементов.'],['reducedMotion','Меньше движения','Убрать переходы экранов и движение интерфейса.']]){
    const row=element('label','nx-setting'),copy=element('span','nx-setting-copy');copy.append(element('strong','nx-setting-label',name),element('span','nx-setting-description',description));
    const control=element('span','nx-switch'),checkbox=element('input','nx-preference');checkbox.type='checkbox';checkbox.checked=memory.preferences[key];checkbox.setAttribute('role','switch');checkbox.setAttribute('data-nav-preference',key);checkbox.setAttribute('aria-label',name);const track=element('span','nx-switch-track');track.setAttribute('aria-hidden','true');control.append(checkbox,track);row.append(copy,control);panels.get('view').append(row);preferenceInputs.set(key,checkbox);
   }
   const systemMotion=element('p','nx-preference-note',motion.matches?'На устройстве уже включено уменьшение движения. Оно действует независимо от переключателя.':'Настройки действуют в этой вкладке и не меняют ответы.');panels.get('view').append(systemMotion);
   panels.get('help').append(element('h3','nx-panel-title','Управляй в своём темпе'),element('p','nx-panel-intro','Клавиши дополняют кнопки. В поле ответа можно продолжать печатать обычным способом.'));
   const helpRows=[['Ctrl / ⌘ + K','Открыть поиск разделов'],['?','Открыть управление, когда не вводишь текст'],['↑ ↓ · Enter','В поиске: выбрать и открыть раздел'],['Esc','Закрыть открытую панель или крупную сцену'],['Tab · Shift + Tab','Перейти к следующему или предыдущему элементу'],['← ↑ → ↓','Когда фокус на 3D-модели: повернуть её'],['+ / − · 0','Когда фокус на 3D-модели: масштаб и сброс ракурса']];
   const shortcutList=element('dl','nx-shortcuts');for(const [keys,description]of helpRows){const row=element('div','nx-shortcut');row.append(element('dt','nx-keys',keys),element('dd','nx-key-description',description));shortcutList.append(row);}panels.get('help').append(shortcutList,element('p','nx-preference-note','Во время другого открытого окна поиск и «?» не перехватывают управление.'));
   const footer=element('footer','nx-footer');footer.append(element('span','','Найди раздел и продолжай с удобного места.'),element('kbd','nx-footer-key','Esc — закрыть'));dialog.append(header,tabs,content,footer);overlay.append(dialog);
   const opener=trigger&&trigger.nodeType===1?trigger:document.activeElement;
   current={id,overlay,opener,closeButton,tabs:tabMap,panels,input,clear,count,list,preferences:preferenceInputs,systemMotion,rows:[],optionNodes:[],selected:-1,tab:'find',background:[],bodyStyles:snapshotStyles(document.body),scroll:{x:global.scrollX||0,y:global.scrollY||0},openerAttrs:{expanded:opener?.getAttribute('aria-expanded')??null,controls:opener?.getAttribute('aria-controls')??null},backdropPress:false};
   document.body.append(overlay);hideTop();
   const scrollbar=Math.max(0,(global.innerWidth||root.clientWidth)-root.clientWidth),bodyPadding=parseFloat(global.getComputedStyle?.(document.body)?.paddingRight)||0;
   document.body.style.setProperty('position','fixed');document.body.style.setProperty('top',-current.scroll.y+'px');document.body.style.setProperty('left',-current.scroll.x+'px');document.body.style.setProperty('width','100%');document.body.style.setProperty('overflow','hidden');if(scrollbar)document.body.style.setProperty('padding-right',bodyPadding+scrollbar+'px');
   if(opener){opener.setAttribute('aria-expanded','true');opener.setAttribute('aria-controls',id);}
   renderResults();switchTab(tab);
   for(const node of [...document.body.children]){if(node===overlay||['SCRIPT','STYLE','LINK','TEMPLATE','NOSCRIPT'].includes(node.tagName))continue;current.background.push({node,inert:node.inert,inertAttribute:node.getAttribute('inert'),ariaHidden:node.getAttribute('aria-hidden')});node.inert=true;node.setAttribute('inert','');node.setAttribute('aria-hidden','true');}
   return true;
  }
  function typing(target){return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="textbox"]');}
  function onKey(event){
   if(destroyed||event.defaultPrevented||event.isComposing)return;
   if(foreignModal()){hideTop();return;}
   if(!event.altKey&&(event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='k'){event.preventDefault();open('find');return;}
   if(event.key==='?'&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!typing(event.target)){event.preventDefault();open('help');return;}
   if(!current)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key==='Tab'){
    const nodes=[...current.overlay.querySelectorAll(FOCUSABLE)].filter(node=>visible(node)&&!node.disabled&&node.tabIndex>=0),first=nodes[0],last=nodes.at(-1),active=document.activeElement;
    if(!first){event.preventDefault();current.overlay.focus({preventScroll:true});}
    else if(!current.overlay.contains(active)||(event.shiftKey&&(active===first||active===current.overlay))||(!event.shiftKey&&active===last)){event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});}return;
   }
   const tab=event.target?.closest?.('[data-nav-tab]');
   if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const keys=['find','view','help'],index=keys.indexOf(current.tab);switchTab(keys[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3]);current.tabs.get(current.tab).focus({preventScroll:true});return;}
   if(current.tab==='find'&&event.target===current.input){if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();select(current.selected+(event.key==='ArrowDown'?1:-1),true);}else if(event.key==='Enter'){event.preventDefault();activate(current.selected);}}
  }
  function onClick(event){
   const opener=event.target?.closest?.('[data-nav-open]');if(opener&&!opener.disabled){if(open(opener.getAttribute('data-nav-open')||'find',opener))event.preventDefault();return;}
   if(!current)return;
   if(event.target===current.overlay){if(current.backdropPress||event.detail===0)close();if(current)current.backdropPress=false;return;}
   if(!current.overlay.contains(event.target))return;
   if(event.target.closest('[data-nav-close]')){close();return;}
   const tab=event.target.closest('[data-nav-tab]');if(tab){switchTab(tab.getAttribute('data-nav-tab'));return;}
   if(event.target.closest('[data-nav-clear]')){current.input.value='';renderResults();current.input.focus({preventScroll:true});return;}
   const entry=event.target.closest('[data-nav-entry]');if(entry)activate(Number(entry.getAttribute('data-nav-entry')));
  }
  listen(document,'click',onClick);listen(document,'keydown',onKey,true);
  listen(document,'input',event=>{if(current&&event.target===current.input)renderResults();});
  listen(document,'change',event=>{const key=event.target?.getAttribute?.('data-nav-preference');if(current&&KEYS.includes(key)&&current.preferences.get(key)===event.target){memory.preferences={...memory.preferences,[key]:!!event.target.checked};applyPreferences('preference');}});
  listen(document,'focusin',event=>{if(current&&!current.overlay.contains(event.target))current.closeButton.focus({preventScroll:true});queueTop();});
  listen(document,'pointerdown',event=>{if(current)current.backdropPress=event.target===current.overlay;});listen(document,'pointercancel',()=>{if(current)current.backdropPress=false;});
  listen(global,'scroll',queueTop,{passive:true});listen(global,'resize',queueTop,{passive:true});listen(global,'beforeprint',()=>close({restoreFocus:false}));
  listen(topButton,'click',()=>{const target=document.getElementById?.('main')||document.querySelector('[data-nav-open]');target?.focus?.({preventScroll:true});global.scrollTo?.({top:0,left:global.scrollX||0,behavior:effectiveMotion()?'instant':'smooth'});hideTop();});
  if(motion.addEventListener)listen(motion,'change',()=>applyPreferences('system-motion'));
  if(global.MutationObserver){observer=new global.MutationObserver(records=>{if(records.some(record=>record.target!==topButton&&!current?.overlay.contains(record.target)))queueTop();});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','hidden','open']});}
  const controller={open,close,reportRoute,get isOpen(){return !!current;},getPreferences(){return {...memory.preferences,effectiveReducedMotion:effectiveMotion()};},destroy(){if(destroyed)return;close({restoreFocus:false});destroyed=true;cancelTop();observer?.disconnect();listeners.splice(0).forEach(remove=>remove());topButton.remove();originalAttrs.forEach((item,index)=>{if(root.getAttribute(item.name)===appliedAttrs[index])restoreAttribute(root,item.name,item.value);});if(controllers.get(document)===controller)controllers.delete(document);}};
  controllers.set(document,controller);applyPreferences('initial');reportRoute(options.getCurrentRoute?.());queueTop();return controller;
 }
 const api=Object.freeze({mount});global.NavigationExperience=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
