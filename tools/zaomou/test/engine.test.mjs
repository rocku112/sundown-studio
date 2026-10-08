// node --test tools/zaomou/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  growLump, growMonthly, monthlyForTarget, makePayout, laborInsurance, insuranceGrade,
  oldSystemUnits, laborPensionAccount, holdingValue, compute,
} from '../js/engine.js';
import { defaults, normalize, migrateLegacy, parseImport } from '../js/state.js';
import { legalPensionAge } from '../js/data.js';

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('複利：定期定額終值與反算互為逆運算', () => {
  near(growMonthly(10000, 25, 7), 8100717, 5);
  near(monthlyForTarget(growMonthly(10000, 25, 7), 25, 7), 10000, 0.01);
  assert.equal(growMonthly(1000, 10, 0), 120000);
  near(growLump(100, 1, 12), 112.68, 0.01);
});

test('提領：除數法與年金化', () => {
  const d = makePayout(240, 'divisor', 3);
  assert.equal(d.toMonthly(2400000), 10000);
  const a = makePayout(240, 'annuity', 3);
  near(a.toMonthly(a.toPool(12345)), 12345, 1e-6);
  assert.ok(a.toMonthly(2400000) > 10000, '有報酬時年金化月領應高於除數法');
});

test('勞保投保薪資分級（115 年 11 級）', () => {
  assert.deepEqual(insuranceGrade(25000), { grade: 1, salary: 29500 });
  assert.deepEqual(insuranceGrade(29501), { grade: 2, salary: 30300 });
  assert.deepEqual(insuranceGrade(200000), { grade: 11, salary: 45800 });
});

test('勞保老年年金：A/B 式擇優、請領年齡與調整', () => {
  assert.equal(legalPensionAge(1990), 65);
  assert.equal(legalPensionAge(1959), 62);
  const r = laborInsurance({ base: 45800, years: 40, birthYear: 1990, claimAge: 65 });
  assert.equal(r.formula, 'B');
  assert.equal(r.monthly, Math.round(45800 * 40 * 0.0155));
  const early = laborInsurance({ base: 45800, years: 30, birthYear: 1990, claimAge: 60 });
  near(early.adj, -0.2, 1e-9);
  const tooEarly = laborInsurance({ base: 45800, years: 30, birthYear: 1990, claimAge: 55 });
  assert.equal(tooEarly.startAge, 60, '最早只能提前 5 年');
  const late = laborInsurance({ base: 45800, years: 30, birthYear: 1990, claimAge: 72 });
  near(late.adj, 0.2, 1e-9);
  const lowYears = laborInsurance({ base: 30000, years: 10, birthYear: 1990, claimAge: 65 });
  assert.equal(lowYears.kind, 'lump');
  // 15 年 × 最低級距時 A 式 = 29500×15×0.775%+3000
  const low = laborInsurance({ base: 29500, years: 15, birthYear: 1990, claimAge: 65 });
  assert.equal(low.a, Math.round(29500 * 15 * 0.00775 + 3000));
});

test('舊制基數', () => {
  assert.equal(oldSystemUnits(10), 20);
  assert.equal(oldSystemUnits(20), 35);
  assert.equal(oldSystemUnits(40), 45);
});

test('勞退：提繳工資上限 15 萬', () => {
  const hi = laborPensionAccount({ salary: 300000, growthPct: 0, selfRate: 0, returnPct: 0, workStartAge: 30, age: 30, retireAge: 31, nowYear: 2026, balance: null });
  assert.equal(hi.pool, 150000 * 0.06 * 12);
  const bal = laborPensionAccount({ salary: 50000, growthPct: 0, selfRate: 6, returnPct: 0, workStartAge: 23, age: 40, retireAge: 40, nowYear: 2026, balance: 1234567 });
  assert.equal(bal.pool, 1234567);
});

test('持股市值：台股以張計、美股換匯', () => {
  assert.equal(holdingValue({ kind: 'tw', shares: 2, price: 100 }, 32), 200000);
  assert.equal(holdingValue({ kind: 'us', shares: 10, price: 100 }, 32), 32000);
  assert.equal(holdingValue({ kind: 'cash', amount: 5000 }, 32), 5000);
});

