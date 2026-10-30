'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const S=require('../dist/continuity-storage.js');
const KEY='participant-work';
const OLD='{"sessionId":"V-OLD001","drafts":{"robotics":{"commands":["U","R"]}}}';
const NEXT='{"sessionId":"V-NEW001","answers":{"i1":4}}';

function storage(initial={},hooks={}){
 const values=new Map(Object.entries(initial)),calls=[];
 const api={
  getItem(key){calls.push(['get',key]);if(hooks.get)hooks.get(key,values);return values.has(key)?values.get(key):null;},
  setItem(key,raw){calls.push(['set',key]);if(hooks.set&&hooks.set(key,raw,values)===false)return;values.set(key,raw);},
  removeItem(key){calls.push(['remove',key]);if(hooks.remove&&hooks.remove(key,values)===false)return;values.delete(key);}
 };
 return {api,values,calls};
}

test('Replacing work preserves the exact previous raw before writing the new session',()=>{
 const m=storage({[KEY]:OLD,[KEY+'-previous']:'older',[KEY+'-recovery']:'damaged original',unrelated:'keep'});
 assert.deepEqual(S.replace(m.api,KEY,NEXT),{ok:true,backupWritten:true});
 assert.equal(m.values.get(KEY),NEXT);
 assert.equal(m.values.get(KEY+'-previous'),OLD);
 assert.equal(m.values.get(KEY+'-recovery'),'damaged original');
 assert.equal(m.values.get('unrelated'),'keep');
 assert.deepEqual(m.calls.filter(c=>c[0]==='set'),[['set',KEY+'-previous'],['set',KEY]]);
});

test('No current session, including the old null marker, does not overwrite a previous backup',()=>{
 for(const raw of [undefined,'null']){
  const initial={[KEY+'-previous']:OLD};if(raw!==undefined)initial[KEY]=raw;
  const m=storage(initial);
  assert.deepEqual(S.replace(m.api,KEY,NEXT),{ok:true,backupWritten:false});
  assert.equal(m.values.get(KEY),NEXT);assert.equal(m.values.get(KEY+'-previous'),OLD);
 }
});

test('A failed backup write aborts replacement and keeps the current session',()=>{
 const m=storage({[KEY]:OLD,[KEY+'-previous']:'older'},{set(key){if(key===KEY+'-previous')throw new Error('quota');}});
 const result=S.replace(m.api,KEY,NEXT);
 assert.equal(result.ok,false);assert.equal(result.backupWritten,false);assert.equal(result.error,'backup-write-failed');
 assert.equal(m.values.get(KEY),OLD);assert.equal(m.values.get(KEY+'-previous'),'older');
 assert.equal(m.calls.some(c=>c[0]==='set'&&c[1]===KEY),false);
});

test('An unconfirmed backup write does not permit replacing the only usable session',()=>{
 const m=storage({[KEY]:OLD},{set(key){if(key===KEY+'-previous')return false;}});
 assert.equal(S.replace(m.api,KEY,NEXT).ok,false);
 assert.equal(m.values.get(KEY),OLD);
 assert.equal(m.calls.some(c=>c[0]==='set'&&c[1]===KEY),false);
});

test('A failed primary write reports failure while preserving both old work and its backup',()=>{
 const m=storage({[KEY]:OLD},{set(key){if(key===KEY)throw new Error('quota');}});
 const result=S.replace(m.api,KEY,NEXT);
 assert.deepEqual(result,{ok:false,backupWritten:true,error:'primary-write-failed',partial:false});
 assert.equal(m.values.get(KEY),OLD);assert.equal(m.values.get(KEY+'-previous'),OLD);
});

test('Replacement restores the old raw if a storage adapter mutates and then throws',()=>{
 const m=storage({[KEY]:OLD},{set(key,raw,values){if(key===KEY&&raw===NEXT){values.set(key,raw);throw new Error('late failure');}}});
 const result=S.replace(m.api,KEY,NEXT);
 assert.equal(result.ok,false);assert.equal(result.partial,false);
 assert.equal(m.values.get(KEY),OLD);assert.equal(m.values.get(KEY+'-previous'),OLD);
});

test('Replacement reports partial recovery if restoring the current raw also fails',()=>{
 const m=storage({[KEY]:OLD},{set(key,raw,values){if(key===KEY){if(raw===NEXT)values.set(key,raw);throw new Error('write blocked');}}});
 const result=S.replace(m.api,KEY,NEXT);
 assert.equal(result.ok,false);assert.equal(result.partial,true);
 assert.equal(m.values.get(KEY+'-previous'),OLD,'the exact old work remains available in the backup');
});

