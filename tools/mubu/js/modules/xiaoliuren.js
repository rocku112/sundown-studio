/* 暮卜先知 · 小六壬（掐指神算） */
(() => {
  const GONG = [
    {
      name: '大安', level: '大吉', wx: '木', star: '青龍',
      verse: '大安事事昌，求謀在東方，失物去不遠，宅舍保安康。',
      text: '身不動時，屬木青龍，凡事主安穩、靜中有福。謀事宜穩紮穩打，不宜躁進。',
      aspects: { career: '職位穩固，按部就班可成，變動反而不利。', love: '感情平穩長久，靜待自然發展。', wealth: '正財平穩，不宜投機。', health: '大致安康，肝膽宜保養。' }
    },
    {
      name: '留連', level: '小凶', wx: '水', star: '玄武',
      verse: '留連事難成，求謀日未明，凡事只宜緩，去者未回程。',
      text: '人未歸時，屬水玄武，主拖延、糾纏、反覆。事情一時難有結果，欲速則不達。',
      aspects: { career: '案子拖延反覆，需耐心周旋。', love: '曖昧不明、拖泥帶水，宜把話說清。', wealth: '款項延遲，催討需時。', health: '慢性纏綿之症，宜耐心調養。' }
    },
    {
      name: '速喜', level: '大吉', wx: '火', star: '朱雀',
      verse: '速喜喜來臨，求財向南行，失物申未午，逢人路上尋。',
      text: '人即至時，屬火朱雀，主喜訊快至、好事臨門。把握時機，速戰速決最有利。',
      aspects: { career: '好消息將至，面試投標皆有利。', love: '有機會急速升溫，主動出擊。', wealth: '偏財小喜，南方有財。', health: '小恙速癒，勿過憂。' }
    },
    {
      name: '赤口', level: '凶', wx: '金', star: '白虎',
      verse: '赤口主口舌，官非切要防，失物急去尋，行人有驚慌。',
      text: '官事凶時，屬金白虎，主口舌是非、爭執官非。慎言慎行，避免衝突與簽約糾紛。',
      aspects: { career: '慎防同事口角、合約爭議。', love: '易起爭執，忍一時風平浪靜。', wealth: '財有損耗，防詐騙糾紛。', health: '注意呼吸道與外傷、手術。' }
    },
    {
      name: '小吉', level: '吉', wx: '木', star: '六合',
      verse: '小吉最吉昌，路上好商量，陰人來報喜，失物在坤方。',
      text: '人來喜時，屬木六合，主和合、貴人相助。談判合作皆宜，有貴人從中牽線。',
      aspects: { career: '合作順利，貴人提攜。', love: '有人牽線作媒，和合之象。', wealth: '合夥得利，正財小進。', health: '漸入佳境，無大礙。' }
    },
    {
      name: '空亡', level: '大凶', wx: '土', star: '勾陳',
      verse: '空亡事不祥，陰人多乖張，求財無利益，行人有災殃。',
      text: '音信稀時，屬土勾陳，主落空、虛耗、無果。所謀多成空，宜靜守待時，勿強求。',
      aspects: { career: '計畫恐落空，暫緩推進。', love: '有名無實，或對方心不在焉。', wealth: '破財虛耗，勿投資。', health: '留意隱疾，宜健康檢查。' }
    }
  ];

  function calc(lunarMonth, lunarDay, hourIdx) {
    // 正月起大安，順數至月
    const mPos = (lunarMonth - 1) % 6;
    // 月上起初一，順數至日
    const dPos = (mPos + lunarDay - 1) % 6;
    // 日上起子時，順數至時（hourIdx: 子=0）
    const hPos = (dPos + hourIdx) % 6;
    return { mPos, dPos, hPos };
  }

  function show(container, lunar, hourIdx, hourName, question) {
    const { mPos, dPos, hPos } = calc(lunar.month, lunar.day, hourIdx);
    const g = GONG[hPos];
    const path = `${GONG[mPos].name} → ${GONG[dPos].name} → <b style="color:var(--gold-bright)">${g.name}</b>`;
    const html = `<div class="panel result">
      <div class="muted" style="text-align:center">農曆${lunar.monthName}${lunar.dayName} ${hourName}時${question ? ` · 所問：${question}` : ''}</div>
      <div style="text-align:center;margin:10px 0">
        <div class="big-glyph">🤞</div>
        <div style="font-size:15px;color:var(--ink-dim)">月上起課：${path}</div>
        <div style="font-size:34px;letter-spacing:.3em;color:var(--gold-bright);margin:8px 0">${g.name}</div>
        <span class="fortune-level ${App.fortuneClass(g.level)}">${g.level}</span>
        <div style="margin-top:6px"><span class="tag">五行屬${g.wx}</span><span class="tag">${g.star}</span></div>
      </div>
      <p class="poem" style="font-size:16px">${g.verse}</p>
      <p style="margin-top:10px">${g.text}</p>
      ${App.aspectGrid([['事業', g.aspects.career], ['感情', g.aspects.love], ['財運', g.aspects.wealth], ['健康', g.aspects.health]])}
    </div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    container.appendChild(div);
    AI.attach(div.querySelector('.panel'), () =>
      `請以小六壬為以下課象做深度解讀。
所問之事：${question || '（未說明，做整體近期運勢解讀）'}
起課：農曆${lunar.monthName}${lunar.dayName}${hourName}時
落宮過程：月宮${GONG[mPos].name}、日宮${GONG[dPos].name}、時宮（結果）${g.name}
結果宮「${g.name}」：${g.level}，${g.text}
請結合三宮的演變（月→日→時代表事情的起因→經過→結果），針對所問之事給出具體解讀與建議。`);
  }

  App.register({
    id: 'xiaoliuren',
    icon: '🤞',
    title: '小六壬',
    desc: '諸葛掐指神算，月日時三宮起課，大安留連速喜赤口小吉空亡。',
    render(el) {
      el.innerHTML = `
        <div class="panel">
          <h3>起課</h3>
          <div class="field" style="margin-bottom:12px">
            <label>所問之事（可留空）</label>
            <input class="xl-q" placeholder="例：明天的會議順利嗎？" style="width:100%">
          </div>
          <button class="btn" id="xl-now">🤞 以此刻起課</button>
          <p class="muted" style="margin-top:10px">正月起大安順數至月，月上起初一數至日，日上起子時數至時，落宮即為所占之課。</p>
        </div>
        <div id="xl-result"></div>`;
      el.querySelector('#xl-now').addEventListener('click', () => {
        const resEl = el.querySelector('#xl-result');
        resEl.innerHTML = '';
        const now = new Date();
        const lunar = Astro.toLunar(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const hourIdx = Math.floor(((now.getHours() + 1) % 24) / 2) % 12;
        show(resEl, lunar, hourIdx, Ganzhi.ZHI[hourIdx], el.querySelector('.xl-q').value.trim());
      });
    }
  });
})();
