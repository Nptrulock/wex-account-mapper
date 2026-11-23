/* ===================== Passcode lock ===================== */
const LOCK_NOTE = 'The passcode encrypts the data saved on this device. Because this is a public web page, it can’t stop anyone from opening the page itself — but without the passcode they can’t see or read any of your data.';
const Lock = {
  locked: true, lastActive: Date.now(), timer: null,
  defaults(){ return {autoLockMin: 15, encExport: true}; },
  async loadMeta(){ const m = await Store.rawGet('kv', 'lock'); return m && m.salt && m.ver ? {...Lock.defaults(), ...m} : null; },
  async saveMeta(m){ Vault.meta = m; await Store.rawPut('kv', 'lock', m); },
  fails(){ try { return JSON.parse(localStorage.getItem('am_fail') || '{"n":0,"until":0}'); } catch (e) { return {n: 0, until: 0}; } },
  setFails(f){ localStorage.setItem('am_fail', JSON.stringify(f)); },
  validNew(a, b){ if (String(a).length < 6) return 'Use at least 6 characters.'; if (a !== b) return 'The two passcodes don’t match.'; return ''; },

  show(mode, msg){
    Lock.locked = true; document.body.classList.add('locked');
    const el = $('#lockScreen'); el.classList.remove('hidden');
    let h = '<div class="lock-card"><div class="row" style="justify-content:center;margin-bottom:6px"><div class="logo" style="width:40px;height:40px;font-size:17px">AM</div></div><h2 style="text-align:center;margin:4px 0 2px">Account Mapper</h2>';
    if (mode === 'setup'){
      h += '<p class="muted small" style="text-align:center">Create a passcode for this browser. You’ll need it every time you open the app.</p>'
        + (Lock.legacy ? '<div class="warnbar">Existing data was found in this browser. It will be encrypted with this passcode.</div>' : '')
        + '<form novalidate id="lockForm" data-mode="setup" autocomplete="off"><label class="small">New passcode<input type="password" id="lp1" autocomplete="new-password" required minlength="6"></label><label class="small">Type it again<input type="password" id="lp2" autocomplete="new-password" required></label>'
        + '<div class="lock-err" id="lockErr">' + esc(msg || '') + '</div><button class="primary" style="width:100%" type="submit">Set passcode & open</button></form>'
        + '<p class="small muted">There is no recovery: if you forget it, the only option is to erase this browser’s data. Export backups regularly.</p>';
    } else if (mode === 'forgot'){
      h += '<div class="warnbar"><b>Forgot your passcode?</b> There is no backdoor and no reset. The only option is to <b>permanently erase</b> every account, contact and file stored in this browser. Anything not exported to a workspace file is lost.</div>'
        + '<form novalidate id="lockForm" data-mode="erase"><label class="small">Type <b>ERASE</b> to confirm<input id="eraseTxt" autocomplete="off"></label><div class="lock-err" id="lockErr">' + esc(msg || '') + '</div>'
        + '<div class="row"><button type="button" data-lock="back">Back</button><span class="spacer"></span><button class="danger" type="submit" id="eraseBtn">Erase this browser’s data</button></div></form>';
    } else {
      h += '<p class="muted small" style="text-align:center">Locked. Enter your passcode to continue.</p>'
        + '<form novalidate id="lockForm" data-mode="unlock"><input type="text" name="username" autocomplete="username" value="Account Mapper" class="hidden" readonly><label class="small">Passcode<input type="password" id="lp1" autocomplete="current-password" required autofocus></label>'
        + '<div class="lock-err" id="lockErr">' + esc(msg || '') + '</div><button class="primary" style="width:100%" type="submit" id="unlockBtn">Unlock</button></form>'
        + '<p style="text-align:center"><a href="#" data-lock="forgot" class="small">Forgot passcode?</a></p>';
    }
    h += '<div class="lock-note">🔒 <b>Your data stays in this browser. Nothing is uploaded.</b><br>' + esc(LOCK_NOTE) + '</div></div>';
    el.innerHTML = h;
    setTimeout(() => { const i = $('#lp1') || $('#eraseTxt'); if (i) i.focus(); }, 30);
  },

  async onSubmit(ev){
    ev.preventDefault();
    const f = ev.target, mode = f.dataset.mode, err = m => { $('#lockErr').textContent = m; };
    const btn = f.querySelector('button[type=submit]'); const label = btn.textContent;
    const busy = on => { btn.disabled = on; btn.textContent = on ? 'Working…' : label; };
    try {
      if (mode === 'setup'){
        const a = $('#lp1').value, b = $('#lp2').value; const bad = Lock.validNew(a, b); if (bad) return err(bad);
        busy(true); await Lock.setup(a); busy(false); await Lock.opened();
      } else if (mode === 'unlock'){
        const fl = Lock.fails(); const wait = Math.ceil((fl.until - Date.now()) / 1000);
        if (wait > 0) return err('Too many wrong tries. Wait ' + wait + ' s and try again.');
        busy(true); const ok = await Lock.unlock($('#lp1').value); busy(false);
        if (!ok){ const n = fl.n + 1; const until = n >= 5 ? Date.now() + Math.min(900, 30 * 2 ** (n - 5)) * 1000 : 0; Lock.setFails({n, until}); $('#lp1').value = ''; $('#lp1').focus(); return err('Wrong passcode.' + (n >= 5 ? ' Locked for ' + Math.round((until - Date.now()) / 1000) + ' s.' : '')); }
        Lock.setFails({n: 0, until: 0}); await Lock.opened();
      } else if (mode === 'erase'){
        if ($('#eraseTxt').value.trim() !== 'ERASE') return err('Type ERASE (capital letters) to confirm.');
        busy(true); await Store.clearAll(false); localStorage.removeItem('am_fail'); Vault.meta = null; Vault.key = null; Lock.legacy = false; busy(false);
        Lock.show('setup', 'All data in this browser was erased. Set a new passcode to start fresh.');
      }
    } catch (e) { busy(false); console.warn(e); err('Something went wrong: ' + e.message); }
  },

  /* first passcode: create lock record and encrypt any existing (legacy, unencrypted) data in one transaction */
  async setup(pass){
    const salt = ab2b64(Vault.rand(16)); const {key, ver} = await Vault.derive(pass, salt, Vault.ITER);
    const plainWs = await Store.rawGet('kv', 'ws');
    const ws = plainWs && !plainWs.enc ? migrate(plainWs) : blankWs();
    const files = {};
    for (const id of await Store.fileKeys()){ const r = await Store.rawGet('files', id); if (r != null && !r.enc) files[id] = await Vault.encryptData(r, key); }
    const meta = {...Lock.defaults(), v: 1, kdf: 'PBKDF2-SHA256', iter: Vault.ITER, salt, ver, created: Date.now()};
    await Store.putMany({ws: await Vault.encryptStr(JSON.stringify(ws), key), lock: meta}, files, false);
    Vault.meta = meta; Vault.key = key; Lock.legacy = false;
  },
  async unlock(pass){
    const m = Vault.meta; const {key, ver} = await Vault.derive(pass, m.salt, m.iter);
    if (!Vault.same(ver, m.ver)) return false;
    Vault.key = key; return true;
  },
  async opened(){
    try { WS = migrate(await Store.getWs()); } catch (e) { console.warn(e); WS = blankWs(); toast('Could not read saved data'); }
    Lock.locked = false; document.body.classList.remove('locked'); $('#lockScreen').classList.add('hidden'); $('#lockScreen').innerHTML = '';
    Lock.lastActive = Date.now();
    setSave(WS.accounts.length ? 'Saved in this browser (encrypted) ✓' : 'Nothing saved yet');
    render();
  },
  async lockNow(reason){
    if (Lock.locked) return;
    clearTimeout(saveTimer); clearTimeout(bgTimer);
    try { if (WS && Vault.key) await Store.putWs(WS); } catch (e) { console.warn(e); }
    WS = null; Vault.key = null; UI.modal = null; UI.imp = null; UI.up = null; UI.menu = false;
    for (const id of ['#main', '#side', '#mobileBiz', '#modalCard']) $(id).innerHTML = '';
    $('#modal').classList.add('hidden'); renderMenu(); Lock.closeDialog(null);
    Lock.show('unlock', reason || '');
  },
  check(){ if (!Lock.locked && Vault.meta && Date.now() - Lock.lastActive > (Vault.meta.autoLockMin || 15) * 60000) Lock.lockNow('Locked after ' + Vault.meta.autoLockMin + ' min of inactivity.'); },
  start(){
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach(t => document.addEventListener(t, () => { Lock.lastActive = Date.now(); }, {capture: true, passive: true}));
    document.addEventListener('visibilitychange', () => Lock.check());
    Lock.timer = setInterval(() => Lock.check(), 10000);
  },

  /* ---- passcode dialog (exports / imports / settings) ---- */
  dlg: null,
  ask({title, note = '', confirm = false, error = '', okLabel = 'OK'}){
    return new Promise(res => {
      Lock.closeDialog(null); Lock.dlg = res;
      const d = $('#pwDialog'); d.classList.remove('hidden');
      d.innerHTML = '<form novalidate class="lock-card" id="pwForm"><h3 style="margin:0 0 6px">' + esc(title) + '</h3>' + (note ? '<p class="small muted">' + esc(note) + '</p>' : '')
        + '<label class="small">Passcode<input type="password" id="pw1" autocomplete="off"></label>' + (confirm ? '<label class="small">Type it again<input type="password" id="pw2" autocomplete="off"></label>' : '')
        + '<div class="lock-err" id="pwErr">' + esc(error) + '</div><div class="row"><button type="button" data-lock="pwcancel">Cancel</button><span class="spacer"></span><button class="primary" type="submit">' + esc(okLabel) + '</button></div></form>';
      d.dataset.confirm = confirm ? '1' : '';
      setTimeout(() => $('#pw1') && $('#pw1').focus(), 30);
    });
  },
  closeDialog(val){ const d = $('#pwDialog'); if (d){ d.classList.add('hidden'); d.innerHTML = ''; } const r = Lock.dlg; Lock.dlg = null; if (r) r(val); },

  /* ---- settings ---- */
  settingsHtml(msg){
    const m = Vault.meta;
    return '<div class="mh"><h3>Settings & security</h3><button data-act="close">✕</button></div><div class="mb">'
      + (msg ? '<div class="okbar">' + esc(msg) + '</div>' : '')
      + '<div class="sec"><h4>Passcode</h4><p class="small muted">' + esc(LOCK_NOTE) + '</p>'
      + '<div class="f"><label for="cpOld">Current passcode</label><input type="password" id="cpOld" autocomplete="current-password"><span></span></div>'
      + '<div class="f"><label for="cpNew1">New passcode</label><input type="password" id="cpNew1" autocomplete="new-password"><span></span></div>'
      + '<div class="f"><label for="cpNew2">New passcode again</label><input type="password" id="cpNew2" autocomplete="new-password"><span></span></div>'
      + '<div class="lock-err" id="cpErr"></div><div class="row"><button class="primary" data-act="changepass" id="cpBtn">Change passcode</button><button data-act="locknow">🔒 Lock now</button></div></div>'
      + '<div class="sec"><h4>Auto-lock</h4><div class="row"><span>Lock after</span><select id="autoLockSel" data-act-change="autolock" style="max-width:160px">' + [1, 5, 10, 15, 30, 60, 120].map(n => '<option value="' + n + '"' + (n === m.autoLockMin ? ' selected' : '') + '>' + n + ' min</option>').join('') + '</select><span class="small muted">of no activity</span></div></div>'
      + '<div class="sec"><h4>Exports</h4><label class="row"><input type="checkbox" id="encExp" data-act-change="encexport"' + (m.encExport ? ' checked' : '') + '> Protect exported workspace files with a passcode (recommended)</label><p class="small muted">The other rep needs that passcode to open the file. Share it separately, not in the same message as the file.</p></div>'
      + '<div class="sec"><h4>Danger zone</h4><button class="danger" data-act="clearall">Erase all accounts, contacts & files…</button></div></div>';
  },
  async changePass(){
    const err = t => { $('#cpErr').textContent = t; };
    const old = $('#cpOld').value, a = $('#cpNew1').value, b = $('#cpNew2').value;
    const bad = Lock.validNew(a, b); if (bad) return err(bad);
    const btn = $('#cpBtn'); btn.disabled = true; btn.textContent = 'Re-encrypting…';
    try {
      const chk = await Vault.derive(old, Vault.meta.salt, Vault.meta.iter);
      if (!Vault.same(chk.ver, Vault.meta.ver)){ btn.disabled = false; btn.textContent = 'Change passcode'; return err('Current passcode is wrong.'); }
      clearTimeout(saveTimer);
      const salt = ab2b64(Vault.rand(16)); const {key, ver} = await Vault.derive(a, salt, Vault.ITER);
      const files = {};
      for (const id of await Store.fileKeys()){ const d = await Store.getFile(id); if (d != null) files[id] = await Vault.encryptData(d, key); }
      const wsRec = await Vault.encryptStr(JSON.stringify(WS), key);
      const meta = {...Vault.meta, iter: Vault.ITER, salt, ver, changed: Date.now()};
      await Store.putMany({ws: wsRec, lock: meta}, files, true);
      Vault.meta = meta; Vault.key = key;
      UI.modal = {kind: 'preview', html: Lock.settingsHtml('Passcode changed. All saved data was re-encrypted with the new passcode.')}; renderModal();
    } catch (e) { console.warn(e); btn.disabled = false; btn.textContent = 'Change passcode'; err('Could not change passcode: ' + e.message); }
  },

  /* ---- export / import encryption ---- */
  async sealExport(obj, pass){
    const salt = ab2b64(Vault.rand(16)); const {key} = await Vault.derive(pass, salt, Vault.ITER);
    const r = await Vault.encryptStr(JSON.stringify(obj), key);
    return {format: WS_FORMAT, encrypted: true, version: 1, note: 'Encrypted Account Mapper workspace. Open it in Account Mapper with its passcode.', kdf: {name: 'PBKDF2', hash: 'SHA-256', iter: Vault.ITER, salt}, cipher: 'AES-GCM', iv: r.iv, ct: ab2b64(r.ct)};
  },
  async openExport(j, pass){
    const {key} = await Vault.derive(pass, j.kdf.salt, j.kdf.iter);
    try { return JSON.parse(new TextDecoder().decode(await Vault.decrypt({iv: j.iv, ct: j.ct}, key))); } catch (e) { return null; }
  },
};
document.addEventListener('submit', ev => {
  if (ev.target.id === 'lockForm') return Lock.onSubmit(ev);
  if (ev.target.id === 'pwForm'){
    ev.preventDefault();
    const a = $('#pw1').value, needConfirm = $('#pwDialog').dataset.confirm === '1';
    if (needConfirm){ const bad = Lock.validNew(a, $('#pw2').value); if (bad){ $('#pwErr').textContent = bad; return; } }
    else if (!a){ $('#pwErr').textContent = 'Enter the passcode.'; return; }
    Lock.closeDialog(a);
  }
}, true);
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-lock]'); if (!el) return;
  ev.preventDefault(); ev.stopPropagation();
  const k = el.dataset.lock;
  if (k === 'forgot') Lock.show('forgot'); else if (k === 'back') Lock.show('unlock'); else if (k === 'pwcancel') Lock.closeDialog(null);
}, true);
