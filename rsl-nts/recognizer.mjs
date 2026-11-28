// Shared by the web client and the reproducible evaluation.
const SAMPLE_COUNT = 16;
const tipAndJoint = [1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 19, 20];
const FEATURE_COUNT = 4 * (2 * (1 + 2 + 3 * tipAndJoint.length) + 2);
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
const distance = (a, b) => Math.hypot(...a.map((x,i) => x-b[i]));

function validateClip(clip) {
  if (!clip || !Array.isArray(clip.frames) || clip.frames.length !== SAMPLE_COUNT) {
    throw new TypeError('Для распознавания требуется массив из 16 кадров.');
  }
  if (!Number.isFinite(clip.aspect) || clip.aspect <= 0) {
    throw new TypeError('Некорректное соотношение сторон видео.');
  }
  for (const frame of clip.frames) {
    if (!Array.isArray(frame) || frame.length > 2) {
      throw new TypeError('Кадр должен содержать координаты не более двух рук.');
    }
    for (const hand of frame) {
      if (!hand || !['Left', 'Right'].includes(hand.side) ||
          !Array.isArray(hand.landmarks) || hand.landmarks.length !== 21) {
        throw new TypeError('Для каждой руки нужны её сторона и 21 точка.');
      }
      for (const point of hand.landmarks) {
        if (!Array.isArray(point) || point.length !== 3 ||
            !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
            !Number.isFinite(point[2])) {
          throw new TypeError('Координаты руки должны быть конечными числами x, y, z.');
        }
      }
    }
  }
}

function validateModel(model) {
  const invalid = () => { throw new TypeError('Некорректные параметры модели распознавания.'); };
  if (!model || !Array.isArray(model.words) || model.words.length < 2 ||
      !Array.isArray(model.weights) || model.weights.length !== model.words.length ||
      !Array.isArray(model.bias) || model.bias.length !== model.words.length ||
      !Number.isFinite(model.threshold) || model.threshold < 0 || model.threshold > 1 ||
      !Number.isInteger(model.minFrames) || model.minFrames < 1 || model.minFrames > SAMPLE_COUNT) {
    invalid();
  }
  const words = new Set();
  for (const word of model.words) {
    if (typeof word !== 'string' || !word.trim() || words.has(word)) invalid();
    words.add(word);
  }
  for (const row of model.weights) {
    if (!Array.isArray(row) || row.length !== FEATURE_COUNT) invalid();
    for (const weight of row) if (!Number.isFinite(weight)) invalid();
  }
  for (const bias of model.bias) if (!Number.isFinite(bias)) invalid();
}

function splitHands(frame) {
  const result = {Left: null, Right: null};
  for (const hand of frame) {
    let side = hand.side === 'Left' ? 'Left' : 'Right';
    if (result[side]) side = side === 'Left' ? 'Right' : 'Left';
    if (!result[side]) result[side] = hand.landmarks;
  }
  return result;
}
function mostVisible(tracks) {
  const count = side => tracks.filter(f => f[side]).length;
  return count('Left') > count('Right') + 1 ? 'Left' : 'Right';
}
function nearestFrame(tracks, index, side) {
  if (tracks[index][side]) return tracks[index][side];
  for (let offset = 1; offset < tracks.length; offset++) {
    const candidate = tracks[index-offset]?.[side] || tracks[index+offset]?.[side];
    if (candidate) return candidate;
  }
  return null;
}
function frameFeatures(tracks, idx, primary, aspect) {
  const result = [], wrists = [];
  const mirror = primary === 'Left' ? -1 : 1;
  for (const side of [primary, primary === 'Left' ? 'Right' : 'Left']) {
    const hand = nearestFrame(tracks, idx, side);
    result.push(tracks[idx][side] ? 1 : 0);
    if (!hand) {
      result.push(...Array(2 + 3*tipAndJoint.length).fill(0));
      wrists.push(null);
      continue;
    }
    const xyz = hand.map(p=>[(p[0]-.5)*aspect*mirror,p[1]-.5,p[2]*aspect]);
    const w = xyz[0];
    const palm = Math.max(.014, [5,9,13,17].reduce((n,k) => n+distance(xyz[k],w),0)/4);
    wrists.push(w);
    result.push(w[0],w[1]);
    for (const k of tipAndJoint) {
      for (let d=0;d<3;d++) result.push(clamp((xyz[k][d]-w[d])/palm,2.8));
    }
  }
  const [a,b] = wrists;
  result.push(a&&b ? a[0]-b[0] : 0,a&&b ? a[1]-b[1] : 0);
  return result;
}
export function describe(clip) {
  validateClip(clip);
  const tracks=clip.frames.map(splitHands);
  const valid=tracks.filter(frame => frame.Left || frame.Right).length;
  const side=mostVisible(tracks);
  const perFrame=tracks.map((_,i) => frameFeatures(tracks,i,side,clip.aspect));
  // Average nearby observations to reduce jitter while preserving gesture order.
  const features=[];
  for (let start=0;start<SAMPLE_COUNT;start+=4) {
    for (let k=0;k<perFrame[0].length;k++) {
      features.push(perFrame.slice(start,start+4).reduce((sum,f)=>sum+f[k],0)/4);
    }
  }
  if (features.length !== FEATURE_COUNT || !features.every(Number.isFinite)) {
    throw new TypeError('Координаты видео не удалось преобразовать в признаки модели.');
  }
  return {features,valid};
}
export function classify(clip, model) {
  validateModel(model);
  const {features,valid}=describe(clip);
  const scores=model.weights.map((w,k)=>w.reduce((v,a,j)=>v+a*features[j],model.bias[k]));
  if (!scores.every(Number.isFinite)) {
    throw new TypeError('Не удалось вычислить конечные оценки модели.');
  }
  const hi=Math.max(...scores);
  const denominator=scores.reduce((a,v)=>a+Math.exp(v-hi),0);
  const result=scores.map((s,k)=>({word:model.words[k],score:Math.exp(s-hi)/denominator})).sort((a,b)=>b.score-a.score);
  return {word:result[0].word,score:result[0].score,valid,
    accepted:valid>=model.minFrames && result[0].score>=model.threshold,alternatives:result.slice(0,3)};
}
