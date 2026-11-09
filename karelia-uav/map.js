const NS="http://www.w3.org/2000/svg";
function el(tag,attrs={},parent){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e}
function label(parent,x,y,value,attrs={}){el("text",{x,y,"font-family":"ui-monospace,monospace","font-size":13,fill:"#b8cdc0",...attrs},parent).textContent=value}
function height(x,y){return Math.sin(x*.009+y*.004)*.72+Math.sin(y*.014-x*.001)*.58+Math.sin((x+y)*.026+Math.sin(x*.009)*2)*.26+Math.cos(x*.035-y*.013)*.13+Math.sin(x*.048+y*.041)*.06}
function contours(group){
  const step=12, cols=77, rows=41;
  const grid=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>height(x*step,y*step)));
  for(let level=-1.60,n=0;level<1.72;level+=.10,n++){
    const path=[];
    for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
      const pts=[[x*step,y*step,grid[y][x]],[(x+1)*step,y*step,grid[y][x+1]],[(x+1)*step,(y+1)*step,grid[y+1][x+1]],[x*step,(y+1)*step,grid[y+1][x]]];
      const hit=[];
      for(let i=0;i<4;i++){const a=pts[i],b=pts[(i+1)%4];if((a[2]<level)===(b[2]<level))continue;const t=(level-a[2])/(b[2]-a[2]);hit.push([(a[0]+t*(b[0]-a[0])).toFixed(1),(a[1]+t*(b[1]-a[1])).toFixed(1)])}
      for(let i=0;i+1<hit.length;i+=2) path.push("M"+hit[i].join(" ")+"L"+hit[i+1].join(" "));
    }
    el("path",{d:path.join(""),fill:"none",stroke:n%4===0?"#527062":"#3b574e","stroke-width":n%4===0?1.1:.75,opacity:.65},group);
  }
}
const water="M-80 371C45 307 77 300 125 330S183 385 224 363 234 327 288 335 326 399 287 420 225 431 210 484H-80Z M658 -45C627 18 634 50 596 81S559 130 591 151 650 134 649 104 678 94 709 65 700 23 748 -45Z M771 211C750 258 790 288 810 290S858 304 879 337 934 357 961 334V181C906 197 903 226 866 242S817 248 812 222 785 184 771 211Z";
const road="M-20 310C49 310 67 284 110 285S168 304 212 270 252 211 299 202 356 202 389 178 453 148 491 148 532 170 565 154 620 122 659 116 710 101 745 90 798 73 832 70 891 62 925 42";
const marks={"k44":[299,202],"k60":[565,154],"k63":[745,90]};
function background(g){
  el("rect",{x:-900,y:-460,width:2700,height:1380,fill:"#213932"},g);contours(g);
  el("path",{d:water,fill:"#18353e",stroke:"#41616a","stroke-width":2},g);
  for(let x=60;x<900;x+=90)el("path",{d:"M"+x+" 0v460",stroke:"#97b2a4","stroke-dasharray":"2 8",opacity:.17},g);
  for(let y=40;y<460;y+=82)el("path",{d:"M0 "+y+"h900",stroke:"#97b2a4","stroke-dasharray":"2 8",opacity:.17},g);
  el("path",{d:"M160 -20Q205 74 162 132T175 235 201 283 M455 459Q428 378 493 304T565 154 M-20 108Q87 146 164 133",fill:"none",stroke:"#8a8e74","stroke-width":2,"stroke-dasharray":"6 4",opacity:.7},g);
  el("path",{d:road,fill:"none",stroke:"#172b25","stroke-width":9},g);el("path",{d:road,fill:"none",stroke:"#bace9d","stroke-width":3.5},g);
  label(g,38,264,"КЕСТЕНЬГА",{"font-size":16,"font-weight":650,fill:"#d6e5cd"});label(g,765,57,"ЗАШЕЕК",{"font-size":16,"font-weight":650,fill:"#d6e5cd"});
  label(g,55,398,"озеро",{"font-style":"italic",fill:"#83a8b3"});label(g,358,340,"ЛЕСНОЙ МАССИВ",{"letter-spacing":3,"font-size":11,fill:"#97b69f"});label(g,337,85,"ЛОУХСКИЙ РАЙОН",{"letter-spacing":3,"font-size":11,fill:"#a5b9a8"});
}
export function makeMap(svg,onSelect){
  let zoom=1,focus=[450,230],key="",scene=null,markerLayer=null;
  function frame(){const w=900/zoom,h=460/zoom;svg.setAttribute("viewBox",[Math.max(0,Math.min(900-w,focus[0]-w/2)),Math.max(0,Math.min(460-h,focus[1]-h/2)),w,h].join(" "));document.getElementById("zoom-in").disabled=zoom>=3;document.getElementById("zoom-out").disabled=zoom<=1}
  document.getElementById("zoom-in").onclick=()=>{zoom=Math.min(3,zoom+.5);frame()};document.getElementById("zoom-out").onclick=()=>{zoom=Math.max(1,zoom-.5);frame()};document.getElementById("recenter").onclick=()=>{zoom=1;frame()};
  return function draw(rows,selected){const imported=selected.source==="upload",newKey=imported?selected.id:"demo";if(key!==newKey){key=newKey;zoom=1;svg.replaceChildren();scene=el("g",{},svg);
      if(!imported)background(scene);else{el("rect",{width:900,height:460,fill:"#192b30"},scene);for(let x=0;x<=900;x+=50)el("path",{d:"M"+x+" 0v460",stroke:"#354a4e"},scene);for(let y=0;y<=460;y+=50)el("path",{d:"M0 "+y+"h900",stroke:"#354a4e"},scene);label(scene,450,300,selected.lat.toFixed(5)+"° / "+selected.lon.toFixed(5)+"°",{"text-anchor":"middle",fill:"#bdcfc9","font-size":17})}
      markerLayer=el("g",{},scene)}
    markerLayer.replaceChildren();const shown=imported?[selected]:rows.filter(r=>r.source==="demo");
    for(const r of shown){const [x,y]=imported?[450,220]:marks[r.id];const active=r.id===selected.id;if(active)focus=[x,y];
      const color=r.status==="pending"?"#ffae75":r.status==="ticket"?"#9ed3ff":"#c4e49c";
      const node=el("g",{class:"map-marker",role:"button",tabindex:0,"aria-label":r.title+", выбрать участок","aria-pressed":active},markerLayer);
      if(active)el("circle",{cx:x,cy:y,r:25,fill:color,"fill-opacity":.12,stroke:color,"stroke-opacity":.55,"stroke-width":1.5},node);
      el("circle",{cx:x,cy:y,r:active?10:7,fill:color,stroke:"#162722","stroke-width":3},node);
      el("circle",{cx:x,cy:y,r:23,fill:"transparent"},node);
      if(!imported){el("rect",{x:x-25,y:y+19,width:50,height:21,rx:4,fill:"#122322",stroke:"#4a6056"},node);label(node,x,y+34,r.km+" км",{"text-anchor":"middle","font-size":12,fill:"#d5e2d5"})}
      node.onclick=()=>onSelect(r.id);node.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(r.id)}}}
    document.getElementById("map-heading").textContent=imported?"Точка собственного облёта":"Кестеньга — Зашеек";
    document.getElementById("map-tag").textContent=imported?"По координатам":"Учебная схема";
    document.getElementById("map-origin").textContent=imported?"ЛОКАЛЬНАЯ СЕТКА · КООРДИНАТЫ ПОЛЬЗОВАТЕЛЯ":"УСЛОВНАЯ ГЕОГРАФИЯ";frame()
  }
}
