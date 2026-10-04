const DEFAULT_WATCHLIST = [
  '^GSPC', '^NDX', '^DJI', 'VTI', 'EEM', 'ACWI', '^VIX',
  'US2Y', 'US10Y', 'US30Y', 'MOVE',
  'CL=F', 'GC=F', 'SOFR', 'DX-Y.NYB', 'BTC-USD',
  'USDJPY=X', 'GBPUSD=X', 'EURUSD=X',
  'SMH', 'XLF', 'XLE', 'XAR', 'XLI', 'XLV', 'XLY', 'XLP', 'XLC', 'XLU', 'XLRE', 'CIBR'
];

const BUILD_VERSION = '4.0.0';
const STORAGE_KEY = 'tablet-market-watcher-symbols-v4';
const MAX_SYMBOLS = 40;
const QUOTE_REFRESH_MS = 10000;
const CHART_REFRESH_MS = 20000;

const $ = (id) => document.getElementById(id);
const els = {
  watchScreen: $('watchScreen'),
  chartScreen: $('chartScreen'),
  watchlist: $('watchlist'),
  emptyState: $('emptyState'),
  feedStatus: $('feedStatus'),
  feedDot: $('feedDot'),
  lastRefresh: $('lastRefresh'),
  settingsBtn: $('settingsBtn'),
  settingsPanel: $('settingsPanel'),
  closeSettings: $('closeSettings'),
  addForm: $('addForm'),
  tickerInput: $('tickerInput'),
  settingsList: $('settingsList'),
  emptyAddBtn: $('emptyAddBtn'),
  wakeBtn: $('wakeBtn'),
  backBtn: $('backBtn'),
  chartSymbol: $('chartSymbol'),
  chartFeed: $('chartFeed'),
  chartPrice: $('chartPrice'),
  chartChange: $('chartChange'),
  rangeBar: $('rangeBar'),
  chartCanvas: $('chartCanvas'),
  chartTooltip: $('chartTooltip'),
  chartLoader: $('chartLoader'),
  clock: $('clock'),
  date: $('date')
};

const ALIASES = {
  '2Y': 'US2Y', 'UST2Y': 'US2Y', '10Y': 'US10Y', 'UST10Y': 'US10Y', '30Y': 'US30Y', 'UST30Y': 'US30Y',
  'USDJPY': 'USDJPY=X', 'USD/JPY': 'USDJPY=X',
  'EURUSD': 'EURUSD=X', 'EUR/USD': 'EURUSD=X',
  'GBPUSD': 'GBPUSD=X', 'GBP/USD': 'GBPUSD=X',
  'USDJPYX': 'USDJPY=X', 'EURUSDX': 'EURUSD=X', 'GBPUSDX': 'GBPUSD=X',
  'WTI': 'CL=F', 'OIL': 'CL=F', 'CL': 'CL=F', 'CLF': 'CL=F',
  'GOLD': 'GC=F', 'GC': 'GC=F', 'GCF': 'GC=F',
  'SPX': '^GSPC', 'DOW': '^DJI', 'DJI': '^DJI', 'NASDAQ': '^IXIC', 'NDX': '^NDX', 'RUT': '^RUT', 'VIX': '^VIX',
  'DXY': 'DX-Y.NYB', 'DXYNYB': 'DX-Y.NYB', 'DXY.NYB': 'DX-Y.NYB',
  'BTC': 'BTC-USD', 'BITCOIN': 'BTC-USD',
  'MOVE': 'MOVE', 'SOFR': 'SOFR'
};

let symbols = loadSymbols();
let quoteMap = new Map();
let quoteTimer = null;
let activeSymbol = null;
let activeRange = '1D';
let activeChartMeta = null;
let chartBars = [];
let chartTimer = null;
let chartAbort = null;
let wakeLock = null;
let pointerIndex = null;

