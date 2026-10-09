/* 早謀遠算 · 簡單版：一次一題，最後只回答「夠不夠、錢從哪來、怎麼補」 */
import { compute, goalPlan, actionPlan, parseLaborStatement } from './engine.js';
import { load, save, applySeed, easyAnswers, applyEasy } from './state.js';
import { legalPensionAge, MIN_LIVING, EXPENSE_LEVELS } from './data.js';

const NOW = new Date().getFullYear();
const $ = (s) => document.querySelector(s);
const money = (v) => `$${Math.round(v).toLocaleString()}`;
const wan = (v) => (Math.abs(v) >= 1e4 ? `${(v / 1e4).toFixed(v >= 1e6 ? 0 : 1)} 萬` : money(v));
const ceil100 = (v) => Math.ceil(v / 100) * 100;

const ICON = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sun: '<path d="M3 18h18M5 21h14M12 14a5 5 0 0 0-5-5M12 14a5 5 0 0 1 5-5M12 3v2M4.2 7.2l1.4 1.4M19.8 7.2l-1.4 1.4"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><circle cx="16" cy="14" r="1.5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l9 5H3z"/>',
  piggy: '<path d="M19 9c-1-2-3-4-7-4-5 0-8 3-8 7 0 2 1 4 3 5v3h3v-2h4v2h3v-3c1-1 2-2 2-3h2v-4h-2z"/><circle cx="15" cy="10" r="1"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

let state = load();
applySeed(state, NOW);
let ans = easyAnswers(state);
let step = 0;

function commit() {
  state = applyEasy(state, ans);
  ans = easyAnswers(state);
  save(state);
}

