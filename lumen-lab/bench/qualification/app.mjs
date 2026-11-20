import {DEFAULT_PLAN,REVISION,TESTS,ROLES,evaluateSuite,parseReference,validatePlan} from './engine.mjs';
import {readTemperature} from '../protocol.mjs';

const $=id=>document.getElementById(id), stringKeys=['device','operator','board','rom1','rom2','reference','certificate'];
const numberKeys=['toleranceC','referenceExpandedC','referenceK','gradientBoundC','timingBoundC','coverageK','stableSpanC','targetWindowC'];
const booleanKeys=['physicalDeclaration','methodDeclaration'];
const MAX_BYTES=64*1024*1024,MAX_FILE=16*1024*1024;
let state={version:'LM04B-evidence/2',plan:{...DEFAULT_PLAN},manual:{},files:{},planSnapshots:[]};
let latest=null,saveTimer=null,db=null,storageFailed=false,operation=Promise.resolve();
const parsedCache=new Map();
const labels={pending:'Ожидает данных',pass:'Критерий выполнен',fail:'Несоответствие',indeterminate:'Неопределённо'};
const descriptions={
  baseline:'Не менее 60 последовательных кадров за 59 с, оба датчика рядом. Эта запись задаёт исходный запуск для B08.',
  point0:'Сухой термостат, около 20 °C. Запись JSONL и контрольные отсчёты CSV.',
  point1:'Сухой термостат, около 35 °C. Запись JSONL и контрольные отсчёты CSV.',
  point2:'Сухой термостат, около 50 °C. Запись JSONL и контрольные отсчёты CSV.',
  onlyT1:'Отключите USB, снимите T2, включите USB. Не менее 10 кадров. T1: ok, T2: no_sensor.',
  onlyT2:'Отключите USB, верните T2 и снимите T1. Не менее 10 кадров. T1: no_sensor, T2: ok.',
  restart:'Верните оба датчика при отключённом USB и запишите не менее 10 кадров. board сохраняется, boot меняется.',
  endurance:'Не менее 1800 с по меткам самой платы, оба канала ok, без пропусков и смены ROM. Записывайте настольной программой.',
};
const manualHelp={B01:'Сверьте маркировку Pico RP2040, ревизию платы, ROM и SHA-256 образа. Приложите фото или запись проверки загрузки.',
  B02:'Внесите сопротивления цепей без Pico, напряжение 3V3 и результаты проверки DQ. Приложите протокол или фото измерений.',
  B03:'Проверьте USB, крепёж и разгрузку кабелей. Укажите материал, параметры печати и фактическую посадку. Приложите фото сборки.'};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error)}
