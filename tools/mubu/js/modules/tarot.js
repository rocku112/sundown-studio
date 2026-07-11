/* 暮卜先知 · 塔羅牌 */
(() => {
  const SPREADS = [
    { id: 'one', name: '單張指引', n: 1, slots: ['指引'] },
    { id: 'three', name: '時間之流（三張）', n: 3, slots: ['過去', '現在', '未來'] },
    { id: 'celtic', name: '凱爾特十字（十張）', n: 10, slots: ['現況', '挑戰', '潛意識根基', '過去', '顯意識目標', '未來', '自身態度', '外在環境', '希望與恐懼', '最終結果'] }
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

  App.register({
    id: 'tarot',
    icon: '🃏',
    title: '塔羅牌',
    desc: '韋特七十八牌，單張指引、三張時間流、凱爾特十字牌陣。',
    render(el) {
      el.innerHTML = `
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
            <button class="btn" id="tr-go">🔮 洗牌抽牌</button>
          </div>
        </div>
        <div id="tr-result"></div>`;

      el.querySelector('#tr-go').addEventListener('click', () => {
        const resEl = el.querySelector('#tr-result');
        resEl.innerHTML = '';
        const spread = SPREADS.find(s => s.id === el.querySelector('.tr-spread').value);
        const question = el.querySelector('.tr-q').value.trim();
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
          cardEl.innerHTML = `<span class="slot-label">${spread.slots[i]}</span><span class="back-mark">✦</span>`;
          cardEl.addEventListener('click', () => {
            if (cardEl.classList.contains('revealed')) return;
            cardEl.classList.add('revealed');
            if (p.reversed) cardEl.classList.add('reversed-card');
            cardEl.innerHTML = `<span class="slot-label">${spread.slots[i]}</span><div class="face">${cardMetaHTML(p)}</div>`;
            if (++revealed === picked.length) showReadings();
          }, { once: false });
          spreadEl.appendChild(cardEl);
        });

        function showReadings() {
          let html = '<hr class="divider">';
          picked.forEach((p, i) => {
            const c = p.card;
            const meaning = p.reversed ? c.meaningRev : c.meaningUp;
            html += `<h4>${spread.slots[i]} · ${c.name}（${p.reversed ? '逆位' : '正位'}）</h4>
              <p>${meaning}</p>
              <p class="muted">感情：${c.love}　事業：${c.career}<br>建議：${c.advice}</p>`;
          });
          readEl.innerHTML = html;
          AI.attach(panel, () =>
            `請為以下塔羅牌陣做深度解讀。
所問的問題：${question || '（未說明，做整體指引）'}
牌陣：${spread.name}
${picked.map((p, i) => `${i + 1}. ${spread.slots[i]}：${p.card.name}（${p.card.nameEn}）${p.reversed ? '逆位' : '正位'}`).join('\n')}
請將所有牌串連成一個完整的故事線來解讀（不要一張一張孤立解釋），特別注意牌與牌之間的呼應與轉折，最後給出具體可行的建議。`);
          readEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  });
})();
