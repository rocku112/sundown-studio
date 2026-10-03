# -*- coding: utf-8 -*-
"""
技術指標（向量化，N 檔 × T 天矩陣，缺值為 NaN）。參數一律用台股看盤軟體的預設值，
不針對回測結果調整：RSI 14、KD 9-3-3、MACD 12-26-9、布林 20 日 ±2 倍標準差。
"""

import warnings

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as win


def sma(X, n):
    out = np.full_like(X, np.nan)
    if X.shape[1] >= n:
        out[:, n - 1:] = win(X, n, axis=1).mean(axis=-1)      # 視窗內有缺值即為 NaN
    return out


def rstd(X, n):
    out = np.full_like(X, np.nan)
    if X.shape[1] >= n:
        out[:, n - 1:] = win(X, n, axis=1).std(axis=-1)
    return out


def rmax(X, n):
    out = np.full_like(X, np.nan)
    if X.shape[1] >= n:
        out[:, n - 1:] = win(X, n, axis=1).max(axis=-1)
    return out


def rmin(X, n):
    out = np.full_like(X, np.nan)
    if X.shape[1] >= n:
        out[:, n - 1:] = win(X, n, axis=1).min(axis=-1)
    return out


def ema(X, n):
    a = 2 / (n + 1)
    out = np.full_like(X, np.nan)
    prev = np.full(X.shape[0], np.nan)
    for t in range(X.shape[1]):
        x = X[:, t]
        prev = np.where(np.isnan(prev), x, np.where(np.isnan(x), prev, a * x + (1 - a) * prev))
        out[:, t] = prev
    return out


def rsi(C, n=14):
    """Wilder RSI。"""
    d = np.full_like(C, np.nan)
    d[:, 1:] = C[:, 1:] - C[:, :-1]
    up, dn = np.clip(d, 0, None), np.clip(-d, 0, None)
    au = np.full(C.shape[0], np.nan)
    ad = np.full(C.shape[0], np.nan)
    out = np.full_like(C, np.nan)
    for t in range(1, C.shape[1]):
        u, v = up[:, t], dn[:, t]
        if t == n:
            au = np.nanmean(up[:, 1:n + 1], axis=1)
            ad = np.nanmean(dn[:, 1:n + 1], axis=1)
        elif t > n:
            au = np.where(np.isnan(u), au, (au * (n - 1) + u) / n)
            ad = np.where(np.isnan(v), ad, (ad * (n - 1) + v) / n)
        if t >= n:
            with np.errstate(divide="ignore", invalid="ignore"):
                out[:, t] = np.where(ad == 0, 100.0, 100 - 100 / (1 + au / ad))
    return out


def kd(H, L, C, n=9):
    """台股常用 KD：RSV(9)，K = 2/3 前K + 1/3 RSV，D = 2/3 前D + 1/3 K，初值 50。"""
    hh, ll = rmax(H, n), rmin(L, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rsv = np.where(hh > ll, (C - ll) / (hh - ll) * 100, 50.0)
    rsv[np.isnan(hh)] = np.nan
    K, D = np.full_like(C, np.nan), np.full_like(C, np.nan)
    k = np.full(C.shape[0], 50.0)
    d = np.full(C.shape[0], 50.0)
    for t in range(C.shape[1]):
        r = rsv[:, t]
        ok = np.isfinite(r)
        k = np.where(ok, k * 2 / 3 + r / 3, k)
        d = np.where(ok, d * 2 / 3 + k / 3, d)
        K[:, t] = np.where(ok, k, np.nan)
        D[:, t] = np.where(ok, d, np.nan)
    return K, D


def macd(C):
    dif = ema(C, 12) - ema(C, 26)
    sig = ema(dif, 9)
    return dif, sig


def prev(X, k=1):
    out = np.full_like(X, np.nan)
    out[:, k:] = X[:, :-k]
    return out


def cross_up(a, b):
    """a 今天在 b 之上、昨天不在（NaN 視為不成立）。"""
    pb = prev(b) if isinstance(b, np.ndarray) else b
    with np.errstate(invalid="ignore"):
        return (a > b) & (prev(a) <= pb)


def quiet_nanmean(X, axis):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(X, axis=axis)
