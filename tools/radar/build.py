import re, pathlib, sys
d = pathlib.Path(__file__).resolve().parent
REPO = d.parent.parent
OUT_HTML = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else d / 'index.html'   # 直接輸出給 GitHub Pages（tools/…/）
src = (d / 'orig.html').read_text(encoding='utf-8')
css = (d / 'style.css').read_text(encoding='utf-8')

def rep(old, new, count=1):
    global src
    if src.count(old) < 1:
        raise SystemExit('NOT FOUND: ' + old[:80])
    src = src.replace(old, new, count)

# head / title / css
rep('<title>除權息雷達 (Copy)</title>', '<title>ETF 除權息雷達</title>')
src = re.sub(r'<style>\n  @import url\(\'https://fonts.googleapis.com/css2\?family=Oswald.*?</style>', lambda m: css.strip(), src, count=1, flags=re.S)
rep(':root{color-scheme:light}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}',
    ':root{color-scheme:light dark}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#F5F0E8;color:#1A2535}')

# header with SunDown logo
LOGO = '''<svg viewBox="0 0 512 512" fill="none" aria-hidden="true">
          <defs><clipPath id="sd-clip"><circle cx="256" cy="256" r="240"/></clipPath></defs>
          <circle cx="256" cy="256" r="256" fill="#1E3554"/>
          <path d="M16 256 A240 240 0 0 1 496 256" fill="#E8B84B" clip-path="url(#sd-clip)"/>
          <line x1="62" y1="295" x2="450" y2="295" stroke="#fff" stroke-width="26" stroke-linecap="round" opacity=".85"/>
          <line x1="96" y1="338" x2="416" y2="338" stroke="#fff" stroke-width="22" stroke-linecap="round" opacity=".65"/>
          <line x1="138" y1="378" x2="374" y2="378" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".45"/>
          <line x1="178" y1="413" x2="334" y2="413" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".28"/>
        </svg>'''
src = re.sub(r'<div class="brand-mark">.*?</div>\n      <div class="brand-text">\n        <h1>ETF 除權息雷達</h1>\n        <p>Dividend &amp; Macro Event Radar</p>',
    lambda m: '<div class="brand-mark">\n        ' + LOGO + '\n      </div>\n      <div class="brand-text">\n        <div class="brand-over">SunDown Studio <span>· 日落工作室</span></div>\n        <h1>ETF 除權息<em>雷達</em></h1>\n        <p>Dividend &amp; Macro Event Radar</p>',
    src, count=1, flags=re.S)
rep('<div class="pill"><span class="dot"></span>資料快照 <b id="asOf">2026 / 09 / 13</b></div>',
    '<div class="pill" id="asOfPill"><span class="dot"></span>資料快照 <b id="asOf">2026/09/13</b></div>')

# globe svg recolor
rep('<stop offset="0%" stop-color="#123a6e"></stop>', '<stop offset="0%" stop-color="#3A5A84"></stop>')
rep('<stop offset="55%" stop-color="#0a1c3a"></stop>', '<stop offset="55%" stop-color="#22395A"></stop>')
rep('<stop offset="100%" stop-color="#020509"></stop>', '<stop offset="100%" stop-color="#0F1C30"></stop>')
rep('<path d="M0,0 L5.5,2.5 L0,5 Z" fill="#f2c14e"></path>', '<path d="M0,0 L5.5,2.5 L0,5 Z" fill="#E8B84B"></path>')
rep('<g id="gridGroup" stroke="#3fa9ff" stroke-width="1" fill="none" opacity="0.5">', '<g id="gridGroup" stroke="#F2CC74" stroke-width="1" fill="none" opacity="0.28">')
rep('<g fill="#bfe9ff" opacity="0.9" id="taiwanDots">', '<g fill="#F2CC74" opacity="0.95" id="taiwanDots">')
rep('stroke="var(--neon)" stroke-width="2" opacity="0.85" filter="url(#rimGlow)"', 'stroke="#E8B84B" stroke-width="2" opacity="0.8" filter="url(#rimGlow)"')
rep('stroke="rgba(148,168,214,0.25)" stroke-width="1" stroke-dasharray="2 6"', 'stroke="rgba(242,204,116,0.3)" stroke-width="1" stroke-dasharray="2 6"')
src = src.replace('rgba(148,168,214,0.4)', 'rgba(242,204,116,0.4)').replace('rgba(148,168,214,0.5)', 'rgba(242,204,116,0.5)')
src = src.replace('fill="#9aabce" font-size="7" font-family="Oswald,sans-serif"', 'fill="#C9D3E2" font-size="7" font-family="Jost,sans-serif"')
rep('<div class="l2" style="font-size:11px;">TOWARD SMARTER</div>', '<div class="l2" style="font-size:12px;">TOWARD SMARTER</div>')
rep('<div class="l3" style="font-size:11px;">INCOME CALLS</div>', '<div class="l3" style="font-size:12px;">INCOME CALLS</div>')

