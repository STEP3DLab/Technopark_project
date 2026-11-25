import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createSoftwareViewer } from './software-viewer.js?v=mobile-20261125';

const groups = {
  shells: ['upper', 'lower'], cassette: ['plate', 'motorwall', 'supportwall'],
  servo: ['motor_', 'plate', 'belt_ref_', 'fastener_horn_', 'pinion', 'motorwall'],
  gears: ['driven', 'pinion'],
  spool: ['shaft', 'spool', 'bush_', 'spacer_', 'collar_'],
  guide: ['upper', 'cable_'],
};
export async function createViewer(host, options={}) {
  const touch=matchMedia('(pointer:coarse)').matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if(options.softwareOnly||touch) return createSoftwareViewer(host);
  try { return await createWebGLViewer(host); }
  catch(e) { host.replaceChildren(); return createSoftwareViewer(host); }
}
async function createWebGLViewer(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0xf5f7fc,1);
  host.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 3000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.minDistance = 25;
  controls.maxDistance = 1400;
  controls.maxPolarAngle = Math.PI * .95;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8399c0, 2.7));
  for (const [pos, energy, color] of [[[150,-200,320],3.7,0xffffff],[[-240,120,240],2.5,0xc7dcff],[[200,230,100],1.4,0xffffff]]) {
    const light = new THREE.DirectionalLight(color, energy);
    light.position.set(...pos);
    light.target.position.set(0, 70, 25);
    scene.add(light, light.target);
  }
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 128;
  const ctx = cvs.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,5,64,64,62);
  gradient.addColorStop(0,'rgba(8,37,103,.20)'); gradient.addColorStop(1,'rgba(8,37,103,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,128,128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(220,240), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cvs),transparent:true,depthWrite:false}));
  shadow.position.set(0,75,-34); scene.add(shadow);
  let root;
  try { root = (await new GLTFLoader().loadAsync(new URL('./v07/files/assembly-studio.glb', import.meta.url).href)).scene; }
  catch (e) { renderer.dispose(); controls.dispose(); host.replaceChildren(); throw e; }
  scene.add(root);
  const nodes = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material.flatShading = false;
    o.material.needsUpdate = true;
    nodes.push({ mesh:o, name:o.name.toLowerCase(), start:o.position.clone() });
  });
  if(!nodes.length) throw Error('Empty CAD assembly');
  let selectedGroup = null, shellHidden = false, amount = 0, running = true;
  const direction = new THREE.Vector3(1.25,-1.6,1.25).normalize();
  function matches(name) { return !selectedGroup || groups[selectedGroup].some(id => name === id || name.startsWith(id)); }
  function apply() {
    for (const {mesh:o,name:n,start} of nodes) {
      o.position.copy(start);
      o.visible = matches(n) && !(shellHidden && (n === 'upper' || n === 'lower'));
      if (n === 'lower') o.position.z -= 45 * amount;
      else if (n === 'upper') {}
      else if (n === 'plate') o.position.z += 15 * amount;
      else if (n === 'motorwall' || n.startsWith('motor_')) o.position.add(new THREE.Vector3(-43*amount,0,28*amount));
      else if (n === 'supportwall') o.position.add(new THREE.Vector3(43*amount,0,28*amount));
      else o.position.z += 50 * amount;
    }
    root.updateMatrixWorld(true);
    shadow.visible = !selectedGroup && amount === 0;
  }
  function resize() {
    const w = host.clientWidth || host.parentElement.clientWidth || 500;
    const h = host.clientHeight || host.parentElement.clientHeight || 420;
    renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  function fit(dir = direction) {
    resize();
    const box = new THREE.Box3();
    nodes.forEach(({mesh:o}) => { if (o.visible) box.union(new THREE.Box3().setFromObject(o)); });
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2*Math.atan(Math.tan(vfov/2)*camera.aspect);
    const distance = radius / Math.sin(Math.min(vfov,hfov)/2) * 1.04;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, distance);
    controls.update();
  }
  const observer = new ResizeObserver(() => { resize(); }); observer.observe(host);
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault(); running = false;
    host.closest('.visual-stage')?.classList.remove('live');
    renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose(); window.dispatchEvent(new Event('xlab-3d-failure'));
  });
  renderer.setAnimationLoop(() => {
    if (!running || document.hidden || !host.clientWidth || !host.clientHeight) return;
    try{controls.update();renderer.render(scene,camera);}catch(e){running=false;renderer.setAnimationLoop(null);window.dispatchEvent(new Event('xlab-3d-failure'));}
  });
  function drawNow(){resize();controls.update();renderer.render(scene,camera);if(!renderer.info.render.triangles)throw Error('Empty frame');}
  apply(); fit(); drawNow();
  return {
    drawNow,
    focus(group) { selectedGroup = group && groups[group] ? group : null; amount = 0; shellHidden = false; apply(); fit(); },
    explode(value) { amount=value; apply(); fit(); },
    hideShell(value) { shellHidden=value; apply(); fit(); },
    top() { fit(new THREE.Vector3(0,-.001,1).normalize()); },
    pause() { running = false; },
    resume() { running = true; resize(); fit(); },
  };
}
