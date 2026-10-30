/*
 * InteractionGuide — three short, on-demand instructions for the current UI.
 *
 * InteractionGuide.html('engineering') -> compact trigger markup
 * InteractionGuide.steps('engineering') -> a fresh array of {title, body, visual}
 * const guide = InteractionGuide.mount(document, {onBeforeOpen?});
 * guide.open(context, opener); guide.close({restoreFocus:true});
 * guide.destroy({restoreFocus:false}); guide.isOpen;
 *
 * Destroy before replacing route markup. No automatic opening, timers, answers,
 * assessment calls, storage, network requests, or interaction with scene state.
 */
(function(global){
  'use strict';
  const controllers=new WeakMap();
  const FOCUSABLE='a[href],button,input,select,textarea,[tabindex]';
  const BODY_STYLES=['position','top','left','width','overflow','padding-right'];
  const SVG_NS='http://www.w3.org/2000/svg';
  let sequence=0;

  const GUIDES={
    labs:{label:'Карта лабораторий',steps:[
      ['Осмотрись в кампусе','Перетаскивай сцену пальцем или мышью. Кнопки + / − меняют масштаб; «Сброс ракурса» возвращает вид.','orbit'],
      ['Выбери лабораторию','Нажми маркер на здании или кнопку лаборатории под сценой. Рядом появится описание выбранной пробы.','choices'],
      ['Открой миссию','В описании нажми «Открыть миссию» или «Вернуться к миссии». «Обычный вид» позволяет выбирать лаборатории кнопками без 3D.','start']
    ]},
    engineering:{label:'Инженерия и 3D',steps:[
      ['Измени параметр','Передвигай ползунки «Толщина t, мм» и «Количество рёбер r». Кнопки − и + меняют значение на один шаг.','range'],
      ['Рассмотри результат','Модель и показатели обновляются сразу. «Крупно» открывает сцену вместе с настройками; «Обычный вид» показывает схему.','orbit'],
      ['Проверь, когда готов','Нажми «Проверить решение», чтобы сохранить проверенную попытку. До этого параметры можно менять и рассматривать модель с разных сторон.','check']
    ]},
    robotics:{label:'Робототехника',steps:[
      ['Собери программу','Кнопки ↑ ← ↓ → добавляют команды. Нажми команду в своей программе, чтобы удалить её. Счётчик показывает заполнение.','commands'],
      ['Посмотри каждый шаг','«Один шаг →» выполняет одну команду, «Пройти» запускает испытание. «Сначала» возвращает робота к началу программы.','play'],
      ['Проверь отдельной кнопкой','«Проверить решение» сохраняет проверенную попытку. Направление стрелок соответствует виду поля сверху; камеру можно поворачивать свободно.','check']
    ]},
    code:{label:'Код и данные',steps:[
      ['Найди стрелки у блоков','У каждого блока есть кнопки ↑ и ↓. Они перемещают его на одну позицию в списке.','order'],
      ['Переставь блоки','Нажимай стрелки мышью, касанием или с клавиатуры. Кнопка недоступна, когда в эту сторону перемещать уже некуда.','commands'],
      ['Проверь свой порядок','Когда готов, нажми «Проверить решение». После проверки блоки можно снова переставлять и запускать новую проверку.','check']
    ]},
    ai:{label:'Искусственный интеллект',steps:[
      ['Прочитай условие','Кнопка «Задание» возвращает к условию. «Рабочая область» переносит к материалам и карточкам вариантов.','start'],
      ['Выбери карточки','Здесь можно отметить несколько вариантов. Повторное нажатие на выбранную карточку снимает отметку.','choices'],
      ['Запусти проверку','Нажми «Проверить решение», когда закончишь выбор. Затем можно изменить отметки и проверить новый вариант.','check']
    ]},
    design:{label:'Дизайн и медиа',steps:[
      ['Открой рабочую область','Кнопки «Задание» и «Рабочая область» быстро переносят к условию и вариантам. Обе области находятся на этой странице.','start'],
      ['Отметь предложения','Можно выбрать несколько карточек. Нажми на карточку ещё раз, чтобы убрать её из своего набора.','choices'],
      ['Проверь выбранный набор','Кнопка «Проверить решение» сохраняет проверенную попытку. До нажатия можно менять свой выбор.','check']
    ]},
    xr:{label:'XR и игры',steps:[
      ['Собери три этапа','В каждом этапе выбери один вариант. Счётчик и кнопка «К невыбранному этапу» помогают вернуться к пропуску.','stages'],
      ['Испытай сценарий','Когда отмечены все этапы, нажми «Пройти как посетитель». Используй кнопки выставки; «Запустить снова» повторяет испытание.','play'],
      ['Сохрани проверенную попытку','Для проверки основной задачи вернись к заданию и нажми «Проверить решение». Испытание выставки доступно отдельно.','check']
    ]},
    research:{label:'Исследования и метрология',steps:[
      ['Посмотри измерения','В рабочей области находится список размеров. В каждой строке две кнопки: «В допуске» и «Вне допуска».','measure'],
      ['Отметь каждый размер','Нажми одну кнопку в строке. Вторую можно нажать, чтобы изменить выбор. «К неотмеченному размеру» покажет следующий пропуск.','choices'],
      ['Проверь свой список','Счётчик показывает, сколько строк отмечено. Когда готов, нажми «Проверить решение»; до этого выбор можно менять в любой строке.','check']
    ]},
    social:{label:'Социальные технологии',steps:[
      ['Собери набор','Нажимай карточки мероприятий или кнопки на схеме. Повторное нажатие убирает пункт из набора.','choices'],
      ['Следи за показателями','После каждого выбора обновляются остаток бюджета и показатели набора. Названия и стоимость видны на карточках.','budget'],
      ['Проверь свой вариант','Нажми «Проверить решение», чтобы проверить выбранный набор. После этого его можно пересобрать и проверить ещё раз.','check']
    ]},
    interests:{label:'Карточки интересов',steps:[
      ['Выбери удобный вид','В режиме «По одной» на экране одна карточка. «Весь блок» показывает карточки текущего блока вместе.','interest'],
      ['Поставь свою отметку','Нажми один из пяти ответов или «Пока не могу оценить». Чтобы изменить отметку, выбери другой ответ.','choices'],
      ['Продолжай в своём темпе','Номера карточек позволяют вернуться к ответу. Кнопка внизу открывает следующую карточку, следующий блок или ситуации.','start']
    ]},
    situations:{label:'Ситуации',steps:[
      ['Прочитай ситуацию','Описание находится над вариантами. Можно вернуться к нему, прежде чем делать выбор.','start'],
      ['Выбери один вариант','Нажми карточку варианта. Чтобы изменить выбор, нажми другую карточку.','choices'],
      ['Перейди к следующей','После выбора кнопка внизу открывает следующую ситуацию или следующий раздел. «Назад» возвращает к предыдущему экрану.','start']
    ]}
  };
  const ALIASES={campus:'labs',robot:'robotics',situation:'situations'};
  function contextOf(value){
    if(typeof value!=='string')return null;
    let key=value.trim().toLowerCase();if(key.startsWith('lab:'))key=key.slice(4);
    if(Object.hasOwn(ALIASES,key))key=ALIASES[key];
    return Object.hasOwn(GUIDES,key)?key:null;
  }
  function steps(context){const key=contextOf(context);return key?GUIDES[key].steps.map(([title,body,visual])=>({title,body,visual})):[];}
  function safe(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function html(context){
    const key=contextOf(context);if(!key)return '';
    return '<button type="button" class="ig-card" data-guide-open="'+key+'" aria-haspopup="dialog"><span class="ig-card-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none"><rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/></svg></span><span class="ig-card-copy"><strong>Как здесь работать</strong><span>3 коротких шага · '+safe(GUIDES[key].label)+'</span></span><span class="ig-card-arrow" aria-hidden="true">↗</span></button>';
  }
  function connected(node){return !!node&&(typeof node.isConnected==='boolean'?node.isConnected:!!node.ownerDocument?.documentElement?.contains(node));}
  function visible(node,view){
    if(!connected(node)||node.disabled||node.closest?.('[hidden],[inert],[aria-hidden="true"]'))return false;
    if(node.getClientRects&&!node.getClientRects().length)return false;
    const style=view.getComputedStyle?.(node);return !style||(style.display!=='none'&&style.visibility!=='hidden');
  }
  function restoreAttribute(node,name,value){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}
  function snapshotStyles(node){return BODY_STYLES.map(name=>({name,value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)}));}
  function restoreStyles(node,styles){for(const {name,value,priority}of styles){if(value)node.style.setProperty(name,value,priority);else node.style.removeProperty(name);}}

  // Static, decorative UI drawings. They never simulate a task result.
  function illustration(document,kind){
    const svg=document.createElementNS(SVG_NS,'svg');svg.setAttribute('viewBox','0 0 180 120');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    function shape(tag,attrs,text){const node=document.createElementNS(SVG_NS,tag);for(const [name,value]of Object.entries(attrs))node.setAttribute(name,String(value));if(text!==undefined)node.textContent=text;svg.append(node);return node;}
    const rect=(x,y,width,height,cls='ig-art-card',radius=7)=>shape('rect',{x,y,width,height,rx:radius,class:cls});
    const line=(x1,y1,x2,y2,cls='ig-art-line')=>shape('line',{x1,y1,x2,y2,class:cls});
    const text=(x,y,value,cls='ig-art-text')=>shape('text',{x,y,class:cls,'text-anchor':'middle','dominant-baseline':'middle'},value);
    if(kind==='orbit'){
      shape('ellipse',{cx:90,cy:68,rx:66,ry:27,class:'ig-art-orbit'});
      shape('path',{d:'M90 24 120 42 120 76 90 94 60 76 60 42Z',class:'ig-art-card'});
      shape('path',{d:'M90 24 120 42 90 60 60 42Z',class:'ig-art-tint'});
      shape('path',{d:'M60 42 90 60 120 42M90 60v34',class:'ig-art-line'});
      shape('path',{d:'m150 68 8 3-2-9',class:'ig-art-line'});
      shape('path',{d:'m31 75 1-18 15 12-8 1-3 8Z',class:'ig-art-primary'});
    }else if(kind==='range'){
      rect(23,28,34,28);text(40,42,'−');rect(123,28,34,28);text(140,42,'+');
      rect(27,78,126,6,'ig-art-muted',3);rect(27,78,61,6,'ig-art-primary',3);
      shape('circle',{cx:88,cy:81,r:10,class:'ig-art-knob'});
    }else if(kind==='commands'){
      for(const [x,y,sign]of [[73,17,'↑'],[35,55,'←'],[73,55,'↓'],[111,55,'→']]){rect(x,y,34,34);text(x+17,y+17,sign);}
      line(48,105,132,105,'ig-art-muted-line');
    }else if(kind==='order'){
      for(const y of [14,48,82]){rect(24,y,132,25);line(35,y+12,111,y+12,'ig-art-muted-line');text(139,y+12,'↕');}
    }else if(kind==='choices'){
      for(const [index,y]of [14,48,82].entries()){
        rect(20,y,140,25);rect(29,y+6,13,13,index===1?'ig-art-primary':'ig-art-card',4);line(53,y+12,143,y+12,'ig-art-muted-line');
      }
    }else if(kind==='stages'){
      line(39,57,141,57,'ig-art-muted-line');
      for(const [index,x]of [39,90,141].entries()){shape('circle',{cx:x,cy:57,r:18,class:'ig-art-card'});text(x,58,String(index+1));}
      line(29,94,151,94,'ig-art-muted-line');
    }else if(kind==='measure'){
      rect(24,36,132,13,'ig-art-tint',3);rect(78,25,23,40,'ig-art-card',4);
      line(27,28,27,70);line(27,70,43,70);line(99,50,99,70);line(83,70,99,70);
      for(let x=38;x<150;x+=12)line(x,37,x,43);
      rect(30,86,54,20);rect(96,86,54,20);
    }else if(kind==='budget'){
      for(const x of [25,70,115]){rect(x,23,36,42);line(x+9,35,x+27,35,'ig-art-muted-line');line(x+9,46,x+22,46,'ig-art-muted-line');}
      rect(25,87,126,7,'ig-art-muted',3);rect(25,87,73,7,'ig-art-primary',3);
    }else if(kind==='interest'){
      rect(22,21,136,24);line(37,33,143,33,'ig-art-muted-line');
      for(const x of [30,60,90,120,150])shape('circle',{cx:x,cy:79,r:11,class:'ig-art-card'});
    }else if(kind==='play'){
      rect(30,21,120,78);shape('path',{d:'m81 40 29 20-29 20Z',class:'ig-art-primary'});
      line(42,109,138,109,'ig-art-muted-line');
    }else if(kind==='check'){
      rect(21,39,138,42,'ig-art-primary',10);text(90,60,'Проверить решение','ig-art-button-text');
      line(47,23,133,23,'ig-art-muted-line');line(60,97,120,97,'ig-art-muted-line');
    }else{
      rect(34,14,112,92);line(50,34,129,34,'ig-art-muted-line');line(50,47,114,47,'ig-art-muted-line');
      rect(50,66,80,24,'ig-art-primary',6);text(90,79,'→','ig-art-button-text');
    }
    return svg;
  }

  function mount(document=global.document,options={}){
    if(!document?.body||!document.createElement)throw new TypeError('InteractionGuide.mount needs a document');
    controllers.get(document)?.destroy();
    const view=document.defaultView||global;
    let current=null,destroyed=false;
    function element(tag,className,text){const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;}
    function foreignModal(){return [...document.querySelectorAll('[aria-modal="true"],dialog[open]')].some(node=>node!==current?.overlay&&visible(node,view));}
    function close({restoreFocus=true}={}){
      const session=current;if(!session)return false;current=null;
      session.listeners.splice(0).forEach(remove=>remove());
      for(const item of session.background){restoreAttribute(item.node,'aria-hidden',item.ariaHidden);restoreAttribute(item.node,'inert',item.inertAttribute);if(typeof item.inert==='boolean')item.node.inert=item.inert;}
      session.overlay.remove();restoreStyles(document.body,session.bodyStyles);
      if(session.opener){restoreAttribute(session.opener,'aria-expanded',session.openerAttrs.expanded);restoreAttribute(session.opener,'aria-controls',session.openerAttrs.controls);}
      view.scrollTo?.({left:session.scroll.x,top:session.scroll.y,behavior:'instant'});
      if(restoreFocus&&visible(session.opener,view))session.opener.focus?.({preventScroll:true});
      return true;
    }
    function paint(index,focus=true){
      const session=current;if(!session||!Number.isInteger(index)||index<0||index>=session.steps.length)return false;
      session.index=index;const step=session.steps[index];
      session.count.textContent='Шаг '+(index+1)+' из '+session.steps.length;
      session.title.textContent=step.title;session.title.setAttribute('aria-label',session.count.textContent+'. '+step.title);
      session.body.textContent=step.body;session.visual.replaceChildren(illustration(document,step.visual));
      session.previous.disabled=index===0;session.next.textContent=index===session.steps.length-1?'Понятно, вернуться':'Далее →';
      for(const [position,dot]of session.dots.entries()){
        dot.className='ig-dot'+(position===index?' is-current':position<index?' is-past':'');
        if(position===index)dot.setAttribute('aria-current','step');else dot.removeAttribute('aria-current');
      }
      session.content.scrollTop=0;
      if(focus)session.title.focus({preventScroll:true});
      return true;
    }
    function open(context,trigger){
      const key=contextOf(context);if(destroyed||!key)return false;
      if(current?.context===key)return true;
      const previousOpener=current?.opener;
      if(current)close({restoreFocus:false});
      if(typeof options.onBeforeOpen==='function'&&options.onBeforeOpen()===false)return false;
      if(destroyed||foreignModal())return false;
      const opener=trigger?.nodeType===1&&trigger.ownerDocument===document?trigger:visible(previousOpener,view)?previousOpener:document.activeElement;
      const id='interaction-guide-'+(++sequence),overlay=element('div','ig-overlay');overlay.id=id;overlay.tabIndex=-1;
      overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby',id+'-heading');
      const dialog=element('section','ig-dialog'),header=element('header','ig-header'),heading=element('div','ig-heading');
      const kicker=element('p','ig-kicker',GUIDES[key].label),title=element('h2','ig-title','Как здесь работать');title.id=id+'-heading';heading.append(kicker,title);
      const closeButton=element('button','ig-close','×');closeButton.type='button';closeButton.setAttribute('data-guide-action','close');closeButton.setAttribute('aria-label','Закрыть подсказку');closeButton.setAttribute('title','Закрыть · Escape');header.append(heading,closeButton);
      const progress=element('div','ig-progress'),count=element('p','ig-count'),dotsList=element('ol','ig-dots'),dots=[];dotsList.setAttribute('aria-label','Шаги подсказки');
      const content=element('div','ig-content'),stepLayout=element('section','ig-step'),visual=element('div','ig-visual'),copy=element('div','ig-step-copy'),stepTitle=element('h3','ig-step-title'),body=element('p','ig-step-body');
      stepTitle.id=id+'-step-title';stepTitle.tabIndex=-1;body.id=id+'-step-body';stepTitle.setAttribute('aria-describedby',body.id);stepLayout.id=id+'-step';stepLayout.setAttribute('aria-labelledby',stepTitle.id);visual.setAttribute('aria-hidden','true');
      for(const [index,step]of steps(key).entries()){
        const item=element('li',''),dot=element('button','ig-dot');dot.type='button';dot.setAttribute('data-guide-step',String(index));dot.setAttribute('aria-label','Шаг '+(index+1)+' из 3. '+step.title);dot.setAttribute('aria-controls',stepLayout.id);
        const number=element('span','ig-dot-number',String(index+1));number.setAttribute('aria-hidden','true');dot.append(number);item.append(dot);dotsList.append(item);dots.push(dot);
      }
      progress.append(count,dotsList);copy.append(stepTitle,body);stepLayout.append(visual,copy);content.append(stepLayout);
      const footer=element('footer','ig-footer'),actions=element('div','ig-actions'),previous=element('button','ig-button ig-previous','← Назад'),next=element('button','ig-button ig-next','Далее →');
      previous.type='button';previous.setAttribute('data-guide-action','previous');next.type='button';next.setAttribute('data-guide-action','next');actions.append(previous,next);
      const keyNote=element('p','ig-key-note','Tab — кнопки · Enter / Пробел — действие · Esc — закрыть');footer.append(actions,keyNote);dialog.append(header,progress,content,footer);overlay.append(dialog);
      const session={context:key,steps:steps(key),index:0,overlay,opener,closeButton,count,dots,content,title:stepTitle,body,visual,previous,next,listeners:[],background:[],bodyStyles:snapshotStyles(document.body),scroll:{x:view.scrollX||0,y:view.scrollY||0},openerAttrs:{expanded:opener?.getAttribute('aria-expanded')??null,controls:opener?.getAttribute('aria-controls')??null}};
      current=session;document.body.append(overlay);paint(0,false);
      const scrollbar=Math.max(0,(view.innerWidth||document.documentElement.clientWidth)-document.documentElement.clientWidth),padding=parseFloat(view.getComputedStyle?.(document.body).paddingRight)||0;
      document.body.style.setProperty('position','fixed');document.body.style.setProperty('top',-session.scroll.y+'px');document.body.style.setProperty('left',-session.scroll.x+'px');document.body.style.setProperty('width','100%');document.body.style.setProperty('overflow','hidden');if(scrollbar)document.body.style.setProperty('padding-right',padding+scrollbar+'px');
      if(opener){opener.setAttribute('aria-expanded','true');opener.setAttribute('aria-controls',id);}
      stepTitle.focus({preventScroll:true});
      for(const node of [...document.body.children]){
        if(node===overlay||['SCRIPT','STYLE','LINK','TEMPLATE','NOSCRIPT'].includes(node.tagName))continue;
        session.background.push({node,ariaHidden:node.getAttribute('aria-hidden'),inertAttribute:node.getAttribute('inert'),inert:node.inert});node.inert=true;node.setAttribute('inert','');node.setAttribute('aria-hidden','true');
      }
      function bind(target,type,listener,capture=false){target.addEventListener(type,listener,capture);session.listeners.push(()=>target.removeEventListener(type,listener,capture));}
      bind(document,'keydown',event=>{
        if(current!==session||event.defaultPrevented||event.isComposing)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
        if(event.key!=='Tab')return;
        const nodes=[...overlay.querySelectorAll(FOCUSABLE)].filter(node=>visible(node,view)&&node.tabIndex>=0),first=nodes[0],last=nodes[nodes.length-1],active=document.activeElement;
        if(!first){event.preventDefault();overlay.focus({preventScroll:true});}
        else if(!overlay.contains(active)||(event.shiftKey&&(active===first||active===overlay))||(!event.shiftKey&&active===last)){event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});}
      },true);
      bind(document,'focusin',event=>{if(current===session&&!overlay.contains(event.target))closeButton.focus({preventScroll:true});},true);
      bind(overlay,'pointerdown',event=>{session.backdropPress=event.target===overlay;});bind(overlay,'pointercancel',()=>{session.backdropPress=false;});
      if(view.addEventListener)bind(view,'beforeprint',()=>close({restoreFocus:false}));
      return true;
    }
    function onClick(event){
      const trigger=event.target?.closest?.('[data-guide-open]');
      if(trigger){if(visible(trigger,view)&&open(trigger.getAttribute('data-guide-open'),trigger))event.preventDefault();return;}
      const session=current;if(!session)return;
      if(event.target===session.overlay){if(session.backdropPress||event.detail===0)close();session.backdropPress=false;return;}
      if(!session.overlay.contains(event.target))return;
      const dot=event.target.closest?.('[data-guide-step]');if(dot&&!dot.disabled){paint(Number(dot.getAttribute('data-guide-step')));return;}
      const button=event.target.closest?.('[data-guide-action]');if(!button||button.disabled)return;
      const action=button.getAttribute('data-guide-action');
      if(action==='close'){close();return;}
      if(action==='previous'){paint(session.index-1);return;}
      if(action==='next'){if(session.index===session.steps.length-1)close();else paint(session.index+1);}
    }
    document.addEventListener('click',onClick);
    const controller={open,close,get isOpen(){return !!current;},destroy({restoreFocus=false}={}){if(destroyed)return;close({restoreFocus});destroyed=true;document.removeEventListener('click',onClick);if(controllers.get(document)===controller)controllers.delete(document);}};
    controllers.set(document,controller);return controller;
  }
  const api={html,steps,mount};global.InteractionGuide=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
