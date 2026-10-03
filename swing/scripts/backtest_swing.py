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
     前 60% 期間（樣本內）與後 40%（樣本外）分開計分。
  4. 倖存者偏誤：若用「今天」最熱門的股票回測，等於事先知道誰是贏家——第一版就
     中了這個陷阱（連隨機進場平均每筆都賺 1.8%，動能策略看起來年化破百）。
     現在改為：抓較大的範圍，每天只交易「當時」流動性前 150 名；基準也改成同一個
     股票池的等權買進持有，而不只是 0050。下市股票抓不到，仍有殘留偏誤。

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

from portfolio_strats import run_portfolio

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
SRC = os.path.join(ROOT, ".cache", "ohlcv.json")
OUT = os.path.join(REPO, "twflow", "web", "data", "swing.json")

FEE, SLIP = 0.001425, 0.001
TAX = {"stock": 0.003, "etf": 0.001}
SPLIT = 0.6            # 前 60% 期間為樣本內
POOL = 150             # 每天只交易「當時」近 60 日平均成交值前 150 名（時點正確的股票池）
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


def eligibility(src, dates):
    """每天依近 60 日平均成交值排名，前 POOL 名才可進場。回傳 {code: set(可交易日期)}。"""
    idx = {d: i for i, d in enumerate(dates)}
    dv = np.full((len(src), len(dates)), np.nan)
    codes = list(src)
    for k, code in enumerate(codes):
        for r in src[code]["rows"]:
            dv[k, idx[r[0]]] = r[4] * r[5]
    # 60 日滾動平均（缺值略過）
    filled = np.nan_to_num(dv)
    cnt = (~np.isnan(dv)).astype(float)
    cs, cc = np.cumsum(filled, axis=1), np.cumsum(cnt, axis=1)
    w = 60
    avg = np.full_like(dv, np.nan)
    avg[:, w:] = (cs[:, w:] - cs[:, :-w]) / np.maximum(cc[:, w:] - cc[:, :-w], 1)
    avg[(np.nan_to_num(cc) < 40)] = np.nan
    ok = {c: set() for c in codes}
    for t in range(w, len(dates)):
        col = avg[:, t]
        valid = np.where(np.isfinite(col))[0]
        if not len(valid):
            continue
        top = valid[np.argsort(-col[valid])][:POOL]
        for k in top:
            ok[codes[k]].add(dates[t])
    return ok


def run_symbol(code, sym, strategies, eligible):
    """逐日掃描，一檔同時只持有一筆。訊號在 t 收盤，t+1 開盤成交；只有當天在股票池內才能進場。"""
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
                if d[t] in eligible and s["entry"](t):
                    pos = (t + 1, o[t + 1])
            elif s["exit"](t, pos[0], pos[1]):
                trades[k].append({"code": code, "in": d[pos[0]], "out": d[t + 1], "days": t + 1 - pos[0],
                                  "ret": net_return(pos[1], o[t + 1], sym["kind"])})
                pos = None
        if d[-1] in eligible and s["entry"](len(c) - 1):
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


def random_baseline(trades, slots, rng):
    """同樣筆數、同樣持有天數，從同一期間的「當時股票池」隨機抽股票與進場日。
    slots: [(code, 進場索引)]，panel 對應的開盤價序列。回傳每輪平均報酬的分布。"""
    means = []
    for _ in range(N_RANDOM):
        rs = []
        for tr in trades:
            sym, i = slots[rng.randrange(len(slots))]
            n = len(sym["o"])
            j = min(i + tr["days"], n - 1)
            if j <= i:
                continue
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


def pool_bench(src, eligible, start, end):
    """同一個時點股票池的等權買進持有（每日再平衡），扣除進出成本不計（給它優勢，比較更保守）。"""
    closes = {c: {r[0]: r[4] for r in s["rows"]} for c, s in src.items()}
    dates = sorted({r[0] for s in src.values() for r in s["rows"] if start <= r[0] <= end})
    eq, peak, mdd, prev = 1.0, 1.0, 0.0, None
    for d in dates:
        if prev:
            rs = [closes[c][d] / closes[c][prev] - 1 for c in src
                  if prev in eligible[c] and d in closes[c] and prev in closes[c]]
            if rs:
                eq *= 1 + float(np.mean(rs))
                peak = max(peak, eq)
                mdd = min(mdd, eq / peak - 1)
        prev = d
    yrs = max((date.fromisoformat(end) - date.fromisoformat(start)).days / 365.25, 0.1)
    return {"total": round((eq - 1) * 100, 2), "cagr": round((eq ** (1 / yrs) - 1) * 100, 2),
            "mdd": round(mdd * 100, 2)}