test('整體試算：數字一致性', () => {
  const s = defaults(2026);
  const r = compute(s, 2026);
  assert.equal(r.me.age, 35);
  assert.equal(r.n, 30);
  assert.equal(r.total, r.floor + r.investMonthly + r.spouseTotal);
  assert.ok(r.total > 0 && r.totalPV < r.total);
  near(r.investMonthly, r.me.payout.toMonthly(r.investPool), 2);
  // 增加定期投入，月領只會增加
  s.portfolios[0].assets[0].monthly += 10000;
  assert.ok(compute(s, 2026).total > r.total);
  // 三情境單調
  assert.ok(r.scenarios[0].monthly <= r.scenarios[1].monthly && r.scenarios[1].monthly <= r.scenarios[2].monthly);
});

test('配偶以自己的年齡計算，報酬率不會被重複除以 100', () => {
  const s = defaults(2026);
  s.spouse.enabled = true;
  s.spouse.birthYear = 1966; // 60 歲，只剩 5 年
  const r = compute(s, 2026);
  assert.equal(r.spouse.age, 60);
  assert.equal(r.spouse.yearsToRetire, 5);
  assert.ok(r.spouse.laborRetire > 1000, `勞退月領 ${r.spouse.laborRetire} 不合理地小`);
});

test('反算：已有規劃足夠時不需加碼', () => {
  const s = defaults(2026);
  s.targetMonthly = 1;
  assert.equal(compute(s, 2026).reverse.extraMonthly, 0);
});

test('退休後現金流：沒有投資資產不誤報耗盡', () => {
  const s = defaults(2026);
  s.holdings = []; s.portfolios = [];
  assert.equal(compute(s, 2026).runoutAge, null);
});

test('狀態：normalize 補齊欄位、舊版遷移、匯入', () => {
  const s = normalize({ self: { salary: '60000' }, holdings: [{ name: 'x' }] });
  assert.equal(s.self.salary, 60000);
  assert.equal(s.self.retireAge, 65);
  assert.equal(s.holdings[0].kind, 'tw');
  const m = migrateLegacy({
    birthDate: '1989-01-12', gender: 'female', cpiPct: 2.5, spouseOn: true, spouseGradeSalary: 50000,
    portfolios: [{ id: 'p1', groupName: 'G', assets: [{ id: 'a1', name: 'VTI', monthly: 1000, rate: 7 }] }],
    initialAssets: [{ id: 'i2', name: '存款', inputMode: 'value', amount: 1e6, rate: 1.5 }],
  });
  assert.equal(m.self.birthYear, 1989);
  assert.equal(m.cpi, 2.5);
  assert.equal(m.spouse.salary, 50000);
  assert.equal(m.portfolios[0].name, 'G');
  assert.equal(m.holdings[0].kind, 'cash');
  assert.equal(parseImport(JSON.stringify(defaults(2026))).schema, 2);
  assert.throws(() => parseImport('{"foo":1}'));
});

import { lifecycle, sensitivity, retireAgeOptions } from '../js/engine.js';

test('全生命週期：退休前遞增、與 compute 的資產池一致', () => {
  const s = defaults(2026);
  const lc = lifecycle(s, 2026);
  const save = lc.points.filter((p) => p.phase === 'save');
  assert.equal(save[0].age, 35);
  assert.equal(save[save.length - 1].age, 65);
  for (let i = 1; i < save.length; i++) assert.ok(save[i].pool >= save[i - 1].pool);
  near(save[save.length - 1].pool, compute(s, 2026).investPool, 1);
  // 悲觀情境資產池較小
  assert.ok(lifecycle(s, 2026, -2).pool < lc.pool);
});

test('敏感度：方向正確、依影響排序', () => {
  const s = defaults(2026);
  s.self.selfRate = 3;
  const rows = sensitivity(s, 2026);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.ok(by.invest.high > 0 && by.invest.low < 0);
  assert.ok(by.return.high > 0 && by.return.low < 0);
  assert.ok(by.selfRate.high > 0 && by.selfRate.low < 0);
  assert.ok(by.retire.high > 0, '晚退休月領應增加');
  assert.ok(by.cpi.high < 0, '通膨變高，今日幣值月領應下降');
  const span = (r) => Math.max(Math.abs(r.low), Math.abs(r.high));
  for (let i = 1; i < rows.length; i++) assert.ok(span(rows[i - 1]) >= span(rows[i]));
  // 不改動原狀態
  assert.equal(s.portfolios.length, 1);
});

