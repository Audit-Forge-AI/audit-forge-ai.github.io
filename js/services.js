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
  const pan=$('panel-'+id); 
  if(pan) {
    pan.classList.add('active');
    // Ensure panel is visible (flex for hero)
    if(id === 'hero') pan.style.display = 'flex';
    else pan.style.display = 'flex';
  }
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

async function proxyFetch(url, attempt=0, _hopCount=0){
  if(attempt >= PROXIES.length) throw new Error('All proxies failed for: '+url);  let parsed;
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
        const hopCount = (d.status?.response_code && d.status.response_code !== d.status.http_code) ? 1 : 0;
        return {html:d.contents, realStatus:d.status?.http_code||200, redirectHops: hopCount};
      }
    }catch(e){}
    if(!text||text.length<50) throw new Error('Too short — likely blocked');
    return {html:text, realStatus:200, redirectHops:0};
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
  if(realStatus===301) return {status:301, label:'301 Redirect', cls:'soth'};
  if(realStatus===302) return {status:302, label:'302 Redirect', cls:'soth'};
  if(realStatus>=300)  return {status:realStatus, label:realStatus+' Redirect', cls:'soth'};  if(!html||html.length<150) return {status:0, label:'Proxy Blocked', cls:'soth'};
  return {status:200, label:'200 OK', cls:'s200'};
}

/* ══════════════════════════════════════
   SOFT 404 DETECTION
   ══════════════════════════════════════ */
const SOFT_404_PATTERNS = [
  /page\s+not\s+found/i,
  /\b404\b/,
  /not\s+found/i,
  /no\s+results(\s+found)?/i,
  /content\s+not\s+available/i,
  /this\s+page\s+doesn['']t\s+exist/i,
  /this\s+page\s+does\s+not\s+exist/i,
  /sorry[,\s]+we\s+can['']t\s+find/i,
  /we\s+couldn['']t\s+find/i,
  /the\s+page\s+you\s+requested/i,
  /oops[,!\s]+something\s+went\s+wrong/i,
  /error\s+404/i,
  /page\s+has\s+been\s+(removed|deleted|moved)/i
];

/**
 * Detect soft-404 pages that return HTTP 200 but display "not found" content.
 * Checks title, first H1, and the first ~500 chars of body text.
 * Returns { isSoft404: boolean, matchedPattern: string|null, matchedIn: string|null }
 */
function detectSoft404(pg) {
  if (!pg || pg.status !== 200) return { isSoft404: false, matchedPattern: null, matchedIn: null };

  const candidates = [
    { zone: 'title', text: pg.title || '' },
    { zone: 'H1',    text: (pg.h1s && pg.h1s[0]) || '' },
    { zone: 'body',  text: (pg.bodyText || '').slice(0, 500) }
  ];

  for (const { zone, text } of candidates) {
    for (const pattern of SOFT_404_PATTERNS) {
      if (pattern.test(text)) {
        return { isSoft404: true, matchedPattern: pattern.toString(), matchedIn: zone };
      }
    }
  }
  return { isSoft404: false, matchedPattern: null, matchedIn: null };
}

/* ══════════════════════════════════════
   LINK EXTRACTOR
   ══════════════════════════════════════ */
function normalizeUrl(url){
  try{
    const u=new URL(url);
    let path=u.pathname;
    // Normalize index pages to directory form
    path=path.replace(/\/index(\.html?)?$/i,'/');
    // Only strip .html if it's not a meaningful page identifier
    // (preserve .html for sites that use it as their canonical form)
    // Instead, just lowercase and remove trailing slash for dedup
    if(path.length>1 && path.endsWith('/')){
      path=path.slice(0,-1);
    }
    // Lowercase path for deduplication only, preserve original case in stored URL
    return u.origin + path;
  }catch(e){
    return url;
  }
}

function extractLinks(html, base){
  const doc=new DOMParser().parseFromString(html,'text/html');
  let origin;
  try{ origin=new URL(base).origin; }catch(e){ return []; }
  const out=new Set();
  doc.querySelectorAll('a[href]').forEach(a=>{
    try{
      const abs=new URL(a.getAttribute('href'),base).href;
      if(
        abs.startsWith(origin) &&
        !/[#?]|mailto:|tel:|\.pdf|\.jpg|\.png|\.svg|\.zip/i.test(abs)
      ){
        out.add(normalizeUrl(abs));
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
 // Collect ALL canonical tags (to detect multiples)
  const allCanonicals = [...doc.querySelectorAll('link[rel="canonical"]')]
    .map(el => el.getAttribute('href')?.trim() || '')
    .filter(Boolean);
  let canonical = allCanonicals[0] || '';
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

// Use raw word count for density to avoid inflated percentages from stop-word filtering
  const rawWordCount = bodyText.split(/\s+/).filter(Boolean).length || 1;

  const words=bodyText.toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w=>w.length>2 && !stopWords.has(w));

  const totalWords=rawWordCount;
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
    // Long technical tokens (code, URLs, identifiers) skew scores — cap their syllable count
    if(word.length > 20) return 3;
    const vowels=word.match(/[aeiouy]+/g)||[];
    let count=vowels.length;
    if(word.endsWith('e')&&count>1) count--;
    // Handle silent e at end and common patterns
    if(word.endsWith('le')&&word.length>2&&!'aeiou'.includes(word[word.length-3])) count++;
    return Math.max(1,Math.min(count, Math.ceil(word.length/3)));
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

// REPLACE
/* ══════════════════════════════════════
   CANONICAL VALIDATION AUDIT
   ══════════════════════════════════════ */
function validateCanonical(pg, allCanonicals) {
  const findings = [];
  const canonicals = allCanonicals || (pg.canonical ? [pg.canonical] : []);

  if (canonicals.length === 0) {
    findings.push({
      severity: 'medium', verdict: 'MISSING',
      title: 'Missing Canonical Tag',
      detail: 'No <link rel="canonical"> found on this page.',
      fix: 'Add <link rel="canonical" href="' + (pg.url || 'https://yoursite.com/page') + '"> to the <head>.'
    });
    return { valid: false, findings };
  }

  if (canonicals.length > 1) {
    findings.push({
      severity: 'critical', verdict: 'MULTIPLE',
      title: 'Multiple Canonical Tags Detected',
      detail: `Found ${canonicals.length} canonical tags: ${canonicals.join(', ')}`,
      fix: 'Remove all but one canonical tag. Multiple canonicals are ignored by Google and treated as an error.'
    });
  }

  const canon = canonicals[0];

  // Validate URL format
  let canonUrl;
  try {
    canonUrl = new URL(canon);
  } catch(e) {
    findings.push({
      severity: 'critical', verdict: 'INVALID',
      title: 'Invalid Canonical URL',
      detail: `Canonical href "${canon}" is not a valid absolute URL.`,
      fix: 'Use a fully-qualified absolute URL: https://yourdomain.com/page/'
    });
    return { valid: false, findings };
  }

  if (pg.url) {
    let pageUrl;
    try { pageUrl = new URL(pg.url); } catch(e) { pageUrl = null; }

    if (pageUrl) {
      // Cross-domain canonical
      if (canonUrl.origin !== pageUrl.origin) {
        findings.push({
          severity: 'critical', verdict: 'CROSS_DOMAIN',
          title: 'Cross-Domain Canonical',
          detail: `Canonical points to a different domain: ${canonUrl.origin} (page is on ${pageUrl.origin})`,
          fix: 'Only use cross-domain canonicals if you intentionally want to consolidate authority to another site. Verify this is correct.'
        });
      } else {
        // Same domain — check if self-referencing
        const normCanon = canon.replace(/\/$/, '').toLowerCase().replace(/^https?:/, '');
        const normPage  = pg.url.replace(/\/$/, '').toLowerCase().replace(/^https?:/, '');
        if (normCanon === normPage || normCanon === normPage.replace(/^\/\/[^/]+/, '')) {
          findings.push({
            severity: 'info', verdict: 'SELF',
            title: 'Self-Referencing Canonical',
            detail: 'Canonical correctly points to this page\'s own URL.',
            fix: null
          });
        } else {
          findings.push({
            severity: 'medium', verdict: 'MISMATCH',
            title: 'Canonical Mismatch',
            detail: `Canonical points to a different URL on the same domain: ${canon}`,
            fix: 'Verify this is intentional. If this page is the preferred version, update canonical to match this URL.'
          });
        }
      }
    }
  }

  const hasCritical = findings.some(f => f.severity === 'critical');
  return { valid: !hasCritical && findings.every(f => f.verdict === 'SELF'), findings, canonical: canon };
}

/* ══════════════════════════════════════
   INDEXABILITY AUDIT
   ══════════════════════════════════════ */

function analyzeIndexability(pg) {
  const reasons = [];
  let indexable = true;

  // 1. HTTP status
  if (pg.status === 404) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: '404 Not Found — page does not exist' });
  } else if (pg.status >= 400 || pg.status === 0) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: `HTTP ${pg.status || 'error'} — page unreachable` });
  }

  // 2. meta robots noindex
  if (pg.robots && /noindex/i.test(pg.robots)) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: `meta robots contains "noindex" (value: "${pg.robots}")` });
  }

  // 3. robots.txt blocks
  const robotsData = window._lastRobots || {};
  if (robotsData.found && robotsData.disallowAll) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: 'blocked by robots.txt — Disallow: / prevents crawling' });
  }

  // 4. Canonical points elsewhere
  if (pg.canonical && pg.url) {
    const normCanon = pg.canonical.replace(/\/$/, '').toLowerCase();
    const normUrl   = pg.url.replace(/\/$/, '').toLowerCase();
    if (normCanon && normCanon !== normUrl) {
      try {
        const canonOrigin = new URL(pg.canonical).origin;
        const pageOrigin  = new URL(pg.url).origin;
        if (canonOrigin !== pageOrigin) {
          indexable = false;
          reasons.push({ verdict: 'NO', reason: `canonical points to a different domain: ${pg.canonical}` });
        } else {
          // Same domain but different URL — page may be de-prioritised
          reasons.push({ verdict: 'WARN', reason: `canonical points to a different URL on same domain: ${pg.canonical}` });
        }
      } catch(e) {}
    }
  }

  // 5. No issues found
  if (reasons.length === 0) {
    reasons.push({ verdict: 'YES', reason: 'page is accessible and indexable — no blocking signals detected' });
  }

  const finalVerdict = reasons.find(r => r.verdict === 'NO') ? 'NO'
    : reasons.find(r => r.verdict === 'WARN') ? 'WARN' : 'YES';

  return { indexable: finalVerdict === 'YES', verdict: finalVerdict, reasons };
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
      const pg={...extended,status:statusInfo.status,statusLabel:statusInfo.label,statusCls:statusInfo.cls,url:normalizeUrl(pageUrl),id:'pg'+Date.now()+Math.random(),soft404:soft404Result.isSoft404,soft404Zone:soft404Result.matchedIn,depth:pageDepth,redirectHops};
      pages.push(pg); done++;
      addRow(pg); updateStats();
    }));
  }
// REPLACE
  setStepState('crawl','done');

  // Build incoming link map for orphan detection
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

// Canonical chain / loop / broken canonical analysis
  window._canonicalIssues = {};
  const crawledUrlSet = new Set(pages.map(p => p.url));
  pages.forEach(pg => {
    if (!pg.canonical || !pg.url) return;
    const normCan = normalizeUrl(pg.canonical);
    const normPg  = pg.url;
    if (normCan === normPg) return; // self-referencing — fine

    // Canonical points to uncrawled URL
    if (!crawledUrlSet.has(normCan)) {
      window._canonicalIssues[pg.url] = {type:'uncrawled', target: pg.canonical};
      return;
    }

    // Detect chain: A→B→C
    const targetPg = pages.find(p => p.url === normCan);
    if (targetPg && targetPg.canonical) {
      const normTargetCan = normalizeUrl(targetPg.canonical);
      if (normTargetCan !== normCan) {
        // Chain detected
        if (normTargetCan === normPg) {
          // Loop: A→B→A
          window._canonicalIssues[pg.url] = {type:'loop', target: pg.canonical, loopBack: normTargetCan};
        } else {
          window._canonicalIssues[pg.url] = {type:'chain', target: pg.canonical, finalTarget: normTargetCan};
        }
      }
    }
  });

// Near-duplicate content detection (keyword overlap ≥ 70%)
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

  // Store duplicate maps for issue reporting
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

function getOrphanPageIssues() {
  const issues = [];
  const incomingMap = window._incomingLinks || {};
  const rootUrls = new Set();
  // Attempt to identify the homepage(s)
  pages.forEach(pg => {
    try {
      const u = new URL(pg.url);
      if (u.pathname === '/' || u.pathname === '') rootUrls.add(pg.url);
    } catch(e) {}
  });

  pages.forEach(pg => {
    if (rootUrls.has(pg.url)) return; // never flag homepage
    if (pg.status !== 200) return;    // only flag live pages
    const incoming = incomingMap[pg.url] || [];
    if (incoming.length === 0) {
      const path = pg.url.replace(/https?:\/\/[^/]+/, '') || '/';
      issues.push({
        sev: 'medium', ico: '🔵',
        title: `Potential Orphan Page: ${path}`,
        detail: `Incoming Links: 0 — this page was discovered but has no internal links pointing to it.`,
        fix: 'Add at least one internal link from a relevant page to improve crawlability and PageRank distribution.'
      });
    }
  });
  return issues;
}

