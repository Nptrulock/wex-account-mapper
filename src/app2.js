/* ---------- modals ---------- */
function openModal(kind, id, extra = {}){ if (kind === 'acct' && id) UI.lastAcct = id; UI.modal = {kind, id, ...extra}; renderModal(); }
function closeModal(){
  const m = UI.modal; UI.modal = null;
  if (m && m.kind === 'contact'){ const c = con(m.id); if (c && !c.name && !c.email && !c.phone) WS.contacts = WS.contacts.filter(x => x !== c); }
  $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; touch();
}
function renderModal(){
  const m = $('#modal'); if (!UI.modal){ m.classList.add('hidden'); return; }
  const k = UI.modal.kind; m.classList.remove('hidden'); m.classList.toggle('center', k !== 'acct');
  const html = k === 'acct' ? acctModal(acc(UI.modal.id)) : k === 'contact' ? contactModal(con(UI.modal.id)) : k === 'preview' ? UI.modal.html : '';
  if (html == null){ closeModal(); return; }
  const card = $('#modalCard'); const st = card.scrollTop; card.innerHTML = html; card.scrollTop = st;
}
const fieldRow = (label, key, val, type = 'text', attr = 'data-f') => '<div class="f"><label for="f_' + key + '">' + label + '</label><input id="f_' + key + '" type="' + type + '" ' + attr + '="' + key + '" value="' + esc(val) + '" autocomplete="off"><button class="cp" data-act="copyfield" data-sel="#f_' + key + '" data-what="' + esc(label) + '">📋</button></div>';
function acctModal(a){
  if (!a) return null;
  const root = rootOf(a), own = effMode(a) === 'own', h = creditHolder(a);
  const sub = subtreeIds(a.id);
  const parentOpts = '<option value="">(none — top-level parent business)</option>' + roots().flatMap(r => tree(r.id)).filter(x => !sub.has(x.a.id)).map(x => '<option value="' + x.a.id + '"' + (x.a.id === a.parentId ? ' selected' : '') + '>' + '\u00a0\u00a0'.repeat(x.depth) + esc(x.a.name) + '</option>').join('');
  const {direct, inherited} = contactsOf(a);
  const linkOpts = WS.accounts.filter(x => x !== a && !a.linkedIds.includes(x.id)).sort(byName).map(x => '<option value="' + x.id + '">' + esc(x.name) + '</option>').join('');
  const attachOpts = WS.contacts.filter(c => !c.accountIds.includes(a.id) && c.accountIds.some(id => subtreeIds(root.id).has(id))).map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
  const fl = filesOf(a.id);
  return '<div class="mh"><span class="badge st-' + a.stage + '">' + esc(STAGE[a.stage].short) + '</span><h3>' + esc(a.name || '(unnamed)') + '</h3><button class="small" data-act="copyacct" data-id="' + a.id + '">Copy all</button><button class="small" data-act="copytsv" data-id="' + a.id + '">Copy row</button><button data-act="close" aria-label="Close">✕</button></div><div class="mb">'
    + '<div class="sec"><h4>' + (isRoot(a) ? '🏢 Parent account' : '📍 Child account of ' + esc(acc(a.parentId).name)) + '</h4>'
    + fieldRow('Business name', 'name', a.name) + fieldRow('Case #', 'caseNo', a.caseNo)
    + fieldRow('Opportunity #', 'oppNo', a.oppNo) + fieldRow('Opportunity ID', 'oppId', a.oppId)
    + fieldRow('Rep name', 'repName', a.repName) + fieldRow('Rep email', 'repEmail', a.repEmail, 'email') + '</div>'
    + '<div class="sec"><h4>Stage</h4><div class="stepper">' + STAGES.map(s => '<button class="st-' + s.id + (s.id === a.stage ? ' on' : s.n < STAGE[a.stage].n ? ' done' : '') + '" data-act="setstage" data-v="' + s.id + '">' + s.n + '. ' + s.label + '</button>').join('') + '</div></div>'
    + '<div class="sec"><h4>Billing / credit line</h4>'
    + (isRoot(a) ? '<div class="small muted" style="margin-bottom:8px">This is the parent. Children set to “Billed at parent” roll up to this line.</div>'
      : '<div class="radio-cards"><label class="' + (!own ? 'on' : '') + '" data-act="setbill" data-v="parent"><input type="radio" name="bm"' + (!own ? ' checked' : '') + '><span><b>Billed at parent</b><br><span class="small muted">Rolls up to ' + esc(creditHolder(acc(a.parentId)).name) + '’s credit line</span></span></label><label class="' + (own ? 'on' : '') + '" data-act="setbill" data-v="own"><input type="radio" name="bm"' + (own ? ' checked' : '') + '><span><b>Billed at child</b><br><span class="small muted">Has its own credit line</span></span></label></div><div style="height:8px"></div>')
    + (own ? fieldRow('Credit line limit', 'creditLimit', a.creditLimit) + '<div class="f"><label for="f_billCycle">Billing cycle</label><select id="f_billCycle" data-f="billCycle">' + [...new Set([...BILL_CYCLES, a.billCycle])].map(c => '<option' + (c === a.billCycle ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select><button class="cp" data-act="copyfield" data-sel="#f_billCycle" data-what="Billing cycle">📋</button></div>' + fieldRow('Payment terms', 'terms', a.terms) + fieldRow('Billing contact', 'billContact', a.billContact)
      : '<div class="small">Credit line held by <b>' + esc(h.name) + '</b> (' + (fmtMoney(h.creditLimit) || 'no limit set') + ')</div>') + '</div>'
    + ffSections(a)
    + '<div class="sec"><h4>Contacts <span class="spacer"></span><button class="small" data-act="newcontact" data-id="' + a.id + '" data-level="parent">+ ' + (isRoot(a) ? 'Parent-level' : 'Contact for this + below') + '</button>' + (isRoot(a) ? '' : '<button class="small" data-act="newcontact" data-id="' + a.id + '" data-level="child">+ Child-only</button>') + '</h4>'
    + '<div class="cgrid">' + direct.map(c => contactCard(c, {root})).join('') + inherited.map(x => contactCard(x.c, {inherited: true, from: x.from, root})).join('') + '</div>'
    + (direct.length + inherited.length ? '' : '<div class="small muted">No contacts yet.</div>')
    + (attachOpts ? '<div class="row" style="margin-top:8px"><select id="attachSel" style="max-width:260px">' + attachOpts + '</select><button class="small" data-act="attachcontact" data-id="' + a.id + '">Attach existing contact here</button></div>' : '') + '</div>'
    + '<div class="sec"><h4>Files <span class="spacer"></span><label class="btnlike"><input type="file" multiple data-upload="' + a.id + '" class="hidden"><span class="button small" role="button">⬆ Upload</span></label></h4><div class="filelist">'
    + (fl.map(f => '<div class="fi"><span>' + (f.kind === 'csv' ? '📊' : '📄') + '</span><span class="nm">' + esc(f.name) + '</span><span class="small muted">' + fmtBytes(f.size) + '</span>' + (f.kind === 'csv' ? '<button class="small" data-act="preview" data-id="' + f.id + '">Preview</button>' : '') + '<button class="small" data-act="dlfile" data-id="' + f.id + '">⬇</button><button class="small danger" data-act="delfile" data-id="' + f.id + '">✕</button></div>').join('') || '<div class="small muted">No files.</div>') + '</div></div>'
    + '<div class="sec"><h4>Hierarchy & linked accounts</h4><div class="f"><label for="f_parent">Parent account</label><select id="f_parent" data-act-change="setparent" data-id="' + a.id + '">' + parentOpts + '</select><span></span></div>'
    + '<div class="row small" style="margin:4px 0 8px">Children: ' + (kids(a.id).map(k => '<span class="chip" data-act="open" data-id="' + k.id + '" style="cursor:pointer">' + esc(shortName(k, root)) + '</span>').join(' ') || '<span class="muted">none</span>') + '<button class="small" data-act="addchild" data-id="' + a.id + '">+ Child</button></div>'
    + '<div class="row small">Linked: ' + (a.linkedIds.map(acc).filter(Boolean).map(l => '<span class="chip link"><span data-act="open" data-id="' + l.id + '" style="cursor:pointer">🔗 ' + esc(l.name) + '</span> <a href="#" data-act="unlink" data-id="' + a.id + '" data-v="' + l.id + '" title="Unlink">✕</a></span>').join(' ') || '<span class="muted">none</span>') + '</div>'
    + (linkOpts ? '<div class="row" style="margin-top:6px"><select id="linkSel" style="max-width:280px">' + linkOpts + '</select><button class="small" data-act="link" data-id="' + a.id + '">Link account</button></div><div class="small muted">Link related accounts that are not parent/child (sister companies, other business units).</div>' : '') + '</div>'
    + (a.sfStage || Object.keys(a.extra || {}).length ? '<div class="sec"><h4>From Salesforce exports</h4>' + (a.sfStage ? '<div class="f"><label>Salesforce stage</label><input readonly value="' + esc(a.sfStage) + '"><button class="cp" data-act="copy" data-text="' + esc(a.sfStage) + '" data-what="Salesforce stage">📋</button></div>' : '') + Object.entries(a.extra || {}).map(([k, v]) => '<div class="f"><label>' + esc(k) + '</label><input readonly value="' + esc(v) + '"><button class="cp" data-act="copy" data-text="' + esc(v) + '" data-what="' + esc(k) + '">📋</button></div>').join('') + '</div>' : '')
    + '<div class="sec"><h4>Notes</h4><textarea id="f_notes" data-f="notes" rows="4">' + esc(a.notes) + '</textarea><div class="row" style="margin-top:6px"><button class="small" data-act="copyfield" data-sel="#f_notes" data-what="notes">📋 Copy notes</button></div></div>'
    + '<div class="row"><button class="danger" data-act="delacct" data-id="' + a.id + '">Delete account</button><span class="spacer"></span><button class="primary" data-act="close">Done</button></div></div>';
}
function contactModal(c){
  if (!c) return null;
  const first = acc(c.accountIds[0]); const root = first ? rootOf(first) : curBiz();
  const accts = root ? tree(root.id) : [];
  return '<div class="mh"><h3>Contact: ' + esc(c.name || 'new') + '</h3><button class="small" data-act="copycontact" data-id="' + c.id + '">Copy</button><button data-act="close">✕</button></div><div class="mb">'
    + '<div class="sec">' + CONTACT_FIELDS.map(f => fieldRow(f.label, f.k, c[f.k], f.k === 'email' ? 'email' : f.k === 'phone' ? 'tel' : 'text', 'data-cf')).join('') + '</div>'
    + (Object.keys(c.extra || {}).length ? '<div class="sec"><h4>From Salesforce exports</h4>' + Object.entries(c.extra).map(([k, v]) => '<div class="f"><label>' + esc(k) + '</label><input readonly value="' + esc(v) + '"><button class="cp" data-act="copy" data-text="' + esc(v) + '" data-what="' + esc(k) + '">📋</button></div>').join('') + '</div>' : '')
    + '<div class="sec"><h4>Level</h4><div class="radio-cards"><label class="' + (c.level === 'parent' ? 'on' : '') + '" data-act="setlevel" data-v="parent"><input type="radio" name="lv"' + (c.level === 'parent' ? ' checked' : '') + '><span><b>Parent level</b><br><span class="small muted">Applies to the account(s) checked below and every child under them</span></span></label>'
    + '<label class="' + (c.level === 'child' ? 'on' : '') + '" data-act="setlevel" data-v="child"><input type="radio" name="lv"' + (c.level === 'child' ? ' checked' : '') + '><span><b>Child only</b><br><span class="small muted">Only the checked location(s)</span></span></label></div>'
    + '<div class="small" style="margin:10px 0 4px"><b>Attached to</b></div><div class="checklist">' + accts.map(({a, depth}) => '<label><input type="checkbox" data-act-change="cacct" data-v="' + a.id + '"' + (c.accountIds.includes(a.id) ? ' checked' : '') + '><span style="padding-left:' + depth * 14 + 'px">' + esc(a.name) + '</span></label>').join('') + '</div></div>'
    + '<div class="row"><button class="danger" data-act="delcontact" data-id="' + c.id + '">Delete contact</button><span class="spacer"></span><button class="primary" data-act="close">Done</button></div></div>';
}
async function previewFile(id){
  const f = WS.files.find(x => x.id === id); if (!f) return;
  const text = await Store.getFile(id); const rows = parseCSV(typeof text === 'string' ? text : '');
  const show = rows.slice(0, 201);
  UI.modal = {kind: 'preview', id, html: '<div class="mh"><h3>📊 ' + esc(f.name) + '</h3><button class="small" data-act="copypreview" data-id="' + id + '">Copy as table</button><button class="small" data-act="dlfile" data-id="' + id + '">Download</button><button data-act="close">✕</button></div><div class="mb"><div class="small muted" style="margin-bottom:8px">' + Math.max(0, rows.length - 1) + ' rows × ' + (rows[0] || []).length + ' columns' + (rows.length > 201 ? ' — showing first 200' : '') + ' · on ' + esc((acc(f.accountId) || {}).name || '') + '</div><div class="tblwrap" style="max-height:60vh"><table class="t"><thead><tr>' + (show[0] || []).map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + show.slice(1).map(r => '<tr>' + r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></div>'};
  renderModal();
}

/* ---------- import view ---------- */
function importView(){
  const I = UI.imp || (UI.imp = {step: 1, type: 'accounts', text: '', under: UI.biz || ''});
  const rs = roots();
  let h = uploadView() + '<details class="card" id="pasteBox"' + (UI.pasteOpen || (UI.imp && (UI.imp.step > 1 || UI.imp.result)) ? ' open' : '') + '><summary><b>Or paste rows instead</b> <span class="small muted">(copied from a Salesforce list view or report)</span></summary><div style="height:8px"></div><div class="card"><h3>Paste or import from Salesforce</h3><div class="small muted">Nothing leaves this browser. Paste rows copied from a Salesforce list view/report (with the header row), labeled lines like <span class="kbd">Account Name: …</span>, or choose a report export (.csv). You map the columns once — the mapping is remembered.</div></div>';
  h += '<div class="card"><div class="row"><b>1.</b> What are you importing?<div class="seg" id="impTypes">' + [['accounts', 'Accounts'], ['contacts', 'Contacts'], ['vehicles', '🚚 Vehicles'], ['drivers', '🪪 Drivers']].map(([k, l]) => '<button class="' + (I.type === k ? 'on' : '') + '" data-act="imptype" data-v="' + k + '">' + l + '</button>').join('') + '</div></div>'
    + '<textarea id="impText" rows="8" style="margin-top:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px" placeholder="Paste here (Ctrl/⌘+V)…">' + esc(I.text) + '</textarea>'
    + '<div class="row" style="margin-top:8px"><button class="primary" data-act="impread">Read pasted data</button><span class="muted">or</span><label class="btnlike"><input type="file" id="impFile" accept=".csv,.tsv,.txt,text/csv" class="hidden"><span class="button" role="button">Choose Salesforce report CSV…</span></label>' + (I.fileName ? '<span class="small muted">' + esc(I.fileName) + '</span>' : '') + '</div></div>';
  if (I.step >= 2 && I.table){
    const fl = !!FLEET_TYPES[I.type];
    const targets = fl ? FF_COLS[I.type].map(([k, l]) => ({k, label: l})) : I.type === 'accounts' ? ACC_TARGETS : CON_TARGETS;
    h += '<div class="card maptbl"><h3>2. Match columns to fields <span class="small muted">(' + I.table.rows.length + ' row' + (I.table.rows.length === 1 ? '' : 's') + ' found)</span></h3><div class="tblwrap"><table class="t"><thead><tr><th>Column in your data</th><th>Example</th><th>Goes into</th></tr></thead><tbody>'
      + I.table.headers.map((hd, i) => '<tr><td><b>' + esc(hd) + '</b></td><td class="small muted">' + esc(I.table.rows.slice(0, 2).map(r => r[i]).filter(Boolean).join(' | ').slice(0, 80)) + '</td><td><select data-act-change="impmap" data-v="' + i + '"><option value="">— skip —</option>' + targets.map(t => '<option value="' + t.k + '"' + (I.map[i] === t.k ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select></td></tr>').join('')
      + '</tbody></table></div><div class="row" style="margin-top:10px"><span class="small">' + (fl ? '<b>Add these ' + I.type + ' to account:</b>' : I.type === 'accounts' ? 'New accounts with no parent column go under:' : 'Contacts with no matching account attach to:') + '</span><select id="impUnder" data-act-change="impunder" style="max-width:320px"><option value="">' + (fl ? '— choose an account —' : I.type === 'accounts' ? '(make them top-level businesses)' : '(leave unattached)') + '</option>' + rs.flatMap(r => tree(r.id)).map(x => '<option value="' + x.a.id + '"' + (I.under === x.a.id ? ' selected' : '') + '>' + '\u00a0\u00a0'.repeat(x.depth) + esc(x.a.name) + '</option>').join('') + '</select><span class="spacer"></span><button data-act="impreset">Start over</button><button class="primary" data-act="impplan">Preview import</button></div></div>';
  }
  if (I.step >= 3 && I.plan){
    const c = I.plan.filter(p => p.op === 'create').length, sm = I.plan.filter(p => p.op === 'same').length, u = I.plan.length - c - sm;
    const fa = FLEET_TYPES[I.type] && acc(I.under);
    h += '<div class="card"><h3>3. Review' + (fa ? ' <span class="small muted">→ ' + esc(fa.name) + '</span>' : '') + '</h3><div class="okbar" id="impSummary">' + c + ' new · ' + u + ' update existing' + (FLEET_TYPES[I.type] ? ' · ' + sm + ' already there (not duplicated)' : '') + ' (blank cells never erase what you have)</div><div class="tblwrap" style="max-height:300px"><table class="t"><thead><tr><th>Action</th><th>' + ({accounts: 'Account', contacts: 'Contact', vehicles: 'Vehicle', drivers: 'Driver'})[I.type] + '</th><th>Details</th></tr></thead><tbody>'
      + I.plan.map(p => '<tr><td>' + (p.op === 'create' ? '<span class="badge st-mc">New</span>' : p.op === 'same' ? '<span class="badge">Already there</span>' : '<span class="badge st-impl">Update</span>') + '</td><td>' + esc(p.label) + '</td><td class="small muted">' + esc(Object.entries(p.r).filter(([k]) => k !== 'name').map(([k, v]) => k + ': ' + v).join(' · ').slice(0, 160)) + '</td></tr>').join('')
      + '</tbody></table></div><div class="row" style="margin-top:10px"><span class="spacer"></span><button class="primary" data-act="impgo" id="impGo">Import ' + I.plan.length + ' ' + I.type + (fa ? ' into ' + esc(fa.name) : '') + '</button></div></div>';
  }
  if (I.result) h += '<div class="okbar" id="impResult">✓ Imported' + (I.result.acct ? ' ' + esc(I.result.what) + ' into ' + esc(I.result.acct) : '') + ': ' + I.result.created + ' new, ' + I.result.updated + ' updated' + (I.result.same != null ? ', ' + I.result.same + ' already there' : '') + '.' + (I.result.acctId ? ' <button class="small" data-act="open" data-id="' + I.result.acctId + '">Open account</button>' : '') + (I.result.warnings.length ? '<br>⚠ ' + I.result.warnings.map(esc).join('<br>⚠ ') : '') + ' <button class="small" data-act="tab" data-tab="chart">View chart</button> <button class="small" data-act="impreset">New import</button></div>';
  h += '</details>';
  return h;
}
function impRead(text, fileName){
  const I = UI.imp; I.text = text; I.fileName = fileName || '';
  const src = DataSources.get(fileName ? 'csv' : 'paste');
  const table = src.toTable(text);
  if (!table.headers.length || !table.rows.length){ toast('Could not find a header row and data rows'); return; }
  const w = table.headers.length; table.rows = table.rows.map(r => { const x = r.slice(0, w); while (x.length < w) x.push(''); return x; });
  // auto-detect contacts vs accounts if headers clearly look like contacts
  const hn = table.headers.map(norm);
  const fk = ffListKind(table.headers, fileName);   // Fleet_Drivers_* / Fleet_Vehicles_* exports, or driver / vehicle columns
  if (fk) I.type = fk;
  else if (hn.some(h => /^(first name|last name|email|contact name|full name)$/.test(h)) && !hn.some(h => /^(parent account|case number|opportunity)/.test(h))) I.type = 'contacts';
  else if (FLEET_TYPES[I.type]) I.type = 'accounts';
  I.table = table; I.under = FLEET_TYPES[I.type] ? ((ffDefaultAcct() || {}).id || '') : I.type === 'contacts' ? (UI.biz || '') : ''; I.map = guessMap(I.type, table.headers); I.step = 2; I.plan = null; I.result = null;
  render();
}

/* ---------- sample data (fictional) ---------- */
function loadSample(){
  if (WS.accounts.some(a => /^sample: acme logistics$/i.test(a.name))){ toast('Sample already loaded'); UI.biz = WS.accounts.find(a => /^sample: acme logistics$/i.test(a.name)).id; render(); return; }
  const rep = {repName: 'Sample Rep (Jordan Avery)', repEmail: 'jordan.avery@example.com', repPhone: '555-0100'};
  const p = newAccount({name: 'Sample: Acme Logistics', sfId: '001SMPL00000001AAA', caseNo: '00990001', oppName: 'Sample: Acme Logistics — Fleet Card Rollout', oppNo: 'OPP-90001', oppId: '006SMPL00000001AAA', stage: 'impl', billMode: 'own', creditLimit: '150000', billCycle: 'Weekly', terms: 'Net 14', billContact: 'Sample: Dana Whitfield', notes: 'FICTIONAL SAMPLE DATA for demo only.', ...rep});
  const c1 = newAccount({parentId: p.id, name: 'Sample: Acme Logistics – Grand Rapids Yard', sfId: '001SMPL00000002AAA', caseNo: '00990002', stage: 'mc', billMode: 'parent', ...rep});
  const c2 = newAccount({parentId: p.id, name: 'Sample: Acme Logistics – Detroit Depot', sfId: '001SMPL00000003AAA', caseNo: '00990003', oppNo: 'OPP-90003', stage: 'impl', billMode: 'own', creditLimit: '25000', billCycle: 'Monthly', terms: 'Net 15', billContact: 'Sample: Marcus Lee', ...rep});
  const c3 = newAccount({parentId: p.id, name: 'Sample: Acme Logistics – Toledo Hub', sfId: '001SMPL00000004AAA', caseNo: '00990004', stage: 'app', billMode: 'parent', ...rep});
  const c3a = newAccount({parentId: c3.id, name: 'Sample: Acme Logistics – Toledo Night Fleet', sfId: '001SMPL00000005AAA', stage: 'app', billMode: 'parent', ...rep});
  const s = newAccount({name: 'Sample: Acme Rentals', sfId: '001SMPL00000006AAA', stage: 'mc', billMode: 'own', creditLimit: '40000', billCycle: 'Monthly', terms: 'Net 30', notes: 'FICTIONAL SAMPLE — sister company, linked to Acme Logistics.', ...rep});
  p.linkedIds.push(s.id); s.linkedIds.push(p.id);
  newContact({name: 'Sample: Dana Whitfield', title: 'Fleet Director', email: 'dana.whitfield@example.com', phone: '555-0111', role: 'Decision maker', level: 'parent', accountIds: [p.id]});
  newContact({name: 'Sample: Priya Shah', title: 'Controller', email: 'priya.shah@example.com', phone: '555-0112', role: 'Billing / AP', level: 'parent', accountIds: [p.id]});
  newContact({name: 'Sample: Marcus Lee', title: 'Depot Manager', email: 'marcus.lee@example.com', phone: '555-0113', role: 'Billing contact (Detroit)', level: 'child', accountIds: [c2.id]});
  newContact({name: 'Sample: Rosa Alvarez', title: 'Yard Supervisor', email: 'rosa.alvarez@example.com', phone: '555-0114', role: 'Card administrator', level: 'child', accountIds: [c1.id]});
  newContact({name: 'Sample: Tom Becker', title: 'Ops Lead', email: 'tom.becker@example.com', phone: '555-0115', role: 'Implementation contact', level: 'parent', accountIds: [c3.id]});
  UI.biz = p.id; UI.tab = 'chart'; touch(); toast('Fictional sample loaded');
}

/* ---------- workspace file ---------- */
async function exportWs(){
  const files = [];
  for (const f of WS.files){ const d = await Store.getFile(f.id); if (d == null) continue; files.push(typeof d === 'string' ? {id: f.id, encoding: 'text', data: d} : {id: f.id, encoding: 'base64', data: ab2b64(d)}); }
  let out = {format: WS_FORMAT, version: 1, appVersion: APP_VERSION, exported: new Date().toISOString(), workspace: WS, fileData: files};
  let protectedFile = false;
  if (Vault.meta && Vault.meta.encExport){
    const pass = await Lock.ask({title: 'Protect this export', confirm: true, okLabel: 'Export', note: 'Choose a passcode for this file (it can differ from your app passcode). The rep who opens it will need it — share it separately, not with the file.'});
    if (pass == null){ toast('Export cancelled'); return; }
    toast('Encrypting…'); out = await Lock.sealExport(out, pass); protectedFile = true;
  }
  download(new Blob([JSON.stringify(out, null, protectedFile ? 0 : 1)], {type: 'application/json'}), 'account-mapper-workspace_' + today() + (protectedFile ? '_protected' : '') + '.json');
  toast(protectedFile ? 'Passcode-protected workspace exported' : 'Workspace exported (not passcode-protected) — keep this file private');
}
async function importWs(file){
  let j; try { j = JSON.parse(await file.text()); } catch (e) { toast('That file is not a workspace (.json)'); return; }
  if (j && j.format === WS_FORMAT && j.encrypted){
    let err = '', inner = null;
    for (;;){
      const pass = await Lock.ask({title: 'Open protected workspace', note: 'This file is passcode-protected. Enter the passcode the sender gave you.', error: err, okLabel: 'Open'});
      if (pass == null){ toast('Import cancelled'); return; }
      inner = await Lock.openExport(j, pass); if (inner) break; err = 'Wrong passcode for this file.';
    }
    j = inner;
  }
  if (!j || j.format !== WS_FORMAT || !j.workspace){ toast('That file is not an Account Mapper workspace'); return; }
  const merge = WS.accounts.length ? confirm('Merge this file into what you already have?\n\nOK = merge (matching accounts are kept, new ones added)\nCancel = choose replace') : false;
  if (!merge && WS.accounts.length && !confirm('Replace EVERYTHING in this browser with the file’s contents?')) return;
  const inc = migrate(j.workspace);
  const data = new Map((j.fileData || []).map(f => [f.id, f]));
  const putData = async id => { const f = data.get(id); if (!f) return; await Store.putFile(id, f.encoding === 'base64' ? b642ab(f.data) : f.data); };
  if (!merge){ await Store.clearAll(true); WS = inc; for (const f of WS.files) await putData(f.id); }
  else {
    const have = new Set(WS.accounts.map(a => a.id)); const haveC = new Set(WS.contacts.map(c => c.id)); const haveF = new Set(WS.files.map(f => f.id));
    for (const a of inc.accounts) if (!have.has(a.id)) WS.accounts.push(a);
    for (const c of inc.contacts) if (!haveC.has(c.id)) WS.contacts.push(c);
    for (const f of inc.files) if (!haveF.has(f.id)){ WS.files.push(f); await putData(f.id); }
  }
  UI.biz = null; touch(); toast('Workspace loaded');
}

/* ---------- actions ---------- */
const ACT = {
  biz: el => { UI.biz = el.dataset.id; if (UI.tab === 'import') UI.tab = 'chart'; render(); window.scrollTo(0, 0); },
  tab: el => { UI.tab = el.dataset.tab; if (UI.modal) closeModal(); else render(); },
  stage: el => { UI.stage = el.dataset.v; render(); },
  layout: el => { UI.layout = el.dataset.v; render(); },
  scope: el => { UI.scope = el.dataset.v; render(); },
  open: el => openModal('acct', el.dataset.id),
  goto: el => { const a = acc(el.dataset.id); if (!a) return; UI.biz = rootOf(a).id; render(); openModal('acct', a.id); },
  close: () => closeModal(),
  newbiz: () => { const a = newAccount({name: 'New business', billMode: 'own'}); UI.biz = a.id; if (UI.tab === 'import') UI.tab = 'chart'; touch(); openModal('acct', a.id); setTimeout(() => { const i = $('#f_name'); if (i){ i.focus(); i.select(); } }, 30); },
  addchild: el => { const p = acc(el.dataset.id); const a = newAccount({parentId: p.id, name: (rootOf(p).name || 'Business') + ' – New location', billMode: 'parent', repName: p.repName, repEmail: p.repEmail, repPhone: p.repPhone}); touch(); openModal('acct', a.id); setTimeout(() => { const i = $('#f_name'); if (i){ i.focus(); i.select(); } }, 30); },
  copy: el => copy(el.dataset.text, el.dataset.what),
  copyfield: el => { const i = $(el.dataset.sel); copy(i ? i.value : '', el.dataset.what); },
  copyacct: el => copy(acctLabeled(acc(el.dataset.id)), 'account'),
  copytsv: el => copy(acctTSV(acc(el.dataset.id)), 'row (tab-separated)'),
  copybiz: el => { const b = acc(el.dataset.id); const s = bizStats(b); copy([b.name + ' — business summary', 'Accounts: ' + s.n + ' (' + STAGES.map(x => x.label + ' ' + s.counts[x.id]).join(', ') + ')', 'Credit exposure: ' + (fmtMoney(s.exposure) || '$0') + ' across ' + s.own + ' own line(s); ' + s.up + ' billed at parent', '', ...tree(b.id).map(({a, depth}) => '  '.repeat(depth) + (depth ? '└ ' : '') + a.name + ' — ' + stageLabel(a.stage) + ' — ' + modeLabel(a) + (effMode(a) === 'own' && a.creditLimit ? ' ' + fmtMoney(a.creditLimit) : ''))].join('\n'), 'business summary'); },
  copytable: () => copy(toTSV(tableMatrix(curBiz())), 'table'),
  csvtable: () => download(new Blob(['\uFEFF' + toCSV(tableMatrix(curBiz()))], {type: 'text/csv'}), safeFile(curBiz().name) + '_accounts_' + today() + '.csv'),
  copycontact: el => copy(contactLabeled(con(el.dataset.id)), 'contact'),
  copycontacttsv: el => copy(contactTSV(con(el.dataset.id)), 'contact row'),
  copycontacts: () => { const ids = subtreeIds(curBiz().id); const cs = WS.contacts.filter(c => c.accountIds.some(i => ids.has(i))); const rows = cs.map(contactPairs); copy(toTSV([rows[0] ? rows[0].map(x => x[0]) : []].concat(rows.map(r => r.map(x => x[1])))), 'contacts'); },
  copybilling: () => copy(toTSV(billingMatrix(curBiz())), 'billing table'),
  setstage: el => { const a = acc(UI.modal.id); a.stage = el.dataset.v; a.updated = Date.now(); touch(); renderModal(); },
  setbill: (el, ev) => { ev.preventDefault(); const a = acc(UI.modal.id); a.billMode = el.dataset.v; touch(); renderModal(); },
  setlevel: (el, ev) => { ev.preventDefault(); const c = con(UI.modal.id); c.level = el.dataset.v; touch(); renderModal(); },
  newcontact: el => { const a = acc(el.dataset.id); const c = newContact({level: el.dataset.level || (isRoot(a) ? 'parent' : 'child'), accountIds: [a.id]}); UI.backTo = UI.modal && UI.modal.kind === 'acct' ? UI.modal.id : null; openModal('contact', c.id); setTimeout(() => { const i = $('#f_name'); if (i) i.focus(); }, 30); },
  editcontact: el => { UI.backTo = UI.modal && UI.modal.kind === 'acct' ? UI.modal.id : null; openModal('contact', el.dataset.id); },
  attachcontact: el => { const c = con($('#attachSel').value); if (c){ c.accountIds.push(el.dataset.id); touch(); renderModal(); } },
  delcontact: el => { if (!confirm('Delete this contact?')) return; WS.contacts = WS.contacts.filter(c => c.id !== el.dataset.id); UI.modal = null; touch(); backOrClose(); },
  link: el => { const a = acc(el.dataset.id), b = acc($('#linkSel').value); if (!b) return; if (!a.linkedIds.includes(b.id)) a.linkedIds.push(b.id); if (!b.linkedIds.includes(a.id)) b.linkedIds.push(a.id); touch(); renderModal(); },
  unlink: (el, ev) => { ev.preventDefault(); const a = acc(el.dataset.id), b = acc(el.dataset.v); a.linkedIds = a.linkedIds.filter(x => x !== b.id); if (b) b.linkedIds = b.linkedIds.filter(x => x !== a.id); touch(); renderModal(); },
  delacct: el => {
    const a = acc(el.dataset.id); const ks = kids(a.id); const p = acc(a.parentId);
    if (!confirm('Delete "' + a.name + '"?' + (ks.length ? '\n\nIts ' + ks.length + ' child account(s) will move up to ' + (p ? p.name : 'become top-level businesses') + '.' : '') + '\nIts files are removed from this browser.')) return;
    for (const k of ks){ k.parentId = a.parentId || null; if (!k.parentId) k.billMode = 'own'; }
    for (const f of filesOf(a.id)) Store.delFile(f.id).catch(() => {});
    WS.files = WS.files.filter(f => f.accountId !== a.id);
    for (const c of WS.contacts) c.accountIds = c.accountIds.filter(x => x !== a.id);
    for (const x of WS.accounts) x.linkedIds = x.linkedIds.filter(i => i !== a.id);
    WS.accounts = WS.accounts.filter(x => x !== a);
    if (UI.biz === a.id) UI.biz = p ? rootOf(p).id : (ks[0] ? ks[0].id : null);
    UI.modal = null; $('#modal').classList.add('hidden'); touch();
  },
  preview: el => previewFile(el.dataset.id),
  copypreview: async el => { const t = await Store.getFile(el.dataset.id); copy(toTSV(parseCSV(t)), 'table'); },
  dlfile: async el => { const f = WS.files.find(x => x.id === el.dataset.id); const d = await Store.getFile(f.id); download(new Blob([d], {type: f.mime || (f.kind === 'csv' ? 'text/csv' : 'application/octet-stream')}), f.name); },
  delfile: async el => { const f = WS.files.find(x => x.id === el.dataset.id); if (!f || !confirm('Remove "' + f.name + '" from this account?')) return; await Store.delFile(f.id); WS.files = WS.files.filter(x => x !== f); touch(); renderModal(); },
  buildxlsx: async () => { try { await buildMasterXlsx(curBiz()); } catch (e) { console.warn(e); toast('Could not build the file: ' + e.message); } },
  buildzip: async () => { try { await buildMasterZip(curBiz()); } catch (e) { console.warn(e); toast('Could not build the zip: ' + e.message); } },
  imptype: el => { UI.imp.type = el.dataset.v; UI.imp.under = FLEET_TYPES[el.dataset.v] ? ((ffDefaultAcct() || {}).id || '') : el.dataset.v === 'contacts' ? (UI.biz || '') : ''; if (UI.imp.table){ UI.imp.map = guessMap(UI.imp.type, UI.imp.table.headers); UI.imp.step = 2; UI.imp.plan = null; } render(); },
  impread: () => { const t = $('#impText').value; if (!t.trim()){ toast('Paste something first'); return; } impRead(t, ''); },
  impplan: () => { const I = UI.imp; rememberMap(I.type, I.table.headers, I.map);
    if (FLEET_TYPES[I.type]){ const a = acc(I.under); if (!a){ toast('Choose the account these ' + I.type + ' belong to'); return; }
      const cols = I.map.map((k, i) => k ? i : -1).filter(i => i >= 0); if (!cols.length){ toast('Match at least one column'); return; }
      const headers = cols.map(i => FF_COL_LABEL[I.type][I.map[i]]), rows = I.table.rows.map(r => cols.map(i => String(r[i] ?? '').trim())).filter(r => r.some(Boolean));
      I.fleetRows = {headers, rows}; I.plan = ffPlanMerge(a.id, I.type, headers, rows).ops; I.step = 3; touch(); return; } const recs = recordsFrom(I.type, I.table, I.map); if (!recs.length){ toast(I.type === 'accounts' ? 'Map a column to Business Name or Salesforce Account ID' : 'Map a column to Name or Email'); return; } I.recs = recs; I.plan = planImport(I.type, recs); I.step = 3; touch(); },
  impgo: () => { const I = UI.imp;
    if (FLEET_TYPES[I.type]){ const a = acc(I.under); const r = ffMergeTable(a, I.type, I.fleetRows.headers, I.fleetRows.rows); ffAddSource(a, I.fileName || 'Pasted ' + I.type); a.updated = Date.now();
      I.result = {created: r.added, updated: r.updated, same: r.same, warnings: [], acct: a.name, acctId: a.id, what: I.type}; UI.lastAcct = a.id; UI.biz = rootOf(a).id;
      I.step = 1; I.plan = null; I.table = null; I.text = ''; I.fileName = ''; I.fleetRows = null; touch(); toast('Imported ' + (r.added + r.updated) + ' ' + I.type + ' into ' + a.name); return; }
    const res = applyImport(I.type, I.recs, {under: I.under}); I.result = res; I.step = 1; I.plan = null; I.table = null; I.text = ''; I.fileName = '';
    if (I.type === 'accounts'){ const last = WS.accounts[WS.accounts.length - 1]; if (!UI.biz && last) UI.biz = rootOf(last).id; } touch(); toast('Imported ' + (res.created + res.updated)); },
  impreset: () => { UI.imp = null; render(); },
  loadsample: () => { UI.menu = false; renderMenu(); loadSample(); },
  exportws: () => { UI.menu = false; renderMenu(); exportWs(); },
  importws: () => { UI.menu = false; renderMenu(); $('#fileWs').click(); },
  menu: () => { UI.menu = !UI.menu; renderMenu(); },
  clearall: async () => { UI.menu = false; renderMenu(); if (!confirm('Erase ALL accounts, contacts and files from this browser?\n\nExport a workspace file first if you want a backup.')) return; await Store.clearAll(true); WS = blankWs(); UI.biz = null; UI.modal = null; $('#modal').classList.add('hidden'); UI.imp = null; touch(); toast('Everything erased from this browser'); },
  settings: () => { UI.menu = false; renderMenu(); UI.modal = {kind: 'preview', html: Lock.settingsHtml()}; renderModal(); },
  locknow: () => Lock.lockNow(),
  changepass: () => Lock.changePass(),
  about: () => { UI.menu = false; renderMenu(); UI.modal = {kind: 'preview', html: '<div class="mh"><h3>About Account Mapper</h3><button data-act="close">✕</button></div><div class="mb"><p><b>🔒 Your data stays in this browser. Nothing is uploaded.</b></p><p>The page has a strict Content-Security-Policy: no analytics, fonts or CDNs, and the app can\'t contact any address at all. Accounts, contacts and files are saved in this browser\'s storage on this device only, encrypted (AES-GCM) with a key made from your passcode.</p><p>' + esc(LOCK_NOTE) + ' Clearing site data erases them, so export a workspace file as a backup.</p><p>Salesforce data comes in only through report exports you upload (or paste). The files are read inside this browser; the app has no connection to Salesforce or anywhere else.</p><p>To hand a business to another rep, use <b>Export workspace</b> and send the .json file through an approved, internal channel. They use <b>Open workspace file</b>.</p><p class="small muted">Version ' + APP_VERSION + ' · storage: ' + (Store.mode === 'idb' ? 'IndexedDB' : 'localStorage (limited)') + '</p></div>'}; renderModal(); },
};
function backOrClose(){ const back = UI.backTo; UI.backTo = null; if (back && acc(back)) openModal('acct', back); else { UI.modal = null; renderModal(); } }
function renderMenu(){ $('#menuPop').classList.toggle('hidden', !UI.menu); }

/* ---------- events ---------- */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el){ if (UI.menu && !ev.target.closest('.menu')){ UI.menu = false; renderMenu(); } if (ev.target.id === 'modal') closeOrBack(); return; }
  const f = ACT[el.dataset.act]; if (!f) return;
  if (el.tagName === 'A') ev.preventDefault();
  ev.stopPropagation();
  if (el.dataset.act === 'close'){ closeOrBack(); return; }
  f(el, ev);
});
function closeOrBack(){ if (UI.modal && UI.modal.kind === 'contact' && UI.backTo){ const c = con(UI.modal.id); if (c && !c.name && !c.email && !c.phone) WS.contacts = WS.contacts.filter(x => x !== c); touch(); backOrClose(); } else closeModal(); }
let bgTimer = null;
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'q' || t.id === 'q2'){ UI.q = t.value; const id = t.id, pos = t.selectionStart; render(); const n = $('#' + id); if (n){ n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } return; }
  if (t.id === 'impText' && UI.imp){ UI.imp.text = t.value; return; }
  if (t.dataset.f && UI.modal && UI.modal.kind === 'acct'){ const a = acc(UI.modal.id); a[t.dataset.f] = t.value; a.updated = Date.now(); if (t.dataset.f === 'name') $('.mh h3').textContent = t.value || '(unnamed)'; touch(false); clearTimeout(bgTimer); bgTimer = setTimeout(render, 300); }
  if (t.dataset.cf && UI.modal && UI.modal.kind === 'contact'){ const c = con(UI.modal.id); c[t.dataset.cf] = t.value; touch(false); clearTimeout(bgTimer); bgTimer = setTimeout(render, 300); }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.upload){ if (t.files.length) await addFiles(t.dataset.upload, t.files); t.value = ''; renderModal(); return; }
  if (t.id === 'fileWs'){ if (t.files[0]) await importWs(t.files[0]); t.value = ''; return; }
  if (t.id === 'impFile'){ const f = t.files[0]; if (f) impRead(await f.text(), f.name); t.value = ''; return; }
  if (t.dataset.f === 'billCycle' && UI.modal){ const a = acc(UI.modal.id); a.billCycle = t.value; touch(); return; }
  const a = t.dataset.actChange; if (!a) return;
  if (a === 'autolock'){ Vault.meta.autoLockMin = +t.value; await Lock.saveMeta(Vault.meta); toast('Auto-lock after ' + t.value + ' min'); return; }
  if (a === 'encexport'){ Vault.meta.encExport = t.checked; await Lock.saveMeta(Vault.meta); toast(t.checked ? 'Exports will be passcode-protected' : 'Exports will NOT be passcode-protected'); return; }
  if (a === 'bizsel'){ UI.biz = t.value; render(); }
  if (a === 'setparent'){ const x = acc(t.dataset.id); const np = t.value || null; if (np && subtreeIds(x.id).has(np)){ toast('Can’t move an account under its own child'); renderModal(); return; } x.parentId = np; if (!np) x.billMode = 'own'; UI.biz = rootOf(x).id; touch(); renderModal(); }
  if (a === 'cacct'){ const c = con(UI.modal.id); const id = t.dataset.v; if (t.checked){ if (!c.accountIds.includes(id)) c.accountIds.push(id); } else c.accountIds = c.accountIds.filter(x => x !== id); touch(); }
  if (a === 'impmap'){ UI.imp.map[+t.dataset.v] = t.value; }
  if (a === 'impunder'){ UI.imp.under = t.value; }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && UI.modal) closeOrBack(); });

/* ---------- boot ---------- */
async function boot(){
  await Store.open();
  if (Store.mode !== 'idb') $('#storeWarn').classList.remove('hidden');
  Vault.meta = await Lock.loadMeta();
  if (!Vault.meta){ const legacy = await Store.rawGet('kv', 'ws'); Lock.legacy = !!(legacy && !legacy.enc && legacy.accounts && legacy.accounts.length); }
  Lock.show(Vault.meta ? 'unlock' : 'setup');
  Lock.start();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__ready = true;
}
boot();
