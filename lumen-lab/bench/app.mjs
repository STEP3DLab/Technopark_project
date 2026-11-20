import {analysePower,parsePowerCsv,suggestGap} from './analysis.mjs';
import {canonicalTemperature,FAULTS,readTemperature,thermalSession,thermalSummary} from './protocol.mjs';
import {receive} from './stream.mjs';
import {plot} from './plot.mjs';
import {observedOverlap} from './overlap.mjs';

const $=id=>document.getElementById(id), sessions=[];
let active=null,live=null,dirty=false;
const nf=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:4});
const num=v=>v==null?'—':v!==0&&Math.abs(v)<.0001?v.toExponential(2):nf.format(v);
const seconds=v=>num(v)+' с';
const source=s=>s.synthetic?'Учебные данные':s.origin==='usb'?'USB · Pico':'Импорт · '+(s.kind==='power'?'мощность':'температура');
function notice(s,error=false){$('notice').textContent=s;$('notice').classList.toggle('error',error)}
function saveMeta(){if(active)active.meta={trial:$('trial').value.trim(),instrument:$('instrument').value.trim(),calibration:$('calibration').value.trim()}}
function choose(s){
  saveMeta();active=s;$('sessions').value=String(sessions.indexOf(s));
  for(const k of ['trial','instrument','calibration'])$(k).value=s.meta?.[k]||'';
  if(s.kind==='power'){$('gap').value=s.gap;$('floor-a').value=s.floors?.[0]??'';$('floor-b').value=s.floors?.[1]??''}
  render();
}
function add(s,title){
  s.title=title;s.meta={};s.createdAt=new Date().toISOString();sessions.push(s);
  const select=$('sessions');if(sessions.length===1)select.replaceChildren();const opt=new Option(title,String(sessions.length-1));select.add(opt);select.disabled=false;choose(s);
}
function setGap(s,v){
  const steps=new Uint8Array(s.rows.length);
  const metrics=analysePower(s.rows,v,(i,ok)=>{steps[i]=Number(ok)});
  s.gap=v;s.steps=steps;s.metrics=metrics;
  if(s.overlap)s.overlap=observedOverlap(s.rows,s.steps,s.overlap.aFloorW,s.overlap.bFloorW);
}
function refreshOverlap(){
  const s=active;if(!s||s.kind!=='power')return;
  const a=$('floor-a'),b=$('floor-b');s.floors=[a.value,b.value];s.overlap=null;
  if(!a.value||!b.value){$('overlap-result').textContent='Для расчёта укажите оба порога.';return}
  try{s.overlap=observedOverlap(s.rows,s.steps,a.valueAsNumber,b.valueAsNumber);const r=s.overlap;
    $('overlap-result').textContent='Оба сигнала выше порогов на концах '+r.intervals+' интервалов. Суммарно '+seconds(r.coveredS)+', самый длинный непрерывный участок '+seconds(r.longestS)+'.';
  }catch(e){$('overlap-result').textContent=e.message}
}
$('floor-a').oninput=$('floor-b').oninput=refreshOverlap;
function table(s,stats){
  const thermal=s.kind==='temperature',t=document.createElement('table');
  const head=t.createTHead().insertRow();
  for(const k of ['Канал','Отсчёты','Мин / макс','Покрытие',thermal?'Статусы датчика':'Интеграл']){const th=document.createElement('th');th.scope='col';th.textContent=k;head.append(th)}
  const body=t.createTBody();
  for(const [i,c] of Object.entries(stats.channels)){
    const range=thermal?[c.minC,c.maxC]:[c.minW,c.maxW];
    const faults=thermal?Object.entries(c.faults).map(([s,n])=>(FAULTS[s]||s)+' × '+n).join(', '):'';
    const values=[i==='a'?'1':'2',String(c.n),range.map(num).join(' / ')+(thermal?' °C':' Вт'),seconds(c.coveredS),thermal?(faults||'Ошибок нет'):(c.energyJ===null?'—':num(c.energyJ)+' Дж')];
    const row=body.insertRow();for(const value of values)row.insertCell().textContent=value;
  }
  $('stats').replaceChildren(t);
}
function render(){
  const s=active,has=Boolean(s?.rows.length);$('export-data').disabled=$('export-report').disabled=!has;
  $('connect').hidden=Boolean(live);$('stop').hidden=!live;
  $('plot-empty').hidden=has;$('source-tag').textContent=s?source(s):'Нет записи';
  $('overlap-fields').hidden=s?.kind!=='power';
  $('gap-field').hidden=s?.kind!=='power';$('quality-name').textContent=s?.kind==='power'?'Общее покрытие':'Пропусков кадров';
  if(!s){plot($('plot'),null);return}
  const thermal=s.kind==='temperature',m=thermal?thermalSummary(s):s.metrics;
  $('nrows').textContent=String(m.nRows);$('duration').textContent=seconds(m.elapsedS);
  $('quality').textContent=thermal?String(m.missed):seconds(m.commonCoveredS);
  const last=s.rows.at(-1),stale=Boolean(live?.s===s&&(!s.lastArrival||Date.now()-s.lastArrival>3500));
  for(const [j,k] of ['a','b'].entries()){
    const title=(thermal?'T':'P')+(j+1);
    $('label-'+k).textContent=title+(thermal?(stale?' · нет свежих данных':last&&last['t'+(j+1)].s!=='ok'?' · '+FAULTS[last['t'+(j+1)].s]:' · последний отсчёт'):' · последний отсчёт');
    const value=last?(thermal?last['t'+(j+1)].c:last[k]):null;
    $('value-'+k).textContent=value===null||stale?'—':num(value)+(thermal?' °C':' Вт');
  }
  $('plot-unit').textContent=thermal?'Температура, °C':'Мощность, Вт';
  $('quality-note').textContent=thermal?'Покрытие учитывает последовательные достоверные кадры одного датчика с интервалом до 2,5 с. Отклонено строк при получении: '+m.rejected+'.':'Интеграл мощности вычислен методом трапеций по соседним отсчётам каждого канала. Пропуски и интервалы длиннее установленного порога исключены. Общее покрытие означает наличие двух рядов измерений на этих интервалах.';
  const ids=thermal?'Плата '+(s.board||'—')+' · запуск '+(s.boot||'—')+'. Датчики T1: '+([...s.roms[0]].join(', ')||'—')+', T2: '+([...s.roms[1]].join(', ')||'—')+'. ':'';
  $('digest').textContent=ids+(s.hash?'SHA-256 исходного файла: '+s.hash+'. ':'')+(s.synthetic?'Источник помечен как учебный.':s.origin==='file'?'Происхождение и калибровка импортированного файла требуют документального подтверждения.':'');
  if($('report').open){table(s,m);if(!thermal)refreshOverlap()}
  plot($('plot'),s);
}
function schedule(){if(dirty)return;dirty=true;requestAnimationFrame(()=>{dirty=false;render()})}
$('report').ontoggle=()=>{if($('report').open&&active)render()};
$('sessions').onchange=e=>choose(sessions[Number(e.target.value)]);
$('gap').onchange=()=>{
  if(active?.kind!=='power')return;
  try{setGap(active,Number($('gap').value));render();notice('Статистика пересчитана по новому порогу.')}
  catch(e){$('gap').value=active.gap;notice(e.message,true)}
};
async function digest(bytes){const d=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function openData(bytes,name,example=false){
  if(live)throw Error('Остановите USB-запись перед открытием файла.');
  if(bytes.byteLength>32*1024*1024)throw Error('Файл превышает предел 32 МиБ.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),hash=await digest(bytes);let s;
  if(text.trimStart().startsWith('{')){s=readTemperature(text);s.origin='file'}
  else{const data=parsePowerCsv(text);if(!data.rows.length)throw Error('В файле есть заголовок, но нет отсчётов.');
    s={...data,kind:'power',origin:'file'};setGap(s,suggestGap(s.rows))}
  if(live)throw Error('Остановите USB-запись перед открытием файла.');
  s.synthetic=example||s.synthetic;s.hash=hash;s.file=name;add(s,(s.synthetic?'Учебная · ':'')+name);
  notice(s.synthetic?'Открыт учебный набор. Его происхождение сохраняется при экспорте.':'Файл загружен. Просмотрите качество данных и укажите реквизиты опыта.');
}
async function example(path,name){
  try{if(live)throw Error('Остановите USB-запись перед открытием примера.');
    const r=await fetch(path);if(!r.ok)throw Error('Не удалось загрузить пример.');await openData(await r.arrayBuffer(),name,true)}
  catch(e){notice(e.message,true)}
}
$('example').onclick=()=>example('data/power-example.csv','power-example.csv');
$('thermal-example').onclick=()=>example('firmware/qualification-rp2040.jsonl','qualification-rp2040.jsonl');
$('import-file').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>32*1024*1024)throw Error('Файл превышает предел 32 МиБ.');await openData(await f.arrayBuffer(),f.name)}
  catch(e){notice(e.message,true)}finally{e.target.value=''}
};
function serialize(s){
  if(s.kind==='temperature')return canonicalTemperature(s);
  const lines=s.synthetic?['# SYNTHETIC']:[];lines.push('time_s,ch1_W,ch2_W');
  for(const row of s.rows)lines.push([row.t,row.a??'',row.b??''].join(','));
  return lines.join('\n')+'\n';
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
const basename=s=>'LM04B-'+(s.synthetic?'SYNTHETIC-':'')+(s.kind==='temperature'?'T-'+s.boot:'P')+'-'+s.createdAt.replace(/[:.]/g,'-');
$('export-data').onclick=()=>{const s=active;if(!s?.rows.length)return;const thermal=s.kind==='temperature';download(new Blob([serialize(s)],{type:thermal?'application/x-ndjson':'text/csv;charset=utf-8'}),basename(s)+(thermal?'.jsonl':'.csv'))};
$('export-report').onclick=async()=>{
  try{
    saveMeta();const s=active;if(!s?.rows.length)return;
    const metrics=s.kind==='temperature'?thermalSummary(s):s.metrics;
    const report={version:'LM04B-report/1',exportedAt:new Date().toISOString(),kind:s.kind,synthetic:s.synthetic,origin:s.origin,originalFile:s.file||null,originalFileSha256:s.hash||null,operatorMetadata:{...s.meta},board:s.board??null,boot:s.boot??null,metrics,pairedAboveFloors:s.overlap||null,
      interpretation:s.kind==='power'?'Интеграл импортированной мощности по покрытым интервалам. Происхождение показаний требует внешнего подтверждения.':'Температура по цифровым датчикам. Реквизиты опыта вводит оператор.'};
    const bytes=new TextEncoder().encode(serialize(s));report.normalizedDataSha256=await digest(bytes);
    download(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}),basename(s)+'-report.json');
  }catch(e){notice(e.message,true)}
};
async function connect(){
  if(live)return;
  if(!navigator.serial||!window.isSecureContext){notice('USB-подключение доступно в настольном Chrome или Edge по HTTPS и на localhost. В этом браузере можно открыть JSONL с компьютера или CSV.',true);return}
  $('connect').disabled=true;let handle=null,port,reader,opened=false;
  try{
    port=await navigator.serial.requestPort({filters:[{usbVendorId:0x2e8a}]});
    await port.open({baudRate:115200,bufferSize:8192});opened=true;
    if(port.setSignals)try{await port.setSignals({dataTerminalReady:true})}catch{}
    reader=port.readable.getReader();const s=thermalSession();s.origin='usb';
    handle={s,reader,stop:false};live=handle;add(s,'USB · '+new Date().toLocaleTimeString('ru-RU'));notice('Порт открыт. Ожидание кадров LM04B/1.');
    let first=true;const reason=await receive(reader,s,()=>{if(first){first=false;notice('Идёт запись по USB. Сохраняются показания обоих каналов и статусы датчиков.')}if(active===s)schedule()},()=>handle.stop);
    if(reason==='reboot')notice('Обнаружена другая плата или перезапуск. Первая запись сохранена во вкладке. Для второго запуска начните новую запись.',true);
    else if(reason==='limit')notice('Достигнут предел в 43 200 кадров. Сохраните файл и начните новую запись.');
    else if(handle.stop)notice(s.rows.length?'Запись остановлена. Результат можно скачать.':'Запись остановлена до получения первого кадра.');
    else notice('Поток USB завершён. Принятые кадры доступны для скачивания.',true);
  }catch(e){notice(e.name==='NotFoundError'?'Подключение отменено.':'Ошибка USB. '+e.message+(handle?' Полученные кадры сохранены во вкладке.':''),e.name!=='NotFoundError')}
  finally{
    if(reader)try{reader.releaseLock()}catch{}
    if(opened)try{await port.close()}catch{}
    if(handle&&live===handle)live=null;
    $('connect').disabled=false;render();
  }
}
$('connect').onclick=connect;
$('stop').onclick=async()=>{if(!live)return;live.stop=true;try{await live.reader.cancel()}catch{}};
setInterval(()=>{if(live&&active===live.s&&(!active.lastArrival||Date.now()-active.lastArrival>3500))schedule()},950);
new ResizeObserver(schedule).observe($('plot').parentElement);
render();