async function sha(bytes){const h=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function download(text,name,type='application/json'){const a=el('a'),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)}
const safeName=()=>state.plan.device.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'unassigned';
function populatePlan(){for(const key of [...stringKeys,...numberKeys])$(key).value=state.plan[key];for(const key of booleanKeys)$(key).checked=state.plan[key]}
function readPlan(){for(const key of stringKeys)state.plan[key]=['board','rom1','rom2'].includes(key)?$(key).value.trim().toLowerCase():$(key).value.trim();for(const key of numberKeys)state.plan[key]=$(key).valueAsNumber;for(const key of booleanKeys)state.plan[key]=$(key).checked}
async function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('lm04b-qualification-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('work');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbGet(){return new Promise((resolve,reject)=>{const tx=db.transaction('work','readonly'),r=tx.objectStore('work').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function persist(){if(!db)return;try{await new Promise((resolve,reject)=>{const tx=db.transaction('work','readwrite');tx.objectStore('work').put(state,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{if(!storageFailed){storageFailed=true;message('Браузер не сохранил рабочую запись. Скачайте полный комплект перед закрытием вкладки.',true)}}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{operation=operation.then(persist)},450)}
function fileBytes(f){
  if(f.encoding==='utf-8')return new TextEncoder().encode(f.data);
  if(f.encoding!=='base64')throw Error('Неизвестная кодировка файла.');
  const s=atob(f.data),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;
}
async function validateState(input){
  if(!input||input.version!=='LM04B-evidence/2'||!input.files||typeof input.files!=='object'||Array.isArray(input.files))throw Error('Неизвестный формат комплекта.');
  validatePlan(input.plan);
  const clean={version:input.version,plan:{...input.plan},manual:{},files:{},planSnapshots:[]};
  let total=0;
  for(const [key,f] of Object.entries(input.files)) {
    if(!Object.hasOwn(ROLES,key)&&!/^ref:point[012]$/.test(key)&&!/^manual:B0[123]$/.test(key))throw Error('Неизвестное назначение файла.');
    if(!f||typeof f.name!=='string'||f.name.length>300||typeof f.data!=='string'||f.data.length>MAX_FILE*1.5)throw Error('Некорректный файл.');
    const bytes=fileBytes(f);total+=bytes.byteLength;if(bytes.byteLength>MAX_FILE||total>MAX_BYTES)throw Error('Превышен предел размера комплекта.');
    if(f.sha256!==await sha(bytes))throw Error('SHA-256 не совпал для '+f.name+'.');
    if(Object.hasOwn(ROLES,key))readTemperature(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(key.startsWith('ref:'))parseReference(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    clean.files[key]={name:f.name,sha256:f.sha256,encoding:f.encoding,data:f.data,size:bytes.byteLength};
  }
  for(const t of TESTS.filter(t=>t.manual)) {
    const m=input.manual?.[t.id];if(!m)continue;
    if(!['pending','pass','fail'].includes(m.status)||typeof m.note!=='string'||m.note.length>3000)throw Error('Некорректная отметка контроля.');
    clean.manual[t.id]={status:m.status,note:m.note};
  }
  if(Array.isArray(input.planSnapshots)&&input.planSnapshots.length<=100) {
    for(const snapshot of input.planSnapshots) {
      validatePlan(snapshot.plan);
      if(typeof snapshot.createdAt!=='string'||!Number.isFinite(Date.parse(snapshot.createdAt))||snapshot.sha256!==await sha(new TextEncoder().encode(JSON.stringify(snapshot.plan))))throw Error('Нарушена целостность сохранённого плана.');
      clean.planSnapshots.push(snapshot);
    }
  }
  return clean;
}
function project(source=state){
  const runs={},references={},manual={};
  for(const [key,f] of Object.entries(source.files)) {
    if(Object.hasOwn(ROLES,key))runs[key]={session:parsedFile(f,'temperature'),sha256:f.sha256};
    if(key.startsWith('ref:'))references[key.slice(4)]={parsed:parsedFile(f,'reference'),sha256:f.sha256};
  }
  for(const t of TESTS.filter(t=>t.manual))manual[t.id]={...source.manual[t.id],evidence:source.files['manual:'+t.id]?[source.files['manual:'+t.id].sha256]:[]};
  return {plan:source.plan,runs,references,manual};
}
function render(){
  try{latest=evaluateSuite(project());$('progress').textContent=latest.complete+' / '+latest.total;
    $('outcome').textContent=latest.outcome==='ready_for_review'?'Комплект готов к рассмотрению':latest.outcome==='has_failures'?'Есть несоответствия':'Приёмка ещё не завершена';
    if(!latest.physicalEvidenceDeclared&&latest.complete)$('outcome').textContent+=' · подтвердите происхождение и реквизиты';
    const list=$('result-list');list.replaceChildren();
    for(const r of latest.results){const card=el('article','q-result '+r.status);card.append(el('code','',r.id));const body=el('div');body.append(el('h3','',r.title),el('p','',r.reason));
      if(r.metrics?.channels&&Array.isArray(r.metrics.channels)){const vals=r.metrics.channels.map((c,i)=>'T'+(i+1)+': E = '+c.errorC.toFixed(3)+' °C; U = '+c.expandedC.toFixed(3)+' °C');body.append(el('p','metric',vals.join(' · ')))}
      card.append(body,el('span','status',labels[r.status]));list.append(card)}
  }catch(e){latest=null;message(e.message,true)}
  for(const node of document.querySelectorAll('[data-file-status]')){const f=state.files[node.dataset.fileStatus];node.textContent=f?f.name+' · '+Math.round(f.size/1024)+' КиБ\nSHA-256: '+f.sha256:'Файл не приложен'}
}
function uploadControl(key,accept,label){
  const holder=el('div'),actions=el('div','q-file-actions'),upload=el('label','button secondary file',label),input=el('input');input.type='file';input.accept=accept;input.setAttribute('aria-label',label+' · '+(ROLES[key]||key));upload.append(input);
  input.onchange=()=>{const f=input.files[0];if(f){operation=operation.then(()=>uploadFile(key,f)).catch(e=>message(e.message,true))}input.value=''};
  const remove=el('button','link-btn','Убрать');remove.type='button';remove.onclick=()=>{operation=operation.then(async()=>{delete state.files[key];await persist();render();message('Файл удалён из рабочей записи.')})};
  actions.append(upload,remove);const status=el('p','q-file-status');status.dataset.fileStatus=key;holder.append(actions,status);return holder;
}
async function uploadFile(key,file){
  if(file.size>MAX_FILE)throw Error('Файл больше 16 МиБ.');
  const total=Object.entries(state.files).reduce((n,[k,f])=>n+(k===key?0:f.size),0)+file.size;if(total>MAX_BYTES)throw Error('Комплект больше 64 МиБ.');
  const bytes=await file.arrayBuffer();let data,encoding;
  if(key.startsWith('manual:')){const b=new Uint8Array(bytes);const chunks=[];for(let i=0;i<b.length;i+=16384)chunks.push(String.fromCharCode(...b.subarray(i,i+16384)));data=btoa(chunks.join(''));encoding='base64'}
  else{data=new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='utf-8';if(key.startsWith('ref:'))parseReference(data);else readTemperature(data)}
  state.files[key]={name:file.name,size:file.size,sha256:await sha(bytes),encoding,data};
  // UTF-8 originals including a BOM are preserved as bytes by base64 when the
  // decoder's text differs, so an evidence export always retains the original hash.
  if(encoding==='utf-8'&&await sha(new TextEncoder().encode(data))!==state.files[key].sha256){state.files[key].encoding='base64';const b=new Uint8Array(bytes),chunks=[];for(let i=0;i<b.length;i+=16384)chunks.push(String.fromCharCode(...b.subarray(i,i+16384)));state.files[key].data=btoa(chunks.join(''))}
  await persist();render();message('Файл добавлен. Расчёт обновлён; исходные байты включены в экспорт.');
}
// The parser uses decoded text independently from the evidence representation.
function decoded(f){return new TextDecoder('utf-8',{fatal:true}).decode(fileBytes(f))}
function parsedFile(f,kind){const key=kind+f.sha256;if(!parsedCache.has(key)){if(parsedCache.size>24)parsedCache.clear();parsedCache.set(key,kind==='temperature'?readTemperature(decoded(f)):parseReference(decoded(f)))}return parsedCache.get(key)}
function buildControls(){
  for(const t of TESTS.filter(t=>t.manual)){
    const card=el('article','q-card');card.append(el('span','tiny',t.id+' / КОНТРОЛЬ ИСПОЛНИТЕЛЯ'),el('h3','',t.title),el('p','',manualHelp[t.id]));
    const lab=el('label','field','Решение исполнителя'),select=el('select');for(const [v,s] of [['pending','Не проверено'],['pass','Контроль выполнен'],['fail','Есть несоответствие']])select.add(new Option(s,v));select.value=state.manual[t.id]?.status||'pending';lab.append(select);
    const noteLab=el('label','field','Фактический результат'),note=el('textarea');note.maxLength=3000;note.value=state.manual[t.id]?.note||'';note.placeholder='Измеренные значения, приборы и наблюдения';noteLab.append(note);
    function changed(){state.manual[t.id]={status:select.value,note:note.value};scheduleSave();render()}
    select.onchange=changed;note.oninput=changed;card.append(lab,noteLab,uploadControl('manual:'+t.id,'.pdf,.jpg,.jpeg,.png,.txt,.csv','Приложить подтверждение'));$('manual').append(card);
  }
  for(const [key,label] of Object.entries(ROLES)){
    const card=el('article','q-card');card.append(el('span','tiny','JSONL / LM04B/1'),el('h3','',label),el('p','',descriptions[key]),uploadControl(key,'.jsonl,.ndjson,.txt','Добавить запись JSONL'));
    if(key.startsWith('point'))card.append(uploadControl('ref:'+key,'.csv','Контрольный термометр CSV'));$('run-files').append(card);
  }
}
function rebuild(){populatePlan();$('manual').replaceChildren();$('run-files').replaceChildren();buildControls();render()}
for(const key of [...stringKeys,...numberKeys,...booleanKeys])$(key).addEventListener('input',()=>{readPlan();scheduleSave();render()});
$('save-plan').onclick=async()=>{try{readPlan();validatePlan(state.plan);const snapshot={createdAt:new Date().toISOString(),plan:structuredClone(state.plan),sha256:await sha(new TextEncoder().encode(JSON.stringify(state.plan)))};
  if(state.planSnapshots.length>=100)throw Error('Достигнут предел 100 сохранений плана.');state.planSnapshots.push(snapshot);await persist();$('plan-hash').textContent='План сохранён '+new Date(snapshot.createdAt).toLocaleString('ru-RU')+'. SHA-256: '+snapshot.sha256;
  download(JSON.stringify({version:'LM04B-plan/2',...snapshot},null,2)+'\n',safeName()+'-plan.json');message('План выгружен. Сохраните его до начала опытов вместе с комплектом.')
}catch(e){message(e.message,true)}};
$('restore').onchange=e=>{const f=e.target.files[0];if(!f)return;operation=operation.then(async()=>{try{if(f.size>MAX_BYTES*1.6)throw Error('Комплект больше допустимого размера.');const next=await validateState(JSON.parse(await f.text()));state=next;await persist();rebuild();message('Комплект восстановлен. SHA-256 каждого файла сверён, результаты пересчитаны.')}catch(err){message(err.message,true)}});e.target.value=''};
$('export').onclick=async()=>{try{await operation;readPlan();render();if(!latest)throw Error('Исправьте план перед экспортом.');const exportState=await validateState(structuredClone(state));
  const planHash=await sha(new TextEncoder().encode(JSON.stringify(exportState.plan)));
  const report={...exportState,exportedAt:new Date().toISOString(),planSha256:planHash,assessment:evaluateSuite(project(exportState)),
    evidenceManifest:Object.entries(exportState.files).map(([role,f])=>({role,name:f.name,sha256:f.sha256,size:f.size})),
    limitations:['Происхождение измерений заявлено исполнителем и проверяется ответственным специалистом.','Непрерывные seq не подтверждают отсутствие всех ошибок транспорта до записи файла.','Расчёт относится к неизменённым датчикам и проводке в проверенных условиях.','Система не выдаёт свидетельство калибровки или приёмки медицинского аппарата.']};
  download(JSON.stringify(report,null,2)+'\n',safeName()+'-evidence.json');message('Полный комплект выгружен с исходными файлами и расчётом. Проверьте место сохранения файла.')
}catch(e){message(e.message,true)}};
$('print').onclick=()=>{readPlan();render();if(latest)window.print()};
$('clear').onclick=()=>{if(!window.confirm('Удалить план и файлы этой рабочей записи из браузера? Скачанный комплект останется у вас.'))return;operation=operation.then(async()=>{state={version:'LM04B-evidence/2',plan:{...DEFAULT_PLAN},manual:{},files:{},planSnapshots:[]};await persist();$('plan-hash').textContent='';rebuild();message('Создана пустая рабочая запись.')})};
try{db=await openDb();const saved=await dbGet();if(saved){state=await validateState(saved);message('Восстановлена рабочая запись этого браузера.')}}catch(e){message('Автосохранение недоступно или запись повреждена: '+e.message+'. Выгружайте комплект перед закрытием.',true)}
rebuild();
