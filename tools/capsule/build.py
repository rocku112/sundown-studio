import re, pathlib, sys
d = pathlib.Path(__file__).resolve().parent
REPO = d.parent.parent
OUT_HTML = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else d / 'dist' / 'index.html'
src = (d / 'orig.html').read_text(encoding='utf-8')

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n < 1:
        raise SystemExit('NOT FOUND: ' + old[:90])
    if count == 1 and n > 1:
        raise SystemExit(f'AMBIGUOUS ({n}): ' + old[:90])
    src = src.replace(old, new) if count == 0 else src.replace(old, new, count)

# ───────────────────────── head ─────────────────────────
rep('<title>市場傳導艙 (Copy)</title>', '<title>市場傳導艙</title>')
rep(':root{color-scheme:light;box-sizing', ':root{color-scheme:light dark;box-sizing')
rep('background:#faf9f5;color:#141413}', 'background:#F5F0E8;color:#1A2535}')
rep('family=Barlow+Condensed:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700;900',
    'family=Jost:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300&family=Noto+Sans+TC:wght@400;500;700;900')

# ───────────────────────── CSS ─────────────────────────
s0 = src.index('<style>\n:root{')
s1 = src.index('</style>', s0)
css = src[s0:s1]

css = css.replace('''  --void:#04060A;
  --line:rgba(126,152,190,.14); --line-hi:rgba(126,152,190,.34);
  --ink:#E4EDF8; --dim:#8397B4; --faint:#55657F; --ghost:#36435A;
  --l1:#A78BFA; --l1-ink:#CDBEFF;
  --l2:#45C8F0; --l2-ink:#96E4FF;
  --l3:#F2B33D; --l3-ink:#FFDC96;
  --l4:#E4EDF8;
  --bull:#FF4D5E; --bear:#17D492;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --cond:"Barlow Condensed","Noto Sans TC",system-ui,sans-serif;
  --sans:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;''',
'''  /* SunDown Studio 品牌色：米白底 · 海軍藍 · 日落金 · 赤陶 · 抹茶 */
  --void:#F5F0E8; --card:#FEFCF8; --card2:#FAF6EE;
  --line:rgba(30,53,84,.11); --line-hi:#DDD6C8;
  --ink:#1A2535; --dim:#4A5568; --faint:#8A96A8; --ghost:#B4BCC8;
  --l1:#C0622A; --l1-ink:#7A3010;
  --l2:#5E8A3E; --l2-ink:#2E4E20;
  --l3:#C9960A; --l3-ink:#8a5e00;
  --l4:#1E3554;
  --navy:#1E3554; --gold-mid:#E8B84B; --gold-pale:#FDF4DC;
  --bull:#B03020; --bear:#1D9E75;
  --shadow:0 1px 2px rgba(30,53,84,.04),0 10px 28px -18px rgba(30,53,84,.28);
  --mono:"Jost","Noto Sans TC",system-ui,sans-serif;
  --cond:"Jost","Noto Sans TC",system-ui,sans-serif;
  --sans:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;''')
if '--card:#FEFCF8' not in css: raise SystemExit('root vars not replaced')

for a, b in [
    ('rgba(242,179,61,', 'rgba(201,150,10,'),
    ('rgba(126,152,190,', 'rgba(30,53,84,'),
    ('rgba(167,139,250,', 'rgba(192,98,42,'),
    ('rgba(69,200,240,', 'rgba(94,138,62,'),
    ('linear-gradient(180deg,rgba(9,13,22,.96),rgba(6,9,16,.93))', 'var(--card)'),
    ('linear-gradient(180deg,rgba(9,13,22,.88),rgba(6,9,16,.8))', 'var(--card)'),
    ('#FF8A97', '#B03020'),
    ('rgba(92,30,39,.3)', 'rgba(176,48,32,.08)'),
    ('rgba(255,138,151,.6)', 'rgba(176,48,32,.4)'),
    ('rgba(255,77,94,.35)', 'rgba(176,48,32,.3)'),
    ('rgba(23,212,146,.35)', 'rgba(29,158,117,.3)'),
    ('rgba(4,6,10,.92)', 'rgba(245,240,232,.94)'),
    ('background:rgba(6,9,16,.9);', 'background:var(--card);'),
    ('background:rgba(5,8,14,.9)', 'background:var(--card)'),
]:
    if a not in css: raise SystemExit('CSS color not found: ' + a)
    css = css.replace(a, b)

# 背景：桌機整片是夜空海軍藍（圖譜），面板改成米白卡片
css = css.replace('#app{position:fixed;inset:0;background:radial-gradient(140% 100% at 50% 46%,#0C1020 0%,#070A12 46%,#04060A 100%)}',
  '#app{position:fixed;inset:0;background:radial-gradient(70% 45% at 47% 100%,rgba(232,184,75,.20),transparent 70%),linear-gradient(180deg,#1E3554 0%,#172A45 58%,#13233A 100%)}')
