import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const $=id=>document.getElementById(id);
const catalog=[
["A01","Бедренная рама с неподвижной щекой",1,"frame","Опора шарнира, нижняя манжета"],
["A02","Голенная рама с подвижной ступицей",1,"frame","Две посадки под подшипники 608"],
["A03","Телескопическая вставка бедра",1,"frame","Регулировка длины бедра"],
["A04","Телескопическая вставка голени",1,"frame","Регулировка длины голени"],
["A05","Проксимальная бедренная манжета",1,"frame","Опора и крепление привода"],
["A06","Дистальная голенная манжета",1,"frame","Нижняя опора"],
["A07","Площадка привода",1,"other","Универсальная монтажная полка"],
["A08","Кожух привода",1,"other","Отдельный эскизный кожух"],
["A09","Сменный механический упор",2,"joint","Ограничение сгибания"],
["A10","Кольцо фиксации подшипника",2,"joint","Крепление обоймы 608"],
["A11","Корпус натяжителя троса M5",1,"cable","Основание ручной регулировки"],
["A12","Карман тензодатчика",1,"other","Опциональный стендовый образец"],
["A13","Звено защиты троса",5,"cable","Шарнирная защита"],
["A14","Крышка звена защиты",5,"cable","Фиксация на M3"],
["A15","Прямая гильза 140 мм",1,"cable","Направляющая оболочки"],
["A16","Прямая гильза 160 мм",1,"cable","Направляющая оболочки"],
["A17","Калибр посадок и отверстий",1,"other","Печатать первым: Ø22 и M3–M5"]
];
const printSize={A01:[199,224,141],A02:[162.4,228,102],A03:[160,24,8],A04:[170,24,8],A05:[187,138.8,44],A06:[150.4,102.8,44],A07:[88,62,44],A08:[94,68,50],A09:[9.4,14.1,8.9],A10:[34,34,2],A11:[36,34,20],A12:[40,25,14],A13:[23,28,12],A14:[23,12,3],A15:[140,10,10],A16:[160,10,10],A17:[110,36,10]};
function bedSize(){return [Number($("bedWidth").value)||220,Number($("bedDepth").value)||220]}
function fitsBed(code){const [w,d]=bedSize(),[x,y]=printSize[code];return ((x+10<=w&&y+10<=d)||(y+10<=w&&x+10<=d))}
function printFootprint(code){const [x,y,z]=printSize[code],ok=fitsBed(code);return '<div class="print-footprint"><span>STL: '+x+' × '+y+' × '+z+' мм</span><span class="'+(ok?'print-ok':'print-no')+'">'+(ok?'● Входит':'! Не входит')+'</span></div>'}
function bedSummary(){const good=catalog.filter(p=>fitsBed(p[0])).length;const [w,d]=bedSize();$("bedSummary").textContent=good+' / '+catalog.length+' моделей помещаются на стол '+w+' × '+d+' мм по габаритному прямоугольнику.';document.querySelectorAll("[data-bed]").forEach(b=>b.classList.toggle("active",Number(b.dataset.bed)===w&&w===d))}
const moveNames=new Set(["A02","A04","A06","A10_inner","A10_outer","A11","R01_a","R01_b","R03"]);
const guardNames=new Set(["A13_1","A13_2","A13_3","A13_4","A13_5","A14_1","A14_2","A14_3","A14_4","A14_5","A15","A16","R06"]);
const refNames=new Set(["R01_a","R01_b","R02","R03","R04","R05","R06"]);
let angle=0,playing=false,preview=null,assembly=null,filter="all",q="",token=0,phase=0;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x152733);scene.fog=new THREE.Fog(0x152733,850,1800);
const camera=new THREE.PerspectiveCamera(40,1,.2,4000);camera.position.set(620,240,640);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.65;
$("viewport").appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.target.set(0,0,45);orbit.minDistance=65;orbit.maxDistance=2200;
scene.add(new THREE.HemisphereLight(0xeefaf6,0x5f6c76,2.4));
const key=new THREE.DirectionalLight(0xffffff,2.9);key.position.set(330,430,470);scene.add(key);
const rim=new THREE.DirectionalLight(0x96cfcf,1.6);rim.position.set(-350,170,-420);scene.add(rim);
const matFixed=new THREE.MeshStandardMaterial({color:0x94d9c2,roughness:.56,metalness:.1,side:THREE.DoubleSide});
const matMoving=new THREE.MeshStandardMaterial({color:0xeca27d,roughness:.52,metalness:.12,side:THREE.DoubleSide});
const matMetal=new THREE.MeshStandardMaterial({color:0xb4c4d0,roughness:.38,metalness:.62,side:THREE.DoubleSide});
const matGuard=new THREE.MeshStandardMaterial({color:0x789baa,roughness:.63,metalness:.04,side:THREE.DoubleSide});
const matAccent=new THREE.MeshStandardMaterial({color:0xf0ce91,roughness:.54,metalness:.12,side:THREE.DoubleSide});
function appearanceFor(mesh){let node=mesh;while(node&&!/^[AR]\d{2}/.test(node.name||""))node=node.parent;const name=node?.name||mesh.name||"";if(name.startsWith("R")||name.startsWith("A10"))return matMetal;if(name.startsWith("A13")||name.startsWith("A14")||name.startsWith("A15")||name.startsWith("A16"))return matGuard;if(name.startsWith("A09")||name.startsWith("A11"))return matAccent;return moveNames.has(name)?matMoving:matFixed}
const grid=new THREE.GridHelper(1200,28,0x426471,0x2c4550);grid.position.y=-295;scene.add(grid);
function resize(){const host=$("viewport"),w=host.clientWidth,h=host.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h)}new ResizeObserver(resize).observe($("viewport"));resize();
function loading(txt,sub){$("loading").classList.remove("hide");$("loading").innerHTML='<span class="spin"></span><b>'+txt+'</b><small>'+sub+'</small>'}
function loaded(){$("loading").classList.add("hide")}
function fit(obj){if(!obj)return;const box=new THREE.Box3().setFromObject(obj);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const m=Math.max(size.x,size.y,size.z);let d=m/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.80;camera.position.copy(center).add(new THREE.Vector3(.8*d,.38*d,.9*d));orbit.target.copy(center);orbit.update()}
function visibility(){if(!assembly)return;assembly.traverse(o=>{if(guardNames.has(o.name))o.visible=angle===0&&$("cable").checked;else if(refNames.has(o.name))o.visible=$("refs").checked})}
function setAngle(v){angle=Math.max(0,Math.min(120,Number(v)||0));$("angle").value=angle;$("angleText").textContent=Math.round(angle);document.querySelectorAll("[data-a]").forEach(x=>x.classList.toggle("active",Number(x.dataset.a)===angle));if(assembly){assembly.traverse(o=>{if(moveNames.has(o.name))o.rotation.x=-angle*Math.PI/180});visibility()}
$("caution").textContent=angle>0?"!  Движение рам — кинематическая демонстрация. Защита троса скрыта: её траектория не разработана. Геометрия проверена только при 0/30/60/90/120°, не в непрерывном движении.":"!  Показан поворот рам в шарнире. Привод, усилия и движение троса не симулируются. V01 не предназначена для эксплуатации на человеке."}
// Reduce individual CAD surface primitives to one renderable mesh per part when possible.
// Keep component nodes, positions and names intact so hinge movement remains precise.
function optimizeCAD(root){
 root.updateMatrixWorld(true);
 const candidates=[];
 root.traverse(o=>{if(o.name&&/^[AR]\d{2}(?:_|$)/.test(o.name)&&!o.isMesh)candidates.push(o)});
 for(const node of candidates){
   const meshes=[];node.traverse(o=>{if(o.isMesh)meshes.push(o)});
   if(meshes.length<2)continue;
   const material=meshes[0].material;
   if(Array.isArray(material)||meshes.some(m=>Array.isArray(m.material)||m.material!==material))continue;
   const inv=node.matrixWorld.clone().invert();
   const pieces=meshes.map(m=>{const g=m.geometry.clone();g.applyMatrix4(inv.clone().multiply(m.matrixWorld));return g});
   const joined=mergeGeometries(pieces,false);
   pieces.forEach(g=>g.dispose());
   if(!joined)continue;
   meshes.forEach(m=>m.parent.remove(m));
   const single=new THREE.Mesh(joined,material);single.name=node.name+"__combined";
   node.add(single);
 }
}
function loadAssembly(){loading("Загрузка инженерной модели","Точная 3D-геометрия из CAD");new GLTFLoader().load("./files/Orthosis_V01_assembly.glb",gltf=>{assembly=gltf.scene;optimizeCAD(assembly);scene.add(assembly);assembly.traverse(o=>{if(o.isMesh){o.material=appearanceFor(o)}});visibility();setAngle(angle);fit(assembly);loaded();$("stageStatus").textContent="31 CAD ТЕЛО";if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){playing=true;phase=0;updatePlay()}},event=>{if(event.lengthComputable&&event.total){const s=$("loading").querySelector("small");if(s)s.textContent="Загружено "+Math.round(event.loaded/event.total*100)+"% · "+(event.total/1024/1024).toFixed(1)+" МБ"}},e=>{console.error(e);loading("Файл 3D-сборки не найден","Дождитесь завершения публикации файлов на GitHub");$("stageStatus").textContent="ОЖИДАНИЕ GLB"})}
function releasePreview(){if(preview){scene.remove(preview);preview.traverse(o=>o.geometry&&o.geometry.dispose());preview=null}}
function mode(single){$("angle").disabled=!!single;$("play").disabled=!!single;$("cable").disabled=!!single;$("refs").disabled=!!single;document.querySelectorAll("[data-a]").forEach(x=>x.disabled=!!single);if(assembly)assembly.visible=!single}
function returnToAssembly(){token++;releasePreview();mode(false);$("viewLabel").textContent="СБОРКА / 3D";$("stageStatus").textContent="31 CAD ТЕЛО";document.querySelectorAll(".pcard").forEach(x=>x.style.borderColor="");if(assembly)fit(assembly);else loadAssembly();loaded()}
function showPart(code){let current=++token;playing=false;updatePlay();releasePreview();mode(true);$("viewLabel").textContent="ДЕТАЛЬ / "+code;$("stageStatus").textContent="STL / ММ";document.querySelectorAll(".pcard").forEach(x=>x.style.borderColor=x.dataset.code===code?"#67b6a2":"");loading("Загрузка "+code+".stl","Нормализованная ориентация для печати");
new STLLoader().load("./files/STL/"+code+".stl",geometry=>{if(current!==token){geometry.dispose();return}geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x8dd5c1,metalness:.08,roughness:.49,side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;preview=new THREE.Group();preview.add(mesh);scene.add(preview);fit(preview);loaded();location.hash="model"},undefined,e=>{console.error(e);loading("Нет файла "+code+".stl","Проверьте публикацию STL в репозитории")})}
function cards(){bedSummary();let list=catalog.filter(p=>(filter==="all"||p[3]===filter)&&p.join(" ").toLowerCase().includes(q));$("partGrid").innerHTML=list.length?list.map(p=>'<article class="pcard" data-code="'+p[0]+'"><div class="part-top"><span>'+p[0]+'</span><span>×'+p[2]+' ШТ.</span></div><h3>'+p[1]+'</h3><p>'+p[4]+'</p>'+printFootprint(p[0])+'<div class="part-actions"><button data-view="'+p[0]+'">3D ВИД ↗</button><a href="./files/STL/'+p[0]+'.stl" download>STL ↓</a><a href="./files/STEP/'+p[0]+'.step" download>STEP ↓</a></div></article>').join(""):'<p>Ничего не найдено.</p>';document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>showPart(b.dataset.view))}
function updatePlay(){$("play").textContent=playing?"Ⅱ Пауза":"▶ Анимация"}
$("angle").oninput=e=>{playing=false;updatePlay();setAngle(e.target.value)};document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{playing=false;updatePlay();setAngle(b.dataset.a)});
$("play").onclick=()=>{playing=!playing;updatePlay()};$("back").onclick=returnToAssembly;$("resetBtn").onclick=()=>{if(preview)returnToAssembly();playing=false;updatePlay();setAngle(0);fit(assembly)};$("fitBtn").onclick=()=>fit(preview||assembly);
$("gridBtn").onclick=()=>{grid.visible=!grid.visible;$("gridBtn").setAttribute("aria-pressed",String(grid.visible))};$("cable").onchange=visibility;$("refs").onchange=visibility;
document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filter=b.dataset.f;document.querySelectorAll("[data-f]").forEach(x=>x.classList.toggle("active",x===b));cards()});$("search").oninput=e=>{q=e.target.value.trim().toLowerCase();cards()};
for(const id of ["bedWidth","bedDepth"])$(id).addEventListener("input",()=>cards());
document.querySelectorAll("[data-bed]").forEach(b=>b.addEventListener("click",()=>{$("bedWidth").value=b.dataset.bed;$("bedDepth").value=b.dataset.bed;cards()}));
let last=0;let stageVisible=true;const stageObserver=new IntersectionObserver(entries=>{stageVisible=entries[0].isIntersecting},{rootMargin:"120px"});stageObserver.observe($("model"));function frame(t){if(document.hidden||!stageVisible){last=t;return}const dt=Math.min((t-last)/1000||0,.05);last=t;if(playing&&!preview){phase+=dt*1.15;setAngle(Math.round(60-60*Math.cos(phase)))}orbit.update();renderer.render(scene,camera)}renderer.setAnimationLoop(frame);cards();loadAssembly();