/**
 * GALLERY management — gallery.html
 */
import {
  $,
  emptyState,
  errorMessage,
  escapeHtml,
  focusLater,
  icon,
  initAdmin,
  openRecordEditor,
  pill,
  reportSave,
  segmentedField,
  store,
  switchField,
  textField,
  toast,
} from "./admin.js";
import { GALLERY_CATEGORIES, galleryCategoryInfo, normalizeRecord } from "../../js/services/schema.js";
import { imageTag, PLACEHOLDERS } from "../../js/services/images.js";

const state = { filter: "All", visible: [] };
const labelOf = (photo) => photo?.caption || `${galleryCategoryInfo(photo?.category).en} photo`;
const focusTile = (id, selector) => focusLater(`[data-id="${CSS.escape(id)}"] ${selector}`);

initAdmin({ page: "gallery", render });

function render(root) {
  root.innerHTML = `
    <header class="page-head">
      <div><h1>Gallery</h1><p>Photos of your food and your place. Open a photo to change its caption or category.</p></div>
      <button class="btn btn--primary" type="button" data-add>${icon("image-plus")}Add photo</button>
    </header>
    <div class="toolbar"><div class="chips" role="group" aria-label="Show one category" data-filters></div></div>
    <div data-grid></div>`;
  root.addEventListener("click", onClick);
  store.subscribe((event) => {
    if (["changed", "loaded", "sync-ok"].includes(event.type)) draw();
  });
  draw();
  const params = new URLSearchParams(location.search);
  if (params.has("new")) {
    history.replaceState(null, "", location.pathname);
    openEditor();
  }
}

function draw() {
  const grid = $("[data-grid]");
  if (!grid) return;
  const all = store.list("gallery");
  drawFilters(all);
  state.visible = state.filter === "All" ? all : all.filter((photo) => photo.category === state.filter);
  const addButton = `<button class="btn btn--primary" type="button" data-add>${icon("image-plus")}Add photo</button>`;
  if (!all.length) {
    grid.innerHTML = emptyState({ iconName: "images", title: "No photos yet", text: "Add photos of your food and your place. They appear in the website gallery.", action: addButton });
    return;
  }
  if (!state.visible.length) {
    grid.innerHTML = emptyState({ iconName: "images", title: "No photos in this category yet", action: addButton });
    return;
  }
  const canReorder = state.filter === "All";
  grid.innerHTML = `<ul class="photo-grid">${state.visible.map((photo, i) => tileHtml(photo, i, state.visible.length, canReorder)).join("")}</ul>`;
}

function drawFilters(all) {
  const host = $("[data-filters]");
  const focused = document.activeElement?.dataset?.filter;
  const categories = GALLERY_CATEGORIES.filter((c) => all.some((photo) => photo.category === c.id) || c.id === state.filter);
  host.innerHTML = [{ id: "All", en: "All" }, ...categories]
    .map((c) => {
      const count = c.id === "All" ? all.length : all.filter((photo) => photo.category === c.id).length;
      return `<button class="chip" type="button" data-filter="${c.id}" aria-pressed="${state.filter === c.id}">${escapeHtml(c.en)} <span class="chip__count">${count}</span></button>`;
    })
    .join("");
  if (focused) $(`[data-filter="${focused}"]`, host)?.focus();
}

