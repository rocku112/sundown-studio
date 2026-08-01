function launchTool(tid) {
  document.getElementById('lp-wrap').classList.add('hidden');
  var aw = document.getElementById('app-wrap');
  aw.classList.remove('hidden');
  switchTab(tid);
  window.scrollTo({top:0,behavior:'smooth'});
  if(typeof lucide!=='undefined') try{lucide.createIcons();}catch(e){}
}
function goHome() {
  document.getElementById('app-wrap').classList.add('hidden');
  document.getElementById('lp-wrap').classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
// back button is in HTML

// ─── Restore sidebar pref on load ──────────────────────────────────────────
(function() {
  if (localStorage.getItem('sbPref') === 'hide') {
    document.querySelectorAll('.sidebar').forEach(sb => sb.classList.add('sb-hidden'));
    const btn = document.getElementById('sbToggleBtn');
    if (btn) {
      setSbIcon(btn, 'panel-right-open');
      btn.classList.add('sb-closed');
    }
  }
})();

// ─── Radio group visual state (fallback for browsers without CSS :has()) ────
function syncRadioGroup(group) {
  group.querySelectorAll('label').forEach(lbl => {
    lbl.classList.toggle('r-active', lbl.querySelector('input[type=radio]')?.checked);
  });
}
document.querySelectorAll('.radio-g').forEach(g => {
  syncRadioGroup(g);
  g.addEventListener('change', () => syncRadioGroup(g));
});

// ─── Fix toast class name bug ───────────────────────────────────────────────
(function(){
  const origToast = window.toast;
  window.toast = function(msg, err=false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = err ? 'err show' : 'show';
    clearTimeout(window._tt);
    window._tt = setTimeout(() => el.className = '', 3500);
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
// HASH ROUTING — load correct tab from URL hash
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  const hash = location.hash.replace('#','');
  const valid = ['pdf','heic','compress','resize','pdfops','pdfcmp','pdfmix','pageman','pdfwm','pdfann','officeimg'];
  if (valid.includes(hash)) {
    // Only apply if app-wrap is visible (user navigated directly to tool)
    const tryApply = () => {
      const aw = document.getElementById('app-wrap');
      if (aw && !aw.classList.contains('hidden')) switchTab(hash);
    };
    setTimeout(tryApply, 100);
  }
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#','');
    if (valid.includes(h)) switchTab(h);
  });
})();

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS MEMORY — save/restore all sidebar inputs via localStorage
// ═══════════════════════════════════════════════════════════════════════════
const SDS_KEY = 'sds_luoxia_settings_v1';

function saveSettings() {
  const out = {};
  document.querySelectorAll('.sidebar input:not([type=file]), .sidebar select').forEach(el => {
    if (!el.id) return;
    if (el.type === 'radio') out['radio_' + el.name] = el.checked ? el.value : (out['radio_' + el.name] || '');
    else if (el.type === 'checkbox') out[el.id] = el.checked;
    else if (el.type === 'color') out[el.id] = el.value;
    else out[el.id] = el.value;
  });
  try { localStorage.setItem(SDS_KEY, JSON.stringify(out)); } catch(e) {}
}

function loadSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(SDS_KEY) || 'null'); } catch(e) {}
  if (!saved) return;
  Object.entries(saved).forEach(([k, v]) => {
    if (k.startsWith('radio_')) {
      const name = k.replace('radio_', '');
      const radio = document.querySelector(`input[type=radio][name="${name}"][value="${v}"]`);
      if (radio) radio.checked = true;
    } else {
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
      // fire input/change to update display spans & visibility
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    }
  });
}

// Save on any sidebar input change
document.querySelectorAll('.sidebar input:not([type=file]), .sidebar select').forEach(el => {
  el.addEventListener('change', saveSettings);
  el.addEventListener('input', saveSettings);
});
loadSettings();

// ═══════════════════════════════════════════════════════════════════════════
// CARD CLICK RE-DOWNLOAD — delegated click on .fc.card-done
// ═══════════════════════════════════════════════════════════════════════════
function getEnById(id) {
  const all = [
    ...(typeof cpS !== 'undefined' ? cpS.files : []),
    ...(typeof rzS !== 'undefined' ? rzS.files : []),
    ...(typeof pcS !== 'undefined' ? pcS.files : []),
    ...(typeof pS  !== 'undefined' ? pS.files  : []),
  ];
  return all.find(f => f.id === id);
}

