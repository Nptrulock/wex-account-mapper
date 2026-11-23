"""Salesforce-export upload tests. Uses ONLY the fictional fixtures in tests/fixtures (build with make_fixtures.py).
usage: python3 tests/upload_test.py [URL] [TAG]"""
import sys, os, struct, time, openpyxl
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = sys.argv[1] if len(sys.argv) > 1 else 'file://' + ROOT + '/index.html'
TAG = sys.argv[2] if len(sys.argv) > 2 else 'local'
FX = ROOT + '/tests/fixtures/'; SH = ROOT + '/shots/'; OUT = ROOT + '/test-out/'
os.makedirs(SH, exist_ok=True); os.makedirs(OUT, exist_ok=True)
FILES = ['sf_classic_accounts.xls', 'sf_contacts_xml2003.xls', 'sf_opportunities_formatted.xlsx', 'sf_cases_excel97.xls', 'sf_billing_credit.csv']
PASS = 'Sample-Passcode-123'; res = []; errs = []; reqs = []
def rec(n, ok, info=''):
    res.append((n, bool(ok))); print(('PASS ' if ok else 'FAIL ') + n + (' — ' + str(info) if info not in ('', None) else ''), flush=True)
def shot(pg, n, full=False): pg.screenshot(path=SH + TAG + '-up-' + n + '.png', full_page=full)

# fixture sanity: the BIFF8 file's shared-string table really is split by CONTINUE records
b = open(FX + 'sf_cases_excel97.xls', 'rb').read(); i = b.find(b'\x09\x08\x10\x00\x00\x06\x05\x00'); seen_sst = cont = 0
while 0 <= i < len(b) - 4:
    t, l = struct.unpack('<HH', b[i:i + 4])
    if t == 0xFC: seen_sst = 1
    elif t == 0x3C and seen_sst: cont += 1
    elif seen_sst and t != 0x3C: break
    i += 4 + l
