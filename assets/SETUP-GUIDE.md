# Setup guide: Google Sheets, Apps Script, Google sign-in and Cloudinary

This connects the owner dashboard to real storage. (Paths are relative to the project folder, the one that contains `index.html`.)

- **Google Sheet**: stores the menu, thalis, specials, gallery, business info and a change log.
- **Apps Script**: a small web API attached to the sheet. It reads data for the website and writes the dashboard's edits, after checking the owner's Google sign-in.
- **Google sign-in**: decides who may edit.
- **Cloudinary**: stores the photos in a folder structure; the sheet keeps each photo's link.

```text
Website ──────── reads ─────────► Apps Script ──► Google Sheet
Dashboard ── saves (signed in) ─► Apps Script ──► Google Sheet + Change Log
Dashboard ── photo ─────────────► Cloudinary  ──► link + ID saved in the sheet
```

Time needed: about 45 minutes. Do the parts in order. You will collect five values along the way:

| Value | Looks like | From |
| --- | --- | --- |
| Sheet ID | `1AbCdEf…xyz` | Part 1 |
| Apps Script URL | `https://script.google.com/macros/s/AKfy…/exec` | Part 2 |
| Google Client ID | `1234…-abcd.apps.googleusercontent.com` | Part 3 |
| Cloudinary cloud name | `dxyz12abc` | Part 4 |
| Upload preset name | `gj_cms_unsigned` | Part 4 |

---

## Before you start: the "Publish to the web" link is not needed

This project never reads the published CSV link. The website gets its data from the Apps Script, which returns only what should be public (visible dishes, never the Change Log).

1. **Stop publishing.** A published sheet can expose every tab, including the Change Log with the editors' email addresses. In the sheet: **File → Share → Publish to the web → Stop publishing**.
2. **Use the real Sheet ID.** The code in a published link (`/d/e/2PACX-…/pub`) is not the Sheet ID. Open the sheet normally and copy the part of the address between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbCdEf…xyz`**`/edit`

Use a personal Gmail account to own the sheet. Google Workspace (company) accounts often block the "Anyone" web-app setting used in Part 2.

---

## Part 1: The Google Sheet (tabs and columns)

You need **six tabs** with these exact names and header rows. You don't have to type them: Part 2, step 5 runs `setupSheets()`, which creates all of them. The tables below show what each tab holds.

**Rules for all tabs**

- Row 1 is the header row (Business Info is the exception, see below). Don't rename tabs or headers. Moving columns is fine, because the script finds columns by name.
- One row per item. The dashboard creates the **ID**; never change or copy an ID by hand.
- `Available`, `Featured` and `Active` hold `TRUE` or `FALSE`.
- Prices are plain numbers (`420`, not `₹420`). `0` or empty shows "Ask for price".
- Dates are `YYYY-MM-DD` (for example `2026-09-20`).
- Photo links and IDs are filled in by the dashboard after an upload.

### Tab `Menu`: one row per dish

| Column | Holds | Example |
| --- | --- | --- |
| ID | created by the dashboard | `fish-mfz1k2ab` |
| Category | `Fish`, `Chicken`, `Thali`, `Specials` or `Other` | `Fish` |
| Name | dish name | `Surmai Fry` |
| Description | up to 300 characters | `Kingfish in home-style masala…` |
| Price | number | `420` |
| Available | shown on the website? | `TRUE` |
| Featured | shown large with a "Recommended" label | `FALSE` |
| Image URL | Cloudinary link | `https://res.cloudinary.com/…` |
| Cloudinary Public ID | Cloudinary's name for the photo (its folder is kept separately) | `surmai-fry-mfz1k2ab` |
| Display Order | lower numbers first | `1` |
| Created At / Updated At | set by the script | `2026-09-15T10:30:00.000Z` |

### Tab `Thalis`: one row per thali

Same as Menu, without `Category`, plus **Items**: what comes on the plate, **one item per line inside the cell** (Ctrl+Enter or Cmd+Enter makes a new line).

`ID, Name, Description, Price, Items, Available, Featured, Image URL, Cloudinary Public ID, Display Order, Created At, Updated At`

### Tab `Specials`: one row per special

