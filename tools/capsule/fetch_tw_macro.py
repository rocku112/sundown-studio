"""市場傳導艙 · 台灣總經事件的官方日期（央行理監事會、CPI、出口）

  央行理監事會  中央銀行「理監事聯席會議決議」列表（cbc.gov.tw/tw/lp-357-1）：標題含會議日期；
               「XXX年中央銀行理監事聯席會議預定日期」公告給未來日期
  台灣 CPI      主計總處新聞稿列表（stat.gov.tw News.aspx?n=3703）：張貼日期＋標題裡的 CPI 年增率；
               未來日期取自主計總處「預告統計資料發布時間表」
  台灣出口      財政部新聞稿列表（mof.gov.tw multiplehtml）：「海關進出口貿易初步統計」的發布日期；
               每則都附「下次發布日期」，最新一則就是下一次
台灣沒有公開的市場共識：CPI 用「年增率 − 前 3 個月平均」當意外值；央行與出口只估事件窗超額波動。

輸出 tools/capsule/tw_macro.json：{"cbc": [日期], "twcpi": [[日期, 年增率%]], "twexp": [日期], "next": {事件: 日期}}
已有的歷史保留，每天只抓最新幾頁；第一次執行會往回翻到 2021 年。
用法：python fetch_tw_macro.py
"""
import json, pathlib, re, time, datetime as dt
import requests

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'tw_macro.json'
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'}
STOP = '2021-04-01'
old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
first_run = not old
s = requests.Session(); s.headers.update(H)

def get(url):
    for i in range(3):
        try:
            r = s.get(url, timeout=40)
            if r.ok: return r.text
        except Exception:
            pass
        time.sleep(3 * (i + 1))
    return None
def roc(y, m, d): return f'{int(y) + 1911}-{int(m):02d}-{int(d):02d}'

# ── 央行理監事會 ──
cbc, cbc_next = set(old.get('cbc', [])), []
for p in range(1, 15 if first_run else 3):
    t = get(f'https://www.cbc.gov.tw/tw/lp-357-1-{p}-20.html' if p > 1 else 'https://www.cbc.gov.tw/tw/lp-357-1.html')
    if not t: break
    titles = re.findall(r'title="([^"]+)"', t)
    got = [roc(*m.groups()) for x in titles for m in [re.search(r'(\d{2,3})年(\d{1,2})月(\d{1,2})日央行理監事會', x)] if m]
    cbc.update(got)
    for href, ttl in re.findall(r'href="(/tw/cp-357-[^"]+)"[^>]*title="(\d{3}年中央銀行理監事聯席會議預定日期)"', t):
        art = get('https://www.cbc.gov.tw' + href) or ''
        body = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', art))
        seg = body[body.find('茲預定'):][:400] if '茲預定' in body else ''
        cbc_next += [roc(yy, m, d) for yy, m, d in re.findall(r'(\d{3})年(\d{1,2})月(\d{1,2})日', seg)]
    if got and min(got) < STOP: break
    time.sleep(1)

print(f'央行：{len(cbc)} 次', flush=True)
# ── 台灣 CPI（主計總處新聞稿：張貼日期＋標題年增率）──
cpi = {d: v for d, v in old.get('twcpi', [])}
for p in range(1, 70 if first_run else 3):
    if p % 10 == 0: print(f'  主計總處第 {p} 頁', flush=True)
    t = get(f'https://www.stat.gov.tw/News.aspx?n=3703&sms=11480&page={p}&PageSize=20')
    if not t: break
    rows = re.findall(r'title="(\d{2,3})年(\d{1,2})月消費者物價指數\(CPI\)年增率(漲|跌)([\d.]+)％[^"]*"[^<]*</a></span></td>\s*<td[^>]*>\s*<span>(\d{3})-(\d{2})-(\d{2})</span>', t)
    for y, m, sign, v, py, pm, pd in rows:
        cpi[roc(py, pm, pd)] = float(v) * (1 if sign == '漲' else -1)
    dates = re.findall(r'<span>(\d{3})-(\d{2})-(\d{2})</span>', t)
    if dates and min(roc(*x) for x in dates) < STOP: break
    time.sleep(0.5)

print(f'CPI：{len(cpi)} 次', flush=True)
# ── 台灣出口（財政部新聞稿：發布日期與下次發布日期）──
# 財政部列表的翻頁要靠 JavaScript，只能讀第一頁（最新發布與下次發布日期）；
# 較早的發布日取自主計總處「最新訊息」（彙整各機關發布，約回溯兩年），之後每天累積
exp, exp_next = set(old.get('twexp', [])), None
t = get('https://www.mof.gov.tw/List.aspx?n=1009')
for blk in re.findall(r"title='\d+年\d+月海關進出口貿易初步統計'.*?</a>", t or '', re.S):
    m = re.search(r'(?<!下次)發布日期：?\s*(\d{3})年(\d{1,2})月(\d{1,2})日', blk)
    if m: exp.add(roc(*m.groups()))
    n = re.search(r'下次發布日期：?\s*(\d{3})年(\d{1,2})月(\d{1,2})日', blk)
    if n and exp_next is None: exp_next = roc(*n.groups())
for p in range(1, 9 if first_run else 2):
    t = get(f'https://www.stat.gov.tw/News.aspx?n=3635&sms=10980&page={p}&PageSize=50')
    if not t: break
    for py, pm, pd in re.findall(r'title="\d+年\d+月海關進出口貿易初步統計"[^<]*</a>.*?<span>(\d{3})-(\d{2})-(\d{2})</span>', t, re.S):
        exp.add(roc(py, pm, pd))
    time.sleep(0.5)

# ── 未來的 CPI 發布日：主計總處預告統計資料發布時間表 ──
cpi_next = []
t = get(f'https://www.stat.gov.tw/News_NoticeCalendar.aspx?n=3717&page=1&PageSize=100&year={dt.date.today().year}&month=1&Dept=4527&_Showtype=0')
if t and 'var VueData = ' in t:
    vd, _ = json.JSONDecoder().raw_decode(t[t.index('var VueData = ') + len('var VueData = '):])
    for it in vd.get('list', []):
        if it.get('name') != '消費者物價指數': continue
        for month in it.get('timedatas', []):
            for x in month:
                n = re.match(r'\((\d{3})(\d{2})\)', x.get('notice', ''))
                if not n: continue
                yy, mm = int(n.group(1)) + 1911, int(n.group(2)) + 1        # 資料月份的下一個月發布
                if mm == 13: yy, mm = yy + 1, 1
                cpi_next.append(f'{yy}-{mm:02d}-{int(x["date"]):02d}')

today = dt.date.today().isoformat()
out = {'cbc': sorted(d for d in cbc if d >= STOP), 'twcpi': sorted([d, v] for d, v in cpi.items() if d >= STOP),
       'twexp': sorted(d for d in exp if d >= STOP),
       'next': {'cbc': sorted(set(d for d in cbc_next if d >= today) | set(old.get('next', {}).get('cbc', [])) - {x for x in cbc if x < today}),
                'twexp': [exp_next] if exp_next and exp_next >= today else [d for d in old.get('next', {}).get('twexp', []) if d >= today],
                'twcpi': sorted(d for d in set(cpi_next) if d >= today) or [d for d in old.get('next', {}).get('twcpi', []) if d >= today]},
       'fetched': today}
out['next']['cbc'] = [d for d in out['next']['cbc'] if d >= today]
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding='utf-8')
print(f'台灣總經：央行 {len(out["cbc"])} 次、CPI {len(out["twcpi"])} 次、出口 {len(out["twexp"])} 次；未來 {out["next"]}')
