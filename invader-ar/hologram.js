// One indexed-free draw builds the shell, recessed optics and individual armor tiles.
const PALETTES = {
  violet: [[0.11, 0.026, 0.29], [0.54, 0.23, 0.99], [0.91, 0.77, 1.00], [0.24, 0.99, 1.00]],
  cyan:   [[0.015, 0.11, 0.21], [0.06, 0.68, 0.88], [0.61, 1.00, 0.97], [0.98, 0.81, 0.30]],
  amber:  [[0.26, 0.052, 0.09], [0.97, 0.43, 0.075], [1.00, 0.91, 0.55], [0.61, 1.00, 0.86]]
};

function makeShell(mask) {
  const rows = mask.length;
  const cols = Math.max(...mask.map(row => row.length));
  const pitch = 1 / cols;
  const data = [];
  const ink = (x, y) => mask[y]?.[x] === '1' || mask[y]?.[x] === 1;

  // Rings run counter-clockwise as seen from in front of the faceplate.
  function ring(cx, cy, hw, hh, cut, z) {
    return [[-hw + cut,-hh], [hw - cut,-hh], [hw,-hh + cut], [hw,hh - cut],
      [hw - cut,hh], [-hw + cut,hh], [-hw,hh - cut], [-hw,-hh + cut]]
      .map(([x, y]) => [cx + x, cy + y, z]);
  }
  function brick(cx, cy, halfWidth, halfHeight, front, back, seed, material = 0) {
    const size = Math.min(halfWidth, halfHeight);
    const inset = size * (material === 0 ? 0.145 : 0.115);
    const cut = size * 0.105;
    const bevel = Math.min(front - back, inset * 3) * 0.31;
    const center = [cx, cy, (front + back) * 0.5];
    const frontPlane = ring(cx, cy, halfWidth - inset, halfHeight - inset, cut, front);
    const upperEdge = ring(cx, cy, halfWidth, halfHeight, cut * 1.65, front - bevel);
    const lowerEdge = ring(cx, cy, halfWidth, halfHeight, cut * 1.65, back + bevel);
    const backPlane = ring(cx, cy, halfWidth - inset, halfHeight - inset, cut, back);
    function face(points, surface) {
      const [a, b, c] = points;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      for (let i = 1; i < points.length - 1; ++i) {
        for (const p of [a, points[i], points[i + 1]]) {
          data.push(...p, nx / len, ny / len, nz / len, ...center, seed, material, surface);
        }
      }
    }
    face(frontPlane, 1);
    face([...backPlane].reverse(), 1);
    function join(top, bottom, surface) {
      for (let i = 0; i < 8; ++i) {
        const j = (i + 1) % 8;
        face([top[i], bottom[i], bottom[j], top[j]], surface);
      }
    }
    join(frontPlane, upperEdge, 2);
    join(upperEdge, lowerEdge, 0);
    join(lowerEdge, backPlane, 2);
  }

  for (let row = 0; row < rows; ++row) {
    for (let col = 0; col < cols; ++col) {
      const x = (col + 0.5 - cols * 0.5) * pitch;
      const y = (rows * 0.5 - row - 0.5) * pitch;
      const seedValue = Math.sin((col + 1) * 91.3 + (row + 1) * 17.1) * 43758.55;
      const seed = seedValue - Math.floor(seedValue);
      if (ink(col, row)) {
        const adjacent = [ink(col-1, row), ink(col+1, row), ink(col, row+1), ink(col, row-1)]
          .filter(Boolean).length;
        const thick = 0.68 + 0.07 * adjacent;
        const front = (thick + (seed - 0.5) * 0.095) * pitch;
        brick(x, y, pitch * 0.498, pitch * 0.498, front, -pitch * (thick - 0.16), seed);
      } else if (ink(col-1, row) && ink(col+1, row) && ink(col, row-1) && ink(col, row+1)) {
        // Lens in the dark recess, only for enclosed single-pixel eye sockets.
        brick(x, y, pitch * 0.496, pitch * 0.496, -pitch * 0.035, -pitch * 0.60, seed, 1);
        brick(x, y, pitch * 0.272, pitch * 0.218, pitch * 0.185, 0, seed, 2);
      }
    }
  }
  return new Float32Array(data);
}

