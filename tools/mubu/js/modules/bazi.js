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

  // ---------- 格局（依《子平真詮》：月令取格、四吉順用四凶逆用、相神成敗） ----------
  // 每格：類（吉神順用／凶神逆用／祿刃）、喜（相神與所喜十神）、破（破格之神）、救（破中救應／制化之神）、論
  const GE_ZIPING = {
    正官: { 類: '吉', 順逆: '順用', 喜: ['正財', '正印'], 破: ['傷官'], 救: ['正印', '偏印', '正財', '偏財'],
      論: '正官為貴氣之神，主名分、地位、責任。真詮云官格喜財、印相隨——財以生官、印以護官身、身旺以任官。最忌傷官剋官（傷官見官為禍百端）；若有印制傷、或財化傷生官，則破中有救。為人正派守分、律己以嚴，宜公職、法律、管理、大型組織。' },
    七殺: { 類: '凶', 順逆: '逆用', 喜: ['食神', '正印'], 破: ['正財'], 救: ['食神', '正印', '偏印'],
      論: '七殺為攻身之凶神，須制伏方能為用。真詮首取食神制殺、次取印星化殺，制化得宜則殺化為權，掌生殺之柄，反成大貴。若殺重身輕而無制化、或財黨殺以攻身則凶。個性剛毅果決、抗壓有魄力，宜武職、開創、競爭高壓場域。' },
    正財: { 類: '吉', 順逆: '順用', 喜: ['食神', '正官'], 破: ['劫財'], 救: ['食神', '傷官', '正官', '七殺'],
      論: '正財為養命之源，主務實積累。真詮云財格喜食傷生財、官星護財（財生官、官制劫），身旺方能任財。忌比劫奪財；有食傷通關化劫生財、或官星制劫則解。務實勤儉、腳踏實地，宜財經、實業、業務。' },
    偏財: { 類: '吉', 順逆: '順用', 喜: ['食神', '正官'], 破: ['劫財'], 救: ['食神', '傷官', '正官', '七殺'],
      論: '偏財為眾人之財、機會之財，主活絡豪爽。真詮論同財格，喜食傷生、官星護，身旺任之。忌比劫分奪；得食傷或官星則救。善交際、有生意頭腦、路子廣，宜商業、投資、公關；也需留意因財生波。' },
    正印: { 類: '吉', 順逆: '順用', 喜: ['正官', '七殺'], 破: ['正財', '偏財'], 救: ['正官', '七殺', '比肩', '劫財'],
      論: '正印為護身生我之吉神，主庇蔭、學養、名譽。真詮云印格最喜官殺生印（官印相生），身弱得印則貴。忌財星壞印（貪財壞印）；有官殺化財生印、或比劫制財護印則救。仁厚好學、多長輩貴人緣，宜文教、學術、公職。' },
    偏印: { 類: '吉', 順逆: '順用', 喜: ['七殺', '正官'], 破: ['正財', '偏財'], 救: ['七殺', '正官', '比肩', '劫財'],
      論: '偏印（梟神）為特殊之印，主偏門智巧、直覺敏銳。真詮論近印格，喜官殺生、身弱得助。忌財壞印，又忌自身梟神奪食（若命帶食神）。思想獨特、學快而雜，宜玄學、宗教、研究、專業技術、幕僚。' },
    食神: { 類: '吉', 順逆: '順用', 喜: ['正財', '偏財'], 破: ['偏印'], 救: ['正財', '偏財', '七殺'],
      論: '食神為吐秀生財之吉神，主才藝、口福、福氣。真詮云食神喜生財（食神生財源源不絕），亦能制殺護身。最忌偏印奪食（梟印剋食）；有財星制梟護食則解。溫和厚道、懂生活能以才維生，宜藝術、餐飲、教育、文創。' },
    傷官: { 類: '凶', 順逆: '逆用', 喜: ['正印', '正財'], 破: ['正官'], 救: ['正印', '偏印', '正財', '偏財'],
      論: '傷官為洩秀之凶神，聰明外露卻易犯上。真詮兩法：傷官配印（以印制傷、化洩為秀）、傷官生財（以財流通傷氣）。最忌傷官見官（正官透而無財化印制）為破格。才華洋溢、表現慾強但心高氣傲，宜創作、表演、技術、自由業，須學收斂。' },
    建祿: { 類: '祿刃', 順逆: '取財官', 喜: ['正財', '偏財', '正官', '七殺', '食神', '傷官'], 破: [], 救: [],
      論: '月令建祿（日主臨官、比肩當令），身自強旺，本身不成吉凶之格，須另取天干透出的財、官、食傷為用。真詮云祿格喜財官透而有根、食傷吐秀生財，則自立成器。忌滿盤比劫而無財官洩制，主孤剛破耗。自立自強、白手起家，宜獨立創業、專業自立。' },
    月劫: { 類: '祿刃', 順逆: '取財官', 喜: ['正財', '偏財', '正官', '七殺', '食神', '傷官'], 破: [], 救: [],
      論: '月令月劫（劫財當令、陰日主），與建祿同論——身旺須取透出財官食傷為用。得財官食傷有力則能成，比劫重疊無制則爭財聚散。自主性強、行動積極重義氣，宜靠專業與行動力自立。' },
    陽刃: { 類: '凶', 順逆: '逆用', 喜: ['正官', '七殺'], 破: [], 救: ['正官', '七殺'],
      論: '月令羊刃（劫財當令、陽日主），刃為剛烈之凶神，喜官殺制之（尤喜七殺，刃殺相濟為權貴），得制則能掌大權、任大事。忌刃旺無制、或逢沖（羊刃倒戈）主意外血光破財。個性剛烈、爆發力強、敢衝敢拚，宜武職、外科、競技、高風險高報酬。' }
  };
  // 十神 → 相對日主的五行；日主五行 me
  function godWx(god, me) {
    if (god === '比肩' || god === '劫財') return me;
    if (god === '食神' || god === '傷官') return Ganzhi.WX_SHENG[me];
    if (god === '正財' || god === '偏財') return Ganzhi.WX_KE[me];
    if (god === '正官' || god === '七殺') return Object.entries(Ganzhi.WX_KE).find(([, v]) => v === me)[0];
    return Object.entries(Ganzhi.WX_SHENG).find(([, v]) => v === me)[0]; // 正印/偏印：生我
  }
  const _god = (dayGan, ganChar) => Ganzhi.tenGod(dayGan, Ganzhi.GAN.indexOf(ganChar));
  // 特殊格局（從格／專旺格）——日主極弱棄命相從、或一行專旺順勢，須順其勢，用神喜忌與正格相反
  const SPECIAL_GE = {
    從財格: { 喜: ['正財', '偏財', '食神', '傷官'], 忌: ['比肩', '劫財', '正印', '偏印'],
      論: '日主極弱無根、無印比可依，棄命順從滿盤旺財之勢。喜財星與食傷生財、行財運食傷運；最忌比劫爭財、印星生身逆勢反凶。主財富、善經商理財，個性隨和但易受環境牽引。' },
    從殺格: { 喜: ['七殺', '正官', '正財', '偏財'], 忌: ['食神', '傷官', '正印', '偏印', '比肩', '劫財'],
      論: '日主極弱，棄命順從旺盛官殺之勢。喜官殺、財來生殺；忌食傷制殺、印星化殺、比劫幫身逆勢。主貴、能任大責掌權柄，但壓力大、須借勢乘時而起。' },
    從兒格: { 喜: ['食神', '傷官', '正財', '偏財'], 忌: ['正印', '偏印', '正官', '七殺'],
      論: '日主順從滿盤旺盛食傷（我生者）之勢，「兒」即食傷。喜食傷吐秀、財星流通秀氣；忌印星奪食、官殺攻身。主聰明才華橫溢，以才藝、技術、創作揚名。' }
  };
  const ZHUANWANG_NAME = { 木: '曲直格', 火: '炎上格', 土: '稼穡格', 金: '從革格', 水: '潤下格' };
  const ZHUANWANG_INFO = '全局一氣、比劫印星專旺成勢，順其旺不可逆。喜印比助旺、食傷洩其菁華而秀；最忌官殺剋制、財星引動反激旺神為禍。氣勢磅礡、專精一道，宜順勢乘旺、忌強逆其鋒。';
  // 偵測特殊格（保守門檻，仍須地支成方成局全局確認）；回傳格物件或 null
  function specialGe(p, str, wx) {
    const me = p.day.ganWx;
    const keMe = Object.entries(Ganzhi.WX_KE).find(([, v]) => v === me)[0];   // 剋我＝官殺
    const shengMe = Object.entries(Ganzhi.WX_SHENG).find(([, v]) => v === me)[0]; // 生我＝印
    const woSheng = Ganzhi.WX_SHENG[me];  // 我生＝食傷
    const woKe = Ganzhi.WX_KE[me];        // 我剋＝財
    const mk = (name, d) => ({ special: true, name, 成敗: '順勢成格（須全局確認）', 成敗color: 'good',
      喜五行: [...new Set(d.喜.map(g => godWx(g, me)))], 忌五行: [...new Set(d.忌.map(g => godWx(g, me)))],
      喜神十神: d.喜, rule: { 類: '特殊', 順逆: '順勢', 喜: d.喜, 破: d.忌, 救: [], 論: d.論 },
      like: godWx(d.喜[0], me), avoid: godWx(d.忌[0], me) });
    // 從格：日主極弱（幫身力 < 20%）且某敵勢極盛
    if (str.ratio < 0.20) {
      const cand = [['從財格', wx[woKe]], ['從殺格', wx[keMe]], ['從兒格', wx[woSheng]]].sort((a, b) => b[1] - a[1]);
      if (cand[0][1] >= 4) return mk(cand[0][0], SPECIAL_GE[cand[0][0]]);
    }
    // 專旺格：日主極強（幫身力 > 78%）、無官殺剋制、比劫印星佔絕大
    if (str.ratio > 0.78 && wx[keMe] === 0 && wx[me] + wx[shengMe] >= 6) {
      const d = { 喜: ['正印', '偏印', '比肩', '劫財', '食神', '傷官'], 忌: ['正官', '七殺', '正財', '偏財'], 論: ZHUANWANG_INFO };
      return mk(ZHUANWANG_NAME[me], d);
    }
    return null;
  }
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
  // 《子平真詮》取格＋成敗：月令取格（透干法）、四吉順用四凶逆用、相神成敗、喜忌五行
  function ziping(p) {
    const dayGan = p.day.ganIdx, me = p.day.ganWx;
    const str = Ganzhi.strength(p), wx = Ganzhi.wuxingCount(p);
    const sp = specialGe(p, str, wx);               // 先驗特殊格（從格／專旺格）
    if (sp) return sp;
    const yang = Ganzhi.GAN_YINYANG[dayGan] === '陽';
    const cang = p.month.cang;                       // 月令藏干：本氣→中氣→餘氣
    const benGod = _god(dayGan, cang[0]);
    const transStems = [p.year.gan, p.month.gan, p.hour.gan]; // 年月時天干（日主除外）
    const transGods = new Set(transStems.map(g => _god(dayGan, g)));
    const allGods = new Set();                       // 命局所有十神（天干＋藏干）
    for (const k of ['year', 'month', 'hour']) allGods.add(_god(dayGan, p[k].gan));
    for (const k of ['year', 'month', 'day', 'hour']) p[k].cang.forEach(g => allGods.add(_god(dayGan, g)));

    // 取格：月令比劫論祿刃；否則取藏干中透干者（本氣優先），皆不透取本氣
    let key, geGod, exposed = false;
    if (benGod === '比肩') { key = '建祿'; geGod = '比肩'; }
    else if (benGod === '劫財') { key = yang ? '陽刃' : '月劫'; geGod = '劫財'; }
    else {
      const chosen = cang.find(g => { const gg = _god(dayGan, g); return transGods.has(gg) && gg !== '比肩' && gg !== '劫財'; });
      geGod = chosen ? _god(dayGan, chosen) : benGod;
      exposed = !!chosen;
      key = geGod;
    }
    const rule = GE_ZIPING[key];
    const name = key + '格';

    // 成敗（真詮法）
    const present = (g) => transGods.has(g) || allGods.has(g);
    const transHas = (g) => transGods.has(g);        // 透干才算「顯」
    let 成敗, 成敗color;
    if (rule.類 === '吉') {                            // 吉神順用：破神透則破，有救則救
      const 破現 = rule.破.some(transHas);
      const 救現 = rule.救.some(present);
      if (!破現) { 成敗 = '成格'; 成敗color = 'good'; }
      else if (救現) { 成敗 = '破中有救'; 成敗color = 'mid'; }
      else { 成敗 = '破格'; 成敗color = 'bad'; }
    } else if (rule.類 === '凶') {                     // 凶神逆用：得制化則成，無制則敗
      const 制現 = rule.救.some(present);
      成敗 = 制現 ? '成格（制化得宜）' : '敗格（凶神無制）';
      成敗color = 制現 ? 'good' : 'bad';
    } else {                                          // 祿刃：取透出財官食傷為用
      const 用現 = rule.喜.some(transHas);
      成敗 = 用現 ? '得財官食傷透出為用' : '比劫重而乏財官洩制';
      成敗color = 用現 ? 'good' : 'mid';
    }
    // 月令逢沖：月令為格局之根，逢沖則格根動搖（子平真詮所忌）
    const 沖月 = ['year', 'day', 'hour'].some(k => (p[k].zhiIdx + 6) % 12 === p.month.zhiIdx);
    if (沖月 && rule.類 !== '祿刃') {
      if (成敗color === 'good') { 成敗 += '，惟月令逢沖·格根動搖'; 成敗color = 'mid'; }
      else 成敗 += '，兼月令逢沖';
    }

    // 喜忌五行（從格局相神／所喜十神取，取代扶抑粗判）
    const 喜五行 = [...new Set(rule.喜.map(g => godWx(g, me)))];
    const 忌五行 = [...new Set(rule.破.map(g => godWx(g, me)))];
    // 祿刃格忌比劫（自身五行）
    if (rule.類 === '祿刃') 忌五行.push(me);
    const 喜神十神 = rule.喜.filter(present);          // 命中實際出現的喜神
    return { name, key, geGod, exposed, rule, 成敗, 成敗color, 喜五行, 忌五行, 喜神十神,
      like: 喜五行[0] || me, avoid: 忌五行[0] || null };
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
  // 歲運關係：現行大運干支 × 流年干支（子平常用之歲運並臨／天剋地沖／伏吟）
  function suiYunRel(dy, fy) {
    if (!dy) return [];
    const tags = [];
    const 沖 = (dy.zhiIdx + 6) % 12 === fy.zhiIdx;
    const 剋 = Ganzhi.WX_KE[dy.ganWx] === fy.ganWx || Ganzhi.WX_KE[fy.ganWx] === dy.ganWx;
    if (dy.ganIdx === fy.ganIdx && dy.zhiIdx === fy.zhiIdx) tags.push({ t: '歲運並臨', bad: true, why: '流年干支與大運干支相同，力量疊加集中，主此年變動特別劇烈、吉凶都被放大，古法視為需謹慎之年。' });
    else if (沖 && 剋) tags.push({ t: '天剋地沖', bad: true, why: '流年與大運天干相剋、地支相沖（反吟），主環境動盪、人事變遷，是轉折衝擊之年，宜守成勿冒進。' });
    else if (沖) tags.push({ t: '歲運相沖', bad: true, why: '流年地支沖大運地支，主奔波變動、環境轉換，宜順勢調整而非硬拚。' });
    else if ((dy.zhiIdx + fy.zhiIdx) % 12 === 1) tags.push({ t: '歲運相合', bad: false, why: '流年與大運地支六合，主人事和順、易得助力，是相對安穩之年。' }); // 六合：子丑/寅亥/卯戌/辰酉/巳申/午未，支和恆≡1(mod 12)
    return tags;
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
      const ss = shensha(p);
      const relations = Ganzhi.branchRelations(p);
      const th = Ganzhi.tiaohou(p.day.ganIdx, p.month.zhiIdx);
      const nowYear = new Date().getFullYear();
      const flowYears = Ganzhi.yearlyFortune(nowYear, 10, p);
      const flowMonths = Ganzhi.monthlyFortune(nowYear, p);
      // 現行大運（八字大運按實足年齡起運）
      const _now = new Date();
      const realAge = _now.getFullYear() - b.y - ((_now.getMonth() + 1 < b.m || (_now.getMonth() + 1 === b.m && _now.getDate() < b.d)) ? 1 : 0);

      const ge = ziping(p);         // 《子平真詮》格局＋成敗＋喜忌
      const doms = dominantGods(p);
      const like = ge.like;         // 格局用神（子平真詮，取代扶抑粗判）
      const avoid = ge.avoid;
      const fuyiLike = str.like;    // 扶抑粗判喜用，僅供五行分布欄對照
      // 現行大運＋歲運關係
      const curDy = luck.list.find(d => realAge >= d.age && realAge <= d.age + 9) || null;
      const curDyLuck = curDy ? daYunLuck(curDy, like, avoid) : null;
      const flowRel = flowYears.map(f => ({ f, tags: suiYunRel(curDy, f) }));

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
        ${most[0]}最旺（${most[1]} 見）。扶抑粗判喜用<b>${fuyiLike}</b>（僅供對照，正式用神以下方格局為準）。</p>
        <hr class="divider">
        <h4>格局 · ${ge.name} <span class="fortune-level ${ge.成敗color}">${ge.成敗}</span></h4>
        <p>${ge.special ? '<span class="tag" style="color:var(--cinnabar)">特殊格局・順勢而論</span><span class="tag">須地支成方成局全局確認</span>'
          : `<span class="tag gold">《子平真詮》月令取格</span>${ge.rule.類 === '祿刃' ? '<span class="tag">祿刃格・另取財官為用</span>' : `<span class="tag">${ge.rule.順逆}（${ge.rule.類}神）</span>${ge.exposed ? '<span class="tag">格神透干</span>' : '<span class="tag">格神藏月令</span>'}`}`}</p>
        <p style="margin-top:6px">${ge.rule.論}</p>
        <p style="margin-top:6px"><b>相神／所喜：</b>${ge.rule.喜.map(g => `<span class="tag ${ge.喜神十神.includes(g) ? 'gold' : ''}">${g}${ge.喜神十神.includes(g) ? '✓' : ''}</span>`).join('')}${ge.rule.破.length ? `　<b>忌：</b>${ge.rule.破.map(g => `<span class="tag" style="color:var(--cinnabar)">${g}</span>`).join('')}` : ''}</p>
        <p><b>格局喜用五行：</b><span style="color:var(--gold-bright)">${ge.喜五行.join('、')}</span>${ge.忌五行.length ? `　<b>忌：</b><span style="color:var(--cinnabar)">${ge.忌五行.join('、')}</span>` : ''}</p>
        <p class="muted" style="font-size:11.5px;margin-top:4px">※ 依《子平真詮》月令取格、四吉順用四凶逆用、相神成敗之法（程式化的簡化判讀）；成敗高低尚須綜合會合刑沖與全局氣勢，深論請用 AI 深度解讀或請教專業命理師。</p>
        <hr class="divider">
        <h4>日主性格 · ${p.day.gan}${p.day.ganWx}</h4>
        <p>${GAN_CHAR[p.day.gan]}</p>
        <p style="margin-top:6px">${WX_ADVICE[like]}</p>
        ${doms.length ? `<p style="margin-top:6px"><b>命中主要十神：</b>${doms.map(([g, n]) => `<span class="tag">${g}×${n}</span>`).join('')}</p>
        ${doms.map(([g]) => `<p class="muted" style="margin-top:4px"><b style="color:var(--ink)">${g}</b>：${SHISHEN_CHAR[g]}</p>`).join('')}` : ''}
        <hr class="divider">
        <h4>大運（${luck.startAge} 歲起運，${luck.forward ? '順' : '逆'}行）<span class="muted" style="font-weight:400">　依格局喜用${ge.喜五行.join('')}${ge.忌五行.length ? `／忌${ge.忌五行.join('')}` : ''}標吉凶</span></h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${luck.list.map(d => { const dl = daYunLuck(d, like, avoid); const isNow = d === curDy; return `<div class="aspect" style="min-width:88px;text-align:center;flex:1;${isNow ? 'border-color:var(--gold-bright);box-shadow:0 0 0 1px var(--gold-mid) inset;' : dl.cls === 'good' ? 'border-color:rgba(240,194,104,.5)' : dl.cls === 'bad' ? 'border-color:rgba(176,48,32,.35)' : ''}">
            <b>${d.age}-${d.age + 9}歲</b>${isNow ? '<span class="tag gold" style="display:block;margin:2px auto">現行</span>' : ''}<span style="font-size:18px;letter-spacing:.15em">${d.name}</span>
            <div class="muted" style="font-size:12px">${d.nayin}</div>
            <div style="font-size:12px;color:${dl.cls === 'good' ? 'var(--gold-deep)' : dl.cls === 'bad' ? 'var(--cinnabar)' : 'var(--ink-dim)'}">${dl.label}</div></div>`; }).join('')}
        </div>
        ${curDy ? `<div class="aspect" style="margin-top:10px;border-left:3px solid ${curDyLuck.cls === 'good' ? 'var(--gold-mid)' : curDyLuck.cls === 'bad' ? 'var(--cinnabar)' : 'var(--panel-border)'}">
          <b>現行大運：${curDy.name}（${curDy.age}-${curDy.age + 9}歲，實歲 ${realAge}）· ${curDyLuck.label}</b>
          <p style="margin-top:3px">這十年行<b>${curDy.name}</b>運（${curDy.nayin}）。大運天干${curDy.gan}${curDy.ganWx}、地支${curDy.zhi}${curDy.zhiWx}，對照本命格局喜<b>${ge.喜五行.join('') || '—'}</b>忌<b>${ge.忌五行.join('') || '—'}</b>，判為<b>${curDyLuck.label}</b>運。${curDyLuck.cls === 'good' ? '此十年氣機相扶，宜積極進取、把握格局所喜之事。' : curDyLuck.cls === 'bad' ? '此十年忌神當令，宜守成蓄力、避免大幅擴張與冒進。' : '此十年吉凶參半，順喜用之事則吉，犯忌神之事則滯。'}</p>
        </div>` : ''}
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
        <h4>流年運勢（${nowYear}－${nowYear + 9}）${curDy ? `<span class="muted" style="font-weight:400">　含與現行大運${curDy.name}之歲運關係</span>` : ''}</h4>
        <table class="chart">
          <tr><th>年份</th><th>干支</th><th>十神</th><th>備註</th><th>歲運關係</th></tr>
          ${flowRel.map(({ f, tags }) => `<tr>
            <td>${f.year}</td><td>${f.name}<span class="muted">（${f.shengxiao}）</span></td>
            <td>${f.tenGod}</td>
            <td class="muted" ${f.tags.length ? 'style="color:var(--cinnabar)"' : ''}>${f.tags.join('、') || '—'}</td>
            <td ${tags.length ? `style="color:${tags[0].bad ? 'var(--cinnabar)' : 'var(--gold-deep)'}"` : 'class="muted"'}>${tags.map(t => t.t).join('、') || '—'}</td></tr>`).join('')}
        </table>
        ${flowRel.some(x => x.tags.length) ? flowRel.filter(x => x.tags.length).map(x => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${x.tags[0].bad ? 'var(--cinnabar)' : 'var(--gold-mid)'}"><b>${x.f.year} ${x.f.name} · ${x.tags.map(t => t.t).join('、')}</b><p style="margin-top:3px">${x.tags.map(t => t.why).join('')}</p></div>`).join('') : ''}
        <h4>${nowYear} 流月（節氣月）</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:6px">
          ${flowMonths.map(f => `<div class="aspect" style="text-align:center;padding:8px 4px">
            <b style="display:inline">${f.name}月</b><br><span class="muted" style="font-size:11.5px">${f.jie}起（約${f.approx}）</span><br>
            <span style="color:var(--gold-bright)">${f.tenGod}</span></div>`).join('')}
        </div>
        <p class="muted" style="margin-top:10px">※ 流年十神以日主對流年天干論；「沖太歲／值太歲」以出生年支對流年支論；「歲運關係」為流年干支對<b>現行大運</b>干支論（歲運並臨／天剋地沖／六沖／六合），大運起運歲數採實足年齡。內建解讀為簡化規則判斷，詳細論命建議使用 AI 深度解讀。</p>
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
格局（依《子平真詮》）：${ge.name}，${ge.成敗}；相神／所喜${ge.rule.喜.join('、')}，忌${ge.rule.破.join('、') || '無'}；格局喜用五行${ge.喜五行.join('、')}，忌${ge.忌五行.join('、') || '無'}。命中主要十神：${doms.map(([g, n]) => `${g}${n}`).join('、')}
神煞：${ss.map(s => `${s.name}（${s.positions.join('、')}柱）`).join('、') || '無明顯神煞'}
合沖刑害：${relations.map(r => r.text).join('；') || '無明顯'}
調候用神（參考）：${th ? th.split('').join('、') : '無'}
大運（已依用神${like}${avoid ? `／忌神${avoid}` : ''}標吉凶）：${luck.startAge}歲起${luck.forward ? '順' : '逆'}行，${luck.list.map(d => `${d.age}歲${d.name}(${daYunLuck(d, like, avoid).label})`).join('、')}
${curDy ? `現行大運：${curDy.name}（${curDy.age}-${curDy.age + 9}歲，今實歲${realAge}），依格局喜忌判為「${curDyLuck.label}」運。
` : ''}未來十年流年：${flowRel.map(({ f, tags }) => `${f.year}${f.name}(${f.tenGod}${f.tags.length ? '，' + f.tags.join('/') : ''}${tags.length ? '，歲運' + tags.map(t => t.t).join('/') : ''})`).join('、')}
請以《子平真詮》格局法為主軸分析：1) 格局成敗與高低（已定${ge.name}·${ge.成敗}，請據相神有無得力、有無破格救應深論）2) 喜用神與忌神（以格局喜用${ge.喜五行.join('、')}為主，結合調候與合沖刑害微調）3) 性格特質 4) 事業財運方向 5) 感情婚姻 6) 大運與未來十年流年走勢重點——先論<b>現行大運</b>這十年的主軸（大運干支與格局喜忌的生剋），再逐年看流年，特別留意標出「歲運並臨／天剋地沖／歲運相沖」之年（歲運交戰主變動）與吉凶轉折年份，呼應上方標記7) 命中神煞對格局的加分或提醒。`);
    });
  }

  // 供三合一綜合命盤共用格局引擎
  window.BaziEngine = { ziping, dominantGods };

  App.register({
    id: 'bazi',
    icon: Icons.svg('bazi'),
    title: '八字命理',
    desc: '四柱排盤、依《子平真詮》取格論成敗、十神藏干、格局喜忌、大運吉凶標註，天文級節氣精度。',
    render
  });
})();
