#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/market/prices.json ＋ data/fundamentals.json → 前端資料
  twflow/web/data/us/latest.json   晨報、板塊、個股指標、搜尋表
  twflow/web/data/us/history.json  近 30 日收盤＋MA20＋成交量（開個股頁才載）

用語原則（見 DESIGN.md §3）：美股沒有法人買賣超，這裡所有「資金」類指標
都是由價量推出的代理數字，一律叫「成交熱度」，不可以寫成「買超／流入」。
"""

import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
UNIVERSE = os.path.join(ROOT, "data", "universe.json")
PRICES = os.path.join(ROOT, "data", "market", "prices.json")
FUND = os.path.join(ROOT, "data", "fundamentals.json")
WEB = os.path.join(REPO, "twflow", "web", "data", "us")

HIST_N = 30
CAL_SYM = "SPY"         # 以 SPY 的交易日當美股日曆（指數在部分來源會缺）
SUSPECT = 40            # 單日漲跌超過這個 % 多半是來源還沒還原分割／合併——先不顯示漲跌
WITHHOLD = 0.30         # 非美國稅務居民的股利預扣稅率（台灣與美國無租稅協定）
SURGE = 2.0             # 成交量是 20 日均量的幾倍算「爆量」


def load(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def r2(v, n=2):
    return None if v is None else round(v, n)


def chg(a, b):
    return None if (a is None or not b) else (a / b - 1) * 100


def metrics(rows, cal):
    """rows: [[date, close, vol]]；cal: 美股交易日（遞增）。對齊到日曆，缺的補 None。"""
    by = {r[0]: r for r in rows}
    c = [by[d][1] if d in by else None for d in cal]
    v = [by[d][2] if d in by else None for d in cal]
    if c[-1] is None:          # 最新交易日沒資料：價格顯示最後一筆，但不算當日漲跌
        last = next((x for x in reversed(rows)), None)
        return {"price": last[1] if last else None, "stale": last[0] if last else None}, c, v

    def back(n):
        i = len(c) - 1 - n
        return c[i] if i >= 0 else None

    win20 = [x for x in c[-20:] if x is not None]
    win60 = [x for x in c[-60:] if x is not None]
    vol20 = [x for x in v[-21:-1] if x]
    m = {
        "price": r2(c[-1], 2),
        "chg_1d": r2(chg(c[-1], back(1))),
        # 殖利率類指標（^TNX）看的是「幾個基點」，不是百分比漲跌
        "diff_1d": r2(c[-1] - back(1), 4) if back(1) is not None else None,
        "chg_5d": r2(chg(c[-1], back(5))),
        "chg_20d": r2(chg(c[-1], back(20))),
        "ma20": r2(sum(win20) / len(win20)) if len(win20) >= 15 else None,
    }
    if len(win60) >= 40:
        lo, hi = min(win60), max(win60)
        m["position"] = r2((c[-1] - lo) / (hi - lo) * 100, 1) if hi > lo else None
    if v[-1] and len(vol20) >= 15:
        m["vol_ratio"] = r2(v[-1] / (sum(vol20) / len(vol20)))
        # 成交值（百萬美元）——板塊熱度的權重
        m["dollar_m"] = r2(c[-1] * v[-1] / 1e6, 1)
        m["dollar20_m"] = r2(c[-1] * sum(vol20) / len(vol20) / 1e6, 1)
    return m, c, v


def ma(c, n=20):
    out = []
    for i in range(len(c)):
        w = [x for x in c[max(0, i - n + 1):i + 1] if x is not None]
        out.append(r2(sum(w) / len(w)) if len(w) >= min(15, i + 1) and c[i] is not None else None)
    return out


def main():
    uni = load(UNIVERSE)
    prices = load(PRICES, {})
    fund = load(FUND, {"stocks": {}})["stocks"]
    if CAL_SYM not in prices:
        raise SystemExit(f"prices.json 沒有 {CAL_SYM}，無法決定美股交易日——先跑 fetch_us.py")
    cal = [r[0] for r in prices[CAL_SYM]]
    date = cal[-1]

    stock_data, hist = {}, {}
    hcal = cal[-(HIST_N + 19):]          # 多留 19 天讓第一天就有 MA20
    for it in uni["symbols"]:
        sym = it["sym"]
        rows = prices.get(sym)
        if not rows:
            continue
        m, c, v = metrics(rows, cal)
        # 單檔異常（例：ETHA 某日 +200%，來源未還原分割）不該擋住整天的更新：
        # 只拿掉這檔的漲跌類欄位，標記待確認；板塊、排行、漲跌家數自然不會算到它
        if m.get("chg_1d") is not None and abs(m["chg_1d"]) > SUSPECT:
            print(f"⚠️  {sym} 單日 {m['chg_1d']}%，疑似來源未還原分割，先不顯示漲跌", file=sys.stderr)
            m = {"price": m["price"], "suspect": m["chg_1d"]}
        d = {"name": it["name"], "type": it["type"], "sector": it.get("sector"), **m}
        f = fund.get(sym)
        if f:
            d["quarters"] = f.get("quarters", [])[-4:]
            px = d.get("price")
            eps, dps = f.get("eps_ttm"), f.get("dps_ttm")
            d["eps_ttm"] = eps
            d["gm_ttm"] = f.get("gm_ttm")
            # 虧損時本益比沒有意義，不顯示負數本益比
            d["pe"] = r2(px / eps, 1) if (px and eps and eps > 0) else None
            if dps and px:
                d["dps_ttm"] = dps
                d["yield"] = r2(dps / px * 100)
                d["yield_net"] = r2(dps * (1 - WITHHOLD) / px * 100)
        if it.get("tw"):
            d["tw"], d["ratio"] = it["tw"], it["ratio"]
        stock_data[sym] = d

        hc = c[-len(hcal):]
        mm = ma(hc)
        hv = v[-len(hcal):]
        hist[sym] = {"c": hc[-HIST_N:], "m": mm[-HIST_N:], "v": hv[-HIST_N:]}

    # ── 板塊：等權平均漲跌、上漲家數、成交熱度 ─────────────────────
    sectors = []
    for sec in uni["sectors"]:
        mem = [s for s, d in stock_data.items()
               if d["sector"] == sec and d["type"] in ("stock", "adr") and "chg_1d" in d]
        if not mem:
            continue
        ds = [stock_data[s] for s in mem]
        avg = lambda k: r2(sum(x[k] for x in ds if x.get(k) is not None) /
                           max(1, sum(1 for x in ds if x.get(k) is not None)))
        dv = sum(x.get("dollar_m") or 0 for x in ds)
        dv20 = sum(x.get("dollar20_m") or 0 for x in ds)
        etf = stock_data.get(uni["sector_etf"].get(sec), {})
        top = max(ds, key=lambda x: abs(x.get("chg_1d") or 0))
        sectors.append({
            "name": sec, "etf": uni["sector_etf"].get(sec),
            "etf_chg_1d": etf.get("chg_1d"), "etf_chg_5d": etf.get("chg_5d"),
            "chg_1d": avg("chg_1d"), "chg_5d": avg("chg_5d"), "chg_20d": avg("chg_20d"),
            "breadth": [sum(1 for x in ds if (x.get("chg_1d") or 0) > 0), len(ds)],
            "heat": r2(dv / dv20) if dv20 else None,
            "dollar_m": r2(dv, 0),
            "stocks": sorted(mem, key=lambda s: -(stock_data[s].get("dollar20_m") or 0)),
            "top": next(s for s in mem if stock_data[s] is top),
        })

    eq = [(s, d) for s, d in stock_data.items()
          if d["type"] in ("stock", "adr") and d.get("chg_1d") is not None]
    movers_up = [s for s, _ in sorted(eq, key=lambda x: -x[1]["chg_1d"])[:10]]
    movers_dn = [s for s, _ in sorted(eq, key=lambda x: x[1]["chg_1d"])[:10]]
    surge = [s for s, d in sorted(eq, key=lambda x: -(x[1].get("vol_ratio") or 0))
             if (d.get("vol_ratio") or 0) >= SURGE][:10]
    adv = sum(1 for _, d in eq if d["chg_1d"] > 0)

    latest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "date": date,
        "indices": [s for s in ("^GSPC", "^IXIC", "^DJI", "^SOX", "^VIX", "^TNX",
                                "DX-Y.NYB", "TWD=X") if s in stock_data],
        "sectors": sectors,
        "movers": {"up": movers_up, "down": movers_dn, "surge": surge},
        "breadth": [adv, len(eq)],
        "stock_data": stock_data,
        "withhold": WITHHOLD,
    }
    os.makedirs(WEB, exist_ok=True)
    with open(os.path.join(WEB, "latest.json"), "w", encoding="utf-8") as f:
        json.dump(latest, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(WEB, "history.json"), "w", encoding="utf-8") as f:
        json.dump({"dates": hcal[-HIST_N:], "stocks": hist}, f,
                  ensure_ascii=False, separators=(",", ":"))
    print(f"美股 {date}：{len(stock_data)} 檔、{len(sectors)} 板塊、"
          f"上漲 {adv}/{len(eq)}、爆量 {len(surge)}")


if __name__ == "__main__":
    main()