test('Unavailable reads prevent replacement before any mutation',()=>{
 const m=storage({[KEY]:OLD},{get(){throw new Error('storage disabled');}});
 assert.deepEqual(S.replace(m.api,KEY,NEXT),{ok:false,backupWritten:false,error:'read-failed',partial:false});
 assert.equal(m.calls.some(c=>c[0]!=='get'),false);assert.equal(m.values.get(KEY),OLD);
});

test('Clear removes all three application saves, verifies absence, and leaves unrelated storage intact',()=>{
 const m=storage({[KEY]:OLD,[KEY+'-recovery']:'damaged',[KEY+'-previous']:'previous',unrelated:'keep'});
 assert.deepEqual(S.clear(m.api,KEY),{ok:true,partial:false});
 assert.deepEqual([...m.values],[['unrelated','keep']]);
 assert.deepEqual(m.calls.slice(0,3),[['get',KEY],['get',KEY+'-recovery'],['get',KEY+'-previous']]);
 assert.deepEqual(m.calls.filter(c=>c[0]==='remove'),[['remove',KEY],['remove',KEY+'-recovery'],['remove',KEY+'-previous']]);
});

test('Clear reads every save before mutating and aborts on an unreadable later backup',()=>{
 const initial={[KEY]:OLD,[KEY+'-recovery']:'damaged',[KEY+'-previous']:'previous'};
 const m=storage(initial,{get(key){if(key===KEY+'-previous')throw new Error('read denied');}});
 assert.deepEqual(S.clear(m.api,KEY),{ok:false,error:'read-failed',partial:false});
 assert.equal(m.calls.some(c=>c[0]!=='get'),false);assert.deepEqual(Object.fromEntries(m.values),initial);
});

test('A failed removal never claims success and restores saves already removed',()=>{
 const initial={[KEY]:OLD,[KEY+'-recovery']:'damaged',[KEY+'-previous']:'previous',unrelated:'keep'};
 const m=storage(initial,{remove(key){if(key===KEY+'-recovery')throw new Error('remove denied');}});
 assert.deepEqual(S.clear(m.api,KEY),{ok:false,error:'clear-failed',partial:false});
 assert.deepEqual(Object.fromEntries(m.values),initial);
});

test('Clear restores the snapshot even when a removal mutates before throwing',()=>{
 const initial={[KEY]:OLD,[KEY+'-recovery']:'damaged',[KEY+'-previous']:'previous'};
 const m=storage(initial,{remove(key,values){if(key===KEY+'-recovery'){values.delete(key);throw new Error('late failure');}}});
 const result=S.clear(m.api,KEY);
 assert.equal(result.ok,false);assert.equal(result.partial,false);
 assert.deepEqual(Object.fromEntries(m.values),initial);
});

test('Clear reports partial deletion when best-effort rollback cannot restore every save',()=>{
 const m=storage({[KEY]:OLD,[KEY+'-recovery']:'damaged',[KEY+'-previous']:'previous',unrelated:'keep'},{
  remove(key){if(key===KEY+'-recovery')throw new Error('remove denied');},
  set(key){if(key===KEY)throw new Error('restore denied');}
 });
 assert.deepEqual(S.clear(m.api,KEY),{ok:false,error:'clear-failed',partial:true});
 assert.equal(m.values.has(KEY),false);assert.equal(m.values.get(KEY+'-recovery'),'damaged');
 assert.equal(m.values.get(KEY+'-previous'),'previous');assert.equal(m.values.get('unrelated'),'keep');
});

test('Clear verifies removal and rolls back if a storage adapter silently retains a backup',()=>{
 const initial={[KEY]:OLD,[KEY+'-recovery']:'damaged',[KEY+'-previous']:'previous'};
 const m=storage(initial,{remove(key){if(key===KEY+'-previous')return false;}});
 assert.deepEqual(S.clear(m.api,KEY),{ok:false,error:'clear-verify-failed',partial:false});
 assert.deepEqual(Object.fromEntries(m.values),initial);
});

test('Browser import exposes the module without accessing global localStorage',()=>{
 const context={window:{}};
 Object.defineProperty(context.window,'localStorage',{get(){throw new Error('must not touch storage on load');}});
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/continuity-storage.js'),'utf8'),context);
 assert.equal(typeof context.window.ContinuityStorage.replace,'function');
 assert.equal(typeof context.window.ContinuityStorage.clear,'function');
});
