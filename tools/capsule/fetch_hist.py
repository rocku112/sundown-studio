"""市場傳導艙 · 校準用的長歷史日線（Yahoo chart API）

台股官方日線（swing/data/prices）沒有的部分由這裡補：
  · 美股：頁面內建的 197 檔美股／美國 ETF ＋ SPY（市場模型基準）
  · 台股債券 ETF、海外 ETF：兩個板塊各取成交值前 15 檔（官方日線只回補了少數 ETF）
  · 配息 ETF：頁面除息表裡的每一檔（含原始收盤與配息紀錄，算填息用）
  · 成交值前 40 大的台股 ETF（除權息雷達的事件影響）

輸出 <快取目錄>/hist.json.gz：{代號: {"d": [日期], "c": [收盤], "a": [還原收盤], "v": {除息日: 配息}}}
已有的檔案只補最近三個月；Yahoo 失敗的代號沿用舊資料。快取目錄由 GitHub Actions cache 保存，不進 repo。
用法：python fetch_hist.py <快取目錄>
"""
import gzip, json, pathlib, re, sys, time, datetime as dt
import requests

HERE = pathlib.Path(__file__).resolve().parent
CACHE = pathlib.Path(sys.argv[1]); CACHE.mkdir(parents=True, exist_ok=True)
OUT = CACHE / 'hist.json.gz'

orig = (HERE / 'orig.html').read_text(encoding='utf-8')
mu = orig[orig.index('const MASTER_US=['):]
mu = mu[:mu.index('];')]
US = ['SPY'] + re.findall(r'\["([\w.]+)","[^"]+","us_\w+"', mu)
tw = json.loads((HERE / 'twall.json').read_text(encoding='utf-8'))
rows = [l.split('|') for l in tw['data'].split('\n')]
TW_ETF = []
for sec in ('tw_bond', 'tw_ovs'):
    TW_ETF += [r[0] for r in sorted((r for r in rows if r[3] == sec and r[2] == '1'), key=lambda r: -int(r[4]))[:15]]
TW_ETF += re.findall(r'\["(\w+)", ?"(?:季配|月配|半年配)"', (HERE / 'build.py').read_text(encoding='utf-8'))
# 除權息雷達要看各類事件對 ETF 的實證影響：再加成交值前 40 大的台股 ETF（不含槓桿反向）
TW_ETF += [r[0] for r in sorted((r for r in rows if r[2] == '1'), key=lambda r: -int(r[4]))[:40]]
TW_ETF = list(dict.fromkeys(TW_ETF))

old = json.loads(gzip.decompress(OUT.read_bytes()).decode('utf-8')) if OUT.exists() else {}
s = requests.Session(); s.headers['User-Agent'] = 'Mozilla/5.0'

def chart(ysym, rng):
    for host in ('query1', 'query2'):
        for i in range(3):
            try:
                r = s.get(f'https://{host}.finance.yahoo.com/v8/finance/chart/{ysym}',
                          params={'range': rng, 'interval': '1d', 'events': 'div'}, timeout=25)
                if r.status_code == 404: return None
                if r.ok:
                    res = r.json()['chart']['result'][0]
                    tz = res['meta'].get('gmtoffset', 0)
                    ts = res.get('timestamp') or []
                    c = res['indicators']['quote'][0]['close']
                    a = (res['indicators'].get('adjclose') or [{}])[0].get('adjclose') or c
                    d = [dt.datetime.utcfromtimestamp(t + tz).date().isoformat() for t in ts]
                    v = {dt.datetime.utcfromtimestamp(int(k) + tz).date().isoformat(): x['amount']
                         for k, x in ((res.get('events') or {}).get('dividends') or {}).items()}
                    return d, c, a, v
            except Exception:
                pass
            time.sleep(1.5 * (i + 1))
    return None

def merge(prev, new):
    d, c, a, v = new
    m = {x: (cc, aa) for x, cc, aa in zip(prev.get('d', []), prev.get('c', []), prev.get('a', []))}
    # 還原收盤會因新的配息整段改寫：補資料時以新抓的區間為準，舊區間依最新一天的比例重新縮放
    ratio = None
    for x, cc, aa in zip(d, c, a):
        if cc is None or aa is None: continue
        if x in m and m[x][1] and ratio is None: ratio = aa / m[x][1]
        m[x] = (cc, aa)
    if ratio and abs(ratio - 1) > 1e-9:
        newset = set(d)
        m = {x: (cc, aa if x in newset else aa * ratio) for x, (cc, aa) in m.items()}
    ks = sorted(m)
    return {'d': ks, 'c': [round(m[k][0], 4) for k in ks], 'a': [round(m[k][1], 4) for k in ks],
            'v': {**prev.get('v', {}), **v}}

out, ok, fail = {}, 0, []
today = dt.date.today().isoformat()
for sym in US + TW_ETF:
    prev = old.get(sym, {})
    fresh = prev.get('d') and prev['d'][0] <= (dt.date.today() - dt.timedelta(days=365 * 5 + 200)).isoformat()
    rng = '3mo' if fresh else '6y'
    ys = [sym.replace('.', '-')] if sym in US else ([sym + '.TWO', sym + '.TW'] if sym.endswith('B') else [sym + '.TW', sym + '.TWO'])  # 債券 ETF 多在櫃買
    got = None
    for y in ys:
        got = chart(y, rng)
        if got and len(got[0]) > 5: break
    if got and len(got[0]) > 5:
        out[sym] = merge(prev if fresh else {}, got); ok += 1
    else:
        if prev: out[sym] = prev
        fail.append(sym)
    time.sleep(0.25)
OUT.write_bytes(gzip.compress(json.dumps(out, separators=(',', ':')).encode('utf-8')))
print(f'長歷史：成功 {ok}／{len(US) + len(TW_ETF)}（美股 {len(US)}、台股 ETF {len(TW_ETF)}）；失敗 {len(fail)}：{fail[:20]}；'
      f'{OUT.stat().st_size // 1024} KB')
