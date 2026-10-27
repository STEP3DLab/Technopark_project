import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('let scene=null, sceneReady=false, transitioning=false;');
const end=source.indexOf("$$('.viewer-modes [data-mode]').forEach(button=>button.addEventListener",start);
assert.ok(start>=0&&end>start,'extract real production initialization and recovery');
const controller=source.slice(start,end).replaceAll('await import(', 'await loader(');
const defaultState=()=>({mode:'points',section:55,playing:true,zoom:1});

function environment(plan){
  const nodes=new Map(),instances=[],calls=[];
  function node(selector){
    const classes=new Set();
    const element={selector,dataset:{},hidden:false,disabled:false,value:'',textContent:'',attributes:{},
      classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle(n,b){if(b)classes.add(n);else classes.delete(n);},contains:n=>classes.has(n)},
      setAttribute(n,v){this.attributes[n]=v;},removeAttribute(n){delete this.attributes[n];},
      cloneNode(){return node(selector);},replaceWith(next){nodes.set(selector,next);}};
    return element;
  }
  const $=selector=>{if(!nodes.has(selector))nodes.set(selector,node(selector));return nodes.get(selector);};
  const modes=['points','model','deviation','section'].map(mode=>{const n=node(mode);n.dataset.mode=mode;return n;});
  const controls=[...modes,...['#rotate-btn','#reset-view','#zoom-in','#zoom-out','#section-range'].map($)];
  const $$=selector=>selector==='.viewer-modes [data-mode]'?modes:controls;
  const loader=async specifier=>{
    const kind=specifier.includes('fallback')?'canvas':'webgl';calls.push(kind);
    const behavior=plan[kind].shift()??'success';
    if(behavior==='throw')throw new Error('Mock module failure');
    function init({onReady,onModeChange,onStateChange}){
      let state=defaultState();
      const record={kind,onReady,destroyed:false};
      const notify=()=>onStateChange({...state});
      if(behavior==='fail'){
        state={...state,playing:false};onReady(false);
        record.api={getState:()=>({...state}),destroy:()=>{record.destroyed=true;}};
      }else{
        record.api={getState:()=>({...state}),destroy:()=>{record.destroyed=true;},
          setMode(mode){state.mode=mode;onModeChange(mode);notify();},
          setSection(section){state.section=section;notify();},
          setPlaying(playing){state.playing=playing;notify();},
          zoomBy(factor){state.zoom=Math.max(.72,Math.min(1.65,state.zoom*factor));notify();}};
        onModeChange(state.mode);notify();onReady({points:20000,renderer:kind});
      }
      instances.push(record);return record.api;
    }
    return kind==='webgl'?{initScene:init}:{initFallbackScene:init};
  };
  const context={$, $$, loader,matchMedia:()=>({matches:false}),console:{info(){},warn(){}},Intl};
  vm.createContext(context);
  vm.runInContext(controller+'\nglobalThis.test={startScene,read:()=>({scene,sceneReady,transitioning,sceneState:{...sceneState}})};',context);
  return {...context.test,$,controls,instances,calls};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function snapshot(api){return JSON.parse(JSON.stringify(api.getState()));}
function setCustom(api){api.setMode('section');api.setSection(73);api.setPlaying(false);api.zoomBy(1.45);return snapshot(api);}
const failures=[];
async function test(name,fn){try{await fn();console.log('PASS '+name);}catch(error){failures.push({name,message:error.message});console.log('FAIL '+name+'\n'+error.message);}}

await test('WebGL loss -> Canvas preserves mode, section, playing and zoom',async()=>{
  const e=environment({webgl:['success'],canvas:['success']});await e.startScene();
  const expected=setCustom(e.read().scene);const previous=e.instances[0];previous.onReady(false);await flush();
  assert.deepEqual(e.calls,['webgl','canvas']);assert.equal(previous.destroyed,true);
  assert.deepEqual(snapshot(e.read().scene),expected);assert.equal(e.read().sceneReady,true);assert.equal(e.read().transitioning,false);
  assert.equal(e.$('#retry-scene').hidden,true);assert.ok(e.controls.every(n=>!n.disabled));
});
await test('Initial total failure exposes retry and retry can initialize WebGL',async()=>{
  const e=environment({webgl:['fail','success'],canvas:['fail']});await e.startScene();
  assert.equal(e.read().sceneReady,false);assert.equal(e.read().transitioning,false);assert.equal(e.$('#retry-scene').hidden,false);assert.ok(e.controls.every(n=>n.disabled));
  await e.startScene();assert.equal(e.read().sceneReady,true);assert.equal(e.$('#retry-scene').hidden,true);assert.ok(e.controls.every(n=>!n.disabled));
});
await test('Module import rejection falls back and unlocks retry',async()=>{
  const e=environment({webgl:['throw','success'],canvas:['throw']});await e.startScene();
  assert.equal(e.read().transitioning,false);assert.equal(e.$('#retry-scene').hidden,false);
  await e.startScene();assert.equal(e.read().sceneReady,true);
});
await test('Recovery failure followed by retry retains the last usable state',async()=>{
  const e=environment({webgl:['success','success'],canvas:['fail']});await e.startScene();
  const expected=setCustom(e.read().scene);e.instances[0].onReady(false);await flush();
  assert.equal(e.$('#retry-scene').hidden,false);assert.equal(e.read().sceneReady,false);
  await e.startScene();assert.equal(e.read().sceneReady,true);assert.deepEqual(snapshot(e.read().scene),expected);
});
console.log(JSON.stringify({passed:4-failures.length,failed:failures.length,failures},null,2));
process.exitCode=failures.length?1:0;
