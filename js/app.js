/**
 * PUBLIC WEBSITE — entry point.
 *
 * Loads content through js/services/api.js (demo JSON now, Google Sheets
 * later) and renders every data-driven part of the page.
 */
import { CONFIG, isPlaceholder } from "./config.js";
import { hydrateIcons } from "./icons.js";
import { $, $$, escapeHtml, formatPrice, isSpecialLive, safeUrl, session, telLink, whatsappLink } from "./utils.js";
import { getMode, getPublicData, STORAGE_KEYS } from "./services/api.js";
import { DEMO_PREVIEW_KEY, endDemoPreview, isDemoPreview } from "./auth.js";
import { applyImage, assetPlaceholder, installImageFallback, transformUrl } from "./services/images.js";
import { SITE_IMAGES } from "./site-images.js";
import { MenuView, renderSpecials, renderThalis } from "./menu.js";
import { GalleryView } from "./gallery.js";
import { createLightbox, initNav, initOrderFab, initReveal, toast } from "./ui.js";

const DEMO = getMode() === "DEMO";
const DEFAULT_TAGLINE = "Food that tastes like home";
const DEFAULT_ABOUT = $('[data-bind="aboutText"]')?.textContent || "";

const PLACEHOLDER_LABELS = {
  phone: "[PHONE NUMBER]",
  whatsapp: "[WHATSAPP NUMBER]",
  address: "[BUSINESS ADDRESS]",
  openingHours: "[OPENING HOURS]",
  mapsUrl: "[GOOGLE MAPS LINK]",
  instagramUrl: "[INSTAGRAM LINK]",
};

// js/config.js → contact is used when Business info has no value yet.
const CONFIG_CONTACT = {
  phone: CONFIG.contact.phone,
  whatsapp: CONFIG.contact.whatsapp,
  mapsUrl: CONFIG.contact.mapsUrl,
  instagramUrl: CONFIG.contact.instagram,
};

let business = {};

const contactValue = (key) => {
  const value = business?.[key];
  return isPlaceholder(value) ? CONFIG_CONTACT[key] || "" : String(value).trim();
};

/* ---------- Site photos ---------- */

function setSiteImage(key, override = "") {
  const def = SITE_IMAGES[key];
  if (!def) return;
  $$(`[data-site-image="${key}"]`).forEach((img) => {
    applyImage(img, { ...def, src: override || def.src });
    const note = img.closest("figure")?.querySelector(".photo-note");
    if (note) note.hidden = !DEMO || Boolean(override);
  });
}

/* ---------- Business info ---------- */

function renderBusiness(info) {
  business = info || {};
  const name = isPlaceholder(business.businessName) ? "Gharcha Jevan" : business.businessName;
  $$('[data-bind="businessName"]').forEach((el) => (el.textContent = name));

  const tagline = isPlaceholder(business.tagline) ? DEFAULT_TAGLINE : business.tagline.trim();
  $$('[data-bind="tagline"]').forEach((el) => {
    if (el.textContent.replace(/\s+/g, " ").trim() !== tagline) el.textContent = tagline;
  });

  const about = $('[data-bind="aboutText"]');
  if (about) about.textContent = isPlaceholder(business.aboutText) ? DEFAULT_ABOUT : business.aboutText;

  for (const key of Object.keys(PLACEHOLDER_LABELS)) {
    const dd = $(`[data-contact="${key}"]`);
    if (!dd) continue;
    const row = dd.closest("[data-contact-row]");
    const value = contactValue(key);
    if (isPlaceholder(value)) {
      row.hidden = !DEMO;
      dd.innerHTML = `<span class="ph">${PLACEHOLDER_LABELS[key]}</span>`;
      continue;
    }
    row.hidden = false;
    dd.innerHTML = contactMarkup(key, value);
  }

  setSiteImage("hero", business.heroImage);
  setSiteImage("about", business.aboutImage);
}

function contactMarkup(key, value) {
  const text = escapeHtml(value);
  switch (key) {
    case "phone": {
      const link = telLink(value);
      return link ? `<a href="${escapeHtml(link)}">${text}</a>` : text;
    }
    case "whatsapp": {
      const link = whatsappLink(value);
      return link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">${text}</a>` : text;
    }
    case "mapsUrl": {
      const url = safeUrl(value);
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open in Google Maps</a>` : text;
    }
    case "instagramUrl": {
      const url = safeUrl(value);
      if (!url) return text;
      const handle = new URL(url).pathname.split("/").filter(Boolean)[0];
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${handle ? `@${escapeHtml(handle)}` : "Instagram"}</a>`;
    }
    default:
      return text;
  }
}

/* ---------- Links (WhatsApp, directions, Instagram) ---------- */

function setLink(el, url, missingType) {
  if (url) {
    el.href = url;
    el.target = "_blank";
    el.rel = "noopener";
    el.removeAttribute("data-link-missing");
    el.hidden = false;
    return;
  }
  el.href = "#contact";
  el.removeAttribute("target");
  el.dataset.linkMissing = missingType;
  // On the live site, links without a value are hidden instead of showing a notice.
  if (!DEMO && missingType !== "whatsapp") el.hidden = true;
}

