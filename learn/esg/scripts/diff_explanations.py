# diff_explanations.py
# 比對 OCR 出來的教科書解析文字 vs ch{N}.js 的 x 欄位
# 用 fuzzy match + normalize 降低 OCR 雜訊的影響
# 只報告相似度低於門檻的條目
import os
import re
import sys
import json
from difflib import SequenceMatcher

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_BASE = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
OCR_BASE = os.path.join(SCRIPT_DIR, "ocr_out")

# 正規化: 移除空白、全形標點統一、移除干擾字元
PUNCT_MAP = str.maketrans({
    "，": ",", "。": ".", "、": ",", "；": ";", "：": ":",
    "（": "(", "）": ")", "「": '"', "」": '"',
    "『": '"', "』": '"', "【": "[", "】": "]",
    " ": "", "\u3000": "", "\n": "", "\r": "", "\t": "",
})

def normalize(s):
    if not s:
        return ""
    s = s.translate(PUNCT_MAP)
    # 移除常見 OCR 噪點
    s = re.sub(r"[\u2027\u00b7\u2022\ufffd]", "", s)
    return s

def similarity(a, b):
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()

# ──────── 讀 js 題目 ────────
def load_js_questions(js_path):
    """Return dict[q_num_int] = {'s':, 'o':[...], 'a':, 'x':}"""
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 切成題塊:  // ─── 第X章 第 N 題 ─── 到下一個同樣 marker
    marker = re.compile(r"//\s*─+\s*第.+?章\s*第\s*(\d+)\s*題\s*─+")
    questions = {}
    matches = list(marker.finditer(content))
    for i, m in enumerate(matches):
        q_num = int(m.group(1))
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        block = content[start:end]
        # 抓 "x": "..."
        x_match = re.search(r'"x"\s*:\s*"((?:[^"\\]|\\.)*)"', block)
        if x_match:
            x_raw = x_match.group(1)
            # unescape
            x = x_raw.encode().decode("unicode_escape") if "\\u" in x_raw else x_raw
            x = x.replace("\\\"", "\"").replace("\\\\", "\\")
        else:
            x = ""
        questions[q_num] = {"x": x, "block": block}
    return questions

# ──────── 解析 OCR 文字 ────────
# OCR 輸出的題目區塊模式: "(X)N." 或 "N." 開頭,【解析】為解析區塊開始
def parse_ocr_file(txt_path):
    """Return list of (q_num, explanation_text)"""
    with open(txt_path, "r", encoding="utf-8") as f:
        text = f.read()

    # 先清理 OCR 常見空格問題:中文字之間的空格
    # 但保留半形數字/英文之間的空格
    cleaned = re.sub(r"([\u4e00-\u9fff])\s+([\u4e00-\u9fff])", r"\1\2", text)
    cleaned = re.sub(r"([\u4e00-\u9fff])\s+([\u4e00-\u9fff])", r"\1\2", cleaned)  # 再跑一次抓漏網

    # 找題號標記: 可能是 (1)25. 或 25. 或 25、等
    q_pat = re.compile(r"\(?[1-4]\)?(\d{1,3})[\.,、]\s*")
    results = []
    positions = [(m.start(), int(m.group(1))) for m in q_pat.finditer(cleaned)]
    # 過濾掉明顯不合理的題號 (若章節正確,題號應該合理連續)
    if not positions:
        return results

    for i, (pos, q_num) in enumerate(positions):
        end = positions[i + 1][0] if i + 1 < len(positions) else len(cleaned)
        block = cleaned[pos:end]
        # 找 【解析】 區段
        exp_match = re.search(r"【?解析】?\s*(.+?)(?=【?解析】?|\Z)", block, re.DOTALL)
        if exp_match:
            explanation = exp_match.group(1).strip()
            # 移除 "解析" 字樣本身
            explanation = re.sub(r"^[\[【]?解析[\]】]?", "", explanation).strip()
            results.append((q_num, explanation))
    return results

def extract_all_ocr(ch_dir):
    """Merge all OCR files, build {q_num: ocr_explanation}"""
    merged = {}
    files = sorted(os.listdir(ch_dir))
    for f in files:
        if not f.endswith(".txt"):
            continue
        path = os.path.join(ch_dir, f)
        for q_num, exp in parse_ocr_file(path):
            # 若跨頁或重複,保留較長的那個
            if q_num in merged:
                if len(exp) > len(merged[q_num]):
                    merged[q_num] = exp
            else:
                merged[q_num] = exp
    return merged

# ──────── 比對 ────────
def audit_chapter(ch_num, threshold=0.70):
    print(f"\n=== Chapter {ch_num} ===")
    js_path = os.path.join(REPO_BASE, "textbookq", f"ch{ch_num}.js")
    ocr_dir = os.path.join(OCR_BASE, f"ch{ch_num}")
    if not os.path.exists(js_path):
        print(f"  skip: no {js_path}")
        return []
    if not os.path.exists(ocr_dir):
        print(f"  skip: no {ocr_dir}")
        return []

    js_q = load_js_questions(js_path)
    ocr_q = extract_all_ocr(ocr_dir)
    print(f"  js questions: {len(js_q)},  ocr found: {len(ocr_q)}")

    diffs = []
    for q_num in sorted(js_q):
        js_x = js_q[q_num]["x"]
        ocr_x = ocr_q.get(q_num, "")
        if not ocr_x:
            continue
        sim = similarity(js_x, ocr_x)
        if sim < threshold:
            diffs.append({
                "ch": ch_num,
                "q": q_num,
                "sim": round(sim, 3),
                "js_x": js_x,
                "ocr_x": ocr_x,
            })
    print(f"  flagged (sim<{threshold}): {len(diffs)}")
    return diffs

def main():
    all_diffs = []
    for ch in [1, 2, 3, 4]:
        all_diffs.extend(audit_chapter(ch, threshold=0.70))

    # 輸出 markdown
    md_path = os.path.join(SCRIPT_DIR, "audit-all-diffs.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# 解析稽核 — 共 {len(all_diffs)} 筆疑似差異\n\n")
        f.write("說明: 相似度 < 0.70 才列出。OCR 有雜訊,需人工 review。\n\n")
        for d in all_diffs:
            f.write(f"## ch{d['ch']} Q{d['q']}  (sim={d['sim']})\n")
            f.write(f"**js x**: {d['js_x']}\n\n")
            f.write(f"**OCR**: {d['ocr_x']}\n\n")
            f.write("---\n\n")

    # 輸出 JSON 便於後續處理
    json_path = os.path.join(SCRIPT_DIR, "audit-all-diffs.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_diffs, f, ensure_ascii=False, indent=2)

    print(f"\n[done] {md_path}")
    print(f"[done] {json_path}")
    print(f"[total] {len(all_diffs)} 筆疑似差異")

if __name__ == "__main__":
    main()
