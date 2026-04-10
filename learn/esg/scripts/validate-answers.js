// validate-answers.js
// 驗證題庫 a (正解 index) 是否與 x (解析) 一致
// 用法： node validate-answers.js [ch1|ch2|ch3|ch4|all]
// 不會修改任何檔案，只輸出報告到 stdout 和 validate-report.md

const fs = require('fs');
const path = require('path');

const CHAPTERS = {
  ch1: path.resolve(__dirname, '../textbookq/ch1.js'),
  ch2: path.resolve(__dirname, '../textbookq/ch2.js'),
  ch3: path.resolve(__dirname, '../textbookq/ch3.js'),
  ch4: path.resolve(__dirname, '../textbookq/ch4.js'),
};

// ────────────────────────────────────────────────
// 載入題庫（檔案是 const TEXTBOOKQ_DATA = [...] 形式）
// ────────────────────────────────────────────────
function loadQuestions(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fn = new Function(
    content +
    '\nreturn typeof TEXTBOOKQ_DATA !== "undefined" ? TEXTBOOKQ_DATA : null;'
  );
  return fn();
}

// ────────────────────────────────────────────────
// 「不包含/何者非」型題目偵測
// ────────────────────────────────────────────────
const NEGATIVE_PATTERNS = [
  /不包含/, /不正確/, /不屬於/, /不是/, /不在/, /未包含/, /未列入/,
  /何者非/, /何者錯誤/, /何者不/, /錯誤的是/, /錯誤的為/, /非屬/,
  /下列何者不/, /下列何者非/, /以下何者不/, /以下何者非/,
];

function isNegativeQuestion(stem) {
  return NEGATIVE_PATTERNS.some((p) => p.test(stem));
}

// ────────────────────────────────────────────────
// 評分：解析中對某選項的支持度 (0-100)
// ────────────────────────────────────────────────
function scoreOption(optionText, explanation) {
  if (!explanation || !optionText) return 0;
  const opt = optionText.trim();
  if (opt.length === 0) return 0;

  // 完整子字串命中
  if (explanation.includes(opt)) return 100;

  // 拆 chunks（中文常用分隔符）
  const chunks = opt
    .split(/[、,，。\s\(\)（）「」『』:：；;\/]+/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 2);

  if (chunks.length === 0) {
    // 太短的選項（如「是」「否」「以上皆是」），不可靠
    return 0;
  }

  let matches = 0;
  for (const chunk of chunks) {
    if (explanation.includes(chunk)) matches++;
  }
  return Math.round((matches / chunks.length) * 90);
}

// ────────────────────────────────────────────────
// 驗證單題
// ────────────────────────────────────────────────
function validateQuestion(q, idx) {
  const result = {
    num: idx + 1,
    stem: (q.s || '').slice(0, 60),
    fullStem: q.s,
    currentA: q.a,
    options: q.o,
    explanation: q.x,
    negative: isNegativeQuestion(q.s || ''),
    suggestedA: null,
    scores: [],
    category: 'OK',
    reason: '',
  };

  // 解析空白
  if (!q.x || q.x.trim().length < 8) {
    result.category = 'NO_EXPLANATION';
    result.reason = '解析欄位空白或過短，無法驗證';
    return result;
  }

  // 計算每個選項分數
  const scored = q.o.map((opt, i) => ({ i, opt, score: scoreOption(opt, q.x) }));
  result.scores = scored;

  const sortedDesc = [...scored].sort((a, b) => b.score - a.score);
  const sortedAsc = [...scored].sort((a, b) => a.score - b.score);

  // 「以上皆是」/「以上皆非」特殊處理
  const lastOpt = q.o[q.o.length - 1] || '';
  const isAllAbove = /以上皆是|以上皆對|以上皆正確|皆是/.test(lastOpt);
  const isNoneAbove = /以上皆非|以上皆不|皆非/.test(lastOpt);

  if (isAllAbove) {
    // 如果解析中其他選項都被提到 → 答案應為「以上皆是」
    const otherScores = scored.slice(0, -1).map((s) => s.score);
    const allMentioned = otherScores.every((s) => s >= 50);
    if (allMentioned) {
      result.suggestedA = q.o.length - 1;
      result.category = result.suggestedA === q.currentA ? 'OK' : 'HIGH_MISMATCH';
      result.reason = '解析提及所有前項 → 應為「以上皆是」';
      return result;
    }
  }

  // 一般判斷
  let suggested;
  if (result.negative) {
    // 「不包含/何者非」：答案 = 解析中最少被提到的選項
    suggested = sortedAsc[0];
    // 健康度檢查：其他選項應該都被解析提到
    const otherMin = sortedAsc[1]?.score ?? 0;
    if (otherMin < 30) {
      result.category = 'LOW_CONFIDENCE';
      result.reason = '反向題，但解析未充分列出其他選項，無法可靠反推';
      result.suggestedA = suggested.i;
      return result;
    }
  } else {
    // 正向題：答案 = 解析中最強支持的選項
    suggested = sortedDesc[0];
    if (suggested.score < 40) {
      result.category = 'LOW_CONFIDENCE';
      result.reason = '解析未明確指向任何選項';
      result.suggestedA = suggested.i;
      return result;
    }
    if (sortedDesc[0].score - sortedDesc[1].score < 25) {
      result.category = 'LOW_CONFIDENCE';
      result.reason = '解析中多個選項分數接近，無法判斷';
      result.suggestedA = suggested.i;
      return result;
    }
  }

  result.suggestedA = suggested.i;
  if (suggested.i !== q.currentA) {
    result.category = 'HIGH_MISMATCH';
    result.reason = result.negative
      ? `反向題：解析未提及選項 ${suggested.i + 1}，故為正解`
      : `解析強烈支持選項 ${suggested.i + 1}`;
  }

  return result;
}

