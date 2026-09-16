/**
 * Gharcha Jevan — Google Apps Script backend
 * =================================================
 * Google Sheets is the backup and business data store. The website never
 * talks to the sheet directly; it calls this Web App.
 *
 * SET-UP (step by step in assets/SETUP-GUIDE.md, Part 2)
 *   1. Create a Google Sheet. Extensions → Apps Script. Paste this file as Code.gs
 *      and replace appsscript.json with the one next to this file.
 *   2. Run setupSheets() once (it creates the tabs and header rows).
 *   3. Project Settings → Script properties:
 *        GOOGLE_CLIENT_ID        same value as auth.googleClientId in js/config.js
 *        ALLOWED_EDITORS         comma-separated Google accounts, e.g. owner@gmail.com
 *      For deleting unused photos from Cloudinary, and for SIGNED uploads:
 *        CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *        CLOUDINARY_BASE_FOLDER  (default: Gharcha Jevan; must match cloudinary.baseFolder in js/config.js)
 *        CLOUDINARY_AUTO_DELETE  (default: true; "false" keeps every old photo)
 *        CLOUDINARY_CLEANUP_GRACE_HOURS (default: 168; cleanupCloudinary() leaves newer photos alone)
 *      Only if this script is NOT created from inside the sheet:
 *        SPREADSHEET_ID
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me      Who has access: Anyone
 *      Copy the URL ending in /exec into googleSheets.apiEndpoint in js/config.js.
 *      After editing this file later, use Deploy → Manage deployments → Edit →
 *      Version: New version, so the same URL keeps working.
 *   5. Now and then, run cleanupCloudinary() from the editor to remove unused photos.
 *
 * KEEPING CLOUDINARY TIDY
 *   - Deleting an item in the dashboard, or replacing/removing its photo, deletes
 *     the old photo from Cloudinary straight away, unless another row still uses
 *     it. Only photos tagged "gj-cms" (uploaded by the dashboard) are ever deleted.
 *   - cleanupCloudinary() deletes gj-cms photos that no row uses any more, for
 *     example after a row was deleted by hand in the sheet. It skips photos newer
 *     than the grace period, so an upload waiting to be saved is never lost.
 *
 * API (all responses are JSON: { ok: true, ... } or { ok: false, error, code })
 *   GET  ?action=ping                         → { ok, sheetsReady }
 *   GET  ?action=public                       → { ok, data }   visible items only
 *   POST { action: "adminData", idToken }     → { ok, data }   everything
 *   POST { action: "mutate", idToken, ops }   → { ok, results, cleanup }
 *   POST { action: "changeLog", idToken, limit }                   → { ok, data }
 *   POST { action: "cloudinarySignature", idToken, folder, folderParam, publicId, tags }
 *                                             → { ok, apiKey, cloudName, signature, params }
 *
 * The website sends POST bodies as text/plain, so browsers skip the CORS
 * preflight that Apps Script cannot answer.
 */

/* ---------------------------------------------------------------------------
 * Sheet structure — must match js/services/schema.js (field key → header)
 * ------------------------------------------------------------------------- */

const TABS = {
  menu: "Menu",
  thalis: "Thalis",
  specials: "Specials",
  gallery: "Gallery",
  business: "Business Info",
  changeLog: "Change Log",
};

const COLUMNS = {
  menu: [
    ["id", "ID"], ["category", "Category"], ["name", "Name"], ["description", "Description"],
    ["price", "Price"], ["available", "Available"], ["featured", "Featured"], ["image", "Image URL"],
    ["imagePublicId", "Cloudinary Public ID"], ["displayOrder", "Display Order"],
    ["createdAt", "Created At"], ["updatedAt", "Updated At"],
  ],
  thalis: [
    ["id", "ID"], ["name", "Name"], ["description", "Description"], ["price", "Price"], ["items", "Items"],
    ["available", "Available"], ["featured", "Featured"], ["image", "Image URL"],
    ["imagePublicId", "Cloudinary Public ID"], ["displayOrder", "Display Order"],
    ["createdAt", "Created At"], ["updatedAt", "Updated At"],
  ],
  specials: [
    ["id", "ID"], ["name", "Name"], ["description", "Description"], ["price", "Price"],
    ["available", "Available"], ["image", "Image URL"], ["imagePublicId", "Cloudinary Public ID"],
    ["startDate", "Start Date"], ["endDate", "End Date"], ["active", "Active"], ["updatedAt", "Updated At"],
  ],
  gallery: [
    ["id", "ID"], ["image", "Image URL"], ["imagePublicId", "Cloudinary Public ID"], ["category", "Category"],
    ["caption", "Caption"], ["displayOrder", "Display Order"], ["active", "Active"], ["createdAt", "Created At"],
  ],
  // Business Info is stored as a two-column list (names in column A, values in column B).
  business: [
    ["businessName", "Business Name"], ["tagline", "Tagline"], ["phone", "Phone"], ["whatsapp", "WhatsApp"],
    ["address", "Address"], ["mapsUrl", "Google Maps URL"], ["instagramUrl", "Instagram URL"],
    ["openingHours", "Opening Hours"], ["aboutText", "About Text"], ["heroImage", "Hero Image URL"],
    ["heroImagePublicId", "Hero Image Public ID"], ["aboutImage", "About Image URL"],
    ["aboutImagePublicId", "About Image Public ID"],
  ],
  changeLog: [
    ["timestamp", "Timestamp"], ["action", "Action"], ["entityType", "Entity Type"], ["entityId", "Entity ID"],
    ["field", "Field"], ["oldValue", "Old Value"], ["newValue", "New Value"], ["user", "User"],
  ],
};

