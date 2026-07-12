/* 暮卜先知 · 梅花易數 */
(() => {
  // 先天八卦：數字 1-8
  const TRIGRAMS = [
    { n: 1, name: '乾', sym: '☰', wx: '金', lines: [1, 1, 1], xiang: '天' },
    { n: 2, name: '兌', sym: '☱', wx: '金', lines: [1, 1, 0], xiang: '澤' },
    { n: 3, name: '離', sym: '☲', wx: '火', lines: [1, 0, 1], xiang: '火' },
    { n: 4, name: '震', sym: '☳', wx: '木', lines: [1, 0, 0], xiang: '雷' },
    { n: 5, name: '巽', sym: '☴', wx: '木', lines: [0, 1, 1], xiang: '風' },
    { n: 6, name: '坎', sym: '☵', wx: '水', lines: [0, 1, 0], xiang: '水' },
    { n: 7, name: '艮', sym: '☶', wx: '土', lines: [0, 0, 1], xiang: '山' },
    { n: 8, name: '坤', sym: '☷', wx: '土', lines: [0, 0, 0], xiang: '地' }
  ];
  const triByNum = (n) => TRIGRAMS[((n - 1) % 8 + 8) % 8];
  const triByLines = (ls) => TRIGRAMS.find(t => t.lines[0] === ls[0] && t.lines[1] === ls[1] && t.lines[2] === ls[2]);

  // 卦典索引（上卦名|下卦名 → HEXAGRAM_DATA）
  let HEX_MAP = null;
  function hexByTri(upper, lower) {
    if (!HEX_MAP) {
      HEX_MAP = {};
      HEXAGRAM_DATA.forEach(h => { HEX_MAP[h.upper + '|' + h.lower] = h; });
    }
    return HEX_MAP[upper.name + '|' + lower.name];
  }

  // 六爻（由下而上）→ 上下卦
  function hexFromLines(lines) {
    const lower = triByLines(lines.slice(0, 3));
    const upper = triByLines(lines.slice(3, 6));
    return { upper, lower, data: hexByTri(upper, lower), lines };
  }

  // 體用生剋斷語
  function tiyong(ti, yong) {
    const sheng = Ganzhi.WX_SHENG, ke = Ganzhi.WX_KE;
    if (ti.wx === yong.wx) return { level: '吉', text: `體用比和（${ti.wx}），諸事順遂，謀事可成。` };
    if (sheng[yong.wx] === ti.wx) return { level: '大吉', text: `用生體（${yong.wx}生${ti.wx}），得外力相助，事半功倍，吉。` };
    if (ke[ti.wx] === yong.wx) return { level: '小吉', text: `體剋用（${ti.wx}剋${yong.wx}），事可成但需費心力，遲滯而後得。` };
    if (sheng[ti.wx] === yong.wx) return { level: '不利', text: `體生用（${ti.wx}生${yong.wx}），洩氣耗損之象，付出多而收穫少。` };
    return { level: '凶', text: `用剋體（${yong.wx}剋${ti.wx}），阻力重重，所謀難成，宜守不宜攻。` };
  }

  function hexHTML(h, dong) {
    // 畫六爻（由上而下顯示第6~1爻）
    let rows = '';
    for (let i = 5; i >= 0; i--) {
      const yang = h.lines[i] === 1;
      const mark = dong === i + 1 ? ' ●' : '';
      rows += `<div style="letter-spacing:0">${yang ? '▬▬▬▬▬' : '▬▬&nbsp;&nbsp;▬▬'}<span style="color:var(--cinnabar)">${mark}</span></div>`;
    }
    return `<div style="text-align:center;font-size:15px;line-height:1.5">
      <div class="big-glyph">${h.data ? h.data.symbol : ''}</div>
      <div style="color:var(--gold-bright);font-size:17px;margin:4px 0">${h.data ? h.data.name : (h.upper.name + h.lower.name)}</div>
      <div style="font-family:monospace">${rows}</div>
      <div class="muted">${h.upper.name}${Icons.trigramSVG(h.upper.lines, { size: 14, color: Icons.WX_COLOR[h.upper.wx] })}上 ${h.lower.name}${Icons.trigramSVG(h.lower.lines, { size: 14, color: Icons.WX_COLOR[h.lower.wx] })}下</div>
    </div>`;
  }

  function divine(upperN, lowerN, dongN, method, question, container) {
    const upper = triByNum(upperN), lower = triByNum(lowerN);
    const dong = ((dongN - 1) % 6 + 6) % 6 + 1; // 1-6
    const lines = [...lower.lines, ...upper.lines];
    const ben = hexFromLines(lines);
    // 互卦：2,3,4 爻為下、3,4,5 爻為上
    const hu = hexFromLines([lines[1], lines[2], lines[3], lines[2], lines[3], lines[4]]);
    // 變卦：動爻變
    const bianLines = [...lines];
    bianLines[dong - 1] = 1 - bianLines[dong - 1];
    const bian = hexFromLines(bianLines);
    // 體用：動爻所在之卦為用
    const dongInUpper = dong >= 4;
    const ti = dongInUpper ? lower : upper;
    const yong = dongInUpper ? upper : lower;
    const ty = tiyong(ti, yong);

    const h = ben.data;
    let html = `<div class="panel result">
      <h3>卦象</h3>
      <div class="muted" style="text-align:center">${method}${question ? ` · 所問：${question}` : ''}</div>
      <div style="display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:10px">
        <div><h4 style="text-align:center">本卦</h4>${hexHTML(ben, dong)}</div>
        <div><h4 style="text-align:center">互卦</h4>${hexHTML(hu)}</div>
        <div><h4 style="text-align:center">變卦</h4>${hexHTML(bian)}</div>
      </div>
      <hr class="divider">
      <div style="text-align:center">
        <span class="tag gold">第 ${dong} 爻動</span>
        <span class="tag">體卦 ${ti.name}${Icons.trigramSVG(ti.lines, { size: 14, color: Icons.WX_COLOR[ti.wx] })}（${ti.wx}）</span>
        <span class="tag">用卦 ${yong.name}${Icons.trigramSVG(yong.lines, { size: 14, color: Icons.WX_COLOR[yong.wx] })}（${yong.wx}）</span>
      </div>
      <div style="text-align:center;margin-top:8px">
        <span class="fortune-level ${App.fortuneClass(ty.level)}">${ty.level}</span>
        <p style="margin-top:6px">${ty.text}</p>
      </div>`;
    if (h) {
      html += `<hr class="divider">
      <h4>卦辭</h4><p class="poem" style="font-size:16px">${h.ci}</p>
      <p style="margin-top:8px">${h.duan}</p>
      ${App.aspectGrid([['事業', h.aspects.career], ['感情', h.aspects.love], ['財運', h.aspects.wealth], ['健康', h.aspects.health], ['建議', h.aspects.advice]])}`;
      if (bian.data) {
        html += `<hr class="divider"><h4>變卦趨勢 → ${bian.data.name}</h4><p>${bian.data.duan}</p>`;
      }
    }
    html += `</div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    container.appendChild(div);

    AI.attach(div.querySelector('.panel'), () => {
      return `請以梅花易數為以下卦象做深度解讀。
所問之事：${question || '（未說明，做整體運勢解讀）'}
起卦方式：${method}
本卦：${h ? h.name : ''}（${ben.upper.name}上${ben.lower.name}下），卦辭：${h ? h.ci : ''}
互卦：${hu.data ? hu.data.name : ''}
變卦：${bian.data ? bian.data.name : ''}
動爻：第 ${dong} 爻
體卦：${ti.name}（${ti.wx}），用卦：${yong.name}（${yong.wx}），體用關係：${ty.text}
請按「本卦看現況、互卦看過程、變卦看結果」的思路，結合體用生剋，針對所問之事給出具體解讀與建議。`;
    });
  }

  App.register({
    id: 'meihua',
    icon: Icons.svg('meihua'),
    title: '梅花易數',
    desc: '時間起卦或數字起卦，觀本卦、互卦、變卦，以體用生剋斷吉凶。',
    render(el) {
      el.innerHTML = `
        <div class="panel">
          <h3>起卦</h3>
          <div class="field" style="margin-bottom:12px">
            <label>所問之事（可留空）</label>
            <input class="mh-q" placeholder="例：這份工作值得換嗎？" style="width:100%">
          </div>
          <div class="form-grid">
            <button class="btn" id="mh-time">⏰ 以此刻時間起卦</button>
            <div class="field"><label>或輸入兩個數字</label>
              <div style="display:flex;gap:8px">
                <input type="number" class="mh-n1" placeholder="上卦數" style="width:100px">
                <input type="number" class="mh-n2" placeholder="下卦數" style="width:100px">
                <button class="btn ghost small" id="mh-num">數字起卦</button>
              </div>
            </div>
          </div>
          <p class="muted" style="margin-top:10px">時間起卦：農曆年支數＋月＋日之和取八為上卦，再加時辰數取八為下卦，總數取六為動爻（邵雍法）。</p>
        </div>
        <div id="mh-result"></div>`;

      const resEl = el.querySelector('#mh-result');
      const q = () => el.querySelector('.mh-q').value.trim();

      el.querySelector('#mh-time').addEventListener('click', () => {
        resEl.innerHTML = '';
        const now = new Date();
        const lunar = Astro.toLunar(now.getFullYear(), now.getMonth() + 1, now.getDate());
        // 年支數：子=1...亥=12
        const yp = Ganzhi.yearPillar(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const yearNum = yp.zhiIdx + 1;
        const hourNum = Math.floor(((now.getHours() + 1) % 24) / 2) + 1; // 子=1
        const s1 = yearNum + lunar.month + lunar.day;
        const s2 = s1 + hourNum;
        const upperN = ((s1 - 1) % 8 + 8) % 8 + 1;
        const lowerN = ((s2 - 1) % 8 + 8) % 8 + 1;
        const method = `時間起卦（農曆${lunar.monthName}${lunar.dayName}，${yp.name}年，${Ganzhi.ZHI[(hourNum - 1) % 12]}時）`;
        divine(upperN, lowerN, s2, method, q(), resEl);
      });

      el.querySelector('#mh-num').addEventListener('click', () => {
        const n1 = +el.querySelector('.mh-n1').value, n2 = +el.querySelector('.mh-n2').value;
        if (!n1 || !n2 || n1 < 1 || n2 < 1) { resEl.innerHTML = '<div class="panel result"><p style="color:var(--cinnabar)">⚠ 請輸入兩個正整數</p></div>'; return; }
        resEl.innerHTML = '';
        divine(((n1 - 1) % 8) + 1, ((n2 - 1) % 8) + 1, n1 + n2, `數字起卦（${n1}、${n2}）`, q(), resEl);
      });
    }
  });
})();
