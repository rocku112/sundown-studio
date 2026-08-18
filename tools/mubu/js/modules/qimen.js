/* 暮卜先知 · 奇門遁甲（時家 · 轉盤 · 拆補法） */
(() => {
  // 節氣局數表（陽遁：冬至→芒種；陰遁：夏至→大雪），[上元, 中元, 下元]
  const JU_TABLE = {
    冬至: [1, 7, 4], 小寒: [2, 8, 5], 大寒: [3, 9, 6],
    立春: [8, 5, 2], 雨水: [9, 6, 3], 驚蟄: [1, 7, 4],
    春分: [3, 9, 6], 清明: [4, 1, 7], 穀雨: [5, 2, 8],
    立夏: [4, 1, 7], 小滿: [5, 2, 8], 芒種: [6, 3, 9],
    夏至: [9, 3, 6], 小暑: [8, 2, 5], 大暑: [7, 1, 4],
    立秋: [2, 5, 8], 處暑: [1, 4, 7], 白露: [9, 3, 6],
    秋分: [7, 1, 4], 寒露: [6, 9, 3], 霜降: [5, 8, 2],
    立冬: [6, 9, 3], 小雪: [5, 8, 2], 大雪: [4, 7, 1]
  };
  const YANG_TERMS = new Set(['冬至', '小寒', '大寒', '立春', '雨水', '驚蟄', '春分', '清明', '穀雨', '立夏', '小滿', '芒種']);

  // 洛書九宮：1坎北 2坤西南 3震東 4巽東南 5中 6乾西北 7兌西 8艮東北 9離南
  const GONG_INFO = {
    1: { name: '坎一宮', dir: '北' }, 2: { name: '坤二宮', dir: '西南' }, 3: { name: '震三宮', dir: '東' },
    4: { name: '巽四宮', dir: '東南' }, 5: { name: '中五宮', dir: '中' }, 6: { name: '乾六宮', dir: '西北' },
    7: { name: '兌七宮', dir: '西' }, 8: { name: '艮八宮', dir: '東北' }, 9: { name: '離九宮', dir: '南' }
  };
  const RING = [1, 8, 3, 4, 9, 2, 7, 6]; // 轉盤環序（順時針：坎艮震巽離坤兌乾）
  const YIQI = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙']; // 六儀三奇佈盤序
  const STARS_ORIG = { 1: '天蓬', 8: '天任', 3: '天沖', 4: '天輔', 9: '天英', 2: '天芮', 7: '天柱', 6: '天心', 5: '天禽' };
  const DOORS_ORIG = { 1: '休門', 8: '生門', 3: '傷門', 4: '杜門', 9: '景門', 2: '死門', 7: '驚門', 6: '開門' };
  const GODS = ['值符', '螣蛇', '太陰', '六合', '白虎', '玄武', '九地', '九天'];
  // 九星意涵（天盤星）
  const STAR_INFO = {
    天蓬: '主智謀、盜賊、暗昧，五行屬水，利計謀策劃、暗中佈局，不利公開張揚之事。',
    天任: '主厚重、包容、醫藥，五行屬土，利養生治病、穩固根基，是九星中性情最忠厚老實的一顆。',
    天沖: '主衝動、突擊、驚動，五行屬木，利先發制人、快速行動，但也容易因躁進而壞事，宜謀定後動。',
    天輔: '主文教、輔助、學問，五行屬木，利讀書考試、輔佐他人、文書往來，是九星中利文職的吉星。',
    天英: '主文明、光彩、急躁，五行屬火，利名聲宣傳、才華展現，惟性急躁，須防虛華不實、後繼無力。',
    天芮: '主疾病、汙穢、陰晦，五行屬土，九星中的凶星之一，宜靜養防病、低調行事，不利開創新局。',
    天柱: '主破壞、口舌、刑傷，五行屬金，九星中的凶星之一，宜防爭訟是非，不利簽約合作等需要和氣之事。',
    天心: '主醫藥、貴人、清靜，五行屬金，利求醫問藥、精密技術、尋求貴人相助，是九星中的吉星。',
    天禽: '主中央、統御、調和，五行屬土，居中宮統領八方，利統籌調度、居中協調各方勢力。'
  };
  // 八神意涵
  const GOD_INFO = {
    值符: '主貴人、吉慶、統領，居於值符星所落之宮，代表整局的核心氣運與主導力量所在，此宮之事最受本局氣機眷顧。',
    螣蛇: '主虛驚、怪異、纏繞，性主變化多端、疑慮不安，遇事宜防虛驚一場、疑心生暗鬼，實際情況常不如想像中嚴重。',
    太陰: '主陰私、隱蔽、女性，利於暗中謀劃、低調行事，此方位或此事宜秘密進行，不宜公開張揚。',
    六合: '主和合、婚姻、中介，利於合作、談判、婚嫁牽線，是八神中最溫和吉祥的一位，宜藉此推動人際協商。',
    白虎: '主刑傷、道路、突發，性剛烈易有意外衝突，此方位出行宜留意交通安全，行事宜防肢體傷害與衝動誤事。',
    玄武: '主盜賊、失竊、欺詐，宜防財物遺失、小人暗算，此方位或此事的簽約合作宜多加防範、留意條款細節。',
    九地: '主藏匿、穩固、退守，利守成防禦、深藏不露，此方位宜靜不宜動，適合韜光養晦而非主動出擊。',
    九天: '主高遠、發展、開創，利於遠行、擴張、公開宣傳，是八神中最利開創進取者，此方位宜大膽發展。'
  };
  const DOOR_LUCK = { 開門: '大吉', 休門: '吉', 生門: '大吉', 傷門: '凶', 杜門: '中平', 景門: '中吉', 死門: '大凶', 驚門: '凶' };
  const DOOR_USE = {
    開門: '利開業、求職、見貴人、拓展事業', 休門: '利休息、和解、求財、婚姻嫁娶',
    生門: '利求財、投資、置產、養生治病', 傷門: '利捕獵、討債、競賽，餘事不宜',
    杜門: '利隱匿、避災、技術研究，不利張揚', 景門: '利文書、考試、宣傳、面試',
    死門: '諸事不宜，僅利弔喪、狩獵', 驚門: '利訴訟、驚敵，防口舌官非'
  };
  // 旬首 → 遁干
  const XUNSHOU_YI = { 0: '戊', 50: '己', 40: '庚', 30: '辛', 20: '壬', 10: '癸' };

  // ── 格局判定：十干剋應（天盤干加地盤干）＋伏吟反吟＋五不遇時＋門迫 ──
  // 十干剋應之經典六格（天盤干 + 地盤干）
  const GEJU_10G = {
    '丙戊': { name: '青龍返首', good: true, why: '天盤丙加地盤戊為「青龍返首」——大吉之格，主謀事有成、貴人相助、轉禍為福，是奇門第一等吉格。' },
    '戊丙': { name: '飛鳥跌穴', good: true, why: '天盤戊加地盤丙為「飛鳥跌穴」——大吉之格，主機緣天成、意外之喜，所謀順遂如鳥投林。' },
    '乙辛': { name: '青龍逃走', good: false, why: '天盤乙加地盤辛為「青龍逃走」——主人事逃亡、事物失散、下屬背離，所求之事多有走失落空之象。' },
    '辛乙': { name: '白虎猖狂', good: false, why: '天盤辛加地盤乙為「白虎猖狂」——主凶災傷損、道路阻隔、人多爭鬥，出行謀事宜避此方。' },
    '丁癸': { name: '螣蛇夭矯', good: false, why: '天盤丁加地盤癸為「螣蛇夭矯」——主文書失誤、驚恐怪異、事多虛詐反覆，宜謹慎驗證。' },
    '癸丁': { name: '朱雀投江', good: false, why: '天盤癸加地盤丁為「朱雀投江」——主文書口舌遺失、消息中斷、訴訟不利，慎防信件契約出錯。' }
  };
  // 門五行（用於門迫：門剋宮為迫）
  const DOOR_WX = { 休門: '水', 生門: '土', 傷門: '木', 杜門: '木', 景門: '火', 死門: '土', 驚門: '金', 開門: '金' };
  const GONG_WX = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
  const WX_KE_Q = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  const OPP_GONG = { 1: 9, 9: 1, 3: 7, 7: 3, 2: 8, 8: 2, 4: 6, 6: 4 };

  function qimenGeju(q) {
    const out = [];
    // 1. 十干剋應（逐宮檢天盤干加地盤干）
    for (const g of [1, 2, 3, 4, 6, 7, 8, 9]) {
      const s = q.sky[g] && q.sky[g].yi, e = q.earth[g]; // 天盤干在 sky[g].yi
      if (!s || !e) continue;
      const hit = GEJU_10G[s + e];
      if (hit) out.push({ ...hit, gong: g, detail: `${GONG_INFO[g].name}（${GONG_INFO[g].dir}方）天盤${s}加地盤${e}` });
    }
    // 2. 伏吟／反吟（以值符星落宮對其本宮論）
    const fuOrig = +Object.keys(STARS_ORIG).find(k => STARS_ORIG[k] === q.fuStar);
    if (fuOrig && q.targetGong === fuOrig) out.push({ name: '星伏吟', good: false, gong: q.targetGong, detail: `值符${q.fuStar}回落本宮${GONG_INFO[q.targetGong].name}`, why: '伏吟主靜止不動、事情停滯難有進展，宜守舊安常，凡事拖延反覆，不利求動求變。' });
    else if (fuOrig && OPP_GONG[fuOrig] === q.targetGong) out.push({ name: '星反吟', good: false, gong: q.targetGong, detail: `值符${q.fuStar}落對宮${GONG_INFO[q.targetGong].name}`, why: '反吟主反覆顛倒、事與願違，計畫易生變卦、去而復返，宜再三斟酌不宜急進。' });
    // 3. 五不遇時：時干剋日干且同陰陽（時干為日干之七殺）
    const gi = (n) => n % 10;
    const dG = gi(q.dp.n), hG = gi(q.hp.n);
    const GW = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
    if (WX_KE_Q[GW[hG]] === GW[dG] && hG % 2 === dG % 2) {
      out.push({ name: '五不遇時', good: false, gong: null, detail: `時干${Ganzhi.GAN[hG]}剋日干${Ganzhi.GAN[dG]}（同陰陽）`, why: '五不遇時為時家凶格——此時辰百事不宜、謀為多阻，縱有吉門吉星亦減力，宜改擇他時再行事。' });
    }
    // 4. 門迫：門五行剋所落宮五行（屬小格，逐宮合併為一條以免淹沒主格）
    const po = [];
    for (const g of [1, 2, 3, 4, 6, 7, 8, 9]) {
      const dr = q.doors[g];
      if (dr && WX_KE_Q[DOOR_WX[dr]] === GONG_WX[g]) po.push(`${dr}落${GONG_INFO[g].dir}方（${GONG_INFO[g].name}）`);
    }
    if (po.length) out.push({ name: '門迫', good: false, gong: null, minor: true, detail: po.join('、'), why: '門迫指八門五行剋所落宮位五行，主此方用事急躁強求、雖能成亦費力有損，宜緩圖不宜硬取。（門迫為小格，每局多有數處，僅作方位取捨參考，不掩主格吉凶。）' });
    return out;
  }

  function build(y, m, d, hh, mi) {
    const jd = Astro.toJD(y, m, d, hh, mi);
    // 找目前節氣
    const terms = [];
    for (const yy of [y - 1, y, y + 1]) {
      Astro.solarTermsOfYear(yy).forEach(t => terms.push(t));
    }
    terms.sort((a, b) => a.jd - b.jd);
    let cur = terms[0];
    for (const t of terms) { if (t.jd <= jd) cur = t; else break; }
    const yang = YANG_TERMS.has(cur.name);

    // 三元（拆補：日干支 甲子起上元，每五日一元）
    const dp = Ganzhi.dayPillar(y, m, d);
    const yuan = Math.floor((dp.n % 15) / 5); // 0上 1中 2下
    const ju = JU_TABLE[cur.name][yuan];

    // 時柱與旬首
    const hp = Ganzhi.hourPillar(y, m, d, hh, mi);
    const xunshouN = hp.n - (hp.n % 10);
    const xunYi = XUNSHOU_YI[xunshouN];
    const hourOffset = hp.n % 10; // 距旬首時辰數

    // 地盤佈儀（陽順陰逆飛九宮）
    const earth = {}; // gong -> 儀
    for (let i = 0; i < 9; i++) {
      const g = yang ? ((ju - 1 + i) % 9) + 1 : ((ju - 1 - i) % 9 + 9) % 9 + 1;
      earth[g] = YIQI[i];
    }
    const gongOfYi = {};
    for (const [g, yi] of Object.entries(earth)) gongOfYi[yi] = +g;

    // 值符星、值使門（旬首儀所在地盤宮）
    let fuGong = gongOfYi[xunYi];
    const fuStar = STARS_ORIG[fuGong];       // 值符星（中宮為天禽）
    const shiDoor = DOORS_ORIG[fuGong === 5 ? 2 : fuGong]; // 值使門（中宮寄坤取死門）

    // 時干之儀（甲時用旬首儀）
    const shiGanYi = hp.gan === '甲' ? xunYi : hp.gan;
    let targetGong = gongOfYi[shiGanYi];
    if (targetGong === 5) targetGong = 2; // 中宮寄坤

    // 天盤星（轉盤）：值符星轉到時干宮，其餘星依環序跟隨
    const fuRingGong = fuGong === 5 ? 2 : fuGong;
    const fuRingIdx = RING.indexOf(fuRingGong);
    const targetRingIdx = RING.indexOf(targetGong);
    const sky = {}; // gong -> {star, yi}
    for (let i = 0; i < 8; i++) {
      const srcGong = RING[(fuRingIdx + i) % 8];
      const dstGong = RING[(targetRingIdx + i) % 8];
      let star = STARS_ORIG[srcGong];
      if (srcGong === 2) star = '天芮禽'; // 天禽寄芮（若值符非中宮起）
      sky[dstGong] = { star: fuGong === 5 && i === 0 ? '天禽' : star, yi: earth[srcGong] };
    }

    // 值使門落宮：從旬首宮起，隨時辰飛宮（陽順陰逆，洛書數）
    let doorGong = fuGong;
    for (let i = 0; i < hourOffset; i++) {
      doorGong = yang ? (doorGong % 9) + 1 : ((doorGong - 2 + 9) % 9) + 1;
    }
    if (doorGong === 5) doorGong = 2;
    // 八門轉盤：值使門置於落宮，餘門依環序
    const shiDoorOrigGong = Object.entries(DOORS_ORIG).find(([g, dr]) => dr === shiDoor)[0];
    const doorRingIdx = RING.indexOf(+shiDoorOrigGong);
    const doorTargetIdx = RING.indexOf(doorGong);
    const doors = {};
    for (let i = 0; i < 8; i++) {
      const srcGong = RING[(doorRingIdx + i) % 8];
      const dstGong = RING[(doorTargetIdx + i) % 8];
      doors[dstGong] = DOORS_ORIG[srcGong];
    }

    // 八神：值符神在值符星落宮（＝時干宮），陽順陰逆佈環
    const gods = {};
    for (let i = 0; i < 8; i++) {
      const dstGong = yang ? RING[(targetRingIdx + i) % 8] : RING[((targetRingIdx - i) % 8 + 8) % 8];
      gods[dstGong] = GODS[i];
    }

    return { cur, yang, ju, yuan, dp, hp, xunYi, fuStar, shiDoor, fuGong, targetGong, earth, sky, doors, gods };
  }

  // 3x3 顯示（巽4離9坤2 / 震3中5兌7 / 艮8坎1乾6）
  const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6];

  function render(el) {
    const now = new Date();
    el.innerHTML = `
      <div class="panel">
        <h3>起局</h3>
        <div class="field" style="margin-bottom:12px">
          <label>所問之事（可留空）</label>
          <input class="qm-q" placeholder="例：這筆生意往哪個方向談有利？" style="width:100%">
        </div>
        <button class="btn" id="qm-now">${Icons.svg('qimen')} 以此刻起局</button>
        <p class="muted" style="margin-top:10px">時家奇門，轉盤法，拆補三元。冬至後陽遁、夏至後陰遁，依節氣定局。</p>
      </div>
      <div id="qm-result"></div>`;

    el.querySelector('#qm-now').addEventListener('click', () => {
      const resEl = el.querySelector('#qm-result');
      resEl.innerHTML = '';
      const n = new Date();
      const q = build(n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes());
      const question = el.querySelector('.qm-q').value.trim();

      const cellsHTML = GRID.map(g => {
        if (g === 5) return `<div class="qm-cell"><div class="gong">中五宮</div><div class="gz">${q.earth[5] || ''}</div><div class="muted" style="font-size:11px">寄坤二宮</div><div></div></div>`;
        const isFu = g === q.targetGong;
        return `<div class="qm-cell${isFu ? ' zhifu' : ''}">
          <div class="god">${q.gods[g] || ''}</div>
          <div class="star">${q.sky[g] ? q.sky[g].star : ''} <span class="gz">${q.sky[g] ? q.sky[g].yi : ''}</span></div>
          <div class="door">${q.doors[g] || ''} <span class="gz">${q.earth[g] || ''}</span></div>
          <div class="gong">${GONG_INFO[g].name} · ${GONG_INFO[g].dir}</div>
        </div>`;
      }).join('');

      // 吉方建議
      const geju = qimenGeju(q);
      const goodDirs = Object.entries(q.doors)
        .filter(([g, d]) => ['開門', '休門', '生門'].includes(d))
        .map(([g, d]) => `${GONG_INFO[g].dir}方（${d}，${DOOR_USE[d]}）`);

      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <div style="text-align:center" class="muted">
          ${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}
          · ${q.cur.name}${['上', '中', '下'][q.yuan]}元 · <b style="color:var(--gold-bright)">${q.yang ? '陽' : '陰'}遁${q.ju}局</b>
          · ${q.dp.name}日 ${q.hp.name}時（旬首遁${q.xunYi}）
        </div>
        <div style="text-align:center;margin-top:6px">
          <span class="tag gold">值符：${q.fuStar}</span>
          <span class="tag gold">值使：${q.shiDoor}（${DOOR_LUCK[q.shiDoor]}）</span>
        </div>
        <div class="qimen-grid" style="margin-left:auto;margin-right:auto">${cellsHTML}</div>
        <p class="muted" style="text-align:center">上為南（離九宮）、下為北（坎一宮）；金框為值符所在宮。</p>
        <hr class="divider">
        <h4>此時吉方</h4>
        ${goodDirs.length ? `<p>${goodDirs.join('<br>')}</p>` : '<p>此時三吉門不顯，宜靜不宜動。</p>'}
        <h4>值符星・值使門主事</h4>
        <p>${q.fuStar}值符：${STAR_INFO[q.fuStar] || ''}</p>
        <p style="margin-top:6px">${q.shiDoor}值使：${DOOR_USE[q.shiDoor]}。（${DOOR_LUCK[q.shiDoor]}）</p>
        <h4>八神論斷</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
          ${GRID.filter(g => g !== 5).map(g => `<div class="aspect">
            <b>${GONG_INFO[g].dir}方（${q.gods[g] || ''}）</b>
            <p class="muted" style="margin-top:2px;font-size:12.5px">${GOD_INFO[q.gods[g]] || ''}</p>
          </div>`).join('')}
        </div>
        <h4>格局判定（十干剋應・伏吟反吟・時格）</h4>
        <p class="muted" style="margin-top:-2px">奇門斷局的核心語言：天盤干加地盤干成「十干剋應」之格，值符星落宮定伏吟反吟，另查五不遇時與門迫。格局定此時空的整體氣機吉凶。</p>
        ${geju.length ? geju.map(x => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${x.good ? 'var(--gold-mid)' : 'var(--cinnabar)'}">
          <b style="color:${x.good ? 'var(--gold-bright)' : 'var(--cinnabar)'}">${x.name}</b>　<span class="muted">${x.detail}</span>
          <p style="margin-top:3px">${x.why}</p></div>`).join('')
          : '<p class="muted" style="margin-top:6px">此局未見經典十干剋應之格，亦無伏吟反吟與五不遇時——氣機平和無特殊偏向，宜依吉門方位與八神意涵論之。</p>'}
        <p class="muted" style="margin-top:10px">※ 十干剋應取經典六格（青龍返首／飛鳥跌穴／青龍逃走／白虎猖狂／螣蛇夭矯／朱雀投江）；伏吟反吟以值符星落宮對其本宮論；五不遇時為時干剋日干且同陰陽；門迫為門五行剋宮五行。更細的十干剋應全表與應期斷局請用 AI 解讀。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請為以下奇門遁甲時盤做深度斷局。
所問之事：${question || '（未說明，請就此時空整體氣機解讀）'}
起局時間：${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()} ${n.getHours()}時，${q.cur.name}${['上', '中', '下'][q.yuan]}元，${q.yang ? '陽' : '陰'}遁${q.ju}局（轉盤拆補）
四柱：${Ganzhi.yearPillar(n.getFullYear(), n.getMonth() + 1, n.getDate()).name}年 ${Ganzhi.monthPillar(n.getFullYear(), n.getMonth() + 1, n.getDate()).name}月 ${q.dp.name}日 ${q.hp.name}時，旬首遁${q.xunYi}
值符${q.fuStar}落${GONG_INFO[q.targetGong].name}（${STAR_INFO[q.fuStar] || ''}），值使${q.shiDoor}（${DOOR_USE[q.shiDoor]}）
九宮盤面（宮：八神/天盤星+天盤干/八門+地盤干）：
${GRID.filter(g => g !== 5).map(g => `${GONG_INFO[g].name}（${GONG_INFO[g].dir}）：${q.gods[g] || ''}／${q.sky[g] ? q.sky[g].star + q.sky[g].yi : ''}／${q.doors[g] || ''}＋${q.earth[g] || ''}`).join('\n')}
中五宮地盤：${q.earth[5] || ''}（寄坤二）
本站已判格局：${geju.length ? geju.map(x => `${x.name}（${x.detail}）`).join('；') : '未見經典十干剋應之格，亦無伏吟反吟與五不遇時'}
請分析：1) 值符值使所示的事體與趨勢 2) 用神落宮吉凶（依所問之事取用神）3) 印證並延伸上列格局判定，補上其餘十干剋應（天地盤干組合）之吉凶 4) 若逢伏吟反吟或五不遇時，說明對此事的實際影響與化解之道 5) 具體行動建議與有利方位、時機。`);
    });
  }

  App.register({
    id: 'qimen',
    icon: Icons.svg('qimen'),
    title: '奇門遁甲',
    desc: '時家轉盤奇門，九星八門八神，值符值使，趨吉避凶問方位。',
    render
  });
})();
