# 落霞千頁 · SunDown Studio 文件工具

純本機（不上傳伺服器）的 PDF／圖片工具套件，10 個工具，部署於 GitHub Pages。

## 結構

單一 HTML 進入點 + 外部 JS/CSS（無 build step，`<script src>` / `<link>` 直接載入，GitHub Pages 直接服務）。

```
index.html            進入點：landing page + 各工具面板 HTML + 小膠水腳本
css/
  app.css             App 主樣式
  landing.css         首頁樣式
js/
  core.js             共用 helper（switchTab/toast/dlBlob/parsePageRange/ensurePdfLib…）
                      + 工具 1–6：PDF→JPG、HEIC、圖片壓縮、尺寸調整、PDF 合併拆分、PDF 壓縮
  tool-mix.js         工具 7：混合合併 PDF（prefix mx）
  tool-pageman.js     工具 8：PDF 頁面管理（prefix pm）
  tool-watermark.js   工具 9：PDF 浮水印（prefix wm）
  tool-annotate.js    工具 10：標註/簽名/圖章/改字（prefix an）
  app.js              launchTool、hash routing、鍵盤快捷鍵、CHAIN_MAP/showChain、範例載入
test.html             自動化測試頁（見下）
test-suite.js         測試案例
```

**載入順序很重要**：`core.js` 先，各 `tool-*.js`，最後 `app.js`。都是 classic script，依文件順序執行、共用全域作用域（top-level `const`/`let` 跨檔可用、`function` 宣告掛在 window）。改動時保持 `<script src>` 在原位即可維持既有行為。

外部相依：**已自架於 `vendor/`**（不依賴 CDN，離線/CDN 故障也能用）——pdf.js 3.11（含 pdf.worker）、jszip、FileSaver、lucide、pdf-lib 1.17（`ensurePdfLib()` 懶載入，local 優先、cdnjs 為後備）、heic2any。更新版本＝換掉 `vendor/` 對應檔＋改引用的版本字串。唯一仍走外部的是 Google Fonts CSS（純字型，被擋時自動退回系統字型，不影響功能）。

## 測試

直接用瀏覽器開 `test.html`（需經 http，非 file://；本機可 `python -m http.server` 後開 `/tools/luoxia/test.html`）。它會在隱藏 iframe 載入真實 `index.html`，把 `test-suite.js` 注入其作用域執行，顯示 PASS/FAIL 表。涵蓋：分頁切換、頁碼解析、頁面管理/浮水印/標註/混合合併的匯出（頁數、旋轉、嵌圖）、改字偵測與還原、縮放數學、字體偵測、壓縮/縮放邏輯邊界。

注意：pdf.js 的 `page.render()` 畫到 canvas 在某些無頭環境會 hang，因此測試以 stub（如 `pmThumbFor`）或直接設定狀態的方式避開實際渲染，只驗證資料邏輯與 pdf-lib 匯出。

## 新增工具時要同步的地方

`switchTab` valid 陣列、hash 路由 valid、`TAB_KEYS`、Enter `btnMap`、Escape `clrMap`、`CHAIN_MAP`、`showChain` bannerId、首頁 `.tc` 卡片、以及「N 種工具」計數（含 og:description）。
