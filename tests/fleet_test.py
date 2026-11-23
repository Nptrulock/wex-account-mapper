"""Wex 'Fleet Data' form (<Company>_FleetData.xls) upload tests — FICTIONAL fixtures only (tests/fixtures/fleet, built by make_fleet_fixtures.py).
usage: python3 tests/fleet_test.py [URL] [TAG]"""
import sys, os, json, base64, csv, io, zipfile, openpyxl
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = sys.argv[1] if len(sys.argv) > 1 else 'file://' + ROOT + '/index.html'
TAG = sys.argv[2] if len(sys.argv) > 2 else 'local'
FX = ROOT + '/tests/fixtures/'; FL = FX + 'fleet/'; SH = ROOT + '/shots/'; OUT = ROOT + '/test-out/'
os.makedirs(SH, exist_ok=True); os.makedirs(OUT, exist_ok=True)
NW, FY, BL = 'Sample_Northwind_Freight_FleetData.xls', 'Sample_Northwind_Freight_Flint_Yard_FleetData.xls', 'Sample_Birch_Lane_Plumbing_FleetData.xls'
PASS = 'Sample-Passcode-123'; res = []; errs = []; reqs = []
def rec(n, ok, info=''):
    res.append((n, bool(ok))); print(('PASS ' if ok else 'FAIL ') + n + (' — ' + str(info) if info not in ('', None) else ''), flush=True)
def shot(pg, n, full=False): pg.screenshot(path=SH + TAG + '-fleet-' + n + '.png', full_page=full)
def dl(pg, sel, name):
    with pg.expect_download() as d: pg.click(sel)
    p = OUT + TAG + '-' + name; d.value.save_as(p); return d.value.suggested_filename, p
