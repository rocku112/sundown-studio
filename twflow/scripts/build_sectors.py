#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「剪枝後的官方節點 ＋ 發掘出的題材」組成最終板塊表，並算出泡泡圖需要的指標。

輸出 web/data/latest.json：

  sectors[]  name, stocks[], net_1d_yi, net_5d_yi, net_20d_yi,
             chg_1d, chg_5d, avg_abs_daily_20d, inflow_streak, accel
  stock_data{} 個股當日數字（點板塊看成分股用）

指標定義（與 Tide 對齊，差異處已註明）：
  net_Nd_yi   成分股 N 日買賣超金額加總（億）＝ 買賣超股數 × 當日收盤 ÷ 1e8
  accel       近5日日均 − 近20日日均，泡泡圖 Y 軸
  chg_Nd      成分股 N 日報酬「等權平均」
              ⚠️ Tide 用什麼加權未知。等權會讓小型股與權值股等重，
                 市值加權則會讓板塊漲跌跟著龍頭股跑。這裡選等權，
                 因為板塊輪動要看的是「整群在不在動」而不是「龍頭在不在動」。
  inflow_streak  連續同方向淨買賣天數（正＝連買）

歸屬權重：一檔股票可屬多個板塊，權重依「它與各板塊其他成員的平均相關」分配，
對所屬板塊正規化成總和 1。這讓 Σ(各板塊拿到的貢獻) = 該股票自己的買賣超，
板塊淨額才能加總還原市場總額。權重全算 1 的話會重複計算——實測誤差 1495%。
（原本想用產品別營收比重，但 MOPS 擋請求，且公司自填的產品名稱要對到板塊
等於再做一次分類工程；相關性歸屬用的是已驗證過的同一份相關矩陣。）
"""

import argparse
import json
import os
from datetime import datetime, timedelta, timezone

from collections import Counter

import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import build_returns, corr_of, jaccard, load, overlap  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
WEB = os.path.join(ROOT, "web", "data")




def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-sectors", type=int, default=120)
    ap.add_argument("--min-size", type=int, default=4)
    ap.add_argument("--dedup-overlap", type=float, default=0.70)
    ap.add_argument("--max-membership", type=int, default=4,
                    help="一檔股票最多歸屬幾個板塊（只留最相關的前 K 個）")
    args = ap.parse_args()

    panel = load(os.path.join(DATA, "market", "panel.json"))
    pruned = load(os.path.join(DATA, "pruned_sectors.json"))["pruned"]
    themes = load(os.path.join(DATA, "discovered_themes.json"))["novel_themes"]
    market = load(os.path.join(DATA, "market", "market.json"))["days"]

    dates = panel["dates"]
    S = panel["stocks"]
    T = len(dates)

    # ── 候選板塊 ─────────────────────────────────────────────────
    # ⚠️ 分數必須同一把尺。官方節點原本用 pruned_sectors 的 corr_after（樣本內、
    #    剪枝當下量的），題材用 test_corr（樣本外）。樣本內必然高於樣本外，
    #    於是去重時官方節點永遠贏——「散熱模組」「電子特用化學材料」就是這樣
    #    被名字又長又雜的官方節點擠掉的。改成兩邊都取樣本外分數。
    val = load(os.path.join(DATA, "pruning_validation.json"))
    oos = {g["path"]: g["test_pruned"] for g in val["groups"]}

    usable = [p for p in pruned
              if p["significant"] and p["n_after"] >= args.min_size]

    # 葉名在不同產業鏈會重複（「生產製程及檢測設備」出現在好幾條鏈），所以冠上鏈名。
    # 但**同一條鏈的不同段也會重複**——半導體的「中游/生產製程及檢測設備」（前段設備）
    # 與「下游/生產製程及檢測設備」（封測設備）是兩個不同的東西，冠了鏈名仍然撞名。
    # 只在真的撞到時才補上段別，避免所有板塊名字都變成三段式長串。
    pair_count = Counter()
    for p in usable:
        parts = p["path"].split("/")
        pair_count[(parts[0], p["leaf"])] += 1

    cands = []
    for p in usable:
        parts = p["path"].split("/")
        chain = parts[0]
        seg = parts[1] if len(parts) > 2 else ""
        if pair_count[(chain, p["leaf"])] > 1 and seg:
            name = f'{chain}・{seg}・{p["leaf"]}'
        elif len(parts) > 1:
            name = f'{chain}・{p["leaf"]}'
        else:
            name = p["leaf"]
        cands.append({"name": name, "source": "official", "priority": 1,
                      "stocks": p["keep"],
                      "score": oos.get(p["path"], p["corr_after"])})
    # ── 題材命名與人工校對 ───────────────────────────────────────
    # 用錨點成分股做重疊比對，而非群的索引：discover_themes.py 重跑後成員會
    # 微幅變動、群的順序也會變，靠索引綁定的命名會整批錯位。
    named = load(os.path.join(DATA, "theme_names.json"))
    thr = named.get("match_threshold", 0.45)

    def match_theme(stocks):
        s = set(stocks)
        best = (0.0, None)
        for t in named["themes"]:
            o = overlap(s, set(t["anchors"]))
            if o > best[0]:
                best = (o, t)
        return best[1] if best[0] >= thr else None

    def is_dropped(stocks):
        s = set(stocks)
        return any(overlap(s, set(d["anchors"])) >= thr for d in named.get("dropped", []))

    n_named = n_drop = 0
    for i, t in enumerate(themes, 1):
        if is_dropped(t["stocks"]):
            n_drop += 1
            continue
        th = match_theme(t["stocks"])
        if th:
            ex = set(th.get("exclude", []))
            stocks = [c for c in t["stocks"] if c not in ex]
            n_named += 1
            cands.append({"name": th["name"], "source": "discovered",
                          "priority": 0, "stocks": stocks, "score": t["test_corr"]})
        else:
            # 還沒被人看過的新群：留著並標記，不要靜默丟掉——
            # 丟掉的話新題材冒出來時我們永遠不會知道
            top = " ".join(m.split(" ", 1)[1] for m in t["members"][:3])
            cands.append({"name": f"【待命名{i:02d}】{top}", "source": "unnamed",
                          "priority": 2, "stocks": t["stocks"], "score": t["test_corr"]})
    print(f"題材：命名 {n_named}｜人工判定捨棄 {n_drop}｜"
          f"待命名 {sum(1 for c in cands if c['source']=='unnamed')}")

    # ── 去重（高度重疊的板塊留一個）──────────────────────────────
    # 排序 = (優先序, -樣本外內聚度)。優先序讓「人工命名的題材」贏過官方節點：
    # 兩者涵蓋同一群股票時，「散熱模組」比「電腦及週邊設備・散熱片、風扇馬達、
    # 散熱模組」好念，成分也是人工校對過的。這是編輯決策，不是統計決策，
    # 所以獨立成一個維度、不去動分數本身。
    # ⚠️ 兩種重疊要用不同的尺，混用會出事：
    #
    #  · 人工命名的題材 vs 官方節點 → 用重疊係數（交集/較小集合）。
    #    「散熱模組」6 檔是官方「散熱片、風扇馬達、散熱模組」16 檔的乾淨版，
    #    這是同一個概念的兩種寫法，要留一個。
    #
    #  · 官方節點彼此之間 → 用 Jaccard。
    #    重疊係數會讓「子集吃掉母集」：DRAM製造 4 檔全在晶圓製造 22 檔裡，
    #    重疊係數 = 4/4 = 1.0，於是 4 檔的小節點把含台積電的 22 檔大節點
    #    整個消滅掉——實際發生過，台積電因此不屬於任何板塊。
    #    Jaccard = 4/22 = 0.18，兩者共存；不同顆粒度本來就都有意義。
    def dup(a, b):
        sim = overlap if (a["priority"] == 0 or b["priority"] == 0) else jaccard
        return sim(set(a["stocks"]), set(b["stocks"])) >= args.dedup_overlap

    cands.sort(key=lambda c: (c.get("priority", 1), -c["score"]))
    kept = []
    for c in cands:
        if any(dup(c, k) for k in kept):
            continue
        kept.append(c)

    # ── 指標 ─────────────────────────────────────────────────────
    def series(code, key):
        v = S.get(code, {}).get(key)
        return np.array([np.nan if x is None else float(x) for x in v], dtype=float) \
            if v else np.full(T, np.nan)

    # ── 歸屬權重：解決重複計算 ───────────────────────────────────
    # 問題：一檔股票屬於 N 個板塊時，若每個板塊都算它 100%，它的買賣超就被
    # 計了 N 次。華邦電 +31 億同時出現在「記憶體模組」與「NOR Flash」，
    # 看起來像兩個獨立訊號，其實是同一件事；板塊淨額也因此無法加總回市場總額。
    #
    # 理想解是依產品別營收比重分配。實測不可行：MOPS 擋直接請求，且各公司
    # 自填的產品名稱（「記憶體IC」「其他」）要對到我們的板塊，等於再做一次
    # 分類工程——那是獨立的專案，不是這一步能順帶完成的。
    #
    # 這裡改用「相關性歸屬」：一檔股票對某板塊的權重 ∝ 它與該板塊其他成員的
    # 平均相關（負相關視為 0），再對它所屬的所有板塊正規化成總和 1。
    # 直接量的就是「這檔股票有多屬於這個板塊」，而且用的是已經驗證過的同一
    # 份相關矩陣，不需要新資料源。全部相關都 ≤0 時退回 1/N 均分。
    #
    # 關鍵性質：Σ(各板塊拿到的貢獻) = 該股票自己的買賣超，一分不多一分不少。
    codes_r, R = build_returns(panel)
    posr = {c: i for i, c in enumerate(codes_r)}
    C = corr_of(R)

    def affinity(code, group_stocks):
        """該股票與板塊內其他成員的平均相關（負值截為 0）。"""
        if code not in posr:
            return 0.0
        peers = [posr[x] for x in group_stocks if x != code and x in posr]
        if not peers:
            return 0.0
        return max(0.0, float(np.mean(C[posr[code], peers])))

    def make_weights(groups):
        """對「這一份板塊清單」算歸屬權重，每檔股票的權重總和為 1。"""
        memb = {}
        for gi, c in enumerate(groups):
            for code in c["stocks"]:
                if code in S:
                    memb.setdefault(code, []).append(gi)
        W, n_multi = {}, 0
        for code, gids in memb.items():
            if len(gids) == 1:
                W[(code, gids[0])] = 1.0
                continue
            n_multi += 1
            aff = [affinity(code, groups[g]["stocks"]) for g in gids]
            tot = sum(aff)
            for g, a in zip(gids, aff):
                W[(code, g)] = (a / tot) if tot > 1e-9 else 1.0 / len(gids)
        return W, memb, n_multi

    def build(groups, W):
        out = []
        for gi, c in enumerate(groups):
            members = [x for x in c["stocks"] if x in S]
            if len(members) < args.min_size:
                continue
            flow = np.nansum(np.vstack([
                series(m, "net_yi") * W.get((m, gi), 1.0) for m in members
            ]), axis=0)
            out.append(metrics(c, members, flow, W, gi))
        return out

    def metrics(c, members, flow, W, gi):
        chg = np.vstack([series(m, "chg") for m in members])
        with np.errstate(invalid="ignore"):
            chg_eq = np.nanmean(chg, axis=0)          # 等權平均日報酬

        net_1d = float(flow[-1])
        net_5d = float(flow[-5:].sum())
        net_20d = float(flow[-20:].sum())
        # 近20日「日均絕對」進出量：逐日取絕對值再平均，正負不互抵。
        # 這是逆勢買超相對門檻的基準，用 |20日淨額|/20 會把來回進出的板塊
        # 門檻壓到接近 0，於是天天觸發。
        avg_abs = float(np.mean(np.abs(flow[-20:])))

        streak = 0
        for v in flow[::-1]:
            if v > 0 and streak >= 0:
                streak += 1
            elif v < 0 and streak <= 0:
                streak -= 1
            else:
                break

        return {
            "name": c["name"], "source": c["source"],
            "stocks": members,
            "net_1d_yi": round(net_1d, 2),
            "net_5d_yi": round(net_5d, 2),
            "net_20d_yi": round(net_20d, 2),
            "chg_1d": round(float(chg_eq[-1]), 2) if np.isfinite(chg_eq[-1]) else 0.0,
            "chg_5d": round(float(np.nansum(chg_eq[-5:])), 2),
            "avg_abs_daily_20d": round(avg_abs, 3),
            "inflow_streak": streak,
            "accel": round(net_5d / 5 - net_20d / 20, 3),
            "cohesion": round(c["score"], 3),
            "weights": {m: round(W.get((m, gi), 1.0), 3) for m in members},
        }

    def cap(secs):
        """規模排序後取前 N：泡泡圖畫不下 300 顆，留資金進出最大的。
        但人工命名過的題材一律保留——國防軍工、散熱模組這種中小型股題材，
        20 日金額本來就比金融、晶圓代工小一到兩個量級，純用規模排序會把
        「我們特地建出來的東西」第一個砍掉。"""
        secs = sorted(secs, key=lambda s: -abs(s["net_20d_yi"]))
        always = [s for s in secs if s["source"] == "discovered"]
        rest = [s for s in secs if s["source"] != "discovered"]
        room = max(0, args.max_sectors - len(always))
        return always + rest[:room], max(0, len(rest) - room)

    # ── 兩趟 ─────────────────────────────────────────────────────
    # 第一趟只為了排出規模、挑出最終 120 個板塊。
    # 第二趟對「最終這 120 個」重算權重——第一趟的權重是攤在所有候選板塊上的，
    # 被上限砍掉的板塊帶走了一部分權重，導致加總還原個股淨額時漏 0.5%。
    # 權重的意義是「這檔股票在**我們呈現的板塊**之間怎麼分」，所以分母必須是
    # 最終清單，不是候選清單。
    def trim_membership(groups, K):
        """把每檔股票的歸屬收斂到「與它最像的前 K 個板塊」。

        剪枝處理的是「板塊裡有不該在的成員」，但反方向的問題還在：
        台達電通過了 30 個板塊的剪枝——它是真的跨足那麼多生意，跟每一群
        都有點相關。可是「台達電屬於 30 個板塊」對使用者毫無資訊量，
        點進個股頁看到 30 個標籤只會讓人不信任這份分類。
        一檔股票的身分是少數幾件事；跟第 5 名以後的板塊那點相關性，
        是它作為大型權值股的普遍性，不是它的產業身分。
        """
        drop = {}
        memb = {}
        for gi, c in enumerate(groups):
            for code in c["stocks"]:
                if code in S:
                    memb.setdefault(code, []).append(gi)
        n_trim = 0
        for code, gids in memb.items():
            if len(gids) <= K:
                continue
            n_trim += 1
            ranked = sorted(gids, key=lambda g: -affinity(code, groups[g]["stocks"]))
            for g in ranked[K:]:
                drop.setdefault(g, set()).add(code)
        out = []
        for gi, c in enumerate(groups):
            stocks = [x for x in c["stocks"] if x not in drop.get(gi, ())]
            # 被砍到不成形的板塊直接不要——留著也只是雜訊
            if len(stocks) >= args.min_size:
                out.append({**c, "stocks": stocks})
        if n_trim:
            print(f"歸屬收斂：{n_trim} 檔股票原本屬於超過 {K} 個板塊，"
                  f"只保留最相關的前 {K} 個｜板塊 {len(groups)} → {len(out)}")
        return out

    W0, _, _ = make_weights(kept)
    first = build(kept, W0)
    picked_names = {s["name"] for s in cap(first)[0]}
    final_groups = [c for c in kept if c["name"] in picked_names]
    final_groups = trim_membership(final_groups, args.max_membership)

    W, memb, n_multi = make_weights(final_groups)
    sectors, dropped = cap(build(final_groups, W))
    print(f"歸屬權重：{len(memb)} 檔成分股，其中 {n_multi} 檔屬於 2 個以上板塊"
          f"（{n_multi/max(len(memb),1)*100:.1f}%）→ 依相關性分配，總和歸一")
    dropped = len(first) - len(sectors)

    # ── 個股當日資料 ─────────────────────────────────────────────
    used = sorted({c for s in sectors for c in s["stocks"]})
    stock_data = {}
    for code in used:
        v = S[code]
        stock_data[code] = {
            "name": v["name"], "market": v["market"],
            "price": v["close"][-1], "chg_1d": v["chg"][-1],
            "net_1d_yi": v["net_yi"][-1],
            "net_5d_yi": round(float(np.nansum(series(code, "net_yi")[-5:])), 3),
            "net_20d_yi": round(float(np.nansum(series(code, "net_yi")[-20:])), 3),
        }

    last_mkt = market[-1] if market else {}
    doc = {
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "date": dates[-1],
        "market_chg_1d": last_mkt.get("twse_chg_pct"),
        "is_market_down": (last_mkt.get("twse_chg_pct") or 0) < -1.0,
        "sectors": sectors,
        "stock_data": stock_data,
    }
    os.makedirs(WEB, exist_ok=True)
    out = os.path.join(WEB, "latest.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    n_off = sum(1 for s in sectors if s["source"] == "official")
    n_dis = sum(1 for s in sectors if s["source"] == "discovered")
    n_un = sum(1 for s in sectors if s["source"] == "unnamed")
    print(f"板塊 {len(sectors)}（官方剪枝 {n_off}｜已命名題材 {n_dis}｜待命名 {n_un}）"
          f"{f'，因上限捨去 {dropped}' if dropped > 0 else ''}")
    print(f"成分股 {len(used)} 檔｜資料日 {dates[-1]}｜大盤 {doc['market_chg_1d']}%")
    print(f"規模：最大 {sectors[0]['name']} {sectors[0]['net_20d_yi']:.0f}億"
          f"｜中位成分股數 {int(np.median([len(s['stocks']) for s in sectors]))}")
    print(f"→ {out}  ({os.path.getsize(out)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
