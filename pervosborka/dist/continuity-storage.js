(function(root){
'use strict';

// Storage is injected: importing this module never opens browser storage.
// Error codes deliberately contain no participant answers or saved raw text.
function validKey(key){return typeof key==='string'&&key.length>0;}

function matches(storage,snapshot){
 try{return snapshot.every(([key,raw])=>storage.getItem(key)===raw);}
 catch(error){return false;}
}

function restoreSnapshot(storage,snapshot){
 for(const [key,raw] of snapshot){
  // Avoid rewriting values that survived a failed operation intact.
  let unchanged=false;
  try{unchanged=storage.getItem(key)===raw;}catch(error){}
  if(unchanged)continue;
  try{if(raw===null)storage.removeItem(key);else storage.setItem(key,raw);}
  catch(error){} // Other keys may still be recoverable.
 }
 return matches(storage,snapshot);
}

function replace(storage,key,nextRaw){
 let previousRaw,backupWritten=false;
 if(!validKey(key)||typeof nextRaw!=='string')return {ok:false,backupWritten,error:'invalid-input',partial:false};
 try{previousRaw=storage.getItem(key);}
 catch(error){return {ok:false,backupWritten,error:'read-failed',partial:false};}

 if(previousRaw!==null&&previousRaw!=='null'){
  try{
   storage.setItem(key+'-previous',previousRaw);
   if(storage.getItem(key+'-previous')!==previousRaw)throw new Error('verification');
   backupWritten=true;
  }catch(error){return {ok:false,backupWritten,error:'backup-write-failed',partial:false};}
 }

 try{
  storage.setItem(key,nextRaw);
  if(storage.getItem(key)!==nextRaw)throw new Error('verification');
  return {ok:true,backupWritten};
 }catch(error){
  const restored=restoreSnapshot(storage,[[key,previousRaw]]);
  return {ok:false,backupWritten,error:'primary-write-failed',partial:!restored};
 }
}

function clear(storage,key){
 if(!validKey(key))return {ok:false,error:'invalid-input',partial:false};
 const keys=[key,key+'-recovery',key+'-previous'];
 let snapshot;
 // Complete the read before any mutation; otherwise a later unreadable key
 // could leave the participant with a partially deleted, unrecoverable save.
 try{snapshot=keys.map(name=>[name,storage.getItem(name)]);}
 catch(error){return {ok:false,error:'read-failed',partial:false};}

 let failure='clear-failed';
 try{
  for(const name of keys)storage.removeItem(name);
  failure='clear-verify-failed';
  if(!keys.every(name=>storage.getItem(name)===null))throw new Error('verification');
  return {ok:true,partial:false};
 }catch(error){
  const restored=restoreSnapshot(storage,snapshot);
  return {ok:false,error:failure,partial:!restored};
 }
}

const api={replace,clear};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.ContinuityStorage=api;
})(typeof window!=='undefined'?window:globalThis);
