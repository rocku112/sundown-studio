#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
交易健檢的線上資料（每日盤後由 twflow-daily.yml 重算，頁面開啟時讀取）：

  tools/tradecheck/data.json
    · bench：0050／006208／0056 含息還原收盤、加權指數（證交所官方，swing/scripts/fetch_official.py 回補）
    · events：歷史重大事件日（台股第一個能反應的日期）——FOMC、美國 CPI／非農（Nasdaq 經濟行事曆），
      央行理監事會（央行官網），台積電法說會（公開資訊觀測站）
  tools/tradecheck/fraud/00.txt … 31.txt
    · 警政署 165 反詐騙諮詢專線兩份開放資料（政府資料開放平臺 160055、176455）：
      假投資（博弈）網站、遭停止解析涉詐網站。依網域的 FNV-1a 雜湊分成 32 份，頁面查詢時只下載需要的那一份。
      一行一個網域：網域<TAB>A 或 B<TAB>說明（A＝假投資網站：網站名稱、最近通報週、件數；B＝停止解析：網站性質、年月）

用法：python tools/tradecheck/gen_data.py
"""
import csv, io, json, os, sys, datetime as dt
from collections import defaultdict
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, 'swing', 'scripts'))
import fetch_official as fo   # noqa: E402

out = {'asof': None, 'bench': {}, 'events': {}, 'src': {}}

# ── 1) 基準：含息還原收盤（缺資料的檔案略過，頁面會退回能用的那幾個）──
for code in ('0050', '006208', '0056'):
    s = fo.series(code)
    if s:
        out['bench'][code] = {'d': [r[0] for r in s], 'v': [round(r[3], 4) for r in s]}
ix = fo.index_series()
if ix:
    ix = [r for r in ix if r[0] >= '2010-01-01']
    out['bench']['TWII'] = {'d': [r[0] for r in ix], 'v': [round(r[1], 2) for r in ix]}
out['asof'] = max((b['d'][-1] for b in out['bench'].values()), default=None)
out['src']['bench'] = '證交所官方日成交資訊＋除權除息計算結果（含息還原）'

# ── 2) 歷史事件：換成台股第一個能反應的日期（美國事件在台北深夜或清晨，台股隔天才反應）──
tdays = out['bench'].get('0050', {}).get('d', [])
def next_tday(d):
    """d 之後（不含 d）的第一個台股交易日；超出資料範圍時用隔天平日"""
    import bisect
    i = bisect.bisect_right(tdays, d)
    if i < len(tdays): return tdays[i]
    x = dt.date.fromisoformat(d) + dt.timedelta(days=1)
    while x.weekday() >= 5: x += dt.timedelta(days=1)
    return x.isoformat()

cal_p = os.path.join(REPO, 'tools', 'capsule', 'econ_cal.json')
ECAL = json.load(open(cal_p, encoding='utf-8')) if os.path.exists(cal_p) else {'econ': {}}
names = {'fomc': 'Fed Interest Rate Decision', 'uscpi': 'Core CPI', 'nfp': 'Nonfarm Payrolls'}
ev = defaultdict(set)
for d, rows in ECAL.get('econ', {}).items():
    for r in rows:
        if r[2] != 'United States': continue
        for k, nm in names.items():
            if r[0] == nm: ev[k].add(next_tday(d))
macro_p = os.path.join(REPO, 'tools', 'capsule', 'tw_macro.json')
if os.path.exists(macro_p):
    for d in json.load(open(macro_p, encoding='utf-8')).get('cbc', []):
        ev['cbc'].add(next_tday(d))             # 央行 16:30 公布，台股隔天反應
conf_p = os.path.join(REPO, 'tools', 'capsule', 'conf_events.json')
if os.path.exists(conf_p):
    for rows in json.load(open(conf_p, encoding='utf-8')).values():
        for r in rows:
            if r[0] != '2330': continue
            d, t = (r[1], r[2]) if len(r) == 3 else (r[2], r[3])
            if int(d[5:7]) not in (1, 4, 7, 10) or not 8 <= int(d[8:10]) <= 25: continue   # 只算季度財報法說，不算出席券商論壇
            ev['tsmc'].add(next_tday(d) if (t or '14:00') >= '13:30' else d)
out['events'] = {k: sorted(v) for k, v in ev.items()}
out['src']['events'] = 'FOMC、美國核心 CPI、非農：Nasdaq 經濟行事曆；央行理監事會：中央銀行；台積電法說會：公開資訊觀測站'
json.dump(out, open(os.path.join(HERE, 'data.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('基準', {k: len(v['d']) for k, v in out['bench'].items()}, '｜事件', {k: len(v) for k, v in out['events'].items()}, '｜資料日', out['asof'])

# ── 3) 165 反詐騙開放資料 ──
SRC = {
    'A': ('https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/033197D4-70F4-45EB-9FB8-6D83532B999A/resource/A00B1802-6A4A-42B4-B842-B66A2D937DAE/download',
          '165 假投資（博弈）網站'),
    'B': ('https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/29E8E643-88ED-4952-B21E-BD42A3B7108C/resource/3710DCC5-936F-4EE1-AE9A-61E29621BEF2/download',
          '165 遭停止解析涉詐網站'),
}
def host(u):
    u = (u or '').strip().lower()
    for p in ('https://', 'http://'):
        if u.startswith(p): u = u[len(p):]
    u = u.split('/')[0].split('?')[0].split('#')[0].split(':')[0].strip('. ')
    if u.startswith('www.'): u = u[4:]
    return u if '.' in u and ' ' not in u else ''
def roc(ym):
    try: return f'{int(ym[:-2]) + 1911}-{ym[-2:]}'
    except Exception: return ym
recs = {}
try:
    for key, (url, label) in SRC.items():
        r = requests.get(url, timeout=120); r.raise_for_status()
        rows = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig'))))[1:]
        for x in rows:
            if key == 'A' and len(x) >= 5:
                h = host(x[1]); info = '\t'.join((x[0].strip().replace('\t', ' '), x[4].strip().replace('/', '-'), x[2].strip()))
                date = x[4].strip().replace('/', '-')
            elif key == 'B' and len(x) >= 3:
                h = host(x[1]); info = '\t'.join((x[2].strip(), roc(x[0].strip())))
                date = roc(x[0].strip())
            else: continue
            if not h: continue
            old = recs.get(h)
            if not old or date > old[2]: recs[h] = (key, info, date)
    if len(recs) > 10000:     # 來源失敗或格式改變時保留舊檔
        def fnv(h):
            x = 0x811c9dc5
            for b in h.encode('utf-8'): x = ((x ^ b) * 0x01000193) & 0xffffffff
            return x % 32
        shards = defaultdict(list)
        for h in sorted(recs): shards[fnv(h)].append('\t'.join((h, recs[h][0], recs[h][1])))
        os.makedirs(os.path.join(HERE, 'fraud'), exist_ok=True)
        for i in range(32):
            with open(os.path.join(HERE, 'fraud', f'{i:02d}.txt'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(''.join(x + '\n' for x in shards[i]))
        json.dump({'date': dt.date.today().isoformat(), 'n': len(recs), 'A': sum(1 for v in recs.values() if v[0] == 'A'),
                   'B': sum(1 for v in recs.values() if v[0] == 'B')}, open(os.path.join(HERE, 'fraud', 'meta.json'), 'w', encoding='utf-8'))
    print('165 涉詐網域', len(recs))
except Exception as e:
    print('165 開放資料抓取失敗，沿用舊檔：', e)
