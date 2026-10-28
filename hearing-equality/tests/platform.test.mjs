import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createCatalog, matchText, validateMotion } from '../app/catalog.js';
import { makeSequence, classify, sequenceQuality } from '../app/recognizer.js';
import { SessionLedger, frameReadiness, DEMO_SOURCES } from '../app/session.js';
import { TrialProtocol } from '../app/trial-protocol.js';
const root=new URL('../app/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('assets/sources/slovo-sources.json',root)));
const motionByUrl=new Map(manifest.samples.map(x=>{const path=`./assets/motion/${x.file.replace('.mp4','.json')}`;return[path,JSON.parse(readFileSync(new URL(path,root)))];}));
const library=JSON.parse(readFileSync(new URL('assets/recognition-library.json',root)));
const benchmark=JSON.parse(readFileSync(new URL('assets/evaluation-v07.json',root)));
const source=readFileSync(new URL('platform.js',root),'utf8').replace(/^import .*;\n/gm,'');
test('the actual HTML provides every literal controller ID exactly once and keeps the focus label inside its button',()=>{
  const html=readFileSync(new URL('index.html',root),'utf8');
  const htmlIds=[...html.matchAll(/\bid\s*=\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
  // Derive dependencies from production code, not the permissive fake DOM below.
  // In particular, putText('avatar-focus-label', ...) must resolve in real HTML.
  const requiredIds=new Set([...source.matchAll(/(?:\$\(|putText\(|putAttribute\()\s*'([^']+)'/g)].map(match=>match[1]));
  for(const id of requiredIds)assert.equal(htmlIds.filter(actual=>actual===id).length,1,`Controller requires exactly one #${id} in app/index.html`);
  const focusButton=html.match(/<button\b[^>]*\bid=['"]avatar-focus['"][^>]*>([\s\S]*?)<\/button>/)?.[1];
  assert.match(focusButton||'',/<span\b[^>]*\bid=['"]avatar-focus-label['"]/,'The focus label must remain inside the live focus button');
  assert.match(html,/<dialog\b[^>]*\bid=['"]avatar-focus-dialog['"]/,'Large view must use a native dialog');
});

async function harness(){
  const elements=new Map(),timers=new Map(),rafs=new Map();let now=0,timerId=0,rafId=0,heldVision=null,cameraDeferred=null,stopped=0;
  class El{
    constructor(id=''){
      this.id=id;this.value=id==='speed'?'1':'';this.hidden=false;this.disabled=false;this.children=[];this.parentNode=null;
      this.attrs={};this.listeners={};this.dataset={};this.videoWidth=640;this.videoHeight=480;this.readyState=4;this.duration=1.6;this.currentTime=0;this.textContent='';this.open=false;this.htmlWrites=0;
      const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x);}};
    }
    set innerHTML(value){this.html=String(value);this.htmlWrites++;}get innerHTML(){return this.html||'';}
    get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
    addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);}
    removeEventListener(type,cb){this.listeners[type]=(this.listeners[type]||[]).filter(x=>x!==cb);}
    emit(type){let prevented=false;for(const cb of this.listeners[type]||[])cb({preventDefault(){prevented=true;}});if(type==='cancel'&&!prevented)this.close();}
    remove(){if(this.parentNode){const i=this.parentNode.children.indexOf(this);if(i>=0)this.parentNode.children.splice(i,1);}this.parentNode=null;}
    append(...els){for(const el of els){el.remove();el.parentNode=this;this.children.push(el);}}
    insertBefore(el,next){el.remove();const i=next?this.children.indexOf(next):this.children.length;if(i<0)throw new Error('Reference node is not a child');el.parentNode=this;this.children.splice(i,0,el);}
    replaceChildren(...els){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...els);}
    setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
    getContext(){return{clearRect(){}};}pause(){}load(){}play(){return Promise.resolve();}
    focus(){document.activeElement=this;}scrollIntoView(){}showModal(){this.open=true;}close(){if(this.open){this.open=false;this.emit('close');}}click(){this.onclick?.();}
  }
  const get=id=>{if(!elements.has(id))elements.set(id,new El(id));return elements.get(id);};
  get('facing').value='user';get('message').value='Вопрос';
  get('text-workspace').append(get('composer'),get('avatar-card'),get('after-avatar'));
  get('avatar-card').append(get('avatar-focus'),get('play'),get('source-video'),get('word-chips'));
  get('avatar-focus').append(get('avatar-focus-label'));
  const nav=['text','camera','video','about'].map(mode=>{const el=new El();el.dataset.mode=mode;return el;});
  const document={hidden:false,activeElement:null,getElementById:get,createElement:()=>new El(),querySelectorAll:()=>nav,querySelector:selector=>selector==='.avatar-card'?get('avatar-card'):new El(),addEventListener(){}};
  class Avatar{load(){}clear(){}resize(){}showAt(){}setScene(){}setAppearance(){}}
  const stream={getTracks:()=>[{stop(){stopped++;}}]};
  const context=vm.createContext({document,CanvasAvatar:Avatar,TrialProtocol,SessionLedger,frameReadiness,DEMO_SOURCES,createCatalog,matchText,validateMotion,makeSequence,classify,sequenceQuality,drawLandmarks(){},
    window:{addEventListener(){},speechSynthesis:{cancel(){}}},navigator:{mediaDevices:{getUserMedia:()=>cameraDeferred?cameraDeferred.promise:Promise.resolve(stream)}},
    location:{hash:'#text',search:''},history:{replaceState(){}},URL,URLSearchParams,performance:{now:()=>now},
    matchMedia:()=>({matches:false}),requestAnimationFrame:cb=>{rafs.set(++rafId,cb);return rafId;},cancelAnimationFrame:id=>rafs.delete(id),
    setTimeout:cb=>{timers.set(++timerId,cb);return timerId;},clearTimeout:id=>timers.delete(id),
    loadVision:()=>heldVision?.promise||Promise.resolve(),resetVision:async()=>{},detect:()=>new Promise(()=>{}),
    fetch:async url=>({ok:true,json:async()=>url.includes('slovo-sources')?manifest:url.includes('recognition-library')?library:url.includes('evaluation-v07')?benchmark:motionByUrl.get(url)}),console,
  });
  const api=await vm.runInContext(`(async()=>{${source}\nreturn {s,ledger,showResult,confirmResult,selectWord,setMode,startCamera,stopCapture,recordGesture,ensureTemplates,protocolRuns,playAvatar,pauseAvatar,setCompare,setVisualMode};})()`,context);
  const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
  return{api,get,document,timers,frame(ms){now+=ms;const callbacks=[...rafs.values()];rafs.clear();for(const cb of callbacks)cb(now);},advance(ms){now+=ms;const callbacks=[...timers.values()];timers.clear();for(const cb of callbacks)cb();},stopped:()=>stopped,holdVision(){heldVision=deferred();return heldVision;},holdCamera(){cameraDeferred=deferred();return{...cameraDeferred,stream};}};
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
  h.api.recordGesture();assert.equal(h.api.s.recordPending,true);assert.equal(h.api.s.recordFrames,null);h.advance(2100);assert.ok(h.api.s.recordFrames);h.api.setMode('video');
  assert.equal(h.api.s.recordFrames,null);assert.equal(h.api.s.result,null);assert.equal(h.get('record-indicator').hidden,true);
});

test('a personal sample for an existing word joins its class instead of becoming an ambiguous label',async()=>{
  const h=await harness();h.api.setMode('camera');h.api.s.capturing=true;h.api.s.stream={getTracks:()=>[]};
  h.get('custom-label').value='Вопрос';h.api.recordGesture(true);h.advance(2100);
  h.api.s.recordFrames=motionByUrl.get('./assets/motion/cc59e1b2-5778-47bb-a452-779033da61b0.json').frames;
  h.advance(3100);assert.equal(h.api.s.custom.length,1);assert.equal(h.api.s.custom[0].id,'question');
});

test('a proposed result cannot be spoken until an explicit confirmation',async()=>{
  const h=await harness();const motion=motionByUrl.get('./assets/motion/cc59e1b2-5778-47bb-a452-779033da61b0.json');
  h.api.s.templates=[{id:'question',text:'Вопрос',origin:'slovo',sequence:makeSequence(motion.frames,motion.width/motion.height)}];
  h.api.showResult(motion.frames,motion.width/motion.height,'camera',3100);
  assert.equal(h.get('speak').disabled,true);assert.equal(h.api.ledger.summary().reviewed,0);
  h.api.confirmResult('Вопрос',{dialogue:true});assert.equal(h.get('speak').disabled,false);assert.equal(h.api.ledger.summary().correct,1);assert.equal(h.api.ledger.messages.length,1);
  h.api.confirmResult('Вопрос',{dialogue:true});assert.equal(h.api.ledger.messages.length,1);
});
test('arbitrary employee reply stays text-only and clears the previous gesture',async()=>{
  const h=await harness();h.api.setMode('dialogue');h.get('employee-text').value='Повторите, пожалуйста';h.get('send-reply').click();
  assert.equal(h.api.s.data,null);assert.equal(h.api.ledger.messages[0].kind,'manual');assert.equal(h.get('dialogue-active-word').textContent,'Ответ текстом');
});

test('a new manually entered reply after confirmation does not re-score the previous attempt',async()=>{
  const h=await harness();h.api.setMode('dialogue');
  h.api.showResult([],1,'camera',3000);h.api.confirmResult('Вопрос',{dialogue:true});
  h.get('visitor-text').value='Спасибо';h.get('visitor-text').emit('input');h.get('visitor-text-only').click();
  assert.equal(h.api.ledger.messages.length,2);assert.equal(h.api.ledger.messages[1].kind,'manual');
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
 assert.equal(play.getAttribute('aria-label'),'Воспроизвести');h.api.pauseAvatar();assert.equal(play.htmlWrites,writes+1);
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
