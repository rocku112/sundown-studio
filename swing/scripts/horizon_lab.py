#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
極短線檢驗：現股當沖（同一天開盤進、收盤出）與隔日沖（今天收盤進、隔天開盤／收盤出）。
5 天、20 天的短線波段在 evidence.py，月調整的中線在 portfolio_lab.py，長線在 rules_vs_dca.py／holding_odds.py。

只有日線（開高低收），所以只能檢驗「用開盤價、收盤價成交」的規則；需要盤中分時資料的手法（追漲停排隊、
五分鐘突破、程式掃單）無法用公開免費資料做時點正確的回測，不列入。

規則（看結果前寫死，不掃參數）：
  當沖（訊號在開盤前或開盤當下已知；開盤價進、收盤價出）
    DT1 開盤跳空漲 ≥3%，做多      DT2 開盤跳空漲 ≥3%，做空（開高走低）
    DT3 開盤跳空跌 ≤−3%，做多（開低走高）
    DT4 昨日漲停收盤，今天做多      DT5 昨日漲停收盤，今天做空
    DT6 昨日爆量長紅（漲 ≥5%、量 ≥ 20 日均量 2 倍），今天做多
  隔日沖（訊號在收盤前已知；收盤價進）
    ON1 漲停鎖住收盤 → 隔天開盤賣      ON2 漲停鎖住收盤 → 隔天收盤賣
    ON3 大漲 ≥5% 且爆量 → 隔天開盤賣   ON4 大跌 ≤−5% → 隔天開盤賣（隔夜反彈）
  事後新增（看到 ON1／ON2 後才加，因為「漲停鎖住」時買單幾乎排不到——回測報酬是假象，要換成買得到的版本）：
    ON5 大漲 7% 以上但沒鎖漲停（買得到）→ 隔天開盤賣    ON6 爆量長紅、排除漲停鎖住 → 隔天開盤賣
  成本（一次來回）：當沖 手續費 0.1425%×2＋當沖證交稅 0.15%＋滑價 0.1% ≈ 0.535%；
                    隔日 手續費 0.1425%×2＋證交稅 0.3%＋滑價 0.1% ≈ 0.685%
  股票池：時點正確的成交值前 150 名（大型）與第 151–400 名（中小型）各檢驗一次
  統計：超額＝該筆報酬 − 同一天同股票池同一段時間的平均；以「月」彙總後做 t 檢定；
        前半樣本內、後半樣本外；樣本外 p 值以 Holm 校正（全部檢驗一起算）
  判定：樣本外通過校正、兩段超額同號為正，且樣本外每筆扣成本後平均 > 0 → 扣成本後可交易

輸出：twflow/web/data/horizon.json
這是統計檢驗，不是投資建議。
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.stats import norm

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import portfolio_lab as P        # noqa: E402

OUT = os.path.join(P.REPO, "twflow", "web", "data", "horizon.json")
FEE, SLIP = 0.001425, 0.001
COST_DT = FEE * 2 + 0.0015 + SLIP
COST_ON = FEE * 2 + 0.003 + SLIP


def monthly_t(dates, ts, x):
    """依月份彙總（每月平均）後的 t 值、月數。"""
    by = {}
    for t, v in zip(ts, x):
        by.setdefault(dates[t][:7], []).append(v)
    m = np.array([np.mean(v) for v in by.values()])
    if len(m) < 6 or m.std(ddof=1) == 0:
        return None, len(m), float(m.mean()) if len(m) else None
    return float(m.mean() / m.std(ddof=1) * np.sqrt(len(m))), len(m), float(m.mean())


