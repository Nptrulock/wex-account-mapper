"""v1.5.0: real-shape Fleet Data .xls (form + vehicles/drivers tables with the Salesforce list headers, across 2 sheets),
separate Fleet_Vehicles / Fleet_Drivers list imports (paste importer + upload box), merge without duplicates,
junk-account guard + cleanup, diagnostics explaining a missing table. FICTIONAL fixtures only
(tests/make_fleet_realshape.py).  usage: python3 tests/fleet_import_test.py [URL] [TAG]"""
import sys, os, base64, zipfile, io, csv
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = sys.argv[1] if len(sys.argv) > 1 else 'file://' + ROOT + '/index.html'
TAG = sys.argv[2] if len(sys.argv) > 2 else 'local'
D = ROOT + '/tests/fixtures/fleet-realshape/'; L = ROOT + '/tests/fixtures/fleet-lists/'; SH = ROOT + '/shots/'; OUT = ROOT + '/test-out/'
os.makedirs(SH, exist_ok=True); os.makedirs(OUT, exist_ok=True)
FN = 'Sample_Harbor_Lane_Supply_FleetData.xls'; ODD = 'Sample_Odd_Headers_FleetData.xls'; ACCT = 'Sample Harbor Lane Supply'
DCSV = L + 'Fleet_Drivers_5_Sample_Business_Card (1).csv'; VCSV = L + 'Fleet_Vehicles_6_Sample_Fleet_Card.csv'
PASS = 'Sample-Passcode-123'; res = []; errs = []; reqs = []
def rec(n, ok, info=''):
    res.append((n, bool(ok))); print(('PASS ' if ok else 'FAIL ') + n + (' — ' + str(info) if info not in ('', None) else ''), flush=True)
def shot(pg, n, full=False): pg.screenshot(path=SH + TAG + '-fi-' + n + '.png', full_page=full)
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
PARSE = """async ([b, n]) => { const by = Uint8Array.from(atob(b), c => c.charCodeAt(0)); const res = await readSpreadsheetFile(new File([by], n)); const g = ffGrid(res); const F = parseFleetForm(g); const t = F.tables;
  return {fmt: res.format, sheets: res.sheets.length, ok: isFleetForm(F), opp: F.fields.top.opp, card: F.fields.card, bill: F.fields.bill, v: t.vehicles ? t.vehicles.rows.length : -1, d: t.drivers ? t.drivers.rows.length : -1,
    vk: t.vehicles ? t.vehicles.headers.map(h => ffColKey('vehicles', h)) : [], dk: t.drivers ? t.drivers.headers.map(h => ffColKey('drivers', h)) : [], blankA: !!(t.vehicles && t.vehicles.rows.some(r => !r[0] && r[1])),
    diag: ffDiagnose(new File([by], n), res, g, F, 'test')}; }"""