css = css.replace('''  background:radial-gradient(120% 100% at 50% 45%,#0C1020 0%,#070A12 55%,#04060A 100%)}''',
  '''  background:radial-gradient(80% 50% at 50% 100%,rgba(232,184,75,.22),transparent 70%),linear-gradient(180deg,#1E3554 0%,#172A45 60%,#13233A 100%);border-radius:10px;box-shadow:var(--shadow)}''')
# 品牌標誌
css = css.replace('''.glyph{width:31px;height:31px;flex:none;position:relative;border:1px solid rgba(201,150,10,.5);
  background:#120E05;display:grid;place-items:center}
.glyph::before{content:"";position:absolute;inset:4px;border:1px solid rgba(201,150,10,.28)}
.glyph span{font-family:var(--cond);font-weight:700;font-size:14px;color:var(--l3)}''',
  '''.glyph{width:38px;height:38px;flex:none}
.glyph svg{width:100%;height:100%;display:block}''')
# 故事區的深色文字陰影不再需要
css = css.replace('text-wrap:balance;max-width:48ch;text-shadow:0 2px 18px rgba(4,6,10,.96),0 0 44px rgba(4,6,10,.86)}', 'text-wrap:balance;max-width:48ch}')
css = css.replace('''.story p{margin:9px 0 0;font-size:11.5px;line-height:1.8;color:var(--faint);max-width:66ch;
  text-shadow:0 1px 12px rgba(4,6,10,.96)}''', '.story p{margin:9px 0 0;font-size:11.5px;line-height:1.8;color:var(--faint);max-width:66ch}')

# Bug：.sc 同時是「分數欄」與「情境列」→ 清單分數欄多出上框線
css = css.replace('.sc{padding:6px 0;border-top:1px solid rgba(30,53,84,.10)}', '.res .sc{padding:6px 0;border-top:1px solid rgba(30,53,84,.10)}')
# Bug：.pos 同時是「持倉列」與「正向標籤」→ 正向標籤被套成四欄 grid、撐得很寬
css = css.replace('.pos{display:grid;grid-template-columns:minmax(0,1fr) 56px 56px 56px;', '.row.po .pos{display:grid;grid-template-columns:minmax(0,1fr) 56px 56px 56px;')
css = css.replace('.pos .nm{font-size:11.5px;', '.row.po .pos .nm{font-size:11.5px;')
css = css.replace('.pos .nm s{display:block;', '.row.po .pos .nm s{display:block;')
css = css.replace(':root.m .pos{grid-template-columns:', ':root.m .row.po .pos{grid-template-columns:')
for chk in ['.res .sc{', '.row.po .pos{', '.row.po .pos .nm{', ':root.m .row.po .pos{', '.glyph svg', '#13233A 100%)}']:
    if chk not in css: raise SystemExit('CSS edit missing: ' + chk)

