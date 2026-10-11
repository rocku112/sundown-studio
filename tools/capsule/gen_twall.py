"""把 twflow 的全市場清單（tw_all.json）＋官方產業價值鏈分類（ic_stock_index.json）
轉成傳導艙用的精簡字串：代號|名稱|型別|板塊|影響力|收盤|漲跌%
型別：0 股票 1 ETF 2 槓桿／反向；板塊為傳導艙的 36 個台股板塊 id。"""
import json, math, pathlib, sys, re
from collections import Counter

root = pathlib.Path(sys.argv[1])          # twflow 目錄
out = pathlib.Path(sys.argv[2])
tw = json.loads((root / 'web/data/tw_all.json').read_text(encoding='utf-8'))
ic = json.loads((root / 'data/ic_stock_index.json').read_text(encoding='utf-8'))['stocks']

# 產業價值鏈路徑 → 板塊（依序比對；每條路徑只取第一個命中的規則）
RULES = [
    ('tw_ip',   r'矽智財'),
    ('tw_dram', r'DRAM|動態隨機|記憶體'),
    ('tw_psu',  r'電源供應|電源管理(?!IC)|不斷電'),
    ('tw_fnd',  r'晶圓製造|晶圓代工|矽晶圓|IC製造'),
    ('tw_dram', r'DRAM|動態隨機'),
    ('tw_fls',  r'Flash|快閃|NAND|記憶卡|儲存'),
    ('tw_osat', r'封裝|測試'),
    ('tw_ate',  r'半導體.*設備|設備.*半導體|製程設備|檢測設備'),
    ('tw_gaas', r'砷化鎵|化合物半導體|射頻'),
    ('tw_icd',  r'IC設計'),
    ('tw_thm',  r'散熱'),
    ('tw_psu',  r'電源供應|電源'),
    ('tw_opt',  r'光通訊|光纖|光收發|雷射'),
    ('tw_opl',  r'光學鏡|鏡頭|鏡片'),
    ('tw_mlcc', r'被動元件|電容|電阻|電感'),
    ('tw_fpc',  r'印刷電路板|軟板|載板|銅箔|PCB'),
    ('tw_lcd',  r'平面顯示器|觸控面板|面板'),
    ('tw_case', r'機殼|機構件|模具'),
    ('tw_net',  r'通信網路|網路設備|交換器|無線通訊'),
    ('tw_pc',   r'電腦及週邊設備|伺服器|主機板|筆記型'),
    ('tw_icd',  r'^半導體'),
    ('tw_fin',  r'^金融'),
    ('tw_air',  r'航空|航太|大眾運輸'),
    ('tw_shp',  r'航運|貨櫃|散裝|船'),
    ('tw_tele', r'電信'),
    ('tw_stl',  r'^鋼鐵'),
    ('tw_pls',  r'石化|塑膠|塑橡膠|橡膠|油電燃氣'),
    ('tw_cem',  r'^水泥'),
    ('tw_food', r'^食品/'),
    ('tw_text', r'^紡織'),
    ('tw_auto', r'^汽車|電動車輛'),
    ('tw_mach', r'電機機械|自動化|智慧電網|風力發電|太陽能|能源元件|汽電共生'),
    ('tw_cons', r'建材營造'),
    ('tw_tour', r'休閒娛樂|觀光|文化創意'),
    ('tw_bio',  r'製藥|醫療器材|再生醫療|食品生技|生技'),
    ('tw_dept', r'貿易百貨|電子商務'),
    ('tw_net',  r'連接器'),
    ('tw_lcd',  r'LED'),
    ('tw_icd',  r'人工智慧|雲端運算|大數據|資通訊安全|軟體服務'),
]
CRE = [(s, re.compile(p)) for s, p in RULES]

def sector_from_paths(paths):
    c = Counter()
    first = {}
    for p in paths:
        for i, (s, rx) in enumerate(CRE):
            if rx.search(p):
                c[s] += 1; first.setdefault(s, i); break
    if not c: return None
    return sorted(c, key=lambda s: (-c[s], first[s]))[0]

