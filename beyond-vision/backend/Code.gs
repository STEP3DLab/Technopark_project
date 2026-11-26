/** За пределами зрения — private Google Sheets / Drive backend.
 * Bind this project to the supplied spreadsheet. Run setup() once, then deploy
 * as a Web app: execute as the owner; access Anyone. Never publish the Sheet.
 */
const APP = Object.freeze({
  spreadsheetId: '1C0Bc63nyd-0qp2GniTJ_KxxZAOyBrd3cLBVRLXjnh28',
  studyId: 'tactile-rgsu-2026-v1', version: '1.4.1', timezone: 'Europe/Moscow',
  maxAudioBytes: 2500000, maxText: 6000, tokenHours: 72,
  sheets: {slots:'Окна',bookings:'Записи',access:'Доступ',sessions:'Сессии',answers:'Ответы',settings:'Настройки',tests:'Тесты',questions:'Вопросы',assignments:'Назначения',runs:'Прохождения тестов',results:'Ответы тестов'},
});
const HEADERS = Object.freeze({
  slots:['ID окна','Дата','Начало','Окончание','Мест','Статус','Адрес','Примечание'],
  bookings:['ID записи','Создана','ID окна','ФИО','Почта','Телефон','Помощь при посещении','Согласие от','Статус','Участник','Письмо','Попыток отправки','Ошибка письма','Источник','ID запроса','Письмо отправлено'],
  access:['Участник','Логин','Соль','Хеш пароля','Хеш кода','Статус','Панель 1','Панель 2','Панель 3','Версия доступа','ID записи','Создан'],
  sessions:['Участник','Начата','Обновлена','Статус','Подтверждение','Отозвана'],
  answers:['ID ответа','Участник','Вопрос','Номер панели','Маркировка','Текст','Значение JSON','Пропущен','ID аудио','Ссылка аудио','Сохранён','ID запроса','Редакция'],
  settings:['Ключ','Значение','Описание'],
  tests:['ID теста','Версия','Название (видит участник)','Статус','Инструкция участнику','Комментарий организатора'],
  questions:['ID теста','Версия','Порядок','ID вопроса','Тип','Раздел','Вопрос / заголовок','Подсказка / инструкция','Варианты (по строкам)','Обязательный текст','Номер панели','Подпись поля'],
  assignments:['Участник','ID теста','Версия','Статус','Панель 1','Панель 2','Панель 3','Комментарий'],
  runs:['ID прохождения','Участник','ID теста','Версия','Название','Начато','Обновлено','Статус','Подтверждение','Отозвано','Снимок вопросов JSON','Панели JSON','Хеш версии'],
  results:['ID ответа','ID прохождения','Участник','ID теста','Версия','ID вопроса','Порядок','Тип','Вопрос (снимок)','Номер панели','Маркировка','Текст ответа','Значение JSON','Пропущен','ID аудио','Ссылка аудио','Сохранён','ID запроса','Редакция'],
});
let spreadsheetCache_;
function book_(){
  if(spreadsheetCache_)return spreadsheetCache_;
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')||APP.spreadsheetId;
  if(!id)fail_('SETUP','Сервис ещё не открыт организатором.');
  spreadsheetCache_=SpreadsheetApp.openById(id);return spreadsheetCache_;
}
function sheet_(kind){const s=book_().getSheetByName(APP.sheets[kind]);if(!s)fail_('SETUP','Сервис ещё не открыт организатором.');return s;}
function rows_(kind){const s=sheet_(kind),last=s.getLastRow();return last<2?[]:s.getRange(2,1,last-1,HEADERS[kind].length).getValues().map((values,i)=>({values,row:i+2}));}
function now_(){return new Date().toISOString();}
function fail_(code,message){const error=new Error(message);error.code=code;throw error;}
function text_(value,max){const s=String(value==null?'':value).trim();if(s.length>max)fail_('VALIDATION','Ответ слишком длинный. Сократите его и повторите отправку.');return s;}
function cell_(value){const s=String(value==null?'':value);return /^[\s]*[=+\-@]/.test(s)?"'"+s:s;}
function uncell_(value){return String(value==null?'':value).replace(/^'(?=[\s]*[=+\-@])/,'');}
function writeRow_(kind,row,values){sheet_(kind).getRange(row,1,1,HEADERS[kind].length).setValues([values.map(v=>typeof v==='string'?cell_(v):v)]);}
function append_(kind,values){const s=sheet_(kind);const row=s.getLastRow()+1;writeRow_(kind,row,values);return row;}
function locked_(fn){const lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail_('BUSY','Сервис занят. Попробуйте ещё раз через несколько секунд.');try{return fn()}finally{lock.releaseLock()}}
function secret_(){const secret=PropertiesService.getScriptProperties().getProperty('APP_SECRET');if(!secret)fail_('SETUP','Сервис ещё не открыт организатором.');return secret;}
function hash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function hmac_(value){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(value),secret_())).replace(/=+$/,'');}
function equal_(a,b){a=String(a);b=String(b);let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function setting_(key,fallback){const row=rows_('settings').find(r=>r.values[0]===key);return row?String(row.values[1]):fallback;}
function open_(type){return ['да','true','1','открыто'].includes(setting_(type==='study'?'Опрос открыт':'Запись открыта','да').toLowerCase());}
function uuid_(){return Utilities.getUuid();}
function requestId_(value){const id=text_(value,80);if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id))fail_('VALIDATION','Обновите страницу и повторите действие.');return id;}
function limit_(key,max,seconds){const cache=CacheService.getScriptCache();const cacheKey='limit:'+hash_(key);const n=Number(cache.get(cacheKey)||0);if(n>=max)fail_('RATE_LIMIT','Слишком много попыток. Пожалуйста, подождите несколько минут.');cache.put(cacheKey,String(n+1),seconds);}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function handle_(fn){try{return json_({ok:true,...fn()})}catch(error){return json_({ok:false,code:error.code||'SERVER',message:error.code?error.message:'Не удалось выполнить действие. Попробуйте ещё раз или обратитесь к организатору.'})}}
function doGet(e){return handle_(()=>{
  const action=e&&e.parameter&&e.parameter.action||'health';
  if(action==='health')return {version:APP.version,ready:!!PropertiesService.getScriptProperties().getProperty('APP_SECRET')};
  if(action==='slots')return publicSlots_();
  fail_('ACTION','Это действие недоступно.');
});}
function doPost(e){return handle_(()=>{
  const raw=e&&e.postData&&e.postData.contents||'';
  if(raw.length>4000000)fail_('SIZE','Запись слишком большая. Пожалуйста, запишите ответ короче.');
  let p;try{p=JSON.parse(raw)}catch(error){fail_('VALIDATION','Не удалось прочитать запрос. Повторите действие.');}
  if(p.studyId!==APP.studyId)fail_('VERSION','Откройте актуальную страницу исследования.');
  if(p.action==='slots')return publicSlots_();
  if(p.action==='book')return register_(p);
  if(p.action==='login')return login_(p);
  if(p.action==='resume')return locked_(()=>{if(!open_('study'))fail_('CLOSED','Исследование пока не открыто.');return {session:managedSession_(authorize_(p.token),true)};});
  if(p.action==='save')return managedSave_(p);
  if(p.action==='finish')return managedFinish_(p);
  if(p.action==='withdraw')return managedWithdraw_(p);
  fail_('ACTION','Это действие недоступно.');
});}
function date_(value){
  if(Object.prototype.toString.call(value)==='[object Date]')return Utilities.formatDate(value,APP.timezone,'yyyy-MM-dd');
  const s=String(value).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';
}
function time_(value){
  if(Object.prototype.toString.call(value)==='[object Date]')return Utilities.formatDate(value,APP.timezone,'HH:mm');
  if(typeof value==='number'){const minutes=Math.round((value%1)*1440);return ('0'+Math.floor(minutes/60)).slice(-2)+':'+('0'+minutes%60).slice(-2);}
  const m=String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);return m&&Number(m[1])<24&&Number(m[2])<60?('0'+m[1]).slice(-2)+':'+m[2]:'';
}
function slot_(record){
  const r=record.values,date=date_(r[1]),start=time_(r[2]),end=time_(r[3]);
  if(!r[0]||!date||!start||!end||start>=end||Number(r[4])<1||!Number.isInteger(Number(r[4])))return null;
  return {id:String(r[0]),date,start,end,capacity:Number(r[4]),state:['открыто','open','да'].includes(String(r[5]).toLowerCase())?'open':'closed',location:String(r[6]||'Москва, ул. Вильгельма Пика, д. 4, стр. 8, Технопарк РГСУ'),note:String(r[7]||'')};
}
function allSlots_(){return rows_('slots').map(slot_).filter(Boolean).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));}
function occupied_(id,exclude){return rows_('bookings').filter(r=>r.row!==exclude&&String(r.values[2])===id&&['confirmed','подтверждена','подтверждено'].includes(String(r.values[8]).toLowerCase())).length;}
function publicSlots_(){
  if(!open_('booking'))return {slots:[],bookingOpen:false};
  const now=Date.now();const end=now+1000*60*60*24*180;
  const occupied={};rows_('bookings').forEach(r=>{if(['confirmed','подтверждена','подтверждено'].includes(String(r.values[8]).toLowerCase()))occupied[String(r.values[2])]=(occupied[String(r.values[2])]||0)+1});
  const slots=allSlots_().filter(s=>{const at=new Date(`${s.date}T${s.end}:00+03:00`).getTime();return at>now&&at<end;}).slice(0,500).map(s=>({...s,free:s.state==='open'?Math.max(0,s.capacity-(occupied[s.id]||0)):0}));
  return {slots,bookingOpen:true};
}
function schedule_(index){
  const orders=[['S','K','M'],['K','M','S'],['M','S','K']];
  const maps=[{S:'A',K:'Б',M:'В'},{S:'Б',K:'В',M:'A'},{S:'В',K:'A',M:'Б'}];
  const n=(index-1)%9,order=orders[Math.floor(n/3)],map=maps[n%3];return order.map(p=>p+'-'+map[p]);
}
function credentials_(access){
  const row=Array.isArray(access)?access:access.values,pid=String(row[0]),nonce=String(row[9]);
  const password=hmac_('password|'+pid+'|'+nonce).slice(0,18);
  const bytes=Utilities.computeHmacSha256Signature('code|'+pid+'|'+nonce,secret_());
  const code=bytes.slice(0,12).map(b=>String(((b+256)%256)%10)).join('');
  return {login:String(row[1]),password,code};
}
function createAccess_(bookingId){
  const next=rows_('access').reduce((max,r)=>Math.max(max,Number(String(r.values[0]).replace(/^U/,''))||0),0)+1;
  const pid='U'+String(next).padStart(4,'0'),salt=uuid_(),nonce=uuid_(),schedule=schedule_(next);
  const values=[pid,'vision-'+String(next).padStart(4,'0'),salt,'','','active',...schedule,nonce,bookingId,now_()];
  const creds=credentials_(values);values[3]=hash_(salt+'|'+creds.password);values[4]=hash_(salt+'|'+creds.code);
  return {row:append_('access',values),values};
}
function validateVisitor_(p){
  const fullName=text_(p.fullName,160),email=text_(p.email,180).toLowerCase(),phone=text_(p.phone,30),assistance=text_(p.assistance,700);
  if(fullName.length<2||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)||phone.replace(/\D/g,'').length<10||!p.consent)fail_('VALIDATION','Проверьте ФИО, почту, телефон и согласие на сохранение данных.');
  return {fullName,email,phone,assistance};
}
function register_(p){
  if(!open_('booking'))fail_('CLOSED','Запись на посещения пока не открыта.');
  if(p.website)fail_('VALIDATION','Не удалось выполнить запись.');
  const visitor=validateVisitor_(p),requestId=requestId_(p.requestId),slotId=text_(p.slotId,80);
  const result=locked_(()=>{
    const existing=rows_('bookings').find(r=>r.values[14]===requestId);
    if(existing){
      if(uncell_(existing.values[4]).toLowerCase()!==visitor.email||String(existing.values[2])!==slotId)fail_('CONFLICT','Повторите запись с новым запросом.');
      const access=rows_('access').find(a=>a.values[0]===existing.values[9]);if(!access)fail_('SETUP','Обратитесь к организатору: запись требует проверки.');return {record:existing,access};
    }
    limit_('all-bookings',30,60);limit_('booking-email|'+visitor.email,4,3600);
    const slot=allSlots_().find(s=>s.id===slotId);
    if(!slot||slot.state!=='open'||new Date(`${slot.date}T${slot.start}:00+03:00`).getTime()<=Date.now())fail_('SLOT_FULL','Это посещение больше недоступно. Выберите другое время.');
    if(occupied_(slotId)>=slot.capacity)fail_('SLOT_FULL','Все места на это время уже заняты. Выберите другое окно.');
    const duplicate=rows_('bookings').find(r=>String(r.values[2])===slotId&&uncell_(r.values[4]).toLowerCase()===visitor.email&&r.values[8]==='confirmed');
    if(duplicate)fail_('DUPLICATE','На это время уже есть запись с указанной почтой. Проверьте письмо с доступом или обратитесь к организатору.');
    const id='BV-'+uuid_().replace(/-/g,'').slice(0,12).toUpperCase(),stamp=now_();
    const access=createAccess_(id);
    const values=[id,stamp,slotId,visitor.fullName,visitor.email,visitor.phone,visitor.assistance,stamp,'confirmed',access.values[0],'pending',0,'','site',requestId,''];
    const record={row:append_('bookings',values),values};SpreadsheetApp.flush();return {record,access};
  });
  const emailStatus=sendBookingMail_(result.record.values[0]);
  return {bookingId:result.record.values[0],credentials:credentials_(result.access),emailStatus};
}
function sendBookingMail_(bookingId){
  const task=locked_(()=>{
    const booking=rows_('bookings').find(r=>r.values[0]===bookingId);if(!booking)return null;
    if(booking.values[10]==='sent'||booking.values[10]==='sending'&&Date.now()-new Date(booking.values[15]||0).getTime()<300000)return {status:booking.values[10]};
    const access=rows_('access').find(a=>a.values[0]===booking.values[9]);
    const slot=allSlots_().find(s=>s.id===String(booking.values[2]));
    if(!access||!slot)return {status:'failed'};
    const values=booking.values.slice();values[10]='sending';values[11]=Number(values[11]||0)+1;values[12]='';values[15]=now_();writeRow_('bookings',booking.row,values);
    return {booking:{row:booking.row,values},access,slot};
  });
  if(!task)return 'failed';if(task.status)return task.status;
  let sent=false,message='';
  try{
    if(MailApp.getRemainingDailyQuota()<1)throw new Error('Дневной лимит отправки писем исчерпан.');
    const c=credentials_(task.access),s=task.slot,site=setting_('Адрес сайта','https://step3dlab.github.io/Technopark_project/beyond-vision/');
    const body=[`Здравствуйте, ${uncell_(task.booking.values[3])}!`,'','Вы записаны на исследование тактильного искусства «За пределами зрения».',`Дата: ${s.date}. Время: ${s.start}–${s.end}, по Москве.`,`Место: ${s.location}.`,`Номер записи: ${bookingId}.`,'','Ваш доступ к опросу:',`Логин: ${c.login}`,`Пароль: ${c.password}`,`Код участника: ${c.code}`,'Можно войти по коду либо по логину и паролю.',`${site}#access`,'',`Как нас найти: ${site}#visit`,'Если нужна встреча у входа или помощь, ответьте на это письмо.','Названия и содержание панелей до завершения исследования с другими участниками обсуждать не нужно.','','Если вы не оставляли запись, ответьте на это письмо: организатор отменит её.','Исследовательский проект «За пределами зрения»'].join('\n');
    MailApp.sendEmail({to:uncell_(task.booking.values[4]),subject:'Ваша запись и доступ · За пределами зрения',body,name:'За пределами зрения'});sent=true;
  }catch(error){message=String(error.message||'Не удалось отправить письмо').slice(0,500);}
  locked_(()=>{const record=rows_('bookings').find(r=>r.values[0]===bookingId);if(record){const v=record.values.slice();v[10]=sent?'sent':'failed';v[12]=message;v[15]=sent?now_():'';writeRow_('bookings',record.row,v)}});
  return sent?'sent':'failed';
}
function token_(access){const expires=Date.now()+APP.tokenHours*3600000;const payload=access.values[0]+'.'+expires;return payload+'.'+hmac_('token|'+payload+'|'+access.values[9]);}
function authorize_(token){
  const parts=String(token||'').split('.');if(parts.length!==3||!/^U\d+$/.test(parts[0])||Number(parts[1])<Date.now())fail_('AUTH','Доступ истёк. Войдите снова с вашим кодом или паролем.');
  const access=rows_('access').find(r=>r.values[0]===parts[0]);
  if(!access||access.values[5]!=='active')fail_('DISABLED','Этот доступ неактивен. Обратитесь к организатору.');
  if(!equal_(hmac_('token|'+parts[0]+'.'+parts[1]+'|'+access.values[9]),parts[2]))fail_('AUTH','Войдите снова с вашим кодом или паролем.');return access;
}
function login_(p){return locked_(()=>{
  if(!open_('study'))fail_('CLOSED','Исследование пока не открыто. Организатор сообщит о начале.');
  limit_('all-logins',100,60);limit_('device|'+text_(p.deviceKey,100),12,600);
  const code=text_(p.code,40).replace(/[\s-]/g,''),login=text_(p.login,40).toLowerCase(),password=text_(p.password,100);
  let found=null;
  for(const access of rows_('access')){
    const v=access.values;if(v[5]!=='active')continue;
    const valid=code?/^\d{12}$/.test(code)&&equal_(hash_(v[2]+'|'+code),v[4]):String(v[1]).toLowerCase()===login&&equal_(hash_(v[2]+'|'+password),v[3]);
    if(valid){found=access;break;}
  }
  if(!found)fail_('AUTH','Доступ не найден. Проверьте код либо логин и пароль.');
  return {token:token_(found),session:managedSession_(found,true)};
});}
function answers_(pid){return rows_('answers').filter(r=>r.values[1]===pid);}
function response_(r){
  const v=r.values;let value=null;try{value=JSON.parse(String(v[6]||'null'))}catch(error){}
  return {text:uncell_(v[5]),value,skipped:v[7]===true||v[7]==='true',hasAudio:!!v[8],savedAt:v[10],revision:Number(v[12]||1)};
}
function session_(access){
  const pid=access.values[0],record=rows_('sessions').find(r=>r.values[0]===pid);
  const state=record&&record.values[3]||'in_progress';
  if(state==='withdrawn')fail_('DISABLED','Участие отозвано. Обратитесь к организатору, если хотите принять участие заново.');
  const answers={};answers_(pid).forEach(r=>answers[r.values[2]]=response_(r));
  return {pid,schedule:access.values.slice(6,9),answers,status:state,receipt:record&&record.values[4]||''};
}
function questionIds_(){const ids=['consent','experience','training'];for(let i=1;i<=3;i++)for(const q of ['explore','description','clarity','confidence','feedback'])ids.push('t'+i+'.'+q);return ids.concat(['preferred','familiarity','comments']);}
function validateAnswer_(id,answer,existing){
  const a=answer||{},text=text_(a.text,APP.maxText),value=a.value==null?null:a.value;
  if(id==='consent'&&(!value||value.adult!==true||value.data!==true||typeof value.audio!=='boolean'))fail_('CONSENT','Для участия нужно добровольное согласие и подтверждение возраста.');
  if(id==='training'&&value!==true)fail_('VALIDATION','Сначала познакомьтесь с тренировочной панелью.');
  if(id==='experience'&&!['never','sometimes','often','skip'].includes(value))fail_('VALIDATION','Выберите один вариант ответа.');
  if(/\.explore$/.test(id)&&(!value||!Number.isFinite(value.seconds)||value.seconds<1||value.seconds>7200))fail_('VALIDATION','Проверьте время исследования панели.');
  if(/\.(clarity|confidence)$/.test(id)&&!['1','2','3','4','5','skip'].includes(String(value)))fail_('VALIDATION','Выберите оценку от 1 до 5 либо вариант без оценки.');
  if(id==='preferred'&&!['1','2','3','same','skip'].includes(value))fail_('VALIDATION','Выберите панель или вариант без оценки.');
  if(/\.description$/.test(id)&&!text&&!a.audio&&!(a.keepAudio&&existing&&existing.values[8]))fail_('VALIDATION','Добавьте описание текстом или голосом.');
  if(a.audio&&!(/\.(description|feedback)$/.test(id)||['familiarity','comments'].includes(id)))fail_('VALIDATION','Для этого вопроса аудио недоступно.');
  return {text,value,skipped:a.skipped===true,keepAudio:a.keepAudio===true,audio:a.audio};
}
function audio_(pid,id,audio){
  const extensions={'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg'};
  const mime=String(audio.mime||'');if(!extensions[mime])fail_('AUDIO_TYPE','Формат аудио не поддерживается. Попробуйте записать ответ заново.');
  if(typeof audio.base64!=='string'||audio.base64.length>Math.ceil(APP.maxAudioBytes*4/3)+8||!/^[-A-Za-z0-9+/]*={0,2}$/.test(audio.base64))fail_('AUDIO_SIZE','Аудиозапись слишком большая или повреждена.');
  const bytes=Utilities.base64Decode(audio.base64);if(bytes.length<12||bytes.length>APP.maxAudioBytes)fail_('AUDIO_SIZE','Аудиозапись слишком большая или повреждена.');
  const unsigned=bytes.map(b=>(b+256)%256);const signature=mime==='audio/webm'?unsigned[0]===26&&unsigned[1]===69&&unsigned[2]===223&&unsigned[3]===163:mime==='audio/ogg'?String.fromCharCode.apply(null,unsigned.slice(0,4))==='OggS':String.fromCharCode.apply(null,unsigned.slice(4,8))==='ftyp';
  if(!signature)fail_('AUDIO_TYPE','Не удалось проверить аудио. Пожалуйста, запишите ответ заново.');
  const folder=PropertiesService.getScriptProperties().getProperty('AUDIO_FOLDER_ID');if(!folder)fail_('SETUP','Хранение аудио пока не открыто. Можно ответить текстом.');
  const name=pid+'_'+id.replace(/\./g,'_')+'_'+uuid_().slice(0,8)+'.'+extensions[mime];
  const file=DriveApp.getFolderById(folder).createFile(Utilities.newBlob(bytes,mime,name));return {id:file.getId(),url:file.getUrl()};
}
function trash_(fileId){if(fileId){try{DriveApp.getFileById(String(fileId)).setTrashed(true)}catch(error){/* File may already be in trash; never fail a saved response. */}}}
function save_(p){return locked_(()=>{
  const access=authorize_(p.token),pid=access.values[0],session=session_(access);
  if(session.status==='completed')fail_('COMPLETED','Анкета уже завершена. Изменить её может только организатор.');
  const ids=questionIds_(),id=text_(p.id,60),index=ids.indexOf(id),requestId=requestId_(p.requestId);
  if(index<0)fail_('QUESTION','Такого вопроса нет. Обновите страницу.');
  for(let i=0;i<index;i++)if(!session.answers[ids[i]])fail_('ORDER','Сначала завершите предыдущий шаг опроса.');
  const existing=answers_(pid).find(r=>r.values[2]===id);
  if(existing&&existing.values[11]===requestId)return {answer:response_(existing)};
  const answer=validateAnswer_(id,p.answer,existing);
  if(answer.audio&&!(session.answers.consent&&session.answers.consent.value.audio))fail_('AUDIO_CONSENT','Для голосового ответа нужно отдельное согласие. Можно продолжить текстом.');
  if(id==='consent'&&answer.value.audio===false&&answers_(pid).some(r=>r.values[8]))fail_('AUDIO_CONSENT','Для отзыва ранее отправленного аудио обратитесь к организатору или отзовите участие.');
  const oldId=existing&&existing.values[8]||'';let audio={id:answer.keepAudio?oldId:'',url:answer.keepAudio&&existing?existing.values[9]:''};
  if(answer.audio)audio=audio_(pid,id,answer.audio);
  const trialMatch=id.match(/^t(\d)\./),trial=trialMatch?Number(trialMatch[1]):'',stamp=now_();
  const values=[pid+'|'+id,pid,id,trial,trial?session.schedule[trial-1]:'',answer.text,JSON.stringify(answer.value),answer.skipped,audio.id,audio.url,stamp,requestId,existing?Number(existing.values[12]||1)+1:1];
  try{if(existing)writeRow_('answers',existing.row,values);else append_('answers',values);SpreadsheetApp.flush()}catch(error){if(audio.id&&audio.id!==oldId)trash_(audio.id);throw error;}
  if(oldId&&oldId!==audio.id)trash_(oldId);
  const state=rows_('sessions').find(r=>r.values[0]===pid);if(state){state.values[2]=stamp;writeRow_('sessions',state.row,state.values)}
  return {answer:response_({values})};
});}
function finish_(p){return locked_(()=>{
  const access=authorize_(p.token),s=session_(access);if(s.status==='completed')return {receipt:s.receipt};
  if(questionIds_().some(id=>!s.answers[id]))fail_('INCOMPLETE','Не все шаги завершены. Вернитесь к опросу и сохраните оставшиеся ответы.');
  const record=rows_('sessions').find(r=>r.values[0]===s.pid),receipt='BV-'+uuid_().replace(/-/g,'').slice(0,16).toUpperCase();
  record.values[2]=now_();record.values[3]='completed';record.values[4]=receipt;writeRow_('sessions',record.row,record.values);return {receipt};
});}
function withdraw_(p){return locked_(()=>{
  const access=authorize_(p.token),pid=access.values[0],record=rows_('sessions').find(r=>r.values[0]===pid);
  if(record){record.values[3]='withdrawn';record.values[5]=now_();writeRow_('sessions',record.row,record.values)}
  answers_(pid).forEach(r=>{trash_(r.values[8]);const v=r.values.slice();v[5]='[участие отозвано]';v[6]='null';v[8]='';v[9]='';v[10]=now_();writeRow_('answers',r.row,v)});
  return {withdrawn:true};
});}
function setup(){
  const active=SpreadsheetApp.getActiveSpreadsheet();const properties=PropertiesService.getScriptProperties();
  if(active)properties.setProperty('SPREADSHEET_ID',active.getId());
  else if(APP.spreadsheetId)properties.setProperty('SPREADSHEET_ID',APP.spreadsheetId);
  if(!properties.getProperty('APP_SECRET'))properties.setProperty('APP_SECRET',uuid_()+uuid_()+uuid_());
  const spreadsheet=book_();spreadsheet.setSpreadsheetTimeZone(APP.timezone);
  Object.keys(HEADERS).forEach(kind=>{let sheet=spreadsheet.getSheetByName(APP.sheets[kind]);if(!sheet)sheet=spreadsheet.insertSheet(APP.sheets[kind]);if(sheet.getLastRow()===0)sheet.getRange(1,1,1,HEADERS[kind].length).setValues([HEADERS[kind]]);sheet.setFrozenRows(1);});
  if(!properties.getProperty('AUDIO_FOLDER_ID'))properties.setProperty('AUDIO_FOLDER_ID',DriveApp.createFolder('За пределами зрения — голосовые ответы').getId());
  const settings=sheet_('settings');if(settings.getLastRow()<2){settings.getRange(2,1,3,3).setValues([
    ['Адрес сайта','https://step3dlab.github.io/Technopark_project/beyond-vision/','Публичная страница для писем с доступом.'],
    ['Опрос открыт','да','да — вход разрешён; нет — вход закрыт.'],
    ['Запись открыта','да','да — регистрация разрешена; нет — регистрация закрыта.'],
  ]);}
  onOpen();SpreadsheetApp.getUi().alert('Сервис подготовлен. Папка для аудио закрыта. Теперь разверните проект как веб-приложение от вашего имени с доступом «Все». URL /exec нужно указать в конфигурации сайта.');
}
function onOpen(){SpreadsheetApp.getUi().createMenu('За пределами зрения').addItem('Управление тестированиями','openTestManager').addSeparator().addItem('Подготовить сервис','setup').addItem('Создать код для выбранного теста','createTestAccess').addItem('Показать код выбранного участника','showTestAccess').addItem('Выдать доступ выбранной записи','issueSelectedBooking').addItem('Повторить неотправленные письма','retryPendingMail').addItem('Отменить выбранную запись','cancelSelectedBooking').addItem('Заменить доступ выбранной записи','resetSelectedAccess').addToUi();}
function selectedBooking_(){const active=SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();if(active.getName()!==APP.sheets.bookings)throw new Error('Выберите строку на листе «Записи».');const row=active.getActiveRange().getRow();if(row<2)throw new Error('Выберите строку участника, ниже заголовка.');return {row,values:active.getRange(row,1,1,HEADERS.bookings.length).getValues()[0]};}
function issueSelectedBooking(){
  const selected=selectedBooking_();
  const bookingId=locked_(()=>{
    const v=selected.values.slice();validateVisitor_({fullName:uncell_(v[3]),email:uncell_(v[4]),phone:uncell_(v[5]),assistance:uncell_(v[6]),consent:!!v[7]});
    const slot=allSlots_().find(s=>s.id===String(v[2]));if(!slot||slot.state!=='open'||occupied_(slot.id,selected.row)>=slot.capacity)throw new Error('Окно недоступно или занято. Проверьте ID окна и вместимость.');
    if(!v[0])v[0]='BV-'+uuid_().replace(/-/g,'').slice(0,12).toUpperCase();
    if(!v[1])v[1]=now_();if(!v[9])v[9]=createAccess_(v[0]).values[0];
    v[8]='confirmed';if(v[10]!=='sent')v[10]='pending';v[13]='manual';if(!v[14])v[14]=uuid_();writeRow_('bookings',selected.row,v);return v[0];
  });
  const status=sendBookingMail_(bookingId);SpreadsheetApp.getUi().alert(status==='sent'?'Доступ создан, письмо отправлено.':'Запись создана. Письмо пока не отправлено; причина видна в столбце «Ошибка письма».');
}
function retryPendingMail(){const records=rows_('bookings').filter(r=>r.values[8]==='confirmed'&&(['pending','failed'].includes(r.values[10])||r.values[10]==='sending'&&Date.now()-new Date(r.values[15]||0).getTime()>300000)).slice(0,30);let count=0;for(const r of records)if(sendBookingMail_(r.values[0])==='sent')count++;SpreadsheetApp.getUi().alert('Отправлено писем: '+count+'. Остальные статусы — на листе «Записи».');}
function cancelSelectedBooking(){const selected=selectedBooking_();locked_(()=>{selected.values[8]='cancelled';writeRow_('bookings',selected.row,selected.values);const access=rows_('access').find(r=>r.values[0]===selected.values[9]);if(access){access.values[5]='disabled';writeRow_('access',access.row,access.values)}});SpreadsheetApp.getUi().alert('Запись отменена, место освобождено. Доступ отключён.');}
function resetSelectedAccess(){
  const selected=selectedBooking_();
  locked_(()=>{const access=rows_('access').find(r=>r.values[0]===selected.values[9]);if(!access)throw new Error('Сначала выдайте доступ этой записи.');access.values[9]=uuid_();access.values[2]=uuid_();const c=credentials_(access);access.values[3]=hash_(access.values[2]+'|'+c.password);access.values[4]=hash_(access.values[2]+'|'+c.code);writeRow_('access',access.row,access.values);selected.values[10]='pending';writeRow_('bookings',selected.row,selected.values)});
  const result=sendBookingMail_(selected.values[0]);SpreadsheetApp.getUi().alert(result==='sent'?'Новый доступ отправлен на почту. Прежний пароль, код и сеансы больше не действуют.':'Доступ заменён. Проверьте статус письма на листе «Записи».');
}


