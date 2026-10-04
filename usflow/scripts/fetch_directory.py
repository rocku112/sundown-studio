#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
美股完整清單（搜尋用）：全部掛牌股票＋全部 ETF 的當日報價與基本資料，一天兩個請求。

來源：Nasdaq 官網選股器的下載端點（涵蓋 NASDAQ／NYSE／NYSE American 全部掛牌股票與 ETF）
  股票  https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
  ETF   https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true
備援（只有代號與名稱，沒有報價）：Nasdaq Trader 代號目錄 nasdaqlisted.txt／otherlisted.txt

輸出：twflow/web/data/us/all.json
  {"date": ..., "fields": [...], "rows": [[代號, 名稱, 類型 s/e, 價格, 漲跌%, 市值(億美元), 產業, 成交量]]}

失敗時保留舊檔（清單寧可舊一天，不要變空）。

用法：python usflow/scripts/fetch_directory.py
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
OUT = os.path.join(REPO, "twflow", "web", "data", "us", "all.json")
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
     "Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"}
SECTOR = {"Technology": "科技", "Telecommunications": "通訊服務", "Consumer Discretionary": "非必需消費",
          "Consumer Staples": "必需消費", "Health Care": "醫療保健", "Finance": "金融", "Industrials": "工業",
          "Energy": "能源", "Basic Materials": "原物料", "Utilities": "公用事業", "Real Estate": "房地產",
          "Miscellaneous": "其他"}


def num(s):
    if s is None:
        return None
    s = re.sub(r"[$,%\s]", "", str(s))
    try:
        return float(s)
    except ValueError:
        return None


def yahoo_sym(s):
    return s.strip().replace("/", "-").replace("^", "-P").replace(".", "-")


def get(url):
    r = requests.get(url, headers=H, timeout=60)
    r.raise_for_status()
    return r.json()


def stocks():
    j = get("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true")
    rows = ((j.get("data") or {}).get("rows")) or []
    out = []
    for r in rows:
        sym = (r.get("symbol") or "").strip()
        if not sym or " " in sym:
            continue
        mcap = num(r.get("marketCap"))
        out.append([yahoo_sym(sym), (r.get("name") or "").strip(), "s", num(r.get("lastsale")), num(r.get("pctchange")),
                    round(mcap / 1e8, 2) if mcap else None, SECTOR.get((r.get("sector") or "").strip()),
                    int(num(r.get("volume")) or 0)])
    return out


def etfs():
    j = get("https://api.nasdaq.com/api/screener/etf?tableonly=true&limit=10000&offset=0&download=true")
    d = j.get("data") or {}
    rows = (d.get("data") or {}).get("rows") or d.get("rows") or []
    out = []
    for r in rows:
        sym = (r.get("symbol") or "").strip()
        if not sym:
            continue
        out.append([yahoo_sym(sym), (r.get("companyName") or r.get("name") or "").strip(), "e",
                    num(r.get("lastSalePrice") or r.get("lastsale")), num(r.get("percentageChange") or r.get("pctchange")),
                    None, None, 0])
    return out


def trader_dir():
    """備援：只有代號與名稱。"""
    out = []
    for url, sc, nc, ec in (("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", 0, 1, 6),
                            ("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt", 0, 1, 4)):
        r = requests.get(url, headers={"User-Agent": H["User-Agent"]}, timeout=60)
        r.raise_for_status()
        for line in r.text.splitlines()[1:]:
            p = line.split("|")
            if len(p) <= ec or p[0].startswith("File Creation"):
                continue
            if "Test" in p[nc] or (len(p) > 3 and p[3] == "Y" and url.endswith("nasdaqlisted.txt")):
                continue
            out.append([yahoo_sym(p[sc]), p[nc].strip(), "e" if p[ec] == "Y" else "s", None, None, None, None, 0])
    return out


def main():
    rows, src = [], []
    for name, fn in (("stocks", stocks), ("etfs", etfs)):
        try:
            got = fn()
            rows += got
            src.append(f"{name} {len(got)}")
        except Exception as e:
            print(f"{name} 失敗：{e!r}", file=sys.stderr)
    if len(rows) < 3000:
        try:
            got = trader_dir()
            have = {r[0] for r in rows}
            rows += [r for r in got if r[0] not in have]
            src.append(f"備援目錄 {len(got)}")
        except Exception as e:
            print(f"備援目錄失敗：{e!r}", file=sys.stderr)
    if len(rows) < 3000:
        sys.exit(f"美股清單只有 {len(rows)} 筆，保留舊檔")
    seen, uniq = set(), []
    for r in rows:
        if r[0] not in seen:
            seen.add(r[0])
            uniq.append(r)
    uniq.sort(key=lambda r: -(r[5] or 0))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"date": (datetime.now(timezone.utc) - timedelta(hours=5)).date().isoformat(),
                   "fields": ["代號", "名稱", "類型", "價格", "漲跌%", "市值(億美元)", "產業", "成交量"],
                   "rows": uniq}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"美股清單 {len(uniq)} 檔（{'、'.join(src)}）→ {OUT}，{os.path.getsize(OUT)/1e6:.2f} MB")


if __name__ == "__main__":
    main()
