pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';


// ─── Helper: set lucide icon on a button (works after lucide replaces <i> with <svg>) ──
function setSbIcon(btn, iconName) {
  btn.innerHTML = `<i data-lucide="${iconName}" style="width:15px;height:15px;"></i>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Sidebar toggle ────────────────────────────────────────────────────────────
function toggleSidebar() {
  const isMobile = window.matchMedia('(max-width:900px)').matches;
  const btn = document.getElementById('sbToggleBtn');
  if (!btn) return;
  if (isMobile) {
    const sb = document.querySelector('.tab-panel.active .sidebar');
    if (!sb) return;
    const open = sb.classList.toggle('sb-open');
    setSbIcon(btn, open ? 'panel-right-close' : 'panel-right-open');
    btn.classList.toggle('sb-closed', !open);
  } else {
    const hidden = !!document.querySelector('.sidebar.sb-hidden');
    document.querySelectorAll('.sidebar').forEach(sb =>
      hidden ? sb.classList.remove('sb-hidden') : sb.classList.add('sb-hidden'));
    const nowHidden = !hidden;
    setSbIcon(btn, nowHidden ? 'panel-right-open' : 'panel-right-close');
    btn.classList.toggle('sb-closed', nowHidden);
    localStorage.setItem('sbPref', nowHidden ? 'hide' : 'show');
  }
}

// ─── Shared ────────────────────────────────────────────────────────────────────
function switchTab(name) {
  const valid = ['pdf','heic','compress','resize','pdfops','pdfcmp','pdfmix','pageman','pdfwm','pdfann'];
  if (!valid.includes(name)) return;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add('active');
  history.replaceState(null, '', '#' + name);
  // close mobile sidebar when switching tabs
  if (window.matchMedia('(max-width:900px)').matches) {
    document.querySelectorAll('.sidebar').forEach(sb => sb.classList.remove('sb-open'));
    const btn = document.getElementById('sbToggleBtn');
    if (btn) {
      setSbIcon(btn, 'panel-right-open');
      btn.classList.add('sb-closed');
    }
  }
}
let _tt;
function toast(msg, err=false) {
  const el=document.getElementById('toast'); el.textContent=msg; el.className=err?'error show':'show';
  clearTimeout(_tt); _tt=setTimeout(()=>el.className='',3500);
}
function fmtSz(b) { return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB'; }
function tick()    { return new Promise(r=>setTimeout(r,0)); }
function dlBlob(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1000);
}
function parsePageRange(str,total) {
  const p=new Set();
  str.split(',').forEach(s=>{const m=s.trim().match(/^(\d+)(?:-(\d+))?$/);if(m){const f=+m[1],t=m[2]?+m[2]:f;for(let i=f;i<=Math.min(t,total);i++)p.add(i);}});
  return [...p].sort((a,b)=>a-b);
}
async function loadImg(file) {
  return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);res(img);};img.onerror=(e)=>{URL.revokeObjectURL(url);rej(e);};img.src=url;});
}
function imgToCanvas(img,w,h,mime) {
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx=cv.getContext('2d');
  if(mime==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
  ctx.drawImage(img,0,0,w,h); return cv;
}
function ext(mime,orig) {
  if(mime==='image/jpeg') return '.jpg';
  if(mime==='image/png')  return '.png';
  if(mime==='image/webp') return '.webp';
  const m=orig.match(/\.[^.]+$/); return m?m[0]:'.jpg';
}

// ════════════════════════════════════════════════
//  1. PDF → JPG
// ════════════════════════════════════════════════
const pS={files:[],conv:false,done:0,imgs:0};
const pdfDZ=document.getElementById('pdfDZ'),pdfFI=document.getElementById('pdfFI'),pdfGrid=document.getElementById('pdfGrid');
const pdfCvt=document.getElementById('pdfCvt'),pdfClr=document.getElementById('pdfClr');

document.getElementById('pdfDpi').oninput=()=>document.getElementById('pdfDpiV').textContent=document.getElementById('pdfDpi').value;
document.getElementById('pdfQual').oninput=()=>document.getElementById('pdfQualV').textContent=document.getElementById('pdfQual').value;
document.getElementById('pdfGap').oninput=()=>{document.getElementById('pdfGapV').textContent=document.getElementById('pdfGap').value+'px';pdfMP();};
document.getElementById('pdfPM').onchange=()=>document.getElementById('pdfRR').style.display=document.getElementById('pdfPM').value==='range'?'flex':'none';
document.getElementById('pdfMT').onchange=()=>{const c=document.getElementById('pdfMT').checked;const o=document.getElementById('pdfMO');o.style.opacity=c?'1':'.35';o.style.pointerEvents=c?'auto':'none';pdfMP();};
document.getElementById('pdfMC').onchange=pdfMP;
document.getElementById('pdfML').onchange=pdfMP;

function pdfMP() {
  const preview=document.getElementById('pdfMP'),n=+document.getElementById('pdfMC').value,layout=document.getElementById('pdfML').value,en=document.getElementById('pdfMT').checked;
  let cols=layout==='horizontal'?n:layout==='vertical'?1:Math.ceil(Math.sqrt(n));
  let rows=layout==='horizontal'?1:layout==='vertical'?n:Math.ceil(n/cols);
  const cw=layout==='vertical'?34:Math.max(20,Math.floor(140/cols)),ch=Math.round(cw*1.414);
  const cells=Array.from({length:n},(_,i)=>`<div class="merge-cell" style="width:${cw}px;height:${ch}px;">p${i+1}</div>`).join('');
  let ws='display:flex;gap:3px;';ws+=layout==='horizontal'?'flex-direction:row;align-items:center;':layout==='vertical'?'flex-direction:column;align-items:center;':`flex-direction:row;flex-wrap:wrap;width:${cols*(cw+3)}px;justify-content:center;`;
  let rw=layout==='horizontal'?cw*n+3*(n-1):layout==='vertical'?cw:cw*cols+3*(cols-1),rh=layout==='horizontal'?ch:layout==='vertical'?ch*n+3*(n-1):ch*rows+3*(rows-1);
  const sc=Math.min(1,110/rw);rw=Math.round(rw*sc);rh=Math.round(rh*sc);
  preview.innerHTML=`<div class="merge-cells" style="${ws}">${cells}</div><div class="merge-arrow">↓</div><div class="merge-res" style="width:${rw}px;height:${rh}px;font-size:${Math.max(8,Math.min(10,rh/3))}px;">1 JPG</div><div class="merge-desc">${en?`每${n}頁合成一張（${['橫排','直排','格狀'][['horizontal','vertical','grid'].indexOf(layout)]}）`:'停用 — 每頁單獨輸出'}</div>`;
}
pdfMP();

pdfDZ.onclick=()=>pdfFI.click();
pdfFI.onchange=e=>pdfHF([...e.target.files]);
pdfDZ.ondragover=e=>{e.preventDefault();pdfDZ.classList.add('dragover');};
pdfDZ.ondragleave=()=>pdfDZ.classList.remove('dragover');
pdfDZ.ondrop=e=>{e.preventDefault();pdfDZ.classList.remove('dragover');pdfHF([...e.dataTransfer.files].filter(f=>f.name.endsWith('.pdf')));};

async function pdfHF(files){for(const f of files){if(pS.files.find(x=>x.name===f.name&&x.size===f.size))continue;const id='p'+Date.now()+Math.random().toString(36).slice(2);const en={name:f.name,size:f.size,id,pc:0,doc:null};pS.files.push(en);pdfAddCard(en);pdfLoad(f,en);}pdfUI();}
async function pdfLoad(file,en){const card=document.getElementById(en.id),bar=card?.querySelector('.lbar');try{const ab=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data:ab}).promise;en.doc=pdf;en.pc=pdf.numPages;if(bar){bar.style.width='100%';setTimeout(()=>bar.style.display='none',400);}const pg=await pdf.getPage(1),vp=pg.getViewport({scale:.5}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;const prev=card?.querySelector('.prev');if(prev){prev.innerHTML='';const img=document.createElement('img');img.src=cv.toDataURL('image/jpeg',.7);prev.appendChild(img);const pg2=document.createElement('div');pg2.className='pgc';pg2.textContent=pdf.numPages+'頁';prev.appendChild(pg2);}const m=card?.querySelector('.fm');if(m)m.textContent=pdf.numPages+'頁 · '+fmtSz(file.size);pdfSt();}catch(e){toast('無法讀取：'+en.name,true);pdfRm(en.id);}}
function pdfAddCard(en){pdfGrid.style.display='grid';const c=document.createElement('div');c.className='fc';c.id=en.id;const _sn=escHtml(en.name);c.innerHTML=`<div class="prev"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d8d2c8" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><div class="lbar" style="width:0%"></div></div><div class="fi"><div class="fn" title="${_sn}">${_sn.replace(/\.pdf$/i,'')}</div><div class="fm">載入中…</div></div><button class="rb" onclick="pdfRm('${en.id}')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>`;pdfGrid.appendChild(c);const bar=c.querySelector('.lbar');let w=0;const iv=setInterval(()=>{w=Math.min(w+Math.random()*15,85);bar.style.width=w+'%';if(w>=85)clearInterval(iv);},100);}
function pdfRm(id){pS.files=pS.files.filter(f=>f.id!==id);document.getElementById(id)?.remove();pdfUI();}

pdfCvt.onclick=async()=>{
  if(pS.conv||!pS.files.length)return;
  const ready=pS.files.filter(f=>f.doc);if(!ready.length){toast('PDF 尚未載入完成',true);return;}
  pS.conv=true;pS.done=0;pS.imgs=0;pdfCvt.disabled=true;pdfClr.disabled=true;
  document.getElementById('pdfPW').style.display='block';
  try{
  const dpi=+document.getElementById('pdfDpi').value,qual=+document.getElementById('pdfQual').value/100,scale=dpi/72;
  const doZip=document.getElementById('pdfZip').checked,mode=document.getElementById('pdfPM').value;
  const doMerge=document.getElementById('pdfMT').checked,mN=+document.getElementById('pdfMC').value,mL=document.getElementById('pdfML').value,mG=+document.getElementById('pdfGap').value,mBG=document.getElementById('pdfBG').value;
  const jobs=ready.map(en=>{let pages=mode==='all'?Array.from({length:en.pc},(_,i)=>i+1):mode==='first'?[1]:parsePageRange(document.getElementById('pdfRI').value||'1',en.pc);return{en,pages};});
  let tot=jobs.reduce((s,{pages})=>s+(doMerge?Math.ceil(pages.length/mN):pages.length),0);
  const zip=doZip?new JSZip():null;let out=0;

  for(const{en,pages}of jobs){const card=document.getElementById(en.id);const bg=document.createElement('div');bg.className='sbadge working';bg.textContent='轉換中';card?.querySelector('.prev')?.appendChild(bg);const base=en.name.replace(/\.pdf$/i,'');
    if(!doMerge){for(const pn of pages){document.getElementById('pdfPT').textContent=`${en.name} — 第${pn}頁`;const pg=await en.doc.getPage(pn),vp=pg.getViewport({scale}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',qual));const fn=pages.length===1?`${base}.jpg`:`${base}_p${String(pn).padStart(3,'0')}.jpg`;if(doZip)zip.file(fn,blob);else{dlBlob(blob,fn);await new Promise(r=>setTimeout(r,140));}out++;pS.imgs++;pdfProg(out,tot);await tick();}}
    else{for(let i=0;i<pages.length;i+=mN){const chunk=pages.slice(i,i+mN);document.getElementById('pdfPT').textContent=`${en.name} — 合併第${chunk[0]}–${chunk[chunk.length-1]}頁`;const cvs=[];for(const pn of chunk){const pg=await en.doc.getPage(pn),vp=pg.getViewport({scale}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;cvs.push(cv);await tick();}const w0=cvs[0].width,h0=cvs[0].height;let cols=mL==='horizontal'?cvs.length:mL==='vertical'?1:Math.ceil(Math.sqrt(cvs.length)),rows=mL==='horizontal'?1:mL==='vertical'?cvs.length:Math.ceil(cvs.length/cols);const mc=document.createElement('canvas');mc.width=cols*w0+(cols-1)*mG;mc.height=rows*h0+(rows-1)*mG;const ctx=mc.getContext('2d');ctx.fillStyle=mBG;ctx.fillRect(0,0,mc.width,mc.height);cvs.forEach((c,j)=>ctx.drawImage(c,(j%cols)*(w0+mG),Math.floor(j/cols)*(h0+mG)));const blob=await new Promise(r=>mc.toBlob(r,'image/jpeg',qual));const gi=Math.floor(i/mN)+1;const fn=pages.length<=mN?`${base}.jpg`:`${base}_g${String(gi).padStart(3,'0')}_p${chunk[0]}-${chunk[chunk.length-1]}.jpg`;if(doZip)zip.file(fn,blob);else{dlBlob(blob,fn);await new Promise(r=>setTimeout(r,140));}out++;pS.imgs++;pdfProg(out,tot);await tick();}}
    pS.done++;pdfSt();const b=card?.querySelector('.sbadge');if(b){b.className='sbadge done';b.textContent='完成';}}

  if(doZip&&zip){document.getElementById('pdfPT').textContent='打包 ZIP…';const zb=await zip.generateAsync({type:'blob'},m=>pdfProg(Math.round(m.percent),100,true));dlBlob(zb,`converted_${Date.now()}.zip`);}
  document.getElementById('pdfPT').textContent='完成 ✓';toast(`已輸出 ${pS.imgs} 張`);showChain('pdf');
  }catch(e){toast('轉換失敗：'+(e.message||e),true);}
  finally{pS.conv=false;pdfCvt.disabled=false;pdfClr.disabled=false;}
};
function pdfProg(d,t,raw=false){const p=raw?d:Math.round(d/t*100);document.getElementById('pdfPF').style.width=p+'%';document.getElementById('pdfPP').textContent=p+'%';document.getElementById('ps4').textContent=pS.imgs;}
pdfClr.onclick=()=>{pS.files=[];pdfGrid.innerHTML='';pdfGrid.style.display='none';pS.done=0;pS.imgs=0;document.getElementById('pdfPW').style.display='none';document.getElementById('pdfPF').style.width='0%';pdfSt();pdfUI();};
function pdfUI(){const h=pS.files.length>0;pdfCvt.disabled=!h;pdfClr.disabled=!h;pdfDZ.style.display=h?'none':'block';pdfGrid.style.display=h?'grid':'none';pdfSt();}
function pdfSt(){document.getElementById('ps1').textContent=pS.files.length;document.getElementById('ps2').textContent=pS.files.reduce((s,f)=>s+(f.pc||0),0);document.getElementById('ps3').textContent=pS.done;document.getElementById('ps4').textContent=pS.imgs;}

// ════════════════════════════════════════════════
//  2. HEIC → JPG
// ════════════════════════════════════════════════
(async()=>{
  const s=document.createElement('script');
  s.src='vendor/heic2any.min.js';
  s.crossOrigin='anonymous';
  document.head.appendChild(s);
  await new Promise((r,j)=>{s.onload=r;s.onerror=j;});
})().catch(()=>hLog('⚠ 無法載入 heic2any，請確認網路連線','err'));
let hFiles=[],hConv=false;
const hDZ=document.getElementById('hDZ'),hFI=document.getElementById('hFI'),hCvt=document.getElementById('hCvt'),hAdd=document.getElementById('hAdd'),hClr=document.getElementById('hClr');
document.getElementById('hQual').oninput=()=>document.getElementById('hQualV').textContent=document.getElementById('hQual').value+'%';
hDZ.onclick=()=>hFI.click();hAdd.onclick=()=>hFI.click();
hDZ.ondragover=e=>{e.preventDefault();hDZ.classList.add('dragover');};hDZ.ondragleave=()=>hDZ.classList.remove('dragover');
hDZ.ondrop=e=>{e.preventDefault();hDZ.classList.remove('dragover');hAddF([...e.dataTransfer.files]);};
hFI.onchange=()=>{hAddF([...hFI.files]);hFI.value='';};
function hAddF(fs){const v=fs.filter(f=>/\.(heic|heif)$/i.test(f.name));const sk=fs.length-v.length;if(sk)hLog(`跳過 ${sk} 個非 HEIC 檔案`,'info');v.forEach(f=>{if(!hFiles.find(x=>x.file.name===f.name&&x.file.size===f.size))hFiles.push({file:f,name:f.name,status:'pending',blob:null});});hRL();hUB();if(v.length)hLog(`已加入 ${v.length} 個`,'info');}
function hRL(){const el=document.getElementById('hRows');if(!hFiles.length){el.innerHTML='<div style="font-size:13px;color:var(--muted);font-weight:600;text-align:center;padding:10px;">尚未選取任何檔案</div>';return;}el.innerHTML=hFiles.map((f,i)=>`<div class="frow ${f.status}" id="hr${i}"><span class="fidx">${String(i+1).padStart(2,'0')}</span><span class="fname">${f.name}</span><span class="fsize">${fmtSz(f.file.size)}</span><span class="fst ${f.status}" id="hs${i}">${hSL(f.status)}</span></div>`).join('');}
function hSL(s){return{pending:'PENDING',converting:'⟳ 轉換中',done:'完成',error:'失敗'}[s]||s;}
function hUR(i){const f=hFiles[i],r=document.getElementById('hr'+i),s=document.getElementById('hs'+i);if(!r||!s)return;r.className='frow '+f.status;s.className='fst '+f.status;if(f.status==='converting')s.innerHTML='<span class="spinning">⟳</span> 轉換中';else s.textContent=hSL(f.status);}
hCvt.onclick=async()=>{
  if(hConv||!hFiles.length)return;if(typeof heic2any==='undefined'){hLog('heic2any 未載入','err');return;}
  hConv=true;const quality=+document.getElementById('hQual').value/100,dl=document.querySelector('input[name="hDL"]:checked').value;
  hCvt.disabled=true;hClr.disabled=true;document.getElementById('hPW').style.display='block';document.getElementById('hLog').style.display='block';document.getElementById('hSt').classList.remove('show');
  try{
  let done=0,fail=0,bytes=0;const t0=Date.now(),pending=hFiles.filter(f=>f.status!=='done');
  for(let i=0;i<hFiles.length;i++){const f=hFiles[i];if(f.status==='done')continue;f.status='converting';hUR(i);document.getElementById('hPC').textContent=`${done}/${pending.length}`;
    try{const blob=await heic2any({blob:f.file,toType:'image/jpeg',quality});f.blob=Array.isArray(blob)?blob[0]:blob;f.status='done';bytes+=f.blob.size;done++;hLog(`✓ ${f.name} → ${f.name.replace(/\.(heic|heif)$/i,'.jpg')} (${fmtSz(f.blob.size)})`,'ok');}
    catch(e){f.status='error';fail++;hLog(`${f.name}: ${e.message||'轉換失敗'}`,'err');}
    hUR(i);const p=done+fail;document.getElementById('hPF').style.width=(p/pending.length*100)+'%';document.getElementById('hPC').textContent=`${p}/${pending.length}`;await tick();}
  const el=((Date.now()-t0)/1000).toFixed(1);hLog(`── 完成 ${done} 成功 · ${fail} 失敗 · ${el}s ──`,'info');
  document.getElementById('hs1').textContent=done;document.getElementById('hs2').textContent=fail;document.getElementById('hs3').textContent=el;document.getElementById('hs4').textContent=fmtSz(bytes);document.getElementById('hSt').classList.add('show');
  if(done>0){if(dl==='zip'){hLog('打包 ZIP…','info');const zip=new JSZip();hFiles.filter(f=>f.status==='done'&&f.blob).forEach(f=>zip.file(f.name.replace(/\.(heic|heif)$/i,'.jpg'),f.blob));const zb=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:1}});saveAs(zb,`heic2jpg_${Date.now()}.zip`);hLog('⬇ ZIP 完成','ok');}else{for(const f of hFiles.filter(f=>f.status==='done'&&f.blob)){saveAs(f.blob,f.name.replace(/\.(heic|heif)$/i,'.jpg'));await new Promise(r=>setTimeout(r,200));}}}
  toast(`已轉換 ${done} 張`);showChain('heic');
  }catch(e){hLog('處理失敗：'+(e.message||e),'err');toast('處理失敗',true);}
  finally{hConv=false;hCvt.disabled=false;hClr.disabled=false;}
};
hClr.onclick=()=>{hFiles=[];document.getElementById('hLog').innerHTML='';document.getElementById('hLog').style.display='none';document.getElementById('hPW').style.display='none';document.getElementById('hPF').style.width='0%';document.getElementById('hSt').classList.remove('show');hRL();hUB();};
function hUB(){const hp=hFiles.some(f=>f.status!=='done');hCvt.disabled=!hFiles.length||!hp;hClr.disabled=!hFiles.length;}
function hLog(msg,type='info'){const el=document.getElementById('hLog'),s=document.createElement('span');s.className='log-'+type;s.textContent='['+new Date().toLocaleTimeString('zh-TW',{hour12:false})+'] '+msg+'\n';el.appendChild(s);el.scrollTop=el.scrollHeight;}

// ════════════════════════════════════════════════
//  3. 圖片壓縮
// ════════════════════════════════════════════════
const cpS={files:[],conv:false,done:0,savedBytes:0};
const cpDZ=document.getElementById('cpDZ'),cpFI=document.getElementById('cpFI'),cpGrid=document.getElementById('cpGrid'),cpCvt=document.getElementById('cpCvt'),cpClr=document.getElementById('cpClr');
document.getElementById('cpQual').oninput=()=>document.getElementById('cpQualV').textContent=document.getElementById('cpQual').value;
document.getElementById('cpMode').onchange=()=>{const m=document.getElementById('cpMode').value;document.getElementById('cpQR').style.display=m==='quality'?'flex':'none';document.getElementById('cpTR').style.display=m==='target'?'flex':'none';};
cpDZ.onclick=()=>cpFI.click();cpFI.onchange=e=>{cpHF([...e.target.files]);cpFI.value='';};
cpDZ.ondragover=e=>{e.preventDefault();cpDZ.classList.add('dragover');};cpDZ.ondragleave=()=>cpDZ.classList.remove('dragover');
cpDZ.ondrop=e=>{e.preventDefault();cpDZ.classList.remove('dragover');cpHF([...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')));};
function cpHF(files){files.forEach(f=>{if(cpS.files.find(x=>x.name===f.name&&x.size===f.size))return;const id='c'+Date.now()+Math.random().toString(36).slice(2);const en={name:f.name,size:f.size,id,file:f};cpS.files.push(en);cpAddCard(en);});cpUI();}
function cpAddCard(en){cpGrid.style.display='grid';const c=document.createElement('div');c.className='fc';c.id=en.id;en._url=URL.createObjectURL(en.file);c.innerHTML=`<div class="prev" style="aspect-ratio:4/3;"><img src="${en._url}"></div><div class="fi"><div class="fn" title="${en.name}">${en.name}</div><div class="fm">${fmtSz(en.size)}</div></div><button class="rb" onclick="cpRm('${en.id}')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>`;cpGrid.appendChild(c);}
function cpRm(id){const en=cpS.files.find(f=>f.id===id);if(en?._url)URL.revokeObjectURL(en._url);cpS.files=cpS.files.filter(f=>f.id!==id);document.getElementById(id)?.remove();cpUI();}
cpCvt.onclick=async()=>{
  if(cpS.conv||!cpS.files.length)return;cpS.conv=true;cpS.done=0;cpS.savedBytes=0;cpCvt.disabled=true;cpClr.disabled=true;
  document.getElementById('cpPW').style.display='block';
  try{
  const mode=document.getElementById('cpMode').value,qual=+document.getElementById('cpQual').value/100,targetB=+document.getElementById('cpTKB').value*1024,fmtOpt=document.getElementById('cpFmt').value,doZip=document.getElementById('cpZip').checked;
  const zip=doZip?new JSZip():null;
  for(let i=0;i<cpS.files.length;i++){const en=cpS.files[i];const card=document.getElementById(en.id);const bg=document.createElement('div');bg.className='sbadge working';bg.textContent='處理中';card?.querySelector('.prev')?.appendChild(bg);
    document.getElementById('cpPT').textContent=en.name;
    let mime=fmtOpt==='keep'?(en.file.type||'image/jpeg'):fmtOpt;
    if(mode==='target'&&mime==='image/png')mime='image/jpeg';   // PNG ignores quality → can't hit a KB target; use JPEG
    const img=await loadImg(en.file);let blob;
    if(mode==='quality'){const cv=imgToCanvas(img,img.width,img.height,mime);blob=await new Promise(r=>cv.toBlob(r,mime,qual));}
    else{const cv=imgToCanvas(img,img.width,img.height,mime);let lo=0.05,hi=1,best=null;for(let k=0;k<12;k++){const mid=(lo+hi)/2;const b=await new Promise(r=>cv.toBlob(r,mime,mid));if(b.size<=targetB){best=b;lo=mid;}else hi=mid;}blob=best||await new Promise(r=>cv.toBlob(r,mime,0.05));}
    if(blob){const saved=en.size-blob.size;cpS.savedBytes+=Math.max(0,saved);const e2=ext(mime,en.name);const outName=en.name.replace(/\.[^.]+$/,'')+e2;en._outBlob=blob;en._outName=outName;card?.classList.add('card-done');if(doZip)zip.file(outName,blob);else{dlBlob(blob,outName);await new Promise(r=>setTimeout(r,140));}
      const prev=card?.querySelector('.prev');if(prev){if(en._prevUrl)URL.revokeObjectURL(en._prevUrl);const nb=URL.createObjectURL(blob);en._prevUrl=nb;const img2=prev.querySelector('img');if(img2)img2.src=nb;}
      const fm=card?.querySelector('.fm');if(fm){const pct=saved>0?` (-${Math.round(saved/en.size*100)}%)`:' (無壓縮)';fm.innerHTML=`${fmtSz(en.size)} → <span class="sav">${fmtSz(blob.size)}${pct}</span>`;}}
    cpS.done++;document.getElementById('cps2').textContent=cpS.done;
    const tot=cpS.savedBytes>=0?fmtSz(cpS.savedBytes):'—';document.getElementById('cpSaved').textContent=tot;
    const pct=Math.round((i+1)/cpS.files.length*100);document.getElementById('cpPF').style.width=pct+'%';document.getElementById('cpPP').textContent=pct+'%';
    const b=card?.querySelector('.sbadge');if(b){b.className='sbadge done';b.textContent='完成';}await tick();}
  if(doZip&&zip){const zb=await zip.generateAsync({type:'blob'});dlBlob(zb,`compressed_${Date.now()}.zip`);}
  document.getElementById('cpPT').textContent='完成 ✓';toast(`已壓縮 ${cpS.done} 張，節省 ${fmtSz(cpS.savedBytes)}`);showChain('compress');
  }catch(e){toast('壓縮失敗：'+(e.message||e),true);}
  finally{cpS.conv=false;cpCvt.disabled=false;cpClr.disabled=false;}
};
cpClr.onclick=()=>{cpS.files.forEach(en=>{if(en._url)URL.revokeObjectURL(en._url);if(en._prevUrl)URL.revokeObjectURL(en._prevUrl);});cpS.files=[];cpGrid.innerHTML='';cpGrid.style.display='none';cpS.done=0;cpS.savedBytes=0;document.getElementById('cpPW').style.display='none';document.getElementById('cpPF').style.width='0%';document.getElementById('cpSaved').textContent='—';document.getElementById('cps1').textContent='0';document.getElementById('cps2').textContent='0';cpUI();};
function cpUI(){const h=cpS.files.length>0;cpCvt.disabled=!h;cpClr.disabled=!h;cpDZ.style.display=h?'none':'block';cpGrid.style.display=h?'grid':'none';document.getElementById('cps1').textContent=cpS.files.length;}

// ════════════════════════════════════════════════
//  4. 尺寸調整
// ════════════════════════════════════════════════
const rzS={files:[],conv:false,done:0};
const rzDZ=document.getElementById('rzDZ'),rzFI=document.getElementById('rzFI'),rzGrid=document.getElementById('rzGrid'),rzCvt=document.getElementById('rzCvt'),rzClr=document.getElementById('rzClr');
document.getElementById('rzQual').oninput=()=>document.getElementById('rzQualV').textContent=document.getElementById('rzQual').value;
document.getElementById('rzPct').oninput=()=>document.getElementById('rzPctV').textContent=document.getElementById('rzPct').value+'%';
document.getElementById('rzMode').onchange=()=>{const m=document.getElementById('rzMode').value;document.getElementById('rzWR').style.display=m==='width'?'flex':'none';document.getElementById('rzHR').style.display=m==='height'?'flex':'none';document.getElementById('rzPR').style.display=m==='percent'?'flex':'none';document.getElementById('rzCR').style.display=m==='custom'?'block':'none';};
document.getElementById('rzCW').oninput=()=>{if(document.getElementById('rzLock').checked){const f=rzS.files[0];if(f&&f.w){document.getElementById('rzCH').value=Math.round(+document.getElementById('rzCW').value*f.h/f.w);}}};
rzDZ.onclick=()=>rzFI.click();rzFI.onchange=e=>{rzHF([...e.target.files]);rzFI.value='';};
rzDZ.ondragover=e=>{e.preventDefault();rzDZ.classList.add('dragover');};rzDZ.ondragleave=()=>rzDZ.classList.remove('dragover');
rzDZ.ondrop=e=>{e.preventDefault();rzDZ.classList.remove('dragover');rzHF([...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')));};
async function rzHF(files){for(const f of files){if(rzS.files.find(x=>x.name===f.name&&x.size===f.size))continue;const id='r'+Date.now()+Math.random().toString(36).slice(2);const en={name:f.name,size:f.size,id,file:f,w:0,h:0};rzS.files.push(en);rzAddCard(en);rzLoadDim(f,en);}rzUI();}
async function rzLoadDim(file,en){try{const img=await loadImg(file);en.w=img.width;en.h=img.height;const m=document.getElementById(en.id)?.querySelector('.fm');if(m)m.textContent=`${img.width} × ${img.height} · ${fmtSz(file.size)}`;}catch(e){}}
function rzAddCard(en){rzGrid.style.display='grid';const c=document.createElement('div');c.className='fc';c.id=en.id;en._url=URL.createObjectURL(en.file);c.innerHTML=`<div class="prev" style="aspect-ratio:4/3;"><img src="${en._url}"></div><div class="fi"><div class="fn" title="${en.name}">${en.name}</div><div class="fm">載入中…</div></div><button class="rb" onclick="rzRm('${en.id}')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>`;rzGrid.appendChild(c);}
function rzRm(id){const en=rzS.files.find(f=>f.id===id);if(en?._url)URL.revokeObjectURL(en._url);rzS.files=rzS.files.filter(f=>f.id!==id);document.getElementById(id)?.remove();rzUI();}
rzCvt.onclick=async()=>{
  if(rzS.conv||!rzS.files.length)return;rzS.conv=true;rzS.done=0;rzCvt.disabled=true;rzClr.disabled=true;
  document.getElementById('rzPW').style.display='block';
  try{
  const mode=document.getElementById('rzMode').value,fmt=document.getElementById('rzFmt').value,qual=+document.getElementById('rzQual').value/100,doZip=document.getElementById('rzZip').checked;
  const zip=doZip?new JSZip():null;
  for(let i=0;i<rzS.files.length;i++){const en=rzS.files[i];if(!en.w){const img2=await loadImg(en.file);en.w=img2.width;en.h=img2.height;}
    const card=document.getElementById(en.id);const bg=document.createElement('div');bg.className='sbadge working';bg.textContent='處理中';card?.querySelector('.prev')?.appendChild(bg);
    document.getElementById('rzPT').textContent=en.name;
    const img=await loadImg(en.file);
    let nw,nh;
    if(mode==='width'){nw=+document.getElementById('rzW').value;nh=Math.round(nw*en.h/en.w);}
    else if(mode==='height'){nh=+document.getElementById('rzH').value;nw=Math.round(nh*en.w/en.h);}
    else if(mode==='percent'){const p=+document.getElementById('rzPct').value/100;nw=Math.round(en.w*p);nh=Math.round(en.h*p);}
    else{nw=+document.getElementById('rzCW').value;nh=document.getElementById('rzLock').checked?Math.round(nw*en.h/en.w):+document.getElementById('rzCH').value;}
    nw=Math.max(1,Math.round(nw)||en.w);nh=Math.max(1,Math.round(nh)||en.h);   // guard empty/NaN fields
    const mime=fmt==='keep'?(en.file.type||'image/jpeg'):fmt;
    const cv=imgToCanvas(img,nw,nh,mime);const blob=await new Promise(r=>cv.toBlob(r,mime,qual));
    const e2=ext(mime,en.name);const outName=en.name.replace(/\.[^.]+$/,'')+e2;
    en._outBlob=blob;en._outName=outName;card?.classList.add('card-done');
    if(doZip)zip.file(outName,blob);else{dlBlob(blob,outName);await new Promise(r=>setTimeout(r,140));}
    const prev=card?.querySelector('.prev');if(prev){if(en._prevUrl)URL.revokeObjectURL(en._prevUrl);const nb=URL.createObjectURL(blob);en._prevUrl=nb;const im2=prev.querySelector('img');if(im2)im2.src=nb;}
    const fm=card?.querySelector('.fm');if(fm)fm.textContent=`${en.w}×${en.h} → ${nw}×${nh} · ${fmtSz(blob.size)}`;
    rzS.done++;document.getElementById('rzs2').textContent=rzS.done;
    const pct=Math.round((i+1)/rzS.files.length*100);document.getElementById('rzPF').style.width=pct+'%';document.getElementById('rzPP').textContent=pct+'%';
    const b=card?.querySelector('.sbadge');if(b){b.className='sbadge done';b.textContent='完成';}await tick();}
  if(doZip&&zip){const zb=await zip.generateAsync({type:'blob'});dlBlob(zb,`resized_${Date.now()}.zip`);}
  document.getElementById('rzPT').textContent='完成 ✓';toast(`已縮放 ${rzS.done} 張`);showChain('resize');
  }catch(e){toast('縮放失敗：'+(e.message||e),true);}
  finally{rzS.conv=false;rzCvt.disabled=false;rzClr.disabled=false;}
};
rzClr.onclick=()=>{rzS.files.forEach(en=>{if(en._url)URL.revokeObjectURL(en._url);if(en._prevUrl)URL.revokeObjectURL(en._prevUrl);});rzS.files=[];rzGrid.innerHTML='';rzGrid.style.display='none';rzS.done=0;document.getElementById('rzPW').style.display='none';document.getElementById('rzPF').style.width='0%';document.getElementById('rzs1').textContent='0';document.getElementById('rzs2').textContent='0';rzUI();};
function rzUI(){const h=rzS.files.length>0;rzCvt.disabled=!h;rzClr.disabled=!h;rzDZ.style.display=h?'none':'block';rzGrid.style.display=h?'grid':'none';document.getElementById('rzs1').textContent=rzS.files.length;}

// ════════════════════════════════════════════════
//  5. PDF 合併/拆分
// ════════════════════════════════════════════════
let poMode='merge',poMFiles=[],poSPdf=null,poConv=false,_pdfLibLoaded=false;

async function ensurePdfLib() {
  if (_pdfLibLoaded && typeof PDFLib!=='undefined') return true;
  return new Promise(resolve=>{
    const urls=['vendor/pdf-lib.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'];
    let idx=0;
    function tryNext(){if(idx>=urls.length){resolve(false);return;}const s=document.createElement('script');s.src=urls[idx++];s.crossOrigin='anonymous';s.onload=()=>{_pdfLibLoaded=true;resolve(true);};s.onerror=()=>tryNext();document.head.appendChild(s);}
    tryNext();
  });
}

function poSetMode(m){poMode=m;document.getElementById('poMBtn').classList.toggle('active',m==='merge');document.getElementById('poSBtn').classList.toggle('active',m==='split');document.getElementById('poMC').style.display=m==='merge'?'flex':'none';document.getElementById('poSC').style.display=m==='split'?'flex':'none';document.getElementById('poMSB').style.display=m==='merge'?'block':'none';document.getElementById('poSSB').style.display=m==='split'?'block':'none';}

// Merge
const poMDZ=document.getElementById('poMDZ'),poMFI=document.getElementById('poMFI');
poMDZ.onclick=()=>poMFI.click();poMFI.onchange=e=>{poMAddF([...e.target.files]);poMFI.value='';};
poMDZ.ondragover=e=>{e.preventDefault();poMDZ.classList.add('dragover');};poMDZ.ondragleave=()=>poMDZ.classList.remove('dragover');
poMDZ.ondrop=e=>{e.preventDefault();poMDZ.classList.remove('dragover');poMAddF([...e.dataTransfer.files].filter(f=>f.name.endsWith('.pdf')));};
async function poMAddF(files){
  for(const f of files){if(poMFiles.find(x=>x.name===f.name&&x.size===f.size))continue;const id='m'+Date.now()+Math.random().toString(36).slice(2);const en={name:f.name,size:f.size,id,file:f,pc:0};poMFiles.push(en);
    try{const ab=await f.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;en.pc=pdf.numPages;if(pdf.destroy)pdf.destroy();}catch(e){}
    poMRender();}poMUI();
}
function poMRender(){const el=document.getElementById('poMList');if(!poMFiles.length){el.innerHTML='';document.getElementById('poMDZ').style.display='block';return;}document.getElementById('poMDZ').style.display='none';
  el.innerHTML=poMFiles.map((f,i)=>`<div class="pdfo-item" id="poi${f.id}"><span class="pdfo-ix">${String(i+1).padStart(2,'0')}</span><span class="pdfo-nm" title="${f.name}">${f.name.replace(/\.pdf$/i,'')}</span><span class="pdfo-pg">${f.pc||'?'}頁</span><button class="reord" onclick="poMMove(${i},-1)" ${i===0?'disabled':''}><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"18 15 12 9 6 15\"/></svg></button><button class="reord" onclick="poMMove(${i},1)" ${i===poMFiles.length-1?'disabled':''}><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"/></svg></button><button class="pdfo-rm" onclick="poMRm('${f.id}')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button></div>`).join('');
  document.getElementById('poms1').textContent=poMFiles.length;document.getElementById('poms2').textContent=poMFiles.reduce((s,f)=>s+(f.pc||0),0);}
function poMMove(i,d){const j=i+d;if(j<0||j>=poMFiles.length)return;[poMFiles[i],poMFiles[j]]=[poMFiles[j],poMFiles[i]];poMRender();}
function poMRm(id){poMFiles=poMFiles.filter(f=>f.id!==id);poMRender();poMUI();}
document.getElementById('poMClr').onclick=()=>{poMFiles=[];poMRender();poMUI();document.getElementById('poMDZ').style.display='block';};
function poMUI(){const h=poMFiles.length>0;document.getElementById('poMCvt').disabled=!h;document.getElementById('poMClr').disabled=!h;}

document.getElementById('poMCvt').onclick=async()=>{
  if(poConv||!poMFiles.length)return;poConv=true;document.getElementById('poMCvt').disabled=true;document.getElementById('poMClr').disabled=true;
  const ok=await ensurePdfLib();if(!ok){toast('PDF 處理函式庫載入失敗，請重新整理後再試',true);poConv=false;document.getElementById('poMCvt').disabled=false;document.getElementById('poMClr').disabled=false;return;}
  try{const{PDFDocument}=PDFLib;const merged=await PDFDocument.create();
    for(const en of poMFiles){const ab=await en.file.arrayBuffer();const src=await PDFDocument.load(ab);const pages=await merged.copyPages(src,src.getPageIndices());pages.forEach(p=>merged.addPage(p));}
    const bytes=await merged.save();const blob=new Blob([bytes],{type:'application/pdf'});const name=(document.getElementById('poMName').value||'merged')+'.pdf';dlBlob(blob,name);
    toast(`合併完成：${merged.getPageCount()} 頁`);}catch(e){toast('合併失敗：'+e.message,true);}
  finally{poConv=false;document.getElementById('poMCvt').disabled=false;document.getElementById('poMClr').disabled=false;}
};

// Split
const poSDZ=document.getElementById('poSDZ'),poSFI=document.getElementById('poSFI');
poSDZ.onclick=()=>poSFI.click();poSFI.onchange=e=>{if(e.target.files[0])poSLoad(e.target.files[0]);poSFI.value='';};
poSDZ.ondragover=e=>{e.preventDefault();poSDZ.classList.add('dragover');};poSDZ.ondragleave=()=>poSDZ.classList.remove('dragover');
poSDZ.ondrop=e=>{e.preventDefault();poSDZ.classList.remove('dragover');const f=[...e.dataTransfer.files].find(x=>x.name.endsWith('.pdf'));if(f)poSLoad(f);};

document.getElementById('poSMode').onchange=()=>{const m=document.getElementById('poSMode').value;document.getElementById('poSNR').style.display=m==='n'?'flex':'none';document.getElementById('poSRR').style.display=m==='range'?'block':'none';poSUpdateEst();};
document.getElementById('poSN').oninput=poSUpdateEst;
document.getElementById('poSRange').oninput=poSUpdateEst;

async function poSLoad(file){
  poSPdf={name:file.name,file,pc:0,pdfDoc:null};
  const info=document.getElementById('poSInfo'),grid=document.getElementById('poSThumbGrid');
  info.style.display='block';document.getElementById('poSFName').textContent=file.name;document.getElementById('poSFMeta').textContent='載入中…';poSDZ.style.display='none';grid.innerHTML='';
  try{const ab=await file.arrayBuffer();poSPdf.pdfDoc=await pdfjsLib.getDocument({data:ab}).promise;poSPdf.pc=poSPdf.pdfDoc.numPages;
    document.getElementById('poSFMeta').textContent=`${poSPdf.pc} 頁 · ${fmtSz(file.size)}`;
    document.getElementById('poss1').textContent=poSPdf.pc;document.getElementById('poSCvt').disabled=false;poSUpdateEst();
    // Render thumbnails (max 40)
    const n=Math.min(poSPdf.pc,40);
    for(let i=1;i<=n;i++){const th=document.createElement('div');th.className='pgth';th.innerHTML=`<div class="pgth-img" id="pgt${i}"><div style="width:100%;height:100%;background:var(--bg);display:flex;align-items:center;justify-content:center;"><span style="font-family:var(--mono);font-size:9px;color:var(--muted);">${i}</span></div></div><div class="pgth-lbl">第 ${i} 頁</div>`;grid.appendChild(th);}
    if(poSPdf.pc>40){const more=document.createElement('div');more.style.cssText='grid-column:1/-1;text-align:center;font-size:12px;color:var(--muted);font-weight:600;padding:8px;';more.textContent=`+${poSPdf.pc-40} 頁未顯示`;grid.appendChild(more);}
    // Render thumbs async
    for(let i=1;i<=n;i++){const pg=await poSPdf.pdfDoc.getPage(i),vp=pg.getViewport({scale:.3}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;const box=document.getElementById('pgt'+i);if(box){box.innerHTML='';box.appendChild(cv);}await tick();}
  }catch(e){toast('無法讀取 PDF',true);poSClear();}
}
function poSClear(){poSPdf=null;document.getElementById('poSInfo').style.display='none';document.getElementById('poSThumbGrid').innerHTML='';document.getElementById('poSDZ').style.display='block';document.getElementById('poSCvt').disabled=true;document.getElementById('poss1').textContent='0';document.getElementById('poss2').textContent='0';}
function poSUpdateEst(){if(!poSPdf)return;const m=document.getElementById('poSMode').value,pc=poSPdf.pc;let est=pc;if(m==='n'){const n=Math.max(1,+document.getElementById('poSN').value);est=Math.ceil(pc/n);}else if(m==='range'){const r=document.getElementById('poSRange').value;est=r.split(',').filter(s=>s.trim().match(/^(\d+)(?:-(\d+))?$/)).length||0;}document.getElementById('poss2').textContent=est;}

document.getElementById('poSCvt').onclick=async()=>{
  if(poConv||!poSPdf?.pdfDoc)return;poConv=true;document.getElementById('poSCvt').disabled=true;
  const ok=await ensurePdfLib();if(!ok){toast('PDF 處理函式庫載入失敗，請重新整理後再試',true);poConv=false;document.getElementById('poSCvt').disabled=false;return;}
  try{const{PDFDocument}=PDFLib;const ab=await poSPdf.file.arrayBuffer();const src=await PDFDocument.load(ab);const total=src.getPageCount();
    const m=document.getElementById('poSMode').value,doZip=document.getElementById('poSZip').checked,base=poSPdf.name.replace(/\.pdf$/i,'');
    const zip=doZip?new JSZip():null;let outFiles=[];
    if(m==='all'){for(let i=0;i<total;i++){const d=await PDFDocument.create();const[p]=await d.copyPages(src,[i]);d.addPage(p);outFiles.push({bytes:await d.save(),name:`${base}_p${String(i+1).padStart(3,'0')}.pdf`});}}
    else if(m==='n'){const n=Math.max(1,+document.getElementById('poSN').value);for(let i=0;i<total;i+=n){const chunk=Array.from({length:Math.min(n,total-i)},(_,j)=>i+j);const d=await PDFDocument.create();const ps=await d.copyPages(src,chunk);ps.forEach(p=>d.addPage(p));const g=Math.floor(i/n)+1;outFiles.push({bytes:await d.save(),name:`${base}_g${String(g).padStart(3,'0')}_p${i+1}-${Math.min(i+n,total)}.pdf`});}}
    else{const ranges=document.getElementById('poSRange').value.split(',').map(s=>{const mm=s.trim().match(/^(\d+)(?:-(\d+))?$/);if(!mm)return null;return{f:Math.max(0,+mm[1]-1),t:Math.min(total-1,(mm[2]?+mm[2]:+mm[1])-1)};}).filter(r=>r&&r.t>=r.f&&r.f<total);for(let i=0;i<ranges.length;i++){const{f,t}=ranges[i];const d=await PDFDocument.create();const idx=Array.from({length:t-f+1},(_,j)=>f+j);const ps=await d.copyPages(src,idx);ps.forEach(p=>d.addPage(p));outFiles.push({bytes:await d.save(),name:`${base}_split${String(i+1).padStart(3,'0')}_p${f+1}-${t+1}.pdf`});}}
    if(!outFiles.length){toast('沒有可輸出的頁面，請檢查範圍格式',true);return;}
    if(doZip&&zip){outFiles.forEach(o=>zip.file(o.name,o.bytes));const zb=await zip.generateAsync({type:'blob'});dlBlob(zb,`${base}_split_${Date.now()}.zip`);}
    else{for(const o of outFiles){dlBlob(new Blob([o.bytes],{type:'application/pdf'}),o.name);await new Promise(r=>setTimeout(r,150));}}
    toast(`已拆分為 ${outFiles.length} 個 PDF`);}
  catch(e){toast('拆分失敗：'+e.message,true);}
  finally{poConv=false;document.getElementById('poSCvt').disabled=false;}
};

// ════════════════════════════════════════════════
//  6. PDF 壓縮
// ════════════════════════════════════════════════
const pcS={files:[],conv:false};
const pcDZ=document.getElementById('pcDZ'),pcFI=document.getElementById('pcFI'),pcGrid=document.getElementById('pcGrid');
const pcCvt=document.getElementById('pcCvt'),pcClr=document.getElementById('pcClr');

document.getElementById('pcQual').oninput=()=>document.getElementById('pcQualV').textContent=document.getElementById('pcQual').value;
// removed: pcDpi.onchange

pcDZ.onclick=()=>pcFI.click();
pcFI.onchange=e=>{pcHF([...e.target.files]);pcFI.value='';};
pcDZ.ondragover=e=>{e.preventDefault();pcDZ.classList.add('dragover');};
pcDZ.ondragleave=()=>pcDZ.classList.remove('dragover');
pcDZ.ondrop=e=>{e.preventDefault();pcDZ.classList.remove('dragover');pcHF([...e.dataTransfer.files].filter(f=>f.name.toLowerCase().endsWith('.pdf')));};

async function pcHF(files){
  for(const f of files){
    if(pcS.files.find(x=>x.name===f.name&&x.size===f.size))continue;
    const id='pc'+Date.now()+Math.random().toString(36).slice(2);
    const en={name:f.name,size:f.size,id,file:f,pc:0,doc:null};
    pcS.files.push(en);pcAddCard(en);pcLoad(f,en);
  }
  pcUI();
}

async function pcLoad(file,en){
  const card=document.getElementById(en.id),bar=card?.querySelector('.lbar');
  try{
    const ab=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:ab}).promise;
    en.doc=pdf;en.pc=pdf.numPages;
    if(bar){bar.style.width='100%';setTimeout(()=>bar.style.display='none',400);}
    const pg=await pdf.getPage(1),vp=pg.getViewport({scale:.5}),cv=document.createElement('canvas');
    cv.width=vp.width;cv.height=vp.height;
    await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    const prev=card?.querySelector('.prev');
    if(prev){prev.innerHTML='';const img=document.createElement('img');img.src=cv.toDataURL('image/jpeg',.7);prev.appendChild(img);const pgb=document.createElement('div');pgb.className='pgc';pgb.textContent=en.pc+'頁';prev.appendChild(pgb);}
    const fm=card?.querySelector('.fm');if(fm)fm.textContent=en.pc+'頁 · '+fmtSz(file.size);
    pcStatUI();
  }catch(e){toast('無法讀取：'+en.name,true);pcRm(en.id);}
}

function pcAddCard(en){
  pcGrid.style.display='grid';
  const c=document.createElement('div');c.className='fc';c.id=en.id;
  const _sn=escHtml(en.name);c.innerHTML=`<div class="prev"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d8d2c8" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><div class="lbar" style="width:0%"></div></div><div class="fi"><div class="fn" title="${_sn}">${_sn.replace(/\.pdf$/i,'')}</div><div class="fm">載入中…</div></div><button class="rb" onclick="pcRm('${en.id}')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>`;
  pcGrid.appendChild(c);
  const bar=c.querySelector('.lbar');let w=0;
  const iv=setInterval(()=>{w=Math.min(w+Math.random()*15,85);bar.style.width=w+'%';if(w>=85)clearInterval(iv);},100);
}

function pcRm(id){pcS.files=pcS.files.filter(f=>f.id!==id);document.getElementById(id)?.remove();pcUI();pcStatUI();}

function pcUI(){
  const h=pcS.files.length>0;
  pcCvt.disabled=!h;pcClr.disabled=!h;
  pcDZ.style.display=h?'none':'block';
  pcGrid.style.display=h?'grid':'none';
  document.getElementById('pcs1').textContent=pcS.files.length;
}

function pcStatUI(){
  const total=pcS.files.reduce((s,f)=>s+f.pc,0);
  const totalSize=pcS.files.reduce((s,f)=>s+f.size,0);
  document.getElementById('pcs2').textContent=total;
  document.getElementById('pcs3').textContent=totalSize>0?fmtSz(totalSize):'—';
}

// removed: pcGetDpi

pcCvt.onclick=async()=>{
  if(pcS.conv)return;
  const ready=pcS.files.filter(f=>f.doc);
  if(!ready.length){toast('PDF 尚未載入完成',true);return;}
  pcS.conv=true;pcCvt.disabled=true;pcClr.disabled=true;
  // Reset progress on every run
  document.getElementById('pcPW').style.display='block';
  document.getElementById('pcPF').style.width='0%';
  document.getElementById('pcPP').textContent='0%';
  document.getElementById('pcPT').textContent='準備中...';

  const ok=await ensurePdfLib();
  if(!ok){toast('PDF 函式庫載入失敗，請重新整理後再試',true);pcS.conv=false;pcCvt.disabled=false;pcClr.disabled=false;return;}

  try{
  const qual=+document.getElementById('pcQual').value/100;
  const colorMode=document.getElementById('pcColor').value;
  const maxPx=+document.getElementById('pcMaxPx').value;
  const whiteBg=document.getElementById('pcWhite').checked;
  const {PDFDocument}=PDFLib;

  let totalOrigSize=0,totalOutSize=0;
  let doneFiles=0;
  const totalFiles=ready.length;

  for(let fi=0;fi<ready.length;fi++){
    const en=ready[fi];
    totalOrigSize+=en.size;
    const card=document.getElementById(en.id);
    const badge=document.createElement('div');badge.className='sbadge working';badge.textContent='壓縮中';card?.querySelector('.prev')?.appendChild(badge);

    try{
      const outPdf=await PDFDocument.create();
      const numPages=en.doc.numPages;

      for(let pi=1;pi<=numPages;pi++){
        // Update progress
        const globalDone=fi*100/totalFiles+((pi-1)/numPages)*(100/totalFiles);
        document.getElementById('pcPF').style.width=Math.round(globalDone)+'%';
        document.getElementById('pcPP').textContent=Math.round(globalDone)+'%';
        document.getElementById('pcPT').textContent=`${en.name.replace(/\.pdf$/i,'')} · 第${pi}/${numPages}頁`;

        const page=await en.doc.getPage(pi);
        const origVP=page.getViewport({scale:1});
        // Cap to maxPx on longest side, base scale 150dpi
        const baseScale=150/72;
        const rawW=origVP.width*baseScale, rawH=origVP.height*baseScale;
        const pxCap=maxPx>0 ? maxPx : Infinity;
        const effectiveScale=baseScale*Math.min(1, pxCap/Math.max(rawW,rawH));
        const renderVP=page.getViewport({scale:effectiveScale});
        const cv=document.createElement('canvas');
        cv.width=Math.round(renderVP.width);
        cv.height=Math.round(renderVP.height);
        const ctx=cv.getContext('2d');

        if(whiteBg){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cv.width,cv.height);}

        await page.render({canvasContext:ctx,viewport:renderVP}).promise;

        // Grayscale: auto-detect by sampling colour variance, forced, or keep colour
        let doGray=(colorMode==='gray');
        if(colorMode==='auto'){
          const sd=ctx.getImageData(0,0,cv.width,cv.height).data;
          let diff=0,n=0;
          for(let j=0;j<sd.length;j+=16){diff+=Math.abs(sd[j]-sd[j+1])+Math.abs(sd[j+1]-sd[j+2]);n++;}
          doGray=(diff/n)<18;
        }
        if(doGray){
          const imgData=ctx.getImageData(0,0,cv.width,cv.height);
          const d=imgData.data;
          for(let j=0;j<d.length;j+=4){
            const g=Math.round(0.299*d[j]+0.587*d[j+1]+0.114*d[j+2]);
            d[j]=d[j+1]=d[j+2]=g;
          }
          ctx.putImageData(imgData,0,0);
        }

        // Encode as JPEG
        const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',qual));
        const imgBytes=new Uint8Array(await blob.arrayBuffer());
        const embImg=await outPdf.embedJpg(imgBytes);

        // Add page at original PDF dimensions (DPI is metadata in image resolution)
        const newPage=outPdf.addPage([origVP.width,origVP.height]);
        newPage.drawImage(embImg,{x:0,y:0,width:origVP.width,height:origVP.height});
        await tick();
      }

      const outBytes=await outPdf.save();
      const outSize=outBytes.byteLength;
      totalOutSize+=outSize;
      const saved=en.size-outSize;
      const pct=en.size>0?Math.round(saved/en.size*100):0;

      const outName=en.name.replace(/\.pdf$/i,`_compressed.pdf`);
      const outBlob=new Blob([outBytes],{type:'application/pdf'});
      en._outBlob=outBlob;en._outName=outName;card?.classList.add('card-done');
      dlBlob(outBlob,outName);

      const fm=card?.querySelector('.fm');
      if(fm)fm.innerHTML=`${fmtSz(en.size)} → <span class="sav">${fmtSz(outSize)} (-${pct}%)</span>`;
      if(badge){badge.className='sbadge done';badge.textContent='完成';}

    }catch(e){
      toast(`壓縮失敗：${en.name} — ${e.message}`,true);
      if(badge){badge.className='sbadge';badge.textContent='失敗';badge.style.background='var(--danger-bg)';badge.style.color='var(--danger)';}
    }

    doneFiles++;
    const finalPct=Math.round(doneFiles/totalFiles*100);
    document.getElementById('pcPF').style.width=finalPct+'%';
    document.getElementById('pcPP').textContent=finalPct+'%';
  }

  // Show overall compression rate
  if(totalOrigSize>0){
    const overallPct=Math.round((totalOrigSize-totalOutSize)/totalOrigSize*100);
    document.getElementById('pcs4').textContent=`-${overallPct}%`;
  }

  document.getElementById('pcPT').textContent='完成 ✓';
  const saved=totalOrigSize-totalOutSize;
  const pctSaved=totalOrigSize>0?Math.round(saved/totalOrigSize*100):0;
  toast(`壓縮完成！節省 ${fmtSz(Math.max(0,saved))}（${pctSaved}%）`);showChain('pdfcmp');
  }catch(err){
    document.getElementById('pcPT').textContent='發生錯誤';
    toast('壓縮過程發生錯誤：'+err.message,true);
  }finally{
    pcS.conv=false;pcCvt.disabled=false;pcClr.disabled=false;
  }
};

pcClr.onclick=()=>{
  pcS.files=[];pcGrid.innerHTML='';pcGrid.style.display='none';
  document.getElementById('pcPW').style.display='none';
  document.getElementById('pcPF').style.width='0%';
  document.getElementById('pcs1').textContent='0';document.getElementById('pcs2').textContent='0';
  document.getElementById('pcs3').textContent='—';document.getElementById('pcs4').textContent='壓完後顯示';document.getElementById('pcs4').style.fontSize='13px';
  pcUI();
};
