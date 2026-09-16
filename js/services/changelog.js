/**
 * CHANGE LOG
 *
 * Every save is compared with the previous version of the record and turned
 * into one row per changed field — the same shape as the "Change Log" tab:
 *   Timestamp | Action | Entity Type | Entity ID | Field | Old Value | New Value | User
 *
 * In PRODUCTION the Apps Script backend writes these rows itself (so they
 * cannot be faked from the browser). In DEMO mode this module writes them to
 * the browser's demo store so the dashboard can show "Recent updates".
 */
import { ENTITIES } from "./schema.js";
import { formatPrice } from "../utils.js";

const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "imagePublicId", "heroImagePublicId", "aboutImagePublicId"]);

const cellValue = (value) => {
  if (Array.isArray(value)) return value.join("\n");
  if (value === undefined || value === null) return "";
  return String(value);
};

/** Short, sheet-friendly representation (photos are shown as "(photo)" rather than long URLs / data URIs). */
function logValue(field, value) {
  const text = cellValue(value);
  if (/image$/i.test(field) && text) return text.startsWith("data:") ? "(photo kept in demo browser)" : text;
  return text.length > 500 ? `${text.slice(0, 497)}…` : text;
}

export function diffRecords(entity, before, after) {
  const changes = [];
  for (const { key } of ENTITIES[entity].fields) {
    if (IGNORED_FIELDS.has(key)) continue;
    const oldValue = cellValue(before?.[key]);
    const newValue = cellValue(after?.[key]);
    if (oldValue !== newValue) changes.push({ field: key, oldValue: logValue(key, before?.[key]), newValue: logValue(key, after?.[key]) });
  }
  return changes;
}

export function buildLogEntries({ action, entity, before, after, user, timestamp }) {
  const entityId = entity === "business" ? "business" : (after || before)?.id || "";
  const base = { timestamp, action, entityType: entity, entityId, user };
  if (action === "create") {
    return [{ ...base, field: "name", oldValue: "", newValue: after.name || after.caption || "(new item)" }];
  }
  if (action === "delete") {
    return [{ ...base, field: "name", oldValue: before?.name || before?.caption || entityId, newValue: "" }];
  }
  return diffRecords(entity, before, after).map((change) => ({ ...base, ...change }));
}

/* ---------------------------------------------------------------------------
 * Human-readable descriptions for the dashboard
 * ------------------------------------------------------------------------- */

const NOUN = { menu: "Dish", thalis: "Thali", specials: "Special", gallery: "Photo", business: "Business info" };

const FIELD_PRIORITY = ["available", "active", "price", "image", "heroImage", "aboutImage", "name", "featured", "category", "description", "items", "startDate", "endDate", "caption", "displayOrder"];

const isTrue = (value) => String(value).toLowerCase() === "true";

function priceText(value) {
  return formatPrice(value) || "no price";
}

/**
 * Turns a group of change-log rows from the same save into one dashboard line.
 * `lookupName(entityType, entityId)` returns the current name of the item, if it still exists.
 */
export function describeGroup(group, lookupName = () => "") {
  const first = group[0];
  const noun = NOUN[first.entityType] || "Item";
  const name =
    (first.action !== "update" ? first.newValue || first.oldValue : "") ||
    lookupName(first.entityType, first.entityId) ||
    first.entityId;
  const shortName = String(name || "");

  if (first.action === "create") return { icon: "plus", tone: "ok", title: `${noun} added`, detail: shortName };
  if (first.action === "delete") return { icon: "trash-2", tone: "danger", title: `${noun} deleted`, detail: shortName };

  const sorted = [...group].sort((a, b) => rank(a.field) - rank(b.field));
  const main = sorted[0];
  const extra = group.length > 1 ? ` (and ${group.length - 1} more change${group.length > 2 ? "s" : ""})` : "";
  let result;

  switch (main.field) {
    case "price":
      result = { icon: "pencil", tone: "info", title: "Price updated", detail: `${shortName}: ${priceText(main.oldValue)} → ${priceText(main.newValue)}` };
      break;
    case "available":
      result = isTrue(main.newValue)
        ? { icon: "eye", tone: "ok", title: `${noun} shown on website`, detail: shortName }
        : { icon: "eye-off", tone: "muted", title: `${noun} hidden`, detail: shortName };
      if (first.entityType === "specials") {
        result = isTrue(main.newValue)
          ? { icon: "check", tone: "ok", title: "Special back in stock", detail: shortName }
          : { icon: "circle-x", tone: "muted", title: "Special marked sold out", detail: shortName };
      }
      break;
    case "active":
      result = isTrue(main.newValue)
        ? { icon: "sparkles", tone: "ok", title: first.entityType === "gallery" ? "Photo shown" : "Special switched on", detail: shortName }
        : { icon: "eye-off", tone: "muted", title: first.entityType === "gallery" ? "Photo hidden" : "Special switched off", detail: shortName };
      break;
    case "image":
    case "heroImage":
    case "aboutImage":
      result = { icon: "image", tone: "info", title: main.newValue ? "Image changed" : "Image removed", detail: first.entityType === "business" ? "Website photo" : shortName };
      break;
    case "featured":
      result = { icon: "star", tone: "info", title: isTrue(main.newValue) ? "Marked as featured" : "Removed from featured", detail: shortName };
      break;
    case "name":
      result = { icon: "pencil", tone: "info", title: `${noun} renamed`, detail: `${main.oldValue} → ${main.newValue}` };
      break;
    case "category":
      result = { icon: "list", tone: "info", title: "Category changed", detail: `${shortName}: ${main.oldValue} → ${main.newValue}` };
      break;
    case "displayOrder":
      result = { icon: "list", tone: "muted", title: "Order changed", detail: shortName };
      break;
    default:
      result = first.entityType === "business"
        ? { icon: "store", tone: "info", title: "Business info updated", detail: fieldLabel(main.field) }
        : { icon: "pencil", tone: "info", title: `${fieldLabel(main.field)} updated`, detail: shortName };
  }
  return { ...result, detail: `${result.detail}${extra}` };
}

function rank(field) {
  const index = FIELD_PRIORITY.indexOf(field);
  return index === -1 ? 99 : index;
}

function fieldLabel(field) {
  const labels = {
    description: "Description",
    items: "Thali items",
    startDate: "Start date",
    endDate: "End date",
    caption: "Caption",
    businessName: "Business name",
    tagline: "Tagline",
    phone: "Phone number",
    whatsapp: "WhatsApp number",
    address: "Address",
    mapsUrl: "Google Maps link",
    instagramUrl: "Instagram link",
    openingHours: "Opening hours",
    aboutText: "About text",
  };
  return labels[field] || field;
}

/** Groups rows that belong to the same save (same timestamp + entity). Newest first. */
export function groupEntries(entries = [], limit = 10) {
  const groups = [];
  const index = new Map();
  const sorted = [...entries].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  for (const entry of sorted) {
    const key = `${entry.timestamp}|${entry.entityType}|${entry.entityId}|${entry.action}`;
    if (!index.has(key)) {
      if (groups.length >= limit) continue;
      index.set(key, []);
      groups.push(index.get(key));
    }
    index.get(key).push(entry);
  }
  return groups;
}
