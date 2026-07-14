/* 暮卜先知 · AI 解讀層
 * 預設所有訪客共用本站提供的免費 Gemini 額度（透過 Cloudflare Worker 中介層，真正的 Key 不會出現在前端）。
 * 想用自己的 Key／額度可在設定改用 Claude／OpenAI／自己的 Gemini Key。
 */
const AI = (() => {
  const LS_KEY = 'mubu.ai.config';
  // 部署 tools/mubu/cloudflare-worker/gemini-proxy.js 後，把 Worker 網址填在這裡
  const SHARED_PROXY_URL = 'https://mubu-ai-proxy.YOUR-SUBDOMAIN.workers.dev';

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveConfig(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }
  function effectiveProvider(cfg) { return cfg.provider || 'shared'; }
  function hasKey() {
    const c = getConfig();
    const p = effectiveProvider(c);
    if (p === 'none') return false;
    if (p === 'shared') return true; // 共用額度不需使用者自備 Key
    return !!c.apiKey;
  }

  const SYSTEM = '你是「暮卜先知」網站的命理解讀老師，精通中西方各派占卜與命理。請用繁體中文（台灣用語）、溫和專業的語氣解讀。' +
    '直接給出解讀內容，不要重複排盤資料本身。條理分明、具體實用，避免空泛套話；' +
    '結尾提醒：占卜結果僅供參考，人生方向仍由自己掌握。全文 400-600 字。';

  // 讀取 SSE 串流，逐行呼叫 onLine
  async function readSSE(res, onLine) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data:')) onLine(line.slice(5).trim());
      }
    }
  }

  async function callClaude(cfg, messages, onDelta) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: cfg.model || 'claude-sonnet-5',
        max_tokens: 1800,
        stream: true,
        system: SYSTEM,
        messages
      })
    });
    if (!res.ok) throw new Error(`API 錯誤 ${res.status}：${(await res.text()).slice(0, 200)}`);
    let full = '';
    await readSSE(res, (data) => {
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data);
        if (j.type === 'content_block_delta' && j.delta && j.delta.text) { full += j.delta.text; onDelta(full); }
        if (j.type === 'error') throw new Error(j.error && j.error.message || 'stream error');
      } catch (e) { /* 忽略非 JSON 行 */ }
    });
    return full;
  }

  // 共用免費額度：呼叫自架的 Cloudflare Worker 中介層（不需使用者自己的 Key）
  async function callShared(messages, onDelta) {
    if (!SHARED_PROXY_URL || SHARED_PROXY_URL.includes('YOUR-SUBDOMAIN')) {
      throw new Error('共用額度尚未設定完成（站長需部署 Cloudflare Worker 並填入 ai.js 的 SHARED_PROXY_URL），可先在設定改用自己的 API Key。');
    }
    const res = await fetch(SHARED_PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM }, ...messages] })
    });
    if (!res.ok) throw new Error(`共用額度暫時無法使用（${res.status}）：${(await res.text()).slice(0, 200)}`);
    let full = '';
    await readSSE(res, (data) => {
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data);
        const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (t) { full += t; onDelta(full); }
      } catch (e) { /* 忽略 */ }
    });
    return full;
  }

  async function callOpenAI(cfg, messages, onDelta) {
    const base = cfg.baseUrl || 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        max_tokens: 1800,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM }, ...messages]
      })
    });
    if (!res.ok) throw new Error(`API 錯誤 ${res.status}：${(await res.text()).slice(0, 200)}`);
    let full = '';
    await readSSE(res, (data) => {
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data);
        const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (t) { full += t; onDelta(full); }
      } catch (e) { /* 忽略 */ }
    });
    return full;
  }

  // 多輪串流對話：messages 為 [{role:'user'|'assistant', content}]
  async function interpretStream(messages, onDelta) {
    const cfg = getConfig();
    const provider = effectiveProvider(cfg);
    if (!hasKey()) throw new Error('尚未設定 API Key');
    if (provider === 'shared') return callShared(messages, onDelta);
    if (provider === 'claude') return callClaude(cfg, messages, onDelta);
    if (provider === 'gemini') {
      // Google Gemini 的 OpenAI 相容端點；瀏覽器直呼、串流（使用者自己的 Key）
      return callOpenAI({ apiKey: cfg.apiKey, model: cfg.model || 'gemini-2.0-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' }, messages, onDelta);
    }
    return callOpenAI(cfg, messages, onDelta);
  }
  // 相容單輪介面
  async function interpret(prompt) { return interpretStream([{ role: 'user', content: prompt }], () => {}); }

  // ---------- UI：AI 解讀區塊（串流＋追問） ----------
  // 在結果底部附掛「AI 深度解讀」。buildPrompt() 由各模組提供，回傳排盤摘要文字。
  function attach(container, buildPrompt) {
    // 結果工具列：分享圖＋存入紀錄（每個占卜結果通用）
    {
      const tools = document.createElement('div');
      tools.className = 'result-tools';
      tools.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap';
      tools.innerHTML = `<button class="btn small ghost t-share">${Icons.svg('share')} 存成分享圖</button>
        <button class="btn small ghost t-save">${Icons.svg('save')} 存入紀錄</button>`;
      tools.querySelector('.t-share').addEventListener('click', () => {
        Extras.shareImage(container, (window.App && App.currentTitle && App.currentTitle()) || '占卜結果');
      });
      tools.querySelector('.t-save').addEventListener('click', (e) => {
        Extras.saveHistory(location.hash.replace(/^#\//, ''), (window.App && App.currentTitle && App.currentTitle()) || '占卜結果', container);
        e.target.innerHTML = `${Icons.svg('check')} 已存入紀錄`;
        setTimeout(() => { e.target.innerHTML = `${Icons.svg('save')} 存入紀錄`; }, 1600);
      });
      container.appendChild(tools);
    }

    const box = document.createElement('div');
    box.className = 'ai-box';
    box.innerHTML = `
      <div class="ai-head">
        <b>${Icons.svg('ai')} AI 深度解讀</b>
        <button class="btn small ai-go">開始解讀</button>
        <span class="muted ai-hint"></span>
      </div>
      <div class="ai-thread"></div>
      <div class="ai-followup" style="display:none;margin-top:12px;gap:8px;align-items:center">
        <input class="ai-q" placeholder="追問：例如「那我下個月適合換工作嗎？」" style="flex:1;background:#fff;border:1px solid var(--panel-border);border-radius:8px;padding:8px 12px;font-family:inherit;font-size:14px">
        <button class="btn small ai-ask">追問</button>
      </div>`;
    container.appendChild(box);
    const btn = box.querySelector('.ai-go');
    const hint = box.querySelector('.ai-hint');
    const thread = box.querySelector('.ai-thread');
    const followRow = box.querySelector('.ai-followup');
    const followInput = box.querySelector('.ai-q');
    const askBtn = box.querySelector('.ai-ask');
    const messages = []; // 對話脈絡

    function refreshHint() {
      const provider = effectiveProvider(getConfig());
      hint.textContent = provider === 'shared'
        ? '使用本站提供的免費 AI 額度 · 串流輸出（想改用自己的 Key 可在右下角「設定」調整）'
        : hasKey()
          ? `使用 ${({ claude: 'Claude', gemini: 'Google Gemini', openai: 'OpenAI' })[provider] || 'AI'} · 串流輸出 · Key 僅存於你的瀏覽器`
          : '免費功能已含基本解讀；AI 深度解讀需在右下角「設定」填入自己的 API Key';
    }
    refreshHint();
    document.addEventListener('mubu:ai-config-changed', refreshHint);

    async function run(userText, label) {
      if (!hasKey()) { document.dispatchEvent(new CustomEvent('mubu:open-settings')); return; }
      btn.disabled = true; askBtn.disabled = true;
      followRow.style.display = 'none';
      if (label) {
        const q = document.createElement('div');
        q.className = 'muted';
        q.style.cssText = 'margin-top:12px;padding:8px 12px;border-left:3px solid var(--gold-mid);background:var(--cream);border-radius:0 8px 8px 0';
        q.textContent = `追問：${label}`;
        thread.appendChild(q);
      }
      const out = document.createElement('div');
      out.className = 'ai-output loading';
      out.innerHTML = '<span class="spinner"></span>正在觀星測象……';
      thread.appendChild(out);
      messages.push({ role: 'user', content: userText });
      try {
        const full = await interpretStream(messages, (txt) => {
          out.className = 'ai-output';
          out.textContent = txt;
        });
        messages.push({ role: 'assistant', content: full });
        followRow.style.display = 'flex';
        followInput.value = '';
      } catch (e) {
        messages.pop(); // 失敗回退
        out.className = 'ai-output';
        out.innerHTML = `<span style="color:var(--cinnabar)">解讀失敗：${e.message}</span>`;
      }
      btn.disabled = false; askBtn.disabled = false;
      btn.textContent = '重新解讀';
    }

    btn.addEventListener('click', () => {
      if (btn.textContent === '重新解讀') { messages.length = 0; thread.innerHTML = ''; }
      run(buildPrompt(), null);
    });
    askBtn.addEventListener('click', () => {
      const q = followInput.value.trim();
      if (q) run(q, q);
    });
    followInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') askBtn.click(); });
  }

  // ---------- 設定彈窗 ----------
  function openSettings() {
    const cfg = getConfig();
    const provider = effectiveProvider(cfg);
    const needsKeyFields = provider !== 'shared' && provider !== 'none';
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h3>${Icons.svg('settings')} AI 解讀設定</h3>
        <p class="muted">本站排盤與基本解讀完全免費。「共用免費額度」是本站提供的 AI 服務，不需要你自己申請任何東西；若想用自己的帳戶額度或换其他家 AI，可在下面切換——自備的 Key 只儲存在<b>你自己的瀏覽器</b>（localStorage），不會傳給本站或任何第三方。</p>
        <div class="field">
          <label>AI 服務</label>
          <select id="ai-provider">
            <option value="shared" ${provider === 'shared' ? 'selected' : ''}>共用免費額度（本站提供，免設定）</option>
            <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Google Gemini（自己的 Key）</option>
            <option value="claude" ${provider === 'claude' ? 'selected' : ''}>Claude（Anthropic）</option>
            <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI / 相容端點</option>
            <option value="none" ${provider === 'none' ? 'selected' : ''}>不使用（僅內建解讀）</option>
          </select>
        </div>
        <div class="field" id="ai-gemini-hint" style="display:${provider === 'gemini' ? '' : 'none'}">
          <p class="muted" style="margin:0">Gemini 免費 Key 申請：到 <b>aistudio.google.com/apikey</b> 登入 Google 帳號 → 建立 API 金鑰 → 複製貼到下方。模型留空預設用 <b>gemini-2.0-flash</b>（免費、繁中佳）。</p></div>
        <div class="field" id="ai-key-row" style="display:${needsKeyFields ? '' : 'none'}"><label>API Key</label>
          <input id="ai-key" type="password" placeholder="${provider === 'gemini' ? 'AIza...' : 'sk-...'}" value="${cfg.apiKey || ''}"></div>
        <div class="field" id="ai-model-row" style="display:${needsKeyFields ? '' : 'none'}"><label>模型（可留空用預設）</label>
          <input id="ai-model" placeholder="${provider === 'gemini' ? 'gemini-2.0-flash / gemini-2.5-flash' : 'claude-sonnet-5 / gpt-4o-mini'}" value="${cfg.model || ''}"></div>
        <div class="field" id="ai-base-row" style="display:${provider === 'openai' ? '' : 'none'}">
          <label>API 端點（OpenAI 相容服務可改，留空用官方）</label>
          <input id="ai-base" placeholder="https://api.openai.com/v1" value="${cfg.baseUrl || ''}"></div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn small" id="ai-save">儲存</button>
          <button class="btn small ghost" id="ai-cancel">取消</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('#ai-provider').addEventListener('change', (e) => {
      const v = e.target.value;
      const needsKeys = v !== 'shared' && v !== 'none';
      mask.querySelector('#ai-key-row').style.display = needsKeys ? '' : 'none';
      mask.querySelector('#ai-model-row').style.display = needsKeys ? '' : 'none';
      mask.querySelector('#ai-base-row').style.display = v === 'openai' ? '' : 'none';
      mask.querySelector('#ai-gemini-hint').style.display = v === 'gemini' ? '' : 'none';
      mask.querySelector('#ai-key').placeholder = v === 'gemini' ? 'AIza...' : 'sk-...';
      mask.querySelector('#ai-model').placeholder = v === 'gemini' ? 'gemini-2.0-flash / gemini-2.5-flash' : 'claude-sonnet-5 / gpt-4o-mini';
    });
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    mask.querySelector('#ai-cancel').addEventListener('click', () => mask.remove());
    mask.querySelector('#ai-save').addEventListener('click', () => {
      saveConfig({
        provider: mask.querySelector('#ai-provider').value,
        apiKey: mask.querySelector('#ai-key').value.trim(),
        model: mask.querySelector('#ai-model').value.trim(),
        baseUrl: mask.querySelector('#ai-base').value.trim()
      });
      mask.remove();
      document.dispatchEvent(new CustomEvent('mubu:ai-config-changed'));
    });
  }

  document.addEventListener('mubu:open-settings', openSettings);

  return { getConfig, saveConfig, hasKey, interpret, attach, openSettings };
})();
