#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
壓力測試：唯一通過校正的做法——「中小型（近 60 日成交值第 151–400 名）＋營收創 12 個月新高、依年增率取前 20 檔」——
放進真實世界的摩擦裡，看它是真的，還是回測運氣。

判定標準在看到結果「之前」寫死（不准事後改門檻）：
  C1 成本    每邊再加 0.5% 滑價（中小型股買賣價差＋衝擊），超額仍 > 0 且 t > 2
  C2 穩定    預設參數前後兩半的 t 都 > 2
  C3 參數    參數格點（分組邊界 × 檔數 × 創高回溯月數 × 調整日延後）中 ≥ 80% 超額 > 0，
             且超額中位數 ≥ 預設參數超額的一半（不是只有剛好這組參數有效）
  C4 安慰劑  同一組裡每月隨機抽 20 檔、重複 300 次；年化高過本策略的比例 < 1%
  C5 執行    改成隔日「收盤」成交、或延後 5 個交易日才進場，超額仍 > 0
  C6 容量    總資金 300 萬元（每檔 15 萬）時，≥ 90% 的持股部位不超過該股近 60 日平均日成交值的 10%
  C7 前瞻    前瞻紀錄（事前寫死的選股）滿 6 個月且累計贏同組平均——這條回測無法代替，只能等

C1–C6 全過：回測層面站得住，可以小額實測；C7 也過了，才算「有理由相信會賺錢」。任何一條沒過就照實寫。
這是統計檢驗，不是投資建議。

輸出：twflow/web/data/stress.json
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import portfolio_lab as P        # noqa: E402

OUT = os.path.join(P.REPO, "twflow", "web", "data", "stress.json")
LO, HI, TOPN, LOOK = 150, 400, 20, 12
N_PLACEBO = 300


def rev_signal(lab, revenue, rdays, look=12, need_yoy=True):
    """{t: {k: 年增率}}：上個月營收創 look 個月新高（且年增為正）。look=12 與 portfolio_lab.revenue_signal 相同。"""
    months = sorted(revenue)
    kpos = {c: k for k, c in enumerate(lab.codes)}
    out = {}
    for t in rdays:
        d = lab.dates[t]
        y, m = int(d[:4]), int(d[5:7])
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
        cur = f"{y}-{m:02d}"
        if cur not in revenue:
            continue
        i = months.index(cur)
        prev = months[max(0, i - look):i]
        if len(prev) < look:
            continue
        sig = {}
        for c, (a, b) in revenue[cur].items():
            k = kpos.get(c)
            if k is None or a is None or not b or b <= 0:
                continue
            hist = [revenue[p][c][0] for p in prev if c in revenue[p] and revenue[p][c][0] is not None]
            if len(hist) >= look * 0.8 and a > max(hist) and (a > b or not need_yoy):
                sig[k] = a / b - 1
        out[t] = sig
    return out


