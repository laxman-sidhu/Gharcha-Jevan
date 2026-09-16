/**
 * SYSTEM STATUS — powers the "System status" card on the CMS dashboard,
 * so it is obvious what is configured and what still needs setting up.
 */
import { CONFIG } from "../config.js";
import { getMode } from "./api.js";
import * as cloudinary from "./cloudinary.js";
import * as sheets from "./sheets.js";
import { Auth } from "../auth.js";

/** Static checks (no network). tone: "ok" | "warn" | "danger" | "info" */
export function getSystemStatus() {
  const mode = getMode();
  const cloud = cloudinary.getStatus();
  const demo = mode === "DEMO";
  const liveSite = CONFIG.appMode === "PRODUCTION";
  const authStatus = demo ? { tone: "warn", text: "Demo Mode" } : Auth.getProviderStatus();

  return [
    {
      key: "website",
      label: "Website",
      icon: "store",
      ...(mode === "DEMO"
        ? { tone: "ok", text: "Demo Ready", hint: "Showing sample content from assets/data" }
        : mode === "PRODUCTION"
          ? { tone: "info", text: "Checking…", hint: "Live data from Google Sheets" }
          : { tone: "danger", text: "Not Configured", hint: "APP_MODE is PRODUCTION but the Apps Script URL is missing" }),
    },
    {
      key: "cloudinary",
      label: "Cloudinary",
      icon: "cloud",
      ...(demo
        ? { tone: "info", text: "Not used in demo", hint: "In demo mode, photos stay in this browser" }
        : cloud.configured
          ? { tone: "ok", text: "Connected", hint: cloud.detail }
          : { tone: "warn", text: "Not Configured", hint: cloud.detail }),
    },
    {
      key: "sheets",
      label: "Google Sheets",
      icon: "sheet",
      ...(!sheets.isConfigured()
        ? { tone: "warn", text: "Not Configured", hint: "Add googleSheets.apiEndpoint in js/config.js" }
        : mode === "PRODUCTION"
          ? { tone: "info", text: "Checking…", hint: "Apps Script web app" }
          : liveSite
            ? { tone: "info", text: "Not used in demo", hint: "The live website uses it; demo changes stay in this browser" }
            : { tone: "info", text: "Configured", hint: "Switch APP_MODE to PRODUCTION to use it" }),
    },
    {
      key: "auth",
      label: "Authentication",
      icon: "shield-check",
      tone: authStatus.tone,
      text: authStatus.text,
      hint: demo
        ? liveSite
          ? "Demo visit: no sign-in, changes stay in this browser"
          : "No password, for the concept demo only"
        : "Sign in with Google, verified by Apps Script",
    },
  ];
}

/** Live check against the Apps Script backend. Resolves to updates for the status rows. */
export async function checkConnection() {
  if (!sheets.isConfigured()) return {};
  const started = performance.now();
  try {
    const result = await sheets.ping();
    const ms = Math.round(performance.now() - started);
    const ready = result.sheetsReady !== false;
    const live = CONFIG.appMode === "PRODUCTION";
    return {
      sheets: ready
        ? { tone: "ok", text: "Connected", hint: `Responded in ${ms} ms` }
        : { tone: "warn", text: "Sheet tabs missing", hint: "Run setupSheets() once in Apps Script" },
      ...(live ? { website: { tone: ready ? "ok" : "warn", text: ready ? "Connected" : "Needs setup", hint: "Live data from Google Sheets" } } : {}),
    };
  } catch (error) {
    return {
      sheets: { tone: "danger", text: "Connection failed", hint: error.message },
      ...(CONFIG.appMode === "PRODUCTION" ? { website: { tone: "danger", text: "Offline", hint: "Visitors may see cached data only" } } : {}),
    };
  }
}
