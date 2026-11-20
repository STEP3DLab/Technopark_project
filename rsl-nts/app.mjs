import {classify} from './recognizer.mjs';
const $ = id => document.getElementById(id);
const video = $('video'), run = $('run'), status = $('status');
const data = {
  question:{label:'вопрос'}, help:{label:'помочь'}, outside:{label:'дом (вне словаря)'}
};
let mode='example', revision=0, stream=null, fileUrl=null, model, detectorPromise=null, proposed='', previousText=null, busy=false;
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const asset = async path => {
  const response=await fetch(path);
  if (!response.ok) throw Error('Не удалось загрузить данные. Обновите страницу.');
  return response.json();
};
const stillCurrent = token => {
  if(token!==revision) throw new DOMException('Source changed','AbortError');
};
function resetOutput() {
  proposed=''; $('word').textContent='Пока нет слова';
  $('detail').textContent='Выберите источник видео и запустите распознавание.';
  $('truth').hidden=true; $('add').disabled=true;
}
function stopTracks() {
  if(stream) stream.getTracks().forEach(track=>track.stop());
  stream=null; video.srcObject=null;
}
function clearFile() {
  if(fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl=null;
}
function updateRun() {
  const titles={example:'Распознать пример',camera:stream?'Записать один жест':'Включить камеру',file:'Распознать файл'};
  run.textContent=busy?'Идёт обработка…':titles[mode];
  run.disabled=busy || !model || (mode==='file'&&!fileUrl);
  $('stop').hidden=mode!=='camera'||!stream;
}
function sampleSource() {
  const name=$('example').value;
  video.poster='./samples/'+name+'.jpg';video.src='./samples/'+name+'.mp4';
  video.controls=true;video.load();
  status.textContent='Пример можно воспроизвести перед распознаванием.';
}
function setMode(next) {
  revision++;busy=false;stopTracks();clearFile();resetOutput();mode=next;
  for(const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  for(const key of ['example','camera','file']) $(key+'-pane').hidden=key!==next;
  video.pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();
  $('stage').classList.toggle('live',next==='camera');
  $('stage-empty').hidden=next==='example';video.controls=next!=='camera';$('file').value='';
  if(next==='example') sampleSource();
  if(next==='camera') {
    $('stage-empty').textContent='Камера выключена';
    status.textContent='Видео и звук не записываются на сервер. Микрофон не используется.';
  }
  if(next==='file') {
    $('stage-empty').textContent='Выберите видео на устройстве';
    status.textContent='Выберите фрагмент длительностью до 10 секунд с одним жестом.';
  }
  updateRun();
}
for(const btn of document.querySelectorAll('[data-mode]')) btn.addEventListener('click',()=>setMode(btn.dataset.mode));
$('example').addEventListener('change',()=>{revision++;busy=false;resetOutput();sampleSource();updateRun();});
$('file').addEventListener('change',()=>{
  revision++;busy=false;clearFile();resetOutput();
  const file=$('file').files[0];
  if(file){fileUrl=URL.createObjectURL(file);video.src=fileUrl;video.load();$('stage-empty').hidden=true;status.textContent='Нажмите «Распознать файл».';}
  updateRun();
});
$('stop').addEventListener('click',()=>setMode('camera'));
async function getDetector(){
  if(!detectorPromise) detectorPromise=(async()=>{
    const base='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
    const {FilesetResolver,HandLandmarker}=await import(base+'/vision_bundle.mjs');
    const wasm=await FilesetResolver.forVisionTasks(base+'/wasm');
    return HandLandmarker.createFromOptions(wasm,{
      baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'CPU'},
      runningMode:'IMAGE',numHands:2,minHandDetectionConfidence:.45,minHandPresenceConfidence:.45
    });
  })().catch(()=>{detectorPromise=null;throw Error('Не удалось загрузить модуль распознавания. Проверьте соединение или откройте встроенный пример.');});
  return detectorPromise;
}
async function enableCamera(token){
  if(!navigator.mediaDevices?.getUserMedia) throw Error('Для камеры откройте страницу по HTTPS в браузере телефона.');
  const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
  if(token!==revision){next.getTracks().forEach(t=>t.stop());stillCurrent(token);}
  stream=next;video.srcObject=stream;
  try{await video.play();stillCurrent(token);}catch(e){if(stream===next)stopTracks();throw e;}
  $('stage-empty').hidden=true;status.textContent='Готово. Нажмите «Записать один жест» и дождитесь сигнала.';
}
function waitEvent(target,name,trigger){
  return new Promise((resolve,reject)=>{
    const finish=(error)=>{clearTimeout(timer);target.removeEventListener(name,done);target.removeEventListener('error',fail);error?reject(error):resolve();};
    const done=()=>finish(),fail=()=>finish(Error('Браузер не смог прочитать видео.'));
    const timer=setTimeout(fail,7000);
    target.addEventListener(name,done,{once:true});target.addEventListener('error',fail,{once:true});
    if(trigger)trigger();
  });
}
function makeCapture(){
  const aspect=video.videoWidth/video.videoHeight;
  if(!Number.isFinite(aspect)||aspect<=0)throw Error('Не удалось определить размер кадра.');
  const scale=Math.min(1,512/Math.max(video.videoWidth,video.videoHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  return {aspect,take:()=>{context.drawImage(video,0,0,canvas.width,canvas.height);return context.getImageData(0,0,canvas.width,canvas.height);}};
}
async function captureVideo(token) {
  if(video.readyState<2) await waitEvent(video,'loadeddata');
  stillCurrent(token);
  const capture=makeCapture(),images=[];
  if(mode==='camera') {
    status.textContent='Приготовьтесь…';await sleep(850);stillCurrent(token);
    status.textContent='Покажите жест сейчас. Идёт запись…';const start=performance.now();
    for(let i=0;i<16;i++){
      await sleep(Math.max(0,start+(i+.5)*125-performance.now()));stillCurrent(token);images.push(capture.take());
    }
  } else {
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>10.05)throw Error('Нужен короткий видеофрагмент длительностью до 10 секунд.');
    video.pause();
    for(let i=0;i<16;i++){
      const t=video.duration*(i+.5)/16;
      await waitEvent(video,'seeked',()=>{video.currentTime=t;});stillCurrent(token);images.push(capture.take());
    }
  }
  return {aspect:capture.aspect,images};
}
async function extract(token) {
  status.textContent='Загрузка модуля распознавания. При первом запуске потребуется интернет…';
  const detector=await getDetector();stillCurrent(token);
  const {aspect,images}=await captureVideo(token),frames=[];
  status.textContent='Определяем положение рук в 16 кадрах…';
  for(const img of images){
    stillCurrent(token);
    const got=detector.detect(img);
    frames.push(got.landmarks.map((pts,k)=>({side:got.handedness[k][0].categoryName,landmarks:pts.map(p=>[p.x,p.y,p.z])})));
    await sleep(0);
  }
  return {aspect,frames};
}
function showResult(result,truth){
  $('word').textContent=result.accepted?result.word:'Жест не распознан';
  $('detail').textContent=result.accepted?'Проверьте слово перед добавлением.':(result.valid<model.minFrames?'В нескольких кадрах система потеряла руки. Покажите жест ещё раз.':'Модель не смогла уверенно выбрать слово. Повторите жест или введите слово вручную.');
  $('truth').hidden=!truth;if(truth)$('truth').textContent='Разметка корпуса: '+truth+'.';
  proposed=result.accepted?result.word:'';$('add').disabled=!proposed;
  status.textContent=mode==='example'?'Обработаны сохранённые координаты рук из 16 кадров.':'Завершено. Кадров с видимой рукой: '+result.valid+' из 16.';
}
run.addEventListener('click',async()=>{
  if(busy||!model)return;
  const token=++revision;busy=true;updateRun();resetOutput();
  try{
    if(mode==='camera'&&!stream){await enableCamera(token);return;}
    const sample=$('example').value;
    const clip=mode==='example'?await asset('./samples/'+sample+'.json'):await extract(token);
    stillCurrent(token);showResult(classify(clip,model),mode==='example'?data[sample].label:null);
  }catch(e){
    if(e.name!=='AbortError'&&token===revision) status.textContent=e.name==='NotAllowedError'?'Нет доступа к камере. Разрешите его в браузере или откройте пример.':e.name==='NotFoundError'?'Камера не найдена. Выберите пример или видеофайл.':e.message;
  }finally{if(token===revision){busy=false;updateRun();}}
});
function updateTextActions(){$('copy').disabled=!$('transcript').value.trim();$('undo').disabled=previousText===null;}
$('transcript').addEventListener('input',()=>{previousText=null;updateTextActions();});
$('add').addEventListener('click',()=>{
  if(!proposed)return;const box=$('transcript');previousText=box.value;box.value=[box.value.trimEnd(),proposed].filter(Boolean).join(' ');
  proposed='';$('add').disabled=true;$('copy-status').textContent='Слово добавлено.';updateTextActions();
});
$('undo').addEventListener('click',()=>{
  if(previousText!==null){$('transcript').value=previousText;previousText=null;$('copy-status').textContent='Добавление отменено.';updateTextActions();}
});
$('copy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('transcript').value);$('copy-status').textContent='Текст скопирован.';}
  catch{$('transcript').select();$('copy-status').textContent='Текст выделен. Нажмите «Копировать» в меню браузера.';}
});
window.addEventListener('pagehide',()=>{revision++;stopTracks();clearFile();});
asset('./assets/model.json').then(value=>{model=value;setMode('example');}).catch(e=>{status.textContent=e.message;});
