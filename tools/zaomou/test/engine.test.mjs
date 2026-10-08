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
