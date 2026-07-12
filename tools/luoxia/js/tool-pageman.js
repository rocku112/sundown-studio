// ════════════════════════════════════════════════
//  8. PDF 頁面管理（旋轉/刪除/重排/插入）
// ════════════════════════════════════════════════
const pmS={file:null,doc:null,pc:0,conv:false};
let pmPages=[];          // working order: {id,kind,src,rot,del,thumb,ptW,ptH}
let pmBaseThumb=[];      // base (rot 0) thumbnail dataURL per original page index
let pmDragIdx=null;

const pmDZ=document.getElementById('pmDZ'),pmFI=document.getElementById('pmFI'),pmGrid=document.getElementById('pmGrid');
const pmUID=()=>'pm'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

pmDZ.onclick=()=>pmFI.click();
pmFI.onchange=e=>{if(e.target.files[0])pmLoad(e.target.files[0]);pmFI.value='';};
pmDZ.ondragover=e=>{e.preventDefault();pmDZ.classList.add('dragover');};
pmDZ.ondragleave=()=>pmDZ.classList.remove('dragover');
pmDZ.ondrop=e=>{e.preventDefault();pmDZ.classList.remove('dragover');const f=[...e.dataTransfer.files].find(x=>x.name.toLowerCase().endsWith('.pdf'));if(f)pmLoad(f);};

async function pmThumbFor(pg,rot){
  const base=(pg.rotate||0)+rot;
  const v1=pg.getViewport({scale:1});
  const scale=Math.min(.55,190/Math.max(v1.width,v1.height));
  const vp=pg.getViewport({scale,rotation:((base%360)+360)%360});
  const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(vp.width));cv.height=Math.max(1,Math.round(vp.height));
  await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
  return cv.toDataURL('image/jpeg',.72);
}

async function pmLoad(file){
  pmClearAll();
  pmS.file=file;
  document.getElementById('pmInfo').style.display='flex';
  document.getElementById('pmFName').textContent=file.name;
  document.getElementById('pmFMeta').textContent='載入中…';
  pmDZ.style.display='none';
  pmGrid.innerHTML='<div class="pm-loading">正在載入頁面縮圖…</div>';
  try{
    const ab=await file.arrayBuffer();
    pmS.doc=await pdfjsLib.getDocument({data:ab}).promise;
    pmS.pc=pmS.doc.numPages;
    document.getElementById('pmFMeta').textContent=`${pmS.pc} 頁 · ${fmtSz(file.size)}`;
    pmBaseThumb=new Array(pmS.pc).fill(null);
    pmPages=[];
    for(let i=0;i<pmS.pc;i++){
      const pg=await pmS.doc.getPage(i+1);
      const view=pg.view||[0,0,595.28,841.89];
      const ptW=view[2]-view[0],ptH=view[3]-view[1];
      const thumb=await pmThumbFor(pg,0);
      pmBaseThumb[i]=thumb;
      pmPages.push({id:pmUID(),kind:'page',src:i,rot:0,del:false,thumb,ptW,ptH});
      // Progressive render so long PDFs feel responsive
      if(i%3===0||i===pmS.pc-1){pmRender();await tick();}
    }
    pmRender();pmUI();
  }catch(e){toast('無法讀取 PDF：'+(e.message||e),true);pmClearAll();}
}

