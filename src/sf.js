/* ===================== Optional: Salesforce (read-only) adapter =====================
   OFF until a Wex Salesforce admin provides a Connected App / External Client App
   Consumer Key. OAuth 2.0 Authorization Code + PKCE (no client secret, no passwords
   ever typed into this app). Read-only: only SOQL GET queries; it never writes to
   Salesforce and never sends data anywhere else. The access token lives in
   sessionStorage only (gone when the tab closes) and is never exported.
   The page CSP only allows these Salesforce hosts in connect-src. */
const SF_DEFAULT_INSTANCE = 'https://wexinc.my.salesforce.com';
const SF_API = 'v61.0';
const SF_HOST_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(my\.salesforce\.com|force\.com)$|^https:\/\/(login|test)\.salesforce\.com$/i;
const SF = {
  cfg(){ let c = {}; try { c = JSON.parse(localStorage.getItem('am_sf') || '{}'); } catch (e) {} return {instanceUrl: c.instanceUrl || SF_DEFAULT_INSTANCE, clientId: c.clientId || ''}; },
  saveCfg(c){ localStorage.setItem('am_sf', JSON.stringify({instanceUrl: c.instanceUrl, clientId: c.clientId})); },
  tok(){ try { return JSON.parse(sessionStorage.getItem('am_sf_tok') || 'null'); } catch (e) { return null; } },
  callback(){ return location.origin + location.pathname; },
  canRedirect(){ return /^https?:$/.test(location.protocol); },
  cleanUrl(u){ return String(u || '').trim().replace(/\/+$/, ''); },
  status: '', busy: false,
  async connect(){
    const c = SF.cfg();
    if (!SF_HOST_RE.test(c.instanceUrl)){ toast('Instance URL must be a Salesforce address, e.g. ' + SF_DEFAULT_INSTANCE); return; }
    if (!c.clientId){ toast('Enter the Consumer Key from your Salesforce admin first'); return; }
    if (!SF.canRedirect()){ toast('Connect works from the hosted site or installed app, not a file opened from disk'); return; }
    const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => ('0' + b.toString(16)).slice(-2)).join(''); };
    const verifier = rnd(48), state = rnd(16);
    const dig = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...dig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    sessionStorage.setItem('am_sf_pkce', JSON.stringify({verifier, state, instanceUrl: c.instanceUrl, clientId: c.clientId, redirect: SF.callback()}));
    const q = new URLSearchParams({response_type: 'code', client_id: c.clientId, redirect_uri: SF.callback(), code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'api'});
    location.assign(c.instanceUrl + '/services/oauth2/authorize?' + q.toString());
  },
  pending: null,
  /* called at page load (before unlock): take the OAuth response out of the address bar */
  capture(){ const p = new URLSearchParams(location.search); if (p.has('code') || p.has('error')){ SF.pending = p; history.replaceState(null, '', location.pathname); } },
  /* called after the app is unlocked */
  async handleRedirect(){
    const p = SF.pending; if (!p) return; SF.pending = null;
    const pk = JSON.parse(sessionStorage.getItem('am_sf_pkce') || 'null');
    sessionStorage.removeItem('am_sf_pkce');
    UI.tab = 'import';
    if (p.has('error')){ SF.status = 'Salesforce sign-in was not completed: ' + (p.get('error_description') || p.get('error')); return; }
    if (!pk || pk.state !== p.get('state')){ SF.status = 'Sign-in response did not match this browser session; try Connect again.'; return; }
    try {
      const body = new URLSearchParams({grant_type: 'authorization_code', code: p.get('code'), client_id: pk.clientId, redirect_uri: pk.redirect, code_verifier: pk.verifier});
      const r = await fetch(pk.instanceUrl + '/services/oauth2/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body, credentials: 'omit', referrerPolicy: 'no-referrer'});
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || ('HTTP ' + r.status));
      const inst = SF.cleanUrl(j.instance_url || pk.instanceUrl);
      if (!SF_HOST_RE.test(inst)) throw new Error('Unexpected Salesforce address ' + inst);
      sessionStorage.setItem('am_sf_tok', JSON.stringify({access: j.access_token, instanceUrl: inst, at: Date.now()}));
      SF.status = 'Connected to ' + inst + ' (read-only, this tab only).';
    } catch (e) { SF.status = 'Could not finish Salesforce sign-in: ' + e.message + '. If this says “Failed to fetch”, CORS is probably not enabled yet (see the admin checklist).'; }
  },
  disconnect(){ sessionStorage.removeItem('am_sf_tok'); SF.status = 'Disconnected.'; render(); },
  async query(soql){
    const t = SF.tok(); if (!t) throw new Error('Not connected');
    let url = t.instanceUrl + '/services/data/' + SF_API + '/query?q=' + encodeURIComponent(soql); const out = [];
    for (let i = 0; url && i < 20; i++){
      const r = await fetch(url, {headers: {Authorization: 'Bearer ' + t.access, Accept: 'application/json'}, credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (r.status === 401){ sessionStorage.removeItem('am_sf_tok'); throw new Error('Salesforce session expired — connect again'); }
      const j = await r.json(); if (!r.ok) throw new Error((j[0] && j[0].message) || ('HTTP ' + r.status));
      out.push(...j.records); url = j.nextRecordsUrl ? t.instanceUrl + j.nextRecordsUrl : null;
    }
    return out;
  },
  /* Pull one business: the account (by ID or exact name), up to 4 levels of children, their contacts, latest case & opportunity. */
  async pullBusiness(ref){
    ref = String(ref || '').trim(); if (!ref) throw new Error('Enter an Account ID or exact account name');
    const lit = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    const where = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(ref) ? 'Id = ' + lit(ref) : 'Name = ' + lit(ref);
    const top = await SF.query('SELECT Id FROM Account WHERE ' + where + ' LIMIT 2');
    if (!top.length) throw new Error('No account found for "' + ref + '"');
    if (top.length > 1) throw new Error('More than one account is named "' + ref + '" — use the Account ID');
    const rid = lit(top[0].Id);
    const accts = await SF.query('SELECT Id, Name, ParentId, Owner.Name, Owner.Email, Owner.Phone FROM Account WHERE Id = ' + rid + ' OR ParentId = ' + rid + ' OR Parent.ParentId = ' + rid + ' OR Parent.Parent.ParentId = ' + rid + ' OR Parent.Parent.Parent.ParentId = ' + rid + ' LIMIT 2000');
    const ids = accts.map(a => lit(a.Id)).join(',');
    const [cons, cases, opps] = await Promise.all([
      SF.query('SELECT Id, Name, Title, Email, Phone, AccountId FROM Contact WHERE AccountId IN (' + ids + ') LIMIT 5000'),
      SF.query('SELECT CaseNumber, AccountId FROM Case WHERE AccountId IN (' + ids + ') ORDER BY CreatedDate DESC LIMIT 2000').catch(() => []),
      SF.query('SELECT Id, Name, AccountId FROM Opportunity WHERE AccountId IN (' + ids + ') ORDER BY CreatedDate DESC LIMIT 2000').catch(() => [])]);
    const first = (list, id) => list.find(x => x.AccountId === id);
    const recs = accts.map(a => { const c = first(cases, a.Id), o = first(opps, a.Id); const r = {name: a.Name, sfId: a.Id};
      if (a.ParentId && a.Id !== top[0].Id) r.parentRef = a.ParentId; if (a.Owner){ if (a.Owner.Name) r.repName = a.Owner.Name; if (a.Owner.Email) r.repEmail = a.Owner.Email; if (a.Owner.Phone) r.repPhone = a.Owner.Phone; }
      if (c) r.caseNo = c.CaseNumber; if (o){ r.oppName = o.Name; r.oppId = o.Id; } return r; });
    // parents first so children can resolve parentRef
    const depth = r => { let d = 0, x = r; while (x && x.parentRef && d < 6){ x = recs.find(y => y.sfId === x.parentRef); d++; } return d; };
    recs.sort((a, b) => depth(a) - depth(b));
    const ra = applyImport('accounts', recs);
    const rc = applyImport('contacts', cons.map(c => ({name: c.Name, title: c.Title || '', email: c.Email || '', phone: c.Phone || '', accountRef: c.AccountId})));
    const root = findAccount(top[0].Id); if (root) UI.biz = rootOf(root).id;
    touch();
    return 'Pulled ' + accts.length + ' account(s) (' + ra.created + ' new, ' + ra.updated + ' updated) and ' + cons.length + ' contact(s) from Salesforce.';
  },
};
DataSources.register({id: 'salesforce-api', label: 'Salesforce (read-only, OAuth + PKCE)', kind: 'remote', connect: SF.connect, pull: SF.pullBusiness});

function sfCard(){
  const c = SF.cfg(), t = SF.tok();
  return '<div class="card" id="sfCard"><div class="row"><h3 style="margin:0">Salesforce connection <span class="small muted">(optional, read-only)</span></h3><span class="spacer"></span>' + (t ? '<span class="badge st-mc">Connected</span>' : '<span class="badge up">Not connected</span>') + '</div>'
    + (SF.status ? '<div class="' + (/Could not|not completed|did not|expired/.test(SF.status) ? 'warnbar' : 'okbar') + '" style="margin-top:8px">' + esc(SF.status) + '</div>' : '')
    + (t ? '<div class="row" style="margin-top:8px"><input id="sfRef" placeholder="Account ID or exact account name" style="max-width:340px"><button class="primary" data-act="sfpull">Pull business from Salesforce</button><button data-act="sfdisconnect">Disconnect</button></div><div class="small muted" style="margin-top:4px">Reads the account, children (4 levels), contacts, latest case and opportunity. Nothing is written back to Salesforce.</div>'
      : '<div class="f" style="margin-top:10px"><label for="sfInst">Instance URL</label><input id="sfInst" data-sf="instanceUrl" value="' + esc(c.instanceUrl) + '"><span></span></div>'
      + '<div class="f"><label for="sfClient">Consumer Key</label><input id="sfClient" data-sf="clientId" value="' + esc(c.clientId) + '" placeholder="from your Salesforce admin (not a password)"><span></span></div>'
      + '<div class="f"><label>Callback URL</label><input readonly value="' + esc(SF.callback()) + '"><button class="cp" data-act="copy" data-text="' + esc(SF.callback()) + '" data-what="callback URL">📋</button></div>'
      + '<div class="row"><button class="primary" data-act="sfconnect"' + (c.clientId ? '' : ' disabled') + '>Connect to Salesforce</button><span class="small muted">You sign in on Salesforce’s own page. Never paste passwords or secrets here.</span></div>'
      + '<details style="margin-top:8px"><summary class="small"><b>Admin checklist</b> (needed once, before Connect works)</summary><ol class="small" style="margin:6px 0 0 18px;line-height:1.6">'
      + '<li>Get approval from Wex IT / Information Security for this tool to read Salesforce data.</li>'
      + '<li>Salesforce admin creates an <b>External Client App</b> (or Connected App) with OAuth enabled: scope <span class="kbd">api</span>, <b>Require PKCE</b> on, <b>no client secret required</b> for the web flow, callback URL <span class="kbd">' + esc(SF.callback()) + '</span>. They send you the Consumer Key.</li>'
      + '<li><b>CORS:</b> in the <b>wexinc</b> org, Setup → CORS → add <span class="kbd">https://nptrulock.github.io</span> to Allowed Origins, and turn on <b>Enable CORS for OAuth endpoints</b> (Setup → CORS settings). Without this the browser blocks the sign-in and queries.</li>'
      + '<li>Permitted users / profiles assigned to the app per Wex policy. Each rep signs in as themselves, so normal Salesforce sharing still applies.</li></ol></details>')
    + '</div>';
}