def main():
    src = json.load(open(SRC, encoding="utf-8"))["symbols"]
    all_dates = sorted({r[0] for s in src.values() for r in s["rows"]})
    split_date = all_dates[int(len(all_dates) * SPLIT)]
    start, end = all_dates[0], all_dates[-1]
    rng = random.Random(20261003)

    eligible = eligibility(src, all_dates)
    trades = {}
    today = {}
    panel = {}
    for code, sym in src.items():
        a = {"c": np.array([r[4] for r in sym["rows"]], float),
             "h": np.array([r[2] for r in sym["rows"]], float),
             "v": np.array([r[5] for r in sym["rows"]], float)}
        strat = make_strategies(a)
        tr, sig = run_symbol(code, sym, strat, eligible[code])
        for k, v in tr.items():
            trades.setdefault(k, []).extend(v)
        for k in sig:
            r = sym["rows"][-1]
            today.setdefault(k, []).append({"code": code, "name": sym["name"], "close": r[4],
                                            "kind": sym["kind"]})
        panel[code] = {"o": [r[1] for r in sym["rows"]], "kind": sym["kind"],
                       "d": [r[0] for r in sym["rows"]]}
    # 隨機抽樣的候選：(股票, 進場索引)，限定當天在股票池內；樣本內外分開
    slots_is, slots_oos = [], []
    for code, p in panel.items():
        for i, d_ in enumerate(p["d"][:-1]):
            if d_ in eligible[code]:
                (slots_is if d_ < split_date else slots_oos).append((p, i + 1))

    meta = make_strategies({"c": np.zeros(1), "h": np.zeros(1), "v": np.zeros(1)})
    bsym = src.get(BENCH)
    pb = pool_bench(src, eligible, split_date, end)
    out_s = []
    for k, trs in trades.items():
        is_t = [t for t in trs if t["in"] < split_date]
        oos_t = [t for t in trs if t["in"] >= split_date]
        rb = random_baseline(oos_t, slots_oos, rng) if oos_t else None
        rb_is = random_baseline(is_t, slots_is, rng) if is_t else None
        curve, taken = portfolio(trs, split_date, end)
        cs = curve_stats(curve, split_date, end)
        so, si = stats([t["ret"] for t in oos_t]), stats([t["ret"] for t in is_t])
        # 「有效」要同時過四關：
        #  ① 樣本外統計上非雜訊（≥30 筆、t≥2）
        #  ② 樣本外平均每筆贏過同池隨機進場的第 95 百分位
        #  ③ 樣本內也贏過同池隨機進場的平均（只在某段行情有效的不算）
        #  ④ 樣本外組合年化報酬贏過同一股票池等權買進持有
        verdict = bool(so["n"] >= 30 and so.get("t", 0) >= 2 and rb and so["avg"] > rb["p95"]
                       and rb_is and si.get("avg") is not None and si["avg"] > rb_is["mean"]
                       and cs["cagr"] > pb["cagr"])
        step = max(1, len(curve) // 120)
        out_s.append({
            "key": k, "kind": "trade", "name": meta[k]["name"], "desc": meta[k]["desc"],
            "is": si, "oos": so, "random": rb, "random_is": rb_is,
            "hold": round(float(np.mean([t["days"] for t in oos_t])), 1) if oos_t else None,
            "portfolio": {**cs, "trades": taken,
                          "curve": [[d_, round(e, 4)] for d_, e in curve[::step]]},
            "verdict": verdict,
            "today": sorted(today.get(k, []), key=lambda x: x["code"])[:40],
        })
        print(f"{meta[k]['name']:<10} 樣本內 {si} 隨機 {rb_is}\n           樣本外 {so} 隨機 {rb}\n"
              f"           組合 {cs}  股票池等權 {pb}  → {'有效' if verdict else '無效'}  今日 {len(today.get(k, []))} 檔")

    out_s += run_portfolio(src, eligible, all_dates, split_date, BENCH)

    doc = {
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "period": [start, end], "split": split_date, "universe": len(src),
        "costs": {"fee": FEE, "tax_stock": TAX["stock"], "tax_etf": TAX["etf"], "slip": SLIP},
        "slots": SLOTS,
        "bench": {"code": BENCH, **(bench_stats(bsym, split_date, end) or {})} if bsym else None,
        "pool_bench": pb, "pool": POOL,
        "strategies": out_s,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}　期間 {start}～{end}，樣本外自 {split_date}，{len(src)} 檔")


if __name__ == "__main__":
    main()
