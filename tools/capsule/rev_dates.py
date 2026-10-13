"""市場傳導艙 · 各公司月營收的實際公布日（逐日累積）

公開資訊觀測站沒有提供「哪一天公布」的欄位。swing/scripts/fetch_revenue.py 每個交易日盤後抓一次
MOPS 每月營收彙總頁（swing/data/revenue.json），這裡記下每家公司「第一次出現在彙總頁」的日期，
就是它實際公布營收的日子（精確到每日盤後那一次執行；週末公布的會記在下一個交易日）。
只能從開始記錄的那天往後累積；開始記錄前就已公布的月份標為 null。

輸出 tools/capsule/rev_dates.json：{"YYYY-MM": {"代號": "YYYY-MM-DD" 或 null}}
用法：python rev_dates.py（在 fetch_revenue.py 之後執行）
"""
import json, pathlib, datetime as dt

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / 'rev_dates.json'
rev = json.loads((ROOT / 'swing/data/revenue.json').read_text(encoding='utf-8'))['months']
old = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
today = dt.date.today().isoformat()
first_run = not old
new_n = 0
for ym in sorted(rev)[-3:]:                     # 最近三個月（公布期限是次月 10 日，可能延後更正）
    seen = old.setdefault(ym, {})
    for code in rev[ym]:
        if code not in seen:
            seen[code] = None if first_run else today; new_n += first_run is False
OUT.write_text(json.dumps(old, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'月營收公布日：{len(old)} 個月；今天新公布 {new_n} 家' + ('（第一次執行：既有資料標為 null）' if first_run else ''))
