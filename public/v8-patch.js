const V8='8.0.0';
const $=s=>document.querySelector(s);

function forceVersion(){
  const el=$('#buildVersion');
  if(el && el.textContent!==`v${V8}`) el.textContent=`v${V8}`;
}
forceVersion();
const versionNode=$('#buildVersion');
if(versionNode)new MutationObserver(forceVersion).observe(versionNode,{childList:true,characterData:true,subtree:true});

function scrubDirectRows(){
  document.querySelectorAll('#globalSearchResults .search-result').forEach(row=>{
    const name=row.querySelector('.search-result-name')?.textContent?.trim();
    const type=row.querySelector('.search-result-type')?.textContent?.trim().toLowerCase();
    if(name==='Open symbol directly'||type==='symbol')row.remove();
  });
  const box=$('#globalSearchResults');
  if(box && !box.querySelector('.search-result')) box.classList.add('hidden');
}
const globalResults=$('#globalSearchResults');
if(globalResults){
  new MutationObserver(scrubDirectRows).observe(globalResults,{childList:true,subtree:true});
  scrubDirectRows();
}

const globalInput=$('#globalSearch');
if(globalInput){
  globalInput.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    e.preventDefault();
    e.stopImmediatePropagation();
    scrubDirectRows();
    const first=$('#globalSearchResults [data-result-symbol]');
    if(first)first.click();
  },true);
}

let searchOrigin=null;
if(globalResults){
  globalResults.addEventListener('click',e=>{
    const row=e.target.closest('[data-result-symbol]');
    if(!row)return;
    const page=document.body.dataset.page||'markets';
    if(page!=='chart')searchOrigin={page,y:window.scrollY};
    setTimeout(()=>window.scrollTo(0,0),0);
  },true);
}

const chartBack=$('#chartBack');
if(chartBack){
  chartBack.addEventListener('click',()=>{
    if(!searchOrigin)return;
    const origin=searchOrigin;
    searchOrigin=null;
    setTimeout(()=>requestAnimationFrame(()=>window.scrollTo(0,origin.y)),0);
  });
}

document.querySelectorAll('.terminal-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{searchOrigin=null});
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register(`/sw.js?v=${V8}`,{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
