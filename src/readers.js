/* ===================== Spreadsheet readers (all local, no libraries) =====================
   Salesforce exports come as: CSV; "Excel .xls" that is really an HTML table (Classic
   Export Details) or SpreadsheetML 2003 XML; genuine Excel 97-2003 BIFF8 .xls; or .xlsx
   (Lightning formatted / details exports). Every reader returns [{name, rows:[[string]]}]. */

/* ---- raw DEFLATE (for .xlsx) ---- */
const inflateRaw = (() => {
  const LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  function build(lengths){
    const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(lengths.length);
    for (const l of lengths) count[l]++; count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i-1] + count[i-1];
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
    return {count, symbol};
  }
  const fl = []; for (let i = 0; i < 288; i++) fl.push(i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8);
  const FIXL = build(fl), FIXD = build(new Array(30).fill(5));
  return function(data, sizeHint){
    let p = 0, bb = 0, bc = 0, op = 0; let out = new Uint8Array(Math.max(1024, sizeHint || data.length * 4));
    const need = n => { if (op + n > out.length){ const o = new Uint8Array(Math.max(out.length * 2, op + n)); o.set(out); out = o; } };
    const bits = n => { while (bc < n){ if (p >= data.length) throw new Error('compressed data ended early'); bb |= data[p++] << bc; bc += 8; } const v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v; };
    const decode = h => { let code = 0, first = 0, index = 0; for (let len = 1; len < 16; len++){ code |= bits(1); const c = h.count[len]; if (code - c < first) return h.symbol[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; } throw new Error('bad compressed data'); };
    let last;
    do {
      last = bits(1); const type = bits(2);
      if (type === 0){ bb = 0; bc = 0; const len = data[p] | (data[p+1] << 8); p += 4; need(len); out.set(data.subarray(p, p + len), op); op += len; p += len; }
      else if (type === 1 || type === 2){
        let lh, dh;
        if (type === 1){ lh = FIXL; dh = FIXD; }
        else {
          const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4; const cl = new Array(19).fill(0);
          for (let i = 0; i < ncode; i++) cl[CLORD[i]] = bits(3);
          const ch = build(cl); const lens = [];
          while (lens.length < nlen + ndist){ const sym = decode(ch); if (sym < 16) lens.push(sym); else { let rep, val = 0; if (sym === 16){ val = lens[lens.length - 1]; rep = 3 + bits(2); } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7); while (rep--) lens.push(val); } }
          lh = build(lens.slice(0, nlen)); dh = build(lens.slice(nlen));
        }
        for (;;){ const sym = decode(lh); if (sym < 256){ need(1); out[op++] = sym; } else if (sym === 256) break; else { const s = sym - 257; const len = LBASE[s] + bits(LEXT[s]); const ds = decode(dh); const dist = DBASE[ds] + bits(DEXT[ds]); need(len); for (let i = 0; i < len; i++){ out[op] = out[op - dist]; op++; } } }
      } else throw new Error('bad compressed block');
    } while (!last);
    return out.subarray(0, op);
  };
})();
function unzip(u8){
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50){ e = i; break; }
  if (e < 0) throw new Error('not a valid .xlsx (zip) file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
  for (let k = 0; k < n; k++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = u8.subarray(ds, ds + csize);
    files[name.replace(/^\//, '')] = () => method === 0 ? raw : method === 8 ? inflateRaw(raw, usize) : (() => { throw new Error('unsupported zip compression'); })();
    p += 46 + nl + xl + cl;
  }
  return files;
}

/* ---- shared helpers ---- */
const BUILTIN_DATE_FMT = new Set([14,15,16,17,18,19,20,21,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58]);
function isDateFmt(id, code){
  if (BUILTIN_DATE_FMT.has(+id)) return true; if (!code) return false;
  const s = String(code).replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''); return /[ymd]/i.test(s) && !/[#?]/.test(s) && !/^general$/i.test(s);
}
function serialToText(n, code, d1904){
  const ms = Math.round(((d1904 ? n + 1462 : n) - 25569) * 86400000);
  const d = new Date(ms); if (isNaN(d)) return String(n);
  let s = (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + d.getUTCFullYear();
  if (n % 1 && /h/i.test(String(code || '')) || (n % 1 && +code === 22)){ let h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; s += ' ' + h + ':' + m + ' ' + ap; }
  return s;
}
const numText = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
const cleanCell = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
function decodeText(u8){
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  if (u8.length > 3 && u8[1] === 0 && u8[3] === 0 && u8[0] !== 0) return new TextDecoder('utf-16le').decode(u8);
  const head = new TextDecoder('latin1').decode(u8.subarray(0, 2048));
  const m = head.match(/charset\s*=\s*["']?([\w-]+)/i) || head.match(/encoding\s*=\s*["']([\w-]+)/i);
  if (m){ try { return new TextDecoder(m[1].toLowerCase()).decode(u8); } catch (e) {} }
  try { return new TextDecoder('utf-8', {fatal: true}).decode(u8); } catch (e) { return new TextDecoder('windows-1252').decode(u8); }
}

/* ---- .xlsx ---- */
function readXlsx(u8){
  const z = unzip(u8); const dp = new DOMParser();
  const xml = n => { const f = z[n]; return f ? dp.parseFromString(new TextDecoder().decode(f()), 'application/xml') : null; };
  const tags = (doc, t) => doc ? Array.from(doc.getElementsByTagNameNS('*', t)) : [];
  const wb = xml('xl/workbook.xml'); if (!wb) throw new Error('missing workbook in .xlsx');
  const d1904 = tags(wb, 'workbookPr').some(e => /^(1|true)$/.test(e.getAttribute('date1904') || ''));
  const rels = {}; tags(xml('xl/_rels/workbook.xml.rels'), 'Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const sst = tags(xml('xl/sharedStrings.xml'), 'si').map(si => tags(si, 't').filter(t => !(t.parentNode && t.parentNode.localName === 'rPh')).map(t => t.textContent).join(''));
  const st = xml('xl/styles.xml'); const fmts = {}; tags(st, 'numFmt').forEach(f => { fmts[f.getAttribute('numFmtId')] = f.getAttribute('formatCode'); });
  const cx = tags(st, 'cellXfs')[0]; const xfFmt = cx ? Array.from(cx.children).filter(e => e.localName === 'xf').map(x => x.getAttribute('numFmtId') || '0') : [];
  const colIdx = ref => { let c = 0; for (const ch of String(ref).replace(/\d+$/, '')) c = c * 26 + (ch.toUpperCase().charCodeAt(0) - 64); return c - 1; };
  return tags(wb, 'sheet').map(s => {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    let target = rels[rid] || ''; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const doc = xml(target); const rows = [];
    tags(doc, 'row').forEach((r, ri) => {
      const rn = (+r.getAttribute('r') || ri + 1) - 1; const row = rows[rn] = rows[rn] || [];
      let auto = 0;
      Array.from(r.children).filter(c => c.localName === 'c').forEach(c => {
        const ref = c.getAttribute('r'); const ci = ref ? colIdx(ref) : auto; auto = ci + 1;
        const t = c.getAttribute('t'); const v = tags(c, 'v')[0]; let val = '';
        if (t === 's') val = sst[+(v && v.textContent)] ?? '';
        else if (t === 'inlineStr') val = tags(c, 't').map(x => x.textContent).join('');
        else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
        else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
        else if (v){ const n = +v.textContent; const fid = xfFmt[+(c.getAttribute('s') || 0)] || '0'; val = isFinite(n) && isDateFmt(fid, fmts[fid]) ? serialToText(n, fmts[fid] || fid, d1904) : (isFinite(n) ? numText(n) : v.textContent); }
        row[ci] = cleanCell(val);
      });
    });
    for (let i = 0; i < rows.length; i++){ rows[i] = rows[i] || []; for (let j = 0; j < rows[i].length; j++) if (rows[i][j] == null) rows[i][j] = ''; }
    return {name: s.getAttribute('name') || 'Sheet', rows};
  });
}

/* ---- Excel 97-2003 (BIFF8 inside an OLE compound file) ---- */
function readCFB(u8){
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ssz = 1 << dv.getUint16(30, true), mssz = 1 << dv.getUint16(32, true);
  const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true), miniFatStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true);
  const off = s => (s + 1) * ssz; const END = 0xFFFFFFFA;
  const fatSecs = []; for (let i = 0; i < 109 && fatSecs.length < nFat; i++){ const s = dv.getUint32(76 + i * 4, true); if (s < END) fatSecs.push(s); }
  let d = difStart, g = 0; const per = ssz / 4 - 1;
  while (fatSecs.length < nFat && d < END && g++ < 100000){ const o = off(d); for (let i = 0; i < per && fatSecs.length < nFat; i++){ const s = dv.getUint32(o + i * 4, true); if (s < END) fatSecs.push(s); } d = dv.getUint32(o + per * 4, true); }
  const table = secs => { const t = new Uint32Array(secs.length * ssz / 4); secs.forEach((s, i) => { for (let j = 0; j < ssz / 4; j++) t[i * ssz / 4 + j] = off(s) + j * 4 + 4 <= u8.length ? dv.getUint32(off(s) + j * 4, true) : 0xFFFFFFFE; }); return t; };
  const fat = table(fatSecs);
  const chain = (start, t) => { const out = []; let s = start, k = 0; while (s < END && s < t.length && k++ < 2000000){ out.push(s); s = t[s]; } return out; };
  const readChain = (start, t, size, src, bs) => { const secs = chain(start, t); const buf = new Uint8Array(secs.length * bs); secs.forEach((s, i) => { const o = src === u8 ? off(s) : s * bs; buf.set(src.subarray(o, o + bs), i * bs); }); return size != null ? buf.subarray(0, size) : buf; };
  const dir = readChain(dirStart, fat, null, u8, ssz); const ddv = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128){ const nl = ddv.getUint16(o + 64, true); if (!nl){ entries.push(null); continue; } let name = ''; for (let i = 0; i < nl / 2 - 1; i++) name += String.fromCharCode(ddv.getUint16(o + i * 2, true)); entries.push({name, type: dir[o + 66], start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true)}); }
  let mini = null, minifat = null;
  return {
    names: entries.filter(Boolean).map(e => e.name),
    get(name){
      const e = entries.find(x => x && x.type === 2 && x.name.toLowerCase() === name.toLowerCase()); if (!e) return null;
      if (e.size < cutoff){ if (!mini){ mini = readChain(entries[0].start, fat, null, u8, ssz); minifat = table(chain(miniFatStart, fat)); } return readChain(e.start, minifat, e.size, mini, mssz); }
      return readChain(e.start, fat, e.size, u8, ssz);
    }};
}
function readBiff(u8){
  const cfb = readCFB(u8); const wb = cfb.get('Workbook') || cfb.get('Book');
  if (!wb) throw new Error('this .xls has no workbook stream');
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const recs = []; let p = 0;
  while (p + 4 <= wb.length){ const type = dv.getUint16(p, true), len = dv.getUint16(p + 2, true); recs.push({type, off: p + 4, len, at: p}); p += 4 + len; }
  if (!recs.length || recs[0].type !== 0x0809) throw new Error('not an Excel 97-2003 workbook');
  if (dv.getUint16(recs[0].off, true) !== 0x0600) throw new Error('Excel 5/95 .xls is too old — re-save it as .xlsx or export CSV');
  let codepage = 1252;
  const latin = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(wb[o + i]); return s; };
  const wide = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(wb[o + i * 2] | (wb[o + i * 2 + 1] << 8)); return s; };
  const ustr = (o, cchBytes) => { const cch = cchBytes === 1 ? wb[o] : dv.getUint16(o, true); const fo = o + cchBytes; const fl = wb[fo]; let q = fo + 1; if (fl & 8) q += 2; if (fl & 4) q += 4; return fl & 1 ? wide(q, cch) : latin(q, cch); };
  function readSST(parts, count){
    let pi = 0, q = parts[0].off, end = q + parts[0].len; const out = [];
    const next = () => { pi++; if (pi >= parts.length) throw new Error('shared strings ended early'); q = parts[pi].off; end = q + parts[pi].len; };
    const b = () => { if (q >= end) next(); return wb[q++]; };
    const skip = n => { while (n > 0){ if (q >= end) next(); const k = Math.min(n, end - q); q += k; n -= k; } };
    for (let k = 0; k < count; k++){
      const cch = b() | (b() << 8); let fl = b(); let rt = 0, sz = 0;
      if (fl & 8) rt = b() | (b() << 8); if (fl & 4) sz = b() | (b() << 8) | (b() << 16) | (b() << 24);
      let s = '', left = cch;
      while (left > 0){
        if (q >= end){ next(); fl = wb[q++]; }
        const w = fl & 1; const avail = w ? Math.floor((end - q) / 2) : end - q; const n = Math.min(left, avail);
        s += w ? wide(q, n) : latin(q, n); q += w ? n * 2 : n; left -= n;
      }
      skip(rt * 4 + (sz >>> 0)); out.push(s);
    }
    return out;
  }
  let sst = [], fmts = {}, xfs = [], d1904 = false; const sheets = [];
  for (let i = 0; i < recs.length; i++){
    const r = recs[i];
    if (r.type === 0x000A) break;
    if (r.type === 0x0042) codepage = dv.getUint16(r.off, true);
    else if (r.type === 0x0085) sheets.push({pos: dv.getUint32(r.off, true), kind: wb[r.off + 5], name: ustr(r.off + 6, 1)});
    else if (r.type === 0x041E) fmts[dv.getUint16(r.off, true)] = ustr(r.off + 2, 2);
    else if (r.type === 0x00E0) xfs.push(dv.getUint16(r.off + 2, true));
    else if (r.type === 0x0022) d1904 = dv.getUint16(r.off, true) === 1;
    else if (r.type === 0x00FC){ const parts = [{off: r.off + 8, len: r.len - 8}]; let j = i + 1; while (j < recs.length && recs[j].type === 0x003C){ parts.push({off: recs[j].off, len: recs[j].len}); j++; } sst = readSST(parts, dv.getUint32(r.off + 4, true)); }
  }
  const num = (v, xf) => { const f = xfs[xf] ?? 0; return isDateFmt(f, fmts[f]) ? serialToText(v, fmts[f] || f, d1904) : numText(v); };
  const rk = o => { const v = dv.getInt32(o, true); let n; if (v & 2) n = v >> 2; else { const t = new DataView(new ArrayBuffer(8)); t.setInt32(4, v & ~3, true); n = t.getFloat64(0, true); } return v & 1 ? n / 100 : n; };
  return sheets.filter(s => s.kind === 0).map(s => {
    const rows = []; const set = (r, c, v) => { (rows[r] = rows[r] || [])[c] = cleanCell(v); };
    let i = recs.findIndex(r => r.at === s.pos); if (i < 0) return {name: s.name, rows: []};
    let pendingStr = null;
    for (i++; i < recs.length; i++){
      const r = recs[i], o = r.off; if (r.type === 0x000A) break;
      if (r.type === 0x00FD) set(dv.getUint16(o, true), dv.getUint16(o + 2, true), sst[dv.getUint32(o + 6, true)] ?? '');
      else if (r.type === 0x0204) set(dv.getUint16(o, true), dv.getUint16(o + 2, true), ustr(o + 6, 2));
      else if (r.type === 0x0203) set(dv.getUint16(o, true), dv.getUint16(o + 2, true), num(dv.getFloat64(o + 6, true), dv.getUint16(o + 4, true)));
      else if (r.type === 0x027E) set(dv.getUint16(o, true), dv.getUint16(o + 2, true), num(rk(o + 6), dv.getUint16(o + 4, true)));
      else if (r.type === 0x00BD){ const row = dv.getUint16(o, true), c0 = dv.getUint16(o + 2, true); const n = (r.len - 6) / 6; for (let k = 0; k < n; k++) set(row, c0 + k, num(rk(o + 4 + k * 6 + 2), dv.getUint16(o + 4 + k * 6, true))); }
      else if (r.type === 0x0205) set(dv.getUint16(o, true), dv.getUint16(o + 2, true), wb[o + 7] ? '#ERR' : (wb[o + 6] ? 'TRUE' : 'FALSE'));
      else if (r.type === 0x0006){ const row = dv.getUint16(o, true), col = dv.getUint16(o + 2, true);
        if (dv.getUint16(o + 12, true) === 0xFFFF){ const kind = wb[o + 6]; if (kind === 0) pendingStr = [row, col]; else if (kind === 1) set(row, col, wb[o + 8] ? 'TRUE' : 'FALSE'); }
        else set(row, col, num(dv.getFloat64(o + 6, true), dv.getUint16(o + 4, true))); }
      else if (r.type === 0x0207 && pendingStr){ set(pendingStr[0], pendingStr[1], ustr(o, 2)); pendingStr = null; }
    }
    for (let k = 0; k < rows.length; k++){ rows[k] = rows[k] || []; for (let j = 0; j < rows[k].length; j++) if (rows[k][j] == null) rows[k][j] = ''; }
    return {name: s.name, rows};
  });
}