function getDuplicateTitleIssues() {
   const issues = [];
  const dupMap = window._dupTitleMap || {};
  Object.entries(dupMap).forEach(([title, urls]) => {
    if (urls.length > 1) {
      issues.push({
        sev: 'high', ico: '🟠',
        title: `Duplicate Title: "${title.slice(0, 60)}${title.length > 60 ? '…' : ''}"`,
        detail: `Used on ${urls.length} pages: ${urls.map(u => u.replace(/https?:\/\/[^/]+/, '') || '/').slice(0, 5).join(', ')}${urls.length > 5 ? '…' : ''}`,
        fix: 'Each page must have a unique title tag that accurately describes its specific content.'
      });
    }
  });
  const dupH1Map = window._dupH1Map || {};
  Object.entries(dupH1Map).forEach(([h1, urls]) => {
    if (urls.length > 1) {
      issues.push({
        sev: 'medium', ico: '🔵',
        title: `Duplicate H1: "${h1.slice(0, 60)}${h1.length > 60 ? '…' : ''}"`,
        detail: `Same H1 used on ${urls.length} pages: ${urls.map(u => u.replace(/https?:\/\/[^/]+/, '') || '/').slice(0, 5).join(', ')}`,
        fix: 'Each page should have a unique H1 that reflects its specific topic and target keyword.'
      });
    }
  });
  return issues;
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

/* Populate the schemaType <select> with all available schema types */
function initSchemaSelect(){
  const sel=$('schemaType'); if(!sel) return;
  if(sel.options.length===0){
    Object.keys(SCHEMAS).forEach(k=>{
      const opt=document.createElement('option');
      opt.value=k; opt.textContent=k;
      sel.appendChild(opt);
    });
  }
}

function buildSchemaFields(pg){
  initSchemaSelect();
  const sel=$('schemaType'); if(!sel) return;
  const cfg=SCHEMAS[sel.value];
  const wrap=$('schemaFields'); if(!wrap) return;

  /* Defensive: handle missing or malformed schema definition */
  if(!cfg || !Array.isArray(cfg.fields)){
    wrap.innerHTML='<div style="color:var(--text3);font-family:var(--mono);font-size:12px;padding:8px">No schema type selected or schema definition unavailable.</div>';
    const out=$('schemaCode'); if(out) out.textContent='';
    return;
  }

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
  initSchemaSelect();
  const sel=$('schemaType'); if(!sel) return;
  const cfg=SCHEMAS[sel.value];
  if(!cfg || !Array.isArray(cfg.fields)) return;
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

/* ══════════════════════════════════════
   PASTE AUDIT (dedicated panel)
   ══════════════════════════════════════ */
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
/* ════════════════════════════════════════════════
   AuditForge AI Pro — JS ADDITIONS
   Append to end of services.js
   All features extend existing functions safely.
   ════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   NAMESPACE
   ══════════════════════════════════════ */
window.AuditForge = window.AuditForge || {};

/* ══════════════════════════════════════
   FIX: navPaste navigation
   Replace the broken showPanel('paste') behavior
   ══════════════════════════════════════ */
(function fixNavPaste() {
  const nav = $('navPaste');
  if (!nav) return;
  // Remove all existing listeners by cloning
  const fresh = nav.cloneNode(true);
  nav.parentNode.replaceChild(fresh, nav);
  fresh.addEventListener('click', () => {
    setMode('paste');
    showPanel('crawler');
    if (window.innerWidth <= 768) closeSidebar();
  });
})();

/* ══════════════════════════════════════
   EXTEND: analyzePage()
   Safe wrapper that adds new fields
   without touching the original function.
   Called by _analyzePageExtended() which
   replaces only the crawl call site.
   ══════════════════════════════════════ */
function _extendPageAnalysis(result, html, url) {
  if (!result || !html) return result;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bodyText = result.bodyText || '';

    // ── Social / OG tags ──
    function getMeta(selectors) {
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
          return el.getAttribute('content') || el.getAttribute('href') || '';
        }
      }
      return '';
    }
    result.ogTitle    = getMeta(['meta[property="og:title"]']);
    result.ogDesc     = getMeta(['meta[property="og:description"]']);
    result.ogImage    = getMeta(['meta[property="og:image"]']);
    result.ogType     = getMeta(['meta[property="og:type"]']);
    result.ogUrl      = getMeta(['meta[property="og:url"]']);
    result.twitterCard  = getMeta(['meta[name="twitter:card"]']);
    result.twitterTitle = getMeta(['meta[name="twitter:title"]']);
    result.twitterImage = getMeta(['meta[name="twitter:image"]']);
    result.hasSocialTags = !!(result.ogTitle || result.ogDesc || result.twitterCard);

    // ── Accessibility signals ──
    result.hasLangAttr   = !!doc.querySelector('html[lang]');
    result.hasSkipLink   = !!doc.querySelector('a[href="#main"],a[href="#content"],a[href="#skip"]');
    result.ariaLandmarks = doc.querySelectorAll('[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"]').length;
    result.labelledInputs = doc.querySelectorAll('input[aria-label],input[id]').length;
    result.totalInputs   = doc.querySelectorAll('input:not([type="hidden"])').length;
    result.tabIndex      = doc.querySelectorAll('[tabindex]').length;
    result.contrastIssues = 0; // Cannot compute in browser without rendering

    // ── FAQ detection ──
       // FAQ detection — scored independently per signal type, then composed
    let schemaFaqQuestions = 0;
    let hasFAQPageSchema = false;
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const j = JSON.parse(s.textContent || '');
        const checkNode = (node) => {
          if (!node || typeof node !== 'object') return;
          if (/FAQPage/i.test(node['@type'])) {
            hasFAQPageSchema = true;
            if (Array.isArray(node.mainEntity)) schemaFaqQuestions += node.mainEntity.length;
          }
          if (Array.isArray(node['@graph'])) node['@graph'].forEach(checkNode);
        };
        checkNode(j);
      } catch(e) {}
    });
// Question headings (h2/h3/h4 ending in ?)
    const allQHeadings = [...doc.querySelectorAll('h2,h3,h4')].filter(h => /\?[\s]*$/.test(h.textContent.trim()));
    // Deduplicate: if FAQPage schema exists, headings likely mirror schema questions.
    // Only count headings that exceed the schema question count (i.e. additional uncaptured questions).
    const deduplicatedQHeadings = hasFAQPageSchema
      ? Math.max(0, allQHeadings.length - schemaFaqQuestions)
      : allQHeadings.length;
    // Question sentences in body paragraphs only (exclude heading text already counted above)
    const paraText = [...doc.querySelectorAll('p')].map(p => p.textContent).join(' ');
    const questionSentences = (paraText.match(/[A-Z][^.!?]{10,}[?]/g) || []).length;

    // Compose without double-counting:
    // Schema is authoritative. Headings add evidence only for questions not in schema.
    // Paragraph sentences add marginal evidence only.
    const faqScore = (hasFAQPageSchema ? 8 : 0)
      + Math.min(6, schemaFaqQuestions)
      + Math.min(3, deduplicatedQHeadings)
      + Math.min(1, Math.floor(questionSentences / 5));
    result.faqCount = Math.min(faqScore, 20);
    result.qHeadingCount = allQHeadings.length;
     result.hasFAQPageSchema = hasFAQPageSchema;
    result.schemaFaqQuestions = schemaFaqQuestions;
    result.qHeadingCount = qHeadings.length;


// ── Entity detection ──
    // Filter common false-positive sentence starters and UI phrases
// Common UI/navigation/CTA phrases and generic sentence starters to exclude from entity detection.
    const ENTITY_STOPLIST = new Set([
      'The Page','This Page','Learn More','Read More','Click Here','Get Started',
      'Sign Up','Log In','Sign In','Log Out','Sign Out','Find Out','See More',
      'View All','New Tab','Skip To','Back To','Go To','More Info',
      'Privacy Policy','Terms Of','Terms And','All Rights','Copyright Notice',
      'Cookie Policy','About Us','Contact Us','Our Team','Our Services',
      'Our Products','This Site','This Website','The Website','The Company',
      'The Team','The Product','The Service','Last Updated','Posted On',
      'Written By','Published By','Reviewed By','Table Of','List Of',
      'Types Of','Examples Of','Benefits Of','How To','What Is','Why Is',
      'When To','Where To','Who Is','Get In','Find Out','Learn How',
      'Get Free','Try Free','Start Free','Start Now','Buy Now','Shop Now',
      'View More','Show More','Load More','Read Full','View Full',
      'See All','See Details','More Details','Full Article',
      'Related Posts','Related Articles','You May','You Might',
      'We Use','We Are','We Have','We Do','We Can','We Will',
      'It Is','It Was','It Can','It Will','That Is','This Is',
      'There Are','There Is','These Are','Those Are'
    ]);

    // Generic sentence-starter patterns to reject regardless of stoplist
    const ENTITY_REJECT_PATTERN = /^(The|This|These|Those|A|An|It|He|She|They|We|You|I|Our|Your|My|His|Her|Their|Its|There|Here)\s/i;

    const entityMatches = bodyText.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,4})\b/g) || [];
    const entitySet = new Set(
      entityMatches.filter(e => {
        if (e.length < 6) return false;                       // too short to be meaningful
        if (ENTITY_STOPLIST.has(e)) return false;              // explicit blocklist
        if (ENTITY_REJECT_PATTERN.test(e)) return false;       // starts with a generic pronoun/article
        if (e.split(' ').length < 2) return false;             // require at least two words (multi-word entities only)
        // Require the entity to appear at least twice, or be at least 3 words long (stronger signal)
        const escaped = e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const freq = (bodyText.match(new RegExp('\\b' + escaped + '\\b', 'g')) || []).length;
        return freq >= 2 || e.split(' ').length >= 3;
      })
    );
    result.entityCount = Math.min(entitySet.size, 30);
    result.topEntities = [...entitySet].slice(0, 10);

    // ── Definition detection ──
      // Require subject to be a specific term (capitalized noun or quoted term), not pronouns
    const defPatterns = [
      // "X is a/an [noun]" — subject must be a capitalized term or quoted phrase, min 3 chars
      /\b[A-Z][a-zA-Z]{2,30}\s+(?:is|are)\s+(?:a|an|the)\s+[a-z]/g,
      // "[term]" is defined as / refers to
      /\b[A-Z][a-zA-Z\s]{2,30}(?:is\s+)?defined\s+as\b/gi,
      /\b[A-Z][a-zA-Z\s]{2,30}refers\s+to\b/gi,
      /\b[A-Z][a-zA-Z\s]{2,30}(?:also\s+)?known\s+as\b/gi,
      // "(term) means ..."
      /\([^)]{3,40}\)\s+means\b/gi,
      // "the term X means" patterns
      /\bthe\s+term\s+["']?[A-Z][^"']{2,30}["']?\s+(?:means|refers|describes)\b/gi
    ];
    let definitionCount = 0;
    defPatterns.forEach(p => {
      const hits = (bodyText.match(p) || []);
      // Exclude common false positives
      const filtered = hits.filter(h =>
        !/^(This|It|That|There|He|She|They|We|You|I|Here)\s/i.test(h.trim())
      );
      definitionCount += filtered.length;
    });
    result.definitionCount = Math.min(definitionCount, 15);

    // ── Knowledge chunk detection ──
    // Short explanatory paragraphs (50–300 words) that likely answer a question
    const paras = [...doc.querySelectorAll('p')].filter(p => {
      const wc = (p.textContent || '').split(/\s+/).filter(Boolean).length;
      return wc >= 15 && wc <= 120;
    });
    const stepLists = [...doc.querySelectorAll('ol')].length;
    result.knowledgeChunkCount = Math.min(paras.length + stepLists * 2, 20);
    result.paragraphCount = doc.querySelectorAll('p').length;
    const allParas = [...doc.querySelectorAll('p')].map(p => (p.textContent||'').split(/\s+/).filter(Boolean).length);
    result.avgParagraphLength = allParas.length ? Math.round(allParas.reduce((a,b)=>a+b,0)/allParas.length) : 0;

    // ── Conversational intent detection ──
    const convPatterns = /\b(how|why|what|when|where|who|can|should|does|is|are|will|which)\b/gi;
    const convMatches = bodyText.match(convPatterns) || [];
    result.conversationIntentCount = Math.min(convMatches.length, 40);

// ── Citation detection (comprehensive) ──
    const blockquotes = doc.querySelectorAll('blockquote').length;
    const cites = doc.querySelectorAll('cite').length;
    const blockquotesWithCite = doc.querySelectorAll('blockquote[cite]').length;

    // External authority domain links
    const AUTHORITY_DOMAINS = [
      '.gov', '.edu', 'wikipedia.org', 'developers.google.com',
      'schema.org', 'w3.org', 'github.com', 'developer.mozilla.org',
      'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'nature.com',
      'sciencedirect.com', 'jstor.org', 'arxiv.org'
    ];
    const externalLinks = [...doc.querySelectorAll('a[href]')].filter(a => {
      try {
        const href = new URL(a.getAttribute('href'), url).href;
        return href.startsWith('http') && !href.startsWith(new URL(url).origin);
      } catch(e) { return false; }
    });
    const authorityLinks = externalLinks.filter(a => {
      try {
        const href = a.getAttribute('href') || '';
        return AUTHORITY_DOMAINS.some(d => href.includes(d));
      } catch(e) { return false; }
    });
    const generalExternalLinks = externalLinks.length;

    // Citation phrases in body text
    const CITATION_PHRASES = [
      /according to\b/gi, /research by\b/gi, /study (?:from|by|published)/gi,
      /source:/gi, /references:/gi, /citation:/gi, /reported by\b/gi,
      /as cited in\b/gi, /per \b[A-Z]/g, /\[\d+\]/g, /et al\./gi,
      /published in\b/gi, /data from\b/gi, /findings (?:show|suggest|indicate)/gi
    ];
    let citationPhraseCount = 0;
    CITATION_PHRASES.forEach(p => {
      citationPhraseCount += (bodyText.match(p) || []).length;
    });

    // Anchor text citation signals
    const citationAnchorLinks = [...doc.querySelectorAll('a')].filter(a =>
      /source|reference|cite|study|research|according|view study|full report|original/i.test(a.textContent) ||
      /\[\d+\]/.test(a.textContent)
    ).length;

    const rawCitationScore = blockquotes + cites + blockquotesWithCite +
      (authorityLinks.length * 3) + Math.min(5, Math.floor(generalExternalLinks / 2)) +
      Math.min(5, citationPhraseCount) + Math.min(3, citationAnchorLinks);

    result.citationCount = Math.min(rawCitationScore, 20);
    result.authorityLinkCount = authorityLinks.length;
    result.externalLinkCount = generalExternalLinks;
    result.citationPhraseCount = citationPhraseCount;

    // Citation score 0/50/75/100
    result.citationScore = result.citationCount === 0 ? 0
      : authorityLinks.length >= 3 || (result.citationCount >= 8) ? 100
      : authorityLinks.length >= 1 || (result.citationCount >= 4) ? 75
      : 50;

