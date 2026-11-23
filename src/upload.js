/* ===================== Upload Salesforce exports ===================== */
/* Column targets. a.* = account, c.* = contact, x = keep as extra field, '' = ignore */
const UP_TARGETS = [
  ['Account', [['a.name', 'Account / business name'], ['a.sfId', 'Account ID'], ['a.parentRef', 'Parent account (name)'], ['a.parentId', 'Parent account ID'], ['a.ultimate', 'Ultimate parent'],
    ['a.stage', 'Stage / status → Wex stage'], ['a.caseNo', 'Case #'], ['a.oppName', 'Opportunity name'], ['a.oppNo', 'Opportunity #'], ['a.oppId', 'Opportunity ID'],
    ['a.repName', 'Rep / owner name'], ['a.repEmail', 'Rep / owner email'], ['a.repPhone', 'Rep / owner phone'], ['a.notes', 'Notes']]],
  ['Billing / credit', [['a.billMode', 'Billing level (parent / child)'], ['a.creditLimit', 'Credit line limit'], ['a.billCycle', 'Billing cycle'], ['a.terms', 'Payment terms'], ['a.billContact', 'Billing contact']]],
  ['Contact', [['c.name', 'Contact full name'], ['c.first', 'Contact first name'], ['c.last', 'Contact last name'], ['c.title', 'Contact title'], ['c.email', 'Contact email'], ['c.phone', 'Contact phone'], ['c.role', 'Contact role'], ['c.level', 'Contact level (parent / child)'], ['c.sfId', 'Contact ID']]],
];
const UP_LABEL = Object.fromEntries(UP_TARGETS.flatMap(g => g[1]));
const UP_COMMON = {
  'account name': 'a.name', 'account': 'a.name', 'business name': 'a.name', 'company': 'a.name', 'company name': 'a.name', 'legal name': 'a.name', 'account legal name': 'a.name', 'dba': 'a.name', 'dba name': 'a.name', 'customer name': 'a.name',
  'account id': 'a.sfId', 'account 18 id': 'a.sfId', 'account id 18': 'a.sfId', 'account id (18)': 'a.sfId', 'account 18 digit id': 'a.sfId', '18 digit account id': 'a.sfId', 'casesafe id': 'a.sfId', 'account casesafe id': 'a.sfId', 'sf account id': 'a.sfId', 'salesforce account id': 'a.sfId', 'salesforce id': 'a.sfId', 'account: account id': 'a.sfId',
  'parent account': 'a.parentRef', 'parent account name': 'a.parentRef', 'parent': 'a.parentRef', 'parent name': 'a.parentRef', 'parent company': 'a.parentRef', 'parent account: account name': 'a.parentRef',
  'parent account id': 'a.parentId', 'parent id': 'a.parentId', 'parent account 18 id': 'a.parentId', 'parent account: account id': 'a.parentId',
  'ultimate parent': 'a.ultimate', 'ultimate parent account': 'a.ultimate', 'ultimate parent name': 'a.ultimate', 'ultimate parent account name': 'a.ultimate', 'top parent': 'a.ultimate',
  'account owner': 'a.repName', 'account owner name': 'a.repName', 'account owner: full name': 'a.repName', 'owner': 'a.repName', 'owner name': 'a.repName', 'account manager': 'a.repName', 'sales rep': 'a.repName', 'rep': 'a.repName', 'rep name': 'a.repName', 'assigned rep': 'a.repName', 'implementation rep': 'a.repName', 'implementation specialist': 'a.repName', 'implementation manager': 'a.repName', 'onboarding specialist': 'a.repName', 'account executive': 'a.repName', 'opportunity owner': 'a.repName', 'case owner': 'a.repName',
  'account owner email': 'a.repEmail', 'owner email': 'a.repEmail', 'rep email': 'a.repEmail', 'owner: email': 'a.repEmail', 'account owner: email': 'a.repEmail', 'opportunity owner email': 'a.repEmail',
  'account owner phone': 'a.repPhone', 'owner phone': 'a.repPhone', 'rep phone': 'a.repPhone', 'account owner: phone': 'a.repPhone',
  'case number': 'a.caseNo', 'case #': 'a.caseNo', 'case no': 'a.caseNo', 'case': 'a.caseNo', 'case: case number': 'a.caseNo',
  'opportunity name': 'a.oppName', 'opportunity': 'a.oppName', 'oppty': 'a.oppName', 'oppty name': 'a.oppName', 'opportunity: opportunity name': 'a.oppName',
  'opportunity number': 'a.oppNo', 'opportunity #': 'a.oppNo', 'opp #': 'a.oppNo', 'opportunity no': 'a.oppNo', 'oppty #': 'a.oppNo',
  'opportunity id': 'a.oppId', 'opp id': 'a.oppId', 'opportunity 18 id': 'a.oppId', 'opportunity: opportunity id': 'a.oppId',
  'implementation stage': 'a.stage', 'implementation status': 'a.stage', 'onboarding stage': 'a.stage', 'onboarding status': 'a.stage', 'account stage': 'a.stage', 'account status': 'a.stage', 'wex stage': 'a.stage', 'implementation phase': 'a.stage', 'customer stage': 'a.stage', 'lifecycle stage': 'a.stage', 'stage (implementation)': 'a.stage',
  'credit limit': 'a.creditLimit', 'credit line': 'a.creditLimit', 'credit line limit': 'a.creditLimit', 'approved credit limit': 'a.creditLimit', 'approved credit line': 'a.creditLimit', 'credit amount': 'a.creditLimit', 'approved credit': 'a.creditLimit', 'current credit limit': 'a.creditLimit', 'credit line amount': 'a.creditLimit',
  'billing cycle': 'a.billCycle', 'billing frequency': 'a.billCycle', 'invoice frequency': 'a.billCycle', 'billing period': 'a.billCycle', 'statement cycle': 'a.billCycle', 'billing cycle type': 'a.billCycle',
  'payment terms': 'a.terms', 'terms': 'a.terms', 'net terms': 'a.terms', 'payment term': 'a.terms',
  'billing contact': 'a.billContact', 'billing contact name': 'a.billContact', 'ap contact': 'a.billContact', 'accounts payable contact': 'a.billContact',
  'billing level': 'a.billMode', 'billing mode': 'a.billMode', 'billed at': 'a.billMode', 'bill to level': 'a.billMode', 'billing hierarchy': 'a.billMode', 'billing structure': 'a.billMode', 'bill at': 'a.billMode', 'invoice level': 'a.billMode',
  'notes': 'a.notes', 'account notes': 'a.notes',
  'first name': 'c.first', 'last name': 'c.last', 'contact name': 'c.name', 'full name': 'c.name', 'contact: full name': 'c.name', 'contact full name': 'c.name', 'primary contact': 'c.name', 'main contact': 'c.name',
  'title': 'c.title', 'job title': 'c.title', 'contact title': 'c.title', 'contact: title': 'c.title',
  'email': 'c.email', 'email address': 'c.email', 'contact email': 'c.email', 'contact: email': 'c.email', 'primary contact email': 'c.email',
  'business phone': 'c.phone', 'mobile': 'c.phone', 'mobile phone': 'c.phone', 'contact phone': 'c.phone', 'direct phone': 'c.phone', 'contact: phone': 'c.phone', 'primary contact phone': 'c.phone',
  'contact role': 'c.role', 'contact roles': 'c.role', 'role': 'c.role', 'primary role': 'c.role', 'contact level': 'c.level', 'contact id': 'c.sfId', 'contact 18 id': 'c.sfId',
};
/* type-specific meanings for ambiguous headers */
const UP_BY_TYPE = {
  accounts: {'name': 'a.name', 'phone': 'x', 'type': 'x', 'status': 'a.stage', 'stage': 'a.stage', 'description': 'a.notes'},
  contacts: {'name': 'c.name', 'phone': 'c.phone', 'contact': 'c.name'},
  opportunities: {'name': 'a.oppName', 'stage': 'x', 'id': 'a.oppId'},   // opportunity sales stage is not the Wex implementation stage: kept as 'Opportunity: Stage'
  cases: {'contact name': 'c.name', 'contact': 'c.name', 'contact email': 'c.email', 'contact phone': 'c.phone', 'status': 'x', 'subject': 'x'},
  billing: {'name': 'a.name', 'status': 'x'},
};
const UP_TYPES = {accounts: 'Accounts', contacts: 'Contacts', opportunities: 'Opportunities', cases: 'Cases', billing: 'Billing / credit', other: 'Other / mixed'};
function detectType(headers, title){
  const h = headers.map(norm); const has = re => h.filter(x => re.test(x)).length;
  const s = {
    cases: has(/^(case number|case #|case no|case: case number)$/) * 5 + has(/^(subject|priority|case origin|date\/?time opened|case owner|status)$/),
    opportunities: has(/^(opportunity name|opportunity id|opportunity: opportunity name)$/) * 4 + has(/^(stage|close date|amount|probability.*|opportunity owner|next step|lead source|fiscal period)$/) * 2,
    contacts: has(/^(first name|last name|contact name|full name|contact id|email|contact: full name|mailing .*)$/) * 3 + has(/^(title|mobile|mobile phone|business phone)$/),
    billing: has(/^(credit limit|credit line.*|approved credit.*|billing cycle|billing frequency|invoice frequency|payment terms|billing level|billing mode|billed at|billing contact)$/) * 3,
    accounts: has(/^(account name|account id|parent account.*|ultimate parent.*|billing (street|city|state.*|zip.*|postal code|country)|industry|type|website|account owner|account number|annual revenue|employees)$/) * 2,
  };
  const t = String(title || '').toLowerCase();
  for (const k in s) if (t.includes(k.replace(/s$/, '')) || (k === 'billing' && /credit|billing/.test(t))) s[k] += 3;
  let best = 'other', bv = 2; for (const k of ['cases', 'opportunities', 'contacts', 'billing', 'accounts']) if (s[k] > bv){ bv = s[k]; best = k; }
  return best;
}
function upGuess(type, headers){
  const sig = (WS.mappings.upSig || {})[type + '|' + headers.map(norm).join('|')];
  if (sig && sig.length === headers.length) return sig.slice();
  const rem = (WS.mappings.up || {})[type] || {};
  const used = new Set();
  return headers.map(hd => {
    const n = norm(hd).replace(/\s*\(\d+\)$/, '');
    let f = rem[n] !== undefined ? rem[n] : ((UP_BY_TYPE[type] || {})[n] || UP_COMMON[n] || 'x');
    if (f !== 'x' && f !== '' && used.has(f)) f = 'x';
    if (f !== 'x' && f !== '') used.add(f);
    return f;
  });
}
const KNOWN_HDR = new Set([...Object.keys(UP_COMMON), ...Object.values(UP_BY_TYPE).flatMap(Object.keys), 'type', 'industry', 'phone', 'website', 'billing city', 'billing state/province', 'billing street', 'billing zip/postal code', 'created date', 'close date', 'amount', 'stage', 'status', 'subject', 'priority', 'date/time opened', 'mailing city', 'last activity', 'account number']);
const FOOTER_RE = /copyright \(c\)|salesforce\.com, inc|confidential information|do not distribute|^generated by\b/i;
const SUBTOTAL_RE = /^(sub ?total|total|grand totals?|count|sum|average|avg|record count)\b/i;
/* find the real table inside a report: skip title/filter block, group headers, subtotals and footer */
function locateTable(sheetRows){
  const rows = sheetRows.map(r => r.map(c => cleanCell(c)));
  const filled = r => r.filter(c => c !== '').length;
  let best = -1, bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 60); i++){
    const r = rows[i], f = filled(r); if (f < 2) continue;
    if (r.some(c => FOOTER_RE.test(c))) continue;
    const known = r.filter(c => KNOWN_HDR.has(norm(c))).length;
    const after = rows.slice(i + 1, i + 6).filter(x => filled(x) >= Math.min(2, f)).length;
    const longCells = r.filter(c => c.length > 60).length;
    const score = known * 10 + f + after * 2 - longCells * 15 - (r.some(c => /^\$?[\d,.]+$/.test(c)) ? 6 : 0);
    if (score > bestScore){ best = i; bestScore = score; }
  }
  if (best < 0) return null;
  const hdrRow = rows[best];
  const title = rows.slice(0, best).map(r => r.filter(Boolean).join(' ')).filter(Boolean).join(' · ');
  let width = hdrRow.length; while (width > 0 && !hdrRow[width - 1]) width--;
  const skipped = {blank: 0, subtotal: 0, footer: 0, group: 0};
  const data = []; let formatted = best > 0 && title.length > 0; const group = {};
  for (let i = best + 1; i < rows.length; i++){
    const r = rows[i].slice(0, Math.max(width, rows[i].length)); const f = filled(r);
    if (!f){ skipped.blank++; continue; }
    if (r.some(c => FOOTER_RE.test(c))){ skipped.footer += rows.length - i; break; }
    if (r.some(c => SUBTOTAL_RE.test(c)) && f <= Math.max(2, Math.ceil(width / 2))){ skipped.subtotal++; formatted = true; continue; }
    if (f === 1){
      const ci = r.findIndex(c => c !== ''); const v = r[ci];
      if (/\(\d+ records?\)\s*$/i.test(v) || (width > 2 && ci < width)){
        let val = v.replace(/\s*\(\d+ records?\)\s*$/i, '');
        const m = val.match(/^([^:]{2,60}):\s*(.+)$/); let col = ci;
        if (m){ const hi = hdrRow.findIndex(h => norm(h) === norm(m[1])); if (hi >= 0){ col = hi; val = m[2]; } }
        if (width > 2 || /\(\d+ records?\)/i.test(v)){ group[col] = val; for (const k in group) if (+k > col) delete group[k]; skipped.group++; formatted = true; continue; }
      }
    }
    const row = []; for (let c = 0; c < width; c++) row[c] = r[c] ?? '';
    for (const k in group) if (+k < width && !row[k]) row[k] = group[k];
    data.push(row);
  }
  // formatted (grouped) exports leave the grouping column blank after its first row: fill down
  if (formatted){
    for (let c = 0; c < Math.min(3, width); c++){
      const blanks = data.filter(r => !r[c]).length;
      if (!blanks || blanks === data.length || !/account|parent|opportunity|owner|name/i.test(hdrRow[c])) continue;
      let last = ''; for (const r of data){ if (r[c]) last = r[c]; else if (last) r[c] = last; }
    }
  }
  const headers = hdrRow.slice(0, width).map((h, i) => h || 'Column ' + colName(i));
  const keep = headers.map((h, i) => hdrRow[i] || data.some(r => r[i]));
  return {headers: headers.filter((_, i) => keep[i]), rows: data.map(r => r.filter((_, i) => keep[i])), headerRow: best + 1, title, skipped, formatted};
}

