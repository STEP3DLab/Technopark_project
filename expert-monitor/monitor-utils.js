'use strict';
(function (root) {
  const DAY = 86400000;
  const defaults = {search:'',status:'all',region:'all',court:'all',sourceType:'all',workStatus:'all',due:'all',sort:'priority'};
  const REGION_LABELS = {moscow:'Москва',oblast:'Московская область',other:'Другой регион',unknown:'Место объекта не уточнено'};
  function deadlineTime(item) {
    const value=item?.deadline;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value))return null;
    // Date.parse silently rolls 30 February into March; reject such input.
    const [year,month,day]=value.slice(0,10).split('-').map(Number);
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    if(value.length>10&&(Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59))return null;
    const zoned=value.length===10?value+'T23:59:59+03:00':/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?value:value+'+03:00';
    // Source timestamps without a zone use the panel's documented Moscow time,
    // never the visitor's computer timezone. They still require verification.
    const time=Date.parse(zoned);
    return Number.isFinite(time)?time:null;
  }
  function isActive(item,now=Date.now()) {
    const time=deadlineTime(item);
    return ['open_confirmed','needs_review'].includes(item.status)&&(time===null||time>=now);
  }
  function dueSoon(item,days=3,now=Date.now()) {
    const time=deadlineTime(item);
    return isActive(item,now)&&time!==null&&time>=now&&time-now<=days*DAY;
  }
  function matchesWork(item,work,selected) {
    const status=work[item.id]||'new';
    return selected==='all'||(selected==='active'?['review','draft','ready','sent'].includes(status):status===selected);
  }
  function normalizeRegion(record) {
    const raw=record?.objectRegion||record?.locationRegion||record?.region;
    if(typeof raw!=='string'||!raw.trim())return 'unknown';
    const text=raw.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
    const identify=s=>{
      const location=s.replace(/\([^)]*(?:вне|за пределами)[^)]*\)/g,'').replace(/(?:вне|за пределами) (?:москвы|московской области)(?: и (?:москвы|московской области))?/g,'');
      return /московск(?:ая|ой|ую)\s+област|подмосков/.test(location)?'oblast':/\bmoscow\b|москв(?:а|е|ы|у)(?:\b|\s|[—–,.;:-]|$)/u.test(location)?'moscow':null;
    };
    const uncertain=/местоположени[ея].{0,24}не подтвержден|регион.{0,20}(?:не указан|неизвест|не определ)|место(?:нахождение)?\s+объекта.{0,20}(?:не указан|неизвест|не уточнен)|фактический объект указан в тз/;
    if(uncertain.test(text))return 'unknown';
    const clauses=text.split(';').map(s=>s.trim()).filter(Boolean);
    // An organisation's registered address is not the location of the work.
    for(const clause of [...clauses].reverse()){
      if(!/объект/.test(clause))continue;
      const key=identify(clause);if(key)return key;
      const location=clause.split(/\s+[—–-]\s+/)[0];
      if(!/объект|заказчик|неизвест|не указан|не уточнен/.test(location)&&/[а-яa-z]/i.test(location))return 'other';
    }
    const remaining=clauses.filter(s=>!/заказчик|регистраци/.test(s));
    for(const clause of remaining){const key=identify(clause);if(key)return key;}
    if(/заказчик|регистраци/.test(text))return 'unknown';
    if(/неизвест|не указан|не уточнен|не подтвержден|уточняется|нет данных/.test(text))return 'unknown';
    return identify(text)||'other';
  }
  function geographyLabel(key) {return REGION_LABELS[key]||REGION_LABELS.unknown;}
  function publishedBudget(record) {
    if(!['contract','expert_fee'].includes(record?.amountType))return null;
    const amount=record.amountRub;
    return typeof amount==='number'&&Number.isFinite(amount)&&amount>0?amount:null;
  }
  function matchesAmount(record,{min,max,onlyKnown=false}={}) {
    const has=v=>v!==null&&v!==undefined&&v!=='';
    const amount=publishedBudget(record);
    if(amount===null)return !onlyKnown&&!has(min)&&!has(max);
    if(has(min)&&(!Number.isFinite(Number(min))||Number(min)<0||amount<Number(min)))return false;
    if(has(max)&&(!Number.isFinite(Number(max))||Number(max)<0||amount>Number(max)))return false;
    return true;
  }
  function sortItems(items,mode,now=Date.now()) {
    const stamp=v=>Number.isFinite(Date.parse(v))?Date.parse(v):0;
    const rank=o=>!isActive(o,now)?(o.status==='historical'?2:3):(o.status==='open_confirmed'?0:1);
    return [...items].sort((a,b)=>{
      if(mode==='amount-desc'||mode==='amount-asc'){
        const av=publishedBudget(a),bv=publishedBudget(b);
        if(av===null&&bv!==null)return 1;if(bv===null&&av!==null)return -1;
        if(av!==null&&bv!==null&&av!==bv)return mode==='amount-asc'?av-bv:bv-av;
      }
      if(mode==='newest')return stamp(b.publishedAt)-stamp(a.publishedAt)||a.id.localeCompare(b.id);
      if(mode==='checked')return stamp(b.checkedAt)-stamp(a.checkedAt)||a.id.localeCompare(b.id);
      if(mode==='deadline'){
        const time=o=>isActive(o,now)?(deadlineTime(o)??Infinity):Infinity;
        return time(a)-time(b)||rank(a)-rank(b)||stamp(b.publishedAt)-stamp(a.publishedAt);
      }
      return rank(a)-rank(b)||stamp(b.publishedAt)-stamp(a.publishedAt)||a.id.localeCompare(b.id);
    });
  }
  const api={defaults,deadlineTime,isActive,dueSoon,matchesWork,sortItems,normalizeRegion,geographyLabel,publishedBudget,matchesAmount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ExpertMonitorUtils=api;
})(typeof window==='undefined'?globalThis:window);
