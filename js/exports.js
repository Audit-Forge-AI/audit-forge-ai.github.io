/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * exports.js
 */

function exportReport(){
  if(!pages.length){
    const e=$('urlErr');
    if(e){e.textContent='⛔ No crawl data yet — run an audit first.';e.style.display='block';}
    return;
  }
  const date=new Date().toLocaleString();
  const t=pages.length;
  const e404=pages.filter(p=>p.status===404).length;
  const alt=pages.reduce((s,p)=>s+(p.missingAlt||0),0);
  const titles=pages.map(p=>p.title).filter(Boolean);
  const dup=titles.length-new Set(titles).size;
  const sc=pages.filter(p=>p.status===200).map(p=>p.score);
  const avg=sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):0;
  const rows=pages.map(p=>`<tr>
    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.url}</td>
    <td style="text-align:center;color:${p.status===200?'#10B981':'#EF4444'}">${p.status||'—'}</td>
    <td style="text-align:center;color:${p.score>=75?'#10B981':p.score>=50?'#F59E0B':'#EF4444'}">${p.score}/100</td>
    <td>${p.title||'<em style="color:#64748b">missing</em>'}</td>
    <td style="text-align:center">${p.missingAlt||0}</td>
  </tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AuditForge Report</title>
  <style>body{font-family:system-ui;background:#080C0F;color:#E2E8F0;padding:28px}h1{color:#10B981;font-size:26px;margin-bottom:4px}.sub{color:#64748B;font-size:12px;font-family:monospace;margin-bottom:20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px}.card{background:#0D1117;border:1px solid #1E2D3D;border-radius:8px;padding:14px}.cl{font-size:10px;font-weight:700;color:#4A5568;text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px;font-family:monospace}.cv{font-size:24px;font-weight:800;font-family:monospace}.g{color:#10B981}.r{color:#EF4444}.a{color:#F59E0B}table{width:100%;border-collapse:collapse;font-size:12px;font-family:monospace}th{background:#0D1117;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:9px 11px;text-align:left;border-bottom:1px solid #1E2D3D}td{padding:9px 11px;border-bottom:1px solid #1E2D3D}</style></head>
  <body><h1>AuditForge AI Pro — SEO Report</h1><div class="sub">Generated: ${date}</div>
  <div class="cards">
    <div class="card"><div class="cl">Total</div><div class="cv g">${t}</div></div>
    <div class="card"><div class="cl">404s</div><div class="cv r">${e404}</div></div>
    <div class="card"><div class="cl">Missing Alt</div><div class="cv a">${alt}</div></div>
    <div class="card"><div class="cl">Dup Titles</div><div class="cv a">${dup}</div></div>
    <div class="card"><div class="cl">Avg Score</div><div class="cv g">${avg}/100</div></div>
  </div>
  <table><thead><tr><th>URL</th><th>Status</th><th>Score</th><th>Title</th><th>Alt Missing</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  a.download='auditforge-report-'+Date.now()+'.html';
  a.click();
}

function exportJSON(){
  if(!pages.length){ showToast('⚠ No data to export.'); return; }
  const data={
    generated:new Date().toISOString(),
    summary:{pages:pages.length,avg404:pages.filter(p=>p.status===404).length},
    pages:pages.map(p=>({url:p.url,status:p.status,score:p.score,aiScore:p.aiScore,title:p.title,desc:p.desc,h1s:p.h1s,missingAlt:p.missingAlt}))
  };
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download='auditforge-report-'+Date.now()+'.json';
  a.click();
}

function exportMarkdown(){
  if(!pages.length){ showToast('⚠ No data to export.'); return; }
  const date=new Date().toLocaleString();
  const sc=pages.filter(p=>p.status===200).map(p=>p.score);
  const avg=sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):0;
  let md=`# AuditForge AI Pro — SEO Report\n\n_Generated: ${date}_\n\n`;
  md+=`## Summary\n\n| Metric | Value |\n|--------|-------|\n`;
  md+=`| Total Pages | ${pages.length} |\n`;
  md+=`| 404 Errors | ${pages.filter(p=>p.status===404).length} |\n`;
  md+=`| Missing Alt | ${pages.reduce((s,p)=>s+(p.missingAlt||0),0)} |\n`;
  md+=`| Avg Score | ${avg}/100 |\n\n`;
  md+=`## Pages\n\n| URL | Status | Score | Title |\n|-----|--------|-------|-------|\n`;
  pages.forEach(p=>{
    md+=`| ${p.url} | ${p.status||'—'} | ${p.score}/100 | ${p.title||'(missing)'} |\n`;
  });
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([md],{type:'text/markdown'}));
  a.download='auditforge-report-'+Date.now()+'.md';
  a.click();
}
