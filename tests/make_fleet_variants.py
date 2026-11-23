"""FICTIONAL Fleet Data form variants that mimic how the real Salesforce export can be laid out:
plain grid, offset values + NBSP/zero-width labels + bare City/State labels, one table (or sheet) per block,
'Label: value' in one cell + side-by-side pairs, MHTML web archive, nested layout tables.
Each variant is written as HTML .xls, Excel 2003 XML .xls and Excel 97 BIFF8 .xls where that makes sense.
expected.json holds what the parser must find. All values are made up."""
import os, json, subprocess, shutil, quopri
from openpyxl import Workbook
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'fleet-variants')
shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
BILL = ['Sample Kim', 'Lowe', '7 Sample Ct', 'Floor 2', 'Lansing', 'MI', '48933', '(555) 010-0601', 'kim.lowe@example.com']
VH = ['Company Vehicle ID', 'Vehicle Description', 'Department', 'License Plate #', 'Card Control Option', 'Prompt Option', 'Acceptance Option', 'VIN Number']
VEH = [['SAMPLE TRUCK 1', '', '', '', 'Custom Control Sample', 'Odometer & Driver ID', '', ''], ['SAMPLE TRUCK 2', '', '', '', 'Custom Control Sample', 'Odometer & Driver ID', '', ''],
       ['SAMPLE TRUCK 3', '', '', '', 'Custom Control Sample', 'Odometer & Driver ID', '', ''], ['SAMPLE VAN 1', '', '', '', 'Custom Control Sample', 'Odometer & Driver ID', '', ''],
       ['', '', '', '', 'Custom Control Sample', 'Odometer & Driver ID', '', ''],
       ['SAMPLE PICKUP 1', '2022 Sample Pickup', '', '', 'Custom Control Sample', 'Odometer & Driver ID', '', '1SMPL0000000000041'], ['SAMPLE PICKUP 2', '2023 Sample Pickup', '', '', 'Custom Control Sample', 'Odometer & Driver ID', '', '1SMPL0000000000042']]
DRV = [['Sample D%02d' % i, 'Driver', ['Service', 'Delivery'][i % 2], 4100 + i] for i in range(1, 21)]
def blocks(ship=('', '', '', '', '', ''), inline=False, bare=False):
    """list of blocks; each block = list of rows (label/value grid)"""
    bl = [['Opportunity:', '1-SMPL0601']] + [[l, v] for l, v in zip(['Billing First Name:', 'Billing Last Name:', 'Billing Address:', 'Billing Address Line 2:', 'Billing City:', 'Billing State:', 'Billing Postal Code:', 'Billing Phone:', 'Billing Email:'], BILL)]
    if inline: bl = [[r[0] + ' ' + r[1]] for r in bl]
    sl = ['Attention', 'Card Shipping Address:', 'Card Shipping Address Line 2:', 'City:' if bare else 'Card Shipping City:', 'State:' if bare else 'Card Shipping State:', 'Postal Code:' if bare else 'Card Shipping Postal Code:']
    sb = [[l, v] for l, v in zip(sl, ship)]
    if inline: sb = sb[:3] + [[sl[3], ship[3], sl[4], ship[4], sl[5], ship[5]]]
    return [bl, sb, [['Name', 'Phone', 'Email'], [], []], [['Number Of Cards:', 15], ['Company Name:', 'Sample: Cedar Row Movers'], ['Second Line Embossing Option:', 'Company Vehicle ID']],
            [['Department:', 'No'], ['Vehicle Description:', 'No'], ['License Plate #:', 'No'], ['Company Vehicle ID:', 'No']], [VH] + [r[:] for r in VEH], [['First Name', 'Last Name', 'Department', 'Driver ID']] + [r[:] for r in DRV]]
def grid(bs, gaps=(2, 2, 2, 2, 2, 2)):
    out = []
    for i, b in enumerate(bs):
        out += [r[:] for r in b]
        if i < len(bs) - 1: out += [[] for _ in range(gaps[i])]
    return out