# globe legend colors
rep('<span class="gl-dot" style="background:var(--pink);box-shadow:0 0 6px var(--pink)"></span>', '<span class="gl-dot" style="background:#E3864F"></span>')
rep('<span class="gl-dot" style="background:var(--cyan);box-shadow:0 0 6px var(--cyan)"></span>', '<span class="gl-dot" style="background:#9DBE7A"></span>')

# detail icon
rep('<div class="ic" style="background:var(--pink-glow);color:var(--pink)">', '<div class="ic" style="background:var(--ex-bg);color:var(--ex)">')

# category legend
rep('<div class="li"><i style="background:var(--gold)"></i>貨幣政策</div>', '<div class="li"><i style="background:var(--gold-mid)"></i>貨幣政策</div>')
rep('<div class="li"><i style="background:var(--cyan)"></i>半導體供應鏈</div>', '<div class="li"><i style="background:var(--semi)"></i>半導體供應鏈</div>')
rep('<div class="li"><i style="background:var(--pink)"></i>市場結算/貿易</div>', '<div class="li"><i style="background:var(--mkt)"></i>市場結算/貿易</div>')

# foot note: color words
rep('粉色為除息日資金自基金淨值撥出(流出)、青色為領息日現金入帳受益人(流入)', '赤陶色為除息日資金自基金淨值撥出(流出)、抹茶綠為領息日現金入帳受益人(流入)')
rep('<div class="universe" id="universeNote"></div>', '<div class="universe" id="universeNote"></div>\n\n  <div class="sd-sign"><i></i>Made by <span>SunDown Studio</span> 日落工作室</div>')

# ---------------- JS ----------------
rep("var CATCOLOR = { monetary:'#f2c14e', semiconductor:'#4fe0cf', market:'#ff5d8f' };",
    "var SNAPSHOT = '2026-09-13';\n  var CATCOLOR = { monetary:'var(--gold-mid)', semiconductor:'var(--semi)', market:'var(--mkt)' };\n  var GLOBE = { ex:'#E3864F', pay:'#9DBE7A', gold:'#E8B84B' };")

rep("""    if(!withDays.length){ mount.innerHTML = '<div class="empty">未來 '+windowDays+' 天內暫無符合事件</div>'; return withDays; }""",
    """    if(!withDays.length){ mount.innerHTML = '<div class="empty"><b>未來 '+windowDays+' 天內暫無符合事件</b>'+(isStale?'資料快照為 '+fmtIso(SNAPSHOT)+'，待更新':'')+'</div>'; return withDays; }""")

rep("""  var exList = renderList(exDiv, 'exRows', 30);
  renderList(payment, 'payRows', 30);

  document.getElementById('asOf').textContent = fmtDate(new Date());""",
    """  var staleDays = -daysUntil(SNAPSHOT);
  var isStale = staleDays > 14;
  var exList = renderList(exDiv, 'exRows', 30);
  var payList = renderList(payment, 'payRows', 30);

  document.getElementById('asOf').textContent = fmtIso(SNAPSHOT) + (isStale ? '（'+staleDays+' 天前）' : '');
  if(isStale) document.getElementById('asOfPill').classList.add('stale');
  document.getElementById('detailUpdated').textContent = fmtIso(SNAPSHOT);""")

rep("""    var f = (exList && exList[0]) || exDiv[0];
    var d = daysUntil(f.date);""",
    """    var f = exList && exList[0];
    if(!f){
      document.getElementById('detailBody').innerHTML = '<div class="empty"><b>目前沒有 30 天內除息的標的</b>'+(isStale?'資料快照 '+fmtIso(SNAPSHOT)+' 已過期，更新後會自動帶出最快除息的 ETF。':'')+'</div>';
      return;
    }
    var d = f.d;""")
rep("""'<div class="note-block"><div class="lbl">配息金額</div><p style="font-size:16px;color:var(--ink);font-family:\\'IBM Plex Mono\\',monospace;margin-bottom:10px;">'+amtV+'</p>'+""",
    """'<div class="note-block"><div class="lbl">配息金額</div><div class="amt">'+amtV+'</div>'+""")