def sector_from_code(code):
    if code.startswith('91'): return 'tw_etc'      # 存託憑證
    n = int(code[:2]) if code[:2].isdigit() else 0
    return {11:'tw_cem',12:'tw_food',13:'tw_pls',14:'tw_text',15:'tw_mach',16:'tw_mach',17:'tw_bio',
            18:'tw_bio',20:'tw_stl',22:'tw_auto',25:'tw_cons',26:'tw_shp',27:'tw_tour',28:'tw_fin',
            29:'tw_dept',41:'tw_bio',47:'tw_bio',49:'tw_net',60:'tw_bio',64:'tw_bio'}.get(n, 'tw_etc')

OVS = r'美國|美股|全球|日本|日經|印度|越南|中國|陸股|香港|歐洲|NASDAQ|那斯達克|標普|S&P|費城|道瓊|亞太|亞洲|新興|FANG|東協|韓國|國際|北美|中華|滬深|恒生|德國|英國'
def etf_meta(name):
    lev = bool(re.search(r'正2|反1|反向|槓桿|2X|2倍', name))
    if re.search(r'債|投等|美元|公債', name): s = 'tw_bond'
    elif re.search(r'油|原油|黃金|金礦|商品', name): s = 'tw_pls'
    elif re.search(OVS, name): s = 'tw_ovs'
    elif re.search(r'金融|銀行|金控', name): s = 'tw_fin'
    elif re.search(r'IC設計', name): s = 'tw_icd'
    elif re.search(r'半導體|晶圓', name): s = 'tw_fnd'
    elif re.search(r'高息|高股息|股息|收益|優息|填息|息', name): s = 'tw_pc'
    elif re.search(r'科技|電子|5G|AI|網通|資訊|雲端|智慧', name): s = 'tw_icd'
    elif re.search(r'REIT|地產|不動產|營建', name): s = 'tw_cons'
    elif re.search(r'航運', name): s = 'tw_shp'
    elif re.search(r'生技|醫療', name): s = 'tw_bio'
    elif re.search(r'中小|中型', name): s = 'tw_etc'
    else: s = 'tw_fnd'                         # 市值型（台灣50 等）
    return (2 if lev else 1), s

rows = []; stat = Counter()
for code, name, typ, mkt, px, chg, vol in tw['rows']:
    if typ not in ('s', 'e', 'd'): continue      # 略過特別股、ETN、受益證券
    if typ == 'e':
        kind, sec = etf_meta(name)
    else:
        kind = 0
        sec = sector_from_paths(ic[code]['paths']) if code in ic else None
        stat['ic' if sec else 'code'] += 1
        sec = sec or sector_from_code(code)
    t = (vol or 0) * 1000 * (px or 0)
    w = int(max(5, min(100, round((math.log10(t) - 6) * 22)))) if t > 0 else 5   # 成交值（元）取對數：台積電約 100
    pxs = '' if px is None else ('%g' % px)
    chs = '' if chg is None else ('%g' % chg)
    nm = name.replace('|', '／')
    rows.append(f'{code}|{nm}|{kind}|{sec}|{w}|{pxs}|{chs}')
    stat[sec] += 1

out.write_text(json.dumps({'date': tw['date'], 'data': '\n'.join(rows)}, ensure_ascii=False), encoding='utf-8')
print(tw['date'], len(rows), 'ic-mapped', stat['ic'], 'code-fallback', stat['code'])
print(sorted(((k, v) for k, v in stat.items() if k.startswith('tw_')), key=lambda x: -x[1]))
for c in ['2330','2454','2317','2603','2881','3008','1216','2308','3017','2345','6669','2408','3711','00878','00679B','00631L','00632R','0050']:
    print([r for r in rows if r.startswith(c + '|')][:1])
