import * as T from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export const STOCK_AVATAR_URL = new URL('./assets/models/quaternius-communicator.glb',import.meta.url);
let assetPromise;
export function fetchStockAsset(){
  if(!assetPromise){const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    assetPromise=fetch(STOCK_AVATAR_URL,{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Модель недоступна');return r.arrayBuffer();}).catch(e=>{assetPromise=null;throw e;}).finally(()=>clearTimeout(timer));}
  return assetPromise;
}
export async function loadStockRig(){return parseStockRig(await fetchStockAsset());}
export async function parseStockRig(buffer){const gltf=await new GLTFLoader().parseAsync(buffer,'');return adaptStockRig(gltf.scene);}
export function adaptStockRig(group){
  const bones=[],meshes=[],byName={},rest=new Map(),restRotations=new Map(),restWorld=new Map();
  group.traverse(o=>{if(o.isBone){bones.push(o);byName[o.name]=o;}if(o.isSkinnedMesh){meshes.push(o);o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  group.updateMatrixWorld(true);
  for(const b of bones){rest.set(b.name,b.getWorldPosition(new T.Vector3()));restRotations.set(b.name,b.quaternion.clone());restWorld.set(b.name,b.getWorldQuaternion(new T.Quaternion()));}
  const required=['Head','neck_01','spine_03','pelvis','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r'];
  for(const name of required)if(!byName[name])throw new Error('В модели отсутствует кость: '+name);
  const joints={Head:byName.Head,Neck:byName.neck_01,Chest:byName.spine_03,Hips:byName.pelvis},arms={},fingers={},handMeshes={};
  for(const [side,suffix,sign] of [['Left','l',1],['Right','r',-1]]){
    arms[side]={upper:byName['upperarm_'+suffix],lower:byName['lowerarm_'+suffix],wrist:byName['hand_'+suffix],clavicle:byName['clavicle_'+suffix],sign};
    fingers[side]=['thumb','index','middle','ring','pinky'].map(name=>({name,chain:[1,2,3,4].map(i=>{const key=`${name}_0${i}${i===4?'_leaf':''}_${suffix}`;if(!byName[key])throw new Error('В модели отсутствует фаланга: '+key);return byName[key];})}));
    handMeshes[side]=meshes.filter(m=>m.name===side+'Hand');
  }
  const skeletons=[...new Set(meshes.map(m=>m.skeleton))];
  const helper=new T.SkeletonHelper(group);helper.visible=false;helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.75;helper.renderOrder=20;
  const materials=[...new Set(meshes.map(m=>m.material))];
  const reset=()=>{for(const b of bones)b.quaternion.copy(restRotations.get(b.name));for(const m of meshes)m.visible=true;group.updateMatrixWorld(true);skeletons.forEach(s=>s.update());};
  const shoulderCenter=rest.get('upperarm_l').clone().add(rest.get('upperarm_r')).multiplyScalar(.5),shoulderWidth=rest.get('upperarm_l').distanceTo(rest.get('upperarm_r'));
  return {group,bones,meshes,joints,byName,arms,fingers,rest,restRotations,restWorld,handMeshes,skeletons,skeleton:skeletons[0],helper,shoulderCenter,shoulderWidth,reset,
    setOutfit(name){const shirt=materials.find(m=>m.name==='RGSU_Navy_Shirt');shirt?.color.set({indigo:0x29456c,teal:0x2e6964,slate:0x596778}[name]||0x29456c);},
    dispose(){for(const g of new Set(meshes.map(m=>m.geometry)))g.dispose();materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());helper.geometry.dispose();helper.material.dispose();},
  };
}
