/* 早謀遠算 · 介紹頁快速試算（與完整版共用計算引擎） */
import { laborInsurance, growMonthly, monthlyForTarget } from './engine.js';
import { INSURANCE_GRADES } from './data.js';
import { wan } from './charts.js';

const $ = (id) => document.getElementById(id);
const money = (v) => `$${Math.round(v).toLocaleString()}`;
const COLORS = { 'p-salary': '#2D4A6E', 'p-years': '#2D4A6E', 'c-monthly': '#CF9E2E', 'c-rate': '#CF9E2E', 'c-years': '#CF9E2E', 'g-target': '#D95B5B', 'g-base': '#D95B5B', 'g-years': '#D95B5B' };
const QUICK_DIVISOR = 240; // 快算以 65 歲退休、約 20 年餘命概估；完整版依性別與退休年齡查生命表

function switchCalc(id) {
  for (const k of ['pension', 'compound', 'gap']) {
    $(`calc-${k}`).style.display = k === id ? 'block' : 'none';
    const tab = $(`tab-${k}`);
    tab.style.background = k === id ? 'var(--navy)' : 'transparent';
    tab.style.color = k === id ? '#fff' : 'var(--muted)';
    tab.style.borderColor = k === id ? 'var(--navy)' : 'var(--border)';
  }
}

function updateSalarySlider(idx) {
  $('p-salary-val').textContent = money(INSURANCE_GRADES[+idx]);
  calcPension();
}

function calcPension() {
  const base = INSURANCE_GRADES[+$('p-salary').value];
  const years = +$('p-years').value;
  const r = laborInsurance({ base, years, birthYear: 2000, claimAge: 65 });
  if (r.kind === 'lump') {
    $('p-result').textContent = money(r.lump);
    $('p-formula').textContent = '年資未滿 15 年，只能請領一次金（總額）';
    return;
  }
  $('p-result').textContent = money(r.monthly);
  $('p-formula').textContent = r.formula === 'A'
    ? `A 式擇優：${base.toLocaleString()} × ${years} 年 × 0.775% + 3,000`
    : `B 式擇優：${base.toLocaleString()} × ${years} 年 × 1.55%`;
}

function calcCompound() {
  const m = +$('c-monthly').value, rate = +$('c-rate').value, y = +$('c-years').value;
  const fv = growMonthly(m, y, rate), principal = m * y * 12;
  $('c-result').textContent = wan(fv);
  $('c-sub').textContent = `本金 ${wan(principal)} → 增值 ${wan(fv - principal)}`;
}

function calcGap() {
  const target = +$('g-target').value, base = +$('g-base').value, years = +$('g-years').value;
  const gap = Math.max(0, target - base);
  const monthly = monthlyForTarget(gap * QUICK_DIVISOR, years, 7);
  const pct = Math.min(100, Math.round((base / target) * 100));
  $('g-result').textContent = money(monthly);
  $('g-result').style.color = gap <= 0 ? '#5BAD85' : '#D95B5B';
  $('g-bar').style.width = `${pct}%`;
  $('g-bar').style.background = pct >= 80 ? '#5BAD85' : pct >= 50 ? '#E8B84B' : '#D95B5B';
  $('g-pct').textContent = gap <= 0 ? '保底月領已超過目標' : `保底月領覆蓋率 ${pct}%（以退休後領 ${QUICK_DIVISOR} 個月概估）`;
}

function paint(el) {
  const p = (((+el.value - +el.min) / (+el.max - +el.min)) * 100).toFixed(1);
  const c = COLORS[el.id] || '#2D4A6E';
  el.style.background = `linear-gradient(to right, ${c} 0%, ${c} ${p}%, #DDD9CE ${p}%, #DDD9CE 100%)`;
}

// 頁面上的 inline oninput 會呼叫這些函式
Object.assign(window, { switchCalc, updateSalarySlider, calcPension, calcCompound, calcGap, updateSliderPct: paint });

for (const id of Object.keys(COLORS)) {
  const el = $(id);
  if (!el) continue;
  paint(el);
  el.addEventListener('input', () => paint(el));
}
updateSalarySlider($('p-salary').value);
calcCompound();
calcGap();

window.addEventListener('scroll', () => $('main-nav')?.classList.toggle('scrolled', window.scrollY > 20), { passive: true });
