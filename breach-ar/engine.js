import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const CYAN = 0x70ffe5;
const MAX_PARTICLES = 260;
export const WAVE_CONFIG = Object.freeze([
  { number: 1, name: 'Первый контакт', description: 'Ловите цель в центре прицела. Точная наводка заряжает критический выстрел.', roster: ['scout', 'scout', 'scout', 'scout', 'scout', 'scout'], spawnInterval: 2.3, maxActive: 4 },
  { number: 2, name: 'Боковой манёвр', description: 'Фланкеры меняют траекторию. Следите за радаром и перехватывайте их на поворотах.', roster: ['flanker', 'scout', 'flanker', 'scout', 'flanker', 'flanker', 'scout', 'flanker'], spawnInterval: 2.5, maxActive: 5 },
  { number: 3, name: 'Красный импульс', description: 'Штурмовик светится перед рывком. Уничтожьте его или остановите ЭМИ.', roster: ['charger', 'flanker', 'scout', 'charger', 'flanker', 'charger', 'scout', 'charger', 'flanker'], spawnInterval: 2.6, maxActive: 6 },
  { number: 4, name: 'Броневой заслон', description: 'Стреляйте в светящееся ядро броненосца. ЭМИ временно отключает его защиту.', roster: ['tank', 'flanker', 'charger', 'tank', 'flanker', 'charger', 'tank', 'flanker', 'charger'], spawnInterval: 3.1, maxActive: 6 },
  { number: 5, name: 'Сердце разлома', description: 'Сбивайте энергетические заряды. После залпа ядро командира открывается.', roster: ['boss', 'flanker', 'charger', 'flanker', 'tank', 'charger'], spawnInterval: 6.2, maxActive: 5 },
].map(wave => Object.freeze({ ...wave, roster: Object.freeze(wave.roster), count: wave.roster.length })));

export const UPGRADE_CATALOG = Object.freeze([
  { id: 'cooling', title: 'Криоконтур', description: 'Лазер быстрее остывает между очередями и после перегрева.', icon: 'snow', maxLevel: 2, category: 'defence' },
  { id: 'capacitor', title: 'Холодный выстрел', description: 'Каждый выстрел выделяет меньше тепла. Можно дольше держать луч.', icon: 'battery', maxLevel: 2, category: 'defence' },
  { id: 'focus', title: 'Точная оптика', description: 'Быстрее захватывает ядро и усиливает критический выстрел.', icon: 'crosshair', maxLevel: 2, category: 'weapon' },
  { id: 'damage', title: 'Усилитель луча', description: 'Каждое попадание наносит больше урона, включая критическое.', icon: 'bolt', maxLevel: 2, category: 'weapon' },
  { id: 'shield', title: 'Наноремонт', description: 'Сразу восстанавливает 30 защиты и уменьшает дальнейший входящий урон.', icon: 'shield', maxLevel: 2, category: 'defence' },
  { id: 'pulse', title: 'Резонатор ЭМИ', description: 'Импульс быстрее заряжается, сильнее повреждает врагов и дольше оглушает.', icon: 'pulse', maxLevel: 2, category: 'control' },
  { id: 'cadence', title: 'Разгон затвора', description: 'Увеличивает темп стрельбы. Следите за температурой лазера.', icon: 'chevrons', maxLevel: 2, category: 'weapon' },
].map(item => Object.freeze(item)));

function upgradeStat(id, level) {
  return {
    cooling: `+${30 * level}% охлаждение`,
    capacitor: `−${Math.round((1 - 0.82 ** level) * 100)}% нагрев`,
    focus: `Захват ${(0.6 / (1 + 0.3 * level)).toFixed(2)} с · крит ×${3 + 0.5 * level}`,
    damage: `+${25 * level}% урон`,
    shield: `−${Math.round((1 - 0.88 ** level) * 100)}% входящий урон`,
    pulse: `+${35 * level}% заряд · стазис ${(2.8 + level).toFixed(1)} с`,
    cadence: `+${20 * level}% темп`,
  }[id];
}

function seedNumber(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
const MODELS = {
  scout: {
    color: 0x64ffe3, glow: 0x18cfb4, size: 0.078, hp: 2, speed: 0.26, damage: 10, points: 100,
    pattern: [
      '  1     1  ',
      '   1   1   ',
      '  1111111  ',
      ' 112111211 ',
      '11111111111',
      '1 1111111 1',
      '1 1     1 1',
      '   11 11   ',
    ],
  },
  drone: {
    color: 0xf794ef, glow: 0xcd36bf, size: 0.085, hp: 3, speed: 0.29, damage: 14, points: 180,
    pattern: [
      '    111    ',
      '  1111111  ',
      ' 111111111 ',
      '11221112211',
      '11111111111',
      '  1111111  ',
      ' 11 1 1 11 ',
      '11       11',
    ],
  },
  tank: {
    color: 0xffc482, glow: 0xe5752c, size: 0.088, hp: 9, speed: 0.205, damage: 22, points: 350,
    pattern: [
      ' 11       11 ',
      '  111111111  ',
      ' 11111111111 ',
      '1112211122111',
      '1111111111111',
      '11 1111111 11',
      '11  11111  11',
      ' 111 1 1 111 ',
      ' 11       11 ',
    ],
  },
  charger: {
    color: 0xff846f, glow: 0xf04e36, size: 0.083, hp: 4, speed: 0.22, damage: 18, points: 240,
    pattern: ['     1     ', '1   111   1', '11 11111 11', ' 111111111 ', ' 112111211 ', '  1111111  ', '   11111   ', '    111    ', '     1     '],
  },
  boss: {
    color: 0xb8a3ff, glow: 0x7550df, size: 0.103, hp: 120, speed: 0.08, damage: 0, points: 2500,
    pattern: [
      '1               1',
      '11   1111111   11',
      '11111111111111111',
      ' 111111111111111 ',
      '11221111111112211',
      '11111111111111111',
      '  1111111111111  ',
      '11  111121111  11',
      '111   11111   111',
      ' 11  11   11  11 ',
      '     1     1     ',
    ],
  },
};
MODELS.flanker = MODELS.drone;
const DIFFICULTIES = {
  easy: { speed: 0.8, damage: 0.72, assist: 0.045, bossHp: 125 },
  normal: { speed: 1, damage: 1, assist: 0.03, bossHp: 160 },
  hard: { speed: 1.28, damage: 1.15, assist: 0.02, bossHp: 200 },
};

function buildInvader(kind, boxGeometry) {
  const spec = MODELS[kind] || MODELS.scout;
  const rows = spec.pattern;
  const width = Math.max(...rows.map(row => row.length));
  const voxels = [];
  const eyes = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ' ') continue;
      const position = new THREE.Vector3((x - (width - 1) / 2) * spec.size, ((rows.length - 1) / 2 - y) * spec.size, 0);
      (row[x] === '2' ? eyes : voxels).push(position);
    }
  });
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: spec.color, emissive: spec.glow, emissiveIntensity: 0.62,
    metalness: 0.53, roughness: 0.27,
  });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const body = new THREE.InstancedMesh(boxGeometry, bodyMaterial, voxels.length);
  const eyeMesh = new THREE.InstancedMesh(boxGeometry, eyeMaterial, eyes.length);
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3(spec.size * 0.93, spec.size * 0.93, spec.size * 1.25);
  const rotation = new THREE.Quaternion();
  for (let i = 0; i < voxels.length; i++) {
    matrix.compose(voxels[i], rotation, scale);
    body.setMatrixAt(i, matrix);
  }
  for (let i = 0; i < eyes.length; i++) {
    matrix.compose(eyes[i].clone().add(new THREE.Vector3(0, 0, spec.size * 0.15)), rotation, scale.clone().multiplyScalar(0.91));
    eyeMesh.setMatrixAt(i, matrix);
  }
  body.instanceMatrix.needsUpdate = true;
  eyeMesh.instanceMatrix.needsUpdate = true;
  const group = new THREE.Group();
  group.add(body, eyeMesh);
  group.userData.kind = kind;
  group.userData.bodyMaterial = bodyMaterial;
  group.userData.voxels = [...voxels, ...eyes];
  group.userData.materials = [bodyMaterial, eyeMaterial];
  group.userData.pixelSize = spec.size;
  return group;
}

/** A separate model for the landing page. The caller owns its disposal. */
export function createInvaderMesh(kind = 'scout') {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const group = buildInvader(kind, geometry);
  const extraGeometry = [];
  if (kind === 'boss') {
    const coreGeometry = new THREE.SphereGeometry(0.17, 10, 8);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffaea1, toneMapped: false });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.name = 'core'; core.position.set(0, -0.055, 0.14);
    group.add(core);
    group.userData.materials.push(coreMaterial);
    extraGeometry.push(coreGeometry);
  }
  group.userData.dispose = () => {
    geometry.dispose();
    extraGeometry.forEach(item => item.dispose());
    group.userData.materials.forEach(material => material.dispose());
    group.children.forEach(child => child.dispose?.());
  };
  return group;
}

function glowTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const radius = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2));
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(255 * Math.max(0, Math.exp(-radius * radius * 8) - 0.00034));
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function additiveMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
}

