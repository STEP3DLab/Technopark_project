"use strict";

document.documentElement.classList.add("js");
const one = (selector, context = document) => context.querySelector(selector);
const all = (selector, context = document) => Array.from(context.querySelectorAll(selector));
const twoDigits = (number) => String(number).padStart(2, "0");

function setupNavigation() {
  const toggle = one(".menu-toggle");
  const menu = one("#mobile-menu");
  const close = (restore = false) => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Открыть меню");
    if (restore) toggle.focus();
  };
  toggle.addEventListener("click", () => {
    if (!menu.hidden) return close();
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Закрыть меню");
  });
  menu.addEventListener("click", () => close());
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !event.target.closest(".site-header")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) close(true);
  });
  matchMedia("(min-width: 851px)").addEventListener("change", (event) => {
    if (event.matches) close();
  });
}

function setupHero() {
  const hero = one(".hero-show");
  if (!hero) return;
  const slides = all("[data-slide]", hero);
  const count = one("#hero-count");
  let current = 0;
  function show(step) {
    const previous = slides[current];
    current = (current + step + slides.length) % slides.length;
    const next = slides[current];
    const image = one("img", next);
    if (image.dataset.src) {
      image.src = image.dataset.src;
      delete image.dataset.src;
    }
    previous.hidden = true;
    previous.classList.remove("showing");
    next.hidden = false;
    next.classList.add("showing");
    count.replaceChildren(
      twoDigits(current + 1) + " ",
      Object.assign(document.createElement("i"), { textContent: "/" }),
      " " + twoDigits(slides.length),
    );
  }
  all("[data-hero-step]", hero).forEach((button) =>
    button.addEventListener("click", () => show(Number(button.dataset.heroStep))),
  );
  hero.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const focusedProject = event.target.closest(".hero-project");
    show(event.key === "ArrowRight" ? 1 : -1);
    if (focusedProject) one(".hero-project", slides[current]).focus();
  });
}

function setupArchive() {
  const grid = one("#project-grid");
  if (!grid) return;
  const cards = all(".project-card", grid);
  const filters = all("[data-filter]");
  const views = all("[data-view]");
  const more = one("#more-projects");
  const url = new URL(location.href);
  const types = new Set(filters.map((button) => button.dataset.filter));
  let kind = types.has(url.searchParams.get("type")) ? url.searchParams.get("type") : "all";
  let view = url.searchParams.get("view") === "list" ? "list" : "grid";
  const savedLimit = history.state?.portfolioLimit;
  let limit = Number.isInteger(savedLimit) ? Math.max(6, Math.min(cards.length, savedLimit)) : 6;
  function update() {
    const selected = cards.filter((card) => kind === "all" || card.dataset.kind === kind);
    const visible = selected.slice(0, view === "list" ? selected.length : limit);
    const visibleCards = new Set(visible);
    cards.forEach((card) => {
      card.hidden = !visibleCards.has(card);
    });
    filters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === kind)));
    views.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
    grid.classList.toggle("is-list", view === "list");
    more.hidden = visible.length >= selected.length;
    const progress = `Показано ${visible.length} из ${selected.length}`;
    one("#catalog-progress").textContent = progress;
    one("#catalog-status").textContent = progress + " проектов.";
    return visible;
  }
  function remember() {
    const next = new URL(location.href);
    if (kind === "all") next.searchParams.delete("type");
    else next.searchParams.set("type", kind);
    if (view === "grid") next.searchParams.delete("view");
    else next.searchParams.set("view", view);
    history.replaceState({ ...history.state, portfolioLimit: limit }, "", next);
  }
  filters.forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.filter === kind) return;
      kind = button.dataset.filter;
      limit = 6;
      update();
      remember();
    }),
  );
  views.forEach((button) =>
    button.addEventListener("click", () => {
      view = button.dataset.view;
      update();
      remember();
    }),
  );
  more.addEventListener("click", () => {
    const previous = limit;
    limit += 6;
    const visible = update();
    remember();
    const firstNew = visible[previous];
    if (firstNew) one("a", firstNew).focus({ preventScroll: true });
  });
  update();
}

