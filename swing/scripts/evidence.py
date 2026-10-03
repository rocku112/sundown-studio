#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
短線證據檢驗：事先登記的 8 個假說，看它們在台股是否真的存在、扣成本後還剩多少。

規則（在看結果之前就固定，不准事後修改條件）：
  · 每個假說只檢驗一種寫法，不掃參數
  · 前半段（樣本內）與後半段（樣本外）分開算；「成立」要兩段同方向且樣本外顯著
  · 同時檢驗 8 個假說，用 Holm 校正多重比較：最小的 p 值要 < 0.05/8 才算數
  · 可交易性：扣掉一次來回成本（股票約 0.585%、ETF 約 0.385%）後是否還為正

資料：
  · 個股：swing/.cache/ohlcv.json（流動性前 400 檔五年日線，時點正確的前 150 名股票池）
  · 大盤：0050 自上市以來日線（Yahoo，含開盤價），用於日曆效應與大盤事件

輸出：twflow/web/data/evidence.json
"""

import json
import math
import warnings
import os
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
SRC = os.path.join(ROOT, ".cache", "ohlcv.json")
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


def stock_tests(src):
    """個股層級：時點正確股票池內的短期反轉／動能、爆量長紅。"""
    from backtest_swing import eligibility
    dates = sorted({r[0] for s in src.values() for r in s["rows"]})
    eligible = eligibility(src, dates)
    idx = {x: i for i, x in enumerate(dates)}
    codes = [c for c in src if src[c]["kind"] == "stock"]
    C = np.full((len(codes), len(dates)), np.nan)
    V = np.full_like(C, np.nan)
    for k, c in enumerate(codes):
        for r in src[c]["rows"]:
            C[k, idx[r[0]]], V[k, idx[r[0]]] = r[4], r[5]
    E = np.array([[x in eligible[c] for x in dates] for c in codes])
    split = dates[len(dates) // 2]
    out = []

    # 1、2 每週（每 5 個交易日）依前 5 日報酬排序，看接下來 5 日相對池內平均
    rev_d, rev_v, mom_v = [], [], []
    for t in range(25, len(dates) - 5, 5):
        past = C[:, t] / C[:, t - 5] - 1
        fwd = C[:, t + 5] / C[:, t] - 1
        ok = E[:, t] & np.isfinite(past) & np.isfinite(fwd)
        ix = np.where(ok)[0]
        if len(ix) < 60:
            continue
        mu = fwd[ix].mean()
        order = ix[np.argsort(past[ix])]
        rev_d.append(dates[t])
        rev_v.append(fwd[order[:TOPN]].mean() - mu)
        mom_v.append(fwd[order[-TOPN:]].mean() - mu)
    s = split_stats(rev_d, rev_v, split)
    out.append({"key": "reversal", "name": "短期反轉（週）", "claim": "上週跌最多的 20 檔，下週表現比股票池平均好",
                "unit": "每週（相對池內平均）", **s, "tradeable": tradeable(s, COST_STOCK),
                "note": "每週換股一次，每次來回成本約 0.59%"})
    s = split_stats(rev_d, mom_v, split)
    out.append({"key": "weekmom", "name": "短期動能（週）", "claim": "上週漲最多的 20 檔，下週表現比股票池平均好",
                "unit": "每週（相對池內平均）", **s, "tradeable": tradeable(s, COST_STOCK),
                "note": "每週換股一次，每次來回成本約 0.59%"})

    # 7 爆量長紅：量 > 20 日均量 3 倍且當日漲 > 5%，之後 5 日相對池內平均
    ev_d, ev_v = [], []
    for t in range(21, len(dates) - 6):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            v20 = np.nanmean(V[:, t - 20:t], axis=1)
        r1 = C[:, t] / C[:, t - 1] - 1
        fwd = C[:, t + 6] / C[:, t + 1] - 1         # 隔天收盤進場，避免用到當天收盤才知道的訊號
        pool = E[:, t] & np.isfinite(fwd)
        if pool.sum() < 60:
            continue
        mu = fwd[pool].mean()
        hit = pool & (V[:, t] > 3 * v20) & (r1 > 0.05)
        for k in np.where(hit)[0]:
            ev_d.append(dates[t])
            ev_v.append(fwd[k] - mu)
    s = split_stats(ev_d, ev_v, split)
    out.append({"key": "volspike", "name": "爆量長紅後續漲", "claim": "成交量超過 20 日均量 3 倍、當天漲超過 5% 的股票，之後 5 天續強",
                "unit": "每次事件（後 5 日超額，隔天收盤進場）", **s, "tradeable": tradeable(s, COST_STOCK),
                "note": "隔天收盤才進場，避免用到盤中無法知道的資訊"})
    return out, dates[0], dates[-1]


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
        same_sign = (x["is"]["t"] or 0) * (x["oos"]["t"] or 0) > 0
        x["significant"] = bool(i in passed and same_sign)
        x["verdict"] = ("成立且扣成本後可交易" if x["significant"] and x.get("tradeable")
                        else "成立但不夠付成本" if x["significant"]
                        else "證據不足")
    return tests


def main():
    src = json.load(open(SRC, encoding="utf-8"))["symbols"]
    stock, s0, s1 = stock_tests(src)
    rows = fetch_0050()
    cal = calendar_tests(rows)
    tests = holm(stock + cal)
    for x in tests:
        print(f"{x['name']:<10} 樣本內 {x['is']}  樣本外 {x['oos']}  p={x['p_oos']}  → {x['verdict']}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
                   "stock_period": [s0, s1], "index_period": [rows[0][0], rows[-1][0]],
                   "m": len(tests), "tests": tests}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
