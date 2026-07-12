// ════════════════════════════════════════════════
//  9. PDF 浮水印
// ════════════════════════════════════════════════
const wmS={file:null,doc:null,pc:0,conv:false,type:'text',layout:'tile',pos:'mc',img:null,page1:null};
const wmDZ=document.getElementById('wmDZ'),wmFI=document.getElementById('wmFI');

wmDZ.onclick=()=>wmFI.click();
wmFI.onchange=e=>{if(e.target.files[0])wmLoad(e.target.files[0]);wmFI.value='';};
wmDZ.ondragover=e=>{e.preventDefault();wmDZ.classList.add('dragover');};
wmDZ.ondragleave=()=>wmDZ.classList.remove('dragover');
wmDZ.ondrop=e=>{e.preventDefault();wmDZ.classList.remove('dragover');const f=[...e.dataTransfer.files].find(x=>x.name.toLowerCase().endsWith('.pdf'));if(f)wmLoad(f);};

// Settings wiring
const wmBind=(id,vid,fmt)=>{const el=document.getElementById(id);el.oninput=()=>{if(vid)document.getElementById(vid).textContent=fmt?fmt(el.value):el.value;wmPreview();};};
wmBind('wmSize','wmSizeV');
wmBind('wmOpacity','wmOpacityV',v=>v+'%');
wmBind('wmRot','wmRotV',v=>v+'°');
wmBind('wmImgScale','wmImgScaleV',v=>v+'%');
document.getElementById('wmText').oninput=wmPreview;
document.getElementById('wmColor').oninput=wmPreview;
document.getElementById('wmPageMode').onchange=()=>{document.getElementById('wmRangeRow').style.display=document.getElementById('wmPageMode').value==='range'?'flex':'none';};
document.getElementById('wmRange').oninput=()=>{};
document.getElementById('wmImgPick').onclick=()=>document.getElementById('wmImgFI').click();
document.getElementById('wmImgFI').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{wmS.img=await loadImg(f);document.getElementById('wmImgName').textContent=f.name;wmPreview();}catch(err){toast('圖片載入失敗',true);}e.target.value='';};

function wmSetType(t){wmS.type=t;document.querySelectorAll('#wmSeg button').forEach(b=>b.classList.toggle('active',b.dataset.t===t));document.getElementById('wmTextBox').style.display=t==='text'?'block':'none';document.getElementById('wmImgBox').style.display=t==='image'?'block':'none';wmPreview();}
function wmSetLayout(l){wmS.layout=l;document.querySelectorAll('#wmLayoutSeg button').forEach(b=>b.classList.toggle('active',b.dataset.l===l));document.getElementById('wmPosRow').style.display=l==='single'?'flex':'none';wmPreview();}
function wmSetPos(p){wmS.pos=p;document.querySelectorAll('#wmPosGrid button').forEach(b=>b.classList.toggle('active',b.dataset.p===p));wmPreview();}

function wmCfg(){
  return {
    type:wmS.type,
    text:document.getElementById('wmText').value||' ',
    size:+document.getElementById('wmSize').value,
    color:document.getElementById('wmColor').value,
    opacity:+document.getElementById('wmOpacity').value/100,
    rot:+document.getElementById('wmRot').value,
    layout:wmS.layout,
    pos:wmS.pos,
    imgScale:+document.getElementById('wmImgScale').value/100
  };
}

