# Account Mapper

A private, browser-only tool for mapping a fleet customer's **parent business and child accounts**, with stages, contacts at the right level, billing / credit lines, fleet-data files, and one-click copy for Salesforce.

**Your data stays in this browser. Nothing is uploaded.**

- Live app (code only, no data): https://nptrulock.github.io/wex-account-mapper/
- Works offline once opened (installable PWA: in Chrome/Edge use *Install app*; on iPad Safari use *Share → Add to Home Screen*).
- `index.html` is also a complete single file: save it and open it from disk if you prefer.

## Privacy model
- 100% client-side. No backend, no analytics, no fonts/CDNs. The page sets a Content-Security-Policy with `connect-src 'none'` and `default-src 'none'`, so the app *cannot* make network requests even by mistake.
- The only network traffic is the browser downloading the app's own code (HTML, icon, manifest, service worker) from GitHub Pages. No customer data is ever in those requests.
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

## Future: direct Salesforce connection (not built on purpose)
A live hookup is possible but should not be done with personal passwords or secrets pasted into a tool. The realistic path:
1. **Get approval first.** Connecting any tool to Wex's Salesforce almost certainly requires sign-off from Wex IT / Information Security and the Salesforce platform team (data classification, vendor/tool review, where tokens live).
2. **Wex's Salesforce admins create a Connected App / External Client App** for this tool with OAuth 2.0 (Authorization Code + PKCE, no client secret in the browser), minimal scopes (`api`, `refresh_token` only if allowed), IP/session policies, and the GitHub Pages URL (or an internal host) as the callback. Each rep signs in with their own Salesforce SSO, so Salesforce sharing rules still apply.
3. **CORS allow-list** the app origin in Salesforce Setup, and loosen this app's CSP `connect-src` to only the Wex instance URL (e.g. `https://<wex-domain>.my.salesforce.com`).
4. **Add an adapter.** The code already routes every import through a data-source registry (`DataSources.register({...})` in `src/core.js`) that produces plain records for `applyImport()`. A `salesforce-api` adapter would implement `connect()`, `fetchAccounts()` (SOQL on Account incl. `ParentId`, Case, Opportunity, Contact/AccountContactRelation) and optionally `pushAccount()`.
5. Many companies instead prefer this to live inside Salesforce (a Lightning Web Component or a report + custom fields for billing mode/credit line), which avoids a separate app entirely — worth asking the admins.

## Development
- Source in `src/` (`app.css`, `core.js`, `model.js`, `app.js`, `app2.js`, `shell.html`, `sw.js`). `python3 tools/build.py` inlines everything into `index.html` and stamps the service-worker cache version.
- The XLSX and ZIP writers are hand-written (no third-party libraries).
