/**
 * SIGN-IN PAGE — admin/index.html
 *
 * Owner:    "Sign in with Google" (AUTH_MODE "GOOGLE"). Changes are saved to
 *           Google Sheets and Cloudinary; Apps Script checks ALLOWED_EDITORS
 *           on every save, so hiding this page is not what keeps data safe.
 * Visitors: "Try the demo" (auth.allowDemo, or APP_MODE "DEMO"). The full
 *           dashboard with sample data; changes stay in the visitor's browser.
 */
import { Auth, demoAccessAllowed } from "../../js/auth.js";
import { hydrateIcons, icon } from "../../js/icons.js";
import { $, escapeHtml } from "../../js/utils.js";

const PAGES = ["dashboard", "menu", "thalis", "specials", "gallery", "business"];
const params = new URLSearchParams(location.search);
const next = `${PAGES.includes(params.get("next")) ? params.get("next") : "dashboard"}.html`;
const actions = $("[data-login]");
const message = $("[data-login-message]");

function show(text, tone = "info") {
  message.className = `notice notice--${tone}`;
  message.setAttribute("role", tone === "danger" ? "alert" : "status");
  message.innerHTML = `${icon(tone === "danger" ? "circle-alert" : tone === "warn" ? "triangle-alert" : "info", { size: 18 })}<span>${escapeHtml(text)}</span>`;
  message.hidden = false;
}

hydrateIcons();

if (Auth.isSignedIn() && !params.has("expired")) {
  location.replace(next);
} else {
  if (params.has("expired")) show("Your sign-in has expired. Please sign in again. Unsaved backups are kept on this device.", "warn");
  else if (params.has("demoEnded")) show("You have left the demo. Your demo changes stay in this browser for next time.");
  else if (params.has("signedOut")) show("You have signed out.");
  render();
}

function render() {
  const google = Auth.mode === "GOOGLE";
  const demo = demoAccessAllowed();
  const parts = [];

  if (google) {
    parts.push(`<section class="login-option" aria-labelledby="owner-title">
      <h2 id="owner-title">Owner</h2>
      <p>Sign in with the Google account that has access. Your changes go live on the website.</p>
      <div class="google-btn" data-google-btn></div>
    </section>`);
  }
  if (google && demo) parts.push(`<p class="login-divider" aria-hidden="true"><span>or</span></p>`);
  if (demo && google) {
    parts.push(`<section class="login-option" aria-labelledby="demo-title">
      <h2 id="demo-title">Just looking?</h2>
      <p>Try the full dashboard with sample dishes: add dishes, upload photos and change prices. Everything stays in your browser, and the live website never changes.</p>
      <button class="btn btn--secondary btn--lg btn--block" type="button" data-demo-login>${icon("sparkles")}Try the demo dashboard</button>
    </section>`);
  } else if (demo) {
    parts.push(`<p class="notice notice--warn">${icon("triangle-alert", { size: 18 })}<span><strong>Demo mode.</strong> No password is needed, and changes are saved only in this browser, so you can try everything safely.</span></p>
      <button class="btn btn--primary btn--lg btn--block" type="button" data-demo-login>Enter the demo dashboard</button>`);
  }

  if (!parts.length) {
    actions.innerHTML = "";
    show('Demo sign-in is switched off because the website is in production mode. Set AUTH_MODE to "GOOGLE" in js/config.js (see README).', "danger");
    return;
  }
  actions.innerHTML = parts.join("");

  $("[data-demo-login]", actions)?.addEventListener("click", () => {
    try {
      Auth.signInDemo();
      location.href = next;
    } catch (error) {
      show(error.message, "danger");
    }
  });
  if (google) {
    Auth.renderGoogleButton($("[data-google-btn]", actions), {
      onSuccess: () => location.replace(next),
      onError: (error) => show(error.message, "danger"),
    }).catch((error) => show(error.message, "danger"));
  }
  if (params.has("demo")) $("[data-demo-login]", actions)?.focus();
}
