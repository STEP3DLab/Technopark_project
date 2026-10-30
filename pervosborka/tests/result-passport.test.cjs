'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../dist/result-passport.js');
const model=()=>({sessionId:'V-TEST01',mode:'quick',date:'30.10.2026',answered:16,checked:2,markedPercent:100,tracks:Array.from({length:8},(_,i)=>({id:'track'+i,name:'Направление '+(i+1),color:'#2355ed',mean:i===0?null:i===1?1:i===2?5:3.5,count:i===0?0:2,total:2,eligible:i!==0,checked:i<2,hasReflection:i===1,reflection:null})),planned:[{id:'track1',name:'Инженерия',project:'Держатель для телефона'},{id:'track2',name:'Код',project:'Трекер проекта'}]});

test('The compact passport preserves zero counts, unknown means and the actual scale endpoints',()=>{
 const m=model(),html=P.html(m);
 assert.equal((html.match(/class="rp-track"/g)||[]).length,8);
 assert.match(html,/0 из 2 ответов/);
 assert.match(html,/Мало данных/);
 assert.match(html,/class="rp-value">1<small> \/ 5/);
 assert.match(html,/class="rp-value">5<small> \/ 5/);
 assert.match(html,/После пробы: пока не могу оценить/);
 assert.match(html,/data-passport-compact/);
 assert.match(html,/Подробная карта/);
 assert.match(P.html({...m,answered:0,checked:0}),/<strong>0<\/strong><span>ответов/);
});

test('Invalid data cannot become an eligible interest or a fabricated zero',()=>{
 const m=model();m.answered='16';m.checked=-1;m.tracks[1].mean=0;m.tracks[2].mean=Infinity;m.tracks[3].count=0;
 const html=P.html(m),svg=P.svg(m);
 assert.match(html,/<strong>—<\/strong><span>ответов/);
 assert.doesNotMatch(html,/class="rp-value">0<small>/);
 assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
 assert.ok((html.match(/Мало данных/g)||[]).length>=4);
 assert.match(P.html({...m,tracks:[{name:'Нет оценки',mean:null,count:0,total:6,eligible:true}]}),/Мало данных/);
 assert.doesNotMatch(P.html({...m,tracks:[{name:'Неизвестная рефлексия',mean:4,count:6,total:6,eligible:true,hasReflection:true,reflection:0}]}),/После пробы: пока не могу оценить/,'invalid zero is not an intentional null response');
});

test('SVG contains all eight directions and both projects, with no external resources or executable markup',()=>{
 const m=model();m.demo=true;m.sessionId='</text><script>alert(1)</script>';m.planned[0].project='<img src="https://evil.test" onerror="x"> & проект';
 const before=JSON.stringify(m),svg=P.svg(m);
 assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
 for(let i=1;i<=8;i++)assert.ok(svg.includes('Направление '+i));
 assert.match(svg,/Трекер проекта/);
 assert.match(svg,/&lt;img src=&quot;https:\/\/evil\.test&quot;/);
 assert.match(svg,/onerror=&quot;x&quot;&gt; &amp; проект/);
 assert.doesNotMatch(svg,/<(?:script|image|foreignObject|img)\b|(?:href|src)="|url\(/i);
 assert.match(svg,/ДЕМОНСТРАЦИОННЫЙ ПРИМЕР/);
 assert.equal(JSON.stringify(m),before);
 assert.match(P.svg({...model(),received:true}),/ТОЛЬКО ПРОСМОТР/);
});

test('Input length limits, explicit approximation and XML escaping keep the card bounded and meaningful',()=>{
 const m=model();m.tracks[1].mean=10/3;m.tracks[1].name='A'.repeat(5000);m.planned[1].project='B'.repeat(5000);m.date='"<&\u0001\uD800\uFFFE';
 const html=P.html(m),svg=P.svg(m);
 assert.match(html,/≈3,33/);
 assert.match(svg,/≈3,33/);
 assert.doesNotMatch(svg,/A{57}|B{111}|\u0001|\uD800|\uFFFE/);
 assert.match(svg,/&quot;&lt;&amp;/);
 assert.ok(svg.length<18000);
});

function mockRoot(){
 const listeners=new Map(),compact={id:'passport-compact',hidden:false},full={id:'',hidden:true};
 const buttons=['compact','full','download'].map(action=>({dataset:{passportAction:action},attrs:{},setAttribute(key,value){this.attrs[key]=value;},closest(){return this;}}));
 const status={textContent:''};
 const root={contains:el=>buttons.includes(el),querySelector:q=>q==='[data-passport-compact]'?compact:q==='[data-passport-full]'?full:q==='[data-passport-status]'?status:null,querySelectorAll:()=>buttons.slice(0,2),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 return {root,compact,full,buttons,status,listeners,click:i=>listeners.get('click')?.({target:buttons[i]})};
}

test('Compact/full switching stays outside the hidden section, restores a view and cleans up its listener',async()=>{
 const fake=mockRoot(),m=model(),before=JSON.stringify(m),downloads=[];
 const instance=P.mount(fake.root,{model:m,onDownload:(...args)=>downloads.push(args)});
 assert.equal(fake.compact.hidden,false);assert.equal(fake.full.hidden,true);
 await fake.click(1);assert.equal(fake.compact.hidden,true);assert.equal(fake.full.hidden,false);
 assert.deepEqual(instance.getView(),{mode:'full'});assert.equal(fake.buttons[1].attrs['aria-pressed'],'true');
 await fake.click(2);assert.equal(downloads.length,1);assert.equal(downloads[0][0],'pervosborka-passport-v-test01.svg');assert.equal(downloads[0][2],'image/svg+xml;charset=utf-8');
 instance.destroy();assert.equal(fake.listeners.size,0);assert.equal(JSON.stringify(m),before);
 const resumed=P.mount(fake.root,{model:m,view:{mode:'full'}});assert.equal(fake.full.hidden,false);resumed.destroy();
});
