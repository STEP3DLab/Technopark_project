(() => {
  'use strict';
  const geometry = {radius:12,kneeRadius:31.5,neutralPose:225,limit:90,branches:[
    {key:'a',label:'A',sign:1,contact:90,active:30,adjacent:60,height:31.2,center:77,color:'#9ae4cc'},
    {key:'b',label:'B',sign:-1,contact:270,active:240,adjacent:210,height:36.8,center:199,color:'#ffc095'}
  ]};
  const el = id => document.getElementById(id);
  const slider = el('drum-angle'), play = el('play');
  const rad = d => d*Math.PI/180;
  const fmt = (value,digits=1) => value.toLocaleString('ru-RU',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const signed = (v,d=1) => (v>0?'+':v<0?'−':'') + fmt(Math.abs(v),d);
  const x0=147,r=39;
  function point(deg,y,radius=r){return [x0+radius*Math.cos(rad(deg)),y-radius*Math.sin(rad(deg))]}
  function wrapAngle(g,theta){return ((g.sign*(geometry.neutralPose+g.active+theta-g.contact))%360+360)%360;}
  function branchSvg(g,theta){
    const pos=geometry.neutralPose+g.active+theta;
    const wrap=wrapAngle(g,theta);
    const [px,py]=point(pos,g.center), [tx,ty]=point(geometry.neutralPose+g.adjacent+theta,g.center);
    const [cx,cy]=point(g.contact,g.center), mark=373-g.sign*r*rad(theta);
    return `<g fill="none"><circle cx="${x0}" cy="${g.center}" r="50" fill="#1a404b" stroke="#557079"/><circle cx="${x0}" cy="${g.center}" r="${r}" stroke="#67838a" stroke-dasharray="3 4"/><circle cx="${x0}" cy="${g.center}" r="7" stroke="#81969a"/><path d="M ${px} ${py} A ${r} ${r} 0 ${wrap>180?1:0} ${g.sign>0?1:0} ${cx} ${cy} H 504" stroke="${g.color}" stroke-width="3.5"/><circle cx="${px}" cy="${py}" r="4.8" fill="${g.color}"/><circle cx="${tx}" cy="${ty}" r="3.5" stroke="${g.color}"/><path d="M373 ${cy-12}v24" stroke="#c2d2d2" stroke-dasharray="3 3"/><rect x="277" y="${cy-7}" width="23" height="14" rx="3" stroke="#9aafb0"/><circle cx="${mark}" cy="${cy}" r="6" fill="${g.color}" stroke="#102d37" stroke-width="2"/></g><g font-family="system-ui,sans-serif" fill="${g.color}"><text x="18" y="${g.center+5}" font-size="23" font-weight="700">${g.label}</text><text x="202" y="${g.center+4}" font-size="15">z = ${fmt(g.height)} мм</text><text x="391" y="${g.center+4}" font-size="17">${theta===0?'середина':g.sign*theta>0?'← выборка':'отдача →'}</text></g>`;
  }
  function draw(){
    const t=Number(slider.value), travel=geometry.radius*rad(t);
    el('angle').textContent=signed(t,0)+'°';
    el('reserve').textContent='До края прогона влево '+(geometry.limit+t)+'°, вправо '+(geometry.limit-t)+'°';
    el('plots').innerHTML=geometry.branches.map(g=>branchSvg(g,t)).join('');
    geometry.branches.forEach(g=>{const delta=travel*g.sign;el(g.key).textContent=fmt(Math.abs(delta))+' мм';el(g.key+g.key).textContent=(delta>0?'Выбрано':delta<0?'Отдано':'Исходная отметка')+' · охват '+fmt(wrapAngle(g,t),0)+'°';});
    el('knee').textContent=signed(t*geometry.radius/geometry.kneeRadius)+'°';
    document.dispatchEvent(new CustomEvent('v04:angle',{bubbles:true,detail:t}));
  }
  let frame=0, direction=1,prev=0,position=0;
  function stop(){cancelAnimationFrame(frame);frame=0;play.textContent='▶ Пуск';play.setAttribute('aria-pressed','false');}
  function animate(now){if(prev){position+=direction*Math.min(80,now-prev)*.024;if(Math.abs(position)>=geometry.limit){position=direction*geometry.limit;direction*=-1}slider.value=Math.round(position);draw()}prev=now;frame=requestAnimationFrame(animate)}
  play.addEventListener('click',()=>{if(frame){stop();return}position=+slider.value;direction=position>=geometry.limit?-1:1;prev=0;play.textContent='Ⅱ Пауза';play.setAttribute('aria-pressed','true');frame=requestAnimationFrame(animate)});
  slider.addEventListener('input',()=>{stop();draw()});el('zero').addEventListener('click',()=>{stop();slider.value=0;draw()});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});draw();

  const storageKey = 'orthosis.bench-v04.free-travel.v1';
  const entries = [];
  let storageOK = true, restored = {};
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (data && typeof data === 'object' && !Array.isArray(data)) restored = data;
  } catch {
    storageOK = false;
  }

  function readShift(value) {
    const raw = value.trim().replace('−', '-').replace(',', '.');
    if (!raw) return null;
    if (!/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) return NaN;
    const n = Number(raw);
    return Number.isSafeInteger(Math.round(n * 100)) ? n : NaN;
  }

  function journalNumber(n) {
    return signed(Number(n.toFixed(2)), 2);
  }

  function refreshJournal() {
    let filled = 0, invalid = 0;
    for (const entry of entries) {
      const n = readShift(entry.input.value);
      const bad = Number.isNaN(n);
      entry.input.setAttribute('aria-invalid', String(bad));
      entry.error.hidden = !bad;
      entry.diff.textContent = n === null || bad ? '—' : journalNumber(n - entry.expected);
      if (bad) invalid++;
      else if (n !== null) filled++;
    }
    el('export-run').disabled = !filled || invalid > 0;
    el('run-count').textContent = invalid ? 'Исправьте поля с подсказкой для выгрузки.' : 'Записано ' + filled + ' из ' + entries.length + ' измерений';
    el('run-storage').textContent = storageOK
      ? 'Введённые значения сохраняются в этом браузере.'
      : 'Локальное сохранение недоступно. Для сохранения результатов скачайте CSV.';
  }

  function saveJournal() {
    const values = {};
    for (const entry of entries) {
      if (entry.input.value.trim()) values[entry.key] = entry.input.value;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
      storageOK = true;
    } catch {
      storageOK = false;
    }
    refreshJournal();
  }

  for (const angle of [-geometry.limit, 0, geometry.limit]) {
    const card = document.createElement('section');
    card.className = 'angle-card';
    const heading = document.createElement('h3');
    heading.textContent = 'θ = ' + signed(angle, 0) + '°';
    const show = document.createElement('a');
    show.href = '#motion';
    show.textContent = 'На схеме ↑';
    show.setAttribute('aria-label', 'Показать угол ' + signed(angle, 0) + ' градусов на схеме');
    show.addEventListener('click', () => { stop(); slider.value = angle; draw(); });
    const header = document.createElement('div');
    header.className = 'angle-heading';
    header.append(heading, show);
    const table = document.createElement('table');
    table.setAttribute('aria-label', 'Измерения при угле ' + signed(angle, 0) + ' градусов, в миллиметрах');
    table.innerHTML = '<thead><tr><th scope="col">Ветвь</th><th scope="col">Расчёт</th><th scope="col">Замер</th><th scope="col">Откл.</th></tr></thead>';
    const tbody = table.createTBody();
    card.append(header, table);
    el('journal').append(card);

    for (const branch of geometry.branches) {
      const key = angle + '_' + branch.key;
      const row = tbody.insertRow();
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = branch.label;
      th.className = 'branch-' + branch.key;
      row.append(th);
      const expected = -branch.sign * geometry.radius * rad(angle);
      row.insertCell().textContent = journalNumber(expected);
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'text'; // Numeric mobile layouts can omit the minus key.
      input.autocomplete = 'off';
      input.maxLength = 18;
      input.placeholder = '—';
      input.setAttribute('aria-label', 'Замер ветви ' + branch.label + ' при угле ' + signed(angle, 0) + ' градусов, в миллиметрах');
      const raw = restored[key];
      if (typeof raw === 'string' && raw.length <= input.maxLength) input.value = raw;
      row.insertCell().append(input);
      const diff = row.insertCell();
      const error = document.createElement('p');
      error.className = 'journal-error';
      error.id = 'error-' + key;
      error.textContent = 'Ветвь ' + branch.label + ' — введите число, до двух знаков после запятой.';
      error.hidden = true;
      card.append(error);
      input.setAttribute('aria-describedby', error.id);
      entries.push({key, angle, branch, expected, input, diff, error});
      input.addEventListener('input', saveJournal);
    }
  }
  refreshJournal();

  el('export-run').addEventListener('click', () => {
    const rows = [['Угол барабана от центра (град)', 'Ветвь', 'Расчётный сдвиг от барабана (+) / к барабану (−) (мм)', 'Измеренный сдвиг (мм)', 'Измерение минус расчёт (мм)']];
    const csvNumber = n => Number(n.toFixed(2)).toFixed(2).replace('.', ',');
    for (const entry of entries) {
      const n = readShift(entry.input.value);
      if (Number.isNaN(n)) return;
      if (n !== null) rows.push([entry.angle, entry.branch.label, csvNumber(entry.expected), csvNumber(n), csvNumber(n-entry.expected)]);
    }
    if (rows.length === 1) return;
    const csv = '\uFEFF' + rows.map(row => row.join(';')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'B04_V04_zamery.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
