/* Promptasy · 音訊：純 Web Audio 合成，不載入任何外部檔案 */
(function (P) {
  'use strict';

  var ctx = null, master = null, bgmGain = null, sfxGain = null;
  var bgmNodes = [], bgmTimer = null, curTrack = -1;

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    var v = (P.save.state.settings.volume == null ? 0.5 : P.save.state.settings.volume);
    master = ctx.createGain(); master.gain.value = Math.max(0, Math.min(1, v)) * 1.8; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.0; bgmGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    return true;
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  // ---- 音效 ---------------------------------------------------------
  function blip(freq, dur, type, vol, slide) {
    if (!ensure() || !P.save.state.settings.sfx) return;
    resume();
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (!ensure() || !P.save.state.settings.sfx) return;
    resume();
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = ctx.createBufferSource(); s.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = 1.2;
    var g = ctx.createGain(); g.gain.value = vol || 0.15;
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start();
  }

  var SFX = {
    step: function () { noise(0.06, 0.05, 420); },
    hover: function () { blip(880, 0.05, 'sine', 0.10); },
    pick: function () { blip(660, 0.09, 'triangle', 0.16, 990); },
    unpick: function () { blip(440, 0.08, 'triangle', 0.12, 300); },
    open: function () { blip(330, 0.28, 'sine', 0.18, 660); blip(495, 0.32, 'sine', 0.10, 880); },
    close: function () { blip(520, 0.2, 'sine', 0.14, 240); },
    good: function () { [523, 659, 784].forEach(function (f, i) { setTimeout(function () { blip(f, 0.3, 'sine', 0.18); }, i * 90); }); },
    great: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { blip(f, 0.42, 'triangle', 0.17); }, i * 85); }); },
    bad: function () { blip(220, 0.3, 'sawtooth', 0.13, 150); },
    seal: function () { [392, 523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { blip(f, 0.6, 'sine', 0.16); }, i * 110); }); noise(0.9, 0.08, 300); },
    gate: function () { blip(180, 0.5, 'sine', 0.16, 120); noise(0.5, 0.09, 200); }
  };

  // ---- 背景音樂：13 段程序生成的夜曲 --------------------------------
  var SCALES = [
    [0, 2, 3, 5, 7, 8, 10],   // 自然小調
    [0, 2, 4, 7, 9],          // 大調五聲
    [0, 3, 5, 7, 10],         // 小調五聲
    [0, 2, 3, 5, 7, 9, 10],   // 多利安
    [0, 1, 5, 7, 8]           // 幽玄
  ];
  var TRACKS = [
    { root: 55.00, scale: 0, bpm: 52, pad: 'sine', name: '啟程' },
    { root: 58.27, scale: 2, bpm: 56, pad: 'sine', name: '澄光' },
    { root: 61.74, scale: 3, bpm: 50, pad: 'triangle', name: '溯因' },
    { root: 65.41, scale: 1, bpm: 60, pad: 'sine', name: '界標' },
    { root: 69.30, scale: 1, bpm: 64, pad: 'triangle', name: '範式' },
    { root: 73.42, scale: 0, bpm: 58, pad: 'sine', name: '位階' },
    { root: 77.78, scale: 4, bpm: 46, pad: 'sine', name: '思維' },
    { root: 82.41, scale: 3, bpm: 54, pad: 'triangle', name: '長廊' },
    { root: 87.31, scale: 2, bpm: 50, pad: 'sine', name: '引據' },
    { root: 92.50, scale: 1, bpm: 62, pad: 'triangle', name: '形制' },
    { root: 98.00, scale: 0, bpm: 66, pad: 'sine', name: '器械' },
    { root: 103.83, scale: 4, bpm: 48, pad: 'sine', name: '代行' },
    { root: 110.00, scale: 1, bpm: 44, pad: 'sine', name: '碑林夜' }
  ];

  function stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    bgmNodes.forEach(function (n) { try { n.stop(); } catch (e) { } });
    bgmNodes = [];
  }

  function playTrack(idx) {
    if (!ensure()) return;
    idx = ((idx % TRACKS.length) + TRACKS.length) % TRACKS.length;
    if (idx === curTrack && bgmTimer) return;
    curTrack = idx;
    stopBgm();
    if (!P.save.state.settings.bgm) { bgmGain.gain.value = 0; return; }
    resume();

    var t = TRACKS[idx], scale = SCALES[t.scale];
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, ctx.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.5);

    // 綿延的低音襯底
    [1, 1.5, 2].forEach(function (mul, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = t.pad; o.frequency.value = t.root * mul;
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = t.root * 0.012;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start();
      f.type = 'lowpass'; f.frequency.value = 620;
      g.gain.value = 0.22 / (i + 1);
      o.connect(f); f.connect(g); g.connect(bgmGain); o.start();
      bgmNodes.push(o, lfo);
    });

    // 疏落的旋律點
    var beat = 60000 / t.bpm, step = 0;
    bgmTimer = setInterval(function () {
      if (!P.save.state.settings.bgm) return;
      step++;
      if (step % 2 === 1 && Math.random() < 0.45) return;
      var deg = scale[Math.floor(Math.random() * scale.length)];
      var oct = [2, 3, 3, 4][Math.floor(Math.random() * 4)];
      var freq = t.root * Math.pow(2, oct) * Math.pow(2, deg / 12);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.4);
      o.connect(g); g.connect(bgmGain);
      o.start(); o.stop(ctx.currentTime + 2.5);
    }, beat);
  }

  function setBgm(on) {
    P.save.state.settings.bgm = on; P.save.flush();
    if (!ensure()) return;
    if (on) { var i = curTrack; curTrack = -1; playTrack(i < 0 ? 0 : i); }
    else { bgmGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4); stopBgm(); }
  }

  function setVolume(v) {
    P.save.state.settings.volume = v;
    if (!ensure()) return;
    master.gain.value = Math.max(0, Math.min(1, v)) * 1.8;
  }

  P.audio = {
    sfx: SFX, playTrack: playTrack, setBgm: setBgm, setVolume: setVolume, tracks: TRACKS,
    unlock: function () { if (ensure()) resume(); }
  };
})(window.TICI = window.TICI || {});
