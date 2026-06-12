/* ════════════════════════════════════════════════
   AuditForge AI Pro — services.js
   All audit logic, crawling, analysis, history,
   comparison, keywords, readability, images, links,
   robots/sitemap, prioritization, AI suggestions
   ════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════
   SAFE HELPERS
   ══════════════════════════════════════ */
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
function setText(id, v){ const n=$(id); if(n) n.textContent=v; }
function setHTML(id, v){ const n=$(id); if(n) n.innerHTML=v; }

/* ══════════════════════════════════════
   CLOCK + PING
   ══════════════════════════════════════ */
(function tick(){
  const n=new Date();
  setText('clock', n.toLocaleTimeString('en-US',{hour12:false}));
  setTimeout(tick, 1000);
})();
setInterval(()=>setText('pingVal',(Math.floor(Math.random()*28)+6)+'ms'), 3000);

/* ══════════════════════════════════════
   STATE
   ══════════════════════════════════════ */
let pages = [], maxP = 10, crawling = false, curPage = null;

/* ══════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════ */
function showPanel(id){
  $$('.panel').forEach(p=>p.classList.remove('active'));
  $$('.nav-item').forEach(n=>n.classList.remove('active'));
  const pan=$('panel-'+id); if(pan) pan.classList.add('active');
  const nav=document.querySelector(`.nav-item[data-panel="${id}"]`);
  if(nav) nav.classList.add('active');
}

$$('.nav-item[data-panel]').forEach(n=>n.addEventListener('click',()=>showPanel(n.dataset.panel)));
$('backBtn') && $('backBtn').addEventListener('click',()=>showPanel('crawler'));

$('navExport') && $('navExport').addEventListener('click', exportReport);
$('exportBtn') && $('exportBtn').addEventListener('click', exportReport);

$('navInspector') && $('navInspector').addEventListener('click',()=>{
  if(pages.length){ showPanel('inspector'); }
  else { showToast('⚠ Run an audit first — no pages to inspect yet.'); }
});

$('navHistory') && $('navHistory').addEventListener('click',()=>{
  renderHistory();
  showPanel('history');
});

$('navCompare') && $('navCompare').addEventListener('click',()=>{
  renderComparePanel();
  showPanel('compare');
});

// Depth selector
$$('.dbtn').forEach(b=>b.addEventListener('click',()=>{
  $$('.dbtn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  maxP=+b.dataset.v;
}));

// Module tabs
$$('.mtab').forEach(t=>t.addEventListener('click',()=>{
  $$('.mtab').forEach(x=>x.classList.remove('active'));
  $$('.mpane').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  const p=$('mod-'+t.dataset.mod); if(p) p.classList.add('active');
}));

/* ══════════════════════════════════════
   PROXY FETCH
   ══════════════════════════════════════ */
const PROXIES = [
  url => 'https://gentle-sunset-d772.kamayegabharat.workers.dev/?url=' + encodeURIComponent(url),
  url => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url)
];
let proxyIndex = 0;

async function proxyFetch(url, attempt=0){
  if(attempt >= PROXIES.length) throw new Error('All proxies failed for: '+url);
  let parsed;
  try{ parsed=new URL(url); }catch(e){ throw new Error('Malformed URL'); }
  if(!parsed.protocol.startsWith('http')) throw new Error('Only http/https supported');

  const proxyUrl = PROXIES[(proxyIndex+attempt)%PROXIES.length](url);
  try{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(), 12000);
    let r;
    try{ r=await fetch(proxyUrl,{signal:ctrl.signal}); }
    finally{ clearTimeout(timer); }
    if(!r.ok) throw new Error('HTTP '+r.status);
    const text=await r.text();
    try{
      const d=JSON.parse(text);
      if(d && typeof d.contents==='string'){
        if(!d.contents) throw new Error('Empty proxy response');
        return {html:d.contents, realStatus:d.status?.http_code||200};
      }
    }catch(e){}
    if(!text||text.length<50) throw new Error('Too short — likely blocked');
    return {html:text, realStatus:200};
  }catch(e){
    console.warn('Proxy '+(proxyIndex+attempt)+' failed:', e.message);
    return proxyFetch(url, attempt+1);
  }
}

async function checkProxy(){
  const pill=$('proxyPill'); if(!pill) return;
  try{
    const res=await proxyFetch('https://example.com');
    if(res && res.html && res.html.length>100){
      pill.className='proxy-pill ok';
      pill.innerHTML='<span class="proxy-dot"></span>proxy online';
    } else {
      pill.className='proxy-pill fail';
      pill.innerHTML='<span class="proxy-dot"></span>proxy weak — use Paste mode';
    }
  }catch(e){
    pill.className='proxy-pill fail';
    pill.innerHTML='<span class="proxy-dot"></span>proxy offline — use Paste mode';
  }
}
checkProxy();

function resolveStatus(proxyResult, pageUrl){
  if(!proxyResult) return {status:0, label:'Proxy Timeout', cls:'soth'};
  const {html, realStatus}=proxyResult;
  if(realStatus===0)   return {status:0,   label:'Unreachable',     cls:'soth'};
  if(realStatus===404) return {status:404,  label:'404 Not Found',   cls:'s404'};
  if(realStatus===403) return {status:403,  label:'403 Blocked',     cls:'soth'};
  if(realStatus===401) return {status:401,  label:'401 Auth',        cls:'soth'};
  if(realStatus>=500)  return {status:realStatus, label:realStatus+' Server Err', cls:'soth'};
  if(realStatus>=400)  return {status:realStatus, label:realStatus+' Error',      cls:'s404'};
  if(realStatus>=300)  return {status:realStatus, label:realStatus+' Redirect',   cls:'soth'};
  if(!html||html.length<150) return {status:0, label:'Proxy Blocked', cls:'soth'};
  return {status:200, label:'200 OK', cls:'s200'};
}

/* ══════════════════════════════════════
   LINK EXTRACTOR
   ══════════════════════════════════════ */
