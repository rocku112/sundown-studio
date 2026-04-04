/* ══════════════════════════════
   SUNDOWN STUDIO · brand.js
   套用方式：在 </body> 前加入
   <script src="brand.js"></script>

   可選設定（在 script 之前定義）：
   window.SD_CONFIG = {
     product: '傷當有計',       // 目前產品名稱（Nav 會顯示）
     productColor: '#C0622A',   // 產品主色（頂部色條）
     portalUrl: 'index.html',   // 門戶頁網址
   }
══════════════════════════════ */
(function(){
  const CFG = window.SD_CONFIG || {};
  const portalUrl   = CFG.portalUrl   || 'index.html';
  const productName = CFG.product     || '';
  const productColor= CFG.productColor|| '#E8B84B';

  /* ── 注入 Google Font（若尚未載入） ── */
  if(!document.querySelector('link[href*="Jost"]')){
    const lk = document.createElement('link');
    lk.rel  = 'stylesheet';
    lk.href = 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;600;700;800;900&family=Noto+Sans+TC:wght@400;500;700&display=swap';
    document.head.appendChild(lk);
  }

  /* ── 注入 brand.css（若尚未載入） ── */
  if(!document.querySelector('link[href*="brand.css"]')){
    const lk = document.createElement('link');
    lk.rel  = 'stylesheet';
    lk.href  = 'brand.css';
    document.head.appendChild(lk);
  }

  /* ── 推擠產品內容，避免被固定 Nav 蓋住 ── */
  document.documentElement.style.scrollPaddingTop = '60px';

  /* ── 建立 Nav HTML ── */
  const nav = document.createElement('nav');
  nav.id = 'sd-nav';
  nav.innerHTML = `
    <a class="sd-nav-brand" href="${portalUrl}">
      Sun<span>Down</span>&nbsp;Studio
    </a>
    <div class="sd-nav-links">
      ${productName ? `<span class="sd-nav-link" style="color:var(--gold);pointer-events:none">${productName}</span>` : ''}
      <a class="sd-nav-link" href="${portalUrl}">首頁</a>
      <a class="sd-nav-link sd-cta" href="${portalUrl}#products">所有產品</a>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);

  /* 產品色條 */
  const bar = document.createElement('div');
  bar.className = 'sd-product-bar';
  bar.style.setProperty('--sd-product-color', productColor);
  document.body.insertBefore(bar, nav.nextSibling);

  /* ── Nav scroll tint ── */
  window.addEventListener('scroll', function(){
    nav.classList.toggle('sd-scrolled', window.scrollY > 40);
  }, {passive: true});

  /* ── 給產品內容加 top padding 避免被 nav 蓋住 ── */
  const firstEl = document.body.children[2]; // nav, bar, then content
  if(firstEl && firstEl.tagName !== 'FOOTER'){
    const cur = parseInt(getComputedStyle(firstEl).paddingTop) || 0;
    if(cur < 60) firstEl.style.paddingTop = Math.max(cur, 60) + 'px';
  }

  /* ── 建立 Footer HTML ── */
  const footer = document.createElement('footer');
  footer.id = 'sd-footer';
  footer.innerHTML = `
    <div class="sd-footer-top">
      <div>
        <div class="sd-footer-brand">Sun<span>Down</span> Studio</div>
        <div class="sd-footer-tagline">日落工作室 · 台灣在地專業工具</div>
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
      <div class="sd-footer-copy">© 2025 SunDown Studio · All rights reserved</div>
      <div class="sd-footer-note">工具免費用，理賠自己顧。</div>
    </div>
  `;
  document.body.appendChild(footer);

  /* ── sd-reveal 滾動動畫 ── */
  const obs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting) e.target.classList.add('sd-visible');
    });
  }, {threshold: 0.1});
  document.querySelectorAll('.sd-reveal').forEach(function(el){ obs.observe(el); });

})();