/* ── 題目 ── */
const expenseBase = MIN_LIVING.find((r) => r.name === state.region)?.min ?? MIN_LIVING[6].min;
const STEPS = [
  {
    id: 'about', icon: 'user', q: '你是哪一年出生的？', hint: '用來推算勞保幾歲可以領，以及平均壽命。',
    body: () => `
      <label class="ez-field"><span>出生年（西元）</span><input class="ez-input num" type="number" inputmode="numeric" data-a="birthYear" min="1940" max="${NOW - 15}" value="${ans.birthYear}"></label>
      <p class="ez-sub">今年 ${NOW - ans.birthYear} 歲</p>
      <div class="ez-seg" role="group" aria-label="性別">
        ${[['male', '男性'], ['female', '女性']].map(([v, l]) => `<button type="button" data-pick="gender" data-val="${v}" aria-pressed="${ans.gender === v}">${l}</button>`).join('')}
      </div>
      <p class="ez-sub">女性平均壽命較長，退休金要準備久一點。</p>`,
  },
  {
    id: 'retire', icon: 'sun', q: '想幾歲退休？', hint: () => `依你的出生年，勞保 ${legalPensionAge(ans.birthYear)} 歲可以領全額；勞退滿 60 歲就能領。`,
    body: () => `
      <div class="ez-big num" id="ez-rv">${ans.retireAge} 歲</div>
      <input class="ez-range" type="range" min="50" max="70" step="1" data-a="retireAge" value="${ans.retireAge}" aria-label="退休年齡">
      <div class="ez-scale"><span>50</span><span>60</span><span>70</span></div>
      <p class="ez-sub" id="ez-rs">${ans.retireAge - (NOW - ans.birthYear) > 0 ? `還要工作 ${ans.retireAge - (NOW - ans.birthYear)} 年` : '已到退休年齡'}</p>`,
  },
  {
    id: 'salary', icon: 'briefcase', q: '現在每月薪水多少？', hint: '稅前。每月固定領的獎金、津貼也算進來。用來估算勞保和勞退能領多少。',
    body: () => moneyField('salary', '每月薪水', [30000, 45000, 60000, 80000, 100000]) + `
      <label class="ez-field"><span>年終、績效獎金、員工酬勞，一年加起來大約幾個月？</span><input class="ez-input num" type="number" inputmode="decimal" step="0.5" min="0" max="24" data-a="bonusMonths" value="${ans.bonusMonths}"></label>
      <div class="ez-chips">${[0, 1, 2, 3, 6].map((v) => `<button type="button" data-pick="bonusMonths" data-val="${v}" aria-pressed="${ans.bonusMonths === v}">${v} 個月</button>`).join('')}</div>
      <p class="ez-sub">這些會讓所得稅率變高（勞退自提的節稅效果也跟著變大），但一年發一次的獎金不列入勞退提繳。</p>`,
  },
  {
    id: 'work', icon: 'clock', q: '你的勞保年資有多久？', hint: '年資會直接影響勞保和勞退能領多少。換過工作、中間沒投保、早年打工都算。',
    body: () => {
      const age = NOW - ans.birthYear;
      const broken = ans.pastInsYears !== null;
      return `
      <label class="ez-field"><span>第一次有勞保是幾歲？（含打工）</span><input class="ez-input num" type="number" inputmode="numeric" data-a="workStartAge" min="15" max="${Math.max(15, age)}" value="${ans.workStartAge}"></label>
      <div class="ez-seg" role="group" aria-label="中間有沒有中斷">
        <button type="button" data-work="cont" aria-pressed="${!broken}">一直都有投保</button>
        <button type="button" data-work="broken" aria-pressed="${broken}">中間有中斷過</button>
      </div>
      ${broken ? `<label class="ez-field"><span>到現在累計大概幾年？</span><input class="ez-input num" type="number" inputmode="decimal" step="0.5" data-a="pastInsYears" min="0" max="${Math.max(0, age - 15)}" value="${ans.pastInsYears}"></label>`
        : `<p class="ez-sub" id="ez-wy">從 ${ans.workStartAge} 歲到現在，累計 ${Math.max(0, age - ans.workStartAge)} 年</p>`}
      <label class="ez-field"><span>勞退專戶目前有多少？（不知道可以留白）</span><span class="ez-money"><b>$</b><input class="ez-input num" type="text" inputmode="numeric" data-a="laborBalance" data-money data-null value="${ans.laborBalance === null ? '' : ans.laborBalance.toLocaleString()}" placeholder="留白就幫你估算"></span></label>
      <p class="ez-sub">投保年資和勞退餘額，都可以在勞保局網站的 e 化服務或「勞動保障卡」App 查到。</p>
      <details class="ez-bli"><summary>有勞退明細 PDF？貼上自動填（最準）</summary>
        <p class="ez-sub">打開「勞工退休金個人專戶明細」PDF，全選、複製，貼到下面。只在你的瀏覽器處理，不會上傳。</p>
        <textarea class="ez-input ez-text" id="ez-bli" rows="4" placeholder="貼上明細文字…"></textarea>
        <button type="button" class="ez-btn ghost" data-bli>讀取明細</button>
      </details>`;
    },
  },
  {
    id: 'assets', icon: 'wallet', q: '現在有多少存款和投資？', hint: '大概的數字就好，之後隨時可以改。',
    body: () => moneyField('cash', '銀行存款', null) + moneyField('invest', '股票、基金、ETF（市值）', null) +
      `<p class="ez-sub">存款當作緊急預備金；股票基金以年化 ${state.investReturn}% 估算。</p>`,
  },
  {
    id: 'monthly', icon: 'trend', q: '每個月能再存多少去投資？', hint: '例如每月定期定額買 ETF。沒有也沒關係，填 0。',
    body: () => moneyField('monthly', '每月投資', [0, 3000, 5000, 10000, 20000]),
  },
  {
    id: 'expense', icon: 'cart', q: '退休後每月大概要花多少？', hint: '用今天的物價想就好，通膨我們會幫你算。',
    body: () => moneyField('expense', '每月生活費', EXPENSE_LEVELS.map((l) => Math.round((expenseBase * l.mult) / 1000) * 1000), EXPENSE_LEVELS.map((l) => l.label)),
  },
];

function moneyField(k, label, chips, chipLabels) {
  return `<label class="ez-field"><span>${label}</span><span class="ez-money"><b>$</b><input class="ez-input num" type="text" inputmode="numeric" data-a="${k}" data-money value="${ans[k].toLocaleString()}"></span></label>
    ${chips ? `<div class="ez-chips">${chips.map((v, i) => `<button type="button" data-pick="${k}" data-val="${v}" aria-pressed="${ans[k] === v}">${chipLabels ? `<small>${chipLabels[i]}</small>` : ''}${v === 0 ? '0' : wan(v)}</button>`).join('')}</div>` : ''}`;
}