def offset_nbsp(bs):
    """values one column further right, NBSP / double spaces / zero-width in labels, stray '*' cells, all shifted right by one column"""
    out = []
    for bi, b in enumerate(bs):
        nb = []
        for r in b:
            if bi in (0, 1, 3, 4) and r:
                lab = r[0].replace(' Of ', ' Of\u200b ').replace(':', ':\u00a0') if r[0] else r[0]
                lab = lab.replace('Billing ', 'Billing  ')
                row = ['', lab, '', r[1] if len(r) > 1 else '']
                if bi == 0 and r[0].startswith('Billing City'): row.append('*')
                nb.append(row)
            else: nb.append([''] + r if r else r)
        out.append(nb)
    return out
SHIP_D = ('Sample Dock Desk', '40 Sample Ln', 'Bay 4', 'Grand Ledge', 'MI', '48837')
V = {
 'plain': dict(bs=blocks(), ship=False),
 'offset_nbsp_bare': dict(bs=offset_nbsp(blocks(bare=True)), ship=False),
 'multitable': dict(bs=blocks(), ship=False, split=True),
 'inline_sidebyside': dict(bs=blocks(ship=SHIP_D, inline=True, bare=True), ship=True),
}
esc = lambda s: str(s).replace('&', '&amp;').replace('<', '&lt;')
def html_cell(v, header=False, label=False):
    if v == '' or v is None: return '<td></td>'
    t = esc(v).replace('\u00a0', '&nbsp;')
    if header: return '<th><a href="https://example.com/sample-link"><u><font color="#0000FF">' + t + '</font></u></a></th>'
    if label and ' ' in t and ':' in t: a, b = t.split(' ', 1); return '<td><b><span>' + a + '</span><br>' + b + '</b></td>' if 'Email' in t else '<td><span style="x">' + t + '</span></td>'
    return '<td>' + t + '</td>'
def is_hdr(r): return r and (r[0:1] == ['Company Vehicle ID'] or r[0:1] == ['First Name'] or r[0:1] == ['Name'] or r[1:2] == ['Company Vehicle ID'] or r[1:2] == ['First Name'] or r[1:2] == ['Name'])
def html_rows(rows): return ''.join('<tr>' + ''.join(html_cell(v, header=is_hdr(r), label=(i == 0 or i == 1) and isinstance(v, str) and v.endswith((':', ':\u00a0'))) for i, v in enumerate(r)) + '</tr>\n' if r else '<tr><td>&nbsp;</td></tr>\n' for r in rows)
HEAD = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body>\n'
def write_all(name, spec):
    bs = spec['bs']; os.makedirs(f'{D}/{name}', exist_ok=True); fn = 'Sample_Cedar_Row_Movers_FleetData.xls'
    for fl in ('html', 'xml2003', 'biff8'): os.makedirs(f'{D}/{name}/{fl}', exist_ok=True)
    if spec.get('split'):   # one <table> per block, each with its own column offset; one Worksheet / sheet per block for XML and BIFF
        html = HEAD + ''.join('<table border="0">\n' + html_rows([([''] * (i % 2) + r) if r else r for r in b]) + '</table><br>\n' for i, b in enumerate(bs)) + '</body></html>'
        sheets = [(f'Block {i + 1}', b) for i, b in enumerate(bs)]
    else:
        g = grid(bs); html = HEAD + '<table>\n' + html_rows(g) + '</table></body></html>'; sheets = [('Fleet Data', g)]
    open(f'{D}/{name}/html/{fn}', 'w', encoding='utf-8').write(html)
    x = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">\n'
    for sn, rows in sheets:
        x += f'<Worksheet ss:Name="{sn}"><Table>\n'
        for ri, r in enumerate(rows, 1):
            cells = ''; 
            for ci, v in enumerate(r, 1):   # sparse cells with ss:Index, like Excel writes
                if v == '' or v is None: continue
                typ = 'Number' if isinstance(v, int) else 'String'
                cells += f'<Cell ss:Index="{ci}"><Data ss:Type="{typ}">' + (f'<html:U><html:Font html:Color="#0000FF">{esc(v)}</html:Font></html:U>' if is_hdr(r) else esc(v)) + '</Data></Cell>'
            x += f'<Row ss:Index="{ri}">{cells}</Row>\n' if cells else ''
        x += '</Table></Worksheet>\n'
    open(f'{D}/{name}/xml2003/{fn}', 'w', encoding='utf-8').write(x + '</Workbook>')
    wb = Workbook(); wb.remove(wb.active)
    for sn, rows in sheets:
        ws = wb.create_sheet(sn)
        for ri, r in enumerate(rows, 1):
            for ci, v in enumerate(r, 1):
                if v != '' and v is not None: ws.cell(ri, ci, v)
    tmp = f'{D}/{name}/biff8/_tmp.xlsx'; wb.save(tmp)
    subprocess.run(['soffice', '--headless', '--convert-to', 'xls:MS Excel 97', '--outdir', f'{D}/{name}/biff8', tmp], check=True, capture_output=True)
    shutil.move(f'{D}/{name}/biff8/_tmp.xls', f'{D}/{name}/biff8/{fn}'); os.remove(tmp)
    return html
