# 由 build.py 以 exec 載入（最後一個）：拿掉音效，並把剩下的示意值全部換成實際資料。
#   · 事件行事曆：Nasdaq 經濟／財報行事曆＋Fed 官網＋法定期限（calibrate.py 的 upcoming）
#   · 配息事件：證交所／櫃買中心除權除息預告表
#   · 情境權重：過去 5 年意外值為正／負的次數比例
#   · 板塊資金流：三大法人近 5 日買賣超（台股）、近 5 日超額報酬（美股，沒有公開資金流）
#   · 放大器：實證放大倍數（事件前板塊狀態異常 vs 正常時的衝擊比）＋目前處於異常的板塊
#   · 上下游連動：近 500 日板塊超額報酬的領先落後相關
#   · 匯率：Yahoo TWD=X；個股影響力：台股成交值、美股市值
#   · 拿掉沒有資料來源的「綜合情境」與「三個巨觀情境」
import re as _re

# ── 1) 音效：整段音景引擎拿掉，保留空的 sfx 介面，呼叫點不用逐一改 ──
_a = src.index('/* ════════ 音景引擎')
_b = src.index('/* ════════ 視覺互動特效')
src = src[:_a] + '/* 音效已移除：保留空的 sfx 介面，原本的呼叫點維持不動 */\nconst sfx=new Proxy({},{get:()=>()=>{}});\n\n' + src[_b:]
rep('''      <button class="chip on" id="cSnd">音效</button>\n''', '')
_a = src.index('/* 音效三段式')
_b = src.index('addEventListener("keydown",e=>{if(e.key==="Escape"&&S.res)')
src = src[:_a] + src[_b:]
rep('''  if(!document.hidden){tickClock();if(SND.ctx&&SND.on&&SND.ctx.state==="suspended")SND.ctx.resume();}''',
    '''  if(!document.hidden)tickClock();''')

# ── 2) 台灣 CPI、出口、央行理監事會：日期改由 fetch_tw_macro.py 從主計總處、財政部、央行官網抓 ──

# ── 3) 即時資料載入（calibrate.py 每天盤後產出，跟校準結果同一個檔）──
rep('''  CAL.meta={edges:Object.keys(e).length,stocks:Object.keys(s).length,evOcc:''', '''  applyLive(j);
  CAL.meta={edges:Object.keys(e).length,stocks:Object.keys(s).length,evOcc:''')
