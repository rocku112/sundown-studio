// ════════════════════════════════════════════════
//  11. Office 取圖 — extract embedded images from Office docs
//  .docx/.pptx/.xlsx = clean zip extraction; .doc/.ppt/.xls = best-effort byte carving
// ════════════════════════════════════════════════
let ofItems=[];   // {id,name,blob,thumbUrl,w,h,ok,converted,best,ext}
const ofDZ=document.getElementById('ofDZ'),ofFI=document.getElementById('ofFI'),ofGrid=document.getElementById('ofGrid');
const OF_ZIP_EXT=/\.(docx|pptx|xlsx)$/i, OF_BIN_EXT=/\.(doc|ppt|xls)$/i;
const ofUID=()=>'of'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

ofDZ.onclick=()=>ofFI.click();
ofFI.onchange=e=>{ofHandle([...e.target.files]);ofFI.value='';};
ofDZ.ondragover=e=>{e.preventDefault();ofDZ.classList.add('dragover');};
ofDZ.ondragleave=()=>ofDZ.classList.remove('dragover');
ofDZ.ondrop=e=>{e.preventDefault();ofDZ.classList.remove('dragover');ofHandle([...e.dataTransfer.files]);};

async function ofHandle(files){
  const valid=files.filter(f=>OF_ZIP_EXT.test(f.name)||OF_BIN_EXT.test(f.name));
  const skipped=files.length-valid.length;
  if(skipped)toast(`略過 ${skipped} 個非 Office 檔`,true);
  if(!valid.length)return;
  ofDZ.style.display='none';
  ofGrid.innerHTML='<div class="of-loading">解析中…</div>';
  for(const f of valid){
    try{
      const best=!OF_ZIP_EXT.test(f.name);
      const raws=best?await ofCarve(f):await ofFromZip(f);
      for(const r of raws)await ofAddImage(r,f.name,best);
    }catch(err){toast(`${f.name}：讀取失敗`,true);}
    await tick();
  }
  ofRender();ofUI();
}

// ── clean extraction from OOXML zip (word/ppt/xl media) ──
async function ofFromZip(file){
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const paths=Object.keys(zip.files).filter(p=>/(word|ppt|xl)\/media\/[^\/]+\.(png|jpe?g|gif|bmp|webp|emf|wmf|tiff?)$/i.test(p)).sort();
  const out=[];
  for(const p of paths){
    const bytes=await zip.files[p].async('uint8array');
    out.push({bytes,ext:((p.match(/\.([a-z0-9]+)$/i)||[])[1]||'').toLowerCase()});
  }
  return out;
}

// ── best-effort byte carving for old binary Office (scan JPEG/PNG signatures) ──
async function ofCarve(file){
  const d=new Uint8Array(await file.arrayBuffer()),n=d.length,out=[];
  for(let i=0;i<n-3;i++){
    if(d[i]===0xFF&&d[i+1]===0xD8&&d[i+2]===0xFF){            // JPEG start
      let j=i+3;for(;j<n-1;j++){if(d[j]===0xFF&&d[j+1]===0xD9){j+=2;break;}}
      if(j>i+200){out.push({bytes:d.slice(i,j),ext:'jpg'});i=j-1;continue;}
    }
    if(d[i]===0x89&&d[i+1]===0x50&&d[i+2]===0x4E&&d[i+3]===0x47){  // PNG start
      let j=i+8;for(;j<n-7;j++){if(d[j]===0x49&&d[j+1]===0x45&&d[j+2]===0x4E&&d[j+3]===0x44){j+=8;break;}}
      if(j>i+200){out.push({bytes:d.slice(i,j),ext:'png'});i=j-1;continue;}
    }
  }
  return out;
}

async function ofAddImage(raw,srcName,best){
  const ext=raw.ext,isJpg=/^jpe?g$/.test(ext),rawBlob=new Blob([raw.bytes]);
  const base=srcName.replace(/\.[^.]+$/,'');
  if(/^(png|jpe?g|gif|bmp|webp)$/i.test(ext)){
    try{
      const img=await loadImg(rawBlob);
      if(best&&(img.naturalWidth<48||img.naturalHeight<48))return;   // drop tiny carve junk (icons)
      let blob,converted;
      if(isJpg){blob=rawBlob;converted=false;}
      else{const cv=imgToCanvas(img,img.naturalWidth,img.naturalHeight,'image/jpeg');blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.92));converted=true;}
      ofItems.push({id:ofUID(),name:`${base}_${ofItems.length+1}.jpg`,blob,thumbUrl:URL.createObjectURL(blob),w:img.naturalWidth,h:img.naturalHeight,ok:true,converted,best});
      return;
    }catch(e){if(best)return;}   // carve false-positive → skip; zip decode-fail → list as unsupported below
  }
  ofItems.push({id:ofUID(),name:`${base}_${ofItems.length+1}.${ext||'bin'}`,blob:rawBlob,thumbUrl:null,ok:false,ext,best});
}

function ofRender(){
  if(!ofItems.length){ofGrid.innerHTML='<div class="of-loading">這些檔案裡沒有找到可取出的內嵌圖片。</div>';return;}
  const note=ofItems.some(x=>x.best)?'<div class="of-note">⚠ 部分來自舊格式(.doc/.ppt/.xls)的盡力擷取，可能不完整或含雜圖。最佳結果請在 Office 另存為新版格式(.docx/.pptx/.xlsx)再試。</div>':'';
  ofGrid.innerHTML=note+ofItems.map(it=>`<div class="of-card">
    <div class="of-thumb">${it.thumbUrl?`<img src="${it.thumbUrl}" alt="">`:`<div class="of-noimg"><span>無法轉換</span><small>${(it.ext||'').toUpperCase()} 向量圖</small></div>`}</div>
    <div class="of-meta">${it.ok?`${it.w}×${it.h} · ${it.converted?'轉 JPG':'原 JPG'}`:'瀏覽器無法轉'}${it.best?' · 盡力擷取':''}</div>
    <button class="btn btn-s of-dl" onclick="ofDownload('${it.id}')"><i data-lucide="download" style="width:12px;height:12px;"></i> ${it.ok?'下載 JPG':'下載原檔'}</button>
  </div>`).join('');
  if(typeof lucide!=='undefined')try{lucide.createIcons();}catch(e){}
}

function ofDownload(id){const it=ofItems.find(x=>x.id===id);if(it)dlBlob(it.blob,it.name);}

document.getElementById('ofZip').onclick=async()=>{
  const ok=ofItems.filter(x=>x.ok);
  if(!ok.length){toast('沒有可打包的圖片',true);return;}
  const zip=new JSZip();ok.forEach(it=>zip.file(it.name,it.blob));
  const zb=await zip.generateAsync({type:'blob'});
  dlBlob(zb,`office_images_${Date.now()}.zip`);
  toast(`已打包 ${ok.length} 張圖片`);
  if(typeof showChain==='function')showChain('officeimg');
};
document.getElementById('ofClr').onclick=ofClear;
function ofClear(){ofItems.forEach(it=>it.thumbUrl&&URL.revokeObjectURL(it.thumbUrl));ofItems=[];ofGrid.innerHTML='';ofDZ.style.display='block';ofUI();}
function ofUI(){document.getElementById('ofZip').disabled=!ofItems.some(x=>x.ok);document.getElementById('ofClr').disabled=!ofItems.length;}
