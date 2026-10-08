/* 早謀遠算 · 介紹頁互動（與完整版共用計算引擎） */
import { compute, laborInsurance, growMonthly, monthlyForTarget, makePayout } from './engine.js';
import { INSURANCE_GRADES } from './data.js';
import { defaults, SEED_KEY } from './state.js';
import { wan } from './charts.js';

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Math.round(v).toLocaleString()}`;
const NOW = new Date().getFullYear();

/* 滑桿已填段 */
function fill(el) {
  const p = ((+el.value - +el.min) / (+el.max - +el.min)) * 100;
  el.style.setProperty('--fill', `${p}%`);
}
function bind(ids, fn) {
  for (const id of ids) $(id).addEventListener('input', (e) => { fill(e.target); fn(); });
  for (const id of ids) fill($(id));
  fn();
}

/* ── 首屏迷你試算 ── */
function miniState() {
  const s = defaults(NOW);
  s.self.birthYear = NOW - +$('m-age').value;
  s.self.salary = +$('m-sal').value;
  s.portfolios = [{ id: 'p1', name: '定期投資', assets: [{ id: 'a1', name: '定期投資', monthly: +$('m-inv').value, rate: 6 }] }];
  return s;
}
function mini() {
  $('m-age-v').textContent = `${$('m-age').value} 歲`;
  $('m-sal-v').textContent = money(+$('m-sal').value);
  $('m-inv-v').textContent = money(+$('m-inv').value);
  const r = compute(miniState(), NOW);
  $('m-total').textContent = money(r.totalPV);
  $('m-pv').textContent = `${NOW + r.n} 年實際入帳約 ${money(r.total)}／月（因通膨，購買力約為今天的 ${Math.round(r.pvFactor * 100)}%）`;
  const parts = [['勞保', r.me.insMonthly * r.pvFactor, '#5BAD85'], ['勞退', r.me.laborRetire * r.pvFactor, '#8FB3DA'], ['投資', r.investMonthly * r.pvFactor, '#E8B84B']];
  $('m-stack').innerHTML = parts.filter((p) => p[1] > 0).map((p) => `<i style="flex-grow:${p[1]};background:${p[2]}"></i>`).join('');
  $('m-legend').innerHTML = parts.map((p) => `<li><i style="background:${p[2]}"></i>${p[0]}<b>${money(p[1])}</b></li>`).join('');
}
bind(['m-age', 'm-sal', 'm-inv'], mini);
$('m-go').addEventListener('click', () => {
  try {
    sessionStorage.setItem(SEED_KEY, JSON.stringify({ age: +$('m-age').value, salary: +$('m-sal').value, invest: +$('m-inv').value }));
  } catch { /* 無痕模式：直接前往 */ }
  location.href = 'easy.html';
});

/* ── 快速試算分頁 ── */
const tabs = ['pension', 'compound', 'gap'];
for (const k of tabs) {
  $(`tab-${k}`).addEventListener('click', () => select(k));
  $(`tab-${k}`).addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = tabs[(tabs.indexOf(k) + d + tabs.length) % tabs.length];
    select(next); $(`tab-${next}`).focus();
  });
}
function select(k) {
  for (const t of tabs) {
    $(`tab-${t}`).setAttribute('aria-selected', String(t === k));
    $(`tab-${t}`).tabIndex = t === k ? 0 : -1;
    $(`t-${t}`).hidden = t !== k;
  }
}
select('pension');

bind(['p-sal', 'p-yrs'], () => {
  const base = INSURANCE_GRADES[+$('p-sal').value], y = +$('p-yrs').value;
  $('p-sal-v').textContent = `${money(base)}（第 ${+$('p-sal').value + 1} 級）`;
  $('p-yrs-v').textContent = `${y} 年`;
  const r = laborInsurance({ base, years: y, birthYear: 2000, claimAge: 65 });
  if (r.kind === 'lump') {
    $('p-out').textContent = money(r.lump);
    $('p-note').textContent = '年資未滿 15 年不能請領年金，這是一次金總額。';
  } else {
    $('p-out').textContent = money(r.monthly);
    $('p-note').textContent = `${r.formula} 式較高：A 式 ${money(r.a)}、B 式 ${money(r.b)}。實際以退休前最高 60 個月平均投保薪資計算。`;
  }
});

bind(['c-mon', 'c-rate', 'c-yrs'], () => {
  const m = +$('c-mon').value, rate = +$('c-rate').value, y = +$('c-yrs').value;
  $('c-mon-v').textContent = money(m);
  $('c-rate-v').textContent = `${rate}%`;
  $('c-yrs-v').textContent = `${y} 年`;
  const fv = growMonthly(m, y, rate), principal = m * y * 12;
  $('c-out').textContent = wan(fv);
  $('c-note').textContent = `投入本金 ${wan(principal)}，其中 ${Math.round(((fv - principal) / fv) * 100)}% 是複利滾出來的。`;
});

bind(['g-tgt', 'g-base', 'g-yrs'], () => {
  const target = +$('g-tgt').value, base = +$('g-base').value, years = +$('g-yrs').value;
  $('g-tgt-v').textContent = money(target);
  $('g-base-v').textContent = money(base);
  $('g-yrs-v').textContent = `${years} 年`;
  const gap = Math.max(0, target - base);
  const pool = makePayout(240, 'divisor', 0).toPool(gap); // 快算以退休後領 20 年概估
  $('g-out').textContent = gap > 0 ? money(monthlyForTarget(pool, years, 6)) : '$0';
  const pct = Math.min(100, Math.round((base / target) * 100));
  $('g-bar').style.width = `${pct}%`;
  $('g-bar').style.background = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
  $('g-note').textContent = gap > 0
    ? `保底收入可支應 ${pct}%；缺口 ${money(gap)}／月，退休時需累積約 ${wan(pool)}（以領 20 年概估）。`
    : '保底收入已足以支應目標。';
});

/* ── 主題：與試算頁共用 zaomou_ui.theme ── */
const UI_KEY = 'zaomou_ui';
const THEMES = [['auto', '自動'], ['dark', '深色'], ['light', '淺色']];
function readUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } }
function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const name = THEMES.find((x) => x[0] === t)[1];
  $('btn-theme').setAttribute('aria-label', `切換主題：目前${name}`);
  $('btn-theme').title = `主題：${name}（點擊切換）`;
}
applyTheme(readUi().theme || 'auto');
$('btn-theme').addEventListener('click', () => {
  const ui = readUi();
  const i = THEMES.findIndex((x) => x[0] === (ui.theme || 'auto'));
  ui.theme = THEMES[(i + 1) % THEMES.length][0];
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* 無痕模式：只套用本頁 */ }
  applyTheme(ui.theme);
});

const nav = $('nav');
window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 8), { passive: true });

// 離線使用：註冊 service worker（本機 file:// 開啟時略過）
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 不支援或被封鎖時不影響試算 */ });
}
