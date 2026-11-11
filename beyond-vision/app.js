import {CONFIG} from './config.js';
import {api,isConfigured,encodeAudio} from './api.js';
import {createSteps} from './questions.js';
import {drafts,readSettings,writeSettings} from './storage.js';
import {Recorder,speak,stopSpeech,hasSpeech} from './audio.js';
import {renderBooking} from './booking.js';

const $=id=>document.getElementById(id);
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHtml;
const main=$('main');
const speaker='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
const microphone='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
let settings=readSettings(),session=null,steps=[],stepIndex=0,currentDraft={},recorder=null,audioObjectUrl=null,busy=false,renderVersion=0,draftTimer,timerInterval,currentRoute='';
let demo=false,stopExploration=null;
const storageRead=(key)=>{try{return sessionStorage.getItem(key)}catch{return null}};
const storageWrite=(key,val)=>{try{val==null?sessionStorage.removeItem(key):sessionStorage.setItem(key,val)}catch{}};
let deviceKey=storageRead('vision-device');
if(!deviceKey){deviceKey=crypto.randomUUID();storageWrite('vision-device',deviceKey)}
const draftKey=()=>`${session.pid}:${steps[stepIndex]?.id}`;
const announce=text=>{$('announcer').textContent=text};
const focusHeading=()=>{const heading=main.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}window.scrollTo({top:0,behavior:'instant'})};
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();main.focus();main.scrollIntoView()});
function applySettings(){
  document.documentElement.classList.toggle('large-text',!!settings.large);
  document.documentElement.classList.toggle('high-contrast',!!settings.contrast);
  $('large-text').checked=!!settings.large;$('high-contrast').checked=!!settings.contrast;$('auto-speech').checked=!!settings.autoSpeech;
  $('auto-speech').disabled=!hasSpeech();writeSettings(settings);
}
applySettings();
$('accessibility-toggle').addEventListener('click',()=>{
  const open=$('accessibility-panel').hidden;$('accessibility-panel').hidden=!open;$('accessibility-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('accessibility-close').focus();
});
function closeSettings(){$('accessibility-panel').hidden=true;$('accessibility-toggle').setAttribute('aria-expanded','false')}
$('accessibility-close').addEventListener('click',()=>{closeSettings();$('accessibility-toggle').focus()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('accessibility-panel').hidden){closeSettings();$('accessibility-toggle').focus()}});
document.addEventListener('click',e=>{if(!e.target.closest('#accessibility-panel,#accessibility-toggle'))closeSettings()});
for(const [id,key] of [['large-text','large'],['high-contrast','contrast'],['auto-speech','autoSpeech']])$(id).addEventListener('change',e=>{settings[key]=e.target.checked;applySettings();if(key==='autoSpeech'&&settings[key])speak('Автоматическое чтение включено. Каждый новый вопрос будет озвучиваться.');if(key==='autoSpeech'&&!settings[key])stopSpeech()});

