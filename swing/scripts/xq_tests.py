#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
XQ 全球贏家「系統內建選股腳本」實測：XQ 公開的 XScript 系統腳本（github.com/sysjust-xq/XScript_Preset，
選股目錄 324 支）是台灣散戶最常用的選股條件來源之一。這裡挑出本站資料做得到的，
依腳本原始邏輯與預設參數「重新寫成 Python」（不複製原始碼，該 repo 未附授權），丟進與其他說法相同的檢驗：

  訊號日 t 收盤後得知 → t+1 開盤買進 → 持有 5 天（月營收類 20 天）收盤賣出，扣來回成本，
  相對同日股票池（當時近 60 日成交值前 150 名）的超額報酬，以月彙總後做 t 檢定，前後半段分開，
  最後與全部說法一起做 Holm 多重比較校正。

與原腳本的差異（資料限制，逐條寫在 note）：
  · 「法人」只有外資＋投信（沒有自營商逐日資料）；沒有「資券互抵」「股本」「買張（總買進）」欄位的條件不做
  · 同一檔股票 5 天內重複觸發只算第一次（XQ 每天都會列出，連續幾天算成多次會誇大樣本數）
  · 只在流動性前 150 名內檢驗，XQ 腳本裡「成交量 > N 張」的門檻在這個股票池幾乎都成立
