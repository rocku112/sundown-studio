#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基本面歷史，供「低本益比／高殖利率／季報成長」等檢驗。

一、估值（證交所／櫃買每日公布的本益比、殖利率、股價淨值比）
    每月最後一個交易日抓一次（五年約 60 天 × 2 個市場），存 swing/data/fund/valuation.json
    {"YYYY-MM-DD": {code: [本益比, 殖利率%, 股價淨值比]}}

二、季報（公開資訊觀測站 綜合損益表彙總 t163sb04，上市＋上櫃）
    存 swing/data/fund/income.json
    {"2024Q2": {code: [營收, 毛利, 營業利益, 歸屬母公司淨利, EPS]}}   ← 皆為「年初至該季累計」，單位千元／元
    回測時一律以法定申報期限（Q1 5/15、Q2 8/14、Q3 11/14、Q4 隔年 3/31）之後才視為已知。

已存在的日期／季別不重抓（最近一季每次重抓）。

用法：python swing/scripts/fetch_fund.py [--years 5]
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date

import requests
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
OUT = os.path.join(ROOT, "data", "fund")
sys.path.insert(0, os.path.join(REPO, "twflow", "scripts"))
sys.path.insert(0, HERE)

import fetch_market as fm          # noqa: E402
from fetch_chips import calendar   # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
MOPS = ["https://mopsov.twse.com.tw/mops/web/ajax_t163sb04", "https://mops.twse.com.tw/mops/web/ajax_t163sb04"]


def load(name):
    p = os.path.join(OUT, name)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def save(name, obj):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(dict(sorted(obj.items())), f, ensure_ascii=False, separators=(",", ":"))


# ── 估值 ─────────────────────────────────────────────────────────────
def pick_cols(fields, want):
    f = [re.sub(r"<[^>]+>", "", str(x)).strip() for x in fields]
    out = {}
    for key, pats in want.items():
        out[key] = next((i for i, x in enumerate(f) if any(p in x for p in pats)), None)
    return out


WANT = {"code": ["證券代號", "股票代號", "代號"], "pe": ["本益比"], "dy": ["殖利率"], "pb": ["股價淨值比", "淨值比"]}


def twse_val(d):
    ymd = d.strftime("%Y%m%d")
    j = fm.get_json(f"https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date={ymd}&selectType=ALL&response=json",
                    f"twse_v_{ymd}")
    if not j or j.get("stat") not in (None, "OK"):
        return {}
    ci = pick_cols(j.get("fields") or [], WANT)
    return rows_to_val(j.get("data") or [], ci)


def tpex_val(d):
    j = fm.get_json(f"https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date={fm.roc(d)}&response=json",
                    f"tpex_v_{d:%Y%m%d}")
    out = {}
    got = str((j or {}).get("date") or "")
    if got and got not in (d.strftime("%Y%m%d"), fm.roc(d).replace("/", "")):
        print(f"    ! 上櫃估值日期不符：要 {d} 得 {got}，捨棄")
        return out
    for t in (j or {}).get("tables", []):
        out.update(rows_to_val(t.get("data") or [], pick_cols(t.get("fields") or [], WANT)))
    return out


def rows_to_val(rows, ci):
    out = {}
    if ci.get("code") is None:
        return out
    for r in rows:
        code = str(r[ci["code"]]).strip()
        if fm.STOCK_RE.match(code):
            out[code] = [fm.num(r[ci[k]]) if ci.get(k) is not None else None for k in ("pe", "dy", "pb")]
    return out


def month_ends(days):
    out = []
    for a, b in zip(days, days[1:] + [None]):
        if b is None or a.month != b.month:
            out.append(a)
    return out


# ── 季報 ─────────────────────────────────────────────────────────────
COLS = {"rev": ["營業收入", "收益", "收入合計"], "gp": ["營業毛利"], "op": ["營業利益"],
        "ni": ["歸屬於母公司業主", "本期淨利", "本期稅後淨利"], "eps": ["基本每股盈餘"]}


