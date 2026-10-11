# 由 build.py 以 exec 載入：全台股清單、真實收盤價、線上更新、搜尋式選股
import json as _json
_tw = _json.loads((d / 'twall.json').read_text(encoding='utf-8'))

# 1) 內嵌全市場資料 ＋ 合併進主資料庫（在方舟觀測池之後，讓官方收盤價覆蓋舊快照）
rep('''applyArk();
const arkUniverse=''', '''applyArk();

/* ════════ 全市場清單（twflow 每日管線：證交所＋櫃買中心收盤資料）════
   上市櫃股票、ETF、存託憑證共 ''' + str(_tw['data'].count('\n') + 1) + ''' 檔。
   · 內建清單保留手動設定的板塊與影響力，收盤價與漲跌幅改用官方收盤資料
   · 其餘標的依「產業價值鏈資訊平台」的分類自動對應到 36 個板塊
   · 影響力以當日成交值換算（5–40），刻意低於手選的權值股
   · 頁面開啟時會去抓 GitHub Pages 上 twflow 的最新收盤檔；抓不到就用內嵌快照
   欄位：代號|名稱|型別(0股1ETF2槓桿反向)|板塊|影響力|收盤|漲跌%
   ════════════════════════════════════════════════════════════ */
const TW_ALL={date:''' + _json.dumps(_tw['date']) + ''',data:''' + _json.dumps(_tw['data'], ensure_ascii=False) + '''};
const TWALL_URL="https://rocku112.github.io/sundown-studio/twflow/web/data/tw_all.json";
let PX_DATE=TW_ALL.date, PX_SRC="內嵌快照";
function mergeTwRows(rows){
  const by={}; MASTER_TW.forEach(x=>by[x.id]=x);
  let add=0;
  rows.forEach(([id,n,kind,ind,w,px,chg])=>{
    const hit=by[id];
    if(hit){ if(px!==null&&px!==undefined){hit.px=px; hit.chg=chg==null?0:chg; hit.real=true;} return; }
    if(!INDBY[ind])ind="tw_etc";
    const x={id,n,ind,w,px:px||0,chg:chg||0,kind,etf:kind>0,inv:/反/.test(n),
             lev:kind===2?2.0:1,mkt:"tw",u:1,real:px!=null};
    MASTER_TW.push(x); by[id]=x; add++;
  });
  rebuildMaster(); return add;
}
const parseTwAll=s=>s.split("\\n").map(l=>{const a=l.split("|");
  return [a[0],a[1],+a[2],a[3],+a[4],a[5]===""?null:+a[5],a[6]===""?null:+a[6]]});
mergeTwRows(parseTwAll(TW_ALL.data));
const arkUniverse=''')

# 2) 開啟時抓最新收盤檔
rep('''/* ── 啟動 ── */''', '''/* ── 線上更新：抓 twflow 在 GitHub Pages 上的最新收盤檔 ── */
function updateDataChip(){
  const t=$("#dataTxt"); if(!t)return;
  t.textContent=`收盤 ${PX_DATE.slice(5).replace("-","/")}`;
  $("#dataChip").title=`台股收盤價：${PX_SRC}（${PX_DATE}，來源 twflow／證交所＋櫃買中心）。
美股報價、板塊資金流、籌碼與 β／分布區間等統計仍為示意。`;
  $("#dataChip").classList.toggle("live",PX_SRC==="線上最新");
}
async function refreshLive(){
  try{
    const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),6000);
    const r=await fetch(TWALL_URL,{signal:ctl.signal,cache:"no-cache"}); clearTimeout(tm);
    if(!r.ok)throw new Error("HTTP "+r.status);
    const j=await r.json();
    if(!j||!Array.isArray(j.rows)||!j.date)throw new Error("格式不符");
    if(j.date<PX_DATE){PX_SRC="內嵌快照（線上版較舊）";updateDataChip();return;}
    const rows=j.rows.filter(x=>x[2]==="s"||x[2]==="e"||x[2]==="d").map(([id,n,t,m,px,chg,vol])=>{
      const lev=t==="e"&&/正2|反1|反向|槓桿/.test(n);
      const tt=(vol||0)*1000*(px||0);
      return [id,n,t==="e"?(lev?2:1):0,guessIndTW(id),tt>0?clamp(Math.round((Math.log10(tt)-6)*9),5,40):5,px,chg];
    });
    mergeTwRows(rows); PX_DATE=j.date; PX_SRC="線上最新";
    buildGraph(); refreshPoolViews(); updateDataChip();
  }catch(e){ PX_SRC="內嵌快照（無法連線："+(e.name==="AbortError"?"逾時":e.message)+"）"; updateDataChip(); }
}

/* ── 啟動 ── */''')
rep('''tickClock(); setInterval(tickClock,1000);''', '''tickClock(); setInterval(tickClock,1000);
updateDataChip(); refreshLive();''')

