/**
 * DATA SCHEMA — the single definition of every piece of content.
 *
 * The website and the CMS only ever work with records shaped like this,
 * no matter where they come from (demo JSON, Google Sheets, or a future
 * database). `header` is the matching column name in the Google Sheet and
 * must stay in sync with COLUMNS in assets/google-apps-script/Code.gs.
 */

export const MENU_CATEGORIES = [
  { id: "Fish", en: "Fish", icon: "fish", folder: "menu/fish" },
  { id: "Chicken", en: "Chicken", icon: "drumstick", folder: "menu/chicken" },
  { id: "Thali", en: "Thali", icon: "hand-platter", folder: "menu/thali" },
  { id: "Specials", en: "Specials", icon: "sparkles", folder: "menu/specials" },
  { id: "Other", en: "Other", icon: "soup", folder: "menu/other" },
];

export const GALLERY_CATEGORIES = [
  { id: "Food", en: "Food", folder: "gallery/food" },
  { id: "Fish", en: "Fish", folder: "gallery/food" },
  { id: "Chicken", en: "Chicken", folder: "gallery/food" },
  { id: "Thali", en: "Thali", folder: "gallery/food" },
  { id: "Restaurant", en: "Restaurant", folder: "gallery/restaurant" },
  { id: "Events", en: "Events", folder: "gallery/events" },
];

const f = (key, header, type, extra = {}) => ({ key, header, type, ...extra });

export const ENTITIES = {
  menu: {
    label: "dish",
    plural: "dishes",
    idPrefix: "dish",
    fields: [
      f("id", "ID", "string"),
      f("category", "Category", "enum", { options: MENU_CATEGORIES.map((c) => c.id), required: true, default: "Fish" }),
      f("name", "Name", "string", { required: true, max: 90 }),
      f("description", "Description", "text", { max: 300 }),
      f("price", "Price", "number", { min: 0, max: 100000, default: 0 }),
      f("available", "Available", "boolean", { default: true }),
      f("featured", "Featured", "boolean", { default: false }),
      f("image", "Image URL", "url"),
      f("imagePublicId", "Cloudinary Public ID", "string"),
      f("displayOrder", "Display Order", "number", { min: 0, max: 9999, default: 0 }),
      f("createdAt", "Created At", "timestamp"),
      f("updatedAt", "Updated At", "timestamp"),
    ],
  },

  thalis: {
    label: "thali",
    plural: "thalis",
    idPrefix: "thali",
    fields: [
      f("id", "ID", "string"),
      f("name", "Name", "string", { required: true, max: 90 }),
      f("description", "Description", "text", { max: 300 }),
      f("price", "Price", "number", { min: 0, max: 100000, default: 0 }),
      f("items", "Items", "list", { maxItems: 20, max: 60 }),
      f("available", "Available", "boolean", { default: true }),
      f("featured", "Featured", "boolean", { default: false }),
      f("image", "Image URL", "url"),
      f("imagePublicId", "Cloudinary Public ID", "string"),
      f("displayOrder", "Display Order", "number", { min: 0, max: 9999, default: 0 }),
      f("createdAt", "Created At", "timestamp"),
      f("updatedAt", "Updated At", "timestamp"),
    ],
  },

  specials: {
    label: "special",
    plural: "specials",
    idPrefix: "special",
    fields: [
      f("id", "ID", "string"),
      f("name", "Name", "string", { required: true, max: 90 }),
      f("description", "Description", "text", { max: 300 }),
      f("price", "Price", "number", { min: 0, max: 100000, default: 0 }),
      f("available", "Available", "boolean", { default: true }),
      f("image", "Image URL", "url"),
      f("imagePublicId", "Cloudinary Public ID", "string"),
      f("startDate", "Start Date", "date"),
      f("endDate", "End Date", "date"),
      f("active", "Active", "boolean", { default: true }),
      f("updatedAt", "Updated At", "timestamp"),
    ],
  },

  gallery: {
    label: "photo",
    plural: "photos",
    idPrefix: "photo",
    fields: [
      f("id", "ID", "string"),
      f("image", "Image URL", "url", { required: true }),
      f("imagePublicId", "Cloudinary Public ID", "string"),
      f("category", "Category", "enum", { options: GALLERY_CATEGORIES.map((c) => c.id), default: "Food" }),
      f("caption", "Caption", "string", { max: 120 }),
      f("displayOrder", "Display Order", "number", { min: 0, max: 9999, default: 0 }),
      f("active", "Active", "boolean", { default: true }),
      f("createdAt", "Created At", "timestamp"),
    ],
  },

  /** One row only. The last four columns are an addition to the brief so the owner can change the two big photos. */
  business: {
    label: "business info",
    plural: "business info",
    singleton: true,
    fields: [
      f("businessName", "Business Name", "string", { required: true, max: 80, default: "Gharcha Jevan" }),
      f("tagline", "Tagline", "string", { max: 120 }),
      f("phone", "Phone", "string", { max: 40 }),
      f("whatsapp", "WhatsApp", "string", { max: 40 }),
      f("address", "Address", "text", { max: 300 }),
      f("mapsUrl", "Google Maps URL", "url"),
      f("instagramUrl", "Instagram URL", "url"),
      f("openingHours", "Opening Hours", "text", { max: 300 }),
      f("aboutText", "About Text", "text", { max: 1200 }),
      f("heroImage", "Hero Image URL", "url"),
      f("heroImagePublicId", "Hero Image Public ID", "string"),
      f("aboutImage", "About Image URL", "url"),
      f("aboutImagePublicId", "About Image Public ID", "string"),
    ],
  },
};

