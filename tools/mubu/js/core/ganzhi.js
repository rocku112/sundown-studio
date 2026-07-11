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

  return {
    GAN, ZHI, SHENGXIAO, GAN_WUXING, ZHI_WUXING, GAN_YINYANG, ZHI_CANGGAN, NAYIN,
    WX_SHENG, WX_KE,
    pillar, idx60, dayPillar, yearPillar, monthPillar, hourPillar, fourPillars, tenGod, luck
  };
})();
if (typeof module !== 'undefined') module.exports = Ganzhi;
