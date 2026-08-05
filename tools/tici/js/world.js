/* Promptasy · 夜間世界：程序生成的碑林群島（Canvas 2D）
 * 沒有外部素材、沒有 CDN、沒有執行期的網路請求。
 */
(function (P) {
  'use strict';

  var W = {};
  var cv, cx, dpr = 1, vw = 0, vh = 0;
  var cam = { x: 0, y: 0, tx: 0, ty: 0, z: 1 };
  var player = { x: 420, y: 1240, vx: 0, vy: 0, face: 1, phase: 0, moving: false };
  var keys = {};
  var stars = [], motes = [];
  var t0 = performance.now(), time = 0;
  var R_BASE = 250;

  // ---- 雜訊 ---------------------------------------------------------
  function hash(n) { var s = Math.sin(n) * 43758.5453123; return s - Math.floor(s); }
  function noise2(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi + yi * 57), b = hash(xi + 1 + yi * 57);
    var c = hash(xi + (yi + 1) * 57), d = hash(xi + 1 + (yi + 1) * 57);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // ---- 地形 ---------------------------------------------------------
  function regionSeed(r) { var s = 0; for (var i = 0; i < r.id.length; i++) s += r.id.charCodeAt(i); return s; }

  function radiusAt(r, th) {
    var s = regionSeed(r);
    return R_BASE * (0.80 + 0.14 * Math.sin(3 * th + s) + 0.09 * Math.sin(5 * th + s * 1.7) + 0.05 * Math.sin(7 * th + s * 0.4));
  }

  function inRegion(r, x, y) {
    var dx = x - r.x, dy = y - r.y, d = Math.hypot(dx, dy);
    if (d > R_BASE * 1.2) return false;
    return d <= radiusAt(r, Math.atan2(dy, dx));
  }

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    var t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  var bridgeSegs = [];
  function buildBridges() {
    bridgeSegs = P.BRIDGES.map(function (pair) {
      var a = W.region(pair[0]), b = W.region(pair[1]);
      return { a: a, b: b, ax: a.x, ay: a.y, bx: b.x, by: b.y };
    });
  }

  function onBridge(x, y) {
    for (var i = 0; i < bridgeSegs.length; i++) {
      var s = bridgeSegs[i];
      if (segDist(x, y, s.ax, s.ay, s.bx, s.by) < 30) return s;
    }
    return null;
  }

  function walkable(x, y) {
    for (var i = 0; i < P.REGIONS.length; i++) if (inRegion(P.REGIONS[i], x, y)) return true;
    return !!onBridge(x, y);
  }

  // ---- 神碑座標 -----------------------------------------------------
  var shrineNodes = [];
  function layoutShrines() {
    shrineNodes = [];
    P.REGIONS.forEach(function (r) {
      var list = P.SHRINES.filter(function (s) { return s.region === r.id; });
      var n = list.length, seed = regionSeed(r);
      list.forEach(function (s, i) {
        var th = (i / n) * Math.PI * 2 + seed * 0.13;
        var rad = s.trial ? 0 : radiusAt(r, th) * 0.58;
        shrineNodes.push({
          shrine: s, region: r,
          x: r.x + Math.cos(th) * rad,
          y: r.y + Math.sin(th) * rad * 0.92
        });
      });
    });
  }

  // ---- 星空與浮塵 ---------------------------------------------------
  function seedSky() {
    stars = [];
    for (var i = 0; i < 460; i++) {
      stars.push({
        x: hash(i * 1.7) * 4200 - 400, y: hash(i * 3.1) * 2600 - 400,
        r: 0.4 + hash(i * 5.3) * 1.5, p: hash(i * 7.7) * 6.28,
        depth: 0.15 + hash(i * 2.9) * 0.45
      });
    }
    motes = [];
    for (var j = 0; j < 90; j++) {
      motes.push({
        x: hash(j * 9.1) * 3200, y: hash(j * 4.3) * 1900,
        r: 0.8 + hash(j * 6.1) * 1.8, p: hash(j * 8.3) * 6.28,
        sp: 6 + hash(j * 2.2) * 14
      });
    }
  }

  // ---- 生命週期 -----------------------------------------------------
  W.region = function (id) {
    for (var i = 0; i < P.REGIONS.length; i++) if (P.REGIONS[i].id === id) return P.REGIONS[i];
    return null;
  };

  W.init = function (canvas) {
    cv = canvas; cx = cv.getContext('2d');
    buildBridges(); layoutShrines(); seedSky();
    var st = P.save.state;
    if (st.pos) { player.x = st.pos.x; player.y = st.pos.y; }
    cam.x = cam.tx = player.x; cam.y = cam.ty = player.y;
    W.resize();
    window.addEventListener('resize', W.resize);
  };

  W.resize = function () {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = cv.clientWidth; vh = cv.clientHeight;
    cv.width = Math.max(1, Math.floor(vw * dpr));
    cv.height = Math.max(1, Math.floor(vh * dpr));
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  W.setKey = function (k, down) { keys[k] = down; };
  W.clearKeys = function () { keys = {}; };

  W.player = player;

  W.regionOf = function (x, y) {
    for (var i = 0; i < P.REGIONS.length; i++) if (inRegion(P.REGIONS[i], x, y)) return P.REGIONS[i];
    return null;
  };

  /** 知識軟門檻：讀的是已收集的技能數，不是等級。 */
  W.regionLocked = function (r) { return P.save.doneCount() < r.need; };

  W.nearestShrine = function () {
    var best = null, bd = 74;
    shrineNodes.forEach(function (n) {
      var d = Math.hypot(n.x - player.x, n.y - player.y);
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  };

  W.warpTo = function (regionId) {
    var r = W.region(regionId);
    if (!r) return;
    player.x = r.x; player.y = r.y + 40; player.vx = player.vy = 0;
    cam.x = player.x; cam.y = player.y;
  };

  W.shrineNodes = function () { return shrineNodes; };

  var blockedMsg = 0, blockedRegion = null;
  W.blockedInfo = function () { return blockedMsg > 0 ? blockedRegion : null; };

  var stepAcc = 0;

  W.update = function (dt, paused) {
    time += dt;
    if (paused) { player.moving = false; return; }

    var ax = 0, ay = 0;
    if (keys.left) ax -= 1;
    if (keys.right) ax += 1;
    if (keys.up) ay -= 1;
    if (keys.down) ay += 1;
    var len = Math.hypot(ax, ay);
    if (len > 0) { ax /= len; ay /= len; }

    var SPD = keys.shift ? 330 : 205;
    player.vx += (ax * SPD - player.vx) * Math.min(1, dt * 12);
    player.vy += (ay * SPD - player.vy) * Math.min(1, dt * 12);

    var nx = player.x + player.vx * dt, ny = player.y + player.vy * dt;

    // 逐軸判定，貼牆時仍可滑行
    var okX = walkable(nx, player.y), okY = walkable(player.x, ny);
    var target = W.regionOf(nx, ny);
    if (target && W.regionLocked(target) && W.regionOf(player.x, player.y) !== target) {
      okX = okY = false; blockedMsg = 1.6; blockedRegion = target;
      P.audio.sfx.gate();
    }
    if (okX) player.x = nx; else player.vx *= -0.2;
    if (okY) player.y = ny; else player.vy *= -0.2;
    if (blockedMsg > 0) blockedMsg -= dt;

    if (ax || ay) player.face = ax >= 0 ? 1 : -1;
    player.moving = len > 0.01 && (Math.abs(player.vx) + Math.abs(player.vy) > 12);
    player.phase += dt * (player.moving ? 9 : 2);

    if (player.moving) {
      stepAcc += dt;
      if (stepAcc > 0.34) { stepAcc = 0; P.audio.sfx.step(); }
    }

    cam.tx = player.x; cam.ty = player.y;
    cam.x += (cam.tx - cam.x) * Math.min(1, dt * 4.5);
    cam.y += (cam.ty - cam.y) * Math.min(1, dt * 4.5);

    P.save.state.pos = { x: Math.round(player.x), y: Math.round(player.y) };
  };

  // ---- 繪製 ---------------------------------------------------------
  function w2s(x, y) { return [(x - cam.x) * cam.z + vw / 2, (y - cam.y) * cam.z + vh / 2]; }

  function drawSky() {
    var g = cx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#050813');
    g.addColorStop(0.55, '#08101f');
    g.addColorStop(1, '#0b1524');
    cx.fillStyle = g; cx.fillRect(0, 0, vw, vh);

    // 極光
    var motion = P.save.state.settings.motion;
    for (var b = 0; b < 3; b++) {
      var hue = 160 + b * 40 + Math.sin(time * 0.08 + b) * 20;
      cx.save();
      cx.globalCompositeOperation = 'lighter';
      cx.globalAlpha = 0.075 + b * 0.018;
      cx.beginPath();
      var baseY = vh * (0.10 + b * 0.09) - cam.y * 0.03;
      cx.moveTo(-40, baseY);
      for (var x = -40; x <= vw + 40; x += 24) {
        var ph = motion ? time * (0.16 + b * 0.05) : 0;
        var y = baseY
          + Math.sin(x * 0.0055 + ph + b) * 42
          + Math.sin(x * 0.0017 - ph * 0.7) * 66;
        cx.lineTo(x, y);
      }
      cx.lineTo(vw + 40, -80); cx.lineTo(-40, -80); cx.closePath();
      var ag = cx.createLinearGradient(0, 0, 0, vh * 0.55);
      ag.addColorStop(0, 'hsla(' + hue + ',80%,60%,0.9)');
      ag.addColorStop(1, 'hsla(' + (hue + 50) + ',80%,45%,0)');
      cx.fillStyle = ag; cx.fill();
      cx.restore();
    }

    // 視差星
    stars.forEach(function (s) {
      var sx = (s.x - cam.x * s.depth) % 4200; if (sx < -100) sx += 4200;
      var sy = (s.y - cam.y * s.depth) % 2600; if (sy < -100) sy += 2600;
      sx = sx % vw; sy = sy % vh;
      var tw = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.6 + s.p));
      cx.globalAlpha = tw * (0.35 + s.depth);
      cx.fillStyle = '#dfe9ff';
      cx.fillRect(sx, sy, s.r, s.r);
    });
    cx.globalAlpha = 1;
  }

  function regionPath(r) {
    cx.beginPath();
    for (var i = 0; i <= 64; i++) {
      var th = (i / 64) * Math.PI * 2;
      var rad = radiusAt(r, th);
      var p = w2s(r.x + Math.cos(th) * rad, r.y + Math.sin(th) * rad * 0.92);
      if (i === 0) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]);
    }
    cx.closePath();
  }

  function drawBridges() {
    bridgeSegs.forEach(function (s) {
      var a = w2s(s.ax, s.ay), b = w2s(s.bx, s.by);
      var locked = W.regionLocked(s.a) || W.regionLocked(s.b);
      cx.save();
      cx.lineCap = 'round';
      cx.strokeStyle = locked ? 'rgba(120,140,170,0.16)' : 'rgba(150,200,255,0.30)';
      cx.lineWidth = 46 * cam.z;
      cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke();
      cx.strokeStyle = locked ? 'rgba(150,170,200,0.20)' : 'rgba(190,230,255,0.55)';
      cx.lineWidth = 2 * cam.z;
      cx.setLineDash([14 * cam.z, 12 * cam.z]);
      cx.lineDashOffset = -time * 22 * cam.z;
      cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke();
      cx.restore();
    });
  }

  function drawRegion(r) {
    var locked = W.regionLocked(r);
    var sealed = P.save.regionSealed(r.id);
    var c = w2s(r.x, r.y);
    var R = R_BASE * cam.z;

    // 光暈
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    var gg = cx.createRadialGradient(c[0], c[1], R * 0.1, c[0], c[1], R * 1.35);
    gg.addColorStop(0, 'hsla(' + r.hue + ',70%,55%,' + (locked ? 0.05 : sealed ? 0.20 : 0.13) + ')');
    gg.addColorStop(1, 'hsla(' + r.hue + ',70%,40%,0)');
    cx.fillStyle = gg;
    cx.beginPath(); cx.arc(c[0], c[1], R * 1.35, 0, 6.284); cx.fill();
    cx.restore();

    // 島體
    regionPath(r);
    var lg = cx.createRadialGradient(c[0], c[1] - R * 0.3, R * 0.05, c[0], c[1], R);
    lg.addColorStop(0, locked ? '#141a26' : 'hsla(' + r.hue + ',26%,20%,1)');
    lg.addColorStop(0.7, locked ? '#0f141d' : 'hsla(' + r.hue + ',24%,14%,1)');
    lg.addColorStop(1, '#0a0f18');
    cx.fillStyle = lg; cx.fill();
    cx.strokeStyle = locked ? 'rgba(130,150,180,0.25)' : 'hsla(' + r.hue + ',80%,70%,0.55)';
    cx.lineWidth = 1.6; cx.stroke();

    // 等高線
    cx.save(); cx.clip();
    cx.globalAlpha = 0.16;
    cx.strokeStyle = 'hsla(' + r.hue + ',70%,75%,1)';
    for (var k = 1; k <= 4; k++) {
      cx.beginPath();
      for (var i = 0; i <= 52; i++) {
        var th = (i / 52) * Math.PI * 2;
        var rad = radiusAt(r, th) * (1 - k * 0.19) * (1 + noise2(Math.cos(th) * 2 + k, Math.sin(th) * 2) * 0.08);
        var p = w2s(r.x + Math.cos(th) * rad, r.y + Math.sin(th) * rad * 0.92);
        if (i === 0) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]);
      }
      cx.closePath(); cx.stroke();
    }
    cx.restore();
    cx.globalAlpha = 1;

    // 地名
    var done = P.save.doneCount(r.id);
    var all = P.SHRINES.filter(function (s) { return s.region === r.id; }).length;
    cx.save();
    cx.textAlign = 'center';
    cx.font = '600 ' + (17 * Math.max(0.75, cam.z)) + 'px "Noto Serif TC", "Songti TC", serif';
    cx.fillStyle = locked ? 'rgba(170,185,205,0.5)' : 'hsla(' + r.hue + ',85%,82%,0.92)';
    cx.shadowColor = 'hsla(' + r.hue + ',90%,60%,0.8)'; cx.shadowBlur = 14;
    cx.fillText(r.name + (sealed ? ' ✦' : ''), c[0], c[1] - R * 0.86);
    cx.shadowBlur = 0;
    cx.font = '400 ' + (11 * Math.max(0.75, cam.z)) + 'px system-ui, sans-serif';
    cx.fillStyle = 'rgba(200,215,235,0.55)';
    cx.fillText(locked ? ('需 ' + r.need + ' 塊碑文 · 目前 ' + P.save.doneCount()) : (done + ' / ' + all), c[0], c[1] - R * 0.86 + 18);
    cx.restore();
  }

  function drawShrine(n) {
    var st = P.save.state.done[n.shrine.id];
    var r = n.region, locked = W.regionLocked(r);
    var p = w2s(n.x, n.y);
    var s = cam.z, trial = n.shrine.trial;
    var h = (trial ? 46 : 32) * s;
    var pulse = 0.5 + 0.5 * Math.sin(time * 1.6 + n.x * 0.01);

    cx.save();
    // 地面光池
    var gg = cx.createRadialGradient(p[0], p[1], 1, p[0], p[1], 46 * s);
    var col = st ? '48,90%,68%' : (locked ? '215,10%,55%' : r.hue + ',85%,70%');
    gg.addColorStop(0, 'hsla(' + col + ',' + (0.30 + pulse * 0.14) + ')');
    gg.addColorStop(1, 'hsla(' + col + ',0)');
    cx.fillStyle = gg;
    cx.beginPath(); cx.ellipse(p[0], p[1], 46 * s, 20 * s, 0, 0, 6.284); cx.fill();

    // 碑體
    cx.translate(p[0], p[1]);
    var w = (trial ? 20 : 14) * s;
    cx.fillStyle = st ? 'rgba(60,52,30,0.95)' : 'rgba(24,32,44,0.95)';
    cx.strokeStyle = 'hsla(' + col + ',' + (locked ? 0.35 : 0.9) + ')';
    cx.lineWidth = 1.4;
    cx.beginPath();
    cx.moveTo(-w / 2, 0); cx.lineTo(-w / 2, -h + w * 0.5);
    cx.quadraticCurveTo(0, -h - w * 0.25, w / 2, -h + w * 0.5);
    cx.lineTo(w / 2, 0); cx.closePath();
    cx.fill();
    cx.shadowColor = 'hsla(' + col + ',0.9)'; cx.shadowBlur = st ? 16 : 9 + pulse * 8;
    cx.stroke(); cx.shadowBlur = 0;

    // 碑面刻痕
    cx.strokeStyle = 'hsla(' + col + ',' + (st ? 0.85 : 0.45) + ')';
    cx.lineWidth = 1;
    for (var i = 1; i <= 3; i++) {
      var yy = -h * (0.25 + i * 0.17);
      cx.beginPath(); cx.moveTo(-w * 0.26, yy); cx.lineTo(w * 0.26, yy); cx.stroke();
    }

    // 評等印記
    if (st) {
      cx.font = '700 ' + (12 * s) + 'px system-ui, sans-serif';
      cx.textAlign = 'center'; cx.fillStyle = 'hsla(48,95%,72%,0.95)';
      cx.shadowColor = 'hsla(48,95%,60%,0.9)'; cx.shadowBlur = 10;
      cx.fillText(st.grade, 0, -h - 8 * s);
      cx.shadowBlur = 0;
    }
    cx.restore();
  }

  function drawMotes() {
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    motes.forEach(function (m) {
      var y = m.y - (P.save.state.settings.motion ? (time * m.sp) % 1900 : 0);
      var p = w2s(m.x, y);
      if (p[0] < -20 || p[0] > vw + 20 || p[1] < -20 || p[1] > vh + 20) return;
      cx.globalAlpha = 0.18 + 0.18 * Math.abs(Math.sin(time * 0.9 + m.p));
      cx.fillStyle = '#bfe4ff';
      cx.beginPath(); cx.arc(p[0], p[1], m.r * cam.z, 0, 6.284); cx.fill();
    });
    cx.restore();
  }

  function drawPlayer() {
    var p = w2s(player.x, player.y), s = cam.z;
    var bob = player.moving ? Math.sin(player.phase) * 2.2 * s : Math.sin(time * 1.4) * 0.9 * s;

    cx.save();
    // 影
    cx.globalAlpha = 0.4; cx.fillStyle = '#000';
    cx.beginPath(); cx.ellipse(p[0], p[1] + 2 * s, 9 * s, 4 * s, 0, 0, 6.284); cx.fill();
    cx.globalAlpha = 1;

    // 提燈光
    cx.globalCompositeOperation = 'lighter';
    var gg = cx.createRadialGradient(p[0], p[1] - 14 * s, 2, p[0], p[1] - 14 * s, 120 * s);
    gg.addColorStop(0, 'rgba(255,214,150,0.34)');
    gg.addColorStop(0.4, 'rgba(255,190,110,0.10)');
    gg.addColorStop(1, 'rgba(255,180,90,0)');
    cx.fillStyle = gg;
    cx.beginPath(); cx.arc(p[0], p[1] - 14 * s, 120 * s, 0, 6.284); cx.fill();
    cx.globalCompositeOperation = 'source-over';

    cx.translate(p[0], p[1] + bob);
    cx.scale(player.face, 1);

    // 斗篷
    cx.fillStyle = '#1b2434';
    cx.strokeStyle = 'rgba(180,215,255,0.75)'; cx.lineWidth = 1.3;
    cx.beginPath();
    cx.moveTo(0, -30 * s);
    cx.quadraticCurveTo(11 * s, -18 * s, 8 * s, 0);
    cx.lineTo(-8 * s, 0);
    cx.quadraticCurveTo(-11 * s, -18 * s, 0, -30 * s);
    cx.closePath(); cx.fill(); cx.stroke();

    // 頭
    cx.fillStyle = '#26334a';
    cx.beginPath(); cx.arc(0, -34 * s, 5.4 * s, 0, 6.284); cx.fill(); cx.stroke();

    // 提燈
    var lx = 10 * s, ly = -16 * s + Math.sin(player.phase * 0.5) * 1.5 * s;
    cx.strokeStyle = 'rgba(255,205,140,0.9)';
    cx.beginPath(); cx.moveTo(6 * s, -22 * s); cx.lineTo(lx, ly); cx.stroke();
    cx.fillStyle = 'rgba(255,222,160,0.98)';
    cx.shadowColor = 'rgba(255,200,120,1)'; cx.shadowBlur = 16 * s;
    cx.beginPath(); cx.arc(lx, ly, 3.2 * s, 0, 6.284); cx.fill();
    cx.shadowBlur = 0;
    cx.restore();
  }

  function drawVignette() {
    var g = cx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    cx.fillStyle = g; cx.fillRect(0, 0, vw, vh);
  }

  W.draw = function () {
    if (!cx) return;
    // 容器尺寸改變不一定會觸發 window resize（面板收合、分割視窗），這裡自己盯著
    if (cv.clientWidth !== vw || cv.clientHeight !== vh) W.resize();
    if (vw < 2 || vh < 2) return;
    cx.clearRect(0, 0, vw, vh);
    drawSky();
    drawBridges();
    P.REGIONS.forEach(drawRegion);
    // 依 y 排序，讓前後遮擋看起來合理
    var drawables = shrineNodes.slice().sort(function (a, b) { return a.y - b.y; });
    var drew = false;
    drawables.forEach(function (n) {
      if (!drew && n.y > player.y) { drawPlayer(); drew = true; }
      drawShrine(n);
    });
    if (!drew) drawPlayer();
    drawMotes();
    drawVignette();
  };

  /** 小地圖：畫進另一張 canvas */
  W.drawMinimap = function (mc) {
    var m = mc.getContext('2d');
    var w = mc.width, h = mc.height;
    m.clearRect(0, 0, w, h);
    m.fillStyle = 'rgba(6,10,20,0.75)'; m.fillRect(0, 0, w, h);
    var pad = 10, minX = 200, maxX = 2800, minY = 300, maxY = 1600;
    function mx(x) { return pad + (x - minX) / (maxX - minX) * (w - pad * 2); }
    function my(y) { return pad + (y - minY) / (maxY - minY) * (h - pad * 2); }

    m.strokeStyle = 'rgba(150,200,255,0.25)'; m.lineWidth = 1;
    P.BRIDGES.forEach(function (pair) {
      var a = W.region(pair[0]), b = W.region(pair[1]);
      m.beginPath(); m.moveTo(mx(a.x), my(a.y)); m.lineTo(mx(b.x), my(b.y)); m.stroke();
    });
    P.REGIONS.forEach(function (r) {
      var locked = W.regionLocked(r), sealed = P.save.regionSealed(r.id);
      m.beginPath(); m.arc(mx(r.x), my(r.y), sealed ? 6 : 4.5, 0, 6.284);
      m.fillStyle = locked ? 'rgba(120,135,160,0.55)' : (sealed ? 'hsla(48,95%,68%,0.95)' : 'hsla(' + r.hue + ',80%,66%,0.9)');
      m.fill();
    });
    m.beginPath(); m.arc(mx(player.x), my(player.y), 3, 0, 6.284);
    m.fillStyle = '#ffd68c'; m.fill();
    m.strokeStyle = 'rgba(255,214,140,0.6)'; m.lineWidth = 1.5;
    m.beginPath(); m.arc(mx(player.x), my(player.y), 7, 0, 6.284); m.stroke();
  };

  P.world = W;
})(window.TICI = window.TICI || {});
