/* 暮卜先知 · 西洋占星（Placidus 宮位制＋SVG 星盤） */
(() => {
  const RAD = Math.PI / 180;
  const SIGNS = [
    { name: '牡羊座', sym: '♈', elem: '火', mode: '本位', trait: '衝勁十足、直率勇敢，行動先於思考，是天生的開路先鋒。' },
    { name: '金牛座', sym: '♉', elem: '土', mode: '固定', trait: '穩健務實、重視感官與安全感，慢熱但持久，對美食美物有品味。' },
    { name: '雙子座', sym: '♊', elem: '風', mode: '變動', trait: '好奇多變、溝通高手，資訊蒐集力一流，興趣廣泛但需防三分鐘熱度。' },
    { name: '巨蟹座', sym: '♋', elem: '水', mode: '本位', trait: '溫暖念舊、保護慾強，情感豐沛以家為重，情緒如潮汐起落。' },
    { name: '獅子座', sym: '♌', elem: '火', mode: '固定', trait: '自信大器、天生舞台魂，慷慨重義氣，需要掌聲也給得起溫暖。' },
    { name: '處女座', sym: '♍', elem: '土', mode: '變動', trait: '細膩嚴謹、追求完美，服務精神與分析力兼具，對自己最嚴格。' },
    { name: '天秤座', sym: '♎', elem: '風', mode: '本位', trait: '優雅圓融、重視和諧與公平，天生外交官，選擇困難是日常。' },
    { name: '天蠍座', sym: '♏', elem: '水', mode: '固定', trait: '深沉專注、洞察力驚人，愛恨分明，認定了就全力以赴。' },
    { name: '射手座', sym: '♐', elem: '火', mode: '變動', trait: '樂觀自由、熱愛探索遠方與真理，直言不諱，靈魂裝著整片草原。' },
    { name: '摩羯座', sym: '♑', elem: '土', mode: '本位', trait: '自律堅毅、目標導向，越挫越勇的長跑者，成就是最好的語言。' },
    { name: '水瓶座', sym: '♒', elem: '風', mode: '固定', trait: '獨立前衛、思想跳脫框架，博愛卻疏離，走在時代前面半步。' },
    { name: '雙魚座', sym: '♓', elem: '水', mode: '變動', trait: '浪漫感性、同理心滿溢，想像力是天賦，界線感是課題。' }
  ];
  const MOON_TRAIT = [
    '情緒來得快去得也快，需要立即行動或發洩才能安定下來，安全感來自能自主掌控局面而非依賴他人。',
    '情緒穩定緩慢、一旦受觸動便難以轉念，安全感來自穩定的物質基礎與熟悉的日常節奏，情感表達偏向沉默而實際的付出。',
    '情緒容易被新鮮資訊牽動，透過談話與交流來梳理感受，安全感來自暢通的溝通管道與不被侷限的自由。',
    '情緒細膩敏感、容易共感他人，安全感來自親密家人與熟悉的窩，情感表達直接濃烈，容易隨環境陰晴起伏。',
    '情緒需要被看見與讚賞才能真正安放，安全感來自他人的肯定與舞台上的存在感，表達方式熱烈大方卻也怕被忽視。',
    '情緒容易被瑣事與不完美觸發焦慮，透過整理、分析與實際幫助他人來獲得安定，安全感來自秩序與可控的生活細節。',
    '情緒容易受人際關係與環境和諧與否牽動，透過討論與尋求共識來安撫內心，安全感來自穩定和睦的關係氛圍。',
    '情緒強烈而深藏、觸動時容易鑽牛角尖，安全感來自絕對的信任與情感的深度連結，表達含蓄卻一旦爆發便驚人。',
    '情緒來得直接也去得爽快，需要空間與新鮮體驗來釋放壓力，安全感來自自由不受拘束、能隨時出走的餘裕。',
    '情緒習慣被理智包裹、不輕易外露，安全感來自實際的成果與對未來的掌控感，表達方式內斂克制、習慣獨自消化。',
    '情緒容易抽離、以旁觀者角度看待自己的感受，安全感來自思想自由與不被情感綁架的空間，表達方式理性甚至疏離。',
    '情緒如潮水般敏感、易感染他人氛圍，安全感來自被無條件包容與心靈相通的連結，表達方式浪漫卻容易迷失界線。'
  ];
  const ASC_TRAIT = [
    '給人朝氣蓬勃、率直坦然的第一印象，走路帶風、說話直接，但這份衝勁有時掩蓋了內心其實需要被肯定的細膩一面。',
    '給人沉穩踏實、氣質溫和的第一印象，舉止不疾不徐、帶著鬆弛感，但外在的淡定有時讓人忽略了內心對變動的抗拒。',
    '給人機靈健談、反應敏捷的第一印象，眼神靈活、話題信手拈來，但這份輕快健談有時讓人看不見底下搖擺不定的一面。',
    '給人溫柔親切、易於親近的第一印象，帶著幾分害羞與體貼的氣場，但柔軟的外表下其實藏著敏感易受傷的防備心。',
    '給人自信閃耀、氣場強大的第一印象，抬頭挺胸、自帶主角光環，但這份光芒有時掩蓋了渴望被真心接納的柔軟需求。',
    '給人整潔幹練、謹慎有禮的第一印象，舉止得體、細節到位，但這份完美表現背後常藏著自我要求過高的焦慮。',
    '給人優雅得體、笑容可掬的第一印象，談吐溫和、擅長察言觀色，但這份圓融周到有時是為了掩飾內心的猶豫不決。',
    '給人神秘深邃、眼神銳利的第一印象，話不多卻自帶壓迫感，但這份冷靜疏離其實是保護內心強烈情感的一層盔甲。',
    '給人陽光開朗、豪爽大方的第一印象，笑聲爽朗、肢體語言誇張自在，但這份隨性有時讓人忽略了內心對承諾的猶豫。',
    '給人成熟穩重、略顯嚴肅的第一印象，舉止端正、氣場帶有距離感，但這份老成持重其實包裹著不輕易示人的脆弱。',
    '給人獨特疏離、思想前衛的第一印象，氣質特立獨行、不易被歸類，但這份酷勁有時讓人誤以為冷漠，其實內心渴望知己。',
    '給人夢幻朦朧、溫柔無害的第一印象，眼神迷濛、氣質柔軟浪漫，但這份飄渺感有時讓人難以看清其實際的內心界線。'
  ];
  const PLANETS = [
    { id: 'sun', name: '太陽', sym: '☉', mean: '核心自我與生命方向' },
    { id: 'moon', name: '月亮', sym: '☽', mean: '情緒需求與內在安全感' },
    { id: 'mercury', name: '水星', sym: '☿', mean: '思考與溝通方式' },
    { id: 'venus', name: '金星', sym: '♀', mean: '愛情觀與審美價值' },
    { id: 'mars', name: '火星', sym: '♂', mean: '行動力與慾望展現' },
    { id: 'jupiter', name: '木星', sym: '♃', mean: '幸運擴張與人生信念' },
    { id: 'saturn', name: '土星', sym: '♄', mean: '課題考驗與責任所在' },
    { id: 'uranus', name: '天王星', sym: '♅', mean: '突變革新（世代）' },
    { id: 'neptune', name: '海王星', sym: '♆', mean: '夢想消融（世代）' },
    { id: 'pluto', name: '冥王星', sym: '♇', mean: '深層蛻變（世代）' }
  ];
  const ASPECTS = [
    { angle: 0, orb: 7, name: '合相', sym: '☌', good: null },
    { angle: 60, orb: 5, name: '六分相', sym: '⚹', good: true },
    { angle: 90, orb: 6, name: '四分相', sym: '□', good: false },
    { angle: 120, orb: 6, name: '三分相', sym: '△', good: true },
    { angle: 180, orb: 7, name: '對分相', sym: '☍', good: false }
  ];
  // 相位解讀：行星主題 × 相位性質，可組合出任意兩星相位的意涵
  const PLANET_THEME = {
    sun: '自我意志與生命核心', moon: '情緒需求與內在安全感', mercury: '思考與溝通方式',
    venus: '愛情觀與價值感', mars: '行動力與慾望', jupiter: '擴展、機會與信念',
    saturn: '責任、紀律與現實框架', uranus: '對變革與自由的追求', neptune: '想像、靈性與理想', pluto: '深層蛻變與掌控力'
  };
  const ASPECT_FLAVOR = {
    合相: '緊密結合、能量互相強化——這兩股力量在你身上幾乎融為一體，是鮮明的天賦，但也可能被過度放大，需善加駕馭。',
    六分相: '和諧配合、機會順暢——只要主動一點，這兩股力量就能彼此加分，是可培養的天賦。',
    三分相: '天生順流、才華渾然天成——這兩股力量毫不費力地互相支援，是你與生俱來的優勢。',
    四分相: '彼此拉扯、形成內在張力——這兩股力量常互相牽制，是需要磨合的成長課題，一旦處理好反而是最大的動力來源。',
    對分相: '兩極拉鋸、需要平衡——這兩股力量像蹺蹺板，容易在關係與內在來回擺盪，學會整合兩端是這輩子的功課。'
  };
  const PERSONAL_PLANETS = new Set(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']);
  function aspectText(x) {
    const outerOnly = !PERSONAL_PLANETS.has(x.a.id) && !PERSONAL_PLANETS.has(x.b.id);
    return `${x.a.name}（${PLANET_THEME[x.a.id]}）與 ${x.b.name}（${PLANET_THEME[x.b.id]}）${ASPECT_FLAVOR[x.asp.name]}${outerOnly ? '（外行星世代相位，對個人的影響較間接）' : ''}`;
  }
  // 相位格局（現代心理占星重視的整體圖形）
  const PATTERN_INFO = {
    大三角: '三顆行星互成三分相（120°×3）——三種能量天生和諧流動、才華渾然天成，是最幸運的相位格局；但太順也易安於現狀、缺乏突破動力，需主動給自己挑戰才不浪費天賦。',
    T三角: 'T三角（兩星對分＋共同四分於頂點行星）——強大的張力與驅動力全聚焦在頂點行星，那是你最用力、也最容易卡關的人生課題；壓力導向對的方向，會成為最大的成就引擎。',
    大十字: '大十字（四星兩兩對分、環環四分）——四股能量互相拉扯，人生多挑戰考驗，但也賦予極強的韌性與行動力；學會平衡四個方向，正是這輩子的修煉。',
    星群: '星群（三顆以上行星聚於同一星座）——大量能量集中在該星座與其掌管的生命領域，使你在此處格外強烈、專注，也容易失衡；那是你人格的重心所在。'
  };
  // ── 傳統七政必然尊貴（Ptolemaic essential dignity）：廟(domicile)／旺(exaltation)／陷(detriment)／弱(fall) ──
  const DIGNITY = {
    sun:     { 廟: ['獅子座'], 旺: '牡羊座', 陷: ['水瓶座'], 弱: '天秤座' },
    moon:    { 廟: ['巨蟹座'], 旺: '金牛座', 陷: ['摩羯座'], 弱: '天蠍座' },
    mercury: { 廟: ['雙子座', '處女座'], 旺: '處女座', 陷: ['射手座', '雙魚座'], 弱: '雙魚座' },
    venus:   { 廟: ['金牛座', '天秤座'], 旺: '雙魚座', 陷: ['牡羊座', '天蠍座'], 弱: '處女座' },
    mars:    { 廟: ['牡羊座', '天蠍座'], 旺: '摩羯座', 陷: ['天秤座', '金牛座'], 弱: '巨蟹座' },
    jupiter: { 廟: ['射手座', '雙魚座'], 旺: '巨蟹座', 陷: ['雙子座', '處女座'], 弱: '摩羯座' },
    saturn:  { 廟: ['摩羯座', '水瓶座'], 旺: '天秤座', 陷: ['巨蟹座', '獅子座'], 弱: '牡羊座' }
  };
  function dignityOf(id, signName) {
    const d = DIGNITY[id];
    if (!d) return null; // 天海冥為現代行星，不論傳統廟旺
    if (d.廟.includes(signName)) return { key: '廟', label: '入廟', good: true, note: '落於自己守護的星座，力量純粹而強盛，此領域天賦充沛、施展自如，是本命的一大優勢。' };
    if (d.旺 === signName) return { key: '旺', label: '曜升', good: true, note: '處於擢升（旺）星座，能量被抬升彰顯，表現亮眼、易受賞識，宜大方發揮。' };
    if (d.陷.includes(signName)) return { key: '陷', label: '失勢', good: false, note: '落於守護的對宮（陷），力量受制、施展彆扭，此領域需後天刻意磨練方能轉為助力。' };
    if (d.弱 === signName) return { key: '弱', label: '落陷', good: false, note: '處於擢升的對宮（弱），能量最受壓抑，是本命較費力的一環，宜正視並主動補強。' };
    return { key: '平', label: '平勢', good: null, note: '於此星座無特殊尊貴或失格（平勢／peregrine），力量中性，端看相位與宮位如何引導。' };
  }
  // 上升守護＝命主星（傳統守護星；天蠍/水瓶/雙魚另註現代共治）
  const SIGN_RULER = {
    牡羊座: 'mars', 金牛座: 'venus', 雙子座: 'mercury', 巨蟹座: 'moon', 獅子座: 'sun', 處女座: 'mercury',
    天秤座: 'venus', 天蠍座: 'mars', 射手座: 'jupiter', 摩羯座: 'saturn', 水瓶座: 'saturn', 雙魚座: 'jupiter'
  };
  const MODERN_CORULER = { 天蠍座: '冥王星', 水瓶座: '天王星', 雙魚座: '海王星' };
  // 臨界度數（傳統關鍵度）：29°臨界（anaretic）、0°初度
  function critDeg(lon) {
    const x = Astro.norm360(lon) % 30;
    if (x >= 29) return { tag: '臨界29°', note: '落於星座最後一度（29°臨界度），該星議題帶著「時不我待、必須了結」的急迫張力，是今生反覆打磨、無法迴避的焦點。' };
    if (x < 1) return { tag: '初度0°', note: '落於星座起始度（0°），能量原始純粹、如白紙般直接坦率，帶有全新開展、尚未被馴化的特質。' };
    return null;
  }

  // 兩經度最短角距
  function angSep(l1, l2) { let d = Math.abs(Astro.norm360(l1 - l2)); return d > 180 ? 360 - d : d; }

  // 月相人格（Rudhyar 月相週期八分法：以日月夾角 elongation 判出生月相原型）
  const MOON_PHASES = [
    { name: '新月', en: 'New Moon', trait: '出生於新月前後，人格帶著「開創、主觀、憑本能往前衝」的原型——如新芽破土，行動先於反省，一生不斷開啟新局，也需學會傾聽他人、看清方向。' },
    { name: '眉月', en: 'Crescent', trait: '娥眉月人帶著「掙脫過去、確立自我」的動能——想突破舊有束縛、開闢自己的路，過程常有拉扯掙扎，衝勁十足但最需要的是堅持到底、不半途而廢。' },
    { name: '上弦月', en: 'First Quarter', trait: '上弦月人是「行動的建造者」——充滿危機感與行動力，勇於打破現狀、當機立斷去建設，人生以「用行動解決問題、推倒重來也在所不惜」為主旋律。' },
    { name: '盈凸月', en: 'Gibbous', trait: '盈凸月人追求「完善與意義」——分析力強、精益求精，渴望把事情做到最好並找到其中的意義，天生的完美主義者，容易對自己與他人要求過高。' },
    { name: '滿月', en: 'Full Moon', trait: '滿月人帶著「覺察與關係」的原型——凡事需要在關係與對立中才看得清自己，客觀而富洞見，人生課題環繞著「與他人的映照、平衡」層層展開。' },
    { name: '虧凸月', en: 'Disseminating', trait: '虧凸月（播種月）人是「理念的傳播者」——樂於分享、教導、把體悟傳遞出去，帶著使命感與說服力，透過影響他人、散播價值來實現自己。' },
    { name: '下弦月', en: 'Last Quarter', trait: '下弦月人帶著「反思與轉向」——外表配合、內在卻常質疑既有體制，是承先啟後的轉型者，勇於為未來調整方向，帶點孤獨的先行者色彩。' },
    { name: '殘月', en: 'Balsamic', trait: '殘月（消散月）人帶著「總結與超越」的原型——直覺敏銳、帶宿命感，像一個週期的收尾者，活在自己的世界裡醞釀下一輪的種子，適合幕後、療癒與靈性探索。' }
  ];
  function moonPhase(sunLon, moonLon) {
    const elong = Astro.norm360(moonLon - sunLon);
    const idx = Math.floor(elong / 45) % 8;
    const illum = (1 - Math.cos(elong * RAD)) / 2; // 受照比例
    return { ...MOON_PHASES[idx], elong, illum, waxing: elong < 180 };
  }

  // 行運（Transit）：現在天上的行星對本命盤的觸動——聚焦木土天海冥（慢星，主題深遠）
  const TRANSIT_ACTORS = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const TRANSIT_MEAN = {
    jupiter: '擴張、機會與福氣', saturn: '考驗、責任與收斂沉澱',
    uranus: '突變、覺醒與打破框架', neptune: '消融、靈感與理想（也易迷惘）', pluto: '深層蛻變、權力翻轉與重生'
  };
  const TRANSIT_ASPECT = { 合相: '正強烈啟動', 三分相: '順流加持', 六分相: '帶來機會', 四分相: '形成張力考驗', 對分相: '帶來對峙拉扯' };
  const TRANSIT_HOUSE = { jupiter: '正迎來擴張與機會，宜把握、順勢成長', saturn: '正經歷考驗與收斂，宜踏實負責、打好基礎' };

  // 從相位清單與行星位置偵測相位格局（回傳 [{type, planets:[...], sign?}]）
  function detectPatterns(aspList, positions) {
    const rel = {};
    aspList.forEach(x => { rel[x.a.id + '|' + x.b.id] = x.asp.name; rel[x.b.id + '|' + x.a.id] = x.asp.name; });
    const A = (p, q) => rel[p.id + '|' + q.id] || null;
    const out = [], seen = new Set();
    const key = (arr) => arr.map(p => p.id).sort().join(',');
    const push = (type, arr, sign) => { const k = type + ':' + key(arr) + (sign || ''); if (!seen.has(k)) { seen.add(k); out.push({ type, planets: arr, sign }); } };
    const N = positions.length;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const oij = A(positions[i], positions[j]);
      // 大三角：i-j-k 三邊皆三分
      if (oij === '三分相') for (let k = j + 1; k < N; k++)
        if (A(positions[i], positions[k]) === '三分相' && A(positions[j], positions[k]) === '三分相') push('大三角', [positions[i], positions[j], positions[k]]);
      // 對分為 T三角/大十字之骨幹
      if (oij === '對分相') {
        for (let k = 0; k < N; k++) if (k !== i && k !== j && A(positions[i], positions[k]) === '四分相' && A(positions[j], positions[k]) === '四分相') {
          // 檢查是否再有一星與 k 對分 → 大十字，否則 T三角
          let cross = null;
          for (let m = 0; m < N; m++) if (m !== i && m !== j && m !== k && A(positions[k], positions[m]) === '對分相' && A(positions[i], positions[m]) === '四分相' && A(positions[j], positions[m]) === '四分相') cross = m;
          if (cross !== null) push('大十字', [positions[i], positions[j], positions[k], positions[cross]]);
          else push('T三角', [positions[i], positions[j], positions[k]]);
        }
      }
    }
    // 星群：同星座 ≥3
    const bySign = {};
    positions.forEach(p => { (bySign[p.sign.name] = bySign[p.sign.name] || []).push(p); });
    Object.entries(bySign).forEach(([sn, arr]) => { if (arr.length >= 3) push('星群', arr, sn); });
    return out;
  }
  const ZODIAC_ICON_ORDER = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
  const ASPECT_ICON = { 合相: 'conjunction', 六分相: 'sextile', 四分相: 'square', 三分相: 'trine', 對分相: 'opposition' };
  const zodiacIcon = (sign, opts) => Icons.svg(ZODIAC_ICON_ORDER[SIGNS.indexOf(sign)], opts || { size: 16 });
  const planetIcon = (p, opts) => Icons.svg(p.id, opts || { size: 15 });
  const aspectIcon = (asp, opts) => Icons.svg(ASPECT_ICON[asp.name], opts || { size: 13 });
  const HOUSE_MEAN = ['自我形象', '金錢價值', '溝通學習', '家庭根基', '創造戀愛', '工作健康', '伴侶關係', '共享轉化', '遠行信念', '事業成就', '朋友願景', '潛意識靈性'];
  // 城市（名稱、緯度、經度、時區）——共用 js/data/cities.js（與三合一綜合命盤同一份）
  const CITIES = MUBU_CITIES;

  const signOf = (lon) => SIGNS[Math.floor(Astro.norm360(lon) / 30)];
  function degInSign(lon) { const x = Astro.norm360(lon) % 30; return `${Math.floor(x)}°${String(Math.floor((x % 1) * 60)).padStart(2, '0')}'`; }

  // 上升／天頂／Placidus 宮首／行星落宮／均時差：改用 Astro 共用引擎（Astro.ascMc/placidusHouses/houseOf/equationOfTime）

  // ---------- SVG 星盤 ----------
  function wheelSVG(positions, cusps, asc, mc) {
    const CX = 210, CY = 210, R_SIGN = 200, R_SIGN_IN = 170, R_PLANET = 140, R_HOUSE = 108, R_INNER = 78;
    const A = (lon) => (180 - (lon - asc)) * RAD; // 上升點固定在左側
    const pt = (lon, r) => [CX + r * Math.cos(A(lon)), CY + r * Math.sin(A(lon))];
    let s = `<svg viewBox="0 0 420 420" style="max-width:460px;width:100%;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">`;
    s += `<circle cx="${CX}" cy="${CY}" r="${R_SIGN}" fill="#FFFDF6" stroke="#C9960A" stroke-width="1.5"/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="${R_SIGN_IN}" fill="none" stroke="#DDD6C8"/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="${R_HOUSE}" fill="none" stroke="#DDD6C8"/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="${R_INNER}" fill="#F5F0E8" stroke="#DDD6C8"/>`;
    // 星座區隔與符號
    const ELEM_COLOR = { 火: '#C0622A', 土: '#8a5e00', 風: '#2D4A6E', 水: '#4A76B8' };
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = pt(i * 30, R_SIGN_IN), [x2, y2] = pt(i * 30, R_SIGN);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#DDD6C8"/>`;
      const [tx, ty] = pt(i * 30 + 15, (R_SIGN + R_SIGN_IN) / 2);
      s += `<text x="${tx}" y="${ty}" font-size="17" text-anchor="middle" dominant-baseline="central" fill="${ELEM_COLOR[SIGNS[i].elem]}">${SIGNS[i].sym}</text>`;
    }
    // 每 10° 刻度
    for (let d = 0; d < 360; d += 10) {
      const [x1, y1] = pt(d, R_SIGN_IN), [x2, y2] = pt(d, R_SIGN_IN - 5);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#C9B98A" stroke-width=".7"/>`;
    }
    // 宮首線與宮號
    for (let h = 1; h <= 12; h++) {
      const bold = h === 1 || h === 10 || h === 4 || h === 7;
      const [x1, y1] = pt(cusps[h], R_INNER), [x2, y2] = pt(cusps[h], R_SIGN_IN);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${bold ? '#B03020' : '#B8AE9C'}" stroke-width="${bold ? 1.6 : .8}"/>`;
      const mid = cusps[h] + Astro.norm360(cusps[h % 12 + 1] - cusps[h]) / 2;
      const [nx, ny] = pt(mid, (R_HOUSE + R_INNER) / 2);
      s += `<text x="${nx}" y="${ny}" font-size="10" text-anchor="middle" dominant-baseline="central" fill="#8A96A8">${h}</text>`;
    }
    // ASC / MC 標籤
    const [ax, ay] = pt(asc, R_SIGN + 1); // 左緣
    s += `<text x="${ax + 4}" y="${ay - 6}" font-size="11" fill="#B03020" font-weight="bold">ASC</text>`;
    const [mx, my] = pt(mc, R_SIGN_IN - 12);
    s += `<text x="${mx}" y="${my}" font-size="11" text-anchor="middle" fill="#B03020" font-weight="bold">MC</text>`;
    // 行星（重疊時分層）
    const sorted = [...positions].sort((a, b) => a.lon - b.lon);
    let lastLon = -99, layer = 0;
    for (const p of sorted) {
      if (Astro.norm360(p.lon - lastLon) < 9 && lastLon > -90) layer = (layer + 1) % 3; else layer = 0;
      lastLon = p.lon;
      const r = R_PLANET + [14, -2, -18][layer];
      const [x, y] = pt(p.lon, r);
      const [tx1, ty1] = pt(p.lon, R_SIGN_IN), [tx2, ty2] = pt(p.lon, R_SIGN_IN - 8);
      s += `<line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="#C9960A" stroke-width="1.2"/>`;
      s += `<text x="${x}" y="${y}" font-size="15" text-anchor="middle" dominant-baseline="central" fill="#1E3554" font-weight="bold">${p.sym}</text>`;
      s += `<text x="${x}" y="${y + 13}" font-size="8" text-anchor="middle" fill="#8A96A8">${Math.floor(Astro.norm360(p.lon) % 30)}°${p.retro ? '℞' : ''}</text>`;
    }
    s += `</svg>`;
    return s;
  }

  function render(el) {
    const bf = App.birthForm({ gender: false, time: true });
    el.innerHTML = `
      <div class="panel">
        <h3>輸入出生資料</h3>
        ${bf.html}
        <div class="form-grid" style="margin-top:10px">
          <div class="field"><label>出生地</label>
            <select class="as-city">${CITIES.map((c, i) => `<option value="${i}">${c[0]}</option>`).join('')}
              <option value="-1">自訂經緯度…</option></select></div>
          <div class="field as-custom" style="display:none"><label>緯度</label><input class="as-lat" type="number" step="0.01" value="25.04" style="width:90px"></div>
          <div class="field as-custom" style="display:none"><label>經度</label><input class="as-lon" type="number" step="0.01" value="121.51" style="width:90px"></div>
          <div class="field as-custom" style="display:none"><label>時區(UTC+)</label><input class="as-tz" type="number" step="0.5" value="8" style="width:80px"></div>
        </div>
        <button class="btn" id="as-go" style="margin-top:14px">${Icons.svg('astrology')} 排星盤</button>
        <p class="muted" style="margin-top:8px">宮位採 Placidus 制；海外城市請留意：時間請填出生地當地時間（未含日光節約時間，若出生於夏令期間請自行減 1 小時）。</p>
      </div>
      <div id="as-result"></div>`;

    el.querySelector('.as-city').addEventListener('change', (e) => {
      el.querySelectorAll('.as-custom').forEach(n => n.style.display = e.target.value === '-1' ? '' : 'none');
    });

    el.querySelector('#as-go').addEventListener('click', () => {
      const b = bf.read(el);
      const ci = +el.querySelector('.as-city').value;
      const [cityName, lat, lon, tz] = ci >= 0 ? CITIES[ci]
        : ['自訂', +el.querySelector('.as-lat').value, +el.querySelector('.as-lon').value, +el.querySelector('.as-tz').value];
      const resEl = el.querySelector('#as-result');
      resEl.innerHTML = '';
      const jdUT = Astro.toJD(b.y, b.m, b.d, b.hh, b.mi) - tz / 24;
      const jde = jdUT + Astro.deltaT(b.y) / 86400;

      // 行星位置＋逆行
      const positions = [];
      for (const p of PLANETS) {
        const calc = (t) => p.id === 'sun' ? Astro.sunLongitude(t) : p.id === 'moon' ? Astro.moonLongitude(t) : Astro.planetLongitude(p.id, t);
        const lonNow = calc(jde);
        const lonPrev = calc(jde - 0.5);
        const lonNext = calc(jde + 0.05); // 用於入相位／出相位判定
        const retro = p.id !== 'sun' && p.id !== 'moon' && Astro.norm360(lonNow - lonPrev) > 180;
        positions.push({ ...p, lon: lonNow, lonNext, sign: signOf(lonNow), retro });
      }
      // 宮位（共用 Astro 引擎）
      const pc = Astro.placidusHouses(jdUT, lat, lon);
      const ascSign = signOf(pc.asc), mcSign = signOf(pc.mc);
      positions.forEach(p => { p.house = Astro.houseOf(p.lon, pc.cusps); });

      // 真太陽時
      const eot = Astro.equationOfTime(jde);
      const meanOffsetMin = (lon - tz * 15) * 4; // 地方平時 − 標準時（分）
      const trueSolarMin = b.hh * 60 + b.mi + meanOffsetMin + eot;
      const tsH = Math.floor(((trueSolarMin / 60) % 24 + 24) % 24), tsM = Math.round(((trueSolarMin % 60) + 60) % 60) % 60;

      // 相位
      const aspList = [];
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          let diff = Math.abs(Astro.norm360(positions[i].lon - positions[j].lon));
          if (diff > 180) diff = 360 - diff;
          for (const a of ASPECTS) {
            if (Math.abs(diff - a.angle) <= a.orb) {
              // 入相位／出相位：比較當下與稍後的容許度，逼近正相位＝入相位
              const orbNow = Math.abs(angSep(positions[i].lon, positions[j].lon) - a.angle);
              const orbNext = Math.abs(angSep(positions[i].lonNext, positions[j].lonNext) - a.angle);
              const applying = orbNext < orbNow;
              aspList.push({ a: positions[i], b: positions[j], asp: a, orb: Math.abs(diff - a.angle).toFixed(1), applying });
              break;
            }
          }
        }
      }
      const patterns = detectPatterns(aspList, positions); // 相位格局（現代心理占星）
      const elemCount = { 火: 0, 土: 0, 風: 0, 水: 0 };
      positions.forEach(p => elemCount[p.sign.elem]++);
      const domElem = Object.entries(elemCount).sort((x, y2) => y2[1] - x[1])[0][0];

      // 七政必然尊貴＋命主星＋臨界度
      const dignified = positions.map(p => ({ p, dig: dignityOf(p.id, p.sign.name) })).filter(x => x.dig && x.dig.key !== '平');
      const rulerP = positions.find(p => p.id === SIGN_RULER[ascSign.name]);
      const rulerDig = dignityOf(rulerP.id, rulerP.sign.name);
      const crits = positions.map(p => ({ p, c: critDeg(p.lon) })).filter(x => x.c);

      // 月相人格（Rudhyar 月相週期）
      const mphase = moonPhase(positions[0].lon, positions[1].lon);
      // 宮主星飛宮：各宮宮首星座守護星落在哪一宮
      const pById = {}; positions.forEach(p => { pById[p.id] = p; });
      const houseRulers = [];
      for (let h = 1; h <= 12; h++) {
        const cuspSign = signOf(pc.cusps[h]);
        const rid = SIGN_RULER[cuspSign.name];
        const rp = pById[rid];
        houseRulers.push({ house: h, cuspSign, rulerP: rp, inHouse: rp.house, coRuler: MODERN_CORULER[cuspSign.name] });
      }

      // 今日行運（Transit）：當前慢星位置＋對本命盤的相位＋落本命宮
      const tnow = new Date();
      const tjdUT = Astro.toJD(tnow.getFullYear(), tnow.getMonth() + 1, tnow.getDate(), tnow.getHours(), tnow.getMinutes()) + tnow.getTimezoneOffset() / 1440;
      const tjde = tjdUT + Astro.deltaT(tnow.getFullYear()) / 86400;
      const transits = TRANSIT_ACTORS.map(id => {
        const P = PLANETS.find(x => x.id === id);
        const tl = Astro.planetLongitude(id, tjde);
        const retro = Astro.norm360(tl - Astro.planetLongitude(id, tjde - 3)) > 180;
        return { ...P, lon: tl, sign: signOf(tl), retro, house: Astro.houseOf(tl, pc.cusps) };
      });
      const natalTargets = [
        ...positions.filter(p => ['sun', 'moon', 'mercury', 'venus', 'mars'].includes(p.id)).map(p => ({ name: p.name, id: p.id, lon: p.lon })),
        { name: '上升', id: 'asc', lon: pc.asc }, { name: '天頂MC', id: 'mc', lon: pc.mc }
      ];
      const tAspects = [];
      for (const t of transits) for (const nt of natalTargets) {
        const diff = angSep(t.lon, nt.lon);
        for (const a of ASPECTS) {
          const orb = (a.angle === 0 || a.angle === 180) ? 3 : 2.5; // 行運取較緊容許度
          if (Math.abs(diff - a.angle) <= orb) { tAspects.push({ t, nt, asp: a, orb: Math.abs(diff - a.angle).toFixed(1) }); break; }
        }
      }
      // 依觸動深度排序：冥天土 > 木；再依容許度
      const T_WEIGHT = { pluto: 0, uranus: 1, neptune: 1, saturn: 2, jupiter: 3 };
      tAspects.sort((m, n) => (T_WEIGHT[m.t.id] - T_WEIGHT[n.t.id]) || (+m.orb) - (+n.orb));

      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <h3>本命星盤</h3>
        <div class="muted" style="text-align:center">${b.y}/${b.m}/${b.d} ${String(b.hh).padStart(2, '0')}:${String(b.mi).padStart(2, '0')}（UTC${tz >= 0 ? '+' : ''}${tz}）· ${cityName}（${lat.toFixed(2)}°, ${lon.toFixed(2)}°）<br>
        真太陽時 ${String(tsH).padStart(2, '0')}:${String(tsM).padStart(2, '0')}（均時差 ${eot >= 0 ? '+' : ''}${eot.toFixed(1)} 分）· 宮位制：${pc.system}</div>
        ${wheelSVG(positions, pc.cusps, pc.asc, pc.mc)}
        <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:12px 0">
          <div class="aspect" style="text-align:center;min-width:130px"><b>${Icons.svg('sun', { size: 16 })} 太陽星座</b><span style="font-size:22px">${zodiacIcon(positions[0].sign, { size: 22 })} ${positions[0].sign.name}</span></div>
          <div class="aspect" style="text-align:center;min-width:130px"><b>${Icons.svg('moon', { size: 16 })} 月亮星座</b><span style="font-size:22px">${zodiacIcon(positions[1].sign, { size: 22 })} ${positions[1].sign.name}</span></div>
          <div class="aspect" style="text-align:center;min-width:130px"><b>${Icons.svg('ascendant', { size: 16 })} 上升星座</b><span style="font-size:22px">${zodiacIcon(ascSign, { size: 22 })} ${ascSign.name}</span></div>
        </div>
        <table class="chart astro-table">
          <tr><th>行星</th><th>星座</th><th>度數</th><th>宮位</th><th>意涵</th></tr>
          ${positions.map(p => { const d = dignityOf(p.id, p.sign.name); const dm = d && d.key !== '平' ? ` <small style="color:${d.good ? 'var(--gold-bright)' : 'var(--cinnabar)'}">${d.key}</small>` : ''; return `<tr><td>${planetIcon(p)} ${p.name}${p.retro ? ' <b style="color:var(--cinnabar)">℞</b>' : ''}</td><td>${zodiacIcon(p.sign)} ${p.sign.name}${dm}</td><td>${degInSign(p.lon)}</td><td>第${p.house}宮<span class="muted">（${HOUSE_MEAN[p.house - 1]}）</span></td><td class="muted">${p.mean}</td></tr>`; }).join('')}
          <tr><td>${Icons.svg('ascendant', { size: 14 })} 上升</td><td>${zodiacIcon(ascSign)} ${ascSign.name}</td><td>${degInSign(pc.asc)}</td><td>第1宮首</td><td class="muted">外在形象與人生舞台入口</td></tr>
          <tr><td>${Icons.svg('midheaven', { size: 14 })} MC 天頂</td><td>${zodiacIcon(mcSign)} ${mcSign.name}</td><td>${degInSign(pc.mc)}</td><td>第10宮首</td><td class="muted">事業志向與社會成就</td></tr>
        </table>
        <h4>宮首一覽（${pc.system}）</h4>
        <p>${[1,2,3,4,5,6,7,8,9,10,11,12].map(h => `<span class="tag">${h}宮 ${zodiacIcon(signOf(pc.cusps[h]), { size: 14 })}${degInSign(pc.cusps[h])}</span>`).join('')}</p>
        <h4>主要相位</h4>
        <p>${aspList.length ? aspList.map(x => `<span class="tag ${x.asp.good === true ? 'gold' : ''}" ${x.asp.good === false ? 'style="color:var(--cinnabar)"' : ''}>${planetIcon(x.a)}${x.a.name} ${aspectIcon(x.asp)} ${planetIcon(x.b)}${x.b.name}（差${x.orb}°）</span>`).join('') : '無明顯主要相位'}</p>
        ${aspList.length ? `<div style="margin-top:6px">${[...aspList].sort((m, n) => {
          const rank = (z) => (PERSONAL_PLANETS.has(z.a.id) ? 0 : 1) + (PERSONAL_PLANETS.has(z.b.id) ? 0 : 1);
          return rank(m) - rank(n) || (+m.orb) - (+n.orb);
        }).map(x => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${x.asp.good === true ? 'var(--gold-mid)' : x.asp.good === false ? 'var(--cinnabar)' : 'var(--panel-border)'}">
          <b>${planetIcon(x.a)}${x.a.name} ${aspectIcon(x.asp)} ${x.asp.name} ${planetIcon(x.b)}${x.b.name}</b> <span class="tag ${x.applying ? 'gold' : ''}">${x.applying ? '入相位' : '出相位'}</span>
          <p style="margin-top:3px">${aspectText(x)}${x.applying ? '此相位為<b>入相位</b>（正逐漸逼近正相位、能量日益增強），作用更鮮明強烈、帶命定感。' : '此相位為<b>出相位</b>（已過正相位、能量漸緩釋放），作用較內化沉澱，像與生俱來的底蘊。'}</p></div>`).join('')}
        <p class="muted" style="font-size:11.5px;margin-top:4px">※ 相位角度為天文精算；入相位／出相位依行星速度判定。意涵採<b>現代心理占星</b>取向——行星＝原型能量，相位描述兩股能量如何互動，硬相位（四分/對分）是成長張力而非命定凶兆。</p></div>` : ''}
        ${patterns.length ? `<h4>相位格局（現代心理占星）</h4>${patterns.map(pt => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${pt.type === '大三角' ? 'var(--gold-mid)' : pt.type === '大十字' ? 'var(--cinnabar)' : 'var(--navy)'}">
          <b>${pt.type}${pt.sign ? `於${pt.sign}` : ''}：${pt.planets.map(p => p.name).join('、')}</b>
          <p style="margin-top:3px">${PATTERN_INFO[pt.type]}</p></div>`).join('')}` : ''}
        <hr class="divider">
        <h4>${Icons.svg('ascendant', { size: 16 })} 命主星與七政旺弱（傳統必然尊貴）</h4>
        <div class="aspect" style="margin-top:6px;border-left:3px solid var(--gold-mid)">
          <b>命主星（上升守護）：${planetIcon(rulerP)}${rulerP.name} 於 ${zodiacIcon(rulerP.sign)}${rulerP.sign.name} 第${rulerP.house}宮${rulerDig && rulerDig.key !== '平' ? `・${rulerDig.label}` : ''}</b>
          <p style="margin-top:3px">上升${ascSign.name}的守護星是${rulerP.name}${MODERN_CORULER[ascSign.name] ? `（現代共治：${MODERN_CORULER[ascSign.name]}）` : ''}——它是整張星盤的總鑰匙。它落在的<b>${rulerP.sign.name}第${rulerP.house}宮（${HOUSE_MEAN[rulerP.house - 1]}）</b>，正是你今生最該用心經營、也最能定義你的舞台。${rulerDig ? rulerDig.note : ''}</p>
        </div>
        ${dignified.length ? `<p style="margin-top:8px">七政旺弱：${dignified.map(x => `<span class="tag ${x.dig.good ? 'gold' : ''}" ${x.dig.good === false ? 'style="color:var(--cinnabar)"' : ''}>${x.p.name}${x.p.sign.name} ${x.dig.label}</span>`).join('')}</p>
        ${dignified.map(x => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${x.dig.good ? 'var(--gold-mid)' : 'var(--cinnabar)'}"><b>${planetIcon(x.p)}${x.p.name}·${x.dig.label}（${x.p.sign.name}）</b><p style="margin-top:3px">${x.dig.note}</p></div>`).join('')}` : '<p class="muted" style="margin-top:6px">日月至土星七政均處平勢，無特別入廟或落陷，力量端看宮位與相位引導——這本身是一種均衡。</p>'}
        ${crits.length ? `<p style="margin-top:8px">臨界度數：${crits.map(x => `<span class="tag">${x.p.name} ${x.c.tag}</span>`).join('')}</p>${crits.map(x => `<p class="muted" style="margin-top:2px;font-size:12.5px">${x.p.name}${x.c.note}</p>`).join('')}` : ''}
        <p class="muted" style="font-size:11.5px;margin-top:4px">※ 旺弱依<b>傳統七政必然尊貴</b>（廟旺陷弱／Ptolemaic essential dignity），僅適用日月至土星七政；天王星、海王星、冥王星為現代行星，只列守護不論廟旺。</p>
        <hr class="divider">
        <h4>${Icons.svg('moon', { size: 16 })} 出生月相 · ${mphase.name}（Rudhyar 月相人格）</h4>
        <div class="aspect" style="margin-top:6px;border-left:3px solid var(--navy)">
          <b>${mphase.name}（${mphase.en}）· 日月相距 ${mphase.elong.toFixed(0)}°・受照 ${(mphase.illum * 100).toFixed(0)}%（${mphase.waxing ? '漸盈' : '漸虧'}）</b>
          <p style="margin-top:3px">${mphase.trait}</p>
        </div>
        <p class="muted" style="font-size:11.5px;margin-top:4px">※ 月相人格依<b>Rudhyar 月相週期</b>八分法，以出生時太陽與月亮的夾角（elongation）判定，描繪你內在「情感（月）與意志（日）」的原型節奏。</p>
        <hr class="divider">
        <h4>${Icons.svg('ascendant', { size: 16 })} 宮主星飛宮（宮位連動）</h4>
        <p class="muted" style="margin-top:-2px">每一宮宮首所落星座的守護星，實際坐落在哪一宮——代表該生命領域的能量最終「流向、連結」到哪個領域，是傳統占星看宮位互涉的關鍵鑰匙。</p>
        <table class="chart astro-table">
          <tr><th>宮位</th><th>宮首</th><th>宮主星</th><th>落宮</th><th>連動意涵</th></tr>
          ${houseRulers.map(r => `<tr><td>${r.house}宮<span class="muted">（${HOUSE_MEAN[r.house - 1]}）</span></td><td>${zodiacIcon(r.cuspSign)}${r.cuspSign.name}</td><td>${planetIcon(r.rulerP)}${r.rulerP.name}${r.coRuler ? `<span class="muted">/${r.coRuler}</span>` : ''}</td><td>第${r.inHouse}宮</td><td class="muted">${r.house === r.inHouse ? '宮主坐本宮——該領域自主穩固、能量內守' : `「${HOUSE_MEAN[r.house - 1]}」牽動「${HOUSE_MEAN[r.inHouse - 1]}」`}</td></tr>`).join('')}
        </table>
        <p class="muted" style="font-size:11.5px;margin-top:4px">※ 守護星採傳統七政系統（天蠍/水瓶/雙魚另註現代共治星）。宮主落本宮主自主穩固，落對宮主拉扯外求，宜綜合全盤判讀。</p>
        <hr class="divider">
        <h4>${Icons.svg('sun', { size: 16 })} 太陽${positions[0].sign.name}（第${positions[0].house}宮）—— 核心自我</h4><p>${positions[0].sign.trait}生命重心落在${HOUSE_MEAN[positions[0].house - 1]}的領域。</p>
        <h4>${Icons.svg('moon', { size: 16 })} 月亮${positions[1].sign.name}（第${positions[1].house}宮）—— 內在情感</h4><p>${MOON_TRAIT[SIGNS.indexOf(positions[1].sign)]}內心層面在${HOUSE_MEAN[positions[1].house - 1]}的領域格外敏感、需要被滋養。</p>
        <h4>${Icons.svg('ascendant', { size: 16 })} 上升${ascSign.name} —— 外在形象</h4><p>${ASC_TRAIT[SIGNS.indexOf(ascSign)]}</p>
        <p style="margin-top:8px">星盤元素以<b style="color:var(--gold-bright)">${domElem}象</b>為主（火${elemCount.火}・土${elemCount.土}・風${elemCount.風}・水${elemCount.水}）。${positions.filter(p => p.retro).length ? `逆行行星：${positions.filter(p => p.retro).map(p => p.name).join('、')}——逆行處課題向內收斂，宜回顧再出發。` : ''}</p>
        <hr class="divider">
        <h4>${Icons.svg('astrology', { size: 16 })} 今日行運（Transit · ${tnow.getFullYear()}/${tnow.getMonth() + 1}/${tnow.getDate()} 當前天象對本命的觸動）</h4>
        <p class="muted" style="margin-top:-2px">行運是「此刻天上的行星」與你「出生星盤」形成的相位，是占星看流年運勢的核心。以下聚焦移動慢、影響深遠的木土天海冥（日月水金火行運僅數日，從略）。</p>
        <p>當前慢星：${transits.map(t => `<span class="tag">${planetIcon(t)}${t.name} ${zodiacIcon(t.sign, { size: 13 })}${t.sign.name}${t.retro ? '℞' : ''}（本命第${t.house}宮）</span>`).join('')}</p>
        ${transits.filter(t => TRANSIT_HOUSE[t.id]).map(t => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${t.id === 'jupiter' ? 'var(--gold-mid)' : 'var(--navy)'}"><b>行運${t.name}行至本命第${t.house}宮（${HOUSE_MEAN[t.house - 1]}）</b><p style="margin-top:3px">你人生的「${HOUSE_MEAN[t.house - 1]}」領域${TRANSIT_HOUSE[t.id]}。</p></div>`).join('')}
        ${tAspects.length ? `<h4 style="margin-top:12px">行運相位（觸動本命）</h4>${tAspects.map(x => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${x.asp.good === true ? 'var(--gold-mid)' : x.asp.good === false ? 'var(--cinnabar)' : 'var(--panel-border)'}">
          <b>行運${planetIcon(x.t)}${x.t.name} ${aspectIcon(x.asp)}${x.asp.name} 本命${x.nt.name}（差${x.orb}°）</b>
          <p style="margin-top:3px">行運${x.t.name}（${TRANSIT_MEAN[x.t.id]}）${TRANSIT_ASPECT[x.asp.name]}你本命的${x.nt.name}——${x.asp.good === false ? '這段期間此主題會遇到考驗或張力，是磨練與調整的時機，撐過去便是成長。' : x.asp.good === true ? '這段期間此主題順流開展、易得助力，宜主動把握。' : '這是一段強烈啟動此主題的時期，能量集中、轉折鮮明，好壞取決於如何運用。'}</p></div>`).join('')}` : '<p class="muted" style="margin-top:6px">當前木土天海冥對本命個人行星／軸點無緊密相位（容許度內），是相對平順、無重大行運壓力的階段。</p>'}
        <p class="muted" style="font-size:11.5px;margin-top:4px">※ 行運星位為當前天文精算（更新至你開啟此頁的時刻）；相位取 2.5°～3° 緊容許度。行運描述「當前的人生天氣」，硬相位是階段課題而非厄運。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請為以下西洋占星本命盤做深度解讀。
出生：${b.y}/${b.m}/${b.d} ${b.hh}:${String(b.mi).padStart(2, '0')}（UTC${tz >= 0 ? '+' : ''}${tz}），${cityName}（${lat}°, ${lon}°），宮位制：${pc.system}
行星位置（含宮位與逆行）：
${positions.map(p => `${p.name}：${p.sign.name} ${degInSign(p.lon)}，第${p.house}宮${p.retro ? '，逆行' : ''}`).join('\n')}
上升：${ascSign.name} ${degInSign(pc.asc)}，天頂MC：${mcSign.name} ${degInSign(pc.mc)}
宮首：${[1,2,3,4,5,6,7,8,9,10,11,12].map(h => `${h}宮${signOf(pc.cusps[h]).name}`).join('、')}
主要相位：${aspList.map(x => `${x.a.name}${x.asp.name}${x.b.name}（容許度${x.orb}°，${x.applying ? '入相位' : '出相位'}）`).join('、') || '無'}
相位格局：${patterns.map(pt => `${pt.type}${pt.sign ? '於' + pt.sign : ''}(${pt.planets.map(p => p.name).join('')})`).join('、') || '無明顯格局'}
命主星（上升守護）：${rulerP.name} 於 ${rulerP.sign.name} 第${rulerP.house}宮${rulerDig && rulerDig.key !== '平' ? '（' + rulerDig.label + '）' : ''}
七政必然尊貴（傳統廟旺陷弱）：${dignified.length ? dignified.map(x => `${x.p.name}${x.dig.label}於${x.p.sign.name}`).join('、') : '七政皆平勢'}${crits.length ? `；臨界度：${crits.map(x => x.p.name + x.c.tag).join('、')}` : ''}
出生月相：${mphase.name}（${mphase.en}，日月相距${mphase.elong.toFixed(0)}°，${mphase.waxing ? '漸盈' : '漸虧'}）
宮主星飛宮：${houseRulers.map(r => `${r.house}宮主${r.rulerP.name}落${r.inHouse}宮`).join('、')}
元素分布：火${elemCount.火} 土${elemCount.土} 風${elemCount.風} 水${elemCount.水}
【今日行運 Transit】(${tnow.getFullYear()}/${tnow.getMonth() + 1}/${tnow.getDate()})當前慢星：${transits.map(t => `${t.name}${t.sign.name}${t.retro ? '逆' : ''}(本命第${t.house}宮)`).join('、')}
行運相位：${tAspects.length ? tAspects.map(x => `行運${x.t.name}${x.asp.name}本命${x.nt.name}(差${x.orb}°)`).join('、') : '無緊密相位'}
請以現代心理占星取向分析：1) 太陽月亮上升三位一體人格 2) 出生月相（Rudhyar 週期）反映的內在情感節奏與人生階段原型 3) 行星落宮的生命領域重點 4) 水金火的溝通/感情/行動風格 5) 木土的機會與課題（含逆行課題）6) 重要相位與相位格局——特別留意入相位（能量漸強、更關鍵）與出相位的差別 7) 命主星落點與七政旺弱（入廟曜升為天賦、失勢落陷為課題）8) 宮主星飛宮串起的宮位連動（哪些生命領域彼此牽引）9) 今日行運：當前木土天海冥落本命宮位與對本命的相位，代表現階段的人生課題與機會（流年運勢重點）10) 綜合本命天賦與當前行運，給出適合的發展方向與近期建議。`);
    });
  }

  // 供三合一綜合命盤共用（傳統必然尊貴／命主星）
  window.AstroTools = { dignityOf, SIGN_RULER, MODERN_CORULER, critDeg };

  App.register({
    id: 'astrology',
    icon: Icons.svg('astrology'),
    title: '西洋占星',
    desc: 'Placidus 宮位制、SVG 星盤、逆行標示、相位逐條解讀＋相位格局（現代心理占星）、真太陽時。',
    render
  });
})();
