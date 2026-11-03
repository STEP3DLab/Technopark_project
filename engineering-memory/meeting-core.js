'use strict';
window.MeetingCore=(()=>{
 const empty=()=>({format:'engineering-memory-meeting',version:1,items:[]});
 const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 function validate(input,nodes,sources){
  if(!input||input.format!=='engineering-memory-meeting'||input.version!==1||!Array.isArray(input.items)||input.items.length>100)throw Error('Нужна папка встречи версии 1, не более 100 вопросов.');
  const ns=new Set(nodes.filter(n=>n.status!=='local').map(n=>n.id)),ss=new Set(sources.map(s=>s.id)),ids=new Set(),responseIDs=new Set();let size=0;
  const str=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Неверное или слишком длинное текстовое поле.');size+=v.length;return v.trim()};
  const date=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('Неверная дата записи.');return new Date(v).toISOString()};
  const url=v=>{str(v,2000);if(v&&!MemoryCore.safeURL(v))throw Error('Ссылка должна начинаться с HTTP/HTTPS и не содержать логина.');return MemoryCore.safeURL(v)};
  const items=input.items.map(q=>{
   if(!q||typeof q.id!=='string'||!/^q-[a-f0-9-]{8,80}$/.test(q.id)||ids.has(q.id))throw Error('Неверный или повторяющийся ID вопроса.');ids.add(q.id);
   if(q.node&&!ns.has(q.node))throw Error('Неизвестный объект вопроса.');
   if(!Array.isArray(q.sources)||q.sources.some(id=>!ss.has(id)))throw Error('Неизвестный источник вопроса.');
   if(!['open','document','recorded'].includes(q.status))throw Error('Неизвестный статус вопроса.');
   if(!Array.isArray(q.responses)||q.responses.length>30)throw Error('До 30 записей ответа на один вопрос.');
   const createdAt=date(q.createdAt),updatedAt=date(q.updatedAt);if(updatedAt<createdAt)throw Error('Нарушен порядок дат.');
   const responses=q.responses.map(r=>{if(!r||typeof r.id!=='string'||!/^r-[a-f0-9-]{8,80}$/.test(r.id)||responseIDs.has(r.id))throw Error('Неверный ID ответа.');responseIDs.add(r.id);const at=date(r.createdAt);if(at<createdAt||at>updatedAt)throw Error('Неверная дата ответа.');return {id:r.id,text:str(r.text,10000,true),who:str(r.who,160),url:url(r.url),locator:str(r.locator,500),createdAt:at}});
   if(q.status==='recorded'&&!responses.length)throw Error('Статус «Есть запись ответа» требует записи.');
   return {id:q.id,origin:str(q.origin,100),question:str(q.question,1000,true),node:q.node||'',sources:[...new Set(q.sources)],context:str(q.context,2500),status:q.status,createdAt,updatedAt,responses};
  });if(size>1000000)throw Error('Папка превышает 1 млн символов.');return {...empty(),items};
 }
 function merge(current,incoming,nodes,sources){
  const a=validate(current,nodes,sources),b=validate(incoming,nodes,sources),items=[...a.items];let added=0,skipped=0;
  for(const q of b.items){const same=items.find(n=>n.id===q.id);if(same){if(JSON.stringify(same)!==JSON.stringify(q))throw Error('У вопроса есть разные версии. Объединение остановлено, текущая папка не изменена.');skipped++;continue}items.push(q);added++}
  return {folder:validate({...a,items},nodes,sources),added,skipped};
 }
 return {empty,uid,validate,merge};
})();
