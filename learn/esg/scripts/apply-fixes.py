# apply-fixes.py
# 從 validate-report.md 解析 HIGH_MISMATCH，套用到對應的 ch*.js
# 用法： python apply-fixes.py [--dry-run] [ch1|ch2|ch3|ch4|all]

import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEXTBOOKQ_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "textbookq"))
REPORT_PATH = os.path.join(SCRIPT_DIR, "validate-report.md")

CHAPTERS = {
    "ch1": (os.path.join(TEXTBOOKQ_DIR, "ch1.js"), "第一章"),
    "ch2": (os.path.join(TEXTBOOKQ_DIR, "ch2.js"), "第二章"),
    "ch3": (os.path.join(TEXTBOOKQ_DIR, "ch3.js"), "第三章"),
    "ch4": (os.path.join(TEXTBOOKQ_DIR, "ch4.js"), "第四章"),
}


def parse_report():
    """回傳 {ch_name: [(num, new_a_0based), ...]}"""
    content = open(REPORT_PATH, "r", encoding="utf-8").read()
    result = {}
    for ch in CHAPTERS:
        m = re.search(rf"# {ch} 驗證報告(.*?)(?=\n# ch\d|\Z)", content, re.S)
        if not m:
            continue
        section = m.group(1)
        hm = re.search(r"## 🔴 HIGH_MISMATCH.*?(?=\n## |\Z)", section, re.S)
        if not hm:
            result[ch] = []
            continue
        items = re.findall(
            r"### Q(\d+) \[.+?\] 現有 a:(\d+) → 建議 a:(\d+)",
            hm.group(0),
        )
        result[ch] = [(int(n), int(s) - 1) for n, _, s in items]
    return result


def fix_chapter(ch_name, fixes, dry_run=False):
    file_path, ch_marker = CHAPTERS[ch_name]
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    applied = 0
    failed = []

    for num, new_a in fixes:
        # marker 可能有兩種格式：
        #   // ─── 第一章 第 N 題 ───
        #   // ─── 第一章 第 N 題（教科書新增） ───
        prefix = f"// ─── {ch_marker} 第 {num} 題"
        m_marker = re.search(re.escape(prefix) + r"[^─]*───", content)
        if not m_marker:
            failed.append((num, "marker not found"))
            continue
        idx = m_marker.start()
        # 在 marker 後 2500 字內找第一個 "a": N
        block_end = min(idx + 2500, len(content))
        block = content[idx:block_end]
        m = re.search(r'"a":\s*(\d+)', block)
        if not m:
            failed.append((num, "a field not found"))
            continue
        old_a = int(m.group(1))
        if old_a == new_a:
            print(f"  {ch_name} Q{num}: 已是 {new_a}，跳過")
            continue
        replace_start = idx + m.start()
        replace_end = idx + m.end()
        new_text = f'"a": {new_a}'
        content = content[:replace_start] + new_text + content[replace_end:]
        applied += 1
        print(f"  {ch_name} Q{num}: a={old_a} → {new_a}")

    if not dry_run and applied > 0:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

    return applied, failed


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    target = args[0] if args else "all"
    chapters = list(CHAPTERS.keys()) if target == "all" else [target]

    fixes_by_ch = parse_report()

    print(f"{'[DRY RUN] ' if dry_run else ''}套用 HIGH_MISMATCH 修正：\n")
    total_applied = 0
    all_failed = []
    for ch in chapters:
        fixes = fixes_by_ch.get(ch, [])
        if not fixes:
            print(f"{ch}: 無 HIGH_MISMATCH")
            continue
        print(f"\n=== {ch} ({len(fixes)} 題) ===")
        applied, failed = fix_chapter(ch, fixes, dry_run=dry_run)
        total_applied += applied
        for num, reason in failed:
            all_failed.append((ch, num, reason))

    print(f"\n總計套用 {total_applied} 題" + (" (dry run, 未寫入)" if dry_run else ""))
    if all_failed:
        print(f"\n失敗 {len(all_failed)} 題：")
        for ch, num, reason in all_failed:
            print(f"  {ch} Q{num}: {reason}")


if __name__ == "__main__":
    main()
