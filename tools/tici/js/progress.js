/* 提詞挈領 · 等級、稱號、廠家徽章、大師層
 *
 * 等級只看 XP；稱號要同時滿足三件事：等級、收集到的碑數、精通的土地數。
 * 大師層完全選配——不給 XP、不解鎖任何東西，只記錄你用什麼方式走完。
 */
(function (P) {
  'use strict';

  var G = {};

  // ---- 等級 ---------------------------------------------------------
  function needFor(lv) { return 100 + (lv - 1) * 70; }

  G.level = function () {
    var xp = P.save.state.xp, lv = 1, need = needFor(1);
    while (xp >= need) { xp -= need; lv++; need = needFor(lv); }
    return { lv: lv, into: xp, need: need };
  };

  // ---- 稱號：等級 + 收集碑數 + 精通土地數 -----------------------------
  var RANKS = [
    { name: '初醒的旅人', lv: 1, got: 0, mastered: 0 },
    { name: '刻印學徒', lv: 2, got: 8, mastered: 0 },
    { name: '執燈者', lv: 4, got: 20, mastered: 1 },
    { name: '碑師', lv: 7, got: 34, mastered: 3 },
    { name: '掌律', lv: 10, got: 48, mastered: 5 },
    { name: '典守', lv: 14, got: 60, mastered: 8 },
    { name: '溯源者', lv: 18, got: 70, mastered: 10 },
    { name: '燈下無眠', lv: 22, got: 74, mastered: 12 }
  ];
  G.RANKS = RANKS;

  G.masteredRegions = function () {
    return P.REGIONS.filter(function (r) { return P.save.regionSealed(r.id); }).length;
  };

  G.rank = function () {
    var lv = G.level().lv, got = P.save.doneCount(), m = G.masteredRegions();
    var cur = RANKS[0], idx = 0;
    RANKS.forEach(function (r, i) {
      if (lv >= r.lv && got >= r.got && m >= r.mastered) { cur = r; idx = i; }
    });
    var next = RANKS[idx + 1] || null;
    return {
      name: cur.name, lv: lv, next: next,
      missing: next ? {
        lv: Math.max(0, next.lv - lv),
        got: Math.max(0, next.got - got),
        mastered: Math.max(0, next.mastered - m)
      } : null
    };
  };

  // ---- 廠家徽章 -----------------------------------------------------
  G.vendorMarks = function () {
    var out = {};
    P.VENDORS.forEach(function (v) { out[v.id] = 0; });
    Object.keys(P.save.state.done).forEach(function (id) {
      P.vendorOf(id).forEach(function (v) { if (out[v] != null) out[v]++; });
    });
    return out;
  };

  G.vendorTotals = function () {
    var out = {};
    P.VENDORS.forEach(function (v) { out[v.id] = 0; });
    Object.keys(P.SHRINE_VENDORS).forEach(function (id) {
      P.vendorOf(id).forEach(function (v) { if (out[v] != null) out[v]++; });
    });
    return out;
  };

  /** 每廠集滿 5 個標記就算一個隱藏成就 */
  G.vendorAchievements = function () {
    var m = G.vendorMarks();
    return P.VENDORS.filter(function (v) { return m[v.id] >= 5; }).map(function (v) { return v.name; });
  };

  // ---- 大師層 -------------------------------------------------------
  // 無筆之印：用石碑刻印通關，而且每一段的第一次判斷都對
  // 默寫之印：在自由書寫模式下通關且拿到 S
  // 一區純手：一整片土地全部用自由書寫走完
  G.masterSeals = function () {
    var how = P.save.state.how || {};
    var noPen = 0, byHand = 0;
    Object.keys(how).forEach(function (id) {
      if (how[id].mode === 'carve' && how[id].flawless) noPen++;
      if (how[id].mode === 'write' && how[id].grade === 'S') byHand++;
    });
    var pure = P.REGIONS.filter(function (r) {
      var list = P.SHRINES.filter(function (s) { return s.region === r.id; });
      return list.length > 0 && list.every(function (s) { return how[s.id] && how[s.id].mode === 'write'; });
    }).length;
    return { noPen: noPen, byHand: byHand, pure: pure };
  };

  // ---- 收集品 -------------------------------------------------------
  G.found = function (id) { return !!(P.save.state.found || {})[id]; };
  G.markFound = function (id) {
    if (!P.save.state.found) P.save.state.found = {};
    if (P.save.state.found[id]) return false;
    P.save.state.found[id] = true;
    P.save.flush();
    return true;
  };

  G.foundTotal = function () { return Object.keys(P.save.state.found || {}).length; };

  P.progress = G;
})(window.TICI = window.TICI || {});
