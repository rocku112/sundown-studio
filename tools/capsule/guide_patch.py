# 由 build.py 以 exec 載入（real_patch 之後）：給一般人看的「白話導覽」。
# 頂欄多一顆按鈕，第一次開啟頁面時自動打開；內容依當下資料即時產生：這週要注意什麼、你的持股誰最容易被晃、怎麼看這個頁面、名詞小抄。
rep('''      <button class="chip on" id="cSpin">擺盪</button>''',
    '''      <button class="chip gd-btn" id="cGuide">白話導覽</button>
      <button class="chip on" id="cSpin">擺盪</button>''')
rep('''.pool-sug{flex:none;''', '''@media (max-width:420px){#mnav{gap:4px;padding-left:8px;padding-right:8px}#mnav button{padding:0 8px}}
.gd-btn{background:var(--gold,#E8B84B)!important;color:#1E3554!important;font-weight:700}
.gd-ov{position:fixed;inset:0;z-index:999;background:rgba(15,28,48,.55);display:flex;align-items:flex-start;justify-content:center;
  padding:24px 16px;overflow-y:auto}
.gd-ov[hidden]{display:none}
.gd{position:relative;width:min(720px,100%);background:var(--card,#FFFDF8);color:var(--ink,#1A2535);border-radius:12px;
  padding:22px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-size:14.5px;line-height:1.75}
.gd h2{margin:0 0 4px;font-size:20px;color:var(--navy,#1E3554)}
.gd h3{margin:18px 0 6px;font-size:15.5px;color:var(--navy,#1E3554);border-left:4px solid var(--gold,#E8B84B);padding-left:8px}
.gd .sub{color:var(--dim,#5A6B82);font-size:13px;margin:0 0 6px}
.gd ul{margin:4px 0;padding-left:20px}
.gd li{margin:5px 0}
.gd b{color:var(--navy,#1E3554)}
.gd .tag{display:inline-block;font-size:11.5px;padding:0 6px;border-radius:4px;margin-right:4px;border:1px solid currentColor}
.gd .up{color:#5E8A3E}.gd .dn{color:#C2572B}.gd .nu{color:#5A6B82}
.gd details{margin-top:8px;border:1px solid var(--line-hi,#E5DCCB);border-radius:8px;padding:6px 12px}
.gd summary{cursor:pointer;font-weight:700;color:var(--navy,#1E3554)}
.gd dl{margin:6px 0}.gd dt{font-weight:700;margin-top:8px}.gd dd{margin:2px 0 0 0;color:var(--dim,#5A6B82)}
.gd .x{position:absolute;top:10px;right:12px;border:none;background:none;font-size:20px;cursor:pointer;color:var(--dim,#5A6B82)}
.gd .go{margin-top:16px;width:100%;padding:10px;border:none;border-radius:8px;background:var(--navy,#1E3554);color:#fff;font-size:15px;cursor:pointer}
.gd .warn{margin-top:12px;font-size:12.5px;color:var(--dim,#5A6B82)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .gd{background:#1B2638;color:#E9E3D6}
  :root:not([data-theme="light"]) .gd b,:root:not([data-theme="light"]) .gd h2,:root:not([data-theme="light"]) .gd h3,:root:not([data-theme="light"]) .gd summary{color:#F2CC74}}
.pool-sug{flex:none;''')
_i = src.rindex('</body>')
src = src[:_i] + '''<div class="gd-ov" id="gdOv" hidden role="dialog" aria-modal="true" aria-label="白話導覽"><div class="gd"><button class="x" id="gdX" aria-label="關閉">✕</button><div id="gdBody"></div><button class="go" id="gdGo">我知道了，開始看</button></div></div>
<script>
/* ════════ 白話導覽：用一般人的話說「這週要注意什麼、你的持股會被晃多大」════════ */
(function(){
  const W=["日","一","二","三","四","五","六"];
  const md=e=>{const d=e.dObj||isoD(e.date); return `${d.getMonth()+1}/${d.getDate()}（${W[d.getDay()]}）${e.time?" "+e.time:""}`;};
  const fN={rate:"美債利率",usd:"美元",oil:"油價",semi:"半導體景氣"};
  function weekEvents(){
    return NODES.filter(n=>n.L===1&&inMkt(n)&&n.days>=0&&n.days<=7&&!n.div).sort((a,b)=>a.days-b.days||a.rms-b.rms).slice(0,6);
  }
  function eventLine(e){
    const mk=S.mkt==="us"?"us":"tw";
    let hit=[];
    try{const reach=walk(e.id,1); hit=Object.entries(reach).filter(([id,r])=>BY[id]&&BY[id].L===4&&poolHas(id)&&r.str>=.08)
      .sort((a,b)=>b[1].str-a[1].str).map(([id])=>BY[id].n);}catch(err){}
    let vol="";
    if(e.tpl==="conf"){const C=CAL.conf||{}; vol=`過去公司開法說會前後，股價通常比平常多晃約 ${Math.round(((C.mult||1)-1)*100)}%，但漲跌方向不一定`;}
    else{const em=typeof evmOf==="function"?evmOf(e.tpl,mk):null;
      if(em&&em[0]>=1.04)vol=`過去這類消息公布後，相關股票通常比平常多晃約 ${Math.round((em[0]-1)*100)}%`;
      else if(em)vol="過去公布後，股價波動和平常差不多";}
    const dirOk=(typeof factorOK==="function"&&factorOK(mk))||(CAL.gap&&CAL.gap[mk]&&CAL.gap[mk].pass);
    const dir=e.scen&&e.scen.length&&dirOk?"漲跌方向有微弱的歷史傾向，點進去看「情境推演」":(e.scen&&e.scen.length?"漲跌方向無法預測":"");
    const who=hit.length?`你的標的池裡會被牽動的有 <b>${hit.slice(0,3).join("、")}</b>${hit.length>3?` 等 ${hit.length} 檔`:""}。`:"你目前的標的池裡沒有明顯會被牽動的股票。";
    return `<li><b>${md(e)}　${e.n}</b><br>${who}${vol?vol+"。":""}${dir?dir+"。":""}</li>`;
  }
  function exposureLines(){
    let list=[];
    try{list=computeExposure(S.mkt==="us"?"us":"tw").list.filter(r=>r.score>0).slice(0,3);}catch(err){}
    if(!list.length)return "<li>你的標的池裡，接下來 30 天沒有特別容易被晃到的股票。</li>";
    return list.map(r=>{
      const top=Object.entries(r.prof||{}).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))[0];
      const why=top?`主要跟著<b>${fN[top[0]]||top[0]}</b>變動`:"";
      const near=r.best&&r.best.ev?`最近一件相關的事是「${r.best.ev.n}」（${r.best.ev.days>0?r.best.ev.days+" 天後":"今天"}）`:"";
      return `<li><b>${r.d.n}</b>（曝險分數 ${r.score}）：${why}${why&&near?"，":""}${near}。</li>`;
    }).join("");
  }
  function divLine(){
    const ds=NODES.filter(n=>n.L===1&&n.div&&n.days>=0&&n.days<=14);
    return ds.length?`<li>未來兩週有 ${ds.length} 檔 ETF 要除息，例如 ${ds.slice(0,3).map(e=>`${e.n.replace(" 除息","")}（${md(e)}）`).join("、")}。要領到配息，要在除息日前一個交易日（含）之前買進。</li>`:"";
  }
  function render(){
    const mkN=S.mkt==="us"?"美股":"台股";
    const ev=weekEvents();
    $("#gdBody").innerHTML=`
      <h2>白話導覽</h2>
      <p class="sub">一句話：<b>消息公布之前，先知道你的持股可能會被晃多大</b>。下面是依今天的資料自動整理的（目前看的是${mkN}，可在上方切換）。</p>
      <h3>這週要注意什麼</h3>
      <ul>${ev.length?ev.map(eventLine).join(""):"<li>這 7 天沒有重要的排定事件。</li>"}${divLine()}</ul>
      <h3>你的持股誰最容易被晃</h3>
      <ul>${exposureLines()}</ul>
      <p class="sub">「曝險分數」是把未來 30 天的事件加總，看哪一檔最容易被牽動（100 分最高）。它說的是<b>會晃多大</b>，不是會漲還是會跌。</p>
      <h3>怎麼看這個頁面</h3>
      <ul>
        <li><b>左邊</b>是接下來會發生的事。點一件，看它會沿著「事件 → 產業 → 個股」打到哪些股票、影響多大。</li>
        <li><b>右邊</b>是你的標的池。可以打代號或名稱加入自己的股票；點一檔，看未來有哪些事會牽動它。</li>
        <li><b>中間的圖</b>是傳導路徑：線越亮、點越大，代表影響越大。</li>
        <li>上方的<b>「統計 · 實證」</b>標籤裡，每個數字都標了可不可信（✓ 可信、△ 部分可信、✗ 不可信）。</li>
      </ul>
      <details><summary>名詞小抄（看不懂的字在這裡）</summary><dl>
        <dt>超額報酬</dt><dd>扣掉大盤漲跌之後，這個產業或股票自己多漲或多跌的部分。例如大盤漲 1%、它漲 3%，超額報酬就是約 2%。</dd>
        <dt>波動倍數</dt><dd>事件前後股價晃動的幅度，是平常的幾倍。×1.2 就是比平常多晃 20%。</dd>
        <dt>β（貝他）</dt><dd>跟著產業動的程度。β 0.8 代表產業漲 1%，這檔平均漲 0.8%。</dd>
        <dt>意外值</dt><dd>公布的數字和市場預期（共識）差多少。高於預期是正、低於預期是負。</dd>
        <dt>t 值</dt><dd>「訊號 ÷ 雜訊」。大約 2 以上才算不像運氣造成的。</dd>
        <dt>樣本外檢驗</dt><dd>用前一段時間的資料算出規律，再看後一段時間是不是還成立。能通過才代表不是碰巧。</dd>
        <dt>方向無法預測</dt><dd>過去的資料顯示，這類事件後股價往上或往下沒有穩定規律，所以不給方向，只告訴你可能會晃多大。</dd>
        <dt>放大器</dt><dd>外資、投信大買大賣，或融資融券突然變多時，同一件事造成的衝擊通常會比較大。</dd>
      </dl></details>
      <details><summary>資料從哪裡來（官方 API／官方網站／第三方）</summary><ul>
        <li><span class="tag up">官方 API</span>證交所 OpenAPI、櫃買中心 OpenAPI（除權除息預告與結果）；美國勞工統計局 BLS API（核心 CPI、非農就業）；
          SEC EDGAR（美股財報實際公布時刻）；Federal Register API（美國總統貿易／關稅文件）；聖路易聯準會 FRED（公債殖利率）${(CAL.fredOn?"、FRED API（美國數據官方發布排程）":"")}。</li>
        <li><span class="tag nu">官方網站</span>證交所／櫃買中心官方日線、三大法人、融資融券；公開資訊觀測站（法說會、月營收）；期交所（外資期貨部位）；
          中央銀行、主計總處、財政部；聯準會 FOMC 行事曆；BEA（PCE）、Census（零售銷售）發布時間表。</li>
        <li><span class="tag dn">第三方</span>Nasdaq（市場共識預期、財報 EPS 預估、美股全市場報價）、Yahoo Finance（美股與 ETF 長期價格、匯率、總經因子）。
          市場共識與美股歷史報價目前沒有免費的官方來源，所以使用第三方。</li>
      </ul></details>
      <p class="warn">每個交易日盤後自動更新。這裡的數字都是過去的統計，不是預測，也不是投資建議。</p>`;
  }
  const ov=$("#gdOv");
  function open(){render(); ov.hidden=false;}
  function close(){ov.hidden=true; try{localStorage.setItem("tcapsule.guide.v1","1")}catch(e){}}
  $("#cGuide").addEventListener("click",open);
  $("#gdX").addEventListener("click",close); $("#gdGo").addEventListener("click",close);
  ov.addEventListener("click",e=>{if(e.target===ov)close();});
  addEventListener("keydown",e=>{if(e.key==="Escape"&&!ov.hidden)close();});
  let seen=false; try{seen=localStorage.getItem("tcapsule.guide.v1")==="1"}catch(e){}
  if(!seen)setTimeout(open,1200);
})();
</script>
''' + src[_i:]