/* stage values: auto only when the meaning is clear; anything else is decided once by the rep (remembered) */
function autoStage(v){
  const s = norm(v); if (!s) return null;
  if (/monitor|^m ?& ?c$|control/.test(s)) return 'mc';
  if (/implementation call|^impl|implementation/.test(s)) return 'impl';
  if (/application|^app follow|^app f ?u/.test(s)) return 'app';
  return null;
}
function stageFor(raw){ const m = (WS.mappings.stageValues || {})[norm(raw)]; if (m) return m === 'keep' ? null : m; return autoStage(raw); }

/* ---- ingest: merge parsed sources into WS (call on a clone for preview) ---- */
function ingest(sources, opts = {}){
  const st = {fleet: [], accNew: 0, accUpd: 0, conNew: 0, conUpd: 0, links: 0, placeholders: [], extras: {}, stageRaw: {}, warnings: [], perSource: []};
  const before = new Set(WS.accounts.map(a => a.id)), beforeC = new Set(WS.contacts.map(c => c.id));
  const touchedA = new Set(), touchedC = new Set();
  /* an ID always wins; a name only matches an account that has no different ID (location accounts often share a name) */
  const findAcc = (id, name) => { if (id){ const a = findAccount(id); if (a && a.sfId) return a; return (name && WS.accounts.find(x => !x.sfId && norm(x.name) === norm(name))) || null; } return (name && WS.accounts.find(x => norm(x.name) === norm(name))) || null; };
  const order = {accounts: 0, billing: 1, opportunities: 2, cases: 3, contacts: 4, other: 5};
  const srcs = sources.filter(s => s.include !== false && s.table).sort((a, b) => order[a.type] - order[b.type]);
  const pendingParents = [];
  const addExtra = (obj, k, v) => { obj.extra = obj.extra || {}; const cur = obj.extra[k]; if (!cur) obj.extra[k] = v; else if (!cur.split(' | ').includes(v)) { const parts = cur.split(' | '); if (parts.length < 12) obj.extra[k] = cur + ' | ' + v; } };
  for (const s of srcs){
    let used = 0;
    const map = s.map, H = s.table.headers;
    for (const row of s.table.rows){
      const v = {}; const extras = [];
      map.forEach((f, i) => { const val = String(row[i] ?? '').trim(); if (!val || !f) return; if (f === 'x') extras.push([H[i], val]); else if (!(f in v)) v[f] = val; });
      if (v['c.first'] || v['c.last']) v['c.name'] = v['c.name'] || [v['c.first'], v['c.last']].filter(Boolean).join(' ');
      const hasContact = v['c.name'] || v['c.email'];
      let a = findAcc(v['a.sfId'], v['a.name']);
      if (!a && (v['a.sfId'] || v['a.name'])){ a = newAccount({name: v['a.name'] || 'Account ' + v['a.sfId'], sfId: v['a.sfId'] || ''}); a.billMode = 'parent'; }   // newAccount defaults roots to 'own'; decided after the hierarchy is linked
      if (a){
        used++; touchedA.add(a.id);
        if (v['a.sfId'] && !a.sfId) a.sfId = v['a.sfId'];
        if (v['a.name'] && (!a.name || /^Account /.test(a.name) && a.name === 'Account ' + a.sfId)) a.name = v['a.name'];
        for (const k of ['caseNo', 'oppName', 'oppNo', 'oppId', 'repName', 'repEmail', 'repPhone', 'terms', 'billContact', 'billCycle']){ const val = v['a.' + k]; if (!val) continue; if (!a[k]) a[k] = val; else if (a[k] !== val && ['caseNo', 'oppName', 'oppNo', 'oppId'].includes(k)) addExtra(a, 'Other ' + UP_LABEL['a.' + k], val); else if (a[k] !== val && /^rep/.test(k) && (s.type === 'opportunities' || s.type === 'cases')) addExtra(a, (s.type === 'cases' ? 'Case ' : 'Opportunity ') + UP_LABEL['a.' + k].toLowerCase(), val); else a[k] = val; }
        if (v['a.notes'] && !String(a.notes || '').includes(v['a.notes'])) a.notes = a.notes ? a.notes + '\n' + v['a.notes'] : v['a.notes'];
        if (v['a.creditLimit']){ const m = parseMoney(v['a.creditLimit']); if (m != null) a.creditLimit = String(m); else addExtra(a, 'Credit Limit (raw)', v['a.creditLimit']); a._credit = true; }
        if (v['a.billMode']){ const m = parseBillMode(v['a.billMode']); if (m){ a.billMode = m; a._billSet = true; } addExtra(a, 'Billing Level (Salesforce)', v['a.billMode']); }
        if (v['a.stage']){
          const raw = v['a.stage']; st.stageRaw[raw] = (st.stageRaw[raw] || 0) + 1; if (!a._sfStageSet){ a.sfStage = raw; a._sfStageSet = true; }
          const sg = stageFor(raw); if (sg && (!a._stageSet || STAGE[sg].n > STAGE[a.stage].n)){ a.stage = sg; a._stageSet = true; }
        }
        const pRef = v['a.parentId'] || v['a.parentRef'] || v['a.ultimate'];
        if (pRef && !(v['a.ultimate'] && !v['a.parentId'] && !v['a.parentRef'] && norm(v['a.ultimate']) === norm(a.name))) pendingParents.push([a, v['a.parentId'], v['a.parentRef'] || (!v['a.parentId'] ? v['a.ultimate'] : '')]);
        const pre = k => s.type === 'opportunities' && !/opportunit|opp\b/i.test(k) ? 'Opportunity: ' + k : s.type === 'cases' && !/case/i.test(k) ? 'Case: ' + k : k;
        if (!(hasContact && s.type === 'contacts')) for (const [k, val] of extras){ addExtra(a, pre(k), val); st.extras[pre(k)] = (st.extras[pre(k)] || 0) + 1; }
      }
      if (hasContact){
        let c = (v['c.sfId'] && WS.contacts.find(x => x.sfId === v['c.sfId'])) || (v['c.email'] && WS.contacts.find(x => x.email && x.email.toLowerCase() === v['c.email'].toLowerCase())) || (v['c.name'] && WS.contacts.find(x => norm(x.name) === norm(v['c.name']) && (!a || x.accountIds.includes(a.id))));
        if (!c){ c = newContact({name: v['c.name'] || v['c.email'], level: ''}); }
        touchedC.add(c.id); if (!a) used++;
        for (const k of ['name', 'title', 'email', 'phone', 'role', 'sfId']) if (v['c.' + k]) c[k] = v['c.' + k];
        if (v['c.level']) c.level = /child|location|site|only|sub/i.test(v['c.level']) ? 'child' : 'parent';
        if (a && !c.accountIds.includes(a.id)) c.accountIds.push(a.id);
        if (!a && !c.accountIds.length) st.warnings.push('Contact ' + c.name + ' has no account in its row');
        if (s.type === 'contacts') for (const [k, val] of extras){ addExtra(c, k, val); st.extras[k] = (st.extras[k] || 0) + 1; }
      }
    }
    st.perSource.push({id: s.id, used});
  }
  // hierarchy (after all accounts exist, so files can reference each other)
  for (const [a, pid, pname] of pendingParents){
    let p = findAcc(pid, pname);
    if (!p){ p = newAccount({name: pname || 'Parent ' + pid, sfId: pid || '', billMode: 'own'}); st.placeholders.push(p.name); touchedA.add(p.id); }
    if (p === a || subtreeIds(a.id).has(p.id)) continue;
    if (a.parentId !== p.id){ a.parentId = p.id; st.links++; }
  }
  // Wex Fleet Data forms (after other files, so they can attach to accounts those files create)
  for (const s of sources) if (s.kind === 'fleet' && s.include !== false) ffApply(s, {touchedA, touchedC, st, addExtra});
  for (const a of WS.accounts){
    if (!touchedA.has(a.id)) continue;
    if (!a.parentId) a.billMode = 'own';
    else if (a._credit && !a._billSet) a.billMode = 'own';   // a child with its own credit limit is billed at the child
    delete a._credit; delete a._billSet; delete a._stageSet; delete a._sfStageSet; a.updated = Date.now();
  }
  for (const c of WS.contacts){ if (!touchedC.has(c.id)) continue; if (!c.level){ const at = acc(c.accountIds[0]); c.level = at && !isRoot(at) ? 'child' : 'parent'; } }
  for (const id of touchedA) before.has(id) ? st.accUpd++ : st.accNew++;
  for (const id of touchedC) beforeC.has(id) ? st.conUpd++ : st.conNew++;
  st.roots = [...new Set([...touchedA].map(id => acc(id)).filter(Boolean).map(a => rootOf(a).id))].map(id => { const r = acc(id); return {name: r.name, n: tree(r.id).length}; });
  return st;
}
function previewIngest(sources){
  const real = WS; WS = structuredClone(real);
  try { return ingest(sources); } finally { WS = real; }
}

