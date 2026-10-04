import express from 'express';

const VERSION = '8.0.0';
const nativeFetch = globalThis.fetch.bind(globalThis);
const originalJson = express.response.json;

// Keep the existing v7 server implementation but report the v8 build from /api/version.
express.response.json = function patchedJson(body) {
  if (body && typeof body === 'object' && body.version === '7.0.0' && body.maxSymbols === 60) {
    body = { ...body, version: VERSION };
  }
  return originalJson.call(this, body);
};

function rawNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function adjustYahooSplits(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result) return payload;

  const splitList = Object.values(result?.events?.splits || {}).map(event => {
    const t = Number(event?.date) * 1000;
    let ratio = null;
    const numerator = rawNum(event?.numerator);
    const denominator = rawNum(event?.denominator);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      ratio = numerator / denominator;
    } else {
      const parts = String(event?.splitRatio || '').split(':').map(Number);
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[1] !== 0) {
        ratio = parts[0] / parts[1];
      }
    }
    return { t, ratio };
  }).filter(x => Number.isFinite(x.t) && Number.isFinite(x.ratio) && x.ratio > 0 && x.ratio !== 1);

  if (!splitList.length) return payload;

  const timestamps = result.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) return payload;

  const factorAt = t => splitList.reduce((factor, split) => t < split.t ? factor * split.ratio : factor, 1);
  for (let i = 0; i < timestamps.length; i++) {
    const factor = factorAt(Number(timestamps[i]) * 1000);
    if (!Number.isFinite(factor) || factor === 1) continue;
    for (const field of ['open', 'high', 'low', 'close']) {
      const value = rawNum(quote?.[field]?.[i]);
      if (Number.isFinite(value)) quote[field][i] = value / factor;
    }
  }
  return payload;
}

globalThis.fetch = async function v8Fetch(input, init = {}) {
  let url;
  try {
    url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  } catch {
    return nativeFetch(input, init);
  }

  // Alpaca supports split-adjusted bars directly. v7 requested raw bars; v8 upgrades them.
  if (url.hostname === 'data.alpaca.markets' && url.pathname.includes('/bars')) {
    if (url.searchParams.get('adjustment') === 'raw') url.searchParams.set('adjustment', 'split');
    const nextInput = input instanceof Request ? new Request(url.toString(), input) : url;
    return nativeFetch(nextInput, init);
  }

  // Yahoo is the fallback path. Ask for split events and normalize pre-split OHLC onto today's share basis.
  if (url.hostname === 'query1.finance.yahoo.com' && url.pathname.includes('/v8/finance/chart/')) {
    url.searchParams.set('events', 'splits');
    const response = await nativeFetch(url, init);
    if (!response.ok) return response;
    const text = await response.text();
    try {
      const payload = adjustYahooSplits(JSON.parse(text));
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      });
    } catch {
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      });
    }
  }

  return nativeFetch(input, init);
};

await import('./server-v7.js');
