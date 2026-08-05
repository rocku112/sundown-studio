#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
爬取「產業價值鏈資訊平台」(ic.tpex.org.tw) 全部產業鏈，建立台股板塊分類骨架。

資料來源：臺灣證券交易所／證券櫃檯買賣中心共同維護之公開平台。
個體公司面資料由各公司自行填報。

輸出：
  data/ic_chain.json        完整階層（產業鏈 → 上中下游 → 節點 → 子節點 → 公司）
  data/ic_leaves.json       攤平的葉節點清單（每個葉節點 = 一個候選板塊）
  data/ic_stock_index.json  個股 → 所屬葉節點（多重歸屬）

頁面結構（2026-08 實測）：
  <div id="main_ic_panel">
    <div class="chain">
      <div class="chain-title-panel">上游</div>
      <div id="ic_link_D100" class="company-chain-panel">IC設計</div>   ← 節點
  <div id="companyList_D100" title="IC設計">
    ├ .company-list      → 直接列公司
    └ .subchain-company-list
        ├ <div id="sc_link_D110">► LED驅動IC (12家)</div>              ← 子節點
        └ <table id="sc_company_D110"> ... </table>
公司連結：<a href="company_basic.php?stk_code=2308" title="台達電">
「知名外國企業」是外部 http 連結、無 stk_code，一律略過。
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

BASE = "https://ic.tpex.org.tw"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(ROOT, ".cache", "ic")

# 47 條產業鏈（值取自平台首頁 <select>；順序沿用平台自身排序）
CHAINS = [
    ("D000", "半導體"), ("C100", "製藥"), ("C200", "醫療器材"), ("C300", "食品生技"),
    ("C400", "再生醫療"), ("A300", "電動車輛產業"), ("A200", "LED照明產業"),
    ("A100", "太陽能產業"), ("AB10", "汽電共生"), ("AB20", "風力發電"),
    ("E000", "能源元件"), ("AD10", "智慧電網"), ("5100", "區塊鏈"), ("5200", "金融科技"),
    ("5300", "人工智慧"), ("5400", "雲端運算"), ("5500", "資通訊安全"), ("5600", "大數據"),
    ("5700", "體驗科技"), ("5800", "運動科技"), ("4100", "太空衛星科技"), ("6000", "自動化"),
    ("B000", "休閒娛樂"), ("L000", "印刷電路板"), ("R300", "電子商務"), ("J000", "被動元件"),
    ("I000", "通信網路"), ("K000", "連接器"), ("F000", "電腦及週邊設備"),
    ("G000", "平面顯示器"), ("H000", "觸控面板"), ("1000", "水泥"), ("M000", "食品"),
    ("N000", "石化及塑橡膠"), ("O000", "紡織"), ("P000", "電機機械"), ("2000", "造紙"),
    ("Q000", "鋼鐵"), ("3000", "汽車"), ("R000", "軟體服務"), ("S000", "建材營造"),
    ("T000", "交通運輸及航運"), ("U000", "金融"), ("V000", "貿易百貨"), ("W000", "油電燃氣"),
    ("Y000", "文化創意業"), ("X000", "其他"),
]

# 我們只要有股票代號的（本國/外國 上市・上櫃・興櫃），「知名外國企業」不列入
LISTING_RE = re.compile(r"(本國|外國)?\s*(上市|上櫃|興櫃)公司?\s*\((\d+)家\)")
SUBNODE_RE = re.compile(r"\s*►?\s*(.+?)\s*\((\d+)家\)\s*$")


def tw_now():
    return datetime.now(timezone(timedelta(hours=8)))


def fetch(ic_code, force=False):
    """抓一條產業鏈的頁面，落地快取（重跑不重抓，對來源站友善）。"""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{ic_code}.html")
    if os.path.exists(path) and not force:
        with open(path, encoding="utf-8") as f:
            return f.read()
    url = f"{BASE}/introduce.php?ic={ic_code}"
    r = requests.get(url, timeout=30, headers={
        "User-Agent": "Mozilla/5.0 (compatible; twflow-research/0.1)"
    })
    r.raise_for_status()
    r.encoding = "utf-8"
    with open(path, "w", encoding="utf-8") as f:
        f.write(r.text)
    time.sleep(0.8)  # 禮貌延遲
    return r.text


