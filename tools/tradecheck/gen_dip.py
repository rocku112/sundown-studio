#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
回檔買進回測（交易健檢第四個分頁）：每一檔上市櫃股票與 ETF，用官方含息還原價測
「從 60 日高點回檔 10%／15%／20%／25% 時買進」之後 20／60／120 個交易日的報酬，並和「隨便哪一天買進」比較。

資料：swing/data/prices/YYYY-MM.json.gz（證交所＋櫃買官方日線，每日還原報酬已含除權息與減資）。
規則：
  · 含息還原指數 = 每日還原報酬連乘；60 日高點 = 含當天在內最近 60 個交易日的最高值
  · 回檔幅度 = 指數 ÷ 60 日高點 − 1；第一次跌破門檻那天以收盤買進
  · 同一波只算第一次：觸發後要等指數再創 60 日新高（回檔幅度回到 0），才開始算下一波
  · 持有 N 個交易日（以該股自己的交易日計，停牌日不算）；還沒滿 N 天的列為「進行中」，不進統計
  · 對照組：從第 60 個交易日起，每一天都買一次、持有同樣天數
只輸出目前仍在交易（最近 10 天內有行情）且至少有 250 個交易日的股票。

輸出：tools/tradecheck/dip/index.json（代號、名稱、起訖日）、dip/00.json～31.json（依代號 FNV-1a 雜湊分組）
用法：python tools/tradecheck/gen_dip.py（每週五由 twflow-daily.yml 執行；統計每天只差最後幾天，不必每天重寫）
"""
import gzip, json, os, glob, statistics, datetime as dt
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(REPO, 'swing', 'data', 'prices')
OUT = os.path.join(HERE, 'dip')
TH = (0.10, 0.15, 0.20, 0.25)
HZ = (20, 60, 120)
WIN = 60

series, names = defaultdict(list), {}
for f in sorted(glob.glob(os.path.join(SRC, '*.json.gz'))):
    d = json.load(gzip.open(f))
    names.update(d.get('names', {}))
    for day in sorted(d['days']):
        for code, r in d['days'][day].items():
            if r and len(r) >= 6 and r[5] is not None and r[3]:
                series[code].append((day, r[5]))
last_day = max(s[-1][0] for s in series.values())
cut = (dt.date.fromisoformat(last_day) - dt.timedelta(days=10)).isoformat()

def stats(xs):
    if not xs: return None
    return {'n': len(xs), 'med': round(statistics.median(xs), 3), 'mean': round(sum(xs) / len(xs), 3),
            'worst': round(min(xs), 3), 'win': round(sum(1 for x in xs if x > 0) / len(xs), 3)}

def fnv(s):
    x = 0x811c9dc5
    for b in s.encode('utf-8'): x = ((x ^ b) * 0x01000193) & 0xffffffff
    return x % 32

shards, index = defaultdict(dict), []
for code, s in series.items():
    if len(s) < 250 or s[-1][0] < cut: continue
    dates = [x[0] for x in s]
    idx, v = [], 1.0
    for _, r in s:
        v *= 1 + r; idx.append(v)
    n = len(idx)
    hi, dd = [], []
    from collections import deque
    q = deque()
    for i, x in enumerate(idx):          # 單調佇列求滾動最大值
        while q and idx[q[-1]] <= x: q.pop()
        q.append(i)
        if q[0] <= i - WIN: q.popleft()
        hi.append(idx[q[0]]); dd.append(x / idx[q[0]] - 1)
    fwd = lambda i, h: (idx[i + h] / idx[i] - 1) if i + h < n else None
    base = {str(h): stats([fwd(i, h) for i in range(WIN - 1, n - h)]) for h in HZ}
    res = {}
    for th in TH:
        armed, ev = True, []
        for i in range(WIN - 1, n):
            if not armed and dd[i] >= -1e-12: armed = True
            if armed and dd[i] <= -th:
                ev.append([dates[i], round(dd[i], 3)] + [None if fwd(i, h) is None else round(fwd(i, h), 3) for h in HZ])
                armed = False
        res[str(int(th * 100))] = {'ev': ev, 'st': {str(h): stats([e[2 + k] for e in ev if e[2 + k] is not None]) for k, h in enumerate(HZ)}}
    nm = names.get(code, '')
    shards[fnv(code)][code] = {'n': nm, 'd0': dates[0], 'd1': dates[-1], 'days': n, 'dd': round(dd[-1], 3),
                               'base': base, 'th': res}
    index.append([code, nm])

os.makedirs(OUT, exist_ok=True)
for i in range(32):
    with open(os.path.join(OUT, f'{i:02d}.json'), 'w', encoding='utf-8') as f:
        json.dump(shards.get(i, {}), f, ensure_ascii=False, separators=(',', ':'))
index.sort()
json.dump({'asof': last_day, 'start': min(x[0][0] for x in series.values()), 'win': WIN, 'th': [int(t * 100) for t in TH], 'hz': list(HZ),
           'list': index}, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'回檔回測：{len(index)} 檔，資料到 {last_day}')
