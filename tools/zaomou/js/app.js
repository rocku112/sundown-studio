/* 早謀遠算 · 試算介面
   畫面分兩種：含輸入欄位的分頁（起點設定、投資資產、目標與行動）只在結構改變時重繪，
   數字靠 data-o 局部更新，避免打字時失焦；純輸出的分頁與側欄則每次重算後整頁重繪。 */

import { compute, holdingValue, growLump, growMonthly, lifecycle, sensitivity, retireAgeOptions, goalPlan, validate, scenarioSummary, selfContributionTax, monteCarlo, actionPlan, planPath, trackProgress, laborLumpVsMonthly, selfContributionAnalysis, insuranceClaimOptions, insCpiFactor, insuranceLumpVsAnnuity, withdrawalStrategies } from './engine.js';
import { LABOR_MONTHLY, LABOR_FUND, legalPensionAge, INSURANCE_GRADES, MIN_LIVING, EXPENSE_LEVELS, RETURN_PRESETS, LIFE_TABLE, DATA_YEAR, PENSION_WAGE_MAX, dataStale } from './data.js';
import { load, save, defaults, parseImport, getPath, setPath, uid, applySeed, STORAGE_KEY, normalize, loadScenarios, saveScenarios, MAX_SCENARIOS, templates } from './state.js';
import { lineChart, donut, wan, attachTooltips } from './charts.js';

