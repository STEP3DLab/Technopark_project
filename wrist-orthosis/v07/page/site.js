/* Progressive enhancement: the illustrated guide also works without JS. */
document.documentElement.classList.add('js');
const $ = id => document.getElementById(id);
const menu = $('menu-toggle'), sidebar = $('sidebar');
function closeMenu() {
  sidebar.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Открыть меню');
}
menu.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
});
document.querySelectorAll('#sidebar a,.mobile-dock a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
const sections = [...document.querySelectorAll('main>section[id]')];
const links = [...sidebar.querySelectorAll('nav a'), ...document.querySelectorAll('[data-mobile-route]')];
function active(id) {
  links.forEach(a => {
    const selected = a.hash === '#' + id;
    a.classList.toggle('active', selected);
    if (selected) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  });
}
active(location.hash.slice(1) || 'overview');
const observer = new IntersectionObserver(entries => {
  const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
  if (visible[0]) active(visible[0].target.id);
}, { rootMargin: '-10% 0px -65% 0px' });
sections.forEach(s => observer.observe(s));
window.addEventListener('hashchange', () => active(location.hash.slice(1)));

let step = 0;
const cards = [...document.querySelectorAll('.step-card')];
const stepButtons = [...document.querySelectorAll('[data-step]')];
function showStep(i, scroll = false) {
  step = Math.min(cards.length - 1, Math.max(0, i));
  cards.forEach((card, j) => { card.hidden = j !== step; });
  stepButtons.forEach((b, j) => {
    b.classList.toggle('active', j === step);
    if (j === step) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  });
  $('step-prev').disabled = step === 0;
  $('step-next').disabled = step === cards.length - 1;
  $('step-progress').textContent = `Этап ${step + 1} из ${cards.length}`;
  if (scroll && matchMedia('(max-width:700px)').matches) $('step-cards').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
stepButtons.forEach(b => b.addEventListener('click', () => showStep(Number(b.dataset.step))));
$('step-prev').addEventListener('click', () => showStep(step - 1, true));
$('step-next').addEventListener('click', () => showStep(step + 1, true));
$('step-pagination').hidden = false;
showStep(0);

const titles = { hero: 'Сборка устройства', side: 'Вид сбоку', top: 'Вид сверху', exploded: 'Разнесённая сборка', shells: 'Две створки корпуса', cassette: 'Съёмная кассета', servo: 'Крепление сервопривода', gears: 'Зубчатая пара 18 / 90', spool: 'Вал и катушка', guide: 'Направляющая троса' };
const image = $('hero-image'), stage = $('visual-stage'), message = $('viewer-message');
let viewer = null, viewerPromise = null, viewerActive = false, ticket=0, currentGroup=null, softwareOnly=false;
function selection(id) {
  document.querySelectorAll('.gallery-tools button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.image === id || (id === '3d' && b.id === 'open-3d'))));
}
function showImage(id) {
  ticket++; viewerActive = false; $('open-3d').removeAttribute('aria-busy');
  viewer?.pause();
  stage.classList.remove('live');
  $('viewer-controls').hidden = true;
  image.src = `v07/assets/${id}.webp`;
  image.alt = titles[id] || 'CAD-визуализация ортеза';
  $('view-title').textContent = titles[id] || 'Конструкция';
  message.textContent = '';
  selection(id);
}
document.querySelectorAll('[data-image]').forEach(b => b.addEventListener('click', () => showImage(b.dataset.image)));
async function open3d(group = null) {
  const request=++ticket; currentGroup=group; viewerActive = true;
  stage.classList.remove('live'); $('viewer-controls').hidden=true; selection('3d');
  message.textContent = 'Загрузка 3D-сборки…';
  $('open-3d').setAttribute('aria-busy', 'true');
  try {
    viewerPromise ||= import('./studio.js?v=mobile-20261125').then(mod => mod.createViewer($('canvas-host'),{softwareOnly})).catch(e => { viewerPromise = null; throw e; });
    viewer = await viewerPromise;
    if (!viewerActive||request!==ticket) return;
    $('explode').value = '0'; $('hide-shell').checked = false;
    viewer.focus(group);
    viewer.resume(); viewer.drawNow?.();
    stage.classList.add('live'); $('viewer-controls').hidden=false;
    $('view-title').textContent = group ? titles[group] : 'Интерактивная 3D-сборка';
    message.textContent = 'Вращайте пальцем или мышью';
  } catch (e) {
    if(request!==ticket)return; viewerActive=false;viewer?.pause();viewer=null;viewerPromise=null;
    stage.classList.remove('live');
    message.textContent = '3D не открылось. Все ракурсы доступны кнопками под изображением.';
    selection(null);
  } finally { if(request===ticket)$('open-3d').removeAttribute('aria-busy'); }
}
window.addEventListener('xlab-3d-failure',()=>{const retry=viewerActive&&!softwareOnly;viewer?.pause();viewer=null;viewerPromise=null;stage.classList.remove('live');$('viewer-controls').hidden=true;softwareOnly=true;if(retry)open3d(currentGroup);else{viewerActive=false;message.textContent='3D недоступно. Выберите CAD-ракурс.';selection(null);}});
$('open-3d').addEventListener('click', () => open3d());
document.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => {
  showImage(b.dataset.group);
  $('viewer').scrollIntoView({ behavior: 'smooth', block: 'center' });
  open3d(b.dataset.group);
}));
$('explode').addEventListener('input', e => { viewer?.explode(Number(e.target.value) / 100); message.textContent = 'Разнесение деталей'; });
$('hide-shell').addEventListener('change', e => viewer?.hideShell(e.target.checked));
$('reset-view').addEventListener('click', () => { $('explode').value = '0'; $('hide-shell').checked = false; viewer?.focus(null); $('view-title').textContent = 'Интерактивная 3D-сборка'; message.textContent = 'Вращайте пальцем или мышью'; });
$('top-view').addEventListener('click', () => viewer?.top());
