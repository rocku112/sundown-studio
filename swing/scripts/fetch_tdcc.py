#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
集保戶股權分散表（每週五公布）：千張大戶持股比例、散戶（50 張以下）比例、股東人數。

來源：集保結算所開放資料 https://opendata.tdcc.com.tw/getOD.ashx?id=1-5
     只提供「最新一週」，沒有歷史——所以從現在起每週存一份，累積滿一年後才能做時點正確的檢驗。
     （集保網站的個股查詢可回溯約一年，但一檔一週一個請求，450 檔 × 52 週不可行。）

輸出：swing/data/tdcc/YYYY-MM-DD.json（資料日期）
     {code: [千張以上 %, 400 張以上 %, 50 張以下 %, 總股東人數]}

用法：python swing/scripts/fetch_tdcc.py
"""

import csv
import io
import json
import os
import re
import sys

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "tdcc")
URL = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5"
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
STOCK_RE = re.compile(r"^[1-9]\d{3}$")


def main():
    r = requests.get(URL, headers=UA, timeout=60)
    r.raise_for_status()
    text = r.content.decode("utf-8-sig", errors="ignore")
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 1000:
        sys.exit(f"集保資料列數過少：{len(rows)}")
    # 欄位：資料日期, 證券代號, 持股分級, 人數, 股數, 占集保庫存數比例%
    agg, day = {}, None
    for r_ in rows[1:]:
        if len(r_) < 6:
            continue
        d, code, lvl = r_[0].strip(), r_[1].strip(), r_[2].strip()
        if not STOCK_RE.match(code) or not lvl.isdigit():
            continue
        day = day or d
        lvl = int(lvl)
        try:
            people, pct = int(r_[3].replace(",", "")), float(r_[5])
        except ValueError:
            continue
        a = agg.setdefault(code, [0.0, 0.0, 0.0, 0])
        # 分級：1–15 由小到大；12 = 400,001–600,000 股、15 = 1,000,001 股以上；1–8 = 50,000 股（50 張）以下；17 = 合計
        if lvl == 15:
            a[0] += pct
        if 12 <= lvl <= 15:
            a[1] += pct
        if 1 <= lvl <= 8:
            a[2] += pct
        if lvl == 17:
            a[3] = people
    if not day or len(agg) < 1000:
        sys.exit(f"集保資料解析失敗：日期 {day}，{len(agg)} 檔")
    iso = f"{day[:4]}-{day[4:6]}-{day[6:8]}" if re.fullmatch(r"\d{8}", day) else day
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{iso}.json")
    out = {c: [round(a[0], 2), round(a[1], 2), round(a[2], 2), a[3]] for c, a in sorted(agg.items())}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"集保 {iso}：{len(out)} 檔；例 2330 → {out.get('2330')}（千張以上%、400 張以上%、50 張以下%、股東人數）")


if __name__ == "__main__":
    main()
