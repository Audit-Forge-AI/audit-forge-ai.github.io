/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * analysis.js
 */

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
      if (canonUrl.origin !== pageUrl.origin) {
        findings.push({
          severity: 'critical', verdict: 'CROSS_DOMAIN',
          title: 'Cross-Domain Canonical',
          detail: `Canonical points to a different domain: ${canonUrl.origin} (page is on ${pageUrl.origin})`,
          fix: 'Only use cross-domain canonicals if you intentionally want to consolidate authority to another site. Verify this is correct.'
        });
      } else {
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

  if (pg.status === 404) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: '404 Not Found — page does not exist' });
  } else if (pg.status >= 400 || pg.status === 0) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: `HTTP ${pg.status || 'error'} — page unreachable` });
  }

  if (pg.robots && /noindex/i.test(pg.robots)) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: `meta robots contains "noindex" (value: "${pg.robots}")` });
  }

  const robotsData = window._lastRobots || {};
  if (robotsData.found && robotsData.disallowAll) {
    indexable = false;
    reasons.push({ verdict: 'NO', reason: 'blocked by robots.txt — Disallow: / prevents crawling' });
  }

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
          reasons.push({ verdict: 'WARN', reason: `canonical points to a different URL on same domain: ${pg.canonical}` });
        }
      } catch(e) {}
    }
  }

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
   ORPHAN & DUPLICATE CHECKS
   ══════════════════════════════════════ */
function getOrphanPageIssues() {
  const issues = [];
  const incomingMap = window._incomingLinks || {};
  const rootUrls = new Set();
  pages.forEach(pg => {
    try {
      const u = new URL(pg.url);
      if (u.pathname === '/' || u.pathname === '') rootUrls.add(pg.url);
    } catch(e) {}
  });

  pages.forEach(pg => {
    if (rootUrls.has(pg.url)) return;
    if (pg.status !== 200) return;
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
