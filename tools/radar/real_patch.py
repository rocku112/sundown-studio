# 由 build.py 以 exec 載入（最後一步）：把寫死的除息、領息、總經事件、ETF 關聯換成實際資料。
#   · 準備除息：證交所／櫃買中心除權除息預告表（成交值較大的 ETF）
#   · 近期已除息：證交所／櫃買中心除權除息計算結果表 ＋ 最新收盤價 → 填息進度（取代沒有官方來源的「領息」）
#   · 總經事件：市場傳導艙的官方排程（Nasdaq 經濟／財報行事曆、央行、主計總處、財政部、法定期限）
#   · 事件 × ETF：過去 10 年各類事件對每檔 ETF 的實證影響（calibrate.py 的 etf_impact），不再手選
# 資料都來自 twflow/web/data/capsule_calib.json 與 tw_all.json；頁面開啟時抓 GitHub Pages 上的最新版。
import json as _json, datetime as _dt
_cal = _json.loads((REPO / 'twflow/web/data/capsule_calib.json').read_text(encoding='utf-8'))
_tw = _json.loads((REPO / 'tools/capsule/twall.json').read_text(encoding='utf-8'))
_names, _w, _px = {}, {}, {}
for _l in _tw['data'].split('\n'):
    _a = _l.split('|')
    if _a[2] in ('1', '2'):
        _names[_a[0]] = _a[1]; _w[_a[0]] = int(_a[4])
        if _a[5]: _px[_a[0]] = [float(_a[5]), float(_a[6] or 0)]
_live = _cal.get('live', {})
RD = {'asof': _tw.get('date') or _cal.get('asof'), 'div': _live.get('div', []), 'recent': _live.get('div_recent', []),
      'up': _cal.get('upcoming', []), 'imp': _cal.get('etf_impact', {}), 'names': _names, 'w': _w, 'px': _px,
      'date_src': _cal.get('date_src', {})}

def _cut(a, b):
    global src
    i = src.index(a); j = src.index(b, i)
    return i, j

