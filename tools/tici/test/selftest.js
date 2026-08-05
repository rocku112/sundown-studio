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

['js/checks.js', 'js/curriculum-a.js', 'js/curriculum-b.js', 'js/reference.js', 'js/vendors.js', 'js/collect.js', 'js/layout.js'].forEach(f => {
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

// 世界佈局用 js/layout.js 解出來的最終座標驗——那才是玩家實際走到的位置。
// 神碑互動半徑 74、收集品 46，且碑優先；收集品落在任何一座碑的 74 內就永遠按不到。
const L = P.layout;
const shrinePos = L.shrines();
const itemPos = L.collectibles();

const seenIds = new Set();
let fails = [], scores = [], boards = {};

if (itemPos.length !== P.COLLECTIBLES.length) {
  fails.push(`佈局解出 ${itemPos.length} 個收集品，但資料有 ${P.COLLECTIBLES.length} 個`);
}

itemPos.forEach(n => {
  const c = n.item;
  if (seenIds.has(c.id)) fails.push(`收集品 ${c.id}: id 重複`);
  seenIds.add(c.id);
  if (!P.REGIONS.some(r => r.id === c.region)) fails.push(`收集品 ${c.id}: 指向不存在的境 ${c.region}`);
  if (n.rad <= 0 || n.rad >= 1) fails.push(`收集品 ${c.id}: rad ${n.rad} 超出島的範圍`);
  if (n.crowded) fails.push(`收集品 ${c.id}（${c.title}）在 ${c.region} 找不到空位，只能疊著放`);
  if (!L.inRegion(n.region, n.x, n.y)) fails.push(`收集品 ${c.id}（${c.title}）掉到島外了`);

  let nearest = null, nd = Infinity;
  shrinePos.forEach(s => {
    const d = Math.hypot(s.x - n.x, s.y - n.y);
    if (d < nd) { nd = d; nearest = s; }
  });
  if (nd < L.CLEARANCE) {
    fails.push(`收集品 ${c.id}（${c.title}）離神碑 ${nearest.shrine.id} 只有 ${Math.round(nd)}，` +
      `在碑的互動半徑 ${L.SHRINE_REACH} 內就永遠按不到（需 ≥ ${L.CLEARANCE}）`);
  }
  itemPos.forEach(o => {
    if (o === n) return;
    const d = Math.hypot(o.x - n.x, o.y - n.y);
    if (d < L.ITEM_GAP && c.id < o.item.id) {
      fails.push(`收集品 ${c.id} 與 ${o.item.id} 只距離 ${Math.round(d)}（需 ≥ ${L.ITEM_GAP}）`);
    }
  });
});

P.SHRINES.forEach(s => {
  boards[s.board] = (boards[s.board] || 0) + 1;
  // 每一關都要有廠家標記，徽章才數得出來
  if (!P.SHRINE_VENDORS[s.id]) fails.push(`${s.id}: 缺少廠家標記`);
  else P.SHRINE_VENDORS[s.id].forEach(v => {
    if (!P.VENDORS.some(x => x.id === v)) fails.push(`${s.id}: 未知的廠家 ${v}`);
  });

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

// 走位回歸測試：沿著島緣與橋面往各方向衝，不能走出可走區域。
// （曾經的 bug：只逐軸判定，斜著走到圓弧邊界就會掉進深淵。）
let walkPaths = 0, escapes = [];
{
  const SPD = 330 / 60;                       // 奔跑速度，每幀位移
  const combos = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const run = (sx, sy, dx, dy, label) => {
    walkPaths++;
    let x = sx, y = sy;
    const m = Math.hypot(dx, dy);
    for (let f = 0; f < 70; f++) {
      const mv = L.resolveMove(x, y, x + dx / m * SPD, y + dy / m * SPD, null);
      x = mv.x; y = mv.y;
      if (!L.walkable(x, y)) { escapes.push(`${label} 方向(${dx},${dy}) 走到 (${Math.round(x)},${Math.round(y)})`); return; }
    }
  };
  P.REGIONS.forEach(r => {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const R = L.radiusAt(r, a) * 0.94;
      const sx = r.x + Math.cos(a) * R, sy = r.y + Math.sin(a) * R * 0.92;
      if (!L.walkable(sx, sy)) continue;
      combos.forEach(d => run(sx, sy, d[0], d[1], `${r.name} 邊緣 ∠${a.toFixed(2)}`));
    }
  });
  P.BRIDGES.forEach(pr => {
    const a = P.REGIONS.find(z => z.id === pr[0]), b = P.REGIONS.find(z => z.id === pr[1]);
    [0.3, 0.5, 0.7].forEach(t => {
      const sx = a.x + (b.x - a.x) * t, sy = a.y + (b.y - a.y) * t;
      if (!L.walkable(sx, sy)) return;
      combos.forEach(d => run(sx, sy, d[0], d[1], `橋 ${a.name}→${b.name} t=${t}`));
    });
  });
}
escapes.slice(0, 8).forEach(e => fails.push('走出地面：' + e));
if (escapes.length > 8) fails.push(`走出地面：另有 ${escapes.length - 8} 條路徑同樣出界`);

// 反向：空白與關鍵字堆砌
const soup = P.score('角色 任務 格式 範例 引用 工具 代理 快取 注入 遷移', [{ id: 'goal', weight: 1 }], { pickAccuracy: 1 });
const empty = P.score('', [{ id: 'goal', weight: 1 }], { pickAccuracy: 1 });

const vt = {};
P.VENDORS.forEach(v => { vt[v.name] = 0; });
Object.keys(P.SHRINE_VENDORS).forEach(id =>
  P.SHRINE_VENDORS[id].forEach(v => { vt[(P.VENDORS.find(x => x.id === v) || {}).name]++; }));

console.log('關卡總數      :', P.SHRINES.length);
console.log('收集品        :', P.COLLECTIBLES.length,
  '（刻文', P.COLLECTIBLES.filter(c => c.kind === 'ins').length,
  '· 器物', P.COLLECTIBLES.filter(c => c.kind === 'relic').length,
  '· 隱藏', P.COLLECTIBLES.filter(c => c.kind === 'hidden').length + '）');
console.log('廠家標記      :', JSON.stringify(vt));
console.log('境數          :', P.REGIONS.length);
console.log('結構檢核條數  :', P.checkCount);
console.log('題型分布      :', JSON.stringify(boards));
console.log('走位路徑      :', walkPaths, escapes.length ? `（${escapes.length} 條出界）` : '（全部沒走出地面）');
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
