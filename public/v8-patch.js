const VERSION='8.0.2';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

function forceVersion(){const el=$('#buildVersion');if(el&&el.textContent!==`v${VERSION}`)el.textContent=`v${VERSION}`}
forceVersion();
if($('#buildVersion'))new MutationObserver(forceVersion).observe($('#buildVersion'),{childList:true,characterData:true,subtree:true});

function normalizeTitle(){const t=$('#pageTitle')?.textContent?.trim()||'Markets';if(document.title!==t)document.title=t}
normalizeTitle();
if($('#pageTitle'))new MutationObserver(normalizeTitle).observe($('#pageTitle'),{childList:true,characterData:true,subtree:true});
const titleNode=document.querySelector('title');if(titleNode)new MutationObserver(normalizeTitle).observe(titleNode,{childList:true,characterData:true,subtree:true});

function clearSearch(){const i=$('#globalSearch'),b=$('#globalSearchResults'),c=$('#clearSearch');if(i)i.value='';c?.classList.add('hidden');if(b){b.classList.add('hidden');b.innerHTML=''}}
function trimRows(box,{max=3}={}){if(!box)return;box.querySelectorAll('.search-result').forEach(r=>{const n=r.querySelector('.search-result-name')?.textContent?.trim(),t=r.querySelector('.search-result-type')?.textContent?.trim().toLowerCase();if(n==='Open symbol directly'||t==='symbol')r.remove()});box.querySelectorAll('.search-result').forEach((r,i)=>{if(i>=max)r.remove()});if(!box.querySelector('.search-result'))box.classList.add('hidden')}
const globalResults=$('#globalSearchResults');if(globalResults){new MutationObserver(()=>trimRows(globalResults)).observe(globalResults,{childList:true,subtree:true});trimRows(globalResults)}
const panelResults=$('#panelSearchResults');if(panelResults){new MutationObserver(()=>trimRows(panelResults)).observe(panelResults,{childList:true,subtree:true});trimRows(panelResults)}

const globalInput=$('#globalSearch');
if(globalInput){globalInput.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();e.stopImmediatePropagation();trimRows(globalResults);const first=$('#globalSearchResults [data-result-symbol]');if(first){first.click();setTimeout(clearSearch,0)}else clearSearch()},true)}

document.addEventListener('keydown',e=>{const inp=e.target.closest?.('.mv-symbol-input');if(!inp||e.key!=='Enter')return;trimRows(panelResults);const first=panelResults?.querySelector('[data-result-symbol]');if(!first)return;e.preventDefault();e.stopImmediatePropagation();first.click()},true);

let origin=null;
if(globalResults){globalResults.addEventListener('click',e=>{const r=e.target.closest('[data-result-symbol]');if(!r)return;window.__shafferChartCanonical=r.dataset.resultSymbol||null;const p=document.body.dataset.page||'markets';if(p!=='chart')origin={page:p,y:scrollY};document.body.classList.add('search-chart');setTimeout(clearSearch,0);requestAnimationFrame(()=>scrollTo(0,0))},true)}
$('#chartBack')?.addEventListener('click',()=>{window.__shafferChartCanonical=null;if(!origin){document.body.classList.remove('search-chart');return}const o=origin;origin=null;document.body.classList.remove('search-chart');setTimeout(()=>requestAnimationFrame(()=>scrollTo(0,o.y)),0)});
$$('.terminal-tab').forEach(t=>t.addEventListener('click',()=>{origin=null;window.__shafferChartCanonical=null;document.body.classList.remove('search-chart');clearSearch()}));

const PAGES=['markets','multiview','newspaper','learning'];
window.addEventListener('keydown',e=>{const tag=e.target?.tagName?.toLowerCase(),typing=tag==='input'||tag==='textarea'||e.target?.isContentEditable;if(typing)return;if(e.key==='ArrowUp'){e.preventDefault();globalInput?.focus({preventScroll:true});globalInput?.select?.();return}if(e.key==='ArrowDown')return;if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const p=document.body.dataset.page;if(!PAGES.includes(p))return;e.preventDefault();const i=PAGES.indexOf(p),n=(i+(e.key==='ArrowRight'?1:-1)+PAGES.length)%PAGES.length,tab=$(`.terminal-tab[data-page="${PAGES[n]}"]`);tab?.click();requestAnimationFrame(()=>tab?.blur())},{capture:true});

function commaPercentNode(root){if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){const old=n.nodeValue,next=old.replace(/([+-]?)(\d{4,})(\.\d+)?(?=\s*%)/g,(_,sg,int,dec)=>`${sg}${Number(int).toLocaleString('en-US')}${dec||''}`);if(next!==old)n.nodeValue=next}}
function commaAll(){document.querySelectorAll('.change,.chart-change,.mv-change').forEach(commaPercentNode)}
setInterval(commaAll,600);commaAll();

function fitChart(){if(document.body.dataset.page!=='chart')return;const card=$('.chart-card');if(!card)return;requestAnimationFrame(()=>{const top=card.getBoundingClientRect().top,h=Math.max(220,Math.floor(innerHeight-top-8));card.style.setProperty('height',`${h}px`,'important');card.style.setProperty('min-height','0','important');scrollTo(0,0)})}
new MutationObserver(()=>{normalizeTitle();if(document.body.dataset.page==='chart')setTimeout(fitChart,20)}).observe(document.body,{attributes:true,attributeFilter:['data-page']});
addEventListener('resize',fitChart);addEventListener('orientationchange',()=>setTimeout(fitChart,120));

// v7 already renders the Markets board from one batched quote request. Mark those rows current
// before the v8 editor enhancer starts so it does not immediately repeat one quote call per row.
function primeMarketRows(){let hs={};try{hs=JSON.parse(localStorage.getItem('tablet-market-watcher-horizons-v6')||'{}')||{}}catch{}$$('#watchlist .watch-row').forEach(row=>{const s=row.dataset.symbol;if(s)row.dataset.paintedSymbol=`${s}|${hs[s]||'1D'}`})}
primeMarketRows();

await import('./v8-markets.js?v=8.0.2');
await import('./v8-market-sparklines.js?v=8.0.2-pit1');
await import('./v8-chart.js?v=8.0.2');
await import('./v8-multi.js?v=8.0.2');
if('serviceWorker'in navigator)navigator.serviceWorker.register(`/sw.js?v=${VERSION}`,{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
