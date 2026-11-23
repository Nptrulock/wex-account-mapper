/* ===================== Model ===================== */
let WS = null;
function blankWs(){ return {format: WS_FORMAT, version: 1, created: Date.now(), updated: Date.now(), accounts: [], contacts: [], files: [], mappings: {accounts: {}, contacts: {}, sig: {}}}; }
function migrate(ws){
  if (!ws || typeof ws !== 'object') return blankWs();
  ws.format = WS_FORMAT; ws.version = ws.version || 1;
  ws.accounts = Array.isArray(ws.accounts) ? ws.accounts : [];
  ws.contacts = Array.isArray(ws.contacts) ? ws.contacts : [];
  ws.files = Array.isArray(ws.files) ? ws.files : [];
  ws.mappings = ws.mappings || {}; ws.mappings.accounts = ws.mappings.accounts || {}; ws.mappings.contacts = ws.mappings.contacts || {}; ws.mappings.sig = ws.mappings.sig || {};
  for (const a of ws.accounts){ a.extra = a.extra && typeof a.extra === 'object' ? a.extra : {}; a.linkedIds = Array.isArray(a.linkedIds) ? a.linkedIds : []; if (!STAGE[a.stage]) a.stage = 'app'; if (a.billMode !== 'own') a.billMode = 'parent'; }
  for (const c of ws.contacts){ c.extra = c.extra && typeof c.extra === 'object' ? c.extra : {}; c.accountIds = Array.isArray(c.accountIds) ? c.accountIds : []; if (c.level !== 'child') c.level = 'parent'; }
  ws.mappings.vehicles = ws.mappings.vehicles || {}; ws.mappings.drivers = ws.mappings.drivers || {};
  if (typeof ffCleanJunk === 'function') ffCleanJunk(ws);   // junk accounts named after form labels ("Second Line Embossing Option:")
  return ws;
}
function newAccount(o = {}){
  const a = {id: uid('acc'), extra: {}, parentId: null, name: '', sfId: '', caseNo: '', oppName: '', oppNo: '', oppId: '', repName: '', repEmail: '', repPhone: '', stage: 'app', billMode: 'parent', creditLimit: '', billCycle: '', terms: '', billContact: '', notes: '', linkedIds: [], created: Date.now(), updated: Date.now(), ...o};
  if (!a.parentId) a.billMode = 'own';
  WS.accounts.push(a); return a;
}
function newContact(o = {}){ const c = {id: uid('con'), extra: {}, name: '', title: '', email: '', phone: '', role: '', level: 'parent', accountIds: [], created: Date.now(), ...o}; WS.contacts.push(c); return c; }
const acc = id => WS.accounts.find(a => a.id === id);
const con = id => WS.contacts.find(c => c.id === id);
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true, sensitivity: 'base'});
const kids = id => WS.accounts.filter(a => a.parentId === id).sort(byName);
const roots = () => WS.accounts.filter(a => !a.parentId || !acc(a.parentId)).sort(byName);
const isRoot = a => !a.parentId || !acc(a.parentId);
function ancestors(a){ const out = []; let x = a, g = 0; while (x && x.parentId && acc(x.parentId) && g++ < 200){ x = acc(x.parentId); out.push(x); } return out; }
function rootOf(a){ const an = ancestors(a); return an.length ? an[an.length - 1] : a; }
function tree(id, depth = 0, out = []){ const a = acc(id); if (!a) return out; out.push({a, depth}); for (const k of kids(id)) tree(k.id, depth + 1, out); return out; }
const subtreeIds = id => new Set(tree(id).map(x => x.a.id));
const effMode = a => isRoot(a) ? 'own' : (a.billMode === 'own' ? 'own' : 'parent');
function creditHolder(a){ let x = a, g = 0; while (effMode(x) === 'parent' && g++ < 200) x = acc(x.parentId); return x; }
function contactsOf(a){
  const direct = WS.contacts.filter(c => c.accountIds.includes(a.id));
  const anc = ancestors(a);
  const inherited = [];
  for (const p of anc) for (const c of WS.contacts) if (c.level === 'parent' && c.accountIds.includes(p.id) && !direct.includes(c) && !inherited.some(x => x.c === c)) inherited.push({c, from: p});
  return {direct, inherited};
}
function appliesTo(c){ const set = new Set(); for (const id of c.accountIds){ if (!acc(id)) continue; if (c.level === 'parent') tree(id).forEach(x => set.add(x.a.id)); else set.add(id); } return [...set].map(acc).filter(Boolean); }
const filesOf = id => WS.files.filter(f => f.accountId === id);
const stageLabel = s => (STAGE[s] || STAGE.app).label;
const modeLabel = a => isRoot(a) ? 'Parent credit line' : (effMode(a) === 'own' ? 'Billed at child (own credit line)' : 'Billed at parent (rolls up)');
function shortName(a, root){
  let n = a.name || '(unnamed)';
  if (root && a !== root && root.name){ const rn = root.name; if (n.toLowerCase().startsWith(rn.toLowerCase())) n = n.slice(rn.length).replace(/^[\s\-–—:|,]+/, '') || n; }
  return n.replace(/^sample:\s*/i, '');
}
function bizStats(root){
  const t = tree(root.id); const counts = {app: 0, impl: 0, mc: 0}; let exposure = 0, own = 0, up = 0, missing = 0;
  for (const {a} of t){ counts[a.stage] = (counts[a.stage] || 0) + 1; if (effMode(a) === 'own'){ own++; const m = parseMoney(a.creditLimit); if (m == null) missing++; else exposure += m; } else up++; }
  const ids = new Set(t.map(x => x.a.id));
  const cons = WS.contacts.filter(c => c.accountIds.some(id => ids.has(id)));
  const files = WS.files.filter(f => ids.has(f.accountId));
  const pct = t.length ? Math.round(t.reduce((s, x) => s + (STAGE[x.a.stage].n - 1), 0) / (t.length * 2) * 100) : 0;
  return {n: t.length, counts, exposure, own, up, missing, pct, parentContacts: cons.filter(c => c.level === 'parent').length, childContacts: cons.filter(c => c.level === 'child').length, files: files.length, csv: files.filter(f => f.kind === 'csv').length};
}