| Column | Holds |
| --- | --- |
| ID, Name, Description, Price, Image URL, Cloudinary Public ID | as in Menu |
| Available | `FALSE` shows "Sold out for today" |
| Start Date / End Date | optional; empty means "until switched off" |
| Active | `FALSE` hides the special |
| Updated At | set by the script |

### Tab `Gallery`: one row per photo

`ID, Image URL, Cloudinary Public ID, Category, Caption, Display Order, Active, Created At`

Category is one of `Food`, `Fish`, `Chicken`, `Thali`, `Restaurant`, `Events`.

### Tab `Business Info`: a two-column list

This tab holds a single record, so it is laid out as a list: **field names in column A, values in column B**.

| A: Field | B: Value |
| --- | --- |
| Business Name | Gharcha Jevan |
| Tagline | Food that tastes like home |
| Phone | [PHONE NUMBER] |
| WhatsApp | [WHATSAPP NUMBER] |
| Address | [BUSINESS ADDRESS] |
| Google Maps URL | [GOOGLE MAPS LINK] |
| Instagram URL | [INSTAGRAM LINK] |
| Opening Hours | [OPENING HOURS] |
| About Text | empty until you write it |
| Hero Image URL | set by the dashboard |
| Hero Image Public ID | set by the dashboard |
| About Image URL | set by the dashboard |
| About Image Public ID | set by the dashboard |

`setupSheets()` creates this list with the placeholders. Replace them in **Dashboard → Business info**, or type straight into column B. Rows are found by the name in column A, so their order doesn't matter; don't rename the names. A tab in the older one-row layout (names across row 1) is converted automatically, keeping its values, the next time `setupSheets()` runs or the business info is saved.

### Tab `Change Log`: written by the script, don't edit

`Timestamp, Action, Entity Type, Entity ID, Field, Old Value, New Value, User`

Every save adds one row per changed field. Example row: `2026-09-15T10:30:00Z | update | thalis | thali-001 | price | 350 | 400 | owner@gmail.com`.

<details>
<summary>Creating the tabs by hand instead (not needed if you run setupSheets)</summary>

Create each tab, click cell A1, paste its line below, then use **Data → Split text to columns** (separator: comma). Create **Business Info** as an empty tab; `setupSheets()` fills in its two-column list.

```text
Menu:          ID,Category,Name,Description,Price,Available,Featured,Image URL,Cloudinary Public ID,Display Order,Created At,Updated At
Thalis:        ID,Name,Description,Price,Items,Available,Featured,Image URL,Cloudinary Public ID,Display Order,Created At,Updated At
Specials:      ID,Name,Description,Price,Available,Image URL,Cloudinary Public ID,Start Date,End Date,Active,Updated At
Gallery:       ID,Image URL,Cloudinary Public ID,Category,Caption,Display Order,Active,Created At
Change Log:    Timestamp,Action,Entity Type,Entity ID,Field,Old Value,New Value,User
```

Then run `setupSheets()` anyway: it also formats ID, phone and date columns as plain text so Sheets doesn't turn them into numbers or dates.
</details>

---

## Part 2: Apps Script (the read and write API)

> **Already deployed?** Your Web app URL is already in `js/config.js`. This project's `Code.gs` has changed since your deployment (Gharcha Jevan defaults, photo names), so paste the new `Code.gs` (step 2), then **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same. Then run `setupSheets()` once more: it turns **Business Info** into the two-column list, keeps your values and drops any stray columns.

1. Open the sheet → **Extensions → Apps Script**. A new tab opens. Click the title "Untitled project" and rename it, for example `Gharcha Jevan API`.
2. In the file list, click **Code.gs**, delete everything in it, and paste the full contents of `assets/google-apps-script/Code.gs` from this project.
3. Click **Project Settings** (gear icon) → tick **Show "appsscript.json" manifest file in editor**. Back in **Editor**, open `appsscript.json`, replace its contents with `assets/google-apps-script/appsscript.json`, and **Save** (Ctrl+S or Cmd+S).
4. At the top of the editor, choose **setupSheets** in the function dropdown and click **Run**.
5. Google asks for permission: **Review permissions** → choose your account → "Google hasn't verified this app" → **Advanced** → **Go to Gharcha Jevan API (unsafe)** → **Allow**. This warning is normal for your own scripts.
6. Check the sheet: the six tabs now exist with bold header rows.
7. **Project Settings → Script properties → Add script property**, and add:
   - `ALLOWED_EDITORS`: the Gmail addresses allowed to edit, comma-separated, for example `owner@gmail.com, helper@gmail.com`
   - `GOOGLE_CLIENT_ID`: leave for now; you add it in Part 3.
   - The `CLOUDINARY_*` properties come in Part 4.5.

   Click **Save script properties**.
