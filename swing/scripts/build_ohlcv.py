#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 swing/data/prices（官方日線，含日後下市股票）整理成回測用的 swing/.cache/ohlcv.json，
格式與 fetch_hist.py（Yahoo）相同，回測程式不用改。

還原：以每日「還原報酬」（收盤 ÷ 參考價 − 1，見 fetch_prices.py）由最後一天往回串，
得到含息還原收盤；同日開高低乘上同一個還原係數。

股票池：只保留「曾經」在任一天進過近 60 日平均成交值前 KEEP 名的股票（回測每天只交易前 150 名），
再加上主要 ETF。這是用當時的資料判斷，不是用今天的排名回頭挑。

資料不足（少於 MIN_DAYS 個交易日）時直接結束、不覆蓋，讓流程退回 Yahoo 來源。

用法：python swing/scripts/build_ohlcv.py
"""

import glob
import gzip
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "data", "prices")
OUT = os.path.join(ROOT, ".cache", "ohlcv.json")
ETFS = {"0050", "006208", "0056", "00878", "00919", "00929", "00631L"}
KEEP = 900          # 涵蓋中小型股，供分組（規模／股價檔位）組合實驗；短線檢驗仍只用前 150 名
MIN_DAYS = 1000      # 約四年；官方回補從最近往前補，滿四年即取代 Yahoo（2026-10 首次啟用時約五年）


def main():
    files = sorted(glob.glob(os.path.join(SRC, "*.json.gz")))

    def read(p):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)

    # 兩趟讀取：第一趟只收集日期與代號，第二趟直接填進矩陣（避免整份資料常駐記憶體）
    dset, cset, names = set(), set(), {}
    for p in files:
        j = read(p)
        dset.update(j["days"])
        for rows in j["days"].values():
            cset.update(rows)
        names.update(j["names"])
    dates = sorted(dset)
    if len(dates) < MIN_DAYS:
        sys.exit(f"官方日線只有 {len(dates)} 天（需 {MIN_DAYS}），沿用 Yahoo 來源")
    codes = sorted(cset)
    idx = {c: k for k, c in enumerate(codes)}
    tix = {d: t for t, d in enumerate(dates)}
    N, T = len(codes), len(dates)
    O, H, L, C, V, R = (np.full((N, T), np.nan) for _ in range(6))
    for p in files:
        for d, rows in read(p)["days"].items():
            t = tix[d]
            for c, (o, h, l, cl, v, r) in rows.items():
                k = idx[c]
                O[k, t], H[k, t], L[k, t], C[k, t] = [np.nan if x is None else x for x in (o, h, l, cl)]
                V[k, t] = np.nan if v is None else v * 1000
                R[k, t] = np.nan if r is None else r

    # 曾經進過流動性前 KEEP 名（近 60 日平均成交值，只用當時以前的資料）
    dv = np.nan_to_num(C * V)
    cs = np.cumsum(dv, axis=1)
    avg = np.zeros_like(dv)
    avg[:, 60:] = (cs[:, 60:] - cs[:, :-60]) / 60
    ever = np.zeros(N, bool)
    for t in range(60, T, 5):
        top = np.argsort(-avg[:, t])[:KEEP]
        ever[top] = True
    for c in ETFS:
        if c in idx:
            ever[idx[c]] = True

    sym = {}
    for k in np.where(ever)[0]:
        c = codes[k]
        ts = np.where(np.isfinite(C[k]))[0]
        if len(ts) < 200:
            continue
        # 還原係數：由最後一天往回，fac[t] = 還原收盤 / 原始收盤
        fac = np.ones(len(ts))
        for j in range(len(ts) - 2, -1, -1):
            t1, t0 = ts[j + 1], ts[j]
            r = R[k, t1]
            if np.isfinite(r) and r > -0.9:
                ratio = 1 + r
            else:
                # 查無參考價：原始價差在漲跌幅限制（±10%）內就照用；超出代表有未知的權值調整，當作 0 報酬
                raw = C[k, t1] / C[k, t0]
                ratio = raw if abs(raw - 1) <= 0.105 else 1.0
            # 還原收盤[t0] = 還原收盤[t1] / ratio  →  fac[t0] = fac[t1] × C[t1] / (ratio × C[t0])
            fac[j] = fac[j + 1] * C[k, t1] / (ratio * C[k, t0])
        rows = []
        for j, t in enumerate(ts):
            f = fac[j]
            o = O[k, t] if np.isfinite(O[k, t]) else C[k, t]
            h = H[k, t] if np.isfinite(H[k, t]) else C[k, t]
            l_ = L[k, t] if np.isfinite(L[k, t]) else C[k, t]
            rows.append([dates[t], round(o * f, 4), round(h * f, 4), round(l_ * f, 4),
                         round(C[k, t] * f, 4), int(np.nan_to_num(V[k, t]))])
        sym[c] = {"name": names.get(c, c), "kind": "etf" if c in ETFS else "stock", "rows": rows,
                  "delisted": bool(ts[-1] < T - 5)}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "source": "official", "symbols": sym}, f, ensure_ascii=False, separators=(",", ":"))
    gone = sum(1 for s in sym.values() if s["delisted"])
    print(f"官方日線 {dates[0]}～{dates[-1]}（{T} 天）→ {len(sym)} 檔（其中已停止交易 {gone} 檔）→ {OUT}")


if __name__ == "__main__":
    main()
