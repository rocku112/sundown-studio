# ETF 除權息雷達

頁面發布在 Claude Artifact（https://claude.ai/artifact/BitWq85HpM9ZxQQKtSGXBd）。

- `orig.html`、`style.css`、`build.py`：原始頁面與 SunDown 樣式
- `real_patch.py`：資料改用 `twflow/web/data/capsule_calib.json`（市場傳導艙的每日校準輸出）與 `tools/capsule/twall.json`
  - 準備除息：證交所 TWT48U、櫃買中心除權除息預告
  - 近期已除息：證交所 TWT49U、櫃買中心除權除息計算結果，對照最新收盤價判斷填息
  - 總經事件：傳導艙的官方排程；事件 × ETF：過去 5 年事件研究（方向未通過前後半期檢驗，只描述過去）

```bash
python -X utf8 tools/radar/build.py   # 輸出 tools/radar/dist/index.html
```

頁面開啟時會抓 GitHub Pages 上最新的 `capsule_calib.json` 與 `tw_all.json`；資料由 `twflow-daily.yml` 每個交易日盤後更新。
