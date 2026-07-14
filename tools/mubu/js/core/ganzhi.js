/* 暮卜先知 · 干支引擎
 * 四柱（年月日時）、五行、十神、納音、生肖
 * 依賴 astro.js（節氣定年月柱）
 */
const Ganzhi = (() => {
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];
  const GAN_WUXING = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  const ZHI_WUXING = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  const GAN_YINYANG = ['陽', '陰', '陽', '陰', '陽', '陰', '陽', '陰', '陽', '陰'];

  // 地支藏干（本氣、中氣、餘氣）
  const ZHI_CANGGAN = {
    子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
    辰: ['戊', '乙', '癸'], 巳: ['丙', '庚', '戊'], 午: ['丁', '己'], 未: ['己', '丁', '乙'],
    申: ['庚', '壬', '戊'], 酉: ['辛'], 戌: ['戊', '辛', '丁'], 亥: ['壬', '甲']
  };

  // 六十甲子納音
  const NAYIN = ['海中金', '爐中火', '大林木', '路旁土', '劍鋒金', '山頭火', '澗下水', '城頭土', '白蠟金', '楊柳木',
    '泉中水', '屋上土', '霹靂火', '松柏木', '長流水', '砂石金', '山下火', '平地木', '壁上土', '金箔金',
    '覆燈火', '天河水', '大驛土', '釵釧金', '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水'];

  const idx60 = (g, z) => {
    // 由干支索引求六十甲子序（0=甲子）
    for (let i = 0; i < 60; i++) if (i % 10 === g && i % 12 === z) return i;
    return -1;
  };
  const pillar = (n) => {
    n = ((n % 60) + 60) % 60;
    return {
      n,
      gan: GAN[n % 10], zhi: ZHI[n % 12],
      ganIdx: n % 10, zhiIdx: n % 12,
      name: GAN[n % 10] + ZHI[n % 12],
      nayin: NAYIN[Math.floor(n / 2)],
      ganWx: GAN_WUXING[n % 10], zhiWx: ZHI_WUXING[n % 12],
      cang: ZHI_CANGGAN[ZHI[n % 12]]
    };
  };

  // ---------- 四柱 ----------
  // 日柱：(JDN + 49) % 60 → 0=甲子（已以 1949-10-01 甲子日、1970-01-01 辛巳日雙錨點驗證）
  function dayPillar(y, m, d) {
    const jdn = Math.floor(Astro.toJD(y, m, d, 12));
    return pillar((jdn + 49) % 60);
  }

  // 年柱：以立春為界
  function yearPillar(y, m, d, hh = 12, mi = 0) {
    const jd = Astro.toJD(y, m, d, hh, mi);
    const lichun = Astro.solarTerm(y, 2); // 該年立春（本地 JD）
    const sy = jd >= lichun ? y : y - 1;
    const n = idx60(((sy - 4) % 10 + 10) % 10, ((sy - 4) % 12 + 12) % 12);
    const p = pillar(n);
    p.year = sy;
    p.shengxiao = SHENGXIAO[p.zhiIdx];
    return p;
  }

  // 月柱：以節（立春、驚蟄、清明…）為界，寅月起
  function monthPillar(y, m, d, hh = 12, mi = 0) {
    const jd = Astro.toJD(y, m, d, hh, mi);
    // 找出目前所處的節（奇數索引節氣為「節」：立春k=2, 驚蟄k=4, ... 小寒k=0）
    // 節序列（月首）：立春(2) 驚蟄(4) 清明(6) 立夏(8) 芒種(10) 小暑(12) 立秋(14) 白露(16) 寒露(18) 立冬(20) 大雪(22) 小寒(0,次年)
    const yp = yearPillar(y, m, d, hh, mi);
    // 從去年冬天到今年年底掃描節
    let monthIdx = -1; // 0=寅月
    const jie = [];
    for (const yy of [y - 1, y, y + 1]) {
      for (const k of [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0]) {
        const kk = k === 0 ? 0 : k;
        const yUse = k === 0 ? yy + 1 : yy; // 小寒屬次年公曆
        if (yUse < y - 1 || yUse > y + 1) continue;
        jie.push({ jd: Astro.solarTerm(yUse, kk), mi: k === 0 ? 11 : (k - 2) / 2 });
      }
    }
    jie.sort((a, b) => a.jd - b.jd);
    for (let i = 0; i < jie.length; i++) {
      if (jd >= jie[i].jd && (i === jie.length - 1 || jd < jie[i + 1].jd)) { monthIdx = jie[i].mi; break; }
    }
    if (monthIdx < 0) monthIdx = 0;
    // 五虎遁：年干 → 寅月天干
    const stem = ((yp.ganIdx % 5) * 2 + 2 + monthIdx) % 10;
    const branch = (monthIdx + 2) % 12; // 寅=2
    const p = pillar(idx60(stem, branch));
    p.monthIdx = monthIdx;
    return p;
  }

  // 時柱：五鼠遁；23:00 起為次日子時（晚子時用次日日干）
  function hourPillar(y, m, d, hh, mi = 0) {
    let dp = dayPillar(y, m, d);
    let useNext = hh >= 23;
    if (useNext) {
      const t = Astro.fromJD(Astro.toJD(y, m, d, 12) + 1);
      dp = dayPillar(t.y, t.m, t.d);
    }
    const zhiIdx = Math.floor(((hh + 1) % 24) / 2) % 12;
    const stem = ((dp.ganIdx % 5) * 2 + zhiIdx) % 10;
    return pillar(idx60(stem, zhiIdx));
  }

  // 完整四柱
  function fourPillars(y, m, d, hh = 12, mi = 0) {
    return {
      year: yearPillar(y, m, d, hh, mi),
      month: monthPillar(y, m, d, hh, mi),
      day: dayPillar(y, m, d),
      hour: hourPillar(y, m, d, hh, mi)
    };
  }

  // ---------- 十神 ----------
  // 以日干為我，判斷另一干的十神
  function tenGod(dayGanIdx, otherGanIdx) {
    const wxIdx = { 木: 0, 火: 1, 土: 2, 金: 3, 水: 4 };
    const me = wxIdx[GAN_WUXING[dayGanIdx]];
    const ot = wxIdx[GAN_WUXING[otherGanIdx]];
    const samePolarity = GAN_YINYANG[dayGanIdx] === GAN_YINYANG[otherGanIdx];
    const rel = (ot - me + 5) % 5; // 0同 1我生 2我剋 3剋我 4生我
    switch (rel) {
      case 0: return samePolarity ? '比肩' : '劫財';
      case 1: return samePolarity ? '食神' : '傷官';
      case 2: return samePolarity ? '偏財' : '正財';
      case 3: return samePolarity ? '七殺' : '正官';
      case 4: return samePolarity ? '偏印' : '正印';
    }
  }

  // 五行生剋
  const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
  const WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };    // 我剋

  // p: fourPillars；統計四柱天干地支的五行分佈
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
    const shengMe = Object.entries(WX_SHENG).find(([, v]) => v === me)[0];
    const keMe = Object.entries(WX_KE).find(([, v]) => v === me)[0]; // 剋我者（官殺）
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
    const label = ratio >= 0.5 ? '偏強' : ratio >= 0.35 ? '中和' : '偏弱';
    // 用神／忌神粗判：身強洩剋為用、印比為忌；身弱印比為用、官殺為忌；中和不特別忌
    const like = label === '偏強' ? WX_SHENG[me] : (label === '偏弱' ? shengMe : me);
    const avoid = label === '偏強' ? shengMe : (label === '偏弱' ? keMe : null);
    return { ratio, label, shengMe, keMe, like, avoid };
  }

  // ---------- 大運 ----------
  // 陽年男/陰年女順行，陰年男/陽年女逆行；起運歲數＝距節氣天數/3
  function luck(y, m, d, hh, gender, pillars) {
    const yang = GAN_YINYANG[pillars.year.ganIdx] === '陽';
    const forward = (gender === 'M') === yang;
    const jd = Astro.toJD(y, m, d, hh);
    // 找最近的節（前或後）
    const jieKs = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0];
    let all = [];
    for (const yy of [y - 1, y, y + 1]) {
      for (const k of jieKs) all.push(Astro.solarTerm(k === 0 ? yy + 1 : yy, k));
    }
    all.sort((a, b) => a - b);
    let days;
    if (forward) {
      const next = all.find(j => j > jd);
      days = next - jd;
    } else {
      const prev = [...all].reverse().find(j => j < jd);
      days = jd - prev;
    }
    const startAge = Math.max(1, Math.round(days / 3));
    const list = [];
    let n = pillars.month.n;
    for (let i = 1; i <= 8; i++) {
      n = forward ? n + 1 : n - 1;
      const p = pillar(n);
      list.push({ age: startAge + (i - 1) * 10, ...p });
    }
    return { startAge, forward, list };
  }

  // ---------- 地支/天干 合沖刑害 ----------
  const LIUHE = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 }; // 六合
  const LIUHAI = { 0: 7, 7: 0, 1: 6, 6: 1, 2: 5, 5: 2, 3: 4, 4: 3, 8: 11, 11: 8, 9: 10, 10: 9 }; // 六害
  const SANHE = [[8, 0, 4, '水'], [2, 6, 10, '火'], [5, 9, 1, '金'], [11, 3, 7, '木']]; // 三合局
  const SANHUI = [[2, 3, 4, '木'], [5, 6, 7, '火'], [8, 9, 10, '金'], [11, 0, 1, '水']]; // 三會方
  const XING_PAIRS = [[0, 3]]; // 子卯無禮之刑
  const XING_TRIOS = [[2, 5, 8, '寅巳申無恩之刑'], [1, 10, 7, '丑戌未恃勢之刑']];
  const ZIXING = [4, 6, 9, 11]; // 辰午酉亥自刑

  // pillars: {year, month, day, hour}；回傳 [{type, level, text}]
  function branchRelations(pillars) {
    const posName = ['年', '月', '日', '時'];
    const zhis = ['year', 'month', 'day', 'hour'].map(k => pillars[k].zhiIdx);
    const gans = ['year', 'month', 'day', 'hour'].map(k => pillars[k].ganIdx);
    const out = [];
    const zName = (i) => `${posName[i]}支${ZHI[zhis[i]]}`;
    // 地支兩兩關係
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const a = zhis[i], b = zhis[j];
        if ((a + 6) % 12 === b) out.push({ type: '六沖', level: 'bad', text: `${zName(i)}沖${zName(j)}（${ZHI[a]}${ZHI[b]}沖）` });
        if (LIUHE[a] === b) out.push({ type: '六合', level: 'good', text: `${zName(i)}合${zName(j)}（${ZHI[a]}${ZHI[b]}合）` });
        if (LIUHAI[a] === b) out.push({ type: '六害', level: 'bad', text: `${zName(i)}害${zName(j)}（${ZHI[a]}${ZHI[b]}害）` });
        if (XING_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x)))
          out.push({ type: '相刑', level: 'bad', text: `${zName(i)}刑${zName(j)}（子卯無禮之刑）` });
        if (a === b && ZIXING.includes(a)) out.push({ type: '自刑', level: 'bad', text: `${zName(i)}${zName(j)}自刑（${ZHI[a]}${ZHI[a]}）` });
      }
    }
    // 三合三會三刑（取任兩支為半合/半會亦註記全者）
    const has = (x) => zhis.includes(x);
    for (const [a, b, c, wx] of SANHE) {
      if (has(a) && has(b) && has(c)) out.push({ type: '三合', level: 'good', text: `${ZHI[a]}${ZHI[b]}${ZHI[c]}三合${wx}局` });
    }
    for (const [a, b, c, wx] of SANHUI) {
      if (has(a) && has(b) && has(c)) out.push({ type: '三會', level: 'good', text: `${ZHI[a]}${ZHI[b]}${ZHI[c]}三會${wx}方` });
    }
    for (const [a, b, c, name] of XING_TRIOS) {
      const hit = [a, b, c].filter(has);
      if (hit.length === 3) out.push({ type: '三刑', level: 'bad', text: name });
      else if (hit.length === 2) out.push({ type: '相刑', level: 'bad', text: `${hit.map(x => ZHI[x]).join('')}相刑（${name.slice(0, 3)}刑之半）` });
    }
    // 天干五合、四沖
    const WUHE = { 0: [5, '土'], 5: [0, '土'], 1: [6, '金'], 6: [1, '金'], 2: [7, '水'], 7: [2, '水'], 3: [8, '木'], 8: [3, '木'], 4: [9, '火'], 9: [4, '火'] };
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const a = gans[i], b = gans[j];
        if (WUHE[a] && WUHE[a][0] === b) out.push({ type: '干合', level: 'good', text: `${posName[i]}干${GAN[a]}合${posName[j]}干${GAN[b]}（${GAN[a]}${GAN[b]}合化${WUHE[a][1]}）` });
        if ([[0, 6], [1, 7], [2, 8], [3, 9]].some(([x, y]) => (a === x && b === y) || (a === y && b === x)))
          out.push({ type: '干沖', level: 'bad', text: `${posName[i]}干${GAN[a]}沖${posName[j]}干${GAN[b]}` });
      }
    }
    return out;
  }

  // 兩地支的關係（供合婚等使用）：回傳 {type, good}
  function zhiRelation(a, b) {
    if ((a + 6) % 12 === b) return { type: '六沖', good: false };
    if (LIUHE[a] === b) return { type: '六合', good: true };
    if (LIUHAI[a] === b) return { type: '六害', good: false };
    if ((a === 0 && b === 3) || (a === 3 && b === 0)) return { type: '相刑', good: false };
    if (a === b && ZIXING.includes(a)) return { type: '自刑', good: false };
    for (const [x, y, z] of SANHE) {
      if ([x, y, z].includes(a) && [x, y, z].includes(b) && a !== b) return { type: '三合', good: true };
    }
    for (const [x, y, z] of XING_TRIOS) {
      if ([x, y, z].includes(a) && [x, y, z].includes(b) && a !== b) return { type: '相刑', good: false };
    }
    if (a === b) return { type: '同支', good: true };
    return { type: '平', good: null };
  }

  // 兩份四柱之間的交叉沖合（供合婚等雙人比對用）：檢查甲乙雙方 4×4 共16組地支關係，
  // 只回傳有明確吉凶意涵者（略過「平」與同位置的「同支」，避免與逐柱同位比對重複）
  function crossRelations(pa, pb) {
    const cols = ['year', 'month', 'day', 'hour'];
    const posName = { year: '年', month: '月', day: '日', hour: '時' };
    const out = [];
    for (const ca of cols) {
      for (const cb of cols) {
        const rel = zhiRelation(pa[ca].zhiIdx, pb[cb].zhiIdx);
        if (rel.type === '平' || (rel.type === '同支' && ca === cb)) continue;
        out.push({ posA: posName[ca], posB: posName[cb], zhiA: pa[ca].zhi, zhiB: pb[cb].zhi, sameCol: ca === cb, ...rel });
      }
    }
    return out;
  }

  // 兩天干的關係：五合／相生／比和／相剋
  function ganRelation(a, b) {
    if ((a + 5) % 10 === b || (b + 5) % 10 === a) return { type: '五合', good: true };
    const wa = GAN_WUXING[a], wb = GAN_WUXING[b];
    if (wa === wb) return { type: '比和', good: true };
    if (WX_SHENG[wa] === wb || WX_SHENG[wb] === wa) return { type: '相生', good: true };
    return { type: '相剋', good: false };
  }

  // ---------- 調候用神（窮通寶鑑簡表，僅供參考） ----------
  const TIAOHOU = {
    甲: { 寅: '丙癸', 卯: '庚丙丁', 辰: '庚丁壬', 巳: '癸丁庚', 午: '癸丁庚', 未: '癸丁庚', 申: '庚丁壬', 酉: '庚丙丁', 戌: '庚甲丁壬癸', 亥: '庚丁戊丙', 子: '丁庚丙', 丑: '丁庚丙' },
    乙: { 寅: '丙癸', 卯: '丙癸', 辰: '癸丙戊', 巳: '癸', 午: '癸丙', 未: '癸丙', 申: '丙癸己', 酉: '癸丙丁', 戌: '癸辛', 亥: '丙戊', 子: '丙', 丑: '丙' },
    丙: { 寅: '壬庚', 卯: '壬己', 辰: '壬甲', 巳: '壬庚癸', 午: '壬庚', 未: '壬庚', 申: '壬戊', 酉: '壬癸', 戌: '甲壬', 亥: '甲戊庚壬', 子: '壬戊己', 丑: '壬甲' },
    丁: { 寅: '甲庚', 卯: '庚甲', 辰: '甲庚', 巳: '甲庚', 午: '壬庚癸', 未: '甲壬庚', 申: '甲庚丙戊', 酉: '甲庚丙戊', 戌: '甲庚戊', 亥: '甲庚', 子: '甲庚', 丑: '甲庚' },
    戊: { 寅: '丙甲癸', 卯: '丙甲癸', 辰: '甲丙癸', 巳: '甲丙癸', 午: '壬甲丙', 未: '癸丙甲', 申: '丙癸甲', 酉: '丙癸', 戌: '甲丙癸', 亥: '甲丙', 子: '丙甲', 丑: '丙甲' },
    己: { 寅: '丙庚甲', 卯: '甲癸丙', 辰: '丙癸甲', 巳: '癸丙', 午: '癸丙', 未: '癸丙', 申: '丙癸', 酉: '丙癸', 戌: '甲丙癸', 亥: '丙甲戊', 子: '丙甲戊', 丑: '丙甲戊' },
    庚: { 寅: '戊甲壬丙丁', 卯: '丁甲庚丙', 辰: '甲丁壬癸', 巳: '壬戊丙丁', 午: '壬癸', 未: '丁甲', 申: '丁甲', 酉: '丁甲丙', 戌: '甲壬', 亥: '丁丙', 子: '丁甲丙', 丑: '丙丁甲' },
    辛: { 寅: '己壬庚', 卯: '壬甲', 辰: '壬甲', 巳: '壬甲癸', 午: '壬己癸', 未: '壬庚甲', 申: '壬甲戊', 酉: '壬甲', 戌: '壬甲', 亥: '壬丙', 子: '丙戊壬甲', 丑: '丙壬戊己' },
    壬: { 寅: '庚丙戊', 卯: '戊辛庚', 辰: '甲庚', 巳: '壬辛庚癸', 午: '癸庚辛', 未: '辛甲', 申: '戊丁', 酉: '甲庚', 戌: '甲丙', 亥: '戊丙庚', 子: '戊丙', 丑: '丙丁甲' },
    癸: { 寅: '辛丙', 卯: '庚辛', 辰: '丙辛甲', 巳: '辛', 午: '庚辛壬癸', 未: '庚辛壬癸', 申: '丁', 酉: '辛丙', 戌: '辛甲壬癸', 亥: '庚辛戊丁', 子: '丙辛', 丑: '丙丁' }
  };
  function tiaohou(dayGan, monthZhiIdx) {
    return (TIAOHOU[GAN[dayGan]] || {})[ZHI[monthZhiIdx]] || '';
  }

  // ---------- 流年 / 流月 ----------
  // 從 startYear 起 count 年的流年，附十神與太歲關係（相對出生年支/日支）
  function yearlyFortune(startYear, count, pillars) {
    const dayGan = pillars.day.ganIdx;
    const birthYearZhi = pillars.year.zhiIdx;
    const list = [];
    for (let i = 0; i < count; i++) {
      const y = startYear + i;
      const p = pillar(idx60(((y - 4) % 10 + 10) % 10, ((y - 4) % 12 + 12) % 12));
      const tags = [];
      if (p.zhiIdx === birthYearZhi) tags.push('值太歲（本命年）');
      if ((p.zhiIdx + 6) % 12 === birthYearZhi) tags.push('沖太歲');
      if (LIUHE[p.zhiIdx] === birthYearZhi) tags.push('合太歲');
      if (LIUHAI[p.zhiIdx] === birthYearZhi) tags.push('害太歲');
      if ((p.zhiIdx + 6) % 12 === pillars.day.zhiIdx) tags.push('沖日支');
      list.push({ year: y, ...p, tenGod: tenGod(dayGan, p.ganIdx), shengxiao: SHENGXIAO[p.zhiIdx], tags });
    }
    return list;
  }
  // 某流年的十二流月（節氣月，寅月起；附十神）
  function monthlyFortune(flowYear, pillars) {
    const dayGan = pillars.day.ganIdx;
    const yGan = ((flowYear - 4) % 10 + 10) % 10;
    const approx = ['2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '隔年1月'];
    const jie = ['立春', '驚蟄', '清明', '立夏', '芒種', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
    const list = [];
    for (let m = 0; m < 12; m++) {
      const stem = ((yGan % 5) * 2 + 2 + m) % 10;
      const p = pillar(idx60(stem, (m + 2) % 12));
      list.push({ ...p, jie: jie[m], approx: approx[m], tenGod: tenGod(dayGan, p.ganIdx) });
    }
    return list;
  }

  return {
    GAN, ZHI, SHENGXIAO, GAN_WUXING, ZHI_WUXING, GAN_YINYANG, ZHI_CANGGAN, NAYIN,
    WX_SHENG, WX_KE, wuxingCount, strength,
    pillar, idx60, dayPillar, yearPillar, monthPillar, hourPillar, fourPillars, tenGod, luck,
    branchRelations, tiaohou, yearlyFortune, monthlyFortune, zhiRelation, ganRelation, crossRelations
  };
})();
if (typeof module !== 'undefined') module.exports = Ganzhi;
