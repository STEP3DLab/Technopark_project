'use strict';
(() => {
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#primary-navigation');
  const mobile = document.querySelector('.lab-mobile-cta');
  const ctaSections = new Set();
  const updateMobileCTA = () => mobile?.classList.toggle('is-hidden', ctaSections.size > 0 || nav?.classList.contains('open'));
  const setMenu = (open, focus = false) => {
    nav?.classList.toggle('open', open);
    menu?.setAttribute('aria-expanded', String(open));
    menu?.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    updateMobileCTA();
    if (focus) menu?.focus();
  };
  menu?.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav?.classList.contains('open')) setMenu(false, true);
  });
  document.addEventListener('click', event => {
    if (nav?.classList.contains('open') && !event.target.closest('.topbar')) setMenu(false);
  });
  nav?.addEventListener('focusout', event => {
    if (event.relatedTarget && !nav.contains(event.relatedTarget) && event.relatedTarget !== menu) setMenu(false);
  });
  window.matchMedia('(min-width:1001px)').addEventListener('change', e => { if (e.matches) setMenu(false); });
  document.documentElement.classList.add('js');

  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const filterCards = [...document.querySelectorAll('[data-category]')];
  const filterStatus = document.querySelector('#filter-count');
  const setFilter = (button, updateURL = false) => {
    filterButtons.forEach(b => {
      const active = b === button;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    let count = 0;
    filterCards.forEach(card => {
      const show = button.dataset.filter === 'Все' || card.dataset.category === button.dataset.filter;
      card.hidden = !show;
      if (show) count++;
    });
    if (filterStatus) filterStatus.textContent = `Показано: ${count} из ${filterCards.length}`;
    if (updateURL) {
      const url = new URL(location.href);
      if (button.dataset.filter === 'Все') url.searchParams.delete('category');
      else url.searchParams.set('category', button.dataset.filter);
      history.replaceState(null, '', url);
    }
  };
  filterButtons.forEach(button => button.addEventListener('click', () => setFilter(button, true)));
  const restoreFilter = () => {
    const selected = new URLSearchParams(location.search).get('category');
    const button = filterButtons.find(b => b.dataset.filter === selected) || filterButtons[0];
    if (button) setFilter(button);
  };
  restoreFilter();
  window.addEventListener('popstate', restoreFilter);

  const dialog = document.querySelector('.gallery-dialog');
  let openedBy = null;
  document.querySelectorAll('.gallery-open').forEach(button => button.addEventListener('click', () => {
    if (!dialog || dialog.open) return;
    openedBy = button;
    const img = dialog.querySelector('img');
    img.src = button.dataset.image;
    img.alt = button.querySelector('img').alt;
    dialog.querySelector('p').textContent = button.dataset.caption;
    dialog.showModal();
  }));
  dialog?.querySelector('.gallery-close')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog?.addEventListener('close', () => openedBy?.focus());

  const form = document.querySelector('#brief-form');
  if (form) {
    const topic = form.elements.topic;
    const requested = new URLSearchParams(location.search).get('topic');
    const validTopic = value => [...topic.options].some(o => o.value === value);
    if (requested && validTopic(requested)) topic.value = requested;
    let brief = '';
    const result = document.querySelector('#brief-result');
    const status = document.querySelector('#brief-status');
    const name = form.elements.name;
    const details = form.elements.details;
    const resetDraft = () => {
      result.hidden = true;
      status.textContent = '';
      brief = '';
    };
    form.addEventListener('input', () => {
      name.setCustomValidity('');
      details.setCustomValidity('');
      resetDraft();
    });
    form.addEventListener('change', resetDraft);
    form.addEventListener('submit', event => {
      event.preventDefault();
      name.setCustomValidity(name.value.trim() ? '' : 'Укажите имя или название организации.');
      details.setCustomValidity(details.value.trim().length >= 12 ? '' : 'Опишите задачу хотя бы в 12 символах, не считая пробелы по краям.');
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      brief = ['Здравствуйте! Обращаюсь в лабораторию промышленного дизайна и инжиниринга Технопарка РГСУ.', '',
        `Имя / организация: ${String(data.get('name')).trim()}`,
        `Почта для ответа: ${String(data.get('email')).trim()}`,
        `Направление: ${data.get('topic')}`,
        `Желаемый срок: ${String(data.get('deadline')).trim() || 'нужно согласовать'}`, '',
        `Задача: ${String(data.get('details')).trim()}`].join('\n');
      document.querySelector('#brief-preview').value = brief;
      document.querySelector('#email-link').href = 'mailto:ganshinvk@rgsu.net?subject=' + encodeURIComponent('Лаборатория РГСУ — ' + data.get('topic')) + '&body=' + encodeURIComponent(brief);
      result.hidden = false;
      result.focus();
      status.textContent = 'Письмо подготовлено. Оно ещё не отправлено.';
    });
    document.querySelector('#copy-brief').addEventListener('click', async () => {
      const text = brief;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        if (brief === text) status.textContent = 'Текст скопирован. Вставьте его в письмо на ganshinvk@rgsu.net.';
      } catch {
        if (brief !== text) return;
        const preview = document.querySelector('#brief-preview');
        preview.focus();
        preview.select();
        status.textContent = 'Текст выделен. Скопируйте его вручную.';
      }
    });
    document.querySelector('#download-brief').addEventListener('click', () => {
      if (!brief) return;
      const url = URL.createObjectURL(new Blob(['Кому: ganshinvk@rgsu.net\n\n' + brief], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rgsu-lab-brief.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Текст подготовлен к скачиванию. Отправьте его по почте вместе с материалами.';
    });
    // Preserve an in-progress brief when a direction is chosen on this page.
    document.querySelectorAll('a[href*="topic="]').forEach(link => link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      const url = new URL(link.href, location.href);
      const current = new URL(location.href);
      const value = url.searchParams.get('topic');
      if (url.origin !== current.origin || url.pathname !== current.pathname || !validTopic(value)) return;
      event.preventDefault();
      topic.value = value;
      resetDraft();
      history.replaceState(null, '', url);
      document.querySelector('#request').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      topic.focus({ preventScroll: true });
      setMenu(false);
    }));
    // Fail closed: a script failure or disabled JavaScript must not GET-submit personal data.
    document.querySelector('#brief-fields').disabled = false;
    document.querySelector('#brief-offline').hidden = true;
  }
  if (mobile && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) ctaSections.add(entry.target);
        else ctaSections.delete(entry.target);
      });
      updateMobileCTA();
    }, { threshold: 0 });
    ['.hero-actions', '#request', '.lab-footer'].forEach(selector => {
      const section = document.querySelector(selector);
      if (section) observer.observe(section);
    });
  }
})();