function tileHtml(photo, index, total, canReorder) {
  const label = escapeHtml(labelOf(photo));
  return `<li class="photo-card${photo.active ? "" : " is-off"}" data-id="${escapeHtml(photo.id)}">
    <button class="photo-card__img" type="button" data-edit aria-label="Edit photo: ${label}">
      ${imageTag({ src: photo.image, alt: "", ratio: [1, 1], widths: [240, 420], sizes: "(min-width: 64rem) 220px, 46vw", fallback: PLACEHOLDERS.gallery })}
      ${photo.active ? "" : pill("muted", "Hidden", "eye-off")}
    </button>
    <div class="photo-card__body">
      <p class="photo-card__caption">${photo.caption ? escapeHtml(photo.caption) : '<span class="muted">No caption</span>'}</p>
      <p class="photo-card__cat">${escapeHtml(galleryCategoryInfo(photo.category).en)}</p>
    </div>
    <div class="photo-card__actions">
      <button class="btn btn--ghost btn--sm" type="button" data-toggle>${icon(photo.active ? "eye-off" : "eye", { size: 16 })}${photo.active ? "Hide" : "Show"}<span class="sr-only"> ${label}</span></button>
      ${
        canReorder
          ? `<span class="photo-card__move">
          <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-move="-1"${index === 0 ? " disabled" : ""} aria-label="Move ${label} earlier">${icon("chevron-left", { size: 20 })}</button>
          <button class="icon-btn icon-btn--sm icon-btn--ghost" type="button" data-move="1"${index === total - 1 ? " disabled" : ""} aria-label="Move ${label} later">${icon("chevron-right", { size: 20 })}</button>
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
  if (event.target.closest("[data-add]")) {
    openEditor();
    return;
  }
  const tile = event.target.closest("[data-id]");
  if (!tile) return;
  const id = tile.dataset.id;
  if (event.target.closest("[data-edit]")) openEditor(id);
  else if (event.target.closest("[data-toggle]")) toggle(id);
  else if (event.target.closest("[data-move]")) move(id, Number(event.target.closest("[data-move]").dataset.move));
}

async function toggle(id, silent = false) {
  const photo = store.get("gallery", id);
  if (!photo) return;
  const next = !photo.active;
  try {
    const result = await store.save("gallery", { id, active: next });
    focusTile(id, "[data-toggle]");
    if (result.synced === false) return reportSave(result, { noun: "photo" });
    if (silent) return toast("Change undone.", { tone: "info" });
    toast(next ? "The photo is back on the website." : "The photo is hidden from the website.", {
      tone: next ? "ok" : "info",
      action: { label: "Undo", onClick: () => toggle(id, true) },
    });
  } catch (error) {
    toast(errorMessage(error), { tone: "danger" });
  }
}

async function move(id, direction) {
  const ids = state.visible.map((photo) => photo.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const updates = ids
    .map((photoId, index) => ({ id: photoId, displayOrder: index + 1 }))
    .filter((update) => store.get("gallery", update.id)?.displayOrder !== update.displayOrder);
  try {
    const result = await store.saveMany("gallery", updates);
    focusTile(id, to === 0 || to === ids.length - 1 ? "[data-edit]" : `[data-move="${direction}"]`);
    if (result.synced === false) reportSave(result, { noun: "photo" });
  } catch (error) {
    toast(errorMessage(error), { tone: "danger" });
  }
}

function openEditor(id = null) {
  const before = id ? store.get("gallery", id) : null;
  const isNew = !before;
  const base = before
    ? { ...before }
    : normalizeRecord("gallery", {
        active: true,
        category: state.filter !== "All" ? state.filter : "Food",
        displayOrder: store.nextDisplayOrder("gallery"),
      });
  openRecordEditor({
    entity: "gallery",
    noun: "photo",
    base,
    isNew,
    title: isNew ? "Add photo" : "Edit photo",
    saveLabel: isNew ? "Add photo" : "Save changes",
    fieldsHtml: `
      <div data-image-slot></div>
      ${segmentedField({ name: "category", label: "Category", value: base.category, options: GALLERY_CATEGORIES.map((c) => ({ value: c.id, label: c.en })) })}
      ${textField({ name: "caption", label: "Caption", value: base.caption, max: 120, counter: true, optional: true, hint: "Shown in the photo viewer, for example “Sunday thali”." })}
      ${switchField({ name: "active", label: "Show on website", hint: "Turn off to hide the photo without deleting it.", checked: base.active })}
      ${textField({ name: "displayOrder", label: "Display order", type: "number", value: String(base.displayOrder ?? ""), hint: "Lower numbers appear first.", attrs: 'inputmode="numeric" min="0" step="1"' })}`,
    image: { label: "Photo", required: true, ratio: "1 / 1", hint: "Landscape and portrait photos both work; the website crops them neatly." },
    nameOf: (record) => record?.caption || "",
    onSaved: (record) => record?.id && focusTile(record.id, "[data-edit]"),
  });
}
