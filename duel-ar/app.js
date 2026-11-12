import {normalizeRoomCode} from './network.js';
import {GameRooms} from './rooms.js';
import {DuelEngine, RULES, cleanName, otherRole} from './duel-engine.js';
import {ShieldView} from './shield.js';
import {DuelEffects} from './effects.js';
import {DuelAudio} from './audio.js';

const $ = id => document.getElementById(id);
const screens = {home:$('homeScreen'),room:$('roomScreen'),arena:$('arenaScreen'),result:$('resultScreen')};
const readStorage = (key,fallback='') => {try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const writeStorage = (key,value) => {try{localStorage.setItem(key,value);}catch{}};
const mutedInitial = readStorage('pulse-duel-muted','false') === 'true';
const audio = new DuelAudio({muted:mutedInitial});
let muted = mutedInitial;
let heroFx = new DuelEffects($('heroCanvas'),{mode:'hero'});
let gameFx = null;
let currentScreen = 'home';
let stream = null;
let cameraReady = false;
let cameraBusy = false;
let cameraGeneration = 0;
const shield = new ShieldView();
let gameState = null;
let lastPhase = null;
let trainingEngine = null;
let trainingSeq = 0;
let aimPoint = {x:.5,y:.46};
let trainingDrag = false;
let wakeLock = null;
let frameHandle = null;
let localLastShot = -Infinity;
let lastCountdown = null;
let finalTimer = null;
let hitTimer = null;
let toastTimer = null;
let rematchPending = false;
let resultRendered = '';
let currentTarget = null;
let series = {host:0,guest:0};
let countedRound = -1;
let busyRoom = false;
let operation = 0;
let previousAmmo = null;

const network = new GameRooms({
  onState:handleState,
  onEvent:handleGameEvent,
  onStatus:handleConnectionStatus,
  onError:error=>{if(error?.type!=='cancelled')toast(error.message,true);},
});

$('nickname').value = readStorage('pulse-duel-name','');
updateSoundButtons();

function playerName(){
  const name=cleanName($('nickname').value||'Игрок');
  $('nickname').value=name;writeStorage('pulse-duel-name',name);return name;
}
function isTraining(){return trainingEngine!==null;}
function myRole(){return isTraining()?'host':network.role||'host';}
function now(){return isTraining()?Date.now():network.now();}
function toast(message,error=false){
  clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),error?6500:3200);
}
function showScreen(name){
  if(currentScreen===name)return;
  currentScreen=name;
  for(const [key,el]of Object.entries(screens))el.hidden=key!==name;
  document.body.classList.toggle('in-arena',name==='arena');
  if(name==='home'){
    if(!heroFx)heroFx=new DuelEffects($('heroCanvas'),{mode:'hero'});
    requestAnimationFrame(()=>heroFx?.resize());
  }else{heroFx?.destroy();heroFx=null;}
  if(name!=='arena'){
    cancelAnimationFrame(frameHandle);frameHandle=null;
    releaseWakeLock();
    $('arenaVideo').pause();
  }
  window.scrollTo(0,0);
}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
function closeDialog(id){$(id).close();}
function setButton(button,text,busy){button.disabled=busy;button.textContent=text;}
function sound(name,options){audio.play(name,options);}
function unlockAudio(){audio.unlock().catch(()=>{});}
function updateSoundButtons(){
  for(const id of ['soundButton','arenaSoundButton']){
    $(id).querySelector('use').setAttribute('href',muted?'#i-muted':'#i-sound');
    $(id).setAttribute('aria-label',muted?'Включить звук':'Выключить звук');
    $(id).setAttribute('aria-pressed',String(!muted));
  }
}
function toggleSound(){muted=!muted;audio.setMuted(muted);writeStorage('pulse-duel-muted',String(muted));unlockAudio();updateSoundButtons();if(!muted)sound('ui');}
function vibrate(pattern){if(!muted&&navigator.vibrate)navigator.vibrate(pattern);}

async function createRoom(){
  if(busyRoom)return;
  const op=++operation;busyRoom=true;unlockAudio();sound('ui');
  $('createButton').disabled=true;$('createButton').querySelector('span').textContent='Создаём комнату…';
  try{
    resetSession();
    await network.create({name:playerName(),mode:'duel'});
    if(op!==operation)return;
    network.setAvailable(false);renderRoom();showScreen('room');
    const url=new URL(location.href);url.hash='';url.searchParams.set('room',network.roomCode);history.replaceState({},'',url);
    toast('Комната открыта. Пригласите соперника.');
  }catch(error){if(error.type!=='cancelled'&&op===operation){toast(error.message,true);showScreen('home');}}
  finally{if(op===operation){busyRoom=false;$('createButton').disabled=false;$('createButton').querySelector('span').textContent='Создать дуэль';}}
}