8. **Deploy → New deployment** → click the gear next to "Select type" → **Web app**:
   - Description: `v1`
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy** and authorize again if asked.
9. Copy the **Web app URL**. It ends in `/exec`; this is your Apps Script URL.
10. Test it: open `YOUR_URL?action=ping` in a browser. You should see
    `{"ok":true,"sheetsReady":true,…}`.
    `YOUR_URL?action=public` should return the (still empty) data.

"Anyone" only lets visitors read what the website shows. Every save is checked against the Google sign-in and `ALLOWED_EDITORS`.

**After you change Code.gs later:** Deploy → **Manage deployments** → pencil icon → Version: **New version** → **Deploy**. The URL stays the same. Don't use the `/dev` test URL on the website.

---

## Part 3: Google sign-in for the dashboard

1. Open <https://console.cloud.google.com>, sign in with the owner's account, and create a project (project picker → **New project**, for example `gharcha-jevan`).
2. Search for **Google Auth Platform** in the top search bar and open it → **Get started**:
   - App name: `Gharcha Jevan dashboard`; support email: yours
   - Audience: **External**
   - Contact information: your email → agree → **Create**
3. **Audience → Test users → Add users**: add every Gmail address from `ALLOWED_EDITORS`. While the app is in "Testing", only these accounts can sign in, which suits a private dashboard.
4. **Clients → Create client**:
   - Application type: **Web application**; name: `Dashboard`
   - **Authorized JavaScript origins → Add URI**, one per line, no paths and no trailing slash:
     - `https://YOUR-USERNAME.github.io`
     - `http://localhost`
     - `http://localhost:8000`
     - your custom domain, if any, for example `https://www.example.in`
   - Authorized redirect URIs: leave empty
   - **Create**
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). No client secret is needed. *(Yours is already in `js/config.js`.)*
6. Paste it in two places:
   - Apps Script → Project Settings → Script properties → `GOOGLE_CLIENT_ID`
   - `js/config.js` → `auth.googleClientId` (Part 5)

New origins can take a few minutes to start working.

---

## Part 4: Cloudinary (photos)

### 4.1 Account and cloud name

1. Sign up at <https://cloudinary.com> (the free plan is enough).
2. Copy your **Cloud name** from the Console home page, or from **Settings → API Keys**.

### 4.2 Upload preset (the website's permission to upload)

1. **Settings** (gear icon) → **Upload Presets** (older layout: Settings → Upload → Upload presets) → **Add Upload Preset**.
2. Fill in the form like this:
   - **Upload preset name**: for example `gharcha-jevan` (the one already in `js/config.js`)
   - **Signing mode**: **Unsigned**
   - **Asset folder**: **leave empty**. The website files every photo inside `Gharcha Jevan/…` itself. For unsigned uploads, a folder typed here overrides the website's folder, so every photo would land loose in that one folder.
   - **Overwrite assets with the same public ID**: off (unsigned uploads never overwrite anyway)
   - **Generated public ID**: leave **Auto-generate an unguessable public ID value** selected, and leave "Use the filename", "Append a unique suffix" and "Prepend a path to the public ID" off. The website always sends its own readable name, so this setting is only a fallback.
   - **Generated display name**: **Use the last segment of the public ID as the asset's display name**, so the Media Library shows names like `surmai-fry-mfz1k2abx9q`
   - If you see **Set the public ID path to match the initial asset folder path**, leave it off.
   - If the preset offers **Allowed formats** or **Max file size** (on its other tabs), use `jpg, jpeg, png, webp, heic, heif, avif` and 10 MB. An optional incoming transformation `c_limit,w_2000,h_2000` keeps huge originals out.
3. **Save**, and note the preset name.

### 4.3 The folder structure (created automatically)

Every photo is filed inside one top folder, **Gharcha Jevan**. You don't need to create anything: Cloudinary creates each folder on the first upload into it. You can also create folders of your own inside it in the Media Library.

