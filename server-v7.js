import express from 'express';
import { registerMacro } from './macro-api.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '7.0.0';
const MAX = 60;
const ALPACA = 'https://data.alpaca.markets';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search';
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const CNBC = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';
const KEY = process.env.ALPACA_API_KEY_ID;
const SECRET = process.env.ALPACA_API_SECRET_KEY;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36';

app.disable('x-powered-by');
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'geolocation=(), camera=(), microphone=()'});next();});
app.use(express.static(path.join(__dirname,'public'),{etag:true,setHeaders(res,p){res.set('Cache-Control',/\.(?:html|js|css)$/.test(p)||/sw\.js|manifest\.webmanifest/.test(p)?'no-store, max-age=0':'public, max-age=86400');}}));
app.get('/api/version',(_q,r)=>r.set('Cache-Control','no-store').json({version:VERSION,maxSymbols:MAX}));

const N = {
  MAGS:'Roundhill Magnificent Seven ETF',VTI:'Vanguard Total Stock Market ETF',SMH:'VanEck Semiconductor ETF',
  XLF:'Financial Select Sector SPDR Fund',XLE:'Energy Select Sector SPDR Fund',XAR:'SPDR S&P Aerospace & Defense ETF',
  XLI:'Industrial Select Sector SPDR Fund',XLV:'Health Care Select Sector SPDR Fund',XLY:'Consumer Discretionary Select Sector SPDR Fund',
  XLP:'Consumer Staples Select Sector SPDR Fund',XLC:'Communication Services Select Sector SPDR Fund',XLU:'Utilities Select Sector SPDR Fund',
  XLRE:'Real Estate Select Sector SPDR Fund',CIBR:'First Trust Nasdaq Cybersecurity ETF',EEM:'iShares MSCI Emerging Markets ETF',
  ACWI:'iShares MSCI ACWI ETF',AAPL:'Apple Inc.',MSFT:'Microsoft Corporation',NVDA:'NVIDIA Corporation',GOOGL:'Alphabet Inc. Class A',META:'Meta Platforms, Inc.',TSLA:'Tesla, Inc.',AMZN:'Amazon.com, Inc.'
};

