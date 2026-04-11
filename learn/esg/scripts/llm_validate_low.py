# llm_validate_low.py
# 用 Claude API 批次驗證 LOW_CONFIDENCE 題目
#
# 用法：
#   pip install anthropic
#   set ANTHROPIC_API_KEY=sk-ant-...
#   python llm_validate_low.py            # 跑全部 LOW
#   python llm_validate_low.py --limit 20 # 只跑前 20 題（測試）
#   python llm_validate_low.py --chapter ch1
#   python llm_validate_low.py --resume   # 從 checkpoint 繼續
#
# 輸出：
#   llm-low-checkpoint.json  每題 verdict（可續跑）
#   llm-low-review.md        人類可讀報告（含建議修正）

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from validate_answers import CHAPTERS, load_questions, validate_question  # noqa: E402

CHECKPOINT = os.path.join(SCRIPT_DIR, "llm-low-checkpoint.json")
REVIEW_MD = os.path.join(SCRIPT_DIR, "llm-low-review.md")

MODEL = "claude-sonnet-4-5"
MAX_WORKERS = 6          # 併發
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0

SYSTEM_PROMPT = """你是 ESG 永續金融考試題庫的校對專家。
使用者會給你一題選擇題：題幹、選項、目前標註的答案、以及原始解析。
你的任務：判斷「目前標註的答案」是否正確。

重要規則：
1. 只根據題幹文字、選項文字、原始解析三者的邏輯一致性判斷。
2. 注意題目是正向題（問正確/屬於）還是反向題（問錯誤/不屬於/何者非）。
3. 反向題：解析若說「某選項錯誤/有誤/應改為...」，那個選項就是答案。
4. 正向題：解析若描述某選項定義/正是題幹所問，那個選項就是答案。
5. 若「以上皆是」為選項，且解析同時肯定多個選項或明示「皆是」，答案為「以上皆是」。
6. 若解析模糊無法判斷，回傳 verdict="UNKNOWN"。

你必須只回傳一個 JSON 物件，不要有任何其他文字、不要 markdown code fence。
格式：
{"verdict":"CORRECT"|"WRONG"|"UNKNOWN","suggested_a":0|1|2|3|null,"reason":"..."}

- CORRECT: 目前答案正確
- WRONG: 目前答案錯誤，須改為 suggested_a（0-based index）
- UNKNOWN: 解析不足以判斷（suggested_a=null）
reason 限 60 字內繁體中文。"""


def build_user_msg(q):
    stem = q.get("s", "") or ""
    options = q.get("o", []) or []
    explanation = q.get("x", "") or ""
    current_a = q.get("a")
    lines = [
        f"題幹：{stem}",
        "選項：",
    ]
    for i, o in enumerate(options):
        lines.append(f"  ({i}) {o}")
    lines.append(f"目前標註答案 index：{current_a}  (即選項 {options[current_a] if current_a is not None and 0 <= current_a < len(options) else '?'})")
    lines.append(f"原始解析：{explanation}")
    return "\n".join(lines)


def collect_low_questions(chapter_filter=None):
    items = []
    chapters = [chapter_filter] if chapter_filter else list(CHAPTERS.keys())
    for ch in chapters:
        path = CHAPTERS[ch]
        qs = load_questions(path)
        for i, q in enumerate(qs):
            r = validate_question(q, i)
            if r["category"] == "LOW_CONFIDENCE":
                items.append({
                    "key": f"{ch}:{i}",
                    "chapter": ch,
                    "index": i,
                    "num": i + 1,
                    "q": q,
                })
    return items


