import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});
const BUILD_VERSION = '3.0.0';

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(?:html|js|css)$/.test(filePath) || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: BUILD_VERSION });
});

const ALPACA_BASE = 'https://data.alpaca.markets';
const API_KEY = process.env.ALPACA_API_KEY_ID;
const API_SECRET = process.env.ALPACA_API_SECRET_KEY;
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const CNBC_BASE = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';
const FRED_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36';

const quoteCache = new Map();
const nameCache = new Map();

const KNOWN_NAMES = {
  SPY: 'SPDR S&P 500 ETF Trust', QQQ: 'Invesco QQQ Trust', DIA: 'SPDR Dow Jones Industrial Average ETF Trust',
  IWM: 'iShares Russell 2000 ETF', RSP: 'Invesco S&P 500 Equal Weight ETF', MAGS: 'Roundhill Magnificent Seven ETF',
  EEM: 'iShares MSCI Emerging Markets ETF', VGK: 'Vanguard FTSE Europe ETF', VXX: 'iPath Series B S&P 500 VIX Short-Term Futures ETN',
  TIP: 'iShares TIPS Bond ETF', HYG: 'iShares iBoxx $ High Yield Corporate Bond ETF', LQD: 'iShares iBoxx $ Investment Grade Corporate Bond ETF',
  UUP: 'Invesco DB US Dollar Index Bullish Fund', FXY: 'Invesco CurrencyShares Japanese Yen Trust', FXB: 'Invesco CurrencyShares British Pound Sterling Trust',
  GLD: 'SPDR Gold Shares', USO: 'United States Oil Fund', CPER: 'United States Copper Index Fund', DBC: 'Invesco DB Commodity Index Tracking Fund',
  SMH: 'VanEck Semiconductor ETF', XLF: 'Financial Select Sector SPDR Fund', XLE: 'Energy Select Sector SPDR Fund',
  XAR: 'SPDR S&P Aerospace & Defense ETF', CIBR: 'First Trust Nasdaq Cybersecurity ETF',
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', NVDA: 'NVIDIA Corporation', AMZN: 'Amazon.com, Inc.', META: 'Meta Platforms, Inc.',
  TSLA: 'Tesla, Inc.', GOOGL: 'Alphabet Inc. Class A', GOOG: 'Alphabet Inc. Class C', JPM: 'JPMorgan Chase & Co.',
  AVGO: 'Broadcom Inc.', AMD: 'Advanced Micro Devices, Inc.', ORCL: 'Oracle Corporation', NFLX: 'Netflix, Inc.'
};

const SPECIAL = {
  'US2Y':  { type: 'rate', name: 'U.S. Treasury 2-Year Yield', format: 'percent', cnbc: 'US2Y', fred: 'DGS2', display: 'US 2Y' },
  'US10Y': { type: 'rate', name: 'U.S. Treasury 10-Year Yield', format: 'percent', cnbc: 'US10Y', fred: 'DGS10', display: 'US 10Y' },
  'US30Y': { type: 'rate', name: 'U.S. Treasury 30-Year Yield', format: 'percent', cnbc: 'US30Y', fred: 'DGS30', display: 'US 30Y' },
  'USDJPY=X': { type: 'fx', name: 'U.S. Dollar / Japanese Yen', format: 'fx', yahoo: 'USDJPY=X', display: 'USD/JPY' },
  'EURUSD=X': { type: 'fx', name: 'Euro / U.S. Dollar', format: 'fx', yahoo: 'EURUSD=X', display: 'EUR/USD' },
  'GBPUSD=X': { type: 'fx', name: 'British Pound / U.S. Dollar', format: 'fx', yahoo: 'GBPUSD=X', display: 'GBP/USD' },
  'USDCHF=X': { type: 'fx', name: 'U.S. Dollar / Swiss Franc', format: 'fx', yahoo: 'USDCHF=X', display: 'USD/CHF' },
  'USDCAD=X': { type: 'fx', name: 'U.S. Dollar / Canadian Dollar', format: 'fx', yahoo: 'USDCAD=X', display: 'USD/CAD' },
  'AUDUSD=X': { type: 'fx', name: 'Australian Dollar / U.S. Dollar', format: 'fx', yahoo: 'AUDUSD=X', display: 'AUD/USD' },
  'CL=F': { type: 'future', name: 'WTI Crude Oil Futures (Front Month)', format: 'currency', yahoo: 'CL=F', cnbc: '@CL.1', display: 'CL=F' },
  'GC=F': { type: 'future', name: 'Gold Futures (Front Month)', format: 'currency', yahoo: 'GC=F', cnbc: '@GC.1', display: 'GC=F' },
  'SI=F': { type: 'future', name: 'Silver Futures (Front Month)', format: 'currency', yahoo: 'SI=F', display: 'SI=F' },
  'HG=F': { type: 'future', name: 'Copper Futures (Front Month)', format: 'currency', yahoo: 'HG=F', display: 'HG=F' },
  'NG=F': { type: 'future', name: 'Natural Gas Futures (Front Month)', format: 'currency', yahoo: 'NG=F', display: 'NG=F' },
  '^GSPC': { type: 'index', name: 'S&P 500 Index', format: 'number', yahoo: '^GSPC', display: 'SPX' },
  '^DJI': { type: 'index', name: 'Dow Jones Industrial Average', format: 'number', yahoo: '^DJI', display: 'DJI' },
  '^IXIC': { type: 'index', name: 'Nasdaq Composite Index', format: 'number', yahoo: '^IXIC', display: 'NASDAQ' },
  '^NDX': { type: 'index', name: 'Nasdaq-100 Index', format: 'number', yahoo: '^NDX', display: 'NDX' },
  '^RUT': { type: 'index', name: 'Russell 2000 Index', format: 'number', yahoo: '^RUT', display: 'RUT' },
  '^VIX': { type: 'index', name: 'CBOE Volatility Index', format: 'number', yahoo: '^VIX', display: 'VIX' }
};

