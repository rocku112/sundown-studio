#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
候選池剪枝：用「同族群會一起動」這件事，把官方平台自報灌水的成員剔掉。

前提（也是板塊輪動這個產品的整個前提）：
    一個真板塊的成分股，報酬會同步；不同步的成員就不是這個板塊的。

三個必要的處理：

1) 先扣掉大盤
   台股所有股票都跟大盤高度相關，直接算報酬相關係數，任何一組股票看起來都很
   「內聚」。這裡用逐日橫斷面去均值（每天減掉當日全市場平均報酬），把市場因子
   移除，剩下的才是個股相對強弱。不估 beta 是刻意的——beta 要用更長的窗期才穩，
   而橫斷面去均值不需要估任何參數。

2) 要有虛無假設
   「中位相關 0.3」本身沒有意義，要問「同樣大小的隨機組合會是多少」。所以每個
   節點都跟同尺寸的隨機組做比較，回報百分位。這樣才分得出「真的內聚」與
   「這個尺寸本來就會這麼高」。

3) 剪枝要看得到理由
   每個被剔除的成員都記錄它與族群核心的相關係數，人工覆核時看得到憑據，
   不是黑箱。

用法：
  python scripts/prune_sectors.py
  python scripts/prune_sectors.py --min-size 4 --keep-quantile 0.35
