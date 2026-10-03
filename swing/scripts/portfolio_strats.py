#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
組合型策略：學術文獻上證據最多的兩類，跟逐筆型的短線策略用同一把尺檢驗。

  · 橫斷面動能（Jegadeesh & Titman 1993 以來的經典）：每月初持有過去約半年
    表現最強的 20 檔，跳過最近一週（短期反轉）。
  · 大盤趨勢濾網（Faber 2007 等）：0050 站上 200 日線才持有，跌破就空手。
    目的主要是降低大跌時的回落，不是提高報酬。

不偷看未來：用「前一個交易日」收盤算訊號，在「當天」收盤換股。
成本：依實際換手計手續費、證交稅與滑價。

與逐筆型的差別：這裡沒有一筆一筆的交易，改用「每月相對基準的超額報酬」做統計。
"""

import math
from datetime import date

import numpy as np

FEE, SLIP = 0.001425, 0.001
TAX = {"stock": 0.003, "etf": 0.001}
TOPN = 20
LOOK, SKIP = 125, 5        # 約 6 個月、跳過最近 1 週


def matrix(src, dates):
    idx = {d: i for i, d in enumerate(dates)}
    codes = list(src)
    C = np.full((len(codes), len(dates)), np.nan)
    for k, c in enumerate(codes):
        for r in src[c]["rows"]:
            C[k, idx[r[0]]] = r[4]
    return codes, C


def daily_ret(C):
    R = np.full_like(C, np.nan)
    R[:, 1:] = C[:, 1:] / C[:, :-1] - 1
    return R


def perf(eq_dates, eq):
    """eq: 每日權益（起點 1）。回傳年化、最大回落。"""
    if len(eq) < 2:
        return {"cagr": 0.0, "mdd": 0.0}
    yrs = max((date.fromisoformat(eq_dates[-1]) - date.fromisoformat(eq_dates[0])).days / 365.25, 0.1)
    peak, mdd = eq[0], 0.0
    for e in eq:
        peak = max(peak, e)
        mdd = min(mdd, e / peak - 1)
    return {"cagr": round(float((eq[-1] / eq[0]) ** (1 / yrs) - 1) * 100, 2), "mdd": round(float(mdd) * 100, 2)}


def monthly_excess(dates, r_s, r_b):
    """依月份累計策略與基準的日報酬，回傳每月超額報酬（%）。"""
    m = {}
    for d, a, b in zip(dates, r_s, r_b):
        k = d[:7]
        sa, sb = m.get(k, (1.0, 1.0))
        m[k] = (sa * (1 + a), sb * (1 + b))
    return [(sa - sb) * 100 for sa, sb in m.values()]


def excess_stats(ex):
    x = np.array(ex)
    if len(x) < 3:
        return {"months": int(len(x))}
    sd = x.std(ddof=1)
    return {"months": int(len(x)), "ex_m": round(float(x.mean()), 3),
            "win_m": round(float((x > 0).mean() * 100), 1),
            "t": round(float(x.mean() / (sd / math.sqrt(len(x)))), 2) if sd > 0 else 0.0}


def segment(dates, rs, rb, lo, hi):
    """dates[lo:hi] 區間的策略／基準績效與月超額統計。"""
    d, a, b = dates[lo:hi], rs[lo:hi], rb[lo:hi]
    eq_s, eq_b = np.cumprod(1 + np.array(a)), np.cumprod(1 + np.array(b))
    return ({**perf(d, eq_s), **excess_stats(monthly_excess(d, a, b))},
            perf(d, eq_b), list(zip(d, eq_s)))


def run_portfolio(src, eligible, dates, split_date, bench_code="0050"):
    codes, C = matrix(src, dates)
    R = daily_ret(C)
    kind = np.array([src[c]["kind"] for c in codes])
    T = len(dates)
    split = next(i for i, d in enumerate(dates) if d >= split_date)
    elig = np.zeros_like(C, dtype=bool)
    for k, c in enumerate(codes):
        e = eligible[c]
        for t, d in enumerate(dates):
            elig[k, t] = d in e

    # 同池等權每日報酬（每日再平衡）＝比較基準
    pool_r = np.zeros(T)
    for t in range(1, T):
        m = elig[:, t - 1] & np.isfinite(R[:, t])
        pool_r[t] = R[m, t].mean() if m.any() else 0.0

    out = []

    # ── 橫斷面動能 ─────────────────────────────────────────────
    w = np.zeros(len(codes))
    mom_r = np.zeros(T)
    holdings = []
    start = LOOK + SKIP + 1
    for t in range(start, T):
        # 先用昨天的持股吃今天的報酬
        rt = np.nan_to_num(R[:, t])
        mom_r[t] = float(w @ rt)
        # 月初（月份改變）以昨天收盤的訊號在今天收盤換股
        if dates[t][:7] != dates[t - 1][:7]:
            s = t - 1
            score = C[:, s - SKIP] / C[:, s - SKIP - LOOK] - 1
            ok = elig[:, s] & np.isfinite(score) & (kind == "stock")
            idx = np.where(ok)[0]
            top = idx[np.argsort(-score[idx])][:TOPN]
            nw = np.zeros(len(codes))
            if len(top):
                nw[top] = 1.0 / len(top)
            # 漂移後的權重 → 新權重的換手成本
            drift = w * (1 + rt)
            drift = drift / drift.sum() if drift.sum() > 0 else drift
            buy = np.clip(nw - drift, 0, None).sum()
            sell = np.clip(drift - nw, 0, None).sum()
            mom_r[t] -= buy * (FEE + SLIP) + sell * (FEE + TAX["stock"] + SLIP)
            w = nw
            holdings = [codes[k] for k in top]
        else:
            # 沒換股：權重隨價格漂移
            w = w * (1 + rt)
            w = w / w.sum() if w.sum() > 0 else w
    lo = start
    is_s, is_b, _ = segment(dates, mom_r, pool_r, lo, split)
    oos_s, oos_b, curve = segment(dates, mom_r, pool_r, split, T)
    verdict = bool(oos_s.get("t", 0) >= 2 and is_s.get("ex_m", -1) > 0 and oos_s["cagr"] > oos_b["cagr"])
    step = max(1, len(curve) // 120)
    out.append({
        "key": "momentum", "kind": "portfolio", "name": "橫斷面動能（月換股）",
        "desc": f"每月第一個交易日，持有股票池中過去約半年（跳過最近一週）漲最多的 {TOPN} 檔，等權重；"
                "以前一日收盤算訊號、當日收盤換股，依實際換手計成本。",
        "bench_name": "同池等權買進持有",
        "is": is_s, "oos": oos_s, "bench_is": is_b, "bench_oos": oos_b, "verdict": verdict,
        "curve": [[d, round(float(e), 4)] for d, e in curve[::step]],
        "today": [{"code": c, "name": src[c]["name"], "kind": src[c]["kind"],
                   "close": src[c]["rows"][-1][4]} for c in holdings],
        "today_label": "目前持股（上次月初換股）",
    })

    # ── 大盤趨勢濾網（0050 / 200 日線）───────────────────────────
    if bench_code in codes:
        k = codes.index(bench_code)
        c0, r0 = C[k], np.nan_to_num(R[k])
        ma = np.full(T, np.nan)
        for t in range(200, T):
            seg_ = c0[t - 200:t]
            if np.isfinite(seg_).all():
                ma[t] = seg_.mean()
        tr_r, hold_r = np.zeros(T), np.zeros(T)
        pos, start2 = 0.0, 201
        for t in range(start2, T):
            tr_r[t] = pos * r0[t]
            hold_r[t] = r0[t]
            want = 1.0 if (np.isfinite(ma[t]) and c0[t] > ma[t]) else 0.0
            if want != pos:      # 今天收盤依今天訊號換倉，明天起生效
                tr_r[t] -= (FEE + SLIP) if want > pos else (FEE + TAX["etf"] + SLIP)
                pos = want
        is_s, is_b, _ = segment(dates, tr_r, hold_r, start2, split)
        oos_s, oos_b, curve = segment(dates, tr_r, hold_r, split, T)
        flips = int(sum(1 for t in range(start2 + 1, T)
                        if np.isfinite(ma[t]) and np.isfinite(ma[t - 1])
                        and (c0[t] > ma[t]) != (c0[t - 1] > ma[t - 1])))
        verdict = bool(oos_s.get("t", 0) >= 2 and is_s.get("ex_m", -1) > 0 and oos_s["cagr"] > oos_b["cagr"])
        risk = oos_s["mdd"] > oos_b["mdd"] + 3     # 回落少 3 個百分點以上才算有改善
        step = max(1, len(curve) // 120)
        out.append({
            "key": "trend", "kind": "portfolio", "name": "大盤趨勢濾網（0050／200 日線）",
            "desc": "0050 收盤在 200 日均線之上就持有，跌破就全部賣出改持現金；目的主要是避開大跌，而不是多賺。",
            "bench_name": "0050 買進持有",
            "is": is_s, "oos": oos_s, "bench_is": is_b, "bench_oos": oos_b, "verdict": verdict,
            "risk_better": bool(risk), "flips": flips,
            "curve": [[d, round(float(e), 4)] for d, e in curve[::step]],
            "today": [{"code": bench_code, "name": src[bench_code]["name"], "kind": "etf",
                       "close": src[bench_code]["rows"][-1][4]}] if pos > 0 else [],
            "today_label": "目前狀態：" + ("持有 0050" if pos > 0 else "空手（0050 在 200 日線之下）"),
        })
    for s in out:
        print(f"{s['name']:<14} 樣本內 {s['is']} 基準 {s['bench_is']}\n"
              f"               樣本外 {s['oos']} 基準 {s['bench_oos']}  → {'有效' if s['verdict'] else '無效'}"
              + (f"  回落改善 {s.get('risk_better')}" if 'risk_better' in s else ''))
    return out