# ── 1) 資料區：改由 RD 推導 ──
_i, _j = _cut('(function(){\n  // ================= shared data =================', '  function pad(n)')
src = src[:_i] + r'''function radarRender(RD){
  // ================= 資料（RD：calibrate.py 每日輸出 ＋ twflow 收盤）=================
  var NAMES = RD.names || {}, W = RD.w || {}, PX = RD.px || {};
  var LIQ = 40;   // 只列成交值影響力 ≥ 40 的 ETF，避免幾十檔小型 ETF 洗版
  var exDiv = (RD.div || []).filter(function(x){ return (W[x[0]]||0) >= LIQ; }).map(function(x){
    return {code:x[0], name:NAMES[x[0]]||x[1], date:x[2], amount:x[3]!=null?String(x[3]):null, est:false, freq:x[5]||'', pay:null, src:x[4]};
  });
  var payment = (RD.recent || []).filter(function(x){ return (W[x[0]]||0) >= LIQ; }).map(function(x){
    var p = PX[x[0]];
    return {code:x[0], name:NAMES[x[0]]||x[1], date:x[2], pre:x[3], amount:String(x[4]), px:p?p[0]:null, src:x[5]};
  });
  var EVMETA = {
    fomc:{short:'FOMC 決策', name:'FOMC 利率決議', en:'FOMC Rate Decision', cat:'monetary', desc:'聯準會利率決議與聲明，影響美元、殖利率與外資動向。'},
    cbc:{short:'央行理監事會', name:'台灣央行理監事會', en:'Taiwan CBC Board Meeting', cat:'monetary', desc:'台灣央行利率與信用管制決議，影響金融股、高股息與債券 ETF。'},
    uscpi:{short:'美國 CPI', name:'美國核心 CPI', en:'US Core CPI', cat:'monetary', desc:'美國通膨數據，左右降息預期與利率敏感型 ETF。'},
    pce:{short:'美國 PCE', name:'美國核心 PCE 物價', en:'US Core PCE', cat:'monetary', desc:'聯準會偏好的通膨指標。'},
    nfp:{short:'非農就業', name:'美國非農就業', en:'US Nonfarm Payrolls', cat:'monetary', desc:'美國就業強弱，牽動降息機率與美元。'},
    umich:{short:'密大信心', name:'密大消費者信心初值', en:'UMich Consumer Sentiment', cat:'monetary', desc:'美國消費者信心與通膨預期。'},
    twcpi:{short:'台灣 CPI', name:'台灣 CPI', en:'Taiwan CPI', cat:'monetary', desc:'台灣物價，影響央行語氣與利率敏感型 ETF。'},
    tsmc:{short:'台積電法說', name:'台積電法說會', en:'TSMC Earnings Call', cat:'semiconductor', desc:'台積電財報與展望，牽動大盤與科技型 ETF。'},
    tsmcrev:{short:'台積電營收', name:'台積電月營收', en:'TSMC Monthly Revenue', cat:'semiconductor', desc:'台積電每月營收，台股權值最大的單一指標。'},
    nvda:{short:'NVIDIA 財報', name:'NVIDIA 財報', en:'NVIDIA Earnings', cat:'semiconductor', desc:'AI 伺服器需求的風向球，牽動台灣 AI 供應鏈。'},
    mu:{short:'美光財報', name:'美光財報', en:'Micron Earnings', cat:'semiconductor', desc:'記憶體與 HBM 景氣的風向球。'},
    aapl:{short:'Apple 財報', name:'Apple 財報', en:'Apple Earnings', cat:'semiconductor', desc:'消費電子需求，牽動組裝與零組件供應鏈。'},
    twexp:{short:'台灣出口', name:'台灣出口統計', en:'Taiwan Exports', cat:'market', desc:'財政部海關進出口統計，反映電子與資通訊出口動能。'},
    twrev:{short:'營收截止', name:'台股月營收公布截止', en:'Taiwan Monthly Revenue Deadline', cat:'market', desc:'上市櫃公司月營收的法定公布期限。'},
    twq:{short:'季報截止', name:'台股季報公布截止', en:'Taiwan Quarterly Report Deadline', cat:'market', desc:'上市櫃公司季報的法定公布期限。'},
    quad:{short:'四巫日', name:'四巫日（期權到期）', en:'Quadruple Witching', cat:'market', desc:'美國股票與指數期貨、選擇權同日到期，成交量與波動常放大。'},
    usret:{short:'美國零售', name:'美國零售銷售', en:'US Retail Sales', cat:'market', desc:'美國消費動能。'},
    ism:{short:'ISM 製造業', name:'美國 ISM 製造業指數', en:'US ISM Manufacturing', cat:'market', desc:'美國製造業景氣，50 以上為擴張。'},
    cnpmi:{short:'中國 PMI', name:'中國官方製造業 PMI', en:'China Official PMI', cat:'market', desc:'中國製造業景氣，影響原物料、面板與航運需求。'},
    banks:{short:'美銀行財報', name:'美國大型銀行財報', en:'US Big Bank Earnings', cat:'market', desc:'美國財報季開跑，金融業信用與放款狀況。'}
  };
  var EVENTS = (RD.up || []).map(function(u){
    var m = EVMETA[u.k] || {short:u.k, name:u.k, en:'', cat:'market', desc:''};
    var imp = (RD.imp && RD.imp[u.k]) || [];
    var sel = imp.filter(function(r){ return Math.abs(r[2]) >= 1; }).slice(0,8);
    if(sel.length < 4) sel = imp.slice(0,4);
    var cons = u.cons ? '　市場共識 '+u.cons+(u.prev?'（前值 '+u.prev+'）':'')+'。' : (u.prev ? '　前值 '+u.prev+'。' : '');
    return {id:u.k+'_'+u.d, k:u.k, short:m.short, name:m.name, en:m.en, date:u.d, time:u.t, cat:m.cat, est:false,
            desc:m.desc+cons+'　日期來源：'+u.src+'（台北時間 '+u.t+'）。', etfs:sel.map(function(r){ return r[0]; }), imp:sel, src:u.src};
  });
  var ETF_META = {}; Object.keys(NAMES).forEach(function(c){ ETF_META[c] = {name:NAMES[c]}; });
  var SNAPSHOT = RD.asof;
  var CATCOLOR = { monetary:'var(--gold-mid)', semiconductor:'var(--semi)', market:'var(--mkt)' };
  var CATLABEL = { monetary:'貨幣政策', semiconductor:'半導體供應鏈', market:'市場結算/貿易' };
  var GLOBE = { ex:'#E3864F', pay:'#9DBE7A', gold:'#E8B84B' };

''' + src[_j:]

# ── 2) 快照日期改成實際資料日 ──

# ── 3) 除息排行最多 15 檔；近期已除息改成填息追蹤 ──
rep("""      .sort(function(a,b){ return a.d-b.d; });
    if(!withDays.length)""", """      .sort(function(a,b){ return a.d-b.d || (W[b.code]||0)-(W[a.code]||0); }).slice(0,15);
    if(!withDays.length)""")
