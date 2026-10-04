#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台指期（TX）：日盤＋夜盤行情、三大法人期貨未平倉、選擇權 Put/Call Ratio，
以及「夜盤漲跌 → 隔日台股開盤」的五年統計。

來源（全部是官方免費下載）：
  期交所 期貨每日交易行情   POST https://www.taifex.com.tw/cht/3/futDataDown      （CSV，big5）
  期交所 三大法人期貨（依商品） POST https://www.taifex.com.tw/cht/3/futContractsDateDown
  期交所 Put/Call Ratio        POST https://www.taifex.com.tw/cht/3/pcRatioDown
  證交所 加權指數每日收盤      https://www.twse.com.tw/rwd/zh/indicesReport/MI_5MINS_HIST
  證交所 0050 每日開收盤        https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY
    （加權指數 9:00 的「開盤」是用前一天收盤價算的，不能代表開盤跳空；改用 0050 的開盤競價）

夜盤的交易日歸屬：期交所規定盤後交易時段屬於「次一營業日」。
  所以資料中「交易日期 T、交易時段 盤後」＝ T 的前一個營業日 15:00 到 T 當天 05:00 的夜盤，
  正好是 T 日 9:00 台股開盤前的最後行情。週五晚上的夜盤歸屬下週一。

輸出：
  data/taifex/YYYY-MM.json   逐月整理後的日資料（已結束的月份不重抓）
  web/data/taifex.json       前端用：最新一筆、近 60 日、統計結果