def readcsv(p): return list(csv.reader(io.StringIO(open(p, encoding='utf-8-sig').read())))
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append('CONSOLE ' + m.text))
    pg.on('dialog', lambda d: d.accept()); ctx.on('request', lambda r: reqs.append((r.method, r.url)))
    pg.goto(URL); pg.wait_for_function('() => window.__ready === true')
    pg.wait_for_selector('#lockForm[data-mode=setup]'); pg.fill('#lp1', PASS); pg.fill('#lp2', PASS); pg.click('#lockForm button[type=submit]'); pg.wait_for_selector('body:not(.locked) #main', timeout=20000)
    # 1) parser: the same form in all three .xls flavors parses identically
    parsed = {}
    for fl in ('html', 'xml2003', 'biff8'):
        for n in (NW, FY, BL):
            b64 = base64.b64encode(open(FL + fl + '/' + n, 'rb').read()).decode()
            parsed[(fl, n)] = pg.evaluate("""async ([b, n]) => { const by = Uint8Array.from(atob(b), c => c.charCodeAt(0)); const {format, sheets} = await readSpreadsheetFile(new File([by], n)); const F = parseFleetForm(sheets[0].rows); return {format, ok: isFleetForm(F), F}; }""", [b64, n])
    for fl, fmt in (('html', 'HTML'), ('xml2003', '2003 XML'), ('biff8', '97-2003')):
        rec(f'{fl}: format detected and recognised as Fleet Data form (3 files)', all(fmt in parsed[(fl, n)]['format'] and parsed[(fl, n)]['ok'] for n in (NW, FY, BL)), [parsed[(fl, n)]['format'] for n in (NW,)])
        rec(f'{fl}: parse identical to HTML flavor', all(json.dumps(parsed[(fl, n)]['F'], sort_keys=True) == json.dumps(parsed[('html', n)]['F'], sort_keys=True) for n in (NW, FY, BL)))
    F = parsed[('biff8', NW)]['F']; f = F['fields']
    rec('labels: opportunity + billing block', f['top']['opp'] == '1-SMPL0201' and f['bill']['first'] == 'Sample Ana' and f['bill']['zip'] == '04850' and f['bill']['email'] == 'ana.ruiz@example.com', f['bill'])
    rec('labels: card shipping block incl. Attention (no colon)', f['ship'] == {'attention': 'Sample Yard Office', 'addr1': '100 Sample Way', 'addr2': 'Dock 3', 'city': 'Flint', 'state': 'MI', 'zip': '04850'}, f['ship'])
    rec('labels: number of cards / company / embossing', f['card'] == {'numCards': '25', 'company': 'Sample: Northwind Freight', 'emboss': 'Company Vehicle ID'}, f['card'])
    rec('prompt flags (Yes/No) read from the label block, not table headers', F['prompts'] == [['Department', 'Yes'], ['Vehicle Description', 'No'], ['License Plate #', 'Yes'], ['Company Vehicle ID', 'Yes']], F['prompts'])
    T = F['tables']
    rec('contacts table: 2 rows', T['contacts']['headers'] == ['Name', 'Phone', 'Email'] and len(T['contacts']['rows']) == 2)
    rec('vehicle table: 8 columns, 12 rows (blank cells kept, RENTAL VEH + driver-name rows kept)', len(T['vehicles']['headers']) == 8 and len(T['vehicles']['rows']) == 12 and any(r[0] == 'RENTAL VEH 1' for r in T['vehicles']['rows']) and any(r[0] == 'Sample Gus Grant' for r in T['vehicles']['rows']) and any(r[1] == '' for r in T['vehicles']['rows']))
    rec('driver table: 40 rows, Driver IDs keep leading zeros', T['drivers']['headers'] == ['First Name', 'Last Name', 'Department', 'Driver ID'] and len(T['drivers']['rows']) == 40 and T['drivers']['rows'][0][3] == '000101')
    rec('empty contacts table handled (Flint Yard)', len(parsed[('xml2003', FY)]['F']['tables']['contacts']['rows']) == 0)
    shifted = pg.evaluate("""() => { const F = parseFleetForm([[], ['', 'Fleet Data'], ['', 'OPPORTUNITY :', '', '1-SMPL9'], ['', 'billing first name', '', 'Sample X'], ['', '  Number of Cards: ', '', 7], ['', 'Company Name:', '', 'Sample Co'], ['', 'Card Shipping City:', '', 'Sampleton'], ['', 'Department :', '', 'yes'],
      [], ['', 'Company Vehicle ID (Unit #)', 'Vehicle Description', 'VIN Number'], ['', 'A1', 'Sample Van', ''], [], [], ['', 'First Name', 'Last Name', 'Driver ID'], ['', 'Sample Q', 'Doe', '0042']]);
      return {ok: isFleetForm(F), opp: F.fields.top.opp, n: F.fields.card.numCards, city: F.fields.ship.city, pr: F.prompts, v: F.tables.vehicles && F.tables.vehicles.rows.length, vh: F.tables.vehicles && F.tables.vehicles.headers[0], d: F.tables.drivers && F.tables.drivers.rows}; }""")
    rec('positions may shift: labels found by text (case/colon/space-insensitive), header matched by prefix', shifted['ok'] and shifted['opp'] == '1-SMPL9' and shifted['n'] == '7' and shifted['city'] == 'Sampleton' and shifted['pr'] == [['Department', 'yes']] and shifted['v'] == 1 and shifted['d'] == [['Sample Q', 'Doe', '0042']], shifted)
    # 2) accounts first (so the Flint Yard child exists), then the three Fleet Data forms (one per flavor)
    pg.click('#main .empty [data-act=upload]'); pg.wait_for_selector('#dropZone')
    pg.set_input_files('#upFiles', [FX + 'sf_classic_accounts.xls']); pg.wait_for_function('() => UI.up && UI.up.sources.length === 1'); pg.click('#upGo'); pg.wait_for_selector('#upResult')
    pg.set_input_files('#upFiles', [FL + 'html/' + NW, FL + 'xml2003/' + FY, FL + 'biff8/' + BL]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 3', timeout=20000); pg.wait_for_timeout(300)
    rec('3 Fleet Data cards in preview', pg.locator('.ffsrc').count() == 3)
    st = pg.evaluate("() => Object.fromEntries(UI.up.lastPreview.fleet.map(x => [UI.up.sources.find(s => s.id === x.id).file, x.account]))")
    rec('default target by name: parent file → parent, location file → that child', st.get(NW) == 'Sample: Northwind Freight' and st.get(FY) == 'Sample: Northwind Freight – Flint Yard' and st.get(BL) == 'Sample: Birch Lane Plumbing', st)
    nwId = pg.evaluate("() => WS.accounts.find(a => a.sfId === '001SMPL00000201AAA').id")
    rec('parent default resolves to the Account ID 201 parent (not the same-named location)', pg.evaluate(f"() => UI.up.lastPreview.fleet.find(x => UI.up.sources.find(s => s.id === x.id).file === '{NW}').accountId") == nwId)
    shot(pg, '01-preview')
    # user override: Birch Lane form → its East child location
    eastId = pg.evaluate("() => WS.accounts.find(a => a.sfId === '001SMPL00000212AAA').id")
    bsid = pg.evaluate(f"() => UI.up.sources.find(s => s.file === '{BL}').id")
    pg.select_option(f'select[data-act-change=uptarget][data-v="{bsid}"]', eastId); pg.wait_for_timeout(300)
    rec('override shown in preview', 'Birch Lane Plumbing – East' in pg.inner_text(f'.ffsrc[data-src="{bsid}"]'))
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(500)
    rec('result mentions Fleet Data forms', 'Fleet Data forms' in pg.inner_text('#upResult'), pg.inner_text('#upResult')[:200])
    W = pg.evaluate("() => JSON.parse(JSON.stringify(WS))"); A = {a['sfId']: a for a in W['accounts']}
    nw, fy, ea, bl = A['001SMPL00000201AAA'], A['001SMPL00000202AAA'], A['001SMPL00000212AAA'], A['001SMPL00000211AAA']
    rec('no extra accounts created', len(W['accounts']) == 8, len(W['accounts']))
    rec('Opportunity # filled', nw['oppNo'] == '1-SMPL0201' and fy['oppNo'] == '1-SMPL0202' and ea['oppNo'] == '1-SMPL0211')
    rec('billing address section', nw['billAddr']['addr1'] == '100 Sample Way' and nw['billAddr']['zip'] == '04850' and nw['billAddr']['phone'] == '(555) 010-0401')
    rec('card shipping section', nw['ship']['attention'] == 'Sample Yard Office' and nw['ship']['addr2'] == 'Dock 3' and fy['ship']['zip'] == '48501')
    rec('card setup section (cards, company, embossing, prompts)', nw['card']['numCards'] == '25' and nw['card']['emboss'] == 'Company Vehicle ID' and nw['card']['prompts'][2] == ['License Plate #', 'Yes'] and fy['card']['emboss'] == 'Driver Name')
    rec('vehicles + drivers stored on the right accounts', len(nw['fleet']['vehicles']['rows']) == 12 and len(nw['fleet']['drivers']['rows']) == 40 and len(fy['fleet']['vehicles']['rows']) == 5 and len(fy['fleet']['drivers']['rows']) == 8 and len(ea['fleet']['drivers']['rows']) == 4 and not bl.get('fleet'))
    C = {c['name']: c for c in W['contacts']}
    rec('billing contact created with role Billing at parent level', 'Billing' in C['Sample Ana Ruiz']['role'] and C['Sample Ana Ruiz']['level'] == 'parent' and C['Sample Ana Ruiz']['accountIds'] == [nw['id']] and nw['billContact'] == 'Sample Ana Ruiz')
    rec('Name/Phone/Email table → contacts at that account', C['Sample Raj Mehta']['accountIds'] == [nw['id']] and C['Sample Raj Mehta']['email'] == 'raj.mehta@example.com')
    rec('child-location form → child-level contacts', C['Sample Tom Reyes']['level'] == 'child' and C['Sample Lia Chen']['level'] == 'child' and C['Sample Lia Chen']['accountIds'] == [ea['id']])
    rec('same person (by email) reused, not duplicated', sum(1 for c in W['contacts'] if c['email'] == 'ben.ode@example.com') == 1 and fy['id'] in C['Sample Ben Ode']['accountIds'] and fy['billContact'] == 'Sample Ben Ode')
    fl = [(x['name'], x['accountId']) for x in W['files']]
    rec('original FleetData .xls kept as attachment on each account', (NW, nw['id']) in fl and (FY, fy['id']) in fl and (BL, ea['id']) in fl, fl)
    raw = pg.evaluate("async () => { const r = await Store.rawGet('kv', 'ws'); const f = await Store.rawGet('files', WS.files[0].id); return {enc: r.enc, plain: JSON.stringify(r).includes('Sample Yard Office'), fenc: f.enc}; }")
    rec('still encrypted at rest (workspace + attachment)', raw['enc'] == 1 and not raw['plain'] and raw['fenc'] == 1, raw)
    # 3) account view
    pg.click('[data-act=tab][data-tab=chart]'); pg.wait_for_timeout(300)
    rec('chart node shows vehicles · drivers chip', '🚚 12 · 🪪 40' in pg.inner_text('#tree'))
    rec('business header shows fleet totals + one-click master list', 'fleet data' in pg.inner_text('.bizhead').lower() and pg.locator('.bizhead [data-act=buildzip]').count() == 1)
    pg.click(f'#tree .node[data-id="{nw["id"]}"]'); pg.wait_for_timeout(300)
    mt = pg.inner_text('.modal').lower()
    rec('account modal: billing, shipping, card setup, fleet data sections', all(k in mt for k in ('billing contact & address', 'card shipping', 'card setup', 'fleet data', 'prompt: department', '12 vehicles', '40 drivers')))
    shot(pg, '02-account-sections'); pg.locator('#ffFleet').scroll_into_view_if_needed(); shot(pg, '03-account-fleet')
    pg.click('.modal button.cp[data-sel="#ff_billAddr_zip"]'); pg.wait_for_timeout(250)
    rec('fields copyable (postal code keeps zero)', pg.evaluate('() => window.__lastCopy') == '04850')
    pg.click('.modal [data-act=copy][data-what="shipping address"]'); pg.wait_for_timeout(250)
    rec('copy shipping address block', pg.evaluate('() => window.__lastCopy') == 'Attn: Sample Yard Office\n100 Sample Way\nDock 3\nFlint, MI 04850', pg.evaluate('() => window.__lastCopy'))
    pg.click('.modal [data-act=copyacct]'); pg.wait_for_timeout(250); lc = pg.evaluate('() => window.__lastCopy')
    rec('Copy all includes shipping, card setup, prompts', all(k in lc for k in ('Card Shipping City: Flint', 'Number Of Cards: 25', 'Prompt: License Plate #: Yes', 'Opportunity #: 1-SMPL0201')) or all(k in lc for k in ('Card Shipping City', 'Number Of Cards', 'Prompt: License Plate #')), lc[:300])
    pg.fill('#ff_ship_city', 'Sampleville'); pg.wait_for_timeout(300)
    rec('section fields editable', pg.evaluate(f"() => acc('{nw['id']}').ship.city") == 'Sampleville'); pg.fill('#ff_ship_city', 'Flint'); pg.wait_for_timeout(200)
    pg.click(f'.modal [data-act=ffcopy][data-v=drivers]'); pg.wait_for_timeout(250)
    rec('copy drivers table (TSV)', pg.evaluate('() => window.__lastCopy').split('\n')[0] == 'First Name\tLast Name\tDepartment\tDriver ID')
    name, path = dl(pg, '.modal [data-act=ffcsv][data-v=vehicles]', 'veh.csv'); rows = readcsv(path)
    rec('⬇ Vehicles.csv: own file, named "<Account> - Vehicles.csv"', name == 'Sample Northwind Freight - Vehicles.csv' and rows[0][0] == 'Company Vehicle ID' and len(rows) == 13, (name, len(rows)))
    name, path = dl(pg, '.modal [data-act=ffcsv][data-v=drivers]', 'drv.csv'); rows = readcsv(path)
    rec('⬇ Drivers.csv: own file, Driver ID zeros kept', name == 'Sample Northwind Freight - Drivers.csv' and len(rows) == 41 and rows[1][3] == '000101', (name, rows[1]))
    pg.click('.modal [data-act=ffview][data-v=vehicles]'); pg.wait_for_timeout(300)
    rec('View vehicles table (12 rows)', pg.locator('#ffTbl tbody tr').count() == 12); shot(pg, '04-vehicles-table')
    pg.click('[data-act=close]'); pg.wait_for_timeout(200)
    # 4) business: files tab, combined CSVs, master xlsx, one-click zip
    pg.click('[data-act=tab][data-tab=files]'); pg.wait_for_timeout(300)
    rec('files tab: per-account vehicle/driver buttons', pg.locator(f'#main [data-act=ffcsv][data-id="{fy["id"]}"][data-v=vehicles]').count() == 1)
    shot(pg, '05-files-tab')
    name, path = dl(pg, '#main [data-act=ffall][data-v=vehicles]', 'allveh.csv'); rows = readcsv(path)
    rec('All Vehicles.csv: Account / Parent columns (no SF ID), 12+5 rows', name == 'All Vehicles.csv' and rows[0][:3] == ['Account', 'Parent Account', 'Source File'] and len(rows) == 18 and any(r[0].endswith('Flint Yard') and r[1] == 'Sample: Northwind Freight' for r in rows), (name, len(rows), rows[0][:6]))
    name, path = dl(pg, '#main [data-act=ffall][data-v=drivers]', 'alldrv.csv'); rows = readcsv(path)
    rec('All Drivers.csv: 40+8 rows', name == 'All Drivers.csv' and len(rows) == 49 and rows[0][3:] == ['First Name', 'Last Name', 'Department', 'Driver ID'], (len(rows), rows[0]))
    name, path = dl(pg, '#main [data-act=ffall][data-v=accounts]', 'macc.csv'); rows = readcsv(path)
    rec('Master Accounts.csv: billing/shipping/card/prompt columns', name == 'Master Accounts.csv' and all(h in rows[0] for h in ('Billing Postal Code', 'Card Shipping Address', 'Number Of Cards', 'Prompt: Department', 'Vehicles', 'Drivers')) and len(rows) == 7, (len(rows)))
    name, path = dl(pg, '#btnXlsx', 'fleet-master.xlsx'); wb = openpyxl.load_workbook(path); sn = wb.sheetnames
    rec('master xlsx tabs: All Fleet Data, All Vehicles, All Drivers, <Account> - Vehicles/Drivers', all(x in sn for x in ('All Fleet Data', 'All Vehicles', 'All Drivers')) and sum(n.endswith('- Vehicles') for n in sn) == 2 and sum(n.endswith('- Drivers') for n in sn) == 2 and all(len(n) <= 31 for n in sn), sn)
    dv = [r for r in wb['All Drivers'].iter_rows(min_row=2, values_only=True)]
    rec('xlsx All Drivers keeps Driver ID as text', dv[0][6] == '000101', dv[0])
    rec('xlsx All Fleet Data stacks vehicles', wb['All Fleet Data'].max_row - 1 == 17, wb['All Fleet Data'].max_row)
    ah = [c.value for c in wb['Accounts'][1]]; rec('xlsx Accounts has card/shipping/prompt columns', 'Card Shipping City' in ah and 'Prompt: License Plate #' in ah)
    name, path = dl(pg, '.bizhead [data-act=buildzip]', 'master-list.zip'); z = zipfile.ZipFile(path); zn = z.namelist()
    want = ['Master Accounts.csv', 'All Vehicles.csv', 'All Drivers.csv', 'vehicles-and-drivers/Sample Northwind Freight - Vehicles.csv', 'vehicles-and-drivers/Sample Northwind Freight - Drivers.csv', 'vehicles-and-drivers/Sample Northwind Freight – Flint Yard - Vehicles.csv']
    rec('one-click master list .zip: master xlsx + combined CSVs + each account CSV + original forms', z.testzip() is None and all(w in zn for w in want) and any(n.endswith('.xlsx') for n in zn) and any(n.startswith('attachments/') and n.endswith('FleetData.xls') for n in zn), zn)
    # 5) re-upload same form → updates in place
    pg.click('[data-act=upload]'); pg.set_input_files('#upFiles', [FL + 'biff8/' + NW]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 1'); pg.wait_for_timeout(200)
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(400)
    W2 = pg.evaluate("() => ({f: WS.files.length, c: WS.contacts.length, v: WS.accounts.find(a => a.sfId === '001SMPL00000201AAA').fleet.vehicles.rows.length, a: WS.accounts.length})")
    rec('re-upload: no duplicate attachment/contacts/accounts', W2 == {'f': len(W['files']), 'c': len(W['contacts']), 'v': 12, 'a': 8}, W2)
    # 6) a form with no matching account → new account (by Company Name)
    pg.click('[data-act=upload]'); pg.set_input_files('#upFiles', files=[{'name': 'Sample_Quarry_Road_Haulers_FleetData.xls', 'mimeType': 'application/vnd.ms-excel', 'buffer': open(FL + 'html/' + BL, 'rb').read().replace(b'Sample: Birch Lane Plumbing', b'Sample: Quarry Road Haulers').replace(b'1-SMPL0211', b'1-SMPL0999')}])
    pg.wait_for_function('() => UI.up && UI.up.sources.length === 1'); pg.wait_for_timeout(200)
    rec('no match → preview offers new account', 'new account “Sample: Quarry Road Haulers”' in pg.inner_text('.ffsrc'))
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(300)
    q = pg.evaluate("() => { const a = WS.accounts.find(a => a.name === 'Sample: Quarry Road Haulers'); return a && [a.parentId, a.billMode, a.fleet.drivers.rows.length]; }")
    rec('new top-level account created with its fleet data', q == [None, 'own', 4], q)
    ext = [r for r in reqs if not (r[1].startswith(('file://', 'data:', 'blob:')) or (URL.startswith('http') and r[1].startswith(URL.rsplit('/', 1)[0])))]
    rec('zero outside network requests', not ext, ext[:5]); rec('only GETs (nothing sent)', all(m == 'GET' for m, _ in reqs))
    rec('no console/page errors', not errs, errs[:5])
    br.close()
bad = [n for n, ok in res if not ok]; print(f'\n{len(res) - len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
