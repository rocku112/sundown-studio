/* 早謀遠算 · 勞退自提指南：互動比較、試算、自我檢查（稅率與複利沿用試算引擎，數字只維護一份） */
import { selfContributionTax, growMonthly } from './engine.js';
import { LABOR_FUND, PENSION_WAGE_MAX } from './data.js';

const $ = (id) => document.getElementById(id);
const num = (v) => +String(v).replace(/[^\d.]/g, '') || 0;
const fmt = (v) => Math.round(v).toLocaleString();
const wan = (v) => `${Math.round(v / 10000).toLocaleString()} 萬`;
const FLOOR = LABOR_FUND.minGuarantee.rate; // 保證收益（最差情況）
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CPI = 2; // 通膨假設（%），與早謀遠算預設一致

/**
 * 自提 6% 與「不自提、扣稅後自己存」到 65 歲的比較。
 * 回傳稅務結果、三條路的終值與打平報酬率。
 */
function compare({ salary, bonus = 0, age, lr, alt, other = 0, interest = 0, dividend = 0 }) {
  const t = selfContributionTax(salary, 6, bonus, null, other, interest, dividend);
  const yrs = Math.max(0, 65 - age);
  const m = t.contrib / 12, after = (t.contrib - t.saving) / 12;
  const vP = growMonthly(m, yrs, lr), vF = growMonthly(m, yrs, FLOOR), vA = growMonthly(after, yrs, alt);
  let lo = -5, hi = 30;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (growMonthly(after, yrs, mid) >= vP) hi = mid; else lo = mid; }
  return { t, vP, vF, vA, breakEven: hi, yrs, principal: t.contrib * yrs };
}

/** 以今天的購買力顯示：終值除以通膨累積倍數 */
const realOf = (c, on) => (on ? Math.pow(1 + CPI / 100, -c.yrs) : 1);
function showDelta(el, c, k) {
  const gap = (c.vA - c.vP) * k;
  const cls = Math.abs(c.vA / c.vP - 1) < 0.05 ? 't' : gap < 0 ? 'p' : 'a';
  el.className = `delta ${cls}`;
  el.innerHTML = cls === 't' ? `兩邊差約<b>${wan(Math.abs(gap))}</b>` : `${gap < 0 ? '自提' : '不自提'}多約<b>${wan(Math.abs(gap))}</b>`;
  if (!still && !document.hidden) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function inflationNote(el, c, on) {
  el.hidden = !on;
  if (!on) return;
  const k = realOf(c, true);
  el.innerHTML = `以每年通膨 ${CPI}% 換算，${c.yrs} 年後的 1 萬元只值今天的 ${Math.round(k * 10000).toLocaleString()} 元。保證收益約 ${FLOOR}% 低於通膨，若勞退基金只拿到保證收益，存進去的每一筆錢實質上都在縮水；最差情況的購買力約 ${wan(c.vF * k)}。`;
}
function drawBars(box, rows) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  if (box.children.length !== rows.length) box.innerHTML = rows.map(() => '<div class="bar"><span></span><i style="width:0"></i><em></em></div>').join('');
  rows.forEach(([label, v, cls], i) => {
    const el = box.children[i];
    el.querySelector('span').textContent = label;
    const bar = el.querySelector('i');
    bar.className = cls;
    bar.style.width = `${Math.max(2, (v / max) * 100)}%`;
    el.querySelector('em').textContent = wan(v);
  });
}

function verdict(el, c, alt, extra = '') {
  const gap = c.vA / c.vP - 1;
  const cls = Math.abs(gap) < 0.05 ? 't' : gap < 0 ? 'p' : 'a';
  const head = { p: '自提的錢比較多', a: '不自提的錢比較多', t: '兩邊差不多' }[cls];
  const taxNote = c.t.marginal === 0 ? '不用繳綜所稅，自提沒有節稅效果'
    : `邊際稅率 ${Math.round(c.t.marginal * 100)}%，自提每年少繳 ${fmt(c.t.saving)} 元${c.t.dividendMethod ? `（股利以${c.t.dividendMethod === 'merge' ? '合併計稅' : '28% 分開計稅'}較省）` : ''}`;
  const tail = {
    p: `就算勞退基金只拿到保證收益，也有約 ${wan(c.vF)}。代價是要鎖到 60 歲。`,
    a: `前提是 ${alt}% 的報酬能長期維持、中途不動用，而且沒有保證。`,
    t: '差距不到 5%，這時更該看流動性：近期要用錢就保留彈性，想強迫儲蓄就自提。',
  }[cls];
  el.className = `verdict ${cls}`;
  el.innerHTML = `<svg class="ric" aria-hidden="true"><use href="#i-${{ p: 'shield', a: 'trend', t: 'scale' }[cls]}"/></svg><span><b>${head}</b>　${taxNote}；65 歲時自提約 ${wan(c.vP)}、不自提約 ${wan(c.vA)}。${tail}${extra}</span>`;
}

