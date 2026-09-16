/**
 * GOOGLE SHEETS SERVICE (transport layer)
 *
 * The browser never touches the Google Sheet directly and never holds a
 * Google API key. All reads and writes go through the Google Apps Script
 * Web App in assets/google-apps-script/Code.gs, which:
 *   - serves public data (GET  ?action=public)
 *   - verifies the owner's Google sign-in token on every write (POST)
 *   - updates the sheet tabs and appends Change Log rows
 *   - signs Cloudinary uploads (API secret stays on the server)
 *
 * POST bodies are sent as text/plain so the browser does not need a CORS
 * preflight (Apps Script web apps cannot answer OPTIONS requests).
 *
 * To replace Google Sheets with another backend later, implement the same
 * functions below against the new API — nothing else needs to change.
 */
import { CONFIG, isPlaceholder } from "../config.js";

export class ApiError extends Error {
  constructor(message, { code = "ERROR", retryable = false, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function isConfigured() {
  const endpoint = CONFIG.googleSheets.apiEndpoint;
  if (isPlaceholder(endpoint)) return false;
  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

async function request(method, { params = {}, body = null } = {}) {
  if (!isConfigured()) {
    throw new ApiError("Google Sheets is not configured yet. Add the Apps Script URL in js/config.js.", { code: "NOT_CONFIGURED" });
  }

  const url = new URL(CONFIG.googleSheets.apiEndpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.googleSheets.timeoutMs);

  try {
    const init =
      method === "GET"
        ? { method: "GET", cache: "no-store", signal: controller.signal }
        : {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(body),
            redirect: "follow",
            signal: controller.signal,
          };

    const response = await fetch(url.href, init);
    if (!response.ok) {
      throw new ApiError(`The server responded with an error (${response.status}).`, {
        code: `HTTP_${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError("The server sent an unexpected response. Check the Apps Script deployment.", { code: "BAD_RESPONSE", retryable: true });
    }

    if (!payload || payload.ok !== true) {
      throw new ApiError(payload?.error || "The request could not be completed.", {
        code: payload?.code || "SERVER_ERROR",
        retryable: payload?.code === "BUSY",
        details: payload,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === "AbortError") {
      throw new ApiError("The server took too long to respond. Please try again.", { code: "TIMEOUT", retryable: true });
    }
    throw new ApiError("Could not reach the server. Check the internet connection and try again.", { code: "NETWORK", retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

/** Health check used by the dashboard's System Status card. */
export const ping = () => request("GET", { params: { action: "ping" } });

/** Visible content for the public website (available dishes, active specials…). */
export const getPublicData = () => request("GET", { params: { action: "public" } }).then((res) => res.data);

/** Everything, including hidden items. Requires a valid sign-in token. */
export const getAdminData = (idToken) => request("POST", { body: { action: "adminData", idToken } }).then((res) => res.data);

/**
 * Apply a batch of changes. ops = [{ opId, op: "upsert" | "delete", entity, record | id }]
 * Resolves to { results: [{ opId, entity, record? }] }.
 */
export const mutate = (ops, idToken) => request("POST", { body: { action: "mutate", ops, idToken } });

export const getChangeLog = (idToken, limit = 60) =>
  request("POST", { body: { action: "changeLog", idToken, limit } }).then((res) => res.data);

/** Signed-upload parameters for Cloudinary (the API secret never leaves Apps Script). */
export const getUploadSignature = (idToken, { folder, folderParam, publicId, tags }) =>
  request("POST", { body: { action: "cloudinarySignature", idToken, folder, folderParam, publicId, tags } });