def sel_values(pg): return pg.eval_on_selector_all('#pasteBox select[data-act-change=impmap]', 'els => els.map(e => e.value)')
def acct(pg): return pg.evaluate(f"""() => {{ const a = WS.accounts.find(x => x.name === '{ACCT}'); return a && {{id: a.id, v: a.fleet && a.fleet.vehicles ? a.fleet.vehicles.rows.length : 0, d: a.fleet && a.fleet.drivers ? a.fleet.drivers.rows.length : 0,
  vh: a.fleet && a.fleet.vehicles && a.fleet.vehicles.headers, vr: a.fleet && a.fleet.vehicles && a.fleet.vehicles.rows, dr: a.fleet && a.fleet.drivers && a.fleet.drivers.rows, card: a.card, opp: a.oppNo, bill: a.billAddr, src: a.fleet && a.fleet.source}}; }}""")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append('CONSOLE ' + m.text))
    ctx.on('request', lambda r: reqs.append((r.method, r.url)))
    pg.goto(URL); pg.wait_for_function('() => window.__ready === true')
    pg.wait_for_selector('#lockForm[data-mode=setup]'); pg.fill('#lp1', PASS); pg.fill('#lp2', PASS); pg.click('#lockForm button[type=submit]'); pg.wait_for_selector('body:not(.locked) #main', timeout=20000)
    # 1) parser: real-shape form in all 3 flavors (form on sheet 1, vehicles + drivers on sheet 2)
    for fl in ('html', 'xml2003', 'biff8'):
        r = pg.evaluate(PARSE, [b64(D + fl + '/' + FN), FN])
        rec(f'{fl}: form detected; Salesforce-style headers found → 6 vehicles, 5 drivers', r['ok'] and r['v'] == 6 and r['d'] == 5 and r['opp'] == '1-SMPL0701', (r['fmt'], r['sheets'], r['v'], r['d']))
        rec(f'{fl}: header aliases (Vehicle ID, License Plate, VIN Number, Card Control, Prompt Options, Driver Department)', r['vk'] == ['cardControl', 'vehicleId', 'department', 'description', 'plate', 'vin', 'prompt'] and r['dk'] == ['first', 'last', 'department', 'driverId'], (r['vk'], r['dk']))
        rec(f'{fl}: empty Company Name does not swallow the next label; embossing read', r['card'] == {'numCards': '6', 'company': '', 'emboss': 'Driver Name'} and r['bill']['email'] == 'noor.patel@example.com', r['card'])
        rec(f'{fl}: vehicle row with blank Card Control kept', r['blankA'])
        rec(f'{fl}: diagnostics report both tables FOUND with column mapping', 'Vehicles: FOUND' in r['diag'] and 'Drivers: FOUND' in r['diag'] and '"Vehicle ID" → Company Vehicle ID' in r['diag'] and '"Driver Department" → Department' in r['diag'], [l for l in r['diag'].split('\n') if 'FOUND' in l])
    r = pg.evaluate(PARSE, [b64(D + 'html/' + ODD), ODD]); dg = r['diag']
    rec('unrecognisable headers: diagnostics say WHY each table was not found', 'Vehicles: NOT FOUND — closest rows: R' in dg and '1 of 5 columns are known vehicle columns (Card Control)' in dg and 'Drivers: NOT FOUND — no row has any known drivers column' in dg, [l for l in dg.split('\n') if 'NOT FOUND' in l])
    leaks = [x for x in ['Sample Noor', 'Patel', 'noor.patel', '1-SMPL0701', 'Muskegon', '49440', 'U-1', 'Sample note', 'Sample Q', 'Harbor'] if x in dg]
    rec('diagnostics still mask every value', not leaks, leaks)
    open(OUT + TAG + '-fi-diag-odd.txt', 'w').write(dg)
    # 2) upload the .xls (the same file added twice + a "(1)" copy) → ONE source, one account, no junk
    pg.click('#main .empty [data-act=upload]'); pg.wait_for_selector('#dropZone')
    pg.set_input_files('#upFiles', [D + 'html/' + FN]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 1')
    pg.set_input_files('#upFiles', [D + 'html/' + FN]); pg.wait_for_timeout(400)
    cp = OUT + 'Sample_Harbor_Lane_Supply_FleetData (1).xls'; open(cp, 'wb').write(open(D + 'xml2003/' + FN, 'rb').read())
    pg.set_input_files('#upFiles', [cp]); pg.wait_for_timeout(500)
    rec('same form added 3× (incl. "(1)" copy) → ONE Fleet Data source', pg.locator('.ffsrc').count() == 1 and pg.evaluate('() => UI.up.sources.length') == 1)
    rec('preview chips show 6 vehicles / 5 drivers', '6 vehicles' in pg.inner_text('.ffsrc') and '5 drivers' in pg.inner_text('.ffsrc'))
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(400); rt = pg.inner_text('#upResult')
    rec('result lists the company ONCE with real counts', rt.count(ACCT) == 1 and f'{ACCT} (6 vehicles, 5 drivers)' in rt, rt)
    names = pg.evaluate('() => WS.accounts.map(a => a.name)')
    rec('no junk accounts (form labels / names ending in ":")', names == [ACCT], names)
    for fl in ('biff8',):
        pg.set_input_files('#upFiles', [D + fl + '/' + FN]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 1'); pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(300)
    a = acct(pg); rec('re-upload in another flavor merges: still 6 vehicles / 5 drivers, 1 account', a['v'] == 6 and a['d'] == 5 and pg.evaluate('() => WS.accounts.length') == 1, (a['v'], a['d']))
    rec('vehicle columns stored under their Wex names', a['vh'] == ['Card Control', 'Company Vehicle ID', 'Department', 'Vehicle Description', 'License Plate', 'VIN', 'Prompt Options'], a['vh'])
    # 3) paste importer: Fleet_Drivers CSV → type Drivers preselected, columns auto-mapped, account preselected
    pg.click('#pasteBox > summary'); pg.wait_for_timeout(200)
    pg.set_input_files('#impFile', DCSV); pg.wait_for_selector('#pasteBox .maptbl'); pg.wait_for_timeout(200)
    rec('paste importer offers Accounts / Contacts / Vehicles / Drivers', pg.inner_text('#impTypes').replace('🚚 ', '').replace('🪪 ', '').split('\n') == ['Accounts', 'Contacts', 'Vehicles', 'Drivers'] or all(x in pg.inner_text('#impTypes') for x in ('Accounts', 'Contacts', 'Vehicles', 'Drivers')))
    rec('Fleet_Drivers_* file → Drivers preselected', 'Drivers' in pg.inner_text('#impTypes button.on'))
    rec('drivers columns auto-mapped (Driver Department → Department, Driver ID)', sel_values(pg) == ['first', 'last', 'department', 'driverId'], sel_values(pg))
    rec('Goes-into lists driver fields', pg.eval_on_selector_all('#pasteBox select[data-act-change=impmap]:first-of-type option', 'o => o.map(x => x.textContent)')[:6] == ['— skip —', 'First Name', 'Last Name', 'Driver Name', 'Department', 'Driver ID'])
    rec('account preselected = most recently imported', pg.eval_on_selector('#impUnder', 'e => e.options[e.selectedIndex].text').strip() == ACCT)
    pg.locator('#pasteBox .maptbl').scroll_into_view_if_needed(); shot(pg, '01-drivers-mapping')
    pg.click('[data-act=impplan]'); pg.wait_for_selector('#impSummary'); s1 = pg.inner_text('#impSummary')
    rec('review: 2 new, 0 update, 3 already there', s1.startswith('2 new · 0 update existing · 3 already there'), s1)
    pg.click('#impGo'); pg.wait_for_selector('#impResult'); a = acct(pg)
    rec('drivers merged: 5 + 2 = 7', a['d'] == 7, a['d'])
    pg.set_input_files('#impFile', DCSV); pg.wait_for_selector('#pasteBox .maptbl'); pg.click('[data-act=impplan]'); pg.wait_for_selector('#impSummary')
    rec('re-import same drivers file: 0 new, 5 already there', pg.inner_text('#impSummary').startswith('0 new · 0 update existing · 5 already there'), pg.inner_text('#impSummary'))
    pg.click('#impGo'); pg.wait_for_selector('#impResult'); rec('still 7 drivers (no duplicates)', acct(pg)['d'] == 7)
    # vehicles CSV
    pg.set_input_files('#impFile', VCSV); pg.wait_for_selector('#pasteBox .maptbl'); pg.wait_for_timeout(200)
    rec('Fleet_Vehicles_* file → Vehicles preselected', 'Vehicles' in pg.inner_text('#impTypes button.on'))
    rec('vehicle columns auto-mapped (Vehicle ID → Company Vehicle ID, VIN Number, License Plate, Card Control, Prompt Options)', sel_values(pg) == ['cardControl', 'vehicleId', 'department', 'description', 'plate', 'vin', 'prompt'], sel_values(pg))
    rec('Goes-into shows "Company Vehicle ID" for Vehicle ID', pg.eval_on_selector_all('#pasteBox select[data-act-change=impmap]', 'els => els[1].options[els[1].selectedIndex].text') == 'Company Vehicle ID')
    pg.locator('#pasteBox .maptbl').scroll_into_view_if_needed(); shot(pg, '02-vehicles-mapping')
    pg.click('[data-act=impplan]'); pg.wait_for_selector('#impSummary'); s2 = pg.inner_text('#impSummary')
    rec('review: 2 new, 1 update (blank Department filled), 3 already there', s2.startswith('2 new · 1 update existing · 3 already there'), s2)
    pg.click('#impGo'); pg.wait_for_selector('#impResult'); a = acct(pg)
    rec('vehicles merged: 6 + 2 = 8, Department filled on the existing vehicle', a['v'] == 8 and any(r[1] == '9103' and r[2] == 'Sample Ops' for r in a['vr']), a['v'])
    # header variants pasted as text (tab-separated, like copying from a Salesforce list view)
    txt = 'Card Control Option\tVehicle ID\tDepartment\tVehicle Description\tLicense Plate #\tVIN\tPrompt Option\tAcceptance Option\n' \
          'Fuel Only\t9108\t\tSample GMC Sierra\tSMPL108\t1SMPLVIN000000108\tOdometer\tSample Acceptance A\n' \
          'Fuel Only\t9109\t\tSample Kia Van\tSMPL109\t1SMPLVIN000000109\tOdometer\tSample Acceptance A\n'
    pg.fill('#impText', txt); pg.click('[data-act=impread]'); pg.wait_for_selector('#pasteBox .maptbl')
    rec('pasted header variants → Vehicles detected; Card Control Option / License Plate # / VIN / Prompt Option / Acceptance Option mapped', 'Vehicles' in pg.inner_text('#impTypes button.on') and sel_values(pg) == ['cardControl', 'vehicleId', 'department', 'description', 'plate', 'vin', 'prompt', 'acceptance'], sel_values(pg))
    pg.click('[data-act=impplan]'); pg.wait_for_selector('#impSummary'); pg.click('#impGo'); pg.wait_for_selector('#impResult'); a = acct(pg)
    rec('variant paste: 1 new + 1 updated → 9 vehicles; Acceptance Option column added', a['v'] == 9 and a['vh'][-1] == 'Acceptance Option', (a['v'], a['vh']))
    # 4) upload box also takes the list CSVs (auto-attached to the last account), still no duplicates
    pg.set_input_files('#upFiles', [DCSV, VCSV]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 2'); pg.wait_for_timeout(300)
    rec('upload box: list CSVs shown as Drivers / Vehicles lists with Auto → account', pg.locator('.fflist').count() == 2 and ACCT in pg.inner_text('.fflist[data-which=drivers]'), pg.inner_text('#dropZone ~ .fflist') if pg.locator('.fflist').count() else '')
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); a = acct(pg)
    rec('upload box re-import: nothing duplicated (9 vehicles, 7 drivers)', a['v'] == 9 and a['d'] == 7 and '5 already there' in pg.inner_text('#upResult'), (a['v'], a['d'], pg.inner_text('#upResult')[-200:]))
    rec('list CSVs kept as attachments; the form copy replaced (not stacked)', sorted(pg.evaluate('() => WS.files.map(f => f.name)')) == sorted([FN, 'Fleet_Drivers_5_Sample_Business_Card (1).csv', 'Fleet_Vehicles_6_Sample_Fleet_Card.csv']), pg.evaluate('() => WS.files.map(f => f.name)'))
    # 5) account panel
    pg.click('[data-act=tab][data-tab=chart]'); pg.wait_for_timeout(200); pg.click(f'#tree .node[data-name="{ACCT}"]'); pg.wait_for_selector('#ff_vehicles')
    rec('panel: Vehicles 9 and Drivers 7 visible', pg.inner_text('#ff_vehicles .cnt').strip() == '9' and pg.inner_text('#ff_drivers .cnt').strip() == '7' and pg.locator('#ff_vehicles tbody tr').count() == 9 and pg.locator('#ff_drivers tbody tr').count() == 7)
    rec('panel: empty card shipping collapsed', pg.locator('details#ffsec_ship.ffempty').count() == 1)
    pg.locator('#ffFleet').scroll_into_view_if_needed(); shot(pg, '03-account-panel-vehicles-drivers')
    pg.locator('#ff_drivers').scroll_into_view_if_needed(); shot(pg, '04-account-panel-drivers')
    pg.click('[data-act=close]'); pg.wait_for_timeout(200)
    # 6) per-account CSV + master zip include the merged rows
    with pg.expect_download() as d: pg.click('.bizhead [data-act=buildzip]')
    zp = OUT + TAG + '-fi-master.zip'; d.value.save_as(zp); z = zipfile.ZipFile(zp); zn = z.namelist()
    vc = [n for n in zn if n.endswith(ACCT + ' - Vehicles.csv')]; dc = [n for n in zn if n.endswith(ACCT + ' - Drivers.csv')]
    rows = lambda n: list(csv.reader(io.StringIO(z.read(n).decode('utf-8-sig'))))
    rec('master zip: per-account Vehicles (9) and Drivers (7) CSVs', vc and dc and len(rows(vc[0])) == 10 and len(rows(dc[0])) == 8, (vc, dc))
    av = [n for n in zn if n.endswith('All Vehicles.csv')]; ad = [n for n in zn if n.endswith('All Drivers.csv')]
    rec('master zip: All Vehicles (9) / All Drivers (7)', av and ad and len(rows(av[0])) == 10 and len(rows(ad[0])) == 8 and rows(av[0])[0][:3] == ['Account', 'Parent Account', 'Source File'])
    # 7) junk-account guard (generic report path) + cleanup of junk already saved
    pg.evaluate("""() => { const p = WS.accounts[0]; newAccount({name: 'Second Line Embossing Option:'}); const j = newAccount({name: 'Billing City', parentId: p.id, billMode: 'parent'}); newAccount({name: 'Sample Kid', parentId: j.id, billMode: 'parent'}); newContact({name: 'Sample Keep', accountIds: [j.id]}); touch(); }""")
    pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_function('() => window.__ready === true'); pg.wait_for_selector('#lockForm[data-mode=unlock]'); pg.fill('#lp1', PASS); pg.click('#unlockBtn'); pg.wait_for_selector('body:not(.locked) #main', timeout=20000); pg.wait_for_timeout(600)
    W = pg.evaluate("() => ({names: WS.accounts.map(a => a.name).sort(), kid: (WS.accounts.find(a => a.name === 'Sample Kid') || {}).parentId === WS.accounts.find(a => a.name === '" + ACCT + "').id, keep: (WS.contacts.find(c => c.name === 'Sample Keep') || {accountIds: [1]}).accountIds.length})")
    rec('saved junk accounts removed on open; their child moved up to the real parent', W['names'] == sorted([ACCT, 'Sample Kid']) and W['kid'], W)
    pg.wait_for_timeout(300)
    W2 = pg.evaluate("async () => { const r = await Store.rawGet('kv', 'ws'); return {enc: r.enc}; }")
    rec('cleanup saved (still encrypted)', W2['enc'] == 1)
    src = 'Account Name,Phone\nSecond Line Embossing Option:,\nSample Real Co,555-0100\n'
    st = pg.evaluate("(t) => { const res = {format: 'CSV', sheets: [{name: 'x', rows: parseCSV(t)}]}; const tb = locateTable(res.sheets[0].rows); const s = {id: 'z', file: 'x.csv', table: tb, type: 'accounts', map: upGuess('accounts', tb.headers)}; const r = previewIngest([s]); return {n: r.accNew, w: r.warnings}; }", src)
    rec('report upload: a form-label "account" is skipped with a warning', st['n'] == 1 and any('form label' in w for w in st['w']), st)
    ext = [r for r in reqs if not (r[1].startswith(('file://', 'data:', 'blob:')) or (URL.startswith('http') and r[1].startswith(URL.rsplit('/', 1)[0])))]
    rec('zero outside network requests', not ext, ext[:5])
    rec('no console/page errors', not errs, errs[:5])
    br.close()
bad = [n for n, ok in res if not ok]; print(f'\n{len(res) - len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
