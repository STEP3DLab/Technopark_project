import * as THREE from './vendor/three.module.js';
import { GameEngine, createInvaderMesh } from './engine.js';
import { SoundEngine } from './audio.js';
import { CanvasRenderer } from './canvas-renderer.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const store = {
  get(key, fallback) { try { return localStorage.getItem(`breach.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`breach.${key}`, String(value)); } catch {} },
};
const state = { mode: 'lobby', stage: 'lobby', busy: false, firing: false, portals: [], muted: store.get('muted', 'false') === 'true', xrSupported: false, software: false };
const audio = new SoundEngine();
audio.setMuted(state.muted);
let renderer, engine, scene, camera, xrAim, hero, environment, placement, markers;
let session = null, stream = null, hitSource = null, hitPoint = null, wakeLock = null;
let previousTime = 0, uiTime = 0, toastTimer, bannerTimer, suppressEnd = false, pointer = null, trackingLost = false;
let lastMode = 'demo', lastResult = null, launchEpoch = 0;
const vector = new THREE.Vector3(), quaternion = new THREE.Quaternion();
const orientation = { enabled: false, received: false, raw: new THREE.Quaternion(), zero: null, yaw: 0, pitch: 0, timer: null };
const touchAim = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };

function toast(message, duration = 2800) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => { $('toast').classList.remove('visible'); $('toast').hidden = true; }, duration);
}
function dialogOpen(id) { const d = $(id); if (d?.showModal && !d.open) d.showModal(); else if (d) d.hidden = false; d?.querySelector('button')?.focus(); }
function dialogClose(id) { const d = $(id); if (d?.close) d.close(); else if (d) d.hidden = true; }
function error(title, message) { $('error-title').textContent = title; $('error-text').textContent = message; dialogOpen('error-dialog'); }
function setBusy(busy, label = '') {
  state.busy = busy;
  for (const id of ['start-ar', 'start-camera', 'start-demo']) $(id).disabled = busy || (id === 'start-ar' && !state.xrSupported);
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
  const invader = createInvaderMesh('scout'); invader.name = 'specimen';
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
  const grid = new THREE.GridHelper(70, 70, 0x28645c, 0x142b30); grid.position.set(0, -1.6, -14);
  grid.material.transparent = true; grid.material.opacity = .55; group.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x080f15, roughness: .9, metalness: .15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.62, -14); group.add(floor);
  const pillarGeo = new THREE.BoxGeometry(1.2, 4.6, 1.2);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0b1b22, metalness: .55, roughness: .35 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2e6a68, transparent: true, opacity: .55 });
  for (let i = 0; i < 6; i++) {
    for (const sign of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat); pillar.position.set(sign * (4.4 + i * .4), .6, -4 - i * 5.5);
      pillar.add(new THREE.LineSegments(new THREE.EdgesGeometry(pillarGeo), edgeMat)); group.add(pillar);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(.035, 3.2, .04), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7156 : 0x77cbbb }));
      strip.position.set(sign * (3.78 + i * .4), .3, -3.38 - i * 5.5); group.add(strip);
    }
  }
  const geo = new THREE.BufferGeometry(), points = [];
  for (let i = 0; i < 220; i++) points.push(Math.sin(i * 128.1) * 25, Math.cos(i * 93.7) * 10 + 3, -Math.abs(Math.sin(i * 17.3)) * 40 - 3);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x85a9aa, size: .025, transparent: true, opacity: .5 })));
  return group;
}

function setView(mode, stage) {
  state.mode = mode; state.stage = stage;
  document.body.classList.remove('lobby-view', 'playing', 'camera-mode', 'ar-mode', 'demo-mode', 'setup-mode');
  document.body.classList.add(mode === 'lobby' ? 'lobby-view' : `${mode}-mode`);
  if (stage === 'playing' || stage === 'paused') document.body.classList.add('playing');
  if (stage === 'setup') document.body.classList.add('setup-mode');
  $('lobby').hidden = stage !== 'lobby'; $('hud').hidden = !['playing', 'paused'].includes(stage);
  $('setup').hidden = stage !== 'setup'; $('results').hidden = stage !== 'results';
  hero.visible = mode === 'lobby'; environment.visible = mode === 'demo';
  placement.visible = stage === 'setup'; markers.visible = stage === 'setup';
  scene.fog = mode === 'demo' ? new THREE.FogExp2(0x060b10, .025) : null;
  renderer.setClearColor(0x060b10, mode === 'demo' ? 1 : 0);
  $('camera-feed').hidden = mode !== 'camera';
  const modeText = mode === 'ar' ? 'ПРОСТРАНСТВЕННЫЙ AR' : mode === 'camera' ? 'КАМЕРА · 360°' : 'ТРЕНИРОВКА';
  $('mode-label').textContent = modeText;
  if ($('control-hint')) $('control-hint').textContent = mode === 'demo' ? 'Свайп или мышь — прицел · удерживайте огонь' : 'Поворачивайте телефон · удерживайте огонь';
  resize();
}

function resetAim() {
  camera.position.set(0, 0, 0); camera.quaternion.identity(); camera.updateMatrixWorld();
  touchAim.yaw = touchAim.pitch = touchAim.targetYaw = touchAim.targetPitch = 0;
  orientation.zero = null; orientation.yaw = 0;
}

async function capabilityCheck() {
  try { state.xrSupported = !state.software && !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'); } catch { state.xrSupported = false; }
  $('start-ar').disabled = !state.xrSupported;
  $('start-ar').setAttribute('aria-describedby', 'capability');
  $('start-camera').disabled = !navigator.mediaDevices?.getUserMedia;
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
  if (state.busy || !renderer) return;
  const epoch = ++launchEpoch;
  audio.unlock();
  const permission = requestOrientation(); // Must originate in the same user gesture as the launch button.
  setBusy(true, 'Разрешите доступ к камере…');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Camera unavailable'), { name: 'NotSupportedError' });
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (epoch !== launchEpoch) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    $('camera-feed').srcObject = stream;
    await $('camera-feed').play();
    orientation.enabled = await permission; orientation.received = false;
    if (epoch !== launchEpoch) { stopCamera(); return; }
    resetAim(); window.addEventListener('deviceorientation', onOrientation);
    lastMode = 'camera'; prepareSetup('camera');
    orientation.timer = setTimeout(() => {
      if (!orientation.received && state.mode === 'camera') {
        orientation.enabled = false;
        $('mode-label').textContent = 'КАМЕРА · РУЧНОЙ ПРИЦЕЛ';
        toast('Датчик поворота недоступен. Двигайте прицел свайпом.', 5000);
      }
    }, 2300);
    requestWakeLock();
  } catch (cause) {
    stopCamera();
    if (epoch !== launchEpoch) return;
    const message = cause.name === 'NotAllowedError' ? 'Разрешите камеру в настройках браузера для этого сайта и попробуйте ещё раз. Игра также доступна в тренировке без камеры.' : cause.name === 'NotFoundError' ? 'Камера не найдена. Подключите её или запустите тренировку.' : cause.name === 'NotReadableError' ? 'Камера занята другим приложением. Закройте его и попробуйте ещё раз.' : 'Не удалось запустить камеру. Откройте ссылку напрямую в Chrome или Safari по HTTPS. Можно начать с тренировки.';
    error('Камера пока недоступна', message);
  } finally { if (epoch === launchEpoch) { setBusy(false); capabilityCheck(); } }
}

async function startAR() {
  if (state.busy || !renderer || !navigator.xr) return;
  const epoch = ++launchEpoch;
  // Keep requestSession before all awaits: browsers require transient activation.
  const request = navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['dom-overlay'], optionalFeatures: ['hit-test', 'local-floor'], domOverlay: { root: $('overlay') } });
  audio.unlock(); setBusy(true, 'Запускаем пространственный AR…');
  try {
    const acquired = await request;
    if (epoch !== launchEpoch) { try { await acquired.end(); } catch {} return; }
    session = acquired;
    session.addEventListener('end', onSessionEnd, { once: true });
    session.addEventListener('visibilitychange', () => { if (session?.visibilityState !== 'visible') pauseGame(); });
    resetAim();
    await renderer.xr.setSession(session);
    if (epoch !== launchEpoch) { try { await acquired.end(); } catch {} return; }
    engine.setCamera(xrAim);
    lastMode = 'ar'; trackingLost = true; prepareSetup('ar');
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      hitSource = await session.requestHitTestSource({ space: viewerSpace });
    } catch { hitSource = null; }
    requestWakeLock();
  } catch (cause) {
    if (epoch !== launchEpoch) return;
    if (session) { suppressEnd = true; try { await session.end(); } catch {} session = null; suppressEnd = false; }
    restoreLobby();
    error('AR не запустился', cause.name === 'NotAllowedError' ? 'Браузер не получил разрешение на AR. Разрешите доступ при следующем запуске или выберите «Играть с камерой».' : 'Для пространственного AR нужны совместимые телефон и браузер с экранными элементами управления. Попробуйте Chrome на Android с сервисами Google Play для AR или режим «Играть с камерой».');
  } finally { if (epoch === launchEpoch) { setBusy(false); capabilityCheck(); } }
}

function startDemo() {
  if (state.busy || !renderer) return;
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
  if (state.mode === 'ar' && trackingLost) { toast('Дождитесь, пока камера определит положение телефона'); return; }
  if (state.mode === 'camera' && orientation.enabled && !orientation.received) { toast('Калибруем поворот телефона…'); return; }
  state.firing = false; lastResult = null;
  setView(state.mode, 'playing');
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'normal';
  engine.start({ mode: state.mode, difficulty, portals: state.portals.length ? state.portals : autoPortals() });
  const message = state.mode === 'demo' ? 'Прицел — мышью или свайпом. Огонь — кнопкой или пробелом.' : 'Наведите прицел и удерживайте огонь';
  toast(message, 4200);
}

function onStats(stats) {
  if (performance.now() - uiTime < 70 && stats.shield > 0) return;
  uiTime = performance.now();
  $('score').textContent = String(stats.score).padStart(5, '0');
  $('wave').textContent = `${Math.min(stats.wave || 1, 5)} / 5`;
  $('shield-value').textContent = `${Math.max(0, Math.ceil(stats.shield))}%`;
  $('shield-bar').style.width = `${stats.shield}%`;
  $('heat-bar').style.width = `${stats.heat}%`;
  $('heat-bar').parentElement.classList.toggle('hot', stats.heat > 75);
  $('heat-label').textContent = stats.heat >= 98 || stats.overheated ? 'ОХЛАЖДЕНИЕ' : 'ГОТОВ';
  $('combo').textContent = stats.combo > 1 ? `×${stats.combo}` : '';
  $('combo').classList.toggle('active', stats.combo > 1);
  $('incoming').textContent = stats.incoming ? `ЦЕЛЕЙ В СЕКТОРЕ / ${String(stats.incoming).padStart(2, '0')}` : '';
  $('reticle').classList.toggle('locked', !!stats.targeted);
  const kinds = { scout: 'РАЗВЕДЧИК', drone: 'ПЕРЕХВАТЧИК', tank: 'БРОНЕНОСЕЦ' };
  $('target-label').textContent = stats.targeted ? `${kinds[stats.targetKind] || 'ЦЕЛЬ'} · ${stats.targetHealth || 1}` : 'ПОИСК ЦЕЛИ';
  const pulse = $('pulse-button'); pulse.disabled = stats.pulseCharge < 100;
  pulse.style.setProperty('--charge', `${stats.pulseCharge}%`);
  const label = pulse.querySelector('[data-pulse-charge]'); if (label) label.textContent = stats.pulseCharge >= 100 ? 'ГОТОВ' : `${Math.floor(stats.pulseCharge)}%`;
  pulse.setAttribute('aria-label', stats.pulseCharge >= 100 ? 'ЭМИ-импульс готов: уничтожить ближайших захватчиков' : `Импульс заряжается: ${Math.floor(stats.pulseCharge)} процентов`);
  drawRadar(stats);
}
function onEvent(event) {
  switch (event.type) {
    case 'shot': audio.shot(); $('fire-button').classList.add('firing'); setTimeout(() => $('fire-button').classList.remove('firing'), 80); break;
    case 'hit': audio.hit(); flash('hit-marker', 100); break;
    case 'kill': audio.explosion(); flash('hit-marker', 130); vibrate(10); break;
    case 'damage': audio.damage(); flash('damage-flash', 350); vibrate([30, 35, 45]); break;
    case 'pulse': audio.pulse(); toast('ЭМИ-импульс'); vibrate(40); break;
    case 'overheat': toast('Перегрев. Отпустите огонь для охлаждения', 1900); break;
    case 'wave': {
      audio.wave(); clearTimeout(bannerTimer);
      const number = event.wave || engine.getState().wave;
      $('wave-banner').textContent = `ВОЛНА ${String(number).padStart(2, '0')}`;
      $('wave-banner').hidden = false; $('wave-banner').classList.add('visible');
      bannerTimer = setTimeout(() => { $('wave-banner').classList.remove('visible'); $('wave-banner').hidden = true; }, 1800);
      break;
    }
    case 'gameover': finishGame(event.victory, event.state || engine.getState()); break;
  }
}
function flash(id, duration) { const element = $(id); element.hidden = false; element.classList.add('active'); setTimeout(() => { element.classList.remove('active'); element.hidden = true; }, duration); }
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
  for (const enemy of engine?.getEnemies() || []) {
    const mesh = enemy.mesh || enemy.group; if (!mesh) continue;
    const p = mesh.getWorldPosition(new THREE.Vector3()).sub(origin).applyQuaternion(inv);
    const dist = Math.sqrt(p.x * p.x + p.z * p.z), scale = Math.min(dist / 7, 1) * r / Math.max(dist, .01);
    ctx.fillStyle = enemy.kind === 'tank' ? '#ff7a63' : '#9ef8de'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(cx + p.x * scale, cy + p.z * scale, enemy.kind === 'tank' ? 3.1 : 2.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.fillStyle = '#e8fff7'; ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx + 3, cy + 3); ctx.closePath(); ctx.fill();
}

function pauseGame() {
  if (state.stage !== 'playing') return;
  state.firing = false; engine.pause(); state.stage = 'paused'; dialogOpen('pause-dialog');
}
function resumeGame() {
  if (state.stage !== 'paused') return;
  audio.unlock(); engine.resume(); state.stage = 'playing'; previousTime = performance.now(); dialogClose('pause-dialog'); requestWakeLock();
}
function finishGame(victory, stats) {
  state.firing = false; lastResult = { victory: !!victory, stats: { ...stats } };
  const best = Math.max(Number(store.get('best', 0)), stats.score); store.set('best', best);
  $('result-title').textContent = victory ? 'КОМНАТА ПОД КОНТРОЛЕМ.' : 'ОНИ ПРОРВАЛИСЬ.';
  $('result-score').textContent = String(stats.score).padStart(5, '0');
  $('result-kills').textContent = stats.kills; $('result-accuracy').textContent = `${Math.round(stats.accuracy)}%`;
  $('result-wave').textContent = `${Math.min(stats.wave, 5)} / 5`; $('result-best').textContent = String(best).padStart(5, '0');
  setView(state.mode, 'results');
  // Give camera access back immediately after a completed run. Spatial results remain usable in the DOM overlay.
  if (state.mode === 'camera') stopCamera();
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  $('retry-button').focus();
}
async function retry() {
  if (state.busy) return;
  if (state.mode === 'ar' && session) { audio.unlock(); beginMission(); return; }
  if (lastMode === 'camera') { restoreLobby(); startCamera(); }
  else if (lastMode === 'ar') { restoreLobby(); startAR(); }
  else startDemo();
}

function stopCamera() {
  clearTimeout(orientation.timer);
  window.removeEventListener('deviceorientation', onOrientation);
  orientation.enabled = false; orientation.received = false;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  $('camera-feed').srcObject = null; $('camera-feed').hidden = true;
}
function onSessionEnd(event) {
  if (session && event?.target && event.target !== session) return;
  try { hitSource?.cancel(); } catch {} hitSource = null; hitPoint = null; session = null; trackingLost = false;
  if (!suppressEnd) { engine?.stop(); restoreLobby(); toast('AR-сессия завершена'); }
}
function restoreLobby() {
  state.firing = false; stopCamera(); engine?.stop();
  clearMarkers(); placement.visible = false; state.portals = [];
  resetAim(); engine?.setCamera(camera);
  for (const id of ['pause-dialog', 'help-dialog']) dialogClose(id);
  setView('lobby', 'lobby'); resize(); capabilityCheck();
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
async function home() {
  launchEpoch++; setBusy(false);
  if (session) { suppressEnd = true; try { await session.end(); } catch {} suppressEnd = false; session = null; }
  restoreLobby();
}
async function requestWakeLock() {
  if (navigator.wakeLock && !wakeLock && document.visibilityState === 'visible') {
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
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
  const dt = previousTime ? Math.min((time - previousTime) / 1000, .05) : .016; previousTime = time;
  const seconds = time / 1000;
  let tracked = true;
  if (state.mode === 'ar' && xrFrame) {
    const ref = renderer.xr.getReferenceSpace();
    const pose = ref && xrFrame.getViewerPose(ref);
    tracked = !!pose;
    if (pose) {
      const t = pose.transform;
      xrAim.position.set(t.position.x, t.position.y, t.position.z);
      xrAim.quaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
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
  } else updateCamera(dt);
  if (state.mode === 'lobby') animateHero(seconds);
  if (state.stage === 'setup' && tracked) {
    placement.position.copy(placementPosition()); placement.lookAt(activeCamera().position);
    placement.scale.setScalar(1 + Math.sin(seconds * 3) * .04);
    placement.children[0].rotation.z += dt * .4;
    for (const marker of markers.children) marker.children[1].rotation.z += dt * .35;
  }
  if (state.stage === 'playing' && tracked) {
    if (state.firing) engine.fire();
    engine.update(dt, seconds);
  } else if (state.stage === 'results') engine.update(dt, seconds);
  renderer.render(scene, camera);
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
  $('place-portal').addEventListener('click', placePortal); $('begin-mission').addEventListener('click', beginMission); $('setup-cancel').addEventListener('click', home);
  $('pause-button').addEventListener('click', pauseGame); $('resume-button').addEventListener('click', resumeGame); $('quit-button').addEventListener('click', home);
  $('retry-button').addEventListener('click', retry); $('home-button').addEventListener('click', home);
  $('help-open').addEventListener('click', () => dialogOpen('help-dialog')); $('help-close').addEventListener('click', () => dialogClose('help-dialog'));
  $('error-close').addEventListener('click', () => dialogClose('error-dialog')); $('error-demo').addEventListener('click', startDemo);
  $('sound-toggle').addEventListener('click', () => { state.muted = !state.muted; store.set('muted', state.muted); audio.unlock(); audio.setMuted(state.muted); soundUI(); });
  $('pulse-button').addEventListener('click', () => { if (state.stage === 'playing') engine.pulse(); });
  $('recenter-button').addEventListener('click', () => {
    if (state.mode === 'ar') { toast('В AR положение отслеживается камерой. Для новых точек начните заново.'); return; }
    if (orientation.received) { orientation.zero = null; orientation.yaw = 0; }
    touchAim.targetYaw = touchAim.targetPitch = 0;
    toast('Прицел откалиброван');
  });
  const fire = $('fire-button');
  fire.addEventListener('pointerdown', event => { if (state.stage !== 'playing' || (state.mode === 'ar' && trackingLost)) return; event.preventDefault(); state.firing = true; audio.unlock(); fire.setPointerCapture?.(event.pointerId); engine.fire(); });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) fire.addEventListener(name, () => { state.firing = false; });
  // A keyboard-activated button emits click without a pointer event.
  fire.addEventListener('click', event => { if (event.detail === 0 && state.stage === 'playing' && !trackingLost) engine.fire(); });
  const surface = $('scene');
  surface.addEventListener('pointerdown', event => {
    if (!['playing', 'setup'].includes(state.stage) || state.mode === 'ar') return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, type: event.pointerType };
    surface.setPointerCapture?.(event.pointerId);
  });
  surface.addEventListener('pointermove', event => {
    if (state.mode === 'ar' || !['playing', 'setup'].includes(state.stage)) return;
    if (pointer) {
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) pointer.moved = true;
      if (orientation.enabled && orientation.received) orientation.yaw += dx * .004;
      else { touchAim.targetYaw += dx * .004; touchAim.targetPitch = clamp(touchAim.targetPitch + dy * .0035, -1.15, 1.15); }
      pointer.x = event.clientX; pointer.y = event.clientY;
    } else if (event.pointerType === 'mouse' && state.mode === 'demo') {
      touchAim.targetYaw = (.5 - event.clientX / innerWidth) * 2.3;
      touchAim.targetPitch = (.5 - event.clientY / innerHeight) * 1.2;
    }
  });
  surface.addEventListener('pointerup', () => { if (pointer && !pointer.moved && state.stage === 'playing') engine.fire(); pointer = null; });
  surface.addEventListener('pointercancel', () => { pointer = null; state.firing = false; });
  document.addEventListener('keydown', event => {
    const modal = ['help-dialog', 'error-dialog', 'pause-dialog'].map($).find(d => !d.hidden);
    if (event.code === 'Tab' && modal) {
      const items = [...modal.querySelectorAll('button:not([disabled]),a[href],input')];
      if (items.length && event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (items.length && !event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
    if (event.code === 'Escape') {
      if (state.stage === 'playing') pauseGame();
      else if (state.stage === 'paused') resumeGame();
      else { dialogClose('help-dialog'); dialogClose('error-dialog'); }
      return;
    }
    if (state.stage !== 'playing') return;
    if (event.code === 'Space') { event.preventDefault(); state.firing = true; }
    if (event.code === 'KeyE' && !event.repeat) engine.pulse();
    if (event.code === 'KeyP' && !event.repeat) pauseGame();
    if (event.code === 'ArrowLeft') { event.preventDefault(); touchAim.targetYaw += .06; }
    if (event.code === 'ArrowRight') { event.preventDefault(); touchAim.targetYaw -= .06; }
    if (event.code === 'ArrowUp') { event.preventDefault(); touchAim.targetPitch = clamp(touchAim.targetPitch + .06, -1.15, 1.15); }
    if (event.code === 'ArrowDown') { event.preventDefault(); touchAim.targetPitch = clamp(touchAim.targetPitch - .06, -1.15, 1.15); }
  });
  document.addEventListener('keyup', event => { if (event.code === 'Space') state.firing = false; });
  $('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); resumeGame(); });
  $('overlay').addEventListener('beforexrselect', event => event.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => { state.firing = false; pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { state.firing = false; pauseGame(); } });
  window.addEventListener('pagehide', () => { launchEpoch++; stopCamera(); state.firing = false; session?.end().catch(() => {}); audio.stop(); });
  window.addEventListener('pageshow', () => { if (state.mode === 'camera' && !stream && state.stage !== 'results') { setBusy(false); restoreLobby(); toast('Запустите камеру снова, чтобы продолжить'); } });
  $('scene').addEventListener('webglcontextlost', event => { event.preventDefault(); pauseGame(); error('Графика приостановлена', 'Браузер освободил графическую память. Обновите страницу, чтобы вернуться в игру.'); });
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
