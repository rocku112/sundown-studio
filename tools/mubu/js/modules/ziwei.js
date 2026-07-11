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
    const month = lunar.month; // 閏月以本月計（簡化）
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

    // 流年：今年太歲所在宮
    const nowYear = new Date().getFullYear();
    const liunianZhi = ((nowYear - 4) % 12 + 12) % 12;

    return {
      mingIdx, shenIdx, ziweiIdx, ju, juName, palaces, hua, stars,
      daxianForward, liunianZhi, nowYear,
      mingzhu: MINGZHU[mingIdx], shenzhu: SHENZHU[yz]
    };
  }

  // 4x4 命盤版位：宮支 → grid 位置
  const GRID_POS = { 5: 1, 6: 2, 7: 3, 8: 4, 4: 5, 9: 8, 3: 9, 10: 12, 2: 13, 1: 14, 0: 15, 11: 16 };

  function render(el) {
    const bf = App.birthForm({ gender: true, time: true });
    el.innerHTML = `
      <div class="panel">
        <h3>輸入出生資料</h3>
        ${bf.html}
        <button class="btn" id="zw-go" style="margin-top:14px">🌟 排 盤</button>
        <p class="muted" style="margin-top:8px">請填國曆生日，系統自動換算農曆（閏月以本月計）。安星依中州派通行規則。</p>
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

      // 命盤格
      const cells = new Array(17).fill('');
      for (const p of c.palaces) {
        const isMing = p.zhi === c.mingIdx;
        const isShen = p.zhi === c.shenIdx;
        const isLiunian = p.zhi === c.liunianZhi;
        const mains = p.main.map(s => `${s}<small style="color:var(--ink-faint)">${brightOf(s, p.zhi)}</small>${c.hua[s] ? `<span class="hua">化${c.hua[s]}</span>` : ''}`).join(' ') || '<span class="muted">（借對宮）</span>';
        const minors = p.minor.map(s => `${s}${c.hua[s] ? `<span class="hua">化${c.hua[s]}</span>` : ''}`).join(' ');
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
        <p class="muted">※ 內建解讀僅就命宮主星簡述；完整十二宮互涉、格局與大限流年，請使用 AI 深度解讀。</p>
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
${c.nowYear}年流年命宮在${Ganzhi.ZHI[c.liunianZhi]}。
請分析：1) 命身宮與整體格局（注意主星廟旺利陷的強弱） 2) 性格特質 3) 事業官祿 4) 財帛 5) 感情婚姻（夫妻宮）6) 目前所行大限與${c.nowYear}流年運勢 7) 需注意的宮位與化忌影響，並給出人生建議。`);
    });
  }

  // 供三合一綜合命盤共用
  window.ZiweiEngine = { buildChart, STAR_DESC, PALACE_NAMES };

  App.register({
    id: 'ziwei',
    icon: '🌟',
    title: '紫微斗數',
    desc: '安命身宮、十四主星、輔煞諸星、生年四化，完整十二宮命盤。',
    render
  });
})();
