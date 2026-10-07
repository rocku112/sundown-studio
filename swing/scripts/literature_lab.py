#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文獻檢驗：把學術期刊上「台灣有效」或「全球可複製」的選股因子，用我們自己的十年官方資料重做一次。
跟其他實驗同一套規則：每月 10 日後調整、隔天開盤成交、扣交易成本、跟同組等權比、前後半分開、多重比較校正。

事先登記（參數照論文，不調）：
  IMOM  日內動能（Ho, Hsiao, Lo & Yang, Pacific-Basin Finance Journal 2023，台灣）：
        過去 12 個月（跳過最近 1 個月）每天「開盤→收盤」報酬累計最高的 20 檔
  OMOM  隔夜動能（同一篇）：過去 12 個月每天「前一天收盤→開盤」報酬累計最高的 20 檔——論文預期「輸」
  LMAX  低彩券性（Bali, Cakici & Whitelaw, JFE 2011；台灣小型股證實）：上個月單日最大漲幅「最小」的 20 檔
  HMAX  高彩券性（同上，預期「輸」）：上個月單日最大漲幅最大的 20 檔
  H52   52 週新高（George & Hwang, JF 2004）：收盤價 ÷ 過去 52 週最高價 最接近 1 的 20 檔
  EMOM  去極端動能（台灣，Pacific-Basin Finance Journal 2019）：12-1 動能前 20 檔，但剔除動能最強的前 3%
  GP    毛利率÷資產（Novy-Marx, JFE 2013）：近四季毛利 ÷ 總資產最高的 20 檔（需資產負債表；資料不足時跳過）

每個因子在大型（前 150 名）、中小型（151–400 名）各做一次；校正門檻用 Bonferroni（檢驗數 × 2 組）。
「預期輸」的因子（OMOM、HMAX）看的是超額是否顯著為負——可以當「避開」條件。

輸出：twflow/web/data/literature.json
這是統計檢驗，不是投資建議。
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.stats import norm

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import portfolio_lab as P        # noqa: E402

OUT = os.path.join(P.REPO, "twflow", "web", "data", "literature.json")
TIERS = [("大型（前 150 名）", 0, 150), ("中小型（151–400 名）", 150, 400)]
TOPN = 20
META = {
    "IMOM": ("日內動能", "過去 12 個月（跳過最近 1 個月）累計「開盤→收盤」報酬最高", "Ho, Hsiao, Lo & Yang (2023), Pacific-Basin Finance Journal 82", 1),
    "OMOM": ("隔夜動能", "過去 12 個月累計「收盤→隔天開盤」報酬最高（論文預期輸）", "Ho, Hsiao, Lo & Yang (2023), Pacific-Basin Finance Journal 82", -1),
    "LMAX": ("低彩券性", "上個月單日最大漲幅最小", "Bali, Cakici & Whitelaw (2011), Journal of Financial Economics 99", 1),
    "HMAX": ("高彩券性", "上個月單日最大漲幅最大（論文預期輸）", "Bali, Cakici & Whitelaw (2011), Journal of Financial Economics 99", -1),
    "H52": ("52 週新高", "收盤價最接近過去 52 週最高價", "George & Hwang (2004), Journal of Finance 59", 1),
    "EMOM": ("去極端動能", "12-1 動能前 20 檔，剔除最強的前 3%", "Pacific-Basin Finance Journal (2019)，台灣", 1),
    "GP": ("毛利÷資產", "近四季毛利 ÷ 總資產最高", "Novy-Marx (2013), Journal of Financial Economics 108", 1),
}


def gp_scores(lab, rdays):
    """{t: {k: 近四季毛利 ÷ 最近一季總資產}}，季報以法定期限後才視為已知。需要 balance.json。"""
    ip = os.path.join(P.ROOT, "data", "fund", "income.json")
    bp = os.path.join(P.ROOT, "data", "fund", "balance.json")
    if not (os.path.exists(ip) and os.path.exists(bp)):
        return {}
    inc = json.load(open(ip, encoding="utf-8"))
    bal = json.load(open(bp, encoding="utf-8"))
    if len(bal) < 12:
        return {}

    def single(key, c):                       # 單季毛利（累計值相減）
        y, q = int(key[:4]), int(key[-1])
        v = inc.get(key, {}).get(c)
        if not v or v[1] is None:
            return None
        if q == 1:
            return v[1]
        pv = inc.get(f"{y}Q{q-1}", {}).get(c)
        return None if not pv or pv[1] is None else v[1] - pv[1]

    def due(key):
        y, q = int(key[:4]), int(key[-1])
        return {1: f"{y}-05-15", 2: f"{y}-08-14", 3: f"{y}-11-14", 4: f"{y+1}-03-31"}[q]
    keys = sorted(set(inc) & set(bal))
    kpos = {c: k for k, c in enumerate(lab.codes)}
    out = {}
    for t in rdays:
        d = lab.dates[t]
        known = [k for k in keys if due(k) < d]
        if len(known) < 4:
            continue
        last4 = known[-4:]
        s = {}
        for c, b in bal[last4[-1]].items():
            k = kpos.get(c)
            ta = b[0] if b else None
            if k is None or not ta or ta <= 0:
                continue
            g = [single(x, c) for x in last4]
            if None in g:
                continue
            s[k] = sum(g) / ta
        out[t] = s
    return out


