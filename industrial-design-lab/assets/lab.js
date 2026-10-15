'use strict';
(() => {
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#primary-navigation');
  const setMenu = (open, focus=false) => {
    nav?.classList.toggle('open', open);
    menu?.setAttribute('aria-expanded', String(open));
    menu?.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    if (focus) menu?.focus();
  };
  menu?.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav?.classList.contains('open')) setMenu(false,true); });
  document.addEventListener('click', event => {if (nav?.classList.contains('open') && !event.target.closest('.topbar')) setMenu(false);});
  window.matchMedia('(min-width:1001px)').addEventListener('change', e=>{if(e.matches)setMenu(false);});

  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  filterButtons.forEach(button => button.addEventListener('click', () => {
    filterButtons.forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    let count=0;
    document.querySelectorAll('[data-category]').forEach(card=>{const show=button.dataset.filter==='Все'||card.dataset.category===button.dataset.filter;card.hidden=!show;if(show)count++;});
    const status=document.querySelector('#filter-count');if(status)status.textContent=`Показано: ${count}`;
  }));

  const dialog=document.querySelector('.gallery-dialog');
  let openedBy=null;
  document.querySelectorAll('.gallery-open').forEach(button=>button.addEventListener('click',()=>{
    openedBy=button;
    const img=dialog.querySelector('img');img.src=button.dataset.image;img.alt=button.querySelector('img').alt;
    dialog.querySelector('p').textContent=button.dataset.caption;
    dialog.showModal();
  }));
  dialog?.querySelector('.gallery-close')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog?.addEventListener('close',()=>openedBy?.focus());

  const form=document.querySelector('#brief-form');
  if(form){
    const topic=form.elements.topic;
    const requested=new URLSearchParams(location.search).get('topic');
    if(requested && [...topic.options].some(o=>o.value===requested)) topic.value=requested;
    let brief='';
    const result=document.querySelector('#brief-result');
    const status=document.querySelector('#brief-status');
    form.addEventListener('input',()=>{if(!result.hidden){result.hidden=true;status.textContent='';}});
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(!form.reportValidity())return;
      const data=new FormData(form);
      brief=['Здравствуйте! Обращаюсь в лабораторию промышленного дизайна и инжиниринга Технопарка РГСУ.','',`Имя / организация: ${String(data.get('name')).trim()}`,`Почта для ответа: ${String(data.get('email')).trim()}`,`Направление: ${data.get('topic')}`,`Желаемый срок: ${String(data.get('deadline')).trim()||'нужно согласовать'}`,'',`Задача: ${String(data.get('details')).trim()}`].join('\n');
      document.querySelector('#brief-preview').value=brief;
      document.querySelector('#email-link').href='mailto:ganshinvk@rgsu.net?subject='+encodeURIComponent('Лаборатория РГСУ — '+data.get('topic'))+'&body='+encodeURIComponent(brief);
      status.textContent='Письмо подготовлено. Оно ещё не отправлено.';
      result.hidden=false;result.focus();
    });
    document.querySelector('#copy-brief').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(brief);status.textContent='Текст скопирован. Вставьте его в письмо на ganshinvk@rgsu.net.';}
      catch{const preview=document.querySelector('#brief-preview');preview.focus();preview.select();status.textContent='Текст выделен. Скопируйте его вручную.';}
    });
    document.querySelector('#download-brief').addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob(['Кому: ganshinvk@rgsu.net\n\n'+brief],{type:'text/plain;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='rgsu-lab-brief.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      status.textContent='Текст подготовлен к скачиванию. Отправьте его по почте вместе с материалами.';
    });
  }
  const mobile=document.querySelector('.lab-mobile-cta');
  const contact=document.querySelector('#request');
  if(mobile && contact && 'IntersectionObserver' in window){new IntersectionObserver(entries=>mobile.classList.toggle('is-hidden',entries[0].isIntersecting),{rootMargin:'0px',threshold:0}).observe(contact);}
})();
