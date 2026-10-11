# 由 build.py 以 exec 載入（在 calib_patch 之後）：美股收盤價改用 usflow 每日抓的 Nasdaq 全市場報價
_us = _json.loads((REPO / 'twflow/web/data/us/all.json').read_text(encoding='utf-8'))
_us_px = {r[0]: [r[3], round(r[4], 2) if r[4] is not None else 0] for r in _us['rows'] if r[3]}
# 只內嵌頁面內建／方舟觀測池會用到的代號；完整清單在頁面開啟時線上抓
_need = set(re.findall(r'\["([A-Z][\w.]*)","[^"]+","us_\w+"', src))   # MASTER_US＋方舟觀測池 ARK_US
_snap = {k: v for k, v in _us_px.items() if k in {x.replace('.', '-') for x in _need}}

rep('''mergeTwRows(parseTwAll(TW_ALL.data));''', '''mergeTwRows(parseTwAll(TW_ALL.data));

/* ════════ 美股收盤（usflow 每日管線：Nasdaq 官網選股器，涵蓋 NASDAQ／NYSE／NYSE American）════
   內嵌頁面用到的代號；開啟時抓 GitHub Pages 上的完整清單，自訂加入的美股也會補上價格。
   代號用 Yahoo 格式（BRK-B），頁面內是 BRK.B。 */
const US_SNAP={date:''' + _json.dumps(_us['date']) + ''',px:''' + _json.dumps(_snap, separators=(',', ':')) + '''};
const USALL_URL="https://rocku112.github.io/sundown-studio/twflow/web/data/us/all.json";
let US_DATE=US_SNAP.date, US_SRC="內嵌快照";
function applyUsPx(map){
  let n=0;
  const put=x=>{const v=map[x.id.replace(".","-")]; if(!v||!v[0])return; x.px=v[0]; x.chg=v[1]||0; x.real=true; n++;};
  // Nasdaq 清單裡找不到的內建代號（已併購／下市）不再顯示舊的示意價
  MASTER_US.forEach(x=>{put(x); if(!x.real)x.px=0;});
  CUSTOM.forEach(c=>{if(c.mkt==="us")put(c)});
  rebuildMaster(); return n;
}
applyUsPx(US_SNAP.px);''')

# 自訂標的帶上「真實價格」旗標
rep('''kind:c.etf?1:0,etf:!!c.etf,lev:c.lev||1,mkt:c.mkt,custom:true};''',
    '''kind:c.etf?1:0,etf:!!c.etf,lev:c.lev||1,mkt:c.mkt,custom:true,real:!!c.real};''')

# 頂欄徽章：台美兩個收盤日期
rep('''  t.textContent=`收盤 ${PX_DATE.slice(5).replace("-","/")}`;
  $("#dataChip").title=`台股收盤價：${PX_SRC}（${PX_DATE}，來源 twflow／證交所＋櫃買中心）。
美股報價、板塊資金流與籌碼仍為示意；β 與分布區間見「統計 · 實證」。`;
  $("#dataChip").classList.toggle("live",PX_SRC==="線上最新");''',
'''  const md=s=>s.slice(5).replace("-","/");
  t.textContent=`收盤 台${md(PX_DATE)}・美${md(US_DATE)}`;
  $("#dataChip").title=`台股收盤價：${PX_SRC}（${PX_DATE}，證交所＋櫃買中心，經 twflow 每日管線）。
美股收盤價：${US_SRC}（美東 ${US_DATE}，Nasdaq 官網選股器，經 usflow 每日管線）。
板塊資金流與籌碼仍為示意；β 與分布區間見「統計 · 實證」。`;
  $("#dataChip").classList.toggle("live",PX_SRC==="線上最新"&&US_SRC==="線上最新");''')

rep('''async function refreshLive(){''', '''async function refreshUs(){
  try{
    const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),10000);
    const r=await fetch(USALL_URL,{signal:ctl.signal,cache:"no-cache"}); clearTimeout(tm);
    if(!r.ok)throw new Error("HTTP "+r.status);
    const j=await r.json();
    if(!j||!Array.isArray(j.rows)||!j.date)throw new Error("格式不符");
    if(j.date<US_DATE){US_SRC="內嵌快照（線上版較舊）";updateDataChip();return;}
    const map={}; j.rows.forEach(x=>{if(x[3])map[x[0]]=[x[3],x[4]==null?0:+(+x[4]).toFixed(2)]});
    applyUsPx(map); US_DATE=j.date; US_SRC="線上最新";
    buildGraph(); refreshPoolViews(); updateDataChip();
  }catch(e){ US_SRC="內嵌快照（無法連線："+(e.name==="AbortError"?"逾時":e.message)+"）"; updateDataChip(); }
}
async function refreshLive(){''')
rep('''updateDataChip(); refreshLive(); updateCalChip(); refreshCal();''',
    '''updateDataChip(); refreshLive(); refreshUs(); updateCalChip(); refreshCal();''')