def quality_scores(lab, rdays):
    """{t: {k: (ROE, 負債比, 毛利÷資產)}}：調整日當時已過法定期限的最近四季（單季值相加）與最近一季資產負債表。"""
    ip = os.path.join(P.ROOT, "data", "fund", "income.json")
    bp = os.path.join(P.ROOT, "data", "fund", "balance.json")
    if not (os.path.exists(ip) and os.path.exists(bp)):
        return {}
    inc = json.load(open(ip, encoding="utf-8"))
    bal = json.load(open(bp, encoding="utf-8"))

    def single(key, c, j):
        y, q = int(key[:4]), int(key[-1])
        v = inc.get(key, {}).get(c)
        if not v or v[j] is None:
            return None
        if q == 1:
            return v[j]
        pv = inc.get(f"{y}Q{q-1}", {}).get(c)
        return None if not pv or pv[j] is None else v[j] - pv[j]

    def due(key):
        y, q = int(key[:4]), int(key[-1])
        return {1: f"{y}-05-15", 2: f"{y}-08-14", 3: f"{y}-11-14", 4: f"{y+1}-03-31"}[q]
    ikeys = sorted(inc)
    kpos = {c: k for k, c in enumerate(lab.codes)}
    out = {}
    for t in rdays:
        d = lab.dates[t]
        bk = [k for k in sorted(bal) if due(k) < d]
        ik = [k for k in ikeys if due(k) < d]
        if not bk or len(ik) < 4 or bk[-1] != ik[-1]:
            continue
        last4 = ik[-4:]
        s = {}
        for c, b in bal[bk[-1]].items():
            k = kpos.get(c)
            if k is None or not b or not b[0] or b[0] <= 0:
                continue
            ni = [single(x, c, 3) for x in last4]
            gp = [single(x, c, 1) for x in last4]
            eq = b[3] if b[3] else b[2]
            roe = sum(ni) / eq if None not in ni and eq and eq > 0 else None
            dr = b[1] / b[0] if b[1] is not None else None
            gpa = sum(gp) / b[0] if None not in gp else None
            s[k] = (roe, dr, gpa)
        out[t] = s
    return out


