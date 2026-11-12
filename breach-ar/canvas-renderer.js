import * as THREE from './vendor/three.module.js';

// A CPU renderer for browsers where WebGL is unavailable. It draws the same
// world-space scene/camera used by aiming and gameplay; it does not emulate XR.
const MAX_COMMANDS = 14000;
const WHITE = new THREE.Color(0xffffff);
const linearToByte = value => Math.round(Math.min(1, Math.max(0, value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055)) * 255);
const matrixScale = m => Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));

export class CanvasRenderer {
  constructor({ canvas }) {
    this.domElement = canvas;
    this.context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!this.context) throw new Error('Canvas 2D is unavailable');
    this.isCanvasRenderer = true;
    this.xr = {
      enabled: false, isPresenting: false,
      setReferenceSpaceType() {},
      getSession() { return null; },
      getReferenceSpace() { return null; },
      async setSession() { throw new Error('Spatial AR requires WebGL'); },
    };
    this.pixelRatio = 1;
    this.width = 1;
    this.height = 1;
    this.clearColor = new THREE.Color(0);
    this.clearAlpha = 0;
    this.geometryCache = new WeakMap();
    this.modelView = new THREE.Matrix4();
    this.world = new THREE.Matrix4();
    this.instance = new THREE.Matrix4();
    this.color = new THREE.Color();
    this.instanceColor = new THREE.Color();
    this.commands = [];
    this.animationId = 0;
    this.loop = null;
    this.disposed = false;
  }

  setPixelRatio(ratio) { this.pixelRatio = Math.min(1.5, Math.max(0.5, ratio || 1)); }

  setSize(width, height, updateStyle = true) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.domElement.width = Math.round(this.width * this.pixelRatio);
    this.domElement.height = Math.round(this.height * this.pixelRatio);
    if (updateStyle) {
      this.domElement.style.width = `${this.width}px`;
      this.domElement.style.height = `${this.height}px`;
    }
  }

  setClearColor(color, alpha = 1) { this.clearColor.set(color); this.clearAlpha = alpha; }

  setAnimationLoop(callback) {
    cancelAnimationFrame(this.animationId);
    this.loop = callback;
    if (!callback || this.disposed) return;
    const tick = time => {
      if (!this.loop || this.disposed) return;
      this.loop(time, null);
      this.animationId = requestAnimationFrame(tick);
    };
    this.animationId = requestAnimationFrame(tick);
  }

  _geometry(geometry) {
    let cached = this.geometryCache.get(geometry);
    if (cached) return cached;
    const attribute = geometry.getAttribute('position');
    if (!attribute) return null;
    const vertices = [], remap = [], unique = new Map();
    for (let i = 0; i < attribute.count; i++) {
      const x = attribute.getX(i), y = attribute.getY(i), z = attribute.getZ(i);
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      let index = unique.get(key);
      if (index === undefined) { index = vertices.length; unique.set(key, index); vertices.push([x, y, z]); }
      remap.push(index);
    }
    const index = geometry.index;
    const source = index ? Array.from(index.array) : Array.from({ length: attribute.count }, (_, i) => i);
    const faces = [];
    const isSimpleBox = geometry.type === 'BoxGeometry' && (geometry.parameters.widthSegments || 1) === 1 && (geometry.parameters.heightSegments || 1) === 1 && (geometry.parameters.depthSegments || 1) === 1;
    const isSimplePlane = geometry.type === 'PlaneGeometry' && (geometry.parameters.widthSegments || 1) === 1 && (geometry.parameters.heightSegments || 1) === 1;
    if (isSimpleBox || isSimplePlane) {
      for (let i = 0; i < source.length; i += 6) faces.push([source[i], source[i + 1], source[i + 4], source[i + 2]].map(item => remap[item]));
    } else {
      for (let i = 0; i + 2 < source.length; i += 3) faces.push([remap[source[i]], remap[source[i + 1]], remap[source[i + 2]]]);
    }
    cached = { vertices, faces };
    this.geometryCache.set(geometry, cached);
    return cached;
  }

  _viewPoint(x, y, z, m) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  }

  _project(point) {
    const p = this.projection;
    const w = p[3] * point[0] + p[7] * point[1] + p[11] * point[2] + p[15];
    if (Math.abs(w) < 1e-8) return [0, 0];
    return [
      ((p[0] * point[0] + p[4] * point[1] + p[8] * point[2] + p[12]) / w * 0.5 + 0.5) * this.width,
      (0.5 - (p[1] * point[0] + p[5] * point[1] + p[9] * point[2] + p[13]) / w * 0.5) * this.height,
    ];
  }

  _clipNear(points) {
    const output = [], plane = -this.near;
    let previous = points[points.length - 1];
    let prevInside = previous[2] <= plane;
    for (const current of points) {
      const inside = current[2] <= plane;
      if (inside !== prevInside) {
        const t = (plane - previous[2]) / (current[2] - previous[2]);
        output.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t, plane]);
      }
      if (inside) output.push(current);
      previous = current;
      prevInside = inside;
    }
    return output;
  }

  _style(material, shade, distance, instanceColor = WHITE, vertexColor = null) {
    const base = material.color || WHITE;
    const emissive = material.emissive;
    const intensity = material.emissiveIntensity ?? 1;
    let r = base.r * instanceColor.r * shade;
    let g = base.g * instanceColor.g * shade;
    let b = base.b * instanceColor.b * shade;
    if (vertexColor) { r *= vertexColor[0]; g *= vertexColor[1]; b *= vertexColor[2]; }
    if (emissive) { r += emissive.r * intensity * 0.6; g += emissive.g * intensity * 0.6; b += emissive.b * intensity * 0.6; }
    if (this.fog && material.fog !== false) {
      const fog = this.fog;
      const amount = fog.isFogExp2 ? 1 - Math.exp(-fog.density * fog.density * distance * distance) : Math.min(1, Math.max(0, (distance - fog.near) / (fog.far - fog.near)));
      r += (fog.color.r - r) * amount; g += (fog.color.g - g) * amount; b += (fog.color.b - b) * amount;
    }
    return `rgb(${linearToByte(r)},${linearToByte(g)},${linearToByte(b)})`;
  }

  _mesh(geometry, material, modelView, instanceColor = WHITE) {
    if (!material || material.visible === false || material.opacity <= 0.002) return;
    // Thin tubes are drawn along their actual projected 3D centerline. This
    // keeps orbital rings smooth without thousands of subpixel triangles.
    const parameters = geometry.parameters;
    if (geometry.type === 'TorusGeometry' && parameters.tube / parameters.radius < 0.08) {
      const segments = Math.min(96, parameters.tubularSegments || 64);
      let previous = null;
      const scale = matrixScale(modelView.elements);
      for (let i = 0; i <= segments; i++) {
        const angle = (parameters.arc || Math.PI * 2) * i / segments;
        const point = this._viewPoint(Math.cos(angle) * parameters.radius, Math.sin(angle) * parameters.radius, 0, modelView.elements);
        if (previous) this._lineSegment(previous, point, material, Math.max(0.7, parameters.tube * 2 * scale * this.height * this.projection[5] / (2 * Math.max(this.near, -(point[2] + previous[2]) / 2))), instanceColor);
        previous = point;
      }
      return;
    }
    const cached = this._geometry(geometry);
    if (!cached) return;
    const vertices = cached.vertices.map(vertex => this._viewPoint(...vertex, modelView.elements));
    for (const face of cached.faces) {
      if (this.commands.length >= MAX_COMMANDS) return;
      let points = face.map(index => vertices[index]);
      if (points.every(point => point[2] > -this.near) || points.every(point => point[2] < -this.far)) continue;
      const a = points[0], b = points[1], c = points[2];
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
      let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      const facing = nx * a[0] + ny * a[1] + nz * a[2];
      if (material.side !== THREE.DoubleSide && (material.side === THREE.BackSide ? facing < 0 : facing > 0)) continue;
      const norm = Math.hypot(nx, ny, nz) || 1;
      nx /= norm; ny /= norm; nz /= norm;
      if (facing > 0) { nx *= -1; ny *= -1; nz *= -1; }
      const shade = material.isMeshBasicMaterial ? 1 : 0.28 + 0.72 * Math.max(0, nx * 0.32 + ny * 0.55 + nz * 0.77);
      points = this._clipNear(points);
      if (points.length < 3) continue;
      const screen = points.map(point => this._project(point));
      if (screen.every(point => point[0] < -2) || screen.every(point => point[0] > this.width + 2) || screen.every(point => point[1] < -2) || screen.every(point => point[1] > this.height + 2)) continue;
      const depth = -points.reduce((sum, point) => sum + point[2], 0) / points.length;
      this.commands.push({ kind: 'face', points: screen, depth, color: this._style(material, shade, depth, instanceColor), alpha: material.opacity ?? 1, additive: material.blending === THREE.AdditiveBlending });
    }
  }

  _lineSegment(a, b, material, width = 1, instanceColor = WHITE, vertexColor = null) {
    if (this.commands.length >= MAX_COMMANDS || (a[2] > -this.near && b[2] > -this.near)) return;
    if (a[2] > -this.near || b[2] > -this.near) {
      const t = (-this.near - a[2]) / (b[2] - a[2]);
      const cut = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -this.near];
      if (a[2] > -this.near) a = cut; else b = cut;
    }
    const points = [this._project(a), this._project(b)];
    if (points.every(point => point[0] < 0) || points.every(point => point[0] > this.width) || points.every(point => point[1] < 0) || points.every(point => point[1] > this.height)) return;
    const depth = -(a[2] + b[2]) / 2;
    this.commands.push({ kind: 'line', points, depth: depth - 0.001, color: this._style(material, 1, depth, instanceColor, vertexColor), alpha: material.opacity ?? 1, width: Math.min(20, width), additive: material.blending === THREE.AdditiveBlending });
  }

  _lines(object, modelView) {
    const geometry = object.geometry, material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material || material.visible === false || material.opacity <= 0.002) return;
    const position = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
    if (!position) return;
    const index = geometry.index;
    const count = Math.min(index?.count || position.count, geometry.drawRange.count);
    const step = object.isLineSegments ? 2 : 1;
    for (let i = geometry.drawRange.start; i + 1 < count; i += step) {
      const ai = index ? index.getX(i) : i, bi = index ? index.getX(i + 1) : i + 1;
      const a = this._viewPoint(position.getX(ai), position.getY(ai), position.getZ(ai), modelView.elements);
      const b = this._viewPoint(position.getX(bi), position.getY(bi), position.getZ(bi), modelView.elements);
      const vertexColor = colors && material.vertexColors ? [colors.getX(ai), colors.getY(ai), colors.getZ(ai)] : null;
      this._lineSegment(a, b, material, material.linewidth || 1, WHITE, vertexColor);
    }
  }

  _points(object, modelView) {
    const material = object.material, positions = object.geometry.getAttribute('position');
    if (!positions || !material || material.opacity <= 0.002) return;
    for (let i = 0; i < positions.count; i++) {
      const point = this._viewPoint(positions.getX(i), positions.getY(i), positions.getZ(i), modelView.elements);
      if (point[2] > -this.near || point[2] < -this.far) continue;
      const screen = this._project(point);
      if (screen[0] < 0 || screen[0] > this.width || screen[1] < 0 || screen[1] > this.height) continue;
      const radius = Math.max(0.55, (material.size || 1) * (material.sizeAttenuation === false ? 0.5 : this.height * this.projection[5] / (-point[2] * 4)));
      this.commands.push({ kind: 'point', point: screen, radius: Math.min(30, radius), depth: -point[2], color: this._style(material, 1, -point[2]), alpha: material.opacity ?? 1, additive: material.blending === THREE.AdditiveBlending });
    }
  }

  _sprite(object, modelView) {
    const material = object.material;
    if (!material || material.opacity <= 0.002) return;
    const point = this._viewPoint(0, 0, 0, modelView.elements);
    if (point[2] > -this.near) return;
    const screen = this._project(point);
    const radius = matrixScale(object.matrixWorld.elements) * this.height * this.projection[5] / (-point[2] * 4);
    if (radius < 0.3 || screen[0] < -radius || screen[0] > this.width + radius || screen[1] < -radius || screen[1] > this.height + radius) return;
    this.commands.push({ kind: 'glow', point: screen, radius: Math.min(this.width * 1.5, radius), depth: -point[2], color: this._style(material, 1, -point[2]), alpha: material.opacity ?? 1, additive: true });
  }

  render(scene, camera) {
    if (this.disposed) return;
    scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this.projection = camera.projectionMatrix.elements;
    this.near = camera.near || 0.05;
    this.far = camera.far || 100;
    this.fog = scene.fog;
    this.commands.length = 0;
    scene.traverseVisible(object => {
      if (this.commands.length >= MAX_COMMANDS) return;
      if (object.layers && !object.layers.test(camera.layers)) return;
      this.modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
      if (object.isInstancedMesh) {
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        for (let i = 0; i < object.count && this.commands.length < MAX_COMMANDS; i++) {
          object.getMatrixAt(i, this.instance);
          this.world.multiplyMatrices(object.matrixWorld, this.instance);
          this.modelView.multiplyMatrices(camera.matrixWorldInverse, this.world);
          this.instanceColor.copy(WHITE);
          if (object.instanceColor) object.getColorAt(i, this.instanceColor);
          this._mesh(object.geometry, material, this.modelView, this.instanceColor);
        }
      } else if (object.isMesh) {
        this._mesh(object.geometry, Array.isArray(object.material) ? object.material[0] : object.material, this.modelView);
      } else if (object.isLine) this._lines(object, this.modelView);
      else if (object.isPoints) this._points(object, this.modelView);
      else if (object.isSprite) this._sprite(object, this.modelView);
    });
    this.commands.sort((a, b) => b.depth - a.depth);
    const ctx = this.context;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.width, this.height);
    const background = scene.background?.isColor ? scene.background : this.clearColor;
    const clearAlpha = scene.background?.isColor ? 1 : this.clearAlpha;
    if (clearAlpha > 0) {
      ctx.globalAlpha = clearAlpha;
      ctx.fillStyle = background.getStyle(THREE.SRGBColorSpace);
      ctx.fillRect(0, 0, this.width, this.height);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const command of this.commands) {
      ctx.globalAlpha = Math.min(1, Math.max(0, command.alpha));
      ctx.globalCompositeOperation = command.additive ? 'lighter' : 'source-over';
      ctx.fillStyle = command.color;
      ctx.strokeStyle = command.color;
      if (command.kind === 'face' || command.kind === 'line') {
        ctx.beginPath();
        ctx.moveTo(...command.points[0]);
        for (let i = 1; i < command.points.length; i++) ctx.lineTo(...command.points[i]);
        if (command.kind === 'face') { ctx.closePath(); ctx.fill(); }
        else { ctx.lineWidth = command.width; ctx.stroke(); }
      } else if (command.kind === 'point') {
        ctx.beginPath(); ctx.arc(...command.point, command.radius, 0, Math.PI * 2); ctx.fill();
      } else if (command.kind === 'glow') {
        const [x, y] = command.point;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, command.radius);
        gradient.addColorStop(0, command.color);
        gradient.addColorStop(0.15, command.color);
        gradient.addColorStop(0.45, command.color.replace('rgb(', 'rgba(').replace(')', ',0.15)'));
        gradient.addColorStop(1, command.color.replace('rgb(', 'rgba(').replace(')', ',0)'));
        ctx.fillStyle = gradient;
        ctx.fillRect(x - command.radius, y - command.radius, command.radius * 2, command.radius * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  dispose() {
    this.disposed = true;
    this.setAnimationLoop(null);
    this.commands.length = 0;
    this.geometryCache = new WeakMap();
  }
}