/* ── 畫面 ── */
function render() {
  const main = $('#ez');
  main.innerHTML = step < STEPS.length ? renderStep(STEPS[step]) : renderResult();
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  for (const r of main.querySelectorAll('.ez-range')) fill(r);
}
function renderStep(s) {
  const hint = typeof s.hint === 'function' ? s.hint() : s.hint;
  return `
    <div class="ez-prog" aria-label="第 ${step + 1} 題，共 ${STEPS.length} 題">
      ${STEPS.map((_, i) => `<i class="${i < step ? 'done' : i === step ? 'on' : ''}"></i>`).join('')}
      <span>${step + 1} / ${STEPS.length}</span>
    </div>
    <section class="ez-card">
      <div class="ez-q-ic">${icon(s.icon)}</div>
      <h1 class="ez-q">${s.q}</h1>
      <p class="ez-hint">${hint}</p>
      <div class="ez-body">${s.body()}</div>
    </section>
    <nav class="ez-nav">
      ${step > 0 ? '<button type="button" class="ez-btn ghost" data-go="-1">← 上一題</button>' : '<span></span>'}
      <button type="button" class="ez-btn primary" data-go="1">${step === STEPS.length - 1 ? '看結果' : '下一題 →'}</button>
    </nav>
    ${step === 0 && localStorage.getItem('zaomou_v2') ? '<p class="ez-skip"><button type="button" class="ez-link" data-go="result">已經填過了？直接看結果</button></p>' : ''}`;
}

function renderResult() {
  const R = compute(state, NOW);
  const need = ans.expense;
  const have = R.totalPV;
  const pct = need > 0 ? have / need : 1;
  const ok = have >= need;
  const pv = R.pvFactor;
  const parts = [
    { k: '勞保年金', ic: 'landmark', v: R.me.insMonthly * pv, c: '#3F8F6A', d: '政府的老年給付，按月領到終身' },
    { k: '勞退', ic: 'piggy', v: (R.me.laborRetire + R.me.oldMonthly) * pv, c: '#5B86B8', d: '公司每月幫你存 6%，60 歲後可領' },
    { k: '自己的存款與投資', ic: 'trend', v: R.investMonthly * pv, c: '#D9A43A', d: '退休後慢慢提領，用到預期壽命' },
    ...(R.spouseTotal ? [{ k: '配偶', ic: 'user', v: R.spouseTotal * pv, c: '#B07AA1', d: '配偶的勞保與勞退' }] : []),
  ].filter((p) => p.v > 0);
  const total = parts.reduce((t, p) => t + p.v, 0) || 1;

  // 不夠時的三種補法（以生活費為目標）
  const g = goalPlan({ ...state, targetMonthly: need }, NOW);
  const fixes = ok ? [] : [
    Number.isFinite(g.extraMonthly) && g.extraMonthly > 0 && { ic: 'trend', t: '每月多存去投資', v: money(ceil100(g.extraMonthly)), d: `以年化 ${state.investReturn}% 投資到退休`, act: { k: 'monthly', v: ans.monthly + ceil100(g.extraMonthly) } },
    g.retireAge && g.retireAge !== ans.retireAge && { ic: 'sun', t: '晚一點退休', v: `${g.retireAge} 歲`, d: `晚 ${g.retireAge - ans.retireAge} 年，多存幾年、少用幾年`, act: { k: 'retireAge', v: g.retireAge } },
    { ic: 'cart', t: '降低退休後花費', v: money(Math.floor(have / 1000) * 1000), d: '照目前規劃，每月大約能花這麼多', act: { k: 'expense', v: Math.floor(have / 1000) * 1000 } },
  ].filter(Boolean);

  // 簡單版只列能直接理解、或能一鍵套用的行動
  const todo = actionPlan(state, NOW).filter((a) => ['selfRate', 'emergency', 'bridge', 'invest'].includes(a.id)).slice(0, 3);
  const legal = legalPensionAge(ans.birthYear);
  const age = NOW - ans.birthYear;

  return `
    <section class="ez-hero ${ok ? 'ok' : 'short'}">
      <p class="ez-hero-k">${ans.retireAge} 歲退休後，每月大約可用</p>
      <div class="ez-hero-v num">${money(have)}</div>
      <p class="ez-hero-s">以今天的購買力計算・你想花 ${money(need)}</p>
      <div class="ez-meter" role="img" aria-label="可用金額是生活費的 ${Math.round(pct * 100)}%"><i style="width:${Math.min(100, pct * 100)}%"></i>${pct < 1 ? `<b style="left:100%"></b>` : ''}</div>
      <div class="ez-verdict">${ok
        ? `${icon('check')}<span><b>夠用</b>，每月還多出 ${money(have - need)}</span>`
        : `<span class="ez-warn">!</span><span><b>每月還差 ${money(need - have)}</b>（只夠 ${Math.round(pct * 100)}%）</span>`}</div>
    </section>

    <section class="ez-card">
      <h2 class="ez-h">錢從哪裡來？</h2>
      <div class="ez-stack">${parts.map((p) => `<i style="flex:${p.v};background:${p.c}" title="${p.k}"></i>`).join('')}</div>
      <ul class="ez-parts">${parts.map((p) => `<li><span class="ez-pi" style="color:${p.c};background:${p.c}1f">${icon(p.ic)}</span>
        <div><b>${p.k}</b><small>${p.d}</small></div><strong class="num">${money(p.v)}<small>${Math.round((p.v / total) * 100)}%</small></strong></li>`).join('')}</ul>
    </section>

    ${fixes.length ? `<section class="ez-card">
      <h2 class="ez-h">怎麼補上缺口？<small>選一種就夠，點了會直接重算</small></h2>
      <div class="ez-fixes">${fixes.map((f) => `<button type="button" class="ez-fix" data-fix="${f.act.k}" data-val="${f.act.v}">
        <span class="ez-pi">${icon(f.ic)}</span><span class="ez-fix-t">${f.t}</span><strong class="num">${f.v}</strong><small>${f.d}</small><em>改成這樣 →</em></button>`).join('')}</div>
    </section>` : ''}

    ${todo.length ? `<section class="ez-card">
      <h2 class="ez-h">今年可以先做的事</h2>
      <ol class="ez-todo">${todo.map((a) => `<li><span class="ez-pi">${icon(a.id === 'emergency' ? 'wallet' : a.id === 'selfRate' ? 'piggy' : a.id === 'bridge' ? 'clock' : 'check')}</span><div><b>${a.title}</b><small>${a.detail}</small>${a.apply ? `<button type="button" class="ez-mini" data-apply="${a.apply.path}" data-val="${a.apply.value}">幫我改成這樣</button>` : ''}</div></li>`).join('')}</ol>
    </section>` : ''}

    <section class="ez-card ez-assume">
      <h2 class="ez-h">這個結果怎麼算的？</h2>
      <ul>
        <li>你 ${age} 歲、月薪 ${money(ans.salary)}、${ans.retireAge} 歲退休；勞保年資到退休共 ${R.me.insYears.toFixed(1).replace(/\.0$/, '')} 年${ans.pastInsYears !== null ? `（到現在累計 ${ans.pastInsYears} 年，依你填的）` : ''}${ans.laborBalance === null ? '，勞退專戶依年資估算' : `，勞退專戶以目前 ${wan(ans.laborBalance)} 起算`}；勞保、勞退依現行法規與勞保局公式計算。${ans.retireAge < legal ? `勞保 ${legal} 歲才能領全額，${ans.retireAge} 歲就領每年少 4%${legal - ans.retireAge > 5 ? `，最早只能提前 5 年（${legal - 5} 歲）` : ''}。` : ''}</li>
        <li>存款 ${wan(ans.cash)}、投資 ${wan(ans.invest)}，每月再投資 ${money(ans.monthly)}，股票基金以年化 ${state.investReturn}%、通膨 ${state.cpi}% 估算。</li>
        <li>所有金額都換算成「今天的購買力」，方便和現在的生活比較。</li>
        <li>退休後沒有工作、也沒有家人可依附時，健保費以第六類投保每月 826 元（健保署），記得算進退休後的花費；股利、利息每次入帳滿 2 萬元另扣 2.11% 補充保費。</li>
      </ul>
      <div class="ez-actions">
        <button type="button" class="ez-btn ghost" data-go="restart">修改答案</button>
        <a class="ez-btn primary" href="app.html">看完整分析（可調整所有假設）→</a>
      </div>
    </section>
    <p class="ez-foot">試算結果僅供參考，不構成理財建議。資料只存在你的瀏覽器。</p>`;
}

