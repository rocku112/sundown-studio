// ════════════════════════════════════════════════
//  10. PDF 標註/簽名/圖章
// ════════════════════════════════════════════════
const anS={file:null,doc:null,pc:0,cur:0,scale:1,pageWpt:0,pageHpt:0,tool:'select',conv:false};
let anPages=[];            // per-page arrays of elements
let anImgs={};             // imgId -> HTMLImageElement
let anSel=null;            // selected element
let anDraft=null;          // in-progress element (draw stroke / rect)
let anDrag=null;           // {sx,sy} move drag state
let anResize=null;         // {el,handle,fx,fy,w0,h0,size0,pts0} resize state
let anTextItems=[];        // current page's extracted text runs (for 改字), normalized coords
const anUID=()=>'an'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const AN_FONTS={
  hei:"'Microsoft JhengHei','微軟正黑體','Noto Sans TC',sans-serif",
  ming:"'PMingLiU','新細明體','Noto Serif TC',serif",
  kai:"'DFKai-SB','標楷體','BiauKai','KaiTi',serif",
  mono:"Consolas,'DM Mono','Courier New',monospace"
};
// Font picker menu — common CJK + Latin fonts (rendered via system fonts, Noto fallbacks)
const AN_FONT_LIST=[
  {g:'中文字體',label:'微軟正黑體',css:AN_FONTS.hei},
  {g:'中文字體',label:'思源黑體',css:"'Noto Sans TC','Source Han Sans TC',sans-serif"},
  {g:'中文字體',label:'新細明體',css:AN_FONTS.ming},
  {g:'中文字體',label:'細明體',css:"'MingLiU','細明體','Noto Serif TC',serif"},
  {g:'中文字體',label:'思源宋體',css:"'Noto Serif TC','Source Han Serif TC',serif"},
  {g:'中文字體',label:'標楷體',css:AN_FONTS.kai},
  {g:'中文字體',label:'微軟雅黑（簡）',css:"'Microsoft YaHei','微软雅黑','Noto Sans SC',sans-serif"},
  {g:'中文字體',label:'宋體（簡）',css:"'SimSun','宋体','Noto Serif SC',serif"},
  {g:'中文字體',label:'黑體（簡）',css:"'SimHei','黑体',sans-serif"},
  {g:'中文字體',label:'楷體（簡）',css:"'KaiTi','楷体',serif"},
  {g:'西文字體',label:'Arial',css:"Arial,Helvetica,sans-serif"},
  {g:'西文字體',label:'Helvetica',css:"Helvetica,Arial,sans-serif"},
  {g:'西文字體',label:'Times New Roman',css:"'Times New Roman',Times,serif"},
  {g:'西文字體',label:'Georgia',css:"Georgia,'Times New Roman',serif"},
  {g:'西文字體',label:'Verdana',css:"Verdana,Geneva,sans-serif"},
  {g:'西文字體',label:'Tahoma',css:"Tahoma,Geneva,sans-serif"},
  {g:'西文字體',label:'Trebuchet MS',css:"'Trebuchet MS',Helvetica,sans-serif"},
  {g:'西文字體',label:'Courier New',css:"'Courier New',Courier,monospace"},
  {g:'西文字體',label:'Consolas',css:AN_FONTS.mono},
  {g:'西文字體',label:'Comic Sans MS',css:"'Comic Sans MS','Comic Sans',cursive"},
  {g:'西文字體',label:'Impact',css:"Impact,Charcoal,sans-serif"}
];
const AN_FONT_DEFAULT=AN_FONTS.hei;
const anFont=()=>document.getElementById('annFont').value||AN_FONT_DEFAULT;
function anBuildFontMenu(){
  const sel=document.getElementById('annFont');if(!sel)return;
  const groups={},order=[];
  AN_FONT_LIST.forEach(f=>{if(!groups[f.g]){groups[f.g]=[];order.push(f.g);}groups[f.g].push(f);});
  sel.innerHTML=order.map(g=>`<optgroup label="${g}">`+groups[g].map(f=>`<option value="${f.css.replace(/"/g,'&quot;')}" style="font-family:${f.css};">${f.label}</option>`).join('')+`</optgroup>`).join('');
  sel.value=AN_FONTS.hei;
}
// Map a detected PDF font (base name + pdf.js category) to one of the base stacks (all in the menu)
function anDetectFont(name,category){
  const n=(name||'').replace(/^[A-Z]{6}\+/,'').toLowerCase();   // strip subset prefix ABCDEF+
  if(/kai|dfkai|biaukai|楷/.test(n))return AN_FONTS.kai;
  if(/courier|mono|consol|等寬|等宽|gothic\s*mono/.test(n)||category==='monospace')return AN_FONTS.mono;
  if(/ming|mincho|song|sung|times|georgia|roman|serif|simsun|宋|明體|明体|細明|新細明/.test(n)||category==='serif')return AN_FONTS.ming;
  return AN_FONTS.hei;   // default sans / 黑體
}
// Build a canvas/CSS font shorthand honouring bold+italic
function anFontStr(el,px){return `${el.italic?'italic ':''}${el.bold?'700':'400'} ${px}px ${el.font||AN_FONT_DEFAULT}`;}

