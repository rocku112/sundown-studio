/* 暮卜先知 · 農民曆 */
(() => {
  // 建除十二神（值日）：宜忌依傳統通書通說
  const JIANCHU = [
    { name: '建', luck: '吉', yi: '出行、上任、會友、祈福', ji: '動土、開倉、安葬' },
    { name: '除', luck: '吉', yi: '除舊布新、沐浴、掃舍、求醫', ji: '嫁娶、出行遠門' },
    { name: '滿', luck: '中', yi: '祈福、開市、納財、結網', ji: '安葬、栽種、就醫' },
    { name: '平', luck: '中', yi: '修路、粉刷、整地、談判', ji: '開渠、動土、祈福' },
    { name: '定', luck: '吉', yi: '訂盟、納采、簽約、入學', ji: '訴訟、出行、搬遷' },
    { name: '執', luck: '中', yi: '捕捉、修造、簽約、納畜', ji: '開市、搬家、出行' },
    { name: '破', luck: '凶', yi: '拆卸、破屋、求醫治病', ji: '嫁娶、開市、簽約、上任（諸事不宜）' },
    { name: '危', luck: '凶', yi: '祭祀、安床、靜養', ji: '登高、行船、冒險之事' },
    { name: '成', luck: '大吉', yi: '開市、嫁娶、入宅、上任、動土', ji: '訴訟、爭執' },
    { name: '收', luck: '中', yi: '收帳、納財、入倉、豐收之事', ji: '開市、出行、安葬' },
    { name: '開', luck: '吉', yi: '開市、開工、嫁娶、祈福、入學', ji: '安葬、動土' },
    { name: '閉', luck: '凶', yi: '築堤、封倉、收尾、立碑', ji: '開市、出行、手術' }
  ];
  // 彭祖百忌
  const PENGZU_GAN = {
    甲: '甲不開倉，財物耗散', 乙: '乙不栽植，千株不長', 丙: '丙不修灶，必見災殃',
    丁: '丁不剃頭，頭必生瘡', 戊: '戊不受田，田主不祥', 己: '己不破券，二比並亡',
    庚: '庚不經絡，織機虛張', 辛: '辛不合醬，主人不嘗', 壬: '壬不汲水，更難提防', 癸: '癸不詞訟，理弱敵強'
  };
  const PENGZU_ZHI = {
    子: '子不問卜，自惹禍殃', 丑: '丑不冠帶，主不還鄉', 寅: '寅不祭祀，神鬼不嘗',
    卯: '卯不穿井，水泉不香', 辰: '辰不哭泣，必主重喪', 巳: '巳不遠行，財物伏藏',
    午: '午不苫蓋，屋主更張', 未: '未不服藥，毒氣入腸', 申: '申不安床，鬼祟入房',
    酉: '酉不會客，醉坐顛狂', 戌: '戌不吃犬，作怪上床', 亥: '亥不嫁娶，不利新郎'
  };
  // 黃道十二神起法：子午日青龍起申、丑未起戌、寅申起子、卯酉起寅、辰戌起辰、巳亥起午
  const HUANGDAO_START = { 0: 8, 6: 8, 1: 10, 7: 10, 2: 0, 8: 0, 3: 2, 9: 2, 4: 4, 10: 4, 5: 6, 11: 6 };
  const SHIER_SHEN = ['青龍', '明堂', '天刑', '朱雀', '金匱', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陳'];
  const SHEN_GOOD = new Set(['青龍', '明堂', '金匱', '天德', '玉堂', '司命']);
  // 煞方：申子辰煞南、寅午戌煞北、巳酉丑煞東、亥卯未煞西
  const SHA_FANG = ['南', '東', '北', '西', '南', '東', '北', '西', '南', '東', '北', '西'];

  function render(el) {
    const now = new Date();
    el.innerHTML = `
      <div class="panel">
        <div class="form-grid">
          <div class="field"><label>選擇日期</label>
            <input type="date" id="al-date" value="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}"></div>
          <button class="btn small" id="al-go">查 詢</button>
          <button class="btn small ghost" id="al-today">回到今天</button>
        </div>
      </div>
      <div id="al-result"></div>`;

    function show() {
      const [y, m, d] = el.querySelector('#al-date').value.split('-').map(Number);
      if (!y) return;
      const resEl = el.querySelector('#al-result');
      const lunar = Astro.toLunar(y, m, d);
      const yp = Ganzhi.yearPillar(y, m, d);
      const mp = Ganzhi.monthPillar(y, m, d);
      const dp = Ganzhi.dayPillar(y, m, d);
      const phase = Astro.moonPhase(y, m, d);
      const week = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()];
      // 建除：月支起建
      const jcIdx = ((dp.zhiIdx - mp.zhiIdx) % 12 + 12) % 12;
      const jc = JIANCHU[jcIdx];
      // 沖煞
      const chongZhi = (dp.zhiIdx + 6) % 12;
      // 當日或前後節氣
      const terms = [...Astro.solarTermsOfYear(y), ...Astro.solarTermsOfYear(y + 1).slice(0, 2)];
      const dayJD = Astro.toJD(y, m, d, 12);
      let termNote = '';
      for (const t of terms) {
        if (Math.abs(t.jd - dayJD) < 0.5 && t.date.d === d && t.date.m === m) {
          termNote = `今日${t.name}（${String(t.date.hh).padStart(2, '0')}:${String(t.date.mm).padStart(2, '0')} 交節）`;
          break;
        }
      }
      if (!termNote) {
        const next = terms.find(t => t.jd > dayJD);
        if (next) termNote = `${Math.ceil(next.jd - dayJD)} 天後 ${next.name}（${next.date.m}/${next.date.d}）`;
      }
      // 吉時
      const start = HUANGDAO_START[dp.zhiIdx];
      const hours = [];
      for (let i = 0; i < 12; i++) {
        const shen = SHIER_SHEN[((i - start) % 12 + 12) % 12];
        hours.push({ zhi: Ganzhi.ZHI[i], shen, good: SHEN_GOOD.has(shen), range: `${String((23 + i * 2) % 24).padStart(2, '0')}-${String((1 + i * 2) % 24).padStart(2, '0')}` });
      }

      resEl.innerHTML = `<div class="panel result">
        <div style="text-align:center">
          <div style="font-size:15px;color:var(--ink-dim)">${y} 年 ${m} 月 · 星期${week}</div>
          <div style="font-size:56px;color:var(--gold-bright);line-height:1.3">${d}</div>
          <div style="font-size:17px">農曆 ${lunar.monthName}${lunar.dayName} ${phase.emoji}</div>
          <div class="muted" style="margin-top:4px">${yp.name}${yp.shengxiao}年 · ${mp.name}月 · ${dp.name}日（${dp.nayin}）</div>
          <div class="muted">${termNote}</div>
        </div>
        <hr class="divider">
        <div style="text-align:center">
          <span class="tag gold">${jc.name}日</span>
          <span class="tag">${jc.luck}</span>
          <span class="tag">沖${Ganzhi.SHENGXIAO[chongZhi]}（${Ganzhi.ZHI[chongZhi]}）</span>
          <span class="tag">煞${SHA_FANG[dp.zhiIdx]}</span>
        </div>
        ${App.aspectGrid([['宜', jc.yi], ['忌', jc.ji]])}
        <h4>彭祖百忌</h4>
        <p class="muted">${PENGZU_GAN[dp.gan]}；${PENGZU_ZHI[dp.zhi]}。</p>
        <h4>時辰吉凶（黃道吉時）</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px">
          ${hours.map(h => `<div class="aspect" style="text-align:center;padding:8px 4px;${h.good ? 'border-color:rgba(240,194,104,.45)' : 'opacity:.65'}">
            <b style="display:inline">${h.zhi}時</b> <span class="muted" style="font-size:11px">${h.range}</span><br>
            <span style="color:${h.good ? 'var(--gold-bright)' : 'var(--ink-faint)'}">${h.shen}${h.good ? ' 吉' : ''}</span></div>`).join('')}
        </div>
        <p class="muted" style="margin-top:10px">※ 宜忌依建除十二神通說簡化呈現，重大事項請參照完整通書。</p>
      </div>`;
    }

    el.querySelector('#al-go').addEventListener('click', show);
    el.querySelector('#al-date').addEventListener('change', show);
    el.querySelector('#al-today').addEventListener('click', () => {
      const n = new Date();
      el.querySelector('#al-date').value = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
      show();
    });
    show();
  }

  App.register({
    id: 'almanac',
    icon: '📅',
    title: '農民曆',
    desc: '每日干支、農曆節氣、建除宜忌、沖煞方位、黃道吉時。',
    render
  });
})();