export const CHANGE_LOG_COLUMNS = [
  ["timestamp", "Timestamp"],
  ["action", "Action"],
  ["entityType", "Entity Type"],
  ["entityId", "Entity ID"],
  ["field", "Field"],
  ["oldValue", "Old Value"],
  ["newValue", "New Value"],
  ["user", "User"],
];

export const LIST_ENTITIES = ["menu", "thalis", "specials", "gallery"];

export const fieldKeys = (entity) => ENTITIES[entity].fields.map((field) => field.key);
export const hasField = (entity, key) => fieldKeys(entity).includes(key);

/* ---------------------------------------------------------------------------
 * Normalisation — converts loosely typed input (JSON, sheet cells, form values)
 * into the exact record shape. Unknown keys are dropped.
 * ------------------------------------------------------------------------- */

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "y", "on"].includes(String(value).trim().toLowerCase());
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function toDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function toList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/\r?\n|\s*\|\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function normalizeRecord(entity, raw = {}) {
  const record = {};
  for (const field of ENTITIES[entity].fields) {
    const value = raw[field.key];
    switch (field.type) {
      case "boolean":
        record[field.key] = toBoolean(value, field.default ?? false);
        break;
      case "number":
        record[field.key] = toNumber(value, field.default ?? 0);
        break;
      case "date":
        record[field.key] = toDate(value);
        break;
      case "list":
        record[field.key] = toList(value);
        break;
      case "enum": {
        const text = String(value ?? "").trim();
        const match = field.options.find((option) => option.toLowerCase() === text.toLowerCase());
        record[field.key] = match || field.default || field.options[0];
        break;
      }
      default:
        record[field.key] = value === undefined || value === null ? field.default ?? "" : String(value).trim();
    }
  }
  return record;
}

export function normalizeData(raw = {}) {
  const data = { business: normalizeRecord("business", raw.business || {}) };
  for (const entity of LIST_ENTITIES) {
    data[entity] = (Array.isArray(raw[entity]) ? raw[entity] : [])
      .map((item) => normalizeRecord(entity, item))
      .filter((item) => item.id);
  }
  return data;
}

export const emptyData = () => normalizeData({});

/* ---------------------------------------------------------------------------
 * Validation — returns friendly messages keyed by field.
 * ------------------------------------------------------------------------- */

const LABELS = {
  name: "Name",
  category: "Category",
  price: "Price",
  description: "Description",
  displayOrder: "Display order",
  image: "Photo",
  caption: "Caption",
  items: "Included items",
  businessName: "Business name",
  mapsUrl: "Google Maps link",
  instagramUrl: "Instagram link",
  endDate: "End date",
};

export function validateRecord(entity, record) {
  const errors = {};
  for (const field of ENTITIES[entity].fields) {
    const value = record[field.key];
    const label = LABELS[field.key] || field.header;

    if (field.required && (value === "" || value === undefined || value === null)) {
      errors[field.key] = field.key === "image" ? "Please add a photo." : `${label} is required.`;
      continue;
    }
    if (field.max && typeof value === "string" && value.length > field.max) {
      errors[field.key] = `${label} is too long (max ${field.max} characters).`;
    }
    if (field.type === "number" && value !== "" && value !== undefined) {
      if (!Number.isFinite(value)) errors[field.key] = `${label} must be a number.`;
      else if (field.min !== undefined && value < field.min) errors[field.key] = `${label} cannot be below ${field.min}.`;
      else if (field.max !== undefined && value > field.max) errors[field.key] = `${label} looks too high.`;
    }
    if (field.type === "url" && value && !/^(https:\/\/|data:image\/|images\/|\[)/i.test(value)) {
      errors[field.key] = `${label} must start with https://`;
    }
    if (field.type === "list" && Array.isArray(value)) {
      if (field.maxItems && value.length > field.maxItems) errors[field.key] = `Add at most ${field.maxItems} items.`;
      if (value.some((item) => item.length > field.max)) errors[field.key] = `Each item must be under ${field.max} characters.`;
    }
  }
  if (entity === "specials" && record.startDate && record.endDate && record.endDate < record.startDate) {
    errors.endDate = "End date must be on or after the start date.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export class ValidationError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0] || "Please check the form.");
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/** Is a record shown on the public website? (Date windows for specials are checked at render time.) */
export function isPublic(entity, record) {
  if (entity === "menu" || entity === "thalis") return record.available;
  if (entity === "specials" || entity === "gallery") return record.active;
  return true;
}

export function categoryInfo(id) {
  return MENU_CATEGORIES.find((c) => c.id === id) || MENU_CATEGORIES[MENU_CATEGORIES.length - 1];
}

export function galleryCategoryInfo(id) {
  return GALLERY_CATEGORIES.find((c) => c.id === id) || GALLERY_CATEGORIES[0];
}
