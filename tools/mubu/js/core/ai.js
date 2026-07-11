/* 暮卜先知 · AI 解讀層
 * 內建規則解讀人人免費；想要 AI 深度解讀者自帶 API Key（僅存於瀏覽器 localStorage，絕不上傳）。
 * 支援 Claude（Anthropic）與 OpenAI 相容端點。
 */
const AI = (() => {
  const LS_KEY = 'mubu.ai.config';

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveConfig(cfg) { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }
  function hasKey() {
    const c = getConfig();
    return !!(c.provider && c.provider !== 'none' && c.apiKey);
  }

  const SYSTEM = '你是「暮卜先知」網站的命理解讀老師，精通中西方各派占卜與命理。請用繁體中文（台灣用語）、溫和專業的語氣解讀。' +
    '直接給出解讀內容，不要重複排盤資料本身。條理分明、具體實用，避免空泛套話；' +
    '結尾提醒：占卜結果僅供參考，人生方向仍由自己掌握。全文 400-600 字。';

  async function callClaude(cfg, prompt) {
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
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`API 錯誤 ${res.status}：${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.content.map(b => b.text || '').join('');
  }

  async function callOpenAI(cfg, prompt) {
    const base = cfg.baseUrl || 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        max_tokens: 1500,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`API 錯誤 ${res.status}：${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async function interpret(prompt) {
    const cfg = getConfig();
    if (!hasKey()) throw new Error('尚未設定 API Key');
    return cfg.provider === 'claude' ? callClaude(cfg, prompt) : callOpenAI(cfg, prompt);
  }

  // ---------- UI：AI 解讀區塊 ----------
  // 在結果底部附掛「AI 深度解讀」。buildPrompt() 由各模組提供，回傳排盤摘要文字。
  function attach(container, buildPrompt) {
    const box = document.createElement('div');
    box.className = 'ai-box';
    box.innerHTML = `
      <div class="ai-head">
        <b>🔮 AI 深度解讀</b>
        <button class="btn small ai-go">開始解讀</button>
        <span class="muted ai-hint"></span>
      </div>
      <div class="ai-output" style="display:none"></div>`;
    container.appendChild(box);
    const btn = box.querySelector('.ai-go');
    const hint = box.querySelector('.ai-hint');
    const out = box.querySelector('.ai-output');

    function refreshHint() {
      hint.textContent = hasKey()
        ? `使用 ${getConfig().provider === 'claude' ? 'Claude' : 'OpenAI'} · Key 僅存於你的瀏覽器`
        : '免費功能已含基本解讀；AI 深度解讀需在右下角「設定」填入自己的 API Key';
    }
    refreshHint();
    document.addEventListener('mubu:ai-config-changed', refreshHint);

    btn.addEventListener('click', async () => {
      if (!hasKey()) {
        document.dispatchEvent(new CustomEvent('mubu:open-settings'));
        return;
      }
      btn.disabled = true;
      out.style.display = '';
      out.className = 'ai-output loading';
      out.innerHTML = '<span class="spinner"></span>正在觀星測象，請稍候……';
      try {
        const text = await interpret(buildPrompt());
        out.className = 'ai-output';
        out.textContent = text;
      } catch (e) {
        out.className = 'ai-output';
        out.innerHTML = `<span style="color:var(--cinnabar)">解讀失敗：${e.message}</span>`;
      }
      btn.disabled = false;
      btn.textContent = '重新解讀';
    });
  }

  // ---------- 設定彈窗 ----------
  function openSettings() {
    const cfg = getConfig();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h3>⚙ AI 解讀設定</h3>
        <p class="muted">本站排盤與基本解讀完全免費。若想要 AI 深度整合解讀，請填入自己的 API Key —— Key 只儲存在<b>你自己的瀏覽器</b>（localStorage），不會傳給本站或任何第三方，呼叫 API 的費用由你的帳戶支付。</p>
        <div class="field">
          <label>AI 服務</label>
          <select id="ai-provider">
            <option value="none" ${!cfg.provider || cfg.provider === 'none' ? 'selected' : ''}>不使用（僅內建解讀）</option>
            <option value="claude" ${cfg.provider === 'claude' ? 'selected' : ''}>Claude（Anthropic）</option>
            <option value="openai" ${cfg.provider === 'openai' ? 'selected' : ''}>OpenAI / 相容端點</option>
          </select>
        </div>
        <div class="field"><label>API Key</label>
          <input id="ai-key" type="password" placeholder="sk-..." value="${cfg.apiKey || ''}"></div>
        <div class="field"><label>模型（可留空用預設）</label>
          <input id="ai-model" placeholder="claude-sonnet-5 / gpt-4o-mini" value="${cfg.model || ''}"></div>
        <div class="field" id="ai-base-row" style="display:${cfg.provider === 'openai' ? '' : 'none'}">
          <label>API 端點（OpenAI 相容服務可改，留空用官方）</label>
          <input id="ai-base" placeholder="https://api.openai.com/v1" value="${cfg.baseUrl || ''}"></div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn small" id="ai-save">儲存</button>
          <button class="btn small ghost" id="ai-cancel">取消</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('#ai-provider').addEventListener('change', (e) => {
      mask.querySelector('#ai-base-row').style.display = e.target.value === 'openai' ? '' : 'none';
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
