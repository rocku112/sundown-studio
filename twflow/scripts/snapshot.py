#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 web/index.html 與它所有的資料檔打包成單一可離線開啟的 snapshot.html。

用途：分享／留存當日盤面，不需要起伺服器。
做法是把頁面裡每一個 fetch 換成內嵌資料，其餘程式碼完全不動——
避免另外寫一份繪圖邏輯，那樣兩邊遲早會不一致。

⚠️ 前端每多一個 fetch，這裡就要多一條替換規則，否則獨立檔會少功能而且
   不會有任何錯誤提示（用 file:// 開時 fetch 靜默失敗）。
   所以下面對「沒對到任何一條規則」直接報錯，不讓它靜悄悄產出半殘的檔案。
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web")
OUT = os.path.join(WEB, "snapshot.html")

# (要替換的 fetch 樣式, 對應的資料檔)
RULES = [
    (r"fetch\('data/latest\.json\?'\+Date\.now\(\)\)\.then\(r=>r\.json\(\)\)",
     "latest.json"),
    (r"fetch\('data/search\.json'\)\.then\(r=>r\.json\(\)\)", "search.json"),
    (r"fetch\('data/history\.json'\)\.then\(r=>r\.json\(\)\)", "history.json"),
    (r"fetch\('data/events\.json'\)\.then\(r=>r\.json\(\)\)", "events.json"),
    (r"fetch\('data/chains\.json'\)\.then\(r=>r\.json\(\)\)", "chains.json"),
]


def inline(payload):
    s = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # 資料裡出現 </script> 會提前關閉腳本區塊；JSON 允許把 / 轉義
    return s.replace("</", "<\\/")


def main():
    html = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()

    # 前端還有哪些 fetch 沒被規則涵蓋？有的話就是漏了，直接失敗。
    found = set(re.findall(r"fetch\('([^']+)'", html))
    covered = {"data/latest.json?", "data/search.json", "data/history.json",
               "data/events.json", "data/chains.json"}
    missed = {f for f in found if f.rstrip("?") not in
              {c.rstrip("?") for c in covered}}
    if missed:
        raise SystemExit(f"index.html 有未涵蓋的 fetch：{missed}\n"
                         f"請在 snapshot.py 的 RULES 補上對應規則")

    date = None
    for pat, fn in RULES:
        data = json.load(open(os.path.join(WEB, "data", fn), encoding="utf-8"))
        if fn == "latest.json":
            date = data["date"]
        html, n = re.subn(pat, f"Promise.resolve({inline(data)})", html, count=1)
        if n != 1:
            raise SystemExit(f"找不到 {fn} 的 fetch —— index.html 改過了，"
                             f"snapshot.py 的 RULES 要跟著更新")

    html = html.replace("<title>twflow", f"<title>{date} twflow", 1)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"→ {OUT}  ({os.path.getsize(OUT)/1e6:.2f} MB)  資料日 {date}")


if __name__ == "__main__":
    main()
