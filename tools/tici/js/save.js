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
    found: {},       // 收集品 id -> true
    how: {},         // shrineId -> { mode:'carve'|'write', flawless, grade }：大師層讀這個
    pos: null,       // 玩家世界座標
    title: false,    // 是否過了標題畫面
    prologue: false, // 是否看過序章
    settings: {
      bgm: true, sfx: true, motion: true, font: 1,
      quality: 'high', perf: false, volume: 0.5,
      answerMode: 'carve'          // carve = 石碑刻印；write = 自由書寫
    }
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

  /** 記錄一次通關。只在分數更高時覆寫。how 記的是「用什麼方式走完」，給大師層看。 */
  function record(shrine, result, how) {
    var prev = state.done[shrine.id];
    if (!prev || result.score > prev.score) {
      if (!prev) state.xp += shrine.xp;
      else state.xp += Math.round(shrine.xp * (result.score - prev.score) / 100);
      state.done[shrine.id] = { score: result.score, grade: result.grade.g, at: Date.now() };
    }
    state.skills[shrine.id] = true;
    if (how) {
      // 大師層只往上記：曾經無瑕刻過、曾經默寫過，就一直算數
      var old = state.how[shrine.id];
      state.how[shrine.id] = {
        mode: how.mode,
        grade: result.grade.g,
        flawless: how.flawless || (old && old.mode === how.mode && old.flawless) || false
      };
    }
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

  P.save = {
    get state() { return state; },
    load: load, flush: save, reset: reset, record: record,
    doneCount: doneCount, regionSealed: regionSealed
  };
})(window.TICI = window.TICI || {});
