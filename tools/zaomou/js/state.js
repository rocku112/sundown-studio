/* 早謀遠算 · 狀態：預設值、儲存、匯出入、舊版遷移 */

export const STORAGE_KEY = 'zaomou_v2';
export const SEED_KEY = 'zaomou_seed'; // 介紹頁迷你試算帶入完整版的數字（sessionStorage）
const LEGACY_KEY = 'nuclear_retirement_v1';
export const SCHEMA = 2;

let seq = 0;
export const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function defaults(nowYear = new Date().getFullYear()) {
  return {
    schema: SCHEMA,
    self: {
      birthYear: nowYear - 35, gender: 'male', workStartAge: 23, retireAge: 65,
      salary: 45000, insMode: 'auto', insGrade: 11,
      selfRate: 0, laborReturn: 4, laborBalance: null, oldSystemYears: 0, insClaimAge: null, bonusMonths: 0, taxRateOverride: null,
      pastInsYears: null, // 已累積勞保年資（選填）：工作中斷或打工時填，留白表示開始投保後沒有中斷
    },
    spouse: {
      enabled: false, name: '配偶', birthYear: nowYear - 35, gender: 'female', workStartAge: 23, retireAge: 65,
      salary: 40000, insMode: 'auto', insGrade: 11, selfRate: 0, laborReturn: 4, laborBalance: null, oldSystemYears: 0, insClaimAge: null, pastInsYears: null,
    },
    salaryGrowth: 2,
    cpi: 2,
    benefit: { enabled: false, name: '員工持股信託', self: 2000, company: 2000, rate: 5 },
    holdings: [
      { id: 'h1', name: '台股 ETF', kind: 'tw', shares: 2, price: 150, amount: 0, rate: 6 },
      { id: 'h2', name: '銀行存款', kind: 'cash', shares: 0, price: 0, amount: 500000, rate: 1.5 },
    ],
    fx: 32,
    portfolios: [
      {
        id: 'p1', name: '核心組合',
        assets: [
          { id: 'a1', name: '台股市值型 ETF', monthly: 5000, rate: 6 },
          { id: 'a2', name: '全球股票 ETF', monthly: 5000, rate: 6 },
        ],
      },
    ],
    payoutMode: 'divisor',
    postReturn: 3,
    lifeAgeOverride: null,
    healthAgeOverride: null,
    monthlyExpense: 31000,
    region: '',
    targetMonthly: 50000,
    investReturn: 6,
    insHaircut: 0, // 勞保給付打折壓力測試（%）
    volatility: 12, // 蒙地卡羅：投資年化波動度假設（%）
    care: { enabled: false, startAge: 80, monthly: 30000 }, // 晚年照護支出（今日幣值）
    events: [], // 人生重大事件 { id, name, age, amount（今日幣值）, kind: 'out'|'in' }
    actionsDone: {}, // 行動清單勾選狀態 { id: true }
    tracking: { baseline: null, checkins: [] }, // 年度進度追蹤：基準計畫與每次實際記錄
  };
}

