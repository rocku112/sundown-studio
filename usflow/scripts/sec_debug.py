#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
除錯用：印出指定公司在各候選科目的近期原始申報列（期間、表單、申報日、數值）。

sec_coverage.py 只看得到「缺了什麼」，看不到「為什麼缺」——要判斷是科目名稱不同、
期間長度不合、還是表單類型被濾掉，得看原始列。

用法：python scripts/sec_debug.py KO V NVDA [--since 2025-10-01]
"""

import argparse

from fetch_sec import TAGS, cik_map, get

FIELDS = ("rev", "eps", "dps")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("syms", nargs="+")
    ap.add_argument("--since", default="2025-12-01")
    args = ap.parse_args()
    cik = cik_map()
    for sym in args.syms:
        c = cik.get(sym) or cik.get(sym.replace("-", "."))
        print(f"\n══ {sym}（CIK {c}）")
        if not c:
            continue
        facts = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json") or {}
        g = facts.get("facts", {}).get("us-gaap", {})
        for k in FIELDS:
            for t in TAGS[k]:
                for u, rows in g.get(t, {}).get("units", {}).items():
                    recent = [r for r in rows if r.get("end", "") >= args.since]
                    if not recent:
                        continue
                    print(f"  [{k}] {t} ({u})：{len(rows)} 列，近期 {len(recent)} 列")
                    for r in sorted(recent, key=lambda r: (r["end"], r.get("filed", "")))[-8:]:
                        print(f"      {r.get('start', '—'):10s} → {r['end']}  {r.get('form', ''):6s}"
                              f" 申報 {r.get('filed', '')}  fp={r.get('fp', '')}  {r['val']}")


if __name__ == "__main__":
    main()