async function joinRoom(code){
  if(busyRoom)return;
  code=normalizeRoomCode(code);
  if(!/^[A-Z2-9]{6}$/.test(code)){$('joinError').textContent='Введите шесть символов кода комнаты.';return;}
  const op=++operation;busyRoom=true;unlockAudio();sound('ui');
  $('joinError').textContent='';$('joinSubmit').disabled=true;$('joinSubmit').querySelector('span').textContent='Соединяемся…';
  try{
    resetSession();
    await network.join(code,{name:playerName()});
    if(op!==operation)return;
    network.setAvailable(false);closeDialog('joinDialog');renderRoom();showScreen('room');
    const url=new URL(location.href);url.hash='';url.searchParams.set('room',network.roomCode);history.replaceState({},'',url);
  }catch(error){if(error.type!=='cancelled'&&op===operation){$('joinError').textContent=error.message;showScreen('home');}}
  finally{if(op===operation){busyRoom=false;$('joinSubmit').disabled=false;$('joinSubmit').querySelector('span').textContent='Войти в дуэль';}}
}

function resetSession(){
  trainingEngine=null;gameState=null;lastPhase=null;series={host:0,guest:0};countedRound=-1;resultRendered='';rematchPending=false;
  localLastShot=-Infinity;previousAmmo=null;clearTimeout(finalTimer);gameFx?.destroy();gameFx=null;stopCamera(false);
}
function leaveRoom(){
  operation++;busyRoom=false;
  closeAllDialogs();network.leave();resetSession();
  $('createButton').disabled=false;$('createButton').querySelector('span').textContent='Создать дуэль';
  $('joinSubmit').disabled=false;$('joinSubmit').querySelector('span').textContent='Войти в дуэль';
  const url=new URL(location.href);url.searchParams.delete('room');url.hash='';history.replaceState({},'',url);
  showScreen('home');
}
function closeAllDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}

function handleConnectionStatus(status){
  $('connectionBadge').textContent=status.connected?(status.pingMs==null?'Игроки на связи':`${status.pingMs} мс · на связи`):status.kind==='waiting'?'Ждём второго игрока':status.kind==='disconnected'?'Связь потеряна':'Соединяемся';
  $('connectionBadge').classList.toggle('connected',Boolean(status.connected));
  $('arenaConnection').textContent=status.connected?`● ${status.pingMs==null?'LIVE':status.pingMs+' MS'}`:'● НЕТ СВЯЗИ';
  if(currentScreen==='room')renderRoom();
  if(status.kind==='disconnected'&&currentScreen==='result'){
    $('rematchButton').disabled=true;$('rematchHint').textContent=status.message;
  }
}

function renderRoom(){
  const s=network.state;if(!s||!network.role)return;
  const role=network.role,me=s.players[role],rival=s.players[otherRole(role)];
  $('roomCode').textContent=network.roomCode;
  $('yourName').textContent=me.name+' · вы';$('rivalName').textContent=rival.connected?rival.name:'Ждём соперника';
  $('yourStatus').textContent=me.ready?'Готов к дуэли':cameraReady?'Камера готова':'Нужна камера';
  $('rivalStatus').textContent=!rival.connected?'Отправьте ссылку другу':rival.ready?'Готов к дуэли':rival.available?'Готовится к дуэли':'Включает камеру';
  document.querySelector('.player-card.you').classList.toggle('ready',me.ready);
  document.querySelector('.player-card.rival').classList.toggle('ready',rival.ready);
  $('readyButton').disabled=!cameraReady||!rival.connected||!network.connected||cameraBusy||s.phase!=='lobby';
  $('readyButton').querySelector('span').textContent=me.ready?'Готов. Ждём соперника…':'Я готов к дуэли';
  $('readyHint').textContent=!rival.connected?'Отправьте код или ссылку второму игроку.':!cameraReady?'Включите камеру, чтобы приготовиться.':me.ready?'Ожидаем подтверждения второго игрока.':rival.ready?'Соперник готов. Нажмите кнопку для старта.':'Оба подтверждают готовность — и начинается отсчёт.';
  for(const b of document.querySelectorAll('[data-mode]')){
    const selected=b.dataset.mode===s.mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=role!=='host'||s.phase!=='lobby';
  }
  $('modeOwnerHint').textContent=role==='host'?'Ваш выбор':'Выбирает создатель';
}