function extractLinks(html, base){
  const doc=new DOMParser().parseFromString(html,'text/html');
  let origin;
  try{ origin=new URL(base).origin; }catch(e){ return []; }
  const out=new Set();
  doc.querySelectorAll('a[href]').forEach(a=>{
    try{
      const abs=new URL(a.getAttribute('href'),base).href;
      if(abs.startsWith(origin)&&!/[#?]|mailto:|tel:|\.pdf|\.jpg|\.png|\.svg|\.zip/i.test(abs)){
        out.add(abs.replace(/\/$/,''));
      }
    }catch(e){}
  });
  return [...out];
}

/* ══════════════════════════════════════
   PARSE HTML (sandbox-safe)
   ══════════════════════════════════════ */
function parseHTML(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  let title=doc.querySelector('title')?.textContent?.trim()||'';
  if(!title){
    const tm=html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if(tm) title=tm[1].trim();
  }
  let desc=doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()||'';
  if(!desc){
    const dm=html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
             ||html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    if(dm) desc=dm[1].trim();
  }
  let canonical=doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim()||'';
  if(!canonical){
    const cm=html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
    if(cm) canonical=cm[1].trim();
  }
  let robots=doc.querySelector('meta[name="robots"]')?.getAttribute('content')?.trim()||'';
  if(!robots){
    const rm=html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
    if(rm) robots=rm[1].trim();
  }
  return {doc, title, desc, canonical, robots};
}

/* ══════════════════════════════════════
   FULL PAGE ANALYZER
   ══════════════════════════════════════ */
function analyzePage(html, url){
  const {doc, title, desc, canonical, robots}=parseHTML(html);

  const h1s=[...doc.querySelectorAll('h1')].map(h=>h.textContent.trim());
  const imgs=[...doc.querySelectorAll('img')];
  const imgData=imgs.map(img=>({
    src:img.getAttribute('src')||'',
    alt:img.getAttribute('alt'),
    loading:img.getAttribute('loading'),
    width:img.getAttribute('width'),
    height:img.getAttribute('height'),
    srcset:img.getAttribute('srcset')||''
  }));
  const missingAlt=imgs.filter(i=>!i.getAttribute('alt')&&!i.getAttribute('aria-label')).length;
  const headingNodes=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>({tag:h.tagName.toLowerCase(),text:h.textContent.trim()}));
  const hasSchema=doc.querySelectorAll('script[type="application/ld+json"]').length;
  const hasSemantic=doc.querySelectorAll('article,section,main,nav,aside,header,footer').length;
  const hasLists=doc.querySelectorAll('ul,ol').length;
  const hasTables=doc.querySelectorAll('table').length;
  const bodyText=(doc.body?.innerText||doc.body?.textContent||'').trim();
  const wordCount=bodyText.split(/\s+/).filter(Boolean).length;

  // Internal links
  let internalLinks=[];
  try{
    const origin=new URL(url).origin;
    internalLinks=[...doc.querySelectorAll('a[href]')].map(a=>{
      try{
        const href=new URL(a.getAttribute('href'),url).href;
        return {href, anchor:a.textContent.trim().slice(0,60), isInternal:href.startsWith(origin)};
      }catch(e){ return null; }
    }).filter(Boolean);
  }catch(e){}

  // Keyword analysis
  const keywords=analyzeKeywords(bodyText, title, h1s[0]||'', url);

  // Readability
  const readability=analyzeReadability(bodyText);

  // SEO score
  let score=100;
  if(!title)            score-=15;
  if(!desc)             score-=10;
  if(!h1s.length)       score-=15;
  if(h1s.length>1)      score-=10;
  if(missingAlt>0)      score-=Math.min(15,missingAlt*3);
  if(title.length>60)   score-=5;
  if(desc.length>160)   score-=5;
  if(robots&&/noindex/i.test(robots)) score-=10;
  score=Math.max(0,score);

  const aiScore=Math.min(100,
    (hasSemantic?20:0)+(hasTables?15:0)+(hasLists?15:0)+(hasSchema?25:0)+(headingNodes.length?15:0)+(desc?10:0)
  );

  return {
    title, desc, canonical, robots, h1s, missingAlt, headingNodes, imgData,
    hasSchema, hasSemantic, hasLists, hasTables, wordCount, bodyText,
    internalLinks, keywords, readability,
    score, aiScore, url
  };
}

/* ══════════════════════════════════════
   KEYWORD ANALYSIS
   ══════════════════════════════════════ */
function analyzeKeywords(bodyText, title, h1, url){
  const stopWords=new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','are','was','were','be','been','being','have','has',
    'had','do','does','did','will','would','could','should','may','might',
    'shall','can','this','that','these','those','it','its','i','we','you',
    'he','she','they','them','their','our','your','his','her','my','not',
    'as','if','so','up','out','about','into','than','then','there','also',
    'more','all','any','some','what','which','who','how','when','where'
  ]);

  const words=bodyText.toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w=>w.length>2 && !stopWords.has(w));

  const totalWords=words.length||1;
  const freq={};
  words.forEach(w=>{ freq[w]=(freq[w]||0)+1; });

  const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,15);
  const top10=sorted.slice(0,10).map(([word,count])=>({
    word, count, density:((count/totalWords)*100).toFixed(2)
  }));

  // Overlap checks
  const titleWords=new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stopWords.has(w)));
  const h1Words=new Set(h1.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stopWords.has(w)));
  let urlWords=new Set();
  try{ urlWords=new Set(new URL(url).pathname.toLowerCase().replace(/[-_/]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stopWords.has(w))); }catch(e){}

  const topKeywords=top10.slice(0,5).map(k=>k.word);
  const titleOverlap=topKeywords.filter(k=>titleWords.has(k));
  const h1Overlap=topKeywords.filter(k=>h1Words.has(k));
  const urlOverlap=topKeywords.filter(k=>urlWords.has(k));

  // Keyword stuffing check
  const stuffed=top10.filter(k=>parseFloat(k.density)>3);

  return {top10, titleOverlap, h1Overlap, urlOverlap, stuffed, totalWords};
}

/* ══════════════════════════════════════
   READABILITY ANALYSIS
   ══════════════════════════════════════ */
function analyzeReadability(text){
  if(!text||text.length<100) return null;
  // Split into sentences (basic)
  const sentences=text.split(/[.!?]+/).filter(s=>s.trim().length>5);
  const words=text.split(/\s+/).filter(Boolean);
  const paragraphs=text.split(/\n\n+/).filter(p=>p.trim().length>20);

  if(!sentences.length||!words.length) return null;

  const avgWordLength=words.reduce((s,w)=>s+w.length,0)/words.length;
  const avgSentenceLength=words.length/sentences.length;
  const avgParaLength=words.length/Math.max(1,paragraphs.length);

  // Syllable count (simplified)
  function countSyllables(word){
    word=word.toLowerCase().replace(/[^a-z]/g,'');
    if(!word.length) return 1;
    const vowels=word.match(/[aeiouy]+/g)||[];
    let count=vowels.length;
    if(word.endsWith('e')&&count>1) count--;
    return Math.max(1,count);
  }
  const totalSyllables=words.reduce((s,w)=>s+countSyllables(w),0);
  const avgSyllablesPerWord=totalSyllables/words.length;

  // Flesch Reading Ease
  const flesch=206.835 - (1.015*avgSentenceLength) - (84.6*avgSyllablesPerWord);
  const fleschClamped=Math.max(0,Math.min(100,Math.round(flesch)));

  // Flesch-Kincaid Grade Level
  const fkGrade=0.39*avgSentenceLength + 11.8*avgSyllablesPerWord - 15.59;
  const fkClamped=Math.max(1,Math.round(fkGrade*10)/10);

  function fleschLabel(score){
    if(score>=90) return 'Very Easy (5th grade)';
    if(score>=80) return 'Easy (6th grade)';
    if(score>=70) return 'Fairly Easy (7th grade)';
    if(score>=60) return 'Standard (8–9th grade)';
    if(score>=50) return 'Fairly Difficult (10–12th grade)';
    if(score>=30) return 'Difficult (College)';
    return 'Very Difficult (Professional)';
  }
  function fleschColor(score){
    if(score>=70) return 'var(--green)';
    if(score>=50) return 'var(--amber)';
    return 'var(--red)';
  }

  return {
    flesch:fleschClamped, fleschLabel:fleschLabel(fleschClamped), fleschColor:fleschColor(fleschClamped),
    fkGrade:fkClamped,
    avgSentenceLength:Math.round(avgSentenceLength),
    avgParaLength:Math.round(avgParaLength),
    totalWords:words.length, totalSentences:sentences.length
  };
}

/* ══════════════════════════════════════
   PROGRESS HELPER
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
   ROBOTS.TXT FETCH
   ══════════════════════════════════════ */
async function fetchRobotsTxt(rootUrl){
  try{
    const origin=new URL(rootUrl).origin;
    const res=await proxyFetch(origin+'/robots.txt');
    if(res&&res.html&&res.html.length>5){
      const text=res.html;
      const disallowAll=/Disallow:\s*\/\s*(\n|$)/m.test(text);
      const hasSitemap=/Sitemap:/i.test(text);
      return {found:true, content:text, disallowAll, hasSitemap};
    }
  }catch(e){}
  return {found:false, content:'', disallowAll:false, hasSitemap:false};
}

/* ══════════════════════════════════════
   SITEMAP.XML FETCH
   ══════════════════════════════════════ */