// ── E-E-A-T Signals ──
    const eeat = {
      hasPersonSchema:   false,
      hasAuthorSchema:   false,
      hasAuthorRel:      false,
      hasDatePublished:  false,
      hasDateModified:   false,
      bylineFound:       false,
      bylineName:        '',
      authorName:        ''
    };

    // Person / author schema
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const j = JSON.parse(s.textContent || '');
        const check = node => {
          if (!node || typeof node !== 'object') return;
          if (/^Person$/i.test(node['@type'])) eeat.hasPersonSchema = true;
          if (node.author) {
            eeat.hasAuthorSchema = true;
            const a = node.author;
            eeat.authorName = (typeof a === 'string' ? a : a.name) || '';
          }
          if (node.datePublished) eeat.hasDatePublished = true;
          if (node.dateModified)  eeat.hasDateModified  = true;
          if (Array.isArray(node['@graph'])) node['@graph'].forEach(check);
        };
        check(j);
      } catch(e) {}
    });

    // rel="author"
    if (doc.querySelector('a[rel="author"],link[rel="author"]')) eeat.hasAuthorRel = true;

    // datePublished / dateModified in meta/time elements
    if (!eeat.hasDatePublished) eeat.hasDatePublished = !!(
      doc.querySelector('meta[property="article:published_time"],time[itemprop="datePublished"],[itemprop="datePublished"]')
    );
    if (!eeat.hasDateModified) eeat.hasDateModified = !!(
      doc.querySelector('meta[property="article:modified_time"],time[itemprop="dateModified"],[itemprop="dateModified"]')
    );

    // Byline patterns in body text
    const bylineMatch = bodyText.match(/\bBy\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/);
    if (bylineMatch) { eeat.bylineFound = true; eeat.bylineName = bylineMatch[1]; }

    // eeatScore (0–100)
    let eeatScore = 0;
    if (eeat.hasPersonSchema)  eeatScore += 25;
    if (eeat.hasAuthorSchema)  eeatScore += 20;
    if (eeat.hasAuthorRel)     eeatScore += 15;
    if (eeat.bylineFound)      eeatScore += 15;
    if (eeat.hasDatePublished) eeatScore += 15;
    if (eeat.hasDateModified)  eeatScore += 10;
    result.eeat = eeat;
    result.eeatScore = Math.min(100, eeatScore);

    // ── List / Table density ──
    const totalWords = result.wordCount || 1;    const listItems = doc.querySelectorAll('li').length;
    result.listDensity = Math.min(100, Math.round((listItems / (totalWords / 100)) * 10));
    result.tableDensity = Math.min(100, (result.hasTables || 0) * 25);

    // ── AI Signals composite ──
    result.aiSignals = {
      hasFAQ:         result.faqCount > 2,
      hasEntities:    result.entityCount > 3,
      hasDefinitions: result.definitionCount > 1,
      hasChunks:      result.knowledgeChunkCount > 2,
      hasConversational: result.conversationIntentCount > 5,
      hasCitations:   result.citationCount > 0,
      hasSchema:      !!(result.hasSchema),
      hasSemantics:   !!(result.hasSemantic),
      hasStructuredLists: !!(result.hasLists),
      hasTables:      !!(result.hasTables)
    };

    // ── AI Metrics per dimension (0–100) ──
    result.aiMetrics = {
      faq:            Math.min(100, result.faqCount * 15),
      entities:       Math.min(100, result.entityCount * 4),
      definitions:    Math.min(100, result.definitionCount * 10),
      chunks:         Math.min(100, result.knowledgeChunkCount * 7),
      conversational: Math.min(100, Math.round((result.conversationIntentCount / 40) * 100)),
      citations:      result.citationScore !== undefined ? result.citationScore : Math.min(100, result.citationCount * 10),
      schema:         result.hasSchema ? 90 : 5,
      semantics:      Math.min(100, (result.hasSemantic || 0) * 20)
    };

    // ── Real AI Score (transparent weighted calculation) ──
    const m = result.aiMetrics;
    result.realAIScore = Math.min(100, Math.round(
      m.faq          * 0.18 +
      m.entities     * 0.14 +
      m.definitions  * 0.12 +
      m.chunks       * 0.15 +
      m.conversational * 0.12 +
      m.citations    * 0.08 +
      m.schema       * 0.12 +
      m.semantics    * 0.09
    ));

    // ── Intent coverage ──
    const informational = (bodyText.match(/\b(how|what|why|explain|guide|tutorial|learn)\b/gi) || []).length;
    const navigational  = (bodyText.match(/\b(login|sign in|download|get started|contact|home)\b/gi) || []).length;
    const commercial    = (bodyText.match(/\b(best|top|review|compare|vs|alternative|price)\b/gi) || []).length;
    const transactional = (bodyText.match(/\b(buy|purchase|order|checkout|subscribe|free trial|get)\b/gi) || []).length;
    const intentTotal   = Math.max(1, informational + navigational + commercial + transactional);
    result.intentCoverage = {
      informational: Math.min(100, Math.round((informational / intentTotal) * 100)),
      navigational:  Math.min(100, Math.round((navigational  / intentTotal) * 100)),
      commercial:    Math.min(100, Math.round((commercial    / intentTotal) * 100)),
      transactional: Math.min(100, Math.round((transactional / intentTotal) * 100))
    };

    // ── Canonical validation ──
    result.allCanonicals = allCanonicals || [];
    result.canonicalValidation = validateCanonical(result, result.allCanonicals);

    // ── Schema type detection ──
    result.schemaTypes = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const j = JSON.parse(s.textContent || '');
        const t = j['@type'];
        if (t) result.schemaTypes.push(Array.isArray(t) ? t : [t]);
        if (j['@graph']) {
          j['@graph'].forEach(n => { if (n['@type']) result.schemaTypes.push(n['@type']); });
        }
      } catch(e) {}
    });
    result.schemaTypes = [...new Set(result.schemaTypes.flat())];
    result.hasFAQSchema       = result.schemaTypes.includes('FAQPage');
    result.hasOrgSchema       = result.schemaTypes.some(t => /Organization|LocalBusiness/i.test(t));
    result.hasArticleSchema   = result.schemaTypes.some(t => /Article|BlogPosting|NewsArticle/i.test(t));
    result.hasProductSchema   = result.schemaTypes.some(t => /Product/i.test(t));
    result.hasBreadcrumbSchema = result.schemaTypes.some(t => /BreadcrumbList/i.test(t));

  } catch(e) {
    console.warn('AuditForge: _extendPageAnalysis error', e);
  }
  return result;
}

/* ══════════════════════════════════════
   HOOK INTO CRAWL
   Monkey-patch _processPastedHTML and
   the crawl engine's analyzePage call
   by wrapping the global at parse-time.
   We can't modify crawl() directly, so
   we replace analyzePage globally with
   a version that auto-extends results.
   ══════════════════════════════════════ */
(function hookAnalyzePage() {
  const _orig = window.analyzePage || analyzePage;
  // Override in global scope
  window._analyzePageOriginal = _orig;
  // We shadow the function name by reassigning on window:
  window.analyzePage = function(html, url) {
    const result = _orig(html, url);
    return _extendPageAnalysis(result, html, url);
  };
  // Since services.js uses the local `analyzePage` binding (not window.analyzePage),
  // we need a different approach: store extension data on a side-channel
  // keyed by page ID, populated during _processPastedHTML override.
})();

/* Because crawl() uses its local binding of analyzePage() we cannot
   monkey-patch it. Instead, we post-process pages after crawl completes
   by hooking the saveToHistory call timing via a MutationObserver on the
   grid, or by overriding _processPastedHTML. For paste audits we can
   safely wrap. For crawled pages we extend in openInspector(). */

// Extension cache: html content keyed by page id is not stored (too large).
// Instead, extend the page object with defaults if missing, and run
// the pattern-matching analysis against what we do have (bodyText).
function _ensureExtended(pg) {
  if (pg._extended) return pg;
  try {
    // Run text-based analysis only (no full HTML re-parse for crawled pages)
    const bodyText = pg.bodyText || '';

    if (pg.faqCount === undefined) {
      const qSentences = (bodyText.match(/[A-Z][^.!?]*\?/g) || []).length;
      pg.faqCount = Math.min(Math.floor(qSentences / 2), 10);
    }
    if (pg.entityCount === undefined) {
      const entityMatches = bodyText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
      pg.entityCount = Math.min(new Set(entityMatches).size, 20);
      pg.topEntities = [...new Set(entityMatches)].slice(0, 8);
    }
    if (pg.definitionCount === undefined) {
      const defPat = /\b(?:is a|is an|refers to|defined as|known as)\b/gi;
      pg.definitionCount = Math.min((bodyText.match(defPat) || []).length, 10);
    }
    if (pg.knowledgeChunkCount === undefined) {
      // Approximate from word count and structure signals
      pg.knowledgeChunkCount = Math.min(
        Math.floor((pg.wordCount || 0) / 80) + (pg.hasLists ? 2 : 0),
        15
      );
    }
    if (pg.conversationIntentCount === undefined) {
      const convPat = /\b(how|why|what|when|where|who|can|should)\b/gi;
      pg.conversationIntentCount = Math.min((bodyText.match(convPat) || []).length, 30);
    }
     if (pg.citationCount === undefined) {
      pg.citationCount = 0;
    }
    if (pg.citationScore === undefined) {
      pg.citationScore = 0;
    }
    if (pg.authorityLinkCount === undefined) pg.authorityLinkCount = 0;
    if (pg.externalLinkCount === undefined) pg.externalLinkCount = 0;
    if (pg.citationPhraseCount === undefined) pg.citationPhraseCount = 0;
    if (!pg.aiMetrics) {
      pg.aiMetrics = {
        faq:            Math.min(100, pg.faqCount * 15),
        entities:       Math.min(100, pg.entityCount * 4),
        definitions:    Math.min(100, pg.definitionCount * 10),
        chunks:         Math.min(100, pg.knowledgeChunkCount * 7),
        conversational: Math.min(100, Math.round((pg.conversationIntentCount / 30) * 100)),
        citations:      pg.citationScore !== undefined ? pg.citationScore : Math.min(100, pg.citationCount * 10),        schema:         pg.hasSchema ? 90 : 5,
        semantics:      Math.min(100, (pg.hasSemantic || 0) * 20)
      };
    }
    if (pg.realAIScore === undefined) {
      const m = pg.aiMetrics;
      pg.realAIScore = Math.min(100, Math.round(
        m.faq * 0.18 + m.entities * 0.14 + m.definitions * 0.12 +
        m.chunks * 0.15 + m.conversational * 0.12 + m.citations * 0.08 +
        m.schema * 0.12 + m.semantics * 0.09
      ));
    }
    if (!pg.intentCoverage) {
      const inf = (bodyText.match(/\b(how|what|why|explain|guide|learn)\b/gi) || []).length;
      const nav = (bodyText.match(/\b(login|download|contact|home)\b/gi) || []).length;
      const com = (bodyText.match(/\b(best|top|review|compare|price)\b/gi) || []).length;
      const tra = (bodyText.match(/\b(buy|purchase|order|subscribe)\b/gi) || []).length;
      const tot = Math.max(1, inf+nav+com+tra);
      pg.intentCoverage = {
        informational: Math.min(100, Math.round(inf/tot*100)),
        navigational:  Math.min(100, Math.round(nav/tot*100)),
        commercial:    Math.min(100, Math.round(com/tot*100)),
        transactional: Math.min(100, Math.round(tra/tot*100))
      };
    }
    if (!pg.schemaTypes) pg.schemaTypes = [];
    if (pg.hasFAQSchema    === undefined) pg.hasFAQSchema    = false;
    if (pg.hasOrgSchema    === undefined) pg.hasOrgSchema    = false;
    if (pg.hasArticleSchema === undefined) pg.hasArticleSchema = false;
    if (!pg.aiSignals) {
      pg.aiSignals = {
        hasFAQ:         pg.faqCount > 2,
        hasEntities:    pg.entityCount > 3,
        hasDefinitions: pg.definitionCount > 1,
        hasChunks:      pg.knowledgeChunkCount > 2,
        hasConversational: pg.conversationIntentCount > 5,
        hasCitations:   pg.citationCount > 0,
        hasSchema:      !!(pg.hasSchema),
        hasSemantics:   !!(pg.hasSemantic)
      };
    }
if (!pg.eeat) pg.eeat = {hasPersonSchema:false,hasAuthorSchema:false,hasAuthorRel:false,hasDatePublished:false,hasDateModified:false,bylineFound:false,bylineName:'',authorName:''};
    if (pg.eeatScore === undefined) pg.eeatScore = 0;
    if (!pg.hasSocialTags) pg.hasSocialTags = !!(pg.ogTitle || pg.twitterCard);
    if (!pg.ogTitle) pg.ogTitle = '';
    if (!pg.ogDesc) pg.ogDesc = '';
    if (!pg.ogImage) pg.ogImage = '';
    if (!pg.twitterCard) pg.twitterCard = '';
    if (pg.hasLangAttr === undefined) pg.hasLangAttr = false;
    if (!pg.ariaLandmarks) pg.ariaLandmarks = 0;
  } catch(e) {}
  pg._extended = true;
  return pg;
}

/* ══════════════════════════════════════
   SCORE ENGINE V2
   AuditForge.scores
   ══════════════════════════════════════ */
AuditForge.scores = {

  compute(pg) {
    if (!pg) return null;
    _ensureExtended(pg);

    const deductions = {};

    // ── Technical SEO ──
    let tech = 100;
    const techD = [];
    if (!pg.title)                  { tech -= 18; techD.push({l:'Missing title tag',          v:-18}); }
    else if (pg.title.length > 60)  { tech -= 6;  techD.push({l:'Title too long ('+pg.title.length+' ch)', v:-6}); }
    else if (pg.title.length < 10)  { tech -= 8;  techD.push({l:'Title too short',             v:-8}); }
    if (!pg.desc)                   { tech -= 12; techD.push({l:'Missing meta description',    v:-12}); }
    else if (pg.desc.length > 160)  { tech -= 4;  techD.push({l:'Description too long',        v:-4}); }
    if (!pg.h1s || !pg.h1s.length) { tech -= 14; techD.push({l:'No H1 tag',                   v:-14}); }
    if (pg.h1s && pg.h1s.length>1) { tech -= 8;  techD.push({l:'Multiple H1 tags ('+pg.h1s.length+')', v:-8}); }
    if (pg.robots && /noindex/i.test(pg.robots)) { tech -= 15; techD.push({l:'Noindex directive set', v:-15}); }
    if (!pg.canonical)              { tech -= 5;  techD.push({l:'No canonical tag',             v:-5}); }
    if (pg.url && pg.url.startsWith('http:')) { tech -= 10; techD.push({l:'Not HTTPS',          v:-10}); }
    if (window._lastRobots && !window._lastRobots.found) { tech -= 5; techD.push({l:'robots.txt missing', v:-5}); }
    if (window._lastSitemap && !window._lastSitemap.found) { tech -= 5; techD.push({l:'sitemap.xml missing', v:-5}); }
    deductions.technical = techD;
    const technicalSEO = Math.max(0, Math.min(100, tech));

    // ── Content Quality ──
    let content = 100;
    const contentD = [];
    const wc = pg.wordCount || 0;
    if (wc < 100)        { content -= 25; contentD.push({l:'Very thin content (<100 words)',  v:-25}); }
    else if (wc < 300)   { content -= 15; contentD.push({l:'Thin content (<300 words)',       v:-15}); }
    else if (wc < 600)   { content -= 5;  contentD.push({l:'Moderate content (<600 words)',    v:-5}); }
    if (!pg.headingNodes || pg.headingNodes.length < 2) { content -= 10; contentD.push({l:'Too few headings',  v:-10}); }
    if (!pg.hasLists)    { content -= 5;  contentD.push({l:'No lists for scannability',       v:-5}); }
    if (pg.readability) {
      if (pg.readability.flesch < 30)       { content -= 12; contentD.push({l:'Very hard to read',  v:-12}); }
      else if (pg.readability.flesch < 50)  { content -= 6;  contentD.push({l:'Difficult readability', v:-6}); }
      if (pg.readability.avgSentenceLength > 35) { content -= 5; contentD.push({l:'Very long sentences', v:-5}); }
    }
    if (!pg.faqCount || pg.faqCount < 2)    { content -= 8;  contentD.push({l:'No FAQ content detected',  v:-8}); }
    if (pg.definitionCount < 1)             { content -= 5;  contentD.push({l:'No definitions found',      v:-5}); }
    deductions.content = contentD;
    const contentQuality = Math.max(0, Math.min(100, content));

    // ── Accessibility ──
    let a11y = 100;
    const a11yD = [];
    if (pg.missingAlt > 0)    { const p = Math.min(20, pg.missingAlt*3); a11y -= p; a11yD.push({l:pg.missingAlt+' image(s) missing alt', v:-p}); }
    if (!pg.hasLangAttr)      { a11y -= 8;  a11yD.push({l:'No lang attribute on <html>',   v:-8}); }
    if (!pg.hasSemantic)      { a11y -= 10; a11yD.push({l:'No semantic HTML landmarks',     v:-10}); }
    if (pg.ariaLandmarks < 2) { a11y -= 5;  a11yD.push({l:'Insufficient ARIA landmarks',   v:-5}); }
    // Heading hierarchy violations
    let prevLv = 0, skipCount = 0;
    (pg.headingNodes || []).forEach(h => {
      const lv = parseInt(h.tag[1]);
      if (lv > prevLv + 1 && prevLv > 0) skipCount++;
      prevLv = lv;
    });
    if (skipCount > 0) { a11y -= skipCount * 4; a11yD.push({l:skipCount+' heading level skip(s)', v:-(skipCount*4)}); }
    if (pg.totalInputs > 0 && pg.labelledInputs < pg.totalInputs) {
      const u = pg.totalInputs - pg.labelledInputs;
      a11y -= Math.min(10, u * 3);
      a11yD.push({l:u+' input(s) without label', v:-(Math.min(10,u*3))});
    }
    deductions.accessibility = a11yD;
    const accessibility = Math.max(0, Math.min(100, a11y));

    // ── Schema Health ──
    let schema = 0;
    const schemaD = [];
    if (pg.hasSchema) {
      schema += 40;
      schemaD.push({l:'Structured data present', v:+40});
    } else {
      schemaD.push({l:'No JSON-LD schema found', v:0});
    }
    if (pg.hasFAQSchema)       { schema += 20; schemaD.push({l:'FAQPage schema',        v:+20}); }
    if (pg.hasOrgSchema)       { schema += 15; schemaD.push({l:'Organization schema',   v:+15}); }
    if (pg.hasArticleSchema)   { schema += 15; schemaD.push({l:'Article schema',        v:+15}); }
    if (pg.hasBreadcrumbSchema){ schema += 10; schemaD.push({l:'BreadcrumbList schema', v:+10}); }
    if (!pg.hasFAQSchema)      { schemaD.push({l:'Missing FAQPage schema', v:0}); }
    if (!pg.hasOrgSchema && !pg.hasArticleSchema) { schemaD.push({l:'No Organization/Article schema', v:0}); }
    deductions.schema = schemaD;
    const schemaHealth = Math.min(100, schema);

    // ── Social Optimization ──
    let social = 100;
    const socialD = [];
    if (!pg.ogTitle)      { social -= 20; socialD.push({l:'Missing og:title',        v:-20}); }
    if (!pg.ogDesc)       { social -= 15; socialD.push({l:'Missing og:description',  v:-15}); }
    if (!pg.ogImage)      { social -= 20; socialD.push({l:'Missing og:image',        v:-20}); }
    if (!pg.ogType)       { social -= 10; socialD.push({l:'Missing og:type',         v:-10}); }
    if (!pg.twitterCard)  { social -= 15; socialD.push({l:'Missing twitter:card',    v:-15}); }
    if (!pg.twitterImage) { social -= 10; socialD.push({l:'Missing twitter:image',   v:-10}); }
    deductions.social = socialD;
    const socialOptimization = Math.max(0, Math.min(100, social));

    // ── AI Visibility ──
    const aiVisibility = pg.realAIScore || pg.aiScore || 0;
    const aiD = [];
    const am = pg.aiMetrics || {};
    if ((am.faq || 0) < 30)            { aiD.push({l:'Low FAQ coverage',          v: am.faq - 30}); }
    if ((am.entities || 0) < 40)       { aiD.push({l:'Weak entity signals',       v: am.entities - 40}); }
    if ((am.schema || 0) < 50)         { aiD.push({l:'No structured data',        v: am.schema - 50}); }
    if ((am.conversational || 0) < 40) { aiD.push({l:'Low conversational intent', v: am.conversational - 40}); }
    deductions.ai = aiD;

    // ── Overall (weighted) ──
    const overall = Math.round(
      technicalSEO    * 0.25 +
      contentQuality  * 0.20 +
      accessibility   * 0.15 +
      schemaHealth    * 0.15 +
      socialOptimization * 0.10 +
      aiVisibility    * 0.15
    );

    return {
      technicalSEO,
      contentQuality,
      accessibility,
      schemaHealth,
      socialOptimization,
      aiVisibility,
      overall,
      deductions
    };
  },

  colorFor(score) {
    if (score >= 80) return 'var(--green)';
    if (score >= 55) return 'var(--amber)';
    return 'var(--red)';
  },

  labelFor(score) {
    if (score >= 80) return 'Good';
    if (score >= 55) return 'Needs Work';
    return 'Poor';
  }
};

