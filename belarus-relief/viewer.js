import {reliefControl, threeReliefModifiers} from './relief.js';
/* Assembly viewer. All modules, materials and geometry are served with the site. */
const host = document.getElementById('panel-viewer');

if (host) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./viewer.css', import.meta.url);
  document.head.appendChild(style);
  mountViewer(host);
}

function mountViewer(host) {
  const file = host.dataset.model || 'models/panel.glb';
  const poster = host.dataset.poster;
  host.classList.add('assembly-viewer');

  const stage = document.createElement('div');
  stage.className = 'av-stage';
  const status = document.createElement('div');
  status.className = 'av-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Подготовка 3D-сборки…';
  const bar = document.createElement('div');
  bar.className = 'av-tools';
  const mode = makeButton('Разнести детали', 'Разнести детали');
  mode.setAttribute('aria-pressed', 'false');
  const minus = makeButton('−', 'Отдалить', 'av-icon');
  const plus = makeButton('+', 'Приблизить', 'av-icon');
  const reset = makeButton('Исходный вид', 'Исходный вид и масштаб');
  const zoomGroup = document.createElement('span');
  zoomGroup.className = 'av-zoom';
  zoomGroup.append(minus, plus);
  bar.append(mode, zoomGroup, reset);
  const hint = document.createElement('div');
  hint.className = 'av-hint';
  hint.textContent = 'Перетащите для вращения. Колесо или два пальца меняют масштаб.';
  const relief = reliefControl();
  host.replaceChildren(stage, bar, relief.element, hint);
  stage.append(status);

  function makeButton(text, title, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.className = 'av-button ' + extraClass;
    button.disabled = true;
    return button;
  }

  function fallback(message) {
    stage.replaceChildren();
    if (poster) {
      const image = document.createElement('img');
      image.src = poster;
      image.alt = 'Утверждённый эскиз панно Беларуси';
      image.className = 'av-poster';
      stage.append(image);
    }
    status.textContent = message;
    status.hidden = false;
    stage.append(status);
    const download = document.createElement('a');
    download.href = file;
    download.setAttribute('download', 'Belarus-panel.glb');
    download.textContent = 'Скачать 3D-сборку (GLB)';
    download.className = 'av-button';
    bar.replaceChildren(download);
    relief.element.hidden=true;
    hint.textContent = 'Файл открывается в Blender и программах просмотра glTF.';
  }

  let softwareStarted = false;
  async function startSoftware() {
    if (softwareStarted) return;
    softwareStarted = true;
    try {
      const {mountSoftwareViewer} = await import('./cpu-viewer.js');
      await mountSoftwareViewer({stage, status, mode, minus, plus, reset, hint, file, relief});
    } catch (error) {
      console.warn('Software viewer', error);
      fallback('Не удалось открыть 3D-сборку.');
    }
  }

  async function start() {
    try {
      const [THREE, {OrbitControls}, {GLTFLoader}] = await Promise.all([
        import('./vendor/three.module.min.js'),
        import('./vendor/OrbitControls.js'),
        import('./vendor/GLTFLoader.js')
      ]);
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
      } catch {
        await startSoftware();
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      const canvas = renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', 'Трёхмерная сборка. Стрелки вращают модель, плюс и минус меняют масштаб, ноль возвращает исходный вид.');
      stage.prepend(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 8);
      const controls = new OrbitControls(camera, canvas);
      controls.enablePan = false;
      controls.enableDamping = false;
      controls.minDistance = 0.24;
      controls.maxDistance = 2.4;
      controls.minPolarAngle = 0.08;
      controls.maxPolarAngle = Math.PI - 0.08;
      controls.rotateSpeed = 0.8;
      controls.zoomSpeed = 0.9;

      const sky = new THREE.HemisphereLight(0xfff8e9, 0x8b8381, 0.92);
      const key = new THREE.DirectionalLight(0xfff1d9, 2.55);
      key.position.set(-0.43, 0.40, 0.29);
      key.castShadow = true;
      Object.assign(key.shadow.camera, {left: -0.37, right: 0.37, top: 0.37, bottom: -0.37, near: 0.05, far: 1.6});
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.00025;
      key.shadow.normalBias = 0.00032;
      const fill = new THREE.DirectionalLight(0xc9e5ff, 0.48);
      fill.position.set(0.34, 0.04, 0.32);
      scene.add(sky, key, fill);

      // A procedural studio reflection gives the lacquer and metal highlights,
      // including on devices with no network access beyond this site.
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x85817c);
      for (const [x, y, z, width, height, color] of [
        [-2, 2.2, 2, 2.4, 1.5, 0xffffff],
        [2.2, 0.2, 1, 0.8, 2.8, 0xffe4c0],
        [0, 2.8, -1, 1.8, 1.2, 0xb9d6e8]
      ]) {
        const softbox = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
        softbox.position.set(x, y, z);
        softbox.lookAt(0, 0, 0);
        envScene.add(softbox);
      }
      const pmrem = new THREE.PMREMGenerator(renderer);
      const reflection = pmrem.fromScene(envScene, 0.09, 0.05, 10);
      scene.environment = reflection.texture;
      scene.environmentIntensity = 0.75;
      envScene.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
      pmrem.dispose();

      const assembly = await new GLTFLoader().loadAsync(file, event => {
        if (event.total > 0) status.textContent = 'Загрузка сборки · ' + Math.round(event.loaded / event.total * 100) + '%';
      });
      scene.add(assembly.scene);
      const changeRelief = threeReliefModifiers(assembly.scene);
      const movingParts = [];
      assembly.scene.traverse(node => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
        if (node.userData.explode) {
          movingParts.push({node, origin: node.position.clone(), delta: new THREE.Vector3(...node.userData.explode)});
        }
      });

      let separation = 0;
      let targetSeparation = 0;
      let animation = 0;
      let aspect = 1;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function draw() {
        animation = 0;
        const gap = targetSeparation - separation;
        separation = reduceMotion || Math.abs(gap) < 0.002 ? targetSeparation : separation + gap * 0.14;
        for (const {node, origin, delta} of movingParts) {
          node.position.copy(origin).addScaledVector(delta, separation);
        }
        renderer.render(scene, camera);
        if (separation !== targetSeparation) requestDraw();
      }
      function requestDraw() {
        if (!animation) animation = requestAnimationFrame(draw);
      }
      function normalDistance() {
        return Math.max(0.224, 0.242 / aspect) / Math.tan(THREE.MathUtils.degToRad(17)) + 0.018;
      }
      function faceFront() {
        const d = normalDistance();
        camera.position.set(0.026 * d, -0.046 * d, d);
        controls.target.set(0, 0, 0);
        controls.update();
        requestDraw();
      }
      function setSeparation(value) {
        targetSeparation = value;
        mode.textContent = value ? 'Собрать панно' : 'Разнести детали';
        mode.setAttribute('aria-label', mode.textContent);
        mode.setAttribute('aria-pressed', String(Boolean(value)));
        if (value && camera.position.distanceTo(controls.target) < normalDistance() * 1.06) {
          camera.position.sub(controls.target).setLength(normalDistance() * 1.13).add(controls.target);
          controls.update();
        }
        requestDraw();
      }
      function zoom(factor) {
        const distance = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * factor, controls.minDistance, controls.maxDistance);
        camera.position.sub(controls.target).setLength(distance).add(controls.target);
        controls.update();
        requestDraw();
      }
      function resize() {
        const {width, height} = stage.getBoundingClientRect();
        if (!(width > 0 && height > 0)) return;
        const oldNormal = normalDistance();
        aspect = width / height;
        renderer.setSize(Math.round(width), Math.round(height), false);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        const newDistance = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * normalDistance() / oldNormal, controls.minDistance, controls.maxDistance);
        if (newDistance > 0) camera.position.sub(controls.target).setLength(newDistance).add(controls.target);
        controls.update();
        requestDraw();
      }

      controls.addEventListener('change', requestDraw);
      mode.onclick = () => setSeparation(targetSeparation ? 0 : 1);
      minus.onclick = () => zoom(1.18);
      plus.onclick = () => zoom(1 / 1.18);
      reset.onclick = () => { relief.reset(); setSeparation(0); faceFront(); };
      canvas.addEventListener('keydown', event => {
        if (event.key === '+' || event.key === '=') zoom(1 / 1.18);
        else if (event.key === '-') zoom(1.18);
        else if (event.key === '0' || event.key === 'Home') reset.click();
        else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
          const v = camera.position.clone().sub(controls.target);
          const spherical = new THREE.Spherical().setFromVector3(v);
          spherical.theta += event.key === 'ArrowLeft' ? -0.12 : event.key === 'ArrowRight' ? 0.12 : 0;
          spherical.phi = THREE.MathUtils.clamp(spherical.phi + (event.key === 'ArrowUp' ? -0.12 : event.key === 'ArrowDown' ? 0.12 : 0), 0.08, Math.PI - 0.08);
          camera.position.setFromSpherical(spherical).add(controls.target);
          controls.update();
        } else return;
        event.preventDefault();
      });
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        cancelAnimationFrame(animation);
        startSoftware();
      }, {once:true});
      resize();
      faceFront();
      new ResizeObserver(resize).observe(stage);
      [mode, minus, plus, reset].forEach(button => { button.disabled = false; });
      relief.bind(value=>{changeRelief(value); requestDraw();});
      status.hidden = true;
      stage.dataset.renderer = 'webgl';
    } catch (error) {
      console.warn('Assembly viewer', error);
      await startSoftware();
    }
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(item => item.isIntersecting)) { observer.disconnect(); start(); }
    }, {rootMargin:'300px'});
    observer.observe(host);
  } else start();
}
