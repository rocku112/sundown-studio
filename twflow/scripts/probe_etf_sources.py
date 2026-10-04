#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性探測：ETF 可用的官方資料來源（只印出結果，不寫檔）。CI 用，確認格式後會刪除。"""

import csv
import io
import json
import re

import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36"}


def show(tag, url, method="get", data=None, n=600):
    try:
        r = requests.request(method, url, headers=UA, data=data, timeout=40)
        print(f"\n### {tag} HTTP {r.status_code} {r.headers.get('content-type')} {len(r.content)} bytes")
        print(r.text[:n])
        return r
    except Exception as e:                           # noqa: BLE001
        print(f"\n### {tag} 失敗 {e!r}")


def swagger(tag, url):
    r = show(tag, url, n=0)
    try:
        j = r.json()
    except Exception:                                # noqa: BLE001
        return
    for p, v in j.get("paths", {}).items():
        for m, x in v.items():
            s = f"{x.get('summary', '')} {x.get('description', '')}"
            if re.search(r"ETF|ETN|受益|基金|指數股票|息|費用|淨值", s):
                print(f"  {p}  {s.strip()[:80]}")


swagger("證交所 OpenAPI", "https://openapi.twse.com.tw/v1/swagger.json")
swagger("櫃買 OpenAPI", "https://www.tpex.org.tw/openapi/swagger.json")

# 集保：ETF 有沒有在股權分散表裡
r = requests.get("https://opendata.tdcc.com.tw/getOD.ashx?id=1-5", headers=UA, timeout=60)
rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig", errors="ignore"))))
etf = {x[1].strip() for x in rows[1:] if len(x) > 2 and re.match(r"^00\d{2,4}[A-Z]?$", x[1].strip())}
print(f"\n### 集保 ETF 代號數 {len(etf)}；例", sorted(etf)[:10])
for x in rows[1:]:
    if len(x) > 5 and x[1].strip() in ("0050", "00878", "00919") and x[2].strip() == "17":
        print("   ", x)

# 除權息表：ETF 的配息
r = show("TWT49U 2026-07~09", "https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=20260701&endDate=20260930&response=json", n=0)
try:
    j = r.json()
    f = j.get("fields")
    print("  fields", f)
    print("  ETF 列", [x for x in j.get("data", []) if str(x[1]).startswith("00")][:5])
    print("  共", len(j.get("data", [])), "列，ETF", sum(1 for x in j.get("data", []) if str(x[1]).startswith("00")))
except Exception as e:                               # noqa: BLE001
    print("  解析失敗", e)
r = show("TWT48U 除權除息預告", "https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json", n=0)
try:
    j = r.json()
    print("  fields", j.get("fields"))
    print("  ETF 列", [x for x in j.get("data", []) if str(x[1]).startswith("00")][:5])
except Exception as e:                               # noqa: BLE001
    print("  解析失敗", e)

# 證交所 ETF e 添富（ETFortune）與其他候選
for tag, url in [
    ("OpenAPI t187ap47_L", "https://openapi.twse.com.tw/v1/opendata/t187ap47_L"),
    ("ETFortune 列表", "https://www.twse.com.tw/rwd/zh/ETFortune/etfInfo?response=json"),
    ("ETF 商品列表", "https://www.twse.com.tw/rwd/zh/ETF/list?response=json"),
    ("ETF 配息", "https://www.twse.com.tw/rwd/zh/ETF/etfDiv?response=json"),
    ("ETFortune 首頁", "https://www.twse.com.tw/zh/ETFortune/index"),
    ("TPEx ETF 列表", "https://www.tpex.org.tw/www/zh-tw/ETF/list?response=json"),
    ("投信投顧公會 ETF", "https://www.sitca.org.tw/ROC/Industry/IN2629.aspx"),
]:
    show(tag, url, n=400)
