"""市場傳導艙 · 上市櫃公司法人說明會（公開資訊觀測站「法人說明會一覽表」）

來源：mopsov.twse.com.tw ajax_t100sb02_1（上市 sii、上櫃 otc，依年月查詢）。
輸出 tools/capsule/conf_events.json：{"YYYY-MM": [[代號, 名稱, 日期, 時間, 擇要訊息], ...]}
第一次回補 2021-01 起；之後每天只重抓上個月、本月與未來 3 個月。
用法：python fetch_conf.py [--backfill]
"""
import json, pathlib, re, sys, time, datetime as dt
import requests

OUT = pathlib.Path(__file__).resolve().parent / 'conf_events.json'
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
     'Referer': 'https://mopsov.twse.com.tw/mops/web/t100sb02_1'}
old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
backfill = not old or '--backfill' in sys.argv

def months(a, b):
    y, m = a
    while (y, m) <= b:
        yield y, m
        m += 1
        if m == 13: y, m = y + 1, 1
def fetch(typek, y, m):
    for i in range(3):
        try:
            r = requests.post('https://mopsov.twse.com.tw/mops/web/ajax_t100sb02_1', headers=H, timeout=60,
                              data={'encodeURIComponent': 1, 'step': 1, 'firstin': 1, 'off': 1, 'TYPEK': typek,
                                    'year': str(y - 1911), 'month': f'{m:02d}', 'co_id': ''})
            if r.ok and '公司代號' in r.text: return r.text
            if r.ok and ('查無' in r.text or '無資料' in r.text): return ''
        except Exception:
            pass
        time.sleep(4 * (i + 1))
    return None
def parse(html):
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S):
        tds = [re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', td)).strip() for td in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)]
        if len(tds) < 6 or not re.match(r'^\d{4,6}[A-Z]?$', tds[0]): continue
        dm = re.match(r'(\d{2,3})/(\d{2})/(\d{2})', tds[2])
        if not dm: continue
        d = f'{int(dm.group(1)) + 1911}-{dm.group(2)}-{dm.group(3)}'
        out.append([tds[0], tds[1], d, tds[3][:5], tds[5][:120]])
    return out
today = dt.date.today()
end = (today.year + (today.month + 3 > 12), (today.month + 3 - 1) % 12 + 1)
start = (2021, 1) if backfill else (today.year - (today.month == 1), (today.month - 2) % 12 + 1)
n = 0
for y, m in months(start, end):
    key = f'{y}-{m:02d}'; rows = []
    ok = True
    for typek in ('sii', 'otc'):
        h = fetch(typek, y, m); n += 1
        if h is None: ok = False; break
        rows += parse(h)
        time.sleep(1.2)
    if ok:
        old[key] = sorted({tuple(r) for r in rows})
    if n % 20 == 0:
        OUT.write_text(json.dumps(old, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'  … {key}', flush=True)
# 歷史月份只留 代號／日期／時間（事件研究用），最近與未來的月份才留名稱與擇要訊息，檔案才不會每天膨脹
cut = f'{today.year - (today.month == 1)}-{(today.month - 2) % 12 + 1:02d}'
old = {k: ([[r[0], r[2], r[3]] if len(r) > 3 else r for r in v] if k < cut else v) for k, v in old.items()}
OUT.write_text(json.dumps(old, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'法說會：{len(old)} 個月、{sum(len(v) for v in old.values())} 場；{OUT.stat().st_size // 1024} KB')
