/** Bounded, interruptible 30-second presentation. No network dependencies. */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let timer=null, current=-1, running=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const steps=[
  {title:'01 / Силуэт',copy:'От целого к деталям: авторский демонстрационный концепт протеза бедра.',duration:6000,run:k=>{k.reset();k.selectPart('covers');}},
  {title:'02 / Под оболочкой',copy:'Раскрываем накладки: конструкция становится видимой и понятной.',duration:8000,run:k=>{k.setMode('explore');k.setProgress(.48);k.selectPart('pylon');}},
  {title:'03 / Пять основных узлов',copy:'Гильза, коленный механизм, несущий модуль, накладки и стопа. Выберите любой узел для подробностей.',duration:8000,run:k=>{k.setProgress(1);k.selectPart('socket');}},
  {title:'04 / Принцип движения',copy:'Условное сгибание коленного узла. Это иллюстрация механизма, не моделирование походки.',duration:8000,run:k=>{k.setMode('motion');k.selectPart('knee');if(reduced)k.setProgress(.5);}}
];
function stop(hide=true){clearTimeout(timer);timer=null;running=false;$('#demo-start').setAttribute('aria-pressed','false');$('#demo-start').innerHTML='<svg><use href="#i-play"/></svg>Демо · 30 секунд';if(hide)$('#demo-story').hidden=true;}
function step(index){if(!window.kinetic)return;current=index;const s=steps[index];s.run(window.kinetic);$('#demo-step-title').textContent=s.title;$('#demo-step-copy').textContent=s.copy;$$('[data-demo-step]').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-current',i===index?'step':'false');});if(running)timer=setTimeout(()=>{if(index<steps.length-1)step(index+1);else {window.kinetic.pause();stop(false);$('#demo-step-title').textContent='Ваш ход';$('#demo-step-copy').textContent='Продолжайте исследование: выберите узел, измените ракурс или соберите модель.';}},s.duration);}
$('#demo-start').addEventListener('click',()=>{if(!window.kinetic)return;if(running){window.kinetic.pause();stop();return;}stop();running=true;$('#demo-story').hidden=false;$('#demo-start').innerHTML='<svg><use href="#i-pause"/></svg>Остановить демо';$('#demo-start').setAttribute('aria-pressed','true');step(0);});
$('#demo-stop').addEventListener('click',()=>{window.kinetic?.pause();stop();$('#demo-start').focus();});
$$('[data-demo-step]').forEach((b,i)=>b.addEventListener('click',()=>{stop(false);window.kinetic?.pause();step(i);}));
// User input always wins. The demo never takes control back after an interruption.
document.addEventListener('pointerdown',e=>{if(running&&!e.target.closest?.('#demo-start,#demo-story'))stop();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){window.kinetic?.pause();stop();}else if(running&&!e.target.closest?.('#demo-story,#demo-start'))stop();},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){window.kinetic?.pause();stop();}});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Выйти из полного экрана':'Полный экран');});
window.addEventListener('kinetic-ready',()=>{ $('#demo-start').disabled=false;$('#engine-status').textContent=window.kinetic.getState().schematic?'2D-схема доступна':'3D готово';});
// Module/import failures must not leave an endless spinner.
setTimeout(()=>{if(window.kinetic)return;$('#loading').innerHTML='<div class="error-state"><b>Не удалось загрузить модель</b><p>Проверьте соединение и обновите страницу. Для показа заранее откройте сайт в браузере.</p><button type="button" onclick="location.reload()">Повторить загрузку</button></div>';$('#engine-status').textContent='Загрузка не завершена';},12000);