const NOW = new Date().getFullYear();
const hadSaved = (() => { try { return !!(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('nuclear_retirement_v1')); } catch { return false; } })();
let state = load();
const seeded = applySeed(state, NOW);
if (seeded && !hadSaved) state.holdings = []; // 與介紹頁迷你試算的假設一致
let R = compute(state, NOW);
let tab = ['setup', 'floor', 'invest', 'plan', 'analysis'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'setup';

/* ── 小工具 ─────────────────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// 減少 h% ＝ 打 (100−h)/10 折，例如減少 30% 為打 7 折、減少 15% 為打 8.5 折
const discount = (h) => +((100 - h) / 10).toFixed(1);
const money = (v) => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString()}` : '—');
const pct = (v, d = 1) => `${(+v).toFixed(d)}%`;
// 文字用色需在米色底上達到 4.5 對比；gold／greenL 僅用於圖形
const C = { navy: '#2D4A6E', navyL: '#3A5F8A', gold: '#E8B84B', gold2: '#80600F', green: '#2E7353', greenL: '#5BAD85', red: '#B23A33', purple: '#7A6BB8', muted: '#636C79' };

const ICON = {
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l9 5H3z"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v4h-4a2 2 0 0 0 0 4h4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  chart: '<path d="M3 3v18h18M8 17V11M13 17V7M18 17v-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  piggy: '<path d="M19 9c-1-2-3-4-7-4-5 0-8 3-8 7 0 2 1 4 3 5v3h3v-2h4v2h3v-3c1-1 2-2 2-3h2v-4h-2z"/><circle cx="15" cy="10" r="1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M1 21a8 8 0 0 1 16 0M17 4a4 4 0 0 1 0 8M23 21a8 8 0 0 0-5-7.4"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 1V2l-1 1-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 12v8M17 2c0 6-10 6-10 12v8"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const badge = (k, bg, fg) => `<span class="badge-ic" style="background:${bg};color:${fg}">${icon(k)}</span>`;

/* ── 表單元件（data-k 綁定狀態路徑） ─────────── */
const numF = (k, label, o = {}) => {
  const isMoney = o.unit === '元';
  const v = getPath(state, k);
  const t = isMoney ? (o.nullable ? 'moneynull' : 'money') : (o.nullable ? 'numnull' : 'num');
  const attrs = isMoney
    ? 'type="text" inputmode="numeric" autocomplete="off"'
    : `type="number" inputmode="decimal" ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.max !== undefined ? `max="${o.max}"` : ''} step="${o.step ?? 1}"`;
  return `
  <label class="field"><span>${label}${o.em ? ` <em>${o.em}</em>` : ''}</span>
    <span class="input-wrap"><input class="input num" ${attrs} data-k="${k}" data-t="${t}" value="${fmtInput(v, t)}"
      ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''} ${o.rerender ? 'data-rerender' : ''}>${o.unit ? `<span class="unit">${o.unit}</span>` : ''}</span></label>`;
};
function fmtInput(v, t) {
  if (v === null || v === undefined || v === '') return '';
  return t === 'money' || t === 'moneynull' ? Math.round(v).toLocaleString() : v;
}
const textF = (k, label) => `
  <label class="field"><span>${label}</span><input class="input txt" type="text" data-k="${k}" data-t="str" value="${esc(getPath(state, k))}" maxlength="30"></label>`;
const rangeF = (k, label, min, max, step, o = {}) => `
  <label class="field"><span>${label}${o.em ? ` <em>${o.em}</em>` : ''}</span>
    <span class="range-row"><input type="range" data-k="${k}" data-t="num" min="${min}" max="${max}" step="${step}" value="${getPath(state, k)}">
    <output data-v="${k}" data-unit="${o.unit ?? '%'}">${fmtV(getPath(state, k), o.unit ?? '%')}</output></span></label>`;
function fmtV(v, unit) { return unit === '%' ? pct(v) : unit === '$' ? money(v) : `${v}${unit}`; }
const seg = (k, opts, o = {}) => `<div class="seg" role="group" ${o.label ? `aria-label="${o.label}"` : ''}>${opts.map(([v, l]) =>
  `<button type="button" data-set="${k}" data-val="${v}" aria-pressed="${String(getPath(state, k)) === String(v)}">${l}</button>`).join('')}</div>`;
const sw = (k, label) => `<button type="button" class="switch" role="switch" aria-label="${label}" aria-checked="${!!getPath(state, k)}" data-toggle="${k}"></button>`;
const out = (key, html = '') => `<span data-o="${key}">${html}</span>`;

/* ── 輸出欄位（data-o） ───────────────────────── */
function outVal(key) {
  const [kind, a, b] = key.split(':');
  const me = R.me;
  switch (kind) {
    case 'total': return money(R.total);
    case 'issues': {
      const list = validate(state, NOW);
      if (!list.length) return '';
      const icon = { error: '✕', warn: '!', info: 'i' };
      return `<div class="issues">${list.map((x) => `<button type="button" class="issue ${x.level}" data-focus="${x.field}"><span>${icon[x.level]}</span>${esc(x.msg)}</button>`).join('')}</div>`;
    }
    case 'ageinfo': {
      const s = state.self;
      return `目前約 <b>${me.age}</b> 歲，距退休 <b>${R.n}</b> 年；勞保年資 <b>${me.insYears}</b> 年；
        依出生年次，勞保老年年金法定請領年齡為 <b>${legalPensionAge(s.birthYear)}</b> 歲。` +
        (me.bridge.years > 0 ? `<br><span class="tag warn" style="margin-left:0">空窗期 ${me.bridge.years} 年</span> 勞退 ${me.bridge.laborStart} 歲、勞保 ${me.bridge.insStart} 歲才能開始領，退休時需另外準備約 <b>${wan(me.bridge.missing)}</b> 撐過這段時間（詳見「保底收入」）。` : '');
    }
    case 'insgrade': {
      if (state.self.insMode === 'manual') return `投保薪資 <b>${money(me.insBase)}</b>（第 ${me.insGrade} 級）`;
      return `月薪 ${money(state.self.salary)} → 目前第 <b>${me.insGrade}</b> 級 ${money(me.insBaseNow)}` +
        (me.insBaseNow >= 45800 ? '（已達上限）' : '') +
        `；依薪資年增率推估，退休前 60 個月平均投保薪資約 <b>${money(me.insBase)}</b>，勞保年金以此計算。`;
    }
    case 'laborinfo': return `每月提繳 <b>${money(me.acct.monthlyContrib)}</b>（雇主 6% + 自提 ${pct(state.self.selfRate, 1)}，提繳工資上限 ${money(PENSION_WAGE_MAX)}）。` +
      (state.self.laborBalance === null ? `未填餘額，依新制施行後約 <b>${me.acct.estimatedPast.toFixed(1)}</b> 年年資回推估算。` : '') +
      ` 退休時專戶約 <b>${wan(me.acct.pool)}</b>，依勞保局月退算法約月領 <b>${money(me.laborRetire)}</b>${me.laborOfficial.eligible ? `，領到 ${me.laborOfficial.endAge} 歲` : '（年資未滿 15 年只能一次領）'}。`;
    case 'taxinfo': {
      const cur = state.self.selfRate;
      const t = selfContributionTax(state.self.salary, cur > 0 ? cur : 6);
      if (t.marginal === 0) return '依目前月薪估算，綜合所得淨額為 0、本來就不用繳稅，自提沒有節稅效果，但仍可累積退休金。';
      return `${cur > 0 ? `自提 ${pct(cur)}` : '若自提 6%'}：每年提撥 <b>${money(t.contrib)}</b>，不計入當年度薪資所得課稅，估計少繳綜所稅約 <b>${money(t.saving)}</b>（邊際稅率 ${Math.round(t.marginal * 100)}%），實際負擔約 ${money(t.netCost)}。`;
    }
    case 'haircut': {
      if (!state.insHaircut) return '目前照現行制度計算。想知道「萬一勞保給付變少」還夠不夠用，把滑桿往右拉。';
      const lost = me.insFull - me.insMonthly + (R.spouse ? R.spouse.insFull - R.spouse.insMonthly : 0);
      return `勞保給付減少 ${state.insHaircut}%：每月少領 <b>${money(lost)}</b>${R.spouse ? '（含配偶）' : ''}，退休月領變為 <b>${money(R.total)}</b>` +
        (R.expenseToday > 0 ? `，生活費覆蓋率 <b>${Math.round(R.coverage * 100)}%</b>。` : '。');
    }
    case 'care': {
      if (!R.care) return '';
      const c = R.care;
      return `${c.startAge} 歲時照護費約 ${money(c.monthlyAtStart)}／月，加上生活費共需 <b>${money(c.need)}</b>／月（皆為當年名目）；` +
        (c.gap > 0 ? `月領只有 ${money(R.total)}，每月缺口 <b>${money(c.gap)}</b> 要靠投資資產補。` : `月領 ${money(R.total)} 足以支應。`);
    }
    case 'events': {
      if (!state.events.length) return '尚未加入事件';
      return R.eventsMonthly ? `退休時資產池 ${R.eventsPool >= 0 ? '+' : '−'}${wan(Math.abs(R.eventsPool))}，月領 ${R.eventsMonthly >= 0 ? '+' : '−'}${money(Math.abs(R.eventsMonthly))}` : '事件都在退休後，影響見分析圖表';
    }
    case 'oldinfo': return me.oldUnits > 0
      ? `${me.oldUnits} 基數 × 退休時月薪約 ${money(me.finalSalary)} = 一次領 <b>${wan(me.oldLump)}</b>，換算月領 <b>${money(me.oldMonthly)}</b>`
      : '未填舊制年資';
    case 'benefit': return `每月合計提撥 <b>${money(state.benefit.self + state.benefit.company)}</b>，退休時累積 <b>${wan(R.benefitPool)}</b>，換算月領 <b>${money(R.benefitMonthly)}</b>`;
    case 'spouse': return R.spouse
      ? `${esc(state.spouse.name)}目前約 ${R.spouse.age} 歲；勞保 ${money(R.spouse.insMonthly)} + 勞退 ${money(R.spouse.laborRetire)}` +
        (R.spouse.oldMonthly ? ` + 舊制 ${money(R.spouse.oldMonthly)}` : '') + ` = 月領 <b>${money(R.spouse.floor)}</b>`
      : '';
    case 'expense': return `今日 ${money(R.expenseToday)}／月，以通膨 ${pct(state.cpi)} 計，${R.n} 年後約 <b>${money(R.expenseAtRetire)}</b>／月`;
    case 'payout': return `從 ${state.self.retireAge} 歲領到 <b>${me.lifeAge.toFixed(1)}</b> 歲，共 <b>${me.payoutMonths}</b> 個月。` +
      (state.payoutMode === 'divisor'
        ? '資產池直接除以月數（不計退休後報酬，較保守）。'
        : `資產池以年化 ${pct(state.postReturn)} 邊領邊滾，到期剛好領完。`);
    case 'h': {
      const h = state.holdings.find((x) => x.id === a);
      if (!h) return '';
      const now = holdingValue(h, state.fx), fut = growLump(now, R.n, h.rate);
      return `市值 <strong>${wan(now)}</strong> → 退休時 <strong>${wan(fut)}</strong>，月領 <strong>${money(me.payout.toMonthly(fut))}</strong>`;
    }
    case 'pf': return money(R.portfolioRows.find((p) => p.id === a)?.monthly ?? 0);
    case 'pa': return money(R.portfolioRows.find((p) => p.id === a)?.assets.find((x) => x.id === b)?.monthly ?? 0);
    case 'holdsum': return `現值 ${wan(R.holdingsNow)} → 退休時 ${wan(R.holdingsPool)}，月領 <b>${money(R.holdingsMonthly)}</b>`;
    case 'pfsum': return `每月投入 ${money(R.monthlyInvest)} → 退休時 ${wan(R.portfolioPool)}，月領 <b>${money(R.portfolioMonthly)}</b>`;
    case 'rv': {
      const v = R.reverse;
      const map = {
        target: money(v.targetNominal), gap: v.gapMonthly > 0 ? money(v.gapMonthly) : '已足夠',
        pool: v.requiredPool > 0 ? wan(v.requiredPool) : '不需要', have: wan(R.investPool), short: v.shortfallPool > 0 ? wan(v.shortfallPool) : '0',
        extra: Number.isFinite(v.extraMonthly) ? money(Math.ceil(v.extraMonthly)) : '—',
      };
      return map[a];
    }
    case 'fire': return R.fireAge === null ? '60 年內未達成' : `${R.fireAge} 歲`;
    default: return '';
  }
}

/* ── 分頁 ─────────────────────────────────── */
// 常見人生事件（金額為示意，可自行修改）
const EVENT_PRESETS = [
  { name: '買房頭期款', offset: 5, amount: 2000000, kind: 'out' },
  { name: '子女大學學費', offset: 18, amount: 1000000, kind: 'out' },
  { name: '換車', offset: 8, amount: 800000, kind: 'out' },
  { name: '房貸提前還款', offset: 15, amount: 1500000, kind: 'out' },
  { name: '保單到期／繼承', offset: 25, amount: 2000000, kind: 'in' },
  { name: '自訂事件', offset: 10, amount: 500000, kind: 'out' },
];

const TABS = [
  ['setup', '起點設定', 'sliders'],
  ['floor', '保底收入', 'landmark'],
  ['invest', '投資資產', 'wallet'],
  ['plan', '目標與行動', 'target'],
  ['analysis', '分析圖表', 'chart'],
];

function pageSetup() {
  const s = state.self, sp = state.spouse;
  const tbl = LIFE_TABLE[s.gender] || LIFE_TABLE.male;
  const region = MIN_LIVING.find((r) => r.name === state.region) || MIN_LIVING[6];
  return `
  <div class="page-head"><span class="step">STEP 01</span><h2 class="page-title">起點設定</h2></div>
  <p class="page-sub">填入基本資料，右側數字即時更新。資料只存在這台裝置的瀏覽器裡。</p>
  ${out('issues', outVal('issues'))}

  <section class="card tpl"><div class="card-h"><h3>${badge('sliders', 'rgba(232,184,75,.18)', '#9A7210')}快速開始：選一個最像你的情況</h3><span class="hint">套用後可再逐項調整</span></div>
    <div class="tpls">${templates(NOW).map((t) => `<button type="button" class="tpl-b" data-act="template" data-id="${t.id}"><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('user', 'rgba(45,74,110,.1)', C.navy)}個人基本資料</h3></div>
    <div class="grid">
      ${numF('self.birthYear', '出生年（西元）', { min: 1940, max: NOW - 15 })}
      ${numF('self.workStartAge', '開始投保年齡', { min: 15, max: 60, unit: '歲' })}
      ${numF('self.retireAge', '預計退休年齡', { min: 50, max: 75, unit: '歲', rerender: true })}
      <div class="field"><span>生理性別 <em>（影響生命表餘命）</em></span>${seg('self.gender', [['male', '男性'], ['female', '女性']])}</div>
    </div>
    <p class="note">${out('ageinfo', outVal('ageinfo'))}</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('briefcase', 'rgba(45,74,110,.1)', C.navy)}薪資與勞保</h3>
      ${seg('self.insMode', [['auto', '依月薪自動'], ['manual', '手動選級距']], { label: '投保薪資設定方式' })}</div>
    <div class="grid two">
      ${numF('self.salary', '目前月薪', { min: 0, step: 1000, unit: '元' })}
      ${rangeF('salaryGrowth', '薪資年增率', 0, 6, 0.5)}
      ${numF('self.insClaimAge', '勞保請領年齡', { nullable: true, min: 55, max: 75, unit: '歲', placeholder: '同退休年齡', em: '（選填，可晚於退休）' })}
      ${s.insMode === 'manual' ? `<label class="field"><span>勞保投保薪資級距</span>
        <select class="input" data-k="self.insGrade" data-t="num">${INSURANCE_GRADES.map((g, i) =>
          `<option value="${i + 1}" ${s.insGrade === i + 1 ? 'selected' : ''}>第 ${i + 1} 級 — ${money(g)}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="stress">
      ${rangeF('insHaircut', '勞保給付打折（壓力測試）', 0, 50, 5, { em: '（假設未來改革或財務吃緊）' })}
      <div class="chips">${[[0, '照現制'], [10, '打 9 折'], [20, '打 8 折'], [30, '打 7 折']].map(([v, l]) => `<button type="button" class="chip" data-set="insHaircut" data-val="${v}" aria-pressed="${state.insHaircut === v}">${l}</button>`).join('')}</div>
      <p class="note" style="margin-top:8px">${out('haircut', outVal('haircut'))}</p>
    </div>
    <p class="note">${out('insgrade', outVal('insgrade'))}<br>勞保依「投保薪資」計算（${DATA_YEAR} 年分級表最高 45,800 元）；勞退依「月提繳工資」計算（上限 150,000 元），兩者分開。</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('piggy', 'rgba(63,154,110,.12)', C.green)}勞退新制個人專戶</h3></div>
    <div class="grid two">
      ${rangeF('self.selfRate', '個人自提率', 0, 6, 0.5, { em: '（免稅，0–6%）' })}
      <div class="field">${rangeF('self.laborReturn', '勞退基金年化收益', 1, 10, 0.1).replace(/^\s*<label class="field">|<\/label>\s*$/g, '')}
        <div class="chips">${RETURN_PRESETS.map((p) => `<button type="button" class="chip" data-set="self.laborReturn" data-val="${p.v}" aria-pressed="${s.laborReturn === p.v}">${p.label}</button>`).join('')}</div></div>
      ${numF('self.laborBalance', '目前專戶累積金額', { nullable: true, min: 0, step: 10000, unit: '元', placeholder: '不確定可留白', em: '（選填）' })}
    </div>
    <p class="note">${out('laborinfo', outVal('laborinfo'))} 專戶餘額可至勞保局 e 化服務系統或「勞動保障卡」App 查詢，填入後估算最準。</p>
    <div class="calc">${out('taxinfo', outVal('taxinfo'))}<br><small>依 115 年度綜所稅級距、單身、年薪以月薪 × 12 計、使用標準扣除額估算；有配偶合併申報、年終獎金或列舉扣除時會不同。</small></div>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('history', 'rgba(63,154,110,.12)', C.green)}勞基法舊制年資</h3><span class="hint">94 年 7 月前已在職者</span></div>
    <div class="grid">${numF('self.oldSystemYears', '保留的舊制年資', { min: 0, max: 45, unit: '年' })}</div>
    <p class="note">${out('oldinfo', outVal('oldinfo'))}<br>前 15 年每年 2 基數、之後每年 1 基數，最高 45 基數；須符合在同一事業單位退休的條件，由雇主一次給付。</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('building', 'rgba(122,107,184,.12)', C.purple)}企業福利信託</h3>${sw('benefit.enabled', '啟用企業福利信託')}</div>
    ${state.benefit.enabled ? `<div class="grid">
      ${textF('benefit.name', '名稱')}
      ${numF('benefit.self', '員工自提／月', { min: 0, step: 500, unit: '元' })}
      ${numF('benefit.company', '公司提撥／月', { min: 0, step: 500, unit: '元' })}
      ${numF('benefit.rate', '年化報酬', { min: 0, max: 20, step: 0.5, unit: '%' })}
    </div><p class="note">${out('benefit', outVal('benefit'))}</p>` : '<p class="note" style="margin:0">員工持股信託、福利儲蓄計畫等，公司有相對提撥再開啟。</p>'}
  </section>

  <section class="card"><div class="card-h"><h3>${badge('users', 'rgba(122,107,184,.12)', C.purple)}配偶／雙薪家庭</h3>${sw('spouse.enabled', '加入配偶試算')}</div>
    ${sp.enabled ? `<div class="grid">
      ${textF('spouse.name', '稱呼')}
      ${numF('spouse.birthYear', '出生年（西元）', { min: 1940, max: NOW - 15 })}
      ${numF('spouse.workStartAge', '開始投保年齡', { min: 15, max: 60, unit: '歲' })}
      ${numF('spouse.retireAge', '預計退休年齡', { min: 50, max: 75, unit: '歲' })}
      ${numF('spouse.salary', '目前月薪', { min: 0, step: 1000, unit: '元' })}
      ${numF('spouse.selfRate', '勞退自提率', { min: 0, max: 6, step: 0.5, unit: '%' })}
      ${numF('spouse.laborReturn', '勞退年化收益', { min: 0, max: 15, step: 0.1, unit: '%' })}
      ${numF('spouse.laborBalance', '勞退專戶餘額', { nullable: true, min: 0, step: 10000, unit: '元', placeholder: '選填' })}
      ${numF('spouse.oldSystemYears', '舊制年資', { min: 0, max: 45, unit: '年' })}
      <div class="field"><span>生理性別</span>${seg('spouse.gender', [['male', '男性'], ['female', '女性']])}</div>
    </div><p class="note">${out('spouse', outVal('spouse'))}</p>` : '<p class="note" style="margin:0">把配偶的勞保與勞退月領一起算進家庭退休收入。</p>'}
  </section>

  <section class="card"><div class="card-h"><h3>${badge('receipt', 'rgba(201,74,74,.1)', C.red)}生活費與通膨</h3></div>
    <div class="grid two">
      ${numF('monthlyExpense', '退休後每月生活費（今日幣值）', { min: 0, step: 1000, unit: '元' })}
      ${rangeF('cpi', '通膨率（CPI）', 0, 5, 0.1)}
    </div>
    <div class="field" style="margin-top:14px"><span>依居住地最低生活費快選 <em>（衛福部及直轄市 ${DATA_YEAR} 年度公告）</em></span>
      <select class="input txt" data-act="region"><option value="">選擇居住地…</option>${MIN_LIVING.map((r) =>
        `<option value="${esc(r.name)}" ${state.region === r.name ? 'selected' : ''}>${r.name}（最低 ${money(r.min)}）</option>`).join('')}</select>
      <div class="chips">${EXPENSE_LEVELS.map((l) => {
        const v = Math.round((region.min * l.mult) / 500) * 500;
        return `<button type="button" class="chip" data-set="monthlyExpense" data-val="${v}" aria-pressed="${state.monthlyExpense === v}" title="${l.tip}">${l.label} ${money(v)}</button>`;
      }).join('')}</div></div>
    <p class="note">${out('expense', outVal('expense'))}</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('users', 'rgba(194,69,61,.1)', C.red)}晚年照護支出</h3>${sw('care.enabled', '加入晚年照護支出')}</div>
    ${state.care.enabled ? `<div class="grid">
      ${numF('care.startAge', '幾歲開始需要照護', { min: 60, max: 100, unit: '歲' })}
      ${numF('care.monthly', '每月照護費（今日幣值）', { unit: '元' })}
    </div>
    <div class="chips">${[[20000, '較低'], [30000, '中等'], [45000, '較高']].map(([v, l]) => `<button type="button" class="chip" data-set="care.monthly" data-val="${v}" aria-pressed="${state.care.monthly === v}">${l} ${money(v)}</button>`).join('')}</div>
    <p class="note">${out('care', outVal('care'))}</p>
    <p class="note">照護費由投資資產支出，會反映在「投資資產可撐到幾歲」。金額為自行設定的參考值，可依居家看護、日照或機構安置的實際報價調整。</p>`
    : '<p class="note" style="margin:0">多數試算只算到「退休生活費」，但晚年照護常是最大的一筆開銷。開啟後，指定年齡起每月會多一筆照護費。</p>'}
  </section>

  <section class="card"><div class="card-h"><h3>${badge('hourglass', 'rgba(232,184,75,.18)', '#9A7210')}退休後提領方式</h3>
      ${seg('payoutMode', [['divisor', '生命表除數'], ['annuity', '年金化']], { label: '提領方式' })}</div>
    <div class="grid">
      ${state.payoutMode === 'annuity' ? rangeF('postReturn', '退休後年化報酬', 0, 8, 0.5) : ''}
      ${numF('lifeAgeOverride', '預期壽命', { nullable: true, min: 60, max: 110, step: 0.5, unit: '歲', placeholder: `${(s.retireAge + R.me.payoutMonths / 12).toFixed(1)}（生命表）`, em: '（選填）' })}
      ${numF('healthAgeOverride', '健康平均壽命', { nullable: true, min: 50, max: 100, step: 0.5, unit: '歲', placeholder: `${tbl.healthAge}（參考值）`, em: '（選填）' })}
    </div>
    <p class="note">${out('payout', outVal('payout'))}<br>勞退、舊制、企業信託與投資資產都用同一種方式把「一筆錢」換算成月領；勞保年金本身就是按月給付，不受影響。</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('save', 'rgba(45,74,110,.08)', C.navyL)}資料備份</h3></div>
    <div class="btn-row">
      <button type="button" class="btn" data-act="export">匯出設定檔</button>
      <label class="btn">匯入設定檔<input type="file" accept=".json,application/json" data-act="import" hidden></label>
      <button type="button" class="btn ghost" data-act="reset">全部重設</button>
    </div>
    <p class="note">設定自動存在這台裝置的瀏覽器。換裝置時匯出 JSON 檔再匯入即可；舊版「退休試算設定.json」也能匯入。</p>
  </section>`;
}

function pageFloor() {
  const me = R.me, s = state.self;
  const ins = me.ins;
  const insNote = ins.kind === 'annuity'
    ? `退休前 60 個月平均投保薪資 ${money(me.insBase)} × 年資 ${me.insYears} 年，${ins.formula} 式擇優（A ${money(ins.a)}／B ${money(ins.b)}）` +
      (ins.adj ? `，${ins.startAge} 歲請領 ${ins.adj > 0 ? '延後增給' : '提前減給'} ${Math.round(Math.abs(ins.adj) * 100)}%` : `，${ins.startAge} 歲起領`)
    : `年資未滿 15 年，只能請領一次金約 ${wan(ins.lump)}，以提領月數換算`;
  const row = (k, sub, v, tag = '') => `<div class="row"><div class="k">${k}${tag}<small>${sub}</small></div><div class="v">${money(v)}</div></div>`;
  return `
  <div class="page-head"><span class="step">STEP 02</span><h2 class="page-title">保底收入</h2></div>
  <p class="page-sub">法定退休給付與公司福利，是退休收入裡最穩的一塊。所有金額都是退休當年的名目月領。</p>
  <section class="card">
    <div class="rows">
      ${row('勞保老年給付', insNote + (state.insHaircut ? `；壓力測試打 ${discount(state.insHaircut)} 折（原 ${money(me.insFull)}）` : ''), me.insMonthly, (ins.kind === 'lump' ? '<span class="tag warn">一次金</span>' : `<span class="tag">${ins.formula} 式</span>`) + (state.insHaircut ? `<span class="tag warn">−${state.insHaircut}%</span>` : ''))}
      ${row('勞退新制月領', me.laborOfficial.eligible
        ? `${me.bridge.laborYears > 0 ? `專戶滾存到 ${me.bridge.laborStart} 歲約 ${wan(me.laborPool)}` : `專戶約 ${wan(me.laborPool)}`}，依勞保局算法（利率 ${(LABOR_MONTHLY.rate * 100).toFixed(4)}%、平均餘命 ${me.laborOfficial.years} 年）領到 ${me.laborOfficial.endAge} 歲`
        : `新制年資約 ${me.laborOfficial.newYears.toFixed(0)} 年，未滿 15 年只能一次領約 ${wan(me.laborPool)}，以提領月數換算`, me.laborRetire)}
      ${me.oldUnits > 0 ? row('勞基法舊制', `${me.oldUnits} 基數，一次領約 ${wan(me.oldLump)}`, me.oldMonthly) : ''}
      ${state.benefit.enabled ? row(esc(state.benefit.name || '企業福利信託'), `每月 ${money(state.benefit.self + state.benefit.company)}，年化 ${pct(state.benefit.rate)}`, R.benefitMonthly) : ''}
      <div class="row sum"><div class="k">保底月領小計</div><div class="v">${money(R.floor)}</div></div>
      ${R.holdingsMonthly ? row('現有資產', `現值 ${wan(R.holdingsNow)}，退休時 ${wan(R.holdingsPool)}`, R.holdingsMonthly) : ''}
      ${R.eventsMonthly ? row('人生重大事件', `退休前的一次性收支，使退休時資產池 ${R.eventsPool >= 0 ? '增加' : '減少'} ${wan(Math.abs(R.eventsPool))}`, R.eventsMonthly) : ''}
      ${R.portfolioMonthly ? row('定期投資', `每月投入 ${money(R.monthlyInvest)}，退休時 ${wan(R.portfolioPool)}`, R.portfolioMonthly) : ''}
      ${R.spouse ? row(`${esc(state.spouse.name)}的保底月領`, `勞保 ${money(R.spouse.insMonthly)} + 勞退 ${money(R.spouse.laborRetire)}${R.spouse.oldMonthly ? ` + 舊制 ${money(R.spouse.oldMonthly)}` : ''}`, R.spouse.floor) : ''}
      <div class="row total"><div class="k">退休月領總計<small>約當今日幣值 ${money(R.totalPV)}</small></div><div class="v">${money(R.total)}</div></div>
    </div>
  </section>
  ${claimAgeCard()}

  ${insLumpCard()}

  ${laborChoiceCard()}

  ${selfRateCard()}

  ${me.bridge.years > 0 ? `<section class="card bridge"><div class="card-h"><h3>${badge('hourglass', 'rgba(194,69,61,.1)', C.red)}提早退休的空窗期</h3><span class="tag warn">${s.retireAge}–${s.retireAge + me.bridge.years} 歲</span></div>
    <div class="stats">
      <div class="stat"><small>勞保年金開始</small><strong>${me.bridge.insStart} 歲</strong><small>${me.bridge.insYears ? `空窗 ${me.bridge.insYears} 年，每月少 ${money(me.insMonthly)}` : '退休即可領'}</small></div>
      <div class="stat"><small>勞退開始</small><strong>${me.bridge.laborStart} 歲</strong><small>${me.bridge.laborYears ? `空窗 ${me.bridge.laborYears} 年，每月少 ${money(me.laborRetire)}` : '退休即可領'}</small></div>
      <div class="stat bad"><small>需另外準備</small><strong>${wan(me.bridge.missing)}</strong><small>空窗期少領的總和</small></div>
    </div>
    <p class="note">勞退須年滿 60 歲才能請領（勞工退休金條例第 24 條）；勞保老年年金最早可提前 5 年請領，但每提前 1 年減給 4%。空窗期的生活費只能靠投資、儲蓄或舊制退休金支應；上方「退休月領總計」是兩者都開始給付後的金額。需另外準備的金額未計投資報酬，偏保守。</p>
  </section>` : ''}

  <section class="card"><div class="card-h"><h3>${badge('landmark', 'rgba(63,154,110,.12)', C.green)}計算依據</h3></div>
    <div class="rows" style="font-size:13px">
      <div class="row"><div class="k">勞保老年年金<small>A 式：平均月投保薪資 × 年資 × 0.775% + 3,000；B 式：平均月投保薪資 × 年資 × 1.55%，兩者擇優。法定請領年齡 ${legalPensionAge(s.birthYear)} 歲，每提前 1 年減給 4%、每延後 1 年增給 4%，各以 5 年為限。年資未滿 15 年改請領一次金。</small></div></div>
      <div class="row"><div class="k">勞退新制<small>雇主每月提繳 6%＋個人自提，依薪資年增率逐月累積、以勞退基金收益月複利滾存；退休時的專戶金額依提領方式換算月領。</small></div></div>
      <div class="row"><div class="k">勞基法舊制<small>前 15 年每年 2 個基數，第 16 年起每年 1 個基數，最高 45 個基數；基數以退休前 6 個月平均工資計，此處以推估的退休時月薪近似。</small></div></div>
      <div class="row"><div class="k">簡化假設<small>投保薪資依薪資年增率逐月升級、級距表維持 115 年版、不計勞保年金依 CPI 調整、不計稅負與保費；實際金額以勞保局核定為準。</small></div></div>
    </div>
  </section>`;
}

function pageInvest() {
  const h = state.holdings.map((x) => `
    <div class="item">
      <div class="item-h"><input class="input txt" type="text" data-k="holdings.${state.holdings.indexOf(x)}.name" data-t="str" value="${esc(x.name)}" aria-label="資產名稱" maxlength="30">
        <button type="button" class="btn ghost" data-act="del-holding" data-id="${x.id}" aria-label="刪除 ${esc(x.name)}">刪除</button></div>
      <div class="grid">
        <label class="field"><span>類型</span><select class="input txt" data-k="holdings.${state.holdings.indexOf(x)}.kind" data-t="str" data-rerender>
          <option value="tw" ${x.kind === 'tw' ? 'selected' : ''}>台股（張）</option>
          <option value="us" ${x.kind === 'us' ? 'selected' : ''}>美股（股，美元）</option>
          <option value="cash" ${x.kind === 'cash' ? 'selected' : ''}>現金／其他（金額）</option></select></label>
        ${x.kind === 'cash'
          ? numF(`holdings.${state.holdings.indexOf(x)}.amount`, '金額', { min: 0, step: 10000, unit: '元' })
          : numF(`holdings.${state.holdings.indexOf(x)}.shares`, x.kind === 'tw' ? '持有張數' : '持有股數', { min: 0, step: x.kind === 'tw' ? 1 : 1, unit: x.kind === 'tw' ? '張' : '股' }) +
            numF(`holdings.${state.holdings.indexOf(x)}.price`, x.kind === 'tw' ? '股價（元）' : '股價（美元）', { min: 0, step: 0.01 })}
        ${numF(`holdings.${state.holdings.indexOf(x)}.rate`, '預期年化報酬', { min: -10, max: 30, step: 0.5, unit: '%' })}
      </div>
      <div class="item-foot">${out(`h:${x.id}`, outVal(`h:${x.id}`))}</div>
    </div>`).join('');

  const groups = state.portfolios.map((p, pi) => `
    <div class="card" style="padding:16px">
      <div class="item-h"><input class="input txt" type="text" data-k="portfolios.${pi}.name" data-t="str" value="${esc(p.name)}" aria-label="組合名稱" style="font-weight:800" maxlength="30">
        <button type="button" class="btn ghost" data-act="del-portfolio" data-id="${p.id}">刪除組合</button></div>
      ${p.assets.map((a, ai) => `
        <div class="item">
          <div class="item-h"><input class="input txt" type="text" data-k="portfolios.${pi}.assets.${ai}.name" data-t="str" value="${esc(a.name)}" aria-label="標的名稱" maxlength="30">
            <button type="button" class="btn ghost" data-act="del-asset" data-pid="${p.id}" data-id="${a.id}" aria-label="刪除 ${esc(a.name)}">✕</button></div>
          <div class="grid">
            ${numF(`portfolios.${pi}.assets.${ai}.monthly`, '每月投入', { min: 0, step: 1000, unit: '元' })}
            ${numF(`portfolios.${pi}.assets.${ai}.rate`, '預期年化報酬', { min: -10, max: 30, step: 0.5, unit: '%' })}
          </div>
          <div class="item-foot"><span>退休後月領</span><strong>${out(`pa:${p.id}:${a.id}`, outVal(`pa:${p.id}:${a.id}`))}</strong></div>
        </div>`).join('')}
      <button type="button" class="btn dashed" style="margin-top:10px" data-act="add-asset" data-pid="${p.id}">＋ 新增標的</button>
      <div class="item-foot" style="font-size:13px"><span>本組合月領</span><strong>${out(`pf:${p.id}`, outVal(`pf:${p.id}`))}</strong></div>
    </div>`).join('');

  return `
  <div class="page-head"><span class="step">STEP 03</span><h2 class="page-title">投資資產</h2></div>
  <p class="page-sub">現有資產以單筆複利、定期投資以每月期末投入計算，滾到退休時再依提領方式換算月領。</p>
  <section class="card"><div class="card-h"><h3>${badge('coins', 'rgba(232,184,75,.18)', '#9A7210')}現有資產</h3><span class="hint">${out('holdsum', outVal('holdsum'))}</span></div>
    ${h || '<p class="note" style="margin:0 0 10px">尚未加入資產。</p>'}
    <div class="btn-row" style="margin-top:12px;align-items:flex-end">
      <button type="button" class="btn dashed" style="flex:1" data-act="add-holding">＋ 新增資產</button>
      ${state.holdings.some((x) => x.kind === 'us') ? `<div style="width:160px">${numF('fx', '美元匯率', { min: 1, step: 0.1 })}</div>` : ''}
    </div>
  </section>
  <section><div class="card-h" style="margin:4px 0 12px"><h3 style="font-size:15px;margin:0;display:flex;gap:8px;align-items:center">${badge('trend', 'rgba(58,95,138,.12)', C.navyL)}定期投資</h3><span class="hint">${out('pfsum', outVal('pfsum'))}</span></div>
    <div class="groups">${groups}
      <button type="button" class="btn dashed" style="min-height:120px" data-act="add-portfolio">＋ 新增投資組合</button></div>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('receipt', 'rgba(194,69,61,.1)', C.red)}人生重大事件</h3><span class="hint">${out('events', outVal('events'))}</span></div>
    ${state.events.map((ev, i) => `
    <div class="item">
      <div class="item-h"><input class="input txt" type="text" data-k="events.${i}.name" data-t="str" value="${esc(ev.name)}" aria-label="事件名稱" maxlength="20">
        <button type="button" class="btn ghost" data-act="del-event" data-id="${ev.id}" aria-label="刪除 ${esc(ev.name)}">刪除</button></div>
      <div class="grid">
        <label class="field"><span>類型</span><select class="input txt" data-k="events.${i}.kind" data-t="str">
          <option value="out" ${ev.kind === 'out' ? 'selected' : ''}>一次性支出</option><option value="in" ${ev.kind === 'in' ? 'selected' : ''}>一次性收入</option></select></label>
        ${numF(`events.${i}.age`, '發生年齡', { min: 18, max: 100, unit: '歲' })}
        ${numF(`events.${i}.amount`, '金額（今日幣值）', { unit: '元' })}
      </div>
    </div>`).join('')}
    <div class="chips" style="margin-top:12px">${EVENT_PRESETS.map((p, i) => `<button type="button" class="chip" data-act="add-event" data-val="${i}">＋ ${p.name}</button>`).join('')}</div>
    <p class="note">金額以今天的物價輸入，會依通膨換算到發生那年。退休前的支出會讓資產少一段複利，退休後的收支直接增減資產池；可在「分析圖表」的全生命週期圖看到影響。</p>
  </section>

  <p class="note">預期報酬僅為假設。長期而言，全球股市名目年化報酬常被引用的區間約 5–8%，但任何單一期間都可能大幅偏離；高於 10% 的假設請保守看待。</p>`;
}

function pagePlan() {
  const g = goalPlan(state, NOW);
  const me = R.me, s = state.self;
  const size = window.innerWidth < 640 ? { width: 380, height: 220 } : { width: 680, height: 240 };
  const pctDone = Math.round(g.progress * 100);
  const barColor = g.progress >= 1 ? C.green : g.progress >= 0.7 ? C.gold2 : C.red;
  const ir = state.investReturn;

  // 目標快選：生活費與所得替代率
  const round = (v) => Math.round(v / 1000) * 1000;
  const presets = [
    R.expenseToday > 0 ? ['目前生活費', round(R.expenseToday)] : null,
    R.expenseToday > 0 ? ['生活費 ×1.3（含醫療預備）', round(R.expenseToday * 1.3)] : null,
    ['月薪 60%', round(s.salary * 0.6)],
    ['月薪 70%', round(s.salary * 0.7)],
  ].filter(Boolean);

  // 已達標時：最早幾歲可以退休
  let earliest = null;
  if (g.gapPV <= 0 && g.target > 0) {
    for (let a = s.retireAge - 1; a > me.age && a >= 50; a--) {
      const t = JSON.parse(JSON.stringify(state)); t.self.retireAge = a;
      if (compute(t, NOW).totalPV >= g.target) earliest = a; else break;
    }
  }

  const opt = (o) => `<div class="opt${o.muted ? ' muted' : ''}">
      <div class="opt-h"><span class="opt-n">${o.n}</span><small>${o.k}</small></div>
      <strong>${o.v}</strong><p>${o.p}</p>
      ${o.btn || ''}</div>`;
  const ceil100 = (v) => Math.ceil(v / 100) * 100;
  const options = g.gapPV > 0 ? [
    { n: 1, k: '每月多投資', v: Number.isFinite(g.extraMonthly) ? money(ceil100(g.extraMonthly)) : '—',
      p: `以年化 ${pct(ir)} 投入 ${g.n} 年，退休時補足 ${wan(g.shortfallPool)}。`,
      btn: Number.isFinite(g.extraMonthly) ? `<button type="button" class="btn primary" data-act="apply-extra" data-val="${ceil100(g.extraMonthly)}">加入定期投資</button>` : '' },
    { n: 2, k: '今天一次投入', v: money(Math.ceil(g.lumpSum / 1000) * 1000),
      p: `放著以年化 ${pct(ir)} 滾 ${g.n} 年，也能補足同樣的缺口。`,
      btn: `<button type="button" class="btn" data-act="apply-lump" data-val="${Math.ceil(g.lumpSum / 1000) * 1000}">加入現有資產</button>` },
    g.retireAge
      ? { n: 3, k: '延後退休', v: `${g.retireAge} 歲`, p: `晚 ${g.retireAge - s.retireAge} 年：多累積、勞保延後增給、提領年數變短。`,
          btn: `<button type="button" class="btn" data-set="self.retireAge" data-val="${g.retireAge}">改為 ${g.retireAge} 歲退休</button>` }
      : { n: 3, k: '延後退休', v: '75 歲仍不足', p: '單靠晚退休補不起來，需要搭配其他方式。', muted: true },
    g.requiredReturn !== null
      ? { n: 4, k: '提高投資報酬', v: `+${g.requiredReturn.toFixed(1)} 個百分點`, p: g.requiredReturn > 3 ? '幅度偏大，代表要承擔明顯更高的波動風險，不建議單靠這一招。' : '所有投資的年化報酬同時提高這麼多即可達標；報酬越高、波動通常越大。' }
      : { n: 4, k: '提高投資報酬', v: '—', p: state.holdings.length + state.portfolios.length ? '報酬再高也補不起來。' : '尚未設定投資資產。', muted: true },
    g.selfRate6
      ? { n: 5, k: '勞退自提拉到 6%', v: `+${money(g.selfRate6.gain)}`, p: `每月多提撥 ${money(g.selfRate6.monthlyCost)}，自提不計入當年度薪資所得課稅，估計每年少繳稅 ${money(selfContributionTax(s.salary, 6).saving - selfContributionTax(s.salary, s.selfRate).saving)}；月領（今日幣值）增加${g.selfRate6.enough ? '，單獨就能達標' : '，可補一部分'}。`,
          btn: `<button type="button" class="btn" data-set="self.selfRate" data-val="6">改為自提 6%</button>` }
      : { n: 5, k: '勞退自提', v: '已是 6%', p: '自提已達上限。', muted: true },
    { n: 6, k: '調整目標', v: money(round(g.currentPV)), p: '照目前規劃，每月大約能有這麼多（今日幣值）。',
      btn: `<button type="button" class="btn" data-set="targetMonthly" data-val="${round(g.currentPV)}">改用這個目標</button>` },
  ].map(opt).join('') : '';

  // 資產池路徑：目前規劃 vs 加碼後，對照退休時需要的資產池
  const extra = g.gapPV > 0 && Number.isFinite(g.extraMonthly) ? g.extraMonthly : 0;
  const ptsNow = R.growth.map((p) => ({ x: p.age, y: p.pool }));
  const ptsPlus = R.growth.map((p, t) => ({ x: p.age, y: p.pool + growMonthly(extra, t, ir) }));
  const pathChart = R.n > 0 ? lineChart({
    series: [
      { name: '目前規劃', points: ptsNow, color: C.navy, fill: 'rgba(30,53,84,.07)' },
      ...(extra > 0 ? [{ name: '加碼後', points: ptsPlus, color: C.green, dash: true }] : []),
      ...(g.requiredPool > 0 ? [{ name: '需要的資產池', points: [{ x: me.age, y: g.requiredPool }, { x: s.retireAge, y: g.requiredPool }], color: C.red, dash: true }] : []),
    ],
    ...size, xFmt: (x) => `${x}歲`,
    tip: { title: (x) => `${x} 歲`, fmt: wan },
  }) : '';

  return `
  <div class="page-head"><span class="step">STEP 04</span><h2 class="page-title">目標與行動</h2></div>
  <p class="page-sub">先決定退休後想過的生活，看目前規劃差多少，再把它變成今年就能做的具體行動。</p>

  <section class="card"><div class="card-h"><h3>${badge('target', 'rgba(194,69,61,.1)', C.red)}我的目標</h3></div>
    <div class="grid two">
      ${numF('targetMonthly', '希望退休後每月可用（今日幣值）', { unit: '元' })}
      ${numF('investReturn', '新增投資的預期年化報酬', { min: 0, max: 15, step: 0.5, unit: '%' })}
    </div>
    <div class="chips">${presets.map(([l, v]) => `<button type="button" class="chip" data-set="targetMonthly" data-val="${v}" aria-pressed="${state.targetMonthly === v}">${l} ${money(v)}</button>`).join('')}</div>
    <div class="goal">
      <div class="goal-h"><span>目前規劃達成率</span><strong style="color:${barColor}">${pctDone}%</strong></div>
      <div class="goal-bar" role="progressbar" aria-valuenow="${pctDone}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, pctDone)}%;background:${barColor}"></i></div>
      <div class="goal-f"><span>目前規劃 ${money(g.currentPV)}／月</span><span>目標 ${money(g.target)}／月</span></div>
      <p class="note">以上皆為今日幣值。目標換算到 ${NOW + g.n} 年退休當年約為 ${money(R.reverse.targetNominal)}／月（通膨 ${pct(state.cpi)}）。</p>
    </div>
  </section>

  ${actionsCard()}

  ${trackingCard()}

  ${g.gapPV > 0 ? `
  <section><div class="sub-h"><h3>${badge('sliders', 'rgba(232,184,75,.18)', '#9A7210')}還差 ${money(g.gapPV)}／月，可以這樣補</h3><span class="hint">任選一種或組合使用</span></div>
    <div class="opts">${options}</div>
  </section>` : `
  <section class="card"><div class="alert good" style="margin:0"><b>目前規劃已能達成目標，每月約多出 ${money(g.currentPV - g.target)}（今日幣值）。</b>
    <p>${earliest ? `照目前規劃，最早 <b>${earliest} 歲</b>退休仍能達標。` : '目前設定的退休年齡已是最早能達標的年齡。'}多出來的預算也可以留作緊急預備金或醫療準備。</p>
    ${earliest ? `<div class="btn-row" style="margin-top:10px"><button type="button" class="btn" data-set="self.retireAge" data-val="${earliest}">改為 ${earliest} 歲退休</button></div>` : ''}</div>
  </section>`}

  ${pathChart ? `<section class="card"><div class="card-h"><h3>${badge('trend', 'rgba(58,95,138,.12)', C.navyL)}資產池路徑</h3><span class="hint">名目金額</span></div>
    ${pathChart}
    <div class="chart-legend"><span><i style="background:${C.navy}"></i>目前規劃 ${wan(g.havePool)}</span>${extra > 0 ? `<span><i style="background:${C.green}"></i>每月加碼 ${money(ceil100(extra))} 後</span>` : ''}${g.requiredPool > 0 ? `<span><i style="background:${C.red}"></i>退休時需要 ${wan(g.requiredPool)}</span>` : ''}</div>
  </section>` : ''}

  <section class="card"><div class="card-h"><h3>${badge('hourglass', 'rgba(232,184,75,.18)', '#9A7210')}財務自由年齡</h3><strong class="num" style="font-size:22px;color:var(--navy)">${out('fire', outVal('fire'))}</strong></div>
    <p class="note" style="margin:0">投資資產（不含勞保、勞退）已足以支應通膨後的生活費 ${money(R.expenseToday)}／月（今日幣值），一路用到預期壽命 ${me.lifeAge.toFixed(0)} 歲；以退休後年化 ${pct(state.postReturn)} 扣除通膨計算。到這個年齡，工作就成了選項而不是必要。</p>
  </section>`;
}

function pageAnalysis() {
  const me = R.me, s = state.self;
  const size = window.innerWidth < 640 ? { width: 380, height: 230 } : { width: 680, height: 260 };
  const scen = [[-2, '悲觀', C.red], [0, '基準', C.navy], [2, '樂觀', C.green]].map(([d, l, c]) => ({ d, l, c, lc: lifecycle(state, NOW, d) }));
  const base = scen[1].lc;
  const sens = sensitivity(state, NOW);
  const ages = retireAgeOptions(state, NOW);
  const hasInvest = R.investPool > 0;
  const mc = monteCarlo(state, NOW, { sims: 1000 });

  // 月領來源
  const parts = [
    { label: '勞保年金', value: me.insMonthly, color: C.greenL },
    { label: '勞退新制', value: me.laborRetire, color: C.navy },
    { label: '勞基法舊制', value: me.oldMonthly, color: '#8FB9A3' },
    { label: esc(state.benefit.name || '企業信託'), value: R.benefitMonthly, color: C.purple },
    { label: '現有資產', value: R.holdingsMonthly, color: C.gold },
    { label: '定期投資', value: R.portfolioMonthly, color: C.navyL },
    { label: esc(state.spouse.name), value: R.spouseTotal, color: '#C79BB8' },
  ].filter((d) => d.value > 0);
  const top = [...parts].sort((a, b) => b.value - a.value)[0];

  // 重點摘要
  const cov = R.coverage;
  const lever = sens.find((r) => r.key !== 'cpi'); // 通膨是外部風險、不是能調的槓桿
  const leverHigh = Math.abs(lever.high) >= Math.abs(lever.low);
  const leverVal = leverHigh ? lever.high : lever.low;
  const leverWhat = `${lever.label}${leverHigh ? lever.highLabel : lever.lowLabel}`;
  const run = base.runoutAge;
  const insights = [
    mc ? { cls: mc.success >= 0.85 ? 'good' : mc.success >= 0.7 ? 'gold' : 'bad', k: '計畫成功率', v: `${Math.round(mc.success * 100)}%`,
      p: `市場有好有壞，模擬 1,000 種情況中，有 ${Math.round(mc.success * 1000)} 種到 ${mc.lifeEnd} 歲錢都還夠用。` } : null,
    R.expenseToday > 0
      ? { cls: cov >= 1 ? 'good' : 'bad', k: '生活費覆蓋率', v: `${Math.round(cov * 100)}%`,
          p: cov >= 1 ? `退休當年月領 ${money(R.total)}，比通膨後生活費多 ${money(R.total - R.expenseAtRetire)}。` : `每月還差 ${money(R.expenseAtRetire - R.total)}，到「目標與行動」看要怎麼補。` }
      : { cls: '', k: '生活費覆蓋率', v: '—', p: '在「起點設定」填入退休後生活費，才能判斷夠不夠用。' },
    hasInvest
      ? { cls: run && run < me.lifeAge ? 'bad' : 'good', k: '投資資產可撐到', v: run ? `${run} 歲` : '100 歲以上',
          p: run && run < me.lifeAge ? `比預期壽命 ${me.lifeAge.toFixed(0)} 歲早用完，晚年只剩勞保勞退。` : `涵蓋預期壽命 ${me.lifeAge.toFixed(0)} 歲。` }
      : { cls: '', k: '投資資產可撐到', v: '—', p: '尚未設定投資資產，退休收入全靠保底給付。' },
    { cls: 'gold', k: '最有感的調整', v: `${leverVal >= 0 ? '+' : '−'}${money(Math.abs(leverVal))}`,
      p: `${leverWhat}，是你能控制的條件中，對月領（今日幣值）影響最大的一項。` },
    R.care ? { cls: R.care.gap > 0 ? 'bad' : 'good', k: `照護期（${R.care.startAge} 歲起）`, v: R.care.gap > 0 ? `缺 ${money(R.care.gap)}` : '足以支應',
      p: R.care.gap > 0 ? `每月需 ${money(R.care.need)}（名目），月領不足的部分由投資資產支出。` : `每月需 ${money(R.care.need)}，月領可以支應。` } : null,
    state.insHaircut ? { cls: 'bad', k: '勞保壓力測試', v: `打 ${discount(state.insHaircut)} 折`, p: `目前結果已假設勞保給付減少 ${state.insHaircut}%，每月少領 ${money(me.insFull - me.insMonthly)}。` } : null,
    me.bridge.years > 0 ? { cls: 'bad', k: '提早退休空窗期', v: `${me.bridge.years} 年`, p: `${s.retireAge} 歲退休到勞保勞退開始給付前，需另外準備約 ${wan(me.bridge.missing)}。` } : null,
    top ? { cls: '', k: '最大收入來源', v: `${Math.round((top.value / R.total) * 100)}%`,
      p: `${top.label}每月 ${money(top.value)}，${top.value / R.total > 0.6 ? '來源過度集中，風險較高。' : '來源相對分散。'}` } : null,
  ].filter(Boolean);

  // 全生命週期資產池
  const lifeChart = lineChart({
    series: scen.map((x) => ({
      name: `${x.l}（${x.d > 0 ? '+' : ''}${x.d}%）`, points: x.lc.points.map((p) => ({ x: p.age, y: p.pool })),
      color: x.c, dash: x.d !== 0, fill: x.d === 0 ? 'rgba(30,53,84,.07)' : undefined,
    })),
    xFmt: (x) => `${x}歲`, ...size,
    marks: [{ x: s.retireAge, label: '退休', color: C.gold2 }, ...(R.care ? [{ x: R.care.startAge, label: '照護', color: C.red }] : []), ...state.events.filter((e) => e.age >= me.age && e.age <= 100).slice(0, 3).map((e) => ({ x: e.age, label: esc(e.name), color: e.kind === 'in' ? C.green : C.red })), ...(me.lifeAge < 100 ? [{ x: Math.round(me.lifeAge), label: '預期壽命', color: C.muted }] : [])],
    tip: { title: (x) => `${x} 歲（${NOW + x - me.age} 年）`, fmt: wan },
  });

  // 敏感度（龍捲風圖）
  const maxAbs = Math.max(1, ...sens.flatMap((r) => [Math.abs(r.low), Math.abs(r.high)]));
  const signed = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
  const tornado = sens.map((r) => {
    const negIsLow = r.low <= r.high;
    const neg = Math.min(r.low, r.high, 0), pos = Math.max(r.low, r.high, 0);
    const negLabel = negIsLow ? r.lowLabel : r.highLabel, posLabel = negIsLow ? r.highLabel : r.lowLabel;
    return `<div class="t-l">${r.label}</div>
      <div><div class="t-bar" role="img" aria-label="${r.label}：${negLabel} ${signed(neg)}，${posLabel} ${signed(pos)}">
        <div class="t-neg" style="width:${(Math.abs(neg) / maxAbs) * 50}%"></div><div class="t-pos" style="width:${(pos / maxAbs) * 50}%"></div></div>
      <div class="t-cap"><span>${negLabel} <b style="color:var(--red)">${signed(neg)}</b></span><span>${posLabel} <b style="color:var(--green)">${signed(pos)}</b></span></div></div>`;
  }).join('');

  // 通膨購買力
  const yrs = Math.max(1, Math.round(me.lifeAge - s.retireAge));
  const cpi = state.cpi / 100;
  // 勞保年金依第 65 條之 4，物價累計漲 5% 才調整一次；其他收入假設固定
  const nominalAt = (age) => R.total + me.insMonthly * (insCpiFactor(state.cpi, age - me.bridge.insStart) - 1);
  const real = Array.from({ length: yrs + 1 }, (_, k) => ({ x: s.retireAge + k, y: nominalAt(s.retireAge + k) / Math.pow(1 + cpi, k) }));
  const realFlat = Array.from({ length: yrs + 1 }, (_, k) => ({ x: s.retireAge + k, y: R.total / Math.pow(1 + cpi, k) }));
  const halfIdx = real.findIndex((p) => p.y <= R.total / 2);
  const realChart = lineChart({
    series: [
      { name: '實質購買力', points: real, color: '#C0622A', fill: 'rgba(192,98,42,.08)' },
      { name: '若勞保也不調整', points: realFlat, color: C.muted, dash: true },
    ],
    ...size, xFmt: (x) => `${x}歲`, yFmt: (v) => `${Math.round(v / 1000)}k`,
    marks: halfIdx > 0 ? [{ x: real[halfIdx].x, label: '購買力減半', color: C.red }] : [],
    tip: { title: (x) => `${x} 歲`, fmt: money },
  });

  // 健康期 vs 全壽命
  const healthY = Math.max(0, me.healthAge - s.retireAge), lifeY = Math.max(0, me.lifeAge - s.retireAge);
  const totH = R.total * 12 * healthY, totL = R.total * 12 * lifeY;

  return `
  <div class="page-head"><span class="step">STEP 05</span><h2 class="page-title">分析圖表</h2></div>
  <p class="page-sub">把數字翻成結論：夠不夠、撐多久、調整哪裡最有效。圖表可用滑鼠或手指查看每一歲的數值。</p>

  <section class="insights" aria-label="重點摘要">
    ${insights.map((i) => `<div class="insight ${i.cls}"><small>${i.k}</small><strong>${i.v}</strong><p>${i.p}</p></div>`).join('')}
  </section>

  ${mc ? mcCard(mc, size) : ''}

  ${mc ? strategyCard() : ''}

  ${scenarioCard()}

  <section class="card"><div class="card-h"><h3>${badge('trend', 'rgba(58,95,138,.12)', C.navyL)}全生命週期：投資資產池</h3><span class="hint">名目金額</span></div>
    ${hasInvest ? `${lifeChart}
    <div class="chart-legend">${scen.map((x) => `<span><i style="background:${x.c}"></i>${x.l}（報酬 ${x.d > 0 ? '+' : ''}${x.d}%）</span>`).join('')}</div>
    <div class="stats" style="margin-top:14px">${scen.map((x) => `<div class="stat"><small style="color:${x.c};font-weight:700">${x.l}月領</small><strong>${money(x.lc.total)}</strong><small>退休時 ${wan(x.lc.pool)} · ${x.lc.runoutAge ? `${x.lc.runoutAge} 歲用完` : '撐過 100 歲'}</small></div>`).join('')}</div>
    <p class="note">退休前每月投入、複利累積；退休後每年提領投資月領 × 12${R.care ? `，${R.care.startAge} 歲起另扣照護費` : ''}，剩餘資產以年化 ${pct(state.postReturn)} 滾存。三情境把所有投資的報酬率同時調低或調高 2 個百分點。</p>`
    : '<p class="note" style="margin:0">尚未設定投資資產。到「投資資產」加入現有資產或定期投資後，這裡會畫出從現在到 100 歲的資產走勢。</p>'}
  </section>

  <section class="card"><div class="card-h"><h3>${badge('sliders', 'rgba(232,184,75,.18)', '#9A7210')}敏感度：什麼最影響你的月領</h3><span class="hint">今日幣值，與目前 ${money(R.totalPV)} 比較</span></div>
    <div class="tornado">${tornado}</div>
    <p class="note">一次只改一個條件，其他維持目前設定。排在越上面的影響越大：可控制的項目值得優先調整；通膨屬於外部風險，只能靠提高安全邊際因應。</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('hourglass', 'rgba(45,74,110,.1)', C.navy)}幾歲退休比較</h3></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>退休年齡</th><th>月領（名目）</th><th>今日幣值</th><th>勞保年金</th><th>生活費覆蓋率</th><th></th></tr></thead>
      <tbody>${ages.map((a) => `<tr class="${a.current ? 'cur' : ''}"><td>${a.retireAge} 歲</td><td>${money(a.total)}</td><td>${money(a.totalPV)}</td><td>${money(a.ins)}</td>
        <td class="${a.coverage >= 1 ? 'good' : 'bad'}">${R.expenseToday > 0 ? `${Math.round(a.coverage * 100)}%` : '—'}</td>
        <td>${a.current ? '' : `<button type="button" class="btn ghost" style="color:var(--navy2)" data-set="self.retireAge" data-val="${a.retireAge}">改用</button>`}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="note">晚退休有三重效果：多累積幾年、勞保年金延後增給（每年 4%，最多 20%）、提領年數變短。</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('chart', 'rgba(232,184,75,.18)', '#9A7210')}月領來源</h3><span class="hint">合計 ${money(R.total)}</span></div>
    <div class="donut-wrap">${donut(parts)}
      <div class="lg">${parts.map((d) => `<div class="bar-row"><div class="lbl"><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${d.color};margin-right:6px"></i>${d.label}</span><b>${money(d.value)} <small style="color:var(--muted);font-weight:500">${Math.round((d.value / R.total) * 100)}%</small></b></div>
        <div class="meter" style="margin:0"><i style="width:${(d.value / Math.max(...parts.map((p) => p.value))) * 100}%;background:${d.color}"></i></div></div>`).join('')}</div></div>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('receipt', 'rgba(192,98,42,.12)', '#C0622A')}通膨侵蝕：月領的實質購買力</h3></div>
    <div class="stats">
      <div class="stat"><small>退休當年</small><strong>${money(R.total)}</strong></div>
      <div class="stat"><small>${halfIdx > 0 ? `${real[halfIdx].x} 歲減半` : '購買力減半'}</small><strong>${money(R.total / 2)}</strong></div>
      <div class="stat bad"><small>${Math.round(me.lifeAge)} 歲時</small><strong>${money(real[real.length - 1].y)}</strong></div>
    </div>
    ${realChart}
    <p class="note">通膨 ${pct(state.cpi)}。勞保年金在物價累計上漲達 5% 時依漲幅調整（勞工保險條例第 65 條之 4），所以曲線呈階梯狀；勞退、投資等其他收入假設金額固定。虛線是勞保也不調整時的情況。</p>
  </section>

  <section class="card"><div class="card-h"><h3>${badge('user', 'rgba(63,143,106,.12)', C.green)}健康期與全壽命總領</h3></div>
    ${[[`健康期（${s.retireAge}–${me.healthAge.toFixed(0)} 歲）`, totH, healthY], [`全壽命（${s.retireAge}–${me.lifeAge.toFixed(0)} 歲）`, totL, lifeY]].map(([l, v, y]) => `
      <div class="bar-row"><div class="lbl"><span>${l}</span><b>${wan(v)}</b></div>
      <div class="meter"><i style="width:${totL ? (v / totL) * 100 : 0}%;background:${C.green}"></i></div>
      <p class="note" style="margin:-6px 0 0">${y.toFixed(1)} 年 × ${money(R.total)} × 12 個月</p></div>`).join('')}
    <p class="note">能自由活動的健康期比全部餘命短得多；旅遊等開銷宜集中規劃在前段。</p>
  </section>

  <section class="card">
    <details class="yearly"><summary>逐年明細表</summary>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>年齡</th><th>西元</th><th>階段</th><th>當年投入／提領</th><th>年底資產池</th><th>生活費（月）</th></tr></thead>
        <tbody>${yearlyRows(base).map((r) => `<tr><td>${r.age}</td><td>${r.year}</td><td>${r.phase}</td><td class="${r.flow < 0 ? 'bad' : ''}">${r.flow < 0 ? '−' : ''}${money(Math.abs(r.flow))}</td><td>${money(r.pool)}</td><td>${money(r.expense)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="btn-row" style="margin-top:12px"><button type="button" class="btn" data-act="csv">下載 CSV</button></div>
    </details>
  </section>`;
}

function insLumpCard() {
  const c = insuranceLumpVsAnnuity(state, NOW);
  if (!c.eligible) return '';
  const better = c.breakEvenAge !== null && c.lifeAge > c.breakEvenAge ? 'annuity' : 'lump';
  return `<section class="card"><div class="card-h"><h3>${badge('landmark', 'rgba(232,184,75,.18)', '#9A7210')}勞保：年金還是一次請領？</h3><span class="hint">${c.firstInsuredYear} 年起投保，可二選一</span></div>
    <p class="note" style="margin-top:0">98 年 1 月 1 日前已有勞保年資的人，可選擇一次請領老年給付（勞工保險條例第 58 條），核付後不能變更。</p>
    <div class="vs">
      <div><small>老年年金</small><strong>${money(c.annuity)}／月</strong><span>${c.claimAge} 歲起按月領，物價累計漲 5% 會調整</span></div>
      <div><small>一次請領</small><strong>${wan(c.lump)}</strong><span>${c.months} 個月 × 退保前 3 年平均投保薪資 ${money(c.base3)}</span></div>
    </div>
    <ul class="pts">
      <li>年金要領到 <b>${c.breakEvenAge.toFixed(1)} 歲</b>，累計才追上一次請領${c.breakEvenDiscounted ? `；若把一次領的錢以年化 ${pct(state.postReturn)} 投資，則要領到 <b>${c.breakEvenDiscounted.toFixed(1)} 歲</b>` : ''}。</li>
      <li>你的預期壽命約 ${c.lifeAge.toFixed(1)} 歲，${better === 'annuity' ? '<b>依平均壽命，年金累計較多</b>；而且活得越久、年金越划算，等於買了長壽保險。' : '<b>依平均壽命，一次請領較多</b>；但若活得比平均久，年金會反超。'}</li>
      <li>一次請領適合：健康狀況不佳、有明確大額資金用途、或擔心未來給付被調降的人。年金適合：擔心活太久錢不夠、不想自己管理一大筆錢的人。</li>
    </ul>
    <p class="note">一次請領計算：年資 ${c.counted} 年，每滿 1 年給 1 個月、超過 15 年部分每年 2 個月，上限 45 個月；60 歲後年資最多計 5 年、合併上限 50 個月（第 59 條）。平均投保薪資：年金取最高 60 個月、一次請領取退保前 3 年（第 19 條）。</p>
  </section>`;
}

function claimAgeCard() {
  const o = insuranceClaimOptions(state, NOW);
  if (!o || o.opts.length < 2) return '';
  const cur = R.me.ins.startAge;
  const best = o.opts.find((x) => x.age === o.best);
  const curOpt = o.opts.find((x) => x.age === cur);
  return `<section class="card"><div class="card-h"><h3>${badge('landmark', 'rgba(63,143,106,.12)', C.green)}勞保幾歲開始領最划算？</h3><span class="hint">法定請領年齡 ${o.legal} 歲</span></div>
    <p class="note" style="margin-top:0">提前請領每年減給 4%、延後每年增給 4%，各以 5 年為限（勞工保險條例第 58 條）。晚領每月較多，但少領幾年；要活過「回本歲數」，晚領才划算。</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>請領年齡</th><th>每月</th><th>累計到 ${o.lifeAge.toFixed(0)} 歲</th><th>與 ${o.legal} 歲比的回本歲數</th><th></th></tr></thead>
      <tbody>${o.opts.map((x) => `<tr class="${x.age === cur ? 'cur' : ''}"><td>${x.age} 歲${x.age === o.legal ? '（法定）' : ''}</td><td>${money(x.monthly)}</td>
        <td class="${x.age === o.best ? 'good' : ''}">${wan(x.cumToLife)}${x.age === o.best ? ' ★' : ''}</td>
        <td>${x.breakEven === null ? '—' : x.age > o.legal ? `活過 ${x.breakEven.toFixed(1)} 歲才划算` : `${x.breakEven.toFixed(1)} 歲前較划算`}</td>
        <td>${x.age === cur ? '' : `<button type="button" class="btn ghost" style="color:var(--navy2)" data-set="self.insClaimAge" data-val="${x.age}">改用</button>`}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="note">依你的預期壽命 ${o.lifeAge.toFixed(1)} 歲，累計領最多的是 <b>${o.best} 歲</b>開始領（約 ${wan(best.cumToLife)}）${curOpt && o.best !== cur ? `，比目前設定的 ${cur} 歲多 ${wan(best.cumToLife - curOpt.cumToLife)}` : ''}。這是未折現的名目累計；若重視「早拿到的錢可以先用或投資」、健康狀況不確定，或需要錢支應空窗期，早一點領也合理。延後請領期間沒有勞保收入，會列入空窗期。</p>
  </section>`;
}

function selfRateCard() {
  if (state.self.salary <= 0) return '';
  const a = selfContributionAnalysis(state, NOW);
  const cur = state.self.selfRate;
  const mRate = Math.round(a.marginal * 100);
  const lead = a.marginal === 0
    ? `以目前月薪估算你不用繳綜所稅，自提<b>沒有節稅效果</b>，兩條路投入的錢一樣多，差別只在報酬、保障與流動性。`
    : `你的邊際稅率約 <b>${mRate}%</b>：每提撥 100 元，當年少繳約 ${mRate} 元稅，等於一開始就多了 ${mRate}% 的本金。`;
  const verdict = a.breakEven === null ? '' : a.investReturn >= a.breakEven
    ? `自己投資只要年化超過 <b>${a.breakEven.toFixed(2)}%</b> 就能打平自提；依你設定的 ${pct(a.investReturn)}，自己投資的終值較高，但前提是每年平均真的拿到這個報酬、也不會中途動用——而自提還有保證收益墊底。`
    : `自己投資要年化超過 <b>${a.breakEven.toFixed(2)}%</b> 才能打平自提；你設定的 ${pct(a.investReturn)} 不到這個門檻，自提較有利。`;
  return `<section class="card"><div class="card-h"><h3>${badge('piggy', 'rgba(232,184,75,.18)', '#9A7210')}勞退自提：值不值得？</h3><span class="hint">${cur > 0 ? `目前自提 ${pct(cur)}` : '以自提 6% 試算'}</span></div>
    <p class="note" style="margin-top:0">${lead}</p>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><small>每月提撥</small><strong>${money(a.monthly)}</strong><small>不計入薪資所得課稅</small></div>
      <div class="stat good"><small>每年少繳稅</small><strong>${money(a.annualSaving)}</strong><small>依 115 年度級距估算</small></div>
      <div class="stat"><small>鎖定到 ${a.startAge} 歲</small><strong>${a.lockedYears} 年</strong><small>期間不能動用</small></div>
    </div>
    <div class="vs">
      <div><small>自提進勞退（收益 ${pct(a.laborReturn)}）</small><strong>${wan(a.viaPension)}</strong><span>最差情況（只有保證收益 ${a.minGuarantee.rate}%）：${wan(a.viaPensionFloor)}</span></div>
      <div><small>領回來自己投資（稅後、報酬 ${pct(a.investReturn)}）</small><strong>${wan(a.selfInvest)}</strong><span>沒有保證，報酬可能更高也可能虧損</span></div>
    </div>
    ${verdict ? `<p class="note"><b>打平點：</b>${verdict}${a.marginal ? `在兩邊報酬相同的前提下，自提因為節稅，終值固定多 ${Math.round((1 / (1 - a.marginal) - 1) * 1000) / 10}%。` : ''}</p>` : ''}
    <div class="proscons">
      <div class="pros"><h4>優點</h4><ul>
        <li><b>節稅</b>：自提不計入當年度薪資所得課稅（勞工退休金條例第 14 條）${a.marginal ? `，你每年約少繳 ${money(a.annualSaving)}` : '；但你目前不用繳稅，這點對你沒有作用'}。</li>
        <li><b>保本＋最低保證</b>：領取時收益不低於二年期定存利率計算的收益，不足由國庫補足（第 23 條）；${a.minGuarantee.year} 年度保證收益率 ${a.minGuarantee.rate}%。</li>
        <li><b>專業代操、免手續費</b>：由勞動基金運用局統一運用；近兩年收益率 ${LABOR_FUND.recent.map((x) => `${x.year} 年 ${x.rate}%`).join('、')}。</li>
        <li><b>強迫儲蓄</b>：從薪水直接扣，不會被花掉；隨時可以調整或停止自提。</li>
      </ul></div>
      <div class="cons"><h4>缺點與風險</h4><ul>
        <li><b>流動性差</b>：要到 ${a.startAge} 歲才能領（第 24 條），這 ${a.lockedYears} 年間急用、買房都動不到。先有緊急預備金再自提。</li>
        <li><b>報酬不能自己選</b>：長期平均收益率 ${LABOR_FUND.longAvg.rate}%（${LABOR_FUND.longAvg.from}–${LABOR_FUND.longAvg.to} 年），也曾出現虧損年度；年輕、投資紀律好的人，自己長期投資的期望報酬可能較高。</li>
        <li><b>月領只到平均餘命</b>：選月領的話領到官方平均餘命為止（見上方月領 vs 一次領）。</li>
        <li><b>政策可能調整</b>：收益分配、請領規定可能隨法規修正而改變。</li>
      </ul></div>
    </div>
    <p class="note"><b>大致來說：</b>邊際稅率越高、離 60 歲越近、已有緊急預備金、不想自己管理投資的人，自提越划算；收入低（不用繳稅）、近期有買房等大額資金需求、或確定能長期維持較高投資報酬的人，可以少提或不提。這是依你的數字整理的試算比較，不是投資建議。</p>
    ${cur < 6 ? `<div class="btn-row"><button type="button" class="btn" data-set="self.selfRate" data-val="6">把自提改成 6% 看看月領變化</button></div>` : ''}
  </section>`;
}

function laborChoiceCard() {
  const c = laborLumpVsMonthly(state, NOW);
  if (c.pool <= 0) return '';
  const head = `<div class="card-h"><h3>${badge('piggy', 'rgba(63,143,106,.12)', C.green)}勞退：月領還是一次領？</h3><span class="hint">${c.startAge} 歲起可請領</span></div>`;
  const src = `<p class="note">計算依據：勞保局「月退休金計算基礎」，自 113 年 4 月 1 日起適用——利率 ${c.officialRate.toFixed(4)}%（勞動基金運用局 110–112 年平均保證收益率）、內政部 111 年全國簡易生命表平均餘命；公式與官方因子表逐一核對一致。請領方式經核付後不得變更（勞工退休金條例第 24 條）。領月退期間，專戶剩餘金額每年仍參與收益分配，實際可能略多。<a href="https://www.bli.gov.tw/0018437.html" target="_blank" rel="noopener">勞保局說明</a></p>`;
  if (!c.eligible) {
    return `<section class="card">${head}<div class="alert bad"><b>新制年資約 ${c.newYears.toFixed(0)} 年，未滿 15 年，只能一次領約 ${money(c.pool)}</b>
      <p>勞工退休金條例第 24 條：年滿 60 歲、工作年資滿 15 年才可選擇月領。</p></div>${src}</section>`;
  }
  const self = c.selfInvest;
  return `<section class="card">${head}
    <div class="stats">
      <div class="stat"><small>月領（勞保局算法）</small><strong>${money(c.monthly)}</strong><small>每月，領 ${c.years} 年到 ${c.endAge} 歲</small></div>
      <div class="stat"><small>一次領</small><strong>${wan(c.pool)}</strong><small>${c.startAge} 歲一次拿到</small></div>
      <div class="stat ${c.outlive > 0 ? 'bad' : 'good'}"><small>你的預期壽命</small><strong>${c.lifeAge.toFixed(1)} 歲</strong><small>${c.outlive > 0 ? `比月領結束晚 ${c.outlive.toFixed(1)} 年` : `月領可涵蓋`}</small></div>
    </div>
    <ul class="pts">
      ${c.outlive > 0
        ? `<li><b>月領會在 ${c.endAge} 歲領完</b>，依生命表你可能再活約 ${c.outlive.toFixed(1)} 年，這段期間沒有勞退收入（延壽年金尚未開辦）。勞保局用的是不分性別的平均餘命，女性通常會比月領期間活得久。</li>`
        : `<li><b>月領期間（到 ${c.endAge} 歲）已涵蓋你的預期壽命</b>：勞保局用不分性別的平均餘命，對預期壽命較短的人相對有利。</li>`}
      <li>若一次領出、自己以年化 ${pct(self.rate)} 管理，每月同樣領 ${money(c.monthly)}，大約可以領到 <b>${self.lastsUntil >= 100 ? '100 歲以上' : `${self.lastsUntil.toFixed(1)} 歲`}</b>。</li>
      ${c.needRate !== null ? `<li>要用一次領的錢，每月領 ${money(c.monthly)} 一直領到預期壽命 ${c.lifeAge.toFixed(0)} 歲，自己投資需要年化約 <b>${c.needRate.toFixed(2)}%</b>${c.needRate > c.officialRate ? `，高於月退採用的 ${c.officialRate.toFixed(4)}%，代表要承擔投資風險` : `，低於月退採用的 ${c.officialRate.toFixed(4)}%`}。</li>` : ''}
      <li>月領由勞保局代管、沒有投資風險；一次領彈性大、可傳承，但要自己承擔市場波動與花太快的風險。</li>
    </ul>
    ${src}
  </section>`;
}

function trackingCard() {
  const tr = state.tracking || { baseline: null, checkins: [] };
  if (!tr.baseline) {
    return `<section class="card"><div class="card-h"><h3>${badge('history', 'rgba(45,74,110,.1)', C.navy)}年度進度追蹤</h3></div>
      <p class="note" style="margin:0 0 12px">把目前的規劃存成「基準計畫」，之後每年回來記錄實際的投資資產與勞退餘額，就能看出自己是超前還是落後。</p>
      <button type="button" class="btn primary" data-act="track-baseline">以目前規劃建立基準</button>
    </section>`;
  }
  const rows = trackProgress(tr);
  const last = rows[rows.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  const yr = (d) => (new Date(d) - new Date(tr.baseline.createdAt)) / (365.25 * 864e5);
  const baseYear = new Date(tr.baseline.createdAt).getFullYear();
  // 只畫到最新記錄後 3 年（至少 5 年），讓近期的記錄點看得清楚
  const span = Math.min(tr.baseline.path.length - 1, Math.max(5, Math.ceil(rows.length ? yr(rows[rows.length - 1].date) : 0) + 3));
  const chart = lineChart({
    series: [
      { name: '基準計畫', points: tr.baseline.path.slice(0, span + 1).map((p, i) => ({ x: baseYear + i, y: p.invest + p.labor })), color: C.navy, dash: true },
      ...(rows.length ? [{ name: '實際', points: rows.map((r) => ({ x: +(baseYear + yr(r.date)).toFixed(2), y: r.actual })), color: C.gold2, dotsOnly: true }] : []),
    ],
    width: window.innerWidth < 640 ? 380 : 680, height: 220, xFmt: (x) => `${Math.round(x)}`,
  });
  return `<section class="card"><div class="card-h"><h3>${badge('history', 'rgba(45,74,110,.1)', C.navy)}年度進度追蹤</h3><span class="hint">基準建立於 ${tr.baseline.createdAt}</span></div>
    ${last ? `<div class="alert ${last.diff >= 0 ? 'good' : 'bad'}" style="margin-bottom:14px"><b>${last.date}：${last.diff >= 0 ? '超前' : '落後'}基準 ${money(Math.abs(last.diff))}（${Math.round((last.ratio ?? 0) * 100)}%）</b>
      <p>${last.diff >= 0 ? '進度不錯，維持目前節奏即可。' : '可以檢查是否少投入、報酬低於預期，或回到行動清單看看有哪些可補強。'}</p></div>` : ''}
    <div class="track-form">
      <label class="field"><span>記錄日期</span><input class="input" type="date" id="tk-date" value="${today}"></label>
      <label class="field"><span>投資資產實際市值</span><span class="input-wrap"><input class="input num" type="text" inputmode="numeric" id="tk-invest" value="${Math.round(R.holdingsNow).toLocaleString()}"><span class="unit">元</span></span></label>
      <label class="field"><span>勞退專戶餘額</span><span class="input-wrap"><input class="input num" type="text" inputmode="numeric" id="tk-labor" value="${state.self.laborBalance !== null ? Math.round(state.self.laborBalance).toLocaleString() : ''}" placeholder="勞保局 e 化服務可查"><span class="unit">元</span></span></label>
      <button type="button" class="btn primary" data-act="track-add">記錄</button>
    </div>
    ${chart}
    <div class="chart-legend"><span><i style="background:${C.navy}"></i>基準計畫（投資資產＋勞退）</span><span><i style="background:${C.gold2};height:8px;width:8px;border-radius:50%"></i>實際記錄</span></div>
    ${rows.length ? `<div class="tbl-wrap" style="margin-top:12px"><table class="tbl">
      <thead><tr><th>日期</th><th>實際</th><th>基準</th><th>差距</th><th></th></tr></thead>
      <tbody>${rows.slice().reverse().map((r) => `<tr><td>${r.date}</td><td>${money(r.actual)}</td><td>${money(r.expected)}</td>
        <td class="${r.diff >= 0 ? 'good' : 'bad'}">${r.diff >= 0 ? '+' : '−'}${money(Math.abs(r.diff))}</td>
        <td><button type="button" class="btn ghost" data-act="track-del" data-id="${r.id}">刪除</button></td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    <div class="btn-row" style="margin-top:12px"><button type="button" class="btn ghost" data-act="track-reset">以目前設定重設基準</button></div>
  </section>`;
}

function actionsCard() {
  const items = actionPlan(state, NOW, monteCarlo(state, NOW, { sims: 1000 }));
  const done = state.actionsDone || {};
  const sorted = [...items.filter((a) => !done[a.id]), ...items.filter((a) => done[a.id])];
  const n = items.filter((a) => done[a.id]).length;
  const levelTag = { high: '<span class="tag warn">優先</span>', mid: '<span class="tag">建議</span>', low: '' };
  const applyBtn = (a) => !a.apply || done[a.id] ? ''
    : a.apply.act ? `<button type="button" class="btn ghost" style="color:var(--navy2)" data-act="${a.apply.act}" data-val="${a.apply.value}">直接套用</button>`
      : `<button type="button" class="btn ghost" style="color:var(--navy2)" data-set="${a.apply.path}" data-val="${a.apply.value}">直接套用</button>`;
  return `<section class="card"><div class="card-h"><h3>${badge('target', 'rgba(63,143,106,.12)', C.green)}今年的行動清單</h3><span class="hint">已完成 ${n}／${items.length}</span></div>
    <div class="goal-bar" style="margin:0 0 12px"><i style="width:${items.length ? (n / items.length) * 100 : 0}%;background:${C.green}"></i></div>
    <ul class="actions">${sorted.map((a) => `<li class="${done[a.id] ? 'done' : ''}">
      <button type="button" class="check" role="checkbox" aria-checked="${!!done[a.id]}" data-act="action-done" data-id="${a.id}" aria-label="標記完成：${esc(a.title)}"></button>
      <div><strong>${esc(a.title)}${levelTag[a.level]}</strong><p>${esc(a.detail)}</p>${applyBtn(a)}</div></li>`).join('')}</ul>
    <p class="note">清單依目前試算自動產生，改變設定後會跟著更新；勾選狀態存在這台裝置。</p>
  </section>`;
}

function strategyCard() {
  const w = withdrawalStrategies(state, NOW, { sims: 1000 });
  if (!w) return '';
  const rows = [
    ['fixed', '固定金額', `每年領 ${money(w.draw0)}，不隨市場調整（目前的假設）`],
    ['guardrail', '護欄式', '提領率超過起始 120% 時減 10%、低於 80% 時加 10%'],
    ['percent', '固定比例', `每年領當時資產的 ${(w.rate0 * 100).toFixed(1)}%，永遠不會用完`],
  ];
  const best = rows.reduce((b, r) => (w[r[0]].success > w[b[0]].success ? r : b), rows[0]);
  return `<section class="card"><div class="card-h"><h3>${badge('sliders', 'rgba(122,107,184,.12)', C.purple)}退休後怎麼領：提領策略比較</h3><span class="hint">同一組 1,000 種市場情境</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>策略</th><th>成功率</th><th>平均收入</th><th>最差年份收入</th><th>100 歲時剩餘</th></tr></thead>
      <tbody>${rows.map(([k, l, d]) => `<tr><td><b>${l}</b><br><small style="color:var(--muted);font-family:inherit;white-space:normal">${d}</small></td>
        <td class="${w[k].success >= 0.85 ? 'good' : w[k].success < 0.7 ? 'bad' : ''}">${Math.round(w[k].success * 100)}%</td>
        <td>${Math.round(w[k].medianIncome * 100)}%</td>
        <td class="${w[k].worstIncome < 0.6 ? 'bad' : ''}">${Math.round(w[k].worstIncome * 100)}%</td>
        <td>${wan(w[k].medianLeft)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="note"><b>怎麼看：</b>收入以「起始提領金額」為 100%。平均收入為各情境中位數；最差年份收入是運氣差的 10% 情境裡、收入最低那一年的水準。成功率最高的是「${best[1]}」——在壞年份少領一點，換來錢比較不會用完。適合哪一種，取決於你能不能接受收入起伏：保底收入（勞保、勞退）越高，越能承受投資提領的波動。</p>
  </section>`;
}

function mcCard(mc, size) {
  const pctS = Math.round(mc.success * 100);
  const col = mc.success >= 0.85 ? C.green : mc.success >= 0.7 ? C.gold2 : C.red;
  const verdict = mc.success >= 0.85 ? '相當穩健' : mc.success >= 0.7 ? '大致可行，但留意壞年份' : '風險偏高，建議加大安全邊際';
  const chart = lineChart({
    series: [
      { name: '中位數（P50）', points: mc.band.map((b) => ({ x: b.age, y: b.p50 })), color: C.navy },
      { name: '樂觀（P90）', points: mc.band.map((b) => ({ x: b.age, y: b.p90 })), color: 'rgba(46,115,83,.6)', dash: true },
      { name: '悲觀（P10）', points: mc.band.map((b) => ({ x: b.age, y: b.p10 })), color: 'rgba(178,58,51,.7)', dash: true },
    ],
    bands: [{ points: mc.band.map((b) => ({ x: b.age, lo: b.p10, hi: b.p90 })), fill: 'rgba(45,74,110,.10)' }],
    ...size, xFmt: (x) => `${x}歲`,
    yCap: Math.max(...mc.band.map((b) => b.p50), mc.atRetire?.p90 ?? 0) * 1.25,
    marks: [{ x: state.self.retireAge, label: '退休', color: C.gold2 }, ...(mc.lifeEnd < 100 ? [{ x: mc.lifeEnd, label: '預期壽命', color: C.muted }] : [])],
    tip: { title: (x) => `${x} 歲`, fmt: wan },
  });
  return `<section class="card mc"><div class="card-h"><h3>${badge('chart', 'rgba(45,74,110,.1)', C.navy)}計畫成功率（蒙地卡羅模擬）</h3>
      ${seg('volatility', [[8, '保守 8%'], [12, '均衡 12%'], [18, '積極 18%']], { label: '投資波動度假設' })}</div>
    <div class="mc-head">
      <div class="mc-big" style="color:${col}">${pctS}<small>%</small></div>
      <div><strong style="color:${col}">${verdict}</strong>
        <p>在 1,000 種隨機市場情境中，有 ${Math.round(mc.success * 1000)} 種到 ${mc.lifeEnd} 歲投資資產仍未用完；活到 90 歲的成功率為 ${Math.round(mc.success90 * 100)}%。</p></div>
    </div>
    ${chart}
    <div class="chart-legend"><span><i style="background:${C.navy}"></i>中位數</span><span><i style="background:rgba(45,74,110,.25);height:10px"></i>80% 的情境落在這個範圍（P10–P90，超出圖表的部分貼齊上緣）</span></div>
    <div class="stats" style="margin-top:12px">
      <div class="stat bad"><small>退休時 · 悲觀 P10</small><strong>${wan(mc.atRetire?.p10 ?? 0)}</strong></div>
      <div class="stat"><small>退休時 · 中位數</small><strong>${wan(mc.atRetire?.p50 ?? 0)}</strong></div>
      <div class="stat good"><small>退休時 · 樂觀 P90</small><strong>${wan(mc.atRetire?.p90 ?? 0)}</strong></div>
    </div>
    <p class="note">每年投資報酬隨機抽樣：長期平均約為各資產的加權預期報酬 ${mc.g.toFixed(1)}%，年化波動 ${mc.vol}%（假設值；全股票組合歷史上常在 15–20%，股債平衡約 8–12%）。退休後按計畫每年提領 ${money(R.investMonthly * 12)}${R.care ? '、另扣照護費' : ''}。成功率不是保證，而是幫你看清「運氣不好時會怎樣」。</p>
  </section>`;
}

function scenarioCard() {
  const list = loadScenarios();
  const cols = [{ id: null, name: '目前設定', sum: scenarioSummary(state, NOW) }, ...list.map((x) => ({ id: x.id, name: x.name, savedAt: x.savedAt, sum: scenarioSummary(x.data, NOW) }))];
  const best = Math.max(...cols.map((c) => c.sum.totalPV));
  const rows = [
    ['退休年齡', (m) => `${m.retireAge} 歲`],
    ['每月定期投資', (m) => money(m.monthlyInvest)],
    ['退休月領（名目）', (m) => money(m.total)],
    ['今日幣值', (m) => money(m.totalPV), true],
    ['生活費覆蓋率', (m) => (m.coverage === null ? '—' : `<span class="${m.coverage >= 1 ? 'good' : 'bad'}">${Math.round(m.coverage * 100)}%</span>`)],
    ['投資資產可撐到', (m) => (!m.hasInvest ? '—' : m.runoutAge ? `${m.runoutAge} 歲` : '100 歲以上')],
    ['財務自由年齡', (m) => (m.fireAge === null ? '—' : `${m.fireAge} 歲`)],
    ['提早退休空窗', (m) => (m.bridgeYears ? `${m.bridgeYears} 年` : '無')],
  ];
  return `<section class="card"><div class="card-h"><h3>${badge('save', 'rgba(45,74,110,.1)', C.navy)}方案比較</h3><span class="hint">最多 ${MAX_SCENARIOS} 組，存在這台裝置</span></div>
    <div class="save-row">
      <input class="input txt" id="sc-name" type="text" maxlength="20" placeholder="方案名稱，例如：晚兩年退休" aria-label="方案名稱">
      <button type="button" class="btn primary" data-act="sc-save" ${list.length >= MAX_SCENARIOS ? 'disabled' : ''}>把目前設定存成方案</button>
    </div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl sc">
      <thead><tr><th></th>${cols.map((c) => `<th>${esc(c.name)}${c.savedAt ? `<small>${c.savedAt.slice(0, 10)}</small>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([l, f, hi]) => `<tr><td>${l}</td>${cols.map((c) => `<td class="${hi && c.sum.totalPV === best ? 'best' : ''}">${f(c.sum)}</td>`).join('')}</tr>`).join('')}
      <tr class="acts"><td></td>${cols.map((c) => c.id ? `<td><button type="button" class="btn ghost" style="color:var(--navy2)" data-act="sc-load" data-id="${c.id}">載入</button><button type="button" class="btn ghost" data-act="sc-del" data-id="${c.id}">刪除</button></td>` : '<td></td>').join('')}</tr></tbody>
    </table></div>` : '<p class="note" style="margin:0">想比較「晚兩年退休」「每月多投資一萬」這類不同做法？先把目前設定存成方案，改完設定後再存一組，就能並排比較。</p>'}
  </section>`;
}

function yearlyRows(lc) {
  const me = R.me, cpi = state.cpi / 100;
  return lc.points.map((p) => {
    const t = p.age - me.age;
    return {
      age: p.age, year: NOW + t, phase: p.phase === 'save' ? '累積' : '提領',
      flow: p.phase === 'save' ? (t === 0 ? 0 : R.monthlyInvest * 12) : -R.investMonthly * 12,
      pool: p.pool, expense: R.expenseToday * Math.pow(1 + cpi, t),
    };
  });
}

function printReport() {
  const me = R.me, s = state.self;
  const g = goalPlan(state, NOW);
  const lc = lifecycle(state, NOW);
  const ages = retireAgeOptions(state, NOW);
  const sens = sensitivity(state, NOW);
  const tr = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  const income = [
    ['勞保老年年金', me.insMonthly], ['勞退新制', me.laborRetire], ['勞基法舊制', me.oldMonthly],
    [esc(state.benefit.name || '企業福利信託'), R.benefitMonthly], ['現有資產', R.holdingsMonthly], ['定期投資', R.portfolioMonthly],
    [`${esc(state.spouse.name)}（配偶）`, R.spouseTotal], ['人生重大事件', R.eventsMonthly],
  ].filter((x) => x[1] !== 0);
  const html = `
  <header class="rp-h"><div><h1>早謀遠算 · 退休試算報告</h1><p>SunDown Studio 日落工作室　${new Date().toLocaleDateString('zh-TW')} 產出</p></div>
    <div class="rp-total"><small>退休月領總額</small><b>${money(R.total)}</b><span>約當今日幣值 ${money(R.totalPV)}／月</span></div></header>

  <section><h2>重點</h2><table>
    ${tr('生活費覆蓋率', R.expenseToday > 0 ? `${Math.round(R.coverage * 100)}%（月領 ${money(R.total)}／通膨後生活費 ${money(R.expenseAtRetire)}）` : '未設定生活費')}
    ${tr('投資資產可撐到', R.investPool > 0 ? (lc.runoutAge ? `${lc.runoutAge} 歲` : '100 歲以上') : '未設定投資資產')}
    ${tr('提早退休空窗期', me.bridge.years ? `${me.bridge.years} 年，需另外準備約 ${wan(me.bridge.missing)}` : '無')}
    ${tr('財務自由年齡', R.fireAge === null ? '60 年內未達成' : `${R.fireAge} 歲`)}
    ${tr('目標達成率', g.target > 0 ? `${Math.round(g.progress * 100)}%（目標 ${money(g.target)}／月，今日幣值）` : '未設定目標')}
  </table></section>

  <section><h2>基本資料</h2><table>
    ${tr('年齡／退休年齡', `${me.age} 歲／${s.retireAge} 歲（距退休 ${R.n} 年）`)}
    ${tr('月薪／薪資年增率', `${money(s.salary)}／${pct(state.salaryGrowth)}`)}
    ${tr('勞保年資／平均投保薪資', `${me.insYears} 年／${money(me.insBase)}`)}
    ${tr('勞退自提／基金收益', `${pct(s.selfRate)}／${pct(s.laborReturn)}`)}
    ${tr('退休後生活費（今日幣值）', money(R.expenseToday))}
    ${tr('通膨率', pct(state.cpi))}
    ${tr('提領方式', state.payoutMode === 'divisor' ? `生命表除數，${me.payoutMonths} 個月` : `年金化，退休後報酬 ${pct(state.postReturn)}，${me.payoutMonths} 個月`)}
  </table></section>

  <section><h2>退休月領明細（退休當年名目）</h2><table>
    ${income.map(([k, v]) => tr(k, money(v))).join('')}
    <tr class="sum"><th>合計</th><td>${money(R.total)}</td></tr>
  </table></section>

  ${g.gapPV > 0 ? `<section><h2>補足目標的方式（擇一）</h2><table>
    ${tr('每月多投資', `${money(Math.ceil(g.extraMonthly / 100) * 100)}（年化 ${pct(state.investReturn)}）`)}
    ${tr('今天一次投入', money(Math.ceil(g.lumpSum / 1000) * 1000))}
    ${tr('延後退休', g.retireAge ? `${g.retireAge} 歲` : '75 歲仍不足')}
    ${g.selfRate6 ? tr('勞退自提拉到 6%', `月領增加 ${money(g.selfRate6.gain)}（今日幣值）`) : ''}
  </table></section>` : ''}

  <section><h2>今年的行動清單</h2><table class="rp-grid">
    ${actionPlan(state, NOW, monteCarlo(state, NOW, { sims: 1000 })).map((a, i) => `<tr><td style="width:2em">${state.actionsDone?.[a.id] ? '☑' : '☐'}</td><td><b>${esc(a.title)}</b><br>${esc(a.detail)}</td></tr>`).join('')}
  </table></section>

  <section><h2>幾歲退休比較</h2><table class="rp-grid">
    <tr><th>退休年齡</th><th>月領（名目）</th><th>今日幣值</th><th>覆蓋率</th></tr>
    ${ages.map((a) => `<tr${a.current ? ' class="sum"' : ''}><td>${a.retireAge} 歲${a.current ? '（目前）' : ''}</td><td>${money(a.total)}</td><td>${money(a.totalPV)}</td><td>${R.expenseToday > 0 ? `${Math.round(a.coverage * 100)}%` : '—'}</td></tr>`).join('')}
  </table></section>

  <section><h2>敏感度（月領今日幣值的變化）</h2><table class="rp-grid">
    <tr><th>條件</th><th>調低</th><th>調高</th></tr>
    ${sens.map((r) => `<tr><td>${r.label}</td><td>${r.lowLabel}：${r.low >= 0 ? '+' : '−'}${money(Math.abs(r.low))}</td><td>${r.highLabel}：${r.high >= 0 ? '+' : '−'}${money(Math.abs(r.high))}</td></tr>`).join('')}
  </table></section>

  <footer class="rp-f">計算依據：勞保 A/B 式擇優、退休前 60 個月平均投保薪資（115 年分級表）；勞退雇主 6% ＋自提、提繳工資上限 150,000、滿 60 歲請領；生命表平均餘命換算提領月數。投資報酬為假設、不計稅負與保費。試算結果僅供參考，不構成理財建議；勞保、勞退實際給付以勞動部勞工保險局核定為準。</footer>`;
  let box = $('#report');
  if (!box) { box = document.createElement('div'); box.id = 'report'; document.body.appendChild(box); }
  box.innerHTML = html;
  window.print();
}

function exportCsv() {
  const rows = yearlyRows(lifecycle(state, NOW));
  const head = ['年齡', '西元', '階段', '當年投入或提領', '年底資產池', '生活費（月）'];
  const body = rows.map((r) => [r.age, r.year, r.phase, Math.round(r.flow), Math.round(r.pool), Math.round(r.expense)].join(','));
  const blob = new Blob(['﻿' + [head.join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `早謀遠算_逐年明細_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ── 側欄摘要 ─────────────────────────────── */
function renderAside() {
  const me = R.me;
  const parts = [
    ['保底', R.floor, C.greenL], ['現有資產', R.holdingsMonthly, C.gold], ['定期投資', R.portfolioMonthly, '#7FA3CC'], [esc(state.spouse.name), R.spouseTotal, '#C79BB8'],
  ].filter((p) => p[1] > 0);
  const cov = R.coverage;
  const covColor = cov >= 1 ? C.green : cov >= 0.7 ? C.gold2 : C.red;
  const gap = R.total - R.expenseAtRetire;
  $('#aside').innerHTML = `
    <div class="hero">
      <small>退休月領總額</small>
      <div class="big">${money(R.total)}</div>
      <div class="pv">約當今日幣值 ${money(R.totalPV)}／月</div>
      <div class="stack">${parts.map((p) => `<i style="flex:${p[1]};background:${p[2]}"></i>`).join('')}</div>
      <div class="legend">${parts.map((p) => `<div><span><i style="background:${p[2]}"></i>${p[0]}</span><b>${money(p[1])}</b></div>`).join('')}${R.eventsMonthly < 0 ? `<div><span><i style="background:${C.red}"></i>人生事件</span><b>−${money(-R.eventsMonthly)}</b></div>` : ''}</div>
    </div>
    <div class="card">
      <div class="card-h" style="margin-bottom:14px"><h3>月領 vs 生活費</h3><span class="hint">退休當年</span></div>
      ${R.expenseToday <= 0 ? '<p class="note" style="margin:0">尚未設定生活費。</p>' : `
      <div class="cover">
        <div class="ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.915" fill="none" stroke="#EFE7D8" stroke-width="3.4"/>
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="${covColor}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="${Math.min(cov, 1) * 100} 100"/></svg>
          <b style="color:${covColor}"><span>${Math.round(cov * 100)}%<small>覆蓋率</small></span></b></div>
        <div class="cover-t">
          <strong style="color:${gap >= 0 ? C.green : C.red}">${gap >= 0 ? `每月多出 ${money(gap)}` : `每月缺口 ${money(-gap)}`}</strong>
          <p>月領 ${money(R.total)}<br>生活費 ${money(R.expenseAtRetire)}（通膨後）</p>
          ${gap < 0 ? '<p><a href="#plan" data-tab="plan">看看要補多少 →</a></p>' : ''}
        </div>
      </div>`}
    </div>
    <div class="card" style="padding:12px 18px">
      <div class="kv"><span>距退休</span><b>${R.n} 年</b></div>
      <div class="kv"><span>提領月數</span><b>${me.payoutMonths} 個月</b></div>
      <div class="kv"><span>健康期（退休後）</span><b>${Math.max(0, me.healthAge - state.self.retireAge).toFixed(1)} 年</b></div>
      <div class="kv"><span>財務自由年齡</span><b>${R.fireAge === null ? '—' : `${R.fireAge} 歲`}</b></div>
    </div>
    <button type="button" class="btn" style="justify-content:center" data-act="print">列印／存成 PDF 報告</button>
    <button type="button" class="btn gold" style="justify-content:center" data-act="share">${icon('share').replace('<svg', '<svg width="15" height="15"')}產生結果圖卡</button>
    <p class="disclaimer">試算結果僅供參考，不構成理財建議。<br>勞保、勞退實際金額以勞保局核定為準。</p>`;
  $('#mtotal').textContent = money(R.total);
  $('#mpv').textContent = `約當今日 ${money(R.totalPV)}`;
  $('#mfloor').textContent = money(R.floor + R.spouseTotal);
  $('#minvest').textContent = money(R.investMonthly);
  $('#ttotal').textContent = money(R.total);
}

/* ── 繪製與更新 ───────────────────────────── */
const PAGES = { setup: pageSetup, floor: pageFloor, invest: pageInvest, plan: pagePlan, analysis: pageAnalysis };
const OUTPUT_ONLY = new Set(['floor', 'analysis', 'plan']);

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l, ic], i) =>
    `<button type="button" class="tab" role="tab" id="tab-${k}" aria-controls="main" tabindex="${tab === k ? 0 : -1}" aria-selected="${tab === k}" data-tab="${k}"><span class="ic"><span>${i + 1}</span>${icon(ic)}</span>${l}</button>`).join('');
}
function renderPage() {
  const main = $('#main');
  main.innerHTML = PAGES[tab]() + pager();
  main.setAttribute('aria-labelledby', `tab-${tab}`);
}
function pager() {
  const i = TABS.findIndex((t) => t[0] === tab);
  const prev = TABS[i - 1], next = TABS[i + 1];
  return `<nav class="pager" aria-label="步驟切換">
    ${prev ? `<button type="button" class="btn" data-tab="${prev[0]}">← ${prev[1]}</button>` : ''}
    ${next ? `<button type="button" class="btn primary next" data-tab="${next[0]}">下一步：${next[1]} →</button>` : ''}
  </nav>`;
}
function refreshOutputs() {
  for (const el of $$('[data-o]')) el.innerHTML = outVal(el.dataset.o);
  for (const el of $$('[data-v]')) el.textContent = fmtV(getPath(state, el.dataset.v), el.dataset.unit);
  for (const el of $$('[data-k]')) {
    if (el === document.activeElement) continue;
    const v = getPath(state, el.dataset.k);
    const shown = fmtInput(v, el.dataset.t);
    if (el.type !== 'file' && el.tagName !== 'SELECT' && String(el.value) !== String(shown)) el.value = shown;
    else if (el.tagName === 'SELECT' && String(el.value) !== String(v)) el.value = v;
  }
  for (const el of $$('input[type=range]')) fillRange(el);
  const issues = validate(state, NOW);
  const bad = new Set(issues.filter((x) => x.level !== 'info').map((x) => x.field));
  for (const el of $$('[data-k]')) el.setAttribute('aria-invalid', String(bad.has(el.dataset.k)));
  const t1 = $('[data-tab="setup"]');
  if (t1) t1.classList.toggle('has-issue', issues.some((x) => x.level === 'error'));
  for (const el of $$('[data-set]')) el.setAttribute('aria-pressed', String(getPath(state, el.dataset.set)) === el.dataset.val);
}

let saveTimer;
function update({ rerender = false } = {}) {
  R = compute(state, NOW);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(state), 400);
  // 純輸出的分頁（plan 只有兩個輸入欄位，焦點不在其中時才整頁重繪）
  const focusInMain = $('#main').contains(document.activeElement) && document.activeElement.matches('input, select');
  if (rerender || (OUTPUT_ONLY.has(tab) && !focusInMain)) renderPage();
  refreshOutputs();
  renderAside();
}

function fillRange(el) {
  el.style.setProperty('--fill', `${((+el.value - +el.min) / (+el.max - +el.min)) * 100}%`);
}
function parseVal(el) {
  const t = el.dataset.t;
  if (t === 'str') return el.value;
  if (t === 'money' || t === 'moneynull') {
    const raw = el.value.replace(/[^\d.]/g, '');
    if (raw === '') return t === 'moneynull' ? null : 0;
    return +raw || 0;
  }
  if (t === 'numnull') return el.value === '' ? null : +el.value;
  const v = +el.value;
  return Number.isFinite(v) ? v : 0;
}
const CLAMP = {
  'self.retireAge': [40, 80], 'spouse.retireAge': [40, 80], 'self.workStartAge': [14, 70], 'spouse.workStartAge': [14, 70],
  'self.oldSystemYears': [0, 45], 'spouse.oldSystemYears': [0, 45], 'self.selfRate': [0, 6], 'spouse.selfRate': [0, 6],
};

/* ── 事件 ─────────────────────────────────── */
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-k]');
  if (!el) return;
  setPath(state, el.dataset.k, parseVal(el));
  update({ rerender: el.hasAttribute('data-rerender') && el.tagName === 'SELECT' });
});
document.addEventListener('change', (e) => {
  const el = e.target;
  const c = el.dataset.k && CLAMP[el.dataset.k];
  if (c && el.value !== '') {
    const v = Math.min(c[1], Math.max(c[0], +el.value || 0));
    el.value = v;
    setPath(state, el.dataset.k, v);
    update({ rerender: el.hasAttribute('data-rerender') });
  } else if (el.matches('input[data-rerender]')) update({ rerender: true });
  if (el.dataset.act === 'region') {
    state.region = el.value;
    const r = MIN_LIVING.find((x) => x.name === el.value);
    if (r) state.monthlyExpense = Math.round((r.min * 1.5) / 500) * 500;
    update({ rerender: true });
  }
  if (el.dataset.act === 'import' && el.files[0]) {
    const f = el.files[0];
    f.text().then((t) => {
      try { state = parseImport(t); save(state); update({ rerender: true }); toast('已匯入設定'); }
      catch { toast('檔案格式不正確，請確認是早謀遠算匯出的設定檔'); }
    });
    el.value = '';
  }
});
document.addEventListener('focusout', (e) => {
  // 金額欄位離開時補上千分位
  if (e.target.matches?.('[data-t^="money"]')) e.target.value = fmtInput(getPath(state, e.target.dataset.k), e.target.dataset.t);
  // 離開欄位後，輸出分頁補一次整頁重繪
  if (e.target.matches?.('#main [data-k]') && OUTPUT_ONLY.has(tab)) setTimeout(() => {
    if (!$('#main').contains(document.activeElement)) { renderPage(); refreshOutputs(); }
  });
});

document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-focus]');
  if (f) {
    const el = $(`[data-k="${f.dataset.focus}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
    return;
  }
  const t = e.target.closest('[data-tab],[data-set],[data-toggle],[data-act]');
  if (!t || t.tagName === 'SELECT' || t.type === 'file') return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    history.replaceState(null, '', `#${tab}`);
    renderTabs(); renderPage(); refreshOutputs();
    window.scrollTo({ top: 0 });
    return;
  }
  if (t.dataset.set) {
    const cur = getPath(state, t.dataset.set);
    setPath(state, t.dataset.set, typeof cur === 'number' ? +t.dataset.val : t.dataset.val);
    return update({ rerender: true });
  }
  if (t.dataset.toggle) {
    setPath(state, t.dataset.toggle, !getPath(state, t.dataset.toggle));
    return update({ rerender: true });
  }
  const act = t.dataset.act;
  const { id, pid } = t.dataset;
  if (act === 'add-holding') state.holdings.push({ id: uid('h'), name: '新資產', kind: 'tw', shares: 1, price: 100, amount: 0, rate: 5 });
  else if (act === 'del-holding') state.holdings = state.holdings.filter((x) => x.id !== id);
  else if (act === 'add-portfolio') state.portfolios.push({ id: uid('p'), name: `投資組合 ${state.portfolios.length + 1}`, assets: [{ id: uid('a'), name: '新標的', monthly: 3000, rate: 5 }] });
  else if (act === 'del-portfolio') { if (!confirm('刪除這個投資組合？')) return; state.portfolios = state.portfolios.filter((p) => p.id !== id); }
  else if (act === 'add-asset') state.portfolios.find((p) => p.id === pid)?.assets.push({ id: uid('a'), name: '新標的', monthly: 3000, rate: 5 });
  else if (act === 'del-asset') { const p = state.portfolios.find((x) => x.id === pid); if (p) p.assets = p.assets.filter((a) => a.id !== id); }
  else if (act === 'export') return exportFile();
  else if (act === 'csv') return exportCsv();
  else if (act === 'template') {
    const tp = templates(NOW).find((x) => x.id === id);
    if (!tp || !confirm(`套用「${tp.name}」範本會取代目前的設定（進度追蹤紀錄會保留）。確定套用？`)) return;
    const keep = state.tracking;
    state = tp.make();
    state.tracking = keep;
    toast(`已套用「${tp.name}」，可以開始調整成你自己的數字`);
  }
  else if (act === 'track-baseline' || act === 'track-reset') {
    if (act === 'track-reset' && !confirm('以目前設定重新建立基準？過去的記錄會保留，但改和新基準比較。')) return;
    state.tracking = { ...(state.tracking || { checkins: [] }), baseline: { createdAt: new Date().toISOString().slice(0, 10), path: planPath(state, NOW) } };
    toast('已建立基準計畫');
  } else if (act === 'track-add') {
    const n = (sel) => +($(sel).value || '').replace(/[^\d.]/g, '') || 0;
    const date = $('#tk-date').value;
    if (!date) return toast('請選擇記錄日期');
    state.tracking.checkins = [...state.tracking.checkins.filter((c) => c.date !== date), { id: uid('c'), date, invest: n('#tk-invest'), labor: n('#tk-labor') }];
    toast('已記錄');
  } else if (act === 'track-del') {
    state.tracking.checkins = state.tracking.checkins.filter((c) => c.id !== id);
  }
  else if (act === 'action-done') {
    state.actionsDone = { ...(state.actionsDone || {}) };
    if (state.actionsDone[id]) delete state.actionsDone[id]; else state.actionsDone[id] = true;
  }
  else if (act === 'add-event') {
    const p = EVENT_PRESETS[+t.dataset.val];
    const age = Math.min(100, NOW - state.self.birthYear + p.offset);
    state.events.push({ id: uid('e'), name: p.name, age, amount: p.amount, kind: p.kind });
    state.events.sort((a, b) => a.age - b.age);
  } else if (act === 'del-event') state.events = state.events.filter((e) => e.id !== id);
  else if (act === 'print') return printReport();
  else if (act === 'sc-save') {
    const list = loadScenarios();
    if (list.length >= MAX_SCENARIOS) return toast(`最多存 ${MAX_SCENARIOS} 組方案，請先刪除一組`);
    const name = ($('#sc-name')?.value || '').trim() || `方案 ${list.length + 1}`;
    list.push({ id: uid('s'), name, savedAt: new Date().toISOString(), data: JSON.parse(JSON.stringify(state)) });
    if (!saveScenarios(list)) return toast('無法儲存（瀏覽器可能停用了本機儲存）');
    toast(`已存成「${name}」`);
  } else if (act === 'sc-load') {
    const sc = loadScenarios().find((x) => x.id === id);
    if (!sc || !confirm(`載入「${sc.name}」會取代目前設定。目前設定若還要用，請先存成方案。確定載入？`)) return;
    const keep = state.tracking; // 進度追蹤是本人的紀錄，不隨方案切換
    state = normalize(sc.data);
    state.tracking = keep;
    toast(`已載入「${sc.name}」`);
  } else if (act === 'sc-del') {
    const list = loadScenarios();
    const sc = list.find((x) => x.id === id);
    if (!sc || !confirm(`刪除方案「${sc.name}」？`)) return;
    saveScenarios(list.filter((x) => x.id !== id));
  }
  else if (act === 'apply-extra') {
    // 加碼併入「目標補足」組合，重複套用時累加
    const amt = +t.dataset.val;
    let p = state.portfolios.find((x) => x.name === '目標補足');
    if (!p) { p = { id: uid('p'), name: '目標補足', assets: [] }; state.portfolios.push(p); }
    const a = p.assets[0];
    if (a) { a.monthly += amt; a.rate = state.investReturn; } else p.assets.push({ id: uid('a'), name: '目標補足加碼', monthly: amt, rate: state.investReturn });
    toast(`已在「投資資產」加入每月 ${money(amt)} 的定期投資`);
  } else if (act === 'apply-lump') {
    const amt = +t.dataset.val;
    state.holdings.push({ id: uid('h'), name: '目標補足一次投入', kind: 'cash', shares: 0, price: 0, amount: amt, rate: state.investReturn });
    toast(`已在「投資資產」加入一筆 ${money(amt)} 的單筆投入`);
  }
  else if (act === 'reset') { if (!confirm('清除所有設定，回到預設值？')) return; state = defaults(NOW); }
  else if (act === 'share') return openShare();
  else if (act === 'close-dialog') return t.closest('dialog').close();
  else if (act === 'download-card') return downloadCard();
  else return;
  update({ rerender: true });
});

function exportFile() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `早謀遠算_設定_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ── 結果圖卡 ─────────────────────────────── */
function drawCard() {
  const W = 800, H = 440, D = 2;
  const cv = document.createElement('canvas');
  cv.width = W * D; cv.height = H * D;
  const x = cv.getContext('2d');
  x.scale(D, D);
  const F = "'Outfit','Noto Sans TC',sans-serif";
  x.fillStyle = '#1E2D42'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#E8B84B'; x.fillRect(0, 0, W, 5);
  x.fillStyle = '#FEFEFE'; x.font = `800 30px ${F}`; x.fillText('早謀遠算', 48, 70);
  x.fillStyle = '#8A8E96'; x.font = `14px ${F}`; x.fillText('SunDown Studio · 台灣退休規劃試算', 48, 96);
  x.fillStyle = '#E8B84B'; x.font = `700 14px ${F}`; x.fillText(`${state.self.retireAge} 歲退休 · 每月可領`, 48, 150);
  x.fillStyle = '#FFFFFF'; x.font = `800 64px ${F}`; x.fillText(money(R.total), 48, 222);
  x.fillStyle = '#5BAD85'; x.font = `15px ${F}`; x.fillText(`約當今日幣值 ${money(R.totalPV)}／月`, 48, 254);
  x.strokeStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.moveTo(48, 284); x.lineTo(W - 48, 284); x.stroke();
  [['保底收入', money(R.floor + R.spouseTotal)], ['投資月領', money(R.investMonthly)], ['生活費覆蓋率', `${Math.round(R.coverage * 100)}%`]].forEach(([l, v], i) => {
    const px = 48 + 240 * i;
    x.fillStyle = '#8A8E96'; x.font = `13px ${F}`; x.fillText(l, px, 320);
    x.fillStyle = '#FEFEFE'; x.font = `700 24px ${F}`; x.fillText(v, px, 352);
  });
  x.fillStyle = 'rgba(255,255,255,.35)'; x.font = `12px ${F}`;
  x.fillText('試算結果僅供參考，不構成理財建議', 48, H - 28);
  x.textAlign = 'right'; x.fillText(new Date().toLocaleDateString('zh-TW'), W - 48, H - 28);
  return cv;
}
function openShare() {
  const dlg = $('#share');
  const slot = $('#card-slot');
  slot.innerHTML = '';
  slot.appendChild(drawCard());
  dlg.showModal();
}
function downloadCard() {
  drawCard().toBlob((blob) => {
    if (!blob) return toast('圖片產生失敗，請改用截圖');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '早謀遠算_退休試算.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

/* ── 啟動 ─────────────────────────────────── */
let lastNarrow = window.innerWidth < 640;
window.addEventListener('resize', () => {
  const narrow = window.innerWidth < 640;
  if (narrow !== lastNarrow && tab === 'analysis') renderPage();
  lastNarrow = narrow;
});
// 分頁：左右方向鍵、Home／End 切換（WAI-ARIA tabs 模式）
$('#tabs').addEventListener('keydown', (e) => {
  const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
  if (!(e.key in keys)) return;
  e.preventDefault();
  const i = TABS.findIndex((t) => t[0] === tab);
  const k = keys[e.key];
  const next = k === 'first' ? 0 : k === 'last' ? TABS.length - 1 : (i + k + TABS.length) % TABS.length;
  $(`#tab-${TABS[next][0]}`).click();
  $(`#tab-${TABS[next][0]}`).focus();
});

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (PAGES[h] && h !== tab) { tab = h; renderTabs(); renderPage(); refreshOutputs(); }
});
renderTabs();
renderPage();
refreshOutputs();
renderAside();
attachTooltips(document);
if (dataStale(NOW)) {
  const bar = document.createElement('div');
  bar.className = 'stale';
  bar.setAttribute('role', 'note');
  bar.innerHTML = `本工具的勞保分級表、最低生活費、稅率等參數為民國 ${DATA_YEAR} 年度，今年是 ${NOW - 1911} 年，部分數字可能已調整，試算結果請保守看待。`;
  $('.top').after(bar);
}
if (seeded) { save(state); toast('已帶入介紹頁的年齡、月薪與每月投資'); }

// 離線使用：註冊 service worker（本機 file:// 開啟時略過）
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 不支援或被封鎖時不影響試算 */ });
}
