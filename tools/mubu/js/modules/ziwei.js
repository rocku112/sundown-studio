/* 暮卜先知 · 紫微斗數 */
(() => {
  const PALACE_NAMES = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '交友', '官祿', '田宅', '福德', '父母'];

  // 十四主星簡介
  const STAR_DESC = {
    紫微: '帝座之星，尊貴領導、氣度恢弘，天生想掌握全局，但也需眾星拱照方能成事。',
    天機: '智慧謀略之星，反應快、點子多、善分析，宜動腦不宜勞力，忌想太多而多變。',
    太陽: '光明博愛之星，熱情付出、照耀他人，事業心強；日夜生人旺弱有別，防過勞。',
    武曲: '財星兼將星，剛毅果決、執行力強，理財有一套；性直少圓融，感情上偏孤剛。',
    天同: '福星，樂天知足、與世無爭，人緣佳享受生活；企圖心較弱，需防安逸怠惰。',
    廉貞: '次桃花兼囚星，聰明幹練、敢愛敢恨，公關手腕佳；情感與原則的拉扯是課題。',
    天府: '財庫之星，穩健保守、善於守成管理，一生衣食無虞；偏安逸，開創力較弱。',
    太陰: '田宅母星，溫柔細膩、重視家庭與內在感受，財富漸積；情緒起伏隨月盈虧。',
    貪狼: '第一桃花星，多才多藝、慾望企圖心強，交際應酬得心應手；貪多務得是雙面刃。',
    巨門: '暗星善辯，口才犀利、心思縝密，靠口才吃飯（教學、業務、法律）；防口舌是非。',
    天相: '印星宰相，忠誠謹慎、輔佐力強，重形象講公道；易受環境左右，需慎選跟隨對象。',
    天梁: '蔭星壽星，正直穩重、有長者風範，逢凶化吉；愛照顧人也愛說教。',
    七殺: '將星，衝勁十足、獨當一面，人生起伏大而精彩；宜攻不宜守，防孤軍深入。',
    破軍: '耗星先鋒，敢破敢立、不破不立，適合開創變革；人生多變動，防先破後成的陣痛。'
  };

  // 十四主星廟旺利陷表（子丑寅卯辰巳午未申酉戌亥；廟>旺>得>利>平>不>陷）
  const BRIGHT = {
    紫微: '平廟旺旺得旺廟廟旺旺得旺', 天機: '廟陷得旺利平廟陷得旺利平',
    太陽: '陷不旺廟旺旺旺得得陷不陷', 武曲: '旺廟得利廟平旺廟得利廟平',
    天同: '旺不利平平廟陷不旺平平廟', 廉貞: '平利廟平利陷平利廟平利陷',
    天府: '廟廟廟得廟得旺廟得旺廟得', 太陰: '廟廟旺陷陷陷不不利不旺廟',
    貪狼: '旺廟平利廟陷旺廟平利廟陷', 巨門: '旺不廟廟陷旺旺不廟廟陷旺',
    天相: '廟廟廟陷得得廟得廟陷得得', 天梁: '廟旺廟廟廟陷廟旺陷得廟陷',
    七殺: '旺廟廟旺廟平旺廟廟廟廟平', 破軍: '廟旺得陷旺平廟旺得陷旺平'
  };
  const brightOf = (star, zhi) => BRIGHT[star] ? BRIGHT[star][zhi] : '';

  // 命主（命宮支）／身主（生年支）
  const MINGZHU = ['貪狼', '巨門', '祿存', '文曲', '廉貞', '武曲', '破軍', '武曲', '廉貞', '文曲', '祿存', '巨門'];
  const SHENZHU = ['火星', '天相', '天梁', '天同', '文昌', '天機', '火星', '天相', '天梁', '天同', '文昌', '天機'];

  // 四化（年干 → [祿, 權, 科, 忌]）
  const SIHUA = {
    甲: ['廉貞', '破軍', '武曲', '太陽'], 乙: ['天機', '天梁', '紫微', '太陰'],
    丙: ['天同', '天機', '文昌', '廉貞'], 丁: ['太陰', '天同', '天機', '巨門'],
    戊: ['貪狼', '太陰', '右弼', '天機'], 己: ['武曲', '貪狼', '天梁', '文曲'],
    庚: ['太陽', '武曲', '太陰', '天同'], 辛: ['巨門', '太陽', '文曲', '文昌'],
    壬: ['天梁', '紫微', '左輔', '武曲'], 癸: ['破軍', '巨門', '太陰', '貪狼']
  };
  const HUA_NAME = ['祿', '權', '科', '忌'];
  // 四化總論：這股能量落在哪一宮，該宮就帶有這種傾向
  const HUA_MEANING = {
    祿: '主財氣與順遂，是本命最容易得到助力、心想事成的一股能量——福分與資源會自然往這裡流動，好好經營該宮位所代表的領域，往往事半功倍。',
    權: '主權力與掌控欲，是你天生渴望主導、也最能展現能力的一股能量——該宮位所代表的領域是你發揮領導力與企圖心的舞台，但也容易因太想掌控而生摩擦，宜留意分寸。',
    科: '主名聲與文墨貴人，是你容易受到肯定、發揮專業與才華的一股能量——該宮位所代表的領域利於進修、考試、建立口碑，貴人也常在此處出現。',
    忌: '主糾結與課題，是本命最需要修煉、容易卡關反覆的一股能量——該宮位所代表的領域常是心中放不下、反覆掛心之處，卻也往往是這一生真正要突破的功課所在。'
  };
  // 十二宮所主人生領域（簡述，用於逐宮簡析）
  const PALACE_DOMAIN = {
    命宮: '先天性格與人生格局', 兄弟: '手足情誼與合夥關係', 夫妻: '婚姻感情與另一半特質',
    子女: '子女緣分與創作能量', 財帛: '賺錢方式與理財態度', 疾厄: '體質健康與情緒底色',
    遷移: '外出運與人際際遇', 交友: '朋友部屬與人脈助力', 官祿: '事業成就與工作型態',
    田宅: '不動產與居家運勢', 福德: '精神享受與內在福分', 父母: '父母緣分與長輩貴人'
  };
  // 紫微流日：今日地支對應到命盤哪一宮，該宮領域今天較受牽動（簡化：以真實日柱地支比對本命宮位）
  const DAILY_PALACE_TIP = {
    命宮: '今天的言行特別能代表你，是展現自我、做重要決定的好時機。',
    兄弟: '適合聯繫手足、朋友或合夥人，人際互動是今天的重點。',
    夫妻: '感情與伴侶關係受到牽動，適合花時間陪伴另一半或好好溝通。',
    子女: '適合陪伴孩子或投入創作、企劃發想，靈感與親子緣分較旺。',
    財帛: '財運與金錢決策受矚目，適合檢視收支或談合作分潤。',
    疾厄: '身體與情緒的訊號今天特別明顯，宜多休息、留意飲食作息。',
    遷移: '適合外出、洽公或處理對外事務，機會多在外頭而非原地等待。',
    交友: '朋友、部屬與人脈今天特別重要，社交場合容易帶來助力。',
    官祿: '工作與事業運受牽動，適合推進計畫、爭取表現的好時機。',
    田宅: '居家、不動產與家庭事務適合今天處理，家運波動較明顯。',
    福德: '適合靜心、休閒或處理心靈層面的事，內在感受比外在成就更重要。',
    父母: '與父母長輩、上司的互動受到牽動，適合聯繫請益或盡孝道。'
  };
  function todayPalace(chart, dayZhiIdx) {
    const p = chart.palaces.find(p => p.zhi === dayZhiIdx);
    let mains = p.main, borrow = false;
    if (!mains.length) { mains = chart.stars[(p.zhi + 6) % 12].main; borrow = true; }
    const huaHere = mains.filter(s => chart.hua[s]).map(s => `${s}化${chart.hua[s]}`);
    return { palace: p, mains, borrow, huaHere };
  }

  // 祿存位置（年干）
  const LUCUN = { 甲: 2, 乙: 3, 丙: 5, 丁: 6, 戊: 5, 己: 6, 庚: 8, 辛: 9, 壬: 11, 癸: 0 };
  // 天魁天鉞（年干）
  const KUIYUE = { 甲: [1, 7], 乙: [0, 8], 丙: [11, 9], 丁: [11, 9], 戊: [1, 7], 己: [0, 8], 庚: [1, 7], 辛: [6, 2], 壬: [3, 5], 癸: [3, 5] };
  // 火星鈴星起宮（年支三合組）
  function huoLing(yearZhi) {
    if ([2, 6, 10].includes(yearZhi)) return [1, 3];   // 寅午戌：火起丑、鈴起卯
    if ([8, 0, 4].includes(yearZhi)) return [2, 10];   // 申子辰：火起寅、鈴起戌
    if ([5, 9, 1].includes(yearZhi)) return [3, 10];   // 巳酉丑：火起卯、鈴起戌
    return [9, 10];                                     // 亥卯未：火起酉、鈴起戌
  }

  function buildChart(lunar, hourIdx, yearPillar, gender) {
    // 中州派閏月法：閏月上半月（初一～十五）歸本月安星、下半月（十六起）歸下月安星
    let month = lunar.month;
    if (lunar.isLeap && lunar.day >= 16) month = month % 12 + 1;
    const day = lunar.day;
    const ys = yearPillar.ganIdx, yz = yearPillar.zhiIdx;

    // 命宮、身宮
    const mingIdx = ((2 + (month - 1) - hourIdx) % 12 + 12) % 12;
    const shenIdx = (2 + (month - 1) + hourIdx) % 12;

    // 宮干（五虎遁：寅宮起）
    const yinGan = (ys % 5) * 2 + 2;
    const palaceGan = (zhi) => Ganzhi.GAN[(yinGan + ((zhi - 2) % 12 + 12) % 12) % 10];

    // 五行局：命宮干支納音
    const mingGanIdx = Ganzhi.GAN.indexOf(palaceGan(mingIdx));
    const nayin = Ganzhi.pillar(Ganzhi.idx60(mingGanIdx, mingIdx)).nayin;
    const ju = nayin.includes('水') ? 2 : nayin.includes('木') ? 3 : nayin.includes('金') ? 4 : nayin.includes('土') ? 5 : 6;
    const juName = { 2: '水二局', 3: '木三局', 4: '金四局', 5: '土五局', 6: '火六局' }[ju];

    // 紫微落宮
    const q = Math.ceil(day / ju), r = q * ju - day;
    const pos = r % 2 === 0 ? q + r : q - r;
    const ziweiIdx = ((2 + pos - 1) % 12 + 12) % 12;
    const fuIdx = ((4 - ziweiIdx) % 12 + 12) % 12; // 天府（寅申軸對稱）

    // 佈星
    const stars = {}; // zhiIdx -> {main:[], minor:[], hua:{star:化}}
    for (let i = 0; i < 12; i++) stars[i] = { main: [], minor: [] };
    const putMain = (idx, name) => stars[((idx % 12) + 12) % 12].main.push(name);
    const putMinor = (idx, name) => stars[((idx % 12) + 12) % 12].minor.push(name);

    // 紫微系（逆行）
    putMain(ziweiIdx, '紫微');
    putMain(ziweiIdx - 1, '天機');
    putMain(ziweiIdx - 3, '太陽');
    putMain(ziweiIdx - 4, '武曲');
    putMain(ziweiIdx - 5, '天同');
    putMain(ziweiIdx - 8, '廉貞');
    // 天府系（順行）
    putMain(fuIdx, '天府');
    putMain(fuIdx + 1, '太陰');
    putMain(fuIdx + 2, '貪狼');
    putMain(fuIdx + 3, '巨門');
    putMain(fuIdx + 4, '天相');
    putMain(fuIdx + 5, '天梁');
    putMain(fuIdx + 6, '七殺');
    putMain(fuIdx + 10, '破軍');

    // 輔星
    putMinor(4 + (month - 1), '左輔');
    putMinor(10 - (month - 1), '右弼');
    putMinor(10 - hourIdx, '文昌');
    putMinor(4 + hourIdx, '文曲');
    const [kui, yue] = KUIYUE[Ganzhi.GAN[ys]];
    putMinor(kui, '天魁'); putMinor(yue, '天鉞');
    const lc = LUCUN[Ganzhi.GAN[ys]];
    putMinor(lc, '祿存'); putMinor(lc + 1, '擎羊'); putMinor(lc - 1, '陀羅');
    const [huoStart, lingStart] = huoLing(yz);
    putMinor(huoStart + hourIdx, '火星');
    putMinor(lingStart + hourIdx, '鈴星');
    putMinor(11 + hourIdx, '地劫');
    putMinor(11 - hourIdx, '地空');

    // 四化
    const hua = {};
    SIHUA[Ganzhi.GAN[ys]].forEach((star, i) => { hua[star] = HUA_NAME[i]; });

    // 十二宮（命宮起逆行佈宮名）
    const palaces = [];
    for (let i = 0; i < 12; i++) {
      const zhi = ((mingIdx - i) % 12 + 12) % 12;
      palaces.push({ zhi, name: PALACE_NAMES[i], gan: palaceGan(zhi), ...stars[zhi] });
    }

    // 大限：起限歲＝局數；陽男陰女順行（地支順），陰男陽女逆行
    const yangYear = Ganzhi.GAN_YINYANG[ys] === '陽';
    const daxianForward = (gender === 'M') === yangYear;
    for (const p of palaces) {
      const k = daxianForward
        ? ((p.zhi - mingIdx) % 12 + 12) % 12
        : ((mingIdx - p.zhi) % 12 + 12) % 12;
      p.daxian = [ju + k * 10, ju + k * 10 + 9];
    }

    // 流年：今年太歲所在宮＋流年四化（依流年天干飛入本命盤）
    const nowYear = new Date().getFullYear();
    const liunianZhi = ((nowYear - 4) % 12 + 12) % 12;
    const liunianGan = Ganzhi.GAN[((nowYear - 4) % 10 + 10) % 10];
    const liuHua = {};
    SIHUA[liunianGan].forEach((star, i) => { liuHua[star] = HUA_NAME[i]; });

    return {
      mingIdx, shenIdx, ziweiIdx, ju, juName, palaces, hua, stars,
      daxianForward, liunianZhi, nowYear, liunianGan, liuHua,
      mingzhu: MINGZHU[mingIdx], shenzhu: SHENZHU[yz]
    };
  }

  // ── 格局判定：依命宮＋三方四正（財帛、官祿、遷移）星曜組合斷通行格局 ──
  function ziweiGeju(c) {
    const M = c.mingIdx;
    const sf = [M, (M + 4) % 12, (M + 8) % 12, (M + 6) % 12]; // 命＋官祿＋財帛＋遷移
    const mainAt = z => c.stars[z].main;
    const minorAt = z => c.stars[z].minor;
    const sfMain = new Set(), sfMinor = new Set();
    sf.forEach(z => { mainAt(z).forEach(s => sfMain.add(s)); minorAt(z).forEach(s => sfMinor.add(s)); });
    let mingMain = mainAt(M);
    if (!mingMain.length) mingMain = mainAt((M + 6) % 12); // 命宮無主星借對宮
    const mm = new Set(mingMain);
    const has = (set, ...a) => a.every(s => set.has(s));
    const any = (set, ...a) => a.some(s => set.has(s));
    const zhiOf = star => { for (let z = 0; z < 12; z++) if (c.stars[z].main.includes(star) || c.stars[z].minor.includes(star)) return z; return -1; };
    const ge = [];

    // 紫府同宮（紫微天府同守命，見於寅申）
    if (has(mm, '紫微', '天府')) ge.push({ name: '紫府同宮', 論: '帝星與財庫同坐命宮，格局尊貴穩健，一生近貴、財官俱美、少憂衣食；惟性偏保守持重，開創之力需借煞星激發。' });
    // 君臣慶會（紫微得左輔右弼會拱）
    if (sfMain.has('紫微') && has(sfMinor, '左輔', '右弼')) ge.push({ name: '君臣慶會', 論: '紫微得左輔右弼會拱，如帝王得賢臣輔佐，領導有方、貴人相助，宜居要津、統御一方。' });
    // 府相朝垣（府相拱命，命宮本身可無正曜）
    if (has(sfMain, '天府', '天相') && !has(mm, '紫微', '天府')) ge.push({ name: '府相朝垣', 論: '天府天相於三方拱照命宮，逢凶化吉、衣食豐足、位居人上，一生較為安穩富裕。' });
    // 殺破狼（命坐七殺／破軍／貪狼）
    if (any(mm, '七殺', '破軍', '貪狼')) ge.push({ name: '殺破狼', 論: '命坐殺破狼星系，人生大開大闔、變動起伏而精彩，開創力與企圖心強、不安於現狀；宜掌一技之長或創業闖蕩，最忌因循守成。' });
    // 機月同梁（宜文職吏人）
    if (any(mm, '天機', '太陰', '天同', '天梁') && ['天機', '太陰', '天同', '天梁'].filter(s => sfMain.has(s)).length >= 3) ge.push({ name: '機月同梁', 論: '「機月同梁作吏人」——心思細膩、善於謀劃安排，宜公職、專業、幕僚或規律受薪之途，穩中求進，忌投機躁動。' });
    // 日月並明
    if (has(sfMain, '太陽', '太陰')) ge.push({ name: '日月並明', 論: '太陽太陰並會命宮，陰陽調和、聰明多才、富貴可期；然須日月得地不落陷，方顯其明。' });
    // 火貪／鈴貪（暴發格；限貪狼落命宮三方四正方論命格）
    const tanZhi = zhiOf('貪狼');
    if (tanZhi >= 0 && sf.includes(tanZhi) && c.stars[tanZhi].main.includes('貪狼')) {
      if (minorAt(tanZhi).includes('火星')) ge.push({ name: '火貪格', 論: '貪狼與火星同宮，橫發資財、暴起立成之格，善抓機遇、行動果決；亦防暴起暴落，宜見好即收。' });
      if (minorAt(tanZhi).includes('鈴星')) ge.push({ name: '鈴貪格', 論: '貪狼與鈴星同宮，同主橫發突起、名利驟得；性格剛烈果斷，須防成敗皆速。' });
    }
    // 極向離明（紫微居午）
    if (mm.has('紫微') && M === 6) ge.push({ name: '極向離明', 論: '紫微居午（離位）而無煞沖破，君臨天下之象，威望崇隆、位可至公卿。' });
    // 石中隱玉（巨門子午）
    if (mm.has('巨門') && (M === 0 || M === 6)) ge.push({ name: '石中隱玉', 論: '巨門坐子午，石中隱玉之格，才藏於內、先勞後逸、大器晚成，以口才專業服眾。' });
    // 三奇嘉會（生年祿權科三化齊會命三方）
    const huaIn = h => { const star = Object.keys(c.hua).find(s => c.hua[s] === h); if (!star) return false; const z = zhiOf(star); return z >= 0 && sf.includes(z); };
    if (['祿', '權', '科'].every(huaIn)) ge.push({ name: '三奇嘉會', 論: '生年化祿、化權、化科三奇齊會命宮三方，功名顯達、逢凶化吉，主大格局、名利雙收。' });

    return ge;
  }

  // 4x4 命盤版位：宮支 → grid 位置
  const GRID_POS = { 5: 1, 6: 2, 7: 3, 8: 4, 4: 5, 9: 8, 3: 9, 10: 12, 2: 13, 1: 14, 0: 15, 11: 16 };

  function render(el) {
    const bf = App.birthForm({ gender: true, time: true });
    el.innerHTML = `
      <div class="panel">
        <h3>輸入出生資料</h3>
        ${bf.html}
        <button class="btn" id="zw-go" style="margin-top:14px">${Icons.svg('ziwei')} 排 盤</button>
        <p class="muted" style="margin-top:8px">請填國曆生日，系統自動換算農曆。安星依中州派通行規則；閏月依中州派法——上半月（初一～十五）歸本月、下半月（十六起）歸下月安星。</p>
      </div>
      <div id="zw-result"></div>`;

    el.querySelector('#zw-go').addEventListener('click', () => {
      const b = bf.read(el);
      const resEl = el.querySelector('#zw-result');
      resEl.innerHTML = '';
      const lunar = Astro.toLunar(b.y, b.m, b.d);
      const yp = Ganzhi.yearPillar(b.y, b.m, b.d, b.hh, b.mi);
      const hourIdx = Math.floor(((b.hh + 1) % 24) / 2) % 12;
      const c = buildChart(lunar, hourIdx, yp, b.gender);
      const now = new Date();
      const todayDp = Ganzhi.dayPillar(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const tp = todayPalace(c, todayDp.zhiIdx);

      // 命盤格
      const cells = new Array(17).fill('');
      for (const p of c.palaces) {
        const isMing = p.zhi === c.mingIdx;
        const isShen = p.zhi === c.shenIdx;
        const isLiunian = p.zhi === c.liunianZhi;
        const liuMark = (s) => c.liuHua[s] ? `<span style="color:#4A76B8;font-size:11px">年${c.liuHua[s]}</span>` : '';
        const mains = p.main.map(s => `${s}<small style="color:var(--ink-faint)">${brightOf(s, p.zhi)}</small>${c.hua[s] ? `<span class="hua">化${c.hua[s]}</span>` : ''}${liuMark(s)}`).join(' ') || '<span class="muted">（借對宮）</span>';
        const minors = p.minor.map(s => `${s}${c.hua[s] ? `<span class="hua">化${c.hua[s]}</span>` : ''}${liuMark(s)}`).join(' ');
        cells[GRID_POS[p.zhi]] = `<div class="zw-palace${isMing ? ' ming' : ''}">
          <div><span class="pname">${p.name}${isShen ? '·身' : ''}</span><span class="pgz">${p.gan}${Ganzhi.ZHI[p.zhi]}</span></div>
          <div class="stars-main">${mains}</div>
          <div class="stars-min">${minors}</div>
          <div style="margin-top:auto;padding-top:3px;font-size:11px;color:var(--ink-faint)">
            大限 ${p.daxian[0]}-${p.daxian[1]}${isLiunian ? `　<b style="color:var(--cinnabar)">◉${c.nowYear}流年</b>` : ''}
          </div>
        </div>`;
      }
      let grid = '';
      for (let i = 1; i <= 16; i++) {
        if (i === 6) {
          grid += `<div class="zw-center">
            <div style="font-size:22px;color:var(--gold-bright);letter-spacing:.2em">紫微命盤</div>
            <div class="muted" style="margin-top:6px">農曆${lunar.lunarYear}年${lunar.monthName}${lunar.dayName}<br>${yp.name}年 ${Ganzhi.ZHI[hourIdx]}時 ${b.gender === 'M' ? '男' : '女'}命</div>
            <div style="margin-top:6px"><span class="tag gold">${c.juName}</span><span class="tag">紫微在${Ganzhi.ZHI[c.ziweiIdx]}</span></div>
            <div style="margin-top:4px"><span class="tag">命主：${c.mingzhu}</span><span class="tag">身主：${c.shenzhu}</span></div>
            <div class="muted" style="margin-top:4px;font-size:12px">大限${c.daxianForward ? '順' : '逆'}行 · ${c.ju}歲起</div>
            <div style="margin-top:4px;font-size:12px;color:#4A76B8">${c.nowYear}${c.liunianGan}年四化：${Object.entries(c.liuHua).map(([s, h]) => `${s}${h}`).join('、')}</div>
          </div>`;
          continue;
        }
        if (i === 7 || i === 10 || i === 11) continue; // 中央區已合併
        grid += cells[i] || '<div></div>';
      }

      // 命宮解讀
      const mingPalace = c.palaces[0];
      let mingStars = mingPalace.main;
      let borrowed = false;
      if (!mingStars.length) {
        const opp = c.stars[(c.mingIdx + 6) % 12];
        mingStars = opp.main;
        borrowed = true;
      }
      const desc = mingStars.map(s => `<h4>${s}${c.hua[s] ? `（化${c.hua[s]}）` : ''}坐命${borrowed ? '（借對宮）' : ''}</h4><p>${STAR_DESC[s] || ''}</p>`).join('');
      const huaList = Object.entries(c.hua).map(([s, h]) => `${s}化${h}`).join('、');

      // 命盤格局判定
      const geList = ziweiGeju(c);
      const geHTML = geList.length
        ? geList.map(g => `<div class="aspect" style="margin-top:8px"><b style="color:var(--gold-bright)">${g.name}</b><p style="margin-top:4px">${g.論}</p></div>`).join('')
        : '<p class="muted" style="margin-top:6px">命宮三方四正未構成通行明格，屬平常格局，宜以各宮主星廟旺與生年四化綜合論斷，未必不佳。</p>';

      // 十二宮簡析（命宮以外的11宮，逐宮列出主星與簡述）
      const otherPalacesHTML = c.palaces.filter(p => p.zhi !== c.mingIdx).map(p => {
        let mains = p.main, borrow = false;
        if (!mains.length) { mains = c.stars[(p.zhi + 6) % 12].main; borrow = true; }
        const body = mains.length
          ? mains.map(s => `${s}${c.hua[s] ? `<span class="hua">化${c.hua[s]}</span>` : ''}：${STAR_DESC[s] || ''}`).join('<br>')
          : '本宮無主星安坐，個性與運勢受對宮及三方四正影響較大，宜綜合全局判斷。';
        return `<div class="aspect" style="margin-top:8px">
          <b>${p.name}宮${borrow ? '（借對宮星曜）' : ''} · ${PALACE_DOMAIN[p.name]}</b>
          <p style="margin-top:4px">${body}</p>
        </div>`;
      }).join('');

      // 生年四化意涵：找出每個化星實際落在哪一宮
      const huaHTML = Object.entries(c.hua).map(([star, h]) => {
        const palace = c.palaces.find(p => p.main.includes(star) || p.minor.includes(star));
        const palaceName = palace ? palace.name : null;
        const palaceLabel = palaceName ? (palaceName.endsWith('宮') ? palaceName : palaceName + '宮') : null;
        return `<p style="margin-top:6px"><b style="color:var(--gold-bright)">${star}化${h}</b>${palaceLabel ? `，坐${palaceLabel}（${PALACE_DOMAIN[palaceName]}）` : ''}——${HUA_MEANING[h]}</p>`;
      }).join('');

      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <div class="ziwei-grid">${grid}</div>
        <div style="text-align:center">
          <span class="tag gold">命宮在${Ganzhi.ZHI[c.mingIdx]}</span>
          <span class="tag">身宮在${Ganzhi.ZHI[c.shenIdx]}</span>
          <span class="tag">${yp.name}年生 四化：${huaList}</span>
        </div>
        <hr class="divider">
        ${desc}
        <hr class="divider">
        <h4>命盤格局</h4>
        <p class="muted" style="margin-top:-2px">依命宮與三方四正（財帛、官祿、遷移）星曜組合判定通行格局；格局定人生大方向，仍須參酌廟旺、生年四化與煞星方能定高下。</p>
        ${geHTML}
        <hr class="divider">
        <h4>生年四化意涵</h4>
        <p class="muted" style="margin-top:-2px">四化是本命盤最關鍵的動態訊息，代表你這一生「錢財、權力、名聲、課題」四股能量各自流向哪個宮位。</p>
        ${huaHTML}
        <hr class="divider">
        <h4>十二宮簡析</h4>
        <p class="muted" style="margin-top:-2px">命宮以外的十一宮逐一簡述，完整交叉解讀（如夫妻宮看流年、事業與財帛互涉）建議用 AI 深度解讀。</p>
        ${otherPalacesHTML}
        <hr class="divider">
        <h4>${Icons.svg('almanac')} 今日紫微流日</h4>
        <p class="muted" style="margin-top:-2px">${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}（${todayDp.name}日）行運至你命盤的<b style="color:var(--gold-bright)">${tp.palace.name}宮${tp.borrow ? '（借對宮星曜）' : ''}</b>——${PALACE_DOMAIN[tp.palace.name]}。</p>
        <div class="aspect">
          ${tp.mains.length ? `<b>坐星：${tp.mains.join('、')}</b>` : '<b class="muted">本宮無主星，受對宮牽動</b>'}
          ${tp.huaHere.length ? `<span class="tag gold" style="margin-left:6px">命中生年${tp.huaHere.join('、')}</span>` : ''}
          <p style="margin-top:4px">${DAILY_PALACE_TIP[tp.palace.name]}${tp.huaHere.length ? `今天恰好也是本命「${tp.huaHere.join('、')}」的落宮，能量格外集中，${tp.huaHere.some(h => h.includes('忌')) ? '若感覺卡關反覆是正常的，宜多留意、不硬拚。' : '把握這股順勢而為的助力。'}` : ''}</p>
        </div>
        <p class="muted" style="margin-top:12px">※ 內建解讀為各宮主星簡述；完整十二宮互涉、格局與大限流年，請使用 AI 深度解讀。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請為以下紫微斗數命盤做深度解讀。
${b.gender === 'M' ? '男' : '女'}命，農曆${lunar.lunarYear}年${lunar.monthName}${lunar.dayName}${Ganzhi.ZHI[hourIdx]}時生，${yp.name}年，${c.juName}。
命宮在${Ganzhi.ZHI[c.mingIdx]}，身宮在${Ganzhi.ZHI[c.shenIdx]}。
命主：${c.mingzhu}，身主：${c.shenzhu}。大限${c.daxianForward ? '順' : '逆'}行，${c.ju}歲起限。
十二宮佈星（含廟旺與大限歲數）：
${c.palaces.map(p => `${p.name}（${p.gan}${Ganzhi.ZHI[p.zhi]}，大限${p.daxian[0]}-${p.daxian[1]}歲）：主星[${p.main.map(s => s + (brightOf(s, p.zhi) || '')).join('、') || '無，借對宮'}] 輔星[${p.minor.join('、') || '無'}]`).join('\n')}
生年四化：${huaList}
本站已判命盤格局：${geList.map(g => g.name).join('、') || '無明顯正格（平常格局）'}。
${c.nowYear}年流年命宮在${Ganzhi.ZHI[c.liunianZhi]}；流年（${c.liunianGan}年）四化飛星：${Object.entries(c.liuHua).map(([s, h]) => `${s}化${h}（落${(c.palaces.find(p => p.main.includes(s) || p.minor.includes(s)) || {}).name || '－'}宮）`).join('、')}。
今日（${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}，${todayDp.name}日）流日行運至${tp.palace.name}宮${tp.huaHere.length ? `（命中生年${tp.huaHere.join('、')}）` : ''}。
請分析：1) 命身宮與整體格局（印證上列本站已判格局是否成立、有無破格，並注意主星廟旺利陷的強弱） 2) 性格特質 3) 事業官祿 4) 財帛 5) 感情婚姻（夫妻宮）6) 目前所行大限與${c.nowYear}流年運勢——特別解讀流年四化飛入各宮的意義（年忌所落宮位是今年課題） 7) 需注意的宮位與化忌影響 8) 簡短點評今日流日行運至${tp.palace.name}宮對今天的提示，並給出人生建議。`);
    });
  }

  // 供三合一綜合命盤共用
  window.ZiweiEngine = { buildChart, ziweiGeju, STAR_DESC, PALACE_NAMES };

  App.register({
    id: 'ziwei',
    icon: Icons.svg('ziwei'),
    title: '紫微斗數',
    desc: '安命身宮、十四主星、輔煞諸星、生年四化、今日流日行運，完整十二宮命盤。',
    render
  });
})();