function home(){
  document.title='За пределами зрения · Тактильное искусство';
  main.innerHTML=`<section class="home-basic" aria-labelledby="home-title"><div class="home-basic-inner"><p class="project-type">Исследование тактильного искусства</p><h1 id="home-title">За пределами<br>зрения</h1><div class="entry-actions"><a class="entry-action primary" href="#booking"><span>Записаться</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a><a class="entry-action" href="#access"><span>Пройти опрос</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a></div></div></section>`;
}
function about(){
  document.title='О проекте · За пределами зрения';
  main.innerHTML=`<article class="page-shell about-page"><a class="back-link" href="#home">← На главную</a><h1>О проекте</h1><p class="lead">«За пределами зрения» — исследование тактильных интерпретаций живописных произведений на базе Технопарка РГСУ.</p><h2>Цель</h2><p>Определить, какие способы построения рельефа помогают незрячим и слабовидящим людям распознавать объекты и понимать композицию изображения.</p><h2>Участие</h2><p>Участник исследует три физические панели, затем описывает восприятие и оценивает понятность каждой. Названия произведений заранее не сообщаются. Ответы собираются индивидуально, до общего обсуждения.</p><p>Основная группа — незрячие и слабовидящие участники от 18 лет. Участие добровольное: можно пропускать отдельные вопросы, делать перерывы и отозвать ответы.</p><h2>Самостоятельный опрос</h2><p>Вопросы доступны текстом и с озвучиванием. Ответить можно текстом или голосовой записью. Код либо логин и пароль выдаются после записи. Для исследования нужны панели на площадке.</p><h2>Площадка</h2><p>Технопарк Российского государственного социального университета. Москва, ул. Вильгельма Пика, 4, строение 8. <a href="#visit">Как добраться</a>.</p><div class="about-actions"><a class="button" href="#booking">Записаться</a><a class="button secondary" href="#access">Пройти опрос</a></div></article>`;
}
function access(){
  document.title='Вход участника · За пределами зрения';
  main.innerHTML=`<section class="page-shell"><a class="back-link" href="#home">← На главную</a><div class="eyebrow">Личное пространство участника</div><h1>Вход участника</h1><p class="lead">Введите доступ, выданный организатором. Если вы уже начали, ответы откроются с того места, где вы остановились.</p>
    ${!isConfigured()?'<div class="notice neutral"><strong>Приём ответов ещё не открыт.</strong><p>Организатор сообщит, когда можно начать. Сейчас можно познакомиться с тем, как устроен опрос.</p></div>':''}
    <form id="access-form" class="access-box"><div class="auth-tabs" role="tablist" aria-label="Способ входа"><button type="button" role="tab" id="code-tab" aria-selected="true" aria-controls="code-fields" tabindex="0">По коду</button><button type="button" role="tab" id="password-tab" aria-selected="false" aria-controls="password-fields" tabindex="-1">Логин и пароль</button></div>
      <div id="code-fields" role="tabpanel" aria-labelledby="code-tab"><label class="field-label" for="participant-code">Код участника</label><input class="code-input" id="participant-code" name="code" inputmode="numeric" autocomplete="off" maxlength="19" aria-describedby="code-hint"><p class="small muted" id="code-hint">12 цифр с вашей карточки. Пробелы можно не вводить.</p></div>
      <div id="password-fields" role="tabpanel" aria-labelledby="password-tab" hidden><label class="field-label" for="participant-login">Логин</label><input class="standard-input" id="participant-login" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40"><label class="field-label spaced" for="participant-password">Пароль</label><div class="password-wrap"><input class="standard-input" id="participant-password" name="password" type="password" autocomplete="current-password" maxlength="100"><button id="show-password" type="button" aria-label="Показать пароль" aria-pressed="false">Показать</button></div><p class="small muted">Если доступ потерян, обратитесь к организатору. Самостоятельная смена пароля не требуется.</p></div>
      <div class="error-message" id="access-error" role="alert"></div><button class="button" type="submit" ${!isConfigured()?'disabled':''}>Войти в исследование <span aria-hidden="true">→</span></button>
    </form><a class="demo-link" href="#demo"><span>Познакомиться с опросом<small>Один пробный вопрос · без регистрации и отправки</small></span><span aria-hidden="true">↗</span></a></section>`;
  let mode='code';
  function selectTab(next){mode=next;for(const m of ['code','password']){$(`${m}-tab`).setAttribute('aria-selected',String(m===mode));$(`${m}-tab`).tabIndex=m===mode?0:-1;$(`${m}-fields`).hidden=m!==mode}$(`${next}-tab`).focus()}
  for(const m of ['code','password']){$(`${m}-tab`).addEventListener('click',()=>selectTab(m));$(`${m}-tab`).addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selectTab(mode==='code'?'password':'code')}})}
  $('show-password').addEventListener('click',e=>{const show=$('participant-password').type==='password';$('participant-password').type=show?'text':'password';e.target.textContent=show?'Скрыть':'Показать';e.target.setAttribute('aria-label',show?'Скрыть пароль':'Показать пароль');e.target.setAttribute('aria-pressed',String(show))});
  $('access-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const credentials=mode==='code'?{code:$('participant-code').value.replace(/[\s-]/g,'')}:{login:$('participant-login').value.trim(),password:$('participant-password').value};
    if(mode==='code'&&!/^\d{12}$/.test(credentials.code)){$('access-error').textContent='Введите все 12 цифр с карточки участника.';$('participant-code').focus();return}
    if(mode==='password'&&(!credentials.login||!credentials.password)){$('access-error').textContent='Введите логин и пароль.';return}
    busy=true;const button=e.submitter;button.disabled=true;button.textContent='Проверяем доступ…';$('access-error').textContent='';
    try{
      const result=await api('login',{...credentials,deviceKey});
      session={...result.session,token:result.token};storageWrite('vision-token',result.token);
      demo=false;steps=createSteps(session.schedule);stepIndex=firstUnanswered();
      location.hash=session.status==='completed'?'done':'study';
    }catch(error){$('access-error').textContent=error.message;button.disabled=false;button.textContent='Войти в исследование →'}finally{busy=false}
  });
}
function firstUnanswered(){return Math.max(0,steps.findIndex(step=>step.kind==='review'||!session.answers[step.id]))}
function currentAnswer(){return demo?{}:session?.answers?.[steps[stepIndex]?.id]||{}}
async function persistDraft(){
  if(demo||!session||!steps[stepIndex])return;
  try{await drafts.put(draftKey(),{...currentDraft,updatedAt:Date.now()})}catch{if($('save-caption'))$('save-caption').textContent='Не удалось сохранить черновик на устройстве. Не закрывайте страницу до отправки ответа.'}
}
function clearMedia(){stopExploration?.();stopExploration=null;clearInterval(timerInterval);clearTimeout(draftTimer);stopSpeech();recorder?.stop();recorder=null;if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null}}
function getValueMarkup(step){
  const value=currentDraft.value;
  if(step.kind==='consent')return `<label class="check-card"><input id="adult-consent" type="checkbox" ${value?.adult?'checked':''}><span>Мне исполнилось 18 лет, и я добровольно участвую в исследовании.<small>Участие не является проверкой способностей. Можно не отвечать на отдельные вопросы или остановиться.</small></span></label><label class="check-card"><input id="data-consent" type="checkbox" ${value?.data?'checked':''}><span>Я согласен(на) на сохранение моих ответов для этого исследования.<small>Текст хранится в Google Таблице, голосовые ответы — в закрытой папке Google Диска. Реальное имя в опросе не требуется. <a href="#privacy">Подробнее о данных</a>.</small></span></label><label class="check-card"><input id="audio-consent" type="checkbox" ${value?.audio?'checked':''}><span>Разрешаю сохранять мои голосовые ответы.<small>Необязательно. Без этого согласия можно отвечать текстом.</small></span></label>`;
  if(step.kind==='training')return '<div class="training-tip">Уточнять порядок действий можно у организатора. Обсуждать содержание основных панелей лучше после завершения исследования.</div>';
  if(step.kind==='choice'||step.kind==='scale'){
    const options=step.kind==='scale'?step.labels.map((label,i)=>[String(i+1),label]):step.options;
    return `<fieldset class="choice-fieldset"><legend class="sr-only">${esc(step.title)}</legend><div class="choice-list">${options.map(([v,label])=>`<label class="choice-card ${step.kind==='scale'?'scale-card':''}"><input type="radio" name="answer" value="${esc(v)}" ${String(value)===v?'checked':''}>${step.kind==='scale'?`<span class="scale-number" aria-hidden="true">${v}</span>`:''}<span>${step.kind==='scale'?`<span class="sr-only">${v} — </span>`:''}${esc(label)}</span></label>`).join('')}${step.kind==='scale'?`<label class="choice-card"><input type="radio" name="answer" value="skip" ${value==='skip'?'checked':''}><span>Предпочитаю не оценивать</span></label>`:''}</div></fieldset>`;
  }
  if(step.kind==='explore')return `<div class="panel-badge">Маркировка панели <strong>${esc(step.panel)}</strong></div><div class="timer-box"><div class="timer" id="explore-clock" aria-hidden="true">${timeFormat(currentDraft.value?.seconds||0)}</div><p class="sr-only">Таймер исследования. Ограничения по времени нет.</p><button class="button" id="timer-toggle" type="button">${currentDraft.value?.seconds?'Продолжить исследовать':'Начать исследовать'}</button><p>Когда закончите, нажмите «Готово» внизу.</p></div>`;
  if(step.kind==='text')return `<label class="field-label" for="answer-text">${esc(step.label)}</label><textarea id="answer-text" class="response-text" maxlength="6000" aria-describedby="text-hint">${esc(currentDraft.text||'')}</textarea><div class="text-meta"><span id="text-hint">Можно использовать диктовку клавиатуры телефона.</span><span id="character-count">${(currentDraft.text||'').length} / 6000</span></div><div class="record-zone" id="record-zone">${recordMarkup()}</div>`;
  if(step.kind==='review')return `<div class="review-list">${session.schedule.map((p,i)=>`<div class="review-row"><span>Панель ${i+1} · ${esc(p)}</span><span>Ответы сохранены</span></div>`).join('')}<div class="review-row"><span>Итоговые вопросы</span><span>Ответы сохранены</span></div></div><p class="small muted">После завершения анкету нельзя изменять. Организатор получает ответы под вашим номером участника.</p>`;
  return '';
}
function recordMarkup(){
  const allowed=demo||session?.answers.consent?.value?.audio;
  if(!allowed)return `<p class="small muted">Голосовой ответ доступен с отдельного согласия. Можно продолжить текстом.</p><button class="text-button" id="enable-audio" type="button">Разрешить сохранение голосовых ответов</button>`;
  if(!Recorder.supported())return '<p class="small muted">Этот браузер не поддерживает запись звука. Ответьте текстом или используйте диктовку клавиатуры телефона.</p>';
  const hasBlob=!!currentDraft.blob;
  return `<div class="record-row"><button class="record-button" id="record-button" type="button">${microphone}${hasBlob?'Записать заново':'Ответить голосом'}</button><span class="record-status" id="record-status" role="status">${hasBlob?'Запись готова. Прослушайте перед отправкой.':currentAnswer().hasAudio?'Голосовой ответ уже сохранён.':'До 2 минут на ответ'}</span></div>${hasBlob?'<audio class="audio-preview" id="audio-preview" controls preload="metadata" aria-label="Прослушать записанный ответ"></audio><button class="text-button" id="delete-audio" type="button">Удалить эту запись</button>':''}<p class="small muted">${demo?'Пробная запись остаётся на этой странице.': 'Голос отправится только после нажатия «Далее». Можно прослушать, удалить или перезаписать его.'}</p>`;
}
const timeFormat=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;
async function renderStep(){
  const version=++renderVersion;clearMedia();
  const step=steps[stepIndex];if(!step)return;
  currentDraft={...currentAnswer(),requestId:crypto.randomUUID()};
  if(!demo){try{const saved=await drafts.get(draftKey());if(saved)currentDraft={...currentDraft,...saved}}catch{}}
  if(version!==renderVersion)return;
  document.title=`${step.section} · За пределами зрения`;
  main.innerHTML=`<section class="study-shell">${demo?'<div class="demo-banner">Знакомство с опросом. Пробные ответы не отправляются и не сохраняются.</div>':''}<div class="study-header"><span>${demo?'Пробный вопрос':`Участник ${esc(session.pid)}`} · ${stepIndex+1} из ${steps.length}</span><button class="text-button" id="pause-button" type="button">${demo?'На главную':'Сделать перерыв'}</button></div><div class="study-progress" role="progressbar" aria-label="Прогресс опроса" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${stepIndex}" aria-valuetext="Шаг ${stepIndex+1} из ${steps.length}"><div style="width:${stepIndex/steps.length*100}%"></div></div><div class="question"><div class="question-top"><div class="eyebrow">${esc(step.section)}</div><button id="listen-question" class="listen-button" type="button" aria-pressed="false" ${!hasSpeech()?'disabled':''}>${speaker}<span>Слушать вопрос</span></button></div><h1>${esc(step.title)}</h1><p class="question-description">${esc(step.text)}</p><form id="question-form"><div class="question-body">${getValueMarkup(step)}</div><p class="error-message" id="question-error" role="alert"></p><div class="question-actions"><button id="previous-step" class="button ghost" type="button">← ${stepIndex?'Назад':'На главную'}</button><button class="button" id="next-step" type="submit">${step.kind==='review'?'Завершить участие':step.kind==='explore'?'Готово':demo?'Завершить пробу':'Далее'} <span aria-hidden="true">→</span></button></div></form><div id="save-caption" class="save-caption" role="status">${demo?'Ответы в пробе никуда не отправляются.':currentAnswer().savedAt?'Ответ сохранён в исследовании.':'Ответ отправится после нажатия «Далее».'}</div></div></section>`;
  focusHeading();bindStep(step);if(settings.autoSpeech)speakQuestion(step);
}
function speakQuestion(step){
  const text=[step.title,step.text,...(step.kind==='scale'?step.labels.map((v,i)=>`${i+1}. ${v}`):step.options?.map(([,v])=>v)||[])].join(' ');
  const button=$('listen-question');button?.setAttribute('aria-pressed','true');
  if(button)button.querySelector('span').textContent='Остановить';
  speak(text,()=>{if(button?.isConnected){button.setAttribute('aria-pressed','false');button.querySelector('span').textContent='Слушать вопрос'}});
}
function bindStep(step){
  $('listen-question').addEventListener('click',()=>{if($('listen-question').getAttribute('aria-pressed')==='true'){stopSpeech();$('listen-question').setAttribute('aria-pressed','false');$('listen-question').querySelector('span').textContent='Слушать вопрос'}else speakQuestion(step)});
  $('pause-button').addEventListener('click',()=>demo?(location.hash='home'):pauseDialog());
  $('previous-step').addEventListener('click',async()=>{if(busy||recorder?.active)return;if(demo){location.hash='home';return}await persistDraft();if(stepIndex){stepIndex--;renderStep()}else pauseDialog()});
  $('question-form').addEventListener('submit',e=>{e.preventDefault();saveStep(step)});
  if(step.kind==='text'){
    $('answer-text').addEventListener('input',e=>{currentDraft.text=e.target.value;$('character-count').textContent=`${e.target.value.length} / 6000`;queueDraft()});bindRecording();
  }
  if(step.kind==='consent')for(const id of ['adult-consent','data-consent','audio-consent'])$(id).addEventListener('change',()=>{currentDraft.value={adult:$('adult-consent').checked,data:$('data-consent').checked,audio:$('audio-consent').checked};queueDraft()});
  if(step.kind==='choice'||step.kind==='scale')main.querySelectorAll('[name=answer]').forEach(el=>el.addEventListener('change',e=>{currentDraft.value=e.target.value;queueDraft()}));
  if(step.kind==='training')currentDraft.value=true;
  if(step.kind==='explore'){
    let started=null,base=currentDraft.value?.seconds||0;
    const capturedDraft=currentDraft,capturedKey=draftKey();
    const stop=()=>{if(started!==null){base+=(Date.now()-started)/1000;started=null;clearInterval(timerInterval);capturedDraft.value={...capturedDraft.value,seconds:Math.round(base),timing:'self-reported-phone'};capturedDraft.requestId=crypto.randomUUID();drafts.put(capturedKey,{...capturedDraft,updatedAt:Date.now()}).catch(()=>{})}return base};
    stopExploration=stop;
    $('timer-toggle').addEventListener('click',()=>{if(started===null){started=Date.now();$('timer-toggle').textContent='Приостановить отсчёт';currentDraft.value={seconds:Math.round(base),timing:'self-reported-phone',startedAt:new Date().toISOString()};persistDraft();timerInterval=setInterval(()=>{$('explore-clock').textContent=timeFormat(base+(Date.now()-started)/1000)},500)}else{stop();$('timer-toggle').textContent='Продолжить исследовать'}});
    $('question-form').addEventListener('submit',()=>stop(),{capture:true});
    $('pause-button').addEventListener('click',()=>stop(),{capture:true});
    $('previous-step').addEventListener('click',()=>stop(),{capture:true});
  }
}
function queueDraft(){currentDraft.requestId=crypto.randomUUID();clearTimeout(draftTimer);draftTimer=setTimeout(async()=>{await persistDraft();if($('save-caption'))$('save-caption').textContent='Черновик сохранён на этом устройстве.'},400)}
function bindRecording(){
  if($('audio-preview')&&currentDraft.blob){audioObjectUrl=URL.createObjectURL(currentDraft.blob);$('audio-preview').src=audioObjectUrl}
  $('enable-audio')?.addEventListener('click',()=>audioConsentDialog());
  $('delete-audio')?.addEventListener('click',async()=>{delete currentDraft.blob;currentDraft.removeAudio=true;currentDraft.requestId=crypto.randomUUID();await persistDraft();refreshRecording()});
  $('record-button')?.addEventListener('click',async()=>{
    if(recorder?.active){recorder.stop();return}
    $('record-button').disabled=true;
    const capturedDraft=currentDraft,capturedKey=demo?null:draftKey();
    const recording=new Recorder({
      onTick:seconds=>{if(currentDraft===capturedDraft&&$('record-status'))$('record-status').textContent=`Идёт запись · ${timeFormat(seconds)} из 02:00`},
      onComplete:async blob=>{capturedDraft.blob=blob;capturedDraft.removeAudio=false;capturedDraft.requestId=crypto.randomUUID();if(capturedKey)await drafts.put(capturedKey,{...capturedDraft,updatedAt:Date.now()}).catch(()=>{});if(currentDraft!==capturedDraft)return;refreshRecording();if($('next-step'))$('next-step').disabled=false;announce('Запись готова. Можно прослушать её перед отправкой.')},
      onError:message=>{if(currentDraft!==capturedDraft)return;if($('question-error'))$('question-error').textContent=message;if($('next-step'))$('next-step').disabled=false;refreshRecording()},
    });
    recorder=recording;
    try{await recording.start();if(currentDraft!==capturedDraft||!$('record-button')){recording.stop();return}$('record-button').disabled=false;$('record-button').classList.add('recording');$('record-button').innerHTML='<span class="record-light" aria-hidden="true"></span>Остановить запись';$('next-step').disabled=true;announce('Запись началась. Ответьте голосом, затем нажмите «Остановить запись».')}catch(error){if(currentDraft===capturedDraft&&$('question-error')){$('question-error').textContent=error.message;refreshRecording()}}
  });
}
function refreshRecording(){if(!$('record-zone'))return;if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null}$('record-zone').innerHTML=recordMarkup();bindRecording()}
function dialog(title,body,buttons){
  main.querySelector('dialog')?.remove();const d=document.createElement('dialog');d.className='pause-dialog';
  d.setAttribute('aria-labelledby','dialog-title');d.innerHTML=`<h2 id="dialog-title">${title}</h2>${body}<div class="dialog-actions">${buttons.map((b,i)=>`<button class="button ${i?'secondary':''}" type="button" data-action="${i}">${b.label}</button>`).join('')}</div>`;
  main.append(d);d.showModal();buttons.forEach((b,i)=>d.querySelector(`[data-action="${i}"]`).addEventListener('click',()=>b.action(d)));d.addEventListener('close',()=>d.remove());return d;
}
function pauseDialog(){
  recorder?.stop();persistDraft();
  dialog('Перерыв', '<p>Отправленные ответы уже сохранены. Текущий черновик останется на этом устройстве. Вернуться можно с вашим кодом или логином и паролем.</p><p>До завершения исследования, пожалуйста, не обсуждайте содержание панелей с другими участниками.</p>',[
    {label:'Продолжить опрос',action:d=>d.close()},
    {label:'Выйти и сделать перерыв',action:d=>{d.close();storageWrite('vision-token',null);session=null;location.hash='home'}},
  ]);
}
function audioConsentDialog(){
  dialog('Ответить голосом?', '<p>Голосовой ответ сохраняется в закрытой папке Google Диска. Доступ есть у команды исследования. Запись можно прослушать и удалить до отправки.</p><p>Нажимая «Разрешить», вы соглашаетесь на сохранение голосовых ответов для этого исследования. Можно продолжить текстом.</p>',[
    {label:'Разрешить голосовые ответы',action:async d=>{const consent={...session.answers.consent,value:{...session.answers.consent.value,audio:true}};const button=d.querySelector('button');button.disabled=true;try{const result=await api('save',{token:session.token,id:'consent',requestId:crypto.randomUUID(),answer:{value:consent.value}});session.answers.consent=result.answer;d.close();refreshRecording()}catch(error){button.disabled=false;d.querySelector('p').textContent=error.message}}},
    {label:'Продолжить текстом',action:d=>d.close()},
  ]);
}
async function saveStep(step){
  if(busy||recorder?.active)return;
  $('question-error').textContent='';
  if(step.kind==='consent'&&(!currentDraft.value?.adult||!currentDraft.value?.data)){$('question-error').textContent='Для участия нужно подтвердить возраст и добровольное согласие. Если вы не хотите участвовать, можно вернуться на главную.';return}
  if((step.kind==='choice'||step.kind==='scale')&&!currentDraft.value){$('question-error').textContent='Выберите ответ. Можно выбрать вариант без оценки.';return}
  if(step.kind==='explore'&&!currentDraft.value?.seconds){$('question-error').textContent='Сначала исследуйте панель и включите отсчёт. Когда закончите, нажмите «Готово».';return}
  if(step.required&&!currentDraft.text?.trim()&&!currentDraft.blob&&!(currentAnswer().hasAudio&&!currentDraft.removeAudio)){$('question-error').textContent='Добавьте описание текстом или голосом. Если изображение не удалось распознать, так и скажите.';$('answer-text')?.focus();return}
  if(demo){clearMedia();main.innerHTML=`<section class="page-shell"><div class="done-symbol" aria-hidden="true">✓</div><h1>Пробный опрос завершён.</h1><p class="lead">В настоящем опросе вопросы будут появляться по одному. Голос можно прослушать перед отправкой, а на любом шаге — сделать перерыв.</p><p class="small muted">Пробный ответ удалён. Ничего не отправлялось.</p><a class="button" href="#booking">Выбрать посещение →</a><p><a class="text-button" href="#access">Войти с выданным доступом</a></p></section>`;focusHeading();return}
  busy=true;$('next-step').disabled=true;$('previous-step').disabled=true;
  $('save-caption').textContent=step.kind==='review'?'Завершаем участие…':'Сохраняем ответ…';
  await persistDraft();
  try{
    if(step.kind==='review'){
      const result=await api('finish',{token:session.token,requestId:currentDraft.requestId});session.status='completed';session.receipt=result.receipt;location.hash='done';return;
    }
    const answer={text:currentDraft.text||'',value:currentDraft.value??null,skipped:step.kind==='text'&&!step.required&&!currentDraft.text?.trim()&&!currentDraft.blob&&(!currentAnswer().hasAudio||currentDraft.removeAudio),keepAudio:currentAnswer().hasAudio&&!currentDraft.removeAudio};
    if(currentDraft.blob)answer.audio=await encodeAudio(currentDraft.blob);
    const result=await api('save',{token:session.token,id:step.id,requestId:currentDraft.requestId,answer},currentDraft.blob?90000:45000);
    session.answers[step.id]=result.answer;await drafts.delete(draftKey()).catch(()=>{});stepIndex++;await renderStep();announce('Ответ сохранён. Следующий вопрос.');
  }catch(error){$('question-error').textContent=error.message;$('save-caption').textContent='Ответ пока не подтверждён сервером. Черновик сохранён на устройстве.';$('next-step').disabled=false;$('previous-step').disabled=false;if(['AUTH','DISABLED'].includes(error.code))$('question-error').innerHTML=`${esc(error.message)} <a href="#access">Войти снова</a>`}
  finally{busy=false}
}
function done(){
  document.title='Спасибо за участие · За пределами зрения';
  main.innerHTML=`<section class="page-shell"><div class="eyebrow">Исследование завершено</div><div class="done-symbol" aria-hidden="true">✓</div><h1>Спасибо за участие</h1><p class="lead">Спасибо. Ответы сохранены и помогут сделать тактильное искусство понятнее.</p><div class="notice neutral"><p>Пожалуйста, пока не обсуждайте содержание панелей с теми, кто ещё участвует. Организатор пригласит вас к общему обсуждению отдельно.</p></div><p class="small muted">Номер подтверждения<br><span class="receipt">${esc(session?.receipt||'')}</span></p><a class="button" href="#home">Вернуться на главную <span aria-hidden="true">→</span></a><div class="withdraw-zone"><p class="small muted">Если вы передумали участвовать, можно отозвать ответы этой анкеты.</p><button class="text-button" id="withdraw-button" type="button">Отозвать мои ответы</button><p id="withdraw-error" class="error-message" role="alert"></p></div></section>`;
  $('withdraw-button').addEventListener('click',()=>dialog('Отозвать участие?', '<p>Ответы этой анкеты будут помечены как отозванные и исключены из исследования. Связанные голосовые файлы будут перемещены в корзину. Для удаления записи на посещение обратитесь к организатору.</p>',[
    {label:'Оставить ответы',action:d=>d.close()},
    {label:'Отозвать участие',action:async d=>{d.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api('withdraw',{token:session.token});storageWrite('vision-token',null);session=null;d.close();main.innerHTML='<section class="page-shell"><h1>Участие отозвано.</h1><p class="lead">Ваши ответы исключены из исследования.</p><a class="button" href="#home">На главную →</a></section>';focusHeading()}catch(error){d.close();$('withdraw-error').textContent=error.message}}},
  ]));
}
function privacy(){
  document.title='О ваших данных · За пределами зрения';
  main.innerHTML=`<article class="page-shell privacy"><a class="back-link" href="${session?'#study':'#home'}">← ${session?'Вернуться к опросу':'На главную'}</a><div class="eyebrow">О ваших данных</div><h1>О ваших данных</h1><p class="lead">Мы собираем данные для организации посещений и исследования тактильных интерпретаций картин в Технопарке РГСУ.</p><h2>Запись на посещение</h2><p>В форме записи нужны ФИО, электронная почта, телефон и выбранное время. Эти данные сохраняются в закрытой Google Таблице и доступны организаторам. В открытом календаре показаны только время, место и количество свободных мест.</p><h2>Ответы в исследовании</h2><p>Опрос сохраняет номер участника, последовательность панелей, ответы, оценки и время исследования. ФИО, диагноз и медицинские документы для опроса не нужны. Организатор может сопоставить номер участника с записью на посещение, поэтому ответы не считаются полностью анонимными.</p><h2>Голосовые ответы</h2><p>Запись включается только по вашей команде и с отдельного согласия. Перед отправкой её можно прослушать или удалить. Аудиофайлы сохраняются в закрытой папке Google Диска, а ссылка и текст ответа — в таблице. Автоматического распознавания голоса сторонним сервисом нет. Использование диктовки клавиатуры регулируется настройками вашего телефона.</p><h2>Черновики и доступ</h2><p>Неотправленные ответы временно хранятся в браузере этого устройства. После подтверждённого сохранения черновик соответствующего вопроса удаляется. Не используйте общий телефон для личных ответов. Код или пароль предназначен только для вас. Передача данных идёт по HTTPS.</p><h2>Как отказаться</h2><p>Можно пропустить отдельный вопрос, сделать перерыв или завершить участие без отправки анкеты. После завершения на странице подтверждения доступен отзыв ответов. Чтобы удалить запись на посещение, заменить доступ или задать вопрос о сроке хранения, обратитесь к организатору, который пригласил вас.</p><p class="small">Редакция от 11 ноября 2026 года.</p></article>`;
}
function visit(){
  const address='Москва, улица Вильгельма Пика, 4, строение 8';
  const map='https://yandex.ru/maps/?text='+encodeURIComponent(address+' РГСУ');
  document.title='Как нас найти · За пределами зрения';
  main.innerHTML=`<section class="page-shell visit-page"><a class="back-link" href="#home">← На главную</a><div class="eyebrow">Как нас найти</div><h1>Как добраться</h1><p class="lead">Исследование проходит на базе Технопарка Российского государственного социального университета.</p><div class="address-card"><span class="small muted">Москва</span><h2>Вильгельма Пика, 4<br>строение 8</h2><p>Посещение по предварительной записи.</p><a class="button" href="${map}" target="_blank" rel="noopener noreferrer">Построить маршрут <span aria-hidden="true">↗</span><span class="sr-only"> в Яндекс Картах, в новой вкладке</span></a><button class="text-button" id="copy-address" type="button">Скопировать адрес</button><p class="small muted" id="copy-status" role="status"></p></div><div class="visit-details"><h2>Если нужна встреча</h2><p>Укажите это в поле «Нужна ли помощь при посещении?» при записи. Организатор сможет согласовать встречу у входа и помочь добраться до места исследования.</p><h2>Перед посещением</h2><p>Проверьте время в письме с подтверждением. В том же письме находятся логин, пароль и код участника. Точный вход и аудиторию уточните у организатора.</p></div><a class="download-card" href="assets/visit-guide.pdf" download><span>Памятка участника<small>Адрес, маршрут на карте и подготовка к посещению · PDF</small></span><span aria-hidden="true">↓</span></a><a class="button" href="#booking">Выбрать время посещения <span aria-hidden="true">→</span></a></section>`;
  $('copy-address').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(address);$('copy-status').textContent='Адрес скопирован.'}catch{$('copy-status').textContent=address}});
}
async function route(){
  const target=(location.hash||'#home').slice(1).split('?')[0];
  if(busy&&currentRoute==='study'){location.hash='study';return}
  if(currentRoute==='study'&&session&&!demo)await persistDraft();
  clearMedia();currentRoute=target;
  if(['home','about','participate',''].includes(target)){
    demo=false;if(target==='about'||target==='participate')about();else home();focusHeading();return;
  }
  if(target==='access'){demo=false;access();focusHeading();return}
  if(target==='booking'){demo=false;await renderBooking(main,{focusHeading,announce,esc});return}
  if(target==='visit'){demo=false;visit();focusHeading();return}
  if(target==='privacy'){privacy();focusHeading();return}
  if(target==='demo'){
    demo=true;steps=[{id:'demo',kind:'text',required:false,section:'Пробный вопрос',title:'Какой предмет приятно держать в руках?',text:'Вспомните предмет с приятной фактурой. Расскажите о нём текстом или голосом. Это только знакомство с интерфейсом.',label:'Пробный ответ'}];stepIndex=0;currentDraft={};await renderStep();return;
  }
  if(target==='study'||target==='done'){
    demo=false;
    if(!session){
      const token=storageRead('vision-token');if(!token){location.hash='access';return}
      main.innerHTML='<section class="page-shell"><h1>Открываем анкету</h1><p role="status">Открываем сохранённые ответы…</p></section>';
      try{const result=await api('resume',{token});session={...result.session,token};steps=createSteps(session.schedule);stepIndex=firstUnanswered()}catch(error){storageWrite('vision-token',null);access();if($('access-error'))$('access-error').textContent=error.message;focusHeading();return}
    }
    if(session.status==='completed'){done();focusHeading();return}
    if(!steps.length||steps.length===1)steps=createSteps(session.schedule);
    await renderStep();return;
  }
  location.hash='home';
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){recorder?.stop();persistDraft();stopSpeech()}});
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',()=>{recorder?.stop();persistDraft();stopSpeech()});
route();
