/* Unscored A/B experiment for the existing engineering mission.
 * mount(slot, {draft, view?, onApply?}) fills that dedicated slot.
 * A is a presentation-only copy; B is supplied by the host's current draft.
 * getView() -> {reference:{thickness,ribs}|null}; update(draft); destroy().
 */
(function (global) {
  'use strict';
  const METRICS = [
    {id:'strength',label:'Прочность',op:'≥',threshold:15},
    {id:'cost',label:'Стоимость',op:'≤',threshold:16},
    {id:'weight',label:'Масса',op:'≤',threshold:16}
  ];
  const safe = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parameters(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!Number.isInteger(value.thickness) || value.thickness < 1 || value.thickness > 5 ||
        !Number.isInteger(value.ribs) || value.ribs < 0 || value.ribs > 4) return null;
    return {thickness:value.thickness,ribs:value.ribs};
  }
  function evaluate(value) {
    const draft = parameters(value);
    if (!draft) return null;
    const t=draft.thickness,r=draft.ribs;
    const values={strength:2*t+3*r,cost:3*t+2*r,weight:4*t+r};
    const conditions=METRICS.map(m => ({id:m.id,passed:m.id==='strength'?values[m.id]>=m.threshold:values[m.id]<=m.threshold}));
    return {values,conditions,passedCount:conditions.filter(x=>x.passed).length};
  }
  function copy(value) { return value ? {thickness:value.thickness,ribs:value.ribs} : null; }
  function schematic(draft,letter) {
    if (!draft) return '<div class="ec-scheme ec-scheme-empty" aria-hidden="true"><span>'+letter+'</span><p>'+(letter==='A'?'Зафиксируй исходный вариант':'Параметры недоступны')+'</p></div>';
    const h=3+draft.thickness*1.8;
    const ribs=Array.from({length:draft.ribs},(_,i)=>{
      const x=67+i*21;
      return '<path d="M'+x+' 72V36l24 36z" fill="#81a3ff" stroke="#eef4ff" stroke-width="1.5"/>';
    }).join('');
    return '<svg class="ec-scheme" viewBox="0 0 210 115" role="img" aria-label="Учебная схема '+letter+': толщина '+draft.thickness+' мм, рёбер '+draft.ribs+'. Размеры показаны условно."><path d="M20 83h138l30-20H50z" fill="#b9ccff"/><path d="M20 83h138v'+h+'H20z" fill="#2355ed"/><path d="m158 83 30-20v'+h+'l-30 20z" fill="#173baf"/><path d="M50 26h110v42H50z" fill="#315de6"/>'+ribs+'<path d="M50 26h110l5-4H55z" fill="#b9ccff"/><path d="M50 26v42h'+(2+draft.thickness)+'V26z" fill="#d3dfff"/></svg>';
  }
  function variant(draft,letter,subtitle,esc) {
    const result=evaluate(draft);
    return '<div class="ec-variant ec-variant-'+letter.toLowerCase()+'"><div class="ec-variant-head"><span class="ec-letter">'+letter+'</span><strong>'+subtitle+'</strong></div>'+schematic(draft,letter)+
      '<p class="ec-parameters">'+(draft?'t = <b>'+esc(draft.thickness)+'</b> мм <span>·</span> рёбра: <b>'+esc(draft.ribs)+'</b>':letter==='A'?'Параметры пока не зафиксированы':'Нужны целые t от 1 до 5 и r от 0 до 4')+'</p>'+
      '<p class="ec-condition-count">'+(result?'Выполнено условий: <strong>'+result.passedCount+' из 3</strong>':letter==='A'?'Вариант A появится после фиксации':'Расчёт появится с допустимыми параметрами')+'</p></div>';
  }
  function cell(result,metric) {
    if (!result) return '<td><span class="ec-unknown" aria-label="Нет расчёта для варианта">—</span></td>';
    const pass=result.conditions.find(x=>x.id===metric.id).passed;
    return '<td class="'+(pass?'ec-condition-pass':'ec-condition-miss')+'"><strong>'+result.values[metric.id]+'</strong><span class="ec-condition-icon" aria-hidden="true">'+(pass?'✓':'○')+'</span><span class="ec-sr-only">'+(pass?'Условие выполнено':'Условие пока не выполнено')+'</span></td>';
  }
  function body(draft,reference,esc,canApply) {
    const a=evaluate(reference),b=evaluate(draft);
    const table='<table class="ec-table"><caption class="ec-sr-only">Расчёт условной модели: вариант A, текущий вариант B и изменение B минус A</caption><thead><tr><th scope="col">Показатель</th><th scope="col">A</th><th scope="col">B</th><th scope="col"><span aria-hidden="true">Δ B−A</span><span class="ec-sr-only">Изменение: B минус A</span></th></tr></thead><tbody>'+METRICS.map(m=>{
      const delta=a&&b?b.values[m.id]-a.values[m.id]:null;
      return '<tr><th scope="row">'+m.label+'<small>'+m.op+' '+m.threshold+'</small></th>'+cell(a,m)+cell(b,m)+'<td class="ec-delta">'+(delta===null?'—':delta>0?'+'+delta:String(delta))+'</td></tr>';
    }).join('')+'</tbody></table>';
    return '<header class="ec-heading"><div><p class="ec-kicker">ЭКСПЕРИМЕНТ С КОНСТРУКЦИЕЙ</p><h3>Что изменилось в твоём варианте?</h3><p>Зафиксируй вариант A, измени один параметр в ползунках и сравни текущий вариант B.</p></div><span class="ec-experiment-badge">Сравнение без проверки</span></header>'+
      '<div class="ec-variants">'+variant(reference,'A','Опорный вариант',esc)+variant(draft,'B','Сейчас в ползунках',esc)+'</div>'+
      '<div class="ec-actions"><button type="button" data-ec-action="capture"'+(!draft?' disabled':'')+'>'+(reference?'Обновить вариант A':'Зафиксировать вариант A')+'</button><button type="button" data-ec-action="apply"'+(!reference||!canApply?' disabled':'')+'>Вернуть A в ползунки</button><button type="button" class="ec-clear" data-ec-action="clear"'+(!reference?' disabled':'')+'>Очистить сравнение</button></div>'+
      table+'<p class="ec-delta-help">Δ показывает изменение B относительно A. У прочности задан минимум, у стоимости и массы — максимум. <span>✓ условие выполнено · ○ пока не выполнено</span></p>'+
      '<div class="ec-task-note"><strong>Проверь все три условия одновременно.</strong><p>Толщина измеряется в мм; прочность, стоимость и масса — в условных единицах. Схемы показывают параметры условно. Это игровая модель, по ней нельзя рассчитывать реальные детали.</p></div>'+
      '<p class="ec-memory-note">Вариант A хранится до перезагрузки вкладки. В файл работы входит текущий вариант B. Чтобы записать проверенную попытку, нажми «Проверить решение».</p>';
  }
  function html(options={}) {
    const esc=typeof options.esc==='function'?options.esc:safe,draft=parameters(options.draft),reference=parameters(options.view&&options.view.reference);
    return '<section class="ec-card" aria-label="Сравнение инженерных вариантов A и B"><div class="ec-body">'+body(draft,reference,esc,options.canApply!==false)+'</div><p class="ec-live ec-sr-only" role="status" aria-live="polite" aria-atomic="true"></p></section>';
  }
  function mount(container,options={}) {
    if (!container || typeof container.addEventListener!=='function') throw new Error('EngineeringCompare needs a container.');
    let draft=parameters(options.draft),reference=parameters(options.view&&options.view.reference),destroyed=false;
    const canApply=typeof options.onApply==='function';
    container.innerHTML=html({draft,view:{reference},canApply});
    const content=container.querySelector('.ec-body'),live=container.querySelector('.ec-live');
    function render(message,focusAction) {
      if (destroyed) return;
      const active=container.ownerDocument&&container.ownerDocument.activeElement;
      const previous=active&&container.contains(active)&&active.dataset?active.dataset.ecAction:null;
      content.innerHTML=body(draft,reference,safe,canApply);
      if (message) live.textContent=message;
      const action=focusAction||previous;
      if (action) {
        let target=container.querySelector('[data-ec-action="'+action+'"]');
        if (!target||target.disabled) target=container.querySelector('[data-ec-action="capture"]');
        if (target&&!target.disabled&&typeof target.focus==='function') target.focus({preventScroll:true});
      }
    }
    function onClick(event) {
      const target=event.target&&event.target.closest?event.target.closest('[data-ec-action]'):null;
      if (destroyed||!target||!container.contains(target)||target.disabled) return;
      if (typeof event.preventDefault==='function') event.preventDefault();
      const action=target.dataset.ecAction;
      if (action==='capture'&&draft) {
        reference=copy(draft);
        render('Вариант A зафиксирован: толщина '+reference.thickness+' мм, рёбер '+reference.ribs+'. Теперь измени вариант B.','capture');
      } else if (action==='clear') {
        reference=null;
        render('Сравнение очищено. Текущий вариант B остался в ползунках.','capture');
      } else if (action==='apply'&&reference&&canApply) {
        const next=copy(reference);
        options.onApply(copy(next));
        if (destroyed) return;
        draft=next;
        render('Вариант A возвращён в ползунки. Для новой проверенной попытки нажми «Проверить решение».','apply');
      }
    }
    container.addEventListener('click',onClick);
    return {
      getView(){return {reference:copy(reference)};},
      update(nextDraft){
        if (destroyed) return;
        const next=parameters(nextDraft);
        if ((next&&draft&&next.thickness===draft.thickness&&next.ribs===draft.ribs) || (!next&&!draft)) return;
        draft=next;
        const result=evaluate(draft);
        render(result?'Вариант B: прочность '+result.values.strength+', стоимость '+result.values.cost+', масса '+result.values.weight+'. Выполнено условий: '+result.passedCount+' из 3.':'Текущие параметры недоступны для сравнения.');
      },
      destroy(){if(destroyed)return;destroyed=true;container.removeEventListener('click',onClick);}
    };
  }
  const api={html,mount,evaluate};
  global.EngineeringCompare=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
