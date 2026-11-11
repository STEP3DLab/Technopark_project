const DB_NAME='beyond-vision-v1';
let database;
function db(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  return database;
}
async function operation(mode,fn){
  const database=await db();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('drafts',mode);
    const request=fn(tx.objectStore('drafts'));
    tx.oncomplete=()=>resolve(request?.result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
export const drafts={
  get:key=>operation('readonly',s=>s.get(key)),
  put:(key,value)=>operation('readwrite',s=>s.put(value,key)),
  delete:key=>operation('readwrite',s=>s.delete(key)),
  clear:()=>operation('readwrite',s=>s.clear()),
};
export function readSettings(){try{return JSON.parse(localStorage.getItem('vision-settings')||'{}')}catch{return {}}}
export function writeSettings(value){try{localStorage.setItem('vision-settings',JSON.stringify(value))}catch{}}
