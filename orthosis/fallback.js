/* Same-origin, dependency-free fall-back catalogue for browsers without WebGL/Three. */
(function(){
  function init(){
    const $=id=>document.getElementById(id);
    const cards=[...document.querySelectorAll("#partGrid .pcard[data-code]")];
    if(!cards.length)return;
    let filter="all";
    const filters=[...document.querySelectorAll("#filters [data-f]")];
    const bedPresets=[...document.querySelectorAll("[data-bed]")];
    function update(){
      if(window.__ORTHOSIS_APP_READY)return;
      const w=Number($("bedWidth").value)||220,d=Number($("bedDepth").value)||220;
      const query=$("search").value.trim().toLowerCase();
      let fitted=0;
      for(const card of cards){
        const size=card.dataset.size.split(",").map(Number),[x,y]=size;
        const fits=(x+10<=w&&y+10<=d)||(y+10<=w&&x+10<=d);
        if(fits)fitted++;
        const show=(filter==="all"||card.dataset.kind===filter)&&card.textContent.toLowerCase().includes(query);
        card.style.display=show?"":"none";
        const label=card.querySelector(".print-footprint span:last-child");
        if(label){label.className=fits?"print-ok":"print-no";label.textContent=fits?"● Входит":"! Не входит";}
      }
      $("bedSummary").textContent=fitted+" / "+cards.length+" моделей помещаются на стол "+w+" × "+d+" мм по габаритному прямоугольнику.";
      bedPresets.forEach(b=>b.classList.toggle("active",Number(b.dataset.bed)===w&&w===d));
    }
    for(const control of ["bedWidth","bedDepth","search"])
      $(control).addEventListener("input",update);
    filters.forEach(b=>b.addEventListener("click",()=>{
      if(window.__ORTHOSIS_APP_READY)return;
      filter=b.dataset.f;filters.forEach(x=>x.classList.toggle("active",x===b));update();
    }));
    bedPresets.forEach(b=>b.addEventListener("click",()=>{
      if(window.__ORTHOSIS_APP_READY)return;
      $("bedWidth").value=b.dataset.bed;$("bedDepth").value=b.dataset.bed;update();
    }));
    update();
    window.setTimeout(()=>{
      if(window.__ORTHOSIS_APP_READY)return;
      const loading=$("loading");
      if(loading)loading.innerHTML='<strong>3D-просмотр временно недоступен</strong><small>Каталог и файлы STL/STEP доступны ниже без 3D-библиотеки.</small>';
    },9500);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();