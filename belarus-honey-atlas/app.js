const byId = (id) => document.getElementById(id);
const viewport = byId('viewport');
const status = byId('view-status');
const region = byId('region');
const state = { mode: 'whole', region: 'all', bee: null, overhead: false };
const miniatures = {
  boris: 'Борис Грызлов. Самая крупная фигура занимает гребень центрального фрагмента. Поверните её боком, чтобы увидеть, как лапки опираются на соты.',
  ada: 'Ада Грызлова. Фигура на северном фрагменте развёрнута к центру картины. Вблизи видны тонкие прожилки двух пар крыльев.',
  dmitry: 'Дмитрий. Меньшая фигура на юго-западе повёрнута к центру. При увеличении видны усики и тёмные эмалевые пояски.',
  evgenia: 'Евгения. Самая маленькая пчела расположена на юго-восточном фрагменте. Её светлые крылья раскрыты над углублениями сот.'
};
const facts = {
  all: '885 сот образуют шесть деталей для 3D-печати. Минск включён в центральный фрагмент.',
  brest: 'Юго-западный фрагмент. В его рельефе 131 сота, над ними расположена миниатюра Дмитрия.',
  vitebsk: 'Северный фрагмент состоит из 196 сот. Здесь расположена пчела, посвящённая Аде Грызловой.',
  gomel: 'Юго-восточный фрагмент сложен из 172 сот. На нём расположена самая маленькая пчела — Евгения.',
  grodno: 'Западный фрагмент сложен из 98 сот. По боковой кромке хорошо видны глубина ячеек и линия стыка.',
  minsk: 'Центральный фрагмент состоит из 172 сот. На возвышении расположена самая крупная пчела — Борис Грызлов.',
  mogilev: 'Восточный фрагмент состоит из 116 сот. В разнесённом виде виден контур его западного стыка.'
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const images = {
  hero: ['Общий вид скульптурной карты Беларуси из шести сотовых фрагментов с четырьмя пчёлами', './assets/hero.webp'],
  detail: ['Ювелирная пчела на рельефных сотах, крупный план', './assets/detail.webp']
};
document.querySelectorAll('[data-shot]').forEach(button => button.addEventListener('click', () => {
  const shot = button.dataset.shot;
  const picture = byId('hero-img');
  picture.alt = images[shot][0];
  picture.src = images[shot][1];
  byId('hero-art').classList.toggle('detail', shot === 'detail');
  document.querySelectorAll('[data-shot]').forEach(item => item.setAttribute('aria-pressed', item === button));
}));
const dialog = byId('notes');
byId('open-notes').addEventListener('click', () => dialog.showModal());
byId('close-notes').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => {
  const r = dialog.getBoundingClientRect();
  if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
});
let viewer, loading, failed = false;
function sync() {
  region.value = state.region;
  byId('region-note').textContent = state.bee ? miniatures[state.bee] : facts[state.region];
  document.querySelectorAll('[data-mode]').forEach(el => el.setAttribute('aria-pressed', el.dataset.mode === state.mode));
  byId('top-view').setAttribute('aria-pressed', String(state.overhead));
}
function message(s) { const span=document.createElement('span'); span.textContent=s;status.replaceChildren(span); }
async function start() {
  if (viewer) return viewer;
  if (loading) return loading;
  failed = false; message('Загрузка рельефа…');
  loading = (async () => {
    try {
      const { createViewer } = await import('./viewer.js');
      viewer = await createViewer(byId('mount'), pick);
      viewport.classList.add('ready');
      status.replaceChildren();
      viewer.update(state, false);
      return viewer;
    } catch (err) {
      failed = true;
      message('Трёхмерный режим не открылся. Доступны студийные виды картины.');
      const retry = document.createElement('button');retry.textContent='Повторить';
      retry.addEventListener('click', start);status.append(retry);
      console.warn('3D:', err.message);
      return null;
    } finally { loading = null; }
  })();
  return loading;
}
async function apply(patch) {
  Object.assign(state, patch); sync();
  if (viewer) viewer.update(state);
  else if (!failed) await start();
}
function pick(regionId, beeId = null) {
  apply({region:regionId, bee:beeId, overhead:false});
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () =>
  apply({mode:button.dataset.mode, region:'all', bee:null, overhead:false})));
region.addEventListener('change', () => pick(region.value));
byId('top-view').addEventListener('click', () => apply({overhead:!state.overhead}));
byId('reset').addEventListener('click', () => apply({mode:'whole', region:'all', bee:null, overhead:false}));
for (const [id, change] of [['plus',0.8],['minus',1.25]]) byId(id).addEventListener('click', async () => (await start())?.zoom(change));
const familyRegions = { boris:'minsk', ada:'vitebsk', dmitry:'brest', evgenia:'gomel' };
document.querySelectorAll('[data-bee]').forEach(button => button.addEventListener('click', () => {
  const bee = button.dataset.bee;
  byId('viewer').scrollIntoView({behavior:reduceMotion?'instant':'smooth'});
  apply({mode:'whole', region:familyRegions[bee], bee, overhead:false});
  viewport.focus({preventScroll:true});
}));
function updateFull() {
  const active = !!document.fullscreenElement || viewport.classList.contains('expanded');
  byId('full').setAttribute('aria-label', active?'Закрыть полный экран':'Развернуть просмотр');
  byId('full').title=byId('full').getAttribute('aria-label');
}
function fallbackFull(active) {
  viewport.classList.toggle('expanded',active);
  document.body.classList.toggle('expanding',active);
  updateFull();
}
byId('full').addEventListener('click', async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (viewport.classList.contains('expanded')) return fallbackFull(false);
  try { if (!viewport.requestFullscreen) return fallbackFull(true); await viewport.requestFullscreen(); }
  catch { fallbackFull(true); }
});
document.addEventListener('fullscreenchange', updateFull);
document.addEventListener('keydown', e => { if(e.key==='Escape' && viewport.classList.contains('expanded'))fallbackFull(false); });
viewport.addEventListener('keydown', e => {
  if(!viewer || e.target !== viewport)return;
  if(viewer.key(e.key)) e.preventDefault();
});
const observer = new IntersectionObserver(entries => {
  if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}
},{rootMargin:'180px'});
observer.observe(viewport);
const sections=[...document.querySelectorAll('main section[id]')];
const links=[...document.querySelectorAll('.top nav a')];
const navObserver=new IntersectionObserver(entries=>{
  const visible=entries.filter(e=>e.isIntersecting);
  if(visible.length){const hash='#'+visible[0].target.id;links.forEach(a=>a.classList.toggle('nav-current',a.hash===hash));}
},{rootMargin:'-10% 0px -55% 0px'});
sections.forEach(s=>navObserver.observe(s));
sync();
