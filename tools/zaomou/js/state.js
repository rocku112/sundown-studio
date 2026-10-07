/* 早謀遠算 · 狀態：預設值、儲存、匯出入、舊版遷移 */

export const STORAGE_KEY = 'zaomou_v2';
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
      selfRate: 0, laborReturn: 4, laborBalance: null, oldSystemYears: 0,
    },
    spouse: {
      enabled: false, name: '配偶', birthYear: nowYear - 35, gender: 'female', workStartAge: 23, retireAge: 65,
      salary: 40000, insMode: 'auto', insGrade: 11, selfRate: 0, laborReturn: 4, laborBalance: null, oldSystemYears: 0,
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
  };
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
  s.portfolios = s.portfolios.map((p) => ({
    ...merge({ id: uid('p'), name: '投資組合', assets: [] }, p),
    assets: (p.assets || []).map((a) => merge({ id: uid('a'), name: '標的', monthly: 0, rate: 0 }, a)),
  }));
  for (const k of ['laborBalance']) {
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
