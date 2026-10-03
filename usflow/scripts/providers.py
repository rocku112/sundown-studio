#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
美股日線來源。每個 provider 回傳同一種格式：

    [(date_str 'YYYY-MM-DD', close: float, volume: float|None), ...]  依日期遞增

為什麼要多個來源：美股沒有像證交所那樣免費、官方、穩定的日線端點。
Yahoo 與 Stooq 都是非官方用法，隨時可能改版或對 CI 機房 IP 限流。
fetch_us.py 依序嘗試，第一個成功的就用——任一來源掛掉，管線不會整個停。

⚠️ 兩個來源的「收盤價」定義相同（已還原分割、未還原除息），可以互相替補；
   若日後加第三個來源，務必確認不是「還原除息」的價格，否則替補當天會出現假跳空。
"""

import csv
import io
import time
from datetime import datetime, timedelta, timezone

import requests

UA = {"User-Agent": "Mozilla/5.0 (compatible; usflow-research/0.1; "
                    "+https://github.com/rocku112/sundown-studio)"}

_session = requests.Session()
_session.headers.update(UA)


class ProviderError(Exception):
    pass


def _get(url, params=None, retries=3, timeout=20):
    last = None
    for i in range(retries):
        try:
            r = _session.get(url, params=params, timeout=timeout)
            if r.status_code == 200:
                return r
            last = f"HTTP {r.status_code}"
            # 429/5xx 退避重試；404 之類的不用再試
            if r.status_code not in (429, 500, 502, 503, 504):
                break
        except requests.RequestException as e:
            last = repr(e)
        time.sleep(2 ** i)
    raise ProviderError(f"{url} → {last}")


def yahoo(sym, days=200, host="query1"):
    """Yahoo chart API v8。sym 用 Yahoo 代號（BRK-B、^GSPC、TWD=X）。"""
    rng = "1y" if days > 180 else "6mo"
    r = _get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{sym}",
             params={"range": rng, "interval": "1d", "includePrePost": "false"})
    try:
        res = r.json()["chart"]["result"][0]
        ts = res.get("timestamp") or []
        q = res["indicators"]["quote"][0]
        # 時間戳是開盤時刻（UTC）。用交易所時區換成交易日，否則亞洲時區跑會差一天
        off = res["meta"].get("gmtoffset", 0)
    except (KeyError, IndexError, TypeError, ValueError) as e:
        raise ProviderError(f"yahoo {sym} 格式不符：{e!r}")
    out = []
    for t, c, v in zip(ts, q.get("close", []), q.get("volume", [])):
        if c is None:
            continue
        d = datetime.fromtimestamp(t + off, tz=timezone.utc).date().isoformat()
        out.append((d, round(float(c), 4), float(v) if v is not None else None))
    if not out:
        raise ProviderError(f"yahoo {sym} 沒有資料")
    # 盤中跑的話最後一筆是未收盤的即時價；同日重複時保留最後一筆
    dedup = {}
    for row in out:
        dedup[row[0]] = row
    return sorted(dedup.values())


def stooq(code, days=200):
    """Stooq 日線 CSV。code 用 Stooq 代號（aapl.us、^spx、usdtwd）。"""
    d1 = (datetime.now(timezone.utc) - timedelta(days=int(days * 1.6))).strftime("%Y%m%d")
    r = _get("https://stooq.com/q/d/l/", params={"s": code, "i": "d", "d1": d1})
    text = r.text.strip()
    # 查無代號時回 "No data"；被限流時回 HTML
    if not text or not text.startswith("Date"):
        raise ProviderError(f"stooq {code} 非 CSV：{text[:60]!r}")
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            c = float(row["Close"])
        except (KeyError, ValueError):
            continue
        v = row.get("Volume")
        try:
            v = float(v) if v not in (None, "") else None
        except ValueError:
            v = None
        out.append((row["Date"], round(c, 4), v))
    if not out:
        raise ProviderError(f"stooq {code} 沒有資料")
    return out


def stooq_code(item):
    """universe 項目 → Stooq 代號；None 表示 Stooq 沒有這檔。"""
    if "stooq" in item:
        return item["stooq"]
    return item["sym"].lower() + ".us"


def _stooq_item(item, days):
    code = stooq_code(item)
    if not code:
        raise ProviderError("stooq 無此代號")
    return stooq(code, days)


# 2026-10 在 GitHub Actions 實測：Yahoo query1 141/141 成功；Stooq 對 CI 機房 IP
# 一律回 HTML（疑似要驗證碼或 API key），目前形同無效，先留著以防它恢復。
# query2 是 Yahoo 的另一組主機，限流是分開計的，query1 被擋時常常還能用。
PROVIDERS = [
    ("yahoo", lambda it, days: yahoo(it["sym"], days)),
    ("yahoo2", lambda it, days: yahoo(it["sym"], days, host="query2")),
    ("stooq", _stooq_item),
]


def fetch(item, days=200, order=None):
    """依序嘗試各來源。回傳 (provider_name, rows)；全失敗丟 ProviderError（附各來源原因）。"""
    errs = []
    for name, fn in PROVIDERS:
        if order and name not in order:
            continue
        try:
            return name, fn(item, days)
        except ProviderError as e:
            errs.append(f"{name}: {e}")
    raise ProviderError("；".join(errs))
