"""市場傳導艙 · 全美股清單（搜尋與加入標的池用）

來源：Nasdaq 官網選股器（NASDAQ／NYSE／NYSE American 全部股票與 ETF，含產業分類）
  股票：市值 10 億美元以上；ETF：全部（選股器沒有 ETF 的成交量，無法篩選）。SPAC（Blank Checks）不收。
  產業 → 傳導艙的 26 個美股板塊：依產業名稱比對（下方 RULES 依序，第一個命中就用），
  註冊地在中國／香港的公司一律歸「中概股」。頁面內建的約 230 檔維持手選板塊，不會被覆蓋。

輸出 twflow/web/data/capsule_usall.json：{"date": ..., "data": "代號|名稱|型別(0股1ETF2槓桿反向)|板塊|影響力"}
影響力：股票用市值取對數換成 5–100；ETF 一律 20。
用法：python gen_usall.py
"""
import json, math, pathlib, re, datetime as dt
import requests

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'twflow/web/data/capsule_usall.json'   # 隨 GitHub Pages 發布，頁面開啟後在背景讀取
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
     "Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"}
RULES = [   # (產業名稱正規式, 板塊)
    (r'Semiconductor', 'us_semi'),
    (r'Computer Software|EDP Services|Retail: Computer Software', 'us_soft'),
    (r'Computer Manufacturing|Computer peripheral|Computer Communications|Telecommunications Equipment|Radio And Television', 'us_comm'),
    (r'Electronic Components', 'us_elec'),
    (r'Pharmaceutical Preparations|Other Pharmaceuticals|Medicinal Chemicals', 'PHARMA'),
    (r'Biological Products|Biotechnology: Commercial', 'us_biotech'),
    (r'Laboratory Analytical|Instruments', 'us_instr'),
    (r'Medical|Ophthalmic|Electromedical|In Vitro|Hospital|Nursing|Health', 'us_med'),
    (r'Major Banks|Commercial Banks|^Banks$|Savings Institutions', 'us_bank'),
    (r'Insur', 'us_ins'),
    (r'Investment|Finance|Brokers|Trusts Except|Real Estate', 'us_asset'),
    (r'Oil|Gas Production|Coal|Natural Gas Distribution', 'us_energy'),
    (r'Electric Utilities|Power Generation|Water Supply|Environmental Services', 'us_util'),
    (r'Aerospace|Military|Ordnance', 'us_aero'),
    (r'Auto|Motor Vehicles', 'us_auto'),
    (r'Railroads|Trucking|Air Freight|Freight|Marine Transportation|Transportation Services', 'us_transp'),
    (r'Hotels|Resorts|Travel', 'us_trav'),
    (r'Movies|Entertainment|Amusement|Broadcasting|Cable|Publishing|Advertising|Newspapers|Recreational Games', 'us_ent'),
    (r'Restaurants|Packaged Foods|Beverages|Farming|Meat|Specialty Foods|Food Distributors|Food Chains', 'us_food'),
    (r'Specialty Stores|Department|RETAIL|Catalog|Supply Stores', 'us_retail'),
    (r'Apparel|Clothing|Shoe|Textiles|Cosmetics|Home Furnishings|Homebuilding|Consumer Electronics|Consumer Specialties', 'us_appr'),
    (r'Electrical Products|Industrial Machinery|Metal Fabrications|Fluid Controls|Construction|Building|Pipeline', 'us_elec'),
]
SECTOR_DEFAULT = {'Technology': 'us_soft', 'Health Care': 'us_med', 'Finance': 'us_asset', 'Industrials': 'us_elec',
                  'Consumer Discretionary': 'us_appr', 'Consumer Staples': 'us_food', 'Energy': 'us_energy',
                  'Utilities': 'us_util', 'Telecommunications': 'us_comm', 'Basic Materials': 'us_elec',
                  'Real Estate': 'us_asset', 'Miscellaneous': 'us_elec'}
