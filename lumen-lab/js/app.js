import {applyIcons,icon} from './icons.js';
import {mountViewer} from './viewer.js';
import {mountSimulator} from './simulator.js';

const menu=document.querySelector('.nav-toggle'),nav=document.getElementById('navlinks');
function closeNav(){nav.classList.remove('is-open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Открыть меню')}
menu.addEventListener('click',()=>{const open=!nav.classList.contains('is-open');if(!open){closeNav();return}nav.classList.add('is-open');menu.setAttribute('aria-expanded','true');menu.setAttribute('aria-label','Закрыть меню')});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeNav));
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav()});
const links=[...nav.querySelectorAll('a')];
function navState(){let current='model';for(const s of ['simulator','assembly'])if(document.getElementById(s).getBoundingClientRect().top<innerHeight*.43)current=s;
  for(const a of links){const active=a.hash==='#'+current;a.classList.toggle('current',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')}
}
window.addEventListener('scroll',navState,{passive:true});navState();
const steps=[
  ['Подготовить детали','Напечатайте все пять STL в заданной ориентации. Основание, корпус, панель и экран нужны в одном экземпляре, круглые метки — в четырёх. Снимите заусенцы и выполните сухую примерку.','base'],
  ['Соединить корпус и основание','Совместите отверстия в основании с глухими направляющими корпуса. Вручную установите четыре потайных винта ST2,9 × 16 со стороны дна. Проверьте, что головки утоплены и пульт устойчив.','screw-1'],
  ['Установить панель и экран','Закрепите лицевую панель четырьмя полосками ленты 30 × 8 мм, экран — двумя полосками 25 × 8 мм. Расчётная толщина ленты 0,2 мм. При сухой примерке проверьте зазор по периметру.','panel'],
  ['Закрепить метки и проверить макет','Вставьте четыре метки на кружки ленты Ø8 мм. Для надписей распечатайте последнюю страницу руководства в масштабе 100 % и измерьте контрольный отрезок 50 мм. Результаты первой сборки внесите в лист проверки.','marker-1']
];
const viewer=mountViewer();mountSimulator(viewer.update);
const stepsBox=document.getElementById('step-list');
steps.forEach(([title,text,id],i)=>{
  const det=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p');
  summary.innerHTML='<span class="panel-num">0'+(i+1)+'</span>'+title+'<i class="detail-mark" data-icon="plus"></i>';det.append(summary);p.append(document.createTextNode(text+' '));const button=document.createElement('button');button.className='step-view';button.textContent='Показать в 3D';button.onclick=()=>{viewer.show(id);document.getElementById('stage').scrollIntoView({block:'center'});document.getElementById('viewport').focus({preventScroll:true})};p.append(button);det.append(p);stepsBox.append(det);
});
const files=[
  ['Руководство и наклейки','PDF · 6 стр.','docs/guide.pdf','book'],
  ['Размерный чертёж панели','PDF · 1 стр.','docs/panel.pdf','ruler'],
  ['Комплект для 3D-печати','5 STL · ZIP','LM-04-print.zip','printer'],
  ['Сборка для CAD','STEP','lm04-assembly.step','cube'],
  ['3D-модель с материалами','GLB','lm04-assembly.glb','layers'],
  ['Ведомость деталей','CSV','docs/bom.csv','list'],
  ['Параметрическая модель','Python','lm04-model.py','code']
];
const box=document.getElementById('files');
for(const [title,tag,path,symbol] of files){const a=document.createElement('a');a.className='download-row';a.href='./kit/'+path;if(path.endsWith('.pdf')){a.target='_blank';a.rel='noopener'}else{a.download=''}a.innerHTML='<span class="file-left"><i data-icon="'+symbol+'"></i><span class="file-name">'+title+'</span></span><span class="file-tag">'+tag+'</span>';box.append(a)}
applyIcons();
