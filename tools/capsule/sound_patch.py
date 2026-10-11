# 由 build.py 以 exec 載入：把音景換成溫暖、調性一致的版本
# 原本的音色：FM 金屬敲擊、鋸齒波掃頻、方波錯誤音、大量噪音 → 偏冷、偏刺。
# 新版：全部落在 D 大調五聲音階上，用三角波／正弦撥弦與柔和鐘聲，主輸出再過一道低通。

# 1) 主輸出加一道溫暖低通，削掉刺耳高頻
rep('''  master.connect(lim); lim.connect(ctx.destination);''',
    '''  const warm=ctx.createBiquadFilter(); warm.type="lowpass"; warm.frequency.value=7200; warm.Q.value=.4;
  master.connect(warm); warm.connect(lim); lim.connect(ctx.destination);''')

# 2) 新材料：撥弦（卡林巴／木琴感）與柔和鐘聲
rep('''/* 濾波掃頻：起飛、下墜、清除 */''', '''/* 撥弦：三角波基音 ＋ 正弦泛音，柔和起音、指數衰減，音色像卡林巴／木琴。
   每個泛音衰減得比基音快，濾波器跟著收窄，尾巴會自然變暗、不刺耳。 */
function pluck(o){
  if(!SND.ctx||!SND.on)return;
  const ctx=SND.ctx, t=ctx.currentTime+(o.at||0), dur=o.dur||.4;
  const out=chan(o.pan,o.dry,o.dl,o.rv===undefined?.32:o.rv,o.bus);
  const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.Q.value=.5;
  lp.frequency.setValueAtTime(o.bright||Math.min(8000,o.f*6),t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300,o.f*1.4),t+dur);
  lp.connect(out);
  const parts=o.parts||[[1,1,"triangle"],[2,.26,"sine"],[3,.07,"sine"]];
  parts.forEach(([r,g,w])=>{
    const osc=ctx.createOscillator(), gg=ctx.createGain();
    osc.type=w; osc.frequency.setValueAtTime(o.f*r,t);
    if(o.f2)osc.frequency.exponentialRampToValueAtTime(o.f2*r,t+dur);
    const pd=dur/(1+(r-1)*.8);
    gg.gain.setValueAtTime(0,t);
    gg.gain.linearRampToValueAtTime(o.vol*g,t+(o.a||.006));
    gg.gain.exponentialRampToValueAtTime(.0002,t+pd);
    osc.connect(gg); gg.connect(lp); osc.start(t); osc.stop(t+pd+.05);
  });
}
/* 鐘：正弦基音 ＋ 微幅失諧的泛音，像遠處的風鈴 */
function chime(o){
  pluck({...o,dur:o.dur||1.2,a:o.a||.004,
    parts:[[1,1,"sine"],[2.001,.30,"sine"],[3.006,.10,"sine"],[4.2,.04,"sine"]]});
}
/* 濾波掃頻：起飛、下墜、清除 */''')

# 3) 背景音景：同一組五聲音階的風鈴，泛音持續音改成 D、音量減半
rep('''  [523.25,587.33,659.25,783.99,880,1046.5,1174.7],   /* C 大調五聲 */
  [440,493.88,554.37,659.25,739.99,880,987.77],      /* A 掛留 */
  [466.16,523.25,622.25,698.46,783.99,932.33,1046.5] /* Bb 利地亞 */''',
    '''  [587.33,659.25,739.99,880,987.77,1174.66,1318.51], /* D 大調五聲 */
  [587.33,659.25,783.99,880,987.77,1174.66,1318.51], /* G 大調五聲（同主音，色彩轉暖） */
  [493.88,587.33,739.99,880,987.77,1174.66,1479.98]  /* B 小調七和弦色彩 */''')
rep('''  const drone=ctx.createOscillator(); drone.type="sine"; drone.frequency.value=880;
  const dg=ctx.createGain(); dg.gain.value=.012;''',
    '''  const drone=ctx.createOscillator(); drone.type="sine"; drone.frequency.value=587.33;
  const dg=ctx.createGain(); dg.gain.value=.006;''')
rep('''      fm({f,ratio:2.002,idx:.42,dur:3.6,vol:.055,pan,dry:1,bus:true});
      if(Math.random()<.45)
        fm({f:f*(Math.random()<.5?1.5:2),ratio:2.002,idx:.3,dur:3.0,vol:.030,
            at:.35+Math.random()*.5,pan:-pan*.7,dry:1,bus:true});''',
    '''      chime({f,dur:3.4,vol:.045,pan,dry:1,bus:true});
      if(Math.random()<.45)
        chime({f:f*(Math.random()<.5?1.5:2),dur:2.8,vol:.024,
            at:.35+Math.random()*.5,pan:-pan*.7,dry:1,bus:true});''')
