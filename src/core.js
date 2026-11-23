'use strict';
/* =====================================================================
   Account Mapper — local-only, single-file app.
   NO network access: the page's Content-Security-Policy sets
   connect-src 'none' and default-src 'none'. All data lives in this
   browser (IndexedDB, with localStorage fallback) and in files you export.
   ===================================================================== */
const APP_VERSION = '1.5.0';
const WS_FORMAT = 'account-mapper-workspace';

const STAGES = [
  {id:'app',  label:'Application Follow-up', short:'App Follow-up', n:1},
  {id:'impl', label:'Implementation Call',   short:'Impl. Call',   n:2},
  {id:'mc',   label:'Monitor & Control',     short:'Monitor & Control', n:3},
];
const STAGE = Object.fromEntries(STAGES.map(s=>[s.id,s]));

const SHOWN_FIELDS = () => ACCOUNT_FIELDS.filter(f => !f.hidden);
const ACCOUNT_FIELDS = [
  {k:'name',        label:'Business Name'},
  {k:'sfId',        label:'Salesforce Account ID', hidden:true},   // kept for linking uploads; not shown or exported (Noah: not needed)
  {k:'caseNo',      label:'Case #'},
  {k:'oppName',     label:'Opportunity Name', hidden:true},
  {k:'oppNo',       label:'Opportunity #'},
  {k:'oppId',       label:'Opportunity ID'},
  {k:'repName',     label:'Rep Name'},
  {k:'repEmail',    label:'Rep Email'},
  {k:'repPhone',    label:'Rep Phone', hidden:true},
  {k:'stage',       label:'Stage'},
  {k:'billMode',    label:'Billing Mode'},
  {k:'creditLimit', label:'Credit Line Limit'},
  {k:'billCycle',   label:'Billing Cycle'},
  {k:'terms',       label:'Payment Terms'},
  {k:'billContact', label:'Billing Contact'},
  {k:'notes',       label:'Notes'},
];
const CONTACT_FIELDS = [
  {k:'name',  label:'Name'},
  {k:'title', label:'Title'},
  {k:'email', label:'Email'},
  {k:'phone', label:'Phone'},
  {k:'role',  label:'Role'},
];
const BILL_CYCLES = ['','Weekly','Bi-weekly','Semi-monthly','Monthly','Daily'];

