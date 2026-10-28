import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createCatalog, matchText, validateMotion } from '../app/catalog.js';
import { makeSequence, classify, sequenceQuality } from '../app/recognizer.js';
const root=new URL('../app/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('assets/sources/slovo-sources.json',root)));
const motionByUrl=new Map(manifest.samples.map(x=>{const path=`./assets/motion/${x.file.replace('.mp4','.json')}`;return[path,JSON.parse(readFileSync(new URL(path,root)))];}));
const source=readFileSync(new URL('platform.js',root),'utf8').replace(/^import .*;\n/gm,'');
async function harness(){
  const elements=new Map(),timers=new Map();let now=0,timerId=0,heldVision=null,cameraDeferred=null,stopped=0;
  class El{
    constructor(id=''){this.id=id;this.value=id==='speed'?'1':'';this.hidden=false;this.disabled=false;this.children=[];this.attrs={};this.listeners={};this.dataset={};this.videoWidth=640;this.videoHeight=480;this.readyState=4;this.duration=1.6;this.currentTime=0;this.textContent='';this.classList={add(){},remove(){},toggle(){}};}
    addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);}
    removeEventListener(type,cb){this.listeners[type]=(this.listeners[type]||[]).filter(x=>x!==cb);}
    emit(type){for(const cb of this.listeners[type]||[])cb({preventDefault(){}});}
    append(...els){this.children.push(...els);}replaceChildren(...els){this.children=[...els];}
    setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}removeAttribute(k){delete this.attrs[k];}
    getContext(){return{clearRect(){}};}pause(){}load(){}play(){return Promise.resolve();}focus(){}scrollIntoView(){}showModal(){}close(){}click(){this.onclick?.();}
  }
  const get=id=>{if(!elements.has(id))elements.set(id,new El(id));return elements.get(id);};
  get('facing').value='user';get('message').value='Вопрос';
  const nav=['text','camera','video','about'].map(mode=>{const el=new El();el.dataset.mode=mode;return el;});
  const document={hidden:false,activeElement:null,getElementById:get,createElement:()=>new El(),querySelectorAll:()=>nav,querySelector:()=>new El(),addEventListener(){}};
  class Avatar{load(){}clear(){}resize(){}showAt(){}setScene(){}setAppearance(){}}
  const stream={getTracks:()=>[{stop(){stopped++;}}]};
  const context=vm.createContext({document,CanvasAvatar:Avatar,createCatalog,matchText,validateMotion,makeSequence,classify,sequenceQuality,drawLandmarks(){},
    window:{addEventListener(){},speechSynthesis:{cancel(){}}},navigator:{mediaDevices:{getUserMedia:()=>cameraDeferred?cameraDeferred.promise:Promise.resolve(stream)}},
    location:{hash:'#text',search:''},history:{replaceState(){}},URL,URLSearchParams,performance:{now:()=>now},
    matchMedia:()=>({matches:false}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    setTimeout:cb=>{timers.set(++timerId,cb);return timerId;},clearTimeout:id=>timers.delete(id),
    loadVision:()=>heldVision?.promise||Promise.resolve(),resetVision:async()=>{},detect:()=>new Promise(()=>{}),
    fetch:async url=>({ok:true,json:async()=>url.includes('slovo-sources')?manifest:motionByUrl.get(url)}),console,
  });
  const api=await vm.runInContext(`(async()=>{${source}\nreturn {s,selectWord,setMode,startCamera,stopCapture,recordGesture};})()`,context);
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
  return{api,get,timers,advance(ms){now+=ms;const callbacks=[...timers.values()];timers.clear();for(const cb of callbacks)cb();},stopped:()=>stopped,holdVision(){heldVision=deferred();return heldVision;},holdCamera(){cameraDeferred=deferred();return{...cameraDeferred,stream};}};
}
test('scrub uses requested position rather than the position restored by pause',async()=>{
  const h=await harness();h.get('timeline').value='500';h.get('timeline').emit('input');
  assert.equal(h.api.s.time,h.api.s.data.duration/2);
});
test('unsupported text clears old gesture and disables playback',async()=>{
  const h=await harness();h.get('message').value='не работать';h.get('text-form').emit('submit');
  assert.equal(h.api.s.data,null);assert.equal(h.get('play').disabled,true);assert.match(h.get('text-notice').textContent,/Отрицания/);
});
test('camera permission resolving after navigation stops tracks',async()=>{
  const h=await harness(),gate=h.holdCamera();h.api.setMode('camera');const pending=h.api.startCamera();
  h.api.setMode('text');gate.resolve(gate.stream);await pending;
  assert.equal(h.stopped(),1);assert.equal(h.api.s.stream,null);assert.equal(h.api.s.capturing,false);
});
test('navigation during model loading stops camera and ignores late completion',async()=>{
  const h=await harness(),gate=h.holdVision();h.api.setMode('camera');const pending=h.api.startCamera();
  await new Promise(r=>setImmediate(r));assert.ok(h.api.s.stream);h.api.setMode('text');gate.resolve();await pending;
  assert.equal(h.stopped(),1);assert.equal(h.api.s.capturing,false);assert.equal(h.get('record').disabled,true);
});
test('navigation cancels partial gesture without producing result',async()=>{
  const h=await harness();h.api.setMode('camera');h.api.s.capturing=true;h.api.s.stream={getTracks:()=>[]};
  h.api.recordGesture();assert.ok(h.api.s.recordFrames);h.api.setMode('video');
  assert.equal(h.api.s.recordFrames,null);assert.equal(h.api.s.result,null);assert.equal(h.get('record-indicator').hidden,true);
});

test('a personal sample for an existing word joins its class instead of becoming an ambiguous label',async()=>{
  const h=await harness();h.api.setMode('camera');h.api.s.capturing=true;h.api.s.stream={getTracks:()=>[]};
  h.get('custom-label').value='Вопрос';h.api.recordGesture(true);
  h.api.s.recordFrames=motionByUrl.get('./assets/motion/cc59e1b2-5778-47bb-a452-779033da61b0.json').frames;
  h.advance(3100);assert.equal(h.api.s.custom.length,1);assert.equal(h.api.s.custom[0].id,'question');
});