const BOOLEAN_FIELDS = ["available", "featured", "active"];
const NUMBER_LIMITS = { price: 100000, displayOrder: 9999 };
const DATE_FIELDS = ["startDate", "endDate"];
const URL_FIELDS = ["image", "mapsUrl", "instagramUrl", "heroImage", "aboutImage"];
const MAX_LENGTH = {
  name: 90, description: 300, caption: 120, businessName: 80, tagline: 120, phone: 40, whatsapp: 40,
  address: 300, openingHours: 300, aboutText: 1200, id: 80, imagePublicId: 300,
  heroImagePublicId: 300, aboutImagePublicId: 300, image: 2000, heroImage: 2000, aboutImage: 2000,
  mapsUrl: 2000, instagramUrl: 2000,
};
const CHOICES = {
  menu: { category: ["Fish", "Chicken", "Thali", "Specials", "Other"] },
  gallery: { category: ["Food", "Fish", "Chicken", "Thali", "Restaurant", "Events"] },
};
/* Columns stored as plain text so Sheets never turns them into numbers or dates. */
const TEXT_COLUMNS = ["id", "phone", "whatsapp", "startDate", "endDate", "createdAt", "updatedAt", "timestamp", "entityId", "oldValue", "newValue", "items"];
/* Not written to the Change Log (same list as js/services/changelog.js). */
const NOT_LOGGED = ["id", "createdAt", "updatedAt", "imagePublicId", "heroImagePublicId", "aboutImagePublicId"];

const PUBLIC_CACHE_KEY = "public-data-v1";
const HEADER_COLOUR = "#f4ede2";
const PUBLIC_CACHE_SECONDS = 120;

/* ---------------------------------------------------------------------------
 * Entry points
 * ------------------------------------------------------------------------- */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "ping";
  try {
    if (action === "ping") return json_({ ok: true, sheetsReady: sheetsReady_(), time: new Date().toISOString() });
    if (action === "public") return json_({ ok: true, data: publicData_() });
    return fail_("Unknown request.", "BAD_REQUEST");
  } catch (err) {
    return fail_(messageOf_(err), err.code || "SERVER_ERROR");
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return fail_("The request was not valid JSON.", "BAD_REQUEST");
  }
  try {
    const user = verifyUser_(body.idToken);
    switch (body.action) {
      case "adminData":
        return json_({ ok: true, data: readAll_() });
      case "mutate":
        return mutate_(body.ops, user);
      case "changeLog":
        return json_({ ok: true, data: readChangeLog_(Math.min(Number(body.limit) || 60, 500)) });
      case "cloudinarySignature":
        return json_(Object.assign({ ok: true }, signUpload_(body)));
      default:
        return fail_("Unknown request.", "BAD_REQUEST");
    }
  } catch (err) {
    return fail_(messageOf_(err), err.code || "SERVER_ERROR");
  }
}

/**
 * Run once from the Apps Script editor (select setupSheets → Run).
 * Safe to run again: it only adds missing tabs and missing header columns.
 */
function setupSheets() {
  const book = spreadsheet_();
  Object.keys(TABS).forEach(function (entity) {
    let sheet = book.getSheetByName(TABS[entity]);
    if (!sheet) sheet = book.insertSheet(TABS[entity]);
    if (entity === "business") {
      setupBusinessSheet_(sheet); // two columns: field names in A, values in B
      return;
    }
    const existing = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
    const missing = COLUMNS[entity].map(function (c) { return c[1]; }).filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    const headers = headers_(sheet);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground(HEADER_COLOUR);
    COLUMNS[entity].forEach(function (c) {
      if (TEXT_COLUMNS.indexOf(c[0]) === -1) return;
      const col = headers.indexOf(c[1]) + 1;
      if (col > 0) sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    });
  });
  CacheService.getScriptCache().remove(PUBLIC_CACHE_KEY);
  Logger.log("Sheets are ready: " + Object.keys(TABS).map(function (k) { return TABS[k]; }).join(", "));
}

