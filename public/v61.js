const INTEL_BASE='https://raw.githubusercontent.com/shafferusa/intelligence-terminal/main/site/';
const INTEL_INDEX=`${INTEL_BASE}reports/index.json`;
const HORIZONS=['CQ','1D','1W','1M','3M','1Y','3Y','5Y'];
const PERF_KEY='tablet-market-watcher-horizons-v6';
const SYMBOL_KEY='tablet-market-watcher-symbols-v5-1';
let intelIndex=null, intelPromise=null, currentPage='markets', readerReturn='newspaper';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function installShell(){
  const header=$('.topbar');
  const main=$('main');
  if(!header||!main)return;
  const nav=document.createElement('nav');
  nav.id='terminalNav';
  nav.className='terminal-nav';
  nav.setAttribute('aria-label','Terminal pages');
  nav.innerHTML=`<button class="terminal-tab active" data-terminal-page="markets">Markets</button><button class="terminal-tab" data-terminal-page="newspaper">Newspaper</button><button class="terminal-tab" data-terminal-page="learning">Learning Brief</button>`;
  header.insertAdjacentElement('afterend',nav);

  main.insertAdjacentHTML('beforeend',`
    <section id="newspaperPage" class="intel-page">
      <div class="intel-page-head"><div><div class="eyebrow">INTELLIGENCE</div><h2>Newspaper</h2><p id="newspaperState" class="muted small">Loading editions…</p></div><button class="intel-refresh" data-intel-refresh type="button">Refresh</button></div>
      <div id="newspaperList" class="intel-list"></div>
    </section>
    <section id="learningPage" class="intel-page">
      <div class="intel-page-head"><div><div class="eyebrow">ACADEMY</div><h2>Learning Brief</h2><p id="learningState" class="muted small">Loading briefs…</p></div><button class="intel-refresh" data-intel-refresh type="button">Refresh</button></div>
      <div id="learningList" class="intel-list"></div>
    </section>
    <section id="readerPage" class="intel-page reader-page">
      <button id="readerBack" class="reader-back" type="button">‹ Back</button>
      <article class="reader-card">
        <div id="readerKicker" class="eyebrow">NEWSPAPER</div>
        <h2 id="readerTitle"></h2>
        <div id="readerMeta" class="reader-meta"></div>
        <div id="readerLoading" class="reader-loading">Loading…</div>
        <div id="readerBody" class="reader-body"></div>
      </article>
    </section>`);

  $$('.terminal-tab').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.terminalPage)));
  $$('[data-intel-refresh]').forEach(b=>b.addEventListener('click',()=>loadIntelligence(true).then(renderLists).catch(showIntelError)));
  $('#readerBack').addEventListener('click',()=>showPage(readerReturn,false));
}

function installHorizonPreset(){
  const refresh=$('#lastRefresh');
  if(!refresh||$('#horizonPresetV61'))return;
  const wrap=document.createElement('div');
  wrap.className='market-tools';
  refresh.parentNode.insertBefore(wrap,refresh);
  wrap.appendChild(refresh);
  const btn=document.createElement('button');
  btn.id='horizonPresetV61';
  btn.className='preset-pill';
  btn.type='button';
  btn.textContent=`Horizon · ${currentPreset()}`;
  wrap.appendChild(btn);
  const pop=document.createElement('div');
  pop.id='presetPopover';
  pop.className='preset-popover hidden';
  pop.innerHTML=`<div class="preset-label">Set all tickers</div><div class="preset-grid">${HORIZONS.map(h=>`<button type="button" data-preset-horizon="${h}">${h}</button>`).join('')}</div>`;
  document.body.appendChild(pop);
  btn.addEventListener('click',e=>{e.stopPropagation();togglePreset(btn,pop)});
  pop.addEventListener('click',e=>{const b=e.target.closest('[data-preset-horizon]');if(!b)return;applyPreset(b.dataset.presetHorizon)});
  document.addEventListener('click',e=>{if(!e.target.closest('#presetPopover,#horizonPresetV61'))pop.classList.add('hidden')});
  window.addEventListener('resize',()=>pop.classList.add('hidden'));
}

