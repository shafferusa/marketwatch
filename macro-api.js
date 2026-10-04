import { MACRO_SERIES } from './macro-series.js';

const CACHE_MS = 15 * 60_000;
const cache = new Map(), pending = new Map();
const BY_SYMBOL = new Map(MACRO_SERIES.map(x => [x.symbol, x]));
const DAY = 86_400_000;
export const HORIZONS = ['CQ','1D','1W','1M','3M','6M','YTD','1Y','3Y','5Y','10Y','MAX'];

async function request(url, format = 'text') {
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { Accept: format === 'json' ? 'application/json' : 'text/csv,text/html,text/calendar', 'User-Agent':'ShafferTerminal/8.1' } });
  if (!r.ok) throw new Error(`Data provider returned ${r.status}`);
  return format === 'json' ? r.json() : r.text();
}
export function parseCSV(csv) {
  return csv.trim().split(/\r?\n/).slice(1).flatMap(line => {
    const [date, raw] = line.split(',');
    const value = raw?.trim() && raw.trim() !== '.' ? Number(raw) : NaN;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) ? [{date, value}] : [];
  }).sort((a,b) => a.date.localeCompare(b.date));
}
export function transformRows(rows, meta) {
  const byDate = new Map(rows.map(x => [x.date, x.value]));
  return rows.flatMap((x, i) => {
    let v = x.value;
    if (['yoy','mom','diff'].includes(meta.transform)) {
      const d = new Date(`${x.date}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - (meta.transform === 'yoy' ? 12 : 1));
      const prev = byDate.get(d.toISOString().slice(0,10));
      if (!Number.isFinite(prev) || (meta.transform !== 'diff' && prev === 0)) return [];
      v = meta.transform === 'diff' ? v - prev : (v / prev - 1) * 100;
    }
    return [{date:x.date, value:v * (meta.scale ?? 1)}];
  });
}
export function startFor(horizon, now = new Date()) {
  const d = new Date(now); d.setUTCHours(0,0,0,0);
  if (horizon === 'MAX') return new Date('1900-01-01T00:00:00Z');
  if (horizon === 'CQ') return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth()/3)*3, 1));
  if (horizon === 'YTD') return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  if (horizon === '1D' || horizon === '1W') return new Date(d.getTime() - (horizon === '1D' ? 1 : 7)*DAY);
  if (horizon.endsWith('M')) d.setUTCMonth(d.getUTCMonth() - Number.parseInt(horizon));
  if (horizon.endsWith('Y')) d.setUTCFullYear(d.getUTCFullYear() - Number.parseInt(horizon));
  return d;
}
export function windowRows(rows, horizon, now = new Date()) {
  const start = startFor(horizon, now).toISOString().slice(0,10);
  const visible = rows.filter(x => x.date >= start && x.date <= now.toISOString().slice(0,10));
  // Carry in a real previous observation at its actual date, never create daily points for monthly data.
  const before = rows.filter(x => x.date < start).at(-1);
  const points = before ? [before, ...visible] : visible;
  const latest = rows.filter(x => x.date <= now.toISOString().slice(0,10)).at(-1);
  const baseline = before || visible[0] || latest;
  return { points: points.length ? points : latest ? [latest] : [], baseline, noNewObservation: visible.length === 0 };
}
async function fred(meta) {
  let rows;
  if (process.env.FRED_API_KEY) {
    const u = new URL('https://api.stlouisfed.org/fred/series/observations');
    u.search = new URLSearchParams({series_id:meta.fred,api_key:process.env.FRED_API_KEY,file_type:'json'});
    rows = ((await request(u, 'json')).observations || []).flatMap(x => x.value !== '.' && Number.isFinite(Number(x.value)) ? [{date:x.date,value:Number(x.value)}] : []);
  } else {
    const u = new URL('https://fred.stlouisfed.org/graph/fredgraph.csv'); u.searchParams.set('id', meta.fred);
    rows = parseCSV(await request(u));
  }
  if (!rows.length) throw new Error('No observations returned by FRED');
  return {rows:transformRows(rows, meta),source:meta.source || 'FRED',sourceUrl:`https://fred.stlouisfed.org/series/${meta.fred}`};
}

export function parseICS(text, source, sourceUrl) {
  const unfolded = text.replace(/\r?\n[ \t]/g,'');
  return [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].flatMap(m=>{
    const field = key => m[1].match(new RegExp(`(?:^|\\n)${key}(?:;[^:]*)?:([^\\r\\n]+)`))?.[1];
    const raw = field('DTSTART'), title = field('SUMMARY');
    if (!raw || !title || /(?:^|\n)STATUS:CANCELLED/.test(m[1])) return [];
    const t = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!t) return [];
    const date = `${t[1]}-${t[2]}-${t[3]}`, time=t[4]?`${t[4]}:${t[5]}`:null;
    return [{date,time,timezone:t[7]?'UTC':'America/New_York',title:title.replace(/\\,/g,',').replace(/\\n/g,' '),source,sourceUrl}];
  });
}
async function calendar() {
  const feeds = [
    ['BLS','https://www.bls.gov/schedule/news_release/bls.ics'],
    ['BEA','https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics']
  ];
  const settled = await Promise.allSettled(feeds.map(async([name,url])=>parseICS(await request(url),name,url)));
  const events = settled.flatMap(r=>r.status==='fulfilled'?r.value:[]).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  if (!events.length) throw new Error('Economic release calendars are unavailable');
  const unique = [...new Map(events.map(e=>[`${e.source}|${e.date}|${e.title}`,e])).values()];
  const counts = new Map();
  for (const e of unique) counts.set(e.date,(counts.get(e.date)||0)+1);
  const today = new Date().toISOString().slice(0,10);
  // Calendar graph measures published scheduled releases per day, not an economic index.
  const rows = [...counts].filter(([date])=>date<=today).map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date));
  return {rows,events:unique,source:feeds.filter((_,i)=>settled[i].status==='fulfilled').map(x=>x[0]).join(' + '),sourceUrl:'https://www.bls.gov/schedule/',historyNote:'Scheduled release counts; history is limited to dates retained by the agency calendar feeds.',warnings:settled.flatMap((r,i)=>r.status==='rejected'?[`${feeds[i][0]} calendar unavailable`]:[])};
}

async function load(meta) {
  const old=cache.get(meta.symbol);
  if (old && Date.now()-old.fetchedAt < CACHE_MS) return old;
  if (pending.has(meta.symbol)) return pending.get(meta.symbol);
  const p=(async()=>{
    try {
      const data = await (meta.kind==='calendar'?calendar():fred(meta));
      const result={...data,fetchedAt:Date.now(),stale:false}; cache.set(meta.symbol,result); return result;
    } catch(e) {
      if(old) return {...old,stale:true,error:e.message};
      throw e;
    } finally {pending.delete(meta.symbol);}
  })(); pending.set(meta.symbol,p);return p;
}
export async function seriesData(symbol,horizon='1Y') {
  const meta=BY_SYMBOL.get(symbol); if(!meta) throw new Error('Unknown Macro ticker');
  const data=await load(meta), rows=data.rows.filter(x=>x.date<=new Date().toISOString().slice(0,10));
  const last=rows.at(-1),previous=rows.at(-2), win=windowRows(rows,horizon);
  const change=last&&win.baseline?last.value-win.baseline.value:null;
  const events=data.events?.filter(e=>e.date>=new Date().toISOString().slice(0,10));
  return {...meta,source:data.source,sourceUrl:data.sourceUrl,price:last?.value??null,previous:previous?.value??null,observationDate:last?.date??null,previousDate:previous?.date??null,change,baselineDate:win.baseline?.date??null,changePct:win.baseline?.value ? change/Math.abs(win.baseline.value)*100:null,horizon,noNewObservation:win.noNewObservation,bars:win.points.map(x=>({t:`${x.date}T12:00:00Z`,c:x.value})),events:events?.slice(0,100),eventCount:events?.length,historyStart:rows[0]?.date,historyNote:data.historyNote,stale:data.stale,error:data.error,warnings:data.warnings,fetchedAt:new Date(data.fetchedAt).toISOString()};
}
export function registerMacro(app) {
  app.get('/api/macro/catalog',(_q,r)=>r.set('Cache-Control','no-store').json({series:MACRO_SERIES,horizons:HORIZONS}));
  app.get('/api/macro/series/:symbol',async(q,r)=>{
    const symbol=String(q.params.symbol).toUpperCase(),horizon=String(q.query.horizon||'1Y').toUpperCase();
    if(!BY_SYMBOL.has(symbol))return r.status(404).json({error:'Unknown Macro ticker'});
    if(!HORIZONS.includes(horizon))return r.status(400).json({error:'Unsupported Macro horizon'});
    try{r.set('Cache-Control','no-store').json(await seriesData(symbol,horizon));}catch(e){r.status(502).json({symbol,error:e.message});}
  });
}
