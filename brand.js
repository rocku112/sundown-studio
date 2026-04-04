/* ══════════════════════════════
   SUNDOWN STUDIO · brand.js
   套用方式：在 </body> 前加入
   <script src="brand.js"></script>

   可選設定（在 script 之前定義）：
   window.SD_CONFIG = {
     product: '傷當有計',       // 目前產品名稱
     productColor: '#C0622A',   // 產品主色（頂部色條）
     portalUrl: 'index.html',   // 門戶頁網址
   }
══════════════════════════════ */
(function(){
  const CFG = window.SD_CONFIG || {};
  const portalUrl    = CFG.portalUrl    || 'index.html';
  const productName  = CFG.product      || '';
  const productColor = CFG.productColor || '#E8B84B';
  const noNav    = CFG.noNav    || false;
  const noFooter = CFG.noFooter || false;

  const LOGO_SVG = `<svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="sd-clip"><circle cx="256" cy="256" r="240"/></clipPath></defs>
    <circle cx="256" cy="256" r="256" fill="#1E3554"/>
    <path d="M16 256 A240 240 0 0 1 496 256" fill="#E8B84B" clip-path="url(#sd-clip)"/>
    <line x1="62"  y1="295" x2="450" y2="295" stroke="#fff" stroke-width="26" stroke-linecap="round" opacity=".85"/>
    <line x1="96"  y1="338" x2="416" y2="338" stroke="#fff" stroke-width="22" stroke-linecap="round" opacity=".65"/>
    <line x1="138" y1="378" x2="374" y2="378" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".45"/>
    <line x1="178" y1="413" x2="334" y2="413" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".28"/>
  </svg>`;

  /* ── 注入 Google Font ── */
  if(!document.querySelector('link[href*="Jost"]')){
    const lk = document.createElement('link');
    lk.rel  = 'stylesheet';
    lk.href = 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;600;700;800;900&family=Noto+Sans+TC:wght@400;500;700&display=swap';
    document.head.appendChild(lk);
  }

  /* ── 注入 brand.css ── */
  if(!document.querySelector('link[href*="brand.css"]')){
    const lk = document.createElement('link');
    lk.rel  = 'stylesheet';
    lk.href = 'brand.css';
    document.head.appendChild(lk);
  }

  /* ── 注入 Nav 樣式 ── */
  const style = document.createElement('style');
  style.textContent = `
    #sd-nav{
      position:fixed;top:0;left:0;right:0;z-index:9999;
      padding:0 8vw;height:64px;
      display:flex;align-items:center;justify-content:space-between;
      background:rgba(245,240,232,0);
      border-bottom:1px solid transparent;
      transition:background .35s,border-color .35s,backdrop-filter .35s;
      font-family:'Jost','Noto Sans TC',sans-serif;
    }
    #sd-nav.sd-scrolled{
      background:rgba(245,240,232,.93);
      backdrop-filter:blur(16px);
      border-color:#DDD6C8;
    }
    .sd-nav-brand-block{display:flex;align-items:center;gap:12px;text-decoration:none}
    .sd-nav-logo{width:40px;height:40px;flex-shrink:0}
    .sd-nav-brand-name{font-size:15px;font-weight:900;letter-spacing:.06em;color:#1E3554;line-height:1.1}
    .sd-nav-brand-name span{color:#C9960A}
    .sd-nav-brand-sub{font-size:11px;color:#8A96A8;letter-spacing:.06em;margin-top:2px;font-family:'Noto Sans TC',sans-serif}
    .sd-nav-links{display:flex;align-items:center;gap:20px}
    .sd-nav-link{
      font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;
      color:#8A96A8;text-decoration:none;cursor:pointer;
      transition:color .2s;background:none;border:none;
      font-family:'Jost',sans-serif;padding:0;
    }
    .sd-nav-link:hover{color:#1E3554}
    .sd-nav-cta{
      color:#fff;background:#1E3554;
      padding:7px 16px;border-radius:3px;
      font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;
      text-decoration:none;transition:background .2s;
      font-family:'Jost',sans-serif;
    }
    .sd-nav-cta:hover{background:#2D4A6E}
    .sd-product-bar{
      position:fixed;top:64px;left:0;right:0;z-index:9998;
      height:3px;background:var(--sd-product-color,#E8B84B);
      opacity:0;transition:opacity .3s;
    }
    #sd-nav.sd-scrolled ~ .sd-product-bar{opacity:1}
    @media(max-width:600px){.sd-nav-links .sd-nav-link:not(.sd-nav-cta){display:none}}

    #sd-footer{
      background:#EDE7D9;
      border-top:1px solid #DDD6C8;
      padding:32px 8vw 24px;
      font-family:'Jost','Noto Sans TC',sans-serif;
    }
    .sd-footer-top{
      display:flex;flex-wrap:wrap;
      justify-content:space-between;align-items:flex-start;
      gap:24px;margin-bottom:20px;
    }
    .sd-footer-brand-block{display:flex;align-items:center;gap:12px}
    .sd-footer-logo{width:36px;height:36px;flex-shrink:0}
    .sd-footer-brand-name{font-size:14px;font-weight:900;letter-spacing:.06em;color:#1E3554;opacity:.7;line-height:1.1}
    .sd-footer-brand-name span{color:#C9960A}
    .sd-footer-tagline{font-size:11px;color:#8A96A8;margin-top:2px;font-family:'Noto Sans TC',sans-serif}
    .sd-footer-links{display:flex;gap:32px;flex-wrap:wrap}
    .sd-footer-col-title{font-size:9px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#C9960A;margin-bottom:8px}
    .sd-footer-col a{display:block;font-size:12px;color:#8A96A8;text-decoration:none;margin-bottom:5px;transition:color .2s;cursor:pointer}
    .sd-footer-col a:hover{color:#1E3554}
    .sd-footer-bottom{
      padding-top:16px;border-top:1px solid #DDD6C8;
      display:flex;flex-direction:column;align-items:center;gap:6px;
    }
    .sd-footer-bottom-brand{display:flex;align-items:center;gap:8px}
    .sd-footer-bottom-logo{width:20px;height:20px;flex-shrink:0}
    .sd-footer-product-line{font-size:12px;color:#4A5568;font-weight:600;letter-spacing:.04em;font-family:'Jost',sans-serif}
    .sd-footer-product-line span{color:#C9960A}
    .sd-footer-copy{font-size:10px;color:#8A96A8;letter-spacing:.05em}
  `;
  document.head.appendChild(style);

  document.documentElement.style.scrollPaddingTop = '64px';

  /* ── Nav ── */
  if(noNav) return;
  const nav = document.createElement('nav');
  nav.id = 'sd-nav';
  nav.innerHTML = `
    <a class="sd-nav-brand-block" href="${portalUrl}">
      <div class="sd-nav-logo">${LOGO_SVG}</div>
      <div>
        <div class="sd-nav-brand-name">Sun<span>Down</span> Studio</div>
        <div class="sd-nav-brand-sub">日落工作室${productName ? ' · ' + productName : ''}</div>
      </div>
    </a>
    <div class="sd-nav-links">
      <a class="sd-nav-link" href="${portalUrl}">首頁</a>
      <a class="sd-nav-cta" href="${portalUrl}#products">所有產品</a>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);

  /* 產品色條 */
  const bar = document.createElement('div');
  bar.className = 'sd-product-bar';
  bar.style.setProperty('--sd-product-color', productColor);
  document.body.insertBefore(bar, nav.nextSibling);

  /* Nav scroll */
  window.addEventListener('scroll', function(){
    nav.classList.toggle('sd-scrolled', window.scrollY > 40);
  }, {passive:true});

  /* top padding */
  const firstEl = document.body.children[2];
  if(firstEl && firstEl.id !== 'sd-footer'){
    const cur = parseInt(getComputedStyle(firstEl).paddingTop) || 0;
    if(cur < 64) firstEl.style.paddingTop = Math.max(cur, 64) + 'px';
  }

  /* ── Footer ── */
  if(noFooter) return;
  const footer = document.createElement('footer');
  footer.id = 'sd-footer';
  footer.innerHTML = `
    <div class="sd-footer-top">
      <div class="sd-footer-brand-block">
        <div class="sd-footer-logo">${LOGO_SVG}</div>
        <div>
          <div class="sd-footer-brand-name">Sun<span>Down</span> Studio</div>
          <div class="sd-footer-tagline">日落工作室 · 台灣在地專業工具</div>
        </div>
      </div>
      <div class="sd-footer-links">
        <div class="sd-footer-col">
          <div class="sd-footer-col-title">產品</div>
          <a href="${portalUrl}#product-0">傷當有計</a>
          <a href="${portalUrl}#product-1">早謀遠算</a>
          <a href="${portalUrl}#product-2">永續學習平台</a>
          <a href="${portalUrl}#product-3">文件工具套件</a>
        </div>
        <div class="sd-footer-col">
          <div class="sd-footer-col-title">關於</div>
          <a href="${portalUrl}#about">品牌故事</a>
          <a href="${portalUrl}">回到首頁</a>
        </div>
      </div>
    </div>
    <div class="sd-footer-bottom">
      <div class="sd-footer-bottom-brand">
        <div class="sd-footer-bottom-logo">${LOGO_SVG}</div>
        <div class="sd-footer-product-line"><span>SunDown</span> Studio &nbsp;©&nbsp; 日落工作室${productName ? ' · ' + productName : ''}</div>
      </div>
      <div class="sd-footer-copy">© 2025 SunDown Studio · All rights reserved</div>
    </div>
  `;
  document.body.appendChild(footer);

  /* scroll reveal */
  const obs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting) e.target.classList.add('sd-visible');
    });
  }, {threshold:0.1});
  document.querySelectorAll('.sd-reveal').forEach(function(el){ obs.observe(el); });

})();