function readSymbols(){try{const v=JSON.parse(localStorage.getItem(SYMBOL_KEY));return Array.isArray(v)?v:[]}catch{return []}}
function readHorizons(){try{const v=JSON.parse(localStorage.getItem(PERF_KEY));return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}}
function currentPreset(){const symbols=readSymbols(),map=readHorizons();if(!symbols.length)return '1D';const u=[...new Set(symbols.map(s=>HORIZONS.includes(map[s])?map[s]:'1D'))];return u.length===1?u[0]:'Mixed'}
function togglePreset(btn,pop){
  if(!pop.classList.contains('hidden')){pop.classList.add('hidden');return}
  const r=btn.getBoundingClientRect();pop.classList.remove('hidden');
  const w=Math.min(292,window.innerWidth-24);pop.style.width=`${w}px`;pop.style.left=`${Math.min(window.innerWidth-w-12,Math.max(12,r.right-w))}px`;pop.style.top=`${r.bottom+8}px`;
  const cur=currentPreset();$$('#presetPopover [data-preset-horizon]').forEach(b=>b.classList.toggle('active',b.dataset.presetHorizon===cur));
}
function applyPreset(h){
  if(!HORIZONS.includes(h))return;
  const symbols=readSymbols(),map=readHorizons();for(const s of symbols)map[s]=h;localStorage.setItem(PERF_KEY,JSON.stringify(map));
  $('#horizonPresetV61').textContent=`Horizon · ${h}`;$('#presetPopover').classList.add('hidden');
  location.reload();
}

function closeMarketChart(){if($('#chartScreen')?.classList.contains('active'))$('#backBtn')?.click()}
function showPage(page,push=true){
  if(!['markets','newspaper','learning','reader'].includes(page))page='markets';
  if(page!=='markets')closeMarketChart();
  currentPage=page;document.body.dataset.terminalPage=page;
  $$('.terminal-tab').forEach(b=>b.classList.toggle('active',b.dataset.terminalPage===page));
  const h1=$('.topbar h1');if(h1)h1.textContent=page==='markets'?'Markets':page==='newspaper'?'Newspaper':page==='learning'?'Learning Brief':'Reader';
  document.title=`${page==='markets'?'Markets':page==='newspaper'?'Newspaper':page==='learning'?'Learning Brief':'Reader'} · Shaffer Terminal`;
  if(push&&page!=='reader'&&location.hash!==`#${page}`)history.pushState({page},'',`#${page}`);
  if(page==='newspaper'||page==='learning')loadIntelligence().then(renderLists).catch(showIntelError);
}

