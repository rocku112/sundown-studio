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
            au = quiet_nanmean(up[:, 1:n + 1], axis=1)
            ad = quiet_nanmean(dn[:, 1:n + 1], axis=1)
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


def wilder(X, n):
    """Wilder 平滑：每檔累積到 n 個有效值才起算，之後 v = (v×(n−1)+x)/n；缺值沿用前值。"""
    N, T = X.shape
    out = np.full_like(X, np.nan)
    s, c = np.zeros(N), np.zeros(N)
    v = np.full(N, np.nan)
    for t in range(T):
        x = X[:, t]
        f = np.isfinite(x)
        init = np.isnan(v)
        acc = init & f
        s[acc] += x[acc]
        c[acc] += 1
        ready = init & (c >= n)
        v[ready] = s[ready] / n
        upd = ~init & f
        v[upd] = (v[upd] * (n - 1) + x[upd]) / n
        out[:, t] = v
    return out


def dmi(H, L, C, n=14):
    """+DI、−DI、ADX（Wilder，14 日）。"""
    up, dn = H - prev(H), prev(L) - L
    with np.errstate(invalid="ignore"):
        pdm = np.where((up > dn) & (up > 0), up, 0.0)
        mdm = np.where((dn > up) & (dn > 0), dn, 0.0)
    pc = prev(C)
    tr = np.fmax(H - L, np.fmax(np.abs(H - pc), np.abs(L - pc)))
    bad = ~np.isfinite(tr)
    pdm[bad] = mdm[bad] = np.nan
    atr, sp, sm = wilder(tr, n), wilder(pdm, n), wilder(mdm, n)
    with np.errstate(invalid="ignore", divide="ignore"):
        pdi, mdi = 100 * sp / atr, 100 * sm / atr
        dx = 100 * np.abs(pdi - mdi) / (pdi + mdi)
    return pdi, mdi, wilder(dx, n)


def willr(H, L, C, n=14):
    hh, ll = rmax(H, n), rmin(L, n)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(hh > ll, (hh - C) / (hh - ll) * -100, -50.0) * np.where(np.isfinite(hh), 1, np.nan)


def cci(H, L, C, n=20):
    tp = (H + L + C) / 3
    m = sma(tp, n)
    md = np.full_like(tp, np.nan)
    if tp.shape[1] >= n:
        w = win(tp, n, axis=1)
        md[:, n - 1:] = np.abs(w - w.mean(axis=-1, keepdims=True)).mean(axis=-1)
    with np.errstate(invalid="ignore", divide="ignore"):
        return (tp - m) / (0.015 * md)


def mfi(H, L, C, V, n=14):
    tp = (H + L + C) / 3
    mf = tp * V
    ptp = prev(tp)
    with np.errstate(invalid="ignore"):
        pos = np.where(tp > ptp, mf, 0.0)
        neg = np.where(tp < ptp, mf, 0.0)
    bad = ~np.isfinite(mf) | ~np.isfinite(ptp)
    pos[bad] = neg[bad] = np.nan
    sp, sn = sma(pos, n), sma(neg, n)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(sn == 0, 100.0, 100 - 100 / (1 + sp / sn)) * np.where(np.isfinite(sp), 1, np.nan)


def obv(C, V):
    d = np.sign(np.nan_to_num(C - prev(C)))
    return np.cumsum(d * np.nan_to_num(V), axis=1)


def sar(H, L, step=0.02, cap=0.2):
    """拋物線 SAR，回傳 +1（多方）/−1（空方）/NaN。逐檔逐日計算，遇缺值沿用狀態。"""
    N, T = H.shape
    out = np.full((N, T), np.nan)
    for k in range(N):
        h, l = H[k], L[k]
        idx = np.where(np.isfinite(h) & np.isfinite(l))[0]
        if len(idx) < 3:
            continue
        i0, i1 = idx[0], idx[1]
        up = h[i1] >= h[i0]
        s = l[i0] if up else h[i0]
        ep = h[i1] if up else l[i1]
        af = step
        ph, pl = h[i1], l[i1]
        pph, ppl = h[i0], l[i0]
        for t in idx[2:]:
            s = s + af * (ep - s)
            if up:
                s = min(s, pl, ppl)
                if l[t] < s:
                    up, s, ep, af = False, ep, l[t], step
                elif h[t] > ep:
                    ep, af = h[t], min(af + step, cap)
            else:
                s = max(s, ph, pph)
                if h[t] > s:
                    up, s, ep, af = True, ep, h[t], step
                elif l[t] < ep:
                    ep, af = l[t], min(af + step, cap)
            out[k, t] = 1.0 if up else -1.0
            pph, ppl, ph, pl = ph, pl, h[t], l[t]
    return out


def first(M, k=10):
    """條件成立、且前 k 天內沒成立過（避免同一波重複計算）。"""
    M = np.nan_to_num(M).astype(bool)
    return M & ~(rmax(prev(M.astype(float)), k) > 0)