rep('''/* ── 幾何：漏斗 ── */''', '''/* ════════ 即時資料：資金流、放大器、上下游、匯率、官方排程、除息預告 ════════ */
const AMP_WATCH={c_fgn:"外資近 5 日買賣超是否延續、與台指期未平倉方向是否一致",
  c_itc:"投信是否連續買超、季底作帳時點",c_marg:"融資餘額是否隨股價墊高（追高）或背離",
  c_short:"融券是否快速增加（軋空或看空加碼）",c_mom:"近 20 日漲跌是否過熱或超跌",c_vol:"近期波動是否明顯高於常態",
  f_mom:"近 20 日相對大盤的漲跌是否過熱或超跌",f_vol:"近期波動是否明顯高於常態"};
function applyLive(j){
  CAL.upcoming=j.upcoming||[]; CAL.live=j.live||{}; CAL.amp=j.amp||{}; CAL.dateSrc=j.date_src||{};
  CAL.regime=j.regime||null; CAL.scenFreq=j.scen_freq||{};
  const L=CAL.live;
  IND.forEach(d=>{
    if(d.mkt==="tw"&&L.tw_flow){d.flow=+(L.tw_flow[d.id]||0); d.unit="億"; d.flowLbl="三大法人近 5 日買賣超";}
    else if(d.mkt==="us"&&L.us_ret5){d.flow=+(L.us_ret5[d.id]||0); d.unit="%"; d.flowLbl="近 5 日超額報酬（對 SPY）";}
  });
  if(L.fx&&L.fx.usdtwd)FXRATE=L.fx.usdtwd;
  const mk=(id,a)=>{
    const e=a.est, isVol=/vol$/.test(id);
    const cov=Object.entries(a.now||{}).filter(([s,z])=>isVol?z>=1:Math.abs(z)>=1).map(([s])=>s).filter(s=>INDBY[s]);
    const sig=!!(e&&e.amp>1&&e.t>=1.96);
    let v;
    if(a.val){const tot=Object.values(a.val).reduce((x,y)=>x+y,0); v=`板塊合計 ${tot>0?"+":""}${tot.toFixed(1)} 億 · ${cov.length} 個板塊異常`;}
    else v=`${cov.length} 個板塊處於異常`;
    return {id,n:a.n,s:a.s,amp:sig?e.amp:1,est:e,sig,v,covers:sig?cov:[],watch:AMP_WATCH[id]||"",real:true};
  };
  CHIP_TW.length=0; FUND_US.length=0;
  Object.entries(CAL.amp).forEach(([id,a])=>(a.mkt==="tw"?CHIP_TW:FUND_US).push(mk(id,a)));
  AMPS.length=0; CHIP_TW.concat(FUND_US).forEach(x=>AMPS.push(x));
  if(Array.isArray(j.chain)&&j.chain.length){CHAIN.length=0; j.chain.forEach(c=>CHAIN.push([c[0],c[1],c[2],c[3]]));}
}
/* 情境權重：過去 5 年意外值為正（情境 A）與為負（情境 B）的次數比例；不分方向的事件不給權重 */
function scenFor(t){
  const F=CAL.scenFreq&&CAL.scenFreq[t.k]; let nA=0,nB=0;
  if(F){nA=F[0];nB=F[1];}   /* 過去 5 年意外值為正／為負的次數（剛好等於共識的不算） */
  if(nA+nB>0)return t.scen.map((s,i)=>({...s,p:i===0?nA/(nA+nB):nB/(nA+nB),pN:nA+nB,pReal:true}));
  return t.scen.map(s=>({...s,p:1/t.scen.length,pReal:false}));
}
const scenW=sc=>sc.pReal?`過去 ${sc.pN} 次中佔 ${Math.round(sc.p*100)}%`:"不分方向 · 不給權重";
/* ── 幾何：漏斗 ── */''')
rep('''    applyRealCal(j); CAL_LIVE="線上最新";
    buildGraph();''', '''    applyRealCal(j); CAL_LIVE="線上最新";
    genEvents(); buildGraph();''')

# ── 4) L3 放大器與上下游：資料改由 applyLive 填入；邊的權重改成實證倍數 ──
rep('''const AMPS=CHIP_TW.concat(FUND_US);''', '''const AMPS=CHIP_TW.concat(FUND_US);   /* applyLive 會換成實證放大器 */
/* 板塊 → 個股的傳導權重：有實證 β 時用 β 與 R²，沒有時給固定的保守值 */
function secStockW(s){
  const m=stockStat(s.id);
  return m?clamp(0.24+0.40*Math.abs(m.b),0.24,0.92)*clamp(0.55+0.45*m.r2,0.55,1):0.35;
}''')
rep('''    coversOf(c,mkt).forEach(ind=>{if(BY[ind])EDGES.push([ind,c.id,+(0.34+(c.amp-1)*0.62).toFixed(3),1])});''',
    '''    /* 放大器是乘數：板塊 → 放大器的權重就是實證放大倍數，只連到「目前狀態異常」的板塊 */
    coversOf(c,mkt).forEach(ind=>{if(BY[ind])EDGES.push([ind,c.id,+c.amp.toFixed(3),0])});''')
rep('''      const w=clamp(0.30+(c.amp-1)*0.70+s.w/100*0.30,0.15,0.82);
      EDGES.push([c.id,s.id,+w.toFixed(3),1]);''', '''      EDGES.push([c.id,s.id,+secStockW(s).toFixed(3),1]);''')
rep('''    const m=stockStat(s.id);
    const w=m?clamp(0.24+0.40*Math.abs(m.b),0.24,0.92)*clamp(0.55+0.45*m.r2,0.55,1)
            :clamp(0.46+s.w/100*0.34,0.3,0.82);
    EDGES.push([s.ind,s.id,+w.toFixed(3),1,m]);''', '''    const m=stockStat(s.id);
    EDGES.push([s.ind,s.id,+secStockW(s).toFixed(3),1,m]);''')
rep('''  return c.covers==="*"?IND.filter(s=>s.mkt===mkt).map(s=>s.id):c.covers;''',
    '''  return c.covers==="*"?IND.filter(s=>s.mkt===mkt).map(s=>s.id):(c.covers||[]);''')
