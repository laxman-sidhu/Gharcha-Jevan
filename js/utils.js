/**
 * Small shared helpers used by both the public website and the admin CMS.
 */

/** Absolute URL of the site root (works on GitHub Pages project sites too). */
export const SITE_ROOT = new URL("../", import.meta.url);

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape any value before inserting it into HTML. Use for ALL data from the CMS. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Resolve a site-relative asset path ("images/x.svg") from any page, including /admin/. */
export function assetUrl(path) {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return new URL(String(path).replace(/^\.?\//, ""), SITE_ROOT).href;
}

/** Only allow http(s) links from data. Returns null for anything else. */
export function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** ₹1,250 — returns null when the price is empty or zero ("ask for price"). */
export function formatPrice(price) {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uid(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36)}${random}`;
}

export const nowIso = () => new Date().toISOString();

/** Today's date in the visitor's time zone as YYYY-MM-DD. */
export function todayIso(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function sortByOrder(list = []) {
  return [...list].sort(
    (a, b) =>
      (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0) ||
      String(a.name || a.caption || "").localeCompare(String(b.name || b.caption || ""))
  );
}

/** A special is live when it is active and today falls inside its optional date window. */
export function isSpecialLive(special, today = todayIso()) {
  if (!special || !special.active) return false;
  if (special.startDate && special.startDate > today) return false;
  if (special.endDate && special.endDate < today) return false;
  return true;
}

export function specialStatus(special, today = todayIso()) {
  if (!special.active) return "off";
  if (special.startDate && special.startDate > today) return "scheduled";
  if (special.endDate && special.endDate < today) return "ended";
  return "live";
}

export function relativeTime(iso) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(time).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * WhatsApp "click to chat" link. 10-digit Indian numbers get the 91 prefix.
 * Returns null when there is no usable number.
 */
export function whatsappLink(number, message = "") {
  let digits = String(number || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return null;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function telLink(number) {
  const cleaned = String(number || "").replace(/[^\d+]/g, "");
  return cleaned.replace(/\D/g, "").length >= 8 ? `tel:${cleaned}` : null;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * localStorage wrapper that never throws on read (private browsing, disabled storage).
 * `set` DOES throw so callers can react to a full storage quota.
 */
export const storage = {
  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const session = {
  get(key, fallback = null) {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
