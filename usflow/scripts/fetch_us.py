#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
美股日線管線：依 data/universe.json 逐檔抓日線，合併進 data/market/prices.json。

跟 twflow 的逐日檔不同，這裡每次都抓一段完整歷史再合併：
美股來源本來就是「給代號回一整段」，沒有「給日期回全市場」的端點。
合併時新資料覆蓋舊資料（同一天以最新抓到的為準），舊資料不會因為
某次來源失敗而被清掉。

輸出：
  data/market/prices.json   {sym: [[date, close, volume], ...]}（進版控）
  data/market/fetch_log.json 每檔用了哪個來源、失敗原因（給 sanity_check 與除錯）

用法：
  python scripts/fetch_us.py
  python scripts/fetch_us.py --only NVDA,TSM     # 只抓幾檔（除錯用）
  python scripts/fetch_us.py --provider stooq    # 強制只用某個來源（測試來源用）
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

from providers import ProviderError, fetch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UNIVERSE = os.path.join(ROOT, "data", "universe.json")
OUT = os.path.join(ROOT, "data", "market", "prices.json")
LOG = os.path.join(ROOT, "data", "market", "fetch_log.json")

KEEP = 130          # 保留約半年交易日；價格位階用 60 日、MA20 用 20 日，足夠
DELAY = 0.4         # 兩個來源都對高頻請求敏感；141 檔約 1 分鐘


def load(p, default):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def merge(old, new):
    m = {r[0]: r for r in old}
    for r in new:
        m[r[0]] = list(r)
    return [m[d] for d in sorted(m)][-KEEP:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="逗號分隔的代號")
    ap.add_argument("--provider", help="只用這個來源（yahoo / stooq）")
    args = ap.parse_args()

    uni = load(UNIVERSE, None)["symbols"]
    if args.only:
        want = set(args.only.split(","))
        uni = [u for u in uni if u["sym"] in want]

    prices = load(OUT, {})
    log = {"run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "ok": {}, "failed": {}}
    order = [args.provider] if args.provider else None

    for i, it in enumerate(uni):
        sym = it["sym"]
        try:
            src, rows = fetch(it, order=order)
            prices[sym] = merge(prices.get(sym, []), rows)
            log["ok"][sym] = {"src": src, "last": rows[-1][0], "n": len(rows)}
            print(f"[{i+1:3d}/{len(uni)}] {sym:9s} {src:6s} {rows[-1][0]} {rows[-1][1]}")
        except ProviderError as e:
            log["failed"][sym] = str(e)[:300]
            print(f"[{i+1:3d}/{len(uni)}] {sym:9s} 失敗：{e}", file=sys.stderr)
        time.sleep(DELAY)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        # 一檔一行：每日 diff 才看得出哪幾檔變了，整包單行的話 git diff 沒法讀
        f.write("{\n" + ",\n".join(
            f"{json.dumps(k)}:{json.dumps(v, separators=(',', ':'))}"
            for k, v in sorted(prices.items())) + "\n}\n")
    with open(LOG, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)

    srcs = {}
    for v in log["ok"].values():
        srcs[v["src"]] = srcs.get(v["src"], 0) + 1
    print(f"\n成功 {len(log['ok'])}／失敗 {len(log['failed'])}　來源分布 {srcs}")
    # 全部失敗＝來源整個掛了，讓 CI 紅燈；部分失敗交給 sanity_check 判斷是否可接受
    if uni and not log["ok"]:
        sys.exit("所有代號都抓取失敗")


if __name__ == "__main__":
    main()