def load_checkpoint():
    if not os.path.exists(CHECKPOINT):
        return {}
    try:
        with open(CHECKPOINT, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_checkpoint(data):
    with open(CHECKPOINT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def call_claude(client, q):
    user_msg = build_user_msg(q)
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=300,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            text = "".join(
                blk.text for blk in resp.content if getattr(blk, "type", None) == "text"
            ).strip()
            # 容錯剝掉 ```json
            if text.startswith("```"):
                text = text.strip("`")
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            verdict = json.loads(text)
            return verdict
        except Exception as e:
            last_err = e
            time.sleep(RETRY_BACKOFF * (attempt + 1))
    return {"verdict": "ERROR", "suggested_a": None, "reason": f"API failed: {last_err}"}


def worker(client, item):
    v = call_claude(client, item["q"])
    return item["key"], v


def render_review(items, checkpoint):
    wrong = []
    unknown = []
    correct = 0
    errored = []
    for it in items:
        v = checkpoint.get(it["key"])
        if not v:
            continue
        verd = v.get("verdict")
        if verd == "WRONG":
            wrong.append((it, v))
        elif verd == "UNKNOWN":
            unknown.append((it, v))
        elif verd == "CORRECT":
            correct += 1
        else:
            errored.append((it, v))

    lines = [
        "# LLM LOW_CONFIDENCE 驗證報告",
        "",
        f"- 總題數：{len(items)}",
        f"- 🔴 WRONG（LLM 認為答案錯）：{len(wrong)}",
        f"- 🟡 UNKNOWN（解析不足判斷）：{len(unknown)}",
        f"- 🟢 CORRECT：{correct}",
        f"- ⚠️ ERROR：{len(errored)}",
        "",
    ]

    if wrong:
        lines.append("## 🔴 WRONG — 建議修正")
        lines.append("")
        for it, v in wrong:
            q = it["q"]
            cur = q.get("a")
            sug = v.get("suggested_a")
            lines.append(f"### {it['chapter']} Q{it['num']}  a:{cur}→{sug}")
            lines.append(f"**題幹**：{q.get('s','')}")
            lines.append("**選項**：")
            for i, o in enumerate(q.get("o", [])):
                mark = ""
                if i == cur:
                    mark += " ← 現在"
                if i == sug:
                    mark += " ← 建議"
                lines.append(f"  {i+1}. {o}{mark}")
            lines.append(f"**解析**：{q.get('x','')}")
            lines.append(f"**LLM 理由**：{v.get('reason','')}")
            lines.append("")

    if unknown:
        lines.append("## 🟡 UNKNOWN — 需手動翻書")
        lines.append("")
        for it, v in unknown:
            q = it["q"]
            lines.append(f"- {it['chapter']} Q{it['num']}：{q.get('s','')[:60]} — {v.get('reason','')}")
        lines.append("")

    if errored:
        lines.append("## ⚠️ ERROR")
        lines.append("")
        for it, v in errored:
            lines.append(f"- {it['chapter']} Q{it['num']}：{v.get('reason','')}")
        lines.append("")

    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chapter", choices=list(CHAPTERS.keys()))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--report-only", action="store_true",
                    help="只根據現有 checkpoint 產生報告，不呼叫 API")
    ap.add_argument("--workers", type=int, default=MAX_WORKERS)
    args = ap.parse_args()

    items = collect_low_questions(args.chapter)
    print(f"[info] 收集 LOW_CONFIDENCE 題數：{len(items)}")

    checkpoint = load_checkpoint() if (args.resume or args.report_only) else {}

    if args.report_only:
        md = render_review(items, checkpoint)
        with open(REVIEW_MD, "w", encoding="utf-8") as f:
            f.write(md)
        print(f"[done] 已寫入 {REVIEW_MD}")
        return

    # 需要跑的題
    todo = [it for it in items if it["key"] not in checkpoint]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[info] 本次待處理：{len(todo)}")

    if not todo:
        print("[info] 無待處理題目，直接產報告")
        md = render_review(items, checkpoint)
        with open(REVIEW_MD, "w", encoding="utf-8") as f:
            f.write(md)
        print(f"[done] 已寫入 {REVIEW_MD}")
        return

    # API key 檢查
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("[error] 未設 ANTHROPIC_API_KEY 環境變數")
        sys.exit(1)
    try:
        import anthropic
    except ImportError:
        print("[error] 未安裝 anthropic SDK：pip install anthropic")
        sys.exit(1)

    client = anthropic.Anthropic()

    done = 0
    save_every = 10
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(worker, client, it): it for it in todo}
        for fut in as_completed(futs):
            key, verdict = fut.result()
            checkpoint[key] = verdict
            done += 1
            if done % save_every == 0:
                save_checkpoint(checkpoint)
                elapsed = time.time() - t0
                rate = done / elapsed if elapsed else 0
                eta = (len(todo) - done) / rate if rate else 0
                print(f"[progress] {done}/{len(todo)}  rate={rate:.1f}/s  eta={eta:.0f}s")

    save_checkpoint(checkpoint)
    print(f"[info] 完成，總計 {done} 題，耗時 {time.time()-t0:.0f}s")

    md = render_review(items, checkpoint)
    with open(REVIEW_MD, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[done] 已寫入 {REVIEW_MD}")


if __name__ == "__main__":
    main()
