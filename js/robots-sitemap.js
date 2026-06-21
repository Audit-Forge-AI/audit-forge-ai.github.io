/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * robots-sitemap.js
 */

window.AuditForge = window.AuditForge || {};

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
   ROBOTS INTELLIGENCE ENGINE
   AuditForge.robots
   Extends window._lastRobots, does NOT
   replace fetchRobotsTxt()
   ══════════════════════════════════════ */
AuditForge.robots = {

  isUrlAllowed(parsedRobots, url) {
    if (!parsedRobots || !parsedRobots.agents) return true;
    let path = '';
    try { path = new URL(url).pathname; } catch(e) { return true; }
    const rules = parsedRobots.agents['*'] || {disallow:[], allow:[]};
    // Check allow rules first (more specific wins)
    for (const a of (rules.allow||[])) {
      if (a && path.startsWith(a)) return true;
    }
    for (const d of (rules.disallow||[])) {
      if (d && path.startsWith(d)) return false;
    }
    return true;
  },

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

      const r_escapedLoc = xmlEscape(loc);
      const priority = isHome ? '1.00' : '0.90';

      return [
        '  <url>',
        '    <loc>' + r_escapedLoc + '</loc>',
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
   REPLACE loadRobotsSitemap()
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
      const path = u.loc.replace(/https?:\/\/[^/]+/,'') || '/';
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
