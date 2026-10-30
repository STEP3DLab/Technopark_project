/* PartInspector — presentation-only exploration of the engineering holder.
 * html({ribs?}); mount(slot,{ribs?,selected?,onSelect?}).
 * getView() -> {selected:'base'|'wall'|'ribs'|null}; update({ribs?,selected?}); destroy().
 * Explicit selected updates are silent. If selected ribs disappear, onSelect(null)
 * synchronizes the host. No scores, formulas, scene globals, storage or animation.
 */
(function(global){
 'use strict';
 const mounts=new WeakMap(),PARTS=['base','wall','ribs'];
 const LABELS={base:'Основание',wall:'Стенка',ribs:'Рёбра'};
 const DETAILS={
  base:'Горизонтальная пластина внизу держателя. Над ней расположены стенка и, если они есть в варианте, треугольные рёбра. Ракурс «Сверху» помогает рассмотреть её контур и крепления.',
  wall:'Вертикальная пластина в задней части держателя. Она соединяется с основанием под прямым углом. Поворот модели позволяет рассмотреть обе её поверхности.',
  ribs:'Треугольные перемычки между основанием и стенкой. Их количество соответствует текущему параметру «Рёбра». В разнесённом виде можно рассмотреть их форму отдельно.'
 };
 function ribsCount(value,fallback=2){return Number.isInteger(value)&&value>=0&&value<=4?value:fallback;}
 function selection(value,ribs){return PARTS.includes(value)&&(value!=='ribs'||ribs>0)?value:null;}
 function icon(part){
  return '<svg class="pi-icon" viewBox="0 0 80 64" aria-hidden="true" focusable="false"><path d="M10 40 47 21 72 36 34 56Z" fill="'+(part==='base'?'currentColor':'#d8e1f3')+'"/><path d="M10 40v5l24 16v-5m0 0v5l38-20v-5" fill="'+(part==='base'?'currentColor':'#c2d0e9')+'" opacity=".7"/><path d="M19 17 47 3v30L19 47Z" fill="'+(part==='wall'?'currentColor':'#c3d2ed')+'"/><path d="M29 25v17l14 4Zm13-7v17l14 4Z" fill="'+(part==='ribs'?'currentColor':'#edf2fa')+'" stroke="#fff" stroke-width="1.2"/></svg>';
 }
 function html(options={}){
  const ribs=ribsCount(options.ribs),selected=selection(options.selected,ribs);
  return '<section class="pi-card" data-pi-root aria-label="Детали инженерной модели"><header class="pi-heading"><p class="pi-kicker">РАССМОТРИ УСТРОЙСТВО</p><h3>Детали держателя</h3><p>Выбери часть, чтобы выделить её в модели и узнать, как она расположена.</p></header><div class="pi-parts" role="group" aria-label="Выделить часть модели">'+PARTS.map(id=>'<button type="button" class="pi-part" data-pi-part="'+id+'" aria-pressed="'+(selected===id)+'"'+(id==='ribs'&&ribs===0?' disabled':'')+' aria-label="'+LABELS[id]+(id==='ribs'?': '+ribs+(ribs===0?'. В текущей модели отсутствуют':''):'')+'">'+icon(id)+'<strong>'+LABELS[id]+'</strong><span class="pi-part-note"'+(id==='ribs'?' data-pi-ribs-count':'')+'>'+(id==='base'?'Горизонтально':id==='wall'?'Вертикально':ribs+' шт.')+'</span></button>').join('')+'</div><div class="pi-detail"><div class="pi-description" role="status" aria-live="polite" aria-atomic="true"><p class="pi-detail-title" data-pi-title>'+(selected?LABELS[selected]:'Модель целиком')+'</p><p class="pi-detail-copy" data-pi-description>'+(selected?DETAILS[selected]:ribs===0?'В текущем варианте рёбер нет. Можно рассмотреть основание и стенку.':'Выделение помогает найти часть в объёмной модели. Поверни её или используй «Показать состав», чтобы рассмотреть соединения.')+'</p></div><button type="button" class="pi-clear" data-pi-clear'+(!selected?' disabled':'')+'>Снять выделение</button></div><p class="pi-note">Выделение не меняет размеры и параметры конструкции.</p></section>';
 }
 function mount(root,options={}){
  if(!root||typeof root.addEventListener!=='function'||typeof root.querySelector!=='function')throw new TypeError('PartInspector.mount expects a container');
  mounts.get(root)?.destroy();
  let ribs=ribsCount(options.ribs),selected=selection(options.selected,ribs),destroyed=false;
  let panel=root.matches?.('[data-pi-root]')?root:root.querySelector('[data-pi-root]');
  if(!panel){root.innerHTML=html({ribs,selected});panel=root.querySelector('[data-pi-root]');}
  const buttons=new Map(PARTS.map(id=>[id,panel.querySelector('[data-pi-part="'+id+'"]')])),clear=panel.querySelector('[data-pi-clear]'),title=panel.querySelector('[data-pi-title]'),description=panel.querySelector('[data-pi-description]'),count=panel.querySelector('[data-pi-ribs-count]');
  function render(preferred){
   if(destroyed)return;
   const active=root.ownerDocument?.activeElement;
   for(const [id,button]of buttons){button.disabled=id==='ribs'&&ribs===0;button.setAttribute('aria-pressed',String(selected===id));button.setAttribute('aria-label',LABELS[id]+(id==='ribs'?': '+ribs+(ribs===0?'. В текущей модели отсутствуют':''):''));}
   count.textContent=ribs+' шт.';clear.disabled=!selected;panel.setAttribute('data-pi-selected',selected||'');
   title.textContent=selected?LABELS[selected]:'Модель целиком';
   description.textContent=selected?DETAILS[selected]:ribs===0?'В текущем варианте рёбер нет. Можно рассмотреть основание и стенку.':'Выделение помогает найти часть в объёмной модели. Поверни её или используй «Показать состав», чтобы рассмотреть соединения.';
   if(active&&panel.contains(active)&&active.disabled){const candidate=buttons.get(preferred);(candidate&&!candidate.disabled?candidate:buttons.get('base')).focus({preventScroll:true});}
  }
  function notify(){if(typeof options.onSelect==='function')options.onSelect(selected);}
  function click(event){
   const control=event.target?.closest?.('[data-pi-part],[data-pi-clear]');
   if(destroyed||!control||!panel.contains(control)||control.closest('[data-pi-root]')!==panel||control.disabled)return;
   const part=control.getAttribute('data-pi-part'),isClear=control.hasAttribute('data-pi-clear');
   if(!isClear&&!PARTS.includes(part))return;
   if(!isClear&&part==='ribs'&&ribs===0)return;
   event.preventDefault?.();const previous=selected;selected=isClear||selected===part?null:part;
   render(previous);if(previous!==selected)notify();
  }
  root.addEventListener('click',click);
  const controller={getView(){return {selected};},update(patch={}){
   if(destroyed)return controller;
   const previous=selected;ribs=ribsCount(patch.ribs,ribs);
   const explicit=Object.prototype.hasOwnProperty.call(patch,'selected');selected=selection(explicit?patch.selected:selected,ribs);
   render(previous);if(!explicit&&previous!==selected)notify();return controller;
  },destroy(){if(destroyed)return;destroyed=true;root.removeEventListener('click',click);if(mounts.get(root)===controller)mounts.delete(root);}};
  mounts.set(root,controller);render();return controller;
 }
 const api=Object.freeze({html,mount});global.PartInspector=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
