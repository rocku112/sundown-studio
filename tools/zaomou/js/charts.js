/* 早謀遠算 · 輕量 SVG 圖表（無外部函式庫） */

export const wan = (v) => {
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e9 ? 1 : 2)}億`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}萬`;
  return Math.round(v).toLocaleString();
};

function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = 0; v <= max * 1.0001 + step * 0.01; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/**
 * 折線圖
 * series: [{ points: [{x, y}], color, fill?, dash? }]
 * marks:  [{ x, label, color }] 垂直標記
 */
export function lineChart({ series, bands = [], xFmt = (x) => x, yFmt = wan, marks = [], width = 640, height = 230, xStep, tip, yCap, yLog = false }) {
  const L = 52, R = 14, T = 12, B = 26;
  const all = series.flatMap((s) => s.points);
  if (!all.length) return '';
  const x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x), x0 + 1);
  const bandMax = Math.max(0, ...bands.flatMap((b) => b.points.map((p) => p.hi)));
  // yCap：縱軸上限（極端值會貼齊頂端，避免少數路徑把主要曲線壓扁）
  let ticks, sy;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (width - L - R);
  if (yLog) {
    // 對數刻度：1、2、5 × 10^k；0 或極小值貼齊底線（代表用完）
    const vals = [...all.map((p) => p.y), ...bands.flatMap((b) => b.points.flatMap((p) => [p.lo, p.hi]))].filter((v) => v > 0);
    const hi = Math.max(...vals, 10);
    const lo = Math.max(hi / 1e4, Math.min(...vals) / 1.5);
    const k0 = Math.floor(Math.log10(lo)), k1 = Math.ceil(Math.log10(hi));
    ticks = [];
    for (let k = k0; k <= k1 + 1; k++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** k;
        if (v < lo) continue;
        ticks.push(v);
        if (v >= hi) break; // 多放一格高於最大值的刻度當上緣
      }
      if (ticks.length && ticks[ticks.length - 1] >= hi) break;
    }
    const yMin = ticks[0] ?? lo;
    const top = ticks[ticks.length - 1] ?? hi;
    sy = (y) => height - B - ((Math.log10(Math.max(y, yMin)) - Math.log10(yMin)) / (Math.log10(top) - Math.log10(yMin))) * (height - T - B);
  } else {
    ticks = niceTicks(yCap || Math.max(...all.map((p) => p.y), bandMax, 1));
    const yMax = ticks[ticks.length - 1] || 1;
    sy = (y) => height - B - (Math.min(Math.max(0, y), yMax) / yMax) * (height - T - B);
  }
  const span = x1 - x0;
  const step = xStep || (span <= 12 ? 2 : span <= 30 ? 5 : 10);
  const xs = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) xs.push(x);

  // tip: { title: (x) => 字串, fmt: (v) => 字串 }；把每個 x 的各序列數值嵌進 data-tip，供 attachTooltips 使用
  let tipAttr = '';
  if (tip) {
    const xsAll = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
    const rows = xsAll.map((x) => ({
      x, px: +sx(x).toFixed(1), t: tip.title(x),
      v: series.map((s) => { const p = s.points.find((q) => q.x === x); return p && s.name ? [s.name, s.color, tip.fmt(p.y)] : null; }).filter(Boolean),
    }));
    tipAttr = ` data-tip="${encodeURIComponent(JSON.stringify({ w: width, top: T, bottom: height - B, rows }))}"`;
  }
  // 螢幕閱讀器用的摘要：各序列名稱與起訖數值
  const label = series.filter((sr) => sr.name && sr.points.length).map((sr) =>
    `${sr.name}：${xFmt(sr.points[0].x)} ${yFmt(sr.points[0].y)}，${xFmt(sr.points[sr.points.length - 1].x)} ${yFmt(sr.points[sr.points.length - 1].y)}`).join('；');
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"${label ? ` aria-label="${label}"` : ''}${tipAttr}>`;
  for (const t of ticks) svg += `<line class="grid-l" x1="${L}" x2="${width - R}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${L - 6}" y="${sy(t) + 4}" text-anchor="end">${yFmt(t)}</text>`;
  for (const x of xs) svg += `<text x="${sx(x)}" y="${height - 6}" text-anchor="middle">${xFmt(x)}</text>`;
  // 區間帶（例如蒙地卡羅 P10–P90）畫在折線下方
  for (const b of bands) {
    const up = b.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.hi).toFixed(1)}`);
    const down = [...b.points].reverse().map((p) => `${sx(p.x).toFixed(1)},${sy(p.lo).toFixed(1)}`);
    svg += `<polygon points="${[...up, ...down].join(' ')}" fill="${b.fill}"/>`;
  }
  for (const s of series) {
    const pts = s.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    if (s.fill) svg += `<polygon points="${sx(s.points[0].x)},${sy(0)} ${pts} ${sx(s.points[s.points.length - 1].x)},${sy(0)}" fill="${s.fill}"/>`;
    if (!s.dotsOnly) svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="6 4"' : ''}/>`;
    if (s.dots || s.dotsOnly) for (const p of s.points) svg += `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;
  }
  marks.forEach((m, i) => {
    const x = sx(m.x);
    const right = x > width * 0.72; // 靠右的標籤改往左寫，避免超出圖框
    svg += `<line x1="${x}" x2="${x}" y1="${T}" y2="${height - B}" stroke="${m.color}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    svg += `<text x="${right ? x - 4 : x + 4}" y="${T + 10 + (i % 2) * 14}" text-anchor="${right ? 'end' : 'start'}" style="fill:${m.color};font-weight:700">${m.label}</text>`;
  });
  if (tip) svg += `<line class="hover-l" x1="0" x2="0" y1="${T}" y2="${height - B}" stroke="#1E3554" stroke-width="1" opacity="0"/>`;
  return svg + '</svg>';
}