css += '''
/* ════════ SunDown 卡片層 ════════ */
.bar{background:var(--card);border:1px solid var(--line-hi);border-top:3px solid var(--gold-mid);border-radius:8px;
  padding:9px 16px;box-shadow:var(--shadow)}
.brand h1{color:var(--navy);letter-spacing:.12em}
.brand h1 em{font-style:italic;font-weight:300;color:var(--gold-mid);letter-spacing:.04em}
.brand .en{font-family:var(--cond);font-weight:700;color:var(--l3);letter-spacing:.24em}
.brand .en span{color:var(--faint);font-weight:500}
.tabs{border-color:var(--line-hi);border-radius:4px;overflow:hidden}
.tabs button[aria-pressed="true"]{color:var(--navy);background:var(--gold-pale);font-weight:700}
.chip{border-color:var(--line-hi);border-radius:999px;background:var(--card2)}
.chip.on,.chip.demo{color:var(--l3-ink)}
.stamp .v{color:var(--navy);font-weight:600}
.pnl{background:var(--card);border:1px solid var(--line-hi);border-radius:8px;padding:12px 14px;box-shadow:var(--shadow)}
.pnl#evPnl{border-top:3px solid var(--l1)} .pnl#expoPnl{border-top:3px solid var(--l3)}
.pnl-h h2,.pool-h h2{color:var(--navy);font-weight:800}
.res{border-radius:8px;border-top:3px solid var(--navy);box-shadow:var(--shadow)}
.pool{border-radius:8px;border-top:3px solid var(--l2);box-shadow:var(--shadow)}
.res-hd h2{color:var(--navy)}
.res-k{font-weight:700}
.story{background:var(--card);border:1px solid var(--line-hi);border-radius:8px;padding:14px 18px;box-shadow:var(--shadow)}
.story h3{color:var(--navy)}
.story h3 b{color:var(--l3-ink);font-weight:800}
.story h3 em{color:var(--l1);font-weight:700}
.story .eyebrow{color:var(--l3);font-weight:700}
.card{background:var(--card2);border-radius:0 6px 6px 0}
.card .v b{color:var(--l3-ink);font-weight:700}
.card .v em{color:var(--l1)}
.legend{color:var(--dim)}
.legend i{border-radius:50%;box-shadow:0 0 0 1px rgba(30,53,84,.25)}
.xp .sc b,.hitrow .str b{font-weight:700}
.row.pl .xp .sc b{color:var(--navy)}
.ev .d{border-radius:4px;background:#FAEEE8;border-color:rgba(192,98,42,.25)}
.ev .d b{font-weight:700}
.ev.dv .d{background:var(--gold-pale);border-color:rgba(201,150,10,.35);color:var(--l3-ink)}
.ev.pay .d{background:#EEF4E8;border-color:rgba(94,138,62,.35);color:var(--l2-ink)}
.ev .kt{display:inline-block;font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.06em;
  padding:0 5px;margin-right:5px;border-radius:3px;vertical-align:1px}
.ev.dv .kt{color:var(--l3-ink);background:var(--gold-pale);border:1px solid rgba(201,150,10,.35)}
.ev.pay .kt{color:var(--l2-ink);background:#EEF4E8;border:1px solid rgba(94,138,62,.35)}
.ev.dv .lv{background:var(--l3);box-shadow:none} .ev.pay .lv{background:var(--l2);box-shadow:none}
.evf{margin-left:8px}
.pnl-h{flex-wrap:wrap;row-gap:6px}
:root:not(.m) .pnl-s{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
:root:not(.m) .pnl-s:hover{-webkit-line-clamp:unset}
.evf button{height:20px;padding:0 8px;font-size:10px}
.divbox{border:1px solid rgba(201,150,10,.35);background:var(--gold-pale);border-radius:6px;padding:10px 12px}
.divbox.pay{border-color:rgba(94,138,62,.35);background:#EEF4E8}
.divgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;margin-bottom:8px}
.divgrid div{font-size:10px;font-weight:700;letter-spacing:.14em;color:var(--faint)}
.divgrid b{display:block;font-family:var(--mono);font-size:15px;letter-spacing:0;color:var(--navy);margin-top:2px}
.divgrid b.hl{color:var(--l1)}
.divbox p{margin:0;font-size:11.5px;line-height:1.75;color:var(--dim)}
.divadd{margin-top:9px;height:28px;padding:0 12px;border:1px solid var(--navy);border-radius:3px;
  background:var(--navy);color:#fff;font-size:11.5px;font-weight:600;letter-spacing:.06em}
.divadd[disabled]{background:none;color:var(--faint);border-color:var(--line-hi);cursor:default}
.est{font-style:normal;font-size:9px;font-weight:700;color:var(--l3-ink);border:1px solid rgba(201,150,10,.4);
  border-radius:3px;padding:0 4px;margin-left:5px;vertical-align:2px;font-family:var(--cond)}
.sd-sign{display:flex;align-items:center;gap:7px;font-family:var(--cond);font-size:10px;font-weight:700;
  letter-spacing:.2em;text-transform:uppercase;color:var(--faint);margin-top:10px}
.sd-sign i{width:6px;height:6px;border-radius:50%;background:var(--gold-mid)}
.sd-sign span{color:var(--l3)}
:root.m .stage-slot{border:none}
:root.m .stage-bar{border-top:1px solid rgba(242,204,116,.18);background:#13233A}
:root.m .stage-hint{color:#C9D3E2}
:root.m .zbtns button{color:#F5F0E8;border-color:rgba(242,204,116,.3);background:rgba(245,240,232,.06)}
:root.m .pnl,:root.m .res,:root.m .pool,:root.m .story,:root.m .bar{border-radius:8px}
:root.m #app{background:var(--void)}
@media (max-width:1280px){:root:not(.m) #app{background:linear-gradient(180deg,#1E3554 0%,#13233A 100%)}}

/* ════════ 深色模式 ════════ */
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --void:#101B2B; --card:#16253A; --card2:#192A41; --line:rgba(201,211,226,.10); --line-hi:#2A3C55;
    --ink:#EDE7D9; --dim:#B4BFCF; --faint:#7D8BA0; --ghost:#4A5A72;
    --l1:#E3864F; --l1-ink:#F0A97E; --l2:#9DBE7A; --l2-ink:#B9D59A; --l3:#E8B84B; --l3-ink:#F2CC74;
    --l4:#E9E2D4; --navy:#E9E2D4; --gold-pale:rgba(232,184,75,.12); --bull:#E06A55; --bear:#4CC39C;
    --shadow:0 10px 28px -16px rgba(0,0,0,.6);
  }
  :root:not([data-theme="light"]) .ev .d{background:rgba(227,134,79,.12)}
  :root:not([data-theme="light"]) .ev.pay .d,:root:not([data-theme="light"]) .ev.pay .kt,:root:not([data-theme="light"]) .divbox.pay{background:rgba(157,190,122,.12)}
  :root:not([data-theme="light"]) .divadd{color:#101B2B}
  :root:not([data-theme="light"]).m .mnav{background:rgba(16,27,43,.94)}
}
:root[data-theme="dark"].m .mnav{background:rgba(16,27,43,.94)}
:root[data-theme="dark"]{
  --void:#101B2B; --card:#16253A; --card2:#192A41; --line:rgba(201,211,226,.10); --line-hi:#2A3C55;
  --ink:#EDE7D9; --dim:#B4BFCF; --faint:#7D8BA0; --ghost:#4A5A72;
  --l1:#E3864F; --l1-ink:#F0A97E; --l2:#9DBE7A; --l2-ink:#B9D59A; --l3:#E8B84B; --l3-ink:#F2CC74;
  --l4:#E9E2D4; --navy:#E9E2D4; --gold-pale:rgba(232,184,75,.12); --bull:#E06A55; --bear:#4CC39C;
  --shadow:0 10px 28px -16px rgba(0,0,0,.6);
}
'''
src = src[:s0] + css + src[s1:]

