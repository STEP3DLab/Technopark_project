/** Dependency-free, explicit schematic fallback. Not a substitute for a clinical model. */
export function createFallback(viewport, onSelect) {
  document.body.classList.add('schematic-mode');
  viewport.querySelectorAll('canvas').forEach(el => el.remove());
  viewport.insertAdjacentHTML('beforeend', `<div class="fallback-scene">
    <svg class="prosthesis-schematic" viewBox="0 0 640 800" role="img" aria-labelledby="schematic-title schematic-desc">
      <title id="schematic-title">Схема модульного протеза бедра</title>
      <desc id="schematic-desc">Условная 2D-схема: гильза, коленный узел, несущий модуль, защитная оболочка и стопа. Ползунок раскрывает узлы; режим движения показывает условное сгибание.</desc>
      <defs>
        <linearGradient id="shell" x1="0" x2="1"><stop stop-color="#f4f6ec"/><stop offset=".52" stop-color="#d5ddcc"/><stop offset="1" stop-color="#a4b297"/></linearGradient>
        <linearGradient id="metal" x1="0" x2="1"><stop stop-color="#374a3b"/><stop offset=".22" stop-color="#cbd4ca"/><stop offset=".5" stop-color="#7b8c79"/><stop offset=".73" stop-color="#e7ede3"/><stop offset="1" stop-color="#455844"/></linearGradient>
        <linearGradient id="carbon" x1="0" x2="1"><stop stop-color="#15231c"/><stop offset=".5" stop-color="#53614c"/><stop offset="1" stop-color="#16251c"/></linearGradient>
        <pattern id="weave" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0l10 10M-5 5l10 10M5-5l10 10" stroke="#b3c39d" stroke-opacity=".12" stroke-width="2"/></pattern>
      </defs>
      <ellipse cx="330" cy="733" rx="137" ry="20" fill="#3d5636" opacity=".08" stroke="none"/>
      <g id="schematic-zoom">
        <g id="schema-socket" data-node="socket"><path d="M256 91 Q320 65 384 91 L367 231 Q321 259 275 231 Z" fill="url(#carbon)" stroke="#2b3b2d" stroke-width="2"/><path d="M256 91 Q320 65 384 91 L367 231 Q321 259 275 231 Z" fill="url(#weave)" stroke="none"/><ellipse cx="320" cy="91" rx="64" ry="23" fill="#45523f" stroke="#a4b58f" stroke-width="7"/><ellipse cx="320" cy="92" rx="49" ry="14" fill="#202d22" stroke="none"/><path d="M272 120l13 105M368 120l-13 105" stroke="#b8d58a" stroke-width="4"/><rect x="299" y="244" width="42" height="28" rx="4" fill="url(#metal)" stroke="none"/></g>
        <g id="schema-knee" data-node="knee"><rect x="281" y="273" width="78" height="91" rx="23" fill="url(#carbon)" stroke="#182e20" stroke-width="2"/><path d="M296 291v51M344 291v51" stroke="#b0bf9c" stroke-width="7"/><circle cx="320" cy="308" r="26" fill="url(#metal)" stroke="#233b27" stroke-width="3"/><circle cx="320" cy="308" r="12" fill="#2d4230" stroke="#bfde82" stroke-width="3"/><circle cx="320" cy="308" r="4" fill="#dce7cf" stroke="none"/></g>
        <g id="schema-lower">
          <g id="schema-pylon" data-node="pylon"><rect x="306" y="355" width="28" height="277" rx="6" fill="url(#metal)" stroke="#5f7456"/><rect x="291" y="355" width="58" height="20" rx="5" fill="url(#carbon)" stroke="none"/><rect x="296" y="603" width="48" height="17" rx="4" fill="url(#carbon)" stroke="none"/><rect x="348" y="365" width="13" height="108" rx="5" fill="url(#metal)" stroke="#506245"/><rect x="352" y="469" width="5" height="62" fill="#8c9f7f" stroke="none"/><rect x="286" y="398" width="19" height="75" rx="3" fill="#395b3a" stroke="#93b75b"/><path d="M294 410v50M291 429h7M291 448h7" stroke="#bcdd80" stroke-width="2"/><path d="M302 378v13M338 378v13M302 590v8M338 590v8" stroke="#b6d97c" stroke-width="4"/></g>
          <g id="schema-foot" data-node="foot"><rect x="300" y="635" width="40" height="24" rx="7" fill="url(#metal)" stroke="#394e31"/><path d="M319 654 Q330 683 400 693 L436 702 Q442 709 425 712 L300 708 Q274 703 279 693 Q286 678 305 666" fill="url(#carbon)" stroke="#243a28" stroke-width="3"/><path d="M314 664 Q314 693 416 703M299 703l-21 8" fill="none" stroke="#c6ed70" stroke-width="4"/><path d="M280 718 Q348 725 437 718" stroke="#1f3426" stroke-width="8"/></g>
          <g id="schema-cover-left" data-node="covers" class="schema-cover"><path d="M286 371 Q259 402 269 484 L286 607 L309 617 L307 384 Z" fill="url(#shell)" stroke="#879c75" stroke-width="1.5"/><path d="M281 404l16 4M279 415l17 4M278 426l18 4M277 437l19 4" stroke="#4b6340" stroke-width="4"/></g>
          <g id="schema-cover-right" data-node="covers" class="schema-cover"><path d="M333 384 L333 615 L355 606 L373 473 Q382 406 354 371 Z" fill="url(#shell)" stroke="#879c75" stroke-width="1.5"/><path d="M349 406l15-3M350 417l15-3M351 428l15-3M351 439l15-3" stroke="#4b6340" stroke-width="4"/></g>
          <g id="schema-cover-front" data-node="covers" class="schema-cover"><path d="M311 382 L329 382 L329 617 L311 617 Z" fill="url(#shell)" stroke="#8ea17d"/><path d="M320 409v155" stroke="#c6ed70" stroke-width="5"/></g>
        </g>
      </g>
    </svg>
    <div class="fallback-notice"><span>СХЕМА ВМЕСТО 3D</span>WebGL недоступен. Раскрытие, движение и выбор узлов работают в 2D.<button id="retry-3d" type="button">Повторить запуск 3D ↗</button></div>
  </div>`);
  const q = s => viewport.querySelector(s);
  q('#retry-3d').onclick=()=>location.reload();
  q('.prosthesis-schematic').addEventListener('click',e=>{const node=e.target.closest('[data-node]');if(node)onSelect(node.dataset.node);});
  document.querySelector('.stage-top').innerHTML='<span class="live-dot"></span><span>ИНТЕРАКТИВНАЯ СХЕМА</span>';
  document.querySelector('.gesture-tip').textContent='Выберите узел в списке · Ползунок раскрывает конструкцию';
  document.querySelector('.scroll-hint').textContent='СХЕМА · 2D';
  document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=true;b.setAttribute('title','Выбор ракурса доступен в 3D');});
  viewport.setAttribute('aria-label','Интерактивная 2D-схема протеза. Используйте ползунок для раскрытия, список для выбора узлов.');
  const hotspots=document.querySelector('#hotspots'); hotspots.replaceChildren();
  const items=[['socket','02','Приёмная гильза',.59,.17],['knee','03','Коленный механизм',.58,.385],['pylon','04','Несущий модуль',.58,.60],['foot','05','Упругая стопа',.66,.85],['covers','01','Внешние накладки',.37,.58]];
  const buttons=items.map(([id,no,name,x,y])=>{const b=document.createElement('button');b.className='hotspot';b.dataset.part=id;b.setAttribute('aria-label',name);b.innerHTML=`<span class="hotspot-dot">${no}</span><span class="hotspot-label">${name}</span>`;b.onclick=()=>onSelect(id);hotspots.append(b);return {b,id,x,y};});
  let color='ceramic';
  return {
    update({progress,angle,zoom,xray,labels,selected}) {
      const open=Math.min(1,progress/.55), spread=Math.max(0,(progress-.48)/.52);
      q('#schema-cover-left').setAttribute('transform',`translate(${-open*89-spread*18} ${spread*18}) rotate(${-open*7} 290 410)`);
      q('#schema-cover-right').setAttribute('transform',`translate(${open*89+spread*18} ${spread*18}) rotate(${open*7} 350 410)`);
      q('#schema-cover-front').setAttribute('transform',`translate(${open*155} ${spread*25})`);
      q('#schema-socket').setAttribute('transform',`translate(0 ${-spread*35})`);
      q('#schema-foot').setAttribute('transform',`translate(0 ${spread*32})`);
      q('#schema-lower').setAttribute('transform',`rotate(${-angle} 320 308)`);
      q('#schematic-zoom').setAttribute('transform',`translate(320 400) scale(${zoom*(1-spread*.10)}) translate(-320 -400)`);
      viewport.querySelectorAll('.schema-cover').forEach(n=>n.style.opacity=xray?.18:1);
      const vb=viewport.getBoundingClientRect(), mb=document.querySelector('.studio').getBoundingClientRect();
      const scale=Math.min(vb.width/640,(vb.height-65)/800), ox=(vb.width-640*scale)/2, oy=0;
      buttons.forEach(({b,id,x,y})=>{let hidden=!labels||(id==='pylon'&&progress<.3&&!xray)||angle>8; b.style.left=`${vb.left-mb.left+ox+x*640*scale}px`;b.style.top=`${vb.top-mb.top+oy+y*800*scale}px`;b.style.opacity=hidden?'0':'1';b.style.pointerEvents=hidden?'none':'auto';b.tabIndex=hidden?-1:0;b.setAttribute('aria-hidden',String(hidden));b.classList.toggle('selected',selected===id);});
    },
    setColor(next) {if(next===color)return;color=next;const colors={ceramic:['#f4f6ec','#d5ddcc','#a4b297'],graphite:['#687861','#344632','#15291d'],lime:['#e0f8ac','#b7de69','#6e9d39']};q('#shell').querySelectorAll('stop').forEach((s,i)=>s.setAttribute('stop-color',colors[next][i]));}
  };
}
