/* ПЕРВОСБОРКА · overview of existing answers. No scoring, storage or timers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.RouteOverview=api;})(typeof window!=='undefined'?window:null,function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const valid=v=>Number.isInteger(v)&&v>=1&&v<=5;
const normalize=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
function model({questions=[],answers={},cases=[],caseAnswers={},tracks=[],records={},reflections={},drafts={},targetLabs=8}={}){
 const byId=new Map(tracks.map(t=>[t.id,t]));
 const cards=questions.map((q,index)=>{const value=own(answers,q.id)?answers[q.id]:undefined;return {id:q.id,index,number:index+1,page:Math.floor(index/8),cursor:index%8,prompt:String(q.prompt||''),track:q.track,name:String(byId.get(q.track)?.name||''),status:value===null?'unknown':valid(value)?'answered':'unanswered',value:valid(value)?value:null};});
 const situationItems=cases.map((q,index)=>{const value=own(caseAnswers,q.id)?caseAnswers[q.id]:undefined;return {id:q.id,index,status:value===null?'unknown':(q.options||q.choices||[]).some(c=>c.id===value)?'answered':'unanswered'};});
 const labItems=tracks.map(t=>({id:t.id,name:t.name,checked:!!records[t.id]?.first,skipped:!records[t.id]?.first&&!!records[t.id]?.skipped,draft:own(drafts,t.id),reflection:!own(reflections,t.id)?'unanswered':reflections[t.id]===null?'unknown':valid(reflections[t.id])?'answered':'unanswered'}));
 const counts=items=>({total:items.length,answered:items.filter(x=>x.status==='answered').length,unknown:items.filter(x=>x.status==='unknown').length,unanswered:items.filter(x=>x.status==='unanswered').length});
 return {cards,situations:situationItems,labs:labItems,interest:counts(cards),situation:counts(situationItems),targetLabs:Math.max(1,Math.min(tracks.length||8,Number.isInteger(targetLabs)?targetLabs:8))};
}
function atlas(m){
 if(!m?.cards?.length)return '';
 const labels={answered:'Есть ответ',unknown:'Пока не могу оценить',unanswered:'Без ответа'};
 return `<details class="ro-atlas"><summary><span class="ro-atlas-mark" aria-hidden="true">▦</span><span><strong>Все карточки маршрута</strong><small>${m.interest.answered} с оценкой · ${m.interest.unknown} пока без оценки · ${m.interest.unanswered} без ответа</small></span><span class="ro-atlas-chevron" aria-hidden="true">⌄</span></summary><div class="ro-atlas-body"><div class="ro-toolbar"><div class="ro-filters" role="group" aria-label="Какие карточки показать">${[['all','Все'],['unanswered','Без ответа'],['unknown','Пока без оценки']].map(([id,label])=>`<button type="button" data-ro-filter="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><label class="ro-search"><span class="sr-only">Найти карточку интересов</span><input type="search" data-ro-query placeholder="Найти занятие или направление" maxlength="100" autocomplete="off"></label></div><p class="ro-count" data-ro-count role="status" aria-live="polite"></p><div class="ro-grid">${m.cards.map(c=>`<button type="button" class="ro-card is-${c.status}" data-ro-card="${c.index}" data-ro-status="${c.status}" data-ro-search="${esc(c.prompt+' '+c.name)}" aria-label="Карточка ${c.number}: ${esc(c.prompt)}. ${labels[c.status]}${c.value?': '+c.value+' из 5':''}"><span class="ro-number">${String(c.number).padStart(2,'0')}</span><span class="ro-card-copy"><small>${esc(c.name)}</small><strong>${esc(c.prompt)}</strong><span>${c.value?'Выбрано '+c.value+' из 5':labels[c.status]}</span></span><span class="ro-card-sign" aria-hidden="true">${c.status==='answered'?'✓':c.status==='unknown'?'?':'○'}</span></button>`).join('')}</div><div class="ro-empty" data-ro-empty hidden><strong>Таких карточек здесь нет</strong><p>Сбрось поиск и фильтр, чтобы увидеть весь маршрут.</p><button type="button" data-ro-reset>Показать все</button></div><p class="ro-note">Нажми карточку, чтобы вернуться к ней. Просмотр не меняет ответы.</p></div></details>`;
}
function checkpoint(m){
 if(!m)return '';
 const firstInterest=m.cards.find(x=>x.status==='unanswered')||m.cards.find(x=>x.status==='unknown')||m.cards[0];
 const firstCase=m.situations.find(x=>x.status==='unanswered')||m.situations.find(x=>x.status==='unknown')||m.situations[0];
 const checked=m.labs.filter(x=>x.checked),skipped=m.labs.filter(x=>x.skipped),drafts=m.labs.filter(x=>x.draft&&!x.checked);
 const nextLab=checked.length>=m.targetLabs?null:(drafts[0]||m.labs.find(x=>!x.checked));
 const missingReflection=checked.filter(x=>x.reflection==='unanswered'),unknownReflection=checked.filter(x=>x.reflection==='unknown'),reflection=missingReflection[0]||unknownReflection[0];
 const items=[
  {step:'01',title:'Карточки интересов',value:`${m.interest.answered} / ${m.interest.total}`,note:`${m.interest.unanswered} без ответа · ${m.interest.unknown} пока без оценки`,label:m.interest.unanswered?'К первой без ответа':m.interest.unknown?'Вернуться к сомнениям':'Посмотреть ответы',kind:'interest',target:firstInterest?.index??0},
  {step:'02',title:'Ситуации',value:`${m.situation.answered} / ${m.situation.total}`,note:`${m.situation.unanswered} без ответа · ${m.situation.unknown} пропущено`,label:m.situation.unanswered?'К следующей ситуации':m.situation.unknown?'Вернуться к пропущенной':'Посмотреть выбор',kind:'situation',target:firstCase?.index??0},
  {step:'03',title:'Практические пробы',value:`${checked.length} проверено`,note:`Для маршрута: ${m.targetLabs} · ${skipped.length} пропущено`,label:nextLab?nextLab.draft?'Продолжить свой вариант':'Открыть следующую пробу':'Открыть лаборатории',kind:nextLab?'lab':'labs',target:nextLab?.id||''},
  {step:'04',title:'Впечатления от проб',value:checked.length?`${checked.filter(x=>x.reflection==='answered').length} / ${checked.length}`:'После первой пробы',note:checked.length?`${missingReflection.length} без ответа · ${unknownReflection.length} пока без оценки`:'Проверь вариант и отметь, хочется ли продолжить.',label:reflection?'Вернуться к впечатлению':checked.length?'К следующим проектам':'Выбрать лабораторию',kind:reflection?'reflection':checked.length?'projects':'labs',target:reflection?.id||''}
 ];
 return `<section class="ro-checkpoint" aria-labelledby="ro-checkpoint-title"><div class="ro-checkpoint-heading"><div><p class="eyebrow">ПРОДОЛЖИТЬ В СВОЁМ ТЕМПЕ</p><h2 id="ro-checkpoint-title">К чему хочется вернуться?</h2></div><p>Здесь ответы и пропуски показаны отдельно. Порядок выбираешь ты.</p></div><div class="ro-checkpoint-grid">${items.map(item=>`<article class="ro-step"><span class="ro-step-no">${item.step}</span><h3>${item.title}</h3><strong class="ro-step-value">${item.value}</strong><p>${item.note}</p><button type="button" data-ro-go="${item.kind}" data-ro-target="${esc(item.target)}">${item.label}<span aria-hidden="true">↗</span></button></article>`).join('')}</div></section>`;
}
function mount(root,{view={},onCard=()=>{},onGo=()=>{}}={}){
 const details=root?.querySelector?.('.ro-atlas');let destroyed=false,filter=['all','unanswered','unknown'].includes(view.filter)?view.filter:'all',query=typeof view.query==='string'?view.query.slice(0,100):'';
 const input=details?.querySelector('[data-ro-query]');if(details)details.open=!!view.open;if(input)input.value=query;
 const all=(scope,sel)=>Array.from(scope?.querySelectorAll?.(sel)||[]);
 function update(){if(!details)return;const words=normalize(query).split(/\s+/).filter(Boolean);let count=0;for(const item of all(details,'[data-ro-card]')){const match=(filter==='all'||item.dataset.roStatus===filter)&&words.every(w=>normalize(item.dataset.roSearch).includes(w));item.hidden=!match;if(match)count++;}for(const button of all(details,'[data-ro-filter]'))button.setAttribute('aria-pressed',String(button.dataset.roFilter===filter));const label=details.querySelector('[data-ro-count]');if(label)label.textContent=`Показано: ${count} из ${all(details,'[data-ro-card]').length}`;const empty=details.querySelector('[data-ro-empty]');if(empty)empty.hidden=count!==0;}
 function click(event){if(destroyed)return;const target=event.target?.closest?.('[data-ro-card], [data-ro-filter], [data-ro-reset], [data-ro-go]');if(!target||!root.contains(target))return;if(target.hasAttribute('data-ro-card')){const index=Number(target.dataset.roCard);if(Number.isInteger(index)&&index>=0){if(details)details.open=false;onCard(index);}return;}if(target.hasAttribute('data-ro-filter')){filter=target.dataset.roFilter;update();return;}if(target.hasAttribute('data-ro-reset')){filter='all';query='';if(input)input.value='';update();input?.focus();return;}onGo(target.dataset.roGo,target.dataset.roTarget);}
 function change(event){if(event.target!==input)return;query=input.value.slice(0,100);update();}
 root?.addEventListener?.('click',click);root?.addEventListener?.('input',change);update();
 return {getView:()=>({open:!!details?.open,filter,query}),destroy(){if(destroyed)return;destroyed=true;root?.removeEventListener?.('click',click);root?.removeEventListener?.('input',change);}};
}
return {model,atlas,checkpoint,mount};
});
