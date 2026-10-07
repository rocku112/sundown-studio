#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新資料檢驗：把新增的官方資料來源做成「事先寫死」的檢驗。資料還在累積的項目會標「資料累積中」，不硬算。

事件型（公布當天收盤後得知 → 隔天開盤進、持有 h 天收盤出；相對同日股票池平均；以月彙總做 t 檢定）：
  P5 / P20  處置股公布後 5／20 天表現較差（市場說法：處置＝過熱，之後回落）           預期方向：負
  N5 / N20  注意股公布後 5／20 天表現較差                                             預期方向：負
  B20       董事會決議買回庫藏股後 20 天表現較好（Ikenberry, Lakonishok & Vermaelen,
            JFE 1995；台灣亦有多篇實證）                                               預期方向：正
  L5        借券賣出餘額 5 個交易日增加超過 50% 且至少 500 張後 5 天表現較差
            （放空者較有資訊：Boehmer, Jones & Zhang, JF 2008）                       預期方向：負
  校正：Holm（以實際有資料的檢驗數計）；前後半段都要同方向。至少 12 個月有事件才算。

總經擇時（景氣對策信號，國發會；每月約 27 日公布上個月 → 我們的調整日（每月 10 日後）只能用到「前兩個月」的燈號）：
  G1  「藍燈買、紅燈賣」：已知燈號 ≤16 分（藍燈）時買進 0050，≥38 分（紅燈）時賣出持現金，其餘維持原狀
  G2  「景氣好才持有」：已知燈號 ≥23 分（綠燈以上）才持有 0050，否則現金
  都跟 0050 長抱比；十年內藍燈、紅燈各只出現少數幾次，統計檢定力很低，照實標示。

