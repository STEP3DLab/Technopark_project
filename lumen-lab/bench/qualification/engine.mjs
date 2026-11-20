import {readTemperature, thermalSummary, canonicalTemperature} from '../protocol.mjs';

export const REVISION = 'LM04B-Q/2';
export const DEFAULT_PLAN = Object.freeze({
  revision: REVISION, device: '', operator: '', board: '', rom1: '', rom2: '',
  reference: '', certificate: '', physicalDeclaration: false, methodDeclaration: false,
  // Project acceptance limits for the assembled research logger, not a medical specification.
  toleranceC: 1, referenceExpandedC: 0.2, referenceK: 2, gradientBoundC: 0.2,
  timingBoundC: 0.05, resolutionC: 0.0625, coverageK: 2,
  stableSpanC: 0.3, maxStepMs: 1500,
  targetsC: [20, 35, 50], targetWindowC: 2,
});
export const TESTS = Object.freeze([
  {id:'B01', title:'Идентификация и образ прошивки', manual:true},
  {id:'B02', title:'Цепи и напряжения', manual:true},
  {id:'B03', title:'Корпус, кабели и маркировка', manual:true},
  {id:'B04', title:'Два канала · 60 кадров', role:'baseline'},
  {id:'B05a', title:'Сопоставление · 20 °C', role:'point0'},
  {id:'B05b', title:'Сопоставление · 35 °C', role:'point1'},
  {id:'B05c', title:'Сопоставление · 50 °C', role:'point2'},
  {id:'B06', title:'Работает T1, T2 отключён', role:'onlyT1'},
  {id:'B07', title:'Работает T2, T1 отключён', role:'onlyT2'},
  {id:'B08', title:'Новый запуск той же платы', role:'restart'},
  {id:'B09', title:'Повторное чтение и целостность', role:'baseline'},
  {id:'B10', title:'Длительная запись · 30 минут', role:'endurance'},
]);
export const ROLES = Object.freeze({
  baseline:'Два канала, 60 кадров', point0:'Температура около 20 °C',
  point1:'Температура около 35 °C', point2:'Температура около 50 °C',
  onlyT1:'T1 подключён, T2 отключён', onlyT2:'T2 подключён, T1 отключён',
  restart:'После отключения и включения USB', endurance:'30 минут, оба канала',
});
const pending = reason => ({status:'pending', reason});
const fail = reason => ({status:'fail', reason});
const pass = (reason, metrics={}) => ({status:'pass', reason, metrics});
const finite = (v, lo, hi, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw Error('Недопустимое поле плана: '+name);
};
export function validatePlan(p) {
  if (!p || p.revision !== REVISION) throw Error('Неизвестная ревизия плана приёмки.');
  for (const key of ['device','operator','board','rom1','rom2','reference','certificate']) {
    if (typeof p[key] !== 'string' || p[key].length > 500) throw Error('Некорректные реквизиты '+key);
  }
  for (const key of ['physicalDeclaration','methodDeclaration']) if (typeof p[key] !== 'boolean') throw Error('Некорректное подтверждение '+key);
  for (const key of ['toleranceC','referenceExpandedC','gradientBoundC','timingBoundC','stableSpanC','targetWindowC']) finite(p[key], 0.000001, 10, key);
  finite(p.referenceK,1,10,'referenceK'); finite(p.coverageK,1,10,'coverageK');
  if (p.resolutionC !== 0.0625) throw Error('Для этой ревизии зафиксирован шаг 0,0625 °C.');
  if (p.maxStepMs !== 1500) throw Error('Для этой ревизии зафиксирован интервал 1500 мс.');
  if (!Array.isArray(p.targetsC) || p.targetsC.join(',') !== '20,35,50') throw Error('Для этой ревизии зафиксированы точки 20, 35 и 50 °C.');
  return p;
}
function identity(s,p) {
  if (!s || !s.rows?.length) return pending('Добавьте JSONL для этого испытания.');
  if (s.synthetic) return fail('Запись помечена как учебная. Физическая приёмка по ней невозможна.');
  if (!/^[0-9a-f]{16}$/.test(p.board) || !p.rom1 || !p.rom2) return pending('Зафиксируйте board и оба ROM в плане.');
  if (p.rom1 === p.rom2) return fail('Двум каналам назначен один ROM.');
  if (s.board !== p.board) return fail('Идентификатор платы не совпадает с планом.');
  for (const row of s.rows) {
    for (const [i,k] of ['t1','t2'].entries()) {
      if (row[k].id !== null && row[k].id !== p['rom'+(i+1)]) return fail('В '+k+' обнаружен другой ROM или перестановка датчиков.');
    }
  }
  return null;
}
function continuous(s,p,minFrames,minSeconds) {
  if (s.rows.length < minFrames) return fail('Недостаточно кадров: '+s.rows.length+'; нужно '+minFrames+'.');
  const m=thermalSummary(s);
  if (m.elapsedS < minSeconds) return fail('Длительность по часам платы меньше '+minSeconds+' с.');
  if (m.missed || m.rejected) return fail('Есть пропуски или отклонённые кадры. Повторите отдельную запись.');
  for (let i=1;i<s.rows.length;i++) if (s.rows[i].ms-s.rows[i-1].ms > p.maxStepMs) return fail('Есть временной разрыв больше 1,5 с.');
  return null;
}
export function evaluateRun(s,role,p) {
  validatePlan(p);
  const bad=identity(s,p); if (bad) return bad;
  const long=role==='endurance', small=['onlyT1','onlyT2','restart'].includes(role);
  const gap=continuous(s,p,long?1801:small?10:60,long?1800:small?9:59); if(gap)return gap;
  for(const row of s.rows) {
    for(const key of ['t1','t2']) {
      const absent=(role==='onlyT1'&&key==='t2')||(role==='onlyT2'&&key==='t1');
      if (row[key].s!==(absent?'no_sensor':'ok')) return fail('Статус '+key+' не соответствует сценарию: '+row[key].s+'.');
    }
  }
  return pass('Последовательность, два входа и идентификаторы соответствуют сценарию.',thermalSummary(s));
}

