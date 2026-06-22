/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * overrides.js
 */

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
    const viewportEl = doc.querySelector('meta[name="viewport"]');
    result.hasViewport = !!viewportEl;
    result.viewportContent = viewportEl ? (viewportEl.getAttribute('content')||'') : '';
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
    const allButtons = [...doc.querySelectorAll('button')];
    result.unlabelledButtons = allButtons.filter(btn=>{
      const txt=(btn.textContent||'').trim();
      return !txt && !btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby') && !btn.getAttribute('title');
    }).length;
    result.totalButtons = allButtons.length;
    result.hasSkipLink   = !!doc.querySelector('a[href="#main"],a[href="#content"],a[href="#skip"]');
    result.ariaLandmarks = doc.querySelectorAll('[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"]').length;
    const _formControls = [...doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),select,textarea')];
    result.totalInputs = _formControls.length;
    const _labelIds = new Set([...doc.querySelectorAll('label[for]')].map(l=>l.getAttribute('for')));
    result.unlabelledInputs = _formControls.filter(el=>{
      if(el.getAttribute('aria-label')) return false;
      if(el.getAttribute('aria-labelledby')) return false;
      if(el.getAttribute('title')) return false;
      if(el.id && _labelIds.has(el.id)) return false;
      if(el.closest('label')) return false;
      return true;
    }).length;
    result.labelledInputs = result.totalInputs - result.unlabelledInputs;
    result.tabIndex      = doc.querySelectorAll('[tabindex]').length;
    result.contrastIssues = 0; // Cannot compute in browser without rendering

    // ── FAQ detection ──
    let schemaFaqQuestions = 0;
    let hasFAQPageSchema = false;
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const raw = s.textContent || '';
        if (!raw.trim()) return;
        const j = JSON.parse(raw);
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
    const deduplicatedQHeadings = hasFAQPageSchema
      ? Math.max(0, allQHeadings.length - schemaFaqQuestions)
      : allQHeadings.length;
    // Question sentences in body paragraphs only
    const paraText = [...doc.querySelectorAll('p')].map(p => p.textContent).join(' ');
    const questionSentences = (paraText.match(/[A-Z][^.!?]{10,}[?]/g) || []).length;

    const faqScore = (hasFAQPageSchema ? 8 : 0)
      + Math.min(6, schemaFaqQuestions)
      + Math.min(3, deduplicatedQHeadings)
      + Math.min(1, Math.floor(questionSentences / 5));
    result.faqCount = Math.min(faqScore, 20);
    result.qHeadingCount = allQHeadings.length;
    result.hasFAQPageSchema = hasFAQPageSchema;
    result.schemaFaqQuestions = schemaFaqQuestions;

    // ── Entity detection ──
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

    const ENTITY_REJECT_PATTERN = /^(The|This|These|Those|A|An|It|He|She|They|We|You|I|Our|Your|My|His|Her|Their|Its|There|Here)\s/i;

    const entityMatches = bodyText.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,4})\b/g) || [];
    const entitySet = new Set(
      entityMatches.filter(e => {
        if (e.length < 6) return false;
        if (ENTITY_STOPLIST.has(e)) return false;
        if (ENTITY_REJECT_PATTERN.test(e)) return false;
        if (e.split(' ').length < 2) return false;
        const escaped = e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const freq = (bodyText.match(new RegExp('\\b' + escaped + '\\b', 'g')) || []).length;
        return freq >= 2 || e.split(' ').length >= 3;
      })
    );
    result.entityCount = Math.min(entitySet.size, 30);
    result.topEntities = [...entitySet].slice(0, 10);

    // ── Definition detection (Robust, precise, and low false-positives) ──
    let definitionCount = 0;

    // 1. Check HTML Definition lists (<dl><dt><dd>)
    const dlElements = doc.querySelectorAll('dl');
    dlElements.forEach(dl => {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      definitionCount += Math.min(dts.length, dds.length);
    });

    // 2. Check bold/strong term definition patterns
    const boldElements = doc.querySelectorAll('strong, b, code');
    boldElements.forEach(el => {
      const text = (el.textContent || '').trim();
      if (text.length > 2 && text.length < 40 && text.split(' ').length <= 4) {
        const parentText = el.parentNode ? (el.parentNode.textContent || '') : '';
        const indexInParent = parentText.indexOf(text);
        if (indexInParent !== -1) {
          const afterText = parentText.substring(indexInParent + text.length).trim();
          const verbMatch = /^(?:is|are|refers to|refer to|defined as|means|denotes|represents)\s+(?:a|an|the|our|your|to|process|system|method|concept|technique|practice|standard|protocol|framework|tool|strategy|application|software|service|collection|set|group|type|form)\b/i.test(afterText);
          if (verbMatch) {
            definitionCount++;
          }
        }
      }
    });

    // 3. Sentence-level linguistic pattern extraction
    const sentences = bodyText.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 15);
    const pronounStoplist = /^(he|she|it|they|we|you|i|this|that|there|these|those|here|there|what|who|where|when|why|how|which|whose|one|another|each|some|someone|somebody|something|everyone|everybody|everything|anyone|anybody|anything|noone|nobody|nothing|all|any|both|few|many|most|other|such|today|yesterday|tomorrow|now|then|first|second|third|finally|next|last|also|instead|however|therefore|indeed|meanwhile|specifically|conversely|unfortunately|fortunately)\b/i;
    const defRegex = /\b(is|are|refers to|refer to|defined as|means|denotes|represents)\s+(a|an|the|our|your|to|process|system|method|concept|technique|practice|standard|protocol|framework|tool|strategy|application|software|service|collection|set|group|type|form)\s+[A-Za-z0-9]/i;

    sentences.forEach(sentence => {
      if (!pronounStoplist.test(sentence)) {
        if (defRegex.test(sentence) && sentence.length < 180) {
          definitionCount++;
        }
      }
    });

    result.definitionCount = Math.min(Math.max(definitionCount, 0), 15);

    // ── Knowledge chunk detection ──
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

    const anchorTextCitations = [...doc.querySelectorAll('a')].filter(a =>
      /source|reference|cite|study|research|according|view study|full report|original/i.test(a.textContent) ||
      /\[\d+\]/.test(a.textContent)
    ).length;

    const rawCitationScore = blockquotes + cites + blockquotesWithCite +
      (authorityLinks.length * 3) + Math.min(5, Math.floor(generalExternalLinks / 2)) +
      Math.min(5, citationPhraseCount) + Math.min(3, anchorTextCitations);

    result.citationCount = Math.min(rawCitationScore, 20);
    result.authorityLinkCount = authorityLinks.length;
    result.externalLinkCount = generalExternalLinks;
    result.citationPhraseCount = citationPhraseCount;

    result.citationScore = result.citationCount === 0 ? 0
      : authorityLinks.length >= 3 || (result.citationCount >= 8) ? 100
      : authorityLinks.length >= 1 || (result.citationCount >= 4) ? 75
      : 50;

    // ── Hreflang ──
    const hreflangTags = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')];
    const hreflangValues = hreflangTags.map(el=>({lang:el.getAttribute('hreflang')||'',href:el.getAttribute('href')||''}));
    const validLangRe = /^(x-default|[a-z]{2,3}(-[A-Z]{2}|(-[A-Za-z]{4})?(-[A-Z]{2})?)?)$/;
    const hreflangIssues = [];
    let hasSelfHreflang = false;
    let hasXDefault = false;
    hreflangValues.forEach(({lang,href})=>{
      if(lang==='x-default') hasXDefault=true;
      if(!validLangRe.test(lang)) hreflangIssues.push('Invalid hreflang value: "'+lang+'"');
      try{ if(new URL(href).href===new URL(url).href) hasSelfHreflang=true; }catch(e){}
    });
    result.hreflang = {
      tags: hreflangValues,
      count: hreflangValues.length,
      hasXDefault,
      hasSelfHreflang,
      issues: hreflangIssues,
      present: hreflangValues.length > 0
    };

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

    // ── Answer Box / Featured Snippet Detection ──
    const answerBoxCandidates = [];
    const questionHeadings = [...doc.querySelectorAll('h2,h3,h4')].filter(h=>/\?[\s]*$/.test(h.textContent.trim()));
    questionHeadings.forEach(h=>{
      let next = h.nextElementSibling;
      while(next && !/^H[1-6]$/.test(next.tagName)){
        if(next.tagName==='P'){
          const wc=(next.textContent||'').split(/\s+/).filter(Boolean).length;
          if(wc>=40 && wc<=70){
            answerBoxCandidates.push({question:h.textContent.trim().slice(0,100), wordCount:wc});
            break;
          }
        }
        next=next.nextElementSibling;
      }
    });
    result.answerBoxCandidates = answerBoxCandidates;
    result.answerBoxReady = answerBoxCandidates.length > 0;

    // ── List / Table density ──
    const totalWords = result.wordCount || 1;
    const listItems = doc.querySelectorAll('li').length;
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
      hasTables:      !!(result.hasTables),
      hasAnswerBox:   result.answerBoxReady || false
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
    const informational = (bodyText.match(/\b(how|why|what|explain|guide|tutorial|learn)\b/gi) || []).length;
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
    const _localAllCanonicals = [...doc.querySelectorAll('link[rel="canonical"]')]
      .map(el => el.getAttribute('href')?.trim() || '')
      .filter(Boolean);
    result.allCanonicals = _localAllCanonicals;
    result.canonicalValidation = validateCanonical(result, result.allCanonicals);

    // ── Schema type detection ──
    result.schemaTypes = [];
    result.schemaErrors = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s,idx) => {
      try {
        const j = JSON.parse(s.textContent || '');
        const t = j['@type'];
        if (t) result.schemaTypes.push(Array.isArray(t) ? t : [t]);
        if (j['@graph']) {
          j['@graph'].forEach(n => { if (n['@type']) result.schemaTypes.push(n['@type']); });
        }
      } catch(e) {
        result.schemaErrors.push({block: idx+1, message: e.message});
      }
    });
    result.schemaTypes = [...new Set(result.schemaTypes.flat())];
    result.hasFAQSchema       = result.schemaTypes.includes('FAQPage');
    result.hasOrgSchema       = result.schemaTypes.some(t => /Organization|LocalBusiness/i.test(t));
    result.hasArticleSchema   = result.schemaTypes.some(t => /Article|BlogPosting|NewsArticle/i.test(t));
    result.hasProductSchema   = result.schemaTypes.some(t => /Product/i.test(t));
    result.hasBreadcrumbSchema = result.schemaTypes.some(t => /BreadcrumbList/i.test(t));

    result.scriptCount = doc.querySelectorAll('script').length;
    result.cssCount = doc.querySelectorAll('link[rel="stylesheet"]').length;
    result.htmlLength = html.length;

  } catch(e) {
    console.warn('AuditForge: _extendPageAnalysis error', e);
  }
  return result;
}