const annDZ=document.getElementById('annDZ'),annFI=document.getElementById('annFI');
const annPageCanvas=document.getElementById('annPageCanvas'),annOverlay=document.getElementById('annOverlay');
const annHost=document.getElementById('annHost');

annDZ.onclick=()=>annFI.click();
annFI.onchange=e=>{if(e.target.files[0])anLoad(e.target.files[0]);annFI.value='';};
annDZ.ondragover=e=>{e.preventDefault();annDZ.classList.add('dragover');};
annDZ.ondragleave=()=>annDZ.classList.remove('dragover');
annDZ.ondrop=e=>{e.preventDefault();annDZ.classList.remove('dragover');const f=[...e.dataTransfer.files].find(x=>x.name.toLowerCase().endsWith('.pdf'));if(f)anLoad(f);};

// Style controls double as: (a) defaults for new elements, (b) live-edit the selected/editing element
function anEditSelected(prop,value){
  const el=anSel||annTextEl;
  if(!el)return;
  if(prop==='color'&&('color'in el))el.color=value;
  else if(prop==='size'&&el.type==='text')el.size=value;
  else if(prop==='font'&&el.type==='text')el.font=value;
  else if(prop==='width'&&(el.type==='rect'||el.type==='draw'))el.width=value;
  else return;
  // reflect live onto the open text editor if it's this element
  if(annTextEl===el){const ta=document.getElementById('annTextEdit');if(ta){const cw=annOverlay.width,pxPerPt=cw/(anS.pageWpt||cw);ta.style.color=el.color;ta.style.fontFamily=el.font||AN_FONT_DEFAULT;ta.style.fontSize=(el.size*pxPerPt)+'px';}}
  anRedraw();
}
function anSyncControls(el){
  if(!el)return;
  if('color'in el)document.getElementById('annColor').value=el.color;
  if(el.type==='text'){
    const sz=Math.min(120,Math.max(8,Math.round(el.size)));
    document.getElementById('annTextSize').value=sz;document.getElementById('annTextSizeV').textContent=sz;
    if(el.font)document.getElementById('annFont').value=el.font;
  }
  if(el.type==='rect'||el.type==='draw'){document.getElementById('annStroke').value=el.width;document.getElementById('annStrokeV').textContent=el.width;}
}
anBuildFontMenu();
document.getElementById('annColor').oninput=e=>anEditSelected('color',e.target.value);
document.getElementById('annFont').onchange=e=>anEditSelected('font',e.target.value);
document.getElementById('annTextSize').oninput=e=>{document.getElementById('annTextSizeV').textContent=e.target.value;anEditSelected('size',+e.target.value);};
document.getElementById('annStroke').oninput=e=>{document.getElementById('annStrokeV').textContent=e.target.value;anEditSelected('width',+e.target.value);};

