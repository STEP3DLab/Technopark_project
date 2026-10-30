/* A view/export of the current report, never an assessment or a state store.
 * html(model) + mount(reportRoot,{model,onDownload,view?}).
 * Place the existing long report in [data-passport-full] inside reportRoot.
 * mount returns {getView,destroy}; svg(model) returns a self-contained SVG.
 */
(function(global){
  'use strict';
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function text(value,limit,fallback=''){
    if(typeof value!=='string')return fallback;
    const clean=value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').replace(/\s+/g,' ').trim();
    return Array.from(clean).filter(char=>{const cp=char.codePointAt(0);return !(cp>=0xd800&&cp<=0xdfff)&&cp!==0xfffe&&cp!==0xffff;}).slice(0,limit).join('')||fallback;
  }
  const integer=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max?v:null;
  const mean=v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=5?v:null;
  function normalize(source){
    const m=object(source)?source:{},seen=new Set();
    const tracks=(Array.isArray(m.tracks)?m.tracks:[]).filter(object).slice(0,8).map((t,i)=>{
      let id=typeof t.id==='string'&&/^[a-z][a-z0-9_-]{0,31}$/.test(t.id)?t.id:'track-'+i;
      if(seen.has(id))id='track-'+i;seen.add(id);
      const count=integer(t.count,48),total=integer(t.total,48),value=mean(t.mean);
      return {id,name:text(t.name,56,'Направление '+(i+1)),color:typeof t.color==='string'&&/^#[\da-f]{6}$/i.test(t.color)?t.color:'#2355ed',mean:value,count,total,eligible:t.eligible===true&&value!==null&&count!==null&&count>0&&total!==null&&total>0&&count<=total,checked:typeof t.checked==='boolean'?t.checked:null,hasReflection:t.hasReflection===true&&(t.reflection===null||mean(t.reflection)!==null),reflection:t.reflection===null?null:mean(t.reflection)};
    });
    const planned=(Array.isArray(m.planned)?m.planned:[]).filter(object).slice(0,2).map(p=>({id:text(p.id,32),name:text(p.name,56,'Выбранное направление'),project:text(p.project,110,'Проект пока не назван')}));
    return {sessionId:text(m.sessionId,40,'Без кода'),mode:['quick','full'].includes(m.mode)?m.mode:'',date:text(m.date,40,'Дата не указана'),demo:m.demo===true,received:m.received===true,tracks,planned,answered:integer(m.answered,48),checked:integer(m.checked,8),markedPercent:integer(m.markedPercent,100)};
  }
  const number=v=>v===null?'—':String(v);
  function valueLabel(value){
    if(value===null)return '—';
    const rounded=Math.round(value*100)/100;
    return (rounded!==value?'≈':'')+String(rounded).replace('.',',');
  }
  function trackValue(t){return t.eligible?valueLabel(t.mean):'—';}
  function counts(t){return number(t.count)+' из '+number(t.total)+' ответов';}
  function modeLabel(m){return m.mode==='quick'?'Короткий маршрут':m.mode==='full'?'Большая экспедиция':'Маршрут не указан';}
  function flag(m){return m.demo?'ДЕМОНСТРАЦИОННЫЙ ПРИМЕР':m.received?'КАРТА ИЗ ФАЙЛА · ТОЛЬКО ПРОСМОТР':'';}
  function reflection(t){return !t.hasReflection?'':t.reflection===null?'После пробы: пока не могу оценить':'Продолжить после пробы: '+valueLabel(t.reflection)+' / 5';}
  function mark(){return '<svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><path d="M2 2h10v10H2zM16 2h10v10H16zM2 16h10v10H2z" fill="currentColor"/><path d="m21 14 7 7-7 7-7-7z" fill="#d5f36b"/></svg>';}
  function html(model){
    const m=normalize(model);
    return `<section class="rp" data-result-passport aria-label="Паспорт результата"><div class="rp-toolbar no-print"><div class="rp-switch" role="group" aria-label="Вид карты"><button type="button" data-passport-action="compact" aria-pressed="true" aria-controls="passport-compact">Краткий паспорт</button><button type="button" data-passport-action="full" aria-pressed="false" aria-controls="passport-full">Подробная карта</button></div><button type="button" class="rp-download" data-passport-action="download">Скачать карточку SVG <span aria-hidden="true">↗</span></button><span class="rp-export-status" data-passport-status role="status" aria-live="polite"></span></div><div id="passport-compact" data-passport-compact><article class="rp-card"><header class="rp-header"><div class="rp-brand">${mark()}<span>ПЕРВОСБОРКА<small>ТЕХНОПАРК РГСУ</small></span></div>${flag(m)?`<p class="rp-flag">${esc(flag(m))}</p>`:''}<div class="rp-title-row"><div><p class="rp-kicker">ТВОЙ ОПЫТ · ТВОЙ СЛЕДУЮЩИЙ ШАГ</p><h1>Карта первых проб</h1></div><div class="rp-stats"><div><strong>${number(m.answered)}</strong><span>ответов об интересах</span></div><div><strong>${number(m.checked)}</strong><span>проверенных проб</span></div></div></div><p class="rp-meta">${esc(m.sessionId)} <span>·</span> ${esc(modeLabel(m))} <span>·</span> ${esc(m.date)}</p></header><div class="rp-body"><div class="rp-section-label"><h3>Хочется заниматься</h3><p>Среднее по шкале 1–5</p></div><div class="rp-tracks">${m.tracks.map(t=>`<section class="rp-track" aria-label="${esc(t.name)}" style="--rp-track:${t.color}"><div class="rp-track-top"><h4>${esc(t.name)}</h4><strong class="rp-value">${trackValue(t)}${t.eligible?'<small> / 5</small>':''}</strong></div><div class="rp-meter" role="img" aria-label="${esc(t.eligible?'Средний интерес '+valueLabel(t.mean)+' из 5':'Недостаточно данных для сравнения')}"><span style="width:${t.eligible?(t.mean-1)/4*100:0}%"></span></div><div class="rp-track-meta"><span>${esc(counts(t))}</span><span>${t.eligible?'1 — 5':'Мало данных'}</span></div><div class="rp-track-foot"><span class="rp-checked">${t.checked===true?'Проба проверена':t.checked===false?'Проба ещё не проверена':'Нет отметки о пробе'}</span>${reflection(t)?`<span>${esc(reflection(t))}</span>`:''}</div></section>`).join('')}</div><div class="rp-next"><div class="rp-section-label"><h3>Следующие проекты</h3><p>${m.planned.length?'Твой выбор для практики':'Пока не выбраны'}</p></div>${m.planned.length?`<ol class="rp-projects">${m.planned.map((p,i)=>`<li><span class="rp-project-number" aria-hidden="true">0${i+1}</span><div><p>${esc(p.name)}</p><h4>${esc(p.project)}</h4></div></li>`).join('')}</ol>`:'<p class="rp-empty">Проекты можно выбрать в подробной карте.</p>'}</div><p class="rp-caption">Интерес отражает желание заниматься. Пропуски не равны нулю. Эта учебная карта помогает выбрать следующую пробу; она не измеряет профессиональную пригодность.</p></div></article></div></section>`;
  }
  function wrap(value,limit,maxLines){
    const words=String(value).split(/\s+/),lines=[];let line='';
    for(let word of words){
      while(word.length>limit){if(line){lines.push(line);line='';}lines.push(word.slice(0,limit));word=word.slice(limit);}
      if(!word)continue;
      if(!line)line=word;else if(line.length+word.length+1<=limit)line+=' '+word;else{lines.push(line);line=word;}
    }
    if(line)lines.push(line);
    if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=lines[maxLines-1].slice(0,limit-1)+'…';}
    return lines;
  }
  function svg(model){
    const m=normalize(model),rowHeight=76,rowsTop=271,projectsTop=rowsTop+Math.max(m.tracks.length,1)*rowHeight+36,height=projectsTop+230;
    const label=(x,y,value,size=16,color='#14233f',weight=400,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
    const lines=(x,y,value,limit,max,size=18,color='#14233f',weight=600)=>wrap(value,limit,max).map((line,i)=>label(x,y+i*(size+6),line,size,color,weight)).join('');
    const badge=flag(m);
    let output=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}" role="img" aria-labelledby="passport-title passport-desc"><title id="passport-title">${esc('ПЕРВОСБОРКА · '+m.sessionId)}</title><desc id="passport-desc">Карта интересов по шкале от 1 до 5, число ответов и проверенных проб, выбранные проекты. Это учебная карта, а не оценка профессиональной пригодности.</desc><rect width="1000" height="${height}" rx="28" fill="#f5f7fc"/><g font-family="Arial, Helvetica, sans-serif"><path d="M28 0h944a28 28 0 0 1 28 28v181H0V28A28 28 0 0 1 28 0" fill="#14233f"/><g fill="#fff"><path d="M42 32h13v13H42zM61 32h13v13H61zM42 51h13v13H42z"/></g><path d="m68 49 10 10-10 10-10-10z" fill="#d5f36b"/>${label(92,47,'ПЕРВОСБОРКА',22,'#ffffff',700)}${label(93,66,'ТЕХНОПАРК РГСУ',10,'#bccce6',600,'letter-spacing="2"')}${badge?label(958,43,badge,11,'#d5f36b',700,'text-anchor="end"'):''}${label(42,116,'Карта первых проб',39,'#ffffff',700)}${label(44,145,m.sessionId+' · '+modeLabel(m)+' · '+m.date,13,'#c6d4eb')}${label(44,183,number(m.answered)+' ответов об интересах',16,'#ffffff',600)}${label(372,183,number(m.checked)+' проверенных проб',16,'#ffffff',600)}${label(42,245,'Хочется заниматься',22,'#14233f',700)}${label(958,245,'Среднее по шкале 1–5',14,'#596b83',400,'text-anchor="end"')}`;
    m.tracks.forEach((t,i)=>{
      const y=rowsTop+i*rowHeight,valid=t.eligible,width=valid?(t.mean-1)/4*332:0;
      output+=`<rect x="42" y="${y}" width="916" height="65" rx="12" fill="#ffffff" stroke="#dee5f0"/><rect x="42" y="${y+13}" width="4" height="39" rx="2" fill="${t.color}"/>${lines(61,y+24,t.name,27,2,15,'#203859',600)}<rect x="358" y="${y+23}" width="332" height="9" rx="4.5" fill="#e5ebf4"/>${width>0?`<rect x="358" y="${y+23}" width="${width}" height="9" rx="4.5" fill="${t.color}"/>`:''}${label(358,y+51,'1',10,'#6c7b91')}${label(690,y+51,'5',10,'#6c7b91',400,'text-anchor="end"')}${label(725,y+34,trackValue(t)+(valid?' / 5':''),20,'#1d3b6b',700)}${label(932,y+24,counts(t),11,'#65758d',400,'text-anchor="end"')}${label(932,y+47,valid?(t.checked===true?'Проба проверена':''):'Мало данных',11,'#65758d',400,'text-anchor="end"')}`;
    });
    output+=label(42,projectsTop,'Следующие проекты',22,'#14233f',700);
    if(m.planned.length){
      m.planned.forEach((p,i)=>{const x=42+i*466,y=projectsTop+22;output+=`<rect x="${x}" y="${y}" width="450" height="120" rx="14" fill="#eaf0ff" stroke="#d2dff8"/><rect x="${x+17}" y="${y+18}" width="29" height="29" rx="8" fill="#2355ed"/>${label(x+31,y+38,'0'+(i+1),10,'#ffffff',700,'text-anchor="middle"')}${label(x+60,y+31,p.name,12,'#49658f')}${lines(x+60,y+57,p.project,30,2,18,'#203f73',600)}`;});
    }else output+=label(42,projectsTop+42,'Пока не выбраны. Добавить проекты можно в подробной карте.',16,'#596b83');
    output+=label(42,projectsTop+176,'Интерес — желание заниматься. Пропуски не равны нулю.',13,'#52647d')+label(42,projectsTop+198,'Учебная карта помогает выбрать следующую пробу. Профессиональная пригодность не оценивается.',12,'#52647d')+'</g></svg>';
    return output;
  }
  function mount(root,options={}){
    const safe=normalize(options.model),compact=root?.querySelector?.('[data-passport-compact]'),full=root?.querySelector?.('[data-passport-full]');
    let mode=options.view?.mode==='full'?'full':'compact',destroyed=false;const urls=new Set(),timers=new Set();
    const status=message=>{const slot=root?.querySelector?.('[data-passport-status]');if(slot&&!destroyed)slot.textContent=message;};
    function setMode(next){
      mode=next==='full'?'full':'compact';
      if(compact)compact.hidden=mode!=='compact';if(full)full.hidden=mode!=='full';
      for(const el of root?.querySelectorAll?.('[data-passport-action="compact"],[data-passport-action="full"]')||[]){
        el.setAttribute('aria-pressed',String(el.dataset.passportAction===mode));
        const target=el.dataset.passportAction==='full'?full:compact;
        if(target){if(!target.id)target.id=el.dataset.passportAction==='full'?'passport-full':'passport-compact';el.setAttribute('aria-controls',target.id);}
      }
    }
    async function onClick(event){
      const button=event.target?.closest?.('[data-passport-action]');if(!button||!root.contains(button)||destroyed)return;
      const action=button.dataset.passportAction;
      if(action==='compact'||action==='full'){setMode(action);return;}
      if(action!=='download')return;
      const filename='pervosborka-passport-'+(safe.sessionId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,40).toLowerCase()||'result')+'.svg';
      try{
        const content=svg(safe),mime='image/svg+xml;charset=utf-8';
        if(typeof options.onDownload==='function')await options.onDownload(filename,content,mime);
        else{
          const url=global.URL.createObjectURL(new global.Blob([content],{type:mime})),a=root.ownerDocument.createElement('a');urls.add(url);a.href=url;a.download=filename;root.ownerDocument.body.appendChild(a);a.click();a.remove();
          const timer=global.setTimeout(()=>{global.URL.revokeObjectURL(url);urls.delete(url);timers.delete(timer);},2000);timers.add(timer);
        }
        status('Карточка SVG подготовлена.');
      }catch(error){status('Не удалось подготовить карточку. Попробуй ещё раз.');}
    }
    root?.addEventListener?.('click',onClick);setMode(mode);
    return {getView:()=>({mode}),destroy(){destroyed=true;root?.removeEventListener?.('click',onClick);for(const timer of timers)global.clearTimeout(timer);for(const url of urls)global.URL.revokeObjectURL(url);timers.clear();urls.clear();}};
  }
  const api=Object.freeze({html,mount,svg});global.ResultPassport=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
