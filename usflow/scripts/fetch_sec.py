#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
美股基本面：SEC EDGAR XBRL companyfacts（官方、免費）。

只處理 universe 裡 type=stock 的美國公司。ADR（TSM、ASX⋯）申報 20-F、
用 IFRS 科目，而且台股端已經有原始資料，這裡不處理。

萃取的科目（依序取第一個有資料的）：
  營收    Revenues / RevenueFromContractWithCustomerExcludingAssessedTax /
          SalesRevenueNet / RevenuesNetOfInterestExpense（銀行）
  毛利    GrossProfit（銀行、保險沒有，正常）
  淨利    NetIncomeLoss
  EPS     EarningsPerShareDiluted
  每股股利 CommonStockDividendsPerShareDeclared / ...CashPaid

季度怎麼來：10-Q 給 Q1–Q3 的三個月數字，Q4 沒有單獨申報，
要用 10-K 全年減去前三季。全年與三季必須屬於同一個會計年度，
否則（例如前一年有一季缺漏）寧可不算 Q4，也不要算出錯的數字。

輸出：data/fundamentals.json（進版控，約 100 KB）

SEC 規定 User-Agent 要帶可聯絡的資訊，否則會回 403。
在 GitHub 的 repo Variables 設 SEC_USER_AGENT（例如 "SunDown Studio you@example.com"）。

用法：
  python scripts/fetch_sec.py
  python scripts/fetch_sec.py --only AAPL,JPM