/* ══════════════════════════════════════
   AI RADAR — loadAI() replacement
   Hooks into existing DOM nodes:
   radarArc, aiNum, aiMetrics
   ══════════════════════════════════════ */
(function replaceLoadAI() {
  window.loadAI = function(pg) {
    if (!pg) return;
    _ensureExtended(pg);

    const score = pg.realAIScore !== undefined ? pg.realAIScore : (pg.aiScore || 0);
    const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';

    // Animate ring (existing SVG nodes)
    const arc = $('radarArc');
    if (arc) {
      arc.style.stroke = color;
      setTimeout(() => {
        arc.style.strokeDashoffset = String(264 - (score / 100) * 264);
      }, 80);
    }
    const num = $('aiNum');
    if (num) {
      num.textContent = score;
      num.style.color = color;
    }

    // Metrics container
    const wrap = $('aiMetrics');
    if (!wrap) return;

    const m = pg.aiMetrics || {};
    const metricDefs = [
      { key: 'faq',            label: 'FAQ Coverage',          icon: '❓', hint: 'Questions + answers detected' },
      { key: 'entities',       label: 'Entity Signals',        icon: '🏷',  hint: 'Named entities found' },
      { key: 'definitions',    label: 'Definitions',           icon: '📖', hint: 'Definition patterns' },
      { key: 'chunks',         label: 'Knowledge Chunks',      icon: '🧠', hint: 'Quote-ready sections' },
      { key: 'conversational', label: 'Conversational Intent', icon: '💬', hint: 'How/Why/What/When coverage' },
      { key: 'citations',      label: 'Citations & Sources',   icon: '🔗', hint: 'Blockquotes & cite elements' },
      { key: 'schema',         label: 'Structured Data',       icon: '📋', hint: 'JSON-LD schema presence' },
      { key: 'semantics',      label: 'Semantic HTML',         icon: '🏗',  hint: 'Landmark elements' }
    ];

    const metricsHtml = metricDefs.map(def => {
      const val = m[def.key] || 0;
      const cls = val >= 70 ? 'hi' : val >= 40 ? 'mi' : 'lo';
      const fillColor = val >= 70 ? 'var(--green)' : val >= 40 ? 'var(--amber)' : 'var(--red)';
      return `<div class="ai-metric-card" title="${def.hint}">
        <div class="ai-metric-name">${def.icon} ${def.label}</div>
        <div class="ai-metric-val" style="color:${fillColor}">${val}<span style="font-size:13px;color:var(--text3)">/100</span></div>
        <div class="ai-metric-bar">
          <div class="ai-metric-fill afill ${cls}" style="width:0;background:${fillColor}" data-t="${val}%"></div>
        </div>
      </div>`;
    }).join('');

    // Strengths and weaknesses
    const strengths = metricDefs.filter(d => (m[d.key] || 0) >= 60).map(d => d.label);
    const weaknesses = metricDefs.filter(d => (m[d.key] || 0) < 40).map(d => d.label);

    // Intent coverage
    const ic = pg.intentCoverage || { informational:0, navigational:0, commercial:0, transactional:0 };
    const intentHtml = `
      <div class="sec-title" style="margin-top:14px;margin-bottom:8px">Conversational Intent Coverage</div>
      <div class="ai-intent-grid">
        ${[
          {l:'Informational', v:ic.informational, c:'var(--green)'},
          {l:'Navigational',  v:ic.navigational,  c:'var(--blue)'},
          {l:'Commercial',    v:ic.commercial,     c:'var(--amber)'},
          {l:'Transactional', v:ic.transactional,  c:'var(--purple)'}
        ].map(i=>`<div class="ai-intent-card">
          <div class="ai-intent-label">${i.l}</div>
          <div class="ai-intent-score" style="color:${i.c}">${i.v}%</div>
        </div>`).join('')}
      </div>`;

    // Signals
    const signals = pg.aiSignals || {};
    const signalItems = [
      { ok: signals.hasFAQ,           label: 'FAQ / Q&A content',         gain: '+FAQ visibility' },
      { ok: signals.hasEntities,      label: 'Named entity signals',       gain: '+Entity recognition' },
      { ok: signals.hasDefinitions,   label: 'Definition patterns',        gain: '+Definition extraction' },
      { ok: signals.hasChunks,        label: 'Answer-ready paragraphs',    gain: '+AI citation potential' },
      { ok: signals.hasConversational,label: 'Conversational intent',      gain: '+Prompt matching' },
      { ok: signals.hasCitations,     label: 'Citations & references',     gain: '+Source credibility' },
      { ok: signals.hasSchema,        label: 'Structured data (JSON-LD)',  gain: '+Rich results' },
      { ok: signals.hasSemantics,     label: 'Semantic HTML landmarks',    gain: '+Crawler understanding' },
    ].map(s => `<div class="ai-signal-item">
      <span class="ai-signal-ico">${s.ok ? '✅' : '❌'}</span>
      <span class="ai-signal-text">${s.label}</span>
      <span class="ai-signal-score" style="color:${s.ok?'var(--green)':'var(--red)'}">${s.ok ? s.gain : '—'}</span>
    </div>`).join('');

    // Entity list
    const entityHtml = pg.topEntities && pg.topEntities.length
      ? `<div class="sec-title" style="margin-top:14px;margin-bottom:6px">Detected Entities</div>
         <div style="display:flex;flex-wrap:wrap;gap:6px">${
           pg.topEntities.map(e => `<span style="background:var(--blue-dim);border:1px solid rgba(59,130,246,.2);color:var(--blue);padding:2px 8px;border-radius:10px;font-family:var(--mono);font-size:10px;font-weight:700">${e}</span>`).join('')
         }</div>`
      : '';

    wrap.innerHTML = `
      <div class="ai-metric-grid" id="aiMetricGrid">${metricsHtml}</div>
      ${strengths.length ? `<div style="margin-top:10px;padding:8px 12px;background:var(--green-dim);border:1px solid rgba(16,185,129,.2);border-radius:6px;font-family:var(--mono);font-size:11px;color:var(--green)">
        ✓ Strengths: ${strengths.join(', ')}
      </div>` : ''}
      ${weaknesses.length ? `<div style="margin-top:6px;padding:8px 12px;background:var(--red-dim);border:1px solid rgba(239,68,68,.2);border-radius:6px;font-family:var(--mono);font-size:11px;color:var(--red)">
        ✗ Needs improvement: ${weaknesses.join(', ')}
      </div>` : ''}
      <div class="sec-title" style="margin-top:14px;margin-bottom:8px">AI Readiness Signals</div>
      <div class="ai-signal-list">${signalItems}</div>
      ${intentHtml}
      ${entityHtml}
    `;

 // ── AI Citation Readiness Analysis ──
    const _ensureExt = pg; // already extended above
    const positiveSignals = [];
    const negativeSignals = [];

    if (signals.hasFAQ)            positiveSignals.push('✓ FAQ/Q&A content detected — AI systems extract question-answer pairs');
    if (signals.hasDefinitions)    positiveSignals.push('✓ Definition patterns detected — LLMs prefer content with clear "X is a..." structures');
    if (signals.hasSchema)         positiveSignals.push('✓ Structured data (JSON-LD) present — helps AI parse entity relationships');
    if (pg.hasFAQSchema)           positiveSignals.push('✓ FAQPage schema detected — enables direct FAQ extraction');
    if (pg.hasOrgSchema)           positiveSignals.push('✓ Organization schema found — entity recognized by AI knowledge graphs');
    if (pg.hasArticleSchema)       positiveSignals.push('✓ Article schema detected — content classified as authoritative article');
    if (signals.hasEntities)       positiveSignals.push(`✓ Named entities detected (${pg.entityCount}) — improves entity recognition`);
    if (signals.hasChunks)         positiveSignals.push('✓ Answer-ready paragraphs found — suitable for AI extraction');
    if (signals.hasSemantics)      positiveSignals.push('✓ Semantic HTML landmarks present — structural clarity for AI parsers');
    if (signals.hasCitations)      positiveSignals.push('✓ External citations/references detected — signals source credibility');
    if ((pg.wordCount || 0) >= 500) positiveSignals.push('✓ Sufficient content depth — longer content is cited more by AI systems');

    if (!signals.hasFAQ)           negativeSignals.push('✗ No FAQ content — add question-and-answer sections');
    if (!signals.hasDefinitions)   negativeSignals.push('✗ No definition patterns — AI rarely extracts pages without clear definitions');
    if (!signals.hasSchema)        negativeSignals.push('✗ No structured data — pages without schema are harder for AI to interpret');
    if (!signals.hasCitations)     negativeSignals.push('✗ No external references — pages without sources score lower on credibility');
    if (pg.entityCount < 3)        negativeSignals.push('✗ Weak entity signals — add specific named entities (people, orgs, places)');
    if (!signals.hasChunks)        negativeSignals.push('✗ No answer-ready blocks — restructure content into short Q&A paragraphs');
    if ((pg.wordCount || 0) < 200) negativeSignals.push('✗ Content too thin — AI systems rarely cite pages with under 200 words');
    if (!signals.hasSemantics)     negativeSignals.push('✗ No semantic HTML — use <article>, <section>, <main> for structural clarity');

    // Readiness score: 0–100 based on weighted actual signals
    let readinessScore = 0;
    if (signals.hasFAQ)          readinessScore += 20;
    if (signals.hasDefinitions)  readinessScore += 15;
    if (signals.hasSchema)       readinessScore += 15;
    if (pg.hasFAQSchema)         readinessScore += 10;
    if (signals.hasEntities)     readinessScore += 10;
    if (signals.hasChunks)       readinessScore += 10;
    if (signals.hasCitations)    readinessScore += 10;
    if (signals.hasSemantics)    readinessScore += 5;
    if ((pg.wordCount || 0) >= 500) readinessScore += 5;
    readinessScore = Math.min(100, readinessScore);

    const readinessColor = readinessScore >= 70 ? 'var(--green)' : readinessScore >= 40 ? 'var(--amber)' : 'var(--red)';

    // Citations detail
    const citDetail = pg.citationScore !== undefined
      ? `Citation Score: ${pg.citationScore}/100 (${pg.authorityLinkCount || 0} authority links, ${pg.externalLinkCount || 0} external links, ${pg.citationPhraseCount || 0} citation phrases)`
      : 'No citation data available — run a full page audit.';

    const citReadinessHtml = `
      <div style="margin-top:18px;padding:14px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:8px">
        <div class="sec-title" style="margin-bottom:10px">AI Citation Readiness</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
          <div style="font-size:40px;font-weight:800;font-family:var(--mono);color:${readinessColor}">${readinessScore}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px">
              ${readinessScore >= 70 ? 'High Citation Readiness' : readinessScore >= 40 ? 'Moderate Citation Readiness' : 'Low Citation Readiness'}
            </div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text3)">${citDetail}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-family:var(--mono);font-size:10px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Why AI May Cite This Page</div>
            ${positiveSignals.length
              ? positiveSignals.map(s => `<div style="font-family:var(--mono);font-size:11px;color:var(--green);padding:3px 0;border-bottom:1px solid var(--border)">${s}</div>`).join('')
              : '<div style="font-family:var(--mono);font-size:11px;color:var(--text3)">No positive signals detected.</div>'
            }
          </div>
          <div>
            <div style="font-family:var(--mono);font-size:10px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Why AI May Not Cite This Page</div>
            ${negativeSignals.length
              ? negativeSignals.map(s => `<div style="font-family:var(--mono);font-size:11px;color:var(--red);padding:3px 0;border-bottom:1px solid var(--border)">${s}</div>`).join('')
              : '<div style="font-family:var(--mono);font-size:11px;color:var(--green)">No blocking signals found — strong citation candidate.</div>'
            }
          </div>
        </div>
      </div>`;

    wrap.insertAdjacentHTML('beforeend', citReadinessHtml);

    // Animate bars
    setTimeout(() => {
      wrap.querySelectorAll('.afill').forEach(f => {
        f.style.width = f.dataset.t || '0%';
      });
    }, 100);
  };
})();

/* ══════════════════════════════════════
   ROBOTS INTELLIGENCE ENGINE
   AuditForge.robots
   Extends window._lastRobots, does NOT
   replace fetchRobotsTxt()
   ══════════════════════════════════════ */
