#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
籌碼歷史：三大法人買賣超＋融資融券餘額，上市＋上櫃，供「法人連買」「融資增減」等檢驗。

來源（證交所／櫃買中心公開端點，一天一個請求含全部股票）：
  TWSE 法人  /rwd/zh/fund/T86            （沿用 twflow/scripts/fetch_market.py 的解析）
  TPEx 法人  /www/zh-tw/insti/dailyTrade （同上）
  TWSE 信用  /rwd/zh/marginTrading/MI_MARGN?selectType=ALL
  TPEx 信用  /www/zh-tw/margin/balance

只保留流動性前 KEEP 檔（與波段實驗室同一股票池來源），存成每月一檔：
  swing/data/chips/YYYY-MM.json
  {"codes": [...], "fields": [...], "days": {"YYYY-MM-DD": [[外資, 投信, 融資餘額, 融券餘額], ...]}}
  單位：張（1000 股）。缺值為 null。

已存在的日期不重抓；--budget 分鐘到了就停（下次接著補），適合分段回補五年。

用法：
  python swing/scripts/fetch_chips.py --days 1300 --budget 320   # 回補
  python swing/scripts/fetch_chips.py --days 5                   # 每日增補
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
OUT = os.path.join(ROOT, "data", "chips")
sys.path.insert(0, os.path.join(REPO, "twflow", "scripts"))
sys.path.insert(0, HERE)

import fetch_market as fm          # noqa: E402
from fetch_hist import universe    # noqa: E402

KEEP = 450
FIELDS = ["外資", "投信", "融資餘額", "融券餘額"]


def calendar(n):
    """往回逐月用台積電月成交表列交易日，湊滿 n 天。"""
    out, today = [], fm.tw_today()
    y, m = today.year, today.month
    for _ in range(n // 18 + 3):
        ym = f"{y}{m:02d}"
        url = f"https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={ym}01&stockNo=2330&response=json"
        j = fm.get_json(url, f"cal_{ym}", force=(y, m) == (today.year, today.month))
        for row in (j or {}).get("data", []):
            mt = re.match(r"(\d+)/(\d+)/(\d+)", row[0])
            if mt:
                d = date(int(mt.group(1)) + 1911, int(mt.group(2)), int(mt.group(3)))
                if d <= today:
                    out.append(d)
        if len(out) >= n:
            break
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return sorted(set(out))[-n:]


def lots(v):
    return None if v is None else round(v / 1000)


def twse_margin(d):
    ymd = d.strftime("%Y%m%d")
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={ymd}&selectType=ALL&response=json",
                    f"twse_m_{ymd}")
    out = {}
    for t in (j or {}).get("tables", []):
        f = [str(x).strip() for x in (t.get("fields") or [])]
        bal = [i for i, x in enumerate(f) if x == "今日餘額"]
        if len(bal) < 2 or not f or "代號" not in f[0]:
            continue
        for row in t.get("data", []):
            code = str(row[0]).strip()
            if fm.STOCK_RE.match(code):
                out[code] = (fm.num(row[bal[0]]), fm.num(row[bal[1]]))      # 融資、融券（張）
    return out


def tpex_margin(d):
    j = fm.get_json(f"https://www.tpex.org.tw/www/zh-tw/margin/balance?date={fm.roc(d)}&response=json",
                    f"tpex_m_{d:%Y%m%d}")
    out = {}
    for t in (j or {}).get("tables", []):
        f = [re.sub(r"<[^>]+>", "", str(x)).strip() for x in (t.get("fields") or [])]
        mi = next((i for i, x in enumerate(f) if x in ("資餘額", "融資餘額", "資今日餘額")), None)
        si = next((i for i, x in enumerate(f) if x in ("券餘額", "融券餘額", "券今日餘額")), None)
        if mi is None or si is None:
            # 欄名不同時，退而依位置：代號,名稱,前資餘額,資買,資賣,現償,資餘額,...,前券餘額,券賣,券買,券償,券餘額
            if len(f) >= 15:
                mi, si = 6, 14
            else:
                continue
        for row in t.get("data", []):
            code = str(row[0]).strip()
            if fm.STOCK_RE.match(code):
                out[code] = (fm.num(row[mi]), fm.num(row[si]))
    return out


def load(month):
    p = os.path.join(OUT, f"{month}.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return None


def save(month, obj):
    os.makedirs(OUT, exist_ok=True)
    obj["days"] = dict(sorted(obj["days"].items()))
    with open(os.path.join(OUT, f"{month}.json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=5)
    ap.add_argument("--budget", type=float, default=0, help="分鐘；0 = 不限")
    args = ap.parse_args()
    t0 = time.time()
    codes = [c for c, *_ , kind in universe(KEEP) if kind == "stock"]
    days = calendar(args.days)
    print(f"交易日 {days[0]}～{days[-1]} 共 {len(days)} 天；股票 {len(codes)} 檔")
    cache, done, empty = {}, 0, []
    for d in days:
        if args.budget and (time.time() - t0) / 60 > args.budget:
            print("時間預算用完，下次接著補")
            break
        month, key = d.strftime("%Y-%m"), d.isoformat()
        if month not in cache:
            cache[month] = load(month) or {"codes": codes, "fields": FIELDS, "days": {}}
        mobj = cache[month]
        if key in mobj["days"] and d != days[-1]:
            continue
        ins = {**fm.twse_insti(d), **fm.tpex_insti(d)}
        mar = {**twse_margin(d), **tpex_margin(d)}
        if not ins and not mar:
            empty.append(key)
            continue
        row = []
        for c in mobj["codes"]:
            i, m = ins.get(c, {}), mar.get(c, (None, None))
            row.append([lots(i.get("foreign")), lots(i.get("trust")), m[0], m[1]])
        mobj["days"][key] = row
        done += 1
        if done == 1 or done % 50 == 0:
            print(f"  {key}：法人 {len(ins)} 檔、信用 {len(mar)} 檔（已補 {done} 天，{(time.time()-t0)/60:.0f} 分）")
            for m_, o in cache.items():
                save(m_, o)
    for m_, o in cache.items():
        if o["days"]:
            save(m_, o)
    have = sum(len((load(m) or {}).get("days", {})) for m in {d.strftime("%Y-%m") for d in days})
    print(f"本次新增 {done} 天；範圍內已有 {have}/{len(days)} 天；無資料 {empty[:10]}")


if __name__ == "__main__":
    main()
