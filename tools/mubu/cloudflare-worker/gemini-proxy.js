/* 暮卜先知 · Gemini 共用額度中介層（Cloudflare Worker）
 *
 * 用途：讓網站訪客不需自己申請 API Key 就能使用「AI 深度解讀」。
 * 真正的 Gemini API Key 只存在這個 Worker 的伺服器端環境變數，永遠不會出現在瀏覽器或前端原始碼裡。
 *
 * ── 部署步驟（Cloudflare 網頁後台，不需安裝任何工具）──
 * 1. 免費註冊 https://dash.cloudflare.com（若還沒有帳號）
 * 2. 左側選單找「Workers 與 Pages」→「建立」→「建立 Worker」
 * 3. 取個名字（例如 mubu-ai-proxy），建立後點「編輯程式碼」
 * 4. 把這個檔案的全部內容貼進去，取代預設範例程式碼，點「部署」
 * 5. 回到 Worker 設定頁 →「設定」→「變數與機密」→新增一個機密（Secret）：
 *      名稱：GEMINI_API_KEY
 *      值：貼上你自己申請的 Gemini API Key（aistudio.google.com/apikey 申請）
 *    務必選「Secret」類型（不是一般變數），這樣它就不會顯示在任何頁面或紀錄裡。
 * 6. 部署完成後，Cloudflare 會給你一個網址，長得像：
 *      https://mubu-ai-proxy.你的帳號名.workers.dev
 *    把這個網址複製起來，貼到 tools/mubu/js/core/ai.js 檔案最上面的 SHARED_PROXY_URL 常數。
 * 7. 下方 ALLOWED_ORIGINS 陣列請確認包含你實際部署網站的網域（GitHub Pages 網址）。
 *
 * 這個 Worker 完全在 Cloudflare 免費方案額度內運作（每天 10 萬次請求），不需要付費。
 */

const ALLOWED_ORIGINS = [
  'https://rocku112.github.io',
  'http://localhost:3000' // 本機預覽測試用，正式上線後可移除
];

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const MAX_OUTPUT_TOKENS = 1800; // 伺服器端強制上限，不採信客端傳來的數值，避免被濫用打爆額度
const MAX_MESSAGES = 20;        // 單次請求最多幾輪對話（含追問）
const MAX_TOTAL_CHARS = 20000;  // 所有訊息合計字數上限

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin'
  };
}

function json(status, obj, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return json(405, { error: 'method not allowed' }, headers);
    if (!env.GEMINI_API_KEY) return json(500, { error: '尚未設定 GEMINI_API_KEY，請至 Worker 設定加入機密變數' }, headers);

    let body;
    try { body = await request.json(); } catch (e) { return json(400, { error: 'invalid json' }, headers); }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json(400, { error: 'messages 為必填且需為非空陣列' }, headers);
    }
    if (body.messages.length > MAX_MESSAGES) {
      return json(400, { error: `對話輪數過多（上限 ${MAX_MESSAGES}）` }, headers);
    }
    const totalChars = body.messages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return json(400, { error: `訊息內容過長（上限 ${MAX_TOTAL_CHARS} 字）` }, headers);
    }

    let upstream;
    try {
      upstream = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${env.GEMINI_API_KEY}` },
        body: JSON.stringify({
          model: typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          messages: body.messages
        })
      });
    } catch (e) {
      return json(502, { error: '呼叫 Gemini 失敗：' + e.message }, headers);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...headers, 'content-type': upstream.headers.get('content-type') || 'text/event-stream' }
    });
  }
};