function anSetTool(t){
  anS.tool=t;anSel=null;anHideTextEdit();
  document.querySelectorAll('#panel-pdfann .ann-tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
  annOverlay.className=t==='select'?'tool-select':'';
  anRedraw();
}

document.getElementById('annImgFI').onchange=async e=>{
  const f=e.target.files[0];if(!f){return;}
  try{
    const img=await loadImg(f);
    const id=anUID();anImgs[id]=img;
    const aspect=img.naturalHeight/img.naturalWidth;
    const w=0.32,h=w*aspect*(anS.pageWpt/anS.pageHpt);   // keep visual aspect in normalized space
    const el={id:anUID(),type:'image',imgId:id,x:0.5-w/2,y:0.5-h/2,w,h};
    anCurArr().push(el);anSel=el;anSetTool('select');anRedraw();anStats();
  }catch(err){toast('圖片載入失敗',true);}
  e.target.value='';
};

function anCurArr(){if(!anPages[anS.cur])anPages[anS.cur]=[];return anPages[anS.cur];}

async function anLoad(file){
  anClearAll();
  anS.file=file;
  document.getElementById('annInfo').style.display='block';
  document.getElementById('annFName').textContent=file.name;
  document.getElementById('annFMeta').textContent='載入中…';
  try{
    const ab=await file.arrayBuffer();
    anS.doc=await pdfjsLib.getDocument({data:ab}).promise;
    anS.pc=anS.doc.numPages;
    anPages=new Array(anS.pc).fill(null);
    document.getElementById('annFMeta').textContent=`${anS.pc} 頁 · ${fmtSz(file.size)}`;
    document.getElementById('annDZ').style.display='none';
    document.getElementById('annStage').style.display='block';
    document.getElementById('annExport').disabled=false;
    document.getElementById('annClr').disabled=false;
    await anGoPage(0);
    anStats();
  }catch(e){toast('無法讀取 PDF：'+(e.message||e),true);anClearAll();}
}

let anPageBusy=false;
async function anGoPage(idx){
  if(!anS.doc||idx<0||idx>=anS.pc||anPageBusy)return;   // guard: ignore nav while a page load is in flight
  anPageBusy=true;
  document.getElementById('annPrev').disabled=true;document.getElementById('annNext').disabled=true;
  try{
    anHideTextEdit();anSel=null;anDraft=null;anS.cur=idx;
    const pg=await anS.doc.getPage(idx+1);
    const v1=pg.getViewport({scale:1});
    const S=Math.min(2,820/v1.width);
    const vp=pg.getViewport({scale:S});
    const W=Math.round(vp.width),H=Math.round(vp.height);
    annPageCanvas.width=W;annPageCanvas.height=H;annOverlay.width=W;annOverlay.height=H;
    annHost.style.width=W+'px';annHost.style.height=H+'px';
    anS.pageWpt=v1.width;anS.pageHpt=v1.height;
    await anExtractText(pg,v1);   // detect existing text runs for 改字 (before render so ready early)
    await pg.render({canvasContext:annPageCanvas.getContext('2d'),viewport:vp}).promise;
    anS.scale=S;anS.pageWpt=v1.width;anS.pageHpt=v1.height;
    document.getElementById('annPgLabel').textContent=`${idx+1} / ${anS.pc}`;
    anRedraw();anStats();
  }catch(e){toast('頁面載入失敗：'+(e.message||e),true);}
  finally{
    anPageBusy=false;
    document.getElementById('annPrev').disabled=anS.cur===0;
    document.getElementById('annNext').disabled=anS.cur===anS.pc-1;
  }
}

// ── Render annotation layer (normalized coords) onto ctx of size cw×ch ──
// pxPerPt = px per PDF point (for font size & stroke width). imgs = image map.
function anRenderLayer(ctx,cw,ch,pxPerPt,anns,imgs){
  if(!anns)return;
  for(const el of anns){
    if(el.type==='text'){
      const px=el.size*pxPerPt;
      ctx.font=anFontStr(el,px);
      ctx.fillStyle=el.color;ctx.textBaseline='top';ctx.textAlign='left';
      const lines=(el.text||'').split('\n');const lh=px*1.25;
      lines.forEach((ln,k)=>ctx.fillText(ln,el.x*cw,el.y*ch+k*lh));
    }else if(el.type==='draw'){
      if(!el.pts||el.pts.length<1)continue;
      ctx.strokeStyle=el.color;ctx.lineWidth=Math.max(1,el.width*pxPerPt);ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();ctx.moveTo(el.pts[0].x*cw,el.pts[0].y*ch);
      for(let i=1;i<el.pts.length;i++)ctx.lineTo(el.pts[i].x*cw,el.pts[i].y*ch);
      if(el.pts.length===1)ctx.lineTo(el.pts[0].x*cw+0.1,el.pts[0].y*ch+0.1);
      ctx.stroke();
    }else if(el.type==='image'){
      const im=(imgs||anImgs)[el.imgId];if(im)ctx.drawImage(im,el.x*cw,el.y*ch,el.w*cw,el.h*ch);
    }else if(el.type==='rect'){
      ctx.strokeStyle=el.color;ctx.lineWidth=Math.max(1,el.width*pxPerPt);ctx.strokeRect(el.x*cw,el.y*ch,el.w*cw,el.h*ch);
    }else if(el.type==='cover'){
      ctx.fillStyle=el.fill||'#ffffff';ctx.fillRect(el.x*cw,el.y*ch,el.w*cw,el.h*ch);
    }
  }
}

// ── 改字：extract existing text runs (normalized, top-left origin) ──
async function anExtractText(pg,v1){
  anTextItems=[];
  try{
    const tc=await pg.getTextContent();
    // Load fonts so we can read real names + bold/italic (best-effort; category still works if it fails)
    try{await pg.getOperatorList();}catch(e){}
    const vpW=v1.width,vpH=v1.height;
    for(const it of tc.items){
      if(!it.str||!it.str.trim())continue;
      const m=pdfjsLib.Util.transform(v1.transform,it.transform);
      const fontH=Math.hypot(m[2],m[3])||it.height||12;
      const baseX=m[4],baseY=m[5];         // baseline-left in viewport coords (top-left origin)
      const w=it.width||fontH;
      const cat=(tc.styles[it.fontName]&&tc.styles[it.fontName].fontFamily)||'';
      let fname='',bold=false,italic=false;
      try{const fo=pg.commonObjs.get(it.fontName);if(fo){fname=fo.name||'';bold=!!fo.bold;italic=!!fo.italic;}}catch(e){}
      anTextItems.push({
        str:it.str, size:fontH, font:anDetectFont(fname,cat), bold, italic,
        nx:baseX/vpW, ny:(baseY-0.8*fontH)/vpH, nw:w/vpW, nh:fontH/vpH,
        cx:(baseX-fontH*0.05)/vpW, cy:(baseY-0.9*fontH)/vpH, cw:(w+fontH*0.1)/vpW, ch:(fontH*1.15)/vpH
      });
    }
  }catch(e){anTextItems=[];}
}
function anHitTextItem(nx,ny){
  for(let i=anTextItems.length-1;i>=0;i--){const t=anTextItems[i];if(nx>=t.cx-0.004&&nx<=t.cx+t.cw+0.004&&ny>=t.cy-0.004&&ny<=t.cy+t.ch+0.004)return t;}
  return null;
}
function anSampleBg(nx,ny){
  try{
    const cw=annPageCanvas.width,ch=annPageCanvas.height;
    const px=Math.max(0,Math.min(cw-1,Math.round(nx*cw))),py=Math.max(0,Math.min(ch-1,Math.round(ny*ch)));
    const d=annPageCanvas.getContext('2d').getImageData(px,py,1,1).data;
    if(d[3]===0)return '#ffffff';   // blank/transparent → assume white paper
    return '#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join('');
  }catch(e){return '#ffffff';}
}
// Estimate original ink colour by averaging the darker pixels inside a text run's box
function anSampleTextColor(it){
  try{
    const cw=annPageCanvas.width,ch=annPageCanvas.height,ctx=annPageCanvas.getContext('2d');
    const x0=Math.max(0,Math.floor(it.nx*cw)),y0=Math.max(0,Math.floor(it.ny*ch));
    const x1=Math.min(cw,Math.ceil((it.nx+it.nw)*cw)),y1=Math.min(ch,Math.ceil((it.ny+it.nh)*ch));
    if(x1<=x0||y1<=y0)return '#111111';
    const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
    let rs=0,gs=0,bs=0,ws=0,n=0;
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]<128)continue;
      const r=data[i],g=data[i+1],b=data[i+2],lum=0.299*r+0.587*g+0.114*b;
      if(lum<200){const w=200-lum;rs+=r*w;gs+=g*w;bs+=b*w;ws+=w;n++;}   // weight darker (core ink) over light AA edges
    }
    if(n<3||ws<=0)return '#111111';
    const to=v=>Math.round(v/ws).toString(16).padStart(2,'0');
    return '#'+to(rs)+to(gs)+to(bs);
  }catch(e){return '#111111';}
}

