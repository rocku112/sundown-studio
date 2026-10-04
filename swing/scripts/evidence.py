#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
短線證據檢驗：常見的短線指標、量價型態、排序選股、月營收與日曆效應，
放到真實資料上看它們是否存在、扣成本後還剩多少。

規則（在看結果之前就固定，不准事後修改條件）：
  · 每個說法只檢驗一種寫法，參數用看盤軟體預設值，不掃參數
  · 前半段（樣本內）與後半段（樣本外）分開算；「成立」要兩段都為正且樣本外顯著
  · 同時檢驗約 50 個說法，用 Holm 校正多重比較（最小的 p 值要 < 0.05/50 才算數）
  · 個股事件以「月」彙總後做 t 檢定：同一個月的訊號受同一段行情影響，不能當獨立樣本
  · 個股一律在訊號日收盤後才知道，隔天開盤進場、持有 h 天後收盤出場，每筆扣一次來回成本
  · 可交易性：樣本外相對股票池的超額報酬，要大於一次來回成本（股票約 0.69%：手續費 0.1425%×2＋證交稅 0.3%＋滑價 0.1%）

資料：
  · 個股：swing/.cache/ohlcv.json（流動性前 400 檔五年日線，時點正確的前 150 名股票池）
  · 籌碼：swing/data/chips/（法人買賣超、融資融券餘額；逐步回補）
  · 月營收：swing/data/revenue.json（公開資訊觀測站；一律假設次月 10 日後才知道）
  · 大盤：0050 自上市以來日線（Yahoo，含開盤價），用於日曆效應與大盤事件

