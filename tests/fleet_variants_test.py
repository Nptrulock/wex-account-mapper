"""Fleet Data form VARIANTS (multiple tables, offsets, NBSP/zero-width, hyperlink headers, inline + side-by-side labels,
MHTML, nested tables, blank col-A vehicle rows, numeric Driver IDs) in every .xls flavor, plus the masked diagnostics.
FICTIONAL fixtures only (tests/make_fleet_variants.py).  usage: python3 tests/fleet_variants_test.py [URL] [TAG]"""
import sys, os, json, base64
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = sys.argv[1] if len(sys.argv) > 1 else 'file://' + ROOT + '/index.html'
TAG = sys.argv[2] if len(sys.argv) > 2 else 'local'
D = ROOT + '/tests/fixtures/fleet-variants/'; FX = ROOT + '/tests/fixtures/'; SH = ROOT + '/shots/'
E = json.load(open(D + 'expected.json')); FN = 'Sample_Cedar_Row_Movers_FleetData.xls'
PASS = 'Sample-Passcode-123'; res = []; errs = []; reqs = []
def rec(n, ok, info=''):
    res.append((n, bool(ok))); print(('PASS ' if ok else 'FAIL ') + n + (' — ' + str(info) if info not in ('', None) else ''), flush=True)
def shot(pg, n, full=False): pg.screenshot(path=SH + TAG + '-fv-' + n + '.png', full_page=full)
PARSE = """async ([b, n]) => { const by = Uint8Array.from(atob(b), c => c.charCodeAt(0)); const res = await readSpreadsheetFile(new File([by], n)); const F = parseFleetForm(ffGrid(res)); const t = F.tables;
  return {fmt: res.format, ok: isFleetForm(F), opp: F.fields.top.opp, bill: F.fields.bill, ship: F.fields.ship, card: F.fields.card, prompts: F.prompts,
    vehicles: t.vehicles ? t.vehicles.rows.length : 0, drivers: t.drivers ? t.drivers.rows.length : 0, contacts: t.contacts ? t.contacts.rows.length : -1, d0: t.drivers && t.drivers.rows[0][3], vb: !!(t.vehicles && t.vehicles.rows.some(r => !r[0] && r[4]))}; }"""
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append('CONSOLE ' + m.text))
    ctx.on('request', lambda r: reqs.append((r.method, r.url)))
    pg.goto(URL); pg.wait_for_function('() => window.__ready === true')
    pg.wait_for_selector('#lockForm[data-mode=setup]'); pg.fill('#lp1', PASS); pg.fill('#lp2', PASS); pg.click('#lockForm button[type=submit]'); pg.wait_for_selector('body:not(.locked) #main', timeout=20000)
    # 1) every variant × flavor parses to the same expected result
    for v in sorted(E):
        for fl in sorted(os.listdir(D + v)):
            r = pg.evaluate(PARSE, [b64(D + v + '/' + fl + '/' + FN), FN]); e = E[v]; bad = []
            if not r['ok']: bad.append('not detected')
            if r['opp'] != e['opp']: bad.append(('opp', r['opp']))
            bad += [('bill', k, r['bill'].get(k)) for k in e['bill'] if r['bill'].get(k) != e['bill'][k]]
            bad += [('ship', k, r['ship'].get(k)) for k in e['ship'] if (r['ship'].get(k) or '') != e['ship'][k]]
            if r['card'] != e['card']: bad.append(('card', r['card']))
            if r['prompts'] != e['prompts']: bad.append(('prompts', r['prompts']))
            if (r['vehicles'], r['drivers'], r['contacts'], r['d0'], r['vb']) != (e['vehicles'], e['drivers'], e['contacts'], e['driverId0'], e['vehBlankA']): bad.append(('tables', r['vehicles'], r['drivers'], r['contacts'], r['d0'], r['vb']))
            rec(f'{v} / {fl}: billing, shipping, cards, company, embossing, prompts, 7 vehicles (blank col A kept), 20 drivers', not bad, bad or r['fmt'])
    # 2) ordinary reports are NOT mistaken for Fleet Data forms
    for f in ['sf_classic_accounts.xls', 'sf_contacts_xml2003.xls', 'sf_opportunities_formatted.xlsx', 'sf_cases_excel97.xls', 'sf_billing_credit.csv']:
        r = pg.evaluate(PARSE, [b64(FX + f), f]); rec(f'report {f} not detected as Fleet Data', not r['ok'])
    # 3) end to end: one-table-per-block file in each flavor → one account, all sections, visible tables
    pg.click('#main .empty [data-act=upload]'); pg.wait_for_selector('#dropZone')
    pg.set_input_files('#upFiles', [D + 'multitable/html/' + FN]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 1'); pg.wait_for_timeout(300)
    rec('multi-table HTML file = ONE Fleet Data source (not 6 reports)', pg.locator('.ffsrc').count() == 1 and pg.locator('.upsrc').count() == 1)
    pg.click('#diagPanel > summary'); pg.wait_for_timeout(200); shot(pg, '01-preview-diagnostics')
    pg.click('[data-act=upcopydiag][data-v="0"]'); pg.wait_for_timeout(300); dg = pg.evaluate('() => window.__lastCopy') or ''
    rec('diagnostics: decision + labels + table headers kept', 'Decision: Wex Fleet Data form' in dg and '"Number Of Cards:"' in dg and '"Company Vehicle ID"' in dg and '"Driver ID"' in dg and 'drivers @row' in dg, dg[:200])
    leaks = [x for x in ['kim.lowe', 'Sample Kim', 'Lowe', '7 Sample Ct', '1-SMPL0601', 'Cedar', '48933', 'SAMPLE TRUCK', '4101', 'Custom Control Sample', 'Odometer', '1SMPL000', 'Lansing', 'Sample D0', '"Driver"', 'C="Company Vehicle ID"'] if x in dg]
    rec('diagnostics: every value masked (no values, no company in file name)', not leaks and '[text ' in dg and '[number' in dg and '[empty]' in dg, leaks)
    open(ROOT + '/test-out/' + TAG + '-diag-sample.txt', 'w').write(dg)
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(400)
    for fl in ('xml2003', 'biff8'):   # same form again in the other flavors → updates the same account
        pg.click('[data-act=upload]'); pg.set_input_files('#upFiles', [D + 'multitable/' + fl + '/' + FN]); pg.wait_for_function('() => UI.up && UI.up.sources.some(s => s.kind === "fleet")'); pg.wait_for_timeout(300)
        rec(f'{fl} multi-sheet form → 1 source, auto-attached to the existing account', pg.locator('.ffsrc').count() == 1 and 'Auto: Sample: Cedar Row Movers' in pg.inner_text('.ffsrc'))
        pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(300)
    a = pg.evaluate("() => { const a = WS.accounts.find(x => x.name === 'Sample: Cedar Row Movers'); return a && {n: WS.accounts.length, opp: a.oppNo, bill: a.billAddr, card: a.card, ship: a.ship, v: a.fleet.vehicles.rows.length, d: a.fleet.drivers.rows.length, bc: a.billContact, files: WS.files.length, cons: WS.contacts.map(c => [c.name, c.role, c.level])}; }")
    rec('account filled: opp, billing, card setup', a and a['n'] == 1 and a['opp'] == '1-SMPL0601' and a['bill']['email'] == 'kim.lowe@example.com' and a['card']['numCards'] == '15' and a['card']['emboss'] == 'Company Vehicle ID', a)
    rec('billing contact created (role Billing)', a and a['bc'] == 'Sample Kim Lowe' and ['Sample Kim Lowe', 'Billing', 'parent'] in a['cons'], a and a['cons'])
    rec('vehicles 7 + drivers 20 stored; re-uploads did not duplicate', a and a['v'] == 7 and a['d'] == 20 and a['files'] == 1 and len(a['cons']) == 1)
    pg.click('[data-act=tab][data-tab=chart]'); pg.wait_for_timeout(200); pg.click('#tree .node[data-name="Sample: Cedar Row Movers"]'); pg.wait_for_timeout(400)
    rec('Vehicles table visible on the panel with count', pg.locator('#ff_vehicles').is_visible() and pg.locator('#ff_vehicles tbody tr').count() == 7 and '7' in pg.inner_text('#ff_vehicles .cnt'))
    rec('Drivers table visible on the panel with count', pg.locator('#ff_drivers').is_visible() and pg.locator('#ff_drivers tbody tr').count() == 20 and '20' in pg.inner_text('#ff_drivers .cnt'))
    rec('empty Card shipping section is collapsed', pg.locator('details#ffsec_ship.ffempty').count() == 1 and not pg.eval_on_selector('#ffsec_ship', 'e => e.open'))
    rec('filled Billing / Card setup sections are open', pg.locator('div#ffsec_bill').count() == 1 and pg.locator('div#ffsec_card').count() == 1)
    rec('no SF Account ID / Opportunity name / Rep phone fields', pg.locator('#f_sfId, #f_oppName, #f_repPhone').count() == 0 and pg.locator('#f_oppNo').count() == 1)
    shot(pg, '02-account-panel')
    pg.locator('#ff_drivers').scroll_into_view_if_needed(); shot(pg, '03-panel-tables')
    pg.locator('#ffsec_ship').scroll_into_view_if_needed(); shot(pg, '04-collapsed-shipping')
    pg.click('#ffsec_ship > summary'); pg.wait_for_timeout(200); pg.fill('#ff_ship_city', 'Sampleburg'); pg.wait_for_timeout(300)
    rec('collapsed section can be opened and filled', pg.evaluate("() => WS.accounts[0].ship.city") == 'Sampleburg')
    ext = [r for r in reqs if not (r[1].startswith(('file://', 'data:', 'blob:')) or (URL.startswith('http') and r[1].startswith(URL.rsplit('/', 1)[0])))]
    rec('zero outside network requests (hyperlinked headers never fetched)', not ext, ext[:5])
    rec('no console/page errors', not errs, errs[:5])
    br.close()
bad = [n for n, ok in res if not ok]; print(f'\n{len(res) - len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
