#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
這個產品到底有沒有用？——資金流訊號的預測力檢定。

我們一路驗證的是「分類品質」（成分股會不會一起動），但從沒驗證過更根本的
問題：**法人買賣超這個訊號，對未來報酬有沒有預測力？**
如果沒有，那這整個東西就是一個做工精美的儀表板，不是分析工具。
價值仍可能存在（省下自己彙整 1979 檔的時間），但不該用「跟著資金流看盤」
這種暗示有優勢的話術去賣。

方法：
  · 每個交易日 t，用「截至 t 為止」的訊號排序，看 t+1..t+N 的**超額報酬**
  · 超額 ＝ 減去當日橫斷面平均，否則測到的只是大盤 beta
  · 指標用 Spearman 等級相關（rank IC）：訊號排名與未來報酬排名的相關
  · 同時跑「隨機訊號」當對照組——樣本這麼小，必須知道純雜訊能跑出多少 IC

⚠️ 只有 60 個交易日，扣掉暖身與前瞻窗只剩約 35 個觀察日，而且 5 日窗重疊。
   任何結論都是「方向性參考」，不是統計證據。真正能下結論要一年以上。
"""

import json
import os

import numpy as np
from scipy.stats import spearmanr

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
WEB = os.path.join(ROOT, "web", "data")

WARMUP = 21          # 訊號要 20 日基準
FWD = 5              # 前瞻報酬天數
N_RANDOM = 200       # 隨機對照組次數


def arr(v, T):
    return np.array([np.nan if x is None else float(x) for x in v], dtype=float) \
        if v else np.full(T, np.nan)


def summarize(ics, label, rand_ics=None):
    ics = np.array([x for x in ics if np.isfinite(x)])
    if len(ics) < 5:
        print(f"  {label:<22} 樣本不足")
        return
    m, sd = ics.mean(), ics.std(ddof=1)
    t = m / (sd / np.sqrt(len(ics))) if sd > 1e-12 else 0.0
    hit = (ics > 0).mean() * 100
    extra = ""
    if rand_ics is not None and len(rand_ics):
        # ⚠️ 要比的是「同樣天數的平均 IC」，不是「單日 IC」。
        #    第一版拿單日隨機 |IC| 的 p95（0.171）去比 34 日的平均 IC（0.138），
        #    結論「未超過」是錯的——平均會把雜訊開根號縮小，兩個統計量的尺度差
        #    了 √n 倍。用單日 σ 推平均的 σ 才對。
        sr = np.std(rand_ics, ddof=1)
        se = sr / np.sqrt(len(ics))
        z = m / se if se > 1e-12 else 0.0
        extra = f"　vs 隨機 z={z:+.1f}"
    print(f"  {label:<22} IC={m:+.3f}  t={t:+.2f}  勝率={hit:.0f}%  n={len(ics)}{extra}")
    return m, t


def main():
    panel = load(os.path.join(DATA, "market", "panel.json"))
    latest = load(os.path.join(WEB, "latest.json"))
    dates = panel["dates"]
    S = panel["stocks"]
    T = len(dates)
    sectors = latest["sectors"]

    # ── 板塊逐日序列 ────────────────────────────────────────────
    flow, ret, absbase = {}, {}, {}
    for s in sectors:
        mem = [c for c in s["stocks"] if c in S]
        if len(mem) < 4:
            continue
        w = np.array([(s.get("weights") or {}).get(c, 1.0) for c in mem])
        f = np.nansum(np.vstack([arr(S[c]["net_yi"], T) for c in mem]) * w[:, None], axis=0)
        with np.errstate(invalid="ignore"):
            r = np.nanmean(np.vstack([arr(S[c]["chg"], T) for c in mem]), axis=0)
        flow[s["name"]] = f
        ret[s["name"]] = np.nan_to_num(r)
        absbase[s["name"]] = f
    names = sorted(flow)
    print(f"板塊 {len(names)} 個 × {T} 交易日｜前瞻 {FWD} 日｜"
          f"可用觀察日 {T - WARMUP - FWD}\n")

    rng = np.random.default_rng(20260804)
    days = range(WARMUP, T - FWD)

    def run(signal_fn, label, collect_rand=False):
        ics, rand = [], []
        for t in days:
            sig, fwd = [], []
            for n in names:
                v = signal_fn(n, t)
                if v is None or not np.isfinite(v):
                    continue
                fr = ret[n][t + 1:t + 1 + FWD].sum()
                if not np.isfinite(fr):
                    continue
                sig.append(v); fwd.append(fr)
            if len(sig) < 20:
                continue
            fwd = np.array(fwd) - np.mean(fwd)      # 超額：扣掉當日橫斷面平均
            ic = spearmanr(sig, fwd).statistic
            if np.isfinite(ic):
                ics.append(ic)
            if collect_rand:
                for _ in range(3):
                    rc = spearmanr(rng.permutation(len(sig)), fwd).statistic
                    if np.isfinite(rc):
                        rand.append(rc)
        return ics, np.array(rand)

    print("═══ 板塊層級：資金流能不能預測未來 5 日超額報酬 ═══")
    _, rand = run(lambda n, t: flow[n][t - 4:t + 1].sum(), "_", collect_rand=True)
    summarize(run(lambda n, t: flow[n][t - 4:t + 1].sum(), "")[0], "近5日淨額（億）", rand)
    summarize(run(lambda n, t: flow[n][t - 19:t + 1].sum(), "")[0], "近20日淨額（億）", rand)

    # normalize：除以自己的日均絕對進出量，讓大小板塊可比
    def norm5(n, t):
        base = np.nanmean(np.abs(absbase[n][t - 19:t + 1]))
        return flow[n][t - 4:t + 1].sum() / base if base > 1e-9 else None
    summarize(run(norm5, "")[0], "近5日淨額 / 常態", rand)

    def accel(n, t):
        return flow[n][t - 4:t + 1].sum() / 5 - flow[n][t - 19:t + 1].sum() / 20
    summarize(run(accel, "")[0], "加速度（泡泡Y軸）", rand)

    # ── 四象限 ────────────────────────────────────────────────
    print("\n═══ 四象限：漲潮 vs 退潮，未來 5 日超額報酬 ═══")
    buckets = {k: [] for k in ("漲潮", "輪動", "觀望", "退潮")}
    for t in days:
        rows = []
        for n in names:
            f5 = flow[n][t - 4:t + 1].sum()
            a = f5 / 5 - flow[n][t - 19:t + 1].sum() / 20
            fr = ret[n][t + 1:t + 1 + FWD].sum()
            if not np.isfinite(fr):
                continue
            q = ("漲潮" if a > 0 else "輪動") if f5 > 0 else ("觀望" if a > 0 else "退潮")
            rows.append((q, fr))
        if len(rows) < 20:
            continue
        mu = np.mean([r[1] for r in rows])
        for q, fr in rows:
            buckets[q].append(fr - mu)
    for q, v in buckets.items():
        v = np.array(v)
        if len(v) < 30:
            print(f"  {q:<6} 樣本不足"); continue
        t_ = v.mean() / (v.std(ddof=1) / np.sqrt(len(v)))
        print(f"  {q:<6} 平均超額 {v.mean():+.2f}%  t={t_:+.2f}  n={len(v)}")

    # ── 個股異常大買 ──────────────────────────────────────────
    print("\n═══ 個股：異常大買 / 大賣之後 5 日超額報酬 ═══")
    codes = [c for c, v in S.items() if np.isfinite(arr(v["close"], T)).any()]
    net = {c: arr(S[c]["net_yi"], T) for c in codes}
    chg = {c: np.nan_to_num(arr(S[c]["chg"], T)) for c in codes}
    res = {"異常大買": [], "異常大賣": []}
    for t in days:
        day = []
        for c in codes:
            base = np.nanmean(np.abs(net[c][t - 20:t]))
            n1 = net[c][t]
            if not np.isfinite(n1) or not np.isfinite(base):
                continue
            thr = max(2.5 * base, 0.3)
            fr = chg[c][t + 1:t + 1 + FWD].sum()
            day.append((c, n1, thr, fr))
        if len(day) < 200:
            continue
        mu = np.mean([d[3] for d in day])
        for c, n1, thr, fr in day:
            if abs(n1) > thr:
                res["異常大買" if n1 > 0 else "異常大賣"].append(fr - mu)
    for k, v in res.items():
        v = np.array(v)
        if len(v) < 30:
            print(f"  {k:<6} 樣本不足"); continue
        t_ = v.mean() / (v.std(ddof=1) / np.sqrt(len(v)))
        print(f"  {k:<6} 平均超額 {v.mean():+.2f}%  t={t_:+.2f}  n={len(v)}")

    # ── 對照組：改用 Tide 的分類重跑 ──────────────────────────────
    # 我們的板塊是用**整整 60 天（含前瞻期）**跑剪枝與聚類挑出來的，
    # 分類本身就用到了未來資訊。若訊號只在我們自己的分類上成立、
    # 換成外部分類就消失，那是選擇偏誤而不是真訊號。
    # Tide 的 108 板塊是別人獨立建的，正好當乾淨對照。
    tpath = os.path.join(DATA, "reference", "tide_latest.json")
    if os.path.exists(tpath):
        tide = load(tpath)
        tf, tr = {}, {}
        for sec in tide["sectors"]:
            mem = [c for c in sec.get("stocks", []) if c in S]
            if len(mem) < 4:
                continue
            tf[sec["name"]] = np.nansum(
                np.vstack([arr(S[c]["net_yi"], T) for c in mem]), axis=0)
            with np.errstate(invalid="ignore"):
                tr[sec["name"]] = np.nan_to_num(np.nanmean(
                    np.vstack([arr(S[c]["chg"], T) for c in mem]), axis=0))
        tnames = sorted(tf)
        ics = []
        for t in days:
            sig, fwd = [], []
            for n in tnames:
                v = tf[n][t - 4:t + 1].sum()
                fr = tr[n][t + 1:t + 1 + FWD].sum()
                if np.isfinite(v) and np.isfinite(fr):
                    sig.append(v)
                    fwd.append(fr)
            if len(sig) < 20:
                continue
            fwd = np.array(fwd) - np.mean(fwd)
            ic = spearmanr(sig, fwd).statistic
            if np.isfinite(ic):
                ics.append(ic)
        print(f"\n═══ 對照組：改用 Tide 的 {len(tnames)} 個板塊"
              f"（分類獨立於我們的資料）═══")
        summarize(ics, "近5日淨額（億）", rand)

    print("\n" + "─" * 66)
    print("讀法：|t| < 2 一律當作「與雜訊無法區分」。")
    print(f"本測試只有 {T - WARMUP - FWD} 個觀察日且 5 日窗重疊，")
    print("t 值本身已被高估。這是方向性參考，不是統計證據。")


if __name__ == "__main__":
    main()