rep("""    var withDays = EVENTS.map(function(e){ return Object.assign({}, e, {d: daysUntil(e.date)}); }).sort(function(a,b){ return a.d-b.d; });
    var next = withDays[0];
    var avg = (EVENTS.reduce(function(s,e){ return s+e.etfs.length; },0)/EVENTS.length).toFixed(1);
    var top3 = withDays.slice(0,3);
    document.getElementById('miniMacroBody').innerHTML =""",
    """    var withDays = EVENTS.map(function(e){ return Object.assign({}, e, {d: daysUntil(e.date)}); })
      .filter(function(e){ return e.d>=0; }).sort(function(a,b){ return a.d-b.d; });
    if(!withDays.length){
      document.getElementById('miniMacroBody').innerHTML = '<div class="empty"><b>近期事件都已發生</b>待更新總經行事曆</div>';
      return;
    }
    var next = withDays[0];
    var in45 = withDays.filter(function(e){ return e.d<=45; });
    var avg = (withDays.reduce(function(s,e){ return s+e.etfs.length; },0)/withDays.length).toFixed(1);
    var top3 = withDays.slice(0,3);
    document.getElementById('miniMacroBody').innerHTML =""")
rep("""'<div class="stat-grid"><div class="metric"><div class="k">未來 45 天事件數</div><div class="v">'+EVENTS.length+' 個</div></div>'+""",
    """'<div class="stat-grid"><div class="metric"><div class="k">未來 45 天事件</div><div class="v">'+in45.length+' 個</div></div>'+""")
rep("""return '<div class="mini-item"><i style="background:'+CATCOLOR[e.cat]+';box-shadow:0 0 5px '+CATCOLOR[e.cat]+'"></i>""",
    """return '<div class="mini-item"><i style="background:'+CATCOLOR[e.cat]+'"></i>""")

# globe: only plot items inside the 30-day window
rep("""  var flowItems = exDiv.map(function(x){ return {code:x.code, hex:'#ff5d8f', kind:'out'}; })
    .concat(payment.map(function(x){ return {code:x.code, hex:'#4fe0cf', kind:'in'}; }));""",
    """  var flowItems = exList.map(function(x){ return {code:x.code, hex:GLOBE.ex, kind:'out'}; })
    .concat(payList.map(function(x){ return {code:x.code, hex:GLOBE.pay, kind:'in'}; }));""")
rep("""  var withDaysAll = EVENTS.map(function(e){ return Object.assign({}, e, {d: daysUntil(e.date)}); }).sort(function(a,b){ return a.d-b.d; });
  var topEvents = withDaysAll.slice(0,4);""",
    """  var withDaysAll = EVENTS.map(function(e){ return Object.assign({}, e, {d: daysUntil(e.date)}); })
    .filter(function(e){ return e.d>=0; }).sort(function(a,b){ return a.d-b.d; });
  var topEvents = withDaysAll.slice(0,4);
  if(!flowItems.length){
    var gt = el('text', {x:CX, y:CY+272, 'text-anchor':'middle', 'class':'globe-empty'});
    gt.textContent = isStale ? '30 天內無除息/領息事件 · 資料待更新' : '30 天內無除息/領息事件';
    flowLayer.appendChild(gt);
  }""")
rep("""streamLine(p.x,p.y,h.x,h.y,'#f2c14e',{""", """streamLine(p.x,p.y,h.x,h.y,GLOBE.gold,{""")
rep("""fill:'#f2c14e', 'class':'glow', filter:'url(#nodeGlow)'""", """fill:GLOBE.gold, 'class':'glow', filter:'url(#nodeGlow)'""")

# event strip: chronological, past events dimmed
rep("""  stripMount.innerHTML = EVENTS.map(function(ev){
    var d = daysUntil(ev.date);
    var ddTxt = d>=0 ? ('D-'+d) : '已發生';
    return '<div class="event-row" data-id="'+ev.id+'" style="--cat:'+CATCOLOR[ev.cat]+'"><span class="swatch"></span>'+""",
    """  stripMount.innerHTML = EVENTS.slice().sort(function(a,b){
    var da=daysUntil(a.date), db=daysUntil(b.date);
    if((da<0)!==(db<0)) return da<0 ? 1 : -1;
    return da<0 ? db-da : da-db;
  }).map(function(ev){
    var d = daysUntil(ev.date);
    var ddTxt = d>=0 ? ('D-'+d) : '已發生';
    return '<div class="event-row'+(d<0?' past':'')+'" data-id="'+ev.id+'" style="--cat:'+CATCOLOR[ev.cat]+'">'+""")
rep("""' <span class="est-tag" style="border-color:var(--cat);color:var(--cat)">預估</span>'""", """' <span class="est-tag">預估</span>'""")

exec((d / 'real_patch.py').read_text(encoding='utf-8'))
OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
OUT_HTML.write_text(src, encoding='utf-8')
for bad in ['--pink','--cyan','--ink','IBM Plex','Oswald','--neon','--hair']:
    if bad in src: print('LEFTOVER', bad, src.count(bad))
print('ok', len(src))
