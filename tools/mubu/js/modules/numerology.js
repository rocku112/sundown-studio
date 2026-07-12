/* 暮卜先知 · 數字能量（生命靈數＋手機號碼八星磁場） */
(() => {
  // ---------- 生命靈數（畢達哥拉斯系統） ----------
  const LIFE_PATH = {
    1: { name: '開創者', trait: '獨立自主、有領導力與開創精神，目標明確、行動力強。', challenge: '易固執、過於自我，學習傾聽與合作是課題。', career: '創業、領導、開拓性職務。' },
    2: { name: '協調者', trait: '溫和敏感、善解人意，是天生的協調者與合作夥伴。', challenge: '易優柔寡斷、依賴他人，需建立自信與界線。', career: '幕僚、公關、諮商、團隊協作。' },
    3: { name: '表現者', trait: '樂觀開朗、富創造力與表達力，社交魅力十足。', challenge: '易三分鐘熱度、逃避深度，需要專注與紀律。', career: '創作、演藝、行銷、教學。' },
    4: { name: '建構者', trait: '務實穩重、有紀律與執行力，是可靠的築基者。', challenge: '易固守成規、缺乏彈性，學習變通與放鬆。', career: '工程、財會、管理、技術專業。' },
    5: { name: '自由者', trait: '好奇多變、熱愛自由與冒險，適應力強、多才多藝。', challenge: '易善變、缺乏定性，需要在自由中找到承諾。', career: '業務、旅遊、媒體、多元斜槓。' },
    6: { name: '守護者', trait: '有責任感、重視家庭與愛，樂於付出與照顧他人。', challenge: '易過度犧牲、控制欲強，學習照顧自己。', career: '教育、醫護、服務、家庭事業。' },
    7: { name: '探索者', trait: '善於思考、追求真理與內在，具研究與洞察天賦。', challenge: '易孤僻多疑、想太多，需要與人連結。', career: '研究、學術、心靈、專業技術。' },
    8: { name: '權威者', trait: '企圖心強、重視成就與物質，具商業與管理才能。', challenge: '易工作狂、看重權力，學習平衡與慷慨。', career: '商業、金融、企業經營、投資。' },
    9: { name: '博愛者', trait: '理想主義、慈悲寬容，關懷群體、有藝術氣質。', challenge: '易情緒化、不切實際，學習務實與放下。', career: '公益、藝術、教育、助人工作。' },
    11: { name: '啟發者（大師數）', trait: '直覺敏銳、富靈性與感召力，是理想的啟發者。', challenge: '敏感易緊張，需將高頻能量落地實踐。', career: '心靈導師、創作、療癒、啟發性工作。' },
    22: { name: '建造大師（大師數）', trait: '兼具理想與實踐力，能把宏大願景化為現實。', challenge: '壓力極大，需相信自己並穩步實現。', career: '大型專案、社會工程、跨界整合。' },
    33: { name: '大愛導師（大師數）', trait: '無私奉獻、以愛服務眾生，具高度療癒與教化力。', challenge: '易背負過重，需先充滿自己才能給予。', career: '教育、公益、心靈導師、大愛志業。' }
  };
  function digitSum(n) { return String(n).split('').reduce((a, c) => a + (+c || 0), 0); }
  function reduceNum(n) {
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = digitSum(n);
    return n;
  }
  function lifePath(y, m, d) {
    const total = digitSum(y) + digitSum(m) + digitSum(d);
    const lp = reduceNum(total);
    const birthNum = reduceNum(d); // 生日數（天賦）
    return { lp, birthNum, total };
  }

  // ---------- 手機號碼八星磁場（號碼能量學） ----------
  const FIELD = {
    天醫: { luck: '吉', k: '財富・貴人・不勞而獲', d: '天醫磁場主錢財與貴人，心思細膩、賺錢輕鬆，人緣佳。' },
    延年: { luck: '吉', k: '領導・專業・毅力', d: '延年磁場主專業與領導，做事有始有終、責任心強。' },
    生氣: { luck: '吉', k: '貴人・樂觀・順遂', d: '生氣磁場主樂觀順遂，逢凶化吉、少煩惱、人緣好。' },
    伏位: { luck: '小吉', k: '蓄勢・穩定・專注', d: '伏位磁場主穩定與耐性，蓄勢待發、專注持久，但較保守。' },
    絕命: { luck: '凶', k: '波動・投資・大起大落', d: '絕命磁場主極端與冒險，聰明果決但情緒起伏、易大起大落。' },
    五鬼: { luck: '凶', k: '聰明・變動・不安', d: '五鬼磁場主聰明多變，才華洋溢但心緒不定、易招是非。' },
    六煞: { luck: '凶', k: '桃花・人際・情感糾纏', d: '六煞磁場主人際與桃花，感情豐富但易糾纏、為情所困。' },
    禍害: { luck: '凶', k: '口舌・是非・勞碌', d: '禍害磁場主口才與是非，能言善道但易有口角、身心勞碌。' }
  };
  // 兩位數字組合 → 磁場（河洛八星配對，含反序）
  const PAIR = {};
  const addPairs = (field, arr) => arr.forEach(p => { PAIR[p] = field; PAIR[p[1] + p[0]] = field; });
  addPairs('天醫', ['13', '68', '94', '72']);
  addPairs('延年', ['19', '87', '34', '26']);
  addPairs('生氣', ['14', '67', '93', '28']);
  addPairs('禍害', ['17', '89', '46', '23']);
  addPairs('六煞', ['16', '47', '38', '29']);
  addPairs('五鬼', ['18', '97', '36', '24']);
  addPairs('絕命', ['12', '96', '84', '37']);
  ['11', '22', '33', '44', '66', '77', '88', '99'].forEach(p => PAIR[p] = '伏位');

  function analyzePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 4) return null;
    // 相鄰重疊兩兩配對（略過含 0/5 的組合，0/5 視為特殊數）
    const pairs = [];
    for (let i = 0; i < digits.length - 1; i++) {
      const a = digits[i], b = digits[i + 1];
      if (a === '0' || b === '0' || a === '5' || b === '5') {
        pairs.push({ pair: a + b, field: null, special: true });
      } else {
        pairs.push({ pair: a + b, field: PAIR[a + b] || '伏位', special: false });
      }
    }
    const tally = {};
    pairs.forEach(p => { if (p.field) tally[p.field] = (tally[p.field] || 0) + 1; });
    const goodCount = Object.entries(tally).filter(([f]) => ['天醫', '延年', '生氣', '伏位'].includes(f)).reduce((a, [, v]) => a + v, 0);
    const badCount = Object.entries(tally).filter(([f]) => ['絕命', '五鬼', '六煞', '禍害'].includes(f)).reduce((a, [, v]) => a + v, 0);
    // 末四碼權重最大（磁場學重尾數）
    const tail = pairs.slice(-3);
    const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const score = Math.max(10, Math.min(98, 55 + (goodCount - badCount) * 7 + (tail.filter(p => p.field && ['天醫', '延年', '生氣', '伏位'].includes(p.field)).length) * 4));
    return { digits, pairs, tally, goodCount, badCount, dominant, score, tail };
  }

  function render(el) {
    el.innerHTML = `
      <div class="panel">
        <div class="form-grid" style="margin-bottom:8px">
          <div class="field"><label>模式</label>
            <select id="nu-mode"><option value="life">生命靈數（西方）</option><option value="phone">手機號碼能量（八星磁場）</option></select></div>
        </div>
        <div id="nu-life-in">
          <div class="form-grid">
            <div class="field"><label>國曆生日 年</label><input type="number" id="nu-y" min="1900" max="2100" value="1995" style="width:100px"></div>
            <div class="field"><label>月</label><input type="number" id="nu-m" min="1" max="12" value="1" style="width:64px"></div>
            <div class="field"><label>日</label><input type="number" id="nu-d" min="1" max="31" value="1" style="width:64px"></div>
          </div>
        </div>
        <div id="nu-phone-in" style="display:none">
          <div class="field"><label>手機／電話號碼</label>
            <input id="nu-phone" placeholder="0912345678" style="width:220px" inputmode="numeric"></div>
        </div>
        <button class="btn" id="nu-go" style="margin-top:14px">${Icons.svg('numerology')} 分析</button>
        <p class="muted" style="margin-top:8px">生命靈數＝出生年月日數字相加至個位（含大師數 11/22/33）；手機能量依河洛八星磁場配對，末碼影響最大。</p>
      </div>
      <div id="nu-result"></div>`;

    const modeSel = el.querySelector('#nu-mode');
    modeSel.addEventListener('change', () => {
      el.querySelector('#nu-life-in').style.display = modeSel.value === 'life' ? '' : 'none';
      el.querySelector('#nu-phone-in').style.display = modeSel.value === 'phone' ? '' : 'none';
    });

    el.querySelector('#nu-go').addEventListener('click', () => {
      const resEl = el.querySelector('#nu-result');
      resEl.innerHTML = '';
      if (modeSel.value === 'life') {
        const y = +el.querySelector('#nu-y').value, m = +el.querySelector('#nu-m').value, d = +el.querySelector('#nu-d').value;
        const r = lifePath(y, m, d);
        const info = LIFE_PATH[r.lp];
        const bInfo = LIFE_PATH[r.birthNum];
        const div = document.createElement('div');
        div.innerHTML = `<div class="panel result">
          <div style="text-align:center">
            <div class="muted">${y}/${m}/${d} · 數字相加 ${r.total} →</div>
            <div style="font-size:52px;color:var(--navy);font-weight:700;line-height:1.3">${r.lp}</div>
            <div style="font-size:19px;color:var(--gold-deep)">生命靈數・${info.name}</div>
          </div>
          <hr class="divider">
          <p>${info.trait}</p>
          ${App.aspectGrid([['天賦特質', info.trait], ['人生課題', info.challenge], ['適合方向', info.career], [`生日數 ${r.birthNum}（先天天賦）`, bInfo.trait]])}
          <p class="muted" style="margin-top:10px">※ 生命靈數描繪先天性格藍圖與人生主軸；欲知運勢流年，可搭配八字或紫微。</p>
        </div>`;
        resEl.appendChild(div);
        AI.attach(div.querySelector('.panel'), () =>
          `請以生命靈數（西方數字學）深度解讀。
生日：${y}/${m}/${d}，生命靈數 ${r.lp}（${info.name}），生日數 ${r.birthNum}。
請分析：1) 核心性格與天賦 2) 人生主要課題與盲點 3) 事業與財富傾向 4) 感情與人際模式 5) 給這個生命靈數的成長建議。`);
        return;
      }
      // 手機
      const raw = el.querySelector('#nu-phone').value;
      const r = analyzePhone(raw);
      if (!r) { resEl.innerHTML = '<div class="panel result"><p style="color:var(--cinnabar)">⚠ 請輸入至少 4 位數字的號碼</p></div>'; return; }
      const color = r.score >= 70 ? 'var(--gold-deep)' : r.score >= 45 ? 'var(--ink-dim)' : 'var(--cinnabar)';
      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <div style="text-align:center">
          <div class="muted" style="letter-spacing:.15em;font-size:16px">${r.digits}</div>
          <div style="font-size:48px;font-weight:700;color:${color};line-height:1.4">${r.score}<span style="font-size:18px">分</span></div>
          <div class="muted">主磁場：<b style="color:var(--navy)">${r.dominant ? r.dominant[0] : '—'}</b>（${r.goodCount} 吉場・${r.badCount} 凶場）</div>
        </div>
        <hr class="divider">
        <h4>磁場分佈</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
          ${r.pairs.map(p => p.special
            ? `<span class="tag">${p.pair}<small class="muted">特殊(0/5)</small></span>`
            : `<span class="tag ${['天醫', '延年', '生氣', '伏位'].includes(p.field) ? 'gold' : ''}" ${['絕命', '五鬼', '六煞', '禍害'].includes(p.field) ? 'style="color:var(--cinnabar);border-color:rgba(176,48,32,.4)"' : ''}>${p.pair} ${p.field}</span>`).join('')}
        </div>
        <p class="muted" style="text-align:center;margin-top:6px">末三組（尾數）影響最大：${r.tail.map(p => p.pair + (p.field || '')).join('、')}</p>
        <hr class="divider">
        ${Object.entries(r.tally).sort((a, b) => b[1] - a[1]).map(([f, n]) => `<div class="aspect" style="margin-top:8px;border-left:3px solid ${['天醫', '延年', '生氣', '伏位'].includes(f) ? 'var(--gold-mid)' : 'var(--cinnabar)'}">
          <b>${f} ×${n}（${FIELD[f].luck}）<span style="font-weight:400;color:var(--ink-dim)">${FIELD[f].k}</span></b>${FIELD[f].d}</div>`).join('')}
        <p class="muted" style="margin-top:10px">※ 號碼能量學為民俗數字學說，僅供參考娛樂；0 為放大數、5 為中性帝王數，此處計為特殊數不計吉凶。</p>
      </div>`;
      resEl.appendChild(div);
      AI.attach(div.querySelector('.panel'), () =>
        `請以號碼能量學（河洛八星磁場）解讀手機號碼 ${r.digits}。
磁場分佈：${Object.entries(r.tally).map(([f, n]) => f + '×' + n).join('、')}，吉場${r.goodCount}、凶場${r.badCount}，主磁場${r.dominant ? r.dominant[0] : '無'}，尾數組${r.tail.map(p => p.pair + (p.field || '特殊')).join('、')}。
請分析：1) 這個號碼帶給使用者的整體能量傾向 2) 對財運、事業、人際、感情的影響 3) 尾數磁場的重點 4) 若能量偏弱，給出選號或改善建議。`);
    });
  }

  App.register({
    id: 'numerology',
    icon: Icons.svg('numerology'),
    title: '數字能量',
    desc: '西方生命靈數（含大師數）＋手機號碼八星磁場，一次看懂你的數字。',
    render
  });
})();
