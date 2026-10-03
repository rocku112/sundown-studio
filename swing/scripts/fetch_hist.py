#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
波段實驗室的長期日線：台股流動性前 N 檔＋主要 ETF，Yahoo 五年 OHLCV。

為什麼不用 twflow 自己的逐日檔：只有約 100 個交易日，回測短線策略至少要涵蓋
多頭、空頭、盤整各一輪，三到五年是下限。證交所逐檔逐月抓要上萬個請求，不可行；
Yahoo 一檔一個請求就給五年。

原始日線不進版控（每天整份改寫、約 10 MB），只放在 .cache；回測結果才進版控。

用法：
  python swing/scripts/fetch_hist.py            # 依 twflow 資料挑股票池
  python swing/scripts/fetch_hist.py --top 30   # 少抓一點（除錯用）
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
TW_WEB = os.path.join(REPO, "twflow", "web", "data")
CACHE = os.path.join(ROOT, ".cache")
OUT = os.path.join(CACHE, "ohlcv.json")

# 主要 ETF：市值型、高股息、槓桿各取代表。名稱以 twflow 搜尋表為準，沒有就用這裡的
ETFS = {"0050": "元大台灣50", "006208": "富邦台50", "0056": "元大高股息",
        "00878": "國泰永續高股息", "00919": "群益台灣精選高息", "00929": "復華台灣科技優息",
        "00631L": "元大台灣50正2"}

UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
DELAY = 0.35


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def universe(top):
    """流動性前 top 檔：近 20 日平均成交值（收盤 × 成交量）排序。"""
    latest, hist = load(os.path.join(TW_WEB, "latest.json")), load(os.path.join(TW_WEB, "history.json"))
    sd, rank = latest["stock_data"], []
    for code, s in hist["stocks"].items():
        c, v = s.get("c") or [], s.get("v") or []
        pairs = [(a, b) for a, b in zip(c[-20:], v[-20:]) if a and b]
        if len(pairs) >= 15 and code in sd:
            rank.append((sum(a * b for a, b in pairs) / len(pairs), code))
    rank.sort(reverse=True)
    out = [(code, sd[code]["name"], sd[code]["market"], "stock") for _, code in rank[:top]]
    search = load(os.path.join(TW_WEB, "search.json"))
    out += [(c, search.get(c, n), "TWSE", "etf") for c, n in ETFS.items()]
    return out


def yahoo(sym):
    r = requests.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                     params={"range": "5y", "interval": "1d"}, headers=UA, timeout=25)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    res = r.json()["chart"]["result"][0]
    q, off = res["indicators"]["quote"][0], res["meta"].get("gmtoffset", 0)
    rows = []
    for i, t in enumerate(res.get("timestamp") or []):
        o, h, l, c, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
        if None in (o, h, l, c) or c <= 0:
            continue
        d = datetime.fromtimestamp(t + off, tz=timezone.utc).date().isoformat()
        rows.append([d, round(o, 3), round(h, 3), round(l, 3), round(c, 3), int(v or 0)])
    dedup = {r[0]: r for r in rows}
    return [dedup[d] for d in sorted(dedup)]


def main():
    ap = argparse.ArgumentParser()
    # 抓得比實際交易的範圍大：回測時每天只交易「當時」流動性前 150 檔（見 backtest_swing.py），
    # 若只抓「今天」最熱的 150 檔，等於事先知道誰是這幾年的贏家（倖存者偏誤）
    ap.add_argument("--top", type=int, default=400)
    args = ap.parse_args()
    uni = universe(args.top)
    data, failed = {}, {}
    for i, (code, name, mkt, kind) in enumerate(uni):
        # 上櫃在 Yahoo 是 .TWO；判斷錯了就換另一個再試一次
        sufs = [".TWO", ".TW"] if mkt == "TPEx" else [".TW", ".TWO"]
        for suf in sufs:
            try:
                rows = yahoo(code + suf)
                if len(rows) > 200:
                    data[code] = {"name": name, "kind": kind, "rows": rows}
                    break
            except Exception as e:      # 單檔失敗不影響其他檔
                failed[code] = repr(e)[:120]
            time.sleep(DELAY)
        else:
            failed.setdefault(code, "資料不足")
        if code in data:
            failed.pop(code, None)
        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{len(uni)}  成功 {len(data)}")
    os.makedirs(CACHE, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "symbols": data}, f, ensure_ascii=False, separators=(",", ":"))
    days = [len(v["rows"]) for v in data.values()]
    print(f"完成 {len(data)}/{len(uni)} 檔，中位數 {sorted(days)[len(days)//2] if days else 0} 天；失敗 {failed}")
    if len(data) < len(uni) * 0.8:
        sys.exit("成功率不到八成，來源可能有問題")


if __name__ == "__main__":
    main()
