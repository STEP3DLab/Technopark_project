import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const CYAN = 0x70ffe5;
const WAVE_COUNTS = [5, 7, 9, 11, 14];
const MAX_PARTICLES = 260;
const MODELS = {
  scout: {
    color: 0x64ffe3, glow: 0x18cfb4, size: 0.078, hp: 1, speed: 0.37, damage: 12, points: 100,
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
    color: 0xf794ef, glow: 0xcd36bf, size: 0.085, hp: 2, speed: 0.31, damage: 18, points: 180,
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
    color: 0xffc482, glow: 0xe5752c, size: 0.088, hp: 4, speed: 0.235, damage: 26, points: 350,
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
};
const DIFFICULTIES = {
  easy: { speed: 0.77, damage: 0.75, assist: 0.048 },
  normal: { speed: 1, damage: 1, assist: 0.032 },
  hard: { speed: 1.33, damage: 1.18, assist: 0.021 },
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
  group.userData.dispose = () => {
    geometry.dispose();
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
    this.portalGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();
    this.group.add(this.portalGroup, this.enemyGroup, this.effectGroup);
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.ringGeometry = new THREE.RingGeometry(0.91, 1, 64);
    this.portalTorus = new THREE.TorusGeometry(0.53, 0.015, 6, 64);
    this.portalDisk = new THREE.CircleGeometry(0.49, 48);
    this.texture = glowTexture();
    this.particleMaterial = additiveMaterial(0xffffff, 0.95);
    this.particleMesh = new THREE.InstancedMesh(this.box, this.particleMaterial, MAX_PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.effectGroup.add(this.particleMesh);
    this.enemies = [];
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
    this.phase = 'idle';
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
    this.difficulty = DIFFICULTIES.normal;
  }

  setCamera(camera) { this.camera = camera; }

  _readCamera() {
    this.camera.updateWorldMatrix(true, false);
    this.camera.getWorldPosition(this.cameraPosition);
    this.camera.getWorldQuaternion(this.cameraQuaternion);
    this.cameraDirection.set(0, 0, -1).applyQuaternion(this.cameraQuaternion).normalize();
  }

  start({ mode = 'demo', difficulty = 'normal', portals = [] } = {}) {
    this.stop();
    this.group.visible = true;
    this.mode = mode;
    this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    this.phase = 'playing';
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
    this.publishDelay = 0;
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
      group.add(disk, glow, ring, detail);
      this.portalGroup.add(group);
      this.portals.push({ group, position, ring, detail, glow, glowMaterial, ringMaterial, detailMaterial, detailGeometry, materials: [ringMaterial, detailMaterial, diskMaterial, glowMaterial], flash: 0, seed: i * 1.7 });
    }
  }

  _beginWave(wave) {
    this.wave = wave;
    this.phase = 'playing';
    this.spawnRemaining = WAVE_COUNTS[wave - 1];
    this.spawnDelay = wave === 1 ? 0.3 : 0.65;
    this.onEvent({ type: 'wave', wave, total: 5, enemies: this.spawnRemaining });
  }

  _spawnEnemy() {
    if (!this.portals.length) return;
    const alreadySpawned = WAVE_COUNTS[this.wave - 1] - this.spawnRemaining;
    // The opening invader appears at the portal nearest the crosshair.
    let portal;
    if (this.wave === 1 && alreadySpawned === 0) {
      portal = this.portals.reduce((best, item) => {
        const dot = item.position.clone().sub(this.cameraPosition).normalize().dot(this.cameraDirection);
        return !best || dot > best.dot ? { item, dot } : best;
      }, null).item;
    } else portal = this.portals[(alreadySpawned + this.wave - 1) % this.portals.length];
    let kind = 'scout';
    if (this.wave >= 2 && alreadySpawned % 3 === 2) kind = 'drone';
    if (this.wave >= 3 && alreadySpawned % 5 === 4) kind = 'tank';
    if (this.wave === 5 && alreadySpawned % 4 === 3) kind = 'tank';
    const spec = MODELS[kind];
    const mesh = buildInvader(kind, this.box);
    mesh.position.copy(portal.position);
    mesh.scale.setScalar(0.01);
    this.enemyGroup.add(mesh);
    const enemy = {
      id: this.nextId++, mesh, kind, hp: spec.hp, maxHp: spec.hp,
      position: portal.position.clone(), spawnPosition: portal.position.clone(),
      age: 0, seed: Math.random() * TAU, hitFlash: 0, distance: portal.position.distanceTo(this.cameraPosition),
      radius: kind === 'tank' ? 0.54 : 0.4,
      speed: (spec.speed + (this.wave - 1) * 0.026) * this.difficulty.speed,
      // Brief side-step after emerging from the portal gives corner entrances
      // a readable silhouette before the invader begins its approach.
      sidestep: ((this.enemies.length % 2) * 2 - 1) * (kind === 'scout' ? 0.18 : 0.1),
    };
    this.enemies.push(enemy);
    this.spawnRemaining--;
    portal.flash = 1;
    this._shockwave(portal.position, CYAN, 0.65, 0.7, 0.18);
    this.onEvent({ type: 'spawn', id: enemy.id, kind, position: portal.position.clone() });
  }

  update(dt, time) {
    if (this.disposed || this.phase === 'idle' || this.phase === 'paused') return;
    dt = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), 0.07);
    this.time += dt;
    this._readCamera();
    this._updateEffects(dt);
    this._updatePortals(dt);
    if (this.phase === 'victory' || this.phase === 'gameover') return;
    this.totalTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.heat = Math.max(0, this.heat - dt * (this.overheated ? 33 : 24));
    if (this.overheated && this.heat <= 30) {
      this.overheated = false;
      this.onEvent({ type: 'cooled' });
    }
    this.pulseCharge = Math.min(100, this.pulseCharge + dt * 2.1);
    if (this.combo && this.totalTime - this.lastKillTime > 3.6) this.combo = 0;
    if (this.phase === 'intermission') {
      this.intermission -= dt;
      if (this.intermission <= 0) this._beginWave(this.wave + 1);
    } else {
      this.spawnDelay -= dt;
      if (this.spawnRemaining > 0 && this.spawnDelay <= 0 && this.enemies.length < 10) {
        this._spawnEnemy();
        this.spawnDelay = Math.max(0.78, 1.85 - this.wave * 0.18);
      }
      this._updateEnemies(dt);
      this.target = this.phase === 'playing' ? this._findTarget() : null;
      if (!this.enemies.length && !this.spawnRemaining && this.phase === 'playing') {
        if (this.wave >= 5) this._finish(true);
        else {
          this.phase = 'intermission';
          this.intermission = 3.2;
          this.shield = Math.min(100, this.shield + 12);
          this.onEvent({ type: 'waveclear', wave: this.wave, nextWave: this.wave + 1 });
        }
      }
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
      const emergence = Math.min(1, enemy.age / 0.58);
      enemy.mesh.scale.setScalar(1 - Math.pow(1 - emergence, 3));
      const direction = this.tempV.copy(this.cameraPosition).sub(enemy.position);
      const distance = direction.length();
      direction.normalize();
      if (enemy.age > 0.35) enemy.position.addScaledVector(direction, enemy.speed * dt);
      const side = this.tempV2.crossVectors(direction, UP).normalize();
      const wobble = Math.sin(enemy.age * 1.9 + enemy.seed) * 0.09;
      const cornerStep = Math.sin(Math.min(1, enemy.age / 2) * Math.PI) * enemy.sidestep;
      enemy.mesh.position.copy(enemy.position).addScaledVector(side, wobble + cornerStep);
      enemy.mesh.position.y += Math.sin(enemy.age * 2.2 + enemy.seed) * 0.075;
      enemy.mesh.lookAt(this.cameraPosition);
      enemy.mesh.rotateZ(Math.sin(enemy.age * 1.35 + enemy.seed) * 0.065);
      enemy.distance = distance;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 5.5);
      enemy.mesh.userData.bodyMaterial.emissiveIntensity = 0.62 + enemy.hitFlash * 2.4;
      if (distance < 0.62 && enemy.age > 0.65) {
        const damage = Math.round(MODELS[enemy.kind].damage * this.difficulty.damage);
        this.shield = Math.max(0, this.shield - damage);
        this.combo = 0;
        this._explode(enemy, 0xff5c79, 20);
        this._removeEnemy(i);
        this.onEvent({ type: 'damage', damage, shield: this.shield });
        if (this.shield <= 0) { this._finish(false); break; }
      }
    }
  }

  _findTarget() {
    let target = null;
    let bestDistance = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.age < 0.16) continue;
      const offset = this.tempV.copy(enemy.mesh.position).sub(this.cameraPosition);
      const distance = offset.length();
      const forwardDistance = offset.dot(this.cameraDirection);
      if (forwardDistance <= 0) continue;
      const radius = enemy.radius * Math.min(1, enemy.age / 0.58);
      const perpendicular = Math.sqrt(Math.max(0, distance * distance - forwardDistance * forwardDistance));
      const assistRadius = radius + distance * this.difficulty.assist;
      if (perpendicular <= assistRadius && distance < bestDistance) {
        target = enemy;
        bestDistance = distance;
      }
    }
    return target;
  }

  fire() {
    if (this.phase !== 'playing' || this.cooldown > 0 || this.overheated) return false;
    this._readCamera();
    this.cooldown = 0.125;
    this.shots++;
    this.heat = Math.min(100, this.heat + 9.8);
    const target = this._findTarget();
    const end = target ? target.mesh.position.clone() : this.cameraDirection.clone().multiplyScalar(16).add(this.cameraPosition);
    this._laser(end, Boolean(target));
    this.onEvent({ type: 'shot', hit: Boolean(target), position: end.clone() });
    if (target) {
      this.hits++;
      target.hp--;
      target.hitFlash = 1;
      this._sparks(end, MODELS[target.kind].color, 7, 0.65);
      this.onEvent({ type: 'hit', id: target.id, kind: target.kind, hp: target.hp, maxHp: target.maxHp });
      if (target.hp <= 0) this._killEnemy(target, 'laser');
    }
    if (this.heat >= 99.5) {
      this.overheated = true;
      this.onEvent({ type: 'overheat' });
    }
    this.target = this._findTarget();
    this._publish();
    return true;
  }

  pulse() {
    if (this.phase !== 'playing' || this.pulseCharge < 99.9) return false;
    this._readCamera();
    this.pulseCharge = 0;
    this.heat = Math.max(0, this.heat - 40);
    if (this.heat <= 30) this.overheated = false;
    this._shockwave(this.cameraPosition.clone().addScaledVector(this.cameraDirection, 2.3), CYAN, 4.9, 0.85, 0.9);
    const victims = [...this.enemies];
    for (const enemy of victims) this._killEnemy(enemy, 'pulse');
    this.onEvent({ type: 'pulse', kills: victims.length });
    this.target = null;
    this._publish();
    return true;
  }

  _killEnemy(enemy, cause) {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.combo = this.totalTime - this.lastKillTime <= 3.6 ? this.combo + 1 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastKillTime = this.totalTime;
    const multiplier = 1 + Math.min(4, Math.floor((this.combo - 1) / 3)) * 0.25;
    const points = Math.round(MODELS[enemy.kind].points * multiplier);
    this.score += points;
    this.kills++;
    if (cause !== 'pulse') this.pulseCharge = Math.min(100, this.pulseCharge + 7.5);
    this._explode(enemy, MODELS[enemy.kind].color, enemy.kind === 'tank' ? 44 : 34);
    this._shockwave(enemy.mesh.position, MODELS[enemy.kind].color, enemy.kind === 'tank' ? 1.5 : 1.1, 0.52, 0.65);
    this.onEvent({ type: 'kill', id: enemy.id, kind: enemy.kind, points, combo: this.combo, cause, position: enemy.mesh.position.clone() });
    if (this.combo >= 3 && this.combo % 3 === 0) this.onEvent({ type: 'combo', combo: this.combo, multiplier });
    this._removeEnemy(index);
  }

  _removeEnemy(index) {
    const [enemy] = this.enemies.splice(index, 1);
    if (!enemy) return;
    enemy.mesh.removeFromParent();
    enemy.mesh.userData.materials.forEach(material => material.dispose());
    enemy.mesh.children.forEach(child => child.dispose?.());
    if (this.target === enemy) this.target = null;
  }

  _laser(end, hit) {
    const group = new THREE.Group();
    const materials = [];
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cameraQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cameraQuaternion);
    for (const side of [-1, 1]) {
      const start = this.cameraPosition.clone().addScaledVector(right, side * 0.115).addScaledVector(up, -0.16).addScaledVector(this.cameraDirection, 0.22);
      const direction = end.clone().sub(start);
      const length = direction.length();
      const unitDirection = direction.clone().normalize();
      const haloMaterial = additiveMaterial(CYAN, 0.38);
      const coreMaterial = additiveMaterial(0xeaffff, 0.94);
      materials.push(haloMaterial, coreMaterial);
      for (const [radius, material] of [[0.018, haloMaterial], [0.0045, coreMaterial]]) {
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

  _shockwave(position, color, radius, life, opacity) {
    const material = additiveMaterial(color, opacity);
    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.position.copy(position);
    mesh.quaternion.copy(this.cameraQuaternion);
    mesh.scale.setScalar(0.04);
    this.effectGroup.add(mesh);
    this.effects.push({ group: mesh, materials: [material], life, age: 0, kind: 'ring', radius, initialOpacity: [opacity] });
  }

  _addParticle(position, velocity, color, size, life) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      position: position.clone(), velocity: velocity.clone(), color: new THREE.Color(color),
      rotation: new THREE.Euler(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
      spin: new THREE.Vector3(Math.random() * 7 - 3.5, Math.random() * 7 - 3.5, Math.random() * 7 - 3.5),
      size, life, age: 0,
    });
  }

  _sparks(position, color, count, speed = 1) {
    for (let i = 0; i < count; i++) {
      const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize().multiplyScalar((0.4 + Math.random()) * speed);
      this._addParticle(position, velocity, i % 4 === 0 ? 0xffffff : color, 0.022 + Math.random() * 0.023, 0.24 + Math.random() * 0.27);
    }
  }

  _explode(enemy, color, count) {
    enemy.mesh.updateWorldMatrix(true, false);
    const voxels = enemy.mesh.userData.voxels;
    for (let i = 0; i < count; i++) {
      const voxel = voxels[Math.floor(i / count * voxels.length)];
      const position = voxel.clone().applyMatrix4(enemy.mesh.matrixWorld);
      const velocity = position.clone().sub(enemy.mesh.position).normalize().multiplyScalar(0.8 + Math.random() * 1.7);
      velocity.z += Math.random() * 1.3 - 0.65;
      velocity.y += 0.35;
      this._addParticle(position, velocity, i % 6 === 0 ? 0xffffff : color, enemy.mesh.userData.pixelSize * (0.58 + Math.random() * 0.45), 0.55 + Math.random() * 0.6);
    }
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += dt;
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
      particle.age += dt;
      if (particle.age >= particle.life) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      particle.velocity.y -= dt * 0.75;
      particle.velocity.multiplyScalar(Math.max(0, 1 - dt * 0.45));
      particle.position.addScaledVector(particle.velocity, dt);
      particle.rotation.x += particle.spin.x * dt;
      particle.rotation.y += particle.spin.y * dt;
      particle.rotation.z += particle.spin.z * dt;
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
      portal.flash = Math.max(0, portal.flash - dt * 1.4);
      portal.detail.rotation.z += dt * (0.16 + portal.flash);
      portal.ring.rotation.z -= dt * 0.15;
      const pulse = Math.sin(this.time * 1.8 + portal.seed) * 0.08;
      portal.ringMaterial.opacity = 0.38 + pulse + portal.flash * 0.6;
      portal.detailMaterial.opacity = 0.28 + portal.flash * 0.6;
      portal.glowMaterial.opacity = 0.1 + pulse * 0.4 + portal.flash * 0.25;
    }
  }

  pause() {
    if (this.phase !== 'playing' && this.phase !== 'intermission') return;
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
    this.phase = victory ? 'victory' : 'gameover';
    this.target = null;
    this._publish();
    this.onEvent({ type: 'gameover', victory, state: this.getState() });
  }

  getState() {
    const threats = this.enemies.map(enemy => {
      const relative = enemy.mesh.position.clone().sub(this.cameraPosition).applyQuaternion(this.cameraQuaternion.clone().invert());
      return { id: enemy.id, kind: enemy.kind, angle: Math.atan2(relative.x, -relative.z), elevation: Math.atan2(relative.y, Math.hypot(relative.x, relative.z)), distance: enemy.distance, hp: enemy.hp, maxHp: enemy.maxHp, behind: relative.z > 0 };
    });
    return {
      score: this.score, kills: this.kills, wave: this.wave, totalWaves: 5,
      shield: this.shield, heat: this.heat, overheated: this.overheated,
      combo: this.combo, bestCombo: this.bestCombo, accuracy: this.shots ? Math.round(this.hits / this.shots * 100) : 0,
      shots: this.shots, hits: this.hits, pulseCharge: this.pulseCharge,
      elapsed: this.totalTime, remaining: this.spawnRemaining + this.enemies.length,
      incoming: this.enemies.length, enemies: this.enemies.length, phase: this.phase,
      targeted: Boolean(this.target), targetKind: this.target?.kind || null,
      targetHealth: this.target ? this.target.hp / this.target.maxHp : 0,
      nearestDistance: threats.length ? Math.min(...threats.map(threat => threat.distance)) : null,
      intermission: Math.max(0, this.intermission), threats,
    };
  }

  getEnemies() { return this.enemies; }

  _publish() { this.onUpdate(this.getState()); }

  stop() {
    this.phase = 'idle';
    this.target = null;
    while (this.enemies.length) this._removeEnemy(this.enemies.length - 1);
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
    this.texture.dispose();
    this.particleMaterial.dispose();
    this.particleMesh.dispose();
  }
}