function decorateLinks(root = document) {
  const number = contactValue("whatsapp");
  $$("[data-wa-link]", root).forEach((el) => {
    const item = el.dataset.waItem;
    const message = item ? `Hello! I would like to order: ${item}` : CONFIG.contact.whatsappMessage;
    setLink(el, isPlaceholder(number) ? null : whatsappLink(number, message), "whatsapp");
  });

  const address = contactValue("address");
  const maps =
    safeUrl(contactValue("mapsUrl")) ||
    (isPlaceholder(address) ? null : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
  $$("[data-directions-link]", root).forEach((el) => setLink(el, maps, "maps"));

  const instagram = safeUrl(contactValue("instagramUrl"));
  $$("[data-instagram-link]", root).forEach((el) => setLink(el, instagram, "instagram"));
}

const MISSING_TEXT = {
  whatsapp: "The WhatsApp number hasn't been added yet. Once it is added in Business info, this button opens a WhatsApp chat.",
  maps: "The Google Maps link hasn't been added yet. Once it is added in Business info, this button opens directions.",
  instagram: "The Instagram link hasn't been added yet. Once it is added in Business info, this link opens the profile.",
};

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-link-missing]");
  if (!el || !DEMO) return;
  event.preventDefault();
  toast(MISSING_TEXT[el.dataset.linkMissing] || "This link hasn't been added yet.");
});

/* ---------- Page setup ---------- */

function initDemoUi() {
  $$("[data-demo-only]").forEach((el) => (el.hidden = !DEMO));
  const bar = $("[data-demo-bar]");
  const text = bar && $("[data-demo-bar-text]", bar);
  if (!bar || !text) return;
  let closedKey;
  if (isDemoPreview()) {
    text.innerHTML = `<strong>Demo preview.</strong> You're seeing the changes you made in the demo dashboard, saved only in this browser. <button class="demo-bar__link" type="button" data-exit-demo>Back to the live site</button>`;
    $("[data-exit-demo]", bar).addEventListener("click", () => {
      endDemoPreview();
      location.reload();
    });
    closedKey = "gj.previewBarClosed";
  } else if (DEMO) {
    if (!CONFIG.website.showDemoNotice) return;
    closedKey = "gj.demoBarClosed";
  } else if (CONFIG.website.dashboardInvite) {
    text.innerHTML = `<strong>Portfolio project.</strong> See how the owner updates this website: <a href="admin/?demo=1">try the dashboard demo</a>`;
    closedKey = "gj.inviteBarClosed";
  } else {
    return;
  }
  if (session.get(closedKey)) return;
  bar.hidden = false;
  $("[data-demo-close]", bar)?.addEventListener("click", () => {
    bar.hidden = true;
    session.set(closedKey, true);
  });
}

// Dish, thali and special photos: tap to see the whole photo.
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-zoom]");
  if (!button || !lightbox) return;
  const caption = button.dataset.zoomCaption || "";
  lightbox.open([{ src: transformUrl(button.dataset.zoom, { width: 1600 }), fallback: assetPlaceholder("dish"), alt: caption, caption }], 0, button);
});

// Entering or leaving the demo in another tab switches this page between demo and live data.
window.addEventListener("storage", (event) => {
  if (event.key === DEMO_PREVIEW_KEY) location.reload();
});

const lightbox = createLightbox($("[data-lightbox]"));
const menuView = new MenuView({ tabs: $("[data-menu-tabs]"), panel: $("[data-menu-panel]"), onRender: decorateLinks });
const galleryView = new GalleryView({ grid: $("[data-gallery]"), filters: $("[data-gallery-filters]"), lightbox });

/** The small "Today's special" card on the hero photo. */
function renderHeroSpecial(specials = []) {
  const card = $("[data-hero-special]");
  if (!card) return;
  const special = specials.find((item) => isSpecialLive(item));
  card.hidden = !special;
  if (!special) return;
  $("[data-hero-special-name]", card).textContent = special.name;
  $("[data-hero-special-price]", card).textContent = special.available ? formatPrice(special.price) : "Sold out";
}

function render(data) {
  renderBusiness(data.business);
  menuView.render(data);
  renderThalis($("[data-thalis]"), data.thalis);
  renderSpecials($("[data-specials-section]"), $("[data-specials]"), data.specials);
  renderHeroSpecial(data.specials);
  galleryView.render(data.gallery);
  decorateLinks(document);
}

function showLoadError() {
  const fromFile = location.protocol === "file:";
  const message = fromFile
    ? "The menu can't load when this page is opened as a file. Open it through a local web server (see README → Run it locally)."
    : "The menu could not be loaded. Please check your internet connection.";
  const panel = $("[data-menu-panel]");
  panel.removeAttribute("aria-busy");
  panel.innerHTML = `<div class="empty load-error"><p>${escapeHtml(message)}</p>${
    fromFile ? "" : `<button class="btn btn--outline" type="button" data-retry>Try again</button>`
  }</div>`;
  $("[data-retry]", panel)?.addEventListener("click", () => load());
  ["[data-thalis]", "[data-gallery]"].forEach((selector) => {
    const el = $(selector);
    el.removeAttribute("aria-busy");
    el.innerHTML = "";
  });
  setSiteImage("hero");
  setSiteImage("about");
}

async function load() {
  try {
    const data = await getPublicData({ onUpdate: render });
    render(data);
  } catch (error) {
    console.error("[Gharcha Jevan] Could not load content:", error);
    showLoadError();
  }
}

hydrateIcons();
installImageFallback();
initDemoUi();
initNav();
initOrderFab();
decorateLinks(document);

["specialityFish", "specialityChicken", "specialityThali"].forEach((key) => setSiteImage(key));
$$("[data-menu-tab]").forEach((link) => link.addEventListener("click", () => menuView.select(link.dataset.menuTab)));
$$("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));

load().finally(initReveal);

// Demo: when the owner dashboard is open in another tab, show its edits here immediately.
window.addEventListener("storage", (event) => {
  if (DEMO && (event.key === STORAGE_KEYS.demo || event.key === null)) load();
});