async function enableCamera(){
  if(cameraBusy)return false;
  if(cameraReady&&stream?.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted)){
    network.setAvailable(true);return true;
  }
  if(!navigator.mediaDevices?.getUserMedia){toast('Камера недоступна. Откройте HTTPS-ссылку в Safari или Chrome.',true);return false;}
  shield.enable();
  const generation=++cameraGeneration;cameraBusy=true;cameraReady=false;
  $('cameraButton').disabled=true;$('cameraButton').querySelector('span').textContent='Запускаем камеру…';
  $('cameraStatus').textContent='Разрешите доступ к камере';$('cameraDetail').textContent='Понадобится только видео, без микрофона.';
  $('cameraStatusDot').className='status-dot';$('modelProgress').hidden=false;renderRoom();
  let requestTimer;
  try{
    stopTracks();
    const cameraRequest=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}});
    cameraRequest.then(s=>{if(generation!==cameraGeneration)s.getTracks().forEach(t=>t.stop());}).catch(()=>{});
    const media=await Promise.race([cameraRequest,new Promise((_,reject)=>{requestTimer=setTimeout(()=>reject(new Error('Запрос камеры не подтверждён. Разрешите камеру в настройках сайта и повторите.')),25000);})]);
    clearTimeout(requestTimer);
    if(generation!==cameraGeneration){media.getTracks().forEach(t=>t.stop());return false;}
    stream=media;$('previewVideo').srcObject=stream;
    await $('previewVideo').play();
    if(generation!==cameraGeneration)return false;
    $('cameraPlaceholder').hidden=true;$('previewTag').textContent='CAMERA LIVE';
    for(const track of stream.getVideoTracks()){
      track.addEventListener('ended',()=>{if(stream===media)cameraLost('Камера отключена. Включите её ещё раз.');});
      track.addEventListener('mute',()=>{if(stream===media&&cameraReady)cameraLost('Камера временно недоступна. Вернитесь в комнату и включите её.');});
    }
    cameraReady=true;network.setAvailable(true);
    $('cameraStatus').textContent='Камера готова';$('cameraDetail').textContent='Направьте телефон в сторону игрока. Это будет центр вашей арены.';
    $('cameraStatusDot').className='status-dot ready';$('cameraButton').querySelector('span').textContent='Перезапустить камеру';
    $('previewTag').textContent='TRACKING READY';
    sound('ui');return true;
  }catch(error){
    clearTimeout(requestTimer);
    if(generation!==cameraGeneration)return false;
    cameraGeneration++;shield.stop();stopTracks();cameraReady=false;network.setAvailable(false);
    const messages={NotAllowedError:'Нет разрешения на камеру. Разрешите её для этого сайта в настройках браузера.',NotFoundError:'Камера не найдена. Откройте игру на телефоне с камерой.',NotReadableError:'Камера занята другим приложением. Закройте его и повторите.'};
    const message=messages[error.name]||error.message||'Не удалось включить камеру.';
    $('cameraStatus').textContent='Не удалось включить камеру';$('cameraDetail').textContent=message;$('cameraStatusDot').className='status-dot error';
    $('cameraButton').querySelector('span').textContent='Попробовать снова';$('cameraPlaceholder').hidden=false;$('previewTag').textContent='CAMERA OFF';toast(message,true);return false;
  }finally{
    if(generation===cameraGeneration||generation+1===cameraGeneration){cameraBusy=false;$('cameraButton').disabled=false;$('modelProgress').hidden=true;renderRoom();}
  }
}
function stopTracks(){
  const previous=stream;stream=null;
  previous?.getTracks().forEach(track=>track.stop());
  for(const id of ['previewVideo','arenaVideo']){$(id).pause();$(id).srcObject=null;}
}
function stopCamera(notify=true){
  cameraGeneration++;cameraReady=false;cameraBusy=false;shield.stop();stopTracks();
  if(notify&&network.role)network.setAvailable(false);
  $('cameraButton').disabled=false;$('cameraButton').querySelector('span').textContent='Включить камеру';
  $('cameraPlaceholder').hidden=false;$('cameraStatus').textContent='Включите камеру';$('cameraDetail').textContent='Камера задаёт фон арены. Двигайте прицел телефоном или пальцем.';
  $('cameraStatusDot').className='status-dot';$('previewTag').textContent='CAMERA OFF';$('modelProgress').hidden=true;
}
function cameraLost(message){
  if(!cameraReady&&!cameraBusy)return;
  cameraReady=false;shield.stop();network.setAvailable(false);stopTracks();
  $('cameraStatus').textContent='Камера остановлена';$('cameraDetail').textContent=message;$('cameraStatusDot').className='status-dot error';
  $('cameraButton').querySelector('span').textContent='Включить камеру';$('cameraPlaceholder').hidden=false;renderRoom();toast(message,true);
}

