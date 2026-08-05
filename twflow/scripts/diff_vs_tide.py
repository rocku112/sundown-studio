#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
比對「官方產業價值鏈骨架」與「Tide 的 108 板塊」。

目的不是抄，是定位：
  · 我們的骨架覆蓋得到哪些、覆蓋不到哪些
  · Tide 有哪些「官方沒有的自創題材板塊」——那才是他真正手工做出來的價值
  · 官方有哪些節點是 Tide 沒模型化的
  · 顆粒度差在哪

Tide 的分類表僅作為**驗證基準**（benchmark），不作為出貨資產。

用法：python scripts/diff_vs_tide.py
輸出：data/diff_report.md
"""

import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
REF = os.path.join(DATA, "reference")

# Tide 只收上市＋上櫃；官方平台還含興櫃。比對時要拉到同一條基準線，
# 否則「我們多涵蓋 400 檔」這個數字有一大半只是興櫃，不是真的贏。
TRADEABLE = {"本國上市公司", "外國上市公司", "本國上櫃公司", "外國上櫃公司"}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / len(a | b)


def overlap_coef(a, b):
    """重疊係數：交集 / 較小集合。用來抓「官方大節點包住 Tide 小板塊」的情況，
    Jaccard 在集合大小差很多時會被稀釋，看不出其實是包含關係。"""
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def main():
    chain = load(os.path.join(DATA, "ic_chain.json"))
    leaves = load(os.path.join(DATA, "ic_leaves.json"))["leaves"]
    tide = load(os.path.join(REF, "tide_latest.json"))
    names = load(os.path.join(REF, "tide_stock_names.json"))
    groups = load(os.path.join(REF, "tide_sector_groups.json"))

    # ── 上市櫃白名單（用於公平比較）─────────────────────────────────
    listed = set()
    for ch in chain["chains"]:
        for nd in ch["nodes"]:
            buckets = [nd["companies"]] + [s["companies"] for s in nd["subnodes"]]
            for lst in buckets:
                for c in lst:
                    if c.get("listing") in TRADEABLE:
                        listed.add(c["code"])

    ic_all = {c for lf in leaves for c in lf["stocks"]}
    ic_listed = ic_all & listed

    tide_sectors = {s["name"]: set(s.get("stocks", [])) for s in tide["sectors"]}
    tide_all = set().union(*tide_sectors.values()) if tide_sectors else set()

    # ── 1. 覆蓋率 ────────────────────────────────────────────────
    only_tide = tide_all - ic_all
    only_ic = ic_listed - tide_all

    # ── 2. 每個 Tide 板塊 → 最佳官方葉節點 ────────────────────────
    matches = []
    for tname, tstocks in tide_sectors.items():
        ts = tstocks & listed  # 拉到同一基準
        best = (0.0, 0.0, None)
        for lf in leaves:
            ls = set(lf["stocks"]) & listed
            j = jaccard(ts, ls)
            if j > best[0]:
                best = (j, overlap_coef(ts, ls), lf)
        matches.append({
            "tide": tname, "n": len(ts),
            "jaccard": best[0], "overlap": best[1],
            "leaf": best[2]["path"] if best[2] else None,
            "leaf_n": len(set(best[2]["stocks"]) & listed) if best[2] else 0,
        })
    matches.sort(key=lambda m: m["jaccard"])

    STRONG, WEAK = 0.50, 0.20
    novel = [m for m in matches if m["jaccard"] < WEAK]
    partial = [m for m in matches if WEAK <= m["jaccard"] < STRONG]
    strong = [m for m in matches if m["jaccard"] >= STRONG]

    # ── 3. 官方葉節點 → 有沒有 Tide 對應 ──────────────────────────
    unmodelled = []
    for lf in leaves:
        ls = set(lf["stocks"]) & listed
        if len(ls) < 3:
            continue
        best = max((jaccard(ls, ts & listed) for ts in tide_sectors.values()),
                   default=0.0)
        if best < WEAK:
            unmodelled.append((len(ls), lf["path"]))
    unmodelled.sort(reverse=True)

    # ── 4. 多重歸屬程度 ──────────────────────────────────────────
    ic_member = Counter()
    for lf in leaves:
        for c in set(lf["stocks"]) & listed:
            ic_member[c] += 1
    tide_member = Counter()
    for ts in tide_sectors.values():
        for c in ts:
            tide_member[c] += 1

    def dist(counter):
        d = Counter(counter.values())
        return {k: d[k] for k in sorted(d)}

    # ── 5. 葉節點規模分布 ────────────────────────────────────────
    sizes = sorted((len(set(lf["stocks"]) & listed) for lf in leaves), reverse=True)
    tide_sizes = sorted((len(s) for s in tide_sectors.values()), reverse=True)

    def pct(v, n):
        return f"{v/n*100:.1f}%" if n else "—"

    L = []
    w = L.append
    w("# 官方產業價值鏈骨架 vs Tide 108 板塊：差異報告")
    w("")
    w(f"- 官方骨架抓取時間：{chain['fetched_at']}")
    w(f"- Tide 資料日期：{tide['date']}")
    w("- Tide 分類表僅作驗證基準，不作出貨資產")
    w("")
    w("## 1. 覆蓋率")
    w("")
    w("| | 官方骨架 | Tide |")
    w("|---|---|---|")
    w(f"| 分類數 | **{len(leaves)}** 葉節點 | 108 板塊 |")
    w(f"| 涵蓋個股（全部）| {len(ic_all)} | {len(tide_all)} |")
    w(f"| 涵蓋個股（僅上市櫃）| {len(ic_listed)} | {len(tide_all)} |")
    w(f"| 有上下游結構 | 是（47 鏈）| 否 |")
    w("")
    w(f"- Tide 有、官方骨架沒有：**{len(only_tide)} 檔**")
    w(f"- 官方骨架有、Tide 沒有（上市櫃）：**{len(only_ic)} 檔**")
    w("")
    if only_tide:
        sample = sorted(only_tide)[:40]
        w("Tide 獨有樣本（前 40）：")
        w("")
        w("`" + " ".join(f"{c}{names.get(c,'')}" for c in sample) + "`")
        w("")
    if only_ic:
        sample = sorted(only_ic)[:40]
        w("官方獨有樣本（前 40，上市櫃）：")
        w("")
        w("`" + " ".join(sample) + "`")
        w("")

    w("## 2. Tide 的 108 板塊，官方對得上嗎")
    w("")
    w(f"| 對應強度 | 數量 | 佔比 |")
    w("|---|---|---|")
    w(f"| 強對應（Jaccard ≥ .50）| {len(strong)} | {pct(len(strong),108)} |")
    w(f"| 部分對應（.20–.50）| {len(partial)} | {pct(len(partial),108)} |")
    w(f"| **無對應（< .20）＝他自創的題材板塊** | **{len(novel)}** | **{pct(len(novel),108)}** |")
    w("")
    w("### 2a. 他自創、官方沒有的板塊（這是他真正的手工價值）")
    w("")
    w("| Tide 板塊 | 成分股 | 最接近的官方節點 | Jaccard | 重疊係數 |")
    w("|---|---|---|---|---|")
    for m in novel:
        w(f"| **{m['tide']}** | {m['n']} | {m['leaf'] or '—'} | {m['jaccard']:.2f} | {m['overlap']:.2f} |")
    w("")
    w("### 2b. 部分對應（官方有相近節點，但顆粒度或成分不同）")
    w("")
    w("| Tide 板塊 | 成分股 | 官方節點 | 官方成分股 | Jaccard |")
    w("|---|---|---|---|---|")
    for m in partial:
        w(f"| {m['tide']} | {m['n']} | {m['leaf']} | {m['leaf_n']} | {m['jaccard']:.2f} |")
    w("")
    w("### 2c. 強對應（官方骨架直接可用）")
    w("")
    w("| Tide 板塊 | 官方節點 | Jaccard |")
    w("|---|---|---|")
    for m in sorted(strong, key=lambda x: -x["jaccard"]):
        w(f"| {m['tide']} | {m['leaf']} | {m['jaccard']:.2f} |")
    w("")

    w("## 3. 官方有、Tide 沒模型化的節點（≥3 檔上市櫃）")
    w("")
    w(f"共 **{len(unmodelled)}** 個。前 60 名（依成分股數）：")
    w("")
    w("| 成分股 | 官方節點路徑 |")
    w("|---|---|")
    for n, path in unmodelled[:60]:
        w(f"| {n} | {path} |")
    w("")

    w("## 4. 多重歸屬（重複計算風險）")
    w("")
    w("一檔股票同時屬於 N 個板塊時，若權重都算 1，板塊淨額會重複計算。")
    w("")
    w("| 所屬板塊數 | 官方骨架 | Tide |")
    w("|---|---|---|")
    di, dt = dist(ic_member), dist(tide_member)
    for k in sorted(set(di) | set(dt)):
        w(f"| {k} | {di.get(k,0)} | {dt.get(k,0)} |")
    w("")
    multi_ic = sum(v for k, v in di.items() if k > 1)
    multi_td = sum(v for k, v in dt.items() if k > 1)
    w(f"- 官方骨架：{multi_ic}/{len(ic_member)} 檔多重歸屬（{pct(multi_ic,len(ic_member))}）")
    w(f"- Tide：{multi_td}/{len(tide_member)} 檔多重歸屬（{pct(multi_td,len(tide_member))}）")
    w("")

    w("## 5. 板塊規模分布")
    w("")
    w("| | 官方葉節點 | Tide 板塊 |")
    w("|---|---|---|")
    w(f"| 數量 | {len(sizes)} | {len(tide_sizes)} |")
    w(f"| 最大 | {sizes[0] if sizes else 0} | {tide_sizes[0] if tide_sizes else 0} |")
    w(f"| 中位數 | {sizes[len(sizes)//2] if sizes else 0} | {tide_sizes[len(tide_sizes)//2] if tide_sizes else 0} |")
    w(f"| < 3 檔（太小、訊號噪音大）| {sum(1 for s in sizes if s < 3)} | {sum(1 for s in tide_sizes if s < 3)} |")
    w(f"| > 50 檔（太大、失去解析度）| {sum(1 for s in sizes if s > 50)} | {sum(1 for s in tide_sizes if s > 50)} |")
    w("")

    out = os.path.join(DATA, "diff_report.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(L))

    print(f"官方葉節點 {len(leaves)}｜Tide 板塊 108")
    print(f"覆蓋：官方(上市櫃) {len(ic_listed)}｜Tide {len(tide_all)}")
    print(f"Tide 獨有 {len(only_tide)} 檔｜官方獨有 {len(only_ic)} 檔")
    print(f"對應：強 {len(strong)}｜部分 {len(partial)}｜自創 {len(novel)}")
    print(f"官方未被模型化節點 {len(unmodelled)} 個")
    print(f"→ {out}")


if __name__ == "__main__":
    main()
