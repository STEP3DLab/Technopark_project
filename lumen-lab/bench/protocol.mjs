export const VERSION = 'LM04B/1';
export const SAMPLE_LIMIT = 43200;
export const FAULTS = Object.freeze({
  ok:'Есть показание', no_sensor:'Датчик отсутствует', bus_short:'Шина замкнута',
  wrong_family:'Неподдерживаемый датчик', multiple_devices:'Несколько датчиков на одной шине',
  rom_crc:'Ошибка CRC номера', conversion_timeout:'Нет готового преобразования',
  scratchpad_crc:'Ошибка CRC данных', invalid_data:'Недостоверные данные',
  startup_85:'Неоднозначное показание +85 °C', bus_error:'Ошибка шины',
  sensor_changed:'Смена датчика', parasite_power:'Требуется отдельное питание датчика'
});

const HEX16 = /^[0-9a-f]{16}$/;
const nonnegative = v => Number.isSafeInteger(v) && v >= 0;
export function romValid(s) {
  if(typeof s !== 'string' || !HEX16.test(s) || !s.startsWith('28'))return false;
  let crc = 0;
  for(let i=0;i<16;i+=2) {
    let b = parseInt(s.slice(i,i+2),16);
    for(let j=0;j<8;j++) {
      const mix = (crc^b)&1; crc >>= 1; if(mix)crc ^= 0x8c; b >>= 1;
    }
  }
  return crc === 0;
}
function sensor(x) {
  if(!x || typeof x !== 'object' || typeof x.s!=='string' || !Object.hasOwn(FAULTS,x.s))throw Error('Неизвестный статус датчика.');
  if(x.id !== null && !romValid(x.id))throw Error('Недействительный идентификатор датчика или CRC.');
  if(x.s === 'ok') {
    if(!romValid(x.id) || !Number.isFinite(x.c) || x.c === 85 || x.c < -55 || x.c > 125 || !Number.isInteger(x.c*16))throw Error('Недействительное показание DS18B20.');
  } else if(x.c !== null)throw Error('При ошибке датчика температура должна быть пустой.');
  return {id:x.id,c:x.c,s:x.s};
}
export function decodeFrame(input) {
  const f=typeof input==='string'?JSON.parse(input):input;
  if(!f || f.v!==VERSION || typeof f.board!=='string' || !HEX16.test(f.board) || typeof f.boot!=='string' || !HEX16.test(f.boot))throw Error('Неизвестная версия протокола или идентификатор платы.');
  if(!nonnegative(f.ms) || !nonnegative(f.seq))throw Error('Недопустимый номер или время отсчёта.');
  return {v:VERSION,board:f.board,boot:f.boot,seq:f.seq,ms:f.ms,t1:sensor(f.t1),t2:sensor(f.t2)};
}
export function thermalSession() {
  return {kind:'temperature',rows:[],missed:0,rejected:0,board:null,boot:null,roms:[new Set(),new Set()],origin:'file',synthetic:false};
}
export function appendFrame(s,f) {
  const last=s.rows.at(-1);
  if(last&&(f.board!==s.board||f.boot!==s.boot))return 'reboot';
  if(last&&(f.seq<=last.seq||f.ms<=last.ms))return 'order';
  if(s.rows.length>=SAMPLE_LIMIT)return 'limit';
  if(!last){s.board=f.board;s.boot=f.boot}
  else s.missed+=f.seq-last.seq-1;
  [f.t1,f.t2].forEach((p,i)=>{if(p.id)s.roms[i].add(p.id)});
  s.rows.push(f);return 'ok';
}
export function readTemperature(text) {
  const out=thermalSession();const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);let metadataSeen=false;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].trim();if(!line)continue;
    try {
      if(line.length>2048)throw Error('Слишком длинная строка.');
      const raw=JSON.parse(line);
      if(!out.rows.length&&!metadataSeen&&raw?.type==='LM04B-file') {
        if(typeof raw.synthetic!=='boolean')throw Error('Неверная отметка о происхождении.');
        out.synthetic=raw.synthetic;metadataSeen=true;continue;
      }
      const result=appendFrame(out,decodeFrame(raw));
      if(result==='reboot')throw Error('В одном файле несколько плат или запусков. Разделите записи по полям board и boot.');
      if(result==='order')throw Error('Нарушен порядок времени или номера кадра.');
      if(result==='limit')throw Error('Превышен предел 43 200 кадров на запись.');
    }catch(e){throw Error('Строка '+(i+1)+'. '+e.message)}
  }
  if(!out.rows.length)throw Error('Файл не содержит кадров LM04B/1.');
  return out;
}
export function thermalSummary(s) {
  const stats=['t1','t2'].map(key=>{
    let n=0,min=Infinity,max=-Infinity,coveredS=0;
    const faults={};
    for(let i=0;i<s.rows.length;i++) {
      const row=s.rows[i],x=row[key];
      if(x.s!=='ok'){faults[x.s]=(faults[x.s]||0)+1;continue}
      n++;min=Math.min(min,x.c);max=Math.max(max,x.c);
      if(i){const prev=s.rows[i-1],dt=row.ms-prev.ms;if(prev[key].s==='ok'&&prev[key].id===x.id&&row.seq===prev.seq+1&&dt<=2500)coveredS+=dt/1000}
    }
    return {n,minC:n?min:null,maxC:n?max:null,coveredS,faults,sensors:[...s.roms[key==='t1'?0:1]]};
  });
  return {nRows:s.rows.length,elapsedS:s.rows.length>1?(s.rows.at(-1).ms-s.rows[0].ms)/1000:0,missed:s.missed,rejected:s.rejected,channels:{a:stats[0],b:stats[1]}};
}
export function canonicalTemperature(s) {
  return [JSON.stringify({type:'LM04B-file',synthetic:Boolean(s.synthetic)}),...s.rows.map(f=>JSON.stringify(f))].join('\n')+'\n';
}
// A fragment may arrive in any USB read. Discard an overlong line through its newline.
export class LineReader {
  constructor(onLine,onInvalid){this.buf='';this.drop=false;this.onLine=onLine;this.onInvalid=onInvalid}
  feed(text){
    const parts=text.split('\n');
    for(let i=0;i<parts.length;i++){
      if(!this.drop){this.buf+=parts[i];if(this.buf.length>2048){this.drop=true;this.buf='';this.onInvalid()}}
      if(i===parts.length-1)continue;
      if(!this.drop){const line=this.buf.trim();if(line)this.onLine(line)}
      this.buf='';this.drop=false;
    }
  }
}
