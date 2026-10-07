#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新增的公開資料來源（全部是官方、免費、可公開取得）：

  一、官方開放 API（證交所 openapi.twse.com.tw、櫃買中心 www.tpex.org.tw/openapi）
      依關鍵字從官方 swagger 目錄找端點，不寫死網址（官方偶爾改路徑）：
        news     每日重大訊息（上市、上櫃）
        buyback  庫藏股買回
        pledge   董監事持股、質押
        punish   處置股
        notice   注意股
        sbl      借券賣出／借券餘額
      這些端點多半只給「最新一天」，所以每天存一份快照（swing/data/extra/<名稱>/<日期>.json.gz），歷史從今天開始累積。

  二、有歷史查詢的官方網頁 API（可回補）
        sbl_hist   證交所 TWT93U 每日借券賣出餘額（逐日回補，受時間預算限制）
        punish_hist／notice_hist  證交所公告的處置股、注意股（可用日期區間查詢）

  三、總經：國發會景氣指標及燈號（政府資料開放平臺 dataset 6099，透過平臺 API 取得下載網址）

用法：python swing/scripts/fetch_extra.py [--budget 分鐘] [--hist-days 天數]
抓不到的來源只警告、不讓整條管線失敗；每次都印出找到的端點與欄位，方便確認來源還能用。
"""

import argparse
import csv
import gzip
import io
import json
import os
import re
import time
import zipfile
from datetime import date, datetime, timedelta, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "extra")
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
TW = timezone(timedelta(hours=8))

OPENAPI = {
    "twse": ("https://openapi.twse.com.tw/v1/swagger.json", "https://openapi.twse.com.tw/v1"),
    "tpex": ("https://www.tpex.org.tw/openapi/swagger.json", "https://www.tpex.org.tw/openapi/v1"),
}
# 名稱 → 端點摘要須包含的關鍵字（任一）；排除字避免抓到不相干的
WANT = {
    "news": (["重大訊息"], ["英文", "外國", "違反"]),
    "buyback": (["庫藏股", "買回本公司股份", "買回自己股份"], []),
    "pledge": (["質押", "董監事持股"], []),
    "punish": (["處置"], []),
    "notice": (["注意"], ["處置"]),
    "sbl": (["借券"], []),
}


def get(url, **kw):
    for i in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=30, **kw)
            if r.status_code == 200:
                return r
            err = f"HTTP {r.status_code}"
        except Exception as e:                  # noqa: BLE001
            err = repr(e)[:120]
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def save_gz(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as f:
        return json.load(f)


BASE = {k: v[1] for k, v in OPENAPI.items()}


def discover():
    """從官方 swagger 依關鍵字找端點：{name: [(market, path, summary)]}"""
    found = {k: [] for k in WANT}
    for mkt, (sw, _) in OPENAPI.items():
        try:
            spec = get(sw).json()
        except Exception as e:                  # noqa: BLE001
            print(f"  ⚠️ {mkt} swagger 讀取失敗：{e}")
            continue
        # 端點的根網址以 swagger 自己宣告的為準（servers 或 host+basePath），沒有才用預設
        srv = [x.get("url") for x in spec.get("servers") or [] if x.get("url", "").startswith("http")]
        if srv:
            BASE[mkt] = srv[0].rstrip("/")
        elif spec.get("host"):
            BASE[mkt] = f"https://{spec['host']}{spec.get('basePath') or ''}".rstrip("/")
        print(f"  {mkt} 根網址：{BASE[mkt]}")
        for path, ops in spec.get("paths", {}).items():
            op = ops.get("get") or {}
            text = (op.get("summary") or "") + (op.get("description") or "") + " ".join(op.get("tags") or [])
            for k, (inc, exc) in WANT.items():
                if any(w in text for w in inc) and not any(w in text for w in exc):
                    found[k].append((mkt, path, (op.get("summary") or "")[:40]))
        print(f"  {mkt} swagger：{len(spec.get('paths', {}))} 個端點")
    return found


def snapshot(found, today):
    """每個找到的端點存一份今天的快照；回傳 {name: 筆數}。"""
    stat = {}
    for k, eps in found.items():
        rows_all = []
        for mkt, path, summ in eps:
            url = BASE[mkt] + path
            r = None
            try:
                r = get(url)
                rows = r.json()
            except Exception as e:              # noqa: BLE001
                head = r.text[:80].replace("\n", " ") if r is not None else ""
                print(f"  ⚠️ {k} {url} 失敗：{e}；回應開頭 {head!r}")
                continue
            if not isinstance(rows, list):
                continue
            for r in rows:
                if isinstance(r, dict):
                    r["_src"] = f"{mkt}{path}"
            rows_all += rows
            print(f"  {k:<8} {mkt}{path}（{summ}）→ {len(rows)} 筆；欄位 {list(rows[0])[:10] if rows else []}")
        if rows_all:
            save_gz(os.path.join(OUT, k, f"{today}.json.gz"), rows_all)
        stat[k] = len(rows_all)
    return stat


def sbl_history(days, budget_s, t0):
    """證交所 TWT93U：每日借券賣出餘額。存 sbl_hist/YYYY-MM.json.gz：{date: {code: [前日餘額, 賣出, 還券, 當日餘額, 次日可借券賣出限額]}}"""
    d = date.today()
    done, miss = 0, 0
    for _ in range(days):
        d -= timedelta(days=1)
        if d.weekday() >= 5:
            continue
        if time.time() - t0 > budget_s:
            print("  借券歷史：時間預算用完，下次接著補")
            break
        ym = d.strftime("%Y-%m")
        path = os.path.join(OUT, "sbl_hist", f"{ym}.json.gz")
        cur = load_json(path, {})
        key = d.isoformat()
        if key in cur:
            continue
        try:
            j = get("https://www.twse.com.tw/rwd/zh/marginTrading/TWT93U",
                    params={"date": d.strftime("%Y%m%d"), "response": "json"}).json()
        except Exception as e:                  # noqa: BLE001
            print(f"  ⚠️ TWT93U {key}：{e}")
            miss += 1
            if miss >= 5:
                break
            continue
        if j.get("stat") != "OK" or not j.get("data"):
            cur[key] = {}                      # 休市日：記空的，下次不重抓
            save_gz(path, cur)
            continue
        f = j.get("fields") or []
        # 欄位重複出現（融券區、借券區各一組）；借券區在後半段
        def col(name, last=True):
            ix = [i for i, x in enumerate(f) if name in x]
            return (ix[-1] if last else ix[0]) if ix else None
        ci = [col("前日餘額"), col("當日賣出") or col("賣出"), col("當日還券") or col("還券"), col("當日餘額"), col("限額")]
        rows = {}
        for r in j["data"]:
            code = str(r[0]).strip()
            if not code:
                continue
            def n(i):
                if i is None or i >= len(r):
                    return None
                try:
                    return float(str(r[i]).replace(",", ""))
                except ValueError:
                    return None
            rows[code] = [n(i) for i in ci]
        cur[key] = rows
        save_gz(path, cur)
        done += 1
        if done == 1:
            print(f"  借券歷史 {key}：{len(rows)} 檔，欄位 {f}，例 2330 → {rows.get('2330')}")
        time.sleep(1.2)
    print(f"  借券歷史：本次補 {done} 天")


def announce_history(kind, years, budget_s, t0):
    """證交所公告的處置股（punish）、注意股（notice），以月為單位查詢。存 <kind>_hist/YYYY.json.gz：{YYYY-MM: [列...]}"""
    url = f"https://www.twse.com.tw/rwd/zh/announcement/{kind}"
    m0 = date.today().replace(day=1)
    done = 0
    for k in range(years * 12):
        if time.time() - t0 > budget_s:
            print(f"  {kind} 歷史：時間預算用完")
            break
        y, m = m0.year, m0.month - k
        while m <= 0:
            y, m = y - 1, m + 12
        start = date(y, m, 1)
        end = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))
        path = os.path.join(OUT, f"{kind}_hist", f"{y}.json.gz")
        cur = load_json(path, {})
        key = start.strftime("%Y-%m")
        if key in cur and k > 0:               # 本月每次重抓
            continue
        try:
            j = get(url, params={"startDate": start.strftime("%Y%m%d"), "endDate": end.strftime("%Y%m%d"), "response": "json"}).json()
        except Exception as e:                  # noqa: BLE001
            print(f"  ⚠️ {kind} {key}：{e}")
            break
        cur[key] = {"fields": j.get("fields"), "data": j.get("data") or []}
        save_gz(path, cur)
        if done == 0:
            print(f"  {kind} 歷史 {key}：{len(j.get('data') or [])} 筆，欄位 {j.get('fields')}")
        done += 1
        time.sleep(1.2)
    print(f"  {kind} 歷史：本次補 {done} 個月")


def ndc_cycle():
    """國發會景氣指標及燈號：透過政府資料開放平臺 API 取得下載網址（不寫死檔名）。"""
    try:
        meta = get("https://data.gov.tw/api/v2/rest/dataset/6099").json()
    except Exception as e:                      # noqa: BLE001
        print(f"  ⚠️ 景氣燈號：資料集資訊讀取失敗：{e}")
        return
    res = (meta.get("result") or {}).get("distribution") or []
    urls = [(x.get("resourceFormat") or "", x.get("resourceDownloadUrl") or "", x.get("resourceDescription") or "") for x in res]
    print(f"  景氣燈號資料集：{len(urls)} 個檔案 {[(f, d[:20]) for f, _, d in urls]}")
    for fmt, u, desc in urls:
        if not u:
            continue
        try:
            r = get(u)
        except Exception as e:                  # noqa: BLE001
            print(f"  ⚠️ {u}：{e}")
            continue
        name = os.path.basename(u.split("?")[0]) or "ndc"
        os.makedirs(os.path.join(OUT, "ndc"), exist_ok=True)
        with open(os.path.join(OUT, "ndc", name), "wb") as f:
            f.write(r.content)
        head = r.content[:300]
        try:
            head = head.decode("utf-8-sig")
        except UnicodeDecodeError:
            head = r.content[:300].decode("cp950", "replace")
        print(f"  景氣燈號 {name}（{fmt}，{len(r.content)} bytes）開頭：{head[:160]!r}")


def ndc_parse():
    """解開國發會 ZIP，找出含「景氣對策信號」的 CSV，存 ndc/signal.json：{YYYY-MM: [燈號分數, 燈號文字]}。
    欄位名稱不寫死：找含「信號」或「燈號」的欄位與日期欄位；每次印出檔名與表頭方便確認。"""
    d = os.path.join(OUT, "ndc")
    if not os.path.isdir(d):
        return
    out = {}
    for fn in sorted(os.listdir(d)):
        p = os.path.join(d, fn)
        if not zipfile.is_zipfile(p):
            continue
        with zipfile.ZipFile(p) as z:
            for name in z.namelist():
                if not name.lower().endswith(".csv"):
                    continue
                raw = z.read(name)
                for enc in ("utf-8-sig", "cp950", "big5"):
                    try:
                        text = raw.decode(enc)
                        break
                    except UnicodeDecodeError:
                        continue
                rows = list(csv.reader(io.StringIO(text)))
                if not rows:
                    continue
                head = [h.strip() for h in rows[0]]
                print(f"  景氣 ZIP {name}：{len(rows) - 1} 列，表頭 {head[:12]}")
                si = next((i for i, h in enumerate(head) if "信號" in h and "分" in h), None)
                si = si if si is not None else next((i for i, h in enumerate(head) if "信號" in h or "燈號" in h), None)
                di = next((i for i, h in enumerate(head) if re.search(r"Date|日期|年月|時間", h, re.I)), 0)
                if si is None:
                    # 也可能是「長表」：一欄是指標名稱、一欄是數值
                    ni = next((i for i, h in enumerate(head) if "指標" in h or "項目" in h or "Item" in h), None)
                    vi = next((i for i, h in enumerate(head) if "值" in h or "Value" in h), None)
                    if ni is None or vi is None:
                        continue
                    for r in rows[1:]:
                        if len(r) > max(ni, vi, di) and "信號" in r[ni] and "分" in r[ni]:
                            ym = ndc_month(r[di])
                            if ym:
                                out[ym] = num_or_none(r[vi])
                    continue
                for r in rows[1:]:
                    if len(r) <= max(si, di):
                        continue
                    ym = ndc_month(r[di])
                    if ym:
                        out[ym] = num_or_none(r[si])
    out = {k: v for k, v in sorted(out.items()) if v is not None}
    if out:
        with open(os.path.join(d, "signal.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        ks = list(out)
        print(f"  景氣對策信號：{len(out)} 個月（{ks[0]}～{ks[-1]}），最近 {[(k, out[k]) for k in ks[-3:]]}")
    else:
        print("  ⚠️ 景氣 ZIP 裡沒找到景氣對策信號欄位")


def ndc_month(s):
    s = str(s).strip()
    m = re.match(r"^(\d{4})[-/]?(\d{1,2})", s)
    if m and 1950 < int(m.group(1)) < 2100 and 1 <= int(m.group(2)) <= 12:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    m = re.match(r"^(\d{2,3})[-/年](\d{1,2})", s)          # 民國
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{int(m.group(1)) + 1911}-{int(m.group(2)):02d}"
    return None


def num_or_none(s):
    try:
        return float(str(s).replace(",", "").strip())
    except ValueError:
        return None


MOPS_HOSTS = ["https://mopsov.twse.com.tw/mops/web/", "https://mops.twse.com.tw/mops/web/"]


def html_tables(html):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    out = []
    for tb in soup.find_all("table"):
        trs = tb.find_all("tr")
        rows = [[c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])] for tr in trs]
        rows = [r for r in rows if r]
        if len(rows) >= 2:
            out.append(rows)
    return out


def buyback_history(years, budget_s, t0):
    """公開資訊觀測站「庫藏股買回」（t35sc09，依董事會決議日期區間查詢，上市＋上櫃）。
    存 buyback_hist/YYYY.json.gz：{YYYY-MM: {"head": 表頭, "rows": [...]}}；本月每次重抓。"""
    m0 = date.today().replace(day=1)
    done, fail = 0, 0
    for k in range(years * 12):
        if time.time() - t0 > budget_s:
            print("  庫藏股歷史：時間預算用完")
            break
        y, m = m0.year, m0.month - k
        while m <= 0:
            y, m = y - 1, m + 12
        start = date(y, m, 1)
        end = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
        path = os.path.join(OUT, "buyback_hist", f"{y}.json.gz")
        cur = load_json(path, {})
        key = start.strftime("%Y-%m")
        if key in cur and k > 0:
            continue
        got = {"head": None, "rows": []}
        for typek in ("sii", "otc"):
            data = {"encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1, "TYPEK": typek,
                    "d1": f"{y - 1911}{m:02d}01", "d2": f"{end.year - 1911}{end.month:02d}{end.day:02d}", "RD": 1}
            html = None
            for h in MOPS_HOSTS:
                try:
                    r = requests.post(h + "ajax_t35sc09", data=data, headers=UA, timeout=30)
                    if r.status_code == 200:
                        r.encoding = "utf-8"
                        html = r.text
                        break
                except Exception:               # noqa: BLE001
                    continue
            if html is None:
                continue
            tabs = [t for t in html_tables(html) if any("代號" in c for c in t[0])]
            if done == 0 and typek == "sii":
                txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))[:200]
                print(f"  庫藏股 {key} {typek}：{len(tabs)} 個表；回應開頭 {txt!r}")
                if tabs:
                    print(f"    表頭 {tabs[0][0]}，例 {tabs[0][1][:12]}")
            for t in tabs:
                got["head"] = got["head"] or t[0]
                got["rows"] += [[typek] + r for r in t[1:] if len(r) >= 3]
            time.sleep(1.5)
        if got["head"] is None:
            fail += 1
            if fail >= 3:
                print("  ⚠️ 庫藏股：連續 3 個月抓不到表格，停止（請看上面的回應開頭）")
                break
            continue
        cur[key] = got
        save_gz(path, cur)
        done += 1
    print(f"  庫藏股歷史：本次補 {done} 個月")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=float, default=10, help="分鐘")
    ap.add_argument("--hist-days", type=int, default=3650)
    args = ap.parse_args()
    t0 = time.time()
    budget = args.budget * 60
    today = datetime.now(TW).date().isoformat()
    print("官方開放 API 端點：")
    found = discover()
    for k, v in found.items():
        print(f"  {k}: {v[:6]}")
    stat = snapshot(found, today)
    print("快照：", stat)
    ndc_cycle()
    ndc_parse()
    buyback_history(10, max(90, budget * 0.15), time.time())   # 獨立預算：前面的快照可能已用掉不少時間
    # 歷史回補：處置／注意（每月一次請求，快）先做，再把剩下的預算給借券（每日一次請求）
    announce_history("punish", 10, budget * 0.3, t0)
    announce_history("notice", 10, budget * 0.5, t0)
    sbl_history(args.hist_days, budget, t0)


if __name__ == "__main__":
    main()