/* ---------------------------------------------------------------------------
 * Business Info: one record, laid out as a two-column list
 *
 *     A               B
 *  1  Field           Value
 *  2  Business Name   Gharcha Jevan
 *  3  Tagline         Food that tastes like home
 *  …
 * Rows are found by the name in column A, so their order doesn't matter.
 * The older one-row layout (names across row 1, values in row 2) is still
 * read, and is converted automatically by setupSheets() or the next save.
 * ------------------------------------------------------------------------- */

const BUSINESS_DEFAULTS = {
  businessName: "Gharcha Jevan",
  tagline: "Food that tastes like home",
  phone: "[PHONE NUMBER]",
  whatsapp: "[WHATSAPP NUMBER]",
  address: "[BUSINESS ADDRESS]",
  mapsUrl: "[GOOGLE MAPS LINK]",
  instagramUrl: "[INSTAGRAM LINK]",
  openingHours: "[OPENING HOURS]",
};

const normLabel_ = function (value) { return String(value == null ? "" : value).trim().toLowerCase(); };

/** "vertical" | "horizontal" | "empty" | "unknown" */
function businessLayout_(sheet) {
  if (sheet.getLastRow() === 0) return "empty";
  const rows = Math.min(sheet.getLastRow(), 40);
  const colA = sheet.getRange(1, 1, rows, 1).getValues().map(function (r) { return normLabel_(r[0]); });
  const row1 = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(normLabel_);
  if (colA[0] === "field" || colA.indexOf("tagline") > 0) return "vertical";
  if (row1.indexOf("tagline") > 0) return "horizontal";
  return "unknown";
}

function readBusiness_(sheet) {
  const layout = businessLayout_(sheet);
  const record = {};
  if (layout === "vertical") {
    const values = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
    const byLabel = {};
    values.forEach(function (row) {
      const label = normLabel_(row[0]);
      if (label && !(label in byLabel)) byLabel[label] = row[1];
    });
    COLUMNS.business.forEach(function (c) {
      const value = byLabel[normLabel_(c[1])];
      record[c[0]] = fromCell_(c[0], value === undefined ? "" : value);
    });
    return record;
  }
  if (layout === "horizontal" && sheet.getLastRow() >= 2) {
    const values = sheet.getRange(1, 1, 2, sheet.getLastColumn()).getValues();
    const labels = values[0].map(normLabel_);
    COLUMNS.business.forEach(function (c) {
      const index = labels.indexOf(normLabel_(c[1]));
      record[c[0]] = fromCell_(c[0], index === -1 ? "" : values[1][index]);
    });
    return record;
  }
  return null;
}

/** Creates the two-column layout, converting the older one-row layout and keeping its values. */
function setupBusinessSheet_(sheet) {
  const layout = businessLayout_(sheet);
  if (layout === "unknown") {
    throw new Error('The "' + TABS.business + '" tab has an unexpected layout. Rename or clear it, then run setupSheets() again.');
  }
  const current = layout === "empty" ? null : readBusiness_(sheet);
  const hasValues = current && COLUMNS.business.some(function (c) { return current[c[0]] !== ""; });
  const record = cleanRecord_("business", hasValues ? current : BUSINESS_DEFAULTS, null);
  if (layout === "horizontal") sheet.clear();

  const count = COLUMNS.business.length;
  sheet.getRange(1, 1, 1, 2).setValues([["Field", "Value"]]);
  sheet.getRange(2, 2, count, 1).setNumberFormat("@"); // phone numbers and links stay plain text
  if (layout !== "vertical") {
    sheet.getRange(2, 1, count, 2).setValues(COLUMNS.business.map(function (c) { return [c[1], toCell_(c[0], record[c[0]])]; }));
  } else {
    writeBusiness_(sheet, record); // keeps the owner's row order and any extra notes
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground(HEADER_COLOUR);
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).setFontWeight("bold");
  sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).setWrap(true);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 480);
}

/** Writes values into column B, next to their names in column A (missing names are added at the end). */
function writeBusiness_(sheet, record) {
  if (businessLayout_(sheet) !== "vertical") {
    setupBusinessSheet_(sheet);
  }
  const grid = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
  const labels = grid.map(function (row) { return normLabel_(row[0]); });
  COLUMNS.business.forEach(function (c) {
    let index = labels.indexOf(normLabel_(c[1]));
    if (index === -1) {
      grid.push([c[1], ""]);
      labels.push(normLabel_(c[1]));
      index = grid.length - 1;
    }
    grid[index][1] = toCell_(c[0], record[c[0]]);
  });
  sheet.getRange(2, 2, grid.length - 1, 1).setNumberFormat("@");
  sheet.getRange(1, 1, grid.length, 2).setValues(grid);
}

