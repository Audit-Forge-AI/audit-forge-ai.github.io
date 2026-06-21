/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * scoring.js
 */

window.AuditForge = window.AuditForge || {};

/* ══════════════════════════════════════
   SCORING ENGINE
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
    const _pt = pg.pageType || detectPageType(pg);
    const _skipFAQ = ['contact','privacy','terms','homepage','category'].includes(_pt);
    const _skipDef = ['contact','privacy','terms'].includes(_pt);
    const _skipList = ['contact','privacy','terms'].includes(_pt);
    if (wc < 100)        { content -= 25; contentD.push({l:'Very thin content (<100 words)',  v:-25}); }
    else if (wc < 300)   { content -= 15; contentD.push({l:'Thin content (<300 words)',       v:-15}); }
    else if (wc < 600)   { content -= 5;  contentD.push({l:'Moderate content (<600 words)',    v:-5}); }
    if (!pg.headingNodes || pg.headingNodes.length < 2) { content -= 10; contentD.push({l:'Too few headings',  v:-10}); }
    if (!_skipList && !pg.hasLists) { content -= 5; contentD.push({l:'No lists for scannability', v:-5}); }
    if (pg.readability) {
      if (pg.readability.flesch < 30)       { content -= 12; contentD.push({l:'Very hard to read',  v:-12}); }
      else if (pg.readability.flesch < 50)  { content -= 6;  contentD.push({l:'Difficult readability', v:-6}); }
      if (pg.readability.avgSentenceLength > 35) { content -= 5; contentD.push({l:'Very long sentences', v:-5}); }
    }
    if (!_skipFAQ && (!pg.faqCount || pg.faqCount < 2)) { content -= 8; contentD.push({l:'No FAQ content detected', v:-8}); }
    if (!_skipDef && pg.definitionCount < 1)             { content -= 5; contentD.push({l:'No definitions found',    v:-5}); }
    deductions.content = contentD;
    const contentQuality = Math.max(0, Math.min(100, content));

    // ── Accessibility ──
    let a11y = 100;
    const a11yD = [];
    const _trueMissing = (pg.imgData||[]).filter(i=>i.altMissing===true).length;
    if (_trueMissing > 0) { const p = Math.min(20, _trueMissing*3); a11y -= p; a11yD.push({l:_trueMissing+' image(s) missing alt (decorative excluded)', v:-p}); }
    if (!pg.hasLangAttr)      { a11y -= 8;  a11yD.push({l:'No lang attribute on <html>',   v:-8}); }
    if (!pg.hasSemantic)      { a11y -= 10; a11yD.push({l:'No semantic HTML landmarks',     v:-10}); }
    if (pg.ariaLandmarks < 2) { a11y -= 5;  a11yD.push({l:'Insufficient ARIA landmarks',   v:-5}); }
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
