/**
 * DATA SERVICE — the only module the UI talks to for content.
 *
 *   DEMO mode
 *     Sample data comes from /assets/data/*.json. When the CMS changes something, the
 *     whole dataset is saved in this browser (localStorage) and the public
 *     site in the same browser shows the change — nothing leaves the device.
 *
 *   PRODUCTION mode
 *     Owner → CMS → validate → (photo already uploaded to Cloudinary)
 *       → apply locally → add to OUTBOX → send to Apps Script
 *       → Apps Script updates the Sheet + writes Change Log rows
 *       → public website reads the new data.
 *
 *     If sending fails (no signal, server busy), the change stays in the
 *     outbox on this device and is retried automatically — it is never
 *     silently lost. The CMS shows how many changes are waiting.
 *
 * Swapping Google Sheets for another backend only requires a new transport
 * with the same functions as ./sheets.js.
 */
import { CONFIG, isPlaceholder } from "../config.js";
import { ENTITIES, LIST_ENTITIES, emptyData, hasField, isPublic, normalizeData, normalizeRecord, validateRecord, ValidationError } from "./schema.js";
import { buildLogEntries } from "./changelog.js";
import * as sheets from "./sheets.js";
import { Auth, isDemoPreview } from "../auth.js";
import { clone, nowIso, slugify, sortByOrder, storage, uid } from "../utils.js";

export const STORAGE_KEYS = {
  demo: "gj.demo.v1",
  outbox: "gj.outbox.v1",
  adminCache: "gj.admin-cache.v1",
  publicCache: "gj.public-cache.v1",
};

export class StorageFullError extends Error {
  constructor() {
    super("This browser's demo storage is full. Remove a demo photo or use “Reset demo data” on the dashboard.");
    this.name = "StorageFullError";
  }
}

/** "DEMO" | "PRODUCTION" | "MISCONFIGURED" (production requested but no API URL). */
export function getMode() {
  if (CONFIG.appMode !== "PRODUCTION") return "DEMO";
  if (isDemoPreview()) return "DEMO"; // a visitor trying the demo sees their own sample data
  return sheets.isConfigured() ? "PRODUCTION" : "MISCONFIGURED";
}

/* ---------------------------------------------------------------------------
 * Demo seed data (/assets/data/*.json)
 * ------------------------------------------------------------------------- */

const dataUrl = (file) => new URL(`../../assets/data/${file}`, import.meta.url).href;
let seedPromise = null;

