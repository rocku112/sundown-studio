# GitHub 高星開源投資工具評估：台股 / 美股適用性

> 資料來源：GitHub API（`gh api search/repositories` + 各 repo README 掃描），2026-10-24 擷取。
> 範圍：以 18 組英文關鍵字（quant / backtesting / trading bot / portfolio / LLM finance…）與 10 組台股關鍵字搜尋，星數 >300（台股類 >50），去重後約 300 個 repo，再人工篩選。
> 星數僅代表熱度，不代表品質或獲利能力；部分 repo 有刷星疑慮。

---

## 一、結論速覽

| 用途 | 台股首選 | 美股首選 | 兩市通用 |
|---|---|---|---|
| 行情/基本面資料 | **FinMind**、TWSE OpenAPI（TWSEMCPServer） | **yfinance**、OpenBB、alpaca-py | yfinance（`2330.TW` / `6488.TWO`） |
| 回測引擎 | — | QuantConnect Lean | **vectorbt**、bt、backtesting.py、nautilus_trader |
| 績效 / 風險報表 | — | — | **quantstats**、Riskfolio-Lib、skfolio、PyPortfolioOpt |
| 技術指標 | — | — | **TA-Lib**、ta |
| 因子 / ML 研究 | — | — | **microsoft/qlib**、RD-Agent |
| LLM 投研 / 日報 | daily_stock_analysis（有 .TW）、Vibe-Trading | TradingAgents、ai-hedge-fund、dexter | TradingAgents（台股資料較薄） |
| 自動下單 | **Shioaji**（永豐官方） | **alpaca-py**、**ib_async**（IBKR）、Lumibot | IBKR 可同時交易台美 |
| 前端圖表 | — | — | **tradingview/lightweight-charts** |

---

## 二、台股可直接使用