/* ══════════════════════════════════════
   HOOK INTO CRAWL
   ══════════════════════════════════════ */
(function hookAnalyzePage() {
  const _orig = window.analyzePage || analyzePage;
  window._analyzePageOriginal = _orig;
  window.analyzePage = function(html, url) {
    const result = _orig(html, url);
    return _extendPageAnalysis(result, html, url);
  };
})();

// Extension cache: extend the page object with defaults if missing
function _ensureExtended(pg) {
  if (pg._extended) return pg;
  try {
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
        citations:      pg.citationScore !== undefined ? pg.citationScore : Math.min(100, pg.citationCount * 10),
        schema:         pg.hasSchema ? 90 : 5,
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
    if (!pg.answerBoxCandidates) pg.answerBoxCandidates = [];
    if (pg.answerBoxReady === undefined) pg.answerBoxReady = false;
    if (pg.unlabelledInputs === undefined) pg.unlabelledInputs = 0;
    if (pg.unlabelledButtons === undefined) pg.unlabelledButtons = 0;
    if (pg.hasViewport === undefined) pg.hasViewport = true;
    if (pg.robotsBlocked === undefined) pg.robotsBlocked = false;
    if (!pg.schemaErrors) pg.schemaErrors = [];
    if (!pg.hreflang) pg.hreflang = {tags:[],count:0,hasXDefault:false,hasSelfHreflang:false,issues:[],present:false};
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
   AI RADAR — loadAI() replacement
   ══════════════════════════════════════ */
(function replaceLoadAI() {
  window.loadAI = function(pg) {
    if (!pg) return;
    _ensureExtended(pg);

    const score = pg.realAIScore !== undefined ? pg.realAIScore : (pg.aiScore || 0);
    const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';

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

    const strengths = metricDefs.filter(d => (m[d.key] || 0) >= 60).map(d => d.label);
    const weaknesses = metricDefs.filter(d => (m[d.key] || 0) < 40).map(d => d.label);

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

    setTimeout(() => {
      wrap.querySelectorAll('.afill').forEach(f => {
        f.style.width = f.dataset.t || '0%';
      });
    }, 100);
  };
})();

/* ══════════════════════════════════════
   HOOK: openInspector extension
   ══════════════════════════════════════ */
(function hookOpenInspector() {
  const _orig = window.openInspector;
  window.openInspector = function(id) {
    const pg = pages.find(p => p.id === id);
    if (pg) {
      _ensureExtended(pg);
    }
    _orig(id);
    if (pg) {
      const robotsPane = $('mod-robots');
      if (robotsPane && robotsPane.classList.contains('active')) {
        loadRobotsSitemap(pg);
      }
    }
  };
})();

/* Wire robots tab click to also call loadRobotsSitemap */
(function wireRobotsTab() {
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
    if (pg.definitionCount < 1) extra.push({ sev:'low', ico:'⚪', title:'No Definition Patterns', detail:'AI systems extract definitions. Pages with clear definitions are cited more often.', fix:'Add "X is a..." or "X refers to..." formats.' });

    // Cross-page duplicate title/H1 issues
    getDuplicateTitleIssues().forEach(i => extra.push(i));
    getOrphanPageIssues().forEach(i => extra.push(i));

    if (!pg.canonicalValidation && pg.canonical !== undefined) {
      pg.canonicalValidation = validateCanonical(pg, pg.allCanonicals || (pg.canonical ? [pg.canonical] : []));
    }
    if (pg.canonicalValidation) {
      pg.canonicalValidation.findings.forEach(f => {
        if (f.severity === 'info') return;
        extra.push({
          sev: f.severity === 'critical' ? 'critical' : f.severity === 'medium' ? 'medium' : 'low',
          ico: f.severity === 'critical' ? '🔴' : '🔵',
          title: f.title, detail: f.detail,
          fix: f.fix || 'Review canonical configuration.'
        });
      });
    }

    const indexability = analyzeIndexability(pg);
    if (!indexability.indexable) {
      indexability.reasons.filter(r => r.verdict === 'NO').forEach(r => {
        extra.push({ sev:'critical', ico:'🔴', title:'Page Not Indexable', detail:r.reason, fix:'Resolve this issue to allow search engines to index this page.' });
      });
    }
    indexability.reasons.filter(r => r.verdict === 'WARN').forEach(r => {
      extra.push({ sev:'medium', ico:'🔵', title:'Indexability Warning', detail:r.reason, fix:'Verify the canonical URL is intentional. If so, ensure the canonical page is fully optimized.' });
    });

    pg._indexability = indexability;

    const dupCandidates = (window._nearDuplicates || {})[pg.url];
    if (dupCandidates && dupCandidates.length) {
      const best = dupCandidates.sort((a,b)=>b.overlap-a.overlap)[0];
      extra.push({sev:'medium',ico:'🔵',title:'Near Duplicate Content',detail:`${best.overlap}% keyword overlap with ${best.url.replace(/https?:\/\/[^/]+/,'')||'/'}. ${dupCandidates.length} similar page(s) detected. May cause keyword cannibalization.`,fix:'Consolidate overlapping pages via 301 redirect or canonical tag, or differentiate content to target distinct keywords.'});
    }

    const canIssue = (window._canonicalIssues || {})[pg.url];
    if (canIssue) {
      if (canIssue.type === 'loop') {
        extra.push({sev:'critical',ico:'🔴',title:'Canonical Loop Detected',detail:`This page canonicals to ${canIssue.target}, which canonicals back to this page (A→B→A loop). Google ignores looped canonicals.`,fix:'Set a single authoritative URL and point all canonicals to it directly.'});
      } else if (canIssue.type === 'chain') {
        extra.push({sev:'high',ico:'🟠',title:'Canonical Chain Detected',detail:`This page canonicals to ${canIssue.target}, which itself canonicals to ${canIssue.finalTarget} (A→B→C chain). Google may not follow chains.`,fix:'Update this page\'s canonical to point directly to the final destination: '+canIssue.finalTarget});
      } else if (canIssue.type === 'uncrawled') {
        extra.push({sev:'medium',ico:'🔵',title:'Canonical Points to Uncrawled URL',detail:`Canonical target ${canIssue.target} was not found in the crawl.`,fix:'Verify the canonical URL is live and accessible.'});
      }
    }

    if ((pg.redirectHops || 0) >= 2) {
      extra.push({sev:'high',ico:'🟠',title:'Redirect Chain Detected',detail:`${pg.redirectHops} redirect hop(s) detected before reaching this URL. Chains dilute PageRank and slow page load.`,fix:'Update all internal links and sitemap entries to point directly to the final destination URL.'});
    }

    const _uButtons = pg.unlabelledButtons || 0;
    if (_uButtons > 0) {
      extra.push({sev:'high',ico:'🟠',title:_uButtons+' Unlabelled Button(s)',detail:_uButtons+' button(s) have no text, aria-label, aria-labelledby, or title. Screen readers cannot identify their purpose (WCAG 4.1.2).',fix:'Add descriptive aria-label attributes.'});
    }
    if (pg.hasViewport === false) {
       extra.push({sev:'medium',ico:'🔵',title:'Missing Viewport Meta Tag',detail:'No <meta name="viewport"> found. Mobile browsers will render at desktop width, causing poor mobile UX.',fix:'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside <head>.'});
    }

    if (pg.robotsBlocked) {
      extra.push({sev:'high',ico:'🟠',title:'Page Blocked by robots.txt',detail:`The URL "${pg.url.replace(/https?:\/\/[^/]+/,'')}" matches a Disallow rule in robots.txt.`,fix:'Remove or adjust the Disallow rule in robots.txt if indexing is desired.'});
    }

    (pg.schemaErrors||[]).forEach(function(err){
      const _eBlock = err.block || '?';
      const _eMsg = err.message || 'unknown error';
      extra.push({sev:'high',ico:'🟠',title:'Schema Syntax Error (Block '+_eBlock+')',detail:'JSON-LD block '+_eBlock+' contains invalid JSON: '+_eMsg+'.',fix:'Validate your JSON-LD schema syntax.'});
    });

    const hrefl = pg.hreflang;
    if (hrefl && hrefl.present) {
      if (!hrefl.hasSelfHreflang) extra.push({sev:'high',ico:'🟠',title:'Missing Self-Referencing Hreflang',detail:'Hreflang tags found but no tag points back to this page\'s own URL.',fix:'Add self-referencing hreflang tag.'});
      if (!hrefl.hasXDefault)    extra.push({sev:'medium',ico:'🔵',title:'Missing x-default Hreflang',detail:'No hreflang x-default tag found.',fix:'Add hreflang="x-default" destination page link.'});
      hrefl.issues.forEach(function(issue){ extra.push({sev:'high',ico:'🟠',title:'Invalid Hreflang Value',detail:issue,fix:'Use valid BCP-47 language codes.'}); });
    }

    const _abCandidates = pg.answerBoxCandidates || [];
    const _abCount = _abCandidates.length;
    if (_abCount > 0) {
      extra.push({sev:'low',ico:'⚪',title:_abCount+' Answer Box Candidate(s) Detected',detail:_abCount+' question heading(s) followed by a 40-70 word answer paragraph found.',fix:'Ensure each question heading is aligned with clean user search queries.'});
    } else if (pg.status===200 && (pg.wordCount||0)>300) {
      extra.push({sev:'low',ico:'⚪',title:'No Answer Box Candidates',detail:'No question headings followed by 40-70 word answer paragraphs detected.',fix:'Structure your explanatory content with questions and direct answers.'});
    }

    const eeatScore = pg.eeatScore !== undefined ? pg.eeatScore : 0;
    if (eeatScore < 40 && pg.status === 200 && (pg.wordCount || 0) > 200) {
      const missing = [];
      const e = pg.eeat || {};
      if (!e.hasAuthorSchema && !e.hasAuthorRel && !e.bylineFound) missing.push('author attribution');
      if (!e.hasDatePublished) missing.push('datePublished');
      if (!e.hasPersonSchema)  missing.push('Person schema');
      extra.push({sev:'medium',ico:'🔵',title:'Weak E-E-A-T Signals',detail:`E-E-A-T score: ${eeatScore}/100. Missing: ${missing.join(', ') || 'multiple signals'}.`,fix:'Add author byline, author/person schema, datePublished and dateModified fields.'});
    }

    if ((pg.depth || 0) >= 4) {
       extra.push({sev:'medium',ico:'🔵',title:'Deep Crawl Depth',detail:`Page is ${pg.depth} clicks from root.`,fix:'Improve internal linking hierarchy to decrease query page depth.'});
    }

    if (!pg.soft404 && pg.status === 200) {
      const soft404Result = detectSoft404(pg);
      pg.soft404 = soft404Result.isSoft404;
      pg.soft404Zone = soft404Result.matchedIn;
    }
    if (pg.soft404) {
      extra.push({
        sev: 'high',
        ico: '🟠',
        title: 'Soft 404 Detected',
        detail: `Page returns HTTP 200 but contains "not found" content in ${pg.soft404Zone || 'page content'}.`,
        fix: 'Return proper HTTP 404 status codes for missing or unavailable pages.'
      });
    }

    return [...base, ...extra];
  };
})();

/* ══════════════════════════════════════
   SCORE ENGINE — display helper
   ══════════════════════════════════════ */
function renderScoreBreakdown(pg) {
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

  const scoreDiv = document.createElement('div');
  scoreDiv.id = 'scoreBreakdownInline';
  scoreDiv.innerHTML = scoreHtml;
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
    setTimeout(() => renderScoreBreakdown(pg), 0);
  };
})();

/* ══════════════════════════════════════
   FIX: syncSerp() metaDesc reference
   ══════════════════════════════════════ */
(function fixSyncSerp() {
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

    const extraEl = $('ddMeta');
    if (extraEl && pg) {
      const idx = analyzeIndexability(pg);
      const idxColor = idx.verdict === 'YES' ? 'var(--green)' : idx.verdict === 'WARN' ? 'var(--amber)' : 'var(--red)';
      const idxIco   = idx.verdict === 'YES' ? '✓' : idx.verdict === 'WARN' ? '⚠' : '✗';
      const primaryReason = idx.reasons[0]?.reason || '';
      const badge = `<span style="background:${idxColor === 'var(--green)' ? 'var(--green-dim)' : idxColor === 'var(--amber)' ? 'var(--amber-dim)' : 'var(--red-dim)'};border:1px solid ${idxColor};color:${idxColor};padding:2px 10px;border-radius:4px;font-family:var(--mono);font-size:11px;font-weight:700" title="${primaryReason}">${idxIco} Indexable: ${idx.verdict}</span>`;

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