rep('''  else if(d.L===3)ls.push(d.s,`放大係數 ×${d.amp.toFixed(2)}`,d.v?("目前 "+d.v):"");''',
    '''  else if(d.L===3)ls.push(d.s,d.sig?`實證放大 ×${d.amp.toFixed(2)}（t ${d.est.t}）`:"實證上沒有顯著放大",d.v?("目前 "+d.v):"");''')

# ── 5) 事件 → 板塊：實證模式下只用實證估計，不再用情境標籤推導 ──
rep('''    let v=0;
    for(const t in tpl.tagW||{}){''', '''    if(CAL.src==="real")continue;
    let v=0;
    for(const t in tpl.tagW||{}){''')
rep('''  (tpl.hits||[]).forEach(([id,w])=>{if(!INDBY[id]||out[id])return;
    const st=edgeStat(tpl.k,id), cs=strFromStat(st);
    out[id]=''', '''  (tpl.hits||[]).forEach(([id,w])=>{if(!INDBY[id]||out[id])return;
    const st=edgeStat(tpl.k,id), cs=strFromStat(st);
    if(CAL.src==="real"&&!(st&&cs!==null))return;
    out[id]=''')

# ── 6) 事件行事曆：官方排程 ──
_a = src.index('  for(let k=0;k<8;k++){\n    const y=y0+Math.floor((m0+k)/12), m=(m0+k)%12;')
_b = src.index('  const dv=genDivEvents(now);')
src = src[:_a] + '''  /* 官方排程（calibrate.py 每天從 Nasdaq 經濟／財報行事曆、Fed 官網與法定期限整理）；時刻已換成台北時間 */
  (CAL.upcoming||[]).forEach(u=>{
    const t=EV_TPL.find(x=>x.k===u.k); if(!t)return;
    const d=isoD(u.d), dd=daysTo(d); if(dd<0||dd>170)return;
    const [hh,mi]=(u.t||"16:00").split(":").map(Number), rt=hh+mi/60;
    const rms=releaseMs(d,rt); if(rms<=now)return;
    if(rms<nextExp)nextExp=rms;
    const id=`${t.k}_${fmtD(d)}`; if(seen[id])return; seen[id]=1;
    const cons=u.cons?`市場共識 ${u.cons}${u.prev?`（前值 ${u.prev}）`:""}。`:"";
    out.push({id,tpl:t.k,n:t.name(d),date:fmtD(d),dObj:d,kind:t.kind,mkt:t.mkt,lvl:t.lvl,
              src:`${t.src} · ${u.src}`,note:cons+t.note,hits:hitsFor(t),scen:scenFor(t),watch:t.watch,rt,rms,
              twoSided:!!t.twoSided,days:dd,time:u.t});
  });
''' + src[_b:]

# ── 7) 除息事件：證交所／櫃買中心除權除息預告表（只有除息日；發放日預告表沒有，不再推估）──
_a = src.index('function genDivEvents(now){')
_b = src.index('  return {out,nextExp};\n}', _a) + len('  return {out,nextExp};\n}')
src = src[:_a] + '''function genDivEvents(now){
  const out=[]; let nextExp=Infinity;
  ((CAL.live&&CAL.live.div)||[]).forEach(([code,name,ex,amt,dsrc])=>{
    const etf=LOOKUP[code], dObj=isoD(ex), dd=daysTo(dObj); if(dd<0||dd>170)return;
    if(!etf||!(etf.w>=55||(()=>{try{return POOL.tw.includes(code)}catch(e){return false}})()))return;
    const rt=9, rms=releaseMs(dObj,rt); if(rms<=now)return;
    if(rms<nextExp)nextExp=rms;
    const nm=etf?etf.n:name, amtTxt=amt==null?"金額待公告":`${amt} 元`;
    out.push({id:`div_${code}_ex_${ex}`,tpl:`div_${code}_除息`,n:`${nm} 除息`,date:ex,dObj,kind:"除息",mkt:"tw",lvl:1,
      src:dsrc,note:`${code} 每單位 ${amtTxt}；要領到這次配息，須在除息日前一個交易日（含）之前買進。除息當天開盤參考價會扣掉配息。`,
      hits:etf?[[code,.86,null]]:[],scen:[],watch:"除息參考價與填息天數",rt,rms,twoSided:false,days:dd,
      div:{code,amt,ex,src:dsrc}});
  });
  return {out,nextExp};
}''' + src[_b:]
rep('''  if(d.L===1&&d.div)ls.push(`${d.date}　${d.days>0?"D-"+d.days:"今日"}`,`${d.kind} · ${d.div.code} · ${d.div.freq}`,
    d.div.amt===null?"配息金額待公告":`每單位 ${d.div.amt} 元${d.div.est?"（預估）":""}`);''',
    '''  if(d.L===1&&d.div)ls.push(`${d.date}　${d.days>0?"D-"+d.days:"今日"}`,`${d.kind} · ${d.div.code}`,
    d.div.amt==null?"配息金額待公告":`每單位 ${d.div.amt} 元`);''')