function handleState(s){
  if(isTraining()&&s!==trainingEngine.state&&s.version!==1)return;
  const priorPhase=lastPhase;gameState=s;lastPhase=s.phase;
  if(s.phase==='lobby'){
    clearTimeout(finalTimer);resultRendered='';
    if(priorPhase!=='lobby'){
      showScreen('room');gameFx?.destroy();gameFx=null;
      if(cameraReady&&stream){$('previewVideo').srcObject=stream;$('previewVideo').play().catch(()=>cameraLost('Вернитесь к камере.'));}
    }
    renderRoom();
    if(rematchPending&&cameraReady){rematchPending=false;queueMicrotask(()=>network.setReady(true));}
  }else if(s.phase==='countdown'||s.phase==='active'||s.phase==='settling'){
    if(currentScreen!=='arena')enterArena();
    renderHUD();
  }else if(s.phase==='finished'){
    renderHUD();
    if(countedRound!==s.round){countedRound=s.round;if(s.winner)series[s.winner]++;}
    if(priorPhase!=='finished'){clearTimeout(finalTimer);finalTimer=setTimeout(()=>renderResult(s),800);}
  }else if(s.phase==='interrupted'){
    clearTimeout(finalTimer);renderResult(s);
  }
}

function enterArena(){
  closeAllDialogs();showScreen('arena');
  $('arenaScreen').classList.toggle('training',isTraining());$('trainingLabel').hidden=!isTraining();
  aimPoint={x:.5,y:.46};localLastShot=-Infinity;lastCountdown=null;previousAmmo=null;
  $('reticle').style.left='50%';$('reticle').style.top='46%';
  $('hitText').classList.remove('show');$('targetFrame').hidden=true;
  gameFx?.destroy();gameFx=new DuelEffects($('gameCanvas'),{mode:isTraining()?'training':'game'});
  if(!isTraining()){
    $('arenaVideo').srcObject=stream;
    $('arenaVideo').play().catch(()=>cameraLost('Не удалось показать камеру. Перезапустите её.'));
  }
  $('dodgeButton').hidden=isTraining();$('centerButton').hidden=isTraining();
  $('arenaModeLabel').textContent=isTraining()?'ТРЕНИРОВКА':gameState.mode==='quickdraw'?'ПЕРВЫЙ ВЫСТРЕЛ':'ДУЭЛЬ';
  $('arenaConnection').textContent=isTraining()?'● SOLO':`● ${network.pingMs??'LIVE'}${network.pingMs==null?'':' MS'}`;
  $('arenaBottomNote').textContent=isTraining()?'Перемещайте прицел пальцем или мышью · пробел — выстрел':'Поверните телефон или коснитесь арены, чтобы прицелиться';
  requestWakeLock();cancelAnimationFrame(frameHandle);frameHandle=requestAnimationFrame(tick);
}

function renderCells(id,count,max){
  const element=$(id);const signature=`${count}/${max}`;
  if(element.dataset.value===signature)return;element.dataset.value=signature;
  element.replaceChildren(...Array.from({length:max},(_,i)=>{const cell=document.createElement('i');if(i>=count)cell.className='empty';return cell;}));
  element.setAttribute('aria-label',`${count} из ${max}`);
}
function renderHUD(){
  if(!gameState)return;const s=gameState,role=myRole(),me=s.players[role],rival=s.players[otherRole(role)];
  $('hudYourName').textContent=me.name+' · ВЫ';$('hudRivalName').textContent=rival.name;
  renderCells('yourHealth',me.hp,s.maxHp);renderCells('rivalHealth',rival.hp,s.maxHp);renderCells('ammoCells',me.ammo,s.magazine);
  $('fireButton').disabled=s.phase!=='active'||me.hp<=0;
}