document.addEventListener('click', function(e) {
  const card = e.target.closest('.fc.card-done');
  if (!card || e.target.closest('.rb')) return;
  const en = getEnById(card.id);
  if (en && en._outBlob && en._outName) {
    dlBlob(en._outBlob, en._outName);
    toast('重新下載：' + en._outName);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CTRL+V PASTE — route image paste to current tool
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('paste', function(e) {
  if (document.getElementById('app-wrap').classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const items = [...(e.clipboardData?.items || [])];
  const imageFiles = items
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile())
    .filter(Boolean);
  if (!imageFiles.length) return;
  const tab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (tab === 'compress') { cpHF(imageFiles); toast('已貼上 ' + imageFiles.length + ' 張圖片'); }
  else if (tab === 'resize')   { rzHF(imageFiles); toast('已貼上 ' + imageFiles.length + ' 張圖片'); }
  else if (tab === 'pdfmix')   { mxAddImgFiles && mxAddImgFiles(imageFiles); toast('已貼上 ' + imageFiles.length + ' 張圖片'); }
  else toast('請切換到圖片壓縮或尺寸調整工具後再貼上');
});

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════
const TAB_KEYS = {'1':'pdf','2':'heic','3':'compress','4':'resize','5':'pdfops','6':'pdfcmp','7':'pdfmix','8':'pageman','9':'pdfwm','0':'pdfann'};

document.addEventListener('keydown', function(e) {
  if (document.getElementById('app-wrap').classList.contains('hidden')) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // 1-7: switch tool
  if (TAB_KEYS[e.key]) { switchTab(TAB_KEYS[e.key]); return; }

  const tab = document.querySelector('.tab-btn.active')?.dataset.tab;

  // Enter: start conversion on current tool
  if (e.key === 'Enter') {
    e.preventDefault();
    const btnMap = {pdf:'pdfCvt',heic:'hCvt',compress:'cpCvt',resize:'rzCvt',pdfcmp:'pcCvt',pdfmix:'mxCvt',pageman:'pmExport',pdfwm:'wmExport',pdfann:'annExport',officeimg:'ofZip'};
    if (tab === 'pdfops') {
      const mergeBtn = document.getElementById('poMCvt');
      const splitBtn = document.getElementById('poSCvt');
      const active = (mergeBtn && !mergeBtn.closest('[style*="display:none"]') && !mergeBtn.disabled) ? mergeBtn
                   : (splitBtn && !splitBtn.disabled) ? splitBtn : null;
      if (active) active.click();
    } else {
      const btn = document.getElementById(btnMap[tab]);
      if (btn && !btn.disabled) btn.click();
    }
  }

  // Escape: clear current tool
  if (e.key === 'Escape') {
    const clrMap = {pdf:'pdfClr',heic:'hClr',compress:'cpClr',resize:'rzClr',pdfcmp:'pcClr',pdfmix:'mxClr',pageman:'pmClr',pdfwm:'wmClr',pdfann:'annClr',officeimg:'ofClr'};
    const btn = document.getElementById(clrMap[tab]);
    if (btn && !btn.disabled) btn.click();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TOOL CHAIN SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════
const CHAIN_MAP = {
  pdf:    [['compress','圖片壓縮'],['resize','尺寸調整']],
  heic:   [['compress','圖片壓縮'],['resize','尺寸調整']],
  compress:[['resize','尺寸調整'],['pdfmix','混合合併']],
  resize: [['compress','圖片壓縮'],['pdfmix','混合合併']],
  pdfops: [['pdfcmp','PDF 壓縮']],
  pdfcmp: [['pdfops','PDF 合併/拆分']],
  pdfmix: [['pdfcmp','PDF 壓縮']],
  pageman:[['pdfcmp','PDF 壓縮'],['pdfops','PDF 合併/拆分']],
  pdfwm:  [['pdfcmp','PDF 壓縮'],['pageman','頁面管理']],
  pdfann: [['pdfwm','浮水印'],['pdfcmp','PDF 壓縮']],
  officeimg:[['compress','圖片壓縮'],['resize','尺寸調整']],
};

function showChain(tab) {
  const bannerId = {pdf:'chain-pdf',heic:'chain-heic',compress:'chain-compress',
                    resize:'chain-resize',pdfcmp:'chain-pdfcmp',pageman:'chain-pageman',pdfwm:'chain-pdfwm',pdfann:'chain-pdfann',officeimg:'chain-officeimg'}[tab];
  if (!bannerId) return;
  const banner = document.getElementById(bannerId);
  if (!banner) return;
  const targets = CHAIN_MAP[tab] || [];
  banner.innerHTML =
    '<span class="chain-banner-label">✓ 完成！繼續用：</span>' +
    targets.map(([t,label]) =>
      `<button class="chain-btn" onclick="switchTab('${t}');this.closest('.chain-banner').classList.remove('show')">${label} →</button>`
    ).join('') +
    '<button class="chain-btn" style="background:transparent;color:var(--text3);border:1px solid var(--border);margin-left:auto;" onclick="this.closest(\'.chain-banner\').classList.remove(\'show\')">關閉</button>';
  banner.classList.add('show');
}

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE IMAGE LOADER
// ═══════════════════════════════════════════════════════════════════════════
function loadSampleImg(tool) {
  const cv = document.createElement('canvas');
  cv.width = 800; cv.height = 600;
  const ctx = cv.getContext('2d');
  // Background gradient
  const g = ctx.createLinearGradient(0, 0, 800, 600);
  g.addColorStop(0, '#1E3554'); g.addColorStop(1, '#3D5A80');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 600);
  // Gold arc
  ctx.beginPath(); ctx.arc(400, 260, 180, Math.PI, 0);
  ctx.fillStyle = '#E8B84B'; ctx.fill();
  // Text
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 52px sans-serif'; ctx.fillText('落霞千頁', 400, 370);
  ctx.font = '22px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillText('SunDown Studio · Sample Image', 400, 415);
  ctx.font = '14px monospace'; ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillText('800 × 600 px', 400, 450);

  cv.toBlob(blob => {
    const file = new File([blob], 'sample_luoxia.jpg', { type: 'image/jpeg' });
    if (tool === 'compress') cpHF([file]);
    else if (tool === 'resize') rzHF([file]);
    toast('已載入範例圖片');
  }, 'image/jpeg', 0.92);
}

// Per-tool SEO landing pages (pdf-to-jpg.html, en/…) set window.SD_TOOL to open that tool directly.
if (window.SD_TOOL) { try { launchTool(window.SD_TOOL); } catch(e){} }
