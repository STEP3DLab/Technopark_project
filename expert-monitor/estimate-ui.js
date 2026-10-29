'use strict';

// Browser editor for user-entered calculations. No rates are inferred from the
// published budget, and applying a total is a separate explicit action.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./estimate-utils.js'));
  else root.ExpertEstimateUI = factory(root.ExpertEstimateUtils);
})(typeof window === 'undefined' ? globalThis : window, function (C) {
  function create(A) {
    const doc = A.document || document;
    const ask = A.confirm || (message => window.confirm(message));
    const $ = selector => doc.querySelector(selector);
    const {esc,icon,money} = A;
    const fields = ['overheadPct','reservePct','markupPct','vatPct'];
    let recordId = null, draft = null, baseline = null, returnFocus = null;
    const clone = value => structuredClone(value);
    const comparable = value => {const copy=clone(value);delete copy.updatedAt;return JSON.stringify(copy);};
    const uid = () => 'item-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));

    function capture() {
      if(!draft)return null;
      const next=clone(draft);
      for(const input of doc.querySelectorAll('[data-estimate-line]')) {
        const line=next.lines.find(row=>row.id===input.dataset.estimateLine);
        if(line&&['type','name','quantity','unit','rateRub'].includes(input.dataset.estimateField))line[input.dataset.estimateField]=input.value;
      }
      for(const key of fields)if($('#estimate-'+key))next[key]=$('#estimate-'+key).value;
      if($('#estimate-notes'))next.notes=$('#estimate-notes').value;
      return next;
    }
    function dirty() {return !!draft&&comparable(capture())!==baseline;}
    function applySnapshot(snapshot) {if(recordId&&$('#estimate-dialog').open){snapshot.estimates[recordId]={...capture(),updatedAt:new Date().toISOString()};}return snapshot;}
    function report(errors) {
      const first=errors.slice(0,3).map(error=>{
        const match=/^lines\.(\d+)\./.exec(error.field);
        return (match?'Строка '+(Number(match[1])+1)+': ':'')+error.message;
      });
      return first.join(' ')+(errors.length>3?' Ещё ошибок: '+(errors.length-3)+'.':'');
    }
    function amountForLine(line) {
      const result=C.calculateEstimate({...C.emptyEstimate(),lines:[line]});
      return result.valid?money(result.totals.direct):'—';
    }
    function rowMarkup(line,index) {
      const attr=field=>`data-estimate-line="${esc(line.id)}" data-estimate-field="${field}"`;
      return `<tr class="estimate-row"><td data-label="Работа или расход"><label class="sr-only" for="estimate-name-${index}">Наименование строки ${index+1}</label><input id="estimate-name-${index}" ${attr('name')} maxlength="1000" value="${esc(line.name)}" placeholder="Например: осмотр и обмеры"><select ${attr('type')} aria-label="Тип строки ${index+1}">${A.option('labor','Работа',line.type)}${A.option('expense','Расход',line.type)}</select></td><td data-label="Количество"><input ${attr('quantity')} inputmode="decimal" maxlength="100" value="${esc(line.quantity)}" aria-label="Количество строки ${index+1}" placeholder="0"><input ${attr('unit')} maxlength="40" value="${esc(line.unit)}" aria-label="Единица строки ${index+1}" placeholder="ч, выезд, шт."></td><td data-label="Ставка, ₽"><input ${attr('rateRub')} inputmode="decimal" maxlength="100" value="${esc(line.rateRub)}" aria-label="Ставка строки ${index+1}, рублей" placeholder="Ваша ставка"></td><td data-label="Сумма, ₽" class="estimate-line-total" data-estimate-total="${esc(line.id)}">${esc(amountForLine(line))}</td><td data-label="Действие"><button class="icon-button" type="button" data-action="estimate-remove" data-line-id="${esc(line.id)}" aria-label="Удалить строку ${index+1}">${icon('trash')}</button></td></tr>`;
    }
    function totalsMarkup(result) {
      const entries=[['direct','Работы и расходы'],['overhead','Накладные расходы'],['reserve','Резерв'],['markup','Наценка'],['net','Цена до НДС'],['vat','НДС по введённой ставке'],['total','Расчётная цена']];
      return `<dl>${entries.map(([key,label])=>`<div class="${key==='total'?'estimate-total':''}"><dt>${label}</dt><dd>${result.valid?esc(money(result.totals[key])):'—'}</dd></div>`).join('')}</dl>`;
    }
    function renderEditor() {
      const result=C.calculateEstimate(draft);
      const adjustments=[['overheadPct','Накладные расходы, %','От суммы работ и расходов'],['reservePct','Резерв, %','После накладных расходов'],['markupPct','Наценка, %','После накладных расходов и резерва'],['vatPct','НДС для расчёта, %','От итоговой цены до НДС']];
      $('#estimate-content').innerHTML=`<header class="estimate-header"><div><p class="eyebrow">ЛИЧНЫЙ РАСЧЁТ</p><h2 id="estimate-title">Расчёт стоимости</h2><p>${esc(draft.recordTitle||'Запись вне текущего реестра')}${draft.caseNumber?' · № '+esc(draft.caseNumber):''}</p></div><button class="icon-button" type="button" data-action="estimate-close" aria-label="Закрыть расчёт">${icon('close')}</button></header><div class="estimate-body"><p class="profile-note">Введите свои объёмы, ставки и расходы. Опубликованная сумма закупки не подставляется в расчёт. Сохранение расчёта и перенос итоговой цены — отдельные действия.</p><form id="estimate-form"><div class="estimate-toolbar"><button class="button secondary small" type="button" data-action="estimate-add-work">${icon('plus')}Работа</button><button class="button secondary small" type="button" data-action="estimate-add-expense">${icon('plus')}Расход</button><button class="button ghost small" type="button" data-action="estimate-template">Типовые этапы</button><span>${draft.lines.length} / 100 строк</span></div><div class="estimate-table-wrap"><table class="estimate-table"><caption class="sr-only">Количество, ставка и стоимость работ и расходов</caption><thead><tr><th scope="col">Работа или расход</th><th scope="col">Количество / ед.</th><th scope="col">Ставка, ₽</th><th scope="col">Сумма, ₽</th><th scope="col"><span class="sr-only">Удаление</span></th></tr></thead><tbody>${draft.lines.map(rowMarkup).join('')}</tbody></table></div><div class="estimate-summary"><section><h3>Надбавки и налоги</h3><div class="profile-grid">${adjustments.map(([key,label,hint])=>`<div class="field"><label for="estimate-${key}">${label}</label><input id="estimate-${key}" inputmode="decimal" maxlength="100" value="${esc(draft[key]??'0')}" aria-describedby="hint-${key}"><p class="field-hint" id="hint-${key}">${hint}</p></div>`).join('')}</div><p class="field-hint">Нулевая ставка означает только отсутствие добавленной суммы в этом расчёте. Налоговую формулировку предложения укажите отдельно.</p></section><section id="estimate-totals" aria-live="polite">${totalsMarkup(result)}</section></div><p id="estimate-errors" class="field-hint" role="status">${result.valid?'Расчёт заполнен. Проверьте исходные данные перед использованием.':esc(report(result.errors))}</p><details class="estimate-formula"><summary>Как считается итог</summary><p>Каждая строка: количество × ставка, с округлением до копеек. Накладные расходы считаются от суммы строк. Резерв — от суммы с накладными расходами. Наценка — от суммы с накладными расходами и резервом. НДС по вашей ставке добавляется к полученной цене. Каждый этап округляется до копеек.</p></details><div class="field"><label for="estimate-notes">Допущения и рабочая заметка</label><textarea id="estimate-notes" maxlength="20000" rows="4" placeholder="Что входит в цену, какие объёмы предстоит уточнить…">${esc(draft.notes||'')}</textarea></div></form></div><footer class="estimate-footer"><p id="estimate-save-state" role="status">${comparable(draft)!==baseline?'Есть несохранённые изменения':draft.updatedAt?'Сохранённый расчёт · '+esc(A.formatDate(draft.updatedAt,true)):'Новый расчёт — ставки и объёмы нужно заполнить'}</p><div class="button-row"><button class="button ghost small" type="button" data-action="backup">${icon('down')}Копия правок</button><button class="button secondary small" type="button" data-action="estimate-csv"${result.valid?'':' disabled'}>${icon('down')}CSV расчёта</button><button class="button secondary" type="button" data-action="estimate-save">${icon('save')}Сохранить расчёт</button><button class="button primary" type="button" data-action="estimate-apply"${result.valid&&result.totals.total>0?'':' disabled'}>Перенести цену${icon('arrow')}</button></div></footer>`;
    }
    function open(id) {
      const record=A.getRecord(id),saved=A.workspace().estimates[id];
      if(!record&&!saved){A.notify('Запись для расчёта не найдена.');return;}
      recordId=id;draft=saved?clone(saved):C.emptyEstimate();
      if(record){draft.recordTitle=record.title||'';draft.caseNumber=record.caseNumber||'';}
      baseline=comparable(draft);returnFocus=doc.activeElement;
      renderEditor();draft=capture();baseline=comparable(draft);$('#estimate-dialog').showModal();$('#estimate-name-0')?.focus();
    }
    function close() {if(dirty()&&!ask('Закрыть расчёт без сохранения изменений?'))return false;$('#estimate-dialog').close();return true;}
    function currentForSave() {
      const current=capture();if(!current)return null;
      const check=C.validateEstimate(current,{allowIncomplete:true});
      if(!check.valid){A.notify(report(check.errors));return null;}
      return {...current,updatedAt:new Date().toISOString()};
    }
    function save(applyPrice=false) {
      const current=currentForSave();if(!current)return false;
      const result=C.calculateEstimate(current);
      if(applyPrice&&(!result.valid||result.totals.total<=0)){A.notify('Для переноса цены заполните все строки и получите сумму больше нуля.');return false;}
      const old=A.workspace().notes[recordId]?.proposalRub;
      if(applyPrice&&old!==null&&old!==undefined&&Number(old)!==result.totals.total&&!ask('Заменить вашу цену '+money(old)+' на '+money(result.totals.total)+' в карточке? Сохранённые предложения останутся отдельными версиями.'))return false;
      const next=clone(A.workspace());next.estimates[recordId]=current;
      if(applyPrice)next.notes[recordId]={...(next.notes[recordId]||{}),proposalRub:result.totals.total,updatedAt:current.updatedAt};
      if(!A.persist(next))return false;
      draft=clone(current);baseline=comparable(draft);
      if(applyPrice)A.onApplied?.(recordId,result.totals.total);
      A.render();A.notify(applyPrice?'Расчёт сохранён, итог перенесён в вашу цену карточки.':'Расчёт сохранён в этом браузере.');return true;
    }
    function input(event) {
      if(!$('#estimate-dialog').open||(!event.target.dataset.estimateLine&&!fields.some(key=>event.target.id==='estimate-'+key)&&event.target.id!=='estimate-notes'))return false;
      draft=capture();const result=C.calculateEstimate(draft);
      $('#estimate-totals').innerHTML=totalsMarkup(result);
      $('#estimate-errors').textContent=result.valid?'Расчёт заполнен. Проверьте исходные данные перед использованием.':report(result.errors);
      for(const cell of doc.querySelectorAll('[data-estimate-total]')){const line=draft.lines.find(row=>row.id===cell.dataset.estimateTotal);if(line)cell.textContent=amountForLine(line);}
      for(const button of doc.querySelectorAll('[data-action="estimate-apply"]'))button.disabled=!result.valid||result.totals.total<=0;
      for(const button of doc.querySelectorAll('[data-action="estimate-csv"]'))button.disabled=!result.valid;
      $('#estimate-save-state').textContent=dirty()?'Есть несохранённые изменения':'Изменений нет';return true;
    }
    function addLine(type) {
      if(!draft)return;draft=capture();if(draft.lines.length>=100){A.notify('В одном расчёте можно сохранить до 100 строк.');return;}
      draft.lines.push({id:uid(),type,name:'',quantity:'',unit:'',rateRub:''});renderEditor();$('#estimate-name-'+(draft.lines.length-1))?.focus();
    }
    function addTemplate() {
      draft=capture();const template=[['labor','Изучение материалов'],['labor','Осмотр и обмеры'],['labor','Обработка данных'],['labor','Расчёты и анализ'],['labor','Подготовка заключения'],['expense','Транспорт и доступ к объекту']];
      if(draft.lines.length+template.length>100){A.notify('Недостаточно места: максимум 100 строк.');return;}
      if(draft.lines.length===1&&['name','quantity','unit','rateRub'].every(key=>!draft.lines[0][key]))draft.lines=[];
      draft.lines.push(...template.map(([type,name])=>({id:uid(),type,name,quantity:'',unit:'',rateRub:''})));renderEditor();A.notify('Добавлены названия этапов. Объёмы и ставки укажите самостоятельно.');
    }
    function exportCsv() {
      const current=capture(),result=current&&C.calculateEstimate(current);
      if(!result?.valid){A.notify('Для выгрузки заполните корректные строки расчёта.');return;}
      const rows=[['ЛИЧНЫЙ РАСЧЁТ СТОИМОСТИ'],['Предмет',current.recordTitle],['Номер',current.caseNumber],['Тип','Наименование','Количество','Единица','Ставка, ₽','Сумма, ₽'],...current.lines.map(line=>[line.type==='labor'?'Работа':'Расход',line.name,line.quantity,line.unit,line.rateRub,result.lines.find(value=>value.id===line.id)?.totalRub]),[],['Показатель','Процент','Сумма, ₽'],['Работы и расходы','',result.totals.direct],['Накладные расходы',current.overheadPct,result.totals.overhead],['Резерв',current.reservePct,result.totals.reserve],['Наценка',current.markupPct,result.totals.markup],['Цена до НДС','',result.totals.net],['НДС',current.vatPct,result.totals.vat],['Расчётная цена','',result.totals.total],[],['Допущения и заметка',current.notes],['Основание','Количество, ставки и проценты введены пользователем; это не опубликованный бюджет и не подтверждённая рыночная цена.']];
      A.download('msk-expert-estimate-'+A.safeFilename(current.caseNumber||recordId)+'.csv',A.csv(rows),'text/csv;charset=utf-8');A.notify('Расчёт выгружен. Файл содержит ваши ставки, расходы и рабочую заметку.');
    }
    function savedPanel() {
      const list=Object.entries(A.workspace().estimates).sort(([,a],[,b])=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      if(!list.length)return '';
      return `<section class="panel section-gap"><div class="panel-heading"><div><h2>Мои расчёты<span class="panel-count">${list.length}</span></h2><p>Сохранённые объёмы, ставки и допущения, включая записи вне текущего реестра.</p></div></div><ul class="drafts-list">${list.map(([id,estimate])=>{const result=C.calculateEstimate(estimate);return `<li class="draft-row">${icon('table')}<div><button class="draft-title" data-action="estimate-open" data-id="${esc(id)}">${esc(estimate.recordTitle||estimate.caseNumber||'Расчёт '+id)}</button><p>${result.valid?esc(money(result.totals.total)):'Неполный расчёт'}${!A.getRecord(id)?' · запись вне текущего реестра':''}</p></div><button class="icon-button" type="button" data-action="estimate-delete" data-id="${esc(id)}" aria-label="Удалить расчёт ${esc(estimate.caseNumber||estimate.recordTitle||id)}">${icon('trash')}</button></li>`;}).join('')}</ul></section>`;
    }
    function handleAction(action) {
      const key=action.dataset.action;
      if(key==='backup'&&$('#estimate-dialog').open){const check=C.validateEstimate(capture(),{allowIncomplete:true});if(!check.valid){A.notify('Перед созданием копии исправьте введённые числа. '+report(check.errors));return true;}return false;}
      if(!key.startsWith('estimate-'))return false;
      if(key==='estimate-delete'){
        const id=action.dataset.id,saved=A.workspace().estimates[id];if(!saved)return true;
        if(!ask('Удалить сохранённый расчёт «'+(saved.caseNumber||saved.recordTitle||id)+'»? Цена карточки и сохранённые предложения останутся.'))return true;
        const next=clone(A.workspace());delete next.estimates[id];
        if(A.persist(next)){A.render();A.notify('Расчёт удалён из этого браузера.');}return true;
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
      if(key==='estimate-remove'){
        draft=capture();const line=draft.lines.find(row=>row.id===action.dataset.lineId);
        if(line&&[line.name,line.quantity,line.rateRub].some(Boolean)&&!ask('Удалить строку «'+(line.name||'без названия')+'» из расчёта?'))return true;
        draft.lines=draft.lines.filter(row=>row.id!==action.dataset.lineId);renderEditor();$('#estimate-dialog')?.focus();
      }
      return true;
    }
    $('#estimate-dialog').addEventListener('cancel',event=>{event.preventDefault();close();});
    $('#estimate-dialog').addEventListener('close',()=>{const previousId=recordId;recordId=null;draft=null;baseline=null;const target=returnFocus?.isConnected?returnFocus:[...doc.querySelectorAll('[data-action="estimate-open"]')].find(button=>button.dataset.id===previousId)||$('#main');target?.focus({preventScroll:true});returnFocus=null;});
    return Object.freeze({handleAction,handleInput:input,handleChange:input,handleSubmit(event){if(event.target.id!=='estimate-form')return false;event.preventDefault();save(false);return true;},dirty,applySnapshot,savedPanel});
  }
  return Object.freeze({create});
});
