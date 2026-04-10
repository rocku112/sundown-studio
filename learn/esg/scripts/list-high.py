import sys, re
sys.stdout.reconfigure(encoding='utf-8')

ch = sys.argv[1] if len(sys.argv) > 1 else 'ch1'
content = open('validate-report.md', 'r', encoding='utf-8').read()

# 抓出指定章節區塊
m = re.search(rf'# {ch} 驗證報告(.*?)(?=\n# ch\d|\Z)', content, re.S)
if not m:
    print(f"找不到 {ch}")
    sys.exit(1)
section = m.group(1)

# 抓 HIGH_MISMATCH 區塊
hm = re.search(r'## 🔴 HIGH_MISMATCH.*?(?=\n## |\Z)', section, re.S)
if not hm:
    print(f"{ch} 沒有 HIGH_MISMATCH")
    sys.exit(0)

block = hm.group(0)

# 拆每題
items = re.findall(
    r'### Q(\d+) \[(.+?)\] 現有 a:(\d+) → 建議 a:(\d+)\n'
    r'\*\*題幹\*\*：(.*?)\n'
    r'\*\*選項\*\*：\n((?:  \d\. .*\n)+)'
    r'\*\*解析\*\*：(.*?)\n'
    r'\*\*分數\*\*：.*?\n'
    r'\*\*原因\*\*：(.*?)\n',
    block
)

print(f"# {ch} HIGH_MISMATCH 清單（共 {len(items)} 題）\n")
print(f"| 題號 | 類型 | 現有→建議 | 建議答案 | 證據 |")
print(f"|---|---|---|---|---|")
for num, typ, cur, sug, stem, opts_block, expl, reason in items:
    sug_idx = int(sug) - 1
    opt_lines = opts_block.strip().split('\n')
    sug_text = opt_lines[sug_idx].strip().split('. ', 1)[1] if sug_idx < len(opt_lines) else '?'
    sug_text_short = sug_text[:25] + ('…' if len(sug_text) > 25 else '')
    reason_short = reason[:40]
    typ_short = '反向' if '反向' in typ else '正向'
    print(f"| Q{num} | {typ_short} | {cur}→{sug} | {sug_text_short} | {reason_short} |")
