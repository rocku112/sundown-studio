/* 早謀遠算 · 計算引擎
   純函式，不碰 DOM，可在 node 直接測試（見 test/engine.test.mjs）。
   金額單位一律為新台幣元；「月領」皆為退休當年的名目金額，另附今日幣值換算。 */

import {
  INSURANCE_GRADES, PENSION_WAGE_MAX, EMPLOYER_RATE, NEW_SYSTEM_START, LABOR_PENSION_AGE,
  legalPensionAge, PENSION_ADJ_PER_YEAR, PENSION_ADJ_MAX_YEARS, PENSION_MIN_YEARS, LIFE_TABLE, TAX, LABOR_MONTHLY, LABOR_FUND, PENSION_CPI_TRIGGER,
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

/**
 * 勞保老年年金的「平均月投保薪資」：退休前最高 60 個月的平均（勞工保險條例第 19 條）。
 * 薪資逐年成長時，每個月依當時月薪對應級距，取退休前最後 60 個月平均；
 * 距退休不足 5 年時，不足的月份以薪資年增率回推過去月薪。級距表假設不變（保守）。
 */
export function avgInsuredSalary(salary, growthPct, yearsToRetire, months = 60) {
  const g = Math.pow(1 + growthPct / 100, 1 / 12);
  const end = Math.round(Math.max(0, yearsToRetire) * 12);
  let sum = 0;
  for (let m = end - months; m < end; m++) sum += insuranceGrade(salary * Math.pow(g, m)).salary;
  return sum / months;
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
export function laborPensionAccount({ salary, growthPct, selfRate, returnPct, workStartAge, age, retireAge, nowYear, balance, pastInsYears = null }) {
  const rate = (EMPLOYER_RATE + selfRate) / 100;
  const r = returnPct / 100 / 12;
  const g = Math.pow(1 + growthPct / 100, 1 / 12);
  const wage = (s) => Math.min(s, PENSION_WAGE_MAX);

  let acc;
  let pastYears = 0;
  if (balance !== null && balance !== undefined && balance !== '') {
    acc = Math.max(0, num(balance));
  } else {
    // 未提供餘額：依新制施行後的已工作年數倒推估算；有中斷時改用使用者填的已累積年資
    const worked = pastInsYears === null || pastInsYears === undefined ? age - workStartAge : num(pastInsYears);
    pastYears = Math.max(0, Math.min(worked, nowYear - NEW_SYSTEM_START));
    acc = 0;
    const pastMonths = Math.round(pastYears * 12);
    for (let m = pastMonths; m > 0; m--) acc = (acc + wage(salary / Math.pow(g, m)) * rate) * (1 + r);
  }
  const futureMonths = Math.max(0, Math.round((retireAge - age) * 12));
  for (let m = 0; m < futureMonths; m++) acc = (acc + wage(salary * Math.pow(g, m)) * rate) * (1 + r);
  return { pool: acc, estimatedPast: pastYears, monthlyContrib: Math.round(wage(salary) * rate) };
}

/**
 * 勞退月退休金（勞保局官方算法）：專戶金額 ÷ 期初年金現值因子 ÷ 12。
 * 因子 = (1 − (1/(1+i))^T) ÷ (12 × ((1+i)^(1/12) − 1)) × (1+i)^(1/12)，T 為請領年齡的平均餘命（官方表）。
 * 月退只發到平均餘命為止（延壽年金尚未開辦），期間剩餘金額仍參與收益分配（此處不計，偏保守）。
 */
export function laborMonthlyOfficial(pool, claimAge) {
  const age = clamp(Math.round(claimAge), 60, 85);
  const T = LABOR_MONTHLY.years[age];
  const i = LABOR_MONTHLY.rate;
  const m = Math.pow(1 + i, 1 / 12);
  const factor = (1 - Math.pow(1 / (1 + i), T)) / (12 * (m - 1)) * m;
  return { monthly: Math.max(0, pool) / factor / 12, years: T, factor, endAge: age + T };
}

/** 勞基法舊制退休金：前 15 年每年 2 基數，之後每年 1 基數，上限 45 基數 */
export function oldSystemUnits(years) {
  const y = Math.max(0, years);
  return Math.min(45, y <= 15 ? 2 * y : 30 + (y - 15));
}

/* ── 投資資產 ─────────────────────────────────── */

export function holdingValue(h, fx) {
  if (h.kind === 'cash' || h.kind === 'fund') return Math.max(0, num(h.amount)); // fund：基金、ETF 等以市值金額輸入
  if (h.kind === 'us') return Math.max(0, num(h.shares) * num(h.price) * num(fx, 32));
  return Math.max(0, num(h.shares) * 1000 * num(h.price)); // 台股以「張」計
}

/**
 * 人生重大事件：某年齡的一次性支出（out）或收入（in），以今日幣值輸入、依通膨推到當年。
 * 回傳該事件的名目金額（支出為負）。
 */
export function eventAmount(state, ev, currentAge) {
  const sign = ev.kind === 'in' ? 1 : -1;
  return sign * Math.max(0, num(ev.amount)) * Math.pow(1 + num(state.cpi) / 100, Math.max(0, num(ev.age) - currentAge));
}

/** 退休前（含退休當年）的事件對 t 年後資產池的影響：錢被提走或存入後，以「新增投資報酬」複利 */
export function eventsPoolAt(state, t, rateDelta = 0, currentAge) {
  if (currentAge === undefined || !state.events?.length) return 0;
  let sum = 0;
  for (const ev of state.events) {
    const te = num(ev.age) - currentAge;
    if (te < 0 || te > t || num(ev.age) > state.self.retireAge) continue;
    sum += growLump(Math.abs(eventAmount(state, ev, currentAge)), t - te, num(state.investReturn) + rateDelta) * Math.sign(eventAmount(state, ev, currentAge));
  }
  return sum;
}

/** 退休後某年齡的事件淨額（名目） */
function eventsFlowAt(state, age, currentAge) {
  let sum = 0;
  for (const ev of state.events || []) if (num(ev.age) === age && age > state.self.retireAge) sum += eventAmount(state, ev, currentAge);
  return sum;
}

/** 年 t 時投資資產池（現有資產 + 定期投入 + 退休前人生事件），rateDelta 用於情境分析 */
export function investPoolAt(state, t, rateDelta = 0, currentAge) {
  let pool = 0;
  for (const h of state.holdings) pool += growLump(holdingValue(h, state.fx), t, num(h.rate) + rateDelta);
  for (const p of state.portfolios) for (const a of p.assets) pool += growMonthly(num(a.monthly), t, num(a.rate) + rateDelta);
  return pool + eventsPoolAt(state, t, rateDelta, currentAge);
}

/* ── 單人計算 ─────────────────────────────────── */

/** 到目前為止的勞保年資：有填「已累積年資」就用它（工作有中斷、打工時有用），否則視為開始投保後沒有中斷 */
export function pastInsured(p, age) {
  const span = Math.max(0, age - p.workStartAge);
  if (p.pastInsYears === null || p.pastInsYears === undefined || p.pastInsYears === '') return span;
  return clamp(num(p.pastInsYears), 0, Math.max(0, age - 15));
}

function person(p, ctx) {
  const age = ctx.nowYear - p.birthYear;
  const yearsToRetire = Math.max(0, p.retireAge - age);
  const table = LIFE_TABLE[p.gender] || LIFE_TABLE.male;
  const lifeAge = ctx.lifeAge ?? p.retireAge + lifeExpectancyAt(p.gender, p.retireAge);
  const healthAge = ctx.healthAge ?? table.healthAge;
  const payoutMonths = Math.max(12, Math.round((lifeAge - p.retireAge) * 12));
  const payout = makePayout(payoutMonths, ctx.payoutMode, ctx.postReturn);

  const baseNow = p.insMode === 'manual' ? INSURANCE_GRADES[clamp(p.insGrade, 1, INSURANCE_GRADES.length) - 1] : insuranceGrade(p.salary).salary;
  // 自動模式：投保薪資跟著薪資成長升級；手動模式：使用者指定的級距維持不變
  const base = p.insMode === 'manual' ? baseNow : Math.round(avgInsuredSalary(p.salary, ctx.salaryGrowth, yearsToRetire));
  // 勞保年資：已累積（有填就用，否則視為開始投保後沒有中斷）＋ 從現在到退休
  const past = pastInsured(p, age);
  const future = Math.max(0, p.retireAge - Math.max(age, p.workStartAge));
  const insYears = past + future;
  // 勞保請領年齡：未指定時同退休年齡；不能早於退休（仍在職投保時不能請領）
  const claimAge = Math.max(p.retireAge, p.insClaimAge ?? p.retireAge);
  const ins = laborInsurance({ base, years: insYears, birthYear: p.birthYear, claimAge });
  // 勞保一次金同樣要到法定請領年齡才能領，以開始領取後的月數換算
  const insStart = ins.kind === 'annuity' ? Math.max(p.retireAge, ins.startAge) : Math.max(p.retireAge, ins.legal);
  const insFull = ins.kind === 'annuity' ? ins.monthly
    : Math.round(makePayout(Math.max(12, Math.round((lifeAge - insStart) * 12)), ctx.payoutMode, ctx.postReturn).toMonthly(ins.lump));
  // 壓力測試：假設勞保給付打折（制度改革或財務吃緊）
  const insMonthly = Math.round(insFull * (1 - clamp(num(ctx.insHaircut), 0, 100) / 100));

  const acct = laborPensionAccount({
    salary: p.salary, growthPct: ctx.salaryGrowth, selfRate: p.selfRate, returnPct: p.laborReturn,
    workStartAge: p.workStartAge, age, retireAge: p.retireAge, nowYear: ctx.nowYear, balance: p.laborBalance, pastInsYears: p.pastInsYears,
  });
  // 勞退要滿 60 歲才能領：提早退休時專戶繼續以基金收益滾存到 60 歲
  const laborStart = Math.max(p.retireAge, LABOR_PENSION_AGE);
  const laborPool = growLump(acct.pool, laborStart - p.retireAge, p.laborReturn);
  // 新制年資（94 年 7 月起）滿 15 年才能月領，否則只能一次領
  const pastNew = p.pastInsYears === null || p.pastInsYears === undefined
    ? Math.max(0, age - Math.max(p.workStartAge, NEW_SYSTEM_START - p.birthYear))
    : Math.min(past, Math.max(0, ctx.nowYear - NEW_SYSTEM_START));
  const newYears = Math.max(0, pastNew + future);
  const official = laborMonthlyOfficial(laborPool, laborStart);
  const laborEligible = newYears >= LABOR_MONTHLY.minYears;
  // 可月領時採勞保局官方算法；只能一次領時，依使用者的提領方式把一次金換算成月領
  const laborRetire = laborEligible ? Math.round(official.monthly)
    : Math.round(makePayout(Math.max(12, Math.round((lifeAge - laborStart) * 12)), ctx.payoutMode, ctx.postReturn).toMonthly(laborPool));

  const finalSalary = p.salary * Math.pow(1 + ctx.salaryGrowth / 100, yearsToRetire);
  const units = oldSystemUnits(p.oldSystemYears);
  const oldLump = units * finalSalary;
  const oldMonthly = Math.round(payout.toMonthly(oldLump));

  return {
    age, yearsToRetire, lifeAge, healthAge, payout, payoutMonths,
    insFull, insBase: base, insBaseNow: baseNow, insGrade: insuranceGrade(baseNow).grade, insYears, ins, insMonthly,
    acct, laborRetire, laborPool, laborOfficial: { ...official, eligible: laborEligible, newYears }, oldUnits: units, oldLump, oldMonthly, finalSalary,
    floor: insMonthly + laborRetire + oldMonthly,
    bridge: bridgeGap(p.retireAge, insStart, laborStart, insMonthly, laborRetire),
  };
}

/**
 * 空窗期：退休後到勞保、勞退開始給付前，少領的保底收入。
 * missing 為空窗期間少領金額的總和（名目、不計報酬，偏保守），即退休時需額外準備的資金。
 */
function bridgeGap(retireAge, insStart, laborStart, insMonthly, laborMonthly) {
  const insYears = Math.max(0, insStart - retireAge);
  const laborYears = Math.max(0, laborStart - retireAge);
  return {
    years: Math.max(insYears, laborYears), insStart, laborStart, insYears, laborYears,
    missing: Math.round(insMonthly * insYears * 12 + laborMonthly * laborYears * 12),
  };
}

/** 晚年照護支出：某年齡那一年的名目年度金額（今日幣值依通膨推到該年） */
export function careCostAt(state, age, currentAge) {
  const c = state.care;
  if (!c || !c.enabled || age < c.startAge) return 0;
  return num(c.monthly) * 12 * Math.pow(1 + num(state.cpi) / 100, Math.max(0, age - currentAge));
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
    insHaircut: num(state.insHaircut),
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
  const eventsPool = eventsPoolAt(state, n, 0, me.age);
  const investPool = Math.max(0, holdingsPool + portfolioPool + eventsPool); // 事件支出大於資產時以 0 計
  const holdingsMonthly = Math.round(me.payout.toMonthly(holdingsPool));
  const portfolioMonthly = Math.round(me.payout.toMonthly(portfolioPool));
  const investMonthly = Math.round(me.payout.toMonthly(investPool));
  const eventsMonthly = investMonthly - holdingsMonthly - portfolioMonthly; // 人生事件對月領的影響（通常為負）

  // 配偶（各自以本人年齡、生命表計算）
  const spouse = state.spouse.enabled ? person(state.spouse, { ...ctx, lifeAge: null, healthAge: null }) : null;
  // 配偶的月領是配偶退休當年的名目金額；換算成本人退休當年的幣值才能相加
  const spouseTotal = spouse ? Math.round(spouse.floor * Math.pow(1 + cpi, n - spouse.yearsToRetire)) : 0;

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
    const nextAge = state.self.retireAge + k + 1;
    pool = pool * (1 + num(state.postReturn) / 100) - investMonthly * 12 - careCostAt(state, nextAge, me.age) + eventsFlowAt(state, nextAge, me.age);
  }

  // 資產累積曲線與目標池
  const growth = [];
  for (let t = 0; t <= n; t++) growth.push({ age: me.age + t, pool: investPoolAt(state, t, 0, me.age) });

  // 財務自由：投資資產池足以單獨支應「通膨後生活費」直到預期壽命
  let fireAge = null;
  if (expenseToday > 0) {
    const realR = (1 + num(state.postReturn) / 100) / (1 + cpi) - 1;
    for (let t = 0; t <= 60; t++) {
      const ageT = me.age + t;
      const months = Math.max(12, Math.round((me.lifeAge - ageT) * 12));
      const need = makePayout(months, 'annuity', realR * 100).toPool(expenseToday * Math.pow(1 + cpi, t));
      if (investPoolAt(state, t, 0, me.age) >= need) { fireAge = ageT; break; }
    }
  }

  // 三情境：所有投資資產報酬率 −2 / ±0 / +2 個百分點
  const scenarios = [-2, 0, 2].map((d) => {
    const p = Math.max(0, investPoolAt(state, n, d, me.age));
    return { delta: d, pool: p, monthly: Math.round(me.payout.toMonthly(p)) + floor + spouseTotal };
  });

  // 照護期：開始那年的生活費＋照護費（名目）對比固定月領
  let care = null;
  if (state.care?.enabled) {
    const yrs = Math.max(0, state.care.startAge - me.age);
    const need = (expenseToday + num(state.care.monthly)) * Math.pow(1 + cpi, yrs);
    // 照護開始時，勞保年金已依 CPI 累計調整過
    const insBoost = me.insMonthly * (insCpiFactor(state.cpi, state.care.startAge - me.bridge.insStart) - 1);
    care = { startAge: state.care.startAge, need, gap: need - total - insBoost, monthlyAtStart: num(state.care.monthly) * Math.pow(1 + cpi, yrs), years: Math.max(0, me.lifeAge - state.care.startAge) };
  }

  return {
    me, spouse, n, pvFactor, care,
    benefitPool, benefitMonthly,
    holdingsNow, holdingsPool, holdingsMonthly, portfolioRows, portfolioPool, portfolioMonthly, eventsPool, eventsMonthly,
    monthlyInvest, investPool, investMonthly,
    floor, selfTotal, spouseTotal, total, totalPV: Math.round(total * pvFactor),
    expenseToday, expenseAtRetire, coverage,
    reverse: { targetNominal, gapMonthly, requiredPool, shortfallPool, extraMonthly },
    cashflow, runoutAge, growth, fireAge, scenarios,
  };
}


/* ── 分析：全生命週期、敏感度、退休年齡比較 ─────────── */

/** 深拷貝狀態（狀態只有純資料） */
const cloneState = (s) => JSON.parse(JSON.stringify(s));

/** 所有投資資產報酬率同時加減 delta 個百分點 */
function shiftReturns(s, delta) {
  for (const h of s.holdings) h.rate = num(h.rate) + delta;
  for (const p of s.portfolios) for (const a of p.assets) a.rate = num(a.rate) + delta;
  return s;
}

/**
 * 投資資產池從現在到 100 歲的逐年走勢：退休前累積，退休後每年提領固定的投資月領 × 12，
 * 剩餘資產以退休後報酬滾存。rateDelta 同時套用在累積期與退休後報酬。
 */
export function lifecycle(state, nowYear = new Date().getFullYear(), rateDelta = 0) {
  const s = shiftReturns(cloneState(state), rateDelta);
  s.postReturn = num(s.postReturn) + (s.payoutMode === 'annuity' ? rateDelta : 0);
  const r = compute(s, nowYear);
  const pts = [];
  for (let t = 0; t <= r.n; t++) pts.push({ age: r.me.age + t, pool: Math.max(0, investPoolAt(s, t, 0, r.me.age)), phase: 'save' });
  let pool = r.investPool;
  const post = num(state.postReturn) / 100 + (rateDelta / 100);
  let runoutAge = null;
  for (let age = s.self.retireAge + 1; age <= 100; age++) {
    pool = pool * (1 + post) - r.investMonthly * 12 - careCostAt(s, age, r.me.age) + eventsFlowAt(s, age, r.me.age);
    if (pool <= 0) { pts.push({ age, pool: 0, phase: 'spend' }); if (r.investMonthly > 0) runoutAge = age; break; }
    pts.push({ age, pool, phase: 'spend' });
  }
  return { points: pts, runoutAge, total: r.total, totalPV: r.totalPV, investMonthly: r.investMonthly, pool: r.investPool };
}

/**
 * 敏感度：一次只動一個變數，看退休月領（今日幣值）變多少。
 * 回傳依影響幅度排序的 [{ key, label, lowLabel, highLabel, low, high }]，low/high 為與基準的差額。
 */
export function sensitivity(state, nowYear = new Date().getFullYear()) {
  const base = compute(state, nowYear).totalPV;
  const pv = (mut) => { const s = cloneState(state); mut(s); return compute(s, nowYear).totalPV - base; };
  const monthlyTotal = state.portfolios.reduce((t, p) => t + p.assets.reduce((u, a) => u + num(a.monthly), 0), 0);
  const addMonthly = (s, d) => {
    if (d > 0) {
      s.portfolios.push({ id: 'sens', name: 'sens', assets: [{ id: 'sens', name: 'sens', monthly: d, rate: num(state.investReturn) }] });
    } else if (monthlyTotal > 0) {
      const f = Math.max(0, monthlyTotal + d) / monthlyTotal;
      for (const p of s.portfolios) for (const a of p.assets) a.monthly = num(a.monthly) * f;
    }
  };
  const rows = [
    { key: 'retire', label: '退休年齡', lowLabel: '早 2 年', highLabel: '晚 2 年',
      low: pv((s) => { s.self.retireAge = Math.max(50, s.self.retireAge - 2); }),
      high: pv((s) => { s.self.retireAge = Math.min(75, s.self.retireAge + 2); }) },
    { key: 'invest', label: '每月投資', lowLabel: '少 5,000', highLabel: '多 5,000',
      low: pv((s) => addMonthly(s, -5000)), high: pv((s) => addMonthly(s, 5000)) },
    { key: 'return', label: '投資報酬率', lowLabel: '−1%', highLabel: '+1%',
      low: pv((s) => shiftReturns(s, -1)), high: pv((s) => shiftReturns(s, 1)) },
    { key: 'selfRate', label: '勞退自提', lowLabel: '0%', highLabel: '6%',
      low: pv((s) => { s.self.selfRate = 0; }), high: pv((s) => { s.self.selfRate = 6; }) },
    { key: 'growth', label: '薪資年增率', lowLabel: '−1%', highLabel: '+1%',
      low: pv((s) => { s.salaryGrowth = Math.max(0, num(s.salaryGrowth) - 1); }), high: pv((s) => { s.salaryGrowth = num(s.salaryGrowth) + 1; }) },
    { key: 'ins', label: '勞保給付', lowLabel: '打 8 折', highLabel: '照現制',
      low: pv((s) => { s.insHaircut = Math.min(100, num(s.insHaircut) + 20); }), high: pv((s) => { s.insHaircut = 0; }) },
    { key: 'cpi', label: '通膨率', lowLabel: '−1%', highLabel: '+1%',
      low: pv((s) => { s.cpi = Math.max(0, num(s.cpi) - 1); }), high: pv((s) => { s.cpi = num(s.cpi) + 1; }) },
  ];
  return rows.sort((a, b) => Math.max(Math.abs(b.low), Math.abs(b.high)) - Math.max(Math.abs(a.low), Math.abs(a.high)));
}

/** 不同退休年齡的結果比較（只列比目前年齡大的） */
export function retireAgeOptions(state, nowYear = new Date().getFullYear(), ages = [60, 62, 65, 67, 70]) {
  const age = nowYear - state.self.birthYear;
  const list = [...new Set([...ages, state.self.retireAge])].filter((a) => a > age).sort((x, y) => x - y);
  return list.map((retireAge) => {
    const s = cloneState(state);
    s.self.retireAge = retireAge;
    const r = compute(s, nowYear);
    return { retireAge, total: r.total, totalPV: r.totalPV, coverage: r.coverage, pool: r.investPool, ins: r.me.insMonthly, current: retireAge === state.self.retireAge };
  });
}

/**
 * 目標反算：目前規劃離目標（今日幣值月領）多遠，以及五種補足方式各需要多少。
 * 「達標」定義為 compute().totalPV ≥ 目標，等同退休當年名目月領 ≥ 目標 ×（1+通膨）^年數。
 */
export function goalPlan(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  const target = Math.max(0, num(state.targetMonthly));
  const reached = (s) => compute(s, nowYear).totalPV >= target;
  const progress = target > 0 ? r.totalPV / target : 1;
  const gapPV = Math.max(0, target - r.totalPV);
  const ir = num(state.investReturn);
  const n = r.n;

  // 1. 每月加碼（以「新增投資的預期報酬」投入）
  const extraMonthly = gapPV > 0 ? r.reverse.extraMonthly : 0;
  // 2. 今天一次投入
  const lumpSum = gapPV > 0 && n > 0 ? r.reverse.shortfallPool / Math.pow(1 + ir / 100 / 12, 12 * n) : 0;
  // 3. 延後退休（最多到 75 歲）
  let retireAge = null;
  if (gapPV > 0) {
    for (let a = state.self.retireAge + 1; a <= 75; a++) {
      const s = cloneState(state); s.self.retireAge = a;
      if (reached(s)) { retireAge = a; break; }
    }
  }
  // 4. 需要的投資報酬率（所有投資資產同時加減）
  let requiredReturn = null;
  const hasInvest = state.holdings.length + state.portfolios.reduce((t, p) => t + p.assets.length, 0) > 0;
  if (gapPV > 0 && hasInvest) {
    const ok = (d) => reached(shiftReturns(cloneState(state), d));
    if (ok(20)) {
      let lo = 0, hi = 20;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      requiredReturn = hi; // 需要加上的百分點
    }
  }
  // 5. 勞退自提拉到 6%
  let selfRate6 = null;
  if (num(state.self.selfRate) < 6) {
    const s = cloneState(state); s.self.selfRate = 6;
    const pv = compute(s, nowYear).totalPV;
    selfRate6 = { gain: pv - r.totalPV, enough: pv >= target, monthlyCost: Math.round(Math.min(state.self.salary, 150000) * (6 - num(state.self.selfRate)) / 100) };
  }

  return {
    target, currentPV: r.totalPV, progress, gapPV, n,
    requiredPool: r.reverse.requiredPool, havePool: r.investPool, shortfallPool: r.reverse.shortfallPool,
    extraMonthly, lumpSum, retireAge, requiredReturn, selfRate6,
  };
}

/**
 * 起點設定檢查：回傳 [{ field, level: 'error'|'warn'|'info', msg }]。
 * error = 輸入互相矛盾、結果不可信；warn = 可能打錯；info = 合理但值得說明。
 */
export function validate(state, nowYear = new Date().getFullYear()) {
  const out = [];
  const add = (field, level, msg) => out.push({ field, level, msg });
  const check = (p, who, prefix) => {
    const age = nowYear - p.birthYear;
    if (age < 15 || age > 85) {
      // 出生年錯了其他檢查都不可信，只報這一條；小於 200 多半是民國年
      add(`${prefix}.birthYear`, 'error', p.birthYear > 0 && p.birthYear < 200
        ? `${who}出生年請填西元年：民國 ${p.birthYear} 年是西元 ${p.birthYear + 1911} 年。`
        : `${who}出生年 ${p.birthYear} 換算為 ${age} 歲，請確認是否正確。`);
      return;
    }
    if (p.workStartAge >= p.retireAge) add(`${prefix}.workStartAge`, 'error', `${who}開始投保年齡（${p.workStartAge}）不小於退休年齡（${p.retireAge}），投保年資會是 0。`);
    else if (p.workStartAge > age) add(`${prefix}.workStartAge`, 'info', `${who}尚未開始工作，試算將從 ${p.workStartAge} 歲開始投保。`);
    if (p.pastInsYears !== null && p.pastInsYears !== undefined) {
      if (p.pastInsYears > Math.max(0, age - 15)) add(`${prefix}.pastInsYears`, 'error', `${who}已累積勞保年資 ${p.pastInsYears} 年，超過 15 歲到現在的年數（${Math.max(0, age - 15)} 年）。`);
      else if (p.pastInsYears > Math.max(0, age - p.workStartAge)) add(`${prefix}.pastInsYears`, 'warn', `${who}已累積勞保年資 ${p.pastInsYears} 年，比開始投保（${p.workStartAge} 歲）到現在還多，請把「開始投保年齡」改成第一次投保（含打工）的年齡。`);
    }
    if (p.retireAge <= age) add(`${prefix}.retireAge`, 'warn', `${who}退休年齡（${p.retireAge}）不大於目前年齡（${age}），已視為現在退休、不再累積。`);
    if (p.salary <= 0) add(`${prefix}.salary`, 'warn', `${who}月薪為 0，勞保與勞退都無法累積。`);
    else if (p.salary < INSURANCE_GRADES[0]) add(`${prefix}.salary`, 'info', `${who}月薪低於勞保第 1 級 ${INSURANCE_GRADES[0].toLocaleString()} 元，全時工作者至少以第 1 級投保。`);
    if (p.oldSystemYears > 0) {
      const maxOld = Math.floor(NEW_SYSTEM_START - (p.birthYear + p.workStartAge));
      if (maxOld <= 0) add(`${prefix}.oldSystemYears`, 'error', `${who}在 94 年 7 月勞退新制施行時尚未開始工作，不會有舊制年資。`);
      else if (p.oldSystemYears > maxOld) add(`${prefix}.oldSystemYears`, 'warn', `${who}舊制年資 ${p.oldSystemYears} 年，超過 94 年 7 月前可能的工作年數（約 ${maxOld} 年）。`);
    }
  };
  check(state.self, '', 'self');
  if (state.spouse.enabled) check(state.spouse, `${state.spouse.name || '配偶'}的`, 'spouse');
  const curAge = nowYear - state.self.birthYear;
  for (const ev of state.events || []) {
    if (ev.age < curAge) add('events', 'warn', `人生事件「${ev.name}」的年齡（${ev.age}）已經過去，不會計入。`);
    else if (ev.age > 100) add('events', 'warn', `人生事件「${ev.name}」的年齡（${ev.age}）超過 100 歲，不會計入。`);
  }
  const life = state.lifeAgeOverride;
  if (life !== null && life !== undefined && life <= state.self.retireAge) add('lifeAgeOverride', 'error', `預期壽命（${life}）不大於退休年齡，無法計算提領月數。`);
  const health = state.healthAgeOverride;
  if (health !== null && health !== undefined && life !== null && life !== undefined && health > life) add('healthAgeOverride', 'warn', '健康平均壽命大於預期壽命，請確認。');
  return out;
}

/** 方案比較用的摘要數字 */
export function scenarioSummary(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  const lc = lifecycle(state, nowYear);
  return {
    retireAge: state.self.retireAge,
    monthlyInvest: r.monthlyInvest,
    total: r.total, totalPV: r.totalPV,
    coverage: r.expenseToday > 0 ? r.coverage : null,
    investPool: r.investPool,
    runoutAge: lc.runoutAge,
    hasInvest: r.investPool > 0,
    fireAge: r.fireAge,
    bridgeYears: r.me.bridge.years,
  };
}

/* ── 勞退自提節稅 ─────────────────────────────── */

/** 綜合所得稅應納稅額（依綜合所得淨額） */
export function incomeTax(net) {
  if (net <= 0) return 0;
  let lower = 0;
  for (const [upper, rate, base] of TAX.brackets) {
    if (net <= upper) return Math.round(base + (net - lower) * rate);
    lower = upper;
  }
  return 0;
}

/**
 * 勞退自提節稅估算（勞工退休金條例第 14 條：自願提繳的金額不計入提繳年度薪資所得課稅）。
 * 簡化：單身、只有薪資所得、年薪 = 月薪 ×（12 + 年終月數）、使用標準扣除額。
 */
export function selfContributionTax(salary, selfRate, bonusMonths = 0, rateOverride = null, otherIncome = 0, interest = 0) {
  // 年所得含年終獎金；自提只依月薪計算（年終不提繳）
  const annual = Math.max(0, salary) * (12 + Math.max(0, num(bonusMonths)));
  const contrib = Math.round(Math.min(Math.max(0, salary), PENSION_WAGE_MAX) * selfRate / 100) * 12;
  // 其他應稅所得（利息超過特別扣除額的部分、合併計稅的股利、租金、兼職等）一併計入綜合所得；薪資特別扣除額只扣薪資
  // 存款利息先扣儲蓄投資特別扣除額（全年上限 27 萬），超過的部分才計入
  const other = Math.max(0, num(otherIncome)) + Math.max(0, num(interest) - TAX.savingsDeduction);
  const net = (income) => income + other - TAX.exemption - TAX.standardSingle - Math.min(income, TAX.salaryDeduction);
  const before = incomeTax(net(annual));
  const after = incomeTax(net(annual - contrib));
  // 使用者指定稅率級距時（已婚合併申報、有其他所得等），直接以該級距估算
  if (rateOverride !== null && rateOverride !== undefined && rateOverride !== '') {
    const m = num(rateOverride) / 100;
    return { contrib, saving: Math.round(contrib * m), netCost: contrib - Math.round(contrib * m), marginal: m, taxYear: TAX.year, manual: true };
  }
  const saving = before - after;
  const marginal = (TAX.brackets.find(([u]) => net(annual) <= u) || TAX.brackets[0])[1];
  return { contrib, saving, netCost: contrib - saving, marginal: net(annual) > 0 ? marginal : 0, taxYear: TAX.year, manual: false };
}

/* ── 蒙地卡羅模擬 ─────────────────────────────── */

/** 可重現的亂數（mulberry32）與常態分布（Box–Muller） */
function rng(seed) {
  let a = seed >>> 0;
  const uni = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    let u = 0, v = 0;
    while (u === 0) u = uni();
    while (v === 0) v = uni();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/**
 * 蒙地卡羅：每年投資報酬 ~ 常態(μ, σ)，μ = 加權預期報酬 g + σ²/2，使長期複利中位數約等於 g。
 * 退休前每年投入「每月投資 × 12」，退休後每年依計畫提領投資月領 × 12，並扣照護費、加減人生事件。
 * 成功＝在預期壽命（四捨五入）前投資資產沒有用完。
 */
export function monteCarlo(state, nowYear = new Date().getFullYear(), { sims = 2000, vol = num(state.volatility, 12), seed = 20261008 } = {}) {
  const r = compute(state, nowYear);
  const age0 = r.me.age;
  const retire = state.self.retireAge;
  const lifeEnd = Math.round(r.me.lifeAge);
  // 加權預期報酬：以各資產退休時的終值加權
  let wsum = 0, gsum = 0;
  for (const h of state.holdings) { const w = growLump(holdingValue(h, state.fx), r.n, num(h.rate)); wsum += w; gsum += w * num(h.rate); }
  for (const p of state.portfolios) for (const a of p.assets) { const w = growMonthly(num(a.monthly), r.n, num(a.rate)); wsum += w; gsum += w * num(a.rate); }
  if (wsum <= 0) return null;
  const g = gsum / wsum / 100;
  const sigma = Math.max(0, vol) / 100;
  const mu = g + sigma * sigma / 2;
  const yearlyIn = r.monthlyInvest * 12;
  const draw = r.investMonthly * 12;
  const ages = [];
  for (let a = age0; a <= 100; a++) ages.push(a);
  const paths = ages.map(() => new Float64Array(sims));
  const normal = rng(seed);
  let ok = 0, ok90 = 0;
  const depletedAt = [];
  for (let i = 0; i < sims; i++) {
    let pool = r.holdingsNow, dead = null;
    paths[0][i] = pool;
    for (let k = 1; k < ages.length; k++) {
      const a = ages[k];
      const ret = mu + sigma * normal();
      pool = pool * (1 + ret);
      if (a <= retire) pool += yearlyIn;
      else pool -= draw + careCostAt(state, a, age0);
      for (const ev of state.events || []) if (num(ev.age) === a) pool += eventAmount(state, ev, age0);
      if (pool <= 0 && a > retire && dead === null) dead = a;
      if (pool < 0) pool = 0;
      paths[k][i] = pool;
    }
    if (dead === null || dead > lifeEnd) ok++;
    if (dead === null || dead > 90) ok90++;
    depletedAt.push(dead);
  }
  const pct = (arr, q) => { const s = Array.from(arr).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const band = ages.map((a, k) => ({ age: a, p10: pct(paths[k], 0.1), p50: pct(paths[k], 0.5), p90: pct(paths[k], 0.9) }));
  const kRet = ages.indexOf(retire);
  return {
    success: ok / sims, success90: ok90 / sims, sims, vol, g: g * 100, lifeEnd,
    band, atRetire: kRet >= 0 ? band[kRet] : null,
  };
}

/* ── 行動清單 ─────────────────────────────────── */

/**
 * 依試算結果產生建議行動（依重要性排序）。
 * 每項 { id, level: 'high'|'mid'|'low', title, detail, apply? }；apply 為可一鍵套用的設定 { path, value } 或特殊動作。
 */
export function actionPlan(state, nowYear = new Date().getFullYear(), mc = null) {
  const r = compute(state, nowYear);
  const g = goalPlan(state, nowYear);
  const list = [];
  const add = (x) => list.push(x);
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  const wan = (v) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(2)}億` : `${Math.round(v / 1e4).toLocaleString()}萬`);

  if (g.gapPV > 0 && Number.isFinite(g.extraMonthly)) {
    const amt = Math.ceil(g.extraMonthly / 100) * 100;
    add({ id: 'gap', level: 'high', title: `每月多投資 ${money(amt)}，補足退休目標`,
      detail: `目前規劃只達成目標的 ${Math.round(g.progress * 100)}%，以年化 ${num(state.investReturn)}% 投入 ${g.n} 年可補足。也可改用延後退休或一次投入（見下方補足方式）。`,
      apply: { act: 'apply-extra', value: amt } });
  }
  if (num(state.self.selfRate) < 6 && state.self.salary > 0) {
    const t = selfContributionTax(state.self.salary, 6, state.self.bonusMonths, state.self.taxRateOverride, state.self.otherIncome, state.self.interestIncome);
    const now = selfContributionTax(state.self.salary, num(state.self.selfRate), state.self.bonusMonths, state.self.taxRateOverride, state.self.otherIncome, state.self.interestIncome);
    add({ id: 'selfRate', level: 'high', title: '勞退自提提高到 6%',
      detail: `每月多提撥 ${money((t.contrib - now.contrib) / 12)}，${t.saving - now.saving > 0 ? `每年約少繳稅 ${money(t.saving - now.saving)}，` : ''}${g.selfRate6 ? `月領（今日幣值）增加 ${money(g.selfRate6.gain)}` : ''}。向公司人資申請即可，隨時可調整。`,
      apply: { path: 'self.selfRate', value: 6 } });
  }
  const cash = state.holdings.filter((h) => h.kind === 'cash').reduce((s, h) => s + holdingValue(h, state.fx), 0);
  const need6 = num(state.monthlyExpense) * 6;
  if (need6 > 0 && cash < need6) {
    add({ id: 'emergency', level: 'high', title: `準備 6 個月緊急預備金（還差 ${money(need6 - cash)}）`,
      detail: `以每月生活費 ${money(state.monthlyExpense)} 計，建議至少 ${money(need6)} 放在活存或定存，避免急用時被迫在低點賣出投資。` });
  }
  if (r.me.bridge.years > 0) {
    add({ id: 'bridge', level: 'high', title: `為 ${r.me.bridge.years} 年空窗期準備 ${wan(r.me.bridge.missing)}`,
      detail: `${state.self.retireAge} 歲退休後，勞退 ${r.me.bridge.laborStart} 歲、勞保 ${r.me.bridge.insStart} 歲才開始領，這段期間要靠自己的資產。` });
  }
  if (mc && mc.success < 0.85) {
    add({ id: 'mc', level: mc.success < 0.7 ? 'high' : 'mid', title: `提高安全邊際（目前成功率 ${Math.round(mc.success * 100)}%）`,
      detail: '市場不好時有機會提早把錢用完。可考慮：多存一點、晚一兩年退休、降低退休後提領，或改用波動較低的資產配置。' });
  }
  if (state.self.laborBalance === null) {
    add({ id: 'balance', level: 'mid', title: '查詢勞退專戶餘額並填入',
      detail: '到勞保局 e 化服務系統或「勞動保障卡」App 查詢，填入「起點設定」後，勞退月領的估算會準確很多。' });
  }
  if (r.investPool <= 0) {
    add({ id: 'invest', level: 'mid', title: '開始定期投資',
      detail: '目前退休收入全靠勞保勞退。即使每月 3,000 元，長期複利也能明顯提高退休月領。' });
  }
  if (!state.care?.enabled && r.me.age >= 40) {
    add({ id: 'care', level: 'low', title: '把晚年照護費納入規劃',
      detail: '照護費常是晚年最大的開銷。在「起點設定」開啟晚年照護支出，看看資產能撐到幾歲。' });
  }
  if (!state.insHaircut) {
    add({ id: 'stress', level: 'low', title: '做一次勞保壓力測試',
      detail: '把勞保給付打 8 折試試看。如果結果仍然夠用，你的規劃就比較不怕制度變動。', apply: { path: 'insHaircut', value: 20 } });
  }
  add({ id: 'review', level: 'low', title: '每年檢視一次',
    detail: '每年更新月薪、勞退餘額與投資市值，確認進度。薪資、市場和法規都會變，規劃也要跟著調整。' });
  const order = { high: 0, mid: 1, low: 2 };
  return list.sort((a, b) => order[a.level] - order[b.level]);
}

/* ── 年度進度追蹤 ─────────────────────────────── */

/** 依目前設定產生逐年預期路徑（年底值）：投資資產與勞退專戶 */
export function planPath(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  const path = [];
  for (let t = 0; t <= r.n; t++) {
    const acct = laborPensionAccount({
      salary: state.self.salary, growthPct: num(state.salaryGrowth), selfRate: num(state.self.selfRate), returnPct: num(state.self.laborReturn),
      workStartAge: state.self.workStartAge, age: r.me.age, retireAge: r.me.age + t, nowYear, balance: state.self.laborBalance, pastInsYears: state.self.pastInsYears,
    });
    path.push({ year: nowYear + t, invest: Math.max(0, investPoolAt(state, t, 0, r.me.age)), labor: acct.pool });
  }
  return path;
}

/** 某日期在基準路徑上的預期值：path[0] 為建立基準當天，之後每點相隔一年，中間線性內插 */
export function expectedAt(baseline, dateStr) {
  const p = baseline.path;
  const t = (new Date(dateStr) - new Date(baseline.createdAt)) / (365.25 * 864e5);
  if (t <= 0 || p.length < 2) return { invest: p[0].invest, labor: p[0].labor };
  const i = Math.min(p.length - 2, Math.floor(t));
  const f = Math.min(1, t - i);
  return { invest: p[i].invest + (p[i + 1].invest - p[i].invest) * f, labor: p[i].labor + (p[i + 1].labor - p[i].labor) * f };
}

/** 每次記錄與基準的差距 */
export function trackProgress(tracking) {
  if (!tracking?.baseline) return [];
  return [...tracking.checkins].sort((a, b) => a.date.localeCompare(b.date)).map((c) => {
    const e = expectedAt(tracking.baseline, c.date);
    const actual = num(c.invest) + num(c.labor);
    const expected = e.invest + e.labor;
    return { ...c, expInvest: e.invest, expLabor: e.labor, actual, expected, diff: actual - expected, ratio: expected > 0 ? actual / expected : null };
  });
}

/**
 * 勞退一次領 vs 月領：
 * - 月領：官方算法，領到平均餘命（endAge）為止。
 * - 一次領：同一筆錢自己以「退休後報酬」管理，每月領同樣金額，看能撐到幾歲；
 *   以及要領到自己的預期壽命，需要多少年化報酬。
 */
export function laborLumpVsMonthly(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  const me = r.me;
  const o = me.laborOfficial;
  const pool = me.laborPool;
  const M = o.monthly;
  const startAge = Math.max(state.self.retireAge, LABOR_PENSION_AGE);
  const lifeAge = me.lifeAge;
  const lastsUntil = (ratePct) => {
    const j = Math.pow(1 + ratePct / 100, 1 / 12) - 1;
    let b = pool, k = 0;
    while (b > 0 && k < 12 * 60) { b -= M; b *= 1 + j; k++; } // 期初給付
    return startAge + k / 12;
  };
  // 一次領自己管理，要每月領 M 直到預期壽命所需的年化報酬
  let needRate = null;
  if (M > 0 && lastsUntil(15) >= lifeAge) {
    let lo = -5, hi = 15;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (lastsUntil(mid) >= lifeAge) hi = mid; else lo = mid; }
    needRate = hi;
  }
  return {
    eligible: o.eligible, newYears: o.newYears, pool, monthly: M, years: o.years, startAge, endAge: o.endAge,
    lifeAge, outlive: lifeAge - o.endAge,
    selfInvest: { rate: num(state.postReturn), lastsUntil: lastsUntil(num(state.postReturn)) },
    needRate, officialRate: LABOR_MONTHLY.rate * 100,
  };
}

/**
 * 勞退自提決策分析：同一筆薪水，「自提進勞退」vs「領回來自己投資」。
 * - 自提：每月提撥 C，不計入薪資所得課稅，以勞退收益率滾到可請領年齡；最差情況以最低保證收益計。
 * - 自己投資：同一筆錢先繳稅（少了節稅），稅後金額以「新增投資報酬」滾到同一年齡。
 * 回傳兩條路的終值、打平所需報酬率、鎖定年數等。
 */
export function selfContributionAnalysis(state, nowYear = new Date().getFullYear(), ratePct) {
  const r = compute(state, nowYear);
  const s = state.self;
  const rate = ratePct ?? (num(s.selfRate) > 0 ? num(s.selfRate) : 6);
  const tax = selfContributionTax(s.salary, rate, s.bonusMonths, s.taxRateOverride, s.otherIncome, s.interestIncome);
  const monthly = tax.contrib / 12;
  const afterTaxMonthly = (tax.contrib - tax.saving) / 12;
  const n = r.n;                                           // 提撥年數（到退休）
  const start = Math.max(s.retireAge, LABOR_PENSION_AGE);  // 可請領年齡
  const wait = Math.max(0, start - s.retireAge);
  const fv = (m, pctRate) => growLump(growMonthly(m, n, pctRate), wait, pctRate);
  const viaPension = fv(monthly, num(s.laborReturn));
  const viaPensionFloor = fv(monthly, LABOR_FUND.minGuarantee.rate);
  const selfInvest = fv(afterTaxMonthly, num(state.investReturn));
  // 自己投資要打平自提所需的年化報酬
  let breakEven = null;
  if (afterTaxMonthly > 0 && n > 0) {
    let lo = -5, hi = 30;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (fv(afterTaxMonthly, mid) >= viaPension) hi = mid; else lo = mid; }
    breakEven = hi;
  }
  return {
    rate, monthly, afterTaxMonthly, annualSaving: tax.saving, totalSaving: tax.saving * n, marginal: tax.marginal, manualTax: tax.manual,
    years: n, // 年滿 60 歲不論是否仍在職即可請領，所以「動不到」的時間只到 60 歲
    lockedYears: Math.max(0, LABOR_PENSION_AGE - r.me.age), accessAge: LABOR_PENSION_AGE, startAge: start,
    viaPension, viaPensionFloor, selfInvest, breakEven,
    laborReturn: num(s.laborReturn), investReturn: num(state.investReturn), minGuarantee: LABOR_FUND.minGuarantee,
  };
}

/**
 * 勞保請領年齡比較：年資與投保薪資在退休時固定，比較不同請領年齡的月領與累計領取。
 * 回本歲數：比法定年齡晚領，要活到幾歲累計金額才追上（名目、未折現、不計 CPI 調整）。
 */
export function insuranceClaimOptions(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  const me = r.me;
  if (me.ins.kind !== 'annuity') return null;
  const legal = me.ins.legal;
  const base = Math.max(me.ins.a, me.ins.b); // 法定年齡請領的月領（未打折）
  const haircut = 1 - clamp(num(state.insHaircut), 0, 100) / 100;
  const from = Math.max(state.self.retireAge, legal - PENSION_ADJ_MAX_YEARS);
  const to = legal + PENSION_ADJ_MAX_YEARS;
  const lifeAge = me.lifeAge;
  const legalMonthly = base * haircut;
  const opts = [];
  for (let c = from; c <= to; c++) {
    const monthly = base * (1 + (c - legal) * PENSION_ADJ_PER_YEAR) * haircut;
    const cumToLife = Math.max(0, lifeAge - c) * 12 * monthly;
    // 與法定年齡相比的回本歲數：m1(x−c1) = m2(x−c2)
    let breakEven = null;
    if (c !== legal && monthly !== legalMonthly) {
      breakEven = (monthly * c - legalMonthly * legal) / (monthly - legalMonthly);
    }
    opts.push({ age: c, monthly: Math.round(monthly), cumToLife, breakEven, current: c === me.ins.startAge });
  }
  const best = opts.reduce((b, o) => (o.cumToLife > b.cumToLife ? o : b), opts[0]);
  return { legal, lifeAge, opts, best: best.age, retireAge: state.self.retireAge };
}

/**
 * 勞保年金依 CPI 調整後的倍數：開始請領後，物價累計成長達 5% 時才一次調整（第 65 條之 4）。
 * 回傳請領第 years 年時，年金相對於起領金額的倍數（名目）。
 */
export function insCpiFactor(cpiPct, years) {
  const c = num(cpiPct) / 100;
  let price = 1, level = 1;
  for (let y = 1; y <= Math.floor(Math.max(0, years)); y++) {
    price *= 1 + c;
    if (Math.abs(price / level - 1) >= PENSION_CPI_TRIGGER - 1e-12) level = price;
  }
  return level;
}

/**
 * 勞保一次請領老年給付 vs 老年年金（勞工保險條例第 58、59、19 條）：
 * - 資格：98 年 1 月 1 日（97 年修正條文施行）前已有保險年資者，可選擇一次請領。
 * - 一次請領：年資每滿 1 年給 1 個月，超過 15 年部分每年 2 個月，上限 45 個月；
 *   60 歲後年資最多計 5 年，合併上限 50 個月。平均月投保薪資取退保前 3 年。
 */
export function insuranceLumpVsAnnuity(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  const p = state.self;
  const firstInsuredYear = p.birthYear + p.workStartAge;
  const eligible = firstInsuredYear < 2009 && r.me.ins.kind === 'annuity';
  if (!eligible) return { eligible: false, firstInsuredYear };
  const years = r.me.insYears;
  const after60 = Math.min(years, Math.max(0, p.retireAge - Math.max(60, p.workStartAge, r.me.age)));
  const pre60 = years - after60;
  const post60 = Math.min(5, after60);
  const counted = Math.floor(pre60 + post60);
  let months = counted <= 15 ? counted : 15 + 2 * (counted - 15);
  months = Math.min(months, post60 > 0 ? 50 : 45);
  const base3 = p.insMode === 'manual' ? r.me.insBaseNow : Math.round(avgInsuredSalary(p.salary, num(state.salaryGrowth), r.n, 36));
  const lump = months * base3;
  const annuity = r.me.insMonthly;
  const claimAge = r.me.ins.startAge;
  const breakEvenAge = annuity > 0 ? claimAge + lump / annuity / 12 : null;
  // 若一次領的錢以退休後報酬滾存，年金要領到幾歲現值才追上
  const j = Math.pow(1 + num(state.postReturn) / 100, 1 / 12) - 1;
  let pv = 0, k = 0;
  while (annuity > 0 && pv < lump && k < 12 * 60) { pv += annuity / Math.pow(1 + j, k); k++; }
  return {
    eligible: true, firstInsuredYear, months, base3, lump, annuity, claimAge, counted,
    breakEvenAge, breakEvenDiscounted: pv >= lump ? claimAge + k / 12 : null, lifeAge: r.me.lifeAge,
  };
}

/**
 * 退休後提領策略比較（蒙地卡羅，三種策略共用同一組隨機報酬）：
 * - fixed：每年固定提領「投資月領 × 12」（名目）
 * - percent：每年提領當時資產的固定比例（比例 = 退休當年的提領率），不會用完但收入波動
 * - guardrail：從固定金額出發；當年提領率高於起始 120% 時減 10%，低於 80% 時加 10%
 * 回傳各策略的成功率、收入中位數（相對起始）、最差年份收入（P10，相對起始）、過世時資產中位數。
 */
export function withdrawalStrategies(state, nowYear = new Date().getFullYear(), { sims = 1000, vol = num(state.volatility, 12), seed = 20261008 } = {}) {
  const r = compute(state, nowYear);
  if (r.investPool <= 0 || r.investMonthly <= 0) return null;
  const age0 = r.me.age, retire = state.self.retireAge, lifeEnd = Math.round(r.me.lifeAge);
  let wsum = 0, gsum = 0;
  for (const h of state.holdings) { const w = growLump(holdingValue(h, state.fx), r.n, num(h.rate)); wsum += w; gsum += w * num(h.rate); }
  for (const p of state.portfolios) for (const a of p.assets) { const w = growMonthly(num(a.monthly), r.n, num(a.rate)); wsum += w; gsum += w * num(a.rate); }
  const g = wsum > 0 ? gsum / wsum / 100 : 0.05;
  const sigma = Math.max(0, vol) / 100, mu = g + sigma * sigma / 2;
  const normal = rng(seed);
  const draw0 = r.investMonthly * 12;
  const keys = ['fixed', 'percent', 'guardrail'];
  const res = Object.fromEntries(keys.map((k) => [k, { ok: 0, avgInc: [], minInc: [], left: [] }]));
  for (let i = 0; i < sims; i++) {
    // 與 monteCarlo 相同的流程與亂數序列：每年一個報酬，從現在模擬到 100 歲
    let pool = r.holdingsNow;
    let st = null;
    const inc = { fixed: [], percent: [], guardrail: [] };
    const dead = { fixed: null, percent: null, guardrail: null };
    let rate0 = 0;
    for (let a = age0 + 1; a <= 100; a++) {
      const ret = mu + sigma * normal();
      let evf = 0;
      for (const ev of state.events || []) if (num(ev.age) === a) evf += eventAmount(state, ev, age0);
      if (a <= retire) {
        pool = pool * (1 + ret) + r.monthlyInvest * 12 + evf;
        if (pool < 0) pool = 0;
        continue;
      }
      if (!st) {
        rate0 = pool > 0 ? draw0 / pool : 0;
        st = { fixed: { p: pool, w: draw0 }, percent: { p: pool, w: draw0 }, guardrail: { p: pool, w: draw0 } };
      }
      const care = careCostAt(state, a, age0);
      for (const k of keys) {
        const x = st[k];
        if (dead[k] !== null) { if (a <= lifeEnd) inc[k].push(0); continue; }
        if (k === 'percent') x.w = x.p * rate0;
        if (k === 'guardrail' && x.p > 0) {
          const cur = x.w / x.p;
          if (cur > rate0 * 1.2) x.w *= 0.9;
          else if (cur < rate0 * 0.8) x.w *= 1.1;
        }
        x.p = x.p * (1 + ret) - x.w - care + evf;
        if (a <= lifeEnd) inc[k].push(x.p >= 0 ? x.w : Math.max(0, x.w + x.p));
        if (x.p <= 0) { x.p = 0; dead[k] = a; }
      }
    }
    for (const k of keys) {
      if (dead[k] === null || dead[k] > lifeEnd) res[k].ok++;
      const arr = inc[k].length ? inc[k] : [draw0];
      res[k].avgInc.push(arr.reduce((s2, v) => s2 + v, 0) / arr.length / draw0);
      res[k].minInc.push(Math.min(...arr) / draw0);
      res[k].left.push(st ? st[k].p : pool);
    }
  }
  const q = (arr, p) => { const s2 = [...arr].sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(p * s2.length))]; };
  const out = {};
  for (const k of keys) {
    out[k] = { success: res[k].ok / sims, medianIncome: q(res[k].avgInc, 0.5), worstIncome: q(res[k].minInc, 0.1), medianLeft: q(res[k].left, 0.5) };
  }
  return { ...out, draw0, rate0: r.investPool > 0 ? draw0 / r.investPool : 0, lifeEnd, sims };
}

/**
 * 勞退自提延後開始：晚 k 年才開始自提，到可請領年齡時少多少；
 * 以及延後期間這筆錢（稅後）留在手上可當緊急預備金的金額（未計利息）。
 */
export function selfRateDelayOptions(state, nowYear = new Date().getFullYear(), delays = [0, 3, 5, 10]) {
  const a = selfContributionAnalysis(state, nowYear);
  const start = a.startAge;
  const age = nowYear - state.self.birthYear;
  const r = num(state.self.laborReturn);
  const wait = Math.max(0, start - state.self.retireAge);
  return delays.filter((d) => d < a.years).map((d) => {
    const fv = growLump(growMonthly(a.monthly, a.years - d, r), wait, r);
    return { delay: d, startAge: age + d, fv, inHand: a.afterTaxMonthly * 12 * d, taxLost: a.annualSaving * d };
  }).map((o, _, arr) => ({ ...o, loss: arr[0].fv - o.fv }));
}

/**
 * 匯入前預覽：比較兩份設定的主要欄位，只回傳有變動的項目。
 * 每項 { label, from, to }，from/to 為已格式化的文字。
 */
export function stateDiff(a, b) {
  const money = (v) => `$${Math.round(num(v)).toLocaleString()}`;
  const pct = (v) => `${num(v)}%`;
  const yr = (v) => `${v} 年`;
  const age = (v) => `${v} 歲`;
  const g = (v) => (v === 'female' ? '女' : '男');
  const assets = (s) => (s.holdings || []).reduce((t, h) => t + holdingValue(h, s.fx), 0);
  const monthly = (s) => (s.portfolios || []).reduce((t, p) => t + p.assets.reduce((u, x) => u + num(x.monthly), 0), 0);
  const fields = [
    ['出生年', (s) => s.self.birthYear, yr],
    ['性別', (s) => s.self.gender, g],
    ['退休年齡', (s) => s.self.retireAge, age],
    ['月薪', (s) => s.self.salary, money],
    ['勞退自提', (s) => s.self.selfRate, pct],
    ['勞退專戶餘額', (s) => s.self.laborBalance, (v) => (v === null || v === undefined ? '依年資估算' : money(v))],
    ['配偶', (s) => !!s.spouse?.enabled, (v) => (v ? '一起試算' : '不納入')],
    ['現有資產', assets, money],
    ['每月定期投資', monthly, money],
    ['退休後生活費', (s) => s.monthlyExpense, money],
    ['目標每月可用', (s) => s.targetMonthly, money],
    ['新增投資報酬', (s) => s.investReturn, pct],
    ['通膨', (s) => s.cpi, pct],
    ['人生事件', (s) => (s.events || []).length, (v) => `${v} 筆`],
    ['進度追蹤紀錄', (s) => s.tracking?.checkins?.length || 0, (v) => `${v} 筆`],
  ];
  const out = [];
  for (const [label, get, fmt] of fields) {
    const x = get(a), y = get(b);
    if (x !== y && !(typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 0.5e-6)) out.push({ label, from: fmt(x), to: fmt(y) });
  }
  return out;
}

/**
 * 家庭時間軸（有配偶時）：逐年列出兩人的工作／領取狀態與家庭保底月領（今日幣值），
 * 並整理成階段，另估「只剩一人」的年數與保底收入。各人的月領以各自退休當年換算今日幣值。
 */
export function householdTimeline(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  if (!r.spouse) return null;
  const cpi = num(state.cpi) / 100;
  const mk = (p, P, name) => {
    const f = Math.pow(1 + cpi, -P.yearsToRetire);
    return {
      name, birthYear: p.birthYear,
      retireYear: p.birthYear + p.retireAge,
      insYear: p.birthYear + P.bridge.insStart,
      laborYear: p.birthYear + P.bridge.laborStart,
      lifeYear: p.birthYear + Math.round(P.lifeAge),
      ins: P.insMonthly * f, labor: P.laborRetire * f, old: P.oldMonthly * f,
      floorPV: Math.round(P.floor * f),
    };
  };
  const people = [mk(state.self, r.me, '本人'), mk(state.spouse, r.spouse, state.spouse.name || '配偶')];
  const from = Math.min(...people.map((x) => x.retireYear)), to = Math.max(...people.map((x) => x.lifeYear));
  const status = (x, y) => (y >= x.lifeYear ? 'gone' : y < x.retireYear ? 'work' : y < Math.min(x.insYear, x.laborYear) ? 'gap' : y < Math.max(x.insYear, x.laborYear) ? 'part' : 'full');
  const years = [];
  for (let y = from; y < to; y++) {
    const income = people.reduce((t, x) => t + (status(x, y) === 'gone' ? 0
      : (y >= x.insYear ? x.ins : 0) + (y >= x.laborYear ? x.labor : 0) + (y >= x.retireYear ? x.old : 0)), 0);
    years.push({ year: y, income: Math.round(income), st: people.map((x) => status(x, y)) });
  }
  const phases = [];
  for (const row of years) {
    const last = phases[phases.length - 1];
    const key = row.st.join('|');
    if (last && last.key === key && Math.abs(last.income - row.income) < 1) last.to = row.year + 1;
    else phases.push({ key, from: row.year, to: row.year + 1, st: row.st, income: row.income });
  }
  // 只剩一人：較晚過世的一方獨自生活的年數與自己的保底收入
  const [a, b] = people;
  const survivor = a.lifeYear === b.lifeYear ? null : a.lifeYear > b.lifeYear ? a : b;
  const both = years.find((x) => x.st.every((s) => s === 'full'));
  return {
    people, years, phases: phases.map(({ key, ...p }) => p),
    bothFull: both ? both.income : null,
    survivor: survivor && { name: survivor.name, years: Math.abs(a.lifeYear - b.lifeYear), from: Math.min(a.lifeYear, b.lifeYear), income: survivor.floorPV },
  };
}

/**
 * 勞退自提「適不適合你」：依個人資料逐項判斷，ok 為 true（有利自提）、false（不利）、null（中性）。
 * 另附自己投資報酬 0–12% 的終值曲線，用來畫打平點。
 */
export function selfRateFit(state, nowYear = new Date().getFullYear()) {
  const a = selfContributionAnalysis(state, nowYear);
  const r = compute(state, nowYear);
  const expense = num(state.monthlyExpense);
  const cash = state.holdings.filter((h) => h.kind === 'cash').reduce((t, h) => t + holdingValue(h, state.fx), 0);
  const bigOut = (state.events || []).filter((e) => e.kind === 'out' && e.age < a.startAge && e.age >= r.me.age && num(e.amount) >= Math.max(300000, expense * 12));
  const mRate = Math.round(a.marginal * 100);
  const items = [
    { id: 'tax', icon: 'receipt', title: '稅率',
      ok: a.marginal >= 0.12 ? true : a.marginal > 0 ? null : false,
      detail: a.marginal >= 0.12 ? `邊際稅率 ${mRate}%，節稅效果明顯` : a.marginal > 0 ? `邊際稅率 ${mRate}%，有節稅但幅度小` : '目前不用繳綜所稅，沒有節稅效果' },
    { id: 'cash', icon: 'wallet', title: '緊急預備金',
      ok: expense > 0 ? cash >= expense * 6 : null,
      detail: expense > 0 ? (cash >= expense * 6 ? `現金約 ${Math.floor(cash / expense)} 個月生活費，夠應急` : `現金只有約 ${(cash / expense).toFixed(1)} 個月生活費，建議先存到 6 個月`) : '未填生活費，無法判斷' },
    { id: 'events', icon: 'building', title: `${a.startAge} 歲前的大筆支出`,
      ok: bigOut.length ? false : true,
      detail: bigOut.length ? `已規劃 ${bigOut.map((e) => `${e.age} 歲${e.name}`).join('、')}，這些錢自提後動不到` : '沒有規劃中的大額支出（可在投資資產頁加入人生事件）' },
    { id: 'return', icon: 'trend', title: '和自己投資比',
      ok: a.breakEven === null ? null : a.investReturn < a.breakEven,
      detail: a.breakEven === null ? '無法計算打平報酬率' : a.investReturn < a.breakEven
        ? `自己投資要 ${a.breakEven.toFixed(1)}% 才打平，你設定的 ${num(a.investReturn)}% 不到`
        : `你設定的 ${num(a.investReturn)}% 高於打平點 ${a.breakEven.toFixed(1)}%，但沒有保證` },
    { id: 'lock', icon: 'hourglass', title: '鎖定時間',
      ok: a.lockedYears <= 15 ? true : a.lockedYears > 25 ? false : null,
      detail: `要再等 ${a.lockedYears} 年（${a.accessAge} 歲，仍在職也能領）才能動用${a.lockedYears > 25 ? '，期間很長、變數多' : a.lockedYears <= 15 ? '，時間不算長' : ''}` },
    { id: 'monthly', icon: 'landmark', title: '能不能月領',
      ok: r.me.laborOfficial.eligible ? true : null,
      detail: r.me.laborOfficial.eligible ? `新制年資約 ${Math.round(r.me.laborOfficial.newYears)} 年，可以選月領或一次領` : '新制年資未滿 15 年，只能一次領' },
  ];
  const yes = items.filter((x) => x.ok === true).length, no = items.filter((x) => x.ok === false).length;
  const level = a.marginal === 0 || no >= 3 ? 'low' : yes >= 4 && no <= 1 ? 'high' : 'mid';
  const fv = (m, p) => growLump(growMonthly(m, a.years, p), Math.max(0, a.startAge - state.self.retireAge), p);
  const curve = [];
  for (let p = 0; p <= 12; p += 0.5) curve.push({ r: p, v: fv(a.afterTaxMonthly, p) });
  return { a, items, yes, no, level, curve };
}

/* ── 決策評分卡：把各項條件整理成 ✓（有利）／✕（不利）／–（中性），再給一句結論 ── */
function fitLevel(items) {
  const yes = items.filter((x) => x.ok === true).length, no = items.filter((x) => x.ok === false).length;
  const level = yes > no ? 'high' : no > yes ? 'low' : 'mid';
  return { items, yes, no, level };
}
/** 退休後不靠某項給付時，其他收入（今日幣值）是否仍足以支應生活費 */
function coversWithout(r, state, monthlyNominal) {
  const expense = num(state.monthlyExpense);
  if (expense <= 0) return null;
  return (r.total - monthlyNominal) * r.pvFactor >= expense;
}

/** 勞保：延後請領適不適合 */
export function insClaimFit(state, nowYear = new Date().getFullYear()) {
  const o = insuranceClaimOptions(state, nowYear);
  if (!o || o.opts.length < 2) return null;
  const r = compute(state, nowYear);
  const cover = coversWithout(r, state, r.me.insMonthly);
  const items = [
    { id: 'life', icon: 'hourglass', title: '預期壽命',
      ok: o.best > o.legal ? true : o.best < o.legal ? false : null,
      detail: `活到 ${o.lifeAge.toFixed(0)} 歲時，${o.best} 歲開始領累計最多` },
    { id: 'cover', icon: 'wallet', title: '延後期間的生活費',
      ok: cover,
      detail: cover === null ? '未填生活費，無法判斷' : cover ? '不靠勞保，其他收入也夠支應生活費' : '勞保是重要收入，延後期間要另外準備' },
    { id: 'retire', icon: 'briefcase', title: '退休時間',
      ok: state.self.retireAge >= o.legal ? true : state.self.retireAge < o.legal - 2 ? false : null,
      detail: state.self.retireAge >= o.legal ? `${state.self.retireAge} 歲才退休，延後請領不會多出空窗` : `${state.self.retireAge} 歲退休，越晚領空窗期越長` },
    { id: 'cut', icon: 'shield', title: '給付調降的疑慮',
      ok: num(state.insHaircut) > 0 ? false : null,
      detail: num(state.insHaircut) > 0 ? `你設定勞保打 ${100 - num(state.insHaircut)}% 的壓力測試，早領先拿到手較安心` : '未設定勞保打折壓力測試' },
  ];
  return { ...fitLevel(items), o };
}

/** 勞保：年金 vs 一次請領 */
export function insLumpFit(state, nowYear = new Date().getFullYear()) {
  const c = insuranceLumpVsAnnuity(state, nowYear);
  if (!c.eligible) return null;
  const r = compute(state, nowYear);
  const cover = coversWithout(r, state, r.me.insMonthly);
  const items = [
    { id: 'life', icon: 'hourglass', title: '預期壽命 vs 回本',
      ok: c.breakEvenAge !== null && c.lifeAge > c.breakEvenAge,
      detail: `年金領到 ${c.breakEvenAge.toFixed(1)} 歲追上一次領；你的預期壽命 ${c.lifeAge.toFixed(1)} 歲` },
    { id: 'invest', icon: 'trend', title: '一次領拿去投資',
      ok: c.breakEvenDiscounted === null ? false : c.lifeAge > c.breakEvenDiscounted,
      detail: c.breakEvenDiscounted === null ? `以年化 ${num(state.postReturn)}% 投資，年金一直追不上` : `以年化 ${num(state.postReturn)}% 投資時，年金要領到 ${c.breakEvenDiscounted.toFixed(1)} 歲才追上` },
    { id: 'cover', icon: 'wallet', title: '其他收入夠不夠',
      ok: cover === null ? null : cover ? null : true,
      detail: cover === null ? '未填生活費，無法判斷' : cover ? '其他收入已夠生活，一次領的彈性較有價值' : '勞保是主要收入，年金按月入帳較保險' },
    { id: 'cut', icon: 'shield', title: '給付調降的疑慮',
      ok: num(state.insHaircut) > 0 ? false : null,
      detail: num(state.insHaircut) > 0 ? '你設定了勞保打折，擔心調降的人常選一次領' : '未設定勞保打折壓力測試' },
  ];
  // 累計領取：年金逐年累加、一次領為定額、一次領拿去投資則逐年滾存
  const g = num(state.postReturn) / 100;
  const curve = [];
  for (let age = c.claimAge; age <= 100; age++) {
    const t = age - c.claimAge;
    curve.push({ age, annuity: c.annuity * 12 * t, lump: c.lump, invested: c.lump * Math.pow(1 + g, t) });
  }
  return { ...fitLevel(items), c, curve };
}

/** 勞退：月領 vs 一次領 */
export function laborChoiceFit(state, nowYear = new Date().getFullYear()) {
  const c = laborLumpVsMonthly(state, nowYear);
  if (c.pool <= 0 || !c.eligible) return null;
  const r = compute(state, nowYear);
  const cover = coversWithout(r, state, r.me.laborRetire);
  const items = [
    { id: 'life', icon: 'hourglass', title: '月領能不能領到老',
      ok: c.outlive <= 0,
      detail: c.outlive <= 0 ? `月領到 ${c.endAge} 歲，涵蓋你的預期壽命` : `月領到 ${c.endAge} 歲就結束，比預期壽命早 ${c.outlive.toFixed(1)} 年` },
    { id: 'rate', icon: 'trend', title: '自己管理要多少報酬',
      ok: c.needRate === null ? true : c.needRate > c.officialRate,
      detail: c.needRate === null ? '自己投資報酬再高也撐不到預期壽命' : `一次領出要年化 ${c.needRate.toFixed(2)}% 才能每月同額領到老` },
    { id: 'self', icon: 'sliders', title: '你設定的退休後報酬',
      ok: c.needRate === null ? null : c.selfInvest.rate >= c.needRate ? false : true,
      detail: c.selfInvest.lastsUntil >= 100 ? `以 ${c.selfInvest.rate}% 自己管理可領到 100 歲以上` : `以 ${c.selfInvest.rate}% 自己管理約領到 ${c.selfInvest.lastsUntil.toFixed(1)} 歲` },
    { id: 'cover', icon: 'wallet', title: '其他收入夠不夠',
      ok: cover === null ? null : cover ? null : true,
      detail: cover === null ? '未填生活費，無法判斷' : cover ? '其他收入已夠生活，一次領可保留彈性與傳承' : '勞退是重要收入，月領可避免花太快' },
  ];
  // 累計領到的錢：月領到 endAge 停止；一次領自己管理、每月領同額直到用完
  const j = Math.pow(1 + c.selfInvest.rate / 100, 1 / 12) - 1;
  const curve = [];
  let bal = c.pool, got = 0;
  for (let age = c.startAge; age <= 100; age++) {
    curve.push({ age, monthly: c.monthly * 12 * Math.max(0, Math.min(age, c.endAge) - c.startAge), self: got });
    for (let k = 0; k < 12 && bal > 0; k++) { const pay = Math.min(bal, c.monthly); got += pay; bal = (bal - pay) * (1 + j); }
  }
  return { ...fitLevel(items), c, curve };
}

/**
 * 勞退滿 60 歲先領（仍在職也可以，勞保局：年滿 60 歲不論是否在職即可請領；之後雇主續提，每年可再請領一次）。
 * 只在 60 歲後才退休時有意義。比較「60 歲先領」與「退休時才領」。
 */
export function laborEarlyClaim(state, nowYear = new Date().getFullYear()) {
  const p = state.self;
  if (p.retireAge <= LABOR_PENSION_AGE) return null;
  const r = compute(state, nowYear);
  const me = r.me;
  if (!me.laborOfficial.eligible) return null;
  const acct60 = laborPensionAccount({
    salary: p.salary, growthPct: num(state.salaryGrowth), selfRate: p.selfRate, returnPct: p.laborReturn,
    workStartAge: p.workStartAge, age: me.age, retireAge: Math.max(me.age, LABOR_PENSION_AGE), nowYear, balance: p.laborBalance, pastInsYears: p.pastInsYears,
  });
  const pool60 = acct60.pool;
  const m60 = laborMonthlyOfficial(pool60, LABOR_PENSION_AGE);
  const waitYears = p.retireAge - LABOR_PENSION_AGE;
  // 60 歲後的提撥（續提）：退休時專戶總額扣掉「60 歲餘額自行滾存」的部分
  const continued = Math.max(0, me.laborPool - growLump(pool60, waitYears, p.laborReturn));
  const life = me.lifeAge;
  const early = {
    monthly: m60.monthly, endAge: m60.endAge, beforeRetire: m60.monthly * 12 * waitYears, continued,
    toLife: m60.monthly * 12 * Math.max(0, Math.min(life, m60.endAge) - LABOR_PENSION_AGE) + continued,
  };
  const wait = {
    monthly: me.laborRetire, endAge: me.laborOfficial.endAge,
    toLife: me.laborRetire * 12 * Math.max(0, Math.min(life, me.laborOfficial.endAge) - p.retireAge),
  };
  return { pool60, waitYears, early, wait, lifeAge: life, retireAge: p.retireAge };
}

/**
 * 退休後的稅：勞保年金屬保險給付免稅；勞退月退屬退職所得，每年 TAX.pensionExempt 以內免稅（115 年度）。
 * 以今日幣值、單身、只有這筆所得的情況估算超過免稅額的稅額。投資收益與健保費未計入。
 */
export function retirementTax(state, nowYear = new Date().getFullYear()) {
  const r = compute(state, nowYear);
  const laborYear = r.me.laborRetire * 12 * r.pvFactor;
  const excess = Math.max(0, laborYear - TAX.pensionExempt);
  const net = excess - TAX.exemption - TAX.standardSingle;
  return {
    insYear: r.me.insMonthly * 12 * r.pvFactor, laborYear, exempt: TAX.pensionExempt, excess,
    tax: incomeTax(net), monthlyRoom: Math.max(0, TAX.pensionExempt / 12 - r.me.laborRetire * r.pvFactor),
    laborEligible: r.me.laborOfficial.eligible,
  };
}

/** iCalendar 每行不超過 75 位元組（RFC 5545），超過時折行並以空白開頭續行 */
function foldIcs(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
/** 年度檢視提醒：每年同一天的全天行事曆事件（iCalendar），不需帳號或推播 */
export function reviewIcs({ date, url, uidSeed = 'zaomou' }) {
  const d = date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const desc = `打開早謀遠算，更新今年的月薪、勞退專戶餘額與投資資產，並在「目標與行動」記錄進度。\n${url}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SunDown Studio//zaomou//ZH-TW', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uidSeed}-${d}@sundown-studio`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`, 'RRULE:FREQ=YEARLY', `SUMMARY:${esc('退休計畫年度檢視（早謀遠算）')}`,
    `DESCRIPTION:${esc(desc)}`, `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('退休計畫年度檢視')}`, 'TRIGGER:PT9H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].map(foldIcs).join('\r\n') + '\r\n';
}

/**
 * 由勞退明細解析結果產生建議套用的欄位（只列出與目前設定不同的），預設勾選可靠的項目；
 * 收益率只供參考、預設不勾。
 */
export function laborStatementSuggestions(r, state, nowYear = new Date().getFullYear()) {
  if (!r) return [];
  const p = state.self;
  const roc = (x) => `${x.year} 年 ${x.month} 月`;
  const out = [];
  const add = (path, label, from, to, value, checked = true, note = '') => {
    if (value === null || value === undefined || Number.isNaN(value) || from === to) return;
    out.push({ path, label, from, to, value, checked, note });
  };
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  if (r.balance !== null) add('self.laborBalance', '勞退專戶目前餘額', p.laborBalance === null ? '依年資估算' : money(p.laborBalance), money(r.balance), r.balance, true, r.last ? `截至 ${roc(r.last)}，不含尚未分配的收益` : '');
  if (r.years !== null) {
    const y = Math.round(r.years * 4) / 4;
    add('self.pastInsYears', '累計年資', p.pastInsYears === null ? '視為沒中斷' : `${p.pastInsYears} 年`, `${y} 年`, y, true, '以勞退提繳年資代入勞保年資；兩者通常接近，可再對照勞保投保紀錄');
  }
  if (r.selfRate !== null && r.selfRate !== num(p.selfRate)) add('self.selfRate', '勞退自提率', `${num(p.selfRate)}%`, `${r.selfRate}%`, r.selfRate);
  if (r.wage && Math.abs(r.wage - p.salary) / Math.max(1, p.salary) > 0.03) add('self.salary', '月薪', money(p.salary), money(r.wage), r.wage, true, '以最近一個月的提繳工資代入（依分級表，接近實際月薪）');
  if (r.complete && r.first) {
    const age = r.first.year + 1911 - p.birthYear - (r.first.month < 7 ? 0.5 : 0);
    const a = Math.max(15, Math.round(age));
    add('self.workStartAge', '第一次投保年齡', `${p.workStartAge} 歲`, `${a} 歲`, a, true, `第一筆提繳在 ${roc(r.first)}`);
  }
  if (r.growth !== null && Math.abs(r.growth - num(state.salaryGrowth)) >= 0.5) {
    const g = Math.round(r.growth * 2) / 2;
    add('salaryGrowth', '薪資年增率', `${num(state.salaryGrowth)}%`, `${g}%`, g, false, `${r.wages[0].year}–${r.wages[r.wages.length - 1].year} 年提繳工資平均每年成長 ${r.growth.toFixed(1)}%；未來不一定維持，預設不套用`);
  }
  if (r.avgReturn !== null) add('self.laborReturn', '勞退收益假設', `${num(p.laborReturn)}%`, `${(Math.round(r.avgReturn * 10) / 10)}%`, Math.round(r.avgReturn * 10) / 10, false, `你的專戶 ${r.returns[0].year}–${r.returns[r.returns.length - 1].year} 年已分配收益約年化 ${r.avgReturn.toFixed(1)}%（概估）；含近年大多頭，預設不套用`);
  return out;
}

/**
 * 解析勞保局「勞工退休金個人專戶明細資料」的文字（使用者從 PDF 全選複製貼上，只在瀏覽器內處理）。
 * 回傳專戶餘額、提繳年資、最近提繳工資與自提率、第一次提繳年月、各年提繳工資與已分配收益。
 * 容許換行或空白分隔；表頭與明細任一缺漏時，能算的照算。
 */
export function parseLaborStatement(text) {
  const t = String(text || '').replace(/[　 ]/g, ' ').replace(/，/g, ',');
  const n = (s) => +String(s).replace(/[,\s]/g, '');
  const head = (label) => { const m = t.match(new RegExp(`${label}\\s*[：:]\\s*(-?[\\d,]+)`)); return m ? n(m[1]) : null; };
  const ym = t.match(/累計提繳年資\s*[：:]\s*(\d+)\s*年\s*(\d+)\s*月/);
  const parts = ['雇主提繳累計', '個人提繳累計', '雇主提繳收益累計', '個人提繳收益累計'].map(head);
  const rows = [];
  const re = /(?:^|\s)(\d{3})(\d{2})?\s+(雇主提繳|個人提繳|雇提收益|個提收益)\s+(?:(\S*?)\s+)??(-?[\d,]+)\s+(-?[\d,]+)(?=\s|$)/g;
  let m;
  while ((m = re.exec(t))) {
    const year = +m[1], month = m[2] ? +m[2] : null;
    if (year < 94 || year > 200 || (month !== null && (month < 1 || month > 12))) continue;
    rows.push({ year, month, kind: m[3], amount: n(m[5]), running: n(m[6]) });
  }
  if (!rows.length && parts.every((x) => x === null)) return null;
  const emp = rows.filter((r) => r.kind === '雇主提繳' && r.month);
  const own = rows.filter((r) => r.kind === '個人提繳' && r.month);
  const key = (r) => r.year * 100 + r.month;
  const last = emp.length ? emp.reduce((a, b) => (key(b) > key(a) ? b : a)) : null;
  const first = emp.length ? emp.reduce((a, b) => (key(b) < key(a) ? b : a)) : null;
  const lastOwn = last ? own.find((r) => key(r) === key(last)) : null;
  // 各年平均提繳工資（雇主 6%），只取滿 12 個月的年度
  const byYear = {};
  for (const r of emp) (byYear[r.year] ||= []).push(r.amount / (EMPLOYER_RATE / 100));
  const wages = Object.entries(byYear).filter(([, v]) => v.length === 12).map(([y, v]) => ({ year: +y, avg: v.reduce((a, b) => a + b, 0) / 12 }));
  let growth = null;
  if (wages.length >= 3) {
    const a = wages[0], b = wages[wages.length - 1];
    growth = (Math.pow(b.avg / a.avg, 1 / (b.year - a.year)) - 1) * 100;
  }
  // 已分配收益的年化（以年初餘額＋當年提繳一半為基礎概估，僅供參考）
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  // 明細可能只從某年開始（前面合併成「以前年度」），以第一筆的累計金額回推起始餘額
  let bal = rows.length ? rows[0].running - rows[0].amount : 0;
  const returns = [];
  for (const y of years) {
    const contrib = rows.filter((r) => r.year === y && r.month).reduce((s, r) => s + r.amount, 0);
    const inc = rows.filter((r) => r.year === y && !r.month).reduce((s, r) => s + r.amount, 0);
    const base = bal + contrib / 2;
    if (base > 0 && inc !== 0) returns.push({ year: y, rate: (inc / base) * 100 });
    bal += contrib + inc;
  }
  const geo = returns.length >= 3 ? (Math.exp(returns.reduce((s, r) => s + Math.log(1 + r.rate / 100), 0) / returns.length) - 1) * 100 : null;
  const headerTotal = parts.every((x) => x !== null) ? parts.reduce((a, b) => a + b, 0) : null;
  const lastRunning = rows.length ? rows[rows.length - 1].running : null;
  return {
    balance: headerTotal ?? lastRunning,
    years: ym ? +ym[1] + +ym[2] / 12 : null,
    employer: parts[0], own: parts[1], income: parts[2] !== null && parts[3] !== null ? parts[2] + parts[3] : null,
    wage: last ? Math.round(last.amount / (EMPLOYER_RATE / 100)) : null,
    selfRate: last ? Math.round(((lastOwn ? lastOwn.amount : 0) / last.amount) * EMPLOYER_RATE * 2) / 2 : null,
    first: first && { year: first.year, month: first.month },
    last: last && { year: last.year, month: last.month },
    wages, growth, returns, avgReturn: geo, rows: rows.length,
    consistent: headerTotal !== null && lastRunning !== null ? headerTotal === lastRunning : null,
    complete: rows.length ? rows[0].running === rows[0].amount : false, // 從第一筆提繳開始（沒有「以前年度」合併列）
  };
}