/* ---------------------------------------------------------------------------
 * Authentication — every POST must carry a valid Google ID token
 * ------------------------------------------------------------------------- */

function verifyUser_(idToken) {
  if (!idToken) throw codeError_("Please sign in again.", "UNAUTHORIZED");
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty("GOOGLE_CLIENT_ID");
  const allowed = String(props.getProperty("ALLOWED_EDITORS") || "")
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(String);
  if (!clientId || !allowed.length) {
    throw codeError_("The backend is not set up yet: add GOOGLE_CLIENT_ID and ALLOWED_EDITORS in Script properties.", "NOT_CONFIGURED");
  }

  const cache = CacheService.getScriptCache();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken, Utilities.Charset.UTF_8);
  const cacheKey = "tok_" + Utilities.base64EncodeWebSafe(digest).slice(0, 43);
  let info = null;
  const cached = cache.get(cacheKey);
  if (cached) {
    info = JSON.parse(cached);
  } else {
    const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw codeError_("Your sign-in has expired. Please sign in again.", "UNAUTHORIZED");
    info = JSON.parse(response.getContentText());
    const secondsLeft = Number(info.exp) - Math.floor(Date.now() / 1000);
    if (secondsLeft > 30) cache.put(cacheKey, JSON.stringify(info), Math.min(300, secondsLeft - 10));
  }

  if (info.aud !== clientId) throw codeError_("This sign-in does not belong to this website.", "UNAUTHORIZED");
  if (["accounts.google.com", "https://accounts.google.com"].indexOf(info.iss) === -1) throw codeError_("Unknown sign-in provider.", "UNAUTHORIZED");
  if (Number(info.exp) * 1000 <= Date.now()) throw codeError_("Your sign-in has expired. Please sign in again.", "UNAUTHORIZED");
  if (String(info.email_verified) !== "true") throw codeError_("Please use a verified Google account.", "FORBIDDEN");
  const email = String(info.email || "").toLowerCase();
  if (allowed.indexOf(email) === -1) throw codeError_("The account " + email + " is not allowed to edit this website.", "FORBIDDEN");
  return email;
}

/* ---------------------------------------------------------------------------
 * Reading
 * ------------------------------------------------------------------------- */

function publicData_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(PUBLIC_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const all = readAll_();
  const data = {
    business: all.business,
    menu: all.menu.filter(function (r) { return r.available; }),
    thalis: all.thalis.filter(function (r) { return r.available; }),
    specials: all.specials.filter(function (r) { return r.active; }),   // date windows are checked in the browser
    gallery: all.gallery.filter(function (r) { return r.active; }),
  };
  const text = JSON.stringify(data);
  if (text.length < 95000) cache.put(PUBLIC_CACHE_KEY, text, PUBLIC_CACHE_SECONDS);
  return data;
}

function readAll_() {
  const strip = function (r) { const copy = Object.assign({}, r); delete copy._row; return copy; };
  return {
    business: strip(readTable_("business")[0] || {}),
    menu: readTable_("menu").map(strip),
    thalis: readTable_("thalis").map(strip),
    specials: readTable_("specials").map(strip),
    gallery: readTable_("gallery").map(strip),
  };
}

function readTable_(entity) {
  const sheet = sheet_(entity);
  if (entity === "business") {
    const record = readBusiness_(sheet);
    return record ? [record] : [];
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = values[0].map(String);
  const records = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const record = { _row: i + 1 };
    COLUMNS[entity].forEach(function (c) {
      const index = headers.indexOf(c[1]);
      record[c[0]] = fromCell_(c[0], index === -1 ? "" : row[index]);
    });
    if (record.id) records.push(record);
  }
  return records;
}

function readChangeLog_(limit) {
  const sheet = sheet_("changeLog");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const count = Math.min(limit, lastRow - 1);
  const headers = headers_(sheet);
  const values = sheet.getRange(lastRow - count + 1, 1, count, sheet.getLastColumn()).getValues();
  return values.reverse().map(function (row) {
    const entry = {};
    COLUMNS.changeLog.forEach(function (c) {
      const index = headers.indexOf(c[1]);
      let value = index === -1 ? "" : row[index];
      if (value instanceof Date) value = value.toISOString();
      entry[c[0]] = String(value);
    });
    return entry;
  });
}

/* ---------------------------------------------------------------------------
 * Writing
 * ------------------------------------------------------------------------- */

