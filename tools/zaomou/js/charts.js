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
export function lineChart({ series, xFmt = (x) => x, yFmt = wan, marks = [], width = 640, height = 230, xStep, tip }) {
  const L = 52, R = 14, T = 12, B = 26;
  const all = series.flatMap((s) => s.points);
  if (!all.length) return '';
  const x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x), x0 + 1);
  const ticks = niceTicks(Math.max(...all.map((p) => p.y), 1));
  const yMax = ticks[ticks.length - 1] || 1;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (width - L - R);
  const sy = (y) => height - B - (Math.max(0, y) / yMax) * (height - T - B);
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
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"${tipAttr}>`;
  for (const t of ticks) svg += `<line class="grid-l" x1="${L}" x2="${width - R}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${L - 6}" y="${sy(t) + 4}" text-anchor="end">${yFmt(t)}</text>`;
  for (const x of xs) svg += `<text x="${sx(x)}" y="${height - 6}" text-anchor="middle">${xFmt(x)}</text>`;
  for (const s of series) {
    const pts = s.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    if (s.fill) svg += `<polygon points="${sx(s.points[0].x)},${sy(0)} ${pts} ${sx(s.points[s.points.length - 1].x)},${sy(0)}" fill="${s.fill}"/>`;
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="6 4"' : ''}/>`;
  }
  for (const m of marks) {
    const x = sx(m.x);
    svg += `<line x1="${x}" x2="${x}" y1="${T}" y2="${height - B}" stroke="${m.color}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    svg += `<text x="${x + 4}" y="${T + 10}" style="fill:${m.color};font-weight:700">${m.label}</text>`;
  }
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
  let svg = `<svg viewBox="0 0 ${size} ${size}" role="img">`;
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
