#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
上市櫃公司月營收（公開資訊觀測站彙總表），供「營收公布後股價是否續漂」檢驗。

來源：MOPS 每月營收彙總頁 t21sc03_{民國年}_{月}_{0 國內|1 國外}.html，上市 sii、上櫃 otc 各一頁。
一個月份 4 頁，五年約 300 頁。已抓過的月份存在 swing/data/revenue.json（進版控），
之後每天只補新月份；最近兩個月每次重抓（公司可能補報、更正）。

時點：法規要求次月 10 日前公布，回測一律假設「次月 10 日之後的第一個交易日」才知道，
不使用提早公布的優勢，避免偷看未來。

用法：python swing/scripts/fetch_revenue.py [--since 2015-01]
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date

import requests
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "revenue.json")
HOSTS = ["https://mopsov.twse.com.tw", "https://mops.twse.com.tw"]
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
DELAY = 0.6
NUM = re.compile(r"^-?[\d,]+(\.\d+)?$")


def num(s):
    s = s.strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse(html):
    """回傳 {code: [當月營收(千元), 去年同月(千元)]}。"""
    soup = BeautifulSoup(html, "lxml")
    out = {}
    for tr in soup.find_all("tr"):
        td = [x.get_text(strip=True) for x in tr.find_all("td")]
        if len(td) < 7 or not re.fullmatch(r"\d{4,6}", td[0]):
            continue
        cur, last_y = num(td[2]), num(td[4])
        if cur is not None:
            out[td[0]] = [cur, last_y]
    return out


def fetch_page(mkt, roc, m, kind):
    """兩個主機輪流試，最多 3 輪（間隔遞增）；偶發 404／限流常在重試後恢復。"""
    err = None
    for rnd in range(3):
        if rnd:
            time.sleep(3 * rnd)
        try:
            return _fetch_once(mkt, roc, m, kind)
        except RuntimeError as e:
            err = e
    raise err


def _fetch_once(mkt, roc, m, kind):
    err = None
    for h in HOSTS:
        url = f"{h}/nas/t21/{mkt}/t21sc03_{roc}_{m}_{kind}.html"
        try:
            r = requests.get(url, headers=UA, timeout=30)
            if r.status_code != 200:
                err = f"HTTP {r.status_code} {url}"
                continue
            html = r.content.decode("cp950", errors="ignore")
            return parse(html), url
        except Exception as e:      # 換下一個主機
            err = f"{e!r} {url}"
    raise RuntimeError(err)


def months(since):
    y, m = map(int, since.split("-"))
    t = date.today()
    # 本月營收要下個月才有；最新可得為上個月
    ey, em = (t.year, t.month - 1) if t.month > 1 else (t.year - 1, 12)
    while (y, m) <= (ey, em):
        yield y, m
        y, m = (y, m + 1) if m < 12 else (y + 1, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="2015-01")   # 配合十年官方日線；已有的月份不重抓
    args = ap.parse_args()
    data, partial = {}, set()
    if os.path.exists(OUT):
        j = json.load(open(OUT, encoding="utf-8"))
        data, partial = j.get("months", {}), set(j.get("partial", []))
    todo = list(months(args.since))
    recent = {f"{y}-{m:02d}" for y, m in todo[-2:]}
    fetched, failed = 0, []
    for y, m in todo:
        key = f"{y}-{m:02d}"
        if key in data and key not in recent and key not in partial:
            continue
        rows, ok = {}, 0
        for mkt in ("sii", "otc"):
            for kind in (0, 1):
                try:
                    p, url = fetch_page(mkt, y - 1911, m, kind)
                    rows.update(p)
                    ok += 1
                    if fetched == 0:
                        print(f"  樣本頁 {url} → {len(p)} 家")
                except Exception as e:
                    failed.append(f"{key} {mkt}{kind}: {str(e)[:120]}")
                fetched += 1
                time.sleep(DELAY)
        # 剛過 10 日前公司仍陸續申報；太少（< 500 家）代表還沒到齊，先不存，下次再抓。
        # 有頁面抓不到時仍先存（標記為不完整），之後每次執行都會再試著補齊
        if len(rows) >= 500 or (key in data and rows):
            data[key] = {**data.get(key, {}), **rows}      # 補抓到的頁面併入，不覆蓋已有的
        if key in data:
            (partial.discard if ok == 4 else partial.add)(key)
        print(f"{key}: {len(rows)} 家（{ok}/4 頁）")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"unit": "千元", "fields": ["當月營收", "去年同月營收"],
                   "partial": sorted(partial & set(data)), "months": dict(sorted(data.items()))}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"完成：{len(data)} 個月份（不完整 {sorted(partial & set(data))}），本次抓 {fetched} 頁，失敗 {len(failed)}")
    for x in failed[:10]:
        print("  ", x)
    if not data:
        sys.exit("沒有任何月營收資料")


if __name__ == "__main__":
    main()
