/* 暮卜先知 · 塔羅牌 */
(() => {
  const SPREADS = [
    { id: 'one', name: '單張指引', n: 1, slots: () => ['指引'] },
    { id: 'yesno', name: '是非牌陣（快問快答）', n: 1, yesno: true, slots: () => ['是非'] },
    { id: 'three', name: '時間之流（三張）', n: 3, slots: () => ['過去', '現在', '未來'] },
    { id: 'love', name: '愛情牌陣（五張）', n: 5, slots: () => ['你的感受', '對方的感受', '關係現況', '障礙與挑戰', '未來走向'] },
    { id: 'choice', name: '二選一牌陣（七張）', n: 7, choice: true,
      slots: (a, b) => [`「${a}」的能量`, `「${b}」的能量`, `關於「${a}」你尚未察覺的事`, `關於「${b}」你尚未察覺的事`, `選「${a}」的結果`, `選「${b}」的結果`, '內心真正的建議'] },
    { id: 'celtic', name: '凱爾特十字（十張）', n: 10, slots: () => ['現況', '挑戰', '潛意識根基', '過去', '顯意識目標', '未來', '自身態度', '外在環境', '希望與恐懼', '最終結果'] }
  ];

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
    return `<span class="emoji">${c.emoji}</span>
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
    icon: '🃏',
    title: '塔羅牌',
    desc: '韋特七十八牌，單張／是非／愛情／二選一／時間之流／凱爾特十字牌陣，附每日指引卡。',
    render(el) {
      el.innerHTML = `
        <div class="panel" style="margin-bottom:12px">
          <h3>🌞 今日指引卡</h3>
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
          <button class="btn" id="tr-go" style="margin-top:12px">🔮 洗牌抽牌</button>
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
請將所有牌串連成一個完整的故事線來解讀（不要一張一張孤立解釋），特別注意牌與牌之間的呼應與轉折，最後給出具體可行的建議。${spread.choice ? '請針對兩個選項給出明確的比較與傾向建議。' : ''}`);
          readEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  });
})();
