'use strict';
const byId = id => document.getElementById(id);
function record(action, category) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({event:'mylco_' + action, category});
}

const menu = document.querySelector('.menu');
const navigation = byId('navigation');
function setMenu(open) {
  navigation.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menu.querySelector('use').setAttribute('href', open ? '#ic-close' : '#ic-menu');
}
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('click', event => {
  if (!event.target.closest('.header') || event.target.closest('nav a')) setMenu(false);
  const link = event.target.closest('[data-event]');
  if (link) record(link.dataset.event, link.getAttribute('href').split('?')[0]);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menu.focus();
  }
});
window.matchMedia('(max-width:650px)').addEventListener('change', () => setMenu(false));

