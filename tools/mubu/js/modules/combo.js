/* 暮卜先知 · 三合一綜合命盤（八字＋紫微斗數＋西洋占星） */
(() => {
  const SIGNS = ['牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'];
  const signOf = (lon) => SIGNS[Math.floor(Astro.norm360(lon) / 30)];

  // ---------- 三盤交叉印證：以「外向主動 ⇄ 內向沉靜」為共同軸線，看三套系統是否指向同一底色 ----------
  const ZW_DONG = new Set(['紫微', '太陽', '武曲', '七殺', '破軍', '貪狼', '廉貞']); // 剛／主動星
  const ZW_JING = new Set(['天機', '天同', '太陰', '天府', '天相', '天梁', '巨門']); // 柔／內斂星
  // 八字：日主陰陽＋身強弱＋最旺五行 三票
  function baziVote(p, str, mostWx) {
    const yang = ['甲', '丙', '戊', '庚', '壬'].includes(p.day.gan);
    const strong = str.label === '偏強';
    const wxScore = { 火: 1, 木: 1, 金: 0.5, 土: 0, 水: 0 }[mostWx];
    const score = (yang ? 1 : 0) + (strong ? 1 : 0) + wxScore;
    return { dir: score >= 1.5 ? '動' : '靜', why: `日主${p.day.gan}（${yang ? '陽' : '陰'}）、身${str.label}、${mostWx}最旺` };
  }
  // 紫微：命宮主星動靜歸類
  function ziweiVote(mingStars) {
    let d = 0, j = 0;
    mingStars.forEach(s => { if (ZW_DONG.has(s)) d++; else if (ZW_JING.has(s)) j++; });
    const dir = d > j ? '動' : j > d ? '靜' : '中';
    return { dir, why: mingStars.length ? `命宮${mingStars.join('、')}` : '命宮無主星' };
  }
  // 占星：太陽星座陰陽（火風=陽=動、土水=陰=靜；SIGNS 偶數索引為陽性）
  function astroVote(sunSign) {
    const idx = SIGNS.indexOf(sunSign);
    const yang = idx % 2 === 0;
    return { dir: yang ? '動' : '靜', why: `太陽${sunSign}（${yang ? '陽性火風象' : '陰性土水象'}）` };
  }
  const DIR_LABEL = { 動: '外向主動', 靜: '內向沉靜', 中: '剛柔並存' };
  function crossVerdict(votes) {
    const d = votes.filter(v => v.dir === '動').length;
    const j = votes.filter(v => v.dir === '靜').length;
    if (d === 3) return { good: true, text: '三盤一致指向<b>外向主動</b>——這是你最核心、最可信的人格底色：行動力強、樂於表現、能量向外發散。' };
    if (j === 3) return { good: true, text: '三盤一致指向<b>內向沉靜</b>——這是你最核心、最可信的人格底色：沉穩內斂、重感受與思考、能量向內收斂。' };
    if (d >= 2) return { good: null, text: '三盤多數指向<b>外向主動</b>，但有一套系統偏向沉靜——你整體活躍外放，內在卻藏著較安靜、需要獨處的一面，這種「外動內靜」的反差正是你可整合的地方。' };
    if (j >= 2) return { good: null, text: '三盤多數指向<b>內向沉靜</b>，但有一套系統偏向主動——你外表沉穩，內在其實藏著不安於室、想衝想闖的能量，這種「外靜內動」的反差值得你正視。' };
    return { good: null, text: '三盤在動靜之間分歧較大——代表你是個多面向、剛柔並存的人，不同情境會展現截然不同的樣貌，難以被單一標籤定義。' };
  }

  // ---------- 第二軸：人生節奏「安穩守成 ⇄ 開創起伏」——各取本門派格局判定 ----------
  const BAZI_STABLE = new Set(['正官', '正印', '偏印', '正財', '食神', '建祿']);   // 順用守成之格
  const BAZI_DYNAMIC = new Set(['七殺', '傷官', '偏財', '陽刃', '月劫']);          // 開創起伏之格
  function baziRhythm(ge) {
    if (ge.special) return { dir: '變', why: `${ge.name}（順勢從強／專旺，人生大開大闔）` };
    if (BAZI_DYNAMIC.has(ge.key)) return { dir: '變', why: `${ge.name}·${ge.成敗}` };
    if (BAZI_STABLE.has(ge.key)) return { dir: ge.成敗color === 'bad' ? '中' : '穩', why: `${ge.name}·${ge.成敗}` };
    return { dir: '中', why: ge.name };
  }
  const ZW_STABLE_GE = ['機月同梁', '府相朝垣', '紫府同宮'];
  function ziweiRhythm(geNames) {
    if (geNames.includes('殺破狼')) return { dir: '變', why: '殺破狼·開創起伏' };
    const s = geNames.find(n => ZW_STABLE_GE.includes(n));
    if (s) return { dir: '穩', why: `${s}·安穩守成` };
    return { dir: '中', why: geNames[0] || '無明顯正格' };
  }
  function astroRhythm(modeCount) {
    const top = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0][0];
    if (top === '固定') return { dir: '穩', why: '固定星座為主·穩定持久' };
    if (top === '本位') return { dir: '變', why: '本位星座為主·開創行動' };
    return { dir: '中', why: '變動星座為主·靈活適應' };
  }
  const RHYTHM_LABEL = { 穩: '安穩守成', 變: '開創起伏', 中: '動靜相濟' };
  function rhythmVerdict(votes) {
    const s = votes.filter(v => v.dir === '穩').length, c = votes.filter(v => v.dir === '變').length;
    if (s >= 2 && c === 0) return { good: true, text: '三盤偏向<b>安穩守成</b>——人生節奏傾向穩健累積、按部就班，適合守成深耕、專精一業，最忌躁進求快。' };
    if (c >= 2 && s === 0) return { good: true, text: '三盤偏向<b>開創起伏</b>——人生節奏大開大闔、於變動中求機會，適合主動出擊、掌握一技闖蕩，安穩反而綁住你。' };
    return { good: null, text: '三盤在穩定與變動之間各有訊號——你兼具守成的耐力與開創的衝勁，關鍵在因時制宜、動靜有據，順勢者得利。' };
  }

  const ascendant = (jdUT, latDeg, lonDeg) => Astro.ascMc(jdUT, latDeg, lonDeg).asc; // 共用 Astro 引擎

  function render(el) {
    const bf = App.birthForm({ gender: true, time: true });
    el.innerHTML = `
      <div class="panel">
        <h3>輸入出生資料</h3>
        ${bf.html}
        <div class="form-grid" style="margin-top:6px">
          <div class="field"><label>出生地（算上升與宮位）</label>
            <select id="cb-city" style="width:130px">${MUBU_CITIES.map((c, i) => `<option value="${i}"${c[0] === '台北' ? ' selected' : ''}>${c[0]}</option>`).join('')}</select></div>
        </div>
        <button class="btn" id="cb-go" style="margin-top:14px">${Icons.svg('combo')} 三盤合參</button>
        <p class="muted" style="margin-top:8px">同時排出八字、紫微斗數、西洋占星三套命盤，交叉比對三個體系對同一個「你」的描繪。這是 AI 深度解讀最有價值的地方——三盤互相印證。</p>
      </div>
      <div id="cb-result"></div>`;

    el.querySelector('#cb-go').addEventListener('click', () => {
      const b = bf.read(el);
      const resEl = el.querySelector('#cb-result');
      resEl.innerHTML = '';

      // 八字
      const p = Ganzhi.fourPillars(b.y, b.m, b.d, b.hh, b.mi);
      const wx = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
      for (const k of ['year', 'month', 'day', 'hour']) { wx[p[k].ganWx]++; wx[p[k].zhiWx]++; }
      const missing = Object.entries(wx).filter(([k, v]) => v === 0).map(([k]) => k);

      // 紫微
      const lunar = Astro.toLunar(b.y, b.m, b.d);
      const hourIdx = Math.floor(((b.hh + 1) % 24) / 2) % 12;
      const zw = ZiweiEngine.buildChart(lunar, hourIdx, p.year, b.gender);
      let mingStars = zw.palaces[0].main;
      let borrowed = false;
      if (!mingStars.length) { mingStars = zw.stars[(zw.mingIdx + 6) % 12].main; borrowed = true; }

      // 占星（依真實出生地經緯度與時區，上升才會準）
      const [cityName, cLat, cLon, cTz] = MUBU_CITIES[+el.querySelector('#cb-city').value] || MUBU_CITIES[0];
      const jdUT = Astro.toJD(b.y, b.m, b.d, b.hh, b.mi) - cTz / 24;
      const jde = jdUT + Astro.deltaT(b.y) / 86400;
      const sunSign = signOf(Astro.sunLongitude(jde));
      const moonSign = signOf(Astro.moonLongitude(jde));
      const ascLon = ascendant(jdUT, cLat, cLon);
      const ascSign = signOf(ascLon);
      const planetSign = { sun: sunSign, moon: moonSign };
      for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) planetSign[id] = signOf(Astro.planetLongitude(id, jde));
      const venusSign = planetSign.venus, marsSign = planetSign.mars;

      // 三盤格局（各依本門派）：八字子平真詮／紫微中州派／占星傳統必然尊貴
      const str = Ganzhi.strength(p);
      const ge = (window.BaziEngine ? BaziEngine.ziping(p) : null);                 // 八字格局
      const zwGeNames = (window.ZiweiEngine && ZiweiEngine.ziweiGeju ? ZiweiEngine.ziweiGeju(zw) : []).map(g => g.name);
      // 占星命主星（上升守護）＋其必然尊貴
      const MODE_OF = (sign) => ['本位', '固定', '變動'][SIGNS.indexOf(sign) % 3];
      const modeCount = { 本位: 0, 固定: 0, 變動: 0 };
      ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'].forEach(id => modeCount[MODE_OF(planetSign[id])]++);
      modeCount[MODE_OF(ascSign)]++; // 上升亦計入
      const AT = window.AstroTools;
      const rulerId = AT ? AT.SIGN_RULER[ascSign] : null;
      const rulerSign = rulerId ? planetSign[rulerId] : null;
      const rulerName = rulerId ? { sun: '太陽', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星' }[rulerId] : null;
      const rulerDig = (AT && rulerId) ? AT.dignityOf(rulerId, rulerSign) : null;
      const topMode = Object.entries(modeCount).sort((a, c) => c[1] - a[1])[0][0];

      // 三盤交叉印證（軸一：動靜；軸二：節奏穩變）
      const mostWx = Object.entries(wx).sort((a, c) => c[1] - a[1])[0][0];
      const vB = baziVote(p, str, mostWx), vZ = ziweiVote(mingStars), vA = astroVote(sunSign);
      const verdict = crossVerdict([vB, vZ, vA]);
      const rB = ge ? baziRhythm(ge) : { dir: '中', why: '—' };
      const rZ = ziweiRhythm(zwGeNames);
      const rA = astroRhythm(modeCount);
      const rVerdict = rhythmVerdict([rB, rZ, rA]);

      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <h3>三盤總覽</h3>
        <div class="muted" style="text-align:center">國曆 ${b.y}/${b.m}/${b.d} ${String(b.hh).padStart(2, '0')}:${String(b.mi).padStart(2, '0')} · 農曆${lunar.lunarYear}年${lunar.monthName}${lunar.dayName} · ${b.gender === 'M' ? '男' : '女'}命</div>
        <div class="aspect-grid" style="margin-top:14px">
          <div class="aspect"><b>${Icons.svg('bazi')} 八字</b>
            四柱：${p.year.name}・${p.month.name}・${p.day.name}・${p.hour.name}<br>
            日主 <b>${p.day.gan}${p.day.ganWx}</b> · 屬${p.year.shengxiao}<br>
            五行：${Object.entries(wx).map(([k, v]) => `${k}${v}`).join(' ')}${missing.length ? `（缺${missing.join('、')}）` : ''}</div>
          <div class="aspect"><b>${Icons.svg('ziwei')} 紫微斗數</b>
            ${zw.juName}，命宮在${Ganzhi.ZHI[zw.mingIdx]}<br>
            命宮主星：<b>${mingStars.join('、') || '無'}</b>${borrowed ? '（借對宮）' : ''}<br>
            身宮在${Ganzhi.ZHI[zw.shenIdx]}</div>
          <div class="aspect"><b>${Icons.svg('astrology')} 西洋占星</b>
            太陽 <b>${sunSign}</b> · 月亮 <b>${moonSign}</b><br>
            上升 ${ascSign}（依${cityName}）<br>
            金星${venusSign} · 火星${marsSign}</div>
        </div>
        <hr class="divider">
        <h4>三盤格局並陳（各依本門派）</h4>
        <p class="muted" style="margin-top:-2px">三套系統各以自己的門派語言，判定你這張命盤的「格局大方向」——八字依《子平真詮》取格論成敗、紫微依中州派命宮三方四正、占星依傳統必然尊貴看命主星旺弱。用詞無法直接互譯，但常在氣質上互相呼應，這正是 AI 跨系統印證的價值。</p>
        <table class="chart">
          <tr><th>系統</th><th>本命格局</th><th>喜忌／重點</th></tr>
          <tr><td>${Icons.svg('bazi')} 八字<br><span class="muted" style="font-size:11px">子平真詮</span></td>
              <td><b>${ge ? ge.name : '—'}</b>${ge ? (ge.special ? ' <span class="tag gold">特殊格</span>' : `・${ge.成敗}`) : ''}</td>
              <td class="muted">${ge ? `喜 ${ge.喜五行.join('') || '—'}／忌 ${ge.忌五行.join('') || '—'}` : '—'}</td></tr>
          <tr><td>${Icons.svg('ziwei')} 紫微<br><span class="muted" style="font-size:11px">中州派</span></td>
              <td><b>${zwGeNames.join('、') || '無明顯正格'}</b></td>
              <td class="muted">${zwGeNames.length ? '命宮三方四正成格' : '平常格局，依主星廟旺論'}</td></tr>
          <tr><td>${Icons.svg('astrology')} 占星<br><span class="muted" style="font-size:11px">傳統尊貴</span></td>
              <td>命主星 <b>${rulerName || '—'}</b>${rulerSign ? ` 於 ${rulerSign}` : ''}${rulerDig && rulerDig.key !== '平' ? ` <span class="tag ${rulerDig.good ? 'gold' : ''}" ${rulerDig.good === false ? 'style="color:var(--cinnabar)"' : ''}>${rulerDig.label}</span>` : ''}</td>
              <td class="muted">主導模式 ${topMode}</td></tr>
        </table>
        <hr class="divider">
        <h4>三盤性格印證 · 軸一：能量方向</h4>
        <p class="muted" style="margin-top:-2px">以「外向主動 ⇄ 內向沉靜」為共同軸線，看八字、紫微、占星三套系統是否指向同一種底色——一致處最可信，分歧處就是內外反差。<b>（軸一、軸二為本站自訂的粗略跨系統對照，非任何單一傳統方法，僅供整合參考）</b></p>
        <table class="chart">
          <tr><th>系統</th><th>訊號</th><th>指向</th></tr>
          <tr><td>${Icons.svg('bazi')} 八字</td><td class="muted">${vB.why}</td><td><b style="color:${vB.dir === '動' ? 'var(--cinnabar)' : 'var(--navy)'}">${DIR_LABEL[vB.dir]}</b></td></tr>
          <tr><td>${Icons.svg('ziwei')} 紫微</td><td class="muted">${vZ.why}</td><td><b style="color:${vZ.dir === '動' ? 'var(--cinnabar)' : vZ.dir === '靜' ? 'var(--navy)' : 'var(--ink-dim)'}">${DIR_LABEL[vZ.dir]}</b></td></tr>
          <tr><td>${Icons.svg('astrology')} 占星</td><td class="muted">${vA.why}</td><td><b style="color:${vA.dir === '動' ? 'var(--cinnabar)' : 'var(--navy)'}">${DIR_LABEL[vA.dir]}</b></td></tr>
        </table>
        <div class="aspect" style="margin-top:10px;border-left:3px solid ${verdict.good ? 'var(--gold-mid)' : 'var(--panel-border)'}"><p>${verdict.text}</p></div>
        <h4 style="margin-top:16px">三盤性格印證 · 軸二：人生節奏</h4>
        <p class="muted" style="margin-top:-2px">以「安穩守成 ⇄ 開創起伏」為軸線，各取本門派<b>格局</b>判定——八字看格局類型（如殺傷主變、官印主穩）、紫微看殺破狼／機月同梁、占星看星座三模式（本位開創、固定穩定、變動適應）。</p>
        <table class="chart">
          <tr><th>系統</th><th>格局訊號</th><th>指向</th></tr>
          <tr><td>${Icons.svg('bazi')} 八字</td><td class="muted">${rB.why}</td><td><b style="color:${rB.dir === '變' ? 'var(--cinnabar)' : rB.dir === '穩' ? 'var(--navy)' : 'var(--ink-dim)'}">${RHYTHM_LABEL[rB.dir]}</b></td></tr>
          <tr><td>${Icons.svg('ziwei')} 紫微</td><td class="muted">${rZ.why}</td><td><b style="color:${rZ.dir === '變' ? 'var(--cinnabar)' : rZ.dir === '穩' ? 'var(--navy)' : 'var(--ink-dim)'}">${RHYTHM_LABEL[rZ.dir]}</b></td></tr>
          <tr><td>${Icons.svg('astrology')} 占星</td><td class="muted">${rA.why}</td><td><b style="color:${rA.dir === '變' ? 'var(--cinnabar)' : rA.dir === '穩' ? 'var(--navy)' : 'var(--ink-dim)'}">${RHYTHM_LABEL[rA.dir]}</b></td></tr>
        </table>
        <div class="aspect" style="margin-top:10px;border-left:3px solid ${rVerdict.good ? 'var(--gold-mid)' : 'var(--panel-border)'}"><p>${rVerdict.text}</p></div>
        <hr class="divider">
        <h4>三盤各看什麼</h4>
        <p>八字看的是<b>五行氣機與人生節奏</b>（日主 ${p.day.gan}${p.day.ganWx}），紫微看的是<b>人生劇本與舞台配置</b>（${mingStars.join('、') || '借對宮'}坐命），占星看的是<b>心理原型與天賦傾向</b>（太陽${sunSign}／月亮${moonSign}）。上方的能量方向只是最粗的一條軸線，事業、感情、財運等完整的三盤交叉印證，交給 AI 深度解讀。</p>
        <p class="muted" style="margin-top:8px">${Icons.svg('pointer')} 建議使用 AI 深度解讀進行完整的三盤交叉分析（這是本功能的精華）。沒有 API Key 也可分別到各模組查看完整單盤解讀。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請做「三合一綜合命盤」深度解讀：以下是同一人的八字、紫微斗數、西洋占星三套命盤，請交叉比對、互相印證。
出生：國曆 ${b.y}/${b.m}/${b.d} ${b.hh}:${String(b.mi).padStart(2, '0')}（UTC+8），${b.gender === 'M' ? '男' : '女'}性

【八字】四柱：${p.year.name}年 ${p.month.name}月 ${p.day.name}日 ${p.hour.name}時
五行分布：${Object.entries(wx).map(([k, v]) => k + v).join(' ')}，日主${p.day.gan}${p.day.ganWx}

【紫微斗數】${zw.juName}，命宮在${Ganzhi.ZHI[zw.mingIdx]}（主星：${mingStars.join('、') || '借對宮'}），身宮在${Ganzhi.ZHI[zw.shenIdx]}
十二宮：${zw.palaces.map(pl => `${pl.name}[${pl.main.join('') || '空'}]`).join(' ')}
生年四化：${Object.entries(zw.hua).map(([s, h]) => s + '化' + h).join('、')}

【西洋占星】出生地${cityName}；太陽${sunSign}、月亮${moonSign}、上升${ascSign}、金星${venusSign}、火星${marsSign}
命主星（上升守護）：${rulerName || '—'}${rulerSign ? '於' + rulerSign : ''}${rulerDig && rulerDig.key !== '平' ? '（' + rulerDig.label + '）' : ''}；星座模式以${topMode}為主

【三盤本命格局（各依本門派，供跨系統印證）】
· 八字（子平真詮）：${ge ? ge.name + (ge.special ? '·特殊格' : '·' + ge.成敗) + `，喜${ge.喜五行.join('') || '—'}忌${ge.忌五行.join('') || '—'}` : '—'}
· 紫微（中州派）：${zwGeNames.join('、') || '無明顯正格（平常格局）'}
· 占星（傳統尊貴）：命主星${rulerName || '—'}${rulerDig && rulerDig.key !== '平' ? '·' + rulerDig.label : ''}

【內建交叉印證】
· 軸一能量方向：八字${DIR_LABEL[vB.dir]}（${vB.why}）、紫微${DIR_LABEL[vZ.dir]}（${vZ.why}）、占星${DIR_LABEL[vA.dir]}（${vA.why}）——初判：${verdict.text.replace(/<[^>]+>/g, '')}
· 軸二人生節奏：八字${RHYTHM_LABEL[rB.dir]}（${rB.why}）、紫微${RHYTHM_LABEL[rZ.dir]}（${rZ.why}）、占星${RHYTHM_LABEL[rA.dir]}（${rA.why}）——初判：${rVerdict.text.replace(/<[^>]+>/g, '')}

請分析：
1) 三盤共同指向的核心人格特質（重疊印證處，延伸上方兩軸初判）
2) 三盤分歧處代表的內外反差或潛在課題
3) 特別做「格局層級的跨系統印證」：八字格局、紫微格局、占星命主星旺弱三者是否在氣質上互相呼應或矛盾？彼此如何補充
4) 事業財運方向（綜合三盤格局與喜用）
5) 感情婚姻模式（綜合三盤）
6) 給這個人的整體人生策略建議（呼應人生節奏是宜守成或宜開創）。`);
    });
  }

  App.register({
    id: 'combo',
    icon: Icons.svg('combo'),
    title: '三合一綜合命盤',
    desc: '八字＋紫微斗數＋西洋占星同時排盤，三個體系交叉印證，AI 整合解讀。',
    wide: true,
    render
  });
})();