function mutate_(ops, user) {
  if (!Array.isArray(ops) || !ops.length) return json_({ ok: true, results: [] });
  if (ops.length > 50) return fail_("Too many changes at once. Please try again.", "BAD_REQUEST");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_("The sheet is busy. Please try again in a moment.", "BUSY");
  const cache = CacheService.getScriptCache();
  const results = [];
  const dropped = [];
  let failure = null;
  try {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i] || {};
      const doneKey = op.opId ? "op_" + String(op.opId).slice(0, 80) : "";
      if (doneKey && cache.get(doneKey)) {
        results.push({ opId: op.opId, entity: op.entity, duplicate: true }); // already applied (retry after a lost response)
        continue;
      }
      try {
        const result = applyOp_(op, user);
        (result.dropped || []).forEach(function (id) { dropped.push(id); });
        delete result.dropped;
        results.push(Object.assign({ opId: op.opId }, result));
        if (doneKey) cache.put(doneKey, "1", 21600);
      } catch (err) {
        failure = { message: "Change " + (i + 1) + " could not be saved: " + messageOf_(err), code: err.code || "SERVER_ERROR" };
        break;
      }
    }
    // Photos the saved changes no longer use (never throws).
    const cleanup = deleteUnusedPhotos_(dropped);
    if (failure) return fail_(failure.message, failure.code, { results: results });
    return json_({ ok: true, results: results, cleanup: cleanup });
  } finally {
    cache.remove(PUBLIC_CACHE_KEY);
    lock.releaseLock();
  }
}

function applyOp_(op, user) {
  const entity = op.entity;
  if (!TABS[entity] || entity === "changeLog") throw codeError_("Unknown section.", "BAD_REQUEST");
  const sheet = sheet_(entity);
  const headers = headers_(sheet);
  const now = new Date().toISOString();

  if (entity === "business") {
    if (op.op !== "upsert") throw codeError_("Business info cannot be deleted.", "BAD_REQUEST");
    const before = readTable_("business")[0] || null;
    const record = cleanRecord_("business", op.record || {}, before);
    if (!record.businessName) throw codeError_("Business name is required.", "INVALID");
    writeBusiness_(sheet, record);
    logChanges_(before ? "update" : "create", "business", "business", before, record, user, now);
    return { entity: "business", record: record, dropped: droppedPhotoIds_("business", before, record) };
  }

  const id = String((op.record && op.record.id) || op.id || "");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw codeError_("Invalid item ID.", "BAD_REQUEST");
  const rows = readTable_(entity);
  const before = rows.filter(function (r) { return r.id === id; })[0] || null;

  if (op.op === "delete") {
    if (before) {
      sheet.deleteRow(before._row);
      logChanges_("delete", entity, id, before, null, user, now);
    }
    return { entity: entity, id: id, deleted: true, dropped: droppedPhotoIds_(entity, before, null) };
  }
  if (op.op !== "upsert") throw codeError_("Unknown change type.", "BAD_REQUEST");

  const record = cleanRecord_(entity, op.record || {}, before);
  record.id = id;
  if (entity === "gallery" && !record.image) throw codeError_("A photo is required.", "INVALID");
  if (entity !== "gallery" && !record.name) throw codeError_("Name is required.", "INVALID");
  if (entity === "specials" && record.startDate && record.endDate && record.endDate < record.startDate) {
    throw codeError_("The end date is before the start date.", "INVALID");
  }
  if (hasField_(entity, "createdAt")) record.createdAt = (before && before.createdAt) || now;
  if (hasField_(entity, "updatedAt")) record.updatedAt = now;

  writeRow_(sheet, headers, before ? before._row : sheet.getLastRow() + 1, entity, record);
  logChanges_(before ? "update" : "create", entity, id, before, record, user, now);
  return { entity: entity, record: record, dropped: droppedPhotoIds_(entity, before, record) };
}

