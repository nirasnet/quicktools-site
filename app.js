// Shared helpers for tool pages (namespaced as QT to avoid clashing with per-tool scripts).
window.QT = {
  $: id => document.getElementById(id),
  esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  size: n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB',
  dl(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  },
  drop(zone, input, cb) {
    ['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', ev => { const f = Array.from(ev.dataTransfer.files || []); if (f.length) cb(f); });
    input.addEventListener('change', () => { const f = Array.from(input.files || []); input.value = ''; if (f.length) cb(f); });
  },
  loadImg(file) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read this image'));
      i.src = u;
    });
  },
  // k-means colour quantiser. d = RGBA bytes. Returns {pal:[{r,g,b,n}], idx:Int16Array (-1 = transparent)}
  quant(d, k) {
    const n = d.length / 4, px = [];
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] >= 128) px.push(i);
    const idx = new Int16Array(n).fill(-1);
    if (!px.length) return { pal: [], idx };
    const lum = i => d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
    px.sort((a, b) => lum(a) - lum(b));
    k = Math.min(k, px.length);
    let c = [];
    for (let j = 0; j < k; j++) { const i = px[Math.floor((j + .5) * px.length / k)]; c.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]); }
    for (let it = 0; it < 12; it++) {
      const s = c.map(() => [0, 0, 0, 0]);
      for (const i of px) {
        let b = 0, bd = 1e12;
        for (let j = 0; j < k; j++) {
          const dr = d[i * 4] - c[j][0], dg = d[i * 4 + 1] - c[j][1], db = d[i * 4 + 2] - c[j][2], dd = dr * dr + dg * dg + db * db;
          if (dd < bd) { bd = dd; b = j; }
        }
        idx[i] = b; const q = s[b]; q[0] += d[i * 4]; q[1] += d[i * 4 + 1]; q[2] += d[i * 4 + 2]; q[3]++;
      }
      c = c.map((o, j) => s[j][3] ? [Math.round(s[j][0] / s[j][3]), Math.round(s[j][1] / s[j][3]), Math.round(s[j][2] / s[j][3])] : o);
    }
    const cnt = c.map(() => 0); for (const i of px) cnt[idx[i]]++;
    return { pal: c.map((o, j) => ({ r: o[0], g: o[1], b: o[2], n: cnt[j] })), idx };
  },
  hex: (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
};

// ---- ZIP (store, no compression) -------------------------------------------------------------
QT.zip = function (files) {
  const enc = new TextEncoder();
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = T[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const now = new Date();
  const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const parts = [], central = []; let off = 0;
  files.forEach(f => {
    const nm = enc.encode(f.name), d = f.data, c = crc(d);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, c, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, nm, d);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, c, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, nm);
    off += 30 + nm.length + d.length;
  });
  let cs = 0; central.forEach(p => cs += p.byteLength);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
};

// ---- small toast -------------------------------------------------------------------------------
QT.toast = function (msg) {
  let t = document.getElementById('qt-toast');
  if (!t) { t = document.createElement('div'); t.id = 'qt-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show';
  clearTimeout(QT._tt); QT._tt = setTimeout(() => { t.className = ''; }, 2200);
};
QT.copy = function (text, msg) {
  const done = () => QT.toast(msg || 'Copied');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done();
};
QT.safeName = (s, d) => (String(s || '').replace(/[^\w\- .()]+/g, '').trim().replace(/\.(pdf|png|jpe?g|webp|zip)$/i, '') || d);
QT.range = function (s, n, allIfEmpty) {
  s = String(s || '').trim();
  if (!s) { if (allIfEmpty) return Array.from({ length: n }, (_, i) => i); throw new Error('Enter the pages you want'); }
  const set = [];
  for (const part of s.split(',')) {
    const t = part.trim(); if (!t) continue;
    let m = t.match(/^(\d+)$/);
    if (m) set.push(+m[1]);
    else {
      m = t.match(/^(\d*)\s*-\s*(\d*)$/);
      if (!m) throw new Error('Cannot read "' + t + '"');
      const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : n;
      if (a > b) throw new Error('Bad range "' + t + '"');
      for (let i = a; i <= b; i++) set.push(i);
    }
  }
  if (!set.length) throw new Error('Enter the pages you want');
  if (set.some(p => p < 1 || p > n)) throw new Error('Pages must be between 1 and ' + n);
  return set.map(p => p - 1);
};

// ---- remember option choices on this device only (never uploaded) ------------------------------------
(function () {
  const els = [].filter.call(document.querySelectorAll('.panel[data-persist] input,.panel[data-persist] select'), el =>
    el.id && !el.hasAttribute('data-nosave') && (el.tagName === 'SELECT' || ['range', 'number', 'color', 'checkbox'].indexOf(el.type) > -1));
  if (!els.length) return;
  const key = 'qt:' + location.pathname; let store = {};
  try { store = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { store = {}; }
  els.forEach(el => {
    if (!(el.id in store)) return;
    if (el.type === 'checkbox') el.checked = !!store[el.id];
    else if (el.tagName === 'SELECT') { if ([].some.call(el.options, o => o.value === store[el.id])) el.value = store[el.id]; }
    else el.value = store[el.id];
  });
  document.addEventListener('input', e => {
    if (els.indexOf(e.target) < 0) return;
    store[e.target.id] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (x) {}
  });
  QT.sync = () => els.forEach(el => { if (el.id in store) el.dispatchEvent(new Event('input', { bubbles: true })); });
  const panel = document.querySelector('.panel[data-persist]');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'mini reset'; b.textContent = '↺ Reset options';
  b.title = 'Restore default options (settings are remembered on this device only)';
  b.onclick = () => { try { localStorage.removeItem(key); } catch (e) {} location.reload(); };
  panel.insertBefore(b, panel.firstChild);
})();