/* ── 快速開始範本（數字為示意，套用後可再調整） ── */
export function templates(nowYear = new Date().getFullYear()) {
  const base = () => defaults(nowYear);
  const pf = (monthly) => (monthly > 0 ? [{ id: 'p1', name: '定期投資', assets: [{ id: 'a1', name: '市值型 ETF', monthly, rate: 6 }] }] : []);
  const cash = (amount) => ({ id: 'h-cash', name: '銀行存款', kind: 'cash', shares: 0, price: 0, amount, rate: 1.5 });
  const etf = (amount) => ({ id: 'h-etf', name: '已持有 ETF', kind: 'fund', shares: 0, price: 0, amount, rate: 6 });
  const list = [
    { id: 'fresh', name: '社會新鮮人', desc: '25 歲、月薪 3.2 萬、剛開始存錢', make: () => {
      const s = base(); Object.assign(s.self, { birthYear: nowYear - 25, workStartAge: 23, salary: 32000, selfRate: 0, bonusMonths: 1 });
      s.holdings = [cash(100000)]; s.portfolios = pf(3000); s.monthlyExpense = 25000; s.targetMonthly = 40000; return s; } },
    { id: 'single', name: '單身上班族', desc: '35 歲、月薪 5 萬、每月投資 1 萬', make: () => {
      const s = base(); Object.assign(s.self, { birthYear: nowYear - 35, workStartAge: 23, salary: 50000, selfRate: 0, bonusMonths: 2 });
      s.holdings = [cash(600000), etf(400000)]; s.portfolios = pf(10000); s.monthlyExpense = 31000; s.targetMonthly = 50000; return s; } },
    { id: 'family', name: '雙薪家庭', desc: '40 歲、夫妻月薪 6 萬＋5 萬、有子女教育支出', make: () => {
      const s = base(); Object.assign(s.self, { birthYear: nowYear - 40, workStartAge: 24, salary: 60000, selfRate: 3, bonusMonths: 2 });
      Object.assign(s.spouse, { enabled: true, name: '配偶', birthYear: nowYear - 38, gender: 'female', workStartAge: 24, salary: 50000, selfRate: 0 });
      s.holdings = [cash(1000000), etf(800000)]; s.portfolios = pf(15000); s.monthlyExpense = 50000; s.targetMonthly = 80000;
      s.events = [{ id: 'e1', name: '子女大學學費', age: 50, amount: 1000000, kind: 'out' }]; return s; } },
    { id: 'near', name: '接近退休', desc: '55 歲、勞退累積 250 萬、想確認夠不夠', make: () => {
      const s = base(); Object.assign(s.self, { birthYear: nowYear - 55, workStartAge: 25, salary: 70000, selfRate: 6, laborBalance: 2500000, bonusMonths: 2 });
      s.holdings = [cash(3000000), etf(2000000)]; s.portfolios = pf(20000); s.monthlyExpense = 40000; s.targetMonthly = 55000;
      s.care = { enabled: true, startAge: 80, monthly: 30000 }; return s; } },
    { id: 'fire', name: '提早退休', desc: '35 歲、月薪 8 萬、每月投資 4 萬、50 歲退休', make: () => {
      const s = base(); Object.assign(s.self, { birthYear: nowYear - 35, workStartAge: 23, salary: 80000, selfRate: 6, retireAge: 50, bonusMonths: 3 });
      s.holdings = [cash(800000), etf(2500000)]; s.portfolios = pf(40000); s.monthlyExpense = 40000; s.targetMonthly = 50000; return s; } },
  ];
  return list.map((t) => ({ ...t, make: () => normalize(t.make()) }));
}

/* 以預設值為骨架合併，缺漏欄位補齊、型別不符者丟棄 */
function merge(base, src) {
  if (Array.isArray(base)) return Array.isArray(src) ? src : base;
  if (base === null) return src === undefined ? null : src;
  if (typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = src && k in src ? merge(base[k], src[k]) : base[k];
    return out;
  }
  if (typeof base === 'number') return Number.isFinite(+src) && src !== '' && src !== null ? +src : base;
  if (typeof base === 'boolean') return typeof src === 'boolean' ? src : base;
  return typeof src === 'string' ? src : base;
}

export function normalize(raw) {
  const s = merge(defaults(), raw || {});
  s.schema = SCHEMA;
  s.holdings = s.holdings.map((h) => merge({ id: uid('h'), name: '資產', kind: 'tw', shares: 0, price: 0, amount: 0, rate: 0 }, h));
  s.events = s.events.map((e) => merge({ id: uid('e'), name: '事件', age: 50, amount: 0, kind: 'out' }, e));
  s.portfolios = s.portfolios.map((p) => ({
    ...merge({ id: uid('p'), name: '投資組合', assets: [] }, p),
    assets: (p.assets || []).map((a) => merge({ id: uid('a'), name: '標的', monthly: 0, rate: 0 }, a)),
  }));
  for (const k of ['laborBalance', 'insClaimAge', 'taxRateOverride', 'pastInsYears']) {
    for (const who of ['self', 'spouse']) {
      const v = raw?.[who]?.[k];
      s[who][k] = v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v;
    }
  }
  for (const k of ['lifeAgeOverride', 'healthAgeOverride']) {
    const v = raw?.[k];
    s[k] = v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v;
  }
  return s;
}

