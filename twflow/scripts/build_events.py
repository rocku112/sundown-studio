#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
籌碼異動事件流。前端用自選股過濾成個人化通知欄；未來接推播時，
後端也是讀同一份檔案比對監控清單。

輸出 web/data/events.json：
  {dates:[...], events:[{date, code, name, kind, text, net_1d_yi, chg_1d, power}]}

事件類型與門檻：
  異常大買/大賣   當日法人淨額 > 這檔自己近20日日均絕對進出的 2.5 倍
  法人連買 N 天   N ≥ 7
  法人連賣 N 天   N ≥ 5
  外資連買 N 天   N ≥ 7

門檻怎麼定的：目標是每類約覆蓋 3% 的個股，這樣追蹤 20 檔的人一天大約
收到 1~3 則。太鬆就沒有篩選的意義——第一版用「連賣 ≥3 天」跑出 234 檔
（12% 的市場），那是常態不是事件。

⚠️ 一開始沿用了 Tide 的「連買5／連賣3」，以為法人賣超天數的分布比買超密集。
   實際資料相反：連買 ≥2 天有 28.3% 的個股，連賣只有 20.4%。所以是連買門檻
   要更嚴。這個不對稱是實測出來的，不是抄來的。

⚠️ 這些門檻是在 60 天窗期上校準的，且該期間含一個 +7.98% 的大漲日，
   買超連續天數可能偏多。歷史累積到一年後應重新校準——執行時會印出各類
   事件當日覆蓋率，偏離 3% 太多就是該調了。
"""

import json
import os
from datetime import datetime, timedelta, timezone

import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
WEB = os.path.join(ROOT, "web", "data")

KEEP_DAYS = 10          # 通知欄保留幾個交易日的事件
ANOMALY_K = 2.5
ANOMALY_FLOOR = 0.3     # 億
BUY_STREAK = 7
SELL_STREAK = 5
FOREIGN_STREAK = 7


def arr(v, T):
    return np.array([np.nan if x is None else float(x) for x in v], dtype=float) \
        if v else np.full(T, np.nan)


def streak_at(a, i):
    """截至第 i 天為止的連續同方向天數（正＝連買）。"""
    n = 0
    for k in range(i, -1, -1):
        x = a[k]
        if not np.isfinite(x) or x == 0:
            break
        if x > 0 and n >= 0:
            n += 1
        elif x < 0 and n <= 0:
            n -= 1
        else:
            break
    return n


def main():
    panel = load(os.path.join(DATA, "market", "panel.json"))
    dates = panel["dates"]
    S = panel["stocks"]
    T = len(dates)
    start = max(0, T - KEEP_DAYS)

    events = []
    stats = {}

    def bump(k):
        stats[k] = stats.get(k, 0) + 1

    for code, v in S.items():
        close = arr(v["close"], T)
        if not np.isfinite(close).any():
            continue
        net = arr(v["net_yi"], T)
        fgn = arr(v["foreign"], T)
        chg = arr(v["chg"], T)
        name = v["name"]

        for i in range(start, T):
            n1 = net[i]
            if not np.isfinite(n1):
                continue
            # 力道基準用「該日之前的 20 日」，不能含當日——含了的話
            # 一筆爆量會自己把自己的基準墊高，事件就永遠觸發不了
            w = net[max(0, i - 20):i]
            base = float(np.nanmean(np.abs(w))) if np.isfinite(w).any() else 0.0
            thr = max(ANOMALY_K * base, ANOMALY_FLOOR)
            common = {
                "date": dates[i], "code": code, "name": name,
                "net_1d_yi": None if not np.isfinite(n1) else round(float(n1), 2),
                "chg_1d": None if not np.isfinite(chg[i]) else round(float(chg[i]), 2),
                "power": round(abs(float(n1)) / base, 1) if base > 1e-6 else None,
            }
            if abs(n1) > thr:
                kind = "anomaly_buy" if n1 > 0 else "anomaly_sell"
                bump(kind)
                events.append({**common, "kind": kind,
                               "text": "異常大買" if n1 > 0 else "異常大賣"})

            st = streak_at(net, i)
            if st >= BUY_STREAK:
                bump("streak_buy")
                events.append({**common, "kind": "streak_buy",
                               "text": f"法人連買 {st} 天"})
            elif st <= -SELL_STREAK:
                bump("streak_sell")
                events.append({**common, "kind": "streak_sell",
                               "text": f"法人連賣 {-st} 天"})

            fs = streak_at(fgn, i)
            if fs >= FOREIGN_STREAK:
                bump("foreign_buy")
                events.append({**common, "kind": "foreign_buy",
                               "text": f"外資連買 {fs} 天"})

    # 同一天同一檔可能觸發多個事件，這是刻意的（連買 + 異常大買是兩件事）
    events.sort(key=lambda e: (e["date"], -abs(e["net_1d_yi"] or 0)))
    doc = {
        "generated_at": datetime.now(timezone(timedelta(hours=8)))
                        .isoformat(timespec="seconds"),
        "dates": dates[start:],
        "events": events,
    }
    out = os.path.join(WEB, "events.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    last = dates[-1]
    today = [e for e in events if e["date"] == last]
    n_stock = sum(1 for v in S.values()
                  if np.isfinite(arr(v["close"], T)).any())
    hit = len({e["code"] for e in today})
    print(f"事件 {len(events)} 則（近 {len(doc['dates'])} 個交易日）"
          f"｜最新日 {last} 共 {len(today)} 則，涉及 {hit} 檔"
          f"（{hit/n_stock*100:.1f}% 的市場）")
    for k, n in sorted(stats.items(), key=lambda kv: -kv[1]):
        d = sum(1 for e in today if e["kind"] == k)
        # 覆蓋率偏離 3% 太多就代表門檻該重新校準了
        print(f"  {k:14s} 總計 {n:5d}　最新日 {d:4d}  ({d/n_stock*100:4.1f}%)")
    print(f"  追蹤 20 檔的人平均每日收到約 {len(today)/n_stock*20:.1f} 則")
    print(f"→ {out}  ({os.path.getsize(out)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
