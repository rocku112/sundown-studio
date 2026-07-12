/* 暮卜先知 · 農民曆 */
(() => {
  // 建除十二神（值日）：宜忌依傳統通書通說
  const JIANCHU = [
    { name: '建', luck: '吉', yi: '出行、上任、會友、祈福', ji: '動土、開倉、安葬', desc: '「建」為十二值神之首，象徵旺氣初立、萬事起頭，如同新的循環正要展開，最宜開創性的行動與人際往來；但根基未穩之時大興土木或處置財庫反而容易動搖新局，宜緩行。' },
    { name: '除', luck: '吉', yi: '除舊布新、沐浴、掃舍、求醫', ji: '嫁娶、出行遠門', desc: '「除」值日主掃除清理之氣，舊的髒污病痛在此日容易連根拔除，最宜沐浴、掃舍、求醫等去舊納新之事；但喜事講究圓滿無缺，遠行講究一路平順，除舊之氣沖淡了圓滿與安定，故不宜嫁娶遠行。' },
    { name: '滿', luck: '中', yi: '祈福、開市、納財、結網', ji: '安葬、栽種、就醫', desc: '「滿」值日主豐盈圓滿之氣，如倉廩已實、百物俱足，最利祈福、開市、納財等求圓滿收穫之事；但滿則招損，安葬講究入土為安、栽種講究生機初萌、就醫講究病去體輕，這類需要「留餘地」的事在滿氣之下反而失了轉圜。' },
    { name: '平', luck: '中', yi: '修路、粉刷、整地、談判', ji: '開渠、動土、祈福', desc: '「平」值日主平順持衡之氣，事物趨於平整安穩，宜修路、粉刷、整地、談判等講求「削高補低、化異為同」之事；但開渠動土屬破土立形的大動作，祈福講究向上求變，都與「持平不變」的日氣相違，故不宜。' },
    { name: '定', luck: '吉', yi: '訂盟、納采、簽約、入學', ji: '訴訟、出行、搬遷', desc: '「定」值日主安定底定之氣，凡事一旦拍板便不易更動，最宜訂盟、納采、簽約、入學等講求「一言為定、從此固定」之事；但訴訟講究是非未決、出行搬遷講究變動位置，都需要流動與轉圜的空間，在定氣籠罩下反而容易僵持不下。' },
    { name: '執', luck: '中', yi: '捕捉、修造、簽約、納畜', ji: '開市、搬家、出行', desc: '「執」值日主持守固定之氣，如手中緊握、按部就班地執行，宜捕捉、修造、簽約、納畜等需要「按住不放、依規操作」之事；但開市講究廣納四方、搬家出行講究鬆動遷移，都與「執守一處」的性質相悖，故不宜。' },
    { name: '破', luck: '凶', yi: '拆卸、破屋、求醫治病', ji: '嫁娶、開市、簽約、上任（諸事不宜）', desc: '「破」值日主沖破之氣，舊有的格局在此日容易鬆動崩解，適合拆除、就醫等「破壞舊有以利新生」之事；但喜慶、簽約、上任這類講究穩固根基的大事，此日氣場不穩，貿然進行容易後患，故通書多列為諸事不宜。' },
    { name: '危', luck: '凶', yi: '祭祀、安床、靜養', ji: '登高、行船、冒險之事', desc: '「危」值日主高處不穩、如臨深淵之氣，宜收斂於室內，故祭祀、安床、靜養等安守本分之事無妨；但登高、行船、冒險等本身就帶有高處墜落、行於水上的風險，遇上危氣加乘，格外容易出意外，須格外謹慎避開。' },
    { name: '成', luck: '大吉', yi: '開市、嫁娶、入宅、上任、動土', ji: '訴訟、爭執', desc: '「成」值日主功成圓滿之氣，凡事水到渠成、大局已定，是十二值神中最吉利的一日，宜開市、嫁娶、入宅、上任、動土等一切開創新局、成就大事之舉；但訴訟爭執本質是懸而未決的對立，與「成」的圓滿安定氣場相衝，容易把事情鬧大而難善了。' },
    { name: '收', luck: '中', yi: '收帳、納財、入倉、豐收之事', ji: '開市、出行、安葬', desc: '「收」值日主收成收攏之氣，如秋收入倉、財物歸位，最宜收帳、納財、入倉等「往內聚合」之事；但開市出行講究向外拓展、安葬講究塵埃落定的終局安置，都與「收攏聚合」的方向不同，容易事倍功半。' },
    { name: '開', luck: '吉', yi: '開市、開工、嫁娶、祈福、入學', ji: '安葬、動土', desc: '「開」值日主開展舒張之氣，如雲開見日、門戶大開，最利開市、開工、嫁娶、祈福、入學等講求「開創新局、迎向未來」之事；但安葬講究入土封閉、動土講究驚動地脈，都需要收斂沉穩的氣場，與「開」的向外奔放性質相牴觸。' },
    { name: '閉', luck: '凶', yi: '築堤、封倉、收尾、立碑', ji: '開市、出行、手術', desc: '「閉」值日主收藏閉藏之氣，如歲末封藏、諸事歸於平靜，宜築堤、封倉、收尾、立碑等「封閉收束」之事；但開市出行講究門戶大開、向外流通，手術則需要傷口順利開合癒合，都與閉塞不通的日氣相違，故多有不利。' }
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

  // 廿八宿（錨點：2026-07-11＝胃宿，已對照通書驗證；週曜對齊：房虛昴星值日曜）
  const XIU = ['角木蛟', '亢金龍', '氐土貉', '房日兔', '心月狐', '尾火虎', '箕水豹',
    '斗木獬', '牛金牛', '女土蝠', '虛日鼠', '危月燕', '室火豬', '壁水貐',
    '奎木狼', '婁金狗', '胃土雉', '昴日雞', '畢月烏', '觜火猴', '參水猿',
    '井木犴', '鬼金羊', '柳土獐', '星日馬', '張月鹿', '翼火蛇', '軫水蚓'];
  const XIU_GOOD = new Set(['角', '房', '尾', '箕', '斗', '室', '壁', '婁', '胃', '畢', '參', '井', '張', '軫']);
  const XIU_ANCHOR_JDN = 2461233; // 2026-07-11
  function xiuOf(jdn) { return XIU[(((jdn - XIU_ANCHOR_JDN + 16) % 28) + 28) % 28]; }

  // 逐日胎神占方（六十甲子；已對照通書抽驗兩筆）
  const TAISHEN = [
    '占門碓 外東南', '碓磨廁 外東南', '廚灶爐 外正南', '倉庫門 外正南', '房床栖 外正南',
    '占門床 外正南', '占碓磨 外正南', '廚灶廁 外西南', '倉庫爐 外西南', '房床門 外西南',
    '門雞栖 外西南', '碓磨床 外西南', '廚灶碓 外西南', '倉庫廁 外正西', '房床爐 外正西',
    '占大門 外正西', '碓磨栖 外正西', '廚灶床 外正西', '倉庫碓 外正西', '房床廁 外西北',
    '占門爐 外西北', '碓磨門 外西北', '廚灶栖 外西北', '倉庫床 外西北', '房床碓 外正北',
    '占門廁 外正北', '碓磨爐 外正北', '廚灶門 外正北', '倉庫栖 外正北', '占房床 房內北',
    '占門碓 房內北', '碓磨廁 房內北', '廚灶爐 房內北', '倉庫門 房內北', '房床栖 房內南',
    '占門床 房內南', '占碓磨 房內南', '廚灶廁 房內南', '倉庫爐 房內南', '房床門 房內西',
    '門雞栖 房內東', '碓磨床 房內東', '廚灶碓 房內東', '倉庫廁 房內東', '房床爐 房內東',
    '占大門 外東北', '碓磨栖 外東北', '廚灶床 外東北', '倉庫碓 外東北', '房床廁 外東北',
    '占門爐 外東北', '碓磨門 外正東', '廚灶栖 外正東', '倉庫床 外正東', '房床碓 外正東',
    '占門廁 外正東', '碓磨爐 外東南', '廚灶門 外東南', '倉庫栖 外東南', '占房床 外東南'
  ];

  // 節日（回傳陣列）
  function festivalsOf(y, m, d, lunar) {
    const out = [];
    const solar = { '1-1': '元旦', '2-14': '西洋情人節', '2-28': '和平紀念日', '3-8': '婦女節', '4-4': '兒童節', '5-1': '勞動節', '8-8': '父親節', '9-28': '教師節', '10-10': '國慶日', '10-25': '光復節', '12-25': '行憲紀念日' };
    if (solar[`${m}-${d}`]) out.push(solar[`${m}-${d}`]);
    // 母親節：五月第二個星期日
    if (m === 5) {
      const first = new Date(y, 4, 1).getDay();
      const secondSunday = 1 + ((7 - first) % 7) + 7;
      if (d === secondSunday) out.push('母親節');
    }
    if (!lunar.isLeap) {
      const lu = { '1-1': '春節', '1-2': '春節（初二回娘家）', '1-3': '春節（初三）', '1-15': '元宵節', '5-5': '端午節', '7-7': '七夕', '7-15': '中元節', '8-15': '中秋節', '9-9': '重陽節', '12-8': '臘八節' };
      if (lu[`${lunar.month}-${lunar.day}`]) out.push(lu[`${lunar.month}-${lunar.day}`]);
      // 除夕：明日為正月初一
      const t = Astro.fromJD(Astro.toJD(y, m, d, 12) + 1);
      const tl = Astro.toLunar(t.y, t.m, t.d);
      if (tl && tl.month === 1 && tl.day === 1 && !tl.isLeap) out.push('除夕');
    }
    return out;
  }

  // 供首頁每日運勢卡與其他模組使用
  window.AlmanacEngine = {
    info(y, m, d) {
      const lunar = Astro.toLunar(y, m, d);
      const yp = Ganzhi.yearPillar(y, m, d);
      const mp = Ganzhi.monthPillar(y, m, d);
      const dp = Ganzhi.dayPillar(y, m, d);
      const phase = Astro.moonPhase(y, m, d);
      const jc = JIANCHU[((dp.zhiIdx - mp.zhiIdx) % 12 + 12) % 12];
      const jdn = Math.floor(Astro.toJD(y, m, d, 12));
      const xiu = xiuOf(jdn);
      return {
        lunar, yp, mp, dp, phase, jc, jdn, xiu,
        xiuGood: XIU_GOOD.has(xiu[0]),
        chongZhi: (dp.zhiIdx + 6) % 12,
        fests: festivalsOf(y, m, d, lunar)
      };
    }
  };

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

      const jdn = Math.floor(Astro.toJD(y, m, d, 12));
      const xiu = xiuOf(jdn);
      const xiuGood = XIU_GOOD.has(xiu[0]);
      const taishen = TAISHEN[dp.n];
      const fests = festivalsOf(y, m, d, lunar);

      resEl.innerHTML = `<div class="panel result">
        <div style="text-align:center">
          <div style="font-size:15px;color:var(--ink-dim)">${y} 年 ${m} 月 · 星期${week}</div>
          <div style="font-size:56px;color:var(--gold-bright);line-height:1.3">${d}</div>
          <div style="font-size:17px">農曆 ${lunar.monthName}${lunar.dayName} ${phase.icon}</div>
          ${fests.length ? `<div style="margin-top:4px">${fests.map(f => `<span class="tag" style="color:var(--cinnabar);border-color:rgba(176,48,32,.4);background:rgba(176,48,32,.06)">${Icons.svg('festival')} ${f}</span>`).join('')}</div>` : ''}
          <div class="muted" style="margin-top:4px">${yp.name}${yp.shengxiao}年 · ${mp.name}月 · ${dp.name}日（${dp.nayin}）</div>
          <div class="muted">${termNote}</div>
        </div>
        <hr class="divider">
        <div style="text-align:center">
          <span class="tag gold">${jc.name}日</span>
          <span class="tag">${jc.luck}</span>
          <span class="tag">沖${Ganzhi.SHENGXIAO[chongZhi]}（${Ganzhi.ZHI[chongZhi]}）</span>
          <span class="tag">煞${SHA_FANG[dp.zhiIdx]}</span>
          <span class="tag ${xiuGood ? 'gold' : ''}">${xiu}宿（${xiuGood ? '吉' : '凶'}）</span>
        </div>
        ${App.aspectGrid([['宜', jc.yi], ['忌', jc.ji]])}
        <p class="muted">${jc.desc}</p>
        <h4>彭祖百忌</h4>
        <p class="muted">${PENGZU_GAN[dp.gan]}；${PENGZU_ZHI[dp.zhi]}。</p>
        <h4>今日胎神占方</h4>
        <p class="muted">${taishen}——孕家此方位忌動土、釘鑿、搬移，以安胎氣。</p>
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
    icon: Icons.svg('almanac'),
    title: '農民曆',
    desc: '每日干支、農曆節氣、建除宜忌、沖煞方位、黃道吉時。',
    render
  });
})();
