#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
「定期定額」vs「位階加碼／調節」：坊間系統常說的「低位階多買、高位階調節獲利」，到底有沒有比較好？

事先固定的規則（不調參數；參數格點全部列出，不挑最好的報）：
  定期定額     每月第一個交易日把當月預算全數買進
  位階加碼     預算先進現金；價格低於 200 日均線時買「2 倍預算」、高於均線 15% 以上只買「半份」、其餘買 1 份
  高檔調節     定期定額，另外價格高於 200 日均線 X% 時賣出持股 20%（每月最多一次）轉為現金，
               跌回均線以下時現金全數買回
  加碼＋調節   兩個一起用（最接近「價值區、位階、調節」的系統）

  現金年利 1%；買進手續費 0.1425%、賣出手續費 0.1425%＋ETF 證交稅 0.1%。
  評估：從每一個月份開始、各跑 10 年（不足 10 年的起點不算），比較期末總資產（股票＋現金）÷ 總投入。
  另外看期間總資產最大回撤、以及「調節」實際賣出變現的金額。

標的：0050（含息還原，Yahoo）、加權指數 ^TWII（1997 起，不含息——會讓多抱現金的規則看起來比較好，結果偏向規則）。

輸出：twflow/web/data/rules_dca.json
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from holding_odds import check, fetch  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, "twflow", "web", "data", "rules_dca.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
BUY, SELL = 0.001425, 0.001425 + 0.001
CASH_Y = 0.01
YEARS = 10


def fetch_index():
    """加權指數：優先用證交所官方（FMTQIK，fetch_official.py 補齊後），否則退回 Yahoo；兩者都有時交叉比對。"""
    import fetch_official as OFF
    off = OFF.index_series()
    try:
        y = fetch_index_yahoo()
    except Exception as e:                       # noqa: BLE001
        if not off:
            raise
        print(f"  ^TWII Yahoo 失敗（{e!r}），使用官方資料", file=sys.stderr)
        y = None
    if off:
        if y:
            OFF.compare("^TWII", off, y)
        print(f"  ^TWII：使用證交所官方加權指數（{off[0][0]} 起）")
        return check("^TWII", off)
    print("  ^TWII：官方長歷史尚未補齊，暫用 Yahoo")
    return y


def fetch_index_yahoo():
    r = requests.get("https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII",
                     params={"period1": 0, "period2": int(time.time()), "interval": "1d"}, headers=UA, timeout=30)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    off = res["meta"].get("gmtoffset", 0)
    rows = [(datetime.fromtimestamp(t + off, tz=timezone.utc).date().isoformat(), p)
            for t, p in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if p]
    return check("^TWII", rows)


def simulate(p, ma, months, add=False, trim=None):
    """months：每月第一個交易日的索引。回傳 (期末總資產, 總投入, 最大回撤, 調節賣出金額, 每日總資產)"""
    units = cash = sold = 0.0
    invested = 0.0
    mset = set(months)
    start, end = months[0], months[-1] + 21
    end = min(end, len(p) - 1)
    peak, mdd = 0.0, 0.0
    daily_r = (1 + CASH_Y) ** (1 / 252) - 1
    trimmed_month = None
    for t in range(start, end + 1):
        cash *= 1 + daily_r
        px = p[t]
        if t in mset:
            cash += 1.0
            invested += 1.0
            if add and np.isfinite(ma[t]):
                m = 2.0 if px < ma[t] else 0.5 if px > ma[t] * 1.15 else 1.0
            else:
                m = 1.0
            amt = min(cash, m) if add else min(cash, 1.0)
            # 有調節：跌回均線下時，現金全數買回
            if trim is not None and np.isfinite(ma[t]) and px < ma[t]:
                amt = cash
            if amt > 0:
                units += amt * (1 - BUY) / px
                cash -= amt
        if trim is not None and np.isfinite(ma[t]) and px > ma[t] * (1 + trim) and trimmed_month != t // 21 and units > 0:
            q = units * 0.2
            got = q * px * (1 - SELL)
            units -= q
            cash += got
            sold += got
            trimmed_month = t // 21
        w = units * px + cash
        peak = max(peak, w)
        if peak > 0:
            mdd = min(mdd, w / peak - 1)
    return units * p[end] + cash, invested, mdd, sold