def main():
    X = P.prepare()
    lab, DV = X.lab, X.DV
    O, H, C, V = lab.O, lab.H, lab.C, lab.V
    N, T = C.shape
    dates = lab.dates
    with np.errstate(invalid="ignore", divide="ignore"):
        prevC = np.full_like(C, np.nan)
        prevC[:, 1:] = C[:, :-1]
        chg = C / prevC - 1
        gap = O / prevC - 1
        v20 = np.full_like(V, np.nan)
        cs = np.cumsum(np.nan_to_num(V), axis=1)
        v20[:, 21:] = (cs[:, 20:-1] - cs[:, :-21]) / 20        # 前 20 日均量（不含當天）
        limit_up = (chg >= 0.095) & (C >= H * 0.999)           # 收在最高且漲近 10%：漲停鎖住
        big_up = (chg >= 0.05) & (V >= 2 * v20)
        big_dn = chg <= -0.05
        fillable_up = (chg >= 0.07) & ~limit_up                  # 大漲但收盤沒鎖死：收盤集合競價買得到
        intraday = C / O - 1                                     # 當天 開→收
        nxtO = np.full_like(C, np.nan); nxtO[:, :-1] = O[:, 1:]
        nxtC = np.full_like(C, np.nan); nxtC[:, :-1] = C[:, 1:]
        on_open = nxtO / C - 1                                   # 今天收→隔天開
        on_close = nxtC / C - 1                                  # 今天收→隔天收

    # 股票池（時點正確）：每天依近 60 日平均成交值排名
    big = np.zeros((N, T), bool)
    mid = np.zeros((N, T), bool)
    for t in range(61, T):
        d = DV[:, t - 1]                                         # 用前一天為止的資料決定當天股票池
        ok = np.where(np.isfinite(d) & np.isfinite(C[:, t]))[0]
        order = ok[np.argsort(-d[ok])]
        liquid = order[d[order] >= P.MIN_DV]
        big[liquid[:150], t] = True
        mid[liquid[150:400], t] = True

    def lag1(M):
        Z = np.zeros_like(M)
        Z[:, 1:] = M[:, :-1]
        return Z

    # (key, 名稱, 說法, 訊號遮罩（在交易當天 t 的位置）, 報酬矩陣, 方向, 成本, 類別)
    tests = [
        ("DT1", "跳空大漲・追多", "開盤跳空漲 3% 以上，開盤買、收盤賣", gap >= 0.03, intraday, 1, COST_DT, "當沖"),
        ("DT2", "跳空大漲・開高走低", "開盤跳空漲 3% 以上，開盤先賣、收盤買回", gap >= 0.03, intraday, -1, COST_DT, "當沖"),
        ("DT3", "跳空大跌・開低走高", "開盤跳空跌 3% 以上，開盤買、收盤賣", gap <= -0.03, intraday, 1, COST_DT, "當沖"),
        ("DT4", "昨日漲停・今天追多", "昨天漲停鎖住，今天開盤買、收盤賣", lag1(limit_up), intraday, 1, COST_DT, "當沖"),
        ("DT5", "昨日漲停・今天做空", "昨天漲停鎖住，今天開盤先賣、收盤買回", lag1(limit_up), intraday, -1, COST_DT, "當沖"),
        ("DT6", "昨日爆量長紅・今天追多", "昨天漲 5% 以上且量是 20 日均量 2 倍，今天開盤買、收盤賣", lag1(big_up), intraday, 1, COST_DT, "當沖"),
        ("ON1", "漲停隔日沖・開盤賣", "漲停鎖住的股票收盤買，隔天開盤賣", limit_up, on_open, 1, COST_ON, "隔日沖"),
        ("ON2", "漲停隔日沖・收盤賣", "漲停鎖住的股票收盤買，隔天收盤賣", limit_up, on_close, 1, COST_ON, "隔日沖"),
        ("ON3", "爆量長紅隔日沖", "漲 5% 以上且爆量，收盤買、隔天開盤賣", big_up, on_open, 1, COST_ON, "隔日沖"),
        ("ON4", "大跌隔夜反彈", "跌 5% 以上，收盤買、隔天開盤賣", big_dn, on_open, 1, COST_ON, "隔日沖"),
        ("ON5", "大漲未鎖漲停・隔日沖", "漲 7% 以上但收盤沒鎖漲停（買得到），收盤買、隔天開盤賣", fillable_up, on_open, 1, COST_ON, "隔日沖"),
        ("ON6", "爆量長紅（排除漲停鎖住）・隔日沖", "漲 5% 以上且爆量、但沒鎖漲停，收盤買、隔天開盤賣", big_up & ~limit_up, on_open, 1, COST_ON, "隔日沖"),
    ]
    split = T // 2
    rows = []
    for pool_name, pool in (("大型（前 150 名）", big), ("中小型（151–400 名）", mid)):
        with np.errstate(invalid="ignore"):
            for key, name, claim, M, R, sgn, cost, cat in tests:
                Rp = np.where(pool & np.isfinite(R), R, np.nan)
                mu = np.nanmean(Rp, axis=0)                     # 同一天同股票池的平均（基準）
                E = M & pool & np.isfinite(R)
                ii, tt = np.where(E)
                if len(tt) < 30:
                    rows.append({"key": key, "pool": pool_name, "name": name, "claim": claim, "cat": cat, "n": int(len(tt)), "note": "樣本太少"})
                    continue
                raw = sgn * R[ii, tt]
                ex = sgn * (R[ii, tt] - mu[tt])
                net = raw - cost
                res = {"key": key, "pool": pool_name, "name": name, "claim": claim, "cat": cat, "cost": round(cost * 100, 3),
                       "n": int(len(tt)), "n_days": int(len(set(tt.tolist())))}
                for part, sel in (("is", tt < split), ("oos", tt >= split)):
                    tv, nm, m = monthly_t(dates, tt[sel], ex[sel])
                    res[part] = {"n": int(sel.sum()), "months": nm, "ex": None if m is None else round(m * 100, 3),
                                 "t": None if tv is None else round(tv, 2),
                                 "net": round(float(net[sel].mean()) * 100, 3) if sel.any() else None,
                                 "win": round(float((net[sel] > 0).mean()) * 100, 1) if sel.any() else None}
                res["raw"] = round(float(raw.mean()) * 100, 3)
                # 滑價敏感度：開盤跳空股、尾盤大漲股的買賣價差通常比平常大
                res["net_slip"] = {f"{x:.1f}": round(float(net[tt >= split].mean() - x / 100) * 100, 3) for x in (0.2, 0.4)}
                res["net"] = round(float(net.mean()) * 100, 3)
                res["win"] = round(float((net > 0).mean()) * 100, 1)
                rows.append(res)

    # Holm：所有有樣本外 t 值的檢驗一起校正（單尾：超額為正）
    cand = [r for r in rows if r.get("oos", {}).get("t") is not None]
    ps = sorted(((1 - norm.cdf(r["oos"]["t"]), i) for i, r in enumerate(cand)))
    m = len(ps)
    alive = True
    for j, (p, i) in enumerate(ps):
        thr = 0.05 / (m - j)
        sig = alive and p < thr
        alive = sig
        cand[i]["p"] = round(p, 5)
        cand[i]["significant"] = bool(sig)
    for r in rows:
        if "oos" not in r:
            r["verdict"] = "樣本太少"
            continue
        a, b = r["is"], r["oos"]
        same = (a["ex"] or 0) > 0 and (b["ex"] or 0) > 0
        if r["key"] in ("ON1", "ON2") and r.get("significant") and same:
            r["verdict"] = "回測成立但實際買不到"
            r["note"] = "漲停鎖住時賣方極少、買單排隊，散戶收盤買單通常無法成交；能成交的多半是漲停被打開的時候（剛好是比較差的情況）。這是回測假象的典型例子。"
        elif r["key"] == "ON3" and r.get("significant") and same:
            r["verdict"] = "回測成立但實際買不到"
            r["note"] = "報酬幾乎都來自其中漲停鎖住、買不到的那些；排除漲停鎖住後（ON6）就不成立了。"
        elif r.get("significant") and same and (b["net"] or 0) > 0 and r["net_slip"]["0.2"] <= 0:
            r["verdict"] = "成立但利潤很薄"
            r["note"] = f"樣本外每筆扣成本後只剩 {b['net']:+.2f}%；滑價再多 0.2%（開盤跳空時很常見）就變成 {r['net_slip']['0.2']:+.2f}%。"
        elif r.get("significant") and same and (b["net"] or 0) > 0:
            r["verdict"] = "成立且扣成本後可交易"
        elif r.get("significant") and same:
            r["verdict"] = "成立但不夠付成本"
        elif (b["t"] or 0) > 2 and same:
            r["verdict"] = "有跡象（未通過校正）"
        elif (b["t"] or 0) < -2 and (a["ex"] or 0) < 0:
            r["verdict"] = "反向（說法相反）"
        else:
            r["verdict"] = "證據不足"

    # 描述統計：股票池平均的「隔夜」與「日內」報酬（每天先平均再平均）
    def avg(R, pool):
        with np.errstate(invalid="ignore"):
            x = np.nanmean(np.where(pool & np.isfinite(R), R, np.nan), axis=0)
        x = x[np.isfinite(x)]
        return round(float(x.mean()) * 100, 4)
    desc = {p: {"overnight": avg(on_open, pl), "intraday": avg(intraday, pl)} for p, pl in (("大型（前 150 名）", big), ("中小型（151–400 名）", mid))}

    doc = {"generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
           "period": [dates[61], dates[-2]], "split": dates[split], "m": m,
           "cost": {"daytrade": round(COST_DT * 100, 3), "overnight": round(COST_ON * 100, 3)},
           "tests": rows, "desc": desc}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    print(f"極短線檢驗 {dates[61]}～{dates[-2]}（樣本外自 {dates[split]}），{m} 個檢驗一起校正")
    print("股票池平均（每天）：", desc)
    for r in rows:
        if "oos" not in r:
            print(f"  {r['pool']} {r['key']} {r['name']}：樣本太少（{r['n']}）")
            continue
        print(f"  {r['pool']} {r['key']} {r['name']:<14} 次數 {r['n']:6d}  每筆扣成本 {r['net']:+.3f}%  勝率 {r['win']}%  "
              f"超額 內 {r['is']['ex']:+.3f}%(t {r['is']['t']}) 外 {r['oos']['ex']:+.3f}%(t {r['oos']['t']}) 外淨 {r['oos']['net']:+.3f}% 多滑價 {r['net_slip']} → {r['verdict']}")


if __name__ == "__main__":
    main()