/* ── 互動 ── */
function fill(r) { r.style.setProperty('--fill', `${((r.value - r.min) / (r.max - r.min)) * 100}%`); }
const parseMoney = (v) => Math.max(0, Math.round(+String(v).replace(/[^\d.]/g, '') || 0));

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const k = el.dataset.a;
  ans[k] = el.dataset.null !== undefined && String(el.value).trim() === '' ? null
    : el.dataset.money !== undefined ? parseMoney(el.value) : +el.value;
  if (k === 'workStartAge' && $('#ez-wy')) $('#ez-wy').textContent = `從 ${ans.workStartAge} 歲到現在，累計 ${Math.max(0, NOW - ans.birthYear - ans.workStartAge)} 年`;
  if (el.type === 'range') {
    fill(el);
    $('#ez-rv').textContent = `${ans.retireAge} 歲`;
    const left = ans.retireAge - (NOW - ans.birthYear);
    $('#ez-rs').textContent = left > 0 ? `還要工作 ${left} 年` : '已到退休年齡';
  }
  for (const b of document.querySelectorAll(`[data-pick="${k}"]`)) b.setAttribute('aria-pressed', String(+b.dataset.val === ans[k]));
});
document.addEventListener('focusout', (e) => {
  const el = e.target.closest('[data-money]');
  if (el) el.value = ans[el.dataset.a] === null ? '' : ans[el.dataset.a].toLocaleString();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest('.ez-input')) { e.preventDefault(); go(1); }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-bli]')) {
    const r = parseLaborStatement($('#ez-bli').value);
    if (!r || r.balance === null) { toast('讀不到明細，請確認貼上的是「勞工退休金個人專戶明細資料」整份文字'); return; }
    const done = [];
    ans.laborBalance = r.balance; done.push(`勞退餘額 ${money(r.balance)}`);
    if (r.years !== null) { ans.pastInsYears = Math.round(r.years * 4) / 4; done.push(`年資 ${ans.pastInsYears} 年`); }
    if (r.complete && r.first) { ans.workStartAge = Math.max(15, Math.round(r.first.year + 1911 - ans.birthYear - (r.first.month < 7 ? 0.5 : 0))); done.push(`${ans.workStartAge} 歲開始投保`); }
    if (r.selfRate !== null && r.selfRate !== state.self.selfRate) { state.self.selfRate = r.selfRate; done.push(`自提 ${r.selfRate}%`); }
    commit(); render();
    toast(`已從明細帶入：${done.join('、')}`);
    return;
  }
  const wk = e.target.closest('[data-work]');
  if (wk) {
    const age = NOW - ans.birthYear;
    ans.pastInsYears = wk.dataset.work === 'broken' ? Math.max(0, age - ans.workStartAge) : null;
    render();
    if (wk.dataset.work === 'broken') document.querySelector('[data-a="pastInsYears"]')?.focus();
    return;
  }
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const k = pick.dataset.pick;
    ans[k] = k === 'gender' ? pick.dataset.val : +pick.dataset.val;
    for (const b of document.querySelectorAll(`[data-pick="${k}"]`)) b.setAttribute('aria-pressed', String(b === pick));
    const inp = document.querySelector(`[data-a="${k}"]`);
    if (inp) inp.value = ans[k].toLocaleString();
    return;
  }
  const g = e.target.closest('[data-go]');
  if (g) {
    const v = g.dataset.go;
    if (v === 'restart') { step = 0; render(); return; }
    if (v === 'result') { step = STEPS.length; render(); return; }
    go(+v);
    return;
  }
  const ap = e.target.closest('[data-apply]');
  if (ap) {
    const before = compute(state, NOW).totalPV;
    const keys = ap.dataset.apply.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], state)[last] = +ap.dataset.val;
    save(state); ans = easyAnswers(state); render();
    toast(`已套用，每月可用 ${money(before)} → ${money(compute(state, NOW).totalPV)}`);
    return;
  }
  const fix = e.target.closest('[data-fix]');
  if (fix) {
    const before = compute(state, NOW).totalPV;
    ans[fix.dataset.fix] = +fix.dataset.val;
    commit();
    render();
    const after = compute(state, NOW).totalPV;
    toast(fix.dataset.fix === 'expense' ? '已把退休後生活費調成目前規劃能支應的金額' : `已套用，每月可用 ${money(before)} → ${money(after)}`);
  }
});

