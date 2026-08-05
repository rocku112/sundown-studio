#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
供應鏈上下游資金流。

這是 Tide 架構上做不到的事：他的 108 個板塊是平的，我們有官方產業價值鏈平台
的上游/中游/下游拓撲，所以能回答一個他答不出的問題——

    錢是從上游流到下游了嗎？

輸出 web/data/chains.json：
  chains[]  name, segments[{seg, stocks, nodes, net_1d/5d/20d, chg_5d}],
            tilt, tilt_prev, shift, total_5d

指標定義：
  side   整條鏈近 5 日淨額的方向（買超 / 賣超）
  focus  那股力道集中在哪一段。0 ＝ 上游、0.5 ＝ 中游、1 ＝ 下游。
         只取「與整鏈同向」的段來算重心——鏈被買時看哪幾段在被買、
         鏈被賣時看哪幾段在被賣。
  shift  focus 這 5 日 減去 前 5 日。**方向不同的兩期不比較**（買盤重心
         跟賣壓重心不是同一件事，相減沒有意義），這種情況 shift 為 null。

⚠️ 第一版用 (下游 − 上游)/(|上|+|中|+|下|)，是錯的：雲端運算上游 −231 億、
   下游 +31 億會被算成 tilt +1.0「錢全在下游」。但那不是資金往下游流，
   是整條鏈被倒貨、下游相對抗跌。分子分母混用了「流入」與「流出」兩件事。
   而且沒有規模下限，食品生技的 ±1 億也能算出極端值——純雜訊。

⚠️ 成員用「剪枝後」的節點，不是官方原始名單。原始名單是公司自報的，
   台達電自報 68 個節點，直接拿來算會讓每條鏈都被同一批大型股灌爆。

⚠️ 一檔股票在同一條鏈裡若橫跨多段，流量平均分攤到各段——
   這樣「鏈內各段加總 = 該鏈成分股的實際淨額」，不會重複計算。
   但**跨鏈不可加總**：同一檔股票可能同時屬於半導體與通信網路，兩條鏈
   各自完整計算它。每條鏈只在自己內部有意義，別把 47 條鏈加起來。
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

SEG_ORDER = ["上游", "中游", "下游"]
MIN_STOCKS = 6          # 整條鏈太小就不做上下游分析，數字會全是雜訊
# 規模下限（億）。低於這個數字的鏈不判斷重心——實測 28 條鏈裡有一半的
# 5 日淨額在 ±5 億內，那個量級的重心完全是雜訊在跳。
MIN_FLOW = 20.0
IDX = {"上游": 0.0, "中游": 0.5, "下游": 1.0}


def arr(v, T):
    return np.array([np.nan if x is None else float(x) for x in v], dtype=float) \
        if v else np.full(T, np.nan)


