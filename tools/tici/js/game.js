/* Promptasy · 主控：四幕挑戰、圖鑑、序章、設定、成果卡 */
(function (P) {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var paused = false, curNode = null, curBoard = null, curResult = null, act = 0;

  // ===================================================================
  // HUD
  // ===================================================================
  function refreshHud() {
    var st = P.save.state, r = P.save.rank();
    $('#hud-rank').textContent = r.name;
    $('#hud-xp').textContent = st.xp + ' XP';
    var total = P.SHRINES.length, done = P.save.doneCount();
    $('#hud-progress').textContent = done + ' / ' + total + ' 碑';
    var seals = P.REGIONS.filter(function (x) { return P.save.regionSealed(x.id); }).length;
    $('#hud-seals').textContent = '印 ' + seals + ' / ' + P.REGIONS.length;
    var pctNext = r.next ? Math.round((st.xp - r.floor) / (r.next.min - r.floor) * 100) : 100;
    $('#hud-bar-fill').style.width = Math.max(2, Math.min(100, pctNext)) + '%';
    $('#hud-bar').title = r.next ? ('距 ' + r.next.name + ' 還差 ' + (r.next.min - st.xp) + ' XP') : '已達最高階';
  }

  // ===================================================================
  // 提示條（靠近神碑時）
  // ===================================================================
  var lastRegionTrack = -1;
  function refreshPrompt() {
    var n = P.world.nearestShrine();
    var bar = $('#interact');
    var blocked = P.world.blockedInfo();
    if (blocked) {
      bar.classList.add('show', 'warn');
      bar.textContent = '「' + blocked.name + '」的門扉尚未認得你 —— 需要 ' + blocked.need + ' 塊碑文，目前 ' + P.save.doneCount() + ' 塊';
      curNode = null;
      return;
    }
    bar.classList.remove('warn');
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
  // 四幕挑戰主控台
  // ===================================================================
  function openChallenge(node) {
    if (!node) return;
    curNode = node; curResult = null; act = 0;
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
    var ref = P.REFERENCE && P.REFERENCE[curNode.shrine.id];
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
    P.save.record(s, curResult);
    var after = P.REGIONS.filter(function (x) { return P.save.regionSealed(x.id); }).length;
    refreshHud();

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
        card.appendChild(el('div', 'cc-name', s.name + (s.trial ? '（試煉）' : '')));
        card.appendChild(el('div', 'cc-skill', d ? s.skill : '未刻'));
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

    var r = P.save.rank(), st = P.save.state;
    var seals = P.REGIONS.filter(function (q) { return P.save.regionSealed(q.id); });
    var grades = { S: 0, A: 0, B: 0, C: 0 };
    Object.keys(st.done).forEach(function (k) { var gg = st.done[k].grade; if (grades[gg] != null) grades[gg]++; });

    x.fillStyle = 'rgba(190,225,255,0.72)';
    x.font = '500 26px "Noto Sans TC", system-ui, sans-serif';
    x.fillText('提詞挈領 · 提示詞碑林', 72, 96);

    x.fillStyle = '#ffe9b8';
    x.font = '700 76px "Noto Serif TC", serif';
    x.fillText(r.name, 72, 196);

    x.fillStyle = 'rgba(220,235,255,0.9)';
    x.font = '400 34px "Noto Sans TC", system-ui, sans-serif';
    x.fillText(st.xp + ' XP　·　' + P.save.doneCount() + ' / ' + P.SHRINES.length + ' 塊碑文　·　' + seals.length + ' / 12 境印', 72, 256);

    // 評等長條
    var bx = 72, by = 320;
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
    x.fillText('離線評分引擎 · ' + P.checkCount + ' 條結構檢核 · 無帳號、無後端、無外部請求', 72, 570);

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
  var PROLOGUE = [
    {
      h: '這裡是碑林。',
      p: '十二座島嶼漂在夜色裡，島上立著一塊塊碑。每一塊碑封著一個提示詞工程的技法——它們全部整併自九家模型廠商的官方文件，一共十七章、兩百多條技法。',
      k: '用 W A S D 或方向鍵走動。'
    },
    {
      h: '碑不會考你背誦。',
      p: '走到碑前按 E，碑會先把技法講給你聽，然後給你一個實際的情境要你動手。多數時候你不用打字——你是從幾個句子裡挑出對的那一個，把提示詞一段一段刻出來。',
      k: '按 E 叩碑。'
    },
    {
      h: '選錯不會失敗。',
      p: '挑到不對的句子，碑只會把它推回來，並用白話告訴你為什麼站不住。你可以一直試到對為止——但第一次的判斷會反映在評等上。S 到 C，四個等第。',
      k: '評分完全在你的瀏覽器裡跑，不呼叫任何模型。'
    },
    {
      h: '門扉認的是碑，不是等級。',
      p: '往後的島嶼會鎖著，但它讀的不是你的等級，是你手上有幾塊碑。想去更遠的地方，就把眼前的碑刻完。',
      k: 'M 開地圖　C 開圖鑑　Esc 返回'
    }
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
    $('#pro-h').textContent = s.h;
    var p = $('#pro-p'); p.innerHTML = ''; p.appendChild(P.gloss(s.p));
    $('#pro-k').textContent = s.k;
    $('#pro-dots').innerHTML = '';
    PROLOGUE.forEach(function (_, i) {
      var d = el('span', 'pdot' + (i === idx ? ' on' : ''));
      $('#pro-dots').appendChild(d);
    });
    $('#pro-next').textContent = idx === PROLOGUE.length - 1 ? '啟程' : '繼續';
    $('#pro-next').onclick = function () { P.audio.sfx.pick(); showPrologue(idx + 1); };
    $('#prologue').classList.add('open');
    setTimeout(function () { $('#pro-next').focus(); }, 30);
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
  var KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
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
        else if ($('#codex').classList.contains('open')) closeCodex();
        else if ($('#map').classList.contains('open')) closeMap();
        else if ($('#settings').classList.contains('open')) closeSettings();
        return;
      }
      if (anyOpen()) return;

      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        var n = P.world.nearestShrine();
        if (n) { openChallenge(n); e.preventDefault(); }
      } else if (e.key === 'm' || e.key === 'M') openMap();
      else if (e.key === 'c' || e.key === 'C') openCodex();
      else if (e.key === 'p' || e.key === 'P') openSettings();
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
    $('#touch-e').addEventListener('click', function () {
      var n = P.world.nearestShrine();
      if (n) openChallenge(n);
    });
  }

  // ===================================================================
  // 主迴圈
  // ===================================================================
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    P.world.update(dt, paused || anyOpen());
    P.world.draw();
    refreshPrompt();
    P.world.drawMinimap($('#minimap'));
    requestAnimationFrame(loop);
  }

  // ===================================================================
  // 啟動
  // ===================================================================
  function boot() {
    P.save.load();
    document.documentElement.style.setProperty('--fs', P.save.state.settings.font);

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
    $('#set-reset').addEventListener('click', function () {
      if (!confirm('這會清掉所有進度、評等與圖鑑，而且無法復原。確定要重來嗎？')) return;
      P.save.reset();
      location.reload();
    });

    // 點畫布也能叩碑
    $('#stage').addEventListener('click', function () {
      P.audio.unlock();
      if (anyOpen()) return;
      var n = P.world.nearestShrine();
      if (n) openChallenge(n);
    });

    document.addEventListener('pointerdown', function once() {
      P.audio.unlock();
      P.audio.playTrack(0);
      document.removeEventListener('pointerdown', once);
    });

    if (!P.save.state.prologue) showPrologue(0);
    else paused = false;

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.TICI = window.TICI || {});