/* ---- copy text builders ---- */
function acctPairs(a){
  const p = acc(a.parentId), h = creditHolder(a);
  const pairs = [['Business Name', a.name], ['Parent Account', p ? p.name : '(top-level / parent)'],
    ['Case #', a.caseNo], ['Opportunity #', a.oppNo], ['Opportunity ID', a.oppId],
    ['Rep Name', a.repName], ['Rep Email', a.repEmail], ['Stage', stageLabel(a.stage)],
    ['Billing Mode', modeLabel(a)]];
  if (effMode(a) === 'own') pairs.push(['Credit Line Limit', fmtMoney(a.creditLimit)], ['Billing Cycle', a.billCycle], ['Payment Terms', a.terms], ['Billing Contact', a.billContact]);
  else pairs.push(['Credit Line Held By', h.name]);
  const linked = a.linkedIds.map(acc).filter(Boolean);
  if (linked.length) pairs.push(['Linked Accounts', linked.map(x => x.name).join('; ')]);
  pairs.push(...ffPairs(a));
  if (a.sfStage) pairs.push(['Salesforce Stage', a.sfStage]);
  for (const [k, v] of Object.entries(a.extra || {})) pairs.push([k, v]);
  pairs.push(['Notes', a.notes]);
  return pairs;
}
const acctLabeled = a => acctPairs(a).map(([k, v]) => k + ': ' + (v ?? '')).join('\n');
const acctTSV = a => { const p = acctPairs(a); return toTSV([p.map(x => x[0]), p.map(x => x[1])]); };
function contactPairs(c){
  const at = c.accountIds.map(acc).filter(Boolean);
  return [['Name', c.name], ['Title', c.title], ['Email', c.email], ['Phone', c.phone], ['Role', c.role],
    ['Level', c.level === 'parent' ? 'Parent level (whole business)' : 'Child only'], ['Account(s)', at.map(x => x.name).join('; ')], ...Object.entries(c.extra || {})];
}
const contactLabeled = c => contactPairs(c).map(([k, v]) => k + ': ' + (v ?? '')).join('\n');
const contactTSV = c => { const p = contactPairs(c); return toTSV([p.map(x => x[0]), p.map(x => x[1])]); };

/* ---- search / filter ---- */
function acctMatches(a, q){
  if (!q) return true; q = q.toLowerCase();
  const hay = [a.name, a.sfId, a.caseNo, a.oppName, a.oppNo, a.oppId, a.repName, a.repEmail, a.notes, a.billContact].join(' ').toLowerCase();
  if (hay.includes(q)) return true;
  return WS.contacts.some(c => c.accountIds.includes(a.id) && [c.name, c.email, c.phone, c.title].join(' ').toLowerCase().includes(q));
}

