const VERSION = '0.5.1675471629';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${VERSION}/`;
let engine, loading, queue = Promise.resolve(), receive;
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
export async function loadVision() {
  if (engine) return;
  checkWebGL();
  if (loading) return loading;
  loading = (async () => {
    if (!window.Holistic) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${BASE}holistic.js`; script.crossOrigin = 'anonymous';
      const timer = setTimeout(() => { script.remove(); reject(new Error('Загрузка модели заняла слишком много времени. Проверьте интернет.')); }, 45000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Не удалось загрузить MediaPipe. Проверьте доступ к cdn.jsdelivr.net.')); };
      document.head.append(script);
    });
    const candidate = new window.Holistic({ locateFile: file => BASE + file });
    candidate.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
      refineFaceLandmarks: false, minDetectionConfidence: .5, minTrackingConfidence: .5 });
    candidate.onResults(result => receive?.(result));
    try {
      await withTimeout(candidate.initialize(), 60000, 'Модель не загрузилась за минуту. Проверьте соединение и повторите попытку.');
      engine = candidate;
    } catch (error) {
      try { await candidate.close(); } catch {}
      throw new Error(error.message.includes('минуту') ? error.message : 'Не удалось запустить модель. Попробуйте другой браузер или разбор по готовым координатам.');
    }
  })().catch(error => { loading = null; throw error; });
  return loading;
}
export function detect(image) {
  const operation = queue.catch(() => {}).then(async () => {
    await loadVision();
    let result;
    receive = r => { result = r; };
    try { await engine.send({ image }); } finally { receive = null; }
    if (!result) throw new Error('Модель не вернула результат. Повторите попытку.');
    const points = (values, visibility = false) => values?.map(p => [p.x, p.y, p.z, ...(visibility ? [p.visibility ?? 1] : [])]) ?? null;
    return { pose: points(result.poseLandmarks, true), left: points(result.leftHandLandmarks), right: points(result.rightHandLandmarks) };
  });
  queue = operation;
  return operation;
}
export function resetVision() {
  const operation = queue.catch(() => {}).then(async () => { if (engine) await engine.reset(); });
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
