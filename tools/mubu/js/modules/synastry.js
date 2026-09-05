/* 暮卜先知 · 占星合盤（Synastry 雙人契合） */
(() => {
  const SIGNS = ['牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'];
  const ELEM = ['火', '土', '風', '水', '火', '土', '風', '水', '火', '土', '風', '水'];
  const MODE = ['本位', '固定', '變動', '本位', '固定', '變動', '本位', '固定', '變動', '本位', '固定', '變動'];
  const MODE_TEXT = {
    本位本位: { pts: -1, text: '雙方都是開創者，都習慣主導、發起行動，相處時容易變成「誰聽誰的」的拉鋸，學會輪流帶頭是關鍵。' },
    固定固定: { pts: -3, text: '雙方都極度堅持己見、不輕易妥協，一旦意見不合很容易陷入僵局，需要有一方先軟化才能化解。' },
    變動變動: { pts: -2, text: '雙方都靈活善變、隨性而至，關係新鮮有趣但也容易缺乏方向感，建議至少一方負責定錨與收尾。' },
    default: { pts: 3, text: '步調模式互異，通常能截長補短——一方發起、一方穩固、或一方調節，關係較有彈性。' }
  };
  const PLANETS = [
    { id: 'sun', name: '太陽', sym: '☉', w: 3 },
    { id: 'moon', name: '月亮', sym: '☽', w: 3 },
    { id: 'mercury', name: '水星', sym: '☿', w: 1.5 },
    { id: 'venus', name: '金星', sym: '♀', w: 2.5 },
    { id: 'mars', name: '火星', sym: '♂', w: 2 },
    { id: 'jupiter', name: '木星', sym: '♃', w: 1.2 },
    { id: 'saturn', name: '土星', sym: '♄', w: 1.2 }
  ];
  const ASPECTS = [
    { angle: 0, orb: 6, name: '合相', sym: '☌', q: 'mix' },
    { angle: 60, orb: 4, name: '六分相', sym: '⚹', q: 'good' },
    { angle: 90, orb: 5, name: '四分相', sym: '□', q: 'hard' },
    { angle: 120, orb: 5, name: '三分相', sym: '△', q: 'good' },
    { angle: 180, orb: 6, name: '對分相', sym: '☍', q: 'hard' }
  ];
  const signOf = (lon) => SIGNS[Math.floor(Astro.norm360(lon) / 30)];
  const elemOf = (lon) => ELEM[Math.floor(Astro.norm360(lon) / 30)];
  const modeOf = (lon) => MODE[Math.floor(Astro.norm360(lon) / 30)];
  const ZODIAC_ICON_ORDER = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
  const ASPECT_ICON = { 合相: 'conjunction', 六分相: 'sextile', 四分相: 'square', 三分相: 'trine', 對分相: 'opposition' };
  const zodiacIconOf = (lon, opts) => Icons.svg(ZODIAC_ICON_ORDER[Math.floor(Astro.norm360(lon) / 30)], opts || { size: 14 });
  const planetIcon = (p, opts) => Icons.svg(p.id, opts || { size: 15 });
  const aspectIcon = (asp, opts) => Icons.svg(ASPECT_ICON[asp.name], opts || { size: 13 });

  // 依交互相位的行星組合分類，判定關係主要調性
  function relationType(inter) {
    const cat = { soul: 0, passion: 0, serious: 0, friend: 0 };
    for (const x of inter) {
      const w = Math.abs(x.pts);
      if (x.isLuminaryPair) cat.soul += w;
      if (x.isVenusMars) cat.passion += w;
      if (x.pa.id === 'saturn' || x.pb.id === 'saturn') cat.serious += w;
      if (x.pa.id === 'mercury' || x.pb.id === 'mercury') cat.friend += w;
    }
    const entries = Object.entries(cat).sort((a, b) => b[1] - a[1]);
    const [topKey, topVal] = entries[0];
    if (topVal === 0) return { key: 'none', name: '平行探索型', text: '兩人主要行星之間交集不算多，像兩條平行線，需要主動創造共同話題與相處時光才能加深連結。' };
    const MAP = {
      soul: { name: '靈魂共鳴型', text: '日月相位主導這段關係，連結超越言語表面，常有「好像很久以前就認識」的熟悉感，是深層的情感共振。' },
      passion: { name: '熱情吸引型', text: '金星火星相位主導，肢體與情慾層面的吸引力強烈，來電感十足，適合把握主動靠近的心動時刻。' },
      serious: { name: '穩重深刻型', text: '土星相位主導，帶著宿命感與責任感的關係，初期可能感覺沉重或有壓力，但一旦穩定會非常長久踏實。' },
      friend: { name: '知己溝通型', text: '水星相位主導，你們更像是聊不完的朋友，思想同頻、話題不斷是這段關係最大的資產。' }
    };
    return { key: topKey, ...MAP[topKey] };
  }

  function chartOf(b) {
    const tz = (typeof b.tz === "number") ? b.tz : 8;   // 出生地時區（未填則沿用 UTC+8）
    const jde = Astro.toJD(b.y, b.m, b.d, b.hh, b.mi || 0) - tz / 24 + Astro.deltaT(b.y) / 86400;
    return PLANETS.map(p => ({
      ...p,
      lon: p.id === 'sun' ? Astro.sunLongitude(jde) : p.id === 'moon' ? Astro.moonLongitude(jde) : Astro.planetLongitude(p.id, jde)
    }));
  }

  function personForm() {
    return `<div class="form-grid">
      <div class="field"><label>年</label><input type="number" class="sy-y" value="1990" min="1900" max="2100" style="width:90px"></div>
      <div class="field"><label>月</label><input type="number" class="sy-m" value="1" min="1" max="12" style="width:64px"></div>
      <div class="field"><label>日</label><input type="number" class="sy-d" value="1" min="1" max="31" style="width:64px"></div>
      <div class="field"><label>時</label><input type="number" class="sy-h" value="12" min="0" max="23" style="width:64px"></div>
      <div class="field"><label>分</label><input type="number" class="sy-mi" value="0" min="0" max="59" style="width:64px"></div>
      <div class="field"><label>出生地（定時區）</label><select class="sy-city" style="width:118px">${MUBU_CITIES.map((c, i) => `<option value="${i}"${c[0] === "台北" ? " selected" : ""}>${c[0]}</option>`).join("")}</select></div>
    </div>`;
  }
  const readP = (root) => {
    const ci = +root.querySelector('.sy-city').value;
    const city = MUBU_CITIES[ci] || MUBU_CITIES[0];
    return {
      y: +root.querySelector('.sy-y').value, m: +root.querySelector('.sy-m').value,
      d: +root.querySelector('.sy-d').value, hh: +root.querySelector('.sy-h').value,
      mi: +root.querySelector('.sy-mi').value || 0,
      cityName: city[0], tz: city[3]
    };
  };

  function synastry(A, B) {
    const ca = chartOf(A), cb = chartOf(B);
    const inter = [];
    let score = 50;
    for (const pa of ca) {
      for (const pb of cb) {
        let diff = Math.abs(Astro.norm360(pa.lon - pb.lon));
        if (diff > 180) diff = 360 - diff;
        for (const a of ASPECTS) {
          if (Math.abs(diff - a.angle) <= a.orb) {
            const w = (pa.w + pb.w) / 2;
            const isLuminaryPair = (pa.id === 'sun' && pb.id === 'moon') || (pa.id === 'moon' && pb.id === 'sun');
            const isVenusMars = (pa.id === 'venus' && pb.id === 'mars') || (pa.id === 'mars' && pb.id === 'venus');
            let pts;
            if (a.q === 'good') pts = Math.round(w * 2.2);
            else if (a.q === 'hard') {
              if (isLuminaryPair && a.angle === 180) pts = Math.round(w * 1.5); // 日月對分＝滿月軸，強烈互補吸引
              else if (isVenusMars) pts = Math.round(w * 0.8); // 金火相位再硬也是吸引力
              else pts = -Math.round(w * 1.6);
            }
            else pts = ['saturn'].includes(pa.id) || ['saturn'].includes(pb.id) ? Math.round(w * 0.6) : Math.round(w * 1.8); // 合相：土星合較沉重
            if (isLuminaryPair && pts > 0) pts = Math.round(pts * 1.6);
            else if (isLuminaryPair) pts = Math.round(pts * 1.3);
            if (isVenusMars && a.q !== 'hard') pts = Math.round(pts * 1.4);
            score += pts;
            inter.push({ pa, pb, asp: a, orb: (diff - a.angle).toFixed(1).replace('-', ''), pts, isLuminaryPair, isVenusMars });
            break;
          }
        }
      }
    }
    // 元素互補
    const ea = {}, eb = {}, ma = {}, mb = {};
    ca.slice(0, 5).forEach(p => { ea[elemOf(p.lon)] = (ea[elemOf(p.lon)] || 0) + 1; ma[modeOf(p.lon)] = (ma[modeOf(p.lon)] || 0) + 1; });
    cb.slice(0, 5).forEach(p => { eb[elemOf(p.lon)] = (eb[elemOf(p.lon)] || 0) + 1; mb[modeOf(p.lon)] = (mb[modeOf(p.lon)] || 0) + 1; });
    const domA = Object.entries(ea).sort((x, y) => y[1] - x[1])[0][0];
    const domB = Object.entries(eb).sort((x, y) => y[1] - x[1])[0][0];
    const elemGood = domA === domB || ['火風', '風火', '土水', '水土'].includes(domA + domB);
    score += elemGood ? 6 : -3;

    // 三分法（本位/固定/變動）相容
    const modeA = Object.entries(ma).sort((x, y) => y[1] - x[1])[0][0];
    const modeB = Object.entries(mb).sort((x, y) => y[1] - x[1])[0][0];
    const modeKey = modeA === modeB ? modeA + modeB : 'default';
    const modeInfo = MODE_TEXT[modeKey] || MODE_TEXT.default;
    score += modeInfo.pts;

    const relType = relationType(inter);

    score = Math.max(10, Math.min(98, Math.round(score)));
    const grade = score >= 85 ? '靈魂共振' : score >= 72 ? '天生合拍' : score >= 58 ? '互有吸引' : score >= 45 ? '需要磨合' : '挑戰型關係';
    return { ca, cb, inter, score, grade, domA, domB, elemGood, modeA, modeB, modeInfo, relType };
  }

  App.register({
    id: 'synastry',
    icon: Icons.svg('synastry'),
    title: '占星合盤',
    desc: '雙人星盤互相位分析，日月金火加權，測你們的天體化學反應。',
    render(el) {
      el.innerHTML = `
        <div class="panel">
          <h3>輸入兩人國曆生日</h3>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div class="sy-a" style="flex:1;min-width:280px"><h4 style="margin-top:0">你</h4>${personForm()}</div>
            <div class="sy-b" style="flex:1;min-width:280px"><h4 style="margin-top:0">對方</h4>${personForm()}</div>
          </div>
          <button class="btn" id="sy-go" style="margin-top:14px">${Icons.svg('synastry')} 合 盤</button>
          <p class="muted" style="margin-top:8px">分析七大行星的交互相位（Synastry）。<b>出生地用於換算時區</b>——非台灣出生者務必選對，否則整張盤會時間錯位；本工具不取上升與宮位，故只需時區、不需精確經緯度。時間不確定填 12 時即可（月亮一小時約走 0.55°，全天誤差最大約 ±7°）。</p>
        </div>
        <div id="sy-result"></div>`;

      el.querySelector('#sy-go').addEventListener('click', () => {
        const A = readP(el.querySelector('.sy-a'));
        const B = readP(el.querySelector('.sy-b'));
        const resEl = el.querySelector('#sy-result');
        resEl.innerHTML = '';
        const r = synastry(A, B);
        const goods = r.inter.filter(x => x.pts > 0).sort((a, b) => b.pts - a.pts);
        const hards = r.inter.filter(x => x.pts <= 0).sort((a, b) => a.pts - b.pts);
        const color = r.score >= 72 ? 'var(--gold-deep)' : r.score >= 45 ? 'var(--ink-dim)' : 'var(--cinnabar)';

        const row = (x) => `<div class="aspect" style="margin-top:8px;display:flex;justify-content:space-between;gap:10px;border-left:3px solid ${x.pts > 0 ? 'var(--gold-mid)' : 'var(--cinnabar)'}">
          <span><b style="display:inline">你的${planetIcon(x.pa)}${x.pa.name} ${aspectIcon(x.asp)} 對方的${planetIcon(x.pb)}${x.pb.name}</b>
          <span class="muted">（${x.asp.name}，差${x.orb}°）</span>
          ${x.isLuminaryPair ? '<span class="tag gold">日月相位・靈魂級</span>' : ''}${x.isVenusMars ? '<span class="tag gold">金火相位・來電</span>' : ''}</span>
          <b style="color:${x.pts > 0 ? 'var(--gold-deep)' : 'var(--cinnabar)'}">${x.pts > 0 ? '+' : ''}${x.pts}</b></div>`;

        const div = document.createElement('div');
        div.innerHTML = `<div class="panel result">
          <div style="text-align:center">
            <div class="muted">你 ${A.y}/${A.m}/${A.d} ${A.hh}:${String(A.mi).padStart(2, "0")}·${A.cityName}（${Icons.svg('sun', { size: 14 })}${signOf(r.ca[0].lon)} ${Icons.svg('moon', { size: 14 })}${signOf(r.ca[1].lon)}）× 對方 ${B.y}/${B.m}/${B.d} ${B.hh}:${String(B.mi).padStart(2, "0")}·${B.cityName}（${Icons.svg('sun', { size: 14 })}${signOf(r.cb[0].lon)} ${Icons.svg('moon', { size: 14 })}${signOf(r.cb[1].lon)}）</div>
            <div style="font-size:56px;font-weight:700;color:${color};line-height:1.4">${r.score}<span style="font-size:20px">分</span></div>
            <span class="fortune-level ${r.score >= 72 ? 'good' : r.score >= 45 ? 'mid' : 'bad'}">${r.grade}</span>
            <div style="margin-top:6px"><span class="tag gold">${r.relType.name}</span><span class="tag">你主${r.domA}象 × 對方主${r.domB}象（${r.elemGood ? '相容' : '互異'}）</span><span class="tag">你${r.modeA}／對方${r.modeB}</span><span class="tag">${r.inter.length} 組交互相位</span></div>
          </div>
          <hr class="divider">
          <p>${r.relType.text}</p>
          <p class="muted">步調模式：${r.modeInfo.text}</p>
          <hr class="divider">
          ${goods.length ? `<h4>${Icons.svg('star-filled', { color: 'var(--gold-mid)' })} 和諧相位（${goods.length}）</h4>${goods.map(row).join('')}` : ''}
          ${hards.length ? `<h4 style="margin-top:16px">${Icons.svg('bolt')} 張力相位（${hards.length}）</h4>${hards.map(row).join('')}` : ''}
          ${!r.inter.length ? '<p class="muted">兩人主要行星無明顯交互相位——像平行線，需要刻意創造交集。</p>' : ''}
          <p class="muted" style="margin-top:12px">※ 張力相位不等於不合——沒有張力的關係往往也沒有火花；四分相是最容易「來電」的相位之一。</p>
        </div>`;
        resEl.appendChild(div);

        AI.attach(div.querySelector('.panel'), () =>
          `請做占星合盤（Synastry）深度分析。
你：${A.y}/${A.m}/${A.d} ${A.hh}:${String(A.mi).padStart(2, "0")}（${A.cityName}，UTC${A.tz >= 0 ? "+" : ""}${A.tz}），行星：${r.ca.map(p => `${p.name}${signOf(p.lon)}${Math.floor(Astro.norm360(p.lon) % 30)}°`).join('、')}
對方：${B.y}/${B.m}/${B.d} ${B.hh}:${String(B.mi).padStart(2, "0")}（${B.cityName}，UTC${B.tz >= 0 ? "+" : ""}${B.tz}），行星：${r.cb.map(p => `${p.name}${signOf(p.lon)}${Math.floor(Astro.norm360(p.lon) % 30)}°`).join('、')}
交互相位：${r.inter.map(x => `你的${x.pa.name}${x.asp.name}對方的${x.pb.name}（差${x.orb}°）`).join('；') || '無主要相位'}
綜合評分：${r.score}（${r.grade}），元素：你主${r.domA}象、對方主${r.domB}象；步調模式：你${r.modeA}、對方${r.modeB}；關係主要調性：${r.relType.name}
請分析：1) 兩人吸引力的來源（哪些相位在放電）2) 情感需求是否互相滿足（月亮與金星互動）3) 溝通與價值觀（水星、太陽）4) 長期關係的挑戰點（土星與硬相位的課題）5) 相處建議與最佳互動模式。`);
      });
    }
  });
})();
