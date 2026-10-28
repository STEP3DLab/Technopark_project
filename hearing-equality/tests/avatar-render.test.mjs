import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {CanvasAvatar} from '../app/canvas-avatar.js';

test('all six recordings render at 60Hz in both scenes without invalid canvas geometry',()=>{
 const context=new Proxy({}, {get:(o,key)=>{
  if(key in o)return o[key];
  if(String(key).startsWith('create'))return (...args)=>{assert.ok(args.every(Number.isFinite));return{addColorStop(t){assert.ok(t>=0&&t<=1)}}};
  return(...args)=>{for(const x of args)if(typeof x==='number')assert.ok(Number.isFinite(x),`${String(key)} contains a nonfinite coordinate`);if(key==='arc')assert.ok(args[2]>=0);if(key==='ellipse')assert.ok(args[2]>=0&&args[3]>=0)};
 }});
 const previous={document:globalThis.document,window:globalThis.window,ResizeObserver:globalThis.ResizeObserver};
 globalThis.document={createElement:()=>({style:{},setAttribute(){},getContext:()=>context,remove(){}})};
 globalThis.window={devicePixelRatio:2};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 try{
  let visible=true,size={width:480,height:310};const container={style:{},dataset:{},append(){},getBoundingClientRect:()=>visible?size:{width:0,height:0}};
  const avatar=new CanvasAvatar(container),root=new URL('../app/assets/motion/',import.meta.url);
  for(const viewport of [{width:480,height:310},{width:320,height:420},{width:170,height:365}]){size=viewport;avatar.resize();for(const file of readdirSync(root).filter(f=>f.endsWith('.json'))){const clip=JSON.parse(readFileSync(new URL(file,root)));avatar.load(clip);for(const theme of ['light','dark']){avatar.setScene(theme);for(let t=0;t<=clip.duration;t+=1/60)avatar.showAt(t);}}}
  visible=false;avatar.resize();avatar.showAt(.2);visible=true;avatar.resize();assert.ok(avatar.frame);
  avatar.clear();avatar.showAt(.5);assert.equal(avatar.frame,null);assert.equal(avatar.note.hidden,true);
  avatar.dispose();
 }finally{Object.assign(globalThis,previous)}
});
