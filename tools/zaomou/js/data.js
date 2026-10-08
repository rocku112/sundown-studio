/* 早謀遠算 · 法令與統計參數
   所有會隨年度公告更新的數字集中在這裡，更新時只改這個檔案。 */

export const DATA_YEAR = 115; // 參數適用年度（民國）

/* 勞保投保薪資分級表（115 年 1 月 1 日起，共 11 級）
   最低工資調為 29,500 後，原第 1 級 27,470、第 2 級 28,800 併入新第 1 級。 */
export const INSURANCE_GRADES = [29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800];
export const INSURANCE_MAX = 45800;

/* 勞退月提繳工資上限（勞工退休金月提繳分級表最高級） */
export const PENSION_WAGE_MAX = 150000;
export const EMPLOYER_RATE = 6; // 雇主法定提繳率 %
export const NEW_SYSTEM_START = 2005.5; // 勞退新制 94 年 7 月 1 日施行
export const LABOR_PENSION_AGE = 60; // 勞工退休金條例第 24 條：年滿 60 歲始得請領

/* 勞保老年年金：法定請領年齡依出生年次（勞工保險條例第 58 條） */
export function legalPensionAge(birthYear) {
  if (birthYear <= 1957) return 60;
  if (birthYear >= 1962) return 65;
  return 60 + (birthYear - 1957);
}
export const PENSION_ADJ_PER_YEAR = 0.04; // 提前／延後每年 ±4%，最多 5 年
export const PENSION_ADJ_MAX_YEARS = 5;
export const PENSION_MIN_YEARS = 15; // 年資滿 15 年才能請領年金，未滿請領一次金

/* 退休年齡的平均餘命（年）。
   60–70 歲為生命表參考值；超出範圍以 65 歲值每歲約 0.72 年線性外推。
   healthAge：健康平均壽命參考值；birth：113 年簡易生命表 0 歲平均壽命。 */
export const LIFE_TABLE = {
  male: {
    ex: { 60: 22.04, 61: 21.26, 62: 20.49, 63: 19.74, 64: 18.99, 65: 18.26, 66: 17.54, 67: 16.84, 68: 16.15, 69: 15.48, 70: 14.82 },
    healthAge: 72.4,
    birth: 77.42,
  },
  female: {
    ex: { 60: 25.96, 61: 25.15, 62: 24.35, 63: 23.56, 64: 22.77, 65: 22.0, 66: 21.24, 67: 20.49, 68: 19.75, 69: 19.03, 70: 18.31 },
    healthAge: 79.7,
    birth: 84.3,
  },
};

/* 最低生活費（衛福部及直轄市政府公告，115 年度，元／月） */
export const MIN_LIVING = [
  { name: '臺北市', min: 20744 },
  { name: '新北市', min: 17750 },
  { name: '桃園市', min: 17186 },
  { name: '臺中市', min: 16431 },
  { name: '臺南市', min: 15515 },
  { name: '高雄市', min: 16970 },
  { name: '臺灣省各縣市', min: 15515 },
  { name: '金門縣、連江縣', min: 15173 },
];

/* 生活費級距：以所在地最低生活費為基準的倍數 */
export const EXPENSE_LEVELS = [
  { label: '最低生活', mult: 1, tip: '社會救助門檻' },
  { label: '基本生活', mult: 1.5, tip: '單人、精簡開銷' },
  { label: '舒適生活', mult: 2, tip: '含一般休閒' },
  { label: '寬裕生活', mult: 3, tip: '含旅遊與醫療預備' },
];

/* 勞退基金歷史報酬參考（快選用） */
export const RETURN_PRESETS = [
  { label: '保守 2%', v: 2 },
  { label: '穩健 4%', v: 4 },
  { label: '長期平均 6%', v: 6 },
  { label: '樂觀 8%', v: 8 },
];
