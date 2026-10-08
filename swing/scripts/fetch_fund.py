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

三、資產負債表（公開資訊觀測站 資產負債表彙總 t163sb05，上市＋上櫃）
    存 swing/data/fund/balance.json
    {"2024Q2": {code: [資產總額, 負債總額, 權益總額, 歸屬母公司權益, 流動資產, 流動負債]}}   ← 季末時點值，千元
    金融業沒有流動資產／流動負債，該兩欄為 null。用來算 ROE、負債比、流動比等獲利品質指標。

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
MOPS_HOSTS = ["https://mopsov.twse.com.tw/mops/web/", "https://mops.twse.com.tw/mops/web/"]


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


def ni_gap(store, key, j=3, limit=0.05):
    """淨利（第 j 欄）空白的公司超過 5%：舊版解析只取第一個符合的欄位造成的缺漏，需要重抓。"""
    v = store.get(key) or {}
    return bool(v) and sum(1 for x in v.values() if x[j] is None) > limit * len(v)


def incomplete(store, key, ratio=0.85):
    """某季家數明顯少於相鄰季（例：上櫃那次沒抓到，只剩上市約一半）→ 視為不完整、需要重抓。"""
    if key not in store:
        return True
    ks = sorted(store)
    i = ks.index(key)
    nb = [len(store[k]) for k in ks[max(0, i - 1):i + 2] if k != key]
    return bool(nb) and len(store[key]) < ratio * max(nb)


# ── 季報 ─────────────────────────────────────────────────────────────
COLS = {"rev": ["營業收入", "收益", "收入合計"], "gp": ["營業毛利"], "op": ["營業利益"],
        "ni": ["歸屬於母公司業主", "本期淨利", "本期稅後淨利", "本期淨損益", "本期損益", "本期淨益", "淨利（淨損）", "淨利(淨損)"],
        "eps": ["基本每股盈餘"]}
_SHOWN = set()          # 已印過的「找不到欄位」表頭，避免重複


def num(s):
    s = s.strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


BAL_COLS = {"ta": ["資產總額", "資產總計"], "tl": ["負債總額", "負債總計"], "eq": ["權益總額", "權益總計"],
            "eqp": ["歸屬於母公司業主之權益"], "ca": ["流動資產"], "cl": ["流動負債"]}


def parse_income(html, cols=None):
    cols = cols or COLS
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
        for k, pats in cols.items():
            # 依優先順序列出所有符合的欄位；每一列取第一個有值的
            # （同一張表常同時有「歸屬於母公司業主」與「本期淨利」，沒有子公司的公司前者是空白）
            cand = []
            for p in pats:
                cand += [i for i, h in enumerate(head) if p in h and i not in cand]
            if cand:
                idx[k] = cand
        miss = [k for k in cols if k not in idx and k in ("ni", "ta", "tl")]
        sig = (tuple(miss), tuple(head[:30]))
        if miss and sig not in _SHOWN and len(_SHOWN) < 6:
            _SHOWN.add(sig)
            print(f"  ⚠️ 表格缺欄位 {miss}，表頭：{head}", flush=True)
        for tr in trs[1:]:
            td = [x.get_text(strip=True) for x in tr.find_all("td")]
            if len(td) < len(head) or not re.fullmatch(r"\d{4}", td[0]):
                continue
            out[td[0]] = [next((v for v in (num(td[i]) for i in idx[k]) if v is not None), None) if k in idx else None
                          for k in cols]
    return out


def fetch_income(mkt, y, q, ep="ajax_t163sb04", cols=None):
    data = {"encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1, "isQuery": "Y",
            "TYPEK": mkt, "year": str(y - 1911), "season": f"{q:02d}"}
    err = None
    for rnd in range(2):
        for url in (h + ep for h in MOPS_HOSTS):
            try:
                r = requests.post(url, data=data, headers=UA, timeout=20)
                if r.status_code == 200:
                    r.encoding = "utf-8"
                    rows = parse_income(r.text, cols)
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
    ap.add_argument("--years", type=int, default=11)   # 回測涵蓋 2016 起的十年官方日線；已有的月份／季度不重抓
    ap.add_argument("--budget", type=float, default=15, help="分鐘；超過就存檔收工，下次接著補（外層 timeout 要比這長）")
    args = ap.parse_args()
    t_start = time.time()

    def over(frac=1.0):
        return time.time() - t_start > args.budget * 60 * frac

    val = load("valuation.json")
    days = month_ends(calendar(args.years * 250 + 30))
    print(f"月底 {len(days)} 天：{days[0]}～{days[-1]}", flush=True)
    new, tpex_ok = 0, None
    t0 = time.time()
    for d in reversed(days):                     # 新的先抓：預算用完時最新月底一定已更新
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
            save("valuation.json", val)          # 分段存檔：被外層 timeout 砍掉也不白跑
        if over(0.55):                           # 留時間給季報，兩邊每天都有進度
            print("  時間預算用完，估值先停在這裡", flush=True)
            break
    save("valuation.json", val)
    print(f"估值：{len(val)} 個月底（本次新增 {new}）")

    inc = load("income.json")
    qs = quarters(args.years)
    failed, streak = [], 0
    for i, (y, q) in reversed(list(enumerate(qs))):   # 新的先抓，再往回補
        key = f"{y}Q{q}"
        if not incomplete(inc, key) and not ni_gap(inc, key) and i < len(qs) - 1:
            continue
        if over():
            print("  時間預算用完，季報下次接著補", flush=True)
            break
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
        filled = lambda d: sum(1 for x in d.values() if x[3] is not None)      # noqa: E731
        if len(rows) > 500 and (len(rows) > len(inc.get(key, {})) or filled(rows) > filled(inc.get(key, {}))):
            inc[key] = rows
            if len(inc) == 1 or i == len(qs) - 1:
                print(f"  季報樣本 {key}：{len(rows)} 家，例 2330 → {rows.get('2330')}")
        print(f"{key}: {len(rows)} 家", flush=True)
        save("income.json", inc)                 # 每季存一次
    save("income.json", inc)
    print(f"季報：{len(inc)} 季；失敗 {failed[:6]}")

    # 資產負債表：同樣新的先抓、每季存檔；季報抓完剩下的預算給它
    bal = load("balance.json")
    bfail, streak = [], 0
    for i, (y, q) in reversed(list(enumerate(qs))):
        key = f"{y}Q{q}"
        if not incomplete(bal, key) and i < len(qs) - 1:
            continue
        if over():
            print("  時間預算用完，資產負債表下次接著補", flush=True)
            break
        if streak >= 2:
            print("  連續兩季都抓不到，停止資產負債表", flush=True)
            break
        rows = {}
        for mkt in ("sii", "otc"):
            try:
                rows.update(fetch_income(mkt, y, q, "ajax_t163sb05", BAL_COLS))
            except Exception as e:
                bfail.append(str(e)[:150])
        streak = 0 if rows else streak + 1
        if len(rows) > 500 and len(rows) > len(bal.get(key, {})):
            bal[key] = rows
            if len(bal) == 1 or i == len(qs) - 1:
                print(f"  資產負債表樣本 {key}：{len(rows)} 家，例 2330 → {rows.get('2330')}")
        print(f"{key} 資產負債表: {len(rows)} 家", flush=True)
        save("balance.json", bal)
    print(f"資產負債表：{len(bal)} 季；失敗 {bfail[:6]}")
    if not val and not inc:
        sys.exit("基本面資料全部失敗")


if __name__ == "__main__":
    main()
