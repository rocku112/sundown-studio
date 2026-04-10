import sys, re
sys.stdout.reconfigure(encoding='utf-8')

content = open('validate-report.md', 'r', encoding='utf-8').read()

for ch in ['ch1', 'ch2', 'ch3', 'ch4']:
    m = re.search(rf'# {ch} 驗證報告(.*?)(?=\n# ch\d|\Z)', content, re.S)
    if not m:
        continue
    section = m.group(1)
    nx = re.search(r'## ⚪ NO_EXPLANATION.*?(?=\n## |\Z)', section, re.S)
    if not nx:
        continue
    block = nx.group(0)
    items = re.findall(
        r'### Q(\d+) \[(.+?)\] 現有 a:(\d+) → 建議 a:(.+?)\n'
        r'\*\*題幹\*\*：(.*?)\n'
        r'\*\*選項\*\*：\n((?:  \d\. .*\n)+)'
        r'\*\*解析\*\*：(.*?)\n',
        block
    )
    print(f"\n## {ch} ({len(items)} 題)\n")
    for num, typ, cur, sug, stem, opts, expl in items:
        print(f"### Q{num} [{typ}] 現有 a:{cur}")
        print(f"題幹：{stem}")
        for ol in opts.strip().split('\n'):
            print(f"  {ol.strip()}")
        print(f"解析：「{expl}」")
        print()
