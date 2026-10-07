/* 早謀遠算 · 計算引擎
   純函式，不碰 DOM，可在 node 直接測試（見 test/engine.test.mjs）。
   金額單位一律為新台幣元；「月領」皆為退休當年的名目金額，另附今日幣值換算。 */

import {
  INSURANCE_GRADES, PENSION_WAGE_MAX, EMPLOYER_RATE, NEW_SYSTEM_START,
  legalPensionAge, PENSION_ADJ_PER_YEAR, PENSION_ADJ_MAX_YEARS, PENSION_MIN_YEARS, LIFE_TABLE,
} from './data.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/* ── 基礎財務函式 ─────────────────────────────── */

/** 單筆現值以月複利滾 years 年 */
export function growLump(pv, years, ratePct) {
  if (pv <= 0 || years <= 0) return Math.max(0, pv);
  return pv * Math.pow(1 + ratePct / 100 / 12, 12 * years);
}

/** 每月期末投入 monthly，月複利滾 years 年後的終值 */
export function growMonthly(monthly, years, ratePct) {
  if (monthly <= 0 || years <= 0) return 0;
  const r = ratePct / 100 / 12, n = 12 * years;
  return r === 0 ? monthly * n : monthly * (Math.pow(1 + r, n) - 1) / r;
}

/** 要在 years 年後累積到 fv，每月需投入多少 */
export function monthlyForTarget(fv, years, ratePct) {
  if (fv <= 0) return 0;
  if (years <= 0) return Infinity;
  const r = ratePct / 100 / 12, n = 12 * years;
  return r === 0 ? fv / n : fv * r / (Math.pow(1 + r, n) - 1);
}

/** 退休提領方式：把資產池換成每月可領金額（及反算） */
export function makePayout(months, mode, postReturnPct) {
  const n = Math.max(1, months);
  const r = postReturnPct / 100 / 12;
  if (mode === 'annuity' && r > 0) {
    const f = (1 - Math.pow(1 + r, -n)) / r; // 年金現值因子
    return { toMonthly: (pool) => pool / f, toPool: (m) => m * f, months: n };
  }
  return { toMonthly: (pool) => pool / n, toPool: (m) => m * n, months: n };
}

/* ── 年齡與生命表 ─────────────────────────────── */

export function lifeExpectancyAt(gender, age) {
  const t = (LIFE_TABLE[gender] || LIFE_TABLE.male).ex;
  if (t[age] !== undefined) return t[age];
  return Math.max(5, t[65] - 0.72 * (age - 65));
}

export function insuranceGrade(salary) {
  const i = INSURANCE_GRADES.findIndex((g) => salary <= g);
  const idx = i === -1 ? INSURANCE_GRADES.length - 1 : i;
  return { grade: idx + 1, salary: INSURANCE_GRADES[idx] };
}

/* ── 法定給付 ─────────────────────────────────── */

/** 勞保老年給付：滿 15 年請領年金（A/B 式擇優，提前／延後 ±4%/年）；未滿請領一次金 */
export function laborInsurance({ base, years, birthYear, claimAge }) {
  const y = Math.max(0, years);
  const legal = legalPensionAge(birthYear);
  if (y < PENSION_MIN_YEARS) {
    // 一次金：每滿 1 年給付 1 個月平均投保薪資（簡化，不計 60 歲後加計）
    return { kind: 'lump', lump: Math.round(base * y), monthly: 0, years: y, legal, startAge: claimAge, adj: 0 };
  }
  const a = base * y * 0.00775 + 3000;
  const b = base * y * 0.0155;
  const startAge = clamp(claimAge, legal - PENSION_ADJ_MAX_YEARS, legal + PENSION_ADJ_MAX_YEARS);
  const adj = (startAge - legal) * PENSION_ADJ_PER_YEAR;
  return {
    kind: 'annuity',
    formula: a >= b ? 'A' : 'B',
    a: Math.round(a), b: Math.round(b),
    monthly: Math.round(Math.max(a, b) * (1 + adj)),
    adj, legal, startAge, years: y,
  };
}

/** 勞退新制個人專戶：估算到退休時的累積金額 */
export function laborPensionAccount({ salary, growthPct, selfRate, returnPct, workStartAge, age, retireAge, nowYear, balance }) {
  const rate = (EMPLOYER_RATE + selfRate) / 100;
  const r = returnPct / 100 / 12;
  const g = Math.pow(1 + growthPct / 100, 1 / 12);
  const wage = (s) => Math.min(s, PENSION_WAGE_MAX);

  let acc;
  let pastYears = 0;
  if (balance !== null && balance !== undefined && balance !== '') {
    acc = Math.max(0, num(balance));
  } else {
    // 未提供餘額：依新制施行後的已工作年數倒推估算
    pastYears = Math.max(0, Math.min(age - workStartAge, nowYear - NEW_SYSTEM_START));
    acc = 0;
    const pastMonths = Math.round(pastYears * 12);
    for (let m = pastMonths; m > 0; m--) acc = (acc + wage(salary / Math.pow(g, m)) * rate) * (1 + r);
  }
  const futureMonths = Math.max(0, Math.round((retireAge - age) * 12));
  for (let m = 0; m < futureMonths; m++) acc = (acc + wage(salary * Math.pow(g, m)) * rate) * (1 + r);
  return { pool: acc, estimatedPast: pastYears, monthlyContrib: Math.round(wage(salary) * rate) };
}

