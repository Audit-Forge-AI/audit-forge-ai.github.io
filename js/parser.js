/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * parser.js
 */

/* ══════════════════════════════════════
   LINK EXTRACTOR & URL NORMALIZATION
   ══════════════════════════════════════ */
function normalizeUrl(url){
  try{
    const u=new URL(url);
    let path=u.pathname;
    path=path.replace(/\/index(\.html?)?$/i,'/');
    if(path.length>1 && path.endsWith('/')){
      path=path.slice(0,-1);
    }
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
      let _absPath='';
      try{_absPath=new URL(abs).pathname;}catch(e){}
      if(
        abs.startsWith(origin) &&
        !/[#?]|mailto:|tel:/.test(abs) &&
        !/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|mov|avi|wmv|exe|dmg|pkg|tar|gz|xls|xlsx|doc|docx|ppt|pptx|css|js|ico|woff|woff2|ttf|eot)$/i.test(_absPath)
      ){
        out.add(normalizeUrl(abs));
      }
    }catch(e){}
  });
  return [...out];
}

/* ══════════════════════════════════════
   PARSE HTML
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
    altMissing:img.getAttribute('alt')===null&&!img.getAttribute('aria-label')&&!img.getAttribute('aria-hidden'),
    altDecorative:img.getAttribute('alt')==='',
    loading:img.getAttribute('loading'),
    width:img.getAttribute('width'),
    height:img.getAttribute('height'),
    srcset:img.getAttribute('srcset')||''
  }));
  const missingAlt=imgs.filter(i=>i.getAttribute('alt')===null&&!i.getAttribute('aria-label')&&!i.getAttribute('aria-hidden')).length;
  const headingNodes=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>({tag:h.tagName.toLowerCase(),text:h.textContent.trim()}));
  const hasSchema=doc.querySelectorAll('script[type="application/ld+json"]').length;
  const hasSemantic=doc.querySelectorAll('article,section,main,nav,aside,header,footer').length;
  const hasLists=doc.querySelectorAll('ul,ol').length;
  const hasTables=doc.querySelectorAll('table').length;

  const bodyText=(doc.body?.innerText||doc.body?.textContent||'').trim();
  const wordCount=bodyText.split(/\s+/).filter(Boolean).length;

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

  const keywords=analyzeKeywords(bodyText, title, h1s[0]||'', url);
  const readability=analyzeReadability(bodyText);

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

  const titleWords=new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stopWords.has(w)));
  const h1Words=new Set(h1.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stopWords.has(w)));
  let urlWords=new Set();
  try{ urlWords=new Set(new URL(url).pathname.toLowerCase().replace(/[-_/]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stopWords.has(w))); }catch(e){}

  const topKeywords=top10.slice(0,5).map(k=>k.word);
  const titleOverlap=topKeywords.filter(k=>titleWords.has(k));
  const h1Overlap=topKeywords.filter(k=>h1Words.has(k));
  const urlOverlap=topKeywords.filter(k=>urlWords.has(k));

  const stuffed=top10.filter(k=>parseFloat(k.density)>3);

  return {top10, titleOverlap, h1Overlap, urlOverlap, stuffed, totalWords};
}

/* ══════════════════════════════════════
   READABILITY ANALYSIS
   ══════════════════════════════════════ */
function analyzeReadability(text){
  if(!text||text.length<100) return null;
  const sentences=text.split(/[.!?]+/).filter(s=>s.trim().length>5);
  const words=text.split(/\s+/).filter(Boolean);
  const paragraphs=text.split(/\n\n+/).filter(p=>p.trim().length>20);

  if(!sentences.length||!words.length) return null;

  const avgWordLength=words.reduce((s,w)=>s+w.length,0)/words.length;
  const avgSentenceLength=words.length/sentences.length;
  const avgParaLength=words.length/Math.max(1,paragraphs.length);

  function countSyllables(word){
    word=word.toLowerCase().replace(/[^a-z]/g,'');
    if(!word.length) return 1;
    if(word.length > 20) return 3;
    const vowels=word.match(/[aeiouy]+/g)||[];
    let count=vowels.length;
    if(word.endsWith('e')&&count>1) count--;
    if(word.endsWith('le')&&word.length>2&&!'aeiou'.includes(word[word.length-3])) count++;
    return Math.max(1,Math.min(count, Math.ceil(word.length/3)));
  }
  const totalSyllables=words.reduce((s,w)=>s+countSyllables(w),0);
  const avgSyllablesPerWord=totalSyllables/words.length;

  const flesch=206.835 - (1.015*avgSentenceLength) - (84.6*avgSyllablesPerWord);
  const fleschClamped=Math.max(0,Math.min(100,Math.round(flesch)));

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
   PAGE TYPE DETECTION
   ══════════════════════════════════════ */
function detectPageType(pg){
  const url=(pg.url||'').toLowerCase();
  const title=(pg.title||'').toLowerCase();
  const h1=(pg.h1s&&pg.h1s[0]||'').toLowerCase();
  const path=url.replace(/https?:\/\/[^/]+/,'');
  if(path==='/'||path===''||/^\/(index|home)(\.html?)?$/i.test(path)) return 'homepage';
  if(/\/(contact|reach-us|get-in-touch)/i.test(path)||/contact/i.test(title)) return 'contact';
  if(/\/(privacy|privacy-policy)/i.test(path)||/privacy policy/i.test(title)) return 'privacy';
  if(/\/(terms|terms-of|tos|legal)/i.test(path)||/terms of/i.test(title)) return 'terms';
  if(/\/(blog|news|article|post)\//i.test(path)||/article|blog post/i.test(title)) return 'article';
  if(/\/(product|shop|store|item)\//i.test(path)||/buy|price|add to cart/i.test(title)) return 'product';
  if(/\/(category|cat|tag|archive)\//i.test(path)) return 'category';
  if(/free trial|get started|sign up|landing/i.test(title)||/\/(lp|landing)\//i.test(path)) return 'landing';
  return 'general';
}
