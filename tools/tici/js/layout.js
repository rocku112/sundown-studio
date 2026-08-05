/* 提詞挈領 · 世界佈局（唯一來源）
 *
 * 島的輪廓、神碑座標、收集品座標都從這裡算出來。
 * 2D 世界、3D 世界與自我測試共用同一份，才不會各算各的。
 */
(function (P) {
  'use strict';

  var L = {};

  L.R_BASE = 250;
  L.SHRINE_REACH = 74;     // 碑的互動半徑
  L.ITEM_REACH = 46;       // 收集品的互動半徑
  L.CLEARANCE = 64;        // 收集品離碑至少這麼遠（互動用「誰近聽誰的」，只要不被蓋住）
  L.ITEM_GAP = 62;         // 收集品彼此的最小間距

  L.regionSeed = function (r) {
    var s = 0;
    for (var i = 0; i < r.id.length; i++) s += r.id.charCodeAt(i);
    return s;
  };

  L.radiusAt = function (r, th) {
    var s = L.regionSeed(r);
    return L.R_BASE * (0.80 + 0.14 * Math.sin(3 * th + s) + 0.09 * Math.sin(5 * th + s * 1.7) + 0.05 * Math.sin(7 * th + s * 0.4));
  };

  L.inRegion = function (r, x, y) {
    var dx = x - r.x, dy = y - r.y, d = Math.hypot(dx, dy);
    if (d > L.R_BASE * 1.25) return false;
    return d <= L.radiusAt(r, Math.atan2(dy, dx));
  };

  /** 極座標 → 世界座標。y 方向壓扁 0.92，島才不會是正圓。 */
  function polar(r, th, radFrac) {
    var R = L.radiusAt(r, th);
    return { x: r.x + Math.cos(th) * R * radFrac, y: r.y + Math.sin(th) * R * radFrac * 0.92 };
  }
  L.polar = polar;

  // ---- 神碑 ---------------------------------------------------------
  var shrineCache = null;
  L.shrines = function () {
    if (shrineCache) return shrineCache;
    shrineCache = [];
    P.REGIONS.forEach(function (r) {
      var list = P.SHRINES.filter(function (s) { return s.region === r.id; });
      var seed = L.regionSeed(r);
      list.forEach(function (s, i) {
        var th = (i / list.length) * Math.PI * 2 + seed * 0.13;
        var p = polar(r, th, s.trial ? 0 : 0.58);
        shrineCache.push({ shrine: s, region: r, th: th, x: p.x, y: p.y });
      });
    });
    return shrineCache;
  };

  // ---- 收集品 -------------------------------------------------------
  // 資料裡寫的角度只是「希望大概放在哪」。真正的位置在這裡解：
  // 沿著角度往兩邊找，直到離所有碑與其他收集品都夠遠為止。
  // 完全決定性——同一份資料每次都算出同一個世界。
  var collectCache = null;
  L.collectibles = function () {
    if (collectCache) return collectCache;
    collectCache = [];
    var shrines = L.shrines();

    (P.COLLECTIBLES || []).forEach(function (c) {
      var r = P.REGIONS.filter(function (x) { return x.id === c.region; })[0];
      if (!r) return;

      // 島心是試煉碑、0.58 環上是教學碑，兩者之間整圈都在互動半徑內，
      // 所以不能只在原地附近微調——要把整片島掃過一遍，
      // 取「合法且離原本意圖最近」的那一點。
      var best = null, bestCost = Infinity;
      for (var rad = 0.20; rad <= 0.95; rad += 0.05) {
        for (var dk = 0; dk < 84; dk++) {
          var th = c.th + (dk === 0 ? 0 : (dk % 2 ? 1 : -1) * Math.ceil(dk / 2) * 0.075);
          var p = polar(r, th, rad);

          var ok = true;
          for (var i = 0; i < shrines.length; i++) {
            if (Math.hypot(shrines[i].x - p.x, shrines[i].y - p.y) < L.CLEARANCE) { ok = false; break; }
          }
          if (!ok) continue;
          for (var j = 0; j < collectCache.length; j++) {
            if (Math.hypot(collectCache[j].x - p.x, collectCache[j].y - p.y) < L.ITEM_GAP) { ok = false; break; }
          }
          if (!ok) continue;

          // 離作者本來想放的位置越近越好；角度的偏離看得比半徑重
          var dth = Math.abs(((th - c.th + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          var cost = dth * 1.6 + Math.abs(rad - c.rad);
          if (cost < bestCost) { bestCost = cost; best = { item: c, region: r, th: th, rad: rad, x: p.x, y: p.y }; }
        }
      }
      // 真的找不到空位就退回原處——寧可重疊也不要憑空消失
      if (!best) {
        var p0 = polar(r, c.th, c.rad);
        best = { item: c, region: r, th: c.th, rad: c.rad, x: p0.x, y: p0.y, crowded: true };
      }
      collectCache.push(best);
    });
    return collectCache;
  };

  L.reset = function () { shrineCache = null; collectCache = null; };

  P.layout = L;
})(window.TICI = window.TICI || {});