# ───────────────────────── HTML ─────────────────────────
LOGO = ('<svg viewBox="0 0 512 512" fill="none" aria-hidden="true"><defs><clipPath id="sdclip"><circle cx="256" cy="256" r="240"/></clipPath></defs>'
        '<circle cx="256" cy="256" r="256" fill="#1E3554"/><path d="M16 256 A240 240 0 0 1 496 256" fill="#E8B84B" clip-path="url(#sdclip)"/>'
        '<line x1="62" y1="295" x2="450" y2="295" stroke="#fff" stroke-width="26" stroke-linecap="round" opacity=".85"/>'
        '<line x1="96" y1="338" x2="416" y2="338" stroke="#fff" stroke-width="22" stroke-linecap="round" opacity=".65"/>'
        '<line x1="138" y1="378" x2="374" y2="378" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".45"/>'
        '<line x1="178" y1="413" x2="334" y2="413" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".28"/></svg>')
rep('<div class="glyph"><span>方</span></div>\n        <div><h1>市場傳導艙</h1><div class="en">Transmission · 方舟運算</div></div>',
    '<div class="glyph">' + LOGO + '</div>\n        <div><h1>市場傳導<em>艙</em></h1><div class="en">SunDown Studio <span>· Transmission</span></div></div>')
rep('<div class="pnl-h"><h2>接下來會發生的事</h2><span class="n" id="evN">—</span></div>',
    '<div class="pnl-h"><h2>接下來會發生的事</h2>\n          <div class="tabs sm evf" id="evFilter" role="group" aria-label="事件類型">\n            <button data-f="all" aria-pressed="true">全部</button>\n            <button data-f="macro" aria-pressed="false">總經</button>\n            <button data-f="div" aria-pressed="false">配息</button>\n          </div><span class="n" id="evN">—</span></div>')
rep('''<p class="pnl-s">總經公布與重大排程，<strong style="color:var(--dim)">每天自動汰除過期事件、補進新的高影響力排程</strong>。
          點一件事，看它沿著傳導鏈走到你手上的東西。排程為示意，實際以官方公告為準。</p>''',
    '''<p class="pnl-s">總經公布、重大排程與 <strong style="color:var(--l3-ink)">ETF 除息／領息</strong>，<strong style="color:var(--dim)">每天自動汰除過期事件、補進新的排程</strong>。
          點一件事，看它沿著傳導鏈走到你手上的東西。總經排程為規則推算，配息日期取自投信公告整理，實際以官方公告為準。</p>''')
rep('''        <span id="lg1">事件排程 · 未來會發生的事<i style="background:var(--l1);box-shadow:0 0 8px var(--l1)"></i></span>
        <span>產業板塊 · 方舟觀測<i style="background:var(--l2);box-shadow:0 0 8px var(--l2)"></i></span>
        <span id="lg3">籌碼 · 傳導的放大器<i style="background:var(--l3);box-shadow:0 0 8px var(--l3)"></i></span>
        <span>產業個股 · 金環＝事件曝險前五<i style="background:var(--l4)"></i></span>''',
    '''        <span id="lg1">事件排程 · 含除息／領息<i style="background:#E3864F"></i></span>
        <span>產業板塊 · 方舟觀測<i style="background:#9DBE7A"></i></span>
        <span id="lg3">籌碼 · 傳導的放大器<i style="background:#E8B84B"></i></span>
        <span>產業個股 · 金環＝事件曝險前五<i style="background:#F5F0E8"></i></span>
        <span class="sd-sign"><i></i>Made by <span>SunDown Studio</span></span>''')

# ───────────────────────── 資料修正 ─────────────────────────
rep('["00943","兆豐台灣晶圓製造","tw_fnd",34,14.60,0.88,1]', '["00943","兆豐電子高息等權","tw_pc",34,14.60,0.88,1]')
rep('["00947","台新臺灣IC設計","tw_icd",26,14.20,0.94,1],["00918","大華優利高填息30","tw_pc",32,20.40,0.42,1],',
    '["00947","台新臺灣IC設計","tw_icd",26,14.20,0.94,1],["00918","大華優利高填息30","tw_pc",32,20.40,0.42,1],\n'
    ' ["00922","國泰台灣領袖50","tw_fnd",40,24.60,0.72,1],["00904","台新臺灣半導體30","tw_fnd",30,24.20,0.96,1],\n'
    ' ["00912","中信臺灣智慧50","tw_fnd",28,32.40,0.84,1],["00934","中信成長高股息","tw_pc",30,16.80,0.48,1],')

