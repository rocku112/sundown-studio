/* 提詞挈領 · 世界佈局（唯一來源）
 *
 * 島的輪廓、神碑座標、收集品座標都從這裡算出來。
 * 2D 世界、3D 世界與自我測試共用同一份，才不會各算各的。
 */
(function (P) {
  'use strict';

  var L = {};

  L.R_BASE = 250;
  L.SHRINE_REACH = 46;     // 碑的互動半徑（跟器物同級，站近一點才觸發）
  L.ITEM_REACH = 46;       // 收集品的互動半徑
  L.CLEARANCE = 52;        // 收集品離碑至少這麼遠（互動用「誰近聽誰的」，只要不被蓋住）
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
  // 一境要放十一塊教學碑加一場試煉。固定圓環擺不下——互動半徑 74 需要的間距，
  // 島的面積根本不夠。改成兩件事：互動半徑收到 46（跟器物一樣，站近一點才觸發，
  // 反而更明確），位置用掃描自動排，內外交錯當作起始意圖。
  L.RING_OUTER = 0.74;
  L.RING_INNER = 0.44;
  L.SHRINE_GAP = 58;       // 神碑彼此的最小間距

  var shrineCache = null;
  L.shrines = function () {
    if (shrineCache) return shrineCache;
    shrineCache = [];

    P.REGIONS.forEach(function (r) {
      var list = P.SHRINES.filter(function (s) { return s.region === r.id; });
      var seed = L.regionSeed(r);
      var teach = list.filter(function (s) { return !s.trial; });
      var placed = [];

      // 試煉先放在島心當地標
      list.filter(function (s) { return s.trial; }).forEach(function (s) {
        var p = polar(r, seed * 0.13, 0);
        var node = { shrine: s, region: r, th: seed * 0.13, rad: 0, x: p.x, y: p.y };
        placed.push(node); shrineCache.push(node);
      });

      teach.forEach(function (s, i) {
        var wantTh = (i / Math.max(1, teach.length)) * Math.PI * 2 + seed * 0.13;
        var wantRad = i % 2 === 0 ? L.RING_OUTER : L.RING_INNER;

        var best = null, bestCost = Infinity;
        for (var rad = 0.30; rad <= 0.95; rad += 0.04) {
          for (var dk = 0; dk < 70; dk++) {
            var th = wantTh + (dk === 0 ? 0 : (dk % 2 ? 1 : -1) * Math.ceil(dk / 2) * 0.06);
            var p = polar(r, th, rad);
            var ok = true;
            for (var j = 0; j < placed.length; j++) {
              if (Math.hypot(placed[j].x - p.x, placed[j].y - p.y) < L.SHRINE_GAP) { ok = false; break; }
            }
            if (!ok) continue;
            var dth = Math.abs(((th - wantTh + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            var cost = dth * 1.5 + Math.abs(rad - wantRad);
            if (cost < bestCost) { bestCost = cost; best = { shrine: s, region: r, th: th, rad: rad, x: p.x, y: p.y }; }
          }
        }
        if (!best) {
          var p0 = polar(r, wantTh, wantRad);
          best = { shrine: s, region: r, th: wantTh, rad: wantRad, x: p0.x, y: p0.y, crowded: true };
        }
        placed.push(best); shrineCache.push(best);
      });
    });
    return shrineCache;
  };

  /** 技巧編號：由所屬境的前綴加序號推出來，不用在每一關手寫。 */
  L.skillId = function (shrine) {
    var r = P.REGIONS.filter(function (x) { return x.id === shrine.region; })[0];
    if (!r) return shrine.id;
    if (shrine.trial) return r.sid + '-trial';
    var teach = P.SHRINES.filter(function (s) { return s.region === shrine.region && !s.trial; });
    var n = teach.indexOf(shrine) + 1;
    return r.sid + '-' + (n < 10 ? '0' + n : n);
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

  // ---- 鏡頭基底 -----------------------------------------------------
  /**
   * 給定鏡頭水平角，回傳地面上的「前方」與「右方」單位向量。
   *
   * 鏡頭擺放、WASD 位移、羅盤方位、小地圖視錐全部只能從這裡拿方向。
   * 之前這四處各推導一次，其中一處符號推錯，整組基底就變成鏡像——
   * 走起來前後左右會隨著鏡頭角度亂掉。合成一個來源之後就不可能對不上。
   *
   * 座標：世界平面 (x, y)，y 對應 three.js 的 z。北定為 -y。
   */
  L.camBasis = function (yaw) {
    var fx = Math.sin(yaw), fy = Math.cos(yaw);
    return { fx: fx, fy: fy, rx: -fy, ry: fx };   // right = cross(forward, up)
  };

  /** 鏡頭前方對應的羅盤方位（度，從北順時針） */
  L.heading = function (yaw) {
    var b = L.camBasis(yaw);
    return (Math.atan2(b.fx, -b.fy) * 180 / Math.PI + 360) % 360;
  };

  // ---- 可走區域與移動解算 -------------------------------------------
  L.BRIDGE_HALF = 30;

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    var t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  L.onBridge = function (x, y) {
    for (var i = 0; i < P.BRIDGES.length; i++) {
      var a = null, b = null;
      for (var k = 0; k < P.REGIONS.length; k++) {
        if (P.REGIONS[k].id === P.BRIDGES[i][0]) a = P.REGIONS[k];
        if (P.REGIONS[k].id === P.BRIDGES[i][1]) b = P.REGIONS[k];
      }
      if (a && b && segDist(x, y, a.x, a.y, b.x, b.y) < L.BRIDGE_HALF) return true;
    }
    return false;
  };

  L.walkable = function (x, y) {
    for (var i = 0; i < P.REGIONS.length; i++) if (L.inRegion(P.REGIONS[i], x, y)) return true;
    return L.onBridge(x, y);
  };

  L.regionOf = function (x, y) {
    for (var i = 0; i < P.REGIONS.length; i++) if (L.inRegion(P.REGIONS[i], x, y)) return P.REGIONS[i];
    return null;
  };

  /**
   * 解算一次移動。
   *
   * 移動是相對鏡頭的，所以連按單鍵在世界座標上也是斜走。若只逐軸判定，
   * 會漏掉「兩軸各自都通過、但合起來出界」的情況——沿著島緣走就會掉下去。
   * 這裡先驗合併後的位置，不行才退成逐軸滑行，兩者都不行就停住。
   *
   * @param {object} blocked 這一輪被門扉擋住的境（可為 null）
   * @returns {{x,y,stopX,stopY}}
   */
  L.resolveMove = function (px, py, nx, ny, blocked) {
    function canGo(x, y) {
      if (!L.walkable(x, y)) return false;
      if (blocked && L.regionOf(x, y) === blocked) return false;
      return true;
    }
    if (canGo(nx, ny)) return { x: nx, y: ny, stopX: false, stopY: false };
    if (canGo(nx, py)) return { x: nx, y: py, stopX: false, stopY: true };
    if (canGo(px, ny)) return { x: px, y: ny, stopX: true, stopY: false };
    return { x: px, y: py, stopX: true, stopY: true };
  };

  L.reset = function () { shrineCache = null; collectCache = null; };

  P.layout = L;
})(window.TICI = window.TICI || {});
