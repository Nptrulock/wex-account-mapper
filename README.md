# Account Mapper

A private, browser-only tool for mapping a fleet customer's **parent business and child accounts**, with stages, contacts at the right level, billing / credit lines, fleet-data files, and one-click copy for Salesforce.

**Your data stays in this browser. Nothing is uploaded.**

- Live app (code only, no data): https://nptrulock.github.io/wex-account-mapper/
- Works offline once opened (installable PWA: in Chrome/Edge use *Install app*; on iPad Safari use *Share → Add to Home Screen*).
- `index.html` is also a complete single file: save it and open it from disk if you prefer.

## Privacy model
- 100% client-side. No backend, no analytics, no fonts/CDNs. The page's Content-Security-Policy sets `default-src 'none'` and limits `connect-src` to Wex's Salesforce only (`https://wexinc.my.salesforce.com https://login.salesforce.com https://test.salesforce.com https://*.force.com`). The app cannot reach any other host, even by mistake.
- Without the optional Salesforce connection, the only network traffic is the browser downloading the app's own code (HTML, icon, manifest, service worker) from GitHub Pages. No customer data is ever in those requests.
- Accounts, contacts and uploaded files are saved in the browser's IndexedDB on that device only. Clearing site data erases them — use **Export workspace** for backups.
- **Sharing between reps:** Export workspace → send the `.json` file through an approved internal channel → the other rep uses **Open workspace file** (merge or replace).
- The repository contains no customer data. The only demo data is clearly fictional ("Sample: …", `example.com`, 555 numbers) and loads only when you press **Load sample**.
- Follow your company's data-handling policy for where workspace and master files are stored.

## What it does
| Area | What you get |
|---|---|
| Accounts | Parent businesses with nested child accounts (any depth) and non-hierarchical *linked* accounts. Each card: business name, Salesforce Account ID, Case #, Opportunity name/#/ID, rep name/email/phone, stage, notes. |
| Chart | Org chart with connector lines, colored by stage (or an Outline view for big trees), search highlight, stage filter. |
| Stages | Application Follow-up → Implementation Call → Monitor & Control, with badges, step bars, and a business-wide pipeline/progress overview. |
| Contacts | **Parent level** (applies to that account and everything under it — shown as *Inherited* on children) or **Child only** (just the checked location). Coverage matrix shows who covers what. |
| Billing | Each child is *Billed at parent* (rolls up to the nearest parent credit line) or *Billed at child* (own limit, cycle, terms, billing contact). Summary of total exposure, own lines, roll-ups. |
| Copy for Salesforce | 📋 on every field; *Copy all* (labeled lines) and *Copy row* (tab-separated header + values, pastes into Excel/SF); copy table, copy business summary. |
| Paste / import | Paste rows from a Salesforce list view/report, labeled `Field: value` lines, or a Salesforce report CSV (footer lines stripped). Map columns once — the mapping is remembered. Creates or updates accounts (matched by SF ID, then name) and contacts (matched by email). |
| Files | Upload CSV fleet data (and any other attachment) to any parent or child. Preview CSVs. **Build master file** = one `.xlsx` with tabs *Summary, Accounts, Contacts, Billing, All Fleet Data* (stacked with Account/Source columns; union of headers when files differ) and one tab per CSV. Also a `.zip` of separate CSVs + attachments. |

## Salesforce connection (optional, read-only — off until Wex approves it)
The **Paste / import** tab has a Salesforce card. It is built but does nothing until a Wex Salesforce admin supplies a Consumer Key. No passwords or secrets are ever entered into this app.

- **Instance URL:** prefilled `https://wexinc.my.salesforce.com` (editable; must be a Salesforce address).
- **How it signs in:** OAuth 2.0 Authorization Code + **PKCE** on Salesforce's own login page — no client secret in the browser. Each rep signs in as themselves, so Salesforce sharing rules still apply. The access token is kept in `sessionStorage` (gone when the tab closes) and is never saved in the workspace or exported.
- **What it does:** *Pull business from Salesforce* takes an Account ID or exact name and reads the account, its children (4 levels), their contacts, latest Case # and Opportunity, into the map. **Read-only**: only SOQL `GET` queries; the only `POST` is the OAuth token exchange. Nothing is written back.
- **Admin checklist (once):**
  1. **Approval first.** Connecting any tool to Wex's Salesforce needs sign-off from Wex IT / Information Security (and the Salesforce platform team).
  2. Salesforce admin creates an **External Client App** (or Connected App): OAuth on, scope `api`, **Require PKCE**, no client secret required for the web-server flow, callback URL `https://nptrulock.github.io/wex-account-mapper/`. Assign permitted profiles/permission sets. Send the rep the Consumer Key.
  3. **CORS:** in the **wexinc** org, Setup → CORS → add **`https://nptrulock.github.io`** to *Allowed Origins*, and enable **CORS for OAuth endpoints** (Setup → CORS). Without this, the browser blocks sign-in and queries ("Failed to fetch").
- **Code:** `src/sf.js` registers a `salesforce-api` adapter on the `DataSources` registry (`src/core.js`); everything flows through the same `applyImport()` as paste/CSV.
- Alternative worth asking the admins about: putting this view inside Salesforce (a Lightning Web Component plus custom fields for billing mode / credit line).

## Development
- Source in `src/` (`app.css`, `core.js`, `model.js`, `app.js`, `sf.js`, `app2.js`, `shell.html`, `sw.js`). `python3 tools/build.py` inlines everything into `index.html` and stamps the service-worker cache version.
- The XLSX and ZIP writers are hand-written (no third-party libraries).