def main():
    X = P.prepare()
    lab, book, C, DV, rdays, trend = X.lab, X.book, X.C, X.DV, X.rdays, X.trend
    CASH, B = book.CASH, book.B
    sig = {LOOK: X.rev}
    for L in (6, 24):
        sig[L] = rev_signal(lab, X.revenue, rdays, look=L)
    t0 = min(t for t, v in X.rev.items() if v)
    rd = [t for t in rdays if t >= t0]

    rank_cache = {}

    def members(t, lo=LO, hi=HI):
        if t not in rank_cache:
            d = DV[:, t]
            ok = np.where(np.isfinite(d) & np.isfinite(C[:, t]))[0]
            order = ok[np.argsort(-d[ok])]
            rank_cache[t] = order               # 與 portfolio_lab 相同：先依成交值排名，再剔除流動性不足的
        d = DV[:, t]
        return [k for k in rank_cache[t][lo:hi] if d[k] >= P.MIN_DV]

    def strat(lo=LO, hi=HI, n=TOPN, look=LOOK, lag=0, filt=False, sel_fn=None):
        """回傳 (目標權重函式, 基準函式)；lag＝決定後延後幾個交易日才成交（調整日也跟著平移）。"""
        def target(t):
            td = t - lag
            mem = members(td, lo, hi)
            if not mem:
                return {CASH: 1.0}
            ew = {k: 1.0 / len(mem) for k in mem}
            if filt and not trend.get(td, True):
                return {CASH: 1.0}
            s = sig[look].get(td, {})
            ms = set(mem)
            cand = sorted(((k, v) for k, v in s.items() if k in ms), key=lambda x: -x[1])
            sel = sel_fn(td, [k for k, _ in cand], mem) if sel_fn else [k for k, _ in cand[:n]]
            return P.slots(sel, ew, n)

        def base(t):
            mem = members(t - lag, lo, hi)
            return {k: 1.0 / len(mem) for k in mem} if mem else {CASH: 1.0}
        return target, base

    def run(lo=LO, hi=HI, n=TOPN, look=LOOK, lag=0, filt=False, slip=0.0, every=1, bk=None, sel_fn=None):
        bk = bk or book
        r = [t + lag for t in rd if t + lag + 1 < book.T][::every]
        tg, bs = strat(lo, hi, n, look, lag, filt, sel_fn)
        nav, start, turns = P.simulate(bk, r, tg, slip)
        base, _, _ = P.simulate(bk, r, bs)
        s, sb = P.stats(nav, lab.dates, start), P.stats(base, lab.dates, start)
        if not s or not sb:
            return None
        e = P.excess_t(nav, base, r)
        return {"cagr": s["cagr"], "base": sb["cagr"], "excess": round(s["cagr"] - sb["cagr"], 1), "t": e["t"],
                "t_halves": e["t_halves"], "mdd": s["mdd"], "base_mdd": sb["mdd"], "years": s["years"],
                "base_years": sb["years"], "turnover": round(float(np.mean(turns)) * 12 * 100 / every),
                "period": s["period"]}

    out = {}
    D = run()
    out["default"] = D
    print(f"預設：年化 {D['cagr']}%（同組 {D['base']}%）超額 {D['excess']} t={D['t']} 前後半 {D['t_halves']} 回撤 {D['mdd']}%")

    # 多元配置：長線核心（0050 長抱）＋中線衛星（本做法），看合起來的報酬與回撤
    r0 = [t for t in rd if t + 1 < book.T]
    b0, st0, _ = P.simulate(book, r0, lambda t: {B: 1.0})
    sb0 = P.stats(b0, lab.dates, st0)
    tg_s, _ = strat()
    combo = {"0050 長抱": {k: sb0[k] for k in ("cagr", "mdd", "vol", "years")}}
    for w in (0.7, 0.5, 0.0):
        fn = (lambda t, w=w: {k: v * (1 - w) for k, v in tg_s(t).items()} | {B: w + (1 - w) * tg_s(t).get(B, 0)})
        nav, st_, _ = P.simulate(book, r0, fn)
        s_ = P.stats(nav, lab.dates, st_)
        combo[f"{int(w * 100)}% 0050＋{int((1 - w) * 100)}% 本做法" if w else "100% 本做法"] = {k: s_[k] for k in ("cagr", "mdd", "vol", "years")}
    out["combo"] = combo

    # C1 成本
    out["slip"] = {f"{s * 100:.1f}": run(slip=s) for s in (0.002, 0.005, 0.01)}
    # C5 執行：隔日收盤成交、延後進場
    bk_close = P.Book.__new__(P.Book)
    bk_close.__dict__.update(book.__dict__)
    bk_close.O = book.C
    out["exec"] = {"隔日收盤成交": run(bk=bk_close), "延後 2 天": run(lag=2), "延後 5 天": run(lag=5), "延後 10 天": run(lag=10)}
    # 持有更久（降低換手）、大盤濾網
    # 資料品質：漲跌幅限制 ±10%，還原後單日超過 10.5%（上市頭 5 天除外）多半是減資／參考價沒還原到——
    # 把這些跳動抹平（之後價格同比例縮回）再跑一次，確認報酬不是靠假跳動
    Cb = book.C
    with np.errstate(invalid="ignore", divide="ignore"):
        rr = Cb[:-2, 1:] / Cb[:-2, :-1] - 1
    first = np.argmax(np.isfinite(lab.C), axis=1)
    jm = np.isfinite(rr) & (np.abs(rr) > 0.105)
    for i in range(jm.shape[0]):
        jm[i, :first[i] + 5] = False
    bk_clean = P.Book.__new__(P.Book)
    bk_clean.__dict__.update(book.__dict__)
    bk_clean.C, bk_clean.O = book.C.copy(), book.O.copy()
    for i, t in np.argwhere(jm):
        f = 1 + rr[i, t]
        bk_clean.C[i, t + 1:] /= f
        bk_clean.O[i, t + 1:] /= f
    out["clean"] = {"events": int(jm.sum()), "result": run(bk=bk_clean)}
    out["hold"] = {"每 2 個月調整": run(every=2), "每 3 個月調整": run(every=3)}
    out["filter"] = run(filt=True)
    # C3 參數格點
    grid = []
    for lo, hi in ((100, 300), (150, 400), (200, 500), (150, 600), (300, 800)):
        for n in (10, 20, 30):
            for look in (6, 12, 24):
                for lag in (0, 3):
                    r = run(lo, hi, n, look, lag)
                    if r:
                        grid.append({"lo": lo, "hi": hi, "n": n, "look": look, "lag": lag,
                                     "excess": r["excess"], "t": r["t"], "cagr": r["cagr"]})
    out["grid"] = grid
    # 流動性：只取組內成交值較高的一半，效果還在嗎？（排除「只是買到冷門股的流動性溢酬」）
    def liquid_half(t, ranked, mem):
        half = set(mem[:len(mem) // 2])
        return [k for k in ranked if k in half][:TOPN]

    def illiquid_half(t, ranked, mem):
        half = set(mem[len(mem) // 2:])
        return [k for k in ranked if k in half][:TOPN]
    out["liquidity"] = {"組內成交值較高的一半": run(sel_fn=liquid_half), "組內成交值較低的一半": run(sel_fn=illiquid_half)}
    # 排序方式：不依年增率排序，所有訊號等權（排除「排序方式剛好選對」）
    out["all_signals"] = run(n=60)

    # C4 安慰劑：每月在同一組隨機抽 20 檔
    rng = np.random.default_rng(20261006)
    pl = []
    for _ in range(N_PLACEBO):
        seeds = {t: int(rng.integers(1 << 31)) for t in rd}

        def rnd(t, ranked, mem, seeds=seeds):
            g = np.random.default_rng(seeds[t])
            return list(g.choice(mem, size=min(TOPN, len(mem)), replace=False))
        r = run(sel_fn=rnd)
        if r:
            pl.append(r["cagr"])
    pl = np.array(pl)
    out["placebo"] = {"n": len(pl), "p": round(float((pl >= D["cagr"]).mean()), 4), "median": round(float(np.median(pl)), 1),
                      "p95": round(float(np.percentile(pl, 95)), 1), "max": round(float(pl.max()), 1)}

    # C6 容量：每檔部位 ÷ 該股近 60 日平均日成交值
    tg, _ = strat()
    ratios = {}
    for cap in (1e6, 3e6, 1e7, 3e7):
        pos = cap / TOPN
        rs = []
        for t in rd:
            for k, w in tg(t).items():
                if k not in (B, CASH) and w >= 1 / TOPN - 1e-9 and np.isfinite(DV[k, t]):
                    rs.append(pos / DV[k, t])
        rs = np.array(rs)
        ratios[f"{int(cap / 1e4)}萬"] = {"ok10": round(float((rs <= 0.10).mean() * 100), 1),
                                         "ok5": round(float((rs <= 0.05).mean() * 100), 1),
                                         "median": round(float(np.median(rs) * 100), 2)}
    out["capacity"] = ratios
    dvs = [DV[k, t] for t in rd for k, w in tg(t).items() if k not in (B, CASH) and w >= 1 / TOPN - 1e-9]
    out["pick_dv_median"] = round(float(np.nanmedian(dvs)) / 1e6, 1)

    # 前瞻紀錄（C7）
    fw = os.path.join(P.REPO, "twflow", "web", "data", "forward.json")
    fmonths, fs, fb = 0, 1.0, 1.0
    if os.path.exists(fw):
        for p in json.load(open(fw, encoding="utf-8")).get("periods", []):
            if p.get("done") and p.get("S") is not None and p.get("S_base") is not None:
                fmonths += 1
                fs *= 1 + p["S"] / 100
                fb *= 1 + p["S_base"] / 100
    fwd_ok = None if fmonths < 6 else fs > fb

    s5 = out["slip"]["0.5"]
    ex = np.array([g["excess"] for g in grid])
    crit = [
        {"id": "C1", "name": "成本：每邊多 0.5% 滑價", "pass": bool(s5 and s5["excess"] > 0 and (s5["t"] or 0) > 2),
         "detail": f"超額 {s5['excess']:+.1f}%，t={s5['t']}" if s5 else "—"},
        {"id": "C2", "name": "穩定：前後兩半 t 都 > 2", "pass": bool(all((x or 0) > 2 for x in D["t_halves"])),
         "detail": f"前半 t={D['t_halves'][0]}、後半 t={D['t_halves'][1]}"},
        {"id": "C3", "name": "參數：≥80% 組合超額為正、中位數 ≥ 預設一半",
         "pass": bool(len(ex) and (ex > 0).mean() >= 0.8 and np.median(ex) >= D["excess"] / 2),
         "detail": f"{len(ex)} 組中 {(ex > 0).mean() * 100:.0f}% 為正，中位數 {np.median(ex):+.1f}%（預設 {D['excess']:+.1f}%）"},
        {"id": "C4", "name": "安慰劑：隨機選股勝過策略 < 1%", "pass": bool(out["placebo"]["p"] < 0.01),
         "detail": f"{out['placebo']['n']} 次隨機抽樣，年化中位數 {out['placebo']['median']}%、最高 {out['placebo']['max']}%，勝過策略的比例 {out['placebo']['p'] * 100:.1f}%"},
        {"id": "C5", "name": "執行：隔日收盤成交、延後 5 天仍有超額",
         "pass": bool(all(v and v["excess"] > 0 for k, v in out["exec"].items() if k in ("隔日收盤成交", "延後 5 天"))),
         "detail": "；".join(f"{k} {v['excess']:+.1f}%" for k, v in out["exec"].items() if v)},
        {"id": "C6", "name": "容量：300 萬資金時 ≥90% 部位 ≤ 日成交值 10%", "pass": bool(ratios["300萬"]["ok10"] >= 90),
         "detail": f"{ratios['300萬']['ok10']}% 的部位符合；持股日均成交值中位數 {out['pick_dv_median']} 百萬元"},
        {"id": "C7", "name": "前瞻：事前寫死的選股滿 6 個月且贏同組", "pass": fwd_ok,
         "detail": (f"已完成 {fmonths} 個月：策略 {(fs - 1) * 100:+.1f}%、同組平均 {(fb - 1) * 100:+.1f}%" if fmonths else "第一期 2026-10 才開始記錄")
                   + ("" if fmonths >= 6 else "；需要 6 個月——只能等，回測無法代替")},
    ]
    out["criteria"] = crit
    npass = sum(1 for c in crit[:6] if c["pass"])
    out["verdict"] = ("七項全部通過：回測與事前寫死的實測都站得住" if npass == 6 and fwd_ok
                      else "回測六項全部通過，但前瞻實測沒有贏：回測的優勢可能已經消失" if npass == 6 and fwd_ok is False
                      else "回測六項全部通過：可以小額實測，等前瞻紀錄滿 6 個月再下結論" if npass == 6
                      else f"回測 6 項中通過 {npass} 項：還不夠，見未通過項目")
    out["forward"] = {"months": fmonths, "strategy": round((fs - 1) * 100, 2), "base": round((fb - 1) * 100, 2)}
    out["generated_at"] = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    out["rule"] = {"tier": [LO + 1, HI], "topn": TOPN, "look": LOOK, "min_dv": P.MIN_DV}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print("多元配置：", {k: (v["cagr"], v["mdd"]) for k, v in combo.items()})
    print("滑價：", {k: (v["excess"], v["t"]) for k, v in out["slip"].items() if v})
    print("執行：", {k: (v["excess"], v["t"]) for k, v in out["exec"].items() if v})
    print("抹平疑似未還原跳動：", out["clean"]["events"], "筆 →", out["clean"]["result"] and (out["clean"]["result"]["excess"], out["clean"]["result"]["t"]))
    print("持有：", {k: (v["excess"], v["t"], v["turnover"]) for k, v in out["hold"].items() if v})
    print("大盤濾網：", out["filter"] and (out["filter"]["excess"], out["filter"]["t"], out["filter"]["mdd"]))
    print("流動性：", {k: (v["excess"], v["t"]) for k, v in out["liquidity"].items() if v})
    print("全部訊號等權：", out["all_signals"] and (out["all_signals"]["excess"], out["all_signals"]["t"]))
    print("安慰劑：", out["placebo"])
    print("容量：", ratios, "持股日均成交值中位數（百萬）", out["pick_dv_median"])
    print(f"參數格點 {len(grid)} 組：超額為正 {(ex > 0).mean() * 100:.0f}%，中位數 {np.median(ex):+.1f}，最差 {ex.min():+.1f}")
    for g in sorted(grid, key=lambda g: g["excess"])[:5]:
        print("   最差：", g)
    print("各年（策略／同組）：", {y: (D["years"][y], D["base_years"].get(y)) for y in D["years"]})
    for c in crit:
        print(f"  {c['id']} {'✅' if c['pass'] else ('⏳' if c['pass'] is None else '❌')} {c['name']}：{c['detail']}")
    print("結論：", out["verdict"])


if __name__ == "__main__":
    main()
