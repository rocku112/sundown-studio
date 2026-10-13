"""市場傳導艙 · 真實校準（事件研究法）

資料
  · 台股日線：swing/data/prices（證交所＋櫃買中心官方日線，ret 為還原股息後日報酬）
  · 月營收：swing/data/revenue.json（公開資訊觀測站）
  · 美國總經：FRED（核心 CPI、非農、核心 PCE、零售銷售、密大信心、2 年期公債殖利率）
  · FOMC 決議日：Federal Reserve 官網行事曆
做法
  1. 36 個台股板塊各自組成等權籃子（成交值前 30 檔個股），扣掉 0050 的市場模型得到超額報酬 AR
  2. 事件日依「台北公布時刻」對應到第一個能反應的台股交易日
  3. 有意外值的事件：CAR[0..H] 對標準化意外值 z 做 OLS → β（%／1σ）、se、t、R²、N
     沒有意外值的事件：|CAR| 對非事件日 |CAR| 的差 → 事件窗超額波動（不分方向）
  4. 分布區間：每次事件後 T+0～T+19 的 CAR，依意外值正負拆成兩個情境，取 P10／P50／P90
  5. 個股 β：近 500 個交易日，個股日報酬對所屬板塊（排除自身）回歸
  6. 除息填息：近五年每次除息後，收盤價回到除息前收盤價所需的交易日數
用法：python calibrate.py <repo 根目錄> <輸出 json> <快取目錄>
"""
import gzip, json, glob, re, sys, math, pathlib, urllib.request, datetime as dt
from collections import defaultdict
import numpy as np

ROOT, OUT, CACHE = map(pathlib.Path, sys.argv[1:4])
CACHE.mkdir(parents=True, exist_ok=True)
SCRATCH = pathlib.Path(__file__).parent
# 滾動視窗：載入近 10.5 年日線，前半年只當估計期，事件取最近 10 年到最新交易日
# （5 年時事件 × 板塊的方向前後半期無法重現；樣本加倍是降低雜訊最直接的辦法）
YEARS = 10
_today = dt.date.today()
_y, _m = _today.year - YEARS - 1, _today.month + 6
if _m > 12: _y, _m = _y + 1, _m - 12
LOAD_FROM = f'{_y}-{_m:02d}'
EV_START = dt.date(_y + (_m + 6 > 12), (_m + 6 - 1) % 12 + 1, 1)
BETA_DAYS = 500

# ───────────────────────── 1. 日線 ─────────────────────────
files = [f for f in sorted(glob.glob(str(ROOT / 'swing/data/prices/*.json.gz'))) if pathlib.Path(f).name[:7] >= LOAD_FROM]
day_rows, refs = {}, {}
for f in files:
    d = json.loads(gzip.open(f, 'rt', encoding='utf-8').read())
    day_rows.update(d['days'])
    for k, v in d.get('ref', {}).items(): refs[k] = v
tdays = sorted(day_rows)
EV_END = dt.date.fromisoformat(tdays[-1])
TIDX = {d: i for i, d in enumerate(tdays)}
codes = sorted({c for rows in day_rows.values() for c in rows})
CIDX = {c: i for i, c in enumerate(codes)}
ND, NC = len(tdays), len(codes)
RET = np.full((NC, ND), np.nan); CLOSE = np.full((NC, ND), np.nan); OPEN = np.full((NC, ND), np.nan); TURN = np.zeros(NC)
for j, d in enumerate(tdays):
    for c, v in day_rows[d].items():
        i = CIDX[c]
        if v[5] is not None: RET[i, j] = v[5] * 100
        if v[3]: CLOSE[i, j] = v[3]
        if v[0]: OPEN[i, j] = v[0]
        if v[3] and v[4]: TURN[i] += v[3] * v[4]
del day_rows
print(f'日線 {tdays[0]}～{tdays[-1]}：{ND} 個交易日、{NC} 檔', flush=True)
RET = np.clip(RET, -10.5, 10.5)       # 漲跌幅限制 10%，切掉資料異常值

# ───────────────────────── 2. 板塊對應（與頁面相同）─────────────────────────
tw = json.loads((SCRATCH / 'twall.json').read_text(encoding='utf-8'))
SEC, KIND = {}, {}
for line in tw['data'].split('\n'):
    a = line.split('|'); SEC[a[0]] = a[3]; KIND[a[0]] = int(a[2])
orig = (SCRATCH / 'orig.html').read_text(encoding='utf-8')
mt = orig[orig.index('const MASTER_TW=['):orig.index('const MASTER_US=[')]
for m in re.finditer(r'\["(\w+)","[^"]+","(tw_\w+)",\d+,[\d.]+,-?[\d.]+(?:,(\d))?\]', mt):
    SEC[m.group(1)] = m.group(2); KIND[m.group(1)] = int(m.group(3) or 0)
SECTORS = sorted({s for s in SEC.values()})

# 板塊籃子：成交值前 30 檔個股、等權
mkt = RET[CIDX['0050']]
SR, SSUM, SCNT, MEMBERS = {}, {}, {}, {}
for s in SECTORS:
    mem = [CIDX[c] for c, sv in SEC.items() if sv == s and KIND.get(c, 0) == 0 and c in CIDX]
    mem = sorted(mem, key=lambda i: -TURN[i])[:30]
    if len(mem) < 2: continue
    M = RET[mem]; cnt = np.sum(~np.isnan(M), 0); sm = np.nansum(M, 0)
    r = np.where(cnt >= 2, sm / np.maximum(cnt, 1), np.nan)
    SR[s], SSUM[s], SCNT[s], MEMBERS[s] = r, sm, cnt, set(mem)

# 長歷史（fetch_hist.py：Yahoo）：美股、台股債券／海外 ETF、配息 ETF
HP = CACHE / 'hist.json.gz'
HIST = json.loads(gzip.decompress(HP.read_bytes()).decode('utf-8')) if HP.exists() else {}
def hist_ret(sym, days):
    h = HIST.get(sym)
    if not h: return None
    m = {d: a for d, a in zip(h['d'], h['a']) if a}
    out = np.full(len(days), np.nan); prev = None
    for j, d in enumerate(days):
        a = m.get(d)
        if a is not None and prev is not None: out[j] = (a / prev - 1) * 100
        if a is not None: prev = a
        elif d in m: prev = None
    return np.clip(out, -25, 25)
# 官方日線沒有的 ETF 板塊（債券 ETF、海外 ETF）：用 Yahoo 還原收盤組等權籃子
EXT_TW = {}
for s in SECTORS:
    if s in SR: continue
    mem = [c for c, sv in SEC.items() if sv == s and c in HIST and KIND.get(c, 0) == 1]
    R = [r for r in (hist_ret(c, tdays) for c in mem) if r is not None]
    if len(R) < 2: continue
    M = np.array(R); cnt = np.sum(~np.isnan(M), 0); sm = np.nansum(M, 0)
    SR[s] = np.where(cnt >= 2, sm / np.maximum(cnt, 1), np.nan); SSUM[s], SCNT[s] = sm, cnt
    EXT_TW[s] = dict(zip(mem, R)); MEMBERS[s] = set()
print(f'板塊籃子 {len(SR)} 個（Yahoo ETF 籃子：{sorted(EXT_TW)}）', flush=True)

