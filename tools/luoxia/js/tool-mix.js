// ════════════════════════════════════════════════
//  7. 混合合併 PDF
// ════════════════════════════════════════════════
const mxS={items:[],conv:false};
const mxDZ=document.getElementById('mxDZ'),mxFI=document.getElementById('mxFI');
const mxCvt=document.getElementById('mxCvt'),mxClr=document.getElementById('mxClr');
const mxList=document.getElementById('mxList');

function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// ── Drag-to-reorder state ──
let mxDragIdx=null;

mxDZ.onclick=()=>mxFI.click();
mxFI.onchange=e=>{mxHF([...e.target.files]);mxFI.value='';};
mxDZ.ondragover=e=>{e.preventDefault();mxDZ.classList.add('dragover');};
mxDZ.ondragleave=()=>mxDZ.classList.remove('dragover');
mxDZ.ondrop=e=>{
  e.preventDefault();mxDZ.classList.remove('dragover');
  const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')||f.name.toLowerCase().endsWith('.pdf'));
  if(files.length)mxHF(files);
};

async function mxHF(files){
  for(const f of files){
    if(mxS.items.find(x=>x.name===f.name&&x.size===f.size))continue;
    const id='mx'+Date.now()+Math.random().toString(36).slice(2);
    const isPdf=f.name.toLowerCase().endsWith('.pdf');
    const en={id,name:f.name,size:f.size,file:f,isPdf,pc:isPdf?0:1,doc:null,thumbUrl:null};
    mxS.items.push(en);
    if(isPdf)mxLoadPdf(f,en); else mxLoadImg(f,en);
  }
  mxRender();mxUI();
}

async function mxLoadPdf(file,en){
  try{
    const ab=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:ab}).promise;
    en.doc=pdf;en.pc=pdf.numPages;
    const pg=await pdf.getPage(1),vp=pg.getViewport({scale:.5});
    const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;
    await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    en.thumbUrl=cv.toDataURL('image/jpeg',.7);
  }catch(e){en.thumbUrl=null;}
  mxRender();mxUI();
}

async function mxLoadImg(file,en){
  en._thumbRevokeUrl=URL.createObjectURL(file);
  en.thumbUrl=en._thumbRevokeUrl;
  mxRender();mxUI();
}

function mxRender(){
  const hasItems=mxS.items.length>0;
  mxDZ.style.display=hasItems?'none':'block';
  document.getElementById('mxAddBar').style.display=hasItems?'flex':'none';
  mxList.style.display=hasItems?'flex':'none';
  if(!hasItems){mxList.innerHTML='';return;}

  mxList.innerHTML=mxS.items.map((en,i)=>{
    const typeLabel=en.isPdf?'PDF':'IMG';
    const typeCls=en.isPdf?'pdf':'img';
    const metaTxt=en.isPdf?(en.pc?`${en.pc} 頁 · ${fmtSz(en.size)}`:'載入中…'):`圖片 · ${fmtSz(en.size)}`;
    const safeName=escHtml(en.name);
    const thumbInner=en.thumbUrl?`<img src="${en.thumbUrl}">`:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d8d2c8" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
    return `<div class="mx-item" id="${en.id}" draggable="true"
      ondragstart="mxDragStart(event,${i})"
      ondragover="mxDragOver(event,${i})"
      ondragleave="mxDragLeave(event)"
      ondrop="mxDrop(event,${i})"
      ondragend="mxDragEnd()">
      <div class="mx-drag">⠿</div>
      <div class="mx-thumb">${thumbInner}</div>
      <div class="mx-info">
        <div class="mx-name" title="${safeName}">${safeName}</div>
        <div class="mx-meta">${metaTxt}</div>
      </div>
      <span class="mx-type ${typeCls}">${typeLabel}</span>
      <div style="display:flex;flex-direction:column;gap:3px;">
        <button class="reord" onclick="mxMove(${i},-1)" ${i===0?'disabled':''}><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"18 15 12 9 6 15\"/></svg></button>
        <button class="reord" onclick="mxMove(${i},1)" ${i===mxS.items.length-1?'disabled':''}><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"/></svg></button>
      </div>
      <button class="pdfo-rm" onclick="mxRm('${en.id}')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>
    </div>`;
  }).join('');

  // Stats
  document.getElementById('mxs1').textContent=mxS.items.length;
  document.getElementById('mxs2').textContent=mxS.items.reduce((s,en)=>s+en.pc,0)||'?';
}