AuditForge.robots = {

  parse(content) {
    if (!content) return { agents: {}, sitemaps: [], errors: [] };
    const lines = content.split('\n').map(l => l.trim());
    const agents = {};
    let currentAgent = null;
    const sitemaps = [];
    const errors = [];
    const seen = {};

    lines.forEach((line, i) => {
      if (!line || line.startsWith('#')) return;
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) { errors.push(`Line ${i+1}: Invalid syntax — "${line}"`); return; }

      const key   = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (key === 'user-agent') {
        currentAgent = value;
        if (!agents[currentAgent]) agents[currentAgent] = { disallow: [], allow: [], crawlDelay: null };
      } else if (key === 'disallow' && currentAgent) {
        const sig = `disallow:${currentAgent}:${value}`;
        if (seen[sig]) errors.push(`Duplicate Disallow: "${value}" for ${currentAgent}`);
        seen[sig] = true;
        agents[currentAgent].disallow.push(value);
      } else if (key === 'allow' && currentAgent) {
        agents[currentAgent].allow.push(value);
      } else if (key === 'crawl-delay' && currentAgent) {
        agents[currentAgent].crawlDelay = parseFloat(value);
      } else if (key === 'sitemap') {
        sitemaps.push(value);
      }
    });

    return { agents, sitemaps, errors };
  },

  analyze(robotsData) {
    const issues = [];
    const content = (robotsData && robotsData.content) || '';
    const parsed = this.parse(content);
    const { agents, sitemaps, errors } = parsed;

    if (!robotsData || !robotsData.found) {
      issues.push({
        severity: 'critical',
        ico: '🔴',
        title: 'robots.txt Missing',
        detail: 'No robots.txt found at domain root. Search engines may crawl everything including unwanted paths.',
        why: 'robots.txt is the primary mechanism to control crawler access and declare sitemaps.',
        gain: '+8 Technical SEO'
      });
      return { issues, score: 20, parsed };
    }

    // Syntax errors
    errors.forEach(err => {
      issues.push({
        severity: 'warning',
        ico: '🟡',
        title: 'Syntax Issue in robots.txt',
        detail: err,
        why: 'Malformed robots.txt directives may be ignored by crawlers.',
        gain: '+3 Technical SEO'
      });
    });

    const allAgents = agents['*'] || { disallow: [], allow: [], crawlDelay: null };

    // Disallow all
    if (allAgents.disallow.includes('/')) {
      issues.push({
        severity: 'critical',
        ico: '🔴',
        title: 'Disallow: / — Site Completely Blocked',
        detail: 'User-agent: * has Disallow: / which blocks ALL search engine crawling.',
        why: 'This single directive prevents Google, Bing, and all bots from indexing your site.',
        gain: '+25 Technical SEO'
      });
    }

    // Wildcard detection
    const hasWildcard = Object.keys(agents).includes('*');
    if (!hasWildcard) {
      issues.push({
        severity: 'opportunity',
        ico: '🔵',
        title: 'No Universal User-Agent Rule',
        detail: 'No "User-agent: *" block found. Rules only apply to explicitly named bots.',
        why: 'Without a wildcard block, unrecognized crawlers are unconstrained.',
        gain: '+3 Technical SEO'
      });
    } else {
      issues.push({ severity: 'passed', ico: '✅', title: 'Universal User-Agent Block Present', detail: 'User-agent: * block found.', why: '', gain: '' });
    }

    // CSS blocking
    const cssBlocked = allAgents.disallow.some(p => /\.css|\/css\//i.test(p));
    if (cssBlocked) {
      issues.push({
        severity: 'critical',
        ico: '🔴',
        title: 'CSS Files Blocked from Crawlers',
        detail: 'A Disallow rule is preventing crawlers from accessing CSS files.',
        why: 'Google needs CSS to render pages for indexing. Blocking it hurts rankings.',
        gain: '+10 Technical SEO'
      });
    }

    // JS blocking
    const jsBlocked = allAgents.disallow.some(p => /\.js|\/js\//i.test(p));
    if (jsBlocked) {
      issues.push({
        severity: 'critical',
        ico: '🔴',
        title: 'JavaScript Files Blocked',
        detail: 'JavaScript resources are disallowed. Google cannot fully render your pages.',
        why: 'Blocking JS severely impacts Google\'s ability to understand and rank your content.',
        gain: '+12 Technical SEO'
      });
    }

    // Image blocking
    const imgBlocked = allAgents.disallow.some(p => /\.(jpg|jpeg|png|gif|webp|svg)|\/images?\//i.test(p));
    if (imgBlocked) {
      issues.push({
        severity: 'warning',
        ico: '🟡',
        title: 'Images Blocked from Crawlers',
        detail: 'Image paths are disallowed, preventing Google Image indexing.',
        why: 'Image search is a significant traffic source. Blocking images reduces visibility.',
        gain: '+5 Technical SEO'
      });
    }

    // Crawl-delay detection
    const crawlDelays = Object.entries(agents)
      .filter(([, v]) => v.crawlDelay !== null)
      .map(([agent, v]) => `${agent}: ${v.crawlDelay}s`);
    if (crawlDelays.length) {
      issues.push({
        severity: 'warning',
        ico: '🟡',
        title: 'Crawl-Delay Directive Found',
        detail: `Crawl delay set for: ${crawlDelays.join(', ')}. Note: Googlebot ignores this.`,
        why: 'Crawl-delay is respected by some bots (Bing) but not Google. Manage crawl budget in GSC instead.',
        gain: ''
      });
    }

    // Sitemap declaration
    if (!sitemaps.length) {
      issues.push({
        severity: 'warning',
        ico: '🟡',
        title: 'No Sitemap Declared',
        detail: 'robots.txt should include: Sitemap: https://yourdomain.com/sitemap.xml',
        why: 'Declaring your sitemap in robots.txt helps crawlers discover all pages faster.',
        gain: '+6 Technical SEO'
      });
    } else {
      issues.push({
        severity: 'passed',
        ico: '✅',
        title: `Sitemap Declared (${sitemaps.length})`,
        detail: sitemaps.join(', '),
        why: '',
        gain: ''
      });
    }

    // Multiple user agents
    const agentCount = Object.keys(agents).length;
    if (agentCount > 1) {
      issues.push({
        severity: 'passed',
        ico: '✅',
        title: `${agentCount} User-Agent Rules Configured`,
        detail: Object.keys(agents).join(', '),
        why: '',
        gain: ''
      });
    }

    // wp-admin / admin paths
    const adminBlocked = allAgents.disallow.some(p => /wp-admin|\/admin|\/dashboard/i.test(p));
    if (!adminBlocked) {
      issues.push({
        severity: 'opportunity',
        ico: '🔵',
        title: 'Admin Paths Not Explicitly Blocked',
        detail: 'Consider blocking /wp-admin/ or /admin/ from crawlers.',
        why: 'Admin URLs waste crawl budget and may expose sensitive route names.',
        gain: '+2 Technical SEO'
      });
    } else {
      issues.push({ severity: 'passed', ico: '✅', title: 'Admin Paths Blocked', detail: 'Administrative URLs excluded from crawling.', why: '', gain: '' });
    }

    // Compute score
    const criticals = issues.filter(i => i.severity === 'critical').length;
    const warnings  = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, Math.min(100, 100 - (criticals * 20) - (warnings * 8)));

    return { issues, score, parsed, sitemaps };
  },

  generateTxt({ userAgent='*', disallowPaths='', sitemapUrl='', crawlDelay='' }) {
    let out = `User-agent: ${userAgent || '*'}\n`;
    const paths = disallowPaths.split('\n').map(p => p.trim()).filter(Boolean);
    if (paths.length) {
      paths.forEach(p => { out += `Disallow: ${p}\n`; });
    } else {
      out += `Disallow:\n`;
    }
    if (crawlDelay) out += `Crawl-delay: ${crawlDelay}\n`;
    if (sitemapUrl) out += `\nSitemap: ${sitemapUrl}\n`;
    return out;
  }
};

/* ══════════════════════════════════════
   SITEMAP INTELLIGENCE ENGINE
   AuditForge.sitemap
   ══════════════════════════════════════ */
AuditForge.sitemap = {

  parseXML(xmlText) {
    if (!xmlText) return { urls: [], isIndex: false };
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const isIndex = !!doc.querySelector('sitemapindex');
    const urlNodes = [...doc.querySelectorAll('url')];
    const urls = urlNodes.map(u => ({
      loc:       (u.querySelector('loc')       || {}).textContent?.trim() || '',
      lastmod:   (u.querySelector('lastmod')   || {}).textContent?.trim() || '',
      changefreq:(u.querySelector('changefreq')|| {}).textContent?.trim() || '',
      priority:  parseFloat((u.querySelector('priority') || {}).textContent || '0.5')
    })).filter(u => u.loc);
    return { urls, isIndex };
  },

  analyze(sitemapData, crawledPages) {
    const issues = [];
    const crawledUrls = new Set((crawledPages || []).map(p => p.url.replace(/\/$/, '')));

    if (!sitemapData || !sitemapData.found) {
      return {
        score: 15,
        level: 'Critical',
        issues: [{ severity: 'critical', title: 'sitemap.xml Not Found', detail: 'No sitemap detected at /sitemap.xml.', gain: '+12 Technical SEO' }],
        urls: [],
        coverage: 0,
        orphans: [],
        inSitemapNotCrawled: []
      };
    }

    const { urls, isIndex } = this.parseXML(sitemapData.content || '');

    if (isIndex) {
      issues.push({ severity: 'passed', title: 'Sitemap Index Detected', detail: 'Site uses a sitemap index file.', gain: '' });
    }
    if (!urls.length && !isIndex) {
      issues.push({ severity: 'critical', title: 'Sitemap Has No URLs', detail: 'sitemap.xml was found but contains 0 <url> entries.', gain: '+8 Technical SEO' });
    }

    // Duplicate URLs
    const urlSeen = {};
    const duplicates = [];
    urls.forEach(u => {
      if (urlSeen[u.loc]) duplicates.push(u.loc);
      urlSeen[u.loc] = true;
    });
    if (duplicates.length) {
      issues.push({ severity: 'warning', title: `${duplicates.length} Duplicate URL(s) in Sitemap`, detail: duplicates.slice(0,3).join(', '), gain: '+3 Technical SEO' });
    }

    // Coverage analysis
    const sitemapUrlSet = new Set(urls.map(u => u.loc.replace(/\/$/, '')));
    const orphans = [...crawledUrls].filter(u => !sitemapUrlSet.has(u) && !u.includes('?'));
    const inSitemapNotCrawled = [...sitemapUrlSet].filter(u => !crawledUrls.has(u));
    const coverage = crawledUrls.size > 0
      ? Math.round(([...crawledUrls].filter(u => sitemapUrlSet.has(u)).length / crawledUrls.size) * 100)
      : 0;

    if (orphans.length) {
      issues.push({
        severity: 'warning',
        title: `${orphans.length} Orphan Page(s) Not in Sitemap`,
        detail: 'Crawled pages missing from sitemap.',
        gain: '+5 Technical SEO'
      });
    }

    // Missing lastmod
    const noLastmod = urls.filter(u => !u.lastmod).length;
    if (noLastmod > urls.length / 2) {
      issues.push({ severity: 'warning', title: 'Most URLs Missing lastmod', detail: `${noLastmod} URLs have no <lastmod> date.`, gain: '+2 Technical SEO' });
    }

    // Missing priority
    const defaultPriority = urls.filter(u => u.priority === 0.5).length;
    if (defaultPriority === urls.length && urls.length > 0) {
      issues.push({ severity: 'opportunity', title: 'All URLs Using Default Priority', detail: 'Differentiate URL priorities to guide crawler attention.', gain: '+2 Technical SEO' });
    }

    if (!issues.some(i => i.severity === 'critical')) {
      issues.push({ severity: 'passed', title: 'sitemap.xml Found and Valid', detail: `${urls.length} URLs indexed.`, gain: '' });
    }

    // Score
    const criticals = issues.filter(i => i.severity === 'critical').length;
    const warnings  = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, Math.min(100,
      (urls.length ? 40 : 0) +
      (coverage >= 80 ? 30 : coverage >= 50 ? 15 : 0) +
      (duplicates.length === 0 ? 15 : 0) +
      (orphans.length === 0 ? 15 : 0) -
      (criticals * 20) - (warnings * 5)
    ));

    const level = score >= 85 ? 'Excellent' : score >= 65 ? 'Good' : score >= 40 ? 'Needs Improvement' : 'Critical';

    return { score, level, issues, urls, coverage, orphans, inSitemapNotCrawled };
  },

 generateXML(urlList, baseUrl) {
    const date = new Date().toISOString().split('T')[0];

    const uniqueUrls = [...new Set(
      urlList.map(u => (u.url || u).replace(/\/$/, ''))
    )];

    // Escape special XML characters in URLs (& is the main risk)
    function xmlEscape(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    const urlEntries = uniqueUrls.map(rawLoc => {
      let isHome = false;
      let loc = rawLoc;
      try {
        const parsed = new URL(rawLoc);
        isHome = (parsed.pathname === '' || parsed.pathname === '/');
        loc = isHome ? (parsed.origin + '/') : rawLoc;
      } catch (e) {}

      const escapedLoc = xmlEscape(loc);
      const priority = isHome ? '1.00' : '0.90';

      return [
        '  <url>',
        '    <loc>' + escapedLoc + '</loc>',
        '    <lastmod>' + date + '</lastmod>',
        '    <changefreq>weekly</changefreq>',
        '    <priority>' + priority + '</priority>',
        '  </url>'
      ].join('\n');
    }).join('\n');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urlEntries,
      '</urlset>'
    ].join('\n');
  }
};
/* ══════════════════════════════════════
   RECOMMENDATIONS ENGINE
   AuditForge.recommendations
   Extends (does not replace) getIssues()
   ══════════════════════════════════════ */
