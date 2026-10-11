# 市場傳導艙 · 建置與資料管線

頁面發布在 Claude Artifact（https://claude.ai/artifact/J4mdq2osKUkQLfLugow1g4），這裡是它的原始碼與資料管線。
原則：頁面上的每個數字都要有資料來源；找不到來源的部分直接拿掉，不放示意值。

## 檔案

| 檔案 | 用途 |
|---|---|
| `orig.html` | 原始頁面 |
| `build.py` | 套 SunDown 樣式與修正，再依序載入下列 patch，輸出 `dist/index.html` |
| `twall_patch.py` | 全台股搜尋、台股收盤價（`twflow/web/data/tw_all.json`） |
| `calib_patch.py` | 內嵌實證校準；頁面開啟時線上讀最新的 `capsule_calib.json` |
| `us_patch.py` | 美股收盤價（`us/all.json`）、全美股搜尋（`capsule_usall.json`） |
| `real_patch.py` | 拿掉音效；事件行事曆、除息、情境權重、資金流、放大器、上下游、匯率改用實際資料 |
| `gen_twall.py` | 台股全市場清單＋產業價值鏈 → `twall.json`（板塊、成交值影響力） |
| `gen_usall.py` | Nasdaq 選股器 → `twflow/web/data/capsule_usall.json`（全美股＋ETF，產業對應板塊） |
| `fetch_calendar.py` | Nasdaq 經濟／財報行事曆 → `econ_cal.json`（公布日、時刻、實際值、市場共識、EPS 驚喜） |
| `fetch_hist.py` | Yahoo 長歷史：美股、台股債券／海外 ETF、配息 ETF（含配息紀錄）→ 快取目錄 `hist.json.gz` |
| `calibrate.py` | 事件研究校準＋放大器＋上下游＋即時資料＋未來排程 → `twflow/web/data/capsule_calib.json` |

## 資料來源

| 項目 | 來源 |
|---|---|
| 台股日線、還原報酬 | 證交所＋櫃買中心官方日線（`swing/data/prices`） |
| 美股與海外／債券 ETF 日線 | Yahoo 還原收盤 |
| 事件日期、公布時刻、意外值 | Nasdaq 經濟行事曆（實際 − 共識）、財報行事曆（EPS 驚喜）、Fed 官網、FRED 2 年期殖利率（FOMC）、公開資訊觀測站月營收 |
| 法定日期 | 月營收每月 10 日、季報期限、四巫日（季月第三個星期五） |
| 除息預告 | 證交所 TWT48U、櫃買 tpex_exright_prepost |
| 填息統計 | Yahoo 原始收盤＋配息紀錄（與官方日線交叉核對過） |
| 板塊資金流 | 台股：twflow 三大法人近 5 日買賣超；美股：近 5 日板塊超額報酬（沒有公開資金流） |
| 放大器 | `swing/data/chips`（外資、投信、融資、融券）＋板塊價量狀態，實證估計放大倍數 |
| 匯率 | Yahoo TWD=X（usflow） |
| 台美股收盤價 | twflow／usflow 每日管線 |

台灣 CPI、出口、央行理監事會找不到可自動抓取的官方排程，已從事件中移除。

## 自動更新

`.github/workflows/twflow-daily.yml` 每個交易日盤後，在官方日線更新後依序執行
`gen_twall.py` → `fetch_calendar.py` → `gen_usall.py` → `fetch_hist.py` → `calibrate.py`。
`econ_cal.json` 與 `twall.json` 進 repo；Yahoo 長歷史放 Actions cache（`/tmp/capsule_cache`）。
任何一步失敗都沿用上一份資料，不會擋住其他盤後更新。頁面開啟時會抓 GitHub Pages 上的最新檔案。

## 手動

```bash
python -X utf8 tools/capsule/gen_twall.py twflow tools/capsule/twall.json
python -X utf8 tools/capsule/fetch_calendar.py
python -X utf8 tools/capsule/gen_usall.py
python -X utf8 tools/capsule/fetch_hist.py tools/capsule/cache
python -X utf8 tools/capsule/calibrate.py . twflow/web/data/capsule_calib.json tools/capsule/cache
python -X utf8 tools/capsule/build.py
```

`fetch_calendar.py` 第一次會回補 2021-04 起的全部日期（Nasdaq 會限流，約半小時），之後每天只重抓最近 10 天與未來 120 天。

## 需要人工維護

- `calibrate.py` 的 `FOMC_FALLBACK`：Nasdaq 行事曆有 FOMC 時不會用到；每年初核對一次即可。
- `gen_usall.py` 的產業對應規則：Nasdaq 沒有原物料、不動產對應的板塊，暫時分別歸到「電氣設備」與「資產管理」。
