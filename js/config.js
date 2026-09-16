/**
 * =============================================================================
 *  GHARCHA JEVAN — CENTRAL CONFIGURATION
 * =============================================================================
 *
 *  This is the ONE file to edit when connecting the website to real services.
 *  Every value that starts with  YOUR_  is a placeholder you must replace.
 *  Search this file for "YOUR_" to find them all.
 *
 *  SAFE to put in this file (these values are public by design):
 *    - Cloudinary cloud name and the NAME of an upload preset
 *    - The Google Apps Script Web App URL
 *    - The Google OAuth Client ID (used for "Sign in with Google")
 *    - The Google Sheet ID (the sheet itself stays private to the owner)
 *    - Public contact details (phone, WhatsApp, maps, Instagram)
 *
 *  NEVER put in this file, or anywhere in this repository:
 *    - The Cloudinary API Secret
 *    - Google service-account JSON keys or any private key
 *    - Passwords, admin PINs or any other secret
 *
 *  Secrets belong ONLY in Google Apps Script → Project Settings →
 *  Script properties (see README → "Google Sheets + Apps Script").
 * =============================================================================
 */

/**
 * APP_MODE
 *  "DEMO"        → uses the sample data in /data and stores CMS edits only in
 *                  this browser. Nothing is uploaded anywhere. Safe to share.
 *  "PRODUCTION"  → reads/writes real data through the Google Apps Script API.
 *                  Requires googleSheets.apiEndpoint (and GOOGLE auth below).
 */
export const APP_MODE = "PRODUCTION";

/**
 * AUTH_MODE
 *  "DEMO"    → the CMS opens with a "Enter demo" button. NOT SECURE — it only
 *              works while APP_MODE is "DEMO", where edits never leave the
 *              browser, so nobody can change the public website.
 *  "GOOGLE"  → the owner signs in with her Google account. Every change is
 *              verified again by the Apps Script backend, which only accepts
 *              the e-mail addresses listed in its ALLOWED_EDITORS property.
 */
export const AUTH_MODE = "GOOGLE";

