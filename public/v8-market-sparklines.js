const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const cache=new Map(), pending=new Map();
let raf=0;
const CACHE_MS={'1D':60000,'1W':60000,'1M':300000,'3M':300000,'1Y':Infinity,'3Y':Infinity,'5Y':Infinity,CQ:60000};
const RANGE={'1D':'1D','1W':'5D','1M':'1M','3M':'3M','1Y':'1Y','3Y':'5Y','5Y':'5Y',CQ:'YTD'};

const style=document.createElement('style');
style.textContent=`
.terminal-tab:focus,.terminal-tab:focus-visible{outline:none!important}
#marketsPage>.status-row{grid-template-columns:180px 126px 128px 58px minmax(140px,1fr) 28px!important}
.watch-row{grid-template-columns:180px 126px 128px 58px minmax(140px,1fr) 28px!important}
.security-block{grid-column:1;min-width:0;overflow:hidden}
.price{grid-column:2;min-width:0;white-space:nowrap;padding-right:10px!important}
.change{grid-column:3;min-width:0;white-space:nowrap;padding-right:10px!important}
.market-horizon-cell{grid-column:4;justify-content:center!important}
#marketPreset{grid-column:4!important;justify-self:center!important}
.market-mini-chart{grid-column:5;position:relative;justify-self:center;width:calc(100% - 18px);height:48px;min-width:0;overflow:hidden;border-radius:10px;cursor:crosshair;touch-action:pan-y;background:linear-gradient(180deg,rgba(138,180,255,.025),rgba(255,255,255,.006))}
.market-mini-chart canvas{display:block;width:100%;height:100%}
.market-mini-tooltip{position:absolute;z-index:6;top:2px;transform:translateX(-50%);min-width:88px;max-width:calc(100% - 8px);padding:5px 7px;border:1px solid var(--border);border-radius:8px;background:rgba(11,13,18,.94);box-shadow:0 8px 20px rgba(0,0,0,.28);font-size:9px;line-height:1.2;color:var(--muted);white-space:nowrap;pointer-events:none;overflow:hidden;text-overflow:ellipsis}
.market-mini-tooltip strong{display:block;color:var(--text);font-size:11px;margin-bottom:1px;font-variant-numeric:tabular-nums}.market-mini-tooltip span{display:block;overflow:hidden;text-overflow:ellipsis}
.order-controls{grid-column:6!important}
@media (max-width:720px) and (min-width:641px){
  #marketsPage>.status-row,.watch-row{grid-template-columns:150px 104px 110px 54px minmax(80px,1fr) 26px!important}
  .market-symbol-input{width:126px!important}.price{font-size:18px!important}.change{font-size:15px!important}
}
@media (max-width:640px){
  .market-mini-chart{display:none!important}
  #marketsPage>.status-row{grid-template-columns:minmax(112px,1.05fr) minmax(88px,.8fr) 56px 28px!important}
  .watch-row{grid-template-columns:minmax(112px,1.05fr) minmax(88px,.8fr) 56px 28px!important}
  #marketPreset{grid-column:3!important}.price{grid-column:2!important}.change{grid-column:1 / 3!important}.market-horizon-cell{grid-column:3!important}.order-controls{grid-column:4!important}
}
`;
document.head.appendChild(style);

