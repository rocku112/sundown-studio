const fs=require('fs'),path=require('path');
const dir='F:/Github/sundown-studio/tools/luoxia';
const BASE='https://rocku112.github.io/sundown-studio/tools/luoxia/';
const tpl=fs.readFileSync(dir+'/index.html','utf8');

const TOOLS=[
 {t:'pdf',slug:'pdf-to-jpg',
  zh:{title:'PDF 轉 JPG · 免費線上轉檔工具｜落霞千頁',desc:'免費把 PDF 每頁轉成 JPG 圖片，可自訂 DPI 與畫質，支援批量轉換與多頁合併。檔案全在瀏覽器本機處理、不上傳伺服器。',h1:'PDF 轉 JPG — 免費線上轉檔',intro:'把 PDF 每一頁轉存成 JPG 圖片，可調整解析度（DPI）與畫質，支援批量、多頁合併與 ZIP 打包。完全在你的瀏覽器本機處理，不上傳任何伺服器。'},
  en:{title:'PDF to JPG · Free Online Converter | SunDown Studio',desc:'Convert each PDF page to a JPG image for free. Adjustable DPI and quality, batch conversion, all processed locally in your browser — no upload.',h1:'PDF to JPG — Free Online Converter',intro:'Turn every page of a PDF into a JPG image. Adjustable DPI and quality, batch conversion and ZIP packaging. Everything runs locally in your browser — files never leave your device.'}},
 {t:'heic',slug:'heic-to-jpg',
  zh:{title:'HEIC 轉 JPG · 免費線上照片轉換｜落霞千頁',desc:'免費把 iPhone 的 HEIC/HEIF 照片轉成通用 JPG，支援批量、ZIP 打包。本機處理不上傳。',h1:'HEIC 轉 JPG — iPhone 照片轉換',intro:'把 iPhone 拍的 HEIC / HEIF 照片轉成 Windows 也能開的 JPG，支援批量轉換與 ZIP 打包。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'HEIC to JPG · Free Online Photo Converter | SunDown Studio',desc:'Convert iPhone HEIC/HEIF photos to universal JPG for free. Batch conversion, ZIP download, processed locally — no upload.',h1:'HEIC to JPG — Photo Converter',intro:'Convert HEIC / HEIF photos from your iPhone into universal JPG that opens anywhere. Batch conversion and ZIP download, all in your browser — no upload.'}},
 {t:'compress',slug:'compress-image',
  zh:{title:'圖片壓縮 · 免費線上壓縮 JPG/PNG/WebP｜落霞千頁',desc:'免費壓縮 JPG、PNG、WebP 圖片，可依品質或目標大小(KB)壓縮，支援批量。本機處理不上傳。',h1:'圖片壓縮 — 線上免費縮小圖檔',intro:'壓縮 JPG、PNG、WebP 圖片，可用品質模式或指定目標大小(KB)，支援批量與 ZIP 打包。完全在瀏覽器本機處理，不上傳。'},
  en:{title:'Compress Image · Free Online JPG/PNG/WebP Compressor | SunDown Studio',desc:'Compress JPG, PNG and WebP images for free by quality or target size (KB). Batch, ZIP, processed locally in your browser — no upload.',h1:'Compress Image — Free Online',intro:'Shrink JPG, PNG and WebP images by quality or a target size in KB. Batch processing and ZIP download, all local in your browser — no upload.'}},
 {t:'resize',slug:'resize-image',
  zh:{title:'圖片尺寸調整 · 免費線上批量縮放｜落霞千頁',desc:'免費批量調整圖片尺寸，可固定寬高、百分比或自訂尺寸，鎖定比例。本機處理不上傳。',h1:'圖片尺寸調整 — 批量縮放',intro:'批量調整圖片尺寸，支援固定寬、固定高、百分比或自訂寬高並可鎖定比例。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'Resize Image · Free Online Batch Image Resizer | SunDown Studio',desc:'Batch resize images for free by fixed width/height, percentage or custom size with aspect lock. Processed locally — no upload.',h1:'Resize Image — Batch Resizer',intro:'Resize images in batches by fixed width, fixed height, percentage or a custom size with optional aspect-ratio lock. All local in your browser — no upload.'}},
 {t:'pdfops',slug:'merge-split-pdf',
  zh:{title:'PDF 合併/拆分 · 免費線上工具｜落霞千頁',desc:'免費合併多個 PDF 成一份，或依頁數/範圍拆分，可自由排序。本機處理不上傳。',h1:'PDF 合併與拆分 — 免費線上',intro:'把多個 PDF 合併成一份、可自由排序；或依每頁、每 N 頁、自訂範圍拆分。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'Merge & Split PDF · Free Online Tool | SunDown Studio',desc:'Merge multiple PDFs into one or split by pages/range for free, with free reordering. Processed locally — no upload.',h1:'Merge & Split PDF — Free Online',intro:'Combine multiple PDFs into one with free reordering, or split by page, every N pages, or custom ranges. All local in your browser — no upload.'}},
 {t:'pdfcmp',slug:'compress-pdf',
  zh:{title:'PDF 壓縮 · 免費線上縮小 PDF 檔案｜落霞千頁',desc:'免費壓縮 PDF 檔案大小，自動偵測灰階、限制解析度，掃描 PDF 大幅縮小。本機處理不上傳。',h1:'PDF 壓縮 — 縮小檔案大小',intro:'縮小 PDF 檔案大小，可自動偵測灰階、限制影像解析度，對掃描 PDF 特別有效。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'Compress PDF · Free Online PDF Compressor | SunDown Studio',desc:'Reduce PDF file size for free — auto grayscale detection and resolution capping, great for scanned PDFs. Processed locally — no upload.',h1:'Compress PDF — Reduce File Size',intro:'Shrink PDF file size with automatic grayscale detection and resolution limits, especially effective for scanned PDFs. All local — no upload.'}},
 {t:'pdfmix',slug:'combine-pdf-images',
  zh:{title:'PDF 混合合併 · PDF 與圖片合成一份｜落霞千頁',desc:'免費把 PDF 與圖片(JPG/PNG)混合排序後合成一份 PDF，可拖曳排序。本機處理不上傳。',h1:'PDF 與圖片合併成一份 PDF',intro:'把 PDF 檔與圖片(JPG/PNG/WebP)混在一起、自由拖曳排序後合成一份 PDF。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'Combine PDF & Images into One PDF · Free | SunDown Studio',desc:'Merge PDFs and images (JPG/PNG) into a single PDF for free with drag-to-reorder. Processed locally — no upload.',h1:'Combine PDF & Images into One PDF',intro:'Mix PDF files and images (JPG/PNG/WebP), reorder them by dragging, and merge into a single PDF. All local in your browser — no upload.'}},
 {t:'pageman',slug:'organize-pdf-pages',
  zh:{title:'PDF 頁面管理 · 旋轉/刪除/重排頁面｜落霞千頁',desc:'免費線上管理 PDF 頁面：旋轉、刪除、重新排序、插入空白頁，縮圖預覽拖曳。本機處理不上傳。',h1:'PDF 頁面管理 — 旋轉/刪除/重排',intro:'管理 PDF 頁面：旋轉、刪除、拖曳重新排序、插入空白頁，支援縮圖預覽。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'Organize PDF Pages · Rotate, Delete, Reorder · Free | SunDown Studio',desc:'Organize PDF pages for free — rotate, delete, reorder and insert blank pages with thumbnail drag. Processed locally — no upload.',h1:'Organize PDF Pages — Rotate, Delete, Reorder',intro:'Manage PDF pages: rotate, delete, drag to reorder and insert blank pages with thumbnail previews. All local in your browser — no upload.'}},
 {t:'pdfwm',slug:'watermark-pdf',
  zh:{title:'PDF 浮水印 · 加文字/圖片浮水印(支援中文)｜落霞千頁',desc:'免費為 PDF 加文字或圖片浮水印，支援中文、平鋪、透明度與旋轉。本機處理不上傳。',h1:'PDF 浮水印 — 文字/圖片(支援中文)',intro:'為 PDF 每頁加上文字或圖片浮水印，支援中文、平鋪或單一位置、透明度與旋轉。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'Watermark PDF · Add Text or Image Watermark · Free | SunDown Studio',desc:'Add text or image watermarks to PDF for free — tiling, opacity and rotation, CJK supported. Processed locally — no upload.',h1:'Watermark PDF — Text or Image',intro:'Stamp a text or image watermark on every PDF page with tiling or single placement, opacity and rotation (CJK supported). All local — no upload.'}},
 {t:'pdfann',slug:'annotate-pdf',
  zh:{title:'PDF 標註簽名 · 打字/手寫簽名/圖章/改字｜落霞千頁',desc:'免費在 PDF 上打字填寫、手寫簽名、蓋圖章、畫框標註，還能偵測原字體改字。本機處理不上傳。',h1:'PDF 標註與簽名 — 填寫/簽名/改字',intro:'在 PDF 上打字填寫、手寫簽名、蓋圖章、畫框標註，甚至偵測原字體「改字」。全部在瀏覽器本機處理，不上傳。'},
  en:{title:'Annotate & Sign PDF · Fill, Sign, Stamp, Edit Text · Free | SunDown Studio',desc:'Fill, hand-sign, stamp and box-annotate PDFs for free — even edit existing text with font detection. Processed locally — no upload.',h1:'Annotate & Sign PDF — Fill, Sign, Edit',intro:'Type to fill, hand-sign, add stamps and box annotations on PDFs — even replace existing text with font detection. All local — no upload.'}},
];
const LANGS={zh:{code:'zh-TW',sub:''},en:{code:'en',sub:'en/'}};

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function urlFor(tool,lang){return BASE+(lang==='en'?'en/':'')+tool.slug+'.html';}

function gen(tool,lang){
  let h=tpl;const L=LANGS[lang],c=tool[lang];
  const zhUrl=urlFor(tool,'zh'),enUrl=urlFor(tool,'en'),canon=urlFor(tool,lang);
  // 1. lang + title + metas
  h=h.replace('<html lang="zh-TW">',`<html lang="${L.code}">`);
  h=h.replace('<title>落霞千頁 · SunDown Studio</title>',`<title>${esc(c.title)}</title>`);
  h=h.replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(c.desc)}">`);
  h=h.replace(/<meta property="og:title" content="[^"]*">/,`<meta property="og:title" content="${esc(c.title)}">`);
  h=h.replace(/<meta property="og:description" content="[^"]*">/,`<meta property="og:description" content="${esc(c.desc)}">`);
  h=h.replace('<meta property="og:url" content="https://rocku112.github.io/sundown-studio/tools/luoxia/">',
    `<meta property="og:url" content="${canon}">\n<link rel="canonical" href="${canon}">\n<link rel="alternate" hreflang="zh-Hant" href="${zhUrl}">\n<link rel="alternate" hreflang="en" href="${enUrl}">\n<link rel="alternate" hreflang="x-default" href="${zhUrl}">`);
  // 2. inline SD_TOOL (+ SD_VENDOR for en) — anchor on charset meta
  const vend = lang==='en' ? "window.SD_VENDOR='../vendor/';" : "";
  h=h.replace('<meta charset="UTF-8">',`<meta charset="UTF-8">\n<script>window.SD_TOOL='${tool.t}';${vend}</script>`);
  // 3. show app, hide landing
  h=h.replace('<div id="app-wrap" class="hidden">','<div id="app-wrap">');
  h=h.replace('<div id="lp-wrap">','<div id="lp-wrap" class="hidden">');
  // 4. active panel/tab swap (default is pdf)
  if(tool.t!=='pdf'){
    h=h.replace('<div class="tab-panel active" id="panel-pdf">','<div class="tab-panel" id="panel-pdf">');
    h=h.replace(`<div class="tab-panel" id="panel-${tool.t}">`,`<div class="tab-panel active" id="panel-${tool.t}">`);
    h=h.replace('class="tab-btn active" data-tab="pdf"','class="tab-btn" data-tab="pdf"');
    h=h.replace(`class="tab-btn" data-tab="${tool.t}"`,`class="tab-btn active" data-tab="${tool.t}"`);
  }
  // 5. inject SEO header at top of app-wrap
  h=h.replace('<div id="app-wrap">',`<div id="app-wrap">\n<header class="sd-seo"><h1>${esc(c.h1)}</h1><p>${esc(c.intro)}</p></header>`);
  // 6. en path rewrites (one level deeper)
  if(lang==='en'){
    h=h.replace(/href="favicon\.svg"/g,'href="../favicon.svg"');
    h=h.replace(/href="css\//g,'href="../css/');
    h=h.replace(/src="js\//g,'src="../js/');
    h=h.replace(/src="vendor\//g,'src="../vendor/');
    h=h.replace(/"\.\.\/\.\.\/brand\.js"/g,'"../../../brand.js"');
    h=h.replace(/'\.\.\/\.\.\/index\.html'/g,"'../../../index.html'");
  }
  return h;
}

let n=0;
for(const tool of TOOLS){
  for(const lang of ['zh','en']){
    const sub=lang==='en'?'en/':'';
    const outDir=dir+'/'+sub; fs.mkdirSync(outDir,{recursive:true});
    fs.writeFileSync(outDir+tool.slug+'.html', gen(tool,lang),'utf8'); n++;
  }
}
console.log('generated',n,'pages');
