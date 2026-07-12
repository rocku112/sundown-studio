/* 暮卜先知 · SVG 圖示庫（取代全站 emoji，統一水墨線條風格） */
const Icons = (() => {
  const SW = 1.6;

  function wrap(inner, opts = {}) {
    const cls = opts.class ? ` class="${opts.class}"` : '';
    // 預設用 em 相對縮放，跟隨所在文字的 font-size（首頁卡片/標題/按鈕各自大小不同）
    const sizeAttr = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
    const style = opts.style || (opts.size ? 'vertical-align:-4px;flex-shrink:0' : 'width:1em;height:1em;vertical-align:-0.14em;flex-shrink:0');
    return `<svg${cls} viewBox="0 0 24 24"${sizeAttr} style="${style}" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  // ---------- 18 工具圖示 ----------
  const TOOL = {
    bazi: '<path d="M4 20V9M9 20V5M14 20V12M19 20V4"/>',
    ziwei: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><path d="M12 9.3l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="currentColor" stroke="none"/>',
    astrology: '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="9.5" ry="3.2"/>',
    tarot: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 9.3l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="currentColor" stroke="none"/>',
    xiaoliuren: '<path d="M7.5 12.5V6a1.4 1.4 0 012.8 0v5.3M10.8 11.3V4.4a1.4 1.4 0 012.8 0v7M13.9 11.7V6.2a1.4 1.4 0 012.8 0v6.7M17 13V9a1.4 1.4 0 012.8 0v5.5c0 4.1-2.6 7-6.9 7s-6.4-2.8-6.4-6v-1.8l-1.7-1.9a1.3 1.3 0 011.9-1.8L7 12"/>',
    qimen: '<circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M12 7.5l1.8 4.5-1.8 4.5-1.8-4.5z" fill="currentColor" stroke="none"/>',
    qian: '<rect x="5" y="10" width="10" height="11" rx="1.5"/><path d="M7.5 10V6.5M10 10V3M12.5 10V7"/>',
    almanac: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14.5" r="1" fill="currentColor" stroke="none"/>',
    liuyao: '<path d="M4 4.5h16M4 9h6.5M13.5 9H20M4 13.5h16M4 18h6.5M13.5 18H20"/>',
    daliuren: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21"/>',
    fortune: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    numerology: '<circle cx="7.5" cy="7.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="16.5" cy="7.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="7.5" cy="16.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="16.5" cy="16.5" r="1.8" fill="currentColor" stroke="none"/><path d="M9 9l6 6M15 9l-6 6"/>',
    naming: '<path d="M18.5 2.5l3 3-9.6 9.6-4 1 1-4z"/><path d="M12.5 8.5l3 3"/><path d="M4 21c2-.5 3-1.5 3-3"/>',
    hehun: '<circle cx="9" cy="12.5" r="5"/><circle cx="15" cy="12.5" r="5"/>',
    synastry: '<circle cx="8" cy="9" r="4"/><circle cx="16.5" cy="15.5" r="4"/><path d="M10.8 11.8l2.4 2.4"/>',
    combo: '<circle cx="9" cy="9.5" r="6"/><circle cx="15" cy="9.5" r="6"/><circle cx="12" cy="15.5" r="6"/>',
    history: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M8.5 3.3A9 9 0 004.2 7"/><path d="M4.2 3.5l0 3.8 3.8 0"/>',
    meihua: '<circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 010 9 4.5 4.5 0 000 9 9 9 0 000-18z" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.3" fill="var(--panel,#FEFCF8)" stroke="none"/><circle cx="12" cy="16.5" r="1.3" fill="currentColor" stroke="none"/>'
  };

  // ---------- 共用 UI 圖示 ----------
  const UI = {
    share: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7l1.3-2.5h4.4L15.5 7"/><circle cx="12" cy="13.5" r="3.3"/>',
    save: '<path d="M6 3h12v18l-6-4.2L6 21z"/>',
    ai: '<path d="M12 3l1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4z" fill="currentColor" stroke="none"/><path d="M19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6z" fill="currentColor" stroke="none"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13.5h9l1-13.5"/><path d="M10 11v6M14 11v6"/>',
    check: '<path d="M4 12.5l5 5L20 6"/>',
    festival: '<path d="M4 20l3-9 6 6z"/><path d="M11 9l6-4M15 3l1.5 2M19 6.5L21 8M13.5 13.5l1.8 1.8" stroke-linecap="round"/><circle cx="9.5" cy="14.5" r=".6" fill="currentColor" stroke="none"/>',
    paw: '<circle cx="7" cy="7.5" r="2"/><circle cx="12" cy="5.5" r="2"/><circle cx="17" cy="7.5" r="2"/><circle cx="19" cy="12.5" r="2"/><path d="M6 20c-1.5 0-2.5-1.4-2-3 .6-2.3 3-4 8-4s7.4 1.7 8 4c.5 1.6-.5 3-2 3-2 0-2.7-1.5-6-1.5S8 20 6 20z"/>',
    ascendant: '<path d="M12 20.5V4"/><path d="M6.5 9.5L12 4l5.5 5.5"/>',
    midheaven: '<path d="M12 21V3"/><path d="M12 3.5l7 3.8-7 3.8z" fill="currentColor" stroke="none"/>'
  };

  // ---------- 星等（塔羅/籤詩/每日運勢） ----------
  const STAR_PATH = 'M12 3.3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 16.2 6.7 19.3 8 13.4l-4.5-4 6-.6z';
  const STAR = {
    'star-filled': `<path d="${STAR_PATH}" fill="currentColor" stroke="none"/>`,
    'star-outline': `<path d="${STAR_PATH}"/>`
  };

  // ---------- 十二星座（原創幾何圖案，非精確字符描摹） ----------
  const ZODIAC = {
    aries: '<path d="M4.5 5c0 4.5 3 4.5 3 8m9-8c0 4.5-3 4.5-3 8M7.5 13a4.5 4.5 0 019 0"/>',
    taurus: '<circle cx="12" cy="15" r="4.5"/><path d="M6 5c0 3 2.7 4.8 6 4.8S18 8 18 5"/>',
    gemini: '<path d="M7.5 4v16M16.5 4v16M5.5 4h5M13.5 4h5M5.5 20h5M13.5 20h5M7.5 12h9"/>',
    cancer: '<circle cx="7.2" cy="9" r="2.8"/><circle cx="16.8" cy="15" r="2.8"/><path d="M10 9a6.8 6.8 0 006.8 6.8M14 15a6.8 6.8 0 00-6.8-6.8"/>',
    leo: '<circle cx="14.5" cy="8" r="3.8"/><path d="M14.5 11.5c0 5-4.5 3.8-6 6.8-1 2 1 3.2 2.8 2 1.3-.9.7-2.6-.3-2"/>',
    virgo: '<path d="M5 4v10.5a3 3 0 003 3M9 4v10.5a3 3 0 003 3M13 4v15M13 12.5a4 4 0 014-4v8.5a3 3 0 01-3 3"/>',
    libra: '<path d="M4 19.5h16M4 15.5c2.2-3 13.8-3 16 0M12 3.5v10M8.3 8a3.7 3.7 0 017.4 0"/>',
    scorpio: '<path d="M5 4v10.5a3 3 0 003 3M9 4v10.5a3 3 0 003 3M13 4v13.5M13 17.5l3-3.2M16 14.3l1.2 2-2.2.8"/>',
    sagittarius: '<path d="M4.5 19.5L19.5 4.5M19.5 4.5h-6M19.5 4.5v6M11.5 13l-3-3"/>',
    capricorn: '<path d="M4.5 5c0 6 4 6.5 4.3 3.3.3-3.2-2.3-2.4-2 .7.4 4 2.7 9 6.2 7.3-2.4-1.2-1-4.7 2-4.7a3 3 0 013 3"/>',
    aquarius: '<path d="M3 9.5l2.8-2 2.8 2 2.8-2 2.8 2 2.8-2 2.8 2M3 15.5l2.8-2 2.8 2 2.8-2 2.8 2 2.8-2 2.8 2"/>',
    pisces: '<path d="M8 4a8.2 15 0 000 16M16 4a8.2 15 0 010 16M4 12h16"/>'
  };

  // ---------- 十大行星 ----------
  const PLANET = {
    sun: '<circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    moon: '<path d="M15 4.2a8.6 8.6 0 100 15.6A7 7 0 0115 4.2z" fill="currentColor" stroke="none"/>',
    mercury: '<circle cx="12" cy="10" r="4"/><path d="M9 4.3a3 3 0 016 0M12 14v6.5M9 18h6"/>',
    venus: '<circle cx="12" cy="9" r="5"/><path d="M12 14v6.5M8.7 18h6.6"/>',
    mars: '<circle cx="10" cy="14" r="5"/><path d="M14 10L20.5 3.5M14.5 3.5h6v6"/>',
    jupiter: '<path d="M4 8.5a4 4 0 018 0c0 2.8-2.7 3.8-2.7 3.8H21M15 3.5v17"/>',
    saturn: '<path d="M6.5 3.5V15a4 4 0 004 4M4 7.5h5.2M16.5 6.5v14"/><circle cx="14" cy="12" r="3"/>',
    uranus: '<circle cx="12" cy="17" r="2.6"/><path d="M12 14.4V6M7.3 6v5M16.7 6v5M7.3 8.3h9.4"/>',
    neptune: '<path d="M12 3.5v17M6 6a6 6 0 0012 0M9 19h6"/>',
    pluto: '<circle cx="12" cy="16" r="3.6"/><path d="M8 4h8M12 4v6a4 4 0 004 4"/>'
  };

  // ---------- 五種相位 ----------
  const ASPECT = {
    conjunction: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    sextile: '<path d="M12 4v16M5 8l14 8M19 8L5 16"/>',
    square: '<rect x="5" y="5" width="14" height="14"/>',
    trine: '<path d="M12 4l8.5 15H3.5z"/>',
    opposition: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/>'
  };

  // ---------- 八卦（依 lines 陣列即時生成，陽爻=實線／陰爻=斷線） ----------
  function trigramInner(lines) {
    // lines: [底爻,中爻,頂爻]（0=陰 1=陽）；由上而下畫
    const order = [lines[2], lines[1], lines[0]];
    return order.map((bit, i) => {
      const y = 4 + i * 7.5;
      return bit
        ? `<rect x="3" y="${y}" width="18" height="3.2" rx="1" fill="currentColor" stroke="none"/>`
        : `<rect x="3" y="${y}" width="7.5" height="3.2" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="${y}" width="7.5" height="3.2" rx="1" fill="currentColor" stroke="none"/>`;
    }).join('');
  }

  // ---------- 月相（0=新月…0.5=滿月…1=新月，依光照比例畫明暗圓） ----------
  function moonPhaseInner(phase, uid) {
    const lit = Math.cos(phase * 2 * Math.PI) * -1; // -1(新月)~1(滿月)
    const rx = Math.max(0.5, Math.abs(lit) * 8);
    const wax = phase < 0.5; // 上弦（漸圓）或下弦（漸缺）
    const bulgeRight = wax ? lit >= 0 : lit < 0;
    return `<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor"/>
      <clipPath id="mp-${uid}"><circle cx="12" cy="12" r="8.4"/></clipPath>
      <g clip-path="url(#mp-${uid})">
        <rect x="4" y="4" width="16" height="16" fill="currentColor" opacity=".18"/>
        <ellipse cx="12" cy="12" rx="${rx.toFixed(2)}" ry="8.4" fill="currentColor"/>
        ${lit > 0 ? `<rect x="${bulgeRight ? 12 : 4}" y="4" width="8" height="16" fill="currentColor"/>` : ''}
      </g>`;
  }

  // ---------- 塔羅：22 大阿爾克那（依 id 0–21）＋ 4 花色 ----------
  const TAROT_MAJOR = {
    0: '<path d="M12 5a2.2 2.2 0 100 4.4A2.2 2.2 0 0012 5z" fill="currentColor" stroke="none"/><path d="M8 20c.5-4 2-6 2-9M16 20c-.5-4-3-8-3-11"/>',
    1: '<path d="M12 4v4M7 20l10-12M7 8h10"/><circle cx="12" cy="12.5" r="5.5"/>',
    2: '<path d="M6 4v16M18 4v16"/><path d="M15 12a3 6.5 0 11-6 0 3 6.5 0 016 0z" fill="currentColor" stroke="none"/>',
    3: '<circle cx="12" cy="10" r="5"/><path d="M12 15v6.5M8.7 19.5h6.6"/>',
    4: '<path d="M6 21V9l6-5 6 5v12"/><path d="M9 21v-6h6v6"/>',
    5: '<path d="M6 6l3 3-3 3M9 6l3 3-3 3" transform="translate(0,3)"/><path d="M4 20h16"/>',
    6: '<circle cx="8.5" cy="10" r="4"/><circle cx="15.5" cy="10" r="4"/><path d="M8.5 14v6M15.5 14v6"/>',
    7: '<circle cx="12" cy="15" r="4.3"/><path d="M8 6h8l-1.5 5h-5z"/><path d="M12 2v4"/>',
    8: '<path d="M4 8a10 5 0 0016 0"/><circle cx="12" cy="15" r="3.2"/>',
    9: '<path d="M8 21c0-6 1.5-9 4-13"/><circle cx="12.3" cy="6" r="2.3" fill="currentColor" stroke="none"/><path d="M15 12h5"/>',
    10: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18"/>',
    11: '<path d="M4 19.5h16M4 15.5c2.2-3 13.8-3 16 0M12 3.5v10M8.3 8a3.7 3.7 0 017.4 0"/>',
    12: '<path d="M12 22V13"/><circle cx="12" cy="9.5" r="3.5"/><path d="M12 13L6 15M12 13l6 2"/>',
    13: '<circle cx="12" cy="9" r="5"/><path d="M9.5 8h.01M14.5 8h.01" stroke-width="2.4"/><path d="M12 20l-3-3M12 20l3-3M12 14v6"/>',
    14: '<circle cx="8" cy="13" r="4.5"/><circle cx="16" cy="13" r="4.5"/><path d="M12 8.5V4"/>',
    15: '<path d="M6 4l6 5 6-5"/><rect x="6" y="9" width="12" height="11" rx="1.5"/><path d="M9.5 13.5c1-1 4-1 5 0M9.5 17.5c1-1 4-1 5 0"/>',
    16: '<rect x="8" y="3" width="8" height="18"/><path d="M3 21l5-6M21 21l-5-6M9 9l6-3M9 13l6-3"/>',
    17: '<circle cx="12" cy="7" r="3.2"/><path d="M12 12v9M8 15l-3-1M16 15l3-1M8 18l-2 1M16 18l2 1"/>',
    18: '<path d="M15 4.2a8.6 8.6 0 100 15.6A7 7 0 0115 4.2z" fill="currentColor" stroke="none"/><path d="M4 21c2-6 5-9 8-9s6 3 8 9"/>',
    19: '<circle cx="12" cy="12" r="4.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M7.5 16.5l-2 2"/>',
    20: '<path d="M12 3v10M8 6l4-3 4 3"/><path d="M6 21c0-4 3-6 6-6s6 2 6 6"/>',
    21: '<circle cx="12" cy="12" r="7.5"/><path d="M5.5 7c-2 2-2 8 0 10M18.5 7c2 2 2 8 0 10"/>'
  };
  const TAROT_SUIT = {
    wands: '<path d="M6 20L18 4"/><path d="M16 3l2.5 1-1 2.5"/>',
    cups: '<path d="M6 5h12l-1.5 8a4.5 4.5 0 01-9 0z"/><path d="M12 13v5M8 20h8"/>',
    swords: '<path d="M12 3v13"/><path d="M7 8h10"/><path d="M9 20l3-4 3 4"/>',
    pentacles: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5l1.8 4 4.4.4-3.3 2.9.9 4.3-3.8-2.3-3.8 2.3.9-4.3-3.3-2.9 4.4-.4z"/>'
  };

  // ---------- 彙整查詢 ----------
  const FLAT = Object.assign({}, TOOL, UI, STAR, ZODIAC, PLANET, ASPECT);
  Object.entries(TAROT_MAJOR).forEach(([k, v]) => { FLAT['tarot-major-' + k] = v; });
  Object.entries(TAROT_SUIT).forEach(([k, v]) => { FLAT['tarot-suit-' + k] = v; });

  let uidSeq = 0;

  function svg(name, opts) {
    if (name === 'star-filled' || name === 'star-outline') return wrap(FLAT[name], opts);
    const inner = FLAT[name];
    if (!inner) return '';
    return wrap(inner, opts);
  }
  // raw：不含外層 <svg>，供嵌入其他手繪 SVG 使用
  function raw(name) { return FLAT[name] || ''; }

  function trigramSVG(lines, opts) { return wrap(trigramInner(lines), opts); }
  function moonPhaseSVG(phase, opts) { uidSeq++; return wrap(moonPhaseInner(phase, uidSeq), opts); }
  function starBarHTML(n, opts) {
    let s = '';
    for (let i = 0; i < 5; i++) s += svg(i < n ? 'star-filled' : 'star-outline', Object.assign({}, opts, { style: (opts && opts.style || 'vertical-align:-3px') + ';color:' + (i < n ? 'var(--gold-mid)' : 'var(--panel-border)') }));
    return s;
  }
  function tarotCardIcon(card, opts) {
    if (card.suit == null) return svg('tarot-major-' + card.id, opts);
    return svg('tarot-suit-' + card.suit, opts);
  }

  return { svg, raw, trigramSVG, moonPhaseSVG, starBarHTML, tarotCardIcon, has: (n) => !!FLAT[n] };
})();
if (typeof module !== 'undefined') module.exports = Icons;
