/**
 * MENU, THALIS and SPECIALS — menu.html, thalis.html and specials.html share
 * this module. The page type comes from <body data-page="…">.
 */
import {
  $,
  emptyState,
  errorMessage,
  escapeHtml,
  focusLater,
  icon,
  initAdmin,
  nameHtml,
  openRecordEditor,
  pill,
  plural,
  reportSave,
  segmentedField,
  store,
  switchField,
  textField,
  thumbHtml,
  toast,
} from "./admin.js";
import { MENU_CATEGORIES, normalizeRecord } from "../../js/services/schema.js";
import { PLACEHOLDERS, placeholderForCategory } from "../../js/services/images.js";
import { debounce, formatDate, formatPrice, specialStatus } from "../../js/utils.js";

const PAGE = document.body.dataset.page;
const state = { query: "", filter: "All", groups: [] };
const shortName = (record) => String(record?.name || "").trim();

const availabilityPills = (item) =>
  (item.available ? pill("ok", "Available", "check") : pill("muted", "Hidden", "eye-off")) +
  (item.featured ? pill("accent", "Featured", "star") : "");

function specialPills(item) {
  const status = specialStatus(item);
  const main = {
    live: pill("ok", "Live now", "sparkles"),
    scheduled: pill("info", `Starts ${formatDate(item.startDate)}`, "calendar"),
    ended: pill("muted", `Ended ${formatDate(item.endDate)}`, "history"),
    off: pill("muted", "Switched off", "eye-off"),
  }[status];
  const stock = item.available ? "" : pill("warn", "Sold out", "circle-x");
  const until = status === "live" && item.endDate ? pill("muted", `Until ${formatDate(item.endDate)}`, "calendar") : "";
  return main + stock + until;
}

const SHOW_HIDE = {
  field: "available",
  show: "Show",
  hide: "Hide",
  on: (name) => `“${name}” is back on the website.`,
  off: (name) => `“${name}” is hidden from the website.`,
};

const PAGES = {
  menu: {
    entity: "menu",
    title: "Menu",
    noun: "dish",
    plural: "dishes",
    emptyIcon: "book-open",
    intro: "Add, edit, hide or reorder the dishes on your website.",
    addLabel: "Add dish",
    nameLabel: "Dish name",
    fields: ["name", "category", "description", "price", "available", "featured", "displayOrder", "image"],
    toggle: SHOW_HIDE,
    orderable: true,
    filterable: true,
    isOff: (item) => !item.available,
    placeholder: (item) => placeholderForCategory(item.category),
    pills: availabilityPills,
    defaults: (preset) => {
      const category = preset.category || (state.filter !== "All" ? state.filter : "Fish");
      return { category, available: true, featured: false, price: 0, displayOrder: store.nextDisplayOrder("menu", (dish) => dish.category === category) };
    },
    groups: (items) =>
      MENU_CATEGORIES.filter((c) => state.filter === "All" || c.id === state.filter)
        .map((c) => ({ id: c.id, title: c.en, icon: c.icon, items: items.filter((dish) => dish.category === c.id) }))
        .filter((group) => group.items.length || (state.filter === group.id && !state.query)),
    image: { hint: "A clear, well-lit photo of the dish works best.", ratio: "4 / 3" },
  },
  thalis: {
    entity: "thalis",
    title: "Thalis",
    noun: "thali",
    plural: "thalis",
    emptyIcon: "hand-platter",
    intro: "Complete meals: set the price and list what comes on the plate.",
    addLabel: "Add thali",
    nameLabel: "Thali name",
    fields: ["name", "description", "price", "items", "available", "featured", "displayOrder", "image"],
    toggle: SHOW_HIDE,
    orderable: true,
    filterable: false,
    isOff: (item) => !item.available,
    placeholder: () => PLACEHOLDERS.thali,
    pills: (item) => availabilityPills(item) + pill("muted", plural(item.items.length, "item", "items"), "list"),
    defaults: () => ({ available: true, featured: false, price: 0, items: [], displayOrder: store.nextDisplayOrder("thalis") }),
    groups: (items) => [{ id: "all", title: "", items }],
    image: { hint: "The website shows thali photos as a round plate, so keep the thali in the centre.", ratio: "1 / 1" },
  },
  specials: {
    entity: "specials",
    title: "Specials",
    noun: "special",
    plural: "specials",
    emptyIcon: "sparkles",
    intro: "Highlight today's special. Switch it off when it is over, or give it dates.",
    addLabel: "Add special",
    nameLabel: "Special name",
    fields: ["name", "description", "price", "available", "active", "dates", "image"],
    toggle: {
      field: "active",
      show: "Switch on",
      hide: "Switch off",
      on: (name, item) => {
        const status = specialStatus(item);
        if (status === "scheduled") return `“${name}” is switched on and shows from ${formatDate(item.startDate)}.`;
        if (status === "ended") return `“${name}” is switched on, but its end date has passed. Edit the dates to show it again.`;
        return `“${name}” is switched on and shows on the website.`;
      },
      off: (name) => `“${name}” is switched off.`,
    },
    orderable: false,
    filterable: false,
    isOff: (item) => specialStatus(item) !== "live",
    placeholder: () => PLACEHOLDERS.special,
    pills: specialPills,
    defaults: () => ({ active: true, available: true, price: 0, startDate: "", endDate: "" }),
    groups: (items) =>
      [
        { id: "live", title: "On the website now", items: items.filter((s) => specialStatus(s) === "live") },
        { id: "scheduled", title: "Coming up", items: items.filter((s) => specialStatus(s) === "scheduled") },
        { id: "off", title: "Switched off or ended", items: items.filter((s) => ["off", "ended"].includes(specialStatus(s))) },
      ].filter((group) => group.items.length),
    image: { hint: "The special is shown large on the website, so use your best photo.", ratio: "4 / 3" },
  },
};

