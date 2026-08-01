const fs=require('fs');
const dir='F:/Github/sundown-studio/tools/luoxia';
const BASE='https://rocku112.github.io/sundown-studio/tools/luoxia/';
let h=fs.readFileSync(dir+'/index.html','utf8');

// ── translate landing only (between lp-wrap and app-wrap) with anchored replacements ──
const a=h.indexOf('<div id="lp-wrap">'), b=h.indexOf('<div id="app-wrap"');
let L=h.slice(a,b);
const D=[
 ['落霞<b>千頁</b>','SunDown<b> Studio</b>'],
 ['文件工具套件 · SunDown Studio','Local file tools · SunDown Studio'],
 ['#lp-tools">工具</a>','#lp-tools">Tools</a>'],
 ['#lp-preview">預覽</a>','#lp-preview">Preview</a>'],
 ['#lp-trust">關於</a>','#lp-trust">About</a>'],
 ['<a class="lp-nav-link lp-lang" href="en/" hreflang="en">EN</a>','<a class="lp-nav-link lp-lang" href="../" hreflang="zh-Hant">中文</a>'],
 ['    開始使用\n','    Get started\n'],
 ['所有檔案本機處理，絕不上傳伺服器','All files processed locally — never uploaded'],
 ['文件處理，<br>','Your files,<br>'],
 ['一頁搞定','done in the browser'],
 ['PDF 轉圖、照片轉換、圖片壓縮、PDF 合併壓縮。','PDF to image, photo conversion, image compression, merge & compress PDF.'],
 ['十一種工具，完全在你的裝置上執行。','Eleven tools, all running on your own device.'],
 ['免費、免帳號、免安裝。','Free, no account, no install.'],
 ['立即免費使用','Start free now'],
 ['查看所有工具','See all tools'],
 ['lp-stat-l">文件工具<','lp-stat-l">Tools<'],
 ['lp-stat-l">本機處理<','lp-stat-l">Local<'],
 ['lp-stat-l">帳號需求<','lp-stat-l">Accounts<'],
 ['lp-stat-l">完全免費<','lp-stat-l">Free<'],
 ['>工具預覽</div>','>Tool preview</div>'],
 ['直覺操作，<br>拖放即可開始','Intuitive —<br>drag &amp; drop to start'],
 ['落霞千頁 · SunDown Studio','SunDown Studio'],
 ['>壓縮設定</div>','>Compress settings</div>'],
 ['>JPEG 品質</span>','>JPEG quality</span>'],
 ['>色彩模式</span>','>Color mode</span>'],
 ['>自動偵測</span>','>Auto-detect</span>'],
 ['>統計</div>','>Stats</div>'],
 ['>PDF 數</span>','>PDFs</span>'],
 ['>壓縮率</span>','>Ratio</span>'],
 ['#8A8E96">圖片壓縮</div>','#8A8E96">Compress</div>'],
 ['#8A8E96">PDF 壓縮</div>','#8A8E96">Compress PDF</div>'],
 ['拖放或點擊選取 PDF 檔案','Drag or click to select PDF files'],
 ['✓ 完成','✓ Done'],
 ['處理中...','Processing...'],
 ['+ 加入','+ Add'],
 ['>輸出品質<','>Output quality<'],
 ['>處理進度<','>Progress<'],
 ['>選擇工具</div>','>Choose a tool</div>'],
 ['十一種功能，一站完成','Eleven tools, one place'],
 ['PDF、圖片、照片，各種文件格式問題，全部解決。','PDF, images, photos — every file-format problem, solved.'],
 // tool cards: tag / name / desc
 ['tc-tag">PDF 轉換</div>','tc-tag">PDF convert</div>'],
 ['tc-desc">批量將 PDF 每頁輸出為 JPG，支援自訂 DPI 與品質。</p>','tc-desc">Export every PDF page as JPG with custom DPI and quality.</p>'],
 ['tc-tag">照片轉換</div>','tc-tag">Photo convert</div>'],
 ['tc-desc">批量轉換 iPhone 拍的 HEIC 照片，ZIP 打包或逐一下載。</p>','tc-desc">Batch-convert iPhone HEIC photos, ZIP or one by one.</p>'],
 ['tc-tag">圖片壓縮</div>','tc-tag">Image compress</div>'],
 ['tc-name">圖片壓縮</div>','tc-name">Compress Image</div>'],
 ['tc-desc">JPG、PNG、WebP 批量壓縮，品質或目標大小模式。</p>','tc-desc">Batch-compress JPG, PNG, WebP by quality or target size.</p>'],
 ['tc-tag">圖片縮放</div>','tc-tag">Image resize</div>'],
 ['tc-name">尺寸調整</div>','tc-name">Resize Image</div>'],
 ['tc-desc">批量縮放圖片，固定寬高、百分比或自訂尺寸。</p>','tc-desc">Batch-resize by fixed size, percentage or custom.</p>'],
 ['tc-tag">PDF 操作 <span','tc-tag">PDF ops <span'],
 ['tc-name">PDF 合併/拆分</div>','tc-name">Merge & Split PDF</div>'],
 ['tc-desc">多個 PDF 合成一份，或依頁數拆開，可自由排序。</p>','tc-desc">Combine PDFs into one or split by pages, freely reorder.</p>'],
 ['tc-tag">PDF 壓縮 <span','tc-tag">PDF compress <span'],
 ['tc-name">PDF 壓縮</div>','tc-name">Compress PDF</div>'],
 ['tc-desc">自動偵測灰階、限制解析度，掃描 PDF 大幅縮小體積。</p>','tc-desc">Auto grayscale detection and resolution caps shrink scanned PDFs.</p>'],
 ['tc-tag">PDF 合成 <span','tc-tag">PDF combine <span'],
 ['tc-name">混合合併 PDF</div>','tc-name">Combine PDF & Images</div>'],
 ['tc-desc">PDF 與圖片混排合成一份，可自由排序拖放。</p>','tc-desc">Mix PDFs and images into one PDF, drag to reorder.</p>'],
 ['tc-tag">PDF 編輯 <span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:#2D4A6E','tc-tag">PDF edit <span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:#2D4A6E'],
 ['tc-name">頁面管理</div>','tc-name">Organize Pages</div>'],
 ['tc-desc">旋轉、刪除、重新排序頁面，或插入空白頁後輸出。</p>','tc-desc">Rotate, delete, reorder pages or insert blank pages.</p>'],
 ['tc-tag">PDF 浮水印 <span','tc-tag">PDF watermark <span'],
 ['tc-name">PDF 浮水印</div>','tc-name">Watermark PDF</div>'],
 ['tc-desc">加文字或圖片浮水印，支援中文、平鋪、透明度與旋轉。</p>','tc-desc">Add text or image watermarks — tiling, opacity, rotation.</p>'],
 ['tc-tag">PDF 編輯 <span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:#1D7A6A','tc-tag">PDF edit <span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:#1D7A6A'],
 ['tc-name">標註 / 簽名</div>','tc-name">Annotate & Sign</div>'],
 ['tc-desc">在 PDF 上打字填寫、手寫簽名、蓋圖章、畫框標註後輸出。</p>','tc-desc">Type to fill, hand-sign, stamp and box-annotate PDFs.</p>'],
 ['tc-tag">文件取圖 <span','tc-tag">Office images <span'],
 ['tc-name">Office 取圖</div>','tc-name">Office Images</div>'],
 ['tc-desc">從 Word / PowerPoint / Excel 撈出內嵌圖片，輸出 JPG。</p>','tc-desc">Extract embedded images from Word, PowerPoint and Excel as JPG.</p>'],
 ['進入工具 <svg','Open tool <svg'],
 // trust
 ['安全 · 免費 · 本機','Private · Free · Local'],
 ['你的檔案，只在你的裝置上','Your files stay on your device'],
 ['落霞千頁所有處理都在瀏覽器本地執行。<br>沒有伺服器接收你的檔案，沒有帳號，沒有訂閱費用。','All processing happens locally in your browser.<br>No server receives your files. No account, no subscription.'],
 ['立即開始，完全免費','Start now — completely free'],
 ['</svg> 不上傳任何伺服器</div>','</svg> No server upload</div>'],
 ['</svg> 免帳號免登入</div>','</svg> No account</div>'],
 ['</svg> 完全免費</div>','</svg> Free</div>'],
 ['</svg> 無廣告</div>','</svg> No ads</div>'],
 // footer
 ['<strong>SunDown Studio 日落工作室</strong> · 落霞千頁 &nbsp;·&nbsp;\n  所有檔案均在本機處理，不上傳至任何伺服器','<strong>SunDown Studio</strong> &nbsp;·&nbsp;\n  All files processed locally, never uploaded to any server'],
];
for(const [zh,en] of D) L=L.split(zh).join(en);
h=h.slice(0,a)+L+h.slice(b);

