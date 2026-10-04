import { initMacroCalendar } from './macro-calendar.js?v=1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='shaffer-macro-horizons-v1', ORDER_KEY='shaffer-macro-order-v1';
const HORIZONS=['CQ','1D','1W','1M','3M','6M','YTD','1Y','3Y','5Y','10Y','MAX'];
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}};
let horizons=read(KEY,{}),order=read(ORDER_KEY,[]),catalog=[],data=new Map(),loadedAt=0,loading=null,showPage,showHorizon,chartSymbol=null,chartSequence=0,chartData=null,returnY=0;
const rowRequests=new Map();
let renderCalendar=()=>{};
const horizon=s=>HORIZONS.includes(horizons[s])?horizons[s]:'1Y';
const signed=(v,d=2)=>Number.isFinite(v)?`${v>0?'+':''}${new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v)}`:'—';
function format(value,meta){if(!Number.isFinite(value))return'—';const n=new Intl.NumberFormat('en-US',{minimumFractionDigits:meta.decimals??2,maximumFractionDigits:meta.decimals??2}).format(value);if(meta.unit.startsWith('%'))return`${n}%`;if(meta.unit==='$T')return`$${n}T`;return n;}
function changeText(d,h){
  if(!d)return['—',h];
  if(d.noNewObservation)return['—',`No new release · ${h}`];
  if(['% yield','% spread'].includes(d.unit))return[`${signed(d.change*100,1)} bp`,h];
  if(d.unit.startsWith('%'))return[`${signed(d.change,2)} pp`,h];
  return[signed(d.change,d.decimals??2),`${d.unit} · ${h}`];
}
async function get(url){const r=await fetch(url,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Macro feed unavailable');return j;}
function ordered(){const rows=catalog.filter(x=>x.kind!=='calendar'),map=new Map(rows.map(x=>[x.symbol,x]));return [...order.filter(s=>map.has(s)),...rows.map(x=>x.symbol).filter(s=>!order.includes(s))].map(s=>map.get(s));}
function preset(){const unique=[...new Set(catalog.map(x=>horizon(x.symbol)))];return unique.length===1?unique[0]:'Mixed';}
function render(){
  const list=$('#macroList'); if(!list)return;
  renderCalendar(data.get('MAC.CALENDAR'),horizon('MAC.CALENDAR'));
  list.innerHTML=ordered().map((m,i,a)=>{
    const d=data.get(m.symbol),h=horizon(m.symbol),valid=d?.horizon===h,err=d?.error,parts=valid?changeText(d,h):['…',h];
    const dir=valid&&!d.noNewObservation?(d.change>0?'positive':d.change<0?'negative':''):'';
    const price=m.kind==='calendar'&&d?.events?`${d.eventCount} upcoming`:d?.bars?format(d.price,m):err?'Unavailable':'Loading…';
    const date=d?.observationDate?`${m.frequency} · ${d.observationDate}${d.stale?' · Cached':''}`:m.frequency;
    const title=[m.name,m.description,d?.source,date,m.delayNote,d?.error].filter(Boolean).join(' · ');
    return `<div class="watch-row macro-row" data-macro-symbol="${esc(m.symbol)}" tabindex="0" role="button" aria-label="${esc(m.name)} historical graph" title="${esc(title)}"><div class="security-block"><div class="symbol macro-symbol ${m.symbol.length>9?'macro-symbol-long':''}">${esc(m.symbol)}</div><div class="subtext macro-name">${esc(m.name)}</div><div class="subtext macro-description">${esc(m.description)}</div></div><div class="price macro-value">${esc(price)}<span class="change-detail muted">${esc(m.kind==='calendar'?'BLS + BEA schedule':m.unit)}</span><span class="change-detail muted macro-date">${esc(date)}</span></div><div class="change ${dir}">${esc(err&&!d.bars?'—':parts[0])}<span class="change-detail">${esc(err&&!d.bars?(m.kind==='pmi'?'Connect PMI feed':'Feed unavailable'):parts[1])}</span></div><div class="market-horizon-cell"><button class="horizon-button" data-macro-horizon="${esc(m.symbol)}" type="button" aria-label="${esc(m.name)} horizon">${h}</button></div><div class="market-mini-chart macro-mini-chart" data-macro-mini="${esc(m.symbol)}"><canvas aria-label="${esc(m.name)} trend"></canvas><div class="market-mini-tooltip hidden"></div></div><div class="order-controls"><button class="order-button" data-macro-move="-1" data-macro-index="${i}" ${i===0?'disabled':''} aria-label="Move ${esc(m.name)} up">▲</button><button class="order-button" data-macro-move="1" data-macro-index="${i}" ${i===a.length-1?'disabled':''} aria-label="Move ${esc(m.name)} down">▼</button></div></div>`;
  }).join('');
  $('#macroPreset').textContent=`Horizon · ${preset()}`;
  for(const wrap of $$('.macro-mini-chart')){const d=data.get(wrap.dataset.macroMini);if(d?.bars&&d.horizon===horizon(d.symbol))draw(wrap.querySelector('canvas'),d,true);}
}
async function loadRow(meta,force=false){
  const h=horizon(meta.symbol),key=`${meta.symbol}|${h}`;
  if(rowRequests.has(key))return rowRequests.get(key);
  const existing=data.get(meta.symbol);
  if(!force&&existing?.horizon===h&&Date.now()-existing.receivedAt<300000)return;
  const p=(async()=>{try{
    const j=await get(`/api/macro/series/${encodeURIComponent(meta.symbol)}?horizon=${h}`);
    if(horizon(meta.symbol)!==h)return;
    data.set(meta.symbol,{...j,receivedAt:Date.now()});
  }catch(e){if(horizon(meta.symbol)===h)data.set(meta.symbol,{...meta,horizon:h,error:e.message,receivedAt:Date.now()});}
  finally{rowRequests.delete(key);if(document.body.dataset.page==='macro')render();}})();rowRequests.set(key,p);return p;
}
async function refresh(force=false){
  if(loading)return loading.then(()=>refresh(force));
  loading=(async()=>{
    try{
      if(!catalog.length){const j=await get('/api/macro/catalog');catalog=j.series;}
      render();const queue=[...catalog].sort((a,b)=>Number(b.kind==='calendar')-Number(a.kind==='calendar'));
      await Promise.all(Array.from({length:4},async()=>{while(queue.length)await loadRow(queue.shift(),force);}));
      loadedAt=Date.now();
    }catch(e){$('#macroList').innerHTML=`<p class="muted small macro-calendar-empty">${esc(e.message)}</p>`;}finally{loading=null;}
  })();return loading;
}
function setHorizon(symbol,h){horizons[symbol]=h;localStorage.setItem(KEY,JSON.stringify(horizons));render();const m=catalog.find(x=>x.symbol===symbol);if(m)loadRow(m);}
function fit(){const card=$('#macroChartCard');if(!card||document.body.dataset.page!=='macrochart')return;const available=Math.max(220,innerHeight-card.getBoundingClientRect().top-12);card.style.setProperty('height',`${available}px`,'important');card.style.setProperty('min-height','0','important');if(chartData)draw($('#macroChartCanvas'),chartData);}
function draw(canvas,d,compact=false,pointer=null){
  const bars=d.bars||[],r=canvas.getBoundingClientRect(),px=Math.min(devicePixelRatio||1,2);if(r.width<=0||r.height<=0)return;
  canvas.width=Math.round(r.width*px);canvas.height=Math.round(r.height*px);const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  if(!bars.length)return;
  const p=compact?{l:4,r:4,t:6,b:6}:{l:18,r:76,t:24,b:34};for(const k in p)p[k]*=px;
  const vals=bars.map(b=>b.c),times=bars.map(b=>Date.parse(b.t));let lo=Math.min(...vals),hi=Math.max(...vals),span=hi-lo||Math.max(Math.abs(hi)*.01,.01);lo-=span*.1;hi+=span*.1;
  const X=i=>p.l+(times.at(-1)===times[0]?(w-p.l-p.r)/2:(times[i]-times[0])/(times.at(-1)-times[0])*(w-p.l-p.r));
  const Y=v=>p.t+(hi-v)/(hi-lo)*(h-p.t-p.b),color=vals.at(-1)>=vals[0]?'#34d399':'#fb7185';
  c.strokeStyle='rgba(255,255,255,.07)';c.lineWidth=px;c.fillStyle='rgba(205,212,223,.58)';c.font=`${10*px}px system-ui`;
  if(!compact){for(let i=0;i<=4;i++){const y=p.t+i/4*(h-p.t-p.b);c.beginPath();c.moveTo(p.l,y);c.lineTo(w-p.r,y);c.stroke();c.fillText(format(hi-i/4*(hi-lo),d),w-p.r+6*px,y+3*px);}const date=t=>new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(t));c.fillText(date(times[0]),p.l,h-10*px);c.textAlign='right';c.fillText(date(times.at(-1)),w-p.r,h-10*px);c.textAlign='left';}
  c.beginPath();bars.forEach((b,i)=>i?c.lineTo(X(i),Y(b.c)):c.moveTo(X(i),Y(b.c)));c.strokeStyle=color;c.lineWidth=(compact?1.7:2.2)*px;c.lineJoin='round';c.lineCap='round';c.stroke();
  if(bars.length===1||pointer!==null){const i=pointer??0,x=X(i),y=Y(bars[i].c);if(pointer!==null){c.strokeStyle='rgba(255,255,255,.3)';c.lineWidth=px;c.beginPath();c.moveTo(x,p.t);c.lineTo(x,h-p.b);c.stroke();}c.fillStyle=color;c.beginPath();c.arc(x,y,(compact?2.8:4)*px,0,Math.PI*2);c.fill();}
}
function tooltip(e,canvas,d,tip,compact){
  if(!d?.bars?.length)return;const r=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,e.clientX-r.left));
  const start=Date.parse(d.bars[0].t),end=Date.parse(d.bars.at(-1).t),target=start+(end-start)*(compact?x/r.width:Math.max(0,Math.min(1,(x-18)/(r.width-94))));
  let i=0;for(let j=1;j<d.bars.length;j++)if(Math.abs(Date.parse(d.bars[j].t)-target)<Math.abs(Date.parse(d.bars[i].t)-target))i=j;
  const b=d.bars[i];tip.innerHTML=`<strong>${esc(format(b.c,d))}</strong><span>${esc(new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(b.t)))}</span>`;
  tip.style.left=`${Math.max(55,Math.min(r.width-55,x))}px`;if(!compact)tip.style.top=`${Math.max(65,Math.min(r.height-15,e.clientY-r.top))}px`;
  tip.classList.remove('hidden');draw(canvas,d,compact,i);
}
function renderEvents(d){const el=$('#macroCalendarEvents');el.classList.toggle('hidden',d.kind!=='calendar');if(d.kind!=='calendar'){el.innerHTML='';return;}el.innerHTML=`<div class="muted small macro-calendar-heading">Upcoming BLS and BEA releases · agency schedule</div><div class="watchlist">${(d.events||[]).map(e=>`<div class="macro-event"><span>${esc(e.date)}${e.time?` · ${esc(e.time)} ${e.timezone==='UTC'?'UTC':'ET'}`:''}</span><strong>${esc(e.title)}</strong><span class="muted">${esc(e.source)}</span></div>`).join('')||'<div class="macro-event muted">No upcoming releases in the available schedule.</div>'}</div>`;}
async function openChart(symbol){returnY=scrollY;chartSymbol=symbol;showPage('macrochart',false);scrollTo(0,0);const m=catalog.find(x=>x.symbol===symbol);$('#macroChartSymbol').textContent=symbol;$('#macroChartDescription').textContent=m?.description||'';$('#macroChartPrice').textContent='—';$('#macroChartChange').textContent='—';$('#macroChartFeed').textContent=m?.name||symbol;renderRange(horizon(symbol));await loadChart();}
function renderRange(h){$('#macroRangeBar').innerHTML=HORIZONS.map(x=>`<button class="range ${x===h?'active':''}" type="button" data-macro-range="${x}">${x}</button>`).join('');}
async function loadChart(){
  const s=chartSymbol,h=horizon(s),seq=++chartSequence;chartData=null;
  $('#macroChartLoader').textContent='Loading historical observations…';$('#macroChartLoader').classList.remove('hidden');$('#macroChartTooltip').classList.add('hidden');$('#macroCalendarEvents').classList.add('hidden');$('#macroChartNote').textContent='';fit();
  try{const d=await get(`/api/macro/series/${encodeURIComponent(s)}?horizon=${h}`);if(seq!==chartSequence||chartSymbol!==s)return;chartData=d;data.set(s,{...d,receivedAt:Date.now()});
    $('#macroChartPrice').textContent=format(d.price,d);const [change,detail]=changeText(d,h);$('#macroChartChange').textContent=`${change} · ${detail}`;$('#macroChartChange').className=`chart-change ${!d.noNewObservation&&d.change>0?'positive':!d.noNewObservation&&d.change<0?'negative':''}`;
    $('#macroChartFeed').textContent=`${d.name} · ${d.unit} · ${d.source}${d.observationDate?` · ${d.observationDate}`:''}`;
    $('#macroChartNote').textContent=[d.stale?'Showing cached data; provider refresh failed.':null,d.noNewObservation?'No new observation in this horizon; the last published reading is shown at its actual date.':null,d.delayNote,d.historyNote,...(d.warnings||[])].filter(Boolean).join(' ');
    $('#macroChartLoader').classList.toggle('hidden',d.bars.length>0);if(!d.bars.length)$('#macroChartLoader').textContent='No historical observations available.';renderEvents(d);fit();
  }catch(e){if(seq!==chartSequence)return;$('#macroChartLoader').textContent=e.message;$('#macroChartFeed').textContent=catalog.find(x=>x.symbol===s)?.name||s;}
}
function closeChart(){chartSequence++;chartSymbol=null;chartData=null;showPage('macro',false);requestAnimationFrame(()=>scrollTo(0,returnY));}
export function initMacro(api){
  showPage=api.showPage;showHorizon=api.showHorizon;
  renderCalendar=initMacroCalendar({onHistory:()=>openChart('MAC.CALENDAR'),onHorizon:button=>showHorizon(button,horizon('MAC.CALENDAR'),'Set MAC.CALENDAR horizon',h=>setHorizon('MAC.CALENDAR',h),HORIZONS)});
  $('#macroPreset').onclick=()=>showHorizon($('#macroPreset'),preset()==='Mixed'?'1Y':preset(),'Set all Macro horizons',h=>{for(const m of catalog)horizons[m.symbol]=h;localStorage.setItem(KEY,JSON.stringify(horizons));render();refresh();},HORIZONS);
  $('#macroList').addEventListener('click',e=>{const row=e.target.closest('[data-macro-symbol]');if(!row)return;const hb=e.target.closest('[data-macro-horizon]');if(hb){e.stopPropagation();const s=hb.dataset.macroHorizon;showHorizon(hb,horizon(s),`Set ${s} horizon`,h=>setHorizon(s,h),HORIZONS);return;}const move=e.target.closest('[data-macro-move]');if(move){e.stopPropagation();const list=ordered().map(x=>x.symbol),i=Number(move.dataset.macroIndex),n=i+Number(move.dataset.macroMove);if(n>=0&&n<list.length){[list[i],list[n]]=[list[n],list[i]];order=list;localStorage.setItem(ORDER_KEY,JSON.stringify(order));render();}return;}openChart(row.dataset.macroSymbol);});
  $('#macroList').addEventListener('keydown',e=>{if(e.target.matches('.macro-row')&&['Enter',' '].includes(e.key)){e.preventDefault();openChart(e.target.dataset.macroSymbol);}});
  $('#macroList').addEventListener('pointermove',e=>{const wrap=e.target.closest('[data-macro-mini]');if(wrap){const d=data.get(wrap.dataset.macroMini);if(d?.bars)tooltip(e,wrap.querySelector('canvas'),d,wrap.querySelector('.market-mini-tooltip'),true);}});
  $('#macroList').addEventListener('pointerout',e=>{const wrap=e.target.closest('[data-macro-mini]');if(wrap&&!wrap.contains(e.relatedTarget)){wrap.querySelector('.market-mini-tooltip').classList.add('hidden');const d=data.get(wrap.dataset.macroMini);if(d?.bars)draw(wrap.querySelector('canvas'),d,true);}});
  $('#macroChartBack').onclick=closeChart;
  $('#macroRangeBar').onclick=e=>{const b=e.target.closest('[data-macro-range]');if(!b)return;horizons[chartSymbol]=b.dataset.macroRange;localStorage.setItem(KEY,JSON.stringify(horizons));renderRange(b.dataset.macroRange);loadChart();};
  const canvas=$('#macroChartCanvas');for(const event of ['pointermove','pointerdown'])canvas.addEventListener(event,e=>tooltip(e,canvas,chartData,$('#macroChartTooltip'),false));canvas.addEventListener('pointerleave',()=>{$('#macroChartTooltip').classList.add('hidden');if(chartData)draw(canvas,chartData);});
  addEventListener('terminal-page',e=>{if(e.detail==='macro'){render();refresh(Date.now()-loadedAt>300000);}if(e.detail!=='macrochart'){chartSequence++;chartSymbol=null;}});
  addEventListener('resize',()=>{if(document.body.dataset.page==='macro')render();fit();});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.dataset.page==='macrochart')closeChart();});
  addEventListener('focus',()=>{if(document.body.dataset.page==='macro')refresh(true);});
  setInterval(()=>{if(document.body.dataset.page==='macro')refresh(true);else if(document.body.dataset.page==='macrochart')loadChart();},300000);
}