const S = PAGES[PAGE];
const focusRow = (id, selector) => focusLater(`[data-id="${CSS.escape(id)}"] ${selector}`);
const searchText = (item) => [item.name, item.description, ...(item.items || [])].join(" ").toLowerCase();

initAdmin({ page: PAGE, render });

function render(root) {
  root.innerHTML = `
    <header class="page-head">
      <div><h1>${S.title}</h1><p>${S.intro}</p></div>
      <button class="btn btn--primary" type="button" data-add-in="">${icon("plus")}${S.addLabel}</button>
    </header>
    <div class="toolbar">
      <div class="search">
        ${icon("search", { size: 18 })}
        <input class="input" type="search" placeholder="Search ${S.plural}" aria-label="Search ${S.plural}" data-search autocomplete="off">
      </div>
      ${S.filterable ? `<div class="chips" role="group" aria-label="Show one category" data-filters></div>` : ""}
    </div>
    <p class="sr-only" role="status" data-results></p>
    <div data-list></div>`;

  root.addEventListener("click", onClick);
  $("[data-search]", root).addEventListener(
    "input",
    debounce((event) => {
      state.query = event.target.value.trim().toLowerCase();
      draw();
    }, 150)
  );
  store.subscribe((event) => {
    if (["changed", "loaded", "sync-ok"].includes(event.type)) draw();
  });
  draw();

  const params = new URLSearchParams(location.search);
  const editId = params.get("edit");
  if (params.has("new") || editId) history.replaceState(null, "", location.pathname);
  if (params.has("new")) openEditor(null, { category: params.get("category") || "" });
  else if (editId && store.get(S.entity, editId)) openEditor(editId);
}

function draw() {
  const list = $("[data-list]");
  if (!list) return;
  const all = store.list(S.entity);
  const matches = state.query ? all.filter((item) => searchText(item).includes(state.query)) : all;
  if (S.filterable) drawFilters(all);
  $("[data-results]").textContent = state.query ? `${plural(matches.length, S.noun, S.plural)} found` : "";

  if (!all.length) {
    state.groups = [];
    list.innerHTML = emptyState({
      iconName: S.emptyIcon,
      title: `No ${S.plural} yet`,
      text: `Add your first ${S.noun} and it appears on the website.`,
      action: `<button class="btn btn--primary" type="button" data-add-in="">${icon("plus")}${S.addLabel}</button>`,
    });
    return;
  }
  state.groups = S.groups(matches);
  if (!state.groups.length) {
    list.innerHTML = emptyState({
      iconName: "search",
      title: "Nothing found",
      text: state.query ? `No ${S.plural} match “${escapeHtml(state.query)}”.` : `No ${S.plural} here yet.`,
    });
    return;
  }
  const canReorder = S.orderable && !state.query;
  list.innerHTML = state.groups.map((group) => groupHtml(group, canReorder)).join("");
}