export class GameEngine {
  constructor({ renderer, scene, camera, onUpdate = () => {}, onEvent = () => {} }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.onUpdate = onUpdate;
    this.onEvent = onEvent;
    this.group = new THREE.Group();
    this.group.name = 'BREACH gameplay';
    this.scene.add(this.group);
    this.enemyGroup = new THREE.Group();
    this.projectileGroup = new THREE.Group();
    this.shardGroup = new THREE.Group();
    this.portalGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();
    this.group.add(this.portalGroup, this.enemyGroup, this.projectileGroup, this.shardGroup, this.effectGroup);
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.ringGeometry = new THREE.RingGeometry(0.91, 1, 64);
    this.portalTorus = new THREE.TorusGeometry(0.53, 0.015, 6, 64);
    this.portalDisk = new THREE.CircleGeometry(0.49, 48);
    this.projectileGeometry = new THREE.OctahedronGeometry(0.12, 0);
    this.coreGeometry = new THREE.SphereGeometry(0.11, 8, 6);
    this.shardGeometry = new THREE.OctahedronGeometry(0.16, 0);
    this.shardBackplateGeometry = new THREE.CircleGeometry(0.25, 32);
    this.texture = glowTexture();
    this.particleMaterial = additiveMaterial(0xffffff, 0.95);
    this.particleMesh = new THREE.InstancedMesh(this.box, this.particleMaterial, MAX_PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.effectGroup.add(this.particleMesh);
    this.enemies = [];
    this.projectiles = [];
    this.shards = [];
    this.portals = [];
    this.effects = [];
    this.particles = [];
    this.nextId = 1;
    this.disposed = false;
    this.cameraPosition = new THREE.Vector3();
    this.cameraQuaternion = new THREE.Quaternion();
    this.cameraDirection = new THREE.Vector3(0, 0, -1);
    this.tempV = new THREE.Vector3();
    this.tempV2 = new THREE.Vector3();
    this.tempMatrix = new THREE.Matrix4();
    this.tempObject = new THREE.Object3D();
    this.tempColor = new THREE.Color();
    this.mode = 'demo';
    this.difficulty = DIFFICULTIES.normal;
    this._resetRun(1);
    this.phase = 'idle';
  }

  _resetRun(seed) {
    this.seed = seedNumber(seed);
    this._random = seededRandom(this.seed);
    this._fx = seededRandom(this.seed ^ 0x91e10da5);
    this.nextId = 1;
    this.phase = 'playing';
    this.beforePause = 'playing';
    this.time = 0;
    this.totalTime = 0;
    this.cooldown = 0;
    this.heat = 0;
    this.overheated = false;
    this.pulseCharge = 100;
    this.shield = 100;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.shots = 0;
    this.hits = 0;
    this.lastKillTime = -100;
    this.spawnRemaining = 0;
    this.spawnDelay = 0;
    this.intermission = 0;
    this.publishDelay = 0;
    this.target = null;
    this.preciseAim = false;
    this.focus = 0;
    this.focusTarget = null;
    this.focusAnnounced = false;
    this.shotsBlocked = 0;
    this.criticals = 0;
    this.projectilesDestroyed = 0;
    this.perfectWaves = 0;
    this.totalDamageTaken = 0;
    this.upgradeOffers = [];
    this.ownedUpgrades = {};
    this.waveSummary = null;
    this.waveDamage = 0;
    this.waveEscapes = 0;
    this.waveKillsStart = 0;
    this.waveShotsStart = 0;
    this.waveHitsStart = 0;
    this.waveStartTime = 0;
    this.spawnIndex = 0;
    this.waveResolved = false;
    this.terminalEmitted = false;
    this.bossDefeated = false;
    this.introduced = new Set();
    this.lastWarningTime = -100;
    this.portalAim = null;
    this.portalCaptureUsed = false;
    this.portalCaptures = 0;
    this.portalKills = 0;
    this.portalShots = 0;
    this.portalAllyShots = 0;
    this.portalInterceptions = 0;
    this.lastChanceUsed = false;
    this.lastChanceRemaining = 0;
    this.lastChanceCollected = 0;
    this.riftSaves = 0;
    this._applyUpgradeStats();
  }

  _applyUpgradeStats() {
    const level = id => this.ownedUpgrades[id] || 0;
    this.weapon = {
      damage: 1 + 0.25 * level('damage'), cooling: 24 * (1 + 0.3 * level('cooling')),
      heatPerShot: 10.2 * 0.82 ** level('capacitor'), cooldown: 0.15 / (1 + 0.2 * level('cadence')),
      focusSeconds: 0.6 / (1 + 0.3 * level('focus')), criticalMultiplier: 3 + 0.5 * level('focus'),
      damageMultiplier: 0.88 ** level('shield'), pulseDamage: 3.4 + 1.2 * level('pulse'),
      pulseRecharge: 1.8 * (1 + 0.35 * level('pulse')), pulseStun: 2.8 + level('pulse'),
    };
  }

  setCamera(camera) { this.camera = camera; }

  _readCamera() {
    this.camera.updateWorldMatrix(true, false);
    this.camera.getWorldPosition(this.cameraPosition);
    this.camera.getWorldQuaternion(this.cameraQuaternion);
    this.cameraDirection.set(0, 0, -1).applyQuaternion(this.cameraQuaternion).normalize();
  }

  start({ mode = 'demo', difficulty = 'normal', portals = [], seed = Date.now() } = {}) {
    this.stop();
    this._resetRun(seed);
    this.group.visible = true;
    this.mode = mode;
    this.difficultyName = DIFFICULTIES[difficulty] ? difficulty : 'normal';
    this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    this._readCamera();
    if (portals.length) this.setPortals(portals);
    else {
      // Keep the first battle in front of the player. Real room anchors can
      // be placed all around the player by the setup interface.
      const horizontal = this.cameraDirection.clone().setY(0);
      if (horizontal.lengthSq() < 0.01) horizontal.set(0, 0, -1);
      horizontal.normalize();
      const forward = new THREE.Vector3(0, 0, -1);
      const yaw = new THREE.Quaternion().setFromUnitVectors(forward, horizontal);
      const offsets = [
        new THREE.Vector3(0, 0.06, -6.5),
        new THREE.Vector3(-2.65, -0.2, -5.7),
        new THREE.Vector3(2.65, 0.32, -5.7),
      ];
      this.setPortals(offsets.map(offset => offset.applyQuaternion(yaw).add(this.cameraPosition)));
    }
    this._beginWave(1);
    this._publish();
    return this.getState();
  }

  setPortals(positions = []) {
    for (const portal of this.portals) {
      portal.group.removeFromParent();
      portal.materials.forEach(material => material.dispose());
      portal.detailGeometry.dispose();
    }
    this.portals = [];
    this._readCamera();
    for (let i = 0; i < Math.min(positions.length, 6); i++) {
      const input = positions[i];
      const position = input?.isVector3 ? input.clone() : new THREE.Vector3(input.x || 0, input.y || 0, input.z || 0);
      const group = new THREE.Group();
      group.position.copy(position);
      group.lookAt(this.cameraPosition);
      const ringMaterial = additiveMaterial(CYAN, 0.62);
      const detailMaterial = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
      const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x050e17, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
      const glowMaterial = new THREE.SpriteMaterial({ map: this.texture, color: CYAN, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const disk = new THREE.Mesh(this.portalDisk, diskMaterial);
      disk.position.z = -0.014;
      const ring = new THREE.Mesh(this.portalTorus, ringMaterial);
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.setScalar(1.55);
      const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x7af7d7, toneMapped: false });
      const core = new THREE.Mesh(this.coreGeometry, coreMaterial);
      core.name = 'portal-core'; core.position.z = 0.035; core.scale.setScalar(0.67);
      const vertices = [];
      for (let segment = 0; segment < 16; segment++) {
        const a = segment / 16 * TAU;
        for (let j = 0; j < 4; j++) {
          const a1 = a + j * 0.045;
          const a2 = a1 + 0.044;
          vertices.push(Math.cos(a1) * 0.63, Math.sin(a1) * 0.63, 0, Math.cos(a2) * 0.63, Math.sin(a2) * 0.63, 0);
        }
      }
      const detailGeometry = new THREE.BufferGeometry();
      detailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const detail = new THREE.LineSegments(detailGeometry, detailMaterial);
      group.add(disk, glow, ring, detail, core);
      this.portalGroup.add(group);
      this.portals.push({ id: `portal-${i + 1}`, group, position, ring, detail, glow, core, coreMaterial, glowMaterial, ringMaterial, detailMaterial, detailGeometry, materials: [ringMaterial, detailMaterial, diskMaterial, glowMaterial, coreMaterial], flash: 0, seed: i * 1.7, captureProgress: 0, lostAimFor: 0, alliedRemaining: 0, fireTimer: 0 });
    }
  }

  _beginWave(wave) {
    this.wave = wave;
    this.phase = 'playing';
    this.config = WAVE_CONFIG[wave - 1];
    this.spawnRemaining = this.config.roster.length;
    this.spawnIndex = 0;
    this.spawnDelay = wave === 1 ? 0.7 : 0.9;
    this.waveStartTime = this.totalTime;
    this.waveKillsStart = this.kills;
    this.waveShotsStart = this.shots;
    this.waveHitsStart = this.hits;
    this.waveDamage = 0;
    this.waveEscapes = 0;
    this.waveResolved = false;
    this.waveSummary = null;
    this.focus = 0;
    this.focusTarget = null;
    this.upgradeOffers = [];
    this.portalCaptureUsed = false;
    this.portalAim = null;
    for (const portal of this.portals) {
      if (portal.alliedRemaining > 0) this._expirePortal(portal, 'newwave');
      portal.captureProgress = 0;
      portal.lostAimFor = 0;
    }
    this.onEvent({ type: 'wave', wave, total: 5, enemies: this.spawnRemaining, name: this.config.name, description: this.config.description });
  }

  _addArmor(mesh, kind) {
    if (kind !== 'tank' && kind !== 'boss') return;
    const coreMaterial = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });
    const core = new THREE.Mesh(this.coreGeometry, coreMaterial);
    core.name = 'core';
    core.position.set(0, kind === 'boss' ? -0.055 : 0, 0.12);
    core.scale.setScalar(kind === 'boss' ? 1.8 : 1);
    const ringMaterial = additiveMaterial(kind === 'boss' ? 0xb299ff : 0xffbb78, 0.48);
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
    ring.position.z = 0.055;
    ring.scale.setScalar(kind === 'boss' ? 0.96 : 0.64);
    mesh.add(ring, core);
    mesh.userData.core = core;
    mesh.userData.shieldRing = ring;
    mesh.userData.materials.push(coreMaterial, ringMaterial);
  }

  _spawnEnemy() {
    if (!this.portals.length || this.spawnRemaining <= 0) return;
    const kind = this.config.roster[this.spawnIndex];
    let portal;
    if (this.spawnIndex === 0 || !this.introduced.has(kind)) {
      portal = this.portals.reduce((best, item) => {
        const dot = item.position.clone().sub(this.cameraPosition).normalize().dot(this.cameraDirection);
        return !best || dot > best.dot ? { item, dot } : best;
      }, null).item;
    } else portal = this.portals[(this.spawnIndex + this.wave - 1) % this.portals.length];
    if (portal.alliedRemaining > 0) {
      const alternatives = this.portals.filter(item => item.alliedRemaining <= 0);
      if (alternatives.length) portal = alternatives[this.spawnIndex % alternatives.length];
    }
    const spec = MODELS[kind];
    const mesh = buildInvader(kind, this.box);
    this._addArmor(mesh, kind);
    const position = portal.position.clone();
    const fromCamera = position.clone().sub(this.cameraPosition);
    const minimumDistance = kind === 'boss' ? 5.5 : 2.8;
    if (fromCamera.length() < minimumDistance) {
      if (fromCamera.lengthSq() < 0.01) fromCamera.copy(this.cameraDirection);
      position.copy(this.cameraPosition).add(fromCamera.normalize().multiplyScalar(minimumDistance));
    }
    mesh.position.copy(position);
    mesh.scale.setScalar(0.01);
    this.enemyGroup.add(mesh);
    const maxHp = kind === 'boss' ? this.difficulty.bossHp : spec.hp;
    const offscreen = position.clone().sub(this.cameraPosition).normalize().dot(this.cameraDirection) < 0.4;
    const enemy = {
      id: this.nextId++, mesh, kind, hp: maxHp, maxHp,
      position: position.clone(), spawnPosition: position.clone(),
      age: 0, seed: this._random() * TAU, hitFlash: 0, distance: position.distanceTo(this.cameraPosition),
      radius: kind === 'boss' ? 1.27 : kind === 'tank' ? 0.55 : 0.41,
      modelScale: kind === 'boss' ? 1.55 : 1,
      speed: (spec.speed + (this.wave - 1) * 0.014) * this.difficulty.speed,
      sidestep: (this.spawnIndex % 2 ? 1 : -1) * (kind === 'flanker' ? 0.65 : 0.12),
      stun: 0, exposed: 0, actionPhase: 'approach', actionTimer: kind === 'boss' ? 1.8 : 2.3 + this._random() * 0.7,
      attackCharge: 0, bossPhase: 1, windupDuration: 0, minResponse: offscreen ? 7.5 : 6,
      warnedClose: false, offscreen,
    };
    this.enemies.push(enemy);
    if (portal.alliedRemaining > 0) { enemy.stun = 1.2; enemy.exposed = 1.2; }
    this.spawnRemaining--;
    this.spawnIndex++;
    portal.flash = 1;
    this._shockwave(position, spec.color, kind === 'boss' ? 1.5 : 0.65, 0.7, 0.3);
    this.onEvent({ type: 'spawn', id: enemy.id, kind, position: position.clone() });
    if (!this.introduced.has(kind)) {
      this.introduced.add(kind);
      const intro = {
        scout: ['Разведчик', 'Точно наведитесь на цель: фокус заряжает критический выстрел.'],
        flanker: ['Фланкер', 'Движется по дуге. Перехватывайте на повороте, следите за радаром.'],
        charger: ['Штурмовик', 'Красная вспышка предупреждает о рывке. Критический выстрел или ЭМИ прерывают атаку.'],
        tank: ['Броненосец', 'Светящееся ядро — слабое место. ЭМИ временно отключает броню.'],
        boss: ['Командир разлома', 'Сбивайте его заряды. После залпа ядро открывается для полного урона.'],
      }[kind];
      this.onEvent({ type: 'enemyintro', kind, name: intro[0], tip: intro[1] });
      if (kind === 'boss') this.onEvent({ type: 'bossphase', phase: 1, label: 'Сканирование', message: 'Командир разлома · фаза 1', kind: 'boss' });
    }
    if (offscreen) this._warn(enemy, 'Контакт вне поля зрения — проверьте радар', 0.4);
  }

  _warn(enemy, message, urgency = 0.7, force = false) {
    if (this.phase !== 'playing') return;
    if (!force && this.totalTime - this.lastWarningTime < 1.6) return;
    this.lastWarningTime = this.totalTime;
    const offset = enemy.mesh.position.clone().sub(this.cameraPosition).applyQuaternion(this.cameraQuaternion.clone().invert());
    this.onEvent({ type: 'warning', id: enemy.id, kind: enemy.kind, message, urgency, angle: Math.atan2(offset.x, -offset.z) });
  }

  _findPortalTarget(hostileTarget = this.target) {
    if (this.phase !== 'playing' || hostileTarget) return null;
    let closest = null, bestDistance = Infinity;
    for (const portal of this.portals) {
      const offset = portal.position.clone().sub(this.cameraPosition);
      const distance = offset.length();
      const forward = offset.dot(this.cameraDirection);
      if (forward <= 0.2 || distance >= bestDistance) continue;
      const perpendicular = Math.sqrt(Math.max(0, offset.lengthSq() - forward * forward));
      if (perpendicular <= Math.min(0.42, 0.22 + distance * 0.016)) { closest = portal; bestDistance = distance; }
    }
    return closest;
  }

  _hitPortal(portal) {
    this.portalShots++;
    this.focus = 0;
    this.focusTarget = null;
    this.focusAnnounced = false;
    const position = portal.core.getWorldPosition(new THREE.Vector3());
    this._laser(position, true);
    this.onEvent({ type: 'shot', hit: true, portal: true, targetKind: 'portal', position: position.clone() });
    if (!this.portalCaptureUsed && portal.alliedRemaining <= 0) {
      portal.captureProgress = Math.min(6, portal.captureProgress + 1);
      portal.lostAimFor = 0;
      portal.flash = 0.8;
      this._sparks(position, 0xc0ff86, 5, 0.45, true);
      this.onEvent({ type: 'portalprogress', id: portal.id, progress: portal.captureProgress / 6 });
      if (portal.captureProgress >= 6) this._capturePortal(portal);
    }
  }

  _capturePortal(portal) {
    if (this.phase !== 'playing' || this.portalCaptureUsed) return;
    this.portalCaptureUsed = true;
    this.portalCaptures++;
    for (const item of this.portals) if (item !== portal) item.captureProgress = 0;
    portal.captureProgress = 6;
    portal.alliedRemaining = 10;
    portal.fireTimer = 0.35;
    portal.flash = 1.5;
    this._shockwave(portal.position, 0xc3ff79, 1.2, 0.65, 0.8, true);
    this.onEvent({ type: 'portalcaptured', id: portal.id, duration: 10 });
  }

  _expirePortal(portal, reason = 'timeout') {
    portal.alliedRemaining = 0;
    portal.captureProgress = 0;
    portal.fireTimer = 0;
    portal.flash = 0.6;
    this.onEvent({ type: 'portalexpired', id: portal.id, reason });
  }

  _updatePortalCombat(dt) {
    if (this.phase !== 'playing') return;
    this.portalAim = this._findPortalTarget(this.target);
    for (const portal of this.portals) {
      if (portal !== this.portalAim) portal.lostAimFor += dt;
      else portal.lostAimFor = 0;
      if (portal.alliedRemaining <= 0) {
        if (portal.lostAimFor > 1) portal.captureProgress = Math.max(0, portal.captureProgress - dt * 2.4);
        continue;
      }
      portal.alliedRemaining = Math.max(0, portal.alliedRemaining - dt);
      if (portal.alliedRemaining <= 0) { this._expirePortal(portal); continue; }
      portal.fireTimer = Math.max(0, portal.fireTimer - dt);
      if (portal.fireTimer > 0) continue;
      let target = null, bestPriority = Infinity;
      for (const enemy of [...this.enemies, ...this.projectiles]) {
        if (enemy.age < 0.4 || enemy.hp <= 0) continue;
        const distance = enemy.mesh.position.distanceTo(portal.position);
        if (distance > 12) continue;
        const priority = enemy.distance + distance * 0.12 - (enemy.kind === 'projectile' ? 100 : 0);
        if (priority < bestPriority) { target = enemy; bestPriority = priority; }
      }
      if (!target) continue;
      portal.fireTimer = 0.75;
      portal.flash = 1;
      const start = portal.core.getWorldPosition(new THREE.Vector3());
      const end = target.mesh.userData.core ? target.mesh.userData.core.getWorldPosition(new THREE.Vector3()) : target.mesh.position.clone();
      const damage = target.kind === 'boss' ? 0.45 : 0.9;
      this._worldBeam(start, end, 0xc3ff79);
      this.portalAllyShots++;
      this.onEvent({ type: 'portalshot', id: portal.id, targetId: target.id, kind: target.kind, damage });
      target.hp = Math.max(0, target.hp - damage);
      target.hitFlash = 0.7;
      this._sparks(end, 0xc3ff79, 4, 0.6);
      if (target.kind === 'projectile') {
        if (target.hp <= 0) { this.portalInterceptions++; this._destroyProjectile(this.projectiles.indexOf(target), 'portal'); }
      } else if (target.hp <= 0) this._killEnemy(target, 'portal');
      else this._updateBossPhase(target);
      if (this.phase !== 'playing') break;
    }
  }

  update(dt, time) {
    if (this.disposed || this.phase === 'idle' || this.phase === 'paused') return;
    dt = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), 0.07);
    const worldDt = this.phase === 'lastchance' ? dt * 0.12 : dt;
    this.time += worldDt;
    this._readCamera();
    this._updateEffects(dt, worldDt);
    this._updatePortals(worldDt);
    if (['upgrade', 'victory', 'gameover'].includes(this.phase)) return;
    this.totalTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.heat = Math.max(0, this.heat - dt * this.weapon.cooling * (this.overheated ? 1.4 : 1));
    if (this.overheated && this.heat <= 30) {
      this.overheated = false;
      this.onEvent({ type: 'cooled' });
    }
    this.pulseCharge = Math.min(100, this.pulseCharge + dt * this.weapon.pulseRecharge);
    if (this.combo && this.totalTime - this.lastKillTime > 4) this.combo = 0;
    if (this.phase === 'intermission') {
      this.intermission = Math.max(0, this.intermission - dt);
      if (this.intermission <= 0) this._beginWave(this.wave + 1);
    } else if (this.phase === 'lastchance') {
      this.lastChanceRemaining = Math.max(0, this.lastChanceRemaining - dt);
      if (this.lastChanceRemaining <= 0) this._failLastChance();
      else {
        this._updateEnemies(worldDt);
        this._updateProjectiles(worldDt);
        this._updateShards(dt);
        this.target = this._findTarget();
        this.portalAim = null;
      }
    } else if (this.phase === 'playing') {
      this.spawnDelay -= dt;
      if (this.spawnRemaining > 0 && this.spawnDelay <= 0 && this.enemies.length < this.config.maxActive) {
        this._spawnEnemy();
        this.spawnDelay = this.config.spawnInterval;
      }
      this._updateEnemies(dt);
      if (this.phase === 'playing') this._updateProjectiles(dt);
      this.target = this.phase === 'playing' || this.phase === 'lastchance' ? this._findTarget() : null;
      this._updateFocus(dt);
      if (this.phase === 'playing') this._updatePortalCombat(dt);
      if (!this.enemies.length && !this.projectiles.length && !this.spawnRemaining && this.phase === 'playing') this._completeWave();
    }
    this.publishDelay -= dt;
    if (this.publishDelay <= 0) {
      this._publish();
      this.publishDelay = 0.075;
    }
  }

  _updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.age += dt;
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.exposed = Math.max(0, enemy.exposed - dt);
      const emergence = Math.min(1, enemy.age / (enemy.kind === 'boss' ? 1.2 : 0.6));
      enemy.mesh.scale.setScalar((1 - Math.pow(1 - emergence, 3)) * enemy.modelScale);
      const direction = this.cameraPosition.clone().sub(enemy.position);
      const distance = direction.length();
      direction.normalize();
      const facingDot = direction.clone().negate().dot(this.cameraDirection);
      enemy.offscreen = facingDot < 0.25;
      if (enemy.kind === 'boss') this._stepBoss(enemy, dt, direction, distance);
      else if (enemy.stun <= 0) {
        let speed = enemy.speed;
        if (enemy.kind === 'charger') {
          enemy.actionTimer -= dt;
          if (enemy.actionPhase === 'windup') {
            speed = 0;
            enemy.attackCharge = 1 - Math.max(0, enemy.actionTimer) / enemy.windupDuration;
            if (enemy.actionTimer <= 0) { enemy.actionPhase = 'dash'; enemy.actionTimer = 0.82; enemy.attackCharge = 1; }
          } else if (enemy.actionPhase === 'dash') {
            speed = 1.65 * this.difficulty.speed;
            if (enemy.actionTimer <= 0) { enemy.actionPhase = 'recover'; enemy.actionTimer = 2.6; enemy.attackCharge = 0; }
          } else if (enemy.actionTimer <= 0 && enemy.age > 2.5) {
            enemy.actionPhase = 'windup'; enemy.windupDuration = 1.5; enemy.actionTimer = 1.5; enemy.attackCharge = 0;
            this._shockwave(enemy.mesh.position, 0xff725f, 0.75, 0.65, 0.6);
            this._warn(enemy, 'Штурмовик готовит рывок — огонь или ЭМИ', 0.9, true);
          }
        }
        // Offscreen enemies remain threats, with extra time to turn towards
        // their warning. No attack requires the player to physically dodge.
        if (enemy.offscreen) speed *= 0.7;
        if (enemy.age > 0.65) enemy.position.addScaledVector(direction, speed * dt);
        if (enemy.age < enemy.minResponse && enemy.position.distanceTo(this.cameraPosition) < 1.25) enemy.position.copy(this.cameraPosition).addScaledVector(direction, -1.25);
      }
      const side = new THREE.Vector3().crossVectors(direction, UP).normalize();
      const isFlanker = enemy.kind === 'flanker' || enemy.kind === 'drone';
      const wobble = Math.sin(enemy.age * (isFlanker ? 1.65 : 1.85) + enemy.seed) * (isFlanker ? 0.48 : enemy.kind === 'boss' ? 0.16 : 0.075);
      const cornerStep = Math.sin(Math.min(1, enemy.age / 3) * Math.PI) * enemy.sidestep;
      enemy.mesh.position.copy(enemy.position).addScaledVector(side, wobble + cornerStep);
      enemy.mesh.position.y += Math.sin(enemy.age * 1.9 + enemy.seed) * (isFlanker ? 0.16 : 0.07);
      enemy.mesh.lookAt(this.cameraPosition);
      enemy.mesh.rotateZ(Math.sin(enemy.age * 1.35 + enemy.seed) * (isFlanker ? 0.18 : 0.05));
      enemy.distance = enemy.mesh.position.distanceTo(this.cameraPosition);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 5.5);
      enemy.mesh.userData.bodyMaterial.emissiveIntensity = 0.58 + enemy.hitFlash * 2.2 + (enemy.actionPhase === 'windup' ? 0.45 + Math.sin(enemy.age * 25) * 0.4 : 0);
      const core = enemy.mesh.userData.core;
      const ring = enemy.mesh.userData.shieldRing;
      if (core) {
        core.material.color.setHex(enemy.exposed > 0 || enemy.stun > 0 ? CYAN : enemy.kind === 'boss' ? 0xe9daff : 0xfff0c8);
        core.scale.setScalar((enemy.kind === 'boss' ? 1.8 : 1) * (1 + Math.sin(enemy.age * 5) * 0.12 + enemy.attackCharge * 0.3));
      }
      if (ring) {
        ring.rotation.z += dt * (0.3 + enemy.attackCharge * 2);
        ring.material.opacity = enemy.exposed > 0 || enemy.stun > 0 ? 0.07 : 0.35 + enemy.attackCharge * 0.4;
      }
      if (enemy.kind !== 'boss' && enemy.distance < 2.3 && enemy.offscreen && !enemy.warnedClose) {
        enemy.warnedClose = true;
        this._warn(enemy, 'Угроза рядом — разверните прицел к отметке радара', 1, true);
      }
      if (this.phase === 'playing' && enemy.kind !== 'boss' && enemy.position.distanceTo(this.cameraPosition) < 0.62 && enemy.age >= enemy.minResponse && enemy.stun <= 0) {
        this.waveEscapes++;
        this._explode(enemy, 0xff5c79, 20);
        this._removeEnemy(i);
        this._damagePlayer(MODELS[enemy.kind].damage, enemy.kind);
        if (this.phase !== 'playing') break;
      }
    }
  }

  _stepBoss(enemy, dt, direction, distance) {
    if (distance < 4.7) enemy.position.addScaledVector(direction, -dt * 0.65);
    if (distance > 8.4) enemy.position.addScaledVector(direction, dt * 0.45);
    if (enemy.stun > 0 || enemy.age < 1.4) return;
    enemy.actionTimer -= dt;
    if (this.phase === 'lastchance' && enemy.actionTimer <= 0) {
      enemy.actionTimer = 0;
      enemy.attackCharge = enemy.actionPhase === 'windup' ? 1 : 0;
      return;
    }
    if (enemy.actionPhase === 'windup') {
      enemy.attackCharge = Math.min(1, 1 - Math.max(0, enemy.actionTimer) / enemy.windupDuration);
      if (enemy.actionTimer <= 0) {
        for (let i = 0; i < enemy.bossPhase; i++) this._spawnProjectile(enemy, (i - (enemy.bossPhase - 1) / 2) * 0.36);
        enemy.exposed = 5.2 - enemy.bossPhase * 0.3;
        enemy.actionPhase = 'recover';
        enemy.actionTimer = 7.1 - enemy.bossPhase * 0.5;
        enemy.attackCharge = 0;
        this.onEvent({ type: 'warning', kind: 'boss', id: enemy.id, message: 'Ядро открыто. Сбейте заряды и атакуйте командира', urgency: 0.55 });
      }
    } else if (enemy.actionTimer <= 0) {
      enemy.actionPhase = 'windup';
      enemy.windupDuration = 2.65 - enemy.bossPhase * 0.3;
      enemy.actionTimer = enemy.windupDuration;
      enemy.attackCharge = 0;
      this._warn(enemy, 'Командир заряжает залп. Его заряды можно сбить лучом', 0.85, true);
    }
  }

  _updateBossPhase(enemy) {
    if (enemy.kind !== 'boss' || enemy.hp <= 0) return;
    const phase = enemy.hp / enemy.maxHp <= 0.34 ? 3 : enemy.hp / enemy.maxHp <= 0.67 ? 2 : 1;
    if (phase === enemy.bossPhase) return;
    enemy.bossPhase = phase;
    enemy.actionPhase = 'recover';
    enemy.actionTimer = 1.2;
    enemy.attackCharge = 0;
    enemy.exposed = Math.max(enemy.exposed, 2.5);
    enemy.mesh.userData.bodyMaterial.emissive.setHex(phase === 3 ? 0xdc4a5d : 0x9c4fd4);
    this._shockwave(enemy.mesh.position, phase === 3 ? 0xff776e : 0xc394ff, 2.2, 0.8, 0.85);
    const label = phase === 2 ? 'Перегрузка' : 'Последний рубеж';
    this.onEvent({ type: 'bossphase', kind: 'boss', phase, label, message: `Командир разлома · фаза ${phase}: ${label}` });
  }

  _spawnProjectile(source, lateral = 0) {
    if (this.projectiles.length >= 7 || this.phase !== 'playing') return;
    const mesh = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xffb079, toneMapped: false });
    const ringMaterial = additiveMaterial(0xff8d69, 0.7);
    const body = new THREE.Mesh(this.projectileGeometry, material);
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial); ring.scale.setScalar(0.23);
    mesh.add(body, ring);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cameraQuaternion);
    const position = source.mesh.position.clone().addScaledVector(right, lateral);
    position.add(this.cameraPosition.clone().sub(position).normalize().multiplyScalar(0.42));
    mesh.position.copy(position);
    mesh.userData.materials = [material, ringMaterial];
    this.projectileGroup.add(mesh);
    const projectile = { id: this.nextId++, mesh, kind: 'projectile', hp: 1, maxHp: 1, position, age: 0, distance: position.distanceTo(this.cameraPosition), radius: 0.22, speed: (0.72 + source.bossPhase * 0.06) * this.difficulty.speed, damage: 9 + source.bossPhase, actionPhase: 'incoming' };
    this.projectiles.push(projectile);
    this.onEvent({ type: 'projectile', id: projectile.id, kind: 'projectile' });
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.age += dt;
      const direction = this.cameraPosition.clone().sub(projectile.position).normalize();
      projectile.position.addScaledVector(direction, projectile.speed * dt);
      projectile.mesh.position.copy(projectile.position);
      projectile.mesh.lookAt(this.cameraPosition);
      projectile.mesh.children[0].rotation.y += dt * 3;
      projectile.mesh.children[1].rotation.z += dt * 2;
      projectile.distance = projectile.position.distanceTo(this.cameraPosition);
      if (this.phase === 'playing' && projectile.distance < 0.45 && projectile.age > 1.8) {
        this._destroyProjectile(i, 'impact');
        this._damagePlayer(projectile.damage, 'projectile');
        if (this.phase !== 'playing') break;
      } else if (projectile.age > 22) this._destroyProjectile(i, 'expired');
    }
  }

  _destroyProjectile(index, cause) {
    if (index < 0) return;
    const [projectile] = this.projectiles.splice(index, 1);
    if (!projectile) return;
    this._sparks(projectile.mesh.position, 0xffb47c, cause === 'laser' ? 14 : 6, 1.2);
    projectile.mesh.removeFromParent();
    projectile.mesh.userData.materials.forEach(material => material.dispose());
    if (this.target === projectile) this.target = null;
    if (cause === 'laser') {
      this.projectilesDestroyed++;
      this.score += 30;
      this.pulseCharge = Math.min(100, this.pulseCharge + 3);
    }
    this.onEvent({ type: 'projectileclear', id: projectile.id, cause, points: cause === 'laser' ? 30 : 0 });
  }

  _damagePlayer(rawDamage, kind) {
    if (this.phase !== 'playing') return;
    const damage = Math.min(this.shield, Math.max(1, Math.round(rawDamage * this.difficulty.damage * this.weapon.damageMultiplier)));
    this.shield = Math.max(0, this.shield - damage);
    this.waveDamage += damage;
    this.totalDamageTaken += damage;
    this.combo = 0;
    this.focus = 0;
    this.onEvent({ type: 'damage', damage, kind, shield: this.shield });
    if (this.shield <= 0) {
      if (!this.lastChanceUsed) this._activateLastChance();
      else this._finish(false);
    }
  }

  _activateLastChance() {
    if (this.lastChanceUsed || this.terminalEmitted || this.phase !== 'playing') return;
    this._readCamera();
    this.lastChanceUsed = true;
    this.lastChanceRemaining = 5;
    this.lastChanceCollected = 0;
    this.phase = 'lastchance';
    this.shield = 0;
    this.heat = 0;
    this.overheated = false;
    this.cooldown = 0;
    this.focus = 0;
    this.focusTarget = null;
    this.focusAnnounced = false;
    this.target = null;
    this.portalAim = null;
    this.combo = 0;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cameraQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cameraQuaternion);
    const origin = this.cameraPosition.clone().addScaledVector(this.cameraDirection, 2.3);
    for (let i = 0; i < 3; i++) {
      const position = origin.clone().addScaledVector(right, (i - 1) * 0.38).addScaledVector(up, i === 1 ? 0.2 : -0.12);
      const mesh = new THREE.Group();
      mesh.renderOrder = 100;
      const color = i === 1 ? 0xf1fbff : 0xdcc4ff;
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
      const backplateMaterial = new THREE.MeshBasicMaterial({ color: 0x100922, transparent: true, opacity: 0.94, depthTest: false, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
      const ringMaterial = additiveMaterial(0xc3a4ff, 0.95);
      ringMaterial.depthTest = false;
      ringMaterial.fog = false;
      const glowMaterial = new THREE.SpriteMaterial({ map: this.texture, color: 0xbb98ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
      const backplate = new THREE.Mesh(this.shardBackplateGeometry, backplateMaterial);
      backplate.name = 'rift-backplate'; backplate.renderOrder = 100; backplate.position.z = -0.03;
      const body = new THREE.Mesh(this.shardGeometry, material);
      body.name = 'rift-body'; body.renderOrder = 101;
      const ring = new THREE.Mesh(this.ringGeometry, ringMaterial); ring.scale.setScalar(0.225);
      ring.name = 'rift-ring'; ring.renderOrder = 102;
      const glow = new THREE.Sprite(glowMaterial); glow.scale.setScalar(0.6);
      glow.name = 'rift-glow'; glow.renderOrder = 103;
      mesh.add(backplate, body, ring, glow);
      mesh.position.copy(position);
      mesh.lookAt(this.cameraPosition);
      mesh.userData.materials = [backplateMaterial, material, ringMaterial, glowMaterial];
      mesh.userData.shardBody = body;
      mesh.userData.shardRing = ring;
      this.shardGroup.add(mesh);
      this.shards.push({ id: this.nextId++, mesh, kind: 'shard', hp: 1, maxHp: 1, position, radius: 0.22, age: 0, distance: position.distanceTo(this.cameraPosition), actionPhase: 'rift', index: i });
    }
    this._shockwave(origin, 0xad9aff, 1.8, 0.65, 0.6, true);
    this.onEvent({ type: 'lastchance', duration: 5, total: 3 });
    this._publish();
  }

  _updateShards(dt) {
    for (const shard of this.shards) {
      shard.age += dt;
      shard.distance = shard.mesh.position.distanceTo(this.cameraPosition);
      shard.mesh.lookAt(this.cameraPosition);
      shard.mesh.userData.shardBody.rotation.y += dt * 1.4;
      shard.mesh.userData.shardBody.rotation.z += dt * 0.5;
      shard.mesh.userData.shardRing.rotation.z -= dt * 0.7;
      shard.mesh.scale.setScalar(1 + Math.sin(shard.age * 4 + shard.index) * 0.045);
    }
  }

  _collectShard(shard) {
    if (this.phase !== 'lastchance') return;
    const index = this.shards.indexOf(shard);
    if (index < 0) return;
    this._sparks(shard.mesh.position, shard.index === 1 ? 0xf1fbff : 0xdcc4ff, 16, 0.9, true);
    this._shockwave(shard.mesh.position, 0xb5fff5, 0.55, 0.35, 0.8, true);
    shard.mesh.removeFromParent();
    shard.mesh.userData.materials.forEach(material => material.dispose());
    this.shards.splice(index, 1);
    if (this.target === shard) this.target = null;
    this.lastChanceCollected++;
    this.onEvent({ type: 'shardcollected', collected: this.lastChanceCollected, total: 3 });
    if (this.lastChanceCollected >= 3) this._saveLastChance();
  }

  _clearShards() {
    for (const shard of this.shards) {
      shard.mesh.removeFromParent();
      shard.mesh.userData.materials.forEach(material => material.dispose());
    }
    this.shards.length = 0;
  }

  _saveLastChance() {
    if (this.phase !== 'lastchance' || this.lastChanceCollected < 3) return;
    this.phase = 'playing';
    this.lastChanceRemaining = 0;
    this.shield = 35;
    this.heat = 0;
    this.overheated = false;
    this.cooldown = 0;
    this.target = null;
    this.focus = 0;
    this.focusTarget = null;
    this.riftSaves++;
    this._clearShards();
    while (this.projectiles.length) this._destroyProjectile(this.projectiles.length - 1, 'rift');
    for (const enemy of this.enemies) {
      enemy.stun = Math.max(enemy.stun, 2);
      enemy.exposed = Math.max(enemy.exposed, 2);
      enemy.actionPhase = 'recover';
      enemy.actionTimer = Math.max(enemy.actionTimer, 2.5);
      enemy.attackCharge = 0;
    }
    this._shockwave(this.cameraPosition.clone().addScaledVector(this.cameraDirection, 2), 0xa5fff1, 3.5, 0.7, 0.8, true);
    this.onEvent({ type: 'lastchancesaved', shield: 35 });
    this._publish();
  }

  _failLastChance() {
    if (this.phase !== 'lastchance') return;
    this.lastChanceRemaining = 0;
    this._clearShards();
    this.onEvent({ type: 'lastchancefailed' });
    this._finish(false);
  }

  _findTarget() {
    let target = null, bestDistance = Infinity, precise = false;
    const candidates = this.phase === 'lastchance' ? this.shards : [...this.enemies, ...this.projectiles];
    for (const enemy of candidates) {
      if (enemy.age < (enemy.kind === 'shard' ? 0 : enemy.kind === 'projectile' ? 0.05 : 0.18)) continue;
      const offset = enemy.mesh.position.clone().sub(this.cameraPosition);
      const distance = offset.length();
      const forwardDistance = offset.dot(this.cameraDirection);
      if (forwardDistance <= 0) continue;
      const radius = enemy.radius * (enemy.kind === 'shard' ? 1 : Math.min(1, enemy.age / 0.6));
      const perpendicular = Math.sqrt(Math.max(0, distance * distance - forwardDistance * forwardDistance));
      if (perpendicular > radius + distance * this.difficulty.assist || distance >= bestDistance) continue;
      target = enemy;
      bestDistance = distance;
      const core = enemy.mesh.userData.core;
      const weakpoint = core ? core.getWorldPosition(new THREE.Vector3()) : enemy.mesh.position.clone();
      const coreOffset = weakpoint.sub(this.cameraPosition);
      const along = coreOffset.dot(this.cameraDirection);
      const corePerpendicular = Math.sqrt(Math.max(0, coreOffset.lengthSq() - along * along));
      const preciseRadius = (enemy.kind === 'boss' ? 0.31 : enemy.kind === 'tank' ? 0.13 : enemy.kind === 'projectile' ? 0.22 : radius * 0.5) * (this.difficultyName === 'easy' ? 1.2 : 1);
      precise = corePerpendicular <= preciseRadius;
    }
    this.preciseAim = precise;
    return target;
  }

  _updateFocus(dt) {
    const target = this.target;
    if (!target || target.kind === 'projectile' || this.phase !== 'playing') {
      this.focus = Math.max(0, this.focus - dt * 3);
      if (!this.focus) { this.focusTarget = null; this.focusAnnounced = false; }
      return;
    }
    if (this.focusTarget !== target.id) { this.focusTarget = target.id; this.focus = 0; this.focusAnnounced = false; }
    if (this.preciseAim && !this.overheated && this.heat < 85) this.focus = Math.min(1, this.focus + dt / this.weapon.focusSeconds * (this.heat < 50 ? 1 : 0.55));
    else this.focus = Math.max(0, this.focus - dt * 1.5);
    if (this.focus >= 0.999 && !this.focusAnnounced) {
      this.focusAnnounced = true;
      this.onEvent({ type: 'focus', id: target.id, kind: target.kind, ready: true });
    } else if (this.focus < 0.9) this.focusAnnounced = false;
  }

  _shielded(enemy) { return (enemy.kind === 'tank' || enemy.kind === 'boss') && enemy.exposed <= 0 && enemy.stun <= 0; }

  fire() {
    if ((this.phase !== 'playing' && this.phase !== 'lastchance') || this.cooldown > 0 || this.overheated) return false;
    this._readCamera();
    this.cooldown = this.weapon.cooldown;
    this.heat = Math.min(100, this.heat + this.weapon.heatPerShot);
    const target = this._findTarget();
    this.portalAim = this._findPortalTarget(target);
    if (this.portalAim) {
      this._hitPortal(this.portalAim);
      if (this.heat >= 99.5) { this.overheated = true; this.onEvent({ type: 'overheat' }); }
      this.target = null;
      this._publish();
      return true;
    }
    this.shots++;
    const weakpoint = Boolean(target && this.preciseAim);
    const critical = Boolean(this.phase === 'playing' && target && target.kind !== 'projectile' && target.kind !== 'shard' && weakpoint && this.focusTarget === target.id && this.focus >= 0.999);
    const end = target ? (weakpoint && target.mesh.userData.core ? target.mesh.userData.core.getWorldPosition(new THREE.Vector3()) : target.mesh.position.clone()) : this.cameraDirection.clone().multiplyScalar(16).add(this.cameraPosition);
    this._laser(end, Boolean(target), critical);
    this.onEvent({ type: 'shot', hit: Boolean(target), critical, position: end.clone() });
    if (target) {
      this.hits++;
      let damage = this.weapon.damage * (critical ? this.weapon.criticalMultiplier : 1);
      const blocked = this._shielded(target) && !weakpoint;
      if (blocked) { damage *= 0.14; this.shotsBlocked++; }
      else if (this._shielded(target) && !critical) damage *= target.kind === 'boss' ? 0.55 : 0.95;
      if (target.kind === 'projectile' || target.kind === 'shard') damage = 1;
      target.hp = Math.max(0, target.hp - damage);
      target.hitFlash = 1;
      if (critical) {
        this.criticals++;
        this.focus = 0;
        this.focusAnnounced = false;
        if (target.kind === 'charger') { target.actionPhase = 'recover'; target.actionTimer = 2.2; target.attackCharge = 0; }
        this._shockwave(end, 0xf5ffe8, 0.75, 0.32, 0.8);
        this.onEvent({ type: 'critical', id: target.id, kind: target.kind, damage });
      }
      this._sparks(end, target.kind === 'shard' ? 0xb2fff0 : target.kind === 'projectile' ? 0xffb47c : MODELS[target.kind].color, critical ? 12 : 6, 0.75, target.kind === 'shard');
      this.onEvent({ type: 'hit', id: target.id, kind: target.kind, hp: target.hp, maxHp: target.maxHp, damage, critical, weakpoint, blocked });
      if (target.kind === 'shard') this._collectShard(target);
      else if (target.kind === 'projectile') this._destroyProjectile(this.projectiles.indexOf(target), 'laser');
      else if (target.hp <= 0) this._killEnemy(target, critical ? 'critical' : 'laser');
      else this._updateBossPhase(target);
    } else { this.focus = Math.max(0, this.focus - 0.3); this.combo = Math.max(0, this.combo - 1); }
    if ((this.phase === 'playing' || this.phase === 'lastchance') && this.heat >= 99.5) { this.overheated = true; this.focus = 0; this.onEvent({ type: 'overheat' }); }
    this.target = this.phase === 'playing' || this.phase === 'lastchance' ? this._findTarget() : null;
    this._publish();
    return true;
  }

  pulse() {
    if (this.phase !== 'playing' || this.pulseCharge < 99.9) return false;
    this._readCamera();
    this.pulseCharge = 0;
    this.heat = Math.max(0, this.heat - 35);
    if (this.heat <= 30) this.overheated = false;
    this._shockwave(this.cameraPosition.clone().addScaledVector(this.cameraDirection, 2.3), CYAN, 5.3, 0.85, 0.9);
    const cleared = this.projectiles.length;
    while (this.projectiles.length) this._destroyProjectile(this.projectiles.length - 1, 'pulse');
    const beforeKills = this.kills;
    for (const enemy of [...this.enemies]) {
      if (this.phase !== 'playing') break;
      const damage = enemy.kind === 'boss' ? Math.min(this.weapon.pulseDamage * 1.5, enemy.maxHp * 0.12) : this.weapon.pulseDamage;
      enemy.hp = Math.max(0, enemy.hp - damage);
      enemy.stun = this.weapon.pulseStun * (enemy.kind === 'boss' ? 0.7 : 1);
      enemy.exposed = Math.max(enemy.exposed, enemy.kind === 'boss' ? 3.3 : this.weapon.pulseStun + 1.2);
      enemy.hitFlash = 1;
      enemy.actionPhase = 'recover'; enemy.actionTimer = 2.4; enemy.attackCharge = 0;
      this._sparks(enemy.mesh.position, CYAN, 9, 0.9);
      if (enemy.hp <= 0) this._killEnemy(enemy, 'pulse');
      else this._updateBossPhase(enemy);
    }
    this.onEvent({ type: 'pulse', kills: this.kills - beforeKills, projectiles: cleared, stun: this.weapon.pulseStun });
    this.target = this.phase === 'playing' ? this._findTarget() : null;
    this._publish();
    return true;
  }

  _killEnemy(enemy, cause) {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    if (cause !== 'portal') {
      this.combo = this.totalTime - this.lastKillTime <= 4 ? this.combo + 1 : 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.lastKillTime = this.totalTime;
    }
    const multiplier = cause === 'portal' ? 1 : 1 + Math.min(4, Math.floor((this.combo - 1) / 3)) * 0.25;
    const points = Math.round(MODELS[enemy.kind].points * multiplier * (cause === 'critical' ? 1.15 : 1));
    this.score += points;
    this.kills++;
    if (cause === 'portal') this.portalKills++;
    if (cause !== 'pulse' && cause !== 'portal') this.pulseCharge = Math.min(100, this.pulseCharge + (enemy.kind === 'tank' ? 10 : 6));
    this._explode(enemy, MODELS[enemy.kind].color, enemy.kind === 'boss' ? 95 : enemy.kind === 'tank' ? 44 : 32);
    this._shockwave(enemy.mesh.position, MODELS[enemy.kind].color, enemy.kind === 'boss' ? 3.2 : enemy.kind === 'tank' ? 1.5 : 1.1, enemy.kind === 'boss' ? 1.1 : 0.52, 0.7);
    this.onEvent({ type: 'kill', id: enemy.id, kind: enemy.kind, points, combo: this.combo, cause, position: enemy.mesh.position.clone() });
    if (cause !== 'portal' && this.combo >= 3 && this.combo % 3 === 0) this.onEvent({ type: 'combo', combo: this.combo, multiplier });
    this._removeEnemy(index);
    if (enemy.kind === 'boss') { this.bossDefeated = true; this._finish(true); }
  }

  _removeEnemy(index) {
    if (index < 0) return;
    const [enemy] = this.enemies.splice(index, 1);
    if (!enemy) return;
    enemy.mesh.removeFromParent();
    enemy.mesh.userData.materials.forEach(material => material.dispose());
    enemy.mesh.children.forEach(child => child.dispose?.());
    if (this.target === enemy) this.target = null;
  }

  _rewardWave() {
    if (this.waveResolved) return this.waveSummary;
    this.waveResolved = true;
    const perfect = this.waveDamage === 0 && this.waveEscapes === 0;
    const bonus = perfect ? 120 + this.wave * 30 : 0;
    if (perfect) this.perfectWaves++;
    this.score += bonus;
    const beforeShield = this.shield;
    if (this.wave < 5) this.shield = Math.min(100, this.shield + 10 + (perfect ? 4 : 0));
    const shots = this.shots - this.waveShotsStart;
    this.waveSummary = {
      wave: this.wave, waveName: this.config.name, waveKills: this.kills - this.waveKillsStart,
      accuracy: shots ? Math.round((this.hits - this.waveHitsStart) / shots * 100) : 0,
      damageTaken: this.waveDamage, bonus, repaired: this.shield - beforeShield, perfect,
      elapsed: this.totalTime - this.waveStartTime,
    };
    if (perfect) this.onEvent({ type: 'perfectwave', wave: this.wave, bonus });
    this.onEvent({ type: 'waveclear', wave: this.wave, nextWave: this.wave < 5 ? this.wave + 1 : null, summary: { ...this.waveSummary } });
    return this.waveSummary;
  }

  _makeUpgradeOffers() {
    const available = UPGRADE_CATALOG.filter(item => (this.ownedUpgrades[item.id] || 0) < item.maxLevel);
    const chosen = [];
    const take = pool => {
      const valid = pool.filter(item => !chosen.includes(item));
      if (!valid.length) return;
      chosen.push(valid[Math.floor(this._random() * valid.length)]);
    };
    if (this.shield < 48 && available.some(item => item.id === 'shield')) take(available.filter(item => item.id === 'shield'));
    else take(available.filter(item => item.category === 'defence'));
    take(available.filter(item => item.category === 'weapon'));
    take(available.filter(item => item.category === 'control'));
    while (chosen.length < Math.min(3, available.length)) take(available);
    return chosen.map(item => {
      const level = (this.ownedUpgrades[item.id] || 0) + 1;
      return { id: item.id, title: item.title, description: item.description, icon: item.icon, level, stat: upgradeStat(item.id, level) };
    });
  }

  _completeWave() {
    if (this.wave >= 5) { this._finish(true); return; }
    const summary = this._rewardWave();
    this.phase = 'upgrade';
    this.target = null;
    this.focus = 0;
    this.combo = 0;
    this.heat = 0;
    this.overheated = false;
    this.upgradeOffers = this._makeUpgradeOffers();
    this._publish();
    this.onEvent({ type: 'upgrade', offers: this.upgradeOffers.map(item => ({ ...item })), summary: { ...summary } });
  }

  chooseUpgrade(id) {
    if (this.phase !== 'upgrade') return false;
    const offer = this.upgradeOffers.find(item => item.id === id);
    const entry = UPGRADE_CATALOG.find(item => item.id === id);
    if (!offer || !entry || (this.ownedUpgrades[id] || 0) >= entry.maxLevel) return false;
    this.ownedUpgrades[id] = (this.ownedUpgrades[id] || 0) + 1;
    this._applyUpgradeStats();
    const beforeShield = this.shield;
    if (id === 'shield') this.shield = Math.min(100, this.shield + 30);
    this.upgradeOffers = [];
    this.phase = 'intermission';
    this.intermission = 3;
    this.onEvent({ type: 'upgradechosen', id, level: this.ownedUpgrades[id], title: entry.title, repaired: this.shield - beforeShield, nextWave: this.wave + 1 });
    this._publish();
    return true;
  }

  _laser(end, hit, critical = false) {
    const group = new THREE.Group();
    const materials = [];
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cameraQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cameraQuaternion);
    for (const side of [-1, 1]) {
      const start = this.cameraPosition.clone().addScaledVector(right, side * 0.115).addScaledVector(up, -0.16).addScaledVector(this.cameraDirection, 0.22);
      const direction = end.clone().sub(start);
      const length = direction.length();
      const unitDirection = direction.clone().normalize();
      const haloMaterial = additiveMaterial(critical ? 0xfaffac : CYAN, critical ? 0.72 : 0.38);
      const coreMaterial = additiveMaterial(0xeaffff, 0.94);
      materials.push(haloMaterial, coreMaterial);
      for (const [radius, material] of [[critical ? 0.032 : 0.018, haloMaterial], [critical ? 0.008 : 0.0045, coreMaterial]]) {
        const beam = new THREE.Mesh(this.beamGeometry, material);
        beam.position.copy(start).addScaledVector(direction, 0.5);
        beam.quaternion.setFromUnitVectors(UP, unitDirection);
        beam.scale.set(radius, length, radius);
        group.add(beam);
      }
      const muzzleMaterial = new THREE.SpriteMaterial({ map: this.texture, color: CYAN, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
      const muzzle = new THREE.Sprite(muzzleMaterial);
      muzzle.position.copy(start);
      muzzle.scale.setScalar(0.24);
      group.add(muzzle);
      materials.push(muzzleMaterial);
    }
    if (hit) {
      const material = new THREE.SpriteMaterial({ map: this.texture, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
      const flash = new THREE.Sprite(material);
      flash.position.copy(end);
      flash.scale.setScalar(0.5);
      group.add(flash);
      materials.push(material);
    }
    this.effectGroup.add(group);
    this.effects.push({ group, materials, life: 0.105, age: 0, kind: 'laser', initialOpacity: materials.map(material => material.opacity) });
  }

  _worldBeam(start, end, color) {
    const group = new THREE.Group();
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length < 0.01) return;
    const midpoint = start.clone().addScaledVector(direction, 0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
    const materials = [additiveMaterial(color, 0.48), additiveMaterial(0xf6ffe8, 0.95)];
    for (let i = 0; i < 2; i++) {
      const beam = new THREE.Mesh(this.beamGeometry, materials[i]);
      beam.position.copy(midpoint); beam.quaternion.copy(rotation);
      beam.scale.set(i ? 0.0045 : 0.017, length, i ? 0.0045 : 0.017);
      group.add(beam);
    }
    this.effectGroup.add(group);
    this.effects.push({ group, materials, life: 0.15, age: 0, kind: 'laser', worldTime: true, initialOpacity: materials.map(material => material.opacity) });
  }

  _shockwave(position, color, radius, life, opacity, playerTime = false) {
    const material = additiveMaterial(color, opacity);
    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.position.copy(position);
    mesh.quaternion.copy(this.cameraQuaternion);
    mesh.scale.setScalar(0.04);
    this.effectGroup.add(mesh);
    this.effects.push({ group: mesh, materials: [material], life, age: 0, kind: 'ring', radius, playerTime, initialOpacity: [opacity] });
  }

  _addParticle(position, velocity, color, size, life, playerTime = false) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      position: position.clone(), velocity: velocity.clone(), color: new THREE.Color(color),
      rotation: new THREE.Euler(this._fx() * TAU, this._fx() * TAU, this._fx() * TAU),
      spin: new THREE.Vector3(this._fx() * 7 - 3.5, this._fx() * 7 - 3.5, this._fx() * 7 - 3.5),
      size, life, age: 0, playerTime,
    });
  }

  _sparks(position, color, count, speed = 1, playerTime = false) {
    for (let i = 0; i < count; i++) {
      const velocity = new THREE.Vector3(this._fx() - 0.5, this._fx() - 0.35, this._fx() - 0.5).normalize().multiplyScalar((0.4 + this._fx()) * speed);
      this._addParticle(position, velocity, i % 4 === 0 ? 0xffffff : color, 0.022 + this._fx() * 0.023, 0.24 + this._fx() * 0.27, playerTime);
    }
  }

  _explode(enemy, color, count) {
    enemy.mesh.updateWorldMatrix(true, false);
    const voxels = enemy.mesh.userData.voxels;
    for (let i = 0; i < count; i++) {
      const voxel = voxels[Math.floor(i / count * voxels.length)];
      const position = voxel.clone().applyMatrix4(enemy.mesh.matrixWorld);
      const velocity = position.clone().sub(enemy.mesh.position).normalize().multiplyScalar(0.8 + this._fx() * 1.7);
      velocity.z += this._fx() * 1.3 - 0.65;
      velocity.y += 0.35;
      this._addParticle(position, velocity, i % 6 === 0 ? 0xffffff : color, enemy.mesh.userData.pixelSize * (0.58 + this._fx() * 0.45), 0.55 + this._fx() * 0.6);
    }
  }

  _updateEffects(dt, worldDt = dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += effect.playerTime || (effect.kind === 'laser' && !effect.worldTime) ? dt : worldDt;
      const progress = effect.age / effect.life;
      if (progress >= 1) {
        effect.group.removeFromParent();
        effect.materials.forEach(material => material.dispose());
        this.effects.splice(i, 1);
        continue;
      }
      if (effect.kind === 'ring') effect.group.scale.setScalar(0.04 + effect.radius * (1 - Math.pow(1 - progress, 2)));
      effect.materials.forEach((material, index) => { material.opacity = effect.initialOpacity[index] * Math.pow(1 - progress, effect.kind === 'laser' ? 0.6 : 1.5); });
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      const particleDt = particle.playerTime ? dt : worldDt;
      particle.age += particleDt;
      if (particle.age >= particle.life) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      particle.velocity.y -= particleDt * 0.75;
      particle.velocity.multiplyScalar(Math.max(0, 1 - particleDt * 0.45));
      particle.position.addScaledVector(particle.velocity, particleDt);
      particle.rotation.x += particle.spin.x * particleDt;
      particle.rotation.y += particle.spin.y * particleDt;
      particle.rotation.z += particle.spin.z * particleDt;
    }
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      const fade = Math.max(0, 1 - particle.age / particle.life);
      this.tempObject.position.copy(particle.position);
      this.tempObject.rotation.copy(particle.rotation);
      this.tempObject.scale.setScalar(particle.size * (0.2 + fade * 0.8));
      this.tempObject.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.tempObject.matrix);
      this.tempColor.copy(particle.color).multiplyScalar(fade);
      this.particleMesh.setColorAt(i, this.tempColor);
    }
    this.particleMesh.count = this.particles.length;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  _updatePortals(dt) {
    for (const portal of this.portals) {
      const allied = portal.alliedRemaining > 0;
      const progress = portal.captureProgress / 6;
      const color = allied ? 0xc3ff79 : progress > 0 ? 0xa9ffcf : CYAN;
      portal.flash = Math.max(0, portal.flash - dt * 1.4);
      portal.detail.rotation.z += dt * (allied ? 1.2 : 0.16 + portal.flash + progress * 0.7);
      portal.ring.rotation.z -= dt * 0.15;
      const pulse = Math.sin(this.time * 1.8 + portal.seed) * 0.08;
      portal.ringMaterial.color.setHex(color);
      portal.detailMaterial.color.setHex(color);
      portal.glowMaterial.color.setHex(color);
      portal.coreMaterial.color.setHex(allied ? 0xe7ffb0 : progress > 0 ? 0xb7ffdf : 0x7af7d7);
      portal.core.scale.setScalar(allied ? 0.88 : 0.67 + progress * 0.2);
      portal.ringMaterial.opacity = (allied ? 0.8 : 0.38) + pulse + portal.flash * 0.6 + progress * 0.12;
      portal.detailMaterial.opacity = (allied ? 0.64 : 0.28) + portal.flash * 0.6;
      portal.glowMaterial.opacity = (allied ? 0.24 : 0.1) + pulse * 0.4 + portal.flash * 0.25;
    }
  }

  pause() {
    if (this.phase !== 'playing' && this.phase !== 'intermission' && this.phase !== 'lastchance') return;
    this.beforePause = this.phase;
    this.phase = 'paused';
    this._publish();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.beforePause;
    this._publish();
  }

  _finish(victory) {
    if (this.terminalEmitted || (victory && this.phase === 'lastchance')) return;
    this.terminalEmitted = true;
    if (victory) {
      this._rewardWave();
      while (this.projectiles.length) this._destroyProjectile(this.projectiles.length - 1, 'victory');
      while (this.enemies.length) this._removeEnemy(this.enemies.length - 1);
      this.spawnRemaining = 0;
    }
    this.phase = victory ? 'victory' : 'gameover';
    this.target = null;
    this.portalAim = null;
    this.lastChanceRemaining = 0;
    this._clearShards();
    for (const portal of this.portals) { portal.alliedRemaining = 0; portal.captureProgress = 0; }
    this.focus = 0;
    this._publish();
    this.onEvent({ type: 'gameover', victory, state: this.getState() });
  }

  _grade() {
    const accuracy = this.shots ? this.hits / this.shots * 100 : 0;
    const value = (this.phase === 'victory' ? 40 : 0) + accuracy * 0.3 + this.shield * 0.12 + this.perfectWaves * 3 + Math.min(8, this.criticals * 0.4);
    return value >= 90 ? 'S' : value >= 75 ? 'A' : value >= 60 ? 'B' : value >= 40 ? 'C' : 'D';
  }

  getState() {
    const threats = [...this.enemies, ...this.projectiles, ...this.shards].map(enemy => {
      const relative = enemy.mesh.position.clone().sub(this.cameraPosition).applyQuaternion(this.cameraQuaternion.clone().invert());
      const urgency = enemy.kind === 'shard' ? 0 : Math.max(enemy.kind === 'projectile' ? 0.6 : enemy.actionPhase === 'windup' || enemy.actionPhase === 'dash' ? 0.8 : 0, Math.max(0, Math.min(1, 1 - (enemy.distance - 0.6) / 5)));
      return { id: enemy.id, kind: enemy.kind, angle: Math.atan2(relative.x, -relative.z), elevation: Math.atan2(relative.y, Math.hypot(relative.x, relative.z)), distance: enemy.distance, hp: enemy.hp, maxHp: enemy.maxHp, behind: relative.z > 0, urgency, actionPhase: enemy.actionPhase, attackCharge: enemy.attackCharge || 0, stunned: enemy.stun > 0 };
    });
    const bossEnemy = this.enemies.find(enemy => enemy.kind === 'boss');
    const boss = bossEnemy ? { id: bossEnemy.id, hp: bossEnemy.hp, maxHp: bossEnemy.maxHp, phase: bossEnemy.bossPhase, label: ['Сканирование', 'Перегрузка', 'Последний рубеж'][bossEnemy.bossPhase - 1], exposed: bossEnemy.exposed > 0 || bossEnemy.stun > 0, attackCharge: bossEnemy.attackCharge } : null;
    const config = WAVE_CONFIG[this.wave - 1];
    const completed = config ? config.count - this.spawnRemaining - this.enemies.length : 0;
    const waveProgress = this.waveResolved || this.phase === 'victory' ? 1 : boss ? 1 - boss.hp / boss.maxHp : config ? Math.max(0, Math.min(1, completed / config.count)) : 0;
    const targetShielded = Boolean(this.target && this._shielded(this.target));
    const criticalReady = Boolean(this.phase === 'playing' && this.target && this.focusTarget === this.target.id && this.focus >= 0.999 && this.preciseAim && !this.overheated);
    const portal = this.phase === 'playing' ? this.portalAim : null;
    const portalTarget = portal ? { id: portal.id, progress: portal.alliedRemaining > 0 ? 1 : portal.captureProgress / 6, capturable: !this.portalCaptureUsed && portal.alliedRemaining <= 0, allied: portal.alliedRemaining > 0, remaining: portal.alliedRemaining } : null;
    const alliedPortal = this.portals.find(item => item.alliedRemaining > 0);
    const riftActive = this.phase === 'lastchance' || (this.phase === 'paused' && this.beforePause === 'lastchance');
    let targetHint = '';
    if (this.target?.kind === 'shard') targetHint = 'Соберите осколок одним выстрелом';
    else if (this.target?.kind === 'projectile') targetHint = 'Сбейте заряд одним выстрелом';
    else if (criticalReady) targetHint = 'Фокус готов · критический выстрел';
    else if (targetShielded) targetHint = this.preciseAim ? 'Ядро в прицеле · удерживайте фокус' : 'Броня · наведитесь на светящееся ядро';
    else if (this.target?.kind === 'boss') targetHint = 'Ядро открыто · полный урон';
    else if (this.target?.actionPhase === 'windup') targetHint = 'Рывок скоро · огонь или ЭМИ';
    else if (this.target) targetHint = this.preciseAim ? 'Точная наводка заряжает фокус' : 'Наведите центр прицела на цель';
    else if (portalTarget?.allied) targetHint = `Союзная турель · ${Math.ceil(portalTarget.remaining)} с`;
    else if (portalTarget?.capturable) targetHint = `Удерживайте огонь · захват ${Math.floor(portal.captureProgress)} / 6`;
    else if (portalTarget) targetHint = 'Захват использован · снова в следующей волне';
    return {
      score: this.score, kills: this.kills, wave: this.wave, totalWaves: 5,
      waveName: config?.name || '', waveDescription: config?.description || '', waveProgress,
      shield: this.shield, maxShield: 100, heat: this.heat, overheated: this.overheated,
      combo: this.combo, bestCombo: this.bestCombo, accuracy: this.shots ? Math.round(this.hits / this.shots * 100) : 0,
      shots: this.shots, hits: this.hits, shotsBlocked: this.shotsBlocked, criticals: this.criticals, pulseCharge: this.pulseCharge,
      elapsed: this.totalTime, remaining: this.spawnRemaining + this.enemies.length,
      incoming: this.enemies.length + this.projectiles.length, enemies: this.enemies.length, projectiles: this.projectiles.length, projectilesDestroyed: this.projectilesDestroyed, phase: this.phase,
      targeted: Boolean(this.target || portalTarget), targetKind: this.target?.kind || (portalTarget ? 'portal' : null),
      targetHealth: this.target ? this.target.hp / this.target.maxHp : portalTarget?.progress || 0,
      targetHp: this.target?.hp || (portalTarget ? Math.floor(portal.captureProgress) : 0), targetMaxHp: this.target?.maxHp || (portalTarget ? 6 : 0), targetShielded, targetHint,
      focus: this.focus, focusTarget: this.focusTarget, criticalReady, preciseAim: this.preciseAim,
      nearestDistance: threats.length ? Math.min(...threats.map(threat => threat.distance)) : null,
      intermission: Math.max(0, this.intermission), threats, boss,
      upgradeOffers: this.upgradeOffers.map(offer => ({ ...offer })),
      upgrades: UPGRADE_CATALOG.filter(item => this.ownedUpgrades[item.id]).map(item => ({ id: item.id, title: item.title, description: item.description, icon: item.icon, level: this.ownedUpgrades[item.id], stat: upgradeStat(item.id, this.ownedUpgrades[item.id]) })),
      modifiers: { ...this.weapon }, perfectWaves: this.perfectWaves, grade: this._grade(),
      damageTaken: this.totalDamageTaken, seed: this.seed, difficulty: this.difficultyName || 'normal',
      waveSummary: this.waveSummary ? { ...this.waveSummary } : null,
      portalTarget, portalCaptureReady: this.phase === 'playing' && !this.portalCaptureUsed,
      capturedPortal: alliedPortal ? { id: alliedPortal.id, remaining: alliedPortal.alliedRemaining, duration: 10 } : null,
      portalCaptures: this.portalCaptures, portalKills: this.portalKills, portalShots: this.portalShots, portalAllyShots: this.portalAllyShots, portalInterceptions: this.portalInterceptions,
      lastChance: { active: riftActive, used: this.lastChanceUsed, remaining: this.lastChanceRemaining, duration: 5, collected: this.lastChanceCollected, total: 3 },
      timeScale: this.phase === 'lastchance' ? 0.12 : ['paused', 'upgrade', 'idle', 'victory', 'gameover'].includes(this.phase) ? 0 : 1,
      riftSaves: this.riftSaves,
    };
  }

  getEnemies() { return [...this.enemies, ...this.projectiles, ...this.shards]; }
  getPortals() { return this.portals; }

  _publish() { this.onUpdate(this.getState()); }

  stop() {
    this.phase = 'idle';
    this.target = null;
    this.portalAim = null;
    this._clearShards();
    while (this.enemies.length) this._removeEnemy(this.enemies.length - 1);
    for (const projectile of this.projectiles) {
      projectile.mesh.removeFromParent();
      projectile.mesh.userData.materials.forEach(material => material.dispose());
    }
    this.projectiles.length = 0;
    for (const effect of this.effects) {
      effect.group.removeFromParent();
      effect.materials.forEach(material => material.dispose());
    }
    this.effects.length = 0;
    this.particles.length = 0;
    this.particleMesh.count = 0;
    for (const portal of this.portals) {
      portal.group.removeFromParent();
      portal.materials.forEach(material => material.dispose());
      portal.detailGeometry.dispose();
    }
    this.portals.length = 0;
    this.spawnRemaining = 0;
    this.intermission = 0;
    this.upgradeOffers = [];
    this.focus = 0;
    this.focusTarget = null;
    this.lastChanceRemaining = 0;
    this.group.visible = false;
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.group.removeFromParent();
    this.box.dispose();
    this.beamGeometry.dispose();
    this.ringGeometry.dispose();
    this.portalTorus.dispose();
    this.portalDisk.dispose();
    this.projectileGeometry.dispose();
    this.coreGeometry.dispose();
    this.shardGeometry.dispose();
    this.shardBackplateGeometry.dispose();
    this.texture.dispose();
    this.particleMaterial.dispose();
    this.particleMesh.dispose();
  }
}
