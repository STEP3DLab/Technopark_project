"use strict";
const byId = id => document.getElementById(id);
const format = (number, digits) => number.toLocaleString("ru-RU", {minimumFractionDigits: digits, maximumFractionDigits: digits});
const motorR = 12, jointR = 31.5;
const cablePaths = document.querySelectorAll("#motion-figure path[stroke-width='4']");
const railLengths = Array.from(cablePaths, p => p.getTotalLength());
const angleInput = byId("angle"), play = byId("play");
let angle = Number(angleInput.value), running = false, direction = 1, previousTime = 0, frameId = 0;
function draw(value) {
  angle = Math.min(120, Math.max(0, value));
  const degrees = Math.round(angle);
  const travel = jointR * angle * Math.PI / 180;
  angleInput.value = degrees;
  angleInput.setAttribute("aria-valuetext", degrees + "°");
  byId("angle-value").textContent = degrees + "°";
  byId("travel").textContent = format(travel, 2) + " мм";
  byId("turns").textContent = format((angle / 360) * (jointR / motorR), 3);
  byId("joint").setAttribute("transform", "rotate(" + (-angle) + " 355 112)");
  byId("spool").setAttribute("transform", "rotate(" + (-angle * jointR / motorR) + " 105 112)");
  for (const [i, id] of ["marker-a", "marker-b"].entries()) {
    // Identical linear travel in the two branches, with opposite signs.
    const distance = i === 0 ? railLengths[i] * .74 - travel * 1.5 : railLengths[i] * .26 + travel * 1.5;
    const point = cablePaths[i].getPointAtLength(distance);
    byId(id).setAttribute("transform", "translate(" + point.x + " " + point.y + ")");
  }
}
function tick(time) {
  if (!running) return;
  if (previousTime) {
    let next = angle + direction * Math.min(time - previousTime, 100) * (360 * motorR / jointR * 10 / 60000);
    if (next >= 120 || next <= 0) {
      next = next >= 120 ? 240 - next : -next;
      direction *= -1;
    }
    draw(next);
  }
  previousTime = time;
  frameId = requestAnimationFrame(tick);
}
function setPlaying(next) {
  cancelAnimationFrame(frameId);
  running = next;
  previousTime = 0;
  play.setAttribute("aria-pressed", String(next));
  play.textContent = next ? "Ⅱ Пауза" : "▶ Запустить цикл";
  if (next) {
    if (angle === 120) direction = -1;
    if (angle === 0) direction = 1;
    frameId = requestAnimationFrame(tick);
  }
}
angleInput.addEventListener("input", () => { setPlaying(false); draw(Number(angleInput.value)); });
play.addEventListener("click", () => setPlaying(!running));
byId("zero").addEventListener("click", () => { setPlaying(false); direction = 1; draw(0); });
document.querySelector(".hero a[href='#motion']").addEventListener("click", () => setPlaying(true));
document.addEventListener("visibilitychange", () => { if (document.hidden) setPlaying(false); });
draw(angle);

const log = byId("log"), csv = byId("csv"), key = "orthosis-bench-v03-measurements-v1";
let rows = [], persistent = true;
function checkedRow(r) {
  return r && ["Сгибание", "Разгибание"].includes(r.branch) && typeof r.date === "string" &&
    [r.wind, r.start, r.end].every(Number.isFinite);
}
try {
  const saved = JSON.parse(localStorage.getItem(key) || "[]");
  if (Array.isArray(saved)) rows = saved.filter(checkedRow);
} catch { persistent = false; }
const predicted = r => r.wind * .8;
const actual = r => r.end - r.start;
function updateHistory() {
  csv.disabled = !rows.length;
  const list = byId("entries");
  list.replaceChildren();
  for (const r of rows.slice(-3).reverse()) {
    const item = document.createElement("li");
    item.textContent = r.branch + " · ход " + format(actual(r), 2) + " мм · отклонение " + format(actual(r) - predicted(r), 2) + " мм";
    list.appendChild(item);
  }
  byId("log-status").textContent = (rows.length ? "Замеров в журнале — " + rows.length + ". " : "") +
    (persistent ? "Записи хранятся в этом браузере." : "Хранение в браузере недоступно. Скачайте CSV до закрытия вкладки.");
}
log.elements.wind.addEventListener("input", () => {
  const wind = log.elements.wind.valueAsNumber;
  byId("expected").textContent = Number.isFinite(wind) && wind >= 0 && wind <= 10 ? format(wind * .8, 2) + " мм" : "—";
});
log.addEventListener("submit", event => {
  event.preventDefault();
  const e = log.elements;
  const row = {date: new Date().toISOString(), branch: e.branch.value, wind: e.wind.valueAsNumber, start: e.start.valueAsNumber, end: e.end.valueAsNumber};
  if (!checkedRow(row) || !log.reportValidity()) return;
  rows.push(row);
  try { localStorage.setItem(key, JSON.stringify(rows)); persistent = true; } catch { persistent = false; }
  updateHistory();
  e.start.value = ""; e.end.value = ""; e.start.focus();
});
csv.addEventListener("click", () => {
  const header = ["Дата UTC","Ветвь","Обороты M5","Начало, мм","Конец, мм","Ожидаемый ход, мм","Измеренный ход, мм","Отклонение, мм"];
  const values = rows.map(r => [r.date, r.branch, ...[r.wind,r.start,r.end,predicted(r),actual(r),actual(r)-predicted(r)].map(n => n.toFixed(2).replace(".", ","))]);
  const url = URL.createObjectURL(new Blob(["\uFEFF" + [header,...values].map(a => a.join(";")).join("\r\n")], {type:"text/csv;charset=utf-8"}));
  const a = document.createElement("a"); a.href = url; a.download = "Orthosis_V03_measurements.csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
});
updateHistory();
