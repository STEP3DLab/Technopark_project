import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8');
const D=JSON.parse(read('./data.json')),ui=read('./interface.js');
function extract(name){const start=ui.indexOf('function '+name+'(');assert.ok(start>=0,name);const next=ui.indexOf('\nfunction ',start+1);return ui.slice(start,next===-1?undefined:next)}
const ctx={D,byId:id=>D.nodes.find(n=>n.id===id),incident:id=>D.edges.filter(e=>e.a===id||e.b===id),selected:'batanov',path:null,type:'all',focusOnly:true,focusPage:0};
vm.createContext(ctx);vm.runInContext(['graphPool','visibleNodes','graphLabel'].map(extract).join('\n'),ctx);
const neighbors=ctx.graphPool().map(n=>n.id),seen=new Set();
for(let page=0;page<Math.ceil(neighbors.length/8);page++){ctx.focusPage=page;const list=ctx.visibleNodes();assert.equal(list[0].id,'batanov');assert.ok(list.length<=9);list.slice(1).forEach(n=>seen.add(n.id));}
assert.equal(seen.size,neighbors.length);for(const id of neighbors)assert.ok(seen.has(id));
ctx.focusPage=999;assert.ok(ctx.visibleNodes().length>1);assert.equal(ctx.focusPage,1);
ctx.focusOnly=false;ctx.focusPage=0;const all=new Set();for(let page=0;page<3;page++){ctx.focusPage=page;ctx.visibleNodes().forEach(n=>all.add(n.id))}assert.equal(all.size,D.nodes.length);
ctx.type='person';ctx.focusPage=999;assert.equal(ctx.visibleNodes().length,8);assert.equal(ctx.focusPage,0);
ctx.path={nodes:['batanov','mobot','chernobyl','rr','rtc']};assert.equal(ctx.visibleNodes().length,5);assert.equal(ctx.visibleNodes().at(-1).id,'rtc');
assert.equal(ctx.graphLabel('Мобот-Ч-ХВ',20).join(' '),'Мобот-Ч-ХВ');
assert.equal(ctx.graphLabel('Учебное пособие по робототехнике',20).join(' '),'Учебное пособие по робототехнике');
console.log('PASS v5: every graph neighbor reachable, overview pagination, filter clamping, path preservation and labels');

const storage=new Map(),storeKey='engineering-memory-favorites-v1';
const fakeNode={querySelector(){return null},setAttribute(){},open:false};
const fav={favoriteKey:storeKey,favorites:[],favoriteRaw:null,favoriteError:'',localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},document:{querySelector:()=>null},$:()=>fakeNode,render(){},toast(){},hydrateIcons(){}};
vm.createContext(fav);vm.runInContext(extract('initializeInterface')+'\n'+extract('toggleFavorite'),fav);
fav.initializeInterface();fav.toggleFavorite('batanov');assert.equal(fav.favorites.join(','),'batanov');assert.equal(storage.get(storeKey),'["batanov"]');
fav.initializeInterface();assert.equal(fav.favorites.join(','),'batanov');fav.toggleFavorite('batanov');assert.equal(fav.favorites.length,0);
storage.set(storeKey,'["mobot"]');fav.toggleFavorite('cable');assert.equal(storage.get(storeKey),'["mobot"]');assert.equal(fav.favorites.length,0,'A stale tab must not replace favorites');
fav.initializeInterface();fav.localStorage.setItem=()=>{throw Error('QuotaExceeded')};fav.toggleFavorite('cable');assert.equal(fav.favorites.join(','),'mobot');assert.equal(storage.get(storeKey),'["mobot"]');
storage.set(storeKey,'{"broken":true}');fav.initializeInterface();assert.ok(fav.favoriteError);fav.toggleFavorite('cable');assert.equal(storage.get(storeKey),'{"broken":true}');
console.log('PASS v5: favorites toggle/reload, concurrent-tab conflict, quota errors and malformed data preservation');

const core={window:{},URL};vm.createContext(core);vm.runInContext(read('./memory-core.js'),core);
const mentions={D,MemoryCore:core.window.MemoryCore,editingMaterial:'local-12345678',personal:{materials:[{id:'local-12345678',title:'Запись',text:'Батанов. Мобот-Ч-ХВ-2.',links:['mobot2']}]}};
vm.createContext(mentions);vm.runInContext(extract('preserveMentionChoice'),mentions);
assert.equal(mentions.preserveMentionChoice('batanov'),false);assert.equal(mentions.preserveMentionChoice('mobot2'),true);assert.equal(mentions.preserveMentionChoice('mrk25'),true);
mentions.editingMaterial=null;assert.equal(mentions.preserveMentionChoice('batanov'),true);
const html=read('./index.html');for(const file of ['interface.js','interface.css','app.js','data.js','memory-core.js','meeting-core.js','research-v4.js']){assert.ok(html.includes(file+'?v=5'));assert.ok(fs.statSync(new URL(file,import.meta.url)).size>0)}
assert.ok(html.includes('aria-controls="sidebar"'));assert.ok(html.includes('aria-controls="search-results"'));
console.log('PASS v5: excluded mention choices survive editing, new mentions are proposed and all interface assets are referenced');
