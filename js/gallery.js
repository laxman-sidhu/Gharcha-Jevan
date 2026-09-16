/**
 * GALLERY — CSS grid with varied tile sizes, category filters and a lightbox.
 * Images can be Cloudinary URLs (resized automatically) or demo samples.
 */
import { GALLERY_CATEGORIES } from "./services/schema.js";
import { imageTag, transformUrl, PLACEHOLDERS } from "./services/images.js";
import { assetUrl, escapeHtml } from "./utils.js";

// Repeating tile shapes. With 4 columns these nine tiles fill a clean 4×4 block.
const PATTERN = ["big", "", "tall", "", "wide", "tall", "", "wide", ""];
const RATIOS = { big: [6, 5], wide: [5, 2], tall: [3, 5], "": [6, 5] };

export class GalleryView {
  constructor({ grid, filters, lightbox, onRender }) {
    this.grid = grid;
    this.filters = filters;
    this.lightbox = lightbox;
    this.onRender = onRender;
    this.items = [];
    this.visible = [];
    this.filter = "All";

    filters.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-filter]");
      if (!chip) return;
      this.filter = chip.dataset.filter;
      this.renderFilters();
      this.draw();
    });

    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-index]");
      if (!button || !this.lightbox) return;
      const slides = this.visible.map((item) => ({
        src: item.image ? transformUrl(item.image, { width: 1600 }) : assetUrl(PLACEHOLDERS.gallery),
        fallback: assetUrl(PLACEHOLDERS.gallery),
        alt: item.caption || `${item.category} photo`,
        caption: item.caption,
      }));
      this.lightbox.open(slides, Number(button.dataset.index), button);
    });
  }

  render(items) {
    this.items = items;
    if (this.filter !== "All" && !items.some((item) => item.category === this.filter)) this.filter = "All";
    this.renderFilters();
    this.draw();
  }

  renderFilters() {
    const categories = GALLERY_CATEGORIES.filter((c) => this.items.some((item) => item.category === c.id));
    this.filters.hidden = categories.length < 2;
    this.filters.innerHTML = [{ id: "All", en: "All" }, ...categories]
      .map((c) => `<button class="chip" type="button" data-filter="${c.id}" aria-pressed="${c.id === this.filter}">${escapeHtml(c.en)}</button>`)
      .join("");
  }

  draw() {
    this.grid.removeAttribute("aria-busy");
    this.visible = this.filter === "All" ? this.items : this.items.filter((item) => item.category === this.filter);
    if (!this.visible.length) {
      this.grid.innerHTML = `<li class="empty" style="grid-column: 1 / -1">Photos will appear here soon.</li>`;
      return;
    }
    this.grid.innerHTML = this.visible
      .map((item, index) => {
        const shape = PATTERN[index % PATTERN.length];
        const wide = shape === "big" || shape === "wide";
        const label = item.caption || `${item.category} photo`;
        return `<li class="gallery-item${shape ? ` gallery-item--${shape}` : ""}">
          <button class="gallery-item__btn" type="button" data-index="${index}" aria-label="Open photo: ${escapeHtml(label)}">
            ${imageTag({
              src: item.image,
              alt: "",
              ratio: RATIOS[shape],
              widths: wide ? [480, 800, 1200] : [300, 480, 720],
              sizes: wide ? "(min-width: 56rem) 50vw, 100vw" : "(min-width: 56rem) 25vw, 50vw",
              fallback: PLACEHOLDERS.gallery,
            })}
            ${item.caption ? `<span class="gallery-item__caption">${escapeHtml(item.caption)}</span>` : ""}
          </button>
        </li>`;
      })
      .join("");
    this.onRender?.(this.grid);
  }
}
