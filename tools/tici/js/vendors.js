/* 提詞挈領 · 廠家標記
 * 每一條技法在總表裡都有來源。這裡標的是「這關的技法由哪幾家的官方文件背書」，
 * 收集用。多家共識的技法會同時掛好幾個標記。
 */
(function (P) {
  'use strict';

  P.VENDORS = [
    { id: 'oa', name: 'OpenAI', hue: 152 },
    { id: 'an', name: 'Anthropic', hue: 24 },
    { id: 'gg', name: 'Google', hue: 212 },
    { id: 'xa', name: 'xAI', hue: 280 }
  ];

  P.SHRINE_VENDORS = {
    's1-1': ['oa', 'an'], 's1-2': ['oa'], 's1-3': ['oa', 'an'], 's1-4': ['an', 'gg'], 's1-5': ['oa'], 't1': ['oa', 'an'],
    's2-1': ['an', 'oa', 'gg', 'xa'], 's2-2': ['oa', 'gg', 'an'], 's2-3': ['gg', 'oa'], 's2-4': ['an', 'oa'], 's2-5': ['gg', 'an'], 't2': ['oa', 'an', 'gg'],
    's3-1': ['an'], 's3-2': ['oa', 'gg'], 's3-3': ['an', 'gg'], 's3-4': ['gg'], 's3-5': ['gg', 'xa'], 't3': ['an', 'gg'],
    's4-1': ['an', 'oa'], 's4-2': ['gg'], 's4-3': ['an'], 's4-4': ['oa', 'gg'], 's4-5': ['oa'], 't4': ['an', 'gg', 'oa'],
    's5-1': ['oa', 'an', 'gg'], 's5-2': ['gg', 'oa'], 's5-3': ['an', 'oa'], 's5-4': ['an'], 's5-5': ['oa', 'an'], 't5': ['oa', 'an', 'gg'],
    's6-1': ['oa', 'gg', 'xa'], 's6-2': ['an'], 's6-3': ['oa', 'an'], 's6-4': ['oa'], 's6-5': ['oa', 'an'], 't6': ['oa', 'an'],
    's7-1': ['oa', 'an'], 's7-2': ['an', 'oa'], 's7-3': ['an', 'oa', 'gg', 'xa'], 's7-4': ['oa', 'xa', 'gg'], 's7-5': ['oa', 'gg'], 't7': ['an', 'oa'],
    's8-1': ['an', 'gg'], 's8-2': ['oa'], 's8-3': ['an'], 's8-4': ['an', 'gg'], 's8-5': ['gg'], 't8': ['an', 'gg', 'oa'],
    's9-1': ['an'], 's9-2': ['oa', 'an', 'gg'], 's9-3': ['gg'], 's9-4': ['an', 'oa'], 's9-5': ['an', 'gg'], 't9': ['an', 'gg'],
    's10-1': ['oa', 'gg', 'xa'], 's10-2': ['an'], 's10-3': ['an', 'gg'], 's10-4': ['an'], 's10-5': ['oa', 'xa'], 't10': ['oa', 'an'],
    's11-1': ['an', 'oa'], 's11-2': ['oa', 'an'], 's11-3': ['oa', 'an'], 's11-4': ['oa'], 's11-5': ['an'], 't11': ['oa', 'an'],
    's12-1': ['oa'], 's12-2': ['an'], 's12-3': ['an'], 's12-4': ['oa', 'an'], 's12-5': ['an', 'oa', 'gg'],
    's12-6': ['oa', 'an', 'gg'], 's12-7': ['oa', 'xa'], 't12': ['an', 'oa', 'gg']
  };

  P.vendorOf = function (shrineId) { return P.SHRINE_VENDORS[shrineId] || []; };

})(window.TICI = window.TICI || {});