function drawFilters(all) {
  const host = $("[data-filters]");
  const focused = document.activeElement?.dataset?.filter;
  const chips = [{ id: "All", en: "All", count: all.length }].concat(
    MENU_CATEGORIES.map((c) => ({ id: c.id, en: c.en, count: all.filter((dish) => dish.category === c.id).length }))
  );
  host.innerHTML = chips
    .map(
      (chip) =>
        `<button class="chip" type="button" data-filter="${chip.id}" aria-pressed="${state.filter === chip.id}">${escapeHtml(chip.en)} <span class="chip__count">${chip.count}</span></button>`
    )
    .join("");
  if (focused) $(`[data-filter="${focused}"]`, host)?.focus();
}

function groupHtml(group, canReorder) {
  const head = group.title
    ? `<div class="group__head">
        <h2 class="group__title">${group.icon ? icon(group.icon, { size: 20 }) : ""}${escapeHtml(group.title)}</h2>
        <span class="group__count">${group.items.length}<span class="sr-only"> ${S.plural}</span></span>
        ${
          PAGE === "menu"
            ? `<button class="btn btn--ghost btn--sm group__add" type="button" data-add-in="${group.id}">${icon("plus", { size: 16 })}Add<span class="sr-only"> a dish to ${escapeHtml(group.title)}</span></button>`
            : ""
        }
      </div>`
    : "";
  const body = group.items.length
    ? `<ul class="item-list">${group.items.map((item, index) => rowHtml(item, index, group.items.length, canReorder)).join("")}</ul>`
    : `<p class="empty empty--inline">No ${S.plural} in ${escapeHtml(group.title)} yet.</p>`;
  return `<section class="group">${head}${body}</section>`;
}

function rowHtml(item, index, total, canReorder) {
  const name = escapeHtml(shortName(item));
  const switchedOff = !item[S.toggle.field];
  const price = formatPrice(item.price);
  return `<li class="item${S.isOff(item) ? " is-off" : ""}" data-id="${escapeHtml(item.id)}">
    <div class="item__thumb">${thumbHtml(item.image, S.placeholder(item))}</div>
    <div class="item__main">
      <p class="item__name">${nameHtml(item.name)}</p>
      <div class="item__meta"><span class="item__price">${price || '<span class="muted">Ask for price</span>'}</span>${S.pills(item)}</div>
      ${item.description ? `<p class="item__desc">${escapeHtml(item.description)}</p>` : ""}
    </div>
    <div class="item__actions">
      <button class="btn btn--secondary btn--sm" type="button" data-edit>${icon("pencil", { size: 17 })}Edit<span class="sr-only"> ${name}</span></button>
      <button class="btn btn--ghost btn--sm" type="button" data-toggle>${icon(switchedOff ? "eye" : "eye-off", { size: 17 })}${
        switchedOff ? S.toggle.show : S.toggle.hide
      }<span class="sr-only"> ${name}</span></button>
      ${
        canReorder
          ? `<span class="item__move">
          <button class="icon-btn icon-btn--sm" type="button" data-move="-1"${index === 0 ? " disabled" : ""} aria-label="Move ${name} up">${icon("arrow-up", { size: 18 })}</button>
          <button class="icon-btn icon-btn--sm" type="button" data-move="1"${index === total - 1 ? " disabled" : ""} aria-label="Move ${name} down">${icon("arrow-down", { size: 18 })}</button>
        </span>`
          : ""
      }
    </div>
  </li>`;
}

function onClick(event) {
  const chip = event.target.closest("[data-filter]");
  if (chip) {
    state.filter = chip.dataset.filter;
    draw();
    return;
  }
  const add = event.target.closest("[data-add-in]");
  if (add) {
    openEditor(null, { category: add.dataset.addIn });
    return;
  }
  const row = event.target.closest("[data-id]");
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.closest("[data-edit], .item__thumb")) openEditor(id);
  else if (event.target.closest("[data-toggle]")) toggleItem(id);
  else if (event.target.closest("[data-move]")) moveItem(id, Number(event.target.closest("[data-move]").dataset.move));
}

