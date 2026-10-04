const VERSION='8.0.1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

function forceVersion(){const el=$('#buildVersion');if(el&&el.textContent!==`v${VERSION}`)el.textContent=`v${VERSION}`}
forceVersion();
if($('#buildVersion'))new MutationObserver(forceVersion).observe($('#buildVersion'),{childList:true,characterData:true,subtree:true});

function clearSearch(){const i=$('#globalSearch'),b=$('#globalSearchResults'),c=$('#clearSearch');if(i)i.value='';c?.classList.add('hidden');if(b){b.classList.add('hidden');b.innerHTML=''}}
function cleanResults(){const b=$('#globalSearchResults');if(!b)return;$$('#globalSearchResults .search-result').forEach(r=>{const n=r.querySelector('.search-result-name')?.textContent?.trim(),t=r.querySelector('.search-result-type')?.textContent?.trim().toLowerCase();if(n==='Open symbol directly'||t==='symbol')r.remove()});$$('#globalSearchResults .search-result').slice(3).forEach(r=>r.remove());if(!b.querySelector('.search-result'))b.classList.add('hidden')}
const results=$('#globalSearchResults');if(results){new MutationObserver(cleanResults).observe(results,{childList:true,subtree:true});cleanResults()}

let origin=null;
$('#globalSearch')?.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();e.stopImmediatePropagation();cleanResults();const first=$('#globalSearchResults [data-result-symbol]');if(first){first.click();setTimeout(clearSearch,0)}else clearSearch()},true);
results?.addEventListener('click',e=>{const r=e.target.closest('[data-result-symbol]');if(!r)return;window.__shafferChartCanonical=r.dataset.resultSymbol||null;const p=document.body.dataset.page||'markets';if(p!=='chart')origin={page:p,y:scrollY};document.body.classList.add('search-chart');setTimeout(clearSearch,0);requestAnimationFrame(()=>scrollTo(0,0))},true);
$('#chartBack')?.addEventListener('click',()=>{if(!origin){document.body.classList.remove('search-chart');return}const o=origin;origin=null;document.body.classList.remove('search-chart');setTimeout(()=>requestAnimationFrame(()=>scrollTo(0,o.y)),0)});
$$('.terminal-tab').forEach(t=>t.addEventListener('click',()=>{origin=null;document.body.classList.remove('search-chart');clearSearch()}));

await import('./v8-markets.js?v=8.0.1');
await import('./v8-chart.js?v=8.0.1');
await import('./v8-multi.js?v=8.0.1');
if('serviceWorker'in navigator)navigator.serviceWorker.register(`/sw.js?v=${VERSION}`,{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