function cleanTicker(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (ALIASES[raw]) return ALIASES[raw];
  return raw.replace(/[^A-Z0-9.^=\-\/]/g, '').slice(0, 20);
}

function loadSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) {
      return [...new Set(saved.map(cleanTicker).filter(Boolean))].slice(0, MAX_SYMBOLS);
    }
  } catch {}
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WATCHLIST));
  return [...DEFAULT_WATCHLIST];
}

function saveSymbols() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
}

function formatValue(value, meta = {}) {
  if (!Number.isFinite(value)) return '—';
  if (meta.format === 'percent' || meta.assetType === 'rate') return `${value.toFixed(3)}%`;
  if (meta.format === 'fx' || meta.assetType === 'fx') return value >= 100 ? value.toFixed(3) : value.toFixed(5);
  if (meta.format === 'number' || meta.assetType === 'index') {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
  const digits = Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: digits
  }).format(value);
}

function signed(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function changeParts(q) {
  if (!q) return { primary: '—', detail: '—' };
  if (q.assetType === 'rate') {
    const bp = Number.isFinite(q.change) ? q.change * 100 : null;
    return {
      primary: Number.isFinite(bp) ? `${signed(bp, 1)} bp` : '—',
      detail: Number.isFinite(q.changePct) ? `${signed(q.changePct, 2)}% vs prior` : '—'
    };
  }

  const primary = Number.isFinite(q.changePct) ? `${signed(q.changePct, 2)}%` : '—';
  let detail = '—';
  if (Number.isFinite(q.change)) {
    if (q.assetType === 'fx') detail = `${signed(q.change, q.price >= 100 ? 3 : 5)} today`;
    else if (q.assetType === 'index') detail = `${signed(q.change, 2)} today`;
    else detail = `${q.change > 0 ? '+' : ''}${formatValue(q.change, q)} today`;
  }
  return { primary, detail };
}

function updateClock() {
  const now = new Date();
  els.clock.textContent = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(now);
  els.date.textContent = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(now) + ' · ET';
}

function moveSymbol(index, delta) {
  const next = index + delta;
  if (index < 0 || next < 0 || next >= symbols.length) return;
  [symbols[index], symbols[next]] = [symbols[next], symbols[index]];
  saveSymbols();
  renderWatchlist();
  renderSettings();
}

function renderWatchlist() {
  els.emptyState.classList.toggle('hidden', symbols.length > 0);
  els.watchlist.classList.toggle('hidden', symbols.length === 0);

  els.watchlist.innerHTML = symbols.map((symbol, index) => {
    const q = quoteMap.get(symbol);
    const direction = q?.change > 0 ? 'positive' : q?.change < 0 ? 'negative' : '';
    const parts = changeParts(q);
    return `
      <div class="watch-row ${q ? '' : 'skeleton'}" data-symbol="${symbol}" tabindex="0" role="button" aria-label="Open ${q?.name || symbol} chart">
        <div class="security-block">
          <div class="symbol">${q?.displaySymbol || symbol}</div>
          <div class="subtext">${q?.name || 'Loading security…'}</div>
        </div>
        <div class="price">${q ? formatValue(q.price, q) : 'Loading…'}</div>
        <div class="change ${direction}">${parts.primary}<span class="change-detail">${parts.detail}</span></div>
        <div class="order-controls" aria-label="Reorder ${q?.displaySymbol || symbol}">
          <button class="order-button" type="button" data-move="-1" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="order-button" type="button" data-move="1" data-index="${index}" ${index === symbols.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        </div>
      </div>`;
  }).join('');

  els.watchlist.querySelectorAll('.watch-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (!e.target.closest('.order-controls')) openChart(row.dataset.symbol);
    });
    row.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.order-controls')) {
        e.preventDefault();
        openChart(row.dataset.symbol);
      }
    });
  });

  els.watchlist.querySelectorAll('.order-button').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      moveSymbol(Number(button.dataset.index), Number(button.dataset.move));
    });
  });
}

