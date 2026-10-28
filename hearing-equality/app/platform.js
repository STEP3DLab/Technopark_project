import { CanvasAvatar } from './canvas-avatar.js?v=0.6';
import { createCatalog, matchText, validateMotion } from './catalog.js';
import { makeSequence, classify, sequenceQuality } from './recognizer.js';
import { loadVision, detect, resetVision, drawLandmarks } from './vision.js';
import { SessionLedger, frameReadiness, DEMO_SOURCES } from './session.js?v=0.7';
import { TrialProtocol } from './trial-protocol.js';
const $ = id => document.getElementById(id);
const s = { mode:'text', catalog:[], motions:new Map(), templates:[], templatesReady:false, custom:[], selected:null,
  data:null, time:0, playing:false, raf:0, last:0, compare:false, selectionToken:0, playbackToken:0,
  stream:null, captureToken:0, capturing:false, recordFrames:null, recordTimer:0, recordPending:false, trialContext:null,
  frame:null, analyzing:false, videoReady:false, sampleId:null, videoURL:null, result:null, speech:null };
const ledger = new SessionLedger();
const protocolRuns=[];let protocol=null;
let pendingAttempt = null, confirmedAttempt = null, resetArmed = false;
const dialogueAvatar = new CanvasAvatar($('dialogue-avatar'));
dialogueAvatar.setScene('dark');dialogueAvatar.setAppearance({outfit:'indigo'});
const avatar = new CanvasAvatar($('platform-avatar')); avatar.setScene('dark'); avatar.setAppearance({outfit:'indigo'});
const video = $('source-video'), inputVideo = $('input-video');
let toastTimer, lastFocus;
function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,4500); }
function notice(id,message,kind='') { const el=$(id);el.textContent=message;el.className=`notice ${kind}`;el.hidden=!message;if(id==='text-notice'&&s.mode==='dialogue'&&message)$('reply-status').textContent=message;if(id==='capture-notice'){const target=$('dialogue-guidance');target.textContent=message;target.className=`notice ${kind}`;target.hidden=!message;} }
function format(seconds) { return `${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`; }
function renderPlayback() {
  $('timeline').value=s.data?Math.round(s.time/s.data.duration*1000):0;
  $('play-time').textContent=format(s.time);$('duration').textContent=format(s.data?.duration||0);
  $('play').innerHTML=s.playing?'Ⅱ':'<svg><use href="#i-play"/></svg>';
  $('play').setAttribute('aria-label',s.playing?'Пауза':'Воспроизвести');
  $('play').disabled=!s.data; $('replay').disabled=!s.data;
  avatar.showAt(s.time);dialogueAvatar.showAt(s.time);
}
function pauseAvatar() {++s.playbackToken;s.playing=false;cancelAnimationFrame(s.raf);s.raf=0;video.pause();renderPlayback();}
function tick(now) {
  if(!s.playing||!s.data)return;
  s.time=s.compare?Math.min(s.data.duration,video.currentTime):Math.min(s.data.duration,s.time+(now-s.last)/1000*Number($('speed').value));
  s.last=now;renderPlayback();
  if(s.time>=s.data.duration-.01){pauseAvatar();return;}s.raf=requestAnimationFrame(tick);
}
async function playAvatar() {
  if(!s.data||!['text','dialogue'].includes(s.mode))return;
  const token=s.selectionToken,playToken=++s.playbackToken;
  if(s.time>=s.data.duration-.03)s.time=0;
  s.playing=true;
  if(s.compare){
    video.currentTime=s.time;video.playbackRate=Number($('speed').value);
    try{await video.play();}catch{
      if(playToken!==s.playbackToken||token!==s.selectionToken||!s.playing)return;
      pauseAvatar();notice('text-notice','Видео не запускается. Попробуйте режим «Аватар».','error');return;
    }
  }
  if(playToken!==s.playbackToken)return;
  if(token!==s.selectionToken||!s.playing||!['text','dialogue'].includes(s.mode)){video.pause();return;}
  s.last=performance.now();cancelAnimationFrame(s.raf);s.raf=requestAnimationFrame(tick);renderPlayback();
}
async function selectWord(id,autoplay=false) {
  const item=s.catalog.find(x=>x.id===id);if(!item)return;
  const token=++s.selectionToken;pauseAvatar();s.data=null;s.selected=item;s.time=0;avatar.clear();dialogueAvatar.clear();
  $('active-word').textContent='Загрузка…';$('message').value=item.text;updateCount();
  notice('text-notice','');renderPlayback();
  for(const button of $('word-chips').children)button.setAttribute('aria-pressed',String(button.dataset.id===id));
  try{
    let data=s.motions.get(id);
    if(!data){const r=await fetch(item.motion);if(!r.ok)throw new Error('Движение недоступно');data=validateMotion(await r.json());s.motions.set(id,data);}
    if(token!==s.selectionToken)return;
    s.data=data;avatar.load(data);dialogueAvatar.load(data);video.src=item.video;video.load();$('active-word').textContent=item.text;$('dialogue-active-word').textContent=item.text;renderPlayback();
    if(autoplay){if(s.mode==='text'&&matchMedia('(max-width: 700px)').matches)document.querySelector('.avatar-card').scrollIntoView({block:'start'});playAvatar();}
  }catch{if(token===s.selectionToken){$('active-word').textContent='Нет связи';notice('text-notice','Не удалось открыть движение. Проверьте соединение и выберите слово ещё раз.','error');}}
}
function updateCount(){$('char-count').textContent=`${$('message').value.length} / 200`;}
$('message').addEventListener('input',updateCount);
$('text-form').addEventListener('submit',e=>{
  e.preventDefault();const item=matchText($('message').value,s.catalog);
  if(item){selectWord(item.id,true);return;}
  ++s.selectionToken;pauseAvatar();s.data=null;s.selected=null;s.time=0;avatar.clear();dialogueAvatar.clear();$('dialogue-active-word').textContent='Ответ текстом';video.removeAttribute('src');video.load();
  $('active-word').textContent='Нет в словаре';renderPlayback();
  for(const button of $('word-chips').children)button.setAttribute('aria-pressed','false');
  notice('text-notice','Для этого сообщения нет записи. Выберите одно из шести слов. Отрицания и предложения требуют отдельного перевода.','error');
});
$('play').onclick=()=>s.playing?pauseAvatar():playAvatar();
$('replay').onclick=()=>{pauseAvatar();s.time=0;playAvatar();};
$('timeline').addEventListener('input',()=>{const ratio=Number($('timeline').value)/1000;pauseAvatar();if(!s.data)return;s.time=ratio*s.data.duration;if(video.readyState>=1)video.currentTime=s.time;renderPlayback();});
$('speed').onchange=()=>{video.playbackRate=Number($('speed').value);s.last=performance.now();};
function setCompare(value){const resume=s.playing;pauseAvatar();s.compare=value;$('source-video').hidden=!value;$('stage').classList.toggle('compare',value);$('show-avatar').setAttribute('aria-pressed',String(!value));$('show-compare').setAttribute('aria-pressed',String(value));avatar.resize();if(resume)playAvatar();}
$('show-avatar').onclick=()=>setCompare(false);$('show-compare').onclick=()=>setCompare(true);
video.addEventListener('ended',pauseAvatar);
video.addEventListener('error',()=>{if(s.compare&&s.data){pauseAvatar();notice('text-notice','Исходное видео недоступно. Можно посмотреть движение аватара.','error');}});
function stopDictation(){if(s.speech){s.speech.abort();s.speech=null;}$('dictate').classList.remove('recording');$('dictate').setAttribute('aria-label','Ввести голосом');}
$('dictate').onclick=()=>{
  if(s.speech){stopDictation();return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){notice('text-notice','В этом браузере нет голосового ввода. Введите слово с клавиатуры.');return;}
  pauseAvatar();const rec=new Recognition();s.speech=rec;rec.lang='ru-RU';rec.interimResults=false;rec.maxAlternatives=1;
  $('dictate').classList.add('recording');$('dictate').setAttribute('aria-label','Остановить голосовой ввод');
  notice('text-notice','Слушаю. Произнесите одно слово из словаря.');
  rec.onresult=e=>{if(s.speech!==rec)return;const heard=e.results[0][0].transcript.slice(0,200);if(s.mode==='dialogue'){$('employee-text').value=heard;$('reply-status').textContent='Голос распознан. Проверьте текст перед отправкой.';}else{$('message').value=heard;updateCount();notice('text-notice','Текст готов. Проверьте его и нажмите «Показать жест».');}};
  rec.onerror=e=>{if(s.speech!==rec)return;notice('text-notice',e.error==='not-allowed'?'Микрофон не разрешён. Можно ввести слово вручную.':'Не удалось распознать голос. Попробуйте ещё раз или введите слово.','error');};
  rec.onend=()=>{if(s.speech===rec){s.speech=null;$('dictate').classList.remove('recording');$('dictate').setAttribute('aria-label','Ввести голосом');}};
  try{rec.start();}catch{stopDictation();notice('text-notice','Не удалось запустить голосовой ввод. Введите текст вручную.','error');}
};
function speak(text){
  if(!text?.trim()){toast('Сначала добавьте текст.');return;}
  if(!window.speechSynthesis){toast('Озвучивание недоступно в этом браузере.');return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text.trim());utterance.lang='ru-RU';utterance.rate=.9;
  const voices=speechSynthesis.getVoices();const voice=voices.find(v=>/^ru/i.test(v.lang));if(voice)utterance.voice=voice;
  utterance.onerror=e=>{if(e.error!=='interrupted'&&e.error!=='canceled')toast('Не удалось озвучить. Проверьте громкость и русский голос в настройках устройства.');};
  speechSynthesis.speak(utterance);
}
$('speak').onclick=()=>{if(confirmedAttempt)speak(s.result?.text);};
$('add-word').onclick=()=>{if(!s.result||!confirmedAttempt)return;$('conversation').value=[$('conversation').value,s.result.text.replace(/[!.]$/,'')].filter(Boolean).join(' ').slice(0,500);toast('Слово добавлено. Сообщение можно отредактировать.');};
$('speak-message').onclick=()=>speak($('conversation').value);
$('clear-message').onclick=()=>{$('conversation').value='';window.speechSynthesis?.cancel();};
function clearResult(){pendingAttempt=null;confirmedAttempt=null;$('visitor-text').value='';$('capture-confirm-text').value='';$('dialogue-candidates').replaceChildren();$('capture-confirm').disabled=true;$('capture-reject').disabled=true;s.result=null;$('result-label').textContent='СЛОВО ПОЯВИТСЯ ЗДЕСЬ';$('result-word').textContent='Покажите один жест';$('result-description').textContent='Проверим сходство с образцами и предложим слово.';$('rankings').replaceChildren();$('speak').disabled=true;$('add-word').disabled=true;}
function showResult(frames,aspect,origin='camera',elapsedMs=0){
  const sequence=makeSequence(frames,aspect);const result=classify(sequence,[...s.templates,...s.custom]);
  s.result=result.accepted?result.rankings[0]:null;
  $('result-label').textContent=result.accepted?'ПРЕДПОЛОЖЕНИЕ ПО ДВИЖЕНИЮ':'НУЖНА ЕЩЁ ОДНА ПОПЫТКА';
  $('result-word').textContent=s.result?.text||'Не распознано';
  $('result-description').textContent=result.accepted?(s.result.origin==='custom'?'Совпадение с вашим образцом. Подпись задана пользователем; это не проверка РЖЯ.':'Ближайший образец из шести слов Slovo. Проверьте результат перед озвучиванием.'):result.issue;
  $('speak').disabled=true;$('add-word').disabled=true;
  $('rankings').replaceChildren();
  for(const candidate of result.rankings.slice(0,3)){
    const row=document.createElement('div');row.className='rank-row';const label=document.createElement('b');label.textContent=candidate.text;const metric=document.createElement('span');metric.textContent=`d = ${candidate.distance.toFixed(3)}`;row.append(label,metric);$('rankings').append(row);
  }
  if(result.rankings.length){const caption=document.createElement('div');caption.className='rank-caption';caption.textContent='Расстояние d: меньше — ближе к образцу. Это не вероятность.';$('rankings').append(caption);}
  pendingAttempt=ledger.addAttempt({source:origin,accepted:result.accepted,predicted:s.result?.text||'',predictedId:s.result?.id||'',protocol:origin==='camera'?s.trialContext:null,distance:result.rankings[0]?.distance,elapsedMs,frames:frames.length,personalSamples:s.custom.length>0});
  if(origin==='camera'&&s.trialContext){protocol?.record(pendingAttempt,s.trialContext);s.trialContext=null;renderProtocol();}
  confirmedAttempt=null;
  $('visitor-text').value=s.result?.text||'';$('capture-confirm-text').value=s.result?.text||'';
  $('capture-confirm').disabled=false;$('capture-reject').disabled=false;
  $('visitor-origin').textContent=DEMO_SOURCES.has(origin)?'Демопример. Это известная запись из набора образцов.':'Это предположение. Проверьте слово или выберите другой вариант.';
  $('dialogue-candidates').replaceChildren();
  for(const candidate of result.rankings.slice(0,3)){
    const button=document.createElement('button');button.textContent=candidate.text;button.type='button';button.onclick=()=>{$('visitor-text').value=candidate.text;$('capture-confirm-text').value=candidate.text;};$('dialogue-candidates').append(button);
  }
  updateResearch();
  return sequence;
}
async function ensureTemplates(){
  if(s.templatesReady)return;
  if(!s.catalog.length)throw new Error('Словарь ещё не загружен. Обновите страницу.');
  const response=await fetch('./assets/recognition-library.json?v=0.7');
  if(!response.ok)throw new Error('Не удалось загрузить образцы. Повторите запуск.');
  const data=await response.json();
  if(data?.schema_version!==1||!Array.isArray(data.entries)||!data.entries.length||
    data.entries.some(x=>!s.catalog.some(c=>c.id===x.id)||x.split!=='train'||!Array.isArray(x.sequence)||x.sequence.length<6)||
    s.catalog.some(c=>!data.entries.some(x=>x.id===c.id)))throw new Error('Некорректная библиотека образцов. Обновите страницу.');
  s.templates=data.entries;s.templatesReady=true;
}
function resetOverlay(){const canvas=$('landmarks');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);}
function cameraButtons(){const active=Boolean(s.stream);$('dialogue-start').hidden=active;$('dialogue-stop').hidden=!active;$('dialogue-record').disabled=!active||Boolean(s.recordFrames)||s.recordPending||!s.capturing;$('dialogue-facing').disabled=active;$('dialogue-start').disabled=$('start-camera').disabled;$('start-camera').hidden=active;$('stop-camera').hidden=!active;$('record').disabled=!active||Boolean(s.recordFrames)||s.recordPending||!s.capturing;$('enroll').disabled=!active||Boolean(s.recordFrames)||s.recordPending||!s.capturing;$('facing').disabled=active;}
function stopCapture(){
  ++s.captureToken;s.capturing=false;s.recordFrames=null;s.recordPending=false;s.trialContext=null;clearTimeout(s.recordTimer);s.recordTimer=0;
  s.stream?.getTracks().forEach(track=>track.stop());s.stream=null;inputVideo.pause();inputVideo.srcObject=null;
  $('record-indicator').hidden=true;$('tracking-state').textContent='Ожидает запуска';$('body-check').textContent='Корпус: —';$('hands-check').textContent='Кисти: —';$('camera-placeholder').hidden=s.mode==='video'&&s.videoReady;
  $('start-camera').disabled=false;cameraButtons();resetOverlay();
  s.analyzing=false;$('analysis-progress').hidden=true;$('cancel-video').hidden=true;$('analyze-video').disabled=!s.videoReady;$('replay-analysis').disabled=!s.videoReady||!s.sampleId;
}
async function startCamera(){
  stopCapture();clearResult();s.videoReady=false;$('camera-placeholder').hidden=false;s.sampleId=null;$('replay-analysis').disabled=true;const token=s.captureToken;
  inputVideo.removeAttribute('src');inputVideo.load();$('start-camera').disabled=true;cameraButtons();
  notice('capture-notice','Подготавливаем камеру и модель. При первом запуске загрузка может занять до минуты.');
  $('tracking-state').textContent='Загрузка модели…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Камера недоступна. Откройте страницу по HTTPS в браузере телефона.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:$('facing').value},width:{ideal:640},height:{ideal:480}}});
    if(token!==s.captureToken){stream.getTracks().forEach(t=>t.stop());return;}
    s.stream=stream;inputVideo.srcObject=stream;await inputVideo.play();
    if(token!==s.captureToken)return;
    $('camera-placeholder').hidden=true;$('capture-stage').classList.toggle('mirrored',$('facing').value==='user');cameraButtons();
    await Promise.all([loadVision(),ensureTemplates()]);await resetVision();
    if(token!==s.captureToken)return;
    s.capturing=true;cameraButtons();
    notice('capture-notice','Камера готова. После нажатия — 2 секунды на подготовку и 3 секунды на один жест.');
    cameraLoop(token);
  }catch(error){if(token!==s.captureToken)return;stopCapture();const message=error.name==='NotAllowedError'?'Доступ к камере не разрешён. Разрешите его в настройках браузера или откройте режим видео.':error.name==='NotFoundError'?'Камера не найдена. Можно проверить режим видео.':error.message;notice('capture-notice',message,'error');}
}
async function cameraLoop(token){
  if(!s.capturing||token!==s.captureToken)return;
  try{
    const frame=await detect(inputVideo);
    if(token!==s.captureToken)return;
    s.frame=frame;const readiness=frameReadiness(frame);$('body-check').textContent=readiness.body?'Корпус виден':'Корпус не найден';$('hands-check').textContent=`Кисти целиком: ${readiness.hands} / 2`;drawLandmarks($('landmarks'),frame,inputVideo.videoWidth,inputVideo.videoHeight);
    $('tracking-state').textContent=frame.pose?`${Number(Boolean(frame.left))+Number(Boolean(frame.right))} / 2 кисти в кадре`:'Корпус не найден';
    if(s.recordFrames)s.recordFrames.push(frame);
  }catch(error){if(token===s.captureToken){stopCapture();notice('capture-notice',error.message,'error');}return;}
  requestAnimationFrame(()=>cameraLoop(token));
}
function recordGesture(enroll=false){
  if(!s.capturing||s.recordFrames||s.recordPending)return;
  if(!enroll&&s.mode==='camera'&&protocol&&!protocol.ended&&!protocol.context()){toast('Перейдите к следующей попытке серии.');return;}
  const label=$('custom-label').value.trim();
  if(enroll&&!label){toast('Введите подпись к вашему движению.');$('custom-label').focus();return;}
  if(enroll&&s.custom.length>=12){toast('Доступно 12 собственных образцов. Удалите прежние, чтобы записать новые.');return;}
  const token=s.captureToken;clearResult();s.recordPending=true;s.trialContext=!enroll&&s.mode==='camera'?(protocol?.context()||null):null;cameraButtons();renderProtocol();$('record-indicator').hidden=false;
  const requested=performance.now();let start=null;
  const update=()=>{
    if(token!==s.captureToken||(!s.recordPending&&!s.recordFrames))return;
    if(start===null){
      const prep=2-(performance.now()-requested)/1000;
      if(prep>0){$('record-count').textContent='Приготовьтесь · '+Math.ceil(prep);s.recordTimer=setTimeout(update,80);return;}
      start=performance.now();s.recordPending=false;s.recordFrames=[];cameraButtons();
    }
    const remaining=Math.max(0,3-(performance.now()-start)/1000);$('record-count').textContent=remaining.toFixed(1)+' с';
    if(remaining>0){s.recordTimer=setTimeout(update,80);return;}
    const frames=s.recordFrames;s.recordFrames=null;$('record-indicator').hidden=true;cameraButtons();
    if(enroll){
      const sequence=makeSequence(frames,inputVideo.videoWidth/inputVideo.videoHeight);const issue=sequenceQuality(sequence);
      if(issue){notice('capture-notice',issue+' Образец не сохранён.','error');return;}
      const existing=s.custom.find(t=>t.text.toLocaleLowerCase('ru')===label.toLocaleLowerCase('ru'));
      const known=matchText(label,s.catalog);
      s.custom.push({id:known?.id||existing?.id||`custom-${Date.now()}`,text:known?.text||label,origin:'custom',sequence});
      $('custom-list').textContent=`Образцы этой сессии (${s.custom.length}/12): ${s.custom.map(t=>t.text).join(', ')}`;$('clear-custom').hidden=false;
      notice('capture-notice',`Образец «${label}» добавлен. Теперь нажмите «Записать жест» и повторите движение для распознавания.`,'success');
    }else{showResult(frames,inputVideo.videoWidth/inputVideo.videoHeight,'camera',performance.now()-requested);notice('capture-notice','Запись завершена. Проверьте слово ниже или справа.');}
    renderProtocol();
  };update();
}
$('start-camera').onclick=startCamera;
$('stop-camera').onclick=()=>{stopCapture();notice('capture-notice','Камера выключена. Видеопоток не сохранялся.');};
$('record').onclick=()=>recordGesture();$('enroll').onclick=()=>recordGesture(true);
$('clear-custom').onclick=()=>{s.custom=[];$('custom-list').textContent='Образцы удалены.';$('clear-custom').hidden=true;clearResult();};
function releaseFile(){if(s.videoURL){URL.revokeObjectURL(s.videoURL);s.videoURL=null;}}
function waitMedia(event,action,timeout=12000){return new Promise((resolve,reject)=>{
  let timer;const clean=()=>{clearTimeout(timer);inputVideo.removeEventListener(event,ok);inputVideo.removeEventListener('error',bad);};
  const ok=()=>{clean();resolve();};const bad=()=>{clean();reject(new Error('Видео не поддерживается или не загрузилось. Попробуйте MP4 (H.264).'));};
  inputVideo.addEventListener(event,ok,{once:true});inputVideo.addEventListener('error',bad,{once:true});timer=setTimeout(()=>{clean();reject(new Error('Не удалось прочитать видео вовремя. Попробуйте другой файл.'));},timeout);action();
});}
async function loadVideo(src,name,sampleId=null){
  stopCapture();clearResult();s.videoReady=false;$('camera-placeholder').hidden=false;s.sampleId=sampleId;$('replay-analysis').disabled=true;const token=s.captureToken;$('capture-stage').classList.remove('mirrored');$('analyze-video').disabled=true;inputVideo.controls=true;
  notice('capture-notice',`Открываем: ${name}`);
  try{
    await waitMedia('loadedmetadata',()=>{inputVideo.src=src;inputVideo.load();});
    if(token!==s.captureToken)return;
    if(!Number.isFinite(inputVideo.duration)||inputVideo.duration<.3||inputVideo.duration>15)throw new Error('Нужен короткий ролик с одним жестом: от 0,3 до 15 секунд.');
    s.videoReady=true;$('replay-analysis').disabled=!s.sampleId;$('camera-placeholder').hidden=true;$('analyze-video').disabled=false;$('tracking-state').textContent=`${name} · ${inputVideo.duration.toFixed(1)} с`;
    notice('capture-notice','Видео готово. Нажмите «Распознать видео». Файл обрабатывается в браузере и не загружается на сервер.');
  }catch(error){if(token===s.captureToken){inputVideo.removeAttribute('src');inputVideo.load();notice('capture-notice',error.message,'error');}}
}
$('video-file').onchange=()=>{const file=$('video-file').files[0];if(!file)return;if(file.size>50*1024*1024){notice('capture-notice','Файл больше 50 МБ. Выберите короткий ролик.','error');return;}releaseFile();s.videoURL=URL.createObjectURL(file);loadVideo(s.videoURL,file.name);};
$('cancel-video').onclick=()=>{stopCapture();$('camera-placeholder').hidden=!s.videoReady;inputVideo.controls=true;notice('capture-notice','Анализ отменён.');};
$('analyze-video').onclick=async()=>{
  if(!s.videoReady||s.analyzing)return;
  inputVideo.pause();inputVideo.controls=false;clearResult();const token=++s.captureToken;s.analyzing=true;$('analyze-video').disabled=true;$('cancel-video').hidden=false;$('replay-analysis').disabled=true;$('analysis-progress').value=0;$('analysis-progress').hidden=false;
  notice('capture-notice','Подготавливаем модель для анализа кадров. Первая загрузка может занять до минуты.');
  const frames=[],analysisStarted=performance.now();
  try{
    await Promise.all([loadVision(),ensureTemplates()]);await resetVision();
    if(token!==s.captureToken)return;
    const count=Math.max(6,Math.ceil(inputVideo.duration*12));
    for(let i=0;i<count;i++){
      if(token!==s.captureToken)return;
      const time=i/count*Math.max(0,inputVideo.duration-.04);
      if(Math.abs(inputVideo.currentTime-time)>.001||inputVideo.readyState<2)await waitMedia('seeked',()=>{inputVideo.currentTime=time===0?.001:time;});
      if(token!==s.captureToken)return;
      const frame=await detect(inputVideo);
      if(token!==s.captureToken)return;
      frames.push(frame);drawLandmarks($('landmarks'),frame,inputVideo.videoWidth,inputVideo.videoHeight);
      $('analysis-progress').value=(i+1)/count;$('tracking-state').textContent=`Кадр ${i+1} / ${count}`;
      notice('capture-notice',`Анализируем движение: ${Math.round((i+1)/count*100)}%`);
    }
    showResult(frames,inputVideo.videoWidth/inputVideo.videoHeight,s.sampleId?'known-video':'video',performance.now()-analysisStarted);
    notice('capture-notice',`Обработано ${frames.length} кадров. Результат — сравнение с ограниченным набором образцов.`,'success');
  }catch(error){if(token===s.captureToken)notice('capture-notice',error.message,'error');}
  finally{if(token===s.captureToken){s.analyzing=false;inputVideo.controls=true;$('cancel-video').hidden=true;$('analyze-video').disabled=!s.videoReady;$('replay-analysis').disabled=!s.sampleId;$('analysis-progress').hidden=true;}}
};