"""

import argparse
import json
import os
import random

import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import build_returns, corr_of, load, med_corr, member_corr  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
REF = os.path.join(DATA, "reference")


def group_stats(C, idx):
    """(中位兩兩相關, 每個成員對其他成員的平均相關)"""
    if len(idx) < 2:
        return float("nan"), np.array([])
    return med_corr(C, idx), member_corr(C, idx)


def null_percentile(C, size, n_all, samples=200, rng=None):
    """同尺寸隨機組的中位相關分布——用來判斷「這個內聚度是不是本來就會有」。"""
    rng = rng or random.Random(20260804 + size)
    out = []
    for _ in range(samples):
        idx = rng.sample(range(n_all), size)
        m, _ = group_stats(C, idx)
        if np.isfinite(m):
            out.append(m)
    return np.array(out) if out else np.array([0.0])


def prune(C, idx, min_size, keep_q):
    """
    逐一剔除「對族群其他成員平均相關最低」的成員，直到：
      · 剩下的成員都達到門檻，或
      · 縮到 min_size

    門檻取「該尺寸隨機組中位相關」的分位數，不是寫死的絕對值——
    寫死的話小族群會全被砍光、大族群幾乎砍不掉。
    """
    cur = list(idx)
    dropped = []
    while len(cur) > min_size:
        med, member = group_stats(C, cur)
        if not np.isfinite(med):
            break
        lo = int(np.argmin(member))
        if member[lo] >= keep_q:
            break
        dropped.append((cur[lo], float(member[lo])))
        cur.pop(lo)
    return cur, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-size", type=int, default=4)
    ap.add_argument("--keep-quantile", type=float, default=0.0,
                    help="成員留下所需的最低『對族群平均相關』；0 表示用隨機基準自動決定")
    ap.add_argument("--samples", type=int, default=200)
    args = ap.parse_args()

    panel = load(os.path.join(DATA, "market", "panel.json"))
    leaves = load(os.path.join(DATA, "ic_leaves.json"))["leaves"]
    tide = load(os.path.join(REF, "tide_latest.json"))

    codes, R = build_returns(panel)
    pos = {c: i for i, c in enumerate(codes)}
    T, N = R.shape
    print(f"報酬矩陣 {T} 日 × {N} 檔（已扣除大盤）")

    C = corr_of(R)

    # 隨機基準（依尺寸查表，避免每個節點都重抽）
    rng = random.Random(20260804)
    null_cache = {}

    def null_for(size):
        if size not in null_cache:
            d = null_percentile(C, min(size, N), N, args.samples, rng)
            null_cache[size] = (float(d.mean()), float(np.percentile(d, 95)), d)
        return null_cache[size]

    def evaluate(name, members, path=""):
        idx = [pos[c] for c in members if c in pos]
        if len(idx) < 2:
            return None
        med, member = group_stats(C, idx)
        mu, p95, dist = null_for(len(idx))
        pctile = float((dist < med).mean() * 100)
        return {
            "name": name, "path": path, "n": len(idx),
            "median_corr": round(med, 4),
            "null_mean": round(mu, 4), "null_p95": round(p95, 4),
            "percentile": round(pctile, 1),
            "signal": round(med - mu, 4),
            "idx": idx, "member_corr": member,
        }

    # ── 1. Tide 的 108 板塊（基準：手工分類到底值多少）─────────────
    tide_res = []
    for s in tide["sectors"]:
        r = evaluate(s["name"], s.get("stocks", []))
        if r:
            tide_res.append(r)

    # ── 2. 官方 537 葉節點 ────────────────────────────────────────
    ic_res = []
    for lf in leaves:
        r = evaluate(lf["leaf"], lf["stocks"], lf["path"])
        if r:
            r["stocks"] = [c for c in lf["stocks"] if c in pos]
            ic_res.append(r)

    def summarize(rows, label):
        sig = np.array([r["signal"] for r in rows])
        med = np.array([r["median_corr"] for r in rows])
        beat = sum(1 for r in rows if r["median_corr"] > r["null_p95"])
        print(f"\n{label}：{len(rows)} 組")
        print(f"  中位相關   平均 {med.mean():.3f}  中位 {np.median(med):.3f}")
        print(f"  超越隨機   平均 {sig.mean():+.3f}")
        print(f"  顯著內聚（> 隨機 p95）：{beat}/{len(rows)} = {beat/len(rows)*100:.1f}%")
        return beat / len(rows)

    summarize(tide_res, "Tide 108 板塊（手工）")
    summarize(ic_res, "官方 537 葉節點（自報）")

    # ── 3. 剪枝 ──────────────────────────────────────────────────
    pruned = []
    for r in ic_res:
        mu, p95, _ = null_for(r["n"])
        thr = args.keep_quantile if args.keep_quantile > 0 else p95
        keep, dropped = prune(C, r["idx"], args.min_size, thr)
        if len(keep) < 2:
            continue
        med2, _ = group_stats(C, keep)
        mu2, p95_2, dist2 = null_for(len(keep))
        pruned.append({
            "path": r["path"], "leaf": r["name"],
            "n_before": r["n"], "n_after": len(keep),
            "corr_before": r["median_corr"], "corr_after": round(med2, 4),
            "null_p95_after": round(p95_2, 4),
            "significant": bool(med2 > p95_2),
            "keep": [codes[i] for i in keep],
            "drop": [{"code": codes[i], "corr": round(c, 4)} for i, c in dropped],
        })

    kept_sig = [p for p in pruned if p["significant"] and p["n_after"] >= args.min_size]
    print(f"\n剪枝後：{len(pruned)} 組可評估，"
          f"其中 {len(kept_sig)} 組達到顯著內聚（可直接當板塊用）")

    out = {
        "generated_from": panel["generated_at"],
        "window_days": T,
        "params": {"min_size": args.min_size, "samples": args.samples},
        "tide_benchmark": [
            {k: v for k, v in r.items() if k not in ("idx", "member_corr")}
            for r in sorted(tide_res, key=lambda x: -x["signal"])
        ],
        "ic_raw": [
            {k: v for k, v in r.items() if k not in ("idx", "member_corr", "stocks")}
            for r in sorted(ic_res, key=lambda x: -x["signal"])
        ],
        "pruned": sorted(pruned, key=lambda x: -(x["corr_after"] - x["null_p95_after"])),
    }
    p = os.path.join(DATA, "pruned_sectors.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"→ {p}")


if __name__ == "__main__":
    main()