```text
Gharcha Jevan/
├── menu/
│   ├── fish/        dishes in the Fish category
│   ├── chicken/     dishes in the Chicken category
│   ├── thali/       Thali-category dishes and all Thalis
│   ├── specials/    Specials-category dishes and Today's specials
│   └── other/       sides and drinks
├── gallery/
│   ├── food/        gallery photos tagged Food, Fish, Chicken or Thali
│   ├── restaurant/
│   └── events/
└── site/            the two large website photos (hero, about)
```

- **Names:** each photo gets a readable, unique name from the dish name or caption, for example `surmai-fry-mfz1k2abx9q`, plus the tags `gj-cms`, the section and the category. The unique ending matters because unsigned uploads never overwrite an existing photo.
- **Links:** the website sends the folder as `asset_folder` (`cloudinary.useAssetFolder: true` in `js/config.js`), which is what Cloudinary recommends for accounts whose presets show an **Asset folder** field. Photo links stay short (`…/image/upload/v…/surmai-fry-mfz1k2abx9q.jpg`), so moving or renaming folders in the Media Library later never breaks the website.
- **Older accounts:** if your presets show **Folder** instead of Asset folder, set `useAssetFolder: false` and `baseFolder: "gharcha-jevan"` (no spaces).
- **Renaming the top folder:** change `cloudinary.baseFolder` in `js/config.js`. For signed uploads, also add the same name as the Apps Script property `CLOUDINARY_BASE_FOLDER`.

### 4.4 Stricter option: signed uploads (recommended once live)

An unsigned preset name is visible in the website code, so anyone who finds it could upload into your account. Signed uploads fix this: the Apps Script signs each upload only for signed-in editors, and only for `gharcha-jevan/…` folders.

1. Cloudinary **Settings → API Keys**: copy the **API Key** and **API Secret**.
2. Apps Script → Script properties, add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.
3. `js/config.js` → `cloudinary.uploadMode: "SIGNED"`.
4. Test an upload, then delete the unsigned preset in Cloudinary.

Never put the API Secret in any website file.

---

### 4.5 Automatic photo clean-up (recommended)

With this set up, deleting a dish or replacing its photo in the dashboard also deletes the old photo from Cloudinary. Running `cleanupCloudinary` now and then removes photos whose rows were deleted by hand in the sheet. Only photos uploaded by the dashboard (tag `gj-cms`) and no longer used by any row are ever deleted, so other folders in your account are safe.

1. Cloudinary **Settings → API Keys → Generate New API Key**: name `gharcha-jevan`, role **Master Admin** → **Create**. Keep this key separate from the Root key, so it can be switched off on its own.
2. Apps Script → **Project Settings → Script properties**, add:
   - `CLOUDINARY_CLOUD_NAME`: `dadtqawh5`
   - `CLOUDINARY_API_KEY`: the new key
   - `CLOUDINARY_API_SECRET`: its secret (only here, never in the website files)
3. Paste the latest `Code.gs` **and** `appsscript.json`, then **Deploy → Manage deployments → pencil → Version: New version → Deploy**.
4. Whenever you want to tidy up: in the editor, choose **cleanupCloudinary** in the function dropdown → **Run**. The first time, approve the permission request. The Execution log shows how many unused photos were deleted.

Optional Script properties:
- `CLOUDINARY_AUTO_DELETE` = `false` keeps every old photo.
- `CLOUDINARY_CLEANUP_GRACE_HOURS` (default `168`, 7 days): `cleanupCloudinary` leaves newer photos alone, so an upload whose save is still waiting to sync is never lost.

The same key also enables signed uploads (4.4).

**What happens when something is removed**

| Where | Website | Sheet | Cloudinary |
| --- | --- | --- | --- |
| Dashboard: Delete | gone within ~2 min | row removed, logged | photo deleted now |
| Dashboard: Replace/Remove photo | updated | link updated | old photo deleted now |
| Dashboard: Hide | hidden | row kept | photo kept |
| Row deleted by hand in the sheet | gone within ~2 min | (by you, not logged) | deleted when you next run `cleanupCloudinary` (after 7 days) |
| Photo deleted in Cloudinary | placeholder shown | link remains | (by you) |

---

## Part 5: Fill in `js/config.js`

