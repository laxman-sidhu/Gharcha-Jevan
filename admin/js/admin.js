/**
 * OWNER DASHBOARD (CMS) — shared shell and components for every admin page.
 *
 *   initAdmin()          sign-in guard, navigation, sync status, data loading
 *   toast()              short messages, optionally with an action (Undo, Try again)
 *   openModal()          accessible <dialog>, full screen on phones
 *   confirmDialog()      confirmation before destructive actions
 *   createImageField()   drag & drop, browse, preview, replace, remove, upload progress
 *   openRecordEditor()   add/edit form: validate → upload photo → save → back up
 *
 * Data always goes through js/services/api.js (demo storage now, Google Sheets
 * in production), so these screens never talk to Google or Cloudinary directly
 * except for the photo upload itself (js/services/cloudinary.js).
 */
import { Auth } from "../../js/auth.js";
import { icon } from "../../js/icons.js";
import { getMode, store, StorageFullError } from "../../js/services/api.js";
import { normalizeRecord, validateRecord, ValidationError } from "../../js/services/schema.js";
import * as cloudinary from "../../js/services/cloudinary.js";
import { imageTag, installImageFallback, transformUrl } from "../../js/services/images.js";
import { $, $$, escapeHtml, formatBytes } from "../../js/utils.js";

export { $, $$, escapeHtml, icon, store };

export const NAV = [
  { page: "dashboard", href: "dashboard.html", label: "Dashboard", short: "Home", icon: "layout-dashboard" },
  { page: "menu", href: "menu.html", label: "Menu", short: "Menu", icon: "book-open" },
  { page: "thalis", href: "thalis.html", label: "Thalis", short: "Thalis", icon: "hand-platter" },
  { page: "specials", href: "specials.html", label: "Specials", short: "Specials", icon: "sparkles" },
  { page: "gallery", href: "gallery.html", label: "Gallery", short: "Photos", icon: "images" },
  { page: "business", href: "business.html", label: "Business info", short: "Info", icon: "store" },
];

export const isDemo = () => getMode() === "DEMO";

let currentPage = "";
let authExpired = false;

/* ==========================================================================
   Shell
   ========================================================================== */

export async function initAdmin({ page, render }) {
  currentPage = page;
  if (!Auth.isSignedIn()) {
    location.replace(`index.html?next=${encodeURIComponent(page)}`);
    return;
  }
  installImageFallback();
  preventFileDropNavigation();
  renderShell(page);

  const content = $("[data-content]");
  store.subscribe(onStoreEvent);
  try {
    await store.load();
  } catch (error) {
    if (error.code === "UNAUTHORIZED") {
      Auth.signOut();
      location.replace(`index.html?next=${encodeURIComponent(page)}&expired=1`);
      return;
    }
    content.removeAttribute("aria-busy");
    content.innerHTML = `<div class="load-error">
      <p class="notice notice--danger">${icon("circle-alert", { size: 18 })}<span>${escapeHtml(errorMessage(error))}</span></p>
      <div class="banner__actions">
        <button class="btn btn--primary" type="button" data-reload>${icon("refresh-cw")}Try again</button>
        <button class="btn btn--secondary" type="button" data-sign-out>${icon("log-out")}Sign out</button>
      </div>
    </div>`;
    $("[data-reload]", content).addEventListener("click", () => location.reload());
    $("[data-sign-out]", content).addEventListener("click", signOut);
    return;
  }

  content.removeAttribute("aria-busy");
  content.innerHTML = "";
  render(content);
  updateSyncUi();

  const checkSession = () => {
    if (!Auth.isSignedIn() && !authExpired) {
      authExpired = true;
      updateSyncUi();
    }
  };
  setInterval(checkSession, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    checkSession();
    if (store.pendingCount()) store.flush();
  });
}

