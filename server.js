import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_VERSION = '4.0.0';

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

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
const TRADINGVIEW_SCAN = 'https://scanner.tradingview.com/global/scan';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36';

const quoteCache = new Map();
const nameCache = new Map();

const KNOWN_NAMES = {
  VTI: 'Vanguard Total Stock Market ETF',
  EEM: 'iShares MSCI Emerging Markets ETF',
  ACWI: 'iShares MSCI ACWI ETF',
  SPY: 'SPDR S&P 500 ETF Trust',
  QQQ: 'Invesco QQQ Trust',
  DIA: 'SPDR Dow Jones Industrial Average ETF Trust',
  IWM: 'iShares Russell 2000 ETF',
  RSP: 'Invesco S&P 500 Equal Weight ETF',
  SMH: 'VanEck Semiconductor ETF',
  XLF: 'Financial Select Sector SPDR Fund',
  XLE: 'Energy Select Sector SPDR Fund',
  XAR: 'SPDR S&P Aerospace & Defense ETF',
  XLI: 'Industrial Select Sector SPDR Fund',
  XLV: 'Health Care Select Sector SPDR Fund',
  XLY: 'Consumer Discretionary Select Sector SPDR Fund',
  XLP: 'Consumer Staples Select Sector SPDR Fund',
  XLC: 'Communication Services Select Sector SPDR Fund',
  XLU: 'Utilities Select Sector SPDR Fund',
  XLRE: 'Real Estate Select Sector SPDR Fund',
  CIBR: 'First Trust Nasdaq Cybersecurity ETF',
  XLK: 'Technology Select Sector SPDR Fund',
  XLB: 'Materials Select Sector SPDR Fund',
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  NVDA: 'NVIDIA Corporation',
  AMZN: 'Amazon.com, Inc.',
  META: 'Meta Platforms, Inc.',
  TSLA: 'Tesla, Inc.',
  GOOGL: 'Alphabet Inc. Class A',
  GOOG: 'Alphabet Inc. Class C',
  JPM: 'JPMorgan Chase & Co.',
  AVGO: 'Broadcom Inc.',
  AMD: 'Advanced Micro Devices, Inc.',
  ORCL: 'Oracle Corporation',
  NFLX: 'Netflix, Inc.'
};

const SPECIAL = {
  'US2Y':  { type: 'rate', name: 'U.S. Treasury 2-Year Yield', format: 'percent', cnbc: 'US2Y', fred: 'DGS2', display: 'US 2Y' },
  'US10Y': { type: 'rate', name: 'U.S. Treasury 10-Year Yield', format: 'percent', cnbc: 'US10Y', fred: 'DGS10', display: 'US 10Y' },
  'US30Y': { type: 'rate', name: 'U.S. Treasury 30-Year Yield', format: 'percent', cnbc: 'US30Y', fred: 'DGS30', display: 'US 30Y' },
  'SOFR': { type: 'rate', name: 'Secured Overnight Financing Rate', format: 'percent', fred: 'SOFR', display: 'SOFR' },
  'MOVE': { type: 'index', name: 'ICE BofA MOVE Index', format: 'number', cnbc: '.MOVE', tradingview: 'TVC:MOVE', display: 'MOVE' },
  'DX-Y.NYB': { type: 'index', name: 'ICE U.S. Dollar Index', format: 'number', yahoo: 'DX-Y.NYB', display: 'DXY' },
  'BTC-USD': { type: 'crypto', name: 'Bitcoin / U.S. Dollar', format: 'currency', yahoo: 'BTC-USD', display: 'BTC-USD' },
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
  'EURUSD': 'EURUSD=X', 'EUR/USD': 'EURUSD=X',
  'GBPUSD': 'GBPUSD=X', 'GBP/USD': 'GBPUSD=X',
  'USDCHF': 'USDCHF=X', 'USD/CHF': 'USDCHF=X',
  'USDCAD': 'USDCAD=X', 'USD/CAD': 'USDCAD=X',
  'AUDUSD': 'AUDUSD=X', 'AUD/USD': 'AUDUSD=X',
  'WTI': 'CL=F', 'OIL': 'CL=F', 'CL': 'CL=F', 'CLF': 'CL=F',
  'GOLD': 'GC=F', 'GC': 'GC=F', 'GCF': 'GC=F',
  'SPX': '^GSPC', 'S&P500': '^GSPC', 'S&P': '^GSPC',
  'DOW': '^DJI', 'DJI': '^DJI', 'NASDAQ': '^IXIC', 'COMP': '^IXIC',
  'NDX': '^NDX', 'RUT': '^RUT', 'RUSSELL': '^RUT', 'VIX': '^VIX',
  'DXY': 'DX-Y.NYB', 'DXYNYB': 'DX-Y.NYB', 'DXY.NYB': 'DX-Y.NYB', 'DX-Y.NYB': 'DX-Y.NYB',
  'BTC': 'BTC-USD', 'BITCOIN': 'BTC-USD',
  'SOFR': 'SOFR', 'MOVE': 'MOVE'
};