/* v1.4 — управляемые анкеты. Старые листы и функции оставлены для истории. */
function testKey_(value,max){
  const key=String(value==null?'':value).trim();
  if(!new RegExp('^[A-Za-z0-9_-]{1,'+max+'}$').test(key))fail_('TEST_CONFIG','Некорректный ID теста или версия. Обратитесь к организатору.');
  return key;
}
function testRecord_(testId,version){
  const list=rows_('tests').filter(r=>String(r.values[0])===testId&&String(r.values[1])===version);
  if(list.length!==1)fail_('TEST_CONFIG','Организатору нужно проверить ID и версию теста.');
  return list[0].values;
}
function assignment_(access){
  const pid=String(access.values[0]);
  const active=rows_('assignments').filter(r=>String(r.values[0]).trim()===pid&&String(r.values[3]).trim()==='Активно');
  if(active.length===0)fail_('NO_TEST','Для вашего кода пока не назначен тест. Обратитесь к организатору.');
  if(active.length!==1)fail_('TEST_CONFIG','Организатору нужно оставить одно активное назначение для вашего кода.');
  const v=active[0].values,testId=testKey_(v[1],48),version=testKey_(v[2],16);
  const panels=v.slice(4,7).map(x=>text_(x,80));
  // Для перенесённой исходной анкеты допускается прежнее сбалансированное назначение.
  if(testId==='RELIEF-3'&&panels.every(x=>!x))for(let i=0;i<3;i++)panels[i]=String(access.values[i+6]||'');
  return {pid,testId,version,panels,runId:pid+'|'+testId+'|'+version};
}
function makeSteps_(test,questions,panels){
  const title=text_(test[2],220);if(!title)fail_('TEST_CONFIG','У теста отсутствует название.');
  const expand=(value,max)=>text_(value,max).replace(/\{panel([1-3])\}/g,(_,i)=>{
    const p=panels[Number(i)-1];if(!p)fail_('TEST_CONFIG','Для теста необходимо указать маркировку панели '+i+'.');return p;
  });
  const steps=[{id:'consent',kind:'consent',section:'Знакомство',title:'Перед началом',text:expand(test[4],2000)||'Участие добровольное. Можно остановиться или сделать перерыв.'}];
  const ids=new Set(['consent','review']),orders=new Set();
  if(!questions.length||questions.length>60)fail_('TEST_CONFIG','В тесте должно быть от 1 до 60 вопросов.');
  questions.slice().sort((a,b)=>Number(a[2])-Number(b[2])).forEach(v=>{
    const order=Number(v[2]),id=String(v[3]).trim(),kind=String(v[4]).trim(),trial=v[10]===''||v[10]==null?0:Number(v[10]);
    if(!Number.isInteger(order)||order<1||orders.has(order)||!/^[-A-Za-z0-9_.]{1,60}$/.test(id)||ids.has(id)||Object.prototype.hasOwnProperty.call(Object.prototype,id)||!['text','choice','scale','training','explore'].includes(kind)||![0,1,2,3].includes(trial))fail_('TEST_CONFIG','Проверьте порядок, ID, тип и номер панели в вопросах.');
    ids.add(id);orders.add(order);
    const q={id,kind,section:expand(v[5],150)||'Вопросы',title:expand(v[6],500),text:expand(v[7],2500),required:kind==='text'&&String(v[9]).trim()==='Да'};
    if(!q.title)fail_('TEST_CONFIG','У вопроса отсутствует заголовок.');
    if(trial){if(!panels[trial-1])fail_('TEST_CONFIG','Не указана маркировка панели '+trial+'.');q.trial=trial;q.panel=panels[trial-1];}
    if(kind==='explore'&&!trial)fail_('TEST_CONFIG','Для таймера исследования нужен номер панели.');
    if(kind==='text')q.label=expand(v[11],150)||'Ваш ответ';
    if(kind==='choice'||kind==='scale'){
      const lines=expand(v[8],5000).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      if(lines.length<2||lines.length>(kind==='scale'?10:20))fail_('TEST_CONFIG','Проверьте список вариантов ответа.');
      if(kind==='scale')q.labels=lines;
      else{
        const values=new Set();q.options=lines.map((line,i)=>{
          const split=line.indexOf('|'),value=split<0?String(i+1):line.slice(0,split).trim(),label=split<0?line:line.slice(split+1).trim();
          if(!/^[-A-Za-z0-9_]{1,40}$/.test(value)||!label||values.has(value))fail_('TEST_CONFIG','Проверьте уникальность кодов и подписи вариантов ответа.');
          values.add(value);return [value,label];
        });
      }
    }
    steps.push(q);
  });
  steps.push({id:'review',kind:'review',section:'Завершение',title:'Завершение опроса',text:'Все шаги пройдены. Отправьте анкету, чтобы завершить участие.'});
  if(JSON.stringify(steps).length>45000)fail_('TEST_CONFIG','Анкета слишком объёмная для одной версии.');
  return steps;
}
function versionFingerprint_(test,questions){
  const normalized=questions.slice().sort((a,b)=>Number(a[2])-Number(b[2])).map(row=>row.slice(2,12).map(v=>String(v==null?'':v)));
  return hash_(JSON.stringify([String(test[2]||''),String(test[4]||''),normalized]));
}
function assertVersion_(testId,version,test,questions){
  const fingerprint=versionFingerprint_(test,questions);
  const previous=rows_('runs').filter(r=>String(r.values[2])===testId&&String(r.values[3])===version);
  if(previous.some(r=>String(r.values[12]||'')!==fingerprint))fail_('VERSION_LOCKED','Содержание этой версии уже использовалось. Организатору нужно создать новую версию теста.');
  return fingerprint;
}
function managedRows_(runId){return rows_('results').filter(r=>String(r.values[1])===runId);}
function managedResponse_(r){
  const v=r.values;let value=null;try{value=JSON.parse(String(v[12]||'null'))}catch(e){}
  return {text:uncell_(v[11]),value,skipped:v[13]===true||String(v[13])==='true',hasAudio:!!v[14],savedAt:v[16],revision:Number(v[18]||1)};
}
function managedState_(access,create,expected){
  const a=assignment_(access);
  if(expected!==undefined&&String(expected)!==a.runId)fail_('TEST_CHANGED','Назначение изменилось. Войдите снова, чтобы открыть актуальный тест.');
  const matches=rows_('runs').filter(r=>String(r.values[0])===a.runId);
  if(matches.length>1)fail_('TEST_CONFIG','Обнаружено повторное прохождение. Обратитесь к организатору.');
  let record=matches[0];
  if(!record){
    if(!create)fail_('TEST_CHANGED','Войдите снова для начала назначенного теста.');
    const test=testRecord_(a.testId,a.version);
    if(String(test[3]).trim()!=='Открыт')fail_('TEST_CLOSED','Этот тест пока не открыт организатором.');
    const questions=rows_('questions').filter(r=>String(r.values[0])===a.testId&&String(r.values[1])===a.version).map(r=>r.values);
    const steps=makeSteps_(test,questions,a.panels),fingerprint=assertVersion_(a.testId,a.version,test,questions);
    const values=[a.runId,a.pid,a.testId,a.version,text_(test[2],220),now_(),now_(),'in_progress','','',JSON.stringify(steps),JSON.stringify(a.panels),fingerprint];
    record={row:append_('runs',values),values};
  }
  const v=record.values;
  if(v[7]==='withdrawn')fail_('DISABLED','Участие отозвано. Обратитесь к организатору.');
  // Снимок фиксирует версию и маркировки: редактирование таблицы не меняет начатый тест.
  const steps=JSON.parse(String(v[10])),schedule=JSON.parse(String(v[11])).filter(Boolean);
  const answers=Object.create(null);managedRows_(a.runId).forEach(r=>answers[r.values[5]]=managedResponse_(r));
  return {record,steps,session:{pid:a.pid,runId:a.runId,testId:a.testId,testVersion:a.version,testTitle:String(v[4]),schedule,steps,answers,status:String(v[7]),receipt:String(v[8]||'')}};
}
function managedSession_(access,create){return managedState_(access,create).session;}
function managedValidate_(step,a,existing){
  a=a||{};const value=a.value==null?null:a.value,kind=step.kind;
  let text='',normalized=null,keepAudio=false,skipped=false;
  if(kind==='consent'){
    if(!value||value.adult!==true||value.data!==true||typeof value.audio!=='boolean')fail_('CONSENT','Для участия нужно добровольное согласие и подтверждение возраста.');
    normalized={adult:true,data:true,audio:value.audio};
  }else if(kind==='choice'){
    if(typeof value!=='string'||!step.options.some(o=>o[0]===value))fail_('VALIDATION','Выберите один из предложенных вариантов.');
    normalized=value;skipped=value==='skip';
  }else if(kind==='scale'){
    const allowed=step.labels.map((_,i)=>String(i+1)).concat('skip');
    if(!allowed.includes(String(value)))fail_('VALIDATION','Выберите предложенную оценку либо вариант без оценки.');
    normalized=String(value);skipped=normalized==='skip';
  }else if(kind==='training'){
    if(value!==true)fail_('VALIDATION','Сначала завершите подготовительный шаг.');normalized=true;
  }else if(kind==='explore'){
    if(!value||!Number.isInteger(value.seconds)||value.seconds<1||value.seconds>7200)fail_('VALIDATION','Проверьте время исследования.');
    normalized={seconds:value.seconds,timing:'self-reported-phone'};
  }else if(kind==='text'){
    text=text_(a.text,APP.maxText);keepAudio=a.keepAudio===true&&!!(existing&&existing.values[14]);
    if(step.required&&!text&&!a.audio&&!keepAudio)fail_('VALIDATION','Добавьте ответ текстом или голосом.');
    skipped=!text&&!a.audio&&!keepAudio;
  }else fail_('QUESTION','Такого вопроса нет.');
  if(a.audio&&kind!=='text')fail_('VALIDATION','Для этого вопроса голосовой ответ недоступен.');
  return {text,value:normalized,skipped,keepAudio,audio:kind==='text'?a.audio:null};
}
function managedSave_(p){return locked_(()=>{
  if(!open_('study'))fail_('CLOSED','Исследование пока не открыто.');
  const access=authorize_(p.token),m=managedState_(access,false,String(p.runId||'')),s=m.session;
  if(s.status==='completed')fail_('COMPLETED','Анкета уже завершена.');
  const id=text_(p.id,60),index=m.steps.findIndex(q=>q.id===id&&q.kind!=='review'),requestId=requestId_(p.requestId);
  if(index<0)fail_('QUESTION','Такого вопроса нет в назначенном тесте.');
  for(let i=0;i<index;i++)if(!s.answers[m.steps[i].id])fail_('ORDER','Сначала завершите предыдущий шаг.');
  const step=m.steps[index],records=managedRows_(s.runId),existing=records.find(r=>r.values[5]===id);
  if(existing&&existing.values[17]===requestId)return {answer:managedResponse_(existing)};
  const a=managedValidate_(step,p.answer,existing);
  if(a.audio&&!(s.answers.consent&&s.answers.consent.value&&s.answers.consent.value.audio))fail_('AUDIO_CONSENT','Для голосового ответа нужно отдельное согласие.');
  if(id==='consent'&&!a.value.audio&&records.some(r=>r.values[14]))fail_('AUDIO_CONSENT','Для отзыва ранее отправленного аудио обратитесь к организатору или отзовите участие.');
  const oldId=existing&&existing.values[14]||'';
  let audio={id:a.keepAudio?oldId:'',url:a.keepAudio&&existing?existing.values[15]:''};
  if(a.audio)audio=audio_(s.pid+'_'+s.testId+'_'+s.testVersion,id,a.audio);
  const stamp=now_(),values=[s.runId+'|'+id,s.runId,s.pid,s.testId,s.testVersion,id,index+1,step.kind,step.title,step.trial||'',step.panel||'',a.text,JSON.stringify(a.value),a.skipped,audio.id,audio.url,stamp,requestId,existing?Number(existing.values[18]||1)+1:1];
  try{if(existing)writeRow_('results',existing.row,values);else append_('results',values);SpreadsheetApp.flush()}catch(error){if(audio.id&&audio.id!==oldId)trash_(audio.id);throw error;}
  if(oldId&&oldId!==audio.id)trash_(oldId);
  m.record.values[6]=stamp;writeRow_('runs',m.record.row,m.record.values);
  return {answer:managedResponse_({values})};
});}
function managedFinish_(p){return locked_(()=>{
  if(!open_('study'))fail_('CLOSED','Исследование пока не открыто.');
  const m=managedState_(authorize_(p.token),false,String(p.runId||'')),s=m.session;
  if(s.status==='completed')return {receipt:s.receipt};
  if(m.steps.some(q=>q.kind!=='review'&&!s.answers[q.id]))fail_('INCOMPLETE','Не все шаги сохранены. Вернитесь к опросу.');
  const receipt='BV-'+uuid_().replace(/-/g,'').slice(0,16).toUpperCase();
  const v=m.record.values;v[6]=now_();v[7]='completed';v[8]=receipt;writeRow_('runs',m.record.row,v);return {receipt};
});}
function managedWithdraw_(p){return locked_(()=>{
  // Отзыв возможен для собственного прохождения даже после закрытия/смены назначения.
  const access=authorize_(p.token),pid=String(access.values[0]),runId=text_(p.runId,100);
  const record=rows_('runs').find(r=>String(r.values[0])===runId&&String(r.values[1])===pid);
  if(!record)fail_('AUTH','Прохождение не найдено.');
  const v=record.values;v[6]=now_();v[7]='withdrawn';v[9]=now_();writeRow_('runs',record.row,v);
  managedRows_(runId).forEach(r=>{trash_(r.values[14]);const a=r.values.slice();a[11]='[участие отозвано]';a[12]='null';a[14]='';a[15]='';a[16]=now_();writeRow_('results',r.row,a)});
  return {withdrawn:true};
});}
function createTestAccess(){
  const ui=SpreadsheetApp.getUi(),sheet=SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if(sheet.getName()!==APP.sheets.tests||sheet.getActiveRange().getRow()<2){ui.alert('Выберите строку открытого теста на листе «Тесты».');return;}
  const test=sheet.getRange(sheet.getActiveRange().getRow(),1,1,HEADERS.tests.length).getValues()[0];
  const id=testKey_(test[0],48),version=testKey_(test[1],16);
  if(String(test[3]).trim()!=='Открыт'){ui.alert('Сначала откройте тест на листе «Тесты».');return;}
  const input=ui.prompt('Новый участник','Укажите до трёх кодов панелей через запятую. Если панелей нет, оставьте пустым. Для RELIEF-3 пустое поле использует прежнее автоматическое назначение.',ui.ButtonSet.OK_CANCEL);
  if(input.getSelectedButton()!==ui.Button.OK)return;
  const panels=input.getResponseText().split(',').map(x=>text_(x,80));if(panels.length>3){ui.alert('Укажите не более трёх панелей.');return;}while(panels.length<3)panels.push('');
  const result=locked_(()=>{
    const current=testRecord_(id,version);if(String(current[3]).trim()!=='Открыт')fail_('TEST_CLOSED','Тест закрыт.');
    const questions=rows_('questions').filter(r=>String(r.values[0])===id&&String(r.values[1])===version).map(r=>r.values);
    makeSteps_(current,questions,id==='RELIEF-3'&&panels.every(x=>!x)?schedule_(1):panels);
    assertVersion_(id,version,current,questions);
    const access=createAccess_('');append_('assignments',[access.values[0],id,version,'Активно',...panels,'Создано через меню']);
    return {pid:access.values[0],code:credentials_(access).code};
  });
  ui.alert('Участник '+result.pid+'\nКод: '+result.code+'\nПередайте код только этому участнику. Сайт: '+setting_('Адрес сайта','https://step3dlab.github.io/Technopark_project/beyond-vision/')+'#access');
}
function showTestAccess(){
  const ui=SpreadsheetApp.getUi(),sheet=SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if(sheet.getName()!==APP.sheets.access||sheet.getActiveRange().getRow()<2){ui.alert('Выберите участника на листе «Доступ».');return;}
  const pid=String(sheet.getRange(sheet.getActiveRange().getRow(),1).getValue()),record=rows_('access').find(r=>String(r.values[0])===pid&&r.values[5]==='active');
  if(!record){ui.alert('Активный доступ не найден.');return;}
  ui.alert('Участник '+pid+'\nКод: '+credentials_(record).code+'\nПередайте код только этому участнику.');
}