/** Trusts nothing from the browser: every value is typed, trimmed and checked here. */
function cleanRecord_(entity, input, before) {
  const out = {};
  COLUMNS[entity].forEach(function (c) {
    const key = c[0];
    let value = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : before ? before[key] : undefined;

    if (BOOLEAN_FIELDS.indexOf(key) !== -1) {
      value = value === undefined ? key !== "featured" : value === true || String(value).toLowerCase() === "true";
    } else if (NUMBER_LIMITS[key] !== undefined) {
      value = Number(value);
      if (!isFinite(value) || value < 0) value = 0;
      if (value > NUMBER_LIMITS[key]) throw codeError_(c[1] + " is too large.", "INVALID");
      value = Math.round(value * 100) / 100;
    } else if (key === "items") {
      value = (Array.isArray(value) ? value : String(value || "").split(/\r?\n/))
        .map(function (s) { return String(s).trim().slice(0, 60); })
        .filter(String)
        .slice(0, 20);
    } else if (DATE_FIELDS.indexOf(key) !== -1) {
      value = value instanceof Date ? isoDate_(value) : String(value || "").trim().slice(0, 10);
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw codeError_(c[1] + " must look like 2026-09-15.", "INVALID");
    } else {
      value = value === undefined || value === null ? "" : String(value).trim();
      if (MAX_LENGTH[key] && value.length > MAX_LENGTH[key]) throw codeError_(c[1] + " is too long.", "INVALID");
    }

    if (URL_FIELDS.indexOf(key) !== -1 && value && !/^https:\/\//i.test(value) && !/^\[[^\]]*\]$/.test(value)) {
      throw codeError_(c[1] + " must be a link starting with https://", "INVALID");
    }
    const choices = CHOICES[entity] && CHOICES[entity][key];
    if (choices && choices.indexOf(value) === -1) value = choices[choices.length - 1] === "Other" ? "Other" : choices[0];
    out[key] = value;
  });
  return out;
}

function writeRow_(sheet, headers, rowIndex, entity, record) {
  const width = Math.max(headers.length, 1);
  const row = rowIndex <= sheet.getLastRow() ? sheet.getRange(rowIndex, 1, 1, width).getValues()[0] : new Array(width).fill("");
  COLUMNS[entity].forEach(function (c) {
    const index = headers.indexOf(c[1]);
    if (index !== -1) row[index] = toCell_(c[0], record[c[0]]);
  });
  sheet.getRange(rowIndex, 1, 1, width).setValues([row]);
}