function renderShell(page) {
  const session = Auth.getSession();
  const links = (compact) =>
    NAV.map(
      (item) =>
        `<a href="${item.href}"${item.page === page ? ' aria-current="page"' : ""}>${icon(item.icon, { size: compact ? 22 : 20 })}<span>${
          compact ? item.short : item.label
        }</span></a>`
    ).join("");
  const name = session?.name || "Owner";

  $("[data-sidebar]").innerHTML = `
    <a class="admin-brand" href="dashboard.html">
      <img src="../assets/images/logo.svg" alt="" width="40" height="40">
      <span><strong>Gharcha Jevan</strong><small>Owner dashboard</small></span>
    </a>
    <nav class="side-nav" aria-label="Sections">${links(false)}</nav>
    <div class="sidebar__foot">
      <div class="sidebar__user">
        <span class="avatar" aria-hidden="true">${escapeHtml(name.trim().charAt(0).toUpperCase())}</span>
        <span class="sidebar__who"><strong>${escapeHtml(name)}</strong>${
          isDemo() ? pill("warn", "Demo mode", "triangle-alert") : pill("ok", "Live website", "circle-check")
        }</span>
      </div>
      <button class="btn btn--ghost btn--block" type="button" data-sign-out>${icon("log-out")}${Auth.isDemoSession() ? "Exit demo" : "Sign out"}</button>
    </div>`;

  $("[data-topbar]").innerHTML = `
    <a class="topbar__brand" href="dashboard.html"><img src="../assets/images/logo.svg" alt="" width="36" height="36"><span class="sr-only">Dashboard</span></a>
    <span class="topbar__status" data-sync-status role="status"></span>
    <a class="btn btn--secondary btn--sm topbar__site" href="../" target="_blank" rel="noopener" aria-label="View website (opens in a new tab)">${icon("external-link", { size: 18 })}<span>View website</span></a>
    <button class="icon-btn topbar__signout" type="button" data-sign-out aria-label="${Auth.isDemoSession() ? "Exit demo" : "Sign out"}">${icon("log-out")}</button>`;

  $("[data-tabbar]").innerHTML = links(true);
  $$("[data-sign-out]").forEach((button) => button.addEventListener("click", signOut));
}

function preventFileDropNavigation() {
  // Dropping a photo outside the drop area should not open the file in the browser.
  ["dragover", "drop"].forEach((type) =>
    window.addEventListener(type, (event) => {
      if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
    })
  );
}

async function signOut() {
  const leavingDemo = Auth.isDemoSession();
  const pending = store.pendingCount();
  if (pending) {
    const ok = await confirmDialog({
      title: "Sign out now?",
      message: `${plural(pending, "change is", "changes are")} not backed up yet. They stay on this device and are sent the next time you sign in here.`,
      confirmLabel: "Sign out",
      tone: "primary",
    });
    if (!ok) return;
  }
  Auth.signOut();
  location.href = leavingDemo ? "index.html?demoEnded=1" : "index.html?signedOut=1";
}

function onStoreEvent(event) {
  if (event.type === "auth-expired") authExpired = true;
  if (["sync-start", "sync-ok", "sync-error", "changed", "auth-expired", "loaded"].includes(event.type)) updateSyncUi(event);
}

function updateSyncUi(event = {}) {
  const chip = $("[data-sync-status]");
  const pending = store.pendingCount();
  if (chip) {
    if (isDemo()) chip.innerHTML = pill("warn", "Demo mode", "triangle-alert");
    else if (event.type === "sync-start") chip.innerHTML = `<span class="pill pill--info"><span class="spinner" aria-hidden="true"></span>Backing up…</span>`;
    else if (pending) chip.innerHTML = pill("warn", `${pending} not backed up`, "cloud-off");
    else chip.innerHTML = pill("ok", "Backed up", "cloud");
  }
  renderBanners(pending);
}

function bannerHtml(tone, iconName, text, actions = "") {
  return `<div class="banner banner--${tone}" role="${tone === "danger" ? "alert" : "status"}">${icon(iconName)}<p>${escapeHtml(text)}</p>${
    actions ? `<div class="banner__actions">${actions}</div>` : ""
  }</div>`;
}

function renderBanners(pending) {
  const host = $("[data-banners]");
  if (!host) return;
  const parts = [];
  if (authExpired) {
    parts.push(
      bannerHtml(
        "danger",
        "lock",
        "Your sign-in has expired. Sign in again to keep saving. Changes you already made are kept on this device.",
        `<a class="btn btn--sm btn--primary" href="index.html?next=${encodeURIComponent(currentPage)}&expired=1">Sign in again</a>`
      )
    );
  } else if (pending && store.lastSyncError) {
    parts.push(
      bannerHtml(
        "warn",
        "cloud-off",
        `${plural(pending, "change is", "changes are")} saved on this device but not yet backed up to Google Sheets. ${errorMessage(store.lastSyncError)}`,
        `<button class="btn btn--sm btn--secondary" type="button" data-retry-sync>Try again</button>
         <button class="btn btn--sm btn--ghost" type="button" data-discard-sync>Discard</button>`
      )
    );
  }
  if (store.remoteError) {
    parts.push(bannerHtml("info", "info", "Google Sheets could not be reached, so this is the last copy saved on this device. New changes are sent when the connection is back."));
  }
  host.innerHTML = parts.join("");
  $("[data-retry-sync]", host)?.addEventListener("click", retrySync);
  $("[data-discard-sync]", host)?.addEventListener("click", discardPending);
}