/** 勞基法舊制退休金：前 15 年每年 2 基數，之後每年 1 基數，上限 45 基數 */
export function oldSystemUnits(years) {
  const y = Math.max(0, years);
  return Math.min(45, y <= 15 ? 2 * y : 30 + (y - 15));
}

/* ── 投資資產 ─────────────────────────────────── */

export function holdingValue(h, fx) {
  if (h.kind === 'cash') return Math.max(0, num(h.amount));
  if (h.kind === 'us') return Math.max(0, num(h.shares) * num(h.price) * num(fx, 32));
  return Math.max(0, num(h.shares) * 1000 * num(h.price)); // 台股以「張」計
}

/** 年 t 時投資資產池（現有資產 + 定期投入），rateDelta 用於情境分析 */
export function investPoolAt(state, t, rateDelta = 0) {
  let pool = 0;
  for (const h of state.holdings) pool += growLump(holdingValue(h, state.fx), t, num(h.rate) + rateDelta);
  for (const p of state.portfolios) for (const a of p.assets) pool += growMonthly(num(a.monthly), t, num(a.rate) + rateDelta);
  return pool;
}

/* ── 單人計算 ─────────────────────────────────── */

function person(p, ctx) {
  const age = ctx.nowYear - p.birthYear;
  const yearsToRetire = Math.max(0, p.retireAge - age);
  const table = LIFE_TABLE[p.gender] || LIFE_TABLE.male;
  const lifeAge = ctx.lifeAge ?? p.retireAge + lifeExpectancyAt(p.gender, p.retireAge);
  const healthAge = ctx.healthAge ?? table.healthAge;
  const payoutMonths = Math.max(12, Math.round((lifeAge - p.retireAge) * 12));
  const payout = makePayout(payoutMonths, ctx.payoutMode, ctx.postReturn);

  const base = p.insMode === 'manual' ? INSURANCE_GRADES[clamp(p.insGrade, 1, INSURANCE_GRADES.length) - 1] : insuranceGrade(p.salary).salary;
  const insYears = Math.max(0, p.retireAge - p.workStartAge);
  const ins = laborInsurance({ base, years: insYears, birthYear: p.birthYear, claimAge: p.retireAge });
  const insMonthly = ins.kind === 'annuity' ? ins.monthly : Math.round(payout.toMonthly(ins.lump));

  const acct = laborPensionAccount({
    salary: p.salary, growthPct: ctx.salaryGrowth, selfRate: p.selfRate, returnPct: p.laborReturn,
    workStartAge: p.workStartAge, age, retireAge: p.retireAge, nowYear: ctx.nowYear, balance: p.laborBalance,
  });
  const laborRetire = Math.round(payout.toMonthly(acct.pool));

  const finalSalary = p.salary * Math.pow(1 + ctx.salaryGrowth / 100, yearsToRetire);
  const units = oldSystemUnits(p.oldSystemYears);
  const oldLump = units * finalSalary;
  const oldMonthly = Math.round(payout.toMonthly(oldLump));

  return {
    age, yearsToRetire, lifeAge, healthAge, payout, payoutMonths,
    insBase: base, insGrade: insuranceGrade(base).grade, insYears, ins, insMonthly,
    acct, laborRetire, oldUnits: units, oldLump, oldMonthly, finalSalary,
    floor: insMonthly + laborRetire + oldMonthly,
  };
}

/* ── 主計算 ───────────────────────────────────── */

