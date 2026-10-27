import * as THREE from './vendor/three.module.js';

/** Procedural demonstration building. All geometry is illustrative, not a survey. */
export function initScene({ canvas, onReady = () => {}, onModeChange = () => {} } = {}) {
  const noop = () => {};
  const unavailable = () => {
    if (canvas) {
      canvas.dataset.webgl = 'unavailable';
      canvas.style.display = 'none';
      canvas.parentElement?.classList.add('scene-unavailable');
    }
    onReady(false);
    return { setMode: noop, reset: noop, toggleRotation: () => false, setSection: noop, resize: noop, destroy: noop };
  };
  if (!canvas) return unavailable();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch { return unavailable(); }

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 150);
  const target = new THREE.Vector3(0, 4.8, 0);
  const home = { azimuth: 0.71, polar: 1.02, zoom: 1 };
  const orbit = { ...home };
  const wanted = { ...home };
  let mode = 'points';
  let spinning = !motion.matches;
  let inView = true;
  let activePointer = null;
  let dragOrigin = null;
  let width = 1, height = 1, elapsed = 0, lastTime = 0, raf = 0, destroyed = false;
  let sectionValue = 62;

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0xf5fff7, 0x5b6d69, 2.6));
  const sun = new THREE.DirectionalLight(0xfffaf0, 3.3);
  sun.position.set(8, 21, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 0.1, far: 55 });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc3e0dc, 1.4);
  fill.position.set(-12, 8, -8);
  scene.add(fill);

  const architecture = new THREE.Group();
  const outlines = new THREE.Group();
  const heatmap = new THREE.Group();
  const environment = new THREE.Group();
  scene.add(architecture, outlines, heatmap, environment);
  const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 7);
  const materials = [];
  const solids = [];
  const pointPositions = [];
  const pointColors = [];
  const darkPoint = new THREE.Color('#355e53');
  const olivePoint = new THREE.Color('#8eaa55');
  const lightPoint = new THREE.Color('#c3d376');
  const tempColor = new THREE.Color();

  const makeMaterial = (color, properties = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.08, ...properties });
    materials.push(material);
    return material;
  };
  const concrete = makeMaterial('#c6cfc7');
  const porcelain = makeMaterial('#e1e7dc', { roughness: 0.9 });
  const dark = makeMaterial('#36504b', { roughness: 0.55 });
  const glass = makeMaterial('#70978e', { roughness: 0.24, metalness: 0.42 });
  const interior = makeMaterial('#b9c6b6');
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#42625a', transparent: true, opacity: 0.22 });
  materials.push(lineMaterial);

  // Deterministic small sample offsets give the surface the character of a real point cloud.
  let seed = 320917;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function sampleBox(x, y, z, sx, sy, sz, kind) {
    const spacing = kind === 'glass' ? 0.15 : 0.18;
    const faces = [
      [[-sx/2, -sy/2, sz/2], [sx, 0, 0], [0, sy, 0]],
      [[sx/2, -sy/2, -sz/2], [-sx, 0, 0], [0, sy, 0]],
      [[sx/2, -sy/2, sz/2], [0, 0, -sz], [0, sy, 0]],
      [[-sx/2, -sy/2, -sz/2], [0, 0, sz], [0, sy, 0]],
      [[-sx/2, sy/2, -sz/2], [sx, 0, 0], [0, 0, sz]],
      [[-sx/2, -sy/2, sz/2], [sx, 0, 0], [0, 0, -sz]]
    ];
    for (let f = 0; f < faces.length; f++) {
      // Lower faces of slabs do not need a second full grid.
      if (f === 5 && sy < 0.4) continue;
      const [origin, u, v] = faces[f];
      const nu = Math.max(1, Math.ceil(Math.hypot(...u) / spacing));
      const nv = Math.max(1, Math.ceil(Math.hypot(...v) / spacing));
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
        if (random() < 0.1) continue;
        const px = x + origin[0] + u[0]*i/nu + v[0]*j/nv + (random() - 0.5)*0.022;
        const py = y + origin[1] + u[1]*i/nu + v[1]*j/nv + (random() - 0.5)*0.022;
        const pz = z + origin[2] + u[2]*i/nu + v[2]*j/nv + (random() - 0.5)*0.022;
        pointPositions.push(px, py, pz);
        const shade = Math.min(1, Math.max(0, (py / 12) * 0.38 + random()*0.28 + (kind === 'glass' ? 0 : 0.12)));
        tempColor.copy(darkPoint).lerp(olivePoint, shade);
        if (kind === 'roof') tempColor.lerp(lightPoint, 0.4);
        pointColors.push(tempColor.r, tempColor.g, tempColor.b);
      }
    }
  }

  function box(x, y, z, sx, sy, sz, material = concrete, kind = 'solid', shouldSample = true) {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    architecture.add(mesh);
    solids.push(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial);
    edges.position.copy(mesh.position);
    outlines.add(edges);
    if (shouldSample) sampleBox(x, y, z, sx, sy, sz, kind);
    return mesh;
  }

  // Four occupied floors. Two perpendicular wings leave an open entrance courtyard.
  const floors = [0.28, 3.06, 5.84, 8.62, 11.4];
  for (const y of floors) {
    box(0, y, -3, 14.2, 0.24, 4.3, porcelain, y > 11 ? 'roof' : 'solid');
    box(-4.5, y, 2, 5.2, 0.24, 6, porcelain, y > 11 ? 'roof' : 'solid');
  }
  for (let level = 0; level < 4; level++) {
    const y = floors[level] + 1.38;
    // Glass skins with structural piers in front.
    box(0, y, -0.93, 13.8, 2.46, 0.08, glass, 'glass');
    box(0, y, -5.07, 13.8, 2.46, 0.08, glass, 'glass');
    box(7.03, y, -3, 0.08, 2.46, 4, glass, 'glass');
    box(-7.03, y, -3, 0.08, 2.46, 4, glass, 'glass');
    box(-1.93, y, 2, 0.08, 2.46, 5.9, glass, 'glass');
    box(-7.07, y, 2, 0.08, 2.46, 5.9, glass, 'glass');
    box(-4.5, y, 5.03, 5, 2.46, 0.08, glass, 'glass');
    // A legible service core and internal walls remain visible in the cutaway.
    box(-4.45, y, -2.9, 2.05, 2.54, 1.45, interior, 'solid');
    box(2.8, y, -3, 0.1, 2.5, 3.8, interior, 'solid', false);
    box(-4.5, y, 1.7, 4.8, 2.5, 0.1, interior, 'solid', false);
    // Thin external mullions, a consistent architectural rhythm.
    for (let x = -6.6; x <= 6.8; x += 1.34) {
      box(x, y, -0.84, 0.075, 2.56, 0.13, dark, 'solid', false);
      box(x, y, -5.15, 0.075, 2.56, 0.13, dark, 'solid', false);
    }
    for (let z = -4.5; z < -1; z += 1.18) box(7.12, y, z, 0.13, 2.56, 0.07, dark, 'solid', false);
    for (let z = -0.4; z <= 4.8; z += 1.26) {
      box(-1.82, y, z, 0.16, 2.56, 0.08, dark, 'solid', false);
      box(-7.15, y, z, 0.13, 2.56, 0.08, dark, 'solid', false);
    }
    for (let x = -6.5; x < -2; x += 1.35) box(x, y, 5.12, 0.08, 2.56, 0.13, dark, 'solid', false);
  }
  // The load-bearing frame, projecting fins, ground-floor canopy, and stair make the model architectural.
  for (const x of [-6.85, -2.05, 2.55, 6.85]) {
    box(x, 5.84, -0.74, 0.2, 11.25, 0.35, porcelain);
    box(x, 5.84, -5.2, 0.2, 11.25, 0.27, porcelain);
  }
  for (const z of [0.2, 2.6, 4.8]) {
    box(-1.7, 5.84, z, 0.33, 11.25, 0.18, porcelain);
    box(-7.2, 5.84, z, 0.25, 11.25, 0.18, porcelain);
  }
  box(1.7, 3.0, 0.2, 4.8, 0.18, 2.05, porcelain);
  box(-0.45, 1.5, 1.0, 0.14, 2.85, 0.14, dark);
  box(3.9, 1.5, 1.0, 0.14, 2.85, 0.14, dark);
  for (let i = 0; i < 5; i++) box(1.7, 0.02 + i*0.055, 2.1 - i*0.21, 5.4, 0.1 + i*0.11, 0.34, concrete);
  // A rooftop service pavilion and parapets establish the silhouette.
  box(-3.8, 11.97, -3.1, 3.8, 0.95, 2.1, concrete, 'roof');
  box(-3.8, 12.48, -3.1, 3.95, 0.08, 2.25, porcelain, 'roof');
  box(0, 11.66, -5.08, 14.2, 0.4, 0.12, porcelain, 'roof');
  box(7.05, 11.66, -3, 0.12, 0.4, 4.25, porcelain, 'roof');
  box(-7.05, 11.66, 0, 0.12, 0.4, 10.2, porcelain, 'roof');
  box(-4.5, 11.66, 5.02, 5.2, 0.4, 0.12, porcelain, 'roof');

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
  pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(pointColors, 3));
  const pointsMaterial = new THREE.PointsMaterial({ size: 0.052, vertexColors: true, transparent: true, opacity: 0.86, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(pointGeometry, pointsMaterial);
  scene.add(points);

  // A thin horizontal slice traverses the cloud, describing scanning rather than decorative motion.
  const scanGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-7.5, 0, -5.5), new THREE.Vector3(7.5, 0, -5.5),
    new THREE.Vector3(7.5, 0, -5.5), new THREE.Vector3(7.5, 0, -0.5),
    new THREE.Vector3(7.5, 0, -0.5), new THREE.Vector3(-1.5, 0, -0.5),
    new THREE.Vector3(-1.5, 0, -0.5), new THREE.Vector3(-1.5, 0, 5.5),
    new THREE.Vector3(-1.5, 0, 5.5), new THREE.Vector3(-7.5, 0, 5.5),
    new THREE.Vector3(-7.5, 0, 5.5), new THREE.Vector3(-7.5, 0, -5.5)
  ]);
  const scan = new THREE.LineSegments(scanGeometry, new THREE.LineBasicMaterial({ color: '#91af25', transparent: true, opacity: 0.65 }));
  scene.add(scan);

  // Survey-style terrain: subtle ground grid, datum corners, and a physical plinth.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(65, 65), new THREE.ShadowMaterial({ color: '#263f35', opacity: 0.13 }));
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  environment.add(ground);
  const base = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 14.2), new THREE.MeshStandardMaterial({ color: '#e1e5da', roughness: 1, transparent: true, opacity: 0.8 }));
  base.position.y = -0.16;
  base.receiveShadow = true;
  environment.add(base);
  const grid = new THREE.GridHelper(32, 32, '#c5cfc0', '#d2d9cd');
  grid.position.y = -0.088;
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  environment.add(grid);
  const datum = new THREE.BufferGeometry();
  const datumVertices = [];
  for (const x of [-9, 9]) for (const z of [-7.1, 7.1]) {
    datumVertices.push(x-0.4,-0.07,z,x+0.4,-0.07,z,x,-0.07,z-0.4,x,-0.07,z+0.4);
  }
  datum.setAttribute('position', new THREE.Float32BufferAttribute(datumVertices, 3));
  environment.add(new THREE.LineSegments(datum, new THREE.LineBasicMaterial({ color: '#819d63', transparent: true, opacity: 0.8 })));

  // Continuous vertex-color fields illustrate deviations; they are not measurement data.
  const stops = [new THREE.Color('#304977'), new THREE.Color('#4b9ba0'), new THREE.Color('#b9d581'), new THREE.Color('#f3ce58'), new THREE.Color('#df6747')];
  function heatColor(value) {
    const q = Math.max(0, Math.min(0.999, value)) * (stops.length - 1);
    const i = Math.floor(q);
    return stops[i].clone().lerp(stops[Math.min(i+1,stops.length-1)], q-i);
  }
  function heatFace(w, h, x, y, z, rotation, phase) {
    const geometry = new THREE.PlaneGeometry(w, h, 50, 40);
    const position = geometry.getAttribute('position');
    const colors = [];
    for (let i=0; i<position.count; i++) {
      const u = position.getX(i)/w + 0.5;
      const v = position.getY(i)/h + 0.5;
      const warm = Math.exp(-(((u-0.72)**2)/0.06 + ((v-0.28)**2)/0.09));
      const cool = Math.exp(-(((u-0.2)**2)/0.1 + ((v-0.78)**2)/0.08));
      const value = 0.48 + 0.48*warm - 0.43*cool + Math.sin(u*7 + v*6 + phase)*0.08;
      const c = heatColor(value);
      colors.push(c.r,c.g,c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x,y,z);
    mesh.rotation.y = rotation;
    heatmap.add(mesh);
  }
  heatFace(13.8,10.95,0,5.85,-0.79,0,0);
  heatFace(3.95,10.95,7.09,5.85,-3,Math.PI/2,1);
  heatFace(5.9,10.95,-1.79,5.85,2,Math.PI/2,2);
  heatFace(4.95,10.95,-4.5,5.85,5.09,0,3);
  heatFace(13.8,10.95,0,5.85,-5.11,Math.PI,1);
  heatFace(9.9,10.95,-7.12,5.85,0,-Math.PI/2,2);

  function setMode(next) {
    if (!['points','model','deviation','section'].includes(next)) return;
    mode = next;
    points.visible = next === 'points';
    scan.visible = next === 'points' && !motion.matches;
    heatmap.visible = next === 'deviation';
    architecture.visible = true;
    outlines.visible = true;
    for (const material of materials) {
      material.clippingPlanes = next === 'section' ? [clippingPlane] : [];
      material.needsUpdate = true;
    }
    for (const material of [concrete, porcelain, dark, glass, interior]) {
      material.transparent = next === 'points';
      material.opacity = next === 'points' ? (material === glass ? 0.025 : 0.075) : 1;
      material.depthWrite = next !== 'points';
    }
    lineMaterial.opacity = next === 'points' ? 0.13 : next === 'deviation' ? 0.4 : 0.2;
    sun.castShadow = next !== 'points';
    base.material.opacity = next === 'points' ? 0.38 : 0.8;
    canvas.dataset.mode = next;
    onModeChange(next);
    render();
  }
  function setSection(value) {
    sectionValue = Math.max(0, Math.min(100, Number(value) || 0));
    clippingPlane.constant = 0.5 + sectionValue/100 * 12.15;
    render();
  }
  function resize() {
    if (destroyed) return;
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    render();
  }
  function updateCamera() {
    const aspect = width/height;
    const distance = (aspect < 1 ? 39 / Math.max(aspect,0.65)**0.45 : 39) / orbit.zoom;
    const sin = Math.sin(orbit.polar);
    camera.position.set(target.x + distance*sin*Math.sin(orbit.azimuth), target.y + distance*Math.cos(orbit.polar), target.z + distance*sin*Math.cos(orbit.azimuth));
    camera.lookAt(target);
  }
  function render() {
    if (destroyed) return;
    updateCamera();
    renderer.render(scene,camera);
  }
  function reset() {
    Object.assign(wanted,home);
    Object.assign(orbit,home);
    setSection(62);
    render();
  }
  function toggleRotation() {
    spinning = !spinning;
    return spinning;
  }
  function down(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    activePointer = event.pointerId;
    dragOrigin = { x:event.clientX, y:event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = 'grabbing';
  }
  function move(event) {
    if (activePointer !== event.pointerId || !dragOrigin) return;
    const dx = event.clientX-dragOrigin.x;
    const dy = event.clientY-dragOrigin.y;
    wanted.azimuth -= dx*0.007;
    wanted.polar = THREE.MathUtils.clamp(wanted.polar + dy*0.004,0.46,1.43);
    dragOrigin = { x:event.clientX,y:event.clientY };
  }
  function up(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    dragOrigin = null;
    canvas.style.cursor = 'grab';
  }
  function wheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    wanted.zoom = THREE.MathUtils.clamp(wanted.zoom * Math.exp(-event.deltaY*0.002),0.72,1.65);
  }
  function key(event) {
    let handled = true;
    if(event.key==='ArrowLeft') wanted.azimuth -= 0.14;
    else if(event.key==='ArrowRight') wanted.azimuth += 0.14;
    else if(event.key==='ArrowUp') wanted.polar = Math.max(0.46,wanted.polar-0.1);
    else if(event.key==='ArrowDown') wanted.polar = Math.min(1.43,wanted.polar+0.1);
    else if(event.key==='+' || event.key==='=') wanted.zoom = Math.min(1.65,wanted.zoom*1.1);
    else if(event.key==='-') wanted.zoom = Math.max(0.72,wanted.zoom/1.1);
    else if(event.key==='Home') reset();
    else handled = false;
    if(handled) event.preventDefault();
  }
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown',down);
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up);
  canvas.addEventListener('pointercancel',up);
  canvas.addEventListener('lostpointercapture',up);
  canvas.addEventListener('wheel',wheel,{ passive:false });
  canvas.addEventListener('keydown',key);
  canvas.addEventListener('webglcontextlost',event => {
    event.preventDefault();
    canvas.dataset.webgl = 'lost';
    canvas.parentElement?.classList.add('scene-unavailable');
    onReady(false);
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const observer = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? true; }, {rootMargin:'160px'});
  observer.observe(canvas);
  function animate(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(animate);
    if (document.hidden || !inView) { lastTime = now; return; }
    // A 30fps cap leaves mobile devices room for page interactions.
    if (now-lastTime < 31) return;
    const delta = Math.min((now-lastTime)/1000,0.08);
    lastTime = now;
    elapsed += delta;
    if(spinning && activePointer === null && !motion.matches) wanted.azimuth += delta*0.022;
    orbit.azimuth += (wanted.azimuth-orbit.azimuth)*0.18;
    orbit.polar += (wanted.polar-orbit.polar)*0.18;
    orbit.zoom += (wanted.zoom-orbit.zoom)*0.18;
    if (!motion.matches) scan.position.y = 0.4+(elapsed*0.85)%11.8;
    render();
  }
  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    resizeObserver.disconnect(); observer.disconnect();
    for (const [type,listener] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['lostpointercapture',up],['wheel',wheel],['keydown',key]]) canvas.removeEventListener(type,listener);
    scene.traverse(object => { object.geometry?.dispose(); });
    const uniqueMaterials = new Set();
    scene.traverse(object => { if(object.material) (Array.isArray(object.material)?object.material:[object.material]).forEach(m=>uniqueMaterials.add(m)); });
    uniqueMaterials.forEach(material => material.dispose());
    renderer.dispose();
  }
  setSection(sectionValue);
  setMode('points');
  resize();
  raf = requestAnimationFrame(animate);
  canvas.dataset.webgl = 'ready';
  onReady({ points:pointPositions.length/3 });
  return { setMode,reset,toggleRotation,setSection,resize,destroy };
}