async function discardPending() {
  const ok = await confirmDialog({
    title: "Discard unsent changes?",
    message: "The changes that could not be backed up are removed from this device, and the latest data is loaded from Google Sheets again.",
    confirmLabel: "Discard changes",
  });
  if (!ok) return;
  try {
    await store.discardPending();
    toast("Unsent changes discarded. Showing the data from Google Sheets.", { tone: "info" });
  } catch (error) {
    toast(errorMessage(error), { tone: "danger" });
  }
}

export async function retrySync() {
  const result = await store.flush();
  if (result.ok) toast("All changes are backed up to Google Sheets.", { tone: "ok" });
  else toast(`The backup failed again. ${errorMessage(result.error)}`, { tone: "danger", action: { label: "Try again", onClick: retrySync } });
}

/* ==========================================================================
   Small helpers
   ========================================================================== */

export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export const pill = (tone, text, iconName) =>
  `<span class="pill pill--${tone}">${iconName ? icon(iconName, { size: 14 }) : ""}${escapeHtml(text)}</span>`;

export function nameHtml(name) {
  return `<span>${escapeHtml(name)}</span>`;
}

export function thumbHtml(src, fallback) {
  return imageTag({ src, alt: "", ratio: [1, 1], widths: [96, 160], sizes: "68px", fallback });
}

export function emptyState({ iconName = "info", title, text = "", action = "" }) {
  return `<div class="empty">${icon(iconName)}<strong>${escapeHtml(title)}</strong>${text ? `<p>${text}</p>` : ""}${action}</div>`;
}

export function focusLater(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus());
}

export function errorMessage(error) {
  if (!error) return "Something went wrong. Please try again.";
  if (error instanceof ValidationError || error instanceof StorageFullError) return error.message;
  if (error.name === "UploadError" || error.name === "CloudinaryConfigError") return error.message;
  if (error.code === "UNAUTHORIZED") return "Your sign-in has expired. Please sign in again.";
  return error.message || "Something went wrong. Please try again.";
}

/** One consistent message after every save. */
export function reportSave(result, { noun = "item", label = "", verb = "saved" } = {}) {
  const subject = label || `The ${noun}`;
  if (!result.changed) {
    toast("Nothing was changed, so there was nothing to save.", { tone: "info" });
    return;
  }
  if (result.demo) {
    toast(`${subject} ${verb}. The website preview in this browser shows it now.`, { tone: "ok" });
    return;
  }
  if (result.synced) {
    toast(`${subject} ${verb} and backed up to Google Sheets.`, { tone: "ok" });
    return;
  }
  toast(`The ${noun} was updated locally, but the backup could not be synchronized. Please try again.`, {
    tone: "warn",
    timeout: 14000,
    action: { label: "Try again", onClick: retrySync },
  });
}

export function setBusy(button, busy, label = "Saving…") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
  } else {
    if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml;
    delete button.dataset.idleHtml;
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ==========================================================================
   Toasts
   ========================================================================== */

const TOAST_ICONS = { ok: "circle-check", warn: "triangle-alert", danger: "circle-alert", info: "info" };

function toastRegion() {
  // While a dialog is open, the page behind it is inert, so toasts go inside the dialog.
  const dialogs = $$("dialog[open]");
  const host = dialogs[dialogs.length - 1] || document.body;
  let region = [...host.children].find((child) => child.matches?.(".toast-region"));
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    host.append(region);
  }
  return region;
}

