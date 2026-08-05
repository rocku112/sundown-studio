/* Promptasy · 存檔：localStorage，無帳號、無後端 */
(function (P) {
  'use strict';

  var KEY = 'tici.save.v1';

  var EMPTY = {
    v: 1,
    xp: 0,
    done: {},        // shrineId -> { score, grade, at }
    skills: {},      // shrineId -> true（知識軟門檻讀這個）
    seen: {},        // 看過教學碑文
    pos: null,       // 玩家世界座標
    prologue: false, // 是否看過序章
    settings: { bgm: true, sfx: true, motion: true, font: 1, quality: 'high', perf: false, volume: 0.5 }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var state = clone(EMPTY);

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || data.v !== 1) return;              // 版本不合就重來，不做半吊子遷移
      Object.keys(EMPTY).forEach(function (k) {
        if (data[k] !== undefined) state[k] = data[k];
      });
      state.settings = Object.assign(clone(EMPTY.settings), state.settings || {});
    } catch (e) { /* 存檔壞了就當新遊戲，不要讓玩家卡在錯誤畫面 */ }
  }

  var pending = null;
  function save() {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
    }, 150);
  }

  function reset() {
    state = clone(EMPTY);
    try { localStorage.removeItem(KEY); } catch (e) { }
  }

  /** 記錄一次通關。只在分數更高時覆寫。 */
  function record(shrine, result) {
    var prev = state.done[shrine.id];
    if (!prev || result.score > prev.score) {
      if (!prev) state.xp += shrine.xp;
      else state.xp += Math.round(shrine.xp * (result.score - prev.score) / 100);
      state.done[shrine.id] = { score: result.score, grade: result.grade.g, at: Date.now() };
    }
    state.skills[shrine.id] = true;
    save();
  }

  function doneCount(regionId) {
    var n = 0;
    P.SHRINES.forEach(function (s) {
      if (regionId && s.region !== regionId) return;
      if (state.done[s.id]) n++;
    });
    return n;
  }

  function regionSealed(regionId) {
    var all = P.SHRINES.filter(function (s) { return s.region === regionId; });
    return all.length > 0 && all.every(function (s) { return state.done[s.id]; });
  }

  var RANKS = [
    { min: 0, name: '過路人' }, { min: 400, name: '執筆者' }, { min: 1000, name: '刻碑生' },
    { min: 1900, name: '碑師' }, { min: 3000, name: '掌律' }, { min: 4400, name: '典守' },
    { min: 6000, name: '溯源者' }, { min: 8000, name: '燈下無眠' }
  ];

  function rank() {
    var r = RANKS[0];
    RANKS.forEach(function (x) { if (state.xp >= x.min) r = x; });
    var i = RANKS.indexOf(r);
    var next = RANKS[i + 1] || null;
    return { name: r.name, next: next, cur: state.xp, floor: r.min };
  }

  P.save = {
    get state() { return state; },
    load: load, flush: save, reset: reset, record: record,
    doneCount: doneCount, regionSealed: regionSealed, rank: rank, RANKS: RANKS
  };
})(window.TICI = window.TICI || {});
