#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共用計算：報酬矩陣與相關係數。

抽出來的原因：這兩個函式原本在 prune_sectors / validate_pruning /
discover_themes 各有一份一模一樣的複本。只要有人改了其中一份的
「橫斷面去均值」或「有效日門檻」，剪枝與驗證就會用不同的尺量同一件事，
而且不會有任何錯誤訊息——就跟 build_sectors 分數不可比那個 bug 一樣。
"""

import json

import numpy as np


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def overlap(a, b):
    """重疊係數：交集 / 較小集合。集合大小差很多時比 Jaccard 有意義。"""
    return len(a & b) / min(len(a), len(b)) if (a and b) else 0.0


def jaccard(a, b):
    return len(a & b) / len(a | b) if (a and b) else 0.0


def build_returns(panel, min_valid=0.8):
    """
    panel → (codes, R)，R 是 T×N 的「已扣除大盤」日報酬矩陣。

    逐日橫斷面去均值：每天減掉當日全市場平均報酬。台股所有股票都跟大盤高度
    相關，不扣掉的話任何一組股票看起來都很內聚。不估 beta 是刻意的——beta 要
    更長的窗期才穩，橫斷面去均值不需要估任何參數。
    """
    T = len(panel["dates"])
    codes, cols = [], []
    for code, v in panel["stocks"].items():
        arr = np.array([np.nan if x is None else float(x) for x in v["chg"]],
                       dtype=float)
        # 第一天沒有前收，一律 nan，不算進有效率
        if np.isfinite(arr[1:]).sum() < (T - 1) * min_valid:
            continue
        # 全期不動（長期停牌、無量）→ 相關係數無定義
        if np.nanstd(arr[1:]) < 1e-9:
            continue
        codes.append(code)
        cols.append(arr)
    if not codes:
        return [], np.zeros((0, 0))

    R = np.vstack(cols).T
    with np.errstate(invalid="ignore"):
        has = np.isfinite(R).any(axis=1)
        dm = np.zeros((R.shape[0], 1))
        # 整列全 NaN 時 nanmean 會噴 warning 並回 NaN，那個 NaN 會汙染整列
        dm[has, 0] = np.nanmean(R[has], axis=1)
    R = np.where(np.isfinite(R - dm), R - dm, 0.0)
    return codes, R[1:]


def corr_of(R):
    """報酬矩陣 → 相關係數矩陣。"""
    X = R - R.mean(axis=0, keepdims=True)
    sd = X.std(axis=0, keepdims=True)
    sd[sd < 1e-12] = 1.0
    X = X / sd
    return np.clip((X.T @ X) / X.shape[0], -1.0, 1.0)


def med_corr(C, idx):
    """組內中位兩兩相關。"""
    if len(idx) < 2:
        return float("nan")
    sub = C[np.ix_(idx, idx)]
    n = len(idx)
    return float(np.median(sub[~np.eye(n, dtype=bool)]))


def member_corr(C, idx):
    """每個成員對組內其他成員的平均相關（leave-one-out）。"""
    sub = C[np.ix_(idx, idx)]
    n = len(idx)
    return (sub.sum(axis=1) - 1.0) / (n - 1)


def null_dist(C, size, n_all, rng, samples=300):
    """同尺寸隨機組的中位相關分布——判斷內聚度是不是「這個尺寸本來就會有」。"""
    out = []
    for _ in range(samples):
        m = med_corr(C, rng.sample(range(n_all), min(size, n_all)))
        if np.isfinite(m):
            out.append(m)
    return np.array(out) if out else np.array([0.0])