def num(s):
    s = s.strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_income(html):
    soup = BeautifulSoup(html, "lxml")
    out = {}
    for tb in soup.find_all("table"):
        trs = tb.find_all("tr")
        if not trs:
            continue
        head = [x.get_text(strip=True) for x in trs[0].find_all(["th", "td"])]
        if not head or "公司代號" not in head[0]:
            continue
        idx = {}
        for k, pats in COLS.items():
            for p in pats:          # 依優先順序找第一個符合的欄位
                hit = next((i for i, h in enumerate(head) if p in h), None)
                if hit is not None:
                    idx[k] = hit
                    break
        for tr in trs[1:]:
            td = [x.get_text(strip=True) for x in tr.find_all("td")]
            if len(td) < len(head) or not re.fullmatch(r"\d{4}", td[0]):
                continue
            out[td[0]] = [num(td[idx[k]]) if k in idx else None for k in COLS]
    return out


def fetch_income(mkt, y, q):
    data = {"encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1, "isQuery": "Y",
            "TYPEK": mkt, "year": str(y - 1911), "season": f"{q:02d}"}
    err = None
    for rnd in range(2):
        for url in MOPS:
            try:
                r = requests.post(url, data=data, headers=UA, timeout=20)
                if r.status_code == 200:
                    r.encoding = "utf-8"
                    rows = parse_income(r.text)
                    if rows:
                        return rows
                    err = f"無資料表（{len(r.text)} 字元）"
                else:
                    err = f"HTTP {r.status_code}"
            except Exception as e:      # 換下一個主機
                err = repr(e)[:100]
            time.sleep(1.5)
        time.sleep(4 * (rnd + 1))
    raise RuntimeError(f"{mkt} {y}Q{q}: {err}")


def quarters(years):
    t = date.today()
    out = []
    for y in range(t.year - years - 1, t.year + 1):
        for q in range(1, 5):
            # 申報期限：Q1 5/15、Q2 8/14、Q3 11/14、Q4 隔年 3/31
            due = {1: date(y, 5, 15), 2: date(y, 8, 14), 3: date(y, 11, 14), 4: date(y + 1, 3, 31)}[q]
            if due < t:
                out.append((y, q))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    args = ap.parse_args()

    val = load("valuation.json")
    days = month_ends(calendar(args.years * 250 + 30))
    print(f"月底 {len(days)} 天：{days[0]}～{days[-1]}", flush=True)
    new, tpex_ok = 0, None
    t0 = time.time()
    for d in days:
        k = d.isoformat()
        if k in val and d != days[-1]:
            continue
        v1 = twse_val(d)
        # 上櫃端點第一次就失敗時不再重試每個月份（每次失敗含退避約 20 秒）
        v2 = tpex_val(d) if tpex_ok is not False else {}
        if tpex_ok is None:
            tpex_ok = bool(v2)
            print(f"  上櫃估值端點：{'可用' if tpex_ok else '無資料，略過上櫃'}（{len(v2)} 檔）", flush=True)
        v = {**v1, **v2}
        if len(v) > 500:
            val[k] = v
            new += 1
        if new == 1 or new % 12 == 0:
            print(f"  估值 {k}：{len(v)} 檔，例 2330 → {v.get('2330')}（{(time.time()-t0)/60:.1f} 分）", flush=True)
    save("valuation.json", val)
    print(f"估值：{len(val)} 個月底（本次新增 {new}）")

    inc = load("income.json")
    qs = quarters(args.years)
    failed, streak = [], 0
    for i, (y, q) in enumerate(qs):
        key = f"{y}Q{q}"
        if key in inc and i < len(qs) - 1:
            continue
        if streak >= 2:
            print("  連續兩季都抓不到，來源可能擋了，停止季報", flush=True)
            break
        rows = {}
        for mkt in ("sii", "otc"):
            try:
                rows.update(fetch_income(mkt, y, q))
            except Exception as e:
                failed.append(str(e)[:150])
        streak = 0 if rows else streak + 1
        if len(rows) > 500:
            inc[key] = rows
            if len(inc) == 1 or i == len(qs) - 1:
                print(f"  季報樣本 {key}：{len(rows)} 家，例 2330 → {rows.get('2330')}")
        print(f"{key}: {len(rows)} 家", flush=True)
    save("income.json", inc)
    print(f"季報：{len(inc)} 季；失敗 {failed[:6]}")
    if not val and not inc:
        sys.exit("基本面資料全部失敗")


if __name__ == "__main__":
    main()
