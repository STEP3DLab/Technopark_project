'use strict';

// Local estimates use only the user's quantities and rates. Applying a price,
// publishing a source fact and saving a document remain separate actions.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./estimate-utils.js'));
  else root.ExpertEstimateUI = factory(root.ExpertEstimateUtils);
})(typeof window === 'undefined' ? globalThis : window, function (C) {
  const LINE_FIELDS = ['type','name','quantity','unit','rateRub'];
  const ADJUSTMENTS = ['overheadPct','reservePct','markupPct','vatPct'];
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  const emptyLine = line => ['name','quantity','unit','rateRub'].every(key => String(line[key] ?? '').trim() === '');
  function rowResult(line) {return C.calculateEstimate({...C.emptyEstimate(),lines:[line]});}
  function breakdown(estimate) {
    const section = type => {
      const lines=estimate.lines.filter(line=>line.type===type);
      if(!lines.length)return {valid:true,value:0};
      const result=C.calculateEstimate({...C.emptyEstimate(),lines});
      return {valid:result.valid,value:result.valid?result.totals.direct:null};
    };
    return {labor:section('labor'),expense:section('expense'),complete:estimate.lines.filter(line=>rowResult(line).valid).length,total:estimate.lines.length};
  }
  function savedEntries(estimates,query='',sort='recent') {
    const words=normalize(query).split(' ').filter(Boolean);
    const entries=Object.entries(estimates).filter(([id,value])=>{
      const haystack=normalize([id,value.recordTitle,value.caseNumber,value.notes].join(' '));
      return words.every(word=>haystack.includes(word));
    });
    const title=value=>value.recordTitle||value.caseNumber||'';
    if(sort==='title')entries.sort(([id,a],[other,b])=>title(a).localeCompare(title(b),'ru')||id.localeCompare(other));
    else if(sort==='amount-asc'||sort==='amount-desc'){
      const totals=new Map(entries.map(([id,value])=>{const result=C.calculateEstimate(value);return [id,result.valid?result.totals.total:null];}));
      entries.sort(([id],[other])=>{
        const a=totals.get(id),b=totals.get(other);
        if(a===null||b===null)return a===null&&b===null?id.localeCompare(other):a===null?1:-1;
        return (sort==='amount-asc'?a-b:b-a)||id.localeCompare(other);
      });
    }else entries.sort(([id,a],[other,b])=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||id.localeCompare(other));
    return entries;
  }
  // Undo reverses row structure while retaining edits to surviving rows. New
  // rows removed by undo are detected separately, so their later edits need consent.
  function undoRows(current,before,after) {
    const live=new Map(current.map(line=>[line.id,line]));
    const beforeIds=new Set(before.map(line=>line.id));
    const afterMap=new Map(after.map(line=>[line.id,line]));
    const changedAdded=current.some(line=>!beforeIds.has(line.id)&&afterMap.has(line.id)&&JSON.stringify(line)!==JSON.stringify(afterMap.get(line.id)));
    return {lines:before.map(line=>structuredClone(live.get(line.id)||line)),changedAdded};
  }

  function create(A) {
    const doc=A.document||document;
    const ask=A.confirm||(message=>window.confirm(message));
    const $=selector=>doc.querySelector(selector);
    const {esc,icon,money}=A;
    let recordId=null,draft=null,baseline=null,returnFocus=null,undoEdit=null,showRequired=false;
    let savedSearch='',savedSort='recent';
    const clone=value=>structuredClone(value);
    const comparable=value=>{const copy=clone(value);delete copy.updatedAt;return JSON.stringify(copy);};
    const uid=()=>'item-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
    const newLine=type=>({id:uid(),type,name:'',quantity:'',unit:'',rateRub:''});

    function capture() {
      if(!draft)return null;
      const next=clone(draft);
      for(const input of doc.querySelectorAll('[data-estimate-line]')){
        const line=next.lines.find(row=>row.id===input.dataset.estimateLine);
        if(line&&LINE_FIELDS.includes(input.dataset.estimateField))line[input.dataset.estimateField]=input.value;
      }
      for(const key of ADJUSTMENTS)if($('#estimate-'+key))next[key]=$('#estimate-'+key).value;
      if($('#estimate-notes'))next.notes=$('#estimate-notes').value;
      return next;
    }
    function dirty(){return !!draft&&comparable(capture())!==baseline;}
    function applySnapshot(snapshot){if(recordId&&$('#estimate-dialog').open)snapshot.estimates[recordId]={...capture(),updatedAt:new Date().toISOString()};return snapshot;}
    function report(errors){const first=errors.slice(0,3).map(error=>{const match=/^lines\.(\d+)\./.exec(error.field);return(match?'Строка '+(Number(match[1])+1)+': ':'')+error.message;});return first.join(' ')+(errors.length>3?' Ещё ошибок: '+(errors.length-3)+'.':'');}
    function amountForLine(line){const result=rowResult(line);return result.valid?money(result.totals.direct):'—';}
    function errorNodeId(index,key){return 'estimate-error-'+index+'-'+key;}
    function rowMarkup(line,index){
      const attr=field=>`data-estimate-line="${esc(line.id)}" data-estimate-field="${field}" aria-describedby="${errorNodeId(index,field)}"`;
      const feedback=field=>`<span id="${errorNodeId(index,field)}" class="estimate-field-error" hidden></span>`;
      const action=(key,label,content,disabled=false)=>`<button class="icon-button" type="button" data-action="estimate-${key}" data-line-id="${esc(line.id)}" aria-label="${label}: строка ${index+1}" title="${label}"${disabled?' disabled':''}>${content}</button>`;
      return `<tr class="estimate-row"><td data-label="Работа или расход"><label class="sr-only" for="estimate-name-${index}">Наименование строки ${index+1}</label><input id="estimate-name-${index}" ${attr('name')} maxlength="1000" value="${esc(line.name)}" placeholder="Например: осмотр и обмеры">${feedback('name')}<select id="estimate-type-${index}" ${attr('type')} aria-label="Тип строки ${index+1}">${A.option('labor','Работа',line.type)}${A.option('expense','Расход',line.type)}</select>${feedback('type')}</td><td data-label="Количество"><input id="estimate-quantity-${index}" ${attr('quantity')} inputmode="decimal" maxlength="100" value="${esc(line.quantity)}" aria-label="Количество строки ${index+1}" placeholder="0">${feedback('quantity')}<input id="estimate-unit-${index}" ${attr('unit')} maxlength="40" value="${esc(line.unit)}" aria-label="Единица строки ${index+1}" placeholder="ч, выезд, шт.">${feedback('unit')}</td><td data-label="Ставка, ₽"><input id="estimate-rateRub-${index}" ${attr('rateRub')} inputmode="decimal" maxlength="100" value="${esc(line.rateRub)}" aria-label="Ставка строки ${index+1}, рублей" placeholder="Ваша ставка">${feedback('rateRub')}</td><td data-label="Сумма, ₽" class="estimate-line-total" data-estimate-total="${esc(line.id)}">${esc(amountForLine(line))}</td><td data-label="Действия"><div class="estimate-row-actions">${action('duplicate','Дублировать строку',icon('copy'),draft.lines.length>=100)}${action('up','Поднять строку','<span aria-hidden="true">↑</span>',index===0)}${action('down','Опустить строку','<span aria-hidden="true">↓</span>',index===draft.lines.length-1)}${action('remove','Удалить строку',icon('trash'))}</div></td></tr>`;
    }
    function progressMarkup(current){const stats=breakdown(current);return `<span>Заполнено ${stats.complete} из ${stats.total} строк</span><progress max="${Math.max(1,stats.total)}" value="${stats.complete}" aria-label="Заполнено ${stats.complete} из ${stats.total} строк"></progress>`;}
    function totalsMarkup(result,current=draft){
      const stats=breakdown(current);
      const entries=[['direct','Работы и расходы'],['overhead','Накладные расходы'],['reserve','Резерв'],['markup','Наценка'],['net','Цена до НДС'],['vat','НДС по введённой ставке'],['total','Расчётная цена']];
      return `<dl><div class="estimate-subtotal"><dt>Работы отдельно</dt><dd>${stats.labor.valid?esc(money(stats.labor.value)):'—'}</dd></div><div class="estimate-subtotal"><dt>Расходы отдельно</dt><dd>${stats.expense.valid?esc(money(stats.expense.value)):'—'}</dd></div>${entries.map(([key,label])=>`<div class="${key==='total'?'estimate-total':''}"><dt>${label}</dt><dd>${result.valid?esc(money(result.totals[key])):'—'}</dd></div>`).join('')}</dl>`;
    }
    function fieldForError(error){
      const match=/^lines\.(\d+)\.(\w+)/.exec(error.field);
      if(match){const key=match[2]==='total'?'rateRub':match[2];return {node:$('#estimate-'+key+'-'+match[1]),feedback:$('#'+errorNodeId(match[1],key))};}
      return {node:$('#estimate-'+error.field),feedback:$('#estimate-error-'+error.field)};
    }
    function updateValidation(result){
      for(const input of doc.querySelectorAll('[data-estimate-line]'))input.removeAttribute('aria-invalid');
      for(const key of ADJUSTMENTS)$('#estimate-'+key)?.removeAttribute('aria-invalid');
      for(const feedback of doc.querySelectorAll('[data-estimate-validation]')){feedback.textContent='';feedback.hidden=true;}
      for(let i=0;i<draft.lines.length;i++)for(const key of LINE_FIELDS){const feedback=$('#'+errorNodeId(i,key));if(feedback){feedback.textContent='';feedback.hidden=true;}}
      const errors=showRequired?result.errors:C.validateEstimate(draft,{allowIncomplete:true}).errors;
      for(const error of errors){const {node,feedback}=fieldForError(error);if(node)node.setAttribute('aria-invalid','true');if(feedback){feedback.textContent=error.message;feedback.hidden=false;}}
      $('#estimate-errors').textContent=result.valid?'Расчёт заполнен. Проверьте исходные данные перед использованием.':report(result.errors);
      const button=$('#estimate-first-error');if(button)button.hidden=result.valid;
    }
    function firstError(){
      draft=capture();const result=C.calculateEstimate(draft);showRequired=true;updateValidation(result);
      const target=result.errors.map(fieldForError).find(value=>value.node)?.node||$('#estimate-errors');
      target?.focus({preventScroll:true});target?.scrollIntoView?.({block:'center',behavior:'auto'});
    }
    function renderEditor(){
      const result=C.calculateEstimate(draft);
      const adjustments=[['overheadPct','Накладные расходы, %','От суммы работ и расходов'],['reservePct','Резерв, %','После накладных расходов'],['markupPct','Наценка, %','После накладных расходов и резерва'],['vatPct','НДС для расчёта, %','От итоговой цены до НДС']];
      const other=savedEntries(A.workspace().estimates).filter(([id])=>id!==recordId);
      $('#estimate-content').innerHTML=`<header class="estimate-header"><div><p class="eyebrow">ЛИЧНЫЙ РАСЧЁТ</p><h2 id="estimate-title">Расчёт стоимости</h2><p>${esc(draft.recordTitle||'Запись вне текущего реестра')}${draft.caseNumber?' · № '+esc(draft.caseNumber):''}</p></div><button class="icon-button" type="button" data-action="estimate-close" aria-label="Закрыть расчёт">${icon('close')}</button></header><div class="estimate-body"><p class="profile-note">Введите свои объёмы, ставки и расходы. Опубликованная сумма закупки не подставляется в расчёт. Сохранение расчёта и перенос итоговой цены — отдельные действия.</p><form id="estimate-form"><div class="estimate-toolbar"><button class="button secondary small" type="button" data-action="estimate-add-work">${icon('plus')}Работа</button><button class="button secondary small" type="button" data-action="estimate-add-expense">${icon('plus')}Расход</button><button class="button ghost small" type="button" data-action="estimate-template">Типовые этапы</button><button class="button ghost small" type="button" data-action="estimate-clear-empty">Убрать пустые строки</button><button class="button ghost small" type="button" data-action="estimate-undo"${undoEdit?'':' disabled'}>Отменить действие со строками</button><span>${draft.lines.length} / 100 строк</span></div><div id="estimate-progress" class="estimate-progress" role="status">${progressMarkup(draft)}</div>${other.length?`<details class="estimate-copy-source"><summary>Взять за основу сохранённый расчёт</summary><p class="field-hint">Скопируются строки, надбавки и заметка. Проверьте объёмы и ставки для этой записи. Исходный расчёт не меняется.</p><div class="estimate-copy-controls"><label class="sr-only" for="estimate-source">Сохранённый расчёт</label><select id="estimate-source"><option value="">Выберите расчёт</option>${other.map(([id,value])=>A.option(id,(value.caseNumber?value.caseNumber+' · ':'')+(value.recordTitle||id),'')).join('')}</select><button class="button secondary small" type="button" data-action="estimate-copy-saved">Взять за основу</button></div></details>`:''}<div class="estimate-table-wrap"><table class="estimate-table"><caption class="sr-only">Количество, ставка и стоимость работ и расходов</caption><thead><tr><th scope="col">Работа или расход</th><th scope="col">Количество / ед.</th><th scope="col">Ставка, ₽</th><th scope="col">Сумма, ₽</th><th scope="col">Действия</th></tr></thead><tbody>${draft.lines.map(rowMarkup).join('')}</tbody></table></div><div class="estimate-summary"><section><h3>Надбавки и налоги</h3><div class="profile-grid">${adjustments.map(([key,label,hint])=>`<div class="field"><label for="estimate-${key}">${label}</label><input id="estimate-${key}" inputmode="decimal" maxlength="100" value="${esc(draft[key]??'0')}" aria-describedby="hint-${key} estimate-error-${key}"><p class="field-hint" id="hint-${key}">${hint}</p><span id="estimate-error-${key}" data-estimate-validation class="estimate-field-error" hidden></span></div>`).join('')}</div><p class="field-hint">Нулевая ставка означает только отсутствие добавленной суммы в этом расчёте. Налоговую формулировку предложения укажите отдельно.</p></section><section id="estimate-totals" aria-live="polite">${totalsMarkup(result)}</section></div><div class="estimate-validation-summary"><p id="estimate-errors" class="field-hint" role="status" tabindex="-1"></p><button id="estimate-first-error" class="link-button" type="button" data-action="estimate-first-error"${result.valid?' hidden':''}>К первому незаполненному или неверному полю</button></div><details class="estimate-formula"><summary>Как считается итог</summary><p>Каждая строка: количество × ставка, с округлением до копеек. Накладные расходы считаются от суммы строк. Резерв — от суммы с накладными расходами. Наценка — от суммы с накладными расходами и резервом. НДС по вашей ставке добавляется к полученной цене. Каждый этап округляется до копеек.</p></details><div class="field"><label for="estimate-notes">Допущения и рабочая заметка</label><textarea id="estimate-notes" maxlength="20000" rows="4" placeholder="Что входит в цену, какие объёмы предстоит уточнить…">${esc(draft.notes||'')}</textarea></div><div class="estimate-export-tools"><span>Файлы содержат ваши ставки и заметку.</span><button class="button ghost small" type="button" data-action="estimate-txt">${icon('down')}TXT</button><button class="button ghost small" type="button" data-action="estimate-print">${icon('print')}Печать / PDF</button><button class="button ghost small" type="button" data-action="estimate-csv"${result.valid?'':' disabled'}>${icon('down')}CSV</button></div></form></div><footer class="estimate-footer"><p id="estimate-save-state" role="status">${comparable(draft)!==baseline?'Есть несохранённые изменения':draft.updatedAt?'Сохранённый расчёт · '+esc(A.formatDate(draft.updatedAt,true)):'Новый расчёт — ставки и объёмы нужно заполнить'}</p><div class="button-row"><button class="button ghost small" type="button" data-action="backup">${icon('down')}Копия правок</button><button class="button secondary" type="button" data-action="estimate-save">${icon('save')}Сохранить расчёт</button><button class="button primary" type="button" data-action="estimate-apply"${result.valid&&result.totals.total>0?'':' disabled'}>Перенести цену${icon('arrow')}</button></div></footer>`;
      updateValidation(result);
    }
    function open(id){
      const record=A.getRecord(id),saved=A.workspace().estimates[id];
      if(!record&&!saved){A.notify('Запись для расчёта не найдена.');return;}
      recordId=id;draft=saved?clone(saved):C.emptyEstimate();undoEdit=null;showRequired=false;
      if(record){draft.recordTitle=record.title||'';draft.caseNumber=record.caseNumber||'';}
      baseline=comparable(draft);returnFocus=doc.activeElement;renderEditor();draft=capture();baseline=comparable(draft);$('#estimate-dialog').showModal();$('#estimate-name-0')?.focus();
    }
    function close(){if(dirty()&&!ask('Закрыть расчёт без сохранения изменений?'))return false;$('#estimate-dialog').close();return true;}
    function currentForSave(){const current=capture();if(!current)return null;const check=C.validateEstimate(current,{allowIncomplete:true});if(!check.valid){A.notify(report(check.errors));return null;}return {...current,updatedAt:new Date().toISOString()};}
    function save(applyPrice=false){
      const current=currentForSave();if(!current)return false;
      const result=C.calculateEstimate(current);
      if(applyPrice&&(!result.valid||result.totals.total<=0)){A.notify('Для переноса цены заполните все строки и получите сумму больше нуля.');firstError();return false;}
      const old=A.workspace().notes[recordId]?.proposalRub;
      if(applyPrice&&old!==null&&old!==undefined&&Number(old)!==result.totals.total&&!ask('Заменить вашу цену '+money(old)+' на '+money(result.totals.total)+' в карточке? Сохранённые предложения останутся отдельными версиями.'))return false;
      const next=clone(A.workspace());next.estimates[recordId]=current;
      if(applyPrice)next.notes[recordId]={...(next.notes[recordId]||{}),proposalRub:result.totals.total,updatedAt:current.updatedAt};
      if(!A.persist(next))return false;
      draft=clone(current);baseline=comparable(draft);
      if(applyPrice)A.onApplied?.(recordId,result.totals.total);
      A.render();A.notify(applyPrice?'Расчёт сохранён, итог перенесён в вашу цену карточки.':'Расчёт сохранён в этом браузере.');return true;
    }
    function updateCalculation(){
      const result=C.calculateEstimate(draft);$('#estimate-totals').innerHTML=totalsMarkup(result);updateValidation(result);
      $('#estimate-progress').innerHTML=progressMarkup(draft);
      for(const cell of doc.querySelectorAll('[data-estimate-total]')){const line=draft.lines.find(row=>row.id===cell.dataset.estimateTotal);if(line)cell.textContent=amountForLine(line);}
      for(const button of doc.querySelectorAll('[data-action="estimate-apply"]'))button.disabled=!result.valid||result.totals.total<=0;
      for(const button of doc.querySelectorAll('[data-action="estimate-csv"]'))button.disabled=!result.valid;
      $('#estimate-save-state').textContent=dirty()?'Есть несохранённые изменения':'Изменений нет';
    }
    function input(event){
      if(event.target.id==='estimate-saved-search'){savedSearch=event.target.value;renderSavedResults();return true;}
      if(event.target.id==='estimate-saved-sort'){if(['recent','title','amount-asc','amount-desc'].includes(event.target.value))savedSort=event.target.value;renderSavedResults();return true;}
      if(!$('#estimate-dialog').open||(!event.target.dataset.estimateLine&&!ADJUSTMENTS.some(key=>event.target.id==='estimate-'+key)&&event.target.id!=='estimate-notes'))return false;
      draft=capture();updateCalculation();return true;
    }
    function structuralChange(change,focusId){
      const before=clone(draft.lines);change();undoEdit={before,after:clone(draft.lines)};renderEditor();
      const index=draft.lines.findIndex(line=>line.id===focusId);$('#estimate-name-'+Math.max(0,index))?.focus();
    }
    function addLine(type){draft=capture();if(draft.lines.length>=100){A.notify('В одном расчёте можно сохранить до 100 строк.');return;}const line=newLine(type);structuralChange(()=>draft.lines.push(line),line.id);}
    function addTemplate(){
      draft=capture();const template=[['labor','Изучение материалов'],['labor','Осмотр и обмеры'],['labor','Обработка данных'],['labor','Расчёты и анализ'],['labor','Подготовка заключения'],['expense','Транспорт и доступ к объекту']];
      const replaceEmpty=draft.lines.length===1&&emptyLine(draft.lines[0]);
      if(draft.lines.length-(replaceEmpty?1:0)+template.length>100){A.notify('Недостаточно места: максимум 100 строк.');return;}
      structuralChange(()=>{if(replaceEmpty)draft.lines=[];draft.lines.push(...template.map(([type,name])=>({...newLine(type),name})));});A.notify('Добавлены названия этапов. Объёмы и ставки укажите самостоятельно.');
    }
    function editRows(key,id){
      draft=capture();const index=draft.lines.findIndex(line=>line.id===id);if(index<0)return;
      const line=draft.lines[index];
      if(key==='duplicate'){
        if(draft.lines.length>=100){A.notify('В одном расчёте можно сохранить до 100 строк.');return;}
        const copy={...clone(line),id:uid()};structuralChange(()=>draft.lines.splice(index+1,0,copy),copy.id);A.notify('Строка скопирована. Проверьте объём и ставку.');
      }else if(key==='up'||key==='down'){
        const target=index+(key==='up'?-1:1);if(target<0||target>=draft.lines.length)return;
        structuralChange(()=>{draft.lines.splice(index,1);draft.lines.splice(target,0,line);},id);
      }else if(key==='remove'){
        if(!emptyLine(line)&&!ask('Удалить строку «'+(line.name||'без названия')+'» из расчёта?'))return;
        const focus=draft.lines[index+1]?.id||draft.lines[index-1]?.id;
        structuralChange(()=>{draft.lines.splice(index,1);if(!draft.lines.length)draft.lines=[newLine('labor')];},focus);
      }
    }
    function clearEmpty(){
      draft=capture();const count=draft.lines.filter(emptyLine).length;
      if(!count||count===1&&draft.lines.length===1){A.notify('Лишних пустых строк нет.');return;}
      if(!ask('Убрать пустые строки: '+count+'? Строки с названием, единицей или введённым числом останутся.'))return;
      structuralChange(()=>{draft.lines=draft.lines.filter(line=>!emptyLine(line));if(!draft.lines.length)draft.lines=[newLine('labor')];});A.notify('Пустые строки убраны. Действие можно отменить.');
    }
    function undo(){
      if(!undoEdit)return;draft=capture();const previous=undoRows(draft.lines,undoEdit.before,undoEdit.after);
      if(previous.changedAdded&&!ask('После последнего действия вы изменили добавленные строки. Отмена удалит эти строки вместе с последними правками. Продолжить?'))return;
      draft.lines=previous.lines;undoEdit=null;renderEditor();$('#estimate-name-0')?.focus();A.notify('Последнее действие со строками отменено. Правки сохранившихся строк оставлены.');
    }
    function copySaved(){
      const id=$('#estimate-source')?.value,saved=A.workspace().estimates[id];if(!saved||id===recordId){A.notify('Сначала выберите другой сохранённый расчёт.');return;}
      const current=capture();
      if(!ask('Взять за основу расчёт «'+(saved.caseNumber||saved.recordTitle||id)+'»? Текущие строки, надбавки и заметка будут заменены. Изменение нужно сохранить отдельно.'))return;
      draft={...clone(saved),recordTitle:current.recordTitle||'',caseNumber:current.caseNumber||''};
      draft.lines=draft.lines.map(line=>({...line,id:uid()}));delete draft.updatedAt;undoEdit=null;showRequired=false;
      renderEditor();$('#estimate-name-0')?.focus();A.notify('Основа скопирована. Проверьте объёмы и ставки для этой записи; расчёт ещё не сохранён.');
    }
    function exportCsv(){
      const current=capture(),result=current&&C.calculateEstimate(current);
      if(!result?.valid){A.notify('Для выгрузки заполните корректные строки расчёта.');return;}
      const stats=breakdown(current);
      const rows=[['ЛИЧНЫЙ РАСЧЁТ СТОИМОСТИ'],['Предмет',current.recordTitle],['Номер',current.caseNumber],['Тип','Наименование','Количество','Единица','Ставка, ₽','Сумма, ₽'],...current.lines.map(line=>[line.type==='labor'?'Работа':'Расход',line.name,line.quantity,line.unit,line.rateRub,result.lines.find(value=>value.id===line.id)?.totalRub]),[],['Показатель','Процент','Сумма, ₽'],['Работы отдельно','',stats.labor.value],['Расходы отдельно','',stats.expense.value],['Работы и расходы','',result.totals.direct],['Накладные расходы',current.overheadPct,result.totals.overhead],['Резерв',current.reservePct,result.totals.reserve],['Наценка',current.markupPct,result.totals.markup],['Цена до НДС','',result.totals.net],['НДС',current.vatPct,result.totals.vat],['Расчётная цена','',result.totals.total],[],['Допущения и заметка',current.notes],['Основание','Количество, ставки и проценты введены пользователем; это не опубликованный бюджет и не подтверждённая рыночная цена.']];
      A.download('msk-expert-estimate-'+A.safeFilename(current.caseNumber||recordId)+'.csv',A.csv(rows),'text/csv;charset=utf-8');A.notify('Расчёт выгружен. Файл содержит ваши ставки, расходы и рабочую заметку.');
    }
    function exportData(){
      const current=capture(),check=current&&C.validateEstimate(current,{allowIncomplete:true});
      if(!check?.valid){A.notify('Перед выгрузкой исправьте неверные значения. '+report(check?.errors||[]));return null;}
      const result=C.calculateEstimate(current),stats=breakdown(current);
      const amount=value=>value===null?'Не рассчитано':money(value);
      const summary=[['Работы отдельно',stats.labor.value],['Расходы отдельно',stats.expense.value],['Работы и расходы',result.totals?.direct??null],['Накладные расходы ('+(current.overheadPct||'0')+'%)',result.totals?.overhead??null],['Резерв ('+(current.reservePct||'0')+'%)',result.totals?.reserve??null],['Наценка ('+(current.markupPct||'0')+'%)',result.totals?.markup??null],['Цена до НДС',result.totals?.net??null],['НДС ('+(current.vatPct||'0')+'%)',result.totals?.vat??null],['Расчётная цена',result.totals?.total??null]].map(([label,value])=>[label,amount(value)]);
      const rows=current.lines.map((line,index)=>[String(index+1),line.type==='labor'?'Работа':'Расход',line.name||'Не указано',String(line.quantity??'')||'Не указано',line.unit||'—',String(line.rateRub??'')||'Не указано',amountForLine(line)]);
      return {current,result,stats,rows,summary,label:result.valid?'ПРОЕКТ РАСЧЁТА. НЕ ОТПРАВЛЕН.':'НЕПОЛНЫЙ ПРОЕКТ РАСЧЁТА. НЕ ОТПРАВЛЕН.'};
    }
    function exportText(){
      const value=exportData();if(!value)return;
      const {current,rows,summary,label,stats}=value;
      const text=['РАСЧЁТ СТОИМОСТИ',label,'Личные данные: собственные ставки, расходы и рабочие допущения.','Предмет: '+(current.recordTitle||'Не указан'),'Номер: '+(current.caseNumber||'Не указан'),'Заполнено строк: '+stats.complete+' из '+stats.total,'',...rows.map(row=>row.join(' | ')),'',...summary.map(([key,amount])=>key+': '+amount),'','Допущения и рабочая заметка:',current.notes||'Не указаны','','Количество, ставки и проценты введены пользователем. Это не опубликованный бюджет и не подтверждённая рыночная цена.','Надбавки применены последовательно: накладные расходы, резерв, наценка, затем НДС. Каждый этап округлён до копеек.'].join('\n');
      A.download('msk-expert-estimate-'+A.safeFilename(current.caseNumber||recordId)+'.txt',text,'text/plain;charset=utf-8');A.notify('TXT расчёта выгружен. Он содержит ваши ставки и рабочую заметку.');
    }
    function printEstimate(){
      const value=exportData();if(!value)return;const target=$('#print-document');if(!target){A.notify('Печать недоступна. Скачайте TXT расчёта.');return;}
      const {current,rows,summary,label}=value;
      target.innerHTML=`<article class="estimate-print-document"><h1>Расчёт стоимости</h1><p class="estimate-print-status">${esc(label)}</p><p>Личные данные: собственные ставки, расходы и рабочие допущения.</p><h2>${esc(current.recordTitle||'Предмет не указан')}</h2><p>Номер: ${esc(current.caseNumber||'не указан')}</p><table><thead><tr>${['№','Тип','Наименование','Количество','Ед.','Ставка, ₽','Сумма'].map(title=>`<th scope="col">${title}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><dl>${summary.map(([key,amount])=>`<div><dt>${esc(key)}</dt><dd>${esc(amount)}</dd></div>`).join('')}</dl><h2>Допущения и рабочая заметка</h2><p class="estimate-print-notes">${esc(current.notes||'Не указаны')}</p><p>Количество, ставки и проценты введены пользователем. Это не опубликованный бюджет и не подтверждённая рыночная цена. Надбавки применены последовательно: накладные расходы, резерв, наценка, затем НДС. Каждый этап округлён до копеек.</p></article>`;
      doc.body.classList.add('print-proposal');
      try{if(A.print)A.print();else window.print();}catch{doc.body.classList.remove('print-proposal');target.innerHTML='';A.notify('Печать недоступна. Скачайте TXT расчёта.');}
    }
    function savedResults(){
      const list=savedEntries(A.workspace().estimates,savedSearch,savedSort);
      if(!list.length)return '<p class="estimate-saved-empty">По этому поиску расчётов нет. Измените название, номер или заметку в поиске.</p>';
      return `<ul class="drafts-list">${list.map(([id,estimate])=>{const result=C.calculateEstimate(estimate);return `<li class="draft-row">${icon('table')}<div><button class="draft-title" data-action="estimate-open" data-id="${esc(id)}">${esc(estimate.recordTitle||estimate.caseNumber||'Расчёт '+id)}</button><p>${result.valid?esc(money(result.totals.total)):'Неполный расчёт'}${!A.getRecord(id)?' · запись вне текущего реестра':''}</p></div><button class="icon-button" type="button" data-action="estimate-delete" data-id="${esc(id)}" aria-label="Удалить расчёт ${esc(estimate.caseNumber||estimate.recordTitle||id)}">${icon('trash')}</button></li>`;}).join('')}</ul>`;
    }
    function renderSavedResults(){if($('#estimate-saved-results'))$('#estimate-saved-results').innerHTML=savedResults();if($('#estimate-saved-count'))$('#estimate-saved-count').textContent=String(savedEntries(A.workspace().estimates,savedSearch,savedSort).length)+' / '+Object.keys(A.workspace().estimates).length;}
    function savedPanel(){
      const count=Object.keys(A.workspace().estimates).length;if(!count)return '';
      return `<section class="panel section-gap"><div class="panel-heading"><div><h2>Мои расчёты<span id="estimate-saved-count" class="panel-count" role="status">${savedEntries(A.workspace().estimates,savedSearch,savedSort).length} / ${count}</span></h2><p>Сохранённые объёмы, ставки и допущения, включая записи вне текущего реестра.</p></div></div><div class="estimate-saved-toolbar"><div class="field"><label for="estimate-saved-search">Найти расчёт</label><input id="estimate-saved-search" type="search" maxlength="1000" value="${esc(savedSearch)}" placeholder="Название, номер или заметка"></div><div class="field"><label for="estimate-saved-sort">Порядок расчётов</label><select id="estimate-saved-sort">${[['recent','Сначала обновлённые'],['title','По названию'],['amount-asc','Цена по возрастанию'],['amount-desc','Цена по убыванию']].map(([value,label])=>A.option(value,label,savedSort)).join('')}</select></div></div><div id="estimate-saved-results">${savedResults()}</div></section>`;
    }
    function handleAction(action){
      const key=action.dataset.action;
      if(key==='backup'&&$('#estimate-dialog').open){const check=C.validateEstimate(capture(),{allowIncomplete:true});if(!check.valid){A.notify('Перед созданием копии исправьте введённые числа. '+report(check.errors));return true;}return false;}
      if(!key.startsWith('estimate-'))return false;
      if(key==='estimate-delete'){
        const id=action.dataset.id,saved=A.workspace().estimates[id];if(!saved)return true;
        if(!ask('Удалить сохранённый расчёт «'+(saved.caseNumber||saved.recordTitle||id)+'»? Цена карточки и сохранённые предложения останутся.'))return true;
        const next=clone(A.workspace());delete next.estimates[id];if(A.persist(next)){A.render();A.notify('Расчёт удалён из этого браузера.');}return true;
      }
      if(key==='estimate-open'){if(A.beforeOpen&&!A.beforeOpen())return true;open(action.dataset.id);return true;}
      if(!draft)return true;
      if(key==='estimate-close')close();
      if(key==='estimate-save')save(false);
      if(key==='estimate-apply')save(true);
      if(key==='estimate-add-work')addLine('labor');
      if(key==='estimate-add-expense')addLine('expense');
      if(key==='estimate-template')addTemplate();
      if(key==='estimate-csv')exportCsv();
      if(key==='estimate-txt')exportText();
      if(key==='estimate-print')printEstimate();
      if(key==='estimate-first-error')firstError();
      if(key==='estimate-clear-empty')clearEmpty();
      if(key==='estimate-undo')undo();
      if(key==='estimate-copy-saved')copySaved();
      if(['estimate-remove','estimate-duplicate','estimate-up','estimate-down'].includes(key))editRows(key.slice(9),action.dataset.lineId);
      return true;
    }
    $('#estimate-dialog').addEventListener('cancel',event=>{event.preventDefault();close();});
    $('#estimate-dialog').addEventListener('close',()=>{const previousId=recordId;recordId=null;draft=null;baseline=null;undoEdit=null;const target=returnFocus?.isConnected?returnFocus:[...doc.querySelectorAll('[data-action="estimate-open"]')].find(button=>button.dataset.id===previousId)||$('#main');target?.focus({preventScroll:true});returnFocus=null;});
    return Object.freeze({handleAction,handleInput:input,handleChange:input,handleSubmit(event){if(event.target.id!=='estimate-form')return false;event.preventDefault();save(false);return true;},dirty,applySnapshot,savedPanel});
  }
  return Object.freeze({create,breakdown,savedEntries,undoRows,emptyLine});
});
