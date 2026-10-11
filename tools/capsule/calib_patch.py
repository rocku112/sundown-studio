# 由 build.py 以 exec 載入：把模擬校準換成真實事件研究結果（calibrate.py 產出的 calib.json）
_cal = (REPO / 'twflow/web/data/capsule_calib.json').read_text(encoding='utf-8')

# 1) 內嵌校準結果 ＋ 載入器
rep('''/* ── 幾何：漏斗 ── */''', '''/* ════════ 真實校準（calibrate.py · 事件研究法）═════════════════
   台股官方日線（證交所＋櫃買中心，還原股息）＋ FRED 總經數據 ＋ 公開資訊觀測站月營收。
   · 有意外值的事件：CAR 對標準化意外值做 OLS → β（%／1σ）
   · 沒有意外值的事件：事件窗 |CAR| 減非事件日 |CAR| → 超額波動（不分方向）
   · 分布：每次事件後 T+0～T+19 的板塊超額報酬，依意外值正負拆成兩個情境
   · 個股 β：近 500 個交易日對所屬板塊（排除自身）回歸
   美股板塊與美股個股：Yahoo 還原日線（市場基準 SPY，事件時間換成美東時刻對應美股交易日）。
   台股債券／海外 ETF 板塊：官方日線沒有，同樣用 Yahoo 還原日線組籃子。
   ════════════════════════════════════════════════════════════ */
const CAL_REAL=''' + _cal + ''';
let BETA_FULL_DIR=BETA_FULL, BETA_FULL_ABS=BETA_FULL;
function applyRealCal(j){
  const e={},s={};
  (j.edges||[]).forEach(r=>{const b=+r.beta,se=+r.se;
    e[r.from+">"+r.to]={b,se,t:+r.t,r2:+r.r2,n:+r.n,lag:r.lag,kind:r.kind,ci:[b-1.96*se,b+1.96*se]};});
  Object.entries(j.stock_beta||{}).forEach(([c,a])=>{
    s[c]={b:a[0],se:a[1],t:a[2],r2:a[3],n:a[4],ci:[a[0]-1.96*a[1],a[0]+1.96*a[1]],stock:true};});
  CAL.edges=e; CAL.stock=s; CAL.dist=j.dist||{}; CAL.fill=j.fill||{}; CAL.mode=j.mode||{};
  CAL.surprise=j.surprise||{}; CAL.fomcSrc=j.fomc_src||""; CAL.asof=j.asof||"";
  CAL.src="real"; CAL.window=j.window||"實際資料"; CAL.built=true;
  if(j.full){BETA_FULL_DIR=j.full.dir||1; BETA_FULL_ABS=j.full.abs||1;}
  Object.entries(j.cone||{}).forEach(([k,c])=>{CONE[k]={n:c.n,shape:c.shape,vol:1}});
  CAL.meta={edges:Object.keys(e).length,stocks:Object.keys(s).length,evOcc:j.n_events||0,
            sig:Object.values(e).filter(x=>Math.abs(x.t)>=1.96).length};
}
/* ── 幾何：漏斗 ── */''')
rep('''calibrateSim(); genEvents(); buildGraph(); calBadge();''', '''applyRealCal(CAL_REAL); genEvents(); buildGraph(); calBadge();''')

# 2) 強度換算：滿格改用實證分布的第 95 百分位；超額波動只取正值
rep('''  return clamp(Math.abs(m.b)/BETA_FULL,0,.95)*shrink(m.t);''',
    '''  if(m.kind==="abs")return clamp(Math.max(0,m.b)/BETA_FULL_ABS,0,.95)*shrink(Math.max(0,m.t));
  return clamp(Math.abs(m.b)/(CAL.src==="real"?BETA_FULL_DIR:BETA_FULL),0,.95)*shrink(m.t);''')
# 明確指定的板塊：有實證估計時用實證強度，不再沿用手設權重
rep('''  (tpl.hits||[]).forEach(([id,w])=>{if(INDBY[id]&&!out[id])out[id]=[w,edgeStat(tpl.k,id)]});''',
    '''  (tpl.hits||[]).forEach(([id,w])=>{if(!INDBY[id]||out[id])return;
    const st=edgeStat(tpl.k,id), cs=strFromStat(st);
    out[id]=[st&&cs!==null?Math.max(+cs.toFixed(3),.04):w,st]});''')