test('退休年齡比較：只列未來年齡、標出目前設定', () => {
  const s = defaults(2026);
  s.self.birthYear = 1964; // 62 歲
  const opts = retireAgeOptions(s, 2026);
  assert.deepEqual(opts.map((o) => o.retireAge), [65, 67, 70]);
  assert.ok(opts.find((o) => o.retireAge === 65).current);
  assert.ok(opts[2].totalPV > opts[0].totalPV);
});

import { goalPlan } from '../js/engine.js';

test('目標反算：各補足方式真的能達標', () => {
  const s = defaults(2026);
  s.targetMonthly = 90000; // 今日幣值，高於目前規劃
  const g = goalPlan(s, 2026);
  assert.ok(g.gapPV > 0 && g.progress < 1);
  // 每月加碼：照建議金額加一筆投資，應剛好達標
  const a = JSON.parse(JSON.stringify(s));
  a.portfolios.push({ id: 'x', name: 'x', assets: [{ id: 'x', name: 'x', monthly: g.extraMonthly + 1, rate: s.investReturn }] });
  assert.ok(compute(a, 2026).totalPV >= s.targetMonthly - 1);
  // 一次投入：以現金資產投入，報酬同新增投資
  const b = JSON.parse(JSON.stringify(s));
  b.holdings.push({ id: 'y', name: 'y', kind: 'cash', amount: g.lumpSum + 10, rate: s.investReturn });
  assert.ok(compute(b, 2026).totalPV >= s.targetMonthly - 1);
  // 延後退休
  if (g.retireAge) {
    const c = JSON.parse(JSON.stringify(s)); c.self.retireAge = g.retireAge;
    assert.ok(compute(c, 2026).totalPV >= s.targetMonthly);
    c.self.retireAge = g.retireAge - 1;
    assert.ok(compute(c, 2026).totalPV < s.targetMonthly, '應找最早達標的年齡');
  }
  assert.ok(g.requiredReturn > 0);
  assert.ok(g.selfRate6.gain > 0 && g.selfRate6.monthlyCost === 2700);
});

test('目標反算：已達標時不需補足', () => {
  const s = defaults(2026);
  s.targetMonthly = 10000;
  const g = goalPlan(s, 2026);
  assert.equal(g.gapPV, 0);
  assert.equal(g.extraMonthly, 0);
  assert.equal(g.retireAge, null);
});

import { avgInsuredSalary } from '../js/engine.js';

test('勞保平均投保薪資：隨薪資成長升級、上限 45,800', () => {
  assert.equal(avgInsuredSalary(30000, 0, 30), 30300);           // 不成長：維持目前級距
  assert.equal(avgInsuredSalary(30000, 2, 30), 45800);           // 30 年後早已超過上限
  assert.equal(avgInsuredSalary(80000, 2, 10), 45800);
  const near = avgInsuredSalary(36000, 2, 1);                    // 只剩 1 年：混合過去 4 年回推月薪
  assert.ok(near > 33300 && near <= 38200, `${near}`);
  // 整體試算：自動模式比手動固定目前級距高
  const s = defaults(2026);
  s.self.salary = 30000;
  const auto = compute(s, 2026).me.insMonthly;
  s.self.insMode = 'manual'; s.self.insGrade = 2; // 30,300
  assert.ok(auto > compute(s, 2026).me.insMonthly);
});

test('提早退休空窗期：勞退滿 60、勞保最早提前 5 年', () => {
  const s = defaults(2026);
  s.self.retireAge = 55;
  const r = compute(s, 2026);
  assert.equal(r.me.bridge.laborStart, 60);
  assert.equal(r.me.bridge.insStart, 60);                 // 1991 年生，法定 65，最早 60
  assert.equal(r.me.bridge.years, 5);
  assert.equal(r.me.bridge.missing, Math.round((r.me.insMonthly + r.me.laborRetire) * 5 * 12));
  // 勞退專戶多滾 5 年、少領 5 年，月領應高於「55 歲直接攤提」
  const naive = r.me.payout.toMonthly(r.me.acct.pool);
  assert.ok(r.me.laborRetire > naive);
  // 60 歲以後退休沒有空窗
  s.self.retireAge = 65;
  assert.equal(compute(s, 2026).me.bridge.years, 0);
  assert.equal(compute(s, 2026).me.bridge.missing, 0);
});

import { validate } from '../js/engine.js';