async function toggleItem(id) {
  const item = store.get(S.entity, id);
  if (!item) return;
  const field = S.toggle.field;
  const next = !item[field];
  const name = shortName(item);
  try {
    const result = await store.save(S.entity, { id, [field]: next });
    focusRow(id, "[data-toggle]");
    if (result.synced === false) {
      reportSave(result, { noun: S.noun });
      return;
    }
    const updated = store.get(S.entity, id);
    toast(next ? S.toggle.on(name, updated) : S.toggle.off(name, updated), {
      tone: next ? "ok" : "info",
      action: { label: "Undo", onClick: () => undo(id, { [field]: !next }) },
    });
  } catch (error) {
    toast(errorMessage(error), { tone: "danger" });
  }
}

async function undo(id, patch) {
  try {
    const result = await store.save(S.entity, { id, ...patch });
    if (result.synced === false) reportSave(result, { noun: S.noun });
    else toast("Change undone.", { tone: "info" });
    focusRow(id, "[data-toggle]");
  } catch (error) {
    toast(errorMessage(error), { tone: "danger" });
  }
}

async function moveItem(id, direction) {
  const group = state.groups.find((g) => g.items.some((item) => item.id === id));
  if (!group) return;
  const ids = group.items.map((item) => item.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const updates = ids
    .map((itemId, index) => ({ id: itemId, displayOrder: index + 1 }))
    .filter((update) => store.get(S.entity, update.id)?.displayOrder !== update.displayOrder);
  try {
    const result = await store.saveMany(S.entity, updates);
    const atEdge = to === 0 || to === ids.length - 1;
    focusRow(id, atEdge ? "[data-edit]" : `[data-move="${direction}"]`);
    if (result.synced === false) reportSave(result, { noun: S.noun });
    else toast(`Moved “${shortName(store.get(S.entity, id))}” ${direction < 0 ? "up" : "down"}.`, { tone: "info", timeout: 2500 });
  } catch (error) {
    toast(errorMessage(error), { tone: "danger" });
  }
}

/* ---------- Editor ---------- */

function openEditor(id = null, preset = {}) {
  const before = id ? store.get(S.entity, id) : null;
  const clean = Object.fromEntries(Object.entries(preset).filter(([, value]) => value !== undefined && value !== ""));
  const isNew = !before;
  const base = before ? { ...before } : normalizeRecord(S.entity, { ...S.defaults(clean), ...clean });
  openRecordEditor({
    entity: S.entity,
    noun: S.noun,
    base,
    isNew,
    title: isNew ? S.addLabel : `Edit ${S.noun}`,
    saveLabel: isNew ? S.addLabel : "Save changes",
    fieldsHtml: S.fields.map((key) => fieldHtml(key, base)).join(""),
    image: { label: "Photo", ...S.image },
    hideLabel: S.toggle.hide,
    nameOf: shortName,
    collect: (values) => {
      if (PAGE === "thalis") values.items = (values.items || []).filter(Boolean);
      return values;
    },
    bind: (form) => {
      if (PAGE === "thalis") bindRepeater(form);
      if (PAGE === "menu" && isNew) bindCategoryOrder(form);
    },
    onSaved: (record) => record?.id && focusRow(record.id, "[data-edit]"),
  });
}

function fieldHtml(key, r) {
  switch (key) {
    case "name":
      return textField({
        name: "name",
        label: S.nameLabel,
        value: r.name,
        required: true,
        max: 90,
        attrs: 'autocomplete="off"',
        hint: "Use the name your customers know, for example “Surmai Fry”.",
      });
    case "category":
      return segmentedField({
        name: "category",
        label: "Category",
        value: r.category,
        options: MENU_CATEGORIES.map((c) => ({ value: c.id, label: c.en, icon: c.icon })),
      });
    case "description":
      return textField({ name: "description", label: "Description", type: "textarea", rows: 3, value: r.description, max: 300, counter: true, optional: true, hint: "One or two short sentences." });
    case "price":
      return textField({
        name: "price",
        label: "Price",
        type: "number",
        prefix: "₹",
        value: r.price ? String(r.price) : "",
        optional: true,
        hint: "Leave empty to show “Ask for price”.",
        attrs: 'inputmode="decimal" min="0" step="1"',
      });
    case "items":
      return repeaterHtml(r.items);
    case "available":
      return PAGE === "specials"
        ? switchField({ name: "available", label: "In stock today", hint: "Turn off to show “Sold out for today”.", checked: r.available })
        : switchField({ name: "available", label: "Show on website", hint: "Turn off to hide it without deleting it.", checked: r.available });
    case "active":
      return switchField({ name: "active", label: "Show on website", hint: "Switch off when the special is over.", checked: r.active });
    case "featured":
      return switchField({
        name: "featured",
        label: "Featured",
        hint: PAGE === "menu" ? "Shown larger at the top of its category, with a “Recommended” label." : "Adds a “Recommended” label to this thali.",
        checked: r.featured,
      });
    case "displayOrder":
      return textField({
        name: "displayOrder",
        label: "Display order",
        type: "number",
        value: String(r.displayOrder ?? ""),
        hint: "Lower numbers appear first. The arrows in the list do the same.",
        attrs: 'inputmode="numeric" min="0" step="1"',
      });
    case "dates":
      return `<div class="row-2">
          ${textField({ name: "startDate", label: "Start date", type: "date", value: r.startDate, optional: true })}
          ${textField({ name: "endDate", label: "End date", type: "date", value: r.endDate, optional: true })}
        </div>
        <p class="field__hint field__hint--block">Leave both dates empty to show the special until you switch it off.</p>`;
    case "image":
      return `<div data-image-slot></div>`;
    default:
      return "";
  }
}

/* Thali items: one input per row */
const repeaterRow = (value, index) => `<li class="repeater__row">
    <input class="input" name="items" data-list value="${escapeHtml(value)}" maxlength="60" aria-label="Item ${index + 1}" autocomplete="off">
    <button class="icon-btn" type="button" data-remove-item aria-label="Remove item ${index + 1}">${icon("x", { size: 18 })}</button>
  </li>`;

function repeaterHtml(items = []) {
  return `<fieldset class="field" data-field="items">
    <legend class="field__label">What comes in the thali</legend>
    <p class="field__hint">One item per row, for example “Fish curry” or “Rice bhakri (2)”.</p>
    <ol class="repeater" data-repeater>${(items.length ? items : [""]).map(repeaterRow).join("")}</ol>
    <button class="btn btn--secondary btn--sm repeater__add" type="button" data-add-item>${icon("plus", { size: 16 })}Add item</button>
    <p class="field__error" hidden></p>
  </fieldset>`;
}

function bindRepeater(form) {
  const list = $("[data-repeater]", form);
  const MAX_ITEMS = 20;
  const renumber = () =>
    [...list.children].forEach((row, i) => {
      $("input", row).setAttribute("aria-label", `Item ${i + 1}`);
      $("button", row).setAttribute("aria-label", `Remove item ${i + 1}`);
    });
  const addRow = (after = null) => {
    if (list.children.length >= MAX_ITEMS) {
      toast(`A thali can list up to ${MAX_ITEMS} items.`, { tone: "info" });
      return;
    }
    const tpl = document.createElement("template");
    tpl.innerHTML = repeaterRow("", list.children.length);
    const row = tpl.content.firstElementChild;
    if (after) after.after(row);
    else list.append(row);
    renumber();
    $("input", row).focus();
  };
  $("[data-add-item]", form).addEventListener("click", () => addRow());
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-item]");
    if (!button) return;
    const row = button.closest("li");
    if (list.children.length === 1) {
      $("input", row).value = "";
      $("input", row).focus();
      return;
    }
    const neighbour = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    renumber();
    $("input", neighbour)?.focus();
  });
  list.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("input")) {
      event.preventDefault();
      addRow(event.target.closest("li"));
    }
  });
}

/* New dishes go to the end of whichever category is chosen. */
function bindCategoryOrder(form) {
  const order = form.elements.displayOrder;
  if (!order) return;
  let touched = false;
  order.addEventListener("input", () => (touched = true));
  form.addEventListener("change", (event) => {
    if (event.target.name === "category" && !touched) {
      order.value = String(store.nextDisplayOrder("menu", (dish) => dish.category === event.target.value));
    }
  });
}
