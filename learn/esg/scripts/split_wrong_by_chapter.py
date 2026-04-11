# split_wrong_by_chapter.py
# 讀 checkpoint，把 WRONG 題按章節輸出成獨立 md
# 使用者可在每個檔案裡直接刪掉不想 apply 的題目區塊
# 保留下來的會被後續 apply 腳本吃

import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from validate_answers import CHAPTERS, load_questions  # noqa: E402

CHECKPOINT = os.path.join(SCRIPT_DIR, "llm-low-checkpoint.json")

with open(CHECKPOINT, "r", encoding="utf-8") as f:
    ckpt = json.load(f)

# 載入所有章節題目
all_q = {ch: load_questions(path) for ch, path in CHAPTERS.items()}

by_chapter = {ch: [] for ch in CHAPTERS}
for key, v in ckpt.items():
    if v.get("verdict") != "WRONG":
        continue
    ch, idx_str = key.split(":")
    idx = int(idx_str)
    q = all_q[ch][idx]
    by_chapter[ch].append((idx, q, v))

for ch in CHAPTERS:
    items = sorted(by_chapter[ch], key=lambda x: x[0])
    out_path = os.path.join(SCRIPT_DIR, f"wrong-{ch}.md")
    lines = [
        f"# {ch} WRONG 題目 — 共 {len(items)} 題",
        "",
        "## 使用方法",
        "- 掃過每題，**刪掉不同意的整個 Q 區塊**（從 `### Q...` 到下一個 `### Q...` 前）",
        "- 留下的題目會被 apply 腳本自動改到 js 檔",
        "- 改完存檔即可",
        "",
        "---",
        "",
    ]
    for idx, q, v in items:
        cur = q.get("a")
        sug = v.get("suggested_a")
        stem = q.get("s", "") or ""
        options = q.get("o", []) or []
        explanation = q.get("x", "") or ""
        lines.append(f"### Q{idx+1}  a:{cur}→{sug}")
        lines.append(f"**題幹**：{stem}")
        lines.append("**選項**：")
        for i, o in enumerate(options):
            mark = ""
            if i == cur:
                mark += " ← 現在"
            if i == sug:
                mark += " ← 建議"
            lines.append(f"  {i+1}. {o}{mark}")
        lines.append(f"**解析**：{explanation}")
        lines.append(f"**LLM 理由**：{v.get('reason','')}")
        lines.append("")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[done] {out_path}  ({len(items)} 題)")
