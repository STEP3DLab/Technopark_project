/*
 * MissionFocus — an optional, temporary layout for all laboratory tasks.
 * MissionFocus.html() -> toggle bar markup, placed inside .studio-mission.
 * MissionFocus.mount(root, {active:false, onChange(active){}})
 *   -> {getView(): {active:boolean}, destroy()}.
 * Destroy before replacing route markup. The owner retains the preference.
 * No answers, assessment calls, storage, node moves, or scene recreation.
 */
(function(global){
  'use strict';
  const controllers=new WeakMap();
  const CLASS='is-mission-focused';
  const ATTRIBUTE='data-mission-focus';
  const DEFAULT_NOTE='Больше места для твоего решения.';
  const FOCUSED_NOTE='Главное на экране. Esc возвращает полный вид.';

  function html(){
    return '<div class="mf-bar" data-mission-focus-bar><div class="mf-copy"><strong>Вид задания</strong><span data-mission-focus-note>'+DEFAULT_NOTE+'</span></div><div class="mf-actions"><button type="button" class="mf-toggle" data-mission-focus-toggle aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="8" width="8" height="8" rx="2" fill="currentColor"/></svg><span>Только задание</span></button><button type="button" class="mf-exit" data-mission-focus-exit hidden>Полный вид</button></div><span class="mf-live" data-mission-focus-status role="status" aria-live="polite" aria-atomic="true"></span></div>';
  }
  function restoreAttribute(node,name,value){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}
  function visible(node,view){
    if(!node||!node.isConnected||node.closest?.('[hidden],[inert],[aria-hidden="true"]'))return false;
    if(node.getClientRects&&!node.getClientRects().length)return false;
    const style=view.getComputedStyle?.(node);return !style||(style.display!=='none'&&style.visibility!=='hidden');
  }
  function mount(root=global.document,{active=false,onChange}={}){
    const document=root?.ownerDocument||(root?.documentElement?root:null);
    if(!document?.documentElement||!root?.querySelector)throw new TypeError('MissionFocus.mount needs a document or an element');
    const view=document.defaultView||global;
    controllers.get(document)?.destroy();
    const mission=root.matches?.('.studio-mission')?root:root.querySelector('.studio-mission');
    const toggle=mission?.querySelector('[data-mission-focus-toggle]');
    const bar=toggle?.closest('[data-mission-focus-bar]');
    // Never enable a layout whose explicit exit controls are missing.
    const exit=bar?.querySelector('[data-mission-focus-exit]');
    if(!mission||!bar||!exit)return {getView:()=>({active:false}),destroy(){}};
    const note=bar.querySelector('[data-mission-focus-note]');
    const status=bar.querySelector('[data-mission-focus-status]');
    const original={classed:mission.classList.contains(CLASS),attribute:document.documentElement.getAttribute(ATTRIBUTE),pressed:toggle.getAttribute('aria-pressed'),bar:bar.getAttribute('data-active'),exitHidden:exit.hidden,note:note?.textContent,status:status?.textContent};
    let focused=false,destroyed=false;

    function foreignModal(){return [...document.querySelectorAll('[aria-modal="true"],dialog[open]')].some(node=>visible(node,view));}
    function paint(announce){
      const currentFocus=document.activeElement;
      mission.classList.toggle(CLASS,focused);
      if(focused)document.documentElement.setAttribute(ATTRIBUTE,'active');else document.documentElement.removeAttribute(ATTRIBUTE);
      bar.setAttribute('data-active',String(focused));
      toggle.setAttribute('aria-pressed',String(focused));
      exit.hidden=!focused;
      if(note)note.textContent=focused?FOCUSED_NOTE:DEFAULT_NOTE;
      if(announce&&status)status.textContent=focused?'Режим «Только задание» включён. Ответы не изменены.':'Полный вид восстановлен. Ответы не изменены.';
      // The exit button disappears on close. Other live controls keep focus.
      if(announce&&currentFocus&&currentFocus!==document.body&&!visible(currentFocus,view)&&!foreignModal())toggle.focus?.({preventScroll:true});
    }
    function change(next){
      if(destroyed||!mission.isConnected||focused===next||foreignModal())return false;
      focused=next;paint(true);
      if(typeof onChange==='function')onChange(focused);
      return true;
    }
    function onClick(event){
      if(destroyed||event.defaultPrevented)return;
      const button=event.target?.closest?.('[data-mission-focus-toggle],[data-mission-focus-exit]');
      if(!button||!bar.contains(button)||button.disabled||!visible(button,view))return;
      event.preventDefault();change(button===exit?false:!focused);
    }
    function onKey(event){
      if(!focused||destroyed||event.key!=='Escape'||event.defaultPrevented||event.isComposing||foreignModal())return;
      if(change(false)){event.preventDefault();event.stopPropagation();}
    }
    function destroy(){
      if(destroyed)return;destroyed=true;
      bar.removeEventListener('click',onClick);
      document.removeEventListener('keydown',onKey,true);
      mission.classList.toggle(CLASS,original.classed);
      restoreAttribute(document.documentElement,ATTRIBUTE,original.attribute);
      restoreAttribute(toggle,'aria-pressed',original.pressed);
      restoreAttribute(bar,'data-active',original.bar);
      exit.hidden=original.exitHidden;
      if(note)note.textContent=original.note;
      if(status)status.textContent=original.status;
      focused=false;
      if(controllers.get(document)===controller)controllers.delete(document);
    }
    const controller={getView:()=>({active:focused}),destroy};
    controllers.set(document,controller);
    focused=active===true;paint(false);
    bar.addEventListener('click',onClick);
    document.addEventListener('keydown',onKey,true);
    return controller;
  }
  const api={html,mount};
  global.MissionFocus=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
