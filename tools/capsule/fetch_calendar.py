"""市場傳導艙 · 官方排程與共識預期（Nasdaq 經濟行事曆＋財報行事曆）

  經濟行事曆  api.nasdaq.com/api/calendar/economicevents?date=  實際值、市場共識、前值、公布時刻
  財報行事曆  api.nasdaq.com/api/calendar/earnings?date=         EPS 實際值、共識、驚喜幅度、盤前／盤後

注意：經濟行事曆的查詢日期比實際公布日晚一天（查 6/11 回傳 6/10 的事件，已用 2022-06 CPI、2024-12 FOMC 核對）；
     公布時刻是固定 UTC−4（不隨美國夏令調整）。財報行事曆沒有偏移。

輸出 tools/capsule/econ_cal.json（進 repo，歷史幾乎不變，每天只重抓最近 10 天與未來 120 天）：
  {"econ": {"YYYY-MM-DD": [[事件, "HH:MM", 國家, 實際, 共識, 前值], ...]},
   "earn": {"代號": [["YYYY-MM-DD", 時段, EPS, 共識 EPS, 驚喜%], ...]},
   "done_econ": [...已抓過的日期], "done_earn": [...]}
用法：python fetch_calendar.py [--from YYYY-MM-DD]
"""
import json, pathlib, sys, time, threading, datetime as dt
from concurrent.futures import ThreadPoolExecutor
import requests

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'econ_cal.json'
ECON = {  # 只留傳導艙用到的事件
    ('United States', 'Core CPI'), ('United States', 'Nonfarm Payrolls'), ('United States', 'Core PCE Price Index'),
    ('United States', 'Retail Sales'), ('United States', 'Michigan Consumer Sentiment'),
    ('United States', 'ISM Manufacturing PMI'), ('United States', 'Fed Interest Rate Decision'),
    ('China', 'Manufacturing PMI'),
}
EARN = {'NVDA', 'AAPL', 'MU', 'JPM', 'TSM'}
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
     'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/', 'Accept': 'application/json'}
_tl = threading.local()
def sess():
    if not hasattr(_tl, 's'):
        _tl.s = requests.Session(); _tl.s.headers.update(H)
    return _tl.s

def get(path, d):
    for i in range(4):
        try:
            r = sess().get(f'https://api.nasdaq.com/api/calendar/{path}', params={'date': d}, timeout=30)
            if r.ok:
                return ((r.json() or {}).get('data') or {}).get('rows') or []
        except Exception:
            pass
        time.sleep(2 * (i + 1))
    return None

def clean(v):
    v = (v or '').replace('&nbsp;', '').strip()
    return v or None

cal = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'econ': {}, 'earn': {}, 'done_econ': [], 'done_earn': []}
done_e, done_r = set(cal['done_econ']), set(cal['done_earn'])
start = dt.date.fromisoformat(sys.argv[sys.argv.index('--from') + 1]) if '--from' in sys.argv else dt.date(2016, 4, 1)
today = dt.date.today()
recent = today - dt.timedelta(days=10)
end = today + dt.timedelta(days=120)
jobs = []
d = start
while d <= end:
    iso = d.isoformat(); refetch = d >= recent
    # 美國數據不在週末公布；週末只留月底（中國官方 PMI 在月底最後一天公布，可能落在週末）
    month_end = (d + dt.timedelta(days=1)).day == 1
    if (d.weekday() < 5 or month_end) and (refetch or iso not in done_e): jobs.append(('econ', d))
    # 財報只查各公司財報季的窗口（NVDA 2/5/8/11 月中下旬、AAPL 與 TSM 與 JPM 1/4/7/10 月、MU 3/6/9/12 月下旬）
    earn_win = (d.month in (1, 4, 7, 10) and 8 <= d.day <= 31) or (d.month in (2, 5, 8, 11) and (d.day >= 10 or d.day <= 3)) \
               or (d.month in (3, 6, 9, 12) and d.day >= 15)
    if d.weekday() < 5 and (earn_win or refetch) and (refetch or iso not in done_r): jobs.append(('earn', d))
    d += dt.timedelta(days=1)

def run(job):
    kind, d = job
    # 經濟行事曆：查 d+1 得到 d 當天的事件
    return job, get('economicevents', (d + dt.timedelta(days=1)).isoformat()) if kind == 'econ' else get('earnings', d.isoformat())

