import {mkdir,writeFile} from 'node:fs/promises';
import {createHumanRig} from '../app/human-rig.js';
import {GLTFExporter} from './vendor/GLTFExporter.js';
// No browser or textures are required for exporting the original bind-pose rig.
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.();});}
};
const rig=createHumanRig();
rig.group.userData={description:'Original RGSU human communicator; 62 bones, fully skinned surfaces. Bind pose for Blender/Unity. Gesture motion is retargeted in the web application.',license:'MIT; model geometry authored for this project.'};
const buffer=await new GLTFExporter().parseAsync(rig.group,{binary:true,trs:true,onlyVisible:false});
const target=new URL('../app/assets/models/rgsu-human-rig.glb',import.meta.url);
await mkdir(new URL('../app/assets/models/',import.meta.url),{recursive:true});await writeFile(target,Buffer.from(buffer));
console.log(JSON.stringify({path:target.pathname,bytes:buffer.byteLength,bones:rig.bones.length,skinnedMeshes:rig.meshes.length}));rig.dispose();