// Draw watermark onto a canvas sized (W,H) device px covering the page's UNROTATED
// media box (ptScale = px per PDF point). pageRot = page's /Rotate (0/90/180/270):
// we pre-rotate by -pageRot so that after the viewer re-applies /Rotate the watermark
// is upright and aligned to the visible page. Layout is computed in visible dimensions.
function wmDraw(ctx,W,H,ptScale,cfg,pageRot){
  pageRot=(((pageRot||0)%360)+360)%360;
  ctx.clearRect(0,0,W,H);
  ctx.globalAlpha=cfg.opacity;
  ctx.save();
  ctx.translate(W/2,H/2);
  if(pageRot)ctx.rotate(-pageRot*Math.PI/180);
  const swap=(pageRot===90||pageRot===270);
  const vw=swap?H:W, vh=swap?W:H;         // visible (upright) extents
  const ang=cfg.rot*Math.PI/180;          // user rotation, within upright space
  if(cfg.type==='image'){
    if(!wmS.img){ctx.restore();return;}
    const iw=wmS.img.naturalWidth,ih=wmS.img.naturalHeight;
    const drawW=vw*cfg.imgScale,drawH=drawW*(ih/iw);
    if(cfg.layout==='tile'){
      const stepX=drawW*1.4,stepY=drawH*1.6,R=Math.hypot(vw,vh);
      ctx.save();ctx.rotate(ang);
      for(let y=-R;y<R;y+=stepY)for(let x=-R;x<R;x+=stepX)ctx.drawImage(wmS.img,x-drawW/2,y-drawH/2,drawW,drawH);
      ctx.restore();
    }else{
      const[cx,cy]=wmAnchorC(cfg.pos,vw,vh,drawW,drawH);
      ctx.save();ctx.translate(cx,cy);ctx.rotate(ang);ctx.drawImage(wmS.img,-drawW/2,-drawH/2,drawW,drawH);ctx.restore();
    }
    ctx.restore();return;
  }
  const px=cfg.size*ptScale;
  ctx.font=`700 ${px}px 'Noto Sans TC','Microsoft JhengHei','Outfit',sans-serif`;
  ctx.fillStyle=cfg.color;ctx.textAlign='center';ctx.textBaseline='middle';
  const tw=ctx.measureText(cfg.text).width;
  if(cfg.layout==='tile'){
    const stepX=tw+px*1.8,stepY=px*2.6,R=Math.hypot(vw,vh);
    ctx.save();ctx.rotate(ang);
    let row=0;
    for(let y=-R;y<R;y+=stepY){const off=(row%2)?stepX/2:0;for(let x=-R;x<R;x+=stepX)ctx.fillText(cfg.text,x+off,y);row++;}
    ctx.restore();
  }else{
    const[cx,cy]=wmAnchorC(cfg.pos,vw,vh,tw,px);
    ctx.save();ctx.translate(cx,cy);ctx.rotate(ang);ctx.fillText(cfg.text,0,0);ctx.restore();
  }
  ctx.restore();
}
// Anchor in CENTER-origin coords for a visible box vw×vh (+x right, +y down).
function wmAnchorC(pos,vw,vh,ew,eh){
  const mx=Math.max(ew/2,vw*0.06)+8,my=Math.max(eh/2,vh*0.05)+8;
  const xs={l:-vw/2+mx,c:0,r:vw/2-mx},ys={t:-vh/2+my,m:0,b:vh/2-my};
  const p=pos.length===2?pos:'mc';
  const col=p[1]==='l'?'l':p[1]==='r'?'r':'c';
  const rowc=p[0]==='t'?'t':p[0]==='b'?'b':'m';
  return [xs[col],ys[rowc]];
}

async function wmLoad(file){
  wmClearAll();
  wmS.file=file;
  document.getElementById('wmInfo').style.display='flex';
  document.getElementById('wmFName').textContent=file.name;
  document.getElementById('wmFMeta').textContent='載入中…';
  wmDZ.style.display='none';
  document.getElementById('wmPrevWrap').style.display='flex';
  try{
    const ab=await file.arrayBuffer();
    wmS.doc=await pdfjsLib.getDocument({data:ab}).promise;
    wmS.pc=wmS.doc.numPages;
    document.getElementById('wmFMeta').textContent=`${wmS.pc} 頁 · ${fmtSz(file.size)}`;
    document.getElementById('wmExport').disabled=false;
    document.getElementById('wmClr').disabled=false;
    // Render page 1 for preview backdrop
    const pg=await wmS.doc.getPage(1);
    const v1=pg.getViewport({scale:1});
    const S=Math.min(1.5,360/v1.width);
    const vp=pg.getViewport({scale:S});
    const cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);
    await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    wmS.page1={canvas:cv,ptW:v1.width,ptH:v1.height,scale:S};
    wmPreview();
  }catch(e){toast('無法讀取 PDF：'+(e.message||e),true);wmClearAll();}
}

