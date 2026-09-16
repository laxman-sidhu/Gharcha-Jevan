/**
 * AUTHENTICATION
 *
 * One small interface, two providers:
 *
 *   DEMO    — a "Enter demo" button, no password. It is deliberately NOT a
 *             security feature: it only works while APP_MODE is "DEMO", where
 *             every edit stays inside the visitor's own browser, so the public
 *             website can never be changed through it.
 *
 *   GOOGLE  — "Sign in with Google" (Google Identity Services). The browser
 *             receives a short-lived ID token (about 1 hour) and sends it with
 *             every write. The Apps Script backend verifies that token with
 *             Google and checks the e-mail against its ALLOWED_EDITORS list.
 *             The real security check therefore happens on the server.
 *
 * PRODUCTION SETUP
 *   1. Create an OAuth Client ID (type "Web application") in Google Cloud.
 *      Authorised JavaScript origin: https://YOUR-USERNAME.github.io
 *   2. Put the Client ID in js/config.js → auth.googleClientId and set
 *      AUTH_MODE = "GOOGLE".
 *   3. Put the same Client ID and the owner's e-mail in the Apps Script
 *      Script properties GOOGLE_CLIENT_ID and ALLOWED_EDITORS.
 *
 * Never replace this with a password checked in JavaScript — anything in the
 * browser can be read and bypassed.
 *
 * The session (name, e-mail, token expiry) is kept in sessionStorage, which
 * is cleared when the tab is closed. No passwords or secrets are stored.
 */
import { CONFIG, APP_MODE, isPlaceholder } from "./config.js";
import { session, storage } from "./utils.js";

const SESSION_KEY = "gj.session.v1";
/** localStorage, so every tab of the website knows this browser is trying the demo. */
export const DEMO_PREVIEW_KEY = "gj.demo-preview.v1";
const GIS_SRC = "https://accounts.google.com/gsi/client";