def parse_companies(container):
    """
    在容器內依「文件順序」走訪：遇到 <b>本國上市公司(N家)</b> 就換分類，
    遇到 company_basic.php 連結就歸到目前分類。

    為什麼不用表格結構解析：原站 HTML 有未閉合的 <tr>、rowspan='2.2' 這種
    非法值，任何依賴 tr/td 巢狀關係的解析都會在不同瀏覽器/parser 下拿到不同樹。
    文件順序是唯一穩定的東西。
    """
    out = []
    seen = set()
    current = None
    for el in container.find_all(["b", "a"]):
        if el.name == "b":
            m = LISTING_RE.search(el.get_text(strip=True))
            current = m.group(0).split("(")[0].strip() if m else None
            continue
        href = el.get("href") or ""
        if "company_basic.php" not in href:
            continue  # 知名外國企業＝外部連結，略過
        m = re.search(r"stk_code=(\w+)", href)
        if not m:
            continue
        code = m.group(1)
        if code in seen:
            continue
        seen.add(code)
        out.append({
            "code": code,
            "name": (el.get("title") or el.get_text(strip=True)).strip(),
            "listing": current,
        })
    return out


def parse_chain(ic_code, ic_name, html):
    soup = BeautifulSoup(html, "lxml")

    # 1) 節點 → 所屬段（上游／中游／下游）
    #
    # 兩種版型都要吃：
    #   ① 有供應鏈方向的（半導體、PCB…）→ ic_link 包在 div.chain 裡，該層有 .chain-title-panel
    #   ② 平行分類的（金融、軟體服務、其他…）→ ic_link 直接掛在 main_ic_panel 底下，沒有段標題
    # 所以不從 div.chain 往下找，改成「掃出所有 ic_link_*，再往上找它的段」——
    # 版型二只是找不到段而已，節點照樣收得到。原本先找 div.chain 的寫法，
    # 讓 7 條沒有上下游結構的產業鏈整條解析成空。
    node_segment = {}
    node_order = []
    panel = soup.find(id="main_ic_panel")
    if panel:
        for nd in panel.find_all("div", id=re.compile(r"^ic_link_")):
            code = nd.get("id")[len("ic_link_"):]
            if code in node_segment:
                continue
            seg = ""
            for anc in nd.parents:
                if anc is panel:
                    break
                cls = anc.get("class") or []
                if "chain" in cls:
                    title = anc.find("div", class_="chain-title-panel")
                    if title:
                        seg = title.get_text(strip=True)
                    break
            node_segment[code] = seg
            node_order.append(code)

    # 2) 每個節點的公司清單／子節點
    nodes = []
    for code in node_order:
        box = soup.find(id=f"companyList_{code}")
        if box is None:
            continue
        node_name = (box.get("title") or "").strip()
        node = {
            "code": code,
            "name": node_name,
            "segment": node_segment.get(code, ""),
            "subnodes": [],
            "companies": [],
        }

        sub_panel = box.find("div", class_="subchain-industry")
        if sub_panel is not None:
            for link in sub_panel.find_all("div", id=re.compile(r"^sc_link_")):
                sc = link.get("id")[len("sc_link_"):]
                raw = link.get_text(" ", strip=True).replace("►", "").strip()
                m = SUBNODE_RE.match(raw)
                sub_name = m.group(1).strip() if m else raw
                table = soup.find(id=f"sc_company_{sc}")
                comps = parse_companies(table) if table is not None else []
                node["subnodes"].append({
                    "code": sc, "name": sub_name, "companies": comps,
                })

        direct = box.find("div", class_="company-list")
        if direct is not None:
            node["companies"] = parse_companies(direct)

        nodes.append(node)

    return {"code": ic_code, "name": ic_name, "nodes": nodes}