function canonicalizeSymbol(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (ALIASES[raw]) return ALIASES[raw];
  return raw.replace(/[^A-Z0-9.^=\-\/]/g, '').slice(0, 20);
}

function descriptor(symbol) {
  return SPECIAL[symbol] || {
    type: 'equity',
    name: KNOWN_NAMES[symbol] || symbol,
    format: 'currency',
    display: symbol
  };
}

function authHeaders() {
  return {
    'APCA-API-KEY-ID': API_KEY,
    'APCA-API-SECRET-KEY': API_SECRET,
    Accept: 'application/json'
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }
  if (!response.ok) {
    const err = new Error(body?.message || body?.chart?.error?.description || `Data request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return body;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
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
  const cached = quoteCache.get(`y:${canonical}`);
  if (cached && Date.now() - cached.at < 9000) return cached.value;

  const result = await yahooChart(d.yahoo || canonical, '1d', '1m', true);
  const meta = result.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const latestClose = [...closes].reverse().find(Number.isFinite);
  const price = parseNum(meta.regularMarketPrice) ?? latestClose ?? null;
  const previousClose = parseNum(meta.chartPreviousClose) ?? parseNum(meta.previousClose);
  const change = Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : null;
  const changePct = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : null;
  const value = {
    symbol: canonical,
    displaySymbol: d.display || canonical,
    name: d.name || canonical,
    assetType: d.type,
    format: d.format,
    price,
    previousClose,
    change,
    changePct,
    source: d.type === 'fx' ? 'Yahoo FX'
      : d.type === 'future' ? 'Yahoo Futures'
      : d.type === 'crypto' ? 'Yahoo Crypto'
      : d.type === 'index' ? 'Yahoo Index'
      : 'Yahoo',
    updatedAt: meta.regularMarketTime ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null
  };
  quoteCache.set(`y:${canonical}`, { at: Date.now(), value });
  return value;
}

async function cnbcQuote(canonical, cnbcSymbol) {
  const d = descriptor(canonical);
  const cached = quoteCache.get(`c:${canonical}`);
  if (cached && Date.now() - cached.at < 7000) return cached.value;

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
  if (!q) throw new Error(`No CNBC quote for ${canonical}`);

  const price = parseNum(q.last);
  const previousClose = parseNum(q.previous_day_closing);
  const change = Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : parseNum(q.change);
  const changePct = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : parseNum(q.change_pct);
  const value = {
    symbol: canonical,
    displaySymbol: d.display || canonical,
    name: d.name || q.name || canonical,
    assetType: d.type,
    format: d.format,
    price,
    previousClose,
    change,
    changePct,
    source: d.type === 'rate' ? 'CNBC / Tradeweb'
      : canonical === 'MOVE' ? 'CNBC · ICE MOVE'
      : 'CNBC Futures',
    updatedAt: q.last_time ? String(q.last_time).replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : null
  };
  quoteCache.set(`c:${canonical}`, { at: Date.now(), value });
  return value;
}

async function fredRows(seriesId, startDate = null, endDate = null) {
  const url = new URL(FRED_BASE);
  url.searchParams.set('id', seriesId);
  if (startDate) url.searchParams.set('cosd', startDate);
  if (endDate) url.searchParams.set('coed', endDate);
  const csv = await fetchText(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv' } });
  const lines = csv.trim().split(/\r?\n/).slice(1);
  const rows = [];
  for (const line of lines) {
    const [date, raw] = line.split(',');
    const value = Number(raw);
    if (date && Number.isFinite(value)) rows.push({ date, value });
  }
  return rows;
}

async function fredQuote(canonical) {
  const d = descriptor(canonical);
  if (!d.fred) throw new Error(`No FRED series configured for ${canonical}`);
  const cached = quoteCache.get(`f:${canonical}`);
  if (cached && Date.now() - cached.at < 60000) return cached.value;

  const end = new Date();
  const start = new Date(end.getTime() - 21 * 86400000);
  const rows = await fredRows(d.fred, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  if (!rows.length) throw new Error(`No official rate data for ${canonical}`);
  const last = rows.at(-1);
  const prev = rows.at(-2);
  const price = last.value;
  const previousClose = prev?.value ?? null;
  const change = Number.isFinite(previousClose) ? price - previousClose : null;
  const changePct = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : null;
  const value = {
    symbol: canonical,
    displaySymbol: d.display || canonical,
    name: d.name,
    assetType: d.type,
    format: d.format,
    price,
    previousClose,
    change,
    changePct,
    source: canonical === 'SOFR' ? 'New York Fed / FRED' : 'FRED',
    updatedAt: `${last.date}T12:00:00Z`
  };
  quoteCache.set(`f:${canonical}`, { at: Date.now(), value });
  return value;
}

async function tradingViewMoveQuote() {
  const canonical = 'MOVE';
  const d = descriptor(canonical);
  const cached = quoteCache.get('tv:MOVE');
  if (cached && Date.now() - cached.at < 15000) return cached.value;

  const body = {
    symbols: { tickers: [d.tradingview], query: { types: [] } },
    columns: ['close', 'change', 'change_abs', 'description']
  };
  const response = await fetch(TRADINGVIEW_SCAN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`MOVE fallback failed (${response.status})`);
  const data = await response.json();
  const row = data?.data?.[0]?.d;
  if (!row) throw new Error('MOVE fallback returned no data');
  const price = parseNum(row[0]);
  const changePct = parseNum(row[1]);
  const change = parseNum(row[2]);
  const previousClose = Number.isFinite(price) && Number.isFinite(change) ? price - change : null;
  const value = {
    symbol: canonical,
    displaySymbol: 'MOVE',
    name: d.name,
    assetType: 'index',
    format: 'number',
    price,
    previousClose,
    change,
    changePct,
    source: 'TradingView · ICE MOVE',
    updatedAt: new Date().toISOString()
  };
  quoteCache.set('tv:MOVE', { at: Date.now(), value });
  return value;
}

async function externalQuote(canonical) {
  const d = descriptor(canonical);

  if (canonical === 'SOFR') return fredQuote(canonical);

  if (canonical === 'MOVE') {
    try { return await cnbcQuote(canonical, d.cnbc); }
    catch {
      return tradingViewMoveQuote();
    }
  }

  if (d.cnbc) {
    try { return await cnbcQuote(canonical, d.cnbc); }
    catch (error) {
      if (d.type === 'rate' && d.fred) return fredQuote(canonical);
    }
  }

  if (d.fred && d.type === 'rate') return fredQuote(canonical);
  return yahooQuote(canonical);
}

app.get('/api/quotes', async (req, res) => {
  const symbols = [...new Set(
    String(req.query.symbols || '')
      .split(',')
      .map(canonicalizeSymbol)
      .filter(Boolean)
  )].slice(0, 40);

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
          symbol,
          displaySymbol: symbol,
          name: await resolveEquityName(symbol),
          assetType: 'equity',
          format: 'currency',
          price: Number.isFinite(latest) ? latest : null,
          previousClose: Number.isFinite(previousClose) ? previousClose : null,
          change,
          changePct,
          source: 'Alpaca IEX',
          updatedAt: snap?.latestTrade?.t || snap?.minuteBar?.t || null
        });
      }));
    } catch (error) {
      alpacaError = error.message;
      console.error('Alpaca quotes:', error.message);
    }
  }

  const fallbackEquities = equitySymbols.filter(s => !quoteBySymbol.has(s));
  const nonEquities = symbols.filter(s => descriptor(s).type !== 'equity');

  await Promise.all([...nonEquities, ...fallbackEquities].map(async symbol => {
    try {
      const d = descriptor(symbol);
      const q = d.type === 'equity' ? await yahooQuote(symbol) : await externalQuote(symbol);
      if (d.type === 'equity') q.name = await resolveEquityName(symbol);
      quoteBySymbol.set(symbol, q);
    } catch (error) {
      const d = descriptor(symbol);
      quoteBySymbol.set(symbol, {
        symbol,
        displaySymbol: d.display || symbol,
        name: d.name || symbol,
        assetType: d.type,
        format: d.format,
        price: null,
        previousClose: null,
        change: null,
        changePct: null,
        source: 'Unavailable',
        error: error.message
      });
    }
  }));

  const quotes = symbols.map(s => quoteBySymbol.get(s)).filter(Boolean);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    quotes,
    serverTime: new Date().toISOString(),
    alpacaConfigured: Boolean(API_KEY && API_SECRET),
    alpacaError
  });
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
  if (range === 'YTD') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = { '1D': 6, '5D': 10, '1M': 40, '3M': 105, '6M': 195, '1Y': 375, '5Y': 1840 }[range] || 6;
  return new Date(now.getTime() - days * 86400000);
}

function decimateBars(bars, maxPoints) {
  if (!maxPoints || bars.length <= maxPoints) return bars;
  const step = Math.ceil(bars.length / maxPoints);
  return bars.filter((_, i) => i % step === 0 || i === bars.length - 1);
}

async function yahooBars(canonical, range) {
  const d = descriptor(canonical);
  const cfg = YAHOO_RANGE[range];
  const result = await yahooChart(d.yahoo || canonical, cfg.range, cfg.interval, true);
  const timestamps = result.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const bars = timestamps.map((ts, i) => ({
    t: new Date(Number(ts) * 1000).toISOString(),
    o: Number(quote.open?.[i]),
    h: Number(quote.high?.[i]),
    l: Number(quote.low?.[i]),
    c: Number(quote.close?.[i]),
    v: Number(quote.volume?.[i])
  })).filter(b => Number.isFinite(b.c));
  return {
    bars,
    source: d.type === 'fx' ? 'Yahoo FX'
      : d.type === 'future' ? 'Yahoo Futures'
      : d.type === 'crypto' ? 'Yahoo Crypto'
      : d.type === 'index' ? 'Yahoo Index'
      : 'Yahoo',
    timeframe: cfg.interval
  };
}

async function fredRateBars(canonical, range) {
  const d = descriptor(canonical);
  const start = rangeStart(range);
  const now = new Date();
  const rows = await fredRows(
    d.fred,
    start.toISOString().slice(0, 10),
    now.toISOString().slice(0, 10)
  );
  const bars = rows.map(r => ({
    t: `${r.date}T12:00:00Z`,
    o: r.value,
    h: r.value,
    l: r.value,
    c: r.value,
    v: null
  }));
  return {
    bars,
    source: canonical === 'SOFR' ? 'New York Fed / FRED' : 'FRED Treasury history',
    timeframe: '1Day'
  };
}

async function alpacaBars(symbol, range) {
  const cfg = ALPACA_RANGE[range];
  const now = new Date();
  const start = cfg.ytd
    ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    : new Date(now.getTime() - cfg.days * 86400000);

  const url = new URL(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, ALPACA_BASE);
  url.searchParams.set('timeframe', cfg.timeframe);
  url.searchParams.set('start', start.toISOString());
  url.searchParams.set('end', now.toISOString());
  url.searchParams.set('adjustment', 'raw');
  url.searchParams.set('feed', 'iex');
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('limit', '10000');

  const data = await alpacaFetch(url);
  const raw = data?.bars || [];
  const bars = raw.map(b => ({
    t: b.t,
    o: Number(b.o),
    h: Number(b.h),
    l: Number(b.l),
    c: Number(b.c),
    v: Number(b.v)
  })).filter(b => Number.isFinite(b.c));
  return { bars: decimateBars(bars, cfg.maxPoints), source: 'Alpaca IEX', timeframe: cfg.timeframe };
}

async function moveBars() {
  const q = await externalQuote('MOVE');
  if (!Number.isFinite(q.price)) throw new Error('MOVE history is unavailable from the public feed.');
  const now = new Date();
  const previous = new Date(now.getTime() - 86400000);
  const prev = Number.isFinite(q.previousClose) ? q.previousClose : q.price;
  return {
    bars: [
      { t: previous.toISOString(), o: prev, h: prev, l: prev, c: prev, v: null },
      { t: now.toISOString(), o: q.price, h: q.price, l: q.price, c: q.price, v: null }
    ],
    source: `${q.source} · current vs previous close`,
    timeframe: '1Day'
  };
}

app.get('/api/bars/:symbol', async (req, res) => {
  const symbol = canonicalizeSymbol(req.params.symbol);
  const range = String(req.query.range || '1D').toUpperCase();
  if (!ALPACA_RANGE[range] || !YAHOO_RANGE[range]) return res.status(400).json({ error: 'Unsupported chart range.' });

  const d = descriptor(symbol);
  try {
    let result;
    if (symbol === 'MOVE') {
      result = await moveBars();
    } else if (d.type === 'rate' && d.fred) {
      result = await fredRateBars(symbol, range);
    } else if (d.type === 'equity') {
      try {
        result = await alpacaBars(symbol, range);
      } catch {
        result = await yahooBars(symbol, range);
      }
    } else {
      result = await yahooBars(symbol, range);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      symbol,
      displaySymbol: d.display || symbol,
      name: d.name || await resolveEquityName(symbol),
      assetType: d.type,
      format: d.format,
      range,
      ...result
    });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Chart request failed.' });
  }
});

app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Shaffer Market Watch v${BUILD_VERSION} listening on ${port}`);
});
