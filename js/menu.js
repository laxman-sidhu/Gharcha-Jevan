/**
 * MENU, THALIS and TODAY'S SPECIAL — rendered from data, never hardcoded.
 * The data can come from the demo JSON files or from Google Sheets; the
 * shape is always the one defined in js/services/schema.js.
 */
import { MENU_CATEGORIES } from "./services/schema.js";
import { imageTag, placeholderForCategory, PLACEHOLDERS } from "./services/images.js";
import { icon } from "./icons.js";
import { $$, escapeHtml, formatDate, formatPrice, isSpecialLive, todayIso } from "./utils.js";

export function nameMarkup(name, tag = "h3", className = "dish-name") {
  return `<${tag} class="${className}">${escapeHtml(name)}</${tag}>`;
}

export function priceMarkup(price, className = "") {
  const text = formatPrice(price);
  return text
    ? `<p class="dish-price ${className}">${text}</p>`
    : `<p class="dish-price dish-price--ask ${className}">Ask for price</p>`;
}

/**
 * Wraps a dish photo so tapping it opens the whole, uncropped image in the
 * photo viewer (js/app.js). Placeholder drawings are not zoomable.
 */
function photo(item, className, inner) {
  if (!item.image) return `<div class="${className}">${inner}</div>`;
  const price = formatPrice(item.price);
  const caption = price ? `${item.name}, ${price}` : item.name;
  return `<button class="${className} zoomable" type="button" data-zoom="${escapeHtml(item.image)}" data-zoom-caption="${escapeHtml(caption)}" aria-label="View photo: ${escapeHtml(item.name)}">${inner}<span class="zoomable__hint" aria-hidden="true">${icon("zoom-in", { size: 16 })}</span></button>`;
}

const orderAttrs = (name) => `href="#contact" data-wa-link data-wa-item="${escapeHtml(name)}"`;
const recommended = () => `<span class="dish-badge">${icon("star", { size: 14 })}Recommended</span>`;
const itemsText = (item) => (item.kind === "thali" && item.items?.length ? `<p class="dish-desc">${escapeHtml(item.items.join(", "))}</p>` : "");

function featureCard(item) {
  return `<article class="dish-feature">
    ${photo(
      item,
      "dish-feature__media",
      imageTag({
        src: item.image,
        alt: item.name,
        ratio: [3, 2],
        widths: [420, 680, 1000],
        sizes: "(min-width: 75rem) 36rem, (min-width: 45rem) 46vw, 92vw",
        fallback: placeholderForCategory(item.category),
      })
    )}
    <div class="dish-feature__body">
      ${recommended()}
      ${nameMarkup(item.name)}
      ${item.description ? `<p class="dish-desc">${escapeHtml(item.description)}</p>` : ""}
      ${itemsText(item)}
      <div class="dish-feature__foot">
        ${priceMarkup(item.price)}
        <a class="text-link" ${orderAttrs(item.name)}>${icon("whatsapp", { size: 18 })}Order on WhatsApp</a>
      </div>
    </div>
  </article>`;
}

export function dishRow(item) {
  const soldOut = item.kind === "special" && !item.available ? `<p class="status status--off">Sold out today</p>` : "";
  return `<li class="dish-row">
    ${photo(
      item,
      "dish-row__thumb",
      imageTag({
        src: item.image,
        alt: "",
        ratio: [1, 1],
        widths: [96, 160, 240],
        sizes: "76px",
        fallback: placeholderForCategory(item.category),
      })
    )}
    <div>
      ${nameMarkup(item.name)}
      ${item.description ? `<p class="dish-desc">${escapeHtml(item.description)}</p>` : ""}
      ${itemsText(item)}
      ${soldOut}
    </div>
    ${priceMarkup(item.price)}
  </li>`;
}