export function toast(message, { tone = "ok", timeout, action } = {}) {
  const el = document.createElement("div");
  el.className = `toast toast--${tone}`;
  if (tone === "danger") el.setAttribute("role", "alert");
  el.innerHTML = `<span class="toast__icon">${icon(TOAST_ICONS[tone] || "info")}</span><p>${escapeHtml(message)}</p>${
    action ? `<button class="toast__action" type="button">${escapeHtml(action.label)}</button>` : ""
  }<button class="toast__close" type="button" aria-label="Dismiss message">${icon("x", { size: 16 })}</button>`;
  const remove = () => el.remove();
  $(".toast__close", el).addEventListener("click", remove);
  if (action) {
    $(".toast__action", el).addEventListener("click", () => {
      remove();
      action.onClick();
    });
  }
  toastRegion().append(el);
  const ms = timeout ?? (action ? 9000 : tone === "danger" || tone === "warn" ? 9000 : 4500);
  if (ms) setTimeout(remove, ms);
  return remove;
}

/* ==========================================================================
   Dialogs
   ========================================================================== */

let openCount = 0;
let modalSeq = 0;

export function openModal({ title, body = "", footer = "", size = "", onClose } = {}) {
  const id = `modal-${++modalSeq}`;
  const opener = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = `modal${size ? ` modal--${size}` : ""}`;
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.innerHTML = `
    <div class="modal__head">
      <h2 class="modal__title" id="${id}-title">${escapeHtml(title)}</h2>
      <button class="icon-btn icon-btn--ghost" type="button" data-close aria-label="Close">${icon("x", { size: 22 })}</button>
    </div>
    <div class="modal__body"></div>
    ${footer === null ? "" : `<div class="modal__foot"></div>`}`;
  const bodyEl = $(".modal__body", dialog);
  const footEl = $(".modal__foot", dialog);
  if (typeof body === "string") bodyEl.innerHTML = body;
  else bodyEl.append(body);
  if (footEl) {
    if (typeof footer === "string") footEl.innerHTML = footer;
    else footEl.append(footer);
  }
  document.body.append(dialog);

  let beforeClose = null;
  let closing = false;
  const close = async (force = false) => {
    if (closing || !dialog.open) return;
    if (!force && beforeClose) {
      closing = true;
      const ok = await beforeClose();
      closing = false;
      if (!ok) return;
    }
    dialog.close();
  };

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  $("[data-close]", dialog).addEventListener("click", () => close());
  dialog.addEventListener("close", () => {
    dialog.remove();
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.documentElement.classList.remove("has-modal");
    onClose?.();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });

  dialog.showModal();
  openCount += 1;
  document.documentElement.classList.add("has-modal");
  return {
    dialog,
    body: bodyEl,
    foot: footEl,
    close,
    setBeforeClose(fn) {
      beforeClose = fn;
    },
  };
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger" }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const modal = openModal({
      title,
      size: "confirm",
      body: `<p class="confirm__text">${escapeHtml(message)}</p>`,
      footer: `<span class="spacer"></span>
        <button class="btn btn--secondary" type="button" data-cancel>${escapeHtml(cancelLabel)}</button>
        <button class="btn ${tone === "danger" ? "btn--danger-solid" : "btn--primary"}" type="button" data-ok>${escapeHtml(confirmLabel)}</button>`,
      onClose: () => resolve(confirmed),
    });
    $("[data-cancel]", modal.foot).addEventListener("click", () => modal.close());
    $("[data-ok]", modal.foot).addEventListener("click", () => {
      confirmed = true;
      modal.close();
    });
    $("[data-cancel]", modal.foot).focus();
  });
}

/* ==========================================================================
   Form helpers
   ========================================================================== */

let fieldSeq = 0;
const nextId = (name) => `f-${name}-${++fieldSeq}`;

export function textField({ name, label, value = "", type = "text", hint = "", required = false, optional = false, max, counter = false, placeholder = "", rows = 4, prefix = "", attrs = "" }) {
  const id = nextId(name);
  const hasFoot = Boolean(hint || (counter && max));
  const describedBy = [hasFoot ? `${id}-hint` : "", `${id}-error`].filter(Boolean).join(" ");
  const common = `id="${id}" name="${name}"${max ? ` maxlength="${max}"` : ""}${required ? ' aria-required="true"' : ""}${
    placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : ""
  } aria-describedby="${describedBy}" ${attrs}`;
  const control =
    type === "textarea"
      ? `<textarea class="textarea" rows="${rows}" ${common}>${escapeHtml(value)}</textarea>`
      : `<input class="input" type="${type}" value="${escapeHtml(value)}" ${common}>`;
  return `<div class="field" data-field="${name}">
    <label class="field__label" for="${id}">${escapeHtml(label)}${optional ? ' <span class="optional">(optional)</span>' : ""}</label>
    ${prefix ? `<div class="input-prefix"><span aria-hidden="true">${prefix}</span>${control}</div>` : control}
    ${
      hasFoot
        ? `<div class="field__foot" id="${id}-hint"><span class="field__hint">${hint}</span>${
            counter && max ? `<span class="counter" data-counter="${name}" aria-hidden="true">${String(value).length}/${max}</span>` : ""
          }</div>`
        : ""
    }
    <p class="field__error" id="${id}-error" hidden></p>
  </div>`;
}