/* 數字變動時跑一小段動畫 */
const shown = {};
function tween(id, to, f) {
  const el = $(id);
  if (to === null) { el.textContent = '—'; shown[id] = null; return; }
  const from = shown[id];
  shown[id] = to;
  // 第一次顯示、背景分頁（動畫會暫停）或要求減少動態時，直接顯示結果
  if (still || from === undefined || from === null || from === to || document.hidden) { el.textContent = f(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 380), e = 1 - Math.pow(1 - k, 3);
    el.textContent = f(from + (to - from) * e);
    if (k < 1 && shown[id] === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

/* ── 互動比較：選情境＋拖拉替代報酬 ── */
(() => {
  let who = { age: 30, sal: 50000 }, lr = 4;
  function render() {
    const alt = +$('p-alt').value;
    $('p-alt-v').textContent = `${alt}%`;
    $('p-alt').style.setProperty('--fill', `${alt * 10}%`);
    const c = compare({ salary: who.sal, age: who.age, lr, alt });
    const be = $('p-be');
    be.style.left = `${Math.min(100, Math.max(0, c.breakEven * 10))}%`;
    be.querySelector('small').textContent = `打平 ${c.breakEven.toFixed(1)}%`;
    const on = $('p-real').checked, k = realOf(c, on);
    showDelta($('p-delta'), c, k);
    drawBars($('p-bars'), [[`自提（${lr}%）`, c.vP * k, 'b-p'], ['自提最差情況', c.vF * k, 'b-f'], [`不自提（${alt}%）`, c.vA * k, 'b-a']]);
    inflationNote($('p-infl'), c, on);
    verdict($('p-text'), c, alt);
  }
  const pick = (groupId, fn) => $(groupId).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    fn(b);
    for (const x of $(groupId).querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    render();
  });
  pick('p-who', (b) => { who = { age: +b.dataset.age, sal: +b.dataset.sal }; });
  pick('p-lr', (b) => { lr = +b.dataset.v; });
  $('p-alt').addEventListener('input', render);
  $('p-real').addEventListener('change', render);
  render();
})();

/* ── 用你的數字算 ── */
(() => {
  function run() {
    const salary = num($('c-sal').value), bonus = Math.min(24, Math.max(0, +$('c-bonus').value || 0));
    const age = Math.min(64, Math.max(18, +$('c-age').value || 35));
    const lr = Math.min(15, Math.max(0, +$('c-lr').value || 0)), alt = Math.min(15, Math.max(0, +$('c-alt').value || 0));
    const c = compare({ salary, bonus, age, lr, alt, other: num($('c-other').value), interest: num($('c-int').value), dividend: num($('c-div').value) });
    // 稅率表標出落點
    const key = c.t.marginal >= 0.2 ? '20' : String(Math.round(c.t.marginal * 100));
    for (const r of ['0', '5', '12', '20']) $(`tr-${r}`).classList.toggle('here', !!salary && r === key);
    $('here-note').hidden = !salary;
    $('here-note').textContent = '依下方試算的條件，你落在標黃的這一列（含年終與其他所得）。';
    // 鎖住時間軸：現在 → 60 歲可請領 → 65 歲
    const lock = Math.max(0, 60 - age), free = 65 - Math.max(age, 60);
    $('o-time').innerHTML = `<div class="tl-bar">${lock ? `<span class="tl-lock" style="flex-grow:${lock}">鎖住 ${lock} 年</span>` : ''}<span class="tl-free" style="flex-grow:${Math.max(free, 0.001)}">60 歲起可領${free >= 4 ? '（在職也可）' : ''}</span></div><div class="tl-ends"><span>現在 ${age} 歲</span>${lock ? '<span>60 歲</span>' : ''}<span>65 歲</span></div>`;
    tween('o-rate', salary ? c.t.marginal * 100 : null, (v) => `${Math.round(v)}%`);
    tween('o-save', salary ? c.t.saving : null, fmt);
    tween('o-be', salary ? c.breakEven : null, (v) => `${v.toFixed(1)}%`);
    // 提繳工資上限：月薪超過 15 萬時，自提以 15 萬計
    $('o-cap').hidden = salary <= PENSION_WAGE_MAX;
    if (salary > PENSION_WAGE_MAX) $('o-cap').innerHTML = `<b>已套用提繳工資上限</b>：月薪超過 ${fmt(PENSION_WAGE_MAX)} 元，勞退提繳以 ${fmt(PENSION_WAGE_MAX)} 元計算，自提 6% 每月最多 ${fmt(PENSION_WAGE_MAX * 0.06)} 元；稅率仍依你的全部所得計算。`;
    if (!salary) { $('o-bars').innerHTML = ''; $('o-delta').textContent = ''; $('o-infl').hidden = true; $('o-text').className = 'verdict'; $('o-text').textContent = '輸入月薪就會算出結果。'; return; }
    const on = $('c-real').checked, k = realOf(c, on);
    showDelta($('o-delta'), c, k);
    drawBars($('o-bars'), [[`自提（${lr}%）`, c.vP * k, 'b-p'], ['自提最差情況', c.vF * k, 'b-f'], [`不自提（${alt}%）`, c.vA * k, 'b-a']]);
    inflationNote($('o-infl'), c, on);
    verdict($('o-text'), c, alt, `<br><small class="small">打平報酬率 ${c.breakEven.toFixed(1)}%：不自提的錢，長期年化要超過這個數字才會比自提多。</small>`);
  }
  const syncChips = (id) => {
    const g = document.querySelector(`.chips[data-for="${id}"]`);
    if (g) for (const b of g.querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.v === +$(id).value));
  };
  for (const id of ['c-sal', 'c-bonus', 'c-int', 'c-div', 'c-other', 'c-age', 'c-lr', 'c-alt']) $(id).addEventListener('input', () => { syncChips(id); run(); });
  $('c-real').addEventListener('change', run);
  for (const id of ['c-sal', 'c-int', 'c-div', 'c-other']) $(id).addEventListener('blur', () => { const v = num($(id).value); $(id).value = v ? fmt(v) : (id === 'c-sal' ? '' : '0'); });
  for (const g of document.querySelectorAll('.chips[data-for]')) {
    g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $(g.dataset.for).value = b.dataset.v;
      syncChips(g.dataset.for);
      run();
    });
  }
  $('calc').addEventListener('submit', (e) => e.preventDefault());
  run();
})();