function shaderSources(gl) {
  const modern = typeof gl.createVertexArray === 'function';
  const version = modern ? '#version 300 es\n' : '';
  const input = modern ? 'in' : 'attribute';
  const vertexVarying = modern ? 'out' : 'varying';
  const fragmentVarying = modern ? 'in' : 'varying';
  const shared = `
    vec3 randomDirection(float s) {
      return vec3(sin(s*28.0), cos(s*34.0), sin(s*13.0+1.0));
    }
  `;
  const vertex = version + `
    precision highp float;
    ${input} vec3 aPosition, aNormal, aCenter, aInfo;
    uniform mat4 uMVP;
    uniform float uReveal;
    ${vertexVarying} vec3 vNormal, vPosition, vInfo, vLocal;
    ${vertexVarying} float vFormation;
    ${shared}
    void main() {
      float s = aInfo.x;
      float order = clamp(0.47*s + 0.24*(aCenter.y + 0.45) + 0.05, 0.0, 0.65);
      float formed = smoothstep(order, min(order+0.34, 1.0), uReveal);
      float open = 1.0-formed;
      vec3 axis = normalize(randomDirection(s)+vec3(0.011, 0.021, 0.031));
      float angle = open * (1.25+3.0*s);
      vec3 local = aPosition-aCenter;
      vec3 rotated = local*cos(angle) + cross(axis,local)*sin(angle) + axis*dot(axis,local)*(1.0-cos(angle));
      vec3 p = aCenter + rotated*mix(0.05,1.0,formed);
      p += open*open*(aCenter*vec3(0.58,0.56,0.0) + axis*0.35 + vec3(0.0,0.12,0.22));
      vNormal = aNormal*cos(angle) + cross(axis,aNormal)*sin(angle) + axis*dot(axis,aNormal)*(1.0-cos(angle));
      vPosition = aPosition;
      vLocal = local;
      vInfo = aInfo;
      vFormation = formed;
      gl_Position = uMVP*vec4(p,1.0);
    }
  `;
  const fragment = version + `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    ${fragmentVarying} vec3 vNormal, vPosition, vInfo, vLocal;
    ${fragmentVarying} float vFormation;
    uniform vec3 uLow, uMain, uPearl, uEye;
    uniform vec3 uRight, uUp, uView;
    uniform float uTime, uPulse, uColumns;
    ${modern ? 'out vec4 fragColor;' : ''}
    void main() {
      if (vFormation<0.015) discard;
      vec3 n = normalize(vNormal);
      if (vInfo.z>0.5 && vInfo.z<1.5) {
        vec2 curvature = vLocal.xy*uColumns*(0.18+vInfo.x*0.065);
        n = normalize(n+vec3(curvature,0.0));
      }
      vec3 viewDir = normalize(uView);
      vec3 light = normalize(-0.45*uRight + 0.82*uUp + 0.77*viewDir);
      float diffuse = max(dot(n,light),0.0);
      float facing = abs(dot(n,viewDir));
      vec3 reflected = reflect(-viewDir,n);
      float seed = vInfo.x;
      float height = vPosition.y + 0.35;
      float broad = clamp(0.19 + diffuse*0.49 + height*0.15 + (seed-0.5)*0.21,0.0,1.0);
      vec3 c = mix(uLow,uMain,broad);
      // Two virtual softboxes read as reflections across the continuous polished shell.
      float travel = 0.04*sin(uTime*0.27);
      float ribbon = dot(reflected,normalize(0.86*uUp-0.57*uRight))
                   + 0.37*vPosition.x - 0.58*vPosition.y + travel;
      float stripe = 1.0-smoothstep(0.04,0.19,abs(ribbon-0.14));
      float highlight = 1.0-smoothstep(0.03,0.34,abs(ribbon+0.68));
      c += uPearl*(stripe*0.28 + highlight*0.13);
      float envLine = (vPosition.x + 0.77*vPosition.y)*1.65
                    + dot(n, uRight)*0.47 - dot(n,uUp)*0.59 + travel;
      float softbox = 1.0-smoothstep(0.005,0.11,abs(envLine+0.38));
      float narrow = 1.0-smoothstep(0.012,0.035,abs(envLine+0.52));
      float reflection = 0.62*softbox + 0.13*narrow;
      c = mix(c, uPearl, reflection);
      // An unlit environmental strip deepens the right facet of the glass.
      c *= 0.80 + 0.20*smoothstep(0.025,0.17,abs(envLine-0.24));
      vec3 halfVec = normalize(light+viewDir);
      c += uPearl*0.37*pow(max(dot(n,halfVec),0.0),20.0);
      float rim = pow(1.0-facing,3.0);
      c += uMain*rim*0.23;
      if (vInfo.z>1.5) {
        c = mix(c,uPearl,0.13 + 0.25*diffuse);
        float glint = pow(max(dot(n,normalize(-0.50*uRight+0.74*uUp+0.84*viewDir)),0.0),9.0);
        c = mix(c,mix(uPearl,uEye,0.26),0.3*glint);
      } else if (vInfo.z<0.5) {
        float depthLine = 1.0-smoothstep(0.005,0.055,abs(vPosition.z*uColumns+0.20));
        c *= 0.67;
        c += uMain*depthLine*0.22;
        float conductor = 1.0-smoothstep(0.015,0.053,abs(vPosition.z*uColumns-0.33));
        c = mix(c,mix(uMain,uEye,0.33),0.44*conductor);
      } else {
        float edge = max(abs(vLocal.x),abs(vLocal.y))*uColumns;
        float border = smoothstep(0.35,0.385,edge);
        c = mix(c,c*0.87,border);
        float facet = smoothstep(-0.16,0.13,(vLocal.x-vLocal.y)*uColumns+seed*0.21);
        c += uMain*(facet-0.5)*0.066;
      }
      if (vInfo.y>0.5 && vInfo.y<1.5) {
        float lensGlow = 1.0-smoothstep(0.22,0.58,length(vLocal.xy*uColumns));
        c = uLow*0.24 + uEye*0.095*lensGlow;
      } else if (vInfo.y>1.5) {
        float core = 1.0-smoothstep(0.0,0.28,length(vLocal.xy*uColumns));
        c = mix(uEye*0.74,vec3(0.93,1.0,1.0),0.16+0.29*diffuse+core*0.51);
      }
      float scan = 1.0 - smoothstep(0.015,0.085,abs(fract(vPosition.y*0.84-uTime*0.81)-0.47));
      c += (uPearl*0.25 + vec3(0.26))*scan*uPulse;
      c = mix(c, uPearl, (1.0-vFormation)*0.6);
      ${modern ? 'fragColor' : 'gl_FragColor'} = vec4(clamp(c,0.0,1.0),1.0);
    }
  `;
  return {vertex, fragment};
}