async function fetchSitemap(rootUrl){
  try{
    const origin=new URL(rootUrl).origin;
    const res=await proxyFetch(origin+'/sitemap.xml');
    if(res&&res.html&&res.html.length>20){
      const text=res.html;
      const urlCount=(text.match(/<url>/gi)||[]).length;
      const isValidXml=text.includes('<?xml')||text.includes('<urlset')||text.includes('<sitemapindex');
      return {found:true, content:text.slice(0,3000), urlCount, isValidXml};
    }
  }catch(e){}
  return {found:false, urlCount:0, isValidXml:false};
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

  // Update step indicators
  $$('.prog-step').forEach(s=>s.className='prog-step');

  // Fetch robots.txt and sitemap in parallel
  setStepState('robots','active');
  const [robotsData, sitemapData] = await Promise.allSettled([
    fetchRobotsTxt(root),
    fetchSitemap(root)
  ]);
  setStepState('robots','done');
  setStepState('sitemap','done');

  // Store for later display
  window._lastRobots = robotsData.status==='fulfilled'?robotsData.value:{found:false};
  window._lastSitemap = sitemapData.status==='fulfilled'?sitemapData.value:{found:false};

  setStepState('crawl','active');
  const visited=new Set();
  const queue=[root.replace(/\/$/,'')];
  visited.add(queue[0]);
  let done=0;

  while(queue.length&&done<maxP){
    const batch=queue.splice(0,2);
    setProgress('Crawling: '+batch[0].replace(/https?:\/\//,'').slice(0,50),(done/maxP)*100);
    await Promise.allSettled(batch.map(async pageUrl=>{
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
            if(!visited.has(l)&&visited.size<maxP*4){ visited.add(l); queue.push(l); }
          });
        }
      }catch(e){
        statusInfo={status:0,label:'Proxy Err',cls:'soth'};
      }
      if(!analysis){
        analysis={title:'',desc:'',h1s:[],missingAlt:0,headingNodes:[],imgData:[],hasSchema:0,hasSemantic:0,hasLists:0,hasTables:0,score:0,aiScore:0,url:pageUrl,keywords:null,readability:null,internalLinks:[]};
      }
      const pg={...analysis,status:statusInfo.status,statusLabel:statusInfo.label,statusCls:statusInfo.cls,url:pageUrl,id:'pg'+Date.now()+Math.random()};
      pages.push(pg); done++;
      addRow(pg); updateStats();
    }));
  }
  setStepState('crawl','done');

  setProgress('Audit complete — '+pages.length+' pages analyzed',100);
  if(btn){btn.disabled=false;btn.classList.remove('loading');}
  crawling=false;

  const badge=$('pageBadge');
  if(badge){badge.textContent=pages.length;badge.style.display='inline';}

  // Save to history
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
  const statusNote=isProxyIssue
    ?` <span title="Proxy issue — page may actually be live. Use Paste mode to verify." style="cursor:help;opacity:.7">⚠</span>`:'';
  row.innerHTML=`
    <div class="ucell" title="${pg.url}">${path||'/'}</div>
    <div class="scell ${sc}">${st}${statusNote}</div>
    <div class="qcell ${qc}">${pg.score>0?pg.score+'/100':'—'}</div>
    <div class="acell"><button class="drill" onclick="openInspector('${pg.id}')">Inspect</button></div>`;
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
}

/* ══════════════════════════════════════
   INSPECTOR
   ══════════════════════════════════════ */
function openInspector(id){
  const pg=pages.find(p=>p.id===id); if(!pg) return;
  curPage=pg;
  setText('ddUrl',pg.url);

  let metaExtra='';
  if(pg.canonical&&pg.canonical!==pg.url) metaExtra+=`<span style="margin-right:12px">🔗 canonical: <a href="${pg.canonical}" style="color:var(--blue);font-family:var(--mono);font-size:11px">${pg.canonical.slice(0,60)}</a></span>`;
  if(pg.robots) metaExtra+=`<span style="color:var(--amber);font-family:var(--mono);font-size:11px">🤖 robots: ${pg.robots}</span>`;
  if(pg.wordCount) metaExtra+=`<span style="color:var(--text3);font-family:var(--mono);font-size:11px;margin-left:12px">~${pg.wordCount} words</span>`;
  const extraEl=$('ddMeta');
  if(extraEl) extraEl.innerHTML=metaExtra;

  $$('.mtab').forEach(t=>t.classList.remove('active'));
  $$('.mpane').forEach(t=>t.classList.remove('active'));
  const mt=document.querySelector('.mtab[data-mod="meta"]');
  if(mt) mt.classList.add('active');
  const mp=$('mod-meta'); if(mp) mp.classList.add('active');

  loadMeta(pg);
  loadHeadings(pg);
  loadAI(pg);
  buildSchemaFields(pg);
  loadKeywords(pg);
  loadReadability(pg);
  loadImages(pg);
  loadLinks(pg);
  loadIssues(pg);
  loadSuggestions(pg);
  showPanel('inspector');
}

/* ══════════════════════════════════════
   MODULE 1 — META
   ══════════════════════════════════════ */
function loadMeta(pg){
  const mt=$('metaTitle'); if(mt) mt.value=pg.title||'';
  const md=$('metaDesc'); if(md) md.value=pg.desc||'';
  setText('serpSite',pg.url||'');
  syncSerp();
}
function syncSerp(){
  const t=$('metaTitle')?.value||'';
  const d=$('metaDesc')?.value||'';
  const tl=t.length, dl=d.length;
  const tpx=Math.round(tl*9.2), dpx=Math.round(dl*6.8);
  const tc=tl<30?'bad':tl<=60?'ok':tl<=70?'warn':'bad';
  const dc=dl<70?'warn':dl<=160?'ok':'bad';
  setText('titleCC',tl+' ch');
  const tcc=$('titleCC'); if(tcc) tcc.className='cc '+tc;
  const tb=$('titleBar'); if(tb) tb.className='pxbar '+tc;
  setText('titlePx',tpx+' / 600');
  setText('descCC',dl+' ch');
  const dcc=$('descCC'); if(dcc) dcc.className='cc '+dc;
  const db=$('descBar'); if(db) db.className='pxbar '+dc;
  setText('descPx',dpx+' / 920');
  setText('serpTitle',t||'Page Title');
  setText('serpDesc',d||(dl===0?'No meta description set.':''));
}
function serpMode(m){
  const p=$('serpPreview'); if(!p) return;
  p.className='serp-preview'+(m==='mobile'?' mobile':'');
  $$('.stbtn').forEach(b=>b.classList.toggle('active',b.textContent.toLowerCase()===m));
}

/* ══════════════════════════════════════
   MODULE 2 — HEADINGS
   ══════════════════════════════════════ */
function loadHeadings(pg){
  const tree=$('headingTree'); if(!tree) return;
  const vwrap=$('hViolations'); if(!vwrap) return;
  const violations=[];
  if(!pg.headingNodes||!pg.headingNodes.length){
    tree.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px">No heading elements found on this page.</div>';
    if(pg.status===200) violations.push('No heading elements detected on this page.');
  } else {
    const h1count=pg.headingNodes.filter(h=>h.tag==='h1').length;
    let prevLevel=0, html='';
    pg.headingNodes.forEach((h,i)=>{
      const lv=parseInt(h.tag[1]);
      const isDupH1=h.tag==='h1'&&pg.headingNodes.slice(0,i).some(p=>p.tag==='h1');
      const isSkip=lv>prevLevel+1&&prevLevel>0;
      const errTxt=isDupH1?'⚠ dup H1':isSkip?`⚠ skip H${prevLevel+1}`:'';
      html+=`<div class="hnode ind${lv}">
        <span class="htag ${h.tag}">${h.tag.toUpperCase()}</span>
        <span class="htext">${(h.text||'(empty)').slice(0,90)}</span>
        ${errTxt?`<span class="herr">${errTxt}</span>`:''}
      </div>`;
      prevLevel=lv;
    });
    tree.innerHTML=html;
    if(!h1count) violations.push('Missing H1 — every page must have exactly one H1.');
    if(h1count>1) violations.push(`Duplicate H1 — found ${h1count} H1 tags. Only 1 allowed.`);
    let pv=0;
    pg.headingNodes.forEach(h=>{
      const l=parseInt(h.tag[1]);
      if(l>pv+1&&pv>0) violations.push(`Level skip: H${pv} → H${l} (missing H${pv+1}).`);
      pv=l;
    });
  }
  if(violations.length){
    vwrap.innerHTML=`<div class="violations">${violations.map(v=>`<div class="vitem">⛔ ${v}</div>`).join('')}</div>`;
  } else {
    vwrap.innerHTML=`<div class="ok-banner">✓ Heading hierarchy is valid — no SEO violations detected.</div>`;
  }
}