# 3) 分布區間：優先用實證分布
rep('''function bandFor(ev,node,str,tilt,p){
  const c=CONE[ev.kind]||CONE["總經"];''', '''/* 實證分布：這個事件 × 這個板塊，過去每次事件後 T+0～T+19 的超額報酬（P10／P50／P90）。
   有意外值的事件依意外值正負拆成情境 A／B；個股再乘上它對板塊的實證 β。 */
function realBand(ev,node,tilt){
  if(CAL.src!=="real"||!ev||!ev.tpl||!CAL.dist)return null;
  const D=CAL.dist[ev.tpl]; if(!D)return null;
  const sec=node.L===4?node.ind:(node.L===2?node.id:null), cell=sec&&D[sec]; if(!cell)return null;
  let key="U";
  if(cell.A&&cell.B&&ev.scen){const i=ev.scen.findIndex(s=>s.tilt===tilt); key=i===0?"A":i===1?"B":"U";}
  const q=cell[key]||cell.U; if(!q)return null;
  let k=1; if(node.L===4){const m=stockStat(node.id); if(m)k=m.b;}
  let lo=q[0]*k, med=q[1]*k, hi=q[2]*k; if(lo>hi){const t=lo;lo=hi;hi=t;}
  const half=Math.max(.05,(hi-lo)/2);
  return {med,lo,hi,dir:clamp(med/half*2,-1,1),cover:1,spread:hi-lo,n:q[3],real:true,split:key!=="U"};
}
function bandFor(ev,node,str,tilt,p){
  const rb=realBand(ev,node,tilt); if(rb)return rb;
  const c=CONE[ev.kind]||CONE["總經"];''')
rep('''        <span class="rng">歷史同類分布 <b>${PCT(b.med)}</b>
          <s>（${PCT(b.lo)} ~ ${PCT(b.hi)}）</s></span>''',
    '''        <span class="rng">${b.real?(b.split?"實際歷史分布":"實際歷史分布（不分情境）"):"歷史同類分布（示意）"} <b>${PCT(b.med)}</b>
          <s>（P10 ${PCT(b.lo)} ~ P90 ${PCT(b.hi)}${b.real?` · N=${b.n}`:""}）</s></span>''')
rep('''      <p class="cone-note" style="margin-top:10px">兩個情境是這類事件最常見的兩種結果，''',
    '''      ${CAL.src==="real"&&CAL.mode&&CAL.mode[ev.tpl]==="abs"?`<p class="cone-note" style="margin-top:10px"><strong style="color:var(--l1-ink)">這類事件沒有可量化的意外值</strong>，
        兩種走法無法從資料拆開；區間是不分情境的實際分布，方向判讀僅供參考。</p>`:
        CAL.src==="real"&&CAL.mode&&CAL.mode[ev.tpl]==="dir"?`<p class="cone-note" style="margin-top:10px">情境 A／B 對應過去<strong style="color:var(--dim)">意外值為正／為負</strong>的那幾次事件，
        區間是那幾次之後 20 個交易日的實際板塊超額報酬。意外值：${CAL.surprise[ev.tpl]||"—"}。</p>`:""}
      <p class="cone-note" style="margin-top:10px">兩個情境是這類事件最常見的兩種結果，''')

# 4) 統計列：超額波動與個股 β 用各自的單位
rep('''  return `<p class="an-s">最弱一段 <b>${A?A.n:w.from} → ${B?B.n:w.to}</b>：
    β ${w.b>0?"+":""}${w.b.toFixed(2)}%／1σ ·''', '''  const unit=w.kind==="abs"?`事件窗超額波動 ${w.b>0?"+":""}${w.b.toFixed(2)}%`
            :w.stock?`個股對板塊 β ${w.b.toFixed(2)}`
            :`β ${w.b>0?"+":""}${w.b.toFixed(2)}%／1σ`;
  return `<p class="an-s">最弱一段 <b>${A?A.n:w.from} → ${B?B.n:w.to}</b>：
    ${unit} ·''')
rep('''const statTxt=m=>m?`β ${m.b>0?"+":""}${m.b.toFixed(2)}%''', '''const statTxt=m=>m?`${m.kind==="abs"?"超額波動":"β"} ${m.b>0?"+":""}${m.b.toFixed(2)}%''')

# 5) 體檢頁：資料來源說明
rep('''          ? `已載入實際校準：${CAL.window}，估出 ${CAL.meta.edges||0} 條事件→板塊邊，
             其中 <b>${CAL.meta.sig||0}</b> 條在 95% 信賴水準下顯著；個股對板塊 β ${CAL.meta.stocks||0} 檔。`''',
    '''          ? `已載入實際校準：${CAL.window}，估出 ${CAL.meta.edges||0} 條事件→板塊邊，
             其中 <b>${CAL.meta.sig||0}</b> 條在 95% 信賴水準下顯著；個股對板塊 β ${CAL.meta.stocks||0} 檔。
             <br>有意外值、可估方向 β 的事件：${Object.keys(CAL.surprise||{}).length} 種（FRED 總經數據、公開資訊觀測站月營收）；
             其餘只估事件窗超額波動。FOMC 日期：${CAL.fomcSrc}；其他事件日期依規則推算。
             <br><strong style="color:var(--dim)">美股板塊與個股、台股債券／海外 ETF 板塊用 Yahoo 還原日線（美股以 SPY 為市場基準）。</strong>
             顯著比例不高是實情：多數事件對單一板塊的平均衝擊很小，強度會依 t 值收縮。`''')

