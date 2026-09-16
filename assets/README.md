# Gharcha Jevan — website and owner dashboard

**Food that tastes like home**

A one-page website for a home-style food business (fish, chicken and thalis), plus a simple dashboard where the owner can update the menu, prices, specials, photos and contact details from a phone.

> **Gharcha Jevan is a concept brand** ("a home-cooked meal" in Marathi), built as a complete, reusable project: it can be shown as a portfolio piece or rebranded for a real kitchen. Nothing here is real business information. Dishes, prices, photos, the About text and the change history are **sample data**, and contact details are placeholders such as `[PHONE NUMBER]`. The site says so on screen while it is in demo mode.

Plain HTML, CSS and JavaScript. No build step, no framework, no server to pay for. The public website runs on GitHub Pages; Google Sheets (through Google Apps Script) stores the data and keeps the change history; Cloudinary stores the photos.

> This README lives in `assets/`. All paths below are relative to the project folder, the one that contains `index.html`.

---

## Contents

1. [Try it on your computer](#1-try-it-on-your-computer)
2. [Demo mode and the visitor demo](#2-demo-mode-and-the-visitor-demo)
3. [Where to add your details](#3-where-to-add-your-details)
4. [Publish on GitHub Pages](#4-publish-on-github-pages)
5. [Custom domain](#5-custom-domain-optional)
6. [Photos: Cloudinary](#6-photos-cloudinary)
7. [Data and backup: Google Sheets](#7-data-and-backup-google-sheets)
8. [Owner sign-in: Google accounts](#8-owner-sign-in-google-accounts)
9. [Switch from demo to production](#9-switch-from-demo-to-production)
10. [How the pieces fit together](#10-how-the-pieces-fit-together)
11. [Security notes](#11-security-notes)
12. [Project structure](#12-project-structure)
13. [Customising the design](#13-customising-the-design)
14. [Checklist before showing it to customers](#14-checklist-before-showing-it-to-customers)
15. [Sample photos](#sample-photos)

---

## 1. Try it on your computer

The pages use JavaScript modules, so they must be opened through a small local web server (double-clicking `index.html` will not work).

```bash
cd gharcha-jevan
python3 -m http.server 8000
```

Then open:

- Website: <http://localhost:8000/>
- Owner dashboard: <http://localhost:8000/admin/> → **Enter the demo dashboard**

No Python? `npx serve .` works too.

## 2. Demo mode and the visitor demo

There are two kinds of demo.

**A. The whole site as a demo** (`APP_MODE = "DEMO"`, `AUTH_MODE = "DEMO"` in `js/config.js`). Good for trying the project on your computer.

- The website reads the sample files in `assets/data/`, and the dashboard opens with one click.
- Everything works: add, edit, hide, reorder and delete dishes, thalis, specials and photos; edit business info; see recent updates.
- Changes are saved **only in that browser** (localStorage). Open the website in another tab of the same browser to watch them appear.
- **Dashboard → System status → Reset demo data** brings back the original samples.
- A "Concept preview" bar and "Sample photo" labels are shown (`website.showDemoNotice` hides the bar).

**B. A live site that visitors can also try** (the current setup: `APP_MODE = "PRODUCTION"`, `AUTH_MODE = "GOOGLE"`, `auth.allowDemo: true`).

- The sign-in page offers two ways in:
  - **Owner:** Google sign-in. Changes are saved to Google Sheets and photos to Cloudinary.
  - **Just looking?:** "Try the demo dashboard", no account needed. The visitor gets the sample dishes and can do everything, but their changes and photos stay in **their own browser**. Nothing reaches Google Sheets or Cloudinary, and the Apps Script would refuse it anyway without an allowed Google sign-in.
- While a visitor is in the demo, the website **in their browser** shows their demo data under a "Demo preview" bar with a **Back to the live site** button. Everyone else always sees the live menu.
- `website.dashboardInvite: true` shows a small "Portfolio project: try the dashboard demo" bar on the live site. Set it to `false` for a real business, and `auth.allowDemo: false` to remove the demo option completely.

## 3. Where to add your details

Every value below is a clearly marked placeholder today. Search the project for `YOUR_` or `YOUR-USERNAME` to find them all.

| Value | Where it goes | Notes |
| --- | --- | --- |
| **Cloudinary cloud name** | `js/config.js` → `cloudinary.cloudName` | **Already filled in** (`dadtqawh5`). |
| **Cloudinary upload preset** | `js/config.js` → `cloudinary.uploadPreset` | **Already filled in** (`gharcha-jevan`, unsigned). Its Asset folder must stay empty, see [section 6](#6-photos-cloudinary). |
| **Cloudinary folder** | `js/config.js` → `cloudinary.baseFolder` | Already set to `Gharcha Jevan`: every photo is filed inside this folder, in subfolders per section. |
| **Google Sheet ID** | `js/config.js` → `googleSheets.spreadsheetId` | The part of the sheet link between `/d/` and `/edit`. Used for the dashboard's "Full change log" link. |
| **Google Apps Script URL** | `js/config.js` → `googleSheets.apiEndpoint` | **Already filled in** with your deployment. Replace it if you deploy a different script. |
| **GitHub Pages URL** | `js/config.js` → `website.publishedUrl` **and** `index.html` (the `canonical`, `og:url` and `og:image` tags) | Replace `https://YOUR-USERNAME.github.io/gharcha-jevan/` with your real address. |
| **WhatsApp number** | Dashboard → **Business info** | A 10-digit Indian mobile number is enough; `+91` is added for the WhatsApp link. Fallback: `js/config.js` → `contact.whatsapp`. |
| **Phone number** | Dashboard → **Business info** | Fallback: `js/config.js` → `contact.phone`. |
| **Google Maps URL** | Dashboard → **Business info** | In Google Maps: open the place → Share → Copy link. Fallback: `contact.mapsUrl`. |
| **Instagram URL** | Dashboard → **Business info** | Fallback: `contact.instagram`. |
| Address, opening hours, About text | Dashboard → **Business info** | Shown as `[BUSINESS ADDRESS]` and `[OPENING HOURS]` until filled in. |
| Google sign-in Client ID | `js/config.js` → `auth.googleClientId` (**already filled in**) **and** the Apps Script property `GOOGLE_CLIENT_ID` | See [section 8](#8-owner-sign-in-google-accounts). |
| Who may edit | Apps Script property `ALLOWED_EDITORS` | Comma-separated Google accounts. |

The dashboard values always win. The `contact` values in `js/config.js` are only used while the matching Business info field is empty, and anything still empty is simply not shown on the live website (in demo mode it shows as a labelled placeholder instead).

## 4. Publish on GitHub Pages

Free, and the website works without the dashboard or Google being set up.

1. Create a new repository on GitHub, for example `gharcha-jevan` (public).
2. Upload the **contents** of this folder so that `index.html` sits at the top of the repository. Keep the folder structure.
   ```bash
   git init
   git add .
   git commit -m "Gharcha Jevan website"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/gharcha-jevan.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/gharcha-jevan/`, and the dashboard at `…/gharcha-jevan/admin/`.
5. Put that address into `website.publishedUrl` and the three tags in `index.html` (see the table above), then push again.

All links in the project are relative, so the site works inside the `/gharcha-jevan/` sub-path without changes.

## 5. Custom domain (optional)

1. Buy a domain from any registrar.
2. GitHub: **Settings → Pages → Custom domain** → enter it (for example `www.example.in`) → Save. GitHub adds a `CNAME` file to the repository.
3. At the registrar, add DNS records:
   - for `www`: a **CNAME** record pointing to `YOUR-USERNAME.github.io`
   - for the bare domain (`example.in`): **A** records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`
4. When the check passes, tick **Enforce HTTPS**.
5. Update `website.publishedUrl`, the three tags in `index.html`, and the **Authorized JavaScript origins** of the Google sign-in client ([section 8](#8-owner-sign-in-google-accounts)).

## 6. Photos: Cloudinary

**Step by step, with the exact settings: [SETUP-GUIDE.md](SETUP-GUIDE.md), Part 4.**

The dashboard uploads photos straight from the browser to Cloudinary, which resizes and compresses them (the website asks for WebP/AVIF automatically with `f_auto,q_auto`). Large phone photos are also shrunk in the browser before upload to save mobile data.

**Set up (free plan is enough):**

1. Create an account at <https://cloudinary.com>. Copy the **Cloud name** from the dashboard into `cloudinary.cloudName`.
2. **Settings → Upload Presets → Add Upload Preset** (older layout: Settings → Upload → Upload presets):
   - Signing mode: **Unsigned**
   - Asset folder: **leave empty**. The website picks the folder for each photo, and for unsigned uploads a folder set in the preset would override it.
   - Disallow public ID: **off** (the website names each photo, for example `surmai-fry-mfz1k2abx9q`)
   - Allowed formats: `jpg, png, webp, heic, avif`
   - Max file size: `10 MB`, and optionally an incoming transformation that limits size to 2000 px
   - Save, then copy the preset **name** into `cloudinary.uploadPreset`.
3. The website sends each photo's folder as `asset_folder` (`cloudinary.useAssetFolder: true`), which suits accounts whose presets show an **Asset folder** field: photos are filed in the folders below and their links stay short. On older accounts whose presets show **Folder** instead, set `useAssetFolder: false` and `baseFolder: "gharcha-jevan"` (no spaces).

Photos are filed automatically:

```text
Gharcha Jevan/
  menu/fish   menu/chicken   menu/thali   menu/specials   menu/other
  gallery/food   gallery/restaurant   gallery/events
  site         (the two large website photos)
```

Gallery photos tagged Fish, Chicken or Thali go into `gallery/food`. Each photo gets a readable, unique name made from the dish name or caption, plus the tags `gj-cms`, section and category. Each saved item keeps both the image URL and the Cloudinary public ID in the sheet.

**Stricter option: signed uploads.** Set `cloudinary.uploadMode: "SIGNED"` and add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` as Apps Script properties. The Apps Script then signs each upload for signed-in owners only, and the API secret never reaches the browser. Never put the API secret in any website file.

Replacing or removing a photo in the dashboard does not delete the old file from Cloudinary (that needs the API secret). Delete unused files in Cloudinary's Media Library if storage ever matters.

## 7. Data and backup: Google Sheets

**Step by step, including every tab and column: [SETUP-GUIDE.md](SETUP-GUIDE.md), Parts 1 and 2.**

The \"Publish to the web\" link of a sheet is not used, and publishing can expose the Change Log, so leave the sheet unpublished.

Google Sheets holds the menu, thalis, specials, gallery and business info, and a **Change Log** tab records every edit: when, what, old value, new value and who.

**Set up:**

1. Create a new Google Sheet (for example "Gharcha Jevan data"). Copy its ID into `googleSheets.spreadsheetId`.
2. In the sheet: **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with `assets/google-apps-script/Code.gs`.
4. **Project Settings** → tick "Show appsscript.json" → replace it with `assets/google-apps-script/appsscript.json`.
5. Select **setupSheets** in the toolbar → **Run** → approve the permissions. The tabs `Menu`, `Thalis`, `Specials`, `Gallery`, `Business Info` and `Change Log` are created with header rows.
6. **Project Settings → Script properties**, add:
   - `GOOGLE_CLIENT_ID`: from [section 8](#8-owner-sign-in-google-accounts)
   - `ALLOWED_EDITORS`: for example `owner@gmail.com, helper@gmail.com`
7. **Deploy → New deployment → Web app**. Execute as **Me**, Who has access **Anyone**. Deploy, then copy the URL ending in `/exec` into `googleSheets.apiEndpoint`.
8. After changing `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version**, so the URL stays the same.

"Anyone" only means visitors can **read** what the website shows. Every change is checked against the owner's Google sign-in and the `ALLOWED_EDITORS` list inside the script.

**Good to know**

- Production starts with empty tabs on purpose, so no sample dish can ever be shown as real. Add the real menu through the dashboard.
- Editing the sheet by hand works too (keep the header row as it is). **Business Info** is a two-column list: field names in column A, values in column B. Tick-box columns hold `TRUE`/`FALSE`; thali items go one per line in the same cell.
- The website keeps a copy of the last menu it loaded, so it still shows something if Google is briefly unreachable.
- Visitors see changes within about two minutes (the script caches the public data briefly).
- If a save reaches the browser but not Google (weak signal, for example), the change is kept on that phone and the dashboard shows "The dish was updated locally, but the backup could not be synchronized. Please try again." with a **Try again** button. It also retries automatically when the connection comes back.

## 8. Owner sign-in: Google accounts

**Step by step: [SETUP-GUIDE.md](SETUP-GUIDE.md), Part 3.**

1. In <https://console.cloud.google.com>, create a project, then open **Google Auth Platform → Get started** (app name, support email, audience **External**).
2. **Audience → Test users**: add the owner's Gmail address (and any helper's).
3. **Clients → Create client → Web application**. Under **Authorized JavaScript origins** add:
   - `https://YOUR-USERNAME.github.io`
   - `http://localhost` and `http://localhost:8000` (for testing)
   - your custom domain, if any
4. Copy the **Client ID** into `auth.googleClientId` in `js/config.js` **and** into the Apps Script property `GOOGLE_CLIENT_ID`.

No passwords are stored anywhere. A Google sign-in lasts about an hour; after that the dashboard asks the owner to sign in again and keeps any unsent changes.

## 9. Switch from demo to production

When sections 6, 7 and 8 are done, edit the top of `js/config.js`:

```js
export const APP_MODE = "PRODUCTION";
export const AUTH_MODE = "GOOGLE";
```

Push to GitHub, open `/admin/`, sign in with an allowed Google account, and check **Dashboard → System status**: Website, Cloudinary, Google Sheets and Authentication should all show green. Demo sign-in switches itself off in production.

## 10. How the pieces fit together

```text
Visitor ──► GitHub Pages (index.html) ──► Apps Script ?action=public ──► Google Sheet
                                    └──► Cloudinary image URLs (resized per screen)

Owner ──► /admin/ ──► Google sign-in (ID token)
            │
            ├─ photo ──► Cloudinary upload ──► URL + public ID
            └─ save  ──► kept on the device first ──► Apps Script (checks token + allow-list)
                                                        ├─ updates the tab
                                                        └─ appends Change Log rows
```

All pages talk to data through one module, `js/services/api.js`. Demo mode and production are two paths inside it, and `js/services/sheets.js` is the only file that knows about Apps Script. Moving to another backend later (Supabase, Firebase, your own API) means replacing that one transport file.

## 10b. Keeping everything consistent when things are deleted

| Where you remove something | Website | Google Sheet | Cloudinary photo |
| --- | --- | --- | --- |
| Dashboard: **Delete** a dish, thali, special or photo | Gone within about 2 minutes | Row removed, Change Log row added | Deleted straight away |
| Dashboard: **Replace** or **Remove** a photo | New photo (or placeholder) | Link and ID updated | Old photo deleted straight away |
| Dashboard: **Hide** or switch off | Hidden | Row kept (`Available`/`Active` = FALSE) | Kept, so it can be shown again |
| Delete a row **directly in the sheet** | Gone within about 2 minutes | (done by you; not in the Change Log) | Deleted the next time you run `cleanupCloudinary` (once the photo is 7 days old) |
| Delete a photo **directly in Cloudinary** | Shows the placeholder drawing | Link still there; upload a new photo in the dashboard | (done by you) |

A photo is only ever deleted when **no row uses it any more** and it carries the `gj-cms` tag that dashboard uploads get, so other folders in the account (for example other projects) are never touched. Photo deletion needs the Cloudinary API key and secret in the Apps Script properties; see [SETUP-GUIDE.md](SETUP-GUIDE.md), Part 4.5. Without them, everything else works and old photos are simply kept.

## 11. Security notes

- **No secrets in the website.** Only public identifiers live in `js/config.js` (cloud name, preset name, sheet ID, script URL, OAuth client ID). The Cloudinary API secret, if used, stays in Apps Script properties.
- **The server decides who can edit.** The dashboard pages are public files; without an allowed Google account they cannot change anything, because Apps Script verifies the Google token and the `ALLOWED_EDITORS` list on every request. Dashboard pages are marked `noindex`.
- **Validated twice.** The browser checks every form, and Apps Script checks types, lengths, dates and links again before writing. Text that could act as a spreadsheet formula is stored as plain text.
- **Unsigned uploads** let anyone who reads the preset name upload into your Cloudinary folder. Restrict the preset as described above, or use signed uploads.
- **Demo visitors can't change anything real.** Their changes live in their own browser only, and the Apps Script refuses every write without an allowed Google sign-in.

## 12. Project structure

```text
gharcha-jevan/
├── index.html                  the public one-page website
├── .gitignore
├── admin/                      owner dashboard
│   ├── index.html              sign-in (owner or visitor demo)
│   ├── dashboard.html  menu.html  thalis.html  specials.html  gallery.html  business.html
│   ├── css/admin.css
│   └── js/
│       ├── admin.js            layout, dialogs, messages, photo uploader, add/edit form
│       ├── dashboard.js        counts, recent updates, system status
│       ├── menu-admin.js       menu, thalis and specials (one module, three pages)
│       ├── gallery-admin.js
│       ├── business-admin.js
│       └── auth.js             sign-in page
├── css/style.css               website styles; colours are variables at the top
├── js/
│   ├── config.js               ← every setting
│   ├── app.js                  website start-up, business details, photo viewer
│   ├── menu.js  gallery.js  ui.js
│   ├── auth.js                 Google sign-in and the visitor demo
│   ├── icons.js                icons (Lucide, bundled)
│   ├── site-images.js          sample photos for the hero, About and speciality cards
│   ├── utils.js
│   └── services/
│       ├── api.js              the one data layer (demo ↔ live, offline queue)
│       ├── sheets.js           Google Apps Script requests
│       ├── cloudinary.js       photo upload
│       ├── images.js           responsive image links and placeholder drawings
│       ├── schema.js           fields, sheet column names, validation
│       ├── changelog.js        change-log rows and their wording
│       └── status.js           the System status card
└── assets/
    ├── README.md               this file
    ├── SETUP-GUIDE.md          step by step: Google Sheet, Apps Script, sign-in, Cloudinary
    ├── site.webmanifest        app name and icons for phones
    ├── data/                   sample content for the demo (see below)
    ├── google-apps-script/
    │   ├── Code.gs             the backend (paste into Apps Script)
    │   └── appsscript.json
    └── images/
        ├── logo.svg            the "G" monogram
        ├── favicon.svg  favicon-32.png  icon-192.png  icon-512.png  apple-touch-icon.png
        ├── og-image.jpg        link preview (WhatsApp, Facebook)
        ├── pattern.svg         line pattern in the dark "Made the home way" band
        └── placeholder-*.svg   drawings shown when a dish, thali, special or photo has no image
```

**What the files in `assets/data/` are for.** They are the **sample content**: `menu.json`, `thalis.json`, `specials.json`, `gallery.json`, `business.json` and `changelog.json` (the "Recent updates" examples). They are used only for demos:

- in demo mode (`APP_MODE = "DEMO"`), for the whole website and dashboard;
- on the live site, for visitors who choose **Try the demo dashboard** (and for their own website preview).

The live website never reads them; it shows what is in the Google Sheet. Each file is marked `"_sample": true`. Editing them changes what demo visitors start with; **Reset demo data** in the dashboard brings a visitor back to them.

**About this README's location.** GitHub shows a README on the repository's front page only when it sits in the main folder (or in `docs/` or `.github/`). Keeping it in `assets/` keeps the main folder tidy, but visitors to the repository will need to open `assets/README.md` themselves.

## 13. Customising the design

- **Colours:** the variables at the top of `css/style.css` (and the same names in `admin/css/admin.css`): a warm cream background, curry-leaf green as the main colour (`--accent`), turmeric accents (`--spice`, `--spice-text`) and a deep green story band and footer (`--dark`).
- **Fonts:** Newsreader for headings and Manrope for text, loaded from Google Fonts in the `<head>` of each page.
- **Website photos:** the owner can set the two large photos in Business info. The three speciality photos (fish, chicken, thali) are set in `js/site-images.js`.
- **WhatsApp message:** `contact.whatsappMessage` in `js/config.js`.

## 14. Checklist before showing it to customers

- [ ] Replace every sample dish, price and photo with real ones (production starts empty, so this happens naturally).
- [ ] Fill in phone, WhatsApp, address, opening hours, Maps and Instagram in Business info.
- [ ] Write the real About text, and ask the owner before stating anything as fact (years in business, sourcing, awards).
- [ ] Replace the sample photos in `js/site-images.js` with the restaurant's own.
- [ ] Update the three URL tags in `index.html` and check the link preview by sending the link on WhatsApp.
- [ ] Check the site on a phone on mobile data.

**Deliberately not included:** online payments, delivery tracking, customer accounts, table reservations, loyalty points, a chatbot and analytics. Orders happen on WhatsApp or by phone.

---

Sample photos are Unsplash stand-ins, listed under [Sample photos](#sample-photos) below. Icons: [Lucide](https://lucide.dev) (ISC licence).

---

## Sample photos

The website and the demo data use **temporary stand-in photos from [Unsplash](https://unsplash.com)**, loaded from Unsplash's image CDN. They are free to use under the [Unsplash License](https://unsplash.com/license) and are **not photos of any real kitchen's food**.

- Replace them with real photos before launch: upload through the dashboard, and change the three speciality photos in `js/site-images.js`.
- These links were chosen without being able to preview them from the build environment. If one no longer loads, the website swaps in the matching drawing from `assets/images/` automatically.
- Unsplash does not require attribution, but it is appreciated. Open a link below to find the photographer before crediting.

| Photo link | Used in |
| --- | --- |
| <https://images.unsplash.com/photo-1756741987051-a6a38f28838b> | `js/site-images.js`, `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1742281257707-0c7f7e5ca9c6> | `js/site-images.js` |
| <https://images.unsplash.com/photo-1765265432611-17d3f2da2d5d> | `js/site-images.js`, `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1603894584373-5ac82b2ae398> | `js/site-images.js`, `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1680993032090-1ef7ea9b51e5> | `js/site-images.js` |
| <https://images.unsplash.com/photo-1742281257687-092746ad6021> | `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1742281258189-3b933879867a> | `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1711153419402-336ee48f2138> | `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1661939252817-ebb73304f4c7> | `assets/data/gallery.json`, `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1546833999-b9f581a1996d> | `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1589778655375-3e622a9fc91c> | `assets/data/gallery.json` |
| <https://images.unsplash.com/photo-1765265432607-cdc1060294ba> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1633962498172-e5921a95b629> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1654863404432-cac67587e25d> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1620894580123-466ad3a0ca06> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1606843046080-45bf7a23c39f> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1707448829764-9474458021ed> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1708782344490-9026aaa5eec7> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1567337710282-00832b415979> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1588644525273-f37b60d78512> | `assets/data/menu.json` |
| <https://images.unsplash.com/photo-1584182711222-2068e7eca683> | `assets/data/specials.json` |
| <https://images.unsplash.com/photo-1786222084052-fb6f27bfb135> | `assets/data/thalis.json` |
| <https://images.unsplash.com/photo-1542367592-8849eb950fd8> | `assets/data/thalis.json` |
| <https://images.unsplash.com/photo-1786227905994-235e1799292e> | `assets/data/thalis.json` |

### Drawings, logo and pattern

The `placeholder-*.svg` drawings, `logo.svg`, `pattern.svg` and the icons in `assets/images/` were made for this project and may be used freely with it.