def run(code, rows):
    dates = [d for d, _ in rows]
    p = np.array([x for _, x in rows], float)
    ma = np.full(len(p), np.nan)
    cs = np.cumsum(p)
    ma[199:] = (cs[199:] - np.concatenate([[0], cs[:-200]])) / 200
    firsts = [i for i in range(1, len(dates)) if dates[i][:7] != dates[i - 1][:7] and i >= 200]
    span = YEARS * 12
    rules = {"dca": dict(), "add": dict(add=True)}
    for x in (0.10, 0.15, 0.20, 0.30):
        rules[f"trim{int(x * 100)}"] = dict(trim=x)
        rules[f"add_trim{int(x * 100)}"] = dict(add=True, trim=x)
    res = {k: [] for k in rules}
    starts = []
    for k in range(len(firsts) - span + 1):
        months = firsts[k:k + span]
        starts.append(dates[months[0]][:7])
        for name, kw in rules.items():
            w, inv, mdd, sold = simulate(p, ma, months, **kw)
            res[name].append((w / inv, mdd, sold / inv))
    if not starts:
        return None
    base = np.array([x[0] for x in res["dca"]])
    out = {"code": code, "since": dates[0], "until": dates[-1], "windows": len(starts),
           "first": starts[0], "last": starts[-1], "rules": {}}
    for name in rules:
        m = np.array([x[0] for x in res[name]])
        dd = np.array([x[1] for x in res[name]])
        sd = np.array([x[2] for x in res[name]])
        diff = (m / base - 1) * 100
        out["rules"][name] = {
            "multiple_med": round(float(np.median(m)), 3), "multiple_min": round(float(m.min()), 3),
            "beat": round(float((diff > 0).mean() * 100), 1), "diff_med": round(float(np.median(diff)), 2),
            "diff_min": round(float(diff.min()), 2), "diff_max": round(float(diff.max()), 2),
            "mdd_med": round(float(np.median(dd) * 100), 1), "sold_med": round(float(np.median(sd) * 100), 1)}
    return out


LABEL = {"dca": "定期定額", "add": "位階加碼", "trim10": "高檔調節（+10%）", "trim15": "高檔調節（+15%）",
         "trim20": "高檔調節（+20%）", "trim30": "高檔調節（+30%）", "add_trim10": "加碼＋調節（+10%）",
         "add_trim15": "加碼＋調節（+15%）", "add_trim20": "加碼＋調節（+20%）", "add_trim30": "加碼＋調節（+30%）"}


def main():
    out = []
    for code, getter in (("0050", lambda: fetch("0050")[0]), ("^TWII", fetch_index)):
        try:
            rows = getter()
        except Exception as e:                       # noqa: BLE001
            print(f"{code} 失敗：{e!r}", file=sys.stderr)
            continue
        r = run(code, rows)
        if not r:
            print(f"{code} 歷史不足 {YEARS} 年＋200 日", file=sys.stderr)
            continue
        out.append(r)
        print(f"\n{code} {r['since']}～{r['until']}：{r['windows']} 個 {YEARS} 年窗口（起點 {r['first']}～{r['last']}）")
        print(f"  {'規則':<14} 期末/投入 中位  最差  勝過定期定額  差距中位  最差   最好   回撤中位  調節變現/投入")
        for k, v in r["rules"].items():
            print(f"  {LABEL[k]:<14} {v['multiple_med']:7.2f} {v['multiple_min']:6.2f} {v['beat']:8.1f}% "
                  f"{v['diff_med']:+8.2f}% {v['diff_min']:+6.1f}% {v['diff_max']:+6.1f}% {v['mdd_med']:7.1f}% {v['sold_med']:8.1f}%")
    if not out:
        sys.exit("沒有任何標的算得出來")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "years": YEARS,
                   "labels": LABEL, "cost": {"buy": BUY, "sell": SELL, "cash": CASH_Y}, "results": out},
                  f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
