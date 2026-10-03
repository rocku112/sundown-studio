#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
短線波段策略回測：規則固定、計入真實成本、分樣本內外、對照隨機進場。

這支程式的目的不是「找出會賺錢的策略」，而是**誠實回答某個常見策略過去到底
有沒有用**。最常見的自欺方式有三種，這裡逐一擋掉：

  1. 偷看未來：訊號用當天收盤算，**隔天開盤**才進出場。
  2. 忽略成本：買進手續費 0.1425%、賣出手續費 0.1425% ＋ 證交稅（股票 0.3%、
     ETF 0.1%）、雙邊各 0.1% 滑價。短線交易次數多，成本常常吃掉全部利潤。
  3. 過度擬合：規則與參數是事先寫死的教科書版本，不在這份資料上調參數；
     前 60% 期間（樣本內）與後 40%（樣本外）分開計分，**只看樣本外**。

另外每個策略都跟「隨機進場、持有相同天數」比較——連隨機都贏不了的策略沒有意義。

輸入：swing/.cache/ohlcv.json（fetch_hist.py 產生）
輸出：twflow/web/data/swing.json（前端「波段」頁）
"""

import json
import math
import os
import random
from datetime import date, datetime, timedelta, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
SRC = os.path.join(ROOT, ".cache", "ohlcv.json")
OUT = os.path.join(REPO, "twflow", "web", "data", "swing.json")

FEE, SLIP = 0.001425, 0.001
TAX = {"stock": 0.003, "etf": 0.001}
SPLIT = 0.6            # 前 60% 期間為樣本內
SLOTS = 10             # 組合模擬：資金分 10 份，同時最多持有 10 檔
N_RANDOM = 200
BENCH = "0050"


# ── 指標 ───────────────────────────────────────────────────────
def sma(x, n):
    out = np.full(len(x), np.nan)
    if len(x) >= n:
        c = np.cumsum(np.insert(x, 0, 0.0))
        out[n - 1:] = (c[n:] - c[:-n]) / n
    return out


def rsi(c, n):
    """Wilder RSI。"""
    d = np.diff(c, prepend=c[0])
    up, dn = np.clip(d, 0, None), np.clip(-d, 0, None)
    out = np.full(len(c), np.nan)
    if len(c) <= n:
        return out
    au, ad = up[1:n + 1].mean(), dn[1:n + 1].mean()
    for i in range(n + 1, len(c)):
        au = (au * (n - 1) + up[i]) / n
        ad = (ad * (n - 1) + dn[i]) / n
        out[i] = 100.0 if ad == 0 else 100 - 100 / (1 + au / ad)
    return out


def rolling_max_prev(x, n):
    """前 n 日最高（不含當日），突破判斷用。"""
    out = np.full(len(x), np.nan)
    for i in range(n, len(x)):
        out[i] = x[i - n:i].max()
    return out


# ── 策略：entry(t) 回傳是否在 t 收盤發出買訊；exit(t, 進場索引, 進場價) 回傳是否出場 ──
def make_strategies(a):
    c, h, v = a["c"], a["h"], a["v"]
    ma5, ma10, ma20, ma60, ma200 = (sma(c, n) for n in (5, 10, 20, 60, 200))
    v20 = sma(v.astype(float), 20)
    hh20 = rolling_max_prev(h, 20)
    r2 = rsi(c, 2)
    ok = lambda *xs: all(np.isfinite(x) for x in xs)
    return {
        "breakout": {
            "name": "量增突破",
            "desc": "收盤創 20 日新高、站上季線，且成交量大於 20 日均量 1.5 倍時進場；跌破 10 日線、虧損 8% 或持有滿 20 天出場。",
            "entry": lambda t: ok(hh20[t], ma60[t], v20[t]) and c[t] > hh20[t] and c[t] > ma60[t] and v[t] > 1.5 * v20[t],
            "exit": lambda t, i0, px: (ok(ma10[t]) and c[t] < ma10[t]) or c[t] < px * 0.92 or t - i0 >= 20,
        },
        "rsi2": {
            "name": "多頭回檔（RSI2）",
            "desc": "收盤在 200 日線之上（長期多頭），但 2 日 RSI 低於 10（短線急跌）時進場；收盤站回 5 日線或持有滿 10 天出場。",
            "entry": lambda t: ok(ma200[t], r2[t]) and c[t] > ma200[t] and r2[t] < 10,
            "exit": lambda t, i0, px: (ok(ma5[t]) and c[t] > ma5[t]) or t - i0 >= 10,
        },
        "macross": {
            "name": "均線黃金交叉",
            "desc": "5 日線向上穿過 20 日線、且季線上揚時進場；5 日線跌回 20 日線之下或持有滿 30 天出場。",
            "entry": lambda t: t >= 5 and ok(ma5[t], ma20[t], ma5[t-1], ma20[t-1], ma60[t], ma60[t-5])
                     and ma5[t-1] <= ma20[t-1] and ma5[t] > ma20[t] and ma60[t] > ma60[t-5],
            "exit": lambda t, i0, px: (ok(ma5[t], ma20[t]) and ma5[t] < ma20[t]) or t - i0 >= 30,
        },
    }


def net_return(buy_px, sell_px, kind):
    cost_in = buy_px * (1 + FEE + SLIP)
    cash_out = sell_px * (1 - FEE - TAX[kind] - SLIP)
    return cash_out / cost_in - 1


def run_symbol(code, sym, strategies):
    """逐日掃描，一檔同時只持有一筆。訊號在 t 收盤，t+1 開盤成交。"""
    rows = sym["rows"]
    d = [r[0] for r in rows]
    o = np.array([r[1] for r in rows], float)
    c = np.array([r[4] for r in rows], float)
    trades = {k: [] for k in strategies}
    signals_today = []
    for k, s in strategies.items():
        pos = None
        for t in range(len(c) - 1):
            if pos is None:
                if s["entry"](t):
                    pos = (t + 1, o[t + 1])
            elif s["exit"](t, pos[0], pos[1]):
                trades[k].append({"code": code, "in": d[pos[0]], "out": d[t + 1], "days": t + 1 - pos[0],
                                  "ret": net_return(pos[1], o[t + 1], sym["kind"])})
                pos = None
        if s["entry"](len(c) - 1):
            signals_today.append(k)
    return trades, signals_today


def stats(rets):
    r = np.array(rets)
    if len(r) == 0:
        return {"n": 0}
    wins, losses = r[r > 0].sum(), -r[r < 0].sum()
    sd = r.std(ddof=1) if len(r) > 1 else 0
    return {"n": int(len(r)), "win": round(float((r > 0).mean() * 100), 1),
            "avg": round(float(r.mean() * 100), 3), "med": round(float(np.median(r) * 100), 3),
            "pf": round(float(wins / losses), 2) if losses > 0 else None,
            "t": round(float(r.mean() / (sd / math.sqrt(len(r)))), 2) if sd > 0 else 0.0}


def random_baseline(trades, panel, rng):
    """同樣筆數、同樣持有天數，隨機挑股票與進場日。回傳每輪平均報酬的分布。"""
    codes = list(panel)
    means = []
    for _ in range(N_RANDOM):
        rs = []
        for tr in trades:
            code = rng.choice(codes)
            sym = panel[code]
            n = len(sym["o"])
            if n <= tr["days"] + 2:
                continue
            i = rng.randrange(sym["lo"], max(sym["lo"] + 1, sym["hi"] - tr["days"] - 1))
            j = min(i + tr["days"], n - 1)
            rs.append(net_return(sym["o"][i], sym["o"][j], sym["kind"]))
        if rs:
            means.append(np.mean(rs))
    m = np.array(means)
    return {"mean": round(float(m.mean() * 100), 3), "p95": round(float(np.percentile(m, 95) * 100), 3)}


def portfolio(trades, start, end):
    """資金分 SLOTS 份，依進場日先到先得；滿倉時新訊號放棄。以出場日記錄已實現權益。"""
    ev = sorted((t for t in trades if start <= t["in"] <= end), key=lambda t: t["in"])
    eq, open_until, curve, taken = 1.0, [], [], 0
    for t in ev:
        open_until = [x for x in open_until if x > t["in"]]
        if len(open_until) >= SLOTS:
            continue
        open_until.append(t["out"])
        eq *= 1 + t["ret"] / SLOTS
        taken += 1
        curve.append((t["out"], eq))
    curve.sort()
    return curve, taken


def curve_stats(curve, start, end):
    if not curve:
        return {"cagr": 0.0, "mdd": 0.0, "total": 0.0}
    yrs = max((date.fromisoformat(end) - date.fromisoformat(start)).days / 365.25, 0.1)
    eq = [1.0] + [e for _, e in curve]
    peak, mdd = 1.0, 0.0
    for e in eq:
        peak = max(peak, e)
        mdd = min(mdd, e / peak - 1)
    return {"total": round(float(eq[-1] - 1) * 100, 2), "cagr": round(float(eq[-1] ** (1 / yrs) - 1) * 100, 2),
            "mdd": round(float(mdd) * 100, 2)}


def bench_stats(sym, start, end):
    rows = [r for r in sym["rows"] if start <= r[0] <= end]
    if len(rows) < 2:
        return None
    c = [r[4] for r in rows]
    yrs = max((date.fromisoformat(rows[-1][0]) - date.fromisoformat(rows[0][0])).days / 365.25, 0.1)
    peak, mdd = c[0], 0.0
    for x in c:
        peak = max(peak, x)
        mdd = min(mdd, x / peak - 1)
    tot = c[-1] / c[0]
    # 收盤價未含配息，0050 實際報酬會再高約每年 2–3%；前端照實註明
    return {"total": round((tot - 1) * 100, 2), "cagr": round((tot ** (1 / yrs) - 1) * 100, 2),
            "mdd": round(mdd * 100, 2)}


def main():
    src = json.load(open(SRC, encoding="utf-8"))["symbols"]
    all_dates = sorted({r[0] for s in src.values() for r in s["rows"]})
    split_date = all_dates[int(len(all_dates) * SPLIT)]
    start, end = all_dates[0], all_dates[-1]
    rng = random.Random(20261003)

    trades = {}
    today = {}
    panel = {}
    for code, sym in src.items():
        a = {"c": np.array([r[4] for r in sym["rows"]], float),
             "h": np.array([r[2] for r in sym["rows"]], float),
             "v": np.array([r[5] for r in sym["rows"]], float)}
        strat = make_strategies(a)
        tr, sig = run_symbol(code, sym, strat)
        for k, v in tr.items():
            trades.setdefault(k, []).extend(v)
        for k in sig:
            r = sym["rows"][-1]
            today.setdefault(k, []).append({"code": code, "name": sym["name"], "close": r[4],
                                            "kind": sym["kind"]})
        dl = [r[0] for r in sym["rows"]]
        panel[code] = {"o": [r[1] for r in sym["rows"]], "kind": sym["kind"],
                       "lo": next((i for i, x in enumerate(dl) if x >= split_date), len(dl) - 1),
                       "hi": len(dl) - 1}

    meta = make_strategies({"c": np.zeros(1), "h": np.zeros(1), "v": np.zeros(1)})
    bsym = src.get(BENCH)
    out_s = []
    for k, trs in trades.items():
        is_t = [t for t in trs if t["in"] < split_date]
        oos_t = [t for t in trs if t["in"] >= split_date]
        rb = random_baseline(oos_t, panel, rng) if oos_t else None
        curve, taken = portfolio(trs, split_date, end)
        cs = curve_stats(curve, split_date, end)
        so = stats([t["ret"] for t in oos_t])
        bs = bench_stats(bsym, split_date, end) if bsym else None
        # 「樣本外有效」要同時過三關：統計上非雜訊、贏過隨機進場的 95 百分位、組合報酬贏過 0050
        verdict = bool(so["n"] >= 30 and so.get("t", 0) >= 2 and rb and so["avg"] > rb["p95"]
                       and bs and cs["cagr"] > bs["cagr"])
        step = max(1, len(curve) // 120)
        out_s.append({
            "key": k, "name": meta[k]["name"], "desc": meta[k]["desc"],
            "is": stats([t["ret"] for t in is_t]), "oos": so, "random": rb,
            "hold": round(float(np.mean([t["days"] for t in oos_t])), 1) if oos_t else None,
            "portfolio": {**cs, "trades": taken,
                          "curve": [[d_, round(e, 4)] for d_, e in curve[::step]]},
            "verdict": verdict,
            "today": sorted(today.get(k, []), key=lambda x: x["code"])[:40],
        })
        print(f"{meta[k]['name']:<10} 樣本內 {stats([t['ret'] for t in is_t])}  樣本外 {so}  "
              f"隨機 {rb}  組合 {cs}  0050 {bs}  → {'有效' if verdict else '無效'}  今日 {len(today.get(k, []))} 檔")

    doc = {
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "period": [start, end], "split": split_date, "universe": len(src),
        "costs": {"fee": FEE, "tax_stock": TAX["stock"], "tax_etf": TAX["etf"], "slip": SLIP},
        "slots": SLOTS,
        "bench": {"code": BENCH, **(bench_stats(bsym, split_date, end) or {})} if bsym else None,
        "strategies": out_s,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}　期間 {start}～{end}，樣本外自 {split_date}，{len(src)} 檔")


if __name__ == "__main__":
    main()