/* ---- UI ---- */
async function upAddFiles(fileList){
  const U = UI.up = UI.up || {sources: [], errors: []};
  for (const f of fileList){
    try {
      const {format, sheets} = await readSpreadsheetFile(f);
      let added = 0;
      for (const sh of sheets){
        const form = parseFleetForm(sh.rows);
        if (isFleetForm(form)){ U.sources.push({id: uid('src'), kind: 'fleet', type: 'fleet', file: f.name, size: f.size, mime: f.type || '', format, sheet: sh.name, sheets: sheets.length, form, target: '', blob: f}); added++; continue; }
        const table = locateTable(sh.rows); if (!table || !table.rows.length) continue;
        const type = detectType(table.headers, table.title + ' ' + f.name);
        U.sources.push({id: uid('src'), file: f.name, size: f.size, format, sheet: sh.name, sheets: sheets.length, table, type, map: upGuess(type, table.headers), open: false});
        added++;
      }
      if (!added) U.errors.push(f.name + ': no table with a header row was found');
    } catch (e) { console.warn(e); U.errors.push(f.name + ': ' + e.message); }
  }
  UI.tab = 'import'; render();
}
function upStageValues(U){ const vals = {}; for (const s of U.sources){ if (s.include === false || !s.map) continue; s.map.forEach((f, i) => { if (f === 'a.stage') for (const r of s.table.rows) if (r[i]) vals[r[i]] = (vals[r[i]] || 0) + 1; }); } return vals; }
function uploadView(){
  const U = UI.up || {sources: [], errors: []};
  let h = '<div class="card dropzone" id="dropZone"><div class="dz-icon">⬆</div><div><h3 style="margin:0 0 4px">Upload Salesforce exports</h3><div class="small muted">Drop report exports here — accounts, contacts, opportunities, cases, billing/credit. Several at once is fine; they’re linked by Account ID / name and Parent Account.<br>Works with .xls (all Salesforce flavors), .xlsx, .csv — “Details only” or “Formatted” reports. <b>Read in this browser only. Nothing is uploaded anywhere.</b></div></div>'
    + '<label class="btnlike"><input type="file" id="upFiles" multiple class="hidden" accept=".xls,.xlsx,.csv,.tsv,.txt,.xml,.htm,.html"><span class="button primary" role="button">Choose files…</span></label></div>';
  if (U.errors.length) h += '<div class="warnbar">' + U.errors.map(esc).join('<br>') + ' <button class="small" data-act="uperrclear">Dismiss</button></div>';
  if (U.sources.length){
    const st = previewIngest(U.sources); U.lastPreview = st;
    h += U.sources.map(s => s.kind === 'fleet' ? ffSourceCard(s, st) : upSourceCard(s, st)).join('');
    const vals = upStageValues(U); const keys = Object.keys(vals);
    if (keys.length){
      h += '<div class="card"><h3>Stage values found <span class="small muted">— choose once, remembered</span></h3><div class="tblwrap"><table class="t"><thead><tr><th>Value in Salesforce</th><th>Rows</th><th>Show as</th></tr></thead><tbody>'
        + keys.map(k => { const cur = (WS.mappings.stageValues || {})[norm(k)] || autoStage(k) || 'keep'; return '<tr><td><b>' + esc(k) + '</b></td><td>' + vals[k] + '</td><td><select data-act-change="upstage" data-v="' + esc(norm(k)) + '">' + STAGES.map(x => '<option value="' + x.id + '"' + (cur === x.id ? ' selected' : '') + '>' + x.label + '</option>').join('') + '<option value="keep"' + (cur === 'keep' ? ' selected' : '') + '>Don’t change the stage (keep raw value only)</option></select>' + (autoStage(k) && !(WS.mappings.stageValues || {})[norm(k)] ? ' <span class="small muted">auto</span>' : '') + '</td></tr>'; }).join('')
        + '</tbody></table></div><p class="small muted">The original Salesforce value is always kept on the account as “Salesforce stage”.</p></div>';
    }
    const ex = Object.keys(st.extras);
    h += '<div class="card"><h3>What will happen</h3><div class="overview">'
      + '<div class="stat"><div class="k">Accounts</div><div class="v">' + (st.accNew + st.accUpd) + '</div><div class="d">' + st.accNew + ' new · ' + st.accUpd + ' updated</div></div>'
      + '<div class="stat"><div class="k">Contacts</div><div class="v">' + (st.conNew + st.conUpd) + '</div><div class="d">' + st.conNew + ' new · ' + st.conUpd + ' updated</div></div>'
      + '<div class="stat"><div class="k">Parent/child links</div><div class="v">' + st.links + '</div><div class="d">' + (st.placeholders.length ? st.placeholders.length + ' parent(s) only named, not in any file' : 'all parents found') + '</div></div>'
      + '<div class="stat"><div class="k">Businesses</div><div class="v">' + st.roots.length + '</div><div class="d">' + esc(st.roots.slice(0, 3).map(r => r.name + ' (' + r.n + ')').join(', ')) + (st.roots.length > 3 ? '…' : '') + '</div></div></div>'
      + (ex.length ? '<p class="small"><b>Kept as extra fields</b> (shown on each account/contact, copyable, included in the master file): ' + ex.map(k => '<span class="chip">' + esc(k) + '</span>').join(' ') + '</p>' : '')
      + (st.placeholders.length ? '<p class="small muted">Parents created from a name/ID only: ' + esc(st.placeholders.slice(0, 8).join(', ')) + '</p>' : '')
      + (st.warnings.length ? '<div class="warnbar">' + st.warnings.slice(0, 8).map(esc).join('<br>') + '</div>' : '')
      + '<div class="row"><button data-act="upclear">Clear</button><span class="spacer"></span><button class="primary" data-act="upgo" id="upGo">Import everything</button></div></div>';
  }
  if (U.result) h += '<div class="okbar" id="upResult">✓ ' + esc(U.result) + ' <button class="small" data-act="tab" data-tab="chart">View chart</button></div>';
  return h;
}
function upSourceCard(s, st){
  const ps = st.perSource.find(p => p.id === s.id) || {used: 0};
  const mapped = s.map.filter(f => f && f !== 'x').length, extra = s.map.filter(f => f === 'x').length, ign = s.map.filter(f => !f).length;
  const sk = s.table.skipped; const skipTxt = [sk.subtotal && sk.subtotal + ' subtotal/total', sk.group && sk.group + ' group heading', sk.footer && 'footer', sk.blank && sk.blank + ' blank'].filter(Boolean).join(', ');
  const opts = f => '<option value="x"' + (f === 'x' ? ' selected' : '') + '>Keep as extra field</option><option value=""' + (!f ? ' selected' : '') + '>Ignore</option>' + UP_TARGETS.map(([g, list]) => '<optgroup label="' + g + '">' + list.map(([k, l]) => '<option value="' + k + '"' + (f === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</optgroup>').join('');
  return '<div class="card upsrc' + (s.include === false ? ' off' : '') + '" data-src="' + s.id + '"><div class="row"><span style="font-size:20px">📄</span><div style="min-width:0;flex:1"><b>' + esc(s.file) + '</b>' + (s.sheets > 1 ? ' <span class="muted">· ' + esc(s.sheet) + '</span>' : '') + '<div class="small muted">' + esc(s.format) + ' · header on row ' + s.table.headerRow + ' · ' + s.table.rows.length + ' data rows' + (skipTxt ? ' · skipped ' + skipTxt : '') + (s.table.title ? ' · “' + esc(s.table.title.slice(0, 80)) + '”' : '') + '</div></div>'
    + '<select data-act-change="uptype" data-v="' + s.id + '" style="max-width:190px" title="Report type">' + Object.entries(UP_TYPES).map(([k, l]) => '<option value="' + k + '"' + (s.type === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
    + '<button class="small" data-act="uptoggle" data-v="' + s.id + '">' + (s.open ? 'Hide columns' : 'Adjust columns') + '</button><button class="small danger" data-act="upremove" data-v="' + s.id + '">✕</button></div>'
    + '<div class="small" style="margin-top:6px">' + mapped + ' columns mapped · ' + extra + ' kept as extra · ' + ign + ' ignored · ' + ps.used + ' rows used</div>'
    + '<div class="row" style="margin-top:6px;gap:4px">' + s.table.headers.map((hd, i) => '<span class="chip' + (s.map[i] === 'x' ? '' : !s.map[i] ? ' up' : ' own') + '" title="' + esc(s.map[i] === 'x' ? 'kept as extra field' : !s.map[i] ? 'ignored' : UP_LABEL[s.map[i]]) + '">' + esc(hd) + (s.map[i] && s.map[i] !== 'x' ? ' → ' + esc(UP_LABEL[s.map[i]]) : '') + '</span>').join('') + '</div>'
    + (s.open ? '<div class="tblwrap" style="margin-top:8px"><table class="t maptbl"><thead><tr><th>Column</th><th>Example</th><th>Goes into</th></tr></thead><tbody>' + s.table.headers.map((hd, i) => '<tr><td><b>' + esc(hd) + '</b></td><td class="small muted">' + esc(s.table.rows.slice(0, 3).map(r => r[i]).filter(Boolean).join(' | ').slice(0, 70)) + '</td><td><select data-act-change="upmap" data-v="' + s.id + '" data-i="' + i + '">' + opts(s.map[i]) + '</select></td></tr>').join('') + '</tbody></table></div>' : '')
    + '</div>';
}
function upRemember(){
  const U = UI.up; WS.mappings.up = WS.mappings.up || {}; WS.mappings.upSig = WS.mappings.upSig || {};
  for (const s of U.sources){ if (!s.table) continue; WS.mappings.upSig[s.type + '|' + s.table.headers.map(norm).join('|')] = s.map.slice(); const m = WS.mappings.up[s.type] = WS.mappings.up[s.type] || {}; s.table.headers.forEach((h, i) => { m[norm(h)] = s.map[i]; }); }
}
Object.assign(ACT, {
  upgo: async () => { const U = UI.up; upRemember(); const st = ingest(U.sources);
    for (const s of U.sources){ if (s.kind !== 'fleet' || !s.blob) continue; const r = st.fleet.find(x => x.id === s.id); if (!r) continue;
      const buf = await s.blob.arrayBuffer(); const ex = WS.files.find(x => x.accountId === r.accountId && x.name === s.file);
      if (ex){ ex.size = s.size; ex.added = Date.now(); await Store.putFile(ex.id, buf); } else { const meta = {id: uid('file'), accountId: r.accountId, name: s.file, mime: s.mime || 'application/vnd.ms-excel', size: s.size, added: Date.now(), kind: 'other'}; await Store.putFile(meta.id, buf); WS.files.push(meta); } } const first = st.roots[0] && WS.accounts.find(a => !a.parentId && a.name === st.roots[0].name); if (first) UI.biz = first.id;
    U.result = 'Imported: ' + st.accNew + ' new and ' + st.accUpd + ' updated accounts, ' + st.conNew + ' new and ' + st.conUpd + ' updated contacts, ' + st.links + ' parent/child links.' + (st.fleet.length ? ' Fleet Data forms: ' + st.fleet.map(x => x.account + ' (' + x.vehicles + ' vehicles, ' + x.drivers + ' drivers)').join('; ') + '.' : ''); U.sources = []; U.errors = []; touch(); },
  upclear: () => { UI.up = null; render(); },
  uperrclear: () => { UI.up.errors = []; render(); },
  uptoggle: el => { const s = UI.up.sources.find(x => x.id === el.dataset.v); s.open = !s.open; render(); },
  upremove: el => { UI.up.sources = UI.up.sources.filter(x => x.id !== el.dataset.v); render(); },
  upload: () => { UI.tab = 'import'; render(); setTimeout(() => { const i = $('#upFiles'); if (i) i.click(); }, 50); },
});
document.addEventListener('change', ev => {
  const t = ev.target; if (!UI.up && !/^(upFiles)$/.test(t.id)) return;
  if (t.id === 'upFiles'){ if (t.files.length) upAddFiles(Array.from(t.files)); t.value = ''; return; }
  const a = t.dataset.actChange; const U = UI.up; if (!U) return;
  if (a === 'uptype'){ const s = U.sources.find(x => x.id === t.dataset.v); s.type = t.value; s.map = upGuess(s.type, s.table.headers); render(); }
  if (a === 'upmap'){ const s = U.sources.find(x => x.id === t.dataset.v); s.map[+t.dataset.i] = t.value; render(); }
  if (a === 'upstage'){ WS.mappings.stageValues = WS.mappings.stageValues || {}; WS.mappings.stageValues[t.dataset.v] = t.value; touch(); render(); }
});
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, ev => { if (Lock.locked || !ev.dataTransfer || !Array.from(ev.dataTransfer.types || []).includes('Files')) return; ev.preventDefault(); document.body.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(t => document.addEventListener(t, ev => { if (t === 'dragleave' && ev.relatedTarget) return; document.body.classList.remove('dragging'); }));
document.addEventListener('drop', ev => {
  if (Lock.locked || !ev.dataTransfer || !ev.dataTransfer.files.length) return;
  if (ev.target.closest && ev.target.closest('input[type=file]')) return;
  ev.preventDefault(); upAddFiles(Array.from(ev.dataTransfer.files));
});

document.addEventListener('toggle', ev => { if (ev.target && ev.target.id === 'pasteBox') UI.pasteOpen = ev.target.open; }, true);
