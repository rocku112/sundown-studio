/* Promptasy · 主控：四幕挑戰、圖鑑、序章、設定、成果卡 */
(function (P) {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var paused = false, curNode = null, curItem = null, curBoard = null, curResult = null, curHow = null, act = 0;

  // ===================================================================
  // HUD
  // ===================================================================
  function refreshHud() {
    var lv = P.progress.level(), r = P.progress.rank();
    $('#hud-rank').textContent = r.name;
    $('#hud-lv').textContent = 'Lv.' + lv.lv;
    $('#hud-xp').textContent = lv.into + ' / ' + lv.need + ' XP';
    var total = P.SHRINES.length, done = P.save.doneCount();
    $('#hud-progress').textContent = done + ' / ' + total + ' 碑';
    var seals = P.progress.masteredRegions();
    $('#hud-seals').textContent = '印 ' + seals + ' / ' + P.REGIONS.length;
    $('#hud-bar-fill').style.width = Math.max(2, Math.round(lv.into / lv.need * 100)) + '%';
    if (r.next) {
      var m = r.missing, want = [];
      if (m.lv) want.push('Lv.' + r.next.lv);
      if (m.got) want.push('收集 ' + r.next.got + ' 條');
      if (m.mastered) want.push('精通 ' + r.next.mastered + ' 片土地');
      $('#hud-bar').title = '下一個稱號「' + r.next.name + '」：' + (want.length ? '需要 ' + want.join(' · ') : '已達成，再刻一塊碑就生效');
    } else {
      $('#hud-bar').title = '已達最高稱號';
    }
  }

  // ===================================================================
  // 提示條（靠近神碑時）
  // ===================================================================
  var lastRegionTrack = -1;
  function refreshPrompt() {
    var t = nearestTarget();
    var n = t && t.kind === 'shrine' ? t.node : null;
    var bar = $('#interact');
    var blocked = P.world.blockedInfo();
    if (blocked) {
      bar.classList.add('show', 'warn');
      bar.textContent = '「' + blocked.name + '」的門扉尚未認得你 —— 需要 ' + blocked.need + ' 塊碑文，目前 ' + P.save.doneCount() + ' 塊';
      curNode = null;
      return;
    }
    bar.classList.remove('warn');

    curItem = t && t.kind === 'item' ? t.node : null;
    if (curItem) {
      curNode = null;
      var c = curItem.item, got = P.progress.found(c.id);
      bar.classList.add('show');
      bar.innerHTML = '';
      bar.appendChild(el('kbd', null, 'E'));
      bar.appendChild(document.createTextNode(' ' + (got ? '再看一次 · ' : '看看 · ') + c.title + '　'));
      bar.appendChild(el('span', 'skill-tag', P.COLLECT_KINDS[c.kind].name));
      if (got) bar.appendChild(el('span', 'grade-chip gA', '✓'));
      return;
    }

    if (n) {
      curNode = n;
      var st = P.save.state.done[n.shrine.id];
      bar.classList.add('show');
      bar.innerHTML = '';
      bar.appendChild(el('kbd', null, 'E'));
      bar.appendChild(document.createTextNode(' ' + (n.shrine.trial ? '應戰 · ' : '叩碑 · ') + n.shrine.name + '　'));
      bar.appendChild(el('span', 'skill-tag', n.shrine.skill));
      if (st) bar.appendChild(el('span', 'grade-chip g' + st.grade, st.grade));
    } else {
      curNode = null;
      bar.classList.remove('show');
    }

    // 進入不同境時換曲
    var r = P.world.regionOf(P.world.player.x, P.world.player.y);
    if (r) {
      var idx = P.REGIONS.indexOf(r);
      if (idx !== lastRegionTrack) { lastRegionTrack = idx; P.audio.playTrack(idx); }
    }
  }

  // ===================================================================
  // 羅盤 · 導航 · 效能監視器
  // ===================================================================
  var COMPASS = [['北', 0], ['東北', 45], ['東', 90], ['東南', 135], ['南', 180], ['西南', 225], ['西', 270], ['西北', 315]];

  function refreshNav() {
    var nav = P.world.navInfo ? P.world.navInfo() : null;
    if (!nav) return;

    // 羅盤刻度：以 90° 視野把方位平移到帶狀條上
    var strip = $('#compass-strip');
    strip.innerHTML = '';
    COMPASS.forEach(function (c) {
      var delta = ((c[1] - nav.heading + 540) % 360) - 180;
      if (Math.abs(delta) > 62) return;
      var tick = el('span', 'ctick' + (c[0].length === 1 ? ' major' : ''), c[0]);
      tick.style.left = (50 + delta / 62 * 50) + '%';
      tick.style.opacity = String(1 - Math.abs(delta) / 78);
      strip.appendChild(tick);
    });

    var wn = $('#wp-name'), wd = $('#wp-dist');
    if (!nav.name) { wn.textContent = '這片天地已經走完'; wd.textContent = ''; }
    else if (nav.locked) { wn.textContent = nav.name; wd.textContent = '需 ' + nav.need + ' 塊碑文'; }
    else { wn.textContent = nav.name; wd.textContent = '約 ' + nav.steps + ' 步'; }
  }

  function refreshPerf() {
    var box = $('#perf');
    if (box.hidden || !P.world.stats) return;
    var s = P.world.stats();
    box.textContent = s.fps + ' FPS　繪製 ' + s.calls + '　三角形 ' +
      (s.tris > 9999 ? Math.round(s.tris / 1000) + 'k' : s.tris) + '　畫質 ' +
      (s.quality === 'high' ? '高' : '低') + '\n' + s.gpu;
  }

  function togglePerf() {
    var box = $('#perf');
    box.hidden = !box.hidden;
    P.save.state.settings.perf = !box.hidden; P.save.flush();
    if ($('#set-perf')) $('#set-perf').checked = !box.hidden;
  }

  function toggleHint() {
    var h = $('#controls-hint');
    h.classList.toggle('pinned');
  }

  // ===================================================================
  // 互動：碑優先，其次路邊的東西
  // ===================================================================
  /**
   * 站在碑跟器物中間時，聽比較近的那一個——碑的互動半徑（74）比器物（46）大，
   * 若一律讓碑優先，貼著碑放的器物就永遠按不到。用各自半徑正規化後比大小。
   */
  function nearestTarget() {
    var n = P.world.nearestShrine();
    var c = P.world.nearestCollectible ? P.world.nearestCollectible() : null;
    if (!n) return c ? { kind: 'item', node: c } : null;
    if (!c) return { kind: 'shrine', node: n };
    var L = P.layout;
    var ns = (n.dist == null ? 0 : n.dist) / L.SHRINE_REACH;
    var cs = (c.dist == null ? 0 : c.dist) / L.ITEM_REACH;
    return cs < ns ? { kind: 'item', node: c } : { kind: 'shrine', node: n };
  }

  function interact() {
    if (anyOpen()) return false;
    var t = nearestTarget();
    if (!t) return false;
    if (t.kind === 'shrine') openChallenge(t.node); else openFind(t.node);
    return true;
  }

  function openFind(node) {
    var c = node.item;
    var fresh = P.progress.markFound(c.id);
    paused = true;
    P.world.clearKeys();
    if (fresh) { P.audio.sfx.great(); if (P.world.refreshCollectibles) P.world.refreshCollectibles(); }
    else P.audio.sfx.open();

    $('#find-kind').textContent = P.COLLECT_KINDS[c.kind].name;
    $('#find-title').textContent = c.title;
    var body = $('#find-text'); body.innerHTML = '';
    c.text.split('\n').forEach(function (line) {
      var p = el('p', null); p.appendChild(P.gloss(line)); body.appendChild(p);
    });
    var meta = $('#find-meta'); meta.innerHTML = '';
    meta.appendChild(el('span', 'pill', node.region.name));
    meta.appendChild(el('span', 'pill', P.COLLECT_KINDS[c.kind].name + ' ' +
      P.collectGot(c.kind) + ' / ' + P.collectCount(c.kind)));
    if (fresh) meta.appendChild(el('span', 'pill fresh', '初次尋得'));

    $('#find').classList.add('open');
    $('#find').setAttribute('aria-hidden', 'false');
    setTimeout(function () { $('#find-close').focus(); }, 30);
  }

  function closeFind() {
    $('#find').classList.remove('open');
    $('#find').setAttribute('aria-hidden', 'true');
    paused = false; P.audio.sfx.close();
    setTimeout(function () { $('#stage').focus(); }, 20);
  }

  // ===================================================================
  // 四幕挑戰主控台
  // ===================================================================
  function openChallenge(node) {
    if (!node) return;
    curNode = node; curResult = null; curHow = null; act = 0;
    paused = true;
    P.world.clearKeys();
    P.audio.sfx.open();

    var s = node.shrine;
    $('#c-region').textContent = node.region.name + ' · ' + node.region.ch;
    $('#c-name').textContent = s.name;
    $('#c-skill').textContent = s.skill;
    $('#c-board').textContent = P.boards.name[s.board];
    $('#c-src').textContent = '技法 ' + s.src;

    var teach = $('#c-teach'); teach.innerHTML = '';
    teach.appendChild(P.gloss(s.teach));
    var brief = $('#c-brief'); brief.innerHTML = '';
    brief.appendChild(P.gloss(s.brief));

    curBoard = P.boards.build(s, $('#c-board-root'), function () {
      $('#c-submit').disabled = !curBoard.complete();
    });
    $('#c-submit').disabled = true;
    $('#c-result').innerHTML = '';

    setAct(0);
    $('#console').classList.add('open');
    $('#console').setAttribute('aria-hidden', 'false');
    setTimeout(function () { $('#c-next').focus(); }, 30);
  }

  function setAct(i) {
    act = i;
    $$('.act').forEach(function (a, n) { a.classList.toggle('on', n === i); });
    $$('.act-panel').forEach(function (a, n) { a.classList.toggle('on', n === i); });
    $('#c-next').classList.toggle('hidden', i !== 0);
    $('#c-submit').classList.toggle('hidden', i !== 1);
    $('#c-finish').classList.toggle('hidden', i !== 2);
    $('#c-close').classList.toggle('hidden', i !== 3);
    if (i === 1 && curBoard && curBoard.focus) setTimeout(curBoard.focus, 40);
  }

  function submit() {
    if (!curBoard || !curBoard.complete()) return;
    var data = curBoard.collect();
    curBoard.reveal();
    var res = P.score(data.text, curNode.shrine.rubric, { pickAccuracy: data.acc });
    curResult = res;
    curHow = { mode: curBoard.mode, flawless: data.acc === 1 };
    renderResult(data, res);
    setAct(2);
    if (res.score >= 85) P.audio.sfx.great();
    else if (res.score >= 50) P.audio.sfx.good();
    else P.audio.sfx.bad();
  }

  function renderResult(data, res) {
    var box = $('#c-result'); box.innerHTML = '';

    var head = el('div', 'res-head');
    var g = el('div', 'res-grade g' + res.grade.g, res.grade.g);
    head.appendChild(g);
    var meta = el('div', 'res-meta');
    meta.appendChild(el('div', 'res-score', res.score + ' 分'));
    meta.appendChild(el('div', 'res-label', res.grade.label));
    head.appendChild(meta);
    box.appendChild(head);

    var list = el('div', 'checks');
    res.rows.forEach(function (r) {
      var row = el('div', 'check ' + (r.value >= 0.99 ? 'full' : r.value > 0 ? 'part' : 'none') + (r.guard ? ' guard' : ''));
      var mark = r.value >= 0.99 ? '✓' : (r.value > 0 ? '△' : '✕');
      row.appendChild(el('span', 'check-mark', mark));
      var body = el('div', 'check-body');
      var title = el('div', 'check-title');
      title.appendChild(document.createTextNode(r.label));
      if (r.weight > 1) title.appendChild(el('span', 'w', '×' + r.weight));
      if (r.guard) title.appendChild(el('span', 'w guardtag', '防呆'));
      if (r.value > 0 && r.value < 0.99) title.appendChild(el('span', 'w part', '部分 ' + Math.round(r.value * 100) + '%'));
      body.appendChild(title);
      var why = el('div', 'check-why');
      why.appendChild(P.gloss(r.why));
      body.appendChild(why);
      row.appendChild(body);
      list.appendChild(row);
    });
    box.appendChild(list);

    var det = el('details', 'assembled');
    det.appendChild(el('summary', null, '你交出的東西（評分引擎讀到的原文）'));
    det.appendChild(el('pre', 'frag', data.text || '（空）'));
    box.appendChild(det);

    // 自由書寫沒有唯一正解，但給一份確定過關的寫法當對照
    var ref = curBoard.mode === 'write' ? P.idealAnswer(curNode.shrine) : null;
    if (ref) {
      var rd = el('details', 'assembled');
      rd.appendChild(el('summary', null, '參考寫法（不是唯一正解，評分引擎讀的是結構）'));
      rd.appendChild(el('pre', 'frag', ref));
      box.appendChild(rd);
    }
  }

  function finish() {
    var s = curNode.shrine;
    var before = P.REGIONS.filter(function (x) { return P.save.regionSealed(x.id); }).length;
    P.save.record(s, curResult, curHow);
    var after = P.REGIONS.filter(function (x) { return P.save.regionSealed(x.id); }).length;
    refreshHud();
    if (P.world.refreshVisuals) P.world.refreshVisuals();   // 碑點亮、新解鎖的島褪去灰調

    var box = $('#c-collect'); box.innerHTML = '';
    box.appendChild(el('div', 'collect-kicker', '收錄至圖鑑'));
    box.appendChild(el('div', 'collect-skill', s.skill));
    var t = el('div', 'collect-teach'); t.appendChild(P.gloss(s.teach));
    box.appendChild(t);
    var row = el('div', 'collect-row');
    row.appendChild(el('span', 'pill', '+' + s.xp + ' XP'));
    row.appendChild(el('span', 'pill', '評等 ' + curResult.grade.g));
    row.appendChild(el('span', 'pill', '出處 ' + s.src));
    box.appendChild(row);

    if (after > before) {
      P.audio.sfx.seal();
      var seal = el('div', 'seal-note');
      seal.textContent = '「' + curNode.region.name + '」全境碑文已集齊，境印點亮。';
      box.appendChild(seal);
      var shareBtn = el('button', 'btn ghost', '產出成果卡');
      shareBtn.type = 'button';
      shareBtn.addEventListener('click', makeShareCard);
      box.appendChild(shareBtn);
    }

    // 有沒有因此解鎖新的境？
    var opened = P.REGIONS.filter(function (r) { return r.need > 0 && P.save.doneCount() >= r.need && P.save.doneCount() - 1 < r.need; });
    if (opened.length) {
      var n = el('div', 'seal-note');
      n.textContent = '「' + opened.map(function (r) { return r.name; }).join('、') + '」的門扉為你開啟了。';
      box.appendChild(n);
    }

    setAct(3);
  }

  function closeConsole() {
    $('#console').classList.remove('open');
    $('#console').setAttribute('aria-hidden', 'true');
    paused = false; curBoard = null;
    P.audio.sfx.close();
    P.save.flush();
    setTimeout(function () { $('#stage').focus(); }, 20);
  }

  // ===================================================================
  // 圖鑑
  // ===================================================================
  function openCodex() {
    paused = true; P.world.clearKeys(); P.audio.sfx.open();
    var body = $('#codex-body'); body.innerHTML = '';
    var st = P.save.state;

    // ---- 稱號 ----
    var rk = P.progress.rank(), lv = P.progress.level();
    var rankSec = el('section', 'codex-region');
    rankSec.appendChild(el('h3', null, '目前稱號 · RANK'));
    var rankBox = el('div', 'rank-box');
    rankBox.appendChild(el('div', 'rank-name', rk.name + '　Lv.' + lv.lv));
    if (rk.next) {
      var need = [];
      if (rk.missing.lv) need.push('Lv.' + rk.next.lv);
      if (rk.missing.got) need.push('收集 ' + rk.next.got + ' 條');
      if (rk.missing.mastered) need.push('精通 ' + rk.next.mastered + ' 片土地');
      rankBox.appendChild(el('div', 'rank-next',
        '下一個稱號「' + rk.next.name + '」：' + (need.length ? '需要 ' + need.join(' · ') : '條件已達成')));
    } else {
      rankBox.appendChild(el('div', 'rank-next', '已達最高稱號'));
    }
    rankBox.appendChild(el('div', 'rank-next', lv.into + ' / ' + lv.need + ' XP　·　累積 ' + st.xp + ' XP'));
    var shareBtn = el('button', 'btn ghost', '分享收集成果');
    shareBtn.type = 'button';
    shareBtn.addEventListener('click', makeShareCard);
    rankBox.appendChild(shareBtn);
    rankSec.appendChild(rankBox);
    body.appendChild(rankSec);

    // ---- 廠家徽章 ----
    var marks = P.progress.vendorMarks(), totals = P.progress.vendorTotals();
    var vSec = el('section', 'codex-region');
    vSec.appendChild(el('h3', null, '廠家徽章 · VENDOR MARKS'));
    vSec.appendChild(el('p', 'sec-note', '已收集 ' + Object.keys(marks).reduce(function (a, k) { return a + marks[k]; }, 0) +
      ' 個技法標記　·　每廠集滿 5 個解開一項隱藏成就'));
    var vGrid = el('div', 'vendor-grid');
    P.VENDORS.forEach(function (v) {
      var card = el('div', 'vendor-card' + (marks[v.id] >= 5 ? ' unlocked' : ''));
      card.style.setProperty('--vh', v.hue);
      card.appendChild(el('div', 'vc-name', v.name));
      card.appendChild(el('div', 'vc-num', marks[v.id] + ' / ' + totals[v.id]));
      var bar = el('div', 'vc-bar');
      var fill = el('div', 'vc-fill');
      fill.style.width = Math.min(100, marks[v.id] / 5 * 100) + '%';
      bar.appendChild(fill); card.appendChild(bar);
      card.appendChild(el('div', 'vc-ach', marks[v.id] >= 5 ? '✦ 已解開' : '再 ' + (5 - marks[v.id]) + ' 個'));
      vGrid.appendChild(card);
    });
    vSec.appendChild(vGrid);
    body.appendChild(vSec);

    // ---- 走出來的收集 ----
    var cSec = el('section', 'codex-region');
    cSec.appendChild(el('h3', null, '走出來的收集'));
    var cGrid = el('div', 'vendor-grid');
    ['ins', 'hidden', 'relic'].forEach(function (kind) {
      var k = P.COLLECT_KINDS[kind];
      var card = el('div', 'collect-kind');
      card.appendChild(el('div', 'ck-name', k.name));
      card.appendChild(el('div', 'ck-num', P.collectGot(kind) + ' / ' + P.collectCount(kind)));
      card.appendChild(el('div', 'ck-hint', k.hint));
      cGrid.appendChild(card);
    });
    cSec.appendChild(cGrid);
    var found = P.COLLECTIBLES.filter(function (c) { return P.progress.found(c.id); });
    if (found.length) {
      var fl = el('div', 'found-list');
      found.forEach(function (c) {
        var d = el('details', 'found-item');
        d.appendChild(el('summary', null, c.title + '　' + P.COLLECT_KINDS[c.kind].name));
        c.text.split('\n').forEach(function (line) { d.appendChild(el('p', 'found-text', line)); });
        fl.appendChild(d);
      });
      cSec.appendChild(fl);
    } else {
      cSec.appendChild(el('p', 'sec-note', '還沒撿到任何東西。這些不給 XP、不解鎖任何事，純粹是走出來的。'));
    }
    body.appendChild(cSec);

    // ---- 大師層 ----
    var ms = P.progress.masterSeals();
    var mSec = el('section', 'codex-region');
    mSec.appendChild(el('h3', null, '大師層'));
    mSec.appendChild(el('p', 'sec-note', '完全選配。不給 XP、不解鎖任何東西——只是記錄你用什麼方式走完。'));
    var mGrid = el('div', 'vendor-grid');
    [['無筆之印 ✒', ms.noPen, '用石碑刻印通關，而且每一段的第一次判斷都對'],
    ['默寫之印 ✍', ms.byHand, '在自由書寫模式下通關並拿到 S'],
    ['一區純手', ms.pure, '一整片土地全部用自由書寫走完']].forEach(function (row) {
      var card = el('div', 'collect-kind');
      card.appendChild(el('div', 'ck-name', row[0]));
      card.appendChild(el('div', 'ck-num', row[1] + ' 枚'));
      card.appendChild(el('div', 'ck-hint', row[2]));
      mGrid.appendChild(card);
    });
    mSec.appendChild(mGrid);
    body.appendChild(mSec);

    P.REGIONS.forEach(function (r) {
      var list = P.SHRINES.filter(function (s) { return s.region === r.id; });
      var sec = el('section', 'codex-region');
      var h = el('h3', null);
      h.appendChild(el('span', 'dot', ''));
      h.querySelector('.dot').style.background = 'hsl(' + r.hue + ',80%,62%)';
      h.appendChild(document.createTextNode(r.name + '　'));
      h.appendChild(el('small', null, r.ch));
      if (P.save.regionSealed(r.id)) h.appendChild(el('span', 'sealed', '✦ 已集齊'));
      sec.appendChild(h);

      var grid = el('div', 'codex-grid');
      list.forEach(function (s) {
        var d = st.done[s.id];
        var card = el('article', 'codex-card' + (d ? ' got' : '') + (s.trial ? ' trial' : ''));
        var head = el('div', 'cc-head');
        head.appendChild(el('code', 'cc-sid', P.layout.skillId(s)));
        head.appendChild(el('span', 'cc-name', s.name + (s.trial ? '（試煉）' : '')));
        card.appendChild(head);
        // 沒收集到的只留編號，技法本身是「？？？」
        card.appendChild(el('div', 'cc-skill' + (d ? '' : ' unknown'), d ? s.skill : '？？？'));
        if (d) {
          var m = el('div', 'cc-meta');
          m.appendChild(el('span', 'grade-chip g' + d.grade, d.grade));
          m.appendChild(el('span', null, d.score + ' 分'));
          m.appendChild(el('span', 'cc-src', s.src));
          card.appendChild(m);
          var teach = el('p', 'cc-teach'); teach.appendChild(P.gloss(s.teach));
          card.appendChild(teach);
        } else {
          card.appendChild(el('p', 'cc-teach dimmed', '尚未叩碑。' + P.boards.name[s.board] + '。'));
        }
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      body.appendChild(sec);
    });

    // 詞彙表
    var gsec = el('section', 'codex-region');
    gsec.appendChild(el('h3', null, '詞彙表'));
    var gl = el('div', 'gloss-grid');
    Object.keys(P.GLOSSARY).forEach(function (k) {
      var c = el('div', 'gloss-card');
      c.appendChild(el('div', 'gc-term', k));
      c.appendChild(el('div', 'gc-def', P.GLOSSARY[k]));
      gl.appendChild(c);
    });
    gsec.appendChild(gl);
    body.appendChild(gsec);

    $('#codex').classList.add('open');
    $('#codex').setAttribute('aria-hidden', 'false');
    setTimeout(function () { $('#codex-close').focus(); }, 30);
  }

  function closeCodex() {
    $('#codex').classList.remove('open');
    $('#codex').setAttribute('aria-hidden', 'true');
    paused = false; P.audio.sfx.close();
    setTimeout(function () { $('#stage').focus(); }, 20);
  }

  // ===================================================================
  // 地圖
  // ===================================================================
  function openMap() {
    paused = true; P.world.clearKeys(); P.audio.sfx.open();
    var body = $('#map-body'); body.innerHTML = '';
    P.REGIONS.forEach(function (r) {
      var locked = P.world.regionLocked(r);
      var done = P.save.doneCount(r.id);
      var all = P.SHRINES.filter(function (s) { return s.region === r.id; }).length;
      var b = el('button', 'map-row' + (locked ? ' locked' : '') + (P.save.regionSealed(r.id) ? ' sealed' : ''));
      b.type = 'button';
      var dot = el('span', 'dot'); dot.style.background = 'hsl(' + r.hue + ',80%,62%)';
      b.appendChild(dot);
      var txt = el('span', 'map-txt');
      txt.appendChild(el('strong', null, r.name));
      txt.appendChild(el('small', null, r.ch));
      b.appendChild(txt);
      b.appendChild(el('span', 'map-cnt', locked ? ('需 ' + r.need + ' 碑') : (done + '/' + all)));
      if (!locked) b.addEventListener('click', function () {
        P.world.warpTo(r.id); closeMap();
      });
      else b.disabled = true;
      body.appendChild(b);
    });
    $('#map').classList.add('open');
    $('#map').setAttribute('aria-hidden', 'false');
    var mc = $('#map-canvas');
    mc.width = 520; mc.height = 320;
    P.world.drawMinimap(mc);
    setTimeout(function () { $('#map-close').focus(); }, 30);
  }
  function closeMap() {
    $('#map').classList.remove('open');
    $('#map').setAttribute('aria-hidden', 'true');
    paused = false; P.audio.sfx.close();
    setTimeout(function () { $('#stage').focus(); }, 20);
  }

  // ===================================================================
  // 設定
  // ===================================================================
  function openSettings() {
    paused = true; P.world.clearKeys();
    var st = P.save.state.settings;
    $('#set-bgm').checked = st.bgm;
    $('#set-sfx').checked = st.sfx;
    $('#set-motion').checked = st.motion;
    $('#set-font').value = String(st.font);
    $('#set-vol').value = String(st.volume);
    $('#set-perf').checked = !!st.perf;
    var q = P.world.quality ? P.world.quality() : 'high';
    $('#q-high').classList.toggle('on', q === 'high');
    $('#q-low').classList.toggle('on', q === 'low');
    var mode = st.answerMode || 'carve';
    $$('#mode-toggle button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === mode); });
    $('#settings').classList.add('open');
    $('#settings').setAttribute('aria-hidden', 'false');
  }
  function closeSettings() {
    $('#settings').classList.remove('open');
    $('#settings').setAttribute('aria-hidden', 'true');
    paused = false;
    setTimeout(function () { $('#stage').focus(); }, 20);
  }

  // ===================================================================
  // 成果卡（canvas 產圖，不用任何第三方 SDK）
  // ===================================================================
  function makeShareCard() {
    var c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    var x = c.getContext('2d');

    var g = x.createLinearGradient(0, 0, 1200, 630);
    g.addColorStop(0, '#050813'); g.addColorStop(1, '#0d1a2c');
    x.fillStyle = g; x.fillRect(0, 0, 1200, 630);

    for (var i = 0; i < 200; i++) {
      var sx = Math.random() * 1200, sy = Math.random() * 630;
      x.globalAlpha = Math.random() * 0.6 + 0.1;
      x.fillStyle = '#dfe9ff';
      x.fillRect(sx, sy, Math.random() * 1.8, Math.random() * 1.8);
    }
    x.globalAlpha = 1;

    // 極光
    x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.16;
    for (var b = 0; b < 3; b++) {
      x.beginPath(); x.moveTo(0, 120 + b * 40);
      for (var px = 0; px <= 1200; px += 20) x.lineTo(px, 120 + b * 40 + Math.sin(px * 0.006 + b) * 40);
      x.lineTo(1200, 0); x.lineTo(0, 0); x.closePath();
      x.fillStyle = 'hsla(' + (160 + b * 50) + ',80%,60%,0.5)'; x.fill();
    }
    x.restore();

    var r = P.progress.rank(), lv = P.progress.level(), st = P.save.state;
    var seals = P.REGIONS.filter(function (q) { return P.save.regionSealed(q.id); });
    var marks = P.progress.vendorMarks(), ms = P.progress.masterSeals();
    var grades = { S: 0, A: 0, B: 0, C: 0 };
    Object.keys(st.done).forEach(function (k) { var gg = st.done[k].grade; if (grades[gg] != null) grades[gg]++; });

    x.fillStyle = 'rgba(190,225,255,0.72)';
    x.font = '500 26px "Noto Sans TC", system-ui, sans-serif';
    x.fillText('提詞挈領 · 提示詞碑林', 72, 96);

    x.fillStyle = '#ffe9b8';
    x.font = '700 76px "Noto Serif TC", serif';
    x.fillText(r.name, 72, 196);

    x.fillStyle = 'rgba(220,235,255,0.9)';
    x.font = '400 32px "Noto Sans TC", system-ui, sans-serif';
    x.fillText('Lv.' + lv.lv + '　·　' + st.xp + ' XP　·　' + P.save.doneCount() + ' / ' + P.SHRINES.length + ' 塊碑文　·　' + seals.length + ' / 12 境印', 72, 252);
    x.fillStyle = 'rgba(180,205,235,0.7)';
    x.font = '400 25px "Noto Sans TC", system-ui, sans-serif';
    x.fillText('走出來的收集 ' + P.progress.foundTotal() + ' / ' + P.COLLECTIBLES.length +
      '　·　廠家徽章 ' + P.VENDORS.map(function (v) { return v.name.slice(0, 2) + ' ' + marks[v.id]; }).join('　') , 72, 292);
    x.fillText('無筆之印 ' + ms.noPen + '　·　默寫之印 ' + ms.byHand + '　·　一區純手 ' + ms.pure, 72, 326);

    // 評等長條
    var bx = 72, by = 366;
    ['S', 'A', 'B', 'C'].forEach(function (k, i) {
      var w = grades[k] * 22;
      x.fillStyle = ['#ffd76a', '#8ce4b0', '#7fc4ff', '#c0a8ff'][i];
      x.fillRect(bx, by + i * 46, Math.max(4, w), 26);
      x.fillStyle = 'rgba(230,240,255,0.9)';
      x.font = '600 22px system-ui, sans-serif';
      x.fillText(k + '　' + grades[k], bx + Math.max(4, w) + 14, by + i * 46 + 21);
    });

    // 境印
    x.font = '400 22px "Noto Sans TC", system-ui, sans-serif';
    P.REGIONS.forEach(function (q, i) {
      var cxp = 780 + (i % 3) * 130, cyp = 210 + Math.floor(i / 3) * 96;
      var on = P.save.regionSealed(q.id);
      x.beginPath(); x.arc(cxp, cyp, 30, 0, 6.284);
      x.fillStyle = on ? 'hsla(' + q.hue + ',80%,60%,0.85)' : 'rgba(120,138,165,0.18)';
      x.fill();
      x.strokeStyle = on ? 'rgba(255,235,190,0.9)' : 'rgba(150,170,200,0.35)';
      x.lineWidth = 2; x.stroke();
      x.fillStyle = on ? '#0a1020' : 'rgba(190,205,228,0.6)';
      x.textAlign = 'center';
      x.fillText(q.name.slice(0, 2), cxp, cyp + 8);
      x.textAlign = 'left';
    });

    x.fillStyle = 'rgba(170,195,225,0.55)';
    x.font = '400 20px system-ui, sans-serif';
    x.fillText('提詞挈領 · 離線評分引擎 ' + P.checkCount + ' 條結構檢核 · 無帳號、無後端、無外部請求', 72, 580);

    c.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'tici-' + Date.now() + '.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });
  }

  // ===================================================================
  // 序章
  // ===================================================================
  // 序章《拾燈》。說話的是「留字的人」——這座碑林上一個走完的人，
  // 他把想講的話刻在碑上就走了，你聽到的是那些字。
  var PROLOGUE = [
    { who: '留字的人', h: '……你醒了。', p: '別急著起身。你腳下這片地，是碑林。\n我不在這裡了，你聽到的是我留在石頭上的字。' },
    { who: '留字的人', h: '這裡的每一塊碑，都封著一句別人吃過虧才寫下的話。', p: '它們來自九家做模型的人自己寫的文件——十七章，兩百多條。\n那些話原本散在幾百頁裡，我把它們一塊一塊搬到這裡立起來。' },
    { who: '留字的人', h: '碑不考你背誦。', p: '走到碑前按 E，它會先把道理講給你聽，然後丟一個真的情境給你。\n多數時候你不用打字——你是從幾個句子裡，挑出站得住的那一句，把提示詞刻出來。' },
    { who: '留字的人', h: '挑錯不會怎麼樣。', p: '碑只會把它推回來，順便用白話告訴你為什麼那句話撐不住。\n你可以一直試到對為止。只是第一次的判斷，會留在評等上。' },
    { who: '留字的人', h: '評分不假手於人。', p: '這裡沒有連向任何模型、任何伺服器。\n給你分數的是一套刻在石頭裡的規矩：一百多條，只認結構，不認漂亮話。' },
    { who: '留字的人', h: '門扉認的是碑，不是等級。', p: '再往外的島會鎖著。它不看你練到幾級，只看你手上有幾塊碑。\n想走遠一點，就把眼前這片刻完。' },
    { who: '留字的人', h: '最後一句。', p: '路邊有些東西是可以動的——罐子、火盆、響石。有些地方不在路上，得繞。\n那些不給你任何好處。但你要是連繞路都不肯，這裡大概也待不久。' },
    { who: null, h: '起身吧。', p: '燈在你手上。', k: 'W A S D 移動　·　E 互動　·　M 地圖　·　C 圖鑑　·　? 操作一覽' }
  ];

  function showPrologue(idx) {
    var s = PROLOGUE[idx];
    if (!s) {
      $('#prologue').classList.remove('open');
      P.save.state.prologue = true; P.save.flush();
      paused = false;
      setTimeout(function () { $('#stage').focus(); }, 20);
      return;
    }
    paused = true;
    $('#pro-who').textContent = s.who || '';
    $('#pro-who').style.visibility = s.who ? 'visible' : 'hidden';
    $('#pro-step').textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(PROLOGUE.length).padStart(2, '0');
    $('#pro-h').textContent = s.h;
    var p = $('#pro-p'); p.innerHTML = '';
    s.p.split('\n').forEach(function (line) {
      var d = el('p', null); d.appendChild(P.gloss(line)); p.appendChild(d);
    });
    $('#pro-k').textContent = s.k || '';
    $('#pro-dots').innerHTML = '';
    PROLOGUE.forEach(function (_, i) {
      $('#pro-dots').appendChild(el('span', 'pdot' + (i === idx ? ' on' : (i < idx ? ' past' : ''))));
    });
    $('#pro-next').textContent = idx === PROLOGUE.length - 1 ? '起身' : '繼續';
    $('#pro-next').onclick = function () { P.audio.sfx.pick(); showPrologue(idx + 1); };
    $('#pro-skip').onclick = function () { P.audio.sfx.close(); showPrologue(PROLOGUE.length); };
    $('#prologue').classList.add('open');
    setTimeout(function () { $('#pro-next').focus(); }, 30);
  }

  // ===================================================================
  // 標題畫面
  // ===================================================================
  function showTitle() {
    paused = true;
    $('#title').classList.add('open');
    var go = function (e) {
      if (e.type === 'keydown' && (e.key === 'F5' || e.key === 'F12')) return;
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
      P.audio.unlock();
      P.audio.playTrack(0);
      $('#title').classList.remove('open');
      P.save.state.title = true; P.save.flush();
      if (!P.save.state.prologue) showPrologue(0);
      else { paused = false; setTimeout(function () { $('#stage').focus(); }, 20); }
    };
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
  }

  // ===================================================================
  // 詞彙卡
  // ===================================================================
  function initGlossaryCard() {
    var card = $('#glosscard');
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest('.gl') : null;
      if (!t) return;
      var term = t.dataset.term;
      if (!P.GLOSSARY[term]) return;
      card.innerHTML = '';
      card.appendChild(el('div', 'gc-term', term));
      card.appendChild(el('div', 'gc-def', P.GLOSSARY[term]));
      card.classList.add('show');
      var r = t.getBoundingClientRect();
      var top = r.bottom + 10;
      if (top + 140 > window.innerHeight) top = r.top - 150;
      card.style.top = Math.max(8, top) + 'px';
      card.style.left = Math.min(window.innerWidth - 340, Math.max(8, r.left)) + 'px';
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest && e.target.closest('.gl')) card.classList.remove('show');
    });
  }

  // ===================================================================
  // 鍵盤
  // ===================================================================
  // WASD 走路、方向鍵轉鏡頭 —— 和原版一致
  var KEYMAP = {
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
    ArrowUp: 'camUp', ArrowDown: 'camDown', ArrowLeft: 'camLeft', ArrowRight: 'camRight',
    ' ': 'sky', '-': 'zoomOut', '_': 'zoomOut', '=': 'zoomIn', '+': 'zoomIn'
  };

  function anyOpen() {
    return $$('.overlay.open').length > 0;
  }

  function initKeys() {
    document.addEventListener('keydown', function (e) {
      P.audio.unlock();
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      var k = KEYMAP[e.key];
      if (k) { P.world.setKey(k, true); e.preventDefault(); return; }
      if (e.key === 'Shift') { P.world.setKey('shift', true); return; }

      if (e.key === 'Escape') {
        if ($('#console').classList.contains('open')) closeConsole();
        else if ($('#find').classList.contains('open')) closeFind();
        else if ($('#codex').classList.contains('open')) closeCodex();
        else if ($('#map').classList.contains('open')) closeMap();
        else if ($('#settings').classList.contains('open')) closeSettings();
        return;
      }
      if (anyOpen()) return;

      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        if (interact()) e.preventDefault();
      } else if (e.key === 'm' || e.key === 'M') openMap();
      else if (e.key === 'c' || e.key === 'C') openCodex();
      else if (e.key === 'o' || e.key === 'O' || e.key === 'p' || e.key === 'P') openSettings();
      else if (e.key === '?' || e.key === '/') toggleHint();
      else if (e.key === 'F3') { togglePerf(); e.preventDefault(); }
    });

    document.addEventListener('keyup', function (e) {
      var k = KEYMAP[e.key];
      if (k) P.world.setKey(k, false);
      if (e.key === 'Shift') P.world.setKey('shift', false);
    });

    window.addEventListener('blur', function () { P.world.clearKeys(); });
  }

  // 觸控搖桿
  function initTouch() {
    var pad = $('#touchpad');
    if (!('ontouchstart' in window)) { pad.style.display = 'none'; return; }
    var origin = null;
    function set(dx, dy) {
      var m = Math.hypot(dx, dy);
      P.world.setKey('left', dx < -12); P.world.setKey('right', dx > 12);
      P.world.setKey('up', dy < -12); P.world.setKey('down', dy > 12);
      $('#stick').style.transform = 'translate(' + Math.max(-40, Math.min(40, dx)) + 'px,' + Math.max(-40, Math.min(40, dy)) + 'px)';
    }
    pad.addEventListener('touchstart', function (e) { origin = e.touches[0]; e.preventDefault(); }, { passive: false });
    pad.addEventListener('touchmove', function (e) {
      if (!origin) return;
      set(e.touches[0].clientX - origin.clientX, e.touches[0].clientY - origin.clientY);
      e.preventDefault();
    }, { passive: false });
    pad.addEventListener('touchend', function () { origin = null; P.world.clearKeys(); $('#stick').style.transform = ''; });
    $('#touch-e').addEventListener('click', interact);
  }

  // ===================================================================
  // 主迴圈
  // ===================================================================
  /** 一幀。抽出來是為了讓 requestAnimationFrame 停擺時（背景分頁、無頭測試）也驅動得了。 */
  function frame(dt) {
    P.world.update(dt, paused || anyOpen());
    P.world.draw();
    refreshPrompt();
    refreshNav();
    refreshPerf();
    P.world.drawMinimap($('#minimap'));
  }
  P.frame = frame;

  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  }

  // ===================================================================
  // 啟動
  // ===================================================================
  function pickWorld() {
    if (!window.THREE || !P.world3d) return P.world2d;
    try {
      var probe = document.createElement('canvas');
      var gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return P.world2d;
    } catch (e) { return P.world2d; }
    return P.world3d;
  }

  function boot() {
    P.save.load();
    document.documentElement.style.setProperty('--fs', P.save.state.settings.font);
    $('#perf').hidden = !P.save.state.settings.perf;
    if (P.audio.setVolume) P.audio.setVolume(P.save.state.settings.volume);

    // 沒有 WebGL 的機器（老舊顯卡、遠端桌面、關掉硬體加速）退回 2D 世界，
    // 兩邊介面一致，關卡與評分完全不受影響。
    P.world = pickWorld();
    P.world.init($('#stage'));
    initKeys();
    initTouch();
    initGlossaryCard();
    refreshHud();

    $('#minimap').width = 220; $('#minimap').height = 140;

    $('#c-next').addEventListener('click', function () { setAct(1); });
    $('#c-submit').addEventListener('click', submit);
    $('#c-finish').addEventListener('click', finish);
    $('#c-close').addEventListener('click', closeConsole);
    $('#c-x').addEventListener('click', closeConsole);
    $('#codex-close').addEventListener('click', closeCodex);
    $('#find-close').addEventListener('click', closeFind);
    $('#find-x').addEventListener('click', closeFind);
    $('#map-close').addEventListener('click', closeMap);
    $('#set-close').addEventListener('click', closeSettings);
    $('#btn-codex').addEventListener('click', openCodex);
    $('#btn-map').addEventListener('click', openMap);
    $('#btn-set').addEventListener('click', openSettings);
    $('#btn-share').addEventListener('click', makeShareCard);

    $('#set-bgm').addEventListener('change', function () { P.audio.setBgm(this.checked); });
    $('#set-sfx').addEventListener('change', function () { P.save.state.settings.sfx = this.checked; P.save.flush(); });
    $('#set-motion').addEventListener('change', function () { P.save.state.settings.motion = this.checked; P.save.flush(); });
    $('#set-font').addEventListener('input', function () {
      P.save.state.settings.font = parseFloat(this.value);
      document.documentElement.style.setProperty('--fs', this.value);
      P.save.flush();
    });
    $('#set-vol').addEventListener('input', function () {
      P.save.state.settings.volume = parseFloat(this.value);
      if (P.audio.setVolume) P.audio.setVolume(parseFloat(this.value));
      P.save.flush();
    });
    $('#set-perf').addEventListener('change', function () {
      $('#perf').hidden = !this.checked;
      P.save.state.settings.perf = this.checked; P.save.flush();
    });
    $$('#q-high, #q-low').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#q-high, #q-low').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (P.world.setQuality) P.world.setQuality(b.dataset.q);
      });
    });
    $$('#mode-toggle button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#mode-toggle button').forEach(function (x) { x.classList.toggle('on', x === b); });
        P.save.state.settings.answerMode = b.dataset.mode;
        P.save.flush();
      });
    });
    $('#set-replay').addEventListener('click', function () {
      closeSettings();
      setTimeout(function () { showPrologue(0); }, 120);
    });
    $('#set-reset').addEventListener('click', function () {
      if (!confirm('這會清掉所有進度、評等與圖鑑，而且無法復原。確定要重來嗎？')) return;
      P.save.reset();
      location.reload();
    });

    // 點畫布也能叩碑
    $('#stage').addEventListener('click', function () {
      P.audio.unlock();
      if (anyOpen()) return;
      if (P.world.justDragged && P.world.justDragged()) return;   // 那是在轉鏡頭
      interact();
    });

    document.addEventListener('pointerdown', function once() {
      P.audio.unlock();
      P.audio.playTrack(0);
      document.removeEventListener('pointerdown', once);
    });

    if (!P.save.state.title) showTitle();
    else if (!P.save.state.prologue) showPrologue(0);
    else paused = false;

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.TICI = window.TICI || {});
