#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中期組合實驗：每月調整一次、持有約一個月，看「有證據跡象」的訊號做成組合後，年報酬能不能穩定達到 20–40%。

規則全部事先固定（不調參數）；同時列出 0050 長抱作為對照：
  B0  0050 長抱
  T0  0050＋大盤濾網：月初 0050 在 200 日均線上才持有，否則持有現金
  R   營收創 12 個月新高（年增為正）：公布後依年增率取前 20 檔
  E   EPS 創 2 年新高（最近一季已公布財報）：依 EPS 年增率取前 20 檔
  M   12-1 個月動能：過去 12 個月（跳過最近 1 個月）漲幅前 20 檔
  RM  營收創新高 且 12-1 動能為正：依動能取前 20 檔
  RMT RM＋大盤濾網（0050 跌破 200 日均線時全數改持現金）
  CS  核心衛星：70% 0050＋30% RM

  · 調整日：每月 10 日（月營收公布期限）之後第一個交易日收盤後決定，隔天開盤成交
  · 只在當時近 60 日成交值前 150 名內選股；20 個名額沒選滿的部分改持 0050
  · 成本：買 0.1425%、賣 0.1425%＋證交稅 0.3%（ETF 0.1%）；只對進出的部位收費
  · 財報一律以法定期限後才視為已知（Q1 5/15、Q2 8/14、Q3 11/14、Q4 隔年 3/31）
  · 現金年利 1%

輸出：twflow/web/data/portfolio.json
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import indicators as I                        # noqa: E402
from evidence import Lab, SRC, REV, ROOT      # noqa: E402

REPO = os.path.dirname(ROOT)
OUT = os.path.join(REPO, "twflow", "web", "data", "portfolio.json")
FWD = os.path.join(ROOT, "data", "forward")                 # 前瞻紀錄（只增不改，進版控）
FWD_OUT = os.path.join(REPO, "twflow", "web", "data", "forward.json")
TOPN = 20
BUY, SELL_S, SELL_E = 0.001425, 0.001425 + 0.003, 0.001425 + 0.001
CASH_Y = 0.01
LABEL = {"B0": "0050 長抱", "T0": "0050＋大盤濾網", "R": "營收創新高 20 檔", "E": "EPS 創 2 年新高 20 檔",
         "M": "12-1 動能 20 檔", "RM": "營收創新高＋動能", "RMT": "營收創新高＋動能＋大盤濾網",
         "CS": "核心衛星（70% 0050＋30% 營收動能）"}


def rebalance_days(dates):
    """每月 10 日之後的第一個交易日。"""
    out, seen = [], set()
    for t, d in enumerate(dates):
        ym = d[:7]
        if ym not in seen and d[8:] > "10":
            seen.add(ym)
            out.append(t)
    return out


def revenue_signal(lab, revenue, rdays):
    """{t: {k: 年增率}}：該調整日已公布的最新月營收中，創 12 個月新高且年增為正的股票。"""
    months = sorted(revenue)
    kpos = {c: k for k, c in enumerate(lab.codes)}
    out = {}
    for t in rdays:
        d = lab.dates[t]
        y, m = int(d[:4]), int(d[5:7])
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
        cur = f"{y}-{m:02d}"                      # 上個月的營收，本月 10 日前公布
        if cur not in revenue:
            continue
        i = months.index(cur)
        prev12 = months[max(0, i - 12):i]
        sig = {}
        for c, (a, b) in revenue[cur].items():
            k = kpos.get(c)
            if k is None or a is None or not b or b <= 0:
                continue
            hist = [revenue[p][c][0] for p in prev12 if c in revenue[p] and revenue[p][c][0] is not None]
            if len(prev12) == 12 and len(hist) >= 10 and a > max(hist) and a > b:
                sig[k] = a / b - 1
        out[t] = sig
    return out


