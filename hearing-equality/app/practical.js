import {PHRASE_GROUPS,findPhrases} from './phrasebook.js?v=0.18.0';
export function createPracticalController({document:doc,insertText,onReply}) {
  const $=id=>doc.getElementById(id);let group='everyday',replyContext=null,addedContext=false,contextDemo=false;
  function renderPhrases(){
    const list=findPhrases(group,$('phrase-search').value);$('phrase-results').replaceChildren();
    for(const item of list){const button=doc.createElement('button');button.type='button';button.textContent=item.text;button.onclick=()=>insertText(item.text);$('phrase-results').append(button);}
    $('phrase-count').textContent=list.length?`${list.length} фраз · нажмите, чтобы добавить в сообщение`:'Ничего не найдено. Попробуйте другое слово или напишите сообщение вручную.';
  }
  for(const [id,label] of PHRASE_GROUPS){const button=doc.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-pressed',String(id===group));button.onclick=()=>{group=id;$('phrase-search').value='';for(const other of $('phrase-categories').children)other.setAttribute('aria-pressed',String(other===button));renderPhrases();};$('phrase-categories').append(button);}
  $('phrase-search').addEventListener('input',renderPhrases);renderPhrases();
  $('open-gesture-input').onclick=()=>{$('gesture-input').open=true;$('gesture-input').scrollIntoView({block:'start'});$('dialogue-start').focus({preventScroll:true});};
  $('focus-typing').onclick=()=>{$('conversation').focus();};
  function sendReply(value){
    const text=String(value??'').trim();
    if(!text){$('display-reply-status').textContent='Напишите ответ или выберите короткий вариант.';return false;}
    if(text.length>2000){$('display-reply-status').textContent='Ответ длиннее 2000 символов. Сократите его: текст сохранён.';return false;}
    try{if(onReply(text,addedContext?null:replyContext,contextDemo)===false)throw new Error();}
    catch{$('display-reply-status').textContent='Не удалось добавить ответ. Текст сохранён.';return false;}
    addedContext=true;
    const row=doc.createElement('p');row.textContent=text;$('display-replies').append(row);$('display-replies').hidden=false;
    $('display-reply').value='';$('display-reply-status').textContent='Ответ добавлен в диалог. Передайте устройство обратно.';return true;
  }
  $('display-send-reply').onclick=()=>sendReply($('display-reply').value);
  for(const button of doc.querySelectorAll('[data-display-reply]'))button.addEventListener('click',()=>{
    // Quick replies only populate the editor; never discard a partner's draft or send unexpectedly.
    const value=$('display-reply').value;
    $('display-reply').value=value.trim()?`${value} ${button.dataset.displayReply}`:button.dataset.displayReply;
    $('display-reply').focus();$('display-reply-status').textContent='Проверьте ответ и нажмите «Добавить ответ в диалог».';
  });
  $('display-rotate').onclick=()=>{const panel=$('display-reading');const active=panel.classList.toggle('rotated');$('display-rotate').setAttribute('aria-pressed',String(active));};
  $('display-clear-reply').onclick=()=>{$('display-reply').value='';$('display-reply-status').textContent='Поле ответа очищено.';};
  return {present(text,{demo=false}={}){
    contextDemo=demo;
    if(replyContext!==text){$('display-replies').replaceChildren();$('display-replies').hidden=true;addedContext=false;}
    replyContext=text;$('display-reading').classList.remove('rotated');$('display-rotate').setAttribute('aria-pressed','false');
    $('display-reply-status').textContent=$('display-reply').value?'Набранный ранее ответ сохранён.':'Напишите ответ. Сообщения останутся только в этой вкладке.';
  },resetHistory(){addedContext=false;$('display-replies').replaceChildren();$('display-replies').hidden=true;},sendReply};
}
