'use strict';
const download=document.querySelector('#download');
const label=download.querySelector('span'),statusLine=document.querySelector('#download-status');
let active=false,readyUrl=null;
download.addEventListener('click',event=>{
  if(readyUrl || !window.Worker || !window.crypto?.subtle)return;
  event.preventDefault();
  if(active)return;
  active=true;download.setAttribute('aria-busy','true');label.textContent='Подготовка STL…';
  statusLine.textContent='Распаковываем файл для печати';
  let worker;
  function finish(){
    worker?.terminate();active=false;download.removeAttribute('aria-busy');label.textContent='Скачать STL';
  }
  function failed(){finish();statusLine.textContent='Скачайте исходную модель в ZIP по ссылке ниже.';}
  try{
    worker=new Worker('./download-worker.js');
    worker.onerror=failed;
    worker.onmessage=({data})=>{
      if(data.error){failed();return;}
      finish();readyUrl=URL.createObjectURL(new Blob([data.buffer],{type:'application/octet-stream'}));
      download.href=readyUrl;download.download='Plume_100mm.stl';download.click();
      statusLine.textContent='Файл готов · Plume_100mm.stl · 26,7 МБ';
    };
    worker.postMessage('download');
  }catch{failed();}
});
