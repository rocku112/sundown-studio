#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
官方長歷史：取代 Yahoo 的 0050／006208／0056 含息還原價與加權指數（研究頁的持有勝率、日曆效應、定期定額比較用）。

來源（全部是證交所官方）：
  · 個股日成交資訊 STOCK_DAY（每檔每月一次請求）：開、收、漲跌價差
  · 除權除息計算結果表 TWT49U（每月一次請求，所有股票共用）：除權息參考價
  · 每日市場成交資訊 FMTQIK（每月一次請求）：發行量加權股價指數

含息還原：每天的還原報酬 = 收盤 ÷（收盤 − 漲跌價差）− 1。證交所的漲跌價差本來就是對「參考價」計算，
所以分割（例：0050 於 2025 年 1 拆 4）恢復交易當天也正確；除權息日行情標「X」、價差不可用，
改用 TWT49U 的除權息參考價：收盤 ÷ 參考價 − 1。兩者都沒有時才用前一天收盤，單日超過 ±25% 視為資料錯誤，報酬記 0 並列出。

存放：swing/data/official/<代號>.json、twii.json：{"months": {YYYY-MM: [[日期, 開, 收, 漲跌價差或 null, X 標記]]}, "first": 最早月份}
      swing/data/official/exrights.json：{YYYY-MM: {代號: {日期: 參考價}}}
由新往舊回補，每次受時間預算限制；往前連續 3 個月查無資料就記下「first」（上市起點），之後不再往前。

讀取：series(code) → [(日期, 原始開盤, 原始收盤, 含息還原收盤)]；index_series() → [(日期, 指數)]。
     資料尚未從上市月份補齊時回傳 None，呼叫端退回 Yahoo。

用法：python swing/scripts/fetch_official.py [--budget 分鐘]
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
OUT = os.path.join(ROOT, "data", "official")
CODES = ["0050", "006208", "0056"]
sys.path.insert(0, os.path.join(REPO, "twflow", "scripts"))


def _clean(x):
    return re.sub(r"<[^>]+>", "", str(x)).strip()


def _roc(s):
    m = re.match(r"(\d+)\D+(\d+)\D+(\d+)", str(s).strip())
    return f"{int(m.group(1)) + 1911}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None


def _num(v):
    s = str(v).strip().replace(",", "").replace("+", "")
    try:
        return float(s)
    except ValueError:
        return None


def _load(name, default):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _save(name, obj):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def _months_back(n):
    d = date.today().replace(day=1)
    out = []
    for k in range(n):
        y, m = d.year, d.month - k
        while m <= 0:
            y, m = y - 1, m + 12
        out.append(f"{y}-{m:02d}")
    return out


def _cur_month():
    return date.today().strftime("%Y-%m")


# ── 抓取 ────────────────────────────────────────────────────────────
def stock_day(fm, code, ym):
    y, m = ym.split("-")
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={y}{m}01&stockNo={code}&response=json",
                    f"off_sd_{code}_{ym}", force=(ym == _cur_month()))
    if j is None:
        return None                                  # 連線失敗／被擋（不是「沒有資料」）
    f = [_clean(x) for x in j.get("fields") or []]
    if "日期" not in f or "收盤價" not in f:
        return []
    ci = {n: i for i, n in enumerate(f)}
    out = []
    for r in j.get("data") or []:
        d = _roc(r[ci["日期"]])
        c = _num(r[ci["收盤價"]])
        if not d or not c or c <= 0:
            continue
        raw = _clean(r[ci["漲跌價差"]]) if "漲跌價差" in ci else ""
        x = "X" in raw.upper()
        chg = None if x else _num(raw.replace("X", ""))
        out.append([d, _num(r[ci["開盤價"]]), c, chg, 1 if x else 0])
    return out


def fmtqik(fm, ym):
    y, m = ym.split("-")
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date={y}{m}01&response=json",
                    f"off_fmtqik_{ym}", force=(ym == _cur_month()))
    if j is None:
        return None
    f = [_clean(x) for x in j.get("fields") or []]
    if "日期" not in f:
        return []
    ii = next((i for i, n in enumerate(f) if "加權" in n and "指數" in n), None)
    if ii is None:
        return []
    out = []
    for r in j.get("data") or []:
        d, v = _roc(r[f.index("日期")]), _num(r[ii])
        if d and v:
            out.append([d, None, v, None, 0])
    return out


def exrights(fm, ym):
    y, m = map(int, ym.split("-"))
    ny, nm = (y, m + 1) if m < 12 else (y + 1, 1)
    last = (date(ny, nm, 1).toordinal() - 1)
    b = date.fromordinal(last).strftime("%Y%m%d")
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate={y}{m:02d}01&endDate={b}&response=json",
                    f"off_ex_{ym}", force=(ym == _cur_month()))
    f = (j or {}).get("fields") or []
    out = {}
    if "股票代號" in f and "除權息參考價" in f:
        for r in j.get("data") or []:
            c = _clean(r[f.index("股票代號")])
            d, ref = _roc(r[f.index("資料日期")]), _num(r[f.index("除權息參考價")])
            if c in CODES and d and ref and ref > 0:
                out.setdefault(c, {})[d] = ref
    return out


