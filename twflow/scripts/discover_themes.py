#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
題材板塊自動發掘。

官方產業鏈是「公司在做什麼生意」的分類，但市場資金是照「題材」在輪動的——
液冷散熱、矽光子與 CPO、玻璃基板、HBM 這些，官方分類裡一個節點都沒有
（見 data/diff_report.md：Tide 的 108 板塊有 54 個對不上任何官方節點）。

這支不靠人工列名單，改成從資料裡把題材找出來：

  1. 對「扣掉大盤的報酬」做階層式聚類（相關距離、average linkage）
  2. 每個群跟官方 537 葉節點比對重疊度
  3. 重疊低的群 ＝ 官方分類解釋不了的共同運動 ＝ 題材候選
  4. 樣本外驗證：訓練段找群、測試段量它還同不同步

為什麼可信：群是從報酬同步性長出來的，不是從我對產業的印象長出來的。
每個群都附測試段的統計檢定，站不住的當場就會被篩掉。

限制（一定要講）：
  · 這只能發現「已經一起動」的群，發現不了還沒發動的題材
  · 群沒有名字。命名仍是人的工作——這支只負責把「該被命名的東西」找出來，
    並列出成員讓人一眼看出是什麼題材
  · 59 天窗期偏短，短期事件（單一利多帶動的一日行情）可能被誤認成題材

用法：
  python scripts/discover_themes.py
  python scripts/discover_themes.py --max-dist 0.72 --min-size 4