用法：python scripts/fetch_taifex.py [--months 62]
"""

import argparse
import csv
import io
import json
import math
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STORE = os.path.join(ROOT, "data", "taifex")
OUT = os.path.join(ROOT, "web", "data", "taifex.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
TF = "https://www.taifex.com.tw/cht/3/"
S = requests.Session()
S.headers.update(UA)
TW = timezone(timedelta(hours=8))
VERBOSE = False


def num(v):
    try:
        x = float(str(v).replace(",", "").strip())
        return x if x == x else None
    except (TypeError, ValueError):
        return None


def iso(s):
    """'2026/10/02'、'20261002'、'115/10/02' → '2026-10-02'"""
    m = re.match(r"\s*(\d{2,4})\D?(\d{1,2})\D?(\d{1,2})", str(s))
    if not m:
        return None
    y = int(m.group(1))
    y = y + 1911 if y < 1911 else y
    return f"{y}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def post_csv(path, data, tag):
    for k in range(3):
        try:
            r = S.post(TF + path, data=data, timeout=60)
            time.sleep(1.2)
            r.raise_for_status()
            txt = r.content.decode("cp950", errors="replace")
            rows = [x for x in csv.reader(io.StringIO(txt)) if any(c.strip() for c in x)]
            if VERBOSE:
                print(f"  [{tag}] HTTP {r.status_code} {r.headers.get('content-type')} {len(r.content)} bytes，{len(rows)} 列")
                for x in rows[:3]:
                    print("    ", x[:20])
            if rows and len(rows[0]) > 3:
                return rows
            if rows and k == 2:
                print(f"  ! {tag} 回應不是 CSV：{txt[:200]!r}", file=sys.stderr)
        except Exception as e:                       # noqa: BLE001
            print(f"  ! {tag} 第 {k + 1} 次失敗：{e!r}", file=sys.stderr)
        time.sleep(3 * (k + 1))
    return []


def get_json(url, tag):
    for k in range(3):
        try:
            r = S.get(url, timeout=40)
            time.sleep(2)
            return r.json()
        except Exception as e:                       # noqa: BLE001
            print(f"  ! {tag} 第 {k + 1} 次失敗：{e!r}", file=sys.stderr)
            time.sleep(4 * (k + 1))
    return None


def col(head, *keys):
    for k in keys:
        for i, h in enumerate(head):
            if k in h.strip():
                return i
    return None


# ── 期貨行情 ─────────────────────────────────────────────────────────
def futures(a, b):
    """{日期: {"day": [合約, 開, 高, 低, 收, 量, 結算, 未平倉], "night": [...]}}，各時段取成交量最大的月合約；
    另外記下全部月合約，算夜盤報酬時用同一個合約前後比。"""
    rows = post_csv("futDataDown", {"down_type": "1", "commodity_id": "TX", "commodity_id2": "",
                                    "queryStartDate": a.strftime("%Y/%m/%d"), "queryEndDate": b.strftime("%Y/%m/%d")},
                    f"期貨行情 {a}")
    if not rows:
        return {}
    h = rows[0]
    ci = {k: col(h, *v) for k, v in {"d": ("交易日期",), "c": ("契約",), "m": ("到期月份",), "o": ("開盤",),
                                     "hi": ("最高",), "lo": ("最低",), "cl": ("收盤",), "v": ("成交量",),
                                     "st": ("結算價",), "oi": ("未沖銷",), "s": ("交易時段",)}.items()}
    if None in (ci["d"], ci["m"], ci["cl"]):
        print(f"  ! 期貨行情欄位看不懂：{h}", file=sys.stderr)
        return {}
    out = {}
    for r in rows[1:]:
        if len(r) <= max(i for i in ci.values() if i is not None):
            continue
        if ci["c"] is not None and r[ci["c"]].strip() != "TX":
            continue
        m = r[ci["m"]].strip()
        if not re.fullmatch(r"\d{6}", m):          # 排除週契約（W）與價差（/）
            continue
        d = iso(r[ci["d"]])
        sess = "night" if ci["s"] is not None and "盤後" in r[ci["s"]] else "day"
        rec = [m] + [num(r[ci[k]]) if ci[k] is not None else None for k in ("o", "hi", "lo", "cl", "v", "st", "oi")]
        if rec[4] is None and rec[6] is None:
            continue
        out.setdefault(d, {}).setdefault(sess + "_all", {})[m] = rec
    for d, x in out.items():
        for sess in ("day", "night"):
            allm = x.get(sess + "_all") or {}
            if allm:
                x[sess] = max(allm.values(), key=lambda q: q[5] or 0)
    return out


def insti(a, b):
    """{日期: {"外資": [多空未平倉口數淨額, 多空交易口數淨額], ...}}"""
    rows = post_csv("futContractsDateDown", {"queryStartDate": a.strftime("%Y/%m/%d"),
                                             "queryEndDate": b.strftime("%Y/%m/%d"), "commodityId": "TXF"},
                    f"三大法人 {a}")
    if not rows:
        return {}
    h = rows[0]
    di, wi, ni, oi_ = col(h, "日期"), col(h, "身份別"), col(h, "多空交易口數淨額"), col(h, "多空未平倉口數淨額")
    pi = col(h, "商品名稱")
    if None in (di, wi, oi_):
        print(f"  ! 三大法人欄位看不懂：{h}", file=sys.stderr)
        return {}
    out = {}
    for r in rows[1:]:
        if len(r) <= max(di, wi, oi_):
            continue
        if pi is not None and "臺股期貨" not in r[pi] and "台股期貨" not in r[pi]:
            continue
        who = r[wi].strip()
        who = "外資" if "外資" in who else "投信" if "投信" in who else "自營商" if "自營" in who else who
        out.setdefault(iso(r[di]), {})[who] = [num(r[oi_]), num(r[ni]) if ni is not None else None]
    return out


def pcr(a, b):
    rows = post_csv("pcRatioDown", {"queryStartDate": a.strftime("%Y/%m/%d"), "queryEndDate": b.strftime("%Y/%m/%d")},
                    f"PCR {a}")
    if not rows:
        return {}
    h = rows[0]
    di, vi, oi_ = col(h, "日期"), col(h, "成交量比率"), col(h, "未平倉量比率")
    if None in (di, oi_):
        print(f"  ! PCR 欄位看不懂：{h}", file=sys.stderr)
        return {}
    return {iso(r[di]): [num(r[vi]) if vi is not None else None, num(r[oi_])] for r in rows[1:] if len(r) > oi_}


def taiex(month):
    j = get_json(f"https://www.twse.com.tw/rwd/zh/indicesReport/MI_5MINS_HIST?date={month.replace('-', '')}01&response=json",
                 f"加權指數 {month}")
    f = (j or {}).get("fields") or []
    out = {}
    if "收盤指數" in f:
        for r in j.get("data") or []:
            out[iso(r[0])] = num(r[f.index("收盤指數")])
    return out


def etf0050(month):
    j = get_json(f"https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={month.replace('-', '')}01&stockNo=0050&response=json",
                 f"0050 {month}")
    f = (j or {}).get("fields") or []
    out = {}
    if "開盤價" in f and "收盤價" in f:
        for r in j.get("data") or []:
            o, c = num(r[f.index("開盤價")]), num(r[f.index("收盤價")])
            if o and c:
                out[iso(r[0])] = [o, c]
    return out


# ── 逐月整理 ─────────────────────────────────────────────────────────
def month_range(month):
    y, m = map(int, month.split("-"))
    a = date(y, m, 1)
    b = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
    return a, b


def fetch_month(month, today):
    a, b = month_range(month)
    # 當月：查詢結束日往後多給幾天，才拿得到「歸屬下一營業日」的夜盤（例如週五晚上的夜盤歸屬下週一）
    b2 = min(b + timedelta(days=7), today + timedelta(days=7)) if b >= today - timedelta(days=1) else b
    fu = futures(a, b2)
    if not fu:
        return None
    ins, pc, ix, e5 = insti(a, b2), pcr(a, b2), taiex(month), etf0050(month)
    days = {}
    for d in sorted(set(fu) | set(ix)):
        x = fu.get(d, {})
        days[d] = {"day": x.get("day"), "night": x.get("night"),
                   "day_all": {m: v[4] or v[6] for m, v in (x.get("day_all") or {}).items()},
                   "fi": (ins.get(d) or {}).get("外資"), "it": (ins.get(d) or {}).get("投信"),
                   "dl": (ins.get(d) or {}).get("自營商"), "pcr": pc.get(d), "taiex": ix.get(d), "e50": e5.get(d)}
    return {"month": month, "complete": b < today - timedelta(days=7), "days": days}


def months_back(today, n):
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out[::-1]


# ── 統計 ──────────────────────────────────────────────────────────────
def ols(x, y):
    n = len(x)
    if n < 30:
        return None
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    syy = sum((b - my) ** 2 for b in y)
    if sxx <= 0 or syy <= 0:
        return None
    beta = sxy / sxx
    alpha = my - beta * mx
    resid = [b - alpha - beta * a for a, b in zip(x, y)]
    s2 = sum(e * e for e in resid) / (n - 2)
    se = math.sqrt(s2 / sxx)
    r = sxy / math.sqrt(sxx * syy)
    same = sum(1 for a, b in zip(x, y) if a * b > 0) / max(1, sum(1 for a, b in zip(x, y) if a != 0 and b != 0))
    return {"n": n, "beta": round(beta, 3), "t": round(beta / se, 2) if se > 0 else None,
            "r2": round(r * r, 3), "corr": round(r, 3), "same_sign": round(same * 100, 1)}


def buckets(x, y, edges=(-1.0, -0.5, -0.2, 0.2, 0.5, 1.0)):
    """依夜盤漲跌（%）分組，看隔日的平均與中位數（%）。"""
    lab = [f"< {edges[0]}%"] + [f"{edges[i]}%～{edges[i + 1]}%" for i in range(len(edges) - 1)] + [f"> {edges[-1]}%"]
    grp = [[] for _ in lab]
    for a, b in zip(x, y):
        k = sum(1 for e in edges if a >= e)
        grp[k].append(b)
    out = []
    for l_, g in zip(lab, grp):
        if not g:
            continue
        s = sorted(g)
        out.append({"label": l_, "n": len(g), "mean": round(sum(g) / len(g), 3), "median": round(s[len(s) // 2], 3),
                    "up": round(sum(1 for v in g if v > 0) / len(g) * 100, 1)})
    return out


def build(stores):
    days = {}
    for s in stores:
        days.update(s["days"])
    ds = sorted(d for d in days if days[d].get("day") or days[d].get("taiex"))
    seq = []
    for i, d in enumerate(ds):
        x = days[d]
        p = days[ds[i - 1]] if i else None
        rec = {"date": d, "tx": (x["day"] or [None] * 8)[4], "taiex": x["taiex"], "pcr": (x["pcr"] or [None, None])[1],
               "fi": (x["fi"] or [None])[0], "it": (x["it"] or [None])[0], "dl": (x["dl"] or [None])[0]}
        rec["basis"] = round(rec["tx"] - rec["taiex"], 2) if rec["tx"] and rec["taiex"] else None
        # 夜盤：同一個合約的夜盤收盤 ÷ 前一營業日日盤收盤
        nt = x.get("night")
        if nt and p:
            prev = (p.get("day_all") or {}).get(nt[0])
            if prev and nt[4]:
                rec["night"] = nt[4]
                rec["night_ret"] = round((nt[4] / prev - 1) * 100, 3)
                rec["night_pts"] = round(nt[4] - prev, 1)
                rec["night_hi"], rec["night_lo"] = nt[2], nt[3]
        if p:
            if x.get("e50") and p.get("e50"):
                o, c = x["e50"]
                pc_ = p["e50"][1]
                g = (o / pc_ - 1) * 100
                if abs(g) < 15:                      # 0050 分割（2025-06）那天前後無法比
                    rec["gap50"] = round(g, 3)
                    rec["oc50"] = round((c / o - 1) * 100, 3)
                    rec["cc50"] = round((c / pc_ - 1) * 100, 3)
            if rec["taiex"] and p.get("taiex"):
                rec["ret"] = round((rec["taiex"] / p["taiex"] - 1) * 100, 3)
            pf = (p.get("fi") or [None])[0]
            if rec["fi"] is not None and pf is not None:
                rec["fi_chg"] = rec["fi"] - pf
        rec["dow"] = date.fromisoformat(d).weekday()
        seq.append(rec)

    # 外資期貨未平倉變化 → 下一個交易日加權指數報酬
    for i in range(len(seq) - 1):
        seq[i]["next_ret"] = seq[i + 1].get("ret")

    def pairs(xk, yk, cond=lambda r: True):
        xs, ys = [], []
        for r in seq:
            if r.get(xk) is not None and r.get(yk) is not None and cond(r):
                xs.append(r[xk])
                ys.append(r[yk])
        return xs, ys

    study = {}
    for key, (xk, yk, cond, label) in {
        "gap": ("night_ret", "gap50", lambda r: True, "夜盤漲跌 → 0050 當天開盤跳空"),
        "gap_mon": ("night_ret", "gap50", lambda r: r["dow"] == 0, "（週一）週五夜盤 → 0050 週一開盤跳空"),
        "intraday": ("night_ret", "oc50", lambda r: True, "夜盤漲跌 → 0050 當天開盤到收盤"),
        "close": ("night_ret", "cc50", lambda r: True, "夜盤漲跌 → 0050 當天收盤漲跌"),
        "fi_next": ("fi_chg", "next_ret", lambda r: True, "外資台指期淨未平倉變化（口）→ 隔日加權指數漲跌"),
        "basis_next": ("basis", "next_ret", lambda r: True, "台指期基差（點）→ 隔日加權指數漲跌"),
        "pcr_next": ("pcr", "next_ret", lambda r: True, "Put/Call 未平倉比 → 隔日加權指數漲跌"),
    }.items():
        xs, ys = pairs(xk, yk, cond)
        res = ols(xs, ys)
        if res:
            res["label"] = label
            if xk == "night_ret":
                res["buckets"] = buckets(xs, ys)
            # 前後半段各算一次，看關係是否穩定
            h = len(xs) // 2
            a, b = ols(xs[:h], ys[:h]), ols(xs[h:], ys[h:])
            res["halves"] = [a and a["t"], b and b["t"]]
            study[key] = res

    last = seq[-1] if seq else {}
    lastday = next((r for r in reversed(seq) if r.get("tx")), {})
    doc = {
        "generated_at": datetime.now(TW).isoformat(timespec="seconds"),
        "range": [seq[0]["date"], seq[-1]["date"]] if seq else None,
        "latest": {"date": last.get("date"), "night": last.get("night"), "night_ret": last.get("night_ret"),
                   "night_pts": last.get("night_pts"), "night_hi": last.get("night_hi"), "night_lo": last.get("night_lo"),
                   "day_date": lastday.get("date"), "tx": lastday.get("tx"), "taiex": lastday.get("taiex"),
                   "basis": lastday.get("basis"), "fi": lastday.get("fi"), "fi_chg": lastday.get("fi_chg"),
                   "it": lastday.get("it"), "dl": lastday.get("dl"), "pcr": lastday.get("pcr")},
        "hist": [{k: r.get(k) for k in ("date", "tx", "taiex", "basis", "night", "night_ret", "fi", "pcr", "gap50")}
                 for r in seq[-60:]],
        "study": study,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    L = doc["latest"]
    print(f"台指期 {doc['range']}：{len(seq)} 天；最新夜盤歸屬 {L['date']} 收 {L['night']}（{L['night_ret']}%）；"
          f"日盤 {L['day_date']} TX {L['tx']} 加權 {L['taiex']} 基差 {L['basis']} 外資淨未平倉 {L['fi']} PCR {L['pcr']}")
    for k, v in study.items():
        print(f"  {v['label']}：n={v['n']} β={v['beta']} t={v['t']} R²={v['r2']} 同向 {v['same_sign']}% 前後半 t={v['halves']}")
        for b in v.get("buckets", []):
            print(f"      夜盤 {b['label']:>12}：n={b['n']:4d} 平均 {b['mean']:+.3f}% 中位 {b['median']:+.3f}% 上漲 {b['up']}%")


def main():
    global VERBOSE
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=62)
    ap.add_argument("--budget", type=float, default=15, help="最多花幾分鐘回補舊月份")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    VERBOSE = args.verbose
    os.makedirs(STORE, exist_ok=True)
    today = datetime.now(TW).date()
    t0 = time.time()
    stores, got = [], 0
    for month in reversed(months_back(today, args.months)):
        path = os.path.join(STORE, f"{month}.json")
        old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else None
        if old and old.get("complete"):
            stores.append(old)
            continue
        if old and (time.time() - t0) > args.budget * 60:
            stores.append(old)
            continue
        if not old and (time.time() - t0) > args.budget * 60:
            continue
        s = fetch_month(month, today)
        if s:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(s, f, ensure_ascii=False, separators=(",", ":"))
            stores.append(s)
            got += 1
            print(f"{month}：{len(s['days'])} 天{'（完整）' if s['complete'] else ''}")
        elif old:
            stores.append(old)
    if not stores:
        sys.exit("台指期資料一筆都沒有（期交所來源可能改版或擋連線）")
    print(f"本次抓 {got} 個月，共 {len(stores)} 個月")
    build(sorted(stores, key=lambda s: s["month"]))


if __name__ == "__main__":
    main()
