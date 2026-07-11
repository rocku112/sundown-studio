/* 暮卜先知 · 體驗擴充：分享圖、占卜歷史紀錄 */
const Extras = (() => {
  const LS_HIST = 'mubu.history';

  // ---------- 分享圖（Canvas 繪製，無外部依賴） ----------
  function shareImage(panel, title) {
    // 取結果文字（排除 AI 區與工具列）
    const clone = panel.cloneNode(true);
    clone.querySelectorAll('.ai-box, .result-tools').forEach(n => n.remove());
    const rawLines = clone.innerText.split('\n').map(s => s.trim()).filter(Boolean);

    const W = 720, PAD = 48, LH = 30, FONT = '17px "Noto Serif TC", serif';
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = FONT;
    // 斷行
    const lines = [];
    for (const raw of rawLines) {
      let cur = '';
      for (const ch of raw) {
        if (ctx.measureText(cur + ch).width > W - PAD * 2) { lines.push(cur); cur = ch; }
        else cur += ch;
      }
      lines.push(cur);
      if (lines.length > 90) break; // 超長結果截斷
    }
    const truncated = lines.length > 90;
    const body = lines.slice(0, 90);
    const H = 168 + body.length * LH + 96;
    cv.width = W * 2; cv.height = H * 2;
    ctx.scale(2, 2);

    // 底
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#F5F0E8'); bg.addColorStop(1, '#EDE7D9');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 頂部光暈
    const glow = ctx.createRadialGradient(W * 0.8, -40, 10, W * 0.8, -40, 320);
    glow.addColorStop(0, 'rgba(232,184,75,.35)'); glow.addColorStop(1, 'rgba(232,184,75,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 300);
    // 外框
    ctx.strokeStyle = '#C9960A'; ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    // 標頭
    ctx.fillStyle = '#8a5e00';
    ctx.font = 'bold 30px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`☯ 暮卜先知 · ${title}`, W / 2, 72);
    ctx.font = '14px "Noto Serif TC", serif';
    ctx.fillStyle = '#8A96A8';
    const n = new Date();
    ctx.fillText(`${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, W / 2, 100);
    ctx.strokeStyle = 'rgba(201,150,10,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 122); ctx.lineTo(W - PAD, 122); ctx.stroke();
    // 內文
    ctx.textAlign = 'left';
    ctx.font = FONT;
    body.forEach((ln, i) => {
      // 小標題样式（原 h3/h4 無法辨識，簡單規則：短行且不含標點視為重點行）
      ctx.fillStyle = '#1A2535';
      ctx.fillText(ln, PAD, 156 + i * LH);
    });
    if (truncated) { ctx.fillStyle = '#8A96A8'; ctx.fillText('……（內容過長已截斷）', PAD, 156 + body.length * LH); }
    // 頁尾
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8A96A8';
    ctx.font = '13px "Noto Serif TC", serif';
    ctx.fillText('免費線上占卜 · rocku112.github.io/sundown-studio/tools/mubu', W / 2, H - 44);
    ctx.fillStyle = '#B8AE9C';
    ctx.fillText('結果僅供參考，人生方向由你自己掌握', W / 2, H - 24);

    const a = document.createElement('a');
    a.download = `暮卜先知_${title}_${n.getMonth() + 1}${n.getDate()}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  // ---------- 歷史紀錄 ----------
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HIST)) || []; } catch (e) { return []; }
  }
  function saveHistory(moduleId, title, panel) {
    const clone = panel.cloneNode(true);
    clone.querySelectorAll('.result-tools').forEach(n => n.remove());
    const text = clone.innerText.trim().slice(0, 6000);
    const list = getHistory();
    list.unshift({ id: Date.now(), ts: new Date().toISOString(), module: moduleId, title, text });
    if (list.length > 100) list.length = 100;
    localStorage.setItem(LS_HIST, JSON.stringify(list));
  }
  function deleteHistory(id) {
    localStorage.setItem(LS_HIST, JSON.stringify(getHistory().filter(h => h.id !== id)));
  }

  // 歷史紀錄頁
  App.register({
    id: 'history',
    icon: '📜',
    title: '占卜紀錄',
    desc: '你存下的占卜結果都在這（僅存於本機瀏覽器，最多 100 筆）。',
    render(el) {
      function paint() {
        const list = getHistory();
        el.innerHTML = `
          <div class="panel">
            <h3>歷史紀錄（${list.length} 筆）</h3>
            ${list.length ? '' : '<p class="muted">還沒有紀錄。占卜後點結果下方的「💾 存入紀錄」即可保存。</p>'}
            <div id="hist-list"></div>
            ${list.length ? '<button class="btn small ghost" id="hist-clear" style="margin-top:12px">🗑 清空全部</button>' : ''}
          </div>`;
        const listEl = el.querySelector('#hist-list');
        for (const h of list) {
          const d = new Date(h.ts);
          const item = document.createElement('div');
          item.className = 'aspect';
          item.style.marginTop = '10px';
          item.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <b style="display:inline;margin:0">${h.title}</b>
              <span class="muted">${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>
              <span style="flex:1"></span>
              <button class="btn small ghost h-view">展開</button>
              <button class="btn small ghost h-del" style="border-color:rgba(176,48,32,.4);color:var(--cinnabar)">刪除</button>
            </div>
            <div class="h-body" style="display:none;white-space:pre-wrap;margin-top:10px;font-size:14px;border-top:1px dashed var(--panel-border);padding-top:10px">${h.text.replace(/</g, '&lt;')}</div>`;
          item.querySelector('.h-view').addEventListener('click', (e) => {
            const b = item.querySelector('.h-body');
            const open = b.style.display === 'none';
            b.style.display = open ? '' : 'none';
            e.target.textContent = open ? '收合' : '展開';
          });
          item.querySelector('.h-del').addEventListener('click', () => { deleteHistory(h.id); paint(); });
          listEl.appendChild(item);
        }
        const clearBtn = el.querySelector('#hist-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => {
          if (confirm('確定清空全部占卜紀錄？')) { localStorage.removeItem(LS_HIST); paint(); }
        });
      }
      paint();
    }
  });

  return { shareImage, getHistory, saveHistory, deleteHistory };
})();
