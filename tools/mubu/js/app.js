/* 暮卜先知 · 主程式（路由＋共用元件） */
const App = (() => {
  const modules = {};
  const order = [];
  let currentId = '';

  function register(mod) { modules[mod.id] = mod; order.push(mod.id); }
  function currentTitle() { return modules[currentId] ? modules[currentId].title : '占卜結果'; }

  const $main = () => document.getElementById('main');

  // ---------- 每日運勢卡 ----------
  function dailyCardHTML() {
    if (typeof AlmanacEngine === 'undefined' || typeof QIAN_DATA === 'undefined') return '';
    const n = new Date();
    const info = AlmanacEngine.info(n.getFullYear(), n.getMonth() + 1, n.getDate());
    if (!info.lunar) return '';
    const q = QIAN_DATA[info.jdn % QIAN_DATA.length]; // 每日一籤（依日期固定）
    const week = ['日', '一', '二', '三', '四', '五', '六'][n.getDay()];
    return `<div class="panel" style="margin-bottom:6px">
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
        <div style="text-align:center;min-width:120px">
          <div class="muted">${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()} 週${week}</div>
          <div style="font-size:26px;color:var(--navy);font-weight:700">${info.lunar.monthName}${info.lunar.dayName} ${info.phase.icon}</div>
          <div class="muted">${info.yp.name}年 ${info.dp.name}日</div>
          ${info.fests.length ? `<div style="color:var(--cinnabar);font-size:13px">${Icons.svg('festival')} ${info.fests.join('、')}</div>` : ''}
        </div>
        <div style="flex:1;min-width:220px">
          <div><span class="tag gold">${info.jc.name}日</span><span class="tag">沖${Ganzhi.SHENGXIAO[info.chongZhi]}</span><span class="tag ${info.xiuGood ? 'gold' : ''}">${info.xiu}宿</span></div>
          <div style="font-size:13.5px;margin-top:6px"><b style="color:var(--gold-deep)">宜</b> ${info.jc.yi}<br><b style="color:var(--cinnabar)">忌</b> ${info.jc.ji}</div>
        </div>
        <div style="flex:1;min-width:220px;border-left:1px dashed var(--panel-border);padding-left:18px">
          <div class="muted" style="font-size:12.5px">每日一籤 · 第${q.id}籤（${q.level}）</div>
          <div style="font-size:14.5px;letter-spacing:.08em;line-height:1.9">${q.poem[0]}，${q.poem[1]}。</div>
          <a href="#/qian" style="color:var(--gold-deep);font-size:13px">想問事？誠心求一籤 →</a>
        </div>
      </div>
    </div>`;
  }

  // ---------- 首頁 ----------
  function renderHome() {
    const el = $main();
    el.innerHTML = `
      <header class="site">
        <span class="taiji">${Icons.svg('meihua', { size: 44 })}</span>
        <h1>暮卜先知</h1>
        <div class="sub">日暮觀星 · 未卜先知</div>
        <div class="free-badge">完全免費 · 無需註冊 · 排盤全在你的瀏覽器運算</div>
      </header>
      ${dailyCardHTML()}
      <div class="menu-grid" id="menu"></div>
      <footer class="site">
        暮卜先知 © 日落工作室 SunDown Studio<br>
        所有占卜結果僅供參考娛樂，人生方向由你自己掌握 ✦ 排盤演算全在本機執行，不收集任何個人資料
      </footer>`;
    const menu = el.querySelector('#menu');
    for (const id of order) {
      const m = modules[id];
      const card = document.createElement('button');
      card.className = 'menu-card' + (m.wide ? ' wide' : '');
      card.innerHTML = `<span class="free-tag">免費</span><span class="icon">${m.icon}</span><h3>${m.title}</h3><p>${m.desc}</p>`;
      card.addEventListener('click', () => { location.hash = '#/' + id; });
      menu.appendChild(card);
    }
  }

  // ---------- 模組頁 ----------
  function renderModule(id) {
    const m = modules[id];
    if (!m) { location.hash = ''; return; }
    const el = $main();
    el.innerHTML = `
      <div class="module-view">
        <div class="topbar">
          <button class="btn-back">← 回首頁</button>
          <h2>${m.icon} ${m.title}</h2>
        </div>
        <div id="module-body"></div>
      </div>`;
    el.querySelector('.btn-back').addEventListener('click', () => { location.hash = ''; });
    m.render(el.querySelector('#module-body'));
    window.scrollTo(0, 0);
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    currentId = modules[h] ? h : '';
    if (h && modules[h]) renderModule(h); else renderHome();
  }

  // ---------- 共用：出生資料表單 ----------
  // opts: {gender:true/false, time:true/false, minute:true/false}
  function birthForm(opts = {}) {
    const now = new Date();
    const wantGender = opts.gender !== false;
    const wantTime = opts.time !== false;
    let html = `<div class="form-grid">
      <div class="field"><label>出生年（西元）</label><input type="number" class="bf-y" min="1900" max="2100" value="1990" style="width:110px"></div>
      <div class="field"><label>月</label><input type="number" class="bf-m" min="1" max="12" value="1" style="width:70px"></div>
      <div class="field"><label>日</label><input type="number" class="bf-d" min="1" max="31" value="1" style="width:70px"></div>`;
    if (wantTime) html += `
      <div class="field"><label>時（0-23）</label><input type="number" class="bf-h" min="0" max="23" value="12" style="width:80px"></div>
      <div class="field"><label>分</label><input type="number" class="bf-mi" min="0" max="59" value="0" style="width:70px"></div>`;
    if (wantGender) html += `
      <div class="field"><label>性別</label><select class="bf-g" style="width:80px">
        <option value="M">男</option><option value="F">女</option></select></div>`;
    html += `</div>`;
    return {
      html,
      read(root) {
        const g = (cls, def) => { const n = root.querySelector(cls); return n ? +n.value : def; };
        return {
          y: g('.bf-y', now.getFullYear()), m: g('.bf-m', 1), d: g('.bf-d', 1),
          hh: g('.bf-h', 12), mi: g('.bf-mi', 0),
          gender: root.querySelector('.bf-g') ? root.querySelector('.bf-g').value : 'M'
        };
      }
    };
  }

  function aspectGrid(pairs) {
    return `<div class="aspect-grid">${pairs.map(([k, v]) => `<div class="aspect"><b>${k}</b>${v}</div>`).join('')}</div>`;
  }

  function fortuneClass(level) {
    if (/上|吉|大吉/.test(level) && !/不/.test(level)) return 'good';
    if (/凶|下/.test(level)) return 'bad';
    return 'mid';
  }

  // ---------- 啟動 ----------
  function init() {
    // 設定按鈕
    const fab = document.createElement('button');
    fab.className = 'settings-fab';
    fab.innerHTML = `${Icons.svg('settings')} 設定`;
    fab.addEventListener('click', () => AI.openSettings());
    document.body.appendChild(fab);

    window.addEventListener('hashchange', route);
    route();

    // PWA：註冊 Service Worker（離線可用）
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 靜默失敗 */ });
    }
  }

  return { register, init, birthForm, aspectGrid, fortuneClass, currentTitle };
})();
window.App = App;

document.addEventListener('DOMContentLoaded', App.init);
