/**
 * DASHBOARD — counts, recent updates (from the change log) and system status.
 */
import { $, confirmDialog, escapeHtml, icon, initAdmin, isDemo, pill, store, toast } from "./admin.js";
import { Auth } from "../../js/auth.js";
import { spreadsheetUrl } from "../../js/services/api.js";
import { describeGroup, groupEntries } from "../../js/services/changelog.js";
import { checkConnection, getSystemStatus } from "../../js/services/status.js";
import { isSpecialLive, relativeTime } from "../../js/utils.js";

const TONE_ICON = { ok: "circle-check", warn: "triangle-alert", danger: "circle-x", info: "info" };
let statusUpdates = {};

initAdmin({ page: "dashboard", render });

function render(root) {
  const name = Auth.getSession()?.name || "";
  const sheet = spreadsheetUrl();
  root.innerHTML = `
    <header class="page-head">
      <div>
        <h1>Welcome back${name ? `, ${escapeHtml(name)}` : ""}</h1>
        <p>This is what your website shows right now.</p>
      </div>
      <a class="btn btn--secondary" href="../" target="_blank" rel="noopener">${icon("external-link")}Open website</a>
    </header>

    <section aria-labelledby="counts-title">
      <h2 class="sr-only" id="counts-title">Counts</h2>
      <div class="stat-grid" data-stats></div>
    </section>

    <div class="dash-grid">
      <section class="card" aria-labelledby="updates-title">
        <div class="card__head">
          <h2 class="card__title" id="updates-title">Recent updates</h2>
          ${sheet ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(sheet)}" target="_blank" rel="noopener">${icon("sheet", { size: 16 })}Full change log</a>` : ""}
        </div>
        <ul class="activity" data-activity></ul>
      </section>

      <div class="dash-side">
        <section class="card" aria-labelledby="quick-title">
          <h2 class="card__title" id="quick-title">Quick actions</h2>
          <div class="quick-grid">
            <a class="quick" href="menu.html?new=1">${icon("plus")}<span>Add a dish</span></a>
            <a class="quick" href="specials.html">${icon("sparkles")}<span>Today's special</span></a>
            <a class="quick" href="gallery.html?new=1">${icon("image-plus")}<span>Add a photo</span></a>
            <a class="quick" href="business.html">${icon("phone")}<span>Contact details</span></a>
          </div>
        </section>

        <section class="card" aria-labelledby="status-title">
          <h2 class="card__title" id="status-title">System status</h2>
          <ul class="status-list" data-status></ul>
          ${
            isDemo()
              ? `<div class="demo-box">
                  <p><strong>Demo mode.</strong> Everything works, but your changes and photos are saved only in this browser and are never published. Open the website in another tab to preview them.</p>
                  <button class="btn btn--secondary btn--sm" type="button" data-reset-demo>${icon("rotate-ccw", { size: 16 })}Reset demo data</button>
                </div>`
              : ""
          }
        </section>
      </div>
    </div>`;

  drawStats();
  drawActivity();
  drawStatus();
  store.subscribe((event) => {
    if (["changed", "loaded", "changelog", "sync-ok", "sync-error"].includes(event.type)) {
      drawStats();
      drawActivity();
    }
  });
  $("[data-reset-demo]", root)?.addEventListener("click", resetDemo);
  if (!isDemo()) {
    checkConnection().then((updates) => {
      statusUpdates = updates;
      drawStatus();
    });
  }
  setInterval(drawActivity, 60_000);
}

function drawStats() {
  const menu = store.list("menu");
  const thalis = store.list("thalis");
  const specials = store.list("specials");
  const gallery = store.list("gallery");
  const hidden = menu.filter((dish) => !dish.available).length;
  const live = specials.filter((special) => isSpecialLive(special)).length;
  const categories = new Set(menu.map((dish) => dish.category)).size;
  const cards = [
    { href: "menu.html", icon: "book-open", label: "Total dishes", value: menu.length, sub: `in ${categories} ${categories === 1 ? "category" : "categories"}` },
    { href: "menu.html", icon: "circle-check", label: "Available dishes", value: menu.length - hidden, sub: hidden ? `${hidden} hidden` : "none hidden" },
    { href: "thalis.html", icon: "hand-platter", label: "Thalis", value: thalis.length, sub: `${thalis.filter((t) => t.available).length} on the website` },
    { href: "specials.html", icon: "sparkles", label: "Specials", value: specials.length, sub: live ? `${live} live now` : "none live now" },
    { href: "gallery.html", icon: "images", label: "Gallery images", value: gallery.length, sub: `${gallery.filter((p) => p.active).length} shown` },
  ];
  $("[data-stats]").innerHTML = cards
    .map(
      (card) => `<a class="stat" href="${card.href}">
        <span class="stat__label">${icon(card.icon, { size: 18 })}${card.label}</span>
        <span class="stat__value">${card.value}</span>
        <span class="stat__sub">${card.sub}</span>
      </a>`
    )
    .join("");
}

function drawActivity() {
  const host = $("[data-activity]");
  if (!host) return;
  const groups = groupEntries(store.changeLog, 8);
  if (!groups.length) {
    host.innerHTML = `<li class="activity__empty">Changes you make will appear here.</li>`;
    return;
  }
  // One reorder moves two items; show it as a single line.
  const lines = [];
  for (const group of groups) {
    const line = { ...describeGroup(group, (type, id) => store.nameOf(type, id)), first: group[0], pending: group.some((entry) => entry.pending) };
    const previous = lines[lines.length - 1];
    if (previous && line.title === "Order changed" && previous.title === "Order changed" && previous.first.timestamp === line.first.timestamp) {
      previous.detail = `${previous.detail}, ${line.detail}`;
      continue;
    }
    lines.push(line);
  }
  host.innerHTML = lines
    .slice(0, 7)
    .map((line) => {
      const { first, pending } = line;
      return `<li>
        <span class="activity__icon tone-${line.tone}">${icon(line.icon, { size: 18 })}</span>
        <div>
          <p class="activity__title">${escapeHtml(line.title)}</p>
          <p class="activity__detail">${escapeHtml(line.detail)}</p>
          ${!isDemo() && first.user ? `<p class="activity__user">${escapeHtml(first.user)}</p>` : ""}
        </div>
        <div class="activity__side">
          <time datetime="${escapeHtml(first.timestamp)}">${escapeHtml(relativeTime(first.timestamp))}</time>
          ${pending ? pill("warn", "Not backed up", "cloud-off") : ""}
        </div>
      </li>`;
    })
    .join("");
}

function drawStatus() {
  const rows = getSystemStatus().map((row) => ({ ...row, ...(statusUpdates[row.key] || {}) }));
  $("[data-status]").innerHTML = rows
    .map(
      (row) => `<li class="status-row">
        ${icon(row.icon, { size: 18 })}
        <span class="status-row__label">${escapeHtml(row.label)}</span>
        ${pill(row.tone, row.text, TONE_ICON[row.tone])}
        ${row.hint ? `<span class="status-row__hint">${escapeHtml(row.hint)}</span>` : ""}
      </li>`
    )
    .join("");
}

async function resetDemo() {
  const ok = await confirmDialog({
    title: "Reset the demo?",
    message: "This removes every change made in this browser and brings back the original sample dishes, photos and updates.",
    confirmLabel: "Reset demo data",
  });
  if (!ok) return;
  await store.resetDemo();
  drawStats();
  drawActivity();
  toast("Demo data is back to the original samples.", { tone: "ok" });
}