function anRedraw(){
  const cw=annOverlay.width,ch=annOverlay.height;
  const ctx=annOverlay.getContext('2d');ctx.clearRect(0,0,cw,ch);
  const pxPerPt=cw/(anS.pageWpt||cw);
  anRenderLayer(ctx,cw,ch,pxPerPt,anCurArr(),anImgs);
  if(anDraft)anRenderLayer(ctx,cw,ch,pxPerPt,[anDraft],anImgs);
  if(anSel){
    const b=anBBox(anSel,cw,ch,ctx,pxPerPt);
    if(b){
      ctx.save();ctx.strokeStyle='#C9960A';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.strokeRect(b.x-4,b.y-4,b.w+8,b.h+8);ctx.restore();
      // resize handles at the four content corners
      const c=anCorners(anSel);
      ctx.save();ctx.setLineDash([]);ctx.fillStyle='#C9960A';ctx.strokeStyle='#fff';ctx.lineWidth=1.5;
      ['nw','ne','sw','se'].forEach(k=>{const hx=c[k].x*cw,hy=c[k].y*ch;ctx.beginPath();ctx.rect(hx-5,hy-5,10,10);ctx.fill();ctx.stroke();});
      ctx.restore();
    }
  }
}

function anBBox(el,cw,ch,ctx,pxPerPt){
  if(el.type==='image'||el.type==='rect'||el.type==='cover')return {x:el.x*cw,y:el.y*ch,w:el.w*cw,h:el.h*ch};
  if(el.type==='text'){
    const px=el.size*pxPerPt;ctx.font=anFontStr(el,px);
    const lines=(el.text||' ').split('\n');let mw=0;lines.forEach(l=>mw=Math.max(mw,ctx.measureText(l||' ').width));
    return {x:el.x*cw,y:el.y*ch,w:mw,h:lines.length*px*1.25};
  }
  if(el.type==='draw'){
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;el.pts.forEach(p=>{x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);});
    const pad=el.width*pxPerPt;return {x:x0*cw-pad,y:y0*ch-pad,w:(x1-x0)*cw+2*pad,h:(y1-y0)*ch+2*pad};
  }
  return null;
}