async function fetchJson(file) {
  const response = await fetch(dataUrl(file), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load assets/data/${file} (HTTP ${response.status}).`);
  return response.json();
}

function loadSeed() {
  if (!seedPromise) {
    seedPromise = Promise.all(
      ["menu.json", "thalis.json", "specials.json", "gallery.json", "business.json", "changelog.json"].map(fetchJson)
    ).then(([menu, thalis, specials, gallery, business, changeLog]) => ({
      data: normalizeData({
        menu: menu.items,
        thalis: thalis.items,
        specials: specials.items,
        gallery: gallery.items,
        business: business.info,
      }),
      changeLog: (changeLog.items || []).map(({ minutesAgo = 0, ...entry }) => ({
        ...entry,
        timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(),
      })),
    }));
    seedPromise.catch(() => {
      seedPromise = null;
    });
  }
  return seedPromise;
}

async function readDemoStore() {
  const saved = storage.get(STORAGE_KEYS.demo);
  if (saved?.version === 1 && saved.data) {
    return { data: normalizeData(saved.data), changeLog: saved.changeLog || [], edited: true };
  }
  const seed = await loadSeed();
  return { data: clone(seed.data), changeLog: clone(seed.changeLog), edited: false };
}

function writeDemoStore(data, changeLog) {
  try {
    storage.set(STORAGE_KEYS.demo, { version: 1, savedAt: nowIso(), data, changeLog: changeLog.slice(0, 200) });
  } catch (error) {
    if (error?.name === "QuotaExceededError" || /quota/i.test(error?.message || "")) throw new StorageFullError();
    throw error;
  }
}

export function hasDemoEdits() {
  return Boolean(storage.get(STORAGE_KEYS.demo));
}

/* ---------------------------------------------------------------------------
 * Public website data
 * ------------------------------------------------------------------------- */

function toPublic(data) {
  const out = { business: data.business };
  for (const entity of LIST_ENTITIES) {
    out[entity] = sortByOrder(data[entity].filter((record) => isPublic(entity, record)));
  }
  return out;
}

/**
 * Content for the public site. In production, a cached copy (if any) is
 * returned immediately and `onUpdate` is called once fresh data arrives.
 */
export async function getPublicData({ onUpdate } = {}) {
  const mode = getMode();

  if (mode === "DEMO") {
    const { data } = await readDemoStore();
    return { ...toPublic(data), source: "demo" };
  }

  if (mode === "MISCONFIGURED") {
    console.error("[Gharcha Jevan] APP_MODE is PRODUCTION but googleSheets.apiEndpoint is not set in js/config.js.");
    return { ...emptyData(), source: "unconfigured" };
  }

  const fresh = sheets.getPublicData().then((raw) => {
    const data = toPublic(normalizeData(raw));
    try {
      storage.set(STORAGE_KEYS.publicCache, { savedAt: Date.now(), data });
    } catch {
      /* cache is optional */
    }
    return { ...data, source: "live" };
  });

  const cached = storage.get(STORAGE_KEYS.publicCache);
  if (cached?.data) {
    fresh.then((data) => onUpdate?.(data)).catch((error) => console.warn("[data] Using cached menu:", error.message));
    return { ...normalizeData(cached.data), source: "cache" };
  }
  return fresh;
}

/* ---------------------------------------------------------------------------
 * Admin store
 * ------------------------------------------------------------------------- */

function applyOp(data, op) {
  if (op.entity === "business") {
    if (op.op === "upsert") data.business = normalizeRecord("business", op.record);
    return data;
  }
  const list = data[op.entity];
  const index = list.findIndex((item) => item.id === (op.record?.id || op.id));
  if (op.op === "delete") {
    if (index !== -1) list.splice(index, 1);
  } else if (index === -1) {
    list.push(normalizeRecord(op.entity, op.record));
  } else {
    list[index] = normalizeRecord(op.entity, op.record);
  }
  return data;
}

const readOutbox = () => storage.get(STORAGE_KEYS.outbox, []) || [];
function writeOutbox(ops) {
  try {
    storage.set(STORAGE_KEYS.outbox, ops);
  } catch (error) {
    throw new Error(`Your change could not be kept safely on this device (${error.message}).`);
  }
}

function newId(entity, record) {
  const prefix = entity === "menu" ? slugify(record.category) || "dish" : ENTITIES[entity].idPrefix;
  return uid(prefix);
}

class AdminStore {
  constructor() {
    this.data = null;
    this.changeLog = [];
    this.listeners = new Set();
    this.syncPromise = null;
    this.lastSyncError = null;
    this.lastSyncedAt = null;
    this.remoteError = null;
    this.demoEdited = false;

    window.addEventListener("online", () => this.flush());
  }

  get mode() {
    return getMode();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, this);
      } catch (error) {
        console.error(error);
      }
    });
  }

  async load({ force = false } = {}) {
    if (this.data && !force) return this.data;
    const mode = this.mode;

    if (mode === "DEMO") {
      const store = await readDemoStore();
      this.data = store.data;
      this.changeLog = store.changeLog;
      this.demoEdited = store.edited;
    } else if (mode === "PRODUCTION") {
      try {
        const remote = normalizeData(await sheets.getAdminData(Auth.getIdToken()));
        try {
          storage.set(STORAGE_KEYS.adminCache, { savedAt: Date.now(), data: remote });
        } catch {
          /* optional */
        }
        this.remoteError = null;
        this.data = readOutbox().reduce(applyOp, clone(remote));
      } catch (error) {
        if (error.code === "UNAUTHORIZED") throw error;
        const cached = storage.get(STORAGE_KEYS.adminCache);
        if (!cached?.data) throw error;
        this.remoteError = error;
        this.data = readOutbox().reduce(applyOp, normalizeData(cached.data));
      }
      this.refreshChangeLog();
      this.flush();
    } else {
      throw new sheets.ApiError("Production mode is on, but the Google Apps Script URL is missing in js/config.js.", { code: "NOT_CONFIGURED" });
    }

    this.emit({ type: "loaded" });
    return this.data;
  }

  list(entity) {
    return sortByOrder(this.data?.[entity] || []);
  }

  get(entity, id) {
    return (this.data?.[entity] || []).find((item) => item.id === id) || null;
  }

  get business() {
    return this.data?.business || normalizeRecord("business", {});
  }

  nameOf(entity, id) {
    if (entity === "business") return "Business info";
    const item = this.get(entity, id);
    return item ? item.name || item.caption || "" : "";
  }

  nextDisplayOrder(entity, filter = () => true) {
    const orders = (this.data?.[entity] || []).filter(filter).map((item) => Number(item.displayOrder) || 0);
    return orders.length ? Math.max(...orders) + 1 : 1;
  }

  /** Create or update a record. Resolves to { record, changed, synced, error? }. */
  async save(entity, input) {
    const def = ENTITIES[entity];
    const before = def.singleton ? this.business : input.id ? this.get(entity, input.id) : null;
    const now = nowIso();

    const record = normalizeRecord(entity, { ...(before || {}), ...input });
    if (!def.singleton && !record.id) record.id = newId(entity, record);

    const { valid, errors } = validateRecord(entity, record);
    if (!valid) throw new ValidationError(errors);

    const action = before && (def.singleton || before.id) ? "update" : "create";
    if (action === "create" && hasField(entity, "createdAt")) record.createdAt = now;
    if (hasField(entity, "updatedAt")) record.updatedAt = now;

    const entries = buildLogEntries({ action, entity, before, after: record, user: Auth.userLabel(), timestamp: now });
    if (action === "update" && entries.length === 0) {
      return { record: before, changed: false, synced: true };
    }

    return this.commit([{ op: "upsert", entity, record }], entries);
  }

  /** Save several records at once (used for re-ordering). */
  async saveMany(entity, inputs) {
    const now = nowIso();
    const ops = [];
    const entries = [];
    for (const input of inputs) {
      const before = this.get(entity, input.id);
      if (!before) continue;
      const record = normalizeRecord(entity, { ...before, ...input });
      if (hasField(entity, "updatedAt")) record.updatedAt = now;
      const rows = buildLogEntries({ action: "update", entity, before, after: record, user: Auth.userLabel(), timestamp: now });
      if (!rows.length) continue;
      ops.push({ op: "upsert", entity, record });
      entries.push(...rows);
    }
    if (!ops.length) return { changed: false, synced: true };
    return this.commit(ops, entries);
  }

  async remove(entity, id) {
    const before = this.get(entity, id);
    if (!before) return { changed: false, synced: true };
    const entries = buildLogEntries({ action: "delete", entity, before, after: null, user: Auth.userLabel(), timestamp: nowIso() });
    return this.commit([{ op: "delete", entity, id }], entries);
  }

  async commit(ops, entries) {
    const mode = this.mode;
    const previous = clone(this.data);
    const previousLog = this.changeLog;

    ops.forEach((op) => applyOp(this.data, clone(op)));
    this.changeLog = [...entries, ...this.changeLog];

    if (mode === "DEMO") {
      try {
        writeDemoStore(this.data, this.changeLog);
      } catch (error) {
        this.data = previous;
        this.changeLog = previousLog;
        throw error;
      }
      this.demoEdited = true;
      this.emit({ type: "changed", ops });
      const record = ops[0].record || null;
      return { record, changed: true, synced: true, demo: true };
    }

    // PRODUCTION: keep the change safe on this device first, then send it.
    const outbox = readOutbox();
    for (const op of ops) {
      const key = op.record?.id || op.id;
      // An upsert carries the full record, so older queued upserts for the same item are no longer needed.
      const filtered = outbox.filter((queued) => !(queued.entity === op.entity && (queued.record?.id || queued.id) === key && queued.op === "upsert"));
      outbox.length = 0;
      outbox.push(...filtered, { ...clone(op), opId: uid("op"), queuedAt: nowIso() });
    }
    try {
      writeOutbox(outbox);
    } catch (error) {
      this.data = previous;
      this.changeLog = previousLog;
      throw error;
    }
    this.changeLog = this.changeLog.map((entry) => (entries.includes(entry) ? { ...entry, pending: true } : entry));
    this.emit({ type: "changed", ops });

    const result = await this.flush();
    return { record: ops[0].record || null, changed: true, synced: result.ok, error: result.error };
  }

  pendingCount() {
    return this.mode === "PRODUCTION" ? readOutbox().length : 0;
  }

  /** Send queued changes to the backend. Never throws; resolves to { ok, error? }. */
  flush() {
    if (this.mode !== "PRODUCTION") return Promise.resolve({ ok: true });
    // A sync is already running: wait for it, then send anything queued meanwhile.
    if (this.syncPromise) return this.syncPromise.then(() => this.flush());
    const ops = readOutbox();
    if (!ops.length) return Promise.resolve({ ok: true });
    // .finally() runs after the assignment below, so the "in progress" marker is always cleared.
    this.syncPromise = this.sendQueued(ops).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  async sendQueued(ops) {
    this.emit({ type: "sync-start", pending: ops.length });
    try {
      const response = await sheets.mutate(ops, Auth.getIdToken());
      this.markSent(ops.map((op) => op.opId));
      (response.results || []).forEach((result) => {
        if (result.record && this.data) applyOp(this.data, { op: "upsert", entity: result.entity, record: result.record });
      });
      this.lastSyncError = null;
      this.lastSyncedAt = Date.now();
      this.emit({ type: "sync-ok" });
      this.refreshChangeLog();
      return { ok: true };
    } catch (error) {
      const processed = error.details?.results?.map((r) => r.opId) || [];
      if (processed.length) this.markSent(processed);
      this.lastSyncError = error;
      this.emit({ type: "sync-error", error });
      if (error.code === "UNAUTHORIZED") this.emit({ type: "auth-expired", error });
      return { ok: false, error };
    }
  }

  markSent(opIds) {
    writeOutbox(readOutbox().filter((op) => !opIds.includes(op.opId)));
  }

  /** Drop unsent changes and reload from the backend (with confirmation in the UI). */
  async discardPending() {
    writeOutbox([]);
    this.lastSyncError = null;
    await this.load({ force: true });
    this.emit({ type: "sync-ok" });
  }

  async refreshChangeLog() {
    if (this.mode !== "PRODUCTION") return;
    try {
      const rows = await sheets.getChangeLog(Auth.getIdToken(), 60);
      this.changeLog = Array.isArray(rows) ? rows : [];
      this.emit({ type: "changelog" });
    } catch (error) {
      console.warn("[changelog]", error.message);
    }
  }

  async resetDemo() {
    if (this.mode !== "DEMO") return;
    storage.remove(STORAGE_KEYS.demo);
    this.data = null;
    await this.load({ force: true });
    this.emit({ type: "changed", ops: [] });
  }
}

export const store = new AdminStore();

/** Convenience check used by the dashboard and status cards. */
export function spreadsheetUrl() {
  const id = CONFIG.googleSheets.spreadsheetId;
  return isPlaceholder(id) ? null : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
}
