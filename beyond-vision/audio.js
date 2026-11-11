import {CONFIG} from './config.js';
export const hasSpeech=()=>('speechSynthesis' in window&&'SpeechSynthesisUtterance' in window);
let utterance;
export function stopSpeech(){if(hasSpeech())window.speechSynthesis.cancel()}
export function speak(text,onEnd=()=>{}){
  if(!hasSpeech())return false;
  stopSpeech();utterance=new SpeechSynthesisUtterance(text);utterance.lang='ru-RU';utterance.rate=.92;
  const voice=window.speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('ru'));
  if(voice)utterance.voice=voice;
  utterance.onend=onEnd;utterance.onerror=onEnd;window.speechSynthesis.speak(utterance);return true;
}
export class Recorder {
  constructor({onTick,onComplete,onError}){this.onTick=onTick;this.onComplete=onComplete;this.onError=onError;this.active=false;}
  static supported(){return !!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)}
  async start(){
    if(!Recorder.supported())throw new Error('Этот браузер не поддерживает запись. Введите ответ текстом или используйте диктовку на клавиатуре телефона.');
    try{
      stopSpeech();this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m));
      this.recorder=new MediaRecorder(this.stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:48000});
      this.chunks=[];this.size=0;this.active=true;this.started=Date.now();
      this.recorder.ondataavailable=e=>{if(e.data.size){this.chunks.push(e.data);this.size+=e.data.size;if(this.size>CONFIG.maxAudioBytes)this.stop()}};
      this.recorder.onerror=()=>{this.stop();this.onError('Запись прервалась. Прослушайте сохранённый фрагмент или запишите ответ ещё раз.')};
      this.recorder.onstop=()=>{
        this.cleanup();const blob=new Blob(this.chunks,{type:this.recorder.mimeType||mime||'audio/webm'});
        if(blob.size>CONFIG.maxAudioBytes){this.onError('Запись слишком большая. Пожалуйста, запишите ответ короче.');return}
        if(blob.size)this.onComplete(blob);else this.onError('Звук не записался. Проверьте микрофон и попробуйте ещё раз.');
      };
      this.recorder.start(1000);
      this.interval=setInterval(()=>{
        const elapsed=Math.floor((Date.now()-this.started)/1000);this.onTick(elapsed);
        if(elapsed>=CONFIG.maxRecordingSeconds)this.stop();
      },300);
    }catch(error){this.cleanup();throw new Error(error.name==='NotAllowedError'?'Нет доступа к микрофону. Разрешите его в настройках браузера или ответьте текстом.':'Не удалось включить микрофон. Ответ можно ввести текстом.');}
  }
  stop(){if(this.recorder?.state==='recording')this.recorder.stop();else this.cleanup()}
  cleanup(){clearInterval(this.interval);this.stream?.getTracks().forEach(t=>t.stop());this.active=false;}
}
