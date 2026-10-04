#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
官方日線回補（證交所＋櫃買，每天一個請求含當天所有股票，包含日後下市的）。

為什麼不用 Yahoo：Yahoo 只有「現在還在交易」的股票，回測只看得到倖存者，結果偏樂觀。
官方每日收盤行情是當天全部掛牌股票，日後下市的也在裡面。

還原權息：當日還原報酬 = 收盤 ÷ 參考價 − 1。
  · 一般日子：參考價 = 收盤 − 漲跌價差（官方漲跌即相對參考價）
  · 除權息日：證交所行情把漲跌標成「X」、價差記 0，不能用；改用官方
    「除權除息計算結果表」（證交所 TWT49U、櫃買 exDailyQ）的除權息參考價
  · 減資恢復買賣：證交所 TWTAUU 的恢復買賣參考價
回測時把每日還原報酬串起來，就是含息還原股價。

輸出：swing/data/prices/YYYY-MM.json.gz（每月一檔、gzip）
  {"names": {code: 名稱}, "days": {"YYYY-MM-DD": {code: [開, 高, 低, 收, 成交張數, 還原報酬]}}}

已存在的日期不重抓；--budget 分鐘到了就停（下次接著補）。

用法：
  python swing/scripts/fetch_prices.py --days 2550 --budget 300   # 回補約十年
  python swing/scripts/fetch_prices.py --days 5                   # 每日增補
