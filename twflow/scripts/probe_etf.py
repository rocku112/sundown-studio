#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
探測 ETF 淨值來源：印出原始回應的結構與前幾筆，給寫解析器用。
（開發環境連不到證交所，只能在 CI 看真實格式。）
"""
import json
import sys

import requests

UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
SRC = [
    ("盤中估計淨值 all_etf", "https://mis.twse.com.tw/stock/data/all_etf.txt"),
    ("上市 ETF 收盤 MI_INDEX 0099P",
     "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=" + (sys.argv[1] if len(sys.argv) > 1 else "20261002")
     + "&type=0099P&response=json"),
    ("Yahoo 2330.TW 5年", "https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?range=5y&interval=1d"),
    ("Yahoo 0050.TW 5年", "https://query1.finance.yahoo.com/v8/finance/chart/0050.TW?range=5y&interval=1d"),
    ("Yahoo 6488.TWO 5年（上櫃）", "https://query1.finance.yahoo.com/v8/finance/chart/6488.TWO?range=5y&interval=1d"),
]


def show(o, depth=0, maxlist=2):
    pad = "  " * depth
    if isinstance(o, dict):
        for k, v in list(o.items())[:25]:
            if isinstance(v, (dict, list)):
                print(f"{pad}{k}: {type(v).__name__}({len(v)})")
                if depth < 3:
                    show(v, depth + 1)
            else:
                print(f"{pad}{k}: {str(v)[:120]!r}")
    elif isinstance(o, list):
        for x in o[:maxlist]:
            if isinstance(x, (dict, list)):
                show(x, depth + 1)
            else:
                print(f"{pad}- {str(x)[:160]!r}")


for name, url in SRC:
    print(f"\n════ {name}\n{url}")
    try:
        r = requests.get(url, headers=UA, timeout=25)
        print("HTTP", r.status_code, len(r.content), "bytes", r.headers.get("content-type"))
        try:
            j = r.json()
        except ValueError:
            print(r.text[:600])
            continue
        if "chart" in j:
            res = j["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            print("天數", len(res.get("timestamp", [])), "欄位", list(q), "meta", {k: res["meta"].get(k) for k in ("currency", "exchangeName", "gmtoffset")})
            print("最後 3 天 close", q["close"][-3:], "high", q["high"][-3:], "volume", q["volume"][-3:])
        else:
            show(j)
    except Exception as e:  # 探測用，任何錯誤都印出來繼續
        print("錯誤", repr(e)[:300])
