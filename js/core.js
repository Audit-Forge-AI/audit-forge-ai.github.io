/*
 * AuditForge AI Pro — Multi-Agent Intelligence Engine
 * core.js
 */

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