AuditForge.recommendations = {

  _cache: null,

  build(pg) {
    if (!pg) return [];
    _ensureExtended(pg);

    const recs = [];
    const scores = AuditForge.scores.compute(pg) || {};

    // Helper
    function rec(obj) { recs.push(obj); }

    // ── Technical SEO ──
    if (!pg.title) rec({
      title: 'Add a Title Tag',
      severity: 'critical', category: 'Technical SEO', impact: 'Critical',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+18 SEO',
      explanation: 'Missing title tag is the single most damaging on-page SEO issue. Google uses the title as the primary ranking signal and CTR driver in search results.',
      action: 'Add <title>Your Page Title – Brand Name</title> inside the <head>. Keep it 50–60 characters.'
    });
    else if (pg.title.length > 60) rec({
      title: 'Shorten Title Tag',
      severity: 'high', category: 'Technical SEO', impact: 'High',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+6 SEO',
      explanation: `Title is ${pg.title.length} characters. Google truncates titles beyond ~600px (~60 chars), reducing CTR.`,
      action: 'Edit the title to under 60 characters while keeping the primary keyword near the start.'
    });

    if (!pg.desc) rec({
      title: 'Add Meta Description',
      severity: 'high', category: 'Technical SEO', impact: 'High',
      difficulty: 'Easy', estimatedTime: '10 minutes', potentialGain: '+12 SEO',
      explanation: 'Pages without meta descriptions lose up to 30% CTR. Google may auto-generate one from body content, often poorly.',
      action: 'Write a unique 120–160 character description that summarizes the page and includes the target keyword.'
    });
    else if (pg.desc.length > 160) rec({
      title: 'Shorten Meta Description',
      severity: 'medium', category: 'Technical SEO', impact: 'Medium',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+4 SEO',
      explanation: `Description is ${pg.desc.length} characters. Google truncates at ~920px (~160 chars).`,
      action: 'Trim to 120–160 characters. Lead with the most important information.'
    });

    if (!pg.h1s || !pg.h1s.length) rec({
      title: 'Add H1 Heading',
      severity: 'critical', category: 'Technical SEO', impact: 'Critical',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+14 SEO',
      explanation: 'Missing H1 is a fundamental SEO error. Search engines use H1 as a primary content signal alongside the title tag.',
      action: 'Add exactly one <h1> per page containing the primary keyword. It should match user search intent.'
    });
    else if (pg.h1s.length > 1) rec({
      title: 'Remove Duplicate H1 Tags',
      severity: 'high', category: 'Technical SEO', impact: 'High',
      difficulty: 'Easy', estimatedTime: '10 minutes', potentialGain: '+8 SEO',
      explanation: `Found ${pg.h1s.length} H1 tags. Multiple H1s dilute the heading signal and confuse both crawlers and users.`,
      action: 'Keep only one H1. Change additional H1s to H2 or H3 where appropriate.'
    });

    if (!pg.canonical) rec({
      title: 'Add Canonical Tag',
      severity: 'medium', category: 'Technical SEO', impact: 'Medium',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+5 SEO',
      explanation: 'Without a canonical tag, Google may index duplicate versions of your page (www vs non-www, trailing slash, etc.).',
      action: 'Add <link rel="canonical" href="https://yourdomain.com/page/"> in the <head>.'
    });

    if (window._lastRobots && !window._lastRobots.found) rec({
      title: 'Create robots.txt',
      severity: 'high', category: 'Technical SEO', impact: 'High',
      difficulty: 'Easy', estimatedTime: '10 minutes', potentialGain: '+8 SEO',
      explanation: 'robots.txt controls crawler access and declares your sitemap. Missing it is an oversight that affects crawl efficiency.',
      action: 'Create /robots.txt with at minimum: User-agent: * and Sitemap: https://yourdomain.com/sitemap.xml'
    });

    if (window._lastSitemap && !window._lastSitemap.found) rec({
      title: 'Create sitemap.xml',
      severity: 'high', category: 'Technical SEO', impact: 'High',
      difficulty: 'Easy', estimatedTime: '15 minutes', potentialGain: '+10 SEO',
      explanation: 'A sitemap ensures all pages are discoverable by search engines, even those with few internal links.',
      action: 'Generate a sitemap.xml using the Sitemap tool in AuditForge and submit it to Google Search Console.'
    });

    if (pg.robots && /noindex/i.test(pg.robots)) rec({
      title: 'Remove Noindex Directive',
      severity: 'critical', category: 'Technical SEO', impact: 'Critical',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+15 SEO',
      explanation: 'This page has a noindex directive. Google will NOT include it in search results.',
      action: 'Remove the noindex tag unless you intentionally want this page excluded from Google. Check robots meta and X-Robots-Tag headers.'
    });

    // ── Content Quality ──
    const wc = pg.wordCount || 0;
    if (wc < 300) rec({
      title: 'Increase Content Length',
      severity: wc < 100 ? 'critical' : 'high', category: 'Content',
      impact: wc < 100 ? 'Critical' : 'High', difficulty: 'Advanced',
      estimatedTime: 'Multiple hours', potentialGain: wc < 100 ? '+25 Content' : '+15 Content',
      explanation: `Page has only ${wc} words. Thin content rarely ranks. Most top-ranking pages exceed 1,000 words for competitive topics.`,
      action: 'Expand with relevant, useful information. Cover subtopics, FAQs, and supporting details that serve user intent.'
    });

    if (!pg.hasLists) rec({
      title: 'Add Lists for Scannability',
      severity: 'medium', category: 'Content', impact: 'Medium',
      difficulty: 'Easy', estimatedTime: '15 minutes', potentialGain: '+5 Content',
      explanation: 'Lists (ul/ol) break up content and are frequently used in Google Featured Snippets.',
      action: 'Convert any steps, features, or grouped items into bulleted or numbered lists.'
    });

    if (!pg.faqCount || pg.faqCount < 2) rec({
      title: 'Add FAQ Section',
      severity: 'high', category: 'Content', impact: 'High',
      difficulty: 'Medium', estimatedTime: '30 minutes', potentialGain: '+8 AI + +8 Content',
      explanation: 'FAQ sections increase AI citation likelihood, improve Featured Snippet chances, and match conversational search queries.',
      action: 'Add 5–10 question-and-answer pairs addressing common user questions. Combine with FAQPage schema.'
    });

    if (pg.readability && pg.readability.flesch < 50) rec({
      title: 'Improve Content Readability',
      severity: 'medium', category: 'Content', impact: 'Medium',
      difficulty: 'Advanced', estimatedTime: '1 hour', potentialGain: '+10 Content',
      explanation: `Flesch score: ${pg.readability.flesch}/100. Difficult to read content increases bounce rate and reduces engagement.`,
      action: 'Shorten sentences to under 20 words. Replace jargon with plain language. Use active voice.'
    });

    // ── Accessibility ──
    if (pg.missingAlt > 0) rec({
      title: `Fix ${pg.missingAlt} Missing Alt Text(s)`,
      severity: 'high', category: 'Accessibility', impact: 'High',
      difficulty: 'Easy', estimatedTime: pg.missingAlt <= 5 ? '15 minutes' : '30 minutes',
      potentialGain: `-${Math.min(20, pg.missingAlt*3)} removed from score + image SEO`,
      explanation: 'Images without alt text are invisible to screen readers and miss image search ranking opportunities.',
      action: 'Add descriptive alt attributes to all meaningful images. Decorative images can use alt="".'
    });

    if (!pg.hasLangAttr) rec({
      title: 'Add lang Attribute to <html>',
      severity: 'medium', category: 'Accessibility', impact: 'Medium',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+8 Accessibility',
      explanation: 'The lang attribute helps screen readers use the correct language pronunciation and aids search engines.',
      action: 'Add lang="en" (or your language code) to the <html> tag: <html lang="en">'
    });

    if (!pg.hasSemantic) rec({
      title: 'Use Semantic HTML Landmarks',
      severity: 'medium', category: 'Accessibility', impact: 'Medium',
      difficulty: 'Medium', estimatedTime: '30 minutes', potentialGain: '+10 Accessibility + +9 AI',
      explanation: 'Semantic elements (main, nav, header, footer, article) improve accessibility and AI/crawler understanding.',
      action: 'Wrap your content in semantic HTML5 elements. Replace generic <div> containers with meaningful tags.'
    });

    // ── Schema Health ──
    if (!pg.hasSchema) rec({
      title: 'Add JSON-LD Structured Data',
      severity: 'high', category: 'Schema', impact: 'High',
      difficulty: 'Medium', estimatedTime: '30 minutes', potentialGain: '+40 Schema + +12 AI',
      explanation: 'Structured data enables Rich Results in Google (stars, FAQs, breadcrumbs) and improves AI citation likelihood.',
      action: 'Use the Schema Builder in AuditForge to generate and add Organization or Article JSON-LD to your page.'
    });
    else if (!pg.hasFAQSchema) rec({
      title: 'Add FAQPage Schema',
      severity: 'medium', category: 'Schema', impact: 'Medium',
      difficulty: 'Medium', estimatedTime: '20 minutes', potentialGain: '+20 Schema',
      explanation: 'FAQPage schema can trigger accordion rich results in Google, doubling your SERP real estate.',
      action: 'Add FAQPage JSON-LD listing your question/answer pairs. Minimum 2 FAQs required.'
    });

    if (!pg.hasBreadcrumbSchema) rec({
      title: 'Add BreadcrumbList Schema',
      severity: 'low', category: 'Schema', impact: 'Low',
      difficulty: 'Easy', estimatedTime: '15 minutes', potentialGain: '+10 Schema',
      explanation: 'Breadcrumb schema shows your site hierarchy in Google search results, improving click-through rate.',
      action: 'Add BreadcrumbList JSON-LD reflecting your page hierarchy (Home > Category > Page).'
    });

    // ── Social Optimization ──
    if (!pg.ogTitle || !pg.ogDesc || !pg.ogImage) rec({
      title: 'Add Open Graph Tags',
      severity: 'medium', category: 'Social', impact: 'High',
      difficulty: 'Easy', estimatedTime: '15 minutes', potentialGain: '+35–55 Social',
      explanation: 'Open Graph tags control how your page appears when shared on Facebook, LinkedIn, and Slack. Missing them results in ugly, unbranded previews.',
      action: 'Add og:title, og:description, og:image, and og:type meta tags to your <head>.'
    });

    if (!pg.twitterCard) rec({
      title: 'Add Twitter Card Tags',
      severity: 'low', category: 'Social', impact: 'Medium',
      difficulty: 'Easy', estimatedTime: '10 minutes', potentialGain: '+15 Social',
      explanation: 'Twitter card tags define how your content appears in tweets. Without them, Twitter generates generic previews.',
      action: 'Add <meta name="twitter:card" content="summary_large_image"> along with twitter:title and twitter:image.'
    });

    // ── AI Visibility ──
    if (!pg.hasSchema) rec({
      title: 'Add Structured Data for AI Readiness',
      severity: 'high', category: 'AI Visibility', impact: 'High',
      difficulty: 'Medium', estimatedTime: '30 minutes', potentialGain: '+12 AI',
      explanation: 'LLMs use structured data to understand entity relationships and page purpose. Pages with schema are more likely to be cited.',
      action: 'Implement FAQPage, Article, or Organization schema to signal content structure to AI systems.'
    });

    if (pg.definitionCount < 2) rec({
      title: 'Add Clear Definitions',
      severity: 'medium', category: 'AI Visibility', impact: 'Medium',
      difficulty: 'Medium', estimatedTime: '30 minutes', potentialGain: '+10 AI',
      explanation: 'AI systems frequently extract and cite definitions. Content with clear "X is a..." patterns is more likely to appear in AI answers.',
      action: 'For key concepts on your page, add explicit definition sentences: "[Term] is a [type] that..."'
    });

    if (pg.citationCount < 1) rec({
      title: 'Add External Citations and Sources',
      severity: 'low', category: 'AI Visibility', impact: 'Medium',
      difficulty: 'Easy', estimatedTime: '20 minutes', potentialGain: '+8 AI',
      explanation: 'Pages that cite credible sources are seen as more authoritative by both search engines and AI systems.',
      action: 'Link to reputable sources (studies, official sites, statistics). Use <cite> and <blockquote> where appropriate.'
    });

    // ── Robots/Sitemap ──
    if (window._lastRobots && window._lastRobots.found && window._lastRobots.disallowAll) rec({
      title: 'Fix robots.txt: Disallow: / Blocking All Crawlers',
      severity: 'critical', category: 'Technical SEO', impact: 'Critical',
      difficulty: 'Easy', estimatedTime: '5 minutes', potentialGain: '+25 Technical SEO',
      explanation: 'Your robots.txt is blocking ALL search engines. This is the most severe SEO configuration error possible.',
      action: 'Remove or change "Disallow: /" in robots.txt. Only block specific paths you want excluded.'
    });

    // Sort: critical first, then by potential gain (parse number)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recs.sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
      if (sevDiff !== 0) return sevDiff;
      const gainA = parseInt((a.potentialGain || '').match(/\d+/) || 0);
      const gainB = parseInt((b.potentialGain || '').match(/\d+/) || 0);
      return gainB - gainA;
    });

    this._cache = recs;
    return recs.slice(0, 20);
  }
};

/* ══════════════════════════════════════
   REPLACE loadSuggestions()
   Renders enterprise recommendation cards
   Extends, does not touch original
   ══════════════════════════════════════ */
(function replaceLoadSuggestions() {
  window.loadSuggestions = function(pg) {
    const wrap = $('mod-suggestions');
    if (!wrap) return;
    if (!pg) { wrap.innerHTML = '<div class="grid-empty">No page data.</div>'; return; }

    const recs = AuditForge.recommendations.build(pg);
    if (!recs.length) {
      wrap.innerHTML = '<div class="ok-banner">✓ No urgent recommendations — this page is well optimized!</div>';
      return;
    }

    // State
    let searchVal = '';
    let activeFilter = 'all';
    let sortKey = 'severity';

    function render() {
      const filtered = recs.filter(r => {
        const matchSearch = !searchVal ||
          r.title.toLowerCase().includes(searchVal) ||
          r.category.toLowerCase().includes(searchVal) ||
          r.explanation.toLowerCase().includes(searchVal);
        const matchFilter = activeFilter === 'all' || r.category === activeFilter ||
          r.severity === activeFilter;
        return matchSearch && matchFilter;
      });

      const sorted = [...filtered].sort((a, b) => {
        if (sortKey === 'severity') {
          const so = {critical:0,high:1,medium:2,low:3};
          return (so[a.severity]||3)-(so[b.severity]||3);
        }
        if (sortKey === 'gain') {
          const ga = parseInt((a.potentialGain||'').match(/\d+/)||0);
          const gb = parseInt((b.potentialGain||'').match(/\d+/)||0);
          return gb - ga;
        }
        if (sortKey === 'difficulty') {
          const do_ = {Easy:0,Medium:1,Advanced:2};
          return (do_[a.difficulty]||1)-(do_[b.difficulty]||1);
        }
        return 0;
      });

      const categories = [...new Set(recs.map(r => r.category))];
      const filterBtns = ['all', ...categories].map(f =>
        `<button class="rec-filter ${activeFilter===f?'active':''}" data-filter="${f}">${f==='all'?'All':f}</button>`
      ).join('');

      const cards = sorted.length ? sorted.map((r, idx) => `
        <div class="rec-card" data-idx="${idx}">
          <div class="rec-card-header">
            <span class="rec-severity ${r.severity}">${r.severity.toUpperCase()}</span>
            <span class="rec-category">${r.category}</span>
            <span class="rec-title">${r.title}</span>
            ${r.potentialGain ? `<span class="rec-gain">${r.potentialGain}</span>` : ''}
          </div>
          <div class="rec-body">${r.explanation}</div>
          <div class="rec-action">→ ${r.action}</div>
          <div class="rec-meta">
            <span class="rec-meta-item">⏱ Time: <span>${r.estimatedTime}</span></span>
            <span class="rec-meta-item">💪 Difficulty: <span>${r.difficulty}</span></span>
            <span class="rec-meta-item">⚡ Impact: <span>${r.impact}</span></span>
          </div>
        </div>`).join('') : '<div class="rec-empty">No recommendations match your filter.</div>';

      wrap.innerHTML = `
        <div class="rec-controls">
          <input class="rec-search" id="recSearch" placeholder="Search recommendations…" value="${searchVal}">
          <select class="rec-sort" id="recSort">
            <option value="severity" ${sortKey==='severity'?'selected':''}>Sort: Severity</option>
            <option value="gain" ${sortKey==='gain'?'selected':''}>Sort: Potential Gain</option>
            <option value="difficulty" ${sortKey==='difficulty'?'selected':''}>Sort: Difficulty</option>
          </select>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${filterBtns}
        </div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:8px">
          Showing ${sorted.length} of ${recs.length} recommendations
        </div>
        <div class="rec-list">${cards}</div>`;

      // Wire controls
      const si = $('recSearch');
      if (si) si.addEventListener('input', e => { searchVal = e.target.value.toLowerCase().trim(); render(); });

      const ss = $('recSort');
      if (ss) ss.addEventListener('change', e => { sortKey = e.target.value; render(); });

      wrap.querySelectorAll('.rec-filter').forEach(btn => {
        btn.addEventListener('click', () => { activeFilter = btn.dataset.filter; render(); });
      });
    }

    render();
  };
})();

/* ══════════════════════════════════════
   ROBOTS & SITEMAP PANEL — loadRobotsSitemap()
   Replaces the existing stub that
   referenced a missing DOM node.
   ══════════════════════════════════════ */
