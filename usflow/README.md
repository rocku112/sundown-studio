# usflow — 美股管線（twflow 雙市場的美股端）

把美股日線與 SEC 基本面整理成 twflow 前端可讀的靜態 JSON，並與台股資料合併出「台美連動」。
前端與 twflow 共用同一個頁面：`twflow/web/index.html` 右上角切換「台股｜美股」。

> 本專案僅就公開資料進行彙整與統計呈現，非證券投資顧問事業，
> 不對特定有價證券提供分析意見或推介建議，亦不構成任何投資建議。

設計規劃見 [`DESIGN.md`](DESIGN.md)。

## 管線

| 步驟 | 腳本 | 輸出 |
|---|---|---|
| 美股日線 | `scripts/fetch_us.py` | `data/market/prices.json`、`fetch_log.json` |
| 基本面（每週）| `scripts/fetch_sec.py` | `data/fundamentals.json` |
| 前端資料 | `scripts/build_us.py` | `twflow/web/data/us/latest.json`、`history.json` |
| 台美連動 | `scripts/build_cross.py` | `twflow/web/data/cross.json` |
| 檢查 | `scripts/sanity_check.py` | 不合理就非零結束，CI 不提交 |

排程：`.github/workflows/usflow-daily.yml`，台灣時間週二～週六 06:30。
台股管線（`twflow-daily.yml`）跑完也會重算 `cross.json`，讓 ADR 溢價用到最新台股收盤。

`.github/workflows/usflow-check.yml`：改到美股管線或前端時，在非 main 分支上實際抓一次資料、
跑完整條管線但不提交——開發環境多半連不到這些來源，這是合併前唯一能確認來源可用的地方。

## 資料來源

| 用途 | 來源 | 備註 |
|---|---|---|
| 日線（主）| Yahoo Finance chart API | 非官方用法，可能限流或改版 |
| 日線（備）| Stooq CSV | 主來源失敗的代號自動改用這個 |
| 基本面 | SEC EDGAR XBRL companyfacts | 官方、免費；需 User-Agent |
| 匯率 | Yahoo `TWD=X`／Stooq `usdtwd` | ADR 溢價、台幣換算用 |
| 台股端 | `twflow/web/data/*.json` | 不重抓，直接讀 twflow 產出 |

### 需要設定的東西

SEC 要求 User-Agent 帶可聯絡的資訊，否則可能回 403。在 GitHub repo 的
**Settings → Secrets and variables → Actions → Variables** 新增：

```
SEC_USER_AGENT = SunDown Studio 你的email@example.com
```

沒設也會用預設值嘗試；基本面抓取失敗不會擋住每日價量更新。

## 編輯股票池與對照表

- `data/universe.json`：約 140 檔（大型股、台灣相關 ADR、ETF、指數）。`sym` 用 Yahoo 代號；
  ADR 要填 `tw`（台股代號）與 `ratio`（1 股 ADR 等於幾股普通股）。
- `data/links.json`：美股龍頭 → 台股關聯。人工整理、未逐條查核；`role` 寫「同業」表示不是供應關係。
  台股代號打錯時 `build_cross.py` 會讓 CI 紅燈，不會默默少一列。

## 本機執行

```bash
pip install -r usflow/requirements.txt
cd usflow
python scripts/fetch_us.py --only SPY,NVDA,TSM,TWD=X   # 先抓幾檔試
python scripts/fetch_sec.py --only NVDA
python scripts/build_us.py && python scripts/build_cross.py && python scripts/sanity_check.py
cd ../twflow/web && python -m http.server   # 開 http://localhost:8000
```

`build_us.py` 需要 `SPY` 的資料當美股交易日曆。
