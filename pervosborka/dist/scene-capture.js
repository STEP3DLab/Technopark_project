/* Local PNG export for an already captured TechScenes frame.
 * SceneCapture.download({dataUrl,title?,caption?,filename?}) -> Promise<boolean>.
 * Accepts only a PNG data URL; no remote image loads, state, grades or storage.
 * The native scene pixels are retained, with a separate title and learning note.
 */
(function(global){
  'use strict';
  const PNG=/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
  function label(value,fallback,limit){return typeof value==='string'?(value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit)||fallback):fallback;}
  function filename(value){const stem=label(value,'pervosborka-3d',100).replace(/\.png$/i,'').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^[.-]+|[.-]+$/g,'').slice(0,90);return (stem||'pervosborka-3d')+'.png';}
  function wrap(ctx,value,width){
    if(!value)return [];
    const lines=[];let line='';
    for(const word of value.split(' ')){
      const candidate=line?line+' '+word:word;
      if(ctx.measureText(candidate).width<=width){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      // A long unbroken caption must stay inside the card too.
      for(const character of word){if(line&&ctx.measureText(line+character).width>width){lines.push(line);line='';}line+=character;}
    }
    if(line)lines.push(line);return lines;
  }
  function load(document,dataUrl){return new Promise(resolve=>{
    const image=document.createElement('img');
    image.onload=()=>{image.onload=null;image.onerror=null;resolve(image);};
    image.onerror=()=>{image.onload=null;image.onerror=null;resolve(null);};
    image.src=dataUrl;
  });}
  async function download(options={}){
    const document=global.document;
    if(!document?.body||!document.createElement||typeof options?.dataUrl!=='string'||options.dataUrl.length>32*1024*1024||!PNG.test(options.dataUrl))return false;
    let link=null;
    try{
      const image=await load(document,options.dataUrl);if(!image)return false;
      const width=image.naturalWidth,height=image.naturalHeight;
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<160||height<100||width>4096||height>4096)return false;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return false;
      const padding=Math.max(16,Math.min(48,Math.round(width*.04))),textWidth=width-padding*2;
      const titleSize=Math.max(20,Math.min(36,Math.round(width*.042))),copySize=Math.max(12,Math.min(20,Math.round(width*.024))),brandSize=Math.max(10,Math.min(15,Math.round(width*.016)));
      const title=label(options.title,'Мой 3D-вид',160),caption=label(options.caption,'',320);
      ctx.font='700 '+brandSize+'px Arial, sans-serif';const brands=wrap(ctx,'ПЕРВОСБОРКА · Технопарк РГСУ',textWidth),brandLine=Math.ceil(brandSize*1.4);
      ctx.font='700 '+titleSize+'px Arial, sans-serif';const titles=wrap(ctx,title,textWidth);
      ctx.font=copySize+'px Arial, sans-serif';const captions=wrap(ctx,caption,textWidth);
      const note='Учебная визуализация. Снимок не является проверкой задания.';
      const noteSize=Math.max(10,Math.min(15,copySize-1));ctx.font=noteSize+'px Arial, sans-serif';const notes=wrap(ctx,note,textWidth);
      const titleLine=Math.ceil(titleSize*1.25),copyLine=Math.ceil(copySize*1.45),noteLine=Math.ceil(noteSize*1.45);
      const header=padding+brands.length*brandLine+16+titles.length*titleLine+(captions.length?10+captions.length*copyLine:0)+padding;
      const footer=padding*2+notes.length*noteLine;
      canvas.width=width;canvas.height=header+height+footer;
      ctx.fillStyle='#f8faff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#2355ed';ctx.fillRect(0,0,width,5);
      ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle='#2355ed';ctx.font='700 '+brandSize+'px Arial, sans-serif';
      let y=padding;for(const line of brands){ctx.fillText(line,padding,y);y+=brandLine;}
      y+=16;
      ctx.font='700 '+titleSize+'px Arial, sans-serif';ctx.fillStyle='#14233f';for(const line of titles){ctx.fillText(line,padding,y);y+=titleLine;}
      if(captions.length){y+=10;ctx.font=copySize+'px Arial, sans-serif';ctx.fillStyle='#536986';for(const line of captions){ctx.fillText(line,padding,y);y+=copyLine;}}
      // No crop, stretch, reconstructed geometry, UI or fabricated results.
      ctx.drawImage(image,0,header,width,height);
      ctx.fillStyle='#d5e0f2';ctx.fillRect(0,header+height,width,1);
      y=header+height+padding;ctx.font=noteSize+'px Arial, sans-serif';ctx.fillStyle='#5c708d';for(const line of notes){ctx.fillText(line,padding,y);y+=noteLine;}
      const dataUrl=canvas.toDataURL('image/png');if(typeof dataUrl!=='string'||!PNG.test(dataUrl))return false;
      link=document.createElement('a');link.href=dataUrl;link.download=filename(options.filename);link.hidden=true;link.tabIndex=-1;document.body.appendChild(link);link.click();
      return true;
    }catch(_error){return false;}
    finally{link?.remove();}
  }
  const api=Object.freeze({download});global.SceneCapture=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
