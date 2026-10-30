(function(root){
'use strict';
const VERSION = '1.0.0-pilot';
const KEYS = ['engineering','robotics','code','ai','design','xr','research','social'];
const tracks = [
{id:'engineering',name:'Инженерия и 3D',short:'3D',color:'#2355ed',tag:'От модели к предмету',desc:'Придумывать устройства, создавать модели и проверять конструкции.',project:'Держатель для телефона',plan:['Нарисуй три варианта держателя и выбери один по удобству.','Сделай модель из бумаги или в простом CAD-редакторе.','Проверь устойчивость, измени конструкцию и объясни улучшение.'],advanced:'Спроектируй деталь с ограничениями по массе и изготовлению, затем сравни прототип с моделью.'},
{id:'robotics',name:'Робототехника',short:'BOT',color:'#256b75',tag:'Заставь идею двигаться',desc:'Соединять механизмы, датчики и команды в работающую систему.',project:'Сигнализатор движения',plan:['Разбери схему «событие → датчик → действие».','Собери схему в симуляторе или с наставником из доступных модулей.','Испытай три разных события и опиши, когда система ошибается.'],advanced:'Добавь настройку чувствительности и проверь ложные срабатывания на серии испытаний.'},
{id:'code',name:'Код и данные',short:'</>',color:'#6450a8',tag:'Порядок, который работает',desc:'Строить алгоритмы, находить закономерности и создавать приложения.',project:'Трекер личного проекта',plan:['Выбери, какие задачи и сроки нужно хранить.','Собери таблицу или короткую программу, которая показывает незавершённые задачи.','Проверь пустые, повторяющиеся и неправильные записи.'],advanced:'Сделай небольшое приложение с проверкой ввода и сохранением данных.'},
{id:'ai',name:'Искусственный интеллект',short:'AI',color:'#3d62b5',tag:'Вопросы, данные, проверка',desc:'Изучать возможности моделей, проверять ответы и создавать полезных помощников.',project:'Проверенный ИИ-помощник',plan:['Выбери узкую задачу и подготовь надёжные материалы.','Напиши инструкцию помощнику и пять проверочных вопросов.','Отметь ошибки, исправь инструкцию и повтори проверку.'],advanced:'Подготовь небольшой набор тестов и сравни качество двух вариантов помощника по одним критериям.'},
{id:'design',name:'Дизайн и медиа',short:'Aa',color:'#aa4c6a',tag:'Сделай сложное понятным',desc:'Создавать визуальные истории, интерфейсы и удобные цифровые продукты.',project:'Навигация по лаборатории',plan:['Выясни, что посетителю сложнее всего найти.','Нарисуй два варианта указателя или экрана.','Попроси двух людей выполнить одно действие и доработай макет.'],advanced:'Собери небольшой интерактивный прототип и проведи пользовательскую проверку по сценарию.'},
{id:'xr',name:'XR и игры',short:'XR',color:'#2a7375',tag:'Миры, где можно действовать',desc:'Придумывать интерактивные пространства, игровые правила и тренажёры.',project:'Интерактивная экскурсия',plan:['Выбери три точки маршрута и задачу посетителя.','Собери бумажный сценарий или простую интерактивную сцену.','Проверь, понятны ли цель, действие и обратная связь.'],advanced:'Добавь ветвление, сохранение прогресса и альтернативное управление без VR-шлема.'},
{id:'research',name:'Исследования и метрология',short:'±',color:'#7b6343',tag:'Проверь, а потом утверждай',desc:'Измерять, сравнивать, ставить эксперименты и делать выводы по данным.',project:'Насколько точен наш прототип?',plan:['Выбери один измеряемый размер и способ измерения.','Сделай несколько измерений и запиши условия.','Сравни данные с требованием и объясни ограничения вывода.'],advanced:'Сравни два способа измерения и составь протокол проверки повторяемости.'},
{id:'social',name:'Социальные технологии',short:'TEAM',color:'#3b7264',tag:'Технологии для людей',desc:'Понимать потребности людей, объединять команду и доводить проект до результата.',project:'Доступный день технопарка',plan:['Узнай у посетителей, что мешает им участвовать.','Выбери одну проблему и предложи недорогой прототип решения.','Проверь решение с пользователем и составь план следующего шага.'],advanced:'Собери команду, распределение ресурсов и критерии пользы для выбранной группы.'}
];
function emptyState(mode='full'){
 return {version:VERSION,sessionId:'V-'+Math.random().toString(36).slice(2,8).toUpperCase(),startedAt:new Date().toISOString(),mode,age:'',goal:'explore',experience:{},answers:{},situations:{},labs:{},reflections:{},drafts:{},lastRoute:'profile',planned:[],nextSteps:{},projectTrials:{},profileDone:false};
}
// Local saves are user data, not trusted application objects. Restore known
// fields independently so a damaged draft cannot make intact answers unusable.
// The caller keeps the untouched source when repaired is true.
function restoreState(data,saved){
 const issues=[],own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const note=path=>{if(!issues.includes(path))issues.push(path);};
 const same=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i])))||(object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>own(b,k)&&same(a[k],b[k])));
 const date=v=>typeof v==='string'&&v.length<=64&&Number.isFinite(Date.parse(v));
 if(!object(saved)||saved.version!==VERSION)return {state:null,repaired:true,issues:[!object(saved)?'state':'version']};
 const validMode=['full','quick'].includes(saved.mode),state=emptyState(validMode?saved.mode:'full');
 if(!validMode)note('mode');
 if(typeof saved.sessionId==='string'&&/^V-[A-Z0-9]{6}$/.test(saved.sessionId))state.sessionId=saved.sessionId;else note('sessionId');
 // An old result file may not contain its start time. Keep that fact unknown;
 // restoring a file must not claim that the work began at the time of import.
 if(saved.startedAt===null||date(saved.startedAt))state.startedAt=saved.startedAt;else{state.startedAt=null;note('startedAt');}
 if(['','12–13','14–15','16–18','18+ (ознакомительно)'].includes(saved.age))state.age=saved.age;else note('age');
 if(['explore','course','project'].includes(saved.goal))state.goal=saved.goal;else if(own(saved,'goal'))note('goal');
 if(typeof saved.profileDone==='boolean')state.profileDone=saved.profileDone;else if(own(saved,'profileDone'))note('profileDone');
 function map(name,allowed,accept,required=false){
  const raw=saved[name],out={};
  if(raw===undefined&&!required)return out;
  if(!object(raw)){note(name);return out;}
  for(const key of Object.keys(raw)){
   if(allowed.includes(key)&&accept(raw[key],key))out[key]=raw[key];else note(name+'.'+key);
  }
  return out;
 }
 const questionIds=data.interests.map(q=>q.id);
 state.answers=map('answers',questionIds,v=>v===null||(Number.isInteger(v)&&v>=1&&v<=5),true);
 state.experience=map('experience',KEYS,v=>Number.isInteger(v)&&v>=0&&v<=3);
 state.reflections=map('reflections',KEYS,v=>v===null||(Number.isInteger(v)&&v>=1&&v<=5));
 state.situations=map('situations',data.situations.map(q=>q.id),(v,key)=>v===null||(data.situations.find(q=>q.id===key).options||data.situations.find(q=>q.id===key).choices||[]).some(c=>c.id===v));
 if(saved.planned!==undefined){
  state.planned=Array.isArray(saved.planned)?[...new Set(saved.planned.filter(v=>KEYS.includes(v)))].slice(0,2):[];
  if(!same(saved.planned,state.planned))note('planned');
 }
 function calendarDate(value){
  if(value==='')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  if(year<1||month<1||month>12||day<1)return false;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  return day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
 }
 if(saved.nextSteps!==undefined){
  if(!object(saved.nextSteps))note('nextSteps');
  else for(const key of Object.keys(saved.nextSteps)){
   const raw=saved.nextSteps[key],clean={};
   if(!KEYS.includes(key)||!object(raw)){note('nextSteps.'+key);continue;}
   for(const field of Object.keys(raw)){
    const valid=field==='artifact'?['','drawing','model','program','protocol','scenario'].includes(raw[field]):field==='reviewDate'&&calendarDate(raw[field]);
    if(valid)clean[field]=raw[field];else note('nextSteps.'+key+'.'+field);
   }
   state.nextSteps[key]=clean;
  }
 }
 if(saved.projectTrials!==undefined){
  if(!object(saved.projectTrials))note('projectTrials');
  else for(const key of Object.keys(saved.projectTrials)){
   const raw=saved.projectTrials[key],clean={};
   if(!KEYS.includes(key)||!object(raw)){note('projectTrials.'+key);continue;}
   for(const field of Object.keys(raw)){
    const value=raw[field];
    const valid=field==='status'?['','started','completed'].includes(value):field==='happenedOn'?calendarDate(value):field==='note'?typeof value==='string'&&value.length<=280:field==='next'&&['','continue','another','undecided'].includes(value);
    if(valid)clean[field]=value;else note('projectTrials.'+key+'.'+field);
   }
   state.projectTrials[key]=clean;
  }
 }
 function routeAllowed(route){
  if(typeof route!=='string')return false;
  if(['home','choose','profile','hub','labs','report','method','mentor','example'].includes(route))return true;
  const match=/^(lab|interests|situation):([a-z]+|\d+)$/.exec(route);if(!match)return false;
  if(match[1]==='lab')return KEYS.includes(match[2]);
  return /^\d+$/.test(match[2])&&Number(match[2])<(match[1]==='interests'?(state.mode==='quick'?2:6):(state.mode==='quick'?2:8));
 }
 for(const name of ['lastRoute','resumeRoute'])if(saved[name]!==undefined){if(routeAllowed(saved[name])&&(name!=='resumeRoute'||['profile','labs'].includes(saved[name])||/^(lab|interests|situation):/.test(saved[name])))state[name]=saved[name];else note(name);}
 state.experienceVersion=['1.0-original','2.0-visual'].includes(saved.experienceVersion)?saved.experienceVersion:'1.0-original';
 if(saved.experienceVersion!==undefined&&state.experienceVersion!==saved.experienceVersion)note('experienceVersion');
 state.interestTiming=map('interestTiming',questionIds,v=>['before-mission','after-mission'].includes(v));
 function draft(lab,raw){
  const clean=defaultDraft(lab),c=lab.config;
  if(!object(raw))return {value:clean,changed:true};
  const list=(value,ids)=>Array.isArray(value)?[...new Set(value.filter(v=>ids.includes(v)))]:[];
  if(lab.type==='parameters'){
   for(const p of c.parameters||[{id:'thickness',min:1,max:5},{id:'ribs',min:0,max:4}])if(Number.isInteger(raw[p.id])&&raw[p.id]>=p.min&&raw[p.id]<=p.max)clean[p.id]=raw[p.id];
  }else if(lab.type==='robot'){
   clean.commands=Array.isArray(raw.commands)?raw.commands.filter(v=>['U','R','D','L'].includes(v)).slice(0,c.maxCommands):[];
  }else if(lab.type==='order'){
   const ids=c.items.map(i=>i.id),kept=list(raw.order,ids);clean.order=[...kept,...ids.filter(id=>!kept.includes(id))];
  }else if(lab.type==='branch'){
   if(object(raw.choices))for(const stage of c.stages)if(stage.options.some(o=>o.id===raw.choices[stage.id]))clean.choices[stage.id]=raw.choices[stage.id];
  }else if(lab.type==='classify'){
   const categories=c.categories.map(v=>v.id);if(object(raw.classes))for(const m of c.measurements)if(categories.includes(raw.classes[m.id]))clean.classes[m.id]=raw.classes[m.id];
  }else clean.selected=list(raw.selected,(c.options||c.items).map(v=>v.id));
  return {value:clean,changed:!same(clean,raw)};
 }
 const rawDrafts=object(saved.drafts)?saved.drafts:{};if(!object(saved.drafts))note('drafts');
 for(const key of Object.keys(rawDrafts)){
  const lab=data.labs.find(l=>l.track===key);if(!lab){note('drafts.'+key);continue;}
  const cleaned=draft(lab,rawDrafts[key]);state.drafts[key]=cleaned.value;if(cleaned.changed)note('drafts.'+key);
 }
 function grade(lab,raw){
  const total=gradeLab(lab,defaultDraft(lab)).total;
  if(!object(raw)||raw.total!==total||!Number.isInteger(raw.score)||raw.score<0||raw.score>total||!Array.isArray(raw.criteria)||raw.criteria.length!==total||!raw.criteria.every(c=>object(c)&&typeof c.label==='string'&&c.label.length<=1000&&typeof c.passed==='boolean')||raw.criteria.filter(c=>c.passed).length!==raw.score)return null;
  const clean={score:raw.score,total,criteria:raw.criteria.map(c=>({label:c.label,passed:c.passed})),extra:{},all:raw.score===total&&total>0};
  const extra=object(raw.extra)?raw.extra:{};
  if(lab.type==='parameters')for(const k of ['strength','cost','weight'])if(Number.isFinite(extra[k]))clean.extra[k]=extra[k];
  if(lab.type==='budget')for(const k of ['cost','impact'])if(Number.isFinite(extra[k]))clean.extra[k]=extra[k];
  if(lab.type==='robot'){
   const cell=v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<lab.config.size);
   if(Array.isArray(extra.path)&&extra.path.length<=lab.config.maxCommands+1&&extra.path.every(cell))clean.extra.path=extra.path.map(p=>p.slice());
   if(cell(extra.end))clean.extra.end=extra.end.slice();
   for(const k of ['collision','invalid','reached'])if(typeof extra[k]==='boolean')clean.extra[k]=extra[k];
  }
  return clean;
 }
 const rawLabs=object(saved.labs)?saved.labs:{};if(!object(saved.labs))note('labs');
 for(const key of Object.keys(rawLabs)){
  const lab=data.labs.find(l=>l.track===key),raw=rawLabs[key];
  if(!lab||!object(raw)){note('labs.'+key);continue;}
  const clean={};
  for(const k of ['hintUsed','firstHadHint','skipped'])if(own(raw,k)){if(typeof raw[k]==='boolean')clean[k]=raw[k];else note('labs.'+key+'.'+k);}
  for(const k of ['firstAt','lastAt'])if(own(raw,k)){if(date(raw[k]))clean[k]=raw[k];else note('labs.'+key+'.'+k);}
  for(const attempt of ['first','last']){
   const snapshotKey=attempt+'Draft';let snapshot=null;
   if(own(raw,snapshotKey)){
    const restored=draft(lab,raw[snapshotKey]);
    if(!restored.changed){snapshot=restored.value;clean[snapshotKey]=snapshot;}else note('labs.'+key+'.'+snapshotKey);
   }
   if(own(raw,attempt)&&raw[attempt]!=null){
    const restored=grade(lab,raw[attempt]);
    if(restored){clean[attempt]=restored;if(!same(restored,raw[attempt]))note('labs.'+key+'.'+attempt);}
    else{if(snapshot)clean[attempt]=gradeLab(lab,snapshot);note('labs.'+key+'.'+attempt);}
   }
  }
  if(Number.isSafeInteger(raw.attempts)&&raw.attempts>=0&&(!clean.first||raw.attempts>=1))clean.attempts=raw.attempts;
  else if(clean.first||own(raw,'attempts')){clean.attempts=clean.first?1:0;note('labs.'+key+'.attempts');}
  state.labs[key]=clean;
 }
 return {state,repaired:issues.length>0,issues};
}
function getQuestions(data,mode){
 const n=mode==='quick'?2:6;
 const groups=KEYS.map(k=>data.interests.filter(q=>q.track===k).slice(0,n));
 return Array.from({length:n},(_,i)=>groups.map(g=>g[i])).flat().filter(Boolean);
}
function interestScores(data,state){
 const questions=getQuestions(data,state.mode);
 return tracks.map(t=>{
  const items=questions.filter(q=>q.track===t.id);
  const vals=items.map(q=>state.answers[q.id]).filter(x=>Number.isInteger(x)&&x>=1&&x<=5);
  const count=vals.length, required=state.mode==='quick'?2:4;
  return {track:t.id,mean:count?vals.reduce((a,b)=>a+b,0)/count:null,count,total:items.length,eligible:count>=required};
 });
}
function recommendations(scores){
 const sorted=scores.filter(s=>s.eligible).sort((a,b)=>b.mean-a.mean);
 if(!sorted.length)return {items:[],flat:false,low:false};
 const flat=sorted.length>1&&Math.abs(sorted[0].mean-sorted[sorted.length-1].mean)<0.01;
 const low=sorted[0].mean<3;
 const cutoff=sorted[Math.min(2,sorted.length-1)].mean;
 return {items:sorted.filter(s=>s.mean>=cutoff-1e-9),flat,low};
}
function robotPath(config,commands){
 let [x,y]=config.start; const path=[[x,y]]; let collision=false,invalid=false;
 const dirs={U:[0,-1],D:[0,1],L:[-1,0],R:[1,0]};
 for(const c of commands){
  if(!dirs[c]){invalid=true;break;}
  const [dx,dy]=dirs[c], nx=x+dx, ny=y+dy;
  if(nx<0||ny<0||nx>=config.size||ny>=config.size||config.obstacles.some(p=>p[0]===nx&&p[1]===ny)){collision=true;break;}
  x=nx;y=ny;path.push([x,y]);
 }
 return {path,collision,invalid,reached:x===config.goal[0]&&y===config.goal[1],end:[x,y]};
}
function criterion(label,passed){return {label,passed:!!passed};}
function gradeLab(lab,draft){
 const c=lab.config,s=lab.solution;let criteria=[],extra={};
 if(lab.type==='parameters'){
  const t=Number(draft.thickness),r=Number(draft.ribs);
  const valid=Number.isInteger(t)&&t>=1&&t<=5&&Number.isInteger(r)&&r>=0&&r<=4;
  extra={strength:2*t+3*r,cost:3*t+2*r,weight:4*t+r};
  criteria=[criterion('Прочность не меньше 15',valid&&extra.strength>=15),criterion('Стоимость не больше 16',valid&&extra.cost<=16),criterion('Масса не больше 16',valid&&extra.weight<=16)];
 }else if(lab.type==='robot'){
  extra=robotPath(c,draft.commands||[]);
  criteria=[criterion('Маршрут достигает цели',extra.reached),criterion('Нет столкновений и выхода за поле',!extra.collision&&!extra.invalid&&(draft.commands||[]).length>0),criterion('Не больше '+c.maxCommands+' команд',(draft.commands||[]).length>0&&(draft.commands||[]).length<=c.maxCommands&&!extra.invalid)];
 }else if(lab.type==='order'){
  const order=draft.order||[],target=s.order;
  criteria=target.slice(0,-1).map((id,i)=>criterion(c.items.find(x=>x.id===id).label+' → '+c.items.find(x=>x.id===target[i+1]).label,order.indexOf(id)>=0&&order.indexOf(target[i+1])>order.indexOf(id)));
 }else if(lab.type==='multi'){
  const selected=draft.selected||[],correct=s.selected;
  criteria=[criterion('Все нужные пункты выбраны',correct.every(id=>selected.includes(id))),criterion('Лишних пунктов нет',selected.length>0&&selected.every(id=>correct.includes(id)))];
 }else if(lab.type==='branch'){
  criteria=c.stages.map((st,i)=>criterion('Этап '+(i+1)+': '+st.prompt,(draft.choices||{})[st.id]===s.choices[st.id]));
 }else if(lab.type==='classify'){
  criteria=c.measurements.map(m=>criterion(Number(m.value).toFixed(2).replace('.',',')+' мм',(draft.classes||{})[m.id]===s.classes[m.id]));
 }else if(lab.type==='budget'){
  const chosen=c.items.filter(i=>(draft.selected||[]).includes(i.id));
  const cost=chosen.reduce((a,i)=>a+i.cost,0), impact=chosen.reduce((a,i)=>a+i.impact,0);
  const correct=s.selected;
  extra={cost,impact};
  const optimum=c.items.filter(i=>correct.includes(i.id)).reduce((a,i)=>a+i.impact,0);
  const required=[...new Set([...(c.mandatory||[]),...(c.requiredIds||[]),...(Array.isArray(c.required)?c.required:[]),...c.items.filter(i=>i.required).map(i=>i.id)])];
  const meets=required.every(id=>(draft.selected||[]).includes(id));
  criteria=[criterion('Бюджет не превышен',chosen.length>0&&cost<=c.budget),criterion('Обязательные условия соблюдены',meets&&chosen.length>0),criterion('Максимальная сумма пользы при всех ограничениях',cost<=c.budget&&meets&&impact===optimum)];
 }
 const score=criteria.filter(c=>c.passed).length;
 return {score,total:criteria.length,criteria,extra,all:score===criteria.length&&criteria.length>0};
}
function defaultDraft(lab){
 switch(lab.type){
 case 'parameters':return {thickness:1,ribs:0};
 case 'robot':return {commands:[]};
 case 'order':return {order:lab.config.items.map(i=>i.id)};
 case 'branch':return {choices:{}};
 case 'classify':return {classes:{}};
 default:return {selected:[]};
 }
}
function progress(data,state){
 const qs=getQuestions(data,state.mode), cases=data.situations.slice(0,state.mode==='quick'?2:8),targetLabs=state.mode==='quick'?2:8;
 const answered=qs.filter(q=>Object.prototype.hasOwnProperty.call(state.answers,q.id)).length;
 const situations=cases.filter(q=>Object.prototype.hasOwnProperty.call(state.situations,q.id)).length;
 const labCount=Object.values(state.labs).filter(l=>l.first||l.skipped).length;
 const completed=answered+situations+Math.min(labCount,targetLabs)+(state.profileDone?1:0);
 const total=qs.length+cases.length+targetLabs+1;
 return {answered,questions:qs.length,situations,caseTotal:cases.length,labCount,targetLabs,completed,total,percent:Math.round(100*completed/total)};
}
function nextUnansweredRoute(data,state){
 if(!state||!state.profileDone)return 'profile';
 const p=progress(data,state);if(p.labCount<p.targetLabs)return 'labs';
 const own=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);
 const question=getQuestions(data,state.mode).findIndex(q=>!own(state.answers,q.id));
 if(question>=0)return 'interests:'+Math.floor(question/8);
 const situation=data.situations.slice(0,state.mode==='quick'?2:8).findIndex(q=>!own(state.situations,q.id));
 return situation>=0?'situation:'+situation:'report';
}
function createExport(data,state){
 return {format:'rgsu-vector-result',product:'ПЕРВОСБОРКА',checkpointVersion:1,experienceVersion:state.experienceVersion||'1.0-original',interestTiming:state.interestTiming||{},version:VERSION,exportedAt:new Date().toISOString(),sessionId:state.sessionId,startedAt:state.startedAt??null,mode:state.mode,age:state.age,goal:state.goal,profileDone:state.profileDone,drafts:state.drafts,lastRoute:state.lastRoute,...(state.resumeRoute!==undefined?{resumeRoute:state.resumeRoute}:{}),scores:interestScores(data,state),progress:progress(data,state),answers:state.answers,experience:state.experience,situations:state.situations,labs:state.labs,reflections:state.reflections,planned:state.planned,nextSteps:state.nextSteps||{},projectTrials:state.projectTrials||{}};
}
// Preparing an import is deliberately separate from applying it. The caller can
// show a review and keep the current session untouched until explicit acceptance.
function prepareImport(data,obj){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const own=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);
 const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
 if(!object(obj)||obj.format!=='rgsu-vector-result')fail('format','Это не файл результатов ПЕРВОСБОРКИ. Выберите JSON, скачанный из своего маршрута.');
 if(obj.version!==VERSION)fail('version','Версия методики в этом файле не поддерживается. Текущая работа не изменена.');
 if(!['full','quick'].includes(obj.mode))fail('mode','В файле не указан поддерживаемый маршрут.');
 if(typeof obj.sessionId!=='string'||!/^V-[A-Z0-9]{6}$/.test(obj.sessionId))fail('sessionId','В файле нет корректного кода сессии.');
 if(!object(obj.answers))fail('answers','В файле нет корректного раздела ответов.');
 const checkpoint=own(obj,'checkpointVersion');
 if(checkpoint&&obj.checkpointVersion!==1)fail('checkpointVersion','Эта версия файла продолжения пока не поддерживается.');
 if((own(obj,'experienceVersion')&&!['1.0-original','2.0-visual'].includes(obj.experienceVersion))||(checkpoint&&!own(obj,'experienceVersion')))fail('experienceVersion','Редакция теста в этом файле не поддерживается.');
 const kind=checkpoint?'checkpoint':'legacy',warnings=[],input={...obj};
 if(!checkpoint){
  // Legacy exports were result reports, not checkpoints. Their derived progress
  // is not evidence of a completed profile or an unrecorded draft/location.
  input.startedAt=null;input.profileDone=false;input.drafts={};input.lastRoute='profile';delete input.resumeRoute;
  warnings.push('Это прежний файл результатов: незавершённые решения и место остановки в нём не сохранялись. Ответы, проверки миссий и план можно перенести; стартовый профиль нужно подтвердить заново. Дата начала прежней работы неизвестна.');
 }
 const restored=restoreState(data,input);
 if(!restored.state)fail('state','Не удалось восстановить этот файл. Текущая работа не изменена.');
 const issues=restored.issues.slice();
 if(checkpoint)for(const key of ['startedAt','profileDone','drafts','lastRoute'])if(!own(obj,key)&&!issues.includes(key))issues.push(key);
 if(issues.length)warnings.push('Некоторые поля отсутствуют или повреждены. Сохранены допустимые данные; проверьте список изменений перед переносом.');
 return {state:restored.state,kind,issues,warnings};
}
const api={VERSION,KEYS,tracks,emptyState,restoreState,prepareImport,getQuestions,interestScores,recommendations,robotPath,gradeLab,defaultDraft,progress,nextUnansweredRoute,createExport};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.VectorEngine=api;
})(typeof window!=='undefined'?window:globalThis);
