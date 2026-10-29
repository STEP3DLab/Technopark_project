import { createPracticalController } from '../app/practical.js';
import { parseProfile, serializeProfile, mergeProfiles, PROFILE_MAX_BYTES } from '../app/personal-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createCatalog, matchText, validateMotion } from '../app/catalog.js';
import { makeSequence, classify, sequenceQuality } from '../app/recognizer.js';
import { SessionLedger, frameReadiness, DEMO_SOURCES } from '../app/session.js';
import { TrialProtocol } from '../app/trial-protocol.js';
import { createCommunicationController, MAX_MESSAGE_LENGTH } from '../app/communication.js';
const root=new URL('../app/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('assets/sources/slovo-sources.json',root)));
const motionByUrl=new Map(manifest.samples.map(x=>{const path=`./assets/motion/${x.file.replace('.mp4','.json')}`;return[path,JSON.parse(readFileSync(new URL(path,root)))];}));
const library=JSON.parse(readFileSync(new URL('assets/recognition-library.json',root)));
const benchmark=JSON.parse(readFileSync(new URL('assets/evaluation-v07.json',root)));
const source=readFileSync(new URL('platform.js',root),'utf8').replace(/^import .*;\n/gm,'');
const showcaseSource=readFileSync(new URL('showcase.js',root),'utf8').replace(/^import .*;\n/gm,'');
const communicationSource=['communication.js','practical.js'].map(file=>readFileSync(new URL(file,root),'utf8')).join('\n');
test('the actual HTML provides every literal controller ID exactly once and keeps the focus label inside its button',()=>{
  const html=readFileSync(new URL('index.html',root),'utf8');
  const htmlIds=[...html.matchAll(/\bid\s*=\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
  // Derive dependencies from production code, not the permissive fake DOM below.
  // In particular, putText('avatar-focus-label', ...) must resolve in real HTML.
  const requiredIds=new Set([...(source+'\n'+showcaseSource+'\n'+communicationSource).matchAll(/(?:\$\(|putText\(|putAttribute\()\s*'([^']+)'/g)].map(match=>match[1]));
  for(const id of requiredIds)assert.equal(htmlIds.filter(actual=>actual===id).length,1,`Controller requires exactly one #${id} in app/index.html`);
  const focusButton=html.match(/<button\b[^>]*\bid=['"]avatar-focus['"][^>]*>([\s\S]*?)<\/button>/)?.[1];
  assert.match(focusButton||'',/<span\b[^>]*\bid=['"]avatar-focus-label['"]/,'The focus label must remain inside the live focus button');
  assert.match(html,/<dialog\b[^>]*\bid=['"]avatar-focus-dialog['"]/,'Large view must use a native dialog');
});

async function harness({fetchResponse,beforeReady,showcase=false,initialHash='#text',cameraError=null}={}){
  const elements=new Map(),timers=new Map(),rafs=new Map(),documentListeners=new Map(),windowListeners=new Map();let now=0,timerId=0,rafId=0,heldVision=null,cameraDeferred=null,stopped=0;
  const html=readFileSync(new URL('index.html',root),'utf8');
  const tags=new Map([...html.matchAll(/<([a-z]+)\b[^>]*\bid=['"]([^'"]+)['"]/gi)].map(match=>[match[2],match[1]]));
  const addListener=(map,type,cb,capture=false)=>{if(!map.has(type))map.set(type,[]);map.get(type).push({cb,capture});};
  class El{
    constructor(id='',tag=tags.get(id)||'div'){
      this.id=id;this.tagName=tag.toLowerCase();this.value=id==='speed'?'1':'';this.hidden=false;this.disabled=false;this.children=[];this.parentNode=null;this.style={};
      this.attrs={};this.listeners={};this.dataset={};this.videoWidth=640;this.videoHeight=480;this.readyState=4;this.duration=1.6;this.currentTime=0;this.textContent='';this.open=false;this.htmlWrites=0;
      const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x);}};
    }
    set innerHTML(value){this.html=String(value);this.htmlWrites++;}get innerHTML(){return this.html||'';}
    set value(value){this._value=String(value??'');this.selectionStart=this.selectionEnd=this._value.length;}get value(){return this._value;}
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}select(){this.setSelectionRange(0,this.value.length);}
    get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
    addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);}
    removeEventListener(type,cb){this.listeners[type]=(this.listeners[type]||[]).filter(x=>x!==cb);}
    emit(type,detail={}){const event={target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...detail};
      for(const {cb,capture} of documentListeners.get(type)||[])if(capture)cb(event);
      const result=this[`on${type}`]?.(event);for(const cb of this.listeners[type]||[])cb(event);
      for(const {cb,capture} of documentListeners.get(type)||[])if(!capture)cb(event);
      if(type==='cancel'&&!event.defaultPrevented)this.close();return result;
    }
    matches(selector){if(selector==='[data-mode]')return this.dataset.mode!==undefined;if(selector==='[contenteditable=true]')return this.attrs.contenteditable==='true';if(selector==='#word-chips button')return this.tagName==='button'&&Boolean(this.parentNode?.closest('#word-chips'));return selector.startsWith('#')?this.id===selector.slice(1):this.tagName===selector;}
    closest(selectors){for(let node=this;node;node=node.parentNode)if(selectors.split(',').some(selector=>node.matches(selector.trim())))return node;return null;}
    querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
    remove(){if(this.parentNode){const i=this.parentNode.children.indexOf(this);if(i>=0)this.parentNode.children.splice(i,1);}this.parentNode=null;}
    append(...els){for(const el of els){el.remove();el.parentNode=this;this.children.push(el);}}
    insertBefore(el,next){el.remove();const i=next?this.children.indexOf(next):this.children.length;if(i<0)throw new Error('Reference node is not a child');el.parentNode=this;this.children.splice(i,0,el);}
    replaceChildren(...els){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...els);}
    setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
    getContext(){return{clearRect(){}};}pause(){}load(){}play(){return Promise.resolve();}
    focus(){document.activeElement=this;}scrollIntoView(){}showModal(){this.open=true;}close(){if(this.open){this.open=false;this.emit('close');}}click(){return this.emit('click');}
  }
  const get=id=>{if(!elements.has(id))elements.set(id,new El(id));return elements.get(id);};
  get('facing').value='user';get('message').value='Вопрос';
  get('display-font').value='48';get('communication-home').append(get('message-composer'));get('message-composer').append(get('conversation'));
  get('text-workspace').append(get('composer'),get('avatar-card'),get('after-avatar'));
  get('avatar-card').append(get('avatar-focus'),get('play'),get('source-video'),get('word-chips'),get('avatar-footer'));
  get('avatar-focus').append(get('avatar-focus-label'));
  get('composer').append(get('showcase-controls'),get('composer-details'));
  get('showcase-controls').append(get('showcase-start'),get('showcase-status'));
  get('showcase-start').append(new El('','span'));
  const nav=['dialogue','text','camera','video','research','about'].map(mode=>{const el=new El();el.dataset.mode=mode;return el;});
  const phrases=[...html.matchAll(/data-compose-phrase="([^"]+)"/g)].map(match=>{const el=new El('','button');el.dataset.composePhrase=match[1];return el;});
  const document={hidden:false,activeElement:null,getElementById:get,createElement:tag=>new El('',tag),querySelectorAll:selector=>selector==='[data-mode]'?nav:selector==='[data-compose-phrase]'?phrases:[],querySelector:selector=>selector==='.avatar-card'?get('avatar-card'):selector==='dialog[open]'?[...elements.values()].find(el=>el.tagName==='dialog'&&el.open)||null:new El(),addEventListener:(type,cb,capture)=>addListener(documentListeners,type,cb,capture),emit(type,detail={}){for(const {cb} of documentListeners.get(type)||[])cb({target:get('document'),...detail});}};
  const avatars=new Map();
  class Avatar{
    constructor(container){avatars.set(container.id,this);this.smoothing=true;}
    load(){}clear(){}resize(){}showAt(){}setScene(){}setAppearance(){}
    setSmoothing(enabled){this.smoothing=enabled;}
  }
  const track=new EventTarget();track.stop=()=>{stopped++;};
  const stream={getTracks:()=>[track]};
  const defaultFetch=async url=>({ok:true,json:async()=>url.includes('slovo-sources')?manifest:url.includes('recognition-library')?library:url.includes('evaluation-v07')?benchmark:motionByUrl.get(url)});
  const spoken=[],speechSynthesis={cancel(){},getVoices:()=>[],speak:utterance=>spoken.push(utterance.text)};
  const navigator={mediaDevices:{getUserMedia:()=>cameraError?Promise.reject(cameraError):cameraDeferred?cameraDeferred.promise:Promise.resolve(stream)}};
  const context=vm.createContext({document,CanvasAvatar:Avatar,TrialProtocol,SessionLedger,frameReadiness,DEMO_SOURCES,createCatalog,matchText,validateMotion,makeSequence,classify,sequenceQuality,createCommunicationController,MAX_MESSAGE_LENGTH,createPracticalController,parseProfile,serializeProfile,mergeProfiles,PROFILE_MAX_BYTES,drawLandmarks(){},
    window:{addEventListener:(type,cb)=>addListener(windowListeners,type,cb),speechSynthesis,URL,Blob,emit(type){for(const {cb} of windowListeners.get(type)||[])cb();}},navigator,speechSynthesis,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
    location:{hash:initialHash,search:''},history:{replaceState(){}},URL,URLSearchParams,AbortController,performance:{now:()=>now},
    matchMedia:()=>({matches:false}),requestAnimationFrame:cb=>{rafs.set(++rafId,cb);return rafId;},cancelAnimationFrame:id=>rafs.delete(id),
    setTimeout:(cb,ms=0)=>{timers.set(++timerId,{cb,at:now+ms});return timerId;},clearTimeout:id=>timers.delete(id),
    MutationObserver:class{observe(){}},readDemoCacheStatus:async()=>({offlineReady:false}),prepareDemoAssets:async()=>({offlineReady:false}),
    loadVision:()=>heldVision?.promise||Promise.resolve(),resetVision:async()=>{},detect:()=>new Promise(()=>{}),
    fetch:(url,options)=>fetchResponse?fetchResponse(url,options,defaultFetch):defaultFetch(url),console,
  });
  const ready=vm.runInContext(`(async()=>{${source}\nreturn {s,ledger,communication,practical,showResult,clearResult,confirmResult,selectWord,setMode,startCamera,stopCapture,recordGesture,ensureTemplates,protocolRuns,playAvatar,pauseAvatar,setCompare,setVisualMode};})()`,context);
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
  const controls={get,document,timers,avatars,nav,phrases,navigator,spoken,window:context.window,endCamera:()=>track.dispatchEvent(new Event('ended')),frame(ms){now+=ms;const callbacks=[...rafs.values()];rafs.clear();for(const cb of callbacks)cb(now);},advance(ms){now+=ms;const due=[...timers].filter(([,timer])=>timer.at<=now);for(const [id,timer] of due){timers.delete(id);timer.cb();}},stopped:()=>stopped,holdVision(){heldVision=deferred();return heldVision;},holdCamera(){cameraDeferred=deferred();return{...cameraDeferred,stream};}};
  await beforeReady?.(controls);
  const api=await ready;
  if(showcase)vm.runInContext(`(()=>{${showcaseSource}\n})()`,context);
  return{...controls,api};
}

test('smoothing toggles both avatars without restarting playback, changing the word or seeking source video',async()=>{
  const h=await harness(),button=h.get('motion-smoothing');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  h.api.setCompare(true);await h.api.playAvatar();h.get('source-video').currentTime=.4;h.frame(16);
  const time=h.api.s.time,selected=h.api.s.selected,data=h.api.s.data,playToken=h.api.s.playbackToken;
  button.click();
  assert.equal(button.getAttribute('aria-pressed'),'false');
  for(const id of ['platform-avatar','dialogue-avatar'])assert.equal(h.avatars.get(id).smoothing,false);
  assert.equal(h.api.s.time,time);assert.equal(h.api.s.playing,true);assert.equal(h.api.s.playbackToken,playToken);
  assert.equal(h.get('source-video').currentTime,.4);assert.equal(h.api.s.selected,selected);assert.equal(h.api.s.data,data);
  h.get('source-video').currentTime=.7;h.frame(16);assert.equal(h.api.s.time,.7);
  button.click();
  for(const id of ['platform-avatar','dialogue-avatar'])assert.equal(h.avatars.get(id).smoothing,true);
  assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(h.api.s.playing,true);assert.equal(h.api.s.time,.7);
});

test('a stalled initial motion body times out, leaves controls usable and cannot replace a later successful retry',async()=>{
  let stalled=false,signal,releaseBody,stalledMotion;
  const h=await harness({
    fetchResponse(url,options,fallback){
      if(!stalled&&url.includes('/motion/')){
        stalled=true;signal=options.signal;stalledMotion=motionByUrl.get(url);
        return Promise.resolve({ok:true,json:()=>new Promise(resolve=>{releaseBody=resolve;})});
      }
      return fallback(url);
    },
    async beforeReady(controls){
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(signal.aborted,false);assert.equal(controls.get('active-word').textContent,'Загрузка…');
      controls.advance(15001);
    },
  });
  assert.equal(signal.aborted,true);assert.equal(h.api.s.data,null);assert.equal(h.get('play').disabled,true);
  assert.equal(h.window.hearingEquality.state().ready,false);
  await h.api.selectWord('hello');assert.equal(h.api.s.selected.id,'hello');assert.ok(h.api.s.data);
  const loaded=h.api.s.data;
  releaseBody(stalledMotion);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.api.s.selected.id,'hello');assert.equal(h.api.s.data,loaded);assert.equal(h.get('play').disabled,false);
});

test('an ended camera track cancels a gesture in progress without creating a recognition attempt',async()=>{
  const h=await harness();h.api.setMode('camera');await h.api.startCamera();
  assert.equal(h.api.s.capturing,true);h.api.recordGesture();h.advance(2100);
  assert.ok(h.api.s.recordFrames);h.endCamera();h.advance(4000);
  assert.equal(h.api.s.stream,null);assert.equal(h.api.s.capturing,false);assert.equal(h.api.s.recordFrames,null);
  assert.equal(h.api.s.recordPending,false);assert.equal(h.api.ledger.attempts.length,0);assert.equal(h.stopped(),1);
  assert.equal(h.get('record').disabled,true);assert.equal(h.get('start-camera').hidden,false);assert.equal(h.get('start-camera').disabled,false);
  assert.equal(h.get('record-indicator').hidden,true);assert.match(h.get('capture-notice').textContent,/Камера отключилась/);
});

test('leaving dialogue aborts dictation, resets both controls and ignores a late speech result',async()=>{
  const h=await harness(),recognitions=[];
  h.window.SpeechRecognition=class{
    constructor(){this.aborted=false;recognitions.push(this);}
    start(){}abort(){this.aborted=true;this.onend?.();}
  };
  h.api.setMode('dialogue');h.get('employee-text').value='Сохранённый ответ';h.get('dictate-reply').click();
  const previous=recognitions[0];assert.ok(previous);assert.equal(h.api.s.speech,previous);
  assert.equal(h.get('dictate-reply').getAttribute('aria-pressed'),'true');assert.equal(h.get('dictate').classList.contains('recording'),true);
  h.api.setMode('text');
  assert.equal(previous.aborted,true);assert.equal(h.api.s.speech,null);
  assert.equal(h.get('dictate-reply').getAttribute('aria-pressed'),'false');assert.equal(h.get('dictate').classList.contains('recording'),false);
  const textBefore=h.get('message').value;
  previous.onresult({results:[[{transcript:'Поздний результат'}]]});previous.onend();
  assert.equal(h.get('message').value,textBefore);assert.equal(h.get('employee-text').value,'Сохранённый ответ');
  h.get('dictate').click();assert.equal(recognitions.length,2);assert.equal(h.api.s.speech,recognitions[1]);
  h.get('dictate').click();assert.equal(recognitions[1].aborted,true);assert.equal(h.api.s.speech,null);
});
test('manual edits, saving a reply and prepared-word choices abort dictation before stale results can replace text',async()=>{
 for(const action of ['reply-input','save-reply','reply-chip','avatar-input','avatar-submit','avatar-word']){
  const h=await harness(),recognitions=[],reply=action.startsWith('reply')||action==='save-reply';
  h.api.setMode(reply?'dialogue':'text');
  const field=h.get(reply?'employee-text':'message');field.value='Ранее введённый ответ';
  h.window.SpeechRecognition=class{
   constructor(){recognitions.push(this);}
   start(){}
   abort(){this.aborted=true;this.onresult?.({results:[[{transcript:'Результат внутри abort'}]]});this.onend?.();}
  };
  h.get(reply?'dictate-reply':'dictate').click();const stale=recognitions[0];
  if(action.endsWith('input')){field.value='Важная ручная правка';field.emit('input');}
  if(action==='save-reply')h.get('send-reply').click();
  if(action==='reply-chip')h.get('reply-chips').children[0].click();
  if(action==='avatar-submit')h.get('text-form').emit('submit');
  if(action==='avatar-word')await h.get('word-chips').children[0].click();
  const expected=field.value;
  assert.equal(stale.aborted,true,action);assert.equal(h.api.s.speech,null);assert.equal(h.get('dictate-reply').getAttribute('aria-pressed'),'false');
  if(action.endsWith('input'))assert.equal(expected,'Важная ручная правка');
  if(action==='save-reply'){assert.equal(expected,'');assert.equal(h.api.ledger.messages[0].text,'Ранее введённый ответ');}
  if(action.endsWith('chip')||action==='avatar-word')assert.equal(expected,manifest.samples[0].label);
  stale.onresult({results:[[{transcript:'Поздняя перезапись'}]]});stale.onerror({error:'network'});stale.onend();
  assert.equal(field.value,expected,action);assert.equal(h.api.s.speech,null);
  h.get(reply?'dictate-reply':'dictate').click();const fresh=recognitions[1];
  stale.onresult({results:[[{transcript:'Старый результат после нового запуска'}]]});stale.onend();
  assert.equal(h.api.s.speech,fresh);assert.equal(field.value,expected);
  fresh.onresult({results:[[{transcript:'Новая явная диктовка'}]]});assert.equal(field.value,'Новая явная диктовка');
 }
});
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
  h.api.recordGesture();assert.equal(h.api.s.recordPending,true);assert.equal(h.api.s.recordFrames,null);h.advance(2100);assert.ok(h.api.s.recordFrames);h.api.setMode('video');
  assert.equal(h.api.s.recordFrames,null);assert.equal(h.api.s.result,null);assert.equal(h.get('record-indicator').hidden,true);
});

test('a personal sample for an existing word joins its class instead of becoming an ambiguous label',async()=>{
  const h=await harness();h.api.setMode('camera');h.api.s.capturing=true;h.api.s.stream={getTracks:()=>[]};
  h.get('custom-label').value='Вопрос';h.api.recordGesture(true);h.advance(2100);
  h.api.s.recordFrames=motionByUrl.get('./assets/motion/cc59e1b2-5778-47bb-a452-779033da61b0.json').frames;
  h.advance(3100);assert.equal(h.api.s.custom.length,1);assert.equal(h.api.s.custom[0].id,'question');
});

test('confirmation inserts a candidate once without speech or history; alternate paths do not duplicate it',async()=>{
  const h=await harness();const motion=motionByUrl.get('./assets/motion/cc59e1b2-5778-47bb-a452-779033da61b0.json');
  h.api.s.templates=[{id:'question',text:'Вопрос',origin:'slovo',sequence:makeSequence(motion.frames,motion.width/motion.height)}];
  h.api.showResult(motion.frames,motion.width/motion.height,'camera',3100);
  assert.equal(h.get('speak').disabled,true);assert.equal(h.api.ledger.summary().reviewed,0);
  h.get('confirm-visitor').click();assert.equal(h.get('speak').disabled,false);assert.equal(h.api.ledger.summary().correct,1);
  assert.equal(h.get('conversation').value,'Вопрос');assert.equal(h.api.ledger.messages.length,0);assert.deepEqual(h.spoken,[]);
  h.get('confirm-visitor').click();h.get('add-word').click();h.get('visitor-text-only').click();
  assert.equal(h.get('conversation').value,'Вопрос');assert.equal(h.api.ledger.messages.length,0);assert.deepEqual(h.spoken,['Вопрос']);
  h.get('save-message').click();assert.equal(h.api.ledger.messages.length,1);assert.equal(h.api.ledger.messages[0].role,'visitor');
});
test('arbitrary employee reply stays text-only and clears the previous gesture',async()=>{
  const h=await harness();h.api.setMode('dialogue');h.get('employee-text').value='Повторите, пожалуйста';h.get('send-reply').click();
  assert.equal(h.api.s.data,null);assert.equal(h.api.ledger.messages[0].kind,'manual');assert.equal(h.get('dialogue-active-word').textContent,'Ответ текстом');
});

test('a new manually entered reply after confirmation does not re-score the previous attempt',async()=>{
  const h=await harness();h.api.setMode('dialogue');
  h.api.showResult([],1,'camera',3000);h.api.confirmResult('Вопрос',{add:true});
  h.get('visitor-text').value='Спасибо';h.get('visitor-text').emit('input');h.get('visitor-text-only').click();
  assert.equal(h.api.ledger.messages.length,0);assert.equal(h.get('conversation').value,'Вопрос Спасибо');
  assert.equal(h.api.ledger.summary().reviewed,1);assert.equal(h.api.ledger.summary().corrected,1);
});

test('preparation countdown can be cancelled without creating an attempt',async()=>{
 const h=await harness();h.api.setMode('camera');h.api.s.capturing=true;h.api.s.stream={getTracks:()=>[]};
 h.api.recordGesture();h.api.stopCapture();h.advance(6000);
 assert.equal(h.api.s.recordFrames,null);assert.equal(h.api.s.recordPending,false);assert.equal(h.api.ledger.attempts.length,0);
});
test('fixed protocol target survives a rejected result and manual correction',async()=>{
 const h=await harness();h.get('protocol-start').click();const p=h.api.protocolRuns[0],target=p.context();
 h.api.s.capturing=true;h.api.s.stream={getTracks:()=>[]};h.api.recordGesture();h.advance(2100);h.advance(3100);
 assert.equal(p.summary().rejected,1);assert.equal(h.api.ledger.attempts[0].protocol.expectedId,target.expectedId);
 h.api.confirmResult(target.expectedText);assert.equal(p.summary().correct,0);assert.equal(h.api.ledger.attempts[0].objectiveMatch,false);
 h.get('protocol-next').click();assert.equal(p.index,1);
 h.api.setMode('research');assert.equal(h.get('protocol-resume').hidden,false);h.get('protocol-resume').click();assert.equal(h.get('protocol-live').hidden,false);
});
test('recognition loads all training templates once and never imports evaluation examples',async()=>{
 const h=await harness();await h.api.ensureTemplates();assert.equal(h.api.s.templates.length,21);assert.ok(h.api.s.templates.every(x=>x.split==='train'));
 const heldoutUsers=new Set(benchmark.current.rows.map(x=>x.user_id));assert.ok(h.api.s.templates.every(x=>!heldoutUsers.has(x.user_id)));
 const entries=h.api.s.templates;await h.api.ensureTemplates();assert.equal(h.api.s.templates,entries);
});
test('leaving the series for dialogue cannot silently score a hidden target',async()=>{
 const h=await harness();h.get('protocol-start').click();const p=h.api.protocolRuns[0];h.api.setMode('dialogue');
 h.api.s.capturing=true;h.api.s.stream={getTracks:()=>[]};h.api.recordGesture();h.advance(2100);h.advance(3100);
 assert.equal(p.summary().recorded,0);assert.equal(h.api.ledger.attempts[0].protocol,null);
});
test('scrubbing during pending video play suppresses the expected abort error',async()=>{
 const h=await harness();h.api.setCompare(true);let reject;
 h.get('source-video').play=()=>new Promise((_,r)=>reject=r);
 const pending=h.api.playAvatar();h.get('timeline').value='300';h.get('timeline').emit('input');
 reject(new Error('The play() request was interrupted by a call to pause()'));await pending;
 assert.equal(h.api.s.playing,false);assert.equal(h.api.s.time,h.api.s.data.duration*.3);
 assert.doesNotMatch(h.get('text-notice').textContent,/Видео не запускается/);
});
test('late completion of an old play request cannot pause newer playback',async()=>{
 const h=await harness();h.api.setCompare(true);let resolve;
 h.get('source-video').play=()=>new Promise(r=>resolve=r);const old=h.api.playAvatar();h.api.pauseAvatar();
 h.get('source-video').play=()=>Promise.resolve();await h.api.playAvatar();let pauses=0;h.get('source-video').pause=()=>pauses++;
 resolve();await old;assert.equal(pauses,0);assert.equal(h.api.s.playing,true);
});
test('a built-in video replay loads motion independently of the recognition library',async()=>{
 const h=await harness();h.api.setMode('video');assert.equal(h.api.s.motions.has('hello'),false);
 h.api.s.sampleId='hello';h.api.s.videoReady=true;
 h.get('input-video').play=async()=>{h.get('input-video').currentTime=9;h.get('input-video').ended=true;};
 await h.get('replay-analysis').onclick();
 assert.equal(h.api.s.motions.has('hello'),true);assert.equal(h.api.s.templates.length,21);
 assert.match(h.get('result-label').textContent,/ДЕМО/);assert.equal(h.api.ledger.summary().demo,1);assert.equal(h.api.ledger.summary().total,0);
 assert.match(h.get('capture-notice').textContent,/разбор завершён/);
});


test('source-only mode preserves time, uses the media clock and returns to the same avatar position',async()=>{
 const h=await harness();h.get('timeline').value='375';h.get('timeline').emit('input');const time=h.api.s.time;
 h.get('show-reference').click();assert.equal(h.api.s.view,'reference');assert.equal(h.api.s.compare,true);
 assert.equal(h.get('stage').classList.contains('reference'),true);assert.equal(h.get('stage').classList.contains('compare'),false);
 assert.equal(h.get('source-video').hidden,false);assert.equal(h.get('source-video').currentTime,time);
 assert.equal(h.get('show-reference').getAttribute('aria-pressed'),'true');assert.equal(h.get('show-avatar').getAttribute('aria-pressed'),'false');
 await h.api.playAvatar();h.get('source-video').currentTime=.9;h.frame(16);assert.equal(h.api.s.time,.9);
 h.api.pauseAvatar();h.get('show-compare').click();assert.equal(h.api.s.time,.9);assert.equal(h.get('stage').classList.contains('compare'),true);
 h.get('show-avatar').click();assert.equal(h.api.s.compare,false);assert.equal(h.api.s.time,.9);assert.equal(h.get('source-video').hidden,true);
 assert.equal(h.get('show-avatar').getAttribute('aria-pressed'),'true');assert.equal(h.get('show-reference').getAttribute('aria-pressed'),'false');
});

test('a pending media seek holds the requested avatar time until video catches up',async()=>{
 const h=await harness();h.get('show-reference').click();await h.api.playAvatar();
 h.get('source-video').seeking=true;h.get('source-video').currentTime=.5;h.frame(16);assert.equal(h.api.s.time,0);
 h.get('source-video').seeking=false;h.frame(16);assert.equal(h.api.s.time,.5);
});

test('frame stepping pauses, lands on recorded instants and synchronizes source video at both boundaries',async()=>{
 const h=await harness(),fps=h.api.s.data.fps,frames=h.api.s.data.frames.length;
 assert.equal(h.get('frame-prev').disabled,true);assert.equal(h.get('frame-next').disabled,false);
 h.get('show-compare').click();await h.api.playAvatar();h.get('frame-next').click();
 assert.equal(h.api.s.playing,false);assert.equal(h.api.s.time,1/fps);assert.equal(h.get('source-video').currentTime,1/fps);
 assert.equal(h.get('frame-readout').textContent,`Кадр 2 / ${frames}`);assert.match(h.get('timeline').getAttribute('aria-valuetext'),/кадр 2 из/);
 h.get('frame-prev').click();assert.equal(h.api.s.time,0);assert.equal(h.get('frame-prev').disabled,true);
 h.get('timeline').value='1000';h.get('timeline').emit('input');assert.equal(h.get('frame-next').disabled,true);
 h.get('frame-prev').click();assert.equal(h.api.s.time,(frames-2)/fps);assert.equal(h.get('source-video').currentTime,(frames-2)/fps);
 h.get('frame-next').click();assert.equal(h.api.s.time,(frames-1)/fps);assert.equal(h.get('frame-next').disabled,true);
 assert.match(h.get('play-time').textContent,/^0:01,\d$/);
});

test('large view moves the live card and Escape restores its exact place, controls, time and focus',async()=>{
 const h=await harness(),card=h.get('avatar-card'),home=card.parentNode,next=card.nextSibling,video=h.get('source-video'),play=h.get('play');
 h.get('timeline').value='500';h.get('timeline').emit('input');const time=h.api.s.time;h.get('show-reference').click();
 h.get('avatar-focus').focus();h.get('avatar-focus').click();
 assert.equal(h.get('avatar-focus-dialog').open,true);assert.equal(card.parentNode,h.get('avatar-focus-dialog'));
 assert.equal(h.get('avatar-focus-label').textContent,'Закрыть');assert.equal(h.api.s.time,time);assert.equal(h.api.s.view,'reference');
 assert.equal(h.get('source-video'),video);assert.equal(h.get('play'),play);
 h.get('avatar-focus-dialog').emit('cancel');
 assert.equal(h.get('avatar-focus-dialog').open,false);assert.equal(card.parentNode,home);assert.equal(card.nextSibling,next);
 assert.equal(h.document.activeElement,h.get('avatar-focus'));assert.equal(h.get('avatar-focus-label').textContent,'Крупно');
 assert.equal(h.get('avatar-focus').getAttribute('aria-expanded'),'false');assert.equal(h.api.s.time,time);assert.equal(h.api.s.view,'reference');
 h.get('avatar-focus').click();h.get('avatar-focus').click();assert.equal(card.parentNode,home);assert.equal(card.nextSibling,next);
});

test('navigation out of an enlarged avatar restores the card and closes its modal',async()=>{
 const h=await harness(),card=h.get('avatar-card'),home=card.parentNode;
 h.get('avatar-focus').click();h.api.setMode('video');
 assert.equal(h.get('avatar-focus-dialog').open,false);assert.equal(card.parentNode,home);assert.equal(h.api.s.mode,'video');
});

test('animation frames do not recreate the play button while its state is unchanged',async()=>{
 const h=await harness(),play=h.get('play');await h.api.playAvatar();const writes=play.htmlWrites;
 for(let i=0;i<30;i++)h.frame(16);
 assert.equal(h.api.s.playing,true);assert.equal(play.htmlWrites,writes);assert.equal(play.getAttribute('aria-label'),'Пауза');
 assert.ok(Number(h.get('timeline').value)>0);h.api.pauseAvatar();assert.equal(play.htmlWrites,writes+1);
 assert.equal(play.getAttribute('aria-label'),'Продолжить');h.api.pauseAvatar();assert.equal(play.htmlWrites,writes+1);
});


test('frame steps choose the nearest recorded neighbour from between frames, including before frame two',async()=>{
 const h=await harness(),fps=h.api.s.data.fps;
 h.api.s.time=4.5/fps;h.api.pauseAvatar();h.get('frame-prev').click();
 assert.equal(h.api.s.time,4/fps);assert.equal(h.get('source-video').currentTime,4/fps);
 h.api.s.time=4.5/fps;h.api.pauseAvatar();h.get('frame-next').click();
 assert.equal(h.api.s.time,5/fps);assert.equal(h.get('source-video').currentTime,5/fps);
 h.api.s.time=.5/fps;h.api.pauseAvatar();assert.equal(h.get('frame-prev').disabled,false);
 h.get('frame-prev').click();assert.equal(h.api.s.time,0);assert.equal(h.get('frame-prev').disabled,true);
});

const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('repeat holds the last frame for 800 ms and restarts at frame one without joining the endpoints',async()=>{
 const h=await harness();h.get('repeat').click();await h.api.playAvatar();
 h.frame(h.api.s.data.duration*1000+10);
 assert.equal(h.api.s.repeatWaiting,true);assert.equal(h.api.s.playing,true);
 assert.equal(h.api.s.time,h.api.s.data.duration);assert.equal(h.get('play').getAttribute('aria-label'),'Пауза');
 assert.equal(h.get('playback-status').textContent,'Пауза перед повтором');
 h.advance(799);assert.equal(h.api.s.time,h.api.s.data.duration);assert.equal(h.api.s.repeatWaiting,true);
 h.advance(1);assert.equal(h.api.s.time,0);assert.equal(h.api.s.repeatWaiting,false);assert.equal(h.api.s.playing,true);
 h.frame(100);assert.ok(Math.abs(h.api.s.time-.1)<1e-9);
});

test('cancelled repeat callbacks cannot restart after pause, scrub, a new word, view changes, navigation, or a hidden tab',async()=>{
 const actions=[
  h=>h.api.pauseAvatar(),
  h=>{h.get('timeline').value='400';h.get('timeline').emit('input');},
  h=>h.get('repeat').click(),
  h=>h.api.selectWord('hello',true),
  h=>h.api.setVisualMode('compare'),
  h=>h.api.setMode('video'),
  h=>{h.document.hidden=true;h.document.emit('visibilitychange');},
 ];
 for(const action of actions){
  const h=await harness();h.get('repeat').click();await h.api.playAvatar();h.frame(2000);
  const stale=h.timers.get(h.api.s.repeatTimer).cb;
  await action(h);
  const expected={time:h.api.s.time,playing:h.api.s.playing,word:h.api.s.selected.id,token:h.api.s.playbackToken};
  stale();h.advance(1000);await flush();
  assert.deepEqual({time:h.api.s.time,playing:h.api.s.playing,word:h.api.s.selected.id,token:h.api.s.playbackToken},expected);
  assert.equal(h.api.s.repeatWaiting,false);assert.equal(h.api.s.repeatTimer,0);
 }
});

test('video ended events schedule only one still pause and restart comparison from the same first instant',async()=>{
 const h=await harness(),video=h.get('source-video');h.api.setCompare(true);h.get('repeat').click();await h.api.playAvatar();
 video.currentTime=h.api.s.data.duration;video.emit('ended');
 const timer=h.api.s.repeatTimer;assert.ok(timer);assert.equal(h.api.s.time,h.api.s.data.duration);
 video.emit('ended');assert.equal(h.api.s.repeatTimer,timer);
 h.advance(800);await flush();
 assert.equal(h.api.s.playing,true);assert.equal(h.api.s.time,0);assert.equal(video.currentTime,0);
 video.currentTime=.2;h.frame(16);assert.equal(h.api.s.time,.2);
});

test('moving the live player and its one showcase wrapper preserves playback and an outstanding repeat pause',async()=>{
 const h=await harness(),controls=h.get('showcase-controls'),home=controls.parentNode,next=controls.nextSibling;
 h.get('repeat').click();await h.api.playAvatar();h.frame(200);
 const time=h.api.s.time,token=h.api.s.playbackToken;
 h.get('avatar-focus').click();
 assert.equal(controls.parentNode,h.get('avatar-card'));assert.equal(controls.nextSibling,h.get('avatar-footer'));
 assert.equal(h.api.s.playing,true);assert.equal(h.api.s.time,time);assert.equal(h.api.s.playbackToken,token);
 h.get('avatar-focus-dialog').emit('cancel');
 assert.equal(controls.parentNode,home);assert.equal(controls.nextSibling,next);assert.equal(h.api.s.playing,true);
 h.frame(2000);const timer=h.api.s.repeatTimer;
 h.get('avatar-focus').click();h.get('avatar-focus').click();
 assert.equal(h.api.s.repeatTimer,timer);assert.equal(h.api.s.repeatWaiting,true);
 h.advance(800);assert.equal(h.api.s.time,0);assert.equal(h.api.s.playing,true);
});

test('the actual six-word showcase starts inside large view, survives resizing, and completes each word once',async()=>{
 const h=await harness({showcase:true});h.get('repeat').click();h.get('avatar-focus').click();
 const sequence=h.get('showcase-start').click();await flush();
 assert.equal(h.get('avatar-focus-dialog').open,true);assert.equal(h.api.s.repeat,false);
 const visited=[];
 for(let index=0;index<6;index++){
  h.advance(350);await flush();assert.equal(h.api.s.playing,true);
  visited.push(h.api.s.selected.id);
  if(index===0){
   h.frame(100);const time=h.api.s.time,token=h.api.s.playbackToken;
   h.get('avatar-focus').click();h.get('avatar-focus').click();
   assert.equal(h.api.s.time,time);assert.equal(h.api.s.playbackToken,token);
   assert.equal(h.get('showcase-start').getAttribute('aria-pressed'),'true');
  }
  h.frame(2000);assert.equal(h.api.s.playing,false);
  h.advance(80);await flush();h.advance(900);await flush();
 }
 await sequence;
 assert.deepEqual(visited,manifest.samples.map(item=>item.id));
 assert.equal(h.get('showcase-start').getAttribute('aria-pressed'),'false');
 assert.equal(h.api.s.playing,false);assert.equal(h.get('avatar-focus-dialog').open,true);
 assert.match(h.get('showcase-status').textContent,/Показ завершён/);
});

test('manual repeat during a showcase gap cancels its queued next word without competing playback',async()=>{
 const h=await harness({showcase:true});const sequence=h.get('showcase-start').click();await flush();
 h.advance(350);await flush();h.frame(2000);h.advance(80);await flush();
 const word=h.api.s.selected.id;h.get('repeat').click();
 assert.equal(h.get('showcase-start').getAttribute('aria-pressed'),'false');assert.equal(h.api.s.repeat,true);
 await h.api.playAvatar();h.advance(900);await flush();await sequence;
 assert.equal(h.api.s.selected.id,word);assert.equal(h.api.s.playing,true);assert.equal(h.api.s.time,0);
});

test('a cancelled showcase load cannot overwrite or start after a manual word selection',async()=>{
 let release;const first=`./assets/motion/${manifest.samples[0].file.replace('.mp4','.json')}`;
 const h=await harness({showcase:true,fetchResponse(url,options,fallback){
  return url===first?Promise.resolve({ok:true,json:()=>new Promise(resolve=>{release=()=>resolve(motionByUrl.get(url));})}):fallback(url);
 }});
 const sequence=h.get('showcase-start').click();await flush();assert.ok(release);
 const word=h.get('word-chips').children.find(button=>button.dataset.id==='yes');word.click();await flush();
 assert.equal(h.api.s.selected.id,'yes');const data=h.api.s.data,token=h.api.s.playbackToken;
 release();await sequence;h.advance(2000);await flush();
 assert.equal(h.api.s.selected.id,'yes');assert.equal(h.api.s.data,data);assert.equal(h.api.s.playbackToken,token);
 assert.equal(h.get('showcase-start').getAttribute('aria-pressed'),'false');
});

test('quarter speed uses real elapsed time and keyboard controls select exact frames after ordinary button clicks',async()=>{
 const h=await harness({showcase:true}),timeline=h.get('timeline'),fps=h.api.s.data.fps;
 h.get('speed').value='.25';h.get('speed').emit('change');await h.api.playAvatar();h.frame(400);
 assert.ok(Math.abs(h.api.s.time-.1)<1e-9);assert.equal(h.get('source-video').playbackRate,.25);
 timeline.emit('keydown',{key:'ArrowRight'});assert.equal(h.api.s.playing,false);assert.equal(h.api.s.time,4/fps);
 timeline.emit('keydown',{key:'Home'});assert.equal(h.api.s.time,0);
 timeline.emit('keydown',{key:'End'});assert.equal(h.api.s.time,(h.api.s.data.frames.length-1)/fps);
 h.get('show-compare').click();h.get('show-compare').emit('keydown',{key:'f'});
 assert.equal(h.get('avatar-focus-dialog').open,true);
 h.get('avatar-focus').emit('keydown',{key:'ArrowLeft'});
 assert.equal(h.api.s.time,(h.api.s.data.frames.length-2)/fps);assert.equal(h.get('source-video').currentTime,h.api.s.time);
});

test('communication bootstraps before a failed catalog request and manual text remains usable',async()=>{
 let rejectCatalog;
 const h=await harness({initialHash:'',fetchResponse(url,options,fallback){
  if(url.includes('slovo-sources'))return new Promise((_,reject)=>{rejectCatalog=reject;});
  return fallback(url);
 },beforeReady(controls){
  assert.equal(controls.get('view-dialogue').hidden,false);assert.equal(controls.get('mode-crumb').textContent,'Общение');
  const field=controls.get('conversation');field.value='Мне нужна помощь.\nОтветьте текстом.';field.emit('input');
  assert.equal(controls.get('show-message').disabled,false);
  controls.nav.find(button=>button.dataset.mode==='camera').click();
  assert.equal(controls.get('message-composer').parentNode,controls.get('capture-composer-slot'));
  controls.nav.find(button=>button.dataset.mode==='dialogue').click();
  rejectCatalog(new Error('Offline'));
 }});
 assert.equal(h.api.s.mode,'dialogue');assert.equal(h.api.s.catalog.length,0);
 assert.equal(h.get('conversation').value,'Мне нужна помощь.\nОтветьте текстом.');
 h.get('show-message').click();assert.equal(h.get('message-display').open,true);
 assert.equal(h.get('display-text').textContent,h.get('conversation').value);
});

test('the one draft survives every mode, result reset, and camera permission failure',async()=>{
 const h=await harness({cameraError:Object.assign(new Error('Denied'),{name:'NotAllowedError'})}),field=h.get('conversation');
 field.value='Не терять мой текст\nпосле ошибки';field.emit('input');field.setSelectionRange(3,9);field.emit('select');
 for(const mode of ['dialogue','camera','video','text','research','about','dialogue']){
  h.api.setMode(mode);
  assert.equal(h.get('conversation'),field);assert.equal(field.value,'Не терять мой текст\nпосле ошибки');
  assert.equal(h.get('message-composer').parentNode,h.get(['camera','video'].includes(mode)?'capture-composer-slot':'communication-home'));
 }
 h.api.showResult([],1,'camera');h.api.clearResult();
 h.api.setMode('camera');await h.api.startCamera();
 assert.equal(h.api.s.stream,null);assert.match(h.get('capture-notice').textContent,/не разрешён/);
 assert.equal(field.value,'Не терять мой текст\nпосле ошибки');assert.equal(h.api.communication.read().start,3);
});

test('a confirmed capture can retry an over-limit insertion without re-scoring or duplicating the attempt',async()=>{
 const h=await harness(),field=h.get('conversation');field.value='Я'.repeat(1999);field.emit('input');
 h.api.showResult([],1,'camera');h.get('capture-confirm-text').value='Да';h.get('capture-confirm-text').emit('input');h.get('capture-confirm').click();
 assert.equal(h.api.ledger.summary().reviewed,1);assert.equal(field.value.length,1999);
 h.get('add-word').click();assert.equal(field.value.length,1999);assert.match(h.get('draft-status').textContent,/Ничего не обрезано/);
 field.value='Ответ:';field.emit('input');h.get('add-word').click();
 assert.equal(field.value,'Ответ: Да');h.get('confirm-visitor').click();h.get('add-word').click();
 assert.equal(field.value,'Ответ: Да');assert.equal(h.api.ledger.summary().reviewed,1);assert.equal(h.api.ledger.messages.length,0);
});

test('quick phrases use the saved selection and undo never removes later manual edits',async()=>{
 const h=await harness(),field=h.get('conversation');field.value='«СТАРОЕ»\nПосле';field.emit('input');field.setSelectionRange(1,7);field.emit('select');field.emit('blur');
 h.get('phrase-results').children.find(button=>button.textContent==='Спасибо!').click();
 assert.equal(field.value,'«Спасибо!»\nПосле');assert.equal(h.get('undo-message').disabled,false);
 field.value+=' Ручная правка';field.emit('input');assert.equal(h.get('undo-message').disabled,true);
 h.get('undo-message').click();assert.equal(field.value,'«Спасибо!»\nПосле Ручная правка');
 h.get('clear-message').click();assert.equal(field.value,'');h.get('undo-message').click();assert.equal(field.value,'«Спасибо!»\nПосле Ручная правка');
 field.value='Я'.repeat(1999);field.emit('input');let prevented=false;
 field.emit('paste',{clipboardData:{getData:()=> 'Два'},preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(field.value.length,1999);assert.match(h.get('draft-status').textContent,/Ничего не обрезано/);
});

test('large text preserves all lines, stops active media and dictation, changes font and returns focus on Escape',async()=>{
 const h=await harness();h.api.setMode('dialogue');h.get('gesture-input').open=true;await h.api.startCamera();
 let recognition;
 h.window.SpeechRecognition=class{constructor(){recognition=this;}start(){}abort(){this.aborted=true;this.onend?.();}};
 h.get('dictate-reply').click();await h.api.playAvatar();
 const field=h.get('conversation'),text=('Строка сообщения\n').repeat(100);field.value=text;field.emit('input');
 h.get('show-message').focus();h.get('show-message').click();
 assert.equal(h.api.s.stream,null);assert.equal(h.stopped(),1);assert.equal(h.api.s.playing,false);assert.equal(h.api.s.speech,null);assert.equal(recognition.aborted,true);
 assert.equal(h.get('display-text').textContent,text);assert.equal(h.get('display-text').style.fontSize,'48px');
 h.get('display-font').value='64';h.get('display-font').emit('change');assert.equal(h.get('display-text').style.fontSize,'64px');
 h.get('message-display').emit('cancel');assert.equal(h.get('message-display').open,false);assert.equal(h.document.activeElement,h.get('show-message'));assert.equal(field.value,text);
});

test('a motion load started before large text cannot later start hidden playback',async()=>{
 let release;const path=`./assets/motion/${manifest.samples[0].file.replace('.mp4','.json')}`;
 const h=await harness({fetchResponse(url,options,fallback){if(url===path)return Promise.resolve({ok:true,json:()=>new Promise(resolve=>{release=()=>resolve(motionByUrl.get(url));})});return fallback(url);}});
 h.get('conversation').value='Прочитайте это сообщение';h.get('conversation').emit('input');
 const pending=h.api.selectWord('hello',true);await flush();h.get('show-message').click();release();await pending;
 assert.equal(h.get('message-display').open,true);assert.equal(h.api.s.playing,false);assert.equal(h.get('conversation').value,'Прочитайте это сообщение');
});

test('copy success waits for resolution, while denial selects the text without claiming success',async()=>{
 const h=await harness(),field=h.get('conversation');field.value='Скопировать целиком\nвторую строку';field.emit('input');
 let resolve;h.navigator.clipboard={writeText:value=>{assert.equal(value,field.value);return new Promise(r=>{resolve=r;});}};
 h.get('copy-message').click();assert.equal(h.get('draft-status').textContent,'Копируем текст…');resolve();await flush();assert.equal(h.get('draft-status').textContent,'Текст скопирован.');
 h.navigator.clipboard.writeText=()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));h.get('copy-message').click();await flush();
 assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,field.value.length);assert.equal(h.document.activeElement,field);
 assert.match(h.get('draft-status').textContent,/Ctrl\+C/);assert.doesNotMatch(h.get('draft-status').textContent,/Текст скопирован/);
});

test('native share cancellation preserves text, unsupported sharing opens an exact fallback, and success never claims delivery',async()=>{
 const h=await harness(),field=h.get('conversation');field.value='Сообщение\nс переносом';field.emit('input');
 h.navigator.share=()=>Promise.reject(Object.assign(new Error(),{name:'AbortError'}));h.get('share-message').click();await flush();
 assert.equal(h.get('share-fallback').open,false);assert.match(h.get('draft-status').textContent,/отменено/);assert.equal(field.value,'Сообщение\nс переносом');
 h.navigator.share=async()=>{};h.get('share-message').click();await flush();assert.doesNotMatch(h.get('draft-status').textContent,/доставлено|отправлено/i);
 delete h.navigator.share;h.get('share-message').focus();h.get('share-message').click();await flush();
 assert.equal(h.get('share-fallback').open,true);assert.equal(h.get('share-text').value,field.value);assert.equal(h.get('share-text').readOnly,true);
 h.get('share-fallback').emit('cancel');assert.equal(h.get('share-fallback').open,false);assert.equal(h.document.activeElement,h.get('share-message'));assert.equal(field.value,'Сообщение\nс переносом');
});

test('late copy/share failures cannot steal focus, open an old snapshot, or overwrite status after the context changes',async()=>{
 for(const action of ['copy-message','share-message'])for(const change of ['input-and-mode','clear','phrase','large-text']){
  const h=await harness(),field=h.get('conversation');field.value='Первый черновик';field.emit('input');let reject;
  const pending=()=>new Promise((_,r)=>{reject=r;});h.navigator.clipboard={writeText:pending};h.navigator.share=pending;
  h.get(action).click();
  if(change==='input-and-mode'){field.value='Новый исправленный текст';field.emit('input');h.api.setMode('camera');}
  if(change==='clear')h.get('clear-message').click();
  if(change==='phrase')h.get('phrase-results').children[0].click();
  if(change==='large-text')h.get('show-message').click();else h.get('employee-text').focus();
  const focus=h.document.activeElement,text=field.value,status=h.get('draft-status').textContent;
  reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();
  assert.equal(h.get('share-fallback').open,false,`${action}/${change}`);assert.equal(h.document.activeElement,focus);
  assert.equal(field.value,text);assert.equal(h.get('draft-status').textContent,status);
 }
});

test('history export contains only explicitly saved full messages and clearing history preserves the draft',async()=>{
 const h=await harness(),text='Я'.repeat(1987)+'\nПолный текст',reply='Ответ\n'+'Д'.repeat(1994);
 assert.equal(text.length,2000);assert.equal(reply.length,2000);
 h.get('conversation').value=text;h.get('conversation').emit('input');h.get('save-message').click();
 h.get('employee-text').value=reply;h.get('send-reply').click();h.get('visitor-text').value='НЕСОХРАНЁННЫЙ КАНДИДАТ';
 let copied;h.navigator.clipboard={writeText:async value=>{copied=value;}};h.get('copy-dialogue').click();await flush();
 assert.equal(copied,`Вы:\n${text}\n\nСобеседник:\n${reply}`);assert.equal(h.get('conversation').value,text);
 h.get('clear-dialogue').click();assert.equal(h.api.ledger.messages.length,0);assert.equal(h.get('conversation').value,text);assert.equal(h.get('copy-dialogue').disabled,true);
});

test('closing gesture input cancels both model preparation and a partial recording without losing text',async()=>{
 for(const phase of ['model','recording']){
  const h=await harness();h.api.setMode('dialogue');h.get('gesture-input').open=true;h.get('conversation').value='Черновик';h.get('conversation').emit('input');
  const gate=phase==='model'?h.holdVision():null,pending=h.api.startCamera();await flush();
  if(phase==='recording'){await pending;h.api.recordGesture();h.advance(2100);assert.ok(h.api.s.recordFrames);}
  h.get('gesture-input').open=false;h.get('gesture-input').emit('toggle');gate?.resolve();await pending;h.advance(4000);
  assert.equal(h.api.s.stream,null);assert.equal(h.api.s.capturing,false);assert.equal(h.api.s.recordFrames,null);assert.equal(h.api.ledger.attempts.length,0);
  assert.equal(h.stopped(),1);assert.equal(h.get('conversation').value,'Черновик');
 }
});

test('face-to-face reply saves the shown draft once and each reply, without changing the composer',async()=>{
 const h=await harness(),field=h.get('conversation');field.value='Где проходит занятие?';field.emit('input');h.get('show-message').click();
 h.get('display-reply').value='В аудитории 305.';h.get('display-send-reply').click();
 assert.equal(h.api.ledger.messages.length,2);assert.equal(h.api.ledger.messages[0].text,field.value);assert.equal(h.api.ledger.messages[1].text,'В аудитории 305.');
 assert.equal(h.get('display-reply').value,'');h.get('display-send-reply').click();assert.equal(h.api.ledger.messages.length,2,'empty reply cannot duplicate context');
 h.get('display-reply').value='На третьем этаже.';h.get('display-send-reply').click();assert.equal(h.api.ledger.messages.length,3);
 assert.equal(field.value,'Где проходит занятие?');assert.equal(h.get('display-text').textContent,field.value);
});
test('an existing saved context is not duplicated and a partner draft survives close and reopen',async()=>{
 const h=await harness(),field=h.get('conversation');field.value='Вопрос';field.emit('input');h.get('save-message').click();h.get('show-message').click();
 h.get('display-reply').value='Незаконченный ответ';h.get('display-close').click();h.get('show-message').click();
 assert.equal(h.get('display-reply').value,'Незаконченный ответ');h.get('display-send-reply').click();assert.equal(h.api.ledger.messages.length,2);
});
test('phrase categories and empty search results preserve the draft, while chosen phrases remain undoable',async()=>{
 const h=await harness(),field=h.get('conversation');field.value='Здравствуйте.';field.emit('input');
 h.get('phrase-categories').children.find(x=>x.textContent==='Учёба').click();assert.equal(field.value,'Здравствуйте.');
 h.get('phrase-search').value='неизвестныйтекст';h.get('phrase-search').emit('input');assert.equal(h.get('phrase-results').children.length,0);assert.equal(field.value,'Здравствуйте.');
 h.get('phrase-search').value='маршрут';h.get('phrase-search').emit('input');h.get('phrase-results').children[0].click();assert.match(field.value,/маршрут/);h.get('undo-message').click();assert.equal(field.value,'Здравствуйте.');
});
test('profile import is a preview until explicit apply and a cancelled pending file cannot reappear',async()=>{
 const h=await harness(),fileText=serializeProfile([{text:'Личная фраза',sequence:library.entries[0].sequence}]);
 h.get('import-profile').files=[{size:fileText.length,text:async()=>fileText}];await h.get('import-profile').emit('change');
 assert.equal(h.api.s.custom.length,0);assert.equal(h.get('profile-preview').hidden,false);h.get('apply-profile').click();assert.equal(h.api.s.custom.length,1);
 h.get('import-profile').files=[{size:fileText.length,text:async()=>fileText}];await h.get('import-profile').emit('change');h.get('apply-profile').click();assert.equal(h.api.s.custom.length,1);
 let resolve;h.get('import-profile').files=[{size:20,text:()=>new Promise(r=>{resolve=r;})}];const pending=h.get('import-profile').emit('change');h.get('cancel-profile').click();resolve(fileText);await pending;assert.equal(h.get('profile-preview').hidden,true);assert.equal(h.api.s.custom.length,1);
});