def r2(x, n=2):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def main():
    panel = load(os.path.join(DATA, "market", "panel.json"))
    pruned = load(os.path.join(DATA, "pruned_sectors.json"))["pruned"]
    dates = panel["dates"]
    S = panel["stocks"]
    T = len(dates)

    # ── 鏈 → 段 → {節點名: [成分股]} ──────────────────────────────
    chains = {}
    for p in pruned:
        if not p["significant"]:
            continue
        parts = p["path"].split("/")
        chain = parts[0]
        seg = parts[1] if len(parts) > 2 else ""
        if seg not in SEG_ORDER:
            continue                      # 沒有上下游結構的鏈（金融、軟體服務…）
        stocks = [c for c in p["keep"] if c in S]
        if not stocks:
            continue
        chains.setdefault(chain, {}).setdefault(seg, {})[p["leaf"]] = stocks

    def series(code, key):
        return arr(S[code][key], T)

    out = []
    for chain, segs in chains.items():
        if len(segs) < 2:
            continue                      # 只有一段就沒有「上下游」可言

        # 同一檔在鏈內橫跨幾段 → 流量平均分攤，鏈內加總才等於實際淨額
        span = {}
        for seg, nodes in segs.items():
            for st in {c for lst in nodes.values() for c in lst}:
                span.setdefault(st, set()).add(seg)

        rows, all_stocks = [], set()
        for seg in SEG_ORDER:
            if seg not in segs:
                continue
            members = sorted({c for lst in segs[seg].values() for c in lst})
            if not members:
                continue
            all_stocks |= set(members)
            w = np.array([1.0 / len(span[c]) for c in members])
            flow = np.nansum(
                np.vstack([series(c, "net_yi") for c in members]) * w[:, None], axis=0)
            with np.errstate(invalid="ignore"):
                chg = np.nanmean(np.vstack([series(c, "chg") for c in members]), axis=0)
            rows.append({
                "seg": seg,
                "stocks": len(members),
                "nodes": sorted(segs[seg]),
                "net_1d": r2(flow[-1]),
                "net_5d": r2(flow[-5:].sum()),
                "net_20d": r2(flow[-20:].sum()),
                # 前一個 5 日窗（用來看重心有沒有移動）
                "net_5d_prev": r2(flow[-10:-5].sum()) if T >= 10 else None,
                "chg_5d": r2(float(np.nansum(chg[-5:]))),
            })

        if len(all_stocks) < MIN_STOCKS or len(rows) < 2:
            continue

        def focus_of(key):
            """(重心, 方向, 力道總額, 各段占比)。規模不足或方向不明回 None。"""
            g = {r["seg"]: (r[key] or 0.0) for r in rows}
            total = sum(g.values())
            if abs(total) < MIN_FLOW:
                return None, 0, 0.0, {}
            side = 1 if total > 0 else -1
            w = {s: max(0.0, side * v) for s, v in g.items()}
            tot = sum(w.values())
            if tot < MIN_FLOW:
                return None, side, tot, {}
            c = sum(w[s] * IDX[s] for s in w) / tot
            share = {s: round(v / tot, 3) for s, v in w.items()}
            return round(c, 3), side, round(tot, 2), share

        f_now, side_now, mag, share = focus_of("net_5d")
        f_prev, side_prev, _, _ = focus_of("net_5d_prev")

        # 標籤要從「實際占比」來，不能從重心推。
        # 踩過：電機機械只有上游(-151)與下游(-100)兩段，重心 0.40 被四捨五入
        # 成 0.5，於是標成「集中在中游」——那條鏈根本沒有中游。
        # 占比 ≥60% 才說「集中在某段」，否則老實說分散。
        dom = max(share, key=share.get) if share else None
        if dom and share[dom] >= 0.60:
            label = f"集中在{dom}"
        elif share:
            top2 = sorted(share, key=share.get, reverse=True)[:2]
            label = "分散於" + "、".join(sorted(top2, key=lambda s: IDX[s]))
        else:
            label = None
        # 買盤重心與賣壓重心不是同一件事，方向不同就不相減
        shift = (round(f_now - f_prev, 3)
                 if (f_now is not None and f_prev is not None
                     and side_now == side_prev) else None)

        out.append({
            "name": chain,
            "stocks": len(all_stocks),
            "segments": rows,
            "total_5d": r2(sum(r["net_5d"] or 0 for r in rows)),
            "total_20d": r2(sum(r["net_20d"] or 0 for r in rows)),
            "focus": f_now, "side": side_now, "magnitude": mag,
            "share": share, "label": label,
            "focus_prev": f_prev, "shift": shift,
        })

    out.sort(key=lambda c: -abs(c["total_20d"] or 0))
    doc = {
        "generated_at": datetime.now(timezone(timedelta(hours=8)))
                        .isoformat(timespec="seconds"),
        "date": dates[-1],
        "chains": out,
    }
    p = os.path.join(WEB, "chains.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    named = [c for c in out if c["focus"] is not None]
    print(f"產業鏈 {len(out)} 條（有上下游結構且成分股 ≥{MIN_STOCKS}）"
          f"｜其中 {len(named)} 條規模足夠判斷重心（≥{MIN_FLOW:.0f}億）")
    print("\n力道最大的 8 條：")
    for c in sorted(named, key=lambda x: -x["magnitude"])[:8]:
        act = "買盤" if c["side"] > 0 else "賣壓"
        segs = "　".join(f"{r['seg']} {r['net_5d']:+.0f}" for r in c["segments"])
        sh = (f"　移動 {c['shift']:+.2f}"
              f"（{'往下游' if c['shift'] > 0.05 else '往上游' if c['shift'] < -0.05 else '持平'}）"
              if c["shift"] is not None else "　移動 —（方向改變，不比較）")
        print(f"  {c['name']:<11} {act}{c['label']}　{c['magnitude']:>6.0f}億{sh}")
        print(f"    {segs}")
    print(f"→ {p}  ({os.path.getsize(p)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