/* ---- SpreadsheetML 2003 (XML "Excel" export) ---- */
function readSpreadsheetML(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('could not read this XML spreadsheet');
  const T = (el, n) => Array.from(el.getElementsByTagNameNS('*', n));
  const attr = (el, n) => el.getAttributeNS('urn:schemas-microsoft-com:office:spreadsheet', n) || el.getAttribute('ss:' + n) || '';
  return T(doc, 'Worksheet').map(ws => {
    const rows = []; let ri = 0;
    T(ws, 'Row').forEach(r => {
      const ix = +attr(r, 'Index'); if (ix) ri = ix - 1; const row = []; let ci = 0;
      Array.from(r.children).filter(c => c.localName === 'Cell').forEach(c => {
        const cx = +attr(c, 'Index'); if (cx) ci = cx - 1;
        const d = T(c, 'Data')[0]; let v = d ? d.textContent : '';
        if (d && attr(d, 'Type') === 'DateTime'){ const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/); if (m){ v = (+m[2]) + '/' + (+m[3]) + '/' + m[1]; if (m[4] && (m[4] !== '00' || m[5] !== '00')){ let h = +m[4]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; v += ' ' + h + ':' + m[5] + ' ' + ap; } } }
        else if (d && attr(d, 'Type') === 'Number' && isFinite(+v)) v = numText(+v);
        row[ci] = cleanCell(v); ci += 1 + (+attr(c, 'MergeAcross') || 0);
      });
      for (let j = 0; j < row.length; j++) if (row[j] == null) row[j] = '';
      rows[ri++] = row;
    });
    for (let k = 0; k < rows.length; k++) rows[k] = rows[k] || [];
    return {name: attr(ws, 'Name') || 'Sheet', rows};
  });
}

