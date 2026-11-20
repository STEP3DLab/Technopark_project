import {icon} from './icons.js';
const colors=['#aeedb8','#78daca','#e6c787','#a5b8ee'];
const time=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
const states={idle:'Ожидание',ready:'Готовность',running:'Сеанс',paused:'Пауза',stopped:'Остановлен'};
export function mountSimulator(onChange) {
  const el=id=>document.getElementById(id);
  const model={state:'idle',count:2,levels:[65,45,55,35],enabled:[true,true,true,true],elapsed:0,log:[]};
  const history=[], seriesSeconds=16;
  let offset=0,start=0,lastSecond=-1,lastSample=-1,frame=0;
  const elapsed=()=>model.state==='running' ? offset+(performance.now()-start)/1000 : offset;
  function record(message){
    const date=new Date();
    model.log.push({at:date.toISOString(),local:date.toLocaleTimeString('ru-RU',{hour12:false}),time:time(elapsed()),message});
    const row=document.createElement('li');const stamp=document.createElement('time');stamp.textContent=model.log.at(-1).local;
    row.append(stamp,document.createTextNode(message));el('event-log').prepend(row);
    if(model.log.length>500){model.log.shift();el('event-log').lastElementChild?.remove()}
    el('log-count').textContent=model.log.length;
  }
  function snapshot(){
    onChange({state:model.state,count:model.count,enabled:model.enabled.slice(),levels:model.levels.slice(),elapsed:time(elapsed())});
  }
  function sample(t,i){
    if(!model.enabled[i]||i>=model.count)return 0;
    return (model.levels[i]/100)*(.68+.15*Math.sin(t*2.1+i*1.4)+.085*Math.sin(t*4.7+i*.6)+.055*Math.cos(t*7.5+i));
  }
  function draw(){
    const canvas=el('trace'),r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);
    const width=r.width,height=r.height,left=2,right=width-2,top=7,bottom=height-7;
    c.lineWidth=1;c.strokeStyle='#8dad922f';c.beginPath();
    for(let i=0;i<=8;i++){const x=left+(right-left)*i/8;c.moveTo(x,top);c.lineTo(x,bottom)}
    for(let i=0;i<=4;i++){const y=top+(bottom-top)*i/4;c.moveTo(left,y);c.lineTo(right,y)}c.stroke();
    const now=elapsed(),min=Math.max(0,now-seriesSeconds),span=Math.max(seriesSeconds,now)-min;
    for(let channel=0;channel<model.count;channel++){
      if(!model.enabled[channel])continue;
      const floor=top+(bottom-top)*(channel+1)/model.count-3;
      const amplitude=(bottom-top)/model.count*.86;
      c.lineWidth=1.8;c.strokeStyle=colors[channel];c.beginPath();let began=false;
      for(const entry of history){
        if(entry.t<min-.1)continue;
        const x=left+(entry.t-min)/span*(right-left),y=floor-entry.y[channel]*amplitude;
        if(!began){c.moveTo(x,y);began=true}else c.lineTo(x,y);
      }
      if(!began){c.moveTo(left,floor);c.lineTo(right,floor);c.globalAlpha=.43}
      c.stroke();c.globalAlpha=1;
    }
  }
  function tick(){
    const now=elapsed(),s=Math.floor(now);
    if(model.state==='running'&&(lastSample<0||now-lastSample>=.075)){
      history.push({t:now,y:colors.map((_,i)=>sample(now,i))});lastSample=now;
      while(history.length&&history[0].t<now-seriesSeconds-.2)history.shift();draw();
    }
    if(lastSecond!==s){lastSecond=s;el('elapsed').textContent=time(now);snapshot()}
    if(model.state==='running')frame=requestAnimationFrame(tick);
  }
  function setStatus(state,message){const old=model.state;if(old==='running')offset=elapsed();model.state=state;if(state==='running')start=performance.now();if(message)record(message);cancelAnimationFrame(frame);render();tick()}
  const unlocked=()=>model.state==='idle'||model.state==='ready';
  function channelChanged(message){
    if(model.state==='ready')setStatus('idle','Параметры изменены. Повторите подготовку.');
    record(message);render();draw();
  }
  function render(){
    const active=model.enabled.slice(0,model.count).filter(Boolean).length;
    const state=el('sim-state');state.textContent=states[model.state];state.dataset.state=model.state;
    el('n2').setAttribute('aria-pressed',model.count===2);el('n4').setAttribute('aria-pressed',model.count===4);
    el('n2').disabled=el('n4').disabled=!unlocked();
    el('channel-count').textContent=active+' / '+model.count;
    el('graph-legend').innerHTML=Array.from({length:model.count},(_,i)=>'<span class="legend-item" style="--channel:'+colors[i]+'">К'+(i+1)+'</span>').join('');
    Array.from(el('channels').children).forEach((row,i)=>{
      row.hidden=i>=model.count;
      const toggle=row.querySelector('button'),slider=row.querySelector('input'),val=row.querySelector('output');
      toggle.setAttribute('aria-pressed',model.enabled[i]);toggle.disabled=!unlocked();slider.value=model.levels[i];slider.disabled=!unlocked()||!model.enabled[i];val.textContent=model.levels[i]+' %';
    });
    const options={idle:['play','Подготовить','Выберите каналы для демонстрации.'],ready:['play','Начать сеанс','Параметры готовы. Сеанс запустится по команде.'],running:['pause','Пауза','Сеанс идёт. Команда «Стоп» завершит запись.'],paused:['play','Продолжить','Запись приостановлена.'],stopped:['reset','Сбросить','Сеанс завершён. Журнал доступен для скачивания.']};
    const [symbol,label,hint]=options[model.state];el('primary-sim').innerHTML=icon(symbol)+'<span>'+label+'</span>';el('primary-sim').disabled=model.state==='idle'&&active===0;
    el('stop-sim').disabled=!['ready','running','paused'].includes(model.state);
    el('sim-hint').textContent=!active?'Включите хотя бы один канал.':hint;el('export-log').disabled=!model.log.length;
    snapshot();
  }
  for(let i=0;i<4;i++){
    const row=document.createElement('div');row.className='channel-row';
    row.innerHTML='<button class="toggle" type="button" aria-label="Включить канал '+(i+1)+'"></button><label for="level-'+i+'">Канал '+String(i+1).padStart(2,'0')+'</label><input id="level-'+i+'" type="range" min="0" max="100" step="5" aria-label="Уровень индикации канала '+(i+1)+'"><output></output>';
    const toggle=row.querySelector('button'),slider=row.querySelector('input');
    toggle.onclick=()=>{if(!unlocked())return;model.enabled[i]=!model.enabled[i];channelChanged('Канал '+(i+1)+(model.enabled[i]?' включён.':' выключен.'))};
    slider.oninput=()=>{if(!unlocked())return;model.levels[i]=Number(slider.value);row.querySelector('output').textContent=slider.value+' %';snapshot()};
    slider.onchange=()=>channelChanged('Канал '+(i+1)+'. Уровень индикации '+slider.value+' %.');
    el('channels').append(row);
  }
  [2,4].forEach(n=>el('n'+n).onclick=()=>{if(!unlocked()||model.count===n)return;model.count=n;channelChanged('Выбрана конфигурация на '+n+' канала.')});
  el('primary-sim').onclick=()=>{
    if(model.state==='idle'&&model.enabled.slice(0,model.count).some(Boolean))setStatus('ready','Пульт готов к демонстрации.');
    else if(model.state==='ready')setStatus('running','Сеанс запущен.');
    else if(model.state==='running')setStatus('paused','Пауза.');
    else if(model.state==='paused')setStatus('running','Сеанс продолжен.');
    else if(model.state==='stopped'){offset=0;history.length=0;lastSample=-1;lastSecond=-1;setStatus('idle','Пульт сброшен.');draw()}
  };
  el('stop-sim').onclick=()=>{if(['ready','running','paused'].includes(model.state))setStatus('stopped','Остановка по команде оператора.')};
  el('export-log').onclick=()=>{
    const esc=v=>'"'+String(v).replaceAll('"','""')+'"';
    const csv='\uFEFF'+[['Время ISO','Таймер сеанса','Событие'],...model.log.map(e=>[e.at,e.time,e.message])].map(row=>row.map(esc).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download='LM-04-session.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  record('Симулятор открыт.');render();draw();new ResizeObserver(draw).observe(el('trace').parentNode);
}
