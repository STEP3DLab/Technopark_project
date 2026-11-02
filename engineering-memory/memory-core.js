'use strict';
// Pure, dependency-free archive validation and dictionary mention matching.
window.MemoryCore = (() => {
  const normalize = value => String(value).toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
  function safeURL(value) {
    if (!value) return '';
    try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''; } catch { return ''; }
  }
  function detectMentions(text,nodes) {
    const hay=' '+normalize(text)+' ', found=[];
    for (const n of nodes.filter(n=>n.status!=='local')) {
      const aliases=Array.isArray(n.aliases)?n.aliases:typeof n.aliases==='string'?[n.aliases]:[];
      for (const alias of new Set([n.title,n.short,...aliases].map(normalize).filter(a=>a.length>=4))) {
        const needle=' '+alias+' '; let pos=hay.indexOf(needle);
        while(pos!==-1) {found.push({id:n.id,alias,start:pos,end:pos+needle.length});pos=hay.indexOf(needle,pos+1);}
      }
    }
    // A full model designation takes precedence over a shorter name inside it.
    return nodes.map(n=>{const hits=found.filter(f=>f.id===n.id&&!found.some(g=>g.id!==f.id&&g.start<=f.start&&g.end>=f.end&&(g.end-g.start)>(f.end-f.start)));return hits.length?{id:n.id,alias:hits.sort((a,b)=>b.alias.length-a.alias.length)[0].alias}:null}).filter(Boolean);
  }
  function validateArchive(input,nodes) {
    if (!input||input.format!=='engineering-memory-personal'||input.version!==1||!Array.isArray(input.materials)) throw Error('Нужен личный архив Живой инженерной памяти версии 1. Открытый корпус — другой формат.');
    if(input.materials.length>100)throw Error('Лимит — 100 материалов в личном архиве.');
    const known=new Set(nodes.filter(n=>n.status!=='local').map(n=>n.id)), ids=new Set();let size=0;
    const materials=input.materials.map(m=>{
      if(!m||typeof m.id!=='string'||!/^local-[a-f0-9-]{8,80}$/.test(m.id)||ids.has(m.id))throw Error('Повторяющийся или неверный идентификатор материала.');ids.add(m.id);
      for(const [key,max,min] of [['title',160,1],['text',40000,1],['url',2000,0],['year',4,0]])if(typeof m[key]!=='string'||m[key].length>max||m[key].trim().length<min)throw Error('Проверьте название, текст, год и ссылку материала.');
      if(m.year&&!/^(1[0-9]{3}|20[0-9]{2})$/.test(m.year))throw Error('Год должен быть от 1000 до 2099 или пустым.');
      if(m.url&&!safeURL(m.url))throw Error('Допускаются только ссылки HTTP/HTTPS без логина и пароля.');
      if(!Array.isArray(m.links)||m.links.length>100||m.links.some(id=>!known.has(id)))throw Error('В архиве есть связи с неизвестными объектами.');
      if(typeof m.createdAt!=='string'||!Number.isFinite(Date.parse(m.createdAt)))throw Error('Неверная дата создания материала.');
      size+=m.text.length;
      return {id:m.id,title:m.title.trim(),text:m.text.trim(),url:safeURL(m.url),year:m.year,links:[...new Set(m.links)],createdAt:new Date(m.createdAt).toISOString()};
    });
    if(size>1000000)throw Error('Общий объём текстов превышает 1 млн символов.');
    return {format:'engineering-memory-personal',version:1,materials};
  }
  function mergeArchives(current,incoming,nodes) {
    const a=validateArchive(current,nodes), b=validateArchive(incoming,nodes), merged=[...a.materials];let skipped=0;
    for(const m of b.materials){const same=merged.find(n=>n.id===m.id);if(same){if(JSON.stringify(same)!==JSON.stringify(m))throw Error('Одна запись имеет две разные версии. Сначала сохраните их с разными названиями в исходном архиве.');skipped++;continue;}if(merged.some(n=>normalize(n.title)===normalize(m.title)&&n.text===m.text&&n.url===m.url&&n.year===m.year&&[...n.links].sort().join() === [...m.links].sort().join())){skipped++;continue;}merged.push(m);}
    return {archive:validateArchive({...a,materials:merged},nodes),added:merged.length-a.materials.length,skipped};
  }
  function materialNode(m,index) {return {id:m.id,title:m.title,short:m.title.length>23?m.title.slice(0,21)+'…':m.title,type:'document',year:m.year||'без даты',summary:m.text.length>240?m.text.slice(0,240)+'…':m.text,body:m.text,sources:[],locator:'Личный материал. Связи — выбранные пользователем упоминания; содержание источника не проверено.',status:'local',url:m.url,aliases:[],x:100+index*20,y:100};}
  return {normalize,safeURL,detectMentions,validateArchive,mergeArchives,materialNode};
})();
