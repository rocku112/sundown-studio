/* 暮卜先知 · 八字命理 */
(() => {
  // 十天干日主性格
  const GAN_CHAR = {
    甲: '甲木為參天大樹，正直向上、有領導氣質與責任感，但有時固執不知變通，認定的路九頭牛拉不回。',
    乙: '乙木為花草藤蔓，柔韌靈活、善於協調應變，適應力強；但易隨環境搖擺，需留意立場不夠堅定。',
    丙: '丙火為太陽之火，熱情開朗、慷慨大方，走到哪裡都是焦點；但性子急、來得快去得也快，需學會沉澱。',
    丁: '丁火為燈燭之火，溫暖細膩、洞察人心，屬於安靜的燃燒者；內心戲多，容易想太多而內耗。',
    戊: '戊土為高山厚土，穩重可靠、包容力強，是他人依靠的對象；但行動偏慢、過於保守，錯失先機時有之。',
    己: '己土為田園之土，溫和務實、善於培育成全他人；心思細膩但容易操心，需防替人擔憂過度。',
    庚: '庚金為刀劍礦石，果決剛毅、講義氣重原則，執行力一流；但稜角分明，言語直接易傷人。',
    辛: '辛金為珠玉首飾，精緻聰慧、追求完美與品味；自尊心強，吃軟不吃硬，在意他人評價。',
    壬: '壬水為江河大海，聰明豪邁、思路開闊，天生的謀略家；但心思流動不定，需防虎頭蛇尾。',
    癸: '癸水為雨露甘霖，溫柔內斂、直覺敏銳，默默滋養身邊的人；感受力強，情緒也容易受環境牽動。'
  };
  const WX_ADVICE = {
    木: '五行喜木者宜東方、綠色、晨間活動，親近花草樹木；行業利文教、出版、園藝、設計。',
    火: '五行喜火者宜南方、紅色、日照充足處；行業利能源、餐飲、演藝、行銷。',
    土: '五行喜土者宜本地深耕、黃色、規律作息；行業利不動產、農業、管理、顧問。',
    金: '五行喜金者宜西方、白色金色、俐落決斷；行業利金融、法律、機械、金工。',
    水: '五行喜水者宜北方、黑藍色、流動變化的環境；行業利貿易、物流、傳播、旅遊。'
  };

  // ---------- 格局（子平月令取格） ----------
  const GE_INFO = {
    正官格: '以月令正官為用，為人正派守分、重名譽與責任，做事按部就班、講求制度規範。宜公職、行政、管理、法律或大型企業等重穩定與名分的環境；最忌傷官剋官（傷官見官），也需身強方能任官擔責。',
    七殺格: '月令七殺（偏官）當令，個性剛毅果決、有膽識魄力，能扛壓敢承擔，關鍵時刻挺得住。宜武職、軍警、外科、開創或高壓競爭型職場；喜食神制殺或印星化殺，制化得宜則貴，忌殺重無制反受其累。',
    正財格: '月令正財，務實勤儉、腳踏實地，重視實質積累與穩定收入，理財有度。宜財經、實業、會計、業務等講求踏實經營的領域；喜身強能任財、財官相生，忌身弱財多反為財所困。',
    偏財格: '月令偏財，慷慨豪爽、善交際又能掌握機會，錢財來得活、路子廣，有生意頭腦。宜商業、投資、業務、公關等靈活變通的行業；喜身強任財，忌身弱貪多，也需留意因財而生的感情與是非。',
    食神格: '月令食神吐秀，溫和厚道、有才藝品味，懂生活也能以才華生財，是「福氣」之格。宜藝術、餐飲、教育、文創、專業技術；最忌偏印（梟神）奪食，食神一旦被剋，福氣與才華便難施展。',
    傷官格: '月令傷官，聰明外露、才華洋溢、表現慾與自尊心都強，不喜受拘束。宜創作、表演、設計、技術、自由業等能盡情發揮的舞台；喜傷官配印或傷官生財，最忌見正官（傷官見官為禍），需學會收斂鋒芒。',
    正印格: '月令正印，仁厚好學、重精神與名譽，一生多得長輩師長蔭庇。宜文教、學術、公職、宗教、醫護等清貴或助人的行業；喜官印相生，忌財星壞印（貪財壞印）而失了本心。',
    偏印格: '月令偏印（梟神），思想獨特、感受敏銳、直覺強，學東西快但易多學少精，偏好冷門專精領域。宜玄學、宗教、研究、專業技術、幕僚企劃；喜見財星制梟，最忌梟神奪食（偏印剋食神）。',
    建祿格: '月令為日主之祿（比肩當令），日主自坐強根、自立自強，不靠祖蔭而白手起家，主觀意識強。宜獨立創業、專業自立、靠本事吃飯；喜財官透出而有所依歸，忌比劫重重爭財奪利。',
    陽刃格: '月令羊刃（劫財當令、陽日主），個性剛烈、行動力強、敢衝敢拚、爆發力十足，但也易衝動極端。宜武職、外科、競技、機械或高風險高報酬行業；喜官殺制刃（以殺制刃為貴），忌刃旺無制而招意外血光、破財是非。',
    月劫格: '月令劫財當令（陰日主），自主性強、行動積極、重義氣也重得失，容易在錢財與主導權上與人較勁。宜靠專業與行動力自立的路線；喜官殺制劫、食傷洩秀，忌比劫成群而聚散無常。'
  };
  // 命中主要十神的性格側寫
  const SHISHEN_CHAR = {
    比肩: '自我意識強、獨立自主、重朋友義氣，適合自立門戶或與人平等合作；但主觀不服輸，錢財上易與人有糾葛。',
    劫財: '行動積極、爭取心強、社交能量高，善於把握機會；但衝動好勝、理財偏衝動，需防因財、因合夥生變。',
    食神: '溫和樂天、有口福與才藝、懂得享受生活，做事從容有餘裕；適合以興趣、才華、專業維生，但需防過於安逸。',
    傷官: '聰明機敏、才華外顯、創意十足、表達力強，不甘平凡；但心高氣傲、直言易得罪人，需學會收斂與圓融。',
    偏財: '豪爽大方、交際手腕好、對金錢與機會敏銳，人脈與異性緣皆佳；但易慷慨過頭、感情多情，理財需節制。',
    正財: '務實可靠、勤儉持家、重視穩定與承諾，一分耕耘一分收穫；但偏保守放不開，機會來時需更果斷。',
    七殺: '魄力十足、果斷勇敢、抗壓性高，有領導與開創的霸氣；但性急剛烈、容易極端，需以修養與制化收斂殺氣。',
    正官: '正直守分、重責任名譽、自律性高、做事有條理，是可託付之人；但偏保守拘謹、放不下身段，需防過於在意外界眼光。',
    偏印: '思路獨特、直覺敏銳、學習力強、擅長冷門專精領域；但想得多、易孤僻內耗，需防鑽牛角尖。',
    正印: '仁慈厚道、好學守禮、重精神生活、有貴人與長輩緣；但易依賴、耳根軟、行動力稍弱，需增獨立與執行力。'
  };
  // 月令取格：本氣十神定格，比劫則論祿刃格
  function geju(p) {
    const dayGan = p.day.ganIdx;
    const benqi = p.month.cang[0];
    const benGod = Ganzhi.tenGod(dayGan, Ganzhi.GAN.indexOf(benqi));
    const yang = Ganzhi.GAN_YINYANG[dayGan] === '陽';
    let name, luFlag = false;
    if (benGod === '比肩') { name = '建祿格'; luFlag = true; }
    else if (benGod === '劫財') { name = yang ? '陽刃格' : '月劫格'; luFlag = true; }
    else name = benGod + '格';
    // 格神是否透出天干（年月時，日主除外）
    const exposed = [p.year.gan, p.month.gan, p.hour.gan].includes(benqi);
    return { name, god: benGod, benqi, exposed, luFlag, info: GE_INFO[name] };
  }
  // 命中主要十神（天干＋藏干統計，取前二；日主本身不計）
  function dominantGods(p) {
    const dayGan = p.day.ganIdx;
    const count = {};
    const bump = (ganChar) => { const g = Ganzhi.tenGod(dayGan, Ganzhi.GAN.indexOf(ganChar)); count[g] = (count[g] || 0) + 1; };
    for (const k of ['year', 'month', 'hour']) bump(p[k].gan);
    for (const k of ['year', 'month', 'day', 'hour']) p[k].cang.forEach(bump);
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 2);
  }
  // 大運喜忌：以用神(like)/忌神(avoid)評每步大運
  function daYunLuck(dw, like, avoid) {
    const sc = (wx) => wx === like ? 2 : (Ganzhi.WX_SHENG[wx] === like ? 1 : (avoid && wx === avoid ? -2 : (avoid && Ganzhi.WX_SHENG[wx] === avoid ? -1 : 0)));
    const s = sc(dw.ganWx) + sc(dw.zhiWx) * 1.2;
    if (s >= 2) return { label: '吉', cls: 'good' };
    if (s > 0) return { label: '偏吉', cls: 'good' };
    if (s === 0) return { label: '平', cls: 'mid' };
    if (s > -2) return { label: '偏忌', cls: 'bad' };
    return { label: '忌', cls: 'bad' };
  }

  // ---------- 神煞 ----------
  // 地支索引：子0 丑1 寅2 卯3 辰4 巳5 午6 未7 申8 酉9 戌10 亥11；天干：甲0…癸9
  const TIANYI = { 0: [1, 7], 4: [1, 7], 6: [1, 7], 1: [0, 8], 5: [0, 8], 2: [11, 9], 3: [11, 9], 8: [3, 5], 9: [3, 5], 7: [6, 2] };
  const WENCHANG = { 0: 5, 1: 6, 2: 8, 4: 8, 3: 9, 5: 9, 6: 11, 7: 0, 8: 2, 9: 3 };
  const YANGREN = { 0: 3, 2: 6, 4: 6, 6: 9, 8: 0 };
  const TRINES = [[8, 0, 4], [2, 6, 10], [5, 9, 1], [11, 3, 7]]; // 申子辰／寅午戌／巳酉丑／亥卯未
  const PEACH = [9, 3, 6, 0], YIMA = [2, 8, 11, 5], HUAGAI = [4, 10, 1, 7], JIANGXING = [0, 6, 9, 3];
  const VOID_TABLE = [[10, 11], [8, 9], [6, 7], [4, 5], [2, 3], [0, 1]]; // 六旬空亡
  const trineIdx = (z) => TRINES.findIndex(g => g.includes(z));

  const SHENSHA_INFO = {
    天乙貴人: { good: true, text: '八字第一貴人，主逢凶化吉、遇難呈祥，多得長輩貴人提攜相助。' },
    文昌貴人: { good: true, text: '主聰穎好學、文思敏捷，利考試、進修與文書創作。' },
    將星: { good: true, text: '主有領導才能與掌控局面的氣勢，利掌權任事、擔當要職。' },
    桃花: { good: null, text: '主異性緣佳、外表有魅力，感情機會多但也需慎防爛桃花、招惹是非。' },
    驛馬: { good: null, text: '主變動奔波，利出外發展、遷徙旅行、業務外勤，但也主不穩定、難久居一處。' },
    華蓋: { good: null, text: '主聰明孤高、有藝術宗教慧根，利玄學、宗教、藝術創作，但也主孤僻、緣分較淡。' },
    羊刃: { good: false, text: '主性剛果決、行事極端，利武職、競爭型行業，但也主易衝動躁進、需防意外血光。' },
    空亡: { good: false, text: '主此柱所代表的人事物力量減弱、易落空或有名無實，宜看淡得失、修心為要。' }
  };

  // p: fourPillars；回傳 [{name, positions:['年','月','日','時'], info}]
  function shensha(p) {
    const cols = ['year', 'month', 'day', 'hour'];
    const posName = { year: '年', month: '月', day: '日', hour: '時' };
    const dayGan = p.day.ganIdx;
    const zhis = cols.map(c => p[c].zhiIdx);
    const found = [];
    const add = (name, positions) => { if (positions.length) found.push({ name, positions: positions.map(c => posName[c]), info: SHENSHA_INFO[name] }); };

    add('天乙貴人', cols.filter((c, i) => (TIANYI[dayGan] || []).includes(zhis[i])));
    add('文昌貴人', cols.filter((c, i) => WENCHANG[dayGan] === zhis[i]));
    if (YANGREN[dayGan] !== undefined) add('羊刃', cols.filter((c, i) => YANGREN[dayGan] === zhis[i]));

    const baseIdx = trineIdx(p.year.zhiIdx);
    if (baseIdx >= 0) {
      add('桃花', cols.filter((c, i) => PEACH[baseIdx] === zhis[i]));
      add('驛馬', cols.filter((c, i) => YIMA[baseIdx] === zhis[i]));
      add('華蓋', cols.filter((c, i) => HUAGAI[baseIdx] === zhis[i]));
      add('將星', cols.filter((c, i) => JIANGXING[baseIdx] === zhis[i]));
    }

    const voidZ = VOID_TABLE[Math.floor(p.day.n / 10)];
    add('空亡', cols.filter((c, i) => voidZ.includes(zhis[i])));

    return found;
  }

  function render(el) {
    const bf = App.birthForm({ gender: true, time: true });
    el.innerHTML = `
      <div class="panel">
        <h3>輸入出生資料</h3>
        ${bf.html}
        <button class="btn" id="bz-go" style="margin-top:14px">${Icons.svg('bazi')} 排 盤</button>
        <p class="muted" style="margin-top:8px">請填國曆（西元）生日；年柱以立春為界、月柱以節氣為界，皆為即時天文計算。</p>
      </div>
      <div id="bz-result"></div>`;

    el.querySelector('#bz-go').addEventListener('click', () => {
      const b = bf.read(el);
      const resEl = el.querySelector('#bz-result');
      resEl.innerHTML = '';
      const p = Ganzhi.fourPillars(b.y, b.m, b.d, b.hh, b.mi);
      const lunar = Astro.toLunar(b.y, b.m, b.d);
      const wx = Ganzhi.wuxingCount(p);
      const str = Ganzhi.strength(p);
      const luck = Ganzhi.luck(b.y, b.m, b.d, b.hh, b.gender, p);
      const dayGan = p.day.ganIdx;
      const missing = Object.entries(wx).filter(([k, v]) => v === 0).map(([k]) => k);
      const most = Object.entries(wx).sort((a, b2) => b2[1] - a[1])[0];
      const like = str.like; // 用神粗判：身強洩剋、身弱生扶（Ganzhi.strength 內建）
      const ss = shensha(p);
      const relations = Ganzhi.branchRelations(p);
      const th = Ganzhi.tiaohou(p.day.ganIdx, p.month.zhiIdx);
      const nowYear = new Date().getFullYear();
      const flowYears = Ganzhi.yearlyFortune(nowYear, 10, p);
      const flowMonths = Ganzhi.monthlyFortune(nowYear, p);

      const ge = geju(p);
      const doms = dominantGods(p);
      const avoid = str.avoid;

      const cols = ['year', 'month', 'day', 'hour'];
      const colName = { year: '年柱', month: '月柱', day: '日柱', hour: '時柱' };
      const tenGodRow = cols.map(c => c === 'day' ? '<td>日主</td>' :
        `<td>${Ganzhi.tenGod(dayGan, p[c].ganIdx)}</td>`).join('');
      const maxWx = Math.max(...Object.values(wx));

      const html = `<div class="panel result">
        <h3>命盤</h3>
        <div class="muted" style="text-align:center">國曆 ${b.y}/${b.m}/${b.d} ${String(b.hh).padStart(2, '0')}:${String(b.mi).padStart(2, '0')} · 農曆${lunar.lunarYear}年${lunar.monthName}${lunar.dayName} · 屬${p.year.shengxiao} · ${b.gender === 'M' ? '男' : '女'}命</div>
        <table class="chart">
          <tr><th></th>${cols.map(c => `<th>${colName[c]}</th>`).join('')}</tr>
          <tr><th>十神</th>${tenGodRow}</tr>
          <tr><th>天干</th>${cols.map(c => `<td class="big">${p[c].gan}</td>`).join('')}</tr>
          <tr><th>地支</th>${cols.map(c => `<td class="big">${p[c].zhi}</td>`).join('')}</tr>
          <tr><th>藏干</th>${cols.map(c => `<td class="muted">${p[c].cang.map(g => `${g}<small>(${Ganzhi.tenGod(dayGan, Ganzhi.GAN.indexOf(g))})</small>`).join('<br>')}</td>`).join('')}</tr>
          <tr><th>納音</th>${cols.map(c => `<td class="muted">${p[c].nayin}</td>`).join('')}</tr>
        </table>
        <h4>五行分布</h4>
        ${Object.entries(wx).map(([k, v]) => `
          <div class="wx-bar"><span style="width:2em">${k} ${v}</span>
          <div class="bar wx-${k}" style="width:${v / maxWx * 60}%"></div></div>`).join('')}
        <p style="margin-top:8px">日主 <b style="color:var(--gold-bright)">${p.day.gan}${p.day.ganWx}</b>，生於${Ganzhi.ZHI[p.month.zhiIdx]}月，身${str.label}。
        ${missing.length ? `五行缺<b style="color:var(--cinnabar)">${missing.join('、')}</b>；` : '五行俱全；'}
        ${most[0]}最旺（${most[1]} 見）。粗判喜用五行：<b style="color:var(--gold-bright)">${like}</b>。</p>
        <hr class="divider">
        <h4>格局 · ${ge.name}</h4>
        <p><span class="tag gold">月令取格</span>${ge.luFlag ? '' : `<span class="tag">${ge.exposed ? '格神透干・格局清純' : '格神藏而未透・需行運引動'}</span>`}</p>
        <p style="margin-top:6px">${ge.info}</p>
        <p class="muted" style="font-size:11.5px;margin-top:4px">※ 格局以月令本氣取格、大運吉凶依用神粗判、十神性格取命中最旺者——皆為簡化規則的初步判讀，未錨定特定門派（成敗、格局高低尚須綜合全局），僅供參考，深入論命請用 AI 深度解讀或請教專業命理師。</p>
        <hr class="divider">
        <h4>日主性格 · ${p.day.gan}${p.day.ganWx}</h4>
        <p>${GAN_CHAR[p.day.gan]}</p>
        <p style="margin-top:6px">${WX_ADVICE[like]}</p>
        ${doms.length ? `<p style="margin-top:6px"><b>命中主要十神：</b>${doms.map(([g, n]) => `<span class="tag">${g}×${n}</span>`).join('')}</p>
        ${doms.map(([g]) => `<p class="muted" style="margin-top:4px"><b style="color:var(--ink)">${g}</b>：${SHISHEN_CHAR[g]}</p>`).join('')}` : ''}
        <hr class="divider">
        <h4>大運（${luck.startAge} 歲起運，${luck.forward ? '順' : '逆'}行）<span class="muted" style="font-weight:400">　依用神${like}${avoid ? `／忌神${avoid}` : ''}標吉凶</span></h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${luck.list.map(d => { const dl = daYunLuck(d, like, avoid); return `<div class="aspect" style="min-width:88px;text-align:center;flex:1;${dl.cls === 'good' ? 'border-color:rgba(240,194,104,.5)' : dl.cls === 'bad' ? 'border-color:rgba(176,48,32,.35)' : ''}">
            <b>${d.age}-${d.age + 9}歲</b><span style="font-size:18px;letter-spacing:.15em">${d.name}</span>
            <div class="muted" style="font-size:12px">${d.nayin}</div>
            <div style="font-size:12px;color:${dl.cls === 'good' ? 'var(--gold-deep)' : dl.cls === 'bad' ? 'var(--cinnabar)' : 'var(--ink-dim)'}">${dl.label}</div></div>`; }).join('')}
        </div>
        <hr class="divider">
        <h4>神煞</h4>
        ${ss.length
          ? `<p>${ss.map(s => `<span class="tag ${s.info.good === true ? 'gold' : ''}" ${s.info.good === false ? 'style="color:var(--cinnabar);border-color:rgba(176,48,32,.4)"' : ''}>${s.name}（${s.positions.join('、')}柱）</span>`).join('')}</p>
             <div style="margin-top:6px">${ss.map(s => `<p class="muted" style="margin-top:4px"><b style="color:${s.info.good === true ? 'var(--gold-bright)' : s.info.good === false ? 'var(--cinnabar)' : 'var(--ink)'}">${s.name}</b>：${s.info.text}</p>`).join('')}</div>`
          : '<p class="muted">四柱未見常見神煞組合。</p>'}
        <hr class="divider">
        <h4>合沖刑害</h4>
        ${relations.length
          ? `<p>${relations.map(r => `<span class="tag ${r.level === 'good' ? 'gold' : ''}" ${r.level === 'bad' ? 'style="color:var(--cinnabar);border-color:rgba(176,48,32,.4)"' : ''}>${r.type}｜${r.text}</span>`).join('')}</p>`
          : '<p class="muted">四柱干支間無明顯合沖刑害，命局平穩。</p>'}
        ${th ? `<h4>調候用神（窮通寶鑑）</h4>
        <p>${p.day.gan}${p.day.ganWx}日主生於${Ganzhi.ZHI[p.month.zhiIdx]}月，調候先取 <b style="color:var(--gold-bright)">${th.split('').join('、')}</b>。<span class="muted">調候重寒暖燥濕：得此數干（或大運流年補上）者，命局氣候中和、事半功倍。</span></p>` : ''}
        <hr class="divider">
        <h4>流年運勢（${nowYear}－${nowYear + 9}）</h4>
        <table class="chart">
          <tr><th>年份</th><th>干支</th><th>十神</th><th>備註</th></tr>
          ${flowYears.map(f => `<tr>
            <td>${f.year}</td><td>${f.name}<span class="muted">（${f.shengxiao}）</span></td>
            <td>${f.tenGod}</td>
            <td class="muted" ${f.tags.length ? 'style="color:var(--cinnabar)"' : ''}>${f.tags.join('、') || '—'}</td></tr>`).join('')}
        </table>
        <h4>${nowYear} 流月（節氣月）</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:6px">
          ${flowMonths.map(f => `<div class="aspect" style="text-align:center;padding:8px 4px">
            <b style="display:inline">${f.name}月</b><br><span class="muted" style="font-size:11.5px">${f.jie}起（約${f.approx}）</span><br>
            <span style="color:var(--gold-bright)">${f.tenGod}</span></div>`).join('')}
        </div>
        <p class="muted" style="margin-top:10px">※ 流年十神以日主對流年天干論；「沖太歲／值太歲」以出生年支對流年支論。內建解讀為簡化規則判斷，詳細論命建議使用 AI 深度解讀。</p>
      </div>`;
      const div = document.createElement('div');
      div.innerHTML = html;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請為以下八字命盤做深度論命。
性別：${b.gender === 'M' ? '男' : '女'}，國曆 ${b.y}/${b.m}/${b.d} ${b.hh}:${String(b.mi).padStart(2, '0')} 生
四柱：年柱${p.year.name}、月柱${p.month.name}、日柱${p.day.name}、時柱${p.hour.name}
藏干：年支藏${p.year.cang.join('')}、月支藏${p.month.cang.join('')}、日支藏${p.day.cang.join('')}、時支藏${p.hour.cang.join('')}
五行分布：${Object.entries(wx).map(([k, v]) => k + v).join(' ')}，日主${p.day.gan}${p.day.ganWx}身${str.label}
格局：${ge.name}（月令${p.month.zhi}本氣取格，格神${ge.luFlag ? '為日主祿刃' : (ge.exposed ? '透干' : '藏而未透')}）；命中主要十神：${doms.map(([g, n]) => `${g}${n}`).join('、')}
神煞：${ss.map(s => `${s.name}（${s.positions.join('、')}柱）`).join('、') || '無明顯神煞'}
合沖刑害：${relations.map(r => r.text).join('；') || '無明顯'}
調候用神（參考）：${th ? th.split('').join('、') : '無'}
大運（已依用神${like}${avoid ? `／忌神${avoid}` : ''}標吉凶）：${luck.startAge}歲起${luck.forward ? '順' : '逆'}行，${luck.list.map(d => `${d.age}歲${d.name}(${daYunLuck(d, like, avoid).label})`).join('、')}
未來十年流年：${flowYears.map(f => `${f.year}${f.name}(${f.tenGod}${f.tags.length ? '，' + f.tags.join('/') : ''})`).join('、')}
請分析：1) 日主強弱與格局（已定${ge.name}，請據此論格局高低與成敗、喜忌）2) 喜用神與忌神（請結合調候與合沖刑害精確判斷，可修正上述粗判）3) 性格特質 4) 事業財運方向 5) 感情婚姻 6) 大運與未來十年流年走勢重點（特別標出吉凶轉折年份，並呼應上方大運吉凶標記）7) 命中神煞對格局的加分或提醒（例如天乙貴人所在柱位對應的人生領域、桃花驛馬華蓋等對感情事業的影響）。`);
    });
  }

  App.register({
    id: 'bazi',
    icon: Icons.svg('bazi'),
    title: '八字命理',
    desc: '四柱排盤、格局取用、十神藏干、五行喜忌、大運吉凶標註，天文級節氣精度。',
    render
  });
})();