/* ---------- small utils ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const norm = s => String(s ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, ' ').replace(/[^a-z0-9#& ]/g, '').trim();
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
const safeFile = s => String(s || 'file').replace(/^sample:\s*/i, 'Sample ').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'file';
function parseMoney(v){ if (v == null || v === '') return null; const s = String(v).replace(/[A-Za-z$€£¥,\s]/g, ''); if (!s || !/\d/.test(s)) return null; const n = Number(s); return isFinite(n) ? n : null; }
function fmtMoney(v){ const n = parseMoney(v); if (n == null) return ''; return '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2}); }
function fmtBytes(n){ if (n < 1024) return n + ' B'; if (n < 1048576) return (n/1024).toFixed(1) + ' KB'; return (n/1048576).toFixed(1) + ' MB'; }
function parseStage(v){
  const s = norm(v); if (!s) return null;
  if (/monitor|control|m&c|^mc$|live|complete/.test(s)) return 'mc';
  if (/impl/.test(s)) return 'impl';
  if (/app|follow|new|pending|prospect/.test(s)) return 'app';
  return null;
}
function parseBillMode(v){
  const s = norm(v); if (!s) return null;
  if (/own|child|self|individual|separate|location/.test(s)) return 'own';
  if (/parent|roll|master|corporate|hq/.test(s)) return 'parent';
  return null;
}
function ab2b64(buf){ const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function b642ab(b64){ const s = atob(b64); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b.buffer; }

/* ---------- CSV ---------- */
function detectDelim(text){
  const line = text.split(/\r?\n/).find(l => l.trim()) || '';
  let inQ = false; const c = {',':0,'\t':0,';':0,'|':0};
  for (const ch of line){ if (ch === '"') inQ = !inQ; else if (!inQ && ch in c) c[ch]++; }
  if (c['\t'] > 0) return '\t';
  let best = ',', bn = 0; for (const k in c) if (c[k] > bn){ bn = c[k]; best = k; }
  return best;
}
function parseCSV(text, delim){
  text = String(text || '').replace(/^\uFEFF/, '');
  delim = delim || detectDelim(text);
  const rows = []; let row = [], f = '', i = 0, q = false; const n = text.length;
  while (i < n){
    const ch = text[i];
    if (q){
      if (ch === '"'){ if (text[i+1] === '"'){ f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += ch; i++; continue;
    }
    if (ch === '"' && f === ''){ q = true; i++; continue; }
    if (ch === delim){ row.push(f); f = ''; i++; continue; }
    if (ch === '\r'){ i++; continue; }
    if (ch === '\n'){ row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += ch; i++;
  }
  if (f !== '' || row.length){ row.push(f); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function csvCell(v){ const s = String(v ?? ''); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(rows){ return rows.map(r => r.map(csvCell).join(',')).join('\r\n'); }
function tsvCell(v){ return String(v ?? '').replace(/[\t\r\n]+/g, ' '); }
function toTSV(rows){ return rows.map(r => r.map(tsvCell).join('\t')).join('\n'); }
/* Salesforce report exports add footer lines (totals, "Generated By", copyright). Drop them. */
function cleanReportRows(rows){
  if (!rows.length) return rows;
  const w = rows[0].length;
  let out = rows.slice();
  while (out.length > 1){
    const r = out[out.length - 1]; const filled = r.filter(c => String(c).trim()).length;
    const txt = r.join(' ');
    if (/copyright|salesforce\.com|confidential information|generated by|^\s*total\b|grand total/i.test(txt) || (w > 2 && filled <= 1)) out.pop(); else break;
  }
  return out;
}

/* ---------- ZIP (store, no compression) ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const enc = new TextEncoder();
function makeZip(files){
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = []; let offset = 0;
  for (const f of files){
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(f.data);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {type: 'application/zip'});
}

/* ---------- XLSX writer (hand-written SpreadsheetML in a zip) ---------- */
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const xesc = s => String(s ?? '').replace(XML_BAD, '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function colName(i){ let s = ''; i++; while (i > 0){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
const NUM_RE = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;   // leading-zero values (IDs, ZIPs, card #s) stay text
function sheetName(raw, used){
  let s = String(raw || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '');
  if (!s || /^history$/i.test(s)) s = 'Sheet';
  s = s.slice(0, 31).trim();
  let name = s, n = 2;
  while (used.has(name.toLowerCase())){ const suf = ' (' + n++ + ')'; name = s.slice(0, 31 - suf.length).trim() + suf; }
  used.add(name.toLowerCase());
  return name;
}
/* sheets: [{name, rows:[[cell]], header:rowIndex|-1, widths?:[n]}]; cell = value or {v, s, t:'n'|'s'} ; styles: 1=header 2=title 3=currency 4=bold */
function buildXlsx(sheets){
  const used = new Set();
  sheets.forEach(s => s.finalName = sheetName(s.name, used));
  const files = [];
  const ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'];
  sheets.forEach((s, i) => ct.push('<Override PartName="/xl/worksheets/sheet' + (i+1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'));
  ct.push('</Types>');
  files.push({name:'[Content_Types].xml', data: ct.join('')});
  files.push({name:'_rels/.rels', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'});
  const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files.push({name:'docProps/core.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Account Mapper (local)</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified></cp:coreProperties>'});
  files.push({name:'docProps/app.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Account Mapper</Application></Properties>'});
  const wb = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'];
  sheets.forEach((s, i) => wb.push('<sheet name="' + xesc(s.finalName) + '" sheetId="' + (i+1) + '" r:id="rId' + (i+1) + '"/>'));
  wb.push('</sheets></workbook>');
  files.push({name:'xl/workbook.xml', data: wb.join('')});
  const rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'];
  sheets.forEach((s, i) => rels.push('<Relationship Id="rId' + (i+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i+1) + '.xml"/>'));
  rels.push('<Relationship Id="rId' + (sheets.length+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  files.push({name:'xl/_rels/workbook.xml.rels', data: rels.join('')});
  files.push({name:'xl/styles.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE3EC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'});
  sheets.forEach((s, i) => {
    const rows = s.rows || [];
    const ncol = Math.max(1, ...rows.map(r => r.length));
    const widths = [];
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    const hdr = s.header ?? 0;
    if (hdr >= 0 && rows.length > hdr + 1) out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + (hdr+1) + '" topLeftCell="A' + (hdr+2) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    else out.push('<sheetViews><sheetView workbookViewId="0"/></sheetViews>');
    out.push('<sheetFormatPr defaultRowHeight="15"/>');
    const body = [];
    rows.forEach((r, ri) => {
      const cells = [];
      r.forEach((cell, ci) => {
        let v = cell, st = 0, t = null;
        if (cell && typeof cell === 'object'){ v = cell.v; st = cell.s || 0; t = cell.t || null; }
        if (ri === hdr && !st) st = 1;
        if (v == null || v === ''){ if (st) cells.push('<c r="' + colName(ci) + (ri+1) + '" s="' + st + '"/>'); return; }
        const sv = String(v);
        widths[ci] = Math.max(widths[ci] || 0, Math.min(60, sv.length + 2));
        const ref = colName(ci) + (ri+1);
        const isNum = t === 'n' || (t !== 's' && (typeof v === 'number' || (ri !== hdr && NUM_RE.test(sv.trim()))));
        if (isNum && isFinite(Number(sv))) cells.push('<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + Number(sv) + '</v></c>');
        else cells.push('<c r="' + ref + '" t="inlineStr"' + (st ? ' s="' + st + '"' : '') + '><is><t xml:space="preserve">' + xesc(sv.slice(0, 32767)) + '</t></is></c>');
      });
      body.push('<row r="' + (ri+1) + '">' + cells.join('') + '</row>');
    });
    const w = s.widths || widths;
    const cols = [];
    for (let c = 0; c < ncol; c++) cols.push('<col min="' + (c+1) + '" max="' + (c+1) + '" width="' + Math.max(8, Math.min(60, w[c] || 10)) + '" customWidth="1"/>');
    out.push('<cols>' + cols.join('') + '</cols>');
    out.push('<sheetData>' + body.join('') + '</sheetData>');
    if (hdr >= 0 && rows.length > hdr + 1 && s.filter !== false) out.push('<autoFilter ref="A' + (hdr+1) + ':' + colName(ncol-1) + rows.length + '"/>');
    out.push('</worksheet>');
    files.push({name:'xl/worksheets/sheet' + (i+1) + '.xml', data: out.join('')});
  });
  return makeZip(files.map(f => ({name: f.name, data: f.data})));
}

/* ---------- Vault: passcode-derived encryption (WebCrypto) ----------
   PBKDF2-SHA256 (600k iterations, random 16-byte salt) -> 512 bits.
   First 256 bits = AES-GCM-256 key (non-extractable). SHA-256 of the last
   256 bits = verifier stored in the lock record (the passcode itself is never stored).
   Every stored record is AES-GCM encrypted with a fresh 96-bit IV. */
const Vault = {
  key: null, meta: null, ITER: 600000,
  rand(n){ const a = new Uint8Array(n); crypto.getRandomValues(a); return a; },
  async derive(pass, saltB64, iter){
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: new Uint8Array(b642ab(saltB64)), iterations: iter, hash: 'SHA-256'}, base, 512));
    const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
    const ver = ab2b64(await crypto.subtle.digest('SHA-256', bits.slice(32)));
    bits.fill(0);
    return {key, ver};
  },
  same(a, b){ a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; },
  async encrypt(u8, key = this.key){ if (!key) throw new Error('locked'); const iv = this.rand(12); const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, u8); return {enc: 1, iv: ab2b64(iv), ct}; },
  async decrypt(r, key = this.key){ if (!key) throw new Error('locked'); const ct = typeof r.ct === 'string' ? b642ab(r.ct) : r.ct; return crypto.subtle.decrypt({name: 'AES-GCM', iv: new Uint8Array(b642ab(r.iv))}, key, ct); },
  async encryptStr(s, key){ return this.encrypt(enc.encode(s), key); },
  async encryptData(d, key){ const isStr = typeof d === 'string'; const r = await this.encrypt(isStr ? enc.encode(d) : new Uint8Array(d), key); r.t = isStr ? 's' : 'b'; return r; },
  async decryptData(r, key){ const buf = await this.decrypt(r, key); return r.t === 's' ? new TextDecoder().decode(buf) : buf; },
};

/* ---------- Storage (IndexedDB, localStorage fallback). Data records are always encrypted. ---------- */
const Store = {
  db: null, mode: 'idb', mem: new Map(),
  async open(){
    try {
      if (!window.indexedDB) throw new Error('no idb');
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('account-mapper', 1);
        r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('files')) d.createObjectStore('files'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
      });
    } catch (e) { this.mode = 'local'; }
  },
  _tx(store, mode, fn){
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode); const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    });
  },
  _ls(v){ if (v && v.enc && typeof v.ct !== 'string') return {...v, ct: ab2b64(v.ct)}; return v; },
  async rawGet(store, key){ if (this.mode === 'idb') return this._tx(store, 'readonly', s => s.get(key)); if (store === 'kv'){ try { const t = localStorage.getItem('am_' + key); return t ? JSON.parse(t) : undefined; } catch (e) { return undefined; } } return this.mem.get(key); },
  async rawPut(store, key, val){ if (this.mode === 'idb') return this._tx(store, 'readwrite', s => s.put(val, key)); if (store === 'kv') localStorage.setItem('am_' + key, JSON.stringify(this._ls(val))); else this.mem.set(key, val); },
  async rawDel(store, key){ if (this.mode === 'idb') return this._tx(store, 'readwrite', s => s.delete(key)); if (store === 'kv') localStorage.removeItem('am_' + key); else this.mem.delete(key); },
  async fileKeys(){ if (this.mode === 'idb') return this._tx('files', 'readonly', s => s.getAllKeys()); return [...this.mem.keys()]; },
  /* atomic multi-write (one IndexedDB transaction) — used for migration and passcode change */
  async putMany(kv, files, wipeFiles){
    if (this.mode !== 'idb'){ if (wipeFiles) this.mem.clear(); for (const k in kv) await this.rawPut('kv', k, kv[k]); for (const k in files) this.mem.set(k, files[k]); return; }
    return new Promise((res, rej) => {
      const t = this.db.transaction(['kv', 'files'], 'readwrite'); const ks = t.objectStore('kv'), fs = t.objectStore('files');
      if (wipeFiles) fs.clear();
      for (const k in kv) ks.put(kv[k], k); for (const k in files) fs.put(files[k], k);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    });
  },
  async getWs(){ const r = await this.rawGet('kv', 'ws'); if (!r) return null; if (r.enc) return JSON.parse(new TextDecoder().decode(await Vault.decrypt(r))); return r; },
  async putWs(ws){ return this.rawPut('kv', 'ws', await Vault.encryptStr(JSON.stringify(ws))); },
  async getFile(id){ const r = await this.rawGet('files', id); if (r == null) return r; return r.enc ? Vault.decryptData(r) : r; },
  async putFile(id, data){ return this.rawPut('files', id, await Vault.encryptData(data)); },
  async delFile(id){ return this.rawDel('files', id); },
  async clearAll(keepLock){
    const lock = keepLock ? await this.rawGet('kv', 'lock') : null;
    if (this.mode === 'idb'){ await this._tx('kv', 'readwrite', s => s.clear()); await this._tx('files', 'readwrite', s => s.clear()); }
    else { ['ws', 'lock'].forEach(k => localStorage.removeItem('am_' + k)); this.mem.clear(); }
    if (lock) await this.rawPut('kv', 'lock', lock);
  },
};

/* ---------- Data-source adapters ----------
   Every source turns outside data into plain records, then hands them to
   applyImport(type, records, opts). Built in: 'paste' (clipboard text) and
   'csv' (Salesforce report export), 'upload' (multi-file exports, src/upload.js).
   All are local: the app has no network access by design. */
const DataSources = {
  list: [],
  register(src){ this.list.push(src); },
  get(id){ return this.list.find(s => s.id === id); },
};
DataSources.register({ id:'paste', label:'Paste from Salesforce', kind:'local', toTable: text => tableFromText(text) });
DataSources.register({ id:'csv', label:'Salesforce report CSV', kind:'local', toTable: text => { const rows = cleanReportRows(parseCSV(text)); return {headers: rows[0] || [], rows: rows.slice(1)}; } });
DataSources.register({ id:'upload', label:'Salesforce report exports (.xls/.xlsx/.csv)', kind:'local', note:'read in-browser by readers.js + upload.js' });

function tableFromText(text){
  text = String(text || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const first = lines.find(l => l.trim()) || '';
  const delim = detectDelim(text);
  const firstCols = parseCSV(first, delim)[0] || [];
  if (firstCols.length >= 3 || !looksKV(lines)){
    const rows = cleanReportRows(parseCSV(text, delim));
    return {headers: rows[0] || [], rows: rows.slice(1)};
  }
  // "Label: value" or "Label<TAB>value" blocks; blank line separates records
  const recs = []; let cur = null; const headers = [];
  for (const raw of lines){
    const l = raw.trim();
    if (!l){ cur = null; continue; }
    const m = l.match(/^([^:\t]{1,60})(?::\s*|\t+)(.*)$/);
    if (!m) continue;
    const k = m[1].trim(), v = m[2].trim();
    if (!cur){ cur = {}; recs.push(cur); }
    if (k in cur){ cur = {}; recs.push(cur); }
    cur[k] = v; if (!headers.includes(k)) headers.push(k);
  }
  if (recs.length) return {headers, rows: recs.map(r => headers.map(h => r[h] ?? ''))};
  const rows = parseCSV(text, delim);
  return {headers: rows[0] || [], rows: rows.slice(1)};
}
function looksKV(lines){ const ne = lines.filter(l => l.trim()); return ne.length >= 2 && ne.filter(l => /^[^:\t]{1,60}(:\s|\t)/.test(l.trim())).length / ne.length > 0.8 && ne.every(l => l.split('\t').length <= 2); }
