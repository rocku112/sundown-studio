/* Promptasy · 十一種題板
 * 每一種題板最後都會化約成同一樣東西：一段「組裝後的提示詞文本」＋一個選擇正確度。
 * 這兩樣東西餵給同一套離線評分引擎，所以不同題型的評等是同一把尺。
 */
(function (P) {
  'use strict';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** 把術語包成可懸停的詞彙卡 */
  function gloss(text) {
    var terms = Object.keys(P.GLOSSARY || {}).sort(function (a, b) { return b.length - a.length; });
    var frag = document.createDocumentFragment();
    var rest = String(text);
    var guard = 0;
    while (rest.length && guard++ < 400) {
      var best = -1, bestT = null;
      terms.forEach(function (t) {
        var i = rest.toLowerCase().indexOf(t.toLowerCase());
        if (i >= 0 && (best < 0 || i < best)) { best = i; bestT = t; }
      });
      if (best < 0) { frag.appendChild(document.createTextNode(rest)); break; }
      if (best > 0) frag.appendChild(document.createTextNode(rest.slice(0, best)));
      var span = el('span', 'gl', rest.substr(best, bestT.length));
      span.dataset.term = bestT;
      frag.appendChild(span);
      rest = rest.slice(best + bestT.length);
    }
    return frag;
  }
  P.gloss = gloss;

  function pre(text) {
    var p = el('pre', 'frag');
    p.textContent = text;
    return p;
  }

  var BOARD_NAME = {
    carve: '碑文刻寫', gate: '守門叩問', sift: '沙盤篩選', trim: '冗贅刪修',
    order: '位序排列', dispatch: '工坊調度', pair: '對照配對', slot: '模板填格',
    gauge: '約束儀盤', repair: '瑕碑修補', write: '自由書寫'
  };
  P.boardName = BOARD_NAME;

  // 全域：第一次嘗試是否正確（決定選擇正確度）
  function Tracker() {
    this.first = {};      // key -> true/false
    this.n = 0;
  }
  Tracker.prototype.mark = function (key, ok) {
    if (this.first[key] === undefined) this.first[key] = !!ok;
  };
  Tracker.prototype.acc = function (total) {
    var keys = Object.keys(this.first);
    if (!total) total = keys.length;
    if (!total) return 1;
    var good = keys.filter(function (k) { return this.first[k]; }, this).length;
    return good / total;
  };

  /** wrap.children 是即時集合；揭曉時會往裡面插說明，所以一定要先做快照再走訪。 */
  function snapshot(node) { return Array.prototype.slice.call(node.children); }

  function jaccard(picked, correct) {
    var tp = 0, fp = 0, fn = 0;
    picked.forEach(function (i) { (correct.indexOf(i) >= 0 ? tp++ : fp++); });
    correct.forEach(function (i) { if (picked.indexOf(i) < 0) fn++; });
    var denom = tp + fp + fn;
    return denom === 0 ? 1 : tp / denom;
  }

  /**
   * 一關的「正解長什麼樣」。自由書寫模式拿它當參考寫法，自我測試也拿它驗證。
   * 不是唯一正解——評分引擎讀的是結構，不是字句。
   */
  function idealAnswer(s) {
    switch (s.board) {
      case 'carve': return s.segs.map(function (g) { return g.opts.find(function (o) { return o.ok; }).t; }).join('\n');
      case 'gate': return s.opts.find(function (o) { return o.ok; }).t;
      case 'slot': {
        var t = s.template;
        s.slots.forEach(function (sl, i) { t = t.replace('{{' + i + '}}', sl.opts.find(function (o) { return o.ok; }).t); });
        return t;
      }
      case 'repair': {
        var o = s.lines.slice();
        o[s.flaw] = s.fixes.find(function (f) { return f.ok; }).t;
        return o.join('\n');
      }
      case 'order': return s.answer.map(function (i) { return s.items[i].t; }).join('\n');
      case 'sift': return s.opts.filter(function (o) { return o.ok; }).map(function (o) { return o.t; }).join('\n');
      case 'trim': return s.lines.filter(function (o) { return !o.drop; }).map(function (o) { return o.t; }).join('\n');
      case 'dispatch': return s.items.map(function (it) {
        return it.t + ' → ' + s.buckets.find(function (b) { return b.id === it.ans; }).name;
      }).join('\n');
      case 'pair': return s.left.map(function (L, i) { return L.t + ' → ' + s.right[s.answer[i]].t; }).join('\n');
      case 'gauge': return (s.prefix ? s.prefix + '\n' : '') +
        s.knobs.map(function (k) { return k.key + ' = ' + k.answer; }).join('\n') + (s.tail ? '\n' + s.tail : '');
      default: return (P.REFERENCE && P.REFERENCE[s.id]) || null;
    }
  }
  P.idealAnswer = idealAnswer;

  /** 從 rubric 反推幾個提示詞，給自由書寫模式當提示 */
  function hintsFrom(shrine) {
    return shrine.rubric
      .filter(function (r) { return r.id !== 'picks'; })
      .slice(0, 5)
      .map(function (r) { return (P.CHECKS[r.id] || {}).label || r.id; });
  }

  /**
   * 建立題板。
   * @returns {{collect:Function, complete:Function, root:HTMLElement}}
   */
  function build(shrine, root, onChange) {
    root.innerHTML = '';
    var tr = new Tracker();
    var api = { tracker: tr };

    // 全域切成自由書寫時，任何一關都變成打字題：情境不變、評分準則不變，
    // 只是不再給你候選句子。這是課程的「困難模式」。
    var forceWrite = P.save.state.settings.answerMode === 'write' && shrine.board !== 'write';
    api.mode = (forceWrite || shrine.board === 'write') ? 'write' : 'carve';
    if (forceWrite) {
      shrine = Object.assign({}, shrine, {
        board: 'write',
        starter: '',
        hints: hintsFrom(shrine)
      });
    }

    function feedback(node, ok, note) {
      if (!node || !node.parentNode) return;
      // 只換掉「緊接在這個選項後面」的那一張說明，不要去動同一組裡別人的說明
      var next = node.nextElementSibling;
      if (next && next.classList.contains('inline-note')) next.remove();
      if (!note) return;
      var n = el('div', 'inline-note ' + (ok ? 'ok' : 'no'));
      n.appendChild(gloss((ok ? '✓ ' : '✕ ') + note));
      node.parentNode.insertBefore(n, node.nextSibling);
      if (!ok) setTimeout(function () { if (n.parentNode) n.remove(); }, 7000);
    }

    // -------------------------------------------------- 即時否決型
    // carve / gate / slot / repair / order：選錯不會失敗，只會被擋下並附上白話說明
    function singleGroup(container, opts, key, onPick, transform) {
      var wrap = el('div', 'opts');
      opts.forEach(function (o, i) {
        var b = el('button', 'opt');
        b.type = 'button';
        b.appendChild(pre(transform ? transform(o) : o.t));
        b.addEventListener('click', function () {
          if (b.classList.contains('locked')) return;
          tr.mark(key, !!o.ok);
          if (o.ok) {
            P.audio.sfx.pick();
            snapshot(wrap).forEach( function (c) { c.classList.remove('chosen'); c.classList.add('dim'); });
            b.classList.add('chosen'); b.classList.remove('dim'); b.classList.add('locked');
            feedback(b, true, o.note);
            onPick(o, i);
          } else {
            P.audio.sfx.bad();
            b.classList.add('rejected');
            setTimeout(function () { b.classList.remove('rejected'); }, 450);
            feedback(b, false, o.note || '這個選項在這裡站不住。');
          }
          if (onChange) onChange();
        });
        wrap.appendChild(b);
      });
      container.appendChild(wrap);
      return wrap;
    }

    // -------------------------------------------------- 各題型
    if (shrine.board === 'carve') {
      var picked = new Array(shrine.segs.length).fill(null);
      shrine.segs.forEach(function (seg, si) {
        var box = el('div', 'seg');
        box.appendChild(el('div', 'seg-label', seg.label));
        singleGroup(box, seg.opts, 's' + si, function (o) { picked[si] = o.t; });
        root.appendChild(box);
      });
      api.collect = function () {
        return { text: picked.filter(Boolean).join('\n'), acc: tr.acc(shrine.segs.length) };
      };
      api.complete = function () { return picked.every(Boolean); };
    }

    else if (shrine.board === 'gate') {
      var got = null;
      var box = el('div', 'seg');
      box.appendChild(el('div', 'seg-label', shrine.q || '選出正確的作法'));
      singleGroup(box, shrine.opts, 'g', function (o) { got = o.t; });
      root.appendChild(box);
      api.collect = function () { return { text: got || '', acc: tr.acc(1) }; };
      api.complete = function () { return !!got; };
    }

    else if (shrine.board === 'slot') {
      var fills = new Array(shrine.slots.length).fill(null);
      var preview = el('pre', 'slot-preview');
      function refresh() {
        var t = shrine.template;
        shrine.slots.forEach(function (s, i) {
          t = t.replace('{{' + i + '}}', fills[i] || '……');
        });
        preview.textContent = t;
      }
      shrine.slots.forEach(function (s, si) {
        var box = el('div', 'seg');
        box.appendChild(el('div', 'seg-label', '填入：' + s.label));
        singleGroup(box, s.opts, 'k' + si, function (o) { fills[si] = o.t; refresh(); });
        root.appendChild(box);
      });
      var pv = el('div', 'seg');
      pv.appendChild(el('div', 'seg-label', '組裝結果'));
      pv.appendChild(preview);
      root.appendChild(pv);
      refresh();
      api.collect = function () { return { text: preview.textContent, acc: tr.acc(shrine.slots.length) }; };
      api.complete = function () { return fills.every(Boolean); };
    }

    else if (shrine.board === 'repair') {
      var flawIdx = null, fixText = null;
      var step1 = el('div', 'seg');
      step1.appendChild(el('div', 'seg-label', '第一步 · 指出出問題的那一行'));
      var lineWrap = el('div', 'opts');
      shrine.lines.forEach(function (ln, i) {
        var b = el('button', 'opt'); b.type = 'button';
        b.appendChild(pre(ln));
        b.addEventListener('click', function () {
          if (flawIdx !== null) return;
          tr.mark('flaw', i === shrine.flaw);
          if (i === shrine.flaw) {
            P.audio.sfx.pick();
            flawIdx = i;
            snapshot(lineWrap).forEach(function (c) { c.classList.add('dim'); });
            b.classList.remove('dim'); b.classList.add('chosen');
            feedback(b, true, '就是這一行。');
            step2.classList.remove('hidden');
          } else {
            P.audio.sfx.bad();
            b.classList.add('rejected');
            setTimeout(function () { b.classList.remove('rejected'); }, 450);
            feedback(b, false, '這一行沒有問題。再看看。');
          }
          if (onChange) onChange();
        });
        lineWrap.appendChild(b);
      });
      step1.appendChild(lineWrap);
      root.appendChild(step1);

      var step2 = el('div', 'seg hidden');
      step2.appendChild(el('div', 'seg-label', '第二步 · 選出修法'));
      singleGroup(step2, shrine.fixes, 'fix', function (o) { fixText = o.t; });
      root.appendChild(step2);

      api.collect = function () {
        var out = shrine.lines.slice();
        if (flawIdx !== null && fixText) out[flawIdx] = fixText;
        return { text: out.join('\n'), acc: tr.acc(2) };
      };
      api.complete = function () { return flawIdx !== null && !!fixText; };
    }

    else if (shrine.board === 'order') {
      var seq = [], idxOrder = shrine.answer.slice();
      var pool = el('div', 'opts');
      // 以決定性的方式打亂，同一關每次順序一致
      var shown = shrine.items.map(function (it, i) { return i; })
        .sort(function (a, b) {
          var ha = Math.sin(a * 12.9898 + shrine.id.length * 7.233) * 43758.5453;
          var hb = Math.sin(b * 12.9898 + shrine.id.length * 7.233) * 43758.5453;
          return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
        });
      var track = el('div', 'order-track');
      function refreshTrack() {
        track.innerHTML = '';
        if (!seq.length) { track.appendChild(el('div', 'hint-inline', '尚未排入任何一段')); return; }
        seq.forEach(function (i, n) {
          var row = el('div', 'order-row');
          row.appendChild(el('span', 'order-no', String(n + 1)));
          row.appendChild(pre(shrine.items[i].t));
          track.appendChild(row);
        });
      }
      shown.forEach(function (i) {
        var b = el('button', 'opt'); b.type = 'button';
        b.appendChild(pre(shrine.items[i].t));
        b.addEventListener('click', function () {
          if (b.classList.contains('locked')) return;
          var want = idxOrder[seq.length];
          tr.mark('o' + seq.length, i === want);
          if (i === want) {
            P.audio.sfx.pick();
            seq.push(i); b.classList.add('locked', 'chosen');
            feedback(b, true, shrine.items[i].note);
            refreshTrack();
          } else {
            P.audio.sfx.bad();
            b.classList.add('rejected');
            setTimeout(function () { b.classList.remove('rejected'); }, 450);
            feedback(b, false, '這一段還不該放在第 ' + (seq.length + 1) + ' 位。');
          }
          if (onChange) onChange();
        });
        pool.appendChild(b);
      });
      var s1 = el('div', 'seg');
      s1.appendChild(el('div', 'seg-label', '依序點選，排出正確的位序'));
      s1.appendChild(pool);
      root.appendChild(s1);
      var s2 = el('div', 'seg');
      s2.appendChild(el('div', 'seg-label', '目前排序'));
      s2.appendChild(track);
      root.appendChild(s2);
      refreshTrack();
      api.collect = function () {
        return { text: seq.map(function (i) { return shrine.items[i].t; }).join('\n'), acc: tr.acc(shrine.items.length) };
      };
      api.complete = function () { return seq.length === shrine.items.length; };
    }

    // -------------------------------------------------- 提交後揭曉型
    else if (shrine.board === 'sift') {
      var sel = [], siftBtns = [];
      var wrap = el('div', 'opts');
      shrine.opts.forEach(function (o, i) {
        var b = el('button', 'opt check'); b.type = 'button';
        siftBtns.push(b);
        b.appendChild(pre(o.t));
        b.addEventListener('click', function () {
          var k = sel.indexOf(i);
          if (k >= 0) { sel.splice(k, 1); b.classList.remove('chosen'); P.audio.sfx.unpick(); }
          else { sel.push(i); b.classList.add('chosen'); P.audio.sfx.pick(); }
          if (onChange) onChange();
        });
        wrap.appendChild(b);
      });
      var s = el('div', 'seg');
      s.appendChild(el('div', 'seg-label', '勾選所有正確的項目（可複選）'));
      s.appendChild(wrap);
      root.appendChild(s);
      api.reveal = function () {
        siftBtns.forEach(function (b, i) {
          var o = shrine.opts[i], chosen = sel.indexOf(i) >= 0;
          b.classList.add('locked');
          if (o.ok) b.classList.add('answer');
          if (chosen !== !!o.ok) { b.classList.add('miss'); feedback(b, false, o.note || (o.ok ? '這一項該選。' : '這一項不該選。')); }
          else if (chosen) feedback(b, true, o.note);
        });
      };
      api.collect = function () {
        var correct = shrine.opts.map(function (o, i) { return o.ok ? i : -1; }).filter(function (i) { return i >= 0; });
        return {
          text: sel.slice().sort().map(function (i) { return shrine.opts[i].t; }).join('\n'),
          acc: jaccard(sel, correct)
        };
      };
      api.complete = function () { return sel.length > 0; };
    }

    else if (shrine.board === 'trim') {
      var drop = [], trimBtns = [];
      var wrap = el('div', 'opts');
      shrine.lines.forEach(function (o, i) {
        var b = el('button', 'opt check strike'); b.type = 'button';
        trimBtns.push(b);
        b.appendChild(pre(o.t));
        b.addEventListener('click', function () {
          var k = drop.indexOf(i);
          if (k >= 0) { drop.splice(k, 1); b.classList.remove('cut'); P.audio.sfx.unpick(); }
          else { drop.push(i); b.classList.add('cut'); P.audio.sfx.pick(); }
          if (onChange) onChange();
        });
        wrap.appendChild(b);
      });
      var s = el('div', 'seg');
      s.appendChild(el('div', 'seg-label', '點選要刪掉的句子（可複選）'));
      s.appendChild(wrap);
      root.appendChild(s);
      api.reveal = function () {
        trimBtns.forEach(function (b, i) {
          var o = shrine.lines[i], cut = drop.indexOf(i) >= 0;
          b.classList.add('locked');
          if (o.drop) b.classList.add('answer');
          if (cut !== !!o.drop) { b.classList.add('miss'); feedback(b, false, o.note || (o.drop ? '這一句該刪。' : '這一句有作用，不該刪。')); }
          else if (cut) feedback(b, true, o.note);
        });
      };
      api.collect = function () {
        var correct = shrine.lines.map(function (o, i) { return o.drop ? i : -1; }).filter(function (i) { return i >= 0; });
        return {
          text: shrine.lines.filter(function (o, i) { return drop.indexOf(i) < 0; }).map(function (o) { return o.t; }).join('\n'),
          acc: jaccard(drop, correct)
        };
      };
      api.complete = function () { return drop.length > 0; };
    }

    else if (shrine.board === 'dispatch') {
      var assign = new Array(shrine.items.length).fill(null);
      shrine.items.forEach(function (it, i) {
        var row = el('div', 'dispatch-row');
        row.appendChild(pre(it.t));
        var btns = el('div', 'bucket-btns');
        shrine.buckets.forEach(function (bk) {
          var b = el('button', 'bucket'); b.type = 'button'; b.textContent = bk.name;
          b.addEventListener('click', function () {
            if (b.classList.contains('locked')) return;
            assign[i] = bk.id;
            snapshot(btns).forEach( function (c) { c.classList.remove('chosen'); });
            b.classList.add('chosen');
            P.audio.sfx.pick();
            if (onChange) onChange();
          });
          btns.appendChild(b);
        });
        row.appendChild(btns);
        root.appendChild(row);
      });
      api.reveal = function () {
        Array.prototype.forEach.call(root.querySelectorAll('.dispatch-row'), function (row, i) {
          var it = shrine.items[i], ok = assign[i] === it.ans;
          row.classList.add(ok ? 'ok' : 'no');
          var n = el('div', 'inline-note ' + (ok ? 'ok' : 'no'));
          n.appendChild(gloss((ok ? '✓ ' : '✕ ') + it.note));
          row.appendChild(n);
          Array.prototype.forEach.call(row.querySelectorAll('.bucket'), function (b) { b.classList.add('locked'); });
        });
      };
      api.collect = function () {
        var good = 0;
        var lines = shrine.items.map(function (it, i) {
          if (assign[i] === it.ans) good++;
          var bk = shrine.buckets.filter(function (b) { return b.id === assign[i]; })[0];
          return it.t + ' → ' + (bk ? bk.name : '未指派');
        });
        return { text: lines.join('\n'), acc: good / shrine.items.length };
      };
      api.complete = function () { return assign.every(function (a) { return a !== null; }); };
    }

    else if (shrine.board === 'pair') {
      var link = new Array(shrine.left.length).fill(null);
      shrine.left.forEach(function (L, i) {
        var row = el('div', 'dispatch-row');
        row.appendChild(pre(L.t));
        var sel = el('select', 'pair-select');
        sel.appendChild(new Option('— 請選擇 —', ''));
        shrine.right.forEach(function (R, j) { sel.appendChild(new Option(R.t, String(j))); });
        sel.addEventListener('change', function () {
          link[i] = sel.value === '' ? null : parseInt(sel.value, 10);
          P.audio.sfx.pick();
          if (onChange) onChange();
        });
        row.appendChild(sel);
        root.appendChild(row);
      });
      api.reveal = function () {
        Array.prototype.forEach.call(root.querySelectorAll('.dispatch-row'), function (row, i) {
          var ok = link[i] === shrine.answer[i];
          row.classList.add(ok ? 'ok' : 'no');
          var n = el('div', 'inline-note ' + (ok ? 'ok' : 'no'));
          n.appendChild(gloss((ok ? '✓ 正確配對' : '✕ 正解是：' + shrine.right[shrine.answer[i]].t)));
          row.appendChild(n);
          row.querySelector('select').disabled = true;
        });
      };
      api.collect = function () {
        var good = 0;
        var lines = shrine.left.map(function (L, i) {
          if (link[i] === shrine.answer[i]) good++;
          return L.t + ' → ' + (link[i] == null ? '未配對' : shrine.right[link[i]].t);
        });
        return { text: lines.join('\n'), acc: good / shrine.left.length };
      };
      api.complete = function () { return link.every(function (v) { return v !== null; }); };
    }

    else if (shrine.board === 'gauge') {
      var vals = {};
      shrine.knobs.forEach(function (k) {
        var row = el('div', 'knob');
        var head = el('div', 'knob-head');
        head.appendChild(el('span', 'knob-label', k.label));
        head.appendChild(el('code', 'knob-key', k.key));
        row.appendChild(head);
        var btns = el('div', 'knob-opts');
        k.opts.forEach(function (v) {
          var b = el('button', 'knob-opt'); b.type = 'button'; b.textContent = v;
          b.addEventListener('click', function () {
            if (b.classList.contains('locked')) return;
            vals[k.key] = v;
            snapshot(btns).forEach( function (c) { c.classList.remove('chosen'); });
            b.classList.add('chosen');
            P.audio.sfx.pick();
            if (onChange) onChange();
          });
          btns.appendChild(b);
        });
        row.appendChild(btns);
        root.appendChild(row);
      });
      api.reveal = function () {
        Array.prototype.forEach.call(root.querySelectorAll('.knob'), function (row, i) {
          var k = shrine.knobs[i], ok = vals[k.key] === k.answer;
          row.classList.add(ok ? 'ok' : 'no');
          var n = el('div', 'inline-note ' + (ok ? 'ok' : 'no'));
          n.appendChild(gloss((ok ? '✓ ' : '✕ 正解 ' + k.answer + '：') + k.note));
          row.appendChild(n);
          Array.prototype.forEach.call(row.querySelectorAll('.knob-opt'), function (b) { b.classList.add('locked'); });
        });
      };
      api.collect = function () {
        var good = 0;
        var lines = shrine.knobs.map(function (k) {
          if (vals[k.key] === k.answer) good++;
          return k.key + ' = ' + (vals[k.key] == null ? '未設定' : vals[k.key]);
        });
        var text = (shrine.prefix ? shrine.prefix + '\n' : '') + lines.join('\n') + (shrine.tail ? '\n' + shrine.tail : '');
        return { text: text, acc: good / shrine.knobs.length };
      };
      api.complete = function () { return shrine.knobs.every(function (k) { return vals[k.key] != null; }); };
    }

    else { // write
      var ta = el('textarea', 'writer');
      ta.value = shrine.starter || '';
      ta.rows = 12;
      ta.spellcheck = false;
      ta.setAttribute('aria-label', '自由書寫作答區');
      var s = el('div', 'seg');
      s.appendChild(el('div', 'seg-label', '自由書寫（會由離線評分引擎逐條檢核）'));
      s.appendChild(ta);
      if (shrine.hints) {
        var h = el('div', 'hints');
        shrine.hints.forEach(function (x) { h.appendChild(el('span', 'hint-chip', x)); });
        s.appendChild(h);
      }
      var counter = el('div', 'hint-inline', '0 字');
      s.appendChild(counter);
      ta.addEventListener('input', function () {
        counter.textContent = ta.value.replace(/\s/g, '').length + ' 字';
        if (onChange) onChange();
      });
      root.appendChild(s);
      api.focus = function () { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); };
      api.collect = function () { return { text: ta.value, acc: null }; };
      api.complete = function () { return ta.value.replace(/\s/g, '').length >= 30; };
    }

    api.reveal = api.reveal || function () { };
    return api;
  }

  P.boards = { build: build, name: BOARD_NAME };
})(window.TICI = window.TICI || {});
