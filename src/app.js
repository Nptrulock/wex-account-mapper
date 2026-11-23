/* ===================== UI ===================== */
const UI = {biz: null, tab: 'chart', layout: 'org', stage: 'all', q: '', scope: 'biz', imp: null, menu: false, modal: null};
let saveTimer = null;
function setSave(t){ const el = $('#saveState'); if (el) el.textContent = t; }
function touch(redraw = true){
  if (!WS || !Vault.key) return;
  WS.updated = Date.now(); setSave('Saving…'); clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { try { await Store.putWs(WS); setSave(Store.mode === 'idb' ? 'Saved in this browser ✓' : 'Saved (limited storage) ✓'); } catch (e) { setSave('Save failed — export a backup'); console.warn(e); } }, 250);
  if (redraw) render();
}
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800); }
async function copy(text, what){
  text = String(text ?? '');
  let ok = false; window.__lastCopy = text;
  try { if (navigator.clipboard && window.isSecureContext){ await Promise.race([navigator.clipboard.writeText(text), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))]); ok = true; } } catch (e) { ok = false; }
  if (!ok){ const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); }
  toast(ok ? 'Copied' + (what ? ' ' + what : '') : 'Copy blocked by browser — select and copy manually');
}
function download(blob, name){ const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
const cpBtn = (text, what) => '<button class="cp" title="Copy" data-act="copy" data-text="' + esc(text) + '" data-what="' + esc(what || '') + '">📋</button>';
const stageBadge = s => '<span class="badge st-' + s + '">' + esc(stageLabel(s)) + '</span>';
const steps = s => '<span class="steps">' + STAGES.map(x => '<i class="' + (x.n <= STAGE[s].n ? 'on' : '') + '"></i>').join('') + '</span>';
const isSample = a => /^sample\b/i.test(a.name || '');

function curBiz(){ let b = UI.biz && acc(UI.biz); if (!b || !isRoot(b)){ b = roots()[0] || null; UI.biz = b ? b.id : null; } return b; }

/* ---------- render ---------- */
function render(){ if (!WS || Lock.locked) return; renderSide(); renderMain(); }
function renderSide(){
  const rs = roots(); const b = curBiz();
  const q = UI.q.toLowerCase();
  const list = rs.filter(r => !q || tree(r.id).some(x => acctMatches(x.a, q)));
  const item = r => { const s = bizStats(r); return '<button class="biz' + (b && r.id === b.id ? ' sel' : '') + '" data-act="biz" data-id="' + r.id + '"><span class="bn">' + esc(r.name || '(unnamed)') + '</span><span class="bm">' + s.n + ' account' + (s.n === 1 ? '' : 's') + ' · ' + s.pct + '% through stages</span><span class="stagebar">' + STAGES.map(x => '<i class="s-' + x.id + '" style="width:' + (s.n ? s.counts[x.id] / s.n * 100 : 0) + '%"></i>').join('') + '</span></button>'; };
  $('#side').innerHTML = '<input type="search" id="q" placeholder="Search name, ID, case, rep, contact…" value="' + esc(UI.q) + '">'
    + '<div class="side-h">Businesses (' + rs.length + ')</div>' + (list.map(item).join('') || '<div class="muted small" style="padding:6px">No matches</div>')
    + '<button class="primary" style="width:100%;margin-top:8px" data-act="newbiz">+ New business</button>'
    + '<div class="side-h">Privacy</div><div class="small muted" style="padding:0 4px">🔒 <b>Your data stays in this browser. Nothing is uploaded.</b> To share a business with another rep, use <i>Export workspace</i> and send them the .json file through an approved channel.</div>';
  const mb = $('#mobileBiz');
  mb.innerHTML = '<select data-act-change="bizsel" style="flex:1">' + rs.map(r => '<option value="' + r.id + '"' + (b && r.id === b.id ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select><button data-act="newbiz">+ Business</button>';
}
function renderMain(){
  const m = $('#main'); const b = curBiz();
  if (UI.tab === 'import'){ m.innerHTML = (b ? bizHeader(b) : '') + tabsHtml() + importView(); return; }
  if (!b){
    m.innerHTML = '<div class="empty"><h2>Map a business: parent, child locations, contacts, billing</h2><p>Upload your Salesforce report exports (accounts, contacts, opportunities, cases, billing) and the map builds itself — or start a business by hand, or load the fictional sample to look around.</p><div class="row" style="justify-content:center"><button class="primary" data-act="upload">⬆ Upload Salesforce exports</button><button data-act="newbiz">+ New business</button><button data-act="loadsample">Load sample (fictional)</button><button data-act="importws">Open workspace file</button></div><p class="small" style="margin-top:22px">🔒 Your data stays in this browser. Nothing is uploaded.</p></div>';
    return;
  }
  const views = {chart: chartView, table: tableView, contacts: contactsView, billing: billingView, files: filesView};
  m.innerHTML = bizHeader(b) + tabsHtml() + (views[UI.tab] || chartView)(b);
}
function tabsHtml(){
  const t = [['chart', 'Chart'], ['table', 'Table'], ['contacts', 'Contacts'], ['billing', 'Billing / credit'], ['files', 'Files & master file'], ['import', '⬆ Upload Salesforce exports']];
  return '<div class="tabs">' + t.map(([k, l]) => '<button class="tab' + (UI.tab === k ? ' on' : '') + '" data-act="tab" data-tab="' + k + '">' + l + '</button>').join('') + '</div>';
}
function bizHeader(b){
  const s = bizStats(b);
  const names = st => tree(b.id).filter(x => x.a.stage === st).map(x => shortName(x.a, b));
  return '<div class="bizhead"><div class="row"><h2>' + esc(b.name || '(unnamed)') + '</h2>' + (isSample(b) ? '<span class="badge sample">Fictional sample</span>' : '') + '<span class="spacer"></span>'
    + '<button data-act="open" data-id="' + b.id + '">Open parent</button><button data-act="copybiz" data-id="' + b.id + '">Copy business summary</button><button class="primary" data-act="buildzip" title="Master .xlsx + Master Accounts / All Vehicles / All Drivers CSVs + each account’s Vehicles and Drivers CSVs, in one .zip">⬇ Master list (one click)</button></div>'
    + '<div class="muted small">' + (b.repName ? 'Rep ' + esc(b.repName) + ' · ' : '') + s.n + ' accounts in this business</div>'
    + '<div class="pipeline">' + STAGES.map(x => { const n = names(x.id); return '<div class="pipe st-' + x.id + '"><div class="row"><b>' + x.n + '. ' + x.label + '</b></div><div class="n">' + s.counts[x.id] + '</div><div class="small" title="' + esc(n.join(', ')) + '">' + esc(n.slice(0, 3).join(', ')) + (n.length > 3 ? ' +' + (n.length - 3) + ' more' : '') + '</div></div>'; }).join('') + '</div>'
    + '<div class="overview">'
    + '<div class="stat"><div class="k">Overall progress</div><div class="v">' + s.pct + '%</div><div class="stagebar">' + STAGES.map(x => '<i class="s-' + x.id + '" style="width:' + (s.counts[x.id] / s.n * 100) + '%"></i>').join('') + '</div></div>'
    + '<div class="stat"><div class="k">Credit exposure</div><div class="v">' + (fmtMoney(s.exposure) || '$0') + '</div><div class="d">' + s.own + ' own line' + (s.own === 1 ? '' : 's') + ' · ' + s.up + ' roll up to parent' + (s.missing ? ' · <b style="color:#b45309">' + s.missing + ' missing limit</b>' : '') + '</div></div>'
    + '<div class="stat"><div class="k">Contacts</div><div class="v">' + (s.parentContacts + s.childContacts) + '</div><div class="d">' + s.parentContacts + ' parent-level · ' + s.childContacts + ' child-only</div></div>'
    + (() => { const fa = tree(b.id).map(x => x.a).filter(a => a.fleet); if (!fa.length) return ''; const v = fa.reduce((n, a) => n + (a.fleet.vehicles ? a.fleet.vehicles.rows.length : 0), 0), d = fa.reduce((n, a) => n + (a.fleet.drivers ? a.fleet.drivers.rows.length : 0), 0); return '<div class="stat"><div class="k">Fleet data</div><div class="v">' + v + ' <span class="small">vehicles</span></div><div class="d">' + d + ' drivers · ' + fa.length + ' Fleet Data form' + (fa.length === 1 ? '' : 's') + '</div></div>'; })()
    + '<div class="stat"><div class="k">Files</div><div class="v">' + s.files + '</div><div class="d">' + s.csv + ' CSV fleet file' + (s.csv === 1 ? '' : 's') + '</div></div>'
    + '</div></div>';
}
function filterBar(extra = ''){
  return '<div class="toolbar"><input type="search" id="q2" placeholder="Filter…" value="' + esc(UI.q) + '"><div class="seg">'
    + [['all', 'All stages']].concat(STAGES.map(s => [s.id, s.short])).map(([k, l]) => '<button class="' + (UI.stage === k ? 'on' : '') + '" data-act="stage" data-v="' + k + '">' + l + '</button>').join('') + '</div>' + extra + '</div>';
}
const passes = a => (UI.stage === 'all' || a.stage === UI.stage) && acctMatches(a, UI.q);

/* ---------- chart ---------- */
function nodeHtml(a, root){
  const {direct, inherited} = contactsOf(a);
  const pc = direct.filter(c => c.level === 'parent').length, cc = direct.filter(c => c.level === 'child').length;
  const fl = filesOf(a.id).length; const own = effMode(a) === 'own';
  const h = creditHolder(a);
  const dim = !passes(a), hit = UI.q && acctMatches(a, UI.q);
  const linked = a.linkedIds.map(acc).filter(Boolean);
  return '<div class="node st-' + a.stage + (a === root ? ' root' : '') + (dim ? ' dim' : '') + (hit ? ' hit' : '') + '" data-act="open" data-id="' + a.id + '" data-name="' + esc(a.name) + '">'
    + '<div class="node-top"><span class="lvl-tag">' + (a === root ? 'Parent' : 'Child · L' + ancestors(a).length) + '</span>' + steps(a.stage) + '</div>'
    + '<div class="node-name">' + esc(a.name || '(unnamed)') + '</div>'
    + '<div class="node-meta">' + [a.caseNo && 'Case ' + esc(a.caseNo), a.oppNo && 'Opp ' + esc(a.oppNo)].filter(Boolean).join(' · ') + '</div>'
    + '<div style="margin-top:6px">' + stageBadge(a.stage) + '</div>'
    + '<div class="node-chips">' + (own ? '<span class="chip own">💳 ' + (a === root ? 'Parent line ' : 'Own line ') + (fmtMoney(a.creditLimit) || '(no limit set)') + '</span>' : '<span class="chip up" title="Billed through ' + esc(h.name) + '">↑ Billed at parent</span>')
    + (pc ? '<span class="chip" style="background:#e0e7ff;color:#3730a3">👤 ' + pc + ' parent-level</span>' : '') + (cc ? '<span class="chip" style="background:#fce7f3;color:#9d174d">👤 ' + cc + ' child-only</span>' : '')
    + (inherited.length ? '<span class="chip" style="border:1px dashed #94a3b8">⤵ ' + inherited.length + ' inherited</span>' : '') + (fl ? '<span class="chip">📎 ' + fl + '</span>' : '') + (a.fleet ? '<span class="chip own" title="Fleet Data form">🚚 ' + (a.fleet.vehicles ? a.fleet.vehicles.rows.length : 0) + ' · 🪪 ' + (a.fleet.drivers ? a.fleet.drivers.rows.length : 0) + '</span>' : '')
    + (a.repName ? '<span class="chip">Rep ' + esc(a.repName) + '</span>' : '')
    + linked.map(l => '<span class="chip link" data-act="goto" data-id="' + l.id + '" title="Linked account">🔗 ' + esc(l.name) + '</span>').join('') + '</div>'
    + '<div class="node-actions"><button class="small" data-act="addchild" data-id="' + a.id + '">+ Child</button><button class="small" data-act="copyacct" data-id="' + a.id + '">Copy</button><button class="small" data-act="copytsv" data-id="' + a.id + '">Copy row</button></div></div>';
}
function treeHtml(a, root){ const ks = kids(a.id); return '<li>' + nodeHtml(a, root) + (ks.length ? '<ul>' + ks.map(k => treeHtml(k, root)).join('') + '</ul>' : '') + '</li>'; }
function chartView(b){
  const seg = '<div class="seg"><button class="' + (UI.layout === 'org' ? 'on' : '') + '" data-act="layout" data-v="org">Org chart</button><button class="' + (UI.layout === 'list' ? 'on' : '') + '" data-act="layout" data-v="list">Outline</button></div>';
  return filterBar(seg + '<span class="spacer"></span><button data-act="addchild" data-id="' + b.id + '">+ Child account</button>')
    + '<div class="legend">' + STAGES.map(s => '<span><i class="sw" style="background:var(--st-' + s.id + ')"></i>' + s.label + '</span>').join('') + '<span>💳 own credit line</span><span>↑ billed at parent</span><span>⤵ inherited parent-level contacts</span><span>🔗 linked account</span></div>'
    + '<div class="chartwrap"><div class="' + (UI.layout === 'org' ? 'tree' : 'outline') + '" id="tree"><ul>' + treeHtml(b, b) + '</ul></div></div>'
    + '<p class="small muted">Tap a card to open it and edit. Every field has a 📋 copy button. Use Outline for businesses with many locations.</p>';
}

/* ---------- table ---------- */
function tableRows(b){
  const list = UI.scope === 'all' ? roots().flatMap(r => tree(r.id)) : tree(b.id);
  return list.filter(x => passes(x.a));
}
const TABLE_COLS = [
  ['Account', x => x.a.name], ['Parent', x => (acc(x.a.parentId) || {}).name || '—'], ['Case #', x => x.a.caseNo],
  ['Opportunity #', x => x.a.oppNo], ['Opp ID', x => x.a.oppId], ['Rep', x => x.a.repName], ['Rep Email', x => x.a.repEmail],
  ['Stage', x => stageLabel(x.a.stage)], ['Billing', x => modeLabel(x.a)], ['Credit Limit', x => effMode(x.a) === 'own' ? fmtMoney(x.a.creditLimit) : ''], ['Credit Line Held By', x => creditHolder(x.a).name],
  ['Contacts', x => contactsOf(x.a).direct.map(c => c.name).join('; ')]];
function tableView(b){
  const rows = tableRows(b);
  const scope = '<div class="seg"><button class="' + (UI.scope === 'biz' ? 'on' : '') + '" data-act="scope" data-v="biz">This business</button><button class="' + (UI.scope === 'all' ? 'on' : '') + '" data-act="scope" data-v="all">All businesses</button></div>';
  return filterBar(scope + '<span class="spacer"></span><button data-act="copytable">Copy table (paste into Excel/SF)</button><button data-act="csvtable">Download CSV</button>')
    + '<div class="tblwrap"><table class="t"><thead><tr><th></th>' + TABLE_COLS.map(c => '<th>' + c[0] + '</th>').join('') + '</tr></thead><tbody>'
    + rows.map(x => '<tr><td style="white-space:nowrap"><button class="small" data-act="open" data-id="' + x.a.id + '">Open</button> <button class="small" data-act="copytsv" data-id="' + x.a.id + '" title="Copy row">📋</button></td>'
      + TABLE_COLS.map((c, i) => { const v = c[1](x); if (i === 0) return '<td class="cc" data-act="copy" data-text="' + esc(v) + '"><span class="indent" style="width:' + x.depth * 16 + 'px"></span>' + (x.depth ? '└ ' : '') + '<b>' + esc(v) + '</b></td>'; if (c[0] === 'Stage') return '<td class="cc" data-act="copy" data-text="' + esc(v) + '">' + stageBadge(x.a.stage) + '</td>'; return '<td class="cc" data-act="copy" data-text="' + esc(v) + '">' + esc(v) + '</td>'; }).join('') + '</tr>').join('')
    + '</tbody></table></div>' + (rows.length ? '<p class="small muted">Click any cell to copy it.</p>' : '<div class="empty">No accounts match the filter.</div>');
}
const tableMatrix = b => [TABLE_COLS.map(c => c[0])].concat(tableRows(b).map(x => TABLE_COLS.map(c => c[1](x))));

/* ---------- contacts ---------- */
function contactCard(c, ctx = {}){
  const at = c.accountIds.map(acc).filter(Boolean);
  const cls = ctx.inherited ? 'inh' : 'lvl-' + c.level;
  const badge = ctx.inherited ? '<span class="badge lvl-inh">Inherited from ' + esc(shortName(ctx.from, ctx.root)) + '</span>' : (c.level === 'parent' ? '<span class="badge lvl-parent">Parent level</span>' : '<span class="badge lvl-child">Child only</span>');
  const line = (icon, v, w) => v ? '<div class="cl"><span>' + icon + ' ' + esc(v) + '</span>' + cpBtn(v, w) + '</div>' : '';
  return '<div class="contact ' + cls + '" data-cid="' + c.id + '"><div class="row"><span class="cn">' + esc(c.name || '(no name)') + '</span><span class="spacer"></span>' + badge + '</div>'
    + '<div class="small muted">' + esc([c.title, c.role].filter(Boolean).join(' · ')) + '</div>'
    + line('✉', c.email, 'email') + line('☎', c.phone, 'phone')
    + (ctx.inherited ? '' : '<div class="small muted" style="margin-top:4px">' + (c.level === 'parent' ? 'Applies to: ' + esc(at.map(x => shortName(x, ctx.root)).join(', ')) + ' and everything under it' : 'Only: ' + esc(at.map(x => shortName(x, ctx.root)).join(', '))) + '</div>')
    + '<div class="row" style="margin-top:6px"><button class="small" data-act="editcontact" data-id="' + c.id + '">Edit</button><button class="small" data-act="copycontact" data-id="' + c.id + '">Copy</button><button class="small" data-act="copycontacttsv" data-id="' + c.id + '">Copy row</button></div></div>';
}
function contactsView(b){
  const t = tree(b.id); const ids = new Set(t.map(x => x.a.id));
  const cons = WS.contacts.filter(c => c.accountIds.some(id => ids.has(id))).filter(c => !UI.q || [c.name, c.email, c.phone, c.title, c.role].join(' ').toLowerCase().includes(UI.q.toLowerCase()));
  const parentLvl = cons.filter(c => c.level === 'parent');
  let h = '<div class="toolbar"><input type="search" id="q2" placeholder="Filter contacts…" value="' + esc(UI.q) + '"><span class="spacer"></span><button class="primary" data-act="newcontact" data-id="' + b.id + '">+ Add contact</button><button data-act="copycontacts">Copy all contacts (table)</button></div>';
  h += '<div class="legend"><span><span class="badge lvl-parent">Parent level</span> applies to the account it is on and every child under it</span><span><span class="badge lvl-child">Child only</span> only that location</span><span><span class="badge lvl-inh">Inherited</span> shown on a child, comes from above</span></div>';
  h += '<div class="group-h">🏢 Parent-level contacts <span class="muted small">(whole business)</span></div><div class="cgrid">' + (parentLvl.map(c => contactCard(c, {root: b})).join('') || '<div class="muted small">None yet.</div>') + '</div>';
  for (const {a} of t){
    if (a === b) continue;
    const own = cons.filter(c => c.level === 'child' && c.accountIds.includes(a.id));
    const inh = contactsOf(a).inherited;
    h += '<div class="group-h"><span class="badge st-' + a.stage + '">' + esc(STAGE[a.stage].short) + '</span> ' + esc(shortName(a, b)) + ' <span class="muted small">' + own.length + ' child-only · ' + inh.length + ' inherited</span><span class="spacer"></span><button class="small" data-act="newcontact" data-id="' + a.id + '" data-level="child">+ Child-only contact</button></div>';
    h += '<div class="cgrid">' + own.map(c => contactCard(c, {root: b})).join('') + inh.map(x => contactCard(x.c, {inherited: true, from: x.from, root: b})).join('') + (own.length + inh.length ? '' : '<div class="muted small">No contacts.</div>') + '</div>';
  }
  if (cons.length){
    h += '<div class="card" style="margin-top:16px"><h3>Who covers which account</h3><div class="tblwrap"><table class="t matrix"><thead><tr><th>Contact</th><th>Level</th>' + t.map(x => '<th title="' + esc(x.a.name) + '">' + esc(shortName(x.a, b)) + '</th>').join('') + '</tr></thead><tbody>'
      + cons.map(c => { const ap = new Set(appliesTo(c).map(a => a.id)); return '<tr><td><b>' + esc(c.name) + '</b><div class="small muted">' + esc(c.title || '') + '</div></td><td>' + (c.level === 'parent' ? '<span class="badge lvl-parent">Parent</span>' : '<span class="badge lvl-child">Child</span>') + '</td>'
        + t.map(x => c.accountIds.includes(x.a.id) ? '<td class="c ' + (c.level === 'parent' ? 'dot-direct' : 'dot-child') + '" title="Attached here">' + (c.level === 'parent' ? '●' : '◆') + '</td>' : ap.has(x.a.id) ? '<td class="c dot-inh" title="Inherited">○</td>' : '<td class="c"></td>').join('') + '</tr>'; }).join('')
      + '</tbody></table></div><p class="small muted">● attached at parent level · ○ inherited from above · ◆ child-only</p></div>';
  }
  return h;
}

/* ---------- billing ---------- */
function billingView(b){
  const t = tree(b.id); const s = bizStats(b);
  const holders = t.filter(x => effMode(x.a) === 'own');
  let h = '<div class="toolbar"><span class="spacer"></span><button data-act="copybilling">Copy billing table</button></div>';
  h += '<div class="overview" style="margin-bottom:12px"><div class="stat"><div class="k">Total credit exposure</div><div class="v">' + (fmtMoney(s.exposure) || '$0') + '</div><div class="d">sum of every own credit line</div></div>'
    + '<div class="stat"><div class="k">Own credit lines</div><div class="v">' + s.own + '</div><div class="d">parent + children billed on their own</div></div>'
    + '<div class="stat"><div class="k">Roll up to a parent</div><div class="v">' + s.up + '</div><div class="d">billed on someone else\'s line</div></div></div>';
  if (s.missing) h += '<div class="warnbar">⚠ ' + s.missing + ' account(s) have their own credit line but no limit entered.</div>';
  for (const {a} of holders){
    const riders = t.filter(x => x.a !== a && effMode(x.a) === 'parent' && creditHolder(x.a) === a);
    h += '<div class="rollup"><div class="row"><b>💳 ' + esc(a.name) + '</b><span class="badge own">' + esc(a === b ? 'Parent credit line' : 'Billed at child — own line') + '</span><span class="spacer"></span><button class="small" data-act="open" data-id="' + a.id + '">Edit</button><button class="small" data-act="copy" data-text="' + esc(acctPairs(a).filter(p => /Business|Billing|Credit|Payment/.test(p[0])).map(p => p[0] + ': ' + p[1]).join('\n')) + '">Copy</button></div>'
      + '<div class="small" style="margin-top:4px">Limit <b>' + (fmtMoney(a.creditLimit) || '—') + '</b> · Cycle ' + esc(a.billCycle || '—') + ' · Terms ' + esc(a.terms || '—') + ' · Billing contact ' + esc(a.billContact || '—') + '</div>'
      + '<div class="rl">' + (riders.length ? '<span class="small muted">Also billed on this line:</span>' + riders.map(x => '<span class="chip up" data-act="open" data-id="' + x.a.id + '" style="cursor:pointer">↑ ' + esc(shortName(x.a, b)) + '</span>').join('') : '<span class="small muted">No other accounts roll up to this line.</span>') + '</div></div>';
  }
  h += '<div class="tblwrap" style="margin-top:12px"><table class="t"><thead><tr>' + billingMatrix(b)[0].map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>'
    + billingMatrix(b).slice(1).map(r => '<tr>' + r.map(v => '<td class="cc" data-act="copy" data-text="' + esc(v) + '">' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  return h;
}
function billingMatrix(b){
  return [['Account', 'Level', 'Billing Mode', 'Credit Line Held By', 'Credit Limit', 'Billing Cycle', 'Payment Terms', 'Billing Contact']]
    .concat(tree(b.id).map(({a, depth}) => { const h = creditHolder(a), own = effMode(a) === 'own'; return [a.name, depth ? 'Child L' + depth : 'Parent', modeLabel(a), h.name, own ? fmtMoney(a.creditLimit) : '', own ? a.billCycle : '', own ? a.terms : '', own ? a.billContact : '']; }));
}

/* ---------- files ---------- */
function filesView(b){
  const t = tree(b.id); const s = bizStats(b);
  let h = '<div class="card"><div class="row"><div><h3 style="margin:0">Master file for this business</h3><div class="small muted">One Excel workbook: Summary, Accounts, Contacts, Billing, All Fleet Data, All Vehicles, All Drivers, plus a tab per uploaded CSV and per account’s Vehicles / Drivers. <b>Master list (.zip)</b> = that workbook + Master Accounts.csv, All Vehicles.csv, All Drivers.csv and every account’s own CSVs.</div></div><span class="spacer"></span>'
    + '<button class="primary" data-act="buildzip" id="btnZip">⬇ Master list — everything (.zip)</button><button data-act="buildxlsx" id="btnXlsx">⬇ Master file (.xlsx)</button></div>'
    + '<div class="row" style="margin-top:8px;gap:6px"><span class="small muted">Combined CSVs:</span><button class="small" data-act="ffall" data-v="accounts">⬇ Master Accounts.csv</button>' + (t.some(x => ffTable(x.a, 'vehicles')) ? '<button class="small" data-act="ffall" data-v="vehicles">⬇ All Vehicles.csv</button>' : '') + (t.some(x => ffTable(x.a, 'drivers')) ? '<button class="small" data-act="ffall" data-v="drivers">⬇ All Drivers.csv</button>' : '') + '</div>'
    + '<div class="small muted" style="margin-top:6px">' + s.files + ' file(s), ' + s.csv + ' CSV. Files are kept only in this browser.</div></div>';
  for (const {a, depth} of t){
    const fl = filesOf(a.id);
    h += '<div class="card" style="margin-left:' + Math.min(depth, 4) * 18 + 'px"><div class="row"><span class="lvl-tag">' + (depth ? 'Child' : 'Parent') + '</span><b>' + esc(a.name) + '</b>' + stageBadge(a.stage) + '<span class="spacer"></span>'
      + '<label class="btnlike"><input type="file" multiple data-upload="' + a.id + '" class="hidden" accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.doc,.docx,*/*"><span class="button" role="button">⬆ Upload files</span></label></div>'
      + (a.fleet ? '<div class="small" style="margin:6px 0">🚚 Fleet Data form: <b>' + (a.fleet.vehicles ? a.fleet.vehicles.rows.length : 0) + '</b> vehicles · <b>' + (a.fleet.drivers ? a.fleet.drivers.rows.length : 0) + '</b> drivers</div>' + ffButtons(a) : '')
      + '<div class="filelist">' + (fl.map(f => '<div class="fi"><span>' + (f.kind === 'csv' ? '📊' : '📄') + '</span><span class="nm" title="' + esc(f.name) + '">' + esc(f.name) + '</span><span class="small muted">' + fmtBytes(f.size) + (f.kind === 'csv' ? ' · ' + (f.rows ?? '?') + ' rows' : '') + '</span>'
        + (f.kind === 'csv' ? '<button class="small" data-act="preview" data-id="' + f.id + '">Preview</button>' : '') + '<button class="small" data-act="dlfile" data-id="' + f.id + '">Download</button><button class="small danger" data-act="delfile" data-id="' + f.id + '">Remove</button></div>').join('') || '<div class="small muted" style="padding:6px 0">No files. CSV fleet data is combined into the master file.</div>') + '</div></div>';
  }
  return h;
}
async function addFiles(accountId, fileList){
  let n = 0;
  for (const file of fileList){
    const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || /csv|tab-separated/.test(file.type);
    const meta = {id: uid('file'), accountId, name: file.name, mime: file.type || '', size: file.size, added: Date.now(), kind: isCsv ? 'csv' : 'other'};
    if (isCsv){ const text = await file.text(); const rows = parseCSV(text); meta.rows = Math.max(0, rows.length - 1); meta.cols = (rows[0] || []).length; await Store.putFile(meta.id, text); }
    else await Store.putFile(meta.id, await file.arrayBuffer());
    WS.files.push(meta); n++;
  }
  touch(); toast(n + ' file(s) added — stored in this browser only');
}

/* ---------- master workbook ---------- */
async function masterSheets(b){
  const t = tree(b.id); const s = bizStats(b);
  const csvs = [];
  for (const {a} of t) for (const f of filesOf(a.id)) if (f.kind === 'csv'){ const text = await Store.getFile(f.id); const rows = parseCSV(typeof text === 'string' ? text : new TextDecoder().decode(text || new ArrayBuffer(0))); csvs.push({a, f, rows}); }
  // union headers for All Fleet Data
  const hdrKeys = [], hdrNames = [];
  for (const c of csvs) for (const h of (c.rows[0] || [])){ const k = norm(h) || h; if (!hdrKeys.includes(k)){ hdrKeys.push(k); hdrNames.push(h); } }
  const sameHeaders = csvs.length > 0 && csvs.every(c => (c.rows[0] || []).map(h => norm(h)).join('|') === (csvs[0].rows[0] || []).map(h => norm(h)).join('|'));
  const stack = csvs.concat(t.filter(x => ffTable(x.a, 'vehicles')).map(x => ({a: x.a, f: {name: (x.a.fleet.source || 'Fleet Data') + ' — Vehicles'}, rows: ffTable(x.a, 'vehicles')})));
  for (const c of stack.slice(csvs.length)) for (const h of (c.rows[0] || [])){ const k = norm(h) || h; if (!hdrKeys.includes(k)){ hdrKeys.push(k); hdrNames.push(h); } }
  const fleet = [['Account', 'Parent Account', 'Source File', ...hdrNames]];
  for (const c of stack){ const idx = (c.rows[0] || []).map(h => hdrKeys.indexOf(norm(h) || h)); for (const r of c.rows.slice(1)){ const out = new Array(hdrKeys.length).fill(''); r.forEach((v, i) => { if (idx[i] >= 0) out[idx[i]] = v; }); fleet.push([c.a.name, (acc(c.a.parentId) || {}).name || '', c.f.name, ...out]); } }
  const summary = [[{v: 'Master file — ' + b.name, s: 2}], ['Generated', new Date().toLocaleString() + ' (Account Mapper, made locally in the browser)'], ['Rep', [b.repName, b.repEmail].filter(Boolean).join(' · ')], [],
    [{v: 'Where the business stands', s: 4}], [{v: 'Stage', s: 1}, {v: 'Accounts', s: 1}, {v: 'Share', s: 1}],
    ...STAGES.map(x => [x.label, s.counts[x.id], Math.round(s.counts[x.id] / s.n * 100) + '%']), ['Overall progress', s.pct + '%'], [],
    [{v: 'Billing', s: 4}], ['Total credit exposure', {v: s.exposure, s: 3, t: 'n'}], ['Own credit lines', s.own], ['Billed at parent (roll up)', s.up], [],
    [{v: 'Hierarchy', s: 4}], ['Level', 'Account', 'Stage', 'Billing', 'Credit Line Held By', 'Credit Limit', 'Case #', 'Opportunity #', 'Rep', 'Contacts', 'Files'].map(v => ({v, s: 1})),
    ...t.map(({a, depth}) => [depth ? 'Child L' + depth : 'Parent', '   '.repeat(depth) + (depth ? '└ ' : '') + a.name, stageLabel(a.stage), modeLabel(a), creditHolder(a).name, effMode(a) === 'own' && parseMoney(a.creditLimit) != null ? {v: parseMoney(a.creditLimit), s: 3, t: 'n'} : '', {v: a.caseNo, t: 's'}, {v: a.oppNo, t: 's'}, a.repName, contactsOf(a).direct.map(c => c.name).join('; '), filesOf(a.id).length]), [],
    [{v: 'Fleet data', s: 4}], ['CSV files combined', csvs.length], ['Wex Fleet Data forms', t.filter(x => x.a.fleet).length], ['Vehicles (Fleet Data forms)', t.reduce((n, x) => n + (ffTable(x.a, 'vehicles') || [0]).length - 1, 0)], ['Drivers (Fleet Data forms)', t.reduce((n, x) => n + (ffTable(x.a, 'drivers') || [0]).length - 1, 0)], ['Headers', csvs.length ? (sameHeaders ? 'All files share the same columns — stacked with an Account column' : 'Columns differed — combined using every column found (blank where a file lacks it)') : 'No CSV files uploaded']];
  const exKeys = [...new Set(t.flatMap(x => Object.keys(x.a.extra || {})))];
  const ffc = ffAccountCols(t.map(x => x.a));
  const accounts = [['Level', 'Account', 'Parent Account', ...SHOWN_FIELDS().filter(f => f.k !== 'name').map(f => f.label), 'Credit Line Held By', 'Linked Accounts', 'Contacts', 'Files', ...ffc.headers, 'Salesforce Stage', ...exKeys]]
    .concat(t.map(({a, depth}) => { const p = acc(a.parentId); const own = effMode(a) === 'own';
      return [depth ? 'Child L' + depth : 'Parent', a.name, p ? p.name : '', ...SHOWN_FIELDS().filter(f => f.k !== 'name').map(f => {
        if (f.k === 'stage') return stageLabel(a.stage); if (f.k === 'billMode') return modeLabel(a);
        if (f.k === 'creditLimit') return own && parseMoney(a.creditLimit) != null ? {v: parseMoney(a.creditLimit), s: 3, t: 'n'} : '';
        if (['billCycle', 'terms', 'billContact'].includes(f.k) && !own) return '';
        return {v: a[f.k], t: 's'}; }), creditHolder(a).name, a.linkedIds.map(acc).filter(Boolean).map(x => x.name).join('; '), contactsOf(a).direct.map(c => c.name).join('; '), filesOf(a.id).length, ...ffc.row(a), a.sfStage || '', ...exKeys.map(k => ({v: (a.extra || {})[k] || '', t: 's'}))]; }));
  const ids = new Set(t.map(x => x.a.id));
  const cKeys = [...new Set(WS.contacts.filter(c => c.accountIds.some(id => ids.has(id))).flatMap(c => Object.keys(c.extra || {})))];
  const contacts = [['Name', 'Title', 'Email', 'Phone', 'Role', 'Level', 'Attached To', 'Applies To', ...cKeys]]
    .concat(WS.contacts.filter(c => c.accountIds.some(id => ids.has(id))).sort((x, y) => (x.level === y.level ? byName(x, y) : x.level === 'parent' ? -1 : 1))
      .map(c => { const at = c.accountIds.map(acc).filter(Boolean); return [c.name, c.title, c.email, {v: c.phone, t: 's'}, c.role, c.level === 'parent' ? 'Parent level (whole business)' : 'Child only', at.map(x => x.name).join('; '), appliesTo(c).map(x => x.name).join('; '), ...cKeys.map(k => ({v: (c.extra || {})[k] || '', t: 's'}))]; }));
  const billing = billingMatrix(b).map((r, i) => i && parseMoney(r[4]) != null ? r.map((v, j) => j === 4 ? {v: parseMoney(v), s: 3, t: 'n'} : v) : r);
  const sheets = [{name: 'Summary', rows: summary, header: -1, widths: [26, 44, 24, 22, 30, 30, 14, 12, 28, 18, 30, 8]}, {name: 'Accounts', rows: accounts}, {name: 'Contacts', rows: contacts}, {name: 'Billing', rows: billing}];
  const veh = ffAll(b, 'vehicles'), drv = ffAll(b, 'drivers');
  if (csvs.length || veh.n) sheets.push({name: 'All Fleet Data', rows: fleet, fleet: true});
  if (veh.n) sheets.push({name: 'All Vehicles', rows: typeColumns(veh.rows)});
  if (drv.n) sheets.push({name: 'All Drivers', rows: typeColumns(drv.rows)});
  const bases = csvs.map(c => c.f.name.replace(/\.[^.]+$/, ''));
  let pre = bases.length > 1 ? bases.reduce((p, x) => { let i = 0; while (i < p.length && p[i] === x[i]) i++; return p.slice(0, i); }) : '';
  if (bases.some(x => x.length - pre.length < 3)) pre = '';
  csvs.forEach((c, i) => c.tabBase = bases[i].slice(pre.length).replace(/^[\s_\-]+/, '') || bases[i]);
  for (const c of csvs) sheets.push({name: shortName(c.a, b).slice(0, 17).trim() + ' - ' + c.tabBase, isFile: true, rows: typeColumns(c.rows)});
  const fs = sheets.find(s => s.fleet); if (fs) fs.rows = typeColumns(fleet);
  const perAcct = [];
  for (const {a} of t) for (const w of ['vehicles', 'drivers']){ const tb = ffTable(a, w); if (!tb) continue; perAcct.push({a, w, rows: tb}); sheets.push({name: shortName(a, b).slice(0, 20).trim() + ' - ' + (w === 'vehicles' ? 'Vehicles' : 'Drivers'), isFile: true, rows: typeColumns(tb)}); }
  return {sheets, csvs, veh, drv, perAcct};
}
/* A column is numeric only if every value is a plain number with no leading zero; otherwise the whole column is text (keeps IDs, card #s, ZIPs intact). */
function typeColumns(rows){
  const w = Math.max(0, ...rows.map(r => r.length)); const numeric = [];
  for (let c = 0; c < w; c++){ let any = false, ok = true; for (const r of rows.slice(1)){ const v = String(r[c] ?? '').trim(); if (!v) continue; any = true; if (!NUM_RE.test(v)){ ok = false; break; } } numeric[c] = any && ok; }
  return rows.map((r, i) => r.map((v, c) => i === 0 ? v : {v, t: numeric[c] ? 'n' : 's'}));
}
async function buildMasterXlsx(b){
  const {sheets} = await masterSheets(b);
  const blob = buildXlsx(sheets);
  window.__lastXlsx = {blob, names: sheets.map(s => s.finalName)};
  download(blob, safeFile(b.name) + '_master_' + today() + '.xlsx');
  toast('Master file built: ' + sheets.length + ' tabs');
}
async function buildMasterZip(b){
  const {sheets, csvs, veh, drv, perAcct} = await masterSheets(b);
  const plain = rows => rows.map(r => r.map(c => c && typeof c === 'object' ? c.v : c));
  const files = sheets.filter(s => !s.isFile).map((s, i) => ({name: String(i + 1).padStart(2, '0') + '_' + safeFile(s.name) + '.csv', data: '\uFEFF' + toCSV(plain(s.rows))}));
  files.unshift({name: safeFile(b.name) + '_master_' + today() + '.xlsx', data: new Uint8Array(await buildXlsx(sheets).arrayBuffer())}, {name: 'Master Accounts.csv', data: '\uFEFF' + toCSV(plain(sheets.find(s => s.name === 'Accounts').rows))});
  if (veh.n) files.splice(2, 0, {name: 'All Vehicles.csv', data: '\uFEFF' + toCSV(veh.rows)});
  if (drv.n) files.splice(veh.n ? 3 : 2, 0, {name: 'All Drivers.csv', data: '\uFEFF' + toCSV(drv.rows)});
  for (const p of perAcct) files.push({name: 'vehicles-and-drivers/' + ffCsvName(p.a, p.w), data: '\uFEFF' + toCSV(p.rows)});
  for (const c of csvs) files.push({name: 'fleet/' + safeFile(shortName(c.a, b)) + '__' + safeFile(c.f.name.replace(/\.[^.]+$/, '')) + '.csv', data: '\uFEFF' + toCSV(c.rows)});
  for (const {a} of tree(b.id)) for (const f of filesOf(a.id)) if (f.kind !== 'csv'){ const d = await Store.getFile(f.id); if (d) files.push({name: 'attachments/' + safeFile(shortName(a, b)) + '__' + safeFile(f.name), data: d}); }
  download(makeZip(files), safeFile(b.name) + '_master_list_' + today() + '.zip');
  window.__lastZipNames = files.map(f => f.name);
  toast('Master list built: ' + files.length + ' files in one .zip');
}