# ───────────────────────── 配息事件（除息 ＋ 領息）─────────────────────────
DIV_JS = r'''
/* ════════ L1 配息事件：ETF 除息日與領息日 ══════════════════════
   來源：各投信公告整理（數位時代 2026/10/05 彙整之 10 月除息清單、
   9 月除息之 10 月發放日；00878 為預定日期）。est＝預估金額或日期。
   除息日 09:00 生效（開盤即以除息參考價交易），領息日當天入帳。
   過期的配息事件與總經排程一樣，會在時刻經過後自動淘汰。
   欄位：[代號, 頻率, 金額(null=未公告), 除息日, 發放日, 最後買進日, 預估]
   ════════════════════════════════════════════════════════════ */
const DIV_SNAPSHOT="2026-10-05";
const DIV_TW=[
 ["00713","季配",1.25, "2026-09-21","2026-10-13","2026-09-18",false],
 ["00919","季配",1.10, "2026-09-16","2026-10-15","2026-09-15",false],
 ["00918","季配",1.75, "2026-09-18","2026-10-15","2026-09-17",false],
 ["00935","半年配",1.83,"2026-09-16","2026-10-15","2026-09-15",false],
 ["00944","月配",0.109,"2026-09-16","2026-10-15","2026-09-15",false],
 ["00929","月配",0.38, "2026-09-17","2026-10-16","2026-09-16",false],
 ["00939","月配",0.125,"2026-10-05","2026-10-29","2026-10-02",false],
 ["00946","月配",0.058,"2026-10-07","2026-10-30","2026-10-06",true],
 ["00940","月配",0.055,"2026-10-07","2026-11-02","2026-10-06",true],
 ["00947","季配",2.00, "2026-10-16","2026-11-06","2026-10-15",true],
 ["00904","季配",2.20, "2026-10-16","2026-11-06","2026-10-15",true],
 ["00922","半年配",2.10,"2026-10-19","2026-11-12","2026-10-16",true],
 ["00733","半年配",1.487,"2026-10-19","2026-11-12","2026-10-16",true],
 ["00927","季配",2.00, "2026-10-19","2026-11-13","2026-10-16",true],
 ["00912","季配",1.80, "2026-10-19","2026-11-13","2026-10-16",true],
 ["00943","月配",0.36, "2026-10-19","2026-11-06","2026-10-16",true],
 ["00934","月配",0.50, "2026-10-19","2026-11-13","2026-10-16",true],
 ["00944","月配",0.109,"2026-10-19","2026-11-13","2026-10-16",true],
 ["00929","月配",0.38, "2026-10-21","2026-11-16","2026-10-20",true],
 ["0056", "季配",1.72, "2026-10-22","2026-11-11","2026-10-21",true],
 ["00888","季配",1.50, "2026-10-27","2026-11-20","2026-10-23",true],
 ["00878","季配",null, "2026-11-17","2026-12-11","2026-11-16",true]
];
const DIV_SCEN={
 "除息":[{t:"除息後 20 個交易日內完成填息",p:.55,tilt:{growth:.4,def:.2,rate:.2}},
         {t:"貼息、填息時間拉長",p:.45,tilt:{growth:-.4,def:-.2,rate:-.2}}],
 "領息":[{t:"股息再投入，資金回流同一檔或同類 ETF",p:.5,tilt:{growth:.3,def:.2}},
         {t:"股息落袋，資金轉往債券或現金",p:.5,tilt:{growth:-.2,rate:.3}}]
};
const isoD=s=>{const p=s.split("-").map(Number);return new Date(p[0],p[1]-1,p[2])};
function genDivEvents(now){
  const out=[]; let nextExp=Infinity;
  DIV_TW.forEach(([code,freq,amt,ex,pay,last,est])=>{
    const etf=LOOKUP[code]; if(!etf)return;
    [["除息",ex],["領息",pay]].forEach(([kind,ds])=>{
      const dObj=isoD(ds), dd=daysTo(dObj); if(dd<0||dd>170)return;
      const rt=9, rms=releaseMs(dObj,rt); if(rms<=now)return;
      if(rms<nextExp)nextExp=rms;
      const amtTxt=amt===null?"金額待公告":`${amt} 元${est?"（預估）":""}`;
      out.push({id:`div_${code}_${kind==="除息"?"ex":"pay"}_${ds}`,tpl:`div_${code}_${kind}`,
        n:`${etf.n} ${kind}`,date:ds,dObj,kind,mkt:"tw",lvl:1,
        src:kind==="除息"?"投信公告":"股息入帳",
        note:kind==="除息"
          ?`${code} ${freq}，每單位 ${amtTxt}；最後買進日 ${last}，發放日 ${pay}。除息當天開盤價會扣掉配息。`
          :`${code} ${freq}，每單位 ${amtTxt}；${ex} 除息、今天入帳到受益人帳戶。`,
        hits:[[code,kind==="除息"?.86:.42,null]],scen:DIV_SCEN[kind],
        watch:kind==="除息"?"除息參考價、填息天數，以及成分股是否同期進入除息旺季":"同類 ETF 的申購與淨流入變化",
        rt,rms,twoSided:false,days:dd,
        div:{code,freq,amt,ex,pay,last,est}});
    });
  });
  return {out,nextExp};
}
'''
rep('let EVENTS=[], NEXT_EXPIRY=Infinity;', DIV_JS + '\nlet EVENTS=[], NEXT_EXPIRY=Infinity;')
rep('''  out.sort((a,b)=>a.rms-b.rms);
  EVENTS=out; NEXT_EXPIRY=nextExp;''',
    '''  const dv=genDivEvents(now);
  dv.out.forEach(e=>out.push(e)); if(dv.nextExp<nextExp)nextExp=dv.nextExp;
  out.sort((a,b)=>a.rms-b.rms);
  EVENTS=out; NEXT_EXPIRY=nextExp;''')
