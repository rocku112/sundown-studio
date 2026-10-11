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
# 滾動視窗：載入近 5.5 年日線，前半年只當估計期，事件取最近 5 年到最新交易日
_today = dt.date.today()
_y, _m = _today.year - 6, _today.month + 6
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
RET = np.full((NC, ND), np.nan); CLOSE = np.full((NC, ND), np.nan); TURN = np.zeros(NC)
for j, d in enumerate(tdays):
    for c, v in day_rows[d].items():
        i = CIDX[c]
        if v[5] is not None: RET[i, j] = v[5] * 100
        if v[3]: CLOSE[i, j] = v[3]
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
 'twcpi':  dict(kind='總經', rt=16,   at=lambda y, m: clamp_day(y, m, 5)),
 'twexp':  dict(kind='總經', rt=16,   at=lambda y, m: clamp_day(y, m, 9)),
 'twrev':  dict(kind='財報', rt=17,   at=lambda y, m: clamp_day(y, m, 10)),
 'tsmcrev':dict(kind='財報', rt=14,   at=lambda y, m: clamp_day(y, m, 10)),
 'uscpi':  dict(kind='總經', rt=20.5, at=lambda y, m: clamp_day(y, m, 11)),
 'umich':  dict(kind='總經', rt=22,   at=lambda y, m: nth_dow(y, m, 2, 5)),
 'usret':  dict(kind='總經', rt=20.5, at=lambda y, m: clamp_day(y, m, 16)),
 'twq':    dict(kind='財報', rt=17,   at=lambda y, m: clamp_day(y, m, {2: 31, 4: 15, 7: 14, 10: 14}[m]) if m in (2, 4, 7, 10) else None),
 'fomc':   dict(kind='央行', rt=26,   at=None),
 'cbc':    dict(kind='央行', rt=17,   at=lambda y, m: nth_dow(y, m, 3, 4) if m in (2, 5, 8, 11) else None),
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
EVENTS = {}
for k, t in TPL.items():
    ds = [dt.date.fromisoformat(x) for x in FOMC] if k == 'fomc' else \
         [t['at'](y, m) for y, m in months(EV_START, EV_END)]
    EVENTS[k] = [d for d in ds if d and EV_START <= d <= EV_END]

# ───────────────────────── 4. 意外值 ─────────────────────────
def fred(sid):
    p = CACHE / f'{sid}.csv'
    if not p.exists() or (dt.datetime.now().timestamp() - p.stat().st_mtime) > 20 * 3600:
        raw = urllib.request.urlopen(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}', timeout=120).read()
        p.write_bytes(raw)
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

cpi, nfp_s, pce_s, ret_s, um = (monthly(fred(x)) for x in ['CPILFESL', 'PAYEMS', 'PCEPILFE', 'RSXFS', 'UMCSENT'])
dgs2 = fred('DGS2')
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
SURP = {
 'uscpi':  (lambda d: trend_surprise(mom(cpi), prev_ym(ymk(d)), 12),   'FRED CPILFESL：核心 CPI 月增率 − 前 12 個月平均'),
 'nfp':    (lambda d: trend_surprise(diff(nfp_s), prev_ym(ymk(d)), 12),'FRED PAYEMS：非農新增 − 前 12 個月平均'),
 'pce':    (lambda d: trend_surprise(mom(pce_s), prev_ym(ymk(d)), 12), 'FRED PCEPILFE：核心 PCE 月增率 − 前 12 個月平均'),
 'usret':  (lambda d: trend_surprise(mom(ret_s), prev_ym(ymk(d)), 12), 'FRED RSXFS：零售銷售月增率 − 前 12 個月平均'),
 'umich':  (lambda d: diff(um)(ymk(d)),                                 'FRED UMCSENT：密大信心月變動'),
 'fomc':   (fomc_surp,                                                  'FRED DGS2：決議日 2 年期殖利率變動（基點）'),
 'tsmcrev':(lambda d: trend_surprise(yoy_tsmc, prev_ym(ymk(d)), 3),    '台積電月營收年增率 − 前 3 個月平均'),
 'twrev':  (lambda d: trend_surprise(yoy_all, prev_ym(ymk(d)), 3),     '全體上市櫃月營收年增率 − 前 3 個月平均'),
}

# ───────────────────────── 5. 事件研究 ─────────────────────────
H_BY_KIND = {'總經': 2, '央行': 2, '市場': 2, '財報': 4, '法說': 4}
DIST_H = 20
def car(r, i, h, nd):
    if i is None or i + h >= nd: return np.nan
    w = r[i:i + h + 1]
    return np.nan if np.isnan(w).sum() > 1 else float(np.nansum(w))