async function get(url){const r=await fetch(url,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed');return j}
function nfmt(v,d=2){return Number.isFinite(v)?new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v):'—'}
function fmt(v,m={}){if(!Number.isFinite(v))return'—';if(m.format==='percent'||m.assetType==='rate')return`${nfmt(v,3)}%`;if(m.format==='fx'||m.assetType==='fx')return nfmt(v,v>=100?3:5);if(m.format==='number'||m.assetType==='index')return nfmt(v,2);return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:Math.abs(v)>=1?2:4}).format(v)}
function cleanBars(a,t){return(a||[]).map(b=>({...b,ms:Date.parse(b?.t),c:Number(b?.c)})).filter(b=>Number.isFinite(b.ms)&&Number.isFinite(b.c)&&(t==='rate'||b.c>0)).sort((a,b)=>a.ms-b.ms)}
function state(row){const input=row.querySelector('.market-symbol-input'),h=row.querySelector('.horizon-button')?.textContent?.trim()||'1D',s=row.dataset.symbol||input?.dataset.symbol||input?.value?.trim();return s?{s,h,key:`${s}|${h}`} : null}
function near(row){const r=row.getBoundingClientRect();return r.bottom>-120&&r.top<innerHeight+160}
function clearCanvas(canvas){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height)}
function horizonStart(h){const n=new Date();if(h==='CQ')return new Date(Date.UTC(n.getUTCFullYear(),Math.floor(n.getUTCMonth()/3)*3,1)).getTime();if(h==='1W')return n.getTime()-7*86400000;if(h==='1M'){n.setUTCMonth(n.getUTCMonth()-1);return n.getTime()}if(h==='3M'){n.setUTCMonth(n.getUTCMonth()-3);return n.getTime()}if(h==='1Y'){n.setUTCFullYear(n.getUTCFullYear()-1);return n.getTime()}if(h==='3Y'){n.setUTCFullYear(n.getUTCFullYear()-3);return n.getTime()}if(h==='5Y'){n.setUTCFullYear(n.getUTCFullYear()-5);return n.getTime()}return null}
function trimToHorizon(bars,h){if(h==='1D'||!bars.length)return bars;const st=horizonStart(h);if(!Number.isFinite(st))return bars;const out=bars.filter(b=>b.ms>=st);return out.length?out:bars}
function draw(wrap,pointer=null){const d=cache.get(wrap.dataset.key),cv=wrap.querySelector('canvas');if(!d?.bars?.length||!cv)return;const r=cv.getBoundingClientRect(),px=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*px)),h=Math.max(1,Math.round(r.height*px));if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}const c=cv.getContext('2d');c.clearRect(0,0,w,h);const P={l:4*px,r:4*px,t:6*px,b:6*px},iw=w-P.l-P.r,ih=h-P.t-P.b,V=d.bars.map(x=>x.c),first=V[0],last=V.at(-1);let lo=Math.min(...V),hi=Math.max(...V),sp=hi-lo||Math.max(Math.abs(hi)*.01,.01);lo-=sp*.1;hi+=sp*.1;const X=i=>P.l+(d.bars.length===1?iw/2:i/(d.bars.length-1)*iw),Y=v=>P.t+(1-(v-lo)/(hi-lo))*ih;c.strokeStyle='rgba(255,255,255,.055)';c.lineWidth=px;c.beginPath();c.moveTo(P.l,P.t+ih/2);c.lineTo(P.l+iw,P.t+ih/2);c.stroke();c.beginPath();d.bars.forEach((b,i)=>i?c.lineTo(X(i),Y(b.c)):c.moveTo(X(i),Y(b.c)));c.strokeStyle=last>=first?'#34d399':'#fb7185';c.lineWidth=1.7*px;c.lineJoin='round';c.lineCap='round';c.stroke();if(pointer!=null&&d.bars[pointer]){const x=X(pointer),y=Y(d.bars[pointer].c);c.strokeStyle='rgba(255,255,255,.38)';c.lineWidth=px;c.beginPath();c.moveTo(x,P.t);c.lineTo(x,P.t+ih);c.stroke();c.fillStyle=last>=first?'#34d399':'#fb7185';c.beginPath();c.arc(x,y,2.8*px,0,Math.PI*2);c.fill()}}
function hideTip(wrap){wrap.querySelector('.market-mini-tooltip')?.classList.add('hidden');draw(wrap,null)}
function tip(e,wrap){const d=cache.get(wrap.dataset.key),cv=wrap.querySelector('canvas'),t=wrap.querySelector('.market-mini-tooltip');if(!d?.bars?.length||!cv||!t)return;const r=cv.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,e.clientX-r.left)),i=Math.max(0,Math.min(d.bars.length-1,Math.round(x/r.width*(d.bars.length-1)))),b=d.bars[i],dt=new Date(b.ms),opts={month:'short',day:'numeric',year:'numeric'};if(d.meta.horizon==='1D'||d.meta.horizon==='1W'){opts.hour='numeric';opts.minute='2-digit'}t.innerHTML=`<strong>${fmt(b.c,d.meta)}</strong><span>${new Intl.DateTimeFormat('en-US',opts).format(dt)}</span>`;const maxLeft=Math.max(50,r.width-50);t.style.left=`${Math.min(maxLeft,Math.max(50,x))}px`;t.classList.remove('hidden');draw(wrap,i)}
async function load(wrap,force=false){const key=wrap.dataset.key;if(!key)return;const cut=key.lastIndexOf('|'),s=key.slice(0,cut),h=key.slice(cut+1),old=cache.get(key),ttl=CACHE_MS[h]||120000;if(!force&&old&&Date.now()-old.at<ttl){draw(wrap);return}if(pending.has(key))return pending.get(key);const range=RANGE[h]||'1D';const p=get(`/api/bars/${encodeURIComponent(s)}?range=${encodeURIComponent(range)}`).then(j=>{const bars=trimToHorizon(cleanBars(j.bars,j.assetType),h);cache.set(key,{bars,meta:{...j,horizon:h},at:Date.now()});if(wrap.isConnected&&wrap.dataset.key===key)draw(wrap)}).catch(()=>{}).finally(()=>pending.delete(key));pending.set(key,p);return p}
function ensure(row){const st=state(row),order=row.querySelector('.order-controls');if(!st||!order)return;let wrap=row.querySelector('.market-mini-chart');if(!wrap){wrap=document.createElement('div');wrap.className='market-mini-chart';wrap.innerHTML='<canvas aria-hidden="true"></canvas><div class="market-mini-tooltip hidden"></div>';order.before(wrap);const cv=wrap.querySelector('canvas');cv.addEventListener('pointermove',e=>{e.stopPropagation();tip(e,wrap)});cv.addEventListener('pointerdown',e=>{e.stopPropagation();tip(e,wrap)});cv.addEventListener('pointerleave',()=>hideTip(wrap));wrap.addEventListener('click',e=>e.stopPropagation());wrap.addEventListener('dblclick',e=>e.stopPropagation())}if(wrap.dataset.key!==st.key){wrap.dataset.key=st.key;wrap.querySelector('.market-mini-tooltip')?.classList.add('hidden');const cached=cache.get(st.key);if(cached)draw(wrap);else clearCanvas(wrap.querySelector('canvas'))}if(near(row))load(wrap)}
function scan(){raf=0;$$('#watchlist .watch-row').forEach(ensure)}
function schedule(){if(!raf)raf=requestAnimationFrame(scan)}
const watch=$('#watchlist');if(watch){new MutationObserver(schedule).observe(watch,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-symbol']});schedule()}
addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);setInterval(()=>{if(document.body.dataset.page==='markets')schedule()},15000);