_a = src.index('    divSec=`<div class="res-sec">')
_b = src.index('</p></div>`;', _a) + len('</p></div>`;')
src = src[:_a] + '''    divSec=`<div class="res-sec">
      <h3>除息資訊<em>${v.amt==null?"金額待公告":"已公告"}</em></h3>
      <div class="divbox">
        <div class="divgrid">
          <div>配息金額<b class="hl">${v.amt==null?"待公告":v.amt+" 元"}</b></div>
          <div>除息日<b>${v.ex}</b></div>
          <div>最後買進日<b>除息日前一個交易日</b></div>
        </div>
        <p>除息當天開盤參考價＝前一日收盤價 − 配息金額。要領到這次配息，必須在最後買進日（含）之前買進並持有到除息日。</p>
        <button class="divadd" id="divAdd" data-code="${v.code}"${inPool?" disabled":""}>${inPool?"已在標的池":"加入標的池，看它的傳導"}</button>
      </div>
      ${(()=>{const fl=CAL.fill&&CAL.fill[v.code];
        return fl?`<p class="cone-note"><b>近五年實際填息紀錄</b>：除息 ${fl.n} 次，20 個交易日內填息 <b>${Math.round(fl.r20*100)}%</b>，
          ${fl.med!==null?`填息天數中位數 <b>${fl.med}</b> 個交易日`:"尚無完成填息的紀錄"}（120 個交易日內填息 ${fl.filled} 次）。</p>`
          :`<p class="cone-note">這檔 ETF 近五年的除息紀錄不足（可能上市未滿一年），暫無填息統計。</p>`})()}
      <p class="cone-note">來源：${v.src}（每個交易日盤後更新）。</p></div>`;''' + src[_b:]

# ── 8) 情境權重顯示 ──
rep('''        <em>權重 ${(sc.p*100)|0}%</em></div>''', '''        <em>${scenW(sc)}</em></div>''')
rep('''<em>權重 ${(c.s.p*100)|0}%</em>''', '''<em>${scenW(c.s)}</em>''')

# ── 9) 拿掉沒有資料來源的綜合情境；板塊頁改成「這個板塊對各事件的實證反應」──
_a = src.index('    <div class="res-sec">\n      <h3>綜合情境 · 把上游事件合起來看')
_b = src.index('    </div>`;', _a) + len('    </div>')
src = src[:_a] + '    ${regimeBlock(node)}' + src[_b:]
rep('''  else if(src.L===2)       analysis=`<div class="res-sec">
        <h3>這個板塊在三個巨觀情境下的方向<em>示意</em></h3>${macroForSector(src)}
        <p class="cone-note">方向由板塊的情境敏感度推得；區間是歷史上同向環境的後續分布，不指涉這一次。</p></div>`;''',
    '''  else if(src.L===2)       analysis=sectorEvidence(src)+regimeBlock(src);''')