function go(d) {
  const err = d > 0 ? check(STEPS[step]?.id) : '';
  if (err) { toast(err); return; }
  commit();
  step = Math.max(0, Math.min(STEPS.length, step + d));
  render();
}
function check(id) {
  const age = NOW - ans.birthYear;
  if (id === 'about' && (!(ans.birthYear >= 1940) || age < 15)) return `出生年請填 1940 到 ${NOW - 15} 之間的西元年`;
  if (id === 'retire' && ans.retireAge <= age && age < 70) return '退休年齡要大於現在的年齡';
  if (id === 'work' && (ans.workStartAge < 15 || ans.workStartAge > Math.max(15, age))) return `第一次投保年齡請填 15 到 ${Math.max(15, age)} 歲`;
  if (id === 'work' && ans.pastInsYears !== null && (ans.pastInsYears < 0 || ans.pastInsYears > Math.max(0, age - 15))) return `累計年資請填 0 到 ${Math.max(0, age - 15)} 年`;
  if (id === 'salary' && !(ans.bonusMonths >= 0 && ans.bonusMonths <= 24)) return '年終與獎金請填 0 到 24 個月';
  if (id === 'salary' && ans.salary <= 0) return '請填每月薪水；還沒工作可以填預計的起薪';
  if (id === 'expense' && ans.expense <= 0) return '請填退休後每月大概要花多少';
  return '';
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 不影響試算 */ });
}
