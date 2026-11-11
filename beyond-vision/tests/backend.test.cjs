const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync(new URL('../backend/Code.gs','file://'+__filename),'utf8');
const signed=buffer=>Array.from(buffer,b=>b>127?b-256:b);
const buffer=bytes=>Buffer.from(bytes.map(b=>(b+256)%256));
function harness({capacity=1,mailFails=false}={}){
  const data={},mail=[],files=new Map(),properties=new Map([['APP_SECRET','unit-test-only-secret-not-a-production-credential'],['SPREADSHEET_ID','test-sheet'],['AUDIO_FOLDER_ID','test-folder']]),cache=new Map();
  let locked=false;
  const context={console,Date,Number,String,Object,JSON,Math,RegExp,Array,Error,Set,Map};
  const getSheet=name=>({
    getLastRow:()=>data[name].length,
    getRange:(row,col,height=1,width=1)=>({
      getValues:()=>Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>data[name][row-1+r]?.[col-1+c]??'')),
      setValues:values=>values.forEach((v,r)=>v.forEach((value,c)=>{data[name][row-1+r]??=[];data[name][row-1+r][col-1+c]=value})),
    }),
  });
  context.SpreadsheetApp={openById:()=>({getSheetByName:name=>data[name]?getSheet(name):null}),flush:()=>{}};
  context.LockService={getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},releaseLock:()=>{locked=false}})};
  context.PropertiesService={getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value)})};
  context.CacheService={getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value)})};
  context.Utilities={
    DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
    getUuid:()=>crypto.randomUUID(),
    computeDigest:(_,value)=>signed(crypto.createHash('sha256').update(String(value)).digest()),
    computeHmacSha256Signature:(value,key)=>signed(crypto.createHmac('sha256',key).update(value).digest()),
    base64EncodeWebSafe:bytes=>buffer(bytes).toString('base64url'),
    base64Decode:text=>signed(Buffer.from(text,'base64')),
    newBlob:(bytes,mime,name)=>({bytes,mime,name}),
    formatDate:(value,zone,format)=>{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value).map(p=>[p.type,p.value]));
      return format==='HH:mm'?`${parts.hour}:${parts.minute}`:`${parts.year}-${parts.month}-${parts.day}`;
    },
  };
  context.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})};
  context.MailApp={getRemainingDailyQuota:()=>100,sendEmail:message=>{if(mailFails)throw new Error('test mail failure');mail.push(message)}};
  context.DriveApp={getFolderById:()=>({createFile:blob=>{const id='file-'+crypto.randomUUID();const file={blob,trashed:false,getId:()=>id,getUrl:()=>`https://drive.google.com/file/d/${id}/view`,setTrashed:value=>{file.trashed=value}};files.set(id,file);return file}}),getFileById:id=>files.get(id)};
  vm.createContext(context);vm.runInContext(source,context);
  const schema=vm.runInContext('({names:APP.sheets,headers:HEADERS})',context);
  for(const kind of Object.keys(schema.names))data[schema.names[kind]]=[Array.from(schema.headers[kind])];
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  data['Окна'].push(['test-slot',day,'10:00','10:40',capacity,'Открыто','Москва, ул. Вильгельма Пика, 4, стр. 8','']);
  data['Настройки'].push(['Опрос открыт','да',''],['Запись открыта','да','']);
  const request=(action,p={})=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({action,studyId:'tactile-rgsu-2026-v1',...p})}}).text);
  const book=(extra={})=>request('book',{fullName:'Тестовый участник',email:'test@example.invalid',phone:'+79990000000',assistance:'',consent:true,slotId:'test-slot',requestId:crypto.randomUUID(),...extra});
  const login=credentials=>request('login',{login:credentials.login,password:credentials.password,deviceKey:crypto.randomUUID()});
  const save=(token,id,value,text='')=>request('save',{token,id,requestId:crypto.randomUUID(),answer:{value,text}});
  return {data,mail,files,properties,context,request,book,login,save,unlock:()=>{locked=false}};
}
test('registration creates access, private contact data and one email; passwords are not stored in cells',()=>{
  const h=harness(),result=h.book();assert.equal(result.ok,true);assert.equal(result.emailStatus,'sent');assert.equal(h.mail.length,1);
  assert.match(result.credentials.code,/^\d{12}$/);assert.ok(result.credentials.password.length>=16);
  const row=h.data['Доступ'][1];assert.equal(row[3].length,64);assert.equal(row[4].length,64);
  assert.ok(!JSON.stringify(h.data).includes(result.credentials.password));assert.ok(!JSON.stringify(h.data).includes(result.credentials.code));
  const publicData=h.request('slots');assert.ok(!JSON.stringify(publicData).includes('test@example.invalid'));assert.equal(publicData.slots[0].free,0);
  assert.match(h.mail[0].body,/Вильгельма Пика/);
});
test('last place cannot be booked twice, and replaying a request neither duplicates the record nor resends email',()=>{
  const h=harness(),requestId=crypto.randomUUID();const first=h.book({requestId});const repeat=h.book({requestId});
  assert.equal(first.bookingId,repeat.bookingId);assert.equal(h.mail.length,1);assert.equal(h.data['Записи'].length,2);
  const second=h.book({email:'second@example.invalid'});assert.equal(second.code,'SLOT_FULL');assert.equal(h.data['Доступ'].length,2);
});
test('mail failure retains the reservation and credentials, with visible failed status',()=>{
  const h=harness({mailFails:true});const result=h.book();assert.equal(result.ok,true);assert.equal(result.emailStatus,'failed');
  assert.equal(h.data['Записи'][1][8],'confirmed');assert.equal(h.data['Записи'][1][10],'failed');assert.match(h.data['Записи'][1][12],/failure/);
  assert.equal(h.login(result.credentials).ok,true);
});
test('invalid credentials fail, code entry works, a forged token is rejected and answers stay scoped to the participant',()=>{
  const h=harness({capacity:2}),a=h.book(),b=h.book({email:'second@example.invalid'});
  assert.equal(h.login({...a.credentials,password:'wrong'}).code,'AUTH');
  const first=h.request('login',{code:a.credentials.code,deviceKey:crypto.randomUUID()});assert.equal(first.ok,true);
  assert.equal(h.request('resume',{token:first.token+'x'}).code,'AUTH');
  h.save(first.token,'consent',{adult:true,data:true,audio:false});
  const second=h.login(b.credentials);assert.equal(Object.keys(second.session.answers).length,0);
  const own=h.request('resume',{token:first.token});assert.equal(own.session.answers.consent.value.data,true);
});
test('server enforces consent, order, ratings and required descriptions; retries are idempotent',()=>{
  const h=harness(),token=h.login(h.book().credentials).token;
  assert.equal(h.save(token,'consent',{adult:false,data:true,audio:false}).code,'CONSENT');
  assert.equal(h.save(token,'t1.description',null,'test').code,'ORDER');
  assert.equal(h.save(token,'consent',{adult:true,data:true,audio:false}).ok,true);
  h.save(token,'experience','never');h.save(token,'training',true);h.save(token,'t1.explore',{seconds:100});
  assert.equal(h.save(token,'t1.description',null,'').code,'VALIDATION');
  const requestId=crypto.randomUUID(),payload={token,id:'t1.description',requestId,answer:{text:'=IMPORTXML("bad")'}};
  assert.equal(h.request('save',payload).ok,true);assert.equal(h.request('save',payload).answer.revision,1);
  assert.ok(h.data['Ответы'].find(r=>r[2]==='t1.description')[5].startsWith("'="));
  assert.equal(h.save(token,'t1.clarity','6').code,'VALIDATION');
  assert.equal(h.request('finish',{token}).code,'INCOMPLETE');
});
test('audio requires separate consent, accepts a bounded audio signature and is removed on withdrawal',()=>{
  const h=harness(),token=h.login(h.book().credentials).token;
  h.save(token,'consent',{adult:true,data:true,audio:false});h.save(token,'experience','never');h.save(token,'training',true);h.save(token,'t1.explore',{seconds:90});
  const audio={mime:'audio/webm',base64:Buffer.from([26,69,223,163,0,0,0,0,0,0,0,0,1,2,3]).toString('base64')};
  const payload={token,id:'t1.description',requestId:crypto.randomUUID(),answer:{text:'',audio}};
  assert.equal(h.request('save',payload).code,'AUDIO_CONSENT');
  h.save(token,'consent',{adult:true,data:true,audio:true});
  assert.equal(h.request('save',payload).ok,true);assert.equal(h.files.size,1);
  assert.equal(h.request('withdraw',{token}).ok,true);assert.equal([...h.files.values()][0].trashed,true);
  assert.equal(h.request('resume',{token}).code,'DISABLED');assert.equal(h.data['Сессии'][1][3],'withdrawn');
});
test('complete survey produces a receipt and becomes read-only',()=>{
  const h=harness(),token=h.login(h.book().credentials).token;
  h.save(token,'consent',{adult:true,data:true,audio:false});h.save(token,'experience','never');h.save(token,'training',true);
  for(let i=1;i<=3;i++){h.save(token,`t${i}.explore`,{seconds:90});h.save(token,`t${i}.description`,null,'Не удалось определить.');h.save(token,`t${i}.clarity`,'2');h.save(token,`t${i}.confidence`,'1');h.save(token,`t${i}.feedback`,null,'');}
  h.save(token,'preferred','same');h.save(token,'familiarity',null,'');h.save(token,'comments',null,'');
  const finish=h.request('finish',{token});assert.equal(finish.ok,true);assert.match(finish.receipt,/^BV-/);
  assert.equal(h.request('finish',{token}).receipt,finish.receipt);assert.equal(h.save(token,'comments',null,'change').code,'COMPLETED');
});
test('panel assignments are balanced over 18 registrations',()=>{
  const h=harness(),pairs={},positions=[{},{},{}];
  for(let i=1;i<=18;i++){const s=Array.from(h.context.schedule_(i));assert.equal(new Set(s.map(p=>p[0])).size,3);assert.equal(new Set(s.map(p=>p.split('-')[1])).size,3);s.forEach((p,index)=>{pairs[p]=(pairs[p]||0)+1;positions[index][p[0]]=(positions[index][p[0]]||0)+1})}
  assert.equal(Object.keys(pairs).length,9);assert.ok(Object.values(pairs).every(n=>n===6));assert.ok(positions.every(p=>Object.values(p).every(n=>n===6)));
});
test('closed and past slots are rejected, and the rate limiter does not reveal personal data',()=>{
  const h=harness();h.data['Окна'][1][5]='Закрыто';assert.equal(h.book().code,'SLOT_FULL');
  h.data['Окна'][1][5]='Открыто';h.data['Окна'][1][1]='2020-01-01';assert.equal(h.book().code,'SLOT_FULL');
  for(let i=0;i<12;i++)h.request('login',{code:'000000000000',deviceKey:'same-device'});
  assert.equal(h.request('login',{code:'000000000000',deviceKey:'same-device'}).code,'RATE_LIMIT');
});
