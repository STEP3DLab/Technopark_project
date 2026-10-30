/*
 * FocusExperience — enlarge an existing scene without rebuilding its renderer.
 *
 * const focus = FocusExperience.mount({onChange?});
 * focus.open(sceneShell, opener, {companion: controlsOrPreview, additionalCompanion: metrics});
 * focus.close({restoreFocus: true});
 * focus.destroy({restoreFocus: false});
 * focus.isOpen; focus.getShell();
 *
 * Nodes are moved, never cloned. A comment preserves each original place.
 * Call destroy before the host destroys scenes or replaces its route markup.
 * The module has no dependency on task answers, grading, storage or TechScenes.
 */
(function(global){
  'use strict';
  const activeDocuments=new WeakMap();
  const FOCUSABLE='a[href],area[href],button,input,select,textarea,iframe,object,embed,[contenteditable="true"],[tabindex]';
  const BODY_STYLES=['position','top','left','width','overflow','padding-right'];
  let sequence=0;

  function element(document,tag,className,text){
    const node=document.createElement(tag);node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function connected(node){return !!node&&(typeof node.isConnected==='boolean'?node.isConnected:!!node.ownerDocument?.documentElement?.contains(node));}
  function visible(node){
    if(!node||!connected(node)||node.disabled||node.getAttribute?.('type')==='hidden')return false;
    if(node.closest?.('[hidden],[inert],[aria-hidden="true"]'))return false;
    if(typeof node.getClientRects==='function'&&!node.getClientRects().length)return false;
    const style=typeof global.getComputedStyle==='function'?global.getComputedStyle(node):null;
    return !style||(style.display!=='none'&&style.visibility!=='hidden');
  }
  function canFocus(node){return visible(node)&&typeof node.focus==='function';}
  function snapshotStyles(node){return BODY_STYLES.map(name=>({name,value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)}));}
  function restoreStyles(node,styles){for(const {name,value,priority} of styles){if(value)node.style.setProperty(name,value,priority);else node.style.removeProperty(name);}}
  function restoreAttribute(node,name,value){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}

  function mount(options={}){
    let current=null,destroyed=false;
    const notify=(open,shell,reason)=>{if(typeof options.onChange==='function')options.onChange({open,shell,reason});};
    function close({restoreFocus=true,reason='close'}={}){
      const session=current;if(!session)return false;
      current=null;
      const {document,overlay,opener,moves,background,bodyStyles,scroll,listeners,openerAttrs}=session;
      for(const remove of listeners.splice(0))remove();
      // Reveal the original route before returning focus or its moved children.
      for(const item of background){
        restoreAttribute(item.node,'aria-hidden',item.ariaHidden);
        restoreAttribute(item.node,'inert',item.inertAttribute);
        if(typeof item.inert==='boolean')item.node.inert=item.inert;
      }
      for(const move of moves.slice().reverse()){
        if(move.placeholder.parentNode)move.placeholder.parentNode.replaceChild(move.node,move.placeholder);
        else if(move.parent){
          if(move.next?.parentNode===move.parent)move.parent.insertBefore(move.node,move.next);
          else move.parent.appendChild(move.node);
        }else move.node.remove();
      }
      overlay.remove();
      restoreStyles(document.body,bodyStyles);
      if(opener){restoreAttribute(opener,'aria-expanded',openerAttrs.expanded);restoreAttribute(opener,'aria-controls',openerAttrs.controls);}
      if(activeDocuments.get(document)===controller)activeDocuments.delete(document);
      // The host may read scrollY immediately after close during a route render.
      // Ignore the page's smooth-scroll setting so that position is ready now.
      if(typeof global.scrollTo==='function')global.scrollTo({left:scroll.x,top:scroll.y,behavior:'instant'});
      if(restoreFocus&&canFocus(opener))opener.focus({preventScroll:true});
      // ResizeObserver handles the normal renderer; resize also supports its
      // documented fallback on browsers without that observer.
      if(typeof global.dispatchEvent==='function'&&typeof global.Event==='function')global.dispatchEvent(new global.Event('resize'));
      notify(false,session.shell,reason);
      return true;
    }
    function open(shell,trigger,{companion=null,additionalCompanion=null}={}){
      if(destroyed||!shell||shell.nodeType!==1||!shell.matches?.('.scene-shell')||!connected(shell))return false;
      const document=shell.ownerDocument;
      if(!document?.body||!document.createComment)return false;
      if(current?.shell===shell)return true;
      if(current)close({restoreFocus:false,reason:'replace'});
      const other=activeDocuments.get(document);if(other&&other!==controller)other.close({restoreFocus:false,reason:'replace'});
      function validCompanion(node){return !!node&&node.nodeType===1&&node.ownerDocument===document&&connected(node)&&node!==shell&&!node.contains(shell)&&!shell.contains(node);}
      if(!validCompanion(companion))companion=null;
      if(!validCompanion(additionalCompanion)||(companion&&(additionalCompanion===companion||additionalCompanion.contains(companion)||companion.contains(additionalCompanion))))additionalCompanion=null;

      const id='scene-focus-'+(++sequence),title=shell.getAttribute('aria-label')||'Исследование модели';
      const overlay=element(document,'div','fx-overlay');overlay.id=id;overlay.tabIndex=-1;
      overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-labelledby',id+'-title');overlay.setAttribute('aria-describedby',id+'-hint');
      const frame=element(document,'div','fx-dialog'+(companion||additionalCompanion?' has-companion':''));
      const header=element(document,'header','fx-header'),copy=element(document,'div','fx-heading');
      const kicker=element(document,'p','fx-kicker','РЕЖИМ ИССЛЕДОВАНИЯ');
      const heading=element(document,'h2','fx-title',title);heading.id=id+'-title';
      const hint=element(document,'p','fx-hint',shell.querySelector('.scene-mount')?.hidden?'Обычный вид. Настройки задания доступны рядом со схемой.':'Поверни модель перетаскиванием. Масштаб — кнопками + / −.');hint.id=id+'-hint';
      const closeButton=element(document,'button','fx-close');closeButton.type='button';closeButton.dataset.fxAction='close';
      closeButton.setAttribute('aria-label','Закрыть расширенный вид и вернуться к заданию');
      const closeIcon=element(document,'span','fx-close-icon','×');closeIcon.setAttribute('aria-hidden','true');
      const closeCopy=element(document,'span','fx-close-copy','Вернуться'),escape=element(document,'kbd','fx-escape','Esc');escape.setAttribute('aria-hidden','true');
      closeButton.append(closeIcon,closeCopy,escape);copy.append(kicker,heading,hint);header.append(copy,closeButton);
      const workbench=element(document,'div','fx-workbench'),stage=element(document,'div','fx-stage');
      workbench.append(stage);frame.append(header,workbench);overlay.append(frame);
      const opener=trigger&&trigger.nodeType===1&&trigger.ownerDocument===document?trigger:document.activeElement;
      const session={document,overlay,shell,opener,moves:[],background:[],bodyStyles:snapshotStyles(document.body),scroll:{x:global.scrollX||0,y:global.scrollY||0},listeners:[],openerAttrs:{expanded:opener?.getAttribute('aria-expanded')??null,controls:opener?.getAttribute('aria-controls')??null}};
      current=session;activeDocuments.set(document,controller);
      function move(node,host){
        const parent=node.parentNode,next=node.nextSibling,placeholder=document.createComment('scene-focus-return');
        parent.insertBefore(placeholder,node);session.moves.push({node,parent,next,placeholder});host.appendChild(node);
      }
      move(shell,stage);
      if(companion||additionalCompanion){
        const panel=element(document,'section','fx-panel');
        panel.setAttribute('aria-label',shell.dataset.sceneShell==='campus'?'Выбранная лаборатория':'Действия в лаборатории');
        workbench.append(panel);
        if(additionalCompanion)move(additionalCompanion,panel);
        if(companion)move(companion,panel);
      }
      document.body.appendChild(overlay);
      const scrollbar=Math.max(0,(global.innerWidth||document.documentElement.clientWidth)-document.documentElement.clientWidth);
      const bodyPadding=typeof global.getComputedStyle==='function'?parseFloat(global.getComputedStyle(document.body).paddingRight)||0:0;
      document.body.style.setProperty('position','fixed');document.body.style.setProperty('top',-session.scroll.y+'px');
      document.body.style.setProperty('left',-session.scroll.x+'px');document.body.style.setProperty('width','100%');document.body.style.setProperty('overflow','hidden');
      if(scrollbar)document.body.style.setProperty('padding-right',bodyPadding+scrollbar+'px');
      if(opener){opener.setAttribute('aria-expanded','true');opener.setAttribute('aria-controls',id);}
      closeButton.focus({preventScroll:true});
      for(const node of [...document.body.children]){
        if(node===overlay||['SCRIPT','STYLE','LINK','TEMPLATE','NOSCRIPT'].includes(node.tagName))continue;
        session.background.push({node,ariaHidden:node.getAttribute('aria-hidden'),inertAttribute:node.getAttribute('inert'),inert:node.inert});
        node.inert=true;node.setAttribute('inert','');node.setAttribute('aria-hidden','true');
      }
      function bind(target,event,listener,capture=false){target.addEventListener(event,listener,capture);session.listeners.push(()=>target.removeEventListener(event,listener,capture));}
      function tabbables(){return [...overlay.querySelectorAll(FOCUSABLE)].filter(node=>canFocus(node)&&node.tabIndex>=0);}
      function keydown(event){
        if(!current||current!==session)return;
        if(event.isComposing)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close({reason:'escape'});return;}
        if(event.key!=='Tab')return;
        const nodes=tabbables(),first=nodes[0],last=nodes[nodes.length-1],active=document.activeElement;
        if(!first){event.preventDefault();overlay.focus({preventScroll:true});return;}
        if(!overlay.contains(active)||(event.shiftKey&&(active===first||active===overlay))||(!event.shiftKey&&active===last)){
          event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});
        }
      }
      function focusin(event){if(current===session&&!overlay.contains(event.target))closeButton.focus({preventScroll:true});}
      let backdropPress=false;
      bind(closeButton,'click',()=>close({reason:'button'}));
      bind(overlay,'pointerdown',event=>{backdropPress=event.target===overlay;});
      bind(overlay,'pointercancel',()=>{backdropPress=false;});
      bind(overlay,'click',event=>{if(event.target===overlay&&(backdropPress||event.detail===0))close({reason:'backdrop'});backdropPress=false;});
      bind(document,'keydown',keydown,true);bind(document,'focusin',focusin,true);
      if(typeof global.addEventListener==='function')bind(global,'beforeprint',()=>close({restoreFocus:false,reason:'print'}));
      if(typeof global.dispatchEvent==='function'&&typeof global.Event==='function')global.dispatchEvent(new global.Event('resize'));
      notify(true,shell,'open');
      return true;
    }
    const controller={open,close,get isOpen(){return current!==null;},getShell:()=>current?.shell||null,destroy({restoreFocus=false}={}){if(destroyed)return;close({restoreFocus,reason:'destroy'});destroyed=true;}};
    return controller;
  }
  const api={mount};global.FocusExperience=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
