#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性探測：ETF 官方資料的欄位細節（只印出結果，不寫檔）。CI 用，確認格式後會刪除。"""

import json

import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36"}


def get(url):
    r = requests.get(url, headers=UA, timeout=60)
    print(f"\n### {url} HTTP {r.status_code} {len(r.content)} bytes")
    return r.json()


j = get("https://openapi.twse.com.tw/v1/opendata/t187ap47_L")
print("筆數", len(j), "欄位", list(j[0].keys()))
for x in j:
    if x.get("基金代號") in ("0050", "0056", "00878", "00679B"):
        print(json.dumps(x, ensure_ascii=False)[:1500])

j = get("https://www.twse.com.tw/rwd/zh/ETF/etfDiv?response=json")
print("keys", list(j.keys()), "fields", j.get("fields"), "筆數", len(j.get("data", [])))
for x in j.get("data", []):
    if x[0] in ("0056", "0050"):
        print([str(v)[:60] for v in x])
for x in j.get("data", [])[:3]:
    print([str(v)[:60] for v in x])
years = sorted({str(x[2])[:4] for x in j.get("data", [])})
print("除息日年份", years)
for q in ("?response=json&stkNo=0056", "?response=json&startDate=20150101&endDate=20261231"):
    try:
        k = get("https://www.twse.com.tw/rwd/zh/ETF/etfDiv" + q)
        print("  筆數", len(k.get("data", [])), "0056 列", [[str(v)[:30] for v in x[:6]] for x in k.get("data", []) if x[0] == "0056"][:12])
    except Exception as e:                           # noqa: BLE001
        print("  失敗", e)

j = get("https://www.twse.com.tw/rwd/zh/ETF/list?response=json")
print("fields", j.get("fields"), "筆數", len(j.get("data", [])))
