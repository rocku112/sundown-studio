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
        <button class="btn" id="ly-go">🪙 搖卦（三錢六擲）</button>
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
          <td><b>${y.gan}${y.zhi}</b><small class="muted">${y.wx}</small></td>
          <td style="font-family:monospace;letter-spacing:-1px">${symbol} ${mv ? (y.yang ? '○' : '×') : ''}</td>
          <td>${isShi ? '<b style="color:var(--cinnabar)">世</b>' : isYing ? '<b style="color:var(--navy)">應</b>' : ''}</td>
          <td class="muted">${mv ? `→ ${by.gan}${by.zhi}${by.liuqin}` : ''}</td>
        </tr>`);
      }

      // 用神爻
      let useYaos = [];
      if (useGod === '世') useYaos = [ben.yaos[ben.info.world - 1]];
      else useYaos = ben.yaos.filter(y => y.liuqin === useGod);
      let useNote;
      if (useGod === '世') useNote = `以世爻（${ben.yaos[ben.info.world - 1].gan}${ben.yaos[ben.info.world - 1].zhi}${ben.yaos[ben.info.world - 1].wx}）為用神，代表你自身。`;
      else if (!useYaos.length) useNote = `本卦不見${useGod}（用神不上卦），主所求之事機緣未顯或需向他處尋，可參伏神。`;
      else {
        const uy = useYaos.map(y => `第${y.pos}爻 ${y.gan}${y.zhi}${y.wx}${moving[y.pos - 1] ? '（動）' : ''}`).join('、');
        // 用神旺衰（以月建、日辰生剋簡判）
        const mWx = Ganzhi.ZHI_WUXING[mp.zhiIdx], dWx = ZHI_WX[dp.zhiIdx];
        const y0 = useYaos[0];
        const help = [];
        if (mWx === y0.wx || SHENG[mWx] === y0.wx) help.push('得月建生扶');
        if (Ganzhi.ZHI[mp.zhiIdx] && (mp.zhiIdx + 6) % 12 === y0.zhiIdx) help.push('月破');
        if (dWx === y0.wx || SHENG[dWx] === y0.wx) help.push('得日辰生扶');
        if (KE[dWx] === y0.wx) help.push('受日辰剋');
        useNote = `用神取<b>${useGod}</b>：${uy}。${help.length ? '旺衰：' + help.join('、') + '。' : ''}`;
      }

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
        ${benHex ? `<h4>本卦・${benHex.name}</h4><p class="poem" style="font-size:15px">${benHex.ci}</p><p>${benHex.duan}</p>` : ''}
        ${bianHex ? `<h4>變卦・${bianHex.name}（事之終局）</h4><p>${bianHex.duan}</p>` : '<p class="muted" style="margin-top:8px">六爻安靜無動爻——以本卦卦辭直斷，事態穩定不變。</p>'}
        <p class="muted" style="margin-top:10px">※ 內建呈現卦爻裝配與用神旺衰要點；完整斷卦（用神、原神、忌神、伏飛、進退神、六合六沖…）建議用 AI 深度解讀。</p>
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
請依用神旺衰（月建${mp.name}、日辰${dp.name}的生剋）、動爻生剋沖合、世應關係，判斷所問之事的吉凶成敗與應期，並給出建議。`);
    });
  }

  App.register({
    id: 'liuyao',
    icon: '🪙',
    title: '六爻卜卦',
    desc: '文王卦・京房納甲，三錢起卦，六親世應六神俱全，依問事定用神。',
    render
  });
})();