async function loadIntelligence(force=false){
  if(intelIndex&&!force)return intelIndex;if(intelPromise&&!force)return intelPromise;
  intelPromise=fetch(INTEL_INDEX,{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error(`Intelligence feed unavailable (${r.status})`);const j=await r.json();if(!Array.isArray(j))throw new Error('Intelligence feed returned invalid data.');intelIndex=j.filter(x=>x&&x.date&&x.slot&&x.path&&!String(x.path).includes('practice'));return intelIndex}).finally(()=>intelPromise=null);
  return intelPromise;
}
function dateInfo(s){const [y,m,d]=String(s).split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d,12));return {dow:new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(dt),short:`${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}/${y}`}}
function newspaperLabel(x){const p=dateInfo(x.date);if(x.slot==='am')return `${p.dow}, ${p.short}, Morning`;if(x.slot==='pm')return `${p.dow}, ${p.short}, Afternoon`;if(x.slot==='sat')return `${p.dow}, Weekly Recap, ${p.short}`;if(x.slot==='sun')return `${p.dow}, Weekly Look Ahead, ${p.short}`;return `${p.dow}, ${p.short}`}
function learningLabel(x){const first=(x.headlines||[])[0]||'',m=first.match(/Day\s+(\d+)\s+of\s+\d+\s+[·•]\s+([^:]+):/i),p=dateInfo(x.date),day=m?`Day ${m[1]}`:'Learning Brief',topic=m?m[2].trim():'Learning';return `${day}, ${topic}, ${x.title||''}, ${p.short}`}
function intelCard(x,type){const label=type==='learning'?learningLabel(x):newspaperLabel(x);return `<button class="intel-row" type="button" data-report-path="${escapeHtml(x.path)}" data-report-type="${type}"><span class="intel-title">${escapeHtml(label)}</span><span class="intel-headline">${escapeHtml(x.title||'')}</span>${x.summary?`<span class="intel-summary">${escapeHtml(x.summary)}</span>`:''}<span class="intel-meta">${Number.isFinite(x.reading_minutes)?`${x.reading_minutes} min read`:''}</span></button>`}
function renderLists(){
  if(!intelIndex)return;const news=intelIndex.filter(x=>['am','pm','sat','sun'].includes(x.slot)),learn=intelIndex.filter(x=>x.slot==='learn');
  $('#newspaperState').textContent=news.length?`${news.length} editions · newest first`:'No newspaper editions found.';$('#learningState').textContent=learn.length?`${learn.length} briefs · newest first`:'No learning briefs found.';
  $('#newspaperList').innerHTML=news.map(x=>intelCard(x,'newspaper')).join('');$('#learningList').innerHTML=learn.map(x=>intelCard(x,'learning')).join('');
  $$('.intel-row').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.reportPath,b.dataset.reportType)));
}
function showIntelError(e){const msg=e?.message||'Unable to load intelligence reports.';if($('#newspaperState'))$('#newspaperState').textContent=msg;if($('#learningState'))$('#learningState').textContent=msg}
function sanitizeReport(root,url){
  root.querySelectorAll('script,style,iframe,object,embed,form,input,button,nav,.top-bar').forEach(n=>n.remove());
  root.querySelectorAll('*').forEach(el=>{for(const a of [...el.attributes])if(/^on/i.test(a.name))el.removeAttribute(a.name)});
  root.querySelectorAll('[src]').forEach(el=>{try{el.setAttribute('src',new URL(el.getAttribute('src'),url).href)}catch{}});
  root.querySelectorAll('a[href]').forEach(el=>{try{el.setAttribute('href',new URL(el.getAttribute('href'),url).href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}catch{}});
}
async function openReport(path,type){
  const entry=(intelIndex||[]).find(x=>x.path===path);if(!entry)return;readerReturn=type==='learning'?'learning':'newspaper';showPage('reader',false);
  $('#readerKicker').textContent=type==='learning'?'LEARNING BRIEF':'NEWSPAPER';$('#readerTitle').textContent=entry.title||'';$('#readerMeta').textContent=type==='learning'?learningLabel(entry):newspaperLabel(entry);$('#readerBody').innerHTML='';$('#readerLoading').textContent='Loading…';$('#readerLoading').classList.remove('hidden');
  try{const url=`${INTEL_BASE}${entry.path}`,r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`Report unavailable (${r.status})`);const html=await r.text(),doc=new DOMParser().parseFromString(html,'text/html'),root=doc.querySelector('main.paper')||doc.querySelector('main')||doc.body;sanitizeReport(root,url);root.querySelector('.paper-head')?.remove();$('#readerBody').innerHTML=root.innerHTML;$('#readerLoading').classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'})}catch(e){$('#readerLoading').textContent=e.message||'Unable to load report.'}
}

function refreshVersion(){const v=$('#buildVersion');if(v)v.textContent='v6.1.0'}
function init(){
  installShell();installHorizonPreset();refreshVersion();setTimeout(refreshVersion,1500);
  const page=(location.hash||'#markets').slice(1);showPage(['markets','newspaper','learning'].includes(page)?page:'markets',false);
  loadIntelligence().then(renderLists).catch(showIntelError);
  window.addEventListener('popstate',()=>showPage((location.hash||'#markets').slice(1),false));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
