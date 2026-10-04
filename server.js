import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app=express(), PORT=Number(process.env.PORT||3000), __dirname=path.dirname(fileURLToPath(import.meta.url));
const VERSION='5.1.0', MAX=50;
const ALPACA='https://data.alpaca.markets', YAHOO='https://query1.finance.yahoo.com/v8/finance/chart', FRED='https://fred.stlouisfed.org/graph/fredgraph.csv', CNBC='https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';
const KEY=process.env.ALPACA_API_KEY_ID, SECRET=process.env.ALPACA_API_SECRET_KEY;
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36';

app.disable('x-powered-by');
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'geolocation=(), camera=(), microphone=()'});next();});
app.use(express.static(path.join(__dirname,'public'),{etag:true,setHeaders(res,p){res.set('Cache-Control',/\.(?:html|js|css)$/.test(p)||/sw\.js|manifest\.webmanifest/.test(p)?'no-store, max-age=0':'public, max-age=86400');}}));
app.get('/api/version',(_q,r)=>r.set('Cache-Control','no-store').json({version:VERSION}));

const N={MAGS:'Roundhill Magnificent Seven ETF',SMH:'VanEck Semiconductor ETF',XLF:'Financial Select Sector SPDR Fund',XLE:'Energy Select Sector SPDR Fund',XAR:'SPDR S&P Aerospace & Defense ETF',XLI:'Industrial Select Sector SPDR Fund',XLV:'Health Care Select Sector SPDR Fund',XLY:'Consumer Discretionary Select Sector SPDR Fund',XLP:'Consumer Staples Select Sector SPDR Fund',XLC:'Communication Services Select Sector SPDR Fund',XLU:'Utilities Select Sector SPDR Fund',XLRE:'Real Estate Select Sector SPDR Fund',CIBR:'First Trust Nasdaq Cybersecurity ETF',VTI:'Vanguard Total Stock Market ETF',EEM:'iShares MSCI Emerging Markets ETF',ACWI:'iShares MSCI ACWI ETF'};
const S={
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
const A={'SPX':'^GSPC','NDX':'^NDX','DJI':'^DJI','DOW':'^DJI','VIX':'^VIX','SKEW':'^SKEW','FTSE':'^FTSE','FTSE100':'^FTSE','N225':'^N225','NIKKEI':'^N225','NIKKEI225':'^N225','CSI300':'000300.SS','2S10S':'2S10S','10Y-2Y':'2S10S','10Y2Y':'2S10S','10Y - 2Y':'2S10S','REAL10Y':'REAL10Y','REAL 10Y':'REAL10Y','TIPS10Y':'REAL10Y','2Y':'US2Y','5Y':'US5Y','10Y':'US10Y','30Y':'US30Y','USD/JPY':'USDJPY=X','GBP/USD':'GBPUSD=X','EUR/USD':'EURUSD=X','AUD/USD':'AUDUSD=X','AUDUSD':'AUDUSD=X','USD/CNH':'USDCNH=X','DXY':'DX-Y.NYB','BTC':'BTC-USD','IG OAS':'IGOAS','HY OAS':'HYOAS','IGOAS':'IGOAS','HYOAS':'HYOAS','INFLATION':'BE10Y','NAT GAS':'NG=F','NATURAL GAS':'NG=F','COPPER':'HG=F'};
const canon=x=>{const r=String(x||'').trim().toUpperCase();return A[r]||r.replace(/[^A-Z0-9.^=\-\/]/g,'').slice(0,20)};
const desc=s=>S[s]||{t:'equity',n:N[s]||s,f:'currency',d:s};
const num=x=>{const n=Number(String(x??'').replace(/[,%$]/g,''));return Number.isFinite(n)?n:null};
async function text(url,opt={}){const r=await fetch(url,{...opt,signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(`Data request failed (${r.status})`);return r.text();}
async function json(url,opt={}){const r=await fetch(url,{...opt,signal:AbortSignal.timeout(8000)}),t=await r.text();let b={};try{b=t?JSON.parse(t):{}}catch{b={raw:t}}if(!r.ok)throw new Error(b?.message||b?.chart?.error?.description||`Data request failed (${r.status})`);return b;}
async function ychart(sym,range='1d',interval='1m'){const u=new URL(`${YAHOO}/${encodeURIComponent(sym)}`);u.searchParams.set('range',range);u.searchParams.set('interval',interval);u.searchParams.set('includePrePost','true');const d=await json(u,{headers:{'User-Agent':UA,Accept:'application/json'}});const x=d?.chart?.result?.[0];if(!x)throw new Error(d?.chart?.error?.description||`No Yahoo data for ${sym}`);return x;}
async function yquote(s){const d=desc(s),x=await ychart(d.y||s),m=x.meta||{},cs=x?.indicators?.quote?.[0]?.close||[],p=num(m.regularMarketPrice)??[...cs].reverse().find(Number.isFinite)??null,pc=num(m.chartPreviousClose)??num(m.previousClose),ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:null;return {symbol:s,displaySymbol:d.d,name:d.n,assetType:d.t,format:d.f,price:p,previousClose:pc,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:null,source:d.src||(d.t==='fx'?'Yahoo FX':d.t==='future'?'Yahoo Futures':d.t==='crypto'?'Yahoo Crypto':d.t==='index'?'Yahoo Index':'Yahoo'),updatedAt:m.regularMarketTime?new Date(m.regularMarketTime*1000).toISOString():null};}
async function fredRows(id,start='1900-01-01',end=new Date().toISOString().slice(0,10)){const u=new URL(FRED);u.searchParams.set('id',id);u.searchParams.set('cosd',start);u.searchParams.set('coed',end);const lines=(await text(u,{headers:{'User-Agent':UA,Accept:'text/csv'}})).trim().split(/\r?\n/).slice(1),rows=[];for(const l of lines){const [date,val]=l.split(','),v=num(val);if(date&&Number.isFinite(v))rows.push({date,value:v});}return rows;}
const fredSource=s=>s==='SOFR'?'New York Fed / FRED':['IGOAS','HYOAS'].includes(s)?'FRED · ICE BofA':s==='BE10Y'?'FRED · Breakeven Inflation':s==='2S10S'?'FRED · Treasury Curve':s==='REAL10Y'?'FRED · TIPS Real Yield':'FRED';
async function fquote(s){const d=desc(s),rows=await fredRows(d.fred),a=rows.at(-1),b=rows.at(-2),p=a?.value??null,pc=b?.value??null,ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:null;return {symbol:s,displaySymbol:d.d,name:d.n,assetType:'rate',format:'percent',price:p,previousClose:pc,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:null,source:fredSource(s),updatedAt:a?.date||null};}
async function cquote(s){const d=desc(s),u=new URL(CNBC);u.searchParams.set('symbols',d.cnbc);u.searchParams.set('requestMethod','itv');u.searchParams.set('noform','1');u.searchParams.set('partnerId','2');u.searchParams.set('fund','1');u.searchParams.set('output','json');const j=await json(u,{headers:{'User-Agent':UA}}),q=j?.FormattedQuoteResult?.FormattedQuote?.[0],p=num(q?.last),pc=num(q?.previous_day_closing),ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:num(q?.change);if(!Number.isFinite(p))throw new Error(`No CNBC quote for ${s}`);return {symbol:s,displaySymbol:d.d,name:d.n,assetType:'rate',format:'percent',price:p,previousClose:pc,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:num(q?.change_pct),source:'CNBC / Tradeweb',updatedAt:q?.last_time||null};}
async function specialQuote(s){const d=desc(s);if(d.t==='rate'){if(d.cnbc)try{return await cquote(s)}catch{}return fquote(s)}return yquote(s);}
async function equityNames(s){if(N[s])return N[s];try{const u=new URL('https://query2.finance.yahoo.com/v1/finance/search');u.searchParams.set('q',s);u.searchParams.set('quotesCount','3');u.searchParams.set('newsCount','0');const j=await json(u,{headers:{'User-Agent':UA}}),q=(j.quotes||[]).find(x=>String(x.symbol).toUpperCase()===s);return q?.longname||q?.shortname||s}catch{return s}}

app.get('/api/quotes',async(req,res)=>{const syms=[...new Set(String(req.query.symbols||'').split(',').map(canon).filter(Boolean))].slice(0,MAX),out=new Map(),eq=syms.filter(s=>desc(s).t==='equity');if(!syms.length)return res.status(400).json({error:'No symbols supplied.'});let alpacaError=null;if(eq.length&&KEY&&SECRET)try{const u=new URL('/v2/stocks/snapshots',ALPACA);u.searchParams.set('symbols',eq.join(','));u.searchParams.set('feed','iex');const j=await json(u,{headers:{'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SECRET}});await Promise.all(eq.map(async s=>{const x=j?.[s]||{},p=Number(x?.latestTrade?.p??x?.minuteBar?.c??x?.dailyBar?.c),pc=Number(x?.prevDailyBar?.c),ch=Number.isFinite(p)&&Number.isFinite(pc)?p-pc:null;out.set(s,{symbol:s,displaySymbol:s,name:await equityNames(s),assetType:'equity',format:'currency',price:Number.isFinite(p)?p:null,previousClose:Number.isFinite(pc)?pc:null,change:ch,changePct:Number.isFinite(ch)&&pc?ch/pc*100:null,source:'Alpaca IEX',updatedAt:x?.latestTrade?.t||null});}))}catch(e){alpacaError=e.message}
await Promise.all(syms.filter(s=>!out.has(s)).map(async s=>{try{const q=desc(s).t==='equity'?await yquote(s):await specialQuote(s);if(desc(s).t==='equity')q.name=await equityNames(s);out.set(s,q)}catch(e){const d=desc(s);out.set(s,{symbol:s,displaySymbol:d.d,name:d.n,assetType:d.t,format:d.f,price:null,previousClose:null,change:null,changePct:null,source:'Unavailable',error:e.message})}}));res.set('Cache-Control','no-store').json({quotes:syms.map(s=>out.get(s)),serverTime:new Date().toISOString(),alpacaConfigured:Boolean(KEY&&SECRET),alpacaError});});

const YR={'1D':['1d','1m'],'5D':['5d','5m'],'1M':['1mo','30m'],'3M':['3mo','1d'],'6M':['6mo','1d'],'YTD':['ytd','1d'],'1Y':['1y','1d'],'5Y':['5y','1d']};
const days={'1D':6,'5D':10,'1M':40,'3M':105,'6M':195,'1Y':375,'5Y':1840};
const startFor=r=>r==='YTD'?new Date(Date.UTC(new Date().getUTCFullYear(),0,1)):new Date(Date.now()-(days[r]||6)*86400000);
async function ybars(s,r){const d=desc(s),[range,interval]=YR[r],x=await ychart(d.y||s,range,interval),ts=x.timestamp||[],q=x?.indicators?.quote?.[0]||{},bars=ts.map((t,i)=>({t:new Date(t*1000).toISOString(),o:Number(q.open?.[i]),h:Number(q.high?.[i]),l:Number(q.low?.[i]),c:Number(q.close?.[i]),v:Number(q.volume?.[i])})).filter(b=>Number.isFinite(b.c));return {bars,source:d.src||(d.t==='future'?'Yahoo Futures':d.t==='fx'?'Yahoo FX':d.t==='crypto'?'Yahoo Crypto':d.t==='index'?'Yahoo Index':'Yahoo'),timeframe:interval};}
async function fbars(s,r){const d=desc(s),rows=await fredRows(d.fred,startFor(r).toISOString().slice(0,10)),bars=rows.map(x=>({t:`${x.date}T12:00:00Z`,o:x.value,h:x.value,l:x.value,c:x.value,v:null}));return {bars,source:fredSource(s),timeframe:'1Day'};}
async function abars(s,r){if(!KEY||!SECRET)throw new Error('Alpaca credentials are not configured.');const cfg={ '1D':[1,'1Min'], '5D':[7,'5Min'], '1M':[35,'1Hour'], '3M':[100,'1Day'], '6M':[190,'1Day'], 'YTD':[null,'1Day'], '1Y':[370,'1Day'], '5Y':[1835,'1Day']}[r],now=new Date(),st=r==='YTD'?new Date(Date.UTC(now.getUTCFullYear(),0,1)):new Date(now-cfg[0]*86400000),u=new URL(`/v2/stocks/${encodeURIComponent(s)}/bars`,ALPACA);u.searchParams.set('timeframe',cfg[1]);u.searchParams.set('start',st.toISOString());u.searchParams.set('end',now.toISOString());u.searchParams.set('adjustment','raw');u.searchParams.set('feed','iex');u.searchParams.set('sort','asc');u.searchParams.set('limit','10000');const j=await json(u,{headers:{'APCA-API-KEY-ID':KEY,'APCA-API-SECRET-KEY':SECRET}});return {bars:(j.bars||[]).map(b=>({t:b.t,o:+b.o,h:+b.h,l:+b.l,c:+b.c,v:+b.v})).filter(b=>Number.isFinite(b.c)),source:'Alpaca IEX',timeframe:cfg[1]};}
app.get('/api/bars/:symbol',async(req,res)=>{const s=canon(req.params.symbol),r=String(req.query.range||'1D').toUpperCase(),d=desc(s);if(!YR[r])return res.status(400).json({error:'Unsupported chart range.'});try{let x;if(d.t==='rate'&&d.fred)x=await fbars(s,r);else if(d.t==='equity')try{x=await abars(s,r)}catch{x=await ybars(s,r)}else x=await ybars(s,r);res.set('Cache-Control','no-store').json({symbol:s,displaySymbol:d.d,name:d.n,assetType:d.t,format:d.f,range:r,...x})}catch(e){res.status(502).json({error:e.message||'Chart request failed.'})}});
app.use((_q,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`Shaffer Terminal v${VERSION} listening on ${PORT}`));