/* 舊版（壓縮 React 版）localStorage 格式轉新版 */
export function migrateLegacy(d) {
  const s = defaults();
  if (d.birthDate) s.self.birthYear = parseInt(String(d.birthDate).slice(0, 4), 10) || s.self.birthYear;
  if (d.gender) s.self.gender = d.gender;
  if (d.retireAge) s.self.retireAge = d.retireAge;
  if (d.workStartAge) s.self.workStartAge = d.workStartAge;
  if (d.insMode) s.self.insMode = d.insMode;
  if (d.manualInsGrade) s.self.insGrade = Math.max(1, Math.min(11, d.manualInsGrade - 1));
  if (d.selfRate !== undefined) s.self.selfRate = d.selfRate;
  if (d.returnRate) s.self.laborReturn = d.returnRate;
  if (d.hasOldSystem && d.oldSystemYears) s.self.oldSystemYears = d.oldSystemYears;
  if (d.salaryGrowth !== undefined) s.salaryGrowth = d.salaryGrowth;
  if (d.cpiPct !== undefined) s.cpi = d.cpiPct;
  if (d.monthlyExpense) s.monthlyExpense = d.monthlyExpense;
  if (d.customAvgLife) s.lifeAgeOverride = d.customAvgLife;
  if (d.customHealthAge) s.healthAgeOverride = d.customHealthAge;
  if (d.spouseOn) {
    Object.assign(s.spouse, {
      enabled: true, name: d.spouseName || '配偶', salary: d.spouseGradeSalary || s.spouse.salary,
      workStartAge: d.spouseWorkStartAge || 23, retireAge: d.spouseRetireAge || 65,
      selfRate: d.spouseSelfRate ?? 0, laborReturn: d.spouseReturnRate || 4,
      oldSystemYears: d.spouseHasOldSystem ? d.spouseOldSystemYears || 0 : 0,
    });
  }
  if (Array.isArray(d.portfolios)) {
    s.portfolios = d.portfolios.map((p) => ({
      id: p.id || uid('p'), name: p.groupName || '投資組合',
      assets: (p.assets || []).map((a) => ({ id: a.id || uid('a'), name: a.name, monthly: a.monthly, rate: a.rate })),
    }));
  }
  if (Array.isArray(d.initialAssets)) {
    s.holdings = d.initialAssets.map((a) => ({
      id: a.id || uid('h'), name: a.name,
      kind: a.inputMode === 'value' ? 'cash' : a.stockType === 'us' ? 'us' : 'tw',
      shares: a.shares || 0, price: a.unitPrice || 0, amount: a.amount || 0, rate: a.rate || 0,
    }));
  }
  return normalize(s);
}

export function load() {
  try {
    const cur = localStorage.getItem(STORAGE_KEY);
    if (cur) return normalize(JSON.parse(cur));
    const old = localStorage.getItem(LEGACY_KEY);
    if (old) return migrateLegacy(JSON.parse(old));
  } catch { /* 無痕模式或資料損毀：用預設值 */ }
  return defaults();
}

/** 套用介紹頁帶來的年齡、月薪、每月投資，用過即刪 */
export function applySeed(state, nowYear = new Date().getFullYear()) {
  let seed = null;
  try {
    seed = JSON.parse(sessionStorage.getItem(SEED_KEY) || 'null');
    sessionStorage.removeItem(SEED_KEY);
  } catch { return false; }
  if (!seed) return false;
  if (Number.isFinite(seed.age)) state.self.birthYear = nowYear - seed.age;
  if (Number.isFinite(seed.salary)) state.self.salary = seed.salary;
  if (Number.isFinite(seed.invest)) {
    const first = state.portfolios[0]?.assets[0];
    if (first && state.portfolios.length === 1 && state.portfolios[0].assets.length === 1) first.monthly = seed.invest;
    else state.portfolios = [{ id: uid('p'), name: '定期投資', assets: [{ id: uid('a'), name: '定期投資', monthly: seed.invest, rate: 6 }] }];
  }
  return true;
}

/* ── 簡單版：6 個問題對應到完整設定（兩邊共用同一份資料） ── */
const amountOf = (h, fx) => (h.kind === 'cash' || h.kind === 'fund' ? Math.max(0, +h.amount || 0)
  : h.kind === 'us' ? Math.max(0, (+h.shares || 0) * (+h.price || 0) * (+fx || 32)) : Math.max(0, (+h.shares || 0) * 1000 * (+h.price || 0)));