"""

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as win

import indicators as I

SRC = "XQ 系統腳本"


def nth_high(X, n, k, lag=0):
    """近 n 根（往前 lag 根起算）第 k 高。"""
    out = np.full_like(X, np.nan)
    Y = I.prev(X, lag) if lag else X
    if Y.shape[1] >= n:
        w = np.sort(win(Y, n, axis=1), axis=-1)
        out[:, n - 1:] = w[..., -k]
    return out


def nth_low(X, n, k, lag=0):
    out = np.full_like(X, np.nan)
    Y = I.prev(X, lag) if lag else X
    if Y.shape[1] >= n:
        w = np.sort(win(Y, n, axis=1), axis=-1)
        out[:, n - 1:] = w[..., k - 1]
    return out


def slope(X, n):
    """XQ linearregslope：近 n 根的線性回歸斜率（每根的變化量）。"""
    out = np.full_like(X, np.nan)
    if X.shape[1] < n:
        return out
    x = np.arange(n) - (n - 1) / 2
    out[:, n - 1:] = win(X, n, axis=1) @ x / (x @ x)
    return out


def rsum(X, n):
    return I.sma(X, n) * n


def bars_since(M):
    """XQ barslast：距離上次條件成立過了幾根（當根成立為 0；從未成立為很大）。"""
    N, T = M.shape
    out = np.full((N, T), 10 ** 6, float)
    last = np.full(N, -10 ** 6)
    for t in range(T):
        last = np.where(M[:, t], t, last)
        out[:, t] = t - last
    return out


def all_n(M, n, lag=0):
    """XQ trueall：近 n 根都成立。"""
    Y = I.prev(M.astype(float), lag) if lag else M.astype(float)
    return I.rmin(np.nan_to_num(Y), n) > 0


def xq_tests(lab, revenue):
    from evidence import load_chips
    O, H, L, C, V = lab.O, lab.H, lab.L, lab.C, lab.V
    Z = V / 1000                                    # 張
    pv = I.prev
    F = I.first
    out = []

    def ev(cat, key, name, path, claim, M, note="", sign=1, h=5, dedupe=True, **kw):
        M = np.nan_to_num(M).astype(bool)
        if dedupe:
            M = F(M, 5)
        out.append(lab.event(cat, "xq_" + key, name, claim, M, h=h, sign=sign,
                             note=f"{SRC}「{path}」" + (f"；{note}" if note else ""), **kw))

    with np.errstate(invalid="ignore", divide="ignore"):
        G = "XQ 內建選股・技術指標"
        ev(G, "mtm0", "MTM 穿越 0", "02.基本技術指標/MTM穿越0",
           "10 日動量（今收−10 日前收）由負轉正，之後 5 天表現比股票池好", I.cross_up(C - pv(C, 10), 0.0), dedupe=False)
        ev(G, "rsi_gx", "RSI 黃金交叉", "02.基本技術指標/RSI黃金交叉",
           "6 日 RSI 向上穿過 12 日 RSI，之後 5 天表現比股票池好", I.cross_up(I.rsi(C, 6), I.rsi(C, 12)), dedupe=False)
        cc = I.sma(I.cci(H, L, C, 14), 9)
        ev(G, "cci_os", "CCI 超賣", "02.基本技術指標/CCI超賣",
           "14 日 CCI 的 9 日平均跌破 −100（超賣），之後 5 天反彈", I.cross_up(-cc, 100.0), dedupe=False)
        ma20, sd20 = I.sma(C, 20), I.rstd(C, 20)
        up1 = ma20 + sd20
        bw = 100 * 2 * sd20 / ma20
        ev(G, "bband_buy", "布林通道買進訊號", "02.基本技術指標/BBand出現買進訊號",
           "布林帶寬（±1 倍標準差）升破 5%、收盤站上上緣且月線上揚，之後 5 天續強",
           I.cross_up(bw, 5.0) & (C > up1) & (C > pv(up1)) & (ma20 > pv(ma20)), dedupe=False)
        ma10 = I.sma(C, 10)
        ev(G, "vol_break", "帶量突破均線", "02.基本技術指標/帶量突破均線",
           "收盤由下往上站上 10 日均線、成交量超過前 10 日均量 2 倍，之後 5 天續強",
           (C > ma10) & (pv(C) < ma10) & (V > pv(I.sma(V, 10)) * 2))
        ma5 = I.sma(C, 5)
        mx = np.fmax(np.fmax(ma5, ma10), ma20)
        spread = np.fmax(np.fmax(np.abs(ma5 - ma10), np.abs(ma10 - ma20)), np.abs(ma20 - ma5))
        ev(G, "tangle", "突破糾結均線", "03.進階技術分析/突破糾結均線",
           "5、10、20 日均線糾結在 2% 內，收盤帶量（＞20 日均量 1.25 倍）站上三條均線，之後 5 天續強",
           (V > I.sma(V, 20) * 1.25) & (Z > 2000) & I.cross_up(C, mx) & (spread * 100 < 2 * C))
        pdi, mdi, adx = I.dmi(H, L, C, 14)
        ev(G, "adx25", "趨勢成形（ADX 突破 25）", "03.進階技術分析/趨勢成形",
           "ADX(14) 升破 25 且收在最高點，之後 5 天續強", I.cross_up(adx, 25.0) & (C >= H), dedupe=False)
        pc = pv(C)
        tr = np.fmax(H - L, np.fmax(np.abs(H - pc), np.abs(L - pc)))
        ev(G, "stir", "股價蠢蠢欲動", "03.進階技術分析/股價蠢蠢欲動",
           "真實波幅創 20 日新高、收在高點附近且上漲，之後 5 天續強",
           (tr > pv(I.rmax(tr, 20))) & (tr > pv(tr)) & (C * 1.01 > H) & (C > pc))
        upd = np.where(np.isfinite(pc), (C >= pc).astype(float), np.nan)
        dnd = np.where(np.isfinite(pc), (C < pc).astype(float), np.nan)
        zd = rsum(upd, 125) / rsum(dnd, 125)
        z5, z20 = I.sma(zd, 5), I.sma(zd, 20)
        ev(G, "bottom", "築底指標買進訊號", "03.進階技術分析/築底指標出現買進訊號",
           "半年漲跌天數比的 5 日均線在 1 以下向上穿過 20 日均線（築底完成），之後 5 天上漲",
           (z5 < 1) & (z20 < 1) & I.cross_up(z5, z20), dedupe=False)

        G = "XQ 內建選股・價量型態"
        ev(G, "pv_high", "價量同步創百日新高", "04.價量選股/價量同步創N期新高",
           "最高價與成交量同一天創 100 日新高，之後 5 天續強", (H >= I.rmax(H, 100)) & (V >= I.rmax(V, 100)))
        ev(G, "high_near_low", "創百日新高但離低點不遠", "04.價量選股/創百日來新高但距離低點不太遠",
           "收盤創 100 日新高、但距 100 日最低點漲幅不到 14%（剛起漲），之後 5 天續強",
           (C >= I.rmax(C, 100)) & (I.rmin(C, 100) * 1.14 >= C))
        asp = np.where(C > pc, (C - pc) / C * 100, 0.0)
        dsp = np.where(C < pc, (pc - C) / C * 100, 0.0)
        p1 = I.sma(asp, 5) - I.sma(dsp, 5)
        ev(G, "accel", "漲勢加速", "04.價量選股/漲勢加速",
           "30 天內跌超過 23% 後，5 日漲跌速度差向上穿過其 9 日平均、RSI(6)≦75，之後 5 天上漲",
           I.cross_up(p1, I.sma(p1, 9)) & (I.rsi(C, 6) <= 75) & (C * 1.3 < pv(C, 30)))
        big = C >= pc * 1.07
        bs = bars_since(np.nan_to_num(big).astype(bool))
        ev(G, "rebound", "大跌後的急拉", "04.價量選股/大跌後的急拉",
           "30 天內跌超過 20%、50 天來第一次單日大漲 7% 以上，之後 5 天續強",
           (pv(bs) > 50) & (bs == 0) & (I.sma(Z, 100) > 500) & (Z > 1000) & (pc * 1.25 < pv(C, 30)), dedupe=False)
        ev(G, "hype_rev", "炒高後無量反轉下跌", "04.價量選股/炒高後無量反轉下跌",
           "150 天漲 20% 以上、仍在高點 10% 內，近 5 日量縮到 20 日均量 2/3 以下且 4 天前收盤更高，之後 5 天表現比股票池差",
           (C < pv(C, 4)) & (C * 1.1 > I.rmax(C, 150)) & (C >= pv(C, 150) * 1.2) & (I.sma(pv(V), 5) * 1.5 < I.sma(pv(V), 20)),
           sign=-1, note="「避開」型說法")
        ev(G, "break_prev_high", "今收破昨高", "04.價量選股/今收破昨高",
           "收盤高於昨天最高價，之後 5 天續強", C >= pv(H))
        h1, h4 = nth_high(H, 20, 1, lag=1), nth_high(H, 20, 4, lag=1)
        l1, l4 = nth_low(L, 20, 1, lag=1), nth_low(L, 20, 4, lag=1)
        ev(G, "platform", "平台整理後突破", "05.型態選股/平台整理後突破",
           "20 日區間振幅 10% 內、高低點都很整齊，收盤帶量突破區間高點，之後 5 天續強",
           ((h1 - l1) / l1 <= 0.10) & ((h1 - h4) / h4 <= 0.03) & ((l4 - l1) / l1 <= 0.03) & I.cross_up(C, h1)
           & (pv(C, 50) * 1.1 < h1) & (V > I.sma(V, 20)))
        ev(G, "long_red", "長紅 K 棒", "05.型態選股/長紅",
           "收盤比開盤高 3.5% 以上，之後 5 天續強", C >= O * 1.035)
        ev(G, "hammer", "下跌後的吊人線", "05.型態選股/下跌後的吊人線",
           "30 日高點比昨收高 40% 以上（大跌後），出現長下影線（下影 > 實體 2 倍且 > 2%），之後 5 天反彈",
           (H <= np.fmax(O, C) * 1.01) & ((C - L) > np.abs(O - C) * 2) & ((C - L) > C * 0.02) & (I.rmax(H, 30) > pc * 1.4))
        hh100 = H >= I.rmax(H, 100)
        bh = bars_since(np.nan_to_num(hh100).astype(bool))
        ev(G, "turtle", "烏龜交易法則買進", "11.選股機器人/烏龜交易法則之買進訊號",
           "最高價創 100 日新高、且前一次創新高已是 100 天以前，之後 5 天續強",
           hh100 & (pv(bh) > 100) & (I.sma(pv(Z), 5) >= 1000), dedupe=False)
        ev(G, "overkill", "殺過頭", "11.選股機器人/殺過頭",
           "20 日高點比昨收高 20%、5 日高點比昨收高 10%（短線急殺），今天反彈 2% 以上，之後 5 天續漲",
           (I.rmax(H, 20) >= pc * 1.2) & (I.rmax(H, 5) >= pc * 1.1) & (C >= pc * 1.02))
        b = np.broadcast_to(lab.bench, C.shape)
        bm = (b > I.sma(b, 10)) & (I.sma(b, 5) > I.sma(b, 20))
        rr = C / b
        rup = I.sma(rr, 20) + 2 * I.rstd(rr, 20)
        ev(G, "lead_mkt", "股價領先大盤創新高", "11.選股機器人/股價領先大盤創新高",
           "大盤多頭（以 0050 代替加權指數）時，個股相對大盤強弱連 3 天站上布林上軌，之後 5 天續強",
           bm & all_n(rr >= rup, 3) & (I.sma(pv(Z), 100) >= 1000), note="大盤以 0050 收盤代替加權指數")
        s3, s5, s20 = slope(C, 3), slope(C, 5), slope(C, 20)
        ev(G, "trend_form", "漲勢成形", "04.價量選股/漲勢成形",
           "3、5、20 日回歸斜率由短到長遞減且短斜率連 2 天上升、20 日斜率剛轉正，之後 5 天續強",
           (s3 > s5) & (s5 > s20) & (s3 > pv(s3)) & (pv(s3) > pv(s3, 2)) & (s3 > 0.3) & (pv(s20, 2) < 0.1) & (s20 > 0))
        up_ = np.fmax(C - pc, 0)
        dn_ = np.fmax(pc - C, 0)
        rs = I.wilder(up_, 10) / I.wilder(dn_, 10)
        ev(G, "bull_turn", "多頭轉強", "04.價量選股/多頭轉強",
           "10 日漲跌力道比（RS）升破 4、但 3 天漲幅不到 6%，之後 5 天續強",
           I.cross_up(rs, 4.0) & (C < pv(C, 3) * 1.06) & (I.sma(pv(Z), 100) >= 500), dedupe=False)

        (FB, TB, MB, SB), days = load_chips(lab)
        if days >= 120:
            G = "XQ 內建選股・籌碼"
            roc = (C / pc - 1) * 100
            sz10 = rsum(Z, 10)
            for key, name, path, X, who in (("trust_push", "投信拉抬", "06.籌碼選股/投信拉抬", TB, "投信"),
                                            ("foreign_push", "外資拉抬", "06.籌碼選股/外資拉抬", FB, "外資"),
                                            ("inst_push", "法人買超拉抬", "06.籌碼選股/法人買超", FB + TB, "外資＋投信")):
                ev(G, key, name, path,
                   f"當天漲 3.5% 以上、近 10 日{who}累計買超超過成交量 5%，之後 5 天續強",
                   (roc >= 3.5) & (rsum(X, 10) > sz10 * 0.05),
                   note="原腳本的法人含自營商，這裡只有外資＋投信" if who == "外資＋投信" else "")
            ev(G, "inst_ratio", "法人淨買超比例高", "06.籌碼選股/法人淨買超比例高",
               "近 3 日外資＋投信淨買超占成交量 30% 以上，之後 5 天續強",
               (rsum(FB + TB, 3) / rsum(Z, 3) * 100 > 30) & (Z > 1000), note="原腳本扣除資券互抵、含自營商；這裡沒有這兩項資料")
            T = C.shape[1]
            hb = np.full(C.shape, np.nan)       # 80 日最高收盤那天的融資餘額
            for t in range(79, T):
                w = C[:, t - 79:t + 1]
                ok = np.isfinite(w).any(axis=1)
                j = np.where(ok, np.nanargmax(np.where(np.isfinite(w), w, -np.inf), axis=1), 0)
                hb[:, t] = np.where(ok, MB[np.arange(C.shape[0]), t - 79 + j], np.nan)
            ev(G, "margin_rebound", "融資大減後轉強", "06.籌碼選股/融資大減後轉強",
               "融資餘額比 80 日波段高點時減少 3000 張以上，股價連 3 天上漲，之後 5 天續強",
               (hb - MB > 3000) & all_n(C > pc, 3))
            ev(G, "short_up", "券增價漲", "06.籌碼選股/券增價漲",
               "當天漲 3.5% 以上、融券餘額創 10 日新高（可能軋空），之後 5 天續強",
               (roc >= 3.5) & (SB > 0) & (SB >= I.rmax(SB, 10)))
            ev(G, "margin_chase", "融資追捧", "06.籌碼選股/融資追捧",
               "當天漲 3.5% 以上、融資餘額創 10 日新高，之後 5 天續強",
               (roc >= 3.5) & (MB > 0) & (MB >= I.rmax(MB, 10)))
            ev(G, "foreign_flip", "外資由空翻多", "06.籌碼選股/外資由空翻多",
               "近 20 日外資累計賣超、但最近 3 天每天買超 200 張以上，之後 5 天續強",
               (rsum(FB, 20) < 0) & all_n(FB > 200, 3))
            ev(G, "inst_quiet", "法人大買而股價尚未發動", "06.籌碼選股/法人大買而股價尚未發動",
               "外資＋投信連 10 天每天買超 100 張以上、10 日漲幅卻不到 3%，之後 5 天補漲",
               all_n(FB + TB > 100, 10) & ((C / pv(C, 10) - 1) * 100 < 3), note="原腳本的法人含自營商")
            amt = TB * C / 10                       # 萬元
            ev(G, "trust_first_big", "投信第一天大買進", "06.籌碼選股/投信第一天大買進",
               "投信單日買超金額超過 200 萬元（前 5 天沒有），之後 5 天續強",
               amt > 200, note="原腳本另限股本 80 億以下，這裡沒有股本資料")

        if revenue:
            _revenue(lab, revenue, ev)
    return out


def _revenue(lab, revenue, ev):
    """月營收類：次月 10 日之後第一個交易日才知道，持有 20 天。"""
    G = "XQ 內建選股・月營收"
    months = sorted(revenue)
    N, T = len(lab.codes), len(lab.dates)
    kpos = {c: k for k, c in enumerate(lab.codes)}
    Mn = len(months)
    cur = np.full((N, Mn), np.nan)
    ly = np.full((N, Mn), np.nan)
    for i, m in enumerate(months):
        for c, (a, b) in revenue[m].items():
            k = kpos.get(c)
            if k is not None and a is not None:
                cur[k, i] = a
                ly[k, i] = b if b else np.nan
    with np.errstate(invalid="ignore", divide="ignore"):
        yoy = (cur / ly - 1) * 100
        mom = (cur / I.prev(cur) - 1) * 100
        # 累計營收年增率：同一年 1 月到當月
        ccur, cly = np.full_like(cur, np.nan), np.full_like(cur, np.nan)
        for i, m in enumerate(months):
            js = [j for j in range(i + 1) if months[j][:4] == m[:4]]
            if len(js) == int(m[5:7]):
                ccur[:, i] = cur[:, js].sum(axis=1)
                cly[:, i] = ly[:, js].sum(axis=1)
        cyoy = (ccur / cly - 1) * 100
        pv = I.prev
        y3, y4, y12 = I.sma(yoy, 3), I.sma(yoy, 4), I.sma(yoy, 12)
        m3 = I.sma(mom, 3)
        conds = {
            "rev_takeoff": (slope(y3, 20) < 0) & I.cross_up(slope(y3, 5), 0.0),
            "rev_mom": I.cross_up(y3, y12) & (y3 > 5) & (y3 - y12 > 5) & (y12 >= 1),
            "rev_3m": (m3 > 10) & (y3 > 10) & (mom > pv(mom)) & (yoy > pv(yoy)) & all_n((mom > 5) & (yoy > 5), 3),
            "rev_ma_gx": I.cross_up(y4, y12) & (yoy > 0),
            "rev_turn3": all_n(yoy > 0, 3) & (pv(yoy, 3) < 0),
            "rev_cum_gx": I.cross_up(I.sma(cyoy, 3), I.sma(cyoy, 12) + 5) & (cyoy > 10),
            "rev_mom_out": (m3 - (pv(m3, 12) + pv(m3, 24) + pv(m3, 36)) / 3) > 5,
            "rev_high48": cur >= I.rmax(cur, 48),
        }
    # 月 → 公布後第一個交易日
    tmap = []
    for m in months:
        y, mm = map(int, m.split("-"))
        known = f"{y + (mm == 12)}-{mm % 12 + 1:02d}-10"
        tmap.append(next((j for j, d in enumerate(lab.dates) if d > known), None))
    last_t = max((t for t in tmap if t is not None), default=None)
    E = {}
    for key, Mm in conds.items():
        X = np.zeros((N, T), bool)
        Mm = np.nan_to_num(Mm).astype(bool)
        for i, t in enumerate(tmap):
            if t is not None:
                X[:, t] |= Mm[:, i]
        E[key] = X
    C = lab.C
    with np.errstate(invalid="ignore"):
        off = I.rmax(C, 500) > C * 1.2
    spec = [
        ("rev_takeoff", "營收再起飛", "07.月營收選股/營收再起飛",
         "營收年增率 3 月均線的 20 個月趨勢向下、5 個月趨勢剛翻正，公布後 20 天表現比股票池好", E["rev_takeoff"], ""),
        ("rev_mom", "月營收成長動能加快", "07.月營收選股/月營收成長動能加快",
         "年增率 3 月均線向上穿過 12 月均線且拉開 5 個百分點以上，公布後 20 天表現比股票池好", E["rev_mom"], ""),
        ("rev_3m", "最近三個月營收明顯成長", "07.月營收選股/最近三個月營收明顯成長",
         "連 3 個月月增、年增都超過 5%，且當月月增與年增都比上月高，公布後 20 天表現比股票池好", E["rev_3m"], ""),
        ("rev_ma_gx", "營收年增率均線黃金交叉", "07.月營收選股/月營收年增率移動平均黃金交叉",
         "年增率 4 月均線向上穿過 12 月均線、當月年增為正，公布後 20 天表現比股票池好", E["rev_ma_gx"], ""),
        ("rev_turn3", "年增率由負轉正連 3 月", "07.月營收選股/營收年增率由負轉正，且至少連續3個月",
         "年增率連續 3 個月為正、再前一個月為負，公布後 20 天表現比股票池好", E["rev_turn3"], ""),
        ("rev_cum_gx", "累計營收年增率黃金交叉", "07.月營收選股/累計營收年增率黃金交叉",
         "累計營收年增率 3 月均線向上穿過 12 月均線＋5、且累計年增超過 10%，公布後 20 天表現比股票池好", E["rev_cum_gx"], ""),
        ("rev_mom_out", "營收月增率比歷年突出", "07.月營收選股/營收月增率比歷年突出",
         "近 3 個月平均月增率比過去 3 年同期平均高 5 個百分點以上（排除季節性），公布後 20 天表現比股票池好", E["rev_mom_out"], ""),
        ("rev_high_off", "營收創 4 年新高、股價離高點有距離", "07.月營收選股/月營收創新高股價離高點有些距離",
         "當月營收創 48 個月新高，但股價比近 500 日高點低 20% 以上，公布後 20 天補漲", E["rev_high48"] & off,
         "原腳本用總市值，這裡用股價（忽略股本變動）"),
    ]
    for key, name, path, claim, M, note in spec:
        ev(G, key, name, path, claim, M, note=note, h=20, dedupe=False, today_t=last_t)
    return []
