/* 暮卜先知 · 西洋占星 */
(() => {
  const RAD = Math.PI / 180;
  const SIGNS = [
    { name: '牡羊座', sym: '♈', elem: '火', mode: '本位', trait: '衝勁十足、直率勇敢，行動先於思考，是天生的開路先鋒。' },
    { name: '金牛座', sym: '♉', elem: '土', mode: '固定', trait: '穩健務實、重視感官與安全感，慢熱但持久，對美食美物有品味。' },
    { name: '雙子座', sym: '♊', elem: '風', mode: '變動', trait: '好奇多變、溝通高手，資訊蒐集力一流，興趣廣泛但需防三分鐘熱度。' },
    { name: '巨蟹座', sym: '♋', elem: '水', mode: '本位', trait: '溫暖念舊、保護慾強，情感豐沛以家為重，情緒如潮汐起落。' },
    { name: '獅子座', sym: '♌', elem: '火', mode: '固定', trait: '自信大器、天生舞台魂，慷慨重義氣，需要掌聲也給得起溫暖。' },
    { name: '處女座', sym: '♍', elem: '土', mode: '變動', trait: '細膩嚴謹、追求完美，服務精神與分析力兼具，對自己最嚴格。' },
    { name: '天秤座', sym: '♎', elem: '風', mode: '本位', trait: '優雅圓融、重視和諧與公平，天生外交官，選擇困難是日常。' },
    { name: '天蠍座', sym: '♏', elem: '水', mode: '固定', trait: '深沉專注、洞察力驚人，愛恨分明，認定了就全力以赴。' },
    { name: '射手座', sym: '♐', elem: '火', mode: '變動', trait: '樂觀自由、熱愛探索遠方與真理，直言不諱，靈魂裝著整片草原。' },
    { name: '摩羯座', sym: '♑', elem: '土', mode: '本位', trait: '自律堅毅、目標導向，越挫越勇的長跑者，成就是最好的語言。' },
    { name: '水瓶座', sym: '♒', elem: '風', mode: '固定', trait: '獨立前衛、思想跳脫框架，博愛卻疏離，走在時代前面半步。' },
    { name: '雙魚座', sym: '♓', elem: '水', mode: '變動', trait: '浪漫感性、同理心滿溢，想像力是天賦，界線感是課題。' }
  ];
  const PLANETS = [
    { id: 'sun', name: '太陽', sym: '☉', mean: '核心自我與生命方向' },
    { id: 'moon', name: '月亮', sym: '☽', mean: '情緒需求與內在安全感' },
    { id: 'mercury', name: '水星', sym: '☿', mean: '思考與溝通方式' },
    { id: 'venus', name: '金星', sym: '♀', mean: '愛情觀與審美價值' },
    { id: 'mars', name: '火星', sym: '♂', mean: '行動力與慾望展現' },
    { id: 'jupiter', name: '木星', sym: '♃', mean: '幸運擴張與人生信念' },
    { id: 'saturn', name: '土星', sym: '♄', mean: '課題考驗與責任所在' },
    { id: 'uranus', name: '天王星', sym: '♅', mean: '突變革新（世代）' },
    { id: 'neptune', name: '海王星', sym: '♆', mean: '夢想消融（世代）' },
    { id: 'pluto', name: '冥王星', sym: '♇', mean: '深層蛻變（世代）' }
  ];
  const ASPECTS = [
    { angle: 0, orb: 7, name: '合相', sym: '☌', good: null },
    { angle: 60, orb: 5, name: '六分相', sym: '⚹', good: true },
    { angle: 90, orb: 6, name: '四分相', sym: '□', good: false },
    { angle: 120, orb: 6, name: '三分相', sym: '△', good: true },
    { angle: 180, orb: 7, name: '對分相', sym: '☍', good: false }
  ];

  function signOf(lon) { return SIGNS[Math.floor(Astro.norm360(lon) / 30)]; }
  function degInSign(lon) { const x = Astro.norm360(lon) % 30; return `${Math.floor(x)}°${String(Math.floor((x % 1) * 60)).padStart(2, '0')}'`; }

  // 上升星座（需經緯度）
  function ascendant(jdUT, latDeg, lonDeg) {
    const T = (jdUT - 2451545.0) / 36525;
    let gmst = 280.46061837 + 360.98564736629 * (jdUT - 2451545.0) + 0.000387933 * T * T;
    const lst = Astro.norm360(gmst + lonDeg); // 當地恆星時（度）
    const eps = (23.4392911 - 0.0130042 * T) * RAD; // 黃赤交角
    const ramc = lst * RAD;
    const phi = latDeg * RAD;
    const y = -Math.cos(ramc);
    const x = Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps);
    let asc = Math.atan2(y, x) / RAD;
    asc = Astro.norm360(asc);
    // MC：黃道與子午圈交點
    let mc = Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) / RAD;
    mc = Astro.norm360(mc);
    return { asc, mc };
  }

  function render(el) {
    const bf = App.birthForm({ gender: false, time: true });
    el.innerHTML = `
      <div class="panel">
        <h3>輸入出生資料</h3>
        ${bf.html}
        <div class="form-grid" style="margin-top:10px">
          <div class="field"><label>出生地緯度</label><input class="as-lat" type="number" step="0.01" value="25.04" style="width:100px"></div>
          <div class="field"><label>經度</label><input class="as-lon" type="number" step="0.01" value="121.51" style="width:100px"></div>
          <span class="muted">（預設台北；出生時間與地點影響上升星座）</span>
        </div>
        <button class="btn" id="as-go" style="margin-top:14px">🪐 排星盤</button>
      </div>
      <div id="as-result"></div>`;

    el.querySelector('#as-go').addEventListener('click', () => {
      const b = bf.read(el);
      const lat = +el.querySelector('.as-lat').value, lon = +el.querySelector('.as-lon').value;
      const resEl = el.querySelector('#as-result');
      resEl.innerHTML = '';
      // 台灣時間 → UT → TT
      const jdUT = Astro.toJD(b.y, b.m, b.d, b.hh, b.mi) - 8 / 24;
      const jde = jdUT + Astro.deltaT(b.y) / 86400;

      const positions = [];
      for (const p of PLANETS) {
        let lonDeg;
        if (p.id === 'sun') lonDeg = Astro.sunLongitude(jde);
        else if (p.id === 'moon') lonDeg = Astro.moonLongitude(jde);
        else lonDeg = Astro.planetLongitude(p.id, jde);
        positions.push({ ...p, lon: lonDeg, sign: signOf(lonDeg) });
      }
      const { asc, mc } = ascendant(jdUT, lat, lon);
      const ascSign = signOf(asc), mcSign = signOf(mc);

      // 相位
      const aspList = [];
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          let diff = Math.abs(Astro.norm360(positions[i].lon - positions[j].lon));
          if (diff > 180) diff = 360 - diff;
          for (const a of ASPECTS) {
            if (Math.abs(diff - a.angle) <= a.orb) {
              aspList.push({ a: positions[i], b: positions[j], asp: a, orb: Math.abs(diff - a.angle).toFixed(1) });
              break;
            }
          }
        }
      }
      // 元素統計
      const elemCount = { 火: 0, 土: 0, 風: 0, 水: 0 };
      positions.forEach(p => elemCount[p.sign.elem]++);
      const domElem = Object.entries(elemCount).sort((x, y2) => y2[1] - x[1])[0][0];

      const big3 = [positions[0], positions[1]];
      const div = document.createElement('div');
      div.innerHTML = `<div class="panel result">
        <h3>本命星盤</h3>
        <div class="muted" style="text-align:center">${b.y}/${b.m}/${b.d} ${String(b.hh).padStart(2, '0')}:${String(b.mi).padStart(2, '0')}（UTC+8）· 北緯 ${lat}° 東經 ${lon}°</div>
        <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:12px 0">
          <div class="aspect" style="text-align:center;min-width:130px"><b>☉ 太陽星座</b><span style="font-size:22px">${positions[0].sign.sym} ${positions[0].sign.name}</span></div>
          <div class="aspect" style="text-align:center;min-width:130px"><b>☽ 月亮星座</b><span style="font-size:22px">${positions[1].sign.sym} ${positions[1].sign.name}</span></div>
          <div class="aspect" style="text-align:center;min-width:130px"><b>↑ 上升星座</b><span style="font-size:22px">${ascSign.sym} ${ascSign.name}</span></div>
        </div>
        <table class="chart astro-table">
          <tr><th>行星</th><th>星座</th><th>度數</th><th>意涵</th></tr>
          ${positions.map(p => `<tr><td>${p.sym} ${p.name}</td><td>${p.sign.sym} ${p.sign.name}</td><td>${degInSign(p.lon)}</td><td class="muted">${p.mean}</td></tr>`).join('')}
          <tr><td>↑ 上升</td><td>${ascSign.sym} ${ascSign.name}</td><td>${degInSign(asc)}</td><td class="muted">外在形象與人生舞台入口</td></tr>
          <tr><td>MC 天頂</td><td>${mcSign.sym} ${mcSign.name}</td><td>${degInSign(mc)}</td><td class="muted">事業志向與社會成就</td></tr>
        </table>
        <h4>主要相位</h4>
        <p>${aspList.length ? aspList.map(x => `<span class="tag ${x.asp.good === true ? 'gold' : ''}" ${x.asp.good === false ? 'style="color:var(--cinnabar)"' : ''}>${x.a.sym}${x.a.name} ${x.asp.sym} ${x.b.sym}${x.b.name}（差${x.orb}°）</span>`).join('') : '無明顯主要相位'}</p>
        <hr class="divider">
        <h4>☉ 太陽${positions[0].sign.name} —— 核心自我</h4><p>${positions[0].sign.trait}</p>
        <h4>☽ 月亮${positions[1].sign.name} —— 內在情感</h4><p>內心層面帶有${positions[1].sign.name}特質：${positions[1].sign.trait}</p>
        <h4>↑ 上升${ascSign.name} —— 外在形象</h4><p>他人眼中的你帶有${ascSign.name}色彩：${ascSign.trait}</p>
        <p style="margin-top:8px">星盤元素以<b style="color:var(--gold-bright)">${domElem}象</b>為主（火${elemCount.火}・土${elemCount.土}・風${elemCount.風}・水${elemCount.水}）。</p>
        <p class="muted">※ 行星位置為即時天文計算（精度足以判座）；宮位制與更細緻的合盤請用 AI 深度解讀。</p>
      </div>`;
      resEl.appendChild(div);

      AI.attach(div.querySelector('.panel'), () =>
        `請為以下西洋占星本命盤做深度解讀。
出生：${b.y}/${b.m}/${b.d} ${b.hh}:${String(b.mi).padStart(2, '0')}（UTC+8），北緯${lat}° 東經${lon}°
行星位置：
${positions.map(p => `${p.name}：${p.sign.name} ${degInSign(p.lon)}`).join('\n')}
上升：${ascSign.name} ${degInSign(asc)}，天頂MC：${mcSign.name} ${degInSign(mc)}
主要相位：${aspList.map(x => `${x.a.name}${x.asp.name}${x.b.name}`).join('、') || '無'}
元素分布：火${elemCount.火} 土${elemCount.土} 風${elemCount.風} 水${elemCount.水}
請分析：1) 太陽月亮上升的三位一體人格 2) 水金火的溝通/感情/行動風格 3) 木土的機會與課題 4) 重要相位的影響 5) 適合的發展方向。`);
    });
  }

  App.register({
    id: 'astrology',
    icon: '🪐',
    title: '西洋占星',
    desc: '十大行星即時天文計算，太陽月亮上升三位一體，相位分析。',
    render
  });
})();
