/* 暮卜先知 · 核心天文引擎
 * 儒略日 / 太陽黃經 / 24節氣 / 新月 / 農曆
 * 演算法依據 Jean Meeus《Astronomical Algorithms》，全部前端自算，零外部依賴。
 * 時區固定 UTC+8（台灣）。
 */
const Astro = (() => {
  const RAD = Math.PI / 180;
  const TZ = 8 / 24; // UTC+8
  // VSOP87D 精簡係數＋冥王星表（瀏覽器為全域 script、Node 為 require）
  const _EPH = (typeof VSOP87D === 'undefined' && typeof require !== 'undefined') ? require('../data/vsop87d.js') : null;
  const VSOP = (typeof VSOP87D !== 'undefined') ? VSOP87D : (_EPH ? _EPH.VSOP87D : null);
  const PLUTO_T = (typeof PLUTO_T37 !== 'undefined') ? PLUTO_T37 : (_EPH ? _EPH.PLUTO_T37 : null);

  // ---------- 儒略日 ----------
  // 公曆 → JD（不含時區概念，輸入什麼時刻就是什麼時刻）
  function toJD(y, m, d, hh = 0, mm = 0, ss = 0) {
    let day = d + hh / 24 + mm / 1440 + ss / 86400;
    if (m <= 2) { y -= 1; m += 12; }
    const a = Math.floor(y / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
  }

  // JD → 公曆 {y, m, d, hh, mm, ss}
  function fromJD(jd) {
    const z = Math.floor(jd + 0.5);
    const f = jd + 0.5 - z;
    let a = z;
    if (z >= 2299161) {
      const alpha = Math.floor((z - 1867216.25) / 36524.25);
      a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    const b = a + 1524;
    const c = Math.floor((b - 122.1) / 365.25);
    const dd = Math.floor(365.25 * c);
    const e = Math.floor((b - dd) / 30.6001);
    const dayF = b - dd - Math.floor(30.6001 * e) + f;
    const d = Math.floor(dayF);
    const m = e < 14 ? e - 1 : e - 13;
    const y = m > 2 ? c - 4716 : c - 4715;
    let secs = Math.round((dayF - d) * 86400);
    let hh = Math.floor(secs / 3600); secs -= hh * 3600;
    let mm = Math.floor(secs / 60); secs -= mm * 60;
    return { y, m, d, hh, mm, ss: secs };
  }

  // ΔT（TT－UT，秒）：Espenak & Meeus 分段多項式（1800–2150 適用範圍）
  function deltaT(y) {
    let t, dt;
    if (y >= 2050) { t = (y - 1820) / 100; dt = -20 + 32 * t * t - 0.5628 * (2150 - y); }
    else if (y >= 2005) { t = y - 2000; dt = 62.92 + 0.32217 * t + 0.005589 * t * t; }
    else if (y >= 1986) { t = y - 2000; dt = 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * t * t * t * t + 0.00002373599 * t * t * t * t * t; }
    else if (y >= 1961) { t = y - 1975; dt = 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
    else if (y >= 1941) { t = y - 1950; dt = 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; }
    else if (y >= 1920) { t = y - 1920; dt = 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t; }
    else if (y >= 1900) { t = y - 1900; dt = -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t; }
    else if (y >= 1860) { t = y - 1860; dt = 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t * t * t - 0.0004473624 * t * t * t * t + t * t * t * t * t / 233174; }
    else { t = y - 1800; dt = 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t * t * t - 0.00037436 * t * t * t * t + 0.0000121272 * t * t * t * t * t - 0.0000001699 * t * t * t * t * t * t + 0.000000000875 * t * t * t * t * t * t * t; }
    return dt;
  }

  // TT 時標的 JD → 台灣本地時 JD
  function ttToLocal(jde) {
    const { y } = fromJD(jde);
    return jde - deltaT(y) / 86400 + TZ;
  }
  // 本地時 JD → TT
  function localToTT(jdLocal) {
    const { y } = fromJD(jdLocal);
    return jdLocal - TZ + deltaT(y) / 86400;
  }

  // 本地 JD → 「本地日序號」（同一天同號，換日於 00:00）
  function localDayNum(jdLocal) { return Math.floor(jdLocal + 0.5); }

  const norm360 = (x) => ((x % 360) + 360) % 360;

  // ---------- 太陽視黃經（Meeus 低精度，誤差 ~0.01°） ----------
  // 太陽地心視黃經（度）：走 VSOP87D（地球日心＋180°＋光行差＋章動），精度 ~2″
  // 節氣／立春以此為準；VSOP 資料缺席時退回 Meeus Ch.25 低精度式（~36″）
  function sunLongitude(jde) {
    if (VSOP && VSOP.earth) return _vsopGeoLon('sun', jde);
    const T = (jde - 2451545.0) / 36525;
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * RAD;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
      + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
      + 0.000289 * Math.sin(3 * M);
    const omega = (125.04 - 1934.136 * T) * RAD;
    return norm360(L0 + C - 0.00569 - 0.00478 * Math.sin(omega));
  }

  // 求太陽到達指定黃經的時刻（TT JD），jdGuess 為初估值
  function solarLongitudeTime(targetDeg, jdGuess) {
    let jd = jdGuess;
    for (let i = 0; i < 12; i++) {
      let diff = norm360(targetDeg - sunLongitude(jd));
      if (diff > 180) diff -= 360;
      jd += diff / 0.985647; // 太陽每日約行 0.9856°
      if (Math.abs(diff) < 1e-7) break;
    }
    return jd;
  }

  // ---------- 24 節氣 ----------
  // 索引 0=小寒(285°) 1=大寒 2=立春(315°) 3=雨水 ... 23=冬至(270°)
  const TERM_NAMES = ['小寒', '大寒', '立春', '雨水', '驚蟄', '春分', '清明', '穀雨',
    '立夏', '小滿', '芒種', '夏至', '小暑', '大暑', '立秋', '處暑',
    '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

  // 公曆 year 年的第 k 個節氣（0-23），回傳本地時 JD
  function solarTerm(year, k) {
    const targetDeg = norm360(285 + k * 15);
    // 小寒約在 1/5，之後每節氣約 +15.2 天
    const guess = toJD(year, 1, 5) + k * 15.218;
    return ttToLocal(solarLongitudeTime(targetDeg, guess));
  }

  // 該年全部 24 節氣：[{name, k, jd(本地), date:{y,m,d,hh,mm}}]
  function solarTermsOfYear(year) {
    const out = [];
    for (let k = 0; k < 24; k++) {
      const jd = solarTerm(year, k);
      out.push({ name: TERM_NAMES[k], k, jd, date: fromJD(jd) });
    }
    return out;
  }

  // ---------- 新月（Meeus Ch.49） ----------
  // k 為自 2000-01-06 起的朔望月序號，回傳 TT JD
  function newMoonTT(k) {
    const T = k / 1236.85;
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const M = (2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3) * RAD;
    const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * RAD;
    const F = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * RAD;
    const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * RAD;
    let corr =
      -0.40720 * Math.sin(Mp)
      + 0.17241 * E * Math.sin(M)
      + 0.01608 * Math.sin(2 * Mp)
      + 0.01039 * Math.sin(2 * F)
      + 0.00739 * E * Math.sin(Mp - M)
      - 0.00514 * E * Math.sin(Mp + M)
      + 0.00208 * E * E * Math.sin(2 * M)
      - 0.00111 * Math.sin(Mp - 2 * F)
      - 0.00057 * Math.sin(Mp + 2 * F)
      + 0.00056 * E * Math.sin(2 * Mp + M)
      - 0.00042 * Math.sin(3 * Mp)
      + 0.00042 * E * Math.sin(M + 2 * F)
      + 0.00038 * E * Math.sin(M - 2 * F)
      - 0.00024 * E * Math.sin(2 * Mp - M)
      - 0.00017 * Math.sin(Om)
      - 0.00007 * Math.sin(Mp + 2 * M)
      + 0.00004 * Math.sin(2 * Mp - 2 * F)
      + 0.00004 * Math.sin(3 * M)
      + 0.00003 * Math.sin(Mp + M - 2 * F)
      + 0.00003 * Math.sin(2 * Mp + 2 * F)
      - 0.00003 * Math.sin(Mp + M + 2 * F)
      + 0.00003 * Math.sin(Mp - M + 2 * F)
      - 0.00002 * Math.sin(Mp - M - 2 * F)
      - 0.00002 * Math.sin(3 * Mp + M)
      + 0.00002 * Math.sin(4 * Mp);
    // 行星攝動附加項
    const A1 = (299.77 + 0.107408 * k - 0.009173 * T2) * RAD;
    const A2 = (251.88 + 0.016321 * k) * RAD;
    const A3 = (251.83 + 26.651886 * k) * RAD;
    const A4 = (349.42 + 36.412478 * k) * RAD;
    const A5 = (84.66 + 18.206239 * k) * RAD;
    const A6 = (141.74 + 53.303771 * k) * RAD;
    const A7 = (207.14 + 2.453732 * k) * RAD;
    const A8 = (154.84 + 7.306860 * k) * RAD;
    const A9 = (34.52 + 27.261239 * k) * RAD;
    const A10 = (207.19 + 0.121824 * k) * RAD;
    const A11 = (291.34 + 1.844379 * k) * RAD;
    const A12 = (161.72 + 24.198154 * k) * RAD;
    const A13 = (239.56 + 25.513099 * k) * RAD;
    const A14 = (331.55 + 3.592518 * k) * RAD;
    corr += 0.000325 * Math.sin(A1) + 0.000165 * Math.sin(A2) + 0.000164 * Math.sin(A3)
      + 0.000126 * Math.sin(A4) + 0.000110 * Math.sin(A5) + 0.000062 * Math.sin(A6)
      + 0.000060 * Math.sin(A7) + 0.000056 * Math.sin(A8) + 0.000047 * Math.sin(A9)
      + 0.000042 * Math.sin(A10) + 0.000040 * Math.sin(A11) + 0.000037 * Math.sin(A12)
      + 0.000035 * Math.sin(A13) + 0.000023 * Math.sin(A14);
    return jde + corr;
  }
  // 新月（本地時 JD）
  function newMoonLocal(k) { return ttToLocal(newMoonTT(k)); }

  // 找出「本地日序號 ≤ dayNum」的最後一個新月的 k 值
  function newMoonKBefore(jdLocal) {
    const { y, m } = fromJD(jdLocal);
    let k = Math.floor((y + (m - 0.5) / 12 - 2000) * 12.3685) + 2;
    while (localDayNum(newMoonLocal(k)) > localDayNum(jdLocal)) k--;
    while (localDayNum(newMoonLocal(k + 1)) <= localDayNum(jdLocal)) k++;
    return k;
  }

  // ---------- 農曆 ----------
  // 建立涵蓋「gy-1 年冬至 → gy 年冬至」的農曆月表
  // 回傳 [{k, startDay(本地日序), month(1-12), isLeap, lunarYear}]
  function lunarMonthsBetween(gy) {
    const ws1 = solarTerm(gy - 1, 23); // 前一年冬至（本地 JD）
    const ws2 = solarTerm(gy, 23);     // 該年冬至
    const ws1Day = localDayNum(ws1), ws2Day = localDayNum(ws2);

    // 含前一年冬至的那個農曆月＝十一月，找它的月首新月
    let k0 = newMoonKBefore(ws1);
    // 收集到含 ws2 的月份為止
    const months = [];
    let k = k0;
    while (true) {
      const start = localDayNum(newMoonLocal(k));
      const next = localDayNum(newMoonLocal(k + 1));
      months.push({ k, startDay: start, nextDay: next });
      if (start <= ws2Day && ws2Day < next) break;
      k++;
      if (months.length > 15) break; // 保險
    }

    // months[0] 是十一月；若中間共 13 個月 → 有閏月
    const count = months.length; // 從十一月到次年十一月（含兩端）
    let leapAssigned = false;
    if (count === 14) {
      // 找第一個「無中氣」的月（中氣＝黃經 270°+30n，即偶數索引節氣：冬至/大寒/雨水…）
      for (let i = 1; i < months.length; i++) {
        const m0 = months[i];
        if (!hasZhongqi(m0.startDay, m0.nextDay)) {
          m0.isLeap = true;
          leapAssigned = true;
          break;
        }
      }
    }
    // 編月號：months[0] = 11
    let num = 11;
    for (const mo of months) {
      if (mo.isLeap) { mo.month = num - 1 === 0 ? 12 : ((num - 2 + 12) % 12) + 1; continue; }
      mo.month = ((num - 1) % 12) + 1;
      num++;
    }
    // 修正閏月月號＝前一個月的月號
    for (let i = 1; i < months.length; i++) {
      if (months[i].isLeap) months[i].month = months[i - 1].month;
    }
    // 農曆年歸屬：正月起算新年
    let ly = gy - 1;
    for (const mo of months) {
      if (mo.month === 1 && !mo.isLeap) ly = gy;
      mo.lunarYear = mo.month >= 11 && ly === gy - 1 ? gy - 1 : ly;
    }
    // 上面歸屬邏輯簡化：十一月、十二月屬 gy-1，正月起屬 gy
    let seenNewYear = false;
    for (const mo of months) {
      if (mo.month === 1 && !mo.isLeap) seenNewYear = true;
      mo.lunarYear = seenNewYear ? gy : gy - 1;
    }
    return months;
  }

  // 判斷 [startDay, nextDay) 期間是否含中氣（太陽黃經為 30° 倍數）
  function hasZhongqi(startDay, nextDay) {
    // 該期間任一天太陽跨越 30° 倍數即含中氣
    // 直接算期間首尾的太陽黃經（取當地正午）
    const jd1 = localToTT(startDay - 0.5); // startDay 當天 00:00 本地 → TT
    const jd2 = localToTT(nextDay - 0.5);
    const l1 = sunLongitude(jd1), l2 = sunLongitude(jd2);
    const span = norm360(l2 - l1);
    // 逐一檢查 12 個中氣角度（30° 倍數）是否落在期間內
    for (let a = 0; a < 360; a += 30) {
      const d = norm360(a - l1);
      if (d < span) return true;
    }
    return false;
  }

  const LUNAR_MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const LUNAR_DAY_NAMES = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

  const _lunarCache = {};
  function _monthsCached(gy) {
    if (!_lunarCache[gy]) _lunarCache[gy] = lunarMonthsBetween(gy);
    return _lunarCache[gy];
  }

  // 公曆 → 農曆 {lunarYear, month, day, isLeap, monthName, dayName, monthDays}
  function toLunar(y, m, d) {
    const dayNum = localDayNum(toJD(y, m, d, 12)); // 當天正午避免邊界
    // 該日期可能落在 y 或 y+1 的月表範圍
    let months = _monthsCached(y);
    if (dayNum >= months[months.length - 1].nextDay) months = _monthsCached(y + 1);
    else if (dayNum < months[0].startDay) months = _monthsCached(y - 1);
    for (const mo of months) {
      if (dayNum >= mo.startDay && dayNum < mo.nextDay) {
        const day = dayNum - mo.startDay + 1;
        return {
          lunarYear: mo.lunarYear,
          month: mo.month,
          day,
          isLeap: !!mo.isLeap,
          monthName: (mo.isLeap ? '閏' : '') + LUNAR_MONTH_NAMES[mo.month - 1],
          dayName: LUNAR_DAY_NAMES[day - 1],
          monthDays: mo.nextDay - mo.startDay
        };
      }
    }
    return null;
  }

  // ---------- 月相 ----------
  function moonPhase(y, m, d) {
    const jd = localToTT(toJD(y, m, d, 12));
    const T = (jd - 2451545.0) / 36525;
    const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T) ; // 月日距角（平）
    const phase = D / 360; // 0=朔 0.5=望
    let name;
    if (phase < 0.03 || phase > 0.97) { name = '新月'; }
    else if (phase < 0.22) { name = '眉月'; }
    else if (phase < 0.28) { name = '上弦月'; }
    else if (phase < 0.47) { name = '盈凸月'; }
    else if (phase < 0.53) { name = '滿月'; }
    else if (phase < 0.72) { name = '虧凸月'; }
    else if (phase < 0.78) { name = '下弦月'; }
    else { name = '殘月'; }
    const icon = (typeof Icons !== 'undefined') ? Icons.moonPhaseSVG(phase, { size: 18 }) : '';
    return { phase, name, icon };
  }

  // ---------- 行星黃經（西洋占星用，Meeus 截斷級數） ----------
  // 精度約 0.01°~0.5°，占星宮位判斷足夠
  function _kepler(M, e) {
    let E = M;
    for (let i = 0; i < 20; i++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-9) break;
    }
    return E;
  }

  // 行星軌道要素（J2000，世紀變率）— 出自 Meeus Table 31.A（對黃道與春分點）
  const ORBITS = {
    mercury: { a: 0.387098, e: [0.20563175, 0.000020407], i: [7.004986, 0.0018215], O: [48.330893, 1.1861883], w: [77.456119, 1.5564776], L: [252.250906, 149474.0722491] },
    venus: { a: 0.723330, e: [0.00677192, -0.000047765], i: [3.394662, 0.0010037], O: [76.679920, 0.9011206], w: [131.563703, 1.4022288], L: [181.979801, 58519.2130302] },
    earth: { a: 1.000001, e: [0.01670863, -0.000042037], i: [0, 0], O: [0, 0], w: [102.937348, 1.7195366], L: [100.466457, 36000.7698278] },
    mars: { a: 1.523679, e: [0.09340065, 0.000090484], i: [1.849726, -0.0006011], O: [49.558093, 0.7720959], w: [336.060234, 1.8410449], L: [355.433000, 19141.6964471] },
    jupiter: { a: 5.202603, e: [0.04849793, 0.000163225], i: [1.303267, -0.0054965], O: [100.464407, 1.0209774], w: [14.331207, 1.6126352], L: [34.351519, 3036.3027748] },
    saturn: { a: 9.554909, e: [0.05554814, -0.000346641], i: [2.488879, -0.0037362], O: [113.665503, 0.8770880], w: [93.057237, 1.9637613], L: [50.077444, 1223.5110686] },
    uranus: { a: 19.218446, e: [0.04638122, -0.000027293], i: [0.773197, 0.0007744], O: [74.005957, 0.5211278], w: [173.005291, 1.4863790], L: [314.055005, 429.8640561] },
    neptune: { a: 30.110387, e: [0.00945575, 0.000006033], i: [1.769953, -0.0093082], O: [131.784057, 1.1022039], w: [48.120276, 1.4262957], L: [304.348665, 219.8833092] },
    // 冥王星為近似軌道要素（占星判座足夠，邊界誤差約 1°）
    pluto: { a: 39.48211675, e: [0.24882730, 0.0000517], i: [17.14001206, 0.00004818], O: [110.30393684, -0.01183482], w: [224.06891629, -0.04062942], L: [238.92903833, 145.20780515] }
  };

  // ---------- VSOP87D 求值（水星～海王星，天文級） ----------
  // 求某座標級數在 τ（儒略千年）的值：Σ_k τ^k Σ_i A cos(B+Cτ)
  function _vsopSum(series, tau) {
    let sum = 0, tp = 1;
    for (let k = 0; k < series.length; k++) {
      const terms = series[k]; let s = 0;
      for (let i = 0; i < terms.length; i++) { const t = terms[i]; s += t[0] * Math.cos(t[1] + t[2] * tau); }
      sum += s * tp; tp *= tau;
    }
    return sum;
  }
  // 日心黃經黃緯距離（黃道與春分點：當日），L,B 弧度、R AU
  function _vsopLBR(name, jde) {
    const tau = (jde - 2451545.0) / 365250.0;
    const d = VSOP[name];
    return { L: _vsopSum(d.L, tau), B: _vsopSum(d.B, tau), R: _vsopSum(d.R, tau) };
  }
  function _vsopRect(name, jde) {
    const { L, B, R } = _vsopLBR(name, jde);
    const cb = Math.cos(B);
    return { x: R * cb * Math.cos(L), y: R * cb * Math.sin(L), z: R * Math.sin(B) };
  }
  // 地心視黃經（度）：VSOP87D＋光行時迭代＋章動；行星與太陽共用
  // 傳 name='earth' 特殊處理為太陽（地心太陽＝地球日心＋180°）
  const ABERR_K = 20.49552 / 3600; // 光行差常數 κ（度）
  function _vsopGeoLon(name, jde) {
    const T = (jde - 2451545.0) / 36525;
    if (name === 'sun') {
      // 太陽地心黃經＝地球日心黃經＋180°。以「延遲時刻的地球位置」計算，光行時本身已含周年光行差，故不再另扣 κ
      const tau = (jde - 2451545.0) / 365250.0;
      const R = _vsopSum(VSOP.earth.R, tau);
      const jde2 = jde - 0.0057755183 * R;
      const e2 = _vsopRect('earth', jde2);
      const lon = Math.atan2(-e2.y, -e2.x) / RAD;
      return norm360(lon + nutationLon(T) / 3600);
    }
    const e = _vsopRect('earth', jde);
    let x, y, z, jdt = jde;
    for (let it = 0; it < 3; it++) {
      const p = _vsopRect(name, jdt);
      x = p.x - e.x; y = p.y - e.y; z = p.z - e.z;
      const dist = Math.sqrt(x * x + y * y + z * z);
      jdt = jde - 0.0057755183 * dist;
    }
    let lon = Math.atan2(y, x) / RAD;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD;
    // 周年光行差（Meeus Ch.23）：需太陽真黃經⊙、地球軌道近日點經度ϖ、離心率e
    const sunLon = norm360(_vsopLBR('earth', jde).L / RAD + 180);
    const ecc = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
    const peri = 102.93735 + 1.71946 * T + 0.00046 * T * T;
    const dLon = (-ABERR_K * Math.cos((sunLon - lon) * RAD) + ecc * ABERR_K * Math.cos((peri - lon) * RAD)) / Math.cos(lat * RAD);
    return norm360(lon + dLon + nutationLon(T) / 3600);
  }

  function _heliocentric(name, T) {
    const o = ORBITS[name];
    const L = norm360(o.L[0] + o.L[1] * T);
    const w = o.w[0] + o.w[1] * T;
    const e = o.e[0] + o.e[1] * T;
    const inc = (o.i[0] + o.i[1] * T) * RAD;
    const O = (o.O[0] + o.O[1] * T) * RAD;
    const M = norm360(L - w) * RAD;
    const E = _kepler(M, e);
    const v = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const r = o.a * (1 - e * Math.cos(E));
    const u = v + (w * RAD - O); // 近日點幅角 + 真近點角
    const x = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(inc));
    const yy = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(inc));
    const z = r * Math.sin(u) * Math.sin(inc);
    return { x, y: yy, z, r };
  }

  // 地心視黃經（度）：mercury..neptune
  // 冥王星日心黃經黃緯距離（Meeus Ch.37，J2000 黃道），l,b 度、r AU
  function _plutoHelioJ2000(jde) {
    const T = (jde - 2451545.0) / 36525;
    const J = 34.35 + 3034.9057 * T, S = 50.08 + 1222.1138 * T, P = 238.96 + 144.96 * T;
    let l = 0, b = 0, r = 0;
    for (let i = 0; i < PLUTO_T.length; i++) {
      const t = PLUTO_T[i];
      const a = (t[0] * J + t[1] * S + t[2] * P) * RAD, sa = Math.sin(a), ca = Math.cos(a);
      l += t[3] * sa + t[4] * ca; b += t[5] * sa + t[6] * ca; r += t[7] * sa + t[8] * ca;
    }
    return { lon: l + 238.958116 + 144.96 * T, lat: b - 3.908239, range: r + 40.7241346 };
  }
  // 冥王星地心視黃經（度）：Meeus 冥王星＋J2000→當日歲差＋光行時＋光行差＋章動
  function _plutoGeoLon(jde) {
    const T = (jde - 2451545.0) / 36525;
    const e = _vsopRect('earth', jde);
    const prec = 1.396971 * T + 0.0003086 * T * T; // J2000→當日 黃經歲差（度，近似）
    let x, y, z, jdt = jde;
    for (let it = 0; it < 2; it++) {
      const h = _plutoHelioJ2000(jdt);
      const lonOD = (h.lon + prec) * RAD, latR = h.lat * RAD, cb = Math.cos(latR);
      x = h.range * cb * Math.cos(lonOD) - e.x;
      y = h.range * cb * Math.sin(lonOD) - e.y;
      z = h.range * Math.sin(latR) - e.z;
      jdt = jde - 0.0057755183 * Math.sqrt(x * x + y * y + z * z);
    }
    let lon = Math.atan2(y, x) / RAD;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD;
    const sunLon = norm360(_vsopLBR('earth', jde).L / RAD + 180);
    const ecc = 0.016708634 - 0.000042037 * T, peri = 102.93735 + 1.71946 * T;
    const dLon = (-ABERR_K * Math.cos((sunLon - lon) * RAD) + ecc * ABERR_K * Math.cos((peri - lon) * RAD)) / Math.cos(lat * RAD);
    return norm360(lon + dLon + nutationLon(T) / 3600);
  }

  function planetLongitude(name, jde) {
    if (name === 'pluto' && PLUTO_T) return _plutoGeoLon(jde);       // 冥王星走 Meeus Ch.37
    if (VSOP && VSOP[name]) return _vsopGeoLon(name, jde);           // 水星～海王星走 VSOP87D
    const T = (jde - 2451545.0) / 36525;                            // 資料缺席時退回克卜勒近似
    const p = _heliocentric(name, T);
    const e = _heliocentric('earth', T);
    return norm360(Math.atan2(p.y - e.y, p.x - e.x) / RAD);
  }

  // 月球地心視黃經（Meeus 天文演算法 Ch.47 完整 Table 47.A 60 項＋附加項＋章動，精度 ~10″）
  // 每列 [D, M, M', F, Σl係數(1e-6 度)]；含 M 之項需乘 E（|M|=1）或 E²（|M|=2）
  const ML_TERMS = [
    [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
    [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
    [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
    [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
    [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
    [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
    [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689],
    [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390], [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236],
    [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
    [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110], [3, 0, -1, 0, -892],
    [2, 1, 1, 0, -810], [4, -1, -2, 0, 759], [0, 2, -1, 0, -713], [2, 2, -1, 0, -700],
    [2, 1, -2, 0, 691], [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
    [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399], [0, 0, 2, -2, -381],
    [1, 1, 1, 0, 351], [3, 0, -2, 0, -340], [4, 0, -3, 0, 330], [2, -1, 2, 0, 327],
    [0, 2, 1, 0, -323], [1, 1, -1, 0, 299], [2, 0, 3, 0, 294], [2, 0, -1, -2, 0]
  ];
  // 章動 in 黃經 Δψ（Meeus Ch.22 主要項，角秒）
  function nutationLon(T) {
    const Om = (125.04452 - 1934.136261 * T) * RAD;
    const L = (280.4665 + 36000.7698 * T) * RAD;
    const Lp = (218.3165 + 481267.8813 * T) * RAD;
    return -17.20 * Math.sin(Om) - 1.32 * Math.sin(2 * L) - 0.23 * Math.sin(2 * Lp) + 0.21 * Math.sin(2 * Om);
  }
  function moonLongitude(jde) {
    const T = (jde - 2451545.0) / 36525;
    const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T * T * T / 538841 - T * T * T * T / 65194000;
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868 - T * T * T * T / 113065000;
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T * T * T / 24490000;
    const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699 - T * T * T * T / 14712000;
    const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000;
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    let sl = 0;
    for (const [cd, cm, cmp, cf, coef] of ML_TERMS) {
      let arg = (cd * D + cm * M + cmp * Mp + cf * F) * RAD;
      let e = Math.abs(cm) === 1 ? E : Math.abs(cm) === 2 ? E * E : 1;
      sl += coef * e * Math.sin(arg);
    }
    // 附加項（金星、木星、地球扁率攝動）
    const A1 = (119.75 + 131.849 * T) * RAD;
    const A2 = (53.09 + 479264.290 * T) * RAD;
    sl += 3958 * Math.sin(A1) + 1962 * Math.sin((Lp - F) * RAD) + 318 * Math.sin(A2);
    // 幾何黃經 + 章動 → 視黃經
    return norm360(Lp + sl / 1000000 + nutationLon(T) / 3600);
  }

  return {
    toJD, fromJD, deltaT, ttToLocal, localToTT, localDayNum, norm360,
    sunLongitude, solarLongitudeTime, solarTerm, solarTermsOfYear, TERM_NAMES,
    newMoonTT, newMoonLocal, newMoonKBefore,
    toLunar, LUNAR_MONTH_NAMES, LUNAR_DAY_NAMES,
    moonPhase, planetLongitude, moonLongitude
  };
})();
if (typeof module !== 'undefined') module.exports = Astro;
