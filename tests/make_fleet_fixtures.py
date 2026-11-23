"""FICTIONAL Wex 'Fleet Data' card-order forms (<Company>_FleetData.xls), one per company, each written in
all three Salesforce .xls flavors: HTML table, Excel 2003 XML (SpreadsheetML) and Excel 97-2003 (BIFF8).
Layout mirrors the real form: label/value blocks in columns A/B, a Name|Phone|Email table, prompt Yes/No
flags, a vehicle table and a driver table. Every value is made up ("Sample", example.com, 555 numbers)."""
import os, random, subprocess, shutil
from openpyxl import Workbook
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'fleet'); random.seed(7)
VH = ['Company Vehicle ID', 'Vehicle Description', 'Department', 'License Plate #', 'Card Control Option', 'Prompt Option', 'Acceptance Option', 'VIN Number']
DH = ['First Name', 'Last Name', 'Department', 'Driver ID']
FIRST = ['Sample Alex', 'Sample Bo', 'Sample Cam', 'Sample Dana', 'Sample Eli', 'Sample Fran', 'Sample Gus', 'Sample Hana', 'Sample Ivo', 'Sample Jo']
LAST = ['Adams', 'Brook', 'Cole', 'Dunn', 'Ellis', 'Ford', 'Grant', 'Hale']
DEPTS = ['Service', 'Delivery', 'Sales', 'Admin']
def form(opp, bill, ship, contacts, ncards, company, emboss, prompts, nveh, ndrv, did0):
    R = [['Opportunity:', opp], ['Billing First Name:', bill[0]], ['Billing Last Name:', bill[1]], ['Billing Address:', bill[2]], ['Billing Address Line 2:', bill[3]],
         ['Billing City:', bill[4]], ['Billing State:', bill[5]], ['Billing Postal Code:', bill[6]], ['Billing Phone:', bill[7]], ['Billing Email:', bill[8]], [], [],
         ['Attention', ship[0]], ['Card Shipping Address:', ship[1]], ['Card Shipping Address Line 2:', ship[2]], ['Card Shipping City:', ship[3]], ['Card Shipping State:', ship[4]], ['Card Shipping Postal Code:', ship[5]], [], [],
         ['Name', 'Phone', 'Email']]
    R += [list(c) for c in contacts] + [[]] * (2 - len(contacts))
    R += [['Number Of Cards:', ncards], ['Company Name:', company], ['Second Line Embossing Option:', emboss], [], []]
    R += [[k + ':', v] for k, v in prompts] + [[], [], VH]
    for i in range(nveh):
        vid = 'RENTAL VEH %d' % (i - nveh + 3) if i >= nveh - 2 else ('Sample Gus Grant' if i == 3 else 'SV-%03d' % (i + 1))
        R.append([vid, random.choice(['2019 Sample Van', '2021 Sample Pickup', '2020 Sample Box Truck', '']), random.choice(DEPTS + ['']), 'SMPL%03d' % random.randint(0, 999) if i % 4 else '',
                  'Fuel Only', 'Driver ID + Odometer', 'Standard', '' if i % 5 == 2 else '1SMPL%013d' % random.randint(0, 10**12)])
    R += [[], DH]
    for i in range(ndrv): R.append([random.choice(FIRST), random.choice(LAST), random.choice(DEPTS), '%06d' % (did0 + i)])
    return R
FORMS = {
 'Sample_Northwind_Freight_FleetData.xls': form('1-SMPL0201', ['Sample Ana', 'Ruiz', '100 Sample Way', 'Suite 200', 'Flint', 'MI', '04850', '(555) 010-0401', 'ana.ruiz@example.com'],
     ['Sample Yard Office', '100 Sample Way', 'Dock 3', 'Flint', 'MI', '04850'], [('Sample Raj Mehta', '(555) 010-0402', 'raj.mehta@example.com'), ('Sample Ben Ode', '(555) 010-0403', 'ben.ode@example.com')],
     25, 'Sample: Northwind Freight', 'Company Vehicle ID', [('Department', 'Yes'), ('Vehicle Description', 'No'), ('License Plate #', 'Yes'), ('Company Vehicle ID', 'Yes')], 12, 40, 101),
 'Sample_Northwind_Freight_Flint_Yard_FleetData.xls': form('1-SMPL0202', ['Sample Ben', 'Ode', '22 Sample Yard Rd', '', 'Flint', 'MI', '48501', '(555) 010-0403', 'ben.ode@example.com'],
     ['Sample Ben Ode', '22 Sample Yard Rd', '', 'Flint', 'MI', '48501'], [], 6, 'Sample: Northwind Freight', 'Driver Name', [('Department', 'No'), ('Vehicle Description', 'Yes'), ('License Plate #', 'No'), ('Company Vehicle ID', 'Yes')], 5, 8, 501),
 'Sample_Birch_Lane_Plumbing_FleetData.xls': form('1-SMPL0211', ['Sample Tom', 'Reyes', '9 Sample Ave', '', 'Toledo', 'OH', '43604', '(555) 010-0405', 'tom.reyes@example.com'],
     ['Sample Shop', '9 Sample Ave', 'Unit B', 'Toledo', 'OH', '43604'], [('Sample Lia Chen', '(555) 010-0406', 'lia.chen@example.com')], 4, 'Sample: Birch Lane Plumbing', 'Company Vehicle ID',
     [('Department', 'No'), ('Vehicle Description', 'No'), ('License Plate #', 'No'), ('Company Vehicle ID', 'Yes')], 4, 4, 901),
}
esc = lambda s: str(s).replace('&', '&amp;').replace('<', '&lt;')
W = max(len(r) for R in FORMS.values() for r in R)
for flavor in ('html', 'xml2003', 'biff8'): os.makedirs(f'{D}/{flavor}', exist_ok=True)
for name, R in FORMS.items():
    # 1) HTML table (.xls)
    html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body><table>\n'
    for r in R: html += '<tr>' + ''.join(f'<td>{esc(v)}</td>' if v != '' else '<td></td>' for v in (r + [''] * (W - len(r)))) + '</tr>\n'
    open(f'{D}/html/{name}', 'w', encoding='utf-8').write(html + '</table></body></html>')
    # 2) SpreadsheetML (.xls)
    x = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Fleet Data"><Table>\n'
    for r in R: x += '<Row>' + ''.join(('<Cell><Data ss:Type="Number">%s</Data></Cell>' % v) if isinstance(v, int) else ('<Cell><Data ss:Type="String">%s</Data></Cell>' % esc(v) if v != '' else '<Cell/>') for v in r) + '</Row>\n'
    open(f'{D}/xml2003/{name}', 'w', encoding='utf-8').write(x + '</Table></Worksheet></Workbook>')
    # 3) BIFF8 (.xls) via LibreOffice
    wb = Workbook(); ws = wb.active; ws.title = 'Fleet Data'
    for i, r in enumerate(R, 1):
        for j, v in enumerate(r, 1):
            if v != '': ws.cell(i, j, v)
    tmp = f'{D}/biff8/_tmp.xlsx'; wb.save(tmp)
    subprocess.run(['soffice', '--headless', '--convert-to', 'xls:MS Excel 97', '--outdir', f'{D}/biff8', tmp], check=True, capture_output=True)
    shutil.move(f'{D}/biff8/_tmp.xls', f'{D}/biff8/{name}'); os.remove(tmp)
print('fleet fixtures:', sorted(os.listdir(f'{D}/html')))
