#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台美連動：讀兩個市場已產出的前端資料，產生 twflow/web/data/cross.json
  adr    ADR 換算台幣後相對台股收盤的溢價（含近 30 日走勢）
  links  美股龍頭 → 台股關聯股，附兩邊最新漲跌與 twflow 法人 5 日買賣超

兩條管線（台股 18:40、美股 06:30）跑完都會呼叫這支，誰比較新就用誰的。
兩邊日期不同是常態（例如台股颱風假、美股感恩節），輸出各自標日期，
前端照實顯示「美股 10/02・台股 10/03」，不假裝是同一天。

溢價日期對齊：同一個日曆日的台股收盤（台灣 13:30）與美股收盤（台灣隔天清晨）。
這是市場慣用的比法，但兩者相差約 15 小時，盤中重大消息會讓溢價看起來跳動。
"""

import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
WEB = os.path.join(REPO, "twflow", "web", "data")
LINKS = os.path.join(ROOT, "data", "links.json")
FX = "TWD=X"


def load(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def r2(v, n=2):
    return None if v is None else round(v, n)


def main():
    tw, twh = load(os.path.join(WEB, "latest.json")), load(os.path.join(WEB, "history.json"))
    us, ush = load(os.path.join(WEB, "us", "latest.json")), load(os.path.join(WEB, "us", "history.json"))
    if not (tw and us):
        # 美股管線還沒跑過（或台股缺檔）時不產出，前端會顯示「尚無資料」
        print("缺少台股或美股的 latest.json，略過台美連動")
        return
    tsd, usd = tw["stock_data"], us["stock_data"]
    search = load(os.path.join(WEB, "search.json")) or {}

    # ── ADR 溢價 ────────────────────────────────────────────────
    fx_now = (usd.get(FX) or {}).get("price")
    tw_dates = twh["dates"] if twh else []
    us_dates = ush["dates"] if ush else []
    fx_h = dict(zip(us_dates, (ush["stocks"].get(FX) or {}).get("c", []))) if ush else {}
    adr = []
    for sym, d in usd.items():
        if d.get("type") != "adr" or not d.get("tw"):
            continue
        code, ratio = d["tw"], d["ratio"]
        t = tsd.get(code) or {}
        prem = None
        if fx_now and d.get("price") and t.get("price"):
            prem = r2((d["price"] * fx_now / ratio / t["price"] - 1) * 100)
        # 走勢：取兩邊都有收盤的日子；匯率缺（台灣假日美股照開）用前一筆
        series = []
        if twh and ush:
            tc = dict(zip(tw_dates, (twh["stocks"].get(code) or {}).get("c", [])))
            uc = dict(zip(us_dates, (ush["stocks"].get(sym) or {}).get("c", [])))
            fx_last = None
            for dt in sorted(set(us_dates) | set(tw_dates)):
                fx_last = fx_h.get(dt) or fx_last
                if tc.get(dt) and uc.get(dt) and fx_last:
                    series.append([dt, r2((uc[dt] * fx_last / ratio / tc[dt] - 1) * 100)])
        vals = [p for _, p in series]
        adr.append({
            "us": sym, "tw": code, "name": t.get("name") or d["name"], "ratio": ratio,
            "us_price": d.get("price"), "us_chg_1d": d.get("chg_1d"),
            "tw_price": t.get("price"), "tw_chg_1d": t.get("chg_1d"),
            "premium": prem,
            "premium_avg": r2(sum(vals) / len(vals)) if vals else None,
            "series": series[-30:],
        })

    # ── 美股 → 台股關聯 ──────────────────────────────────────────
    links, bad, warn = [], [], []
    universe = {x["sym"] for x in load(os.path.join(ROOT, "data", "universe.json"))["symbols"]}
    for L in load(LINKS)["links"]:
        u = usd.get(L["us"])
        if L["us"] not in universe:
            bad.append(f"美股 {L['us']} 不在 universe.json")
            continue
        if not u:
            # 來源當天缺這檔是資料問題、不是對照表錯誤：只警告，不擋整條管線
            warn.append(f"美股 {L['us']} 今日無資料，略過")
            continue
        rows = []
        for code, role in L["tw"]:
            if code not in search:
                bad.append(f"{L['us']} → 台股 {code} 不存在")
                continue
            t = tsd.get(code) or {}
            rows.append({"code": code, "name": t.get("name") or search[code], "role": role,
                         "price": t.get("price"), "chg_1d": t.get("chg_1d"),
                         "net_5d_yi": t.get("net_5d_yi"), "streak": t.get("streak")})
        links.append({"us": L["us"], "name": u["name"], "theme": L["theme"],
                      "chg_1d": u.get("chg_1d"), "chg_5d": u.get("chg_5d"), "tw": rows})

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "us_date": us["date"], "tw_date": tw["date"], "fx": fx_now,
        "adr": adr, "links": links,
    }
    with open(os.path.join(WEB, "cross.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"台美連動：美股 {us['date']}・台股 {tw['date']}・ADR {len(adr)} 檔・"
          f"關聯 {len(links)} 組・匯率 {fx_now}")
    for w in warn:
        print("⚠️ " + w)
    if bad:
        # 對照表打錯字要讓 CI 紅燈，不然那一列會默默消失
        sys.exit("links.json 有問題：\n  " + "\n  ".join(bad))


if __name__ == "__main__":
    main()