// ── Resize handles (normalized content bbox + corners) ──
function anContentBBoxN(el){
  const cw=annOverlay.width,ch=annOverlay.height,ctx=annOverlay.getContext('2d'),pxPerPt=cw/(anS.pageWpt||cw);
  if(el.type==='image'||el.type==='rect'||el.type==='cover')return {x:el.x,y:el.y,w:el.w,h:el.h};
  if(el.type==='text'){
    const px=el.size*pxPerPt;ctx.font=anFontStr(el,px);
    const lines=(el.text||' ').split('\n');let mw=0;lines.forEach(l=>mw=Math.max(mw,ctx.measureText(l||' ').width));
    return {x:el.x,y:el.y,w:Math.max(mw/cw,0.02),h:Math.max(lines.length*px*1.25/ch,0.02)};
  }
  if(el.type==='draw'){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;el.pts.forEach(p=>{x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);});return {x:x0,y:y0,w:Math.max(x1-x0,0.005),h:Math.max(y1-y0,0.005)};}
  return {x:0,y:0,w:0,h:0};
}
function anCorners(el){const b=anContentBBoxN(el);return {nw:{x:b.x,y:b.y},ne:{x:b.x+b.w,y:b.y},sw:{x:b.x,y:b.y+b.h},se:{x:b.x+b.w,y:b.y+b.h},box:b};}
function anHandleHit(nx,ny){
  if(!anSel)return null;
  const cw=annOverlay.width,ch=annOverlay.height,c=anCorners(anSel),tol=12;
  for(const k of ['nw','ne','sw','se'])if(Math.abs(nx*cw-c[k].x*cw)<=tol&&Math.abs(ny*ch-c[k].y*ch)<=tol)return k;
  return null;
}
function anPlaceFromFixed(handle,fx,fy,nw,nh){
  if(handle==='se')return {x:fx,y:fy};
  if(handle==='ne')return {x:fx,y:fy-nh};
  if(handle==='nw')return {x:fx-nw,y:fy-nh};
  return {x:fx-nw,y:fy}; // sw
}
function anApplyResize(R,x,y){
  const el=R.el;
  if(el.type==='rect'||el.type==='cover'){
    el.x=Math.min(x,R.fx);el.y=Math.min(y,R.fy);el.w=Math.max(0.01,Math.abs(x-R.fx));el.h=Math.max(0.01,Math.abs(y-R.fy));return;
  }
  const sx=R.w0>1e-6?Math.abs(x-R.fx)/R.w0:1, sy=R.h0>1e-6?Math.abs(y-R.fy)/R.h0:1;
  const s=Math.max(0.05,Math.max(sx,sy));   // uniform scale keeps aspect
  if(el.type==='draw'){el.pts=R.pts0.map(p=>({x:R.fx+(p.x-R.fx)*s,y:R.fy+(p.y-R.fy)*s}));return;}
  const nw=Math.max(0.02,R.w0*s),nh=Math.max(0.02,R.h0*s);
  const pos=anPlaceFromFixed(R.handle,R.fx,R.fy,nw,nh);
  el.x=pos.x;el.y=pos.y;
  if(el.type==='image'){el.w=nw;el.h=nh;}
  else if(el.type==='text'){el.size=Math.min(400,Math.max(6,R.size0*s));}
}