rep('''    drone.frequency.setTargetAtTime([880,880,932.33][SND.chord],ctx.currentTime,8);''',
    '''    drone.frequency.setTargetAtTime([587.33,587.33,493.88][SND.chord],ctx.currentTime,8);''')

# 4) 互動音色表：整組重寫
i0 = src.index('/* ── 互動音色表 ────────────────────────────────────────── */')
i1 = src.index('addEventListener("pointerdown",audioStart);')
src = src[:i0] + r'''/* ── 互動音色表 ──────────────────────────────────────────
   全部落在 D 大調五聲音階（D E F# A B），任何聲音疊在一起都不會互相打架。
   上行＝加入／開啟／推演，下行＝刪除／關閉／清除；越重要的動作音越多、尾巴越長。 */
const NOTE=[587.33,659.25,739.99,880,987.77,1174.66,1318.51];   /* D5 E5 F#5 A5 B5 D6 E6 */
const sfx={
  /* 介面點擊：一顆短促的木質撥弦 */
  tap(pan){pluck({f:NOTE[3],dur:.16,vol:.05,pan:pan||0,rv:.18});},
  /* 開啟：兩音上行（D→A） */
  toggleOn(){pluck({f:NOTE[0],dur:.22,vol:.05,dl:.12});
             pluck({f:NOTE[3],dur:.32,vol:.045,at:.07,dl:.18});},
  /* 關閉：兩音下行（A→D） */
  toggleOff(){pluck({f:NOTE[3],dur:.22,vol:.045});
              pluck({f:NOTE[0],dur:.30,vol:.04,at:.07});},
  /* 推演：低音輕輕托起 ＋ 四音琶音走上去 */
  run(){
    pluck({f:146.83,dur:.9,vol:.07,a:.05,parts:[[1,1,"sine"],[2,.25,"sine"]],rv:.35});
    [0,2,3,5].forEach((n,i)=>chime({f:NOTE[n],dur:.9,vol:.042-i*.005,
      at:.04+i*.075,pan:(i-1.5)*.28,dl:.22,rv:.45}));
  },
  /* 點節點：每一層一個音，外層低、內層高 */
  node(L){
    const f=[440,587.33,739.99,880][clamp((L||1)-1,0,3)];
    chime({f,dur:1.0,vol:.06,dl:.2,rv:.42});
    pluck({f:f*2,dur:.18,vol:.018,at:.015});
  },
  /* 滑過節點：幾乎聽不見的高音輕點 */
  hover(){
    const now=performance.now(); if(now-SND.lastHover<140)return; SND.lastHover=now;
    pluck({f:NOTE[3+((Math.random()*4)|0)]*2,dur:.09,vol:.011,pan:Math.random()*1.2-.6,rv:.25});
  },
  /* 加入：五音上行 ＋ 頂端一顆亮鈴 */
  add(){
    [0,1,2,3,5].forEach((n,i)=>pluck({f:NOTE[n],dur:.4,vol:.048-i*.005,
      at:i*.055,pan:(i-2)*.2,dl:.2,rv:.4}));
    chime({f:NOTE[5]*2,dur:1.4,vol:.022,at:.3,dl:.3,rv:.55});
  },
  /* 刪除：三音下行，柔和收尾 */
  del(){
    [3,2,0].forEach((n,i)=>pluck({f:NOTE[n],dur:.3,vol:.045-i*.006,at:i*.06,bright:2600}));
    pluck({f:146.83,dur:.35,vol:.04,at:.16,parts:[[1,1,"sine"]]});
  },
  /* 錯誤：低音區兩下輕敲，不刺耳但聽得出「不行」 */
  err(){
    pluck({f:293.66,dur:.22,vol:.055,parts:[[1,1,"sine"],[2,.15,"sine"]],bright:1400});
    pluck({f:261.63,dur:.3,vol:.05,at:.11,parts:[[1,1,"sine"],[2,.15,"sine"]],bright:1400});
  },
  /* 清除：兩音輕輕往下放 */
  clear(){
    chime({f:NOTE[4],dur:.7,vol:.032,dl:.2,rv:.5});
    chime({f:NOTE[1],dur:.9,vol:.03,at:.09,dl:.2,rv:.5});
  },
  /* 市場切換：五度雙音 */
  market(){
    chime({f:NOTE[0],dur:.8,vol:.04,pan:-.3,dl:.18});
    chime({f:NOTE[3],dur:.9,vol:.036,at:.05,pan:.3,dl:.18});
  }
};
''' + src[i1:]
for chk in ['function pluck(o)', 'function chime(o)', 'warm.frequency.value=7200', 'D 大調五聲']:
    if chk not in src: raise SystemExit('sound patch missing: ' + chk)
