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

  App.register({
    id: 'naming',
    icon: '✍️',
    title: '姓名學取名',
    desc: '三才五格＋81數理＋生肖字根＋八字喜用五行，分析姓名或自動取名。',
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
          <p class="muted" style="margin-top:8px">筆畫依康熙字典（氵=4、艹=6、阝左=8…）；綜合三才五格、81 數理、生肖字根與八字喜用五行。${dbOk ? '' : '<b style="color:var(--cinnabar)">字庫載入失敗</b>'}</p>
        </div>
        <div id="nm-result"></div>`;

      const modeSel = el.querySelector('#nm-mode');
      modeSel.addEventListener('change', () => {
        el.querySelectorAll('.nm-ana').forEach(n => n.style.display = modeSel.value === 'ana' ? '' : 'none');
        el.querySelectorAll('.nm-gen').forEach(n => n.style.display = modeSel.value === 'gen' ? '' : 'none');
      });

      el.querySelector('#nm-go').addEventListener('click', () => {
        const resEl = el.querySelector('#nm-result');
        resEl.innerHTML = '';
        const surname = el.querySelector('#nm-sur').value.trim();
        if (!surname) { alert('請輸入姓氏'); return; }
        const surStrokes = [...surname].map(strokeOf);
        if (surStrokes.some(s => !s)) { alert(`姓氏「${surname}」不在字庫中，暫不支援`); return; }
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
          if (!name) { alert('請輸入名字'); return; }
          const nameStrokes = [...name].map(strokeOf);
          if (nameStrokes.some(s => !s)) { alert(`名字中有字不在字庫（${[...name].filter(c => !strokeOf(c)).join('、')}），暫無法分析`); return; }
          const g = fiveGrids(surStrokes, nameStrokes);
          const chars = [...name].map(c => charMap[c]).filter(Boolean);
          const wxList = chars.map(c => `${c.c}（${c.wx}）`).join('、');
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
            ${birthNote}
            <p>名字五行：${wxList}${wxMatch !== null ? wxMatch ? '——<b style="color:var(--gold-deep)">符合喜用五行 ✓</b>' : `——<span style="color:var(--cinnabar)">未含喜用五行「${birth.like}」</span>` : ''}</p>
            ${zodiacNote}
            <p>寓意：${chars.map(c => `${c.c}＝${c.m}`).join('；')}。</p>
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
        if (!dbOk) { alert('字庫載入失敗，無法取名'); return; }
        const gender = el.querySelector('#nm-g').value;
        // 1) 找出數理全吉的筆畫組合
        const strokeSet = [...new Set(NAME_CHARS.map(c => c.k))].sort((a, b) => a - b);
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
        combos.sort((a, b) => b.s - a.s);
        if (!combos.length) {
          resEl.innerHTML = '<div class="panel result"><p>此姓氏找不到三才五格全吉的雙名筆畫組合（罕見），請改用 AI 解讀諮詢。</p></div>';
          return;
        }
        // 2) 為每個組合挑字
        const pickChar = (k, prefer, used) => {
          let pool = NAME_CHARS.filter(c => c.k === k && (c.g === 'N' || gender === 'N' || c.g === gender) && !used.has(c.c));
          if (!pool.length) return null;
          const scored = pool.map(c => {
            let s = Math.random() * 2;
            if (birth && c.wx === birth.like) s += 5;
            if (birth && birth.missing.includes(c.wx)) s += 2;
            if (zt && c.tags.some(t => zt.like.includes(t))) s += 2.5;
            if (zt && c.tags.some(t => zt.dislike.includes(t))) s -= 6;
            if (prefer && c.wx === prefer) s += 1.5;
            return { c, s };
          }).sort((a, b) => b.s - a.s);
          return scored[0].c;
        };
        const used = new Set();
        const results = [];
        for (const cb of combos.slice(0, 40)) {
          const c1 = pickChar(cb.k1, null, used);
          if (!c1) continue;
          const c2 = pickChar(cb.k2, birth && c1.wx !== birth.like ? birth.like : null, used);
          if (!c2) continue;
          used.add(c1.c); used.add(c2.c);
          results.push({ c1, c2, ...cb });
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
                <span class="tag" style="font-size:12px">人格${r.g.ren}吉</span><span class="tag" style="font-size:12px">總格${r.g.zong}吉</span></div>
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
