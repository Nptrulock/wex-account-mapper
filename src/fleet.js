/* ---------- Wex "Fleet Data" card-order form (<Company>_FleetData.xls) ----------
   A one-sheet FORM, not a report: label/value blocks (col A label, col B value) for the
   opportunity, billing contact/address, card shipping, card setup and prompt flags, plus three
   tables (Name|Phone|Email contacts, vehicles, drivers). Parsed by finding labels and table
   headers (case / colon / whitespace-insensitive), never by fixed row numbers. */
const ffNorm = s => String(s ?? '').replace(/\u00a0/g, ' ').toLowerCase().replace(/\s*[:：]\s*$/, '').replace(/\s*:\s*/g, ' ').replace(/\s+/g, ' ').trim();
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
const FF_LABELS = {}; for (const [g, k, d, al] of FF_DEF) for (const x of al) FF_LABELS[x] = [g, k, d];
const FF_GROUP_LABEL = {bill: 'Billing contact & address', ship: 'Card shipping', card: 'Card setup'};
function ffTableKind(n){
  const ne = n.filter(Boolean), has = p => n.includes(p), starts = p => n.some(x => x.startsWith(p));
  if (ne.length >= 3 && (starts('company vehicle id') || starts('vehicle id')) && (starts('vehicle desc') || starts('vin') || starts('license plate'))) return 'vehicles';
  if (ne.length >= 2 && has('first name') && has('last name')) return 'drivers';
  if (ne.length >= 2 && ne.length <= 5 && has('name') && (has('phone') || has('email'))) return 'contacts';
  return null;
}
function parseFleetForm(rows){
  const R = (rows || []).map(r => (r || []).map(c => String(c ?? '').replace(/\u00a0/g, ' ').trim()));
  const out = {fields: {top: {}, bill: {}, ship: {}, card: {}}, prompts: [], tables: {}, labels: 0};
  let cur = null;
  for (let r = 0; r < R.length; r++){
    const row = R[r], n = row.map(ffNorm);
    const k = ffTableKind(n);
    if (k){ const cols = n.map((x, i) => x ? i : -1).filter(i => i >= 0); cur = out.tables[k] || (out.tables[k] = {headers: cols.map(i => row[i]), cols, rows: [], headerRow: r + 1}); continue; }
    const i = row.findIndex(Boolean); if (i < 0) continue;
    const L = FF_LABELS[n[i]], rest = row.slice(i + 1).filter(Boolean);
    if (L && rest.length <= 1){ cur = null; out.labels++; const [g, key, disp] = L; if (g === 'prompt'){ if (!out.prompts.some(p => p[0] === disp)) out.prompts.push([disp, rest[0] || '']); } else if (!(key in out.fields[g])) out.fields[g][key] = rest[0] || ''; continue; }
    if (cur){ if (FOOTER_RE.test(row[i]) && rest.length === 0) continue; const vals = cur.cols.map(c => row[c] || ''); if (vals.some(Boolean)) cur.rows.push(vals); }
  }
  for (const t of Object.values(out.tables)) delete t.cols;
  return out;
}
function isFleetForm(form){ const f = form.fields; return form.labels >= 5 && ('numCards' in f.card || 'opp' in f.top || 'addr1' in f.ship || form.tables.vehicles || form.tables.drivers); }
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
  const rows = [['Account', 'Account ID', 'Parent Account', 'Parent Account ID', 'Source File', ...names]];
  for (const a of list){ const p = acc(a.parentId); const idx = a.fleet[which].headers.map(h => keys.indexOf(ffNorm(h) || h)); for (const r of a.fleet[which].rows){ const o = new Array(keys.length).fill(''); r.forEach((v, i) => { if (idx[i] >= 0) o[idx[i]] = v; }); rows.push([a.name, a.sfId || '', p ? p.name : '', p ? p.sfId || '' : '', a.fleet.source || '', ...o]); } }
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
function ffSections(a){
  if (!ffHas(a)) return '';
  let h = '';
  for (const g of ['bill', 'ship']){
    const key = g === 'bill' ? 'billAddr' : 'ship'; const o = a[key]; if (!o) continue;
    h += '<div class="sec ffsec"><h4>' + (g === 'bill' ? '🧾 Billing contact & address' : '📦 Card shipping') + ' <span class="spacer"></span><button class="small" data-act="copy" data-text="' + esc(ffAddr(o)) + '" data-what="' + (g === 'bill' ? 'billing address' : 'shipping address') + '">📋 Copy address</button></h4>'
      + FF_DEF.filter(d => d[0] === g).map(d => ffRow(a, key + '.' + d[1], d[2], o[d[1]])).join('') + '</div>';
  }
  if (a.card){
    h += '<div class="sec ffsec"><h4>💳 Card setup</h4>' + ffRow(a, 'card.numCards', 'Number Of Cards', a.card.numCards) + ffRow(a, 'card.company', 'Company Name (card)', a.card.company) + ffRow(a, 'card.emboss', 'Second Line Embossing Option', a.card.emboss)
      + (a.card.prompts || []).map((p, i) => ffRow(a, 'card.prompts.' + i, 'Prompt: ' + p[0], p[1])).join('') + '</div>';
  }
  if (a.fleet){
    const nv = a.fleet.vehicles ? a.fleet.vehicles.rows.length : 0, nd = a.fleet.drivers ? a.fleet.drivers.rows.length : 0;
    h += '<div class="sec ffsec" id="ffFleet"><h4>🚚 Fleet data</h4><div class="small" style="margin-bottom:8px"><b>' + nv + '</b> vehicle' + (nv === 1 ? '' : 's') + ' · <b>' + nd + '</b> driver' + (nd === 1 ? '' : 's') + ' · from <span class="muted">' + esc(a.fleet.source || '') + '</span></div>' + ffButtons(a) + '</div>';
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
