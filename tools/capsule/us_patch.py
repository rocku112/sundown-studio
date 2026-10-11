# 由 build.py 以 exec 載入（在 calib_patch 之後）：美股收盤價改用 usflow 每日抓的 Nasdaq 全市場報價
_us = _json.loads((REPO / 'twflow/web/data/us/all.json').read_text(encoding='utf-8'))
_us_px = {r[0]: [r[3], round(r[4], 2) if r[4] is not None else 0, r[5]] for r in _us['rows'] if r[3]}
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
  const put=x=>{const v=map[x.id.replace(".","-")]; if(!v||!v[0])return; x.px=v[0]; x.chg=v[1]||0; x.real=true;
    if(v[2]>0)x.w=clamp(Math.round(Math.log10(v[2])*21),5,100);   /* 影響力＝市值（億美元）取對數 */
    n++;};
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
板塊資金流：台股為三大法人近 5 日買賣超、美股為近 5 日超額報酬；β、分布區間、放大器見「統計 · 實證」。`;
  $("#dataChip").classList.toggle("live",PX_SRC==="線上最新"&&US_SRC==="線上最新");''')

rep('''async function refreshLive(){''', '''async function refreshUs(){
  try{
    const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),10000);
    const r=await fetch(USALL_URL,{signal:ctl.signal,cache:"no-cache"}); clearTimeout(tm);
    if(!r.ok)throw new Error("HTTP "+r.status);
    const j=await r.json();
    if(!j||!Array.isArray(j.rows)||!j.date)throw new Error("格式不符");
    if(j.date<US_DATE){US_SRC="內嵌快照（線上版較舊）";updateDataChip();return;}
    const map={}; j.rows.forEach(x=>{if(x[3])map[x[0]]=[x[3],x[4]==null?0:+(+x[4]).toFixed(2),x[5]]});
    applyUsPx(map); US_DATE=j.date; US_SRC="線上最新";
    buildGraph(); refreshPoolViews(); updateDataChip();
  }catch(e){ US_SRC="內嵌快照（無法連線："+(e.name==="AbortError"?"逾時":e.message)+"）"; updateDataChip(); }
}
async function refreshLive(){''')
rep('''updateDataChip(); refreshLive(); updateCalChip(); refreshCal();''',
    '''updateDataChip(); refreshLive(); refreshUs(); updateCalChip(); refreshCal();''')

# ── 全美股搜尋：清單（gen_usall.py，Nasdaq 選股器＋產業對應板塊）在頁面開啟後背景讀取；
#    選到的代號才加進資料庫，並記在瀏覽器裡，重新整理後仍在標的池 ──
rep('''applyUsPx(US_SNAP.px);''', '''const USX_KEY="tcapsule.usx.v1", USALL_LIST_URL="https://rocku112.github.io/sundown-studio/twflow/web/data/capsule_usall.json";
let USALL=[], US_MAP=US_SNAP.px;
function usxNode(r){return {id:r.id,n:r.n,ind:INDBY[r.ind]?r.ind:"us_etf",w:r.w,px:0,chg:0,kind:r.kind,etf:r.kind>0,
  inv:/Bear|Inverse|Short|-1X/i.test(r.n),lev:r.kind===2?2.4:1,mkt:"us",auto:true};}
try{const a=JSON.parse(localStorage.getItem(USX_KEY)||"[]"); if(Array.isArray(a))a.forEach(r=>{if(r&&r.id&&!MASTER_US.some(x=>x.id===r.id))MASTER_US.push(usxNode(r))});}catch(e){}
function addUsx(id){
  const r=USALL.find(x=>x.id===id); if(!r||LOOKUP[id])return false;
  MASTER_US.push(usxNode(r)); applyUsPx(US_MAP);
  try{const a=JSON.parse(localStorage.getItem(USX_KEY)||"[]"); a.push(r); localStorage.setItem(USX_KEY,JSON.stringify(a.slice(-200)));}catch(e){}
  return true;
}
async function loadUsAll(){
  try{
    const r=await fetch(USALL_LIST_URL,{cache:"no-cache"}); if(!r.ok)throw 0;
    const j=await r.json();
    USALL=j.data.split("\\n").map(l=>{const a=l.split("|"); return {id:a[0],n:a[1],kind:+a[2],ind:a[3],w:+a[4]}});
  }catch(e){USALL=[];}
}
applyUsPx(US_SNAP.px);''')
rep('''    applyUsPx(map); US_DATE=j.date; US_SRC="線上最新";''', '''    US_MAP=map; applyUsPx(map); US_DATE=j.date; US_SRC="線上最新";''')
rep('''updateDataChip(); refreshLive(); refreshUs(); updateCalChip(); refreshCal();''',
    '''updateDataChip(); refreshLive(); refreshUs(); updateCalChip(); refreshCal(); loadUsAll();''')
# 搜尋同時找全美股清單；選到不在資料庫的代號時先加入
rep('''  out.sort((a,b)=>a[0]-b[0]||(b[1].w||0)-(a[1].w||0));
  return out.slice(0,8).map(x=>x[1]);''', '''  for(const s of USALL){
    if(LOOKUP[s.id.toUpperCase()])continue;
    const id=s.id.toUpperCase(), n=s.n.toUpperCase();
    const sc=id===q?0:id.startsWith(q)?1:n.startsWith(q)?2:n.includes(q)?3:-1;
    if(sc>=0)out.push([sc+.5,{...s,mkt:"us",etf:s.kind>0,usx:true}]);
  }
  out.sort((a,b)=>a[0]-b[0]||(b[1].w||0)-(a[1].w||0));
  return out.slice(0,8).map(x=>x[1]);''')
rep('''      <em>${s.mkt==="tw"?(INDBY[s.ind]?INDBY[s.ind].n:""):"美股"}${s.etf?" · ETF":""}${poolHas(s.id)?" · 已在池內":""}</em></button>`).join("");''',
    '''      <em>${s.mkt==="tw"?(INDBY[s.ind]?INDBY[s.ind].n:""):"美股 · "+(INDBY[s.ind]?INDBY[s.ind].n:"")}${s.etf?" · ETF":""}${poolHas(s.id)?" · 已在池內":""}</em></button>`).join("");''')
rep('''function pickSug(id){ $("#poolInput").value=id; sugEl.hidden=true; addTicker(); $("#poolInput").focus(); }''',
    '''function pickSug(id){ if(!LOOKUP[id.toUpperCase()]&&addUsx(id))buildGraph();
  $("#poolInput").value=id; sugEl.hidden=true; addTicker(); $("#poolInput").focus(); }''')
rep('''台股全部上市櫃股票與 ETF 都能搜尋，打代號或名稱就會跳出選項；美股內建約 180 檔，其他美股可自訂板塊加入。上限 30 檔。''',
    '''台股全部上市櫃股票與 ETF、美股市值 10 億美元以上的股票與全部 ETF 都能搜尋，打代號或名稱就會跳出選項。上限 30 檔。''')
