#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
擴充美股股票池：S&P 500＋那斯達克 100 成分股（維基百科成分股表），加上常見美國 ETF。

手動維護的代號（中文名稱、台美連動用的 ADR、指數）一律保留且優先；
自動加入的代號標 "auto": true，名稱用英文公司名，產業依 GICS 對應到既有 11 個板塊。
SEC 基本面只抓手動維護的代號（避免每週下載數百家公司的財報）。

來源失敗時不改動現有 universe.json（股票池寧可舊一點，也不要變空）。

用法：python usflow/scripts/build_universe.py
"""

import json
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UNIVERSE = os.path.join(ROOT, "data", "universe.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"}
PAGES = {
    "S&P 500": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    "Nasdaq-100": "https://en.wikipedia.org/wiki/Nasdaq-100",
}
GICS = {"Information Technology": "科技", "Communication Services": "通訊服務",
        "Consumer Discretionary": "非必需消費", "Consumer Staples": "必需消費",
        "Health Care": "醫療保健", "Financials": "金融", "Industrials": "工業", "Energy": "能源",
        "Materials": "原物料", "Utilities": "公用事業", "Real Estate": "房地產"}

# 常見美國 ETF（台灣投資人常買、或代表性高的）
ETFS = [
    ("VOO", "Vanguard 標普500"), ("IVV", "iShares 標普500"), ("VTI", "Vanguard 全美股市"),
    ("VT", "Vanguard 全世界股市"), ("VXUS", "Vanguard 美國以外股市"), ("VEA", "Vanguard 已開發市場"),
    ("VWO", "Vanguard 新興市場"), ("EFA", "iShares 歐澳遠東"), ("EEM", "iShares 新興市場"),
    ("IEMG", "iShares 核心新興市場"), ("QQQM", "Invesco 那斯達克100（小額）"), ("VGT", "Vanguard 資訊科技"),
    ("SCHD", "Schwab 美國股息"), ("VYM", "Vanguard 高股息"), ("VIG", "Vanguard 股息增長"),
    ("DGRO", "iShares 股息成長"), ("JEPI", "摩根 股票溢價收益"), ("JEPQ", "摩根 那斯達克溢價收益"),
    ("QYLD", "Global X 那斯達克備兌"), ("SPYD", "SPDR 標普500高股息"), ("NOBL", "ProShares 股息貴族"),
    ("BND", "Vanguard 美國總體債"), ("AGG", "iShares 美國核心債"), ("IEF", "iShares 7-10 年美債"),
    ("SHY", "iShares 1-3 年美債"), ("SGOV", "iShares 0-3 月美國國庫券"), ("BIL", "SPDR 1-3 月國庫券"),
    ("LQD", "iShares 投資級公司債"), ("HYG", "iShares 高收益債"), ("TIP", "iShares 抗通膨債"),
    ("VCIT", "Vanguard 中期公司債"), ("BNDX", "Vanguard 國際債"), ("EMB", "iShares 新興市場債"),
    ("IAU", "iShares 黃金"), ("SLV", "iShares 白銀"), ("USO", "美國石油基金"), ("DBC", "Invesco 原物料"),
    ("VNQ", "Vanguard 房地產"), ("IWF", "iShares 羅素1000成長"), ("IWD", "iShares 羅素1000價值"),
    ("VUG", "Vanguard 成長股"), ("VTV", "Vanguard 價值股"), ("MDY", "SPDR 標普中型400"),
    ("RSP", "Invesco 標普500等權"), ("MTUM", "iShares 動能因子"), ("QUAL", "iShares 品質因子"),
    ("USMV", "iShares 低波動"), ("ARKK", "ARK 創新"), ("XBI", "SPDR 生技"), ("IBB", "iShares 生技"),
    ("KRE", "SPDR 區域銀行"), ("ITA", "iShares 航太國防"), ("TAN", "Invesco 太陽能"),
    ("ICLN", "iShares 全球潔淨能源"), ("LIT", "Global X 鋰電池"), ("BOTZ", "Global X 機器人與 AI"),
    ("IGV", "iShares 軟體"), ("CIBR", "First Trust 網路安全"), ("SKYY", "First Trust 雲端"),
    ("FXI", "iShares 中國大型股"), ("KWEB", "KraneShares 中國網路"), ("MCHI", "iShares MSCI 中國"),
    ("EWJ", "iShares MSCI 日本"), ("INDA", "iShares MSCI 印度"), ("EWY", "iShares MSCI 南韓"),
    ("EWZ", "iShares MSCI 巴西"), ("VGK", "Vanguard 歐洲"), ("IBIT", "iShares 比特幣"),
    ("FBTC", "Fidelity 比特幣"), ("ETHA", "iShares 以太幣"), ("TQQQ", "ProShares 那斯達克三倍"),
    ("SQQQ", "ProShares 那斯達克反三倍"), ("UPRO", "ProShares 標普三倍"), ("SOXL", "Direxion 半導體三倍"),
    ("SOXS", "Direxion 半導體反三倍"), ("SPXL", "Direxion 標普三倍"), ("TMF", "Direxion 20 年美債三倍"),
    ("SH", "ProShares 標普反向"), ("UVXY", "ProShares 波動率 1.5 倍"),
]


def ysym(s):
    """BRK.B → BRK-B（Yahoo 的寫法）"""
    return s.strip().replace(".", "-")


def constituents(url):
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    out = []
    for tb in soup.find_all("table", class_="wikitable"):
        # 表頭可能帶註腳（如「Ticker[13]」），只比對開頭
        head = [re.sub(r"\[.*?\]", "", th.get_text(strip=True)) for th in tb.find("tr").find_all(["th", "td"])]
        si = next((i for i, h in enumerate(head) if h.startswith(("Symbol", "Ticker"))), None)
        ni = next((i for i, h in enumerate(head) if h.startswith(("Security", "Company"))), None)
        gi = next((i for i, h in enumerate(head) if "GICS" in h and "Sub" not in h), None)
        if si is None or ni is None:
            continue
        for tr in tb.find_all("tr")[1:]:
            td = [x.get_text(strip=True) for x in tr.find_all(["td", "th"])]
            if len(td) <= max(si, ni):
                continue
            sym = td[si]
            if not re.fullmatch(r"[A-Z][A-Z.\-]{0,6}", sym):
                continue
            out.append((ysym(sym), td[ni], GICS.get(td[gi]) if gi is not None and gi < len(td) else None))
        if len(out) > 90:
            break
    return out


def main():
    uni = json.load(open(UNIVERSE, encoding="utf-8"))
    manual = [s for s in uni["symbols"] if not s.get("auto")]
    have = {s["sym"] for s in manual}
    added, src = [], {}
    for label, url in PAGES.items():
        try:
            rows = constituents(url)
        except Exception as e:
            print(f"{label} 讀取失敗：{e!r}", file=sys.stderr)
            rows = []
        src[label] = len(rows)
        for sym, name, sec in rows:
            if sym in have:
                continue
            have.add(sym)
            added.append({"sym": sym, "name": name, "type": "stock", "sector": sec, "auto": True})
    if src.get("S&P 500", 0) < 400:
        sys.exit(f"S&P 500 成分股只讀到 {src.get('S&P 500', 0)} 檔，來源可能改版；保留原股票池")
    for sym, name in ETFS:
        if sym not in have:
            have.add(sym)
            added.append({"sym": sym, "name": name, "type": "etf", "auto": True})
    # 查不到 GICS 產業的個股 sector 為 None：照常追蹤與搜尋，只是不列入板塊頁
    uni["symbols"] = manual + added
    with open(UNIVERSE, "w", encoding="utf-8") as f:
        json.dump(uni, f, ensure_ascii=False, indent=1)
    print(f"股票池：手動 {len(manual)}＋自動 {len(added)}（來源 {src}）＝ {len(uni['symbols'])} 檔")


if __name__ == "__main__":
    main()