"""

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UNIVERSE = os.path.join(ROOT, "data", "universe.json")
OUT = os.path.join(ROOT, "data", "fundamentals.json")

UA = os.environ.get("SEC_USER_AGENT") or \
    "SunDown Studio usflow research (github.com/rocku112/sundown-studio)"
DELAY = 0.15        # SEC 上限 10 req/s，留一半餘裕
KEEP_Q = 8

TAGS = {
    "rev": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
            "SalesRevenueNet", "RevenuesNetOfInterestExpense"],
    "gp": ["GrossProfit"],
    "ni": ["NetIncomeLoss"],
    "eps": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
    "dps": ["CommonStockDividendsPerShareDeclared",
            "CommonStockDividendsPerShareCashPaid"],
}

_s = requests.Session()
_s.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip, deflate"})


def get(url):
    for i in range(3):
        r = _s.get(url, timeout=30)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 404:
            return None
        time.sleep(2 ** i)
    raise RuntimeError(f"{url} → HTTP {r.status_code}")


def days(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def series(facts, tags):
    """回傳 (tag, [{start,end,val,fy,form,filed}])：取第一個有資料的科目。"""
    g = facts.get("facts", {}).get("us-gaap", {})
    for t in tags:
        units = g.get(t, {}).get("units", {})
        for u in ("USD", "USD/shares"):
            rows = units.get(u)
            if rows:
                return t, [r for r in rows if r.get("start") and r.get("form") in
                           ("10-Q", "10-K", "10-Q/A", "10-K/A")]
    return None, []


def quarters(rows):
    """{end: (start, val)}：單季數字。同一期間有多次申報（更正、比較期）時取最晚申報的。"""
    q, a = {}, {}
    for r in sorted(rows, key=lambda r: r.get("filed", "")):
        n = days(r["start"], r["end"])
        if 80 <= n <= 100:
            q[r["end"]] = (r["start"], r["val"])
        elif 350 <= n <= 380:
            a[r["end"]] = (r["start"], r["val"])
    # Q4 ＝ 全年 − 同一年度內的三季
    for end, (start, total) in a.items():
        if end in q:
            continue
        inside = [(e, v) for e, (s, v) in q.items()
                  if s >= start and e < end and days(start, s) <= 300]
        if len(inside) == 3:
            last = max(e for e, _ in inside)
            q[end] = (last, total - sum(v for _, v in inside))
    return q, a


def extract(facts):
    out, annual, used = {}, {}, {}
    for k, tags in TAGS.items():
        t, rows = series(facts, tags)
        if t:
            used[k] = t
            out[k], annual[k] = quarters(rows)
    ends = sorted(set(out.get("rev", {})) | set(out.get("eps", {})))[-KEEP_Q:]
    qs = []
    for e in ends:
        row = {"end": e}
        for k in TAGS:
            v = out.get(k, {}).get(e)
            if v is not None:
                row[k] = round(v[1], 4) if k in ("eps", "dps") else v[1]
        qs.append(row)
    last4 = qs[-4:]
    res = {"quarters": qs, "tags": used}
    # TTM 只在四季都有時才算——少一季算出來的「本益比」會差到兩倍
    if len(last4) == 4 and all("eps" in q for q in last4) and \
            days(last4[0]["end"], last4[-1]["end"]) <= 300:
        res["eps_ttm"] = round(sum(q["eps"] for q in last4), 4)
    # 股利：四季都有才加總；很多公司只在 10-K 揭露全年每股股利，
    # 那就退回用最近一個（結束在末季前後 100 天內的）會計年度數字。
    # 少一季硬加會讓殖利率低估 25%，比不顯示更糟。
    if len(last4) == 4 and all("dps" in q for q in last4):
        res["dps_ttm"] = round(sum(q["dps"] for q in last4), 4)
    elif annual.get("dps") and last4:
        fy_end = max(annual["dps"])
        if abs(days(fy_end, last4[-1]["end"])) <= 100:
            res["dps_ttm"] = round(annual["dps"][fy_end][1], 4)
    if last4 and all("rev" in q and "gp" in q and q["rev"] for q in last4):
        res["gm_ttm"] = round(sum(q["gp"] for q in last4) /
                              sum(q["rev"] for q in last4) * 100, 2)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    args = ap.parse_args()

    uni = [u for u in json.load(open(UNIVERSE, encoding="utf-8"))["symbols"]
           if u["type"] == "stock"]
    if args.only:
        want = set(args.only.split(","))
        uni = [u for u in uni if u["sym"] in want]

    try:
        tickers = get("https://www.sec.gov/files/company_tickers.json")
    except RuntimeError as e:
        # 2026-10 實測：不帶 email 的 User-Agent 會被 SEC 回 403
        sys.exit(f"{e}\nSEC 拒絕請求——請在 repo Variables 設定 SEC_USER_AGENT"
                 f"（格式：「名稱 email」），目前用的是：{UA!r}")
    cik = {v["ticker"].upper(): v["cik_str"] for v in tickers.values()}

    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except FileNotFoundError:
        old = {"stocks": {}}
    stocks, failed = dict(old.get("stocks", {})), {}

    for i, u in enumerate(uni):
        sym = u["sym"]
        c = cik.get(sym) or cik.get(sym.replace("-", "."))
        if not c:
            failed[sym] = "SEC 代號表查無"
            continue
        try:
            facts = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json")
            if not facts:
                failed[sym] = "companyfacts 404"
                continue
            stocks[sym] = {"cik": c, **extract(facts)}
            q = stocks[sym]["quarters"]
            print(f"[{i+1:3d}/{len(uni)}] {sym:6s} {len(q)} 季  "
                  f"EPS(TTM) {stocks[sym].get('eps_ttm')}  末季 {q[-1]['end'] if q else '—'}")
        except Exception as e:      # 單檔失敗不影響其他檔，舊資料保留
            failed[sym] = repr(e)[:200]
            print(f"[{i+1:3d}/{len(uni)}] {sym:6s} 失敗：{e!r}", file=sys.stderr)
        time.sleep(DELAY)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write('{"fetched_at":' + json.dumps(
            datetime.now(timezone.utc).isoformat(timespec="seconds")) +
            ',\n"failed":' + json.dumps(failed, ensure_ascii=False) +
            ',\n"stocks":{\n' + ",\n".join(
                f"{json.dumps(k)}:{json.dumps(v, separators=(',', ':'))}"
                for k, v in sorted(stocks.items())) + "\n}}\n")
    print(f"\n完成 {len(uni) - len(failed)}／失敗 {len(failed)}：{failed}")
    if uni and len(failed) == len(uni):
        sys.exit("SEC 全部失敗（多半是 User-Agent 被擋，檢查 SEC_USER_AGENT）")


if __name__ == "__main__":
    main()