輸出：twflow/web/data/extra_lab.json
這是統計檢驗，不是投資建議。
"""

import glob
import gzip
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.stats import norm

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import portfolio_lab as P        # noqa: E402

EXTRA = os.path.join(P.ROOT, "data", "extra")
OUT = os.path.join(P.REPO, "twflow", "web", "data", "extra_lab.json")
MIN_MONTHS = 12


def load(path):
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def roc(s):
    m = re.search(r"(\d{2,4})[/\-.年]?(\d{2})[/\-.月]?(\d{2})", str(s))
    if not m:
        return ""
    y = int(m.group(1))
    return f"{y + 1911 if y < 1000 else y}-{m.group(2)}-{m.group(3)}"


def hist_events(kind, code_key="代號", date_key=("公布日期", "日期")):
    """punish_hist／notice_hist：[(代號, 日期)]"""
    ev = set()
    for p in sorted(glob.glob(os.path.join(EXTRA, f"{kind}_hist", "*.json.gz"))):
        for ym, blk in load(p).items():
            f = blk.get("fields") or []
            ci = next((i for i, x in enumerate(f) if code_key in x), None)
            di = next((i for k in date_key for i, x in enumerate(f) if k in x), None)
            if ci is None or di is None:
                continue
            for r in blk.get("data") or []:
                d = roc(r[di])
                if d:
                    ev.add((str(r[ci]).strip(), d))
    return sorted(ev)


def buyback_events():
    ev = set()
    for p in sorted(glob.glob(os.path.join(EXTRA, "buyback_hist", "*.json.gz"))):
        for ym, blk in load(p).items():
            head = blk.get("head") or []
            ci = next((i for i, h in enumerate(head) if "代號" in h), None)
            di = next((i for i, h in enumerate(head) if "決議" in h and "日" in h), None)
            if ci is None or di is None:
                continue
            for r in blk.get("rows") or []:
                row = r[1:]
                if max(ci, di) < len(row):
                    d = roc(row[di])
                    if d:
                        ev.add((row[ci].strip(), d))
    return sorted(ev)


def sbl_matrix(lab):
    """TWT93U 每日借券賣出餘額 → N×T 矩陣（股）。"""
    kpos = {c: k for k, c in enumerate(lab.codes)}
    tpos = {d: t for t, d in enumerate(lab.dates)}
    S = np.full(lab.C.shape, np.nan)
    days = 0
    for p in sorted(glob.glob(os.path.join(EXTRA, "sbl_hist", "*.json.gz"))):
        for d, rows in load(p).items():
            t = tpos.get(d)
            if t is None or not rows:
                continue
            days += 1
            for c, v in rows.items():
                k = kpos.get(c)
                if k is not None and len(v) > 3 and v[3] is not None:
                    S[k, t] = v[3]
    return S, days


def event_test(lab, events, h, sign):
    """回傳 (月彙總超額 list, 事件數, 期間)；events: [(代號, 日期)]"""
    kpos = {c: k for k, c in enumerate(lab.codes)}
    dates = lab.dates
    R, mu = lab.R[h], lab.mu[h]
    by_m, n = {}, 0
    for c, d in events:
        k = kpos.get(c)
        if k is None:
            continue
        t = int(np.searchsorted(dates, d))         # 公布日（非交易日則下一個交易日）收盤後得知
        if t >= len(dates) or not lab.E[k, t] or not np.isfinite(R[k, t]):
            continue
        by_m.setdefault(dates[t][:7], []).append((R[k, t] - mu[t]) * sign)
        n += 1
    months = sorted(by_m)
    return [float(np.mean(by_m[m])) for m in months], n, months


def tstat(x):
    x = np.asarray(x, float)
    if len(x) < 3 or x.std(ddof=1) == 0:
        return None
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x))))


def macro_tests(X):
    p = os.path.join(EXTRA, "ndc", "signal.json")
    if not os.path.exists(p):
        return [], None
    sig = load(p)
    lab, book, rdays = X.lab, X.book, X.rdays
    B, CASH = book.B, book.CASH

    def known(t):
        """調整日 t 當時已公布的最新燈號：t 所在月份往前兩個月。"""
        y, m = int(lab.dates[t][:4]), int(lab.dates[t][5:7]) - 2
        while m <= 0:
            y, m = y - 1, m + 12
        return sig.get(f"{y}-{m:02d}")
    rd = [t for t in rdays if known(t) is not None and t + 1 < book.T]
    if len(rd) < 24:
        return [], sig
    state = {"g1": None}

    def g1(t):
        s = known(t)
        if s <= 16:
            state["g1"] = True
        elif s >= 38:
            state["g1"] = False
        if state["g1"] is None:                  # 第一次出現藍燈或紅燈之前：持有（與長抱相同）
            return {B: 1.0}
        return {B: 1.0} if state["g1"] else {CASH: 1.0}

    def g2(t):
        return {B: 1.0} if known(t) >= 23 else {CASH: 1.0}
    base, st, _ = P.simulate(book, rd, lambda t: {B: 1.0})
    sb = P.stats(base, lab.dates, st)
    out = []
    for key, name, fn in (("G1", "藍燈買、紅燈賣", g1), ("G2", "綠燈以上才持有", g2)):
        state["g1"] = None
        nav, _, turns = P.simulate(book, rd, fn)
        s = P.stats(nav, lab.dates, st)
        e = P.excess_t(nav, base, rd)
        sw = sum(1 for x in turns[1:] if x >= 0.5)
        out.append({"key": key, "name": name, "cagr": s["cagr"], "mdd": s["mdd"], "base": sb["cagr"],
                    "base_mdd": sb["mdd"], "t": e["t"], "t_halves": e["t_halves"], "switches": sw,
                    "period": s["period"],
                    "verdict": ("比 0050 長抱好（前後半都成立）" if (e["t"] or 0) > 2 and all((x or 0) > 0 for x in e["t_halves"])
                                else "比 0050 長抱差" if (e["t"] or 0) < -2 else "跟 0050 長抱沒有明顯差別")})
    return out, sig


def main():
    X = P.prepare()
    lab = X.lab
    specs = []
    pun = hist_events("punish")
    noti = hist_events("notice")
    bb = buyback_events()
    S, sbl_days = sbl_matrix(lab)
    sbl_ev = []
    if sbl_days >= 120:
        with np.errstate(invalid="ignore", divide="ignore"):
            prev = np.full_like(S, np.nan)
            prev[:, 5:] = S[:, :-5]
            M = (S >= 500_000) & (S > prev * 1.5)
        for k, t in zip(*np.where(M)):
            sbl_ev.append((lab.codes[k], lab.dates[t]))
    specs = [
        ("P5", "處置股公布後 5 天", "處置＝過熱，之後較差", pun, 5, -1, "證交所公告（上市）"),
        ("P20", "處置股公布後 20 天", "處置＝過熱，之後較差", pun, 20, -1, "證交所公告（上市）"),
        ("N5", "注意股公布後 5 天", "注意＝過熱，之後較差", noti, 5, -1, "證交所公告（上市）"),
        ("N20", "注意股公布後 20 天", "注意＝過熱，之後較差", noti, 20, -1, "證交所公告（上市）"),
        ("B20", "庫藏股決議後 20 天", "公司買回自家股票，之後較好（Ikenberry 等 1995）", bb, 20, 1, "公開資訊觀測站"),
        ("L5", "借券賣出餘額 5 天大增後 5 天", "放空者有資訊，之後較差（Boehmer 等 2008）", sbl_ev, 5, -1,
         f"證交所 TWT93U（目前 {sbl_days} 個交易日）"),
    ]
    rows = []
    for key, name, claim, ev, h, sign, src in specs:
        x, n, months = event_test(lab, ev, h, sign)
        r = {"key": key, "name": name, "claim": claim, "hold": h, "sign": sign, "source": src,
             "events": n, "months": len(months), "period": [months[0], months[-1]] if months else None}
        if len(x) < MIN_MONTHS:
            r.update({"verdict": "資料累積中", "t": None})
        else:
            hh = len(x) // 2
            t = tstat(x)
            r.update({"excess": round(float(np.mean(x)) * 100 * sign, 2), "t": None if t is None else round(t * sign, 2),
                      "t_halves": [None if tstat(x[:hh]) is None else round(tstat(x[:hh]) * sign, 2),
                                   None if tstat(x[hh:]) is None else round(tstat(x[hh:]) * sign, 2)],
                      "p": None if t is None else round(1 - norm.cdf(t), 5)})
        rows.append(r)
    tested = sorted([r for r in rows if r.get("p") is not None], key=lambda r: r["p"])
    m = len(tested)
    alive = True
    for i, r in enumerate(tested):              # Holm
        ok = alive and r["p"] < 0.05 / (m - i) and all((v or 0) * r["sign"] > 0 for v in r["t_halves"])
        alive = alive and r["p"] < 0.05 / (m - i)
        tv = (r["t"] or 0) * r["sign"]
        r["verdict"] = ("照說法方向成立（通過校正）" if ok else "有跡象（未通過校正）" if tv > 2
                        else "跟說法相反" if tv < -2 else "在我們的資料裡不明顯")
    macro, sig = macro_tests(X)
    doc = {"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
           "m": m, "events": rows, "macro": macro,
           "ndc_latest": (lambda ks: [[k, sig[k]] for k in ks[-6:]])(sorted(sig)) if sig else None}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"新資料檢驗（校正檢驗數 {m}）：")
    for r in rows:
        print(f"  {r['key']:<4} {r['name']:<16} 事件 {r['events']}、{r['months']} 個月 超額 {r.get('excess')}% "
              f"t={r.get('t')} 前後半 {r.get('t_halves')} → {r['verdict']}")
    for r in macro:
        print(f"  {r['key']} {r['name']}：年化 {r['cagr']}%（0050 長抱 {r['base']}%）回撤 {r['mdd']}%（{r['base_mdd']}%）"
              f" t={r['t']} 前後半 {r['t_halves']} 切換 {r['switches']} 次 → {r['verdict']}")
    if not macro:
        print("  景氣燈號：尚無資料")


if __name__ == "__main__":
    main()
