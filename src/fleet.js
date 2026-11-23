/* ---------- Wex "Fleet Data" card-order form (<Company>_FleetData.xls) ----------
   A one-sheet FORM, not a report: label/value blocks (col A label, col B value) for the
   opportunity, billing contact/address, card shipping, card setup and prompt flags, plus three
   tables (Name|Phone|Email contacts, vehicles, drivers). Parsed by finding labels and table
   headers (case / colon / whitespace-insensitive), never by fixed row numbers. */
const ffClean = v => String(v ?? '').replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '').replace(/[\u00a0\u2007\u202f\u3000]/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
const ffNorm = s => ffClean(s).toLowerCase().replace(/[:：]/g, ' ').replace(/[^a-z0-9#&/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const FF_DEF = [
  ['top', 'opp', 'Opportunity', ['opportunity', 'opportunity #', 'opportunity number', 'opportunity id']],
  ['bill', 'first', 'Billing First Name', ['billing first name']], ['bill', 'last', 'Billing Last Name', ['billing last name']],
  ['bill', 'addr1', 'Billing Address', ['billing address', 'billing address line 1', 'billing street']], ['bill', 'addr2', 'Billing Address Line 2', ['billing address line 2', 'billing address 2']],
  ['bill', 'city', 'Billing City', ['billing city']], ['bill', 'state', 'Billing State', ['billing state', 'billing state/province']],
  ['bill', 'zip', 'Billing Postal Code', ['billing postal code', 'billing zip', 'billing zip code', 'billing zip/postal code']],
  ['bill', 'phone', 'Billing Phone', ['billing phone', 'billing phone number']], ['bill', 'email', 'Billing Email', ['billing email', 'billing email address']],
  ['ship', 'attention', 'Attention', ['attention', 'attn', 'card shipping attention', 'shipping attention']],
  ['ship', 'addr1', 'Card Shipping Address', ['card shipping address', 'card shipping address line 1', 'card shipping street']], ['ship', 'addr2', 'Card Shipping Address Line 2', ['card shipping address line 2', 'card shipping address 2']],
  ['ship', 'city', 'Card Shipping City', ['card shipping city']], ['ship', 'state', 'Card Shipping State', ['card shipping state', 'card shipping state/province']],
  ['ship', 'zip', 'Card Shipping Postal Code', ['card shipping postal code', 'card shipping zip', 'card shipping zip code']],
  ['card', 'numCards', 'Number Of Cards', ['number of cards', 'no of cards', '# of cards', 'number of cards requested']], ['card', 'company', 'Company Name', ['company name']],
  ['card', 'emboss', 'Second Line Embossing Option', ['second line embossing option', 'second line embossing', '2nd line embossing option']],
  ['prompt', 'Department', 'Department', ['department']], ['prompt', 'Vehicle Description', 'Vehicle Description', ['vehicle description']],
  ['prompt', 'License Plate #', 'License Plate #', ['license plate #', 'license plate', 'license plate number', 'license plate no']], ['prompt', 'Company Vehicle ID', 'Company Vehicle ID', ['company vehicle id', 'vehicle id']],
];
const FF_LABELS = {}; for (const [g, k, d, al] of FF_DEF) for (const x of al) FF_LABELS[ffNorm(x)] = [g, k, d];
/* bare labels ("City:", "Postal Code:") belong to the block above them (billing or card shipping) */
const FF_CTX = {'city': 'city', 'state': 'state', 'state/province': 'state', 'postal code': 'zip', 'zip': 'zip', 'zip code': 'zip', 'address': 'addr1', 'address line 1': 'addr1', 'address line 2': 'addr2', 'address 2': 'addr2'};
const FF_SPECIFIC = new Set(['bill', 'ship', 'numCards', 'emboss']);   // labels no ordinary report starts a row with
const FF_GROUP_LABEL = {bill: 'Billing contact & address', ship: 'Card shipping', card: 'Card setup'};
const FF_TOK = {
  vehicles: ['company vehicle id', 'vehicle id', 'vehicle description', 'vehicle desc', 'department', 'license plate', 'card control', 'prompt option', 'acceptance option', 'vin'],
  vehicleCore: ['company vehicle id', 'vehicle id', 'vehicle desc', 'license plate', 'vin', 'card control', 'acceptance option'],
  drivers: ['first name', 'last name', 'department', 'driver id', 'driver'],
  contacts: ['name', 'contact name', 'phone', 'phone number', 'email', 'email address', 'e mail'],
};
function ffTableKind(n){
  const ne = n.filter(Boolean); if (ne.length < 2) return null;
  const hits = toks => ne.filter(x => toks.some(t => x === t || x.startsWith(t + ' ') || (t.length > 3 && x.startsWith(t)))).length;
  if (hits(FF_TOK.vehicles) >= 3 && hits(FF_TOK.vehicleCore) >= 1) return 'vehicles';
  if (ne.includes('first name') && ne.includes('last name') && hits(FF_TOK.drivers) >= Math.min(3, ne.length)) return 'drivers';
  if (ne.length <= 5 && ne.some(x => x === 'name' || x === 'contact name') && hits(FF_TOK.contacts) >= Math.min(3, ne.length) && hits(FF_TOK.contacts) >= 2) return 'contacts';
  return null;
}
/* a cell is a label if it IS a known label, or reads "Label: value" in one cell */
function ffLabelCell(cell, ctx){
  const look = n => FF_LABELS[n] || (ctx && FF_CTX[n] ? [ctx, FF_CTX[n], FF_DEF.find(d => d[0] === ctx && d[1] === FF_CTX[n])[2]] : null);
  const n = ffNorm(cell); if (!n) return null;
  if (look(n)) return {L: look(n), inline: null};
  const m = ffClean(cell).match(/^([^:：]{2,60})[:：]\s*(.+)$/); if (m && look(ffNorm(m[1]))) return {L: look(ffNorm(m[1])), inline: m[2].trim()};
  return null;
}
function parseFleetForm(rows){
  const R = (rows || []).map(r => (r || []).map(ffClean));
  const out = {fields: {top: {}, bill: {}, ship: {}, card: {}}, prompts: [], tables: {}, labels: 0, specific: 0, rowsInfo: []};
  const seen = new Set(); let cur = null, curKind = null, ctx = null;
  for (let r = 0; r < R.length; r++){
    const row = R[r], n = row.map(ffNorm);
    if (!row.some(Boolean)){ out.rowsInfo.push('blank'); continue; }
    const k = ffTableKind(n);
    if (k){ const cols = n.map((x, i) => x ? i : -1).filter(i => i >= 0); cur = out.tables[k] || (out.tables[k] = {headers: cols.map(i => row[i]), cols, rows: [], headerRow: r + 1}); curKind = k; out.rowsInfo.push('header:' + k); continue; }
    // label cells in this row; each takes the next non-empty, non-label cell to its right
    // walk left→right: a label takes the next non-empty cell as its value (even if that value looks like a label,
    // e.g. embossing option "Company Vehicle ID"), unless that cell is itself a "Label:" with a colon (side-by-side pairs).
    const first = row.findIndex(Boolean);
    let pairs = [], open = null;
    const l0 = row[first] && ffLabelCell(row[first], cur ? null : ctx);
    if (l0){
      for (let c = first; c < row.length; c++){
        const v = row[c]; if (!v) continue;
        if (open){
          const l = ffLabelCell(v, ctx); if (l && /[:：]\s*$/.test(v) && !l.inline){ pairs.push([open.L, '']); open = l; continue; }
          pairs.push([open.L, v]); open = null; continue;
        }
        const l = ffLabelCell(v, cur ? null : (pairs.length && pairs[pairs.length - 1][0][0] !== 'top' ? pairs[pairs.length - 1][0][0] : ctx) || ctx);
        if (!l) continue;
        if (l.inline != null) pairs.push([l.L, l.inline]); else open = l;
      }
      if (open) pairs.push([open.L, '']);
      if (pairs.length >= 3 && pairs.every(p => !p[1])) pairs = [];   // a report header row, not a form
    }
    if (pairs.length){
      cur = null; curKind = null; out.rowsInfo.push('label');
      for (const [[g, key, disp], v] of pairs){
        if (g === 'bill' || g === 'ship') ctx = g; else if (g !== 'top') ctx = null;
        out.labels++; const id = g + '.' + key; if (!seen.has(id)){ seen.add(id); if (FF_SPECIFIC.has(g) || FF_SPECIFIC.has(key)) out.specific++; }
        if (g === 'prompt'){ if (!out.prompts.some(p => p[0] === disp)) out.prompts.push([disp, v]); }
        else if (!out.fields[g][key]) out.fields[g][key] = v;
      }
      continue;
    }
    if (cur){
      const i = first; if (FOOTER_RE.test(row[i]) && row.filter(Boolean).length === 1){ out.rowsInfo.push('footer'); continue; }
      const vals = cur.cols.map(c => row[c] || ''); const extraCols = row.some((v, c) => v && !cur.cols.includes(c));
      if (vals.some(Boolean)){ cur.rows.push(vals); out.rowsInfo.push('row:' + curKind + (extraCols ? '+' : '')); continue; }
    }
    out.rowsInfo.push('other');
  }
  out.distinct = seen.size;
  for (const t of Object.values(out.tables)) delete t.cols;
  return out;
}
/* wins over generic report detection when ≥3 Fleet Data labels are present and at least one is form-specific (or a vehicle/driver table exists) */
function isFleetForm(form){ return form.distinct >= 3 && (form.specific >= 1 || !!form.tables.vehicles || !!form.tables.drivers); }
const ffGrid = res => res.grid && res.grid.length ? res.grid : res.sheets.flatMap(s => [...s.rows, []]);
const ffKey = s => norm(String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\s-]*fleet[_\s-]*data.*$/i, '')).replace(/[^a-z0-9]+/g, ' ').replace(/\b(inc|llc|co|corp|corporation|company|ltd|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
const ffFileCompany = file => String(file || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\s-]*fleet[_\s-]*data.*$/i, '').replace(/_/g, ' ').trim();
/* default target: same Opportunity # → file name (<Company>_FleetData) → Company Name on the form */
function ffMatch(form, file){
  const opp = norm(form.fields.top.opp || '');
  if (opp){ const a = WS.accounts.find(x => norm(x.oppNo) === opp || (x.extra && String(x.extra['Other Opportunity #'] || '').split(' | ').some(v => norm(v) === opp))); if (a) return a; }
  for (const key of [ffKey(file), ffKey(form.fields.card.company)]){ if (!key) continue; const a = WS.accounts.find(x => ffKey(x.name) === key); if (a) return a; }
  return null;
}
function ffApply(s, ctx){
  const F = s.form, f = F.fields; let a = null, isNew = false;
  if (s.target && s.target !== 'new' && !s.target.startsWith('under:')) a = acc(s.target);
  if (!a && !s.target) a = ffMatch(F, s.file);
  if (!a){
    a = newAccount({name: f.card.company || ffFileCompany(s.file) || 'Fleet data account'}); isNew = true;
    if (s.target && s.target.startsWith('under:') && acc(s.target.slice(6))){ a.parentId = s.target.slice(6); a.billMode = 'parent'; }
  }
  ctx.touchedA.add(a.id);
  if (f.top.opp){ if (!a.oppNo) a.oppNo = f.top.opp; else if (a.oppNo !== f.top.opp) ctx.addExtra(a, 'Other Opportunity #', f.top.opp); }
  a.billAddr = {...f.bill}; a.ship = {...f.ship}; a.card = {numCards: f.card.numCards || '', company: f.card.company || '', emboss: f.card.emboss || '', prompts: F.prompts.map(p => p.slice())};
  const tb = k => F.tables[k] ? {headers: F.tables[k].headers.slice(), rows: F.tables[k].rows.map(r => r.slice())} : null;
  a.fleet = {source: s.file, imported: Date.now(), vehicles: tb('vehicles'), drivers: tb('drivers')};
  const level = a.parentId ? 'child' : 'parent';
  const upsert = (name, email, phone, role) => {
    if (!name && !email) return;
    let c = WS.contacts.find(x => (email && norm(x.email) === norm(email)) || (name && norm(x.name) === norm(name) && x.accountIds.includes(a.id)));
    if (!c) c = newContact({name: name || email, level});
    if (!c.email && email) c.email = email; if (!c.phone && phone) c.phone = phone;
    if (role && !String(c.role || '').toLowerCase().includes(role.toLowerCase())) c.role = c.role ? c.role + ', ' + role : role;
    if (!c.accountIds.includes(a.id)) c.accountIds.push(a.id);
    ctx.touchedC.add(c.id);
  };
  const bname = [f.bill.first, f.bill.last].filter(Boolean).join(' ');
  upsert(bname, f.bill.email, f.bill.phone, 'Billing');
  if (bname && !a.billContact) a.billContact = bname;
  const ct = F.tables.contacts;
  if (ct){ const ix = h => ct.headers.findIndex(x => ffNorm(x) === h); const [ni, pi, ei] = ['name', 'phone', 'email'].map(ix); for (const r of ct.rows) upsert(r[ni] || '', ei >= 0 ? r[ei] : '', pi >= 0 ? r[pi] : '', ''); }
  ctx.st.fleet.push({id: s.id, account: a.name, accountId: a.id, isNew, vehicles: a.fleet.vehicles ? a.fleet.vehicles.rows.length : 0, drivers: a.fleet.drivers ? a.fleet.drivers.rows.length : 0, contacts: ct ? ct.rows.length : 0});
}
/* labeled pairs (Copy all, master file) */
function ffPairs(a){
  const out = [];
  for (const g of ['bill', 'ship']){ const o = a[g === 'bill' ? 'billAddr' : 'ship']; if (!o) continue; for (const [gg, k, d] of FF_DEF) if (gg === g && o[k]) out.push([d, o[k]]); }
  if (a.card){ if (a.card.numCards) out.push(['Number Of Cards', a.card.numCards]); if (a.card.company) out.push(['Company Name (card)', a.card.company]); if (a.card.emboss) out.push(['Second Line Embossing Option', a.card.emboss]); for (const [k, v] of a.card.prompts || []) out.push(['Prompt: ' + k, v]); }
  if (a.fleet){ if (a.fleet.vehicles) out.push(['Vehicles', String(a.fleet.vehicles.rows.length)]); if (a.fleet.drivers) out.push(['Drivers', String(a.fleet.drivers.rows.length)]); }
  return out;
}
const ffHas = a => !!(a.billAddr || a.ship || a.card || a.fleet);
const ffTable = (a, which) => a.fleet && a.fleet[which] ? [a.fleet[which].headers, ...a.fleet[which].rows] : null;
const ffFileName = s => String(s || 'Account').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Account';
const ffCsvName = (a, which) => ffFileName(a.name) + ' - ' + (which === 'vehicles' ? 'Vehicles' : 'Drivers') + '.csv';
/* combined tables across the business */
function ffAll(b, which){
  const list = tree(b.id).map(x => x.a).filter(a => ffTable(a, which));
  const keys = [], names = [];
  for (const a of list) for (const h of a.fleet[which].headers){ const k = ffNorm(h) || h; if (!keys.includes(k)){ keys.push(k); names.push(h); } }
  const rows = [['Account', 'Parent Account', 'Source File', ...names]];
  for (const a of list){ const p = acc(a.parentId); const idx = a.fleet[which].headers.map(h => keys.indexOf(ffNorm(h) || h)); for (const r of a.fleet[which].rows){ const o = new Array(keys.length).fill(''); r.forEach((v, i) => { if (idx[i] >= 0) o[idx[i]] = v; }); rows.push([a.name, p ? p.name : '', a.fleet.source || '', ...o]); } }
  return {rows, n: list.length};
}
const FF_ACC_COLS = [...FF_DEF.filter(d => d[0] === 'bill' || d[0] === 'ship').map(d => [d[2], a => ((d[0] === 'bill' ? a.billAddr : a.ship) || {})[d[1]] || '']),
  ['Number Of Cards', a => (a.card || {}).numCards || ''], ['Company Name (card)', a => (a.card || {}).company || ''], ['Second Line Embossing Option', a => (a.card || {}).emboss || '']];
function ffAccountCols(accts){
  if (!accts.some(ffHas)) return {headers: [], row: () => []};
  const prompts = [...new Set(accts.flatMap(a => ((a.card || {}).prompts || []).map(p => p[0])))];
  return {headers: [...FF_ACC_COLS.map(c => c[0]), ...prompts.map(p => 'Prompt: ' + p), 'Vehicles', 'Drivers', 'Fleet Data File'],
    row: a => [...FF_ACC_COLS.map(c => ({v: c[1](a), t: 's'})), ...prompts.map(p => (((a.card || {}).prompts || []).find(x => x[0] === p) || [])[1] || ''),
      a.fleet && a.fleet.vehicles ? a.fleet.vehicles.rows.length : '', a.fleet && a.fleet.drivers ? a.fleet.drivers.rows.length : '', (a.fleet || {}).source || '']};
}
/* ---- account modal sections ---- */
function ffRow(a, path, label, val){
  const id = 'ff_' + path.replace(/\W/g, '_');
  return '<div class="f"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" data-ff="' + esc(path) + '" value="' + esc(val || '') + '" autocomplete="off"><button class="cp" data-act="copyfield" data-sel="#' + id + '" data-what="' + esc(label) + '">📋</button></div>';
}
const ffAddr = o => [o.attention && 'Attn: ' + o.attention, [o.first, o.last].filter(Boolean).join(' '), o.addr1, o.addr2, [[o.city, o.state].filter(Boolean).join(', '), o.zip].filter(Boolean).join(' ')].filter(Boolean).join('\n');
const ffEmpty = o => !o || Object.values(o).every(v => !String(v ?? '').trim());
function ffSec(title, empty, body, extraHead = '', id = ''){
  if (empty) return '<details class="sec ffsec ffempty"' + (id ? ' id="' + id + '"' : '') + '><summary><b>' + title + '</b> <span class="small muted">— empty in the file (open to fill in)</span></summary><div style="margin-top:8px">' + body + '</div></details>';
  return '<div class="sec ffsec"' + (id ? ' id="' + id + '"' : '') + '><h4>' + title + ' <span class="spacer"></span>' + extraHead + '</h4>' + body + '</div>';
}
function ffInlineTable(a, which){
  const t = ffTable(a, which); const label = which === 'vehicles' ? 'Vehicles' : 'Drivers', icon = which === 'vehicles' ? '🚚' : '🪪';
  const n = t ? t.length - 1 : 0;
  const btns = t ? '<button class="small" data-act="ffcsv" data-id="' + a.id + '" data-v="' + which + '">⬇ ' + label + '.csv</button><button class="small" data-act="ffcopy" data-id="' + a.id + '" data-v="' + which + '">📋 Copy</button><button class="small" data-act="ffview" data-id="' + a.id + '" data-v="' + which + '">⤢ Full view</button>' : '';
  if (!n) return '<div class="fftbl empty small muted">' + icon + ' ' + label + ': none in the file</div>';
  return '<div class="fftbl" id="ff_' + which + '"><div class="row" style="gap:6px;margin-bottom:6px"><b>' + icon + ' ' + label + ' <span class="cnt">' + n + '</span></b><span class="spacer"></span>' + btns + '</div>'
    + '<div class="tblwrap" style="max-height:300px"><table class="t ffinline"><thead><tr>' + t[0].map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>'
    + t.slice(1).map(r => '<tr>' + r.map(v => '<td class="cc" data-act="copy" data-text="' + esc(v) + '" data-what="' + esc(label.toLowerCase().slice(0, -1)) + ' value">' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></div>';
}
function ffSections(a){
  if (!ffHas(a)) return '';
  let h = '';
  if (a.fleet){
    const nv = a.fleet.vehicles ? a.fleet.vehicles.rows.length : 0, nd = a.fleet.drivers ? a.fleet.drivers.rows.length : 0;
    h += '<div class="sec ffsec" id="ffFleet"><h4>🚚 Fleet data <span class="spacer"></span><span class="small muted" style="text-transform:none;letter-spacing:0">' + nv + ' vehicle' + (nv === 1 ? '' : 's') + ' · ' + nd + ' driver' + (nd === 1 ? '' : 's') + '</span></h4>'
      + ffInlineTable(a, 'vehicles') + ffInlineTable(a, 'drivers') + '<div class="small muted" style="margin-top:6px">From ' + esc(a.fleet.source || '') + '</div></div>';
  }
  for (const g of ['bill', 'ship']){
    const key = g === 'bill' ? 'billAddr' : 'ship'; const o = a[key]; if (!o) continue;
    const body = FF_DEF.filter(d => d[0] === g).map(d => ffRow(a, key + '.' + d[1], d[2], o[d[1]])).join('');
    h += ffSec(g === 'bill' ? '🧾 Billing contact & address' : '📦 Card shipping', ffEmpty(o), body, '<button class="small" data-act="copy" data-text="' + esc(ffAddr(o)) + '" data-what="' + (g === 'bill' ? 'billing address' : 'shipping address') + '">📋 Copy address</button>', 'ffsec_' + g);
  }
  if (a.card){
    const body = ffRow(a, 'card.numCards', 'Number Of Cards', a.card.numCards) + ffRow(a, 'card.company', 'Company Name (card)', a.card.company) + ffRow(a, 'card.emboss', 'Second Line Embossing Option', a.card.emboss)
      + (a.card.prompts || []).map((p, i) => ffRow(a, 'card.prompts.' + i, 'Prompt: ' + p[0], p[1])).join('');
    h += ffSec('💳 Card setup', !a.card.numCards && !a.card.company && !a.card.emboss && !(a.card.prompts || []).some(p => p[1]), body, '', 'ffsec_card');
  }
  return h;
}
function ffButtons(a){
  const b = (which, label) => ffTable(a, which) ? '<button class="small" data-act="ffview" data-id="' + a.id + '" data-v="' + which + '">View ' + label + '</button><button class="small" data-act="ffcsv" data-id="' + a.id + '" data-v="' + which + '">⬇ ' + label[0].toUpperCase() + label.slice(1) + '.csv</button><button class="small" data-act="ffcopy" data-id="' + a.id + '" data-v="' + which + '">📋 Copy ' + label + '</button>' : '';
  return '<div class="row" style="gap:6px">' + b('vehicles', 'vehicles') + b('drivers', 'drivers') + '</div>';
}
function ffViewHtml(a, which){
  const t = ffTable(a, which); const label = which === 'vehicles' ? 'Vehicles' : 'Drivers';
  return '<div class="mh"><h3>' + (which === 'vehicles' ? '🚚 ' : '🪪 ') + esc(a.name) + ' — ' + label + '</h3><button class="small" data-act="ffcopy" data-id="' + a.id + '" data-v="' + which + '">Copy as table</button><button class="small" data-act="ffcsv" data-id="' + a.id + '" data-v="' + which + '">⬇ ' + esc(ffCsvName(a, which)) + '</button><button class="small" data-act="ffback" data-id="' + a.id + '">← Account</button><button data-act="close">✕</button></div><div class="mb"><div class="small muted" style="margin-bottom:8px">' + (t.length - 1) + ' rows × ' + t[0].length + ' columns · from ' + esc(a.fleet.source || '') + '</div>'
    + '<div class="tblwrap" style="max-height:62vh"><table class="t" id="ffTbl"><thead><tr>' + t[0].map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + t.slice(1).map(r => '<tr>' + r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></div>';
}
const ffCsvBlob = rows => new Blob(['\uFEFF' + toCSV(rows)], {type: 'text/csv'});
Object.assign(ACT, {
  ffview: el => { const a = acc(el.dataset.id); UI.modal = {kind: 'preview', id: a.id, html: ffViewHtml(a, el.dataset.v)}; renderModal(); },
  ffback: el => openModal('acct', el.dataset.id),
  ffcsv: el => { const a = acc(el.dataset.id); const t = ffTable(a, el.dataset.v); download(ffCsvBlob(t), ffCsvName(a, el.dataset.v)); window.__lastDownload = ffCsvName(a, el.dataset.v); },
  ffcopy: el => { const a = acc(el.dataset.id); copy(toTSV(ffTable(a, el.dataset.v)), el.dataset.v); },
  ffall: async el => { const b = curBiz(); const w = el.dataset.v;
    if (w === 'accounts'){ const {sheets} = await masterSheets(b); download(ffCsvBlob(plainRows(sheets.find(s => s.name === 'Accounts').rows)), 'Master Accounts.csv'); return; }
    const {rows} = ffAll(b, w); download(ffCsvBlob(rows), w === 'vehicles' ? 'All Vehicles.csv' : 'All Drivers.csv'); },
});
const plainRows = rows => rows.map(r => r.map(c => c && typeof c === 'object' ? c.v : c));
document.addEventListener('input', ev => {
  const t = ev.target; if (!t.dataset || !t.dataset.ff || !UI.modal || UI.modal.kind !== 'acct') return;
  const a = acc(UI.modal.id); const p = t.dataset.ff.split('.');
  if (p[0] === 'card' && p[1] === 'prompts'){ a.card.prompts[+p[2]][1] = t.value; }
  else { a[p[0]] = a[p[0]] || {}; a[p[0]][p[1]] = t.value; }
  a.updated = Date.now(); touch(false);
});
document.addEventListener('change', ev => {
  const t = ev.target; if (t.dataset && t.dataset.actChange === 'uptarget' && UI.up){ const s = UI.up.sources.find(x => x.id === t.dataset.v); if (s){ s.target = t.value; render(); } }
});
/* ---- upload preview card ---- */
function ffSourceCard(s, st){
  const F = s.form, f = F.fields, r = (st.fleet || []).find(x => x.id === s.id) || {};
  const nv = F.tables.vehicles ? F.tables.vehicles.rows.length : 0, nd = F.tables.drivers ? F.tables.drivers.rows.length : 0, nc = F.tables.contacts ? F.tables.contacts.rows.length : 0;
  const name = f.card.company || ffFileCompany(s.file);
  const auto = ffMatch(F, s.file);
  const opts = '<option value=""' + (!s.target ? ' selected' : '') + '>Auto: ' + esc(auto ? auto.name : 'new account “' + name + '”') + '</option>'
    + '<option value="new"' + (s.target === 'new' ? ' selected' : '') + '>New top-level account “' + esc(name) + '”</option>'
    + '<optgroup label="New child account under…">' + roots().map(x => '<option value="under:' + x.id + '"' + (s.target === 'under:' + x.id ? ' selected' : '') + '>New child under ' + esc(x.name) + '</option>').join('') + '</optgroup>'
    + '<optgroup label="Attach to an existing account">' + roots().flatMap(x => tree(x.id)).map(x => '<option value="' + x.a.id + '"' + (s.target === x.a.id ? ' selected' : '') + '>' + '\u00a0\u00a0'.repeat(x.depth) + (x.depth ? '└ ' : '') + esc(x.a.name) + '</option>').join('') + '</optgroup>';
  const bname = [f.bill.first, f.bill.last].filter(Boolean).join(' ');
  return '<div class="card upsrc ffsrc" data-src="' + s.id + '"><div class="row"><span style="font-size:20px">🚚</span><div style="min-width:0;flex:1"><b>' + esc(s.file) + '</b><div class="small muted">' + esc(s.format) + ' · <b>Wex Fleet Data form</b> (card order) · ' + F.labels + ' labeled fields</div></div>'
    + '<button class="small danger" data-act="upremove" data-v="' + s.id + '">✕</button></div>'
    + '<div class="row small" style="gap:6px;margin-top:6px">' + [f.card.company && 'Company: <b>' + esc(f.card.company) + '</b>', f.top.opp && 'Opportunity <b>' + esc(f.top.opp) + '</b>', f.card.numCards && esc(f.card.numCards) + ' cards', bname && 'Billing: ' + esc(bname), (f.ship.city || f.ship.state) && 'Ship to ' + esc([f.ship.city, f.ship.state].filter(Boolean).join(', '))].filter(Boolean).map(x => '<span class="chip">' + x + '</span>').join('')
    + '<span class="chip own">🚚 ' + nv + ' vehicles</span><span class="chip own">🪪 ' + nd + ' drivers</span><span class="chip">👤 ' + (nc + (bname ? 1 : 0)) + ' contacts</span></div>'
    + '<div class="row" style="margin-top:8px"><label class="small" for="ffT_' + s.id + '"><b>Attach to</b></label><select id="ffT_' + s.id + '" data-act-change="uptarget" data-v="' + s.id + '" style="max-width:420px">' + opts + '</select>'
    + (r.account ? '<span class="small muted">→ ' + esc(r.account) + (r.isNew ? ' (new)' : '') + '</span>' : '') + '</div></div>';
}
/* ---- "How this file was read": structure only, every value MASKED (safe to paste to support) ---- */
const FF_KNOWN_TEXT = new Set([...Object.keys(FF_LABELS), ...Object.keys(FF_CTX), ...FF_TOK.vehicles, ...FF_TOK.drivers, ...FF_TOK.contacts, 'card control option', 'prompt option', 'acceptance option', 'vin number']);
function ffMask(v){
  const t = ffClean(v); if (!t) return '[empty]';
  if (/^-?[\d,]*\.?\d+$/.test(t)) return '[number ' + t.replace(/\D/g, '').length + ' digits]';
  if (/^\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}/.test(t)) return '[date]';
  if (/@/.test(t)) return '[email]';
  if (/^(yes|no|true|false|y|n)$/i.test(t)) return '[yes/no]';
  return '[text ' + t.length + ']';
}
const ffKeep = (v, inHeader) => { const n = ffNorm(v); if (!n) return false; if (FF_KNOWN_TEXT.has(n) || (FF_LABELS[n])) return true; if (inHeader && ffClean(v).length <= 40 && !/[@\d]/.test(v)) return true; return /[:：]\s*$/.test(ffClean(v)) && ffClean(v).length <= 40 && !/[@\d]/.test(v); };
const colName2 = i => { let s = ''; i++; while (i > 0){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function ffDiagnose(file, res, grid, form, decision){
  const L = [];
  const fname = String(file.name || ''); const ext = (fname.match(/\.[a-z0-9]+$/i) || [''])[0]; const fd = /fleet\s*_?data/i.test(fname);
  L.push('Account Mapper ' + APP_VERSION + ' — file structure (values masked)');
  L.push('File: [name ' + fname.length + ' chars]' + (fd ? ' …FleetData' : '') + ext + ' · ' + file.size + ' bytes · ' + res.format);
  L.push('Sheets/tables: ' + res.sheets.length + ' (' + res.sheets.map(s => s.rows.length + ' rows × ' + Math.max(0, ...s.rows.map(r => r.length)) + ' cols').join('; ') + ')' + (res.grid ? ' · combined HTML grid ' + res.grid.length + ' rows' : ''));
  L.push('Decision: ' + decision);
  L.push('Fleet Data labels recognised: ' + form.distinct + ' distinct (' + form.specific + ' form-specific); tables: ' + (Object.entries(form.tables).map(([k, t]) => k + ' @row ' + t.headerRow + ' [' + t.headers.map(h => ffKeep(h, true) ? h : ffMask(h)).join(' | ') + '] ' + t.rows.length + ' rows').join('; ') || 'none'));
  const f = form.fields;
  L.push('Fields: ' + [['Opportunity', f.top.opp], ...FF_DEF.filter(d => d[0] !== 'top' && d[0] !== 'prompt').map(d => [d[2], f[d[0]][d[1]]])].map(([k, v]) => k + '=' + (v == null ? '(label not found)' : ffMask(v))).join(', '));
  L.push('Prompts: ' + (form.prompts.map(p => p[0] + '=' + ffMask(p[1])).join(', ') || '(none found)'));
  L.push('', 'Grid (first 150 rows; known labels/headers shown, everything else masked):');
  let blank = 0, tableRun = 0;
  for (let r = 0; r < Math.min(grid.length, 150); r++){
    const row = (grid[r] || []).map(ffClean); const info = form.rowsInfo[r] || '';
    if (!row.some(Boolean)){ blank++; continue; }
    if (blank){ L.push('  (' + blank + ' blank row' + (blank > 1 ? 's' : '') + ')'); blank = 0; }
    if (info.startsWith('row:')){ tableRun++; if (tableRun > 4){ if (tableRun === 5) L.push('  … more ' + info.slice(4).replace('+', '') + ' rows …'); continue; } } else tableRun = 0;
    const hdr = info.startsWith('header'), lab = info === 'label', data = info.startsWith('row:');
    // label rows: label cells shown, the cell after each label (its value) masked; data rows: everything masked
    let expectVal = false;
    const shown = row.map((v, i) => {
      if (!v) return null; let keep;
      if (data) keep = false;
      else if (lab){ const isLab = !!ffLabelCell(v, 'ship') && (!expectVal || /[:：]\s*$/.test(v)); if (isLab && ffLabelCell(v, 'ship').inline != null){ expectVal = false; return colName2(i) + '="' + ffClean(v).split(/[:：]/)[0] + ':" + ' + ffMask(ffLabelCell(v, 'ship').inline); } keep = isLab; expectVal = isLab; }
      else keep = ffKeep(v, hdr);
      return colName2(i) + '=' + (keep ? '"' + v + '"' : ffMask(v));
    });
    L.push('  R' + (r + 1) + ' [' + (info || '?') + ']: ' + shown.filter(Boolean).join('  '));
  }
  if (blank) L.push('  (' + blank + ' blank rows)');
  if (grid.length > 150) L.push('  … ' + (grid.length - 150) + ' more rows');
  return L.join('\n');
}
Object.assign(ACT, { upcopydiag: el => { const d = (UI.up.diags || [])[+el.dataset.v]; if (d) copy(d.text, 'file structure (values masked)'); } });
function ffDiagPanel(U){
  if (!U.diags || !U.diags.length) return '';
  return '<details class="card" id="diagPanel"><summary><b>How these files were read</b> <span class="small muted">— structure only, values masked; copy it if something didn’t come through</span></summary>'
    + U.diags.map((d, i) => '<div class="diag"><div class="row"><b>' + esc(d.file) + '</b><span class="small muted">' + esc(d.decision) + '</span><span class="spacer"></span><button class="small" data-act="upcopydiag" data-v="' + i + '">📋 Copy structure</button></div><pre class="diagpre">' + esc(d.text) + '</pre></div>').join('') + '</details>';
}
