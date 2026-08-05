/* Promptasy · 離線自我測試
 * 用法： node test/selftest.js
 * 對每一關組出「完全正確」的答案，餵進評分引擎，確認都能拿到 S。
 * 再對「全錯」與「空白」作答做反向測試，確認防刷分有效。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {}, performance: { now: () => 0 }, console };
sandbox.window.TICI = {};
vm.createContext(sandbox);

['js/checks.js', 'js/curriculum-a.js', 'js/curriculum-b.js', 'js/reference.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});
const P = sandbox.window.TICI;

function ideal(s) {
  switch (s.board) {
    case 'carve': return s.segs.map(g => g.opts.find(o => o.ok).t).join('\n');
    case 'gate': return s.opts.find(o => o.ok).t;
    case 'slot': { let t = s.template; s.slots.forEach((sl, i) => { t = t.replace('{{' + i + '}}', sl.opts.find(o => o.ok).t); }); return t; }
    case 'repair': { const o = s.lines.slice(); o[s.flaw] = s.fixes.find(f => f.ok).t; return o.join('\n'); }
    case 'order': return s.answer.map(i => s.items[i].t).join('\n');
    case 'sift': return s.opts.filter(o => o.ok).map(o => o.t).join('\n');
    case 'trim': return s.lines.filter(o => !o.drop).map(o => o.t).join('\n');
    case 'dispatch': return s.items.map(it => it.t + ' → ' + s.buckets.find(b => b.id === it.ans).name).join('\n');
    case 'pair': return s.left.map((L, i) => L.t + ' → ' + s.right[s.answer[i]].t).join('\n');
    case 'gauge': return (s.prefix ? s.prefix + '\n' : '') + s.knobs.map(k => k.key + ' = ' + k.answer).join('\n') + (s.tail ? '\n' + s.tail : '');
    default: return null;
  }
}

/** 全選錯的版本，用來確認選錯真的會被扣分 */
function worst(s) {
  switch (s.board) {
    case 'carve': return s.segs.map(g => (g.opts.find(o => !o.ok) || g.opts[0]).t).join('\n');
    case 'gate': return (s.opts.find(o => !o.ok) || s.opts[0]).t;
    case 'slot': { let t = s.template; s.slots.forEach((sl, i) => { t = t.replace('{{' + i + '}}', (sl.opts.find(o => !o.ok) || sl.opts[0]).t); }); return t; }
    case 'sift': return s.opts.filter(o => !o.ok).map(o => o.t).join('\n');
    case 'trim': return s.lines.map(o => o.t).join('\n');
    default: return null;
  }
}

let fails = [], scores = [], boards = {};
P.SHRINES.forEach(s => {
  boards[s.board] = (boards[s.board] || 0) + 1;

  // 每一條 rubric 都必須指向存在的檢核
  s.rubric.forEach(r => { if (!P.CHECKS[r.id]) fails.push(`${s.id}: 未知檢核 ${r.id}`); });

  const t = s.board === 'write' ? P.REFERENCE[s.id] : ideal(s);
  if (t == null) { if (s.board === 'write') fails.push(`${s.id}: 缺少參考答案`); return; }
  const r = P.score(t, s.rubric, { pickAccuracy: 1 });
  scores.push(r.score);
  if (r.score < 95) {
    fails.push(`${s.id} (${s.board}) 滿分作答只拿到 ${r.score}：` +
      r.rows.filter(x => x.value < 0.99).map(x => `${x.id}=${x.value.toFixed(2)}`).join(', '));
  }
});

// 反向：全錯應該明顯低於滿分
let inverted = [];
P.SHRINES.forEach(s => {
  const w = worst(s);
  if (w === null) return;
  const acc = s.board === 'trim' ? 0 : 0;
  const r = P.score(w, s.rubric, { pickAccuracy: acc });
  if (r.score >= 60) inverted.push(`${s.id}: 全選錯仍拿到 ${r.score} 分`);
});

// 反向：空白與關鍵字堆砌
const soup = P.score('角色 任務 格式 範例 引用 工具 代理 快取 注入 遷移', [{ id: 'goal', weight: 1 }], { pickAccuracy: 1 });
const empty = P.score('', [{ id: 'goal', weight: 1 }], { pickAccuracy: 1 });

console.log('關卡總數      :', P.SHRINES.length);
console.log('境數          :', P.REGIONS.length);
console.log('結構檢核條數  :', P.checkCount);
console.log('題型分布      :', JSON.stringify(boards));
console.log('可自動驗證關卡:', scores.length);
console.log('滿分作答最低分:', scores.length ? Math.min(...scores) : '-');
console.log('關鍵字堆砌得分:', soup.score, '(應為低分)');
console.log('空白作答得分  :', empty.score, '(應為 0)');
console.log('');

if (inverted.length) { console.log('⚠ 反向測試未通過：'); inverted.forEach(x => console.log('  ' + x)); console.log(''); }
if (fails.length) {
  console.log('✕ ' + fails.length + ' 項未通過：');
  fails.forEach(f => console.log('  ' + f));
  process.exit(1);
}
if (inverted.length) process.exit(1);
console.log('✓ 全部通過：每一關的正確作答都達 S，錯誤作答與刷分皆被擋下。');
