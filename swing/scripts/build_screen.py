#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智慧選股資料表：每檔台股一列、約 35 個欄位（技術面、籌碼面、基本面、大戶），給前端「選股」頁即時篩選。

資料來源（都是管線裡已經落地的檔案，不另外對外抓）：
  · 價量技術：swing/data/prices（官方日線，全部上市櫃）滿 260 天時優先；否則 swing/.cache/ohlcv.json（Yahoo，流動性前 400 檔）
  · 法人當日／5 日／20 日：twflow/web/data/latest.json
  · 法人連買天數、融資融券：swing/data/chips
  · 本益比／殖利率／淨值比、季報：swing/data/fund
  · 月營收：swing/data/revenue.json
  · 千張大戶：swing/data/tdcc（最近兩週）

輸出：twflow/web/data/screen.json（欄位式：{"codes": [...], "cols": {欄位: [...]}}，缺值為 null）

用法：python swing/scripts/build_screen.py
"""

import glob
import gzip
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
WEB = os.path.join(REPO, "twflow", "web", "data")
DATA = os.path.join(ROOT, "data")
sys.path.insert(0, HERE)
import indicators as I  # noqa: E402

N_DAYS = 300


def load(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def price_panel(codes):
    """回傳 (dates, {code: rows[d,o,h,l,c,v]})，優先官方日線（還原報酬串成還原價）。"""
    files = sorted(glob.glob(os.path.join(DATA, "prices", "*.json.gz")))[-16:]
    days = {}
    for p in files:
        with gzip.open(p, "rt", encoding="utf-8") as f:
            days.update(json.load(f)["days"])
    dates = sorted(days)[-N_DAYS:]
    if len(dates) >= 260:
        out = {}
        for c in codes:
            seq = [(d, days[d][c]) for d in dates if c in days[d]]
            if len(seq) < 60:
                continue
            fac, rows = 1.0, []
            for i in range(len(seq) - 1, -1, -1):          # 由新往舊：還原係數累乘
                d, (o, h, l, cl, v, r) = seq[i]
                if i < len(seq) - 1:
                    nxt_c, nxt_r = seq[i + 1][1][3], seq[i + 1][1][5]
                    raw = nxt_c / cl
                    ratio = (1 + nxt_r) if nxt_r is not None else (raw if abs(raw - 1) <= 0.105 else 1.0)
                    fac = fac * nxt_c / (ratio * cl) if cl else fac
                f_ = fac
                rows.append([d, (o or cl) * f_, (h or cl) * f_, (l or cl) * f_, cl * f_, (v or 0) * 1000])
            out[c] = rows[::-1]
        return dates, out, "官方日線"
    src = load(os.path.join(ROOT, ".cache", "ohlcv.json"), {}).get("symbols", {})
    alld = sorted({r[0] for s in src.values() for r in s["rows"]})[-N_DAYS:]
    keep = set(alld)
    return alld, {c: [r for r in s["rows"] if r[0] in keep] for c, s in src.items()}, "Yahoo（流動性前 400 檔）"


def r(x, n=2):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), n)


def main():
    latest = load(os.path.join(WEB, "latest.json"))
    sd = latest["stock_data"]
    codes = sorted(sd)
    cols = {}

    def put(name, code, v):
        cols.setdefault(name, {})[code] = v

    # ── 價量技術 ────────────────────────────────────────────────
    dates, panel, psrc = price_panel(codes)
    idx = {d: t for t, d in enumerate(dates)}
    pc = [c for c in codes if c in panel]
    N, T = len(pc), len(dates)
    O, H, L, C, V = (np.full((N, T), np.nan) for _ in range(5))
    for k, c in enumerate(pc):
        for d, o, h, l, cl, v in panel[c]:
            t = idx[d]
            O[k, t], H[k, t], L[k, t], C[k, t], V[k, t] = o, h, l, cl, v
    with np.errstate(invalid="ignore", divide="ignore"):
        ma5, ma20, ma60 = I.sma(C, 5), I.sma(C, 20), I.sma(C, 60)
        rs = I.rsi(C)
        K, D = I.kd(H, L, C)
        dif, sig = I.macd(C)
        hi250 = I.rmax(C, 250)
        vma20 = I.sma(V, 20)
        kd_gold = I.cross_up(K, D)
        macd_gold = I.cross_up(dif, sig)
    for k, c in enumerate(pc):
        ts = np.where(np.isfinite(C[k]))[0]
        if len(ts) < 21:
            continue
        t = ts[-1]
        cl = C[k, t]

        def ret(n):
            j = t - n
            return r((cl / C[k, j] - 1) * 100) if j >= 0 and np.isfinite(C[k, j]) else None
        put("r5", c, ret(5)); put("r20", c, ret(20)); put("r60", c, ret(60)); put("r250", c, ret(250))
        put("vr", c, r(V[k, t] / vma20[k, t - 1]) if t >= 21 and vma20[k, t - 1] > 0 else None)
        put("bias20", c, r((cl / ma20[k, t] - 1) * 100))
        put("above20", c, bool(cl > ma20[k, t]) if np.isfinite(ma20[k, t]) else None)
        put("above60", c, bool(cl > ma60[k, t]) if np.isfinite(ma60[k, t]) else None)
        put("bull", c, bool(cl > ma5[k, t] > ma20[k, t] > ma60[k, t]) if np.isfinite(ma60[k, t]) else None)
        put("near52", c, r(cl / hi250[k, t] * 100, 1) if np.isfinite(hi250[k, t]) else None)
        put("high52", c, bool(cl >= hi250[k, t] * 0.999) if np.isfinite(hi250[k, t]) else None)
        put("rsi", c, r(rs[k, t], 1)); put("k", c, r(K[k, t], 1)); put("d", c, r(D[k, t], 1))
        put("kd_gold", c, bool(kd_gold[k, t])); put("macd_gold", c, bool(macd_gold[k, t]))
        put("vol", c, int(V[k, t] / 1000) if np.isfinite(V[k, t]) else None)

    # ── 法人（latest.json）與連買天數、融資融券（chips）────────────
    for c in codes:
        d = sd[c]
        put("price", c, d.get("price")); put("chg", c, d.get("chg_1d"))
        put("f5", c, d.get("foreign_5d")); put("t5", c, d.get("trust_5d"))
        put("n20", c, d.get("net_20d_yi")); put("pos60", c, d.get("position"))
    chips = {}
    for p in sorted(glob.glob(os.path.join(DATA, "chips", "*.json")))[-3:]:
        j = load(p, {})
        for day, rows in j.get("days", {}).items():
            chips[day] = dict(zip(j["codes"], rows))
    cdays = sorted(chips)[-25:]
    for c in codes:
        seq = [chips[d].get(c) for d in cdays if chips[d].get(c)]
        if len(seq) < 2:
            continue

        def streak(i):
            s = 0
            for x in reversed(seq):
                v = x[i]
                if v is None or v == 0:
                    break
                if s == 0:
                    s = 1 if v > 0 else -1
                elif (v > 0) == (s > 0):
                    s += 1 if s > 0 else -1
                else:
                    break
            return s
        put("fs", c, streak(0)); put("ts", c, streak(1))
        mb, mb5 = seq[-1][2], seq[-6][2] if len(seq) >= 6 else None
        if mb and mb5:
            put("mchg5", c, r((mb / mb5 - 1) * 100, 1))
        if mb and seq[-1][3] is not None and mb >= 100:
            put("sratio", c, r(seq[-1][3] / mb * 100, 1))

    # ── 估值 ────────────────────────────────────────────────────
    val = load(os.path.join(DATA, "fund", "valuation.json"), {})
    if val:
        last = val[max(val)]
        for c in codes:
            v = last.get(c)
            if v:
                put("pe", c, v[0] if v[0] and v[0] > 0 else None); put("dy", c, v[1]); put("pb", c, v[2])

    # ── 月營收 ──────────────────────────────────────────────────
    rev = (load(os.path.join(DATA, "revenue.json"), {}) or {}).get("months", {})
    ms = sorted(rev)
    if ms:
        m0 = ms[-1]
        for c in codes:
            cur = rev[m0].get(c)
            if not cur or not cur[0]:
                continue
            put("rev_m", c, m0)
            if cur[1]:
                put("rev_yoy", c, r((cur[0] / cur[1] - 1) * 100, 1))
            prev = rev[ms[-2]].get(c) if len(ms) > 1 else None
            if prev and prev[0]:
                put("rev_mom", c, r((cur[0] / prev[0] - 1) * 100, 1))
            hist = [rev[m][c][0] for m in ms[-13:-1] if c in rev[m] and rev[m][c][0]]
            if len(hist) >= 10:
                put("rev_high", c, bool(cur[0] > max(hist)))
            n = 0
            for m in reversed(ms):
                x = rev[m].get(c)
                if x and x[1] and x[0] > x[1]:
                    n += 1
                else:
                    break
            put("rev_up", c, n)

    # ── 季報（累計 → 單季）──────────────────────────────────────
    inc = load(os.path.join(DATA, "fund", "income.json"), {})
    single = {}
    for key in sorted(inc):
        y, q = int(key[:4]), int(key[-1])
        pk = f"{y}Q{q-1}"
        for c, v in inc[key].items():
            if q == 1:
                single.setdefault(key, {})[c] = v
            elif pk in inc and c in inc[pk]:
                single.setdefault(key, {})[c] = [None if a is None or b is None else a - b for a, b in zip(v, inc[pk][c])]
    qs = sorted(single)
    if qs:
        q0 = qs[-1]
        y, q = int(q0[:4]), int(q0[-1])
        ly, pq = f"{y-1}Q{q}", (f"{y}Q{q-1}" if q > 1 else f"{y-1}Q4")
        for c in codes:
            v = single[q0].get(c)
            if not v:
                continue
            rv, gp, op, ni, eps = v
            put("q", c, q0); put("eps", c, r(eps))
            l_ = single.get(ly, {}).get(c)
            if l_ and eps is not None and l_[4] and l_[4] > 0:
                put("eps_yoy", c, r((eps / l_[4] - 1) * 100, 1))
            if rv and gp is not None and rv > 0:
                put("gm", c, r(gp / rv * 100, 1))
            p_ = single.get(pq, {}).get(c)
            if p_ and rv and p_[0] and rv > 0 and p_[0] > 0 and None not in (gp, op, ni) and None not in p_[1:4]:
                put("three_up", c, bool(gp / rv > p_[1] / p_[0] and op / rv > p_[2] / p_[0] and ni / rv > p_[3] / p_[0]))
            h8 = [single.get(x, {}).get(c, [None] * 5)[4] for x in qs[-9:-1]]
            if eps is not None and len(h8) == 8 and None not in h8:
                put("eps_rec", c, bool(eps > 0 and eps > max(h8)))

    # ── 千張大戶 ────────────────────────────────────────────────
    tf = sorted(glob.glob(os.path.join(DATA, "tdcc", "*.json")))
    if tf:
        a = load(tf[-1], {})
        b = load(tf[-2], {}) if len(tf) > 1 else {}
        for c in codes:
            if c in a:
                put("big", c, a[c][0])
                if c in b:
                    put("big_chg", c, r(a[c][0] - b[c][0]))

    # ── 產業 ────────────────────────────────────────────────────
    for c in codes:
        secs = latest.get("stock_sectors", {}).get(c) or []
        put("sec", c, secs[0] if secs else None)

    out = {"date": latest["date"], "price_source": psrc,
           "fund": {"valuation": max(val) if val else None, "revenue": ms[-1] if ms else None,
                    "quarter": qs[-1] if qs else None, "tdcc": os.path.basename(tf[-1])[:10] if tf else None},
           "codes": codes,
           "cols": {k: [v.get(c) for c in codes] for k, v in cols.items()}}
    with open(os.path.join(WEB, "screen.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    filled = {k: sum(x is not None for x in v) for k, v in out["cols"].items()}
    print(f"選股資料 {latest['date']}：{len(codes)} 檔、{len(cols)} 欄（價量：{psrc}）")
    print("  各欄有值檔數：", filled)


if __name__ == "__main__":
    main()