rep('''function macroForSector(sec){''', '''/* 板塊頁：過去 5 年各類事件對這個板塊的實證衝擊（依 |t| 排序） */
function sectorEvidence(sec){
  const lab=k=>{const t=EV_TPL.find(x=>x.k===k); return t?t.name(TODAY).replace(/\\d+ 月/,"").replace(/（\\d+ 月）/,"").trim():k;};
  const rows=Object.entries(CAL.edges||{}).filter(([k])=>k.endsWith(">"+sec.id))
    .map(([k,m])=>({k:k.split(">")[0],m})).sort((a,b)=>Math.abs(b.m.t)-Math.abs(a.m.t)).slice(0,8);
  if(!rows.length)return `<div class="res-sec"><h3>實證反應</h3><p class="cone-note">這個板塊沒有足夠的歷史資料。</p></div>`;
  return `<div class="res-sec"><h3>這個板塊對各類事件的實證反應<em>近 5 年 · 依顯著程度排序</em></h3>
    ${rows.map(({k,m})=>`<p class="cone-note"><b>${lab(k)}</b>：${m.kind==="abs"
      ?`事件窗超額波動 ${m.b>0?"+":""}${m.b.toFixed(2)}%`
      :`β ${m.b>0?"+":""}${m.b.toFixed(2)}%／1σ 意外值`}（t ${m.t.toFixed(1)} · N ${m.n}）${Math.abs(m.t)>=1.96?" <b>顯著</b>":""}</p>`).join("")}
    <p class="cone-note">β 是「意外值每多 1 個標準差，板塊超額報酬平均多幾 %」；超額波動是事件窗的 |報酬| 比平常多幾 %，不分方向。</p></div>`;
}
/* 巨觀環境：用實際數據判斷目前處於哪種環境，顯示這個板塊（或個股 × 實證 β）在同樣環境下之後 20 個交易日的歷史分布 */
const REG_LAB={rate:{up:"利率上行",down:"利率下行"},growth:{exp:"景氣擴張",con:"景氣收縮"},infl:{up:"通膨升溫",down:"通膨降溫"}};
function regimeBlock(node){
  const R=CAL.regime; if(!R||!R.sec)return "";
  const sec=node.L===4?node.ind:node.id, cell=R.sec[sec]; if(!cell)return "";
  const m=node.L===4?stockStat(node.id):null, k=m?m.b:1;
  const f=q=>{const lo=q[0]*k,hi=q[2]*k; return `中位數 <b>${PCT(q[1]*k)}</b>（P10 ${PCT(Math.min(lo,hi))} ~ P90 ${PCT(Math.max(lo,hi))} · 約 ${Math.max(1,Math.round(q[4]/20))} 個獨立月份）`;};
  const cur=R.current||{}, v=R.values||{};
  const now=["rate","growth","infl"].map(dm=>cur[dm]?REG_LAB[dm][cur[dm]]:"—").join("＋");
  const rows=["rate","growth","infl"].map(dm=>{
    const c=cell[dm]; if(!c||!cur[dm])return "";
    const other=Object.keys(REG_LAB[dm]).find(x=>x!==cur[dm]);
    return `<p class="cone-note"><b>${REG_LAB[dm][cur[dm]]}</b>（目前）：${c[cur[dm]]?f(c[cur[dm]]):"樣本不足"}
      ${other&&c[other]?`<br>對照 ${REG_LAB[dm][other]}：${f(c[other])}`:""}</p>`;}).join("");
  return `<div class="res-sec"><h3>目前巨觀環境下的歷史表現<em>${now}</em></h3>
    ${cell.combo?`<p class="cone-note"><b>三個條件都和現在一樣的日子</b>：${f(cell.combo)}</p>`:""}
    ${rows}
    <p class="cone-note">環境用當天已公布的數據判斷：${(R.def||{}).rate||""}；${(R.def||{}).growth||""}；${(R.def||{}).infl||""}。
      目前 ISM ${v.ism??"—"}、2 年期殖利率 3 個月變動 ${v.dgs2_chg!=null?(v.dgs2_chg>0?"+":"")+v.dgs2_chg+" 個百分點":"—"}。
      數字是${node.L===4?`板塊（${INDBY[sec]?INDBY[sec].n:sec}）超額報酬乘上這檔的實證 β ${k.toFixed(2)}`:"板塊超額報酬"}；
      相鄰日子的 20 日區間重疊，獨立樣本以月份計，月份少時參考價值低。</p></div>`;
}
function macroForSector(sec){''')

# ── 10) 資金流標示、節點大小、匯率、文字 ──
rep('''  else if(d.L===2)ls.push(`板塊資金淨流 ${d.flow>0?"+":""}${d.flow} ${d.unit}`,"點一下＝看它往下打到誰");''',
    '''  else if(d.L===2)ls.push(`${d.flowLbl||"板塊資金淨流"} ${d.flow>0?"+":""}${d.flow} ${d.unit}`,"點一下＝看它往下打到誰");''')
rep('''        src.L===2?`　·　淨流 ${src.flow>0?"+":""}${src.flow} ${src.unit}`:""}${''',
    '''        src.L===2?`　·　${src.flowLbl||"淨流"} ${src.flow>0?"+":""}${src.flow} ${src.unit}`:""}${''')
rep('''    if(n.d.L===2)r=3.0+Math.min(1,Math.abs(n.d.flow)/70)*3.0;''',
    '''    if(n.d.L===2)r=3.0+Math.min(1,Math.abs(n.d.flow)/(n.d.mkt==="us"?6:70))*3.0;''')
