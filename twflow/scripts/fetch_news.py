#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每檔股票的最新消息，產出 twflow/web/data/news.json：
  {"generated_at":…, "codes": {代號: {"m": [[日期, 時間, 主旨], …],      ← 公開資訊觀測站重大訊息（官方，上市＋上櫃）
                                       "n": [[時間, 標題, 媒體, 連結], …]}}}  ← 新聞標題（Google 新聞 RSS，只存標題與連結）

一、重大訊息：swing/scripts/fetch_extra.py 每天從證交所／櫃買中心開放 API 存的快照（swing/data/extra/news/），
    合併近 60 天。這是公司依法發布的公告，最權威、時點也最準。
二、新聞標題：近 20 日法人進出最活躍的前 N 檔，每檔查一次 Google 新聞 RSS（關鍵字＝公司名稱＋代號），
    保留最近 8 則。只存標題、媒體名稱、時間與原文連結，不存內文（內文版權屬於各媒體，點連結到原網站看）。

新聞標題不做任何「利多／利空」判斷：用公開資料無法做時點正確的新聞情緒回測，判斷交給讀者。
用法：python twflow/scripts/fetch_news.py [--top 300] [--budget 8]
"""

import argparse
import glob
import gzip
import json
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
TW = os.path.dirname(HERE)
REPO = os.path.dirname(TW)
SNAP = os.path.join(REPO, "swing", "data", "extra", "news")
LATEST = os.path.join(TW, "web", "data", "latest.json")
OUT = os.path.join(TW, "web", "data", "news.json")
TZ = timezone(timedelta(hours=8))
# 論壇、社群貼文不是新聞，排除
NOT_NEWS = ("爆料同學會", "PTT", "Dcard", "Mobile01", "論壇", "社團")
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}


def pick(row, *names):
    """欄位名稱各來源不同：依序找第一個「包含」關鍵字的欄位。"""
    for n in names:
        for k, v in row.items():
            if n in k and v not in (None, ""):
                return str(v).strip()
    return ""


def roc_date(s):
    s = s.replace("/", "").replace("-", "")
    if len(s) == 7:                              # 民國 1150106
        return f"{int(s[:3]) + 1911}-{s[3:5]}-{s[5:7]}"
    if len(s) == 8:
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s


def material(days=60):
    cut = (datetime.now(TZ) - timedelta(days=days)).date().isoformat()
    out, seen = {}, set()
    for p in sorted(glob.glob(os.path.join(SNAP, "*.json.gz"))):
        if os.path.basename(p)[:10] < cut:
            continue
        with gzip.open(p, "rt", encoding="utf-8") as f:
            rows = json.load(f)
        for r in rows:
            if not isinstance(r, dict):
                continue
            code = pick(r, "公司代號", "SecuritiesCompanyCode", "Code")
            title = pick(r, "主旨", "Subject")
            d = roc_date(pick(r, "發言日期", "出表日期", "Date"))
            tm = pick(r, "發言時間", "Time")
            if not code or not title:
                continue
            key = (code, d, tm, title[:40])
            if key in seen:
                continue
            seen.add(key)
            out.setdefault(code, []).append([d, tm[:4] if len(tm) >= 4 else tm, title[:120]])
    for c in out:
        out[c].sort(key=lambda x: (x[0], x[1]), reverse=True)
        out[c] = out[c][:15]
    return out


def headlines(codes, names, budget_s):
    t0 = time.time()
    out, fail = {}, 0
    for c in codes:
        if time.time() - t0 > budget_s:
            print(f"  新聞：時間預算用完，完成 {len(out)} 檔")
            break
        q = quote(f"{names[c]} {c}")
        url = f"https://news.google.com/rss/search?q={q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
        try:
            r = requests.get(url, headers=UA, timeout=15)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            root = ET.fromstring(r.content)
        except Exception as e:                  # noqa: BLE001
            fail += 1
            if fail <= 3:
                print(f"  ⚠️ 新聞 {c}：{e!r}"[:160])
            if fail >= 10 and not out:
                print("  新聞來源連續失敗，停止")
                break
            continue
        items = []
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            src = (it.findtext("source") or "").strip()
            try:
                ts = parsedate_to_datetime(it.findtext("pubDate")).astimezone(TZ).strftime("%Y-%m-%d %H:%M")
            except Exception:                   # noqa: BLE001
                ts = ""
            if src and title.endswith(" - " + src):
                title = title[: -len(src) - 3]
            # 標題裡要真的有公司名稱或代號，避免同名雜訊
            if any(w in title or w in src for w in NOT_NEWS):
                continue
            if title and link and (names[c] in title or c in title):
                items.append([ts, title[:120], src[:20], link])
        items.sort(key=lambda x: x[0], reverse=True)
        if items:
            out[c] = items[:8]
        time.sleep(0.6)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=300)
    ap.add_argument("--budget", type=float, default=8, help="新聞標題的時間預算（分鐘）")
    args = ap.parse_args()
    m = material()
    print(f"重大訊息：近 60 天 {sum(len(v) for v in m.values())} 則、{len(m)} 家")
    D = json.load(open(LATEST, encoding="utf-8"))
    sd = D["stock_data"]
    names = {c: v["name"] for c, v in sd.items()}
    order = sorted(sd, key=lambda c: -(sd[c].get("avg_abs_20d") or 0))[: args.top]
    n = headlines(order, names, args.budget * 60)
    print(f"新聞標題：{len(n)} 檔，例 2330 → {n.get('2330', [])[:2]}")
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8")).get("codes", {})
        except Exception:                       # noqa: BLE001
            old = {}
    codes = {}
    for c in set(m) | set(n) | set(old):
        e = {}
        if c in m:
            e["m"] = m[c]
        if c in n:
            e["n"] = n[c]
        elif old.get(c, {}).get("n"):           # 這次沒抓到（預算用完）就沿用上次的
            e["n"] = old[c]["n"]
        if e:
            codes[c] = e
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(TZ).isoformat(timespec="seconds"), "codes": codes},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}（{len(codes)} 檔）")


if __name__ == "__main__":
    main()