htmls = {n: write_all(n, s) for n, s in V.items()}
# MHTML web archive (Excel "single file web page" saved as .xls), quoted-printable
os.makedirs(f'{D}/mhtml/html', exist_ok=True)
qp = quopri.encodestring(htmls['multitable'].encode('utf-8')).decode('ascii')
open(f'{D}/mhtml/html/Sample_Cedar_Row_Movers_FleetData.xls', 'w', newline='\r\n').write('MIME-Version: 1.0\nX-Document-Type: Workbook\nContent-Type: multipart/related; boundary="----=_NextPart_SAMPLE"\n\nThis document is a Single File Web Page.\n\n------=_NextPart_SAMPLE\nContent-Location: file:///C:/sample/sheet001.htm\nContent-Transfer-Encoding: quoted-printable\nContent-Type: text/html; charset="utf-8"\n\n' + qp + '\n------=_NextPart_SAMPLE--\n')
# nested layout tables: an outer table whose cells each hold one block's table
os.makedirs(f'{D}/nested/html', exist_ok=True)
bs = V['multitable']['bs']
open(f'{D}/nested/html/Sample_Cedar_Row_Movers_FleetData.xls', 'w', encoding='utf-8').write(HEAD + '<table width="100%">' + ''.join('<tr><td><table>' + html_rows(b) + '</table></td></tr><tr><td>&nbsp;</td></tr>' for b in bs) + '</table></body></html>')
exp_bill = dict(zip(['first', 'last', 'addr1', 'addr2', 'city', 'state', 'zip', 'phone', 'email'], BILL))
base = {'opp': '1-SMPL0601', 'bill': exp_bill, 'card': {'numCards': '15', 'company': 'Sample: Cedar Row Movers', 'emboss': 'Company Vehicle ID'},
        'prompts': [['Department', 'No'], ['Vehicle Description', 'No'], ['License Plate #', 'No'], ['Company Vehicle ID', 'No']], 'vehicles': 7, 'drivers': 20, 'contacts': 0, 'driverId0': '4101', 'vehBlankA': True}
E = {}
for n in list(V) + ['mhtml', 'nested']:
    e = json.loads(json.dumps(base)); e['ship'] = dict(zip(['attention', 'addr1', 'addr2', 'city', 'state', 'zip'], SHIP_D if n == 'inline_sidebyside' else [''] * 6)); E[n] = e
json.dump(E, open(f'{D}/expected.json', 'w'), indent=1)
print('variants:', sorted(os.listdir(D)))