const S = {
  'US2Y':{t:'rate',n:'U.S. Treasury 2-Year Yield',f:'percent',fred:'DGS2',cnbc:'US2Y',d:'US 2Y'},
  'US5Y':{t:'rate',n:'U.S. Treasury 5-Year Yield',f:'percent',fred:'DGS5',cnbc:'US5Y',d:'US 5Y'},
  'US10Y':{t:'rate',n:'U.S. Treasury 10-Year Yield',f:'percent',fred:'DGS10',cnbc:'US10Y',d:'US 10Y'},
  'US30Y':{t:'rate',n:'U.S. Treasury 30-Year Yield',f:'percent',fred:'DGS30',cnbc:'US30Y',d:'US 30Y'},
  '2S10S':{t:'rate',n:'10-Year Minus 2-Year Treasury Yield Spread',f:'percent',fred:'T10Y2Y',d:'10Y−2Y'},
  'REAL10Y':{t:'rate',n:'10-Year Treasury Inflation-Indexed Real Yield',f:'percent',fred:'DFII10',d:'REAL 10Y'},
  'SOFR':{t:'rate',n:'Secured Overnight Financing Rate',f:'percent',fred:'SOFR',d:'SOFR'},
  'BE10Y':{t:'rate',n:'10-Year Breakeven Inflation Rate',f:'percent',fred:'T10YIE',d:'BE10Y'},
  'IGOAS':{t:'rate',n:'ICE BofA U.S. Corporate Index OAS (Investment Grade)',f:'percent',fred:'BAMLC0A0CM',d:'IG OAS'},
  'HYOAS':{t:'rate',n:'ICE BofA U.S. High Yield Index OAS',f:'percent',fred:'BAMLH0A0HYM2',d:'HY OAS'},
  'MOVE':{t:'index',n:'ICE BofA MOVE Index',f:'number',y:'^MOVE',d:'MOVE',src:'Yahoo · ICE MOVE'},
  'DX-Y.NYB':{t:'index',n:'ICE U.S. Dollar Index',f:'number',y:'DX-Y.NYB',d:'DXY',src:'Yahoo · ICE DXY'},
  'BTC-USD':{t:'crypto',n:'Bitcoin / U.S. Dollar',f:'currency',y:'BTC-USD',d:'BTC-USD'},
  'USDJPY=X':{t:'fx',n:'U.S. Dollar / Japanese Yen',f:'fx',y:'USDJPY=X',d:'USD/JPY'},
  'GBPUSD=X':{t:'fx',n:'British Pound / U.S. Dollar',f:'fx',y:'GBPUSD=X',d:'GBP/USD'},
  'EURUSD=X':{t:'fx',n:'Euro / U.S. Dollar',f:'fx',y:'EURUSD=X',d:'EUR/USD'},
  'AUDUSD=X':{t:'fx',n:'Australian Dollar / U.S. Dollar',f:'fx',y:'AUDUSD=X',d:'AUD/USD'},
  'USDCNH=X':{t:'fx',n:'U.S. Dollar / Offshore Chinese Yuan',f:'fx',y:'USDCNH=X',d:'USD/CNH'},
  'CL=F':{t:'future',n:'WTI Crude Oil Futures (Front Month)',f:'currency',y:'CL=F',d:'CL=F'},
  'NG=F':{t:'future',n:'Henry Hub Natural Gas Futures (Front Month)',f:'currency',y:'NG=F',d:'NG=F'},
  'GC=F':{t:'future',n:'Gold Futures (Front Month)',f:'currency',y:'GC=F',d:'GC=F'},
  'HG=F':{t:'future',n:'Copper Futures (Front Month)',f:'currency',y:'HG=F',d:'HG=F'},
  'ES=F':{t:'future',n:'E-mini S&P 500 Futures',f:'currency',y:'ES=F',d:'ES=F'},
  'NQ=F':{t:'future',n:'E-mini Nasdaq-100 Futures',f:'currency',y:'NQ=F',d:'NQ=F'},
  'YM=F':{t:'future',n:'Mini Dow Futures',f:'currency',y:'YM=F',d:'YM=F'},
  'NKD=F':{t:'future',n:'Nikkei 225 USD Futures',f:'currency',y:'NKD=F',d:'NKD=F'},
  '^GSPC':{t:'index',n:'S&P 500 Index',f:'number',y:'^GSPC',d:'SPX'},
  '^NDX':{t:'index',n:'Nasdaq-100 Index',f:'number',y:'^NDX',d:'NDX'},
  '^DJI':{t:'index',n:'Dow Jones Industrial Average',f:'number',y:'^DJI',d:'DJI'},
  '^VIX':{t:'index',n:'CBOE Volatility Index',f:'number',y:'^VIX',d:'VIX'},
  '^SKEW':{t:'index',n:'CBOE SKEW Index',f:'number',y:'^SKEW',d:'SKEW'},
  '^FTSE':{t:'index',n:'FTSE 100 Index',f:'number',y:'^FTSE',d:'FTSE'},
  '^N225':{t:'index',n:'Nikkei 225 Index',f:'number',y:'^N225',d:'N225'},
  '000300.SS':{t:'index',n:'CSI 300 Index',f:'number',y:'000300.SS',d:'CSI 300'}
};