function renderSettings() {
  els.settingsList.innerHTML = symbols.length ? symbols.map(symbol => {
    const q = quoteMap.get(symbol);
    return `<div class="settings-item"><div><strong>${q?.displaySymbol || symbol}</strong><span class="settings-name">${q?.name || ''}</span></div><button class="remove-button" data-remove="${symbol}">Remove</button></div>`;
  }).join('') : '<div class="settings-item muted">No symbols yet.</div>';

  els.settingsList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      symbols = symbols.filter(s => s !== btn.dataset.remove);
      quoteMap.delete(btn.dataset.remove);
      saveSymbols();
      renderSettings();
      renderWatchlist();
      fetchQuotes();
    });
  });
}

async function fetchQuotes() {
  if (!symbols.length) return;
  try {
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Quote request failed');

    for (const q of data.quotes || []) quoteMap.set(q.symbol, q);

    els.feedDot.className = 'status-dot live';
    const unavailable = (data.quotes || []).filter(q => !Number.isFinite(q.price)).length;
    els.feedStatus.textContent = unavailable
      ? `Multi-asset feed · ${unavailable} unavailable`
      : `Multi-asset feed · ${symbols.length} symbols`;
    els.lastRefresh.textContent = `Updated ${new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date())}`;
    renderWatchlist();
    syncChartQuote();
  } catch (err) {
    els.feedDot.className = 'status-dot error';
    els.feedStatus.textContent = err.message;
    console.error(err);
  }
}

function syncChartQuote() {
  if (!activeSymbol) return;
  const q = quoteMap.get(activeSymbol);
  if (!q) return;
  els.chartSymbol.textContent = q.displaySymbol || activeSymbol;
  els.chartFeed.textContent = `${q.name} · ${q.source || 'Market data'}`;
  els.chartPrice.textContent = formatValue(q.price, q);
  const parts = changeParts(q);
  els.chartChange.textContent = q.assetType === 'rate'
    ? `${parts.primary} · ${parts.detail}`
    : `${parts.primary} · ${parts.detail.replace(' today', '')}`;
  els.chartChange.className = `chart-change ${q.change > 0 ? 'positive' : q.change < 0 ? 'negative' : ''}`;
}

function openChart(symbol) {
  activeSymbol = symbol;
  activeRange = '1D';
  pointerIndex = null;
  activeChartMeta = quoteMap.get(symbol) || null;
  els.watchScreen.classList.remove('active');
  els.chartScreen.classList.add('active');
  document.querySelectorAll('.range').forEach(btn => btn.classList.toggle('active', btn.dataset.range === activeRange));
  syncChartQuote();
  loadChart();
  clearInterval(chartTimer);
  chartTimer = setInterval(() => {
    if (['1D', '5D'].includes(activeRange)) loadChart(true);
  }, CHART_REFRESH_MS);
}

function closeChart() {
  activeSymbol = null;
  activeChartMeta = null;
  chartBars = [];
  pointerIndex = null;
  chartAbort?.abort();
  clearInterval(chartTimer);
  chartTimer = null;
  els.chartScreen.classList.remove('active');
  els.watchScreen.classList.add('active');
  els.chartTooltip.classList.add('hidden');
}

