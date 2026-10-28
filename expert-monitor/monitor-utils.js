'use strict';
(function (root) {
  const DAY = 86400000;
  const defaults = {search:'',status:'all',region:'all',court:'all',sourceType:'all',workStatus:'all',due:'all',sort:'priority'};
  function deadlineTime(item) {
    const value=item.deadline;
    if(!value)return null;
    const time=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T23:59:59+03:00':value);
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
    return selected==='all'||(selected==='active'?['review','draft'].includes(status):status===selected);
  }
  function sortItems(items,mode,now=Date.now()) {
    const stamp=v=>Number.isFinite(Date.parse(v))?Date.parse(v):0;
    const rank=o=>!isActive(o,now)?(o.status==='historical'?2:3):(o.status==='open_confirmed'?0:1);
    return [...items].sort((a,b)=>{
      if(mode==='newest')return stamp(b.publishedAt)-stamp(a.publishedAt)||a.id.localeCompare(b.id);
      if(mode==='checked')return stamp(b.checkedAt)-stamp(a.checkedAt)||a.id.localeCompare(b.id);
      if(mode==='deadline'){
        const time=o=>isActive(o,now)?(deadlineTime(o)??Infinity):Infinity;
        return time(a)-time(b)||rank(a)-rank(b)||stamp(b.publishedAt)-stamp(a.publishedAt);
      }
      return rank(a)-rank(b)||stamp(b.publishedAt)-stamp(a.publishedAt);
    });
  }
  const api={defaults,deadlineTime,isActive,dueSoon,matchesWork,sortItems};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ExpertMonitorUtils=api;
})(typeof window==='undefined'?globalThis:window);