def ols(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    ok = ~(np.isnan(x) | np.isnan(y)); x, y = x[ok], y[ok]; n = len(x)
    if n < 8 or np.var(x) < 1e-12: return None
    mx, my = x.mean(), y.mean(); sxx = ((x - mx) ** 2).sum()
    b = ((x - mx) * (y - my)).sum() / sxx; a = my - b * mx
    e = y - a - b * x; s2 = (e ** 2).sum() / max(1, n - 2); se = math.sqrt(s2 / sxx)
    syy = ((y - my) ** 2).sum(); r2 = max(0.0, 1 - (e ** 2).sum() / syy) if syy > 1e-12 else 0.0
    return dict(b=b, se=se, t=b / se if se > 1e-12 else 0.0, r2=r2, n=n, a=a)

# 市場模型 → 超額報酬
AR = {}
for s, r in SR.items():
    m = ols(mkt, r)
    AR[s] = r - (m['a'] + m['b'] * mkt) if m else r

# ───────────────────────── 3. 事件日期 ─────────────────────────
def clamp_day(y, m, d):  # m: 0-based
    last = (dt.date(y + (m + 1) // 12, (m + 1) % 12 + 1, 1) - dt.timedelta(days=1)).day
    return dt.date(y, m + 1, min(d, last))
def nth_dow(y, m, n, w):  # w: 0=Sun … 6=Sat（同 JS）
    first = dt.date(y, m + 1, 1); fw = (first.weekday() + 1) % 7
    return first + dt.timedelta(days=((w - fw) + 7) % 7 + (n - 1) * 7)
def first_biz(y, m):
    d = dt.date(y, m + 1, 1)
    while d.weekday() >= 5: d += dt.timedelta(days=1)
    return d
def last_of(y, m): return clamp_day(y, m, 31)

# FOMC：從 Fed 官網解析，解析失敗就用內建清單
FOMC_FALLBACK = ['2021-01-27','2021-03-17','2021-04-28','2021-06-16','2021-07-28','2021-09-22','2021-11-03','2021-12-15',
 '2022-01-26','2022-03-16','2022-05-04','2022-06-15','2022-07-27','2022-09-21','2022-11-02','2022-12-14',
 '2023-02-01','2023-03-22','2023-05-03','2023-06-14','2023-07-26','2023-09-20','2023-11-01','2023-12-13',
 '2024-01-31','2024-03-20','2024-05-01','2024-06-12','2024-07-31','2024-09-18','2024-11-07','2024-12-18',
 '2025-01-29','2025-03-19','2025-05-07','2025-06-18','2025-07-30','2025-09-17','2025-10-29','2025-12-10',
 '2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-10-28','2026-12-09']
def fomc_dates():
    try:
        html = urllib.request.urlopen(urllib.request.Request('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
                                      headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode('utf-8', 'ignore')
        MON = {m: i + 1 for i, m in enumerate(['January','February','March','April','May','June','July','August','September','October','November','December'])}
        out = []
        for ym in re.finditer(r'(\d{4}) FOMC Meetings(.*?)(?=\d{4} FOMC Meetings|$)', html, re.S):
            y = int(ym.group(1))
            for mm in re.finditer(r'fomc-meeting__month[^>]*>\s*<strong>([A-Za-z/]+)</strong>.*?fomc-meeting__date[^>]*>([\d\-–]+)', ym.group(2), re.S):
                mon = mm.group(1).split('/')[-1]; days = re.findall(r'\d+', mm.group(2))
                if mon in MON and days:
                    m2 = MON[mon]; dd = int(days[-1])
                    if '/' in mm.group(1) and int(days[-1]) < int(days[0]): pass
                    out.append(f'{y}-{m2:02d}-{dd:02d}')
        out = sorted(set(out))
        if len([d for d in out if d >= '2021']) >= 30: return out, 'Fed 官網'
    except Exception as e:
        print('FOMC 解析失敗：', e)
    return FOMC_FALLBACK, '內建清單'
_parsed, _src = fomc_dates()
# 內建清單之後的新年度會議（例如 2027）從官網補上
FOMC = FOMC_FALLBACK + [x for x in _parsed if x > FOMC_FALLBACK[-1]] if _src == 'Fed 官網' else FOMC_FALLBACK
FOMC_SRC = ('內建清單（已與 Fed 官網行事曆核對）' if _src == 'Fed 官網' else '內建清單')
print('FOMC：', FOMC_SRC, '；官網解析差異（跨月會議／非例會）：',
      sorted(set(d for d in _parsed if '2021' <= d <= '2026-12') ^ set(FOMC_FALLBACK)), flush=True)

# 與頁面 EV_TPL 相同的排程規則（m 為 0-based 月份）
TPL = {
 'twcpi':  dict(kind='總經', rt=16,   at=None),
 'twexp':  dict(kind='總經', rt=16,   at=None),
 'cbc':    dict(kind='央行', rt=16.5, at=None),
 'twrev':  dict(kind='財報', rt=17,   at=lambda y, m: clamp_day(y, m, 10)),
 'tsmcrev':dict(kind='財報', rt=14,   at=lambda y, m: clamp_day(y, m, 10)),
 'uscpi':  dict(kind='總經', rt=20.5, at=lambda y, m: clamp_day(y, m, 11)),
 'umich':  dict(kind='總經', rt=22,   at=lambda y, m: nth_dow(y, m, 2, 5)),
 'usret':  dict(kind='總經', rt=20.5, at=lambda y, m: clamp_day(y, m, 16)),
 'twq':    dict(kind='財報', rt=17,   at=lambda y, m: clamp_day(y, m, {2: 31, 4: 15, 7: 14, 10: 14}[m]) if m in (2, 4, 7, 10) else None),
 'fomc':   dict(kind='央行', rt=26,   at=None),
 'quad':   dict(kind='市場', rt=21,   at=lambda y, m: nth_dow(y, m, 3, 5) if m in (2, 5, 8, 11) else None),
 'mu':     dict(kind='財報', rt=28.5, at=lambda y, m: clamp_day(y, m, 24) if m in (2, 5, 8, 11) else None),
 'pce':    dict(kind='總經', rt=20.5, at=lambda y, m: clamp_day(y, m, 26)),
 'cnpmi':  dict(kind='總經', rt=9.5,  at=lambda y, m: last_of(y, m)),
 'ism':    dict(kind='總經', rt=22,   at=lambda y, m: first_biz(y, m)),
 'nfp':    dict(kind='總經', rt=20.5, at=lambda y, m: nth_dow(y, m, 1, 5)),
 'banks':  dict(kind='財報', rt=20,   at=lambda y, m: clamp_day(y, m, 14) if m in (0, 3, 6, 9) else None),
 'tsmc':   dict(kind='法說', rt=15,   at=lambda y, m: clamp_day(y, m, 16) if m in (0, 3, 6, 9) else None),
 'aapl':   dict(kind='財報', rt=28.5, at=lambda y, m: clamp_day(y, m, 30) if m in (0, 3, 6, 9) else None),
 'nvda':   dict(kind='財報', rt=28.5, at=lambda y, m: clamp_day(y, m, 19) if m in (1, 4, 7, 10) else None),
}
def months(a, b):
    y, m = a.year, a.month - 1
    while (y, m) <= (b.year, b.month - 1):
        yield y, m
        m += 1
        if m == 12: y, m = y + 1, 0
def react_idx(d, rt):
    """台北公布時刻之後，第一個能反應的台股交易日索引"""
    rel = dt.datetime(d.year, d.month, d.day) + dt.timedelta(hours=rt)
    key = rel.date().isoformat()
    after_close = (rel.hour, rel.minute) > (13, 30)
    for i, td in enumerate(tdays):
        if td > key or (td == key and not after_close): return i
    return None
# ── 官方排程（fetch_calendar.py → econ_cal.json：Nasdaq 經濟／財報行事曆）──
# 有排程的事件：實際公布日＋公布時刻＋「實際值 − 市場共識」；沒有排程的事件才用法定日期規則
CAL_FILE = SCRATCH / 'econ_cal.json'
ECAL = json.loads(CAL_FILE.read_text(encoding='utf-8')) if CAL_FILE.exists() else {'econ': {}, 'earn': {}}
ECON_MAP = {'uscpi': ('United States', 'Core CPI'), 'nfp': ('United States', 'Nonfarm Payrolls'),
            'pce': ('United States', 'Core PCE Price Index'), 'usret': ('United States', 'Retail Sales'),
            'umich': ('United States', 'Michigan Consumer Sentiment'), 'ism': ('United States', 'ISM Manufacturing PMI'),
            'fomc': ('United States', 'Fed Interest Rate Decision'), 'cnpmi': ('China', 'Manufacturing PMI')}
EARN_MAP = {'nvda': ('NVDA', 'after'), 'aapl': ('AAPL', 'after'), 'mu': ('MU', 'after'), 'banks': ('JPM', 'pre'), 'tsmc': ('TSM', 'pre')}
def num(v):
    if v is None: return None
    v = v.replace(',', '').replace('$', '').strip(); mult = 1
    if v[-1:] in ('K', 'M', 'B') and v[:-1]: mult = {'K': 1e3, 'M': 1e6, 'B': 1e9}[v[-1]]; v = v[:-1]
    v = v.rstrip('%')
    try: return float(v) * mult
    except ValueError: return None
def us_dst(d):
    return nth_dow(d.year, 2, 2, 0) <= d < nth_dow(d.year, 10, 1, 0)
def et_to_tpe_hours(d, hh, mm, fixed_utc4=False):
    """美東時刻 → 自台北 d 日 00:00 起算的小時數。經濟行事曆的時刻是固定 UTC−4，財報時段是真美東時間"""
    off = 12 if (fixed_utc4 or us_dst(d)) else 13
    return hh + mm / 60 + off
def pick_row(rows):
    """同名事件有月增與年增兩列（例如核心 CPI 0.3% 與 2.4%）：取數值較小、也就是月增那一列"""
    def key(r):
        v = num(r[4]) if num(r[4]) is not None else num(r[3])
        return abs(v) if v is not None else 9e9
    return min(rows, key=key)
CAL_EV, CAL_RT, CAL_X, CAL_INFO = defaultdict(list), defaultdict(dict), defaultdict(dict), {}
for k, (ctry, name) in ECON_MAP.items():
    seen_month = set()
    for iso in sorted(ECAL['econ']):
        rows = [r for r in ECAL['econ'][iso] if r[2] == ctry and r[0] == name]
        if not rows: continue
        d = dt.date.fromisoformat(iso)
        if k == 'umich':                         # 只取每月第一次（初值）
            if (d.year, d.month) in seen_month: continue
            seen_month.add((d.year, d.month))
        r = pick_row(rows)
        hh, mm = map(int, (r[1] or '08:30').split(':'))
        CAL_EV[k].append(d); CAL_RT[k][d] = et_to_tpe_hours(d, hh, mm, fixed_utc4=True)
        a, c = num(r[3]), num(r[4])
        if a is not None and c is not None: CAL_X[k][d] = a - c
    CAL_INFO[k] = f'Nasdaq 經濟行事曆：{name}（實際值 − 市場共識）'
SEC_EARN = {sym: [dt.datetime.fromisoformat(x.replace('Z', '+00:00')) for x in v] for sym, v in (ECAL.get('sec_earn') or {}).items()}
EARN_SRC = {}
for k, (sym, default) in EARN_MAP.items():
    for row in ECAL['earn'].get(sym, []):
        d = dt.date.fromisoformat(row[0]); tm = row[1]
        when = 'pre' if 'pre' in tm else 'after' if 'after' in tm else default
        CAL_EV[k].append(d); CAL_RT[k][d] = et_to_tpe_hours(d, 8, 0) if when == 'pre' else et_to_tpe_hours(d, 16, 30)
        # SEC EDGAR 8-K（item 2.02）受理時間（UTC）是實際公布時刻：前後 3 天內有就以它為準
        hit = min((x for x in SEC_EARN.get(sym, []) if abs((x.date() - d).days) <= 3), key=lambda x: abs((x.date() - d).days), default=None)
        if hit:
            tpe = hit + dt.timedelta(hours=8)
            CAL_RT[k][d] = (dt.datetime(tpe.year, tpe.month, tpe.day, tpe.hour, tpe.minute) - dt.datetime(d.year, d.month, d.day)).total_seconds() / 3600
            EARN_SRC[sym] = 'SEC EDGAR 8-K'
        x = num(row[4])
        if x is not None and num(row[2]) is not None: CAL_X[k][d] = x
    CAL_INFO[k] = f'Nasdaq 財報行事曆：{sym} EPS 驚喜幅度（%）'
# 台灣總經（fetch_tw_macro.py → tw_macro.json：央行決議列表、主計總處與財政部新聞稿）
TWM_FILE = SCRATCH / 'tw_macro.json'
TWM = json.loads(TWM_FILE.read_text(encoding='utf-8')) if TWM_FILE.exists() else {}
TW_SRC = {'cbc': '中央銀行理監事聯席會議決議', 'twcpi': '主計總處新聞稿', 'twexp': '財政部新聞稿'}
for k in ('cbc', 'twexp'):
    for x in TWM.get(k, []): CAL_EV[k].append(dt.date.fromisoformat(x))
    CAL_INFO[k] = TW_SRC[k] + '：發布日（無市場共識，只估超額波動）'
_cpi = sorted(TWM.get('twcpi', []))
for i, (x, v) in enumerate(_cpi):
    d = dt.date.fromisoformat(x); CAL_EV['twcpi'].append(d)
    prev = [w for _, w in _cpi[max(0, i - 3):i]]
    if len(prev) == 3: CAL_X['twcpi'][d] = v - sum(prev) / 3
CAL_INFO['twcpi'] = '主計總處新聞稿：CPI 年增率 − 前 3 個月平均（台灣沒有公開的市場共識）'
EVENTS, DATE_SRC = {}, {}
for k, t in TPL.items():
    t['k'] = k
    if t['at'] is None and k != 'fomc' and len(CAL_EV.get(k, [])) < 8:
        EVENTS[k] = []; DATE_SRC[k] = '無資料'; continue
    if len(CAL_EV.get(k, [])) >= 8:
        ds = sorted(set(CAL_EV[k])); DATE_SRC[k] = CAL_INFO[k].split('：')[0]
    elif k == 'fomc':
        ds = [dt.date.fromisoformat(x) for x in FOMC]; DATE_SRC[k] = 'Fed 官網行事曆'
    else:
        ds = [t['at'](y, m) for y, m in months(EV_START, EV_END)]; DATE_SRC[k] = '法定／交易所規則日期'
    EVENTS[k] = [d for d in ds if d and EV_START <= d <= EV_END]
def rt_of(d, t): return CAL_RT.get(t['k'], {}).get(d, t['rt'])
print('事件日期來源：', DATE_SRC, flush=True)

# ───────────────────────── 4. 意外值 ─────────────────────────
def fred(sid):
    p = CACHE / f'{sid}.csv'
    if not p.exists() or (dt.datetime.now().timestamp() - p.stat().st_mtime) > 20 * 3600:
        try:
            raw = urllib.request.urlopen(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}', timeout=120).read()
            p.write_bytes(raw)
        except Exception as e:
            if not p.exists(): raise
            print(f'FRED {sid} 更新失敗，沿用快取：{e}', flush=True)
    out = {}
    for line in p.read_text().splitlines()[1:]:
        d, v = line.split(',')
        if v not in ('.', ''): out[d] = float(v)
    return out
def ymk(d): return f'{d.year}-{d.month:02d}'
def prev_ym(ym, k=1):
    y, m = map(int, ym.split('-')); m -= k
    while m <= 0: m += 12; y -= 1
    return f'{y}-{m:02d}'
def monthly(s): return {k[:7]: v for k, v in s.items()}
def trend_surprise(series_fn, ym, back):
    x = series_fn(ym)
    hist = [series_fn(prev_ym(ym, i)) for i in range(1, back + 1)]
    hist = [h for h in hist if h is not None]
    if x is None or len(hist) < back // 2: return None
    return x - sum(hist) / len(hist)
def mom(s):
    return lambda ym: (s[ym] / s[prev_ym(ym)] - 1) * 100 if ym in s and prev_ym(ym) in s else None
def diff(s):
    return lambda ym: s[ym] - s[prev_ym(ym)] if ym in s and prev_ym(ym) in s else None

def fred_safe(sid):
    try: return fred(sid)
    except Exception as e:
        print(f'FRED {sid} 無法取得，相關部分略過：{e}', flush=True); return {}
cpi, nfp_s, pce_s, ret_s, um = (monthly(fred_safe(x)) for x in ['CPILFESL', 'PAYEMS', 'PCEPILFE', 'RSXFS', 'UMCSENT'])
# 核心 CPI 與非農改用美國勞工統計局官方 API（BLS Public Data API v1，免金鑰）；抓不到時沿用上面的 FRED
def bls_fetch(sids):
    """BLS Public Data API v1（POST，每次最多 3 年、每天 25 次）；兩個序列一起抓，一天 4 次請求"""
    p = CACHE / 'bls.json'
    if not p.exists() or (dt.datetime.now().timestamp() - p.stat().st_mtime) > 20 * 3600:
        out = {sid: {} for sid in sids}
        try:
            y1 = dt.date.today().year
            for a_ in range(y1 - 11, y1 + 1, 3):
                body = json.dumps({'seriesid': sids, 'startyear': str(a_), 'endyear': str(min(a_ + 2, y1))}).encode()
                req = urllib.request.Request('https://api.bls.gov/publicAPI/v1/timeseries/data/', data=body,
                                             headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})
                jj = json.loads(urllib.request.urlopen(req, timeout=60).read().decode('utf-8'))
                for ser in jj['Results']['series']:
                    for row in ser['data']:
                        if row['period'].startswith('M') and row['period'] != 'M13':
                            try: out[ser['seriesID']][f"{row['year']}-{row['period'][1:]}"] = float(row['value'])
                            except ValueError: pass                         # 「-」：該月未發布（例如政府停擺）
            if all(len(v) > 100 for v in out.values()): p.write_text(json.dumps(out), encoding='utf-8')
        except Exception as e:
            print(f'BLS API 讀取失敗，改用 FRED：{e}', flush=True)
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
_bls = bls_fetch(['CUSR0000SA0L1E', 'CES0000000001'])
_bc, _bn = _bls.get('CUSR0000SA0L1E', {}), _bls.get('CES0000000001', {})
if len(_bc) > 100: cpi = _bc
if len(_bn) > 100: nfp_s = _bn
MACRO_SRC = {'core_cpi': 'BLS API' if len(_bc) > 100 else 'FRED', 'payrolls': 'BLS API' if len(_bn) > 100 else 'FRED'}
dgs2 = fred_safe('DGS2')
rev = json.loads((ROOT / 'swing/data/revenue.json').read_text(encoding='utf-8'))['months']
def yoy_tsmc(ym):
    v = rev.get(ym, {}).get('2330'); return (v[0] / v[1] - 1) * 100 if v and v[1] else None
def yoy_all(ym):
    rows = rev.get(ym)
    if not rows: return None
    a = sum(v[0] for v in rows.values() if v[0] and v[1]); b = sum(v[1] for v in rows.values() if v[0] and v[1])
    return (a / b - 1) * 100 if b else None
def fomc_surp(d):
    keys = sorted(k for k in dgs2 if k <= d.isoformat())
    if len(keys) < 2 or keys[-1] != d.isoformat(): return None
    return (dgs2[keys[-1]] - dgs2[keys[-2]]) * 100          # 基點
SURP_FALLBACK = {
 'uscpi':  (lambda d: trend_surprise(mom(cpi), prev_ym(ymk(d)), 12),   'FRED CPILFESL：核心 CPI 月增率 − 前 12 個月平均'),
 'nfp':    (lambda d: trend_surprise(diff(nfp_s), prev_ym(ymk(d)), 12),'FRED PAYEMS：非農新增 − 前 12 個月平均'),
 'pce':    (lambda d: trend_surprise(mom(pce_s), prev_ym(ymk(d)), 12), 'FRED PCEPILFE：核心 PCE 月增率 − 前 12 個月平均'),
 'usret':  (lambda d: trend_surprise(mom(ret_s), prev_ym(ymk(d)), 12), 'FRED RSXFS：零售銷售月增率 − 前 12 個月平均'),
 'umich':  (lambda d: diff(um)(ymk(d)),                                 'FRED UMCSENT：密大信心月變動'),
 'fomc':   (fomc_surp,                                                  'FRED DGS2：決議日 2 年期殖利率變動（基點）'),
 'tsmcrev':(lambda d: trend_surprise(yoy_tsmc, prev_ym(ymk(d)), 3),    '台積電月營收年增率 − 前 3 個月平均'),
 'twrev':  (lambda d: trend_surprise(yoy_all, prev_ym(ymk(d)), 3),     '全體上市櫃月營收年增率 − 前 3 個月平均'),
}
# 有市場共識的事件一律用「實際 − 共識」；FOMC 的利率共識幾乎總是猜中，改用決議日 2 年期殖利率變動
SURP = dict(SURP_FALLBACK)
for k in CAL_X:
    if k != 'fomc' and len(CAL_X[k]) >= 12:
        SURP[k] = ((lambda kk: lambda d: CAL_X[kk].get(d))(k), CAL_INFO[k])

# ───────────────────────── 5. 事件研究 ─────────────────────────
H_BY_KIND = {'總經': 2, '央行': 2, '市場': 2, '財報': 4, '法說': 4}
DIST_H = 20
def car(r, i, h, nd):
    if i is None or i + h >= nd: return np.nan
    w = r[i:i + h + 1]
    return np.nan if np.isnan(w).sum() > 1 else float(np.nansum(w))
EVM = defaultdict(dict)        # 各市場 × 各類事件：事件窗 |CAR| ÷ 平常 |CAR|（全部板塊合併），前後半期各一份
_NULLC = {}
def null_mean_abs(key, r, H, nd):
    if key not in _NULLC:
        v = np.array([car(r, i, H, nd) for i in range(30, nd - H - 1, 3)]); v = np.abs(v[~np.isnan(v)])
        _NULLC[key] = float(v.mean()) if len(v) else np.nan
    return _NULLC[key]
def replicated(full_t, h):
    """可重現：全樣本顯著，而且前後半期各自 |t| ≥ 1、方向相同"""
    return bool(h and abs(full_t) >= 1.96 and abs(h[1]) >= 1 and abs(h[3]) >= 1 and np.sign(h[0]) == np.sign(h[2]))
def study(AR, nd, react, tag):
    """AR：{板塊: 超額報酬序列}；react(事件日, 模板) → 該市場第一個能反應的交易日索引"""
    edges, dist, cone_pool, n_occ, mode = [], defaultdict(dict), defaultdict(list), {}, {}
    for k, t in TPL.items():
        H = H_BY_KIND[t['kind']]
        if not EVENTS[k]: continue
        idx = [react(d, t) for d in EVENTS[k]]
        keep = [(d, i) for d, i in zip(EVENTS[k], idx) if i is not None and i + DIST_H < nd]
        u = None
        if k in SURP:
            raw = [SURP[k][0](d) for d, _ in keep]
            ok = [(d, i, x) for (d, i), x in zip(keep, raw) if x is not None]
            if len(ok) >= 12:
                xs = np.array([x for *_, x in ok]); z = (xs - xs.mean()) / (xs.std() or 1)
                keep = [(d, i) for d, i, _ in ok]; u = z; raw = xs
                SCEN_FREQ.setdefault(k, [int((xs > 0).sum()), int((xs < 0).sum()), int((xs == 0).sum())])
                SURP_SRC[k] = SURP[k][1]
        mode[k] = 'dir' if u is not None else 'abs'
        n_occ[k] = len(keep)
        ev_set = set()
        for _, i in keep: ev_set.update(range(i - 5, i + H + 6))
        half = len(keep) // 2
        pool = [[], [], []]          # 前半、後半、全部：|CAR| ÷ 該板塊平常 |CAR|
        for s, r in AR.items():
            cars = np.array([car(r, i, H, nd) for _, i in keep])
            nb = null_mean_abs((tag, s, H), r, H, nd)
            if nb and not np.isnan(nb):
                for j, c in enumerate(cars):
                    if not np.isnan(c):
                        pool[2].append(abs(c) / nb); pool[0 if j < half else 1].append(abs(c) / nb)
            c20 = np.array([car(r, i, DIST_H - 1, nd) for _, i in keep])
            cone_pool[t['kind']].extend(c20[~np.isnan(c20)].tolist())
            if u is not None:
                m = ols(u, cars)
                if m:
                    hh = None
                    if half >= 10:
                        ms = []
                        for sl in (slice(0, half), slice(half, None)):
                            xs_ = raw[sl]; zz = (xs_ - xs_.mean()) / (xs_.std() or 1); ms.append(ols(zz, cars[sl]))
                        if ms[0] and ms[1]: hh = [ms[0]['b'], ms[0]['t'], ms[1]['b'], ms[1]['t']]
                    edges.append(dict(frm=k, to=s, beta=m['b'], se=m['se'], t=m['t'], r2=m['r2'], n=m['n'], lag=H, kind='dir',
                                      h=hh, rep=replicated(m['t'], hh)))
                cell = {}
                # 情境 A＝意外值為正（高於共識／趨勢）、B＝為負；剛好符合的不列入兩邊（只算在 U）
                for key, sel in (('A', raw > 0), ('B', raw < 0)):
                    v = c20[sel]; v = v[~np.isnan(v)]
                    if len(v) >= 6: cell[key] = [*np.percentile(v, [10, 50, 90]).round(2).tolist(), len(v)]
                v = c20[~np.isnan(c20)]
                if len(v) >= 6: cell['U'] = [*np.percentile(v, [10, 50, 90]).round(2).tolist(), len(v)]
                if cell: dist[k][s] = cell
            else:
                ev = np.abs(cars[~np.isnan(cars)])
                null = np.array([car(r, i, H, nd) for i in range(30, nd - H - 1, 3) if i not in ev_set])
                null = np.abs(null[~np.isnan(null)])
                if len(ev) >= 8 and len(null) > 50:
                    b = ev.mean() - null.mean(); se = math.sqrt(ev.var(ddof=1) / len(ev) + null.var(ddof=1) / len(null))
                    hh = None
                    ca = np.abs(cars); e1, e2 = ca[:half], ca[half:]; e1, e2 = e1[~np.isnan(e1)], e2[~np.isnan(e2)]
                    if len(e1) >= 6 and len(e2) >= 6:
                        def _bt(e):
                            bb = e.mean() - null.mean(); ss = math.sqrt(e.var(ddof=1) / len(e) + null.var(ddof=1) / len(null))
                            return bb, (bb / ss if ss else 0)
                        hh = [*_bt(e1), *_bt(e2)]
                    edges.append(dict(frm=k, to=s, beta=b, se=se, t=b / se if se else 0, r2=0.0, n=len(ev), lag=H, kind='abs',
                                      h=hh, rep=replicated(b / se if se else 0, hh)))
                v = c20[~np.isnan(c20)]
                if len(v) >= 6: dist[k][s] = {'U': [*np.percentile(v, [10, 50, 90]).round(2).tolist(), len(v)]}
        def tmean(v):
            v = np.array(v); lo, hi = np.percentile(v, [10, 90]); return round(float(np.mean(np.clip(v, lo, hi))), 3)
        if pool[2]:
            EVM[tag][k] = [tmean(pool[2]), tmean(pool[0]) if len(pool[0]) > 10 else None,
                           tmean(pool[1]) if len(pool[1]) > 10 else None, len(keep)]
        print(f'{tag} {k:8s} {t["kind"]} {mode[k]} N={n_occ[k]}', flush=True)
    return edges, dist, cone_pool, n_occ, mode

SURP_SRC, SCEN_FREQ = {}, {}
edges, dist, cone_pool, n_occ, mode = study(AR, ND, lambda d, t: react_idx(d, rt_of(d, t)), '台股')

cone = {}
for kind, v in cone_pool.items():
    v = np.array(v); n_ev = sum(n_occ.get(k, 0) for k, t in TPL.items() if t['kind'] == kind)
    cone[kind] = {'n': n_ev, 'shape': np.percentile(v, [10, 25, 50, 75, 90]).round(2).tolist()}

# ───────────────────────── 6. 個股 β ─────────────────────────
lo = ND - BETA_DAYS
stock_beta = {}
for c, s in SEC.items():
    if c not in CIDX or s not in SR: continue
    i = CIDX[c]; y = RET[i, lo:]
    if i in MEMBERS[s]:
        sm, cnt = SSUM[s][lo:], SCNT[s][lo:]
        own = np.nan_to_num(y)
        x = np.where(cnt - (~np.isnan(y)) >= 2, (sm - own) / np.maximum(cnt - (~np.isnan(y)), 1), np.nan)
    else:
        x = SR[s][lo:]
    m = ols(x, y)
    if m and m['n'] >= 200:
        stock_beta[c] = [round(m['b'], 3), round(m['se'], 3), round(m['t'], 1), round(m['r2'], 3), m['n']]

def loo_beta(own_r, sm, cnt, lo, in_basket):
    y = own_r[lo:]
    if in_basket:
        valid = ~np.isnan(y); c2 = cnt[lo:] - valid
        x = np.where(c2 >= 2, (sm[lo:] - np.nan_to_num(y)) / np.maximum(c2, 1), np.nan)
    else:
        x = sm[lo:] / np.maximum(cnt[lo:], 1)
    m = ols(x, y)
    return [round(m['b'], 3), round(m['se'], 3), round(m['t'], 1), round(m['r2'], 3), m['n']] if m and m['n'] >= 200 else None
for s, mem in EXT_TW.items():
    for c, r in mem.items():
        b = loo_beta(r, SSUM[s], SCNT[s], lo, True)
        if b: stock_beta[c] = b

# ───────────────────────── 6b. 美股 ─────────────────────────
# 美股事件時間換成美東：夏令（3 月第二個週日～11 月第一個週日）台北 −12 小時，其餘 −13 小時。
# 美股 09:30～16:00 交易；公布時刻在當天收盤前 → 當天反應，收盤後 → 下一個交易日。
mu_src = orig[orig.index('const MASTER_US=['):]; mu_src = mu_src[:mu_src.index('];')]
US_SEC = dict(re.findall(r'\["([\w.]+)","[^"]+","(us_\w+)"', mu_src))
us_ok = 'SPY' in HIST and sum(1 for c in US_SEC if c in HIST) >= 100
US_INFO = ''
if us_ok:
    lo_us = (dt.date.fromisoformat(LOAD_FROM + '-01')).isoformat()
    udays = sorted(d for d in HIST['SPY']['d'] if d >= lo_us)
    UND = len(udays)
    umkt = hist_ret('SPY', udays)
    URET = {c: r for c in US_SEC if c in HIST for r in [hist_ret(c, udays)] if r is not None}
    USR, USUM, UCNT = {}, {}, {}
    for s in sorted(set(US_SEC.values())):
        mem = [c for c, sv in US_SEC.items() if sv == s and c in URET]
        if len(mem) < 2: continue
        M = np.array([URET[c] for c in mem]); cnt = np.sum(~np.isnan(M), 0); sm = np.nansum(M, 0)
        USR[s] = np.where(cnt >= 2, sm / np.maximum(cnt, 1), np.nan); USUM[s], UCNT[s] = sm, cnt
    UAR = {}
    for s, r in USR.items():
        m = ols(umkt, r)
        UAR[s] = r - (m['a'] + m['b'] * umkt) if m else r
    def react_us(d, t):
        rel = dt.datetime(d.year, d.month, d.day) + dt.timedelta(hours=rt_of(d, t) - (12 if us_dst(d) else 13))
        key = rel.date().isoformat(); after = (rel.hour, rel.minute) >= (16, 0)
        for i, td in enumerate(udays):
            if td > key or (td == key and not after): return i
        return None
    e2, d2, _, n2, mo2 = study(UAR, UND, react_us, '美股')
    edges += e2
    for k, v in d2.items(): dist[k].update(v)
    lo_u = UND - BETA_DAYS
    for c, s in US_SEC.items():
        if c in URET and s in USR:
            b = loo_beta(URET[c], USUM[s], UCNT[s], lo_u, True)
            if b: stock_beta[c] = b
    US_INFO = f'；美股 Yahoo 還原日線 {udays[0]}～{udays[-1]}（{len(URET)} 檔、{len(USR)} 個板塊，市場基準 SPY）'
    print(f'美股：{UND} 個交易日、{len(URET)} 檔、板塊 {len(USR)} 個', flush=True)
else:
    # 抓不到美股長歷史：沿用上一份輸出的美股部分，避免整段消失
    try:
        prev = json.loads(OUT.read_text(encoding='utf-8'))
        edges += [dict(frm=e['from'], to=e['to'], beta=e['beta'], se=e['se'], t=e['t'], r2=e['r2'], n=e['n'], lag=e['lag'], kind=e['kind'])
                  for e in prev.get('edges', []) if e['to'].startswith('us_')]
        for k, v in prev.get('dist', {}).items():
            for s, cell in v.items():
                if s.startswith('us_'): dist[k][s] = cell
        for c, b in prev.get('stock_beta', {}).items():
            if c in US_SEC: stock_beta[c] = b
        US_INFO = '；美股沿用上一份校準（本次無法取得美股日線）'
    except Exception:
        US_INFO = '；美股本次無法校準'
    print('美股：', US_INFO, flush=True)

# ───────────────────────── 7. 除息填息 ─────────────────────────
div_codes = re.findall(r'\["(\w+)", ?"(?:季配|月配|半年配)"', (SCRATCH / 'build.py').read_text(encoding='utf-8'))
fill = {}
five_ago = (dt.date.fromisoformat(tdays[-1]) - dt.timedelta(days=365 * 5)).isoformat()
for c in sorted(set(div_codes)):
    h = HIST.get(c)
    if not h or not h.get('v'): continue
    dd, cc = h['d'], h['c']; pos = {d: i for i, d in enumerate(dd)}
    days_to = []; n = 0; f20 = 0
    for ex in sorted(h['v']):
        if ex < five_ago or ex not in pos or pos[ex] == 0: continue
        j = pos[ex]; pc = cc[j - 1]
        if not pc: continue
        n += 1
        hit = next((k - j for k in range(j, min(len(dd), j + 120)) if cc[k] and cc[k] >= pc), None)
        if hit is not None: days_to.append(hit); f20 += hit < 20
    if n: fill[c] = {'n': n, 'r20': round(f20 / n, 2), 'med': (int(np.median(days_to)) if days_to else None),
                     'filled': len(days_to)}
five_i = TIDX[min(d for d in tdays if d >= (dt.date.fromisoformat(tdays[-1]) - dt.timedelta(days=365 * 5)).isoformat())]
for c in sorted(set(div_codes)):
    if c not in CIDX or c in fill: continue
    i = CIDX[c]; days_to = []; n = 0; f20 = 0
    for j in range(max(1, five_i), ND):
        pc, cl, r = CLOSE[i, j - 1], CLOSE[i, j], RET[i, j]
        if np.isnan(pc) or np.isnan(cl) or np.isnan(r): continue
        ref = cl / (1 + r / 100)                       # 還原報酬反推的除息參考價
        if ref < pc * 0.998 and (pc - ref) / pc < 0.2:  # 參考價比前收低 0.2% 以上 → 除息日
            n += 1; hit = None
            for k2 in range(j, min(ND, j + 120)):
                if CLOSE[i, k2] >= pc: hit = k2 - j; break
            if hit is not None:
                days_to.append(hit); f20 += hit < 20
    if n: fill[c] = {'n': n, 'r20': round(f20 / n, 2), 'med': (int(np.median(days_to)) if days_to else None),
                     'filled': len(days_to)}


# ───────────────────────── 7b. 放大器（實證）─────────────────────────
# 放大器回答的是：「事件發生時，如果板塊正處於某種狀態（外資大買、波動升溫…），衝擊會不會比平常大？」
# 做法：每次事件 × 每個板塊，算事件前 5 日的狀態 z 值；|z|≥1 視為「狀態異常」。
#      放大倍數 ＝ 異常時的 |CAR| ÷ 正常時的 |CAR|（|CAR| 先除以該板塊平常的 |CAR|，讓各板塊可以合併比較）。
#      同向比例 ＝ 狀態異常時，事件後板塊超額報酬方向與狀態方向一致的比例（只對有方向的狀態有意義）。
def roll_sum(x, w):
    c = np.nancumsum(np.nan_to_num(x)); out = np.full_like(x, np.nan)
    out[w:] = c[w:] - c[:-w]; return out
def zscore_hist(x, look=250):
    """x[i] 對它自己過去 look 天的標準差標準化（只用 i 之前的資料）"""
    out = np.full_like(x, np.nan)
    for i in range(look, len(x)):
        h = x[i - look:i]; h = h[~np.isnan(h)]
        if len(h) > 60 and h.std() > 1e-9: out[i] = (x[i] - h.mean()) / h.std()
    return out
def cond_series(ARm):
    """價量狀態：近 20 日累積超額報酬（動能）、20 日波動 ÷ 250 日波動（波動升溫）"""
    out = {}
    for sec, r in ARm.items():
        mom20 = roll_sum(r, 20)
        sd20 = np.array([np.nanstd(r[max(0, i - 20):i]) if i >= 20 else np.nan for i in range(len(r))])
        sd250 = np.array([np.nanstd(r[max(0, i - 250):i]) if i >= 120 else np.nan for i in range(len(r))])
        out[sec] = {'mom': zscore_hist(mom20), 'vol': (sd20 / np.where(sd250 > 1e-9, sd250, np.nan) - 1) / 0.25}
    return out

# 台股籌碼（swing/data/chips：證交所／櫃買三大法人與信用交易，前 450 大權值股）→ 板塊 5 日金額（億元）
chip_files = [f for f in sorted(glob.glob(str(ROOT / 'swing/data/chips/*.json'))) if pathlib.Path(f).name[:7] >= LOAD_FROM]
CH = {k: {} for k in ('fgn', 'itc', 'marg', 'short')}
for f in chip_files:
    dd = json.loads(pathlib.Path(f).read_text(encoding='utf-8'))
    cs = dd['codes']
    for day, rows in dd['days'].items():
        j = TIDX.get(day)
        if j is None: continue
        for c, v in zip(cs, rows):
            if c not in CIDX or not v: continue
            px = CLOSE[CIDX[c], j]
            if np.isnan(px): continue
            k2 = 1000 * px / 1e8          # 張 → 億元
            for key, idx in (('fgn', 0), ('itc', 1), ('marg', 2), ('short', 3)):
                if v[idx] is not None: CH[key].setdefault(c, {})[j] = v[idx] * k2
def chip_sector(key, diff=False):
    out = {}
    for sec in SR:
        mem = [c for c in CH[key] if SEC.get(c) == sec]
        if len(mem) < 2: continue
        x = np.zeros(ND); cnt = np.zeros(ND)
        for c in mem:
            for j, v in CH[key][c].items():
                x[j] += v; cnt[j] += 1
        x[cnt == 0] = np.nan
        if diff:                           # 融資／融券是餘額：取 5 日變化
            x5 = np.full(ND, np.nan); x5[5:] = x[5:] - x[:-5]
        else:
            x5 = roll_sum(x, 5)
        out[sec] = {'z': zscore_hist(x5), 'now': x5}
    return out
CH_LAST = max((j for d in CH['fgn'].values() for j in d), default=ND - 1)   # 籌碼最後一個有資料的交易日
# 期交所外資台指期淨未平倉（twflow/data/taifex）：收盤後才知道，對應到下一個交易日
_fi = {}
for f in sorted(glob.glob(str(ROOT / 'twflow/data/taifex/*.json'))):
    for d, v in json.loads(pathlib.Path(f).read_text(encoding='utf-8')).get('days', {}).items():
        if v.get('fi'): _fi[d] = v['fi'][0]
FUT = np.full(ND, np.nan)
for i, d in enumerate(tdays):
    if d in _fi: FUT[i] = _fi[d]
FUT5 = np.full(ND, np.nan); FUT5[5:] = FUT[5:] - FUT[:-5]
CHS = {'fgn': chip_sector('fgn'), 'itc': chip_sector('itc'), 'marg': chip_sector('marg', True), 'short': chip_sector('short', True)}
TWC = cond_series(AR)
FUT_Z = zscore_hist(FUT5, 250)

def null_abs(r, H, nd):
    v = np.array([car(r, i, H, nd) for i in range(30, nd - H - 1, 2)]); v = np.abs(v[~np.isnan(v)])
    return float(np.mean(v)) if len(v) else np.nan
def amp_est(ARm, nd, react, cond_of, directional):
    strong, weak, same = [], [], []
    base = {}
    for k, t in TPL.items():
        H = H_BY_KIND[t['kind']]
        for d in EVENTS[k]:
            i = react(d, t)
            if i is None or i < 6 or i + H >= nd: continue
            for sec, r in ARm.items():
                z = cond_of(sec)
                if z is None or np.isnan(z[i - 1]): continue
                if (sec, H) not in base: base[(sec, H)] = null_abs(r, H, nd)
                c = car(r, i, H, nd); b = base[(sec, H)]
                if np.isnan(c) or not b: continue
                v = abs(c) / b
                if abs(z[i - 1]) >= 1:
                    strong.append(v)
                    if directional and c != 0: same.append(np.sign(c) == np.sign(z[i - 1]))
                else:
                    weak.append(v)
    if len(strong) < 30 or len(weak) < 30: return None
    a, b = np.array(strong), np.array(weak)
    ratio = a.mean() / b.mean()
    se = ratio * math.sqrt(a.var(ddof=1) / (len(a) * a.mean() ** 2) + b.var(ddof=1) / (len(b) * b.mean() ** 2))
    out = {'amp': round(float(ratio), 3), 'se': round(float(se), 3), 't': round(float((ratio - 1) / se), 2) if se else 0,
           'n_strong': len(a), 'n_weak': len(b)}
    if directional and same: out['same'] = round(float(np.mean(same)), 3)
    return out

react_tw = lambda d, t: react_idx(d, rt_of(d, t))
AMP = {}
AMP_DEF = {
  'c_fgn':   ('tw', '外資買賣超', '三大法人日報 · 板塊近 5 日', lambda sec: CHS['fgn'].get(sec, {}).get('z'), True),
  'c_itc':   ('tw', '投信買賣超', '三大法人日報 · 板塊近 5 日', lambda sec: CHS['itc'].get(sec, {}).get('z'), True),
  'c_marg':  ('tw', '融資增減',   '信用交易 · 板塊融資餘額 5 日變化', lambda sec: CHS['marg'].get(sec, {}).get('z'), True),
  'c_short': ('tw', '融券增減',   '信用交易 · 板塊融券餘額 5 日變化', lambda sec: CHS['short'].get(sec, {}).get('z'), True),
  'c_fut':   ('tw', '外資期貨部位', '期交所外資台指期淨未平倉 5 日變化（2023-11 起）', lambda sec: FUT_Z, True),
  'c_mom':   ('tw', '價格動能',   '板塊近 20 日累積超額報酬', lambda sec: TWC.get(sec, {}).get('mom'), True),
  'c_vol':   ('tw', '波動升溫',   '板塊 20 日波動 ÷ 250 日波動', lambda sec: TWC.get(sec, {}).get('vol'), False),
}
for aid, (mk, name, src_txt, fn, dirn) in AMP_DEF.items():
    est = amp_est(AR, ND, react_tw, fn, dirn)
    jn = CH_LAST if aid in ('c_fgn', 'c_itc', 'c_marg', 'c_short') else (max([i for i in range(ND) if not np.isnan(FUT_Z[i])], default=ND - 1) if aid == 'c_fut' else ND - 1)
    now = {}
    for sec in AR:
        z = fn(sec)
        if z is not None and not np.isnan(z[jn]): now[sec] = round(float(z[jn]), 2)
    AMP[aid] = {'mkt': mk, 'n': name, 's': src_txt, 'est': est, 'now': now, 'asof': tdays[jn]}
if us_ok:
    USC = cond_series(UAR)
    for aid, name, src_txt, key, dirn in (('f_mom', '價格動能', '板塊近 20 日累積超額報酬（對 SPY）', 'mom', True),
                                           ('f_vol', '波動升溫', '板塊 20 日波動 ÷ 250 日波動', 'vol', False)):
        fn = (lambda kk: lambda sec: USC.get(sec, {}).get(kk))(key)
        est = amp_est(UAR, UND, react_us, fn, dirn)
        now = {sec: round(float(fn(sec)[-1]), 2) for sec in UAR if fn(sec) is not None and not np.isnan(fn(sec)[-1])}
        AMP[aid] = {'mkt': 'us', 'n': name, 's': src_txt, 'est': est, 'now': now}
# 籌碼金額的目前值（億元，近 5 日）給頁面顯示
for aid, key in (('c_fgn', 'fgn'), ('c_itc', 'itc'), ('c_marg', 'marg'), ('c_short', 'short')):
    AMP[aid]['val'] = {sec: round(float(v['now'][CH_LAST]), 2) for sec, v in CHS[key].items() if not np.isnan(v['now'][CH_LAST])}
for aid, a in AMP.items():
    e = a['est']
    print(f'放大器 {aid:7s} {a["n"]}：' + (f'×{e["amp"]}（t={e["t"]}，異常 {e["n_strong"]}／正常 {e["n_weak"]}）'
          + (f'，同向 {e["same"]:.0%}' if 'same' in e else '') if e else '樣本不足'), flush=True)

# ───────────────────────── 7c. 板塊上下游連動（實證）─────────────────────────
# 上下游配對沿用頁面的產業鏈結構；強度與時間差改用近 500 日板塊超額報酬的領先落後相關
chain_src = orig[orig.index('const CHAIN=['):]; chain_src = chain_src[:chain_src.index('];')]
CHAIN_PAIRS = re.findall(r'\["(\w+)","(\w+)",[\d.]+,\d\]', chain_src)
chain = []
for a_, b_ in CHAIN_PAIRS:
    src_ar = AR if a_ in AR and b_ in AR else (UAR if us_ok and a_ in UAR and b_ in UAR else None)
    if src_ar is None: continue
    x, y = src_ar[a_][-500:], src_ar[b_][-500:]
    best = None
    for lag in range(0, 4):
        xa, yb = (x, y) if lag == 0 else (x[:-lag], y[lag:])
        ok = ~(np.isnan(xa) | np.isnan(yb))
        if ok.sum() < 200: continue
        c = float(np.corrcoef(xa[ok], yb[ok])[0, 1])
        if best is None or abs(c) > abs(best[1]): best = (lag, c, int(ok.sum()))
    if best:
        chain.append([a_, b_, round(abs(best[1]), 3), max(1, best[0]), round(best[1], 3), best[2]])
print(f'上下游連動：{len(chain)} 條，相關係數中位數 {np.median([c[4] for c in chain]):.2f}', flush=True)

# ───────────────────────── 7d. 即時資料（頁面開啟時讀）─────────────────────────
live = {'asof_tw': tdays[-1]}
try:   # 台股板塊資金流：twflow 盤後彙整的三大法人近 5 日買賣超（億元），涵蓋全部上市櫃
    lt = json.loads((ROOT / 'twflow/web/data/latest.json').read_text(encoding='utf-8'))
    flow = defaultdict(float); fgn = itc = 0.0
    for c, v in lt['stock_data'].items():
        if v.get('net_5d_yi') is not None and SEC.get(c): flow[SEC[c]] += v['net_5d_yi']
        fgn += v.get('foreign_5d') or 0; itc += v.get('trust_5d') or 0
    live['tw_flow'] = {k: round(v, 2) for k, v in flow.items()}
    live['tw_flow_date'] = lt.get('date'); live['tw_fgn_5d'] = round(fgn, 1); live['tw_itc_5d'] = round(itc, 1)
except Exception as e:
    print('台股資金流讀取失敗：', e)
if us_ok:   # 美股沒有公開的板塊資金流；改給板塊近 5 日超額報酬（對 SPY，%）
    live['us_ret5'] = {sec: round(float(np.nansum(r[-5:])), 2) for sec, r in UAR.items()}
    live['asof_us'] = udays[-1]
try:
    ul = json.loads((ROOT / 'twflow/web/data/us/latest.json').read_text(encoding='utf-8'))
    fx = ul['stock_data'].get('TWD=X') or {}
    if fx.get('price'): live['fx'] = {'usdtwd': fx['price'], 'date': ul.get('date'), 'src': 'Yahoo TWD=X（usflow）'}
except Exception as e:
    print('匯率讀取失敗：', e)

# 台股 ETF 除息預告：證交所 TWT48U ＋ 櫃買 exright_prepost（官方，含尚未公告金額者）
def roc(sv):
    m = re.match(r'(\d{2,3})\D?(\d{2})\D?(\d{2})', sv.replace('年', '/').replace('月', '/').replace('日', ''))
    return f'{int(m.group(1)) + 1911}-{m.group(2)}-{m.group(3)}' if m else None
divs = []
try:   # 證交所 OpenAPI（官方 API）
    req = urllib.request.Request('https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL', headers={'User-Agent': 'Mozilla/5.0'})
    for r in json.loads(urllib.request.urlopen(req, timeout=40).read().decode('utf-8')):
        c = r.get('Code', '')
        if not c.startswith('00') or '息' not in r.get('Exdividend', ''): continue
        try: amt = float(r.get('CashDividend') or 0) or None
        except ValueError: amt = None
        divs.append([c, r.get('Name', '').strip(), roc(r.get('Date', '')), amt, '證交所 OpenAPI 除權除息預告表'])
except Exception as e:
    print('證交所 OpenAPI 除息預告讀取失敗：', e)
try:   # 證交所網站 JSON：OpenAPI 未列出的（例如金額待公告）再補上
    _have = {d[0] for d in divs}
    req = urllib.request.Request('https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json', headers={'User-Agent': 'Mozilla/5.0'})
    j = json.loads(urllib.request.urlopen(req, timeout=40).read().decode('utf-8'))
    for r in j.get('data', []):
        if not r[1].startswith('00') or '息' not in r[3] or r[1] in _have: continue
        amt = re.sub(r'<[^>]+>', '', r[7]); amt = float(amt) if re.match(r'^[\d.]+$', amt.strip()) and float(amt) > 0 else None
        divs.append([r[1], r[2].strip(), roc(r[0]), amt, '證交所除權除息預告表'])
except Exception as e:
    print('證交所除息預告讀取失敗：', e)
try:
    req = urllib.request.Request('https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost', headers={'User-Agent': 'Mozilla/5.0'})
    for r in json.loads(urllib.request.urlopen(req, timeout=40).read().decode('utf-8')):
        c = r.get('SecuritiesCompanyCode', '')
        if not c.startswith('00') or '息' not in r.get('ExRrightsExDividend', ''): continue
        try: amt = float(r.get('CashDividend') or 0) or None
        except ValueError: amt = None      # 「尚未公告」
        divs.append([c, r.get('CompanyName', '').strip(), roc(r.get('ExRrightsExDividendDate', '')), amt, '櫃買中心除權除息預告'])
except Exception as e:
    print('櫃買除息預告讀取失敗：', e)
today_iso = dt.date.today().isoformat()
live['div'] = sorted([d for d in divs if d[2] and d[2] >= today_iso], key=lambda d: d[2])

# 未來 120 天的官方排程（頁面的事件行事曆直接用這份，不再用規則推算）
upcoming = []
horizon = (dt.date.today() + dt.timedelta(days=120)).isoformat()
def tpe_dt(d, rt):
    x = dt.datetime(d.year, d.month, d.day) + dt.timedelta(hours=rt); return x.date().isoformat(), x.strftime('%H:%M')
for k, (ctry, name) in ECON_MAP.items():
    seen_month = set()
    for iso in sorted(ECAL['econ']):
        if iso < (dt.date.today() - dt.timedelta(days=1)).isoformat() or iso > horizon: continue
        rows = [r for r in ECAL['econ'][iso] if r[2] == ctry and r[0] == name]
        if not rows: continue
        d = dt.date.fromisoformat(iso)
        if k == 'umich':
            if (d.year, d.month) in seen_month: continue
            seen_month.add((d.year, d.month))
        r = pick_row(rows); hh, mm = map(int, (r[1] or '08:30').split(':'))
        dd, tt = tpe_dt(d, et_to_tpe_hours(d, hh, mm, fixed_utc4=True))
        upcoming.append({'k': k, 'd': dd, 't': tt, 'cons': r[4], 'prev': r[5], 'src': 'Nasdaq 經濟行事曆'})
for k, (sym, default) in EARN_MAP.items():
    for row in ECAL['earn'].get(sym, []):
        if row[0] < today_iso or row[0] > horizon: continue
        d = dt.date.fromisoformat(row[0]); tm = row[1]
        when = 'pre' if 'pre' in tm else 'after' if 'after' in tm else default
        dd, tt = tpe_dt(d, et_to_tpe_hours(d, 8, 0) if when == 'pre' else et_to_tpe_hours(d, 16, 30))
        upcoming.append({'k': k, 'd': dd, 't': tt, 'cons': row[3], 'prev': None, 'src': f'Nasdaq 財報行事曆（{sym}）'})
if not any(u['k'] == 'fomc' for u in upcoming):
    for x in FOMC:
        if today_iso <= x <= horizon:
            d = dt.date.fromisoformat(x); dd, tt = tpe_dt(d, et_to_tpe_hours(d, 14, 0))
            upcoming.append({'k': 'fomc', 'd': dd, 't': tt, 'cons': None, 'prev': None, 'src': 'Fed 官網行事曆'})
for k, src_txt in (('cbc', '中央銀行理監事聯席會議預定日期'), ('twcpi', '主計總處預告統計資料發布時間表'), ('twexp', '財政部新聞稿「下次發布日期」')):
    for x in TWM.get('next', {}).get(k, []):
        if today_iso <= x <= horizon:
            upcoming.append({'k': k, 'd': x, 't': {'cbc': '16:30', 'twcpi': '16:00', 'twexp': '16:00'}[k], 'cons': None,
                             'prev': (f"{_cpi[-1][1]}%" if k == 'twcpi' and _cpi else None), 'src': src_txt})
for k in ('twrev', 'tsmcrev', 'twq', 'quad'):   # 法定期限與交易所固定規則
    t = TPL[k]
    for y, m in months(dt.date.today(), dt.date.fromisoformat(horizon)):
        d = t['at'](y, m)
        if d and today_iso <= d.isoformat() <= horizon:
            dd, tt = tpe_dt(d, t['rt'])
            upcoming.append({'k': k, 'd': dd, 't': tt, 'cons': None, 'prev': None,
                             'src': {'twrev': '證券交易法：每月 10 日前公告營收', 'tsmcrev': '證券交易法：每月 10 日前公告營收',
                                     'twq': '證券交易法：季報法定期限', 'quad': '期交所／CBOE：季月第三個星期五'}[k]})
# Nasdaq 只提前約 3 週列出；更遠的日期用官方機關時間表與官方規則補上（同一個月已有就不重複）
def _has(k, d): return any(u['k'] == k and u['d'][:7] == d[:7] for u in upcoming)
for k, rows in (ECAL.get('official') or {}).items():
    for d, tm, srcx in rows:
        dd = dt.date.fromisoformat(d)
        if today_iso <= d <= horizon and not _has(k, d):
            hh, mm = map(int, tm.split(':')); d2, t2 = tpe_dt(dd, et_to_tpe_hours(dd, hh, mm))
            upcoming.append({'k': k, 'd': d2, 't': t2, 'cons': None, 'prev': None, 'src': srcx})
# ISM 製造業：官方規則為每月第一個營業日 10:00（美東）
for y, m in months(dt.date.today(), dt.date.fromisoformat(horizon)):
    d = first_biz(y, m)
    if d.month == 1 and d.day == 1: d += dt.timedelta(days=1)
    if d.month == 9 and d.weekday() == 0 and d.day <= 7: d += dt.timedelta(days=1)   # 勞動節
    while d.weekday() >= 5: d += dt.timedelta(days=1)
    if today_iso <= d.isoformat() <= horizon and not _has('ism', d.isoformat()):
        d2, t2 = tpe_dt(d, et_to_tpe_hours(d, 10, 0))
        upcoming.append({'k': 'ism', 'd': d2, 't': t2, 'cons': None, 'prev': None, 'src': 'ISM 官方規則（每月第一個營業日）'})
# 財報：Nasdaq 個股下次財報日（algorithm 推算者標預估）
for k, (sym, default) in EARN_MAP.items():
    nx = (ECAL.get('earn_next') or {}).get(sym)
    if not nx or not (today_iso <= nx[0] <= horizon) or any(u['k'] == k and abs((dt.date.fromisoformat(u['d']) - dt.date.fromisoformat(nx[0])).days) <= 3 for u in upcoming): continue
    d = dt.date.fromisoformat(nx[0]); when = 'pre' if 'before' in nx[2] else 'after' if 'after' in nx[2] else default
    d2, t2 = tpe_dt(d, et_to_tpe_hours(d, 8, 0) if when == 'pre' else et_to_tpe_hours(d, 16, 30))
    upcoming.append({'k': k, 'd': d2, 't': t2, 'cons': None, 'prev': None,
                     'src': f'Nasdaq 下次財報日（{sym}{"，演算法預估" if nx[1] else "，公司預告"}）'})
upcoming.sort(key=lambda u: (u['d'], u['t']))
print(f'即時資料：台股資金流 {len(live.get("tw_flow", {}))} 板塊、美股 {len(live.get("us_ret5", {}))} 板塊、'
      f'匯率 {live.get("fx", {}).get("usdtwd")}、除息預告 {len(live["div"])} 檔、未來排程 {len(upcoming)} 件', flush=True)



# ───────────────────────── 7f. 事件 → 個別 ETF（除權息雷達用）─────────────────────────
# 持有人看的是 ETF 本身的漲跌，所以用原始報酬（不扣大盤）：有意外值的事件估 β，沒有的估事件窗超額波動。
etf_ret = {}
for c, k in KIND.items():
    if k != 1: continue
    if c in CIDX and np.sum(~np.isnan(RET[CIDX[c]])) > 500: etf_ret[c] = RET[CIDX[c]]
    elif c in HIST:
        r = hist_ret(c, tdays)
        if r is not None and np.sum(~np.isnan(r)) > 500: etf_ret[c] = r
_save_scen = dict(SCEN_FREQ)
e_etf, _, _, _, _ = study(etf_ret, ND, lambda d, t: react_idx(d, rt_of(d, t)), 'ETF')
SCEN_FREQ.clear(); SCEN_FREQ.update(_save_scen)
etf_impact = defaultdict(list)
for e in e_etf:
    etf_impact[e['frm']].append([e['to'], round(e['beta'], 3), round(e['t'], 2), e['n'], e['kind'], bool(e.get('rep'))])
for k in etf_impact:
    etf_impact[k] = sorted(etf_impact[k], key=lambda x: -abs(x[2]))[:12]
print(f'事件 → ETF：{len(etf_ret)} 檔 ETF、{len(e_etf)} 條（顯著 {sum(1 for e in e_etf if abs(e["t"]) >= 1.96)}）', flush=True)

# ETF 配息頻率（twflow 的 ETF 體質表：近 12 個月官方配息次數）與近 45 天已除息清單（填息追蹤）
try:
    ep = json.loads((ROOT / 'twflow/web/data/etf_profile.json').read_text(encoding='utf-8'))
    ni = ep['fields'].index('n_div')
    FREQ = {c: {12: '月配', 4: '季配', 2: '半年配', 1: '年配'}.get(int(v[ni] or 0)) for c, v in ep['rows'].items() if v[ni]}
except Exception as e:
    FREQ = {}; print('ETF 體質表讀取失敗：', e)
live['div'] = [d + [FREQ.get(d[0])] for d in live['div']]
recent = []
_end = dt.date.today(); _st = _end - dt.timedelta(days=45)
try:
    u = f'https://www.twse.com.tw/rwd/zh/exRight/TWT49U?response=json&startDate={_st:%Y%m%d}&endDate={_end:%Y%m%d}'
    j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode('utf-8'))
    for r in j.get('data', []):
        if r[1].startswith('00') and '息' in r[6]:
            recent.append([r[1], r[2].strip(), roc(r[0]), float(r[3].replace(',', '')), float(r[5]), '證交所除權除息計算結果表'])
except Exception as e:
    print('證交所除權息結果讀取失敗：', e)
try:
    u = f'https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate={_st:%Y/%m/%d}&endDate={_end:%Y/%m/%d}&response=json'
    j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode('utf-8'))
    for r in j['tables'][0]['data']:
        if r[1].startswith('00') and float(r[6] or 0) > 0:
            recent.append([r[1], r[2].strip(), roc(r[0]), float(r[3].replace(',', '')), float(r[6]), '櫃買中心除權除息計算結果'])
except Exception as e:
    print('櫃買除權息結果讀取失敗：', e)
live['div_recent'] = sorted(recent, key=lambda x: x[2], reverse=True)
live['freq'] = FREQ
print(f'除息：預告 {len(live["div"])} 檔、近 45 天已除息 {len(recent)} 檔', flush=True)

# ───────────────────────── 7e. 巨觀環境（實證）─────────────────────────
# 三組環境都用「當天已經公布」的數據判斷（不偷看未來）：
#   利率：美國 2 年期公債殖利率近 63 個交易日（約 3 個月）上升或下降（FRED DGS2）
#   景氣：最近一次公布的 ISM 製造業指數 ≥ 50 或 < 50（Nasdaq 經濟行事曆實際值）
#   通膨：最近 3 次核心 CPI 月增率平均 高於或低於 最近 12 次平均（Nasdaq 經濟行事曆實際值）
# 每個交易日標上環境，算各板塊之後 20 個交易日的累積超額報酬；相鄰日子的 20 日窗重疊，獨立樣本約為天數 ÷ 20。
def asof_series(points, days):
    """points：[(公布日 ISO, 值)]，回傳每個交易日當下已公布的最新值"""
    pts = sorted(points); out = []; j = -1
    for d in days:
        while j + 1 < len(pts) and pts[j + 1][0] < d: j += 1     # 公布日當天盤中還不知道，隔天起才算
        out.append(pts[j][1] if j >= 0 else None)
    return out
ism_pts, ccpi_pts = [], []
for iso in sorted(ECAL['econ']):
    for name, lst in (('ISM Manufacturing PMI', ism_pts), ('Core CPI', ccpi_pts)):
        rows = [r for r in ECAL['econ'][iso] if r[2] == 'United States' and r[0] == name]
        if rows:
            v = num(pick_row(rows)[3])
            if v is not None: lst.append((iso, v))
ccpi_trend = []
for i in range(len(ccpi_pts)):
    if i >= 12:
        a3 = sum(v for _, v in ccpi_pts[i - 2:i + 1]) / 3; a12 = sum(v for _, v in ccpi_pts[i - 11:i + 1]) / 12
        ccpi_trend.append((ccpi_pts[i][0], a3 - a12))
def regime_labels(days):
    d2 = [dgs2.get(d) for d in days]
    for i in range(1, len(d2)):
        if d2[i] is None: d2[i] = d2[i - 1]
    rate = [None if i < 63 or d2[i] is None or d2[i - 63] is None else ('up' if d2[i] > d2[i - 63] else 'down') for i in range(len(days))]
    ism = asof_series(ism_pts, days); cp = asof_series(ccpi_trend, days)
    growth = [None if v is None else ('exp' if v >= 50 else 'con') for v in ism]
    infl = [None if v is None else ('up' if v > 0 else 'down') for v in cp]
    return {'rate': rate, 'growth': growth, 'infl': infl}, {'ism': ism[-1] if ism else None, 'ccpi_gap': cp[-1] if cp else None,
            'dgs2_chg': (round(d2[-1] - d2[-64], 2) if len(d2) > 64 and d2[-1] is not None and d2[-64] is not None else None)}
def regime_study(ARm, days):
    labs, nowv = regime_labels(days)
    out = {}
    fwd = {sec: np.array([np.nansum(r[i + 1:i + 21]) if i + 21 <= len(r) and np.isnan(r[i + 1:i + 21]).sum() <= 2 else np.nan
                          for i in range(len(r))]) for sec, r in ARm.items()}
    for sec, f in fwd.items():
        cell = {}
        for dim, lab in labs.items():
            for val in set(x for x in lab if x):
                v = np.array([f[i] for i in range(len(days)) if lab[i] == val]); v = v[~np.isnan(v)]
                if len(v) >= 60:
                    cell.setdefault(dim, {})[val] = [*np.percentile(v, [10, 50, 90]).round(2).tolist(), round(float(v.mean()), 2), len(v)]
        # 三個環境同時符合目前狀態的日子
        cur = {dim: next((x for x in reversed(lab) if x), None) for dim, lab in labs.items()}
        v = np.array([f[i] for i in range(len(days)) if all(labs[dm][i] == cur[dm] for dm in labs)]); v = v[~np.isnan(v)]
        if len(v) >= 40: cell['combo'] = [*np.percentile(v, [10, 50, 90]).round(2).tolist(), round(float(v.mean()), 2), len(v)]
        out[sec] = cell
    cur = {dim: next((x for x in reversed(lab) if x), None) for dim, lab in labs.items()}
    return out, cur, nowv
reg_tw, cur_tw, now_tw = regime_study(AR, tdays)
regime = {'sec': reg_tw, 'current': cur_tw, 'values': now_tw,
          'def': {'rate': '美國 2 年期殖利率近 3 個月上升／下降（FRED DGS2）',
                  'growth': 'ISM 製造業指數 ≥ 50（擴張）／< 50（收縮），取最近一次公布值',
                  'infl': '核心 CPI 月增率：近 3 次平均高於／低於近 12 次平均'}}
if us_ok:
    reg_us, _, _ = regime_study(UAR, udays)
    regime['sec'].update(reg_us)
print(f'巨觀環境：目前 {cur_tw}（{now_tw}），板塊 {len(regime["sec"])} 個', flush=True)



# ───────────────────────── 7h. 方向：兩段式因子模型 ─────────────────────────
# 逐對估「事件 × 板塊」的方向樣本太少、前後期無法重現。改成兩段：
#   第一段 γ：事件意外值 → 總經因子在事件窗的變化（美債 10 年殖利率、美元指數、原油、費半相對 S&P 500）
#   第二段 λ：板塊超額報酬對這些因子的敏感度，用全部交易日估（樣本是事件日的幾十倍）
#   預測方向 ＝ γ · λ。台股收盤早於美股，台股第 t 日對的是前一個美國交易日的因子變化。
import bisect
def _fser(sym):
    h = HIST.get(sym) or {}
    return {d: c for d, c in zip(h.get('d', []), h.get('c', [])) if c}
_tnx, _dx, _cl, _sox = _fser('^TNX'), _fser('DX-Y.NYB'), _fser('CL=F'), _fser('^SOX')
_spy = {d: a for d, a in zip(HIST.get('SPY', {}).get('d', []), HIST.get('SPY', {}).get('a', [])) if a}
FDAYS = sorted(set(_spy) & set(_tnx) & set(_dx) & set(_cl) & set(_sox))
FNAMES = ['美債殖利率', '美元', '油價', '半導體']
def _fchg():
    out = np.full((len(FDAYS), 4), np.nan)
    for j in range(1, len(FDAYS)):
        a, b = FDAYS[j - 1], FDAYS[j]
        spy_r = (_spy[b] / _spy[a] - 1) * 100
        out[j] = [(_tnx[b] - _tnx[a]) * 100, (_dx[b] / _dx[a] - 1) * 100, (_cl[b] / _cl[a] - 1) * 100, (_sox[b] / _sox[a] - 1) * 100 - spy_r]
    out[:, 2] = np.clip(out[:, 2], -15, 15)      # 2020-04 原油期貨負價格之類的極端值
    return out
FCHG = _fchg() if len(FDAYS) > 500 else None
def falign(days, lag):
    M = np.full((len(days), 4), np.nan)
    if FCHG is None: return M
    for i, d in enumerate(days):
        j = bisect.bisect_left(FDAYS, d) - (1 if lag else 0)
        if lag:
            if 0 <= j < len(FDAYS): M[i] = FCHG[j]
        elif j < len(FDAYS) and FDAYS[j] == d: M[i] = FCHG[j]
    return M
def loadings(ARm, FM, idx):
    lam = {}
    X = FM[idx]
    for sec, r in ARm.items():
        y = r[idx]; ok = ~(np.isnan(y) | np.isnan(X).any(1))
        if ok.sum() < 250: continue
        lam[sec] = np.linalg.lstsq(np.c_[np.ones(ok.sum()), X[ok]], y[ok], rcond=None)[0][1:]
    return lam
def gammas(FM, react, nd, keep_fn):
    g = {}
    for k, t in TPL.items():
        if k not in SURP or not EVENTS[k]: continue
        H = H_BY_KIND[t['kind']]
        occ = [(d, react(d, t), SURP[k][0](d)) for d in EVENTS[k] if keep_fn(d)]
        occ = [o for o in occ if o[1] is not None and o[2] is not None and o[1] + H < nd]
        if len(occ) < 10: continue
        xs = np.array([o[2] for o in occ]); z = (xs - xs.mean()) / (xs.std() or 1)
        fw = np.array([np.nansum(FM[i:i + H + 1], 0) for _, i, _ in occ])
        g[k] = (np.array([(ols(z, fw[:, j]) or {'b': 0})['b'] for j in range(4)]), xs.mean(), xs.std() or 1)
    return g
def factor_oos(ARm, days, nd, react, lag, frac=0.5, topq=0.0):
    """前 frac 的期間估 γ、λ，預測之後：照方向押的平均超額報酬、t 值（以事件為單位算，避免同事件板塊相關灌水）、命中率。
       topq>0 時只押預測幅度前 (1−topq) 的板塊（高信心）。"""
    FM = falign(days, lag); mid = days[int(len(days) * frac)]
    lam = loadings(ARm, FM, [i for i, d in enumerate(days) if d < mid])
    gam = gammas(FM, react, nd, lambda d: d.isoformat() < mid)
    per_event, hits = [], []
    for k, t in TPL.items():
        if k not in gam: continue
        H = H_BY_KIND[t['kind']]; g, mu, sd = gam[k]
        pfs = {sec: float(g @ l) for sec, l in lam.items()}
        cutv = np.percentile(np.abs(list(pfs.values())), topq * 100) if topq and pfs else 0
        for d in EVENTS[k]:
            if d.isoformat() < mid: continue
            i = react(d, t); x = SURP[k][0](d)
            if i is None or x is None or i + H >= nd or x == mu: continue
            zz = (x - mu) / sd; v = []
            for sec, r in ARm.items():
                if sec not in pfs: continue
                c = car(r, i, H, nd); pf = pfs[sec]
                if np.isnan(c) or pf == 0 or abs(pf) < cutv: continue
                v.append(np.sign(pf * zz) * c); hits.append(np.sign(pf * zz) == np.sign(c))
            if v: per_event.append(np.mean(v))
    pe = np.array(per_event)
    if len(pe) < 10: return None
    return {'mean': round(float(pe.mean()), 4), 't': round(float(pe.mean() / pe.std(ddof=1) * np.sqrt(len(pe))), 2),
            'n_events': len(pe), 'hit': round(float(np.mean(hits)), 3)}
factor = {'names': FNAMES, 'oos': {}}
if FCHG is not None:
    react_tw2 = lambda d, t: react_idx(d, rt_of(d, t))
    def oos_all(ARm, days, nd, react, lag):
        base = factor_oos(ARm, days, nd, react, lag)
        if not base: return None
        base['top30'] = factor_oos(ARm, days, nd, react, lag, 0.5, 0.7)
        base['splits'] = {f'{int(f * 100)}%': (lambda r: r and [r['mean'], r['t']])(factor_oos(ARm, days, nd, react, lag, f)) for f in (0.4, 0.5, 0.6, 0.7)}
        pos = sum(1 for v in base['splits'].values() if v and v[0] > 0)
        # 通過：50% 切分顯著為正，而且四個切分點至少三個為正
        base['pass'] = bool(base['mean'] > 0 and base['t'] >= 1.96 and pos >= 3)
        return base
    factor['oos']['tw'] = oos_all(AR, tdays, ND, react_tw2, True)
    if us_ok: factor['oos']['us'] = oos_all(UAR, udays, UND, react_us, False)
    # 全樣本估計，給頁面用
    FM_tw = falign(tdays, True); lam_all = loadings(AR, FM_tw, list(range(ND))); gam_tw = gammas(FM_tw, react_tw2, ND, lambda d: True)
    fp = {}
    for k, (g, _, _) in gam_tw.items():
        for sec, l in lam_all.items(): fp[f'{k}>{sec}'] = round(float(g @ l), 3)
    factor['gamma_tw'] = {k: [round(float(x), 3) for x in v[0]] for k, v in gam_tw.items()}
    if us_ok:
        FM_us = falign(udays, False); lam_us = loadings(UAR, FM_us, list(range(UND))); gam_us = gammas(FM_us, react_us, UND, lambda d: True)
        for k, (g, _, _) in gam_us.items():
            for sec, l in lam_us.items(): fp[f'{k}>{sec}'] = round(float(g @ l), 3)
        lam_all.update(lam_us)
        factor['gamma_us'] = {k: [round(float(x), 3) for x in v[0]] for k, v in gam_us.items()}
    factor['lambda'] = {sec: [round(float(x), 3) for x in l] for sec, l in lam_all.items()}
    factor['sd'] = [round(float(np.nanstd(FCHG[:, j])), 4) for j in range(4)]   # 各因子日變化的標準差（bp、%）
    # （試過：個股自己的因子敏感度與板塊混合，去掉前視偏誤後與只用板塊 × β 差不多，沒有採用）
    factor['fp'] = fp
    # 高信心門檻：各市場預測幅度的第 70 百分位（樣本外前 30% 的板塊方向較明確）
    for mk, pre in (('tw', 'tw_'), ('us', 'us_')):
        vals = [abs(v) for kk, v in fp.items() if (kk.split('>')[1].startswith(pre))]
        if vals: factor.setdefault('cut', {})[mk] = round(float(np.percentile(vals, 70)), 4)
print('因子模型樣本外：', factor['oos'], flush=True)


# ───────────────────────── 7i. 美國政府貿易／關稅行動（Federal Register）─────────────────────────
# 沒有排程、沒有市場共識的事件：估事件窗超額波動，以及「升級」行動時各板塊的平均超額報酬。
# 以川普第一任（2017-01～2021-01）與之後兩段檢驗能不能重現：台股板塊方向兩期相關約 0.5，美股為負。
POL_FILE = SCRATCH / 'policy_events.json'
POL = json.loads(POL_FILE.read_text(encoding='utf-8')) if POL_FILE.exists() else []
tariff = {}
if POL:
    pol_days = {}
    for sd, sub_, kind, title, url in POL: pol_days.setdefault(sd, []).append(kind)
    def _dk(v): ks = set(v); return 'esc' if ks == {'esc'} else 'de' if ks == {'de'} else 'mix'
    TH = 2
    def tariff_study(ARm, days, nd, lagdays):
        idx = {}
        for sd in pol_days:
            dd = (dt.date.fromisoformat(sd) + dt.timedelta(days=lagdays)).isoformat()
            j = bisect.bisect_left(days, dd)
            if j < len(days) and j + TH < nd: idx[sd] = j
        sec_out, vol = {}, []
        for sec, r in ARm.items():
            nb = null_mean_abs(('tar', id(ARm), sec, TH), r, TH, nd)
            per = {}
            for nm, sel in (('t1', lambda x: x < '2021-01-20'), ('t2', lambda x: x >= '2021-01-20')):
                e = np.array([car(r, j, TH, nd) for sd, j in idx.items() if sel(sd) and _dk(pol_days[sd]) == 'esc']); e = e[~np.isnan(e)]
                per[nm] = (float(e.mean()), len(e)) if len(e) >= 5 else (None, len(e))
            a = np.array([abs(car(r, j, TH, nd)) / nb for j in idx.values()]); a = a[~np.isnan(a)]
            if len(a): vol.append(float(np.mean(np.clip(a, *np.percentile(a, [10, 90])))))
            e_all = np.array([car(r, j, TH, nd) for sd, j in idx.items() if _dk(pol_days[sd]) == 'esc']); e_all = e_all[~np.isnan(e_all)]
            if len(e_all) >= 8:
                sec_out[sec] = [round(float(e_all.mean()), 3), round(float(e_all.mean() / (e_all.std(ddof=1) / np.sqrt(len(e_all)))), 2), len(e_all),
                                per['t1'][0] and round(per['t1'][0], 3), per['t2'][0] and round(per['t2'][0], 3)]
        pr = [(v[3], v[4]) for v in sec_out.values() if v[3] is not None and v[4] is not None]
        corr = round(float(np.corrcoef([a for a, _ in pr], [b for _, b in pr])[0, 1]), 3) if len(pr) > 5 else None
        return {'sec': sec_out, 'corr': corr, 'vol_mult': round(float(np.mean(vol)), 3) if vol else None, 'n_events': len(idx)}
    tariff['tw'] = tariff_study(AR, tdays, ND, 1)          # 美東簽署，台股隔天反應
    if us_ok: tariff['us'] = tariff_study(UAR, udays, UND, 0)
    # 個別台股 ETF（原始報酬，持有人看到的漲跌）在升級行動時的反應，給除權息雷達
    _etf_ret = {}
    for c, k_ in KIND.items():
        if k_ != 1: continue
        if c in CIDX and np.sum(~np.isnan(RET[CIDX[c]])) > 500: _etf_ret[c] = RET[CIDX[c]]
        elif c in HIST:
            rr = hist_ret(c, tdays)
            if rr is not None and np.sum(~np.isnan(rr)) > 500: _etf_ret[c] = rr
    tariff['tw_etf'] = tariff_study(_etf_ret, tdays, ND, 1)
    tariff['recent'] = [x for x in POL if x[0] >= (dt.date.today() - dt.timedelta(days=60)).isoformat()][-12:]
    tariff['n_docs'] = len(POL)
    print('關稅事件：', {m: (v['corr'], v['vol_mult'], v['n_events']) for m, v in tariff.items() if isinstance(v, dict) and 'corr' in v}, flush=True)


# ───────────────────────── 7j. 上市櫃公司法說會（公開資訊觀測站）─────────────────────────
# 個股在自己法說會窗口（收盤後召開算隔天，T+0～T+2）的超額波動是平常的幾倍；全部公司合併、前後半期檢驗。
CONF_FILE = SCRATCH / 'conf_events.json'
CONF = json.loads(CONF_FILE.read_text(encoding='utf-8')) if CONF_FILE.exists() else {}
conf = {}
if CONF:
    _mkt = RET[CIDX['0050']]; _mb = {}
    def stock_ar(c):
        if c not in _mb:
            r = RET[CIDX[c]]; mm = ols(_mkt, r)
            _mb[c] = (r - (mm['a'] + mm['b'] * _mkt)) if mm else None
        return _mb[c]
    vals = {0: [], 1: []}; nulls = {}
    for key, rows in CONF.items():
        for row in rows:
            c, d, tm = (row[0], row[1], row[2]) if len(row) == 3 else (row[0], row[2], row[3])
            if c not in CIDX: continue
            after = not tm or tm >= '13:30'
            j = bisect.bisect_left(tdays, d)
            if j < len(tdays) and tdays[j] == d and after: j += 1
            if j + 2 >= ND or j < 30: continue
            ar = stock_ar(c)
            if ar is None: continue
            if c not in nulls:
                v = np.array([car(ar, i, 2, ND) for i in range(30, ND - 3, 4)]); v = np.abs(v[~np.isnan(v)])
                nulls[c] = float(v.mean()) if len(v) > 50 else np.nan
            cc = car(ar, j, 2, ND)
            if np.isnan(cc) or not nulls[c] or np.isnan(nulls[c]): continue
            vals[0 if j < ND // 2 else 1].append(abs(cc) / nulls[c])
    def tm_(v):
        v = np.array(v); lo, hi = np.percentile(v, [10, 90]); vv = np.clip(v, lo, hi); return float(vv.mean()), float(vv.std(ddof=1) / np.sqrt(len(vv)))
    allv = vals[0] + vals[1]
    if len(allv) > 500:
        m, se = tm_(allv); m1, _ = tm_(vals[0]); m2, _ = tm_(vals[1])
        conf = {'mult': round(m, 3), 't': round((m - 1) / se, 1), 'n': len(allv), 'halves': [round(m1, 3), round(m2, 3)]}
    # 未來 60 天的法說會（給頁面：標的池裡的個股會出現自己的法說事件）
    up = []
    horizon_c = (dt.date.today() + dt.timedelta(days=60)).isoformat()
    for key, rows in CONF.items():
        for row in rows:
            if len(row) < 5: continue
            if today_iso <= row[2] <= horizon_c: up.append(row)
    conf['upcoming'] = sorted(up, key=lambda r: (r[2], r[3]))
    print('法說會：', {k: v for k, v in conf.items() if k != 'upcoming'}, f'未來 {len(up)} 場', flush=True)


# ───────────────────────── 7k. 方向：開盤跳空（前一日收盤 → 當日開盤）─────────────────────────
# 開盤前公布的事件（台股：所有美國夜間與台股收盤後的事件；美股：8:30 數據與盤後／盤前財報），
# 反應幾乎都在開盤跳空裡完成；只看跳空可以避開整個交易日的其他雜訊。
# 樣本外（前段估逐對 β、後段照方向押，以事件為單位）：台股 40／50／60／70% 切分 t 2.4／2.6／2.0／1.5；
# 美股 0.3／1.8／3.9／3.3（50% 未達顯著，依規則暫不使用，每天重新檢驗）。
def _gap_ex(series_by, mkt):
    out = {}
    for k, r in series_by.items():
        mm = ols(mkt, r); out[k] = r - (mm['a'] + mm['b'] * mkt) if mm else r
    return out
def _twgap(i):
    g = np.full(ND, np.nan); g[1:] = (OPEN[i, 1:] / CLOSE[i, :-1] - 1) * 100; return np.clip(g, -10.5, 10.5)
TWG = {}
for sec, mem in MEMBERS.items():
    if not mem: continue
    M = np.array([_twgap(i) for i in mem]); cnt = np.sum(~np.isnan(M), 0)
    TWG[sec] = np.where(cnt >= 2, np.nansum(M, 0) / np.maximum(cnt, 1), np.nan)
AR_G = _gap_ex(TWG, _twgap(CIDX['0050']))
def react_gap_tw(d, t):
    rel = dt.datetime(d.year, d.month, d.day) + dt.timedelta(hours=rt_of(d, t))
    key = rel.date().isoformat(); j = bisect.bisect_left(tdays, key)
    if j < len(tdays) and tdays[j] == key and (rel.hour, rel.minute) >= (9, 0): j += 1
    return j if j < len(tdays) else None
GAP_US_KEYS = {'uscpi', 'nfp', 'usret', 'pce', 'banks', 'nvda', 'aapl', 'mu', 'tsmc'}
UAR_G = {}
if us_ok:
    def _usgap(sym):
        h = HIST.get(sym) or {}
        if not h.get('o'): return None
        m = {d: (o, c) for d, o, c in zip(h['d'], h['o'], h['c']) if o and c}
        out = np.full(UND, np.nan)
        for i in range(1, UND):
            a, b = m.get(udays[i - 1]), m.get(udays[i])
            if a and b: out[i] = (b[0] / a[1] - 1) * 100
        return np.clip(out, -20, 20)
    _ug = {c: g for c in US_SEC if (g := _usgap(c)) is not None}
    _spyg = _usgap('SPY')
    if _spyg is not None and len(_ug) > 100:
        USG = {}
        for sec in set(US_SEC.values()):
            mem = [_ug[c] for c, s_ in US_SEC.items() if s_ == sec and c in _ug]
            if len(mem) >= 2:
                M = np.array(mem); cnt = np.sum(~np.isnan(M), 0); USG[sec] = np.where(cnt >= 2, np.nansum(M, 0) / np.maximum(cnt, 1), np.nan)
        UAR_G = _gap_ex(USG, _spyg)
    def react_gap_us(d, t):
        rel = dt.datetime(d.year, d.month, d.day) + dt.timedelta(hours=rt_of(d, t) - (12 if us_dst(d) else 13))
        key = rel.date().isoformat(); before_open = (rel.hour, rel.minute) < (9, 30)
        j = bisect.bisect_left(udays, key)
        if j < len(udays) and udays[j] == key and not before_open: j += 1
        return j if j < len(udays) else None
def gap_model(ARm, days, nd, react, keys):
    def occ_of(k, t):
        o = [(d.isoformat(), react(d, t), SURP[k][0](d)) for d in EVENTS[k]]
        return [x for x in o if x[1] is not None and x[2] is not None and x[1] < nd]
    def oos(frac):
        mid = days[int(len(days) * frac)]; pe = []
        for k, t in TPL.items():
            if k not in keys or k not in SURP or not EVENTS[k]: continue
            occ = occ_of(k, t); o1 = [o for o in occ if o[0] < mid]; o2 = [o for o in occ if o[0] >= mid]
            if len(o1) < 8 or not o2: continue
            x1 = np.array([o[2] for o in o1]); mu, sd = x1.mean(), (x1.std() or 1); z1 = (x1 - mu) / sd
            betas = {sec: m['b'] for sec, r in ARm.items() if (m := ols(z1, np.array([r[i] for _, i, _ in o1])))}
            for _, i, x in o2:
                zz = (x - mu) / sd
                if zz == 0: continue
                v = [np.sign(b * zz) * ARm[s_][i] for s_, b in betas.items() if not np.isnan(ARm[s_][i])]
                if v: pe.append(np.mean(v))
        pe = np.array(pe)
        return [round(float(pe.mean()), 4), round(float(pe.mean() / pe.std(ddof=1) * np.sqrt(len(pe))), 2), len(pe)] if len(pe) > 10 else None
    splits = {f'{int(f * 100)}%': oos(f) for f in (0.4, 0.5, 0.6, 0.7)}
    base = splits['50%']
    pos = sum(1 for v in splits.values() if v and v[0] > 0)
    beta = {}
    for k, t in TPL.items():
        if k not in keys or k not in SURP or not EVENTS[k]: continue
        occ = occ_of(k, t)
        if len(occ) < 16: continue
        x = np.array([o[2] for o in occ]); z = (x - x.mean()) / (x.std() or 1)
        for sec, r in ARm.items():
            m = ols(z, np.array([r[i] for _, i, _ in occ]))
            if m: beta[f'{k}>{sec}'] = [round(m['b'], 4), round(m['t'], 2)]
    return {'splits': splits, 'pass': bool(base and base[0] > 0 and base[1] >= 1.96 and pos >= 3), 'beta': beta,
            'keys': sorted(keys)}
gap = {'tw': gap_model(AR_G, tdays, ND, react_gap_tw, {k for k in TPL if k in SURP})}
if UAR_G: gap['us'] = gap_model(UAR_G, udays, UND, react_gap_us, GAP_US_KEYS)
print('開盤跳空方向：', {m: (v['splits'], v['pass']) for m, v in gap.items()}, flush=True)

# ───────────────────────── 7g. 穩定度檢驗（樣本內前後半）─────────────────────────
# 同一個事件 × 板塊，用前一半事件與後一半事件各估一次 β：前半期顯著的關係，後半期還同方向嗎？
# 這是對「數字靠不靠得住」最直接的檢查；同方向比例接近 50% 代表只是雜訊。
def half_check(ARm, nd, react):
    pairs, agree_sig, n_sig = [], 0, 0
    for k, t in TPL.items():
        if k not in SURP or not EVENTS[k]: continue
        H = H_BY_KIND[t['kind']]
        occ = []
        for d in EVENTS[k]:
            i = react(d, t); x = SURP[k][0](d)
            if i is not None and x is not None and i + H < nd: occ.append((d, i, x))
        if len(occ) < 24: continue
        occ.sort(); half = len(occ) // 2
        for sec, r in ARm.items():
            res = []
            for part in (occ[:half], occ[half:]):
                xs = np.array([x for *_, x in part]); z = (xs - xs.mean()) / (xs.std() or 1)
                cars = np.array([car(r, i, H, nd) for _, i, _ in part])
                res.append(ols(z, cars))
            if res[0] and res[1]:
                pairs.append((res[0]['b'], res[1]['b']))
                if abs(res[0]['t']) >= 1.96:
                    n_sig += 1; agree_sig += np.sign(res[0]['b']) == np.sign(res[1]['b'])
    if not pairs: return None
    a = np.array(pairs)
    return {'n_pairs': len(pairs), 'corr': round(float(np.corrcoef(a[:, 0], a[:, 1])[0, 1]), 3),
            'same_sign_all': round(float(np.mean(np.sign(a[:, 0]) == np.sign(a[:, 1]))), 3),
            'n_sig_first': int(n_sig), 'same_sign_sig': round(agree_sig / n_sig, 3) if n_sig else None}
stability = {'tw': half_check(AR, ND, lambda d, t: react_idx(d, rt_of(d, t)))}
if us_ok: stability['us'] = half_check(UAR, UND, react_us)
print('穩定度：', stability, flush=True)

# 事件重要性：各類事件對全部板塊的平均衝擊（有方向的取 |β|、沒有的取超額波動），分成三級，取代手設的 1～3
imp_score = defaultdict(list)
for e in edges: imp_score[e['frm']].append(abs(e['beta']) if e['kind'] == 'dir' else max(0.0, e['beta']))
imp_mean = {k: float(np.mean(v)) for k, v in imp_score.items() if v}
if imp_mean:
    q1, q2 = np.percentile(list(imp_mean.values()), [33, 67])
    importance = {k: (3 if v >= q2 else 2 if v >= q1 else 1) for k, v in imp_mean.items()}
else:
    importance = {}


# 可信度摘要（頁面直接顯示）：哪些實證結果在前後半期能重現
def _corr(a, b):
    a, b = np.array(a, float), np.array(b, float); ok = ~(np.isnan(a) | np.isnan(b))
    return round(float(np.corrcoef(a[ok], b[ok])[0, 1]), 3) if ok.sum() > 5 else None
_evm_all = [v for tag in ('台股', '美股') for v in EVM.get(tag, {}).values() if v[1] and v[2]]
_hd = [e['h'] for e in edges if e.get('h') and e['kind'] == 'dir']; _ha = [e['h'] for e in edges if e.get('h') and e['kind'] == 'abs']
_sb = []
for c, s_ in SEC.items():
    if c in CIDX and s_ in SR:
        a = ols(SR[s_][-500:-250], RET[CIDX[c]][-500:-250]); b = ols(SR[s_][-250:], RET[CIDX[c]][-250:])
        if a and b and a['n'] > 150 and b['n'] > 150: _sb.append((a['b'], b['b']))
_labs, _ = regime_labels(tdays)
_cur = {dm: next((x for x in reversed(l) if x), None) for dm, l in _labs.items()}
_reg_c = {}
for dm in _labs:
    pr = []
    for sec, r in AR.items():
        f = np.array([np.nansum(r[i + 1:i + 21]) if i + 21 <= len(r) else np.nan for i in range(len(r))])
        mm = []
        for hf in (0, 1):
            idx = [i for i in range(len(tdays)) if _labs[dm][i] == _cur[dm] and ((i < len(tdays) // 2) == (hf == 0))]
            v = f[idx]; v = v[~np.isnan(v)]; mm.append(v.mean() if len(v) > 40 else np.nan)
        pr.append(mm)
    _reg_c[dm] = _corr([x[0] for x in pr], [x[1] for x in pr])
regime['stability'] = _reg_c
# 板塊平常的波動（近 500 日超額報酬日標準差，%）：傳導強度用「事件整體波動倍數 × 板塊波動」這種前後期穩定的量
sec_vol = {sec: round(float(np.nanstd(r[-500:])), 3) for sec, r in AR.items()}
if us_ok: sec_vol.update({sec: round(float(np.nanstd(r[-500:])), 3) for sec, r in UAR.items()})
# FOMC 會前漂移（Lucca & Moench）：台股當天收盤在決議（台北凌晨）之前，是乾淨的會前窗口
_mr = RET[CIDX['0050']]; _pre = [TIDX[d.isoformat()] for d in sorted(set(EVENTS['fomc'])) if d.isoformat() in TIDX]
def _mt(v): v = np.array(v); v = v[~np.isnan(v)]; return [round(float(v.mean()), 3), round(float(v.mean() / v.std(ddof=1) * np.sqrt(len(v))), 2), len(v)] if len(v) > 5 else None
pre_fomc = {'all': _mt(_mr[_pre]), 'first': _mt(_mr[[i for i in _pre if i < ND // 2]]), 'second': _mt(_mr[[i for i in _pre if i >= ND // 2]]),
            'normal': round(float(np.nanmean(_mr)), 3)}
credibility = {
  'pre_fomc': pre_fomc,
  'regime_corr': _reg_c,
  'dir_corr': _corr([h[0] for h in _hd], [h[2] for h in _hd]), 'abs_corr': _corr([h[0] for h in _ha], [h[2] for h in _ha]),
  'n_dir': len(_hd), 'n_abs': len(_ha),
  'n_rep': sum(1 for e in edges if e.get('rep')), 'n_sig': sum(1 for e in edges if abs(e['t']) >= 1.96),
  'evm_corr': _corr([v[1] for v in _evm_all], [v[2] for v in _evm_all]),
  'stock_beta_corr': _corr([x for x, _ in _sb], [y for _, y in _sb]),
  'stability': stability,
  'factor_oos': factor.get('oos'),
}
print('可信度：', credibility, flush=True)

# ───────────────────────── 8. 輸出 ─────────────────────────
def p95(v): return float(np.percentile(np.abs(v), 95)) if len(v) else 1.0
full = {'dir': round(p95([e['beta'] for e in edges if e['kind'] == 'dir']), 3),
        'abs': round(p95([e['beta'] for e in edges if e['kind'] == 'abs' and e['beta'] > 0]), 3)}
out = {
  'src': 'real',
  'window': f'台股官方日線 {tdays[0]}～{tdays[-1]}（事件 {EV_START}～{EV_END}，個股 β 近 {BETA_DAYS} 日）' + US_INFO,
  'asof': tdays[-1], 'n_events': sum(n_occ.values()), 'full': full,
  'edges': [dict(**{'from': e['frm']}, to=e['to'], beta=round(e['beta'], 3), se=round(e['se'], 3), t=round(e['t'], 2),
                 r2=round(e['r2'], 3), n=e['n'], lag=e['lag'], kind=e['kind'], rep=e.get('rep', False),
                 h=[round(x, 3) for x in e['h']] if e.get('h') else None) for e in edges],
  'ev_mult': dict(EVM),
  'stock_beta': stock_beta, 'dist': dist, 'cone': cone, 'fill': fill,
  'mode': mode, 'n_occ': n_occ, 'surprise': SURP_SRC, 'fomc_src': FOMC_SRC, 'macro_src': MACRO_SRC, 'earn_src': EARN_SRC, 'date_src': DATE_SRC,
  'amp': AMP, 'chain': chain, 'live': live, 'upcoming': upcoming, 'regime': regime, 'scen_freq': SCEN_FREQ, 'etf_impact': etf_impact, 'stability': stability, 'importance': importance, 'credibility': credibility, 'factor': factor, 'tariff': tariff, 'conf': conf, 'gap': gap, 'sec_vol': sec_vol,
}
try:
    _prev = json.loads(OUT.read_text(encoding='utf-8'))
except Exception:
    _prev = None
_bad = []
if _prev:
    if len(out['edges']) < 0.6 * len(_prev.get('edges', [])): _bad.append(f"邊從 {len(_prev['edges'])} 降到 {len(out['edges'])}")
    if len(out['stock_beta']) < 0.6 * len(_prev.get('stock_beta', {})): _bad.append('個股 β 大幅減少')
    if _prev.get('upcoming') and not out['upcoming']: _bad.append('未來排程變成空的')
if _bad:
    raise SystemExit('校準結果異常，保留上一份輸出：' + '；'.join(_bad))
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
sig = sum(1 for e in edges if abs(e['t']) >= 1.96)
print(f'輸出 {OUT.name}：邊 {len(edges)}（顯著 {sig}）、個股 β {len(stock_beta)}、分布 {sum(len(v) for v in dist.values())} 格、'
      f'填息 {len(fill)} 檔、滿格 {full}、{OUT.stat().st_size // 1024} KB')
print('cone', cone)
print('fill', fill)
