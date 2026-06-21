/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * history.js
 */

/* ══════════════════════════════════════
   AUDIT HISTORY (localStorage)
   ══════════════════════════════════════ */
const HISTORY_KEY='auditforge_history';

function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]'); }
  catch(e){ return []; }
}
function saveHistory(data){
  try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(data.slice(0,50))); }
  catch(e){}
}

function saveToHistory(url, pagesData){
  const history=loadHistory();
  const crawledPages=pagesData.filter(p=>p.status===200);
  const avgSEO=crawledPages.length?Math.round(crawledPages.reduce((s,p)=>s+p.score,0)/crawledPages.length):0;
  const avgAI=crawledPages.length?Math.round(crawledPages.reduce((s,p)=>s+p.aiScore,0)/crawledPages.length):0;
  const entry={
    id:'hist'+Date.now(),
    url, date:new Date().toISOString(),
    scores:{seo:avgSEO, ai:avgAI},
    pageCount:pagesData.length,
    findings:{
      missing404:pagesData.filter(p=>p.status===404).length,
      missingAlt:pagesData.reduce((s,p)=>s+(p.missingAlt||0),0),
      noH1:pagesData.filter(p=>p.h1s&&!p.h1s.length&&p.status===200).length,
      noDesc:pagesData.filter(p=>!p.desc&&p.status===200).length
    },
    pages: pagesData.map(p=>({id:p.id,url:p.url,score:p.score,aiScore:p.aiScore,status:p.status,title:p.title}))
  };
  // Remove old entry with same URL
  const deduped=history.filter(h=>h.url!==url);
  deduped.unshift(entry);
  saveHistory(deduped);
}

function renderHistory(){
  const wrap=$('historyList'); if(!wrap) return;
  const history=loadHistory();
  if(!history.length){
    wrap.innerHTML='<div class="history-empty">No audit history yet.<br>Run an audit and results will appear here.</div>';
    return;
  }
  wrap.innerHTML=history.map(h=>{
    const d=new Date(h.date);
    const dateStr=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const domain=h.url.replace(/https?:\/\//,'').replace(/\/.*/,'');
    return`<div class="history-item" onclick="reopenHistoryAudit('${h.id}')">
      <div>
        <div class="hi-url" title="${h.url}">${domain}</div>
        <div class="hi-date">${dateStr} · ${h.pageCount} page${h.pageCount!==1?'s':''}</div>
      </div>
      <div class="hi-scores">
        <span class="hi-score seo">SEO: ${h.scores.seo}</span>
        <span class="hi-score ai">AI: ${h.scores.ai}</span>
      </div>
      <button class="hi-del" onclick="deleteHistory('${h.id}',event)">✕</button>
    </div>`;
  }).join('');
}

function deleteHistory(id, event){
  event.stopPropagation();
  const history=loadHistory().filter(h=>h.id!==id);
  saveHistory(history);
  renderHistory();
  // Update compare selects too
  populateCompareSelects();
}

function reopenHistoryAudit(id){
  const history=loadHistory();
  const entry=history.find(h=>h.id===id);
  if(!entry||!entry.pages) return;
  // Restore pages state
  pages=entry.pages.map(p=>({
    ...p,
    h1s:p.h1s||[], missingAlt:p.missingAlt||0, headingNodes:p.headingNodes||[],
    imgData:[], internalLinks:[], keywords:null, readability:null,
    hasSchema:0, hasSemantic:0, hasLists:0, hasTables:0,
    statusLabel:p.status===200?'200 OK':p.status?p.status+' Err':'Proxy Err',
    statusCls:p.status===200?'s200':p.status===404?'s404':'soth',
    id:p.id||('hist'+Math.random())
  }));
  // Rebuild grid
  const grid=$('grid'); if(grid) grid.innerHTML='';
  const ge=$('gridEmpty'); if(ge) ge.style.display='none';
  pages.forEach(p=>addRow(p));
  updateStats();
  const badge=$('pageBadge');
  if(badge){badge.textContent=pages.length;badge.style.display='inline';}
  showPanel('crawler');
  showToast('Loaded audit: '+entry.url);
}

function clearAllHistory(){
  if(!confirm('Clear all audit history?')) return;
  saveHistory([]);
  renderHistory();
  showToast('History cleared.');
}
