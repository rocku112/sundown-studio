#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股每日價量 + 三大法人買賣超 管線（上市 TWSE ＋ 上櫃 TPEx）。

資料來源（皆為免申請的公開端點，2026-08 實測）：
  TWSE 收盤  https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=YYYYMMDD&type=ALLBUT0999
  TWSE 法人  https://www.twse.com.tw/rwd/zh/fund/T86?date=YYYYMMDD&selectType=ALLBUT0999
  TPEx 收盤  https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?d=RRR/MM/DD
  TPEx 法人  https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date=RRR/MM/DD
  交易日曆   https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=YYYYMM01&stockNo=2330
             （借台積電的月成交表當交易日清單，一個月一次呼叫）

輸出：
  data/market/days/YYYY-MM-DD.json  逐日原始彙整（append-only，進版控）
  data/market/panel.json            由逐日檔推導的面板（不進版控，可重建）
  data/market/market.json           大盤（加權指數、漲跌家數）
  .cache/market/*.json              來源原始回應，重跑不重抓

用法：
  python scripts/fetch_market.py --days 60
  python scripts/fetch_market.py --days 60 --force     # 忽略快取重抓
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data", "market")
CACHE = os.path.join(ROOT, ".cache", "market")
DAYS = os.path.join(DATA, "days")   # 逐日檔（append-only，進版控）

UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
# TWSE 對高頻請求會直接擋（回 HTML 或空 JSON）。2 秒是實測不會被擋的保守值；
# 反正全部落快取，慢只慢第一次。
DELAY = 2.0

# 普通股：4 位數字、不以 0 開頭。排除 ETF(00xxxx)、權證(6 位含英文)、
# 存託憑證(91xxxx)、債券。Tide 的 1978 檔也是同一個範圍。
STOCK_RE = re.compile(r"^[1-9]\d{3}$")


def tw_today():
    return datetime.now(timezone(timedelta(hours=8))).date()


def roc(d):
    """2026-08-03 → 115/08/03"""
    return f"{d.year - 1911:03d}/{d.month:02d}/{d.day:02d}"


def num(v):
    """'1,234' → 1234.0；'--'/''/'X' → None"""
    if v is None:
        return None
    s = str(v).strip().replace(",", "").replace("+", "")
    if s in ("", "--", "---", "X", "N/A", "null"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


_session = requests.Session()
_session.headers.update(UA)


def get_json(url, cache_key, force=False, retries=3):
    """抓 JSON 並落地快取。被擋（非 JSON）時退避重試。"""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, cache_key + ".json")
    if os.path.exists(path) and not force:
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass  # 快取壞了就重抓

    last = None
    for attempt in range(retries):
        try:
            r = _session.get(url, timeout=40)
            time.sleep(DELAY)
            data = r.json()
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            return data
        except Exception as e:                       # noqa: BLE001
            last = e
            # 被限流時回的是 HTML，json() 會炸。指數退避後再試。
            time.sleep(DELAY * (2 ** attempt))
    print(f"    ! 放棄 {cache_key}：{type(last).__name__} {last}", file=sys.stderr)
    return None


# ── 交易日 ────────────────────────────────────────────────────────────
def trading_days(n, force=False):
    """往回走月份，用台積電的月成交表列出交易日，直到湊滿 n 天。"""
    out = []
    cur = tw_today().replace(day=1)
    today = tw_today()
    guard = 0
    while len(out) < n and guard < 24:
        guard += 1
        ym = f"{cur.year}{cur.month:02d}"
        url = (f"https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY"
               f"?date={ym}01&stockNo=2330&response=json")
        d = get_json(url, f"cal_{ym}", force=force)
        days = []
        if d and d.get("stat") == "OK":
            for row in d.get("data", []):
                m = re.match(r"(\d+)/(\d+)/(\d+)", row[0])
                if not m:
                    continue
                y, mo, dd = int(m.group(1)) + 1911, int(m.group(2)), int(m.group(3))
                dt = date(y, mo, dd)
                if dt <= today:
                    days.append(dt)
        out = days + out
        cur = (cur - timedelta(days=1)).replace(day=1)
    return sorted(out)[-n:]


# ── TWSE ─────────────────────────────────────────────────────────────
def twse_quotes(d, force=False):
    ymd = d.strftime("%Y%m%d")
    url = (f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX"
           f"?date={ymd}&type=ALLBUT0999&response=json")
    j = get_json(url, f"twse_q_{ymd}", force=force)
    out, mkt = {}, {}
    if not j:
        return out, mkt

    for t in j.get("tables", []):
        f = t.get("fields") or []
        # 每日收盤行情表：欄位表隨版本微調過，所以用「有沒有這兩個欄位」來認，
        # 不寫死 tables[8]——寫死的話證交所哪天多插一張表就全錯位。
        if "證券代號" in f and "收盤價" in f:
            ci = {name: i for i, name in enumerate(f)}
            for row in t.get("data", []):
                code = str(row[ci["證券代號"]]).strip()
                if not STOCK_RE.match(code):
                    continue
                out[code] = {
                    "name": str(row[ci["證券名稱"]]).strip(),
                    "market": "TWSE",
                    "close": num(row[ci["收盤價"]]),
                    "open": num(row[ci["開盤價"]]),
                    "high": num(row[ci["最高價"]]),
                    "low": num(row[ci["最低價"]]),
                    "vol": num(row[ci["成交股數"]]),
                }
        # 加權指數
        if f and f[0] == "指數":
            for row in t.get("data", []):
                if "發行量加權股價指數" in str(row[0]):
                    mkt["twse_index"] = num(row[1])
                    mkt["twse_chg_pct"] = num(re.sub(r"<[^>]+>", "", str(row[4])))
        # 漲跌家數
        # 欄位是 ['類型','整體市場','股票']，值長這樣：'7,413(680)' ＝ 上漲 7413 檔、
        # 其中 680 檔漲停。兩個坑：
        #   ① 括號內是漲停數，不能連著一起取——原本用 [^\d,.-] 清字元會把
        #      '7,413(680)' 變成 '7413680'，上漲家數變成 741 萬。
        #   ② 要取「股票」欄不是「整體市場」欄，後者含權證與 ETF（上萬檔），
        #      拿它算漲跌比例會被權證洗掉。
        if f and f[0] == "類型":
            col = f.index("股票") if "股票" in f else 1
            for row in t.get("data", []):
                label = re.sub(r"<[^>]+>", "", str(row[0]))
                raw = re.sub(r"<[^>]+>", "", str(row[col]))
                v = num(raw.split("(")[0])
                if "上漲" in label:
                    mkt["advancers"] = v
                elif "下跌" in label:
                    mkt["decliners"] = v
    return out, mkt


def twse_insti(d, force=False):
    ymd = d.strftime("%Y%m%d")
    url = (f"https://www.twse.com.tw/rwd/zh/fund/T86"
           f"?date={ymd}&selectType=ALLBUT0999&response=json")
    j = get_json(url, f"twse_i_{ymd}", force=force)
    out = {}
    if not j or j.get("stat") != "OK":
        return out
    f = j.get("fields") or []
    ci = {name: i for i, name in enumerate(f)}

    def pick(row, *cands):
        for c in cands:
            if c in ci:
                return num(row[ci[c]])
        return None

    for row in j.get("data", []):
        code = str(row[0]).strip()
        if not STOCK_RE.match(code):
            continue
        # 外資＝「外陸資(不含外資自營商)」＋「外資自營商」，與市場慣例一致
        f1 = pick(row, "外陸資買賣超股數(不含外資自營商)") or 0
        f2 = pick(row, "外資自營商買賣超股數") or 0
        out[code] = {
            "foreign": f1 + f2,
            "trust": pick(row, "投信買賣超股數"),
            # 自營商分「自行買賣」與「避險」。避險是發權證後的被動調整，
            # 跟看多看空無關——Tide 也只計自行買賣，這裡兩者都留，之後才好比較。
            "dealer_self": pick(row, "自營商買賣超股數(自行買賣)"),
            "dealer_hedge": pick(row, "自營商買賣超股數(避險)"),
            "total": pick(row, "三大法人買賣超股數"),
        }
    return out


# ── TPEx ─────────────────────────────────────────────────────────────
def tpex_quotes(d, force=False):
    # ⚠️ 兩個踩過的坑，改動前先讀：
    #
    # ① 舊端點 /web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?d=...
    #    **會忽略日期參數**，永遠回最新交易日，而且 HTTP 200、格式完全正常。
    #    用它抓 60 天會得到 60 份一模一樣的資料，中間不會有任何錯誤訊息——
    #    是靠「所有上櫃股票報酬標準差為 0」才發現的。已棄用。
    #
    # ② 新端點必須帶 type=EW。少了它一樣 200、一樣有 tables 結構，
    #    但 data 是空陣列（rows=0）。日期格式民國、西元皆可，用 - 分隔則會退回最新日。
    url = ("https://www.tpex.org.tw/www/zh-tw/afterTrading/otc"
           f"?date={roc(d)}&type=EW&response=json")
    j = get_json(url, f"tpex_q_{d:%Y%m%d}", force=force)
    out = {}
    if not j:
        return out
    # 回應日期與請求日期不符 → 來源給了別天的資料，寧可當缺漏也不要混入
    got = str(j.get("date") or "")
    if got and got != d.strftime("%Y%m%d"):
        print(f"    ! 上櫃報價日期不符：要 {d:%Y%m%d} 得 {got}，捨棄", file=sys.stderr)
        return out

    for t in j.get("tables", []):
        # 櫃買的欄位名帶尾隨空白與 <br>（'收盤 '、'成交股數  '、'最後買量<br>(張數)'），
        # 正規化後再對名，否則 ci['收盤'] 直接 KeyError。
        f = [re.sub(r"<[^>]+>", "", str(x)).strip() for x in (t.get("fields") or [])]
        ci = {name: i for i, name in enumerate(f)}
        if "代號" not in ci or "收盤" not in ci:
            continue
        for row in t.get("data", []):
            code = str(row[ci["代號"]]).strip()
            if not STOCK_RE.match(code):
                continue
            out[code] = {
                "name": str(row[ci["名稱"]]).strip(),
                "market": "TPEx",
                "close": num(row[ci["收盤"]]),
                "open": num(row[ci["開盤"]]),
                "high": num(row[ci["最高"]]),
                "low": num(row[ci["最低"]]),
                "vol": num(row[ci["成交股數"]]),
            }
    return out


# 櫃買法人表的欄位名重複（七組都叫「買進股數/賣出股數/買賣超股數」），
# 只能靠位置。順序：外資不含自營 / 外資自營 / 外資合計 / 投信 /
#                自營自行 / 自營避險 / 自營合計 / 三大法人合計
# 驗算（2026-08-03 元大富櫃50）：3,000 + 0 + (-90,232) = -87,232 ✓
TPEX_I = {"foreign": 10, "trust": 13, "dealer_self": 16,
          "dealer_hedge": 19, "total": 23}


def tpex_insti(d, force=False):
    url = ("https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade"
           f"?type=Daily&sect=EW&date={roc(d)}&response=json")
    j = get_json(url, f"tpex_i_{d:%Y%m%d}", force=force)
    out = {}
    if not j:
        return out
    for t in j.get("tables", []):
        rows = t.get("data") or []
        if not rows or len(t.get("fields") or []) < 24:
            continue
        for row in rows:
            code = str(row[0]).strip()
            if not STOCK_RE.match(code):
                continue
            out[code] = {k: num(row[i]) for k, i in TPEX_I.items()}
    return out


# ── 主流程 ────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60,
                    help="至少要有幾個交易日；已存在的日期會保留，不會被截掉")
    ap.add_argument("--max-history", type=int, default=500,
                    help="panel 最多保留幾個交易日（約兩年），避免無限膨脹")
    ap.add_argument("--force", action="store_true",
                    help="忽略既有 panel 與快取，整段重抓")
    args = ap.parse_args()

    os.makedirs(DATA, exist_ok=True)
    days = trading_days(args.days, force=args.force)

    # ── 累積式儲存：一天一個檔，append-only ─────────────────────
    # 為什麼不是把 panel.json 直接進版控：它 7MB 且每天整份改寫，天天 commit
    # 一年就是 GB 等級的 git 歷史。逐日檔寫完就不再變動，一天約 120KB，
    # 一年 25MB——這才是能長期跑的形狀。panel.json 改成推導產物（不進版控）。
    #
    # 也不能只靠 .cache：CI 每次都是乾淨環境，快取是空的，等於每天重抓
    # 60 天 × 4 支 API ＝ 240 個請求，對來源站不禮貌也慢。
    os.makedirs(DAYS, exist_ok=True)
    have = {f[:-5] for f in os.listdir(DAYS) if f.endswith(".json")}
    if args.force:
        have = set()

    # union：保留歷史上抓過的所有日期，再加上這次要求的區間
    all_days = sorted(have | {d.isoformat() for d in days})
    if args.max_history:
        all_days = all_days[-args.max_history:]
    days = [date.fromisoformat(s) for s in all_days]

    todo = [d for d in days if d.isoformat() not in have]
    print(f"交易日 {len(days)} 天：{days[0]} ~ {days[-1]}"
          f"（已有 {len(days)-len(todo)}，需抓 {len(todo)}）")

    names, markets = {}, {}
    per_day = {}
    market_rows = []

    # 逐日檔用「欄式」：把重複的鍵名抽成一列 cols，資料是純陣列。
    # 同一天的 dict 版是 386 KB、欄式是 95 KB——一年 99 MB vs 25 MB。
    # 檔案自帶 cols，所以之後加欄位不會讓舊檔讀不了（照名字取值，不靠位置）。
    QCOLS = ["code", "close", "vol"]
    ICOLS = ["code", "foreign", "trust", "dealer_self", "dealer_hedge", "total"]

    def read_day(path):
        with open(path, encoding="utf-8") as f:
            day = json.load(f)
        qc, ic = day["quote_cols"], day["insti_cols"]
        quotes = {r[0]: {k: v for k, v in zip(qc, r)} for r in day["quotes"]}
        insti = {r[0]: {k: v for k, v in zip(ic, r)} for r in day["insti"]}
        for c, v in quotes.items():
            m = meta.get(c, {})
            v["name"], v["market"] = m.get("name", ""), m.get("market", "")
        return quotes, insti, day["market"]

    def write_day(path, key, mkt, quotes, insti):
        with open(path, "w", encoding="utf-8") as f:
            json.dump({
                "date": key, "market": mkt,
                "quote_cols": QCOLS,
                "quotes": [[q.get(k) if k != "code" else c for k in QCOLS]
                           for c, q in sorted(quotes.items())],
                "insti_cols": ICOLS,
                "insti": [[r.get(k) if k != "code" else c for k in ICOLS]
                          for c, r in sorted(insti.items())],
            }, f, ensure_ascii=False, separators=(",", ":"))

    # 個股名稱／市場別只存一份：每天重複存 1979 筆中文名是純浪費，
    # 而且改名是罕見事件，沒必要用逐日欄位表達。
    meta_path = os.path.join(DATA, "stock_meta.json")
    meta = {}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
        except (json.JSONDecodeError, OSError):
            meta = {}

    for i, d in enumerate(days, 1):
        key = d.isoformat()
        path = os.path.join(DAYS, key + ".json")
        if key in have:
            quotes, insti, mkt = read_day(path)
        else:
            q1, mkt = twse_quotes(d, args.force)
            i1 = twse_insti(d, args.force)
            q2 = tpex_quotes(d, args.force)
            i2 = tpex_insti(d, args.force)
            quotes = {**q1, **q2}
            insti = {**i1, **i2}
            mkt["date"] = key
            # 空手的日子不要落檔：來源延遲時寫下去，之後就永遠被當成「已有」
            # 而不再重抓，一個空洞會一直留在歷史裡。
            if not quotes:
                print(f"    ! {key} 無報價資料，略過不落檔", file=sys.stderr)
                continue
            for c, v in quotes.items():
                meta[c] = {"name": v["name"], "market": v["market"]}
            write_day(path, key, mkt, quotes, insti)
            print(f"[{i:3d}/{len(days)}] {d} 抓取  上市{len(q1):5d}  上櫃{len(q2):5d}"
                  f"  法人{len(insti):5d}  大盤{mkt.get('twse_chg_pct')}")

        for c, v in quotes.items():
            if v.get("name"):
                names.setdefault(c, v["name"])
                markets.setdefault(c, v["market"])
            elif c in meta:
                names.setdefault(c, meta[c]["name"])
                markets.setdefault(c, meta[c]["market"])
        per_day[d] = (quotes, insti)
        market_rows.append(mkt)

    days = [d for d in days if d in per_day]

    # ── 組面板 ───────────────────────────────────────────────────────
    codes = sorted(names)
    dates = [d.isoformat() for d in days]
    panel = {}
    for c in codes:
        close, vol = [], []
        net, foreign, trust, dealer = [], [], [], []
        for d in days:
            q, ins = per_day[d]
            row = q.get(c)
            close.append(row["close"] if row else None)
            vol.append(row["vol"] if row else None)
            r = ins.get(c) or {}
            net.append(r.get("total"))
            foreign.append(r.get("foreign"))
            trust.append(r.get("trust"))
            dealer.append(r.get("dealer_self"))

        # 日報酬（%）：自己從收盤價算，不用官方的「漲跌」欄位——
        # 那欄在兩個市場的格式與正負號表示法不同（TWSE 用 HTML 標籤帶顏色），
        # 且遇到停牌/無成交時給法不一致。自己算至少全市場同一把尺。
        chg = [None]
        for k in range(1, len(close)):
            p, q_ = close[k - 1], close[k]
            chg.append(round((q_ - p) / p * 100, 4) if p and q_ else None)

        # 買賣超金額（億）＝ 買賣超股數 × 當日收盤價 / 1e8
        net_yi = [
            round(n * p / 1e8, 4) if (n is not None and p) else None
            for n, p in zip(net, close)
        ]

        panel[c] = {
            "name": names[c], "market": markets[c],
            "close": close, "chg": chg, "vol": vol,
            "net": net, "net_yi": net_yi,
            "foreign": foreign, "trust": trust, "dealer": dealer,
        }

    doc = {
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "dates": dates,
        "stocks": panel,
    }
    with open(os.path.join(DATA, "panel.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(DATA, "market.json"), "w", encoding="utf-8") as f:
        json.dump({"days": market_rows}, f, ensure_ascii=False, indent=1)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))

    # ── 完整性檢查（管線最容易靜默壞掉的地方，明講出來）─────────────
    full_close = sum(1 for v in panel.values() if all(x is not None for x in v["close"]))
    any_net = sum(1 for v in panel.values() if any(x is not None for x in v["net"]))
    size = os.path.getsize(os.path.join(DATA, "panel.json")) / 1e6
    print()
    print(f"個股 {len(panel)} 檔 × {len(dates)} 個交易日")
    print(f"  收盤價全期完整：{full_close} 檔（{full_close/len(panel)*100:.1f}%）")
    print(f"  有法人資料    ：{any_net} 檔（{any_net/len(panel)*100:.1f}%）")
    print(f"  panel.json {size:.1f} MB")


if __name__ == "__main__":
    main()
