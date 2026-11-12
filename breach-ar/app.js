import * as THREE from './vendor/three.module.js';
import { GameEngine, createInvaderMesh, WAVE_CONFIG, UPGRADE_CATALOG } from './engine.js?v=3.0';
import { SoundEngine } from './audio.js?v=3.0';
import { CanvasRenderer } from './canvas-renderer.js?v=2.1';
import { FrameClock } from './runtime-clock.js?v=3.0';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const store = {
  get(key, fallback) { try { return localStorage.getItem(`breach.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`breach.${key}`, String(value)); } catch {} },
};
const state = { mode: 'lobby', stage: 'lobby', busy: false, firing: false, portals: [], difficulty: 'normal', muted: store.get('muted', 'false') === 'true', xrSupported: false, software: false };
const audio = new SoundEngine();
audio.setMuted(state.muted);
let renderer, engine, scene, camera, xrAim, hero, environment, placement, markers;
let session = null, stream = null, hitSource = null, hitPoint = null, wakeLock = null;
let uiTime = 0, toastTimer, bannerTimer, feedbackTimer, introTimer, pointer = null, trackingLost = false, graphicsLost = false;
let lastMode = 'demo', lastResult = null, launchEpoch = 0, capabilityEpoch = 0, wakeEpoch = 0, wakeRequest = null;
let lastUIPhase = '', lastCountdown = -1, lastWarningAt = -10000;
const frameClock = new FrameClock();
const firePointers = new Set();
let combatSpaceHeld = false, spaceFiring = false;
const transientTimers = new Map();
const ENEMY_LABELS = { scout: 'РАЗВЕДЧИК', drone: 'ПЕРЕХВАТЧИК', flanker: 'ФЛАНКЕР', charger: 'ТАРАН', tank: 'БРОНЕНОСЕЦ', boss: 'ЯДРО ВТОРЖЕНИЯ', projectile: 'ЗАРЯД', portal: 'ПОРТАЛ', shard: 'ОСКОЛОК ВРЕМЕНИ' };
const ENEMY_TIPS = { scout: 'Держи цель в центре и стреляй короткими очередями.', flanker: 'Меняет направление. Сопровождай цель и держи её в центре.', charger: 'Вспышка перед рывком — перехвати его или используй импульс.', tank: 'Удержи прицел на ядре: критический выстрел пробивает броню.', boss: 'Сбивай красные заряды. Атакуй ядро, когда защита открыта.', projectile: 'Сбей заряд одним выстрелом или очисти сектор импульсом.' };
const DIFFICULTY_LABELS = { easy: 'РАЗВЕДКА', normal: 'ВТОРЖЕНИЕ', hard: 'ХАОС' };
const MODE_LABELS = { demo: 'ТРЕНИРОВКА', camera: 'КАМЕРА', ar: 'AR' };
const UPGRADE_ICONS = { cooling: 'i-expand', capacitor: 'i-pulse', focus: 'i-crosshair', damage: 'i-crosshair', shield: 'i-shield', pulse: 'i-pulse', cadence: 'i-arrow' };
const vector = new THREE.Vector3(), quaternion = new THREE.Quaternion();
const orientation = { enabled: false, received: false, raw: new THREE.Quaternion(), zero: null, yaw: 0, pitch: 0, timer: null };
const touchAim = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
const touchLayout = () => innerWidth < 700 || window.matchMedia('(pointer: coarse)').matches;

function toast(message, duration = 2800) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => { $('toast').classList.remove('visible'); $('toast').hidden = true; }, duration);
}
function dialogOpen(id) { const d = $(id); if (d?.showModal && !d.open) d.showModal(); else if (d) d.hidden = false; d?.querySelector('button')?.focus(); }
function dialogClose(id) { const d = $(id); if (d?.close) d.close(); else if (d) d.hidden = true; }
function error(title, message, reason = '') {
  $('error-title').textContent = title; $('error-text').textContent = message;
  $('error-dialog').dataset.reason = reason; $('error-demo').disabled = graphicsLost;
  dialogOpen('error-dialog');
}
function graphicsError() {
  error('Графика приостановлена', 'Браузер освободил графическую память. Дождись восстановления графики или обнови страницу, чтобы вернуться в игру.', 'graphics');
}
function setBusy(busy, label = '') {
  state.busy = busy;
  for (const id of ['start-ar', 'start-camera', 'start-demo']) $(id).disabled = busy || graphicsLost || (id === 'start-ar' && !state.xrSupported) || (id === 'start-camera' && !navigator.mediaDevices?.getUserMedia);
  $('start-demo').hidden = busy;
  if ($('cancel-launch')) $('cancel-launch').hidden = !busy;
  if (label) $('capability').textContent = label;
}
function soundUI() {
  const button = $('sound-toggle');
  button.setAttribute('aria-pressed', String(!state.muted));
  button.setAttribute('aria-label', state.muted ? 'Включить звук' : 'Выключить звук');
  button.dataset.muted = String(state.muted);
  const label = button.querySelector('[data-sound-label]');
  if (label) label.textContent = state.muted ? 'Звук выключен' : 'Звук включён';
}

function initScene() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('scene'), alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    renderer = new CanvasRenderer({ canvas: $('scene') });
    state.software = true;
    document.body.classList.add('software-mode');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.xr.enabled = !state.software;
  renderer.xr.setReferenceSpaceType('local');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 100);
  xrAim = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 100);
  scene.add(new THREE.HemisphereLight(0xb4fff4, 0x243246, 2.2));
  const key = new THREE.DirectionalLight(0xe0ffff, 3.6); key.position.set(3, 5, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x33cdb8, 2.8); rim.position.set(-4, 1, -2); scene.add(rim);
  const warm = new THREE.DirectionalLight(0xff7057, 1.4); warm.position.set(4, -2, 1); scene.add(warm);
  hero = makeHero(); scene.add(hero);
  environment = makeArena(); environment.visible = false; scene.add(environment);
  markers = new THREE.Group(); scene.add(markers);
  placement = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.008, 6, 48), new THREE.MeshBasicMaterial({ color: 0x96fff1, transparent: true, opacity: 0.9 }));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), new THREE.MeshBasicMaterial({ color: 0xcffff8 }));
  placement.add(ring, dot); placement.visible = false; scene.add(placement);
  engine = new GameEngine({ renderer, scene, camera, onUpdate: onStats, onEvent: onEvent });
  resize(); renderer.setAnimationLoop(frame);
  $('loading').hidden = true;
  document.body.classList.add('ready', 'lobby-view');
}

function makeHero() {
  const group = new THREE.Group();
  const invader = createInvaderMesh('boss'); invader.name = 'specimen';
  group.add(invader);
  const box = new THREE.Box3().setFromObject(invader), size = box.getSize(new THREE.Vector3());
  invader.scale.setScalar(2.3 / Math.max(size.x, 0.01));
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x8bdace, transparent: true, opacity: 0.23, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65 + i * 0.11, 0.003, 4, 100, i === 1 ? Math.PI * 1.35 : Math.PI * 2), ringMaterial);
    ring.rotation.set(Math.PI / 2.3 + i * 0.65, i * 0.55, i * 0.8); group.add(ring);
  }
  const dustGeo = new THREE.BufferGeometry(), positions = [];
  for (let i = 0; i < 100; i++) {
    const a = i * 2.39996, r = 1.6 + (i % 13) / 13;
    positions.push(Math.cos(a) * r, Math.sin(a * 1.3) * r * .75, Math.sin(a) * .9);
  }
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x94e8db, size: 0.017, transparent: true, opacity: 0.5, depthWrite: false })));
  return group;
}

function makeArena() {
  const group = new THREE.Group();
  const grid = new THREE.GridHelper(70, state.software ? 28 : 70, 0x28645c, 0x142b30); grid.position.set(0, -1.6, -14);
  grid.material.transparent = true; grid.material.opacity = .55; group.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x080f15, roughness: .9, metalness: .15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.62, -14); group.add(floor);
  const pillarGeo = new THREE.BoxGeometry(1.2, 4.6, 1.2);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0b1b22, metalness: .55, roughness: .35 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2e6a68, transparent: true, opacity: .55 });
  for (let i = 0; i < (state.software ? 4 : 6); i++) {
    for (const sign of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat); pillar.position.set(sign * (4.4 + i * .4), .6, -4 - i * 5.5);
      pillar.add(new THREE.LineSegments(new THREE.EdgesGeometry(pillarGeo), edgeMat)); group.add(pillar);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(.035, 3.2, .04), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7156 : 0x77cbbb }));
      strip.position.set(sign * (3.78 + i * .4), .3, -3.38 - i * 5.5); group.add(strip);
    }
  }
  const geo = new THREE.BufferGeometry(), points = [];
  for (let i = 0; i < (state.software ? 75 : 220); i++) points.push(Math.sin(i * 128.1) * 25, Math.cos(i * 93.7) * 10 + 3, -Math.abs(Math.sin(i * 17.3)) * 40 - 3);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x85a9aa, size: .025, transparent: true, opacity: .5 })));
  return group;
}

function setView(mode, stage) {
  state.mode = mode; state.stage = stage;
  document.body.classList.remove('lobby-view', 'playing', 'camera-mode', 'ar-mode', 'demo-mode', 'setup-mode');
  document.body.classList.add(mode === 'lobby' ? 'lobby-view' : `${mode}-mode`);
  if (['playing', 'paused', 'upgrade'].includes(stage)) document.body.classList.add('playing');
  if (stage === 'setup') document.body.classList.add('setup-mode');
  $('lobby').hidden = stage !== 'lobby'; $('hud').hidden = !['playing', 'paused', 'upgrade'].includes(stage);
  $('setup').hidden = stage !== 'setup'; $('results').hidden = stage !== 'results';
  $('upgrade-dialog').hidden = stage !== 'upgrade';
  if (stage !== 'playing') {
    document.body.classList.remove('rift-active');
    $('rift-hud').hidden = true; $('portal-status').hidden = true;
  }
  hero.visible = mode === 'lobby'; environment.visible = mode === 'demo';
  placement.visible = stage === 'setup'; markers.visible = stage === 'setup';
  scene.fog = mode === 'demo' ? new THREE.FogExp2(0x060b10, .025) : null;
  renderer.setClearColor(0x060b10, mode === 'demo' ? 1 : 0);
  $('camera-feed').hidden = mode !== 'camera';
  const modeText = mode === 'ar' ? 'ПРОСТРАНСТВЕННЫЙ AR' : mode === 'camera' ? 'КАМЕРА · 360°' : 'ТРЕНИРОВКА';
  $('mode-label').textContent = modeText;
  if ($('control-hint')) $('control-hint').textContent = mode === 'demo' ? touchLayout() ? 'ВЕДИ ПРИЦЕЛ ПАЛЬЦЕМ · УДЕРЖИВАЙ ОГОНЬ' : 'МЫШЬ — ПРИЦЕЛ · ПРОБЕЛ — ОГОНЬ · E — ИМПУЛЬС' : 'ПОВОРАЧИВАЙ ТЕЛЕФОН · ДЕРЖИ ПРИЦЕЛ ДЛЯ КРИТИЧЕСКОГО УДАРА';
  resize();
}

function resetAim() {
  camera.position.set(0, 0, 0); camera.quaternion.identity(); camera.updateMatrixWorld();
  touchAim.yaw = touchAim.pitch = touchAim.targetYaw = touchAim.targetPitch = 0;
  orientation.zero = null; orientation.yaw = 0;
}

async function capabilityCheck() {
  const check = ++capabilityEpoch;
  let supported = false;
  try { supported = !state.software && !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'); } catch {}
  if (check !== capabilityEpoch) return;
  state.xrSupported = supported;
  $('start-ar').disabled = state.busy || graphicsLost || !state.xrSupported;
  $('start-ar').setAttribute('aria-describedby', 'capability');
  $('start-camera').disabled = state.busy || graphicsLost || !navigator.mediaDevices?.getUserMedia;
  if (state.busy) return;
  $('capability').textContent = state.xrSupported ? 'Пространственный AR доступен на этом устройстве' : state.software ? 'Доступны камера и тренировка. Для пространственного AR нужна аппаратная 3D-графика.' : 'Доступны камера и тренировка. Пространственный AR не поддерживается этим браузером.';
}

function requestOrientation() {
  if (typeof DeviceOrientationEvent === 'undefined') return Promise.resolve(false);
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { return DeviceOrientationEvent.requestPermission().then(value => value === 'granted').catch(() => false); } catch { return Promise.resolve(false); }
  }
  return Promise.resolve(true);
}
function onOrientation(event) {
  if (event.alpha === null || event.beta === null || event.gamma === null) return;
  const radians = Math.PI / 180;
  const screenAngle = (screen.orientation?.angle ?? window.orientation ?? 0) * radians;
  const raw = new THREE.Quaternion().setFromEuler(new THREE.Euler(event.beta * radians, event.alpha * radians, -event.gamma * radians, 'YXZ'));
  raw.multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2));
  raw.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenAngle));
  orientation.raw.copy(raw); orientation.received = true;
  if (orientation.zero === null) {
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(raw);
    orientation.zero = Math.atan2(-direction.x, -direction.z);
  }
}

async function startCamera() {
  if (state.busy || !renderer || graphicsLost) return;
  const epoch = ++launchEpoch;
  audio.unlock();
  const permission = requestOrientation(); // Must originate in the same user gesture as the launch button.
  setBusy(true, 'Разрешите доступ к камере…');
  let acquired = null;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Camera unavailable'), { name: 'NotSupportedError' });
    acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (epoch !== launchEpoch) { releaseCameraStream(acquired); return; }
    stream = acquired;
    $('camera-feed').srcObject = acquired;
    await $('camera-feed').play();
    if (epoch !== launchEpoch || stream !== acquired) { releaseCameraStream(acquired); return; }
    const permitted = await permission;
    if (epoch !== launchEpoch || stream !== acquired) { releaseCameraStream(acquired); return; }
    orientation.enabled = permitted; orientation.received = false;
    resetAim(); window.addEventListener('deviceorientation', onOrientation);
    lastMode = 'camera'; prepareSetup('camera');
    orientation.timer = setTimeout(() => {
      if (epoch === launchEpoch && stream === acquired && !orientation.received && state.mode === 'camera') {
        orientation.enabled = false;
        $('mode-label').textContent = 'КАМЕРА · РУЧНОЙ ПРИЦЕЛ';
        toast('Датчик поворота недоступен. Двигайте прицел свайпом.', 5000);
      }
    }, 2300);
    requestWakeLock();
  } catch (cause) {
    releaseCameraStream(acquired);
    if (epoch !== launchEpoch) return;
    stopCamera();
    const message = cause.name === 'NotAllowedError' ? 'Разрешите камеру в настройках браузера для этого сайта и попробуйте ещё раз. Игра также доступна в тренировке без камеры.' : cause.name === 'NotFoundError' ? 'Камера не найдена. Подключите её или запустите тренировку.' : cause.name === 'NotReadableError' ? 'Камера занята другим приложением. Закройте его и попробуйте ещё раз.' : 'Не удалось запустить камеру. Откройте ссылку напрямую в Chrome или Safari по HTTPS. Можно начать с тренировки.';
    error('Камера пока недоступна', message);
  } finally { if (epoch === launchEpoch) { setBusy(false); capabilityCheck(); } }
}

async function startAR() {
  if (state.busy || !renderer || !navigator.xr || graphicsLost) return;
  const epoch = ++launchEpoch;
  // Keep requestSession before all awaits: browsers require transient activation.
  let acquired = null;
  try {
    const request = navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['dom-overlay'], optionalFeatures: ['hit-test', 'local-floor'], domOverlay: { root: $('overlay') } });
    audio.unlock(); setBusy(true, 'Запускаем пространственный AR…');
    acquired = await request;
    if (epoch !== launchEpoch) { try { await acquired.end(); } catch {} return; }
    session = acquired;
    session.addEventListener('end', onSessionEnd, { once: true });
    session.addEventListener('visibilitychange', () => { if (session === acquired && acquired.visibilityState !== 'visible') pauseGame(); });
    resetAim();
    await renderer.xr.setSession(session);
    if (epoch !== launchEpoch || session !== acquired) { try { await acquired.end(); } catch {} return; }
    engine.setCamera(xrAim);
    lastMode = 'ar'; trackingLost = true; prepareSetup('ar');
    try {
      const viewerSpace = await acquired.requestReferenceSpace('viewer');
      if (epoch !== launchEpoch || session !== acquired) return;
      const acquiredSource = await acquired.requestHitTestSource({ space: viewerSpace });
      if (epoch !== launchEpoch || session !== acquired) { try { acquiredSource.cancel(); } catch {} return; }
      try { hitSource?.cancel(); } catch {}
      hitSource = acquiredSource;
    } catch { if (epoch === launchEpoch && session === acquired) hitSource = null; }
    if (epoch !== launchEpoch || session !== acquired) return;
    requestWakeLock();
  } catch (cause) {
    if (epoch !== launchEpoch) return;
    if (acquired && session === acquired) { session = null; try { await acquired.end(); } catch {} }
    if (epoch !== launchEpoch) return;
    restoreLobby();
    error('AR не запустился', cause.name === 'NotAllowedError' ? 'Браузер не получил разрешение на AR. Разрешите доступ при следующем запуске или выберите «Играть с камерой».' : 'Для пространственного AR нужны совместимые телефон и браузер с экранными элементами управления. Попробуйте Chrome на Android с сервисами Google Play для AR или режим «Играть с камерой».');
  } finally { if (epoch === launchEpoch) { setBusy(false); capabilityCheck(); } }
}

async function startDemo() {
  if (state.busy || !renderer || graphicsLost) return;
  audio.unlock();
  if (session) {
    const endingEpoch = launchEpoch + 1;
    await home();
    if (launchEpoch !== endingEpoch) return;
  }
  // End a launch generation before starting a different mode.
  launchEpoch++; stopCamera();
  dialogClose('error-dialog'); audio.unlock(); resetAim(); engine.setCamera(camera);
  lastMode = 'demo'; state.portals = [];
  setView('demo', 'playing'); beginMission(); requestWakeLock();
}

function clearMarkers() {
  while (markers.children.length) {
    const item = markers.children[0]; markers.remove(item);
    item.traverse(node => { if (node.geometry) node.geometry.dispose(); if (node.material) node.material.dispose(); });
  }
}
function prepareSetup(mode) {
  state.portals = []; hitPoint = null; clearMarkers();
  if (mode === 'camera') engine.setCamera(camera);
  setView(mode, 'setup');
  $('portal-count').textContent = '0 / 3'; $('place-portal').disabled = false;
  $('begin-mission').textContent = 'Начать с автоматическими точками';
  $('setup-hint').textContent = mode === 'ar' ? 'Наведите телефон на угол или дверной проём и поставьте портал. Можно добавить до трёх точек.' : 'Наведитесь на угол и поставьте портал. В этом режиме точки сохраняют направление; оставайтесь на месте.';
  toast('Поставьте порталы у углов — или начните сразу', 4200);
}
function activeCamera() { return state.mode === 'ar' ? xrAim : camera; }
function placementPosition() {
  const cam = activeCamera();
  if (state.mode === 'ar' && hitPoint) return hitPoint.clone();
  return cam.getWorldPosition(new THREE.Vector3()).add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(3.2));
}
function placePortal() {
  if (state.stage !== 'setup' || state.portals.length >= 3) return;
  if (state.mode === 'ar' && trackingLost) { toast('Подождите, пока камера восстановит отслеживание'); return; }
  if (state.mode === 'camera' && orientation.enabled && !orientation.received) { toast('Калибруем поворот телефона…'); return; }
  const point = placementPosition();
  if (state.portals.some(p => p.distanceTo(point) < .65)) { toast('Выберите другую точку, немного дальше от предыдущей'); return; }
  state.portals.push(point.clone());
  const mark = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(.28 + i * .08, .012 - i * .006, 6, 56), new THREE.MeshBasicMaterial({ color: i ? 0xff856e : 0xa9fff0, transparent: true, opacity: .85 })); mark.add(torus);
  }
  mark.position.copy(point); mark.lookAt(activeCamera().position); markers.add(mark);
  $('portal-count').textContent = `${state.portals.length} / 3`;
  $('place-portal').disabled = state.portals.length >= 3;
  $('begin-mission').textContent = 'Начать вторжение';
  audio.hit(); vibrate(12); toast(`Портал ${state.portals.length} установлен`);
}
function autoPortals() {
  const cam = activeCamera(), origin = cam.getWorldPosition(new THREE.Vector3());
  const front = cam.getWorldDirection(new THREE.Vector3()); front.y = 0; if (front.lengthSq() < .001) front.set(0, 0, -1); front.normalize();
  return [-.48, 0, .48].map(angle => origin.clone().add(front.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).multiplyScalar(state.mode === 'demo' ? 7 : 3.8)));
}
function beginMission() {
  if (graphicsLost) { graphicsError(); return; }
  if (state.mode === 'ar' && trackingLost) { toast('Дождитесь, пока камера определит положение телефона'); return; }
  if (state.mode === 'camera' && orientation.enabled && !orientation.received) { toast('Калибруем поворот телефона…'); return; }
  clearCombatInput(); frameClock.reset(); lastResult = null; lastUIPhase = ''; lastCountdown = -1; lastWarningAt = -10000;
  clearCombatMessages();
  setView(state.mode, 'playing');
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'normal';
  state.difficulty = difficulty;
  engine.start({ mode: state.mode, difficulty, portals: state.portals.length ? state.portals : autoPortals() });
  const message = state.mode === 'demo' ? touchLayout() ? 'Прицел — свайпом. Огонь — кнопкой. Держи прицел на ядре для критического удара.' : 'Мышь — прицел. Пробел — огонь. Держи прицел на ядре для критического удара.' : 'Держи прицел на ядре для критического удара. Огонь — короткими очередями.';
  toast(message, 4800);
}

function onStats(stats) {
  if (performance.now() - uiTime < 70 && stats.shield > 0 && lastUIPhase === stats.phase) return;
  uiTime = performance.now();
  lastUIPhase = stats.phase;
  const total = stats.totalWaves || WAVE_CONFIG.length || 5;
  const canFire = ['playing', 'lastchance'].includes(stats.phase) && state.stage === 'playing' && !trackingLost;
  const portalTarget = stats.targetKind === 'portal' ? stats.portalTarget : null;
  const riftActive = !!stats.lastChance?.active && state.stage === 'playing';
  $('score').textContent = String(stats.score).padStart(5, '0');
  $('wave').textContent = `${String(Math.min(stats.wave || 1, total)).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  $('wave-name').textContent = stats.waveName || 'ПЕРВЫЙ КОНТАКТ';
  $('wave-progress').style.width = `${clamp(stats.waveProgress || 0, 0, 1) * 100}%`;
  $('wave-progress-label').textContent = stats.phase === 'intermission' ? 'СЛЕДУЮЩАЯ ВОЛНА' : stats.phase === 'upgrade' ? 'СЕКТОР ЗАЧИЩЕН' : stats.boss ? 'УНИЧТОЖЬ ЯДРО' : `ОСТАЛОСЬ ЦЕЛЕЙ: ${stats.remaining ?? stats.incoming ?? 0}`;
  $('shield-value').textContent = `${Math.max(0, Math.ceil(stats.shield))}%`;
  $('shield-bar').style.width = `${clamp(stats.shield / (stats.maxShield || 100), 0, 1) * 100}%`;
  $('shield-bar').parentElement.classList.toggle('critical', stats.shield <= 30);
  $('heat-bar').style.width = `${stats.heat}%`;
  $('heat-bar').parentElement.classList.toggle('hot', stats.heat > 75);
  $('heat-label').textContent = stats.heat >= 98 || stats.overheated ? 'ОХЛАЖДЕНИЕ' : 'ГОТОВ';
  $('combo').textContent = stats.combo > 1 ? `СЕРИЯ ×${stats.combo}` : '';
  $('combo').classList.toggle('active', stats.combo > 1);
  $('incoming').textContent = stats.incoming && !stats.boss ? `В СЕКТОРЕ / ${String(stats.incoming).padStart(2, '0')}` : '';
  $('reticle').classList.toggle('locked', !!stats.targeted);
  $('reticle').classList.toggle('critical-ready', !!stats.criticalReady);
  $('reticle').classList.toggle('shielded', !!stats.targetShielded);
  $('reticle').classList.toggle('portal-lock', !!portalTarget);
  $('reticle').style.setProperty('--focus', clamp(stats.focus || 0, 0, 1));
  $('focus-bar').style.width = `${clamp(portalTarget ? portalTarget.progress : stats.focus || 0, 0, 1) * 100}%`;
  $('focus-label').textContent = riftActive ? 'СБЕЙ ОСКОЛКИ' : portalTarget ? portalTarget.allied ? 'СОЮЗНАЯ ТУРЕЛЬ' : portalTarget.capturable ? 'УДЕРЖИВАЙ ОГОНЬ' : 'ПЕРЕХВАТ ИСПОЛЬЗОВАН' : stats.criticalReady ? 'КРИТИЧЕСКИЙ УДАР ГОТОВ' : stats.targetKind === 'projectile' ? 'ПЕРЕХВАТИ ЗАРЯД' : stats.targeted ? 'УДЕРЖИ ПРИЦЕЛ' : 'ФОКУС';
  $('target-label').textContent = portalTarget?.allied ? 'ПОРТАЛ ПОД КОНТРОЛЕМ' : stats.targeted ? ENEMY_LABELS[stats.targetKind] || 'ЦЕЛЬ' : riftActive ? 'НАЙДИ ОСКОЛОК' : 'ПОИСК ЦЕЛИ';
  $('target-hp-bar').style.width = `${stats.targeted ? clamp(stats.targetHp / Math.max(1, stats.targetMaxHp), 0, 1) * 100 : 0}%`;
  $('target-health').textContent = portalTarget ? portalTarget.capturable ? `${Math.round(portalTarget.progress * 6)} / 6` : '' : stats.targeted ? `${Math.max(0, Math.ceil(stats.targetHp ?? 1))} / ${stats.targetMaxHp || 1}${stats.targetShielded ? ' · БРОНЯ' : ''}` : '';
  $('target-hint').textContent = stats.targeted ? stats.targetHint || (stats.targetShielded ? 'Фокус пробивает защиту' : '') : '';
  const boss = stats.boss;
  $('boss-hud').hidden = !boss || riftActive;
  if (boss) {
    $('boss-name').textContent = 'ЯДРО ВТОРЖЕНИЯ';
    $('boss-phase').textContent = `ФАЗА ${boss.phase} / 3 · ${boss.label || 'КОНТАКТ'}`;
    $('boss-health').style.width = `${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%`;
    $('boss-health-value').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    $('boss-warning').textContent = boss.exposed ? 'ЯДРО ОТКРЫТО — АТАКУЙ' : boss.attackCharge > .68 ? 'ЗАЛП — СБИВАЙ КРАСНЫЕ ЗАРЯДЫ' : 'СБИВАЙ ЗАРЯДЫ · КОПИ ФОКУС';
    $('boss-hud').classList.toggle('exposed', !!boss.exposed);
    $('boss-hud').classList.toggle('charging', boss.attackCharge > .68 && !boss.exposed);
  }
  $('fire-button').disabled = !canFire;
  $('fire-button').classList.toggle('overheated', !!stats.overheated);
  const pulse = $('pulse-button'); pulse.disabled = stats.pulseCharge < 100 || !canFire || riftActive;
  pulse.style.setProperty('--charge', `${stats.pulseCharge}%`);
  const label = pulse.querySelector('[data-pulse-charge]'); if (label) label.textContent = riftActive ? 'ОГОНЬ' : stats.pulseCharge >= 100 ? 'ГОТОВ' : `${Math.floor(stats.pulseCharge)}%`;
  pulse.setAttribute('aria-label', riftActive ? 'В хроноразломе доступен только лазер' : stats.pulseCharge >= 100 ? 'Импульс готов: повредить и оглушить врагов, сбить заряды' : `Импульс заряжается: ${Math.floor(stats.pulseCharge)} процентов`);
  renderSpecialMechanics(stats, riftActive);
  if (stats.phase === 'intermission') {
    const count = Math.max(1, Math.ceil(stats.intermission));
    if (count !== lastCountdown) {
      lastCountdown = count;
      clearTimeout(bannerTimer);
      $('wave-banner').textContent = `СЛЕДУЮЩАЯ ВОЛНА ЧЕРЕЗ ${count}`;
      $('wave-banner').hidden = false; $('wave-banner').classList.add('visible');
    }
  }
  drawThreats(stats);
  drawRadar(stats);
}
function renderSpecialMechanics(stats, riftActive) {
  const combat = stats.phase === 'playing' && state.stage === 'playing';
  const portal = stats.portalTarget, allied = stats.capturedPortal;
  const showCapture = combat && portal?.capturable && stats.targetKind === 'portal';
  const budget = $('portal-budget');
  budget.hidden = !combat;
  budget.textContent = stats.portalCaptureReady ? 'ПЕРЕХВАТ / 1' : 'ПЕРЕХВАТ / ИСПОЛЬЗОВАН';
  budget.classList.toggle('used', !stats.portalCaptureReady);
  const status = $('portal-status');
  status.hidden = !combat || (!allied && !showCapture);
  status.classList.toggle('active', !!allied);
  if (combat && (allied || showCapture)) {
    $('portal-status-title').textContent = allied ? 'ПОРТАЛ-СОЮЗНИК' : 'ПЕРЕХВАТ ПОРТАЛА';
    $('portal-status-detail').textContent = allied ? `${Math.ceil(allied.remaining)} с · прикрывает сектор` : `${Math.round((portal.progress || 0) * 6)} / 6 · удерживай огонь по кольцу`;
    $('portal-progress').style.width = `${clamp(allied ? allied.remaining / (allied.duration || 10) : portal.progress || 0, 0, 1) * 100}%`;
  }
  document.body.classList.toggle('rift-active', riftActive);
  $('rift-hud').hidden = !riftActive;
  if (riftActive) {
    const rift = stats.lastChance;
    $('rift-timer').textContent = Math.max(0, rift.remaining).toFixed(1).replace('.', ',');
    $('rift-progress').style.width = `${clamp(rift.remaining / (rift.duration || 5), 0, 1) * 100}%`;
    $('rift-count').textContent = `${rift.collected} / ${rift.total}`;
    [...$('rift-pips').children].forEach((pip, index) => pip.classList.toggle('active', index < rift.collected));
  }
}
function onEvent(event) {
  switch (event.type) {
    case 'shot': audio.shot(); $('fire-button').classList.add('firing'); clearTimeout(transientTimers.get('fire-button')); transientTimers.set('fire-button', setTimeout(() => $('fire-button').classList.remove('firing'), 80)); break;
    case 'hit': audio.hit(); flash('hit-marker', 100); if (event.blocked) combatFeedback('БРОНЯ · УДЕРЖИ ПРИЦЕЛ', 'blocked', 650); break;
    case 'blocked': combatFeedback('БРОНЯ · УДЕРЖИ ПРИЦЕЛ', 'blocked', 650); break;
    case 'kill': audio.explosion(); flash('hit-marker', 130); if (event.points) combatFeedback(`${event.cause === 'critical' ? 'КРИТ  /  ' : event.cause === 'portal' ? 'ТУРЕЛЬ  /  ' : ''}+${event.points}${event.combo > 1 ? `  /  СЕРИЯ ×${event.combo}` : ''}`, event.cause === 'critical' ? 'critical' : ''); vibrate(10); break;
    case 'projectileclear': if (event.cause === 'laser') { audio.hit(); combatFeedback(`ПЕРЕХВАТ +${event.points || 30}`, '', 650); } break;
    case 'critical': audio.critical(); combatFeedback('КРИТИЧЕСКИЙ УДАР', 'critical', 800); flash('hit-marker', 160); vibrate(18); break;
    case 'focus': audio.focus(); break;
    case 'damage': audio.damage(); flash('damage-flash', 350); vibrate([30, 35, 45]); break;
    case 'pulse': audio.pulse(); combatFeedback('ИМПУЛЬС · СЕКТОР ПОДАВЛЕН', 'critical', 950); vibrate(40); break;
    case 'portalcaptured': audio.capture(); combatFeedback('ПОРТАЛ ПОД КОНТРОЛЕМ · 10 С', 'critical', 1300); vibrate([15, 30, 15]); break;
    case 'portalshot': audio.portalShot(); break;
    case 'portalexpired': toast('Перехват завершён. Новый — в следующей волне.', 2400); break;
    case 'lastchance': clearCombatMessages(); audio.rift(); vibrate([20, 40, 20]); break;
    case 'shardcollected': audio.shard(); flash('hit-marker', 130); break;
    case 'lastchancesaved': audio.riftSaved(); combatFeedback('ЩИТ ВОССТАНОВЛЕН · 35%', 'critical', 1700); vibrate(25); break;
    case 'lastchancefailed': clearCombatMessages(); break;
    case 'overheat': toast('Перегрев. Отпустите огонь для охлаждения', 1900); break;
    case 'wave': {
      audio.wave(); clearTimeout(bannerTimer); lastCountdown = -1;
      const number = event.wave || engine.getState().wave;
      const name = event.name || event.waveName || engine.getState().waveName || '';
      $('wave-banner').textContent = `${String(number).padStart(2, '0')} / ${name || 'КОНТАКТ'}`;
      $('wave-banner').hidden = false; $('wave-banner').classList.add('visible');
      bannerTimer = setTimeout(() => { $('wave-banner').classList.remove('visible'); $('wave-banner').hidden = true; }, 2200);
      break;
    }
    case 'warning':
      if (performance.now() - lastWarningAt > 2100) { lastWarningAt = performance.now(); audio.warning(); toast(event.message || 'Угроза рядом. Проверь указатель направления.', 1700); }
      break;
    case 'enemyintro': {
      clearTimeout(introTimer);
      $('enemy-intro-name').textContent = event.name || ENEMY_LABELS[event.kind] || 'НОВАЯ УГРОЗА';
      $('enemy-intro-tip').textContent = event.tip || ENEMY_TIPS[event.kind] || '';
      $('enemy-intro').hidden = false;
      introTimer = setTimeout(() => { $('enemy-intro').hidden = true; }, 5200);
      break;
    }
    case 'bossphase': audio.boss(); combatFeedback(`ЯДРО / ФАЗА ${event.phase || engine.getState().boss?.phase || 1}`, 'critical', 1700); break;
    case 'upgrade': showUpgrades(event); break;
    case 'upgradechosen': audio.upgrade(); break;
    case 'perfectwave': combatFeedback('ЧИСТАЯ ВОЛНА', 'critical', 1000); break;
    case 'gameover': finishGame(event.victory, event.state || engine.getState()); break;
  }
}
function flash(id, duration) { const element = $(id); clearTimeout(transientTimers.get(id)); element.hidden = false; element.classList.add('active'); transientTimers.set(id, setTimeout(() => { element.classList.remove('active'); element.hidden = true; }, duration)); }
function combatFeedback(message, type = '', duration = 620) {
  const element = $('combat-feedback'); clearTimeout(feedbackTimer);
  element.textContent = message; element.classList.remove('critical', 'blocked');
  if (type) element.classList.add(type);
  element.hidden = false; element.classList.add('visible');
  feedbackTimer = setTimeout(() => { element.classList.remove('visible'); element.hidden = true; }, duration);
}
function clearCombatMessages() {
  clearTimeout(bannerTimer); clearTimeout(feedbackTimer); clearTimeout(introTimer); clearTimeout(toastTimer);
  transientTimers.forEach(clearTimeout); transientTimers.clear();
  for (const id of ['wave-banner', 'combat-feedback', 'enemy-intro', 'hit-marker', 'damage-flash', 'toast']) {
    const element = $(id); if (!element) continue; element.hidden = true; element.classList.remove('visible', 'active');
  }
  $('fire-button').classList.remove('firing');
}
function renderLoadout(id, upgrades) {
  const container = $(id); container.replaceChildren();
  if (!upgrades?.length) { container.textContent = 'БАЗОВЫЙ БЛАСТЕР'; return; }
  for (const upgrade of upgrades) {
    const chip = document.createElement('span'); chip.className = 'loadout-chip';
    chip.textContent = `${upgrade.title || upgrade.id} ${upgrade.level > 1 ? 'II' : 'I'}`;
    chip.title = upgrade.stat || ''; container.append(chip);
  }
}
function showUpgrades(event) {
  clearCombatInput(); clearCombatMessages();
  const stats = engine.getState(), summary = event.summary || {};
  const offers = event.offers || stats.upgradeOffers || [];
  setView(state.mode, 'upgrade');
  $('upgrade-wave').textContent = `ВОЛНА ${String(summary.wave || stats.wave).padStart(2, '0')} / ${summary.waveName || stats.waveName || 'СЕКТОР ЗАЧИЩЕН'}`;
  const parts = [`${summary.waveKills || 0} целей`, `точность ${Math.round(summary.accuracy || 0)}%`];
  if (summary.perfect) parts.unshift('БЕЗ ПОВРЕЖДЕНИЙ');
  if (summary.bonus) parts.push(`+${summary.bonus} очков`);
  if (summary.repaired) parts.push(`щит +${Math.round(summary.repaired)}`);
  $('upgrade-summary').textContent = parts.join(' · ');
  const container = $('upgrade-options'); container.replaceChildren();
  for (const [index, offer] of offers.entries()) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'upgrade-option'; button.dataset.upgrade = offer.id;
    button.setAttribute('aria-label', `${offer.title}. ${offer.description}. ${offer.stat}. Выбрать улучшение.`);
    const icon = document.createElement('span'); icon.className = 'upgrade-icon'; icon.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${UPGRADE_ICONS[offer.id] || 'i-pulse'}`); svg.append(use); icon.append(svg); button.append(icon);
    for (const [className, value] of [['upgrade-level', `УРОВЕНЬ ${offer.level || 1} / 2`], ['upgrade-title', offer.title], ['upgrade-description', offer.description], ['upgrade-stat', offer.stat], ['upgrade-key', `${index + 1}`]]) {
      const span = document.createElement('span'); span.className = className; span.textContent = value || ''; button.append(span);
    }
    container.append(button);
  }
  renderLoadout('upgrade-loadout', stats.upgrades);
  container.querySelector('button')?.focus({ preventScroll: true });
}
function chooseUpgrade(id) {
  if (state.stage !== 'upgrade' || !engine.chooseUpgrade(id)) return;
  clearCombatInput(); setView(state.mode, 'playing'); frameClock.reset(); lastUIPhase = '';
  $('pause-button').focus({ preventScroll: true });
  const catalog = Array.isArray(UPGRADE_CATALOG) ? UPGRADE_CATALOG.find(item => item.id === id) : UPGRADE_CATALOG[id];
  toast(`Установлено: ${catalog?.title || 'улучшение'}`, 2000); requestWakeLock();
}
function drawThreats(stats) {
  const container = $('threat-indicators');
  if (!container.children.length) for (let i = 0; i < 3; i++) {
    const marker = document.createElement('div'); marker.className = 'threat-arrow'; marker.hidden = true;
    const arrow = document.createElement('span'); arrow.className = 'threat-chevron'; arrow.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-arrow'); svg.append(use); arrow.append(svg);
    const label = document.createElement('small'); marker.append(arrow, label); container.append(marker);
  }
  const projection = activeCamera().projectionMatrix.elements;
  const fovY = Math.atan(1 / Math.abs(projection[5])), fovX = Math.atan(1 / Math.abs(projection[0]));
  const threats = (stats.threats || []).filter(t => t.behind || Math.abs(t.angle) > fovX * .9 || Math.abs(t.elevation) > fovY * .9)
    .sort((a, b) => (b.urgency || 0) - (a.urgency || 0) || a.distance - b.distance).slice(0, 3);
  [...container.children].forEach((marker, index) => {
    const threat = threats[index]; marker.hidden = !threat || stats.phase !== 'playing'; if (!threat) return;
    const right = threat.angle >= 0;
    const vertical = !threat.behind && Math.abs(threat.elevation) > Math.abs(threat.angle) && Math.abs(threat.angle) < fovX;
    const edge = Math.max(6, 44 / innerWidth * 100);
    const x = vertical ? 50 : right ? 100 - edge : edge;
    const y = vertical ? threat.elevation > 0 ? 29 : 67 : clamp(47 - threat.elevation * 20 + index * 8, 30, 65);
    marker.style.left = `${x}%`; marker.style.top = `${y}%`; marker.style.transform = 'translate(-50%, -50%)';
    const rotation = vertical ? threat.elevation > 0 ? -90 : 90 : right ? 0 : 180;
    marker.firstElementChild.style.transform = `rotate(${rotation}deg)`;
    marker.classList.toggle('urgent', threat.distance < 2.3 || threat.urgency > .7);
    marker.lastElementChild.textContent = threat.kind === 'projectile' ? 'ЗАРЯД' : threat.behind ? 'СЗАДИ' : `${threat.distance.toFixed(1)} м`;
  });
}
function vibrate(pattern) { if (!state.muted && navigator.vibrate) navigator.vibrate(pattern); }
function drawRadar(stats) {
  const canvas = $('radar'), ctx = canvas?.getContext('2d'); if (!ctx) return;
  const w = canvas.width, h = canvas.height, r = Math.min(w, h) / 2 - 9, cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(157,245,226,.17)'; ctx.lineWidth = 1;
  for (const radius of [r / 2, r]) { ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.fillStyle = 'rgba(157,245,226,.07)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2 - .5, -Math.PI / 2 + .5); ctx.closePath(); ctx.fill();
  const cam = activeCamera(), inv = cam.getWorldQuaternion(new THREE.Quaternion()).invert(), origin = cam.getWorldPosition(new THREE.Vector3());
  for (const portal of engine?.getPortals() || []) {
    if (!portal.group) continue;
    const p = portal.group.getWorldPosition(new THREE.Vector3()).sub(origin).applyQuaternion(inv);
    const dist = Math.hypot(p.x, p.z), scale = Math.min(dist / 7, 1) * r / Math.max(dist, .01);
    ctx.strokeStyle = portal.alliedRemaining > 0 ? '#b0f48a' : 'rgba(151,202,187,.4)';
    ctx.beginPath(); ctx.arc(cx + p.x * scale, cy + p.z * scale, 3.4, 0, Math.PI * 2); ctx.stroke();
  }
  for (const enemy of engine?.getEnemies() || []) {
    const mesh = enemy.mesh || enemy.group; if (!mesh) continue;
    const p = mesh.getWorldPosition(new THREE.Vector3()).sub(origin).applyQuaternion(inv);
    const dist = Math.sqrt(p.x * p.x + p.z * p.z), scale = Math.min(dist / 7, 1) * r / Math.max(dist, .01);
    ctx.fillStyle = enemy.kind === 'shard' ? '#d4b9ff' : enemy.kind === 'projectile' || enemy.kind === 'charger' ? '#ff6853' : enemy.kind === 'boss' || enemy.kind === 'tank' ? '#ffbf81' : enemy.kind === 'flanker' ? '#a6a5ff' : '#9ef8de'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(cx + p.x * scale, cy + p.z * scale, enemy.kind === 'boss' ? 4.5 : enemy.kind === 'tank' ? 3.1 : 2.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.fillStyle = '#e8fff7'; ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx + 3, cy + 3); ctx.closePath(); ctx.fill();
}

function pauseGame() {
  if (state.stage !== 'playing') return;
  clearCombatInput(); state.stage = 'paused'; engine.pause(); releaseWakeLock(); dialogOpen('pause-dialog');
}
function resumeGame() {
  if (state.stage !== 'paused') return;
  if (graphicsLost) { graphicsError(); return; }
  audio.unlock(); state.stage = 'playing'; frameClock.reset(); engine.resume(); dialogClose('pause-dialog'); requestWakeLock();
}
function finishGame(victory, stats) {
  clearCombatInput(); clearCombatMessages(); lastResult = { victory: !!victory, stats: { ...stats } };
  const recordKey = `best.v3.${state.mode}.${state.difficulty}`;
  const oldBest = Number(store.get(recordKey, 0)) || 0, best = Math.max(oldBest, stats.score); store.set(recordKey, best);
  $('result-title').textContent = victory ? 'КОМНАТА ПОД КОНТРОЛЕМ.' : 'ОНИ ПРОРВАЛИСЬ.';
  $('result-score').textContent = String(stats.score).padStart(5, '0');
  $('result-kills').textContent = stats.kills; $('result-accuracy').textContent = `${Math.round(stats.accuracy)}%`;
  $('result-wave').textContent = `${Math.min(stats.wave, stats.totalWaves || 5)} / ${stats.totalWaves || 5}`; $('result-best').textContent = String(best).padStart(5, '0');
  $('result-grade').textContent = stats.grade || (victory ? 'A' : 'C');
  $('result-grade-label').textContent = victory ? 'ОПЕРАЦИЯ УСПЕШНА' : 'ЕСТЬ ЧТО УЛУЧШИТЬ';
  $('result-combo').textContent = `×${stats.bestCombo || 0}`;
  $('result-criticals').textContent = stats.criticals || 0;
  $('result-perfect').textContent = `${stats.perfectWaves || 0} / ${stats.totalWaves || 5}`;
  $('result-captures').textContent = stats.portalCaptures || 0;
  $('result-portal-kills').textContent = stats.portalKills || 0;
  $('result-rift').textContent = stats.riftSaves > 0 ? 'СПАСЁН' : stats.lastChance?.used ? 'ИСТЁК' : 'НЕ ИСПОЛЬЗОВАН';
  const seconds = Math.max(0, Math.floor(stats.elapsed));
  $('result-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('result-record-label').textContent = `${stats.score > oldBest ? 'НОВЫЙ РЕКОРД · ' : ''}${MODE_LABELS[state.mode]} / ${DIFFICULTY_LABELS[state.difficulty]}`;
  $('result-record-label').classList.toggle('new-record', stats.score > oldBest);
  renderLoadout('result-loadout', stats.upgrades);
  dialogClose('pause-dialog');
  setView(state.mode, 'results');
  // Give camera access back immediately after a completed run. Spatial results remain usable in the DOM overlay.
  if (state.mode === 'camera') stopCamera();
  releaseWakeLock();
  $('retry-button').focus();
}
async function retry() {
  if (state.busy) return;
  if (state.mode === 'ar' && session) { audio.unlock(); beginMission(); return; }
  if (lastMode === 'camera') { restoreLobby(); startCamera(); }
  else if (lastMode === 'ar') { restoreLobby(); startAR(); }
  else startDemo();
}

function releaseCameraStream(acquired) {
  if (!acquired) return;
  acquired.getTracks().forEach(track => track.stop());
  // An obsolete launch may finish after a new video stream has been attached.
  if ($('camera-feed').srcObject === acquired) $('camera-feed').srcObject = null;
  if (stream === acquired) stream = null;
}
function stopCamera() {
  clearTimeout(orientation.timer);
  window.removeEventListener('deviceorientation', onOrientation);
  orientation.enabled = false; orientation.received = false;
  releaseCameraStream(stream);
  $('camera-feed').srcObject = null; $('camera-feed').hidden = true;
}
function onSessionEnd(event) {
  if (event?.target && event.target !== session) return;
  launchEpoch++; session = null; releaseHitSource(); trackingLost = false;
  setBusy(false); restoreLobby(); toast('AR-сессия завершена');
}
function releaseHitSource() {
  try { hitSource?.cancel(); } catch {}
  hitSource = null; hitPoint = null;
}
function restoreLobby() {
  clearCombatInput(); clearCombatMessages(); stopCamera(); engine?.stop(); frameClock.reset();
  if (!session) { releaseHitSource(); trackingLost = false; }
  clearMarkers(); placement.visible = false; state.portals = [];
  resetAim(); engine?.setCamera(camera);
  for (const id of ['pause-dialog', 'help-dialog', 'upgrade-dialog', 'error-dialog']) dialogClose(id);
  setView('lobby', 'lobby'); resize(); capabilityCheck();
  releaseWakeLock();
}
async function home() {
  const epoch = ++launchEpoch;
  const ending = session; session = null;
  restoreLobby(); setBusy(!!ending, ending ? 'Завершаем AR…' : '');
  if (ending) try { await ending.end(); } catch {}
  if (epoch === launchEpoch) { setBusy(false); capabilityCheck(); }
}
function wantsWakeLock() {
  return document.visibilityState === 'visible' && ['setup', 'playing', 'upgrade'].includes(state.stage);
}
function releaseWakeLock() {
  wakeEpoch++;
  const acquired = wakeLock; wakeLock = null;
  if (acquired) acquired.release().catch(() => {});
}
async function requestWakeLock() {
  if (!navigator.wakeLock || wakeLock || wakeRequest || !wantsWakeLock()) return;
  const epoch = wakeEpoch, request = {};
  wakeRequest = request;
  try {
    const acquired = await navigator.wakeLock.request('screen');
    if (epoch !== wakeEpoch || !wantsWakeLock()) { acquired.release().catch(() => {}); return; }
    wakeLock = acquired;
    acquired.addEventListener('release', () => { if (wakeLock === acquired) wakeLock = null; });
  } catch {} finally {
    if (wakeRequest === request) {
      wakeRequest = null;
      if (epoch !== wakeEpoch && wantsWakeLock()) requestWakeLock();
    }
  }
}

function updateCamera(dt) {
  if (state.mode === 'camera' && orientation.enabled && orientation.received) {
    const offset = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -orientation.zero + orientation.yaw);
    quaternion.copy(offset).multiply(orientation.raw); camera.quaternion.slerp(quaternion, 1 - Math.exp(-dt * 35));
  } else if (state.mode !== 'ar' && state.mode !== 'lobby') {
    touchAim.yaw = THREE.MathUtils.damp(touchAim.yaw, touchAim.targetYaw, 16, dt);
    touchAim.pitch = THREE.MathUtils.damp(touchAim.pitch, touchAim.targetPitch, 16, dt);
    camera.quaternion.setFromEuler(new THREE.Euler(touchAim.pitch, touchAim.yaw, 0, 'YXZ'));
  }
  camera.updateMatrixWorld();
}
function frame(time, xrFrame) {
  const { delta: frameDelta, suspended } = frameClock.tick(time);
  const dt = Math.min(frameDelta, .05);
  const seconds = time / 1000;
  if (suspended && state.stage === 'playing') {
    pauseGame();
    toast('Игра на паузе после задержки браузера. Нажми «Продолжить».', 4800);
  }
  let tracked = state.mode !== 'ar';
  if (state.mode === 'ar' && xrFrame) {
    const ref = renderer.xr.getReferenceSpace();
    const pose = ref && xrFrame.getViewerPose(ref);
    tracked = !!pose;
    if (pose) {
      const t = pose.transform;
      xrAim.position.set(t.position.x, t.position.y, t.position.z);
      xrAim.quaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      if (pose.views?.[0]?.projectionMatrix) {
        xrAim.projectionMatrix.fromArray(pose.views[0].projectionMatrix);
        xrAim.projectionMatrixInverse.copy(xrAim.projectionMatrix).invert();
      }
      xrAim.updateMatrixWorld();
      if (trackingLost) toast('Отслеживание восстановлено');
      trackingLost = false;
      if (state.stage === 'setup') {
        hitPoint = null;
        if (hitSource) {
          const hit = xrFrame.getHitTestResults(hitSource)[0], hitPose = hit?.getPose(ref);
          if (hitPose) {
            const m = new THREE.Matrix4().fromArray(hitPose.transform.matrix), candidate = new THREE.Vector3().setFromMatrixPosition(m);
            const dist = candidate.distanceTo(xrAim.position);
            if (dist >= 1.2 && dist <= 7) {
              const up = new THREE.Vector3().setFromMatrixColumn(m, 1);
              if (Math.abs(up.y) > .75) candidate.y += .85;
              hitPoint = candidate;
            }
          }
        }
        const surfaceState = hitPoint ? 'found' : 'manual';
        if ($('place-portal').dataset.surface !== surfaceState) {
          $('place-portal').dataset.surface = surfaceState;
          $('setup-hint').textContent = hitPoint
            ? 'Поверхность найдена. Установите портал у выбранного угла или дверного проёма.'
            : 'Наведитесь на угол или дверь. Пока поверхность не найдена, портал будет установлен в 3,2 м перед камерой.';
        }
      }
    } else if (!trackingLost) { trackingLost = true; toast('Медленно наведите камеру на освещённую поверхность', 4000); }
  } else if (state.mode === 'ar') {
    trackingLost = true;
  } else updateCamera(frameDelta);
  if (state.mode === 'ar' && !tracked) {
    $('fire-button').disabled = true; $('pulse-button').disabled = true;
  }
  if (state.mode === 'lobby') animateHero(seconds);
  if (state.stage === 'setup' && tracked) {
    placement.position.copy(placementPosition()); placement.lookAt(activeCamera().position);
    placement.scale.setScalar(1 + Math.sin(seconds * 3) * .04);
    placement.children[0].rotation.z += dt * .4;
    for (const marker of markers.children) marker.children[1].rotation.z += dt * .35;
  }
  if (state.stage === 'playing' && tracked) {
    let remaining = frameDelta;
    while (remaining > .00001 && state.stage === 'playing') {
      const step = Math.min(remaining, .05);
      if (state.firing) engine.fire();
      engine.update(step, seconds);
      remaining -= step;
    }
  } else if (state.stage === 'results' || state.stage === 'upgrade') engine.update(Math.min(frameDelta, .07), seconds);
  renderer.render(scene, camera);
}
function clearCombatInput(released = false) {
  state.firing = false; pointer = null; firePointers.clear(); spaceFiring = false;
  // Keep a consumed Space held across modal transitions until its keyup.
  // Otherwise native keyup activation can accept the newly focused upgrade.
  if (released) combatSpaceHeld = false;
}
function updateFiring() {
  state.firing = state.stage === 'playing' && !trackingLost && (spaceFiring || firePointers.size > 0);
}
function animateHero(seconds) {
  const slot = $('hero-slot');
  if (!slot) return;
  const bounds = slot.getBoundingClientRect(), depth = 5;
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth;
  const width = height * camera.aspect;
  hero.position.set(((bounds.left + bounds.width / 2) / innerWidth - .5) * width, (.5 - (bounds.top + bounds.height / 2) / innerHeight) * height + Math.sin(seconds * .85) * .06, -depth);
  hero.scale.setScalar(Math.min(bounds.width / innerWidth * width / 3.8, bounds.height / innerHeight * height / 2.6));
  const specimen = hero.getObjectByName('specimen');
  specimen.rotation.set(.08 + Math.sin(seconds * .4) * .06, -.35 + Math.sin(seconds * .32) * .28, -.08);
  for (let i = 1; i < 4; i++) hero.children[i].rotation.z += .0007 * i;
}
function resize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = state.mode === 'lobby' ? 48 : innerWidth > innerHeight ? 58 : 64;
  camera.updateProjectionMatrix();
  if (!renderer.xr.isPresenting) renderer.setSize(innerWidth, innerHeight);
}

function bindInput() {
  $('start-demo').addEventListener('click', startDemo); $('start-camera').addEventListener('click', startCamera); $('start-ar').addEventListener('click', startAR);
  $('cancel-launch')?.addEventListener('click', home);
  $('place-portal').addEventListener('click', placePortal); $('begin-mission').addEventListener('click', beginMission); $('setup-cancel').addEventListener('click', home);
  $('pause-button').addEventListener('click', pauseGame); $('resume-button').addEventListener('click', resumeGame); $('quit-button').addEventListener('click', home);
  $('retry-button').addEventListener('click', retry); $('home-button').addEventListener('click', home);
  $('upgrade-options').addEventListener('click', event => { const button = event.target.closest('button[data-upgrade]'); if (button) chooseUpgrade(button.dataset.upgrade); });
  $('upgrade-quit').addEventListener('click', home);
  $('help-open').addEventListener('click', () => dialogOpen('help-dialog')); $('help-close').addEventListener('click', () => dialogClose('help-dialog'));
  $('error-close').addEventListener('click', () => dialogClose('error-dialog')); $('error-demo').addEventListener('click', startDemo);
  $('sound-toggle').addEventListener('click', () => { state.muted = !state.muted; store.set('muted', state.muted); audio.unlock(); audio.setMuted(state.muted); soundUI(); });
  $('pulse-button').addEventListener('click', () => { if (state.stage === 'playing' && !trackingLost) engine.pulse(); });
  $('recenter-button').addEventListener('click', () => {
    if (state.mode === 'ar') { toast('В AR положение отслеживается камерой. Для новых точек начните заново.'); return; }
    if (orientation.received) { orientation.zero = null; orientation.yaw = 0; }
    touchAim.targetYaw = touchAim.targetPitch = 0;
    toast('Прицел откалиброван');
  });
  const fire = $('fire-button');
  fire.addEventListener('pointerdown', event => {
    if (state.stage !== 'playing' || trackingLost || event.button > 0) return;
    event.preventDefault(); firePointers.add(event.pointerId); updateFiring(); audio.unlock();
    fire.setPointerCapture?.(event.pointerId); engine.fire();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) fire.addEventListener(name, event => { firePointers.delete(event.pointerId); updateFiring(); });
  // A keyboard-activated button emits click without a pointer event.
  fire.addEventListener('click', event => { if (event.detail === 0 && state.stage === 'playing' && !trackingLost) engine.fire(); });
  const surface = $('scene');
  surface.addEventListener('pointerdown', event => {
    if (!['playing', 'setup'].includes(state.stage) || state.mode === 'ar' || pointer || event.button > 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0, moved: false, type: event.pointerType };
    surface.setPointerCapture?.(event.pointerId);
  });
  surface.addEventListener('pointermove', event => {
    if (state.mode === 'ar' || !['playing', 'setup'].includes(state.stage)) return;
    if (pointer) {
      if (event.pointerId !== pointer.id) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.travel += Math.abs(dx) + Math.abs(dy);
      if (pointer.travel > 6) pointer.moved = true;
      if (orientation.enabled && orientation.received) orientation.yaw += dx * .004;
      else { touchAim.targetYaw += dx * .004; touchAim.targetPitch = clamp(touchAim.targetPitch + dy * .0035, -1.15, 1.15); }
      pointer.x = event.clientX; pointer.y = event.clientY;
    } else if (event.pointerType === 'mouse' && state.mode === 'demo') {
      touchAim.targetYaw = (.5 - event.clientX / innerWidth) * 2.3;
      touchAim.targetPitch = (.5 - event.clientY / innerHeight) * 1.2;
    }
  });
  surface.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    if (!pointer.moved && state.stage === 'playing') engine.fire();
    pointer = null;
  });
  for (const name of ['pointercancel', 'lostpointercapture']) surface.addEventListener(name, event => { if (pointer?.id === event.pointerId) pointer = null; });
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && combatSpaceHeld) { event.preventDefault(); return; }
    const modal = ['error-dialog', 'help-dialog', 'pause-dialog', 'upgrade-dialog'].map($).find(d => !d.hidden);
    if (event.code === 'Tab' && modal) {
      const items = [...modal.querySelectorAll('button:not([disabled]),a[href],input')];
      if (items.length && event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (items.length && !event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!$('error-dialog').hidden) dialogClose('error-dialog');
      else if (!$('help-dialog').hidden) dialogClose('help-dialog');
      else if (state.stage === 'playing') pauseGame();
      else if (state.stage === 'paused') resumeGame();
      return;
    }
    if (state.stage === 'upgrade' && /^Digit[123]$/.test(event.code) && !event.repeat) {
      event.preventDefault();
      const button = $('upgrade-options').querySelectorAll('button')[Number(event.code.at(-1)) - 1];
      if (button) chooseUpgrade(button.dataset.upgrade);
      return;
    }
    if (state.stage !== 'playing') return;
    if (event.code === 'Space') {
      event.preventDefault(); combatSpaceHeld = true; spaceFiring = !event.repeat;
      updateFiring(); audio.unlock();
    }
    if (event.code === 'KeyE' && !event.repeat && !trackingLost) engine.pulse();
    if (event.code === 'KeyP' && !event.repeat) pauseGame();
    if (event.code === 'ArrowLeft') { event.preventDefault(); touchAim.targetYaw += .06; }
    if (event.code === 'ArrowRight') { event.preventDefault(); touchAim.targetYaw -= .06; }
    if (event.code === 'ArrowUp') { event.preventDefault(); touchAim.targetPitch = clamp(touchAim.targetPitch + .06, -1.15, 1.15); }
    if (event.code === 'ArrowDown') { event.preventDefault(); touchAim.targetPitch = clamp(touchAim.targetPitch - .06, -1.15, 1.15); }
  });
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      if (combatSpaceHeld) event.preventDefault();
      combatSpaceHeld = false; spaceFiring = false; updateFiring();
    }
  });
  $('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); resumeGame(); });
  $('overlay').addEventListener('beforexrselect', event => event.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => { clearCombatInput(true); pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearCombatInput(true); pauseGame(); releaseWakeLock(); } else requestWakeLock(); });
  window.addEventListener('pagehide', () => {
    launchEpoch++; setBusy(false); stopCamera(); clearCombatInput(true); releaseWakeLock();
    session?.end().catch(() => {}); audio.stop();
  });
  window.addEventListener('pageshow', () => { if (state.mode === 'camera' && !stream && state.stage !== 'results') { setBusy(false); restoreLobby(); toast('Запустите камеру снова, чтобы продолжить'); } });
  $('scene').addEventListener('webglcontextlost', event => {
    event.preventDefault(); graphicsLost = true; clearCombatInput(); pauseGame(); setBusy(state.busy); graphicsError();
  });
  $('scene').addEventListener('webglcontextrestored', () => {
    graphicsLost = false; setBusy(state.busy); capabilityCheck(); $('error-demo').disabled = false;
    if ($('error-dialog').dataset.reason === 'graphics') dialogClose('error-dialog');
    toast('Графика восстановлена. Можно продолжить игру.', 3500);
  });
}

try {
  initScene(); bindInput(); soundUI(); capabilityCheck();
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.__breach = { engine, camera, xrAim, renderer, scene, state, get stream() { return stream; }, get session() { return session; }, beginMission, home, pauseGame, resumeGame, startDemo, placementPosition };
  }
} catch (cause) {
  console.error('BREACH initialization failed', cause);
  $('loading').textContent = 'Для игры нужна поддержка WebGL 2. Попробуйте современный Chrome или Safari и включите аппаратное ускорение.';
  for (const id of ['start-ar', 'start-camera', 'start-demo']) $(id).disabled = true;
}