// ────────────────────────────────────────────────
// 報告生成
// ────────────────────────────────────────────────
function formatScores(scores) {
  return scores.map((s) => `[${s.i + 1}]${s.score}`).join(' ');
}

function generateReport(chapterName, results) {
  const high = results.filter((r) => r.category === 'HIGH_MISMATCH');
  const low = results.filter((r) => r.category === 'LOW_CONFIDENCE');
  const noExp = results.filter((r) => r.category === 'NO_EXPLANATION');
  const ok = results.filter((r) => r.category === 'OK');

  const lines = [];
  lines.push(`# ${chapterName} 驗證報告`);
  lines.push('');
  lines.push(`- 總題數：${results.length}`);
  lines.push(`- 🔴 HIGH_MISMATCH（解析強烈不一致）：${high.length}`);
  lines.push(`- 🟡 LOW_CONFIDENCE（解析模糊，需手動驗）：${low.length}`);
  lines.push(`- ⚪ NO_EXPLANATION（解析空白）：${noExp.length}`);
  lines.push(`- 🟢 OK：${ok.length}`);
  lines.push('');

  const renderItem = (r) => {
    const cur = r.currentA + 1;
    const sug = r.suggestedA != null ? r.suggestedA + 1 : '?';
    const tag = r.negative ? '[反向題]' : '[正向題]';
    return [
      `### Q${r.num} ${tag} 現有 a:${cur} → 建議 a:${sug}`,
      `**題幹**：${r.stem}${r.fullStem.length > 60 ? '…' : ''}`,
      `**選項**：`,
      ...r.options.map((o, i) => `  ${i + 1}. ${o}`),
      `**解析**：${(r.explanation || '').slice(0, 200)}`,
      `**分數**：${formatScores(r.scores)}`,
      `**原因**：${r.reason}`,
      '',
    ].join('\n');
  };

  if (high.length) {
    lines.push('## 🔴 HIGH_MISMATCH（優先處理）');
    lines.push('');
    high.forEach((r) => lines.push(renderItem(r)));
  }
  if (low.length) {
    lines.push('## 🟡 LOW_CONFIDENCE（解析本身可能有問題，請翻書手動驗）');
    lines.push('');
    low.forEach((r) => lines.push(renderItem(r)));
  }
  if (noExp.length) {
    lines.push('## ⚪ NO_EXPLANATION');
    lines.push('');
    noExp.forEach((r) => lines.push(renderItem(r)));
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────────
// 主程式
// ────────────────────────────────────────────────
function runChapter(name) {
  const filePath = CHAPTERS[name];
  const data = loadQuestions(filePath);
  if (!data) {
    console.error(`無法載入 ${name}：${filePath}`);
    return null;
  }
  const results = data.map((q, i) => validateQuestion(q, i));
  return { name, results };
}

function main() {
  const arg = process.argv[2] || 'all';
  const chapters = arg === 'all' ? Object.keys(CHAPTERS) : [arg];

  const allReports = [];
  let totals = { high: 0, low: 0, noExp: 0, ok: 0, total: 0 };

  for (const ch of chapters) {
    if (!CHAPTERS[ch]) {
      console.error(`未知章節：${ch}`);
      continue;
    }
    const { results } = runChapter(ch);
    const report = generateReport(ch, results);
    allReports.push(report);

    totals.total += results.length;
    totals.high += results.filter((r) => r.category === 'HIGH_MISMATCH').length;
    totals.low += results.filter((r) => r.category === 'LOW_CONFIDENCE').length;
    totals.noExp += results.filter((r) => r.category === 'NO_EXPLANATION').length;
    totals.ok += results.filter((r) => r.category === 'OK').length;
  }

  const summary = [
    '# 總結',
    '',
    `- 總題數：${totals.total}`,
    `- 🔴 HIGH_MISMATCH：${totals.high}`,
    `- 🟡 LOW_CONFIDENCE：${totals.low}`,
    `- ⚪ NO_EXPLANATION：${totals.noExp}`,
    `- 🟢 OK：${totals.ok}`,
    '',
  ].join('\n');

  const fullReport = summary + '\n' + allReports.join('\n\n');
  const outPath = path.resolve(__dirname, 'validate-report.md');
  fs.writeFileSync(outPath, fullReport, 'utf8');

  console.log(summary);
  console.log(`完整報告已寫入：${outPath}`);
}

main();