| Repo | ⭐ | 授權 | 最近更新 | 評估 |
|---|---:|---|---|---|
| [FinMind/FinMind](https://github.com/FinMind/FinMind) | 2,855 | Apache-2.0 | 2026-10-24 | 台股資料最完整的開源 API：日K、三大法人、融資券、月營收、財報、股利、期貨選擇權。免費額度有每小時次數限制，量大需付費。**最推薦的台股資料源。** |
| [mlouielu/twstock](https://github.com/mlouielu/twstock) | 1,528 | MIT | 2026-06-23 | 直接爬 TWSE/TPEx，輕量、含即時盤。爬太快會被證交所暫時封鎖 IP，適合少量查詢。 |
| [Sinotrade/Shioaji](https://github.com/Sinotrade/Shioaji) | 526 | 未標示 | 2026-10-20 | 永豐金證券官方 API，台股/期貨/選擇權下單與即時 tick。需永豐帳戶；有模擬環境。另有 [shioaji-pro-app](https://github.com/Sinotrade/shioaji-pro-app)（AGPL 交易終端）。 |
| [twjackysu/TWSEMCPServer](https://github.com/twjackysu/TWSEMCPServer) | 180 | MIT | 2026-10-22 | 把 TWSE / TPEx / TAIFEX OpenAPI 包成 MCP Server，可讓 Claude 直接查台股官方資料。 |
| [Timeverse/My-TW-Coverage](https://github.com/Timeverse/My-TW-Coverage) | 567 | MIT | 2026-03-25 | 1,735 家上市櫃公司的業務概述與供應鏈關係，適合做產業鏈/題材分類。 |
| [mars-tw/anti-gambling-trader-tw](https://github.com/mars-tw/anti-gambling-trader-tw) | 1,125 | MIT | 2026-10-09 | 交易紀錄本機分析 + PaperBroker 模擬，支援永豐/富邦/Alpaca/IBKR。可用來檢討自己的交易習慣。 |
| [xang1234/stock-screener](https://github.com/xang1234/stock-screener) | 395 | Apache-2.0 | 2026-10-22 | CANSLIM / Minervini 選股，支援含台灣在內 12 個市場。 |
| [catcat222222/twchips](https://github.com/catcat222222/twchips) | 73 | MIT | 2026-08-16 | 期交所三大法人、證交所法人與融資券的小工具，籌碼面輕量補充。 |
| [voidful/tw_stocker](https://github.com/voidful/tw_stocker) | 197 | 未標示 | 2026-07-16 | 每日自動更新的台股歷史資料庫（GitHub 上直接拿 CSV）。 |

**台股回測注意事項**（多數國外框架預設不處理，需自行設定）：
- 手續費 0.1425%（可折讓）、證交稅 0.3%（當沖 0.15%、ETF 0.1%）
- 漲跌停 ±10%：漲停買不到、跌停賣不掉，回測需模擬成交失敗
- 除權息還原價、零股與整張（1,000 股）單位、T+2 交割
- 上市 `.TW` 與上櫃 `.TWO` 代碼不同（yfinance）

---

## 三、美股可直接使用

| Repo | ⭐ | 授權 | 最近更新 | 評估 |
|---|---:|---|---|---|
| [ranaroussi/yfinance](https://github.com/ranaroussi/yfinance) | 25,596 | Apache-2.0 | 2026-10-22 | 免費 Yahoo 行情，美股與台股皆可。非官方 API，偶爾因 Yahoo 改版失效；Yahoo 條款限個人用途。 |
| [OpenBB](https://github.com/openbq-org/OpenBB) | 74,610 | 自訂 | 2026-10-24 | 整合數十個資料供應商的研究平台，美股覆蓋最好。⚠ API 回傳的 owner 為 `openbq-org`（原 `OpenBB-finance` 重新導向），安裝請以 PyPI 官方 `openbb` 套件為準並確認來源。 |
| [alpacahq/alpaca-py](https://github.com/alpacahq/alpaca-py) | 1,567 | Apache-2.0 | 2026-10-23 | Alpaca 官方 SDK，美股零佣金、免費 paper trading。舊版 alpaca-trade-api-python 已封存。 |
| [ib-api-reloaded/ib_async](https://github.com/ib-api-reloaded/ib_async) | 1,768 | BSD-2 | 2026-10-23 | IBKR API 的 Python 封裝（取代已封存的 ib_insync）。IBKR 可交易美股及台股。 |
| [Lumiwealth/lumibot](https://github.com/Lumiwealth/lumibot) | 2,159 | GPL-3.0 | 2026-10-24 | 回測 → paper → 實盤同一套程式碼，支援 Alpaca / IBKR 等 12 家券商。 |
| [QuantConnect/Lean](https://github.com/QuantConnect/Lean) | 22,186 | Apache-2.0 | 2026-10-23 | 專業級事件驅動引擎，美股資料可透過 QC 雲端取得；台股需自備資料。 |
| [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) | 64,205 | MIT | 2026-10-24 | 多個「投資大師」LLM 代理投票決策的教學專案。僅美股，資料用 financialdatasets（多數代號需付費）。學習用，不建議實盤。 |
| [virattt/dexter](https://github.com/virattt/dexter) | 27,710 | 未標示 | 2026-09-23 | 自主財報研究代理，美股為主。 |
| [simonlin1212/global-stock-data](https://github.com/simonlin1212/global-stock-data) | 1,769 | Apache-2.0 | 2026-10-23 | 美股/全球資料工具包，官方源優先、免金鑰，並標註合規等級。 |

---

## 四、市場中立工具（台美都能用，需自備資料）

### 回測引擎
| Repo | ⭐ | 授權 | 評估 |
|---|---:|---|---|
| [polakowo/vectorbt](https://github.com/polakowo/vectorbt) | 9,508 | Apache-2.0 + Commons Clause | 向量化回測，參數掃描極快。**Commons Clause 禁止商業販售**。 |
| [pmorissette/bt](https://github.com/pmorissette/bt) | 3,000 | MIT | 資產配置 / 再平衡型策略最順手，授權最寬鬆。 |
| [kernc/backtesting.py](https://github.com/kernc/backtesting.py) | 9,124 | AGPL-3.0 | 單一標的策略易上手，附互動圖表。AGPL 對對外服務有開源義務。 |
| [nautechsystems/nautilus_trader](https://github.com/nautechsystems/nautilus_trader) | 30,701 | LGPL-3.0 | Rust 核心、回測與實盤一致，支援 IBKR。學習曲線陡。 |
| [edtechre/pybroker](https://github.com/edtechre/pybroker) | 3,653 | 自訂 | 偏 ML 策略、內建 walk-forward。 |
| [stefan-jansen/zipline-reloaded](https://github.com/stefan-jansen/zipline-reloaded) | 1,971 | Apache-2.0 | Quantopian Zipline 的維護分支（原版已停更）。 |
| [mementum/backtrader](https://github.com/mementum/backtrader) | 23,557 | GPL-3.0 | 星數高但 2024-08 後停更，新專案不建議。 |

### 績效、風險與投組最佳化
- [ranaroussi/quantstats](https://github.com/ranaroussi/quantstats)（7.7k，Apache）：一行產生 Sharpe、最大回撤、月報酬熱圖 HTML 報告。**最實用。**
- [dcajasn/Riskfolio-Lib](https://github.com/dcajasn/Riskfolio-Lib)（4.6k，BSD）、[skfolio](https://github.com/skfolio/skfolio)（2.5k，BSD）、[PyPortfolioOpt](https://github.com/PyPortfolio/PyPortfolioOpt)（6.1k，MIT）：效率前緣、風險平價、HRP、Black-Litterman。
- [quantopian/alphalens](https://github.com/quantopian/alphalens)（4.5k）：因子 IC 分析，已停更但仍可用。

### 技術指標
- [TA-Lib/ta-lib](https://github.com/TA-Lib/ta-lib)（BSD，C 核心）：業界標準，150+ 指標與 K 線型態。
- [bukosabino/ta](https://github.com/bukosabino/ta)（5.2k，MIT）：純 pandas，免編譯。
- [mpquant/MyTT](https://github.com/mpquant/MyTT)（2.9k）：通達信公式移植，但**未標示授權**，商用有風險。

### 因子 / AI 研究
| Repo | ⭐ | 評估 |
|---|---:|---|
| [microsoft/qlib](https://github.com/microsoft/qlib) | 49,650 | AI 量化研究平台（資料層 → 因子 → 模型 → 回測）。內建 CN/US 資料，**台股需自行轉檔匯入**（可用 FinMind 日K）。 |
| [microsoft/RD-Agent](https://github.com/microsoft/RD-Agent) | 15,034 | 以 LLM 自動提出、實作、驗證因子，跑在 qlib 上。 |
| [shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos) | 43,515 | K 線基礎模型。可當特徵或輔助訊號，**不宜直接當買賣依據**。 |
| [google-research/timesfm](https://github.com/google-research/timesfm) / [chronos-forecasting](https://github.com/amazon-science/chronos-forecasting) | 34.8k / 6.2k | 通用時序預測模型，用於成交量、營收等較平穩序列比預測股價更合理。 |
| [AI4Finance FinRL](https://github.com/AI4Finance-Foundation/FinRL) / [FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) | 16.8k / 21.5k | 強化學習交易 / 金融 LLM，學術導向，實務落差大。 |

### LLM 投研代理
| Repo | ⭐ | 台股 | 評估 |
|---|---:|:---:|---|
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | 113,524 | △ | 分析師／多空辯論／風控多代理架構。資料走 yfinance / Alpha Vantage，台股可輸入 `.TW`，但新聞與基本面來源以美股為主。 |
| [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) | 66,971 | ✓ | LLM 每日個股分析＋推播，README 明示支援台股 `.TW` 與美股；可用 GitHub Actions 零成本定時跑。 |
| [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | 36,482 | ✓ | 個人交易代理，提及台灣市場，串 Alpaca / IBKR。 |
| [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) | 3,243 | ✗ | Claude Code 用的美股分析 skills，可直接裝來用。 |

---

## 五、不適用或不建議

| 類別 | 代表 repo | 原因 |
|---|---|---|
| 加密貨幣專用 | freqtrade (55.8k)、ccxt (44.5k)、hummingbot、jesse、OctoBot、passivbot | 只接加密交易所，無股票券商介面。 |
| 中國 A 股專用 | akshare (23k)、vnpy (46k)、rqalpha、efinance、jqdatasdk、hikyuu、a-stock-data | 資料源與券商介面以 A 股 / CTP 為主。vnpy 雖有 IB 介面，但生態與文件都在 A 股。 |
| 已封存 / 停更 | quantopian/zipline、pyalgotrade、ib_insync、alpaca-trade-api-python、Stock-Prediction-Models、gekko | 改用上方列出的維護分支或後繼專案。 |
| 「LSTM 預測股價」教學 | LSTM-Neural-Network…、stock-rnn、StockPricePrediction 等 | 常見 look-ahead bias 與過度擬合，僅適合學習。 |
| ⚠ 高風險 | solana-copy-sniper-mev-trading-bot（4.5k） | 「免費 MEV 狙擊機器人」是常見的竊取私鑰／惡意程式手法，勿執行。 |

---

## 六、對本專案（sundown-studio）的建議

目前 `twflow` / `usflow` / `swing` 以 `requests + numpy` 自建資料與指標，每日由排程 commit 資料。可依成本由低到高逐步引入：

1. **補強資料源**：台股加 FinMind（法人、融資券、月營收），美股維持 yfinance；可裝 TWSEMCPServer 讓 Claude 直接查官方資料。
2. **績效報表**：swing 策略結果接 quantstats，直接產出 HTML 報告放上網站。
3. **參數掃描回測**：vectorbt 適合快速掃描 swing 的參數組合（注意 Commons Clause：網站若收費，改用 bt）。
4. **前端圖表**：web 頁面可用 lightweight-charts 取代自繪 K 線。
5. **LLM 日報**：參考 daily_stock_analysis / TradingAgents 的多代理提示詞架構，產生每日台美股盤後評論。
6. **實盤（可選）**：台股走 Shioaji，美股走 alpaca-py（先跑 paper trading）。

**授權提醒**：網站若有商業化計畫，避開 AGPL（backtesting.py、OpenStock）、GPL（backtrader、Lumibot、freqtrade）、Commons Clause（vectorbt）及未標示授權（MyTT、Shioaji 範例碼）的程式碼直接嵌入；MIT / Apache / BSD 類最安全。

---

*本文為開源工具技術評估，不構成投資建議。*
