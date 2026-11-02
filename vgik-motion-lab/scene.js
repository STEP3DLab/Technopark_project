import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { POSE_LIMITS } from './motion.js';

export const defaultPose = Object.freeze({
  base: 0, shoulder: 40, elbow: 55, wrist: 0, tilt: 0, roll: 0, focal: 20, subject: 0,
});

const DEG = Math.PI / 180;
const PALETTE = { blue: 0x1479e8, navy: 0x223260, ink: 0x14213a, pink: 0xe6005a,
  white: 0xf2f6fb, steel: 0x9caec3, floor: 0xe8edf5, cyan: 0x6dddf6 };
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = THREE.MathUtils.clamp;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function material(color, roughness = 0.42, metalness = 0.08, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function mesh(geometry, mat, parent, position, shadow = true) {
  const m = new THREE.Mesh(geometry, mat);
  if (position) m.position.copy(position);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function box(parent, size, position, mat, bevel = 0) {
  if (!bevel) return mesh(new THREE.BoxGeometry(...size), mat, parent, v3(...position));
  const [w, h, d] = size, r = Math.min(bevel, w / 3, h / 3, d / 3);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true,
    bevelSegments: 2, steps: 1, bevelSize: r * 0.5, bevelThickness: r, curveSegments: 5 });
  g.translate(0, 0, -d / 2 + r);
  return mesh(g, mat, parent, v3(...position));
}
function cylinder(parent, radius, height, position, mat, rotation, radiusTop = radius) {
  const m = mesh(new THREE.CylinderGeometry(radiusTop, radius, height, 32), mat, parent, v3(...position));
  if (rotation) m.rotation.set(...rotation);
  return m;
}
function tubeBetween(parent, a, b, radius, mat) {
  const delta = b.clone().sub(a);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12), mat, parent,
    a.clone().add(b).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(v3(0, 1, 0), delta.normalize());
  return m;
}
function textTexture(text, { width = 1024, height = 160, color = '#ffffff', background = null,
  fontSize = 64, weight = 700, tracking = 0 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  ctx.fillStyle = color; ctx.font = `${weight} ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (tracking && 'letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  ctx.fillText(text, width / 2, height / 2, width - 48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function label(parent, text, w, h, position, color = '#223260') {
  const texture = textTexture(text, { color });
  const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture,
    transparent: true, depthWrite: false, side: THREE.DoubleSide }), parent, v3(...position), false);
  return m;
}

export class StudioScene {
  constructor({ viewport, monitor, onStatus = () => {} }) {
    if (!viewport || !monitor) throw new Error('Нужны контейнеры 3D-сцены и камеры.');
    this.viewport = viewport; this.monitor = monitor; this.onStatus = onStatus;
    this.disposed=false;this.contextLost=false;this._mainDirty=true;this._monitorDirty=true;
    this._captureSession=null;this._poseSignature=null;this._lostContexts=new Set();
    this.pose = { ...defaultPose }; this.autoAim = true;
    this.view = 'perspective'; this.subjectType = 'robot';
    this.helperState = { grid: true, path: true, frustum: false };
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.floor);
    this.scene.fog = new THREE.Fog(PALETTE.floor, 15, 36);
    this.target = v3(.92, .98, 0);
    this.materials = {
      blue: material(PALETTE.blue, .33), navy: material(PALETTE.navy, .35),
      ink: material(PALETTE.ink, .43, .25), white: material(PALETTE.white, .33),
      steel: material(PALETTE.steel, .25, .78), darkSteel: material(0x41536e, .3, .67),
      pink: material(PALETTE.pink, .32), cyan: material(PALETTE.cyan, .25, .2,
        { emissive: 0x29cbea, emissiveIntensity: .4 }),
      rubber: material(0x1c2638, .88), floor: material(0xe4eaf2, .75),
    };
    try {
    this.renderer = this._makeRenderer(viewport, false);
    this.monitorRenderer = this._makeRenderer(monitor, true);
    this.camera = new THREE.PerspectiveCamera(37, 1, .05, 60);
    this.camera.position.set(-5.8, 4.2, 6.7);
    this.camera.lookAt(-.1, 1.0, 0);
    this.shotCamera = new THREE.PerspectiveCamera(35, 16 / 9, .025, 50);
    this.shotCamera.filmGauge = 36;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(-.1, 1.0, 0);
    this.controls.enableDamping = true; this.controls.dampingFactor = .085;
    this.controls.minDistance = 3.3; this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI / 2 - .025;
    this.controls.enablePan = true;
    this._onOrbitChange=()=>{this._mainDirty=true;};
    this.controls.addEventListener('change',this._onOrbitChange);
    this.controls.update();
    this._buildStudio(); this._buildRobot(); this._buildStage(); this._buildLights();
    this.pathGroup = new THREE.Group(); this.scene.add(this.pathGroup);
    this.frustumHelper = new THREE.CameraHelper(this.shotCamera);
    this.frustumHelper.visible = false; this.scene.add(this.frustumHelper);
    this.setPose(defaultPose); this.setLighting('studio');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(viewport); this.resizeObserver.observe(monitor);
    this.resize();
    this._contextLost = (event) => { event.preventDefault();this._lostContexts.add(event.target);this.contextLost=true;this._invalidate(true,true);this.onStatus({ type: 'error',
      message: 'Графический контекст потерян. Обновите страницу, чтобы продолжить.' }); };
    this._contextRestored=(event)=>{this._lostContexts.delete(event.target);this.contextLost=this._lostContexts.size>0;this._invalidate(true,true);if(!this.contextLost)this.onStatus({type:'ready',message:'3D-сцена восстановлена'});};
    this.renderer.domElement.addEventListener('webglcontextlost', this._contextLost);
    this.monitorRenderer.domElement.addEventListener('webglcontextlost', this._contextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored',this._contextRestored);
    this.monitorRenderer.domElement.addEventListener('webglcontextrestored',this._contextRestored);
    this.onStatus({ type: 'ready', message: '3D-сцена готова' });
    } catch(error) {this.dispose();throw error;}
  }

  _makeRenderer(container, preserve) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false,
      preserveDrawingBuffer: preserve, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    renderer.domElement.setAttribute('aria-label', preserve ? 'Вид через камеру робота' : 'Интерактивная 3D-сцена съёмочного стенда');
    container.appendChild(renderer.domElement);
    return renderer;
  }

  _buildStudio() {
    const m = this.materials;
    this.floor = mesh(new THREE.PlaneGeometry(200, 200), m.floor, this.scene, v3(0, -.035, 0));
    this.floor.rotation.x = -Math.PI / 2;
    this.grid = new THREE.GridHelper(12, 48, 0xa9bbcf, 0xcdd8e6);
    this.grid.position.y = -.022; this.grid.material.opacity = .55;
    this.grid.material.transparent = true; this.scene.add(this.grid);
    const deck = box(this.scene, [6.3, .11, 3.55], [-.13, .02, 0], material(0xd6deeb, .6), .035);
    box(this.scene, [6.14, .018, 3.38], [-.13, .083, 0], material(0xf3f6fa, .58), .005);
    // Engraved board registration grid, kept intentionally sparse.
    const markPositions = [];
    for (let x = -2.85; x < 2.8; x += .35) {
      for (let z = -1.45; z < 1.5; z += .35) {
        markPositions.push([x, .096, z]);
      }
    }
    const marks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.011,.011,.003,8),m.steel,markPositions.length);
    const markTransform = new THREE.Matrix4();
    markPositions.forEach((p,i)=>{markTransform.makeTranslation(...p);marks.setMatrixAt(i,markTransform);});
    marks.receiveShadow=true;this.scene.add(marks);
    const sideLabel = label(this.scene, 'РГСУ  /  ВГИК     MOTION LAB', 2.45, .24, [-1.25, .17, 1.79]);
    sideLabel.material.opacity = .82;
    for (const x of [-2.9, 2.6]) for (const z of [-1.55, 1.55]) {
      cylinder(this.scene, .065, .05, [x, -.005, z], m.rubber);
    }
    // Solid cyclorama behind the animation stage; normals face the camera side.
    const curve = new THREE.Shape();
    curve.moveTo(1.7, .1); curve.lineTo(2.5, .1);
    curve.quadraticCurveTo(3.1, .1, 3.1, .7); curve.lineTo(3.1, 3.25);
    curve.lineTo(3.05, 3.25); curve.lineTo(3.05, .7);
    curve.quadraticCurveTo(3.05, .16, 2.5, .16); curve.lineTo(1.7, .16);
    const cyclorama = mesh(new THREE.ExtrudeGeometry(curve, { depth: 3.4, bevelEnabled: false,
      steps: 1, curveSegments: 24 }), material(0x223260, .82), this.scene, v3(0, 0, -1.7));
    const backTitle = label(this.scene, 'MOTION', 1.65, .26, [3.015, 2.6, 0], '#788ebc');
    backTitle.rotation.y = -Math.PI / 2;
    const backSubtitle = label(this.scene, 'FRAME BY FRAME', 1.6, .16, [3.01, 2.3, 0], '#9fb4d8');
    backSubtitle.rotation.y = -Math.PI / 2;
    this.studioGeometry = { deck, cyclorama, marks };
  }

  _joint(parent, radius = .21, depth = .40) {
    const m = this.materials, group = new THREE.Group(); parent.add(group);
    cylinder(group, radius, depth, [0, 0, 0], m.navy, [Math.PI / 2, 0, 0]);
    for (const sign of [-1, 1]) {
      cylinder(group, radius * .83, .028, [0, 0, sign * (depth / 2 + .012)], m.steel, [Math.PI / 2, 0, 0]);
      cylinder(group, radius * .64, .038, [0, 0, sign * (depth / 2 + .03)], m.ink, [Math.PI / 2, 0, 0]);
      cylinder(group, radius * .19, .045, [0, 0, sign * (depth / 2 + .054)], m.steel, [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const bolt = mesh(new THREE.CylinderGeometry(.012, .012, .012, 6), m.darkSteel, group,
          v3(Math.cos(angle) * radius * .72, Math.sin(angle) * radius * .72, sign * (depth / 2 + .03)));
        bolt.rotation.x = Math.PI / 2;
      }
    }
    return group;
  }

  _link(parent, length, width, index) {
    const m = this.materials;
    box(parent, [width, length - .07, .23], [0, length / 2, 0], m.white, .055);
    box(parent, [width * .66, length - .29, .025], [0, length / 2, .132], m.blue, .012);
    box(parent, [width * .66, length - .29, .025], [0, length / 2, -.132], m.blue, .012);
    for (const x of [-1, 1]) tubeBetween(parent, v3(x * width * .39, .17, 0),
      v3(x * width * .39, length - .17, 0), .019, m.steel);
    for (let i = 0; i < 5; i++) {
      box(parent, [width * .35, .014, .006], [0, .24 + i * .035, .15], m.navy);
    }
    const badge = label(parent, `0${index}`, width * .48, .12, [0, length * .64, .153], '#ffffff');
    const cable = new THREE.CatmullRomCurve3([v3(-width * .62, .11, -.03),
      v3(-width * .64, length * .48, -.12), v3(-width * .5, length - .1, -.03)]);
    mesh(new THREE.TubeGeometry(cable, 18, .026, 6, false), m.rubber, parent);
  }

  _buildRobot() {
    const m = this.materials;
    this.robot = new THREE.Group(); this.robot.position.set(-2.75, .1, 0); this.scene.add(this.robot);
    box(this.robot, [.95, .065, .85], [0, .04, 0], m.navy, .025);
    cylinder(this.robot, .36, .14, [0, .14, 0], m.white);
    cylinder(this.robot, .315, .035, [0, .225, 0], m.blue);
    for (const x of [-.35, .35]) for (const z of [-.3, .3]) {
      cylinder(this.robot, .035, .015, [x, .084, z], m.steel);
      cylinder(this.robot, .016, .018, [x, .09, z], m.ink);
    }
    this.basePivot = new THREE.Group(); this.robot.add(this.basePivot);
    cylinder(this.basePivot, .235, .31, [0, .4, 0], m.navy, null, .19);
    cylinder(this.basePivot, .21, .04, [0, .55, 0], m.steel);
    cylinder(this.basePivot, .233, .022, [0, .325, 0], m.pink);
    box(this.basePivot, [.25, .25, .46], [0, .55, 0], m.white, .025);
    this.shoulderPivot = new THREE.Group(); this.shoulderPivot.position.y = .57;
    this.basePivot.add(this.shoulderPivot); this._joint(this.shoulderPivot, .22, .45);
    this._link(this.shoulderPivot, 1.25, .29, 1);
    this.elbowPivot = new THREE.Group(); this.elbowPivot.position.y = 1.25;
    this.shoulderPivot.add(this.elbowPivot); this._joint(this.elbowPivot, .19, .38);
    this._link(this.elbowPivot, 1.12, .245, 2);
    this.tip = new THREE.Object3D(); this.tip.position.y = 1.12; this.elbowPivot.add(this.tip);
    this._joint(this.tip, .145, .28);
    this._armMeshes=[];this.shoulderPivot.traverse(o=>{if(o.isMesh)this._armMeshes.push(o);});
    this.wristRoot=new THREE.Group();this.wristRoot.rotation.z=Math.PI/2;this.tip.add(this.wristRoot);
    this.wristYaw=new THREE.Group();this.wristRoot.add(this.wristYaw);
    this.wristPitch=new THREE.Group();this.wristYaw.add(this.wristPitch);
    this.wristRoll=new THREE.Group();this.wristPitch.add(this.wristRoll);
    this.cameraMount = new THREE.Group();this.wristRoll.add(this.cameraMount);
    // Intersecting wrist axes form a spherical joint; the three local pivots
    // inherit the orientation of the forearm in manual mode.
    cylinder(this.wristRoot,.15,.035,[0,0,0],m.steel);
    cylinder(this.wristYaw,.148,.031,[0,0,0],m.navy,[0,0,Math.PI/2]);
    cylinder(this.wristPitch,.143,.027,[0,0,0],m.blue,[Math.PI/2,0,0]);
    // A compact spherical wrist allows the tracked three-axis camera orientation.
    mesh(new THREE.SphereGeometry(.13, 24, 16), m.darkSteel, this.cameraMount);
    cylinder(this.cameraMount, .14, .07, [0, .11, 0], m.white);
    box(this.cameraMount, [.44, .04, .36], [0, .17, -.04], m.navy, .012);
    for (const x of [-.20, .20]) box(this.cameraMount, [.035, .20, .22], [x, .25, -.04], m.steel, .009);
    this.cameraBody = new THREE.Group(); this.cameraBody.position.set(0, .29, -.04);
    this.cameraMount.add(this.cameraBody);
    box(this.cameraBody, [.36, .25, .29], [0, 0, .04], m.ink, .035);
    box(this.cameraBody, [.026, .22, .23], [-.20, 0, .05], m.rubber, .009);
    box(this.cameraBody, [.11, .16, .13], [.19, 0, .05], m.rubber, .018);
    box(this.cameraBody, [.25, .026, .055], [0, .205, .04], m.ink, .01);
    for (const x of [-.105, .105]) box(this.cameraBody, [.025, .08, .05], [x, .16, .04], m.ink, .005);
    cylinder(this.cameraBody, .115, .27, [0, 0, -.21], m.rubber, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 7; i++) cylinder(this.cameraBody, .121, .012, [0, 0, -.15 - i * .024],
      i === 1 ? m.pink : m.darkSteel, [Math.PI / 2, 0, 0]);
    cylinder(this.cameraBody, .107, .012, [0, 0, -.352], m.ink, [Math.PI / 2, 0, 0]);
    cylinder(this.cameraBody, .085, .013, [0, 0, -.36], material(0x2da3c4, .08, .8,
      { emissive: 0x064e67, emissiveIntensity: .3 }), [Math.PI / 2, 0, 0]);
    mesh(new THREE.SphereGeometry(.012, 12, 8), material(PALETTE.pink, .3, 0,
      { emissive: PALETTE.pink, emissiveIntensity: .9 }), this.cameraBody, v3(.13, .095, -.113));
    const sideBadge = label(this.cameraBody, 'CINE / 01', .22, .07, [0, .05, .192], '#d4e6fa');
    const screen = box(this.cameraBody, [.24, .15, .023], [0, .32, .035], m.ink, .01);
    screen.rotation.x = -.18;
    const screenGlow = box(this.cameraBody, [.205, .112, .004], [0, .32, .05], m.cyan, .002);
    screenGlow.rotation.x = -.18;
    // The shot camera is physically fixed at the front glass of the lens.
    this.shotCamera.position.set(0, 0, -.371); this.cameraBody.add(this.shotCamera);
    this._cameraMeshes=[];this.wristRoot.traverse(o=>{if(o.isMesh)this._cameraMeshes.push(o);});
    this.robotLabel = label(this.scene, 'PRINTED MOTION SYSTEM', 1.15, .14, [-2.48, .13, .58]);
    this.robotLabel.rotation.x = -Math.PI / 2;
  }

  _buildStage() {
    const m = this.materials;
    this.stage = new THREE.Group(); this.stage.position.set(.92, 0, 0); this.scene.add(this.stage);
    cylinder(this.stage, 1.04, .17, [0, .185, 0], m.navy);
    cylinder(this.stage, 1.055, .027, [0, .282, 0], m.blue);
    cylinder(this.stage, 1.03, .07, [0, .325, 0], m.white);
    const tickMaterial = material(0x899bb7, .7);
    for (let i = 0; i < 48; i++) {
      const angle = i * Math.PI / 24;
      const mark = box(this.stage, [i % 4 ? .028 : .07, .002, .006],
        [Math.cos(angle) * .98, .362, Math.sin(angle) * .98], tickMaterial);
      mark.rotation.y = -angle;
    }
    this.subjects = {};
    const character = new THREE.Group(); character.position.y = .36;
    character.rotation.y = -Math.PI / 2; this.stage.add(character);
    this.subjects.robot = character;
    this.characterRoot = new THREE.Group(); character.add(this.characterRoot);
    const hip = this.characterRoot;
    const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
    leftLeg.position.set(-.125, .32, 0); rightLeg.position.set(.125, .32, 0); hip.add(leftLeg, rightLeg);
    for (const leg of [leftLeg, rightLeg]) {
      cylinder(leg, .06, .24, [0, -.12, 0], m.navy);
      mesh(new THREE.SphereGeometry(.07, 16, 12), m.steel, leg);
      box(leg, [.16, .09, .22], [0, -.28, .04], m.white, .025);
      box(leg, [.17, .026, .23], [0, -.323, .04], m.blue, .008);
    }
    box(hip, [.37, .34, .27], [0, .48, 0], m.blue, .065);
    box(hip, [.24, .2, .015], [0, .49, .145], m.white, .025);
    mesh(new THREE.SphereGeometry(.032, 16, 12), m.pink, hip, v3(0, .5, .163));
    const head = new THREE.Group(); head.position.y = .82; hip.add(head);
    cylinder(hip, .058, .08, [0, .68, 0], m.steel);
    box(head, [.48, .36, .35], [0, 0, 0], m.white, .065);
    box(head, [.405, .23, .027], [0, .015, .185], m.ink, .04);
    for (const x of [-.105, .105]) {
      box(head, [.043, .075, .017], [x, .025, .206], m.cyan, .008);
      cylinder(head, .087, .038, [x < 0 ? -.256 : .256, -.015, 0], m.blue, [0, 0, Math.PI / 2]);
    }
    const smileCurve = new THREE.CatmullRomCurve3([v3(-.045, -.04, .205),v3(0, -.057, .212),v3(.045, -.04, .205)]);
    mesh(new THREE.TubeGeometry(smileCurve, 12, .006, 5, false), m.cyan, head);
    cylinder(head, .015, .12, [0, .23, 0], m.steel);
    mesh(new THREE.SphereGeometry(.035, 16, 12), m.pink, head, v3(0, .31, 0));
    const leftArm = new THREE.Group(), rightArm = new THREE.Group();
    leftArm.position.set(-.235, .6, 0); rightArm.position.set(.235, .6, 0); hip.add(leftArm,rightArm);
    for (const arm of [leftArm, rightArm]) {
      mesh(new THREE.SphereGeometry(.067, 16, 12), m.steel, arm);
      cylinder(arm, .052, .22, [0, -.13, 0], m.white);
      mesh(new THREE.SphereGeometry(.07, 16, 12), m.blue, arm, v3(0, -.27, 0));
    }
    this.characterParts = { leftLeg, rightLeg, head, leftArm, rightArm };
    // Two alternative subjects share the same stage and shot target.
    const rocket = new THREE.Group(); rocket.position.y = .37; this.stage.add(rocket); rocket.visible = false;
    cylinder(rocket, .17, .59, [0,.36,0], m.white);
    mesh(new THREE.ConeGeometry(.175,.32,32), m.blue, rocket, v3(0,.815,0));
    cylinder(rocket, .19, .07, [0,.12,0], m.navy);
    cylinder(rocket, .12, .07, [-.17,.46,0], m.navy, [0,0,Math.PI/2]);
    cylinder(rocket, .088, .075, [-.18,.46,0], m.cyan, [0,0,Math.PI/2]);
    for (let i=0;i<3;i++) { const fin = mesh(new THREE.ConeGeometry(.16,.34,3),m.pink,rocket);
      fin.position.set(Math.cos(i*Math.PI*2/3)*.18,.19,Math.sin(i*Math.PI*2/3)*.18); fin.rotation.y=i*Math.PI*2/3; }
    this.subjects.rocket = rocket;
    const abstract = new THREE.Group(); abstract.position.y=.36; this.stage.add(abstract); abstract.visible=false;
    const knot = mesh(new THREE.TorusKnotGeometry(.28,.078,96,12),m.blue,abstract,v3(0,.57,0));
    cylinder(abstract,.19,.16,[0,.1,0],m.white);
    this.subjects.abstract = abstract; this.abstractKnot=knot;
    // Small props on the set give depth and parallax to camera moves.
    const propMat = material(0xb3cbf0, .5);
    cylinder(this.stage, .19, .32, [.45,.52,-.55], propMat);
    mesh(new THREE.SphereGeometry(.16,32,20), m.pink, this.stage, v3(.45,.84,-.55));
    box(this.stage,[.27,.27,.27],[.42,.5,.57],m.blue,.04);
    const sphere=mesh(new THREE.SphereGeometry(.14,32,20),m.white,this.stage,v3(.34,.77,.57));
    const archGroup = new THREE.Group(); archGroup.position.set(.7,.36,0); this.stage.add(archGroup);
    box(archGroup,[.09,.74,.09],[0,.37,-.63],m.steel,.01);
    box(archGroup,[.09,.74,.09],[0,.37,.63],m.steel,.01);
    const arch = mesh(new THREE.TorusGeometry(.63,.045,10,64,Math.PI),m.blue,archGroup,v3(0,.74,0));
    arch.rotation.y = Math.PI/2;
  }

  _lightStand(position, color, intensity, target, size = .7) {
    const m=this.materials, stand=new THREE.Group(); stand.position.copy(position);this.scene.add(stand);
    const height=2.6;
    tubeBetween(stand,v3(0,.05,0),v3(0,height,0),.028,m.darkSteel);
    cylinder(stand,.045,.11,[0,1.15,0],m.ink);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;tubeBetween(stand,v3(0,.25,0),v3(Math.cos(a)*.35,.03,Math.sin(a)*.35),.022,m.darkSteel);}
    const head=new THREE.Group();head.position.y=height;stand.add(head);
    head.lookAt(target);
    box(head,[size,size*.76,.1],[0,0,0],m.ink,.035);
    box(head,[size*.9,size*.66,.008],[0,0,.056],material(color,.5,0,{emissive:color,emissiveIntensity:1.5}),.015);
    const light=new THREE.SpotLight(color,intensity,12,Math.PI/4,.55,1.5);
    light.position.copy(position).add(v3(0,height,.1));light.target.position.copy(target);
    light.castShadow=false;this.scene.add(light,light.target);
    return {stand,light};
  }

  _buildLights() {
    this.hemisphere = new THREE.HemisphereLight(0xf4f8ff,0x6c7d9d,2.1);this.scene.add(this.hemisphere);
    this.key = new THREE.DirectionalLight(0xffffff,3.2);this.key.position.set(-3.4,6.5,4.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1536,1536);
    this.key.shadow.camera.left=-5;this.key.shadow.camera.right=5;
    this.key.shadow.camera.top=5;this.key.shadow.camera.bottom=-5;
    this.key.shadow.camera.near=.1;this.key.shadow.camera.far=20;
    this.key.shadow.bias=-.0004;this.key.shadow.normalBias=.022;
    this.key.shadow.radius=3;this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0x84bcff,2.3);this.rim.position.set(3.5,4,-4.5);this.scene.add(this.rim);
    this.practicals = [this._lightStand(v3(-.35,.1,-2.15),0xdceaff,15,this.target,.72),
      this._lightStand(v3(1.0,.1,2.15),0xfff2df,12,this.target,.62)];
  }

  _invalidate(monitor=true,shadows=false) {
    this._mainDirty=true;
    if(monitor)this._monitorDirty=true;
    if(shadows)for(const renderer of [this.renderer,this.monitorRenderer])if(renderer?.shadowMap)renderer.shadowMap.needsUpdate=true;
  }

  _setLocalWrist(quaternion) {
    const euler=new THREE.Euler().setFromQuaternion(quaternion,'YXZ');
    this.wristYaw.rotation.y=euler.y;
    this.wristPitch.rotation.x=euler.x;
    this.wristRoll.rotation.z=euler.z;
    this._localWrist={yaw:euler.y/DEG+90,pitch:euler.x/DEG,roll:euler.z/DEG};
  }

  setPose(next = {}) {
    for(const key of Object.keys(defaultPose)) {
      const value=finite(next[key],this.pose[key]);
      this.pose[key]=clamp(value,...POSE_LIMITS[key]);
    }
    const p=this.pose;
    const signature=Object.values(p).join('|')+'|'+this.autoAim+'|'+this.subjectType;
    if(signature===this._poseSignature)return {...p};
    this.basePivot.rotation.y=p.base*DEG;
    this.shoulderPivot.rotation.z=-p.shoulder*DEG;
    this.elbowPivot.rotation.z=-p.elbow*DEG;
    this.scene.updateMatrixWorld(true);
    if(this.autoAim){
      const parentInverse=this.wristRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
      let lensOrigin=this.tip.getWorldPosition(new THREE.Vector3());
      const desiredWorld=new THREE.Quaternion(),desiredLocal=new THREE.Quaternion();
      for(let i=0;i<7;i++){
        const rot=new THREE.Matrix4().lookAt(lensOrigin,this.target,v3(0,1,0));
        desiredWorld.setFromRotationMatrix(rot);
        desiredLocal.copy(parentInverse).multiply(desiredWorld);
        this._setLocalWrist(desiredLocal);
        this.wristRoot.updateMatrixWorld(true);
        this.shotCamera.getWorldPosition(lensOrigin);
      }
      // Tracking values are optical offsets. Diagnostics expose the resulting
      // local wrist angles separately from those operator inputs.
      desiredWorld.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0,1,0),p.wrist*DEG));
      desiredWorld.multiply(new THREE.Quaternion().setFromAxisAngle(v3(1,0,0),p.tilt*DEG));
      desiredWorld.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0,0,1),p.roll*DEG));
      this._setLocalWrist(parentInverse.multiply(desiredWorld));
    }else{
      this.wristYaw.rotation.y=-Math.PI/2+p.wrist*DEG;
      this.wristPitch.rotation.x=p.tilt*DEG;
      this.wristRoll.rotation.z=p.roll*DEG;
      this._localWrist={yaw:p.wrist,pitch:p.tilt,roll:p.roll};
    }
    this.shotCamera.setFocalLength(p.focal);
    this._poseSubject(p.subject);
    this.scene.updateMatrixWorld(true);
    if(this.frustumHelper?.visible)this.frustumHelper.update();
    this._poseSignature=signature;this._invalidate(true,true);
    return {...this.pose};
  }

  _poseSubject(value) {
    const t=value/100, phase=t*Math.PI*2, parts=this.characterParts;
    if(!parts)return;
    this.characterRoot.position.y=.014*Math.sin(phase*2);
    this.characterRoot.rotation.y=.20*Math.sin(phase);
    parts.head.rotation.y=.24*Math.sin(phase);
    parts.head.rotation.z=.06*Math.sin(phase);
    parts.leftLeg.rotation.x=.22*Math.sin(phase);
    parts.rightLeg.rotation.x=-.22*Math.sin(phase);
    parts.leftArm.rotation.z=-.18-.12*Math.sin(phase);
    parts.rightArm.rotation.z=.65+.65*Math.sin(phase);
    parts.leftArm.rotation.x=-.16*Math.sin(phase);
    parts.rightArm.rotation.x=.15*Math.cos(phase);
    this.subjects.rocket.rotation.y=phase;
    this.subjects.rocket.position.y=.37+.07*Math.sin(phase);
    this.abstractKnot.rotation.set(phase*.5,phase*.8,phase*.3);
  }

  _meshBounds(meshes) {
    const bounds=new THREE.Box3(),local=new THREE.Box3();
    for(const object of meshes){
      if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
      local.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);bounds.union(local);
    }
    return bounds;
  }

  _assessCurrent(extraIssues=[]) {
    this.scene.updateMatrixWorld(true);
    const issues=[...extraIssues],cameraPosition=this.getCameraPosition();
    const cameraBox=this._meshBounds(this._cameraMeshes),armBox=this._meshBounds(this._armMeshes);
    const minCameraY=cameraBox.min.y,minArmY=armBox.min.y;
    const localWrist={...this._localWrist};
    const allFinite=[...Object.values(cameraPosition),minCameraY,minArmY,...Object.values(localWrist)].every(Number.isFinite);
    if(!allFinite)issues.push({code:'non_finite_geometry',severity:'error',message:'Не удалось рассчитать конечное положение камеры.'});
    if(minCameraY<.106)issues.push({code:'camera_below_table',severity:'error',message:'Камера пересекает рабочую плоскость стенда. Уменьшите угол плеча или локтя.'});
    if(minArmY<.106)issues.push({code:'arm_below_table',severity:'error',message:'Звено руки пересекает рабочую плоскость стенда. Измените плечо и локоть.'});
    const subjectBox=new THREE.Box3().setFromObject(this.subjects[this.subjectType||'robot']);
    const lens=v3(cameraPosition.x,cameraPosition.y,cameraPosition.z);
    if(cameraBox.intersectsBox(subjectBox)||subjectBox.distanceToPoint(lens)<this.shotCamera.near*2){
      issues.push({code:'camera_subject_overlap',severity:'error',message:'Камера слишком близко к области объекта. Отведите руку назад.'});
    }else if(subjectBox.distanceToPoint(lens)<.2){
      issues.push({code:'camera_subject_clearance',severity:'warning',message:'Между камерой и объектом осталось мало места.'});
    }
    const targetCamera=this.target.clone().applyMatrix4(this.shotCamera.matrixWorldInverse);
    const targetFrame=this.target.clone().project(this.shotCamera);
    if(targetCamera.z>=-this.shotCamera.near)issues.push({code:'target_behind_camera',severity:'warning',message:'Объект находится за камерой. Измените запястье и наклон или включите слежение.'});
    else if(Math.abs(targetFrame.x)>1||Math.abs(targetFrame.y)>1)issues.push({code:'target_outside_frame',severity:'warning',message:'Объект вышел из кадра. Поправьте направление камеры.'});
    return{valid:allFinite&&!issues.some(i=>i.severity==='error'),issues,cameraPosition,minCameraY,minArmY,localWrist};
  }

  _withPoseSnapshot(callback) {
    const pose={...this.pose},mainDirty=this._mainDirty,monitorDirty=this._monitorDirty;
    const shadowStates=[this.renderer?.shadowMap?.needsUpdate,this.monitorRenderer?.shadowMap?.needsUpdate];
    try{return callback();}
    finally{
      this._poseSignature=null;this.setPose(pose);
      this._mainDirty=mainDirty;this._monitorDirty=monitorDirty;
      [this.renderer,this.monitorRenderer].forEach((renderer,i)=>{if(renderer?.shadowMap)renderer.shadowMap.needsUpdate=shadowStates[i];});
    }
  }

  _poseInputIssues(pose) {
    const extraIssues=[];
    if(!pose||typeof pose!=='object')extraIssues.push({code:'invalid_pose',severity:'error',message:'Положение должно содержать числовые параметры.'});
    else for(const key of Object.keys(defaultPose))if(pose[key]!==undefined&&!Number.isFinite(Number(pose[key]))) {
      extraIssues.push({code:'invalid_pose',severity:'error',message:'Параметры положения должны быть конечными числами.'});break;
    }
    return extraIssues;
  }

  assessPose(pose=this.pose) {
    const extraIssues=this._poseInputIssues(pose);
    if(pose===this.pose)return this._assessCurrent(extraIssues);
    return this._withPoseSnapshot(()=>{this.setPose(pose||{});return this._assessCurrent(extraIssues);});
  }

  analyzeProgram(poses) {
    if(!Array.isArray(poses)||!poses.length)return{valid:false,issues:[{code:'empty_program',severity:'error',message:'В программе нет положений для проверки.'}],sampleCount:0,firstInvalidIndex:0,minCameraY:null,minArmY:null};
    return this._withPoseSnapshot(()=>{
      let firstInvalidIndex=null,minCameraY=Infinity,minArmY=Infinity;const issues=[],seen=new Set();
      poses.forEach((pose,sampleIndex)=>{
        const inputIssues=this._poseInputIssues(pose);this.setPose(pose||{});const result=this._assessCurrent(inputIssues);
        if(!result.valid&&firstInvalidIndex===null)firstInvalidIndex=sampleIndex;
        minCameraY=Math.min(minCameraY,result.minCameraY);minArmY=Math.min(minArmY,result.minArmY);
        for(const issue of result.issues)if(!seen.has(issue.code)){seen.add(issue.code);issues.push({...issue,sampleIndex});}
      });
      return{valid:firstInvalidIndex===null,issues,sampleCount:poses.length,firstInvalidIndex,minCameraY,minArmY};
    });
  }

  setAutoAim(enabled) { this.autoAim=Boolean(enabled);this.setPose(this.pose); }
  setSubjectType(type) {
    if(!this.subjects[type])return false;
    this.subjectType=type;for(const [name,group]of Object.entries(this.subjects))group.visible=name===type;
    this.target.y=type==='robot'?.98:type==='rocket'?.94:.96;
    this.setPose(this.pose);return true;
  }
  setLighting(type='studio') {
    const settings={studio:[0xffffff,3.2,2.1,0x84bcff,2.3,1.12],
      warm:[0xffe0b7,3.4,1.65,0x8ea8ed,2.3,1.08],dramatic:[0xc9deff,3.7,.8,0xe6005a,3.1,.98]}[type]
      ||[0xffffff,3.2,2.1,0x84bcff,2.3,1.12];
    this.key.color.set(settings[0]);this.key.intensity=settings[1];
    this.hemisphere.intensity=settings[2];this.rim.color.set(settings[3]);this.rim.intensity=settings[4];
    this.renderer.toneMappingExposure=settings[5];this.monitorRenderer.toneMappingExposure=settings[5];
    this.lighting=type;
    this._invalidate(true,true);
  }
  setHelpers(next={}) {
    Object.assign(this.helperState,next);
    this.grid.visible=Boolean(this.helperState.grid);
    this.pathGroup.visible=Boolean(this.helperState.path);
    this.frustumHelper.visible=Boolean(this.helperState.frustum);
    if(this.frustumHelper.visible)this.frustumHelper.update();
    this._invalidate(false,false);
  }
  setPath(poses=[]) {
    for(const child of [...this.pathGroup.children]){
      this.pathGroup.remove(child);child.traverse(o=>{o.geometry?.dispose();if(o.material){const a=Array.isArray(o.material)?o.material:[o.material];a.forEach(m=>m.dispose());}});
    }
    this._invalidate(false,false);if(poses.length<2)return;
    const current={...this.pose},points=[];
    for(const pose of poses){this.setPose(pose);points.push(this.shotCamera.getWorldPosition(new THREE.Vector3()));}
    this.setPose(current);
    const lineMat=new THREE.LineDashedMaterial({color:PALETTE.blue,dashSize:.055,gapSize:.035,
      transparent:true,opacity:.75,depthWrite:false});
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),lineMat);
    line.computeLineDistances();this.pathGroup.add(line);
    const count=Math.min(poses.length,8),step=(poses.length-1)/(count-1);
    for(let i=0;i<count;i++){
      const point=points[Math.round(i*step)];
      mesh(new THREE.SphereGeometry((i===0||i===count-1)?.035:.021,12,8),
        new THREE.MeshBasicMaterial({color:i===0?PALETTE.pink:PALETTE.blue}),this.pathGroup,point,false);
    }
  }
  setView(view='perspective') {
    const positions={perspective:[-5.8,4.2,6.7],front:[-7.5,2.6,.02],top:[-.1,9.8,.015]};
    this.view=view==='camera'?'camera':positions[view]?view:'perspective';
    this.controls.enabled=this.view!=='camera';
    if(positions[this.view]){
      this.camera.position.set(...positions[this.view]);this.controls.target.set(-.1,1,0);
      this.camera.up.set(0,1,0);this.controls.update();
    }
    this.resize();
  }
  resize() {
    const width=Math.max(1,this.viewport.clientWidth),height=Math.max(1,this.viewport.clientHeight);
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;
    // Preserve horizontal coverage in portrait layouts and leave breathing room
    // for the viewport toolbar and footer without changing the user's orbit.
    const fitScale=Math.max(1,1.5/this.camera.aspect,
      .99/Math.max(.35,1-112/height),.84/Math.max(.35,1-144/height));
    this.camera.fov=2*Math.atan(Math.tan(37*DEG/2)*fitScale)/DEG;
    this.camera.updateProjectionMatrix();
    const mw=Math.max(160,this.monitor.clientWidth),mh=Math.max(90,this.monitor.clientHeight);
    if(!this._captureSession)this.monitorRenderer.setSize(mw,mh,false);
    this._invalidate(true,false);
  }
  _renderShot(renderer,w,h) {
    const viewH=Math.min(h,w*9/16),viewW=viewH*16/9,x=(w-viewW)/2,y=(h-viewH)/2;
    const helpers=[this.grid,this.pathGroup,this.frustumHelper];
    const visibility=helpers.map(helper=>helper.visible);
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
    const scissorTest=renderer.getScissorTest(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
    try{
      helpers.forEach(helper=>{helper.visible=false;});
      renderer.setScissorTest(false);renderer.setClearColor(0x101b32,1);renderer.clear();
      renderer.setViewport(x,y,viewW,viewH);renderer.setScissor(x,y,viewW,viewH);
      renderer.setScissorTest(true);renderer.render(this.scene,this.shotCamera);
    }finally{
      helpers.forEach((helper,i)=>{helper.visible=visibility[i];});
      renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
      renderer.setClearColor(clearColor,clearAlpha);
    }
  }
  _renderMonitor({force=false}={}) {
    if(this.contextLost||this.disposed)return false;
    if(!force&&!this._monitorDirty)return false;
    const size=this.monitorRenderer.getSize(new THREE.Vector2());
    this._renderShot(this.monitorRenderer,size.x,size.y);
    this._monitorDirty=false;return true;
  }
  render() {
    if(this.disposed||this.contextLost)return false;
    this.controls.update();
    if(!this._mainDirty&&!this._monitorDirty)return false;
    this.scene.updateMatrixWorld(true);
    let drew=false;
    if(this._mainDirty){
      if(this.frustumHelper.visible)this.frustumHelper.update();
      if(this.view==='camera')this._renderShot(this.renderer,this.viewport.clientWidth,this.viewport.clientHeight);
      else{
        this.renderer.setViewport(0,0,this.viewport.clientWidth,this.viewport.clientHeight);
        this.renderer.setScissorTest(false);this.renderer.render(this.scene,this.camera);
      }
      this._mainDirty=false;drew=true;
    }
    return this._renderMonitor()||drew;
  }

  getCameraPosition() {
    this.scene.updateMatrixWorld(true);
    const p=this.shotCamera.getWorldPosition(new THREE.Vector3());return{x:p.x,y:p.y,z:p.z};
  }
  beginCapture({width=1280,height=720}={}) {
    if(this.contextLost||this.disposed)throw new Error('3D-сцена недоступна для съёмки.');
    if(this._captureSession)return;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw new Error('Недопустимый размер кадра.');
    this._captureSession={pixelRatio:this.monitorRenderer.getPixelRatio(),size:this.monitorRenderer.getSize(new THREE.Vector2())};
    try{this.monitorRenderer.setPixelRatio(1);this.monitorRenderer.setSize(width,height,false);this._monitorDirty=true;}
    catch(error){this.endCapture();throw error;}
  }
  endCapture() {
    const session=this._captureSession;if(!session)return;
    this._captureSession=null;
    try{this.monitorRenderer.setPixelRatio(session.pixelRatio);this.monitorRenderer.setSize(session.size.x,session.size.y,false);}
    finally{this._invalidate(true,false);}
  }
  captureFrame() {
    if(this.contextLost||this.disposed)throw new Error('3D-сцена недоступна для съёмки.');
    const assessment=this.assessPose();
    if(!assessment.valid)throw new Error(assessment.issues.find(issue=>issue.severity==='error')?.message||'Положение недопустимо для съёмки.');
    const ownSession=!this._captureSession;
    try{
      if(ownSession)this.beginCapture();
      this._renderMonitor({force:true});
      return this.monitorRenderer.domElement.toDataURL('image/png');
    }finally{if(ownSession)this.endCapture();}
  }
  getDiagnostics() {
    const assessment=this.assessPose(),position=assessment.cameraPosition;
    let webgl=null;
    if(this.renderer&&!this.contextLost)try{const gl=this.renderer.getContext();webgl=gl.getParameter(gl.VERSION);}catch{}
    return{...assessment,finite:Object.values(position).every(Number.isFinite),camera:position,
      distance:v3(position.x,position.y,position.z).distanceTo(this.target),aboveTable:assessment.minCameraY>=.106&&assessment.minArmY>=.106,
      warnings:assessment.issues.map(issue=>issue.message),webgl,autoAim:this.autoAim,contextLost:this.contextLost,disposed:this.disposed,
      drawCalls:this.renderer?.info?.render?.calls??0,triangles:this.renderer?.info?.render?.triangles??0};
  }

  dispose() {
    if(this.disposed)return;
    this.disposed=true;this._captureSession=null;this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change',this._onOrbitChange);this.controls?.dispose();
    for(const renderer of [this.renderer,this.monitorRenderer]){
      renderer?.domElement?.removeEventListener('webglcontextlost',this._contextLost);
      renderer?.domElement?.removeEventListener('webglcontextrestored',this._contextRestored);
    }
    const geometries=new Set(),materials=new Set(Object.values(this.materials||{})),textures=new Set();
    this.scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);
      const mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
      mats.forEach(mat=>{materials.add(mat);if(mat.map)textures.add(mat.map);});});
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
    for(const renderer of [this.renderer,this.monitorRenderer]){renderer?.dispose();renderer?.domElement?.remove();}
  }
}
