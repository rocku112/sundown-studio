/* 暮卜先知 · 八字合婚 */
(() => {
  function wuxingCount(p) {
    const c = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    for (const k of ['year', 'month', 'day', 'hour']) { c[p[k].ganWx]++; c[p[k].zhiWx]++; }
    return c;
  }
  // 納音五行字
  const nayinWx = (nayin) => ['金', '木', '水', '火', '土'].find(w => nayin.includes(w));

  // 日主強弱（同 bazi.js 簡化判法：月令權重加倍，同我/生我為助）
  function strengthOf(p) {
    const me = p.day.ganWx;
    const shengMe = Object.entries(Ganzhi.WX_SHENG).find(([, v]) => v === me)[0];
    let score = 0, total = 0;
    const items = [
      [p.year.ganWx, 1], [p.month.ganWx, 1], [p.hour.ganWx, 1],
      [p.year.zhiWx, 1], [p.month.zhiWx, 2.5], [p.day.zhiWx, 1], [p.hour.zhiWx, 1]
    ];
    for (const [wx, w] of items) { total += w; if (wx === me || wx === shengMe) score += w; }
    const ratio = score / total;
    return { ratio, label: ratio >= 0.5 ? '偏強' : ratio >= 0.35 ? '中和' : '偏弱', shengMe };
  }
  // 喜用神粗判：身強洩剋、身弱生扶
  function likeOf(p) {
    const str = strengthOf(p);
    return str.label === '偏強' ? Ganzhi.WX_SHENG[p.day.ganWx] : (str.label === '偏弱' ? str.shengMe : p.day.ganWx);
  }

  // 十神正緣意涵：對方日主在我命中扮演的角色
  const GOD_TEXT = {
    正官: { pts: 8, text: '你代表著責任與依靠——正官是傳統最推崇的夫妻星，主穩定與名分。' },
    七殺: { pts: 2, text: '你對對方充滿強烈吸引力與挑戰性，悸動猛烈但也需要學會收放，避免變成壓迫。' },
    正財: { pts: 8, text: '你是對方想珍惜、想守護的對象——正財主實質的疼惜與經營，是務實而長久的緣分。' },
    偏財: { pts: 3, text: '你對對方充滿魅力與新鮮感，帶來浪漫悸動，但也提醒雙方要有意識地經營忠誠感。' },
    食神: { pts: 6, text: '相處起來輕鬆愉快，你能給對方帶來滋養與樂趣，主溫和知足的陪伴。' },
    傷官: { pts: -2, text: '你的個性鮮明、有主見，對方會被你的才華吸引，但也主直言易起摩擦，需多包容彼此的稜角。' },
    比肩: { pts: 3, text: '像朋友、像戰友，彼此平等對待，情誼細水長流但少了點被照顧的浪漫感。' },
    劫財: { pts: -3, text: '個性同樣強勢，容易在主導權或金錢觀上較勁，需刻意練習退讓。' },
    正印: { pts: 6, text: '你會讓對方感覺被理解、被照顧，主精神上的滋養與安定感。' },
    偏印: { pts: -1, text: '彼此之間帶著若即若離的距離感，是特殊而深刻的緣分，但需要更多耐心培養親密感。' }
  };

  function personForm(label) {
    return `<div style="flex:1;min-width:280px">
      <h4 style="margin-top:0">${label}</h4>
      <div class="form-grid">
        <div class="field"><label>年</label><input type="number" class="hh-y" value="1990" min="1900" max="2100" style="width:90px"></div>
        <div class="field"><label>月</label><input type="number" class="hh-m" value="1" min="1" max="12" style="width:64px"></div>
        <div class="field"><label>日</label><input type="number" class="hh-d" value="1" min="1" max="31" style="width:64px"></div>
        <div class="field"><label>時</label><input type="number" class="hh-h" value="12" min="0" max="23" style="width:64px"></div>
        <div class="field"><label>性別</label><select class="hh-g" style="width:72px"><option value="M">男</option><option value="F">女</option></select></div>
      </div>
    </div>`;
  }
  function readPerson(root) {
    const g = (cls) => +root.querySelector(cls).value;
    return { y: g('.hh-y'), m: g('.hh-m'), d: g('.hh-d'), hh: g('.hh-h'), gender: root.querySelector('.hh-g').value };
  }

  function match(A, B) {
    const pa = Ganzhi.fourPillars(A.y, A.m, A.d, A.hh);
    const pb = Ganzhi.fourPillars(B.y, B.m, B.d, B.hh);
    const items = [];
    let score = 50;
    const add = (pts, title, text, good) => { score += pts; items.push({ pts, title, text, good }); };

    // 1. 生肖（年支）
    const yr = Ganzhi.zhiRelation(pa.year.zhiIdx, pb.year.zhiIdx);
    const sxA = pa.year.shengxiao || Ganzhi.SHENGXIAO[pa.year.zhiIdx];
    const sxB = pb.year.shengxiao || Ganzhi.SHENGXIAO[pb.year.zhiIdx];
    const yrPts = { 六合: 15, 三合: 12, 同支: 5, 平: 5, 六害: -8, 相刑: -10, 自刑: -10, 六沖: -12 }[yr.type];
    add(yrPts, `生肖：${sxA} × ${sxB}（${yr.type}）`,
      yr.good === true ? '生肖相合，家運同心，長輩緣分佳。' : yr.good === false ? '生肖相犯，價值觀與家庭觀需多磨合，非不能解，重在溝通。' : '生肖無沖無合，平穩之配。', yr.good);

    // 2. 日支（夫妻宮）
    const dr = Ganzhi.zhiRelation(pa.day.zhiIdx, pb.day.zhiIdx);
    const drPts = { 六合: 18, 三合: 14, 同支: 6, 平: 6, 六害: -10, 相刑: -12, 自刑: -12, 六沖: -15 }[dr.type];
    add(drPts, `夫妻宮：${pa.day.zhi} × ${pb.day.zhi}（${dr.type}）`,
      dr.good === true ? '日支相合是合婚裡最重的吉訊——婚後同床同心，生活步調合拍。' : dr.good === false ? '日支相犯主婚後生活習慣與情緒對沖，宜聚少離多式經營或刻意保留個人空間。' : '夫妻宮平順，無大沖剋。', dr.good);

    // 3. 日干（本人元神）
    const gr = Ganzhi.ganRelation(pa.day.ganIdx, pb.day.ganIdx);
    const grPts = { 五合: 15, 相生: 10, 比和: 6, 相剋: -6 }[gr.type];
    add(grPts, `日主：${pa.day.gan}${pa.day.ganWx} × ${pb.day.gan}${pb.day.ganWx}（${gr.type}）`,
      gr.type === '五合' ? '日干五合，天作之合之象，彼此天生投緣、互相吸引。'
        : gr.type === '相生' ? '日主相生，一方滋養另一方，相處舒服自然。'
        : gr.type === '比和' ? '日主同氣，像朋友也像戰友，平等但少了點火花。'
        : '日主相剋，強弱互見，吸引也強、摩擦也強，需學會欣賞差異。', gr.good);

    // 4. 五行互補
    const wa = wuxingCount(pa), wb = wuxingCount(pb);
    let comp = 0; const compNotes = [];
    for (const x of ['木', '火', '土', '金', '水']) {
      if (wa[x] === 0 && wb[x] >= 2) { comp += 5; compNotes.push(`乙方的${x}補了甲方所缺`); }
      if (wb[x] === 0 && wa[x] >= 2) { comp += 5; compNotes.push(`甲方的${x}補了乙方所缺`); }
      if (wa[x] === 0 && wb[x] === 0) { comp -= 3; compNotes.push(`兩人皆缺${x}`); }
    }
    comp = Math.max(-6, Math.min(10, comp));
    add(comp, `五行互補（${comp >= 0 ? '+' : ''}${comp}）`,
      compNotes.length ? compNotes.join('；') + '。' : '兩人五行俱全，各自氣場完整。', comp >= 0);

    // 5. 年柱納音
    const na = nayinWx(pa.year.nayin), nb = nayinWx(pb.year.nayin);
    let nr, nrPts;
    if (na === nb) { nr = '比和'; nrPts = 4; }
    else if (Ganzhi.WX_SHENG[na] === nb || Ganzhi.WX_SHENG[nb] === na) { nr = '相生'; nrPts = 8; }
    else { nr = '相剋'; nrPts = -4; }
    add(nrPts, `年命納音：${pa.year.nayin} × ${pb.year.nayin}（${nr}）`,
      nr === '相生' ? '年命納音相生，古法謂之「福祿相承」。' : nr === '比和' ? '納音同氣，家庭氛圍相似易理解彼此。' : '納音相剋，原生家庭背景差異較大，婚前多認識彼此家庭為宜。', nrPts > 0);

    // 6. 十神正緣（雙向：甲方日主在乙方眼中是什麼角色，反之亦然）
    const godAB = Ganzhi.tenGod(pb.day.ganIdx, pa.day.ganIdx); // 甲方於乙方為
    const godBA = Ganzhi.tenGod(pa.day.ganIdx, pb.day.ganIdx); // 乙方於甲方為
    const gAB = GOD_TEXT[godAB], gBA = GOD_TEXT[godBA];
    add(gAB.pts + gBA.pts, `十神正緣：甲方於乙方為「${godAB}」・乙方於甲方為「${godBA}」`,
      `甲方於乙方：${gAB.text}<br>乙方於甲方：${gBA.text}`, (gAB.pts + gBA.pts) >= 0);

    // 7. 喜用神互補（對方旺的五行是否正好補了我所喜用）
    const likeA = likeOf(pa), likeB = likeOf(pb);
    let xyPts = 0; const xyNotes = [];
    if (wb[likeA] >= 2) { xyPts += 6; xyNotes.push(`乙方八字中的${likeA}旺，剛好是甲方的喜用神，能有效補益甲方`); }
    if (wa[likeB] >= 2) { xyPts += 6; xyNotes.push(`甲方八字中的${likeB}旺，剛好是乙方的喜用神，能有效補益乙方`); }
    if (wb[likeA] === 0) { xyPts -= 3; xyNotes.push(`乙方命中缺甲方所喜用的${likeA}，助益較弱`); }
    if (wa[likeB] === 0) { xyPts -= 3; xyNotes.push(`甲方命中缺乙方所喜用的${likeB}，助益較弱`); }
    xyPts = Math.max(-6, Math.min(10, xyPts));
    add(xyPts, `喜用神互補（甲喜${likeA}・乙喜${likeB}）`,
      xyNotes.length ? xyNotes.join('；') + '。' : '雙方喜用神在彼此命中皆無顯著助益或損傷，中性之配。', xyPts >= 0);

    score = Math.max(5, Math.min(98, score));
    const grade = score >= 85 ? '天作之合' : score >= 72 ? '上等婚配' : score >= 58 ? '中上之配' : score >= 45 ? '中等・需磨合' : '多有考驗・重在經營';
    return { pa, pb, items, score, grade, wa, wb };
  }

  App.register({
    id: 'hehun',
    icon: Icons.svg('hehun'),
    title: '八字合婚',
    desc: '雙方八字生肖、夫妻宮、日主、五行、納音五重比對，附契合評分。',
    render(el) {
      el.innerHTML = `
        <div class="panel">
          <h3>輸入雙方國曆生日</h3>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div class="hh-a" style="flex:1;min-width:280px">${personForm('甲方')}</div>
            <div class="hh-b" style="flex:1;min-width:280px">${personForm('乙方')}</div>
          </div>
          <button class="btn" id="hh-go" style="margin-top:14px">${Icons.svg('hehun')} 合 婚</button>
          <p class="muted" style="margin-top:8px">依傳統合婚法比對；出生時辰不確定可先填 12 時（僅影響時柱五行統計，不影響主要判斷）。</p>
        </div>
        <div id="hh-result"></div>`;

      el.querySelector('#hh-go').addEventListener('click', () => {
        const A = readPerson(el.querySelector('.hh-a'));
        const B = readPerson(el.querySelector('.hh-b'));
        const resEl = el.querySelector('#hh-result');
        resEl.innerHTML = '';
        const r = match(A, B);

        const color = r.score >= 72 ? 'var(--gold-deep)' : r.score >= 45 ? 'var(--ink-dim)' : 'var(--cinnabar)';
        const div = document.createElement('div');
        div.innerHTML = `<div class="panel result">
          <div style="text-align:center">
            <div class="muted">甲方 ${r.pa.year.name}年${r.pa.month.name}月${r.pa.day.name}日 × 乙方 ${r.pb.year.name}年${r.pb.month.name}月${r.pb.day.name}日</div>
            <div style="font-size:56px;font-weight:700;color:${color};line-height:1.4">${r.score}<span style="font-size:20px">分</span></div>
            <span class="fortune-level ${r.score >= 72 ? 'good' : r.score >= 45 ? 'mid' : 'bad'}">${r.grade}</span>
          </div>
          <hr class="divider">
          ${r.items.map(it => `<div class="aspect" style="margin-top:10px;border-left:3px solid ${it.good === false ? 'var(--cinnabar)' : it.good ? 'var(--gold-mid)' : 'var(--panel-border)'}">
            <b style="display:flex;justify-content:space-between">${it.title}<span style="color:${it.pts >= 0 ? 'var(--gold-deep)' : 'var(--cinnabar)'}">${it.pts >= 0 ? '+' : ''}${it.pts}</span></b>
            ${it.text}</div>`).join('')}
          <p class="muted" style="margin-top:12px">※ 合婚是參考不是判決——分數低代表需要更多理解與經營，不代表不能在一起。完整喜用神層面的深度合參請用 AI 解讀。</p>
        </div>`;
        resEl.appendChild(div);

        AI.attach(div.querySelector('.panel'), () =>
          `請做八字合婚深度分析。
甲方（${A.gender === 'M' ? '男' : '女'}）：${A.y}/${A.m}/${A.d} ${A.hh}時生，四柱：${r.pa.year.name} ${r.pa.month.name} ${r.pa.day.name} ${r.pa.hour.name}，五行：${Object.entries(r.wa).map(([k, v]) => k + v).join(' ')}
乙方（${B.gender === 'M' ? '男' : '女'}）：${B.y}/${B.m}/${B.d} ${B.hh}時生，四柱：${r.pb.year.name} ${r.pb.month.name} ${r.pb.day.name} ${r.pb.hour.name}，五行：${Object.entries(r.wb).map(([k, v]) => k + v).join(' ')}
初步比對：${r.items.map(it => `${it.title}${it.pts >= 0 ? '+' : ''}${it.pts}`).join('；')}，總分 ${r.score}（${r.grade}）
請深入分析：1) 雙方日主強弱與喜用神是否互補（已知甲喜${likeOf(r.pa)}、乙喜${likeOf(r.pb)}，請結合合沖刑害精確判斷，可修正粗判）2) 彼此在對方命中扮演的十神角色（正緣程度，已知甲於乙為「${Ganzhi.tenGod(r.pb.day.ganIdx, r.pa.day.ganIdx)}」、乙於甲為「${Ganzhi.tenGod(r.pa.day.ganIdx, r.pb.day.ganIdx)}」）3) 性格與相處模式 4) 婚後家庭與財務互動 5) 需要注意的年份（沖夫妻宮之流年）6) 給這對組合的相處建議。`);
      });
    }
  });
})();