def eps_signal(lab, rdays):
    """{t: {k: EPS 年增率}}：最近一季（已過法定期限）單季 EPS 為近 8 季最高且為正。"""
    ip = os.path.join(ROOT, "data", "fund", "income.json")
    if not os.path.exists(ip):
        return {}
    inc = json.load(open(ip, encoding="utf-8"))
    single = {}
    for key in sorted(inc):
        y, q = int(key[:4]), int(key[-1])
        prevk = f"{y}Q{q-1}"
        for c, v in inc[key].items():
            if q == 1:
                single.setdefault(key, {})[c] = v
            elif prevk in inc and c in inc[prevk]:
                single.setdefault(key, {})[c] = [None if a is None or b is None else a - b for a, b in zip(v, inc[prevk][c])]
    due = {}
    for key in single:
        y, q = int(key[:4]), int(key[-1])
        due[key] = {1: f"{y}-05-15", 2: f"{y}-08-14", 3: f"{y}-11-14", 4: f"{y+1}-03-31"}[q]
    kpos = {c: k for k, c in enumerate(lab.codes)}
    out = {}
    for t in rdays:
        d = lab.dates[t]
        known = [k for k in single if due[k] < d]
        if not known:
            continue
        key = max(known)
        y, q = int(key[:4]), int(key[-1])
        hist, yy, qq = [], y, q
        for _ in range(8):
            qq -= 1
            if qq == 0:
                yy, qq = yy - 1, 4
            hist.append(f"{yy}Q{qq}")
        ly = f"{y-1}Q{q}"
        sig = {}
        for c, v in single[key].items():
            k = kpos.get(c)
            eps = v[4]
            if k is None or eps is None or eps <= 0:
                continue
            h = [single.get(x, {}).get(c, [None] * 5)[4] for x in hist]
            if None in h or eps <= max(h):
                continue
            last = single.get(ly, {}).get(c)
            sig[k] = eps / last[4] - 1 if last and last[4] and last[4] > 0 else 0.0
        out[t] = sig
    return out


def simulate(lab, rdays, picks, core=0.0, filt=None):
    """picks: {t: [k...]}（最多 TOPN 檔）；core: 0050 固定權重；filt: {t: bool} False 時全數持現金。
    回傳每日淨值（從第一個調整日隔天開盤起算）、每次調整的換手率。"""
    C, O = lab.C, lab.O
    T = len(lab.dates)
    b = lab.bench
    bo = lab.bench_open
    nav = np.full(T, np.nan)
    turns = []
    value = 1.0
    hold = {}            # key → 份數（key: 個股 k、"B" 為 0050、"$" 為現金）
    cash_d = (1 + CASH_Y) ** (1 / 250) - 1
    start = rdays[0] + 1
    for i, t in enumerate(rdays):
        e = t + 1                                 # 隔天開盤成交
        if e >= T:
            break
        nxt = rdays[i + 1] + 1 if i + 1 < len(rdays) else T
        # 以開盤價計算目前持股市值
        def px_open(key):
            if key == "$":
                return 1.0
            if key == "B":
                return bo[e] if np.isfinite(bo[e]) else b[e - 1]
            v = O[key, e]
            if not np.isfinite(v):                # 停牌或下市：用最後收盤
                past = C[key, :e]
                f = np.where(np.isfinite(past))[0]
                v = past[f[-1]] if len(f) else np.nan
            return v
        if hold:
            value = sum(n * px_open(k) for k, n in hold.items() if np.isfinite(px_open(k)))
        old_w = {k: n * px_open(k) / value for k, n in hold.items()} if hold and value > 0 else {}
        # 目標權重
        w = {}
        if filt is not None and not filt.get(t, True):
            w["$"] = 1.0
        else:
            sel = picks.get(t, [])[:TOPN]
            sat = 1.0 - core
            each = sat / TOPN
            for k in sel:
                if np.isfinite(O[k, e]) and O[k, e] > 0:
                    w[k] = each
            w["B"] = 1.0 - sum(w.values())
        # 成本：只對權重變動收費
        cost = 0.0
        tw = 0.0
        for k in set(w) | set(old_w):
            dw = w.get(k, 0.0) - old_w.get(k, 0.0)
            if k == "$":
                continue
            if dw > 0:
                cost += dw * BUY
            else:
                cost += -dw * (SELL_E if k == "B" else SELL_S)
            tw += abs(dw)
        if not old_w:
            cost = sum(v * BUY for k, v in w.items() if k != "$")
        value *= 1 - cost
        turns.append(tw / 2)
        hold = {k: value * v / px_open(k) for k, v in w.items() if v > 0 and np.isfinite(px_open(k)) and px_open(k) > 0}
        # 持有期每日淨值（收盤）
        for s in range(e, min(nxt, T)):
            tot = 0.0
            for k, n in list(hold.items()):
                if k == "$":
                    hold[k] = n * (1 + cash_d)
                    tot += hold[k]
                    continue
                if k == "B":
                    p = b[s]
                else:
                    p = C[k, s]
                    if not np.isfinite(p):
                        past = C[k, :s]
                        f = np.where(np.isfinite(past))[0]
                        p = past[f[-1]] if len(f) else 0.0
                tot += n * (p if np.isfinite(p) else 0.0)
            nav[s] = tot
    return nav, start, turns