// ── Pointer interaction ──
function anXY(e){const r=annOverlay.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
function anHit(nx,ny){
  const cw=annOverlay.width,ch=annOverlay.height,ctx=annOverlay.getContext('2d'),pxPerPt=cw/(anS.pageWpt||cw);
  const arr=anCurArr();
  for(let i=arr.length-1;i>=0;i--){const b=anBBox(arr[i],cw,ch,ctx,pxPerPt);if(b&&nx*cw>=b.x-4&&nx*cw<=b.x+b.w+4&&ny*ch>=b.y-4&&ny*ch<=b.y+b.h+4)return arr[i];}
  return null;
}

annOverlay.addEventListener('pointerdown',e=>{
  if(anS.tool==='text'){const {x,y}=anXY(e);const el={id:anUID(),type:'text',x,y,text:'',size:+document.getElementById('annTextSize').value,color:document.getElementById('annColor').value,font:anFont()};anCurArr().push(el);anSel=el;anShowTextEdit(el,true);return;}
  if(anS.tool==='edittext'){
    const {x,y}=anXY(e);
    const it=anHitTextItem(x,y);
    if(!it){toast('這裡沒有偵測到可改的文字（掃描 PDF 無文字層）',true);return;}
    const fill=anSampleBg(it.cx-0.006,it.cy+it.ch*0.5);   // sample just left of the run
    const inkColor=anSampleTextColor(it);                  // match original text colour
    const cover={id:anUID(),type:'cover',x:it.cx,y:it.cy,w:it.cw,h:it.ch,fill};
    const txt={id:anUID(),type:'text',x:it.nx,y:it.ny,text:it.str,orig:it.str,coverId:cover.id,size:Math.max(6,it.size),color:inkColor,font:it.font||anFont(),bold:!!it.bold,italic:!!it.italic};
    anCurArr().push(cover);anCurArr().push(txt);
    anSel=txt;anSyncControls(txt);anShowTextEdit(txt,true);
    return;
  }
  const {x,y}=anXY(e);
  if(anS.tool==='select'){
    // grab a resize handle on the currently-selected element first
    const hz=anHandleHit(x,y);
    if(anSel&&hz){
      const c=anCorners(anSel),fixed={nw:c.se,ne:c.sw,sw:c.ne,se:c.nw}[hz];
      anResize={el:anSel,handle:hz,fx:fixed.x,fy:fixed.y,w0:c.box.w,h0:c.box.h,size0:anSel.size,pts0:anSel.pts?anSel.pts.map(p=>({x:p.x,y:p.y})):null};
      annOverlay.setPointerCapture(e.pointerId);return;
    }
    const hit=anHit(x,y);anSel=hit;
    if(hit){anDrag={sx:x,sy:y};annOverlay.setPointerCapture(e.pointerId);anSyncControls(hit);}
    anRedraw();
    if(hit&&hit.type==='text'&&e.detail>=2)anShowTextEdit(hit,false);
    return;
  }
  if(anS.tool==='draw'){anDraft={id:anUID(),type:'draw',color:document.getElementById('annColor').value,width:+document.getElementById('annStroke').value,pts:[{x,y}]};annOverlay.setPointerCapture(e.pointerId);return;}
  if(anS.tool==='rect'){anDraft={id:anUID(),type:'rect',x,y,w:0,h:0,_ox:x,_oy:y,color:document.getElementById('annColor').value,width:+document.getElementById('annStroke').value};annOverlay.setPointerCapture(e.pointerId);return;}
});
annOverlay.addEventListener('pointermove',e=>{
  const {x,y}=anXY(e);
  if(anResize){anApplyResize(anResize,x,y);anRedraw();return;}
  if(anDrag&&anSel){const dx=x-anDrag.sx,dy=y-anDrag.sy;anMoveEl(anSel,dx,dy);anDrag.sx=x;anDrag.sy=y;anRedraw();return;}
  if(anDraft&&anS.tool==='draw'){anDraft.pts.push({x,y});anRedraw();return;}
  if(anDraft&&anS.tool==='rect'){anDraft.x=Math.min(x,anDraft._ox);anDraft.y=Math.min(y,anDraft._oy);anDraft.w=Math.abs(x-anDraft._ox);anDraft.h=Math.abs(y-anDraft._oy);anRedraw();return;}
});
function anEndPointer(e){
  if(anResize){anResize=null;anStats();return;}
  if(anDrag){anDrag=null;return;}
  if(anDraft){
    if(anS.tool==='rect'&&(anDraft.w<0.005||anDraft.h<0.005)){anDraft=null;anRedraw();return;}
    if(anS.tool==='draw'&&anDraft.pts.length<2){/* keep dot */}
    delete anDraft._ox;delete anDraft._oy;
    anCurArr().push(anDraft);anSel=null;anDraft=null;anRedraw();anStats();
  }
}
annOverlay.addEventListener('pointerup',anEndPointer);
annOverlay.addEventListener('pointercancel',anEndPointer);

function anMoveEl(el,dx,dy){
  if(el.type==='draw'){el.pts.forEach(p=>{p.x+=dx;p.y+=dy;});}
  else{el.x+=dx;el.y+=dy;}
}

// ── Inline text editor ──
let annTextEl=null,annTextIsNew=false,annCommitToSelect=false;
function anShowTextEdit(el,isNew){
  anHideTextEdit();annTextEl=el;annTextIsNew=isNew;
  const ta=document.createElement('textarea');ta.className='ann-textedit';ta.id='annTextEdit';
  const cw=annOverlay.width,pxPerPt=cw/(anS.pageWpt||cw),px=el.size*pxPerPt;
  ta.style.left=(el.x*annOverlay.width)+'px';ta.style.top=(el.y*annOverlay.height)+'px';
  ta.style.fontSize=px+'px';ta.style.color=el.color;ta.style.fontFamily=el.font||AN_FONT_DEFAULT;ta.style.fontWeight=el.bold?'700':'400';ta.style.fontStyle=el.italic?'italic':'normal';ta.style.minWidth='40px';ta.style.minHeight=(px*1.3)+'px';
  ta.value=el.text||'';ta.rows=1;
  ta.oninput=()=>{el.text=ta.value;};
  ta.onblur=()=>anCommitText();
  ta.onkeydown=ev=>{if(ev.key==='Escape'){ev.preventDefault();annCommitToSelect=true;ta.blur();}else if(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();annCommitToSelect=true;ta.blur();}};
  annHost.appendChild(ta);anSyncControls(el);setTimeout(()=>{ta.focus();ta.select();},0);
}
// Remove an element; if it's a 改字 replacement text, remove its white-out cover too
function anRemoveEl(el){
  if(!el)return;const arr=anCurArr();
  const k=arr.indexOf(el);if(k>=0)arr.splice(k,1);
  if(el.coverId){const ci=arr.findIndex(x=>x.id===el.coverId);if(ci>=0)arr.splice(ci,1);}
}
// Finalise the open text editor: save typed content, drop empty / unchanged-改字 (reverting cover).
// Returns the surviving element, or null. Used by both commit and any code that closes the editor.
function anFinalizeText(){
  const ta=document.getElementById('annTextEdit');
  if(!annTextEl){if(ta)ta.remove();return null;}
  const el=annTextEl;annTextEl=null;
  if(ta){el.text=ta.value;ta.remove();}
  // 改字 with no actual change → revert (drop new text + its white-out, keep original)
  if(el.orig!=null && el.text.trim()===el.orig.trim()){anRemoveEl(el);return null;}
  // Empty text → drop it (a 改字 cover stays behind = pure white-out / erase)
  if(!el.text||!el.text.trim()){const arr=anCurArr();const k=arr.indexOf(el);if(k>=0)arr.splice(k,1);return null;}
  return el;
}
function anCommitText(){
  const toSelect=annCommitToSelect;annCommitToSelect=false;
  const el=anFinalizeText();
  if(!el){anSel=null;anRedraw();anStats();return;}
  // Keep it selected so the sidebar (colour/font/size) edits it live.
  // 改字 edits and explicit finish (Esc/Ctrl+Enter) also switch to the Select tool.
  anSel=el;anSyncControls(el);
  if(toSelect||el.orig!=null){
    setTimeout(()=>{
      anS.tool='select';
      document.querySelectorAll('#panel-pdfann .ann-tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='select'));
      annOverlay.className='tool-select';
      anSel=el;anSyncControls(el);anRedraw();
    },0);
  }
  anRedraw();anStats();
}
// Closing the editor without an explicit commit (switching tool / page / clearing) still finalises cleanly
function anHideTextEdit(){if(annTextEl||document.getElementById('annTextEdit')){anFinalizeText();anRedraw();anStats();}}

function anUndo(){const arr=anCurArr();if(arr.length){anRemoveEl(arr[arr.length-1]);anSel=null;anRedraw();anStats();}}
function anDeleteSel(){if(!anSel)return;anRemoveEl(anSel);anSel=null;anRedraw();anStats();}

document.addEventListener('keydown',e=>{
  if(document.getElementById('panel-pdfann')&&document.getElementById('panel-pdfann').classList.contains('active')&&!document.getElementById('app-wrap').classList.contains('hidden')){
    const tag=document.activeElement?.tagName;
    if((e.key==='Delete'||e.key==='Backspace')&&anSel&&tag!=='TEXTAREA'&&tag!=='INPUT'){e.preventDefault();anDeleteSel();}
  }
});

function anStats(){
  const all=anPages.reduce((s,a)=>s+(a?a.length:0),0);
  document.getElementById('anns1').textContent=anS.pc||0;
  document.getElementById('anns2').textContent=anCurArr().length;
  document.getElementById('anns3').textContent=all;
}

function anClearAll(){
  anHideTextEdit();
  if(anS.doc&&anS.doc.destroy)try{anS.doc.destroy();}catch(e){}
  anS.file=null;anS.doc=null;anS.pc=0;anS.cur=0;anPages=[];anImgs={};anSel=null;anDraft=null;anDrag=null;anResize=null;anTextItems=[];
  document.getElementById('annInfo').style.display='none';
  document.getElementById('annStage').style.display='none';
  document.getElementById('annDZ').style.display='block';
  document.getElementById('annExport').disabled=true;
  document.getElementById('annClr').disabled=true;
  ['anns1','anns2','anns3'].forEach(id=>document.getElementById(id).textContent='0');
  const pw=document.getElementById('annPW');if(pw)pw.style.display='none';
}
document.getElementById('annClr').onclick=()=>{if(confirm('確定清除所有標註與檔案？'))anClearAll();};

document.getElementById('annExport').onclick=async()=>{
  if(anS.conv||!anS.file)return;
  anHideTextEdit();
  const total=anPages.reduce((s,a)=>s+(a?a.length:0),0);
  if(!total){toast('尚未加入任何標註',true);return;}
  anS.conv=true;document.getElementById('annExport').disabled=true;
  const pw=document.getElementById('annPW');pw.style.display='block';
  const setProg=(p,t)=>{document.getElementById('annPF').style.width=p+'%';document.getElementById('annPP').textContent=Math.round(p)+'%';if(t)document.getElementById('annPT').textContent=t;};
  setProg(0,'載入函式庫…');
  const ok=await ensurePdfLib();
  if(!ok){toast('PDF 函式庫載入失敗，請重新整理後再試',true);anS.conv=false;document.getElementById('annExport').disabled=false;pw.style.display='none';return;}
  try{
    const {PDFDocument}=PDFLib;
    const ab=await anS.file.arrayBuffer();
    const doc=await PDFDocument.load(ab);
    const pages=doc.getPages();
    const idxs=anPages.map((a,i)=>(a&&a.length)?i:-1).filter(i=>i>=0);
    for(let n=0;n<idxs.length;n++){
      const i=idxs[n];const page=pages[i];if(!page)continue;
      const {width:pw2,height:ph2}=page.getSize();
      const pageRot=(((page.getRotation().angle||0)%360)+360)%360;
      const swap=(pageRot===90||pageRot===270);
      const vw=swap?ph2:pw2, vh=swap?pw2:ph2;                  // visible dims (points)
      const S=Math.min(2.5,3000/Math.max(vw,vh));
      const lw=Math.max(1,Math.round(vw*S)),lh=Math.max(1,Math.round(vh*S));
      const layer=document.createElement('canvas');layer.width=lw;layer.height=lh;
      anRenderLayer(layer.getContext('2d'),lw,lh,S,anPages[i],anImgs);   // pxPerPt=S (px per point)
      // Compose into storage orientation if the page is rotated
      let embedCv=layer;
      if(pageRot){
        const stor=document.createElement('canvas');stor.width=Math.max(1,Math.round(pw2*S));stor.height=Math.max(1,Math.round(ph2*S));
        const sc=stor.getContext('2d');sc.translate(stor.width/2,stor.height/2);sc.rotate(-pageRot*Math.PI/180);sc.drawImage(layer,-lw/2,-lh/2);
        embedCv=stor;
      }
      const png=Uint8Array.from(atob(embedCv.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));
      const emb=await doc.embedPng(png);
      page.drawImage(emb,{x:0,y:0,width:pw2,height:ph2});
      setProg((n+1)/idxs.length*100,'處理頁面…');
    }
    const bytes=await doc.save();
    const base=anS.file.name.replace(/\.pdf$/i,'');
    dlBlob(new Blob([bytes],{type:'application/pdf'}),`${base}_annotated.pdf`);
    toast(`已輸出（${idxs.length} 頁含標註）`);
    if(typeof showChain==='function')showChain('pdfann');
  }catch(e){toast('輸出失敗：'+(e.message||e),true);}
  finally{anS.conv=false;document.getElementById('annExport').disabled=false;setTimeout(()=>{pw.style.display='none';},600);}
};
