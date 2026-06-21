/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * crawler.js
 */

/* ══════════════════════════════════════
   PROGRESS INDICATORS
   ══════════════════════════════════════ */
function setProgress(label, pct){
  setText('progLabel',label);
  setText('progPct',Math.round(pct)+'%');
  const f=$('progFill'); if(f) f.style.width=Math.round(pct)+'%';
}

function setStepState(stepId, state){
  const el=document.querySelector(`.prog-step[data-step="${stepId}"]`);
  if(!el) return;
  el.className='prog-step'+(state==='done'?' done':state==='active'?' active':'');
}

/* ══════════════════════════════════════
   CRAWL ENGINE
   ══════════════════════════════════════ */
async function crawl(){
  const urlEl=$('urlInput'); if(!urlEl) return;
  const raw=urlEl.value.trim();
  if(!raw||crawling) return;

  let root;
  const errEl=$('urlErr');
  try{
    const p=new URL(raw);
    if(!p.protocol.startsWith('http')) throw new Error('protocol');
    root=p.href;
    if(errEl) errEl.style.display='none';
  }catch(e){
    if(errEl) errEl.style.display='block';
    return;
  }

  crawling=true; pages=[];
  const btn=$('execBtn');
  if(btn){btn.disabled=true;btn.classList.add('loading');}
  const grid=$('grid'); if(grid) grid.innerHTML='';
  const pw=$('progWrap'); if(pw) pw.classList.add('show');
  updateStats();

  $$('.prog-step').forEach(s=>s.className='prog-step');

  setStepState('robots','active');
  const [robotsData, sitemapData] = await Promise.allSettled([
    fetchRobotsTxt(root),
    fetchSitemap(root)
  ]);
  setStepState('robots','done');
  setStepState('sitemap','done');

  window._lastRobots = robotsData.status==='fulfilled'?robotsData.value:{found:false};
  window._lastSitemap = sitemapData.status==='fulfilled'?sitemapData.value:{found:false};

  setStepState('crawl','active');
  const visited=new Set();
  const startUrl=normalizeUrl(root);
  const queue=[{url:startUrl,depth:0}];
  visited.add(startUrl);
  let done=0;
  while(queue.length&&done<maxP){
    const batch=queue.splice(0,2);
    setProgress('Crawling: '+batch[0].url.replace(/https?:\/\//,'').slice(0,50),(done/maxP)*100);
    await Promise.allSettled(batch.map(async ({url:pageUrl,depth:pageDepth})=>{
      if(done>=maxP) return;
      await new Promise(r=>setTimeout(r,500));
      let analysis, proxyResult=null;
      let statusInfo={status:0,label:'Proxy Err',cls:'soth'};
      try{
        proxyResult=await proxyFetch(pageUrl);
        statusInfo=resolveStatus(proxyResult, pageUrl);
        if(proxyResult&&proxyResult.html&&proxyResult.html.length>200){
          analysis=analyzePage(proxyResult.html, pageUrl);
          extractLinks(proxyResult.html, pageUrl).forEach(l=>{
            if(!visited.has(l)&&visited.size<maxP*4){ visited.add(l); queue.push({url:l,depth:pageDepth+1}); }
          });
        }
      }catch(e){
        statusInfo={status:0,label:'Proxy Err',cls:'soth'};
      }
      if(!analysis){
        analysis={title:'',desc:'',h1s:[],missingAlt:0,headingNodes:[],imgData:[],hasSchema:0,hasSemantic:0,hasLists:0,hasTables:0,score:0,aiScore:0,url:pageUrl,keywords:null,readability:null,internalLinks:[]};
      }
      const extended = _extendPageAnalysis(analysis, proxyResult&&proxyResult.html?proxyResult.html:'', pageUrl);
      const fullScores = AuditForge.scores.compute(extended);
      if (fullScores) extended.score = fullScores.overall;
      const soft404Result = detectSoft404({...extended, status: statusInfo.status});
      const redirectHops = (proxyResult&&proxyResult.redirectHops)||0;
      const pg={...extended,status:statusInfo.status,statusLabel:statusInfo.label,statusCls:statusInfo.cls,url:normalizeUrl(pageUrl),id:'pg'+Date.now()+Math.random(),soft404:soft404Result.isSoft404,soft404Zone:soft404Result.matchedIn,depth:pageDepth,redirectHops,pageType:detectPageType({...extended,url:normalizeUrl(pageUrl)})};
      pages.push(pg); done++;
      addRow(pg); updateStats();
    }));
  }

  setStepState('crawl','done');

  window._incomingLinks = {};
  pages.forEach(pg => {
    if (!window._incomingLinks[pg.url]) window._incomingLinks[pg.url] = [];
  });
  pages.forEach(pg => {
    (pg.internalLinks || []).filter(l => l.isInternal).forEach(link => {
      const norm = normalizeUrl(link.href);
      if (window._incomingLinks[norm] !== undefined) {
        if (!window._incomingLinks[norm].includes(pg.url)) {
          window._incomingLinks[norm].push(pg.url);
        }
      }
    });
  });

  if (window._lastRobots && window._lastRobots.found && window._lastRobots.content) {
    const _parsedRobots = AuditForge.robots.parse(window._lastRobots.content);
    pages.forEach(pg => {
      pg.robotsBlocked = !AuditForge.robots.isUrlAllowed(_parsedRobots, pg.url);
    });
  }

  window._canonicalIssues = {};
  const crawledUrlSet = new Set(pages.map(p => p.url));
  pages.forEach(pg => {
    if (!pg.canonical || !pg.url) return;
    const normCan = normalizeUrl(pg.canonical);
    const normPg  = pg.url;
    if (normCan === normPg) return;

    if (!crawledUrlSet.has(normCan)) {
      window._canonicalIssues[pg.url] = {type:'uncrawled', target: pg.canonical};
      return;
    }

    const targetPg = pages.find(p => p.url === normCan);
    if (targetPg && targetPg.canonical) {
      const normTargetCan = normalizeUrl(targetPg.canonical);
      if (normTargetCan !== normCan) {
        if (normTargetCan === normPg) {
          window._canonicalIssues[pg.url] = {type:'loop', target: pg.canonical, loopBack: normTargetCan};
        } else {
          window._canonicalIssues[pg.url] = {type:'chain', target: pg.canonical, finalTarget: normTargetCan};
        }
      }
    }
  });

  window._nearDuplicates = {};
  const livePagesForDup = pages.filter(p => p.status === 200 && p.keywords && p.keywords.top10 && p.keywords.top10.length >= 5);
  for (let i = 0; i < livePagesForDup.length; i++) {
    for (let j = i + 1; j < livePagesForDup.length; j++) {
      const a = livePagesForDup[i];
      const b = livePagesForDup[j];
      const setA = new Set(a.keywords.top10.slice(0,10).map(k=>k.word));
      const setB = new Set(b.keywords.top10.slice(0,10).map(k=>k.word));
      const intersection = [...setA].filter(w => setB.has(w)).length;
      const overlap = intersection / Math.min(setA.size, setB.size);
      if (overlap >= 0.70) {
        if (!window._nearDuplicates[a.url]) window._nearDuplicates[a.url] = [];
        if (!window._nearDuplicates[b.url]) window._nearDuplicates[b.url] = [];
        window._nearDuplicates[a.url].push({url: b.url, overlap: Math.round(overlap*100)});
        window._nearDuplicates[b.url].push({url: a.url, overlap: Math.round(overlap*100)});
      }
    }
  }

  setProgress('Audit complete — '+pages.length+' pages analyzed',100);
  if(btn){btn.disabled=false;btn.classList.remove('loading');}
  crawling=false;

  const badge=$('pageBadge');
  if(badge){badge.textContent=pages.length;badge.style.display='inline';}

  if(pages.length>0) saveToHistory(root, pages);

  showToast('✓ Audit complete — '+pages.length+' page'+(pages.length!==1?'s':'')+' crawled');
}

$('execBtn') && $('execBtn').addEventListener('click',crawl);
$('urlInput') && $('urlInput').addEventListener('input',()=>{
  const e=$('urlErr'); if(e) e.style.display='none';
});

/* ══════════════════════════════════════
   GRID ROW
   ══════════════════════════════════════ */
function addRow(pg){
  const grid=$('grid'); if(!grid) return;
  const row=document.createElement('div');
  row.className='grid-row';
  const path=pg.url.replace(/https?:\/\/[^/]+/,'')||'/';
  const sc=pg.statusCls||(pg.status===200?'s200':pg.status===404?'s404':'soth');
  const st=pg.statusLabel||(pg.status===200?'200 OK':pg.status?pg.status+' Err':'Proxy Err');
  const qc=pg.score>=75?'qhi':pg.score>=50?'qmi':'qlo';
  const isProxyIssue=pg.status===0||(pg.statusCls==='soth'&&pg.status!==301&&pg.status!==302);

  const ucell=document.createElement('div');
  ucell.className='ucell';
  ucell.title=String(pg.url||'');
  ucell.textContent=path||'/';

  const scell=document.createElement('div');
  scell.className='scell '+sc;
  scell.textContent=st;
  if(isProxyIssue){
    scell.appendChild(document.createTextNode(' '));
    const warn=document.createElement('span');
    warn.title='Proxy issue — page may actually be live. Use Paste mode to verify.';
    warn.style.cursor='help';
    warn.style.opacity='.7';
    warn.textContent='⚠';
    scell.appendChild(warn);
  }

  const qcell=document.createElement('div');
  qcell.className='qcell '+qc;
  qcell.textContent=pg.score>0?pg.score+'/100':'—';

  const acell=document.createElement('div');
  acell.className='acell';
  const btn=document.createElement('button');
  btn.className='drill';
  btn.textContent='Inspect';
  btn.addEventListener('click',()=>openInspector(pg.id));
  acell.appendChild(btn);

  row.appendChild(ucell);
  row.appendChild(scell);
  row.appendChild(qcell);
  row.appendChild(acell);
  grid.appendChild(row);
}

/* ══════════════════════════════════════
   STATS
   ══════════════════════════════════════ */
function updateStats(){
  const t=pages.length;
  const e404=pages.filter(p=>p.status===404).length;
  const alt=pages.reduce((s,p)=>s+(p.missingAlt||0),0);
  const titles=pages.map(p=>p.title).filter(Boolean);
  const dup=titles.length-new Set(titles).size;
  const noh1=pages.filter(p=>p.h1s&&!p.h1s.length&&p.status===200).length;
  const sc=pages.filter(p=>p.status===200).map(p=>p.score);
  const avg=sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):null;
  setText('stTotal',t); setText('st404',e404); setText('stAlt',alt);
  setText('stDup',dup); setText('stNoH1',noh1); setText('stAvg',avg!==null?avg:'—');

  window._dupTitleMap = {};
  window._dupH1Map = {};
  pages.forEach(pg => {
    if (pg.title) {
      if (!window._dupTitleMap[pg.title]) window._dupTitleMap[pg.title] = [];
      window._dupTitleMap[pg.title].push(pg.url);
    }
    (pg.h1s || []).forEach(h1 => {
      const key = h1.trim();
      if (key) {
        if (!window._dupH1Map[key]) window._dupH1Map[key] = [];
        window._dupH1Map[key].push(pg.url);
      }
    });
  });
}