const A = {
  SPX:'^GSPC',NDX:'^NDX',DJI:'^DJI',DOW:'^DJI',VIX:'^VIX',SKEW:'^SKEW',FTSE:'^FTSE',FTSE100:'^FTSE',
  N225:'^N225',NIKKEI:'^N225',NIKKEI225:'^N225',CSI300:'000300.SS','2S10S':'2S10S','10Y-2Y':'2S10S','10Y2Y':'2S10S',
  REAL10Y:'REAL10Y','REAL 10Y':'REAL10Y',TIPS10Y:'REAL10Y','2Y':'US2Y','5Y':'US5Y','10Y':'US10Y','30Y':'US30Y',
  'USD/JPY':'USDJPY=X',USDJPY:'USDJPY=X','GBP/USD':'GBPUSD=X',GBPUSD:'GBPUSD=X','EUR/USD':'EURUSD=X',EURUSD:'EURUSD=X',
  'AUD/USD':'AUDUSD=X',AUDUSD:'AUDUSD=X','USD/CNH':'USDCNH=X',USDCNH:'USDCNH=X',DXY:'DX-Y.NYB',BTC:'BTC-USD',BITCOIN:'BTC-USD',
  'IG OAS':'IGOAS','HY OAS':'HYOAS',IGOAS:'IGOAS',HYOAS:'HYOAS',INFLATION:'BE10Y','NAT GAS':'NG=F','NATURAL GAS':'NG=F',
  NATGAS:'NG=F',COPPER:'HG=F',WTI:'CL=F',OIL:'CL=F',GOLD:'GC=F'
};

