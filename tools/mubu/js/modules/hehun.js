/* 暮卜先知 · 八字合婚 */
(() => {
  // 納音五行字
  const nayinWx = (nayin) => ['金', '木', '水', '火', '土'].find(w => nayin.includes(w));
  // 喜用神粗判：與八字命理模組共用同一套強弱判斷（Ganzhi.strength）
  const likeOf = (p) => Ganzhi.strength(p).like;

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

  // 生肖（年支）逐關係解讀——年支主家庭觀、長輩緣與外在相處
  const YR_TEXT = {
    六合: '生肖六合，是最直接的相合——你們對家庭的看法、生活的節奏天生合拍，雙方長輩也容易互相看順眼，屬「一見投緣、越處越親」的組合。',
    三合: '生肖三合，同屬一氣局、志同道合，價值觀與人生方向相近，能一起把日子往同個方向經營，助力多、阻力少。',
    同支: '生肖相同，性情與喜好相近、容易懂彼此；但也可能同樣的盲點會一起放大，需有一方多點彈性與提醒。',
    平: '生肖之間無沖無合，是平穩的組合——緣分不靠先天加持，靠的是後天用心經營，反而更能細水長流。',
    六害: '生肖相害，容易在小地方互相消磨、暗生嫌隙，尤其涉及雙方家庭時要多留心；凡事把話講開，比悶在心裡好。',
    相刑: '生肖相刑，相處中容易有無形的壓力與拉扯，價值觀的摩擦需要耐心磨合，切忌鑽牛角尖、翻舊帳。',
    自刑: '生肖自刑，兩人都容易把情緒往內收、自我糾結，需刻意練習向對方表達真實想法，別讓誤會累積。',
    六沖: '生肖相沖，個性與家庭觀差異明顯，容易一言不合就針鋒相對；但沖也代表吸引力強，若能互相尊重差異，反能激盪出成長。'
  };
  // 夫妻宮（日支）逐關係解讀——合婚中分量最重
  const DR_TEXT = {
    六合: '夫妻宮六合，是合婚裡分量最重的吉訊——婚後同床同心、生活步調合拍，連生活習慣的小細節都容易一拍即合，是相看兩不厭的組合。',
    三合: '夫妻宮三合，兩人在親密關係裡默契十足、互相成就，能一起把小家庭經營得有聲有色，是助力型的伴侶。',
    同支: '夫妻宮同支，生活習慣與作息高度相似、容易理解對方需求；但也要小心太像而少了新鮮感，需刻意製造驚喜。',
    平: '夫妻宮無沖無合，親密關係平順無大波瀾——感情靠的是日常的用心累積，而非天生的火花。',
    六害: '夫妻宮相害，婚後容易在生活習慣、情緒需求上暗自消磨，宜保留各自的空間、避免過度黏膩，有不滿及時說出口。',
    相刑: '夫妻宮相刑，親密關係裡容易有說不清的壓力與拉扯，相處久了摩擦浮現，需要極大的耐心與包容。',
    自刑: '夫妻宮自刑，兩人在關係裡都容易悶著、自我內耗，特別需要練習坦誠溝通，別讓小情緒累積成大心結。',
    六沖: '夫妻宮相沖，是合婚裡最需留意的一項——婚後生活習慣與情緒容易正面對撞，建議以聚少離多式（如各有事業、分房）或刻意保留個人空間的方式經營，反能長久。'
  };
  // 日主（日干）逐關係解讀——本人元神、個性核心
  const GR_TEXT = {
    五合: '日干五合，天作之合之象——兩人的核心個性天生互補相吸，有種說不出的默契與磁性，是最容易「來電」的組合。',
    相生: '日主相生，一方的特質恰好能滋養另一方，相處起來舒服自然、如沐春風，能互相扶持成長。',
    比和: '日主同氣，像朋友也像戰友，價值觀相近、平等對待；穩定但少了點浪漫火花，需靠新鮮感維繫熱度。',
    相剋: '日主相剋，兩人個性強弱互見、風格迥異，吸引力強、摩擦也強；關鍵在於把「差異」當成互補而非對立，學會欣賞對方跟自己不一樣的地方。'
  };
  // 年命納音逐關係解讀——原生家庭背景與底層氣質
  const NR_TEXT = {
    相生: '年命納音相生，古法謂之「福祿相承」——兩人的原生家庭背景與底層氣質能互相承接、彼此加分，是家庭層面順遂的吉象。',
    比和: '納音同氣，兩人的家庭氛圍與成長背景相似，容易理解彼此的價值觀與生活習慣，磨合成本低。',
    相剋: '納音相剋，兩人的原生家庭背景、底層價值觀差異較大；婚前多花時間認識彼此的家庭與成長經歷，能省去婚後不少摩擦。'
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
      <div class="form-grid" style="margin-top:6px">
        <div class="field"><label>姓氏<span class="muted">（選填）</span></label><input class="hh-sur" placeholder="陳" style="width:70px"></div>
        <div class="field"><label>名字<span class="muted">（選填）</span></label><input class="hh-name" placeholder="美玲" style="width:100px"></div>
      </div>
    </div>`;
  }
  function readPerson(root) {
    const g = (cls) => +root.querySelector(cls).value;
    return {
      y: g('.hh-y'), m: g('.hh-m'), d: g('.hh-d'), hh: g('.hh-h'), gender: root.querySelector('.hh-g').value,
      surname: root.querySelector('.hh-sur').value.trim(), given: root.querySelector('.hh-name').value.trim()
    };
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
    add(yrPts, `生肖：${sxA} × ${sxB}（${yr.type}）`, YR_TEXT[yr.type] || '生肖平穩之配。', yr.good);

    // 2. 日支（夫妻宮）
    const dr = Ganzhi.zhiRelation(pa.day.zhiIdx, pb.day.zhiIdx);
    const drPts = { 六合: 18, 三合: 14, 同支: 6, 平: 6, 六害: -10, 相刑: -12, 自刑: -12, 六沖: -15 }[dr.type];
    add(drPts, `夫妻宮：${pa.day.zhi} × ${pb.day.zhi}（${dr.type}）`, DR_TEXT[dr.type] || '夫妻宮平順，無大沖剋。', dr.good);

    // 3. 日干（本人元神）
    const gr = Ganzhi.ganRelation(pa.day.ganIdx, pb.day.ganIdx);
    const grPts = { 五合: 15, 相生: 10, 比和: 6, 相剋: -6 }[gr.type];
    add(grPts, `日主：${pa.day.gan}${pa.day.ganWx} × ${pb.day.gan}${pb.day.ganWx}（${gr.type}）`, GR_TEXT[gr.type] || '', gr.good);

    // 4. 五行互補
    const wa = Ganzhi.wuxingCount(pa), wb = Ganzhi.wuxingCount(pb);
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
    add(nrPts, `年命納音：${pa.year.nayin} × ${pb.year.nayin}（${nr}）`, NR_TEXT[nr] || '', nrPts > 0);

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

    // 8. 夫妻宮交叉沖合：不只看「年支對年支、日支對日支」，也檢查甲乙雙方 4×4 柱位交叉關係
    // （例如甲方日支沖乙方年支），傳統合婚常見但前七項尚未涵蓋的一塊
    const CROSS_PTS = { 六合: 6, 三合: 5, 同支: 2, 六害: -5, 相刑: -6, 自刑: -6, 六沖: -7 };
    const cross = Ganzhi.crossRelations(pa, pb)
      .filter(r => !(r.sameCol && (r.posA === '年' || r.posA === '日'))) // 排除已在項目1、2呈現的同位比對
      .map(r => ({ ...r, pts: Math.round(CROSS_PTS[r.type] * (r.posA === '日' || r.posB === '日' ? 1.3 : 1)) }))
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts))
      .slice(0, 6);
    if (cross.length) {
      const crossTotal = Math.max(-14, Math.min(14, cross.reduce((s, r) => s + r.pts, 0)));
      add(crossTotal, `夫妻宮交叉沖合（${cross.length} 組）`,
        cross.map(r => `甲方${r.posA}支${r.zhiA} × 乙方${r.posB}支${r.zhiB}（${r.type}）`).join('、') + '。',
        crossTotal >= 0);
    }

    // 9. 現行大運同步（兩人此刻各行什麼運、是否同頻）——合婚實務重視「運勢是否合拍」
    const nowD = new Date();
    const ageOf = (P) => nowD.getFullYear() - P.y - ((nowD.getMonth() + 1 < P.m || (nowD.getMonth() + 1 === P.m && nowD.getDate() < P.d)) ? 1 : 0);
    const dyOf = (P, pil) => {
      const lk = Ganzhi.luck(P.y, P.m, P.d, P.hh, P.gender, pil);
      const age = ageOf(P);
      const cur = lk.list.find(x => age >= x.age && age <= x.age + 9);
      return cur ? { cur, age } : null;
    };
    const dyJudge = (cur, like) => {
      let s = 0;
      for (const w of [cur.ganWx, cur.zhiWx]) {
        if (w === like) s += 2;
        else if (Ganzhi.WX_SHENG[w] === like) s += 1;          // 生我喜用
        else if (Ganzhi.WX_KE[w] === like) s -= 2;             // 剋我喜用
      }
      return s >= 2 ? { label: '行喜運', cls: 'good' } : s <= -2 ? { label: '行忌運', cls: 'bad' } : { label: '運平', cls: 'mid' };
    };
    const dA = dyOf(A, pa), dB = dyOf(B, pb);
    if (dA && dB) {
      const jA = dyJudge(dA.cur, likeA), jB = dyJudge(dB.cur, likeB);
      const goodN = [jA, jB].filter(j => j.cls === 'good').length;
      const badN = [jA, jB].filter(j => j.cls === 'bad').length;
      let pts, txt;
      if (goodN === 2) { pts = 8; txt = '兩人現階段<b>同行喜運</b>，運勢同頻向上——此時共同開展（結婚、置產、創業）阻力最小，是難得的順風期。'; }
      else if (badN === 2) { pts = -6; txt = '兩人現階段<b>同行忌運</b>，各自都在辛苦期——此時容易彼此消耗、把外在壓力帶回關係中，宜多體諒、少在此時做重大決定。'; }
      else if (goodN === 1 && badN === 1) { pts = 0; txt = '一方行喜運、一方行忌運——順的一方正好可以拉拔、支撐辛苦的一方，是考驗也是互補，關鍵在順的一方願不願意扶持。'; }
      else if (goodN === 1) { pts = 4; txt = '一方行喜運、一方運勢平穩，整體氣機偏順，可由行運較旺者主導推進。'; }
      else { pts = badN ? -2 : 1; txt = badN ? '一方行忌運、另一方平平，宜彼此體諒，避免在低潮期互相要求。' : '兩人現行大運皆屬平穩，關係以本命契合度為主，運勢面無特別助力或阻力。'; }
      add(pts, `現行大運同步：甲方${dA.cur.name}（${jA.label}）・乙方${dB.cur.name}（${jB.label}）`,
        `甲方現行 <b>${dA.cur.name}</b> 運（${dA.cur.age}-${dA.cur.age + 9}歲，今${dA.age}歲），對其喜用${likeA}判為<b>${jA.label}</b>；乙方現行 <b>${dB.cur.name}</b> 運（${dB.cur.age}-${dB.cur.age + 9}歲，今${dB.age}歲），對其喜用${likeB}判為<b>${jB.label}</b>。${txt}`,
        pts >= 0);
    }

    score = Math.max(5, Math.min(98, score));
    const grade = score >= 85 ? '天作之合' : score >= 72 ? '上等婚配' : score >= 58 ? '中上之配' : score >= 45 ? '中等・需磨合' : '多有考驗・重在經營';
    return { pa, pb, items, score, grade, wa, wb, dA, dB };
  }

  App.register({
    id: 'hehun',
    icon: Icons.svg('hehun'),
    title: '八字合婚',
    desc: '雙方八字生肖、夫妻宮、日主、五行、納音、十神正緣多重比對＋四柱交叉沖合，另可選填姓名加做數理合參，附契合評分。',
    render(el) {
      el.innerHTML = `
        <div class="panel">
          <h3>輸入雙方國曆生日</h3>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div class="hh-a" style="flex:1;min-width:280px">${personForm('甲方')}</div>
            <div class="hh-b" style="flex:1;min-width:280px">${personForm('乙方')}</div>
          </div>
          <button class="btn" id="hh-go" style="margin-top:14px">${Icons.svg('hehun')} 合 婚</button>
          <p class="muted" style="margin-top:8px">依傳統合婚法比對；出生時辰不確定可先填 12 時（僅影響時柱五行統計，不影響主要判斷）。姓名為選填——填了會加碼一段姓名數理合參（趣味加碼，不計入八字合婚分數）。</p>
        </div>
        <div id="hh-result"></div>`;

      el.querySelector('#hh-go').addEventListener('click', () => {
        const A = readPerson(el.querySelector('.hh-a'));
        const B = readPerson(el.querySelector('.hh-b'));
        const resEl = el.querySelector('#hh-result');
        resEl.innerHTML = '';
        const r = match(A, B);

        // 選填：若雙方都填了姓名，加做姓名數理合參（沿用姓名速配引擎，不影響八字合婚主分數）
        let nameBlock = '', nameForAI = '', nm = null;
        if (window.NameMatchEngine && A.surname && A.given && B.surname && B.given) {
          const nA = NameMatchEngine.parseName(A.surname, A.given);
          const nB = NameMatchEngine.parseName(B.surname, B.given);
          if (nA.ok && nB.ok) {
            nm = NameMatchEngine.match(nA, nB);
            nameBlock = `<hr class="divider">
              <h4>${Icons.svg('namematch')} 姓名數理合參 <span class="muted" style="font-weight:400">${A.surname}${A.given} × ${B.surname}${B.given}　${nm.score}分・${nm.grade}</span></h4>
              <p class="muted" style="margin-top:-2px">此為趣味加碼（取材自三才五格數理，非傳統合婚方法），不計入上方八字合婚分數。</p>
              ${nm.items.map(it => `<div class="aspect" style="margin-top:8px;border-left:3px solid ${it.good === false ? 'var(--cinnabar)' : it.good ? 'var(--gold-mid)' : 'var(--panel-border)'}">
                <b style="display:flex;justify-content:space-between">${it.title}<span style="color:${it.pts >= 0 ? 'var(--gold-deep)' : 'var(--cinnabar)'}">${it.pts >= 0 ? '+' : ''}${it.pts}</span></b>
                ${it.text}</div>`).join('')}`;
            nameForAI = `\n雙方姓名數理合參（趣味加碼）：${A.surname}${A.given}（人格${nm.gA.ren}總格${nm.gA.zong}）× ${B.surname}${B.given}（人格${nm.gB.ren}總格${nm.gB.zong}），速配 ${nm.score} 分（${nm.grade}）。`;
          } else {
            nameBlock = `<hr class="divider"><p class="muted">※ 姓名含查無筆劃的字，略過姓名合參（八字合婚不受影響）。</p>`;
          }
        }

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
          ${nameBlock}
          <p class="muted" style="margin-top:12px">※ 合婚是參考不是判決——分數低代表需要更多理解與經營，不代表不能在一起。完整喜用神層面的深度合參請用 AI 解讀。</p>
        </div>`;
        resEl.appendChild(div);

        AI.attach(div.querySelector('.panel'), () =>
          `請做八字合婚深度分析。
甲方（${A.gender === 'M' ? '男' : '女'}）：${A.y}/${A.m}/${A.d} ${A.hh}時生，四柱：${r.pa.year.name} ${r.pa.month.name} ${r.pa.day.name} ${r.pa.hour.name}，五行：${Object.entries(r.wa).map(([k, v]) => k + v).join(' ')}
乙方（${B.gender === 'M' ? '男' : '女'}）：${B.y}/${B.m}/${B.d} ${B.hh}時生，四柱：${r.pb.year.name} ${r.pb.month.name} ${r.pb.day.name} ${r.pb.hour.name}，五行：${Object.entries(r.wb).map(([k, v]) => k + v).join(' ')}
${r.dA && r.dB ? `現行大運：甲方 ${r.dA.cur.name}（${r.dA.cur.age}-${r.dA.cur.age + 9}歲，今${r.dA.age}歲）、乙方 ${r.dB.cur.name}（${r.dB.cur.age}-${r.dB.cur.age + 9}歲，今${r.dB.age}歲）
` : ''}初步比對：${r.items.map(it => `${it.title}${it.pts >= 0 ? '+' : ''}${it.pts}`).join('；')}，總分 ${r.score}（${r.grade}）${nameForAI}
請深入分析：1) 雙方日主強弱與喜用神是否互補（已知甲喜${likeOf(r.pa)}、乙喜${likeOf(r.pb)}，請結合合沖刑害精確判斷，可修正粗判）2) 彼此在對方命中扮演的十神角色（正緣程度，已知甲於乙為「${Ganzhi.tenGod(r.pb.day.ganIdx, r.pa.day.ganIdx)}」、乙於甲為「${Ganzhi.tenGod(r.pa.day.ganIdx, r.pb.day.ganIdx)}」）3) 性格與相處模式 4) 婚後家庭與財務互動 5) 需要注意的年份（沖夫妻宮之流年）6) <b>兩人現行大運的同步性</b>——各自這十年行喜運或忌運、運勢是否合拍，以及現階段適不適合推進重大決定（結婚、生育、置產）7) 給這對組合的相處建議${nameForAI ? '，並可順帶一提姓名數理合參是否呼應八字結論（但以八字為主）' : ''}。`);
      });
    }
  });
})();
