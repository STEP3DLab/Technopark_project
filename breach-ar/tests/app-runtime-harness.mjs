import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.js';
import {GameEngine, createInvaderMesh, WAVE_CONFIG, UPGRADE_CATALOG} from '../engine.js';
import {SoundEngine} from '../audio.js';
import {CanvasRenderer} from '../canvas-renderer.js';
import {FrameClock} from '../runtime-clock.js';

export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
};
export const flush = async (count = 8) => { for (let i = 0; i < count; i++) await Promise.resolve(); };

// Runs the application's actual functions with controlled browser services.
// This exercises event handlers and asynchronous ownership; it does not claim
// to reproduce native button activation, browser rendering, or sensor behavior.
export function appFixture({sourceURL = new URL('../app.js', import.meta.url), navigator = {}, play, now = 1000} = {}) {
  const timers = new Map(), elements = new Map(), stores = new Map();
  let timerId = 0, time = now;
  const classList = () => {
    const items = new Set();
    return {add(...names) {names.forEach(n => items.add(n));}, remove(...names) {names.forEach(n => items.delete(n));}, contains(n) {return items.has(n);}, toggle(n, force) {const yes = force ?? !items.has(n); yes ? items.add(n) : items.delete(n); return yes;}};
  };
  class Element {
    constructor(id = '', tag = 'div') {
      this.id = id; this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
      this.classList = classList(); this.style = {setProperty() {}}; this.hidden = /dialog$/.test(id); this.listeners = new Map(); this.disabled = false;
      this.width = this.height = 120;
    }
    addEventListener(type, fn) {if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn);}
    removeEventListener(type, fn) {this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn));}
    dispatch(type, extra = {}) {const event = {type, target:this, currentTarget:this, defaultPrevented:false, preventDefault(){this.defaultPrevented=true;}, ...extra}; for (const fn of this.listeners.get(type) || []) fn(event); return event;}
    setAttribute(name, value) {this[name] = String(value);}
    getAttribute(name) {return this[name];}
    append(...items) {for (const item of items) {this.children.push(item); item.parentElement = this;}}
    replaceChildren(...items) {this.children = []; this.append(...items);}
    get firstElementChild() {return this.children[0] || null;}
    get lastElementChild() {return this.children.at(-1) || null;}
    focus() {document.activeElement = this;}
    querySelectorAll(selector) {const all = []; const walk = e => {for (const child of e.children) {all.push(child); walk(child);}}; walk(this); return selector.includes('button') ? all.filter(e => e.tagName === 'BUTTON' && (!selector.includes(':not([disabled])') || !e.disabled)) : [];}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    closest(selector) {return selector.startsWith('button') && this.tagName === 'BUTTON' ? this : this.parentElement?.closest(selector);}
    setPointerCapture() {}
    releasePointerCapture() {}
    getBoundingClientRect() {return {left:100, top:100, width:400, height:300};}
    play() {return play ? play() : Promise.resolve();}
    getContext() {return new Proxy({}, {get(target, key) {if (key === 'createRadialGradient') return () => ({addColorStop(){}}); return target[key] || (()=>{});}, set(target,key,value){target[key]=value; return true;}});}
  }
  const get = id => {if (!elements.has(id)) {const element=new Element(id);element.parentElement=document.body;elements.set(id,element);} return elements.get(id);};
  const document = new Element();
  Object.assign(document, {body:new Element('body'), visibilityState:'visible', hidden:false, getElementById:get, createElement:tag=>new Element('',tag), createElementNS:(_ns,tag)=>new Element('',tag), querySelector:selector=>selector.includes('difficulty')?{value:'normal'}:null});
  const window = new Element(); window.matchMedia = () => ({matches:false});
  const context = vm.createContext({THREE, GameEngine, createInvaderMesh, WAVE_CONFIG, UPGRADE_CATALOG, SoundEngine, CanvasRenderer, FrameClock, document, window, navigator, localStorage:{getItem:key=>stores.get(key)??null,setItem:(key,value)=>stores.set(key,value)}, location:{hostname:'test.invalid'}, screen:{orientation:{angle:0}}, innerWidth:1280, innerHeight:720, performance:{now:()=>time}, console, setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;}, clearTimeout:id=>timers.delete(id)});
  let source = fs.readFileSync(sourceURL, 'utf8').replace(/^import .*;\s*$/gm, '');
  const initialization = source.lastIndexOf('\ntry {\n  initScene();');
  if (initialization < 0) throw new Error('Application initialization marker changed; update the harness, not production code');
  source = source.slice(0, initialization);
  source += `\nglobalThis.app = {state, orientation, touchAim, startCamera, startAR, startDemo, home, restoreLobby, retry, beginMission, showUpgrades, chooseUpgrade, pauseGame, resumeGame, bindInput, frame, requestWakeLock, onOrientation, updateCamera, get stream(){return stream}, get session(){return session}, get hitSource(){return hitSource}, get previousTime(){return typeof frameClock!=='undefined'?frameClock.previous:previousTime}, get launchEpoch(){return launchEpoch}, get audio(){return audio}, setClock(value){if(typeof frameClock!=='undefined'){frameClock.reset();frameClock.tick(value);}else previousTime=value;}, resources(value){if(value.engine)engine=value.engine;if(value.renderer)renderer=value.renderer;if(value.scene)scene=value.scene;if(value.camera)camera=value.camera;if(value.xrAim)xrAim=value.xrAim;if(value.hero)hero=value.hero;if(value.environment)environment=value.environment;if(value.markers)markers=value.markers;if(value.placement)placement=value.placement;if('session'in value)session=value.session;if('trackingLost'in value)trackingLost=value.trackingLost;}};`;
  vm.runInContext(source, context, {filename:String(sourceURL)});
  vm.runInContext('app.onStats=onStats; app.onEvent=onEvent;',context);
  const engine = {phase:'playing',elapsed:0,stops:0,shots:0,setCamera(){},stop(){this.stops++;},start(){},getState(){return {phase:this.phase,upgradeOffers:[],upgrades:[]};},getPortals(){return[];},getEnemies(){return[];},fire(){this.shots++;return true;},pulse(){return true;},update(dt){this.elapsed+=dt;},pause(){this.beforePause=this.phase;this.phase='paused';},resume(){this.phase=this.beforePause||'playing';},chooseUpgrade(){return true;}};
  const renderer = {xr:{isPresenting:false,getReferenceSpace:()=>({}),setSession:async()=>{},},setSize(){},setClearColor(){},render(){}};
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(64,16/9,.05,100), hero = new THREE.Group(), placement = new THREE.Group();
  hero.add(new THREE.Group()); hero.children[0].name='specimen'; for(let i=0;i<3;i++)hero.add(new THREE.Group());
  placement.add(new THREE.Group(),new THREE.Group());
  context.app.resources({engine,renderer,scene,camera,xrAim:camera.clone(),hero,environment:new THREE.Group(),markers:new THREE.Group(),placement});
  return {app:context.app,engine,renderer,scene,camera,document,window,get,timers,stores,navigator,setTime(value){time=value;},runTimer(id){const item=timers.get(id);timers.delete(id);item?.fn();}};
}