/** Tabbed menu. Thalis appear under "Thali" and live specials under "Specials". */
export class MenuView {
  constructor({ tabs, panel, onRender }) {
    this.tabsEl = tabs;
    this.panel = panel;
    this.onRender = onRender;
    this.current = null;
    this.groups = [];
    this.panel.id = "menu-panel";
    this.tabsEl.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (tab) this.select(tab.dataset.tab);
    });
    this.tabsEl.addEventListener("keydown", (event) => this.onKey(event));
  }

  buildGroups(data) {
    const today = todayIso();
    return MENU_CATEGORIES.map((category) => {
      let items = data.menu.filter((dish) => dish.category === category.id).map((dish) => ({ ...dish, kind: "dish" }));
      if (category.id === "Thali") {
        items = items.concat(data.thalis.map((thali) => ({ ...thali, kind: "thali", category: "Thali" })));
      }
      if (category.id === "Specials") {
        const live = data.specials.filter((special) => isSpecialLive(special, today));
        items = items.concat(live.map((special) => ({ ...special, kind: "special", category: "Specials", featured: false })));
      }
      return { ...category, items };
    }).filter((group) => group.items.length);
  }

  render(data) {
    this.groups = this.buildGroups(data);
    this.panel.removeAttribute("aria-busy");
    if (!this.groups.length) {
      this.tabsEl.hidden = true;
      this.panel.innerHTML = `<p class="empty">The menu is being updated. Please check back soon.</p>`;
      return;
    }
    this.tabsEl.hidden = false;
    this.tabsEl.innerHTML = this.groups
      .map(
        (group) => `<button class="menu-tab" type="button" role="tab" id="menu-tab-${group.id}" aria-controls="menu-panel" aria-selected="false" tabindex="-1" data-tab="${group.id}">
          <span>${group.en}</span>
          <span class="menu-tab__count">${group.items.length}<span class="sr-only"> items</span></span>
        </button>`
      )
      .join("");
    const keep = this.groups.some((group) => group.id === this.current);
    this.select(keep ? this.current : this.groups[0].id, { animate: false });
  }

  select(id, { focus = false, animate = true } = {}) {
    const group = this.groups.find((g) => g.id === id);
    if (!group) return false;
    this.current = id;
    $$(".menu-tab", this.tabsEl).forEach((tab) => {
      const selected = tab.dataset.tab === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) {
        if (focus) tab.focus();
        const left = tab.offsetLeft - this.tabsEl.offsetLeft - 24;
        if (this.tabsEl.scrollWidth > this.tabsEl.clientWidth) this.tabsEl.scrollTo({ left, behavior: animate ? "smooth" : "auto" });
      }
    });
    this.panel.setAttribute("aria-labelledby", `menu-tab-${id}`);
    const featured = group.items.filter((item) => item.featured);
    const rest = group.items.filter((item) => !item.featured);
    this.panel.innerHTML =
      (featured.length ? `<div class="dish-features">${featured.map(featureCard).join("")}</div>` : "") +
      (rest.length ? `<ul class="dish-list">${rest.map(dishRow).join("")}</ul>` : "");
    if (animate) {
      this.panel.classList.remove("is-switching");
      void this.panel.offsetWidth;
      this.panel.classList.add("is-switching");
    }
    this.onRender?.(this.panel);
    return true;
  }

  onKey(event) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = this.groups.findIndex((g) => g.id === this.current);
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + this.groups.length) % this.groups.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % this.groups.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = this.groups.length - 1;
    this.select(this.groups[nextIndex].id, { focus: true });
  }
}

export function renderThalis(list, thalis) {
  list.removeAttribute("aria-busy");
  if (!thalis.length) {
    list.innerHTML = `<li class="empty" style="grid-column: 1 / -1">Thalis will be listed here soon.</li>`;
    return;
  }
  list.innerHTML = thalis
    .map(
      (thali) => `<li class="thali-card">
        ${photo(
          thali,
          "thali-card__plate",
          imageTag({
            src: thali.image,
            alt: thali.name,
            ratio: [1, 1],
            widths: [200, 340, 480],
            sizes: "168px",
            fallback: PLACEHOLDERS.thali,
          })
        )}
        ${thali.featured ? recommended() : ""}
        ${nameMarkup(thali.name)}
        ${priceMarkup(thali.price, "thali-card__price")}
        ${thali.description ? `<p class="dish-desc">${escapeHtml(thali.description)}</p>` : ""}
        ${
          thali.items.length
            ? `<p class="thali-card__items-title">In this thali</p>
               <ul class="thali-card__items">${thali.items.map((item) => `<li>${icon("check", { size: 18 })}<span>${escapeHtml(item)}</span></li>`).join("")}</ul>`
            : ""
        }
        <div class="thali-card__foot">
          <a class="btn btn--outline btn--block" ${orderAttrs(thali.name)}>${icon("whatsapp")}Order this thali</a>
        </div>
      </li>`
    )
    .join("");
}

export function renderSpecials(section, container, specials) {
  const live = specials.filter((special) => isSpecialLive(special));
  section.hidden = live.length === 0;
  if (!live.length) {
    container.innerHTML = "";
    return;
  }
  const [main, ...more] = live;
  const primary = main.name;
  container.innerHTML = `<article class="special">
      ${photo(
        main,
        "special__media",
        imageTag({
          src: main.image,
          alt: primary,
          ratio: [4, 3],
          widths: [480, 780, 1100],
          sizes: "(min-width: 56rem) 50vw, 92vw",
          fallback: PLACEHOLDERS.special,
        })
      )}
      <div class="special__body">
        ${nameMarkup(main.name, "h3", "special__name")}
        ${main.description ? `<p class="dish-desc">${escapeHtml(main.description)}</p>` : ""}
        <div class="special__meta">
          ${priceMarkup(main.price, "special__price")}
          ${main.available ? `<p class="status status--ok">Available today</p>` : `<p class="status status--off">Sold out for today</p>`}
        </div>
        ${main.endDate ? `<p class="special__dates">Available until ${escapeHtml(formatDate(main.endDate))}</p>` : ""}
        ${main.available ? `<a class="btn btn--primary btn--lg" ${orderAttrs(main.name)}>${icon("whatsapp")}Order on WhatsApp</a>` : ""}
      </div>
    </article>
    ${more.length ? `<ul class="dish-list special-more">${more.map((s) => dishRow({ ...s, kind: "special", category: "Specials" })).join("")}</ul>` : ""}`;
}