/* ── 6 題自我檢查 ── */
(() => {
  const answers = {};
  const groups = [...document.querySelectorAll('.yn')];
  const result = $('result');
  function render() {
    const done = Object.keys(answers).length;
    const blockers = [];
    if (answers.cash === 'no') blockers.push('先存緊急預備金');
    if (answers.debt === 'yes') blockers.push('先還高利率負債');
    if (answers.big === 'yes') blockers.push('大筆支出的錢不要放進自提');
    // 後三題：替代去處、投資紀律、稅率或年齡
    let lean = 0;
    if (answers.idle === 'yes') lean += 2; else if (answers.idle === 'no') lean -= 1;
    if (answers.invest === 'yes') lean -= 2; else if (answers.invest === 'no') lean += 1;
    if (answers.edge === 'yes') lean += 1;
    let cls = '', title = '還沒作答', text = '回答上面的問題，這裡會顯示你比較適合自提、自己投資，還是先做別的事。';
    if (done) {
      if (blockers.length) { cls = 'bad'; title = '先處理其他事'; text = `${blockers.join('、')}，再考慮自提。`; }
      else if (lean >= 2) { cls = 'good'; title = '自提比較合適'; text = '這筆錢自提，通常比放著或自己操作更有效率，也有保證收益墊底。可以考慮提到 6%。'; }
      else if (lean <= -2) { cls = 'mid'; title = '自己投資也是好選擇'; text = '你有長期投資的紀律，自己投資的期望報酬可能較高；但要接受波動、不保本。也可以只提一部分，兩邊都有。'; }
      else { cls = 'mid'; title = '兩邊都可以'; text = '差別不大。想強迫儲蓄、重視保本就自提；想保留彈性就自己存。也可以先提 2～3%，之後再調整。'; }
      text += `（已回答 ${done}/6 題）`;
    }
    result.className = 'result' + (cls ? ' ' + cls : '');
    const icon = { good: 'thumb', mid: 'scale', bad: 'pause' }[cls] || 'clip';
    result.innerHTML = `<svg class="ric pop" aria-hidden="true"><use href="#i-${icon}"/></svg><div><b>${title}</b><span>${text}</span></div>`;
    $('dots').innerHTML = groups.map((g) => `<i class="${answers[g.dataset.q] ? (answers[g.dataset.q] === g.dataset.fit ? 'y' : 'n') : ''}"></i>`).join('');
  }
  for (const g of groups) {
    g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      answers[g.dataset.q] = b.dataset.v;
      for (const x of g.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      render();
    });
  }
  $('reset').addEventListener('click', () => {
    for (const k of Object.keys(answers)) delete answers[k];
    for (const x of document.querySelectorAll('.yn button')) x.setAttribute('aria-pressed', 'false');
    render();
  });
})();

// 離線使用（本機 file:// 開啟時略過）
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
