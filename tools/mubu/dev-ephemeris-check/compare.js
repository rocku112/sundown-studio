/* 暮卜先知 · 星曆對帳 harness（開發用，不打包進網站）
 *
 * 拿本站 js/core/astro.js 的行星/日月黃經，對 Swiss Ephemeris（sweph，Moshier 模式，角秒級）掃一整排日期，
 * 量出每個天體的最大／平均誤差（角分、角秒），作為「星曆精度」改進的回歸基準。
 *
 * 用法：node compare.js            （預設 1900–2100，每 7 天一筆）
 *       node compare.js 1950 2050 3
 *
 * 註：本站 astro.js 的 *Longitude 函式吃 JDE（TT 基準的 JD）。sweph.calc 也吃 TT 基準的 JD，
 *     故兩邊同以 TT 比對，排除 ΔT 差異；比的是「視黃經（apparent）」——星盤要的就是視位置。
 */
const path = require('path');
const Astro = require(path.join('..', 'js', 'core', 'astro.js'));
const sweph = require('sweph');
const C = sweph.constants;

// 本站行星 id → Swiss Ephemeris 天體常數
const BODIES = [
  { name: '太陽', our: (jde) => Astro.sunLongitude(jde), se: C.SE_SUN },
  { name: '月亮', our: (jde) => Astro.moonLongitude(jde), se: C.SE_MOON },
  { name: '水星', our: (jde) => Astro.planetLongitude('mercury', jde), se: C.SE_MERCURY },
  { name: '金星', our: (jde) => Astro.planetLongitude('venus', jde), se: C.SE_VENUS },
  { name: '火星', our: (jde) => Astro.planetLongitude('mars', jde), se: C.SE_MARS },
  { name: '木星', our: (jde) => Astro.planetLongitude('jupiter', jde), se: C.SE_JUPITER },
  { name: '土星', our: (jde) => Astro.planetLongitude('saturn', jde), se: C.SE_SATURN },
  { name: '天王星', our: (jde) => Astro.planetLongitude('uranus', jde), se: C.SE_URANUS },
  { name: '海王星', our: (jde) => Astro.planetLongitude('neptune', jde), se: C.SE_NEPTUNE },
  { name: '冥王星', our: (jde) => Astro.planetLongitude('pluto', jde), se: C.SE_PLUTO }
];

// Swiss Ephemeris 旗標
const FLAG_APPARENT = C.SEFLG_MOSEPH;                                             // 視位置（含光行差＋章動＋光行時＋重力偏折）
const FLAG_GEOM = C.SEFLG_MOSEPH | C.SEFLG_TRUEPOS | C.SEFLG_NONUT | C.SEFLG_NOABERR | C.SEFLG_NOGDEFL; // 幾何真位置

// 角度差取最短弧（度），轉角秒
function arcsecDiff(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(d) * 3600;
}
const fmt = (arcsec) => arcsec >= 60 ? `${(arcsec / 60).toFixed(2)}'` : `${arcsec.toFixed(1)}"`;

const [, , yStartArg, yEndArg, stepArg] = process.argv;
const yStart = +yStartArg || 1900, yEnd = +yEndArg || 2100, stepDays = +stepArg || 7;

// 掃描日期網格（以 TT-JD 直接遞增）
const jdStart = sweph.julday(yStart, 1, 1, 0, C.SE_GREG_CAL);
const jdEnd = sweph.julday(yEnd, 1, 1, 0, C.SE_GREG_CAL);

const stat = BODIES.map(b => ({ name: b.name, maxApp: 0, sumApp: 0, maxGeom: 0, sumGeom: 0, n: 0, worstJd: 0 }));

let count = 0;
for (let jd = jdStart; jd <= jdEnd; jd += stepDays) {
  for (let i = 0; i < BODIES.length; i++) {
    const ourLon = ((BODIES[i].our(jd) % 360) + 360) % 360;
    const app = sweph.calc(jd, BODIES[i].se, FLAG_APPARENT);
    const geom = sweph.calc(jd, BODIES[i].se, FLAG_GEOM);
    if (app.error && app.error.length) continue;
    const dApp = arcsecDiff(ourLon, app.data[0]);
    const dGeom = geom.error && geom.error.length ? dApp : arcsecDiff(ourLon, geom.data[0]);
    const s = stat[i];
    s.sumApp += dApp; s.sumGeom += dGeom; s.n++;
    if (dApp > s.maxApp) { s.maxApp = dApp; s.worstJd = jd; }
    if (dGeom > s.maxGeom) s.maxGeom = dGeom;
  }
  count++;
}

console.log(`\n對帳範圍 ${yStart}–${yEnd}，每 ${stepDays} 天一筆，共 ${count} 個時刻 · 標準：Swiss Ephemeris (Moshier)`);
console.log(`${'天體'.padEnd(6)} ${'vs視位置 最大'.padStart(14)} ${'vs視位置 平均'.padStart(14)} ${'vs幾何 最大'.padStart(12)}  最差時刻(TT-JD)`);
console.log('─'.repeat(72));
for (const s of stat) {
  const worst = sweph.revjul(s.worstJd, C.SE_GREG_CAL);
  console.log(
    `${s.name.padEnd(6)} ${fmt(s.maxApp).padStart(14)} ${fmt(s.sumApp / s.n).padStart(14)} ${fmt(s.maxGeom).padStart(12)}  ${worst.year}/${String(worst.month).padStart(2,'0')}/${String(worst.day).padStart(2,'0')}`
  );
}
console.log('\n目標地板：vs視位置 最大 < 0.5\'（30"）。「vs幾何 最大」若遠小於「vs視位置」，代表誤差主要來自缺章動＋光行差，而非 VSOP 截斷。');