test('欄位檢查：預設值無錯誤、矛盾輸入被抓出', () => {
  const s = defaults(2026);
  assert.deepEqual(validate(s, 2026).filter((x) => x.level !== 'info'), []);
  const lv = (st, f) => validate(st, 2026).find((x) => x.field === f)?.level;
  const a = defaults(2026); a.self.workStartAge = 66;
  assert.equal(lv(a, 'self.workStartAge'), 'error');
  const b = defaults(2026); b.self.birthYear = 2006; b.self.workStartAge = 23; // 20 歲、尚未工作
  assert.equal(lv(b, 'self.workStartAge'), 'info');
  const c = defaults(2026); c.self.retireAge = 30;
  assert.equal(lv(c, 'self.retireAge'), 'warn');
  const d = defaults(2026); d.self.birthYear = 75; // 民國年誤填
  assert.equal(lv(d, 'self.birthYear'), 'error');
  assert.match(validate(d, 2026)[0].msg, /西元 1986 年/);
  assert.equal(validate(d, 2026).length, 1, '出生年有誤時不再連帶報其他欄位');
  const e = defaults(2026); e.self.oldSystemYears = 5; // 1991 年生，94 年時 14 歲
  assert.equal(lv(e, 'self.oldSystemYears'), 'error');
  const f = defaults(2026); f.self.birthYear = 1966; f.self.workStartAge = 22; f.self.oldSystemYears = 30; // 最多約 17 年
  assert.equal(lv(f, 'self.oldSystemYears'), 'warn');
  const g = defaults(2026); g.lifeAgeOverride = 60;
  assert.equal(lv(g, 'lifeAgeOverride'), 'error');
  const h = defaults(2026); h.spouse.enabled = true; h.spouse.salary = 0;
  assert.equal(lv(h, 'spouse.salary'), 'warn');
});

import { scenarioSummary } from '../js/engine.js';

test('方案摘要：與 compute 一致、晚退休數字較高', () => {
  const s = defaults(2026);
  const a = scenarioSummary(s, 2026);
  const r = compute(s, 2026);
  assert.equal(a.total, r.total);
  assert.equal(a.totalPV, r.totalPV);
  assert.equal(a.monthlyInvest, 10000);
  const b = JSON.parse(JSON.stringify(s)); b.self.retireAge = 67;
  assert.ok(scenarioSummary(b, 2026).totalPV > a.totalPV);
  s.monthlyExpense = 0;
  assert.equal(scenarioSummary(s, 2026).coverage, null);
});

import { incomeTax, selfContributionTax } from '../js/engine.js';

test('綜所稅級距（115 年度公告）', () => {
  assert.equal(incomeTax(0), 0);
  assert.equal(incomeTax(610000), 30500);
  assert.equal(incomeTax(1380000), 30500 + 770000 * 0.12);       // = 122,900
  assert.equal(incomeTax(1380000), 122900);
  assert.equal(incomeTax(2770000), 400900);
  assert.equal(incomeTax(5190000), 1126900);
  assert.equal(incomeTax(6190000), 1126900 + 400000);
});

test('勞退自提節稅', () => {
  // 月薪 5 萬、自提 6%：年提 36,000；淨額 600,000−101,000−136,000−227,000=136,000 → 5% 級距
  const a = selfContributionTax(50000, 6);
  assert.equal(a.contrib, 36000);
  assert.equal(a.saving, 1800);
  assert.equal(a.marginal, 0.05);
  // 月薪 15 萬：淨額 1,800,000−464,000=1,336,000 → 12%；提撥 108,000 全落在 12% 級距
  const b = selfContributionTax(150000, 6);
  assert.equal(b.saving, Math.round(108000 * 0.12));
  // 免稅：月薪 3 萬（淨額為負）
  assert.equal(selfContributionTax(30000, 6).saving, 0);
  // 提繳工資上限 15 萬
  assert.equal(selfContributionTax(300000, 6).contrib, 108000);
});

import { dataStale, DATA_YEAR } from '../js/data.js';

test('參數年度過期判斷', () => {
  assert.equal(dataStale(DATA_YEAR + 1911), false);
  assert.equal(dataStale(DATA_YEAR + 1912), true);
});