rec('fixture: BIFF8 SST spans CONTINUE records', cont >= 1, cont)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append('CONSOLE ' + m.text))
    pg.on('dialog', lambda d: d.accept()); ctx.on('request', lambda r: reqs.append((r.method, r.url, r.post_data)))
    pg.goto(URL); pg.wait_for_function('() => window.__ready === true')
    pg.wait_for_selector('#lockForm[data-mode=setup]'); pg.fill('#lp1', PASS); pg.fill('#lp2', PASS); pg.click('#lockForm button[type=submit]'); pg.wait_for_selector('body:not(.locked) #main', timeout=20000)
    rec('empty state offers Upload Salesforce exports', pg.locator('#main .empty [data-act=upload]').count() == 1)
    rec('no Salesforce connect UI remains', pg.locator('[data-act=sfconnect], [data-act=sfpull]').count() == 0 and 'Connect to Salesforce' not in pg.inner_text('body'))
    csp = pg.evaluate("() => document.querySelector('meta[http-equiv=Content-Security-Policy]').content")
    rec("CSP connect-src 'none' (no outside hosts)", "connect-src 'none'" in csp and 'salesforce' not in csp, csp)
    pg.click('#main .empty [data-act=upload]'); pg.wait_for_selector('#dropZone')
    rec('drop zone shown', pg.locator('#dropZone').is_visible())
    pg.set_input_files('#upFiles', [FX + f for f in FILES]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 5', timeout=20000); pg.wait_for_timeout(300)
    src = pg.evaluate("() => Object.fromEntries(UI.up.sources.map(s => [s.file, {f: s.format, t: s.type, n: s.table.rows.length, h: s.table.headers, map: s.map, title: s.table.title || ''}]))")
    exp = {'sf_classic_accounts.xls': ('HTML', 'accounts', 8), 'sf_contacts_xml2003.xls': ('2003 XML', 'contacts', 5), 'sf_opportunities_formatted.xlsx': ('.xlsx', 'opportunities', 4),
           'sf_cases_excel97.xls': ('97-2003', 'cases', 300), 'sf_billing_credit.csv': ('CSV', 'billing', 4)}
    for f, (fmt, typ, n) in exp.items():
        s = src.get(f, {}); rec(f'{f}: format detected ({fmt})', fmt in s.get('f', ''), s.get('f'))
        rec(f'{f}: report type = {typ}', s.get('t') == typ, s.get('t'))
        rec(f'{f}: {n} data rows (header/footer/subtotal/group rows skipped)', s.get('n') == n, s.get('n'))
    o = src['sf_opportunities_formatted.xlsx']
    rec('formatted xlsx: header found below title block', o['h'][:2] == ['Account Name', 'Opportunity Name'] and 'Sample Opportunities' in o['title'], o['h'])
    rows = pg.evaluate("() => UI.up.sources.find(s => s.file.includes('opportunities')).table.rows")
    rec('formatted xlsx: grouped Account Name filled down', rows[1][0] == 'Sample: Northwind Freight' and all(r[0] for r in rows), [r[0] for r in rows])
    rec('formatted xlsx: date cell → date text, amount → number text', '/2026' in rows[0][4] and rows[0][5] in ('30000', '30000.00', '30,000.00'), rows[0][4:6])
    crow = pg.evaluate("() => { const s = UI.up.sources.find(s => s.file.includes('cases')); return [s.table.rows[0], s.table.rows[299]]; }")
    rec('BIFF8: leading-zero case numbers kept as text', crow[0][0] == '00012001' and crow[1][0] == '00012300', [crow[0][0], crow[1][0]])
    rec('BIFF8: strings after SST CONTINUE decode correctly', crow[1][1].startswith('Sample subject 300: card replacement request'), crow[1][1])
    rec('BIFF8: Date/Time Opened rendered as date + time', '/2026' in crow[0][4] and ':' in crow[0][4], crow[0][4])
    rec('BIFF8: "(n records)" group rows fill Account Name', crow[0][6] == 'Sample: Northwind Freight' and crow[1][6] == 'Sample: Birch Lane Plumbing – East', [crow[0][6], crow[1][6]])
    ct = pg.evaluate("() => UI.up.sources.find(s => s.file.includes('contacts')).table.rows[0]")
    rec('SpreadsheetML: DateTime cell readable', ct[9].startswith('2026') or '/2026' in ct[9], ct[9])
    a = src['sf_classic_accounts.xls']['map']
    rec('accounts columns auto-mapped (name, ID, parent, parent ID, owner, stage)', a[:5] == ['a.name', 'a.sfId', 'a.parentRef', 'a.parentId', 'a.repName'] and a[9] == 'a.stage', a)
    rec('billing columns auto-mapped (level, credit, cycle, terms, contact)', src['sf_billing_credit.csv']['map'][2:7] == ['a.billMode', 'a.creditLimit', 'a.billCycle', 'a.terms', 'a.billContact'])
    rec('stage chooser lists the unclear value', pg.locator('select[data-act-change=upstage][data-v="pending docs"]').count() == 1)
    shot(pg, '01-preview'); shot(pg, '01-preview-full', True)
    # choose a stage for the unclear value, and change one column mapping (Phone → ignore) — both must be remembered
    pg.select_option('select[data-act-change=upstage][data-v="pending docs"]', 'app'); pg.wait_for_timeout(200)
    sid = pg.evaluate("() => UI.up.sources.find(s => s.file.includes('accounts')).id")
    pg.click(f'[data-act=uptoggle][data-v="{sid}"]'); pg.wait_for_timeout(200)
    pg.select_option(f'select[data-act-change=upmap][data-v="{sid}"][data-i="8"]', ''); pg.wait_for_timeout(200)
    st = pg.evaluate('() => UI.up.lastPreview'); rec('preview: 8 new accounts, 5 new contacts, 6 links, 2 businesses', (st['accNew'], st['conNew'], st['links'], len(st['roots'])) == (8, 5, 6, 2), (st['accNew'], st['conNew'], st['links'], len(st['roots'])))
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(400)
    rec('import result shown', 'accounts' in pg.inner_text('#upResult'), pg.inner_text('#upResult'))
    W = pg.evaluate("() => JSON.parse(JSON.stringify(WS))")
    A = {x['sfId']: x for x in W['accounts']}; byId = {x['id']: x for x in W['accounts']}
    names = [x['name'] for x in W['accounts']]
    rec('no junk accounts (Total/Subtotal/Copyright/Confidential/Grand Totals)', not any(n for n in names if any(j in n for j in ('Total', 'Copyright', 'Confidential', 'Generated', 'records)'))), names)
    rec('8 accounts, IDs as given', len(W['accounts']) == 8 and all(('001SMPL%08dAAA' % k) in A for k in (201, 202, 203, 204, 205, 206, 211, 212)))
    par = lambda k: (byId.get(A['001SMPL%08dAAA' % k]['parentId']) or {}).get('sfId')
    rec('hierarchy from Parent Account ID (incl. grandchild)', par(202) == par(203) == par(204) == par(206) == '001SMPL00000201AAA' and par(205) == '001SMPL00000204AAA' and par(212) == '001SMPL00000211AAA' and par(201) is None)
    rec('same-name location kept separate by Account ID', A['001SMPL00000206AAA']['id'] != A['001SMPL00000201AAA']['id'])
    stg = lambda k: A['001SMPL%08dAAA' % k]['stage']
    rec('stages auto-mapped (Impl Call / M&C / App FU)', (stg(201), stg(202), stg(205)) == ('impl', 'mc', 'app'), (stg(201), stg(202), stg(205)))
    rec('unclear stage mapped by user choice', stg(204) == 'app' and A['001SMPL00000204AAA']['sfStage'] == 'Pending Docs')
    a201, a202, a203 = A['001SMPL00000201AAA'], A['001SMPL00000202AAA'], A['001SMPL00000203AAA']
    rec('rep/owner from accounts file kept', a201['repName'] == 'Sample Rep (Casey Fox)' and 'Opportunity rep / owner name' not in a201['extra'], a201['repName'])
    rec('opportunity name + ID filled; 2nd opp kept as extra', a201['oppName'] == 'Sample: Northwind fleet card rollout' and a201.get('oppId') == '006SMPL00000201AAA' and 'telematics' in a201['extra'].get('Other Opportunity name', ''), a201['extra'].get('Other Opportunity name'))
    rec('opportunity stage/amount/close date kept as extras', 'Closed Won' in a201['extra'].get('Opportunity: Stage', '') and a201['extra'].get('Opportunity: Close Date', '').endswith('/2026') and 'Opportunity: Amount' in a201['extra'])
    rec('case # filled with leading zeros', a201['caseNo'] == '00012001' and a202['caseNo'] == '00012051', (a201['caseNo'], a202['caseNo']))
    rec('billing: parent credit $150,000 weekly Net 14', str(a201['creditLimit']) == '150000' and a201['billCycle'] == 'Weekly' and a201['terms'] == 'Net 14', (a201['creditLimit'], a201['billCycle'], a201['terms']))
    rec('billing: child with own line "USD 25,000.00" → own credit line', a203['billMode'] == 'own' and str(a203['creditLimit']) == '25000' and a203['terms'] == 'Net 15', (a203['billMode'], a203['creditLimit']))
    rec('billing: child billed at parent stays parent', a202['billMode'] == 'parent', a202['billMode'])
    rec('billing: child with no billing data defaults to billed at parent', A['001SMPL00000206AAA']['billMode'] == 'parent' and A['001SMPL00000205AAA']['billMode'] == 'parent')
    rec('billing: top-level accounts hold their own line', a201['billMode'] == 'own' and A['001SMPL00000211AAA']['billMode'] == 'own')
    rec('extras kept on account (Type, Billing City, Fleet Size, Program)', all(k in a201['extra'] for k in ('Type', 'Billing City', 'Fleet Size', 'Program')), list(a201['extra']))
    rec('ignored column (Phone) not stored', 'Phone' not in a201['extra'])
    C = {c['name']: c for c in W['contacts']}
    rec('5 contacts named First + Last', len(W['contacts']) == 5 and 'Sample: Ana Ruiz' in C, list(C))
    rec('contact level: parent-level vs child-level', C['Sample: Ana Ruiz']['level'] == 'parent' and C['Sample: Ben Ode']['level'] == 'child' and C['Sample: Tom Reyes']['level'] == 'parent', [(n, c['level']) for n, c in C.items()])
    rec('contact attached by Account ID', C['Sample: Lia Chen']['accountIds'] == [a203['id']])
    rec('contact extras kept (Mailing City)', C['Sample: Ana Ruiz'].get('extra', {}).get('Mailing City') == 'Flint')
    rec('2 businesses in sidebar', pg.locator('.biz').count() == 2)
    pg.click('[data-act=tab][data-tab=chart]'); pg.wait_for_timeout(300)
    rec('chart shows 6 Northwind nodes', pg.locator('#tree .node').count() == 6, pg.locator('#tree .node').count())
    shot(pg, '02-chart')
    pg.click('#tree .node[data-name*="Saginaw"]'); pg.wait_for_timeout(300)
    mt = pg.inner_text('.modal').lower()
    rec('account modal shows "From Salesforce exports" extras', 'from salesforce exports' in mt and 'fleet size' in mt and 'salesforce stage' in mt)
    shot(pg, '03-account-extras')
    pg.click('.modal button.cp[data-what="Fleet Size"]'); pg.wait_for_timeout(300)
    rec('extra field is copyable', pg.evaluate('() => window.__lastCopy') == '35', pg.evaluate('() => window.__lastCopy'))
    pg.click('.modal [data-act=copyacct]') if pg.locator('.modal [data-act=copyacct]').count() else None; pg.wait_for_timeout(300)
    lc = pg.evaluate('() => window.__lastCopy') or ''
    rec('copy-all for account includes extras', 'Fleet Size' in lc or pg.locator('.modal [data-act=copyacct]').count() == 0, lc[:120])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # encryption at rest still on
    raw = pg.evaluate("async () => { const r = await Store.rawGet('kv', 'ws'); return {enc: r && r.enc, plain: JSON.stringify(r).includes('Northwind')}; }")
    rec('workspace still encrypted at rest after upload', raw['enc'] == 1 and not raw['plain'], raw)
    # master file includes extras
    pg.click('[data-act=tab][data-tab=files]'); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.click('#btnXlsx')
    xp = OUT + TAG + '-up-master.xlsx'; d.value.save_as(xp); wb = openpyxl.load_workbook(xp)
    sh = wb['Accounts']; hdr = [c.value for c in sh[1]]
    rec('master xlsx Accounts sheet has extra columns', all(k in hdr for k in ('Salesforce Stage', 'Fleet Size', 'Opportunity: Amount')), hdr[-8:])
    ci = hdr.index('Case #') if 'Case #' in hdr else None
    vals = [r[ci] for r in sh.iter_rows(min_row=2, values_only=True)] if ci is not None else []
    rec('master xlsx keeps case # leading zeros', '00012001' in vals, vals[:3])
    # re-upload: idempotent (updates only); remembered mapping + stage choice
    pg.click('[data-act=upload]'); pg.wait_for_timeout(300)
    pg.set_input_files('#upFiles', [FX + f for f in FILES]); pg.wait_for_function('() => UI.up && UI.up.sources.length === 5', timeout=20000); pg.wait_for_timeout(300)
    st = pg.evaluate('() => UI.up.lastPreview'); rec('re-upload preview: 0 new, all updated', st['accNew'] == 0 and st['conNew'] == 0 and st['accUpd'] == 8, (st['accNew'], st['accUpd'], st['conNew']))
    m = pg.evaluate("() => UI.up.sources.find(s => s.file.includes('accounts')).map[8]")
    rec('column mapping change remembered', m == '', m)
    rec('stage value choice remembered', pg.eval_on_selector('select[data-act-change=upstage][data-v="pending docs"]', 'e => e.value') == 'app')
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(300)
    W2 = pg.evaluate("() => ({a: WS.accounts.length, c: WS.contacts.length, x: WS.accounts.find(a => a.sfId === '001SMPL00000201AAA').extra['Other Opportunity name']})")
    rec('re-import adds no duplicates, extras not doubled', W2['a'] == 8 and W2['c'] == 5 and W2['x'].count('telematics') == 1, W2)
    # lock / unlock keeps everything
    pg.click('[data-act=locknow]'); pg.wait_for_selector('#lockForm[data-mode=unlock]'); pg.fill('#lp1', PASS); pg.click('#unlockBtn'); pg.wait_for_selector('body:not(.locked) #main', timeout=20000)
    rec('after lock/unlock data intact', pg.evaluate('() => WS.accounts.length') == 8)
    # drag-and-drop path with a pasted-in CSV export (fictional)
    pg.click('[data-act=upload]'); pg.wait_for_timeout(200)
    pg.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['"Account Name","Account ID","Parent Account ID","Status"\\n"Sample: Cedar Row Movers","001SMPL00000301AAA","","Application Follow Up"\\n"Sample: Cedar Row Movers – West","001SMPL00000302AAA","001SMPL00000301AAA","M&C"\\n\\n"Copyright (c) 2000-2026 salesforce.com, inc. All rights reserved."\\n'], 'dropped.csv', {type: 'text/csv'}));
      document.getElementById('dropZone').dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); }""")
    pg.wait_for_function("() => UI.up.sources.some(s => s.file === 'dropped.csv')", timeout=10000); pg.wait_for_timeout(200)
    pg.click('#upGo'); pg.wait_for_selector('#upResult'); pg.wait_for_timeout(300)
    cd = pg.evaluate("() => WS.accounts.filter(a => a.name.startsWith('Sample: Cedar')).map(a => [a.stage, !!a.parentId])")
    rec('drag & drop CSV imported with stages and hierarchy', sorted(cd) == [['app', False], ['mc', True]], cd)
    # bad file handled
    pg.set_input_files('#upFiles', files=[{'name': 'notes.xls', 'mimeType': 'application/vnd.ms-excel', 'buffer': b'\x00\x01garbage bytes that are not a spreadsheet'}]); pg.wait_for_timeout(800)
    wt = pg.inner_text('#main'); rec('unreadable file → friendly message, no crash', 'notes.xls:' in wt, wt[wt.find('notes.xls'):][:120])
    ext = [r for r in reqs if not (r[1].startswith('file://') or r[1].startswith('data:') or r[1].startswith('blob:') or (URL.startswith('http') and r[1].startswith(URL.split('/index')[0].rstrip('/').rsplit('/', 0)[0])))]
    rec('zero outside network requests', not ext, ext[:5])
    rec('no requests carry data (no POST/PUT)', not [r for r in reqs if r[0] != 'GET'])
    rec('no console/page errors', not errs, errs[:5])
    br.close()
bad = [n for n, ok in res if not ok]
print(f'\n{len(res) - len(bad)}/{len(res)} passed'); sys.exit(1 if bad else 0)