/** Reference readings paired explicitly with frame sequence numbers; never interpolate. */
export function parseReference(text) {
  if (typeof text !== 'string' || text.length>1024*1024) throw Error('CSV контрольного прибора превышает 1 МиБ.');
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  let synthetic=false;
  if(lines[0]==='# SYNTHETIC'){synthetic=true;lines.shift()}
  const sep=lines[0]?.includes(';')?';':',';
  if(lines.shift()!==['seq','ref_C'].join(sep))throw Error('В CSV нужны только столбцы seq,ref_C.');
  const rows=[];let last=-1;
  for(const [i,line] of lines.entries()) {
    if(!line.trim())continue;
    const fields=line.split(sep).map(x=>x.trim());
    if(fields.length!==2||!/^\d+$/.test(fields[0])||!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(fields[1]))throw Error('Неверное число в строке '+(i+2)+'.');
    const seq=Number(fields[0]),refC=Number(sep===';'?fields[1].replace(',','.'):fields[1]);
    if(!Number.isSafeInteger(seq)||seq<=last||!Number.isFinite(refC)||refC < -10||refC > 85)throw Error('Нарушен порядок seq или диапазон температуры в строке '+(i+2)+'.');
    rows.push({seq,refC});last=seq;
  }
  if(!rows.length)throw Error('CSV контрольного прибора пуст.');
  return {rows,synthetic};
}
const mean = xs => xs.reduce((n,v)=>n+v,0)/xs.length;
const sd = xs => {const m=mean(xs);return Math.sqrt(xs.reduce((n,v)=>n+(v-m)**2,0)/(xs.length-1))};
const span = xs => Math.max(...xs)-Math.min(...xs);
export function decision(errorC,expandedC,toleranceC) {
  if (Math.abs(errorC)+expandedC<=toleranceC) return 'pass';
  if (Math.abs(errorC)-expandedC>toleranceC) return 'fail';
  return 'indeterminate';
}
export function compareReference(s,reference,p,index) {
  const basic=evaluateRun(s,'point'+index,p);if(basic.status!=='pass')return basic;
  if(!reference)return pending('Добавьте CSV синхронных показаний контрольного термометра.');
  if(reference.synthetic)return fail('Показания контрольного термометра помечены как учебные.');
  if(!p.reference.trim()||!p.certificate.trim()||!p.methodDeclaration)return pending('Нужны реквизиты контрольного прибора и подтверждение условий метода.');
  const map=new Map(s.rows.map(r=>[r.seq,r]));const pairs=[];
  for(const r of reference.rows) {
    const f=map.get(r.seq);if(!f)return fail('CSV ссылается на отсутствующий кадр seq='+r.seq+'.');
    pairs.push({ref:r.refC, a:f.t1.c, b:f.t2.c, ms:f.ms});
  }
  if(pairs.length<10)return fail('Нужно не менее 10 пар с контрольным прибором.');
  if(pairs.at(-1).ms-pairs[0].ms<50000)return fail('Контрольные пары должны охватывать не менее 50 с.');
  const refs=pairs.map(r=>r.ref),refMean=mean(refs);
  if(Math.abs(refMean-p.targetsC[index])>p.targetWindowC)return fail('Средняя температура контрольного прибора вне окна выбранной точки.');
  if(span(refs)>p.stableSpanC || ['t1','t2'].some(k=>span(s.rows.map(r=>r[k].c))>p.stableSpanC))return fail('Зафиксирована нестабильность выше выбранного предела.');
  const channels=['a','b'].map(key=>{
    const errors=pairs.map(r=>r[key]-r.ref),errorC=mean(errors),repeatabilityC=sd(errors);
    // No division by sqrt(N): 1 Hz readings can be correlated; this is a
    // conservative engineering comparison, not a certificate of calibration.
    const components={referenceC:p.referenceExpandedC/p.referenceK,
      resolutionC:p.resolutionC/Math.sqrt(12), gradientC:p.gradientBoundC/Math.sqrt(3),
      timingC:p.timingBoundC/Math.sqrt(3), repeatabilityC};
    const standardC=Math.hypot(...Object.values(components)),expandedC=p.coverageK*standardC;
    return {errorC,standardC,expandedC,components,decision:decision(errorC,expandedC,p.toleranceC),
      measuredMeanC:mean(pairs.map(r=>r[key])),maxAbsoluteObservedC:Math.max(...errors.map(Math.abs))};
  });
  const status=channels.some(c=>c.decision==='fail')?'fail':channels.some(c=>c.decision==='indeterminate')?'indeterminate':'pass';
  return {status,reason:status==='pass'?'Оба канала уложились в допуск с учётом расчётной неопределённости.':status==='indeterminate'?'Интервал неопределённости пересекает границу допуска. Требуется уточнение метода или повтор.':'Получено несоответствие выбранному допуску.',
    metrics:{pairs:pairs.length,referenceMeanC:refMean,targetC:p.targetsC[index],channels,assumption:'Independent uncertainty components; no sqrt(N) reduction. Operator must justify gradient and timing bounds.'}};
}
export function evaluateSuite(project) {
  const {plan:p,runs={},references={},manual={}}=project;validatePlan(p);
  const results=TESTS.map(test=>{
    let result;
    if(test.manual) {
      const m=manual[test.id];
      result=m?.status==='fail'?fail(m.note||'Исполнитель отметил несоответствие.'):
        m?.status==='pass'&&m.note?.trim().length>=20&&m.evidence?.length?pass('Отметка исполнителя. '+m.note):pending('Нужны результаты контроля и приложенный файл подтверждения.');
    } else if(test.id.startsWith('B05'))result=compareReference(runs[test.role]?.session,references[test.role]?.parsed,p,Number(test.role.at(-1)));
    else if(test.id==='B08') {
      result=evaluateRun(runs.restart?.session,'restart',p);
      if(result.status==='pass') {
        const base=runs.baseline?.session;
        if(!base)result=pending('Для сравнения запуска нужна запись B04.');
        else if(identity(base,p))result=identity(base,p);
        else if(base.boot===runs.restart.session.boot)result=fail('Поле boot не изменилось. Повторите запись после перезапуска.');
      }
    } else if(test.id==='B09') {
      const s=runs.baseline?.session;result=identity(s,p)||pass('Нормализованная запись прочитана повторно без изменения кадров и статистики.');
      if(result.status==='pass') {
        const copy=readTemperature(canonicalTemperature(s));
        if(canonicalTemperature(copy)!==canonicalTemperature(s)||JSON.stringify(thermalSummary(copy))!==JSON.stringify(thermalSummary(s)))result=fail('Повторное чтение изменило результат.');
      }
    } else result=evaluateRun(runs[test.role]?.session,test.role,p);
    return {...test,...result};
  });
  const allPassed=results.every(r=>r.status==='pass');
  const declared=Boolean(p.physicalDeclaration&&p.device.trim()&&p.operator.trim());
  return {version:REVISION, scope:'Предварительная инженерная приёмка отдельного регистратора температуры. Не приёмка медицинского аппарата.',
    outcome:allPassed&&declared?'ready_for_review':results.some(r=>r.status==='fail')?'has_failures':'incomplete',
    physicalEvidenceDeclared:declared, requiresResponsibleReview:true, results,
    complete:results.filter(r=>r.status==='pass').length,total:TESTS.length};
}