export class AuthError extends Error {
  constructor(message, code = "AUTH") {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

function decodeJwtPayload(token) {
  const part = String(token).split(".")[1] || "";
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

let gisPromise = null;
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => {
        gisPromise = null;
        reject(new AuthError("Google Sign-In could not be loaded. Check the internet connection."));
      };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

/**
 * Can visitors open the dashboard without an account?
 *   APP_MODE "DEMO": yes, the whole site is a demo.
 *   Live site: only when auth.allowDemo is true. Their changes stay in their own
 *   browser, and the Apps Script still refuses any write without an allowed
 *   Google sign-in, so the demo can never touch real data.
 */
export function demoAccessAllowed() {
  if (APP_MODE === "DEMO") return CONFIG.auth.mode === "DEMO" || CONFIG.auth.allowDemo !== false;
  return CONFIG.auth.mode === "GOOGLE" && CONFIG.auth.allowDemo === true;
}

/** True while this browser is trying the demo on a live site (the website then shows the visitor's demo data). */
export function isDemoPreview() {
  if (APP_MODE === "DEMO" || !demoAccessAllowed()) return false;
  const until = Number(storage.get(DEMO_PREVIEW_KEY, 0)) || 0;
  if (until > Date.now()) return true;
  if (until) storage.remove(DEMO_PREVIEW_KEY);
  return false;
}

/** Leave the demo: the website shows live data again. Demo changes stay saved for next time. */
export function endDemoPreview() {
  storage.remove(DEMO_PREVIEW_KEY);
  if (APP_MODE !== "DEMO" && session.get(SESSION_KEY)?.provider === "demo") session.remove(SESSION_KEY);
}

export const Auth = {
  get mode() {
    return CONFIG.auth.mode === "GOOGLE" ? "GOOGLE" : "DEMO";
  },

  /** Is the configured provider usable at all? */
  getProviderStatus() {
    if (this.mode === "DEMO") {
      return APP_MODE === "DEMO"
        ? { ready: true, tone: "warn", text: "Demo Mode" }
        : { ready: false, tone: "danger", text: "Blocked: production needs Google sign-in" };
    }
    if (isPlaceholder(CONFIG.auth.googleClientId)) {
      return { ready: false, tone: "warn", text: "Google Client ID missing" };
    }
    return { ready: true, tone: "ok", text: "Production" };
  },

  getSession() {
    const current = session.get(SESSION_KEY);
    if (!current) return null;
    const expired = !current.expiresAt || current.expiresAt <= Date.now();
    const allowed =
      current.provider === "demo"
        ? demoAccessAllowed() && (APP_MODE === "DEMO" || isDemoPreview())
        : current.provider === this.mode.toLowerCase();
    if (expired || !allowed) {
      session.remove(SESSION_KEY);
      return null;
    }
    return current;
  },

  isDemoSession() {
    return this.getSession()?.provider === "demo";
  },

  isSignedIn() {
    return Boolean(this.getSession());
  },

  /** Minutes until a Google session expires (null for demo). */
  minutesLeft() {
    const current = this.getSession();
    if (!current || current.provider !== "google") return null;
    return Math.max(0, Math.round((current.expiresAt - Date.now()) / 60000));
  },

  signInDemo() {
    if (!demoAccessAllowed()) {
      throw new AuthError(
        APP_MODE === "DEMO" ? "Demo sign-in is switched off." : "The demo dashboard is switched off (auth.allowDemo in js/config.js).",
        "DEMO_BLOCKED"
      );
    }
    const expiresAt = Date.now() + CONFIG.auth.demoSessionHours * 3600 * 1000;
    if (APP_MODE !== "DEMO") {
      try {
        storage.set(DEMO_PREVIEW_KEY, expiresAt);
      } catch {
        throw new AuthError("This browser blocks local storage, so the demo can't run here.", "DEMO_BLOCKED");
      }
    }
    const demoSession = { provider: "demo", name: "Demo Owner", email: "demo@example.com", expiresAt };
    session.set(SESSION_KEY, demoSession);
    return demoSession;
  },

  /** Renders Google's own sign-in button into `container`. */
  async renderGoogleButton(container, { onSuccess, onError } = {}) {
    if (this.mode !== "GOOGLE") throw new AuthError("Google sign-in is not enabled.");
    if (isPlaceholder(CONFIG.auth.googleClientId)) {
      throw new AuthError("Google sign-in needs a Client ID in js/config.js (auth.googleClientId).", "NOT_CONFIGURED");
    }
    const google = await loadGoogleIdentity();
    google.accounts.id.initialize({
      client_id: CONFIG.auth.googleClientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        try {
          const newSession = this.acceptGoogleCredential(response.credential);
          onSuccess?.(newSession);
        } catch (error) {
          onError?.(error);
        }
      },
    });
    google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: Math.min(container.clientWidth || 320, 400),
    });
  },

  acceptGoogleCredential(credential) {
    if (!credential) throw new AuthError("Google did not return a sign-in token.");
    const payload = decodeJwtPayload(credential); // display only — the server verifies the token
    storage.remove(DEMO_PREVIEW_KEY); // the owner works on live data
    const googleSession = {
      provider: "google",
      name: payload.given_name || payload.name || payload.email,
      email: payload.email,
      picture: payload.picture || "",
      idToken: credential,
      expiresAt: Number(payload.exp) * 1000,
    };
    session.set(SESSION_KEY, googleSession);
    return googleSession;
  },

  /** Token sent to Apps Script with every write. Null in demo mode. */
  getIdToken() {
    return this.getSession()?.idToken || null;
  },

  userLabel() {
    const current = this.getSession();
    return current?.email && current.provider === "google" ? current.email : "Demo Owner";
  },

  signOut() {
    const current = session.get(SESSION_KEY);
    session.remove(SESSION_KEY);
    if (current?.provider === "demo") storage.remove(DEMO_PREVIEW_KEY);
    if (current?.provider === "google" && window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  },
};