rep('''const FXRATE=32.5;                       /* 美元兌台幣（示意固定值） */''',
    '''let FXRATE=32.5;                         /* 美元兌台幣：applyLive 以 Yahoo TWD=X 覆蓋 */''')
rep('''總經排程為規則推算，配息日期取自投信公告整理，實際以官方公告為準。''',
    '''排程取自 Nasdaq 經濟／財報行事曆、Fed 官網與法定期限；配息取自證交所／櫃買中心除權除息預告表。''')
rep('''權重為示意先驗，不是機率預測。''', '''權重是過去 5 年意外值為正／負的次數比例，不是這一次的機率。''')
src = src.replace('情境權重是示意先驗，不是市場機率。', '情境權重是過去 5 年意外值正負的次數比例，不是這一次的機率。')

# ── 11) 個股影響力：台股用成交值（twall 的 w），不再沿用手設值 ──
rep('''    if(hit){ if(px!==null&&px!==undefined){hit.px=px; hit.chg=chg==null?0:chg; hit.real=true;} return; }''',
    '''    if(hit){ if(px!==null&&px!==undefined){hit.px=px; hit.chg=chg==null?0:chg; hit.real=true;} hit.w=w; return; }''')

# ── 12) 分布區間的退路：沒有「這個事件 × 這個板塊」的實證分布時，改用同類事件（全部板塊）的實際分布，不給方向 ──
rep('''  const c=CONE[ev.kind]||CONE["總經"];
  const nv=node.vol||1.1;
  let spread=(c.shape[4]-c.shape[0])*c.vol*nv*clamp(.42+str*.95,.42,1.7);
  const t=tiltScore(node.tags,tilt||{});
  let med=t.dir*spread*.26*clamp(.55+str,.55,1.6);
  /* 兩個非對稱：機率權重越低的情境，市場定價越少、反應越大；下行尾部較肥 */
  if(p!==undefined)med*=clamp(1.35-p*.7,.85,1.35);
  if(t.dir<0)spread*=1.14;
  return {med,lo:med-spread*.44,hi:med+spread*.46,dir:t.dir,cover:t.cover,spread,n:c.n};''',
'''  /* 沒有這個事件 × 板塊的實證分布：退回同類事件（全部板塊合併）的實際分布，不給方向 */
  const c=CONE[ev.kind]||CONE["總經"];
  return {med:c.shape[2],lo:c.shape[0],hi:c.shape[4],dir:0,cover:0,spread:c.shape[4]-c.shape[0],n:c.n,real:false,pooled:true};''')
rep('''"歷史同類分布（示意）"''', '''"同類事件整體分布（這個板塊沒有單獨統計）"''')
# 除息／領息沒有事件研究的分布（手設的扇形拿掉），除息事件只顯示填息統計
rep('''    ${!back&&isEvent?`<div class="res-sec">
      <h3>歷史後續分布''', '''    ${!back&&isEvent&&!src.div?`<div class="res-sec">
      <h3>歷史後續分布''')
rep('''      <h3>模型邊界<em>${l3name}層 · 三件不做的事</em></h3>''', '''      <h3>模型邊界<em>放大器層 · 三件不做的事</em></h3>''')
rep('''        ${S.mkt==="us"?"獲利能力與自由現金流越強的地方越能吸收":"現價與法人推估成本背離越大的地方反應會被放大"}。</p>''',
    '''        事件前板塊處於異常狀態（${S.mkt==="us"?"動能過熱或超跌":"法人大買大賣、融資融券急增、動能過熱"}）時，過去 5 年的衝擊平均被放大的倍數，
        倍數與 t 值都來自實證；沒有顯著放大的狀態不連線。</p>''')

# ── 13) 程式內的舊註解跟著改，免得之後維護的人誤會 ──
src = src.replace('   數值為示意；板塊淨流取自方舟盤面快照。', '   板塊資金流、放大器、上下游、排程由 applyLive 以 calibrate.py 的每日輸出覆蓋。')
src = src.replace('   排程為示意，實際日期以官方公告為準。', '   實際使用的是 calibrate.py 整理的官方排程（genEvents）；這裡的規則只保留事件的名稱、說明與情境文字。')
src = src.replace('所有數字都是歷史統計的示意值，不是預測。', '所有數字都是過去 5 年的實證統計，不是預測。')