# 3) 頂欄：資料日期徽章取代「示意資料」
rep('<span class="chip demo"><span class="dot"></span>示意資料</span>',
    '<span class="chip demo" id="dataChip"><span class="dot"></span><b id="dataTxt">收盤 —</b></span>\n      <span class="chip" title="β、t 值、歷史分布區間為模擬佔位值，不是實際估計">統計示意</span>')

# 4) 校準只跑內建清單（全市場兩千多檔不必逐檔模擬 β，沒有估計值時自動退回影響力推導）
rep('''  MASTER.forEach(st=>{
    const base=SR[st.ind]; if(!base)return;
    const beta=clamp(''', '''  MASTER.forEach(st=>{
    if(st.u)return;
    const base=SR[st.ind]; if(!base)return;
    const beta=clamp(''')

# 5) 標的池上限 20 → 30；圖譜上的事件／板塊／籌碼三圈仍各畫 20 個，避免糊成一團
rep('const CAP=20, DEFAULT_N=16;      /* 預設留 4 個空位給使用者自己加 */',
    'const CAP=30, DEFAULT_N=16, RING=20;   /* 標的池上限 30；預設 16 檔，留空位給使用者；L1–L3 每圈最多 20 個 */')
rep('  const keep=byL.map(l=>l.slice(0,CAP));', '  const keep=byL.map(l=>l.slice(0,RING));')
rep('    keep[0]=[BY[S.res.src]].concat(keep[0]).slice(0,CAP);', '    keep[0]=[BY[S.res.src]].concat(keep[0]).slice(0,RING);')

rep('  keep[1]=needIds.map(id=>BY[id]).concat(rest).slice(0,CAP);',
    '  keep[1]=needIds.map(id=>BY[id]).concat(rest).slice(0,Math.max(RING,needIds.length));')

# 6) 價格標示：非官方收盤資料的價格標「示意」
rep('const pxTxt=d=>d.px?`${d.px}　${d.chg>0?"+":""}${d.chg}%`:"價格未收錄";',
    'const pxTxt=d=>d.px?`${d.px}　${d.chg>0?"+":""}${d.chg}%${d.real?"":"（示意）"}`:"價格未收錄";')

# 7) 搜尋式選股
rep('''                 placeholder="輸入代號：2330 / 00631L / 00679B / NVDA / QQQ">''',
    '''                 placeholder="搜尋代號或名稱：2330、台積電、00878、NVDA">''')
rep('<input id="poolInput" maxlength="10"', '<input id="poolInput" maxlength="16" role="combobox" aria-autocomplete="list" aria-controls="poolSug"')
rep('''        <div class="pool-msg" id="poolMsg">預設為高影響力標的。台股可輸入任一上市櫃個股與 ETF（含海外型、債券型、槓桿反向），美股可輸入任一上市個股與 ETF；上限 20 檔，依影響力排序。</div>''',
    '''        <div class="pool-sug" id="poolSug" role="listbox" hidden></div>
        <div class="pool-msg" id="poolMsg">台股全部上市櫃股票與 ETF 都能搜尋，打代號或名稱就會跳出選項；美股內建約 180 檔，其他美股可自訂板塊加入。上限 30 檔。</div>''')
