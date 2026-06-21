/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * inspector.js
 */

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

  const noAlt=imgs.filter(i=>i.altMissing===true).length;
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
      <div><span class="img-badge ${img.altMissing?'bad':img.altDecorative?'warn':'ok'}">${img.altMissing?'NO ALT':img.altDecorative?'DECO':'ALT ✓'}</span></div>
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
   MODULE 9 — ROBOTS + SITEMAP (transient viewer)
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