// Explicitly labelled replay of previously extracted source coordinates.
// It never claims to run vision inference or validate generalisation.
$('replay-analysis').onclick=async()=>{
  if(!s.videoReady||!s.sampleId||s.analyzing)return;
  inputVideo.pause();inputVideo.controls=false;clearResult();
  const token=++s.captureToken,id=s.sampleId;s.analyzing=true;
  $('replay-analysis').disabled=true;$('analyze-video').disabled=true;$('cancel-video').hidden=false;
  notice('capture-notice','Демонстрационный разбор: используем готовые координаты этой записи. Модель сейчас не запускается.');
  try{
    await ensureTemplates();if(token!==s.captureToken)return;
    const motion=s.motions.get(id);inputVideo.currentTime=0;
    await inputVideo.play();if(token!==s.captureToken){inputVideo.pause();return;}
    await new Promise((resolve,reject)=>{
      const started=performance.now();
      const frame=()=>{
        if(token!==s.captureToken){resolve();return;}
        if(performance.now()-started>15000){reject(new Error('Видео не воспроизводится. Проверьте соединение.'));return;}
        const at=Math.min(motion.frames.length-1,Math.floor(inputVideo.currentTime*motion.fps));
        drawLandmarks($('landmarks'),motion.frames[at],inputVideo.videoWidth,inputVideo.videoHeight);
        $('tracking-state').textContent=`Готовые координаты · кадр ${at+1} / ${motion.frames.length}`;
        if(inputVideo.ended||inputVideo.currentTime>=motion.duration-.04){resolve();return;}
        requestAnimationFrame(frame);
      };frame();
    });
    if(token!==s.captureToken)return;
    showResult(motion.frames,motion.width/motion.height,'reference');
    $('result-label').textContent='ДЕМО · ИЗВЕСТНЫЙ ОБРАЗЕЦ';
    $('result-description').textContent='Сопоставлены готовые координаты с тем же образцом. Это технический разбор, а не новое распознавание видео.';
    notice('capture-notice','Демонстрационный разбор завершён. Для нового видео используйте «Распознать видео».');
  }catch(error){if(token===s.captureToken)notice('capture-notice',error.message,'error');}
  finally{if(token===s.captureToken){s.analyzing=false;inputVideo.pause();inputVideo.controls=true;$('replay-analysis').disabled=false;$('analyze-video').disabled=false;$('cancel-video').hidden=true;}}
};