def main():
    X = P.prepare()
    lab, book, C, DV, rdays = X.lab, X.book, X.C, X.DV, X.rdays
    O = lab.O
    CASH = book.CASH
    N, T = C.shape
    with np.errstate(invalid="ignore", divide="ignore"):
        prevC = np.full_like(C, np.nan)
        prevC[:, 1:] = C[:, :-1]
        intra = np.log(C / O)
        over = np.log(O / prevC)
        r1 = C / prevC - 1
    intra = np.where(np.isfinite(intra), intra, 0.0)
    over = np.where(np.isfinite(over), over, 0.0)
    ci, co = np.cumsum(intra, axis=1), np.cumsum(over, axis=1)
    t0 = min(t for t, v in X.rev.items() if v)
    rd = [t for t in rdays if t >= t0 and t >= 260]
    gp = gp_scores(lab, rd)

    def score(key, t):
        if key in ("IMOM", "OMOM"):
            c = ci if key == "IMOM" else co
            return c[:, t - 21] - c[:, t - 252]
        if key in ("LMAX", "HMAX"):
            w = r1[:, t - 20:t + 1]
            mx = np.where(np.isfinite(w).sum(axis=1) >= 15, np.nanmax(np.where(np.isfinite(w), w, -1), axis=1), np.nan)
            return -mx if key == "LMAX" else mx
        if key == "H52":
            w = C[:, t - 251:t + 1]
            hi = np.nanmax(np.where(np.isfinite(w), w, -np.inf), axis=1)
            return np.where(np.isfinite(C[:, t]) & (hi > 0), C[:, t] / hi, np.nan)
        if key == "EMOM":
            return X.mom[:, t]
        if key == "GP":
            s = np.full(N, np.nan)
            for k, v in gp.get(t, {}).items():
                s[k] = v
            return s
    rank_cache = {}

    def members(t, lo, hi):
        if t not in rank_cache:
            d = DV[:, t]
            ok = np.where(np.isfinite(d) & np.isfinite(C[:, t]))[0]
            rank_cache[t] = ok[np.argsort(-d[ok])]
        d = DV[:, t]
        return [k for k in rank_cache[t][lo:hi] if d[k] >= P.MIN_DV]

    keys = [k for k in META if k != "GP" or gp]
    m = len(keys) * len(TIERS)
    rows = []
    for tname, lo, hi in TIERS:
        def ew(t, lo=lo, hi=hi):
            mem = members(t, lo, hi)
            return {k: 1.0 / len(mem) for k in mem} if mem else {CASH: 1.0}
        rdk = [t for t in rd if t + 1 < book.T and (not gp or True)]
        base, st0, _ = P.simulate(book, rdk, ew)
        sb = P.stats(base, lab.dates, st0)
        for key in keys:
            def tg(t, key=key, lo=lo, hi=hi):
                mem = members(t, lo, hi)
                if not mem:
                    return {CASH: 1.0}
                s = score(key, t)
                cand = [(k, s[k]) for k in mem if np.isfinite(s[k])]
                cand.sort(key=lambda x: -x[1])
                if key == "EMOM":
                    cand = cand[max(1, int(len(cand) * 0.03)):]
                sel = [k for k, _ in cand[:TOPN]]
                return P.slots(sel, ew(t), TOPN)
            r_k = [t for t in rdk if key != "GP" or t in gp]
            if len(r_k) < 24:
                continue
            nav, st_, turns = P.simulate(book, r_k, tg)
            b_k, _, _ = P.simulate(book, r_k, ew)
            s_ = P.stats(nav, lab.dates, st_)
            sb_ = P.stats(b_k, lab.dates, st_)
            e = P.excess_t(nav, b_k, r_k)
            name, desc, ref, sign = META[key]
            tv = e["t"] or 0
            p = 1 - norm.cdf(sign * tv)
            rows.append({"key": key, "tier": tname, "name": name, "desc": desc, "ref": ref, "expect": sign,
                         "cagr": s_["cagr"], "base": sb_["cagr"], "excess": round(s_["cagr"] - sb_["cagr"], 1),
                         "t": e["t"], "t_halves": e["t_halves"], "mdd": s_["mdd"], "period": s_["period"],
                         "turnover": round(float(np.mean(turns)) * 12 * 100), "p": round(p, 5),
                         "significant": bool(p < 0.05 / m and all((x or 0) * sign > 0 for x in e["t_halves"]))})
    # 組合：唯一通過壓力測試的 S（中小型＋營收創新高）× 文獻唯一通過的 H52。
    # 兩者都是在同一份資料上找到的，組合起來不算獨立驗證——只看「疊加後有沒有比 S 本身更好」，
    # 結論以前瞻紀錄為準。事先固定：S 的候選（營收創 12 個月新高、年增為正）改依「離 52 週高點多近」取前 20 檔。
    combo = []
    lo, hi = TIERS[1][1], TIERS[1][2]

    def ew_s(t):
        mem = members(t, lo, hi)
        return {k: 1.0 / len(mem) for k in mem} if mem else {CASH: 1.0}

    def s_pick(order_key):
        def tg(t):
            mem = members(t, lo, hi)
            if not mem:
                return {CASH: 1.0}
            ms, sig = set(mem), X.rev.get(t, {})
            cand = [k for k in sig if k in ms]
            if order_key == "yoy":
                cand.sort(key=lambda k: -sig[k])
            else:
                h = score("H52", t)
                cand = [k for k in cand if np.isfinite(h[k])]
                cand.sort(key=lambda k: -h[k])
            return P.slots(cand[:TOPN], ew_s(t), TOPN)
        return tg
    r_c = [t for t in rd if t + 1 < book.T]
    nav_s, st_c, _ = P.simulate(book, r_c, s_pick("yoy"))
    nav_c, _, turns_c = P.simulate(book, r_c, s_pick("h52"))
    b_c, _, _ = P.simulate(book, r_c, ew_s)
    for key, nav in (("S", nav_s), ("S×H52", nav_c)):
        s_, sb_ = P.stats(nav, lab.dates, st_c), P.stats(b_c, lab.dates, st_c)
        e = P.excess_t(nav, b_c, r_c)
        combo.append({"key": key, "cagr": s_["cagr"], "base": sb_["cagr"], "excess": round(s_["cagr"] - sb_["cagr"], 1),
                      "t": e["t"], "t_halves": e["t_halves"], "mdd": s_["mdd"], "period": s_["period"]})
    d = P.excess_t(nav_c, nav_s, r_c)
    combo.append({"key": "S×H52 − S", "excess": round(combo[1]["cagr"] - combo[0]["cagr"], 1),
                  "t": d["t"], "t_halves": d["t_halves"],
                  "verdict": ("比 S 本身更好（前後半都成立）" if (d["t"] or 0) > 2 and all((x or 0) > 0 for x in d["t_halves"])
                              else "沒有比 S 本身明顯更好")})
    # 獲利品質條件（事先固定門檻；只在資產負債表涵蓋的期間比較，所以期間短、檢定力低）：
    #   Q-ROE  只留近四季 ROE ≥ 8% 的候選   Q-DEBT  只留負債比 ≤ 60%   Q-GPA  只留毛利÷資產 在候選中前一半
    qs = quality_scores(lab, rd)
    quality = []
    r_q = [t for t in rd if t in qs and t + 1 < book.T]
    if len(r_q) >= 24:
        def s_filt(fn):
            def tg(t):
                mem = members(t, lo, hi)
                if not mem:
                    return {CASH: 1.0}
                ms, sig, q = set(mem), X.rev.get(t, {}), qs.get(t, {})
                cand = sorted((k for k in sig if k in ms), key=lambda k: -sig[k])
                return P.slots(fn(cand, q)[:TOPN], ew_s(t), TOPN)
            return tg

        def gpa_top(cand, q):
            v = [q[k][2] for k in cand if k in q and q[k][2] is not None]
            med = float(np.median(v)) if v else None
            return [k for k in cand if med is not None and k in q and q[k][2] is not None and q[k][2] >= med]
        variants = [("Q-ROE", "只留近四季 ROE ≥ 8%", lambda c, q: [k for k in c if k in q and q[k][0] is not None and q[k][0] >= 0.08]),
                    ("Q-DEBT", "只留負債比 ≤ 60%", lambda c, q: [k for k in c if k in q and q[k][1] is not None and q[k][1] <= 0.6]),
                    ("Q-GPA", "只留毛利÷資產在候選中前一半", gpa_top)]
        nav_s2, st_q, _ = P.simulate(book, r_q, s_pick("yoy"))
        b_q, _, _ = P.simulate(book, r_q, ew_s)
        s0 = P.stats(nav_s2, lab.dates, st_q)
        quality.append({"key": "S", "name": "S（不加條件）", "cagr": s0["cagr"], "mdd": s0["mdd"], "period": s0["period"],
                        "base": P.stats(b_q, lab.dates, st_q)["cagr"]})
        for key, name, fn in variants:
            nav_v, _, _ = P.simulate(book, r_q, s_filt(fn))
            sv = P.stats(nav_v, lab.dates, st_q)
            d = P.excess_t(nav_v, nav_s2, r_q)
            quality.append({"key": key, "name": name, "cagr": sv["cagr"], "mdd": sv["mdd"],
                            "diff": round(sv["cagr"] - s0["cagr"], 1), "t": d["t"], "t_halves": d["t_halves"],
                            "p": round(float(1 - norm.cdf(d["t"] or 0)), 4), "months": len(r_q)})
        for q in quality[1:]:                     # 三個條件一起做 Bonferroni 校正
            ok = q["p"] < 0.05 / 3 and all((x or 0) > 0 for x in q["t_halves"])
            q["verdict"] = ("比 S 本身更好（通過校正）" if ok else "有跡象（未通過校正）" if (q["t"] or 0) > 2
                            else "比 S 本身差" if (q["t"] or 0) < -2 else "跟 S 本身沒有明顯差別")
    for r in rows:
        if r["significant"]:
            r["verdict"] = "照論文方向成立（通過校正）" if r["expect"] > 0 else "照論文方向成立：應該避開"
        elif (r["t"] or 0) * r["expect"] > 2:
            r["verdict"] = "有跡象（未通過校正）"
        elif (r["t"] or 0) * r["expect"] < -2:
            r["verdict"] = "跟論文相反"
        else:
            r["verdict"] = "在我們的資料裡不明顯"
    doc = {"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
           "m": m, "topn": TOPN, "tests": rows, "gp_available": bool(gp), "combo": combo, "quality": quality}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"文獻檢驗：{len(rows)} 個（校正門檻 p < 0.05/{m}）{'' if gp else '；毛利÷資產等資產負債表補齊後才做'}")
    for r in rows:
        print(f"  {r['tier']} {r['key']:<5} {r['name']:<6} 年化 {r['cagr']:6.1f}%（同組 {r['base']}%）超額 {r['excess']:+.1f} t={r['t']} 前後半 {r['t_halves']} → {r['verdict']}")
    print("獲利品質條件（S 的候選再過濾）：")
    for q in quality:
        print("  ", q)
    print("組合（中小型）：")
    for c in combo:
        print("  ", c)


if __name__ == "__main__":
    main()