"""

import argparse
import json
import os
import random

import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (build_returns, corr_of, jaccard, load, med_corr,
                    member_corr, null_dist, overlap)  # noqa: E402
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
REF = os.path.join(DATA, "reference")






def null_p95(C, size, n_all, rng, samples=300):
    out = []
    for _ in range(samples):
        m = med_corr(C, rng.sample(range(n_all), min(size, n_all)))
        if np.isfinite(m):
            out.append(m)
    return float(np.percentile(out, 95)) if out else 0.0




def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-dist", type=float, default=0.72,
                    help="階層樹切點；越小群越純越小")
    ap.add_argument("--min-size", type=int, default=4)
    ap.add_argument("--max-size", type=int, default=40)
    ap.add_argument("--novel-jaccard", type=float, default=0.30,
                    help="與官方節點重疊低於此值才算「新題材」")
    ap.add_argument("--min-coherence", type=float, default=0.60,
                    help="前兩大產業鏈需涵蓋的成員比例，用來濾掉跨鏈雜訊群")
    args = ap.parse_args()

    panel = load(os.path.join(DATA, "market", "panel.json"))
    leaves = load(os.path.join(DATA, "ic_leaves.json"))["leaves"]
    tide = load(os.path.join(REF, "tide_latest.json"))
    names = {c: v["name"] for c, v in panel["stocks"].items()}

    codes, R = build_returns(panel)
    pos = {c: i for i, c in enumerate(codes)}
    T, N = R.shape
    cut = T // 2
    print(f"報酬矩陣 {T} 日 × {N} 檔｜訓練 {cut} 日 → 測試 {T-cut} 日")

    Ctr, Cte = corr_of(R[:cut]), corr_of(R[cut:])

    # ── 聚類（只用訓練段）────────────────────────────────────────
    # 相關距離：完全同步 = 0，無關 = 1。average linkage 對離群成員比
    # single linkage 穩健（後者會把兩群用一條鏈接起來）。
    D = 1.0 - Ctr
    np.fill_diagonal(D, 0.0)
    D = (D + D.T) / 2                       # 強制對稱，避免浮點誤差讓 squareform 拒收
    np.clip(D, 0, 2, out=D)
    Z = linkage(squareform(D, checks=False), method="average")
    labels = fcluster(Z, t=args.max_dist, criterion="distance")

    clusters = {}
    for i, lb in enumerate(labels):
        clusters.setdefault(int(lb), []).append(i)
    clusters = {k: v for k, v in clusters.items()
                if args.min_size <= len(v) <= args.max_size}
    print(f"聚類得到 {len(clusters)} 個群（{args.min_size}–{args.max_size} 檔）")

    # ── 與官方節點、Tide 板塊比對 ────────────────────────────────
    ic_sets = [(lf["path"], {c for c in lf["stocks"] if c in pos}) for lf in leaves]
    tide_sets = [(s["name"], {c for c in s.get("stocks", []) if c in pos})
                 for s in tide["sectors"]]

    rng = random.Random(20260804)
    p95_cache = {}

    def p95(C, n, tag):
        k = (tag, n)
        if k not in p95_cache:
            p95_cache[k] = null_p95(C, n, N, rng)
        return p95_cache[k]

    # 個股 → 官方產業鏈（用來量群的「產業一致性」）
    stock_chains = {}
    for lf in leaves:
        chain = lf["path"].split("/")[0]
        for c in lf["stocks"]:
            stock_chains.setdefault(c, set()).add(chain)

    def chain_coherence(members):
        """前兩大產業鏈涵蓋多少比例的成員。

        為什麼需要這道閘：橫斷面去均值只移除了大盤，沒移除小型股/低流動性因子。
        一票不相干的小型股會因為共同的小型股特性而同步，通過統計檢定卻毫無意義
        （實測跑出「味王＋華固＋生華科＋全景軟體」這種群）。
        真題材的成員會集中在一兩條產業鏈裡——CPO 落在通信網路＋半導體，
        國防軍工落在太空衛星＋電機機械。散在七八條鏈的就是雜訊。
        """
        cnt = {}
        for c in members:
            for ch in stock_chains.get(c, ()):
                cnt[ch] = cnt.get(ch, 0) + 1
        if not cnt:
            return 0.0, []
        top = sorted(cnt.items(), key=lambda kv: -kv[1])[:2]
        return sum(v for _, v in top) / len(members), [k for k, _ in top]

    rows = []
    for lb, idx in clusters.items():
        members = {codes[i] for i in idx}
        ic_best = max(((jaccard(members, s), p) for p, s in ic_sets), default=(0, None))
        # Tide 比對改用重疊係數：我們的群通常比他的板塊小（是他的子集），
        # Jaccard 會被集合大小差距稀釋，明明抓到同一個題材卻顯示 0.15。
        td_best = max(((overlap(members, s), p) for p, s in tide_sets), default=(0, None))
        coh, top_chains = chain_coherence(members)
        m_tr = med_corr(Ctr, idx)
        m_te = med_corr(Cte, idx)
        rows.append({
            "n": len(idx),
            "train_corr": round(m_tr, 4),
            "test_corr": round(m_te, 4),
            "test_p95": round(p95(Cte, len(idx), "te"), 4),
            "survives": bool(m_te > p95(Cte, len(idx), "te")),
            "ic_jaccard": round(ic_best[0], 3), "ic_match": ic_best[1],
            "tide_overlap": round(td_best[0], 3), "tide_match": td_best[1],
            "coherence": round(coh, 3), "top_chains": top_chains,
            "novel": bool(ic_best[0] < args.novel_jaccard),
            "stocks": sorted(members),
            "members": [f"{c} {names.get(c,'')}" for c in sorted(members)],
        })

    survived = [r for r in rows if r["survives"]]
    coherent = [r for r in survived if r["coherence"] >= args.min_coherence]
    novel = [r for r in coherent if r["novel"]]
    novel.sort(key=lambda r: -(r["test_corr"] - r["test_p95"]))

    print(f"  樣本外存活（測試段 > 隨機 p95）：{len(survived)}/{len(rows)}")
    print(f"  再過產業一致性 ≥{args.min_coherence}：{len(coherent)}"
          f"（砍掉 {len(survived)-len(coherent)} 個跨鏈雜訊群）")
    print(f"  其中官方分類解釋不了的（新題材候選）：{len(novel)}")
    # 有多少撞上 Tide 已有的板塊——不是拿來抄，是確認我們找的方向對
    hit = sum(1 for r in novel if r["tide_overlap"] >= 0.40)
    print(f"  新題材候選中，Tide 也有相近板塊的：{hit}/{len(novel)}（方向驗證）")

    out = {
        "generated_from": panel["generated_at"],
        "params": vars(args),
        "n_clusters": len(rows),
        "n_survived": len(survived),
        "novel_themes": novel,
        "n_coherent": len(coherent),
        "all_clusters": sorted(rows, key=lambda r: -(r["test_corr"] - r["test_p95"])),
    }
    p = os.path.join(DATA, "discovered_themes.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"→ {p}")


if __name__ == "__main__":
    main()
