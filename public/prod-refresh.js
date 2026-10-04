const nativeFetch=window.fetch.bind(window);
const responseCache=new Map(),inflight=new Map();
let manualUntil=0,lastChartTouch=Date.now();

const horizonTTL=h=>({
  '1D':60000,'1W':60000,'CQ':60000,
  '1M':300000,'3M':300000,
  '1Y':Infinity,'3Y':Infinity,'5Y':Infinity
}[String(h||'').toUpperCase()]??300000);
const rangeTTL=r=>({
  '1D':60000,'5D':60000,
  '1M':300000,'3M':300000,'6M':300000,'YTD':300000,
  '1Y':Infinity,'5Y':Infinity
}[String(r||'').toUpperCase()]??300000);

function policy(url){
  if(url.origin!==location.origin)return null;
  if(url.pathname.startsWith('/api/horizon/')){
    const h=(url.searchParams.get('horizon')||'1D').toUpperCase();
    return {ttl:horizonTTL(h),key:`${url.pathname}?horizon=${h}`};
  }
  if(url.pathname.startsWith('/api/bars/')){
    const r=(url.searchParams.get('range')||'1D').toUpperCase();
    return {ttl:rangeTTL(r),key:`${url.pathname}?range=${r}`};
  }
  return null;
}
function replay(x){return new Response(x.body,{status:x.status,statusText:x.statusText,headers:x.headers})}

window.fetch=async function(input,init={}){
  let url;
  try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href)}catch{return nativeFetch(input,init)}
  const p=policy(url);if(!p)return nativeFetch(input,init);
  const now=Date.now(),manual=performance.now()<manualUntil,hit=responseCache.get(p.key);
  if(!manual&&hit&&(p.ttl===Infinity||now-hit.at<p.ttl))return replay(hit);
  if(!manual&&inflight.has(p.key))return replay(await inflight.get(p.key));
  const task=(async()=>{
    const r=await nativeFetch(input,init),body=await r.clone().text(),x={at:Date.now(),body,status:r.status,statusText:r.statusText,headers:new Headers(r.headers)};
    if(r.ok)responseCache.set(p.key,x);return x;
  })();
  if(!manual)inflight.set(p.key,task);
  try{return replay(await task)}finally{if(!manual)inflight.delete(p.key)}
};

// A real user horizon/range press is allowed to bypass the long-horizon cache once.
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('[data-market-horizon],[data-mv-horizon],#marketPreset,#multiPreset,#rangeBar [data-range]')){
    manualUntil=performance.now()+1200;
    lastChartTouch=Date.now();
  }
},{capture:true});

// Full individual chart: short horizons stay live; longer horizons remain on-demand.
new MutationObserver(()=>{if(document.body.dataset.page==='chart')lastChartTouch=Date.now()}).observe(document.body,{attributes:true,attributeFilter:['data-page']});
setInterval(()=>{
  if(document.body.dataset.page!=='chart')return;
  const b=document.querySelector('#rangeBar .range.active');if(!b)return;
  const r=String(b.dataset.range||'1D').toUpperCase(),ttl=r==='1D'||r==='5D'?60000:r==='1M'?300000:0;
  if(!ttl||Date.now()-lastChartTouch<ttl)return;
  lastChartTouch=Date.now();
  b.click();
},15000);