export const CONFIG = {
  appMode: APP_MODE,

  /* ---------------------------------------------------------------------------
   * CLOUDINARY — all production food photos live in the OWNER's account.
   * ------------------------------------------------------------------------- */
  cloudinary: {
    cloudName: "dadtqawh5",        // Cloudinary Console → Dashboard → "Cloud name"
    uploadPreset: "gharcha-jevan",  // Settings → Upload presets → the preset NAME (Unsigned)
    baseFolder: "Gharcha Jevan",               // top-level Cloudinary folder; every photo is filed inside it

    /**
     * "UNSIGNED" → quick start. Uses the unsigned preset above. Leave the
     *              preset's folder EMPTY (the site picks the folder per photo)
     *              and limit it to image formats and 10 MB, because anyone who
     *              reads this file could upload with it.
     * "SIGNED"   → recommended for real use. The Apps Script backend signs each
     *              upload with the API secret (kept in Script properties) after
     *              checking that the owner is signed in.
     */
    uploadMode: "UNSIGNED",

    /**
     * true (default): sends "asset_folder". For accounts with dynamic folders
     *   (upload presets show an "Asset folder" field). Photos are filed in
     *   Gharcha Jevan/menu/fish and so on, folder names may contain spaces, and
     *   photo links stay short (…/image/upload/v1/surmai-fry-mfz1k2abx9q.jpg).
     * false: sends "folder". Only for older fixed-folder accounts (presets show
     *   "Folder"); the folder then becomes part of each photo link, so use a
     *   name without spaces, e.g. baseFolder: "gharcha-jevan".
     */
    useAssetFolder: true,

    maxFileSizeMB: 10,          // Cloudinary free plan limit for images
    maxUploadDimension: 2000,   // photos are resized in the browser before upload (faster on mobile data)
  },

  /* ---------------------------------------------------------------------------
   * GOOGLE SHEETS (via Google Apps Script) — data store, backup and change log.
   * The website never talks to the Sheet directly; the Apps Script web app does.
   * ------------------------------------------------------------------------- */
  googleSheets: {
    spreadsheetId: "YOUR_GOOGLE_SHEET_ID",                 // from the sheet URL: /spreadsheets/d/<THIS PART>/edit
    apiEndpoint: "https://script.google.com/macros/s/AKfycbyVNJy2chBMYh2bsby9Y0sqZPCQNXZ9iq9skXXzRL1GdE8QDeyRgpGLoB00Px0R4zED/exec",    // Deploy → Web app → URL ending in /exec
    tabs: {
      // Must match TABS in assets/google-apps-script/Code.gs
      menu: "Menu",
      thalis: "Thalis",
      specials: "Specials",
      gallery: "Gallery",
      business: "Business Info",
      changeLog: "Change Log",
    },
    timeoutMs: 25000,
  },

  /* ---------------------------------------------------------------------------
   * AUTHENTICATION
   * ------------------------------------------------------------------------- */
  auth: {
    mode: AUTH_MODE,
    googleClientId: "1009318710221-umk4vr6lci1jieiu28jtc5jkpst2aqea.apps.googleusercontent.com",  // Google Cloud → Google Auth Platform → Clients → Web client ID
    /**
     * Let visitors try the dashboard without an account ("Try the demo" on the
     * sign-in page). They get the sample data; their changes and photos stay in
     * their own browser and never reach Google Sheets or Cloudinary.
     */
    allowDemo: true,
    demoSessionHours: 8,
  },

  /* ---------------------------------------------------------------------------
   * WEBSITE
   * ------------------------------------------------------------------------- */
  website: {
    publishedUrl: "YOUR_GITHUB_PAGES_URL",  // e.g. https://YOUR-USERNAME.github.io/gharcha-jevan/
    showDemoNotice: true,                   // the "concept preview" bar shown in DEMO mode
    dashboardInvite: true,                  // live site: a small bar inviting visitors to try the dashboard demo (turn off for a real business)
  },

  /* ---------------------------------------------------------------------------
   * CONTACT — quick-setup defaults.
   * Values saved later in Admin → Business info take priority over these.
   * ------------------------------------------------------------------------- */
  contact: {
    whatsapp: "YOUR_WHATSAPP_NUMBER",   // digits with country code, e.g. 919XXXXXXXXX
    phone: "YOUR_PHONE_NUMBER",         // e.g. +91 9XXXX XXXXX
    mapsUrl: "YOUR_GOOGLE_MAPS_URL",    // Google Maps → Share → Copy link
    instagram: "YOUR_INSTAGRAM_URL",    // e.g. https://www.instagram.com/<handle>/
    whatsappMessage: "Hello! I would like to place an order with Gharcha Jevan.",
  },
};

/* -----------------------------------------------------------------------------
 * Aliases matching the names used in the project brief.
 * --------------------------------------------------------------------------- */
export const CLOUDINARY_CONFIG = {
  cloudName: CONFIG.cloudinary.cloudName,
  uploadPreset: CONFIG.cloudinary.uploadPreset,
  folder: CONFIG.cloudinary.baseFolder,
};

export const SHEETS_CONFIG = {
  spreadsheetId: CONFIG.googleSheets.spreadsheetId,
  menuSheet: CONFIG.googleSheets.tabs.menu,
  thaliSheet: CONFIG.googleSheets.tabs.thalis,
  specialsSheet: CONFIG.googleSheets.tabs.specials,
  gallerySheet: CONFIG.googleSheets.tabs.gallery,
  businessSheet: CONFIG.googleSheets.tabs.business,
  changeLogSheet: CONFIG.googleSheets.tabs.changeLog,
};

export const API_CONFIG = {
  endpoint: CONFIG.googleSheets.apiEndpoint,
};

/**
 * True when a value is missing or still a placeholder such as
 * "YOUR_CLOUDINARY_CLOUD_NAME", "https://YOUR-USERNAME…" or "[PHONE NUMBER]".
 */
export function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  const text = String(value).trim();
  return text === "" || /YOUR[_-]/i.test(text) || /^\[[^\]]*\]$/.test(text);
}
