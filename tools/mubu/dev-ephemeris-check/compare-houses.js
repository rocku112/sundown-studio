/* 星盤角度對帳 harness（開發用）：上升／天頂／Placidus 宮首／均時差對 Swiss Ephemeris
 * 用法：node compare-houses.js
 * 註：Astro.placidusHouses/ascMc 吃 UT 儒略日；sweph.houses 亦吃 UT，故直接同以 UT 比對。
 *     均時差本站函式吃 JDE(TT)，對 sweph.time_equ(UT)；EoT 隨時間變化極慢，TT/UT 差異可忽略。
 */
const path = require('path');
const Astro = require(path.join('..', 'js', 'core', 'astro.js'));
const MUBU_CITIES = require(path.join('..', 'js', 'data', 'cities.js'));
const sweph = require('sweph');
const C = sweph.constants;

function arcsec(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(d) * 3600;
}
const fmt = (as) => as >= 60 ? `${(as / 60).toFixed(2)}'` : `${as.toFixed(1)}"`;

// 取幾個代表城市（含高緯）＋整年逐日、多個時刻
const LOCS = [
  ['台北', 25.04, 121.51], ['高雄', 22.63, 120.30], ['東京', 35.68, 139.69],
  ['倫敦', 51.51, -0.13], ['紐約', 40.71, -74.01], ['雪梨', -33.87, 151.21], ['莫斯科', 55.76, 37.62]
];

let maxAsc = 0, maxMc = 0, maxCusp = 0, sumAsc = 0, nAsc = 0;
let worstAscJd = 0, worstAscLoc = '';
const jd0 = sweph.julday(1950, 1, 1, 0, C.SE_GREG_CAL);
const jd1 = sweph.julday(2050, 1, 1, 0, C.SE_GREG_CAL);
const STEP = 3.7; // 天（取非整數以掃過各時刻）

for (let jd = jd0; jd <= jd1; jd += STEP) {
  for (const [name, lat, lon] of LOCS) {
    const mine = Astro.placidusHouses(jd, lat, lon);
    if (mine.system !== 'Placidus') continue; // 高緯回退等宮制者不比
    const ref = sweph.houses(jd, lat, lon, 'P');
    if (ref.error && ref.error.length && !ref.data) continue;
    const dAsc = arcsec(mine.asc, ref.data.points[0]);
    const dMc = arcsec(mine.mc, ref.data.points[1]);
    sumAsc += dAsc; nAsc++;
    if (dAsc > maxAsc) { maxAsc = dAsc; worstAscJd = jd; worstAscLoc = name; }
    if (dMc > maxMc) maxMc = dMc;
    for (let h = 1; h <= 12; h++) {
      const d = arcsec(mine.cusps[h], ref.data.houses[h - 1]);
      if (d > maxCusp) maxCusp = d;
    }
  }
}

// 均時差
let maxEot = 0;
for (let jd = jd0; jd <= jd1; jd += 11.3) {
  const jde = jd + Astro.deltaT(2000) / 86400; // 近似 TT
  const mineMin = Astro.equationOfTime(jde);
  const refMin = sweph.time_equ(jd).data * 1440; // 天→分
  const d = Math.abs(mineMin - refMin);
  if (d > maxEot) maxEot = d;
}

const worst = sweph.revjul(worstAscJd, C.SE_GREG_CAL);
console.log(`\n星盤角度對帳 1950–2050 · 7 城市（含高緯）· 標準：Swiss Ephemeris (Placidus, Moshier)`);
console.log('─'.repeat(60));
console.log(`上升點 Asc   最大 ${fmt(maxAsc).padStart(8)}   平均 ${fmt(sumAsc / nAsc).padStart(8)}   最差：${worstAscLoc} ${worst.year}/${String(worst.month).padStart(2,'0')}/${String(worst.day).padStart(2,'0')}`);
console.log(`天頂 MC      最大 ${fmt(maxMc).padStart(8)}`);
console.log(`Placidus 宮首 最大 ${fmt(maxCusp).padStart(8)}`);
console.log(`均時差 EoT   最大 ${maxEot.toFixed(2)} 秒（分鐘差×60）= ${(maxEot * 60).toFixed(1)}"`);
console.log(`\n※ 上升/宮首本站用平黃赤交角（未含章動），與 sweph 視位置的差異主要來自章動（≤~17"）。`);