const ALIASES = {
  '2Y': 'US2Y', 'UST2Y': 'US2Y', 'US2YR': 'US2Y', 'US2Y': 'US2Y',
  '10Y': 'US10Y', 'UST10Y': 'US10Y', 'US10YR': 'US10Y', 'US10Y': 'US10Y',
  '30Y': 'US30Y', 'UST30Y': 'US30Y', 'US30YR': 'US30Y', 'US30Y': 'US30Y',
  'USDJPY': 'USDJPY=X', 'USD/JPY': 'USDJPY=X', 'JPY=X': 'USDJPY=X',
  'EURUSD': 'EURUSD=X', 'EUR/USD': 'EURUSD=X', 'GBPUSD': 'GBPUSD=X', 'GBP/USD': 'GBPUSD=X',
  'USDCHF': 'USDCHF=X', 'USD/CHF': 'USDCHF=X', 'USDCAD': 'USDCAD=X', 'USD/CAD': 'USDCAD=X',
  'AUDUSD': 'AUDUSD=X', 'AUD/USD': 'AUDUSD=X',
  'WTI': 'CL=F', 'OIL': 'CL=F', 'CL': 'CL=F', 'GOLD': 'GC=F', 'GC': 'GC=F',
  'SPX': '^GSPC', 'S&P500': '^GSPC', 'S&P': '^GSPC', 'DOW': '^DJI', 'DJI': '^DJI',
  'NASDAQ': '^IXIC', 'COMP': '^IXIC', 'NDX': '^NDX', 'RUT': '^RUT', 'RUSSELL': '^RUT', 'VIX': '^VIX'
};

function canonicalizeSymbol(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (ALIASES[raw]) return ALIASES[raw];
  return raw.replace(/[^A-Z0-9.^=\-\/]/g, '').slice(0, 16);
}

function descriptor(symbol) {
  return SPECIAL[symbol] || { type: 'equity', name: KNOWN_NAMES[symbol] || symbol, format: 'currency', display: symbol };
}

function authHeaders() {
  return { 'APCA-API-KEY-ID': API_KEY, 'APCA-API-SECRET-KEY': API_SECRET, Accept: 'application/json' };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(7000) });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const err = new Error(body?.message || body?.chart?.error?.description || `Data request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return body;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Data request failed (${response.status})`);
  return response.text();
}

async function alpacaFetch(url) {
  if (!API_KEY || !API_SECRET) throw new Error('Alpaca credentials are not configured.');
  return fetchJson(url, { headers: authHeaders() });
}

