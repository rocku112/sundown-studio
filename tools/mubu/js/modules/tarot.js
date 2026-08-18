/* 暮卜先知 · 塔羅牌 */
(() => {
  const RANK_LABEL = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', page: '侍', knight: '騎', queen: '后', king: '王' };
  const SPREADS = [
    { id: 'one', name: '單張指引', n: 1, slots: () => ['指引'] },
    { id: 'yesno', name: '是非牌陣（快問快答）', n: 1, yesno: true, slots: () => ['是非'] },
    { id: 'three', name: '時間之流（三張）', n: 3, slots: () => ['過去', '現在', '未來'] },
    { id: 'love', name: '愛情牌陣（五張）', n: 5, slots: () => ['你的感受', '對方的感受', '關係現況', '障礙與挑戰', '未來走向'] },
    { id: 'choice', name: '二選一牌陣（七張）', n: 7, choice: true,
      slots: (a, b) => [`「${a}」的能量`, `「${b}」的能量`, `關於「${a}」你尚未察覺的事`, `關於「${b}」你尚未察覺的事`, `選「${a}」的結果`, `選「${b}」的結果`, '內心真正的建議'] },
    { id: 'celtic', name: '凱爾特十字（十張）', n: 10, slots: () => ['現況', '挑戰', '潛意識根基', '過去', '顯意識目標', '未來', '自身態度', '外在環境', '希望與恐懼', '最終結果'] }
  ];

  // ── 牌陣結構分析（韋特體系實務解牌：先看整體組成，再看單張）──
  const SUIT_DOMAIN = {
    權杖: { elem: '火', mean: '行動、事業、熱情與創造力' },
    聖杯: { elem: '水', mean: '情感、關係、直覺與內心感受' },
    寶劍: { elem: '風', mean: '思緒、溝通、衝突與現實課題' },
    錢幣: { elem: '土', mean: '物質、金錢、健康與務實層面' }
  };
  const COURT_PERSONA = {
    page: { name: '侍者', mean: '學習者、訊息帶來者——代表新手上路的階段，或一位年輕／經驗尚淺的人，也可能是一則消息的到來。' },
    knight: { name: '騎士', mean: '行動者、追求者——代表全力投入、快速推進的階段，或一位積極主動、卻可能衝動的人。' },
    queen: { name: '皇后', mean: '滋養者、內在成熟——代表以理解與包容處理事情的方式，或一位善於體察、內在強大的人。' },
    king: { name: '國王', mean: '掌權者、外在成熟——代表以權威與經驗主導局面，或一位居於決策位置、能拍板的人。' }
  };
  function spreadAnalysis(picked) {
    const n = picked.length;
    const major = picked.filter(p => p.card.arcana === 'major');
    const rev = picked.filter(p => p.reversed);
    const court = picked.filter(p => typeof p.card.rank === 'string');
    const suits = {};
    picked.filter(p => p.card.suitName).forEach(p => { suits[p.card.suitName] = (suits[p.card.suitName] || 0) + 1; });
    const suitTop = Object.entries(suits).sort((a, b) => b[1] - a[1])[0];
    const out = [];
    // 大阿爾克那比例
    const mr = major.length / n;
    out.push({
      title: `大阿爾克那 ${major.length}/${n}`,
      good: null,
      text: mr >= 0.6
        ? `牌陣中大牌佔多數（${major.map(p => p.card.name).join('、')}）——這件事的層級<b>超出日常瑣事</b>，是人生階段性的重要課題，背後有較大的命運推力，往往不完全由你單方面掌控，宜順勢而非硬抗。`
        : mr === 0
          ? '牌陣全為小阿爾克那——這件事屬於<b>日常可掌控</b>的層面，變數多在細節與人為努力，只要調整具體做法就能影響結果，不必往命運層次去想。'
          : `大小牌並見——這件事<b>既有大方向的必然，也有你能著力的細節</b>：大牌處是趨勢、需順應，小牌處是具體做法、可主動調整。`
    });
    // 花色分布
    if (suitTop && suitTop[1] >= 2) {
      const d = SUIT_DOMAIN[suitTop[0]];
      out.push({
        title: `${suitTop[0]}偏多（${suitTop[1]} 張・${d ? d.elem : ''}元素）`,
        good: null,
        text: `牌陣中${suitTop[0]}最多，代表這件事的核心落在<b>${d ? d.mean : suitTop[0]}</b>的層面——解讀時應把重心放在這個領域，其他面向多是配角。`
      });
    }
    // 宮廷牌
    if (court.length) {
      out.push({
        title: `宮廷牌 ${court.length} 張`,
        good: null,
        text: `出現${court.map(p => p.card.name).join('、')}——宮廷牌多主<b>「人」</b>：可能是牽涉其中的具體人物，也可能是你當下該採取的姿態。${court.map(p => `<br>・<b>${p.card.name}</b>：${COURT_PERSONA[p.card.rank] ? COURT_PERSONA[p.card.rank].mean : ''}`).join('')}`
      });
    }
    // 逆位比例
    const rr = rev.length / n;
    out.push({
      title: `逆位 ${rev.length}/${n}`,
      good: null,
      text: rr >= 0.6
        ? '逆位過半——整體能量偏向<b>內在、受阻或尚未展開</b>：事情多半卡在內心糾結、時機未到或方向需要修正，此時宜向內檢視而非向外強求。'
        : rr === 0
          ? '全為正位——能量<b>順暢外顯</b>，事情走在明朗的軌道上，該做什麼相對清楚，可放心依牌義行動。'
          : '正逆交錯——事情<b>有推進也有阻滯</b>：正位處是可施力的順風面，逆位處是需要先處理的內在功課或現實阻礙。'
    });
    return out;
  }

  function draw(n) {
    const idx = [...Array(TAROT_DATA.length).keys()];
    const picked = [];
    for (let i = 0; i < n; i++) {
      const j = Math.floor(Math.random() * idx.length);
      picked.push({ card: TAROT_DATA[idx[j]], reversed: Math.random() < 0.5 });
      idx.splice(j, 1);
    }
    return picked;
  }

  function cardMetaHTML(p) {
    const c = p.card;
    const kw = p.reversed ? c.keywordsRev : c.keywordsUp;
    return `<span class="emoji">${Icons.tarotCardIcon(c)}${c.suit ? `<b class="rank-badge">${RANK_LABEL[c.rank] || ''}</b>` : ''}</span>
      <span class="cname">${c.name}</span>
      <span class="pos-label ${p.reversed ? 'rev' : ''}">${p.reversed ? '逆位' : '正位'}</span>
      <div class="muted" style="font-size:11px;margin-top:4px">${kw.slice(0, 3).join('・')}</div>`;
  }

  function dailyKey() {
    const d = new Date();
    return `mubu-tarot-daily-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function renderDaily(el) {
    const key = dailyKey();
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch (e) { saved = null; }
    if (!saved) {
      const [p] = draw(1);
      saved = { id: p.card.id, reversed: p.reversed };
      try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {}
    }
    const card = TAROT_DATA.find(c => c.id === saved.id);
    const p = { card, reversed: saved.reversed };
    const meaning = p.reversed ? card.meaningRev : card.meaningUp;
    el.innerHTML = `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <div class="tarot-card revealed ${p.reversed ? 'reversed-card' : ''}" style="cursor:default;flex-shrink:0">
        <div class="face">${cardMetaHTML(p)}</div>
      </div>
      <div style="flex:1;min-width:220px">
        <p>${meaning}</p>
        <p class="muted">建議：${card.advice}</p>
      </div>
    </div>`;
  }

  App.register({
    id: 'tarot',
    icon: Icons.svg('tarot'),
    title: '塔羅牌',
    desc: '韋特七十八牌，單張／是非／愛情／二選一／時間之流／凱爾特十字牌陣，附每日指引卡。',
    render(el) {
      el.innerHTML = `
        <div class="panel" style="margin-bottom:12px">
          <h3>${Icons.svg('fortune')} 今日指引卡</h3>
          <p class="muted" style="margin-top:-4px;margin-bottom:10px">每天固定一張，明天會換新的一張。</p>
          <div id="tr-daily"></div>
        </div>
        <div class="panel">
          <h3>選擇牌陣</h3>
          <div class="field" style="margin-bottom:12px">
            <label>想問的問題（可留空）</label>
            <input class="tr-q" placeholder="例：我和他的關係會如何發展？" style="width:100%">
          </div>
          <div class="form-grid">
            <div class="field"><label>牌陣</label>
              <select class="tr-spread">${SPREADS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
            </div>
          </div>
          <div class="tr-choice-inputs form-grid" style="display:none;margin-top:8px">
            <div class="field"><label>選項 A</label><input class="tr-opt-a" placeholder="例：留在現職" style="width:100%"></div>
            <div class="field"><label>選項 B</label><input class="tr-opt-b" placeholder="例：換新工作" style="width:100%"></div>
          </div>
          <button class="btn" id="tr-go" style="margin-top:12px">${Icons.svg('tarot')} 洗牌抽牌</button>
        </div>
        <div id="tr-result"></div>`;

      renderDaily(el.querySelector('#tr-daily'));

      const spreadSel = el.querySelector('.tr-spread');
      const choiceInputs = el.querySelector('.tr-choice-inputs');
      spreadSel.addEventListener('change', () => {
        const s = SPREADS.find(x => x.id === spreadSel.value);
        choiceInputs.style.display = s.choice ? 'grid' : 'none';
      });

      el.querySelector('#tr-go').addEventListener('click', () => {
        const resEl = el.querySelector('#tr-result');
        resEl.innerHTML = '';
        const spread = SPREADS.find(s => s.id === spreadSel.value);
        const question = el.querySelector('.tr-q').value.trim();
        const optA = (el.querySelector('.tr-opt-a')?.value || 'A方案').trim() || 'A方案';
        const optB = (el.querySelector('.tr-opt-b')?.value || 'B方案').trim() || 'B方案';
        const slots = spread.slots(optA, optB);
        const picked = draw(spread.n);

        const panel = document.createElement('div');
        panel.className = 'panel result';
        panel.innerHTML = `<h3>${spread.name}</h3>
          <p class="muted">${question ? `所問：${question} · ` : ''}點擊牌背翻牌，全部翻開後顯示解讀。</p>
          <div class="tarot-spread"></div>
          <div class="tr-readings"></div>`;
        resEl.appendChild(panel);

        const spreadEl = panel.querySelector('.tarot-spread');
        const readEl = panel.querySelector('.tr-readings');
        let revealed = 0;

        picked.forEach((p, i) => {
          const cardEl = document.createElement('button');
          cardEl.className = 'tarot-card';
          cardEl.innerHTML = `<span class="slot-label">${slots[i]}</span><span class="back-mark">✦</span>`;
          cardEl.addEventListener('click', () => {
            if (cardEl.classList.contains('revealed')) return;
            cardEl.classList.add('revealed');
            if (p.reversed) cardEl.classList.add('reversed-card');
            cardEl.innerHTML = `<span class="slot-label">${slots[i]}</span><div class="face">${cardMetaHTML(p)}</div>`;
            if (++revealed === picked.length) showReadings();
          }, { once: false });
          spreadEl.appendChild(cardEl);
        });

        function showReadings() {
          let html = '<hr class="divider">';
          if (spread.yesno) {
            const p = picked[0];
            const yes = !p.reversed;
            const strong = p.card.arcana === 'major';
            html += `<div style="text-align:center;margin-bottom:12px">
              <div style="font-size:48px;font-weight:700;color:${yes ? 'var(--gold-deep)' : 'var(--cinnabar)'}">${yes ? '是' : '否'}</div>
              <span class="fortune-level ${yes ? 'good' : 'bad'}">${strong ? '強烈傾向' : '傾向'}${yes ? '肯定' : '否定'}</span>
            </div>`;
          }
          if (picked.length >= 3) {
            const ana = spreadAnalysis(picked);
            html += `<h4>牌陣結構分析</h4>
              <p class="muted" style="margin-top:-2px">實務解牌先看整體組成再讀單張——大小牌比例定「事情的層級」，花色定「落在哪個領域」，宮廷牌指「牽涉的人」，逆位比例看「能量順逆」。</p>
              ${ana.map(a => `<div class="aspect" style="margin-top:6px"><b>${a.title}</b><p style="margin-top:3px">${a.text}</p></div>`).join('')}
              <hr class="divider">`;
          }
          picked.forEach((p, i) => {
            const c = p.card;
            const meaning = p.reversed ? c.meaningRev : c.meaningUp;
            html += `<h4>${slots[i]} · ${c.name}（${p.reversed ? '逆位' : '正位'}）</h4>
              <p>${meaning}</p>
              <p class="muted">感情：${c.love}　事業：${c.career}<br>建議：${c.advice}</p>`;
          });
          readEl.innerHTML = html;
          AI.attach(panel, () =>
            `請為以下塔羅牌陣做深度解讀。
所問的問題：${question || '（未說明，做整體指引）'}
牌陣：${spread.name}${spread.choice ? `（選項A：${optA}／選項B：${optB}）` : ''}
${picked.map((p, i) => `${i + 1}. ${slots[i]}：${p.card.name}（${p.card.nameEn}）${p.reversed ? '逆位' : '正位'}`).join('\n')}
${picked.length >= 3 ? `牌陣結構：大阿爾克那 ${picked.filter(p => p.card.arcana === 'major').length}/${picked.length}、逆位 ${picked.filter(p => p.reversed).length}/${picked.length}、宮廷牌 ${picked.filter(p => typeof p.card.rank === 'string').length} 張${(() => { const s = {}; picked.filter(p => p.card.suitName).forEach(p => { s[p.card.suitName] = (s[p.card.suitName] || 0) + 1; }); const e = Object.entries(s).sort((a, b) => b[1] - a[1]); return e.length ? `、花色分布 ${e.map(([k, v]) => k + v).join('/')}` : ''; })()}
` : ''}請先從<b>牌陣整體結構</b>入手（大小阿爾克那比例＝事情層級與命運推力、花色分布＝核心落在哪個生命領域、宮廷牌＝牽涉的人物或該採取的姿態、逆位比例＝能量順逆），再將所有牌串連成一個完整的故事線來解讀（不要一張一張孤立解釋），特別注意牌與牌之間的呼應與轉折，最後給出具體可行的建議。${spread.choice ? '請針對兩個選項給出明確的比較與傾向建議。' : ''}`);
          readEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  });
})();
