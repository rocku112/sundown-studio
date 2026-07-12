/* 暮卜先知 · 小六壬（掐指神算） */
(() => {
  const GONG = [
    {
      name: '大安', level: '大吉', wx: '木', star: '青龍',
      verse: '大安事事昌，求謀在東方，失物去不遠，宅舍保安康。',
      text: '身不動時，屬木青龍，凡事主安穩、靜中有福。此宮之吉不在爆發性的驚喜，而在「不動如山」的踏實感——你此刻所處的位置本身就是有利的，不需要另尋出路。謀事宜穩紮穩打，按部就班推進最能保住既有成果，過度求新求變反而會打破這份安穩。',
      aspects: {
        career: '職位穩固，按部就班可成，是適合深耕現有崗位而非跳槽轉職的時機。',
        love: '感情平穩長久，關係的重心在於陪伴的累積而非激情，靜待自然發展比催促更有效。',
        wealth: '正財平穩，靠穩定收入細水長流，不宜投機或大筆變動既有的理財配置。',
        health: '大致安康，肝膽（木對應之臟腑）宜留意保養，規律作息比任何補品都有效。'
      }
    },
    {
      name: '留連', level: '小凶', wx: '水', star: '玄武',
      verse: '留連事難成，求謀日未明，凡事只宜緩，去者未回程。',
      text: '人未歸時，屬水玄武，主拖延、糾纏、反覆。這一宮的核心是「時間還沒到」而非「事情不會成」——像水流繞路一樣，看似停滯其實仍在暗中推進，只是尚未到匯流成果的階段。此時最忌心急催促，欲速則不達，硬要在時機未熟時強求結果，反而容易把簡單的事拖得更複雜。',
      aspects: {
        career: '案子拖延反覆，決策方遲遲不表態，需要耐心周旋、多次跟進而非一次到位。',
        love: '曖昧不明、拖泥帶水，對方態度模糊多半是還沒想清楚，宜找對時機把話說清而非乾等。',
        wealth: '款項延遲，催討需時，這段期間宜備好耐心與備案，勿因焦急而做出不利的讓步。',
        health: '慢性纏綿之症，病程反覆是水氣停滯所致，宜耐心調養、按部就班治療，切忌半途而廢。'
      }
    },
    {
      name: '速喜', level: '大吉', wx: '火', star: '朱雀',
      verse: '速喜喜來臨，求財向南行，失物申未午，逢人路上尋。',
      text: '人即至時，屬火朱雀，主喜訊快至、好事臨門。這一宮的氣象是「快」——如火勢燃起般迅速見效，是六宮中最適合把握瞬間機會的一宮。把握時機、速戰速決最有利，若猶豫觀望，這股熱度退去後同樣的機會不會再重現，宜當機立斷。',
      aspects: {
        career: '好消息將至，面試投標皆有利，主動出擊、儘早回應會比拖延觀望更容易得到好結果。',
        love: '有機會急速升溫，主動出擊、直接表達心意，此刻的坦率比矜持更容易促成好事。',
        wealth: '偏財小喜，南方或與火相關的行業有財，機會來得快也可能去得快，宜見好就收。',
        health: '小恙速癒，身體修復力正旺，勿過度憂慮，放鬆心情反而有助於加速痊癒。'
      }
    },
    {
      name: '赤口', level: '凶', wx: '金', star: '白虎',
      verse: '赤口主口舌，官非切要防，失物急去尋，行人有驚慌。',
      text: '官事凶時，屬金白虎，主口舌是非、爭執官非。金氣主銳利、直接，容易在言語與合約上引發衝突，這一宮提醒你「話到嘴邊先緩三秒」——很多爭端不是事情本身有問題，而是溝通方式太過鋒利所致。慎言慎行，避免衝突與簽約糾紛，尤其書面文字更要再三確認。',
      aspects: {
        career: '慎防同事口角、合約爭議，重要文件簽署前務必逐字確認，會議發言宜三思後開口。',
        love: '易起爭執，忍一時風平浪靜，若已有摩擦，先各自冷靜再溝通，此刻硬碰硬只會愈演愈烈。',
        wealth: '財有損耗，防詐騙糾紛，任何要求你「立刻決定」的金錢往來都該提高警覺、多方查證。',
        health: '注意呼吸道與外傷、手術，金屬利器與交通工具需格外小心，戶外活動宜留意安全。'
      }
    },
    {
      name: '小吉', level: '吉', wx: '木', star: '六合',
      verse: '小吉最吉昌，路上好商量，陰人來報喜，失物在坤方。',
      text: '人來喜時，屬木六合，主和合、貴人相助。這一宮的吉不是靠自己單打獨鬥得來的，而是「人和」——身邊會有人主動伸出援手、居中牽線或帶來好消息，重點在於願意開口求助、願意合作，而非事事親力親為。談判合作皆宜，此刻的人際網絡正是你最大的資產。',
      aspects: {
        career: '合作順利，貴人提攜，適合主動尋求跨部門協作或請教前輩，單打獨鬥反而錯失助力。',
        love: '有人牽線作媒，和合之象，親友介紹或既有社交圈裡的緣分格外值得留意與珍惜。',
        wealth: '合夥得利，正財小進，與人合作分潤的機會比單獨行動更有機會開花結果。',
        health: '漸入佳境，無大礙，此刻與親友結伴運動或互相督促，效果會比獨自堅持更好。'
      }
    },
    {
      name: '空亡', level: '大凶', wx: '土', star: '勾陳',
      verse: '空亡事不祥，陰人多乖張，求財無利益，行人有災殃。',
      text: '音信稀時，屬土勾陳，主落空、虛耗、無果。土氣厚重卻缺乏生機，這一宮的「凶」不是災禍臨頭，而是「用力卻不見成效」——所投入的心力像掉進空洞裡，聽不到回音。所謀多成空，此時最需要的智慧是懂得停損，宜靜守待時、養精蓄銳，勿在同一件事上繼續加碼強求。',
      aspects: {
        career: '計畫恐落空，暫緩推進為宜，與其在原方案上硬撐，不如趁此空檔重新評估方向。',
        love: '有名無實，或對方心不在焉，此刻投入再多熱情也難有回應，宜先照顧好自己的情緒。',
        wealth: '破財虛耗，勿投資，任何看似穩賺的機會此時都該格外謹慎，寧可觀望也不要進場。',
        health: '留意隱疾，宜安排健康檢查，身體發出的微弱訊號此刻格外容易被忽略，不可輕忽。'
      }
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
    icon: Icons.svg('xiaoliuren'),
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