ETF_RULES = [(r'Semiconductor|SOX', 'us_semi'), (r'Bitcoin|Ether|Crypto|Blockchain|Solana|XRP', 'us_crypto'),
             (r'China|Chinese|Hong Kong', 'us_china'), (r'Biotech|Genomic', 'us_biotech'), (r'Health|Pharma', 'us_drug'),
             (r'Financial|Bank', 'us_bank'), (r'Energy|Oil|Gas|MLP', 'us_energy'), (r'Utilit', 'us_util'),
             (r'Software|Cloud|Cyber', 'us_soft'), (r'Aerospace|Defense', 'us_aero'), (r'Retail|Consumer Discretionary', 'us_retail'),
             (r'Consumer Staples|Food', 'us_food'), (r'Transport', 'us_transp')]
LEV = re.compile(r'\b[23]X\b|Ultra|Bull|Bear|Inverse|-1X|\bShort\b|Leveraged', re.I)

def get(url):
    r = requests.get(url, headers=H, timeout=90); r.raise_for_status()
    return (r.json().get('data') or {}).get('rows') or (r.json().get('data') or {}).get('data', {}).get('rows') or []
def num(v):
    try: return float(re.sub(r'[$,%\s]', '', str(v)))
    except (TypeError, ValueError): return None
def sym(s): return s.strip().replace('/', '.').replace('^', '.P')

out = []
for r in get('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true'):
    s = (r.get('symbol') or '').strip(); ind = (r.get('industry') or '').strip(); sec = (r.get('sector') or '').strip()
    mcap = num(r.get('marketCap')) or 0
    if not s or ' ' in s or mcap < 1e9 or ind == 'Blank Checks' or not sec: continue
    name = (r.get('name') or '').replace(' Common Stock', '').replace(' Class A', '').replace(' Ordinary Shares', '').strip()
    if (r.get('country') or '') in ('China', 'Hong Kong'): sc = 'us_china'
    elif re.search(r'Bitcoin|Crypto|Coinbase|Blockchain|Digital Asset|^Strategy Inc', name, re.I): sc = 'us_crypto'
    elif re.search(r'^Visa|Mastercard|PayPal|American Express|Fiserv|Fidelity National Info|Global Payments', name, re.I): sc = 'us_asset'
    else:
        sc = next((v for pat, v in RULES if re.search(pat, ind, re.I)), SECTOR_DEFAULT.get(sec, 'us_elec'))
        if sc == 'PHARMA': sc = 'us_drug' if mcap >= 2e10 else 'us_biotech'
    w = int(max(5, min(100, round(math.log10(mcap / 1e8) * 21))))
    out.append([sym(s), name[:40], 0, sc, w])
for r in get('https://api.nasdaq.com/api/screener/etf?tableonly=true&limit=10000&offset=0&download=true'):
    s = (r.get('symbol') or '').strip(); name = (r.get('companyName') or r.get('name') or '').strip()
    if not s or not num(r.get('lastSalePrice') or r.get('lastsale')): continue
    sc = next((v for pat, v in ETF_RULES if re.search(pat, name, re.I)), 'us_etf')
    w = 20                      # ETF 選股器沒有成交量／規模欄位，影響力一律給 20（內建的常見 ETF 保留各自的值）
    out.append([sym(s), name[:40], 2 if LEV.search(name) else 1, sc, w])
if len(out) < 1500:
    raise SystemExit(f'美股清單只有 {len(out)} 檔，保留舊檔')
out.sort(key=lambda x: -x[4])
OUT.write_text(json.dumps({'date': dt.date.today().isoformat(),
                           'data': '\n'.join('|'.join(str(v).replace('|', '/') for v in r) for r in out)},
                          ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
from collections import Counter
print(f'全美股清單：{len(out)} 檔（股票 {sum(1 for r in out if r[2] == 0)}、ETF {sum(1 for r in out if r[2])}）；'
      f'{OUT.stat().st_size // 1024} KB；板塊分布 {Counter(r[3] for r in out).most_common(8)}')
