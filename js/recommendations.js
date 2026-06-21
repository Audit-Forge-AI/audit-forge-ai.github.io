/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * recommendations.js
 */

window.AuditForge = window.AuditForge || {};

/* ══════════════════════════════════════
   RECOMMENDATIONS ENGINE
   ══════════════════════════════════════ */
AuditForge.recommendations = {

  _cache: null,

  build(pg) {
    if (!pg) return [];
    _ensureExtended(pg);

    const recs = [];
    const scores = AuditForge.scores.compute(pg) || {};

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
