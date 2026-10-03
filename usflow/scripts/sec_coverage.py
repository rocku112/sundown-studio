#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基本面覆蓋率報告：哪些股票缺 EPS／股利／毛利率、哪些季報停在很久以前。

只印報告、不會失敗——缺漏多半是公司申報科目不同，需要人看過再決定要不要補科目。
銀行與保險沒有「毛利」這個概念，缺毛利率是正常的，另外標出。
"""

import json
import os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STALE = 150         # 末季截止日距今超過幾天算「停更」（季報最晚約 45 天內申報）
FIN = "金融"


def main():
    f = json.load(open(os.path.join(ROOT, "data", "fundamentals.json"), encoding="utf-8"))
    uni = {u["sym"]: u for u in json.load(open(os.path.join(ROOT, "data", "universe.json"),
                                               encoding="utf-8"))["symbols"]}
    st, today = f["stocks"], date.today()
    rows = []
    for sym, v in sorted(st.items()):
        q = v.get("quarters") or []
        last = q[-1]["end"] if q else None
        age = (today - date.fromisoformat(last)).days if last else None
        miss = [k for k, lab in (("eps_ttm", "EPS"), ("dps_ttm", "股利"), ("gm_ttm", "毛利率"))
                if v.get(k) is None and not (lab == "毛利率" and uni.get(sym, {}).get("sector") == FIN)]
        if miss or (age and age > STALE):
            rows.append((sym, miss, last, age, v.get("tags", {})))
    n = len(st)
    cnt = lambda k: sum(1 for v in st.values() if v.get(k) is not None)
    print(f"共 {n} 家：EPS {cnt('eps_ttm')}、股利 {cnt('dps_ttm')}、毛利率 {cnt('gm_ttm')}　"
          f"（SEC 失敗 {len(f.get('failed', {}))} 家：{f.get('failed')}）")
    print(f"需要看的 {len(rows)} 家（缺欄位、或末季超過 {STALE} 天）：")
    for sym, miss, last, age, tags in rows:
        print(f"  {sym:6s} 缺 {'、'.join(miss) or '—':12s} 末季 {last}（{age} 天前）  科目 {tags}")


if __name__ == "__main__":
    main()