rep('''const CONE={
 "總經":''', '''const CONE={
 "除息":{n:120,shape:[-2.6,-1.2,-.3,.7,1.8],vol:0.75},
 "領息":{n:120,shape:[-1.4,-.5,.1,.6,1.4],vol:0.60},
 "總經":''')
# 圖譜：配息事件直接連到 ETF（L1 → L4）
rep('''  EVENTS.forEach(e=>e.hits.forEach(([t,w,m])=>{
    if(!BY[t])return;
    EDGES.push([e.id,t,w,m?m.lag:Math.max(1,Math.min(3,e.lvl)),m]);
  }));''', '''  EVENTS.forEach(e=>e.hits.forEach(([t,w,m])=>{
    if(!BY[t])return;
    EDGES.push([e.id,t,w,m?m.lag:(e.div?1:Math.max(1,Math.min(3,e.lvl))),m]);
  }));''')

# ───────────────────────── 左欄：事件篩選與配息樣式 ─────────────────────────
rep('''  const evs=NODES.filter(n=>n.L===1&&inMkt(n)).sort((a,b)=>a.days-b.days).slice(0,CAP);
  $("#evList").innerHTML=evs.map(e=>{
    const d=e.dObj||new Date(e.date);
    return `<button class="ev" data-id="${e.id}">
      <span class="d">${d.getMonth()+1}月<b>${d.getDate()}</b></span>
      <span class="nm">${e.n}<s>${e.kind} · ${e.src} · ${evWhen(e)}</s></span>
      <span class="lv l${e.lvl}"></span></button>`;
  }).join("");
  $("#evN").textContent=evs.length+" 件";''',
'''  const f=S.evFilter||"all";
  const evs=NODES.filter(n=>n.L===1&&inMkt(n)&&(f==="all"||(f==="div")===!!n.div))
    .sort((a,b)=>a.rms-b.rms).slice(0,CAP);
  $("#evList").innerHTML=evs.map(e=>{
    const d=e.dObj||new Date(e.date);
    const cls=e.div?(e.kind==="除息"?" dv":" pay"):"";
    const nm=e.div?`<i class="kt">${e.kind}</i>${BY[e.div.code]?BY[e.div.code].n:e.div.code}`:e.n;
    const sub=e.div?`${e.div.code} · ${e.div.amt===null?"金額待公告":e.div.amt+" 元"}${e.div.est?" 預估":""} · ${evWhen(e)}`
                   :`${e.kind} · ${e.src} · ${evWhen(e)}`;
    return `<button class="ev${cls}" data-id="${e.id}">
      <span class="d">${d.getMonth()+1}月<b>${d.getDate()}</b></span>
      <span class="nm">${nm}<s>${sub}</s></span>
      <span class="lv l${e.lvl}"></span></button>`;
  }).join("")||`<p class="cone-note" style="padding:6px 0">這個分類目前沒有排程。</p>`;
  $("#evN").textContent=evs.length+" 件";''')
rep('''/* ── 標的池／持倉切換 ── */''', '''/* ── 事件篩選：全部／總經／配息 ── */
$$("#evFilter button").forEach(b=>b.addEventListener("click",()=>{
  S.evFilter=b.dataset.f; sfx.tap();
  $$("#evFilter button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  renderLeft(); if(S.res)markList(S.res.src);
}));
/* ── 標的池／持倉切換 ── */''')

