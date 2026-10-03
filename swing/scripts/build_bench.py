#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
持股健檢的比較基準：0050 五年每日收盤（取自 fetch_hist.py 的快取）。

用途：使用者填了買進日期時，算「當時如果改買 0050，到今天報酬多少」。
只存日期與收盤，約 25 KB。收盤價未含配息，前端照實註明。
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
SRC = os.path.join(ROOT, ".cache", "ohlcv.json")
OUT = os.path.join(REPO, "twflow", "web", "data", "bench.json")
CODES = ["0050"]


def main():
    src = json.load(open(SRC, encoding="utf-8"))["symbols"]
    out = {}
    for c in CODES:
        if c in src:
            rows = src[c]["rows"]
            out[c] = {"name": src[c]["name"], "d": [r[0] for r in rows], "c": [r[4] for r in rows]}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}　" + "、".join(f"{c} {len(v['d'])} 天" for c, v in out.items()))


if __name__ == "__main__":
    main()