def stats(nav, dates, start):
    v = nav[start:]
    d = dates[start:]
    ok = np.isfinite(v)
    v, d = v[ok], [x for x, o in zip(d, ok) if o]
    if len(v) < 250:
        return None
    yrs = len(v) / 250
    cagr = (v[-1] / v[0]) ** (1 / yrs) - 1
    r = v[1:] / v[:-1] - 1
    vol = r.std() * np.sqrt(250)
    peak = np.maximum.accumulate(v)
    mdd = (v / peak - 1).min()
    years = {}
    for x, val in zip(d, v):
        years.setdefault(x[:4], []).append(val)
    yr = {}
    prev = v[0]
    for y in sorted(years):
        yr[y] = round(float(years[y][-1] / prev - 1) * 100, 1)
        prev = years[y][-1]
    full = {y: r_ for y, r_ in yr.items() if y not in (d[0][:4], d[-1][:4])}      # 頭尾不完整年份不算
    h = len(v) // 2
    c1 = (v[h] / v[0]) ** (250 / h) - 1
    c2 = (v[-1] / v[h]) ** (250 / (len(v) - h)) - 1
    cagr, vol, mdd, c1, c2 = (float(x) for x in (cagr, vol, mdd, c1, c2))
    return {"cagr": round(cagr * 100, 1), "vol": round(vol * 100, 1), "mdd": round(mdd * 100, 1),
            "sharpe": round((cagr - CASH_Y) / vol, 2) if vol > 0 else None, "years": yr,
            "hit20": round(sum(1 for x in full.values() if x >= 20) / len(full) * 100) if full else None,
            "n_full": len(full), "worst_year": min(full.values()) if full else None,
            "halves": [round(c1 * 100, 1), round(c2 * 100, 1)], "period": [d[0], d[-1]],
            "curve": [[d[i], round(float(v[i] / v[0]), 4)] for i in range(0, len(v), 5)]}


def forward(lab, rdays, picks):
    """前瞻紀錄：每月調整日當天（資料最新一天就是調整日，或調整日後 5 個交易日內尚未記錄）把各策略的選股寫入
    swing/data/forward/YYYY-MM.json，之後永不修改；再用最新價格計算每一期的實際報酬。"""
    os.makedirs(FWD, exist_ok=True)
    T = len(lab.dates)
    t = rdays[-1]
    ym = lab.dates[t][:7]
    path = os.path.join(FWD, f"{ym}.json")
    if not os.path.exists(path) and T - 1 - t <= 5:
        rec = {"month": ym, "decided": lab.dates[t], "recorded": lab.dates[-1],
               "rule": "決定日收盤後選出，下一個交易日開盤買進，持有到下個月的調整日；每檔等權、20 個名額沒選滿的部分持有 0050",
               "picks": {k: [lab.codes[i] for i in v.get(t, [])] for k, v in picks.items()}}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, indent=1)
        print(f"前瞻紀錄：寫入 {ym}（決定日 {rec['decided']}）")
    idx = {d: i for i, d in enumerate(lab.dates)}
    kpos = {c: k for k, c in enumerate(lab.codes)}
    recs = []
    for fn in sorted(os.listdir(FWD)):
        if fn.endswith(".json"):
            recs.append(json.load(open(os.path.join(FWD, fn), encoding="utf-8")))
    C, O, b, bo = lab.C, lab.O, lab.bench, lab.bench_open
    cost = BUY + SELL_S                            # 保守：每月全數換股
    periods, cum = [], {}
    for i, r in enumerate(recs):
        t0 = idx.get(r["decided"])
        if t0 is None or t0 + 1 >= T:
            continue
        e = t0 + 1
        nxt = idx.get(recs[i + 1]["decided"]) if i + 1 < len(recs) else None
        x = nxt + 1 if nxt is not None and nxt + 1 < T else None
        done = x is not None

        def ret(k):
            p0 = O[k, e]
            p1 = O[k, x] if done else C[k, T - 1]
            if not np.isfinite(p1):
                f = np.where(np.isfinite(C[k, :T]))[0]
                p1 = C[k, f[-1]] if len(f) else np.nan
            return p1 / p0 - 1 if np.isfinite(p0) and p0 > 0 and np.isfinite(p1) else None
        b0 = bo[e] if np.isfinite(bo[e]) else b[e - 1]
        b1 = (bo[x] if np.isfinite(bo[x]) else b[x - 1]) if done else b[T - 1]
        br = b1 / b0 - 1
        row = {"month": r["month"], "decided": r["decided"], "end": lab.dates[x] if done else lab.dates[T - 1],
               "done": done, "B0": round(br * 100, 2)}
        for k, codes in r["picks"].items():
            rs = [ret(kpos[c]) for c in codes if c in kpos]
            rs = [v for v in rs if v is not None]
            slots = rs + [br] * (TOPN - len(rs))
            row[k] = round((sum(slots) / TOPN - cost * len(rs) / TOPN) * 100, 2)
        periods.append(row)
    for k in ["B0"] + list(picks):
        v = 1.0
        for p in periods:
            if p.get(k) is not None:
                v *= 1 + p[k] / 100
        cum[k] = round((v - 1) * 100, 2)
    doc = {"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
           "start": recs[0]["month"] if recs else None, "labels": LABEL, "periods": periods, "cum": cum,
           "picks": recs[-1] if recs else None}
    with open(FWD_OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"前瞻紀錄：{len(recs)} 期，累計 {cum}")