/* ---- HTML table (Salesforce Classic "Excel" export) ---- */
function readHtmlTables(text){
  const doc = new DOMParser().parseFromString(text, 'text/html');   // inert document: no scripts run, nothing is fetched
  doc.querySelectorAll('br').forEach(b => b.replaceWith(' '));
  const tables = Array.from(doc.querySelectorAll('table')).filter(t => !t.querySelector('table'));
  return tables.map((t, i) => {
    const rows = []; const spans = [];
    Array.from(t.querySelectorAll('tr')).forEach((tr, ri) => {
      const row = rows[ri] = rows[ri] || []; let ci = 0;
      Array.from(tr.children).filter(c => /^(TD|TH)$/.test(c.tagName)).forEach(c => {
        while (row[ci] != null) ci++;
        const cs = Math.max(1, +c.getAttribute('colspan') || 1), rs = Math.max(1, +c.getAttribute('rowspan') || 1);
        const v = cleanCell(c.textContent);
        for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++){ const rr = rows[ri + a] = rows[ri + a] || []; rr[ci + b] = (a === 0 && b === 0) ? v : ''; }
        ci += cs;
      });
    });
    for (let k = 0; k < rows.length; k++){ rows[k] = rows[k] || []; for (let j = 0; j < rows[k].length; j++) if (rows[k][j] == null) rows[k][j] = ''; }
    return {name: 'Table ' + (i + 1), rows};
  }).filter(s => s.rows.length);
}