def study(AR, nd, react, tag):
    """AR：{板塊: 超額報酬序列}；react(事件日, 模板) → 該市場第一個能反應的交易日索引"""
    edges, dist, cone_pool, n_occ, mode = [], defaultdict(dict), defaultdict(list), {}, {}
    for k, t in TPL.items():
        H = H_BY_KIND[t['kind']]
        idx = [react(d, t) for d in EVENTS[k]]
        keep = [(d, i) for d, i in zip(EVENTS[k], idx) if i is not None and i + DIST_H < nd]
        u = None
        if k in SURP:
            raw = [SURP[k][0](d) for d, _ in keep]
            ok = [(d, i, x) for (d, i), x in zip(keep, raw) if x is not None]
            if len(ok) >= 12:
                xs = np.array([x for *_, x in ok]); z = (xs - xs.mean()) / (xs.std() or 1)
                keep = [(d, i) for d, i, _ in ok]; u = z
                SURP_SRC[k] = SURP[k][1]
        mode[k] = 'dir' if u is not None else 'abs'
        n_occ[k] = len(keep)
        ev_set = set()
        for _, i in keep: ev_set.update(range(i - 5, i + H + 6))
        for s, r in AR.items():
            cars = np.array([car(r, i, H, nd) for _, i in keep])
            c20 = np.array([car(r, i, DIST_H - 1, nd) for _, i in keep])
            cone_pool[t['kind']].extend(c20[~np.isnan(c20)].tolist())
            if u is not None:
                m = ols(u, cars)
                if m:
                    edges.append(dict(frm=k, to=s, beta=m['b'], se=m['se'], t=m['t'], r2=m['r2'], n=m['n'], lag=H, kind='dir'))
                cell = {}
                for key, sel in (('A', u > 0), ('B', u <= 0)):
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
                    edges.append(dict(frm=k, to=s, beta=b, se=se, t=b / se if se else 0, r2=0.0, n=len(ev), lag=H, kind='abs'))
                v = c20[~np.isnan(c20)]
                if len(v) >= 6: dist[k][s] = {'U': [*np.percentile(v, [10, 50, 90]).round(2).tolist(), len(v)]}
        print(f'{tag} {k:8s} {t["kind"]} {mode[k]} N={n_occ[k]}', flush=True)
    return edges, dist, cone_pool, n_occ, mode

SURP_SRC = {}
edges, dist, cone_pool, n_occ, mode = study(AR, ND, lambda d, t: react_idx(d, t['rt']), '台股')

cone = {}
for kind, v in cone_pool.items():
    v = np.array(v); n_ev = sum(n_occ[k] for k, t in TPL.items() if t['kind'] == kind)
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
def us_dst(d):
    m2 = nth_dow(d.year, 2, 2, 0); n1 = nth_dow(d.year, 10, 1, 0)
    return m2 <= d < n1
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
        rel = dt.datetime(d.year, d.month, d.day) + dt.timedelta(hours=t['rt'] - (12 if us_dst(d) else 13))
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

# ───────────────────────── 8. 輸出 ─────────────────────────
def p95(v): return float(np.percentile(np.abs(v), 95)) if len(v) else 1.0
full = {'dir': round(p95([e['beta'] for e in edges if e['kind'] == 'dir']), 3),
        'abs': round(p95([e['beta'] for e in edges if e['kind'] == 'abs' and e['beta'] > 0]), 3)}
out = {
  'src': 'real',
  'window': f'台股官方日線 {tdays[0]}～{tdays[-1]}（事件 {EV_START}～{EV_END}，個股 β 近 {BETA_DAYS} 日）' + US_INFO,
  'asof': tdays[-1], 'n_events': sum(n_occ.values()), 'full': full,
  'edges': [dict(**{'from': e['frm']}, to=e['to'], beta=round(e['beta'], 3), se=round(e['se'], 3), t=round(e['t'], 2),
                 r2=round(e['r2'], 3), n=e['n'], lag=e['lag'], kind=e['kind']) for e in edges],
  'stock_beta': stock_beta, 'dist': dist, 'cone': cone, 'fill': fill,
  'mode': mode, 'n_occ': n_occ, 'surprise': SURP_SRC, 'fomc_src': FOMC_SRC,
}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
sig = sum(1 for e in edges if abs(e['t']) >= 1.96)
print(f'輸出 {OUT.name}：邊 {len(edges)}（顯著 {sig}）、個股 β {len(stock_beta)}、分布 {sum(len(v) for v in dist.values())} 格、'
      f'填息 {len(fill)} 檔、滿格 {full}、{OUT.stat().st_size // 1024} KB')
print('cone', cone)
print('fill', fill)