"""

import argparse
import gzip
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
OUT = os.path.join(ROOT, "data", "prices")
sys.path.insert(0, os.path.join(REPO, "twflow", "scripts"))
sys.path.insert(0, HERE)

import fetch_market as fm          # noqa: E402
from fetch_chips import calendar   # noqa: E402

# 普通股＋波段實驗室用到的幾檔 ETF
ETFS = {"0050", "006208", "0056", "00878", "00919", "00929", "00631L"}


def keep(code):
    return bool(fm.STOCK_RE.match(code)) or code in ETFS


def clean(x):
    return re.sub(r"<[^>]+>", "", str(x)).strip()


def row_out(o, h, l, c, vol, chg):
    if c is None or c <= 0:
        return None
    ret = None
    if chg is not None and c - chg > 0:
        ret = round(c / (c - chg) - 1, 6)
    return [o, h, l, c, None if vol is None else round(vol / 1000), ret]


def roc_date(s):
    """'114年06月02日' 或 '114/06/02' → '2025-06-02'"""
    m = re.match(r"(\d+)\D+(\d+)\D+(\d+)", str(s).strip())
    return f"{int(m.group(1)) + 1911}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None


def refs(month):
    """該月的官方參考價：{日期: {代號: 參考價}}（除權息＋證交所減資恢復買賣）。"""
    y, m = map(int, month.split("-"))
    ny, nm = (y, m + 1) if m < 12 else (y + 1, 1)
    from datetime import date, timedelta
    last = date(ny, nm, 1) - timedelta(days=1)
    a, b = f"{y}{m:02d}01", last.strftime("%Y%m%d")
    out = {}

    def put(d, code, ref):
        if d and ref and ref > 0 and keep(code):
            out.setdefault(d, {})[code] = ref

    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate={a}&endDate={b}&response=json", f"twse_ex_{month}")
    f = (j or {}).get("fields") or []
    if "股票代號" in f and "除權息參考價" in f:
        for r in j.get("data") or []:
            put(roc_date(r[f.index("資料日期")]), clean(r[f.index("股票代號")]), fm.num(r[f.index("除權息參考價")]))
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/reducation/TWTAUU?startDate={a}&endDate={b}&response=json", f"twse_rd_{month}")
    f = (j or {}).get("fields") or []
    if "股票代號" in f and "恢復買賣參考價" in f:
        for r in j.get("data") or []:
            put(roc_date(r[f.index("恢復買賣日期")]), clean(r[f.index("股票代號")]), fm.num(r[f.index("恢復買賣參考價")]))
    j = fm.get_json(f"https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate={y}/{m:02d}/01&endDate={last:%Y/%m/%d}&response=json",
                    f"tpex_ex_{month}")
    for t in (j or {}).get("tables", []):
        f = [clean(x) for x in (t.get("fields") or [])]
        if "代號" in f and "除權息參考價" in f:
            for r in t.get("data") or []:
                put(roc_date(r[f.index("除權息日期")]), clean(r[f.index("代號")]), fm.num(r[f.index("除權息參考價")]))
    return out


def apply_refs(rows, ref):
    """有官方參考價的日子，以參考價重算還原報酬；證交所標「X」但查無參考價的，報酬留空。"""
    for code, v in rows.items():
        if code in ref and v[3]:
            v[5] = round(v[3] / ref[code] - 1, 6)
    return rows


def twse(d):
    ymd = d.strftime("%Y%m%d")
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={ymd}&type=ALLBUT0999&response=json",
                    f"twse_q_{ymd}")
    out, names = {}, {}
    for t in (j or {}).get("tables", []):
        f = [clean(x) for x in (t.get("fields") or [])]
        if "證券代號" not in f or "收盤價" not in f:
            continue
        ci = {n: i for i, n in enumerate(f)}
        si = next((i for i, n in enumerate(f) if n.startswith("漲跌(") or n == "漲跌(+/-)"), None)
        di = ci.get("漲跌價差")
        for r in t.get("data", []):
            code = clean(r[ci["證券代號"]])
            if not keep(code):
                continue
            chg = fm.num(r[di]) if di is not None else None
            sign = clean(r[si]) if si is not None else ""
            if "X" in sign.upper():
                chg = None                  # 除權息／特殊情況：價差不可用，待官方參考價補上
            elif chg is not None and "-" in sign:
                chg = -abs(chg)
            v = row_out(fm.num(r[ci["開盤價"]]), fm.num(r[ci["最高價"]]), fm.num(r[ci["最低價"]]),
                        fm.num(r[ci["收盤價"]]), fm.num(r[ci["成交股數"]]), chg)
            if v:
                out[code] = v
                names[code] = clean(r[ci["證券名稱"]])
    return out, names


def tpex(d):
    j = fm.get_json(f"https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?date={fm.roc(d)}&type=EW&response=json",
                    f"tpex_q_{d:%Y%m%d}")
    out, names = {}, {}
    got = str((j or {}).get("date") or "")
    if got and got != d.strftime("%Y%m%d"):
        return out, names            # 來源給了別天的資料：寧可缺漏
    for t in (j or {}).get("tables", []):
        f = [clean(x) for x in (t.get("fields") or [])]
        ci = {n: i for i, n in enumerate(f)}
        if "代號" not in ci or "收盤" not in ci:
            continue
        for r in t.get("data", []):
            code = clean(r[ci["代號"]])
            if not keep(code):
                continue
            chg = fm.num(r[ci["漲跌"]]) if "漲跌" in ci else None
            v = row_out(fm.num(r[ci["開盤"]]), fm.num(r[ci["最高"]]), fm.num(r[ci["最低"]]),
                        fm.num(r[ci["收盤"]]), fm.num(r[ci["成交股數"]]), chg)
            if v:
                out[code] = v
                names[code] = clean(r[ci["名稱"]])
    return out, names


def load(month):
    p = os.path.join(OUT, f"{month}.json.gz")
    if os.path.exists(p):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)
    return {"names": {}, "days": {}}


def save(month, obj):
    os.makedirs(OUT, exist_ok=True)
    obj["days"] = dict(sorted(obj["days"].items()))
    # mtime=0：內容相同時檔案位元組也相同，git 才不會每天都當成有變動
    with open(os.path.join(OUT, f"{month}.json.gz"), "wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
            gz.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=5)
    ap.add_argument("--budget", type=float, default=0, help="分鐘；0 = 不限")
    args = ap.parse_args()
    t0 = time.time()
    days = calendar(args.days)
    print(f"交易日 {days[0]}～{days[-1]} 共 {len(days)} 天", flush=True)
    cache, done, empty, dirty = {}, 0, [], set()
    for d in reversed(days):            # 由新到舊：中途停下時，近期資料先齊
        if args.budget and (time.time() - t0) / 60 > args.budget:
            print("時間預算用完，下次接著補", flush=True)
            break
        month, key = d.strftime("%Y-%m"), d.isoformat()
        if month not in cache:
            cache[month] = load(month)
            if "ref" not in cache[month] or month == days[-1].strftime("%Y-%m"):
                cache[month]["ref"] = refs(month)
                dirty.add(month)
        m = cache[month]
        if key in m["days"] and d != days[-1]:
            continue
        q1, n1 = twse(d)
        q2, n2 = tpex(d)
        if len(q1) < 300:               # 上市少於 300 檔＝來源異常，不存
            empty.append(key)
            continue
        m["days"][key] = apply_refs({**q1, **q2}, m["ref"].get(key, {}))
        m["names"].update({**n1, **n2})
        dirty.add(month)
        done += 1
        if done == 1 or done % 50 == 0:
            r = q1.get("2330")
            print(f"  {key}：上市 {len(q1)}、上櫃 {len(q2)} 檔；2330 → {r}（已補 {done} 天，{(time.time()-t0)/60:.0f} 分）", flush=True)
            for mm in list(dirty):
                save(mm, cache[mm])
            dirty.clear()
    for mm in dirty:
        save(mm, cache[mm])
    print(f"本次新增 {done} 天；無資料 {empty[:10]}（共 {len(empty)}）", flush=True)


if __name__ == "__main__":
    main()
