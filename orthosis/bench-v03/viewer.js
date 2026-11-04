/* Local binary STL viewer. Coordinates in the transfer files are millimetres. */
(() => {
  'use strict';

  function readSTL(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 84) throw Error('Файл короче заголовка STL.');
    const count = view.getUint32(80, true);
    if (!count || count > 500000 || 84 + 50 * count !== view.byteLength) {
      throw Error('Структура двоичного STL не распознана.');
    }
    const vertices = new Float32Array(count * 18); // interleaved positions and face normals
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let face = 0; face < count; face++) {
      const start = face * 18;
      for (let k = 0; k < 9; k++) {
        const v = view.getFloat32(96 + face * 50 + k * 4, true), axis = k % 3;
        if (!Number.isFinite(v)) throw Error('В STL есть некорректные координаты.');
        vertices[start + Math.floor(k / 3) * 6 + axis] = v;
        min[axis] = Math.min(min[axis], v);
        max[axis] = Math.max(max[axis], v);
      }
      const ux = vertices[start+6]-vertices[start], uy = vertices[start+7]-vertices[start+1], uz = vertices[start+8]-vertices[start+2];
      const vx = vertices[start+12]-vertices[start], vy = vertices[start+13]-vertices[start+1], vz = vertices[start+14]-vertices[start+2];
      const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx, length = Math.hypot(nx, ny, nz) || 1;
      for (let j = start + 3; j < start + 18; j += 6) {
        vertices[j] = nx / length; vertices[j+1] = ny / length; vertices[j+2] = nz / length;
      }
    }
    const size = max.map((v, axis) => v - min[axis]);
    const center = min.map((v, axis) => v + size[axis] / 2);
    let radius = 0;
    for (let i = 0; i < vertices.length; i += 6) {
      for (let axis = 0; axis < 3; axis++) vertices[i + axis] -= center[axis];
      radius = Math.max(radius, Math.hypot(vertices[i], vertices[i+1], vertices[i+2]));
    }
    if (!radius) throw Error('В STL отсутствует объёмная геометрия.');
    for (let i = 0; i < vertices.length; i += 6) {
      for (let axis = 0; axis < 3; axis++) vertices[i + axis] /= radius;
    }
    return { vertices, size, count };
  }

  function createGL(gl) {
    const vert = `attribute vec3 position, normal;
      uniform mat3 rotation;
      uniform vec2 scale;
      varying vec3 n;
      void main() {
        vec3 p = rotation * position;
        gl_Position = vec4(p.xy * scale, -p.z * 0.9, 1.0);
        n = rotation * normal;
      }`;
    const frag = `precision mediump float;
      varying vec3 n;
      void main() {
        vec3 face = normalize(n);
        if (face.z < 0.0) face = -face;
        float light = max(dot(face, vec3(-0.45, 0.65, 0.61)), 0.0);
        gl_FragColor = vec4(mix(vec3(0.10, 0.24, 0.25), vec3(0.47, 0.75, 0.69), light), 1.0);
      }`;
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('Ошибка шейдера.');
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Ошибка программы WebGL.');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, offset] of [['position', 0], ['normal', 12]]) {
      const loc = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 24, offset);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(.925, .95, .935, 1);
    const rotation = gl.getUniformLocation(program, 'rotation'), scale = gl.getUniformLocation(program, 'scale');
    return {
      upload(mesh) { if (mesh) gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW); },
      draw(mesh, matrix, x, y, w, h) {
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (!mesh) return;
        gl.uniformMatrix3fv(rotation, false, matrix);
        gl.uniform2f(scale, x, y);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count * 3);
      }
    };
  }

  // A real projection of the mesh also works on devices with WebGL disabled.
  function create2D(ctx) {
    return {
      upload() {},
      draw(mesh, m, sx, sy, w, h) {
        ctx.fillStyle = '#ecf2ee'; ctx.fillRect(0, 0, w, h);
        if (!mesh) return;
        const v = mesh.vertices, triangles = [];
        for (let i = 0; i < v.length; i += 18) {
          const xy = [], dot = (index, axis) => v[index]*m[axis] + v[index+1]*m[axis+3] + v[index+2]*m[axis+6];
          let depth = 0;
          for (let j = i; j < i + 18; j += 6) {
            xy.push((1 + sx*dot(j,0))*w/2, (1 - sy*dot(j,1))*h/2);
            depth += dot(j,2);
          }
          const direction = dot(i+3,2) < 0 ? -1 : 1;
          const light = Math.max(0, direction*(-.45*dot(i+3,0) + .65*dot(i+3,1) + .61*dot(i+3,2)));
          triangles.push({ xy, depth, light });
        }
        triangles.sort((a, b) => a.depth - b.depth);
        for (const { xy, light } of triangles) {
          ctx.fillStyle = 'rgb(' + [26+94*light, 61+130*light, 64+112*light].map(Math.round).join(',') + ')';
          ctx.beginPath(); ctx.moveTo(xy[0], xy[1]); ctx.lineTo(xy[2], xy[3]); ctx.lineTo(xy[4], xy[5]); ctx.closePath(); ctx.fill();
        }
      }
    };
  }

  function init() {
    const byId = id => document.getElementById('part-' + id);
    const canvas = byId('canvas'), select = byId('select'), status = byId('status');
    if (!canvas || !select || !status) return;
    const buttons = [byId('reset'), byId('zoom-in'), byId('zoom-out')];
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + - Home');
    if (!canvas.hasAttribute('aria-label')) canvas.setAttribute('aria-label', 'Трёхмерная деталь. Стрелки вращают, плюс и минус меняют масштаб, Home возвращает исходный вид.');
    let gl;
    try { gl = canvas.getContext('webgl', { alpha: false, antialias: true }); } catch {}
    let renderer, flat = false;
    try {
      if (gl) renderer = createGL(gl);
      else { const ctx = canvas.getContext('2d'); if (ctx) { renderer = create2D(ctx); flat = true; } }
    } catch {}
    if (!renderer) {
      status.textContent = 'Просмотр недоступен в этом браузере. STL можно открыть в слайсере.';
      for (const btn of buttons) if (btn) btn.disabled = true;
      return;
    }

    let mesh = null, yaw, pitch, zoom, frame = 0, controller, sequence = 0, lost = false;
    const pointers = new Map(), clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    function draw() {
      frame = 0;
      if (lost) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * pixelRatio), h = Math.round(canvas.clientHeight * pixelRatio);
      if (!w || !h) return;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const c = Math.cos(yaw), s = Math.sin(yaw), ce = Math.cos(pitch), se = Math.sin(pitch);
      const matrix = new Float32Array([c,s*se,-s*ce, -s,c*se,-c*ce, 0,ce,se]);
      const fit = .88 * zoom * Math.min(w,h);
      renderer.draw(mesh, matrix, fit / w, fit / h, w, h);
    }
    function redraw() { if (!frame) frame = requestAnimationFrame(draw); }
    function reset() { yaw = -.61; pitch = .54; zoom = 1; redraw(); }
    function scale(by) { zoom = clamp(zoom * by, .35, 5); redraw(); }
    function rotate(dx, dy) { yaw += dx; pitch = clamp(pitch + dy, -Math.PI/2, Math.PI/2); redraw(); }
    function describe() {
      const mm = mesh.size.map(v => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })).join(' × ');
      status.textContent = select.selectedOptions[0].text + ' · ' + mm + ' мм по X, Y, Z' + (flat ? ' · Проекция STL без WebGL.' : '.');
    }
    async function load() {
      const current = ++sequence;
      if (controller) controller.abort();
      controller = new AbortController();
      mesh = null; reset();
      for (const btn of buttons) if (btn) btn.disabled = true;
      status.textContent = 'Загрузка STL…';
      try {
        const response = await fetch(select.value, { signal: controller.signal });
        if (!response.ok) throw Error('Файл STL не загрузился.');
        const bytes = await response.arrayBuffer();
        if (current !== sequence) return;
        mesh = readSTL(bytes);
        if (!lost) { renderer.upload(mesh); describe(); }
        for (const btn of buttons) if (btn) btn.disabled = lost;
        redraw();
      } catch (error) {
        if (current !== sequence) return;
        mesh = null; status.textContent = 'Просмотр недоступен. ' + error.message; redraw();
      }
    }
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); lost = true;
      status.textContent = '3D-просмотр приостановлен браузером.';
      for (const btn of buttons) if (btn) btn.disabled = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        renderer = createGL(gl); renderer.upload(mesh); lost = false;
        if (mesh) { describe(); for (const btn of buttons) if (btn) btn.disabled = false; }
        redraw();
      } catch { status.textContent = 'Не удалось восстановить 3D-просмотр. Обновите страницу.'; }
    });
    select.addEventListener('change', load);
    for (const [i, fn] of [reset, () => scale(1.2), () => scale(1/1.2)].entries()) {
      if (buttons[i]) buttons[i].addEventListener('click', fn);
    }
    canvas.addEventListener('keydown', e => {
      if (!mesh || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowLeft': rotate(-.12, 0); break;
        case 'ArrowRight': rotate(.12, 0); break;
        case 'ArrowUp': rotate(0, .12); break;
        case 'ArrowDown': rotate(0, -.12); break;
        case '+': case '=': scale(1.2); break;
        case '-': scale(1/1.2); break;
        case 'Home': reset(); break;
        default: return;
      }
      e.preventDefault();
    });
    canvas.addEventListener('wheel', e => {
      if (!mesh || document.activeElement !== canvas) return;
      e.preventDefault(); scale(Math.exp(-clamp(e.deltaY, -100, 100)*.002));
    }, { passive: false });
    const gap = () => { const [a,b] = pointers.values(); return Math.hypot(a[0]-b[0],a[1]-b[1]); };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !mesh || pointers.size >= 2) return;
      canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
    });
    canvas.addEventListener('pointermove', e => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      const before = pointers.size === 2 ? gap() : 0;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) rotate((e.clientX-last[0])*.009, (e.clientY-last[1])*.009);
      else if (before >= 2 && gap() >= 2) scale(gap()/before);
    });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) {
      canvas.addEventListener(name, e => pointers.delete(e.pointerId));
    }
    if (window.ResizeObserver) new ResizeObserver(redraw).observe(canvas);
    else window.addEventListener('resize', redraw);
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