// ── head ──
const enUrl=BASE+'en/', zhUrl=BASE;
h=h.replace('<html lang="zh-TW">','<html lang="en">');
h=h.replace('<title>落霞千頁 · SunDown Studio</title>','<title>Free Local File Tools — PDF, Image & HEIC | SunDown Studio</title>');
h=h.replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="Free online file tools that run entirely in your browser — PDF to JPG, HEIC to JPG, image compression, resize, merge/split/compress PDF, watermark and annotate. No upload, no account.">');
h=h.replace(/<meta property="og:title" content="[^"]*">/,'<meta property="og:title" content="SunDown Studio — Free Local File Tools">');
h=h.replace(/<meta property="og:description" content="[^"]*">/,'<meta property="og:description" content="Ten free file tools, all processed locally in your browser — no upload, no account. PDF to JPG, HEIC, image compression, merge/split/compress PDF, and more.">');
h=h.replace(/<meta name="twitter:title" content="[^"]*">/,'<meta name="twitter:title" content="SunDown Studio · Free Local File Tools">');
h=h.replace(/<meta name="twitter:description" content="[^"]*">/,'<meta name="twitter:description" content="PDF to JPG, HEIC, image compression, merge/split/compress PDF. Processed locally in your browser — no upload.">');
h=h.replace('<meta property="og:url" content="https://rocku112.github.io/sundown-studio/tools/luoxia/">',
  `<meta property="og:url" content="${enUrl}">\n<link rel="canonical" href="${enUrl}">\n<link rel="alternate" hreflang="zh-Hant" href="${zhUrl}">\n<link rel="alternate" hreflang="en" href="${enUrl}">\n<link rel="alternate" hreflang="x-default" href="${zhUrl}">`);
// SD_VENDOR so core.js finds ../vendor/
h=h.replace('<meta charset="UTF-8">','<meta charset="UTF-8">\n<script>window.SD_VENDOR=\'../vendor/\';</script>');

// ── path rewrites for /en/ ──
h=h.replace(/href="favicon\.svg"/g,'href="../favicon.svg"');
h=h.replace(/href="css\//g,'href="../css/');
h=h.replace(/src="js\//g,'src="../js/');
h=h.replace(/src="vendor\//g,'src="../vendor/');
h=h.replace(/"\.\.\/\.\.\/brand\.js"/g,'"../../../brand.js"');
h=h.replace(/'\.\.\/\.\.\/index\.html'/g,"'../../../index.html'");

fs.mkdirSync(dir+'/en',{recursive:true});
fs.writeFileSync(dir+'/en/index.html',h,'utf8');
// report any leftover CJK inside the landing region of the output
const oa=h.indexOf('<div id="lp-wrap">'), ob=h.indexOf('<div id="app-wrap"');
const leftover=(h.slice(oa,ob).match(/[一-鿿]+/g)||[]);
console.log('wrote en/index.html; leftover CJK in landing:', leftover.length? [...new Set(leftover)].join(' ') : 'none');
