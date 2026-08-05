#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
剪枝的樣本外驗證。

為什麼一定要做：prune_sectors.py 用同一段期間「挑出高相關成員」再「量測相關性」，
這是自我實現的——不管資料多沒結構，只要挑得夠用力，樣本內數字一定漂亮。
唯一能回答「這個剪枝是不是學到真東西」的方法，是把期間切開：

    前段（訓練）決定要留誰 → 後段（測試）量它們還同不同步

若剪枝只是在擬合雜訊，測試段的內聚度不會比原始名單好。

用法：python scripts/validate_pruning.py
"""

import json
import os
import random

import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (build_returns, corr_of, jaccard, load, med_corr,
                    member_corr, null_dist, overlap)  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
REF = os.path.join(DATA, "reference")

MIN_SIZE = 4








def prune(C, idx, thr, min_size=MIN_SIZE):
    cur = list(idx)
    while len(cur) > min_size:
        mc = member_corr(C, cur)
        lo = int(np.argmin(mc))
        if mc[lo] >= thr:
            break
        cur.pop(lo)
    return cur


def main():
    panel = load(os.path.join(DATA, "market", "panel.json"))
    leaves = load(os.path.join(DATA, "ic_leaves.json"))["leaves"]
    tide = load(os.path.join(REF, "tide_latest.json"))

    codes, R = build_returns(panel)
    pos = {c: i for i, c in enumerate(codes)}
    T, N = R.shape
    cut = T // 2
    Rtr, Rte = R[:cut], R[cut:]
    print(f"報酬矩陣 {T} 日 × {N} 檔")
    print(f"訓練段 {Rtr.shape[0]} 日｜測試段 {Rte.shape[0]} 日\n")

    Ctr, Cte = corr_of(Rtr), corr_of(Rte)

    rng = random.Random(20260804)
    null_te = {}

    def sig_te(idx):
        """測試段是否顯著內聚（> 同尺寸隨機組 p95）"""
        n = len(idx)
        if n not in null_te:
            null_te[n] = float(np.percentile(null_dist(Cte, n, N, rng), 95))
        return med_corr(Cte, idx) > null_te[n], med_corr(Cte, idx)

    # ── 官方原始 vs 剪枝後（剪枝只看訓練段）─────────────────────────
    rows = []
    for lf in leaves:
        idx = [pos[c] for c in lf["stocks"] if c in pos]
        if len(idx) < MIN_SIZE:
            continue
        n = len(idx)
        if n not in null_te:
            null_te[n] = float(np.percentile(null_dist(Ctr, n, N, rng), 95))
        thr = null_te[n]
        kept = prune(Ctr, idx, thr)
        s_raw, m_raw = sig_te(idx)
        s_pru, m_pru = sig_te(kept)
        rows.append({
            "path": lf["path"], "leaf": lf["leaf"],
            "n_raw": n, "n_pruned": len(kept),
            "test_raw": m_raw, "test_pruned": m_pru,
            "sig_raw": s_raw, "sig_pruned": s_pru,
            "keep": [codes[i] for i in kept],
            "drop": [codes[i] for i in idx if i not in kept],
        })

    tide_rows = []
    for s in tide["sectors"]:
        idx = [pos[c] for c in s.get("stocks", []) if c in pos]
        if len(idx) < MIN_SIZE:
            continue
        sg, m = sig_te(idx)
        tide_rows.append({"name": s["name"], "n": len(idx), "test": m, "sig": sg})

    def rate(xs, key):
        return sum(1 for x in xs if x[key]) / len(xs) * 100 if xs else 0.0

    print("═══ 測試段（樣本外）顯著內聚比例 ═══\n")
    print(f"  Tide 手工 108 板塊      {rate(tide_rows,'sig'):5.1f}%   "
          f"(n={len(tide_rows)}, 中位相關 {np.median([x['test'] for x in tide_rows]):.3f})")
    print(f"  官方自報 原始名單        {rate(rows,'sig_raw'):5.1f}%   "
          f"(n={len(rows)}, 中位相關 {np.median([x['test_raw'] for x in rows]):.3f})")
    print(f"  官方自報 剪枝後          {rate(rows,'sig_pruned'):5.1f}%   "
          f"(n={len(rows)}, 中位相關 {np.median([x['test_pruned'] for x in rows]):.3f})")
    print()

    improved = sum(1 for r in rows if r["test_pruned"] > r["test_raw"])
    print(f"  剪枝後測試段相關提升的組：{improved}/{len(rows)} = {improved/len(rows)*100:.1f}%")
    rescued = sum(1 for r in rows if r["sig_pruned"] and not r["sig_raw"])
    broken = sum(1 for r in rows if r["sig_raw"] and not r["sig_pruned"])
    print(f"  原本不顯著、剪枝後顯著   ：{rescued}")
    print(f"  原本顯著、剪枝後不顯著   ：{broken}")
    avg_cut = np.mean([1 - r["n_pruned"] / r["n_raw"] for r in rows]) * 100
    print(f"  平均剪掉成員比例         ：{avg_cut:.1f}%")

    out = os.path.join(DATA, "pruning_validation.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({
            "train_days": int(Rtr.shape[0]), "test_days": int(Rte.shape[0]),
            "summary": {
                "tide_sig_pct": rate(tide_rows, "sig"),
                "ic_raw_sig_pct": rate(rows, "sig_raw"),
                "ic_pruned_sig_pct": rate(rows, "sig_pruned"),
                "improved": improved, "rescued": rescued, "broken": broken,
                "avg_cut_pct": float(avg_cut),
            },
            "groups": sorted(rows, key=lambda r: -(r["test_pruned"] - r["test_raw"])),
            "tide": sorted(tide_rows, key=lambda r: -r["test"]),
        }, f, ensure_ascii=False, indent=1)
    print(f"\n→ {out}")


if __name__ == "__main__":
    main()