function wmPreview(){
  const wrap=document.getElementById('wmPrevWrap');
  if(!wmS.page1){wrap.innerHTML='<div class="wm-prev-empty">預覽載入中…</div>';return;}
  const {canvas:pageCv,scale}=wmS.page1;
  const W=pageCv.width,H=pageCv.height;
  const out=document.createElement('canvas');out.width=W;out.height=H;
  const ctx=out.getContext('2d');
  ctx.drawImage(pageCv,0,0);
  const wl=document.createElement('canvas');wl.width=W;wl.height=H;
  wmDraw(wl.getContext('2d'),W,H,scale,wmCfg(),0);  // backdrop already upright
  ctx.drawImage(wl,0,0);
  wrap.innerHTML='';wrap.appendChild(out);
}

function wmClearAll(){
  if(wmS.doc&&wmS.doc.destroy)try{wmS.doc.destroy();}catch(e){}
  wmS.file=null;wmS.doc=null;wmS.pc=0;wmS.page1=null;
  document.getElementById('wmInfo').style.display='none';
  wmDZ.style.display='block';
  const wrap=document.getElementById('wmPrevWrap');wrap.style.display='none';wrap.innerHTML='<div class="wm-prev-empty">預覽載入中…</div>';
  document.getElementById('wmExport').disabled=true;
  document.getElementById('wmClr').disabled=true;
}
document.getElementById('wmClr').onclick=()=>wmClearAll();

document.getElementById('wmExport').onclick=async()=>{
  if(wmS.conv||!wmS.file)return;
  const cfg=wmCfg();
  if(cfg.type==='image'&&!wmS.img){toast('請先選擇浮水印圖片',true);return;}
  if(cfg.type==='text'&&!document.getElementById('wmText').value.trim()){toast('請輸入浮水印文字',true);return;}
  wmS.conv=true;document.getElementById('wmExport').disabled=true;
  const ok=await ensurePdfLib();
  if(!ok){toast('PDF 函式庫載入失敗，請重新整理後再試',true);wmS.conv=false;document.getElementById('wmExport').disabled=false;return;}
  try{
    const {PDFDocument}=PDFLib;
    const ab=await wmS.file.arrayBuffer();
    const doc=await PDFDocument.load(ab);
    const pages=doc.getPages();
    const total=pages.length;
    let targets;
    if(document.getElementById('wmPageMode').value==='range'){
      targets=new Set(parsePageRange(document.getElementById('wmRange').value,total).map(n=>n-1));
      if(!targets.size){toast('範圍無效，請檢查格式',true);wmS.conv=false;document.getElementById('wmExport').disabled=false;return;}
    }else{targets=new Set(pages.map((_,i)=>i));}
    const cache=new Map();  // sizeKey -> embedded image
    for(let i=0;i<total;i++){
      if(!targets.has(i))continue;
      const page=pages[i];
      const {width:pw,height:ph}=page.getSize();
      const pageRot=(((page.getRotation().angle||0)%360)+360)%360;
      const key=Math.round(pw)+'x'+Math.round(ph)+'r'+pageRot;
      let embedded=cache.get(key);
      if(!embedded){
        const S=Math.min(2.5,3000/Math.max(pw,ph));
        const W=Math.max(1,Math.round(pw*S)),H=Math.max(1,Math.round(ph*S));
        const cv=document.createElement('canvas');cv.width=W;cv.height=H;
        wmDraw(cv.getContext('2d'),W,H,S,cfg,pageRot);
        const dataUrl=cv.toDataURL('image/png');
        const pngBytes=Uint8Array.from(atob(dataUrl.split(',')[1]),c=>c.charCodeAt(0));
        embedded=await doc.embedPng(pngBytes);
        cache.set(key,embedded);
      }
      page.drawImage(embedded,{x:0,y:0,width:pw,height:ph});
    }
    const bytes=await doc.save();
    const base=wmS.file.name.replace(/\.pdf$/i,'');
    dlBlob(new Blob([bytes],{type:'application/pdf'}),`${base}_watermark.pdf`);
    toast(`已加上浮水印（${targets.size} 頁）`);
    if(typeof showChain==='function')showChain('pdfwm');
  }catch(e){toast('處理失敗：'+(e.message||e),true);}
  finally{wmS.conv=false;document.getElementById('wmExport').disabled=false;}
};
