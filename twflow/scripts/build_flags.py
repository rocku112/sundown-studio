#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每檔股票的「風險與籌碼旗標」，產出 twflow/web/data/flags.json：
  {"generated_at":…, "asof": {來源: 日期}, "codes": {代號: {
      "pg": [董監設質比例%, 資料年月],                ← 董監事持股餘額明細（上市、上櫃、興櫃）
      "pn": [處置期間, 處置措施／原因],               ← 正在處置中（處置期間尚未結束）
      "pw": 說明,                                     ← 注意累計次數可能達處置標準
      "nt": [近 30 天被列注意股的天數, 最近一次日期, 最近一次原因],
      "sb": [借券賣出餘額（張）, 5 個交易日前（張）, 日期], ← 證交所 TWT93U（上市）或櫃買中心（上櫃）
      "bb": [[欄位, 值], …]                           ← 近 120 天董事會決議的庫藏股買回
  }}}

資料全部來自 swing/scripts/fetch_extra.py 每天存的官方快照與歷史。這裡只整理「現況」，
旗標本身不代表好壞；有沒有預測力看研究頁「新資料檢驗」（swing/scripts/extra_lab.py）。
用法：python twflow/scripts/build_flags.py
"""

import glob
import gzip
import json
import os
import re
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
TW = os.path.dirname(HERE)
REPO = os.path.dirname(TW)
EXTRA = os.path.join(REPO, "swing", "data", "extra")
OUT = os.path.join(TW, "web", "data", "flags.json")
TZ = timezone(timedelta(hours=8))
CODE_RE = re.compile(r"^\d{4,6}[A-Z]?$")


def load(path):
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def snaps(name, days=None):
    """[(日期, 列)]，由舊到新；days＝只取最近幾天。"""
    ps = sorted(glob.glob(os.path.join(EXTRA, name, "*.json.gz")))
    if days:
        cut = (date.today() - timedelta(days=days)).isoformat()
        ps = [p for p in ps if os.path.basename(p)[:10] >= cut]
    return [(os.path.basename(p)[:10], load(p)) for p in ps]


def pick(row, *names):
    for n in names:
        for k, v in row.items():
            if n in k and v not in (None, ""):
                return str(v).strip()
    return ""


def code_of(row):
    c = pick(row, "公司代號", "SecuritiesCompanyCode", "證券代號", "股票代號", "Code")
    return c if CODE_RE.match(c) else ""


def num(s):
    try:
        return float(str(s).replace(",", "").strip())
    except ValueError:
        return None


def roc(s):
    """'115/10/07'、'1151007'、'2026-10-07' → '2026-10-07'；認不得回傳 ''。"""
    s = str(s).strip()
    m = re.search(r"(\d{2,4})[/\-.年]?(\d{2})[/\-.月]?(\d{2})", s)
    if not m:
        return ""
    y = int(m.group(1))
    y = y + 1911 if y < 1000 else y
    return f"{y}-{m.group(2)}-{m.group(3)}"


def pledge(out, asof):
    s = snaps("pledge")
    if not s:
        return
    d, rows = s[-1]
    agg = {}
    for r in rows:
        c = code_of(r)
        if not c:
            continue
        held, pl = num(pick(r, "目前持股")), num(pick(r, "設質股數"))
        ym = pick(r, "資料年月")
        a = agg.setdefault(c, [0.0, 0.0, ym])
        a[0] += held or 0
        a[1] += pl or 0
    for c, (h, p, ym) in agg.items():
        if h > 0:
            out.setdefault(c, {})["pg"] = [round(p / h * 100, 1), ym]
    asof["pledge"] = d


def punish(out, asof):
    s = snaps("punish")
    if not s:
        return
    d, rows = s[-1]
    today = date.today().isoformat()
    for r in rows:
        c = code_of(r)
        if not c:
            continue
        if "notetrans" in r.get("_src", ""):
            out.setdefault(c, {})["pw"] = pick(r, "RecentlyMetAttentionSecuritiesCriteria", "Criteria")[:80] or "注意累計次數可能達處置標準"
            continue
        per = pick(r, "DispositionPeriod", "處置起訖", "處置起迄", "處置期間")
        ends = re.split(r"[~～至]", per)
        end = roc(ends[-1]) if len(ends) > 1 else ""
        if end and end < today:
            continue
        meas = pick(r, "DispositionMeasures", "處置措施", "處置內容", "DisposalCondition", "DispositionReasons", "ReasonsOfDisposition", "處置原因")
        out.setdefault(c, {})["pn"] = [per[:40], meas[:80]]
    asof["punish"] = d


def notice(out, asof):
    cut = (date.today() - timedelta(days=30)).isoformat()
    seen = {}
    for d, rows in snaps("notice", days=31):
        for r in rows:
            c = code_of(r)
            if not c:
                continue
            dd = roc(pick(r, "Date", "日期", "公告日期")) or d
            why = pick(r, "TradingInfoForAttention", "TradingInformation", "注意交易資訊", "AccumulationSituation")
            seen.setdefault(c, {})[dd] = why
    for p in sorted(glob.glob(os.path.join(EXTRA, "notice_hist", "*.json.gz")))[-2:]:
        for ym, blk in load(p).items():
            f = blk.get("fields") or []
            ci = next((i for i, x in enumerate(f) if "代號" in x), None)
            di = next((i for i, x in enumerate(f) if "日期" in x), None)
            wi = next((i for i, x in enumerate(f) if "注意交易資訊" in x), None)
            if ci is None or di is None:
                continue
            for r in blk.get("data") or []:
                c, dd = str(r[ci]).strip(), roc(r[di])
                if CODE_RE.match(c) and dd:
                    seen.setdefault(c, {}).setdefault(dd, str(r[wi]) if wi is not None else "")
    for c, m in seen.items():
        ds = sorted(x for x in m if x >= cut)
        if ds:
            out.setdefault(c, {})["nt"] = [len(ds), ds[-1], re.sub(r"<[^>]+>", "", m[ds[-1]])[:80]]
    asof["notice"] = max((max(m) for m in seen.values()), default=None)


def sbl(out, asof):
    hist = {}
    for p in sorted(glob.glob(os.path.join(EXTRA, "sbl_hist", "*.json.gz")))[-2:]:
        hist.update({k: v for k, v in load(p).items() if v})
    days = sorted(hist)
    if days:
        last, prev = days[-1], days[-6] if len(days) >= 6 else days[0]
        for c, v in hist[last].items():
            bal = v[3] if len(v) > 3 else None
            if bal is None:
                continue
            pv = (hist[prev].get(c) or [None] * 4)[3]
            out.setdefault(c, {})["sb"] = [round(bal / 1000), None if pv is None else round(pv / 1000), last]
        asof["sbl"] = last
    s = snaps("sbl")                       # 上櫃：櫃買中心融券借券餘額（只有最新一天，5 天前用舊快照）
    if s:
        def tpex_bal(rows):
            m = {}
            for r in rows:
                if "tpex_margin_sbl" not in r.get("_src", ""):
                    continue
                c = code_of(r)
                b = num(pick(r, "SecuritiesBorrowingBalanceOfTheMarketDay", "SecuritiesBorrowingBalance", "借券賣出餘額"))
                if c and b is not None:
                    m[c] = b
            return m
        cur = tpex_bal(s[-1][1])
        old = tpex_bal(s[-6][1]) if len(s) >= 6 else {}
        for c, b in cur.items():
            if "sb" not in out.get(c, {}):
                o = old.get(c)
                out.setdefault(c, {})["sb"] = [round(b / 1000), None if o is None else round(o / 1000), s[-1][0]]
        asof.setdefault("sbl", s[-1][0])


def bb_head(head, n):
    """公開資訊觀測站庫藏股表有兩層表頭：「買回價格區間」「預定買回期間」各再分成兩欄。
    資料列比表頭多 2 欄時展開，讓欄位對齊；表頭去掉空白與括號說明。"""
    clean = [re.sub(r"\s+|\(.*?\)", "", h) for h in head]
    if n != len(head) + 2:
        return clean
    out = []
    for h in clean:
        if "價格區間" in h:
            out += ["買回價格最低", "買回價格最高"]
        elif "預定買回期間" in h:
            out += ["預定買回期間起", "預定買回期間迄"]
        else:
            out.append(h)
    return out


BB_KEEP = ("決議日期", "買回目的", "預定買回股數", "買回價格最低", "買回價格最高", "預定買回期間起", "預定買回期間迄", "是否執行完畢")


def buyback(out, asof):
    cut = (date.today() - timedelta(days=120)).isoformat()
    latest = None
    for p in sorted(glob.glob(os.path.join(EXTRA, "buyback_hist", "*.json.gz")))[-2:]:
        for ym, blk in sorted(load(p).items()):
            head0 = blk.get("head") or []
            for r in blk.get("rows") or []:
                row = r[1:]                              # 第一欄是 sii／otc
                head = bb_head(head0, len(row))
                ci = next((i for i, h in enumerate(head) if "代號" in h), None)
                di = next((i for i, h in enumerate(head) if "決議日期" in h), None)
                if ci is None or ci >= len(row):
                    continue
                c = row[ci].strip()
                d = roc(row[di]) if di is not None and di < len(row) else ym + "-01"
                if not CODE_RE.match(c) or (d and d < cut):
                    continue
                pairs = [[k, row[i]] for k in BB_KEEP for i, h in enumerate(head) if h.endswith(k) and i < len(row) and row[i]]
                prev = out.get(c, {}).get("_bbd")
                if prev is None or d >= prev:
                    out.setdefault(c, {})["bb"] = pairs
                    out[c]["_bbd"] = d
                latest = max(latest or d, d)
    for v in out.values():
        v.pop("_bbd", None)
    asof["buyback"] = latest


def main():
    out, asof = {}, {}
    for fn in (pledge, punish, notice, sbl, buyback):
        try:
            fn(out, asof)
        except Exception as e:                  # noqa: BLE001
            print(f"  ⚠️ {fn.__name__}：{e!r}")
    cnt = {k: sum(1 for v in out.values() if k in v) for k in ("pg", "pn", "pw", "nt", "sb", "bb")}
    print(f"旗標：{len(out)} 檔；各項檔數 {cnt}；資料日期 {asof}")
    for c in ("2330", "2317"):
        print(f"  例 {c} → {out.get(c)}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(TZ).isoformat(timespec="seconds"), "asof": asof, "codes": out},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