// ── Drag reorder ──
function mxDragStart(e,i){mxDragIdx=i;setTimeout(()=>document.getElementById(mxS.items[i].id)?.classList.add('dragging'),0);}
function mxDragOver(e,i){e.preventDefault();if(i===mxDragIdx)return;document.querySelectorAll('.mx-item').forEach(el=>el.classList.remove('drag-over'));document.getElementById(mxS.items[i]?.id)?.classList.add('drag-over');}
function mxDragLeave(e){e.currentTarget.classList.remove('drag-over');}
function mxDrop(e,toIdx){
  e.preventDefault();
  if(mxDragIdx===null||mxDragIdx===toIdx)return;
  const moved=mxS.items.splice(mxDragIdx,1)[0];
  mxS.items.splice(toIdx,0,moved);
  mxRender();mxUI();
}
function mxDragEnd(){mxDragIdx=null;document.querySelectorAll('.mx-item').forEach(el=>el.classList.remove('dragging','drag-over'));}

function mxMove(i,d){const j=i+d;if(j<0||j>=mxS.items.length)return;[mxS.items[i],mxS.items[j]]=[mxS.items[j],mxS.items[i]];mxRender();mxUI();}
function mxRm(id){const en=mxS.items.find(x=>x.id===id);if(en?._thumbRevokeUrl)URL.revokeObjectURL(en._thumbRevokeUrl);mxS.items=mxS.items.filter(x=>x.id!==id);mxRender();mxUI();}

function mxUI(){
  const h=mxS.items.length>0;
  mxCvt.disabled=!h;mxClr.disabled=!h;
}

// ── Page size helpers ──
const A4_W=595.28,A4_H=841.89;     // PDF points
const LT_W=612,LT_H=792;

function mxGetPageDims(imgW,imgH,mode){
  if(mode==='fit') return {pw:imgW,ph:imgH};
  const[pw,ph]=mode==='a4'?[A4_W,A4_H]:[LT_W,LT_H];
  return {pw,ph};
}

function mxCalcImgRect(imgW,imgH,pw,ph,align){
  if(align==='fill'){
    // cover: crop to fill
    const scaleW=pw/imgW,scaleH=ph/imgH,s=Math.max(scaleW,scaleH);
    const dw=imgW*s,dh=imgH*s;
    return {x:-(dw-pw)/2,y:-(dh-ph)/2,w:dw,h:dh};
  }
  if(align==='contain'){
    // contain: letterbox
    const scaleW=pw/imgW,scaleH=ph/imgH,s=Math.min(scaleW,scaleH);
    const dw=imgW*s,dh=imgH*s;
    return {x:(pw-dw)/2,y:(ph-dh)/2,w:dw,h:dh};
  }
  // center: 1:1 but clamped
  const scaleW=pw/imgW,scaleH=ph/imgH,s=Math.min(1,scaleW,scaleH);
  const dw=imgW*s,dh=imgH*s;
  return {x:(pw-dw)/2,y:(ph-dh)/2,w:dw,h:dh};
}

