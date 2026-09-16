/**
 * CLOUDINARY SERVICE
 *
 * Everything Cloudinary-specific lives in this one file.
 *
 * Folder layout inside the owner's Cloudinary account:
 *   Gharcha Jevan/
 *     menu/fish  menu/chicken  menu/thali  menu/specials  menu/other
 *     gallery/food  gallery/restaurant  gallery/events
 *     site/                      (hero and about photos)
 *
 * File names: <dish or caption>-<unique code>, e.g. surmai-fry-mfz1k2abx9q.
 * Tags: gj-cms,<section>,<category> (handy for finding or cleaning up photos).
 *
 * Upload modes (js/config.js → cloudinary.uploadMode):
 *   "UNSIGNED" — uses an unsigned upload preset. Quick to set up. Leave the
 *                preset's folder EMPTY: for unsigned uploads Cloudinary lets the
 *                preset override the folder this file sends. Restrict formats
 *                and file size in the preset, because the preset name is public.
 *   "SIGNED"   — recommended. Asks the Apps Script backend for a one-time
 *                signature. The backend checks the owner's sign-in first and
 *                keeps the Cloudinary API secret in Script properties.
 *
 * The API secret must NEVER appear in this file or anywhere in the frontend.
 * Images are never deleted from Cloudinary automatically — removing a photo
 * from a dish only unlinks it, so nothing is lost by accident.
 */
import { CONFIG, isPlaceholder } from "../config.js";
import { galleryCategoryInfo, categoryInfo } from "./schema.js";
import * as sheets from "./sheets.js";
import { Auth } from "../auth.js";
import { slugify } from "../utils.js";

export class CloudinaryConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "CloudinaryConfigError";
  }
}

export class UploadError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = "UploadError";
    this.retryable = retryable;
  }
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"];

export function isConfigured() {
  const c = CONFIG.cloudinary;
  if (isPlaceholder(c.cloudName)) return false;
  if (c.uploadMode === "SIGNED") return sheets.isConfigured();
  return !isPlaceholder(c.uploadPreset);
}

export function getStatus() {
  const c = CONFIG.cloudinary;
  if (isPlaceholder(c.cloudName)) return { configured: false, detail: "Add cloudinary.cloudName in js/config.js" };
  if (c.uploadMode === "SIGNED" && !sheets.isConfigured()) {
    return { configured: false, detail: "Signed uploads need the Apps Script URL" };
  }
  if (c.uploadMode !== "SIGNED" && isPlaceholder(c.uploadPreset)) {
    return { configured: false, detail: "Add cloudinary.uploadPreset in js/config.js" };
  }
  return { configured: true, detail: `${c.uploadMode === "SIGNED" ? "Signed" : "Unsigned"} uploads to "${c.cloudName}"` };
}

/** Gharcha Jevan/menu/fish, …/gallery/events, … */
export function resolveFolder(entity, category) {
  const base = String(CONFIG.cloudinary.baseFolder || "Gharcha Jevan").replace(/^\/+|\/+$/g, "");
  let sub;
  switch (entity) {
    case "menu":
      sub = categoryInfo(category).folder;
      break;
    case "thalis":
      sub = "menu/thali";
      break;
    case "specials":
      sub = "menu/specials";
      break;
    case "gallery":
      sub = galleryCategoryInfo(category).folder;
      break;
    default:
      sub = "site";
  }
  return `${base}/${sub}`;
}

export function validateFile(file) {
  if (!file) throw new UploadError("No photo selected.", { retryable: false });
  const type = (file.type || "").toLowerCase();
  const looksLikeImage = ACCEPTED_TYPES.includes(type) || /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name || "");
  if (!looksLikeImage) {
    throw new UploadError("Please choose a photo (JPG, PNG, WEBP or HEIC).", { retryable: false });
  }
  const maxBytes = CONFIG.cloudinary.maxFileSizeMB * 1024 * 1024;
  if (file.size > maxBytes * 3) {
    throw new UploadError(`This photo is too large. Please use one under ${CONFIG.cloudinary.maxFileSizeMB} MB.`, { retryable: false });
  }
}