/* ---- import ---- */
const ACC_TARGETS = [...ACCOUNT_FIELDS.map(f => ({k: f.k, label: f.label})), {k: 'parentRef', label: 'Parent Account (name or ID)'}];
const CON_TARGETS = [{k: 'name', label: 'Full Name'}, {k: 'firstName', label: 'First Name'}, {k: 'lastName', label: 'Last Name'}, {k: 'title', label: 'Title'}, {k: 'email', label: 'Email'}, {k: 'phone', label: 'Phone'}, {k: 'role', label: 'Role'}, {k: 'level', label: 'Contact Level (Parent/Child)'}, {k: 'accountRef', label: 'Account (name or ID)'}];
const GUESS = {
  accounts: {
    'account name': 'name', 'business name': 'name', 'name': 'name', 'account': 'name', 'company': 'name', 'legal name': 'name', 'dba': 'name',
    'account id': 'sfId', 'salesforce id': 'sfId', 'salesforce account id': 'sfId', 'sf id': 'sfId', 'account 18 id': 'sfId', 'account id 18': 'sfId', 'id': 'sfId', 'account number': 'sfId',
    'case number': 'caseNo', 'case #': 'caseNo', 'case': 'caseNo', 'case no': 'caseNo',
    'opportunity name': 'oppName', 'opportunity': 'oppName', 'oppty': 'oppName', 'oppty name': 'oppName',
    'opportunity number': 'oppNo', 'opportunity #': 'oppNo', 'opp #': 'oppNo', 'oppty #': 'oppNo', 'opportunity id': 'oppId', 'opp id': 'oppId',
    'account owner': 'repName', 'owner': 'repName', 'owner name': 'repName', 'rep': 'repName', 'rep name': 'repName', 'sales rep': 'repName', 'opportunity owner': 'repName', 'implementation rep': 'repName',
    'owner email': 'repEmail', 'rep email': 'repEmail', 'account owner email': 'repEmail', 'owner phone': 'repPhone', 'rep phone': 'repPhone',
    'stage': 'stage', 'status': 'stage', 'implementation stage': 'stage', 'onboarding stage': 'stage', 'stage name': 'stage',
    'parent account': 'parentRef', 'parent account name': 'parentRef', 'parent': 'parentRef', 'parent account id': 'parentRef', 'parent id': 'parentRef',
    'billing mode': 'billMode', 'billing level': 'billMode', 'billed at': 'billMode', 'credit limit': 'creditLimit', 'credit line': 'creditLimit', 'credit line limit': 'creditLimit',
    'billing cycle': 'billCycle', 'billing frequency': 'billCycle', 'terms': 'terms', 'payment terms': 'terms', 'billing contact': 'billContact', 'notes': 'notes', 'description': 'notes'},
  contacts: {
    'full name': 'name', 'contact name': 'name', 'name': 'name', 'contact': 'name', 'first name': 'firstName', 'last name': 'lastName',
    'title': 'title', 'job title': 'title', 'email': 'email', 'email address': 'email', 'contact email': 'email',
    'phone': 'phone', 'business phone': 'phone', 'mobile': 'phone', 'mobile phone': 'phone', 'contact phone': 'phone',
    'role': 'role', 'contact role': 'role', 'level': 'level', 'contact level': 'level',
    'account name': 'accountRef', 'account': 'accountRef', 'account id': 'accountRef', 'company': 'accountRef', 'business name': 'accountRef'}
};
const sigOf = (type, headers) => type + '|' + headers.map(norm).join('|');
const FLEET_TYPES = {vehicles: 1, drivers: 1};
function guessMap(type, headers){
  WS.mappings[type] = WS.mappings[type] || {};
  const sig = WS.mappings.sig[sigOf(type, headers)];
  if (sig && sig.length === headers.length) return sig.slice();
  const used = new Set();
  return headers.map(h => {
    const n = norm(h); const rem = WS.mappings[type][n];
    let f = rem !== undefined ? rem : FLEET_TYPES[type] ? (ffColKey(type, h) || '') : (GUESS[type][n] || '');
    if (f && used.has(f) && f !== '') f = '';
    if (f) used.add(f);
    return f;
  });
}
function rememberMap(type, headers, map){ WS.mappings[type] = WS.mappings[type] || {}; WS.mappings.sig[sigOf(type, headers)] = map.slice(); headers.forEach((h, i) => { WS.mappings[type][norm(h)] = map[i] || ''; }); }
function findAccount(ref){
  const r = String(ref || '').trim(); if (!r) return null;
  const lo = r.toLowerCase();
  return WS.accounts.find(a => a.sfId && (a.sfId.toLowerCase() === lo || (Math.min(lo.length, a.sfId.length) === 15 && Math.max(lo.length, a.sfId.length) === 18 && a.sfId.slice(0, 15) === r.slice(0, 15))))
      || WS.accounts.find(a => norm(a.name) === norm(r)) || null;
}
function recordsFrom(type, table, map){
  const recs = [];
  for (const row of table.rows){
    const r = {};
    map.forEach((f, i) => { if (f && row[i] != null && String(row[i]).trim() !== '') r[f] = String(row[i]).trim(); });
    if (type === 'contacts' && !r.name && (r.firstName || r.lastName)) r.name = [r.firstName, r.lastName].filter(Boolean).join(' ');
    delete r.firstName; delete r.lastName;
    if (type === 'accounts' && r.name && ffJunkName(r.name) && !r.sfId) continue;   // a form label, not an account
    if (type === 'accounts' ? r.name || r.sfId : r.name || r.email) recs.push(r);
  }
  return recs;
}
function planImport(type, recs){
  return recs.map(r => {
    if (type === 'accounts'){ const m = (r.sfId && findAccount(r.sfId)) || (r.name && WS.accounts.find(a => norm(a.name) === norm(r.name))); return {op: m ? 'update' : 'create', label: r.name || r.sfId, target: m, r}; }
    const m = (r.email && WS.contacts.find(c => c.email && c.email.toLowerCase() === r.email.toLowerCase())) || (r.name && WS.contacts.find(c => norm(c.name) === norm(r.name) && (!r.accountRef || c.accountIds.includes((findAccount(r.accountRef) || {}).id))));
    return {op: m ? 'update' : 'create', label: r.name || r.email, target: m, r, acct: findAccount(r.accountRef)};
  });
}
function applyImport(type, recs, opts = {}){
  const res = {created: 0, updated: 0, warnings: []};
  const plan = planImport(type, recs);
  if (type === 'accounts'){
    const touched = [];
    for (const p of plan){
      const r = p.r; let a = p.target;
      if (!a){ a = newAccount({parentId: null, name: r.name || r.sfId}); a._new = true; res.created++; } else res.updated++;
      for (const f of ACCOUNT_FIELDS){ if (r[f.k] == null) continue;
        if (f.k === 'stage'){ const s = parseStage(r.stage); if (s) a.stage = s; else res.warnings.push('Unknown stage "' + r.stage + '" for ' + a.name); }
        else if (f.k === 'billMode'){ const m = parseBillMode(r.billMode); if (m) a.billMode = m; }
        else a[f.k] = r[f.k]; }
      a.updated = Date.now(); touched.push([a, r]);
    }
    for (const [a, r] of touched){
      let parent = null;
      if (r.parentRef){ parent = findAccount(r.parentRef); if (!parent) res.warnings.push('Parent "' + r.parentRef + '" not found for ' + a.name); }
      else if (a._new && opts.under) parent = acc(opts.under);
      if (parent && parent !== a && !subtreeIds(a.id).has(parent.id)){ a.parentId = parent.id; if (a._new && !r.billMode) a.billMode = 'parent'; }
      delete a._new;
    }
  } else {
    for (const p of plan){
      const r = p.r; let c = p.target;
      let a = r.accountRef ? findAccount(r.accountRef) : null;
      if (r.accountRef && !a) res.warnings.push('Account "' + r.accountRef + '" not found for contact ' + (r.name || r.email));
      if (!a && opts.under) a = acc(opts.under);
      if (!c){ c = newContact({name: r.name || r.email}); res.created++; } else res.updated++;
      for (const k of ['name', 'title', 'email', 'phone', 'role']) if (r[k]) c[k] = r[k];
      if (a && !c.accountIds.includes(a.id)) c.accountIds.push(a.id);
      if (r.level){ c.level = /child|location|site|only/i.test(r.level) ? 'child' : 'parent'; }
      else if (p.op === 'create') c.level = a && !isRoot(a) ? 'child' : 'parent';
      if (!c.accountIds.length) res.warnings.push('Contact ' + c.name + ' is not attached to any account yet');
    }
  }
  return res;
}