export function compute(state, nowYear = new Date().getFullYear()) {
  const ctx = {
    nowYear,
    salaryGrowth: num(state.salaryGrowth),
    payoutMode: state.payoutMode,
    postReturn: num(state.postReturn),
    lifeAge: state.lifeAgeOverride ?? null,
    healthAge: state.healthAgeOverride ?? null,
  };
  const me = person(state.self, ctx);
  const n = me.yearsToRetire;
  const cpi = num(state.cpi) / 100;
  const pvFactor = Math.pow(1 + cpi, -n);

  // 企業福利信託
  const benefitPool = state.benefit.enabled
    ? growMonthly(num(state.benefit.self) + num(state.benefit.company), n, num(state.benefit.rate))
    : 0;
  const benefitMonthly = Math.round(me.payout.toMonthly(benefitPool));

  // 投資資產
  const holdingsNow = state.holdings.reduce((s, h) => s + holdingValue(h, state.fx), 0);
  const holdingsPool = state.holdings.reduce((s, h) => s + growLump(holdingValue(h, state.fx), n, num(h.rate)), 0);
  const portfolioRows = state.portfolios.map((p) => {
    const assets = p.assets.map((a) => {
      const pool = growMonthly(num(a.monthly), n, num(a.rate));
      return { id: a.id, pool, monthly: Math.round(me.payout.toMonthly(pool)) };
    });
    return { id: p.id, assets, monthly: assets.reduce((s, a) => s + a.monthly, 0), pool: assets.reduce((s, a) => s + a.pool, 0) };
  });
  const portfolioPool = portfolioRows.reduce((s, p) => s + p.pool, 0);
  const monthlyInvest = state.portfolios.reduce((s, p) => s + p.assets.reduce((t, a) => t + num(a.monthly), 0), 0);
  const investPool = holdingsPool + portfolioPool;
  const holdingsMonthly = Math.round(me.payout.toMonthly(holdingsPool));
  const portfolioMonthly = Math.round(me.payout.toMonthly(portfolioPool));
  const investMonthly = holdingsMonthly + portfolioMonthly;

  // 配偶（各自以本人年齡、生命表計算）
  const spouse = state.spouse.enabled ? person(state.spouse, { ...ctx, lifeAge: null, healthAge: null }) : null;
  const spouseTotal = spouse ? spouse.floor : 0;

  const floor = me.floor + benefitMonthly;
  const selfTotal = floor + investMonthly;
  const total = selfTotal + spouseTotal;

  // 生活費（今日幣值 → 退休當年名目）
  const expenseToday = num(state.monthlyExpense);
  const expenseAtRetire = expenseToday * Math.pow(1 + cpi, n);
  const coverage = expenseAtRetire > 0 ? total / expenseAtRetire : 0;

  // 反算：目標月領（今日幣值）需要多少資產池、每月還要再投入多少
  const targetNominal = num(state.targetMonthly) * Math.pow(1 + cpi, n);
  const gapMonthly = Math.max(0, targetNominal - floor - spouseTotal);
  const requiredPool = me.payout.toPool(gapMonthly);
  const shortfallPool = Math.max(0, requiredPool - investPool);
  const extraMonthly = monthlyForTarget(shortfallPool, n, num(state.investReturn));

  // 退休後資產池逐年模擬：每年提領固定的投資月領，資產以退休後報酬滾存
  const cashflow = [];
  let pool = investPool;
  const runYears = Math.max(1, 100 - state.self.retireAge);
  let runoutAge = null;
  for (let k = 0; k <= runYears; k++) {
    cashflow.push({ age: state.self.retireAge + k, pool: Math.max(0, pool) });
    if (pool <= 0 && k > 0 && investMonthly > 0) { runoutAge = state.self.retireAge + k; break; }
    pool = pool * (1 + num(state.postReturn) / 100) - investMonthly * 12;
  }

  // 資產累積曲線與目標池
  const growth = [];
  for (let t = 0; t <= n; t++) growth.push({ age: me.age + t, pool: investPoolAt(state, t) });

  // 財務自由：投資資產池足以單獨支應「通膨後生活費」直到預期壽命
  let fireAge = null;
  if (expenseToday > 0) {
    const realR = (1 + num(state.postReturn) / 100) / (1 + cpi) - 1;
    for (let t = 0; t <= 60; t++) {
      const ageT = me.age + t;
      const months = Math.max(12, Math.round((me.lifeAge - ageT) * 12));
      const need = makePayout(months, 'annuity', realR * 100).toPool(expenseToday * Math.pow(1 + cpi, t));
      if (investPoolAt(state, t) >= need) { fireAge = ageT; break; }
    }
  }

  // 三情境：所有投資資產報酬率 −2 / ±0 / +2 個百分點
  const scenarios = [-2, 0, 2].map((d) => {
    const p = investPoolAt(state, n, d);
    return { delta: d, pool: p, monthly: Math.round(me.payout.toMonthly(p)) + floor + spouseTotal };
  });

  return {
    me, spouse, n, pvFactor,
    benefitPool, benefitMonthly,
    holdingsNow, holdingsPool, holdingsMonthly, portfolioRows, portfolioPool, portfolioMonthly,
    monthlyInvest, investPool, investMonthly,
    floor, selfTotal, spouseTotal, total, totalPV: Math.round(total * pvFactor),
    expenseToday, expenseAtRetire, coverage,
    reverse: { targetNominal, gapMonthly, requiredPool, shortfallPool, extraMonthly },
    cashflow, runoutAge, growth, fireAge, scenarios,
  };
}