def main():
    src = json.load(open(SRC, encoding="utf-8"))["symbols"]
    revenue = json.load(open(REV, encoding="utf-8"))["months"] if os.path.exists(REV) else {}
    lab = Lab(src)
    idx = {d: i for i, d in enumerate(lab.dates)}
    lab.bench_open = np.full(len(lab.dates), np.nan)
    for r in src.get("0050", {}).get("rows", []):
        lab.bench_open[idx[r[0]]] = r[1] if r[1] and r[1] > 0 else np.nan
    # 0050 缺值往前補（停牌日、資料缺漏），避免淨值被當成 0
    for arr in (lab.bench, lab.bench_open):
        last = np.nan
        for i in range(len(arr)):
            if np.isfinite(arr[i]):
                last = arr[i]
            elif arr is lab.bench:
                arr[i] = last
    C = lab.C
    rdays = [t for t in rebalance_days(lab.dates) if t >= 260]
    b = lab.bench
    ma200 = I.sma(b[None, :], 200)[0]
    trend = {t: bool(np.isfinite(ma200[t]) and b[t] > ma200[t]) for t in rdays}
    with np.errstate(invalid="ignore", divide="ignore"):
        mom = I.prev(C, 21) / I.prev(C, 252) - 1
    rev = revenue_signal(lab, revenue, rdays) if revenue else {}
    eps = eps_signal(lab, rdays)

    def top(score_map, t, extra=None):
        cand = [(k, s) for k, s in score_map.items() if lab.E[k, t] and (extra is None or extra(k))]
        return [k for k, _ in sorted(cand, key=lambda x: -x[1])[:TOPN]]

    picks = {"R": {}, "E": {}, "M": {}, "RM": {}}
    for t in rdays:
        if t in rev:
            picks["R"][t] = top(rev[t], t)
            picks["RM"][t] = top({k: mom[k, t] for k in rev[t] if np.isfinite(mom[k, t]) and mom[k, t] > 0}, t)
        if t in eps:
            picks["E"][t] = top(eps[t], t)
        mm = {k: mom[k, t] for k in np.where(lab.E[:, t] & np.isfinite(mom[:, t]))[0]}
        picks["M"][t] = top(mm, t)

    # 各策略的起點對齊：取所有訊號都有資料的第一個調整日
    first = max([min(p) for p in picks.values() if p] + [rdays[0]])
    rd = [t for t in rdays if t >= first]
    runs = {"B0": simulate(lab, rd, {}, core=1.0), "T0": simulate(lab, rd, {}, core=1.0, filt=trend),
            "R": simulate(lab, rd, picks["R"]), "E": simulate(lab, rd, picks["E"]) if picks["E"] else None,
            "M": simulate(lab, rd, picks["M"]), "RM": simulate(lab, rd, picks["RM"]),
            "RMT": simulate(lab, rd, picks["RM"], filt=trend), "CS": simulate(lab, rd, picks["RM"], core=0.7)}
    res = {}
    for k, r in runs.items():
        if not r:
            continue
        nav, start, turns = r
        s = stats(nav, lab.dates, start)
        if s:
            s["turnover"] = round(float(np.mean(turns)) * 12 * 100) if turns else 0
            s["label"] = LABEL[k]
            res[k] = s
    last_t = rd[-1]
    now = {k: [{"code": lab.codes[i], "name": lab._name(i)} for i in picks[k].get(last_t, [])] for k in picks}
    doc = {"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
           "source": json.load(open(SRC, encoding="utf-8")).get("source", "yahoo"),
           "rebalance_date": lab.dates[last_t], "topn": TOPN,
           "cost": {"buy": BUY, "sell_stock": SELL_S, "sell_etf": SELL_E}, "results": res, "now": now}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    if "--no-forward" not in sys.argv:
        forward(lab, rd, picks)
    print(f"中期組合實驗（{doc['source']}）{len(rd)} 次調整")
    print(f"  {'策略':<22} 年化    波動   最大回撤  Sharpe  ≥20%年份  最差年  前半/後半年化   年換手")
    for k, s in res.items():
        print(f"  {s['label']:<20} {s['cagr']:6.1f}% {s['vol']:5.1f}% {s['mdd']:7.1f}%  {s['sharpe']}  "
              f"{s['hit20']}%（{s['n_full']} 年） {s['worst_year']}%  {s['halves']}  {s['turnover']}%")
        print(f"      各年：{s['years']}")


if __name__ == "__main__":
    main()
