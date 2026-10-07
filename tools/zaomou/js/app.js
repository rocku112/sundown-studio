/* 早謀遠算 · 試算介面
   畫面分兩種：含輸入欄位的分頁（起點設定、投資資產、目標反算）只在結構改變時重繪，
   數字靠 data-o 局部更新，避免打字時失焦；純輸出的分頁與側欄則每次重算後整頁重繪。 */

import { compute, holdingValue, growLump } from './engine.js';
import { legalPensionAge, INSURANCE_GRADES, MIN_LIVING, EXPENSE_LEVELS, RETURN_PRESETS, LIFE_TABLE, DATA_YEAR, PENSION_WAGE_MAX } from './data.js';
import { load, save, defaults, parseImport, getPath, setPath, uid } from './state.js';
import { lineChart, donut, wan } from './charts.js';

const NOW = new Date().getFullYear();
let state = load();
let R = compute(state, NOW);
let tab = ['setup', 'floor', 'invest', 'plan', 'analysis'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'setup';

/* ── 小工具 ─────────────────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (v) => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString()}` : '—');
const pct = (v, d = 1) => `${(+v).toFixed(d)}%`;
const C = { navy: '#2D4A6E', navyL: '#3A5F8A', gold: '#E8B84B', gold2: '#CF9E2E', green: '#3F9A6E', greenL: '#5BAD85', red: '#C94A4A', purple: '#7A6BB8', muted: '#9AA0A8' };

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
const numF = (k, label, o = {}) => `
  <label class="field"><span>${label}${o.em ? ` <em>${o.em}</em>` : ''}</span>
    <span class="input-wrap"><input class="input num" type="number" inputmode="decimal" data-k="${k}" data-t="${o.nullable ? 'numnull' : 'num'}"
      value="${getPath(state, k) ?? ''}" ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.max !== undefined ? `max="${o.max}"` : ''} step="${o.step ?? 1}"
      ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''} ${o.rerender ? 'data-rerender' : ''}>${o.unit ? `<span class="unit">${o.unit}</span>` : ''}</span></label>`;
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
    case 'ageinfo': {
      const s = state.self;
      return `目前約 <b>${me.age}</b> 歲，距退休 <b>${R.n}</b> 年；勞保年資 <b>${me.insYears}</b> 年；
        依出生年次，勞保老年年金法定請領年齡為 <b>${legalPensionAge(s.birthYear)}</b> 歲。` +
        (s.retireAge < 60 ? ' <span class="tag warn">勞保年金最早 60 歲、勞退最早 60 歲才能請領</span>' : '');
    }
    case 'insgrade': {
      if (state.self.insMode === 'manual') return `投保薪資 <b>${money(me.insBase)}</b>（第 ${me.insGrade} 級）`;
      return `月薪 ${money(state.self.salary)} → 第 <b>${me.insGrade}</b> 級，投保薪資 <b>${money(me.insBase)}</b>` +
        (state.self.salary > 45800 ? '（已達上限）' : '');
    }
    case 'laborinfo': return `每月提繳 <b>${money(me.acct.monthlyContrib)}</b>（雇主 6% + 自提 ${pct(state.self.selfRate, 1)}，提繳工資上限 ${money(PENSION_WAGE_MAX)}）。` +
      (state.self.laborBalance === null ? `未填餘額，依新制施行後約 <b>${me.acct.estimatedPast.toFixed(1)}</b> 年年資回推估算。` : '') +
      ` 退休時專戶約 <b>${wan(me.acct.pool)}</b>，換算月領 <b>${money(me.laborRetire)}</b>。`;
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
const TABS = [
  ['setup', '起點設定', 'sliders'],
  ['floor', '保底收入', 'landmark'],
  ['invest', '投資資產', 'wallet'],
  ['plan', '目標反算', 'target'],
  ['analysis', '分析圖表', 'chart'],
];

function pageSetup() {
  const s = state.self, sp = state.spouse;
  const tbl = LIFE_TABLE[s.gender] || LIFE_TABLE.male;
  const region = MIN_LIVING.find((r) => r.name === state.region) || MIN_LIVING[6];
  return `
  <h2 class="page-title">起點設定</h2>
  <p class="page-sub">填入基本資料，右側數字即時更新。資料只存在這台裝置的瀏覽器裡。</p>

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
      ${s.insMode === 'manual' ? `<label class="field"><span>勞保投保薪資級距</span>
        <select class="input" data-k="self.insGrade" data-t="num">${INSURANCE_GRADES.map((g, i) =>
          `<option value="${i + 1}" ${s.insGrade === i + 1 ? 'selected' : ''}>第 ${i + 1} 級 — ${money(g)}</option>`).join('')}</select></label>` : ''}
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
    ? `投保薪資 ${money(me.insBase)} × 年資 ${me.insYears} 年，${ins.formula} 式擇優（A ${money(ins.a)}／B ${money(ins.b)}）` +
      (ins.adj ? `，${ins.startAge} 歲請領 ${ins.adj > 0 ? '延後增給' : '提前減給'} ${Math.round(Math.abs(ins.adj) * 100)}%` : `，${ins.startAge} 歲起領`)
    : `年資未滿 15 年，只能請領一次金約 ${wan(ins.lump)}，以提領月數換算`;
  const row = (k, sub, v, tag = '') => `<div class="row"><div class="k">${k}${tag}<small>${sub}</small></div><div class="v">${money(v)}</div></div>`;
  return `
  <h2 class="page-title">保底收入</h2>
  <p class="page-sub">法定退休給付與公司福利，是退休收入裡最穩的一塊。所有金額都是退休當年的名目月領。</p>
  <section class="card">
    <div class="rows">
      ${row('勞保老年給付', insNote, me.insMonthly, ins.kind === 'lump' ? '<span class="tag warn">一次金</span>' : `<span class="tag">${ins.formula} 式</span>`)}
      ${row('勞退新制月領', `專戶退休時約 ${wan(me.acct.pool)} ÷ ${me.payoutMonths} 個月${state.payoutMode === 'annuity' ? '（年金化）' : ''}`, me.laborRetire)}
      ${me.oldUnits > 0 ? row('勞基法舊制', `${me.oldUnits} 基數，一次領約 ${wan(me.oldLump)}`, me.oldMonthly) : ''}
      ${state.benefit.enabled ? row(esc(state.benefit.name || '企業福利信託'), `每月 ${money(state.benefit.self + state.benefit.company)}，年化 ${pct(state.benefit.rate)}`, R.benefitMonthly) : ''}
      <div class="row sum"><div class="k">保底月領小計</div><div class="v">${money(R.floor)}</div></div>
      ${R.holdingsMonthly ? row('現有資產', `現值 ${wan(R.holdingsNow)}，退休時 ${wan(R.holdingsPool)}`, R.holdingsMonthly) : ''}
      ${R.portfolioMonthly ? row('定期投資', `每月投入 ${money(R.monthlyInvest)}，退休時 ${wan(R.portfolioPool)}`, R.portfolioMonthly) : ''}
      ${R.spouse ? row(`${esc(state.spouse.name)}的保底月領`, `勞保 ${money(R.spouse.insMonthly)} + 勞退 ${money(R.spouse.laborRetire)}${R.spouse.oldMonthly ? ` + 舊制 ${money(R.spouse.oldMonthly)}` : ''}`, R.spouse.floor) : ''}
      <div class="row sum total"><div class="k">退休月領總計<small>約當今日幣值 ${money(R.totalPV)}</small></div><div class="v">${money(R.total)}</div></div>
    </div>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('landmark', 'rgba(63,154,110,.12)', C.green)}計算依據</h3></div>
    <div class="rows" style="font-size:13px">
      <div class="row"><div class="k">勞保老年年金<small>A 式：平均月投保薪資 × 年資 × 0.775% + 3,000；B 式：平均月投保薪資 × 年資 × 1.55%，兩者擇優。法定請領年齡 ${legalPensionAge(s.birthYear)} 歲，每提前 1 年減給 4%、每延後 1 年增給 4%，各以 5 年為限。年資未滿 15 年改請領一次金。</small></div></div>
      <div class="row"><div class="k">勞退新制<small>雇主每月提繳 6%＋個人自提，依薪資年增率逐月累積、以勞退基金收益月複利滾存；退休時的專戶金額依提領方式換算月領。</small></div></div>
      <div class="row"><div class="k">勞基法舊制<small>前 15 年每年 2 個基數，第 16 年起每年 1 個基數，最高 45 個基數；基數以退休前 6 個月平均工資計，此處以推估的退休時月薪近似。</small></div></div>
      <div class="row"><div class="k">簡化假設<small>投保薪資維持目前級距、不計勞保年金依 CPI 調整、不計稅負與保費；實際金額以勞保局核定為準。</small></div></div>
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
  <h2 class="page-title">投資資產</h2>
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
  <p class="note">預期報酬僅為假設。長期而言，全球股市名目年化報酬常被引用的區間約 5–8%，但任何單一期間都可能大幅偏離；高於 10% 的假設請保守看待。</p>`;
}

function pagePlan() {
  return `
  <h2 class="page-title">目標反算</h2>
  <p class="page-sub">先決定退休後想過的生活，再算出現在每個月還要多投資多少。</p>
  <section class="card"><div class="card-h"><h3>${badge('target', 'rgba(201,74,74,.1)', C.red)}我的目標</h3></div>
    <div class="grid two">
      ${numF('targetMonthly', '希望退休後每月可用（今日幣值）', { min: 0, step: 5000, unit: '元' })}
      ${numF('investReturn', '新增投資的預期年化報酬', { min: 0, max: 15, step: 0.5, unit: '%' })}
    </div>
    <div class="stats" style="margin-top:16px">
      <div class="stat"><small>換算退休當年名目</small><strong>${out('rv:target', outVal('rv:target'))}</strong></div>
      <div class="stat good"><small>保底收入（含配偶）</small><strong>${money(R.floor + R.spouseTotal)}</strong></div>
      <div class="stat ${R.reverse.gapMonthly > 0 ? 'bad' : 'good'}"><small>需靠投資補足／月</small><strong>${out('rv:gap', outVal('rv:gap'))}</strong></div>
    </div>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('coins', 'rgba(232,184,75,.18)', '#9A7210')}需要的資產池</h3></div>
    <div class="stats">
      <div class="stat"><small>退休時需要</small><strong>${out('rv:pool', outVal('rv:pool'))}</strong></div>
      <div class="stat"><small>目前規劃可累積</small><strong>${out('rv:have', outVal('rv:have'))}</strong></div>
      <div class="stat ${R.reverse.shortfallPool > 0 ? 'bad' : 'good'}"><small>尚缺</small><strong>${out('rv:short', outVal('rv:short'))}</strong></div>
    </div>
    <div class="alert ${R.reverse.shortfallPool > 0 ? 'bad' : 'good'}" style="margin-top:14px">
      ${R.reverse.shortfallPool > 0
        ? `除了現有規劃，每月還需再投入 <b>${out('rv:extra', outVal('rv:extra'))}</b><p>以年化 ${pct(state.investReturn)} 投資 ${R.n} 年估算。</p>`
        : '<b>現有規劃已足以達成目標。</b><p>可以考慮提高目標、提早退休，或把多出來的預算留作緊急預備金。</p>'}
    </div>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('hourglass', 'rgba(232,184,75,.18)', '#9A7210')}財務自由年齡</h3><strong class="num" style="font-size:20px;color:var(--navy)">${out('fire', outVal('fire'))}</strong></div>
    <p class="note" style="margin:0">定義：投資資產（不含勞保、勞退）已足以支應通膨後的生活費 ${money(R.expenseToday)}／月（今日幣值），一路用到預期壽命 ${R.me.lifeAge.toFixed(0)} 歲；以退休後年化 ${pct(state.postReturn)} 扣除通膨計算。</p>
  </section>`;
}

function pageAnalysis() {
  const me = R.me, s = state.self;
  const size = window.innerWidth < 640 ? { width: 380, height: 220 } : {};
  // 1. 資產累積
  const needPool = me.payout.toPool(Math.max(0, R.expenseAtRetire - R.floor - R.spouseTotal));
  const growth = lineChart({
    series: [
      { points: R.growth.map((g) => ({ x: g.age, y: g.pool })), color: C.navy, fill: 'rgba(45,74,110,.08)' },
      ...(needPool > 0 ? [{ points: [{ x: me.age, y: needPool }, { x: s.retireAge, y: needPool }], color: C.red, dash: true }] : []),
    ],
    xFmt: (x) => `${x}歲`, ...size,
  });
  // 2. 月領來源
  const parts = [
    { label: '勞保', value: me.insMonthly, color: C.greenL },
    { label: '勞退', value: me.laborRetire, color: C.navy },
    { label: '舊制', value: me.oldMonthly, color: '#8FB9A3' },
    { label: esc(state.benefit.name || '企業信託'), value: R.benefitMonthly, color: C.purple },
    { label: '現有資產', value: R.holdingsMonthly, color: C.gold },
    { label: '定期投資', value: R.portfolioMonthly, color: C.navyL },
    { label: esc(state.spouse.name), value: R.spouseTotal, color: '#C79BB8' },
  ].filter((d) => d.value > 0);
  // 3. 退休後資產池
  const cf = lineChart({
    series: [{ points: R.cashflow.map((d) => ({ x: d.age, y: d.pool })), color: C.red, fill: 'rgba(201,74,74,.08)' }],
    xFmt: (x) => `${x}歲`, ...size,
    marks: [{ x: Math.min(me.lifeAge, R.cashflow[R.cashflow.length - 1].age), label: `預期壽命 ${me.lifeAge.toFixed(0)}`, color: C.muted }],
  });
  // 4. 三情境
  const scen = R.scenarios;
  const scenColors = [C.red, C.navy, C.green];
  const scenChart = lineChart({
    series: [-2, 0, 2].map((d, i) => ({
      points: Array.from({ length: R.n + 1 }, (_, t) => ({ x: me.age + t, y: investAt(t, d) })), color: scenColors[i], dash: d !== 0,
    })),
    xFmt: (x) => `${x}歲`, ...size,
  });
  // 5. 通膨購買力
  const yrs = Math.max(1, Math.round(me.lifeAge - s.retireAge));
  const cpi = state.cpi / 100;
  const real = Array.from({ length: yrs + 1 }, (_, k) => ({ x: s.retireAge + k, y: R.total / Math.pow(1 + cpi, k) }));
  const halfIdx = real.findIndex((p) => p.y <= R.total / 2);
  const realChart = lineChart({
    series: [{ points: real, color: '#E07A50', fill: 'rgba(224,122,80,.1)' }],
    ...size, xFmt: (x) => `${x}歲`, yFmt: (v) => `${Math.round(v / 1000)}k`,
    marks: halfIdx > 0 ? [{ x: real[halfIdx].x, label: '購買力減半', color: C.red }] : [],
  });
  // 6. 健康期 vs 全壽命
  const healthY = Math.max(0, me.healthAge - s.retireAge), lifeY = Math.max(0, me.lifeAge - s.retireAge);
  const totH = R.total * 12 * healthY, totL = R.total * 12 * lifeY;

  return `
  <h2 class="page-title">分析圖表</h2>
  <section class="card"><div class="card-h"><h3>${badge('trend', 'rgba(58,95,138,.12)', C.navyL)}投資資產累積</h3></div>
    ${R.investPool > 0 ? growth : '<p class="note">尚未設定投資資產。</p>'}
    <div class="chart-legend"><span><i style="background:${C.navy}"></i>投資資產池（名目）</span>${needPool > 0 ? `<span><i style="background:${C.red}"></i>支應生活費缺口所需 ${wan(needPool)}</span>` : ''}</div>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('chart', 'rgba(232,184,75,.18)', '#9A7210')}月領來源</h3><span class="hint">合計 ${money(R.total)}</span></div>
    <div class="donut-wrap">${donut(parts)}
      <div class="lg">${parts.map((d) => `<div class="bar-row"><div class="lbl"><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${d.color};margin-right:6px"></i>${d.label}</span><b>${money(d.value)}</b></div>
        <div class="meter" style="margin:0"><i style="width:${(d.value / Math.max(...parts.map((p) => p.value))) * 100}%;background:${d.color}"></i></div></div>`).join('')}</div></div>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('hourglass', 'rgba(201,74,74,.1)', C.red)}退休後投資資產池</h3>
      <span class="hint">${R.investMonthly <= 0 ? '無投資提領' : R.runoutAge ? `<b style="color:var(--red)">約 ${R.runoutAge} 歲用完</b>` : '<b style="color:var(--green)">可支撐到 100 歲以上</b>'}</span></div>
    ${R.investPool > 0 ? cf : '<p class="note">尚未設定投資資產。</p>'}
    <p class="note">每年固定提領投資月領 ${money(R.investMonthly)} × 12，剩餘資產以年化 ${pct(state.postReturn)} 滾存。</p>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('trend', 'rgba(122,107,184,.12)', C.purple)}報酬率情境比較</h3></div>
    <div class="stats">${scen.map((x, i) => `<div class="stat"><small style="color:${scenColors[i]};font-weight:700">${x.delta < 0 ? '悲觀' : x.delta > 0 ? '樂觀' : '基準'}（${x.delta > 0 ? '+' : ''}${x.delta}%）</small><strong>${money(x.monthly)}</strong><small>資產池 ${wan(x.pool)}</small></div>`).join('')}</div>
    ${R.investPool > 0 ? scenChart : ''}
    <p class="note">所有投資資產的預期報酬同時調低或調高 2 個百分點；保底收入不變。</p>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('receipt', 'rgba(224,122,80,.12)', '#C0622A')}通膨侵蝕：月領的實質購買力</h3></div>
    <div class="stats">
      <div class="stat"><small>退休當年</small><strong>${money(R.total)}</strong></div>
      <div class="stat"><small>${halfIdx > 0 ? `${real[halfIdx].x} 歲減半` : '購買力減半'}</small><strong>${money(R.total / 2)}</strong></div>
      <div class="stat bad"><small>${Math.round(me.lifeAge)} 歲時</small><strong>${money(real[real.length - 1].y)}</strong></div>
    </div>
    ${realChart}
    <p class="note">假設月領金額固定不變、通膨 ${pct(state.cpi)}。實際上勞保年金會在累計 CPI 成長達 5% 時調整，可抵銷部分侵蝕。</p>
  </section>
  <section class="card"><div class="card-h"><h3>${badge('user', 'rgba(63,154,110,.12)', C.green)}健康期與全壽命總領</h3></div>
    ${[[`健康期（${s.retireAge}–${me.healthAge.toFixed(0)} 歲）`, totH, healthY], [`全壽命（${s.retireAge}–${me.lifeAge.toFixed(0)} 歲）`, totL, lifeY]].map(([l, v, y]) => `
      <div class="bar-row"><div class="lbl"><span>${l}</span><b>${wan(v)}</b></div>
      <div class="meter"><i style="width:${totL ? (v / totL) * 100 : 0}%;background:${C.green}"></i></div>
      <p class="note" style="margin:-6px 0 0">${y.toFixed(1)} 年 × ${money(R.total)} × 12 個月</p></div>`).join('')}
    <p class="note">能自由活動的健康期，比全部餘命短得多；旅遊等開銷宜集中規劃在前段。</p>
  </section>`;
}

function investAt(t, d) {
  let pool = 0;
  for (const h of state.holdings) pool += growLump(holdingValue(h, state.fx), t, h.rate + d);
  for (const p of state.portfolios) for (const a of p.assets) {
    const r = (a.rate + d) / 100 / 12, n = 12 * t;
    pool += a.monthly <= 0 || t <= 0 ? 0 : r === 0 ? a.monthly * n : a.monthly * (Math.pow(1 + r, n) - 1) / r;
  }
  return pool;
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
      <div class="legend">${parts.map((p) => `<div><span><i style="background:${p[2]}"></i>${p[0]}</span><b>${money(p[1])}</b></div>`).join('')}</div>
    </div>
    <div class="card">
      <div class="card-h" style="margin-bottom:8px"><h3 style="font-size:13px">月領 vs 生活費</h3><span class="hint">退休當年名目</span></div>
      <div class="bar-row"><div class="lbl"><span>退休月領</span><b>${money(R.total)}</b></div>
        <div class="meter"><i style="width:${Math.min(100, (R.total / Math.max(R.total, R.expenseAtRetire, 1)) * 100)}%;background:${covColor}"></i></div></div>
      <div class="bar-row"><div class="lbl"><span>生活費（通膨後）</span><b>${money(R.expenseAtRetire)}</b></div>
        <div class="meter"><i style="width:${Math.min(100, (R.expenseAtRetire / Math.max(R.total, R.expenseAtRetire, 1)) * 100)}%;background:${C.muted}"></i></div></div>
      ${R.expenseToday <= 0 ? '<p class="note">尚未設定生活費。</p>' : gap >= 0
        ? `<div class="alert good"><b>足以支應，每月多出 ${money(gap)}</b><p>覆蓋率 ${Math.round(cov * 100)}%</p></div>`
        : `<div class="alert bad"><b>每月缺口 ${money(-gap)}</b><p>覆蓋率 ${Math.round(cov * 100)}%，可到「目標反算」看要補多少。</p></div>`}
    </div>
    <div class="card" style="padding:12px 18px">
      <div class="kv"><span>距退休</span><b>${R.n} 年</b></div>
      <div class="kv"><span>提領月數</span><b>${me.payoutMonths} 個月</b></div>
      <div class="kv"><span>健康期（退休後）</span><b>${Math.max(0, me.healthAge - state.self.retireAge).toFixed(1)} 年</b></div>
      <div class="kv"><span>財務自由年齡</span><b>${R.fireAge === null ? '—' : `${R.fireAge} 歲`}</b></div>
    </div>
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
  $('#tabs').innerHTML = TABS.map(([k, l, ic]) =>
    `<button type="button" class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}"><span class="ic">${icon(ic)}</span>${l}</button>`).join('');
}
function renderPage() {
  const main = $('#main');
  main.innerHTML = PAGES[tab]();
}
function refreshOutputs() {
  for (const el of $$('[data-o]')) el.innerHTML = outVal(el.dataset.o);
  for (const el of $$('[data-v]')) el.textContent = fmtV(getPath(state, el.dataset.v), el.dataset.unit);
  for (const el of $$('[data-k]')) {
    if (el === document.activeElement) continue;
    const v = getPath(state, el.dataset.k);
    if (el.type !== 'file' && String(el.value) !== String(v ?? '')) el.value = v ?? '';
  }
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

function parseVal(el) {
  const t = el.dataset.t;
  if (t === 'str') return el.value;
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
  // 離開欄位後，輸出分頁補一次整頁重繪
  if (e.target.matches?.('#main [data-k]') && OUTPUT_ONLY.has(tab)) setTimeout(() => {
    if (!$('#main').contains(document.activeElement)) { renderPage(); refreshOutputs(); }
  });
});

document.addEventListener('click', (e) => {
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
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (PAGES[h] && h !== tab) { tab = h; renderTabs(); renderPage(); refreshOutputs(); }
});
renderTabs();
renderPage();
refreshOutputs();
renderAside();
