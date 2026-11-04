import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const $=id=>document.getElementById(id);
const R=31.5,RM=12,flexColor=0xf4ae79,extendColor=0x87def4;
const round=(n,dec=1)=>Number(n).toFixed(dec).replace(".",",");
function lineTube(points,r,color){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(10,points.length*5),r,7,false),new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.02,transparent:color===0x93a8b5,opacity:color===0x93a8b5?.67:1}));
}
function arcTube(x,start,end,r,color){
  const n=Math.max(8,Math.ceil(Math.abs(end-start)*28)),points=[];
  for(let i=0;i<=n;i++){const t=start+(end-start)*i/n;points.push([x,r*Math.cos(t),r*Math.sin(t)]);}
  return lineTube(points,.99,color);
}
export function createDrive(scene){
  let angle=0,enabled=true,preview=false,ready=false,rotor=null,motor=null,layer=new THREE.Group(),cables=new THREE.Group();
  layer.name="V02 paired Bowden concept";scene.add(layer);layer.add(cables);
  function clearCables(){for(const obj of [...cables.children]){cables.remove(obj);obj.geometry?.dispose();obj.material?.dispose();}}
  function sheathCurve(x,side){
    return lineTube(side<0?[
      [41,-127,217],[43,-118,207],[49,-90,168],[55,-52,135],[x,side*R,79],[x,side*R,57]
    ]:[
      [47,-127,217],[49,-109,199],[55,-62,156],[62,7,116],[x,side*R,76],[x,side*R,57]
    ],2.5,0x93a8b5);
  }
  function updateCables(){
    if(!ready||(!enabled||preview))return;
    clearCables();
    cables.add(sheathCurve(55,-1),sheathCurve(63,1));
    cables.add(lineTube([[55,-R,43],[55,-R,0]],1.0,flexColor));
    cables.add(lineTube([[63,R,43],[63,R,0]],1.0,extendColor));
    const theta=THREE.MathUtils.degToRad(angle);
    // Flexion cable wrap shortens as the drum rotates; extension cable pays out equally.
    cables.add(arcTube(55,Math.PI,Math.PI+2.40-theta,R,flexColor));
    cables.add(arcTube(63,0,-.30-theta,R,extendColor));
  }
  function updateMetrics(){
    const load=Number($("driveLoad")?.value)||2,eta=Number($("driveEta")?.value)||.65;
    const arc=R*THREE.MathUtils.degToRad(angle),turns=arc/(2*Math.PI*RM),diff=1000*load/R,tauM=load*RM/(R*eta);
    if($("driveAngle"))$("driveAngle").textContent=String(angle);
    if($("driveStroke"))$("driveStroke").innerHTML=round(arc)+" <i>мм</i>";
    if($("driveTurns"))$("driveTurns").innerHTML=round(turns,3)+" <i>об.</i>";
    if($("driveForce"))$("driveForce").innerHTML=round(diff)+" <i>Н</i>";
    if($("driveMotorTorque"))$("driveMotorTorque").innerHTML=round(tauM,2)+" <i>Н·м</i>";
    if($("driveLoadText"))$("driveLoadText").textContent=round(load)+" Н·м";
    if($("driveEtaText"))$("driveEtaText").textContent=Math.round(eta*100)+"%";
  }
  function syncVisibility(){layer.visible=enabled&&!preview;}
  function setAngle(deg){
    const next=Math.min(120,Math.max(0,Math.round(Number(deg)||0)));
    const change=next!==angle;angle=next;
    if(rotor)rotor.rotation.x=-THREE.MathUtils.degToRad(angle);
    if(motor)motor.rotation.x=+THREE.MathUtils.degToRad(angle)*R/RM;
    if(change)updateCables();
    updateMetrics();
  }
  function setPreview(v){preview=!!v;syncVisibility();}
  function setEnabled(v){enabled=!!v;syncVisibility();if(enabled&&ready)updateCables();}
  if($("driveToggle"))$("driveToggle").addEventListener("change",e=>setEnabled(e.target.checked));
  for(const id of ["driveLoad","driveEta"])if($(id))$(id).addEventListener("input",updateMetrics);
  updateMetrics();
  new GLTFLoader().load("./drive_v02/files/Orthosis_V02_drive_concept.glb",gltf=>{
    const root=gltf.scene;
    let modelCount=0;
    root.traverse(o=>{
      if(!o.isMesh)return;modelCount++;
      const shades={B01:0xf4ae79,B02:0x68c8b4,B03:0xb4c8d1};
      o.material=new THREE.MeshStandardMaterial({
        color:shades[o.name]||0xd4e1de,roughness:.53,metalness:.18,side:THREE.DoubleSide
      });
    });
    rotor=root.getObjectByName("B01");motor=root.getObjectByName("B03");
    if(!rotor||!motor)throw Error("V02 component nodes B01/B03 not found");
    // The GLB uses world-positioned vertices. Move motor vertices to its own
    // pivot before rotating the motor spool about the real X-axis through y=-127,z=234.
    motor.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.geometry.translate(0,127,-234)}});
    motor.position.set(0,-127,234);
    layer.add(root);ready=true;
    updateCables();setAngle(angle);syncVisibility();
    if($("driveStatus"))$("driveStatus").textContent="V02: "+modelCount+" CAD-компонента, два маршрута троса · расчётная кинематика";
  },undefined,err=>{
    console.error("V02 model unavailable",err);
    if($("driveStatus"))$("driveStatus").textContent="V02: расчёт доступен, 3D-дополнение временно не загрузилось. Файлы доступны ниже.";
  });
  return {setAngle,setPreview,setEnabled};
}