/* ══════════════════════════════════════
   MODULE 3 — SCHEMA
   ══════════════════════════════════════ */
const SCHEMAS={
  Organization:{
    fields:['Organization Name','Website URL','Logo URL','Phone','Description','Street','City','Country'],
    build(v){return{"@context":"https://schema.org","@type":"Organization","name":v[0]||"","url":v[1]||"","logo":v[2]||"","telephone":v[3]||"","description":v[4]||"","address":{"@type":"PostalAddress","streetAddress":v[5]||"","addressLocality":v[6]||"","addressCountry":v[7]||""}};}
  },
  Article:{
    fields:['Headline','Author Name','Date Published','Date Modified','URL','Publisher'],
    build(v){return{"@context":"https://schema.org","@type":"Article","headline":v[0]||"","author":{"@type":"Person","name":v[1]||""},"datePublished":v[2]||"","dateModified":v[3]||"","url":v[4]||"","publisher":{"@type":"Organization","name":v[5]||""}};}
  },
  FAQPage:{
    fields:['Question 1','Answer 1','Question 2','Answer 2','Question 3','Answer 3'],
    build(v){const me=[];for(let i=0;i<v.length;i+=2)if(v[i])me.push({"@type":"Question","name":v[i],"acceptedAnswer":{"@type":"Answer","text":v[i+1]||""}});return{"@context":"https://schema.org","@type":"FAQPage","mainEntity":me};}
  }
};
function buildSchemaFields(pg){
  const sel=$('schemaType'); if(!sel) return;
  const cfg=SCHEMAS[sel.value];
  const wrap=$('schemaFields'); if(!wrap) return;
  wrap.innerHTML=cfg.fields.map((f,i)=>`
    <div class="sfield">
      <label>${f}</label>
      <input placeholder="${f}" data-i="${i}" oninput="buildSchema()">
    </div>`).join('');
  const source=pg||curPage;
  if(source){
    const ins=$$('#schemaFields input');
    if(ins[0]&&source.title) ins[0].value=source.title;
    if(ins[1]&&source.url) ins[1].value=source.url;
    if(ins[2]&&source.canonical) ins[2].value=source.canonical;
  }
  buildSchema();
}
function buildSchema(){
  const sel=$('schemaType'); if(!sel) return;
  const cfg=SCHEMAS[sel.value];
  const vals=$$('#schemaFields input').map(i=>i.value);
  const out=$('schemaCode'); if(!out) return;
  out.textContent=`<script type="application/ld+json">\n${JSON.stringify(cfg.build(vals),null,2)}\n<\/script>`;
}
function copySchema(){
  const out=$('schemaCode'); if(!out) return;
  navigator.clipboard.writeText(out.textContent).then(()=>{
    const b=document.querySelector('.copy-btn'); if(!b) return;
    b.textContent='Copied!'; b.style.color='var(--green)';
    setTimeout(()=>{b.textContent='Copy';b.style.color='';},2000);
  }).catch(()=>{});
}

/* ══════════════════════════════════════
   MODULE 4 — AI RADAR
   ══════════════════════════════════════ */
function loadAI(pg){
  const sc=pg.aiScore||0;
  const arc=$('radarArc');
  if(arc){
    arc.style.stroke=sc>=70?'var(--green)':sc>=40?'var(--amber)':'var(--red)';
    setTimeout(()=>arc.style.strokeDashoffset=264-(sc/100)*264,80);
  }
  const num=$('aiNum');
  if(num){num.textContent=sc;num.style.color=sc>=70?'var(--green)':sc>=40?'var(--amber)':'var(--red)';}
  const metrics=[
    {l:'Semantic HTML Landmarks', v:pg.hasSemantic?Math.min(100,pg.hasSemantic*20):15},
    {l:'Structured Data / JSON-LD', v:pg.hasSchema?90:10},
    {l:'Heading Hierarchy', v:pg.headingNodes?.length?70:20},
    {l:'Lists & Tables', v:Math.min(100,(pg.hasLists||0)*20+(pg.hasTables||0)*15)},
    {l:'Meta Description', v:pg.desc?80:5},
  ];
  const wrap=$('aiMetrics'); if(!wrap) return;
  wrap.innerHTML=metrics.map(m=>{
    const cls=m.v>=70?'hi':m.v>=40?'mi':'lo';
    const col=m.v>=70?'var(--green)':m.v>=40?'var(--amber)':'var(--red)';
    return`<div class="ametric">
      <div class="ametric-hd"><span>${m.l}</span><span style="color:${col};font-weight:700">${m.v}%</span></div>
      <div class="abar"><div class="afill ${cls}" style="width:0" data-t="${m.v}%"></div></div>
    </div>`;
  }).join('');
  setTimeout(()=>$$('.afill').forEach(f=>f.style.width=f.dataset.t),80);
}

/* ══════════════════════════════════════
   MODULE 5 — KEYWORDS
   ══════════════════════════════════════ */