輸出：twflow/web/data/evidence.json（各說法統計）、evidence_stocks.json（個股自己的歷史與今日觸發）
"""

import json
import math
import warnings
import os
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np
import requests

import indicators as I
from scipy.stats import norm

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
SRC = os.path.join(ROOT, ".cache", "ohlcv.json")
REV = os.path.join(ROOT, "data", "revenue.json")
OUT_STOCKS = os.path.join(REPO, "twflow", "web", "data", "evidence_stocks.json")
OUT = os.path.join(REPO, "twflow", "web", "data", "evidence.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
COST_STOCK = 0.001425 * 2 + 0.003 + 0.001       # 來回：手續費×2＋證交稅＋滑價
COST_ETF = 0.001425 * 2 + 0.001 + 0.001
POOL = 150
TOPN = 20


def tstat(x, min_n=10):
    x = np.asarray([v for v in x if np.isfinite(v)])
    if len(x) < min_n:
        return None, None, len(x)
    sd = x.std(ddof=1)
    t = x.mean() / (sd / math.sqrt(len(x))) if sd > 0 else 0.0
    return float(x.mean()), float(t), len(x)


def pval(t):
    """雙尾常態近似（樣本數都在幾十以上，足夠）。"""
    return math.erfc(abs(t) / math.sqrt(2)) if t is not None else 1.0


def split_stats(dates, vals, split, min_n=10):
    a = [v for d, v in zip(dates, vals) if d < split]
    b = [v for d, v in zip(dates, vals) if d >= split]
    m1, t1, n1 = tstat(a, min_n)
    m2, t2, n2 = tstat(b, min_n)
    r = lambda x, k=3: None if x is None else round(x, k)
    return {"is": {"mean": r(m1 and m1 * 100), "t": r(t1, 2), "n": n1},
            "oos": {"mean": r(m2 and m2 * 100), "t": r(t2, 2), "n": n2}}


def fetch_0050():
    r = requests.get("https://query1.finance.yahoo.com/v8/finance/chart/0050.TW",
                     params={"period1": 0, "period2": int(time.time()), "interval": "1d", "events": "div,split"},
                     headers=UA, timeout=30)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    adj = res["indicators"]["adjclose"][0]["adjclose"]
    off = res["meta"].get("gmtoffset", 0)
    rows = []
    for i, t in enumerate(res["timestamp"]):
        o, c, a = q["open"][i], q["close"][i], adj[i]
        if None in (o, c, a) or c <= 0:
            continue
        rows.append((datetime.fromtimestamp(t + off, tz=timezone.utc).date().isoformat(), o, c, a))
    return rows


def calendar_tests(rows):
    """大盤日曆效應與事件：用 0050 含息還原日報酬。"""
    d = [r[0] for r in rows]
    adj = np.array([r[3] for r in rows])
    o = np.array([r[1] for r in rows])
    c = np.array([r[2] for r in rows])
    o = np.where(o > 0, o, np.nan)          # Yahoo 早年部分日子開盤價缺漏記為 0
    ret = np.full(len(rows), np.nan)
    ret[1:] = adj[1:] / adj[:-1] - 1
    split = d[len(d) // 2]
    out = []

    # 3 月初效應：月份最後一個交易日＋下月前 3 個交易日 vs 其他日子（差值）
    tom = np.zeros(len(d), bool)
    for i in range(1, len(d)):
        if d[i][:7] != d[i - 1][:7]:
            for k in (i - 1, i, i + 1, i + 2):
                if 0 <= k < len(d):
                    tom[k] = True
    out.append(diff_test("tom", "月初效應", "月底最後一天到下月前 3 天的日報酬，比其他日子高",
                         d, ret, tom, split, COST_ETF, hold=4))

    # 4 節前效應：與下一個交易日相隔 ≥ 4 天（長假）的前一天
    pre = np.zeros(len(d), bool)
    for i in range(len(d) - 1):
        if (date.fromisoformat(d[i + 1]) - date.fromisoformat(d[i])).days >= 4:
            pre[i] = True
    out.append(diff_test("preholiday", "節前效應", "長假（連續休市 ≥ 3 天）前一個交易日的報酬，比其他日子高",
                         d, ret, pre, split, COST_ETF, hold=1, by="year"))

    # 5 週一效應：週一報酬 vs 其他日子（預期為負）
    mon = np.array([date.fromisoformat(x).weekday() == 0 for x in d])
    out.append(diff_test("monday", "週一效應", "週一的報酬比其他日子差",
                         d, ret, mon, split, COST_ETF, hold=1))

    # 6 隔夜 vs 盤中：前日收盤→今日開盤 與 今日開盤→今日收盤（原始價，同一天內不受除息影響以外的影響）
    night = np.full(len(d), np.nan)
    intra = np.full(len(d), np.nan)
    night[1:] = o[1:] / c[:-1] - 1
    intra[:] = c / o - 1
    # 除息日的隔夜報酬會被除息缺口拉低：用還原價調整比例修正
    fac = np.ones(len(d))
    fac[1:] = (adj[1:] / c[1:]) / (adj[:-1] / c[:-1])
    night = (1 + night) * fac - 1
    s = split_stats(d, night - intra, split)
    out.append({"key": "overnight", "name": "隔夜 vs 盤中", "claim": "報酬集中在收盤到隔天開盤（隔夜），盤中反而偏弱",
                "unit": "每日（隔夜−盤中）", **s,
                "tradeable": None, "note": "要賺隔夜報酬得每天收盤買、開盤賣，一年約 250 次來回，成本遠大於差距"})

    # 8 大盤大跌後反彈：0050 單日跌 > 2% 後，之後 5 天報酬 vs 平常任意 5 天
    f5 = np.full(len(d), np.nan)
    for i in range(len(d) - 5):
        f5[i] = adj[i + 5] / adj[i] - 1
    base = np.nanmean(f5)
    ev = [(d[i], f5[i] - base) for i in range(len(d)) if np.isfinite(ret[i]) and ret[i] < -0.02 and np.isfinite(f5[i])]
    s = split_stats([x for x, _ in ev], [v for _, v in ev], split)
    out.append({"key": "crashbounce", "name": "大盤大跌後反彈", "claim": "0050 單日跌超過 2% 之後 5 天，表現比平常好",
                "unit": "每次事件（後 5 日超額）", **s,
                "tradeable": tradeable(s, COST_ETF)})
    return out


def diff_test(key, name, claim, d, ret, mask, split, cost, hold, by="month"):
    """特定日子 vs 其他日子的日報酬差。以「每月（或每年）的平均差」為一個樣本做 t 檢定，
    避免把幾千個日報酬當獨立樣本而高估顯著性。節前這種一年只有幾次的事件用年。"""
    w = 7 if by == "month" else 4
    periods = sorted({x[:w] for x in d})
    yd, yv = [], []
    for y in periods:
        idx = [i for i, x in enumerate(d) if x[:w] == y and np.isfinite(ret[i])]
        a = [ret[i] for i in idx if mask[i]]
        b = [ret[i] for i in idx if not mask[i]]
        if len(a) >= 1 and len(b) >= (8 if by == "month" else 30):
            yd.append(y + ("-15" if by == "month" else "-07-01"))
            yv.append(np.mean(a) - np.mean(b))
    s = split_stats(yd, yv, split, min_n=10 if by == "month" else 6)
    s["unit"] = "每日報酬差（以" + ("月" if by == "month" else "年") + "為樣本）"
    # 可交易性：只在這些日子持有，每次進出一趟，平均每「次」多賺 hold 天 × 日差，要大於一次來回成本
    edge = None if s["oos"]["mean"] is None else s["oos"]["mean"] / 100 * hold
    return {"key": key, "name": name, "claim": claim, **s,
            "tradeable": None if edge is None else bool(edge > cost),
            "note": f"每次只持有約 {hold} 天；扣一次來回成本 {cost*100:.2f}% 後{'仍為正' if edge and edge > cost else '不夠付成本'}"
            if edge is not None else ""}


def tradeable(s, cost):
    m = s["oos"]["mean"]
    return None if m is None else bool(m / 100 > cost)


class Lab:
    """個股檢驗共用：時點正確股票池、進出場（訊號日 t 收盤後才知道 → t+1 開盤進、t+h 收盤出）、
    相對同日股票池平均的超額報酬、以「月」彙總後做 t 檢定（同月多筆事件高度相關，不能當獨立樣本）。"""

    def __init__(self, src):
        from backtest_swing import eligibility
        self.src = src
        self.dates = sorted({r[0] for s in src.values() for r in s["rows"]})
        T = len(self.dates)
        idx = {x: i for i, x in enumerate(self.dates)}
        self.codes = [c for c in src if src[c]["kind"] == "stock"]
        N = len(self.codes)
        self.O, self.H, self.L, self.C, self.V = (np.full((N, T), np.nan) for _ in range(5))
        for k, c in enumerate(self.codes):
            for r in src[c]["rows"]:
                t = idx[r[0]]
                self.O[k, t], self.H[k, t], self.L[k, t], self.C[k, t], self.V[k, t] = r[1:6]
        for X in (self.O, self.H, self.L):
            X[X <= 0] = np.nan          # Yahoo 偶有無成交日開高低記為 0
        self.bench = np.full(T, np.nan)  # 0050 收盤，供相對強弱
        for r in src.get("0050", {}).get("rows", []):
            self.bench[idx[r[0]]] = r[4]
        el = eligibility(src, self.dates)
        self.E = np.array([[x in el[c] for x in self.dates] for c in self.codes])
        self.split = self.dates[T // 2]
        self.R, self.mu = {}, {}
        for h in (5, 20):
            R = np.full((N, T), np.nan)
            R[:, :T - h] = self.C[:, h:] / self.O[:, 1:T - h + 1] - 1
            R[:, :T - h] -= COST_STOCK          # 每筆都扣一次來回成本
            self.R[h] = R
            m = np.where(self.E & np.isfinite(R), R, np.nan)
            self.mu[h] = I.quiet_nanmean(m, axis=0)
        self.hist = {}          # 個股自己的歷史：{code: {key: [次數, 平均淨報酬%, 勝率%]}}
        self.today = {}         # 最新交易日觸發：{code: [key, ...]}

    def _name(self, k):
        return self.src[self.codes[k]]["name"]

    def event(self, cat, key, name, claim, M, h=5, sign=1, note="", today_t=None):
        """事件型：條件成立的那天收盤後得知。sign=-1 表示說法是「之後表現較差」。"""
        T = len(self.dates)
        tt = T - 1 if today_t is None else today_t
        last = self.E[:, tt] & np.nan_to_num(M[:, tt]).astype(bool)
        today = [{"code": self.codes[k], "name": self._name(k)} for k in np.where(last)[0]][:40]
        for t_ in today:
            self.today.setdefault(t_["code"], []).append(key)
        M = M & self.E & np.isfinite(self.R[h])
        ks, ts = np.where(M)
        raw = self.R[h][ks, ts]
        ex = (raw - self.mu[h][ts]) * sign
        by_m = {}
        for t, e in zip(ts, ex):
            by_m.setdefault(self.dates[t][:7], []).append(e)
        md = [m + "-15" for m in sorted(by_m)]
        s = split_stats(md, [float(np.mean(by_m[m[:7]])) for m in md], self.split)
        oos = np.array([self.dates[t] >= self.split for t in ts], bool)
        s["events"] = {"is": int((~oos).sum()), "oos": int(oos.sum())}
        s["win"] = round(float((raw[oos] > 0).mean() * 100), 1) if oos.any() else None
        s["raw"] = round(float(raw[oos].mean() * 100), 3) if oos.any() else None
        for k in set(ks.tolist()):
            sel = ks == k
            r = raw[sel]
            self.hist.setdefault(self.codes[k], {})[key] = [int(sel.sum()), round(float(r.mean() * 100), 2),
                                                            round(float((r > 0).mean() * 100))]
        return {"cat": cat, "key": key, "name": name, "claim": claim, "hold": h, "sign": sign,
                "unit": f"每次事件・持有 {h} 天相對股票池超額（以月彙總）", **s,
                "tradeable": tradeable(s, COST_STOCK), "note": note, "today": today,
                "today_date": self.dates[tt]}

    def rank(self, cat, key, name, claim, score, h, times, pick="top", sign=1, note=""):
        """排序型：在 times 這些日子收盤後，挑分數最高（或最低）的 TOPN 檔，持有 h 天，與股票池平均比。"""
        vd, vv, raws, wins, last = [], [], [], [], None
        for t in times:
            ok = self.E[:, t] & np.isfinite(score[:, t])
            if ok.sum() < 60:
                continue
            ix = np.where(ok)[0]
            order = ix[np.argsort(score[ix, t])]
            grp = order[-TOPN:] if pick == "top" else order[:TOPN]
            last = (t, grp)
            fin = np.isfinite(self.R[h][:, t])
            g = grp[fin[grp]]
            if len(g) < TOPN // 2 or (ok & fin).sum() < 60:
                continue
            gr = self.R[h][g, t].mean()
            v = (gr - self.R[h][ok & fin, t].mean()) * sign
            vd.append(self.dates[t]); vv.append(v)
            if self.dates[t] >= self.split:
                raws.append(gr); wins.append(v > 0)
        s = split_stats(vd, vv, self.split)
        s["events"] = {"is": sum(d < self.split for d in vd), "oos": sum(d >= self.split for d in vd)}
        s["win"] = round(float(np.mean(wins) * 100), 1) if wins else None
        s["raw"] = round(float(np.mean(raws) * 100), 3) if raws else None
        today = []
        if last:
            t, grp = last
            today = [{"code": self.codes[k], "name": self._name(k)} for k in grp[::-1 if pick == "top" else 1]]
            for x in today:
                self.today.setdefault(x["code"], []).append(key)
        return {"cat": cat, "key": key, "name": name, "claim": claim, "hold": h, "sign": sign,
                "unit": f"每期（{TOPN} 檔等權・持有 {h} 天）相對股票池超額", **s,
                "tradeable": tradeable(s, COST_STOCK), "note": note, "today": today,
                "today_date": self.dates[last[0]] if last else None}


def stock_tests(lab, revenue):
    O, H, L, C, V = lab.O, lab.H, lab.L, lab.C, lab.V
    T = len(lab.dates)
    pv = I.prev
    r1 = C / pv(C) - 1
    ma5, ma20, ma60 = I.sma(C, 5), I.sma(C, 20), I.sma(C, 60)
    vma20 = pv(I.sma(V, 20))                    # 不含當天的 20 日均量
    rs = I.rsi(C)
    K, D = I.kd(H, L, C)
    dif, sig = I.macd(C)
    mid, sd = ma20, I.rstd(C, 20)
    hi250 = pv(I.rmax(C, 250))
    out = []
    with np.errstate(invalid="ignore", divide="ignore"):
        T_ = "技術指標"
        out.append(lab.event(T_, "rsi_os", "RSI 超賣", "RSI(14) 跌破 30 之後 5 天反彈、表現優於股票池",
                             I.cross_up(-rs, -30)))
        out.append(lab.event(T_, "rsi_ob", "RSI 強勢", "RSI(14) 突破 70 之後 5 天續強",
                             I.cross_up(rs, 70)))
        out.append(lab.event(T_, "kd_gold", "KD 低檔黃金交叉", "K 值在 20 以下時 K 向上穿過 D，之後 5 天上漲",
                             I.cross_up(K, D) & (pv(K) < 20)))
        out.append(lab.event(T_, "macd_gold", "MACD 零軸下黃金交叉", "DIF 在 0 以下向上穿過訊號線，之後 5 天上漲",
                             I.cross_up(dif, sig) & (dif < 0)))
        out.append(lab.event(T_, "boll_low", "跌破布林下軌", "收盤跌破布林通道下軌（20 日 −2 倍標準差）後 5 天反彈",
                             I.cross_up(mid - 2 * sd, C)))
        out.append(lab.event(T_, "boll_up", "突破布林上軌", "收盤突破布林通道上軌後 5 天續強",
                             I.cross_up(C, mid + 2 * sd)))
        A = (C > ma5) & (ma5 > ma20) & (ma20 > ma60)
        out.append(lab.event(T_, "ma_bull", "均線多頭排列成形", "收盤＞5 日＞20 日＞60 日均線剛成立，之後 5 天續漲",
                             A & ~(pv(A.astype(float)) > 0)))
        nh = C > hi250
        recent = I.rmax(pv(nh.astype(float)), 20) > 0
        out.append(lab.event(T_, "high52", "創 52 週新高", "收盤創近 250 日新高（前 20 日沒創過），之後 5 天續強",
                             nh & ~recent))

        Q = "量價型態"
        out.append(lab.event(Q, "volspike", "爆量長紅", "成交量超過 20 日均量 3 倍、當天漲超過 5%，之後 5 天續強",
                             (V > 3 * vma20) & (r1 > 0.05)))
        pb = (ma20 > ma60) & (C > ma60) & (L <= ma20) & (C >= ma20) & (V < 0.7 * vma20)
        out.append(lab.event(Q, "pullback", "多頭量縮回測月線", "上升趨勢中（月線＞季線）量縮回測 20 日線不破，之後 5 天上漲",
                             pb & ~(pv(pb.astype(float)) > 0)))
        out.append(lab.event(Q, "gap_up", "跳空上漲收紅", "開盤高於前一天最高價 2% 以上且收紅，之後 5 天續強",
                             (O > pv(H) * 1.02) & (C > O)))
        out.append(lab.event(Q, "limit_up", "漲停", "當天漲幅 ≥ 9.5%（接近漲停），之後 5 天續強",
                             r1 >= 0.095, note="漲停隔天常開高，實際能否以開盤價買到是問題；結果偏樂觀"))
        out.append(lab.event(Q, "limit_down", "跌停後反彈", "當天跌幅 ≥ 9.5%（接近跌停），之後 5 天反彈",
                             r1 <= -0.095))
        dry = (V < 0.4 * vma20) & (C > ma60)
        out.append(lab.event(Q, "vol_dry", "量窒息", "多頭格局（收盤在季線上）成交量萎縮到 20 日均量 4 成以下，之後 5 天上漲",
                             dry & ~(pv(dry.astype(float)) > 0)))

        X = "排序（每週／每月換股）"
        wk = list(range(60, T - 1, 5))
        mo = [t for t in range(60, T - 1) if lab.dates[t][:7] != lab.dates[t + 1][:7]]   # 每月最後交易日
        p5 = C / pv(C, 5) - 1
        out.append(lab.rank(X, "reversal", "短期反轉（週）", "上週跌最多的 20 檔，下週表現比股票池好",
                            p5, 5, wk, pick="bottom"))
        out.append(lab.rank(X, "weekmom", "短期動能（週）", "上週漲最多的 20 檔，下週表現比股票池好",
                            p5, 5, wk))
        out.append(lab.rank(X, "mrev", "月反轉", "上個月跌最多的 20 檔，下個月表現比股票池好",
                            C / pv(C, 20) - 1, 20, mo, pick="bottom"))
        out.append(lab.rank(X, "mom6", "中期動能（半年）", "過去半年（跳過最近一週）漲最多的 20 檔，下個月表現比股票池好",
                            pv(C, 5) / pv(C, 125) - 1, 20, mo))
        out.append(lab.rank(X, "lowvol", "低波動", "過去 60 日波動最小的 20 檔，下個月表現比股票池好",
                            I.rstd(r1, 60), 20, mo, pick="bottom"))
        out.append(lab.rank(X, "maxret", "樂透股較差", "上個月單日最大漲幅最高的 20 檔，下個月表現比股票池差",
                            I.rmax(r1, 20), 20, mo, sign=-1, note="這是「避開」型說法：成立代表這群股票應該少碰"))
        out.append(lab.rank(X, "near_high", "接近 52 週高點", "股價最接近近一年高點的 20 檔，下個月表現比股票池好",
                            C / I.rmax(C, 250), 20, mo))

        # ── 第二批：只用價量資料（參數一律看盤軟體預設值）────────────────
        F = I.first
        B = "乖離／超買超賣"
        bias = C / ma20 - 1
        out.append(lab.event(B, "bias_neg", "負乖離過大", "收盤低於 20 日均線超過 10%（負乖離），之後 5 天反彈",
                             I.cross_up(-bias, 0.10)))
        wr = I.willr(H, L, C)
        out.append(lab.event(B, "willr", "威廉指標脫離超賣", "W%R(14) 從 −80 以下回升到 −80 之上，之後 5 天上漲",
                             I.cross_up(wr, -80)))
        cc = I.cci(H, L, C)
        out.append(lab.event(B, "cci", "CCI 脫離超賣", "CCI(20) 從 −100 以下回升到 −100 之上，之後 5 天上漲",
                             I.cross_up(cc, -100)))
        mf = I.mfi(H, L, C, V)
        out.append(lab.event(B, "mfi", "MFI 資金流超賣", "MFI(14) 跌破 20（價量同步超賣），之後 5 天反彈",
                             I.cross_up(-mf, -20)))

        D_ = "趨勢強度"
        pdi, mdi, adx = I.dmi(H, L, C)
        out.append(lab.event(D_, "dmi", "DMI 黃金交叉", "+DI 向上穿過 −DI，之後 5 天上漲", I.cross_up(pdi, mdi)))
        out.append(lab.event(D_, "adx", "ADX 趨勢成形", "ADX(14) 升破 25 且 +DI＞−DI（多頭趨勢確立），之後 5 天續漲",
                             I.cross_up(adx, 25) & (pdi > mdi)))
        sr = I.sar(H, L)
        out.append(lab.event(D_, "sar", "SAR 翻多", "拋物線 SAR 由空翻多，之後 5 天上漲",
                             (sr == 1) & (pv(sr) == -1)))
        slope = ma60 - pv(ma60)
        out.append(lab.event(D_, "ma60_turn", "季線翻揚", "60 日均線連跌 10 天後首度上揚、且收盤在季線上，之後 5 天上漲",
                             (slope > 0) & (I.rmax(pv(slope), 10) < 0) & (C > ma60)))
        ma100 = I.sma(C, 100)
        out.append(lab.event(D_, "mtf", "日線週線同步轉多", "收盤站上 20 日線、且約 20 週線（100 日）上揚中、收盤在其上，之後 5 天上漲",
                             I.cross_up(C, ma20) & (ma100 > pv(ma100, 5)) & (C > ma100)))

        S_ = "波動收縮後突破"
        bw = 4 * sd / ma20
        sq = bw <= I.rmin(bw, 120) * 1.0001
        out.append(lab.event(S_, "squeeze", "布林壓縮後突破", "布林帶寬創 120 日新低後 5 天內，收盤突破上軌，之後 5 天續強",
                             (I.rmax(pv(sq.astype(float)), 5) > 0) & I.cross_up(C, mid + 2 * sd)))
        ma10 = I.sma(C, 10)
        hiM = np.fmax(np.fmax(ma5, ma10), ma20)
        loM = np.fmin(np.fmin(ma5, ma10), ma20)
        out.append(lab.event(S_, "tangle", "均線糾結後帶量突破", "5、10、20 日線差距在 1.5% 內，隔天收盤高於三線 2% 以上且量大於均量，之後 5 天續強",
                             F((pv(hiM / loM - 1) < 0.015) & (C > hiM * 1.02) & (V > vma20))))
        out.append(lab.event(S_, "donchian", "突破 20 日高點", "收盤突破前 20 日最高價（唐奇安通道），之後 5 天續強",
                             F(C > pv(I.rmax(H, 20)))))

        K_ = "K 線型態"
        body = np.abs(C - O)
        lower = np.fmin(O, C) - L
        upper = H - np.fmax(O, C)
        down5 = C < pv(C, 5)
        out.append(lab.event(K_, "hammer", "長下影線（錘子）", "下跌 5 天後出現下影線 ≥ 實體 2 倍且 ≥ 2% 的 K 棒，之後 5 天反彈",
                             down5 & (lower >= 2 * np.fmax(body, 0.001 * C)) & (upper <= np.fmax(body, 0.002 * C)) & (lower >= 0.02 * C)))
        out.append(lab.event(K_, "engulf", "多頭吞噬", "下跌後，今天紅 K 實體完全包住昨天黑 K，之後 5 天上漲",
                             (pv(C) < pv(O)) & (C > O) & (O <= pv(C)) & (C >= pv(O)) & (pv(C) < pv(C, 6))))
        r1p = pv(r1)
        out.append(lab.event(K_, "mstar", "晨星", "長黑（跌 > 2%）→ 小實體（< 0.5%）→ 紅 K 收過長黑一半，之後 5 天上漲",
                             (pv(C, 2) < pv(O, 2)) & (pv(r1, 2) < -0.02) & (np.abs(pv(C) - pv(O)) / pv(O) < 0.005)
                             & (np.fmax(pv(O), pv(C)) < pv(C, 2)) & (C > O) & (C > (pv(O, 2) + pv(C, 2)) / 2)))
        up5 = I.rmin(r1, 5) > 0
        dn5 = I.rmax(r1, 5) < 0
        out.append(lab.event(K_, "up5", "連漲 5 天", "連續 5 天上漲，之後 5 天續漲", up5 & ~(pv(up5.astype(float)) > 0)))
        out.append(lab.event(K_, "dn5", "連跌 5 天", "連續 5 天下跌，之後 5 天反彈", dn5 & ~(pv(dn5.astype(float)) > 0)))
        out.append(lab.event(K_, "gapfill", "跳空下跌當日回補", "開盤低於昨天最低價 2% 以上、收盤回到昨天最低價之上，之後 5 天上漲",
                             (O < pv(L) * 0.98) & (C > pv(L))))

        P_ = "量價關係"
        ob = I.obv(C, V)
        ob[~np.isfinite(C)] = np.nan
        hi60 = pv(I.rmax(C, 60))
        out.append(lab.event(P_, "obv", "OBV 領先創高", "OBV 創 60 日新高、但股價還沒創高（低於前高 3% 以上），之後 5 天上漲",
                             F((ob > pv(I.rmax(ob, 60))) & (C < hi60 * 0.97))))
        out.append(lab.event(P_, "div_bear", "價漲量縮（量價背離）", "股價創 60 日新高、但 5 日均量低於 60 日均量 8 成，之後 5 天表現較差",
                             F((C > hi60) & (I.sma(V, 5) < I.sma(V, 60) * 0.8)), sign=-1,
                             note="「避開」型說法：成立代表這種創高比較不可靠"))
        rs_ = C / lab.bench[None, :]
        out.append(lab.event(P_, "rs_lead", "相對強弱領先創高", "個股相對 0050 的強弱線創 60 日新高、但股價還沒創高，之後 5 天續強",
                             F((rs_ > pv(I.rmax(rs_, 60))) & (C < hi60))))
        vw = I.sma(C * V, 20) / I.sma(V, 20)
        out.append(lab.event(P_, "vwap", "跌破 20 日均價 1 成", "收盤低於近 20 日成交量加權均價 10% 以上，之後 5 天反彈",
                             I.cross_up(-(C / vw - 1), 0.10)))
        out += revenue_tests(lab, revenue)
        out += chips_tests(lab)
    return out


def load_chips(lab):
    """swing/data/chips/*.json → 外資、投信（張）、融資、融券餘額（張）四個 N×T 矩陣。"""
    import glob
    N, T = len(lab.codes), len(lab.dates)
    kpos = {c: k for k, c in enumerate(lab.codes)}
    tpos = {d: t for t, d in enumerate(lab.dates)}
    M = [np.full((N, T), np.nan) for _ in range(4)]
    days = 0
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "chips", "*.json"))):
        j = json.load(open(p, encoding="utf-8"))
        ks = [kpos.get(c) for c in j["codes"]]
        for d, rows in j["days"].items():
            t = tpos.get(d)
            if t is None:
                continue
            days += 1
            for k, r in zip(ks, rows):
                if k is None:
                    continue
                for i in range(4):
                    if r[i] is not None:
                        M[i][k, t] = r[i]
    return M, days


def chips_tests(lab):
    """籌碼：法人連買、投信首買、土洋同買、法人買超強度、融資增減、券資比。"""
    (FB, TB, MB, SB), days = load_chips(lab)
    if days < 120:
        print(f"籌碼資料只有 {days} 天，略過")
        return []
    C, V = lab.C, lab.V
    pv = I.prev
    G = "籌碼（法人／融資融券）"
    out = []
    with np.errstate(invalid="ignore", divide="ignore"):
        fpos, tpos_ = (FB > 0).astype(float), (TB > 0).astype(float)
        fpos[np.isnan(FB)] = np.nan
        tpos_[np.isnan(TB)] = np.nan
        f3 = I.rmin(fpos, 3) > 0
        t3 = I.rmin(tpos_, 3) > 0
        fneg = (FB < 0).astype(float)
        fneg[np.isnan(FB)] = np.nan
        out.append(lab.event(G, "foreign3", "外資連 3 日買超", "外資連續 3 個交易日買超，之後 5 天表現比股票池好",
                             f3 & ~(pv(f3.astype(float)) > 0)))
        out.append(lab.event(G, "trust3", "投信連 3 日買超", "投信連續 3 個交易日買超，之後 5 天表現比股票池好",
                             t3 & ~(pv(t3.astype(float)) > 0)))
        out.append(lab.event(G, "trust_first", "投信首度買超", "投信過去 20 天都沒買、今天開始買超，之後 5 天表現比股票池好",
                             (TB > 0) & (I.rmax(pv(tpos_), 20) == 0)))
        both = (FB > 0) & (TB > 0)
        out.append(lab.event(G, "both", "土洋同買", "外資與投信同一天都買超（前 5 天沒有過），之後 5 天表現比股票池好",
                             I.first(both, 5)))
        s3 = I.rmin(fneg, 3) > 0
        out.append(lab.event(G, "foreign_sell3", "外資連 3 日賣超", "外資連續 3 個交易日賣超，之後 5 天表現比股票池差",
                             s3 & ~(pv(s3.astype(float)) > 0), sign=-1, note="「避開」型說法"))
        dv20 = I.sma(C * V, 20)
        wk = list(range(60, len(lab.dates) - 1, 5))
        fi = I.sma(np.nan_to_num(FB) * 1000 * C, 5) * 5 / dv20
        ti = I.sma(np.nan_to_num(TB) * 1000 * C, 5) * 5 / dv20
        fi[np.isnan(FB)] = np.nan
        ti[np.isnan(TB)] = np.nan
        out.append(lab.rank(G, "foreign_int", "外資買超強度前 20", "近 5 日外資買超金額占成交值比例最高的 20 檔，下週表現比股票池好",
                            fi, 5, wk))
        out.append(lab.rank(G, "trust_int", "投信買超強度前 20", "近 5 日投信買超金額占成交值比例最高的 20 檔，下週表現比股票池好",
                            ti, 5, wk))
        mchg = MB / pv(MB, 5) - 1
        pchg = C / pv(C, 5) - 1
        big = pv(MB, 5) >= 500        # 融資至少 500 張，避免小數字放大比例
        out.append(lab.event(G, "margin_catch", "融資增、股價跌", "5 日內融資增加 10% 以上、股價卻下跌（散戶接刀），之後 5 天表現比股票池差",
                             I.first(big & (mchg > 0.10) & (pchg < 0), 5), sign=-1, note="「避開」型說法"))
        out.append(lab.event(G, "margin_wash", "融資大減", "5 日內融資減少 15% 以上（籌碼沉澱），之後 5 天表現比股票池好",
                             I.first(big & (mchg < -0.15), 5)))
        ratio = SB / MB
        out.append(lab.event(G, "squeeze_short", "高券資比", "券資比升破 30%（融資 ≥ 500 張）且收盤在月線上，之後 5 天上漲（軋空）",
                             I.cross_up(ratio, 0.30) & (MB >= 500) & (C > I.sma(C, 20))))
    return out


def revenue_tests(lab, revenue):
    """月營收：一律在次月 10 日之後的第一個交易日才「知道」，隔天開盤進場、持有 20 天。"""
    if not revenue:
        return []
    G = "月營收"
    months = sorted(revenue)
    T = len(lab.dates)
    N = len(lab.codes)
    kpos = {c: k for k, c in enumerate(lab.codes)}
    yoy = {m: {} for m in months}
    for m in months:
        for c, (cur, ly) in revenue[m].items():
            if c in kpos and ly and ly > 0 and cur is not None:
                yoy[m][c] = cur / ly - 1
    S = np.full((N, T), np.nan)        # 營收年增率（公布日）
    HI = np.zeros((N, T), bool)        # 創 12 個月新高且年增為正
    TURN = np.zeros((N, T), bool)      # 年增率連 3 個月負轉正
    GROW = np.zeros((N, T), bool)      # 連 3 個月年增 > 20%（剛滿 3 個月）
    times = []
    for i, m in enumerate(months):
        y, mm = map(int, m.split("-"))
        ny, nm = (y, mm + 1) if mm < 12 else (y + 1, 1)
        known = f"{ny}-{nm:02d}-10"
        t = next((j for j, d in enumerate(lab.dates) if d > known), None)
        if t is None or t >= T:
            continue
        times.append(t)
        prev12 = months[max(0, i - 12):i]
        prev3 = months[max(0, i - 3):i]
        for c, g in yoy[m].items():
            k = kpos[c]
            S[k, t] = g
            cur = revenue[m][c][0]
            hist = [revenue[p][c][0] for p in prev12 if c in revenue[p]]
            if len(prev12) == 12 and len(hist) == 12 and cur > max(hist) and g > 0:
                HI[k, t] = True
            p3 = [yoy[p].get(c) for p in prev3]
            if len(p3) == 3 and None not in p3:
                if g > 0 and all(x < 0 for x in p3):
                    TURN[k, t] = True
                pp = yoy[months[i - 4]].get(c) if i >= 4 else None
                if g > 0.2 and all(x > 0.2 for x in p3[1:]) and p3[0] > 0.2 and (pp is None or pp <= 0.2):
                    GROW[k, t] = True
    out = [lab.rank(G, "rev_yoy", "營收年增最高", "每月營收公布後，年增率最高的 20 檔，之後 20 天表現比股票池好",
                    S, 20, times, note="年增率極端值多半來自去年基期很低，未排除"),
           lab.event(G, "rev_high", "營收創 12 個月新高", "當月營收創近 12 個月新高且年增為正，公布後 20 天表現比股票池好",
                     HI, h=20, today_t=times[-1]),
           lab.event(G, "rev_turn", "營收年增由負轉正", "連續 3 個月衰退後首度轉為成長，公布後 20 天表現比股票池好",
                     TURN, h=20, today_t=times[-1]),
           lab.event(G, "rev_grow", "營收連 4 月高成長", "年增率連續 4 個月超過 20%（剛滿 4 個月），公布後 20 天表現比股票池好",
                     GROW, h=20, today_t=times[-1])]
    return out


def holm(tests):
    """Holm 多重比較校正：依樣本外 p 值由小到大，第 k 個要 < 0.05/(m-k)。"""
    m = len(tests)
    ps = sorted(((pval(x["oos"]["t"]), i) for i, x in enumerate(tests)), key=lambda z: z[0])
    passed = set()
    for k, (p, i) in enumerate(ps):
        if p < 0.05 / (m - k):
            passed.add(i)
        else:
            break
    for i, x in enumerate(tests):
        x["p_oos"] = round(pval(x["oos"]["t"]), 4)
        ti, to = x["is"]["t"] or 0, x["oos"]["t"] or 0
        x["significant"] = bool(i in passed and ti > 0 and to > 0)
        x["verdict"] = ("成立且扣成本後可交易" if x["significant"] and x.get("tradeable")
                        else "成立但不夠付成本" if x["significant"]
                        else "顯著但方向相反" if i in passed and ti < 0 and to < 0
                        else "有跡象（未過多重比較校正）" if x["p_oos"] < 0.05 and ti > 0 and to > 0
                        else "反向跡象（未過多重比較校正）" if x["p_oos"] < 0.05 and ti < 0 and to < 0
                        else "證據不足")
    return tests


def main():
    src = json.load(open(SRC, encoding="utf-8"))["symbols"]
    revenue = json.load(open(REV, encoding="utf-8"))["months"] if os.path.exists(REV) else {}
    lab = Lab(src)
    stock = stock_tests(lab, revenue)
    s0, s1 = lab.dates[0], lab.dates[-1]
    rows = fetch_0050()
    cal = calendar_tests(rows)
    for x in cal:
        x["cat"] = "大盤日曆（0050）"
    tests = holm(stock + cal)
    for x in tests:
        print(f"{x['name']:<12} 內 {x['is']}  外 {x['oos']}  事件 {x.get('events')}  勝率 {x.get('win')}  淨 {x.get('raw')}"
              f"  p={x['p_oos']}  → {x['verdict']}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
                   "stock_period": [s0, s1], "index_period": [rows[0][0], rows[-1][0]],
                   "revenue_months": [min(revenue), max(revenue)] if revenue else None,
                   "cost_stock": COST_STOCK, "m": len(tests),
                   "t_min": round(float(norm.isf(0.025 / len(tests))), 2), "tests": tests}, f, ensure_ascii=False, separators=(",", ":"))
    with open(OUT_STOCKS, "w", encoding="utf-8") as f:
        json.dump({"date": s1, "hist": lab.hist, "today": lab.today}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}、{OUT_STOCKS}（{len(lab.hist)} 檔個股歷史）")


if __name__ == "__main__":
    main()