# ───────────────────────── 右欄：配息事件的專屬區塊 ─────────────────────────
rep('''  let analysis="";
  if(back&&src.L===4)''', '''  let analysis="", divSec="";
  if(isEvent&&src.div){
    const v=src.div, inPool=poolHas(v.code), etf=BY[v.code];
    divSec=`<div class="res-sec">
      <h3>${src.kind==="除息"?"除息資訊":"領息資訊"}<em>${v.est?"預估 · 以投信公告為準":"已公告"}</em></h3>
      <div class="divbox${src.kind==="領息"?" pay":""}">
        <div class="divgrid">
          <div>配息金額<b class="hl">${v.amt===null?"待公告":v.amt+" 元"}</b></div>
          <div>配息頻率<b>${v.freq}</b></div>
          <div>最後買進日<b>${v.last}</b></div>
          <div>除息日<b>${v.ex}</b></div>
          <div>發放日<b>${v.pay}</b></div>
          <div>資料狀態<b>${v.est?"預估":"已公告"}</b></div>
        </div>
        <p>${src.kind==="除息"
          ?`除息當天開盤參考價＝前一日收盤價 − 配息金額。
             要領到這次配息，必須在最後買進日（含）之前買進並持有到除息日。`
          :`這一筆是 ${v.ex} 除息那一次的配息，今天入帳；入帳本身不會改變 ETF 的淨值。`}</p>
        <button class="divadd" id="divAdd" data-code="${v.code}"${inPool?" disabled":""}>${inPool?"已在標的池":"加入標的池，看它的傳導"}</button>
      </div>
      <p class="cone-note">資料快照 ${DIV_SNAPSHOT}；標示預估者為投信預告值，正式金額以除息前公告為準。</p></div>`;
  }
  if(back&&src.L===4)''')
rep('''  $$(".hitrow").forEach(b=>b.addEventListener("click",()=>{
    const d=BY[b.dataset.id]; if(!d)return; sfx.run(); run(d.id,d.L===4?-1:1);
  }));
  renderStory({src,back,hits,holdHits,strongest,isEvent});''',
'''  $$(".hitrow").forEach(b=>b.addEventListener("click",()=>{
    const d=BY[b.dataset.id]; if(!d)return; sfx.run(); run(d.id,d.L===4?-1:1);
  }));
  const da=$("#divAdd");
  if(da)da.addEventListener("click",()=>{
    const s=LOOKUP[da.dataset.code]; if(!s||poolHas(s.id))return;
    if(!poolPush(s)){sfx.err();poolMsg(`標的池已達 ${CAP} 檔上限，請先刪除一檔。`,"err");return;}
    sfx.add(); poolMsg(`已加入 <b>${s.id} ${s.n}</b>（ETF）`,"ok");
    const keep=S.res.src; layout(); renderLeft(); renderPool(); run(keep,1);
  });
  renderStory({src,back,hits,holdHits,strongest,isEvent});''')
rep('''  if(d.L===1)ls.push(`${d.date}　${d.days>0?"D-"+d.days:"今日"}`,`${d.kind} · ${d.src}`,d.note);''',
    '''  if(d.L===1&&d.div)ls.push(`${d.date}　${d.days>0?"D-"+d.days:"今日"}`,`${d.kind} · ${d.div.code} · ${d.div.freq}`,
    d.div.amt===null?"配息金額待公告":`每單位 ${d.div.amt} 元${d.div.est?"（預估）":""}`);
  else if(d.L===1)ls.push(`${d.date}　${d.days>0?"D-"+d.days:"今日"}`,`${d.kind} · ${d.src}`,d.note);''')

rep('''    ${analysis}
    ${!back&&isEvent?`<div class="res-sec">''','''    ${divSec}${analysis}
    ${!back&&isEvent?`<div class="res-sec">''')
# 桌機左欄：標題可換行、說明收成兩行
# Bug：事件直接打到標的（不經板塊）時，說明文字會以「，」開頭
rep('''  if(amps.length)t+=`，再由 <b>${amps.map(a=>a.n).join(" ＋ ")}</b> 放大 <em>×${amps.reduce((p,a)=>p*a.amp,1).toFixed(2)}</em>`;
  else t+=`，直接落到個股（沒有經過放大器層）`;''','''  const sep=t?"，":"";
  if(amps.length)t+=`${sep}再由 <b>${amps.map(a=>a.n).join(" ＋ ")}</b> 放大 <em>×${amps.reduce((p,a)=>p*a.amp,1).toFixed(2)}</em>`;
  else t+=t?`，直接落到個股（沒有經過放大器層）`:`事件直接落到這檔標的（不經板塊與放大器層）`;''')
# Bug：重設提示寫「20 檔」，實際預設是 DEFAULT_N（16）檔
rep('poolMsg("已重設為預設的高影響力標的（各市場 20 檔）。","ok");', 'poolMsg(`已重設為預設的高影響力標的（各市場 ${DEFAULT_N} 檔，留 ${CAP-DEFAULT_N} 格給你自己加）。`,"ok");')