function loadKeywords(pg){
  const wrap=$('mod-keywords'); if(!wrap) return;
  if(!pg.keywords){
    wrap.innerHTML='<div class="grid-empty">No keyword data available — page body may be empty.</div>';
    return;
  }
  const k=pg.keywords;
  const maxCount=k.top10[0]?.count||1;

  const tableRows=k.top10.map(kw=>{
    const barW=Math.round((kw.count/maxCount)*100);
    const color=parseFloat(kw.density)>3?'var(--red)':parseFloat(kw.density)>1.5?'var(--amber)':'var(--green)';
    return`<div class="kw-row">
      <div class="kw-word">${kw.word}</div>
      <div class="kw-count">${kw.count}</div>
      <div class="kw-density" style="color:${color}">${kw.density}%</div>
    </div>`;
  }).join('');

  const overlapRows=[
    {label:'Title Tag', words:k.titleOverlap, total:k.top10.slice(0,5).map(x=>x.word)},
    {label:'H1 Tag',    words:k.h1Overlap,    total:k.top10.slice(0,5).map(x=>x.word)},
    {label:'URL Slug',  words:k.urlOverlap,   total:k.top10.slice(0,5).map(x=>x.word)},
  ].map(row=>{
    const has=row.words.length>0;
    return`<div class="kw-overlap-row">
      <span class="kw-ol-label">${row.label}</span>
      <span class="kw-ol-val">${has?row.words.join(', '):'No overlap with top keywords'}</span>
      <span class="kw-ol-badge ${has?'match':'miss'}">${has?'✓ Match':'✗ Missing'}</span>
    </div>`;
  }).join('');

  let stuffedWarning='';
  if(k.stuffed.length){
    stuffedWarning=`<div class="kw-warning">⚠ Possible keyword stuffing detected: <strong>${k.stuffed.map(s=>s.word+' ('+s.density+'%)').join(', ')}</strong> — density above 3% may trigger spam filters.</div>`;
  }

  wrap.innerHTML=`
    <div class="kw-grid">
      <div>
        <div class="sec-title">Top 10 Keywords</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div class="kw-table">
            <div class="kw-row header">
              <div class="kw-word">Keyword</div>
              <div class="kw-count">Count</div>
              <div class="kw-density">Density</div>
            </div>
            ${tableRows}
          </div>
        </div>
        ${stuffedWarning}
      </div>
      <div>
        <div class="sec-title">Keyword Overlap Analysis</div>
        <div class="kw-overlap">${overlapRows}</div>
        <div style="margin-top:12px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:11px;color:var(--text3)">
          Total words: <span style="color:var(--text)">${k.totalWords.toLocaleString()}</span><br>
          Unique keywords: <span style="color:var(--text)">${k.top10.length}+ indexed</span>
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════
   MODULE 6 — READABILITY
   ══════════════════════════════════════ */
function loadReadability(pg){
  const wrap=$('mod-readability'); if(!wrap) return;
  if(!pg.readability){
    wrap.innerHTML='<div class="grid-empty">Insufficient text content to analyze readability.</div>';
    return;
  }
  const r=pg.readability;
  wrap.innerHTML=`
    <div class="read-scores">
      <div class="read-card">
        <div class="read-label">Flesch Ease</div>
        <div class="read-val" style="color:${r.fleschColor}">${r.flesch}</div>
        <div class="read-interp">${r.fleschLabel}</div>
      </div>
      <div class="read-card">
        <div class="read-label">FK Grade Level</div>
        <div class="read-val" style="color:${r.fkGrade<=8?'var(--green)':r.fkGrade<=12?'var(--amber)':'var(--red)'}">${r.fkGrade}</div>
        <div class="read-interp">Grade ${Math.round(r.fkGrade)} reading level</div>
      </div>
    </div>
    <div class="read-details">
      <div class="read-detail-card">
        <div class="rdl">Avg Sentence Length</div>
        <div class="rdv" style="color:${r.avgSentenceLength<=20?'var(--green)':r.avgSentenceLength<=30?'var(--amber)':'var(--red)'}">${r.avgSentenceLength} <span style="font-size:12px;color:var(--text3)">words</span></div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:3px">${r.avgSentenceLength<=20?'✓ Good length':r.avgSentenceLength<=30?'⚠ Slightly long':'✗ Too long — split sentences'}</div>
      </div>
      <div class="read-detail-card">
        <div class="rdl">Avg Paragraph Length</div>
        <div class="rdv" style="color:${r.avgParaLength<=80?'var(--green)':r.avgParaLength<=120?'var(--amber)':'var(--red)'}">${r.avgParaLength} <span style="font-size:12px;color:var(--text3)">words</span></div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:3px">${r.avgParaLength<=80?'✓ Digestible':'⚠ Consider shorter paragraphs'}</div>
      </div>
      <div class="read-detail-card">
        <div class="rdl">Total Words</div>
        <div class="rdv" style="color:${r.totalWords>=300?'var(--green)':'var(--amber)'}">${r.totalWords.toLocaleString()}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:3px">${r.totalWords>=1000?'✓ Good depth':r.totalWords>=300?'⚠ Consider more content':'✗ Very thin content'}</div>
      </div>
      <div class="read-detail-card">
        <div class="rdl">Total Sentences</div>
        <div class="rdv">${r.totalSentences}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:3px">across body text</div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════
   MODULE 7 — IMAGES
   ══════════════════════════════════════ */
function loadImages(pg){
  const wrap=$('mod-images'); if(!wrap) return;
  const imgs=pg.imgData||[];
  if(!imgs.length){
    wrap.innerHTML='<div class="grid-empty">No images found on this page.</div>';
    return;
  }

  const noAlt=imgs.filter(i=>i.alt===null||i.alt===undefined).length;
  const noLazy=imgs.filter(i=>!i.loading||i.loading!=='lazy').length;
  const noSize=imgs.filter(i=>!i.width||!i.height).length;
  const clsRisk=imgs.filter(i=>(!i.width||!i.height)&&!i.srcset).length;

  const rows=imgs.slice(0,20).map(img=>{
    const src=(img.src||'').slice(0,60)+'...';
    const altOk=img.alt!==null&&img.alt!==undefined;
    const lazyOk=img.loading==='lazy';
    const sizeOk=img.width&&img.height;
    return`<div class="img-row">
      <div style="font-size:18px;text-align:center">${altOk?'🖼':'🖼'}</div>
      <div class="img-src" title="${img.src}">${(img.src||'(no src)').split('/').pop().slice(0,40)||'(no src)'}</div>
      <div><span class="img-badge ${altOk?'ok':'bad'}">${altOk?'ALT ✓':'NO ALT'}</span></div>
      <div><span class="img-badge ${lazyOk?'ok':'warn'}">${lazyOk?'LAZY':'NO LAZY'}</span></div>
      <div><span class="img-badge ${sizeOk?'ok':'warn'}">${sizeOk?'SIZE ✓':'NO SIZE'}</span></div>
      <div><span class="img-badge ${clsRisk&&!sizeOk?'bad':'ok'}">${(!img.width||!img.height)&&!img.srcset?'CLS ⚠':'CLS OK'}</span></div>
    </div>`;
  }).join('');

  wrap.innerHTML=`
    <div class="img-stats">
      <div class="img-stat"><div class="img-stat-v" style="color:${noAlt>0?'var(--red)':'var(--green)'}">${noAlt}</div><div class="img-stat-l">Missing Alt</div></div>
      <div class="img-stat"><div class="img-stat-v" style="color:${noLazy>3?'var(--amber)':'var(--green)'}">${noLazy}</div><div class="img-stat-l">No Lazy Load</div></div>
      <div class="img-stat"><div class="img-stat-v" style="color:${noSize>0?'var(--amber)':'var(--green)'}">${noSize}</div><div class="img-stat-l">No Width/Height</div></div>
      <div class="img-stat"><div class="img-stat-v" style="color:${clsRisk>0?'var(--amber)':'var(--green)'}">${clsRisk}</div><div class="img-stat-l">CLS Risk</div></div>
      <div class="img-stat"><div class="img-stat-v">${imgs.length}</div><div class="img-stat-l">Total Images</div></div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="img-table">
        <div class="img-row header">
          <div></div>
          <div>Filename</div>
          <div>Alt</div>
          <div>Lazy</div>
          <div>Size</div>
          <div>CLS</div>
        </div>
        ${rows}
        ${imgs.length>20?`<div style="padding:8px 12px;font-family:var(--mono);font-size:10px;color:var(--text3)">…and ${imgs.length-20} more images</div>`:''}
      </div>
    </div>`;
}

/* ══════════════════════════════════════
   MODULE 8 — LINKS
   ══════════════════════════════════════ */
function loadLinks(pg){
  const wrap=$('mod-links'); if(!wrap) return;
  const links=(pg.internalLinks||[]).filter(l=>l.isInternal);
  const allLinks=pg.internalLinks||[];
  const external=allLinks.filter(l=>!l.isInternal);

  if(!allLinks.length){
    wrap.innerHTML='<div class="grid-empty">No links found on this page.</div>';
    return;
  }

  // Duplicate detection
  const hrefCount={};
  links.forEach(l=>{ hrefCount[l.href]=(hrefCount[l.href]||0)+1; });
  const duplicates=Object.entries(hrefCount).filter(([,c])=>c>1).length;

  // Anchor text diversity
  const anchors=links.map(l=>l.anchor.toLowerCase()).filter(Boolean);
  const uniqueAnchors=new Set(anchors).size;
  const diversity=anchors.length?Math.round((uniqueAnchors/anchors.length)*100):0;

  const rows=links.slice(0,25).map(l=>{
    const isDup=hrefCount[l.href]>1;
    return`<div class="link-row">
      <div class="link-url" title="${l.href}">${l.href.replace(/https?:\/\//,'').slice(0,60)}</div>
      <div class="link-anchor" title="${l.anchor}">${l.anchor||'(no text)'}</div>
      <div style="font-size:10px;font-family:var(--mono)">${isDup?'<span style="color:var(--amber)">DUP</span>':'<span style="color:var(--green)">OK</span>'}</div>
    </div>`;
  }).join('');

  wrap.innerHTML=`
    <div class="link-stats">
      <div class="link-stat"><div class="link-stat-v" style="color:var(--green)">${links.length}</div><div class="link-stat-l">Internal Links</div></div>
      <div class="link-stat"><div class="link-stat-v">${external.length}</div><div class="link-stat-l">External Links</div></div>
      <div class="link-stat"><div class="link-stat-v" style="color:${duplicates>0?'var(--amber)':'var(--green)'}">${duplicates}</div><div class="link-stat-l">Duplicate Links</div></div>
      <div class="link-stat">
        <div class="link-stat-v" style="color:${diversity>=60?'var(--green)':diversity>=30?'var(--amber)':'var(--red)'}">${diversity}%</div>
        <div class="link-stat-l">Anchor Diversity</div>
      </div>
    </div>
    <div style="margin-bottom:6px">
      <div class="sec-title" style="margin-bottom:4px">Anchor Text Diversity</div>
      <div class="diversity-bar"><div class="diversity-fill" style="width:${diversity}%;background:${diversity>=60?'var(--green)':diversity>=30?'var(--amber)':'var(--red)'}"></div></div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:4px">${uniqueAnchors} unique anchor texts out of ${anchors.length} internal links</div>
    </div>
    <div class="link-table">
      <div class="link-row header">
        <div>URL</div>
        <div>Anchor Text</div>
        <div>Status</div>
      </div>
      ${rows}
      ${links.length>25?`<div style="padding:8px 12px;font-family:var(--mono);font-size:10px;color:var(--text3)">…showing 25 of ${links.length} internal links</div>`:''}
    </div>`;
}

/* ══════════════════════════════════════
   MODULE 9 — ROBOTS + SITEMAP
   (shown on robots/sitemap inspector tab)
   ══════════════════════════════════════ */
function loadRobotsSitemap(pg){
  const wrap=$('mod-robotssitemap'); if(!wrap) return;
  const robots=window._lastRobots||{found:false};
  const sitemap=window._lastSitemap||{found:false};

  const robotsChecks=[
    {ok:robots.found, text:'robots.txt present', rec:robots.found?null:'Create a robots.txt file at your domain root.'},
    {ok:!robots.disallowAll, text:'No blanket Disallow: /', rec:robots.disallowAll?'⚠ Your site is blocking ALL crawlers — check if intentional.':null},
    {ok:robots.hasSitemap, text:'Sitemap declared in robots.txt', rec:robots.hasSitemap?null:'Add "Sitemap: https://yoursite.com/sitemap.xml" to robots.txt'},
  ];
  const sitemapChecks=[
    {ok:sitemap.found, text:'sitemap.xml found', rec:sitemap.found?null:'Create a sitemap.xml for better crawlability.'},
    {ok:sitemap.isValidXml, text:'Valid XML structure', rec:sitemap.isValidXml?null:'Validate your sitemap at https://www.xml-sitemaps.com/validate-xml-sitemap.html'},
  ];

  wrap.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="robots-card">
        <div class="robots-status">
          <div class="robots-icon">${robots.found?'🤖':'⛔'}</div>
          <div>
            <div style="font-weight:700;font-size:13px">${robots.found?'robots.txt Found':'robots.txt Missing'}</div>
            <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${robots.found?'Crawl rules detected':'No crawl restrictions set'}</div>
          </div>
        </div>
        ${robotsChecks.map(c=>`
          <div class="check-row">
            <span class="check-icon">${c.ok?'✅':'❌'}</span>
            <div>
              <div class="check-text">${c.text}</div>
              ${c.rec?`<div class="check-rec">→ ${c.rec}</div>`:''}
            </div>
          </div>`).join('')}
        ${robots.content?`<div class="robots-pre">${robots.content.slice(0,600).replace(/</g,'&lt;')}</div>`:''}
      </div>
      <div class="robots-card">
        <div class="robots-status">
          <div class="robots-icon">${sitemap.found?'🗺️':'⛔'}</div>
          <div>
            <div style="font-weight:700;font-size:13px">${sitemap.found?'sitemap.xml Found':'sitemap.xml Missing'}</div>
            ${sitemap.found?`<div class="sitemap-url-count">${sitemap.urlCount} <span style="font-size:13px;color:var(--text3);font-family:var(--mono)">URLs indexed</span></div>`:''}
          </div>
        </div>
        ${sitemapChecks.map(c=>`
          <div class="check-row">
            <span class="check-icon">${c.ok?'✅':'❌'}</span>
            <div>
              <div class="check-text">${c.text}</div>
              ${c.rec?`<div class="check-rec">→ ${c.rec}</div>`:''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ══════════════════════════════════════
   MODULE 10 — ISSUE PRIORITIZATION
   ══════════════════════════════════════ */
function getIssues(pg){
  const issues=[];
  // CRITICAL
  if(!pg.title) issues.push({sev:'critical',ico:'🔴',title:'Missing Title Tag',detail:'No <title> found. Critical for rankings and CTR.',fix:'Add a descriptive title between 30–60 characters.'});
  if(!pg.h1s||!pg.h1s.length) issues.push({sev:'critical',ico:'🔴',title:'No H1 Tag',detail:'Every page must have exactly one H1.',fix:'Add a primary H1 matching your target keyword.'});
  if(pg.url&&!pg.url.startsWith('https')) issues.push({sev:'critical',ico:'🔴',title:'No HTTPS',detail:'Page is served over HTTP — insecure.',fix:'Install an SSL certificate and redirect HTTP→HTTPS.'});
  if(pg.robots&&/noindex/i.test(pg.robots)) issues.push({sev:'critical',ico:'🔴',title:'Noindex Directive',detail:`robots meta: "${pg.robots}"`,fix:'Remove noindex unless intentionally blocking this page.'});
  if(window._lastRobots&&window._lastRobots.found&&window._lastRobots.disallowAll) issues.push({sev:'critical',ico:'🔴',title:'robots.txt Blocks All Crawlers',detail:'Disallow: / prevents Google from indexing your site.',fix:'Update robots.txt to allow search engines.'});

  // HIGH
  if(!pg.desc) issues.push({sev:'high',ico:'🟠',title:'Missing Meta Description',detail:'No meta description found.',fix:'Write a 120–160 character description summarizing the page.'});
  if(pg.h1s&&pg.h1s.length>1) issues.push({sev:'high',ico:'🟠',title:'Multiple H1 Tags',detail:`Found ${pg.h1s.length} H1 tags — only 1 is recommended.`,fix:'Consolidate to a single H1; use H2/H3 for subheadings.'});
  if(pg.missingAlt>0) issues.push({sev:'high',ico:'🟠',title:`${pg.missingAlt} Image${pg.missingAlt!==1?'s':''} Missing Alt Text`,detail:'Images without alt text hurt accessibility and image SEO.',fix:'Add descriptive alt text to every meaningful image.'});
  if(pg.title&&pg.title.length>60) issues.push({sev:'high',ico:'🟠',title:'Title Too Long',detail:`${pg.title.length} characters — Google truncates after ~60 chars.`,fix:'Shorten to under 60 characters while keeping keywords.'});
  if(!pg.hasSchema) issues.push({sev:'high',ico:'🟠',title:'No Structured Data',detail:'No JSON-LD schema found on this page.',fix:'Add Organization, Article, or FAQPage schema using the Schema tab.'});
  if(window._lastSitemap&&!window._lastSitemap.found) issues.push({sev:'high',ico:'🟠',title:'Missing sitemap.xml',detail:'No sitemap found — crawlers must discover pages manually.',fix:'Generate a sitemap and submit to Google Search Console.'});

  // MEDIUM
  if(pg.desc&&pg.desc.length>160) issues.push({sev:'medium',ico:'🔵',title:'Meta Description Too Long',detail:`${pg.desc.length} characters — Google truncates after ~160.`,fix:'Trim to 120–160 characters.'});
  if(!pg.hasSemantic) issues.push({sev:'medium',ico:'🔵',title:'No Semantic HTML Landmarks',detail:'Missing article, main, nav, section, header, footer elements.',fix:'Use semantic HTML5 elements to improve AI and crawler understanding.'});
  if(pg.keywords&&pg.keywords.stuffed.length) issues.push({sev:'medium',ico:'🔵',title:'Possible Keyword Stuffing',detail:`Keywords with >3% density: ${pg.keywords.stuffed.map(s=>s.word).join(', ')}`,fix:'Reduce repetition. Natural keyword usage typically stays under 2%.'});
  if(pg.readability&&pg.readability.flesch<50) issues.push({sev:'medium',ico:'🔵',title:'Low Readability Score',detail:`Flesch score: ${pg.readability.flesch}. Content may be difficult to read.`,fix:'Use shorter sentences and simpler vocabulary.'});
  if(!window._lastRobots||!window._lastRobots.found) issues.push({sev:'medium',ico:'🔵',title:'Missing robots.txt',detail:'No robots.txt detected.',fix:'Create a robots.txt with Sitemap declaration.'});

  // LOW
  if(pg.imgData&&pg.imgData.filter(i=>!i.loading||i.loading!=='lazy').length>3) issues.push({sev:'low',ico:'⚪',title:'Images Not Lazy Loaded',detail:'Multiple images lack loading="lazy".',fix:'Add loading="lazy" to below-the-fold images to improve page speed.'});
  if(pg.internalLinks&&pg.internalLinks.filter(l=>l.isInternal).length<3) issues.push({sev:'low',ico:'⚪',title:'Few Internal Links',detail:'Less than 3 internal links found.',fix:'Add contextual internal links to improve crawlability and PageRank distribution.'});
  if(pg.readability&&pg.readability.avgSentenceLength>30) issues.push({sev:'low',ico:'⚪',title:'Long Average Sentence Length',detail:`Average sentence: ${pg.readability.avgSentenceLength} words.`,fix:'Aim for 15–20 words per sentence for better readability.'});

  return issues;
}

function loadIssues(pg){
  const wrap=$('mod-issues'); if(!wrap) return;
  const issues=getIssues(pg);
  const groups={critical:[],high:[],medium:[],low:[]};
  issues.forEach(i=>groups[i.sev].push(i));

  const totalEl=$('issueBadge');
  if(totalEl){ totalEl.textContent=issues.length; totalEl.style.display=issues.length?'inline':'none'; }

  let html='';
  const labels={critical:'🔴 Critical',high:'🟠 High',medium:'🔵 Medium',low:'⚪ Low'};
  ['critical','high','medium','low'].forEach(sev=>{
    const grp=groups[sev];
    if(!grp.length) return;
    html+=`<div class="issue-section">
      <div class="issue-header ${sev}" onclick="toggleIssueGroup(this)">
        <span>${labels[sev]}</span>
        <span class="issue-count">${grp.length} issue${grp.length!==1?'s':''}</span>
        <span style="margin-left:8px;font-size:11px">▶</span>
      </div>
      <ul class="issue-list ${sev==='critical'||sev==='high'?'open':''}">
        ${grp.map(i=>`<li class="issue-item">
          <span class="issue-ico">${i.ico}</span>
          <div class="issue-body">
            <div class="issue-title">${i.title}</div>
            <div class="issue-detail">${i.detail}</div>
            <div class="issue-fix">→ ${i.fix}</div>
          </div>
        </li>`).join('')}
      </ul>
    </div>`;
  });

  if(!issues.length){
    html='<div class="ok-banner">✓ No major issues detected — great work!</div>';
  }
  wrap.innerHTML=html;
}

function toggleIssueGroup(header){
  const list=header.nextElementSibling;
  const isOpen=list.classList.toggle('open');
  const arrow=header.querySelector('span:last-child');
  if(arrow) arrow.textContent=isOpen?'▼':'▶';
}

/* ══════════════════════════════════════
   MODULE 11 — AI SUGGESTIONS (heuristic)
   ══════════════════════════════════════ */
function loadSuggestions(pg){
  const wrap=$('mod-suggestions'); if(!wrap) return;
  const suggestions=[];

  // Title suggestion
  if(!pg.title){
    const fromH1=pg.h1s&&pg.h1s[0]?pg.h1s[0]:'';
    const fromDesc=pg.desc?pg.desc.split(/[.!?]/)[0]:'';
    const suggested=fromH1||fromDesc||'Add a descriptive page title here';
    suggestions.push({
      type:'title', typeLabel:'Title',
      heading:'Generate Title from H1 / Description',
      text:'No title tag found. Based on your H1 and description, here\'s a suggested title:',
      value:suggested.slice(0,60)
    });
  } else if(pg.title.length>60){
    suggestions.push({
      type:'title', typeLabel:'Title',
      heading:'Shorten Title Tag',
      text:`Current title is ${pg.title.length} characters. Suggested shortened version (${Math.min(60,pg.title.length)} chars):`,
      value:pg.title.slice(0,60)
    });
  }

  // Description suggestion
  if(!pg.desc){
    let suggested='';
    if(pg.bodyText){
      // First sentence from body text that's meaningful
      const sentences=pg.bodyText.split(/[.!?]/).map(s=>s.trim()).filter(s=>s.length>40&&s.length<200);
      suggested=sentences[0]||pg.title||'Add a meta description to improve CTR from search results.';
    } else if(pg.title){
      suggested=pg.title+' — learn more about this topic, get expert insights and practical guidance.';
    }
    if(suggested){
      suggestions.push({
        type:'desc', typeLabel:'Description',
        heading:'Generate Meta Description',
        text:'No meta description found. Generated from page content:',
        value:suggested.slice(0,160)
      });
    }
  }

  // Alt text suggestion
  if(pg.missingAlt>0){
    suggestions.push({
      type:'alt', typeLabel:'Alt Text',
      heading:'Fix Missing Image Alt Text',
      text:`${pg.missingAlt} image${pg.missingAlt!==1?'s are':' is'} missing alt text. Example fix format:`,
      value:`<img src="image.jpg" alt="Descriptive text about what the image shows, including relevant keywords">`
    });
  }

  // Schema suggestion
  if(!pg.hasSchema){
    const orgName=pg.title?pg.title.split('|')[0].split('-')[0].trim():'Your Organization';
    suggestions.push({
      type:'schema', typeLabel:'Schema',
      heading:'Add Organization Schema',
      text:'No structured data detected. Add this basic Organization schema to your <head>:',
      value:`<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${orgName}",\n  "url": "${pg.url||'https://yoursite.com'}"\n}\n<\/script>`
    });
  }

  // Long title
  if(pg.title&&pg.title.length>60&&pg.title.length<80){
    // already handled above
  }

  // Missing semantic HTML
  if(!pg.hasSemantic){
    suggestions.push({
      type:'schema', typeLabel:'HTML',
      heading:'Use Semantic HTML5 Elements',
      text:'Your page lacks semantic HTML landmarks. Wrap your content like this:',
      value:`<header><!-- site header / nav --></header>\n<main>\n  <article>\n    <h1>Page Heading</h1>\n    <!-- main content -->\n  </article>\n</main>\n<footer><!-- footer --></footer>`
    });
  }

  if(!suggestions.length){
    wrap.innerHTML='<div class="ok-banner">✓ No urgent suggestions — your page looks well-optimized!</div>';
    return;
  }

  wrap.innerHTML=`<div class="suggestion-list">${suggestions.map((s,idx)=>`
    <div class="suggestion-item">
      <div class="suggestion-header">
        <span class="suggestion-type ${s.type}">${s.typeLabel}</span>
        <span class="suggestion-heading">${s.heading}</span>
      </div>
      <div class="suggestion-text">${s.text}</div>
      <div class="suggestion-value" id="sugval_${idx}">
        <button class="suggestion-copy" onclick="copySuggestion('sugval_${idx}',this)">Copy</button>
        ${s.value.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}
      </div>
    </div>`).join('')}</div>`;
}

