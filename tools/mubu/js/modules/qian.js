/* 暮卜先知 · 求籤（日落靈籤六十首） */
(() => {
  const NUM_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function numCN(n) {
    if (n <= 10) return NUM_CN[n - 1];
    if (n < 20) return '十' + NUM_CN[n - 11];
    if (n % 10 === 0) return NUM_CN[Math.floor(n / 10) - 1] + '十';
    return NUM_CN[Math.floor(n / 10) - 1] + '十' + NUM_CN[n % 10 - 1];
  }

  function show(container, q, question) {
    const html = `<div class="panel result">
      <div style="text-align:center">
        <div class="muted">${question ? `所問：${question}` : '誠心所求'}</div>
        <div style="font-size:22px;letter-spacing:.2em;color:var(--gold-bright);margin:8px 0">第${numCN(q.id)}籤</div>
        <span class="fortune-level ${App.fortuneClass(q.level)}">${q.level}</span>
      </div>
      <hr class="divider">
      <div class="poem">${q.poem.join('<br>')}</div>
      <hr class="divider">
      <div style="text-align:center">
        <h4>解曰</h4>
        <p style="letter-spacing:.1em">${q.jieyue.join('　')}</p>
        <p class="muted" style="margin-top:6px">籤意：${q.story}</p>
      </div>
      <hr class="divider">
      <h4>總解</h4><p>${q.aspects.overall}</p>
      ${App.aspectGrid([['功名事業', q.aspects.career], ['姻緣感情', q.aspects.love], ['求財', q.aspects.wealth], ['健康', q.aspects.health]])}
    </div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    container.appendChild(div);
    AI.attach(div.querySelector('.panel'), () =>
      `請為以下求得的籤詩做深度解籤。
所問之事：${question || '（未說明，做整體運勢解讀）'}
第${numCN(q.id)}籤（${q.level}）
籤詩：${q.poem.join('，')}
解曰：${q.jieyue.join('、')}
籤意典故：${q.story}
請逐句解析籤詩意象，結合所問之事給出具體指引；若為下籤請同時給出趨吉避凶的化解方向。`);
  }

  App.register({
    id: 'qian',
    icon: '🎋',
    title: '求籤',
    desc: '默念所求，誠心抽一支日落靈籤，六十籤藏人生百味。',
    render(el) {
      el.innerHTML = `
        <div class="panel" style="text-align:center">
          <h3>誠心默念所求之事</h3>
          <div class="field" style="margin:0 auto 14px;max-width:420px">
            <input class="qq-q" placeholder="心中所問（可留空）" style="width:100%;text-align:center">
          </div>
          <div id="qq-tube" style="font-size:72px;transition:transform .1s">🏮</div>
          <button class="btn" id="qq-draw" style="margin-top:10px">🎋 求 籤</button>
        </div>
        <div id="qq-result"></div>`;
      const tube = el.querySelector('#qq-tube');
      const btn = el.querySelector('#qq-draw');
      btn.addEventListener('click', () => {
        const resEl = el.querySelector('#qq-result');
        resEl.innerHTML = '';
        btn.disabled = true;
        // 搖籤動畫
        let t = 0;
        const shake = setInterval(() => {
          tube.style.transform = `rotate(${(Math.random() - 0.5) * 30}deg) translateX(${(Math.random() - 0.5) * 10}px)`;
          if (++t > 12) {
            clearInterval(shake);
            tube.style.transform = '';
            btn.disabled = false;
            const q = QIAN_DATA[Math.floor(Math.random() * QIAN_DATA.length)];
            show(resEl, q, el.querySelector('.qq-q').value.trim());
            resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 90);
      });
    }
  });
})();
