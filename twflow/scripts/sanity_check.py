#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
資料合理性檢查。失敗回傳非 0，讓 CI 擋下來。

為什麼要有這支：這個專案踩過的兩個坑都**不會拋任何錯誤**——
  · 櫃買舊端點忽略日期參數，60 天回同一天的資料（HTTP 200、格式完全正常）
  · 前端 render() 在版面尺寸為 0 時執行，泡泡全被畫到畫布外
兩個都是靠「事後發現數字很怪」才抓到的。管線每天無人值守跑，
沒有這道檢查，壞掉的資料會安靜地一路推到線上。

所以這裡檢查的不是「程式有沒有跑完」，而是「跑出來的東西像不像真的」。
"""

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

fails, warns = [], []


def check(cond, msg):
    if not cond:
        fails.append(msg)


def warn(cond, msg):
    if not cond:
        warns.append(msg)


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


panel = load(os.path.join(DATA, "market", "panel.json"))
latest = load(os.path.join(ROOT, "web", "data", "latest.json"))
named = load(os.path.join(DATA, "theme_names.json"))

dates = panel["dates"]
S = panel["stocks"]

# ── 1. 日期 ─────────────────────────────────────────────────────────
today = datetime.now(timezone(timedelta(hours=8))).date()
last = date.fromisoformat(dates[-1])
lag = (today - last).days
check(len(dates) == len(set(dates)), "panel dates 有重複")
check(dates == sorted(dates), "panel dates 未依序")
check(latest["date"] == dates[-1],
      f"latest.json 日期 {latest['date']} 與 panel 最後一日 {dates[-1]} 不一致")
# 連假最長約 9 天；超過就是來源斷了或排程壞了
warn(lag <= 9, f"最新資料距今 {lag} 天（{last}），來源可能延遲")

# ── 2. 這是今天踩的那個坑：整市場價格不動 ──────────────────────────
# 櫃買舊端點回同一天資料時，所有上櫃股票的報酬標準差都是 0。
for mkt in ("TWSE", "TPEx"):
    codes = [c for c, v in S.items() if v["market"] == mkt]
    check(len(codes) > 300, f"{mkt} 只有 {len(codes)} 檔，明顯過少")
    flat = sum(
        1 for c in codes
        if len({x for x in S[c]["close"] if x is not None}) <= 1
    )
    ratio = flat / len(codes) if codes else 1
    check(ratio < 0.30,
          f"{mkt} 有 {ratio:.0%} 的股票全期價格不變（{flat}/{len(codes)}）"
          f"——來源可能忽略了日期參數")

# ── 3. 覆蓋率 ───────────────────────────────────────────────────────
check(len(S) > 1500, f"個股只有 {len(S)} 檔")
has_net = sum(1 for v in S.values() if any(x is not None for x in v["net"]))
check(has_net / len(S) > 0.80,
      f"只有 {has_net/len(S):.0%} 的股票有法人資料")

# ── 4. 板塊 ─────────────────────────────────────────────────────────
secs = latest["sectors"]
check(len(secs) >= 50, f"板塊只有 {len(secs)} 個")
check(len({s["name"] for s in secs}) == len(secs), "板塊名稱有重複")
for s in secs:
    check(len(s["stocks"]) >= 3, f"板塊「{s['name']}」只有 {len(s['stocks'])} 檔")
    for k in ("net_1d_yi", "net_5d_yi", "net_20d_yi", "accel"):
        v = s.get(k)
        check(v is not None and v == v, f"板塊「{s['name']}」的 {k} 是 null/NaN")
    # 單一板塊 20 日淨額超過 5000 億＝量級錯了（例如股數當成金額）
    check(abs(s["net_20d_yi"]) < 5000,
          f"板塊「{s['name']}」20日淨額 {s['net_20d_yi']:.0f} 億，量級可疑")

# 人工命名過的題材必須都還在；消失代表 build_sectors 的去重或名額把它擠掉了
present = {s["name"] for s in secs}
missing = [t["name"] for t in named["themes"] if t["name"] not in present]
check(not missing, f"人工命名的題材未出現在板塊表：{missing}")

# ── 5. 歸屬權重：加總必須還原成個股實際淨額 ─────────────────────────
# 這是加權存在的唯一理由，也是最容易在重構時悄悄壞掉的性質
#（權重的分母若不是最終板塊清單，就會漏掉一部分而沒有任何錯誤訊息）。
tot_w = {}
for s in secs:
    w = s.get("weights") or {}
    check(set(w) == set(s["stocks"]),
          f"板塊「{s['name']}」的 weights 與 stocks 對不上")
    for c, v in w.items():
        tot_w[c] = tot_w.get(c, 0.0) + v
bad_w = [(c, round(v, 3)) for c, v in tot_w.items() if abs(v - 1.0) > 0.02]
check(not bad_w, f"{len(bad_w)} 檔股票的權重總和不是 1（例：{bad_w[:3]}）")


def net20(code):
    v = S.get(code, {}).get("net_yi") or []
    return sum(x for x in v[-20:] if x is not None)


covered = {c for s in secs for c in s["stocks"]}
truth = sum(net20(c) for c in covered)
wsum = sum(s["net_20d_yi"] for s in secs)
if abs(truth) > 1:
    err = abs(wsum - truth) / abs(truth)
    check(err < 0.02,
          f"板塊淨額加總 {wsum:.1f} 億 vs 個股實際 {truth:.1f} 億，"
          f"差 {err:.1%}——歸屬權重沒有正確歸一")

# ── 6. 大盤 ─────────────────────────────────────────────────────────
mc = latest.get("market_chg_1d")
check(mc is not None, "latest.json 缺 market_chg_1d")
if mc is not None:
    warn(abs(mc) < 12, f"大盤單日 {mc}%，超出常見範圍，請人工確認")

# ── 7. 事件流 ───────────────────────────────────────────────────────
ev_path = os.path.join(ROOT, "web", "data", "events.json")
if os.path.exists(ev_path):
    ev = load(ev_path)
    evs = ev["events"]
    check(ev["dates"][-1] == latest["date"],
          f"events.json 最新日 {ev['dates'][-1]} 與 latest.json {latest['date']} 不一致")
    today_ev = [e for e in evs if e["date"] == latest["date"]]
    hit = len({e["code"] for e in today_ev})
    ratio = hit / max(len(S), 1)
    # 事件門檻是照「約 10% 的市場」校準的。飄到 25% 以上等於沒篩選
    #（第一版連賣門檻太鬆時是 30%），低於 2% 則是門檻過嚴或資料出問題。
    check(0.02 <= ratio <= 0.25,
          f"最新日事件涉及 {hit} 檔（{ratio:.1%} 的市場），門檻可能該重新校準")
    bad = [e for e in evs if not e.get("text") or not e.get("code")]
    check(not bad, f"{len(bad)} 則事件缺 text/code")
else:
    warns.append("找不到 events.json——自選股的籌碼異動欄會是空的")

# ── 8. 供應鏈重心 ───────────────────────────────────────────────────
ch_path = os.path.join(ROOT, "web", "data", "chains.json")
if os.path.exists(ch_path):
    ch = load(ch_path)
    check(ch["date"] == latest["date"],
          f"chains.json 日期 {ch['date']} 與 latest.json 不一致")
    for c in ch["chains"]:
        segs = {r["seg"] for r in c["segments"]}
        tot = sum(r["net_5d"] or 0 for r in c["segments"])
        check(abs(tot - (c["total_5d"] or 0)) < 0.5,
              f"「{c['name']}」各段加總 {tot:.1f} ≠ total_5d {c['total_5d']}")
        lab = c.get("label") or ""
        if lab.startswith("集中在"):
            seg = lab[3:]
            # 標籤宣稱的段必須存在，且占比真的過半數門檻——
            # 踩過：重心 0.40 被四捨五入標成「中游」，但那條鏈沒有中游段
            check(seg in segs, f"「{c['name']}」標籤指向不存在的段「{seg}」")
            check((c.get("share") or {}).get(seg, 0) >= 0.60,
                  f"「{c['name']}」宣稱集中在{seg}，實際占比僅 "
                  f"{(c.get('share') or {}).get(seg, 0):.0%}")
        # 買盤重心與賣壓重心不可相減，方向不同時 shift 必須是 null
        if c.get("shift") is not None:
            check(c.get("focus") is not None and c.get("focus_prev") is not None,
                  f"「{c['name']}」有 shift 卻缺 focus/focus_prev")
else:
    warns.append("找不到 chains.json——供應鏈頁會是空的")

# ── 9. 成分股資料 ───────────────────────────────────────────────────
sd = latest["stock_data"]
used = {c for s in secs for c in s["stocks"]}
check(used <= set(sd), f"有 {len(used - set(sd))} 檔成分股不在 stock_data")
noprice = [c for c in used if sd.get(c, {}).get("price") is None]
warn(len(noprice) / max(len(used), 1) < 0.10,
     f"{len(noprice)}/{len(used)} 檔成分股沒有收盤價")

# ── 結果 ────────────────────────────────────────────────────────────
print(f"資料日 {latest['date']}（距今 {lag} 天）｜"
      f"{len(dates)} 交易日｜{len(S)} 檔｜{len(secs)} 板塊｜大盤 {mc}%")
for w in warns:
    print(f"  ⚠ {w}")
for f in fails:
    print(f"  ✗ {f}")
if fails:
    print(f"\n失敗 {len(fails)} 項")
    sys.exit(1)
print(f"通過{f'（{len(warns)} 項提醒）' if warns else ''}")
