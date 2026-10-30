'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/scene-capture.js'),'utf8');
const PNG='data:image/png;base64,iVBORw0KGgo=';

// Transport-only image/canvas adapter: execute the real layout and download
// code; record pixel-copy dimensions and text extents without external assets.
function environment({width=640,height=380,imageError=false,noContext=false,encodeError=false,clickError=false}={}){
  const images=[],canvases=[],downloads=[],children=[],texts=[],draws=[];
  const ctx={font:'10px Arial',measureText(text){return {width:Array.from(text).length*Number(this.font.match(/(\d+)px/)[1])*.6};},fillRect(){},drawImage(...args){draws.push(args);},fillText(text,x,y){texts.push({text,x,y,width:this.measureText(text).width,font:this.font});}};
  const document={body:{appendChild(node){children.push(node);}},createElement(tag){
    if(tag==='img'){
      const image={naturalWidth:width,naturalHeight:height,set src(value){this.value=value;images.push(value);if(imageError)this.onerror?.();else this.onload?.();}};return image;
    }
    if(tag==='canvas'){
      const canvas={width:0,height:0,getContext(){return noContext?null:ctx;},toDataURL(type){assert.equal(type,'image/png');if(encodeError)throw new Error('encoding failed');return PNG;}};canvases.push(canvas);return canvas;
    }
    if(tag==='a')return {click(){if(clickError)throw new Error('download blocked');downloads.push({href:this.href,filename:this.download,hidden:this.hidden,tabIndex:this.tabIndex});},remove(){const index=children.indexOf(this);if(index>=0)children.splice(index,1);}};
    throw new Error('Unexpected element '+tag);
  }};
  const window={document};
  for(const name of ['VectorEngine','VECTOR_DATA','localStorage','sessionStorage','fetch','XMLHttpRequest','location','requestAnimationFrame','setTimeout'])Object.defineProperty(window,name,{get(){throw new Error('PNG export must not access '+name);}});
  const sandbox={window,module:{exports:{}}};vm.runInNewContext(source,sandbox,{filename:'scene-capture.js'});
  return {api:sandbox.module.exports,window,images,canvases,downloads,children,texts,draws};
}

test('A branded PNG retains the complete native frame and downloads once without mutating supplied captions or leaving DOM',async()=>{
  const env=environment(),options=Object.freeze({dataUrl:PNG,title:'Мой держатель',caption:'Толщина 3 мм · 4 ребра · сбоку',filename:'pervosborka-engineering-2026-10-30.png'});
  assert.equal(await env.api.download(options),true);
  assert.deepEqual(env.images,[PNG]);assert.equal(env.canvases.length,1);assert.equal(env.draws.length,1);
  const canvas=env.canvases[0],[image,x,y,width,height]=env.draws[0];assert.equal(image.value,PNG);assert.equal(x,0);assert.ok(y>0);assert.equal(width,640);assert.equal(height,380);assert.equal(canvas.width,640);assert.ok(canvas.height>y+height);
  assert.deepEqual(env.downloads,[{href:PNG,filename:options.filename,hidden:true,tabIndex:-1}]);assert.equal(env.children.length,0);
  const content=env.texts.map(entry=>entry.text).join(' ');assert.match(content,/ПЕРВОСБОРКА · Технопарк РГСУ/);assert.match(content,/Мой держатель/);assert.match(content,/Толщина 3 мм/);assert.match(content,/не является проверкой задания/);
  assert.equal(options.caption,'Толщина 3 мм · 4 ребра · сбоку');
});

test('Narrow frames keep branding, long titles and unbroken captions inside the exported image without cropping the scene',async()=>{
  for(const width of [160,345,768,2560]){
    const env=environment({width,height:310});assert.equal(await env.api.download({dataUrl:PNG,title:'Разнесённая конструкция и выбранные рёбра моего держателя',caption:'Параметр'+('длиннаяподпись'.repeat(20))}),true);
    const canvas=env.canvases[0],image=env.draws[0];assert.equal(image[3],width);assert.equal(image[4],310);
    for(const entry of env.texts){assert.ok(entry.x>=16);assert.ok(entry.x+entry.width<=width-15,'line fits at width '+width+': '+entry.text);assert.ok(entry.y>=0&&entry.y<canvas.height);}
    assert.equal(env.children.length,0);
  }
});

test('Only local PNG data is accepted; URLs and non-PNG payloads never create an image or a download',async()=>{
  const env=environment();
  for(const dataUrl of [undefined,null,'','https://example.com/private.png','blob:remote','data:image/svg+xml,<svg/>','data:image/jpeg;base64,YQ==','data:image/png;base64,','data:image/png;base64,not png'])assert.equal(await env.api.download({dataUrl}),false);
  assert.equal(await env.api.download(null),false);assert.equal(env.images.length,0);assert.equal(env.downloads.length,0);
});

test('Decode, dimensions, canvas, encoding and download failures return false without emitting a placeholder or leaving an anchor',async()=>{
  for(const options of [{imageError:true},{width:159},{height:99},{width:4097},{height:4097},{noContext:true},{encodeError:true},{clickError:true}]){
    const env=environment(options);assert.equal(await env.api.download({dataUrl:PNG}),false);assert.equal(env.downloads.length,0);assert.equal(env.children.length,0);
  }
});

test('Missing labels have useful defaults and filenames cannot introduce path segments or another file extension',async()=>{
  const env=environment();assert.equal(await env.api.download({dataUrl:PNG,filename:'../../<secret>/frame.svg.png'}),true);
  assert.match(env.downloads[0].filename,/\.png$/);assert.doesNotMatch(env.downloads[0].filename,/[/\\<>]/);assert.ok(!env.downloads[0].filename.startsWith('.'));
  assert.match(env.texts.map(entry=>entry.text).join(' '),/Мой 3D-вид/);
  const fallback=environment();assert.equal(await fallback.api.download({dataUrl:PNG,filename:'...'}),true);assert.equal(fallback.downloads[0].filename,'pervosborka-3d.png');
});
