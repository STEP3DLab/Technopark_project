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
menu.addEventListener('click', event => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  setMenu(open);
  if (open && event.detail === 0) navigation.querySelector('a').focus();
});
document.querySelector('.header').addEventListener('focusout', event => {
  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setMenu(false);
});
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


function emailDraft(subject, body) {
  return 'mailto:order@mylco.ru?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}

function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function copyText(value, status, message) {
  try {
    await navigator.clipboard.writeText(value);
    status.textContent = message;
  } catch {
    const field = document.createElement('textarea');
    field.setAttribute('aria-label', 'Текст для ручного копирования');
    field.readOnly = true;
    field.value = value;
    status.replaceChildren('Скопируйте выделенный текст.', field);
    field.focus();
    field.select();
    try {
      if (document.execCommand('copy')) status.textContent = message;
    } catch { /* The selected field remains available for manual copying. */ }
  }
}