# ───────────────────────── 畫布配色 ─────────────────────────
rep('''  {z:-2.10,r:1.12,col:[167,139,250]},
  {z:-0.62,r:0.62,col:[69,200,240]},
  {z: 0.52,r:0.34,col:[242,179,61]},
  {z: 1.55,r:0.82,col:[228,237,248]}''', '''  {z:-2.10,r:1.12,col:[227,134,79]},
  {z:-0.62,r:0.62,col:[157,190,122]},
  {z: 0.52,r:0.34,col:[232,184,75]},
  {z: 1.55,r:0.82,col:[245,240,232]}''')
rep('ctx.fillStyle=s.r>1?"#c9d8f2":"#7b8ca8";', 'ctx.fillStyle=s.r>1?"#F5F0E8":"#9FB0C8";')
rep('g.addColorStop(0,"rgba(167,139,250,.16)");g.addColorStop(.5,"rgba(242,179,61,.14)");\n  g.addColorStop(1,"rgba(228,237,248,.10)");',
    'g.addColorStop(0,"rgba(227,134,79,.18)");g.addColorStop(.5,"rgba(232,184,75,.16)");\n  g.addColorStop(1,"rgba(245,240,232,.12)");')
rep('''ctx.font='600 11px "Barlow Condensed","Noto Sans TC",sans-serif';''', '''ctx.font='600 11px "Jost","Noto Sans TC",sans-serif';''')
rep('''ctx.font='500 10px "JetBrains Mono",monospace';''', '''ctx.font='600 10px "Jost",sans-serif';''')
src = src.replace('rgba([242,179,61],', 'rgba([232,184,75],')
rep('ctx.fillStyle="rgba(5,8,14,.95)"; ctx.strokeStyle=rgba(n.col,.42);', 'ctx.fillStyle="rgba(19,35,58,.96)"; ctx.strokeStyle=rgba(n.col,.5);')
rep('ctx.fillStyle=i===0?"#E4EDF8":i===1?rgba(n.col,.95):"#8397B4";', 'ctx.fillStyle=i===0?"#F5F0E8":i===1?rgba(n.col,.95):"#C9D3E2";')
rep('g.addColorStop(0,"rgba(4,6,10,0)"); g.addColorStop(1,"rgba(3,4,8,.78)");', 'g.addColorStop(0,"rgba(19,35,58,0)"); g.addColorStop(1,"rgba(12,22,38,.62)");')
rep('FX.rip.push({x,y,col:col||[242,179,61],', 'FX.rip.push({x,y,col:col||[232,184,75],')
rep('col:col||[228,237,248],r:.8+Math.random()*1.6});', 'col:col||[245,240,232],r:.8+Math.random()*1.6});')
rep('FX.scan.push({t:0,life:1.15,col:col||[69,200,240]});', 'FX.scan.push({t:0,life:1.15,col:col||[157,190,122]});')
rep('fxScan(sn?sn.col:[69,200,240]);', 'fxScan(sn?sn.col:[157,190,122]);')
src = src.replace('fxRipple(mx,my,[126,152,190],', 'fxRipple(mx,my,[201,211,226],')
rep('sfx.add(); fxScan([242,179,61]);', 'sfx.add(); fxScan([232,184,75]);')
# 歷史分位帶（畫在米白卡片上）
rep('<stop offset="0%" stop-color="#F2B33D" stop-opacity=".05"/><stop offset="100%" stop-color="#F2B33D" stop-opacity=".22"/>',
    '<stop offset="0%" stop-color="#E8B84B" stop-opacity=".08"/><stop offset="100%" stop-color="#E8B84B" stop-opacity=".30"/>')
rep('<stop offset="0%" stop-color="#F2B33D" stop-opacity=".10"/><stop offset="100%" stop-color="#F2B33D" stop-opacity=".40"/>',
    '<stop offset="0%" stop-color="#E8B84B" stop-opacity=".16"/><stop offset="100%" stop-color="#E8B84B" stop-opacity=".55"/>')
rep('stroke="#2A3446" stroke-width="1" stroke-dasharray="3 5"', 'stroke="#C9C0AE" stroke-width="1" stroke-dasharray="3 5"')
rep('<path d="${mid}" fill="none" stroke="#FFDC96" stroke-width="1.8"/>', '<path d="${mid}" fill="none" stroke="#C9960A" stroke-width="1.8"/>')
rep('r="3.2" fill="#FFDC96"/>', 'r="3.2" fill="#C9960A"/>')
src = src.replace('fill="#6B7C96" font-family="JetBrains Mono,monospace"', 'fill="#8A96A8" font-family="Jost,sans-serif"')

exec((d / 'twall_patch.py').read_text(encoding='utf-8'))
exec((d / 'calib_patch.py').read_text(encoding='utf-8'))
exec((d / 'sound_patch.py').read_text(encoding='utf-8'))
OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
OUT_HTML.write_text(src, encoding='utf-8')
for bad in ['JetBrains', 'Barlow', '#04060A', '242,179,61', '167,139,250', '69,200,240', '#E4EDF8', '#FFDC96', '#F2B33D']:
    if bad in src: print('LEFTOVER', bad, src.count(bad))
print('ok', len(src))
