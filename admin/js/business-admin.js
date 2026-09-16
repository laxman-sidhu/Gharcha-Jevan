/**
 * BUSINESS INFO — business.html
 * Name, tagline, contact details, opening hours, About text and the two big website photos.
 */
import {
  $,
  clearErrors,
  createImageField,
  errorMessage,
  icon,
  initAdmin,
  readForm,
  reportSave,
  setBusy,
  showAlert,
  showErrors,
  store,
  textField,
} from "./admin.js";
import { isPlaceholder } from "../../js/config.js";
import { normalizeRecord, validateRecord, ValidationError } from "../../js/services/schema.js";

initAdmin({ page: "business", render });

function render(root) {
  const b = store.business;
  const v = (key) => (isPlaceholder(b[key]) ? "" : b[key]);

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Business info</h1><p>Contact details, opening hours, the About text and the two large photos on your website.</p></div>
    </header>
    <form class="business-form" novalidate data-form>
      <div data-form-alert hidden></div>
      <section class="form-section" aria-labelledby="sec-name">
        <div class="form-section__head"><h2 id="sec-name">Name and tagline</h2></div>
        ${textField({ name: "businessName", label: "Business name", value: v("businessName"), required: true, max: 80 })}
        ${textField({ name: "tagline", label: "Tagline", value: v("tagline"), max: 120, optional: true, placeholder: "Food that tastes like home", hint: "Shown as the big heading at the top of the website." })}
      </section>

      <section class="form-section" aria-labelledby="sec-contact">
        <div class="form-section__head"><h2 id="sec-contact">Contact details</h2><p>Anything left empty is not shown on the live website.</p></div>
        <div class="row-2">
          ${textField({ name: "phone", label: "Phone number", type: "tel", value: v("phone"), placeholder: "[PHONE NUMBER]", max: 40, optional: true, attrs: 'autocomplete="tel" inputmode="tel"' })}
          ${textField({ name: "whatsapp", label: "WhatsApp number", type: "tel", value: v("whatsapp"), placeholder: "[WHATSAPP NUMBER]", max: 40, optional: true, hint: "A 10-digit mobile number is enough; +91 is added automatically.", attrs: 'inputmode="tel"' })}
        </div>
        ${textField({ name: "address", label: "Address", type: "textarea", rows: 3, value: v("address"), placeholder: "[BUSINESS ADDRESS]", max: 300, optional: true })}
        ${textField({ name: "openingHours", label: "Opening hours", type: "textarea", rows: 3, value: v("openingHours"), placeholder: "[OPENING HOURS]", max: 300, optional: true, hint: "For example: Monday to Saturday, 11 am to 10 pm." })}
        <div class="row-2">
          ${textField({ name: "mapsUrl", label: "Google Maps link", type: "url", value: v("mapsUrl"), placeholder: "https://maps.app.goo.gl/…", optional: true, hint: "In Google Maps, open your place and tap Share, then Copy link.", attrs: 'inputmode="url" autocomplete="off"' })}
          ${textField({ name: "instagramUrl", label: "Instagram link", type: "url", value: v("instagramUrl"), placeholder: "https://www.instagram.com/…", optional: true, attrs: 'inputmode="url" autocomplete="off"' })}
        </div>
      </section>

      <section class="form-section" aria-labelledby="sec-about">
        <div class="form-section__head"><h2 id="sec-about">About text</h2><p>Shown next to the kitchen photo in the About section.</p></div>
        ${textField({ name: "aboutText", label: "About text", type: "textarea", rows: 6, value: v("aboutText"), max: 1200, counter: true, optional: true })}
      </section>

      <section class="form-section" aria-labelledby="sec-photos">
        <div class="form-section__head"><h2 id="sec-photos">Website photos</h2><p>Until you add your own, the website shows a sample photo here.</p></div>
        <div class="photo-pair"><div data-slot="hero"></div><div data-slot="about"></div></div>
      </section>

      <div class="save-bar">
        <p data-dirty-note>All changes saved</p>
        <button class="btn btn--primary" type="submit" data-save>${icon("check")}Save changes</button>
      </div>
    </form>`;

  const form = $("[data-form]", root);
  const hero = createImageField({ name: "heroImage", label: "Top of the page", value: b.heroImage, entity: "business", getCategory: () => "site", getName: () => "hero", ratio: "4 / 5", hint: "A tall photo of your best dish works best." });
  const about = createImageField({ name: "aboutImage", label: "About section", value: b.aboutImage, entity: "business", getCategory: () => "site", getName: () => "about", ratio: "4 / 5", hint: "The kitchen, the cook, or a plate being served." });
  $("[data-slot=hero]", form).replaceWith(hero.element);
  $("[data-slot=about]", form).replaceWith(about.element);

  const saveButton = $("[data-save]", form);
  const note = $("[data-dirty-note]", form);
  const alertEl = $("[data-form-alert]", form);
  let snapshot = JSON.stringify(readForm(form));
  const isDirty = () => JSON.stringify(readForm(form)) !== snapshot || hero.isDirty() || about.isDirty();
  const refresh = () => {
    const dirty = isDirty();
    form.classList.toggle("is-dirty", dirty);
    note.textContent = dirty ? "You have unsaved changes" : "All changes saved";
  };

  form.addEventListener("input", (event) => {
    const counter = event.target.name && $(`[data-counter="${event.target.name}"]`, form);
    if (counter) counter.textContent = `${event.target.value.length}/${event.target.maxLength}`;
    refresh();
  });
  form.addEventListener("change", refresh);
  form.addEventListener("imagechange", refresh);
  window.addEventListener("beforeunload", (event) => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saveButton.disabled) return;
    clearErrors(form);
    const current = store.business;
    const values = readForm(form);
    // An empty field that still holds a placeholder stays as it is (nothing to log).
    for (const [key, value] of Object.entries(values)) {
      if (value === "" && isPlaceholder(current[key]) && current[key]) values[key] = current[key];
    }
    const probe = normalizeRecord("business", { ...current, ...values, heroImage: hero.validationValue(), aboutImage: about.validationValue() });
    const { valid, errors } = validateRecord("business", probe);
    if (!valid) {
      showErrors(form, errors);
      return;
    }
    setBusy(saveButton, true, "Saving…");
    try {
      const progress = (p) => setBusy(saveButton, true, p < 100 ? `Uploading ${p}%` : "Saving…");
      const heroPhoto = await hero.commit({ onProgress: progress });
      if (heroPhoto) Object.assign(values, { heroImage: heroPhoto.url, heroImagePublicId: heroPhoto.publicId });
      const aboutPhoto = await about.commit({ onProgress: progress });
      if (aboutPhoto) Object.assign(values, { aboutImage: aboutPhoto.url, aboutImagePublicId: aboutPhoto.publicId });
      setBusy(saveButton, true, "Saving…");
      const result = await store.save("business", values);
      hero.markSaved();
      about.markSaved();
      snapshot = JSON.stringify(readForm(form));
      refresh();
      reportSave(result, { noun: "business info", label: "Business info", verb: "saved" });
    } catch (error) {
      if (error instanceof ValidationError) showErrors(form, error.errors);
      else showAlert(alertEl, errorMessage(error));
    } finally {
      setBusy(saveButton, false);
    }
  });
}
