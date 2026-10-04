#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
「高勝率」研究：持有多久，賺錢的機率有多高？

短線策略的勝率很容易誤導：RSI2 回檔策略勝率 60%，組合卻兩年零報酬——
每次贏一點、輸一次就賠回去。真正決定勝率的，往往不是進出場訊號，而是持有時間。

做法：用 Yahoo 的最長歷史與「含息還原價」（adjclose），對每一個可能的進場日，
看持有 N 個交易日後是賺是賠。這是把歷史上每一天都當成一次進場，不挑時點。
另外算每月定期定額：從每個月份開始扣款，到今天的報酬。

輸出：twflow/web/data/odds.json
限制：歷史不代表未來；台股過去二十年整體向上，結果會比停滯的市場樂觀。
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, "twflow", "web", "data", "odds.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
ETFS = [("0050", "元大台灣50"), ("006208", "富邦台50"), ("0056", "元大高股息")]
HORIZONS = [(5, "1 週"), (21, "1 個月"), (63, "3 個月"), (126, "半年"), (252, "1 年"),
            (756, "3 年"), (1260, "5 年"), (2520, "10 年")]


def fetch(code):
    # ⚠️ 不能用 range=max：Yahoo 對 max 會悄悄改回「月線」，持有「5 個交易日」就變成 5 個月，
    #    第一版就這樣算出「持有一週中位數 +5.8%」的荒謬結果。改給明確的起訖時間才會是日線。
    r = requests.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW",
                     params={"period1": 0, "period2": int(time.time()), "interval": "1d",
                             "events": "div,split"},
                     headers=UA, timeout=30)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    ts = res["timestamp"]
    adj = (res["indicators"].get("adjclose") or [{}])[0].get("adjclose")
    close = res["indicators"]["quote"][0]["close"]
    px = adj or close
    off = res["meta"].get("gmtoffset", 0)
    rows = [(datetime.fromtimestamp(t + off, tz=timezone.utc).date().isoformat(), p)
            for t, p in zip(ts, px) if p]
    rows = check(code, rows)
    return rows, bool(adj)


def check(code, rows):
    """資料合理性：必須是日線、不能有未還原的分割（單日 ±25% 以上幾乎一定是資料錯）。"""
    from datetime import date as _d
    gaps = sorted((_d.fromisoformat(b[0]) - _d.fromisoformat(a[0])).days for a, b in zip(rows, rows[1:]))
    if not gaps or gaps[len(gaps) // 2] > 3:
        raise RuntimeError(f"{code} 不是日線資料（日期間隔中位數 {gaps[len(gaps)//2] if gaps else '—'} 天）")
    jumps = [(b[0], round((b[1] / a[1] - 1) * 100, 1)) for a, b in zip(rows, rows[1:])
             if abs(b[1] / a[1] - 1) > 0.25]
    if jumps:
        # 來源偶爾在早年資料留下未還原的分割：只用最後一次跳動之後的資料，剩不到 6 年才放棄
        cut = jumps[-1][0]
        rest = [r for r in rows if r[0] >= cut]
        if len(rest) < 250 * 6:
            raise RuntimeError(f"{code} 有疑似未還原分割的單日跳動：{jumps[:5]}")
        print(f"  {code}：{jumps[:3]} 疑似未還原分割，改用 {cut} 之後的資料")
        return rest
    return rows


def horizon_stats(p, n, years):
    if len(p) <= n + 20:
        return None
    r = p[n:] / p[:-n] - 1
    ann = (1 + r) ** (1 / years) - 1 if years >= 1 else None
    return {"n": int(len(r)), "win": round(float((r > 0).mean() * 100), 1),
            "med": round(float(np.median(r) * 100), 2),
            "p5": round(float(np.percentile(r, 5) * 100), 2),
            "worst": round(float(r.min() * 100), 2),
            "best": round(float(r.max() * 100), 2),
            "ann_med": round(float(np.median(ann) * 100), 2) if ann is not None else None}


def dca(dates, p, min_months=36):
    """每月第一個交易日扣同樣金額，算從每個起始月到今天的總報酬。只計持有滿 min_months 的起點。"""
    firsts = [i for i in range(1, len(dates)) if dates[i][:7] != dates[i - 1][:7]]
    outs = []
    for k, s in enumerate(firsts):
        buys = firsts[k:]
        if len(buys) < min_months:
            break
        units = sum(1.0 / p[i] for i in buys)
        invested = float(len(buys))
        outs.append((dates[s][:7], units * p[-1] / invested - 1))
    if not outs:
        return None
    rets = np.array([x for _, x in outs])
    return {"starts": len(outs), "win": round(float((rets > 0).mean() * 100), 1),
            "med": round(float(np.median(rets) * 100), 1), "worst": round(float(rets.min() * 100), 1),
            "worst_start": outs[int(rets.argmin())][0], "first": outs[0][0], "min_months": min_months}


def main():
    out = []
    for code, name in ETFS:
        try:
            rows, has_adj = fetch(code)
        except Exception as e:
            print(f"{code} 失敗：{e!r}", file=sys.stderr)
            continue
        dates = [d for d, _ in rows]
        p = np.array([x for _, x in rows], float)
        hz = []
        for n, lab in HORIZONS:
            s = horizon_stats(p, n, n / 252)
            if s:
                hz.append({"days": n, "label": lab, **s})
        out.append({"code": code, "name": name, "since": dates[0], "until": dates[-1],
                    "adjusted": has_adj, "horizons": hz, "dca": dca(dates, p)})
        print(f"{code} {dates[0]}～{dates[-1]}（含息還原 {has_adj}）")
        for h in hz:
            print(f"   持有 {h['label']:<5} 勝率 {h['win']:5.1f}%  中位 {h['med']:+7.2f}%  最差5% {h['p5']:+7.2f}%  最差 {h['worst']:+7.2f}%")
        if out[-1]["dca"]:
            d = out[-1]["dca"]
            print(f"   定期定額（滿 {d['min_months']} 個月）勝率 {d['win']}%  中位 {d['med']:+}%  最差 {d['worst']:+}%（{d['worst_start']} 起扣）")
    if not out:
        sys.exit("沒有任何 ETF 的歷史資料")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
                   "etfs": out}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