function logChanges_(action, entity, id, before, after, user, now) {
  const nameOf = function (r) { return r ? r.name || r.caption || r.businessName || "" : ""; };
  const rows = [];
  if (action === "create") {
    rows.push({ field: "name", oldValue: "", newValue: nameOf(after) || "(new item)" });
  } else if (action === "delete") {
    rows.push({ field: "name", oldValue: nameOf(before) || id, newValue: "" });
  } else {
    COLUMNS[entity].forEach(function (c) {
      if (NOT_LOGGED.indexOf(c[0]) !== -1) return;
      const oldValue = logText_(c[0], before ? before[c[0]] : "");
      const newValue = logText_(c[0], after[c[0]]);
      if (oldValue !== newValue) rows.push({ field: c[0], oldValue: oldValue, newValue: newValue });
    });
  }
  if (!rows.length) return;
  const sheet = sheet_("changeLog");
  const headers = headers_(sheet);
  const values = rows.map(function (change) {
    const entry = { timestamp: now, action: action, entityType: entity, entityId: id, field: change.field, oldValue: change.oldValue, newValue: change.newValue, user: user };
    const line = new Array(headers.length).fill("");
    COLUMNS.changeLog.forEach(function (c) {
      const index = headers.indexOf(c[1]);
      if (index !== -1) line[index] = safeText_(entry[c[0]]);
    });
    return line;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

/* ---------------------------------------------------------------------------
 * Cloudinary signed uploads (optional; the API secret stays here)
 * ------------------------------------------------------------------------- */

function signUpload_(body) {
  const props = PropertiesService.getScriptProperties();
  const cloudName = props.getProperty("CLOUDINARY_CLOUD_NAME");
  const apiKey = props.getProperty("CLOUDINARY_API_KEY");
  const secret = props.getProperty("CLOUDINARY_API_SECRET");
  if (!cloudName || !apiKey || !secret) {
    throw codeError_("Signed uploads are not set up: add the CLOUDINARY_* values in Script properties.", "NOT_CONFIGURED");
  }
  const base = String(props.getProperty("CLOUDINARY_BASE_FOLDER") || "Gharcha Jevan").replace(/^\/+|\/+$/g, "");
  const folder = String(body.folder || "");
  if (folder.indexOf(base + "/") !== 0 || !/^[A-Za-z0-9 \/_-]{1,120}$/.test(folder) || folder.indexOf("..") !== -1) {
    throw codeError_("This upload folder is not allowed.", "BAD_REQUEST");
  }
  const params = { timestamp: String(Math.floor(Date.now() / 1000)) };
  params[body.folderParam === "asset_folder" ? "asset_folder" : "folder"] = folder;
  const publicId = String(body.publicId || "");
  if (publicId) {
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(publicId)) throw codeError_("Invalid photo name.", "BAD_REQUEST");
    params.public_id = publicId;
  }
  const tags = String(body.tags || "");
  if (tags) {
    if (!/^[a-z0-9_,-]{1,200}$/.test(tags)) throw codeError_("Invalid photo tags.", "BAD_REQUEST");
    params.tags = tags;
  }
  const signature = signParams_(params, secret);
  return { apiKey: apiKey, cloudName: cloudName, signature: signature, params: params };
}

/* ---------------------------------------------------------------------------
 * Cloudinary clean-up (needs CLOUDINARY_CLOUD_NAME, _API_KEY and _API_SECRET)
 * ------------------------------------------------------------------------- */

const PHOTO_FIELDS = {
  menu: ["imagePublicId"],
  thalis: ["imagePublicId"],
  specials: ["imagePublicId"],
  gallery: ["imagePublicId"],
  business: ["heroImagePublicId", "aboutImagePublicId"],
};
const CLOUDINARY_TAG = "gj-cms"; // added to every dashboard upload (js/services/cloudinary.js)

function cloudinaryCreds_() {
  const props = PropertiesService.getScriptProperties();
  const creds = {
    cloudName: props.getProperty("CLOUDINARY_CLOUD_NAME"),
    apiKey: props.getProperty("CLOUDINARY_API_KEY"),
    secret: props.getProperty("CLOUDINARY_API_SECRET"),
  };
  return creds.cloudName && creds.apiKey && creds.secret ? creds : null;
}

function autoDeleteEnabled_() {
  return String(PropertiesService.getScriptProperties().getProperty("CLOUDINARY_AUTO_DELETE") || "true").toLowerCase() !== "false";
}

/** Photo IDs a change stops using: the old photo was removed, replaced, or its row deleted. */
function droppedPhotoIds_(entity, before, after) {
  if (!before) return [];
  return PHOTO_FIELDS[entity]
    .filter(function (field) { return before[field] && (!after || after[field] !== before[field]); })
    .map(function (field) { return before[field]; });
}

/** Every photo ID still used by any row in any tab. */
function referencedPhotoIds_() {
  const inUse = {};
  Object.keys(PHOTO_FIELDS).forEach(function (entity) {
    readTable_(entity).forEach(function (row) {
      PHOTO_FIELDS[entity].forEach(function (field) {
        if (row[field]) inUse[row[field]] = true;
      });
    });
  });
  return inUse;
}

/** Deletes photos that no row uses any more. Never throws; returns what happened. */
function deleteUnusedPhotos_(publicIds) {
  const unique = publicIds.filter(function (id, i) { return id && publicIds.indexOf(id) === i; });
  if (!unique.length || !autoDeleteEnabled_()) return [];
  const creds = cloudinaryCreds_();
  if (!creds) return [];
  const report = [];
  try {
    const inUse = referencedPhotoIds_();
    unique.forEach(function (publicId) {
      if (inUse[publicId]) return report.push({ publicId: publicId, result: "kept (still used)" });
      try {
        if (!photoHasTag_(creds, publicId)) return report.push({ publicId: publicId, result: "kept (not a dashboard upload)" });
        report.push({ publicId: publicId, result: destroyPhoto_(creds, publicId) });
      } catch (err) {
        console.warn("Could not delete photo " + publicId + ": " + messageOf_(err));
        report.push({ publicId: publicId, result: "error" });
      }
    });
  } catch (err) {
    console.warn("Photo clean-up skipped: " + messageOf_(err));
  }
  return report;
}

/**
 * Deletes photos tagged gj-cms that no row uses any more, e.g. after a row was
 * deleted by hand in the sheet. Photos newer than CLOUDINARY_CLEANUP_GRACE_HOURS
 * (default 7 days) are left alone. Run it from the Apps Script editor whenever you like.
 */
function cleanupCloudinary() {
  const creds = cloudinaryCreds_();
  if (!creds) {
    Logger.log("Clean-up skipped: add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Script properties.");
    return { deleted: [], skipped: "not configured" };
  }
  if (!autoDeleteEnabled_()) {
    Logger.log("Clean-up skipped: CLOUDINARY_AUTO_DELETE is false.");
    return { deleted: [], skipped: "disabled" };
  }
  const graceHours = Number(PropertiesService.getScriptProperties().getProperty("CLOUDINARY_CLEANUP_GRACE_HOURS") || 168);
  const cutoff = Date.now() - graceHours * 3600 * 1000;
  const inUse = referencedPhotoIds_();
  const deleted = [];
  let cursor = "";
  let pages = 0;
  do {
    const url = cloudinaryApi_(creds, "resources/image/tags/" + encodeURIComponent(CLOUDINARY_TAG)) + "?max_results=500" + (cursor ? "&next_cursor=" + encodeURIComponent(cursor) : "");
    const response = UrlFetchApp.fetch(url, { headers: { Authorization: basicAuth_(creds) }, muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error("Cloudinary listing failed (HTTP " + response.getResponseCode() + ")");
    const body = JSON.parse(response.getContentText() || "{}");
    (body.resources || []).forEach(function (photo) {
      if (inUse[photo.public_id]) return;
      if (new Date(photo.created_at).getTime() > cutoff) return;
      try {
        destroyPhoto_(creds, photo.public_id);
        deleted.push(photo.public_id);
      } catch (err) {
        console.warn("Could not delete photo " + photo.public_id + ": " + messageOf_(err));
      }
    });
    cursor = body.next_cursor || "";
    pages += 1;
  } while (cursor && pages < 20);
  Logger.log("Clean-up finished: deleted " + deleted.length + " unused photo(s).");
  return { deleted: deleted };
}

function photoHasTag_(creds, publicId) {
  const path = String(publicId).split("/").map(encodeURIComponent).join("/");
  const response = UrlFetchApp.fetch(cloudinaryApi_(creds, "resources/image/upload/" + path), {
    headers: { Authorization: basicAuth_(creds) },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() === 404) return false; // already gone
  if (response.getResponseCode() !== 200) throw new Error("Cloudinary lookup failed (HTTP " + response.getResponseCode() + ")");
  const body = JSON.parse(response.getContentText() || "{}");
  return (body.tags || []).indexOf(CLOUDINARY_TAG) !== -1;
}

/** Upload API "destroy"; invalidate also clears the CDN copy. Returns "ok" or "not found". */
function destroyPhoto_(creds, publicId) {
  const params = { invalidate: "true", public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  params.signature = signParams_(params, creds.secret);
  params.api_key = creds.apiKey;
  const response = UrlFetchApp.fetch(cloudinaryApi_(creds, "image/destroy"), { method: "post", payload: params, muteHttpExceptions: true });
  const body = JSON.parse(response.getContentText() || "{}");
  if (response.getResponseCode() !== 200) throw new Error((body.error && body.error.message) || "HTTP " + response.getResponseCode());
  return body.result || "ok";
}

function cloudinaryApi_(creds, path) {
  return "https://api.cloudinary.com/v1_1/" + encodeURIComponent(creds.cloudName) + "/" + path;
}

function basicAuth_(creds) {
  return "Basic " + Utilities.base64Encode(creds.apiKey + ":" + creds.secret);
}

/** Cloudinary signature: SHA-1 of the sorted "key=value" pairs followed by the API secret. */
function signParams_(params, secret) {
  const text = Object.keys(params).sort().map(function (k) { return k + "=" + params[k]; }).join("&") + secret;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join("");
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw codeError_("No spreadsheet found. Create this script from the sheet, or set SPREADSHEET_ID.", "NOT_CONFIGURED");
  return book;
}

function sheet_(entity) {
  const sheet = spreadsheet_().getSheetByName(TABS[entity]);
  if (!sheet) throw codeError_('The "' + TABS[entity] + '" tab is missing. Run setupSheets() once in Apps Script.', "NOT_CONFIGURED");
  return sheet;
}

function sheetsReady_() {
  try {
    const book = spreadsheet_();
    return Object.keys(TABS).every(function (k) { return Boolean(book.getSheetByName(TABS[k])); });
  } catch (err) {
    return false;
  }
}

function headers_(sheet) {
  const width = sheet.getLastColumn();
  return width ? sheet.getRange(1, 1, 1, width).getValues()[0].map(String) : [];
}

function hasField_(entity, key) {
  return COLUMNS[entity].some(function (c) { return c[0] === key; });
}

function fromCell_(key, value) {
  if (BOOLEAN_FIELDS.indexOf(key) !== -1) return value === true || String(value).toLowerCase() === "true";
  if (NUMBER_LIMITS[key] !== undefined) return Number(value) || 0;
  if (key === "items") return String(value || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(String);
  if (value instanceof Date) return DATE_FIELDS.indexOf(key) !== -1 ? isoDate_(value) : value.toISOString();
  return value === null || value === undefined ? "" : String(value);
}

function toCell_(key, value) {
  if (BOOLEAN_FIELDS.indexOf(key) !== -1) return value === true;
  if (NUMBER_LIMITS[key] !== undefined) return Number(value) || 0;
  if (key === "items") return safeText_((value || []).join("\n"));
  return safeText_(value);
}

/** Text that starts with = + - @ could run as a formula; the leading apostrophe keeps it plain text. */
function safeText_(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function logText_(key, value) {
  let text;
  if (Array.isArray(value)) text = value.join(" | ");
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else text = value === null || value === undefined ? "" : String(value);
  return text.length > 500 ? text.slice(0, 497) + "…" : text;
}

function isoDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function codeError_(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function messageOf_(err) {
  return String((err && err.message) || err || "Unknown error");
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(message, code, extra) {
  return json_(Object.assign({ ok: false, error: message, code: code || "ERROR" }, extra || {}));
}