function copySuggestion(id, btn){
  const el=document.getElementById(id); if(!el) return;
  // Get text without the copy button text
  const clone=el.cloneNode(true);
  clone.querySelector('button')?.remove();
  const text=clone.innerText||clone.textContent;
  navigator.clipboard.writeText(text.trim()).then(()=>{
    btn.textContent='Copied!'; btn.style.color='var(--green)';
    setTimeout(()=>{btn.textContent='Copy';btn.style.color='';},1800);
  }).catch(()=>{});
}

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

/* ══════════════════════════════════════
   AUDIT COMPARISON
   ══════════════════════════════════════ */
function populateCompareSelects(){
  const history=loadHistory();
  const options=history.map(h=>{
    const d=new Date(h.date);
    const dateStr=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const domain=h.url.replace(/https?:\/\//,'').replace(/\/.*/,'');
    return`<option value="${h.id}">${domain} — ${dateStr} (SEO:${h.scores.seo})</option>`;
  }).join('');
  const s1=$('compareA'), s2=$('compareB');
  if(s1) s1.innerHTML='<option value="">Select audit A…</option>'+options;
  if(s2) s2.innerHTML='<option value="">Select audit B…</option>'+options;
}

function renderComparePanel(){
  populateCompareSelects();
  const result=$('compareResult');
  if(result) result.innerHTML='<div class="history-empty">Select two audits above and click Compare.</div>';
}

function runComparison(){
  const idA=$('compareA')?.value;
  const idB=$('compareB')?.value;
  const result=$('compareResult'); if(!result) return;

  if(!idA||!idB){
    result.innerHTML='<div class="err-banner" style="display:block">⛔ Select two different audits to compare.</div>';
    return;
  }
  if(idA===idB){
    result.innerHTML='<div class="err-banner" style="display:block">⛔ Please select two different audits.</div>';
    return;
  }
  const history=loadHistory();
  const a=history.find(h=>h.id===idA);
  const b=history.find(h=>h.id===idB);
  if(!a||!b) return;

  function delta(n1, n2){
    const diff=n2-n1;
    if(diff===0) return `<span class="cmp-delta neu">±0</span>`;
    return`<span class="cmp-delta ${diff>0?'pos':'neg'}">${diff>0?'+':''}${diff}</span>`;
  }
  function scoreColor(s){ return s>=75?'var(--green)':s>=50?'var(--amber)':'var(--red)'; }

  const dateA=new Date(a.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const dateB=new Date(b.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

  result.innerHTML=`
    <div class="compare-grid">
      <div class="cmp-card">
        <div class="cmp-label">Audit A — ${a.url.replace(/https?:\/\//,'').slice(0,30)}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:10px">${dateA}</div>
        <div class="cmp-row"><span class="cmp-key">SEO Score</span><span class="cmp-val" style="color:${scoreColor(a.scores.seo)}">${a.scores.seo}/100</span></div>
        <div class="cmp-row"><span class="cmp-key">AI Score</span><span class="cmp-val" style="color:${scoreColor(a.scores.ai)}">${a.scores.ai}/100</span></div>
        <div class="cmp-row"><span class="cmp-key">Pages</span><span class="cmp-val">${a.pageCount}</span></div>
        <div class="cmp-row"><span class="cmp-key">404s</span><span class="cmp-val">${a.findings.missing404}</span></div>
        <div class="cmp-row"><span class="cmp-key">Missing Alt</span><span class="cmp-val">${a.findings.missingAlt}</span></div>
        <div class="cmp-row"><span class="cmp-key">No H1</span><span class="cmp-val">${a.findings.noH1}</span></div>
      </div>
      <div class="cmp-card">
        <div class="cmp-label">Audit B — ${b.url.replace(/https?:\/\//,'').slice(0,30)}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:10px">${dateB}</div>
        <div class="cmp-row"><span class="cmp-key">SEO Score</span><span class="cmp-val" style="color:${scoreColor(b.scores.seo)}">${b.scores.seo}/100 ${delta(a.scores.seo,b.scores.seo)}</span></div>
        <div class="cmp-row"><span class="cmp-key">AI Score</span><span class="cmp-val" style="color:${scoreColor(b.scores.ai)}">${b.scores.ai}/100 ${delta(a.scores.ai,b.scores.ai)}</span></div>
        <div class="cmp-row"><span class="cmp-key">Pages</span><span class="cmp-val">${b.pageCount} ${delta(a.pageCount,b.pageCount)}</span></div>
        <div class="cmp-row"><span class="cmp-key">404s</span><span class="cmp-val">${b.findings.missing404} ${delta(b.findings.missing404,a.findings.missing404)}</span></div>
        <div class="cmp-row"><span class="cmp-key">Missing Alt</span><span class="cmp-val">${b.findings.missingAlt} ${delta(b.findings.missingAlt,a.findings.missingAlt)}</span></div>
        <div class="cmp-row"><span class="cmp-key">No H1</span><span class="cmp-val">${b.findings.noH1} ${delta(b.findings.noH1,a.findings.noH1)}</span></div>
      </div>
    </div>
    <div style="margin-top:12px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:11px;color:var(--text2)">
      <strong style="color:var(--green)">Comparison Summary:</strong><br>
      SEO: ${a.scores.seo} → ${b.scores.seo} ${b.scores.seo>a.scores.seo?'<span style="color:var(--green)">↑ Improved</span>':b.scores.seo<a.scores.seo?'<span style="color:var(--red)">↓ Declined</span>':'<span style="color:var(--text3)">No change</span>'} &nbsp;|&nbsp;
      AI: ${a.scores.ai} → ${b.scores.ai} ${b.scores.ai>a.scores.ai?'<span style="color:var(--green)">↑ Improved</span>':b.scores.ai<a.scores.ai?'<span style="color:var(--red)">↓ Declined</span>':'<span style="color:var(--text3)">No change</span>'}
    </div>`;
}

/* ══════════════════════════════════════
   EXPORT (HTML + JSON + Markdown)
   ══════════════════════════════════════ */
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
   PASTE AUDIT (inline card)
   ══════════════════════════════════════ */
function runPasteAudit(){
  const html=($('pasteHtml')||{}).value?.trim()||'';
  const errEl=$('pasteErr');
  if(!html){ if(errEl) errEl.style.display='block'; return; }
  if(errEl) errEl.style.display='none';
  const url=($('pasteUrl')||{}).value?.trim()||'https://pasted-page.local';
  _processPastedHTML(html,url);
}

/* ══════════════════════════════════════
   PASTE AUDIT (dedicated panel)
   ══════════════════════════════════════ */
function runPasteAudit2(){
  const html=($('pasteHtml2')||{}).value?.trim()||'';
  const errEl=$('pasteErr2');
  if(!html){ if(errEl) errEl.style.display='block'; return; }
  if(errEl) errEl.style.display='none';
  const url=($('pasteUrl2')||{}).value?.trim()||'https://pasted-page.local';
  _processPastedHTML(html,url);
}

function clearPaste(){
  const h=$('pasteHtml'); if(h) h.value='';
  const u=$('pasteUrl'); if(u) u.value='';
  const e=$('pasteErr'); if(e) e.style.display='none';
}

function _processPastedHTML(html,url){
  const analysis=analyzePage(html,url);
  const pg={...analysis,status:200,statusLabel:'200 OK (pasted)',statusCls:'s200',url,id:'paste'+Date.now(),isPasted:true};
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
   INIT
   ══════════════════════════════════════ */
$('navPaste') && $('navPaste').addEventListener('click',()=>showPanel('paste'));
buildSchemaFields();
syncSerp();