(function replaceLoadRobotsSitemap() {
  window.loadRobotsSitemap = function(pg) {
    const wrap = $('mod-robots');
    if (!wrap) return;

    const robotsData  = window._lastRobots  || { found: false, content: '' };
    const sitemapData = window._lastSitemap || { found: false };
    const robotsAnalysis  = AuditForge.robots.analyze(robotsData);
    const sitemapAnalysis = AuditForge.sitemap.analyze(sitemapData, pages);

    const rHealth = robotsAnalysis.score;
    const rColor  = rHealth >= 80 ? 'var(--green)' : rHealth >= 50 ? 'var(--amber)' : 'var(--red)';

    const sHealth = sitemapAnalysis.score;
    const sLevel  = sitemapAnalysis.level || 'Critical';
    const sColor  = sHealth >= 85 ? 'var(--green)' : sHealth >= 65 ? 'var(--blue)' : sHealth >= 40 ? 'var(--amber)' : 'var(--red)';
    const sLevelCls = sLevel.toLowerCase().replace(' ', '-');

    // Robots issues HTML
    const robotsIssueHtml = robotsAnalysis.issues.map(i => `
      <div class="robots-issue-item ${i.severity}">
        <span class="robots-issue-ico">${i.ico}</span>
        <div class="robots-issue-body">
          <div class="robots-issue-title">${i.title}</div>
          <div class="robots-issue-detail">${i.detail}</div>
          ${i.why ? `<div class="robots-issue-detail" style="margin-top:3px;color:var(--text2)">${i.why}</div>` : ''}
        </div>
        ${i.gain ? `<span class="robots-issue-gain">${i.gain}</span>` : ''}
      </div>`).join('');

    // Sitemap issues HTML
    const sitIssueIco = { critical:'🔴', warning:'🟡', opportunity:'🔵', passed:'✅' };
    const sitemapIssueHtml = sitemapAnalysis.issues.map(i => `
      <div class="robots-issue-item ${i.severity||'passed'}">
        <span class="robots-issue-ico">${sitIssueIco[i.severity]||'ℹ'}</span>
        <div class="robots-issue-body">
          <div class="robots-issue-title">${i.title}</div>
          <div class="robots-issue-detail">${i.detail}</div>
        </div>
        ${i.gain ? `<span class="robots-issue-gain">${i.gain}</span>` : ''}
      </div>`).join('');

    // URL coverage table
    const urlTableRows = sitemapAnalysis.urls.slice(0, 15).map(u => {
      const isCrawled = pages.some(p => p.url.replace(/\/$/,'') === u.loc.replace(/\/$/,''));
      const badge = isCrawled
        ? '<span class="sitemap-url-badge" style="background:var(--green-dim);color:var(--green);border:1px solid rgba(16,185,129,.2)">Crawled</span>'
        : '<span class="sitemap-url-badge" style="background:var(--border);color:var(--text3)">Not Crawled</span>';
      const path = u.loc.replace(/https?:\/\/[^/]+/, '') || '/';
      return `<div class="sitemap-url-row">
        <span class="sitemap-url-path" title="${u.loc}">${path}</span>
        ${u.lastmod ? `<span style="font-family:var(--mono);font-size:10px;color:var(--text3)">${u.lastmod}</span>` : ''}
        ${badge}
      </div>`;
    }).join('');

    // Orphan list
    const orphanHtml = sitemapAnalysis.orphans.slice(0, 8).map(u =>
      `<div class="sitemap-url-row">
        <span class="sitemap-url-path" title="${u}">${u.replace(/https?:\/\/[^/]+/,'')}</span>
        <span class="sitemap-url-badge" style="background:var(--amber-dim);color:var(--amber);border:1px solid rgba(245,158,11,.2)">Orphan</span>
      </div>`
    ).join('');

    wrap.innerHTML = `
      <!-- ── ROBOTS SECTION ── -->
      <div class="sec-title" style="margin-bottom:10px">robots.txt Analysis</div>

      <div class="robots-health-bar">
        <span class="robots-health-label">Robots Health</span>
        <div class="robots-health-track">
          <div class="robots-health-fill" style="width:0%;background:${rColor}" id="robotsHealthFill"></div>
        </div>
        <span class="robots-health-score" style="color:${rColor}">${rHealth}/100</span>
      </div>

      ${robotsData.found && robotsData.content ? `
        <div style="margin-bottom:10px">
          <div style="font-family:var(--mono);font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px">Content Preview</div>
          <div class="robots-pre">${robotsData.content.slice(0, 800).replace(/</g,'&lt;')}</div>
        </div>` : ''}

      <div class="robots-issue-list">${robotsIssueHtml}</div>

      <!-- ── robots.txt GENERATOR ── -->
      <div class="robots-generator">
        <div class="robots-gen-title">🛠 robots.txt Generator</div>
        <div class="robots-gen-fields">
          <div class="robots-gen-field">
            <label>User-Agent</label>
            <input id="rgenAgent" value="*" placeholder="* or Googlebot">
          </div>
          <div class="robots-gen-field">
            <label>Sitemap URL</label>
            <input id="rgenSitemap" placeholder="https://yourdomain.com/sitemap.xml">
          </div>
          <div class="robots-gen-field" style="grid-column:1/-1">
            <label>Disallow Paths (one per line)</label>
            <textarea id="rgenDisallow" rows="3" style="width:100%;background:var(--bg);border:1px solid var(--border2);border-radius:4px;padding:7px 10px;color:var(--text);font-family:var(--mono);font-size:11px;resize:vertical" placeholder="/admin/\n/wp-admin/\n/private/"></textarea>
          </div>
          <div class="robots-gen-field">
            <label>Crawl-Delay (optional)</label>
            <input id="rgenDelay" type="number" placeholder="e.g. 1" min="0" max="60">
          </div>
        </div>
        <pre class="robots-gen-output" id="robotsGenOutput">User-agent: *\nDisallow:\n</pre>
        <div class="robots-gen-btns">
          <button class="exec-btn" style="padding:8px 16px;font-size:12px" onclick="AuditForge._updateRobotsGen()">Generate</button>
          <button class="exp-btn" onclick="AuditForge._copyRobots()">Copy</button>
          <button class="exp-btn" onclick="AuditForge._downloadRobots()">Download</button>
          <button class="exp-btn" onclick="AuditForge._resetRobotsGen()">Reset</button>
        </div>
      </div>

      <div style="height:24px"></div>

      <!-- ── SITEMAP SECTION ── -->
      <div class="sec-title" style="margin-bottom:10px">sitemap.xml Intelligence</div>

      <div class="sitemap-health-card ${sLevelCls}">
        <div class="sitemap-health-icon">${sHealth>=85?'🟢':sHealth>=65?'🔵':sHealth>=40?'🟡':'🔴'}</div>
        <div class="sitemap-health-score-num" style="color:${sColor}">${sHealth}</div>
        <div>
          <div class="sitemap-health-label">${sLevel}</div>
          <div class="sitemap-health-sub">${sitemapAnalysis.urls.length} URLs · ${sitemapAnalysis.coverage}% crawl coverage</div>
        </div>
      </div>

      <div class="sitemap-coverage-grid">
        <div class="sitemap-cov-card">
          <div class="sitemap-cov-val" style="color:var(--green)">${sitemapAnalysis.urls.length}</div>
          <div class="sitemap-cov-label">URLs in Sitemap</div>
        </div>
        <div class="sitemap-cov-card">
          <div class="sitemap-cov-val" style="color:${sitemapAnalysis.coverage>=80?'var(--green)':'var(--amber)'}">${sitemapAnalysis.coverage}%</div>
          <div class="sitemap-cov-label">Coverage</div>
        </div>
        <div class="sitemap-cov-card">
          <div class="sitemap-cov-val" style="color:${sitemapAnalysis.orphans.length?'var(--amber)':'var(--green)'}">${sitemapAnalysis.orphans.length}</div>
          <div class="sitemap-cov-label">Orphan Pages</div>
        </div>
        <div class="sitemap-cov-card">
          <div class="sitemap-cov-val">${sitemapAnalysis.inSitemapNotCrawled.length}</div>
          <div class="sitemap-cov-label">Not Crawled</div>
        </div>
      </div>

      <div class="robots-issue-list" style="margin-bottom:12px">${sitemapIssueHtml}</div>

      ${sitemapAnalysis.urls.length ? `
        <div class="sec-title" style="margin-bottom:6px">Sitemap URLs</div>
        <div class="sitemap-url-list">${urlTableRows}</div>` : ''}

      ${sitemapAnalysis.orphans.length ? `
        <div class="sec-title" style="margin-top:12px;margin-bottom:6px">Orphan Pages (crawled but not in sitemap)</div>
        <div class="sitemap-url-list">${orphanHtml}</div>` : ''}

      <!-- ── SITEMAP GENERATOR ── -->
      <div class="sitemap-generator" style="margin-top:14px">
        <div class="robots-gen-title">🗺 sitemap.xml Generator</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text2);margin-bottom:8px">
          Generates a sitemap from your crawled pages (${pages.filter(p=>p.status===200).length} live pages).
        </div>
        <pre class="sitemap-gen-output" id="sitemapGenOutput"></pre>
        <div id="sitemapValidationMsg" style="display:none;margin-bottom:8px;padding:7px 12px;border-radius:5px;font-family:var(--mono);font-size:11px"></div>
        <div class="robots-gen-btns">
          <button class="exp-btn" onclick="AuditForge._copySitemap()">Copy XML</button>
          <button class="exp-btn" onclick="AuditForge._downloadSitemap()">Download XML</button>
        </div>
      </div>`;

    // Set sitemap content via textContent to prevent browser HTML-parsing the XML tags
    const sitemapPre = $('sitemapGenOutput');
    if (sitemapPre) {
      const xml = AuditForge._genSitemap();
      sitemapPre.textContent = xml;
      // Validate and show warning if malformed
      const validationMsg = $('sitemapValidationMsg');
      if (validationMsg) {
        const validation = AuditForge._validateSitemapXml(xml);
        if (!validation.valid) {
          validationMsg.style.display = 'block';
          validationMsg.style.background = 'var(--amber-dim)';
          validationMsg.style.border = '1px solid rgba(245,158,11,.3)';
          validationMsg.style.color = 'var(--amber)';
          validationMsg.textContent = '⚠ Sitemap validation: ' + validation.reason;
        } else {
          validationMsg.style.display = 'none';
        }
      }
    }
    // Animate health bar
    setTimeout(() => {
      const fill = $('robotsHealthFill');
      if (fill) fill.style.width = rHealth + '%';
    }, 100);
  };
})();

/* ── Robots generator helpers ── */
AuditForge._updateRobotsGen = function() {
  const out = $('robotsGenOutput'); if (!out) return;
  out.textContent = AuditForge.robots.generateTxt({
    userAgent:    ($('rgenAgent') || {}).value || '*',
    disallowPaths:($('rgenDisallow') || {}).value || '',
    sitemapUrl:   ($('rgenSitemap') || {}).value || '',
    crawlDelay:   ($('rgenDelay') || {}).value || ''
  });
};
AuditForge._copyRobots = function() {
  const out = $('robotsGenOutput'); if (!out) return;
  navigator.clipboard.writeText(out.textContent).then(() => showToast('Copied robots.txt'));
};
AuditForge._downloadRobots = function() {
  const out = $('robotsGenOutput'); if (!out) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.textContent], {type:'text/plain'}));
  a.download = 'robots.txt'; a.click();
};
AuditForge._resetRobotsGen = function() {
  ['rgenAgent','rgenDisallow','rgenSitemap','rgenDelay'].forEach(id => {
    const el = $(id); if (el) el.value = id === 'rgenAgent' ? '*' : '';
  });
  AuditForge._updateRobotsGen();
};

/* ── Sitemap generator helpers ── */
AuditForge._genSitemap = function() {
  const livePgs = pages.filter(p => p.status === 200);
  if (!livePgs.length) return '<!-- Run an audit first to generate a sitemap -->';
  return AuditForge.sitemap.generateXML(livePgs);
};

AuditForge._validateSitemapXml = function(xml) {
  if (!xml || !xml.trim()) return { valid: false, reason: 'Empty sitemap.' };
  if (!xml.includes('<?xml')) return { valid: false, reason: 'Missing XML declaration (<?xml version="1.0" encoding="UTF-8"?>).' };
  if (!xml.includes('<urlset')) return { valid: false, reason: 'Missing <urlset> root element.' };
  if (!xml.includes('</urlset>')) return { valid: false, reason: 'Missing closing </urlset> tag.' };
  if (!xml.includes('<loc>')) return { valid: false, reason: 'No <loc> elements found — sitemap contains no URLs.' };
  const locMatches = (xml.match(/<loc>/g) || []).length;
  const locCloseMatches = (xml.match(/<\/loc>/g) || []).length;
  if (locMatches !== locCloseMatches) return { valid: false, reason: `Mismatched <loc> tags (${locMatches} open, ${locCloseMatches} close).` };
  const urlMatches = (xml.match(/<url>/g) || []).length;
  const urlCloseMatches = (xml.match(/<\/url>/g) || []).length;
  if (urlMatches !== urlCloseMatches) return { valid: false, reason: `Mismatched <url> tags (${urlMatches} open, ${urlCloseMatches} close).` };
  // Check all locs are absolute URLs
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim());
  const nonAbsolute = locs.filter(l => !l.startsWith('http'));
  if (nonAbsolute.length) return { valid: false, reason: `${nonAbsolute.length} <loc> value(s) are not absolute URLs.` };
  return { valid: true, reason: `Valid — ${urlMatches} URL(s)` };
};

AuditForge._copySitemap = function() {
  // Read from the pre element (single source of truth — set via textContent)
  const out = $('sitemapGenOutput');
  if (!out) return;
  const xml = out.textContent;
  const validation = AuditForge._validateSitemapXml(xml);
  if (!validation.valid) {
    showToast('⚠ Sitemap XML invalid: ' + validation.reason);
    return;
  }
  navigator.clipboard.writeText(xml).then(() => showToast('✓ Sitemap XML copied (' + validation.reason + ')'));
};

