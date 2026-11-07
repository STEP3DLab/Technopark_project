'use strict';

const filters = Array.from(document.querySelectorAll('.guide-filter'));
const compositions = Array.from(document.querySelectorAll('.guide-card'));
function showTask() {
  const requested = new URL(location.href).searchParams.get('task');
  const selected = filters.find(link => link.dataset.goal === requested) || filters[0];
  filters.forEach(link => {
    if (link === selected) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  const goal = selected.dataset.goal;
  const shown = compositions.filter(card => goal === 'all' || card.dataset.goals.split(' ').includes(goal));
  compositions.forEach(card => { card.hidden = !shown.includes(card); });
  byId('guide-count').textContent = goal === 'all' ? 'Составов в подборке — ' + shown.length :
    selected.textContent + ' · подходящих составов — ' + shown.length;
}
filters.forEach(link => link.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  if (new URL(link.href).href !== location.href) history.pushState(null, '', link.href);
  showTask();
  record('guide_task', link.dataset.goal);
}));
window.addEventListener('popstate', showTask);
showTask();