# 6) 除息資訊：實證填息統計
rep('''      <p class="cone-note">資料快照 ${DIV_SNAPSHOT}；標示預估者為投信預告值，正式金額以除息前公告為準。</p></div>`;''',
    '''      ${(()=>{const fl=CAL.fill&&CAL.fill[v.code];
        return fl?`<p class="cone-note"><b>近五年實際填息紀錄</b>：除息 ${fl.n} 次，20 個交易日內填息 <b>${Math.round(fl.r20*100)}%</b>，
          ${fl.med!==null?`填息天數中位數 <b>${fl.med}</b> 個交易日`:"尚無完成填息的紀錄"}（120 個交易日內填息 ${fl.filled} 次）。</p>`
          :`<p class="cone-note">這檔 ETF 近五年的除息紀錄不足（可能上市未滿一年），暫無填息統計。</p>`})()}
      <p class="cone-note">資料快照 ${DIV_SNAPSHOT}；標示預估者為投信預告值，正式金額以除息前公告為準。</p></div>`;''')

# 7) 頂欄標記
rep('''<span class="chip" title="β、t 值、歷史分布區間為模擬佔位值，不是實際估計">統計示意</span>''',
    '''<span class="chip on" id="calChip" title="台股：β、t 值、分布區間為實證估計（台股官方日線＋美股 Yahoo 還原日線，近五年事件研究法）。">統計 · 實證</span>''')

# 8) 實證模式下，沒有實證估計的邊（少數樣本不足的板塊）用標籤推導，強度打五折，避免壓過實證邊
rep('''    const w=+clamp(v*0.60,0,.88).toFixed(3);''',
    '''    const w=+clamp(v*0.60*(CAL.src==="real"?0.5:1),0,.88).toFixed(3);''')
rep('''權重為示意先驗，不是機率預測。方向由「板塊對該情境的敏感度 × 這條鏈的強度」推得，''',
    '''權重為示意先驗，不是機率預測。${CAL.src==="real"?"台美股板塊的方向與區間取自實際歷史分布（台股官方日線、美股與海外／債券 ETF 用 Yahoo 還原日線），":"方向由「板塊對該情境的敏感度 × 這條鏈的強度」推得，"}''')

# 9) 開場自動推演：挑「未來 30 天內、傳導到標的池最多檔」的事件，而不是單純最近的一件
rep('''setTimeout(()=>{const e=NODES.filter(n=>n.L===1&&inMkt(n)&&n.lvl===3).sort((a,b)=>a.days-b.days)[0]
  ||NODES.filter(n=>n.L===1&&inMkt(n)).sort((a,b)=>a.days-b.days)[0];
  if(e)run(e.id,1);},1100);''', '''setTimeout(()=>{
  const pool=new Set(poolIds());
  const score=e=>Object.entries(walk(e.id,1)).filter(([id,r])=>pool.has(id)&&r.str>=CUT).length;
  const cands=NODES.filter(n=>n.L===1&&inMkt(n)&&!n.div&&n.days<=30).map(e=>({e,s:score(e)}))
    .sort((a,b)=>b.s-a.s||b.e.lvl-a.e.lvl||a.e.days-b.e.days);
  const e=(cands[0]&&cands[0].e)||NODES.filter(n=>n.L===1&&inMkt(n)).sort((a,b)=>a.days-b.days)[0];
  if(e)run(e.id,1);},1100);''')

# 9) 線上自動更新：GitHub Actions 每個交易日盤後重算 capsule_calib.json，頁面開啟時抓最新一份
rep('''/* ── 幾何：漏斗 ── */''', '''const CAL_URL="https://rocku112.github.io/sundown-studio/twflow/web/data/capsule_calib.json";
let CAL_LIVE="內嵌快照";
function updateCalChip(){
  const c=$("#calChip"); if(!c)return;
  c.textContent="統計 · 實證"+(CAL.asof?" "+CAL.asof.slice(5).replace("-","/"):"");
  c.title=`台股 β、t 值、分布區間為實證估計（${CAL.window}，事件研究法）。
校準資料：${CAL_LIVE}；每個交易日盤後由 GitHub Actions 自動重算。
台股：證交所＋櫃買官方日線；美股與海外／債券 ETF：Yahoo 還原日線。`;
}
async function refreshCal(){
  try{
    const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),8000);
    const r=await fetch(CAL_URL,{signal:ctl.signal,cache:"no-cache"}); clearTimeout(tm);
    if(!r.ok)throw new Error("HTTP "+r.status);
    const j=await r.json();
    if(!j||!j.asof||!Array.isArray(j.edges))throw new Error("格式不符");
    if(j.asof<=CAL.asof){CAL_LIVE="內嵌快照（已是最新）";updateCalChip();return;}
    applyRealCal(j); CAL_LIVE="線上最新";
    buildGraph(); refreshPoolViews(); updateCalChip();
  }catch(e){ CAL_LIVE="內嵌快照（無法連線："+(e.name==="AbortError"?"逾時":e.message)+"）"; updateCalChip(); }
}
/* ── 幾何：漏斗 ── */''')
rep('''updateDataChip(); refreshLive();''', '''updateDataChip(); refreshLive(); updateCalChip(); refreshCal();''')
