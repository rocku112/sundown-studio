/* 暮卜先知 · 大六壬神課（天地盤・四課・三傳・貴神） */
(() => {
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  const YINYANG = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]; // 1陽0陰（子陽丑陰…）
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const GAN_WX = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  const GAN_YY = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  // 十二將神名
  const JIANG = { 0: '神后', 1: '大吉', 2: '功曹', 3: '太衝', 4: '天罡', 5: '太乙', 6: '勝光', 7: '小吉', 8: '傳送', 9: '從魁', 10: '河魁', 11: '登明' };
  // 日干寄宮
  const JIGONG = { 甲: 2, 乙: 4, 丙: 5, 丁: 7, 戊: 5, 己: 7, 庚: 8, 辛: 10, 壬: 11, 癸: 1 };
  // 中氣 k → 月將地支
  const YUEJIANG = { 1: 0, 3: 11, 5: 10, 7: 9, 9: 8, 11: 7, 13: 6, 15: 5, 17: 4, 19: 3, 21: 2, 23: 1 };
  // 三刑
  const XING = { 0: 3, 3: 0, 2: 5, 5: 8, 8: 2, 1: 10, 10: 7, 7: 1, 4: 4, 6: 6, 9: 9, 11: 11 };
  const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

  // 十二天將（貴人起）
  const TIANJIANG = ['貴人', '螣蛇', '朱雀', '六合', '勾陳', '青龍', '天空', '白虎', '太常', '玄武', '太陰', '天后'];
  // 晝夜貴人（日干 → [晝, 夜]）
  const GUIREN = { 甲: [1, 7], 戊: [1, 7], 庚: [1, 7], 乙: [0, 8], 己: [0, 8], 丙: [11, 9], 丁: [11, 9], 壬: [3, 5], 癸: [3, 5], 辛: [6, 2] };

  const wxKe = (a, b) => KE[a] === b; // a 剋 b

  function findYuejiang(y, m, d, hh, mi) {
    const jd = Astro.toJD(y, m, d, hh, mi);
    // 找最近的「中氣」（奇數 k）之前
    let best = null;
    for (const yy of [y - 1, y, y + 1]) {
      for (const k of [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]) {
        const tj = Astro.solarTerm(yy, k);
        if (tj <= jd && (!best || tj > best.jd)) best = { jd: tj, k, name: Astro.TERM_NAMES[k] };
      }
    }
    return { zhi: YUEJIANG[best.k], term: best.name };
  }

  function buildCourse(y, m, d, hh, mi) {
    const dp = Ganzhi.dayPillar(y, m, d);
    const hourIdx = Math.floor(((hh + 1) % 24) / 2) % 12; // 時支
    const yj = findYuejiang(y, m, d, hh, mi);
    const offset = ((yj.zhi - hourIdx) % 12 + 12) % 12; // 月將加時
    // 天盤：地盤位置 z 之上神 = z + offset
    const tian = (z) => (z + offset) % 12;      // 地盤z → 天盤上神
    const diOf = (t) => ((t - offset) % 12 + 12) % 12; // 天盤神 → 落在地盤何處

    const isFuyin = offset === 0;
    const isFanyin = offset === 6;

    // 四課
    const dayGan = dp.gan, dayGanIdx = dp.ganIdx, jigong = JIGONG[dayGan];
    const daySupport = dp.zhiIdx; // 日支
    const c1u = tian(jigong);           // 一課上（干上神）
    const c2u = tian(c1u);              // 二課上
    const c3u = tian(daySupport);       // 三課上（支上神）
    const c4u = tian(c3u);              // 四課上
    const courses = [
      { u: c1u, d: jigong, isGan: true, label: '一課(干陽)' },
      { u: c2u, d: c1u, label: '二課(干陰)' },
      { u: c3u, d: daySupport, label: '三課(支陽)' },
      { u: c4u, d: c3u, label: '四課(支陰)' }
    ];
    // 一課下神以日干五行參與剋
    const lowerWx = (c, i) => i === 0 ? GAN_WX[dayGanIdx] : ZHI_WX[c.d];

    // 賊剋
    const harms = [];
    courses.forEach((c, i) => {
      const uw = ZHI_WX[c.u], dw = lowerWx(c, i);
      if (wxKe(dw, uw)) harms.push({ shen: c.u, type: '賊', i }); // 下剋上
      else if (wxKe(uw, dw)) harms.push({ shen: c.u, type: '剋', i }); // 上剋下
    });

    let chu, method;
    const dayYY = GAN_YY[dayGanIdx];
    function biYong(cands) {
      // 比用：取上神陰陽與日干相同者
      const same = cands.filter(c => YINYANG[c.shen] === dayYY);
      if (same.length === 1) return { shen: same[0].shen, m: '比用法' };
      const pool = same.length ? same : cands;
      // 涉害（簡）：取上神落地盤四孟(寅申巳亥)者，次四仲(子午卯酉)
      const meng = pool.filter(c => [2, 8, 5, 11].includes(diOf(c.shen)));
      const zhong = pool.filter(c => [0, 6, 3, 9].includes(diOf(c.shen)));
      const pick = (meng[0] || zhong[0] || pool[0]);
      return { shen: pick.shen, m: '涉害法' };
    }

    var forcedMid, forcedEnd;
    // 驛馬（日支三合之馬）
    const YIMA = { 8: 2, 0: 2, 4: 2, 2: 8, 6: 8, 10: 8, 5: 11, 9: 11, 1: 11, 11: 5, 3: 5, 7: 5 };
    if (isFuyin) {
      // 伏吟：剛日取干寄宮、柔日取日支為初傳
      chu = dayYY ? jigong : daySupport;
      method = '伏吟課';
      // 中傳：初傳之刑；若初傳自刑，改取沖。末傳：中傳之刑；若中傳自刑，取沖
      forcedMid = (XING[chu] === chu) ? (chu + 6) % 12 : XING[chu];
      forcedEnd = (XING[forcedMid] === forcedMid) ? (forcedMid + 6) % 12 : XING[forcedMid];
    } else if (isFanyin && harms.length === 0) {
      // 反吟無剋：取日支驛馬為初傳，中末循天盤
      chu = YIMA[daySupport]; method = '反吟・驛馬';
    } else if (harms.length === 0) {
      // 遙剋：上神剋日干(蒿矢) 優先，否則 日干剋上神(彈射)
      const haoshi = courses.filter(c => wxKe(ZHI_WX[c.u], GAN_WX[dayGanIdx]));
      const tanshe = courses.filter(c => wxKe(GAN_WX[dayGanIdx], ZHI_WX[c.u]));
      const pool = haoshi.length ? haoshi.map(c => ({ shen: c.u })) : tanshe.map(c => ({ shen: c.u }));
      if (pool.length) {
        chu = pool.length === 1 ? pool[0].shen : biYong(pool).shen;
        method = haoshi.length ? '遙剋・蒿矢' : '遙剋・彈射';
      } else {
        // 昴星：陽日取地盤酉之上神；陰日取天盤酉落地盤處
        chu = dayYY ? tian(9) : diOf(9);
        method = isFanyin ? '反吟・昴星' : '昴星課';
      }
    } else {
      const zei = harms.filter(h => h.type === '賊');
      const cands = zei.length ? zei : harms;
      if (cands.length === 1) { chu = cands[0].shen; method = cands[0].type === '賊' ? '重審課' : '元首課'; }
      else { const r = biYong(cands); chu = r.shen; method = r.m; }
      if (isFanyin) method = '反吟・' + method;
    }

    // 中末傳
    let zhong, mo;
    if (typeof forcedMid !== 'undefined') { zhong = forcedMid; mo = forcedEnd; }
    else { zhong = tian(chu); mo = tian(zhong); }
    // 伏吟/反吟 若中末與初同支，取刑或沖以避免停滯
    if (!isFuyin && zhong === chu) zhong = XING[chu];
    if (mo === zhong) mo = XING[zhong];

    // 貴人（晝夜）
    const dayHours = hourIdx >= 3 && hourIdx <= 8; // 卯~申為晝
    const gz = GUIREN[dayGan][dayHours ? 0 : 1];
    // 貴人落天盤位置（地盤何處見貴人天盤神）：貴人在地盤位置
    const guiDi = diOf(gz); // 貴人天盤神 gz 落在地盤 guiDi
    // 順逆：貴人天盤神落地盤 亥子丑寅卯辰(順) 巳午未申酉戌(逆)
    const shun = [11, 0, 1, 2, 3, 4].includes(guiDi);
    // 十二天將排在天盤十二神上：以貴人天盤神 gz 為起點
    const tjOf = {}; // 天盤神(地支idx) → 天將名
    for (let i = 0; i < 12; i++) {
      const shen = shun ? (gz + i) % 12 : ((gz - i) % 12 + 12) % 12;
      tjOf[shen] = TIANJIANG[i];
    }

    return {
      dp, hourIdx, yj, offset, isFuyin, isFanyin,
      tian, diOf, jigong, dayGan, daySupport, courses, harms,
      chu, zhong, mo, method, gz, dayHours, tjOf, shun
    };
  }

  const QCATS = [
    '綜合', '求財', '事業官運', '婚姻感情', '疾病', '出行', '尋人失物', '訴訟'
  ];

  function render(el) {
    el.innerHTML = `
      <div class="panel">
        <h3>起課</h3>
        <div class="form-grid" style="margin-bottom:10px">
          <div class="field" style="flex:1"><label>所問之事</label><input class="dl-q" placeholder="例：這件事能成嗎？" style="width:100%"></div>
          <div class="field"><label>問類</label><select class="dl-cat">${QCATS.map(c => `<option>${c}</option>`).join('')}</select></div>
        </div>
        <button class="btn" id="dl-go">🎴 以此刻起課</button>
        <p class="muted" style="margin-top:10px">大六壬以「月將加時」布天地盤，立四課、發三傳、加十二天將。月將依中氣、時辰依此刻。</p>
      </div>
      <div id="dl-result"></div>`;

    el.querySelector('#dl-go').addEventListener('click', () => {
      const resEl = el.querySelector('#dl-result');
      resEl.innerHTML = '';
      const now = new Date();
      const q = buildCourse(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
      const question = el.querySelector('.dl-q').value.trim();
      const cat = el.querySelector('.dl-cat').value;

      const shenName = (z) => `${ZHI[z]}<small class="muted">${JIANG[z]}</small>`;
      // 四課呈現（右到左：一二三四）
      const courseCells = q.courses.map((c) => `
        <div style="text-align:center;padding:4px 8px">
          <div style="color:var(--cinnabar)">${q.tjOf[c.u]}</div>
          <div style="font-size:18px;color:var(--navy);font-weight:700">${ZHI[c.u]}</div>
          <div style="font-size:17px">${c.isGan ? q.dayGan : ZHI[c.d]}</div>
          <div class="muted" style="font-size:11px">${c.label}</div>
        </div>`).reverse().join('');

      // 三傳
      const chuan = [['初傳', q.chu], ['中傳', q.zhong], ['末傳', q.mo]].map(([n, z]) => `
        <div class="aspect" style="text-align:center;flex:1">
          <b style="display:block">${n}</b>
          <div style="color:var(--cinnabar);font-size:12px">${q.tjOf[z]}</div>
          <div style="font-size:22px;color:var(--navy);font-weight:700">${ZHI[z]}</div>
          <div class="muted" style="font-size:12px">${JIANG[z]}・${ZHI_WX[z]}</div>
        </div>`).join('');

      // 天地盤（12 宮環狀簡表：地盤固定，標天盤上神＋天將）
      let plate = '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin:10px 0">';
      const order = [5, 6, 7, 8, 4, 9, 3, 10, 2, 1, 0, 11]; // 排版順序（示意）
      for (let z = 0; z < 12; z++) {
        const up = q.tian(z);
        plate += `<div class="qm-cell" style="aspect-ratio:auto;padding:6px">
          <div style="color:var(--cinnabar);font-size:11px">${q.tjOf[up]}</div>
          <div class="star" style="font-size:16px">${ZHI[up]}</div>
          <div class="gong" style="font-size:11px">地盤 ${ZHI[z]}</div>
        </div>`;
      }
      plate += '</div>';

      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <div style="text-align:center">
          <div class="muted">${question ? `所問：${question}（${cat}） · ` : cat + ' · '}${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}</div>
          <div class="muted">${q.dp.name}日 ${ZHI[q.hourIdx]}時 · 月將${ZHI[q.yj.zhi]}（${JIANG[q.yj.zhi]}，${q.yj.term}後）· ${q.dayHours ? '晝貴' : '夜貴'}</div>
          <div style="margin-top:6px"><span class="tag gold">${q.method}</span>${q.isFuyin ? '<span class="tag">伏吟</span>' : ''}${q.isFanyin ? '<span class="tag">反吟</span>' : ''}<span class="tag">貴人在${ZHI[q.gz]}</span></div>
        </div>
        <hr class="divider">
        <h4>四課</h4>
        <div style="display:flex;justify-content:center;gap:4px;flex-wrap:wrap;border:1px solid var(--panel-border);border-radius:10px;padding:6px">${courseCells}</div>
        <p class="muted" style="text-align:center;font-size:12px">課式由右至左：一課(干)、二課、三課(支)、四課</p>
        <h4>三傳</h4>
        <div style="display:flex;gap:8px">${chuan}</div>
        <h4>天地盤（地盤十二支上之天盤神與天將）</h4>
        ${plate}
        <p class="muted" style="margin-top:8px">※ 內建完成布盤、四課、三傳（賊剋/比用/涉害/遙剋/昴星、伏吟反吟）與十二天將；斷課取用神、年命入傳、神將吉凶等，建議用 AI 深度解讀。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請以大六壬為以下課例斷課。
所問之事：${question || '（未明說）'}（問類：${cat}）
時間：${q.dp.name}日 ${ZHI[q.hourIdx]}時，月將${ZHI[q.yj.zhi]}（${JIANG[q.yj.zhi]}）
課體：${q.method}${q.isFuyin ? '（伏吟）' : ''}${q.isFanyin ? '（反吟）' : ''}
四課（上神/下神，附天將）：
${q.courses.map((c, i) => `${c.label}：上${ZHI[c.u]}(${JIANG[c.u]}/${q.tjOf[c.u]}) 下${c.isGan ? q.dayGan : ZHI[c.d]}`).join('\n')}
三傳：初${ZHI[q.chu]}(${JIANG[q.chu]}/${q.tjOf[q.chu]})、中${ZHI[q.zhong]}(${JIANG[q.zhong]}/${q.tjOf[q.zhong]})、末${ZHI[q.mo]}(${JIANG[q.mo]}/${q.tjOf[q.mo]})
貴人在${ZHI[q.gz]}（${q.dayHours ? '晝' : '夜'}貴）
請依課體、三傳生剋與神將，結合所問之事，判斷事情的起因、發展、結果與應期，並給出建議。`);
    });
  }

  App.register({
    id: 'daliuren',
    icon: '🎴',
    title: '大六壬',
    desc: '月將加時布天地盤，四課三傳、十二天將，占事精微的帝王之學。',
    render
  });
})();
