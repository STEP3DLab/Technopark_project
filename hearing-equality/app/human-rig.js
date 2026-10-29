import * as T from './vendor/three.module.min.js';

// Original, reusable 3D character. Every surface carries skinIndex/skinWeight.
// The model has a genuine articulated skeleton, including 3 phalanges per digit.
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
export function createHumanRig(){
  const group=new T.Group();group.name='RGSU_Communicator';
  const bones=[],joints={},rest=new Map(),meshes=[];
  function bone(name,parent,world){
    const b=new T.Bone();b.name=name;b.position.copy(world);
    if(parent)b.position.sub(rest.get(parent.name));
    (parent||group).add(b);joints[name]=b;rest.set(name,world.clone());bones.push(b);return b;
  }
  const root=bone('Root',null,v()),hips=bone('Hips',root,v(0,.96)),spine=bone('Spine',hips,v(0,1.14)),chest=bone('Chest',spine,v(0,1.37));
  const neck=bone('Neck',chest,v(0,1.53)),head=bone('Head',neck,v(0,1.63));
  const arms={},fingers={};
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const clavicle=bone(side+'Clavicle',chest,v(sign*.085,1.43));
    const upper=bone(side+'UpperArm',clavicle,v(sign*.235,1.43));
    const lower=bone(side+'Forearm',upper,v(sign*.285,1.13));
    const wrist=bone(side+'Hand',lower,v(sign*.325,.86));
    arms[side]={upper,lower,wrist,sign,clavicle};fingers[side]=[];
    const digits=[['Thumb',.048,-.023,.018,[.031,.025,.022]],['Index',.030,-.090,0,[.037,.025,.019]],['Middle',.007,-.101,0,[.042,.027,.020]],['Ring',-.016,-.094,0,[.038,.025,.019]],['Pinky',-.038,-.079,0,[.029,.021,.017]]];
    for(const [name,x,y,z,lengths] of digits){
      const base=rest.get(wrist.name).clone().add(v(sign*x,y,z)),chain=[];let parent=wrist,pos=base.clone();
      for(let i=0;i<4;i++){const b=bone(`${side}${name}${i+1}`,parent,pos);chain.push(b);parent=b;if(i<3)pos=pos.clone().add(v(name==='Thumb'?sign*lengths[i]*.58:0,-lengths[i],name==='Thumb'?.003:0));}
      fingers[side].push({name,chain,lengths,base});
    }
    const thigh=bone(side+'UpperLeg',hips,v(sign*.095,.94)),shin=bone(side+'LowerLeg',thigh,v(sign*.100,.52)),foot=bone(side+'Foot',shin,v(sign*.100,.12));bone(side+'Toe',foot,v(sign*.100,.06,.14));
  }
  group.updateMatrixWorld(true);
  const skeleton=new T.Skeleton(bones),boneIndex=b=>bones.indexOf(b);
  const materials={
    skin:new T.MeshStandardMaterial({color:0xd9a587,roughness:.61,metalness:0}),
    shirt:new T.MeshStandardMaterial({color:0x294c80,roughness:.86}),
    seam:new T.MeshStandardMaterial({color:0x18345b,roughness:.9}),
    pants:new T.MeshStandardMaterial({color:0x273447,roughness:.95}),
    shoe:new T.MeshStandardMaterial({color:0x172438,roughness:.7}),
    hair:new T.MeshStandardMaterial({color:0x30261f,roughness:.92}),
    white:new T.MeshStandardMaterial({color:0xf7eee8,roughness:.45}),
    iris:new T.MeshStandardMaterial({color:0x547a83,roughness:.4}),
    pupil:new T.MeshStandardMaterial({color:0x14232b,roughness:.25}),
    lips:new T.MeshStandardMaterial({color:0xa96d60,roughness:.68}),
    badge:new T.MeshStandardMaterial({color:0xb7d3ef,metalness:.25,roughness:.45}),
  };
  function skin(geometry,material,weight,name){
    const count=geometry.attributes.position.count,indices=[],weights=[],point=v();
    for(let i=0;i<count;i++){
      point.fromBufferAttribute(geometry.attributes.position,i);
      const values=typeof weight==='function'?weight(point):[[weight,1]];
      for(let j=0;j<4;j++){indices.push(values[j]?boneIndex(values[j][0]):0);weights.push(values[j]?.[1]||0);}
    }
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const mesh=new T.SkinnedMesh(geometry,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);mesh.bind(skeleton);meshes.push(mesh);return mesh;
  }
  function ellipsoid(name,center,size,material,b,segments=28){const g=new T.SphereGeometry(1,segments,20);g.scale(...size);g.translate(...center);return skin(g,material,b,name);}
  function loft(rings,sides=36){
    const pos=[],idx=[];
    for(const [y,rx,rz,cx=0,cz=0] of rings)for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2;pos.push(cx+Math.cos(a)*rx,y,cz+Math.sin(a)*rz);}
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;if(rings.at(-1)[0]>=rings[0][0])idx.push(a,b,a+1,b,b+1,a+1);else idx.push(a,a+1,b,b,a+1,b+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  const torsoWeights=p=>{const t=smooth((p.y-1.10)/.28);return[[spine,1-t],[chest,t]];};
  skin(loft([[.94,.15,.084],[.955,.163,.09],[1.01,.161,.088],[1.10,.156,.088],[1.19,.174,.103],[1.31,.207,.11],[1.39,.231,.102],[1.44,.223,.091],[1.49,.157,.075],[1.525,.059,.047],[1.53,.051,.043]]),materials.shirt,torsoWeights,'Shirt');
  skin(loft([[1.49,.048,.043],[1.52,.046,.041],[1.57,.043,.040],[1.63,.052,.043]]),materials.skin,neck,'NeckSurface');
  skin(loft([[1.603,.033,.037,0,.002],[1.623,.063,.055,0,.005],[1.659,.083,.071],[1.70,.097,.085],[1.75,.104,.091],[1.80,.103,.091],[1.85,.092,.085],[1.89,.065,.063],[1.913,.016,.019],[1.916,0,0]]),materials.skin,head,'HeadSurface');
  // Three-dimensional facial anatomy, including separate eyelids and eyes.
  for(const sign of [-1,1]){
    ellipsoid('Ear',[sign*.105,1.747,0],[.020,.033,.013],materials.skin,head);
    ellipsoid('EarInner',[sign*.117,1.747,.006],[.007,.019,.007],materials.lips,head,16);
    ellipsoid('UpperLid',[sign*.039,1.792,.083],[.023,.006,.009],materials.skin,head);
    ellipsoid('EyeWhite',[sign*.039,1.783,.090],[.018,.008,.007],materials.white,head);
    ellipsoid('Iris',[sign*.039,1.784,.099],[.006,.006,.0028],materials.iris,head,20);
    ellipsoid('Pupil',[sign*.039,1.784,.101],[.003,.0035,.0015],materials.pupil,head,16);
    ellipsoid('EyeHighlight',[sign*.037,1.787,.103],[.0015,.0015,.0008],materials.white,head,12);
    const brow=ellipsoid('Brow',[sign*.039,1.807,.087],[.025,.004,.006],materials.hair,head,20);
    // Eye and cheek geometry remains attached to the head bone during motion.

  }
  ellipsoid('NoseBridge',[0,1.765,.091],[.010,.028,.013],materials.skin,head);
  ellipsoid('NoseTip',[0,1.741,.112],[.014,.010,.010],materials.skin,head);
  for(const sign of [-1,1])ellipsoid('NoseWing',[sign*.012,1.736,.103],[.009,.007,.009],materials.skin,head,16);
  ellipsoid('UpperLip',[0,1.704,.085],[.031,.0045,.008],materials.lips,head);
  ellipsoid('LowerLip',[0,1.696,.086],[.027,.0055,.007],materials.lips,head);
  ellipsoid('MouthLine',[0,1.700,.092],[.025,.0015,.0015],materials.hair,head,20);
  const hairGeo=new T.SphereGeometry(1,40,24,0,Math.PI*2,0,1.37);hairGeo.scale(.118,.165,.108);hairGeo.translate(0,1.77,-.002);skin(hairGeo,materials.hair,head,'HairCap');
  for(const sign of [-1,1])ellipsoid('SideHair',[sign*.095,1.801,-.012],[.012,.042,.052],materials.hair,head);
  const collar=new T.TorusGeometry(.052,.007,10,40);collar.rotateX(Math.PI/2);collar.scale(1,1,.84);collar.translate(0,1.526,0);skin(collar,materials.seam,chest,'Collar');
  ellipsoid('ChestEmblem',[-.106,1.344,.104],[.014,.021,.004],materials.badge,chest,16);
  function tube(start,end,radii,weight,material,name){
    const direction=end.clone().sub(start),length=direction.length(),rings=24,sides=16,position=[],index=[];
    const q=new T.Quaternion().setFromUnitVectors(v(0,1,0),direction.clone().normalize());
    for(let i=0;i<=rings;i++){
      const t=i/rings,r=typeof radii==='function'?radii(t):radii[0]*(1-t)+radii[1]*t;
      for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2,p=v(Math.cos(a)*r,t*length,Math.sin(a)*r).applyQuaternion(q).add(start);position.push(p.x,p.y,p.z);}
    }
    for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;index.push(a,b,a+1,b,b+1,a+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));g.setIndex(index);g.computeVertexNormals();return skin(g,material,weight,name);
  }
  const handMeshes={Left:[],Right:[]};
  for(const [side,{upper,lower,wrist,sign}] of Object.entries(arms)){
    const a=rest.get(upper.name),b=rest.get(lower.name),c=rest.get(wrist.name);
    const jointBlend=p=>{const t=smooth((1.17-p.y)/.085);return[[upper,1-t],[lower,t]];};
    tube(a,b,[.055,.037],jointBlend,materials.skin,side+'ArmSkin');
    tube(b,c,t=>.037+.008*Math.sin(t*Math.PI)-.012*t,jointBlend,materials.skin,side+'ForearmSkin');
    ellipsoid(side+'Elbow',b.toArray(),[.037,.038,.037],materials.skin,jointBlend);
    const end=a.clone().lerp(b,.50);tube(a.clone().add(v(0,.025,0)),end,[.067,.057],upper,materials.shirt,side+'Sleeve');
    ellipsoid(side+'Shoulder',[sign*.223,1.415,0],[.051,.058,.062],materials.shirt,upper);
    const palm=skin(loft([[c.y+.015,.022,.019,c.x],[c.y-.01,.026,.019,c.x],[c.y-.04,.043,.021,c.x],[c.y-.075,.047,.019,c.x],[c.y-.102,.039,.015,c.x],[c.y-.109,.026,.010,c.x]],24),materials.skin,wrist,side+'Palm');handMeshes[side].push(palm);
    for(const {name,chain} of fingers[side]){
      const radius=name==='Thumb'?.014:name==='Pinky'?.010:.012;
      for(let i=0;i<3;i++){
        const start=rest.get(chain[i].name),end=rest.get(chain[i+1].name),r=radius*(1-i*.13);
        const mesh=tube(start,end,t=>r*(1-.12*t),chain[i],materials.skin,`${side}${name}Surface${i}`);handMeshes[side].push(mesh);
        handMeshes[side].push(ellipsoid(`${side}${name}Joint${i}`,start.toArray(),[r,r,r*.88],materials.skin,chain[i],16));
        if(i===2)handMeshes[side].push(ellipsoid(`${side}${name}Tip`,end.toArray(),[r*.87,r*.85,r*.78],materials.skin,chain[i],16));
      }
    }
    const thigh=joints[side+'UpperLeg'],shin=joints[side+'LowerLeg'],foot=joints[side+'Foot'];
    tube(rest.get(thigh.name),rest.get(shin.name),[.082,.058],thigh,materials.pants,side+'TrouserUpper');
    tube(rest.get(shin.name),rest.get(foot.name),[.058,.042],shin,materials.pants,side+'TrouserLower');
    ellipsoid(side+'Shoe',[sign*.1,.068,.065],[.057,.056,.124],materials.shoe,foot);
  }
  skin(loft([[.88,.14,.084],[.93,.16,.091],[.975,.16,.092]]),materials.pants,hips,'Waist');
  group.updateMatrixWorld(true);skeleton.calculateInverses();
  const helper=new T.SkeletonHelper(group);helper.name='VisibleSkeleton';helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.92;helper.visible=false;helper.renderOrder=20;
  const restRotations=new Map(bones.map(b=>[b.name,b.quaternion.clone()]));
  return {group,bones,joints,skeleton,rest,restRotations,meshes,materials,arms,fingers,handMeshes,helper,
    setOutfit(name){materials.shirt.color.set({indigo:0x294c80,teal:0x35716c,slate:0x56657c}[name]??0x294c80);},
    dispose(){for(const mesh of meshes)mesh.geometry.dispose();for(const material of Object.values(materials))material.dispose();skeleton.dispose();helper.geometry.dispose();helper.material.dispose();},
  };
}
