# 市場傳導艙 · 建置與校準

頁面發布在 Claude Artifact（https://claude.ai/artifact/J4mdq2osKUkQLfLugow1g4），這裡是它的原始碼與資料管線。

| 檔案 | 用途 |
|---|---|
| `orig.html` | 原始頁面 |
| `build.py` | 套 SunDown 樣式、除息事件、修正，再依序載入下面三個 patch，輸出 `dist/index.html` |
| `twall_patch.py` | 全台股搜尋、線上收盤價（讀 `twflow/web/data/tw_all.json`） |
| `calib_patch.py` | 內嵌實證校準，並在頁面開啟時線上讀取最新的 `capsule_calib.json` |
| `sound_patch.py` | 音效 |
| `gen_twall.py` | 全市場清單＋產業價值鏈 → `twall.json`（代號、板塊、影響力） |
| `fetch_hist.py` | Yahoo 長歷史：美股 197 檔＋SPY、台股債券／海外 ETF、配息 ETF（含配息紀錄）→ 快取目錄 `hist.json.gz` |
| `calibrate.py` | 台美股事件研究校準 → `twflow/web/data/capsule_calib.json` |

## 自動更新

`.github/workflows/twflow-daily.yml` 每個交易日盤後在官方日線更新後執行 `gen_twall.py`、`fetch_hist.py`、`calibrate.py`（約 2 分鐘），
結果隨 GitHub Pages 發布，頁面開啟時自動抓取；抓不到時用內嵌快照。

Yahoo 長歷史放在 Actions cache（`/tmp/capsule_cache`），不進 repo；之後每天只補最近三個月。
Yahoo 失敗時沿用快取；快取也沒有時，`calibrate.py` 沿用上一份輸出的美股部分。

校準視窗會滾動：載入近 5.5 年日線，事件取最近 5 年到最新交易日。

## 手動

```bash
python -X utf8 tools/capsule/gen_twall.py twflow tools/capsule/twall.json
python -X utf8 tools/capsule/fetch_hist.py tools/capsule/cache
python -X utf8 tools/capsule/calibrate.py . twflow/web/data/capsule_calib.json tools/capsule/cache
python -X utf8 tools/capsule/build.py
```

## 需要人工維護

- `calibrate.py` 的 `FOMC_FALLBACK`：新年度的會議日會從 Fed 官網補上，但最好每年初核對一次。
- `build.py` 的 `DIV_TW`（ETF 配息表）是手動快照，換季後要更新，然後重新發布 Artifact。
