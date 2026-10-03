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
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

const ALPACA_BASE = 'https://data.alpaca.markets';
const API_KEY = process.env.ALPACA_API_KEY_ID;
const API_SECRET = process.env.ALPACA_API_SECRET_KEY;

function ensureCredentials(res) {
  if (!API_KEY || !API_SECRET) {
    res.status(503).json({
      error: 'Market data is not configured. Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY on the server.'
    });
    return false;
  }
  return true;
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
}

function authHeaders() {
  return {
    'APCA-API-KEY-ID': API_KEY,
    'APCA-API-SECRET-KEY': API_SECRET,
    'Accept': 'application/json'
  };
}

async function alpacaFetch(url) {
  const response = await fetch(url, { headers: authHeaders() });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const err = new Error(body?.message || `Alpaca request failed (${response.status})`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

app.get('/api/quotes', async (req, res) => {
  if (!ensureCredentials(res)) return;
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map(normalizeTicker)
    .filter(Boolean)
    .slice(0, 30);
  if (!symbols.length) return res.status(400).json({ error: 'No symbols supplied.' });

  try {
    const url = new URL('/v2/stocks/snapshots', ALPACA_BASE);
    url.searchParams.set('symbols', symbols.join(','));
    url.searchParams.set('feed', 'iex');
    const data = await alpacaFetch(url);

    const quotes = symbols.map((symbol) => {
      const snap = data?.[symbol] || {};
      const latest = Number(snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? snap?.dailyBar?.c);
      const previousClose = Number(snap?.prevDailyBar?.c);
      const dailyOpen = Number(snap?.dailyBar?.o);
      const change = Number.isFinite(latest) && Number.isFinite(previousClose) ? latest - previousClose : null;
      const changePct = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : null;
      return {
        symbol,
        price: Number.isFinite(latest) ? latest : null,
        previousClose: Number.isFinite(previousClose) ? previousClose : null,
        open: Number.isFinite(dailyOpen) ? dailyOpen : null,
        change,
        changePct,
        updatedAt: snap?.latestTrade?.t || snap?.minuteBar?.t || null
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ feed: 'IEX', quotes, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || 'Unable to fetch quotes.' });
  }
});

const RANGE_CONFIG = {
  '1D':  { days: 1,    timeframe: '1Min', maxPoints: 500 },
  '5D':  { days: 7,    timeframe: '5Min', maxPoints: 700 },
  '1M':  { days: 35,   timeframe: '1Hour', maxPoints: 500 },
  '3M':  { days: 100,  timeframe: '1Day', maxPoints: 500 },
  '6M':  { days: 190,  timeframe: '1Day', maxPoints: 500 },
  'YTD': { ytd: true,  timeframe: '1Day', maxPoints: 500 },
  '1Y':  { days: 370,  timeframe: '1Day', maxPoints: 500 },
  '5Y':  { days: 1835, timeframe: '1Day', maxPoints: 1500 }
};

app.get('/api/bars/:symbol', async (req, res) => {
  if (!ensureCredentials(res)) return;
  const symbol = normalizeTicker(req.params.symbol);
  const range = String(req.query.range || '1D').toUpperCase();
  const cfg = RANGE_CONFIG[range];
  if (!symbol || !cfg) return res.status(400).json({ error: 'Invalid symbol or range.' });

  try {
    const now = new Date();
    let start;
    if (cfg.ytd) {
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    } else {
      start = new Date(now.getTime() - cfg.days * 24 * 60 * 60 * 1000);
    }

    const url = new URL(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, ALPACA_BASE);
    url.searchParams.set('timeframe', cfg.timeframe);
    url.searchParams.set('start', start.toISOString());
    url.searchParams.set('end', now.toISOString());
    url.searchParams.set('limit', String(Math.min(cfg.maxPoints, 10000)));
    url.searchParams.set('adjustment', 'split');
    url.searchParams.set('feed', 'iex');
    url.searchParams.set('sort', 'asc');

    const data = await alpacaFetch(url);
    const bars = (data?.bars || []).map((bar) => ({
      t: bar.t,
      o: Number(bar.o),
      h: Number(bar.h),
      l: Number(bar.l),
      c: Number(bar.c),
      v: Number(bar.v)
    }));

    res.setHeader('Cache-Control', range === '1D' || range === '5D' ? 'no-store' : 'private, max-age=20');
    res.json({ symbol, range, timeframe: cfg.timeframe, feed: 'IEX', bars });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || 'Unable to fetch chart data.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: Boolean(API_KEY && API_SECRET), time: new Date().toISOString() });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Tablet Market Watcher listening on port ${port}`);
});
