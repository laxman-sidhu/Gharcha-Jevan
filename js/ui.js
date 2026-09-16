/**
 * Public-site UI behaviours: navigation, scroll reveals, the floating order
 * button, toasts and the gallery lightbox. No dependencies.
 */
import { icon } from "./icons.js";
import { $, $$, escapeHtml, prefersReducedMotion } from "./utils.js";

export function toast(message, { tone = "info", timeout = 5000, iconName } = {}) {
  const region = $("[data-toasts]");
  if (!region) return;
  const el = document.createElement("div");
  el.className = `toast toast--${tone}`;
  el.innerHTML = `${icon(iconName || (tone === "error" ? "circle-alert" : "info"), { size: 20 })}<p>${escapeHtml(message)}</p>`;
  region.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

function swapIcon(button, name, size = 22) {
  const svg = button.querySelector("svg");
  const tpl = document.createElement("template");
  tpl.innerHTML = icon(name, { size });
  if (svg) svg.replaceWith(tpl.content.firstElementChild);
}

export function initNav() {
  const header = $("[data-header]");
  const toggle = $("[data-nav-toggle]");
  const label = $("[data-nav-toggle-label]");
  const nav = $("#site-nav");
  if (!header) return;

  // Solid background once the page has scrolled.
  let ticking = false;
  const updateStuck = () => {
    ticking = false;
    header.classList.toggle("is-stuck", header.getBoundingClientRect().top <= 0 && window.scrollY > 4);
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateStuck);
    }
  }, { passive: true });
  updateStuck();

  const mobile = window.matchMedia("(max-width: 63.99rem)");
  const setOpen = (open) => {
    header.classList.toggle("is-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Close menu" : "Open menu";
    if (toggle) swapIcon(toggle, open ? "x" : "menu");
    document.body.classList.toggle("is-locked", open && mobile.matches);
  };
  const isOpen = () => header.classList.contains("is-open");

  toggle?.addEventListener("click", () => setOpen(!isOpen()));
  nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      setOpen(false);
      toggle?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    // composedPath() still includes the header even if the clicked icon was just swapped out.
    if (isOpen() && !event.composedPath().includes(header)) setOpen(false);
  });
  mobile.addEventListener?.("change", (event) => {
    if (!event.matches) setOpen(false);
  });

  // Highlight the nav link of the section in view.
  const links = $$(".site-nav__list a[href^='#']");
  if (!("IntersectionObserver" in window) || !links.length) return;
  const byId = new Map(links.map((link) => [link.getAttribute("href").slice(1), link]));
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const active = byId.get(entry.target.id) || null;
        links.forEach((link) => link.toggleAttribute("aria-current", link === active));
        if (active) active.setAttribute("aria-current", "true");
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  $$("main > section[id]").forEach((section) => observer.observe(section));
}

export function initReveal() {
  const items = $$("[data-reveal]");
  if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0 }
  );
  items.forEach((el) => observer.observe(el));
}

/** Phones: show "WhatsApp / Order" once the hero is out of view (hidden again near Contact and the footer). */
export function initOrderFab() {
  const fab = $("[data-order-fab]");
  if (!fab || !("IntersectionObserver" in window)) return;
  const inView = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? inView.add(entry.target) : inView.delete(entry.target)));
    fab.classList.toggle("is-hidden", inView.size > 0);
  });
  [$("#home"), $("#contact"), $(".site-footer")].filter(Boolean).forEach((el) => observer.observe(el));
}

/** Full-screen photo viewer built on <dialog>. Keyboard: ←/→ and Esc. Touch: swipe. */
export function createLightbox(dialog) {
  if (!dialog || typeof dialog.showModal !== "function") return null;
  const img = $("[data-lightbox-img]", dialog);
  const caption = $("[data-lightbox-caption]", dialog);
  const count = $("[data-lightbox-count]", dialog);
  const stage = $("[data-lightbox-stage]", dialog);
  const prev = $("[data-lightbox-prev]", dialog);
  const next = $("[data-lightbox-next]", dialog);
  let items = [];
  let index = 0;
  let opener = null;
  let startX = null;
  let swiped = false;

  const preload = (i) => {
    const item = items[(i + items.length) % items.length];
    if (item) new Image().src = item.src;
  };

  const show = (i) => {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    const item = items[index];
    img.removeAttribute("src");
    img.src = item.src;
    img.alt = item.alt || "";
    caption.textContent = item.caption || "";
    count.textContent = items.length > 1 ? `${index + 1} of ${items.length}` : "";
    prev.hidden = next.hidden = items.length < 2;
    if (items.length > 1) {
      preload(index + 1);
      preload(index - 1);
    }
  };

  const close = () => dialog.open && dialog.close();

  dialog.addEventListener("close", () => {
    document.body.classList.remove("is-locked");
    opener?.focus?.({ preventScroll: true });
  });
  $("[data-lightbox-close]", dialog)?.addEventListener("click", close);
  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });
  dialog.addEventListener("click", (event) => {
    if (swiped) {
      swiped = false;
      return;
    }
    if (event.target === dialog || event.target === stage) close();
  });
  img.addEventListener("error", () => {
    const fallback = items[index]?.fallback;
    if (fallback && img.src !== fallback) img.src = fallback;
  });
  stage.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
  });
  stage.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50 && items.length > 1) {
      swiped = true;
      show(index + (dx < 0 ? 1 : -1));
    }
  });

  return {
    open(list, startIndex = 0, trigger = null) {
      items = list;
      opener = trigger || document.activeElement;
      show(startIndex);
      dialog.showModal();
      document.body.classList.add("is-locked");
    },
    close,
  };
}
