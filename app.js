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
