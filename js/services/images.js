/**
 * IMAGE HELPERS
 *
 * - Local placeholder artwork for anything without a photo yet.
 * - Responsive <img> markup with srcset.
 * - Cloudinary delivery transformations: f_auto (WebP/AVIF when supported),
 *   q_auto (smart compression), and exact sizes so phones never download
 *   huge originals.
 * - Sample photos from Unsplash (demo only) are resized the same way.
 * - If any image fails to load, it is swapped for its placeholder.
 */
import { assetUrl, escapeHtml } from "../utils.js";

export const PLACEHOLDERS = {
  dish: "assets/images/placeholder-dish.svg",
  fish: "assets/images/placeholder-fish.svg",
  chicken: "assets/images/placeholder-chicken.svg",
  thali: "assets/images/placeholder-thali.svg",
  special: "assets/images/placeholder-special.svg",
  gallery: "assets/images/placeholder-gallery.svg",
  hero: "assets/images/placeholder-hero.svg",
  about: "assets/images/placeholder-about.svg",
};

export function placeholderForCategory(category = "") {
  const key = String(category).toLowerCase();
  if (key === "fish") return PLACEHOLDERS.fish;
  if (key === "chicken") return PLACEHOLDERS.chicken;
  if (key === "thali") return PLACEHOLDERS.thali;
  if (key === "specials") return PLACEHOLDERS.special;
  return PLACEHOLDERS.dish;
}

const CLOUDINARY_UPLOAD = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;
const UNSPLASH = /^https:\/\/images\.unsplash\.com\//;

export const isTransformable = (src) => CLOUDINARY_UPLOAD.test(src || "") || UNSPLASH.test(src || "");

/** Returns a resized / optimised URL for Cloudinary and Unsplash images. Other URLs are returned unchanged. */
/** Absolute URL of a placeholder drawing, e.g. assetPlaceholder("dish"). */
export const assetPlaceholder = (key) => assetUrl(PLACEHOLDERS[key] || PLACEHOLDERS.dish);

export function transformUrl(src, { width, height } = {}) {
  if (!src) return "";
  if (CLOUDINARY_UPLOAD.test(src)) {
    const parts = ["f_auto", "q_auto"];
    if (width) parts.push(`w_${Math.round(width)}`);
    if (height) parts.push(`h_${Math.round(height)}`);
    if (width && height) parts.push("c_fill", "g_auto");
    else if (width || height) parts.push("c_limit");
    return src.replace("/image/upload/", `/image/upload/${parts.join(",")}/`);
  }
  if (UNSPLASH.test(src)) {
    const url = new URL(src);
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "crop");
    url.searchParams.set("q", "70");
    if (width) url.searchParams.set("w", String(Math.round(width)));
    if (height) url.searchParams.set("h", String(Math.round(height)));
    return url.href;
  }
  return assetUrl(src);
}

/**
 * Responsive image markup.
 *   ratio   [w, h] crop ratio, e.g. [4, 5]
 *   widths  candidate widths for srcset
 *   sizes   the sizes attribute (how wide the image is displayed)
 */
export function imageTag({
  src,
  alt = "",
  ratio = [4, 3],
  widths = [320, 640, 960],
  sizes = "100vw",
  fallback = PLACEHOLDERS.dish,
  className = "",
  eager = false,
} = {}) {
  const [rw, rh] = ratio;
  const baseWidth = widths[Math.min(1, widths.length - 1)];
  const baseHeight = Math.round((baseWidth * rh) / rw);
  const fallbackUrl = assetUrl(fallback);
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';

  if (!src) {
    return `<img class="${escapeHtml(className)} is-placeholder" src="${escapeHtml(fallbackUrl)}" alt="${escapeHtml(alt)}" width="${baseWidth}" height="${baseHeight}" ${loading} decoding="async">`;
  }

  const main = transformUrl(src, { width: baseWidth, height: baseHeight });
  const srcset = isTransformable(src)
    ? widths.map((w) => `${transformUrl(src, { width: w, height: Math.round((w * rh) / rw) })} ${w}w`).join(", ")
    : "";

  return `<img class="${escapeHtml(className)}" src="${escapeHtml(main)}"${
    srcset ? ` srcset="${escapeHtml(srcset)}" sizes="${escapeHtml(sizes)}"` : ""
  } alt="${escapeHtml(alt)}" width="${baseWidth}" height="${baseHeight}" ${loading} decoding="async" data-fallback="${escapeHtml(fallbackUrl)}">`;
}

/** Sets src/srcset on an existing <img> element (used for the fixed section photos). */
export function applyImage(img, options) {
  const tpl = document.createElement("template");
  tpl.innerHTML = imageTag({ ...options, className: img.className });
  const fresh = tpl.content.firstElementChild;
  for (const attr of ["src", "srcset", "sizes", "width", "height", "loading", "fetchpriority", "decoding", "data-fallback"]) {
    if (fresh.hasAttribute(attr)) img.setAttribute(attr, fresh.getAttribute(attr));
    else img.removeAttribute(attr);
  }
  img.alt = options.alt || "";
  img.classList.toggle("is-placeholder", fresh.classList.contains("is-placeholder"));
}

/** Swap broken images for their placeholder (one listener for the whole page). */
export function installImageFallback(root = document) {
  root.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const fallback = img.dataset.fallback;
      if (!fallback || img.dataset.failed) return;
      img.dataset.failed = "true";
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.src = fallback;
      img.classList.add("is-placeholder");
    },
    true
  );
}
