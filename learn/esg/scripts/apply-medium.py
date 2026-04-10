import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEXTBOOKQ_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'textbookq'))

# (chapter_file, chapter_marker, [(question_num, new_a_0based), ...])
JOBS = [
    ('ch1.js', '第一章', [(393, 3)]),
    ('ch2.js', '第二章', [
        (84, 2), (125, 3), (126, 1), (129, 0),
        (202, 2), (259, 2), (332, 1), (341, 2),
    ]),
    ('ch4.js', '第四章', [(48, 3)]),
]

for fname, marker, fixes in JOBS:
    path = os.path.join(TEXTBOOKQ_DIR, fname)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for num, new_a in fixes:
        prefix = f'// ─── {marker} 第 {num} 題'
        m = re.search(re.escape(prefix) + r'[^─]*───', content)
        if not m:
            print(f'  {fname} Q{num}: marker not found')
            continue
        idx = m.start()
        block_end = min(idx + 2500, len(content))
        ma = re.search(r'"a":\s*(\d+)', content[idx:block_end])
        if not ma:
            print(f'  {fname} Q{num}: a field not found')
            continue
        old_a = int(ma.group(1))
        if old_a == new_a:
            print(f'  {fname} Q{num}: 已是 {new_a}，跳過')
            continue
        s = idx + ma.start()
        e = idx + ma.end()
        content = content[:s] + f'"a": {new_a}' + content[e:]
        print(f'  {fname} Q{num}: a={old_a} → {new_a}')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print('\n完成')