// ── Main convert ──
mxCvt.onclick=async()=>{
  if(mxS.conv||!mxS.items.length)return;
  mxS.conv=true;mxCvt.disabled=true;mxClr.disabled=true;

  // Reset progress bar at the start of every run
  const mxPW=document.getElementById('mxPW');
  mxPW.style.display='block';
  document.getElementById('mxPF').style.width='0%';
  document.getElementById('mxPP').textContent='0%';
  document.getElementById('mxPT').textContent='準備中...';

  const ok=await ensurePdfLib();
  if(!ok){toast('PDF 函式庫載入失敗，請重新整理後再試',true);mxS.conv=false;mxCvt.disabled=false;mxClr.disabled=false;return;}

  const {PDFDocument,rgb} = PDFLib;
  const pgSzMode=document.getElementById('mxPgSz').value;
  const alignMode=document.getElementById('mxAlign').value;
  const bgHex=document.getElementById('mxBg').value;
  const bgR=parseInt(bgHex.slice(1,3),16)/255,bgG=parseInt(bgHex.slice(3,5),16)/255,bgB=parseInt(bgHex.slice(5,7),16)/255;

  try{
    const outPdf=await PDFDocument.create();
    const allItems=mxS.items;
    const totalItems=allItems.length;

    for(let ii=0;ii<allItems.length;ii++){
      const en=allItems[ii];
      document.getElementById('mxPT').textContent=en.name;
      document.getElementById('mxPF').style.width=Math.round(ii/totalItems*100)+'%';
      document.getElementById('mxPP').textContent=Math.round(ii/totalItems*100)+'%';

      if(en.isPdf){
        // Always read fresh from the File object — safe to call multiple times
        const ab=await en.file.arrayBuffer();
        const srcPdf=await PDFDocument.load(ab);
        const copied=await outPdf.copyPages(srcPdf,srcPdf.getPageIndices());
        copied.forEach(p=>outPdf.addPage(p));
      } else {
        // Embed image as a page
        const ab=await en.file.arrayBuffer();
        const bytes=new Uint8Array(ab);
        let embImg;
        const mime=en.file.type||'';
        try{
          if(mime==='image/png') embImg=await outPdf.embedPng(bytes);
          else embImg=await outPdf.embedJpg(bytes);
        }catch(e){
          // fallback: render via canvas to JPEG
          const imgEl=await loadImg(en.file);
          const cv=document.createElement('canvas');cv.width=imgEl.naturalWidth;cv.height=imgEl.naturalHeight;
          const ctx=cv.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cv.width,cv.height);ctx.drawImage(imgEl,0,0);
          const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.92));
          const jb=new Uint8Array(await blob.arrayBuffer());
          embImg=await outPdf.embedJpg(jb);
        }

        const {width:imgW,height:imgH}=embImg;
        const {pw,ph}=mxGetPageDims(imgW,imgH,pgSzMode);
        const page=outPdf.addPage([pw,ph]);

        // Draw background
        page.drawRectangle({x:0,y:0,width:pw,height:ph,color:rgb(bgR,bgG,bgB)});

        // Calculate image rect (pdf-lib Y axis starts from bottom)
        const rect=mxCalcImgRect(imgW,imgH,pw,ph,alignMode);
        page.drawImage(embImg,{x:rect.x,y:ph-rect.y-rect.h,width:rect.w,height:rect.h});
      }
      await tick();
    }

    const outBytes=await outPdf.save();
    const outName=(document.getElementById('mxName').value||'merged')+'.pdf';
    dlBlob(new Blob([outBytes],{type:'application/pdf'}),outName);

    document.getElementById('mxPF').style.width='100%';
    document.getElementById('mxPP').textContent='100%';
    document.getElementById('mxPT').textContent='完成 ✓';
    const totalPg=outPdf.getPageCount();
    toast(`合併完成：${totalPg} 頁 · ${fmtSz(outBytes.byteLength)}`);

  }catch(e){
    document.getElementById('mxPT').textContent='發生錯誤';
    toast('合併失敗：'+e.message,true);
  }finally{
    // Always re-enable — runs whether success or error
    mxS.conv=false;mxCvt.disabled=false;mxClr.disabled=false;
  }
};

mxClr.onclick=()=>{
  mxS.items.forEach(en=>{if(en._thumbRevokeUrl)URL.revokeObjectURL(en._thumbRevokeUrl);});
  mxS.items=[];mxRender();mxUI();
  document.getElementById('mxPW').style.display='none';
  document.getElementById('mxPF').style.width='0%';
  document.getElementById('mxPT').textContent='處理中...';
  document.getElementById('mxPP').textContent='0%';
  document.getElementById('mxs1').textContent='0';document.getElementById('mxs2').textContent='0';
};

// Initialise Lucide icons
// Lucide icons — wait for library then render all data-lucide elements
(function waitLucide(){
  try {
    if(typeof lucide!=='undefined') lucide.createIcons();
    else setTimeout(waitLucide, 80);
  } catch(e) {
    console.warn('[SDS] lucide.createIcons failed:', e.message);
  }
})();