test('勞保打折壓力測試', () => {
  const s = defaults(2026);
  const full = compute(s, 2026);
  s.insHaircut = 30;
  const cut = compute(s, 2026);
  assert.equal(cut.me.insMonthly, Math.round(full.me.insMonthly * 0.7));
  assert.equal(cut.me.insFull, full.me.insMonthly);
  assert.equal(full.total - cut.total, full.me.insMonthly - cut.me.insMonthly);
  s.spouse.enabled = true;
  const sp = compute(s, 2026);
  assert.equal(sp.spouse.insMonthly, Math.round(sp.spouse.insFull * 0.7), '配偶同樣打折');
  // 敏感度：勞保打 8 折為負、照現制為 0
  const row = sensitivity(defaults(2026), 2026).find((r) => r.key === 'ins');
  assert.ok(row.low < 0 && row.high === 0);
});

import { careCostAt } from '../js/engine.js';

test('晚年照護支出：提早用完資產、照護期缺口', () => {
  const s = defaults(2026);
  const base = lifecycle(s, 2026);
  assert.equal(careCostAt(s, 85, 35), 0, '未啟用時為 0');
  s.care.enabled = true; // 80 歲起每月 3 萬（今日幣值）
  assert.equal(careCostAt(s, 79, 35), 0);
  near(careCostAt(s, 80, 35), 30000 * 12 * Math.pow(1.02, 45), 1);
  const withCare = lifecycle(s, 2026);
  assert.ok(withCare.runoutAge < base.runoutAge, `${withCare.runoutAge} 應早於 ${base.runoutAge}`);
  const r = compute(s, 2026);
  assert.equal(r.care.startAge, 80);
  near(r.care.need, (31000 + 30000) * Math.pow(1.02, 45), 1);
  assert.equal(r.care.gap, r.care.need - r.total);
  // 退休前的月領與資產池不受影響
  assert.equal(r.total, compute(defaults(2026), 2026).total);
});

import { eventsPoolAt } from '../js/engine.js';

test('人生重大事件：退休前支出降低資產池、退休後收入延長可撐年齡', () => {
  const s = defaults(2026); // 35 歲，65 退休
  const base = compute(s, 2026);
  s.events = [{ id: 'e1', name: '頭期款', age: 40, amount: 1000000, kind: 'out' }];
  const r = compute(s, 2026);
  // 支出 100 萬（今日幣值）在 40 歲發生：名目 100萬×1.02^5，之後以新增投資報酬 6% 複利 25 年
  const expect = 1000000 * Math.pow(1.02, 5) * Math.pow(1 + 0.06 / 12, 12 * 25);
  near(base.investPool - r.investPool, expect, 2);
  assert.ok(r.eventsMonthly < 0 && r.total < base.total);
  // 退休後的繼承收入讓資產撐更久
  const t = defaults(2026);
  const lc0 = lifecycle(t, 2026);
  t.events = [{ id: 'e2', name: '繼承', age: 80, amount: 3000000, kind: 'in' }];
  const lc1 = lifecycle(t, 2026);
  assert.ok(lc1.runoutAge === null || lc1.runoutAge > lc0.runoutAge);
  assert.equal(compute(t, 2026).total, compute(defaults(2026), 2026).total, '退休後事件不影響月領');
  // 已過去的事件不計入、並提出警告
  const u = defaults(2026); u.events = [{ id: 'e3', name: '舊事', age: 30, amount: 100000, kind: 'out' }];
  assert.equal(eventsPoolAt(u, 30, 0, 35), 0);
  assert.ok(validate(u, 2026).some((x) => x.field === 'events'));
});

import { monteCarlo } from '../js/engine.js';

test('蒙地卡羅：可重現、波動 0 時等於確定性、波動越大成功率不升', () => {
  const s = defaults(2026);
  const a = monteCarlo(s, 2026, { sims: 500 });
  const b = monteCarlo(s, 2026, { sims: 500 });
  assert.equal(a.success, b.success, '同種子結果相同');
  assert.ok(a.success >= 0 && a.success <= 1);
  // 波動 0：與確定性路徑接近（年複利 vs 月複利有小差異），且必然成功（確定性 92 歲才用完、預期壽命 83）
  const z = monteCarlo(s, 2026, { sims: 50, vol: 0 });
  assert.equal(z.success, 1);
  const det = compute(s, 2026).investPool;
  assert.ok(Math.abs(z.atRetire.p50 - det) / det < 0.06, `${z.atRetire.p50} vs ${det}`);
  // 中位數約等於基準（扣除波動拖累後）
  const m = monteCarlo(s, 2026, { sims: 2000, vol: 12 });
  assert.ok(Math.abs(m.atRetire.p50 - z.atRetire.p50) / z.atRetire.p50 < 0.12, `${m.atRetire.p50} vs ${z.atRetire.p50}`);
  assert.ok(m.band[30].p10 < m.band[30].p50 && m.band[30].p50 < m.band[30].p90);
  const hi = monteCarlo(s, 2026, { sims: 2000, vol: 20 });
  assert.ok(hi.success <= m.success + 0.01);
  // 沒有投資資產時不模擬
  const e = defaults(2026); e.holdings = []; e.portfolios = [];
  assert.equal(monteCarlo(e, 2026), null);
});

