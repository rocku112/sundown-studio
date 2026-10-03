#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股 ETF 折溢價與申購贖回資金流。

來源：證交所基本市況報導網 https://mis.twse.com.tw/stock/data/all_etf.txt
  各投信每 15 秒更新一次預估淨值；收盤後（約 17:00）最後一筆即當日收盤的
  市價、預估淨值與折溢價。欄位（2026-10 CI 實測）：
    a 代號  b 名稱  c 已發行單位數  d 單位數較前日增減
    e 市價  f 預估淨值  g 折溢價(%)  h 前一營業日淨值  i 日期  j 時間

「單位數增減 × 淨值」就是當天透過申購贖回流入／流出這檔 ETF 的資金——
這是 ETF 版的資金流，比成交量更能看出長期資金的去向。

輸出：
  data/etf/days/YYYY-MM-DD.json  逐日快照（append-only，進版控，一天約 15 KB）
  web/data/etf.json              前端用：當日總覽＋近 20 日折溢價與資金流

用法：python scripts/fetch_etf.py           # 抓當日快照並重建前端資料
      python scripts/fetch_etf.py --build   # 只用既有逐日檔重建（離線）
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DAYS = os.path.join(ROOT, "data", "etf", "days")
OUT = os.path.join(ROOT, "web", "data", "etf.json")
URL = "https://mis.twse.com.tw/stock/data/all_etf.txt"
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
HIST = 20
PAR = 0.1          # |折溢價| 不到 0.1% 算「接近平價」


def num(v):
    try:
        x = float(str(v).replace(",", ""))
        return x if x == x else None
    except (TypeError, ValueError):
        return None


def category(code, name):
    """依代號尾碼與名稱分類。尾碼是證交所的命名規則：L 槓桿、R 反向、U 期貨、B 債券、A 主動。"""
    if code.endswith("L"):
        return "槓桿"
    if code.endswith("R"):
        return "反向"
    if code.endswith("U"):
        return "期貨"
    if code.endswith("B") or "債" in name:
        return "債券"
    if code.endswith("A") or name.startswith("主動"):
        return "主動式"
    if re.search(r"高股息|高息|股利|收益", name):
        return "高股息"
    if re.search(r"美國|美股|標普|那斯達克|費城|日本|中國|越南|印度|全球|歐洲|MSCI|NYSE|韓國", name):
        return "海外"
    return "股票型"


def fetch():
    r = requests.get(URL, headers=UA, timeout=30)
    r.raise_for_status()
    j = r.json()
    rows, day = [], None
    for g in j.get("a1", []):
        for m in g.get("msgArray", []) or []:
            code, name = m.get("a", "").strip(), m.get("b", "").strip()
            price, nav, prem = num(m.get("e")), num(m.get("f")), num(m.get("g"))
            if not code or price is None or nav is None or nav <= 0:
                continue
            # 來源的折溢價欄有時空白；自己用市價與淨值算，全部同一把尺
            prem_calc = (price / nav - 1) * 100
            if prem is not None and abs(prem - prem_calc) > 0.5:
                prem = prem_calc       # 來源數字與自算差太多時以自算為準
            rows.append([code, name, num(m.get("c")), num(m.get("d")), price, nav,
                         round(prem if prem is not None else prem_calc, 3), m.get("i"), m.get("j")])
            day = day or m.get("i")
    if not rows:
        raise RuntimeError("all_etf.txt 沒有可用資料")
    # 快照日期取多數決：少數投信的估值會停在前一天（例如海外 ETF 當地休市）
    dates = {}
    for r_ in rows:
        dates[r_[7]] = dates.get(r_[7], 0) + 1
    day = max(dates, key=dates.get)
    return f"{day[:4]}-{day[4:6]}-{day[6:]}", rows


def save_day(day, rows):
    os.makedirs(DAYS, exist_ok=True)
    cols = ["code", "name", "units", "units_chg", "price", "nav", "prem", "date", "time"]
    with open(os.path.join(DAYS, f"{day}.json"), "w", encoding="utf-8") as f:
        json.dump({"date": day, "cols": cols, "rows": rows}, f, ensure_ascii=False, separators=(",", ":"))


def build():
    files = sorted(x for x in os.listdir(DAYS) if x.endswith(".json"))[-HIST:]
    days = []
    for fn in files:
        d = json.load(open(os.path.join(DAYS, fn), encoding="utf-8"))
        idx = {c: i for i, c in enumerate(d["cols"])}
        days.append((d["date"], {r[idx["code"]]: {c: r[i] for c, i in idx.items()} for r in d["rows"]}))
    if not days:
        sys.exit("沒有任何 ETF 逐日檔")
    date, today = days[-1]
    etfs = []
    for code, x in today.items():
        # 只納入當天有估值的（日期等於快照日），停在前一天的不比較，免得折溢價失真
        if x.get("date") and x["date"].replace("-", "") != date.replace("-", ""):
            continue
        hist = [[d, h[code]["prem"]] for d, h in days if code in h]
        flow = (x["units_chg"] or 0) * x["nav"] / 1e8          # 億元
        f5 = sum(((h[code]["units_chg"] or 0) * h[code]["nav"] / 1e8) for _, h in days[-5:] if code in h)
        etfs.append({"code": code, "name": x["name"], "cat": category(code, x["name"]),
                     "price": x["price"], "nav": x["nav"], "prem": x["prem"],
                     "units": x["units"], "flow": round(flow, 2), "flow5": round(f5, 2),
                     "aum": round((x["units"] or 0) * x["nav"] / 1e8, 1),
                     "hist": hist})
    stock = [e for e in etfs if e["cat"] not in ("債券", "期貨")]
    n_up = sum(1 for e in stock if e["prem"] > PAR)
    n_dn = sum(1 for e in stock if e["prem"] < -PAR)
    avg = sum(e["prem"] for e in stock) / max(1, len(stock))
    doc = {
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "date": date, "days": [d for d, _ in days],
        "summary": {"n": len(stock), "premium": n_up, "discount": n_dn, "par": len(stock) - n_up - n_dn,
                    "avg_prem": round(avg, 3),
                    "max": max(stock, key=lambda e: e["prem"])["code"] if stock else None,
                    "min": min(stock, key=lambda e: e["prem"])["code"] if stock else None,
                    "flow": round(sum(e["flow"] for e in etfs), 1)},
        "etfs": sorted(etfs, key=lambda e: -e["aum"]),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    s = doc["summary"]
    print(f"ETF {date}：{len(etfs)} 檔（股票類 {s['n']}）溢價 {s['premium']}／折價 {s['discount']}／平價 {s['par']}，"
          f"平均 {s['avg_prem']:+.2f}%，申購贖回淨流入 {s['flow']:+.1f} 億")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true", help="不抓資料，只重建 etf.json")
    args = ap.parse_args()
    if not args.build:
        day, rows = fetch()
        save_day(day, rows)
        print(f"快照 {day}：{len(rows)} 檔")
    build()


if __name__ == "__main__":
    main()
