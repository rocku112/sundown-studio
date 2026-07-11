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

  function wuxingCount(p) {
    const count = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    for (const key of ['year', 'month', 'day', 'hour']) {
      count[p[key].ganWx]++;
      count[p[key].zhiWx]++;
    }
    return count;
  }

  // 日主強弱（簡化：月令權重加倍，同我/生我為助）
  function strength(p) {
    const me = p.day.ganWx;
    const shengMe = Object.entries(Ganzhi.WX_SHENG).find(([k, v]) => v === me)[0];
    let score = 0, total = 0;
    const items = [
      [p.year.ganWx, 1], [p.month.ganWx, 1], [p.hour.ganWx, 1],
      [p.year.zhiWx, 1], [p.month.zhiWx, 2.5], [p.day.zhiWx, 1], [p.hour.zhiWx, 1]
    ];
    for (const [wx, w] of items) {
      total += w;
      if (wx === me || wx === shengMe) score += w;
    }
    const ratio = score / total;
    return { ratio, label: ratio >= 0.5 ? '偏強' : ratio >= 0.35 ? '中和' : '偏弱', shengMe };
  }

  function render(el) {
    const bf = App.birthForm({ gender: true, time: true });
    el.innerHTML = `
      <div class="panel">
        <h3>輸入出生資料</h3>
        ${bf.html}
        <button class="btn" id="bz-go" style="margin-top:14px">🀄 排 盤</button>
        <p class="muted" style="margin-top:8px">請填國曆（西元）生日；年柱以立春為界、月柱以節氣為界，皆為即時天文計算。</p>
      </div>
      <div id="bz-result"></div>`;

    el.querySelector('#bz-go').addEventListener('click', () => {
      const b = bf.read(el);
      const resEl = el.querySelector('#bz-result');
      resEl.innerHTML = '';
      const p = Ganzhi.fourPillars(b.y, b.m, b.d, b.hh, b.mi);
      const lunar = Astro.toLunar(b.y, b.m, b.d);
      const wx = wuxingCount(p);
      const str = strength(p);
      const luck = Ganzhi.luck(b.y, b.m, b.d, b.hh, b.gender, p);
      const dayGan = p.day.ganIdx;
      const missing = Object.entries(wx).filter(([k, v]) => v === 0).map(([k]) => k);
      const most = Object.entries(wx).sort((a, b2) => b2[1] - a[1])[0];
      // 用神粗判：身強洩剋、身弱生扶
      const like = str.label === '偏強'
        ? Ganzhi.WX_SHENG[p.day.ganWx]
        : (str.label === '偏弱' ? str.shengMe : p.day.ganWx);
      const relations = Ganzhi.branchRelations(p);
      const th = Ganzhi.tiaohou(p.day.ganIdx, p.month.zhiIdx);
      const nowYear = new Date().getFullYear();
      const flowYears = Ganzhi.yearlyFortune(nowYear, 10, p);
      const flowMonths = Ganzhi.monthlyFortune(nowYear, p);

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
        <h4>日主性格 · ${p.day.gan}${p.day.ganWx}</h4>
        <p>${GAN_CHAR[p.day.gan]}</p>
        <p style="margin-top:6px">${WX_ADVICE[like]}</p>
        <hr class="divider">
        <h4>大運（${luck.startAge} 歲起運，${luck.forward ? '順' : '逆'}行）</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${luck.list.map(d => `<div class="aspect" style="min-width:88px;text-align:center;flex:1">
            <b>${d.age}-${d.age + 9}歲</b><span style="font-size:18px;letter-spacing:.15em">${d.name}</span>
            <div class="muted" style="font-size:12px">${d.nayin}</div></div>`).join('')}
        </div>
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
合沖刑害：${relations.map(r => r.text).join('；') || '無明顯'}
調候用神（參考）：${th ? th.split('').join('、') : '無'}
大運：${luck.startAge}歲起${luck.forward ? '順' : '逆'}行，${luck.list.map(d => `${d.age}歲${d.name}`).join('、')}
未來十年流年：${flowYears.map(f => `${f.year}${f.name}(${f.tenGod}${f.tags.length ? '，' + f.tags.join('/') : ''})`).join('、')}
請分析：1) 日主強弱與格局 2) 喜用神與忌神（請結合調候與合沖刑害精確判斷，可修正上述粗判）3) 性格特質 4) 事業財運方向 5) 感情婚姻 6) 大運與未來十年流年走勢重點（特別標出吉凶轉折年份）。`);
    });
  }

  App.register({
    id: 'bazi',
    icon: '🀄',
    title: '八字命理',
    desc: '四柱排盤、十神藏干、五行喜忌、大運走勢，天文級節氣精度。',
    render
  });
})();
