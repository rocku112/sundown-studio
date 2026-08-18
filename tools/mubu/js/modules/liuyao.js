/* 暮卜先知 · 六爻卜卦（京房納甲・文王卦） */
(() => {
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  // 八卦（bottom→top 三爻）
  const TRI = {
    乾: { lines: [1, 1, 1], wx: '金' }, 兌: { lines: [1, 1, 0], wx: '金' },
    離: { lines: [1, 0, 1], wx: '火' }, 震: { lines: [1, 0, 0], wx: '木' },
    巽: { lines: [0, 1, 1], wx: '木' }, 坎: { lines: [0, 1, 0], wx: '水' },
    艮: { lines: [0, 0, 1], wx: '土' }, 坤: { lines: [0, 0, 0], wx: '土' }
  };
  const triByLines = (l) => Object.keys(TRI).find(k => TRI[k].lines[0] === l[0] && TRI[k].lines[1] === l[1] && TRI[k].lines[2] === l[2]);

  // 京房納甲：各卦 6 地支序（初→上）＋天干（內/外）
  const NAJIA = {
    乾: { zhi: [0, 2, 4, 6, 8, 10], gan: ['甲', '壬'] }, // 子寅辰午申戌
    震: { zhi: [0, 2, 4, 6, 8, 10], gan: ['庚', '庚'] },
    坎: { zhi: [2, 4, 6, 8, 10, 0], gan: ['戊', '戊'] }, // 寅辰午申戌子
    艮: { zhi: [4, 6, 8, 10, 0, 2], gan: ['丙', '丙'] }, // 辰午申戌子寅
    坤: { zhi: [7, 5, 3, 1, 11, 9], gan: ['乙', '癸'] }, // 未巳卯丑亥酉
    巽: { zhi: [1, 11, 9, 7, 5, 3], gan: ['辛', '辛'] }, // 丑亥酉未巳卯
    離: { zhi: [3, 1, 11, 9, 7, 5], gan: ['己', '己'] }, // 卯丑亥酉未巳
    兌: { zhi: [5, 3, 1, 11, 9, 7], gan: ['丁', '丁'] }  // 巳卯丑亥酉未
  };

  // 生成京房八宮表：宮 → 8 卦（本一二三四五游歸），世爻位置
  const PALACE_ORDER = ['乾', '兌', '離', '震', '巽', '坎', '艮', '坤'];
  const PALACE_WX = { 乾: '金', 兌: '金', 離: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' };
  const WORLD_POS = [6, 1, 2, 3, 4, 5, 4, 3];          // 世爻（本一二三四五游歸）
  const FLIP = [[], [1], [1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5], [1, 2, 3, 5], [5]];

  let PALACE_MAP = null; // key: 6-line string → {palace, wx, world, resp}
  function buildPalaces() {
    PALACE_MAP = {};
    for (const pg of PALACE_ORDER) {
      const base = [...TRI[pg].lines, ...TRI[pg].lines];
      for (let i = 0; i < 8; i++) {
        const lines = [...base];
        for (const p of FLIP[i]) lines[p - 1] ^= 1;
        const world = WORLD_POS[i];
        const resp = world > 3 ? world - 3 : world + 3;
        PALACE_MAP[lines.join('')] = { palace: pg, wx: PALACE_WX[pg], world, resp };
      }
    }
  }

  // 六親（宮五行為我）
  const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  function liuqin(gongWx, yaoWx) {
    if (yaoWx === gongWx) return '兄弟';
    if (SHENG[yaoWx] === gongWx) return '父母';
    if (SHENG[gongWx] === yaoWx) return '子孫';
    if (KE[yaoWx] === gongWx) return '官鬼';
    return '妻財';
  }

  // 六神（依日干）
  const LIUSHEN = ['青龍', '朱雀', '勾陳', '螣蛇', '白虎', '玄武'];
  function liushenStart(dayGanIdx) {
    return [0, 0, 1, 1, 2, 3, 4, 4, 5, 5][dayGanIdx]; // 甲乙青龍…壬癸玄武
  }

  // 裝卦：回傳 6 爻（初→上）
  // ── 斷卦要素（依《增刪卜易》野鶴老人法）──
  // 旬空：日柱在六十甲子中的旬，該旬所缺兩支即空亡
  function xunKong(dayGanIdx, dayZhiIdx) {
    const start = ((dayZhiIdx - dayGanIdx) % 12 + 12) % 12; // 旬首地支（甲所在支）
    return [(start + 10) % 12, (start + 11) % 12];          // 旬末後兩支為空
  }
  // 四神：用神之外的原神（生用神）、忌神（剋用神）、仇神（剋原神＝生忌神）
  const LIUQIN_ORDER = ['父母', '兄弟', '子孫', '妻財', '官鬼'];
  function fourGods(useGod, gongWx) {
    // 以「六親相對關係」推：用神五行為基準
    const wxOf = (lq) => {
      if (lq === '兄弟') return gongWx;
      if (lq === '父母') return Object.keys(SHENG).find(k => SHENG[k] === gongWx);
      if (lq === '子孫') return SHENG[gongWx];
      if (lq === '妻財') return KE[gongWx];
      return Object.keys(KE).find(k => KE[k] === gongWx); // 官鬼＝剋我
    };
    const uWx = wxOf(useGod);
    const yuanWx = Object.keys(SHENG).find(k => SHENG[k] === uWx);  // 生用神
    const jiWx = Object.keys(KE).find(k => KE[k] === uWx);          // 剋用神
    const chouWx = Object.keys(KE).find(k => KE[k] === yuanWx);     // 剋原神
    const back = (wx) => LIUQIN_ORDER.find(lq => wxOf(lq) === wx);
    return { uWx, 原神: back(yuanWx), 忌神: back(jiWx), 仇神: back(chouWx) };
  }
  // 進神／退神：動爻變出同五行且地支順進為進神、後退為退神
  // 進神序：亥→子(水)、寅→卯(木)、巳→午(火)、申→酉(金)、丑→辰→未→戌(土)
  const JIN_TUI = { 11: 0, 2: 3, 5: 6, 8: 9, 1: 4, 4: 7, 7: 10 };
  function jinTui(y, by) {
    if (y.wx !== by.wx) return null;
    if (JIN_TUI[y.zhiIdx] === by.zhiIdx) return { t: '化進神', good: true, why: '動爻化出同五行而地支順進，主事情向前推展、力量增長，所求之事漸入佳境。' };
    if (JIN_TUI[by.zhiIdx] === y.zhiIdx) return { t: '化退神', good: false, why: '動爻化出同五行而地支後退，主事情退縮回頭、力量遞減，宜守不宜進。' };
    return null;
  }
  // 六沖卦／六合卦（本宮八純與特定卦為六沖；八組為六合）
  const LIUCHONG = ['乾為天', '坤為地', '震為雷', '巽為風', '坎為水', '離為火', '艮為山', '兌為澤', '天雷無妄', '雷天大壯'];
  const LIUHE_HEX = ['地天泰', '天地否', '雷地豫', '地雷復', '澤水困', '水澤節', '火山旅', '山火賁'];
  function hexTypeOf(name) {
    if (!name) return null;
    if (LIUCHONG.some(n => name.includes(n.replace('為', '')) || name === n)) return { t: '六沖卦', good: false, why: '六沖卦主沖散、變動不定——求財求合多不成，但若問疾病、訟事、脫困則反吉（沖散災厄）。' };
    if (LIUHE_HEX.includes(name)) return { t: '六合卦', good: true, why: '六合卦主和合、事情易成而持久——求財求婚問合作皆吉，但問疾病訟事則主纏綿難解。' };
    return null;
  }

  function dressHexagram(lines) {
    if (!PALACE_MAP) buildPalaces();
    const lower = triByLines(lines.slice(0, 3));
    const upper = triByLines(lines.slice(3, 6));
    const info = PALACE_MAP[lines.join('')];
    const yaos = [];
    for (let i = 0; i < 6; i++) {
      const tri = i < 3 ? lower : upper;
      const nj = NAJIA[tri];
      const zhiIdx = nj.zhi[i]; // 初三用0-2，四六用3-5（序列已對齊）
      const gan = i < 3 ? nj.gan[0] : nj.gan[1];
      const wx = ZHI_WX[zhiIdx];
      yaos.push({
        pos: i + 1, yang: lines[i] === 1,
        gan, zhi: ZHI[zhiIdx], zhiIdx, wx,
        liuqin: liuqin(info.wx, wx)
      });
    }
    return { lower, upper, info, yaos };
  }

  // 卦典（取卦名卦辭）
  let HEXKEY = null;
  function hexData(lower, upper) {
    if (!HEXKEY) { HEXKEY = {}; HEXAGRAM_DATA.forEach(h => { HEXKEY[h.upper + h.lower] = h; }); }
    return HEXKEY[upper + lower];
  }

  const QUESTIONS = [
    { id: 'wealth', name: '求財・生意', god: '妻財' },
    { id: 'career', name: '事業・功名', god: '官鬼' },
    { id: 'love', name: '感情・婚姻', godF: '官鬼', godM: '妻財' },
    { id: 'study', name: '考試・文書・房產', god: '父母' },
    { id: 'child', name: '子女・求福・健康', god: '子孫' },
    { id: 'self', name: '問自身・綜合', god: '世' },
    { id: 'lost', name: '尋人・失物', god: '妻財' }
  ];

  // 三錢起卦：每爻 6老陰動 7少陽 8少陰 9老陽動
  function castLine() {
    let s = 0;
    for (let i = 0; i < 3; i++) s += Math.random() < 0.5 ? 3 : 2; // 字3背2
    return s; // 6-9
  }

  function render(el) {
    el.innerHTML = `
      <div class="panel">
        <h3>搖卦</h3>
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field" style="flex:1"><label>所問之事</label>
            <input class="ly-q" placeholder="例：這筆投資能獲利嗎？" style="width:100%"></div>
          <div class="field"><label>問事類型（定用神）</label>
            <select class="ly-cat">${QUESTIONS.map(q => `<option value="${q.id}">${q.name}</option>`).join('')}</select></div>
          <div class="field"><label>性別</label><select class="ly-g"><option value="M">男</option><option value="F">女</option></select></div>
        </div>
        <button class="btn" id="ly-go">${Icons.svg('liuyao')} 搖卦（三錢六擲）</button>
        <p class="muted" style="margin-top:10px">以此刻日辰起卦，京房納甲裝卦，取六親、世應、六神、動爻，依所問定用神。</p>
      </div>
      <div id="ly-result"></div>`;

    el.querySelector('#ly-go').addEventListener('click', () => {
      const resEl = el.querySelector('#ly-result');
      resEl.innerHTML = '';
      const question = el.querySelector('.ly-q').value.trim();
      const cat = QUESTIONS.find(q => q.id === el.querySelector('.ly-cat').value);
      const gender = el.querySelector('.ly-g').value;
      const useGod = cat.god || (gender === 'F' ? cat.godF : cat.godM);

      // 六擲
      const throws = [castLine(), castLine(), castLine(), castLine(), castLine(), castLine()];
      const benLines = throws.map(v => (v === 7 || v === 9) ? 1 : 0);
      const moving = throws.map(v => v === 6 || v === 9); // 動爻
      const bianLines = benLines.map((l, i) => moving[i] ? 1 - l : l);

      const now = new Date();
      const dp = Ganzhi.dayPillar(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const mp = Ganzhi.monthPillar(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const ben = dressHexagram(benLines);
      const bian = dressHexagram(bianLines);
      const benHex = hexData(ben.lower, ben.upper);
      const bianHex = moving.some(Boolean) ? hexData(bian.lower, bian.upper) : null;

      const kongNow = xunKong(dp.ganIdx, dp.zhiIdx); // 本旬空亡（爻表標記與斷卦共用）
      // 六神起爻
      const lsStart = liushenStart(dp.ganIdx);
      const yaoRows = [];
      for (let i = 5; i >= 0; i--) { // 上→初 顯示
        const y = ben.yaos[i];
        const ls = LIUSHEN[(lsStart + i) % 6];
        const isShi = ben.info.world === i + 1;
        const isYing = ben.info.resp === i + 1;
        const mv = moving[i];
        const by = bian.yaos[i];
        const symbol = y.yang ? '▬▬▬▬▬▬▬' : '▬▬▬　▬▬▬';
        yaoRows.push(`<tr${useGod !== '世' && y.liuqin === useGod ? ' style="background:rgba(232,184,75,.14)"' : ''}>
          <td class="muted" style="font-size:12px">${ls}</td>
          <td>${y.liuqin}</td>
          <td><b>${y.gan}${y.zhi}</b><small class="muted">${y.wx}</small>${kongNow.includes(y.zhiIdx) ? '<small style="color:var(--cinnabar)"> 空</small>' : ''}</td>
          <td style="font-family:monospace;letter-spacing:-1px">${symbol} ${mv ? (y.yang ? '○' : '×') : ''}</td>
          <td>${isShi ? '<b style="color:var(--cinnabar)">世</b>' : isYing ? '<b style="color:var(--navy)">應</b>' : ''}</td>
          <td class="muted">${mv ? `→ ${by.gan}${by.zhi}${by.liuqin}` : ''}</td>
        </tr>`);
      }

      // 用神爻
      let useYaos = [];
      if (useGod === '世') useYaos = [ben.yaos[ben.info.world - 1]];
      else useYaos = ben.yaos.filter(y => y.liuqin === useGod);
      // ── 斷卦（《增刪卜易》：旬空、月破、旺衰、四神、進退神、卦體）──
      const kong = kongNow;
      const mWx = Ganzhi.ZHI_WUXING[mp.zhiIdx], dWx = ZHI_WX[dp.zhiIdx];
      const fg = fourGods(useGod === '世' ? '兄弟' : useGod, ben.info.wx);
      // 進退神（所有動爻）
      const jtList = [];
      for (let i = 0; i < 6; i++) if (moving[i]) { const r = jinTui(ben.yaos[i], bian.yaos[i]); if (r) jtList.push({ pos: i + 1, y: ben.yaos[i], by: bian.yaos[i], r }); }
      const benType = hexTypeOf(benHex && benHex.name), bianType = hexTypeOf(bianHex && bianHex.name);
      // 用神狀態
      let useNote, useState = [];
      const y0 = useGod === '世' ? ben.yaos[ben.info.world - 1] : useYaos[0];
      if (y0) {
        if (mWx === y0.wx) useState.push({ t: '臨月建', good: true, why: '用神與月建同五行，得月令之氣最旺，所求之事根基穩固。' });
        else if (SHENG[mWx] === y0.wx) useState.push({ t: '得月建生扶', good: true, why: '月建生用神，事有長輩、環境或大勢之助。' });
        else if (KE[mWx] === y0.wx) useState.push({ t: '受月建剋', good: false, why: '月令剋用神，大環境不利，力量受壓制，事多阻滯。' });
        if ((mp.zhiIdx + 6) % 12 === y0.zhiIdx) useState.push({ t: '月破', good: false, why: '用神被月建所沖為「月破」，主根基破損、所求之事難成，需待出月方有轉機。' });
        if (dWx === y0.wx || SHENG[dWx] === y0.wx) useState.push({ t: '得日辰生扶', good: true, why: '日辰為斷卦之主宰，日生用神則當下有助力，事情推得動。' });
        else if (KE[dWx] === y0.wx) useState.push({ t: '受日辰剋', good: false, why: '日辰剋用神，眼下阻力直接而具體，宜緩不宜急。' });
        if ((dp.zhiIdx + 6) % 12 === y0.zhiIdx) useState.push({ t: '日破（暗動則吉）', good: false, why: '日辰沖用神：靜爻逢沖為「暗動」反主暗中有動機；若用神本旺則沖起有力，若衰則為破。' });
        if (kong.includes(y0.zhiIdx)) useState.push({ t: '旬空', good: false, why: '用神落旬空，主所求之事目前落空、時機未到或對方無心；須待「出空」（過此旬或逢沖實）之日方可論成。' });
      }
      if (useGod === '世') useNote = `以世爻（第${ben.info.world}爻 ${y0.gan}${y0.zhi}${y0.wx}）為用神，代表你自身。`;
      else if (!useYaos.length) useNote = `本卦不見<b>${useGod}</b>（用神不上卦），主所求之事機緣未顯或需向他處尋，宜參伏神。`;
      else useNote = `用神取<b>${useGod}</b>：${useYaos.map(y => `第${y.pos}爻 ${y.gan}${y.zhi}${y.wx}${moving[y.pos - 1] ? '（動）' : ''}`).join('、')}。`;
      // 綜合斷語
      const goodN = useState.filter(s => s.good).length, badN = useState.filter(s => !s.good).length;
      const verdict = !y0 ? '用神不上卦，暫難論成敗，宜另擇時再卜。'
        : kong.includes(y0.zhiIdx) ? '用神旬空為第一要義——目前時機未到，所問之事宜等待「出空」之後再看，強求無益。'
        : goodN > badN ? '用神整體得生扶而有力，所問之事根基尚可、趨向成就，宜順勢推進。'
        : badN > goodN ? '用神受剋洩而力弱，所問之事阻力較大、成之不易，宜守成待時或另闢蹊徑。'
        : '用神旺衰參半，事情成敗在人為——關鍵看動爻與世應的實際生剋，宜盡人事而後聽天命。';

      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <div style="text-align:center">
          <div class="muted">${question ? `所問：${question} · ` : ''}${cat.name}</div>
          <div class="muted">${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} · ${mp.name}月 ${dp.name}日 起卦</div>
          <div style="font-size:20px;color:var(--navy);font-weight:700;margin:6px 0">
            ${benHex ? benHex.name : ben.upper + ben.lower}（${ben.info.palace}宮）
            ${bianHex ? ` <span class="muted" style="font-size:15px">之 ${bianHex.name}</span>` : ''}
          </div>
          <span class="tag gold">${ben.info.palace}宮${ben.info.wx}</span>
          <span class="tag">世在${ben.info.world}爻</span>
          <span class="tag">${moving.filter(Boolean).length} 個動爻</span>
        </div>
        <table class="chart" style="margin-top:12px">
          <tr><th>六神</th><th>六親</th><th>納甲</th><th>卦爻</th><th>世應</th><th>變爻</th></tr>
          ${yaoRows.join('')}
        </table>
        <div class="aspect" style="margin-top:6px"><b>用神判定</b>${useNote}</div>
        <h4 style="margin-top:12px">斷卦要素（依《增刪卜易》）</h4>
        <p><span class="tag">本旬空亡：${ZHI[kong[0]]}${ZHI[kong[1]]}</span><span class="tag">月建 ${Ganzhi.ZHI[mp.zhiIdx]}${mWx}</span><span class="tag">日辰 ${ZHI[dp.zhiIdx]}${dWx}</span>${benType ? `<span class="tag ${benType.good ? 'gold' : ''}" ${benType.good === false ? 'style="color:var(--cinnabar)"' : ''}>本卦${benType.t}</span>` : ''}${bianType ? `<span class="tag">變卦${bianType.t}</span>` : ''}</p>
        ${useState.length ? useState.map(s => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${s.good ? 'var(--gold-mid)' : 'var(--cinnabar)'}"><b>用神${s.t}</b><p style="margin-top:3px">${s.why}</p></div>`).join('') : '<p class="muted" style="margin-top:6px">用神不受月建日辰明顯生剋，處於平勢，力量端看動爻牽引。</p>'}
        ${y0 ? `<div class="aspect" style="margin-top:6px"><b>四神取用（用神${useGod === '世' ? '·世爻' : useGod}，五行${fg.uWx}）</b>
          <p style="margin-top:3px">原神＝<b>${fg.原神}</b>（生用神，出現且旺則助事成）；忌神＝<b style="color:var(--cinnabar)">${fg.忌神}</b>（剋用神，發動則壞事）；仇神＝<b>${fg.仇神}</b>（剋原神、助忌神，宜靜不宜動）。斷卦時看這三者在卦中是否發動、旺衰如何，最能定成敗。</p></div>` : ''}
        ${jtList.length ? jtList.map(x => `<div class="aspect" style="margin-top:6px;border-left:3px solid ${x.r.good ? 'var(--gold-mid)' : 'var(--cinnabar)'}"><b>第${x.pos}爻 ${x.y.zhi}${x.y.wx} → ${x.by.zhi}${x.by.wx}・${x.r.t}</b><p style="margin-top:3px">${x.r.why}</p></div>`).join('') : ''}
        ${benType ? `<div class="aspect" style="margin-top:6px;border-left:3px solid ${benType.good ? 'var(--gold-mid)' : 'var(--cinnabar)'}"><b>卦體：${benType.t}</b><p style="margin-top:3px">${benType.why}</p></div>` : ''}
        <div class="aspect" style="margin-top:8px;border-left:3px solid var(--gold-bright)"><b>綜合初斷</b><p style="margin-top:3px">${verdict}</p></div>
        ${benHex ? `<h4>本卦・${benHex.name}</h4><p class="poem" style="font-size:15px">${benHex.ci}</p><p>${benHex.duan}</p>` : ''}
        ${bianHex ? `<h4>變卦・${bianHex.name}（事之終局）</h4><p>${bianHex.duan}</p>` : '<p class="muted" style="margin-top:8px">六爻安靜無動爻——以本卦卦辭直斷，事態穩定不變。</p>'}
        <p class="muted" style="margin-top:10px">※ 斷卦要素依<b>《增刪卜易》</b>（野鶴老人）：以日辰、月建定用神旺衰，旬空、月破為第一要義，四神（原神／忌神／仇神）定成敗，動爻進退神看趨勢。伏神、飛神與細部應期請用 AI 深度解讀。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請以六爻（京房納甲・文王卦）為以下卦例斷卦。
所問之事：${question || '（未明說，作綜合斷）'}（問事類型：${cat.name}，用神取${useGod}）
起卦時間：${mp.name}月 ${dp.name}日
本卦：${benHex ? benHex.name : ben.upper + ben.lower}，屬${ben.info.palace}宮（${ben.info.wx}），世在${ben.info.world}爻、應在${ben.info.resp}爻
六爻裝配（初→上）：
${ben.yaos.map((y, i) => `第${i + 1}爻 ${LIUSHEN[(lsStart + i) % 6]} ${y.liuqin} ${y.gan}${y.zhi}(${y.wx})${moving[i] ? (y.yang ? ' ○動→' + bian.yaos[i].gan + bian.yaos[i].zhi + bian.yaos[i].liuqin : ' ×動→' + bian.yaos[i].gan + bian.yaos[i].zhi + bian.yaos[i].liuqin) : ''}${ben.info.world === i + 1 ? ' 【世】' : ''}${ben.info.resp === i + 1 ? ' 【應】' : ''}`).join('\n')}
${bianHex ? `變卦：${bianHex.name}` : '（無動爻，卦靜）'}
本站已判斷卦要素（依《增刪卜易》）：本旬空亡＝${ZHI[kongNow[0]]}${ZHI[kongNow[1]]}；用神狀態＝${useState.length ? useState.map(s => s.t).join('、') : '不受月日明顯生剋（平勢）'}；四神＝原神${fg.原神}／忌神${fg.忌神}／仇神${fg.仇神}${jtList.length ? `；動爻${jtList.map(x => `第${x.pos}爻${x.r.t}`).join('、')}` : ''}${benType ? `；本卦為${benType.t}` : ''}。內建初斷：${verdict}
請以《增刪卜易》之法深斷：1) 印證上列用神旺衰判定（尤其旬空、月破是否成立、何時出空）2) 原神、忌神、仇神在卦中是否發動、旺衰如何，據以定事之成敗 3) 動爻與變爻的生剋沖合（含回頭生剋、進退神）4) 世應關係看我方與對方的態度 5) 六神所臨的象意 6) 綜合斷所問之事的吉凶成敗，並推定<b>應期</b>（何月何日應驗，以用神逢值、逢沖、出空之期論）7) 給出實際建議。`);
    });
  }

  App.register({
    id: 'liuyao',
    icon: Icons.svg('liuyao'),
    title: '六爻卜卦',
    desc: '文王卦・京房納甲，三錢起卦，六親世應六神俱全，依問事定用神。',
    render
  });
})();