AuditForge._downloadSitemap = function() {
  // Read from the pre element to guarantee preview and download are identical
  const out = $('sitemapGenOutput');
  const xml = out ? out.textContent : AuditForge._genSitemap();
  const validation = AuditForge._validateSitemapXml(xml);
  if (!validation.valid) {
    showToast('⚠ Cannot download: ' + validation.reason);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml; charset=utf-8' }));
  a.download = 'sitemap.xml';
  a.click();
};


/* ══════════════════════════════════════
   HOOK: openInspector extension
   Wrap to ensure _ensureExtended runs
   and robots/sitemap tab is wired
   ══════════════════════════════════════ */
(function hookOpenInspector() {
  const _orig = window.openInspector;
  window.openInspector = function(id) {
    _orig(id);
    // After original runs, extend the current page
    const pg = pages.find(p => p.id === id);
    if (pg) {
      _ensureExtended(pg);
      // If robots tab is already active, render it
      const robotsPane = $('mod-robots');
      if (robotsPane && robotsPane.classList.contains('active')) {
        loadRobotsSitemap(pg);
      }
    }
  };
})();

/* Wire robots tab click to also call loadRobotsSitemap */
(function wireRobotsTab() {
  // Wait for DOM ready (script runs at end of body)
  const robotsTab = document.querySelector('.mtab[data-mod="robots"]');
  if (robotsTab) {
    robotsTab.addEventListener('click', () => {
      if (curPage) loadRobotsSitemap(curPage);
    });
  }
})();

/* ══════════════════════════════════════
   EXTEND: getIssues() — wrap to add
   social/accessibility/AI issues
   without replacing existing logic
   ══════════════════════════════════════ */
(function extendGetIssues() {
  const _orig = window.getIssues || getIssues;
  window.getIssues = function(pg) {
    const base = _orig(pg);
    if (!pg) return base;
    _ensureExtended(pg);

    const extra = [];

    // Social issues
    if (!pg.ogTitle) extra.push({ sev:'medium', ico:'🔵', title:'Missing og:title', detail:'No Open Graph title tag found.', fix:'Add <meta property="og:title" content="Your Title"> to <head>.' });
    if (!pg.ogImage) extra.push({ sev:'medium', ico:'🔵', title:'Missing og:image', detail:'No Open Graph image defined.', fix:'Add <meta property="og:image" content="https://yoursite.com/og-image.png">.' });
    if (!pg.twitterCard) extra.push({ sev:'low', ico:'⚪', title:'Missing Twitter Card', detail:'No twitter:card meta tag found.', fix:'Add <meta name="twitter:card" content="summary_large_image">.' });

    // Accessibility
    if (!pg.hasLangAttr) extra.push({ sev:'medium', ico:'🔵', title:'Missing lang Attribute', detail:'The <html> element has no lang attribute.', fix:'Add lang="en" to your <html> tag.' });
     
    // AI
    if (!pg.faqCount || pg.faqCount < 2) extra.push({ sev:'medium', ico:'🔵', title:'No FAQ Content Detected', detail:'Pages with FAQ sections rank better and are cited more by AI systems.', fix:'Add a Frequently Asked Questions section with at least 5 Q&A pairs.' });
    if (pg.definitionCount < 1) extra.push({ sev:'low', ico:'⚪', title:'No Definition Patterns', detail:'AI systems extract definitions. Pages with clear definitions are cited more often.', fix:'Add "X is a..." or "X refers to..." patterns for key terms.' });

 // Duplicate title/H1 across pages
    getDuplicateTitleIssues().forEach(i => extra.push(i));

    // Orphan pages (cross-page signal)
    getOrphanPageIssues().forEach(i => extra.push(i));

    // Canonical validation
    if (!pg.canonicalValidation && pg.canonical !== undefined) {
      pg.canonicalValidation = validateCanonical(pg, pg.allCanonicals || (pg.canonical ? [pg.canonical] : []));
    }
    if (pg.canonicalValidation) {
      pg.canonicalValidation.findings.forEach(f => {
        if (f.severity === 'info') return; // self-referencing is fine
        extra.push({
          sev: f.severity === 'critical' ? 'critical' : f.severity === 'medium' ? 'medium' : 'low',
          ico: f.severity === 'critical' ? '🔴' : '🔵',
          title: f.title, detail: f.detail,
          fix: f.fix || 'Review canonical configuration.'
        });
      });
    }

    // Indexability
    const indexability = analyzeIndexability(pg);

    if (!indexability.indexable) {
      indexability.reasons.filter(r => r.verdict === 'NO').forEach(r => {
        extra.push({ sev:'critical', ico:'🔴', title:'Page Not Indexable', detail:r.reason, fix:'Resolve this issue to allow search engines to index this page.' });
      });
    }
    indexability.reasons.filter(r => r.verdict === 'WARN').forEach(r => {
      extra.push({ sev:'medium', ico:'🔵', title:'Indexability Warning', detail:r.reason, fix:'Verify the canonical URL is intentional. If so, ensure the canonical page is fully optimized.' });
    });

// Store on pg for display elsewhere
    pg._indexability = indexability;

// Near duplicate content
    const dupCandidates = (window._nearDuplicates || {})[pg.url];
    if (dupCandidates && dupCandidates.length) {
      const best = dupCandidates.sort((a,b)=>b.overlap-a.overlap)[0];
      extra.push({sev:'medium',ico:'🔵',title:'Near Duplicate Content',detail:`${best.overlap}% keyword overlap with ${best.url.replace(/https?:\/\/[^/]+/,'')||'/'}. ${dupCandidates.length} similar page(s) detected. May cause keyword cannibalization.`,fix:'Consolidate overlapping pages via 301 redirect or canonical tag, or differentiate content to target distinct keywords.'});
    }

    // Canonical chain / loop / broken
    const canIssue = (window._canonicalIssues || {})[pg.url];
    if (canIssue) {
      if (canIssue.type === 'loop') {
        extra.push({sev:'critical',ico:'🔴',title:'Canonical Loop Detected',detail:`This page canonicals to ${canIssue.target}, which canonicals back to this page (A→B→A loop). Google ignores looped canonicals.`,fix:'Set a single authoritative URL and point all canonicals to it directly.'});
      } else if (canIssue.type === 'chain') {
        extra.push({sev:'high',ico:'🟠',title:'Canonical Chain Detected',detail:`This page canonicals to ${canIssue.target}, which itself canonicals to ${canIssue.finalTarget} (A→B→C chain). Google may not follow chains.`,fix:'Update this page\'s canonical to point directly to the final destination: '+canIssue.finalTarget});
      } else if (canIssue.type === 'uncrawled') {
        extra.push({sev:'medium',ico:'🔵',title:'Canonical Points to Uncrawled URL',detail:`Canonical target ${canIssue.target} was not found in the crawl. It may be external, redirected, or missing.`,fix:'Verify the canonical URL is live and accessible. Use Paste mode to audit it directly.'});
      }
    }

    // Redirect chain
    if ((pg.redirectHops || 0) >= 2) {      extra.push({sev:'high',ico:'🟠',title:'Redirect Chain Detected',detail:`${pg.redirectHops} redirect hop(s) detected before reaching this URL. Chains dilute PageRank and slow page load.`,fix:'Update all internal links and sitemap entries to point directly to the final destination URL. Collapse the redirect chain to a single 301.'});
    }

// E-E-A-T
    const eeatScore = pg.eeatScore !== undefined ? pg.eeatScore : 0;
    if (eeatScore < 40 && pg.status === 200 && (pg.wordCount || 0) > 200) {
      const missing = [];
      const e = pg.eeat || {};
      if (!e.hasAuthorSchema && !e.hasAuthorRel && !e.bylineFound) missing.push('author attribution');
      if (!e.hasDatePublished) missing.push('datePublished');
      if (!e.hasPersonSchema)  missing.push('Person schema');
      extra.push({sev:'medium',ico:'🔵',title:'Weak E-E-A-T Signals',detail:`E-E-A-T score: ${eeatScore}/100. Missing: ${missing.join(', ') || 'multiple signals'}.`,fix:'Add author byline with rel="author", Person schema, Article schema with author + datePublished + dateModified fields. Link to an About/Author page.'});
    }

    // Crawl depth
    if ((pg.depth || 0) >= 4) {
       extra.push({sev:'medium',ico:'🔵',title:'Deep Crawl Depth',detail:`Page is ${pg.depth} clicks from root. Pages beyond depth 3 receive less PageRank and may be crawled infrequently.`,fix:'Reduce click depth by adding internal links from higher-level pages or including the URL in your sitemap.'});
    }

    // Soft-404 detection
    if (!pg.soft404 && pg.status === 200) {
      // Run detection lazily if not already set during crawl (e.g. paste audits)
      const soft404Result = detectSoft404(pg);
      pg.soft404 = soft404Result.isSoft404;
      pg.soft404Zone = soft404Result.matchedIn;
    }
    if (pg.soft404) {
      extra.push({
        sev: 'high',
        ico: '🟠',
        title: 'Soft 404 Detected',
        detail: `Page returns HTTP 200 but contains "not found" content in ${pg.soft404Zone || 'page content'}. Search engines may index this as a real page, wasting crawl budget and diluting site quality signals.`,
        fix: 'Return a proper HTTP 404 status code for missing pages, or redirect to a relevant existing page with a 301. Remove soft-404 text and ensure the page has genuine content.'
      });
    }

    return [...base, ...extra];
  };
})();

/* ══════════════════════════════════════
   SCORE ENGINE — display helper
   Renders score breakdown on the
   issues tab header area
   ══════════════════════════════════════ */
function renderScoreBreakdown(pg) {
  // Injected above the issues pane when issues tab is loaded
  const wrap = $('mod-issues'); if (!wrap) return;
  const scores = AuditForge.scores.compute(pg);
  if (!scores) return;

  const dims = [
    { label: 'Technical SEO',      key: 'technicalSEO',      icon: '⚙' },
    { label: 'Content Quality',    key: 'contentQuality',     icon: '📝' },
    { label: 'Accessibility',      key: 'accessibility',      icon: '♿' },
    { label: 'Schema Health',      key: 'schemaHealth',       icon: '📋' },
    { label: 'Social Opt.',        key: 'socialOptimization', icon: '📱' },
    { label: 'AI Visibility',      key: 'aiVisibility',       icon: '🤖' }
  ];

  const dimCards = dims.map(d => {
    const val = scores[d.key] || 0;
    const col = AuditForge.scores.colorFor(val);
    const deducts = (scores.deductions[d.key.replace('technicalSEO','technical').replace('contentQuality','content').replace('schemaHealth','schema').replace('socialOptimization','social').replace('aiVisibility','ai').replace('accessibility','accessibility')] || [])
      .slice(0, 3)
      .map(dd => `<div class="score-deduction-row">
        <span class="score-deduction-label">${dd.l}</span>
        <span class="score-deduction-val ${dd.v < 0 ? 'neg' : 'pos'}">${dd.v > 0 ? '+' : ''}${dd.v}</span>
      </div>`).join('');
    return `<div class="score-dim-card">
      <div class="score-dim-label">${d.icon} ${d.label}</div>
      <div class="score-dim-value" style="color:${col}">${val}</div>
      <div class="score-dim-bar">
        <div class="score-dim-fill" style="width:0%;background:${col}" data-w="${val}%"></div>
      </div>
      ${deducts ? `<div class="score-deductions" style="margin-top:6px">${deducts}</div>` : ''}
    </div>`;
  }).join('');

  const ocol = AuditForge.scores.colorFor(scores.overall);

  const scoreHtml = `
    <div class="score-overall-card" style="margin-bottom:14px">
      <div class="score-overall-num" style="color:${ocol}">${scores.overall}</div>
      <div class="score-overall-detail">
        <div class="score-overall-title">Overall Score</div>
        <div class="score-overall-sub">
          Technical 25% · Content 20% · Accessibility 15% · Schema 15% · Social 10% · AI 15%
        </div>
      </div>
    </div>
    <div class="score-grid" style="margin-bottom:16px">${dimCards}</div>`;

  // Prepend to wrap without losing issues content
  const scoreDiv = document.createElement('div');
  scoreDiv.id = 'scoreBreakdownInline';
  scoreDiv.innerHTML = scoreHtml;
  // Insert at top if not already there
  if (!$('scoreBreakdownInline')) {
    wrap.insertBefore(scoreDiv, wrap.firstChild);
  }

  setTimeout(() => {
    wrap.querySelectorAll('.score-dim-fill').forEach(f => {
      f.style.width = f.dataset.w || '0%';
      f.style.transition = 'width 1s ease-out';
    });
  }, 100);
}

/* Hook loadIssues to also render scores */
(function hookLoadIssues() {
  const _orig = window.loadIssues;
  window.loadIssues = function(pg) {
    _orig(pg);
    // Prepend score breakdown
    setTimeout(() => renderScoreBreakdown(pg), 0);
  };
})();

/* ══════════════════════════════════════
   FIX: syncSerp() metaDesc reference
   The original function checks metaDesc
   but that element was missing in the
   original HTML. Now that the element
   exists this fix ensures it works.
   ══════════════════════════════════════ */
(function fixSyncSerp() {
  // Override syncSerp to be null-safe
  window.syncSerp = function() {
    const t = ($('metaTitle') || {}).value || '';
    const d = ($('metaDesc')  || {}).value || '';
    const tl = t.length, dl = d.length;
    const tpx = Math.round(tl * 9.2);
    const dpx = Math.round(dl * 6.8);
    const tc = tl < 30 ? 'bad' : tl <= 60 ? 'ok' : tl <= 70 ? 'warn' : 'bad';
    const dc = dl < 70 ? 'warn' : dl <= 160 ? 'ok' : 'bad';

    setText('titleCC', tl + ' ch');
    const tcc = $('titleCC'); if (tcc) tcc.className = 'cc ' + tc;
    const tb  = $('titleBar'); if (tb)  tb.className  = 'pxbar ' + tc;
    setText('titlePx',  tpx + ' / 600px');
    setText('titlePxInfo', tpx + 'px');

    setText('descCC',  dl + ' ch');
    const dcc = $('descCC'); if (dcc) dcc.className = 'cc ' + dc;
    const db  = $('descBar'); if (db)  db.className  = 'pxbar ' + dc;
    setText('descPx',  dpx + ' / 920px');
    setText('descPxInfo', dpx + 'px');

    setText('serpTitle', t || 'Page Title');
    setText('serpDesc',  d || (dl === 0 ? 'No meta description set.' : ''));
    setText('serpSite',  curPage ? curPage.url : '');
  };
})();

/* ══════════════════════════════════════
   FIX: loadMeta() — populate metaDesc
   ══════════════════════════════════════ */
(function fixLoadMeta() {
  const _orig = window.loadMeta;
  window.loadMeta = function(pg) {
    _orig(pg);
    const md = $('metaDesc'); if (md) md.value = pg.desc || '';
    syncSerp();

    // Indexability badge in meta pane
    const extraEl = $('ddMeta');
    if (extraEl && pg) {
      const idx = analyzeIndexability(pg);
      const idxColor = idx.verdict === 'YES' ? 'var(--green)' : idx.verdict === 'WARN' ? 'var(--amber)' : 'var(--red)';
      const idxIco   = idx.verdict === 'YES' ? '✓' : idx.verdict === 'WARN' ? '⚠' : '✗';
      const primaryReason = idx.reasons[0]?.reason || '';
      const badge = `<span style="background:${idxColor === 'var(--green)' ? 'var(--green-dim)' : idxColor === 'var(--amber)' ? 'var(--amber-dim)' : 'var(--red-dim)'};border:1px solid ${idxColor};color:${idxColor};padding:2px 10px;border-radius:4px;font-family:var(--mono);font-size:11px;font-weight:700" title="${primaryReason}">${idxIco} Indexable: ${idx.verdict}</span>`;
   // Canonical validation badge
      if (!$('canonicalBadge')) {
        const cv = pg.canonicalValidation || validateCanonical(pg, pg.allCanonicals || []);
        const cvVerdict = cv.findings.find(f => f.severity === 'critical') ? 'CRITICAL'
          : cv.findings.find(f => f.severity === 'medium') ? 'WARN'
          : cv.findings.find(f => f.verdict === 'SELF') ? 'OK'
          : cv.findings.find(f => f.verdict === 'MISSING') ? 'MISSING' : 'OK';
        const cvColor = cvVerdict === 'OK' ? 'var(--green)' : cvVerdict === 'CRITICAL' ? 'var(--red)' : 'var(--amber)';
        const cvBg = cvVerdict === 'OK' ? 'var(--green-dim)' : cvVerdict === 'CRITICAL' ? 'var(--red-dim)' : 'var(--amber-dim)';
        const cvSpan = document.createElement('span');
        cvSpan.id = 'canonicalBadge';
        const cvLabel = cvVerdict === 'OK' ? '✓ Canonical OK' : cvVerdict === 'MISSING' ? '⚠ No Canonical' : cvVerdict === 'CRITICAL' ? '✗ Canonical Error' : '⚠ Canonical Warn';
        const cvTitle = cv.findings.map(f => f.detail).join(' | ');
        cvSpan.innerHTML = `<span style="background:${cvBg};border:1px solid ${cvColor};color:${cvColor};padding:2px 10px;border-radius:4px;font-family:var(--mono);font-size:11px;font-weight:700" title="${cvTitle}">${cvLabel}</span>`;
        extraEl.appendChild(cvSpan);
      }

      // Append without replacing existing content
      if (!$('indexabilityBadge')) {
        const span = document.createElement('span');
        span.id = 'indexabilityBadge';
        span.innerHTML = badge;
        extraEl.appendChild(span);
      } else {
        $('indexabilityBadge').innerHTML = badge;
      }
    }
  };
})();

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
