# Account Mapper

A private, browser-only tool for mapping a fleet customer's **parent business and child accounts**, with stages, contacts at the right level, billing / credit lines, fleet-data files, and one-click copy for Salesforce.

**Your data stays in this browser. Nothing is uploaded.**

- Live app (code only, no data): https://nptrulock.github.io/wex-account-mapper/
- Works offline once opened (installable PWA: in Chrome/Edge use *Install app*; on iPad Safari use *Share → Add to Home Screen*).
- `index.html` is also a complete single file: save it and open it from disk if you prefer.

## Privacy model
- 100% client-side. No backend, no analytics, no fonts/CDNs. The page's Content-Security-Policy sets `default-src 'none'` and **`connect-src 'none'`**: the app cannot contact any server at all, even by mistake. There is no connection to Salesforce.
- The only network traffic is the browser downloading the app's own code (HTML, icon, manifest, service worker) from GitHub Pages. No customer data is ever in those requests.
- Salesforce report exports you upload are read **inside the browser** (no upload anywhere, despite the button name) and saved encrypted on that device.
- Accounts, contacts and uploaded files are saved in the browser's IndexedDB on that device only. Clearing site data erases them — use **Export workspace** for backups.
- **Sharing between reps:** Export workspace → send the `.json` file through an approved internal channel → the other rep uses **Open workspace file** (merge or replace).
- The repository contains no customer data. The only demo data is clearly fictional ("Sample: …", `example.com`, 555 numbers) and loads only when you press **Load sample**.
- Follow your company's data-handling policy for where workspace and master files are stored.

## Passcode lock & encryption at rest
- On first run each browser sets its own passcode (6+ characters). The whole app stays behind the lock screen until it's entered.
- The passcode is never stored. PBKDF2-SHA256 (600,000 iterations, random 16-byte salt, WebCrypto) derives a 256-bit **AES-GCM** key and a separate verifier hash. The workspace and every attachment in IndexedDB are AES-GCM encrypted with a fresh IV; nothing readable is stored. Data saved before the lock existed is encrypted automatically when the passcode is first set.
- **Auto-lock** after 15 minutes of no activity (1–120 min in ☰ → Settings & passcode), plus a 🔒 Lock button. Locking clears the data from memory. Reloading always starts locked. After 5 wrong tries, unlocking is delayed (30 s, doubling, up to 15 min).
- **Change passcode** (needs the current one) re-encrypts everything in one atomic step.
- **Forgot passcode:** there is no reset and no backdoor. The only option is to erase this browser's data (type ERASE to confirm). Keep exported backups.
- **Exports are passcode-protected by default** (separate passcode chosen at export, PBKDF2 + AES-GCM). The importing rep is asked for it. Share that passcode separately from the file. This can be turned off in Settings.
- **Honest limit:** the passcode protects data on this device. A public static site can't restrict who loads the page itself — but without the passcode there's no data to see.

## What it does
| Area | What you get |
|---|---|
| Accounts | Parent businesses with nested child accounts (any depth) and non-hierarchical *linked* accounts. Each card: business name, Salesforce Account ID, Case #, Opportunity name/#/ID, rep name/email/phone, stage, notes. |
| Chart | Org chart with connector lines, colored by stage (or an Outline view for big trees), search highlight, stage filter. |
| Stages | Application Follow-up → Implementation Call → Monitor & Control, with badges, step bars, and a business-wide pipeline/progress overview. |
| Contacts | **Parent level** (applies to that account and everything under it — shown as *Inherited* on children) or **Child only** (just the checked location). Coverage matrix shows who covers what. |
| Billing | Each child is *Billed at parent* (rolls up to the nearest parent credit line) or *Billed at child* (own limit, cycle, terms, billing contact). Summary of total exposure, own lines, roll-ups. |
| Copy for Salesforce | 📋 on every field; *Copy all* (labeled lines) and *Copy row* (tab-separated header + values, pastes into Excel/SF); copy table, copy business summary. |
| Upload Salesforce exports | Drop one or many Salesforce report exports (see below); the map builds itself. |
| Paste | Paste rows from a Salesforce list view/report, labeled `Field: value` lines, or a Salesforce report CSV (footer lines stripped). Map columns once — the mapping is remembered. Creates or updates accounts (matched by SF ID, then name) and contacts (matched by email). |
| Files | Upload CSV fleet data (and any other attachment) to any parent or child. Preview CSVs. **Build master file** = one `.xlsx` with tabs *Summary, Accounts, Contacts, Billing, All Fleet Data* (stacked with Account/Source columns; union of headers when files differ) and one tab per CSV. Also a `.zip` of separate CSVs + attachments. |

## Upload Salesforce exports
No direct Salesforce connection: reps run reports in Salesforce, **Export** them, and drop the files on **⬆ Upload Salesforce exports** (header button, empty screen, or drag anywhere). Several files at once is fine.