def main():
    force = "--force" in sys.argv
    os.makedirs(DATA, exist_ok=True)

    chains = []
    for i, (code, name) in enumerate(CHAINS, 1):
        html = fetch(code, force=force)
        ch = parse_chain(code, name, html)
        n_nodes = len(ch["nodes"])
        n_sub = sum(len(n["subnodes"]) for n in ch["nodes"])
        n_co = sum(
            len(n["companies"]) + sum(len(s["companies"]) for s in n["subnodes"])
            for n in ch["nodes"]
        )
        print(f"[{i:2d}/{len(CHAINS)}] {code} {name:<12} 節點{n_nodes:3d} 子節點{n_sub:3d} 公司{n_co:5d}")
        chains.append(ch)

    doc = {
        "source": BASE,
        "source_name": "產業價值鏈資訊平台（臺灣證券交易所／證券櫃檯買賣中心）",
        "fetched_at": tw_now().isoformat(timespec="seconds"),
        "chains": chains,
    }
    with open(os.path.join(DATA, "ic_chain.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    # ── 攤平成葉節點（每個葉節點 = 一個候選板塊）──────────────────────────
    # 有子節點的，葉是子節點；沒有子節點的，葉就是節點本身。
    leaves = []
    for ch in chains:
        for nd in ch["nodes"]:
            if nd["subnodes"]:
                for sb in nd["subnodes"]:
                    leaves.append({
                        "id": f'{ch["code"]}/{sb["code"]}',
                        "chain": ch["name"],
                        "segment": nd["segment"],
                        "node": nd["name"],
                        "leaf": sb["name"],
                        "path": f'{ch["name"]}/{nd["segment"]}/{nd["name"]}/{sb["name"]}',
                        "stocks": [c["code"] for c in sb["companies"]],
                        "names": {c["code"]: c["name"] for c in sb["companies"]},
                    })
                # 節點自己若同時掛了公司，也留一個「其他」葉
                if nd["companies"]:
                    leaves.append({
                        "id": f'{ch["code"]}/{nd["code"]}',
                        "chain": ch["name"], "segment": nd["segment"],
                        "node": nd["name"], "leaf": nd["name"],
                        "path": f'{ch["name"]}/{nd["segment"]}/{nd["name"]}',
                        "stocks": [c["code"] for c in nd["companies"]],
                        "names": {c["code"]: c["name"] for c in nd["companies"]},
                    })
            else:
                leaves.append({
                    "id": f'{ch["code"]}/{nd["code"]}',
                    "chain": ch["name"], "segment": nd["segment"],
                    "node": nd["name"], "leaf": nd["name"],
                    "path": f'{ch["name"]}/{nd["segment"]}/{nd["name"]}',
                    "stocks": [c["code"] for c in nd["companies"]],
                    "names": {c["code"]: c["name"] for c in nd["companies"]},
                })

    with open(os.path.join(DATA, "ic_leaves.json"), "w", encoding="utf-8") as f:
        json.dump({"fetched_at": doc["fetched_at"], "leaves": leaves},
                  f, ensure_ascii=False, indent=1)

    # ── 個股 → 葉節點索引（一檔可屬多葉，這正是要處理的重複歸屬問題）──────
    idx = {}
    names = {}
    for lf in leaves:
        for code in lf["stocks"]:
            idx.setdefault(code, []).append(lf["path"])
            names.setdefault(code, lf["names"].get(code, ""))
    stock_index = {
        code: {"name": names.get(code, ""), "paths": sorted(set(paths))}
        for code, paths in sorted(idx.items())
    }
    with open(os.path.join(DATA, "ic_stock_index.json"), "w", encoding="utf-8") as f:
        json.dump({"fetched_at": doc["fetched_at"], "stocks": stock_index},
                  f, ensure_ascii=False, indent=1)

    multi = sum(1 for v in stock_index.values() if len(v["paths"]) > 1)
    print()
    print(f"產業鏈 {len(chains)} 條")
    print(f"葉節點 {len(leaves)} 個（候選板塊）")
    print(f"個股   {len(stock_index)} 檔，其中 {multi} 檔屬於 2 個以上葉節點")
    print(f"→ {DATA}")


if __name__ == "__main__":
    main()