const canon = x => { const r=String(x||'').trim().toUpperCase(); return A[r] || r.replace(/[^A-Z0-9.^=\-\/]/g,'').slice(0,24); };
function infer(s){
  if(S[s]) return S[s];
  if(s.endsWith('=F')) return {t:'future',n:N[s]||s,f:'currency',d:s,y:s};
  if(s.endsWith('=X')) return {t:'fx',n:N[s]||s,f:'fx',d:s.replace('=X',''),y:s};
  if(s.startsWith('^')) return {t:'index',n:N[s]||s,f:'number',d:s,y:s};
  if(/-USD$/.test(s)) return {t:'crypto',n:N[s]||s,f:'currency',d:s,y:s};
  return {t:'equity',n:N[s]||s,f:'currency',d:s};
}
const desc = s => infer(s);
const num = x => { if(x===null||x===undefined||x==='') return null; const n=Number(String(x).replace(/[,%$]/g,'')); return Number.isFinite(n)?n:null; };
const rawNum = x => { if(x===null||x===undefined||x==='') return null; const n=Number(x); return Number.isFinite(n)?n:null; };
async function text(url,opt={}){const r=await fetch(url,{...opt,signal:AbortSignal.timeout(9000)});if(!r.ok)throw new Error(`Data request failed (${r.status})`);return r.text();}
async function json(url,opt={}){const r=await fetch(url,{...opt,signal:AbortSignal.timeout(9000)}),t=await r.text();let b={};try{b=t?JSON.parse(t):{}}catch{b={raw:t}}if(!r.ok)throw new Error(b?.message||b?.chart?.error?.description||`Data request failed (${r.status})`);return b;}
async function ychart(sym,range='1d',interval='1m'){const u=new URL(`${YAHOO}/${encodeURIComponent(sym)}`);u.searchParams.set('range',range);u.searchParams.set('interval',interval);u.searchParams.set('includePrePost','true');const d=await json(u,{headers:{'User-Agent':UA,Accept:'application/json'}});const x=d?.chart?.result?.[0];if(!x)throw new Error(d?.chart?.error?.description||`No Yahoo data for ${sym}`);return x;}
async function ychartPeriod(sym,start,end,interval='1d'){const u=new URL(`${YAHOO}/${encodeURIComponent(sym)}`);u.searchParams.set('period1',String(Math.floor(start.getTime()/1000)));u.searchParams.set('period2',String(Math.floor((end.getTime()+86400000)/1000)));u.searchParams.set('interval',interval);u.searchParams.set('events','history');u.searchParams.set('includePrePost','false');const d=await json(u,{headers:{'User-Agent':UA,Accept:'application/json'}});const x=d?.chart?.result?.[0];if(!x)throw new Error(d?.chart?.error?.description||`No Yahoo history for ${sym}`);return x;}
async function yahooSearch(q){const u=new URL(YAHOO_SEARCH);u.searchParams.set('q',q);u.searchParams.set('quotesCount','10');u.searchParams.set('newsCount','0');return json(u,{headers:{'User-Agent':UA,Accept:'application/json'}});}
async function yquote(s){const d=desc(s),x=await ychart(d.y||s),m=x.meta||{},cs=x?.indicators?.quote?.[0]?.close||[],p=num(m.regularMarketPrice)??[...cs].reverse().map(rawNum).find(Number.isFinite)??null,pc=num(m.chartPreviousClose)??num(m.previousClose),ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:null;return {symbol:s,displaySymbol:d.d||s,name:d.n||s,assetType:d.t,format:d.f,price:p,previousClose:pc,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:null,source:d.src||(d.t==='fx'?'Yahoo FX':d.t==='future'?'Yahoo Futures':d.t==='crypto'?'Yahoo Crypto':d.t==='index'?'Yahoo Index':'Yahoo'),updatedAt:m.regularMarketTime?new Date(m.regularMarketTime*1000).toISOString():null};}
async function fredRows(id,start='1900-01-01',end=new Date().toISOString().slice(0,10)){const u=new URL(FRED);u.searchParams.set('id',id);u.searchParams.set('cosd',start);u.searchParams.set('coed',end);const lines=(await text(u,{headers:{'User-Agent':UA,Accept:'text/csv'}})).trim().split(/\r?\n/).slice(1),rows=[];for(const l of lines){const [date,val]=l.split(','),v=num(val);if(date&&Number.isFinite(v))rows.push({date,value:v});}return rows;}
async function fquote(s){const d=desc(s),rows=await fredRows(d.fred),a=rows.at(-1),b=rows.at(-2),p=a?.value??null,pc=b?.value??null,ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:null;return {symbol:s,displaySymbol:d.d,name:d.n,assetType:'rate',format:'percent',price:p,previousClose:pc,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:null,source:s==='SOFR'?'New York Fed / FRED':['IGOAS','HYOAS'].includes(s)?'FRED · ICE BofA':s==='BE10Y'?'FRED · Breakeven Inflation':'FRED',updatedAt:a?.date||null};}
async function cquote(s){const d=desc(s),u=new URL(CNBC);u.searchParams.set('symbols',d.cnbc);u.searchParams.set('requestMethod','itv');u.searchParams.set('noform','1');u.searchParams.set('partnerId','2');u.searchParams.set('fund','1');u.searchParams.set('output','json');const j=await json(u,{headers:{'User-Agent':UA}}),q=j?.FormattedQuoteResult?.FormattedQuote?.[0],p=num(q?.last),pc=num(q?.previous_day_closing),ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:num(q?.change);if(!Number.isFinite(p))throw new Error(`No CNBC quote for ${s}`);return {symbol:s,displaySymbol:d.d,name:d.n,assetType:'rate',format:'percent',price:p,previousClose:pc,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:num(q?.change_pct),source:'CNBC / Tradeweb',updatedAt:q?.last_time||null};}
async function equityName(s){if(N[s])return N[s];try{const j=await yahooSearch(s),q=(j.quotes||[]).find(x=>String(x.symbol).toUpperCase()===s);return q?.longname||q?.shortname||s}catch{return s}}
async function quoteOne(s){const d=desc(s);if(d.t==='rate'){if(d.cnbc)try{return await cquote(s)}catch{}return fquote(s)}if(d.t==='equity'&&KEY&&SECRET)try{const u=new URL('/v2/stocks/snapshots',ALPACA);u.searchParams.set('symbols',s);u.searchParams.set('feed','iex');const j=await json(u,{headers:{'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SECRET}}),x=j?.[s]||{},p=rawNum(x?.latestTrade?.p??x?.minuteBar?.c??x?.dailyBar?.c),pc=rawNum(x?.prevDailyBar?.c),ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:null;if(Number.isFinite(p))return {symbol:s,displaySymbol:s,name:await equityName(s),assetType:'equity',format:'currency',price:p,previousClose:pc,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:null,source:'Alpaca IEX',updatedAt:x?.latestTrade?.t||null};}catch{}const q=await yquote(s);if(d.t==='equity')q.name=await equityName(s);return q;}

app.get('/api/quotes',async(req,res)=>{const syms=[...new Set(String(req.query.symbols||'').split(',').map(canon).filter(Boolean))].slice(0,MAX);if(!syms.length)return res.status(400).json({error:'No symbols supplied.'});const quotes=await Promise.all(syms.map(async s=>{try{return await quoteOne(s)}catch(e){const d=desc(s);return {symbol:s,displaySymbol:d.d||s,name:d.n||s,assetType:d.t,format:d.f,price:null,previousClose:null,change:null,changePct:null,source:'Unavailable',error:e.message}}}));res.set('Cache-Control','no-store').json({quotes,serverTime:new Date().toISOString(),maxSymbols:MAX});});

app.get('/api/search',async(req,res)=>{const q=String(req.query.q||'').trim();if(!q)return res.json({results:[]});const upper=q.toUpperCase(),out=[],seen=new Set();const push=x=>{const s=canon(x.symbol);if(!s||seen.has(s))return;seen.add(s);const d=desc(s);out.push({symbol:s,displaySymbol:x.displaySymbol||d.d||s,name:x.name||d.n||s,assetType:x.assetType||d.t,exchange:x.exchange||''});};
  for(const [s,d] of Object.entries(S)){const aliases=Object.entries(A).filter(([,v])=>v===s).map(([k])=>k).join(' ');if(`${s} ${d.d||''} ${d.n||''} ${aliases}`.toUpperCase().includes(upper))push({symbol:s,displaySymbol:d.d,name:d.n,assetType:d.t});}
  for(const [s,n] of Object.entries(N)){if(`${s} ${n}`.toUpperCase().includes(upper))push({symbol:s,name:n,assetType:'equity'});}
  try{const j=await yahooSearch(q);for(const x of j.quotes||[]){if(out.length>=10)break;const type=String(x.quoteType||'').toUpperCase();if(!['EQUITY','ETF','INDEX','FUTURE','CURRENCY','CRYPTOCURRENCY','MUTUALFUND'].includes(type))continue;const map={EQUITY:'equity',ETF:'equity',INDEX:'index',FUTURE:'future',CURRENCY:'fx',CRYPTOCURRENCY:'crypto',MUTUALFUND:'equity'};push({symbol:x.symbol,displaySymbol:x.symbol,name:x.longname||x.shortname||x.symbol,assetType:map[type]||'equity',exchange:x.exchDisp||x.exchange||''});}}catch{}
  res.set('Cache-Control','no-store').json({results:out.slice(0,10)});
});

const YR={'1D':['1d','1m'],'5D':['5d','5m'],'1M':['1mo','30m'],'3M':['3mo','1d'],'6M':['6mo','1d'],'YTD':['ytd','1d'],'1Y':['1y','1d'],'5Y':['5y','1d']};
const days={'1D':6,'5D':10,'1M':40,'3M':105,'6M':195,'1Y':375,'5Y':1840};
const startFor=r=>r==='YTD'?new Date(Date.UTC(new Date().getUTCFullYear(),0,1)):new Date(Date.now()-(days[r]||6)*86400000);
async function ybars(s,r){const d=desc(s),[range,interval]=YR[r],x=await ychart(d.y||s,range,interval),ts=x.timestamp||[],q=x?.indicators?.quote?.[0]||{},bars=[];for(let i=0;i<ts.length;i++){const c=rawNum(q.close?.[i]);if(!Number.isFinite(c)||c<=0)continue;bars.push({t:new Date(ts[i]*1000).toISOString(),o:rawNum(q.open?.[i]),h:rawNum(q.high?.[i]),l:rawNum(q.low?.[i]),c,v:rawNum(q.volume?.[i])})}return {bars,source:d.src||(d.t==='future'?'Yahoo Futures':d.t==='fx'?'Yahoo FX':d.t==='crypto'?'Yahoo Crypto':d.t==='index'?'Yahoo Index':'Yahoo'),timeframe:interval};}
async function fbars(s,r){const d=desc(s),rows=await fredRows(d.fred,startFor(r).toISOString().slice(0,10)),bars=rows.map(x=>({t:`${x.date}T12:00:00Z`,o:x.value,h:x.value,l:x.value,c:x.value,v:null}));return {bars,source:s==='SOFR'?'New York Fed / FRED':['IGOAS','HYOAS'].includes(s)?'FRED · ICE BofA':s==='BE10Y'?'FRED · Breakeven Inflation':'FRED',timeframe:'1Day'};}
async function abars(s,r){if(!KEY||!SECRET)throw new Error('Alpaca credentials are not configured.');const cfg={'1D':[1,'1Min'],'5D':[7,'5Min'],'1M':[35,'1Hour'],'3M':[100,'1Day'],'6M':[190,'1Day'],'YTD':[null,'1Day'],'1Y':[370,'1Day'],'5Y':[1835,'1Day']}[r],now=new Date(),st=r==='YTD'?new Date(Date.UTC(now.getUTCFullYear(),0,1)):new Date(now-cfg[0]*86400000),u=new URL(`/v2/stocks/${encodeURIComponent(s)}/bars`,ALPACA);u.searchParams.set('timeframe',cfg[1]);u.searchParams.set('start',st.toISOString());u.searchParams.set('end',now.toISOString());u.searchParams.set('adjustment','raw');u.searchParams.set('feed','iex');u.searchParams.set('sort','asc');u.searchParams.set('limit','10000');const j=await json(u,{headers:{'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SECRET}});return {bars:(j.bars||[]).map(b=>({t:b.t,o:rawNum(b.o),h:rawNum(b.h),l:rawNum(b.l),c:rawNum(b.c),v:rawNum(b.v)})).filter(b=>Number.isFinite(b.c)&&b.c>0),source:'Alpaca IEX',timeframe:cfg[1]};}
async function barsFor(s,r){const d=desc(s);if(d.t==='rate'&&d.fred)return fbars(s,r);if(d.t==='equity')try{return await abars(s,r)}catch{}return ybars(s,r)}
app.get('/api/bars/:symbol',async(req,res)=>{const s=canon(req.params.symbol),r=String(req.query.range||'1D').toUpperCase(),d=desc(s);if(!YR[r])return res.status(400).json({error:'Unsupported chart range.'});try{const x=await barsFor(s,r);res.set('Cache-Control','no-store').json({symbol:s,displaySymbol:d.d||s,name:d.n||await equityName(s),assetType:d.t,format:d.f,range:r,...x})}catch(e){res.status(502).json({error:e.message||'Chart request failed.'})}});

const PERF=new Set(['CQ','1D','1W','1M','3M','1Y','3Y','5Y']);
function performanceStart(h){const n=new Date();if(h==='CQ')return new Date(Date.UTC(n.getUTCFullYear(),Math.floor(n.getUTCMonth()/3)*3,1));const d=new Date(n);if(h==='1D')d.setUTCDate(d.getUTCDate()-1);else if(h==='1W')d.setUTCDate(d.getUTCDate()-7);else if(h==='1M')d.setUTCMonth(d.getUTCMonth()-1);else if(h==='3M')d.setUTCMonth(d.getUTCMonth()-3);else if(h==='1Y')d.setUTCFullYear(d.getUTCFullYear()-1);else if(h==='3Y')d.setUTCFullYear(d.getUTCFullYear()-3);else if(h==='5Y')d.setUTCFullYear(d.getUTCFullYear()-5);return d;}
function bufferDate(d){return new Date(d.getTime()-14*86400000)}
async function ahistory(s,start,end){if(!KEY||!SECRET)throw new Error('Alpaca credentials are not configured.');const u=new URL(`/v2/stocks/${encodeURIComponent(s)}/bars`,ALPACA);u.searchParams.set('timeframe','1Day');u.searchParams.set('start',start.toISOString());u.searchParams.set('end',end.toISOString());u.searchParams.set('adjustment','raw');u.searchParams.set('feed','iex');u.searchParams.set('sort','asc');u.searchParams.set('limit','10000');const j=await json(u,{headers:{'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SECRET}});return (j.bars||[]).map(b=>({t:Date.parse(b.t),c:rawNum(b.c),date:String(b.t).slice(0,10)})).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.c)&&x.c>0)}
async function yhistory(s,start,end){const d=desc(s),x=await ychartPeriod(d.y||s,start,end,'1d'),ts=x.timestamp||[],q=x?.indicators?.quote?.[0]||{},out=[];for(let i=0;i<ts.length;i++){const c=rawNum(q.close?.[i]);if(!Number.isFinite(c)||c<=0)continue;const t=ts[i]*1000;out.push({t,c,date:new Date(t).toISOString().slice(0,10)})}return out}
async function historyFor(s,start,end){const d=desc(s);if(d.t==='rate'&&d.fred){const rows=await fredRows(d.fred,start.toISOString().slice(0,10),end.toISOString().slice(0,10));return rows.map(x=>({t:Date.parse(`${x.date}T12:00:00Z`),c:x.value,date:x.date})).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.c))}if(d.t==='equity'&&KEY&&SECRET)try{return await ahistory(s,start,end)}catch{}return yhistory(s,start,end)}
function chooseBaseline(points,start){let base=null;for(const p of points){if(p.t<=start.getTime())base=p;else break}return base||points.find(p=>p.t>=start.getTime())||points[0]||null;}
app.get('/api/performance/:symbol',async(req,res)=>{const s=canon(req.params.symbol),h=String(req.query.horizon||'1D').toUpperCase();if(!PERF.has(h))return res.status(400).json({error:'Unsupported performance horizon.'});try{if(h==='1D'){const q=await quoteOne(s);return res.set('Cache-Control','no-store').json({symbol:s,horizon:h,baseline:q.previousClose,baselineDate:null,currentHistorical:q.price,currentHistoricalDate:q.updatedAt})}const start=performanceStart(h),end=new Date(),points=await historyFor(s,bufferDate(start),end);if(!points.length)throw new Error('No historical data available for this horizon.');points.sort((a,b)=>a.t-b.t);const base=chooseBaseline(points,start),latest=points.at(-1);if(!base||!Number.isFinite(base.c))throw new Error('No baseline value available for this horizon.');res.set('Cache-Control','no-store').json({symbol:s,horizon:h,baseline:base.c,baselineDate:base.date,currentHistorical:latest?.c??null,currentHistoricalDate:latest?.date??null})}catch(e){res.status(502).json({error:e.message||'Performance request failed.'})}});

app.get('/api/horizon/:symbol',async(req,res)=>{const s=canon(req.params.symbol),h=String(req.query.horizon||'1D').toUpperCase(),d=desc(s);if(!PERF.has(h))return res.status(400).json({error:'Unsupported horizon.'});try{const q=await quoteOne(s);let bars=[],baseline=q.previousClose,baselineDate=null,source=q.source;if(h==='1D'){const x=await barsFor(s,'1D');bars=x.bars;source=x.source||source;}else{const start=performanceStart(h),end=new Date(),pts=await historyFor(s,bufferDate(start),end);pts.sort((a,b)=>a.t-b.t);const base=chooseBaseline(pts,start);if(base){baseline=base.c;baselineDate=base.date;}bars=pts.filter(p=>p.t>=(base?.t??start.getTime())).map(p=>({t:new Date(p.t).toISOString(),c:p.c,o:p.c,h:p.c,l:p.c,v:null}));if(Number.isFinite(q.price)){const last=bars.at(-1);if(!last||Math.abs(Date.parse(last.t)-Date.now())>6*3600000)bars.push({t:new Date().toISOString(),c:q.price,o:q.price,h:q.price,l:q.price,v:null});}}
  const ch=Number.isFinite(q.price)&&Number.isFinite(baseline)?q.price-baseline:null,pct=Number.isFinite(ch)&&baseline?ch/baseline*100:null;res.set('Cache-Control','no-store').json({symbol:s,displaySymbol:q.displaySymbol||d.d||s,name:q.name||d.n||s,assetType:q.assetType||d.t,format:q.format||d.f,source,price:q.price,baseline,baselineDate,change:ch,changePct:pct,horizon:h,bars})}catch(e){res.status(502).json({error:e.message||'Horizon request failed.'})}});

registerMacro(app);

app.use((_q,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`Shaffer Terminal v${VERSION} listening on ${PORT}`));