rep("""  var payList = renderList(payment, 'payRows', 30);""", """  /* 近期已除息：除息前收盤價 vs 最新收盤價 → 是否已填息 */
  function renderRecent(items, mountId){
    var mount = document.getElementById(mountId);
    var list = items.map(function(it){ return Object.assign({}, it, {d: -daysUntil(it.date)}); })
      .filter(function(it){ return it.d >= 0 && it.d <= 45; })
      .sort(function(a,b){ return a.d-b.d || (W[b.code]||0)-(W[a.code]||0); }).slice(0,12);
    if(!list.length){ mount.innerHTML = '<div class="empty"><b>近 45 天沒有除息的 ETF</b></div>'; return list; }
    mount.innerHTML = list.map(function(it,i){
      var st;
      if(it.px == null) st = '<div class="amt-line pending">無收盤價</div>';
      else if(it.px >= it.pre) st = '<div class="amt-line">已填息 <span class="est-tag">✓</span></div>';
      else st = '<div class="amt-line pending">距填息 '+((it.pre-it.px)/it.pre*100).toFixed(2)+'%</div>';
      return '<div class="row"><div class="rank">'+(i+1)+'</div><div class="code">'+it.code+'</div>'+
        '<div class="name-cell"><div class="name">'+it.name+'</div><div class="sub">'+fmtIso(it.date)+' 除息 · 配 '+(+it.amount)+' 元 · 除息前 '+it.pre+'</div>'+st+'</div>'+
        '<div class="cd-badge">'+it.d+' 天前</div></div>';
    }).join('');
    return list;
  }
  var payList = renderRecent(payment, 'payRows');""")
rep("""  document.getElementById('universeNote').innerHTML = '<b>追蹤清單(25 檔):</b> ' +
    UNIVERSE.map(function(c){ return '<span class="tk">'+c+'</span>'; }).join('　') +
    '　－ 僅落於 30 天視窗內的除息 / 領息事件會顯示於上方清單。';""",
    """  document.getElementById('univPill').innerHTML = '除息預告 <b>'+exDiv.length+'</b> 檔 ETF';
  document.getElementById('universeNote').innerHTML = '<b>資料來源：</b>準備除息＝證交所除權除息預告表（TWT48U）與櫃買中心除權除息預告；'+
    '近期已除息＝證交所除權除息計算結果表（TWT49U）與櫃買中心除權除息計算結果，填息以最新收盤價對照除息前收盤價；'+
    '總經事件＝Nasdaq 經濟／財報行事曆、中央銀行、主計總處、財政部與法定期限；事件 × ETF＝過去 10 年事件研究（意外值 β 或事件窗超額波動）。'+
    '只列成交值較大的 ETF。資料每個交易日盤後更新。';""")
rep("""    var payV = f.pay ? fmtIso(f.pay) : '待公布';""", """    var payV = f.pay ? fmtIso(f.pay) : '預告表未提供';""")

# ── 4) 事件影響：顯示每檔 ETF 的實證數字 ──
rep("""    var chips = ev.etfs.map(function(code){ var m=ETF_META[code]; return '<span class="imp-chip"><b>'+code+'</b><span>'+(m?m.name:'')+'</span></span>'; }).join('');""",
    """    var chips = (ev.imp||[]).map(function(r){ var m=ETF_META[r[0]];
      var stat = r[4]==='abs' ? ('超額波動 '+(r[1]>0?'+':'')+r[1].toFixed(2)+'%') : ('β '+(r[1]>0?'+':'')+r[1].toFixed(2)+'%／1σ');
      return '<span class="imp-chip"><b>'+r[0]+'</b><span>'+(m?m.name:'')+' · '+stat+' · t '+r[2].toFixed(1)+(Math.abs(r[2])>=1.96?' · 顯著':'')+(r[5]?' · 前後半同向':'')+'</span></span>'; }).join('');""")
rep("""<div class="imp-label">受影響 ETF ('+ev.etfs.length+')</div>""",
    """<div class="imp-label">過去 10 年反應最明顯的 ETF ('+ev.etfs.length+') · 依 |t| 排序</div><p style="font-size:12px;color:var(--text3);margin:4px 0 8px">這些數字只描述過去：同一套方法把事件分成前後兩半檢驗，前半期顯著的方向到後半期常常不成立，不能拿來預測這一次。</p>""")

# ── 5) 可重複繪製：清掉動態圖層、監聽器只綁一次；結尾改成先畫內嵌資料，再抓線上最新 ──
rep("""  var streamLayer = document.getElementById('streamLayer');
  var flowLayer = document.getElementById('flowLayer');""", """  var streamLayer = document.getElementById('streamLayer');
  var flowLayer = document.getElementById('flowLayer');
  streamLayer.innerHTML = ''; flowLayer.innerHTML = ''; document.getElementById('eventLayer').innerHTML = '';""")
