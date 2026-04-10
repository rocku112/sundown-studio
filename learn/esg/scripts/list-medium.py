import sys, re
sys.stdout.reconfigure(encoding='utf-8')

content = open('validate-report.md', 'r', encoding='utf-8').read()

for ch in ['ch1', 'ch2', 'ch3', 'ch4']:
    m = re.search(rf'# {ch} 驗證報告(.*?)(?=\n# ch\d|\Z)', content, re.S)
    if not m:
        continue
    section = m.group(1)
    md = re.search(r'## 🟠 MEDIUM_MISMATCH.*?(?=\n## |\Z)', section, re.S)
    if not md:
        continue
    block = md.group(0)
    items = re.findall(
        r'### Q(\d+) \[(.+?)\] 現有 a:(\d+) → 建議 a:(\d+)\n'
        r'\*\*題幹\*\*：(.*?)\n'
        r'\*\*選項\*\*：\n((?:  \d\. .*\n)+)'
        r'\*\*解析\*\*：(.*?)\n'
        r'\*\*分數\*\*：(.*?)\n'
        r'\*\*原因\*\*：(.*?)\n',
        block
    )
    print(f"\n## {ch} ({len(items)} 題)\n")
    for num, typ, cur, sug, stem, opts, expl, scores, reason in items:
        opt_lines = [l.strip() for l in opts.strip().split('\n')]
        print(f"### Q{num} [{typ}] 現有 a:{cur} → 建議 a:{sug}")
        print(f"題幹：{stem}")
        for ol in opt_lines:
            print(f"  {ol}")
        print(f"解析：{expl[:200]}")
        print(f"分數：{scores}")
        print(f"原因：{reason}")
        print()
