"""市場傳導艙 · 美國政府貿易／關稅行動（Federal Register：總統公告、行政命令、備忘錄）

來源：federalregister.gov API（官方、免金鑰）。抓 2017-01-20 起的總統文件，標題與關稅／貿易有關的才留下，
依標題用字分成「升級」（課徵、提高、追加…）、「緩和」（暫停、豁免、降低、協議…）、「其他」。
輸出 tools/capsule/policy_events.json：[[簽署日, 類型, 分類, 標題, 網址], ...]
用法：python fetch_policy.py
"""
import json, pathlib, re, time
import requests

OUT = pathlib.Path(__file__).resolve().parent / 'policy_events.json'
TRADE = re.compile(r'tariff|duties|\bduty\b|imports? of|importation|section 232|section 301|reciprocal|steel|aluminum|semiconductor|de minimis|trade (agreement|deal|practices)|ieepa', re.I)
ESC = re.compile(r'impos|increas|addition|adjusting imports|raising|excluding|further|reciprocal tariff|new tariff', re.I)
DEESC = re.compile(r'suspend|pause|reduc|exempt|terminat|extend.*(deadline|period)|implementing.*agreement|deal', re.I)

docs, page = [], 1
while True:
    params = [('conditions[type][]', 'PRESDOCU'), ('conditions[term]', 'tariff | duties | "section 232" | "section 301" | reciprocal'),
              ('conditions[signing_date][gte]', '2017-01-20'), ('per_page', '100'), ('page', str(page)), ('order', 'oldest')]
    params += [('fields[]', f) for f in ('title', 'signing_date', 'subtype', 'html_url')]
    for i in range(3):
        try:
            r = requests.get('https://www.federalregister.gov/api/v1/documents.json', params=params, timeout=60)
            if r.ok: break
        except Exception:
            pass
        time.sleep(3 * (i + 1))
    else:
        raise SystemExit('Federal Register 無法連線，保留舊檔')
    j = r.json(); docs += j.get('results', [])
    if page >= j.get('total_pages', 1): break
    page += 1
out = []
for d in docs:
    t, sd = d.get('title') or '', d.get('signing_date')
    if not sd or not TRADE.search(t): continue
    kind = 'esc' if ESC.search(t) and not DEESC.search(t) else 'de' if DEESC.search(t) else 'mix'
    out.append([sd, d.get('subtype') or '', kind, t, d.get('html_url') or ''])
out.sort()
if len(out) < 50:
    raise SystemExit(f'只有 {len(out)} 份，保留舊檔')
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding='utf-8')
print(f'貿易／關稅總統文件：{len(out)} 份（升級 {sum(1 for x in out if x[2] == "esc")}、緩和 {sum(1 for x in out if x[2] == "de")}）；最新 {out[-1][0]} {out[-1][3][:60]}')