def backfill(budget_s):
    import fetch_market as fm
    t_all = time.time()
    exr = _load("exrights.json", {})
    targets = [(c, f"{c}.json", lambda ym, c=c: stock_day(fm, c, ym)) for c in CODES]
    targets.append(("TWII", "twii.json", lambda ym: fmtqik(fm, ym)))
    months = _months_back(12 * 40)
    for i, (name, fn, getter) in enumerate(targets):
        doc = _load(fn, {"months": {}, "first": None})
        empty, done = 0, 0
        # 每個目標分到「剩下時間 ÷ 剩下目標數」，已補齊的目標很快結束，時間自動留給後面的
        t0, budget_t = time.time(), max(0.0, (budget_s - (time.time() - t_all)) / (len(targets) - i))
        for ym in months:
            if time.time() - t0 > budget_t:
                print(f"  {name}：時間預算用完，下次接著補（目前 {len(doc['months'])} 個月）")
                break
            if doc["first"] and ym < doc["first"]:
                break
            if ym in doc["months"] and ym != _cur_month():
                empty = 0
                continue
            rows = getter(ym)
            if rows is None:
                print(f"  ⚠️ {name} {ym}：連線失敗或被限流，這次先停")
                break
            if rows:
                doc["months"][ym] = rows
                empty, done = 0, done + 1
                if name != "TWII" and (ym not in exr or ym == _cur_month()):
                    exr[ym] = exrights(fm, ym)
            else:
                empty += 1
                if empty >= 3 and doc["months"]:
                    doc["first"] = min(doc["months"])
                    print(f"  {name}：往前連續 3 個月查無資料，起點 {doc['first']}")
                    break
            if done and done % 12 == 0:
                _save(fn, doc)
                _save("exrights.json", exr)
        _save(fn, doc)
        _save("exrights.json", exr)
        ms = sorted(doc["months"])
        print(f"  {name}：{len(ms)} 個月（{ms[0] if ms else '—'}～{ms[-1] if ms else '—'}），本次補 {done} 個月，"
              f"{'已補到上市起點' if doc['first'] else '尚未補到起點'}")


# ── 讀取（研究程式用，不連網）────────────────────────────────────────
def _rows(fn):
    doc = _load(fn, None)
    if not doc or not doc.get("first"):
        return None
    ms = sorted(doc["months"])
    # 必須從起點連續到最近一個月（中間不能有洞）
    y, m = map(int, doc["first"].split("-"))
    want = []
    while f"{y}-{m:02d}" <= ms[-1]:
        want.append(f"{y}-{m:02d}")
        y, m = (y, m + 1) if m < 12 else (y + 1, 1)
    if any(w not in doc["months"] for w in want):
        return None
    rows = [r for w in want for r in doc["months"][w]]
    rows.sort(key=lambda r: r[0])
    return rows


def series(code):
    """[(日期, 原始開盤, 原始收盤, 含息還原收盤)]（與 evidence.fetch_0050 的 Yahoo 格式相同）；尚未補齊回傳 None。"""
    rows = _rows(f"{code}.json")
    if not rows:
        return None
    exr = _load("exrights.json", {})
    ref = {}
    for v in exr.values():
        ref.update(v.get(code, {}))
    rets, bad = [0.0], []
    for (d0, _, c0, _, _), (d, o, c, chg, x) in zip(rows, rows[1:]):
        if x and d in ref:
            r = c / ref[d] - 1
        elif not x and chg is not None and c - chg > 0:
            r = c / (c - chg) - 1
        else:
            r = c / c0 - 1
        if abs(r) > 0.25:
            bad.append((d, round(r * 100, 1)))
            r = 0.0
        rets.append(r)
    if bad:
        print(f"  ⚠️ {code} 官方還原報酬異常（已記 0）：{bad[:5]}", file=sys.stderr)
    out, v = [], 1.0
    for (d, o, c, _, _), r in zip(rows, rets):
        v *= 1 + r
        out.append((d, None, c, v))
    # 還原收盤以最後一天＝原始收盤為準（與 Yahoo adjclose 同尺度）；開盤、收盤保留原始價（與 Yahoo 格式相同）
    k = rows[-1][2] / out[-1][3]
    return [(d, r[1] or 0.0, c, a * k) for (d, _, c, a), r in zip(out, rows)]


def index_series():
    rows = _rows("twii.json")
    return [(r[0], r[2]) for r in rows] if rows else None


def compare(code, official, yahoo_rows):
    """交叉比對：兩邊共同日期的日報酬差。印出供 CI 紀錄檢查。"""
    a = {d: v for d, v in official}
    b = {d: v for d, v in yahoo_rows}
    ds = sorted(set(a) & set(b))
    if len(ds) < 50:
        return
    diffs = []
    for d0, d1 in zip(ds, ds[1:]):
        ra, rb = a[d1] / a[d0] - 1, b[d1] / b[d0] - 1
        diffs.append(abs(ra - rb))
    diffs.sort()
    big = sum(x > 0.005 for x in diffs)
    print(f"  {code} 官方 vs Yahoo：共同 {len(ds)} 天，日報酬差中位數 {diffs[len(diffs)//2]*100:.3f}%、"
          f"差超過 0.5% 的有 {big} 天；累積報酬 官方 {a[ds[-1]]/a[ds[0]]:.3f} 倍、Yahoo {b[ds[-1]]/b[ds[0]]:.3f} 倍")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=float, default=10, help="分鐘")
    args = ap.parse_args()
    print("官方長歷史（STOCK_DAY＋TWT49U、FMTQIK）：")
    backfill(args.budget * 60)
    for c in CODES:
        s = series(c)
        print(f"  {c} 還原序列：{'尚未補齊' if s is None else f'{len(s)} 天（{s[0][0]}～{s[-1][0]}）'}")
    ix = index_series()
    print(f"  加權指數：{'尚未補齊' if ix is None else f'{len(ix)} 天（{ix[0][0]}～{ix[-1][0]}）'}")


if __name__ == "__main__":
    main()
