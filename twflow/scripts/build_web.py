#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
產生前端要的三份資料。build_sectors.py 只算板塊，這裡負責把「畫面上會出現的
每一個數字」都準備好。

輸出：
  web/data/latest.json   板塊 + 全市場個股當日數字 + 今日重點
  web/data/history.json  每檔近 30 日 收盤/成交量/法人淨額（個股頁走勢圖）
  web/data/search.json   代號→名稱（搜尋用，含沒進任何板塊的股票）

指標定義都寫在各段註解裡，前端不重算，避免同一個數字兩邊算法不一致。
"""

import json
import os
from datetime import datetime, timedelta, timezone

import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
WEB = os.path.join(ROOT, "web", "data")

HIST_DAYS = 30
# 異常大買/大賣門檻：當日淨額 > 這檔自己近 20 日「日均絕對進出量」的幾倍。
# 重點是跟自己比不是跟別檔比——平常一天進出 2 億的股票突然被買 20 億是異常，
# 台積電被買 20 億是日常。2.5 是看實際分布挑的：全市場約 4~6% 的個股會觸發，
# 少到值得看、多到每天都有東西可看。
ANOMALY_K = 2.5
ANOMALY_FLOOR = 0.3        # 億。避免平常幾乎不交易的冷門股天天觸發


def arr(v, T):
    return np.array([np.nan if x is None else float(x) for x in v], dtype=float) \
        if v else np.full(T, np.nan)


def r2(x, n=2):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def main():
    panel = load(os.path.join(DATA, "market", "panel.json"))
    market = load(os.path.join(DATA, "market", "market.json"))["days"]
    sec_doc = load(os.path.join(WEB, "latest.json"))

    dates = panel["dates"]
    S = panel["stocks"]
    T = len(dates)
    sectors = sec_doc["sectors"]
    mkt_by_date = {m["date"]: m for m in market}
    last_mkt = mkt_by_date.get(dates[-1], {})

    # ── 個股當日數字（全市場，不只板塊成分股）────────────────────────
    # 搜尋與個股頁要能查到任何一檔；只放板塊成分股的話，使用者搜 2330
    # 卻查不到會覺得是壞的。
    sd = {}
    for code, v in S.items():
        close = arr(v["close"], T)
        net = arr(v["net_yi"], T)
        # 用「整段期間有沒有成交過」當門檻，而不是「最後一天有沒有收盤價」。
        # 停牌或當日無成交的股票最後一天是空的，但它可能仍是某板塊的成分股，
        # 濾掉的話面板點進去會開不出個股頁（sanity_check 抓到過 5 檔）。
        if not np.isfinite(close).any():
            continue
        # 最後一個有效收盤價：停牌期間顯示最後成交價，比顯示空白有意義
        fin = close[np.isfinite(close)]
        last_close = float(fin[-1]) if fin.size else None

        def win(a, n):
            w = a[-n:]
            return float(np.nansum(w)) if np.isfinite(w).any() else None

        # 力道基準：近 20 日逐日取絕對值再平均。用 |20日淨額|/20 會讓
        # 來回進出的股票基準趨近 0，於是天天被判成異常。
        w20 = net[-20:]
        avg_abs = float(np.nanmean(np.abs(w20))) if np.isfinite(w20).any() else 0.0

        n1 = float(net[-1]) if np.isfinite(net[-1]) else 0.0
        thr = max(ANOMALY_K * avg_abs, ANOMALY_FLOOR)
        anomaly = None
        if abs(n1) > thr:
            anomaly = "異常大買" if n1 > 0 else "異常大賣"

        # 資金停留：連續同方向淨買賣天數（正＝連買）
        streak = 0
        for x in net[::-1]:
            if not np.isfinite(x) or x == 0:
                break
            if x > 0 and streak >= 0:
                streak += 1
            elif x < 0 and streak <= 0:
                streak -= 1
            else:
                break

        # 價格位階：近 60 日高低區間的百分位。0=波段低點、100=波段高點。
        lo, hi = float(np.nanmin(close)), float(np.nanmax(close))
        position = None if (hi - lo < 1e-9 or last_close is None)             else (last_close - lo) / (hi - lo) * 100

        sd[code] = {
            "name": v["name"], "market": v["market"],
            "price": r2(last_close),
            "chg_1d": r2(arr(v["chg"], T)[-1]),
            "net_1d_yi": r2(n1, 3),
            "net_5d_yi": r2(win(net, 5), 2),
            "net_20d_yi": r2(win(net, 20), 2),
            # 法人分項用「股數」轉金額：股數 × 當日收盤 ÷ 1e8
            "foreign_5d": r2(win(arr(v["foreign"], T) * close / 1e8, 5), 2),
            "trust_5d": r2(win(arr(v["trust"], T) * close / 1e8, 5), 2),
            "dealer_5d": r2(win(arr(v["dealer"], T) * close / 1e8, 5), 2),
            "avg_abs_20d": r2(avg_abs, 3),
            # 力道倍數：今天是平常的幾倍
            "power": r2(abs(n1) / avg_abs, 1) if avg_abs > 1e-6 else None,
            "streak": streak,
            "anomaly": anomaly,
            "position": r2(position, 1),
        }

    # ── 個股 → 所屬板塊 ─────────────────────────────────────────────
    stock_sectors = {}
    for s in sectors:
        for c in s["stocks"]:
            stock_sectors.setdefault(c, []).append(s["name"])

    # ── 板塊補充：廣度與主力 ────────────────────────────────────────
    # 板塊淨額是成分股加總，一檔大的就能撐起整個板塊。
    # 例：某日「記憶體模組 +24.7 億」的真相可能是單一檔 +31 億、其餘全在被賣。
    # 給出「幾檔在買」與「最大貢獻股」，使用者自己就分得出「全員一致」和
    # 「一檔在演」。只給數字、不下判斷（投顧法只能陳述事實）。
    for s in sectors:
        buys = [c for c in s["stocks"] if (sd.get(c, {}).get("net_5d_yi") or 0) > 0]
        s["breadth"] = [len(buys), len(s["stocks"])]
        best = max(s["stocks"],
                   key=lambda c: abs(sd.get(c, {}).get("net_5d_yi") or 0),
                   default=None)
        if best and sd.get(best):
            s["top"] = {"code": best, "name": sd[best]["name"],
                        "net_5d_yi": sd[best]["net_5d_yi"]}

    # ── 今日重點 ───────────────────────────────────────────────────
    adv = last_mkt.get("advancers") or 0
    dec = last_mkt.get("decliners") or 0
    # 情緒指數 0–100：越高越恐慌。用下跌家數占比當主體，這是最直接的
    # 「今天多少人在虧」。刻意不用漲跌色呈現，避免「紅=漲」的慣例造成
    # 「紅=恐慌」誤讀。
    down_ratio = dec / (adv + dec) if (adv + dec) else 0.5
    score = int(round(down_ratio * 100))
    label = "恐慌" if score >= 60 else ("中性" if score >= 40 else "樂觀")

    def top_stocks(sign, n=5):
        rows = [
            {"code": c, "name": d["name"], "net_1d_yi": d["net_1d_yi"],
             "chg_1d": d["chg_1d"], "power": d["power"]}
            for c, d in sd.items()
            if d["anomaly"] and (d["net_1d_yi"] or 0) * sign > 0
        ]
        rows.sort(key=lambda r: -abs(r["net_1d_yi"] or 0))
        return rows[:n]

    # 成效回顧：上一交易日法人買最多的 3 個板塊，今天表現如何。
    # 天天公開對帳——這是信任的來源，而且成本幾乎為零。
    review = None
    if T >= 2:
        prev = []
        for s in sectors:
            members = [c for c in s["stocks"] if c in S]
            if not members:
                continue
            f = np.nansum(np.vstack([arr(S[c]["net_yi"], T) for c in members]), axis=0)
            g = np.nanmean(np.vstack([arr(S[c]["chg"], T) for c in members]), axis=0)
            if np.isfinite(f[-2]) and np.isfinite(g[-1]):
                prev.append((float(f[-2]), s["name"], float(g[-1])))
        prev.sort(reverse=True)
        picked = prev[:3]
        if picked:
            review = {
                "prev_date": dates[-2],
                "label": "法人買最多",
                "n": len(picked),
                "avg_chg": r2(float(np.mean([p[2] for p in picked]))),
                "sectors": [{"name": p[1], "chg_1d": r2(p[2])} for p in picked],
            }

    is_down = (last_mkt.get("twse_chg_pct") or 0) < -1.0
    # 逆勢買超：大盤重挫日，板塊自己也在跌、法人卻異常大買它。
    # 門檻不是固定金額，是跟這個板塊自己的常態比（近20日日均絕對進出 × 1.5，
    # 保底 3 億）。平常吞吐 2 億的小板塊買 4 億就異常，大板塊買 4 億只是日常。
    bottom = []
    if is_down:
        for s in sectors:
            base = max((s.get("avg_abs_daily_20d") or 0) * 1.5, 3.0)
            if s["chg_1d"] < -0.5 and s["net_1d_yi"] > base:
                bottom.append({"name": s["name"], "net_1d_yi": s["net_1d_yi"],
                               "chg_1d": s["chg_1d"]})
        bottom.sort(key=lambda x: -x["net_1d_yi"])
        bottom = bottom[:5]

    digest = {
        "sentiment": {"score": score, "label": label,
                      "advancers": adv, "decliners": dec},
        "big_money": {"buy": top_stocks(1), "sell": top_stocks(-1)},
        "review": review,
        "bottom_fishing": bottom,
        "anomaly_count": sum(1 for d in sd.values() if d["anomaly"]),
    }

    # ── 寫檔 ───────────────────────────────────────────────────────
    doc = dict(sec_doc)
    doc.update({
        "generated_at": datetime.now(timezone(timedelta(hours=8)))
                        .isoformat(timespec="seconds"),
        "market": {
            "index": last_mkt.get("twse_index"),
            "chg_pct": last_mkt.get("twse_chg_pct"),
            "advancers": adv, "decliners": dec,
        },
        "sectors": sectors,
        "stock_data": sd,
        "stock_sectors": stock_sectors,
        "digest": digest,
    })
    with open(os.path.join(WEB, "latest.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    # 近 30 日走勢（個股頁）。四捨五入到有意義的位數，檔案小一半。
    hist = {}
    for code, v in S.items():
        if code not in sd:
            continue
        full = arr(v["close"], T)
        # 月線要用完整序列算再切片。只拿 30 天的窗去算 MA20，前 19 天都會是空的，
        # 圖上會出現一條「憑空開始」的線。
        ma = np.full(T, np.nan)
        for i in range(19, T):
            w = full[i - 19:i + 1]
            if np.isfinite(w).sum() >= 15:
                ma[i] = np.nanmean(w)
        close = full[-HIST_DAYS:]
        vol = arr(v["vol"], T)[-HIST_DAYS:]
        net = arr(v["net_yi"], T)[-HIST_DAYS:]
        hist[code] = {
            "c": [r2(x) for x in close],
            "v": [None if not np.isfinite(x) else int(x / 1000) for x in vol],  # 張
            "n": [r2(x, 2) for x in net],
            "m": [r2(x) for x in ma[-HIST_DAYS:]],
        }
    with open(os.path.join(WEB, "history.json"), "w", encoding="utf-8") as f:
        json.dump({"dates": dates[-HIST_DAYS:], "stocks": hist},
                  f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(WEB, "search.json"), "w", encoding="utf-8") as f:
        json.dump({c: d["name"] for c, d in sd.items()},
                  f, ensure_ascii=False, separators=(",", ":"))

    def mb(p):
        return os.path.getsize(os.path.join(WEB, p)) / 1e6

    print(f"個股 {len(sd)} 檔（含未進板塊者）｜異常 {digest['anomaly_count']} 檔"
          f"｜情緒 {score} {label}")
    print(f"latest.json {mb('latest.json'):.2f} MB｜history.json {mb('history.json'):.2f} MB"
          f"｜search.json {mb('search.json'):.2f} MB")


if __name__ == "__main__":
    main()
