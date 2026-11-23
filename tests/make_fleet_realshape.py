"""FICTIONAL fixtures shaped like the real Salesforce exports (all values made up):
- fleet-realshape/{html,xml2003,biff8}/Sample_Harbor_Lane_Supply_FleetData.xls
    sheet 1: the form block (labels, an EMPTY Company Name followed by a colon-less 'Second Line Embossing Option' label),
    sheet 2 (or a second <table> in HTML): vehicles table with the Salesforce list headers
    (Card Control, Vehicle ID, Department, Vehicle Description, License Plate, VIN Number, Prompt Options; Department mostly blank)
    and a drivers table (First Name, Last Name, Driver Department, Driver ID).
- fleet-realshape/html/Sample_Odd_Headers_FleetData.xls: tables whose headers are NOT recognisable (diagnostics must say why).
- fleet-lists/Fleet_Drivers_5_Sample_Business_Card (1).csv, Fleet_Vehicles_6_Sample_Fleet_Card.csv: separate list exports,
  overlapping the form (3 drivers / 4 vehicles already there) to prove re-imports never duplicate."""
import os, shutil, subprocess, csv
from openpyxl import Workbook
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
D = T + '/fleet-realshape'; L = T + '/fleet-lists'
for d in (D, L): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
FORM = [['Opportunity:', '1-SMPL0701'], ['Billing First Name:', 'Sample Noor'], ['Billing Last Name:', 'Patel'], ['Billing Address:', '12 Sample Wharf Rd'],
        ['Billing City:', 'Muskegon'], ['Billing State:', 'MI'], ['Billing Postal Code:', '49440'], ['Billing Phone:', '(555) 010-0701'], ['Billing Email:', 'noor.patel@example.com'],
        [], ['Attention', ''], ['Card Shipping Address:', ''], ['Card Shipping City:', ''], ['Card Shipping State:', ''], ['Card Shipping Postal Code:', ''],
        [], ['Name', 'Phone', 'Email'], [], ['Number Of Cards:', 6], ['Company Name', '', 'Second Line Embossing Option', 'Driver Name'],
        [], ['Department:', 'No'], ['Vehicle Description:', 'Yes'], ['License Plate #:', 'No'], ['Company Vehicle ID:', 'Yes']]
VH = ['Card Control', 'Vehicle ID', 'Department', 'Vehicle Description', 'License Plate', 'VIN Number', 'Prompt Options']
VEH = [['Fuel Only', '9101', '', 'Sample Frd Escape SUV', 'SMPL101', '1SMPLVIN000000101', 'Odometer & Driver ID'],
       ['Fuel Only', '9102', '', 'Sample Chv Silverado', 'SMPL102', '1SMPLVIN000000102', 'Odometer & Driver ID'],
       ['Fuel + Maintenance', '9103', '', 'Sample Ram 2500', 'SMPL103', '1SMPLVIN000000103', 'Odometer'],
       ['', '9104', '', 'Sample Ford Transit', 'SMPL104', '1SMPLVIN000000104', 'Odometer & Driver ID'],
       ['Fuel Only', '9105', 'Sample Yard', 'Sample Nissan NV', 'SMPL105', '1SMPLVIN000000105', 'Driver ID'],
       ['Fuel Only', '9106', '', 'Sample Tyt Tacoma', 'SMPL106', '1SMPLVIN000000106', 'Odometer & Driver ID']]
DH = ['First Name', 'Last Name', 'Driver Department', 'Driver ID']
DRV = [['Sample Ava', 'Driver', 'Delivery', '7301'], ['Sample Ben', 'Driver', 'Delivery', '7302'], ['Sample Cy', 'Driver', 'Service', '7303'],
       ['Sample Di', 'Driver', 'Service', '7304'], ['Sample Ed', 'Driver', 'Delivery', '7305']]
SHEET2 = [VH] + VEH + [[], []] + [DH] + DRV
esc = lambda s: str(s).replace('&', '&amp;').replace('<', '&lt;')
def tbl(rows, th=False):
    out = '<table border="1">\n'
    for r in rows:
        hdr = th and r and (r[0] in ('Card Control', 'First Name'))
        out += '<tr>' + ''.join(('<th>' if hdr else '<td>') + (esc(v) if v != '' else '') + ('</th>' if hdr else '</td>') for v in r) + '</tr>\n' if r else '<tr><td></td></tr>\n'
    return out + '</table>\n'
def write(name, sheets):
    for fl in ('html', 'xml2003', 'biff8'): os.makedirs(f'{D}/{fl}', exist_ok=True)
    open(f'{D}/html/{name}', 'w', encoding='utf-8').write('<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>\n' + '<br>\n'.join(tbl(r, True) for _, r in sheets) + '</body></html>')
    x = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
    for sn, rows in sheets:
        x += f'<Worksheet ss:Name="{sn}"><Table>\n'
        for r in rows:
            x += '<Row>' + ''.join(f'<Cell><Data ss:Type="{"Number" if isinstance(v, int) else "String"}">{esc(v)}</Data></Cell>' if v != '' else '<Cell/>' for v in r) + '</Row>\n'
        x += '</Table></Worksheet>\n'
    open(f'{D}/xml2003/{name}', 'w', encoding='utf-8').write(x + '</Workbook>')
    wb = Workbook(); wb.remove(wb.active)
    for sn, rows in sheets:
        ws = wb.create_sheet(sn)
        for ri, r in enumerate(rows, 1):
            for ci, v in enumerate(r, 1):
                if v != '': ws.cell(ri, ci, v)
    tmp = f'{D}/biff8/_tmp.xlsx'; wb.save(tmp)
    subprocess.run(['soffice', '--headless', '--convert-to', 'xls:MS Excel 97', '--outdir', f'{D}/biff8', tmp], check=True, capture_output=True)
    shutil.move(f'{D}/biff8/_tmp.xls', f'{D}/biff8/{name}'); os.remove(tmp)
write('Sample_Harbor_Lane_Supply_FleetData.xls', [('Fleet Data', FORM), ('Vehicles and Drivers', SHEET2)])
# headers nobody could recognise → diagnostics must explain
ODD = FORM[:9] + [[], ['Unit Ref', 'Card Control', 'Notes', 'Misc A', 'Misc B'], ['U-1', 'Fuel Only', 'Sample note', 'a', 'b'], [], ['Person', 'Surname Text', 'Group'], ['Sample Q', 'Doe', 'Ops']]
open(f'{D}/html/Sample_Odd_Headers_FleetData.xls', 'w', encoding='utf-8').write('<html><body>' + tbl(ODD) + '</body></html>')
# separate list exports (Salesforce CSV), overlapping the form
with open(f'{L}/Fleet_Drivers_5_Sample_Business_Card (1).csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(DH); w.writerows([r[:] for r in DRV[2:]] + [['Sample Fay', 'Driver', 'Delivery', '7306'], ['Sample Gil', 'Driver', '', '7307']])
VCSV = [r[:] for r in VEH[2:]] + [['Fuel Only', '9107', '', 'Sample Frd F-150', 'SMPL107', '1SMPLVIN000000107', 'Odometer & Driver ID'], ['Fuel Only', '9108', '', 'Sample GMC Sierra', 'SMPL108', '1SMPLVIN000000108', 'Odometer']]
VCSV[0][2] = 'Sample Ops'   # fills a blank Department on an existing vehicle → "updated", not a duplicate
with open(f'{L}/Fleet_Vehicles_6_Sample_Fleet_Card.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(VH); w.writerows(VCSV)
print(sorted(os.listdir(D + '/html')), sorted(os.listdir(L)))