```js
export const APP_MODE = "PRODUCTION";   // was "DEMO"
export const AUTH_MODE = "GOOGLE";      // was "DEMO"

// inside CONFIG:
  cloudinary: {
    cloudName: "dadtqawh5",             // Part 4.1 (already filled in)
    uploadPreset: "gharcha-jevan",      // Part 4.2 (already filled in)
    baseFolder: "Gharcha Jevan",       // top folder for all photos
    useAssetFolder: true,
    uploadMode: "UNSIGNED",             // "SIGNED" after Part 4.4
    // (leave the other cloudinary settings as they are)
  },
  googleSheets: {
    spreadsheetId: "1AbCdEf…xyz",       // Part 1 (optional: adds a "Full change log" link to the dashboard)
    apiEndpoint: "https://script.google.com/macros/s/AKfy…/exec",   // Part 2 (already filled in)
    // (leave tabs as they are)
  },
  auth: {
    mode: AUTH_MODE,
    googleClientId: "1009318710221-…apps.googleusercontent.com",   // Part 3 (already filled in)
    allowDemo: true,                    // visitors can "Try the demo" (changes stay in their browser)
  },
  website: {
    dashboardInvite: true,              // small "try the dashboard demo" bar on the live site
  },
```

Also set `website.publishedUrl` and the three URL tags in `index.html` once you know the GitHub Pages address (README, section 4). Commit and push.

---

## Part 6: Switch on and test

1. Open `…/admin/` and sign in with an address from `ALLOWED_EDITORS`.
2. **Dashboard → System status**: Website, Cloudinary, Google Sheets and Authentication should all be green.
3. **Menu → Add dish**: name `Test dish`, category Fish, any photo → **Add dish**. Then check:
   - the message says "added and backed up to Google Sheets"
   - the sheet's `Menu` tab has a new row with an Image URL
   - `Change Log` has a `create` row with your email
   - Cloudinary **Media Library** → **Gharcha Jevan** → **menu** → **fish** contains `test-dish-…`
   - the website shows the dish (within about two minutes)
4. Delete the test dish in the dashboard. Its photo stays in Cloudinary; delete it in the Media Library if you like.
5. **Business info**: fill in phone, WhatsApp, address, opening hours, Maps and Instagram links.
6. **Visitor demo**: in a private window, open `…/admin/` → **Try the demo dashboard**, add a dish, then open the website: a "Demo preview" bar appears and your live menu is unchanged for everyone else.

The sheet starts empty, so no sample dish appears on the live site. Add the real menu through the dashboard.

---

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `?action=ping` opens a Google login page or an HTML error | The deployment's access isn't **Anyone**. Edit the deployment (Part 2, step 8) and deploy a new version. |
| `"sheetsReady": false` | Run `setupSheets()` again; check the tab names weren't changed. |
| Dashboard: "The backend is not set up yet…" | Add `GOOGLE_CLIENT_ID` and `ALLOWED_EDITORS` in Script properties. |
| "The account … is not allowed to edit this website" | Add that exact address to `ALLOWED_EDITORS` (comma-separated). |
| Google button: "origin_mismatch" or "not a valid origin" | Add the site's exact origin in Part 3, step 4 (scheme and host, no path) and wait a few minutes. |
| Google: "Access blocked" or "access_denied" | Add the account under **Audience → Test users**. |
| "Upload preset not found" or "must be whitelisted for unsigned uploads" | Check the preset name in `js/config.js`, and that the preset's Signing mode is **Unsigned**. |
| All photos land in one folder | The preset has a folder set. Clear it (Part 4.2). |
| Upload error mentioning `public_id` | Turn off **Disallow public ID** in the preset. |
| Signed upload: "Signed uploads are not set up" | Add the three `CLOUDINARY_*` Script properties (Part 4.4). |
| Code.gs changes have no effect | Deploy a **New version** (end of Part 2). |
| Website still shows old data | Wait about two minutes (public data is cached briefly), then refresh. |
| Old photos stay in Cloudinary | Add the three `CLOUDINARY_*` Script properties (Part 4.5) and deploy a new version. Photos without the `gj-cms` tag or still used by a row are kept on purpose. |
| The website shows demo dishes | That browser is in the visitor demo: use **Back to the live site** in the top bar. |