export function switchField({ name, label, hint = "", checked = false }) {
  return `<label class="switch" data-field="${name}">
    <input type="checkbox" role="switch" name="${name}"${checked ? " checked" : ""}>
    <span class="switch__track" aria-hidden="true"></span>
    <span class="switch__text"><strong>${escapeHtml(label)}</strong>${hint ? `<small>${hint}</small>` : ""}</span>
  </label>`;
}

export function segmentedField({ name, label, value, options }) {
  return `<fieldset class="field" data-field="${name}">
    <legend class="field__label">${escapeHtml(label)}</legend>
    <div class="segmented">${options
      .map(
        (option) => `<label class="segmented__opt">
          <input type="radio" name="${name}" value="${escapeHtml(option.value)}"${option.value === value ? " checked" : ""}>
          <span>${option.icon ? icon(option.icon, { size: 20 }) : ""}<span>${escapeHtml(option.label)}</span></span>
        </label>`
      )
      .join("")}</div>
    <p class="field__error" hidden></p>
  </fieldset>`;
}

/** Reads a form into a plain object. Inputs marked data-list become arrays. */
export function readForm(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || ["file", "button", "submit"].includes(el.type)) continue;
    if (el.dataset.list !== undefined) {
      (values[el.name] ||= []).push(el.value.trim());
    } else if (el.type === "checkbox") {
      values[el.name] = el.checked;
    } else if (el.type === "radio") {
      if (el.checked) values[el.name] = el.value;
    } else {
      values[el.name] = el.value.trim();
    }
  }
  return values;
}

export function showAlert(el, message, tone = "danger") {
  if (!el) return;
  el.className = `notice notice--${tone}`;
  el.setAttribute("role", tone === "danger" ? "alert" : "status");
  el.innerHTML = `${icon(tone === "danger" ? "circle-alert" : "info", { size: 18 })}<span>${escapeHtml(message)}</span>`;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest" });
}

export function clearErrors(form) {
  $$(".has-error", form).forEach((field) => field.classList.remove("has-error"));
  $$(".field__error", form).forEach((out) => {
    out.hidden = true;
    out.textContent = "";
  });
  $$("[aria-invalid]", form).forEach((el) => el.removeAttribute("aria-invalid"));
  const alert = $("[data-form-alert]", form);
  if (alert) alert.hidden = true;
}

export function showErrors(form, errors = {}) {
  clearErrors(form);
  let first = null;
  for (const [key, message] of Object.entries(errors)) {
    const field = $(`[data-field="${key}"]`, form);
    if (!field) continue;
    field.classList.add("has-error");
    const out = $(".field__error", field);
    if (out) {
      out.innerHTML = `${icon("circle-alert", { size: 16 })}<span>${escapeHtml(message)}</span>`;
      out.hidden = false;
    }
    $("input:not([type=file]), textarea", field)?.setAttribute("aria-invalid", "true");
    first ||= field;
  }
  const messages = Object.values(errors);
  if (messages.length) {
    showAlert($("[data-form-alert]", form), messages.length === 1 ? messages[0] : `Please fix the ${messages.length} highlighted fields.`);
  }
  if (first) {
    first.scrollIntoView({ block: "center", behavior: "smooth" });
    $("input:not([type=file]):not([type=radio]), textarea, input[type=radio]:checked, button", first)?.focus({ preventScroll: true });
  }
}

export function bindCounters(form) {
  form.addEventListener("input", (event) => {
    const counter = event.target.name && $(`[data-counter="${event.target.name}"]`, form);
    if (counter) counter.textContent = `${event.target.value.length}/${event.target.maxLength}`;
  });
}

/* ==========================================================================
   Image field — drag & drop / browse / preview / replace / remove / progress
   ========================================================================== */