/* ---- dispatcher ---- */
async function readSpreadsheetFile(file){
  const u8 = new Uint8Array(await file.arrayBuffer());
  if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) return {format: 'Excel 97-2003 workbook (.xls)', sheets: readBiff(u8)};
  if (u8[0] === 0x50 && u8[1] === 0x4B) return {format: 'Excel workbook (.xlsx)', sheets: readXlsx(u8)};
  const text = decodeText(u8); const head = text.slice(0, 4000).replace(/^\uFEFF/, '').trimStart();
  if (/^<\?xml/i.test(head) && /urn:schemas-microsoft-com:office:spreadsheet/i.test(text.slice(0, 20000)) || /^<Workbook/i.test(head)) return {format: 'Excel 2003 XML spreadsheet' + (/\.xls$/i.test(file.name) ? ' (named .xls)' : ''), sheets: readSpreadsheetML(text)};
  if (/^</.test(head) && /<table/i.test(text)) return {format: 'HTML table' + (/\.xls$/i.test(file.name) ? ' (Salesforce “Excel .xls” export)' : ''), sheets: readHtmlTables(text)};
  const rows = parseCSV(text);
  return {format: (detectDelim(text) === '\t' ? 'Tab-separated text' : 'CSV') + (/\.xls$/i.test(file.name) ? ' (named .xls)' : ''), sheets: [{name: file.name.replace(/\.[^.]+$/, ''), rows}]};
}
