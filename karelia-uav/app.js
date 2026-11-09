import {analyze} from "./vision.mjs";
import {makeMap} from "./map.js";
const $=s=>document.querySelector(s);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const beforeUrl="./assets/flight-before.webp",afterUrl="./assets/flight-after.webp";
const demoPoints=[
 {id:"k44",title:"Перелив у водопропускной трубы",km:44,lat:66.005,lon:31.347,status:"pending",before:beforeUrl,after:afterUrl,description:"Учебная съёмка. Сравните состояние полотна у трубы и проверьте участок, который выделил алгоритм."},
 {id:"k60",title:"Контрольный участок",km:60,lat:66.043,lon:31.123,status:"reviewed",before:beforeUrl,after:beforeUrl,description:"Контрольный тест: один учебный кадр подан дважды. На такой паре алгоритм должен показать ноль изменений."},
 {id:"k63",title:"Подъезд к посёлку",km:63,lat:66.055,lon:31.081,status:"empty",description:"В этой учебной точке съёмка ещё не проведена. Для самостоятельного обследования откройте форму загрузки пары снимков."}
].map(x=>({...x,source:"demo"}));
const names={pending:"На проверке",reviewed:"Проверено",ticket:"В работе",closed:"Завершено",empty:"Нет съёмки"};
let db=null,memory=new Map(),rows=[],selectedId="k44",view="monitor",toastTimer,formPoint=null,uploadBusy=false;
const exportUrls=new Map();
const modelResults=new Map(),memoryFlag="Хранилище браузера недоступно. Изменения сохранятся только до закрытия страницы.";
const channel=typeof BroadcastChannel==="function"?new BroadcastChannel("karelia-road-monitor-v1"):null;
const drawMap=makeMap($("#map"),choose);
function toast(msg){$("#toast").textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").textContent="",4200)}
function uuid(){return crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,"0")).join("")}
function formatDate(t){return new Date(t).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow",timeZoneName:"short"})}
function coords(r){return r.lat.toFixed(5)+"°, "+r.lon.toFixed(5)+"°"}
function locationName(r){return r.source==="demo"?"Кестеньга — Зашеек · "+r.km+" км":r.title}
function pointCode(r){return r.source==="demo"?"КМ "+r.km:"СВОЙ ОБЛЁТ"}
function status(r){return '<span class="status '+r.status+'">'+names[r.status]+'</span>'}
function learnLink(){return '<a href="#monitor" class="secondary">К мониторингу</a>'}
function prepareDB(){return new Promise((resolve,reject)=>{
  const request=indexedDB.open("karelia-uav-v1",1);
  request.onupgradeneeded=()=>{const s=request.result.createObjectStore("observations",{keyPath:"id"});for(const r of demoPoints)s.put(r)};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error("Хранилище занято другой вкладкой"))
})}
async function all(){if(!db)return [...memory.values()];return new Promise((res,rej)=>{const q=db.transaction("observations").objectStore("observations").getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
// Read-modify-write in one transaction so two tabs cannot create duplicate tickets.
async function change(id,edit){
 if(!db){const r=edit(memory.get(id));memory.set(id,r);return r}
 return new Promise((resolve,reject)=>{const tx=db.transaction("observations","readwrite"),s=tx.objectStore("observations"),q=s.get(id);let result,why;
 q.onsuccess=()=>{try{result=edit(q.result);s.put(result)}catch(e){why=e;tx.abort()}};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(why||tx.error||Error("Запись не сохранена"));tx.onerror=()=>{};
 })
}
async function refresh(){rows=(await all()).sort((a,b)=>(b.created||0)-(a.created||0)||(a.km||0)-(b.km||0));if(!rows.some(r=>r.id===selectedId))selectedId=rows[0]?.id;render()}
function imageFrom(src){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(Error("Не удалось открыть изображение"));im.src=src})}
function canvasOf(im,w,h){const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(im,0,0,w,h);return c}
function compareImages(a,b){
 const aspectA=a.naturalWidth/a.naturalHeight,aspectB=b.naturalWidth/b.naturalHeight;if(Math.abs(Math.log(aspectA/aspectB))>.07)throw Error("Пропорции кадров различаются. Обрежьте снимки до одинакового поля зрения.");
 if(Math.min(a.naturalWidth,a.naturalHeight,b.naturalWidth,b.naturalHeight)<32)throw Error("Каждая сторона кадра должна быть не менее 32 пикселей.");
 const scale=240/Math.max(b.naturalWidth,b.naturalHeight),w=Math.round(b.naturalWidth*scale),h=Math.round(b.naturalHeight*scale);if(Math.min(w,h)<32)throw Error("Кадр слишком вытянут. Выберите обычную аэрофотографию.");
 const pix=im=>canvasOf(im,w,h).getContext("2d").getImageData(0,0,w,h).data;return analyze(pix(a),pix(b),w,h)
}
async function runDemo(){const [a,b]=await Promise.all([imageFrom(beforeUrl),imageFrom(afterUrl)]);modelResults.set("k44",compareImages(a,b));modelResults.set("k60",compareImages(a,a))}
function navigate(){const mode=location.hash.slice(1);view=["monitor","tickets","training"].includes(mode)?mode:"monitor";
 for(const v of document.querySelectorAll(".view"))v.hidden=v.id!==view;
 for(const a of document.querySelectorAll("[data-nav]")){const active=a.dataset.nav===view;a.classList.toggle("active",active);if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")}
 if(rows.length)render()
}
function choose(id){selectedId=id;if(view!=="monitor")location.hash="monitor";else render()}
function render(){const point=rows.find(r=>r.id===selectedId);if(!point)return;
 const work=rows.filter(r=>r.status==="ticket").length;$("#metric-total").textContent=rows.length;$("#metric-pending").textContent=rows.filter(r=>r.status==="pending").length;$("#metric-tickets").textContent=work;$("#nav-count").textContent=work;
 if(view==="monitor"){drawMap(rows,point);inspect(point);renderRows()}if(view==="tickets")renderTickets()
}
function renderRows(){
 const filter=$("#filter").value;const list=rows.filter(r=>filter==="all"||r.status===filter);
 $("#records").innerHTML=list.length?list.map(r=>'<button class="row '+(r.id===selectedId?"selected":"")+'" data-select="'+escape(r.id)+'"><span><strong>'+escape(r.title)+'</strong><small>'+escape(r.source==="demo"?locationName(r):coords(r))+'</small></span><span class="source">'+(r.source==="demo"?"Демонстрационные данные":"Собственная съёмка")+'</span>'+status(r)+'<span class="arrow">↗</span></button>').join(""):'<div class="empty">Наблюдений с таким статусом пока нет.</div>'
}
function inspect(r){
 const analysis=r.analysis||modelResults.get(r.id),boxList=analysis?.boxes||[],frame=r.before&&r.after;
 const info=analysis?(analysis.poor?"Кадры заметно различаются, нужна ручная проверка. ":"")+"Выделено зон: "+boxList.length+".":frame?"Анализ кадров…":"";
 const aspect=r.aspect||2, region=boxList.map(b=>'<i style="left:'+b.x*100+'%;top:'+b.y*100+'%;width:'+b.w*100+'%;height:'+b.h*100+'%"></i>').join("");
 const photo=frame?'<div class="compare" style="--split:48%;aspect-ratio:'+aspect+'"><img src="'+escape(r.after)+'" alt="Кадр после события"><div class="frames"><img src="'+escape(r.before)+'" alt="Исходный кадр"></div><div class="box-layer" hidden>'+region+'</div><span class="frame-label before">ДО</span><span class="frame-label after">ПОСЛЕ</span><span class="divider"><b>↔</b></span><input class="compare-slider" type="range" min="0" max="100" value="48" aria-label="Граница между исходным и повторным снимком"></div>':'<div class="placeholder">Для точки пока нет пары снимков.</div>';
 let action="";if(r.status==="pending"||r.status==="reviewed")action='<button class="primary" id="make-ticket">Создать заявку ↗</button>'+(r.status==="pending"?'<button class="text-btn" id="dismiss">Выезд не нужен</button>':'');
 if(r.status==="ticket"||r.status==="closed")action='<button class="secondary" id="see-ticket">Открыть заявку ↗</button>';
 if(r.status==="empty")action='<button class="secondary" id="add-at">Загрузить снимки</button>';
 $("#inspector").innerHTML='<div class="panel-title"><div><div class="eyebrow">ПРОВЕРКА С БПЛА · '+escape(pointCode(r))+'</div><h2>'+escape(r.title)+'</h2></div>'+status(r)+'</div>'+photo+'<div class="inspector-body"><div class="meta-line"><span class="meta">'+(r.source==="demo"?"УЧЕБНЫЙ ПРИМЕР":"СВОИ ДАННЫЕ")+'</span>'+(boxList.length?'<label class="toggle"><input type="checkbox" id="contours"> Контуры изменений</label>':'')+'</div><p>'+escape(r.description||"Сравните снимки и примите решение о выезде бригады.")+' '+escape(info)+'</p><div class="button-row">'+action+'</div></div>';
 const slider=$(".compare-slider");if(slider)slider.oninput=()=>slider.parentElement.style.setProperty("--split",slider.value+"%");
 if($("#contours"))$("#contours").onchange=e=>{$(".box-layer").hidden=!e.target.checked};
 if($("#make-ticket"))$("#make-ticket").onclick=()=>openTicket(r);
 if($("#dismiss"))$("#dismiss").onclick=()=>mutate(r.id,old=>{if(old.status!=="pending")throw Error("Статус уже изменён");return {...old,status:"reviewed"}},"Наблюдение проверено");
 if($("#see-ticket"))$("#see-ticket").onclick=()=>{location.hash="tickets"};
 if($("#add-at"))$("#add-at").onclick=()=>openUpload(r)
}
async function mutate(id,fn,message){try{await change(id,fn);await refresh();channel?.postMessage("update");toast(message);return true}catch(e){toast(e.message||"Не удалось сохранить изменения");return false}}
function openTicket(r){formPoint=r.id;const form=$("#ticket-form");form.reset();if(r.source==="demo"&&r.id==="k44"){form.elements.kind.value="Подтопление";form.elements.note.value="Обследовать перелив у водопропускной трубы и состояние обочины."}else{form.elements.kind.value="Другое"}$("#ticket-place").textContent=locationName(r)+" · "+coords(r)+(r.source==="demo"?" · учебная точка":"");$("#ticket-modal").showModal()}
$("#ticket-form").onsubmit=async e=>{e.preventDefault();const form=e.target,note=form.elements.note.value.trim(),kind=form.elements.kind.value;if(!note){form.elements.note.focus();return}
 const ok=await mutate(formPoint,r=>{if(!r||!["pending","reviewed"].includes(r.status))throw Error("По этой точке уже есть заявка");return {...r,status:"ticket",ticket:{id:"КР-"+uuid().slice(0,8).toUpperCase(),kind,note,created:Date.now()}}},"Заявка сохранена. Задание доступно в разделе «Заявки».");if(ok)$("#ticket-modal").close()
};
function renderTickets(){
 const tickets=rows.filter(r=>r.ticket).sort((a,b)=>b.ticket.created-a.ticket.created);
 $("#tickets-list").innerHTML=tickets.length?tickets.map(r=>'<article class="panel ticket-item"><div class="meta-line"><span class="meta">'+escape(r.ticket.id)+' · '+escape(formatDate(r.ticket.created))+'</span>'+status(r)+'</div><h2>'+escape(r.ticket.kind)+' · '+escape(locationName(r))+'</h2><span class="meta">'+escape(coords(r))+(r.source==="demo"?" · учебные координаты":"")+'</span><p>'+escape(r.ticket.note)+'</p><div class="card-actions"><a class="secondary download" data-export="'+escape(r.id)+'" download="'+escape(r.ticket.id)+'.html">Подготовка файла…</a><button class="text-btn" data-select="'+escape(r.id)+'">Открыть кадры</button>'+(r.status==="ticket"?'<button class="text-btn" data-complete="'+escape(r.id)+'">Отметить выполнение</button>':'<span class="meta">Выполнено '+escape(formatDate(r.ticket.closed))+'</span>')+'</div></article>').join(""):'<div class="empty panel"><h2>Заявок пока нет</h2><p>Откройте участок в мониторинге, проверьте кадры и создайте первую заявку.</p>'+learnLink()+'</div>'
 for(const node of document.querySelectorAll("[data-export]")){
   const record=tickets.find(r=>r.id===node.dataset.export),key=record.id+"/"+record.status;
   const inflight=exportUrls.get(key)||makeExport(record);exportUrls.set(key,inflight);
   inflight.then(url=>{node.href=url;node.textContent="Скачать задание";const printLink=document.createElement("a");printLink.className="text-btn download";printLink.href=url;printLink.target="_blank";printLink.rel="noopener";printLink.textContent="Версия для печати";node.after(printLink)}).catch(()=>{exportUrls.delete(key);node.textContent="Файл недоступен"});
 }

}
async function makeExport(r){
 const photo=async src=>{if(src.startsWith("data:image/"))return src;const im=await imageFrom(src);return canvasOf(im,im.naturalWidth,im.naturalHeight).toDataURL("image/jpeg",.84)};
 const pictures=await Promise.all([photo(r.before),photo(r.after)]);
 const body='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Задание '+escape(r.ticket.id)+'</title><style>body{font:16px/1.5 system-ui;max-width:850px;margin:26px auto;padding:0 16px}h1{font-size:26px}img{width:100%;height:auto}figure{margin:16px 0}small{color:#555}p{white-space:pre-wrap}figure{break-inside:avoid}@media print{button{display:none}}</style><button type="button" onclick="window.print()">Печать или PDF</button><h1>Задание дорожной бригаде</h1><small>'+escape(r.ticket.id)+' · '+escape(formatDate(r.ticket.created))+' · '+escape(names[r.status])+'</small><h2>'+escape(r.ticket.kind)+'</h2><p>'+escape(locationName(r))+'<br>'+escape(coords(r))+(r.source==="demo"?" · иллюстративные кадры и учебные координаты":"")+'</p><p>'+escape(r.ticket.note)+'</p>'+pictures.map((p,i)=>'<figure><figcaption>'+(i?"После":"До")+'</figcaption><img src="'+escape(p)+'" alt="Кадр обследования"></figure>').join("")+'</html>';
 return URL.createObjectURL(new Blob([body],{type:"text/html;charset=utf-8"}));
}
function openUpload(at){if(uploadBusy)return;const f=$("#upload-form");f.reset();$("#upload-status").textContent="";if(at){f.elements.title.value=locationName(at);f.elements.lat.value=at.lat;f.elements.lon.value=at.lon}$("#upload-modal").showModal()}
async function fileImage(file){if(!file||!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("Выберите JPG, PNG или WebP.");if(file.size>12*1024*1024)throw Error("Один из файлов больше 12 МБ.");const url=URL.createObjectURL(file);try{return await imageFrom(url)}finally{URL.revokeObjectURL(url)}}
function compact(im){const scale=Math.min(1,1200/Math.max(im.naturalWidth,im.naturalHeight));return canvasOf(im,Math.max(1,Math.round(im.naturalWidth*scale)),Math.max(1,Math.round(im.naturalHeight*scale))).toDataURL("image/jpeg",.83)}
$("#upload-form").onsubmit=async e=>{e.preventDefault();if(uploadBusy)return;const f=e.target,fields=f.elements,title=fields.title.value.trim(),lat=Number(fields.lat.value),lon=Number(fields.lon.value);if(!title){fields.title.focus();return}
 uploadBusy=true;$("#run").disabled=true;$("#upload-status").textContent="Сопоставляем кадры и ищем изменения…";try{
 const [a,b]=await Promise.all([fileImage(fields.before.files[0]),fileImage(fields.after.files[0])]);const analysis=compareImages(a,b),id=uuid();
 const row={id,title,lat,lon,source:"upload",status:"pending",created:Date.now(),before:compact(a),after:compact(b),aspect:b.naturalWidth/b.naturalHeight,analysis};
 await change(id,()=>row);selectedId=id;$("#filter").value="all";await refresh();channel?.postMessage("update");$("#upload-modal").close();toast(analysis.boxes.length?"Сравнение готово. Проверьте выделенные зоны.":"Сравнение готово. Алгоритм не выделил зон изменения.")
 }catch(err){$("#upload-status").textContent=err.name==="QuotaExceededError"?"На устройстве недостаточно места для сохранения снимков.":err.message||"Не удалось обработать файлы."}finally{uploadBusy=false;$("#run").disabled=false}
};
$("#upload-btn").onclick=()=>openUpload();$("#start-lesson").onclick=()=>choose("k44");$("#filter").onchange=renderRows;
document.addEventListener("click",async e=>{const button=e.target.closest("button");if(!button)return;
 if(button.hasAttribute("data-close")){if(button.closest("dialog").id==="upload-modal"&&uploadBusy)return;button.closest("dialog").close()}
 if(button.dataset.select){choose(button.dataset.select);if(window.matchMedia("(max-width:760px)").matches)$("#inspector").scrollIntoView({block:"start"})}
 if(button.dataset.complete)await mutate(button.dataset.complete,r=>{if(r.status!=="ticket")throw Error("Заявка уже закрыта");return {...r,status:"closed",ticket:{...r.ticket,closed:Date.now()}}},"Выполнение отмечено")
});
$("#upload-modal").addEventListener("cancel",e=>{if(uploadBusy)e.preventDefault()});window.addEventListener("hashchange",navigate);
async function start(){
 try{db=await prepareDB()}catch{memory=new Map(demoPoints.map(r=>[r.id,r]));const msg=document.createElement("p");msg.className="storage-warning";msg.setAttribute("role","status");msg.textContent=memoryFlag;$("main").prepend(msg)}
 navigate();await refresh();if(channel)channel.onmessage=()=>refresh().catch(()=>toast("Не удалось обновить журнал"));
 try{await runDemo();if(view==="monitor")inspect(rows.find(r=>r.id===selectedId))}catch{toast("Учебные снимки недоступны. Можно загрузить свою пару.")}
}
start().catch(()=>toast("Не удалось открыть журнал. Попробуйте обновить страницу."));