/* Organizer dialog. The participant doPost API never dispatches these functions. */
function requireOrganizer_(){
  const active=SpreadsheetApp.getActiveSpreadsheet();
  if(!active||active.getId()!==book_().getId())fail_('ORGANIZER','Откройте редактор из операционной таблицы.');
}
function openTestManager(){
  requireOrganizer_();
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(MANAGER_HTML).setWidth(1040).setHeight(720),'Управление тестированиями');
}
function adminListTests(){
  requireOrganizer_();
  const questions=rows_('questions'),runs=rows_('runs'),assignments=rows_('assignments');
  const tests=rows_('tests').filter(r=>r.values[0]).map(r=>{
    const v=r.values,id=String(v[0]),version=String(v[1]),same=(row,i,j)=>String(row.values[i])===id&&String(row.values[j])===version;
    const rr=runs.filter(x=>same(x,2,3));
    return {id,version,title:uncell_(v[2]),status:String(v[3]),questions:questions.filter(x=>same(x,0,1)).length,started:rr.length,completed:rr.filter(x=>x.values[7]==='completed').length,inProgress:rr.filter(x=>x.values[7]==='in_progress').length,withdrawn:rr.filter(x=>x.values[7]==='withdrawn').length,assigned:assignments.filter(x=>same(x,1,2)&&x.values[3]==='Активно').length};
  });
  const participants=rows_('access').filter(r=>r.values[5]==='active').map(r=>({pid:String(r.values[0]),assignments:assignments.filter(x=>x.values[0]===r.values[0]&&x.values[3]==='Активно').map(x=>({id:String(x.values[1]),version:String(x.values[2])}))}));
  const links={};['tests','questions','assignments','runs','results'].forEach(k=>links[k]=book_().getUrl()+'#gid='+sheet_(k).getSheetId());
  return {tests,participants,links,studyOpen:open_('study')};
}
function adminTestData_(id,version){
  const v=testRecord_(id,version);
  const records=rows_('questions').filter(r=>String(r.values[0])===id&&String(r.values[1])===version).sort((a,b)=>Number(a.values[2])-Number(b.values[2]));
  const qs=records.map(r=>r.values);
  return {test:v,records,qs,etag:hash_(JSON.stringify([v,qs])),used:rows_('runs').some(r=>String(r.values[2])===id&&String(r.values[3])===version)};
}
function adminLoadTest(id,version){
  requireOrganizer_();
  const d=adminTestData_(testKey_(id,48),testKey_(version,16)),v=d.test;
  return {id:String(v[0]),version:String(v[1]),title:uncell_(v[2]),status:String(v[3]),intro:uncell_(v[4]),note:uncell_(v[5]),etag:d.etag,used:d.used,questions:d.qs.map(q=>({id:String(q[3]),kind:String(q[4]),section:uncell_(q[5]),title:uncell_(q[6]),text:uncell_(q[7]),options:uncell_(q[8]),required:String(q[9])==='Да',trial:String(q[10]||''),label:uncell_(q[11])}))};
}
function adminNormalizeTest_(payload,id,version){
  if(!payload||!Array.isArray(payload.questions)||!payload.questions.length||payload.questions.length>60)fail_('TEST_CONFIG','Добавьте от 1 до 60 вопросов.');
  const test=[id,version,text_(payload.title,220),'Черновик',text_(payload.intro,2000),text_(payload.note,2000)];
  if(!test[2])fail_('TEST_CONFIG','Введите название теста.');
  const questions=payload.questions.map((q,i)=>{
    const kind=String(q.kind||''),qid=String(q.id||'').trim()||'q_'+uuid_().replace(/-/g,'').slice(0,12);
    const trial=q.trial===''||q.trial==null?'':Number(q.trial);
    return [id,version,i+1,qid,kind,text_(q.section,150)||'Вопросы',text_(q.title,500),text_(q.text,2500),['choice','scale'].includes(kind)?text_(q.options,5000):'',kind==='text'&&q.required===true?'Да':'Нет',trial,kind==='text'?text_(q.label,150)||'Ваш ответ':''];
  });
  makeSteps_(test,questions,['ПАНЕЛЬ-1','ПАНЕЛЬ-2','ПАНЕЛЬ-3']);
  return {test,questions};
}
function adminPreviewTest(payload){
  requireOrganizer_();
  const data=adminNormalizeTest_(payload,'PREVIEW','1');
  return {steps:makeSteps_(data.test,data.questions,['ПАНЕЛЬ-1','ПАНЕЛЬ-2','ПАНЕЛЬ-3'])};
}
function adminSaveTest(payload){
  requireOrganizer_();
  return locked_(()=>{
    if(!payload||typeof payload!=='object')fail_('TEST_CONFIG','Нет данных теста.');
    const mode=String(payload.mode||'new');
    let id,version,previous=null;
    if(mode==='new'){id='TEST-'+uuid_().replace(/-/g,'').slice(0,12).toUpperCase();version='1';}
    else{
      id=testKey_(payload.id,48);const sourceVersion=testKey_(payload.version,16);
      previous=adminTestData_(id,sourceVersion);
      if(previous.etag!==String(payload.etag||''))fail_('CONFLICT','Тест изменился в таблице. Откройте его заново.');
      if(mode==='clone'){
        const versions=rows_('tests').filter(r=>String(r.values[0])===id).map(r=>Number(r.values[1])).filter(n=>Number.isSafeInteger(n)&&n>=1);
        version=String(Math.max(0,...versions)+1);previous=null;
      }else if(mode==='edit'){
        version=sourceVersion;
        if(previous.used)fail_('VERSION_LOCKED','Эту версию уже проходили. Создайте новую версию.');
        if(String(previous.test[3])!=='Черновик')fail_('TEST_CONFIG','Открытую или закрытую версию нельзя изменять здесь. Создайте новую версию.');
      }else fail_('TEST_CONFIG','Неизвестная операция.');
    }
    if(!previous&&rows_('tests').some(r=>String(r.values[0])===id&&String(r.values[1])===version))fail_('CONFLICT','Версия уже существует. Повторите действие.');
    const data=adminNormalizeTest_(payload,id,version);
    if(previous){
      const record=rows_('tests').find(r=>String(r.values[0])===id&&String(r.values[1])===version),old=previous.records,target=sheet_('questions');
      const common=Math.min(old.length,data.questions.length);
      for(let i=0;i<common;i++)writeRow_('questions',old[i].row,data.questions[i]);
      for(let i=common;i<data.questions.length;i++)append_('questions',data.questions[i]);
      for(let i=common;i<old.length;i++)target.getRange(old[i].row,1,1,HEADERS.questions.length).clearContent();
      writeRow_('tests',record.row,data.test);
    }else{
      data.questions.forEach(q=>append_('questions',q));
      append_('tests',data.test);
    }
    SpreadsheetApp.flush();return {id,version,title:data.test[2],status:'Черновик'};
  });
}
function adminSetTestStatus(id,version,status){
  requireOrganizer_();
  return locked_(()=>{
    id=testKey_(id,48);version=testKey_(version,16);
    if(!['Открыт','Закрыт','Черновик'].includes(status))fail_('TEST_CONFIG','Неизвестный статус.');
    const d=adminTestData_(id,version),record=rows_('tests').find(r=>String(r.values[0])===id&&String(r.values[1])===version);
    if(status==='Черновик'&&d.used)fail_('VERSION_LOCKED','Использованная версия не может стать редактируемым черновиком.');
    if(status==='Открыт'){makeSteps_(d.test,d.qs,['ПАНЕЛЬ-1','ПАНЕЛЬ-2','ПАНЕЛЬ-3']);assertVersion_(id,version,d.test,d.qs);}
    const v=record.values;v[3]=status;writeRow_('tests',record.row,v);SpreadsheetApp.flush();return {id,version,status};
  });
}
function adminAssignTest(payload){
  requireOrganizer_();
  return locked_(()=>{
    const id=testKey_(payload.id,48),version=testKey_(payload.version,16),d=adminTestData_(id,version);
    if(String(d.test[3])!=='Открыт')fail_('TEST_CLOSED','Сначала откройте тест.');
    const panels=Array.from({length:3},(_,i)=>text_(payload.panels&&payload.panels[i],80)),automatic=id==='RELIEF-3'&&panels.every(v=>!v);
    makeSteps_(d.test,d.qs,automatic?schedule_(1):panels);assertVersion_(id,version,d.test,d.qs);
    let access;
    const request=requestId_(payload.requestId),marker='editor:'+request;
    if(payload.pid){
      access=rows_('access').find(r=>String(r.values[0])===String(payload.pid)&&r.values[5]==='active');
      if(!access)fail_('AUTH','Участник не найден или его доступ отключён.');
    }else{
      const previous=rows_('assignments').find(r=>String(r.values[7])===marker);
      if(previous){
        access=rows_('access').find(r=>r.values[0]===previous.values[0]&&r.values[5]==='active');
        if(!access)fail_('AUTH','Ранее созданный доступ неактивен.');
        if(String(previous.values[1])!==id||String(previous.values[2])!==version)fail_('CONFLICT','Повторный запрос относится к другому тесту.');
        return {pid:access.values[0],code:credentials_(access).code,already:true};
      }
      access=createAccess_('');
    }
    const pid=String(access.values[0]),runId=pid+'|'+id+'|'+version,old=rows_('assignments').filter(r=>String(r.values[0])===pid&&r.values[3]==='Активно');
    if(old.length===1&&String(old[0].values[1])===id&&String(old[0].values[2])===version&&old[0].values.slice(4,7).map(String).join('|')===panels.join('|'))return {pid,code:credentials_(access).code,already:true};
    const run=rows_('runs').find(r=>String(r.values[0])===runId);
    if(run){
      if(run.values[7]==='withdrawn')fail_('DISABLED','Это прохождение отозвано. Для нового испытания нужна другая версия.');
      const existing=JSON.parse(String(run.values[11])),proposed=automatic?access.values.slice(6,9).map(String):panels;
      if(JSON.stringify(existing)!==JSON.stringify(proposed))fail_('VERSION_LOCKED','В начатом прохождении маркировки неизменны. Создайте новую версию для повторного испытания.');
    }
    if(old.length&&payload.replace!==true)fail_('CONFIRM','Подтвердите замену активного назначения. Старые ответы сохранятся.');
    old.forEach(r=>{const v=r.values.slice();v[3]='Закрыто';writeRow_('assignments',r.row,v);});
    append_('assignments',[pid,id,version,'Активно',...panels,marker]);SpreadsheetApp.flush();
    return {pid,code:credentials_(access).code,already:false};
  });
}
function adminRunSummary(id,version){
  requireOrganizer_();id=testKey_(id,48);version=testKey_(version,16);
  const rr=rows_('runs').filter(r=>String(r.values[2])===id&&String(r.values[3])===version),responses=rows_('results');
  return rr.map(r=>{const v=r.values,steps=JSON.parse(String(v[10]||'[]')),total=steps.filter(q=>q.kind!=='review').length,done=responses.filter(x=>String(x.values[1])===String(v[0])).length;return {pid:String(v[1]),state:String(v[7]),done,total,updated:String(v[6]),receipt:String(v[8]||'')};});
}

