/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * app-init.js
 */

/* ══════════════════════════════════════
   MOBILE SIDEBAR
   ══════════════════════════════════════ */
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebarOverlay');
  const btn=document.getElementById('menuToggle');
  const isOpen=sb.classList.toggle('open');
  ov.classList.toggle('open',isOpen);
  btn.textContent=isOpen?'✕':'☰';
}
function closeSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebarOverlay');
  const btn=document.getElementById('menuToggle');
  sb.classList.remove('open');
  ov.classList.remove('open');
  btn.textContent='☰';
}

document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',()=>{ if(window.innerWidth<=768) closeSidebar(); });
});

/* ══════════════════════════════════════
   MODE TOGGLE
   ══════════════════════════════════════ */
function setMode(m){
  const isCrawl=m==='crawl';
  $('crawlMode').style.display=isCrawl?'':'none';
  $('pasteMode').style.display=isCrawl?'none':'';
  $('modeCrawl').classList.toggle('active',isCrawl);
  $('modePaste').classList.toggle('active',!isCrawl);
}

/* ══════════════════════════════════════
   PASTE AUDIT
   ══════════════════════════════════════ */
function sanitizePastedHTML(input){
  const raw=(input||'').toString();
  if(!raw.trim()) return '';
  const safeDoc=document.implementation.createHTMLDocument('');
  safeDoc.body.innerHTML=raw;

  safeDoc.querySelectorAll('script,iframe,object,embed,applet,meta[http-equiv],link[rel="import"]').forEach(n=>n.remove());

  safeDoc.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(attr=>{
      const name=attr.name.toLowerCase();
      const value=(attr.value||'').trim();
      if(name.startsWith('on')){
        el.removeAttribute(attr.name);
        return;
      }
      if((name==='href'||name==='src'||name==='xlink:href'||name==='formaction') && /^javascript:/i.test(value)){
        el.removeAttribute(attr.name);
      }
    });
  });

  return safeDoc.body.innerHTML;
}

function runPasteAudit(){
  const html=($('pasteHtml')||{}).value?.trim()||'';
  const errEl=$('pasteErr');
  if(!html){ if(errEl) errEl.style.display='block'; return; }
  if(errEl) errEl.style.display='none';
  const safeHtml=sanitizePastedHTML(html);
  const url=($('pasteUrl')||{}).value?.trim()||'https://pasted-page.local';
  _processPastedHTML(safeHtml,url);
}

function runPasteAudit2(){
  const html=($('pasteHtml2')||{}).value?.trim()||'';
  const errEl=$('pasteErr2');
  if(!html){ if(errEl) errEl.style.display='block'; return; }
  if(errEl) errEl.style.display='none';
  const safeHtml=sanitizePastedHTML(html);
  const url=($('pasteUrl2')||{}).value?.trim()||'https://pasted-page.local';
  _processPastedHTML(safeHtml,url);
}

function clearPaste(){
  const h=$('pasteHtml'); if(h) h.value='';
  const u=$('pasteUrl'); if(u) u.value='';
  const e=$('pasteErr'); if(e) e.style.display='none';
}

function _processPastedHTML(html,url){
  const analysis=analyzePage(html,url);
  const extended=_extendPageAnalysis(analysis,html,url);
  extended.pageType=detectPageType({...extended,url});
  const fullScores=AuditForge.scores.compute(extended);
  if(fullScores) extended.score=fullScores.overall;
  const pg={...extended,status:200,statusLabel:'200 OK (pasted)',statusCls:'s200',url,id:'paste'+Date.now(),isPasted:true};
  const existing=pages.findIndex(p=>p.url===url&&p.isPasted);
  if(existing>=0) pages[existing]=pg; else pages.push(pg);
  updateStats();
  const grid=$('grid'); if(!grid) return;
  const ge=$('gridEmpty'); if(ge) ge.style.display='none';
  addRow(pg);
  const badge=$('pageBadge');
  if(badge){badge.textContent=pages.length;badge.style.display='inline';}
  saveToHistory(url,[pg]);
  openInspector(pg.id);
  showToast('Pasted HTML analyzed — '+pages.length+' page'+(pages.length>1?'s':'')+' total');
}

/* ══════════════════════════════════════
   TOAST
   ══════════════════════════════════════ */
function showToast(msg){
  let t=$('toast');
  if(!t){
    t=document.createElement('div');
    t.id='toast';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.opacity='1';
  clearTimeout(t._hide);
  t._hide=setTimeout(()=>t.style.opacity='0',2800);
}

/* ══════════════════════════════════════
   SECTION TOGGLE
   ══════════════════════════════════════ */
function toggleSection(btn){
  btn.classList.toggle('open');
  const body=btn.nextElementSibling;
  if(body) body.classList.toggle('open');
}

/* ══════════════════════════════════════
   INIT
   ══════════════════════════════════════ */
$('navPaste') && $('navPaste').addEventListener('click',()=>showPanel('paste'));
buildSchemaFields();
syncSerp();

/* ══════════════════════════════════════
   INIT: call AuditForge._updateRobotsGen
   on generator input changes if present
   ══════════════════════════════════════ */
document.addEventListener('input', function(e) {
  if (['rgenAgent','rgenDisallow','rgenSitemap','rgenDelay'].includes(e.target.id)) {
    AuditForge._updateRobotsGen();
  }
});

/* ══════════════════════════════════════
   RE-INIT: ensure schema select still
   works after DOM additions
   ══════════════════════════════════════ */
if (typeof initSchemaSelect === 'function') {
  initSchemaSelect();
}
if (typeof buildSchemaFields === 'function') {
  buildSchemaFields();
}
if (typeof syncSerp === 'function') {
  syncSerp();
}
