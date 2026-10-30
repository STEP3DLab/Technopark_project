// Headless CPU rasterizer benchmark; not a browser/GPU/phone FPS claim.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import * as T from '../app/vendor/three.module.min.js';
import {parseStockRig} from '../app/stock-rig.js';
import {prepareStockMotion,applyStockMotion} from '../app/stock-motion.js';
import {Software3DRenderer} from '../app/software-3d.js';
const bytes=readFileSync(new URL('../app/assets/models/quaternius-communicator.glb',import.meta.url));
const rig=await parseStockRig(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const manifest=JSON.parse(readFileSync(new URL('../app/assets/sources/slovo-sources.json',import.meta.url)));
const scene=new T.Scene();scene.add(rig.group);
const camera=new T.PerspectiveCamera(32,845/376,.05,30);camera.position.set(0,1.34,1.88);camera.lookAt(0,1.34,0);
const renderer=new Software3DRenderer({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})});renderer.setSize(845,376);
const results=[];
for(const sample of manifest.samples){
 const motion=JSON.parse(readFileSync(new URL('../app/assets/motion/'+sample.file.replace('.mp4','.json'),import.meta.url)));
 const start=performance.now(),track=prepareStockMotion(rig,motion),prepareMs=performance.now()-start,frames=[];
 for(let i=0;i<65;i++){const t=performance.now();applyStockMotion(rig,track,(i/64)*motion.duration);renderer.render(scene,camera);if(i>4)frames.push(performance.now()-t);}
 frames.sort((a,b)=>a-b);results.push({word:sample.text||sample.label||sample.id,prepareMs:+prepareMs.toFixed(2),medianCPUFrameMs:+frames[30].toFixed(2),p95CPUFrameMs:+frames[57].toFixed(2)});
}
console.log(JSON.stringify({node:process.version,bitmap:[renderer.w,renderer.h],modelBytes:bytes.length,results},null,2));renderer.dispose();rig.dispose();