function targetInView(){
  const w=$('arenaScreen').clientWidth,h=$('arenaScreen').clientHeight;
  const aim=aimPoint;
  if(isTraining()){
    const box=gameFx?.getTrainingTarget();
    if(!box)return {visible:false,hit:false,confidence:0,ageMs:0};
    return {...box,box,hit:aim.x>=box.x&&aim.x<=box.x+box.w&&aim.y>=box.y&&aim.y<=box.y+box.h,confidence:1,ageMs:0,reason:'tracked'};
  }
  if(!cameraReady||!$('arenaVideo').videoWidth)return {visible:false,hit:false};
  const rival=gameState.players[otherRole(myRole())];
  return shield.target({width:w,height:h,aim,seconds:Math.max(0,(now()-gameState.startAt)/1000),
    role:otherRole(myRole()),dodgeAge:rival.dodgeAt==null?-1:now()-rival.dodgeAt,dodgeSide:rival.dodgeSide});
}
function updateTargetUI(target){
  const frame=$('targetFrame'),locked=Boolean(target.visible&&target.hit);
  $('reticle').classList.toggle('locked',locked);$('aimStatus').classList.toggle('locked',locked);
  frame.hidden=!target.visible;frame.classList.toggle('locked',locked);
  if(target.visible&&target.box){
    const b=target.box;Object.assign(frame.style,{left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.w*100}%`,height:`${b.h*100}%`});
    frame.querySelector('.target-name').textContent=isTraining()?'УЧЕБНЫЙ ДРОН':locked?'ЦЕЛЬ ЗАХВАЧЕНА':'ЩИТ СОПЕРНИКА';
  }
  gameFx?.setTarget(!isTraining() && target.visible ? {...target.box,locked} : null);
  const aimText=locked?'Цель в прицеле · Огонь':isTraining()?'Коснитесь дрона для наведения':target.visible?'Совместите прицел со щитом':'Повернитесь обратно или нажмите «Центр»';
  $('aimStatus').textContent=aimText;
  if($('lockPercent').dataset.value!==String(locked?'100':target.visible?'50':'0')){
  $('lockPercent').dataset.value=locked?'100':target.visible?'50':'0';
  $('lockPercent').replaceChildren(document.createTextNode(locked?'100':target.visible?'50':'0'),Object.assign(document.createElement('span'),{textContent:'%'}));}
  $('lockStatus').textContent=locked?'Цель захвачена':target.visible?'Совместите прицел':'Ищем цель';
}

function tick(){
  if(currentScreen!=='arena')return;
  if(isTraining()){
    const previousRevision=trainingEngine.state.revision;trainingEngine.tick();
    if(trainingEngine.state.revision!==previousRevision)handleState(trainingEngine.snapshot());
    for(const event of trainingEngine.drainEvents())handleGameEvent(event);
  }
  const s=gameState,t=now();
  if(!s)return;
  const remaining=s.phase==='countdown'?45:Math.max(0,Math.ceil((s.endAt-t)/1000));
  const clock=$('roundClock');
  if(clock.dataset.value!==String(remaining)){clock.dataset.value=String(remaining);clock.replaceChildren(document.createTextNode(String(remaining).padStart(2,'0')),Object.assign(document.createElement('span'),{textContent:'СЕК'}));}
  clock.classList.toggle('urgent',remaining<=10);
  if(s.phase==='countdown'){
    $('countdownOverlay').hidden=false;const count=Math.max(1,Math.ceil((s.startAt-t)/1000));
    $('countdownNumber').textContent=count>3?'ГОТОВ?':count;$('countdownNumber').style.fontSize=count>3?'clamp(70px,18vw,130px)':'';
    $('countdownLabel').textContent=isTraining()?'ПРОВЕРКА РЕАКЦИИ':'ОБА ГОТОВЫ';
    if(count!==lastCountdown){lastCountdown=count;if(count<=3)sound('countdown',{value:count});}
  }else $('countdownOverlay').hidden=true;
  currentTarget=targetInView();updateTargetUI(currentTarget);
  const me=s.players[myRole()],reloading=me.reloadUntil>t,cooling=t-localLastShot<RULES.cooldownMs;
  $('fireButton').disabled=s.phase!=='active'||me.hp<=0||reloading||cooling;
  if(!isTraining()){
    const left=me.dodgeAt==null?0:Math.max(0,me.dodgeAt+RULES.dodgeCooldownMs-t);
    $('dodgeButton').disabled=left>0||s.phase!=='active';
    $('dodgeButton').textContent=left?'Сдвиг · '+Math.ceil(left/1000)+' с':'Сдвиг щита';
  }
  $('weaponStatus').textContent=reloading?`Перезарядка ${Math.max(0,(me.reloadUntil-t)/1000).toFixed(1)}с`:cooling?'Охлаждение':s.phase==='settling'?'Считаем результат':'Лазер готов';
  frameHandle=requestAnimationFrame(tick);
}

function fire(){
  if(currentScreen!=='arena'||gameState?.phase!=='active')return;
  unlockAudio();
  const t=now(),me=gameState.players[myRole()];
  if(me.hp<=0||me.reloadUntil>t||t-localLastShot<RULES.cooldownMs)return;
  const target=targetInView();
  const shot={hit:Boolean(target.visible&&target.hit),confidence:target.confidence||0,targetAgeMs:target.ageMs??Infinity};
  let outcome;
  if(isTraining())outcome=trainingEngine.shoot('host',{...shot,round:trainingEngine.state.round,seq:++trainingSeq,at:t});
  else outcome=network.fire(shot);
  if(!outcome.accepted){if(outcome.reason==='connection')toast('Нет связи с соперником. Выстрел не засчитан.',true);return;}
  localLastShot=t;
  const aim=aimPoint;
  gameFx?.shot({hit:false,x:aim.x,y:aim.y});sound('shot');vibrate(18);
  if(isTraining()){handleState(trainingEngine.snapshot());for(const e of trainingEngine.drainEvents())handleGameEvent(e);}
}

function flashText(text,damage=false){
  clearTimeout(hitTimer);$('hitText').textContent=text;$('hitText').classList.toggle('damage',damage);$('hitText').classList.add('show');
  hitTimer=setTimeout(()=>$('hitText').classList.remove('show'),750);
}
function handleGameEvent(event){
  if(event.type==='dodge'){flashText(event.role===myRole()?'ВАШ ЩИТ СМЕЩЁН':'МАНЁВР СОПЕРНИКА');sound('ui');}
  if(event.type==='start'){sound('start');flashText('ДУЭЛЬ');}
  if(event.type==='hit'){
    if(event.shooter===myRole()){
      const aim=aimPoint;gameFx?.shot({hit:true,x:aim.x,y:aim.y});sound('hit');vibrate(35);flashText(event.hp===0?'ЦЕЛЬ ПОРАЖЕНА':'ПОПАДАНИЕ');
    }else{gameFx?.damage();sound('damage');vibrate([35,35,35]);flashText('ЩИТ −1',true);}
  }
  if(event.type==='shot'&&event.shooter!==myRole())sound('shot',{value:.35});
  if(event.type==='reload'&&event.role===myRole())sound('reload');
  if(event.type==='result'){
    const won=event.winner===myRole();gameFx?.victory(won);sound(event.winner===null?'draw':won?'win':'lose');
  }
  if(event.type==='shot-rejected'&&!['cooldown','reloading','not-active'].includes(event.reason))toast('Выстрел не подтверждён. Проверьте соединение.',true);
  if(event.type==='disconnect')toast('Соперник отключился. Раунд остановлен.',true);
}

function renderResult(s){
  const key=`${isTraining()?'training':'duel'}-${s.round}-${s.phase}-${s.reason}`;
  if(resultRendered===key)return;resultRendered=key;
  const role=myRole(),me=s.players[role],interrupted=s.phase==='interrupted',won=!interrupted&&s.winner===role,draw=!interrupted&&s.winner===null;
  $('resultScreen').classList.toggle('loss',!won);$('resultEyebrow').textContent=interrupted?'РАУНД ОСТАНОВЛЕН':isTraining()?'ТРЕНИРОВКА ЗАВЕРШЕНА':'ДУЭЛЬ ЗАВЕРШЕНА';
  $('resultTitle').replaceChildren();
  const first=interrupted?'Раунд':draw?'Ничья.':won?'Вы':'Победа';
  const second=interrupted?'прерван.':draw?'':won?'победили.':'соперника.';
  $('resultTitle').append(document.createTextNode(first),document.createElement('br'),Object.assign(document.createElement('span'),{textContent:second}));
  $('resultSymbol').textContent=interrupted?'Ⅱ':draw?'=':won?'✳':'↻';
  const rival=s.players[otherRole(role)].name;
  $('resultMessage').textContent=interrupted?'Связь или камера прервалась. Победитель не назначен.':isTraining()?(won?'Все щиты дрона сняты. Вы готовы к настоящему сопернику.':'Время вышло. Наведите прицел на дрон и попробуйте ещё раз.'):draw?(s.reason==='simultaneous'?'Одновременное попадание. Ничья — вот это реакция.':'Время вышло, щиты равны. Всё решит следующая дуэль.'):won?(s.reason==='timeout'?'Время вышло. У вас осталось больше щита. Победа.':'Щит соперника разрушен. Эта дуэль ваша.'):`${rival} выигрывает этот раунд. Следующий может быть вашим.`;
  $('resultHits').textContent=String(me.hits);$('resultAccuracy').textContent=me.shots?Math.round(me.hits/me.shots*100)+'%':'—';
  const elapsed=s.startAt?Math.max(0,Math.min(45,((s.finishedAt||now())-s.startAt)/1000)):0;
  $('resultTime').textContent=interrupted?'—':elapsed.toFixed(1)+'с';
  $('resultSeries').textContent=isTraining()?'ОДИН ИГРОК · УЧЕБНАЯ АРЕНА':`СЕРИЯ · ВЫ ${series[role]} : ${series[otherRole(role)]} СОПЕРНИК`;
  $('rematchButton').disabled=!isTraining()&&!network.connected;
  $('rematchButton').querySelector('span').textContent=isTraining()?'Ещё тренировка':interrupted?'Вернуться в комнату':'Ещё дуэль';
  $('rematchHint').textContent=isTraining()?'Для игры вдвоём создайте комнату на главной.':interrupted?'Если связь потеряна, войдите снова по тому же коду.':'Для реванша оба нажимают «Ещё дуэль» и включают камеры.';
  showScreen('result');gameFx?.destroy();gameFx=null;stopCamera(!isTraining());
}

async function rematch(){
  unlockAudio();sound('ui');
  if(isTraining()){startTraining();return;}
  if(!network.connected){toast('Сначала восстановите соединение с соперником.',true);return;}
  if(gameState?.phase==='interrupted'){
    showScreen('room');await enableCamera();renderRoom();return;
  }
  $('rematchButton').disabled=true;$('rematchButton').querySelector('span').textContent='Готовим реванш…';
  rematchPending=true;
  if(!await enableCamera()){rematchPending=false;$('rematchButton').disabled=false;$('rematchButton').querySelector('span').textContent='Ещё дуэль';return;}
  const ok=network.requestRematch();
  if(ok){$('rematchButton').querySelector('span').textContent='Вызов отправлен';$('rematchHint').textContent='Ждём подтверждения соперника. Камера включена.';}
  else{rematchPending=false;$('rematchButton').disabled=false;toast('Не удалось начать реванш. Вернитесь в комнату.',true);}
}

function startTraining(){
  operation++;busyRoom=false;network.leave({silent:true});resetSession();unlockAudio();sound('ui');
  trainingEngine=new DuelEngine({name:playerName(),mode:'duel'});trainingSeq=0;
  trainingEngine.setPlayer('guest',{name:'Дрон',connected:true});
  trainingEngine.setReady('host',true);trainingEngine.setReady('guest',true);
  gameState=trainingEngine.snapshot();lastPhase='countdown';enterArena();renderHUD();
  const url=new URL(location.href);url.searchParams.delete('room');history.replaceState({},'',url);
}

async function requestWakeLock(){
  try{if(navigator.wakeLock&&!document.hidden&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}}catch{}
}
function releaseWakeLock(){try{wakeLock?.release();}catch{}wakeLock=null;}
function inviteUrl(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',network.roomCode);return url.href;}
function showInvite(){
  if(!network.roomCode)return;
  $('inviteCode').textContent=network.roomCode;const qrBox=$('inviteQr');qrBox.replaceChildren();
  if(typeof window.qrcode==='function'){
    const qr=window.qrcode(0,'M');qr.addData(inviteUrl());qr.make();
    // qrcode-generator emits only SVG geometry from a URL assembled by this app.
    qrBox.innerHTML=qr.createSvgTag({cellSize:3,margin:4,scalable:true});
  }else{qrBox.textContent=network.roomCode;}
  openDialog('inviteDialog');
}
async function copyText(text,message){
  try{await navigator.clipboard.writeText(text);toast(message);}catch{
    const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();
    try{if(!document.execCommand('copy'))throw new Error();toast(message);}catch{toast('Нажмите и удерживайте код, чтобы скопировать его.',true);}finally{input.remove();}
  }
}

$('createButton').addEventListener('click',createRoom);
$('joinButton').addEventListener('click',()=>{$('joinError').textContent='';openDialog('joinDialog');$('joinCode').focus();});
$('joinForm').addEventListener('submit',e=>{e.preventDefault();joinRoom($('joinCode').value);});
$('joinCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');});
$('trainingButton').addEventListener('click',startTraining);
$('nickname').addEventListener('change',()=>{playerName();});
$('soundButton').addEventListener('click',toggleSound);$('arenaSoundButton').addEventListener('click',toggleSound);
$('cameraButton').addEventListener('click',()=>{unlockAudio();if(cameraReady)stopCamera();enableCamera();});
$('readyButton').addEventListener('click',()=>{
  if(!cameraReady)return;shield.center();unlockAudio();sound('ui');network.setReady(!network.state?.players[network.role]?.ready);
});
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{sound('ui');network.changeMode(b.dataset.mode);});
$('leaveRoomButton').addEventListener('click',leaveRoom);
$('inviteButton').addEventListener('click',showInvite);
$('copyCodeButton').addEventListener('click',()=>copyText(network.roomCode,'Код комнаты скопирован'));
$('copyLinkButton').addEventListener('click',()=>copyText(inviteUrl(),'Ссылка на дуэль скопирована'));
$('shareButton').addEventListener('click',async()=>{
  if(navigator.share){try{await navigator.share({title:'Вызов на PULSE DUEL',text:'Встречаемся на лазерной дуэли. Код: '+network.roomCode,url:inviteUrl()});return;}catch(e){if(e.name==='AbortError')return;}}
  await copyText(inviteUrl(),'Ссылка на дуэль скопирована');
});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
document.querySelectorAll('[data-help]').forEach(b=>b.addEventListener('click',()=>openDialog('helpDialog')));
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
$('centerButton').addEventListener('click',()=>{
  shield.center();aimPoint={x:.5,y:.46};$('reticle').style.left='50%';$('reticle').style.top='46%';
  flashText('ЦЕНТР АРЕНЫ');
});
$('dodgeButton').addEventListener('click',()=>network.dodge());
$('exitArenaButton').addEventListener('click',()=>openDialog('exitDialog'));
$('confirmExitButton').addEventListener('click',leaveRoom);
$('resultHomeButton').addEventListener('click',leaveRoom);
$('rematchButton').addEventListener('click',rematch);
$('fireButton').addEventListener('pointerdown',e=>{e.preventDefault();fire();});
$('fireButton').addEventListener('click',e=>{if(e.detail===0)fire();});
window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&currentScreen==='arena'&&!document.querySelector('dialog[open]')){e.preventDefault();if(!e.repeat)fire();}
});
const updateTrainingAim=e=>{
  if(currentScreen!=='arena'||e.target.closest('button')||document.querySelector('dialog[open]'))return;
  if(!trainingDrag&&(e.pointerType==='touch'||!isTraining()))return;
  const r=$('arenaScreen').getBoundingClientRect();aimPoint={x:Math.max(.01,Math.min(.99,(e.clientX-r.left)/r.width)),y:Math.max(.08,Math.min(.88,(e.clientY-r.top)/r.height))};
  $('reticle').style.left=aimPoint.x*100+'%';$('reticle').style.top=aimPoint.y*100+'%';
};
$('arenaScreen').addEventListener('pointerdown',e=>{if(!e.target.closest('button')){trainingDrag=true;updateTrainingAim(e);}});
$('arenaScreen').addEventListener('pointermove',updateTrainingAim);
window.addEventListener('pointerup',()=>{trainingDrag=false;});
window.addEventListener('resize',()=>{heroFx?.resize();gameFx?.resize();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    releaseWakeLock();
    if(isTraining()&&['countdown','active','settling'].includes(trainingEngine.state.phase)){trainingEngine.interrupt('unavailable');handleState(trainingEngine.snapshot());}
    else if(network.role){stopCamera();renderRoom();}
  }else if(currentScreen==='arena')requestWakeLock();
});
window.addEventListener('pagehide',()=>{network.leave({silent:true});shield.stop();stopTracks();releaseWakeLock();});

// Invites prefill the join form, retaining a deliberate click before networking.
const incomingCode=new URL(location.href).searchParams.get('room');
if(incomingCode){$('joinCode').value=normalizeRoomCode(incomingCode).slice(0,6);openDialog('joinDialog');}