function parseNum(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/[,%$]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

async function resolveEquityName(symbol) {
  if (KNOWN_NAMES[symbol]) return KNOWN_NAMES[symbol];
  if (nameCache.has(symbol)) return nameCache.get(symbol);
  let name = symbol;
  try {
    const url = new URL('https://query2.finance.yahoo.com/v1/finance/search');
    url.searchParams.set('q', symbol);
    url.searchParams.set('quotesCount', '5');
    url.searchParams.set('newsCount', '0');
    const data = await fetchJson(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    const exact = (data?.quotes || []).find(q => String(q.symbol || '').toUpperCase() === symbol);
    name = exact?.longname || exact?.shortname || exact?.name || symbol;
  } catch {}
  nameCache.set(symbol, name);
  return name;
}

async function yahooChart(symbol, range = '1d', interval = '1m', includePrePost = true) {
  const url = new URL(`${YAHOO_BASE}/${encodeURIComponent(symbol)}`);
  url.searchParams.set('range', range);
  url.searchParams.set('interval', interval);
  url.searchParams.set('includePrePost', includePrePost ? 'true' : 'false');
  url.searchParams.set('events', 'div,splits');
  const data = await fetchJson(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(data?.chart?.error?.description || `No Yahoo data for ${symbol}`);
  return result;
}

async function yahooQuote(canonical) {
  const d = descriptor(canonical);
  const yahooSymbol = d.yahoo || canonical;
  const cached = quoteCache.get(`y:${canonical}`);
  if (cached && Date.now() - cached.at < 8000) return cached.value;

  const result = await yahooChart(yahooSymbol, '1d', '1m', true);
  const meta = result.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const latestClose = [...closes].reverse().find(Number.isFinite);
  const price = parseNum(meta.regularMarketPrice) ?? latestClose ?? null;
  const previousClose = parseNum(meta.chartPreviousClose) ?? parseNum(meta.previousClose);
  const change = Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : null;
  const changePct = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : null;
  const value = {
    symbol: canonical, displaySymbol: d.display || canonical, name: d.name || canonical,
    assetType: d.type, format: d.format, price, previousClose, change, changePct,
    source: d.type === 'fx' ? 'Yahoo FX' : d.type === 'future' ? 'Yahoo Futures' : d.type === 'index' ? 'Yahoo Index' : 'Yahoo',
    updatedAt: meta.regularMarketTime ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null
  };
  quoteCache.set(`y:${canonical}`, { at: Date.now(), value });
  return value;
}

async function cnbcQuote(canonical, cnbcSymbol) {
  const d = descriptor(canonical);
  const cached = quoteCache.get(`c:${canonical}`);
  if (cached && Date.now() - cached.at < 5000) return cached.value;

  const url = new URL(CNBC_BASE);
  url.searchParams.set('symbols', cnbcSymbol);
  url.searchParams.set('requestMethod', 'itv');
  url.searchParams.set('noform', '1');
  url.searchParams.set('partnerId', '2');
  url.searchParams.set('fund', '1');
  url.searchParams.set('exthrs', '1');
  url.searchParams.set('output', 'json');
  url.searchParams.set('events', '1');
  const data = await fetchJson(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  const q = data?.FormattedQuoteResult?.FormattedQuote?.[0];
  if (!q || Number(q.code || 0) !== 0) throw new Error(`No CNBC quote for ${canonical}`);

  const price = parseNum(q.last);
  const previousClose = parseNum(q.previous_day_closing);
  const change = Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : parseNum(q.change);
  const changePct = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : parseNum(q.change_pct);
  const value = {
    symbol: canonical, displaySymbol: d.display || canonical, name: d.name || q.name || canonical,
    assetType: d.type, format: d.format, price, previousClose, change, changePct,
    source: d.type === 'rate' ? 'CNBC / Tradeweb' : 'CNBC Futures',
    updatedAt: q.last_time ? String(q.last_time).replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : null
  };
  quoteCache.set(`c:${canonical}`, { at: Date.now(), value });
  return value;
}

async function externalQuote(canonical) {
  const d = descriptor(canonical);
  if (d.cnbc) {
    try { return await cnbcQuote(canonical, d.cnbc); }
    catch (error) {
      if (d.type === 'rate') throw error;
    }
  }
  return yahooQuote(canonical);
}

app.get('/api/quotes', async (req, res) => {
  const symbols = [...new Set(String(req.query.symbols || '').split(',').map(canonicalizeSymbol).filter(Boolean))].slice(0, 30);
  if (!symbols.length) return res.status(400).json({ error: 'No symbols supplied.' });

  const equitySymbols = symbols.filter(s => descriptor(s).type === 'equity');
  const quoteBySymbol = new Map();
  let alpacaError = null;

  if (equitySymbols.length && API_KEY && API_SECRET) {
    try {
      const url = new URL('/v2/stocks/snapshots', ALPACA_BASE);
      url.searchParams.set('symbols', equitySymbols.join(','));
      url.searchParams.set('feed', 'iex');
      const data = await alpacaFetch(url);
      await Promise.all(equitySymbols.map(async symbol => {
        const snap = data?.[symbol] || {};
        const latest = Number(snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? snap?.dailyBar?.c);
        const previousClose = Number(snap?.prevDailyBar?.c);
        const change = Number.isFinite(latest) && Number.isFinite(previousClose) ? latest - previousClose : null;
        const changePct = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : null;
        quoteBySymbol.set(symbol, {
          symbol, displaySymbol: symbol, name: await resolveEquityName(symbol), assetType: 'equity', format: 'currency',
          price: Number.isFinite(latest) ? latest : null, previousClose: Number.isFinite(previousClose) ? previousClose : null,
          change, changePct, source: 'Alpaca IEX', updatedAt: snap?.latestTrade?.t || snap?.minuteBar?.t || null
        });
      }));
    } catch (error) {
      alpacaError = error.message;
      console.error('Alpaca quotes:', error.message);
    }
  }

  const fallbackEquities = equitySymbols.filter(s => !quoteBySymbol.has(s));
  await Promise.all([...symbols.filter(s => descriptor(s).type !== 'equity'), ...fallbackEquities].map(async symbol => {
    try {
      const d = descriptor(symbol);
      const q = d.type === 'equity' ? await yahooQuote(symbol) : await externalQuote(symbol);
      if (d.type === 'equity') q.name = await resolveEquityName(symbol);
      quoteBySymbol.set(symbol, q);
    } catch (error) {
      quoteBySymbol.set(symbol, {
        symbol, displaySymbol: descriptor(symbol).display || symbol, name: descriptor(symbol).name || symbol,
        assetType: descriptor(symbol).type, format: descriptor(symbol).format, price: null, previousClose: null,
        change: null, changePct: null, source: 'Unavailable', error: error.message
      });
    }
  }));

  const quotes = symbols.map(s => quoteBySymbol.get(s)).filter(Boolean);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ quotes, serverTime: new Date().toISOString(), alpacaConfigured: Boolean(API_KEY && API_SECRET), alpacaError });
});

const ALPACA_RANGE = {
  '1D':  { days: 1, timeframe: '1Min', maxPoints: 500 },
  '5D':  { days: 7, timeframe: '5Min', maxPoints: 700 },
  '1M':  { days: 35, timeframe: '1Hour', maxPoints: 500 },
  '3M':  { days: 100, timeframe: '1Day', maxPoints: 500 },
  '6M':  { days: 190, timeframe: '1Day', maxPoints: 500 },
  'YTD': { ytd: true, timeframe: '1Day', maxPoints: 500 },
  '1Y':  { days: 370, timeframe: '1Day', maxPoints: 500 },
  '5Y':  { days: 1835, timeframe: '1Day', maxPoints: 1500 }
};

const YAHOO_RANGE = {
  '1D':  { range: '1d', interval: '1m' },
  '5D':  { range: '5d', interval: '5m' },
  '1M':  { range: '1mo', interval: '30m' },
  '3M':  { range: '3mo', interval: '1d' },
  '6M':  { range: '6mo', interval: '1d' },
  'YTD': { range: 'ytd', interval: '1d' },
  '1Y':  { range: '1y', interval: '1d' },
  '5Y':  { range: '5y', interval: '1d' }
};

function rangeStart(range) {
  const now = new Date();
  const days = { '1D': 6, '5D': 10, '1M': 40, '3M': 105, '6M': 195, '1Y': 375, '5Y': 1840 }[range];
  if (range === 'YTD') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return new Date(now.getTime() - (days || 6) * 86400000);
}

async function yahooBars(canonical, range) {
  const d = descriptor(canonical);
  const cfg = YAHOO_RANGE[range];
  const result = await yahooChart(d.yahoo || canonical, cfg.range, cfg.interval, true);
  const timestamps = result.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const bars = timestamps.map((ts, i) => ({
    t: new Date(Number(ts) * 1000).toISOString(),
    o: Number(quote.open?.[i]), h: Number(quote.high?.[i]), l: Number(quote.low?.[i]), c: Number(quote.close?.[i]), v: Number(quote.volume?.[i])
  })).filter(b => Number.isFinite(b.c));
  return { bars, source: d.type === 'fx' ? 'Yahoo FX' : d.type === 'future' ? 'Yahoo Futures' : d.type === 'index' ? 'Yahoo Index' : 'Yahoo', timeframe: cfg.interval };
}

async function fredRateBars(canonical, range) {
  const d = descriptor(canonical);
  const start = rangeStart(range);
  const now = new Date();
  const url = new URL(FRED_BASE);
  url.searchParams.set('id', d.fred);
  url.searchParams.set('cosd', start.toISOString().slice(0, 10));
  url.searchParams.set('coed', now.toISOString().slice(0, 10));
  const csv = await fetchText(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv' } });
  const lines = csv.trim().split(/\r?\n/).slice(1);
  let bars = lines.map(line => {
    const [date, raw] = line.split(',');
    const c = Number(raw);
    return { t: `${date}T16:00:00-04:00`, c };
  }).filter(b => Number.isFinite(b.c));

  if (range === '1D' && bars.length > 2) bars = bars.slice(-2);
  if (range === '5D' && bars.length > 6) bars = bars.slice(-6);

  try {
    const current = await cnbcQuote(canonical, d.cnbc);
    if (Number.isFinite(current.price)) {
      const today = new Date().toISOString().slice(0, 10);
      const live = { t: current.updatedAt || new Date().toISOString(), c: current.price };
      const lastDate = bars.at(-1)?.t?.slice(0, 10);
      if (lastDate === today) bars[bars.length - 1] = live; else bars.push(live);
    }
  } catch {}

  return { bars, source: 'CNBC live + FRED daily', timeframe: '1Day' };
}

app.get('/api/bars/:symbol', async (req, res) => {
  const symbol = canonicalizeSymbol(req.params.symbol);
  const range = String(req.query.range || '1D').toUpperCase();
  if (!symbol || !ALPACA_RANGE[range]) return res.status(400).json({ error: 'Invalid symbol or range.' });
  const d = descriptor(symbol);

  try {
    let result;
    if (d.type === 'rate') {
      result = await fredRateBars(symbol, range);
    } else if (d.type !== 'equity') {
      result = await yahooBars(symbol, range);
    } else if (API_KEY && API_SECRET) {
      try {
        const cfg = ALPACA_RANGE[range];
        const now = new Date();
        const start = cfg.ytd ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : new Date(now.getTime() - cfg.days * 86400000);
        const url = new URL(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, ALPACA_BASE);
        url.searchParams.set('timeframe', cfg.timeframe);
        url.searchParams.set('start', start.toISOString());
        url.searchParams.set('end', now.toISOString());
        url.searchParams.set('limit', String(Math.min(cfg.maxPoints, 10000)));
        url.searchParams.set('adjustment', 'split');
        url.searchParams.set('feed', 'iex');
        url.searchParams.set('sort', 'asc');
        const data = await alpacaFetch(url);
        result = { source: 'Alpaca IEX', timeframe: cfg.timeframe, bars: (data?.bars || []).map(bar => ({
          t: bar.t, o: Number(bar.o), h: Number(bar.h), l: Number(bar.l), c: Number(bar.c), v: Number(bar.v)
        })).filter(b => Number.isFinite(b.c)) };
      } catch (error) {
        console.error('Alpaca bars fallback:', error.message);
        result = await yahooBars(symbol, range);
      }
    } else {
      result = await yahooBars(symbol, range);
    }

    res.setHeader('Cache-Control', ['1D', '5D'].includes(range) ? 'no-store' : 'private, max-age=20');
    res.json({ symbol, displaySymbol: d.display || symbol, name: d.name || symbol, assetType: d.type, format: d.format, range, ...result });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || 'Unable to fetch chart data.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, alpacaConfigured: Boolean(API_KEY && API_SECRET), time: new Date().toISOString() });
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => console.log(`Shaffer Market Watch listening on port ${port}`));
