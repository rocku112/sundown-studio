#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股 ETF 體質表：折溢價之外，長期持有真正要看的數字。

  賺多少 vs 發多少：含息年化報酬、股價（不含息）年化報酬、近 12 個月殖利率。
    「股價年化」為負＝這段期間配出去的比賺到的多，股價一路往下，配息有一部分是拿本金還你（左手換右手）。
    「股價年化」為正＝配完息股價還往上，配息確實是賺來的。
  風險：一年波動度、三年最大回撤。
  規模與人氣：受益人數（集保）、資產規模（已發行單位 × 淨值，取自 etf.json）。
  基本資料：上市日、發行投信、追蹤指數、類型（證交所 ETF 商品列表、基金基本資料彙總表）。

來源：
  配息（近 12 個月，官方）：證交所 TWT49U、櫃買 exDailyQ 除權除息計算結果表的「權值+息值」
  長期報酬：Yahoo 日線收盤（已調整分割）＋配息事件，自己串成含息報酬指數（不依賴 Yahoo 的 adjclose）
  受益人數：集保股權分散表 swing/data/tdcc（fetch_tdcc.py 已含 ETF）
  基本資料：https://www.twse.com.tw/rwd/zh/ETF/list、https://openapi.twse.com.tw/v1/opendata/t187ap47_L

輸出：web/data/etf_profile.json  {date, fields, rows: {代號: [...]}}

