/* 暮卜先知 · 每日運勢（生肖＋星座） */
(() => {
  const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];
  const SIGNS = [
    { name: '牡羊座', sym: '♈', elem: '火', s: 321, e: 419 }, { name: '金牛座', sym: '♉', elem: '土', s: 420, e: 520 },
    { name: '雙子座', sym: '♊', elem: '風', s: 521, e: 621 }, { name: '巨蟹座', sym: '♋', elem: '水', s: 622, e: 722 },
    { name: '獅子座', sym: '♌', elem: '火', s: 723, e: 822 }, { name: '處女座', sym: '♍', elem: '土', s: 823, e: 922 },
    { name: '天秤座', sym: '♎', elem: '風', s: 923, e: 1023 }, { name: '天蠍座', sym: '♏', elem: '水', s: 1024, e: 1122 },
    { name: '射手座', sym: '♐', elem: '火', s: 1123, e: 1221 }, { name: '摩羯座', sym: '♑', elem: '土', s: 1222, e: 120 },
    { name: '水瓶座', sym: '♒', elem: '風', s: 121, e: 218 }, { name: '雙魚座', sym: '♓', elem: '水', s: 219, e: 320 }
  ];
  const signByDate = (m, d) => { const v = m * 100 + d; return SIGNS.find(s => s.name === '摩羯座' && (v >= 1222 || v <= 120)) || SIGNS.find(s => v >= s.s && v <= s.e) || SIGNS[9]; };
  const zhiRel = (a, b) => Ganzhi.zhiRelation(a, b);

  // 依關係給星等與短評
  function starOf(rel) {
    return ({ 六合: 5, 三合: 5, 同支: 4, 平: 3, 六害: 2, 相刑: 2, 自刑: 2, 六沖: 1 })[rel.type] || 3;
  }
  const starBar = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const lucky = { 1: '大凶', 2: '小凶', 3: '平', 4: '吉', 5: '大吉' };

  // 依分數（1-5）給四面向短語（deterministic，用星等挑）
  const ADVICE = {
    career: { 5: '諸事順遂，主動出擊有斬獲，適合提案、面試、簽約。', 4: '穩中有進，按計畫推進即可見效。', 3: '平順無波，守成為主，勿強求突破。', 2: '易有阻滯與雜音，低調行事、避免衝突。', 1: '沖犯較重，重大決定暫緩，明日再議。' },
    wealth: { 5: '正偏財皆旺，把握機會但仍量力而為。', 4: '財運和順，正財穩定可期。', 3: '收支平平，理性消費即可。', 2: '易有破財或糾紛，勿借貸、勿衝動投資。', 1: '慎防漏財與被騙，錢包看緊。' },
    love: { 5: '桃花與感情皆旺，單身有緣、有伴甜蜜。', 4: '互動融洽，適合表白或約會。', 3: '關係平穩，多點主動更好。', 2: '易生口角誤會，多包容少計較。', 1: '情緒對沖，今日避免爭執與衝動決定。' },
    health: { 5: '精神飽滿，適合運動與戶外。', 4: '身心和諧，作息規律即佳。', 3: '狀態平平，留意小疲勞。', 2: '易疲倦或小恙，早睡少熬夜。', 1: '氣場受沖，注意飲食與情緒、勿逞強。' }
  };

  function zodiacDaily(zhiIdx, dp, dphase) {
    const rel = zhiRel(dp.zhiIdx, zhiIdx);
    const base = starOf(rel);
    // 四面向以基礎星等微調（用日五行對生肖五行）
    const dWx = Ganzhi.ZHI_WUXING[dp.zhiIdx], zWx = Ganzhi.ZHI_WUXING[zhiIdx];
    const sheng = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
    const ke = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
    const adj = (base, kind) => {
      let s = base;
      if (kind === 'wealth' && (dWx === zWx || sheng[dWx] === zWx)) s = Math.min(5, s + 1);
      if (kind === 'wealth' && ke[dWx] === zWx) s = Math.max(1, s - 1);
      if (kind === 'health' && ke[dWx] === zWx) s = Math.max(1, s - 1);
      if (kind === 'love' && rel.type === '六合') s = 5;
      return s;
    };
    return {
      overall: base, rel,
      career: adj(base, 'career'), wealth: adj(base, 'wealth'), love: adj(base, 'love'), health: adj(base, 'health')
    };
  }

  function zodiacYear(zhiIdx, year) {
    const taiZhi = ((year - 4) % 12 + 12) % 12; // 流年太歲支
    const rel = zhiRel(zhiIdx, taiZhi);
    let title, text;
    if (zhiIdx === taiZhi) { title = '值太歲（本命年）'; text = '本命年犯太歲，運勢起伏較大，凡事宜低調穩健，可佩戴紅色或安太歲以求安順。'; }
    else if ((zhiIdx + 6) % 12 === taiZhi) { title = '沖太歲'; text = '沖太歲之年，變動最大——工作、居所、感情易有轉折。變動中藏機會，但需謹慎決策、注意安全。'; }
    else if (rel.type === '六害') { title = '害太歲'; text = '害太歲之年，易有小人與是非口舌，人際上多留心，凡事留書面憑據。'; }
    else if (rel.type === '相刑') { title = '刑太歲'; text = '刑太歲之年，易有壓力與內耗，注意健康與情緒，避免官非與爭訟。'; }
    else if (rel.type === '六合') { title = '合太歲'; text = '與太歲相合，貴人運佳、諸事較順，適合把握機會拓展。'; }
    else if (rel.type === '三合') { title = '三合太歲'; text = '與太歲三合，整體順遂、助力多，是積極進取的好年份。'; }
    else { title = '平順之年'; text = '與太歲無沖無合，運勢平穩，按部就班經營即可有成。'; }
    return { title, text, good: rel.good };
  }

  // 星座每日：以今日月亮所在星座 vs 你的太陽星座（相位）
  function astroDaily(sign, jde) {
    const moonSignIdx = Math.floor(Astro.norm360(Astro.moonLongitude(jde)) / 30);
    const sunSignIdx = SIGNS.indexOf(sign);
    let diff = ((moonSignIdx - sunSignIdx) % 12 + 12) % 12;
    // 相位：0同座 4/8三分(拱) 2/10六合 3/9刑 6沖
    let star, note;
    if (diff === 0) { star = 4; note = '月亮行經你的本命星座，情緒與直覺強烈，是回到自己、充電的一天。'; }
    else if (diff === 4 || diff === 8) { star = 5; note = '月亮與你的星座成三分吉相，順風順水、心想事成，適合推進計畫。'; }
    else if (diff === 2 || diff === 10) { star = 4; note = '月亮與你成六分和諧相位，人際順暢、機會來敲門，主動些更好。'; }
    else if (diff === 3 || diff === 9) { star = 2; note = '月亮與你成四分挑戰相位，內外有些拉扯，宜緩不宜急、深呼吸再決定。'; }
    else if (diff === 6) { star = 2; note = '月亮與你的星座對沖，情緒起伏、關係易緊繃，今日多聽少說為上。'; }
    else { star = 3; note = '月亮相位平和，是尋常安穩的一天，做好日常即可。'; }
    return { star, note, moonSign: SIGNS[moonSignIdx] };
  }

  function astroYear(sign, year) {
    const jde = Astro.localToTT(Astro.toJD(year, 6, 30, 12));
    const jupSignIdx = Math.floor(Astro.norm360(Astro.planetLongitude('jupiter', jde)) / 30);
    const sunIdx = SIGNS.indexOf(sign);
    const jupSign = SIGNS[jupSignIdx];
    let star, note;
    const sameElem = jupSign.elem === sign.elem;
    let diff = ((jupSignIdx - sunIdx) % 12 + 12) % 12;
    if (diff === 0) { star = 5; note = `${year} 木星行經你的星座（每12年一次的大運年），擴展、機會與貴人齊來，是開創與播種的黃金年。`; }
    else if (diff === 4 || diff === 8 || sameElem) { star = 5; note = `${year} 木星與你的星座同屬${sign.elem}象／成吉相，運勢開闊，適合學習、遠行、拓展版圖。`; }
    else if (diff === 2 || diff === 10) { star = 4; note = `${year} 木星與你成和諧相位，貴人與機會零星到來，把握合作與人脈。`; }
    else if (diff === 6) { star = 3; note = `${year} 木星與你的星座對沖，關係與合作是主題，慎防過度樂觀與擴張。`; }
    else { star = 3; note = `${year} 木星位於你的${(diff) + 1}宮方向，成長來自日常累積，穩健為上。`; }
    return { star, note, jupSign };
  }

  function render(el) {
    const now = new Date();
    el.innerHTML = `
      <div class="panel">
        <div class="form-grid">
          <div class="field"><label>你的生肖（或出生年）</label>
            <input type="number" class="ft-y" value="${now.getFullYear() - 30}" min="1900" max="2100" style="width:110px"></div>
          <div class="field"><label>國曆生日（看星座）</label>
            <input type="number" class="ft-m" value="1" min="1" max="12" style="width:64px" placeholder="月">
            <input type="number" class="ft-d" value="1" min="1" max="31" style="width:64px" placeholder="日"></div>
          <button class="btn small" id="ft-go" style="align-self:flex-end">🌟 看運勢</button>
        </div>
        <p class="muted" style="margin-top:8px">生肖以立春為界；星座以國曆生日。每日運勢依當日干支與月亮實際過境計算（同一天結果固定）。</p>
      </div>
      <div id="ft-result"></div>`;

    el.querySelector('#ft-go').addEventListener('click', () => {
      const y = +el.querySelector('.ft-y').value;
      const m = +el.querySelector('.ft-m').value, d = +el.querySelector('.ft-d').value;
      const resEl = el.querySelector('#ft-result');
      resEl.innerHTML = '';
      const yp = Ganzhi.yearPillar(y, 6, 1); // 以年中取生肖（避免立春邊界；提示已註明）
      const zhiIdx = yp.zhiIdx;
      const sign = signByDate(m, d);

      const dp = Ganzhi.dayPillar(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const jde = Astro.localToTT(Astro.toJD(now.getFullYear(), now.getMonth() + 1, now.getDate(), 12));
      const zd = zodiacDaily(zhiIdx, dp);
      const zy = zodiacYear(zhiIdx, now.getFullYear());
      const ad = astroDaily(sign, jde);
      const ay = astroYear(sign, now.getFullYear());

      const aspectBlock = (label, star, text) => `<div class="aspect"><b>${label} ${starBar(star)} ${lucky[star]}</b>${text}</div>`;

      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <div style="text-align:center">
          <div style="font-size:22px;color:var(--navy);font-weight:700">屬${SHENGXIAO[zhiIdx]} · ${sign.sym}${sign.name}</div>
          <div class="muted">${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${dp.name}日</div>
        </div>
        <hr class="divider">
        <h4>🐾 生肖今日（屬${SHENGXIAO[zhiIdx]}）<span class="muted" style="font-weight:400">　今日${dp.zhi}日與你生肖${zd.rel.type}</span></h4>
        <div style="text-align:center;margin:6px 0"><span class="fortune-level ${zd.overall >= 4 ? 'good' : zd.overall <= 2 ? 'bad' : 'mid'}">${starBar(zd.overall)} ${lucky[zd.overall]}</span></div>
        <div class="aspect-grid">
          ${aspectBlock('事業', zd.career, ADVICE.career[zd.career])}
          ${aspectBlock('財運', zd.wealth, ADVICE.wealth[zd.wealth])}
          ${aspectBlock('感情', zd.love, ADVICE.love[zd.love])}
          ${aspectBlock('健康', zd.health, ADVICE.health[zd.health])}
        </div>
        <h4 style="margin-top:16px">🌙 星座今日（${sign.name}）</h4>
        <p>${starBar(ad.star)} ${lucky[ad.star]}　<span class="muted">今日月亮在${ad.moonSign.sym}${ad.moonSign.name}</span></p>
        <p>${ad.note}</p>
        <hr class="divider">
        <h4>📅 ${now.getFullYear()} 生肖流年（屬${SHENGXIAO[zhiIdx]}）</h4>
        <p><span class="tag ${zy.good === false ? '' : 'gold'}" ${zy.good === false ? 'style="color:var(--cinnabar)"' : ''}>${zy.title}</span></p>
        <p>${zy.text}</p>
        <h4>🪐 ${now.getFullYear()} 星座流年（${sign.name}）</h4>
        <p>${starBar(ay.star)}　<span class="muted">流年木星在${ay.jupSign.sym}${ay.jupSign.name}</span></p>
        <p>${ay.note}</p>
        <p class="muted" style="margin-top:10px">※ 每日運勢每天更新（依當日天象計算）；此為概略指引，個人詳批請看八字或紫微命盤。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請為以下對象做今日與流年運勢綜合解讀。
生肖：${SHENGXIAO[zhiIdx]}；星座：${sign.name}
今日（${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}，${dp.name}日）：生肖與今日${zd.rel.type}，星座逢月亮在${ad.moonSign.name}
${now.getFullYear()}流年：生肖${zy.title}，木星在${ay.jupSign.name}
請用溫暖具體的語氣，給出今日的行動建議（事業、財運、感情、健康各一句），並點出今年整體的重點與提醒。`);
    });

    el.querySelector('#ft-go').click();
  }

  App.register({
    id: 'fortune',
    icon: '🌟',
    title: '每日運勢',
    desc: '生肖＋星座的今日與流年運勢，依當日干支與月亮實際過境計算。',
    render
  });
})();