/** 折線圖滑鼠／觸控提示：在 root 上委派事件，只需呼叫一次 */
export function attachTooltips(root = document) {
  let box = document.querySelector('.chart-tip');
  if (!box) { box = document.createElement('div'); box.className = 'chart-tip'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const hide = (svg) => { box.classList.remove('show'); svg?.querySelector('.hover-l')?.setAttribute('opacity', '0'); };
  const move = (e) => {
    const svg = e.target.closest?.('svg.chart[data-tip]');
    if (!svg) return;
    const d = svg._tip || (svg._tip = JSON.parse(decodeURIComponent(svg.dataset.tip)));
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * d.w;
    let best = d.rows[0];
    for (const r of d.rows) if (Math.abs(r.px - vx) < Math.abs(best.px - vx)) best = r;
    const line = svg.querySelector('.hover-l');
    line.setAttribute('x1', best.px); line.setAttribute('x2', best.px); line.setAttribute('opacity', '.35');
    box.innerHTML = `<b>${best.t}</b>` + best.v.map(([n, c, v]) => `<div><i style="background:${c}"></i>${n}<span>${v}</span></div>`).join('');
    const left = rect.left + (best.px / d.w) * rect.width;
    box.classList.add('show');
    const bw = box.offsetWidth;
    const x = Math.min(window.innerWidth - bw - 8, Math.max(8, left - bw / 2));
    const h = box.offsetHeight;
    const y = e.clientY - h - 14 > 8 ? e.clientY - h - 14 : e.clientY + 18; // 上方放不下就放到游標下方
    box.style.transform = `translate(${x}px, ${y + window.scrollY}px)`;
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerdown', move);
  root.addEventListener('pointerout', (e) => { const svg = e.target.closest?.('svg.chart[data-tip]'); if (svg && !svg.contains(e.relatedTarget)) hide(svg); });
}

/** 環圈圖 */
export function donut(items, size = 170) {
  const total = items.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return '';
  const c = size / 2, r = size / 2 - 4, ir = r * 0.58;
  let a = -Math.PI / 2;
  let svg = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${items.map((d) => `${d.label} ${Math.round((d.value / total) * 100)}%`).join('、')}">`;
  for (const d of items) {
    const frac = d.value / total;
    if (frac >= 0.9999) {
      svg += `<circle cx="${c}" cy="${c}" r="${(r + ir) / 2}" fill="none" stroke="${d.color}" stroke-width="${r - ir}"/>`;
      continue;
    }
    const a2 = a + frac * 2 * Math.PI;
    const big = frac > 0.5 ? 1 : 0;
    const p = (ang, rad) => `${(c + rad * Math.cos(ang)).toFixed(2)},${(c + rad * Math.sin(ang)).toFixed(2)}`;
    svg += `<path d="M${p(a, r)} A${r},${r} 0 ${big} 1 ${p(a2, r)} L${p(a2, ir)} A${ir},${ir} 0 ${big} 0 ${p(a, ir)} Z" fill="${d.color}" stroke="#fff" stroke-width="1.5"/>`;
    a = a2;
  }
  return svg + '</svg>';
}
