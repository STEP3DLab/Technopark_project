import {normalizeRoomCode} from './network.js?v=2';
import {GameRooms} from './rooms.js?v=2';
import {DuelEngine, RULES, cleanName, otherRole} from './duel-engine.js';
import {LocalRoom} from './lan.js?v=2';
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

let backgroundTimer;
let networkIssue='';
let prepared=false;
let readyBusy=false;
let lastQr='';
let localSetup=null;
const callbacks = {
  onState:handleState,
  onEvent:handleGameEvent,
  onStatus:handleConnectionStatus,
  onError:error=>{if(error?.type!=='cancelled'){reportError(error.message);readyBusy=false;renderRoom();}},
};
const network=new GameRooms(callbacks);

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
function closeDialog(id){const d=$(id);if(d.open)d.close();}
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

function reportError(message){
  const node=$(currentScreen==='room'?'roomError':'homeError');
  node.textContent=message;node.hidden=!message;
}
function rememberRoom(){
  const url=new URL(location.href);url.hash='';url.search='';url.searchParams.set('room',network.roomCode);url.searchParams.set('v','2');
  history.replaceState({duel:network.ticket()},'',url);
}
function validCode(code){return /^(?:[2-9][0-9]{5}|[A-Z2-9]{6})$/.test(code);}
function readCode(value){
  const raw=String(value).trim();
  if(/^https?:/i.test(raw)){try{return normalizeRoomCode(new URL(raw).searchParams.get('room')||'');}catch{return '';}}
  return normalizeRoomCode(raw);
}
async function createRoom(){
  if(busyRoom)return;
  const op=++operation;busyRoom=true;unlockAudio();sound('ui');resetSession();reportError('');
  $('createButton').disabled=true;$('createButton').querySelector('span').textContent='Открываем комнату…';
  try{
    await network.create({name:playerName(),mode:'duel'});
    if(op!==operation)return;
    network.setAvailable(true);rememberRoom();renderRoom();showScreen('room');
  }catch(e){if(op===operation&&e.type!=='cancelled'){showScreen('home');reportError(e.message+' Можно выбрать прямую связь по Wi-Fi.');$('homeScreen').querySelector('details').open=true;}}
  finally{if(op===operation){busyRoom=false;$('createButton').disabled=false;$('createButton').querySelector('span').textContent='Создать комнату';}}
}
async function joinRoom(input,saved){
  if(busyRoom)return;
  const code=readCode(input);
  if(!saved&&history.state?.duel?.code===code)saved=history.state.duel;
  if(!validCode(code)){$('joinError').textContent='Введите шесть символов с экрана первого игрока.';openDialog('joinDialog');return;}
  const op=++operation;busyRoom=true;resetSession();reportError('');
  $('joinCode').value=code;$('joinError').textContent=saved?'Возвращаемся в вашу комнату…':'Подключаемся к комнате…';
  openDialog('joinDialog');$('joinSubmit').disabled=true;
  try{
    await network.join(code,{name:playerName(),saved});
    if(op!==operation)return;
    network.setAvailable(true);rememberRoom();closeDialog('joinDialog');
    if(network.state?.phase==='lobby')showScreen('room');
    renderRoom();
  }catch(e){
    if(op===operation&&e.type!=='cancelled'){
      showScreen('home');$('joinError').textContent=e.message||'Не удалось подключиться. Повторите вход.';
      if(saved&&[403,404,410].includes(e.status))history.replaceState({},'',location.href);
    }
  }finally{if(op===operation){busyRoom=false;$('joinSubmit').disabled=false;}}
}
function resetSession(){
  prepared=readyBusy=false;networkIssue='';lastQr='';$('cameraLine').hidden=true;$('roomError').hidden=true;
  trainingEngine=null;gameState=null;lastPhase=null;series={host:0,guest:0};countedRound=-1;resultRendered='';rematchPending=false;
  localLastShot=-Infinity;previousAmmo=null;clearTimeout(finalTimer);gameFx?.destroy();gameFx=null;stopCamera();
}
function leaveRoom(){
  operation++;busyRoom=false;
  closeAllDialogs();network.leave();resetSession();
  $('createButton').disabled=false;$('createButton').querySelector('span').textContent='Создать комнату';$('joinSubmit').disabled=false;
  const url=new URL(location.href);url.search='?v=2';url.hash='';history.replaceState({},'',url);
  showScreen('home');reportError('');
}
function closeAllDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function handleConnectionStatus(status){
  if(localSetup&&status.connected){localSetup=null;closeDialog('localDialog');showScreen('room');renderRoom();}
  networkIssue=['recovering','closed'].includes(status.kind)?status.message:'';
  $('connectionBadge').textContent=networkIssue?'Восстановление связи':status.connected?'Оба в комнате':status.kind==='waiting'?'Комната открыта':status.kind==='disconnected'?'Игрок вышел':'Подключение…';
  $('connectionBadge').classList.toggle('connected',Boolean(status.connected)&&!networkIssue);
  $('arenaConnection').textContent=networkIssue?'● ПЕРЕПОДКЛЮЧЕНИЕ':status.connected?'● НА СВЯЗИ':'● ОЖИДАНИЕ';
  if(currentScreen==='room')renderRoom();
  if(status.kind==='closed'){reportError(status.message);$('readyHint').textContent='Выйдите и создайте новую комнату.';}
}
function qrInto(node,value){
  if(!window.qrcode){node.hidden=true;return;}
  try{
    const qr=window.qrcode(0,'M');qr.addData(value);qr.make();
    node.innerHTML=qr.createSvgTag({cellSize:3,margin:12,scalable:true});node.hidden=false;
  }catch{node.replaceChildren();node.hidden=true;}
}
function renderRoom(){
  const s=network.state,role=network.role;if(!s||!role)return;
  const me=s.players[role],rival=s.players[otherRole(role)],code=network.roomCode;
  const local=Boolean(network.link?.local);
  $('roomCode').textContent=code;
  $('inviteBlock').hidden=role!=='host'||rival.connected||local;
  $('copyLinkButton').hidden=local;
  if(rival.connected)closeDialog('qrDialog');
  if(!$('inviteBlock').hidden&&lastQr!==code){lastQr=code;qrInto($('roomQr'),inviteUrl());}
  $('roomTitle').textContent=rival.connected?'Оба в комнате':role==='host'?'Пригласите друга':'Ваша комната';
  $('yourName').textContent=me.name==='Игрок'?'Вы':me.name+' · вы';
  $('rivalName').textContent=rival.connected?(rival.name==='Игрок'?'Соперник':rival.name):'Второй игрок';
  $('yourStatus').textContent=me.ready||prepared?'Готов':readyBusy?'Подготовка…':'В комнате';
  $('rivalStatus').textContent=!rival.connected?'Ждём входа':rival.ready?'Готов':'В комнате';
  document.querySelector('.player-card.you').classList.toggle('ready',me.ready||prepared);
  document.querySelector('.player-card.rival').classList.toggle('ready',rival.ready);
  $('readyButton').disabled=!!networkIssue||readyBusy||s.phase!=='lobby';
  $('readyButton').querySelector('span').textContent=me.ready||prepared?'Отменить готовность':readyBusy?'Подготовка…':'Готов с камерой';
  $('flatReady').hidden=me.ready||prepared;
  $('flatReady').disabled=!!networkIssue||s.phase!=='lobby';
  $('readyHint').textContent=networkIssue||(!rival.connected?'Покажите QR-код другу или отправьте ссылку.':me.ready||prepared?'Вы готовы. Ждём подтверждения соперника.':rival.ready?'Соперник готов. Выберите, как будете играть.':'Выберите, как будете играть. Отсчёт начнётся, когда оба готовы.');
  for(const btn of document.querySelectorAll('[data-mode]')){
    const selected=btn.dataset.mode===s.mode;btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));btn.disabled=role!=='host'||s.phase!=='lobby'||me.ready||prepared;
  }
  $('modeOwnerHint').textContent=role==='host'?'Ваш выбор':'Выбирает создатель';
  if(prepared&&network.connected&&!me.ready&&s.phase==='lobby'&&!readyBusy){prepared=false;network.setReady(true);}
}
async function enableCamera(){
  if(cameraReady)return true;
  if(cameraBusy)return false;
  const gen=++cameraGeneration;cameraBusy=true;$('cameraLine').hidden=false;
  $('cameraStatus').textContent='Разрешите камеру';$('cameraDetail').textContent='Или нажмите «Готов без камеры».';
  let timer;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Камера недоступна в этом браузере.');
    const request=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:720}}});
    request.then(media=>{if(gen!==cameraGeneration)media.getTracks().forEach(t=>t.stop());}).catch(()=>{});
    const media=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Время ожидания камеры истекло.')),14000);})]);
    if(gen!==cameraGeneration)return false;
    stream=media;
    for(const track of media.getTracks())track.addEventListener('ended',()=>{if(stream===media)cameraLost('Камера отключилась. Игра продолжается на виртуальной арене.');});
    $('cameraPreviewWrap').hidden=false;$('previewVideo').srcObject=media;
    // Continue if an embedded browser restricts preview autoplay until the next interaction.
    $('previewVideo').play().catch(()=>{});
    cameraReady=true;$('cameraStatus').textContent='Камера включена';$('cameraDetail').textContent='Направьте телефон в сторону соперника.';
    return true;
  }catch(e){
    if(gen!==cameraGeneration)return false;
    stopCamera();$('cameraLine').hidden=false;$('cameraStatus').textContent='Играем без камеры';
    $('cameraDetail').textContent='Щит появится на виртуальной арене. Коснитесь его, чтобы выстрелить.';
    return false;
  }finally{clearTimeout(timer);if(gen===cameraGeneration)cameraBusy=false;}
}
function stopTracks(){
  const previous=stream;stream=null;previous?.getTracks().forEach(track=>track.stop());
  for(const id of ['previewVideo','arenaVideo']){$(id).pause();$(id).srcObject=null;}
}
function stopCamera(){
  cameraGeneration++;cameraReady=false;cameraBusy=false;shield.stop();stopTracks();
  $('cameraPreviewWrap').hidden=true;
}
function cameraLost(message){
  stopCamera();$('arenaScreen').classList.add('flat-arena');$('centerButton').hidden=true;
  $('cameraLine').hidden=false;$('cameraStatus').textContent='Виртуальная арена';$('cameraDetail').textContent=message;
  if(currentScreen==='arena')toast(message);renderRoom();
}
async function confirmReady(withCamera){
  const room=network.link,op=operation;
  if(!room||room.state?.phase!=='lobby')return;
  if(prepared||room.state.players[room.role].ready){prepared=false;network.setReady(false);renderRoom();return;}
  if(readyBusy&&withCamera)return;
  readyBusy=true;unlockAudio();sound('ui');renderRoom();
  if(withCamera){shield.enable();await enableCamera();}else{stopCamera();$('cameraLine').hidden=true;}
  if(op!==operation||network.link!==room||!readyBusy)return;
  readyBusy=false;shield.center();network.setAvailable(true);
  if(network.connected)network.setReady(true);else prepared=true;
  renderRoom();
}
function handleState(s){
  if(isTraining()&&s!==trainingEngine.state&&s.version!==1)return;
  const priorPhase=lastPhase;gameState=s;lastPhase=s.phase;
  if(s.phase==='lobby'){
    clearTimeout(finalTimer);resultRendered='';
    if(priorPhase!=='lobby'){
      if(priorPhase!==null)prepared=false;readyBusy=false;
      showScreen('room');gameFx?.destroy();gameFx=null;
      if(cameraReady&&stream){$('previewVideo').srcObject=stream;$('previewVideo').play().catch(()=>cameraLost('Вернитесь к камере.'));}
    }
    renderRoom();
    if(rematchPending){rematchPending=false;queueMicrotask(()=>network.setReady(true));}
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
  $('arenaScreen').classList.toggle('flat-arena',!isTraining()&&!cameraReady);
  if(!isTraining()&&stream){
    $('arenaVideo').srcObject=stream;
    $('arenaVideo').play().catch(()=>cameraLost('Не удалось показать камеру. Перезапустите её.'));
  }
  $('dodgeButton').hidden=isTraining();$('centerButton').hidden=isTraining()||!cameraReady;
  $('arenaModeLabel').textContent=isTraining()?'ТРЕНИРОВКА':gameState.mode==='quickdraw'?'ПЕРВЫЙ ВЫСТРЕЛ':'ДУЭЛЬ';
  $('arenaConnection').textContent=isTraining()?'● SOLO':`● ${network.pingMs??'LIVE'}${network.pingMs==null?'':' MS'}`;
  $('arenaBottomNote').textContent=isTraining()?'Коснитесь дрона для выстрела':'Коснитесь щита для выстрела';
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
  $('rematchHint').textContent=isTraining()?'Для игры вдвоём создайте комнату на главной.':interrupted?'Если связь потеряна, войдите снова по тому же коду.':'Для реванша оба нажимают «Ещё дуэль».';
  showScreen('result');gameFx?.destroy();gameFx=null;
  if(!isTraining()&&stream){$('previewVideo').pause();$('arenaVideo').pause();}
}

async function rematch(){
  unlockAudio();sound('ui');
  if(isTraining()){startTraining();return;}
  if(!network.connected){toast('Сначала восстановите соединение с соперником.',true);return;}
  if(gameState?.phase==='interrupted'){
    prepared=false;showScreen('room');network.setAvailable(true);renderRoom();return;
  }
  $('rematchButton').disabled=true;$('rematchButton').querySelector('span').textContent='Готовим реванш…';
  rematchPending=true;
  network.setAvailable(true);
  const ok=network.requestRematch();
  if(ok){$('rematchButton').querySelector('span').textContent='Вызов отправлен';$('rematchHint').textContent='Ждём подтверждения соперника.';}
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
function inviteUrl(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',network.roomCode);url.searchParams.set('v','2');return url.href;}
async function shareInvite(){
  const url=inviteUrl();
  if(navigator.share){try{await navigator.share({title:'PULSE DUEL',text:'Присоединяйся к дуэли',url});return;}catch(e){if(e.name==='AbortError')return;}}
  await copyText(url,'Ссылка скопирована');
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
$('joinCode').addEventListener('input',e=>{if(!e.target.value.includes('://'))e.target.value=readCode(e.target.value).replace(/[^A-Z0-9]/g,'').slice(0,6);});
$('trainingButton').addEventListener('click',startTraining);
$('nickname').addEventListener('change',()=>{playerName();});
$('soundButton').addEventListener('click',toggleSound);$('arenaSoundButton').addEventListener('click',toggleSound);
$('readyButton').addEventListener('click',()=>confirmReady(true));$('flatReady').addEventListener('click',()=>confirmReady(false));
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{sound('ui');network.changeMode(b.dataset.mode);});
$('leaveRoomButton').addEventListener('click',leaveRoom);
$('inviteButton').addEventListener('click',shareInvite);
$('roomQr').addEventListener('click',()=>{
  qrInto($('largeQr'),inviteUrl());
  $('largeCode').textContent=network.roomCode;
  openDialog('qrDialog');
});
$('copyCodeButton').addEventListener('click',()=>copyText(network.roomCode,'Код комнаты скопирован'));
$('copyLinkButton').addEventListener('click',()=>copyText(inviteUrl(),'Ссылка на дуэль скопирована'));
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
$('arenaScreen').addEventListener('pointerdown',e=>{if(!e.target.closest('button')){trainingDrag=true;updateTrainingAim(e);fire();}});
$('arenaScreen').addEventListener('pointermove',updateTrainingAim);
window.addEventListener('pointerup',()=>{trainingDrag=false;});
window.addEventListener('resize',()=>{heroFx?.resize();gameFx?.resize();});
document.addEventListener('visibilitychange',()=>{
  clearTimeout(backgroundTimer);
  if(document.hidden){
    releaseWakeLock();
    if(!cameraBusy&&cameraReady){stopCamera();$('arenaScreen').classList.add('flat-arena');}
    if(isTraining()&&['countdown','active','settling'].includes(trainingEngine.state.phase)){
      trainingEngine.interrupt('unavailable');handleState(trainingEngine.snapshot());
    }else if(network.role){
      // Sharing, permission dialogs and app switches briefly hide the page on phones.
      backgroundTimer=setTimeout(()=>{
        if(document.hidden&&['active','countdown'].includes(network.state?.phase))network.setAvailable(false);
      },18000);
    }
  }else if(network.role){
    network.setAvailable(true);renderRoom();if(currentScreen==='arena')requestWakeLock();
  }
});
window.addEventListener('pagehide',()=>{network.suspend();stopCamera();releaseWakeLock();});
window.addEventListener('pageshow',e=>{if(e.persisted&&new URL(location.href).searchParams.has('room'))location.reload();});
function startFromUrl(){
  const url=new URL(location.href),code=readCode(url.searchParams.get('room')||'');
  if(code){const saved=history.state?.duel;joinRoom(code,saved?.code===code?saved:null);return;}
  const offer=new URLSearchParams(url.hash.slice(1)).get('wifi');
  if(offer)localMenu(offer);
}
function localMenu(offer=''){
  if(network.link?.local&&!network.connected)network.leave();
  closeAllDialogs();
  localSetup={offer,step:'intro',value:''};
  $('localTitle').textContent=offer?'Вызов по Wi-Fi':'Прямая связь';
  $('localHint').textContent=offer?'Оба телефона должны быть в одной Wi-Fi-сети. Подготовьте ответ и передайте его создателю.':'Подключите телефоны к одной Wi-Fi-сети. Второй игрок откроет приглашение, затем передаст ответный код в эту вкладку.';
  $('localAction').textContent=offer?'Подготовить ответ':'Создать Wi-Fi-приглашение';
  $('localAction').disabled=false;$('localAction').hidden=false;
  for(const id of ['localQr','localCopy','localText','localLabel'])$(id).hidden=true;
  $('localText').value='';$('localError').textContent='';openDialog('localDialog');
}
function cancelLocal(){
  if(localSetup?.room){network.leave();resetSession();showScreen('home');}
  localSetup=null;closeDialog('localDialog');
  if(location.hash){const url=new URL(location.href);url.hash='';history.replaceState({},'',url);}
}
function exposeLocalData(value){
  const node=$('localText');
  node.hidden=false;node.readOnly=true;node.value=value;node.focus();node.select();
}
async function copyLocal(){
  const setup=localSetup;if(!setup?.value)return;
  try{await navigator.clipboard.writeText(setup.value);$('localError').textContent=setup.offer?'Ответ скопирован. Передайте его первому игроку.':'Приглашение скопировано.';}
  catch{if(setup.offer)exposeLocalData(setup.value);else window.prompt('Скопируйте приглашение',setup.value);}
}
$('localClose').onclick=cancelLocal;
$('localDialog').addEventListener('cancel',e=>{e.preventDefault();cancelLocal();});
$('localDialog').addEventListener('close',()=>{if(localSetup?.room&&!network.connected)cancelLocal();});
$('localCopy').onclick=copyLocal;
document.querySelectorAll('[data-local]').forEach(b=>b.addEventListener('click',()=>localMenu()));
$('localAction').onclick=async()=>{
  const ctx=localSetup;if(!ctx)return;const button=$('localAction');button.disabled=true;$('localError').textContent='';
  try{
    if(ctx.step==='intro'){
      operation++;busyRoom=false;network.leave();resetSession();showScreen('home');
      const url=new URL(location.href);url.search='?v=2';url.hash='';history.replaceState({},'',url);
      const local=new LocalRoom(callbacks);ctx.room=local;network.link=local;
      const data=ctx.offer?await local.answer(ctx.offer,playerName()):await local.offer(playerName());
      if(localSetup!==ctx)return;
      $('localCopy').hidden=false;$('localText').readOnly=false;
      if(ctx.offer){
        ctx.value=data;ctx.step='reply';$('localTitle').textContent='Передайте ответ';
        $('localHint').textContent='Отправьте ответ первому игроку в мессенджере. Он вставит его в свою вкладку. Затем вернитесь сюда.';
        $('localCopy').textContent='Скопировать ответ';button.textContent='Отправить ответ';
      }else{
        url.hash=new URLSearchParams({wifi:data}).toString();ctx.value=url.href;ctx.step='apply';
        $('localTitle').textContent='Приглашение по Wi-Fi';
        $('localHint').textContent='Друг сканирует QR или открывает ссылку с вашего телефона и отправляет ответ. Вставьте его ниже.';
        qrInto($('localQr'),ctx.value);$('localCopy').textContent='Скопировать ссылку';
        $('localLabel').hidden=$('localText').hidden=false;button.textContent='Соединить телефоны';
      }
    }else if(ctx.step==='apply'){
      await ctx.room.complete($('localText').value);$('localHint').textContent='Устанавливаем прямой канал. Оставьте обе вкладки открытыми.';
      const local=ctx.room;
      setTimeout(()=>{if(localSetup?.room===local&&!local.connected)$('localError').textContent='Сеть не соединила телефоны. Проверьте, что оба подключены к одной обычной Wi-Fi-сети, затем создайте новое приглашение.';},14000);
    }else if(ctx.step==='reply'){
      if(navigator.share){try{await navigator.share({text:ctx.value});}catch(e){if(e.name!=='AbortError')await copyLocal();}}else await copyLocal();
    }
  }catch(e){if(localSetup===ctx)$('localError').textContent=e.message||'Не удалось подключиться.';if(ctx.step==='intro'&&ctx.room){network.leave();ctx.room=null;}}
  finally{if(localSetup===ctx)button.disabled=false;}
};
startFromUrl();
