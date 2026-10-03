#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
提交前檢查美股資料是否合理；不合理就以非零結束，CI 不會提交。

跟 twflow 同一個原則：寧可今天不更新，也不要把壞資料推給使用者——
壞資料不會報錯，只會讓頁面「看起來正常但數字是錯的」。
"""

import json
import os
import sys
from datetime import date, datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
WEB = os.path.join(REPO, "twflow", "web", "data")

MIN_COVER = 0.90        # 最新交易日有資料的比例
MAX_AGE = 6             # 最新交易日距今最多幾天（含週末＋連假）
MAX_MOVE = 40           # 大型股單日漲跌超過這個 % 多半是來源錯（未還原分割）


def main():
    errs, warns = [], []
    us = json.load(open(os.path.join(WEB, "us", "latest.json"), encoding="utf-8"))
    sd = us["stock_data"]
    uni = json.load(open(os.path.join(ROOT, "data", "universe.json"), encoding="utf-8"))["symbols"]

    age = (datetime.now(timezone.utc).date() - date.fromisoformat(us["date"])).days
    if age > MAX_AGE:
        errs.append(f"最新交易日 {us['date']} 已是 {age} 天前")

    eq = [u["sym"] for u in uni if u["type"] in ("stock", "adr", "etf", "sector_etf")]
    fresh = [s for s in eq if sd.get(s, {}).get("chg_1d") is not None]
    cover = len(fresh) / len(eq)
    if cover < MIN_COVER:
        missing = sorted(set(eq) - set(fresh))
        errs.append(f"最新交易日只有 {cover:.0%} 的代號有資料，缺：{missing[:20]}")
    elif len(fresh) < len(eq):
        warns.append(f"缺 {sorted(set(eq) - set(fresh))}")

    for s in fresh:
        d = sd[s]
        if abs(d["chg_1d"]) > MAX_MOVE:
            errs.append(f"{s} 單日 {d['chg_1d']}%，疑似來源錯誤")
        if not d.get("price") or d["price"] <= 0:
            errs.append(f"{s} 價格 {d.get('price')}")

    fx = sd.get("TWD=X", {}).get("price")
    if not fx or not (20 < fx < 45):
        errs.append(f"美元兌台幣 {fx} 不合理（ADR 溢價會全錯）")

    if len(us["sectors"]) < 10:
        errs.append(f"只有 {len(us['sectors'])} 個板塊")

    # 基本面只警告：SEC 一週才更新一次，偶爾缺幾檔不該擋住每日價量
    nf = sum(1 for d in sd.values() if d.get("type") == "stock" and d.get("eps_ttm") is not None)
    ns = sum(1 for d in sd.values() if d.get("type") == "stock")
    if ns and nf / ns < 0.8:
        warns.append(f"只有 {nf}/{ns} 檔有 TTM EPS")

    cross = os.path.join(WEB, "cross.json")
    if os.path.exists(cross):
        c = json.load(open(cross, encoding="utf-8"))
        for a in c["adr"]:
            p = a.get("premium")
            # 台積電 ADR 溢價歷史上約 -5%～+30%；超出很多幾乎一定是換算比例或匯率錯
            if p is not None and not (-30 < p < 60):
                errs.append(f"{a['us']} ADR 溢價 {p}%，檢查 ratio 或匯率")

    for w in warns:
        print("⚠️ ", w)
    if errs:
        print("\n".join("❌ " + e for e in errs))
        sys.exit(1)
    print(f"✅ 美股 {us['date']}：{len(fresh)}/{len(eq)} 檔、匯率 {fx}、基本面 {nf}/{ns}")


if __name__ == "__main__":
    main()
