/* 暮卜先知 · 姓名速配（趣味合參：非傳統命理方法，取材自三才五格數理的原創合參玩法） */
(() => {
  const { strokeOf, fiveGrids, luckOf, sancaiPair, wxSheng, wxKe, SHULI } = window.NamingEngine;

  // 81數理裡常見的「桃花數」「藝術數」等特殊暗示（同 naming.js 的簡化分類，用於速配彩蛋）
  const SPECIAL_NUMS = {
    桃花數: [5, 15, 16, 24, 32], 藝術數: [13, 14, 26, 29, 33, 42], 剛情數: [7, 17, 18, 27, 37],
    溫和數: [5, 6, 11, 15, 24, 31, 35], 薄弱數: [4, 10, 12, 14, 19, 22, 28, 34]
  };
  const specialOf = (n) => Object.entries(SPECIAL_NUMS).filter(([, arr]) => arr.includes(((n - 1) % 81) + 1)).map(([k]) => k);

  function wxRel(a, b) {
    if (a === b) return { type: '比和', good: true };
    if (wxSheng[a] === b || wxSheng[b] === a) return { type: '相生', good: true };
    return { type: '相剋', good: false };
  }

  function parseName(surname, given) {
    const surStrokes = [...surname].map(strokeOf);
    const nameStrokes = [...given].map(strokeOf);
    return { surname, given, surStrokes, nameStrokes, ok: surStrokes.every(Boolean) && nameStrokes.every(Boolean) };
  }

  function match(A, B) {
    const gA = fiveGrids(A.surStrokes, A.nameStrokes), gB = fiveGrids(B.surStrokes, B.nameStrokes);
    const items = [];
    let score = 50;
    const add = (pts, title, text, good) => { score += pts; items.push({ pts, title, text, good }); };

    // 1. 人格五行（個性核心）關係
    const renWxA = gA.sancai[1], renWxB = gB.sancai[1];
    const renRel = wxRel(renWxA, renWxB);
    const renPts = { 比和: 6, 相生: 12, 相剋: -8 }[renRel.type];
    add(renPts, `人格五行（個性核心）：${renWxA} × ${renWxB}（${renRel.type}）`,
      renRel.type === '相生' ? '雙方個性核心相生，一方特質恰好能滋養另一方，相處起來自然舒服。'
        : renRel.type === '比和' ? '個性核心同氣，價值觀與步調相近，像朋友一樣好懂彼此。'
        : '個性核心相剋，性格特質有明顯落差，吸引力與磨合都強，需要學會欣賞差異。', renRel.good);

    // 2. 三才配置是否皆順（各自命名結構穩不穩）
    const bothGood = gA.sancaiGood && gB.sancaiGood;
    const oneGood = gA.sancaiGood || gB.sancaiGood;
    add(bothGood ? 10 : oneGood ? 3 : -5, '雙方三才配置',
      bothGood ? '兩人的姓名三才皆屬相生佳配，各自根基穩、氣場穩定，合作或相處都少後顧之憂。'
        : oneGood ? '一方三才穩健、另一方稍有波折，穩定的一方可以是關係裡的定錨。'
        : '兩人三才皆有相剋，個別命名結構都偏波折，相處上要更有意識地互相扶持。', bothGood ? true : oneGood ? null : false);

    // 3. 總格（後運）搭配：看兩人各自的晚運吉凶是否合拍
    const lA = luckOf(gA.zong), lB = luckOf(gB.zong);
    const zongScore = { 吉: 2, 半吉: 1, 凶: 0 };
    const zongPts = (zongScore[lA] + zongScore[lB]) * 3 - 6;
    add(zongPts, `總格（後運）：${A.surname}${A.given} ${gA.zong}（${lA}） × ${B.surname}${B.given} ${gB.zong}（${lB}）`,
      lA === '吉' && lB === '吉' ? '兩人後運皆吉，晚年運勢同步向好，是能一起變老、越走越順的配置。'
        : (lA === '凶' && lB === '凶') ? '兩人後運皆有考驗，宜互相提醒、共同經營，別把壓力都放在同一人身上。'
        : '兩人後運吉凶不同步，運勢好的一方可多分擔、多扶持運勢較弱的一方。', zongPts >= 0);

    // 4. 數理特殊暗示重疊（趣味彩蛋：兩人是否都帶同一種特殊數理氣質）
    const spA = new Set([gA.ren, gA.zong].flatMap(specialOf));
    const spB = new Set([gB.ren, gB.zong].flatMap(specialOf));
    const shared = [...spA].filter(s => spB.has(s));
    if (shared.length) {
      add(shared.includes('桃花數') || shared.includes('溫和數') ? 5 : -2, `共同數理氣質：${shared.join('、')}`,
        shared.includes('桃花數') ? '兩人姓名都帶桃花數，彼此的吸引力與魅力氣場相近，容易一見如故。'
          : shared.includes('溫和數') ? '兩人姓名都帶溫和數，相處起來都重和諧，衝突少、氛圍融洽。'
          : `兩人姓名都帶${shared[0]}，個性某方面同頻，但也可能同樣的弱點會互相放大，需留意。`, shared.includes('桃花數') || shared.includes('溫和數'));
    }

    score = Math.max(5, Math.min(98, score));
    const grade = score >= 85 ? '天作之合' : score >= 72 ? '上等速配' : score >= 58 ? '中上之配' : score >= 45 ? '中等・需磨合' : '差異較大・重在經營';
    return { gA, gB, items, score, grade };
  }

  function personForm(label) {
    return `<div style="flex:1;min-width:240px">
      <h4 style="margin-top:0">${label}</h4>
      <div class="form-grid">
        <div class="field"><label>姓氏</label><input class="nm2-sur" placeholder="陳" style="width:70px"></div>
        <div class="field"><label>名字</label><input class="nm2-name" placeholder="美玲" style="width:100px"></div>
      </div>
    </div>`;
  }

  function render(el) {
    el.innerHTML = `
      <div class="panel">
        <h3>輸入雙方姓名</h3>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div class="nm2-a" style="flex:1;min-width:240px">${personForm('甲方')}</div>
          <div class="nm2-b" style="flex:1;min-width:240px">${personForm('乙方')}</div>
        </div>
        <button class="btn" id="nm2-go" style="margin-top:14px">${Icons.svg('namematch')} 速配分析</button>
        <p class="muted" style="margin-top:8px">※ 這是取材自三才五格數理的原創趣味合參玩法，並非傳統命理方法，僅供娛樂參考——姓名學傳統上並不直接論兩人配對，真要看合婚合盤，建議搭配「八字合婚」或「占星合盤」。</p>
      </div>
      <div id="nm2-result"></div>`;

    el.querySelector('#nm2-go').addEventListener('click', () => {
      const surA = el.querySelector('.nm2-a .nm2-sur').value.trim(), nameA = el.querySelector('.nm2-a .nm2-name').value.trim();
      const surB = el.querySelector('.nm2-b .nm2-sur').value.trim(), nameB = el.querySelector('.nm2-b .nm2-name').value.trim();
      const resEl = el.querySelector('#nm2-result');
      if (!surA || !nameA || !surB || !nameB) { resEl.innerHTML = '<div class="panel result"><p style="color:var(--cinnabar)">⚠ 請完整輸入雙方姓氏與名字</p></div>'; return; }
      const A = parseName(surA, nameA), B = parseName(surB, nameB);
      if (!A.ok || !B.ok) {
        resEl.innerHTML = `<div class="panel result"><p style="color:var(--cinnabar)">⚠ ${!A.ok ? `「${surA}${nameA}」` : `「${surB}${nameB}」`}含查無筆劃的字，暫無法分析（可能為罕用字或異體字）</p></div>`;
        return;
      }
      const r = match(A, B);
      const color = r.score >= 72 ? 'var(--gold-deep)' : r.score >= 45 ? 'var(--ink-dim)' : 'var(--cinnabar)';
      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <div style="text-align:center">
          <div class="muted">${A.surname}${A.given}（人格${r.gA.ren}・總格${r.gA.zong}） × ${B.surname}${B.given}（人格${r.gB.ren}・總格${r.gB.zong}）</div>
          <div style="font-size:56px;font-weight:700;color:${color};line-height:1.4">${r.score}<span style="font-size:20px">分</span></div>
          <span class="fortune-level ${r.score >= 72 ? 'good' : r.score >= 45 ? 'mid' : 'bad'}">${r.grade}</span>
        </div>
        <hr class="divider">
        ${r.items.map(it => `<div class="aspect" style="margin-top:10px;border-left:3px solid ${it.good === false ? 'var(--cinnabar)' : it.good ? 'var(--gold-mid)' : 'var(--panel-border)'}">
          <b style="display:flex;justify-content:space-between">${it.title}<span style="color:${it.pts >= 0 ? 'var(--gold-deep)' : 'var(--cinnabar)'}">${it.pts >= 0 ? '+' : ''}${it.pts}</span></b>
          ${it.text}</div>`).join('')}
        <p class="muted" style="margin-top:12px">※ 分數是趣味參考，不是傳統命理定論——姓名只是後天輔助，真正的合適與否，還是要相處過才知道。</p>
      </div>`;
      resEl.innerHTML = '';
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請以有趣但不失專業的角度，分析「${A.surname}${A.given}」與「${B.surname}${B.given}」這兩個名字放在一起的「合拍程度」（這是趣味合參，非傳統命理方法，請保持輕鬆但有洞察的語氣）。
甲方：三才${r.gA.sancai.join('')}、人格${r.gA.ren}、總格${r.gA.zong}
乙方：三才${r.gB.sancai.join('')}、人格${r.gB.ren}、總格${r.gB.zong}
初步比對：${r.items.map(it => `${it.title}${it.pts >= 0 ? '+' : ''}${it.pts}`).join('；')}，總分 ${r.score}（${r.grade}）
請分析：1) 兩個名字給人的整體氣質印象是否合拍 2) 從數理看兩人可能的相處模式 3) 給這對組合一句幽默但溫暖的總評。`);
    });
  }

  // 供八字合婚等模組共用姓名合參（避免重複實作）
  window.NameMatchEngine = { parseName, match };

  App.register({
    id: 'namematch',
    icon: Icons.svg('namematch'),
    title: '姓名速配',
    desc: '趣味合參：從雙方三才五格數理，速配兩個名字放在一起的合拍程度（非傳統命理方法，好玩用）。',
    render
  });
})();