rep("""  fsBtn.addEventListener('click', function(){""", """  if(!window.__radarInit){ window.__radarInit = true;
  fsBtn.addEventListener('click', function(){""")
rep("""      globeCard.classList.remove('is-full'); fsBtn.textContent = '⛶'; document.body.style.overflow = '';
    }
  });""", """      globeCard.classList.remove('is-full'); fsBtn.textContent = '⛶'; document.body.style.overflow = '';
    }
  });
  }""")
_k = src.rindex('  renderImpactEmpty();\n})();')
src = src[:_k] + '''  renderImpactEmpty();
}
var RADAR_DATA = ''' + _json.dumps(RD, ensure_ascii=False, separators=(',', ':')) + ''';
radarRender(RADAR_DATA);
/* 線上更新：抓 GitHub Pages 上 calibrate.py 與 twflow 的最新輸出，比內嵌新就重畫 */
(function(){
  var base = 'https://rocku112.github.io/sundown-studio/twflow/web/data/';
  function get(u){ return fetch(base+u, {cache:'no-cache'}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }); }
  Promise.all([get('capsule_calib.json'), get('tw_all.json')]).then(function(res){
    var cal = res[0], tw = res[1], L = cal.live || {};
    if(!tw.date || tw.date < RADAR_DATA.asof) return;
    var names = {}, w = {}, px = {};
    (tw.rows||[]).forEach(function(r){ if(r[2]!=='e') return;
      names[r[0]] = r[1]; px[r[0]] = [r[4], r[5]];
      var tt = (r[6]||0)*1000*(r[4]||0); w[r[0]] = tt>0 ? Math.max(5, Math.min(100, Math.round((Math.log10(tt)-6)*22))) : 5; });
    /* 線上版缺的欄位（例如舊版校準檔）沿用內嵌資料 */
    var E = RADAR_DATA;
    radarRender({asof:tw.date, div:(L.div&&L.div.length&&L.div[0].length>5)?L.div:E.div, recent:L.div_recent||E.recent,
                 up:cal.upcoming||E.up, imp:cal.etf_impact||E.imp, names:names, w:w, px:px, date_src:cal.date_src||E.date_src});
    document.getElementById('asOfPill').classList.add('live');
  }).catch(function(){});
})();
</script>''' + src[src.index('</script>', _k) + len('</script>'):]

# ── 6) 版面文字 ──
rep('<div class="pill">追蹤清單 <b>25</b> 檔 ETF</div>', '<div class="pill" id="univPill">除息預告 <b>—</b> 檔 ETF</div>')
rep('<div><h2>準備領息排行</h2><span>未來 30 天內</span></div>', '<div><h2>近期已除息 · 填息追蹤</h2><span>過去 45 天</span></div>')
rep('<span class="gl-dot" style="background:#9DBE7A"></span>準備領息 · 資金流入', '<span class="gl-dot" style="background:#9DBE7A"></span>近期已除息 · 填息追蹤')
rep('<div class="legend-item b"><i></i>準備領息</div>', '<div class="legend-item b"><i></i>近期已除息</div>')
rep('<div class="legend-item c"><i></i>預估數值</div>\n', '')
_i, _j = _cut('<p id="footNote">', '</p>')
src = src[:_i] + '''<p id="footNote">
      準備除息取自證交所與櫃買中心的除權除息預告表，金額尚未公告者標示「待公布」；近期已除息取自除權除息計算結果表，填息以最新收盤價對照除息前收盤價判斷。
      總經事件的日期與公布時刻取自 Nasdaq 經濟／財報行事曆、中央銀行、主計總處、財政部與法定期限；事件與 ETF 的關聯是過去 10 年的事件研究結果
      （有市場共識或意外值的事件估 β，其餘估事件窗超額波動），是歷史統計關聯，不是預測，也不構成投資建議。
      地球儀上的光點位置是排版，不代表地理或數值；赤陶色為即將除息（配息自基金淨值撥出）、抹茶綠為近期已除息，金色虛線連到該事件過去反應最明顯的 ETF。
    ''' + src[_j:]
src = src.replace("gt.textContent = isStale ? '30 天內無除息/領息事件 · 資料待更新' : '30 天內無除息/領息事件';",
                  "gt.textContent = isStale ? '30 天內無除息事件 · 資料待更新' : '30 天內無除息事件';")
