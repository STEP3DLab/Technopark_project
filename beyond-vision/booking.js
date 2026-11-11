import {api,isConfigured} from './api.js?v=1.2.0';

const months=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const dayLabel=date=>new Date(`${date}T12:00:00+03:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',weekday:'long',timeZone:'Europe/Moscow'});
const dateKey=(year,month,day)=>`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
export async function renderBooking(main,{focusHeading,announce,esc}){
  document.title='Запись на посещение · За пределами зрения';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let year=Number(today.slice(0,4)),month=Number(today.slice(5,7))-1,selectedDate='',selectedSlot='',slots=[],sending=false,requestId=crypto.randomUUID();
  let loadMessage=isConfigured()?'Загружаем расписание…':'Онлайн-запись ещё не открыта. Доступные посещения появятся после открытия расписания.';
  const model={fullName:'',email:'',phone:'',assistance:'',consent:false};
  const available=s=>s.state==='open'&&s.free>0&&`${s.date}T${s.end}:00+03:00`>''&&new Date(`${s.date}T${s.end}:00+03:00`)>new Date();
  main.innerHTML=`<section class="booking-shell"><a class="back-link" href="#home">← На главную</a><div class="eyebrow">Участие в исследовании</div><h1>Запись на исследование</h1><p class="booking-lead">Площадка: Технопарк РГСУ, ул. Вильгельма Пика, 4, строение 8. Время московское.</p><div class="booking-layout"><div><section class="calendar-card" aria-labelledby="calendar-title"><div class="calendar-heading"><h2 id="calendar-title">Дата посещения</h2><div class="month-controls"><button type="button" id="previous-month" aria-label="Предыдущий месяц">←</button><button type="button" id="next-month" aria-label="Следующий месяц">→</button></div></div><div id="calendar-grid"></div><p class="calendar-legend"><span><i class="legend-dot open" aria-hidden="true"></i>Есть места</span><span><i class="legend-dot busy" aria-hidden="true"></i>Занято</span></p><p class="small muted" id="schedule-status" role="status">${loadMessage}</p><button id="refresh-slots" type="button" class="text-button" ${!isConfigured()?'disabled':''}>Обновить расписание</button></section><section class="times-card" aria-labelledby="times-title"><h2 id="times-title">Время посещения</h2><div id="slot-list"></div></section></div><form id="booking-form" class="booking-form"><h2>Ваша запись</h2><p class="small muted">После регистрации на вашу почту придут время посещения, логин и автоматически созданный пароль.</p><div class="selected-visit" id="selected-visit">Сначала выберите свободное время в расписании.</div><label class="field-label" for="visitor-name">Фамилия, имя, отчество</label><input id="visitor-name" class="standard-input" name="name" autocomplete="name" maxlength="160" required><label class="field-label spaced" for="visitor-email">Электронная почта</label><input id="visitor-email" class="standard-input" name="email" autocomplete="email" type="email" maxlength="180" required aria-describedby="email-hint"><p class="small muted" id="email-hint">Проверьте адрес: сюда придёт доступ к исследованию.</p><label class="field-label spaced" for="visitor-phone">Телефон</label><input id="visitor-phone" class="standard-input" name="tel" autocomplete="tel" type="tel" maxlength="30" required><label class="field-label spaced" for="visitor-assistance">Нужна ли помощь при посещении?</label><textarea id="visitor-assistance" class="standard-input assistance-input" maxlength="700" aria-describedby="assistance-hint"></textarea><p class="small muted" id="assistance-hint">Необязательно. Можно попросить встретить вас или указать, как удобнее связаться. Медицинские сведения не нужны.</p><label class="check-card"><input id="booking-consent" type="checkbox" required><span>Согласен(на) на сохранение данных для записи и отправку письма с доступом.<small>ФИО, почта и телефон доступны только организаторам. <a href="#privacy">Как хранятся данные</a>.</small></span></label><p class="error-message" id="booking-error" role="alert"></p><button id="book-button" class="button" type="submit" disabled>Записаться <span aria-hidden="true">→</span></button></form></div><p class="small muted booking-bottom">Нужна помощь с записью? Организатор может внести ваши данные и выбрать время вместе с вами. <a href="#visit">Как нас найти</a>.</p></section>`;
  const $=id=>document.getElementById(id);
  function capture(){model.fullName=$('visitor-name').value;model.email=$('visitor-email').value;model.phone=$('visitor-phone').value;model.assistance=$('visitor-assistance').value;model.consent=$('booking-consent').checked;}
  function calendar(){
    const start=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate();
    const total=Math.ceil((start+days)/7)*7;
    const cells=Array.from({length:total},(_,index)=>{
      const day=index-start+1;if(day<1||day>days)return '<td></td>';
      const date=dateKey(year,month,day),daySlots=slots.filter(s=>s.date===date),free=daySlots.filter(available).reduce((sum,s)=>sum+s.free,0),hasSlots=daySlots.length>0;
      return `<td>${hasSlots?`<button type="button" class="calendar-day ${free?'has-space':'fully-booked'} ${date===selectedDate?'selected':''}" data-date="${date}" aria-pressed="${date===selectedDate}" aria-label="${esc(dayLabel(date))}. ${free?`Свободных мест: ${free}`:'Все места заняты'}">${day}<span class="day-indicator" aria-hidden="true"></span></button>`:`<span class="calendar-day no-visits" aria-label="${esc(dayLabel(date))}. Посещений нет">${day}</span>`}</td>`;
    });
    $('calendar-grid').innerHTML=`<table class="calendar-table"><caption aria-live="polite">${months[month]} ${year}</caption><thead><tr>${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d,i)=>`<th scope="col"><abbr title="${['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'][i]}">${d}</abbr></th>`).join('')}</tr></thead><tbody>${Array.from({length:total/7},(_,r)=>`<tr>${cells.slice(r*7,r*7+7).join('')}</tr>`).join('')}</tbody></table>`;
    main.querySelectorAll('[data-date]').forEach(el=>el.addEventListener('click',()=>{capture();selectedDate=el.dataset.date;selectedSlot='';calendar();times();$('calendar-grid').querySelector(`[data-date="${selectedDate}"]`)?.focus();announce(`Выбрана дата: ${dayLabel(selectedDate)}`)}));
  }
  function times(){
    const options=slots.filter(s=>s.date===selectedDate);
    $('times-title').textContent=selectedDate?dayLabel(selectedDate):'Время посещения';
    $('slot-list').innerHTML=!selectedDate?'<p class="small muted">Выберите дату с отметкой в календаре.</p>':options.length?`<fieldset class="choice-fieldset"><legend class="sr-only">Доступное время, по Москве</legend><div class="time-options">${options.map(s=>`<label class="time-option ${!available(s)?'unavailable':''}"><input type="radio" name="visit-slot" value="${esc(s.id)}" ${s.id===selectedSlot?'checked':''} ${!available(s)?'disabled':''}><span><strong>${esc(s.start)}–${esc(s.end)}</strong><small>${available(s)?`Свободных мест: ${s.free}`:'Все места заняты'}</small>${s.note?`<small>${esc(s.note)}</small>`:''}</span></label>`).join('')}</div></fieldset>`:'<p class="small muted">На эту дату посещения не открыты.</p>';
    main.querySelectorAll('[name=visit-slot]').forEach(el=>el.addEventListener('change',()=>{selectedSlot=el.value;updateSelection()}));
    updateSelection();
  }
  function updateSelection(){
    const slot=slots.find(s=>s.id===selectedSlot);
    $('selected-visit').innerHTML=slot?`<strong>${esc(dayLabel(slot.date))}</strong><br>${esc(slot.start)}–${esc(slot.end)} · Москва<br><span class="small">${esc(slot.location||'Технопарк РГСУ, Вильгельма Пика, 4, стр. 8')}</span>`:'Сначала выберите свободное время в расписании.';
    $('book-button').disabled=!slot||!isConfigured()||sending;
  }
  async function load(){
    if(!isConfigured())return;
    $('refresh-slots').disabled=true;$('schedule-status').textContent='Обновляем расписание…';
    try{
      const result=await api('slots');if(!main.querySelector('#calendar-grid'))return;
      slots=result.slots;
      if(!selectedDate&&slots.length){selectedDate=slots.find(available)?.date||slots[0].date;year=Number(selectedDate.slice(0,4));month=Number(selectedDate.slice(5,7))-1}
      if(selectedSlot&&!available(slots.find(s=>s.id===selectedSlot)||{}))selectedSlot='';
      $('schedule-status').textContent=slots.length?'Расписание обновлено. Доступность перепроверяется при записи.':'Новые окна пока не открыты. Они появятся здесь, когда организатор опубликует расписание.';
      calendar();times();
    }catch(error){if($('schedule-status'))$('schedule-status').textContent='Не удалось обновить расписание. Проверьте соединение и повторите попытку.'}finally{if($('refresh-slots'))$('refresh-slots').disabled=false}
  }
  $('previous-month').addEventListener('click',()=>{if(month===0){year--;month=11}else month--;calendar()});
  $('next-month').addEventListener('click',()=>{if(month===11){year++;month=0}else month++;calendar()});
  $('refresh-slots').addEventListener('click',load);
  $('booking-form').addEventListener('submit',async e=>{
    e.preventDefault();if(sending)return;capture();
    if(!selectedSlot){$('booking-error').textContent='Выберите свободное время посещения.';return}
    if(!model.consent){$('booking-error').textContent='Для записи нужно согласие на сохранение данных и отправку письма.';return}
    if(model.phone.replace(/\D/g,'').length<10){$('booking-error').textContent='Укажите телефон с кодом страны или города.';$('visitor-phone').focus();return}
    sending=true;updateSelection();$('booking-error').textContent='';$('book-button').textContent='Сохраняем запись…';
    const slot=slots.find(s=>s.id===selectedSlot);
    try{
      const result=await api('book',{...model,slotId:selectedSlot,requestId},60000);
      main.innerHTML=`<section class="page-shell"><div class="eyebrow">Посещение подтверждено</div><div class="done-symbol" aria-hidden="true">✓</div><h1>Вы записаны</h1><p class="lead">${esc(dayLabel(slot.date))}<br>${esc(slot.start)}–${esc(slot.end)}, по Москве</p><p>Технопарк РГСУ<br>Вильгельма Пика, 4, строение 8</p><div class="notice ${result.emailStatus==='sent'?'neutral':''}">${result.emailStatus==='sent'?`Письмо с доступом отправлено на <strong>${esc(model.email)}</strong>. Если его не видно, проверьте папку «Спам».`:'Запись сохранена. Письмо с доступом пока не отправилось. Организатор видит это в таблице и сможет повторить отправку.'}</div><p class="small muted">Номер записи: <span class="receipt">${esc(result.bookingId)}</span></p><div class="access-summary"><h2>Ваш доступ к опросу</h2><dl><dt>Логин</dt><dd>${esc(result.credentials.login)}</dd><dt>Пароль</dt><dd class="credential">${esc(result.credentials.password)}</dd><dt>Код участника</dt><dd class="credential">${esc(result.credentials.code)}</dd></dl><p class="small muted">Сохраните эти данные. Для входа можно использовать код либо логин и пароль.</p></div><div class="confirmation-actions"><a class="button" href="#visit">Как нас найти →</a><button class="button secondary" id="add-calendar" type="button">Сохранить в календарь</button></div><p><a class="text-button" href="#access">Перейти ко входу в опрос</a></p></section>`;
      $('add-calendar').addEventListener('click',()=>saveCalendar(slot,result.bookingId));focusHeading();announce('Запись подтверждена. Доступ к опросу создан.');
    }catch(error){$('booking-error').textContent=error.message;if(error.code==='SLOT_FULL'){selectedSlot='';await load()}sending=false;updateSelection();$('book-button').textContent='Записаться →'}
  });
  calendar();times();focusHeading();load();
}
function saveCalendar(slot,id){
  const format=t=>new Date(`${slot.date}T${t}:00+03:00`).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const safe=s=>String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Beyond Vision//Research Visits//RU','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${id}@beyond-vision`,`DTSTAMP:${stamp}`,`DTSTART:${format(slot.start)}`,`DTEND:${format(slot.end)}`,'SUMMARY:За пределами зрения — исследование',`LOCATION:${safe(slot.location||'Москва, Вильгельма Пика, 4, строение 8')}`,'DESCRIPTION:Исследование тактильных интерпретаций картин. Доступ к опросу — в письме организатора.','END:VEVENT','END:VCALENDAR',''].join('\r\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Za_predelami_zreniya.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