export function createImageField({ name = "image", label = "Photo", value = "", hint = "", entity, getCategory = () => "", getName = () => "", ratio = "4 / 3", required = false }) {
  const root = document.createElement("div");
  root.className = "field image-field";
  root.dataset.field = name;
  const id = nextId(name);
  const demo = isDemo();
  // Demo mode never uploads: photos stay in the visitor's browser even when Cloudinary is set up.
  const configured = !demo && cloudinary.isConfigured();
  const blocked = !demo && !configured;

  let current = value || "";
  let file = null;
  let objectUrl = "";
  let removed = false;
  let lastResult = null;

  const notice = configured
    ? ""
    : demo
      ? `<p class="notice notice--warn">${icon("cloud-off", { size: 18 })}<span>Demo mode: the photo is kept in this browser only and is not uploaded.</span></p>`
      : `<p class="notice notice--danger">${icon("circle-alert", { size: 18 })}<span>Photo uploads are not set up yet. Add the Cloudinary details in js/config.js (see README).</span></p>`;

  root.innerHTML = `
    <p class="field__label" id="${id}-label">${escapeHtml(label)}${required ? "" : ' <span class="optional">(optional)</span>'}</p>
    <div class="image-field__stage" data-stage></div>
    <input class="sr-only" type="file" accept="image/*" data-file tabindex="-1" aria-hidden="true"${blocked ? " disabled" : ""}>
    <div class="image-field__status" data-status hidden>
      <div class="progress" data-progress role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="progress__bar"></span></div>
      <p data-status-text aria-live="polite"></p>
    </div>
    ${hint ? `<p class="field__hint">${hint}</p>` : ""}
    ${notice}
    <p class="field__error" hidden></p>`;

  const stage = $("[data-stage]", root);
  const input = $("[data-file]", root);
  const status = $("[data-status]", root);
  const progress = $("[data-progress]", root);
  const statusText = $("[data-status-text]", root);

  function render() {
    const src = file ? objectUrl : current && !removed ? transformUrl(current, { width: 900 }) : "";
    if (!src) {
      stage.innerHTML = `
        <button class="dropzone" type="button" data-pick aria-describedby="${id}-label"${blocked ? " disabled" : ""}>
          <span class="dropzone__icon">${icon("image-plus", { size: 26 })}</span>
          <span class="dropzone__title"><span class="only-pointer">Drag a photo here</span><span class="only-touch">Add a photo</span></span>
          <span class="dropzone__hint"><span class="only-pointer">or </span><span class="dropzone__browse">choose from your photos</span></span>
          <span class="dropzone__meta">JPG, PNG, WebP or HEIC</span>
        </button>`;
      return;
    }
    stage.innerHTML = `
      <div class="image-preview" style="--ratio: ${ratio}">
        <img src="${escapeHtml(src)}" alt="Preview of the ${file ? "new" : "current"} photo" data-preview>
        ${file ? `<span class="image-preview__badge">${icon("upload", { size: 14 })}Uploads when you save</span>` : ""}
      </div>
      <div class="image-preview__bar">
        <span class="image-preview__meta">${file ? `${escapeHtml(file.name)}, ${formatBytes(file.size)}` : "Current photo"}</span>
        <button class="btn btn--secondary btn--sm" type="button" data-pick${blocked ? " disabled" : ""}>${icon("refresh-cw", { size: 16 })}Replace</button>
        <button class="btn btn--ghost btn--sm btn--danger" type="button" data-remove>${icon("trash-2", { size: 16 })}Remove</button>
      </div>`;
    $("[data-preview]", stage).addEventListener(
      "error",
      (event) => {
        event.currentTarget.outerHTML = `<div class="image-preview__none">${icon("image", { size: 28 })}<span>No preview for this file type. It will still be uploaded.</span></div>`;
      },
      { once: true }
    );
  }

  function releaseFile() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    file = null;
  }

  function setError(message) {
    const out = $(".field__error", root);
    root.classList.toggle("has-error", Boolean(message));
    out.hidden = !message;
    out.innerHTML = message ? `${icon("circle-alert", { size: 16 })}<span>${escapeHtml(message)}</span>` : "";
  }

  function setStatus(tone, text, percent = null) {
    status.hidden = false;
    status.className = `image-field__status${tone ? ` is-${tone}` : ""}`;
    progress.hidden = percent === null;
    if (percent !== null) {
      progress.setAttribute("aria-valuenow", String(percent));
      $(".progress__bar", progress).style.width = `${percent}%`;
    }
    statusText.textContent = text;
  }

  const changed = () => root.dispatchEvent(new CustomEvent("imagechange", { bubbles: true }));

  function accept(candidate) {
    try {
      cloudinary.validateFile(candidate);
    } catch (error) {
      setError(error.message);
      return;
    }
    releaseFile();
    file = candidate;
    objectUrl = URL.createObjectURL(candidate);
    removed = false;
    lastResult = null;
    setError("");
    status.hidden = true;
    render();
    changed();
    $("[data-pick]", stage)?.focus();
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-pick]")) input.click();
    if (event.target.closest("[data-remove]")) {
      releaseFile();
      removed = Boolean(current);
      lastResult = null;
      status.hidden = true;
      render();
      changed();
      $("[data-pick]", stage)?.focus();
    }
  });
  input.addEventListener("change", () => {
    if (input.files?.[0]) accept(input.files[0]);
    input.value = "";
  });
  root.addEventListener("dragover", (event) => {
    if (blocked || !event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    root.classList.add("is-dragover");
  });
  root.addEventListener("dragleave", (event) => {
    if (!root.contains(event.relatedTarget)) root.classList.remove("is-dragover");
  });
  root.addEventListener("drop", (event) => {
    event.preventDefault();
    root.classList.remove("is-dragover");
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped && !blocked) accept(dropped);
  });

  async function simulateProgress(report, task) {
    let percent = 0;
    const timer = setInterval(() => report((percent = Math.min(90, percent + 18))), 90);
    try {
      const [result] = await Promise.all([task(), wait(600)]);
      report(100);
      return result;
    } finally {
      clearInterval(timer);
    }
  }

  render();

  return {
    element: root,
    hasPendingFile: () => Boolean(file),
    /** What validation should see: a placeholder URL while a new photo waits to upload. */
    validationValue: () => (file ? "https://upload.pending/photo.jpg" : removed ? "" : current),
    isDirty: () => Boolean(file) || removed || Boolean(lastResult),
    setError,
    /** Upload a new photo if one was chosen. Resolves to { url, publicId }, or null when nothing changed. */
    async commit({ onProgress } = {}) {
      if (!file) return removed ? { url: "", publicId: "" } : lastResult;
      const report = (percent) => {
        setStatus("", percent < 100 ? `Uploading photo… ${percent}%` : "Finishing…", percent);
        onProgress?.(percent);
      };
      report(0);
      root.setAttribute("aria-busy", "true");
      try {
        let result;
        if (configured) {
          const uploaded = await cloudinary.uploadImage(file, { entity, category: getCategory(), name: getName(), onProgress: report });
          result = { url: uploaded.url, publicId: uploaded.publicId };
        } else if (demo) {
          const dataUrl = await simulateProgress(report, () => cloudinary.toDemoDataUrl(file));
          result = { url: dataUrl, publicId: "" };
        } else {
          throw new cloudinary.CloudinaryConfigError("Photo uploads are not set up yet. Cloudinary needs to be configured in js/config.js.");
        }
        setStatus("ok", configured ? "Photo uploaded." : "Photo ready (kept in this browser for the demo).", 100);
        releaseFile();
        current = result.url;
        lastResult = result;
        render();
        return result;
      } catch (error) {
        const message = ["UploadError", "CloudinaryConfigError"].includes(error.name) ? error.message : "Image upload failed. Please try again.";
        setStatus("danger", message);
        throw error;
      } finally {
        root.removeAttribute("aria-busy");
      }
    },
    /** Call after the record has been saved. */
    markSaved() {
      if (removed) current = "";
      removed = false;
      lastResult = null;
      render();
    },
    destroy: releaseFile,
  };
}

