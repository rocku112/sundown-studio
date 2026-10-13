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
| `fetch_tw_macro.py` | 央行理監事會（央行決議列表與年度預定日期）、台灣 CPI（主計總處新聞稿與預告發布時間表）、出口（財政部新聞稿） → `tw_macro.json` |
| `fetch_policy.py` | Federal Register 總統文件中與貿易／關稅有關者（2017 起）→ `policy_events.json` |
| `fetch_conf.py` | 公開資訊觀測站法人說明會一覽表（2021 起，上市＋上櫃）→ `conf_events.json` |
| `rev_dates.py` | 各公司月營收實際公布日（每天記錄第一次出現在 MOPS 彙總頁的日期，從 2026-10 起累積）→ `rev_dates.json` |
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

台灣沒有公開的市場共識：CPI 用「年增率 − 前 3 個月平均」當意外值；央行與出口只估事件窗超額波動。出口的歷史發布日只能回溯到 2024-11（主計總處彙整列表），之後每天累積。

巨觀環境（利率、景氣、通膨）用當天已公布的 FRED 2 年期殖利率、ISM、核心 CPI 實際值判斷，算各板塊在同樣環境下之後 20 個交易日的超額報酬。

## 方向的兩段式因子模型

逐對估「事件 × 板塊」的方向樣本太少。改成兩段：事件意外值 → 總經因子（美債 10 年殖利率、美元指數、原油、費半相對 S&P 500）在事件窗的變化（γ），
乘上板塊超額報酬對這些因子的敏感度（λ，用全部交易日估）。台股對的是前一個美國交易日的因子變化。
樣本外檢驗（前半期估、後半期驗，以事件為單位算 t 值）通過的市場才在頁面上顯示方向；通過規則另要求 40／50／60／70% 四個切分點至少三個為正。
預測幅度在該市場前 30% 的板塊顯示「偏正／偏負」，其餘「略偏」。資料窗為 10 年（`YEARS`）。

曝險模組（排行、因子集中度、持倉、反向候選）也用同一組實證因子：個股敏感度 ＝ 板塊 λ × 個股 β，事件衝擊 ＝ γ。

試過但沒採用（樣本外沒有比較好）：加入規模、價值、信用、防禦、黃金、台積電、台幣因子；只看事件當天；
只看大意外值；個股自己的因子敏感度（去掉前視偏誤後與板塊 × β 差不多）。美股的收盤到收盤方向在所有組合都沒通過；
改用開盤跳空（免費的日線開盤價，等於只看開盤前公布事件的反應）後明顯改善，但 50% 切分還差一點，暫不使用。

## 研究文獻檢驗（2026-10）

| 項目 | 結果 | 處理 |
|---|---|---|
| FOMC 會前漂移（Lucca & Moench） | 台股決議前一天 t 1.05，後半期消失 | 不使用，可信度表列出 |
| 長期波動、EPU、TPU 當放大器 | 前後半期穩定但小於 1（大盤波動大時板塊超額反應相對變小） | 不使用 |
| 外資台指期淨未平倉 5 日變化 | 放大器 ×1.12（t 6.0，2023-11 起） | 加入放大器 |
| 外資台指期未平倉變化預測隔日方向 | 樣本內 β 穩定，樣本外照方向押約 0 | 不使用 |
| 美國政府貿易／關稅行動 | 台股「升級」時板塊方向兩任期相關 0.53；美股 −0.32 | 頁面面板；只對台股給方向 |
| 貿易行動 × 個別台股 ETF | 兩期相關 −0.38（很多 ETF 第一任時還沒上市），不能重現 | 雷達不顯示方向 |
| 個股法說會窗口波動 | ×1.08（t 15，24,618 場），前後半期都大於 1 | 標的池個股的法說事件 |
| 開盤跳空當反應窗（前一日收盤 → 當日開盤） | 台股逐對方向 40／50／60／70% 切分 t 2.4／2.6／2.0／1.5（通過）；美股 0.3／1.9／3.9／3.2（50% 未達，暫不使用） | 台股方向優先用跳空模型；美股每天重新檢驗 |
| 個股自己的因子敏感度 | 去掉前視偏誤後與板塊 × β 差不多 | 不使用 |
| 經濟部外銷訂單 | 公開列表只有近一年發布日、標題無數值 | 暫不加入 |
| 美國財政部匯率報告 | 一年兩次、無固定排程，十年約 20 次，樣本太少 | 暫不加入 |

## 可信度（前後半期檢驗）

`calibrate.py` 把事件分成前後兩半各估一次，檢查結果能不能重現，結果寫在 `credibility`，頁面體檢頁直接顯示：

| 項目 | 結果 | 頁面怎麼用 |
|---|---|---|
| 個股對板塊 β | 前後期相關約 0.7，可信 | 板塊 → 個股的傳導權重 |
| 各類事件的整體波動倍數 | 前後半期相關約 0.4，部分可信 | 事件 → 板塊的傳導強度（× 板塊平常波動） |
| 放大器 | 前後半期都大於 1，倍數會變 | 只連到目前狀態異常的板塊 |
| 事件 → 板塊漲跌方向（逐對） | 10 年資料：前半期顯著、後半期同向約 58%～64%，仍不穩定 | 只當歷史描述顯示，不決定強度 |
| 方向的兩段式因子模型 | 台股樣本外照方向押平均 +0.085%／事件（t 2.6）；美股未通過 | 只在樣本外通過的市場顯示方向，其餘標「方向無法預測」；每天重新檢驗 |
| 巨觀環境 × 板塊 | 前後半期排序相關為負，不可信 | 只當歷史描述顯示 |

校準結果明顯縮水（例如資料來源壞掉）時，`calibrate.py` 不覆蓋上一份輸出。

## 自動更新

`.github/workflows/twflow-daily.yml` 每個交易日盤後，在官方日線更新後依序執行
`gen_twall.py` → `fetch_calendar.py` → `gen_usall.py` → `fetch_tw_macro.py` → `fetch_policy.py` → `fetch_conf.py` → `fetch_hist.py` → `calibrate.py`。
`econ_cal.json` 與 `twall.json` 進 repo；Yahoo 長歷史放 Actions cache（`/tmp/capsule_cache`）。
任何一步失敗都沿用上一份資料，不會擋住其他盤後更新。頁面開啟時會抓 GitHub Pages 上的最新檔案。

## 手動

```bash
python -X utf8 tools/capsule/gen_twall.py twflow tools/capsule/twall.json
python -X utf8 tools/capsule/fetch_calendar.py
python -X utf8 tools/capsule/gen_usall.py
python -X utf8 tools/capsule/fetch_tw_macro.py
python -X utf8 tools/capsule/fetch_hist.py tools/capsule/cache
python -X utf8 tools/capsule/calibrate.py . twflow/web/data/capsule_calib.json tools/capsule/cache
python -X utf8 tools/capsule/build.py
```

`fetch_calendar.py` 也抓 BEA（PCE）與 Census（零售銷售）的官方發布時間表、Nasdaq 個股下次財報日，補上 Nasdaq 行事曆 3 週以外的日期。第一次會回補 2016-04 起的全部日期（Nasdaq 會限流，約半小時），之後每天只重抓最近 10 天與未來 120 天。

## 需要人工維護

- `calibrate.py` 的 `FOMC_FALLBACK`：Nasdaq 行事曆有 FOMC 時不會用到；每年初核對一次即可。
- `gen_usall.py` 的產業對應規則：Nasdaq 沒有原物料、不動產對應的板塊，暫時分別歸到「電氣設備」與「資產管理」。
