/* 產生器（開發用）：把 astronomia 的完整 VSOP87D 依振幅門檻截斷，輸出網站用的精簡資料檔
 * 用法：node gen-vsop87.js [Lcut] [Bcut] [Rcut]
 *   Lcut/Bcut：黃經/黃緯振幅門檻（弧度），Rcut：距離振幅門檻（AU）
 * 輸出：../js/data/vsop87d.js（全域 VSOP87D）
 * 資料來源：VSOP87（Bretagnon & Francou 1988，公有領域）；經 astronomia(MIT) 轉出後截斷。
 */
import { pathToFileURL } from 'url';
import { writeFileSync, readFileSync } from 'fs';

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const [Lcut, Bcut, Rcut] = [(+process.argv[2] || 1e-8), (+process.argv[3] || 1e-8), (+process.argv[4] || 1e-9)];

function trunc(series, cut) {
  // series: {0:[[A,B,C],...],1:[...],...} → 陣列，每個 series 只保留 |A|>=cut，且四捨五入精簡
  const out = [];
  const keys = Object.keys(series).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    const terms = series[k].filter(t => Math.abs(t[0]) >= cut)
      .map(t => [t[0], t[1], t[2]]);
    out[k] = terms;
  }
  // 去掉尾端全空的 series
  while (out.length && (!out[out.length - 1] || out[out.length - 1].length === 0)) out.pop();
  return out;
}

const data = {};
let total = 0;
for (const p of PLANETS) {
  const m = (await import(pathToFileURL('node_modules/astronomia/data/vsop87D' + p + '.js').href)).default;
  const L = trunc(m.L, Lcut), B = trunc(m.B, Bcut), R = trunc(m.R, Rcut);
  const cnt = a => a.reduce((s, x) => s + (x ? x.length : 0), 0);
  total += cnt(L) + cnt(B) + cnt(R);
  data[p] = { L, B, R };
}

// 精簡數字輸出（保留足夠位數）
const num = n => {
  if (n === 0) return '0';
  const s = n.toPrecision(12).replace(/0+$/, '').replace(/\.$/, '');
  return s;
};
const serToStr = ser => '[' + ser.map(terms => '[' + terms.map(t => `[${num(t[0])},${num(t[1])},${num(t[2])}]`).join(',') + ']').join(',') + ']';
let out = '/* 暮卜先知 · VSOP87D 精簡係數（水星～海王星，日心黃經/黃緯/距離）\n';
out += ' * 來源：VSOP87（Bretagnon & Francou 1988，公有領域）；由 dev-ephemeris-check/gen-vsop87.js 依振幅門檻截斷產生。\n';
out += ` * 門檻 L>=${Lcut} B>=${Bcut} R>=${Rcut}（弧度/AU）。求值：Σ_k τ^k Σ_i A cos(B+Cτ)，τ=(JDE-2451545)/365250。 */\n`;
out += 'const VSOP87D = {\n';
out += PLANETS.map(p => `  ${p}: { L: ${serToStr(data[p].L)}, B: ${serToStr(data[p].B)}, R: ${serToStr(data[p].R)} }`).join(',\n');
out += '\n};\n';
// 冥王星 Meeus Ch.37 Table 37.A（1885–2099 適用；[i,j,k,lA,lB,bA,bB,rA,rB]，經緯度單位度、距離 AU）
const pluto = JSON.parse(readFileSync('pluto-table.json', 'utf8'));
out += '/* 冥王星 Meeus《天文演算法》Ch.37 Table 37.A（1885–2099 適用）：[i,j,k, 經度sinA,cosB, 緯度sinA,cosB, 距離sinA,cosB] */\n';
out += 'const PLUTO_T37 = ' + JSON.stringify(pluto) + ';\n';
out += 'if (typeof module !== \'undefined\') module.exports = { VSOP87D, PLUTO_T37 };\n';

writeFileSync('../js/data/vsop87d.js', out);
const bytes = Buffer.byteLength(out, 'utf8');
console.log(`已輸出 ../js/data/vsop87d.js：${total} 項，${(bytes / 1024).toFixed(1)} KB（門檻 L>=${Lcut} B>=${Bcut} R>=${Rcut}）`);
