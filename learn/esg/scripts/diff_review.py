"""Diff user-reviewed review.md (desired state) vs current ch1.js/ch2.js state."""
import re
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / "scripts" / "textbook-new-review.md"
CH1 = ROOT / "textbookq" / "ch1.js"
CH2 = ROOT / "textbookq" / "ch2.js"


def parse_review(text):
    """Parse review.md into list of dicts."""
    lines = text.split("\n")
    questions = []
    current_chapter = None
    i = 0
    chap_re = re.compile(r"## (ch\d)\.js")
    q_header_re = re.compile(r"### Q(\d+)[（(]a=(\d)")
    while i < len(lines):
        line = lines[i]
        cm = chap_re.search(line)
        if cm:
            current_chapter = cm.group(1)
            i += 1
            continue
        hm = q_header_re.match(line)
        if not hm:
            i += 1
            continue
        qnum = int(hm.group(1))
        a_idx = int(hm.group(2))
        stem = ""
        opts = []
        expl = ""
        i += 1
        while i < len(lines):
            ln = lines[i]
            if ln.startswith("### ") or ln.startswith("## ") or ln.startswith("---"):
                break
            if ln.startswith("**題幹**"):
                stem = ln.split("：", 1)[1].strip() if "：" in ln else ""
            elif re.match(r"\s*\(\d\)", ln):
                m2 = re.match(r"\s*\(\d\)\s*(.+?)(?:\s*⬅)?\s*$", ln)
                if m2:
                    opts.append(m2.group(1).strip())
            elif ln.startswith("**解析**"):
                expl = ln.split("：", 1)[1].strip() if "：" in ln else ""
            i += 1
        questions.append({
            "chapter": current_chapter,
            "q": qnum,
            "stem": stem,
            "opts": opts,
            "a": a_idx,
            "x": expl,
        })
    return questions


def parse_js(path):
    """Parse ch*.js into {(marker_num): question_obj} using marker comments."""
    text = path.read_text(encoding="utf-8")
    # Match marker comment + following object
    marker_re = re.compile(
        r"//\s*───\s*第[一二三四]章\s*第\s*(\d+)\s*題[^─]*───\s*\n\s*\{",
    )
    results = {}
    for m in marker_re.finditer(text):
        qnum = int(m.group(1))
        # find matching closing brace
        start = m.end() - 1  # position of '{'
        depth = 0
        i = start
        in_str = False
        esc = False
        while i < len(text):
            ch = text[i]
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = not in_str
            elif not in_str:
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            i += 1
        else:
            continue
        obj_text = text[start:end]
        # Convert to JSON-ish: keys already quoted, but may have trailing commas
        # Remove trailing commas before } or ]
        cleaned = re.sub(r",\s*([}\]])", r"\1", obj_text)
        try:
            obj = json.loads(cleaned)
            results[qnum] = obj
        except Exception as e:
            print(f"[parse error] {path.name} Q{qnum}: {e}")
    return results


def strip_spaces(s):
    return re.sub(r"\s+", "", s)


def main():
    review_text = REVIEW.read_text(encoding="utf-8")
    reviewed = parse_review(review_text)
    ch1 = parse_js(CH1)
    ch2 = parse_js(CH2)
    js_map = {"ch1": ch1, "ch2": ch2}

    print(f"解析 review: {len(reviewed)} 題")
    print(f"ch1.js 解析到 {len(ch1)} 題 marker")
    print(f"ch2.js 解析到 {len(ch2)} 題 marker")
    print()

    diffs = []
    for r in reviewed:
        chap = r["chapter"]
        q = r["q"]
        js_obj = js_map[chap].get(q)
        if not js_obj:
            diffs.append(f"[{chap} Q{q}] ❌ JS 檔找不到這題 marker")
            continue
        issues = []
        # Compare stem
        if strip_spaces(r["stem"]) != strip_spaces(js_obj["s"]):
            issues.append(f"  題幹差異:\n    review: {r['stem']}\n    js:     {js_obj['s']}")
        # Compare options
        if len(r["opts"]) != len(js_obj["o"]):
            issues.append(f"  選項數量不同: review={len(r['opts'])} js={len(js_obj['o'])}")
        else:
            for i, (ro, jo) in enumerate(zip(r["opts"], js_obj["o"])):
                if strip_spaces(ro) != strip_spaces(jo):
                    issues.append(f"  opt{i+1} 差異:\n    review: {ro}\n    js:     {jo}")
        # Compare answer index
        if r["a"] != js_obj["a"]:
            issues.append(f"  答案 index 差異: review a={r['a']} js a={js_obj['a']}")
        # Compare explanation
        if strip_spaces(r["x"]) != strip_spaces(js_obj.get("x", "")):
            issues.append(f"  解析差異:\n    review: {r['x']}\n    js:     {js_obj.get('x','')}")
        if issues:
            diffs.append(f"\n[{chap} Q{q}] 有差異:")
            diffs.extend(issues)
    if not diffs:
        print("✅ 所有 37 題 review md 與 js 檔完全一致 — 沒有差異")
    else:
        print("=" * 60)
        print(f"共發現 {sum(1 for d in diffs if d.startswith(chr(10)+'['))} 題有差異:")
        print("=" * 60)
        for d in diffs:
            print(d)


if __name__ == "__main__":
    main()