async function loadChart(silent = false) {
  if (!activeSymbol) return;
  chartAbort?.abort();
  chartAbort = new AbortController();
  if (!silent) {
    els.chartLoader.textContent = 'Loading chart…';
    els.chartLoader.classList.remove('hidden');
  }

  try {
    const response = await fetch(`/api/bars/${encodeURIComponent(activeSymbol)}?range=${encodeURIComponent(activeRange)}`, {
      cache: 'no-store',
      signal: chartAbort.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Chart request failed');

    chartBars = (data.bars || []).filter(b => Number.isFinite(b.c));
    activeChartMeta = { ...(quoteMap.get(activeSymbol) || {}), ...data };
    if (data.source) els.chartFeed.textContent = `${activeChartMeta.name || activeSymbol} · ${data.source}`;
    drawChart();

    if (!chartBars.length) {
      els.chartLoader.textContent = 'No chart data returned for this range.';
      els.chartLoader.classList.remove('hidden');
    } else {
      els.chartLoader.classList.add('hidden');
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    els.chartLoader.textContent = err.message;
    els.chartLoader.classList.remove('hidden');
    console.error(err);
  }
}

function resizeCanvas() {
  const rect = els.chartCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (els.chartCanvas.width !== width || els.chartCanvas.height !== height) {
    els.chartCanvas.width = width;
    els.chartCanvas.height = height;
  }
  return { width, height, dpr };
}

function axisValue(value) {
  if (activeChartMeta?.assetType === 'rate') return `${value.toFixed(2)}%`;
  if (activeChartMeta?.assetType === 'fx') return value >= 100 ? value.toFixed(2) : value.toFixed(4);
  if (activeChartMeta?.assetType === 'crypto') return `$${Math.round(value).toLocaleString()}`;
  return value >= 1000 ? value.toFixed(0) : value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

function drawChart() {
  const { width, height, dpr } = resizeCanvas();
  const ctx = els.chartCanvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (!chartBars.length) return;

  const pad = { l: 20 * dpr, r: 70 * dpr, t: 24 * dpr, b: 34 * dpr };
  const innerW = Math.max(1, width - pad.l - pad.r);
  const innerH = Math.max(1, height - pad.t - pad.b);
  const values = chartBars.map(b => b.c).filter(Number.isFinite);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * .01, 1);
  min -= spread * .08;
  max += spread * .08;

  const xFor = (i) => pad.l + (chartBars.length === 1 ? innerW / 2 : (i / (chartBars.length - 1)) * innerW);
  const yFor = (v) => pad.t + (1 - (v - min) / (max - min)) * innerH;

  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1 * dpr;
  ctx.fillStyle = 'rgba(205,212,223,.62)';
  ctx.font = `${11 * dpr}px system-ui`;
  ctx.textAlign = 'left';

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * innerH;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();
    const value = max - (i / 4) * (max - min);
    ctx.fillText(axisValue(value), width - pad.r + 9 * dpr, y + 4 * dpr);
  }

  const first = values[0];
  const last = values.at(-1);
  const lineColor = last >= first ? '#34d399' : '#fb7185';

  ctx.beginPath();
  chartBars.forEach((bar, i) => {
    const x = xFor(i);
    const y = yFor(bar.c);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.2 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.lineTo(xFor(chartBars.length - 1), pad.t + innerH);
  ctx.lineTo(xFor(0), pad.t + innerH);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, pad.t, 0, pad.t + innerH);
  gradient.addColorStop(0, last >= first ? 'rgba(52,211,153,.17)' : 'rgba(251,113,133,.17)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fill();

  if (pointerIndex != null && chartBars[pointerIndex]) {
    const bar = chartBars[pointerIndex];
    const x = xFor(pointerIndex);
    const y = yFor(bar.c);
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + innerH);
    ctx.stroke();
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function pointerToIndex(e) {
  if (!chartBars.length) return null;
  const rect = els.chartCanvas.getBoundingClientRect();
  const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
  return Math.max(0, Math.min(chartBars.length - 1, Math.round((x / rect.width) * (chartBars.length - 1))));
}

function showTooltip(e) {
  const index = pointerToIndex(e);
  if (index == null) return;
  pointerIndex = index;
  drawChart();
  const bar = chartBars[index];
  const rect = els.chartCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dt = new Date(bar.t);
  const dateLabel = activeRange === '1D' || activeRange === '5D'
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(dt)
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(dt);
  els.chartTooltip.innerHTML = `<strong>${formatValue(bar.c, activeChartMeta || {})}</strong>${dateLabel}`;
  els.chartTooltip.style.left = `${Math.min(rect.width - 70, Math.max(70, x))}px`;
  els.chartTooltip.style.top = `${Math.min(rect.height - 15, Math.max(65, y))}px`;
  els.chartTooltip.classList.remove('hidden');
}

function hideTooltip() {
  pointerIndex = null;
  els.chartTooltip.classList.add('hidden');
  drawChart();
}

els.settingsBtn.addEventListener('click', () => {
  renderSettings();
  els.settingsPanel.classList.remove('hidden');
});
els.closeSettings.addEventListener('click', () => els.settingsPanel.classList.add('hidden'));
els.settingsPanel.addEventListener('click', e => {
  if (e.target === els.settingsPanel) els.settingsPanel.classList.add('hidden');
});
els.emptyAddBtn.addEventListener('click', () => {
  renderSettings();
  els.settingsPanel.classList.remove('hidden');
  els.tickerInput.focus();
});
els.addForm.addEventListener('submit', e => {
  e.preventDefault();
  const symbol = cleanTicker(els.tickerInput.value);
  if (!symbol || symbols.includes(symbol)) {
    els.tickerInput.value = '';
    return;
  }
  if (symbols.length >= MAX_SYMBOLS) {
    els.feedStatus.textContent = `Watchlist limit is ${MAX_SYMBOLS} symbols.`;
    return;
  }
  symbols.push(symbol);
  saveSymbols();
  els.tickerInput.value = '';
  renderSettings();
  renderWatchlist();
  fetchQuotes();
});
els.backBtn.addEventListener('click', closeChart);
els.rangeBar.querySelectorAll('.range').forEach(btn => {
  btn.addEventListener('click', () => {
    activeRange = btn.dataset.range;
    pointerIndex = null;
    els.chartTooltip.classList.add('hidden');
    els.rangeBar.querySelectorAll('.range').forEach(b => b.classList.toggle('active', b === btn));
    loadChart();
  });
});
els.chartCanvas.addEventListener('pointermove', showTooltip);
els.chartCanvas.addEventListener('pointerdown', showTooltip);
els.chartCanvas.addEventListener('pointerleave', hideTooltip);
window.addEventListener('resize', drawChart);
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!els.settingsPanel.classList.contains('hidden')) els.settingsPanel.classList.add('hidden');
    else if (activeSymbol) closeChart();
  }
});

els.wakeBtn.addEventListener('click', async () => {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
      els.wakeBtn.textContent = 'Keep screen awake';
    } else {
      if (!('wakeLock' in navigator)) throw new Error('Screen Wake Lock is not supported in this browser.');
      wakeLock = await navigator.wakeLock.request('screen');
      els.wakeBtn.textContent = 'Screen will stay awake';
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        els.wakeBtn.textContent = 'Keep screen awake';
      });
    }
  } catch (err) {
    els.wakeBtn.textContent = err.message;
  }
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !wakeLock && els.wakeBtn.textContent === 'Screen will stay awake') {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
});

async function verifyBuildVersion() {
  try {
    const response = await fetch('/api/version', { cache: 'no-store' });
    const data = await response.json();
    if (data.version && data.version !== BUILD_VERSION) {
      const key = `reload-${BUILD_VERSION}-${data.version}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        location.reload();
      }
    }
    const badge = document.getElementById('buildVersion');
    if (badge) badge.textContent = `v${data.version || BUILD_VERSION}`;
  } catch {
    const badge = document.getElementById('buildVersion');
    if (badge) badge.textContent = `v${BUILD_VERSION}`;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`/sw.js?v=${BUILD_VERSION}`, { updateViaCache: 'none' })
    .then(reg => reg.update())
    .catch(console.error);
}

renderWatchlist();
updateClock();
setInterval(updateClock, 1000);
verifyBuildVersion();
fetchQuotes();
quoteTimer = setInterval(fetchQuotes, QUOTE_REFRESH_MS);