const MANAGER_HTML = "<!doctype html>\n<html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><base target=\"_blank\">\n<style>\n:root{--paper:#f7f5ef;--white:#fff;--ink:#252b28;--muted:#656e66;--line:#d9dcd4;--accent:#365c4e;--pale:#e5ede5;--red:#9f3d33}\n*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 Arial,sans-serif}button,input,textarea,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.48;cursor:not-allowed}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #809e79;outline-offset:2px}a{color:var(--accent)}h1,h2,h3,p{margin:0}h1,h2{font-family:Georgia,serif;font-weight:normal;letter-spacing:-.025em}h1{font-size:31px}h2{font-size:25px}h3{font-size:15px}.top{padding:21px 27px 15px;display:flex;justify-content:space-between;gap:14px;align-items:flex-end;border-bottom:1px solid var(--line)}.kicker{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--accent)}.muted{color:var(--muted);font-size:12px}.tabs{display:flex;gap:18px;padding:0 27px;border-bottom:1px solid var(--line);background:var(--paper);overflow:auto}.tabs button{background:none;border:0;border-bottom:3px solid transparent;padding:13px 1px 11px;color:var(--muted);white-space:nowrap}.tabs button[aria-selected=true]{font-weight:bold;color:var(--accent);border-bottom-color:var(--accent)}.shell{display:grid;grid-template-columns:244px minmax(0,1fr);min-height:480px}.side{padding:19px 14px;border-right:1px solid var(--line);background:#efeee7}.main{min-width:0;padding:24px 27px 90px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.between{justify-content:space-between}.btn{border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:6px;padding:9px 13px;font-weight:bold}.btn.secondary{background:#fff;color:var(--accent);border-color:#a8b9ac}.btn.ghost{background:transparent;color:var(--accent);border-color:var(--line)}.btn.danger{background:transparent;color:var(--red);border-color:#ddc2bb}.btn.small{font-size:12px;padding:6px 9px}.wide{width:100%}.search{margin-top:14px}.list{display:grid;gap:6px;margin-top:13px}.test-item{border:1px solid transparent;background:transparent;border-radius:7px;padding:12px 10px;text-align:left;color:var(--ink);width:100%}.test-item:hover{background:#f9f9f5}.test-item[aria-current=true]{background:var(--white);border-color:#a8b9ac;box-shadow:0 1px 3px #00000008}.test-title{font-weight:bold;display:block;font-size:13px;overflow-wrap:anywhere}.tag{font-size:11px;border-radius:20px;padding:3px 7px;background:#e6e6df;color:#626960;white-space:nowrap}.tag.open{background:var(--pale);color:var(--accent)}.box{background:var(--white);border:1px solid var(--line);border-radius:9px;padding:17px;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:5px;margin-top:11px}.field>span,.field>label{font-weight:bold;font-size:12px}.field input,.field textarea,.field select,.search input,select{width:100%;padding:10px;border:1px solid #bfc7be;border-radius:5px;background:#fff;color:var(--ink);min-width:0}.field textarea{min-height:76px;resize:vertical}.check{display:flex;align-items:center;gap:8px;font-size:13px;margin-top:12px}.check input{width:18px;height:18px;flex:none}.qcard{border:1px solid var(--line);background:#fff;border-radius:8px;padding:14px 16px;margin:9px 0}.qnum{width:28px;height:28px;display:grid;place-items:center;background:var(--pale);color:var(--accent);font-weight:bold;border-radius:5px}.qhead{display:flex;justify-content:space-between;align-items:center;gap:8px}.notice{padding:11px 14px;background:#e9eee5;border-radius:6px;color:#38513f;margin:10px 0;font-size:13px}.error{background:#f5e4df;color:#812f27}.bar{position:fixed;bottom:0;left:244px;right:0;background:var(--paper);border-top:1px solid var(--line);padding:11px 27px;display:flex;justify-content:space-between;align-items:center;gap:8px;z-index:1;flex-wrap:wrap}.statgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:15px 0}.stat{background:#fff;border:1px solid var(--line);border-radius:7px;padding:13px}.stat strong{font-size:25px;display:block;font-family:Georgia,serif;font-weight:normal}.code{font-size:27px;font-family:monospace;letter-spacing:.12em;color:var(--accent);overflow-wrap:anywhere}.empty{padding:25px 8px;text-align:center;color:var(--muted)}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px 7px;text-align:left;border-bottom:1px solid var(--line)}th{font-size:11px;color:var(--muted)}dialog{width:min(590px,94vw);border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:24px;color:var(--ink)}dialog::backdrop{background:#2229}.preview{min-height:220px}.preview label{display:flex;align-items:center;gap:10px;border:1px solid var(--line);background:white;padding:11px;margin:7px 0;border-radius:6px}.preview textarea{width:100%;padding:10px;border:1px solid var(--line);border-radius:6px}.progress{height:4px;border-radius:2px;background:#dce0d7;margin:14px 0;overflow:hidden}.progress>div{height:100%;background:var(--accent)}.hidden{display:none!important}#message:empty{display:none}#message{margin:10px 27px 0}.demo{margin:0;padding:10px 27px;background:#fff1d9;color:#6f4e1f;font-size:12px}\n@media(max-width:670px){.top{padding:16px}.tabs{padding:0 16px;gap:13px}.shell{display:block}.side{border-right:0;border-bottom:1px solid var(--line);padding:12px 16px}.list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:175px;overflow:auto}.main{padding:17px 16px 115px}.bar{left:0;padding:10px 16px}.grid{grid-template-columns:1fr}.statgrid{grid-template-columns:repeat(2,1fr)}.qhead{align-items:flex-start}.top .muted{display:none}h1{font-size:26px}#message{margin:8px 16px}}\n</style></head><body>\n<div id=\"demo\" class=\"demo hidden\">Демонстрация конструктора. Можно заполнить и просмотреть анкету; сохранение, выдача кодов и реальные результаты доступны только из закрытой Google Таблицы после подключения Apps Script.</div>\n<header class=\"top\"><div><p class=\"kicker\">За пределами зрения / Исследовательская платформа</p><h1>Управление тестированиями</h1></div><div id=\"service\" class=\"muted\" aria-live=\"polite\"></div></header>\n<nav class=\"tabs\" aria-label=\"Разделы\"><button data-tab=\"editor\" aria-selected=\"true\">Конструктор тестов</button><button data-tab=\"assign\" aria-selected=\"false\">Участники и коды</button><button data-tab=\"results\" aria-selected=\"false\">Прохождения и ответы</button></nav>\n<div id=\"message\" role=\"status\" aria-live=\"polite\"></div>\n<div class=\"shell\"><aside class=\"side\"><button class=\"btn wide\" data-action=\"new\">+ Новый тест</button><div class=\"search\"><label for=\"search\" class=\"muted\">Найти тест</label><input id=\"search\" type=\"search\" placeholder=\"Название или ID\"></div><div class=\"list\" id=\"list\"></div></aside><main class=\"main\" id=\"main\"></main></div>\n<dialog id=\"preview\"><div class=\"row between\"><p class=\"kicker\">Предпросмотр участника</p><button class=\"btn ghost small\" data-action=\"preview-close\">Закрыть</button></div><p class=\"muted\" id=\"preview-count\"></p><div class=\"progress\"><div id=\"preview-progress\"></div></div><div id=\"preview-body\" class=\"preview\"></div><div class=\"row between\" style=\"margin-top:16px\"><button class=\"btn secondary\" data-action=\"preview-prev\">Назад</button><button class=\"btn\" data-action=\"preview-next\">Далее</button></div><p class=\"muted\" style=\"margin-top:10px\">Предпросмотр не сохраняет ответы. Маркировки показаны условно.</p></dialog>\n<script>\n(function(){\n'use strict';\nconst $=id=>document.getElementById(id);\nconst esc=s=>String(s==null?'':s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst kinds={text:'Свободный текст / голос',choice:'Выбор одного варианта',scale:'Шкала оценивания',training:'Инструкция / подготовка',explore:'Исследование с таймером'};\nconst statusName={in_progress:'В процессе',completed:'Завершён',withdrawn:'Отозван'};\nconst connected=!!(window.google&&google.script&&google.script.run);\nlet data={tests:[],participants:[],links:{}},model=null,selected=null,tab='editor',busy=false,dirty=false,previewSteps=[],previewIndex=0,runRows=null,runLoading=false,assignReceipt=null,requestId=null;\nconst emptyQuestion=()=>({id:'',kind:'text',section:'Вопросы',title:'',text:'',options:'',required:false,trial:'',label:'Ваш ответ'});\nconst blank=()=>({mode:'new',id:'',version:'',title:'',intro:'',note:'',status:'Черновик',used:false,etag:'',questions:[emptyQuestion()]});\nconst same=(a,b)=>a&&b&&a.id===b.id&&a.version===b.version;\nconst current=()=>data.tests.find(t=>same(t,selected));\nconst canEdit=()=>model&&(model.mode!=='edit'||(!model.used&&model.status==='Черновик'));\nconst alertText=(message,error=false)=>{$('message').className='notice'+(error?' error':'');$('message').textContent=message||'';};\nfunction rpc(name,...args){return new Promise((resolve,reject)=>{\n  if(!connected){reject(new Error('Это демонстрация без подключения к таблице.'));return;}\n  google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e&&e.message||'Не удалось выполнить действие.')))[name](...args);\n});}\nasync function work(fn){if(busy)return;busy=true;document.body.setAttribute('aria-busy','true');renderControls();alertText('');try{await fn()}catch(e){alertText(e.message||String(e),true)}finally{busy=false;document.body.removeAttribute('aria-busy');renderControls();}}\nfunction renderControls(){document.querySelectorAll('button[data-action],button[data-tab]').forEach(b=>{b.disabled=busy||b.dataset.disabled==='true';});}\nfunction confirmDiscard(){return !dirty||confirm('Есть несохранённые изменения. Открыть другой тест без сохранения?');}\nfunction statusTag(s){return '<span class=\"tag '+(s==='Открыт'?'open':'')+'\">'+esc(s)+'</span>';}\nfunction renderList(){\n  const query=$('search').value.trim().toLowerCase(),items=data.tests.filter(t=>(t.title+' '+t.id+' '+t.version).toLowerCase().includes(query));\n  $('list').innerHTML=items.length?items.map((t)=>'<button class=\"test-item\" data-action=\"load\" data-id=\"'+esc(t.id)+'\" data-version=\"'+esc(t.version)+'\" aria-current=\"'+!!same(t,selected)+'\"><span class=\"test-title\">'+esc(t.title)+'</span><span class=\"row\" style=\"margin-top:6px\">'+statusTag(t.status)+'<span class=\"muted\">v'+esc(t.version)+' · '+esc(t.questions)+' вопр.</span></span></button>').join(''):'<div class=\"empty\">'+(query?'Ничего не найдено':'Пока нет тестов')+'</div>';\n  renderControls();\n}\nfunction field(label,key,val,area=false,placeholder='',max=220,disabled=false){\n  return '<label class=\"field\"><span>'+esc(label)+'</span>'+(area?'<textarea data-field=\"'+key+'\" maxlength=\"'+max+'\" placeholder=\"'+esc(placeholder)+'\" '+(disabled?'disabled':'')+'>'+esc(val)+'</textarea>':'<input data-field=\"'+key+'\" maxlength=\"'+max+'\" value=\"'+esc(val)+'\" placeholder=\"'+esc(placeholder)+'\" '+(disabled?'disabled':'')+'>')+'</label>';\n}\nfunction qfield(label,index,key,val,area=false,max=500,placeholder='',disabled=false){\n  return '<label class=\"field\"><span>'+esc(label)+'</span>'+(area?'<textarea data-q=\"'+index+'\" data-key=\"'+key+'\" maxlength=\"'+max+'\" placeholder=\"'+esc(placeholder)+'\" '+(disabled?'disabled':'')+'>'+esc(val)+'</textarea>':'<input data-q=\"'+index+'\" data-key=\"'+key+'\" maxlength=\"'+max+'\" value=\"'+esc(val)+'\" placeholder=\"'+esc(placeholder)+'\" '+(disabled?'disabled':'')+'>')+'</label>';\n}\nfunction qselect(label,i,key,val,options,disabled){\n  return '<label class=\"field\"><span>'+esc(label)+'</span><select data-q=\"'+i+'\" data-key=\"'+key+'\" '+(disabled?'disabled':'')+'>'+options.map(([v,t])=>'<option value=\"'+esc(v)+'\" '+(String(val)===String(v)?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';\n}\nfunction btn(label,action,cls='ghost',disabled=false,extra=''){return '<button class=\"btn '+cls+'\" data-action=\"'+action+'\" data-disabled=\"'+disabled+'\" '+extra+'>'+label+'</button>';}\nfunction qcard(q,i,editable){\n const dis=!editable,kind=q.kind,extra='data-index=\"'+i+'\"';\n return '<article class=\"qcard\"><div class=\"qhead\"><div class=\"row\"><span class=\"qnum\">'+(i+1)+'</span><strong>'+esc(kinds[kind]||kind)+'</strong></div><div class=\"row\">'+btn('↑','up','ghost small',dis||i===0,extra+' aria-label=\"Переместить вопрос '+(i+1)+' вверх\"')+btn('↓','down','ghost small',dis||i===model.questions.length-1,extra+' aria-label=\"Переместить вопрос '+(i+1)+' вниз\"')+btn('Копия','duplicate','ghost small',dis||model.questions.length>=60,extra)+btn('Удалить','delete','danger small',dis||model.questions.length<=1,extra)+'</div></div>'+\n '<div class=\"grid\">'+qselect('Тип вопроса',i,'kind',kind,Object.entries(kinds),dis)+qfield('Раздел',i,'section',q.section,false,150,'Например, Образец 1',dis)+'</div>'+\n qfield('Вопрос / заголовок',i,'title',q.title,false,500,'Введите вопрос',dis)+qfield('Пояснение участнику',i,'text',q.text,true,2500,'Необязательно',dis)+\n (kind==='choice'?qfield('Варианты ответа — по одному в строке',i,'options',q.options,true,5000,'Первый вариант\\nВторой вариант\\nskip|Предпочитаю не отвечать',dis)+'<p class=\"muted\">Коды не обязательны. При необходимости: код|Подпись.</p>':kind==='scale'?qfield('Подписи уровней — от меньшего к большему',i,'options',q.options,true,5000,'Совсем непонятно\\nСкорее непонятно\\nНейтрально\\nСкорее понятно\\nПолностью понятно',dis)+'<p class=\"muted\">Оценки нумеруются автоматически. Отказ от оценки добавляется отдельно.</p>':'')+\n (kind==='text'?qfield('Подпись поля ответа',i,'label',q.label,false,150,'Ваш ответ',dis)+'<label class=\"check\"><input type=\"checkbox\" data-q=\"'+i+'\" data-key=\"required\" '+(q.required?'checked':'')+' '+(dis?'disabled':'')+'>Обязательный ответ (текст или голос)</label>':'')+\n qselect(kind==='explore'?'Панель (обязательно)':'Связать с физической панелью (необязательно)',i,'trial',q.trial,[['','Без панели'],['1','Панель 1'],['2','Панель 2'],['3','Панель 3']],dis)+\n '<p class=\"muted\" style=\"margin-top:7px\">Вопрос может содержать {panel1}, {panel2}, {panel3} — вместо них подставятся маркировки участника.</p></article>';\n}\nfunction renderEditor(){\n if(!model)model=blank();\n const editable=canEdit(),label=model.mode==='new'?'Новый тест':model.mode==='clone'?'Новая версия теста':model.title||'Тест';\n $('main').innerHTML='<div class=\"row between\"><div><p class=\"kicker\">Редактор анкеты</p><h2>'+esc(label)+'</h2></div><div class=\"row\">'+(model.id?'<span class=\"muted\">'+esc(model.id)+' · v'+esc(model.version)+'</span>':'')+statusTag(model.status)+'</div></div>'+\n (!editable?'<div class=\"notice\">Открытая, закрытая или использованная версия защищена от изменения. Создайте новую версию, чтобы продолжить работу без смешивания данных.</div>':'')+\n '<div class=\"box\">'+field('Название теста','title',model.title,false,'Например, Распознавание тактильных образцов',220,!editable)+field('Вводная инструкция участнику','intro',model.intro,true,'Что нужно сделать перед началом',2000,!editable)+field('Внутреннее примечание (не показывается участнику)','note',model.note,true,'Цель, условия, методика',2000,!editable)+'</div>'+\n '<div class=\"row between\" style=\"margin-top:20px\"><div><h3>Вопросы · '+model.questions.length+'</h3><p class=\"muted\">Согласие и экран завершения добавляются автоматически.</p></div>'+btn('+ Добавить вопрос','add','secondary small',!editable||model.questions.length>=60)+'</div>'+\n model.questions.map((q,i)=>qcard(q,i,editable)).join('')+\n btn('+ Добавить вопрос','add','secondary wide',!editable||model.questions.length>=60)+\n '<div class=\"bar\"><div class=\"row\"><span class=\"muted\">'+(dirty?'Есть несохранённые изменения':model.mode==='new'?'Новый черновик':'Версия '+esc(model.version))+'</span>'+btn('Предпросмотр','preview','secondary')+'</div><div class=\"row\">'+(model.id&&model.mode==='edit'?btn('Новая версия','clone','ghost'): '')+(editable?btn('Сохранить черновик','save','',!connected):'')+(model.mode==='edit'&&!dirty&&model.status!=='Открыт'?btn('Открыть тест','open','',!connected):model.mode==='edit'&&model.status==='Открыт'?btn('Закрыть для новых','close','secondary',!connected):'')+'</div></div>';\n renderControls();\n}\nfunction renderAssign(){\n const open=data.tests.filter(t=>t.status==='Открыт'),t=current();\n const chosen=t&&t.status==='Открыт'?t:open[0];\n const opts=open.map(t=>'<option value=\"'+esc(t.id+'|'+t.version)+'\" '+(same(t,chosen)?'selected':'')+'>'+esc(t.title)+' · v'+esc(t.version)+'</option>').join('');\n $('main').innerHTML='<p class=\"kicker\">Доступ участника</p><h2>Назначить тест и выдать код</h2><p class=\"muted\">Один код — один активный тест. Старые прохождения остаются в истории.</p>'+\n '<div class=\"box\"><label class=\"field\"><span>Открытый тест</span><select id=\"assign-test\">'+(opts||'<option value=\"\">Нет открытых тестов</option>')+'</select></label>'+\n '<label class=\"field\"><span>Участник</span><select id=\"assign-pid\"><option value=\"\">Новый участник — создать код</option>'+data.participants.map(p=>'<option value=\"'+esc(p.pid)+'\">'+esc(p.pid)+(p.assignments.length?' · '+esc(p.assignments.map(x=>x.id+' v'+x.version).join(', ')):'')+'</option>').join('')+'</select></label>'+\n '<p class=\"muted\" style=\"margin-top:10px\">Для существующего участника сохраняется прежний код. Для нового код создаётся без регистрации на посещение.</p>'+\n '<div class=\"grid\">'+[1,2,3].map(i=>'<label class=\"field\"><span>Маркировка панели '+i+'</span><input id=\"panel'+i+'\" maxlength=\"80\" placeholder=\"Если используется\"></label>').join('')+'</div><p class=\"muted\" style=\"margin-top:8px\">Для исходной анкеты RELIEF-3 можно оставить все панели пустыми — используется прежнее автоматическое распределение. Для остальных тестов укажите нужные маркировки.</p>'+\n '<label class=\"check\"><input id=\"replace\" type=\"checkbox\">Разрешить замену предыдущего активного назначения (старые ответы сохранятся)</label><div style=\"margin-top:18px\">'+btn('Назначить и показать код','assign','',!connected||!open.length)+'</div></div>'+\n '<div id=\"receipt\"></div><p class=\"muted\">Выдавайте код только его владельцу. Не пересылайте лист «Доступ».</p>';\n if(assignReceipt)showReceipt(assignReceipt);\n renderControls();\n}\nfunction showReceipt(r){$('receipt').innerHTML='<div class=\"box\"><p class=\"kicker\">Доступ готов</p><h3>Участник '+esc(r.pid)+'</h3><p class=\"code\">'+esc(r.code)+'</p><p class=\"muted\">Передайте 12 цифр участнику лично.</p><div class=\"row\" style=\"margin-top:12px\">'+btn('Скопировать код','copy','secondary')+'<a href=\"https://step3dlab.github.io/Technopark_project/beyond-vision/#access\" rel=\"noopener noreferrer\">Открыть вход участника</a></div></div>';renderControls();}\nfunction renderResults(){\n const t=current(),links=data.links;\n $('main').innerHTML='<p class=\"kicker\">Результаты</p><h2>Прохождения и ответы</h2>'+(t?'<p style=\"margin:8px 0\">'+esc(t.title)+' · v'+esc(t.version)+'</p><div class=\"statgrid\"><div class=\"stat\"><strong>'+t.assigned+'</strong><span>Назначено сейчас</span></div><div class=\"stat\"><strong>'+t.inProgress+'</strong><span>В процессе</span></div><div class=\"stat\"><strong>'+t.completed+'</strong><span>Завершено</span></div></div><p class=\"muted\">Отозвано: '+t.withdrawn+'. Показатели относятся к выбранной версии.</p>':'<p class=\"notice\">Выберите тест в списке слева.</p>')+\n '<div class=\"row\" style=\"margin:15px 0\">'+(links.runs?'<a class=\"btn secondary\" href=\"'+esc(links.runs)+'\">Таблица прохождений</a>':'')+(links.results?'<a class=\"btn secondary\" href=\"'+esc(links.results)+'\">Таблица ответов</a>':'')+btn('Обновить','refresh','ghost',!connected)+'</div>'+\n (t?'<div class=\"box\">'+(runLoading?'<p role=\"status\">Загружаем прохождения…</p>':!runRows||!runRows.length?'<p class=\"muted\">Нет прохождений этой версии.</p>':'<div style=\"overflow:auto\"><table><thead><tr><th>Участник</th><th>Статус</th><th>Прогресс</th><th>Обновлено</th></tr></thead><tbody>'+runRows.map(r=>'<tr><td>'+esc(r.pid)+'</td><td>'+esc(statusName[r.state]||r.state)+'</td><td>'+esc(r.done)+' / '+esc(r.total)+'</td><td>'+esc(r.updated.replace('T',' ').slice(0,16))+'</td></tr>').join('')+'</tbody></table></div>')+'</div>':'')+\n '<p class=\"muted\">Сырые ответы, оценки, время и ссылки на аудио доступны в закрытом листе «Ответы тестов». Отозванные прохождения и технический тест CHECK исключаются из научного анализа.</p>';\n renderControls();\n}\nfunction render(){document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));renderList();if(tab==='editor')renderEditor();else if(tab==='assign')renderAssign();else renderResults();}\nasync function refreshData(){data=await rpc('adminListTests');$('service').textContent=data.studyOpen?'В настройках: приём разрешён':'В настройках: приём закрыт';}\nasync function load(id,version){model=await rpc('adminLoadTest',id,version);model.mode='edit';selected={id,version};dirty=false;assignReceipt=null;runRows=null;render();}\nasync function getRuns(){const t=current();runRows=null;if(!t||!connected){render();return;}runLoading=true;render();try{runRows=await rpc('adminRunSummary',t.id,t.version);}finally{runLoading=false;render();}}\nfunction localPreview(){if(!model.title.trim())throw new Error('Введите название теста.');const steps=[{kind:'consent',section:'Знакомство',title:'Перед началом',text:model.intro}];model.questions.forEach(q=>{if(!q.title.trim())throw new Error('Заполните заголовки вопросов.');const s=Object.assign({},q);s.panel=q.trial?'ПАНЕЛЬ-'+q.trial:'';const lines=q.options.split(/\\r?\\n/).filter(x=>x.trim());if(q.kind==='choice'||q.kind==='scale'){if(lines.length<2)throw new Error('Добавьте минимум два варианта.');s.labels=lines;s.options=lines.map((x,i)=>[String(i+1),x.includes('|')?x.slice(x.indexOf('|')+1):x]);}steps.push(s);});steps.push({kind:'review',section:'Завершение',title:'Завершение опроса',text:'Все вопросы пройдены.'});return steps;}\nfunction drawPreview(){const q=previewSteps[previewIndex];if(!q)return;$('preview-count').textContent='Шаг '+(previewIndex+1)+' из '+previewSteps.length;$('preview-progress').style.width=(previewIndex+1)/previewSteps.length*100+'%';let content='';\n if(q.kind==='text')content='<textarea rows=\"4\" aria-label=\"'+esc(q.label||'Ваш ответ')+'\" placeholder=\"Ваш ответ\"></textarea><p class=\"muted\">В настоящем тесте доступна голосовая запись при согласии.</p>';\n if(q.kind==='choice'||q.kind==='scale'){const opts=q.kind==='scale'?q.labels.map((x,i)=>[String(i+1),String(i+1)+' — '+x]).concat([['skip','Предпочитаю не оценивать']]):q.options;content=opts.map(o=>'<label><input type=\"radio\" name=\"preview-answer\">'+esc(o[1])+'</label>').join('');}\n if(q.kind==='consent')content='<label><input type=\"checkbox\">Я старше 18 лет и участвую добровольно</label><label><input type=\"checkbox\">Согласен(на) на сохранение ответов</label><label><input type=\"checkbox\">Разрешаю сохранять голосовые ответы (необязательно)</label>';\n if(q.kind==='explore')content='<div class=\"box\">Маркировка: '+esc(q.panel||'ПАНЕЛЬ-'+q.trial)+'<p class=\"code\">00:00</p><p class=\"muted\">В настоящем тесте здесь работает таймер.</p></div>';\n $('preview-body').innerHTML='<p class=\"kicker\">'+esc(q.section)+'</p><h2 style=\"margin:8px 0\">'+esc(q.title)+'</h2><p style=\"margin-bottom:15px\">'+esc(q.text)+'</p>'+content;\n document.querySelector('[data-action=\"preview-prev\"]').dataset.disabled=String(previewIndex===0);document.querySelector('[data-action=\"preview-next\"]').textContent=previewIndex===previewSteps.length-1?'Закрыть':'Далее';renderControls();\n}\nfunction markDirty(){dirty=true;const n=document.querySelector('.bar .muted');if(n)n.textContent='Есть несохранённые изменения';document.querySelectorAll('[data-action=\"open\"],[data-action=\"close\"]').forEach(b=>{b.dataset.disabled='true';b.disabled=true;});}\ndocument.addEventListener('input',e=>{const el=e.target;if(el.id==='search'){renderList();return;}if(!model||!canEdit())return;if(el.dataset.field){model[el.dataset.field]=el.value;markDirty();}if(el.dataset.q!==undefined){const q=model.questions[Number(el.dataset.q)];if(q){q[el.dataset.key]=el.type==='checkbox'?el.checked:el.value;markDirty();}}});\ndocument.addEventListener('change',e=>{const el=e.target;if(el.dataset.q!==undefined&&el.dataset.key==='kind'&&model&&canEdit()){const q=model.questions[Number(el.dataset.q)];q.kind=el.value;if(q.kind==='scale'&&!q.options)q.options='Совсем нет\\nСкорее нет\\nСредне\\nСкорее да\\nПолностью';markDirty();renderEditor();}});\ndocument.addEventListener('click',e=>{\n const b=e.target.closest('button[data-action],button[data-tab]');if(!b||b.disabled||busy)return;\n if(b.dataset.tab){const next=b.dataset.tab;if(next===tab)return;tab=next;assignReceipt=null;requestId=null;if(tab==='results')work(getRuns);else render();return;}\n const action=b.dataset.action,i=Number(b.dataset.index);\n if(action==='new'){if(!confirmDiscard())return;model=blank();selected=null;tab='editor';dirty=false;render();return;}\n if(action==='load'){if(!confirmDiscard())return;if(!connected){alertText('В демонстрации доступен только новый черновик.',true);return;}work(async()=>{await load(b.dataset.id,b.dataset.version);if(tab==='results')await getRuns();});return;}\n if(action==='add'){if(model.questions.length<60){model.questions.push(emptyQuestion());dirty=true;renderEditor();const fields=document.querySelectorAll('[data-key=\"title\"]');fields[fields.length-1]?.focus();}return;}\n if(['up','down','duplicate','delete'].includes(action)){if(!canEdit())return;const qs=model.questions;if(action==='up'&&i>0)[qs[i-1],qs[i]]=[qs[i],qs[i-1]];if(action==='down'&&i<qs.length-1)[qs[i],qs[i+1]]=[qs[i+1],qs[i]];if(action==='duplicate'&&qs.length<60)qs.splice(i+1,0,{...qs[i],id:''});if(action==='delete'&&qs.length>1){if(!confirm('Удалить вопрос из черновика?'))return;qs.splice(i,1);}dirty=true;renderEditor();return;}\n if(action==='clone'){if(!model||model.mode!=='edit')return;model.mode='clone';model.status='Черновик';model.used=false;dirty=true;renderEditor();alertText('Будет создана новая версия; предыдущая останется в истории.');return;}\n if(action==='preview'){work(async()=>{previewSteps=connected?(await rpc('adminPreviewTest',model)).steps:localPreview();previewIndex=0;drawPreview();$('preview').showModal();});return;}\n if(action==='preview-close'){$('preview').close();return;}if(action==='preview-prev'){previewIndex=Math.max(0,previewIndex-1);drawPreview();return;}if(action==='preview-next'){if(previewIndex===previewSteps.length-1)$('preview').close();else{previewIndex++;drawPreview();}return;}\n if(action==='save'){work(async()=>{const result=await rpc('adminSaveTest',model);await refreshData();await load(result.id,result.version);alertText('Черновик сохранён в таблице. Проверьте вопросы и откройте тест.');});return;}\n if(action==='open'||action==='close'){if(action==='close'&&!confirm('Закрыть тест для новых прохождений? Уже начатые прохождения сохранятся.'))return;work(async()=>{await rpc('adminSetTestStatus',model.id,model.version,action==='open'?'Открыт':'Закрыт');await refreshData();await load(model.id,model.version);alertText(action==='open'?'Тест открыт. Теперь можно назначать его участникам.':'Новые прохождения закрыты.');});return;}\n if(action==='assign'){const value=$('assign-test').value.split('|');const payload={id:value[0],version:value[1],pid:$('assign-pid').value,panels:[1,2,3].map(n=>$('panel'+n).value.trim()),replace:$('replace').checked,requestId:requestId||(requestId=crypto.randomUUID())};work(async()=>{const r=await rpc('adminAssignTest',payload);requestId=null;assignReceipt=r;await refreshData();renderAssign();alertText('Назначение сохранено.');});return;}\n if(action==='copy'&&assignReceipt){work(async()=>{try{await navigator.clipboard.writeText(assignReceipt.code);alertText('Код скопирован.');}catch(e){alertText('Скопируйте код вручную из карточки.',true);}});return;}\n if(action==='refresh'){work(async()=>{await refreshData();await getRuns();});}\n});\nwindow.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});\nif(connected){work(async()=>{await refreshData();model=blank();render();});}else{$('demo').classList.remove('hidden');$('service').textContent='Предпросмотр';model=blank();render();}\n})();\n</script></body></html>";
