const byId=id=>document.getElementById(id);
function number(value){if(!Number.isInteger(value)||value<0)throw new Error('Некорректные счётчики отчёта');return value;}
function row(label,values){const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;tr.append(th);for(const value of values){const td=document.createElement('td');td.textContent=String(number(value));tr.append(td);}return tr;}
async function render(){
  const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),15000);
  try{
    const response=await fetch('./assets/research-v019-summary.json',{signal:timeout.signal});
    if(!response.ok)throw new Error('Отчёт не загружен');
    const r=await response.json();
    if(r.schema_version!==1||r.version!=='0.19.0')throw new Error('Неизвестная версия отчёта');
    for(const part of ['train','validation','test'])byId(`${part}-count`).textContent=String(number(r.split_summary[part].clips));
    for(const [key,label] of [['baseline','21 образец · прежние пороги'],['expanded_fixed','76 образцов · прежние пороги'],['candidate','76 образцов · настроенные пороги']]){
      const data=r[key],known=data.known,unknown=data.unknown;
      if(known.correct+known.wrong+known.rejected!==known.total||unknown.false_accepted+unknown.rejected!==unknown.total)throw new Error('Счётчики отчёта не согласованы');
      byId('known-results').append(row(label,[known.correct,known.wrong,known.rejected,known.total]));
      byId('unknown-results').append(row(label,[unknown.false_accepted,unknown.rejected,unknown.total]));
    }
    byId('decision-text').textContent=r.decision;
    byId('threshold-text').textContent=r.candidate.enabled?`Параметры исследовательского кандидата: расстояние < ${r.candidate.thresholds.distance}, отрыв > ${r.candidate.thresholds.gap}. Их выбрали только на разделе настройки.`:'На разделе настройки не найден порог, который принимает хотя бы один известный жест без ошибочных принятых ответов. Исследовательский кандидат отказывает всем.';
    for(const text of r.limitations){const li=document.createElement('li');li.textContent=String(text);byId('experiment-limits').append(li);}
    byId('result-content').hidden=false;byId('result-status').textContent='Расчёт выполнен на реальных видеозаписях Slovo. Полный отчёт и состав выборки доступны ниже.';
  }catch(error){byId('known-results').replaceChildren();byId('unknown-results').replaceChildren();byId('result-content').hidden=true;byId('result-status').classList.add('error');byId('result-status').textContent='Не удалось открыть сводку. Проверьте соединение или откройте полный отчёт: ';const a=document.createElement('a');a.href='../research/v019/report.json';a.textContent='report.json';byId('result-status').append(a);}
  finally{clearTimeout(timer);}
}
render();