def save():
    cal['done_econ'], cal['done_earn'] = sorted(done_e), sorted(done_r)
    OUT.write_text(json.dumps(cal, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

n_ok = 0
with ThreadPoolExecutor(max_workers=5) as ex:   # 單一請求約 3～4 秒，平行抓才不會拖到幾小時
    for n, ((kind, d), rows) in enumerate(ex.map(run, jobs), 1):
        iso = d.isoformat()
        if rows is None: continue
        n_ok += 1
        if kind == 'econ':
            keep = [[x['eventName'], x.get('gmt') or '', x['country'], clean(x.get('actual')), clean(x.get('consensus')), clean(x.get('previous'))]
                    for x in rows if (x.get('country'), x.get('eventName')) in ECON]
            if keep: cal['econ'][iso] = keep
            else: cal['econ'].pop(iso, None)
            if d < recent: done_e.add(iso)
        else:
            for sym in cal['earn']:   # 重抓的日期先清掉，改期的財報才不會留在舊日期
                cal['earn'][sym] = [r for r in cal['earn'][sym] if r[0] != iso]
            for x in rows:
                sym = x.get('symbol')
                if sym not in EARN: continue
                cal['earn'].setdefault(sym, []).append([iso, x.get('time') or '', clean(x.get('eps')), clean(x.get('epsForecast')), clean(x.get('surprise'))])
                cal['earn'][sym].sort()
            if d < recent: done_r.add(iso)
        if n % 300 == 0:
            save(); print(f'  … {n}／{len(jobs)}（{iso}）', flush=True)
save()
print(f'行事曆：{n_ok}／{len(jobs)} 個請求成功；經濟事件 {sum(len(v) for v in cal["econ"].values())} 筆、'
      f'財報 {sum(len(v) for v in cal["earn"].values())} 筆；{OUT.stat().st_size // 1024} KB')

# ── 官方機關的未來排程（Nasdaq 只提前約 3 週列出；這些機關公布得更遠）──
#   BEA：Personal Income and Outlays（核心 PCE）　Census：Advance Monthly Retail Trade（零售銷售）
#   財報：Nasdaq 個股「下次財報日」（未確認者標為預估）
import re as _re
HTML_H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 'Accept': 'text/html'}
MON = {m: i + 1 for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])}
def _txt(url):
    try:
        r = requests.get(url, headers=HTML_H, timeout=40)
        if not r.ok: return ''
        t = _re.sub(r'\s+', ' ', _re.sub(r'<[^>]+>', '|', r.text)); return _re.sub(r'(\| ?)+', '|', t)
    except Exception:
        return ''
official = {}
t = _txt('https://www.bea.gov/news/schedule')
for mon, day, hh, mm, ap, dmon, dyear in _re.findall(r'\|(\w+) (\d{1,2})\|(\d{1,2}):(\d{2}) ([AP])M\|N\|ews\|Personal Income and Outlays, (\w+) (\d{4})', t):
    if mon not in MON or dmon not in MON: continue
    y = int(dyear) + (1 if MON[dmon] == 12 and MON[mon] < 12 else 0)      # 12 月資料隔年公布
    h = int(hh) % 12 + (12 if ap == 'P' else 0)
    official.setdefault('pce', []).append([f'{y}-{MON[mon]:02d}-{int(day):02d}', f'{h:02d}:{mm}', 'BEA 官方發布時間表'])
t = _txt('https://www.census.gov/retail/release_schedule.html')
seg = t[t.find('Advance Monthly Retail Trade Report'):t.find('Historical Release Dates')] if 'Advance Monthly Retail Trade Report' in t else ''
for mon, day, year in _re.findall(r'\|(\w+) (\d{1,2}), (\d{4})\|', seg):
    if mon in MON: official.setdefault('usret', []).append([f'{year}-{MON[mon]:02d}-{int(day):02d}', '08:30', 'Census 官方發布時間表'])
earn_next = {}
for sym in sorted(EARN):
    try:
        r = sess().get(f'https://api.nasdaq.com/api/analyst/{sym}/earnings-date', timeout=30)
        txt = ((r.json() or {}).get('data') or {}).get('reportText') or ''
        m = _re.search(r'(\d{2})/(\d{2})/(\d{4})', txt)
        if m: earn_next[sym] = [f'{m.group(3)}-{m.group(1)}-{m.group(2)}', 'estimated' in txt.lower(), txt[:160]]
    except Exception:
        pass
cal['official'] = official; cal['earn_next'] = earn_next
OUT.write_text(json.dumps(cal, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'官方排程：PCE {len(official.get("pce", []))} 筆、零售 {len(official.get("usret", []))} 筆；下次財報 {earn_next}')
