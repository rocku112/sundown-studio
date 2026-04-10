# validate_answers.py
# 驗證題庫 a (正解 index) 是否與 x (解析) 一致
# 用法： python validate_answers.py [ch1|ch2|ch3|ch4|all]
# 不會修改任何檔案，只輸出 validate-report.md

import json
import os
import re
import sys

# Windows console UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEXTBOOKQ_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "textbookq"))

CHAPTERS = {
    "ch1": os.path.join(TEXTBOOKQ_DIR, "ch1.js"),
    "ch2": os.path.join(TEXTBOOKQ_DIR, "ch2.js"),
    "ch3": os.path.join(TEXTBOOKQ_DIR, "ch3.js"),
    "ch4": os.path.join(TEXTBOOKQ_DIR, "ch4.js"),
}

NEGATIVE_PATTERNS = [
    "不包含", "不正確", "不屬於", "不是", "不在", "未包含", "未列入",
    "何者非", "何者錯誤", "何者不", "錯誤的是", "錯誤的為", "非屬",
    "下列何者不", "下列何者非", "以下何者不", "以下何者非",
]


# ─────────────────────────────────────────────
# 載入題庫：從 const TEXTBOOKQ_DATA = [...] 抽出 JSON 陣列
# ─────────────────────────────────────────────
def load_questions(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 兩種格式：
    #   A) const TEXTBOOKQ_DATA = [ ... ];
    #   B) TEXTBOOKQ_DATA.push( ... );
    open_char = None
    m = re.search(r"=\s*(\[)", content)
    if m:
        start = m.start(1)
        open_char, close_char = "[", "]"
    else:
        m = re.search(r"\.push\s*(\()", content)
        if not m:
            raise ValueError(f"找不到陣列起始或 push 呼叫於 {file_path}")
        start = m.start(1)
        open_char, close_char = "(", ")"

    # 用括號平衡找對應的關閉括號
    depth = 0
    in_str = False
    str_char = None
    escape = False
    end = None
    for i in range(start, len(content)):
        c = content[i]
        if escape:
            escape = False
            continue
        if in_str:
            if c == "\\":
                escape = True
            elif c == str_char:
                in_str = False
            continue
        if c in ('"', "'"):
            in_str = True
            str_char = c
            continue
        if c == open_char:
            depth += 1
        elif c == close_char:
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        raise ValueError(f"括號不平衡 {file_path}")

    inner = content[start + 1 : end - 1]
    if open_char == "[":
        json_text = "[" + inner + "]"
    else:
        # push(obj, obj, ...) → 包成陣列
        json_text = "[" + inner + "]"
    # 移除 JS 行註解 // ...（小心避開字串內的 //）
    cleaned_lines = []
    for line in json_text.split("\n"):
        # 簡易處理：找出不在字串內的 //
        in_str = False
        str_char = None
        escape = False
        cut = len(line)
        for i, c in enumerate(line):
            if escape:
                escape = False
                continue
            if in_str:
                if c == "\\":
                    escape = True
                elif c == str_char:
                    in_str = False
                continue
            if c in ('"', "'"):
                in_str = True
                str_char = c
                continue
            if c == "/" and i + 1 < len(line) and line[i + 1] == "/":
                cut = i
                break
        cleaned_lines.append(line[:cut])
    cleaned = "\n".join(cleaned_lines)
    # 移除尾隨逗號
    cleaned = re.sub(r",(\s*[}\]])", r"\1", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON parse failed in {file_path}: {e}")


# ─────────────────────────────────────────────
# 反向題判定
# ─────────────────────────────────────────────
def is_negative_question(stem):
    return any(p in stem for p in NEGATIVE_PATTERNS)


# ─────────────────────────────────────────────
# 選項評分
# ─────────────────────────────────────────────
SPLIT_RE = re.compile(r"[、,，。\s\(\)（）「」『』:：；;/]+")

# 負面標記（依優先序排列：越前面越強）
NEG_MARKERS = [
    "不包含", "不屬於", "不列入", "不在內", "不正確", "不為", "不應",
    "非屬", "並非", "不是", "未包含", "未列入",
]


def score_option(option_text, explanation):
    if not explanation or not option_text:
        return 0
    opt = option_text.strip()
    if not opt:
        return 0

    if opt in explanation:
        return 100

    chunks = [c.strip() for c in SPLIT_RE.split(opt) if len(c.strip()) >= 2]
    if not chunks:
        return 0

    matches = sum(1 for c in chunks if c in explanation)
    return round((matches / len(chunks)) * 90)


# ─────────────────────────────────────────────
# 反向題答案推斷（高信心策略）
# ─────────────────────────────────────────────
def find_negative_answer(options, explanation):
    """回傳 (idx, confidence, reason)；找不到時 idx=None"""
    # 策略 1：選項在解析中被「」或『』引號包圍
    quoted = []
    for i, opt in enumerate(options):
        if not opt:
            continue
        if f"「{opt}」" in explanation or f"『{opt}』" in explanation:
            quoted.append(i)
    if len(quoted) == 1:
        return quoted[0], "HIGH", "唯一被「」引號標出"

    # 策略 2：選項後緊接負面標記
    matches = []
    for i, opt in enumerate(options):
        if not opt:
            continue
        pos = explanation.find(opt)
        if pos < 0:
            continue
        tail = explanation[pos + len(opt) : pos + len(opt) + 30]
        for m in NEG_MARKERS:
            if m in tail:
                matches.append((i, m))
                break
    if len(matches) == 1:
        return matches[0][0], "HIGH", f"選項後接「{matches[0][1]}」"

    # 策略 3：解析中只有一個選項完全沒被提到（且其他都被明確提到）
    scores = [(i, score_option(o, explanation)) for i, o in enumerate(options)]
    asc = sorted(scores, key=lambda x: x[1])
    if asc[0][1] == 0 and asc[1][1] >= 80:
        return asc[0][0], "MEDIUM", "解析中唯一未提及的選項"

    return None, "LOW", "無明確負面標記，無法可靠推斷"


# ─────────────────────────────────────────────
# 正向題答案推斷
# ─────────────────────────────────────────────
def find_positive_answer(options, explanation):
    if not options:
        return None, "LOW", "無選項"
    last_opt = options[-1] or ""
    is_all_above = bool(re.search(r"以上皆是|以上皆對|以上皆正確|皆是", last_opt))

    scores = [(i, score_option(o, explanation)) for i, o in enumerate(options)]

    if is_all_above:
        non_last = [s for i, s in scores[:-1]]
        if non_last and all(s >= 80 for s in non_last):
            return len(options) - 1, "HIGH", "解析提及所有前項 → 以上皆是"
        return None, "LOW", "以上皆是型，部分選項未被解析涵蓋，難以判斷"

    desc = sorted(scores, key=lambda x: -x[1])
    top_i, top_s = desc[0]
    sec_s = desc[1][1] if len(desc) > 1 else 0

    if top_s >= 90 and (top_s - sec_s) >= 50:
        return top_i, "HIGH", f"選項 {top_i + 1} 強烈匹配 (分數差 {top_s - sec_s})"

    return top_i, "LOW", "解析中多個選項分數接近或匹配強度不足"


# ─────────────────────────────────────────────
# 驗證單題
# ─────────────────────────────────────────────
def validate_question(q, idx):
    stem = q.get("s", "") or ""
    options = q.get("o", []) or []
    explanation = q.get("x", "") or ""
    current_a = q.get("a")

    result = {
        "num": idx + 1,
        "stem": stem[:80],
        "fullStem": stem,
        "currentA": current_a,
        "options": options,
        "explanation": explanation,
        "negative": is_negative_question(stem),
        "suggestedA": None,
        "scores": [],
        "category": "OK",
        "reason": "",
    }

    if not explanation or len(explanation.strip()) < 8:
        result["category"] = "NO_EXPLANATION"
        result["reason"] = "解析欄位空白或過短，無法驗證"
        return result

    scored = [
        {"i": i, "opt": opt, "score": score_option(opt, explanation)}
        for i, opt in enumerate(options)
    ]
    result["scores"] = scored

    if result["negative"]:
        idx, conf, reason = find_negative_answer(options, explanation)
    else:
        idx, conf, reason = find_positive_answer(options, explanation)

    result["suggestedA"] = idx
    result["reason"] = reason

    if conf == "LOW" or idx is None:
        result["category"] = "LOW_CONFIDENCE"
    elif idx != current_a:
        result["category"] = "HIGH_MISMATCH" if conf == "HIGH" else "MEDIUM_MISMATCH"
    else:
        result["category"] = "OK"

    return result


# ─────────────────────────────────────────────
# 報告
# ─────────────────────────────────────────────
def format_scores(scores):
    return " ".join(f"[{s['i'] + 1}]{s['score']}" for s in scores)


def render_item(r):
    cur = (r["currentA"] + 1) if r["currentA"] is not None else "?"
    sug = (r["suggestedA"] + 1) if r["suggestedA"] is not None else "?"
    tag = "[反向題]" if r["negative"] else "[正向題]"
    lines = [
        f"### Q{r['num']} {tag} 現有 a:{cur} → 建議 a:{sug}",
        f"**題幹**：{r['stem']}{'…' if len(r['fullStem']) > 80 else ''}",
        "**選項**：",
    ]
    for i, o in enumerate(r["options"]):
        lines.append(f"  {i + 1}. {o}")
    lines.append(f"**解析**：{r['explanation'][:240]}")
    lines.append(f"**分數**：{format_scores(r['scores'])}")
    lines.append(f"**原因**：{r['reason']}")
    lines.append("")
    return "\n".join(lines)


def generate_report(chapter_name, results):
    high = [r for r in results if r["category"] == "HIGH_MISMATCH"]
    med = [r for r in results if r["category"] == "MEDIUM_MISMATCH"]
    low = [r for r in results if r["category"] == "LOW_CONFIDENCE"]
    no_exp = [r for r in results if r["category"] == "NO_EXPLANATION"]
    ok = [r for r in results if r["category"] == "OK"]

    lines = [
        f"# {chapter_name} 驗證報告",
        "",
        f"- 總題數：{len(results)}",
        f"- 🔴 HIGH_MISMATCH（解析強烈不一致，極可能錯）：{len(high)}",
        f"- 🟠 MEDIUM_MISMATCH（中等信心不一致）：{len(med)}",
        f"- 🟡 LOW_CONFIDENCE（解析模糊，需手動驗）：{len(low)}",
        f"- ⚪ NO_EXPLANATION（解析空白）：{len(no_exp)}",
        f"- 🟢 OK：{len(ok)}",
        "",
    ]

    if high:
        lines.append("## 🔴 HIGH_MISMATCH（優先處理）")
        lines.append("")
        lines.extend(render_item(r) for r in high)
    if med:
        lines.append("## 🟠 MEDIUM_MISMATCH（中等信心，建議檢查）")
        lines.append("")
        lines.extend(render_item(r) for r in med)
    if low:
        lines.append("## 🟡 LOW_CONFIDENCE（解析本身可能有問題，請翻書手動驗）")
        lines.append("")
        lines.extend(render_item(r) for r in low)
    if no_exp:
        lines.append("## ⚪ NO_EXPLANATION")
        lines.append("")
        lines.extend(render_item(r) for r in no_exp)

    return "\n".join(lines)


# ─────────────────────────────────────────────
# 主程式
# ─────────────────────────────────────────────
def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    chapters = list(CHAPTERS.keys()) if arg == "all" else [arg]

    all_reports = []
    totals = {"high": 0, "med": 0, "low": 0, "noExp": 0, "ok": 0, "total": 0}

    for ch in chapters:
        if ch not in CHAPTERS:
            print(f"未知章節：{ch}", file=sys.stderr)
            continue
        data = load_questions(CHAPTERS[ch])
        results = [validate_question(q, i) for i, q in enumerate(data)]
        all_reports.append(generate_report(ch, results))

        totals["total"] += len(results)
        totals["high"] += sum(1 for r in results if r["category"] == "HIGH_MISMATCH")
        totals["med"] += sum(1 for r in results if r["category"] == "MEDIUM_MISMATCH")
        totals["low"] += sum(1 for r in results if r["category"] == "LOW_CONFIDENCE")
        totals["noExp"] += sum(1 for r in results if r["category"] == "NO_EXPLANATION")
        totals["ok"] += sum(1 for r in results if r["category"] == "OK")

    summary = "\n".join([
        "# 總結",
        "",
        f"- 總題數：{totals['total']}",
        f"- 🔴 HIGH_MISMATCH：{totals['high']}",
        f"- 🟠 MEDIUM_MISMATCH：{totals['med']}",
        f"- 🟡 LOW_CONFIDENCE：{totals['low']}",
        f"- ⚪ NO_EXPLANATION：{totals['noExp']}",
        f"- 🟢 OK：{totals['ok']}",
        "",
    ])

    full = summary + "\n" + "\n\n".join(all_reports)
    out_path = os.path.join(SCRIPT_DIR, "validate-report.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(full)

    print(summary)
    print(f"完整報告已寫入：{out_path}")


if __name__ == "__main__":
    main()
