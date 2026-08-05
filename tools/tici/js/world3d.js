/* 提詞挈領 · 夜間世界（three.js 第三人稱 3D）
 *
 * 座標約定：沿用 2D 版的世界平面 (x, y)，在 3D 裡 y 對應到 z、真正的高度是 y。
 * 這樣課綱資料、神碑座標、小地圖、軟門檻判定全部不用動。
 *
 * three.js r169（MIT）放在 vendor/，執行期不連任何外部主機。
 */
(function (P) {
  'use strict';

  // three.js 由 index.html 的 module script 掛上 window，那是 deferred，
  // 所以這裡不能在載入時就抓，要等 init() 才取。
  var THREE;
  var W = {};

  // ---- 世界常數 -----------------------------------------------------
  var R_BASE = 250;          // 島半徑基準
  var DOME = 42;             // 島中心隆起高度
  var BRIDGE_Y = 7;          // 橋面高度
  var VOID_Y = -90;          // 深淵
  var STRIDE = 25;           // 一「步」等於幾個世界單位

  var scene, cam, renderer, cv;
  var dpr = 1, vw = 0, vh = 0;
  var clock = 0;
  var quality = 'high';

  var groundGroup, steleGroup, decoGroup, skyMesh, starPoints, auroraMats = [];
  var playerObj, lantern, moon;

  var player = { x: 420, y: 1240, h: 0, vx: 0, vy: 0, face: 0, phase: 0, moving: false };
  var camCtl = { yaw: Math.PI * 0.25, pitch: 0.30, dist: 165, tDist: 165, skyPeek: 0 };
  var keys = {};
  var dragging = false, dragMoved = 0, lastPtr = null, dragGuard = 0;
  var lastSafe = { x: player.x, y: player.y };   // 最後一個確定站得住的位置

  // ---- 雜訊與地形 ---------------------------------------------------
  function hash(n) { var s = Math.sin(n) * 43758.5453123; return s - Math.floor(s); }
  function noise2(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi + yi * 57), b = hash(xi + 1 + yi * 57);
    var c = hash(xi + (yi + 1) * 57), d = hash(xi + 1 + (yi + 1) * 57);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) {
    return noise2(x, y) * 0.55 + noise2(x * 2.1, y * 2.1) * 0.28 + noise2(x * 4.3, y * 4.3) * 0.17;
  }

  var regionSeed = function (r) { return P.layout.regionSeed(r); };
  var radiusAt = function (r, th) { return P.layout.radiusAt(r, th); };

  function inRegion(r, x, y) {
    var dx = x - r.x, dy = y - r.y, d = Math.hypot(dx, dy);
    if (d > R_BASE * 1.25) return false;
    return d <= radiusAt(r, Math.atan2(dy, dx));
  }

  /** 島上某點的地表高度（僅島內有效） */
  function islandH(r, x, y) {
    var dx = x - r.x, dy = y - r.y;
    var d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    var R = radiusAt(r, th);
    var t = Math.min(1, d / R);
    var dome = Math.pow(Math.cos(t * Math.PI * 0.5), 1.35) * DOME;
    var rough = (fbm(x * 0.011 + regionSeed(r), y * 0.011) - 0.5) * 22 * (1 - t * 0.75);
    return dome + rough;
  }

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    var t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  var bridgeSegs = [];
  function buildBridgeData() {
    bridgeSegs = P.BRIDGES.map(function (pair) {
      var a = W.region(pair[0]), b = W.region(pair[1]);
      return { a: a, b: b, ax: a.x, ay: a.y, bx: b.x, by: b.y };
    });
  }
  function onBridge(x, y) {
    for (var i = 0; i < bridgeSegs.length; i++) {
      if (segDist(x, y, bridgeSegs[i].ax, bridgeSegs[i].ay, bridgeSegs[i].bx, bridgeSegs[i].by) < 30) return bridgeSegs[i];
    }
    return null;
  }
  function walkable(x, y) {
    for (var i = 0; i < P.REGIONS.length; i++) if (inRegion(P.REGIONS[i], x, y)) return true;
    return !!onBridge(x, y);
  }

  /** 任一點的地表高度（島上取地形，橋上取橋面，島與橋交界取較高者） */
  function heightAt(x, y) {
    var best = null;
    for (var i = 0; i < P.REGIONS.length; i++) {
      if (inRegion(P.REGIONS[i], x, y)) { var h = islandH(P.REGIONS[i], x, y); if (best === null || h > best) best = h; }
    }
    if (onBridge(x, y)) { if (best === null || BRIDGE_Y > best) best = BRIDGE_Y; }
    return best === null ? VOID_Y : best;
  }

  // ---- 神碑座標 -----------------------------------------------------
  var shrineNodes = [];
  function layoutShrines() {
    shrineNodes = P.layout.shrines().map(function (n) {
      return { shrine: n.shrine, region: n.region, x: n.x, y: n.y, h: islandH(n.region, n.x, n.y) };
    });
  }

  // ===================================================================
  // 場景建構
  // ===================================================================
  function makeSky() {
    var geo = new THREE.SphereGeometry(2600, 32, 20);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x03060f) }, bottom: { value: new THREE.Color(0x0d1a2c) } },
      vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float vy; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.15, 0.75, vy)), 1.0);' +
        '#include <colorspace_fragment> }'
    });
    skyMesh = new THREE.Mesh(geo, mat);
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);
  }

  function makeStars() {
    var N = quality === 'high' ? 2600 : 900;
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var th = hash(i * 1.7) * Math.PI * 2;
      var ph = Math.acos(1 - hash(i * 3.1) * 1.15);
      var R = 2300;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * R;
      pos[i * 3 + 1] = Math.cos(ph) * R;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * R;
      var w = 0.72 + hash(i * 5.3) * 0.28;
      col[i * 3] = w; col[i * 3 + 1] = w * 0.94; col[i * 3 + 2] = 1.0;
      siz[i] = 3 + hash(i * 7.7) * 9;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    var m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { t: { value: 0 } },
      vertexShader: 'attribute float size; varying vec3 vc; varying float vs; uniform float t;' +
        'void main(){ vc = color; vs = 0.5 + 0.5*sin(t*0.8 + position.x*0.01);' +
        'vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vc; varying float vs;' +
        'void main(){ vec2 d = gl_PointCoord - vec2(0.5); float a = smoothstep(0.5, 0.0, length(d));' +
        'gl_FragColor = vec4(vc, a * (0.35 + 0.65*vs));' +
        '#include <colorspace_fragment> }',
      vertexColors: true
    });
    starPoints = new THREE.Points(g, m);
    starPoints.frustumCulled = false;
    scene.add(starPoints);
  }

  function makeAurora() {
    auroraMats = [];
    if (quality !== 'high') return;
    for (var b = 0; b < 3; b++) {
      var g = new THREE.PlaneGeometry(4200, 900, 48, 1);
      var m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { t: { value: 0 }, hue: { value: 0.42 + b * 0.11 }, amp: { value: 1 } },
        vertexShader: 'varying vec2 vu; uniform float t; void main(){ vu = uv; vec3 p = position;' +
          'p.z += sin(p.x*0.0028 + t*0.35) * 120.0 + sin(p.x*0.0009 - t*0.22) * 220.0;' +
          'gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
        fragmentShader: 'varying vec2 vu; uniform float hue; uniform float amp;' +
          'vec3 h2r(float h){ return clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1., 0., 1.); }' +
          'void main(){ float a = pow(1.0 - vu.y, 2.2) * 0.5 * amp;' +
          'a *= 0.55 + 0.45*sin(vu.x*22.0 + hue*30.0);' +
          'gl_FragColor = vec4(h2r(hue) * 1.1, a);' +
          '#include <colorspace_fragment> }'
      });
      var mesh = new THREE.Mesh(g, m);
      mesh.position.set(1500, 620 + b * 190, -900 - b * 420);
      mesh.frustumCulled = false;
      scene.add(mesh);
      auroraMats.push(m);
    }
  }

  /** 極座標網格：環數 × 扇區數，天然吻合島的輪廓 */
  function makeIsland(r) {
    var SEC = quality === 'high' ? 88 : 48;
    var RING = quality === 'high' ? 26 : 14;
    var CLIFF = 2;                              // 最外兩環往下拉成崖壁
    var verts = [], colors = [], idx = [];

    var base = new THREE.Color().setHSL(r.hue / 360, 0.28, 0.17);
    var top = new THREE.Color().setHSL(r.hue / 360, 0.36, 0.31);
    var cliff = new THREE.Color(0x080d15);
    var locked = W.regionLocked(r);

    // 中心點
    verts.push(0, islandH(r, r.x, r.y), 0);
    var c0 = top.clone(); colors.push(c0.r, c0.g, c0.b);

    for (var ring = 1; ring <= RING + CLIFF; ring++) {
      for (var s = 0; s < SEC; s++) {
        var th = (s / SEC) * Math.PI * 2;
        var R = radiusAt(r, th);
        var t, h, col;
        if (ring <= RING) {
          t = ring / RING;
          var px = r.x + Math.cos(th) * R * t, py = r.y + Math.sin(th) * R * t * 0.92;
          h = islandH(r, px, py);
          col = base.clone().lerp(top, Math.pow(1 - t, 1.6));
          verts.push(Math.cos(th) * R * t, h, Math.sin(th) * R * t * 0.92);
        } else {
          var k = ring - RING;                  // 1..CLIFF
          h = -18 - k * 74;
          col = cliff.clone();
          verts.push(Math.cos(th) * R * (1 + k * 0.012), h, Math.sin(th) * R * 0.92 * (1 + k * 0.012));
        }
        if (locked) col.multiplyScalar(0.55);
        colors.push(col.r, col.g, col.b);
      }
    }

    // 纏繞方向：th 遞增在 XZ 平面上由「上方往下看」是順時針，
    // 所以索引要反過來排，正面才會朝天，不然整片地板會被背面剔除掉。
    // 中心扇形
    for (var s2 = 0; s2 < SEC; s2++) idx.push(0, 1 + (s2 + 1) % SEC, 1 + s2);
    // 環帶
    for (var ring2 = 1; ring2 < RING + CLIFF; ring2++) {
      var a0 = 1 + (ring2 - 1) * SEC, b0 = 1 + ring2 * SEC;
      for (var s3 = 0; s3 < SEC; s3++) {
        var s4 = (s3 + 1) % SEC;
        idx.push(a0 + s3, b0 + s4, b0 + s3);
        idx.push(a0 + s3, a0 + s4, b0 + s4);
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();

    var mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.94, metalness: 0.02, flatShading: quality === 'high'
    }));
    mesh.position.set(r.x, 0, r.y);
    mesh.receiveShadow = quality === 'high';
    mesh.userData.region = r.id;
    return mesh;
  }

  function makeBridge(seg) {
    var dx = seg.bx - seg.ax, dz = seg.by - seg.ay;
    var len = Math.hypot(dx, dz);
    var locked = W.regionLocked(seg.a) || W.regionLocked(seg.b);
    var g = new THREE.BoxGeometry(len, 2.6, 68);
    var m = new THREE.MeshStandardMaterial({
      color: locked ? 0x141a25 : 0x1c2635, roughness: 0.9,
      emissive: new THREE.Color(locked ? 0x0a0e14 : 0x16283f), emissiveIntensity: 0.6
    });
    var mesh = new THREE.Mesh(g, m);
    mesh.position.set((seg.ax + seg.bx) / 2, BRIDGE_Y, (seg.ay + seg.by) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.receiveShadow = quality === 'high';

    var grp = new THREE.Group();
    grp.add(mesh);
    // 護欄光點
    var n = Math.max(4, Math.floor(len / 90));
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      [-1, 1].forEach(function (sgn) {
        var p = new THREE.Mesh(
          new THREE.SphereGeometry(2.6, 6, 5),
          new THREE.MeshBasicMaterial({ color: locked ? 0x3a4658 : 0x9fd4ff })
        );
        var px = seg.ax + dx * t, pz = seg.ay + dz * t;
        var nx = -dz / len, nz = dx / len;
        p.position.set(px + nx * 32 * sgn, BRIDGE_Y + 6, pz + nz * 32 * sgn);
        grp.add(p);
      });
    }
    return grp;
  }

  function makeStele(node) {
    var done = P.save.state.done[node.shrine.id];
    var locked = W.regionLocked(node.region);
    var trial = node.shrine.trial;
    var h = trial ? 46 : 32, w = trial ? 15 : 11;

    var grp = new THREE.Group();
    var col = done ? 0xffd76a : (locked ? 0x64748b : new THREE.Color().setHSL(node.region.hue / 360, 0.8, 0.66).getHex());

    // 碑身：上窄下寬的四稜柱
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.42, w * 0.6, h, 4, 1),
      new THREE.MeshStandardMaterial({
        color: done ? 0x3b3320 : 0x161d29, roughness: 0.82, flatShading: true,
        emissive: new THREE.Color(col), emissiveIntensity: done ? 0.30 : (locked ? 0.06 : 0.18)
      })
    );
    body.position.y = h / 2;
    body.rotation.y = Math.PI / 4;
    body.castShadow = quality === 'high';
    grp.add(body);

    // 碑頂的光
    var cap = new THREE.Mesh(
      new THREE.OctahedronGeometry(trial ? 7 : 5, 0),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: locked ? 0.35 : 0.95 })
    );
    cap.position.y = h + (trial ? 11 : 8);
    grp.add(cap);
    grp.userData.cap = cap;

    // 地面光池
    var pool = new THREE.Mesh(
      new THREE.CircleGeometry(trial ? 42 : 30, 24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: locked ? 0.05 : 0.14, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.6;
    grp.add(pool);
    grp.userData.pool = pool;

    grp.position.set(node.x, node.h, node.y);
    grp.userData.node = node;
    return grp;
  }

  // ---- 走出來的收集：石版、器物、藏起來的地方 -------------------------
  var collectNodes = [];
  function layoutCollectibles() {
    collectNodes = P.layout.collectibles().map(function (n) {
      return { item: n.item, region: n.region, th: n.th, x: n.x, y: n.y, h: islandH(n.region, n.x, n.y) };
    });
  }

  function makeCollectible(node) {
    var c = node.item;
    var got = P.progress.found(c.id);
    var grp = new THREE.Group();
    var tint = c.kind === 'hidden' ? 0xb98cff : (c.kind === 'ins' ? 0x9fd4ff : 0xffc98a);
    var mat = new THREE.MeshStandardMaterial({
      color: 0x1a2231, roughness: 0.85, flatShading: true,
      emissive: new THREE.Color(tint), emissiveIntensity: got ? 0.06 : 0.26
    });
    var glowMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: got ? 0.18 : 0.8 });

    if (c.kind === 'ins') {
      var slab = new THREE.Mesh(new THREE.BoxGeometry(13, 17, 2.6), mat);
      slab.position.y = 8.5; slab.rotation.x = -0.22; slab.rotation.y = c.th;
      slab.castShadow = quality === 'high';
      grp.add(slab);
    } else if (c.kind === 'hidden') {
      var rune = new THREE.Mesh(new THREE.OctahedronGeometry(6, 0), glowMat);
      rune.position.y = 17;
      grp.add(rune);
      grp.userData.spin = rune;
      var pedestal = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 5, 6), mat);
      pedestal.position.y = 2.5;
      grp.add(pedestal);
    } else {
      if (c.shape === 'jar') {
        var jar = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 6.4, 12, 9), mat);
        jar.position.y = 6; jar.castShadow = quality === 'high'; grp.add(jar);
        var lid = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1.6, 9), glowMat);
        lid.position.y = 12.6; grp.add(lid);
      } else if (c.shape === 'brazier') {
        var bowl = new THREE.Mesh(new THREE.CylinderGeometry(7, 4.4, 7, 10), mat);
        bowl.position.y = 6; bowl.castShadow = quality === 'high'; grp.add(bowl);
        var flame = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 6), glowMat);
        flame.position.y = 11.4; grp.add(flame);
        grp.userData.flicker = flame;
      } else if (c.shape === 'chime') {
        var stone = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 0), mat);
        stone.position.y = 8; stone.castShadow = quality === 'high'; grp.add(stone);
        grp.userData.spin = stone;
      } else {
        var wheel = new THREE.Mesh(new THREE.TorusGeometry(6.5, 1.8, 6, 12), mat);
        wheel.position.y = 10; wheel.rotation.y = Math.PI / 2;
        wheel.castShadow = quality === 'high'; grp.add(wheel);
        grp.userData.spin = wheel;
        var post = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 10, 6), mat);
        post.position.y = 5; grp.add(post);
      }
    }

    // 地面微光，讓人看得出「這裡有東西」
    var pool = new THREE.Mesh(
      new THREE.CircleGeometry(c.kind === 'hidden' ? 26 : 16, 18),
      new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: got ? 0.03 : 0.10, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.5;
    grp.add(pool);
    grp.userData.pool = pool;
    grp.userData.mats = [mat, glowMat];
    grp.userData.node = node;
    grp.position.set(node.x, node.h, node.y);
    return grp;
  }

  W.refreshCollectibles = function () {
    if (!decoGroup) return;
    decoGroup.children.forEach(function (g) {
      var got = P.progress.found(g.userData.node.item.id);
      g.userData.mats[0].emissiveIntensity = got ? 0.06 : 0.26;
      g.userData.mats[1].opacity = got ? 0.18 : 0.8;
      g.userData.pool.material.opacity = got ? 0.03 : (g.userData.node.item.kind === 'hidden' ? 0.10 : 0.10);
    });
  };

  W.nearestCollectible = function () {
    var best = null, bd = P.layout.ITEM_REACH;
    collectNodes.forEach(function (n) {
      var d = Math.hypot(n.x - player.x, n.y - player.y);
      if (d < bd) { bd = d; best = n; }
    });
    if (best) best.dist = bd;
    return best;
  };

  W.collectNodes = function () { return collectNodes; };

  function makePlayer() {
    var grp = new THREE.Group();
    var cloak = new THREE.Mesh(
      new THREE.ConeGeometry(7.5, 24, 7, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x1b2434, roughness: 0.85, flatShading: true, side: THREE.DoubleSide })
    );
    cloak.position.y = 12; cloak.castShadow = quality === 'high';
    grp.add(cloak);
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b3a52, roughness: 0.7 })
    );
    head.position.y = 27; head.castShadow = quality === 'high';
    grp.add(head);
    // 提燈
    var orb = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdca0 })
    );
    orb.position.set(8, 16, 2);
    grp.add(orb);
    grp.userData.orb = orb;

    lantern = new THREE.PointLight(0xffc98a, 26000, 460, 2);
    lantern.position.set(8, 18, 2);
    if (quality === 'high') { lantern.castShadow = true; lantern.shadow.mapSize.set(512, 512); }
    grp.add(lantern);
    return grp;
  }

  function buildScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060b16, quality === 'high' ? 0.00085 : 0.0011);

    makeSky();
    makeStars();
    makeAurora();

    scene.add(new THREE.HemisphereLight(0x35507f, 0x070c16, 1.15));
    moon = new THREE.DirectionalLight(0x9fbfe8, 1.35);
    moon.position.set(-800, 1200, -600);
    if (quality === 'high') {
      moon.castShadow = true;
      moon.shadow.mapSize.set(1024, 1024);
      moon.shadow.camera.near = 400; moon.shadow.camera.far = 3200;
      moon.shadow.camera.left = -600; moon.shadow.camera.right = 600;
      moon.shadow.camera.top = 600; moon.shadow.camera.bottom = -600;
    }
    scene.add(moon);

    groundGroup = new THREE.Group();
    P.REGIONS.forEach(function (r) { groundGroup.add(makeIsland(r)); });
    bridgeSegs.forEach(function (s) { groundGroup.add(makeBridge(s)); });
    scene.add(groundGroup);

    // 深淵
    var voidPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshBasicMaterial({ color: 0x03060d })
    );
    voidPlane.rotation.x = -Math.PI / 2;
    voidPlane.position.y = VOID_Y;
    scene.add(voidPlane);

    steleGroup = new THREE.Group();
    shrineNodes.forEach(function (n) { steleGroup.add(makeStele(n)); });
    scene.add(steleGroup);

    decoGroup = new THREE.Group();
    collectNodes.forEach(function (n) { decoGroup.add(makeCollectible(n)); });
    scene.add(decoGroup);

    playerObj = makePlayer();
    scene.add(playerObj);
  }

  function rebuild() {
    if (!scene) return;
    scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); }
    });
    buildScene();
    renderer.shadowMap.enabled = quality === 'high';
  }

  /** 通關／解鎖之後，讓碑與島的顏色跟上 */
  W.refreshVisuals = function () {
    if (!steleGroup) return;
    steleGroup.children.forEach(function (grp, i) {
      var node = grp.userData.node;
      var done = P.save.state.done[node.shrine.id];
      var locked = W.regionLocked(node.region);
      var col = done ? 0xffd76a : (locked ? 0x64748b : new THREE.Color().setHSL(node.region.hue / 360, 0.8, 0.66).getHex());
      var body = grp.children[0];
      body.material.emissive.set(col);
      body.material.emissiveIntensity = done ? 0.30 : (locked ? 0.06 : 0.18);
      body.material.color.set(done ? 0x3b3320 : 0x161d29);
      grp.userData.cap.material.color.set(col);
      grp.userData.cap.material.opacity = locked ? 0.35 : 0.95;
      grp.userData.pool.material.color.set(col);
      grp.userData.pool.material.opacity = locked ? 0.05 : 0.14;
    });
  };

  // ===================================================================
  // 生命週期
  // ===================================================================
  W.region = function (id) {
    for (var i = 0; i < P.REGIONS.length; i++) if (P.REGIONS[i].id === id) return P.REGIONS[i];
    return null;
  };
  W.regionOf = function (x, y) {
    for (var i = 0; i < P.REGIONS.length; i++) if (inRegion(P.REGIONS[i], x, y)) return P.REGIONS[i];
    return null;
  };
  W.regionLocked = function (r) { return P.save.doneCount() < r.need; };
  W.shrineNodes = function () { return shrineNodes; };
  W.player = player;

  W.init = function (canvas) {
    THREE = window.THREE;
    if (!THREE) throw new Error('three.js 尚未載入');
    cv = canvas;
    quality = P.save.state.settings.quality || 'high';
    buildBridgeData();
    layoutShrines();
    layoutCollectibles();

    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: quality === 'high', powerPreference: 'high-performance' });
    renderer.setClearColor(0x050813, 1);
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    cam = new THREE.PerspectiveCamera(58, 1, 1, 5200);

    var st = P.save.state;
    if (st.pos) { player.x = st.pos.x; player.y = st.pos.y; }
    else {
      // 島心站的是試煉碑，出生點往外挪一點，別一開場就踩在最後一關上
      var r0 = P.REGIONS[0];
      player.x = r0.x + 30; player.y = r0.y + 120;
    }
    if (!walkable(player.x, player.y)) {
      // 存檔裡的座標站不住（舊版掉出去過、或資料改了），送回起點
      var rs = P.REGIONS[0];
      player.x = rs.x + 30; player.y = rs.y + 120;
    }
    lastSafe = { x: player.x, y: player.y };
    player.h = heightAt(player.x, player.y);

    buildScene();
    W.resize();
    window.addEventListener('resize', W.resize);
    bindPointer();
  };

  W.setQuality = function (q) {
    if (q === quality) return;
    quality = q;
    P.save.state.settings.quality = q; P.save.flush();
    renderer.dispose();
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: q === 'high', powerPreference: 'high-performance' });
    renderer.setClearColor(0x050813, 1);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rebuild();
    W.resize();
  };
  W.quality = function () { return quality; };

  W.resize = function () {
    if (!cv || !renderer) return;
    dpr = Math.min(quality === 'high' ? 2 : 1.25, window.devicePixelRatio || 1);
    vw = cv.clientWidth || window.innerWidth;
    vh = cv.clientHeight || window.innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    cam.aspect = vw / Math.max(1, vh);
    cam.updateProjectionMatrix();
  };

  function bindPointer() {
    cv.addEventListener('pointerdown', function (e) {
      dragging = true; dragMoved = 0; lastPtr = { x: e.clientX, y: e.clientY };
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!dragging || !lastPtr) return;
      var dx = e.clientX - lastPtr.x, dy = e.clientY - lastPtr.y;
      lastPtr = { x: e.clientX, y: e.clientY };
      dragMoved += Math.abs(dx) + Math.abs(dy);
      camCtl.yaw -= dx * 0.005;
      camCtl.pitch = Math.max(-0.32, Math.min(1.15, camCtl.pitch + dy * 0.004));
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      cv.addEventListener(t, function () {
        if (dragging && dragMoved > 8) dragGuard = 0.25;   // 這是轉鏡頭，不是點擊
        dragging = false; lastPtr = null;
      });
    });
    cv.addEventListener('wheel', function (e) {
      camCtl.tDist = Math.max(70, Math.min(420, camCtl.tDist + Math.sign(e.deltaY) * 22));
      e.preventDefault();
    }, { passive: false });
  }

  W.justDragged = function () { return dragGuard > 0; };
  W.setKey = function (k, down) { keys[k] = down; };
  W.clearKeys = function () { keys = {}; };

  W.warpTo = function (regionId) {
    var r = W.region(regionId);
    if (!r) return;
    player.x = r.x; player.y = r.y + 40;
    player.h = heightAt(player.x, player.y);
    player.vx = player.vy = 0;
    lastSafe = { x: player.x, y: player.y };
  };

  W.nearestShrine = function () {
    var best = null, bd = P.layout.SHRINE_REACH;
    shrineNodes.forEach(function (n) {
      var d = Math.hypot(n.x - player.x, n.y - player.y);
      if (d < bd) { bd = d; best = n; }
    });
    if (best) best.dist = bd;
    return best;
  };

  var blockedT = 0, blockedRegion = null;
  W.blockedInfo = function () { return blockedT > 0 ? blockedRegion : null; };

  /** 羅盤朝向與下一個目標 */
  W.navInfo = function () {
    var heading = P.layout.heading(camCtl.yaw);
    // 先指教學碑；同一境的教學碑全通了，才把人帶去地標下的試煉
    var target = null, bd = Infinity, fallback = null, fd = Infinity;
    shrineNodes.forEach(function (n) {
      if (P.save.state.done[n.shrine.id]) return;
      if (W.regionLocked(n.region)) return;
      var d = Math.hypot(n.x - player.x, n.y - player.y);
      if (n.shrine.trial) { if (d < fd) { fd = d; fallback = n; } return; }
      if (d < bd) { bd = d; target = n; }
    });
    if (!target) { target = fallback; bd = fd; }
    if (!target) {
      // 本區走完了，指向下一片還沒解鎖但差最少的土地
      var cand = P.REGIONS.filter(function (r) { return W.regionLocked(r); })
        .sort(function (a, b) { return a.need - b.need; })[0];
      if (cand) return { heading: heading, name: cand.name, steps: null, locked: true, need: cand.need };
      return { heading: heading, name: null, steps: null };
    }
    return { heading: heading, name: target.shrine.name, steps: Math.max(1, Math.round(bd / STRIDE)), locked: false };
  };

  // ---- 更新 ---------------------------------------------------------
  var stepAcc = 0, fpsAcc = 0, fpsN = 0, fps = 0;

  W.update = function (dt, paused) {
    clock += dt;
    if (dragGuard > 0) dragGuard -= dt;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

    if (paused) { player.moving = false; }
    else {
      // 鏡頭
      if (keys.camLeft) camCtl.yaw += dt * 1.9;
      if (keys.camRight) camCtl.yaw -= dt * 1.9;
      if (keys.camUp) camCtl.pitch = Math.min(1.15, camCtl.pitch + dt * 1.1);
      if (keys.camDown) camCtl.pitch = Math.max(-0.32, camCtl.pitch - dt * 1.1);
      if (keys.zoomIn) camCtl.tDist = Math.max(70, camCtl.tDist - dt * 190);
      if (keys.zoomOut) camCtl.tDist = Math.min(420, camCtl.tDist + dt * 190);
      camCtl.skyPeek += ((keys.sky ? 1 : 0) - camCtl.skyPeek) * Math.min(1, dt * 5);

      // 相對鏡頭的移動。
      // 鏡頭擺在 player - (sin yaw, cos yaw)·dist，所以「看出去的方向」就是
      // (sin yaw, cos yaw)；右手邊是 cross(前方, 上) = (-cos yaw, sin yaw)。
      // 直接從這兩個向量疊出位移，不要另外推公式——之前推錯了一個符號，
      // 整組基底變成鏡像，轉鏡頭之後前後左右就對不上了。
      var b = P.layout.camBasis(camCtl.yaw);
      var ax = 0, ay = 0;
      if (keys.up) { ax += b.fx; ay += b.fy; }
      if (keys.down) { ax -= b.fx; ay -= b.fy; }
      if (keys.right) { ax += b.rx; ay += b.ry; }
      if (keys.left) { ax -= b.rx; ay -= b.ry; }
      var L = Math.hypot(ax, ay);
      if (L > 0) { ax /= L; ay /= L; }

      var SPD = keys.shift ? 330 : 195;
      player.vx += (ax * SPD - player.vx) * Math.min(1, dt * 11);
      player.vy += (ay * SPD - player.vy) * Math.min(1, dt * 11);

      var nx = player.x + player.vx * dt, ny = player.y + player.vy * dt;

      // 門扉：沒集滿碑文就進不去
      var target = W.regionOf(nx, ny);
      var gated = target && W.regionLocked(target) && W.regionOf(player.x, player.y) !== target;
      if (gated) { blockedT = 1.8; blockedRegion = target; P.audio.sfx.gate(); }
      if (blockedT > 0) blockedT -= dt;

      // 移動是相對鏡頭的，所以連按單鍵在世界座標上也是斜走。
      // 只逐軸判定會漏掉「兩軸各自都通過、但合起來出界」的情況——那正是
      // 沿著圓弧邊緣走會掉下去的原因。先驗合併後的位置，不行再退成逐軸滑行。
      var mv = P.layout.resolveMove(player.x, player.y, nx, ny, gated ? target : null);
      player.x = mv.x; player.y = mv.y;
      // 撞到邊界就把那個方向的速度歸零。原本是乘 -0.15 反彈，
      // 貼著島緣滑行時會一直被彈開一點點，走起來會抖。
      if (mv.stopX) player.vx = 0;
      if (mv.stopY) player.vy = 0;

      // 保險：真的落在地面外（壞掉的存檔、傳送落點偏了）就送回上一個安全點
      if (walkable(player.x, player.y)) { lastSafe.x = player.x; lastSafe.y = player.y; }
      else { player.x = lastSafe.x; player.y = lastSafe.y; player.vx = player.vy = 0; }

      player.moving = L > 0.01 && (Math.abs(player.vx) + Math.abs(player.vy)) > 14;
      if (L > 0) player.face = Math.atan2(ax, ay);
      player.phase += dt * (player.moving ? 9 : 1.8);

      if (player.moving) {
        stepAcc += dt;
        if (stepAcc > (keys.shift ? 0.24 : 0.36)) { stepAcc = 0; P.audio.sfx.step(); }
      }
      P.save.state.pos = { x: Math.round(player.x), y: Math.round(player.y) };
    }

    // 貼地
    var gh = heightAt(player.x, player.y);
    player.h += (gh - player.h) * Math.min(1, dt * 14);

    camCtl.dist += (camCtl.tDist - camCtl.dist) * Math.min(1, dt * 6);

    // 角色姿態
    var bob = player.moving ? Math.sin(player.phase) * 1.7 : Math.sin(clock * 1.3) * 0.5;
    playerObj.position.set(player.x, player.h + bob, player.y);
    // 轉身要走短的那一邊：角度差沒有繞回 ±π 的話，
    // 從 +3.1 轉到 -3.1 會整整多轉一圈，提燈會很明顯地甩出去。
    var dAng = player.face - playerObj.rotation.y;
    dAng = ((dAng + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    playerObj.rotation.y += dAng * Math.min(1, dt * 9);
    playerObj.userData.orb.position.y = 16 + Math.sin(clock * 1.7) * 1.4;

    // 鏡頭
    var pitch = camCtl.pitch + camCtl.skyPeek * 0.95;
    var cb = P.layout.camBasis(camCtl.yaw);          // 和 WASD 用同一組基底
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var eye = new THREE.Vector3(
      player.x - cb.fx * cp * camCtl.dist,           // 鏡頭退到「前方」的反向
      player.h + 26 + sp * camCtl.dist,
      player.y - cb.fy * cp * camCtl.dist
    );
    // 別讓鏡頭鑽進地裡
    var minY = heightAt(eye.x, eye.z) + 14;
    if (eye.y < minY) eye.y = minY;
    cam.position.copy(eye);
    cam.lookAt(player.x, player.h + 26 - camCtl.skyPeek * 40, player.y);

    if (skyMesh) skyMesh.position.set(cam.position.x, 0, cam.position.z);
    if (starPoints) { starPoints.position.set(cam.position.x, 0, cam.position.z); starPoints.material.uniforms.t.value = clock; }
    auroraMats.forEach(function (m) { m.uniforms.t.value = clock; });

    // 器物：轉的轉、閃的閃
    decoGroup.children.forEach(function (g, i) {
      if (g.userData.spin) g.userData.spin.rotation.y += dt * 0.55;
      if (g.userData.flicker) {
        var f = 1 + Math.sin(clock * 7 + i) * 0.11 + Math.sin(clock * 3.3 + i * 2) * 0.07;
        g.userData.flicker.scale.setScalar(f);
      }
    });

    // 碑頂旋轉與呼吸
    steleGroup.children.forEach(function (g, i) {
      var cap = g.userData.cap;
      cap.rotation.y += dt * 0.9;
      cap.position.y = (g.userData.node.shrine.trial ? 57 : 40) + Math.sin(clock * 1.5 + i) * 2.2;
    });
  };

  W.draw = function () {
    if (!renderer) return;
    if (cv.clientWidth !== vw || cv.clientHeight !== vh) W.resize();
    if (vw < 2 || vh < 2) return;
    renderer.render(scene, cam);
  };

  W.stats = function () {
    var info = renderer ? renderer.info : null;
    return {
      fps: fps,
      calls: info ? info.render.calls : 0,
      tris: info ? info.render.triangles : 0,
      quality: quality,
      gpu: (function () {
        try {
          var gl = renderer.getContext();
          var d = gl.getExtension('WEBGL_debug_renderer_info');
          return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'WebGL';
        } catch (e) { return 'WebGL'; }
      })()
    };
  };

  // ---- 小地圖（沿用 2D 版）------------------------------------------
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
    // 玩家與視錐
    var px = mx(player.x), py = my(player.y);
    m.save();
    m.translate(px, py);
    // 小地圖的 x/y 直接對應世界 x/y，所以視錐的畫布角度就是前方向量的角度
    var fb = P.layout.camBasis(camCtl.yaw);
    m.rotate(Math.atan2(fb.fy, fb.fx));
    m.beginPath(); m.moveTo(0, 0); m.arc(0, 0, 18, -0.5, 0.5); m.closePath();
    m.fillStyle = 'rgba(255,214,140,0.18)'; m.fill();
    m.restore();
    m.beginPath(); m.arc(px, py, 3, 0, 6.284);
    m.fillStyle = '#ffd68c'; m.fill();
  };

  // 除錯用：讓外部拿得到場景圖（正式玩法不會用到）
  W.debug = function () { return { scene: scene, cam: cam, renderer: renderer, groundGroup: groundGroup, steleGroup: steleGroup, camCtl: camCtl, heightAt: heightAt }; };

  P.world3d = W;
})(window.TICI = window.TICI || {});