/* ==========================================================================
   Record editor (dishes, thalis, specials, photos)
   ========================================================================== */

/**
 * Opens the add/edit dialog.
 *   entity       "menu" | "thalis" | "specials" | "gallery"
 *   base         the record being edited (or defaults for a new one)
 *   isNew        true when adding
 *   fieldsHtml   form markup; include <div data-image-slot></div> where the photo goes
 *   image        options for createImageField (omit for no photo)
 *   collect      (values) => input  — adjust form values before saving
 *   bind         (form) => void     — extra behaviour for the form
 *   nameOf       (record) => string — used in messages
 */
export function openRecordEditor({ entity, noun, base, isNew, title, saveLabel, fieldsHtml, image, collect = (v) => v, bind, nameOf, hideLabel = "Hide", onSaved }) {
  const formId = `editor-${++modalSeq}`;
  const form = document.createElement("form");
  form.className = "form";
  form.id = formId;
  form.noValidate = true;
  form.innerHTML = `<div data-form-alert hidden></div>${fieldsHtml}`;

  const imageField = image
    ? createImageField({
        ...image,
        value: base.image,
        entity,
        getCategory: () => form.elements.category?.value || base.category || "",
        getName: () => form.elements.name?.value || form.elements.caption?.value || "",
      })
    : null;
  if (imageField) $("[data-image-slot]", form).replaceWith(imageField.element);
  bindCounters(form);
  bind?.(form);

  const modal = openModal({
    title,
    body: form,
    footer: `${isNew ? "" : `<button class="btn btn--danger" type="button" data-delete>${icon("trash-2")}Delete</button>`}
      <span class="spacer"></span>
      <button class="btn btn--secondary" type="button" data-cancel>Cancel</button>
      <button class="btn btn--primary" type="submit" form="${formId}" data-save>${icon("check")}${escapeHtml(saveLabel)}</button>`,
    onClose: () => imageField?.destroy(),
  });

  const snapshot = JSON.stringify(readForm(form));
  const isDirty = () => JSON.stringify(readForm(form)) !== snapshot || Boolean(imageField?.isDirty());
  modal.setBeforeClose(
    async () =>
      !isDirty() ||
      confirmDialog({
        title: "Discard your changes?",
        message: "You have changes that are not saved yet.",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
      })
  );

  const saveButton = $("[data-save]", modal.foot);
  const alertEl = $("[data-form-alert]", form);
  $("[data-cancel]", modal.foot).addEventListener("click", () => modal.close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  $("input:not([type=file]):not([type=radio]), textarea", form)?.focus();

  $("[data-delete]", modal.foot)?.addEventListener("click", async () => {
    const name = nameOf(base);
    const ok = await confirmDialog({
      title: name ? `Delete “${name}”?` : `Delete this ${noun}?`,
      message: `This removes the ${noun} for good. The deletion is still recorded in the change log. To take it off the website for now, use “${hideLabel}” instead.`,
      confirmLabel: `Delete ${noun}`,
    });
    if (!ok) return;
    try {
      const result = await store.remove(entity, base.id);
      modal.close(true);
      if (result.synced === false) reportSave(result, { noun });
      else toast(name ? `“${name}” was deleted.` : `The ${noun} was deleted.`, { tone: "ok" });
    } catch (error) {
      showAlert(alertEl, errorMessage(error));
    }
  });

  async function submit() {
    if (saveButton.disabled) return;
    clearErrors(form);
    const input = collect(readForm(form));
    if (!isNew) input.id = base.id;

    // 1. Validate before anything is uploaded.
    const probe = normalizeRecord(entity, { ...base, ...input, ...(imageField ? { image: imageField.validationValue() } : {}) });
    const { valid, errors } = validateRecord(entity, probe);
    if (!valid) {
      if (errors.image) imageField?.setError(errors.image);
      showErrors(form, errors);
      return;
    }

    const buttons = $$("button", modal.foot);
    buttons.forEach((button) => (button.disabled = true));
    setBusy(saveButton, true, imageField?.hasPendingFile() ? "Uploading photo…" : "Saving…");
    try {
      // 2. Upload the photo to Cloudinary (if a new one was chosen).
      const photo = imageField ? await imageField.commit({ onProgress: (p) => setBusy(saveButton, true, p < 100 ? `Uploading ${p}%` : "Saving…") }) : null;
      if (photo) {
        input.image = photo.url;
        input.imagePublicId = photo.publicId;
      }
      // 3. Save the record (in production this also updates Google Sheets and the Change Log).
      setBusy(saveButton, true, "Saving…");
      const result = await store.save(entity, input);
      modal.close(true);
      const savedName = nameOf(result.record || input);
      reportSave(result, { noun, label: savedName ? `“${savedName}”` : "", verb: isNew ? "added" : "saved" });
      onSaved?.(result.record);
    } catch (error) {
      if (error instanceof ValidationError) showErrors(form, error.errors);
      else showAlert(alertEl, errorMessage(error));
    } finally {
      if (form.isConnected) {
        setBusy(saveButton, false);
        buttons.forEach((button) => (button.disabled = false));
      }
    }
  }

  return modal;
}