import { actionPlan } from '../js/engine.js';

test('行動清單：依狀況出現、可套用、排序', () => {
  const s = defaults(2026);
  s.targetMonthly = 90000;
  s.holdings[1].amount = 50000; // 現金只有 5 萬，不足 6 個月生活費
  const ids = actionPlan(s, 2026).map((a) => a.id);
  for (const k of ['gap', 'selfRate', 'emergency', 'balance', 'stress', 'review']) assert.ok(ids.includes(k), k);
  assert.ok(!ids.includes('bridge') && !ids.includes('invest'));
  const levels = actionPlan(s, 2026).map((a) => a.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => ({ high: 0, mid: 1, low: 2 })[a] - ({ high: 0, mid: 1, low: 2 })[b]));
  // 改善後項目消失
  s.self.selfRate = 6; s.targetMonthly = 10000; s.self.laborBalance = 500000;
  s.holdings.push({ id: 'c', name: '現金', kind: 'cash', amount: 300000, rate: 1 });
  const ids2 = actionPlan(s, 2026).map((a) => a.id);
  for (const k of ['gap', 'selfRate', 'emergency', 'balance']) assert.ok(!ids2.includes(k), k);
  // 提早退休出現空窗期；成功率低時出現安全邊際
  const t = defaults(2026); t.self.retireAge = 55;
  assert.ok(actionPlan(t, 2026, { success: 0.6 }).some((a) => a.id === 'bridge'));
  assert.equal(actionPlan(t, 2026, { success: 0.6 }).find((a) => a.id === 'mc').level, 'high');
});

import { planPath, expectedAt, trackProgress } from '../js/engine.js';

test('進度追蹤：基準路徑、內插、超前落後', () => {
  const s = defaults(2026);
  const path = planPath(s, 2026);
  assert.equal(path[0].year, 2026);
  assert.equal(path.length, 31);
  near(path[0].invest, 800000, 1);                    // 現值：台股 2 張×150×1000 + 存款 50 萬
  near(path[30].invest, compute(s, 2026).investPool, 2);
  assert.ok(path[5].labor > path[0].labor);
  const baseline = { createdAt: '2026-10-08', path };
  const mid = expectedAt(baseline, '2027-01-01');
  assert.ok(mid.invest > path[0].invest && mid.invest < path[1].invest);
  const rows = trackProgress({ baseline, checkins: [
    { id: 'b', date: '2028-01-01', invest: 0, labor: 0 },
    { id: 'a', date: '2027-01-01', invest: mid.invest * 1.1, labor: mid.labor },
  ] });
  assert.equal(rows[0].id, 'a', '依日期排序');
  assert.ok(rows[0].diff > 0 && Math.abs(rows[0].ratio - (mid.invest * 1.1 + mid.labor) / (mid.invest + mid.labor)) < 1e-9);
  assert.ok(rows[1].diff < 0);
  assert.deepEqual(trackProgress({ baseline: null, checkins: [] }), []);
});

import { templates } from '../js/state.js';

test('快速開始範本：皆可計算、無錯誤級檢查、各有特色', () => {
  const list = templates(2026);
  assert.equal(list.length, 5);
  for (const t of list) {
    const s = t.make();
    const r = compute(s, 2026);
    assert.ok(Number.isFinite(r.total) && r.total > 0, t.id);
    assert.deepEqual(validate(s, 2026).filter((x) => x.level === 'error'), [], t.id);
  }
  const fire = list.find((t) => t.id === 'fire').make();
  assert.ok(compute(fire, 2026).me.bridge.years > 0, '提早退休範本應有空窗期');
  assert.ok(list.find((t) => t.id === 'family').make().spouse.enabled);
});