function setupComparison() {
  const selector = one("#compare-series");
  if (!selector) return;
  const range = one("#comparison-range");
  const panel = one(".compare-panel");
  const left = one("#compare-left");
  const right = one("#compare-right");
  const update = () => {
    panel.style.setProperty("--split", range.value + "%");
    range.setAttribute("aria-valuetext", range.value + "% визуализации");
  };
  selector.addEventListener("change", () => {
    const data = selector.selectedOptions[0].dataset;
    left.src = data.left;
    left.alt = data.leftAlt;
    right.src = data.right;
    right.alt = data.rightAlt;
    range.value = "50";
    update();
  });
  range.addEventListener("input", update);
  update();
}

function setupCalculator() {
  const service = one("#calc-service");
  if (!service) return;
  const area = one("#calc-area");
  const cost = one("#calc-output");
  const formula = one("#calc-formula");
  const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  function calculate() {
    const metres = area.valueAsNumber;
    const special = service.selectedOptions[0].dataset.small === "true";
    const invalid = !Number.isFinite(metres) || metres <= 0 || (special && metres >= 30);
    area.setAttribute("aria-invalid", String(invalid));
    if (invalid) {
      formula.textContent =
        !Number.isFinite(metres) || metres <= 0
          ? "Укажите площадь больше нуля."
          : "Этот тариф действует для отдельного помещения площадью меньше 30 м².";
      cost.textContent = "—";
      return;
    }
    const rate = Number(service.value);
    formula.textContent = `${format.format(metres)} м² × ${format.format(rate)} ₽`;
    cost.textContent = format.format(metres * rate) + " ₽";
  }
  area.addEventListener("input", calculate);
  service.addEventListener("change", calculate);
  calculate();
}

function setupPress() {
  const links = all("[data-press-kind]");
  if (!links.length) return;
  const buttons = all("[data-press-filter]");
  buttons.forEach((button) =>
    button.addEventListener("click", () => {
      const format = button.dataset.pressFilter;
      buttons.forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
      links.forEach((link) => {
        link.hidden = format !== "all" && link.dataset.pressKind !== format;
      });
      one("#press-status").textContent =
        `Материалов в подборке: ${links.filter((link) => !link.hidden).length}`;
    }),
  );
}

function setupLightbox() {
  const dialog = one("#lightbox");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const image = one(".lb-image", dialog);
  const count = one(".lb-count", dialog);
  const original = one(".lb-original", dialog);
  let items = [],
    current = 0,
    opener = null,
    start = null;
  function show(index) {
    current = (index + items.length) % items.length;
    const item = items[current];
    image.alt = one("img", item).alt;
    image.src = item.href;
    original.href = item.dataset.original || item.href;
    count.textContent = `${twoDigits(current + 1)} / ${twoDigits(items.length)}`;
  }
  all("[data-gallery]").forEach((gallery) =>
    gallery.addEventListener("click", (event) => {
      const item = event.target.closest("[data-photo]");
      if (!item || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      items = all("[data-photo]", gallery);
      opener = item;
      one("#lb-title", dialog).textContent = gallery.dataset.gallery;
      show(items.indexOf(item));
      document.body.classList.add("modal-open");
      dialog.showModal();
      one(".lb-close", dialog).focus({ preventScroll: true });
    }),
  );
  one(".lb-close", dialog).addEventListener("click", () => dialog.close());
  one(".lb-prev", dialog).addEventListener("click", () => show(current - 1));
  one(".lb-next", dialog).addEventListener("click", () => show(current + 1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      show(current + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    image.removeAttribute("src");
    if (opener) opener.focus({ preventScroll: true });
  });
  const stage = one(".lb-stage", dialog);
  stage.addEventListener(
    "touchstart",
    (event) => {
      start = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null;
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (event) => {
      if (!start || event.touches.length || !event.changedTouches.length) {
        start = null;
        return;
      }
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start[0],
        dy = touch.clientY - start[1];
      start = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) show(current + (dx < 0 ? 1 : -1));
    },
    { passive: true },
  );
  stage.addEventListener("touchcancel", () => {
    start = null;
  });
}

setupNavigation();
setupHero();
setupArchive();
setupComparison();
setupCalculator();
setupPress();
setupLightbox();
