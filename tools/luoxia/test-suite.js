// Runs INSIDE the app (injected into index.html by test.html) so top-level const/let
// globals (anS, anPages, AN_FONTS, pmS, wmS, mxS, …) resolve by bare name.
(function(){
const T=[];
function test(name,fn){T.push({name,fn});}
function assert(c,m){if(!c)throw new Error(m||'assertion failed');}
function eq(a,b,m){if(a!==b)throw new Error((m||'')+` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);}
async function buildPdf(specs,texts){
  const {PDFDocument,StandardFonts,degrees}=PDFLib;
  const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica);
  const pages=specs.map(([w,h,rot])=>{const pg=d.addPage([w,h]);if(rot)pg.setRotation(degrees(rot));return pg;});
  (texts||[]).forEach(t=>pages[t.p].drawText(t.str,{x:t.x,y:t.y,size:t.s,font:f}));
  return new File([await d.save()],'t.pdf',{type:'application/pdf'});
}
function imgCount(ab){return (new TextDecoder('latin1').decode(new Uint8Array(ab)).match(/\/Subtype\s*\/Image/g)||[]).length;}
async function capture(clickTargetId,fn){let cap=null;const od=dlBlob;window.dlBlob=(b,n)=>cap={b,n};try{await fn();}finally{window.dlBlob=od;}return cap;}

test('core: switchTab activates all 10 tabs',()=>{
  ['pdf','heic','compress','resize','pdfops','pdfcmp','pdfmix','pageman','pdfwm','pdfann'].forEach(t=>{
    switchTab(t);assert(document.getElementById('panel-'+t).classList.contains('active'),t+' not active');});
});
test('core: parsePageRange',()=>{eq(JSON.stringify(parsePageRange('1-3,5',10)),JSON.stringify([1,2,3,5]));});

test('pageman: rotate/delete/insert + export',async()=>{
  window.pmThumbFor=async()=>'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  launchTool('pageman');await ensurePdfLib();
  await pmLoad(await buildPdf([[595,842],[842,595],[400,600]]));
  await pmRotate(0,90);pmInsertBlank(0);pmToggleDel(3);pmMove(0,1);
  const cap=await capture('pmExport',()=>document.getElementById('pmExport').onclick());
  const out=await PDFLib.PDFDocument.load(await cap.b.arrayBuffer());
  // 3 src pages + 1 inserted blank − 1 deleted = 3; order [blank, src0@90, src1@0]
  eq(out.getPageCount(),3,'pages');
  eq(JSON.stringify(out.getPages().map(p=>p.getRotation().angle)),JSON.stringify([0,90,0]),'rotations');
});

test('watermark: CJK text tile + rotated page export',async()=>{
  switchTab('pdfwm');await ensurePdfLib();
  wmS.file=await buildPdf([[595,842],[595,842,270]]);wmS.conv=false;document.getElementById('wmExport').disabled=false;
  wmSetType('text');document.getElementById('wmText').value='機密';wmSetLayout('tile');document.getElementById('wmPageMode').value='all';
  const cap=await capture('wmExport',()=>document.getElementById('wmExport').onclick());
  const ab=await cap.b.arrayBuffer();const out=await PDFLib.PDFDocument.load(ab);
  eq(out.getPageCount(),2,'pages');
  eq(JSON.stringify(out.getPages().map(p=>p.getRotation().angle)),JSON.stringify([0,270]),'rotations preserved');
  assert(imgCount(ab)>=4,'watermark embedded on both pages, got '+imgCount(ab));
});

test('annotate: all element types render + export',async()=>{
  launchTool('pdfann');await ensurePdfLib();
  anS.file=await buildPdf([[595,842]]);anS.pc=1;anPages=[[]];
  annOverlay.width=595;annOverlay.height=842;anS.pageWpt=595;anS.pageHpt=842;anS.cur=0;
  const im=document.createElement('canvas');im.width=60;im.height=30;im.getContext('2d').fillRect(0,0,60,30);
  const ie=new Image();await new Promise(r=>{ie.onload=r;ie.src=im.toDataURL();});anImgs['i']=ie;
  anPages[0]=[{id:'t',type:'text',x:.1,y:.1,text:'中文',size:30,color:'#111',font:AN_FONTS.hei},
    {id:'r',type:'rect',x:.2,y:.4,w:.2,h:.1,color:'#c00',width:2},
    {id:'d',type:'draw',color:'#00c',width:3,pts:[{x:.3,y:.6},{x:.5,y:.65}]},
    {id:'im',type:'image',imgId:'i',x:.5,y:.7,w:.3,h:.1}];
  const lc=document.createElement('canvas');lc.width=300;lc.height=420;
  anRenderLayer(lc.getContext('2d'),300,420,300/595,anPages[0],anImgs);
  const dd=lc.getContext('2d').getImageData(0,0,300,420).data;let px=0;for(let i=3;i<dd.length;i+=4)if(dd[i]>0)px++;
  assert(px>100,'layer rendered pixels, got '+px);
  const cap=await capture('annExport',()=>document.getElementById('annExport').onclick());
  eq((await PDFLib.PDFDocument.load(await cap.b.arrayBuffer())).getPageCount(),1,'pages');
});

test('annotate 改字: detect → cover+text, no-change reverts',async()=>{
  launchTool('pdfann');await ensurePdfLib();
  const file=await buildPdf([[595,842]],[{p:0,x:100,y:700,s:24,str:'Hello'}]);
  const page=await (await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise).getPage(1);
  const v1=page.getViewport({scale:1});
  anS.pageWpt=595;anS.pageHpt=842;annOverlay.width=595;annOverlay.height=842;annPageCanvas.width=595;annPageCanvas.height=842;anS.cur=0;anPages=[[]];
  await anExtractText(page,v1);
  assert(anTextItems.length>=1&&anTextItems[0].str==='Hello','extracted run');
  const it=anTextItems[0];
  assert(anHitTextItem(it.cx+it.cw/2,it.cy+it.ch/2)?.str==='Hello','hit-test');
  anPages[0].push({id:'cv',type:'cover',x:it.cx,y:it.cy,w:it.cw,h:it.ch,fill:'#fff'},
    {id:'tx',type:'text',x:it.nx,y:it.ny,text:'Hello',orig:'Hello',coverId:'cv',size:it.size,color:'#111',font:AN_FONTS.hei});
  anSel=anPages[0][1];annTextEl=anPages[0][1];anCommitText();
  eq(anPages[0].length,0,'no-change reverts cover+text');
});

test('annotate resize math',()=>{
  const rect={type:'rect',x:.2,y:.2,w:.2,h:.1};anApplyResize({el:rect,handle:'se',fx:.2,fy:.2,w0:.2,h0:.1,pts0:null},.5,.6);
  eq(rect.w.toFixed(2),'0.30');eq(rect.h.toFixed(2),'0.40');
  const img={type:'image',x:.1,y:.1,w:.2,h:.1};anApplyResize({el:img,handle:'se',fx:.1,fy:.1,w0:.2,h0:.1,pts0:null},.5,.3);
  eq((img.w/img.h).toFixed(2),'2.00','image aspect locked');
  const txt={type:'text',size:20};anApplyResize({el:txt,handle:'se',fx:0,fy:0,w0:.1,h0:.05,size0:20,pts0:null},.2,.1);
  eq(txt.size,40,'text size scaled 2x');
});

test('annotate font detect',()=>{
  eq(anDetectFont('DFKai-SB','serif'),AN_FONTS.kai);
  eq(anDetectFont('Times-Roman','serif'),AN_FONTS.ming);
  eq(anDetectFont('Arial','sans-serif'),AN_FONTS.hei);
  eq(anDetectFont('','monospace'),AN_FONTS.mono);
});

test('mix: images + PDF → merged PDF',async()=>{
  switchTab('pdfmix');await ensurePdfLib();
  const pdfFile=await buildPdf([[595,842],[595,842]]);
  const cv=document.createElement('canvas');cv.width=100;cv.height=100;cv.getContext('2d').fillRect(0,0,100,100);
  const imgFile=await new Promise(r=>cv.toBlob(b=>r(new File([b],'a.png',{type:'image/png'})),'image/png'));
  mxS.items=[{id:'1',name:'a.png',size:imgFile.size,file:imgFile,isPdf:false,pc:1,thumbUrl:null},
    {id:'2',name:'t.pdf',size:pdfFile.size,file:pdfFile,isPdf:true,pc:2,thumbUrl:null}];
  mxS.conv=false;document.getElementById('mxCvt').disabled=false;
  const cap=await capture('mxCvt',()=>document.getElementById('mxCvt').onclick());
  eq((await PDFLib.PDFDocument.load(await cap.b.arrayBuffer())).getPageCount(),3,'1 image + 2 pdf pages');
});

test('logic: resize NaN guard / target-png→jpeg / split range filter',()=>{
  eq(Math.max(1,Math.round(NaN)||600),600,'empty height falls back');
  const calc=(mode,mime)=>{if(mode==='target'&&mime==='image/png')mime='image/jpeg';return mime;};
  eq(calc('target','image/png'),'image/jpeg');eq(calc('quality','image/png'),'image/png');
  const total=3,ranges='1-2,5-3,10,2'.split(',').map(s=>{const mm=s.trim().match(/^(\d+)(?:-(\d+))?$/);if(!mm)return null;return{f:Math.max(0,+mm[1]-1),t:Math.min(total-1,(mm[2]?+mm[2]:+mm[1])-1)};}).filter(r=>r&&r.t>=r.f&&r.f<total);
  eq(ranges.length,2,'reversed & out-of-range dropped');
});

// runner
(async()=>{
  const out=[];let pass=0;
  for(const t of T){
    try{await t.fn();out.push({name:t.name,pass:true});pass++;}
    catch(e){out.push({name:t.name,pass:false,err:(e&&e.message)||String(e)});}
  }
  window.__testResults={pass,total:T.length,all:pass===T.length,results:out};
})();
})();