rep('''  const key=raw.toUpperCase(), s=LOOKUP[key];
  if(s){
    if(poolHas(key)){''', '''  const key=raw.toUpperCase(), s=LOOKUP[key]||MASTER.find(x=>x.n.toUpperCase()===key)||null;
  if(s){
    if(poolHas(s.id)){''')
rep('''$("#poolInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addTicker();}});''',
    '''/* ── 代號／名稱搜尋：全市場即打即選 ── */
const sugEl=$("#poolSug"); let sugIdx=-1, sugList=[];
function searchTickers(q){
  q=q.trim().toUpperCase(); if(!q)return [];
  const out=[];
  for(const s of MASTER){
    const id=s.id.toUpperCase(), n=s.n.toUpperCase();
    const sc=id===q?0:id.startsWith(q)?1:n.startsWith(q)?2:n.includes(q)?3:id.includes(q)?4:-1;
    if(sc>=0)out.push([sc,s]);
  }
  out.sort((a,b)=>a[0]-b[0]||(b[1].w||0)-(a[1].w||0));
  return out.slice(0,8).map(x=>x[1]);
}
function paintSug(){
  $$("#poolSug .sg").forEach((b,i)=>{b.classList.toggle("on",i===sugIdx); b.setAttribute("aria-selected",String(i===sugIdx));});
}
function renderSug(){
  sugList=searchTickers($("#poolInput").value); sugIdx=sugList.length?0:-1;
  if(!sugList.length){sugEl.hidden=true; sugEl.innerHTML=""; return;}
  sugEl.innerHTML=sugList.map(s=>`<button type="button" class="sg" role="option" data-id="${s.id}">
      <b>${s.id}</b><span>${s.n}</span>
      <em>${s.mkt==="tw"?(INDBY[s.ind]?INDBY[s.ind].n:""):"美股"}${s.etf?" · ETF":""}${poolHas(s.id)?" · 已在池內":""}</em></button>`).join("");
  sugEl.hidden=false; paintSug();
  $$("#poolSug .sg").forEach(b=>b.addEventListener("click",()=>pickSug(b.dataset.id)));
}
function pickSug(id){ $("#poolInput").value=id; sugEl.hidden=true; addTicker(); $("#poolInput").focus(); }
$("#poolInput").addEventListener("input",renderSug);
$("#poolInput").addEventListener("focus",()=>{if($("#poolInput").value.trim())renderSug();});
$("#poolInput").addEventListener("blur",()=>setTimeout(()=>{sugEl.hidden=true},200));
$("#poolInput").addEventListener("keydown",e=>{
  const open=!sugEl.hidden&&sugList.length;
  if(e.key==="ArrowDown"&&open){e.preventDefault();sugIdx=(sugIdx+1)%sugList.length;paintSug();}
  else if(e.key==="ArrowUp"&&open){e.preventDefault();sugIdx=(sugIdx-1+sugList.length)%sugList.length;paintSug();}
  else if(e.key==="Escape"&&open){e.stopPropagation();sugEl.hidden=true;}
  else if(e.key==="Enter"){e.preventDefault(); if(open&&sugIdx>=0)pickSug(sugList[sugIdx].id); else addTicker();}
});''')

# 8) 樣式
rep('''.sd-sign{display:flex;''', '''.pool-sug{flex:none;margin:6px 14px 0;border:1px solid var(--line-hi);border-radius:6px;background:var(--card);
  max-height:236px;overflow-y:auto;box-shadow:var(--shadow)}
.pool-sug .sg{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:8px;align-items:center;width:100%;
  text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);font-size:12.5px}
.pool-sug .sg:last-child{border-bottom:none}
.pool-sug .sg b{font-family:var(--mono);font-weight:700;color:var(--navy)}
.pool-sug .sg span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
.pool-sug .sg em{font-style:normal;font-size:10.5px;color:var(--faint);white-space:nowrap}
.pool-sug .sg.on,.pool-sug .sg:hover{background:var(--gold-pale)}
:root.m .pool-sug .sg{padding:11px 10px;font-size:14px}
.chip b{font-weight:700}
.chip.demo.live{color:var(--l2-ink);border-color:rgba(94,138,62,.45)}
.sd-sign{display:flex;''')