/**
 * Downscale large photos in the browser before uploading (phones often
 * produce 5–12 MB images). Falls back to the original file if the browser
 * cannot decode it (e.g. HEIC outside Safari) — Cloudinary handles those.
 */
export async function prepareImage(file, { maxDimension = CONFIG.cloudinary.maxUploadDimension, quality = 0.86, type = "image/jpeg" } = {}) {
  if (!("createImageBitmap" in window) || /image\/(gif|svg)/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) return file;
    const name = `${slugify((file.name || "photo").replace(/\.[^.]+$/, "")) || "photo"}.jpg`;
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}

/** Small JPEG data URL — used only in DEMO mode, where photos stay in the browser. */
export async function toDemoDataUrl(file) {
  const small = await prepareImage(file, { maxDimension: 960, quality: 0.78 });
  if (small === file && file.size > 400 * 1024) {
    throw new UploadError("This photo can't be previewed in demo mode. Try a JPG or PNG under 400 KB.", { retryable: false });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new UploadError("The photo could not be read."));
    reader.readAsDataURL(small);
  });
}

function xhrUpload(url, formData, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 180000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.secure_url) {
        onProgress?.(100);
        resolve(body);
      } else {
        const reason = body?.error?.message ? ` (${body.error.message})` : "";
        reject(new UploadError(`Image upload failed${reason}. Please try again.`, { retryable: xhr.status >= 500 || xhr.status === 0 }));
      }
    };
    xhr.onerror = () => reject(new UploadError("Image upload failed. Please check the internet connection and try again."));
    xhr.ontimeout = () => reject(new UploadError("Image upload took too long. Please try again."));
    xhr.onabort = () => reject(new UploadError("Upload cancelled.", { retryable: false }));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(formData);
  });
}

/**
 * Readable and always unique, because unsigned uploads never overwrite an
 * existing name (Cloudinary would return the old photo instead).
 */
export function buildPublicId(name) {
  const base = slugify(name).slice(0, 60).replace(/-+$/, "") || "photo";
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return `${base}-${unique}`;
}

export const buildTags = (entity, category) => ["gj-cms", slugify(entity), slugify(category)].filter(Boolean).join(",");

/**
 * Upload a photo to the owner's Cloudinary account.
 * Resolves to { url, publicId, width, height, bytes, format }.
 */
export async function uploadImage(file, { entity, category, name, onProgress, signal } = {}) {
  if (!isConfigured()) {
    throw new CloudinaryConfigError("Photo uploads are not set up yet. Cloudinary needs to be configured in js/config.js.");
  }
  validateFile(file);

  const c = CONFIG.cloudinary;
  const folder = resolveFolder(entity, category);
  const folderParam = c.useAssetFolder ? "asset_folder" : "folder";
  const prepared = await prepareImage(file);
  if (prepared.size > c.maxFileSizeMB * 1024 * 1024) {
    throw new UploadError(`This photo is larger than ${c.maxFileSizeMB} MB even after resizing. Please choose a smaller one.`, { retryable: false });
  }

  const publicId = buildPublicId(name || category || entity);
  const tags = buildTags(entity, category);
  const form = new FormData();
  form.append("file", prepared);

  if (c.uploadMode === "SIGNED") {
    let signed;
    try {
      signed = await sheets.getUploadSignature(Auth.getIdToken(), { folder, folderParam, publicId, tags });
    } catch (error) {
      throw new UploadError(`Image upload failed: ${error.message}`);
    }
    form.append("api_key", signed.apiKey);
    form.append("signature", signed.signature);
    Object.entries(signed.params || {}).forEach(([key, value]) => form.append(key, value));
  } else {
    form.append("upload_preset", c.uploadPreset);
    form.append(folderParam, folder);
    form.append("public_id", publicId);
    form.append("tags", tags);
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloudName)}/image/upload`;
  const result = await xhrUpload(endpoint, form, { onProgress, signal });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  };
}
