#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股完整清單（搜尋用）：證交所＋櫃買當日所有掛牌證券（權證除外）的報價。

包含：普通股、ETF（含槓桿／反向／債券）、ETN、存託憑證（TDR）、特別股、受益證券（REITs）。
排除：權證（數萬檔、壽命短，搜尋時只會造成干擾）。

資料直接取自當天的官方每日收盤行情（fetch_market.py 已落地的快取，不重抓）。

輸出：web/data/tw_all.json
  {"date": ..., "fields": [...], "rows": [[代號, 名稱, 類型, 市場, 收盤, 漲跌%, 成交張數]]}
  類型：s 股票、e ETF、n ETN、d 存託憑證、p 特別股、b 受益證券

用法：python scripts/build_directory.py
"""

import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web", "data")
sys.path.insert(0, HERE)

import fetch_market as fm  # noqa: E402

KINDS = [(re.compile(r"^[1-9]\d{3}$"), "s"), (re.compile(r"^00\d{2,4}[A-Z]?$"), "e"),
         (re.compile(r"^020\d{3}[A-Z]?$"), "n"), (re.compile(r"^91\d{4}$"), "d"),
         (re.compile(r"^[1-9]\d{3}[A-Z]$"), "p"), (re.compile(r"^01\d{3}[A-Z]$"), "b")]


def kind(code):
    return next((k for rx, k in KINDS if rx.match(code)), None)


def clean(x):
    return re.sub(r"<[^>]+>", "", str(x)).strip()


def pct(close, chg):
    if close is None or chg is None or close - chg <= 0:
        return None
    return round(chg / (close - chg) * 100, 2)


def main():
    d = date.fromisoformat(json.load(open(os.path.join(WEB, "latest.json"), encoding="utf-8"))["date"])
    rows = {}
    ymd = d.strftime("%Y%m%d")
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={ymd}&type=ALLBUT0999&response=json",
                    f"twse_q_{ymd}")
    for t in (j or {}).get("tables", []):
        f = [clean(x) for x in (t.get("fields") or [])]
        if "證券代號" not in f or "收盤價" not in f:
            continue
        ci = {n: i for i, n in enumerate(f)}
        si = next((i for i, n in enumerate(f) if n.startswith("漲跌(")), None)
        for r in t.get("data", []):
            code = clean(r[ci["證券代號"]])
            k = kind(code)
            if not k:
                continue
            close, chg = fm.num(r[ci["收盤價"]]), fm.num(r[ci.get("漲跌價差", 0)])
            sign = clean(r[si]) if si is not None else ""
            if "X" in sign.upper():
                chg = None
            elif chg is not None and "-" in sign:
                chg = -abs(chg)
            vol = fm.num(r[ci["成交股數"]])
            rows[code] = [code, clean(r[ci["證券名稱"]]), k, "上市", close, pct(close, chg),
                          round(vol / 1000) if vol else 0]
    j = fm.get_json(f"https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?date={fm.roc(d)}&type=EW&response=json",
                    f"tpex_q_{ymd}")
    if str((j or {}).get("date") or ymd) == ymd:
        for t in (j or {}).get("tables", []):
            f = [clean(x) for x in (t.get("fields") or [])]
            ci = {n: i for i, n in enumerate(f)}
            if "代號" not in ci or "收盤" not in ci:
                continue
            for r in t.get("data", []):
                code = clean(r[ci["代號"]])
                k = kind(code)
                if not k or code in rows:
                    continue
                close = fm.num(r[ci["收盤"]])
                chg = fm.num(r[ci["漲跌"]]) if "漲跌" in ci else None
                vol = fm.num(r[ci["成交股數"]])
                rows[code] = [code, clean(r[ci["名稱"]]), k, "上櫃", close, pct(close, chg),
                              round(vol / 1000) if vol else 0]
    if len(rows) < 1500:
        sys.exit(f"台股清單只有 {len(rows)} 筆，保留舊檔")
    out = sorted(rows.values(), key=lambda r: r[0])
    with open(os.path.join(WEB, "tw_all.json"), "w", encoding="utf-8") as f:
        json.dump({"date": d.isoformat(), "fields": ["代號", "名稱", "類型", "市場", "收盤", "漲跌%", "成交張數"],
                   "rows": out}, f, ensure_ascii=False, separators=(",", ":"))
    cnt = {}
    for r in out:
        cnt[r[2]] = cnt.get(r[2], 0) + 1
    print(f"台股清單 {d}：{len(out)} 檔 {cnt}")


if __name__ == "__main__":
    main()