function setMode(mode){
  if(!['dialogue','research','text','camera','video','about'].includes(mode))mode='dialogue';
  pauseAvatar();stopDictation();stopCapture();window.speechSynthesis?.cancel();s.mode=mode;s.videoReady=false;s.sampleId=null;$('replay-analysis').disabled=true;releaseFile();
  inputVideo.removeAttribute('src');inputVideo.load();inputVideo.controls=false;$('analyze-video').disabled=true;
  $('view-dialogue').hidden=mode!=='dialogue';$('view-research').hidden=mode!=='research';$('intro-banner').hidden=['dialogue','research'].includes(mode);
  $(mode==='dialogue'?'dialogue-camera-slot':'capture-stage-home').append($('capture-stage'));
  if(mode==='dialogue')setCompare(false);
  $('view-text').hidden=mode!=='text';$('view-capture').hidden=!['camera','video'].includes(mode);$('view-about').hidden=mode!=='about';
  for(const button of document.querySelectorAll('[data-mode]')){if(button.dataset.mode===mode)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  const labels={dialogue:'Диалог',research:'Испытание',text:'Текст → жесты',camera:'Жесты → голос',video:'Перевод видео',about:'О проекте'};$('mode-crumb').textContent=labels[mode];
  $('camera-controls').hidden=mode!=='camera';$('video-controls').hidden=mode!=='video';$('enroll-panel').hidden=mode!=='camera';
  $('capture-step').textContent=mode==='video'?'03 / ВИДЕО → ТЕКСТ И ГОЛОС':'02 / ЖЕСТЫ → ТЕКСТ И ГОЛОС';
  $('capture-title').textContent=mode==='video'?'Прочитайте движение':'Дайте жесту голос';$('capture-source-title').textContent=mode==='video'?'Видеозапись':'Камера';
  $('placeholder-title').textContent=mode==='video'?'Жест в записи — тоже диалог':'Начнём с одного жеста';
  $('placeholder-copy').textContent=mode==='video'?'Загрузите короткий ролик или выберите пример Slovo.':'Расположитесь по пояс в кадре. Лицо и обе кисти должны быть видны.';
  $('capture-badge').textContent=mode==='video'?'Файл остаётся на вашем устройстве':'Видеопоток обрабатывается на устройстве';
  $('capture-stage').classList.remove('mirrored');$('camera-placeholder').hidden=false;
  notice('capture-notice','Для первого запуска модели нужен интернет. Сравниваются движения, а не смысл произвольной речи на РЖЯ.');
  clearResult();avatar.resize();dialogueAvatar.resize();updateResearch();renderProtocol();history.replaceState(null,'',`#${mode}`);
}

function renderHistory(){
  const target=$('history-messages');target.replaceChildren();
  if(!ledger.messages.length){const p=document.createElement('p');p.className='history-empty';p.textContent='Здесь появятся подтверждённые реплики обоих собеседников.';target.append(p);return;}
  for(const message of ledger.messages){const row=document.createElement('div');row.className=`message-bubble ${message.role}`;const label=document.createElement('small');label.textContent=(message.role==='visitor'?'Посетитель':'Сотрудник')+(message.kind==='demo'?' · демопример':message.kind==='avatar'?' · слово с аватаром':message.kind==='manual'?' · текст':' · подтверждённое слово');const text=document.createElement('p');text.textContent=message.text;row.append(label,text);target.append(row);}
}
function updateResearch(){
  const totals=ledger.summary();$('metric-total').textContent=totals.total;$('metric-suggested').textContent=totals.suggested;$('metric-rejected').textContent=`Без совпадения: ${totals.rejected}`;
  $('metric-reviewed').textContent=totals.reviewed?`${totals.correct} / ${totals.reviewed}`:'—';$('metric-latency').textContent=totals.medianMs===null?'—':`${(totals.medianMs/1000).toFixed(1)} с`;
  $('metrics-note').textContent=`Демопопытки: ${totals.demo} (исключены из сводки). Попытки при наличии своих образцов: ${totals.personal}. Исправлено: ${totals.corrected}. Это оценки текущей сессии, не независимая проверка качества РЖЯ.`;
  $('trial-empty').hidden=ledger.attempts.length>0;$('trial-rows').replaceChildren();
  const origins={camera:'Камера',video:'Свое видео','known-video':'Видео Slovo · демо',reference:'Готовые точки · демо'};
  const reviews={unreviewed:'Не оценено',correct:'Подтверждено',corrected:'Исправлено',incorrect:'Неверно'};
  for(const attempt of [...ledger.attempts].reverse()){
    const tr=document.createElement('tr');for(const text of [attempt.id,origins[attempt.source]||attempt.source,attempt.protocol?.expectedText||'—',attempt.predicted||'Нет совпадения',reviews[attempt.review],`${(attempt.elapsedMs/1000).toFixed(1)} с`]){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('trial-rows').append(tr);
  }
}
function confirmResult(text,{say=false,dialogue=false}={}){
  const value=text.trim();if(!value){toast('Укажите слово или сообщение.');return;}
  if(pendingAttempt){
    if(!ledger.confirm(pendingAttempt.id,value)){toast('Эта попытка уже оценена. Запишите следующий жест.');return;}
    confirmedAttempt=pendingAttempt.id;s.result={text:value};$('speak').disabled=false;$('add-word').disabled=false;$('capture-confirm').disabled=true;$('capture-reject').disabled=true;
    $('result-word').textContent=value;$('result-label').textContent='ПОДТВЕРЖДЕНО ПОЛЬЗОВАТЕЛЕМ';
  }
  if(dialogue){ledger.addMessage('visitor',value,pendingAttempt?(DEMO_SOURCES.has(pendingAttempt.source)?'demo':'confirmed'):'manual');renderHistory();$('visitor-text').value='';$('visitor-origin').textContent='Реплика добавлена в историю.';}
  updateResearch();if(say)speak(value);
}
$('confirm-visitor').onclick=()=>confirmResult($('visitor-text').value,{say:true,dialogue:true});
$('visitor-text-only').onclick=()=>confirmResult($('visitor-text').value,{dialogue:true});
$('visitor-text').addEventListener('input',()=>{
  if(pendingAttempt&&pendingAttempt.review!=='unreviewed'){
    pendingAttempt=null;confirmedAttempt=null;$('dialogue-candidates').replaceChildren();
    $('visitor-origin').textContent='Новая реплика вводится вручную. Она не учитывается как распознавание.';
  }
});
$('capture-confirm').onclick=()=>confirmResult($('capture-confirm-text').value,{say:$('auto-speak').checked});
$('capture-reject').onclick=()=>{if(pendingAttempt&&ledger.markIncorrect(pendingAttempt.id)){$('capture-confirm').disabled=true;$('capture-reject').disabled=true;s.result=null;$('speak').disabled=true;$('add-word').disabled=true;updateResearch();toast('Попытка отмечена как неверная.');}};
$('send-reply').onclick=()=>{
  const value=$('employee-text').value.trim();if(!value){toast('Введите ответ сотрудника.');return;}
  const item=matchText(value,s.catalog);ledger.addMessage('employee',value,item?'avatar':'manual');renderHistory();
  if(item){selectWord(item.id,true);$('reply-status').textContent='Ответ добавлен. Аватар показывает слово из словаря.';}
  else{++s.selectionToken;pauseAvatar();s.data=null;s.selected=null;s.time=0;avatar.clear();dialogueAvatar.clear();$('active-word').textContent='Текстовый ответ';$('dialogue-active-word').textContent='Ответ текстом';$('reply-status').textContent='Ответ добавлен как текст. Проверенной записи РЖЯ для этого сообщения пока нет.';renderPlayback();}
  $('employee-text').value='';
};
$('dialogue-replay').onclick=()=>{pauseAvatar();s.time=0;playAvatar();};
$('dialogue-start').onclick=()=>{$('facing').value=$('dialogue-facing').value;startCamera();};
$('dialogue-stop').onclick=()=>{stopCapture();notice('capture-notice','Камера выключена.');};
$('dialogue-record').onclick=()=>recordGesture();
$('dialogue-enroll').onclick=()=>{setMode('camera');$('enroll-panel').open=true;};
$('clear-dialogue').onclick=()=>{ledger.messages=[];renderHistory();};
$('dictate-reply').onclick=()=>{if(!(window.SpeechRecognition||window.webkitSpeechRecognition)){toast('Голосовой ввод недоступен. Используйте клавиатуру.');return;}$('reply-status').textContent='Голосовой ввод может отправлять звук службе браузера. Слушаю…';$('dictate').click();};
for(const button of document.querySelectorAll('[data-phrase]'))button.onclick=()=>{$('employee-text').value=button.dataset.phrase;$('reply-status').textContent='Заготовка для пилота. Сейчас доступна только текстом.';};
$('check-device').onclick=()=>{
  const secure=window.isSecureContext||['localhost','127.0.0.1'].includes(location.hostname);
  const camera=Boolean(navigator.mediaDevices?.getUserMedia);const canvas=document.createElement('canvas');let gl=null;
  try{gl=canvas.getContext('webgl2')||canvas.getContext('webgl');}catch{}
  const graphics=Boolean(gl);gl?.getExtension?.('WEBGL_lose_context')?.loseContext();
  const voice=Boolean(window.speechSynthesis);
  $('device-status').textContent=`HTTPS: ${secure?'да':'нет'} · камера API: ${camera?'есть':'нет'} · WebGL: ${graphics?'есть':'нет'} · синтез речи: ${voice?'есть':'нет'}`;
  notice('capture-notice',secure&&camera&&graphics?'Базовые возможности доступны. Включите камеру, чтобы проверить разрешение, модель и видимость рук.':'Часть возможностей недоступна. Для камеры нужны HTTPS и WebGL. Можно общаться текстом и показать разбор встроенного видео.');
};
$('test-sound').onclick=()=>{if(!window.speechSynthesis){$('sound-status').textContent='Синтез речи недоступен';return;}speak('Проверка звука. Равенство по слуху.');$('sound-heard').hidden=false;$('sound-status').textContent='Подтвердите, слышна ли речь';};
$('sound-heard').onclick=()=>{$('sound-status').textContent='Звук подтверждён пользователем';$('sound-heard').hidden=true;};
$('export-session').onclick=()=>{
  const report={...ledger.exportReport(),applicationVersion:'0.7',protocols:protocolRuns.map(p=>p.exportReport())},blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`hearing-equality-session-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('clear-session').onclick=()=>{
  if(!resetArmed){resetArmed=true;$('clear-session').textContent='Подтвердить сброс сессии';setTimeout(()=>{resetArmed=false;$('clear-session').textContent='Начать новую сессию';},6000);return;}
  stopCapture();pauseAvatar();ledger.clear();protocolRuns.length=0;protocol=null;clearResult();renderProtocol();renderHistory();updateResearch();resetArmed=false;$('clear-session').textContent='Начать новую сессию';toast('Новая сессия начата.');
};

function renderProtocol(){
  const active=protocol&&!protocol.ended;
  $('protocol-start').disabled=Boolean(active)||!s.catalog.length;
  $('protocol-resume').hidden=!active;
  $('protocol-live').hidden=!active||s.mode!=='camera';
  if(!protocol){$('protocol-summary').textContent='Серия ещё не начата. Ожидаемые слова задаются до записи.';return;}
  const totals=protocol.summary();
  $('protocol-summary').textContent=`${protocol.participantCode} · верно без исправлений: ${totals.correct} / ${totals.recorded} · ошибок: ${totals.wrong} · отказов: ${totals.rejected} · пропущено: ${totals.skipped} · осталось: ${totals.remaining}`;
  if(active){$('protocol-prompt').textContent=`Попытка ${protocol.index+1} / ${totals.planned}: ${protocol.current.expectedText}`;$('protocol-next').disabled=protocol.current.status==='pending';$('protocol-skip').disabled=protocol.current.status!=='pending'||s.recordPending||Boolean(s.recordFrames);}
}
$('protocol-start').onclick=()=>{
  if(!s.catalog.length||(protocol&&!protocol.ended))return;
  protocol=new TrialProtocol(s.catalog,$('participant-code').value,Date.now());protocolRuns.push(protocol);setMode('camera');
  notice('capture-notice','Включите камеру. Слово серии уже задано; после двух секунд подготовки будет записан жест.');
};
$('protocol-resume').onclick=()=>setMode('camera');
$('protocol-next').onclick=()=>{if(protocol?.next()){clearResult();renderProtocol();if(protocol.ended){setMode('research');toast('Серия завершена. Отчёт можно скачать.');}}};
$('protocol-skip').onclick=()=>{if(!s.recordPending&&!s.recordFrames&&protocol?.skip()){protocol.next();clearResult();renderProtocol();if(protocol.ended)setMode('research');}};
$('protocol-finish').onclick=()=>{stopCapture();protocol?.finish();renderProtocol();setMode('research');};

async function loadBenchmark(){
  try{
    const response=await fetch('./assets/evaluation-v07.json');if(!response.ok)throw new Error();
    const report=await response.json(),now=report.current.summary,before=report.baseline.summary;
    $('benchmark-correct').textContent=`${now.correct} / ${now.total}`;
    $('benchmark-rejected').textContent=now.rejected;$('benchmark-wrong').textContent=now.wrong;
    $('benchmark-note').textContent=`${report.holdout.clips} записей · ${report.holdout.signers} других исполнителей · шесть слов. Раньше: ${before.correct} верных, ${before.rejected} отказов, ${before.wrong} ошибочный ответ. Сейчас: ${report.current.templates} образец от ${report.current.signers} исполнителей. Пороги не менялись.`;
    $('benchmark-rows').replaceChildren();
    for(const row of report.current.rows){const tr=document.createElement('tr');for(const text of [row.expectedText,row.accepted?row.nearestText:'Отказ',row.correct?'Совпадение':row.accepted?'Ошибка':'Нет уверенного ответа']){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('benchmark-rows').append(tr);}
  }catch{$('benchmark-note').textContent='Не удалось загрузить сохранённый результат проверки. Отчёт доступен в репозитории.';}
}

for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>setMode(button.dataset.mode);
const slides=[
  {kicker:'01 / ЗАДАЧА',title:'Посетитель и сотрудник общаются в одном приложении',copy:'Прототип объединяет жестовый ввод, текстовый ответ и цифровой аватар. Исследуем один ограниченный сценарий встречи посетителя.',cards:[['Посетитель','Показывает жест или вводит сообщение.'],['Подтверждение','Проверяет предложенное слово до озвучивания.'],['Сотрудник','Отвечает текстом или словом из словаря аватара.']],action:'Открыть диалог',mode:'dialogue'},
  {kicker:'02 / СЦЕНАРИЙ',title:'Обе стороны видят историю разговора',copy:'В режиме диалога можно исправить распознанное слово, подтвердить реплику и показать ответ сотрудника. Неподготовленные сообщения остаются текстовыми.',cards:[['Вопрос','Слово есть в текущем наборе.'],['Да','Сотрудник может ответить аватаром.'],['Нужна помощь','Заготовка для пилота, пока только текст.']],action:'Показать сценарий',mode:'dialogue'},
  {kicker:'03 / ПРОТОТИП',title:'Шесть слов и собственные образцы',copy:'Доступны камера, короткое видео и сравнение аватара с оригиналом. Разбор готовых координат явно отмечен как демонстрация известного образца.',cards:[['Камера','Проверка устройства и видимости кистей.'],['Настройка','Несколько образцов одного движения.'],['Голос','Озвучивание после подтверждения.']],action:'Открыть видео',mode:'video'},
  {kicker:'04 / ПРОВЕРКА',title:'Проверка на 12 отдельных видеозаписях',copy:'Четыре верных ответа, восемь отказов, ноль ошибочных ответов. Все 12 исполнителей отсутствуют в наборе образцов. Это ограниченная проверка по видео; испытание с камеры ещё впереди.',cards:[['Образцы','21 запись от трёх исполнителей.'],['Контрольная серия','12 заданий с заранее фиксированными словами.'],['Отчёт','Ошибки и исправления учитываются отдельно.']],action:'Открыть испытание',mode:'research'},
  {kicker:'05 / ПРЕДЛОЖЕНИЕ НТС',title:'Следующий этап — пилот с носителями РЖЯ',copy:'Предлагаем выбрать один сценарий, подготовить 20 полных сообщений и проверить их на новых участниках. Точность распознавания и понятность аватара пока не установлены.',cards:[['Материал','Переводчик и носители РЖЯ.'],['Метрики','Ошибки, отказы и время обработки.'],['Результат','Понимание сообщения и завершение диалога.']],action:'Открыть план пилота',mode:'about'}
];let slideIndex=0;
function renderSlide(){const slide=slides[slideIndex];$('slide-kicker').textContent=slide.kicker;$('slide-title').textContent=slide.title;$('slide-copy').textContent=slide.copy;$('slide-cards').replaceChildren();for(const [title,copy] of slide.cards){const card=document.createElement('div'),b=document.createElement('b'),p=document.createElement('p');b.textContent=title;p.textContent=copy;card.append(b,p);$('slide-cards').append(card);}$('slide-action').textContent=slide.action;$('slide-count').textContent=`${slideIndex+1} / ${slides.length}`;$('prev-slide').disabled=slideIndex===0;$('next-slide').disabled=slideIndex===slides.length-1;}
$('present').onclick=()=>{pauseAvatar();stopCapture();stopDictation();lastFocus=document.activeElement;renderSlide();$('presentation').showModal();};
$('close-presentation').onclick=()=>$('presentation').close();$('presentation').addEventListener('close',()=>lastFocus?.focus());
$('prev-slide').onclick=()=>{slideIndex=Math.max(0,slideIndex-1);renderSlide();};$('next-slide').onclick=()=>{slideIndex=Math.min(slides.length-1,slideIndex+1);renderSlide();};
$('slide-action').onclick=()=>{$('presentation').close();setMode(slides[slideIndex].mode);$('mode-crumb').scrollIntoView({block:'start'});};
$('presentation').addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();$('next-slide').click();}if(e.key==='ArrowLeft'){e.preventDefault();$('prev-slide').click();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseAvatar();stopDictation();const active=Boolean(s.stream)||s.analyzing;stopCapture();if(active)notice('capture-notice','Обработка остановлена: вкладка была скрыта. Запустите камеру или анализ заново.');window.speechSynthesis?.cancel();}});
window.addEventListener('pagehide',()=>{stopCapture();stopDictation();releaseFile();window.speechSynthesis?.cancel();});
window.addEventListener('hashchange',()=>{const mode=location.hash.slice(1);if(mode!=='workspace')setMode(mode);});
try{
  const response=await fetch('./assets/sources/slovo-sources.json?v=0.7');if(!response.ok)throw new Error();
  s.catalog=createCatalog((await response.json()).samples);
  loadBenchmark();
  for(const item of s.catalog){
    const word=document.createElement('button');word.type='button';word.textContent=item.text;word.dataset.id=item.id;word.setAttribute('aria-pressed','false');word.onclick=()=>selectWord(item.id,!matchMedia('(prefers-reduced-motion: reduce)').matches);$('word-chips').append(word);
    const reply=document.createElement('button');reply.type='button';reply.textContent=item.text;reply.onclick=()=>{$('employee-text').value=item.text;};$('reply-chips').append(reply);
    const clip=document.createElement('button');clip.textContent=item.text;clip.type='button';clip.onclick=()=>{releaseFile();$('video-file').value='';loadVideo(item.video,`Slovo / ${item.text}`,item.id);};$('video-examples').append(clip);
  }
  setMode(location.hash.slice(1)||'dialogue');
  const requested=new URLSearchParams(location.search).get('word');
  await selectWord(s.catalog.some(x=>x.id===requested)?requested:'question');
}catch{notice('text-notice','Не удалось загрузить словарь. Проверьте соединение и обновите страницу.','error');$('active-word').textContent='Нет связи';}
