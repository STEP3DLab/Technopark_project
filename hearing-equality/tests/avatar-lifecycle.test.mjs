import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CanvasAvatar} from '../app/canvas-avatar.js';
import {sampleMotion} from '../app/avatar-motion.js';
const clip=JSON.parse(readFileSync(new URL('../app/assets/motion/cc59e1b2-5778-47bb-a452-779033da61b0.json',import.meta.url)));

function fixture(run){
 const previous={document:globalThis.document,window:globalThis.window,ResizeObserver:globalThis.ResizeObserver};
 let width=340,height=420,bitmapWrites=0,bufferWidth=0,bufferHeight=0;
 const context=new Proxy({}, {get:(o,k)=>k in o?o[k]:String(k).startsWith('create')?()=>({addColorStop(){}}):()=>{}});
 const canvas={style:{},setAttribute(){},getContext:()=>context,remove(){},
  get width(){return bufferWidth},set width(v){bufferWidth=v;bitmapWrites++},get height(){return bufferHeight},set height(v){bufferHeight=v;bitmapWrites++}};
 globalThis.document={createElement:tag=>tag==='canvas'?canvas:{style:{},remove(){}}};
 globalThis.window={devicePixelRatio:1};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 const container={style:{},dataset:{},append(){},getBoundingClientRect:()=>({width,height})};
 let avatar;
 try{avatar=new CanvasAvatar(container);avatar.load(clip);run({avatar,canvas,setSize:(w,h)=>{width=w;height=h},writes:()=>bitmapWrites});}
 finally{avatar?.dispose();Object.assign(globalThis,previous);}
}

test('hidden scene defers interpolation and displays the latest requested time when shown',()=>fixture(({avatar,setSize})=>{
 const frame=avatar.frame;let reads=0;
 avatar.track=new Proxy(avatar.track,{get(o,k){if(k==='frames')reads++;return o[k]}});
 setSize(0,0);avatar.resize();avatar.showAt(.2);avatar.showAt(.7);
 assert.equal(reads,0);assert.strictEqual(avatar.frame,frame);assert.equal(avatar.time,.7);
 setSize(340,420);avatar.resize();assert.ok(reads>0);
 assert.deepEqual(avatar.frame,sampleMotion(avatar.track,.7,{smooth:true}));
}));

test('same-size resize keeps the bitmap, while DPR and size changes update it',()=>fixture(({avatar,canvas,setSize,writes})=>{
 const before=writes();avatar.resize();avatar.resize();assert.equal(writes(),before);
 globalThis.window.devicePixelRatio=2;avatar.resize();assert.equal(canvas.width,680);assert.equal(canvas.height,840);
 assert.equal(writes(),before+2);avatar.resize();assert.equal(writes(),before+2);
 setSize(400,420);avatar.resize();assert.equal(canvas.width,800);assert.equal(writes(),before+3);
}));

test('repeated still frame is reused but loading a different recording invalidates it',()=>fixture(({avatar})=>{
 let reads=0;avatar.track=new Proxy(avatar.track,{get(o,k){if(k==='frames')reads++;return o[k]}});
 avatar.showAt(.4);const frame=avatar.frame,before=reads;avatar.showAt(.4);
 assert.strictEqual(avatar.frame,frame);assert.equal(reads,before);
 const different=structuredClone(clip);different.frames[0].pose[11][0]+=.01;
 avatar.load(different);assert.notStrictEqual(avatar.frame,frame);
 assert.equal(avatar.frame.pose[11][0],different.frames[0].pose[11][0]);
 avatar.clear();assert.equal(avatar.sampledTime,null);assert.equal(avatar.frame,null);
}));

test('closed recorded eyelids stay a closed contour rather than a minimum-height ellipse',()=>fixture(({avatar})=>{
 const polygon=[];let ellipses=0;
 avatar.ctx.moveTo=(x,y)=>polygon.push([x,y]);avatar.ctx.lineTo=(x,y)=>polygon.push([x,y]);avatar.ctx.ellipse=()=>ellipses++;
 avatar.drawEye([[0,10],[3,10],[7,10],[10,10],[7,10],[3,10]],40);
 assert.equal(ellipses,0);assert.ok(polygon.length>=6);assert.ok(polygon.every(p=>p[1]===10));
}));

// A still frame must immediately reflect the chosen presentation mode.
test('smoothing can be toggled at the same timestamp without moving the playback position',()=>fixture(({avatar})=>{
 avatar.showAt(.45);const time=avatar.time;
 assert.equal(avatar.smoothing,true);
 avatar.setSmoothing(false);assert.equal(avatar.time,time);
 assert.deepEqual(avatar.frame,sampleMotion(avatar.track,time));
 avatar.setSmoothing(true);assert.equal(avatar.time,time);
 assert.deepEqual(avatar.frame,sampleMotion(avatar.track,time,{smooth:true}));
 assert.equal(avatar.container.dataset.smoothing,'smooth');
}));