用法：python scripts/build_etf_profile.py [--limit 30]
"""

import argparse
import glob
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
REPO = os.path.dirname(ROOT)
WEB = os.path.join(ROOT, "web", "data")
OUT = os.path.join(WEB, "etf_profile.json")
TDCC = os.path.join(REPO, "swing", "data", "tdcc")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
S = requests.Session()
S.headers.update(UA)
TW = timezone(timedelta(hours=8))


def num(v):
    try:
        x = float(str(v).replace(",", "").strip())
        return x if x == x else None
    except (TypeError, ValueError):
        return None


def roc_iso(s):
    m = re.match(r"\s*(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})", str(s))
    if not m:
        return None
    y = int(m.group(1))
    return f"{y + 1911 if y < 1911 else y}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def get_json(url, tries=3):
    for k in range(tries):
        try:
            r = S.get(url, timeout=40)
            time.sleep(1.5)
            return r.json()
        except Exception as e:                       # noqa: BLE001
            print(f"  ! {url[:90]} 第 {k + 1} 次失敗：{e!r}", file=sys.stderr)
            time.sleep(3 * (k + 1))
    return None


def clean(x):
    return re.sub(r"<[^>]+>", "", str(x)).strip()


# ── 官方配息（近 12 個月） ────────────────────────────────────────────
def official_divs(today):
    """{代號: [(除息日, 每單位配息), ...]}，近 13 個月。"""
    out = {}
    start = today - timedelta(days=395)
    a = start
    while a <= today:
        b = min(a + timedelta(days=92), today)
        j = get_json(f"https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate={a:%Y%m%d}&endDate={b:%Y%m%d}&response=json")
        f = (j or {}).get("fields") or []
        if "股票代號" in f and "權值+息值" in f:
            for r in j.get("data") or []:
                code = clean(r[f.index("股票代號")])
                if code.startswith("00"):
                    v = num(r[f.index("權值+息值")])
                    if v:
                        out.setdefault(code, []).append((roc_iso(r[f.index("資料日期")]), v))
        j = get_json(f"https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate={a:%Y/%m/%d}&endDate={b:%Y/%m/%d}&response=json")
        for t in (j or {}).get("tables", []):
            f = [clean(x) for x in (t.get("fields") or [])]
            vi = next((i for i, x in enumerate(f) if "權值" in x and "息值" in x), None)
            if "代號" in f and vi is not None:
                for r in t.get("data") or []:
                    code = clean(r[f.index("代號")])
                    v = num(r[vi])
                    if code.startswith("00") and v:
                        out.setdefault(code, []).append((roc_iso(r[f.index("除權息日期")]), v))
        a = b + timedelta(days=1)
    return {c: sorted(set(v)) for c, v in out.items()}


# ── Yahoo 長期日線＋配息 ─────────────────────────────────────────────
def yahoo(code, suffix):
    r = S.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{code}{suffix}",
              params={"period1": 0, "period2": int(time.time()), "interval": "1d",
                      "events": "div,split"}, timeout=30)
    time.sleep(0.4)
    if r.status_code != 200:
        return None
    res = (r.json().get("chart") or {}).get("result")
    if not res:
        return None
    res = res[0]
    off = res["meta"].get("gmtoffset", 0)
    day = lambda t: datetime.fromtimestamp(t + off, tz=timezone.utc).date().isoformat()  # noqa: E731
    closes = res["indicators"]["quote"][0].get("close") or []
    rows = [(day(t), c) for t, c in zip(res.get("timestamp") or [], closes) if c]
    divs = {}
    for v in ((res.get("events") or {}).get("dividends") or {}).values():
        divs[day(v["date"])] = divs.get(day(v["date"]), 0) + v["amount"]
    return rows, divs


def tr_series(rows, divs):
    """含息報酬指數：除息日當天把配息加回去再算報酬（等同配息當天再投入）。單日 ±25% 以上視為資料錯，截斷。"""
    tr, px = [1.0], [1.0]
    dates = [rows[0][0]]
    for (d0, c0), (d1, c1) in zip(rows, rows[1:]):
        g = c1 / c0
        if abs(g - 1) > 0.25:                       # 未還原的分割或資料錯：從這裡重新開始
            tr, px, dates = [1.0], [1.0], [d1]
            continue
        dv = divs.get(d1, 0)
        tr.append(tr[-1] * (c1 + dv) / c0)
        px.append(px[-1] * g)
        dates.append(d1)
    return dates, tr, px


def ann(series, dates, years):
    if len(series) < 2:
        return None
    end = date.fromisoformat(dates[-1])
    start = end - timedelta(days=int(365.25 * years))
    if date.fromisoformat(dates[0]) > start + timedelta(days=10):
        return None
    i = next(k for k, d in enumerate(dates) if date.fromisoformat(d) >= start)
    return round(((series[-1] / series[i]) ** (1 / years) - 1) * 100, 2)


def since_ann(series, dates):
    yrs = (date.fromisoformat(dates[-1]) - date.fromisoformat(dates[0])).days / 365.25
    if yrs < 1:
        return None, round(yrs, 1)
    return round(((series[-1] / series[0]) ** (1 / yrs) - 1) * 100, 2), round(yrs, 1)


def risk(tr, dates):
    n = len(tr)
    r1 = [tr[k] / tr[k - 1] - 1 for k in range(max(1, n - 250), n)]
    vol = None
    if len(r1) > 100:
        m = sum(r1) / len(r1)
        vol = round(math.sqrt(sum((x - m) ** 2 for x in r1) / (len(r1) - 1)) * math.sqrt(250) * 100, 1)
    peak, mdd = 0.0, 0.0
    for x in tr[max(0, n - 750):]:
        peak = max(peak, x)
        mdd = min(mdd, x / peak - 1)
    return vol, round(mdd * 100, 1)


# ── 受益人數（集保，每週） ────────────────────────────────────────────
def holders():
    files = sorted(glob.glob(os.path.join(TDCC, "*.json")))
    if not files:
        return {}, None
    last = json.load(open(files[-1], encoding="utf-8"))
    prev = None
    d_last = date.fromisoformat(os.path.basename(files[-1])[:10])
    for p in reversed(files[:-1]):
        if (d_last - date.fromisoformat(os.path.basename(p)[:10])).days >= 27:
            prev = json.load(open(p, encoding="utf-8"))
            break
    out = {}
    for c, v in last.items():
        if not c.startswith("00"):
            continue
        h = v[3]
        ph = prev.get(c, [None] * 4)[3] if prev else None
        out[c] = [h, round((h / ph - 1) * 100, 1) if h and ph else None, v[2]]
    return out, d_last.isoformat()


def meta():
    out = {}
    j = get_json("https://www.twse.com.tw/rwd/zh/ETF/list?response=json")
    f = (j or {}).get("fields") or []
    if "證券代號" in f:
        for r in j.get("data") or []:
            out[clean(r[f.index("證券代號")])] = {"listed": clean(r[f.index("上市日期")]).replace(".", "-"),
                                                "issuer": re.sub(r"證券投資信託(股份)?有限公司|投信", "", clean(r[f.index("發行人")])),
                                                "index": clean(r[f.index("標的指數")])}
    j = get_json("https://openapi.twse.com.tw/v1/opendata/t187ap47_L")
    for x in j or []:
        c = (x.get("基金代號") or "").strip()
        if not c:
            continue
        m = out.setdefault(c, {})
        m["type"] = x.get("基金類型")
        if x.get("成立日期"):
            m["inception"] = roc_iso(x["成立日期"][:-4] + "/" + x["成立日期"][-4:-2] + "/" + x["成立日期"][-2:])
        if not m.get("index") and x.get("標的指數/追蹤指數名稱") not in (None, "", "不適用"):
            m["index"] = x["標的指數/追蹤指數名稱"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只算前 N 檔（除錯用）")
    args = ap.parse_args()
    today = datetime.now(TW).date()
    etf = json.load(open(os.path.join(WEB, "etf.json"), encoding="utf-8"))
    mkt = {}
    try:
        for r in json.load(open(os.path.join(WEB, "tw_all.json"), encoding="utf-8"))["rows"]:
            mkt[r[0]] = r[3]
    except FileNotFoundError:
        pass
    etfs = etf["etfs"][: args.limit or None]
    divs = official_divs(today)
    hold, hold_date = holders()
    info = meta()
    print(f"官方配息：{len(divs)} 檔；集保受益人數：{len(hold)} 檔（{hold_date}）；基本資料：{len(info)} 檔")

    fields = ["tr1", "tr3", "tr5", "tr10", "px3", "px5", "px10", "tr_since", "px_since", "years", "since",
              "ttm_div", "yield", "n_div", "vol", "mdd3", "holders", "holders_chg", "retail",
              "listed", "issuer", "index", "type"]
    rows, fail = {}, []
    for e in etfs:
        c = e["code"]
        suffix = ".TWO" if mkt.get(c) == "上櫃" else ".TW"
        try:
            y = yahoo(c, suffix) or yahoo(c, ".TWO" if suffix == ".TW" else ".TW")
        except Exception as ex:                      # noqa: BLE001
            y = None
            print(f"  ! {c} Yahoo 失敗：{ex!r}", file=sys.stderr)
        rec = dict.fromkeys(fields)
        if y and len(y[0]) > 20:
            dates, tr, px = tr_series(*y)
            rec.update(tr1=ann(tr, dates, 1), tr3=ann(tr, dates, 3), tr5=ann(tr, dates, 5), tr10=ann(tr, dates, 10),
                       px3=ann(px, dates, 3), px5=ann(px, dates, 5), px10=ann(px, dates, 10))
            rec["tr_since"], rec["years"] = since_ann(tr, dates)
            rec["px_since"], _ = since_ann(px, dates)
            rec["since"] = dates[0]           # 可用資料起點（上市日，或資料錯誤截斷後的起點）
            rec["vol"], rec["mdd3"] = risk(tr, dates)
        else:
            fail.append(c)
        dv = [v for d, v in divs.get(c, []) if d and d > (today - timedelta(days=365)).isoformat()]
        if dv:
            rec["ttm_div"] = round(sum(dv), 4)
            rec["n_div"] = len(dv)
            if e.get("price"):
                rec["yield"] = round(sum(dv) / e["price"] * 100, 2)
        elif y:
            rec["n_div"] = 0
            rec["yield"] = 0.0
        h = hold.get(c)
        if h:
            rec["holders"], rec["holders_chg"], rec["retail"] = h
        rec.update({k: v for k, v in (info.get(c) or {}).items() if k in fields})
        rows[c] = [rec[k] for k in fields]
    if len(fail) > len(etfs) * 0.5:
        sys.exit(f"Yahoo 有 {len(fail)}/{len(etfs)} 檔抓不到，保留舊檔")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(TW).isoformat(timespec="seconds"), "date": etf["date"],
                   "holders_date": hold_date, "fields": fields, "rows": rows}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ETF 體質表 {len(rows)} 檔（Yahoo 抓不到 {len(fail)} 檔：{fail[:10]}）")
    for c in ("0050", "0056", "00878", "00919", "00929", "00679B"):
        if c in rows:
            r = dict(zip(fields, rows[c]))
            print(f"  {c}：含息年化 1/3/5/10 年 {r['tr1']}/{r['tr3']}/{r['tr5']}/{r['tr10']}%；股價年化 3/5/10 年 "
                  f"{r['px3']}/{r['px5']}/{r['px10']}%；自 {r['since']} 起 {r['years']} 年 含息 {r['tr_since']}% 股價 {r['px_since']}%；"
                  f"近 12 月配息 {r['ttm_div']}（{r['n_div']} 次）殖利率 {r['yield']}%；波動 {r['vol']}% 三年回撤 {r['mdd3']}%；"
                  f"受益人 {r['holders']}（{r['holders_chg']}%）；{r['issuer']}／{r['index']}")


if __name__ == "__main__":
    main()