- **Formats:** every Salesforce `.xls` flavor — Classic "Excel" export (an HTML table), Excel 2003 XML (SpreadsheetML), and genuine Excel 97-2003 (BIFF8) — plus `.xlsx` and `.csv` (UTF-8 / UTF-16 / Windows-1252). "Details only" and **Formatted** reports both work: title/filter blocks, grouping rows (`Account Name: … (n records)`), blank group cells, Subtotal / Total / Grand Totals rows and the Copyright / Confidential / Generated By footer are skipped or filled down automatically. Dates come through as `m/d/yyyy` (with time when present); IDs and case numbers keep leading zeros. All parsing is hand-written code in `src/readers.js`; nothing is fetched.
- **Report type** is detected from the headers (Accounts, Contacts, Opportunities, Cases, Billing / credit, Other) and can be changed per file. Columns are **auto-mapped** to Account ID, name, Parent Account (ID or name), Ultimate Parent, owner/rep, stage, Case #, Opportunity, contacts (and their level), credit line, billing level, cycle, terms and billing contact. *Adjust columns* changes any mapping; changes are remembered for that report layout.
- **Linking across files:** accounts match by Account ID (15 or 18 characters), then by name (a name never merges two different IDs, so same-named locations stay separate). The hierarchy is built after all files are read, so parents can come from any file; a parent that's only named gets a placeholder.
- **Stages:** values clearly meaning Application Follow-up / Implementation Call / Monitor & Control are mapped automatically. Any other value is listed once with a chooser; your choice is remembered. The raw value is always kept as *Salesforce stage*. Opportunity sales stages are kept as an extra field, not used as the Wex stage.
- **Nothing is lost:** columns without a home are kept as **extra fields** on the account (or contact) — shown under *From Salesforce exports* with 📋 copy buttons, included in *Copy all* and as columns in the master `.xlsx`. Extra opportunities / cases on the same account are kept as *Other …* fields.
- **Preview first:** per-file format, header row, rows used / skipped, mapped vs extra columns, and the new vs updated counts before *Import everything*. Re-uploading the same files only updates (no duplicates).

## Wex Fleet Data forms (`<Company>_FleetData.xls`)
The card-order export is a one-sheet **form**, not a report. Drop it with the other exports (any `.xls` flavor) and it is recognised automatically.

- **Read by label, not by row number** (case, colon and spacing don't matter): Opportunity; Billing First/Last Name, Address, Line 2, City, State, Postal Code, Phone, Email; Attention and Card Shipping Address, Line 2, City, State, Postal Code; Number Of Cards; Company Name; Second Line Embossing Option; prompt flags Department / Vehicle Description / License Plate # / Company Vehicle ID (Yes/No). Tables are found by their header rows: **Name | Phone | Email** contacts, the **vehicle** table (Company Vehicle ID, Vehicle Description, Department, License Plate #, … VIN — matched by prefix) and the **driver** table (First Name, Last Name, Department, Driver ID). Blank cells, "RENTAL VEH" rows and rows that hold a driver name are kept as-is.
- **Attach to:** each form defaults to the account with the same Opportunity #, then the file name (`<Company>_FleetData`), then Company Name — so each child location's file lands on that child. The preview lets you pick any existing parent/child, a new top-level account, or a new child under a business.
- **What it fills:** Opportunity # · billing contact (a contact with role *Billing*, plus the account's billing contact) · **Billing contact & address**, **Card shipping**, **Card setup** (cards, company name, embossing, prompts) sections on the account — every field editable with 📋 copy and *Copy address* · contacts from the Name/Phone/Email table at that account's level · **Vehicles** and **Drivers** tables (view, copy, counts on the chart). The original file is kept as an attachment. Re-uploading updates in place.
- **Downloads:** each account has **⬇ Vehicles.csv** and **⬇ Drivers.csv** (`<Account> - Vehicles.csv`, `<Account> - Drivers.csv`) in the account panel and on *Files & master file*. **⬇ Master list (one click)** (business header) builds one `.zip` with the master `.xlsx` (Summary, Accounts with billing/shipping/card/prompt columns, Contacts, Billing, All Fleet Data, All Vehicles, All Drivers, one tab per account's Vehicles/Drivers), `Master Accounts.csv`, `All Vehicles.csv`, `All Drivers.csv` (with Account / Account ID / Parent Account / Parent Account ID / Source File columns), every account's own CSVs and the original files.

### If a Fleet Data file doesn't come through
The upload preview has **How these files were read** → **📋 Copy structure**. It copies only the layout: recognised labels and table headers, each value replaced by its type and length (`[text 12]`, `[number 5 digits]`, `[email]`, `[yes/no]`, `[empty]`), row numbers and counts, and what the app decided. No customer values and no file name are included, so it is safe to paste to whoever maintains the app.

Files are read as **one grid**: every table of an HTML `.xls` in document order (one table per block, nested layout tables and MHTML web archives included) and every sheet of an XML / Excel 97 file. Labels are matched ignoring case, colons, punctuation, non-breaking / zero-width spaces and HTML formatting; the value is the next filled cell to the right (any column); `Label: value` in one cell and side-by-side pairs work; bare `City:` / `State:` / `Postal Code:` belong to the block above. Vehicle rows with an empty first column are kept.

## Fields not shown
Salesforce Account ID, Opportunity Name and Rep phone are no longer shown, copied or exported (Opportunity # stays). Account IDs from uploads are still used behind the scenes to link parent/child accounts across files.

## Development
- Source in `src/` (`app.css`, `core.js`, `readers.js`, `model.js`, `app.js`, `lock.js`, `app2.js`, `upload.js`, `fleet.js`, `shell.html`, `sw.js`). `python3 tools/build.py` inlines everything into `index.html` and stamps the service-worker cache version.
- The XLSX/ZIP writers and the XLS/XLSX/CSV readers (inflate, OLE/CFB, BIFF8, SpreadsheetML, HTML) are hand-written (no third-party libraries).
- Tests: `python3 tests/make_fixtures.py` builds **fictional** Salesforce-style exports in `tests/fixtures/` (one per format); `python3 tests/upload_test.py [url]` runs the upload checks in headless Chrome. `tests/make_fleet_fixtures.py` + `tests/fleet_test.py` do the same for fictional Fleet Data forms in all three `.xls` flavors. Never add real exports to the repo.
