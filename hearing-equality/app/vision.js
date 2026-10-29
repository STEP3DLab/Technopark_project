const VERSION = '0.5.1675471629';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${VERSION}/`;
// Each model owns its callback. A timed-out model may still finish in WASM;
// retiring it prevents late results from becoming a newer capture's result.
let engine, loading, scriptLoading, holisticConstructor, queue = Promise.resolve();
let webglChecked = false;
function checkWebGL() {
  if (webglChecked) return;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) throw new Error('В этом браузере недоступен WebGL. Попробуйте другой браузер или включите аппаратное ускорение. Для встроенного видео доступен разбор по готовым координатам.');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  webglChecked = true;
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
function retire(record) {
  if (!record || record.retired) return;
  record.retired = true;
  record.receive = null;
  if (engine === record) engine = null;
  // Never await cleanup: close() can also stall after a lost WebGL context.
  // The retired callback remains inert even if this promise completes later.
  try { Promise.resolve(record.instance.close()).catch(() => {}); } catch {}
}
function loadConstructor() {
  if (holisticConstructor) return Promise.resolve(holisticConstructor);
  if (typeof window.Holistic === 'function') {
    holisticConstructor = window.Holistic;
    return Promise.resolve(holisticConstructor);
  }
  if (scriptLoading) return scriptLoading;
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${BASE}holistic.js`; script.crossOrigin = 'anonymous';
    let settled = false, timer;
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else { holisticConstructor = window.Holistic; resolve(holisticConstructor); }
    };
    timer = setTimeout(() => finish(new Error('Загрузка модели заняла слишком много времени. Проверьте интернет.')), 45000);
    script.onload = () => finish(typeof window.Holistic === 'function' ? null : new Error('Компонент MediaPipe не запустился. Повторите загрузку.'));
    script.onerror = () => finish(new Error('Не удалось загрузить MediaPipe. Проверьте доступ к cdn.jsdelivr.net.'));
    try { document.head.append(script); } catch (error) { finish(error); }
  });
  const job = pending.finally(() => { if (scriptLoading === job) scriptLoading = null; });
  scriptLoading = job;
  return job;
}
export async function loadVision() {
  if (engine) return;
  checkWebGL();
  if (loading) return loading;
  const job = (async () => {
    const Holistic = await loadConstructor();
    let record;
    try {
      const candidate = new Holistic({ locateFile: file => BASE + file });
      record = { instance: candidate, receive: null, retired: false };
      candidate.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
        refineFaceLandmarks: false, minDetectionConfidence: .5, minTrackingConfidence: .5 });
      candidate.onResults(result => {
        if (!record.retired && engine === record) record.receive?.(result);
      });
      await withTimeout(Promise.resolve().then(() => candidate.initialize()), 60000, 'Модель не загрузилась за минуту. Проверьте соединение и повторите попытку.');
      engine = record;
    } catch (error) {
      retire(record);
      throw new Error(String(error?.message).includes('минуту') ? error.message : 'Не удалось запустить модель. Попробуйте другой браузер или разбор по готовым координатам.');
    }
  })().finally(() => { if (loading === job) loading = null; });
  loading = job;
  return job;
}
export function detect(image) {
  const operation = queue.catch(() => {}).then(async () => {
    await loadVision();
    const record = engine;
    let result;
    record.receive = r => { result = r; };
    try {
      await withTimeout(Promise.resolve().then(() => record.instance.send({ image })), 15000,
        'Обработка кадра остановилась. Выключите и включите камеру или повторите анализ видео.');
      if (!result) throw new Error('Модель не вернула результат. Повторите попытку.');
    } catch (error) { retire(record); throw error; }
    finally { record.receive = null; }
    const points = (values, visibility = false) => values?.map(p => [p.x, p.y, p.z, ...(visibility ? [p.visibility ?? 1] : [])]) ?? null;
    return { pose: points(result.poseLandmarks, true), left: points(result.leftHandLandmarks), right: points(result.rightHandLandmarks) };
  });
  queue = operation;
  return operation;
}
export function resetVision() {
  const operation = queue.catch(() => {}).then(async () => {
    const record = engine;
    if (!record) return;
    try {
      await withTimeout(Promise.resolve().then(() => record.instance.reset()), 8000,
        'Не удалось подготовить модель к новой записи. Повторите запуск камеры или видео.');
    } catch (error) { retire(record); throw error; }
  });
  queue = operation;
  return operation;
}
export function drawLandmarks(canvas, frame, width, height) {
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,width,height);
  const lines = (points, edges, color) => {
    if (!points) return;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, width / 260);
    for (const [a,b] of edges) if (points[a] && points[b]) {
      ctx.beginPath(); ctx.moveTo(points[a][0]*width, points[a][1]*height); ctx.lineTo(points[b][0]*width, points[b][1]*height); ctx.stroke();
    }
    for (const p of points) if (p && (p[3] ?? 1) > .4) { ctx.beginPath(); ctx.arc(p[0]*width,p[1]*height,Math.max(2,width/220),0,Math.PI*2); ctx.fill(); }
  };
  lines(frame.pose, [[11,12],[11,13],[13,15],[12,14],[14,16]], '#b5a7ff');
  const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  lines(frame.left,edges,'#77f0cb'); lines(frame.right,edges,'#ffcf7a');
}

