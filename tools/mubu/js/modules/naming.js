/* 暮卜先知 · 姓名學（三才五格＋81數理＋生肖＋八字喜用） */
(() => {
  // 81 數理（吉／半吉／凶＋四字斷）
  const JI = new Set([1, 3, 5, 6, 7, 8, 11, 13, 15, 16, 17, 18, 21, 23, 24, 25, 29, 31, 32, 33, 35, 37, 39, 41, 45, 47, 48, 52, 57, 61, 63, 65, 67, 68, 81]);
  const BAN = new Set([26, 27, 30, 38, 42, 49, 50, 51, 53, 55, 58, 71, 73, 75, 77, 78]);
  const SHULI = {
    1: '宏業榮昌', 2: '一身孤節', 3: '進取如意', 4: '身遭凶變', 5: '福祿長壽', 6: '安穩餘慶', 7: '剛毅果斷', 8: '意志剛健', 9: '興盡凶始', 10: '萬事終局',
    11: '穩健吉順', 12: '意志薄弱', 13: '智略超群', 14: '淪落天涯', 15: '福壽圓滿', 16: '貴人相助', 17: '突破萬難', 18: '有志竟成', 19: '風雲蔽日', 20: '非業破運',
    21: '明月中天', 22: '秋草逢霜', 23: '旭日東昇', 24: '家門餘慶', 25: '資性英敏', 26: '變怪奇異', 27: '欲望無止', 28: '闊水浮萍', 29: '智謀兼備', 30: '吉凶參半',
    31: '智勇得志', 32: '僥倖多望', 33: '家門隆昌', 34: '破家亡身', 35: '溫和平靜', 36: '波瀾重疊', 37: '權威顯達', 38: '磨鐵成針', 39: '富貴榮華', 40: '謹慎保安',
    41: '德望高大', 42: '寒蟬悲鳴', 43: '外祥內苦', 44: '愁眉難展', 45: '順風揚帆', 46: '羅網繫身', 47: '開花結果', 48: '德智兼備', 49: '吉凶難分', 50: '一成一敗',
    51: '盛衰交加', 52: '先見之明', 53: '外榮內憂', 54: '多難悲運', 55: '外美內苦', 56: '浪裡行舟', 57: '寒雪青松', 58: '先苦後甘', 59: '寒蟬悲風', 60: '無謀之災',
    61: '名利雙收', 62: '基礎虛弱', 63: '富貴繁榮', 64: '骨肉分離', 65: '富貴長壽', 66: '內外不和', 67: '通達順遂', 68: '發明奏功', 69: '非業精神', 70: '家運衰退',
    71: '養神耐勞', 72: '先甘後苦', 73: '志高力微', 74: '秋葉落寞', 75: '守則可安', 76: '傾覆離散', 77: '先苦後甜', 78: '晚境淒涼', 79: '挽回乏力', 80: '凶星入度', 81: '還元復始'
  };
  const luckOf = (n) => { n = ((n - 1) % 81) + 1; return JI.has(n) ? '吉' : BAN.has(n) ? '半吉' : '凶'; };
  const luckTag = (n) => {
    const l = luckOf(n);
    const c = l === '吉' ? 'var(--gold-deep)' : l === '半吉' ? 'var(--ink-dim)' : 'var(--cinnabar)';
    return `<span style="color:${c}">${n}（${l}・${SHULI[((n - 1) % 81) + 1]}）</span>`;
  };

  // 數字尾數 → 五行（1,2木 3,4火 5,6土 7,8金 9,0水）
  const numWx = (n) => ['水', '木', '木', '火', '火', '土', '土', '金', '金', '水'][n % 10];
  const wxSheng = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const wxKe = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  function sancaiPair(a, b) { // a 生/同 b？
    if (a === b) return { s: '同', good: true };
    if (wxSheng[a] === b || wxSheng[b] === a) return { s: '生', good: true };
    return { s: '剋', good: false };
  }

  // 生肖宜忌字根（民俗簡表，供加減分參考）
  const ZODIAC_TAGS = {
    0: { like: ['宀', '米', '豆', '金', '王', '月'], dislike: ['日', '火', '馬', '山'] },
    1: { like: ['艹', '禾', '米', '宀', '氵'], dislike: ['日', '王', '馬', '衣', '示'] },
    2: { like: ['山', '木', '王', '肉', '馬', '衣'], dislike: ['日', '虫', '辶', '田'] },
    3: { like: ['艹', '禾', '米', '宀', '木', '月'], dislike: ['心', '忄', '日', '金'] },
    4: { like: ['氵', '日', '月', '王', '馬', '雨'], dislike: ['山', '艹', '宀', '虫', '田'] },
    5: { like: ['口', '宀', '艹', '木', '田', '金', '肉'], dislike: ['日', '氵', '亻', '豆'] },
    6: { like: ['艹', '豆', '米', '木', '衣', '糸'], dislike: ['氵', '山', '田', '車', '石'] },
    7: { like: ['艹', '米', '禾', '木', '口', '足'], dislike: ['心', '忄', '王', '氵', '車'] },
    8: { like: ['木', '宀', '口', '王', '亻', '山', '氵'], dislike: ['金', '虫', '火', '豆', '田'] },
    9: { like: ['米', '豆', '虫', '山', '宀', '金', '禾'], dislike: ['刀', '心', '忄', '日', '氵', '馬'] },
    10: { like: ['亻', '宀', '肉', '心', '忄', '馬'], dislike: ['日', '雨', '木', '言', '米', '豆'] },
    11: { like: ['豆', '米', '宀', '口', '肉', '月', '氵', '金'], dislike: ['示', '刀', '力', '石', '辶', '馬'] }
  };

  const charMap = {};
  function ensureMap() {
    if (!Object.keys(charMap).length && typeof NAME_CHARS !== 'undefined') {
      NAME_CHARS.forEach(c => { charMap[c.c] = c; });
    }
  }
  function strokeOf(ch) {
    ensureMap();
    if (typeof SURNAME_STROKES !== 'undefined' && SURNAME_STROKES[ch]) return SURNAME_STROKES[ch];
    if (charMap[ch]) return charMap[ch].k;
    if (typeof KangxiStrokes !== 'undefined') return KangxiStrokes.of(ch); // 康熙筆劃大表 fallback（分析用）
    return null;
  }

  // 五格計算：surStrokes 陣列（1-2字）、nameStrokes 陣列（1-2字）
  function fiveGrids(surStrokes, nameStrokes) {
    const s1 = surStrokes[0], s2 = surStrokes[1] || 0;
    const n1 = nameStrokes[0], n2 = nameStrokes[1] || 0;
    const tian = surStrokes.length === 2 ? s1 + s2 : s1 + 1;
    const ren = (surStrokes.length === 2 ? s2 : s1) + n1;
    const di = nameStrokes.length === 2 ? n1 + n2 : n1 + 1;
    const zong = s1 + s2 + n1 + n2;
    const wai = (surStrokes.length === 2 ? s1 : 1) + (nameStrokes.length === 2 ? n2 : 1);
    const sc = [numWx(tian), numWx(ren), numWx(di)];
    const tr = sancaiPair(sc[0], sc[1]);
    const rd = sancaiPair(sc[1], sc[2]);
    return { tian, ren, di, zong, wai, sancai: sc, sancaiGood: tr.good && rd.good, tr, rd };
  }
  function gridScore(g) {
    let s = 0;
    for (const [n, w] of [[g.ren, 3], [g.zong, 3], [g.di, 2], [g.wai, 1], [g.tian, 0.5]]) {
      const l = luckOf(n);
      s += l === '吉' ? w : l === '半吉' ? w * 0.4 : -w;
    }
    if (g.sancaiGood) s += 3; else if (!g.tr.good && !g.rd.good) s -= 3; else s -= 1;
    return s;
  }

  // 喜用五行（同八字模組的簡化法）
  function likeWxOf(y, m, d, hh) {
    const p = Ganzhi.fourPillars(y, m, d, hh);
    const me = p.day.ganWx;
    const shengMe = Object.entries(wxSheng).find(([k, v]) => v === me)[0];
    let score = 0, total = 0;
    for (const [wx, w] of [[p.year.ganWx, 1], [p.month.ganWx, 1], [p.hour.ganWx, 1], [p.year.zhiWx, 1], [p.month.zhiWx, 2.5], [p.day.zhiWx, 1], [p.hour.zhiWx, 1]]) {
      total += w;
      if (wx === me || wx === shengMe) score += w;
    }
    const strong = score / total >= 0.5;
    const wxCount = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    for (const k of ['year', 'month', 'day', 'hour']) { wxCount[p[k].ganWx]++; wxCount[p[k].zhiWx]++; }
    return { like: strong ? wxSheng[me] : shengMe, strong, pillars: p, wxCount, missing: Object.entries(wxCount).filter(([k, v]) => v === 0).map(([k]) => k) };
  }

  function gridsHTML(g, surname, name) {
    return `<table class="chart">
      <tr><th>天格</th><th>人格<span class="muted">（主運）</span></th><th>地格</th><th>外格</th><th>總格</th></tr>
      <tr>
        <td>${luckTag(g.tian)}</td><td>${luckTag(g.ren)}</td><td>${luckTag(g.di)}</td><td>${luckTag(g.wai)}</td><td>${luckTag(g.zong)}</td>
      </tr></table>
      <p style="text-align:center">三才：<b style="color:${g.sancaiGood ? 'var(--gold-deep)' : 'var(--cinnabar)'}">${g.sancai.join(' ')}（天${g.tr.s}人、人${g.rd.s}地${g.sancaiGood ? '，相生大吉' : g.tr.good || g.rd.good ? '，半吉' : '，相剋不吉'}）</b></p>`;
  }

  // ---------- 三才五格詳批 ----------
  const REN_TRAIT = {
    木: '仁厚正直、有上進心與同情心，做事積極、講原則；個性略帶固執，認定的方向不易轉彎。',
    火: '熱情外向、行動力強、光明磊落，有禮而重面子；性子偏急，宜修煉耐性與沉澱。',
    土: '敦厚穩重、誠信踏實、重承諾與信用，是可靠的中流砥柱；稍嫌保守，變通與冒險是課題。',
    金: '果決剛毅、重義氣有決斷、執行力強，講是非分明；個性稜角較硬，言語宜柔軟圓融。',
    水: '聰明機智、善謀略、應變靈活、交際手腕佳；心思流動、情緒較敏感，需要定性與專注。'
  };
  const WAI_NOTE = {
    木: '外緣正派、朋友多為君子之交，社交講義氣。', 火: '外緣熱絡、人脈廣、易成焦點，宜防交淺言深。',
    土: '外緣穩定、貴人多為長輩實力派，重誠信。', 金: '外緣講原則、易得專業圈認同，稍顯距離感。',
    水: '外緣活絡、八面玲瓏、桃花與人脈皆旺，宜辨真心。'
  };
  function detailHTML(g) {
    const renWx = numWx(g.ren), waiWx = numWx(g.wai);
    const rows = [
      ['人格 · 主運（性格核心・中年運）', `${g.ren} ${luckOf(g.ren)}（${renWx}）`, `${REN_TRAIT[renWx]}人格是姓名的靈魂，主 25-45 歲的中年運與一生性格基調。`],
      ['地格 · 前運（基礎運・少年至中年前）', `${g.di} ${luckOf(g.di)}（${numWx(g.di)}）`, `主 36 歲前的基礎運、學業、與部屬子女的緣分。${luckOf(g.di) === '吉' ? '基礎穩固，早年運勢有力。' : luckOf(g.di) === '凶' ? '早年較辛勞，宜穩紮穩打、勿躁進。' : '早年運勢平順中帶波折。'}`],
      ['總格 · 後運（晚年運・事業成就）', `${g.zong} ${luckOf(g.zong)}（${numWx(g.zong)}）`, `主 36 歲後的後半生總體成就與晚年境遇。${luckOf(g.zong) === '吉' ? '後運亨通，越老越有福。' : luckOf(g.zong) === '凶' ? '晚運需留意健康與財務，宜及早規劃。' : '後運平穩，守成可安。'}`],
      ['外格 · 副運（社交・外在助力）', `${g.wai} ${luckOf(g.wai)}（${waiWx}）`, `主人際、社交與外在機運。${WAI_NOTE[waiWx]}`],
      ['天格 · 祖運（先天・影響較弱）', `${g.tian} ${luckOf(g.tian)}（${numWx(g.tian)}）`, '承自姓氏，代表先天與祖上，本身吉凶對個人影響較小，主要看它與人格的三才生剋。']
    ];
    return `<div class="aspect-grid" style="grid-template-columns:1fr">
      ${rows.map(([t, n, d]) => `<div class="aspect"><b>${t}　<span style="color:var(--gold-deep)">${n}</span></b>${d}</div>`).join('')}
    </div>`;
  }

  // ---------- 音靈五行 & 讀音防呆 ----------
  // 聲母五行（五音）：牙木、舌火、喉土、齒金、唇水
  const SM_WX = {
    g: '木', k: '木',
    d: '火', t: '火', n: '火', l: '火',
    h: '土', y: '土', w: '土', '': '土', // 零聲母（元音開頭）歸土
    j: '金', q: '金', x: '金', zh: '金', ch: '金', sh: '金', r: '金', z: '金', c: '金', s: '金',
    b: '水', p: '水', m: '水', f: '水'
  };
  function parsePy(py) {
    if (!py) return null;
    const tone = (py.match(/(\d)$/) || [])[1] || '5';
    const body = py.replace(/\d+$/, '').toLowerCase();
    let sm = '';
    for (const two of ['zh', 'ch', 'sh']) if (body.startsWith(two)) { sm = two; break; }
    if (!sm) { const c = body[0]; if ('bpmfdtnlgkhjqxrzcsyw'.includes(c) && !'aeiou'.includes(c)) sm = c; }
    const ym = body.slice(sm.length);
    return { sm, ym, tone: +tone, wx: SM_WX[sm] !== undefined ? SM_WX[sm] : '土', body };
  }
  // 常見姓氏拼音（音靈用）
  const SURNAME_PY = {
    陳: 'chen2', 林: 'lin2', 黃: 'huang2', 張: 'zhang1', 李: 'li3', 王: 'wang2', 吳: 'wu2', 劉: 'liu2', 蔡: 'cai4', 楊: 'yang2',
    許: 'xu3', 鄭: 'zheng4', 謝: 'xie4', 郭: 'guo1', 洪: 'hong2', 邱: 'qiu1', 曾: 'zeng1', 廖: 'liao4', 賴: 'lai4', 徐: 'xu2',
    周: 'zhou1', 葉: 'ye4', 蘇: 'su1', 莊: 'zhuang1', 呂: 'lu3', 江: 'jiang1', 何: 'he2', 蕭: 'xiao1', 羅: 'luo2', 高: 'gao1',
    潘: 'pan1', 簡: 'jian3', 朱: 'zhu1', 鍾: 'zhong1', 游: 'you2', 彭: 'peng2', 詹: 'zhan1', 胡: 'hu2', 施: 'shi1', 沈: 'shen3',
    余: 'yu2', 盧: 'lu2', 梁: 'liang2', 趙: 'zhao4', 顏: 'yan2', 柯: 'ke1', 孫: 'sun1', 翁: 'weng1', 魏: 'wei4', 戴: 'dai4',
    范: 'fan4', 方: 'fang1', 宋: 'song4', 鄧: 'deng4', 杜: 'du4', 傅: 'fu4', 侯: 'hou2', 曹: 'cao2', 温: 'wen1', 薛: 'xue1',
    丁: 'ding1', 卓: 'zhuo2', 馬: 'ma3', 董: 'dong3', 唐: 'tang2', 藍: 'lan2', 石: 'shi2', 紀: 'ji3', 姚: 'yao2', 連: 'lian2',
    馮: 'feng2', 歐: 'ou1', 程: 'cheng2', 湯: 'tang1', 黎: 'li2', 童: 'tong2', 蔣: 'jiang3', 金: 'jin1', 嚴: 'yan2', 白: 'bai2',
    韓: 'han2', 袁: 'yuan2', 章: 'zhang1', 錢: 'qian2', 崔: 'cui1', 龍: 'long2', 秦: 'qin2', 田: 'tian2', 于: 'yu2', 任: 'ren2'
  };
  const surPy = (ch) => SURNAME_PY[ch] || null;

  // 不雅諧音黑名單（去聲調的全名音串片段）
  const BAD_HOMO = ['zhuliu', 'shiti', 'shibai', 'wanzhong', 'yanggui', 'zhutou', 'goudan', 'huaidan', 'fanpian', 'siwang', 'kuqi', 'egan', 'yinjing', 'jipo', 'longgou'];

  // 讀音評估：回傳 {ok, penalty, notes, syllables}
  function phonetics(surname, chars) {
    const sp = surPy(surname[0]);
    const cps = chars.map(c => c && c.py ? parsePy(c.py) : null);
    if (!sp || cps.some(x => !x)) return { ok: true, penalty: 0, notes: [], syllables: null, unknown: true };
    const all = [parsePy(sp), ...cps];
    const notes = []; let penalty = 0;
    // 聲調全同
    if (new Set(all.map(a => a.tone)).size === 1) { penalty += 3; notes.push('聲調全同，唸起來平板拗口'); }
    // 聲母全同
    if (new Set(all.map(a => a.sm)).size === 1) { penalty += 3; notes.push('聲母相同，繞口'); }
    // 韻母全同
    if (new Set(all.map(a => a.ym)).size === 1) { penalty += 2; notes.push('韻母相同，音韻單調'); }
    // 姓與名首同音
    if (cps[0] && all[0].body === all[1].body) { penalty += 4; notes.push('姓與名首字同音'); }
    // 名兩字同音
    if (cps.length === 2 && cps[0].body === cps[1].body) { penalty += 4; notes.push('名字兩字同音'); }
    // 不雅諧音
    const joined = all.map(a => a.body).join('');
    const bad = BAD_HOMO.find(b => joined.includes(b));
    if (bad) { penalty += 20; notes.push('疑似不雅諧音'); }
    return { ok: penalty < 6, penalty, notes, syllables: all };
  }
  // 音靈五行流動生剋
  function yinlingHTML(syll) {
    if (!syll) return '';
    const wxs = syll.map(s => s.wx);
    const flow = [];
    for (let i = 0; i < wxs.length - 1; i++) {
      const a = wxs[i], b = wxs[i + 1];
      const rel = a === b ? '比和' : (wxSheng[a] === b ? '相生→' : (wxKe[a] === b ? '相剋✗' : (wxSheng[b] === a ? '被生' : (wxKe[b] === a ? '被剋' : '無'))));
      flow.push(rel);
    }
    const good = flow.every(f => f.includes('生') || f === '比和');
    return `<p>音靈五行（聲母）：${syll.map((s, i) => `${s.body}<b style="color:var(--gold-deep)">${s.wx}</b>${i < flow.length ? ` <span class="muted">${flow[i]}</span> ` : ''}`).join('')}
      ${good ? '<span style="color:var(--gold-deep)">音氣相生流暢 ✓</span>' : '<span class="muted">音氣有剋，唸誦間五行不全然順接</span>'}</p>`;
  }

  // ---------- 易卦姓名學（筆畫起卦） ----------
  const TRI_NUM = { 1: [1, 1, 1], 2: [1, 1, 0], 3: [1, 0, 1], 4: [1, 0, 0], 5: [0, 1, 1], 6: [0, 1, 0], 7: [0, 0, 1], 8: [0, 0, 0] };
  const TRI_NAME = { '111': '乾', '110': '兌', '101': '離', '100': '震', '011': '巽', '010': '坎', '001': '艮', '000': '坤' };
  const triNameByNum = (n) => TRI_NAME[TRI_NUM[((n - 1) % 8) + 1].join('')];
  let HEXBYTRI = null;
  function nameHexagram(g) {
    if (!HEXBYTRI && typeof HEXAGRAM_DATA !== 'undefined') { HEXBYTRI = {}; HEXAGRAM_DATA.forEach(h => { HEXBYTRI[h.upper + h.lower] = h; }); }
    if (!HEXBYTRI) return null;
    const upper = triNameByNum(g.tian);      // 天格起上卦
    const lower = triNameByNum(g.di);         // 地格起下卦
    const dong = ((g.tian + g.ren + g.di - 1) % 6) + 1; // 動爻
    return { hex: HEXBYTRI[upper + lower], upper, lower, dong };
  }

  App.register({
    id: 'naming',
    icon: '✍️',
    title: '姓名學取名',
    desc: '三才五格＋81數理＋生肖＋八字喜用＋易卦＋音靈讀音，五派合參取名／詳批。',
    render(el) {
      ensureMap();
      const dbOk = typeof NAME_CHARS !== 'undefined' && typeof SURNAME_STROKES !== 'undefined';
      el.innerHTML = `
        <div class="panel">
          <div class="form-grid" style="margin-bottom:12px">
            <div class="field"><label>模式</label>
              <select id="nm-mode"><option value="gen">幫寶寶／自己取名</option><option value="ana">分析現有姓名</option></select></div>
            <div class="field"><label>姓氏</label><input id="nm-sur" placeholder="陳" maxlength="2" style="width:80px"></div>
            <div class="field nm-ana" style="display:none"><label>名字</label><input id="nm-name" placeholder="美玲" maxlength="2" style="width:100px"></div>
            <div class="field nm-gen"><label>性別</label><select id="nm-g" style="width:80px"><option value="M">男</option><option value="F">女</option><option value="N">不限</option></select></div>
          </div>
          <div class="form-grid">
            <div class="field"><label>出生年（算喜用五行與生肖，可留空）</label><input id="nm-y" type="number" min="1900" max="2100" placeholder="2026" style="width:110px"></div>
            <div class="field"><label>月</label><input id="nm-m" type="number" min="1" max="12" placeholder="1" style="width:64px"></div>
            <div class="field"><label>日</label><input id="nm-d" type="number" min="1" max="31" placeholder="1" style="width:64px"></div>
            <div class="field"><label>時</label><input id="nm-h" type="number" min="0" max="23" placeholder="12" style="width:64px"></div>
          </div>
          <button class="btn" id="nm-go" style="margin-top:14px">✍️ 開始</button>
          <p class="muted" style="margin-top:8px">五派合參：三才五格＋81 數理＋生肖字根＋八字喜用＋易卦＋音靈讀音（筆畫依康熙字典，氵=4、艹=6、阝左=8…）。取名模式自動避開拗口與不雅諧音。${dbOk ? `取名精選庫 ${NAME_CHARS.length} 字；分析可查兩萬餘字康熙筆劃。` : '<b style="color:var(--cinnabar)">字庫載入失敗</b>'}</p>
        </div>
        <div id="nm-result"></div>`;

      const modeSel = el.querySelector('#nm-mode');
      modeSel.addEventListener('change', () => {
        el.querySelectorAll('.nm-ana').forEach(n => n.style.display = modeSel.value === 'ana' ? '' : 'none');
        el.querySelectorAll('.nm-gen').forEach(n => n.style.display = modeSel.value === 'gen' ? '' : 'none');
      });

      const warn = (msg) => { el.querySelector('#nm-result').innerHTML = `<div class="panel result"><p style="color:var(--cinnabar)">⚠ ${msg}</p></div>`; };
      el.querySelector('#nm-go').addEventListener('click', () => {
        const resEl = el.querySelector('#nm-result');
        resEl.innerHTML = '';
        const surname = el.querySelector('#nm-sur').value.trim();
        if (!surname) { warn('請輸入姓氏'); return; }
        const surStrokes = [...surname].map(strokeOf);
        if (surStrokes.some(s => !s)) { warn(`姓氏「${surname}」不在字庫中，暫不支援（目前收錄常見 128 姓）`); return; }
        const y = +el.querySelector('#nm-y').value || 0;
        const m = +el.querySelector('#nm-m').value || 1;
        const d = +el.querySelector('#nm-d').value || 1;
        const hh = +el.querySelector('#nm-h').value || 12;
        const birth = y ? likeWxOf(y, m, d, hh) : null;
        const zodiacIdx = birth ? birth.pillars.year.zhiIdx : null;
        const zt = zodiacIdx !== null ? ZODIAC_TAGS[zodiacIdx] : null;

        const birthNote = birth
          ? `<p>八字：${['year', 'month', 'day', 'hour'].map(k => birth.pillars[k].name).join(' ')}，日主${birth.pillars.day.gan}${birth.pillars.day.ganWx}身${birth.strong ? '強' : '弱'}${birth.missing.length ? `，五行缺${birth.missing.join('、')}` : ''}。
             取名喜用五行：<b style="color:var(--gold-bright)">${birth.like}</b>${birth.missing.length && birth.missing[0] !== birth.like ? `（兼顧補${birth.missing.join('、')}）` : ''}；生肖屬<b>${Ganzhi.SHENGXIAO[zodiacIdx]}</b>。</p>`
          : '<p class="muted">未填生日——以數理與三才為主，未連動八字喜用與生肖。</p>';

        if (modeSel.value === 'ana') {
          // ---------- 分析模式 ----------
          const name = el.querySelector('#nm-name').value.trim();
          if (!name) { warn('請輸入名字'); return; }
          const nameStrokes = [...name].map(strokeOf);
          if (nameStrokes.some(s => !s)) { warn(`名字中有字查無康熙筆劃（${[...name].filter(c => !strokeOf(c)).join('、')}），暫無法分析——可能為罕用字或異體字。`); return; }
          const g = fiveGrids(surStrokes, nameStrokes);
          const chars = [...name].map(c => charMap[c]).filter(Boolean);
          const fullMeta = chars.length === [...name].length; // 全部字都在精選庫（有五行/寓意/拼音）
          const wxList = chars.length ? chars.map(c => `${c.c}（${c.wx}）`).join('、') : '（此名部分字取自擴充筆劃表，僅有筆畫、無五行寓意資料）';
          let zodiacNote = '';
          if (zt) {
            const likes = chars.filter(c => c.tags.some(t => zt.like.includes(t))).map(c => c.c);
            const dislikes = chars.filter(c => c.tags.some(t => zt.dislike.includes(t))).map(c => c.c);
            zodiacNote = `<p>生肖${Ganzhi.SHENGXIAO[zodiacIdx]}：${likes.length ? `「${likes.join('、')}」含喜用字根 ✓` : ''}${dislikes.length ? `　<span style="color:var(--cinnabar)">「${dislikes.join('、')}」含忌用字根</span>` : ''}${!likes.length && !dislikes.length ? '名字字根與生肖無明顯宜忌。' : ''}</p>`;
          }
          const wxMatch = birth ? chars.some(c => c.wx === birth.like) : null;
          const div = document.createElement('div');
          div.innerHTML = `<div class="panel result">
            <div style="text-align:center;font-size:34px;letter-spacing:.2em;color:var(--navy);font-weight:700">${surname}${name}</div>
            <div class="muted" style="text-align:center">${[...surname + name].map(c => `${c} ${strokeOf(c)}劃`).join('　')}（康熙筆畫）</div>
            <hr class="divider">
            ${gridsHTML(g, surname, name)}
            <h4>五格詳批</h4>
            ${detailHTML(g)}
            ${(() => { const nh = nameHexagram(g); return nh && nh.hex ? `<h4>易卦姓名學（筆畫起卦）</h4>
              <p>以天格起上卦、地格起下卦、動爻取第 ${nh.dong} 爻，得 <b style="color:var(--navy)">${nh.hex.symbol} ${nh.hex.name}</b>（${nh.upper}上${nh.lower}下）。</p>
              <p class="muted">${nh.hex.duan} 此卦象徵姓名所帶的先天氣場趨勢。</p>` : ''; })()}
            ${birthNote}
            <p>名字五行：${wxList}${wxMatch !== null ? wxMatch ? '——<b style="color:var(--gold-deep)">符合喜用五行 ✓</b>' : `——<span style="color:var(--cinnabar)">未含喜用五行「${birth.like}」</span>` : ''}</p>
            ${zodiacNote}
            ${(() => { if (!fullMeta) return ''; const ph = phonetics(surname, chars); return ph.unknown ? '' : `<h4>音韻（音靈五行＋讀音）</h4>${yinlingHTML(ph.syllables)}${ph.notes.length ? `<p class="muted">讀音提醒：${ph.notes.join('、')}。</p>` : '<p class="muted">讀音順口，無明顯拗口或諧音問題。</p>'}`; })()}
            ${chars.length ? `<p>寓意：${chars.map(c => `${c.c}＝${c.m}`).join('；')}。</p>` : ''}
            <p class="muted" style="font-size:11.5px">筆劃依康熙字典（分析涵蓋兩萬餘字，資料源 kangxi-strokecount MIT）。五格數理、三才、易卦皆以筆劃推算；五行、寓意、音韻僅精選庫用字提供。</p>
          </div>`;
          resEl.appendChild(div);
          AI.attach(div.querySelector('.panel'), () =>
            `請以姓名學角度深度分析姓名「${surname}${name}」。
康熙筆畫：${[...surname + name].map(c => `${c}=${strokeOf(c)}`).join('、')}
五格：天格${g.tian}（${luckOf(g.tian)}）、人格${g.ren}（${luckOf(g.ren)}）、地格${g.di}（${luckOf(g.di)}）、外格${g.wai}（${luckOf(g.wai)}）、總格${g.zong}（${luckOf(g.zong)}）
三才：${g.sancai.join('')}（${g.sancaiGood ? '相生' : '有剋'}）
${birth ? `八字：${['year', 'month', 'day', 'hour'].map(k => birth.pillars[k].name).join(' ')}，喜用${birth.like}，生肖${Ganzhi.SHENGXIAO[zodiacIdx]}` : '（無生日資料）'}
請分析：1) 五格數理對性格與運勢的影響（人格主運、總格晚運）2) 三才配置 3) 字義與音韻 4) 與八字喜用的配合度 5) 若有不足，給出化解或補強建議。`);
          return;
        }

        // ---------- 取名模式 ----------
        if (!dbOk) { warn('字庫載入失敗，無法取名'); return; }
        const gender = el.querySelector('#nm-g').value;
        // 加權隨機抽一個
        const wPick = (items, wFn) => {
          let total = 0; const ws = items.map(x => { const w = Math.max(0.01, wFn(x)); total += w; return w; });
          let r = Math.random() * total;
          for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
          return items[items.length - 1];
        };
        // 慎用字：技術上合格但當名字太平庸／結構性／冷僻／不雅
        const AVOID = new Set('丁乙丙子丑寅卯巳午未申酉戌亥木火水金土好孜孳孝仔囝乃之乎兮且卜也巴匕勾尢尸屎冬廿卅兇歹殀夭亡病痞囚奴婢妾丐乞屍冢柚柑橘蒜葱韭薑瓜稻萸蒨靄灣纓灩榆蒜地太中稗稈禾黍稷薯芋薯芽秕稊'.split(''));
        // 每個筆畫格的「好字」池（排除慎用字＋不符性別）；只在此池挑字
        const goodByStroke = {};
        for (const c of NAME_CHARS) {
          if (AVOID.has(c.c)) continue;
          if (!(c.g === 'N' || gender === 'N' || c.g === gender)) continue;
          (goodByStroke[c.k] = goodByStroke[c.k] || []).push(c);
        }
        const strokeGood = (k) => (goodByStroke[k] || []).length >= 3; // 該筆畫格至少 3 個好字才用

        // 1) 只取「兩個名字筆畫格都有足夠好字」的三才五格全吉組合——從源頭杜絕怪字
        const strokeSet = Object.keys(goodByStroke).map(Number).filter(strokeGood).sort((a, b) => a - b);
        const combos = [];
        for (const k1 of strokeSet) {
          for (const k2 of strokeSet) {
            const g = fiveGrids(surStrokes, [k1, k2]);
            if (luckOf(g.ren) !== '吉' || luckOf(g.zong) !== '吉') continue;
            if (luckOf(g.di) === '凶' || luckOf(g.wai) === '凶') continue;
            if (!g.sancaiGood) continue;
            combos.push({ k1, k2, g, s: gridScore(g) });
          }
        }
        if (!combos.length) {
          resEl.innerHTML = '<div class="panel result"><p>此姓氏找不到三才五格全吉的雙名筆畫組合（罕見），請改用 AI 解讀諮詢。</p></div>';
          return;
        }
        // 均勻洗牌：全部已通過三才五格全吉，不分高下，每批隨機探索不同筆畫格
        const orderedCombos = combos.slice();
        for (let i = orderedCombos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [orderedCombos[i], orderedCombos[j]] = [orderedCombos[j], orderedCombos[i]]; }

        // 2) 為每個組合挑字：只從該筆畫格的好字池「加權隨機」抽（依喜用/生肖加權）
        const pickChar = (k, prefer, used) => {
          const pool = (goodByStroke[k] || []).filter(c => !used.has(c.c));
          if (!pool.length) return null;
          const scored = pool.map(c => {
            let s = 4; // 基礎分，讓非喜用好字也有機會浮出
            if (birth && c.wx === birth.like) s += 4;
            if (birth && birth.missing.includes(c.wx)) s += 1.5;
            if (zt && c.tags.some(t => zt.like.includes(t))) s += 2;
            if (zt && c.tags.some(t => zt.dislike.includes(t))) s -= 8;
            if (prefer && c.wx === prefer) s += 2;
            if ((c.g === 'M' || c.g === 'F') && gender !== 'N') s += 1.5;
            return { c, w: Math.max(0.2, s) };
          });
          return wPick(scored, x => x.w * x.w).c;
        };
        const used = new Set();
        const results = [];
        for (const cb of orderedCombos) {
          // 每組嘗試數次，挑讀音最順的一組（讀音防呆）
          let best = null;
          for (let attempt = 0; attempt < 5; attempt++) {
            const c1 = pickChar(cb.k1, null, used);
            if (!c1) break;
            const c2 = pickChar(cb.k2, birth && c1.wx !== birth.like ? birth.like : null, new Set([...used, c1.c]));
            if (!c2) break;
            const ph = phonetics(surname, [c1, c2]);
            if (!best || ph.penalty < best.ph.penalty) best = { c1, c2, ph };
            if (ph.penalty === 0) break; // 完美讀音即採用
          }
          if (!best) continue;
          if (best.ph.penalty >= 20) continue; // 諧音疑慮直接淘汰
          used.add(best.c1.c); used.add(best.c2.c);
          results.push({ c1: best.c1, c2: best.c2, ph: best.ph, ...cb });
          if (results.length >= 8) break;
        }

        const div = document.createElement('div');
        div.innerHTML = `<div class="panel result">
          <h3>「${surname}」姓 ${gender === 'M' ? '男' : gender === 'F' ? '女' : ''}寶寶命名提案</h3>
          ${birthNote}
          <div class="aspect-grid">
            ${results.map(r => `<div class="aspect">
              <div style="font-size:26px;letter-spacing:.15em;color:var(--navy);font-weight:700;text-align:center">${surname}${r.c1.c}${r.c2.c}</div>
              <div class="muted" style="text-align:center;font-size:12px">${r.c1.c}${r.c1.k}劃(${r.c1.wx})・${r.c2.c}${r.c2.k}劃(${r.c2.wx})</div>
              <div style="text-align:center;margin:4px 0"><span class="tag gold" style="font-size:12px">三才${r.g.sancai.join('')}</span>
                <span class="tag" style="font-size:12px">人格${r.g.ren}吉</span><span class="tag" style="font-size:12px">總格${r.g.zong}吉</span>${r.ph && !r.ph.unknown && r.ph.penalty === 0 ? '<span class="tag" style="font-size:12px;color:var(--gold-deep)">讀音順</span>' : ''}</div>
              ${r.c1.py ? `<div class="muted" style="text-align:center;font-size:11.5px">${surPy(surname[0]) ? parsePy(surPy(surname[0])).body : surname} · ${parsePy(r.c1.py).body} · ${parsePy(r.c2.py).body}</div>` : ''}
              <div style="font-size:13px">${r.c1.c}：${r.c1.m}<br>${r.c2.c}：${r.c2.m}</div>
            </div>`).join('')}
          </div>
          <div style="text-align:center;margin-top:14px"><button class="btn small ghost" id="nm-again">🎲 換一批</button></div>
          <p class="muted" style="margin-top:10px">※ 每個提案皆為三才相生、人格總格數理全吉；已依喜用五行與生肖字根加權。實際取名請同時考慮讀音、諧音與家族輩分。</p>
        </div>`;
        resEl.appendChild(div);
        div.querySelector('#nm-again').addEventListener('click', () => el.querySelector('#nm-go').click());

        AI.attach(div.querySelector('.panel'), () =>
          `請以姓名學專家角度，評比以下為「${surname}」姓${gender === 'M' ? '男' : gender === 'F' ? '女' : ''}寶寶生成的命名提案，並挑出最好的 3 個說明理由（考量：數理、三才、字義、音韻是否順口、有無不良諧音、與八字的配合）。
${birth ? `八字：${['year', 'month', 'day', 'hour'].map(k => birth.pillars[k].name).join(' ')}，日主${birth.pillars.day.gan}身${birth.strong ? '強' : '弱'}，喜用五行${birth.like}，生肖${Ganzhi.SHENGXIAO[zodiacIdx]}。` : ''}
提案：${results.map(r => `${surname}${r.c1.c}${r.c2.c}（${r.c1.k}+${r.c2.k}劃，三才${r.g.sancai.join('')}，人格${r.g.ren}總格${r.g.zong}）`).join('、')}
也歡迎你在同樣筆畫組合下建議更好的用字。`);
      });
    }
  });
})();
