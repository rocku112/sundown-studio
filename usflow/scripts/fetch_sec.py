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
            "RevenueFromContractWithCustomerIncludingAssessedTax",
            "SalesRevenueNet", "RevenuesNetOfInterestExpense"],
    "gp": ["GrossProfit"],
    "ni": ["NetIncomeLoss"],
    # 只用來在沒有 GrossProfit 時推算毛利（營收 − 營業成本），不輸出
    "cost": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
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
    """回傳 [(tag, rows)]：所有候選科目中有資料的，依優先順序。

    ⚠️ 不能只取「第一個有資料的科目」：很多公司換過科目名稱（例如 2018 年 ASC 606
       之後營收從 Revenues 改報 RevenueFromContractWithCustomer...），舊科目仍留著
       多年前的資料。只取第一個，就會拿到停在幾年前的序列，近幾季營收全空——
       2026-10 實測蘋果、微軟的毛利率就是這樣消失的。"""
    g = facts.get("facts", {}).get("us-gaap", {})
    out = []
    for t in tags:
        units = g.get(t, {}).get("units", {})
        for u in ("USD", "USD/shares"):
            rows = [r for r in units.get(u) or [] if r.get("start") and r.get("form") in
                    ("10-Q", "10-K", "10-Q/A", "10-K/A")]
            if rows:
                out.append((t, rows))
                break
    return out


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


def ttm_ytd(rows):
    """近四季合計的標準算法：今年累計 ＋ 去年全年 − 去年同期累計。

    季度相加算不出來時才用（某季沒單獨申報，例如沃爾瑪一次在 Q1 宣告全年股利，
    後幾季只有累計數字）。回傳 (截止日, 數值)；湊不齊三段就回 None，不硬估。"""
    if not rows:
        return None
    latest = max(r["end"] for r in rows)
    cur = [r for r in rows if r["end"] == latest]
    fy = [r for r in cur if 350 <= days(r["start"], r["end"]) <= 380]
    if fy:                                  # 最新一期就是全年報
        return latest, max(fy, key=lambda r: r.get("filed", ""))["val"]
    ytd = max(cur, key=lambda r: (days(r["start"], r["end"]), r.get("filed", "")))
    n = days(ytd["start"], ytd["end"])
    # 去年全年：截止在今年累計起點的前一週內
    prev = [r for r in rows if 350 <= days(r["start"], r["end"]) <= 380
            and 0 < days(r["end"], ytd["start"]) <= 7]
    if not prev:
        return None
    fy = max(prev, key=lambda r: r.get("filed", ""))
    # 去年同期累計：同樣從去年年度起點開始、長度相差不到 10 天
    same = [r for r in rows if abs(days(fy["start"], r["start"])) <= 7
            and abs(days(r["start"], r["end"]) - n) <= 10 and r["end"] < ytd["start"]]
    if not same:
        return None
    py = max(same, key=lambda r: r.get("filed", ""))
    return latest, ytd["val"] + fy["val"] - py["val"]


def extract(facts):
    out, annual, used, raw = {}, {}, {}, {}
    for k, tags in TAGS.items():
        raw[k] = series(facts, tags)
        # 逐科目各自算季度（Q4 推算要在同一科目內做），再依優先順序合併：
        # 同一季兩個科目都有時用優先的，只有其中一個有就用那個
        q, a, u = {}, {}, []
        for t, rows in raw[k]:
            tq, ta = quarters(rows)
            new = [e for e in tq if e not in q]
            if new:
                u.append(t)
            for e in new:
                q[e] = tq[e]
            for e, v in ta.items():
                a.setdefault(e, v)
        if q or a:
            out[k], annual[k], used[k] = q, a, u
    # 不申報 GrossProfit、但有營業成本的公司：毛利＝營收−成本（同一季兩者都有才算）
    gp, rev, cost = out.setdefault("gp", {}), out.get("rev", {}), out.pop("cost", {})
    derived = [e for e in rev if e in cost and e not in gp]
    for e in derived:
        gp[e] = (rev[e][0], rev[e][1] - cost[e][1])
    if derived:
        used["gp"] = used.get("gp", []) + ["營收−成本"]
    used.pop("cost", None)
    ends = sorted(set(out.get("rev", {})) | set(out.get("eps", {})))[-KEEP_Q:]
    qs = []
    for e in ends:
        row = {"end": e}
        for k in ("rev", "gp", "ni", "eps", "dps"):
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
    else:
        v = ttm_fallback(raw["eps"], last4)
        if v is not None:
            res["eps_ttm"] = v
    # 股利：四季都有才加總；很多公司只在 10-K 揭露全年每股股利，
    # 那就退回用最近一個（結束在末季前後 100 天內的）會計年度數字。
    # 少一季硬加會讓殖利率低估 25%，比不顯示更糟。
    if len(last4) == 4 and all("dps" in q for q in last4):
        res["dps_ttm"] = round(sum(q["dps"] for q in last4), 4)
    elif (v := ttm_fallback(raw["dps"], last4)) is not None:
        res["dps_ttm"] = v
    elif annual.get("dps") and last4:
        fy_end = max(annual["dps"])
        if abs(days(fy_end, last4[-1]["end"])) <= 100:
            res["dps_ttm"] = round(annual["dps"][fy_end][1], 4)
    if last4 and all("rev" in q and "gp" in q and q["rev"] for q in last4):
        res["gm_ttm"] = round(sum(q["gp"] for q in last4) /
                              sum(q["rev"] for q in last4) * 100, 2)
    return res


def ttm_fallback(tag_rows, last4):
    """依科目優先順序試 ttm_ytd；截止日必須就是最新一季，避免拿到停更科目的舊數字。"""
    if not last4:
        return None
    for _, rows in tag_rows:
        r = ttm_ytd(rows)
        if r and abs(days(r[0], last4[-1]["end"])) <= 7:
            return round(r[1], 4)
    return None


def cik_map():
    """股票代號 → SEC CIK。"""
    try:
        tickers = get("https://www.sec.gov/files/company_tickers.json")
    except RuntimeError as e:
        # 2026-10 實測：不帶 email 的 User-Agent 會被 SEC 回 403
        sys.exit(f"{e}\nSEC 拒絕請求——請在 repo Variables 設定 SEC_USER_AGENT"
                 f"（格式：「名稱 email」），目前用的是：{UA!r}")
    return {v["ticker"].upper(): v["cik_str"] for v in tickers.values()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    args = ap.parse_args()

    uni = [u for u in json.load(open(UNIVERSE, encoding="utf-8"))["symbols"]
           if u["type"] == "stock" and not u.get("auto")]
    if args.only:
        want = set(args.only.split(","))
        uni = [u for u in uni if u["sym"] in want]

    cik = cik_map()

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
