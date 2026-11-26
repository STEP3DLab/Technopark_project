/** За пределами зрения — private Google Sheets / Drive backend.
 * Bind this project to the supplied spreadsheet. Run setup() once, then deploy
 * as a Web app: execute as the owner; access Anyone. Never publish the Sheet.
 */
const APP = Object.freeze({
  spreadsheetId: '1C0Bc63nyd-0qp2GniTJ_KxxZAOyBrd3cLBVRLXjnh28',
  studyId: 'tactile-rgsu-2026-v1', version: '1.4.0', timezone: 'Europe/Moscow',
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
  runs:['ID прохождения','Участник','ID теста','Версия','Название','Начато','Обновлено','Статус','Подтверждение','Отозвано','Снимок вопросов JSON','Панели JSON'],
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
function onOpen(){SpreadsheetApp.getUi().createMenu('За пределами зрения').addItem('Подготовить сервис','setup').addItem('Создать код для выбранного теста','createTestAccess').addItem('Показать код выбранного участника','showTestAccess').addItem('Выдать доступ выбранной записи','issueSelectedBooking').addItem('Повторить неотправленные письма','retryPendingMail').addItem('Отменить выбранную запись','cancelSelectedBooking').addItem('Заменить доступ выбранной записи','resetSelectedAccess').addToUi();}
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
    const steps=makeSteps_(test,questions,a.panels);
    const values=[a.runId,a.pid,a.testId,a.version,text_(test[2],220),now_(),now_(),'in_progress','','',JSON.stringify(steps),JSON.stringify(a.panels)];
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
