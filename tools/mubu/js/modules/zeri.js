/* 暮卜先知 · 擇日工具（吉日查詢器，依建除十二神通說比對活動宜忌） */
(() => {
  const ACTIVITIES = [
    { key: 'jiaqu', label: '嫁娶／訂婚', kw: ['嫁娶'] },
    { key: 'kaishi', label: '開市／開幕／開工', kw: ['開市', '開工', '開倉'] },
    { key: 'dongtu', label: '動土／裝修／修造', kw: ['動土', '修造', '修路', '整地', '開渠'] },
    { key: 'anchuang', label: '安床', kw: ['安床'] },
    { key: 'chuxing', label: '出行／遠行', kw: ['出行'] },
    { key: 'qianyi', label: '搬家／入宅／遷移', kw: ['入宅', '搬遷', '搬家'] },
    { key: 'dingmeng', label: '簽約／訂盟／納采', kw: ['訂盟', '納采', '簽約'] },
    { key: 'shangren', label: '上任／入職', kw: ['上任'] },
    { key: 'qifu', label: '祈福／祭祀', kw: ['祈福', '祭祀'] },
    { key: 'qiuyi', label: '求醫／治病／手術', kw: ['求醫', '治病', '手術'] },
    { key: 'ruxue', label: '入學／考試', kw: ['入學'] },
    { key: 'naicai', label: '納財／收帳／入倉', kw: ['納財', '收帳', '入倉'] },
    { key: 'anzang', label: '安葬', kw: ['安葬'] }
  ];
  const LUCK_SCORE = { 大吉: 4, 吉: 3, 中: 1.5, 凶: 0 };

  function matchActivity(jc, kws) {
    if (kws.some(k => jc.ji.includes(k))) return 'avoid';   // 通書明列此活動為忌，直接排除
    if (kws.some(k => jc.yi.includes(k))) return 'good';    // 通書明列此活動為宜
    return 'neutral';
  }

  function scanDays(y, m, d, days, act, avoidZhi) {
    const results = [];
    const cursor = new Date(y, m - 1, d);
    for (let i = 0; i < days; i++) {
      const cy = cursor.getFullYear(), cm = cursor.getMonth() + 1, cd = cursor.getDate();
      const info = AlmanacEngine.info(cy, cm, cd);
      const match = matchActivity(info.jc, act.kw);
      if (match !== 'avoid') {
        const hitZhi = avoidZhi !== null && info.chongZhi === avoidZhi;
        let score = LUCK_SCORE[info.jc.luck] || 1;
        if (match === 'good') score += 3;
        if (info.xiuGood) score += 1;
        if (hitZhi) score -= 3.5;
        results.push({ y: cy, m: cm, d: cd, info, match, hitZhi, score, weekday: cursor.getDay() });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return results.sort((a, b) => b.score - a.score || (a.y * 10000 + a.m * 100 + a.d) - (b.y * 10000 + b.m * 100 + b.d));
  }

  function render(el) {
    const now = new Date();
    el.innerHTML = `
      <div class="panel">
        <h3>擇日查詢</h3>
        <div class="form-grid">
          <div class="field"><label>想做的事</label><select id="zr-act" style="width:180px">
            ${ACTIVITIES.map(a => `<option value="${a.key}">${a.label}</option>`).join('')}
          </select></div>
          <div class="field"><label>從此日期起算</label><input type="date" id="zr-date" value="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}"></div>
          <div class="field"><label>查詢範圍</label><select id="zr-range" style="width:100px">
            <option value="30">未來 30 天</option><option value="60" selected>未來 60 天</option><option value="90">未來 90 天</option></select></div>
          <div class="field"><label>避開沖生肖（可留空）</label><select id="zr-zhi" style="width:100px">
            <option value="">不限</option>${Ganzhi.SHENGXIAO.map((s, i) => `<option value="${i}">${s}</option>`).join('')}</select></div>
        </div>
        <button class="btn" id="zr-go" style="margin-top:14px">${Icons.svg('zeri')} 開始查詢</button>
        <p class="muted" style="margin-top:8px">依建除十二神通說，從指定範圍內挑出最適合該活動的日子；已排除通書明列為「忌」的日子，並將沖你生肖的日子降權排序（若你的生肖與該日沖犯，建議另擇他日）。</p>
      </div>
      <div id="zr-result"></div>`;

    el.querySelector('#zr-go').addEventListener('click', () => {
      const act = ACTIVITIES.find(a => a.key === el.querySelector('#zr-act').value);
      const [y, m, d] = el.querySelector('#zr-date').value.split('-').map(Number);
      const days = +el.querySelector('#zr-range').value;
      const zhiVal = el.querySelector('#zr-zhi').value;
      const avoidZhi = zhiVal === '' ? null : +zhiVal;
      if (!y) return;
      const resEl = el.querySelector('#zr-result');
      const all = scanDays(y, m, d, days, act, avoidZhi);
      const top = all.slice(0, 8);
      const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

      const html = `<div class="panel result">
        <h3>「${act.label}」推薦吉日（未來 ${days} 天內）</h3>
        ${top.length ? top.map((r, i) => `
          <div class="aspect" style="${i === 0 ? 'border-color:rgba(240,194,104,.55)' : ''}">
            <b style="color:${i === 0 ? 'var(--gold-bright)' : 'var(--ink)'}">${r.y}/${r.m}/${r.d}（週${WEEK[r.weekday]}）${i === 0 ? ' ★首選' : ''}</b>
            <span class="tag ${r.info.jc.luck === '凶' ? '' : 'gold'}">${r.info.jc.name}日・${r.info.jc.luck}</span>
            <span class="tag ${r.info.xiuGood ? 'gold' : ''}">${r.info.xiu}宿</span>
            ${r.match === 'good' ? `<span class="tag gold">通書明列宜「${act.label.split('／')[0]}」</span>` : ''}
            ${r.hitZhi ? `<span class="tag" style="color:var(--cinnabar);border-color:rgba(176,48,32,.4)">⚠ 沖${Ganzhi.SHENGXIAO[avoidZhi]}生肖</span>` : ''}
            <div class="muted" style="margin-top:4px;font-size:12.5px">農曆${r.info.lunar.monthName}${r.info.lunar.dayName}・沖${Ganzhi.SHENGXIAO[r.info.chongZhi]}・${r.info.jc.desc.split('，')[0]}</div>
          </div>`).join('') : '<p class="muted">此範圍內找不到符合條件的日子（可能全被排除或沖犯生肖），建議放寬查詢範圍或不限生肖再試。</p>'}
        <p class="muted" style="margin-top:10px">※ 依建除十二神通說簡化評分，僅供參考；婚嫁動土等重大事項建議仍諮詢專業擇日師覆核。</p>
      </div>`;
      resEl.innerHTML = '';
      const div = document.createElement('div');
      div.innerHTML = html;
      resEl.appendChild(div);

      if (top.length) {
        AI.attach(div.querySelector('.panel'), () =>
          `請以擇日（通書黃曆）專家角度，針對「${act.label}」這件事，評比以下候選日期，選出最推薦的1-2天並說明理由，也提醒需要注意的地方（例如當天沖煞、時辰等，建議一併考慮當事人自身生肖與八字日主）。
候選日期：${top.map(r => `${r.y}/${r.m}/${r.d}（${r.info.jc.name}日${r.info.jc.luck}，${r.info.xiu}宿${r.info.xiuGood ? '吉' : ''}，沖${Ganzhi.SHENGXIAO[r.info.chongZhi]}）`).join('、')}`);
      }
    });
  }

  App.register({
    id: 'zeri',
    icon: Icons.svg('zeri'),
    title: '擇日工具',
    desc: '輸入想做的事（嫁娶／開市／動土／搬家等），自動從建除十二神通說中挑出未來最適合的吉日清單。',
    render
  });
})();
