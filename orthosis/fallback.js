/* The CAD strip and catalogue work before (or without) the Three.js module. */
(() => {
  const $ = id => document.getElementById(id);
  const stage = $("viewport").closest(".stage");
  const listeners = new AbortController();
  const listen = (el, name, fn) => el.addEventListener(name, fn, {signal: listeners.signal});
  const all = selector => [...document.querySelectorAll(selector)];
  const presets = all("[data-a]"), filters = all("#filters [data-f]"), bedPresets = all("[data-bed]");
  const cards = all("#partGrid .pcard[data-code]");
  const sceneOnly = ["fitBtn", "gridBtn", "back", "refs", "cable", "driveToggle"].map($);
  let filter = "all", angle = -1, phase = 0, playing = false, tickId = 0, last = 0;
  let visible = false, observer;

  for (const el of sceneOnly) el.disabled = true;
  for (const id of ["refs", "cable", "driveToggle"]) $(id).checked = false;
  function metrics() {
    const load = Number($("driveLoad").value), eta = Number($("driveEta").value);
    const stroke = 31.5 * angle * Math.PI / 180;
    const fmt = (n, places) => n.toFixed(places).replace(".", ",");
    const metric = (id, n, places) => { $(id).firstChild.nodeValue = fmt(n, places) + " "; };
    $("driveAngle").textContent = angle;
    metric("driveStroke", stroke, 1);
    metric("driveTurns", stroke / (2 * Math.PI * 12), 3);
    metric("driveForce", 1000 * load / 31.5, 1);
    metric("driveMotorTorque", load * 12 / (31.5 * eta), 2);
    $("driveLoadText").textContent = fmt(load, 1) + " Н·м";
    $("driveEtaText").textContent = Math.round(eta * 100) + "%";
  }
  function show(value) {
    const i = Math.max(0, Math.min(24, Math.round(Number(value) / 5)));
    if (i * 5 === angle) return;
    angle = i * 5;
    $("motionFrames").setAttribute("x", -(i % 5) * 500);
    $("motionFrames").setAttribute("y", -Math.floor(i / 5) * 540);
    $("motionAtlas").setAttribute("aria-label", "Сборка ортеза при сгибании " + angle + "°");
    $("angle").value = angle;
    $("angleText").textContent = angle;
    for (const b of presets) b.classList.toggle("active", Number(b.dataset.a) === angle);
    metrics();
  }
  function tick(now) {
    tickId = 0;
    if (!playing || !visible || document.hidden) return;
    if (last) phase += Math.min((now - last) / 1000, .08) * 1.15;
    last = now;
    show(60 - 60 * Math.cos(phase));
    tickId = requestAnimationFrame(tick);
  }
  function syncClock() {
    cancelAnimationFrame(tickId);
    last = 0;
    if (playing && visible && !document.hidden) tickId = requestAnimationFrame(tick);
  }
  function play(on) {
    playing = on;
    $("play").textContent = on ? "Ⅱ Пауза" : "▶ Анимация";
    $("play").setAttribute("aria-pressed", String(on));
    syncClock();
  }
  function choose(value) {
    play(false); show(value); phase = Math.acos(1 - angle / 60);
  }
  listen($("angle"), "input", e => choose(e.target.value));
  listen($("resetBtn"), "click", () => choose(0));
  listen($("play"), "click", () => play(!playing));
  for (const b of presets) listen(b, "click", () => choose(b.dataset.a));
  for (const id of ["driveLoad", "driveEta"]) listen($(id), "input", metrics);
  listen(document, "visibilitychange", syncClock);
  const setVisible = next => { if (visible !== next) { visible = next; syncClock(); } };
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(stage);
  } else {
    const check = () => {
      const box = stage.getBoundingClientRect();
      setVisible(box.bottom > 0 && box.top < window.innerHeight);
    };
    listen(window, "scroll", check);
    listen(window, "resize", check);
    check();
  }
  $("angle").step = "5";
  show(0);
  play(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function updateCatalog() {
    const w = Number($("bedWidth").value) || 220, d = Number($("bedDepth").value) || 220;
    const query = $("search").value.trim().toLowerCase();
    let fitted = 0;
    for (const card of cards) {
      const [x, y] = card.dataset.size.split(",").map(Number);
      const fits = (x+10 <= w && y+10 <= d) || (y+10 <= w && x+10 <= d);
      if (fits) fitted++;
      const show = (filter === "all" || card.dataset.kind === filter) && card.textContent.toLowerCase().includes(query);
      card.style.display = show ? "" : "none";
      const label = card.querySelector(".print-footprint span:last-child");
      label.className = fits ? "print-ok" : "print-no";
      label.textContent = fits ? "● Входит" : "! Не входит";
    }
    $("bedSummary").textContent = fitted + " / " + cards.length + " моделей помещаются на стол " + w + " × " + d + " мм по габаритному прямоугольнику.";
    for (const b of bedPresets) b.classList.toggle("active", Number(b.dataset.bed) === w && w === d);
  }
  for (const id of ["bedWidth", "bedDepth", "search"]) listen($(id), "input", updateCatalog);
  for (const b of filters) listen(b, "click", () => {
    filter = b.dataset.f;
    for (const x of filters) x.classList.toggle("active", x === b);
    updateCatalog();
  });
  for (const b of bedPresets) listen(b, "click", () => {
    $("bedWidth").value = b.dataset.bed; $("bedDepth").value = b.dataset.bed; updateCatalog();
  });
  updateCatalog();

  window.__ORTHOSIS_FALLBACK = {
    takeOver() {
      const state = {angle, phase, playing, filter, q: $("search").value.trim().toLowerCase()};
      playing = false;
      listeners.abort(); observer?.disconnect(); cancelAnimationFrame(tickId);
      for (const el of sceneOnly) el.disabled = false;
      for (const id of ["refs", "cable", "driveToggle"]) $(id).checked = $(id).defaultChecked;
      $("angle").step = "1";
      stage.classList.remove("atlas-mode");
      $("viewLabel").textContent = "СБОРКА / 3D";
      $("driveStatus").textContent = "Загрузка концептуальных CAD-узлов V02…";
      $("stageHint").textContent = "ПАЛЕЦ / МЫШЬ — ВРАЩЕНИЕ";
      return state;
    }
  };
})();
