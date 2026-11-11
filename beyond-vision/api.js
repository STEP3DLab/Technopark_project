import {CONFIG} from './config.js?v=1.2.0';
export class ApiError extends Error {constructor(message,code='NETWORK'){super(message);this.code=code;}}
export const isConfigured=()=>/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(CONFIG.apiUrl);
export async function api(action,payload={},timeout=45000){
  if(!isConfigured())throw new ApiError('Приём ответов ещё не открыт. Организатор сообщит, когда можно начать.','NOT_CONFIGURED');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(CONFIG.apiUrl,{
      method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,studyId:CONFIG.studyId,...payload}),
      redirect:'follow',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,
    });
    if(!response.ok)throw new ApiError('Не удалось связаться с исследованием. Попробуйте ещё раз.');
    const data=await response.json();
    if(!data.ok)throw new ApiError(data.message||'Не удалось сохранить ответ. Попробуйте ещё раз.',data.code);
    return data;
  }catch(error){
    if(error instanceof ApiError)throw error;
    throw new ApiError('Нет подтверждения от сервера. Ваш черновик сохранён на этом устройстве. Проверьте соединение и повторите отправку.');
  }finally{clearTimeout(timer)}
}
export async function encodeAudio(blob){
  if(blob.size>CONFIG.maxAudioBytes)throw new ApiError('Запись слишком большая. Запишите более короткий ответ.','AUDIO_SIZE');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new ApiError('Не удалось прочитать аудиозапись.'));
    reader.onload=()=>resolve({mime:blob.type.split(';')[0],base64:String(reader.result).split(',')[1]});
    reader.readAsDataURL(blob);
  });
}