function pmSVG(name){
  const p={
    rotL:'<path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 3-5"/>',
    rotR:'<path d="M21 2v6h-6"/><path d="M21 8a9 9 0 1 1-3-5"/>',
    add:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    del:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>',
    rst:'<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
    left:'<polyline points="15 18 9 12 15 6"/>',
    right:'<polyline points="9 18 15 12 9 6"/>'
  }[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

function pmRender(){
  if(!pmPages.length){pmGrid.innerHTML='';return;}
  let out=0;
  pmGrid.innerHTML=pmPages.map((it,i)=>{
    const first=i===0,last=i===pmPages.length-1;
    let badge;
    if(it.del){badge=`<span class="pm-badge del">刪除</span>`;}
    else{out++;badge=`<span class="pm-badge${it.kind==='blank'?' blank':''}">${it.kind==='blank'?'空白 '+out:out}</span>`;}
    const rotBadge=(it.kind==='page'&&it.rot%360!==0)?`<span class="pm-rot">${((it.rot%360)+360)%360}°</span>`:'';
    const canvas=it.kind==='blank'
      ?`<div class="pm-canvas blank"><div class="pm-blanksheet"><span>空白頁</span></div></div>`
      :`<div class="pm-canvas"><img src="${it.thumb}" alt="第 ${it.src+1} 頁"></div>`;
    const rotBtns=it.kind==='page'
      ?`<button title="向左旋轉" onclick="pmRotate(${i},-90)">${pmSVG('rotL')}</button><button title="向右旋轉" onclick="pmRotate(${i},90)">${pmSVG('rotR')}</button>`
      :'';
    const rmBtn=it.del
      ?`<button class="rst" title="還原此頁" onclick="pmToggleDel(${i})">${pmSVG('rst')}</button>`
      :`<button class="rm" title="${it.kind==='blank'?'移除空白頁':'刪除此頁'}" onclick="pmToggleDel(${i})">${pmSVG('del')}</button>`;
    return `<div class="pm-tile${it.del?' del':''}" id="${it.id}" draggable="true"
      ondragstart="pmDragStart(event,${i})" ondragover="pmDragOver(event,${i})"
      ondragleave="pmDragLeave(event)" ondrop="pmDrop(event,${i})" ondragend="pmDragEnd()">
      ${badge}${rotBadge}${canvas}
      <div class="pm-bar">
        <button title="往前移" onclick="event.stopPropagation();pmMove(${i},-1)" ${first?'disabled':''}>${pmSVG('left')}</button>
        ${rotBtns}
        <button title="在此頁後插入空白頁" onclick="event.stopPropagation();pmInsertBlank(${i})">${pmSVG('add')}</button>
        ${rmBtn}
        <button title="往後移" onclick="event.stopPropagation();pmMove(${i},1)" ${last?'disabled':''}>${pmSVG('right')}</button>
      </div>
    </div>`;
  }).join('');
  // Stats
  const kept=pmPages.filter(p=>!p.del);
  document.getElementById('pms1').textContent=pmS.pc;
  document.getElementById('pms2').textContent=kept.length;
  document.getElementById('pms3').textContent=pmPages.filter(p=>p.kind==='page'&&p.rot%360!==0).length;
  document.getElementById('pms4').textContent=pmPages.filter(p=>p.del).length;
}

async function pmRotate(i,delta){
  const it=pmPages[i];if(!it||it.kind!=='page')return;
  it.rot=(((it.rot+delta)%360)+360)%360;
  try{const pg=await pmS.doc.getPage(it.src+1);it.thumb=it.rot===0?pmBaseThumb[it.src]:await pmThumbFor(pg,it.rot);}catch(e){}
  pmRender();pmUI();
}
function pmToggleDel(i){
  const it=pmPages[i];if(!it)return;
  if(it.kind==='blank'&&!it.del){pmPages.splice(i,1);}   // remove blank outright
  else{it.del=!it.del;}
  pmRender();pmUI();
}
function pmInsertBlank(i){
  const ref=pmPages[i]||pmPages[pmPages.length-1];
  const ptW=ref?ref.ptW:595.28,ptH=ref?ref.ptH:841.89;
  pmPages.splice(i+1,0,{id:pmUID(),kind:'blank',ptW,ptH,del:false});
  pmRender();pmUI();
}
function pmMove(i,d){const j=i+d;if(j<0||j>=pmPages.length)return;[pmPages[i],pmPages[j]]=[pmPages[j],pmPages[i]];pmRender();pmUI();}

// Drag reorder
function pmDragStart(e,i){pmDragIdx=i;setTimeout(()=>document.getElementById(pmPages[i]?.id)?.classList.add('dragging'),0);}
function pmDragOver(e,i){e.preventDefault();if(i===pmDragIdx)return;document.querySelectorAll('.pm-tile').forEach(el=>el.classList.remove('drag-over'));document.getElementById(pmPages[i]?.id)?.classList.add('drag-over');}
function pmDragLeave(e){e.currentTarget.classList.remove('drag-over');}
function pmDrop(e,toIdx){e.preventDefault();if(pmDragIdx===null||pmDragIdx===toIdx)return;const moved=pmPages.splice(pmDragIdx,1)[0];pmPages.splice(toIdx,0,moved);pmRender();pmUI();}
function pmDragEnd(){pmDragIdx=null;document.querySelectorAll('.pm-tile').forEach(el=>el.classList.remove('dragging','drag-over'));}

async function pmResetAll(){
  if(!pmS.doc)return;
  pmPages=pmBaseThumb.map((t,i)=>{
    const p=pmPages.find(x=>x.kind==='page'&&x.src===i);
    return {id:pmUID(),kind:'page',src:i,rot:0,del:false,thumb:t,ptW:p?p.ptW:595.28,ptH:p?p.ptH:841.89};
  });
  // ptW/ptH fallback: reload from doc if missing
  pmRender();pmUI();
}
async function pmRotateAll(delta){
  for(let i=0;i<pmPages.length;i++){if(pmPages[i].kind==='page'){await pmRotate(i,delta);}}
}

function pmUI(){
  const has=pmPages.length>0;
  const kept=pmPages.filter(p=>!p.del).length;
  document.getElementById('pmExport').disabled=!has||kept===0||pmS.conv;
  document.getElementById('pmClr').disabled=!has;
  ['pmRotAllL','pmRotAllR','pmAppendBlank','pmReset'].forEach(id=>document.getElementById(id).disabled=!has);
}

function pmClearAll(){
  if(pmS.doc&&pmS.doc.destroy)try{pmS.doc.destroy();}catch(e){}
  pmS.file=null;pmS.doc=null;pmS.pc=0;pmPages=[];pmBaseThumb=[];pmDragIdx=null;
  pmGrid.innerHTML='';
  document.getElementById('pmInfo').style.display='none';
  pmDZ.style.display='block';
  ['pms1','pms2','pms3','pms4'].forEach(id=>document.getElementById(id).textContent='0');
  const pw=document.getElementById('pmPW');if(pw)pw.style.display='none';
  pmUI();
}

document.getElementById('pmRotAllL').onclick=()=>pmRotateAll(-90);
document.getElementById('pmRotAllR').onclick=()=>pmRotateAll(90);
document.getElementById('pmAppendBlank').onclick=()=>pmInsertBlank(pmPages.length-1);
document.getElementById('pmReset').onclick=()=>pmResetAll();
document.getElementById('pmClr').onclick=()=>pmClearAll();

document.getElementById('pmExport').onclick=async()=>{
  if(pmS.conv||!pmS.doc)return;
  const keep=pmPages.filter(p=>!p.del);
  if(!keep.length){toast('至少要保留一頁',true);return;}
  pmS.conv=true;pmUI();
  const pw=document.getElementById('pmPW');pw.style.display='block';
  const setProg=(p,txt)=>{document.getElementById('pmPF').style.width=p+'%';document.getElementById('pmPP').textContent=Math.round(p)+'%';if(txt)document.getElementById('pmPT').textContent=txt;};
  setProg(0,'載入函式庫…');
  const ok=await ensurePdfLib();
  if(!ok){toast('PDF 函式庫載入失敗，請重新整理後再試',true);pmS.conv=false;pw.style.display='none';pmUI();return;}
  try{
    const {PDFDocument,degrees}=PDFLib;
    const ab=await pmS.file.arrayBuffer();
    const src=await PDFDocument.load(ab);
    const out=await PDFDocument.create();
    // Copy every needed source page in ONE call so shared resources (fonts/images)
    // are de-duplicated instead of re-embedded per page.
    const pageItems=keep.filter(k=>k.kind==='page');
    const copied=await out.copyPages(src,pageItems.map(k=>k.src));
    const bySrc=new Map();pageItems.forEach((it,idx)=>bySrc.set(it,copied[idx]));
    for(let i=0;i<keep.length;i++){
      const it=keep[i];
      if(it.kind==='blank'){
        out.addPage([it.ptW,it.ptH]);
      }else{
        const cp=bySrc.get(it);
        const baseAngle=(cp.getRotation&&cp.getRotation().angle)||0;
        cp.setRotation(degrees(((baseAngle+it.rot)%360+360)%360));
        out.addPage(cp);
      }
      setProg((i+1)/keep.length*100,'處理頁面…');
    }
    setProg(100,'儲存中…');
    const bytes=await out.save();
    const name=(document.getElementById('pmName').value.trim()||'edited')+'.pdf';
    dlBlob(new Blob([bytes],{type:'application/pdf'}),name);
    toast(`已輸出 ${keep.length} 頁`);
    if(typeof showChain==='function')showChain('pageman');
  }catch(e){toast('輸出失敗：'+(e.message||e),true);}
  finally{pmS.conv=false;setTimeout(()=>{pw.style.display='none';},600);pmUI();}
};
