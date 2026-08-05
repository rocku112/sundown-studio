/* Promptasy · 離線評分引擎
 * 結構型檢核（structural checks）：不呼叫任何模型、不連任何後端。
 * 每一條檢核都在「組裝後的提示詞文本」上做結構辨識，而不是關鍵字比對：
 * 關鍵字必須出現在對的位置、帶著具體內容，才算數。
 */
(function (P) {
  'use strict';

  var CHECKS = {};

  /** 註冊一條檢核。fn 回傳 true/false 或 0~1 的部分分數。 */
  function K(id, label, why, fn) {
    CHECKS[id] = { id: id, label: label, why: why, test: fn };
  }

  // ---- 共用小工具 -----------------------------------------------------

  /** 關鍵字後面必須跟著「具體內容」才算數（防止關鍵字堆砌）。 */
  function withBody(t, kw, minBody) {
    minBody = minBody || 4;
    var re = new RegExp('(' + kw + ')[：:，、\\s]*([^\\n。；]{' + minBody + ',})');
    return re.test(t);
  }

  /** 兩個模式必須在同一段落內（距離 span 字元內）出現。 */
  function near(t, reA, reB, span) {
    span = span || 60;
    var a = t.search(reA);
    if (a < 0) return false;
    var b = t.search(reB);
    if (b < 0) return false;
    return Math.abs(a - b) <= span;
  }

  /** A 必須出現在 B 之前。 */
  function before(t, reA, reB) {
    var a = t.search(reA), b = t.search(reB);
    return a >= 0 && b >= 0 && a < b;
  }

  /** 取出 key = value / key: value 形式的設定值。key 允許是帶 | 的樣式。 */
  function val(t, key) {
    var m = t.match(new RegExp('(?:' + key + ')\\s*[=:：]\\s*([^\\s，,。；;\\n]+)', 'i'));
    // key 樣式本身可能帶括號分組，值一律是最後一組
    return m ? String(m[m.length - 1]).trim() : null;
  }

  /** 同上，但把「不設定 / 無 / none / null」視為沒有設定。 */
  function setVal(t, key) {
    var v = val(t, key);
    if (!v) return null;
    return /^(不設定|未設定|無|none|null|off|關)$/i.test(v) ? null : v;
  }

  /** 計數 */
  function count(t, re) {
    var m = t.match(re);
    return m ? m.length : 0;
  }

  P.checkUtils = { withBody: withBody, near: near, before: before, val: val, count: count };

  // =====================================================================
  // 第二章 清晰、具體與正面框架
  // =====================================================================
  K('goal', '任務目標明確',
    '模型需要知道「要產出什麼」，而不是只知道題目在講什麼。動詞＋產出物才構成任務。',
    function (c) { return /(請|你要|目標是|任務是|需要你)?\s*(撰寫|產出|生成|整理|分析|改寫|摘要|翻譯|分類|抽取|規劃|審查|回覆|設計)[^\n。]{4,}/.test(c.text); });

  K('specific', '需求具體化',
    '「寫一篇文章」和「寫一篇 800 字、給非技術主管看的專案風險摘要」是兩個不同的任務。',
    function (c) { return /\d+\s*(字|則|條|個|項|段|點|行|頁|秒|分鐘|%|％)/.test(c.text) || /(針對|限定|僅限|範圍為|對象是)[^\n。]{4,}/.test(c.text); });

  K('positive', '正面框架',
    '「要做什麼」比「不要做什麼」更好執行；否定句留下的是一片空白，模型得自己猜。',
    function (c) {
      var neg = count(c.text, /(不要|不准|禁止|別再|勿)/g);
      var pos = count(c.text, /(請|應|需|務必|改為|採用|使用|輸出|保持|回答|標註|標明|列出|遮蔽|一律|填|保留)/g);
      if (pos === 0) return false;
      return neg === 0 ? 1 : Math.max(0, Math.min(1, (pos - neg + 2) / (pos + 2)));
    });

  K('measurable', '限制可量測',
    '「簡短一點」無法驗收，「不超過 120 字」可以。可量測的限制才是真的限制。',
    function (c) { return /(不超過|至多|最多|至少|介於|上限|下限|恰好)\s*[\d一二三四五六七八九十兩]/.test(c.text) || /\d+\s*(字|則|項|個|條|行)以[內下上]/.test(c.text); });

  K('imperative', '祈使語氣',
    '要求行動時用祈使句。描述句會被當成背景，祈使句才會被當成指令。',
    function (c) { return /(^|\n)\s*(請|你要|務必|直接|先|接著|最後|輸出|列出|回傳|依照)/.test(c.text); });

  K('noManip', '不使用操縱話術',
    '全大寫、小費、威脅、假造急迫性，對現代模型沒有效果，只會污染指令。',
    function (c) { return !/(小費|給你錢|否則我會|會死|非常非常非常|!!!|緊急緊急|[A-Z]{12,})/.test(c.text); });

  K('noVague', '避免模糊詞',
    '「盡量」「適當」「好一點」把判斷責任丟回給模型，結果就會飄。',
    function (c) {
      var bad = count(c.text, /(盡量|適當地?|好一點|差不多|自行斟酌|看情況)/g);
      return bad === 0 ? 1 : Math.max(0, 1 - bad * 0.34);
    });

  K('audience', '指定讀者',
    '同一份內容給工程師和給董事會，該長什麼樣完全不同。',
    function (c) { return /(讀者|對象|受眾|給[^\n]{1,12}(看|閱讀|使用)|面向)[^\n。]{2,}/.test(c.text); });

  K('scopeBound', '界定範圍',
    '沒有邊界的任務會無限膨脹。明講「涵蓋什麼、不涵蓋什麼」。',
    function (c) { return /(僅|只|限於|範圍[：:]|不涵蓋|排除|超出範圍)/.test(c.text); });

  // =====================================================================
  // 第三章 脈絡、動機與背景
  // =====================================================================
  K('why', '說明規則的理由',
    '講清楚「為什麼」，模型才能把規則類推到你沒寫到的情況。',
    function (c) { return /(因為|原因是|理由是|以便|目的是|這是為了|之所以)[^\n。]{4,}/.test(c.text); });

  K('background', '提供必要背景',
    '模型不知道你公司的事。需要的資訊要直接放進提示詞裡。',
    function (c) { return /(背景|情境|前提|已知|現況|脈絡)[：:][^\n]{6,}/.test(c.text); });

  K('sepContextRule', '區分背景與規則',
    '「參考資料」和「行為規則」混在一起，模型會把資料當指令、把指令當資料。',
    function (c) { return /(背景|資料|參考|素材)/.test(c.text) && /(規則|要求|限制|指示)/.test(c.text) && /(<[^>]+>|###|【|```)/.test(c.text); });

  K('domainSet', '限定領域',
    '把模型鎖在它該待的領域裡，可觀地減少離題。',
    function (c) { return /(在[^\n]{2,16}領域|以[^\n]{2,20}(專業|角度|標準|觀點)|依(照|據)[^\n]{2,20}(規範|準則|法規|條|辦法))/.test(c.text); });

  // =====================================================================
  // 第四章 結構、分隔符與官方模板
  // =====================================================================
  K('delimiters', '使用分隔符',
    'XML 標籤、Markdown 標題、三重反引號都可以，重點是讓模型看得出邊界在哪。',
    function (c) { return /<\/?[\w一-鿿][^>]*>/.test(c.text) || /(^|\n)#{2,}\s/.test(c.text) || /```/.test(c.text) || /(^|\n)【[^】]+】/.test(c.text); });

  K('sections', '分段標題齊備',
    '至少要有「任務 / 資料 / 輸出」三段。少一段，模型就得猜一段。',
    function (c) {
      var s = 0;
      if (/(任務|指令|你要做|目標)/.test(c.text)) s++;
      if (/(資料|背景|素材|輸入|脈絡)/.test(c.text)) s++;
      if (/(輸出|格式|回傳|產出)/.test(c.text)) s++;
      return s / 3;
    });

  K('templateFull', '七段式模板完整',
    'Google 七段式：目標與角色、指示、脈絡、限制、輸出格式、範例、語氣。缺角就補。',
    function (c) {
      var seg = [/(角色|persona|你是)/i, /(指示|步驟|instruction)/i, /(脈絡|背景|context)/i,
        /(限制|約束|constraint)/i, /(輸出格式|output|格式)/i, /(範例|example|示例)/i, /(語氣|tone|風格)/i];
      var hit = seg.filter(function (r) { return r.test(c.text); }).length;
      return hit / seg.length;
    });

  K('rulesAtEnd', '關鍵規則置尾',
    '越靠近提示詞結尾的規則，權重越高。最重要的限制不要埋在中段。',
    function (c) {
      var tail = c.text.slice(Math.floor(c.text.length * 0.6));
      return /(規則|限制|務必|必須|不得|請注意|再次)/.test(tail);
    });

  K('placeholders', '抽出變數佔位符',
    '會變動的部分做成 {{變數}}，提示詞才能重複使用、才能被版本控管。',
    function (c) { return /\{\{[^}]+\}\}/.test(c.text) || /\[[A-Z_一-龥]{2,}\]/.test(c.text); });

  K('tagsPaired', '標籤成對閉合',
    '沒閉合的 XML 標籤會讓模型分不清哪裡結束，後面全部被吃進去。',
    function (c) {
      // 只算「行首」的標籤：句子中間提到 <來信> 是敘述，不是結構
      var open = c.text.match(/(^|\n)[ \t]*<[\w一-鿿][^<>\/]*>/g) || [];
      var close = c.text.match(/(^|\n)[ \t]*<\/[\w一-鿿][^<>]*>/g) || [];
      if (open.length === 0) return 1;
      return open.length === close.length ? 1 : 0;
    });

  // =====================================================================
  // 第五章 範例：Few-shot / Many-shot / 續寫
  // =====================================================================
  K('fewshot', '提供範例',
    '一個好範例勝過三段形容。示範比描述精準。',
    function (c) { return /(範例|示例|例如|例子|Example)[：:\s>]/i.test(c.text) && /(輸入|Input|問)[：:][^\n]{2,}[\s\S]{0,200}(輸出|Output|答)[：:]/i.test(c.text); });

  K('fewshotCount', '範例數量恰當',
    '3～5 個通常最好。太少學不到格式，太多會過擬合。',
    function (c) {
      var n = count(c.text, /(輸入|Input|問)\s*\d*\s*[：:]/gi);
      if (n === 0) return 0;
      if (n >= 3 && n <= 5) return 1;
      return n < 3 ? 0.5 : 0.4;
    });

  K('exampleFormat', '範例格式一致',
    '範例之間格式不一致，模型會學到「格式可以隨便」。',
    function (c) {
      var ins = count(c.text, /(^|\n)\s*輸入\s*\d*\s*[：:]/g);
      var outs = count(c.text, /(^|\n)\s*輸出\s*\d*\s*[：:]/g);
      return ins > 0 && ins === outs ? 1 : (ins > 0 ? 0.4 : 0);
    });

  K('exampleDiverse', '範例涵蓋多樣情況',
    '全部都是同一類的範例，等於只教了一種情況。要放邊界案例。',
    function (c) { return /(邊界|例外|特殊|罕見|空值|缺漏|異常)/.test(c.text); });

  K('negExample', '反例附錯誤說明',
    '光給反例沒用，要說「錯在哪」，模型才知道要避開什麼。',
    function (c) { return near(c.text, /(反例|錯誤示範|不良範例)/, /(錯在|原因|因為|問題在)/, 120); });

  K('completionPrefix', '預填回應開頭',
    '直接把答案的開頭寫給模型，它會沿著你給的格式往下寫。',
    function (c) { return /(以[^\n]{0,10}開頭|回應請以|接續|預填|回[答應]的第一[個行字])/.test(c.text) || /(^|\n)\s*(答案|輸出)\s*[：:]\s*[\{\[\|#-]/.test(c.text); });

  K('zeroShotFirst', '推理模型先零樣本',
    '推理模型給範例反而可能綁住它。先零樣本試，不夠好再加。',
    function (c) { return /(先不給範例|零樣本|zero-?shot|不提供示例)/i.test(c.text); });

  // =====================================================================
  // 第六章 角色、系統訊息與指令位階
  // =====================================================================
  K('role', '指派角色',
    '角色是行為的捷徑：一句「你是稽核員」勝過十條稽核規則。',
    function (c) { return /(你是|擔任|扮演|作為一位|身分為)[^\n。]{3,}/.test(c.text); });

  K('roleNotOver', '角色不過度綁死',
    '角色設定太細，模型會花力氣演戲而不是做事。',
    function (c) {
      var m = c.text.match(/(你是|擔任|扮演)([^\n。]{0,80})/);
      if (!m) return 1;
      return m[2].length <= 45 ? 1 : 0.4;
    });

  K('layered', '指令分層放置',
    '系統訊息放不變的規則，使用者訊息放這次的任務。混在一起就沒有位階。',
    function (c) { return /(系統(訊息|提示)|system)/i.test(c.text) && /(使用者(訊息|輸入)|user)/i.test(c.text); });

  K('hierarchy', '宣告指令位階',
    '衝突發生時誰說了算，要事先講明。',
    function (c) { return /(以[^\n]{2,14}為準|優先於|覆寫|凌駕|衝突時)/.test(c.text); });

  K('selfKnow', '告知模型自身版本',
    '模型不一定知道自己是誰。要它回答自身能力時，把版本字串給它。',
    function (c) { return /(你是|目前模型為|model[_\s]?id)[^\n]{0,20}(claude|gpt|gemini|grok|qwen|deepseek|opus|sonnet|haiku)[\w.\-]*/i.test(c.text); });

  K('devRole', '使用 developer 角色',
    '推理模型用 developer 訊息取代 system，位階語意才對得上。',
    function (c) { return /developer/i.test(c.text) && !/(^|\n)\s*system\s*[：:]/i.test(c.text); });

  K('noSystemFallback', '無系統提示時的備案',
    '有些模型不吃系統提示（如 DeepSeek-R1），全部指令要塞進使用者訊息。',
    function (c) { return /(不使用系統提示|全部(指令|規則)(都)?放在使用者訊息|置於 ?user ?訊息)/i.test(c.text); });

  // =====================================================================
  // 第七章 推理、思考控制與取樣參數
  // =====================================================================
  K('successCriteria', '給成功標準',
    '對推理模型要說「怎樣算成功」，不要規定它「怎麼想」。',
    function (c) { return /(成功(標準|條件)|完成(條件|定義)|驗收|做到以下[^\n]*才算|符合下列)/.test(c.text); });

  K('noCoT', '不對推理模型下 CoT',
    '推理模型自己會想。再叫它「一步一步想」是雜訊，甚至會拖慢它。',
    function (c) {
      // 「不要寫『一步一步思考』」這種敘述是在教人刪掉它，不該被判成犯規
      var t = c.text.replace(/(不要|避免|不需|勿|刪掉|刪除|移除|改成)[^\n]{0,10}(「|『)?[^\n]{0,6}(一步一步|逐步|step by step|思考過程)/gi, '');
      return !/(一步一步(地)?(想|思考)|step by step|請展示你的思考過程|讓我們逐步)/i.test(t);
    });

  K('stepByStep', '非推理模型要求逐步',
    '一般模型不會自己展開推理，要明講。',
    function (c) { return /(逐步|依序|按下列步驟|先[^\n]{2,}再[^\n]{2,}|步驟\s*1)/.test(c.text); });

  K('noReasonExtract', '不索取內部思考',
    '要求模型逐字複述內部推理，會直接觸發拒答。',
    function (c) { return !/(把(你的)?內部(思考|推理)(全部)?(輸出|複述|貼出)|逐字重現(你的)?思考鏈)/.test(c.text); });

  K('effortLevel', '指定思考檔位',
    'effort / reasoning_effort / thinking_level 是現在控制思考深度的正規做法。',
    function (c) {
      var v = val(c.text, '(effort|reasoning_effort|thinking_level)');
      return !!v && /(none|minimal|low|medium|high|xhigh|max)/i.test(v);
    });

  K('noDeprecated', '不用已棄用參數',
    'budget_tokens 在新版模型上會直接回 400。',
    function (c) { return !setVal(c.text, 'budget_tokens') && !/budget_tokens\s*[=:：]?\s*\d/i.test(c.text); });

  K('tempChoice', '溫度設定合理',
    '抽取、分類、程式碼要低溫；發想、文案才需要高溫。',
    function (c) {
      var v = parseFloat(val(c.text, 'temperature'));
      if (isNaN(v)) return 0;
      var creative = /(發想|創意|腦力激盪|文案|多樣)/.test(c.text);
      return creative ? (v >= 0.7 ? 1 : 0.3) : (v <= 0.3 ? 1 : 0.3);
    });

  K('singleSampler', '不同時調兩個取樣參數',
    'temperature 和 top_p 同時動，兩個效果會互相打架。',
    function (c) { return !(setVal(c.text, 'temperature') && setVal(c.text, 'top_p')); });

  K('noOverThink', '移除過度思考鷹架',
    '「再努力一點」「非常仔細地」對新模型是負向的，會讓它空轉。',
    function (c) { return !/(再努力一點|盡你最大努力|非常非常仔細|想久一點|多想幾遍)/.test(c.text); });

  K('interleaved', '工具結果後反思',
    '拿到工具回傳之後先評估再行動，比一路衝到底可靠。',
    function (c) { return /((拿到|收到|取得)(工具)?(回傳|結果)[^\n]{0,8}(先|再)[^\n]{0,10}(評估|檢視|判斷|反思)|工具(回傳|結果)後)/.test(c.text); });

  K('noGreedy', '思考模式禁用貪婪解碼',
    '思考模型在 temperature=0 下容易陷入無限重複。',
    function (c) {
      var v = parseFloat(val(c.text, 'temperature'));
      return isNaN(v) ? 0 : (v > 0 ? 1 : 0);
    });

  // =====================================================================
  // 第八章 長脈絡與資訊定位
  // =====================================================================
  K('contextTop', '長資料置頂',
    '大段資料放前面、指令放後面，是長脈絡的預設排法。',
    function (c) {
      return before(c.text,
        /(<(文件|資料|文獻|工單|條款|合約|評論|來信|素材|逐字稿|context)|【資料|參考資料)/i,
        /(<(問題|指令|任務|輸出)|【問題|你的任務|請回答|請判斷|依上述|依據上述)/i);
    });

  K('queryBottom', '提問置底',
    '模型對結尾最敏感。真正要它做的事，放最後。',
    function (c) {
      var tail = c.text.slice(Math.floor(c.text.length * 0.7));
      return /(問題|請回答|你的任務|依上述)/.test(tail);
    });

  K('repeatEnds', '首尾各放一次指令',
    'GPT-4.1 這類模型在超長脈絡下，指令重複於首尾效果最好。',
    function (c) {
      // 同一條指令要出現兩次以上：一次在開頭、一次隔了夠遠之後再講一次
      var re = /(任務|指令|再次確認|請找出|請列出)/g, m, at = [];
      while ((m = re.exec(c.text)) !== null) at.push(m.index);
      if (at.length < 2) return false;
      var L = c.text.length;
      return at[0] <= L * 0.35 && (at[at.length - 1] - at[0]) >= L * 0.35;
    });

  K('docDelim', '多文件結構化分隔',
    'XML 或管線分隔的多文件格式，實測都優於把一堆文件塞成 JSON。',
    function (c) { return /(<(doc|document|文件)[^>]*>[\s\S]*<\/(doc|document|文件)>)/i.test(c.text) || /\|\s*(來源|標題|ID)\s*\|/.test(c.text); });

  K('anchorClaims', '主張錨定章節',
    '先列大綱、再把每個結論綁回原文位置，長文才不會漂。',
    function (c) { return /(出處|來源清單|來源編號|段落序號|章節編號|錨定|標明來源|標註[^\n]{0,16}(出處|來源|章節|段落|編號))/.test(c.text); });

  K('threeStage', '三段式長文推理',
    '查詢分析 → 脈絡分析 → 綜整，是長脈絡任務的穩定骨架。',
    function (c) { return /(查詢分析|問題分析)/.test(c.text) && /(脈絡分析|資料分析)/.test(c.text) && /(綜整|整合|統合)/.test(c.text); });

  // =====================================================================
  // 第九章 接地、引用與抗幻覺
  // =====================================================================
  K('quoteFirst', '先引原文再作答',
    '強迫模型先把依據抄出來，答案就很難憑空生出來。',
    function (c) { return /(先(引用|摘錄|列出)[^\n]{0,12}(原文|句子|段落)|回答前先引)/.test(c.text); });

  K('allowIDK', '允許回答不知道',
    '不給模型「我不知道」這個選項，它就只能編一個。',
    function (c) {
      return /(不知道|無法確認|無法判斷|無法[^\n]{0,8}(找到|判斷)|資料不足|資料未載|查無|找不到|未找到|未涵蓋|未載|未記載|未提及|未揭露)[^\n]{0,24}(就|請|直接|回答|回覆|說明|標註|標明|寫|填)/.test(c.text);
    });

  K('strictGround', '嚴格限定資料來源',
    '只准用提供的脈絡作答，不准動用內部知識。',
    function (c) { return /(僅(能|可|得)?(依據|使用|根據|抽取|參考)[^\n]{0,14}(提供|上述|以下|文中|資料|條款|摘錄|第[一二三四]步)|不得使用(你的)?(內部|既有)知識)/.test(c.text); });

  K('citeFormat', '指定引用格式',
    '不指定格式，引用就會長成十種樣子，無法程式化解析。',
    function (c) { return /(引用格式|以\s*\[\d?\]|標註為\s*[［\[]|來源以[^\n]{0,10}表示)/.test(c.text); });

  K('stopCondition', '研究停止條件',
    '不給停止條件，代理會一直查下去。',
    function (c) { return /(即可停止|即停止|停止條件|停止規則|stop_rule|max_searches|最多(檢索|搜尋|查|呼叫)\s*\d+|邊際效益|無新資訊)/i.test(c.text); });

  K('crossCheck', '跨來源交叉驗證',
    '單一來源的說法就是單一來源的說法。',
    function (c) { return /(至少\s*\d+\s*個(獨立)?來源|交叉(比對|驗證)|互相佐證)/.test(c.text); });

  K('extractTemplate', '結構化抽取模板',
    '任務說明＋格式模板＋注意事項＋輸出範例，四件套能大幅壓下抽取幻覺。',
    function (c) { return /(欄位|schema|模板|格式如下)/i.test(c.text) && /(範例|示例)/.test(c.text) && /(注意|若|缺)/.test(c.text); });

  K('nullPolicy', '缺值填 null',
    '找不到就填 null，不要猜。這一句省下大量假資料。',
    function (c) {
      return /(找不到|沒有|缺漏|缺少|缺失|未提及|未揭露|未記載|未載|未涵蓋|無法[^\n]{0,6}判斷)[^\n]{0,40}(null|空值|留空|空陣列|不要猜|勿臆測|不要推測|不得推論|不要推算|不得依常識推算)/i.test(c.text);
    });

  // =====================================================================
  // 第十章 輸出格式、長度、語氣與結構化輸出
  // =====================================================================
  K('formatSpec', '直接指定輸出格式',
    '想要 JSON 就說 JSON，想要表格就說表格。別讓模型選。',
    function (c) { return /(輸出格式|回傳格式|格式[：:]|格式為|格式如下|輸出[：:]|欄位模板|輸出範例|每筆一行|以\s*(JSON|Markdown|YAML|表格|純文字|CSV)|回傳一個[^\n]{0,10}(物件|陣列|表))/i.test(c.text); });

  K('lengthLayer', '分層的長度要求',
    '對話簡短、文件完整——這兩件事要分開講，否則會互相覆蓋。',
    function (c) {
      var conv = /(對話|回覆|回應)[^\n]{0,18}(簡短|精簡|不超過|以內|\d+\s*句)/.test(c.text);
      var doc = /(文件|報告|檔案|產出)[^\n]{0,22}(完整|詳盡|\d+\s*[～~\-至]\s*\d*\s*字|\d+\s*字)/.test(c.text);
      return conv && doc;
    });

  K('preserveOnBrief', '精簡時說明保留什麼',
    '只說「精簡」，模型會砍掉你要的東西。要講清楚什麼不能砍。',
    function (c) { return near(c.text, /(精簡|簡短|縮短|壓縮)/, /(保留|不得(刪|省)|務必包含)/, 90); });

  K('toneConcrete', '語氣以具體寫作選擇描述',
    '「專業一點」是空話。「不用驚嘆號、句子在 20 字內、不用第二人稱」是可執行的。',
    function (c) {
      if (!/(語氣|風格|口吻)/.test(c.text)) return false;
      var marks = count(c.text, /(不使用|不加|避免|改用|採用|每句|每段|句子|字以內|人稱|標點|表情符號|驚嘆號|段落|口語|不對|附一句|不超過)/g);
      return marks >= 2 ? 1 : marks * 0.5;
    });

  K('mdSemantic', 'Markdown 只用在該用的地方',
    '不是每個回答都需要三層項目符號。語意上是清單才用清單。',
    function (c) { return /(僅在[^\n]{0,22}(才)?使用\s*(Markdown|清單|項目符號|標題)|不要(過度)?使用\s*(Markdown|項目符號|清單|標題)|連貫段落|散文形式|以段落(回答|論述|敘述))/i.test(c.text); });

  K('schemaDivision', 'schema 管格式、prompt 管任務',
    '把「長什麼樣」交給 schema，把「要做什麼」留在提示詞。兩邊都寫等於兩邊都亂。',
    function (c) { return /(schema|結構化輸出)/i.test(c.text) && /(格式(由|交給)[^\n]{0,10}schema|提示詞?(只)?(描述|負責)(任務|內容))/i.test(c.text); });

  K('schemaObject', 'schema 根節點為物件',
    'parameters / schema 的最外層必須是 object，不能是陣列或字串。',
    function (c) { return !/("type"\s*:\s*"array"[\s\S]{0,40}$)/.test(c.text.trim()) && (/"type"\s*:\s*"object"/.test(c.text) || !/"type"\s*:/.test(c.text)); });

  K('structuredOutputs', '用 Structured Outputs 取代 prefill',
    'prefill 已經不再支援。要鎖格式，走 Structured Outputs。',
    function (c) { return /(structured ?outputs?|結構化輸出)/i.test(c.text) && !/prefill|預填助理訊息/i.test(c.text); });

  K('boxedAnswer', '固定解析位置',
    '最終答案放在固定標記裡，下游才好抓。',
    function (c) { return /(最終答案[^\n]{0,10}(放在|以)|<answer>|\\boxed|===\s*答案)/i.test(c.text); });

  K('reground', '結尾回扣使用者語言',
    '總結要用使用者聽得懂的話，不是模型的內部術語。',
    function (c) { return /(以使用者(的)?(語言|說法)|回扣(到)?(原始)?(問題|需求)|不要使用內部術語)/.test(c.text); });

  // =====================================================================
  // 第十一章 工具使用與函式呼叫
  // =====================================================================
  K('toolDesc', '工具描述充分',
    '工具描述是影響工具使用表現的第一因素，比提示詞本身還重要。',
    function (c) {
      var purpose = /(查詢|建立|寄送|讀取|更新|刪除|取得|description|工具描述|用途)[^\n]{8,}/i.test(c.text);
      var params = /(參數|需要|欄位|格式為|回傳|_id)/.test(c.text);
      var usage = /(使用|呼叫|用於|時使用)/.test(c.text);
      return purpose && params && usage;
    });

  K('toolCount', '工具數量克制',
    '只暴露這個任務用得到的工具。工具越多，選錯的機率越高。',
    function (c) { return /(只(提供|暴露|開放)|僅載入|工具數[^\n]{0,6}(限|控制))/.test(c.text); });

  K('whenNotTool', '定義不使用工具的情境',
    '什麼時候「不要」呼叫工具，跟什麼時候要呼叫一樣重要。',
    function (c) { return /((時|情況|若|當)[^\n]{0,14}(不需要?|不要|無須|勿)[^\n]{0,8}(呼叫|使用|查)|不需(要)?(呼叫|使用)工具|直接回答|無須查詢)/.test(c.text); });

  K('toolOrder', '指定呼叫順序',
    '有依賴關係的工具，順序要寫死。',
    function (c) { return /(呼叫順序|順序為|依序呼叫|先(呼叫|使用)[^\n]{2,24}(再|然後|接著)|(^|\n)\s*1[\.、][^\n]{0,4}先)/m.test(c.text); });

  K('missingParamAsk', '缺參數要問不要猜',
    '模型猜參數是最貴的錯誤之一。',
    function (c) { return /((未提供|缺少|沒有提供|缺漏|缺(少)?(必要)?參數)[^\n]{0,24}(詢問|請問|向使用者|確認)|不(要|得)(自行)?(猜測|臆測|捏造|推測)(參數)?)/.test(c.text); });

  K('noLaterCall', '禁止宣稱稍後呼叫',
    '「我等一下會呼叫工具」是幻覺，它不會有等一下。',
    function (c) { return /(不得(宣稱|聲稱)[^\n]{0,14}(稍後|之後)|要呼叫就(現在|立即)呼叫|不要說「?我將會)/.test(c.text); });

  K('softLanguage', '避免濫用強制語',
    'MUST、CRITICAL 到處都是的時候，等於哪裡都不重要。',
    function (c) {
      var n = count(c.text, /(MUST|CRITICAL|絕對必須|一定要|嚴禁)/g);
      return n <= 2 ? 1 : Math.max(0, 1 - (n - 2) * 0.25);
    });

  K('toolResultGround', '進度宣稱要有工具結果',
    '「我已經修好了」必須建立在工具回傳上，不能建立在自信上。',
    function (c) { return /(依據(工具|指令)(回傳|輸出)|以測試結果為準|未經驗證不得宣稱)/.test(c.text); });

  // =====================================================================
  // 第十二章 代理系統
  // =====================================================================
  K('persistence', '持續性提醒',
    '講明「問題解決之前不要把控制權交回來」，代理才不會做一半就停。',
    function (c) { return /(在[^\n]{0,12}(問題|任務)[^\n]{0,6}(完全)?(解決|完成)前[^\n]{0,16}(不要|勿|不得)[^\n]{0,8}(結束|交回|停止|返回)|持續(進行|處理)直到)/.test(c.text); });

  K('planning', '規劃提醒',
    '每次行動前先規劃、行動後先反思。',
    function (c) { return /((呼叫|行動|執行|動手)[^\n]{0,6}前[^\n]{0,14}(規劃|計畫|寫下|列出)|先(規劃|列出計畫|寫下計畫)再(執行|動手|呼叫))/.test(c.text); });

  K('autonomy', '界定自主範圍',
    '哪些事可以自己做、哪些要先問，要事先劃線。',
    function (c) { return /(可自行[^\n]{2,}|需(先)?(取得)?(核准|同意|確認)|不需詢問即可)/.test(c.text); });

  K('reversibility', '不可逆動作需核准',
    '可逆的放手做，不可逆的一律先問。這條線比「重要性」好用。',
    function (c) { return /(不可逆|無法復原|刪除|付款|退款|寄送|發布)[^\n]{0,20}(先|須|需|務必)[^\n]{0,12}(確認|核准|詢問|同意|核可|授權)/.test(c.text); });

  K('antiScope', '抑制範圍蔓延',
    '代理最愛順手重構。明講「只做被要求的事」。',
    function (c) { return /(只(處理|修改|做)[^\n]{2,}|不要(順手|額外|一併)(重構|優化|修改)|超出範圍[^\n]{0,10}(先問|不做))/.test(c.text); });

  K('outcomeFirst', '描述終點而非路徑',
    '對代理講「做到什麼樣算完成」，不要規定每一步怎麼走。',
    function (c) { return /(完成條件|驗收條件|成功標準|完成(時|後)[^\n]{0,10}(應|會|狀態)|最終狀態|做到以下即視為完成)/.test(c.text); });

  K('memoryFile', '常駐指令寫成檔案',
    '每次都要講的規則，寫進 AGENTS.md，短而具體優於長篇大論。',
    function (c) { return /(AGENTS\.md|CLAUDE\.md|常駐指令|規則檔)/i.test(c.text); });

  K('subagent', '子代理分工',
    '需要大量獨立搜尋時派子代理；需要連貫上下文時自己做。',
    function (c) { return /(子(代理|agent)|分派給[^\n]{0,10}(代理|agent)|平行(展開|搜尋))/i.test(c.text); });

  // =====================================================================
  // 第十三～十七章 迭代、效率、安全、遷移
  // =====================================================================
  K('noSelfCheck', '刪掉自我檢查請求',
    '「檢查一遍再回答」在新模型上是舊時代的補丁，該刪。',
    function (c) { return !/(請(再)?檢查(一遍|一次)|自我(檢查|驗證)後再|確認無誤後再回答)/.test(c.text); });

  K('verifyTool', '給驗證工具而非叫它自省',
    '要它驗證，就給它可以跑的東西。',
    function (c) { return /(執行(測試|指令|腳本)|以\s*[a-z\-\s]{3,}\s*驗證|跑一次[^\n]{0,10}(測試|檢查))/i.test(c.text); });

  K('rubricFirst', '先建評分準則再自評',
    '讓模型先寫出評分表，再拿評分表評自己，比直接問「好不好」可靠。',
    function (c) { return /(先(建立|列出|定義)[^\n]{0,10}(評分|評估)(準則|標準|表)|依據(上述)?評分表)/.test(c.text); });

  K('noContradiction', '無矛盾指令',
    '同時要求「詳盡」和「50 字以內」，模型只能挑一邊。',
    function (c) {
      var wantShort = /(精簡|簡短|不超過\s*\d+|以內)/.test(c.text);
      var wantLong = /(詳盡|完整說明|鉅細靡遺|越詳細越好)/.test(c.text);
      return !(wantShort && wantLong);
    });

  K('lean', '提示詞精簡優先',
    '更長不等於更好。多數失敗的提示詞是太長，不是太短。',
    function (c) {
      var L = c.text.replace(/\s/g, '').length;
      if (L === 0) return 0;
      if (L <= 700) return 1;
      if (L <= 1100) return 0.6;
      return 0.3;
    });

  K('cachePrefix', '靜態前置、變動置尾',
    '快取只認完全相同的前綴。把會變的東西往後放，才吃得到快取。',
    function (c) { return before(c.text, /(固定|靜態|不變|系統規則|共用)/, /(本次|這次|使用者(輸入|問題)|變動)/); });

  K('appendOnly', '快取內容只增不改',
    '中途改動前綴，前面的快取全部作廢。',
    function (c) { return /(只(新增|附加)不修改|append[- ]?only|不得改動前綴)/i.test(c.text); });

  K('compaction', '長迴圈脈絡壓縮',
    '長代理迴圈要定期把歷史壓成摘要，否則會被自己的紀錄淹死。',
    function (c) { return /(壓縮|摘要化|compact|裁剪(過期|舊)|以摘要取代)/i.test(c.text); });

  K('injectionGuard', '防提示注入邊界',
    '外部內容一律當資料，不當指令。這是唯一可靠的心法。',
    function (c) {
      return /((指示|指令|內容)[^\n]{0,14}(視為|當作|均為|一律是)[^\n]{0,6}資料)/.test(c.text)
        || /((指示|指令)[^\n]{0,12}(不得|不可|不要)[^\n]{0,4}(執行|遵循))/.test(c.text)
        || /(不得(執行|遵循)[^\n]{0,16}(指示|指令))/.test(c.text);
    });

  K('leastPrivilege', '最小權限',
    '代理只拿到它完成這件事需要的權限，不多不少。',
    function (c) { return /(最小權限|唯讀|僅授予|不授予[^\n]{0,10}權限)/.test(c.text); });

  K('humanReview', '人在迴圈中',
    '高風險動作保留人工複核點。',
    function (c) { return /(人工(複核|審查|確認)|human[- ]in[- ]the[- ]loop|需人員核可)/i.test(c.text); });

  K('migrationSimplify', '升級後簡化提示詞',
    '換到更強的模型，第一件事是刪掉為了舊模型打的補丁。',
    function (c) { return /(刪除[^\n]{0,14}(補丁|繞道|hack|舊)|升級後[^\n]{0,10}簡化|移除(舊有)?(鷹架|提示補丁))/i.test(c.text); });

  K('modelFirst', '先換模型再動提示詞',
    '一次只改一個變因。先只換模型，量完基準再調提示詞。',
    function (c) { return /(先(只)?更換模型|不要同時(修改|調整)|保持提示詞不變)/.test(c.text); });

  K('abTest', '有對照的迭代',
    '沒有基準線的「感覺變好了」不是結論。',
    function (c) { return /(對照組|基準線|baseline|A\/?B|同一組(測試|樣本))/i.test(c.text); });

  // =====================================================================
  // 題板共用：選擇正確度（由各題板算出 0~1 交給引擎）
  // =====================================================================
  K('picks', '選擇正確',
    '這一關的每個選項都對應一個真實的取捨。選錯不會失敗，但會扣在這一條上。',
    function (c) { return c.board.pickAccuracy == null ? 1 : c.board.pickAccuracy; });

  // =====================================================================
  // 通用防呆（反刷分）
  // =====================================================================
  K('antiEmpty', '有實質內容',
    '空白或極短的回應無法評分。',
    function (c) { return c.text.replace(/\s/g, '').length >= 24; });

  K('antiSoup', '非關鍵字堆砌',
    '把技法名詞排一排不算會用。每個技法要落在句子裡。',
    function (c) {
      var t = c.text.replace(/\s/g, '');
      if (t.length < 24) return 0;
      var clauses = c.text.split(/[。，、；;\n|]/).filter(function (s) { return s.replace(/\s/g, '').length >= 4; });
      if (clauses.length < 3) return 0.35;
      var uniq = {}, n = 0;
      for (var i = 0; i < t.length; i++) { if (!uniq[t[i]]) { uniq[t[i]] = 1; n++; } }
      var ratio = n / t.length;
      return ratio >= 0.24 ? 1 : Math.max(0, ratio / 0.24);
    });

  // =====================================================================
  // 評分器
  // =====================================================================

  var GRADES = [
    { g: 'S', min: 95, label: '無瑕' },
    { g: 'A', min: 85, label: '通透' },
    { g: 'B', min: 70, label: '成形' },
    { g: 'C', min: 50, label: '粗胚' }
  ];

  function gradeOf(score) {
    for (var i = 0; i < GRADES.length; i++) if (score >= GRADES[i].min) return GRADES[i];
    return { g: '—', min: 0, label: '未成' };
  }

  /**
   * 評分。
   * @param {string} text  組裝後的提示詞文本（所有題型都會化約成這個）
   * @param {Array}  rubric [{ id, weight }]
   * @param {object} board  題型附加資訊（picks / order / values …）
   */
  function score(text, rubric, board) {
    var ctx = {
      text: text || '',
      lines: (text || '').split('\n'),
      board: board || {}
    };

    var rows = [], total = 0, got = 0;
    rubric.forEach(function (r) {
      var def = CHECKS[r.id];
      if (!def) { return; }
      var w = r.weight == null ? 1 : r.weight;
      var raw = def.test(ctx);
      var v = raw === true ? 1 : (raw === false ? 0 : Math.max(0, Math.min(1, Number(raw) || 0)));
      total += w; got += w * v;
      rows.push({ id: r.id, label: def.label, why: def.why, value: v, weight: w });
    });

    // 反刷分：兩條防呆一律參與，且為乘性懲罰
    var guard = 1;
    ['antiEmpty', 'antiSoup'].forEach(function (id) {
      var raw = CHECKS[id].test(ctx);
      var v = raw === true ? 1 : (raw === false ? 0 : Number(raw));
      guard *= (0.15 + 0.85 * v);
      rows.push({ id: id, label: CHECKS[id].label, why: CHECKS[id].why, value: v, weight: 0, guard: true });
    });

    // 選擇正確度同時是一個乘數。填格與刪修題的骨架本身就帶著段落標籤，
    // 光靠結構檢核會讓「全填錯」也拿到及格分——這個乘數把它壓下去。
    var pickMul = 1;
    if (ctx.board.pickAccuracy != null) {
      pickMul = 0.35 + 0.65 * Math.max(0, Math.min(1, ctx.board.pickAccuracy));
    }

    var pct = total > 0 ? (got / total) * 100 : 0;
    pct = Math.round(pct * guard * pickMul);

    return { score: pct, grade: gradeOf(pct), rows: rows };
  }

  P.CHECKS = CHECKS;
  P.score = score;
  P.gradeOf = gradeOf;
  P.checkCount = Object.keys(CHECKS).length;
})(window.TICI = window.TICI || {});