export function easyAnswers(s) {
  const cash = s.holdings.filter((h) => h.kind === 'cash').reduce((t, h) => t + amountOf(h, s.fx), 0);
  const invest = s.holdings.filter((h) => h.kind !== 'cash').reduce((t, h) => t + amountOf(h, s.fx), 0);
  const monthly = s.portfolios.reduce((t, p) => t + p.assets.reduce((u, a) => u + (+a.monthly || 0), 0), 0);
  return {
    birthYear: s.self.birthYear, gender: s.self.gender, retireAge: s.self.retireAge, salary: s.self.salary, bonusMonths: s.self.bonusMonths ?? 0,
    workStartAge: s.self.workStartAge, pastInsYears: s.self.pastInsYears ?? null, laborBalance: s.self.laborBalance ?? null,
    cash: Math.round(cash), invest: Math.round(invest), monthly: Math.round(monthly), expense: s.monthlyExpense,
  };
}
/**
 * 套用簡單版答案。只改動答案有變的部分：存款／投資金額有變才把資產明細換成兩筆，
 * 每月投資有變才換成單一定期投資；生活費同時當作目標，結果頁直接回答「夠不夠用」。
 */
export function applyEasy(s, a) {
  const next = JSON.parse(JSON.stringify(s));
  const cur = easyAnswers(s);
  Object.assign(next.self, { birthYear: a.birthYear, gender: a.gender, retireAge: a.retireAge, salary: a.salary });
  if ('bonusMonths' in a) next.self.bonusMonths = Math.max(0, +a.bonusMonths || 0);
  if ('workStartAge' in a) Object.assign(next.self, { workStartAge: a.workStartAge, pastInsYears: a.pastInsYears ?? null, laborBalance: a.laborBalance ?? null });
  if (a.cash !== cur.cash || a.invest !== cur.invest) {
    next.holdings = [
      ...(a.cash > 0 ? [{ id: 'h-easy-cash', name: '銀行存款', kind: 'cash', shares: 0, price: 0, amount: a.cash, rate: 1.5 }] : []),
      ...(a.invest > 0 ? [{ id: 'h-easy-fund', name: '股票與基金', kind: 'fund', shares: 0, price: 0, amount: a.invest, rate: next.investReturn }] : []),
    ];
  }
  if (a.monthly !== cur.monthly) {
    next.portfolios = a.monthly > 0 ? [{ id: 'p-easy', name: '定期投資', assets: [{ id: 'a-easy', name: '每月定期投資', monthly: a.monthly, rate: next.investReturn }] }] : [];
  }
  if (a.expense !== cur.expense) { next.monthlyExpense = a.expense; next.targetMonthly = a.expense; }
  return next;
}

/* ── 方案（多組設定另存，最多 5 組） ── */
export const SCENARIO_KEY = 'zaomou_scenarios_v1';
export const MAX_SCENARIOS = 5;
export function loadScenarios() {
  try {
    const list = JSON.parse(localStorage.getItem(SCENARIO_KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => x && x.id && x.data).map((x) => ({ ...x, data: normalize(x.data) })) : [];
  } catch { return []; }
}
export function saveScenarios(list) {
  try { localStorage.setItem(SCENARIO_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 忽略 */ }
}

/** 匯入檔案：接受新版或舊版格式 */
export function parseImport(text) {
  const d = JSON.parse(text);
  if (d && d.schema === SCHEMA) return normalize(d);
  if (d && (d.birthDate || d.portfolios?.[0]?.groupName !== undefined || d.initialAssets)) return migrateLegacy(d);
  if (d && d.self) return normalize(d);
  throw new Error('format');
}

/* 以 "self.salary"、"holdings.2.rate" 這類路徑讀寫 */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
export function setPath(obj, path, val) {
  const ks = path.split('.');
  const last = ks.pop();
  const tgt = ks.reduce((o, k) => o[k], obj);
  tgt[last] = val;
}

/* ── 分享連結：設定壓縮後放在網址 #share=…（hash 不會送到伺服器） ── */
export const SHARE_PREFIX = 'share=';
const b64url = {
  enc: (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); },
};
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
/** 分享時不帶個人進度（追蹤紀錄、行動勾選），只帶試算設定 */
export function shareable(state) {
  const s = JSON.parse(JSON.stringify(state));
  s.tracking = { baseline: null, checkins: [] };
  s.actionsDone = {};
  return s;
}
export async function encodeShare(state) {
  const raw = new TextEncoder().encode(JSON.stringify(shareable(state)));
  return b64url.enc(await pipe(raw, new CompressionStream('deflate-raw')));
}
export async function decodeShare(code) {
  const raw = await pipe(b64url.dec(code), new DecompressionStream('deflate-raw'));
  return parseImport(new TextDecoder().decode(raw));
}