function buildProgram(gl) {
  const code = shaderSources(gl);
  const shaders = [];
  const program = gl.createProgram();
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, code.vertex], [gl.FRAGMENT_SHADER, code.fragment]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

const normalized = (x, y, z) => {
  const scale = 1 / (Math.hypot(x,y,z) || 1);
  return [x*scale,y*scale,z*scale];
};

export function createHologram(gl, mask) {
  if (!mask || !mask.length || !mask[0].length) throw Error('Пустая маска модели');
  const program = buildProgram(gl);
  const geometry = makeShell(mask);
  const columns = Math.max(...mask.map(row => row.length));
  const buffer = gl.createBuffer();
  const attributes = ['aPosition','aNormal','aCenter','aInfo'].map(n => gl.getAttribLocation(program,n));
  const uniforms = {};
  for (const name of ['MVP','Reveal','Low','Main','Pearl','Eye','Right','Up','View','Time','Pulse','Columns']) {
    uniforms[name] = gl.getUniformLocation(program,'u'+name);
  }
  const vao = typeof gl.createVertexArray === 'function' ? gl.createVertexArray() : null;
  function bindLayout() {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    attributes.forEach((location,i) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 48, i*12);
    });
  }
  if (vao) gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
  if (vao) {
    bindLayout();
    gl.bindVertexArray(null);
  }
  return {
    draw(mvp, time = 0, options = {}) {
      const reveal = options.reveal ?? 1;
      if (!(reveal > 0)) return;
      const colors = PALETTES[options.color] || PALETTES.violet;
      const right = normalized(mvp[0],mvp[4],mvp[8]);
      const up = normalized(mvp[1],mvp[5],mvp[9]);
      const view = normalized(right[1]*up[2]-right[2]*up[1], right[2]*up[0]-right[0]*up[2], right[0]*up[1]-right[1]*up[0]);
      gl.useProgram(program);
      if (vao) gl.bindVertexArray(vao);
      else bindLayout();
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.uniformMatrix4fv(uniforms.MVP,false,mvp);
      gl.uniform1f(uniforms.Time,time%3600);
      gl.uniform1f(uniforms.Reveal,Math.min(reveal,1));
      gl.uniform1f(uniforms.Pulse,Math.max(0,Math.min(1,options.pulse || 0)));
      gl.uniform1f(uniforms.Columns,columns);
      gl.uniform3fv(uniforms.Right,right);
      gl.uniform3fv(uniforms.Up,up);
      gl.uniform3fv(uniforms.View,view);
      gl.uniform3fv(uniforms.Low,colors[0]);
      gl.uniform3fv(uniforms.Main,colors[1]);
      gl.uniform3fv(uniforms.Pearl,colors[2]);
      gl.uniform3fv(uniforms.Eye,colors[3]);
      gl.drawArrays(gl.TRIANGLES,0,geometry.length/12);
      if (vao) gl.bindVertexArray(null);
      else attributes.forEach(location => gl.disableVertexAttribArray(location));
    },
    dispose() {
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    }
  };
}
